import { currentProtocol, workoutFromProtocol } from './protocol';
import {
  AppState,
  ConsistencyResult,
  DecisionReason,
  Protocol,
  TrainingSchedule,
  Weekday,
  Workout,
  WorkoutOccurrence,
  WorkoutVariant,
} from './types';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
}

export function dateFromLocal(localDate: string, localTime = '12:00'): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error(`Nieprawidłowa data lokalna: ${localDate} ${localTime}`);
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function addLocalDays(localDate: string, days: number): string {
  const date = dateFromLocal(localDate);
  date.setDate(date.getDate() + days);
  return toLocalDate(date);
}

export function weekdayFor(localDate: string): Weekday {
  const jsDay = dateFromLocal(localDate).getDay();
  return (jsDay === 0 ? 7 : jsDay) as Weekday;
}

export function defaultWeekdays(daysPerWeek: number): Weekday[] {
  if (daysPerWeek === 2) return [1, 4];
  if (daysPerWeek === 4) return [1, 2, 4, 6];
  return [1, 3, 5];
}

export function defaultLocalTime(
  preferredTime: 'morning' | 'afternoon' | 'evening',
): string {
  return { morning: '07:30', afternoon: '13:00', evening: '18:30' }[
    preferredTime
  ];
}

export function createSchedule(
  weekdays: Weekday[],
  localTime: string,
  now = new Date(),
): TrainingSchedule {
  const uniqueWeekdays = [...new Set(weekdays)].sort((left, right) => left - right);
  if (uniqueWeekdays.length === 0) throw new Error('Wybierz co najmniej jeden dzień.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    throw new Error('Nieprawidłowa godzina harmonogramu.');
  }

  return {
    weekdays: uniqueWeekdays,
    localTime,
    timeZone: currentTimeZone(),
    startsOn: toLocalDate(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function occurrenceId(localDate: string) {
  return `occurrence-${localDate}`;
}

function occurrenceForDate(
  localDate: string,
  schedule: TrainingSchedule,
  protocol: Protocol,
): WorkoutOccurrence {
  return {
    id: occurrenceId(localDate),
    localDate,
    scheduledAt: dateFromLocal(localDate, schedule.localTime).toISOString(),
    protocolVersion: protocol.version,
    status: 'scheduled',
  };
}

function isActiveOccurrence(occurrence: WorkoutOccurrence) {
  return occurrence.status !== 'rescheduled';
}

function needsRecovery(occurrences: WorkoutOccurrence[], localDate: string) {
  const previous = occurrences
    .filter(
      (occurrence) =>
        occurrence.localDate < localDate && occurrence.status !== 'rescheduled',
    )
    .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  return previous?.status === 'missed' || previous?.status === 'skipped';
}

export function reconcileSchedule(
  state: AppState,
  now = new Date(),
  horizonDays = 14,
): AppState {
  const schedule = state.schedule;
  const protocol = currentProtocol(state);
  if (!schedule || !protocol) return state;

  const today = toLocalDate(now);
  const observedTimeZone = currentTimeZone();
  const timeZoneChanged = schedule.timeZone !== observedTimeZone;
  const effectiveSchedule = timeZoneChanged
    ? { ...schedule, timeZone: observedTimeZone, updatedAt: now.toISOString() }
    : schedule;
  let changed = timeZoneChanged;
  let occurrences = state.occurrences.map((occurrence) => {
    if (occurrence.status === 'scheduled' && occurrence.localDate < today) {
      changed = true;
      return { ...occurrence, status: 'missed' as const };
    }
    const futureScheduled =
      occurrence.status === 'scheduled' && occurrence.localDate >= today;
    const protocolChanged =
      futureScheduled && occurrence.protocolVersion !== protocol.version;
    const scheduledAt =
      futureScheduled && timeZoneChanged
        ? dateFromLocal(occurrence.localDate, effectiveSchedule.localTime).toISOString()
        : occurrence.scheduledAt;
    if (protocolChanged || scheduledAt !== occurrence.scheduledAt) {
      changed = true;
      return {
        ...occurrence,
        protocolVersion: protocolChanged ? protocol.version : occurrence.protocolVersion,
        scheduledAt,
      };
    }
    return occurrence;
  });

  for (
    let cursor =
      effectiveSchedule.startsOn > today ? effectiveSchedule.startsOn : today;
    cursor <= addLocalDays(today, horizonDays);
    cursor = addLocalDays(cursor, 1)
  ) {
    if (!effectiveSchedule.weekdays.includes(weekdayFor(cursor))) continue;
    const exists = occurrences.some(
      (occurrence) =>
        occurrence.localDate === cursor &&
        (isActiveOccurrence(occurrence) || occurrence.decisionNote !== 'Zmiana harmonogramu.'),
    );
    if (exists) continue;

    const materialized = occurrenceForDate(cursor, effectiveSchedule, protocol);
    const uniqueOccurrence = occurrences.some(
      (occurrence) => occurrence.id === materialized.id,
    )
      ? {
          ...materialized,
          id: `${materialized.id}-schedule-${effectiveSchedule.updatedAt}`,
        }
      : materialized;
    occurrences = [...occurrences, uniqueOccurrence];
    changed = true;
  }

  occurrences = occurrences.map((occurrence) => {
    if (
      occurrence.status === 'scheduled' &&
      !occurrence.recommendedVariant &&
      needsRecovery(occurrences, occurrence.localDate)
    ) {
      changed = true;
      return { ...occurrence, recommendedVariant: 'minimum' as const };
    }
    return occurrence;
  });

  return changed ? { ...state, schedule: effectiveSchedule, occurrences } : state;
}

export function configureSchedule(
  state: AppState,
  schedule: TrainingSchedule,
  now = new Date(),
): AppState {
  const today = toLocalDate(now);
  const occurrences = state.schedule
    ? state.occurrences.map((occurrence) =>
        occurrence.localDate >= today && occurrence.status === 'scheduled'
          ? {
              ...occurrence,
              status: 'rescheduled' as const,
              decisionReason: 'other' as const,
              decisionNote: 'Zmiana harmonogramu.',
            }
          : occurrence,
      )
    : state.occurrences;

  return reconcileSchedule({ ...state, schedule, occurrences }, now);
}

export function occurrenceForToday(state: AppState, now = new Date()) {
  const today = toLocalDate(now);
  return state.occurrences.find(
    (occurrence) => occurrence.localDate === today && isActiveOccurrence(occurrence),
  );
}

export function nextActionableOccurrence(state: AppState, now = new Date()) {
  const today = toLocalDate(now);
  return state.occurrences
    .filter(
      (occurrence) =>
        occurrence.localDate >= today &&
        (occurrence.status === 'scheduled' || occurrence.status === 'in_progress'),
    )
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0];
}

export function nextReminderOccurrence(state: AppState, now = new Date()) {
  return state.occurrences
    .filter(
      (occurrence) =>
        occurrence.status === 'scheduled' &&
        new Date(occurrence.scheduledAt).getTime() > now.getTime(),
    )
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0];
}

export function millisecondsUntilNextLocalDay(now = new Date()) {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

function minimumWorkout(workout: Workout): Workout {
  return {
    ...workout,
    variant: 'minimum',
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.slice(0, 1).map((set) => ({
        ...set,
        target: Math.max(
          exercise.unit === 'seconds' ? 5 : 1,
          Math.ceil(set.target / 2),
        ),
      })),
    })),
  };
}

