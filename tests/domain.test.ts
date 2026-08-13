import { applyCoachAction, completeWorkout } from '../src/domain/coach';
import { migrateV1ToV2, parseAndMigrateState } from '../src/domain/migration';
import { shouldPersistState } from '../src/domain/persistence';
import {
  createInitialProtocol,
  createInitialState,
} from '../src/domain/protocol';
import {
  configureSchedule,
  consistency,
  createSchedule,
  currentTimeZone,
  dateFromLocal,
  millisecondsUntilNextLocalDay,
  nextReminderOccurrence,
  reconcileSchedule,
  rescheduleOccurrence,
  startOccurrence,
  toLocalDate,
} from '../src/domain/schedule';
import {
  AppState,
  AppStateV1,
  Baseline,
  UserProfile,
  Workout,
  WorkoutOccurrence,
} from '../src/domain/types';

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

const start = new Date(2026, 7, 13, 8, 0);
const today = toLocalDate(start);
const protocol = createInitialProtocol(profile, baseline, start);

assert(protocol.version === 1, 'Initial Protocol should start at version 1.');
assert(protocol.exercises[0]?.target === 4, 'Pushups should start conservatively.');
assert(protocol.exercises[2]?.target === 15, 'Plank should use half the baseline.');

const schedule = createSchedule([1, 4, 6], '07:30', start);
let state: AppState = configureSchedule(
  {
    ...createInitialState(),
    profile,
    baseline,
    protocols: [protocol],
  },
  schedule,
  start,
);

const occurrence = state.occurrences.find((candidate) => candidate.localDate === today);
assert(occurrence, 'Schedule should materialize an occurrence for an allowed day.');
const occurrenceCount = state.occurrences.length;
state = reconcileSchedule(state, start);
assert(
  state.occurrences.length === occurrenceCount,
  'Reconciliation should be idempotent and not create duplicate occurrences.',
);

state = applyCoachAction(state, {
  type: 'choose_minimum_workout',
  occurrenceId: occurrence.id,
  reason: 'low_energy',
}, start);
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
        completedAt: new Date(2026, 7, 13, 8, 10).toISOString(),
        feedback: exercise.id === 'pushups' ? 'hard' : 'easy',
      })),
    })),
  };
}

const rejectedIncomplete = completeWorkout(
  state,
  new Date(2026, 7, 13, 8, 11),
);
assert(!rejectedIncomplete, 'An incomplete workout must not grant completion or XP.');

state = {
  ...state,
  todayWorkout: withFeedback(state.todayWorkout as Workout),
};
const mismatchedWorkoutState: AppState = {
  ...state,
  occurrences: state.occurrences.map((candidate) =>
    candidate.id === occurrence.id
      ? { ...candidate, workoutId: 'different-workout' }
      : candidate,
  ),
};
assert(
  !completeWorkout(mismatchedWorkoutState, new Date(2026, 7, 13, 8, 11)),
  'Completion must reject a workout that does not match its active occurrence.',
);
const result = completeWorkout(state, new Date(2026, 7, 13, 8, 12));
assert(result, 'A started workout with every set completed should be accepted.');
assert(result.state.history.length === 1, 'Completion should append objective history.');
assert(result.state.progress.totalXp === 25, 'Minimum should award 25 XP.');
assert(
  result.state.occurrences.find((candidate) => candidate.id === occurrence.id)?.status ===
    'completed',
  'Completion should close the matching occurrence.',
);
assert(
  result.state.protocols.length === 2,
  'One completion should create at most one adapted Protocol version.',
);
assert(
  result.state.protocols[0]?.exercises[0]?.target === 4,
  'Adapting a future Protocol must not rewrite the previous version.',
);

const duplicateCompletion = completeWorkout(
  result.state,
  new Date(2026, 7, 13, 8, 13),
);
assert(
  !duplicateCompletion && result.state.progress.totalXp === 25,
  'Completing an occurrence twice must not grant duplicate XP.',
);

const nextScheduled = result.state.occurrences
  .filter((candidate) => candidate.status === 'scheduled')
  .sort((left, right) => left.localDate.localeCompare(right.localDate))[0];
