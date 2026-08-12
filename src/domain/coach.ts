import {
  AppState,
  CoachAction,
  CompletionResult,
  Protocol,
  ProtocolExercise,
  SetFeedback,
  Workout,
} from './types';
import { currentProtocol, workoutFromProtocol } from './protocol';

const targetLimits: Record<ProtocolExercise['id'], [number, number]> = {
  pushups: [1, 20],
  squats: [3, 30],
  plank: [5, 60],
};

const clamp = (value: number, [min, max]: [number, number]) =>
  Math.min(max, Math.max(min, value));

export function validateCoachAction(
  state: AppState,
  action: CoachAction,
): boolean {
  if (action.type === 'reduce_today_workout') {
    return Boolean(state.todayWorkout && state.todayWorkout.status !== 'completed');
  }

  if (action.type === 'add_behavioral_observation') {
    return action.observation.confidence >= 0 && action.observation.confidence <= 1;
  }

  const protocol = currentProtocol(state);
  if (!protocol || action.changes.length === 0) return false;
  const ids = new Set(action.changes.map((change) => change.exerciseId));
  if (ids.size !== action.changes.length) return false;

  return action.changes.every((change) => {
    const exercise = protocol.exercises.find(
      (candidate) => candidate.id === change.exerciseId,
    );
    if (!exercise || !Number.isInteger(change.targetDelta)) return false;
    const nextTarget = exercise.target + change.targetDelta;
    const [min, max] = targetLimits[change.exerciseId];
    return nextTarget >= min && nextTarget <= max;
  });
}

export function applyCoachAction(
  state: AppState,
  action: CoachAction,
  now = new Date(),
): AppState {
  if (!validateCoachAction(state, action)) return state;

  if (action.type === 'reduce_today_workout' && state.todayWorkout) {
    return {
      ...state,
      todayWorkout: {
        ...state.todayWorkout,
        variant: 'minimum',
        exercises: state.todayWorkout.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.slice(0, 1).map((set) => ({
            ...set,
            target: Math.max(
              exercise.unit === 'seconds' ? 5 : 1,
              Math.ceil(set.target / 2),
            ),
          })),
        })),
      },
    };
  }

  if (action.type === 'add_behavioral_observation') {
    return {
      ...state,
      observations: [
        ...state.observations,
        {
          ...action.observation,
          id: `observation-${now.getTime()}-${state.observations.length}`,
          createdAt: now.toISOString(),
        },
      ],
    };
  }

  if (action.type === 'modify_future_protocol') {
    const protocol = currentProtocol(state);
    if (!protocol) return state;

    const nextProtocol: Protocol = {
      ...protocol,
      version: protocol.version + 1,
      createdAt: now.toISOString(),
      reason: 'Cele serii dopasowane po ostatnim feedbacku.',
      exercises: protocol.exercises.map((exercise) => {
        const change = action.changes.find(
          (candidate) => candidate.exerciseId === exercise.id,
        );
        return change
          ? {
              ...exercise,
              target: clamp(
                exercise.target + change.targetDelta,
                targetLimits[exercise.id],
              ),
            }
          : exercise;
      }),
    };

    return { ...state, protocols: [...state.protocols, nextProtocol] };
  }

  return state;
}

function feedbackFor(workout: Workout, exerciseId: ProtocolExercise['id']) {
  return workout.exercises
    .find((exercise) => exercise.id === exerciseId)
    ?.sets.map((set) => set.feedback)
    .filter((value): value is SetFeedback => Boolean(value)) ?? [];
}

