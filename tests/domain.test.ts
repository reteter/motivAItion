import {
  applyCoachAction,
  completeWorkout,
  ensureTodayWorkout,
} from '../src/domain/coach';
import {
  createInitialProtocol,
  createInitialState,
  workoutFromProtocol,
} from '../src/domain/protocol';
import { AppState, Baseline, UserProfile, Workout } from '../src/domain/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profile: UserProfile = {
  goal: 'Wrócić do regularnego ruchu',
  experience: 'returning_after_break',
  activity: 'none',
  availableMinutes: 10,
  daysPerWeek: 3,
  preferredTime: 'morning',
  limitations: '',
};

const baseline: Baseline = {
  pushups: 10,
  squats: 20,
  plankSeconds: 30,
};

const start = new Date('2026-08-13T08:00:00.000Z');
const protocol = createInitialProtocol(profile, baseline, start);

assert(protocol.version === 1, 'Initial Protocol should start at version 1.');
assert(protocol.exercises[0]?.target === 4, 'Pushups should start conservatively.');
assert(protocol.exercises[2]?.target === 15, 'Plank should use half the baseline.');

const planned = workoutFromProtocol(protocol, start);
let state: AppState = {
  ...createInitialState(),
  profile,
  baseline,
  protocols: [protocol],
  todayWorkout: planned,
};

state = applyCoachAction(state, {
  type: 'reduce_today_workout',
  reason: 'low_energy',
});
assert(state.todayWorkout?.variant === 'minimum', 'Coach should activate Minimum.');
assert(
  state.todayWorkout.exercises.every((exercise) => exercise.sets.length === 1),
  'Minimum should keep one set per exercise.',
);

function withFeedback(workout: Workout): Workout {
  return {
    ...workout,
    status: 'in_progress',
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        completedAt: '2026-08-13T08:10:00.000Z',
        feedback: exercise.id === 'pushups' ? 'hard' : 'easy',
      })),
    })),
  };
}

const result = completeWorkout(
  state,
  withFeedback(state.todayWorkout as Workout),
  new Date('2026-08-13T08:12:00.000Z'),
);
assert(result.state.history.length === 1, 'Completion should append objective history.');
assert(result.state.progress.totalXp === 25, 'Minimum should award 25 XP.');
assert(
  result.state.protocols.length === 2,
  'One completion should create at most one adapted Protocol version.',
);
assert(
  result.state.protocols[0]?.exercises[0]?.target === 4,
  'Adapting a future Protocol must not rewrite the previous version.',
);
assert(
  result.state.protocols[1]?.exercises[0]?.target === 3,
  'Hard feedback should lower the future pushup target.',
);
assert(
  result.state.protocols[1]?.exercises[1]?.target === 9,
  'Easy feedback should raise the future squat target.',
);

const nextDay = ensureTodayWorkout(
  result.state,
  new Date('2026-08-14T08:00:00.000Z'),
);
assert(!nextDay.todayWorkout, 'A 3-day Protocol should keep the following day free.');

const scheduledDay = ensureTodayWorkout(
  result.state,
  new Date('2026-08-15T08:00:00.000Z'),
);
assert(Boolean(scheduledDay.todayWorkout), 'A 3-day Protocol should return after two days.');