assert(nextScheduled, 'Schedule should contain a future occurrence.');
const moved = rescheduleOccurrence(
  result.state,
  nextScheduled.id,
  'no_time',
  start,
);
const movedSource = moved.occurrences.find((candidate) => candidate.id === nextScheduled.id);
const movedTarget = moved.occurrences.find(
  (candidate) => candidate.sourceOccurrenceId === nextScheduled.id,
);
assert(movedSource?.status === 'rescheduled', 'Reschedule should close its source.');
assert(Boolean(movedTarget), 'Reschedule should preserve a source-target relation.');
assert(
  moved.occurrences.filter(
    (candidate) =>
      candidate.localDate === nextScheduled.localDate && candidate.status !== 'rescheduled',
  ).length === 0,
  'Reschedule must not recreate the source date during reconciliation.',
);

const consistencyFixture: WorkoutOccurrence[] = [
  {
    id: 'done-standard',
    localDate: today,
    scheduledAt: start.toISOString(),
    protocolVersion: 1,
    status: 'completed',
    chosenVariant: 'standard',
  },
  {
    id: 'done-minimum',
    localDate: toLocalDate(new Date(2026, 7, 11, 8)),
    scheduledAt: new Date(2026, 7, 11, 8).toISOString(),
    protocolVersion: 1,
    status: 'completed',
    chosenVariant: 'minimum',
  },
  {
    id: 'skipped',
    localDate: toLocalDate(new Date(2026, 7, 10, 8)),
    scheduledAt: new Date(2026, 7, 10, 8).toISOString(),
    protocolVersion: 1,
    status: 'skipped',
    decisionReason: 'low_energy',
  },
  {
    id: 'rescheduled-source',
    localDate: toLocalDate(new Date(2026, 7, 9, 8)),
    scheduledAt: new Date(2026, 7, 9, 8).toISOString(),
    protocolVersion: 1,
    status: 'rescheduled',
  },
];
const score = consistency(consistencyFixture, 7, start);
assert(score.completed === 2, 'Standard and Minimum should count as completed.');
assert(score.planned === 3, 'Skipped should count but rescheduled source should not.');

const recoveryBase: AppState = {
  ...createInitialState(),
  profile,
  baseline,
  protocols: [protocol],
  schedule,
  occurrences: [
    {
      id: 'missed-before',
      localDate: toLocalDate(new Date(2026, 7, 12, 8)),
      scheduledAt: new Date(2026, 7, 12, 7, 30).toISOString(),
      protocolVersion: 1,
      status: 'missed',
    },
    {
      id: 'return-today',
      localDate: today,
      scheduledAt: new Date(2026, 7, 13, 7, 30).toISOString(),
      protocolVersion: 1,
      status: 'scheduled',
    },
  ],
};
const recovered = reconcileSchedule(recoveryBase, start);
const recoveryOccurrence = recovered.occurrences.find(
  (candidate) => candidate.id === 'return-today',
);
assert(
  recoveryOccurrence?.recommendedVariant === 'minimum',
  'The next occurrence after a miss should recommend Minimum.',
);
const standardReturn = startOccurrence(recovered, 'return-today', 'standard', start);
assert(
  standardReturn.todayWorkout?.variant === 'standard',
  'Recovery recommendation must not block choosing Standard.',
);
assert(
  standardReturn.observations.some(
    (candidate) => candidate.kind === 'recovery_standard_chosen',
  ),
  'Recovery decision should be stored as a behavioral hypothesis.',
);

const v1Workout: Workout = {
  id: 'workout-existing',
  protocolVersion: 1,
  plannedAt: new Date(2026, 7, 10, 8).toISOString(),
  completedAt: new Date(2026, 7, 10, 8, 12).toISOString(),
  earnedXp: 50,
  variant: 'standard',
  status: 'completed',
  exercises: [],
};
const v1Fixture: AppStateV1 = {
  schemaVersion: 1,
  onboardingDraft: {},
  profile,
  baseline,
  protocols: [protocol],
  history: [v1Workout],
  observations: [],
  progress: { totalXp: 50, completedWorkouts: 1, minimumWorkouts: 0 },
};
const migrated = migrateV1ToV2(v1Fixture);
assert(migrated.schemaVersion === 2, 'M1 fixture should migrate to schema v2.');
assert(migrated.profile?.goal === profile.goal, 'Migration should preserve profile.');
assert(migrated.history.length === 1, 'Migration should preserve workout history.');
assert(migrated.progress.totalXp === 50, 'Migration should preserve XP.');
assert(
  migrated.occurrences[0]?.status === 'completed',
  'Migrated history should receive objective completed occurrences.',
);
assert(
  parseAndMigrateState(migrated).schemaVersion === 2,
  'A migrated state should pass strict v2 validation on the next launch.',
);

