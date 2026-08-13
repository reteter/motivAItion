import { createInitialProtocol, createInitialState } from '../src/domain/protocol';
import {
  AppState,
  Baseline,
  SetFeedback,
  UserProfile,
  Workout,
  WorkoutOccurrence,
} from '../src/domain/types';

export const coachFixtureNow = new Date(2026, 7, 17, 9, 0);

const profile: UserProfile = {
  goal: 'Poufny cel użytkownika, którego nie wolno wysłać',
  experience: 'returning_after_break',
  activity: 'none',
  availableMinutes: 10,
  daysPerWeek: 3,
  preferredTime: 'morning',
  limitations: 'Poufna swobodna notatka o ograniczeniach',
};

const baseline: Baseline = { pushups: 10, squats: 20, plankSeconds: 30 };
const protocol = createInitialProtocol(profile, baseline, coachFixtureNow);

function occurrence(
  id: string,
  localDate: string,
  status: WorkoutOccurrence['status'],
  extra: Partial<WorkoutOccurrence> = {},
): WorkoutOccurrence {
  return {
    id,
    localDate,
    scheduledAt: `${localDate}T07:30:00.000Z`,
    protocolVersion: 1,
    status,
    ...extra,
  };
}

function feedbackWorkout(id: string, completedAt: string, feedback: SetFeedback): Workout {
  return {
    id,
    occurrenceId: `occ-${id}`,
    protocolVersion: 1,
    plannedAt: completedAt,
    completedAt,
    earnedXp: 50,
    variant: 'standard',
    status: 'completed',
    exercises: protocol.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      sets: [{ index: 0, target: exercise.target, feedback, completedAt }],
    })),
  };
}

function state(
  occurrences: WorkoutOccurrence[] = [],
  overrides: Partial<AppState> = {},
): AppState {
  return {
    ...createInitialState(),
    profile,
    baseline,
    protocols: [protocol],
    occurrences,
    reminders: {
      enabled: true,
      permission: 'granted',
      notificationId: 'private-notification-id',
    },
    ...overrides,
  };
}

const scheduledToday = occurrence('today', '2026-08-17', 'scheduled');
const future = occurrence('future', '2026-08-19', 'scheduled');
const completed = occurrence('done', '2026-08-16', 'completed', {
  workoutId: 'workout-done',
  chosenVariant: 'standard',
  completedAt: '2026-08-16T08:00:00.000Z',
});

export interface CoachFixture {
  name: string;
  state: AppState;
  expected: {
    todayState: 'rest' | 'scheduled' | 'overdue' | 'recovery' | 'completed';
    rationale:
      | 'recovery_after_gap'
      | 'low_recent_consistency'
      | 'time_pressure_pattern'
      | 'pain_requires_caution'
      | 'positive_momentum'
      | 'insufficient_evidence';
    actionType:
      | 'recommend_minimum_workout'
      | 'recommend_recovery_workout'
      | 'modify_future_protocol'
      | 'add_behavioral_observation'
      | null;
    messageIncludes: string;
  };
}

