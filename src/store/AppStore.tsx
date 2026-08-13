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
import {
  decideCoachProposal,
  recordCoachProposalOutcomes,
  storeCoachProposal,
} from '../coach/proposals';
import { remoteCoach as remoteCoachAdapter } from '../coach/remoteCoach';
import { resolveCoachProposal } from '../coach/service';
import {
  markTelemetryAttemptFailed,
  markTelemetryDelivered,
  reconcileTelemetryOutbox,
} from '../coach/telemetry';
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
  coachRequestStatus: 'idle' | 'loading' | 'error';
  coachRequestMessage?: string;
  remoteCoachConfigured: boolean;
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
  setRemoteCoachConsent: (enabled: boolean) => Promise<void>;
  connectRemoteCoach: (accessCode: string) => Promise<boolean>;
  requestCoachProposal: () => Promise<void>;
  markRemoteCoachRevoked: () => void;
  applyCoachProposal: (proposalId: string) => void;
  rejectCoachProposal: (proposalId: string) => void;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('loading');
  const [persistenceMessage, setPersistenceMessage] = useState<string>();
  const [coachRequestStatus, setCoachRequestStatus] = useState<
    AppStoreValue['coachRequestStatus']
  >('idle');
  const [coachRequestMessage, setCoachRequestMessage] = useState<string>();
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [telemetryRetryTick, setTelemetryRetryTick] = useState(0);
  const dirtyRef = useRef(false);
  const unreadablePayloadRef = useRef<string | null>(null);
  const telemetryInFlightRef = useRef(new Set<string>());
  const remoteRequestsAllowedRef = useRef(false);
  const remoteRequestGenerationRef = useRef(0);

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
          const reconciled = reconcileTelemetryOutbox(hydrated);
          remoteRequestsAllowedRef.current =
            reconciled.remoteCoach.mode === 'enabled';
          if (
            (parsed as { schemaVersion?: unknown }).schemaVersion !== 3 ||
            reconciled !== hydrated
          ) {
            dirtyRef.current = true;
          }
          setState(reconciled);
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

  const mutate = useCallback(
    (recipe: (current: AppState) => AppState) => {
      if (hydrationStatus !== 'ready') return;
      dirtyRef.current = true;
      setState((current) =>
        reconcileTelemetryOutbox(recordCoachProposalOutcomes(recipe(current))),
      );
    },
    [hydrationStatus],
  );

  useEffect(() => {
    if (hydrationStatus !== 'ready') return;
    let active = true;
    remoteCoachAdapter
      .hasInstallation()
      .then((installed) => {
        if (!active) return;
        mutate((current) => {
          const installationStatus = installed ? 'active' : 'missing';
          return current.remoteCoach.installationStatus === installationStatus
            ? current
            : {
                ...current,
                remoteCoach: { ...current.remoteCoach, installationStatus },
              };
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hydrationStatus, mutate]);

  useEffect(() => {
    if (
      hydrationStatus !== 'ready' ||
      state.remoteCoach.mode !== 'enabled' ||
      state.remoteCoach.installationStatus !== 'active' ||
      !remoteRequestsAllowedRef.current ||
      !remoteCoachAdapter.isConfigured()
    ) return;
    const now = Date.now();
    let nearestRetryAt: number | undefined;
    for (const event of state.remoteCoach.telemetryOutbox) {
      const retryAt = event.nextAttemptAt ? Date.parse(event.nextAttemptAt) : 0;
      if (retryAt > now) {
        nearestRetryAt = Math.min(nearestRetryAt ?? retryAt, retryAt);
        continue;
      }
      if (telemetryInFlightRef.current.has(event.eventId)) continue;
      const requestGeneration = remoteRequestGenerationRef.current;
      telemetryInFlightRef.current.add(event.eventId);
      void remoteCoachAdapter.recordEvent({
        proposalId: event.proposalId,
        requestId: event.requestId,
        decision: event.decision,
        ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
      }).then(() => {
        telemetryInFlightRef.current.delete(event.eventId);
        if (
          !remoteRequestsAllowedRef.current ||
          requestGeneration !== remoteRequestGenerationRef.current
        ) return;
        mutate((current) => markTelemetryDelivered(current, event.eventId));
      }).catch(() => {
        telemetryInFlightRef.current.delete(event.eventId);
        if (
          !remoteRequestsAllowedRef.current ||
          requestGeneration !== remoteRequestGenerationRef.current
        ) return;
        mutate((current) => markTelemetryAttemptFailed(current, event.eventId));
      });
    }
    if (nearestRetryAt === undefined) return;
    const timer = setTimeout(
      () => setTelemetryRetryTick((current) => current + 1),
      Math.max(1_000, nearestRetryAt - now),
    );
    return () => clearTimeout(timer);
  }, [hydrationStatus, mutate, state.remoteCoach, telemetryRetryTick]);

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
    setState(reconcileTelemetryOutbox(recordCoachProposalOutcomes(result.state)));
    return result;
  }, [state]);

  const setRemoteCoachConsent = useCallback(
    async (enabled: boolean) => {
      setCoachRequestStatus('loading');
      setCoachRequestMessage(undefined);
      if (!enabled) {
        remoteRequestsAllowedRef.current = false;
        remoteRequestGenerationRef.current += 1;
        remoteCoachAdapter.cancelPending();
        telemetryInFlightRef.current.clear();
        mutate((current) => ({
          ...current,
          remoteCoach: {
            ...current.remoteCoach,
            mode: 'disabled',
          },
        }));
        let revoked = false;
        try {
          await remoteCoachAdapter.revoke();
          revoked = true;
        } catch (error) {
          setCoachRequestStatus('error');
          setCoachRequestMessage(
            `Zdalny coach jest wyłączony lokalnie, ale tokenu nie udało się odwołać: ${
              error instanceof Error ? error.message : 'błąd połączenia'
            }`,
          );
        }
        mutate((current) => ({
          ...current,
          remoteCoach: {
            ...current.remoteCoach,
            installationStatus: revoked
              ? 'revoked'
              : current.remoteCoach.installationStatus,
          },
        }));
        if (revoked) {
          setCoachRequestMessage('Zdalny AI coach jest wyłączony, a token został odwołany.');
        }
      } else {
        const installed = await remoteCoachAdapter.hasInstallation().catch(() => false);
        remoteRequestsAllowedRef.current = true;
        remoteRequestGenerationRef.current += 1;
        mutate((current) => ({
          ...current,
          remoteCoach: {
            ...current.remoteCoach,
            mode: 'enabled',
            consentedAt: new Date().toISOString(),
            installationStatus: installed ? 'active' : 'missing',
          },
        }));
      }
      setCoachRequestStatus((current) => (current === 'error' ? current : 'idle'));
    },
    [mutate],
  );

  const connectRemoteCoach = useCallback(
    async (accessCode: string) => {
      if (!accessCode.trim()) {
        setCoachRequestStatus('error');
        setCoachRequestMessage('Wpisz jednorazowy kod dostępu.');
        return false;
      }
      setCoachRequestStatus('loading');
      setCoachRequestMessage(undefined);
      const requestGeneration = remoteRequestGenerationRef.current;
      try {
        await remoteCoachAdapter.enroll(accessCode);
        if (
          !remoteRequestsAllowedRef.current ||
          requestGeneration !== remoteRequestGenerationRef.current
        ) return false;
        mutate((current) => ({
          ...current,
          remoteCoach: {
            ...current.remoteCoach,
            mode: 'enabled',
            consentedAt: current.remoteCoach.consentedAt ?? new Date().toISOString(),
            installationStatus: 'active',
          },
        }));
        setCoachRequestStatus('idle');
        setCoachRequestMessage('Instalacja jest połączona ze zdalnym AI coachem.');
        return true;
      } catch (error) {
        if (
          !remoteRequestsAllowedRef.current ||
          requestGeneration !== remoteRequestGenerationRef.current
        ) return false;
        setCoachRequestStatus('error');
        setCoachRequestMessage(
          error instanceof Error ? error.message : 'Nie udało się aktywować AI coacha.',
        );
        return false;
      }
    },
    [mutate],
  );

  const requestCoachProposal = useCallback(async () => {
    if (
      state.remoteCoach.mode !== 'enabled' ||
      !remoteRequestsAllowedRef.current ||
      coachRequestStatus === 'loading'
    ) return;
    setCoachRequestStatus('loading');
    setCoachRequestMessage(undefined);
    const requestGeneration = remoteRequestGenerationRef.current;
    const now = new Date();
    const startedAt = Date.now();
    const resolution = await resolveCoachProposal(
      state,
      state.remoteCoach.installationStatus === 'active'
        ? remoteCoachAdapter
        : undefined,
      now,
    );
    if (
      !remoteRequestsAllowedRef.current ||
      requestGeneration !== remoteRequestGenerationRef.current
    ) return;
    if (
      state.remoteCoach.installationStatus === 'active' &&
      (resolution.failureCode === 'unauthorized' ||
        resolution.failureCode === 'not_enrolled')
    ) {
      mutate((current) => ({
        ...current,
        remoteCoach: { ...current.remoteCoach, installationStatus: 'revoked' },
      }));
    }
    if (resolution.source === 'local') {
      setCoachRequestMessage('Brak aktywnego tokenu — pokazuję bezpieczny fallback lokalny.');
      if (state.remoteCoach.installationStatus === 'active') {
        setCoachRequestMessage(
          resolution.resultCode === 'invalid_proposal'
            ? 'Zdalna propozycja nie przeszła walidacji — pokazuję bezpieczny fallback lokalny.'
            : 'Zdalny coach jest niedostępny — pokazuję bezpieczny fallback lokalny.',
        );
      }
    }

    mutate((current) => {
      const withProposal = storeCoachProposal(
        current,
        resolution.proposal,
        resolution.source,
        now,
        resolution.source === 'remote' ? resolution.metadata.requestId : undefined,
      );
      const accepted = withProposal !== current;
      return {
        ...withProposal,
        remoteCoach: {
          ...withProposal.remoteCoach,
          lastRequest: {
            ...resolution.metadata,
            source: resolution.source,
            resultCode: accepted ? resolution.resultCode : 'invalid_proposal',
            latencyMs: Date.now() - startedAt,
          },
        },
      };
    });
    setCoachRequestStatus('idle');
  }, [coachRequestStatus, mutate, state]);

  const markRemoteCoachRevoked = useCallback(() => {
    mutate((current) => ({
      ...current,
      remoteCoach: {
        ...current.remoteCoach,
        installationStatus: 'revoked',
      },
    }));
  }, [mutate]);

  const applyStoredCoachProposal = useCallback(
    (proposalId: string) => {
      mutate((current) => decideCoachProposal(current, proposalId, 'apply'));
    },
    [mutate],
  );

  const rejectStoredCoachProposal = useCallback(
    (proposalId: string) => {
      mutate((current) => decideCoachProposal(current, proposalId, 'reject'));
    },
    [mutate],
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      hydrationStatus,
      persistenceMessage,
      coachRequestStatus,
      coachRequestMessage,
      remoteCoachConfigured: remoteCoachAdapter.isConfigured(),
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
      setRemoteCoachConsent,
      connectRemoteCoach,
      requestCoachProposal,
      markRemoteCoachRevoked,
      applyCoachProposal: applyStoredCoachProposal,
      rejectCoachProposal: rejectStoredCoachProposal,
    }),
    [
      state,
      hydrationStatus,
      persistenceMessage,
      coachRequestStatus,
      coachRequestMessage,
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
      setRemoteCoachConsent,
      connectRemoteCoach,
      requestCoachProposal,
      markRemoteCoachRevoked,
      applyStoredCoachProposal,
      rejectStoredCoachProposal,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore requires AppStoreProvider.');
  return value;
}
