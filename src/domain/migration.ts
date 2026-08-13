import { createInitialState } from './protocol';
import { toLocalDate } from './schedule';
import {
  AppState,
  AppStateV1,
  BehavioralObservation,
  Baseline,
  Progress,
  Protocol,
  ReminderState,
  TrainingSchedule,
  UserProfile,
  Workout,
  WorkoutOccurrence,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isOptionalString(value: unknown) {
  return value === undefined || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isOptionalIsoDate(value: unknown) {
  return value === undefined || isIsoDate(value);
}

function isLocalDate(value: unknown): value is string {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(year ?? 0, (month ?? 0) - 1, day ?? 0, 12);
  return toLocalDate(candidate) === value;
}

const experienceLevels = [
  'never_trained',
  'beginner',
  'returning_after_break',
  'currently_active',
  'advanced',
] as const;
const activityLevels = ['none', 'sometimes', 'regular'] as const;
const preferredTimes = ['morning', 'afternoon', 'evening'] as const;
const exerciseIds = ['pushups', 'squats', 'plank'] as const;
const exerciseUnits = ['reps', 'seconds'] as const;
const workoutVariants = ['standard', 'minimum'] as const;
const workoutStatuses = ['planned', 'in_progress', 'completed'] as const;
const feedbackValues = ['easy', 'ok', 'hard'] as const;
const occurrenceStatuses = [
  'scheduled',
  'in_progress',
  'completed',
  'skipped',
  'missed',
  'rescheduled',
] as const;
const decisionReasons = [
  'low_energy',
  'no_time',
  'pain_or_limitation',
  'exercise_resistance',
  'other',
] as const;
const observationKinds = [
  'low_energy_minimum_helped',
  'hard_exercise',
  'easy_exercise',
  'recovery_minimum_accepted',
  'recovery_standard_chosen',
  'workout_skipped',
  'workout_rescheduled',
] as const;

function oneOf<T extends readonly unknown[]>(value: unknown, values: T) {
  return values.includes(value);
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.goal) &&
    oneOf(value.experience, experienceLevels) &&
    oneOf(value.activity, activityLevels) &&
    oneOf(value.availableMinutes, [5, 10, 15] as const) &&
    oneOf(value.daysPerWeek, [2, 3, 4] as const) &&
    oneOf(value.preferredTime, preferredTimes) &&
    isString(value.limitations)
  );
}

function isOnboardingDraft(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    (value.goal === undefined || isNonEmptyString(value.goal)) &&
    (value.experience === undefined || oneOf(value.experience, experienceLevels)) &&
    (value.activity === undefined || oneOf(value.activity, activityLevels)) &&
    (value.availableMinutes === undefined ||
      oneOf(value.availableMinutes, [5, 10, 15] as const)) &&
    (value.daysPerWeek === undefined || oneOf(value.daysPerWeek, [2, 3, 4] as const)) &&
    (value.preferredTime === undefined || oneOf(value.preferredTime, preferredTimes)) &&
    (value.limitations === undefined || isString(value.limitations))
  );
}

function isBaseline(value: unknown): value is Baseline {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.pushups) &&
    isNonNegativeInteger(value.squats) &&
    isNonNegativeInteger(value.plankSeconds)
  );
}

function isProtocol(value: unknown): value is Protocol {
  if (!isRecord(value) || !Array.isArray(value.exercises)) return false;
  return (
    isPositiveInteger(value.version) &&
    isIsoDate(value.createdAt) &&
    oneOf(value.daysPerWeek, [2, 3, 4] as const) &&
    oneOf(value.preferredTime, preferredTimes) &&
    isString(value.reason) &&
    value.exercises.length > 0 &&
    value.exercises.every(
      (exercise) =>
        isRecord(exercise) &&
        oneOf(exercise.id, exerciseIds) &&
        isNonEmptyString(exercise.name) &&
        isPositiveInteger(exercise.sets) &&
        isPositiveInteger(exercise.target) &&
        oneOf(exercise.unit, exerciseUnits),
    )
  );
}

