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

import {
  applyCoachAction,
  completeWorkout,
  ensureTodayWorkout,
} from '../domain/coach';
import {
  createInitialProtocol,
  createInitialState,
  workoutFromProtocol,
} from '../domain/protocol';
import {
  AppState,
  Baseline,
  CompletionResult,
  SetFeedback,
  UserProfile,
} from '../domain/types';

const STORAGE_KEY = '@motivaition/app-state/v1';

type HydrationStatus = 'loading' | 'ready' | 'read_error';

interface AppStoreValue {
  state: AppState;
  hydrationStatus: HydrationStatus;
  persistenceMessage?: string;
  updateOnboardingDraft: (draft: Partial<UserProfile>) => void;
  finishSetup: (profile: UserProfile, baseline: Baseline) => void;
  prepareToday: () => void;
  reduceToday: (reason: 'low_energy' | 'limited_time') => void;
  startWorkout: () => void;
  recordSet: (
    exerciseIndex: number,
    setIndex: number,
    feedback: SetFeedback,
  ) => void;
  finishWorkout: () => CompletionResult | undefined;
}

const AppStoreContext = createContext<AppStoreValue | undefined>(undefined);

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return (
    candidate.schemaVersion === 1 &&
    Array.isArray(candidate.protocols) &&
    Array.isArray(candidate.history) &&
    Array.isArray(candidate.observations) &&
    Boolean(candidate.progress)
  );
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>(createInitialState);
  const [hydrationStatus, setHydrationStatus] =
    useState<HydrationStatus>('loading');
  const [persistenceMessage, setPersistenceMessage] = useState<string>();
  const dirtyRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const serialized = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active) return;
        if (serialized) {
          const parsed: unknown = JSON.parse(serialized);
          if (!isAppState(parsed)) throw new Error('Nieznany format danych.');
          setState(parsed);
        }
        setHydrationStatus('ready');
      } catch {
        if (!active) return;
        // Domyślny stan pozostaje tylko w pamięci, dopóki użytkownik nie wykona akcji.
        setHydrationStatus('read_error');
        setPersistenceMessage(
          'Nie udało się odczytać lokalnych danych. Nie nadpiszemy ich bez Twojej akcji.',
        );
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrationStatus === 'loading' || !dirtyRef.current) return;
    dirtyRef.current = false;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      dirtyRef.current = true;
      setPersistenceMessage(
        'Zmiany są widoczne, ale nie udało się ich zapisać na urządzeniu.',
      );
    });
  }, [hydrationStatus, state]);

  const mutate = useCallback((recipe: (current: AppState) => AppState) => {
    dirtyRef.current = true;
    setState(recipe);
  }, []);

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
      mutate((current) => {
        const protocol = createInitialProtocol(profile, baseline);
        return {
          ...current,
          onboardingDraft: {},
          profile,
          baseline,
          protocols: [protocol],
          todayWorkout: workoutFromProtocol(protocol),
        };
      });
    },
    [mutate],
  );

  const prepareToday = useCallback(() => {
    mutate((current) => ensureTodayWorkout(current));
  }, [mutate]);

  const reduceToday = useCallback(
    (reason: 'low_energy' | 'limited_time') => {
      mutate((current) =>
        applyCoachAction(current, { type: 'reduce_today_workout', reason }),
      );
    },
    [mutate],
  );

  const startWorkout = useCallback(() => {
    mutate((current) =>
      current.todayWorkout
        ? {
            ...current,
            todayWorkout: { ...current.todayWorkout, status: 'in_progress' },
          }
        : current,
    );
  }, [mutate]);

  const recordSet = useCallback(
    (exerciseIndex: number, setIndex: number, feedback: SetFeedback) => {
      mutate((current) => {
        if (!current.todayWorkout) return current;
        const exercise = current.todayWorkout.exercises[exerciseIndex];
        const workoutSet = exercise?.sets[setIndex];
        if (!exercise || !workoutSet || workoutSet.completedAt) return current;

        const exercises = current.todayWorkout.exercises.map(
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
        );

        return {
          ...current,
          todayWorkout: {
            ...current.todayWorkout,
            status: 'in_progress',
            exercises,
          },
        };
      });
    },
    [mutate],
  );

  const finishWorkout = useCallback(() => {
    if (!state.todayWorkout) return undefined;
    const result = completeWorkout(state, state.todayWorkout);
    dirtyRef.current = true;
    setState(result.state);
    return result;
  }, [state]);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      hydrationStatus,
      persistenceMessage,
      updateOnboardingDraft,
      finishSetup,
      prepareToday,
      reduceToday,
      startWorkout,
      recordSet,
      finishWorkout,
    }),
    [
      state,
      hydrationStatus,
      persistenceMessage,
      updateOnboardingDraft,
      finishSetup,
      prepareToday,
      reduceToday,
      startWorkout,
      recordSet,
      finishWorkout,
    ],
  );

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore requires AppStoreProvider.');
  return value;
}
