import { coachTargetLimits } from '../domain/coach';
import { currentProtocol } from '../domain/protocol';
import {
  addLocalDays,
  consistency,
  isOccurrenceOverdue,
  nextActionableOccurrence,
  occurrenceForToday,
  toLocalDate,
} from '../domain/schedule';
import {
  AppState,
  BehavioralObservationKind,
  DecisionReason,
  ProtocolExercise,
  SetFeedback,
  WorkoutOccurrenceStatus,
} from '../domain/types';
import { COACH_CONTEXT_VERSION, COACH_PROMPT_VERSION } from './contracts';

type ProposalType =
  | 'recommend_minimum_workout'
  | 'recommend_recovery_workout'
  | 'modify_future_protocol'
  | 'add_behavioral_observation'
  | 'none';

export interface CoachContextV1 {
  contextVersion: typeof COACH_CONTEXT_VERSION;
  promptVersion: typeof COACH_PROMPT_VERSION;
  todayState: 'rest' | 'scheduled' | 'overdue' | 'recovery' | 'completed';
  nextOccurrence: {
    occurrenceId: string;
    localDate: string;
    protocolVersion: number;
    allowedVariants: Array<'standard' | 'minimum'>;
  } | null;
  consistency: {
    days7: { completed: number; planned: number };
    days30: { completed: number; planned: number };
  };
  recentOccurrences: {
    statuses: Record<WorkoutOccurrenceStatus, number>;
    reasons: Record<DecisionReason, number>;
  };
  recentFeedback: {
    totals: Record<SetFeedback, number>;
    byExercise: Array<{
      exerciseId: ProtocolExercise['id'];
      easy: number;
      ok: number;
      hard: number;
    }>;
    painOrLimitationReported: boolean;
  };
  behavioralHypotheses: Array<{
    kind: BehavioralObservationKind;
    confidence: number;
  }>;
  allowedProtocolChanges: Array<{
    exerciseId: ProtocolExercise['id'];
    currentTarget: number;
    allowedTargetDeltas: number[];
  }>;
  allowedProposalTypes: ProposalType[];
}

function emptyStatuses(): Record<WorkoutOccurrenceStatus, number> {
  return {
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    skipped: 0,
    missed: 0,
    rescheduled: 0,
  };
}

function emptyReasons(): Record<DecisionReason, number> {
  return {
    low_energy: 0,
    no_time: 0,
    pain_or_limitation: 0,
    exercise_resistance: 0,
    other: 0,
  };
}

function allowedDeltas(exercise: ProtocolExercise, painReported: boolean) {
  const [min, max] = coachTargetLimits[exercise.id];
  const unit = exercise.unit === 'seconds' ? 5 : 1;
  const candidates = [-unit, unit];
  return candidates.filter(
    (delta) =>
      exercise.target + delta >= min &&
      exercise.target + delta <= max &&
      (!painReported || delta < 0),
  );
}