function isWorkout(value: unknown): value is Workout {
  if (!isRecord(value) || !Array.isArray(value.exercises)) return false;
  const valid =
    isNonEmptyString(value.id) &&
    (value.occurrenceId === undefined || isNonEmptyString(value.occurrenceId)) &&
    isPositiveInteger(value.protocolVersion) &&
    isIsoDate(value.plannedAt) &&
    oneOf(value.variant, workoutVariants) &&
    oneOf(value.status, workoutStatuses) &&
    isOptionalIsoDate(value.completedAt) &&
    (value.earnedXp === undefined || isNonNegativeInteger(value.earnedXp)) &&
    value.exercises.every(
      (exercise) =>
        isRecord(exercise) &&
        oneOf(exercise.id, exerciseIds) &&
        isNonEmptyString(exercise.name) &&
        oneOf(exercise.unit, exerciseUnits) &&
        Array.isArray(exercise.sets) &&
        exercise.sets.length > 0 &&
        exercise.sets.every(
          (set) =>
            isRecord(set) &&
            isNonNegativeInteger(set.index) &&
            isPositiveInteger(set.target) &&
            isOptionalIsoDate(set.completedAt) &&
            (set.feedback === undefined || oneOf(set.feedback, feedbackValues)),
        ),
    );
  if (!valid) return false;
  return value.status !== 'completed' ||
    (isIsoDate(value.completedAt) && isNonNegativeInteger(value.earnedXp));
}

function isObservation(value: unknown): value is BehavioralObservation {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isIsoDate(value.createdAt) &&
    oneOf(value.kind, observationKinds) &&
    isFiniteNumber(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    isNonEmptyString(value.evidence)
  );
}

function isProgress(value: unknown): value is Progress {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.totalXp) &&
    isNonNegativeInteger(value.completedWorkouts) &&
    isNonNegativeInteger(value.minimumWorkouts) &&
    value.minimumWorkouts <= value.completedWorkouts
  );
}

function isSchedule(value: unknown): value is TrainingSchedule {
  if (!isRecord(value) || !Array.isArray(value.weekdays)) return false;
  return (
    value.weekdays.length > 0 &&
    new Set(value.weekdays).size === value.weekdays.length &&
    value.weekdays.every((weekday) => oneOf(weekday, [1, 2, 3, 4, 5, 6, 7] as const)) &&
    isString(value.localTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.localTime) &&
    isNonEmptyString(value.timeZone) &&
    isLocalDate(value.startsOn) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  );
}

function isOccurrence(value: unknown): value is WorkoutOccurrence {
  if (!isRecord(value)) return false;
  const valid =
    isNonEmptyString(value.id) &&
    isLocalDate(value.localDate) &&
    isIsoDate(value.scheduledAt) &&
    isPositiveInteger(value.protocolVersion) &&
    oneOf(value.status, occurrenceStatuses) &&
    (value.sourceOccurrenceId === undefined || isNonEmptyString(value.sourceOccurrenceId)) &&
    (value.decisionReason === undefined || oneOf(value.decisionReason, decisionReasons)) &&
    isOptionalString(value.decisionNote) &&
    (value.recommendedVariant === undefined ||
      oneOf(value.recommendedVariant, workoutVariants)) &&
    (value.chosenVariant === undefined || oneOf(value.chosenVariant, workoutVariants)) &&
    (value.workoutId === undefined || isNonEmptyString(value.workoutId)) &&
    isOptionalIsoDate(value.completedAt);
  if (!valid) return false;
  if (value.status === 'completed') {
    return (
      isIsoDate(value.completedAt) &&
      isNonEmptyString(value.workoutId) &&
      oneOf(value.chosenVariant, workoutVariants)
    );
  }
  if (value.status === 'in_progress') {
    return (
      isNonEmptyString(value.workoutId) && oneOf(value.chosenVariant, workoutVariants)
    );
  }
  if (value.status === 'skipped' || value.status === 'rescheduled') {
    return oneOf(value.decisionReason, decisionReasons);
  }
  return true;
}

function isReminderState(value: unknown): value is ReminderState {
  if (!isRecord(value)) return false;
  return (
    typeof value.enabled === 'boolean' &&
    oneOf(value.permission, ['unknown', 'granted', 'denied'] as const) &&
    (value.notificationId === undefined || isNonEmptyString(value.notificationId)) &&
    (value.occurrenceId === undefined || isNonEmptyString(value.occurrenceId)) &&
    isOptionalIsoDate(value.scheduledAt)
  );
}

function hasCommonStateShape(value: Record<string, unknown>) {
  return (
    isOnboardingDraft(value.onboardingDraft) &&
    (value.profile === undefined || isUserProfile(value.profile)) &&
    (value.baseline === undefined || isBaseline(value.baseline)) &&
    Array.isArray(value.protocols) &&
    value.protocols.every(isProtocol) &&
    (value.todayWorkout === undefined ||
      (isWorkout(value.todayWorkout) && value.todayWorkout.status !== 'completed')) &&
    Array.isArray(value.history) &&
    value.history.every(
      (workout) => isWorkout(workout) && workout.status === 'completed',
    ) &&
    Array.isArray(value.observations) &&
    value.observations.every(isObservation) &&
    isProgress(value.progress)
  );
}