export function startOccurrence(
  state: AppState,
  occurrenceIdToStart: string,
  variant: WorkoutVariant,
  now = new Date(),
): AppState {
  const occurrence = state.occurrences.find(
    (candidate) => candidate.id === occurrenceIdToStart,
  );
  if (!occurrence || !['scheduled', 'in_progress'].includes(occurrence.status)) {
    return state;
  }

  const protocol =
    state.protocols.find((candidate) => candidate.version === occurrence.protocolVersion) ??
    currentProtocol(state);
  if (!protocol) return state;

  const baseWorkout =
    state.todayWorkout?.occurrenceId === occurrence.id
      ? state.todayWorkout
      : workoutFromProtocol(protocol, now, occurrence.id);
  const workout = variant === 'minimum' ? minimumWorkout(baseWorkout) : baseWorkout;
  const observations = [...state.observations];

  if (occurrence.recommendedVariant === 'minimum' && !occurrence.chosenVariant) {
    observations.push({
      id: `observation-${now.getTime()}-${observations.length}`,
      createdAt: now.toISOString(),
      kind:
        variant === 'minimum'
          ? 'recovery_minimum_accepted'
          : 'recovery_standard_chosen',
      confidence: 0.5,
      evidence:
        variant === 'minimum'
          ? 'Użytkownik przyjął rekomendację spokojnego powrotu.'
          : 'Użytkownik wybrał Standard mimo rekomendacji spokojnego powrotu.',
    });
  }

  return {
    ...state,
    todayWorkout: { ...workout, status: 'in_progress' },
    observations,
    occurrences: state.occurrences.map((candidate) =>
      candidate.id === occurrence.id
        ? {
            ...candidate,
            status: 'in_progress',
            chosenVariant: variant,
            workoutId: workout.id,
          }
        : candidate,
    ),
  };
}