export function buildCoachContext(state: AppState, now = new Date()): CoachContextV1 {
  const today = toLocalDate(now);
  const from = addLocalDays(today, -13);
  const recentOccurrences = state.occurrences.filter(
    (occurrence) => occurrence.localDate >= from && occurrence.localDate <= today,
  );
  const statuses = emptyStatuses();
  const reasons = emptyReasons();
  for (const occurrence of recentOccurrences) {
    statuses[occurrence.status] += 1;
    if (occurrence.decisionReason) reasons[occurrence.decisionReason] += 1;
  }

  const feedbackByExercise = new Map<
    ProtocolExercise['id'],
    { easy: number; ok: number; hard: number }
  >();
  const feedbackTotals: Record<SetFeedback, number> = { easy: 0, ok: 0, hard: 0 };
  const recentHistory = state.history.filter((workout) => {
    const date = toLocalDate(new Date(workout.completedAt ?? workout.plannedAt));
    return date >= from && date <= today;
  });
  for (const workout of recentHistory) {
    for (const exercise of workout.exercises) {
      const summary = feedbackByExercise.get(exercise.id) ?? { easy: 0, ok: 0, hard: 0 };
      for (const set of exercise.sets) {
        if (!set.feedback) continue;
        summary[set.feedback] += 1;
        feedbackTotals[set.feedback] += 1;
      }
      feedbackByExercise.set(exercise.id, summary);
    }
  }

  const painReported = reasons.pain_or_limitation > 0;
  const occurrence = occurrenceForToday(state, now);
  const nextOccurrence = nextActionableOccurrence(state, now);
  const protocol = currentProtocol(state);
  const score7 = consistency(state.occurrences, 7, now);
  const score30 = consistency(state.occurrences, 30, now);
  let todayState: CoachContextV1['todayState'] = 'rest';
  if (occurrence?.status === 'completed') todayState = 'completed';
  else if (occurrence?.recommendedVariant === 'minimum') todayState = 'recovery';
  else if (occurrence?.status === 'scheduled' && isOccurrenceOverdue(occurrence, now)) {
    todayState = 'overdue';
  } else if (occurrence?.status === 'scheduled' || occurrence?.status === 'in_progress') {
    todayState = 'scheduled';
  }

  const allowedProposalTypes: ProposalType[] = ['add_behavioral_observation', 'none'];
  if (nextOccurrence?.status === 'scheduled') {
    allowedProposalTypes.unshift(
      'recommend_minimum_workout',
      'recommend_recovery_workout',
    );
    if (protocol?.exercises.some((exercise) => allowedDeltas(exercise, painReported).length)) {
      allowedProposalTypes.push('modify_future_protocol');
    }
  }

  return {
    contextVersion: COACH_CONTEXT_VERSION,
    promptVersion: COACH_PROMPT_VERSION,
    todayState,
    nextOccurrence: nextOccurrence
      ? {
          occurrenceId: nextOccurrence.id,
          localDate: nextOccurrence.localDate,
          protocolVersion: nextOccurrence.protocolVersion,
          allowedVariants: ['standard', 'minimum'],
        }
      : null,
    consistency: {
      days7: { completed: score7.completed, planned: score7.planned },
      days30: { completed: score30.completed, planned: score30.planned },
    },
    recentOccurrences: { statuses, reasons },
    recentFeedback: {
      totals: feedbackTotals,
      byExercise: [...feedbackByExercise.entries()]
        .map(([exerciseId, summary]) => ({ exerciseId, ...summary }))
        .sort((left, right) => left.exerciseId.localeCompare(right.exerciseId)),
      painOrLimitationReported: painReported,
    },
    behavioralHypotheses: state.observations
      .slice(-10)
      .map(({ kind, confidence }) => ({ kind, confidence })),
    allowedProtocolChanges:
      protocol?.exercises.map((exercise) => ({
        exerciseId: exercise.id,
        currentTarget: exercise.target,
        allowedTargetDeltas: allowedDeltas(exercise, painReported),
      })) ?? [],
    allowedProposalTypes,
  };
}

