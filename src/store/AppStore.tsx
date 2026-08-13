import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { applyCoachAction, completeWorkout } from '../domain/coach';
import { parseAndMigrateState } from '../domain/migration';
import { HydrationStatus, shouldPersistState } from '../domain/persistence';
import { createInitialProtocol, createInitialState } from '../domain/protocol';
import {
  configureSchedule,
  createSchedule,
  nextReminderOccurrence,
  reconcileSchedule,
  startOccurrence,
  toLocalDate,
} from '../domain/schedule';
import {
  AppState,
  Baseline,
  CompletionResult,
  DecisionReason,
  SetFeedback,
  UserProfile,
  Weekday,
  WorkoutVariant,
} from '../domain/types';
import { expoReminder } from '../notifications/expoReminder';

// Klucz pozostaje stabilny, aby aktualizacja z M1 odnalazła istniejące dane.
const STORAGE_KEY = '@motivaition/app-state/v1';

interface AppStoreValue {
  state: AppState;
  hydrationStatus: HydrationStatus;
  persistenceMessage?: string;
  retryHydration: () => void;
  startFreshAfterReadError: () => Promise<void>;
  updateOnboardingDraft: (draft: Partial<UserProfile>) => void;
  finishSetup: (profile: UserProfile, baseline: Baseline) => void;
  saveSchedule: (
    weekdays: Weekday[],
    localTime: string,
    enableReminder: boolean,
  ) => Promise<void>;
  prepareToday: () => void;
  chooseWorkout: (variant: WorkoutVariant) => boolean;
  rescheduleToday: (reason: DecisionReason) => void;
  skipToday: (reason: DecisionReason) => void;
  recordSet: (
    exerciseIndex: number,
    setIndex: number,
    feedback: SetFeedback,
  ) => void;
  finishWorkout: () => CompletionResult | undefined;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('loading');
  const [persistenceMessage, setPersistenceMessage] = useState<string>();
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const dirtyRef = useRef(false);
  const unreadablePayloadRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      let serialized: string | null = null;
      try {
        serialized = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active) return;
        if (serialized) {
          const parsed: unknown = JSON.parse(serialized);
          const hydrated = parseAndMigrateState(parsed);
          if ((parsed as { schemaVersion?: unknown }).schemaVersion === 1) {
            dirtyRef.current = true;
          }
          setState(hydrated);
        }
        unreadablePayloadRef.current = null;
        setPersistenceMessage(undefined);
        setHydrationStatus('ready');
      } catch {
        if (!active) return;
        unreadablePayloadRef.current = serialized;
        setHydrationStatus('read_error');
        setPersistenceMessage(
          'Nie udało się bezpiecznie otworzyć lokalnych danych. Zapis jest zablokowany.',
        );
      }
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, [hydrationAttempt]);

  useEffect(() => {
    if (!shouldPersistState(hydrationStatus, dirtyRef.current)) return;
    dirtyRef.current = false;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      dirtyRef.current = true;
      setPersistenceMessage(
        'Zmiany są widoczne, ale nie udało się ich zapisać na urządzeniu.',
      );
    });
  }, [hydrationStatus, state]);

  const retryHydration = useCallback(() => {
    dirtyRef.current = false;
    setHydrationStatus('loading');
    setPersistenceMessage(undefined);
    setHydrationAttempt((current) => current + 1);
  }, []);

  const startFreshAfterReadError = useCallback(async () => {
    if (hydrationStatus !== 'read_error') return;
    try {
      const unreadablePayload = unreadablePayloadRef.current;
      if (unreadablePayload !== null) {
        const backupKey = `@motivaition/app-state/recovery/${Date.now()}`;
        await AsyncStorage.setItem(backupKey, unreadablePayload);
      }
      dirtyRef.current = true;
      setState(createInitialState());
      setHydrationStatus('ready');
      setPersistenceMessage(
        unreadablePayload === null
          ? 'Rozpoczęto nowy lokalny profil.'
          : 'Rozpoczęto nowy profil. Poprzednie dane zachowano w lokalnej kopii odzyskiwania.',
      );
    } catch {
      setPersistenceMessage(
        'Nie udało się zachować kopii danych. Poprzedni zapis nadal nie został zmieniony.',
      );
    }
  }, [hydrationStatus]);

  const mutate = useCallback((recipe: (current: AppState) => AppState) => {
    if (hydrationStatus !== 'ready') return;
    dirtyRef.current = true;
    setState(recipe);
  }, [hydrationStatus]);

  useEffect(() => {
    if (hydrationStatus !== 'ready') return;
    const target = nextReminderOccurrence(state);
    const existingId = state.reminders.notificationId;
    const targetCanBeScheduled = Boolean(
      state.reminders.enabled &&
        state.reminders.permission === 'granted' &&
        target &&
        target.status === 'scheduled' &&
        new Date(target.scheduledAt).getTime() > Date.now(),
    );
    const existingIsCurrent =
      existingId &&
      state.reminders.occurrenceId === target?.id &&
      state.reminders.scheduledAt === target?.scheduledAt &&
      targetCanBeScheduled;
    if (existingIsCurrent || (!existingId && !targetCanBeScheduled)) return;

    let active = true;
    async function syncReminder() {
      try {
        if (existingId) await expoReminder.cancel(existingId);
        const notificationId =
          target && targetCanBeScheduled ? await expoReminder.schedule(target) : undefined;
        if (!active) {
          if (notificationId) await expoReminder.cancel(notificationId);
          return;
        }
        mutate((current) => ({
          ...current,
          reminders: {
            ...current.reminders,
            notificationId,
            occurrenceId: notificationId ? target?.id : undefined,
            scheduledAt: notificationId ? target?.scheduledAt : undefined,
          },
        }));
      } catch {
        if (active) {
          setPersistenceMessage(
            'Plan jest zapisany, ale nie udało się odświeżyć przypomnienia.',
          );
        }
      }
    }
    void syncReminder();
    return () => {
      active = false;
    };
  }, [hydrationStatus, mutate, state]);

  const updateOnboardingDraft = useCallback(
    (draft: Partial<UserProfile>) => {
      mutate((current) => ({
        ...current,
        onboardingDraft: { ...current.onboardingDraft, ...draft },
      }));
    },
    [mutate],
  );

  const finishSetup = useCallback(
    (profile: UserProfile, baseline: Baseline) => {
      mutate((current) => ({
        ...current,
        onboardingDraft: {},
        profile,
        baseline,
        protocols: [createInitialProtocol(profile, baseline)],
      }));
    },
    [mutate],
  );

  const saveSchedule = useCallback(
    async (weekdays: Weekday[], localTime: string, enableReminder: boolean) => {
      let permission: AppState['reminders']['permission'] = 'unknown';
      if (enableReminder) {
        try {
          permission = await expoReminder.requestPermission();
        } catch {
          permission = 'denied';
        }
      }
      const now = new Date();
      const schedule = createSchedule(weekdays, localTime, now);
      mutate((current) => ({
        ...configureSchedule(current, schedule, now),
        reminders: {
          ...current.reminders,
          enabled: enableReminder && permission === 'granted',
          permission,
        },
      }));
      if (enableReminder && permission !== 'granted') {
        setPersistenceMessage(
          'Harmonogram zapisany. Przypomnienia są wyłączone — możesz nadal korzystać z całej aplikacji.',
        );
      }
    },
    [mutate],
  );

  const prepareToday = useCallback(() => {
    mutate((current) => reconcileSchedule(current));
  }, [mutate]);

  const chooseWorkout = useCallback(
    (variant: WorkoutVariant) => {
      const occurrence = state.occurrences.find(
        (candidate) =>
          candidate.status === 'in_progress' ||
          (candidate.status === 'scheduled' &&
            candidate.localDate === toLocalDate(new Date())),
      );
      if (!occurrence) return false;
      mutate((current) =>
        variant === 'minimum'
          ? applyCoachAction(current, {
              type: 'choose_minimum_workout',
              occurrenceId: occurrence.id,
              reason: occurrence.recommendedVariant ? 'recovery' : 'low_energy',
            })
          : startOccurrence(current, occurrence.id, 'standard'),
      );
      return true;
    },
    [mutate, state.occurrences],
  );

  const rescheduleToday = useCallback(
    (reason: DecisionReason) => {
      mutate((current) => {
        const occurrence = current.occurrences.find(
          (candidate) =>
            candidate.status === 'scheduled' &&
            candidate.localDate === toLocalDate(new Date()),
        );
        return occurrence
          ? applyCoachAction(current, {
              type: 'reschedule_workout_occurrence',
              occurrenceId: occurrence.id,
              reason,
            })
          : current;
      });
    },
    [mutate],
  );

  const skipToday = useCallback(
    (reason: DecisionReason) => {
      mutate((current) => {
        const occurrence = current.occurrences.find(
          (candidate) =>
            candidate.status === 'scheduled' &&
            candidate.localDate === toLocalDate(new Date()),
        );
        return occurrence
          ? applyCoachAction(current, {
              type: 'skip_workout_occurrence',
              occurrenceId: occurrence.id,
              reason,
            })
          : current;
      });
    },
    [mutate],
  );

  const recordSet = useCallback(
    (exerciseIndex: number, setIndex: number, feedback: SetFeedback) => {
      mutate((current) => {
        if (!current.todayWorkout) return current;
        const exercise = current.todayWorkout.exercises[exerciseIndex];
        const workoutSet = exercise?.sets[setIndex];
        if (!exercise || !workoutSet || workoutSet.completedAt) return current;
        return {
          ...current,
          todayWorkout: {
            ...current.todayWorkout,
            status: 'in_progress',
            exercises: current.todayWorkout.exercises.map(
              (candidate, currentExerciseIndex) =>
                currentExerciseIndex !== exerciseIndex
                  ? candidate
                  : {
                      ...candidate,
                      sets: candidate.sets.map((candidateSet, currentSetIndex) =>
                        currentSetIndex !== setIndex
                          ? candidateSet
                          : {
                              ...candidateSet,
                              feedback,
                              completedAt: new Date().toISOString(),
                            },
                      ),
                    },
            ),
          },
        };
      });
    },
    [mutate],
  );

  const finishWorkout = useCallback(() => {
    if (!state.todayWorkout) return undefined;
    const result = completeWorkout(state);
    if (!result) return undefined;
    dirtyRef.current = true;
    setState(result.state);
    return result;
  }, [state]);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      hydrationStatus,
      persistenceMessage,
      retryHydration,
      startFreshAfterReadError,
      updateOnboardingDraft,
      finishSetup,
      saveSchedule,
      prepareToday,
      chooseWorkout,
      rescheduleToday,
      skipToday,
      recordSet,
      finishWorkout,
    }),
    [
      state,
      hydrationStatus,
      persistenceMessage,
      retryHydration,
      startFreshAfterReadError,
      updateOnboardingDraft,
      finishSetup,
      saveSchedule,
      prepareToday,
      chooseWorkout,
      rescheduleToday,
      skipToday,
      recordSet,
      finishWorkout,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore requires AppStoreProvider.');
  return value;
}
