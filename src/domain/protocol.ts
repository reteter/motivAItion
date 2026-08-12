import {
  AppState,
  Baseline,
  Protocol,
  ProtocolExercise,
  UserProfile,
  Workout,
} from './types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

export function createInitialProtocol(
  profile: UserProfile,
  baseline: Baseline,
  now = new Date(),
): Protocol {
  const exercises: ProtocolExercise[] = [
    {
      id: 'pushups',
      name: 'Pompki',
      sets: 2,
      target: clamp(baseline.pushups * 0.4, 1, 10),
      unit: 'reps',
    },
    {
      id: 'squats',
      name: 'Przysiady',
      sets: 2,
      target: clamp(baseline.squats * 0.4, 3, 15),
      unit: 'reps',
    },
    {
      id: 'plank',
      name: 'Plank',
      sets: 2,
      target: clamp(baseline.plankSeconds * 0.5, 5, 30),
      unit: 'seconds',
    },
  ];

  return {
    version: 1,
    createdAt: now.toISOString(),
    daysPerWeek: profile.daysPerWeek,
    preferredTime: profile.preferredTime,
    exercises,
    reason: 'Zachowawczy start na podstawie baseline.',
  };
}

export function workoutFromProtocol(
  protocol: Protocol,
  now = new Date(),
): Workout {
  return {
    id: `workout-${now.getTime()}`,
    protocolVersion: protocol.version,
    plannedAt: now.toISOString(),
    variant: 'standard',
    status: 'planned',
    exercises: protocol.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      sets: Array.from({ length: exercise.sets }, (_, index) => ({
        index,
        target: exercise.target,
      })),
    })),
  };
}

export function createInitialState(): AppState {
  return {
    schemaVersion: 1,
    onboardingDraft: {},
    protocols: [],
    history: [],
    observations: [],
    progress: {
      totalXp: 0,
      completedWorkouts: 0,
      minimumWorkouts: 0,
    },
  };
}

export function currentProtocol(state: AppState): Protocol | undefined {
  return state.protocols.at(-1);
}

export function levelFromXp(totalXp: number) {
  const level = Math.floor(totalXp / 100) + 1;
  return {
    level,
    current: totalXp % 100,
    required: 100,
  };
}