export const coachFixtures: CoachFixture[] = [
  { name: 'rest day without future occurrence', state: state(), expected: { todayState: 'rest', rationale: 'insufficient_evidence', actionType: null, messageIncludes: 'odpoczynek' } },
  { name: 'scheduled session today', state: state([scheduledToday]), expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' } },
  {
    name: 'overdue session today',
    state: state([
      { ...scheduledToday, scheduledAt: '2026-08-17T05:00:00.000Z' },
    ]),
    expected: { todayState: 'overdue', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'recovery recommendation today',
    state: state([{ ...scheduledToday, recommendedVariant: 'minimum' }]),
    expected: { todayState: 'recovery', rationale: 'recovery_after_gap', actionType: 'recommend_minimum_workout', messageIncludes: 'Minimum' },
  },
  {
    name: 'completed today',
    state: state([
      occurrence('done-today', '2026-08-17', 'completed', {
        workoutId: 'workout-today',
        chosenVariant: 'minimum',
        completedAt: '2026-08-17T08:30:00.000Z',
      }),
    ]),
    expected: { todayState: 'completed', rationale: 'insufficient_evidence', actionType: null, messageIncludes: 'odpoczynek' },
  },
  {
    name: 'low seven day consistency',
    state: state([
      occurrence('missed-1', '2026-08-13', 'missed'),
      occurrence('skip-1', '2026-08-15', 'skipped', { decisionReason: 'low_energy' }),
      scheduledToday,
    ]),
    expected: { todayState: 'scheduled', rationale: 'low_recent_consistency', actionType: 'recommend_minimum_workout', messageIncludes: 'Minimum' },
  },
  {
    name: 'positive seven day consistency',
    state: state([completed, scheduledToday]),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'recent pain signal',
    state: state([
      occurrence('pain', '2026-08-16', 'skipped', {
        decisionReason: 'pain_or_limitation',
        decisionNote: 'Poufna notatka, której nie wolno wysłać',
      }),
      scheduledToday,
    ]),
    expected: { todayState: 'scheduled', rationale: 'pain_requires_caution', actionType: 'recommend_recovery_workout', messageIncludes: 'bólu' },
  },
  {
    name: 'repeated no time reasons',
    state: state([
      occurrence('time-1', '2026-08-12', 'skipped', { decisionReason: 'no_time' }),
      occurrence('time-2', '2026-08-15', 'rescheduled', { decisionReason: 'no_time' }),
      scheduledToday,
    ]),
    expected: { todayState: 'scheduled', rationale: 'time_pressure_pattern', actionType: 'recommend_minimum_workout', messageIncludes: 'Brak czasu' },
  },
  {
    name: 'repeated low energy reasons',
    state: state([
      occurrence('energy-1', '2026-08-12', 'skipped', { decisionReason: 'low_energy' }),
      occurrence('energy-2', '2026-08-15', 'skipped', { decisionReason: 'low_energy' }),
      scheduledToday,
    ]),
    expected: { todayState: 'scheduled', rationale: 'low_recent_consistency', actionType: 'recommend_minimum_workout', messageIncludes: 'Minimum' },
  },
  {
    name: 'hard feedback aggregate',
    state: state([scheduledToday], {
      history: [feedbackWorkout('hard', '2026-08-16T08:00:00.000Z', 'hard')],
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'easy feedback aggregate',
    state: state([scheduledToday], {
      history: [feedbackWorkout('easy', '2026-08-16T08:00:00.000Z', 'easy')],
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'ok feedback aggregate',
    state: state([scheduledToday], {
      history: [feedbackWorkout('ok', '2026-08-16T08:00:00.000Z', 'ok')],
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'bounded behavioral hypotheses',
    state: state([scheduledToday], {
      observations: Array.from({ length: 12 }, (_, index) => ({
        id: `observation-${index}`,
        createdAt: new Date(2026, 7, 1 + index).toISOString(),
        kind: 'low_adherence_pattern' as const,
        confidence: 0.4,
        evidence: `Poufny opis ${index}`,
      })),
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  { name: 'future session after rest day', state: state([future]), expected: { todayState: 'rest', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' } },
  {
    name: 'session in progress',
    state: state([
      occurrence('active', '2026-08-17', 'in_progress', {
        workoutId: 'workout-active',
        chosenVariant: 'standard',
      }),
    ]),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'targets at lower domain bounds',
    state: state([scheduledToday], {
      protocols: [
        {
          ...protocol,
          exercises: protocol.exercises.map((exercise) => ({
            ...exercise,
            target: { pushups: 1, squats: 3, plank: 5 }[exercise.id],
          })),
        },
      ],
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'pain with targets at lower bounds',
    state: state(
      [
        occurrence('pain-min', '2026-08-16', 'skipped', {
          decisionReason: 'pain_or_limitation',
        }),
        scheduledToday,
      ],
      {
        protocols: [
          {
            ...protocol,
            exercises: protocol.exercises.map((exercise) => ({
              ...exercise,
              target: { pushups: 1, squats: 3, plank: 5 }[exercise.id],
            })),
          },
        ],
      },
    ),
    expected: { todayState: 'scheduled', rationale: 'pain_requires_caution', actionType: 'recommend_recovery_workout', messageIncludes: 'bólu' },
  },
  {
    name: 'rescheduled source and future target',
    state: state([
      occurrence('source', '2026-08-17', 'rescheduled', { decisionReason: 'other' }),
      { ...future, sourceOccurrenceId: 'source' },
    ]),
    expected: { todayState: 'rest', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
  {
    name: 'old history excluded from fourteen days',
    state: state([scheduledToday], {
      history: [feedbackWorkout('old', '2026-07-01T08:00:00.000Z', 'hard')],
    }),
    expected: { todayState: 'scheduled', rationale: 'positive_momentum', actionType: null, messageIncludes: 'pierwszej serii' },
  },
];