function hasUniqueIds(values: Array<{ id: string }>) {
  return new Set(values.map((value) => value.id)).size === values.length;
}

export function isAppStateV2(value: unknown): value is AppState {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 2 ||
    !hasCommonStateShape(value) ||
    (value.schedule !== undefined && !isSchedule(value.schedule)) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(isOccurrence) ||
    !hasUniqueIds(value.occurrences) ||
    !hasUniqueIds(value.history as Workout[]) ||
    !isReminderState(value.reminders)
  ) {
    return false;
  }

  const candidate = value as unknown as AppState;
  const protocolVersions = new Set(candidate.protocols.map((protocol) => protocol.version));
  if (
    protocolVersions.size !== candidate.protocols.length ||
    candidate.occurrences.some(
      (occurrence) => !protocolVersions.has(occurrence.protocolVersion),
    ) ||
    candidate.history.some(
      (workout) =>
        !protocolVersions.has(workout.protocolVersion) ||
        !workout.occurrenceId ||
        !candidate.occurrences.some(
          (occurrence) =>
            occurrence.id === workout.occurrenceId &&
            occurrence.status === 'completed' &&
            occurrence.workoutId === workout.id,
        ),
    )
  ) {
    return false;
  }

  if (candidate.todayWorkout) {
    const occurrence = candidate.occurrences.find(
      (item) => item.id === candidate.todayWorkout?.occurrenceId,
    );
    const matchingLifecycle =
      (candidate.todayWorkout.status === 'planned' &&
        occurrence?.status === 'scheduled') ||
      (candidate.todayWorkout.status === 'in_progress' &&
        occurrence?.status === 'in_progress');
    if (
      !protocolVersions.has(candidate.todayWorkout.protocolVersion) ||
      !occurrence ||
      !matchingLifecycle ||
      occurrence.workoutId !== candidate.todayWorkout.id
    ) {
      return false;
    }
  }
  return true;
}

function isAppStateV1(value: unknown): value is AppStateV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !hasCommonStateShape(value) ||
    !hasUniqueIds(value.history as Workout[])
  ) {
    return false;
  }
  const candidate = value as unknown as AppStateV1;
  const protocolVersions = new Set(candidate.protocols.map((protocol) => protocol.version));
  return (
    protocolVersions.size === candidate.protocols.length &&
    candidate.history.every((workout) => protocolVersions.has(workout.protocolVersion)) &&
    (!candidate.todayWorkout ||
      protocolVersions.has(candidate.todayWorkout.protocolVersion))
  );
}

function completedOccurrence(workout: Workout): WorkoutOccurrence {
  const occurrenceId = `occurrence-migrated-${workout.id}`;
  return {
    id: occurrenceId,
    localDate: toLocalDate(new Date(workout.completedAt ?? workout.plannedAt)),
    scheduledAt: workout.plannedAt,
    protocolVersion: workout.protocolVersion,
    status: 'completed',
    chosenVariant: workout.variant,
    workoutId: workout.id,
    completedAt: workout.completedAt,
  };
}

export function migrateV1ToV2(value: AppStateV1): AppState {
  const history = value.history.map((workout) => {
    const occurrence = completedOccurrence(workout);
    return { ...workout, occurrenceId: occurrence.id };
  });
  const occurrences = history.map(completedOccurrence);

  let todayWorkout = value.todayWorkout;
  if (todayWorkout) {
    const id = `occurrence-migrated-${todayWorkout.id}`;
    todayWorkout = { ...todayWorkout, occurrenceId: id };
    occurrences.push({
      id,
      localDate: toLocalDate(new Date(todayWorkout.plannedAt)),
      scheduledAt: todayWorkout.plannedAt,
      protocolVersion: todayWorkout.protocolVersion,
      status: todayWorkout.status === 'in_progress' ? 'in_progress' : 'scheduled',
      chosenVariant: todayWorkout.variant,
      workoutId: todayWorkout.id,
    });
  }

  return {
    ...createInitialState(),
    ...value,
    schemaVersion: 2,
    todayWorkout,
    history,
    occurrences,
    reminders: {
      enabled: false,
      permission: 'unknown',
    },
  };
}

export function parseAndMigrateState(value: unknown): AppState {
  if (isAppStateV2(value)) return value;
  if (isAppStateV1(value)) return migrateV1ToV2(value);
  throw new Error('Nieznany lub uszkodzony format danych.');
}