export function proposePostWorkoutActions(
  state: AppState,
  workout: Workout,
): CoachAction[] {
  const actions: CoachAction[] = [];
  const changes: Extract<
    CoachAction,
    { type: 'modify_future_protocol' }
  >['changes'] = [];

  for (const exercise of workout.exercises) {
    const feedback = feedbackFor(workout, exercise.id);
    const hardCount = feedback.filter((value) => value === 'hard').length;
    const allEasy = feedback.length > 0 && feedback.every((value) => value === 'easy');

    if (hardCount >= Math.ceil(feedback.length / 2)) {
      changes.push({
        exerciseId: exercise.id,
        targetDelta: exercise.unit === 'seconds' ? -5 : -1,
        source: 'hard',
      });
      actions.push({
        type: 'add_behavioral_observation',
        observation: {
          kind: 'hard_exercise',
          confidence: 0.6,
          evidence: `${exercise.name}: większość serii oznaczona jako za trudna.`,
        },
      });
    } else if (allEasy) {
      changes.push({
        exerciseId: exercise.id,
        targetDelta: exercise.unit === 'seconds' ? 5 : 1,
        source: 'easy',
      });
      actions.push({
        type: 'add_behavioral_observation',
        observation: {
          kind: 'easy_exercise',
          confidence: 0.55,
          evidence: `${exercise.name}: wszystkie serie oznaczone jako za łatwe.`,
        },
      });
    }
  }

  if (changes.length > 0) {
    const protocol = currentProtocol(state);
    const validChanges = changes.filter((change) => {
      const exercise = protocol?.exercises.find(
        (candidate) => candidate.id === change.exerciseId,
      );
      if (!exercise) return false;
      const [min, max] = targetLimits[change.exerciseId];
      const nextTarget = exercise.target + change.targetDelta;
      return nextTarget >= min && nextTarget <= max;
    });
    if (validChanges.length > 0) {
    actions.unshift({
      type: 'modify_future_protocol',
      reason: 'workout_feedback',
      changes: validChanges,
    });
    }
  }

  if (workout.variant === 'minimum') {
    actions.push({
      type: 'add_behavioral_observation',
      observation: {
        kind: 'low_energy_minimum_helped',
        confidence: 0.5,
        evidence: 'Wersja minimum została rozpoczęta i ukończona.',
      },
    });
  }

  return actions;
}

export function completeWorkout(
  state: AppState,
  workout: Workout,
  now = new Date(),
): CompletionResult {
  const earnedXp = workout.variant === 'minimum' ? 25 : 50;
  const completedWorkout: Workout = {
    ...workout,
    status: 'completed',
    completedAt: now.toISOString(),
    earnedXp,
  };
  const actions = proposePostWorkoutActions(state, completedWorkout);

  let nextState: AppState = {
    ...state,
    todayWorkout: undefined,
    history: [completedWorkout, ...state.history].slice(0, 30),
    progress: {
      totalXp: state.progress.totalXp + earnedXp,
      completedWorkouts: state.progress.completedWorkouts + 1,
      minimumWorkouts:
        state.progress.minimumWorkouts +
        (completedWorkout.variant === 'minimum' ? 1 : 0),
    },
  };

  const appliedActions: CoachAction[] = [];
  for (const action of actions) {
    const actionState = applyCoachAction(nextState, action, now);
    if (actionState !== nextState) appliedActions.push(action);
    nextState = actionState;
  }

  const adapted = nextState.protocols.length > state.protocols.length;
  const coachMessage = adapted
    ? 'Zapisałem wynik. Kolejny trening delikatnie dopasowałem do Twojego feedbacku.'
    : completedWorkout.variant === 'minimum'
      ? 'Minimum zrobione. Dziś chodziło o podtrzymanie powrotu, nie o rekord.'
      : 'Pełny trening zapisany. Dobra robota — bez nadęcia, po prostu wykonane.';

  return { state: nextState, coachMessage, appliedActions };
}

export function ensureTodayWorkout(state: AppState, now = new Date()): AppState {
  if (state.todayWorkout) return state;
  const today = now.toDateString();
  const alreadyCompleted = state.history.some(
    (workout) =>
      workout.completedAt && new Date(workout.completedAt).toDateString() === today,
  );
  if (alreadyCompleted) return state;
  const protocol = currentProtocol(state);
  if (!protocol) return state;
  const lastCompletion = state.history
    .map((workout) => workout.completedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (lastCompletion) {
    const dayMs = 24 * 60 * 60 * 1000;
    const calendarDays = Math.floor(
      (new Date(now.toDateString()).getTime() -
        new Date(lastCompletion.toDateString()).getTime()) /
        dayMs,
    );
    const restDays = protocol.daysPerWeek >= 4 ? 1 : protocol.daysPerWeek === 3 ? 2 : 3;
    if (calendarDays < restDays) return state;
  }
  return { ...state, todayWorkout: workoutFromProtocol(protocol, now) };
}