let invalidRejected = false;
try {
  parseAndMigrateState({ schemaVersion: 1, history: 'invalid' });
} catch {
  invalidRejected = true;
}
assert(invalidRejected, 'Invalid persisted data must be rejected, not replaced silently.');

for (const invalidState of [
  {
    ...createInitialState(),
    progress: {},
  },
  {
    ...v1Fixture,
    history: [{ id: 'broken-workout' }],
  },
  {
    ...createInitialState(),
    occurrences: [
      {
        id: 'broken-occurrence',
        localDate: 'not-a-date',
        scheduledAt: 'not-a-date',
      },
    ],
  },
]) {
  let rejected = false;
  try {
    parseAndMigrateState(invalidState);
  } catch {
    rejected = true;
  }
  assert(rejected, 'Every malformed persisted record should be rejected fully.');
}

assert(
  !shouldPersistState('loading', true) &&
    !shouldPersistState('read_error', true) &&
    shouldPersistState('ready', true) &&
    !shouldPersistState('ready', false),
  'Persistence must remain blocked until successful hydration or explicit recovery.',
);

const reminderNow = new Date(2026, 7, 13, 8, 0);
const reminderState: AppState = {
  ...createInitialState(),
  occurrences: [
    {
      id: 'overdue-today',
      localDate: toLocalDate(reminderNow),
      scheduledAt: new Date(2026, 7, 13, 7, 30).toISOString(),
      protocolVersion: 1,
      status: 'scheduled',
    },
    {
      id: 'future-reminder',
      localDate: toLocalDate(new Date(2026, 7, 14, 8)),
      scheduledAt: new Date(2026, 7, 14, 7, 30).toISOString(),
      protocolVersion: 1,
      status: 'scheduled',
    },
  ],
};
assert(
  nextReminderOccurrence(reminderState, reminderNow)?.id === 'future-reminder',
  'An overdue occurrence must not block the next future reminder.',
);

const nextDayDelay = millisecondsUntilNextLocalDay(
  new Date(2026, 7, 13, 23, 59, 30),
);
assert(
  nextDayDelay === 30_000,
  'Dashboard rollover should target the next local midnight exactly.',
);

const dstDate = dateFromLocal('2026-10-25', '07:30');
assert(
  dstDate.getHours() === 7 && dstDate.getMinutes() === 30,
  'Local schedule time should remain a wall-clock time across a DST date.',
);

const futureLocalDate = toLocalDate(new Date(2026, 7, 14, 8));
const previousZoneState: AppState = {
  ...createInitialState(),
  profile,
  baseline,
  protocols: [protocol],
  schedule: { ...schedule, timeZone: 'Previous/DeviceZone' },
  occurrences: [
    {
      id: 'future-after-travel',
      localDate: futureLocalDate,
      scheduledAt: new Date(2026, 7, 14, 2, 0).toISOString(),
      protocolVersion: 1,
      status: 'scheduled',
    },
  ],
};
const rebasedZoneState = reconcileSchedule(previousZoneState, start);
const rebasedOccurrence = rebasedZoneState.occurrences.find(
  (candidate) => candidate.id === 'future-after-travel',
);
assert(
  rebasedZoneState.schedule?.timeZone === currentTimeZone(),
  'Schedule should record the currently observed device time zone.',
);
assert(
  rebasedOccurrence &&
    new Date(rebasedOccurrence.scheduledAt).getHours() === 7 &&
    new Date(rebasedOccurrence.scheduledAt).getMinutes() === 30,
  'Future sessions should be rebased to the same local wall-clock time after travel.',
);