export function serializeCoachContext(state: AppState, now = new Date()) {
  return JSON.stringify(buildCoachContext(state, now));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validCountRecord(value: unknown, keys: readonly string[]) {
  return (
    isRecord(value) &&
    exactKeys(value, [...keys].sort()) &&
    keys.every((key) => nonNegativeInteger(value[key]))
  );
}

export function parseCoachContext(value: unknown): CoachContextV1 | undefined {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'allowedProposalTypes',
      'allowedProtocolChanges',
      'behavioralHypotheses',
      'consistency',
      'contextVersion',
      'nextOccurrence',
      'promptVersion',
      'recentFeedback',
      'recentOccurrences',
      'todayState',
    ]) ||
    value.contextVersion !== COACH_CONTEXT_VERSION ||
    value.promptVersion !== COACH_PROMPT_VERSION ||
    ![
      'rest',
      'scheduled',
      'overdue',
      'recovery',
      'completed',
    ].includes(value.todayState as string)
  ) return undefined;

  if (value.nextOccurrence !== null) {
    if (
      !isRecord(value.nextOccurrence) ||
      !exactKeys(value.nextOccurrence, [
        'allowedVariants',
        'localDate',
        'occurrenceId',
        'protocolVersion',
      ]) ||
      typeof value.nextOccurrence.occurrenceId !== 'string' ||
      value.nextOccurrence.occurrenceId.length < 1 ||
      value.nextOccurrence.occurrenceId.length > 120 ||
      typeof value.nextOccurrence.localDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.nextOccurrence.localDate) ||
      !nonNegativeInteger(value.nextOccurrence.protocolVersion) ||
      !Array.isArray(value.nextOccurrence.allowedVariants) ||
      value.nextOccurrence.allowedVariants.join(',') !== 'standard,minimum'
    ) return undefined;
  }

  if (
    !isRecord(value.consistency) ||
    !exactKeys(value.consistency, ['days30', 'days7']) ||
    !isRecord(value.consistency.days7) ||
    !exactKeys(value.consistency.days7, ['completed', 'planned']) ||
    !nonNegativeInteger(value.consistency.days7.completed) ||
    !nonNegativeInteger(value.consistency.days7.planned) ||
    !isRecord(value.consistency.days30) ||
    !exactKeys(value.consistency.days30, ['completed', 'planned']) ||
    !nonNegativeInteger(value.consistency.days30.completed) ||
    !nonNegativeInteger(value.consistency.days30.planned)
  ) return undefined;

  const statusKeys: WorkoutOccurrenceStatus[] = [
    'scheduled',
    'in_progress',
    'completed',
    'skipped',
    'missed',
    'rescheduled',
  ];
  const reasonKeys: DecisionReason[] = [
    'low_energy',
    'no_time',
    'pain_or_limitation',
    'exercise_resistance',
    'other',
  ];
  if (
    !isRecord(value.recentOccurrences) ||
    !exactKeys(value.recentOccurrences, ['reasons', 'statuses']) ||
    !validCountRecord(value.recentOccurrences.statuses, statusKeys) ||
    !validCountRecord(value.recentOccurrences.reasons, reasonKeys)
  ) return undefined;

  if (
    !isRecord(value.recentFeedback) ||
    !exactKeys(value.recentFeedback, [
      'byExercise',
      'painOrLimitationReported',
      'totals',
    ]) ||
    !validCountRecord(value.recentFeedback.totals, ['easy', 'ok', 'hard']) ||
    typeof value.recentFeedback.painOrLimitationReported !== 'boolean' ||
    !Array.isArray(value.recentFeedback.byExercise) ||
    value.recentFeedback.byExercise.length > 3 ||
    !value.recentFeedback.byExercise.every(
      (entry) =>
        isRecord(entry) &&
        exactKeys(entry, ['easy', 'exerciseId', 'hard', 'ok']) &&
        ['pushups', 'squats', 'plank'].includes(entry.exerciseId as string) &&
        nonNegativeInteger(entry.easy) &&
        nonNegativeInteger(entry.ok) &&
        nonNegativeInteger(entry.hard),
    )
  ) return undefined;

  if (
    !Array.isArray(value.behavioralHypotheses) ||
    value.behavioralHypotheses.length > 10 ||
    !value.behavioralHypotheses.every(
      (entry) =>
        isRecord(entry) &&
        exactKeys(entry, ['confidence', 'kind']) &&
        [
          'low_energy_minimum_helped',
          'hard_exercise',
          'easy_exercise',
          'recovery_minimum_accepted',
          'recovery_standard_chosen',
          'workout_skipped',
          'workout_rescheduled',
          'time_pressure_pattern',
          'low_adherence_pattern',
          'minimum_helped_pattern',
        ].includes(entry.kind as string) &&
        typeof entry.confidence === 'number' &&
        Number.isFinite(entry.confidence) &&
        entry.confidence >= 0 &&
        entry.confidence <= 1,
    ) ||
    !Array.isArray(value.allowedProtocolChanges) ||
    value.allowedProtocolChanges.length > 3 ||
    !value.allowedProtocolChanges.every(
      (entry) =>
        isRecord(entry) &&
        exactKeys(entry, [
          'allowedTargetDeltas',
          'currentTarget',
          'exerciseId',
        ]) &&
        ['pushups', 'squats', 'plank'].includes(entry.exerciseId as string) &&
        nonNegativeInteger(entry.currentTarget) &&
        Array.isArray(entry.allowedTargetDeltas) &&
        entry.allowedTargetDeltas.length <= 2 &&
        entry.allowedTargetDeltas.every(
          (delta) => typeof delta === 'number' && Number.isInteger(delta) && delta !== 0,
        ),
    )
  ) return undefined;

  const proposalTypes: ProposalType[] = [
    'recommend_minimum_workout',
    'recommend_recovery_workout',
    'modify_future_protocol',
    'add_behavioral_observation',
    'none',
  ];
  if (
    !Array.isArray(value.allowedProposalTypes) ||
    value.allowedProposalTypes.length < 1 ||
    value.allowedProposalTypes.length > proposalTypes.length ||
    new Set(value.allowedProposalTypes).size !== value.allowedProposalTypes.length ||
    !value.allowedProposalTypes.every((item) => proposalTypes.includes(item as ProposalType))
  ) return undefined;

  return value as unknown as CoachContextV1;
}