function nextAllowedDate(schedule: TrainingSchedule, after: string) {
  let cursor = addLocalDays(after, 1);
  for (let attempts = 0; attempts < 14; attempts += 1) {
    if (schedule.weekdays.includes(weekdayFor(cursor))) return cursor;
    cursor = addLocalDays(cursor, 1);
  }
  throw new Error('Nie udało się znaleźć kolejnego terminu.');
}

function decisionObservation(
  state: AppState,
  kind: 'workout_skipped' | 'workout_rescheduled',
  reason: DecisionReason,
  now: Date,
) {
  return [
    ...state.observations,
    {
      id: `observation-${now.getTime()}-${state.observations.length}`,
      createdAt: now.toISOString(),
      kind,
      confidence: 0.45,
      evidence: `Zapisana decyzja użytkownika: ${reason}.`,
    },
  ];
}

export function skipOccurrence(
  state: AppState,
  occurrenceIdToSkip: string,
  reason: DecisionReason,
  now = new Date(),
): AppState {
  const occurrence = state.occurrences.find(
    (candidate) => candidate.id === occurrenceIdToSkip,
  );
  if (!occurrence || occurrence.status !== 'scheduled') return state;
  return reconcileSchedule(
    {
      ...state,
      todayWorkout:
        state.todayWorkout?.occurrenceId === occurrence.id
          ? undefined
          : state.todayWorkout,
      observations: decisionObservation(state, 'workout_skipped', reason, now),
      occurrences: state.occurrences.map((candidate) =>
        candidate.id === occurrence.id
          ? { ...candidate, status: 'skipped', decisionReason: reason }
          : candidate,
      ),
    },
    now,
  );
}

export function rescheduleOccurrence(
  state: AppState,
  occurrenceIdToMove: string,
  reason: DecisionReason,
  now = new Date(),
): AppState {
  const schedule = state.schedule;
  const source = state.occurrences.find(
    (candidate) => candidate.id === occurrenceIdToMove,
  );
  if (!schedule || !source || source.status !== 'scheduled') return state;

  const targetDate = nextAllowedDate(schedule, source.localDate);
  const existingTarget = state.occurrences.find(
    (candidate) =>
      candidate.localDate === targetDate && candidate.status === 'scheduled',
  );
  const protocol =
    state.protocols.find((candidate) => candidate.version === source.protocolVersion) ??
    currentProtocol(state);
  if (!protocol) return state;

  let occurrences = state.occurrences.map((candidate) =>
    candidate.id === source.id
      ? { ...candidate, status: 'rescheduled' as const, decisionReason: reason }
      : candidate.id === existingTarget?.id
        ? { ...candidate, sourceOccurrenceId: source.id }
        : candidate,
  );
  if (!existingTarget) {
    occurrences = [
      ...occurrences,
      {
        ...occurrenceForDate(targetDate, schedule, protocol),
        id: `${occurrenceId(targetDate)}-from-${source.id}`,
        sourceOccurrenceId: source.id,
      },
    ];
  }

  return reconcileSchedule(
    {
      ...state,
      occurrences,
      observations: decisionObservation(state, 'workout_rescheduled', reason, now),
    },
    now,
  );
}

export function consistency(
  occurrences: WorkoutOccurrence[],
  days: 7 | 30,
  now = new Date(),
): ConsistencyResult {
  const today = toLocalDate(now);
  const from = addLocalDays(today, -(days - 1));
  const included = occurrences.filter(
    (occurrence) =>
      occurrence.localDate >= from &&
      occurrence.localDate <= today &&
      occurrence.status !== 'rescheduled',
  );
  const planned = included.length;
  const completed = included.filter(
    (occurrence) => occurrence.status === 'completed',
  ).length;
  return { completed, planned, ratio: planned === 0 ? 0 : completed / planned };
}

export function isOccurrenceOverdue(
  occurrence: WorkoutOccurrence,
  now = new Date(),
) {
  return occurrence.status === 'scheduled' && new Date(occurrence.scheduledAt) < now;
}
