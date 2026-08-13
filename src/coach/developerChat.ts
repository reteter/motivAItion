import { currentProtocol } from '../domain/protocol';
import { occurrenceForToday, toLocalDate } from '../domain/schedule';
import {
  AppState,
  DecisionReason,
  ProtocolExercise,
  SetFeedback,
  WorkoutOccurrenceStatus,
} from '../domain/types';
import { buildCoachContext } from './context';

export const DEVELOPER_CHAT_CONTEXT_VERSION = 'm4-chat-context-v1' as const;
export const MAX_CHAT_MESSAGES = 12;
export const MAX_CHAT_USER_MESSAGE_LENGTH = 2_000;
export const MAX_CHAT_ASSISTANT_MESSAGE_LENGTH = 12_000;
export const MAX_CHAT_TRANSCRIPT_LENGTH = 18_000;
export const MAX_CHAT_REQUEST_BYTES = 32_000;

export type DeveloperChatRole = 'user' | 'assistant';

export interface DeveloperChatTurn {
  role: DeveloperChatRole;
  content: string;
}

export interface DeveloperChatContextV1 {
  contextVersion: typeof DEVELOPER_CHAT_CONTEXT_VERSION;
  localDate: string;
  today: {
    state: 'rest' | 'scheduled' | 'overdue' | 'recovery' | 'completed';
    scheduledAt?: string;
    chosenVariant?: 'standard' | 'minimum';
    recommendedVariant?: 'standard' | 'minimum';
  };
  baseline: {
    pushups: number;
    squats: number;
    plankSeconds: number;
  };
  availableMinutes: 5 | 10 | 15;
  protocol: {
    version: number;
    daysPerWeek: number;
    preferredTime: 'morning' | 'afternoon' | 'evening';
    exercises: Array<{
      exerciseId: ProtocolExercise['id'];
      sets: number;
      target: number;
      unit: ProtocolExercise['unit'];
    }>;
  };
  minimumVariant: Array<{
    exerciseId: ProtocolExercise['id'];
    sets: 1;
    target: number;
    unit: ProtocolExercise['unit'];
  }>;
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
  };
  painOrLimitationReported: boolean;
}

export interface DeveloperChatRequestV1 {
  context: DeveloperChatContextV1;
  messages: DeveloperChatTurn[];
}

export interface DeveloperChatCitation {
  startIndex: number;
  endIndex: number;
  title: string;
  url: string;
}

export interface DeveloperChatReply {
  text: string;
  citations: DeveloperChatCitation[];
  webSearchUsed: boolean;
  metadata: {
    requestId: string;
    requestedAt: string;
    latencyMs?: number;
    modelVersion?: string;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DeveloperChatSessionMessage extends DeveloperChatTurn {
  id: string;
  citations: DeveloperChatCitation[];
  webSearchUsed: boolean;
}

export interface DeveloperChatSessionState {
  messages: DeveloperChatSessionMessage[];
  draft: string;
  status: 'idle' | 'loading' | 'error';
  statusMessage?: string;
  generation: number;
}

export type DeveloperChatSessionAction =
  | { type: 'set_draft'; draft: string }
  | { type: 'start'; generation: number; messages: DeveloperChatSessionMessage[] }
  | { type: 'succeed'; generation: number; message: DeveloperChatSessionMessage }
  | { type: 'fail'; generation: number; message: string; retryDraft?: string }
  | { type: 'clear_error'; generation: number }
  | { type: 'reset' };

export const initialDeveloperChatSession: DeveloperChatSessionState = {
  messages: [],
  draft: '',
  status: 'idle',
  generation: 0,
};

export function developerChatSessionReducer(
  state: DeveloperChatSessionState,
  action: DeveloperChatSessionAction,
): DeveloperChatSessionState {
  if (action.type === 'set_draft') return { ...state, draft: action.draft };
  if (action.type === 'start') {
    if (state.status === 'loading' || action.generation <= state.generation) return state;
    return {
      ...state,
      messages: action.messages,
      draft: '',
      status: 'loading',
      statusMessage: undefined,
      generation: action.generation,
    };
  }
  if (action.type === 'succeed') {
    if (action.generation !== state.generation) return state;
    return {
      ...state,
      messages: [...state.messages, action.message].slice(-MAX_CHAT_MESSAGES),
      status: 'idle',
      statusMessage: undefined,
    };
  }
  if (action.type === 'fail') {
    if (action.generation !== state.generation) return state;
    const messages = action.retryDraft && state.messages.at(-1)?.role === 'user'
      ? state.messages.slice(0, -1)
      : state.messages;
    return {
      ...state,
      messages,
      draft: action.retryDraft ?? state.draft,
      status: 'error',
      statusMessage: action.message,
    };
  }
  if (action.type === 'clear_error') {
    if (action.generation !== state.generation) return state;
    return { ...state, status: 'idle', statusMessage: undefined };
  }
  return { ...initialDeveloperChatSession, generation: state.generation + 1 };
}

export function selectDeveloperChatTranscript(
  messages: readonly DeveloperChatTurn[],
): DeveloperChatTurn[] {
  const latest = messages.at(-1);
  if (
    !latest ||
    latest.role !== 'user' ||
    !latest.content.trim() ||
    latest.content.length > MAX_CHAT_USER_MESSAGE_LENGTH
  ) return [];
  const selected: DeveloperChatTurn[] = [{ role: latest.role, content: latest.content }];
  let totalLength = latest.content.length;
  for (let index = messages.length - 2; index >= 1; index -= 1) {
    const assistant = messages[index];
    const user = messages[index - 1];
    if (assistant?.role !== 'assistant' || user?.role !== 'user') continue;
    if (
      !assistant.content.trim() ||
      assistant.content.length > MAX_CHAT_ASSISTANT_MESSAGE_LENGTH ||
      !user.content.trim() ||
      user.content.length > MAX_CHAT_USER_MESSAGE_LENGTH
    ) break;
    const pairLength = user.content.length + assistant.content.length;
    if (
      selected.length + 2 > MAX_CHAT_MESSAGES ||
      totalLength + pairLength > MAX_CHAT_TRANSCRIPT_LENGTH
    ) break;
    selected.unshift(
      { role: user.role, content: user.content },
      { role: assistant.role, content: assistant.content },
    );
    totalLength += pairLength;
    index -= 1;
  }
  return selected;
}

export function buildDeveloperChatRequest(
  context: DeveloperChatContextV1,
  messages: readonly DeveloperChatTurn[],
): DeveloperChatRequestV1 | undefined {
  const selected = selectDeveloperChatTranscript(messages);
  if (selected.length === 0) return undefined;
  const encoder = new TextEncoder();
  while (selected.length > 0) {
    const candidate = { context, messages: selected };
    if (encoder.encode(JSON.stringify(candidate)).byteLength <= MAX_CHAT_REQUEST_BYTES) {
      return candidate;
    }
    if (selected.length < 3) return undefined;
    selected.splice(0, 2);
  }
  return undefined;
}

export function citationSegments(text: string, citations: readonly DeveloperChatCitation[]) {
  const segments: Array<{ text: string; citation?: DeveloperChatCitation }> = [];
  let cursor = 0;
  for (const citation of [...citations].sort((left, right) => left.startIndex - right.startIndex)) {
    if (citation.startIndex < cursor || citation.endIndex > text.length) continue;
    if (citation.startIndex > cursor) {
      segments.push({ text: text.slice(cursor, citation.startIndex) });
    }
    segments.push({ text: text.slice(citation.startIndex, citation.endIndex), citation });
    cursor = citation.endIndex;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export type DeveloperChatErrorCode =
  | 'not_configured'
  | 'not_enrolled'
  | 'unauthorized'
  | 'rate_limited'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'invalid_request'
  | 'invalid_response';

export function developerChatErrorMessage(code: DeveloperChatErrorCode) {
  return {
    not_configured: 'Ten build nie ma skonfigurowanego adresu backendu.',
    not_enrolled: 'Najpierw połącz instalację w ustawieniach AI coacha.',
    unauthorized: 'Token instalacji został odwołany. Połącz instalację ponownie.',
    rate_limited: 'Dzienny limit czatu został wykorzystany. Wróć jutro.',
    timeout: 'Odpowiedź trwała zbyt długo. Sprawdź połączenie i spróbuj ponownie.',
    cancelled: '',
    network: 'Brak połączenia albo backend jest chwilowo niedostępny.',
    invalid_request: 'Rozmowa przekroczyła bezpieczny limit. Rozpocznij nowy czat.',
    invalid_response: 'Odpowiedź czatu nie przeszła kontroli bezpieczeństwa.',
  }[code];
}

function minimumTarget(exercise: ProtocolExercise) {
  return Math.max(exercise.unit === 'seconds' ? 5 : 1, Math.ceil(exercise.target / 2));
}

export function buildDeveloperChatContext(
  state: AppState,
  now = new Date(),
): DeveloperChatContextV1 | undefined {
  if (!state.profile || !state.baseline) return undefined;
  const protocol = currentProtocol(state);
  if (!protocol) return undefined;
  const coachContext = buildCoachContext(state, now);
  const todayOccurrence = occurrenceForToday(state, now);

  return {
    contextVersion: DEVELOPER_CHAT_CONTEXT_VERSION,
    localDate: toLocalDate(now),
    today: {
      state: coachContext.todayState,
      ...(todayOccurrence?.scheduledAt ? { scheduledAt: todayOccurrence.scheduledAt } : {}),
      ...(todayOccurrence?.chosenVariant
        ? { chosenVariant: todayOccurrence.chosenVariant }
        : {}),
      ...(todayOccurrence?.recommendedVariant
        ? { recommendedVariant: todayOccurrence.recommendedVariant }
        : {}),
    },
    baseline: {
      pushups: state.baseline.pushups,
      squats: state.baseline.squats,
      plankSeconds: state.baseline.plankSeconds,
    },
    availableMinutes: state.profile.availableMinutes,
    protocol: {
      version: protocol.version,
      daysPerWeek: protocol.daysPerWeek,
      preferredTime: protocol.preferredTime,
      exercises: protocol.exercises.map((exercise) => ({
        exerciseId: exercise.id,
        sets: exercise.sets,
        target: exercise.target,
        unit: exercise.unit,
      })),
    },
    minimumVariant: protocol.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      sets: 1,
      target: minimumTarget(exercise),
      unit: exercise.unit,
    })),
    consistency: coachContext.consistency,
    recentOccurrences: coachContext.recentOccurrences,
    recentFeedback: {
      totals: coachContext.recentFeedback.totals,
      byExercise: coachContext.recentFeedback.byExercise,
    },
    painOrLimitationReported: coachContext.recentFeedback.painOrLimitationReported,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

const exerciseIds = ['pushups', 'squats', 'plank'] as const;
const units = ['reps', 'seconds'] as const;
const occurrenceStatuses: WorkoutOccurrenceStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'skipped',
  'missed',
  'rescheduled',
];
const decisionReasons: DecisionReason[] = [
  'low_energy',
  'no_time',
  'pain_or_limitation',
  'exercise_resistance',
  'other',
];
const feedbackValues: SetFeedback[] = ['easy', 'ok', 'hard'];

function validCountRecord(value: unknown, keys: readonly string[]) {
  return (
    isRecord(value) &&
    exactKeys(value, keys) &&
    keys.every((key) => nonNegativeInteger(value[key]))
  );
}

function validExercise(value: unknown, minimum: boolean) {
  if (!isRecord(value)) return false;
  const sets = value.sets;
  const target = value.target;
  return (
    exactKeys(value, ['exerciseId', 'sets', 'target', 'unit']) &&
    oneOf(value.exerciseId, exerciseIds) &&
    nonNegativeInteger(sets) &&
    typeof sets === 'number' &&
    sets >= 1 &&
    (!minimum || sets === 1) &&
    nonNegativeInteger(target) &&
    typeof target === 'number' &&
    target >= 1 &&
    oneOf(value.unit, units)
  );
}

export function parseDeveloperChatContext(
  value: unknown,
): DeveloperChatContextV1 | undefined {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'availableMinutes',
      'baseline',
      'consistency',
      'contextVersion',
      'localDate',
      'minimumVariant',
      'painOrLimitationReported',
      'protocol',
      'recentFeedback',
      'recentOccurrences',
      'today',
    ]) ||
    value.contextVersion !== DEVELOPER_CHAT_CONTEXT_VERSION ||
    typeof value.localDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) ||
    ![5, 10, 15].includes(value.availableMinutes as number) ||
    typeof value.painOrLimitationReported !== 'boolean'
  ) return undefined;

  if (
    !isRecord(value.today) ||
    !Object.keys(value.today).every((key) =>
      ['chosenVariant', 'recommendedVariant', 'scheduledAt', 'state'].includes(key),
    ) ||
    !('state' in value.today) ||
    !oneOf(value.today.state, ['rest', 'scheduled', 'overdue', 'recovery', 'completed']) ||
    (value.today.scheduledAt !== undefined &&
      (typeof value.today.scheduledAt !== 'string' ||
        !Number.isFinite(Date.parse(value.today.scheduledAt)))) ||
    (value.today.chosenVariant !== undefined &&
      !oneOf(value.today.chosenVariant, ['standard', 'minimum'])) ||
    (value.today.recommendedVariant !== undefined &&
      !oneOf(value.today.recommendedVariant, ['standard', 'minimum']))
  ) return undefined;

  if (
    !isRecord(value.baseline) ||
    !exactKeys(value.baseline, ['plankSeconds', 'pushups', 'squats']) ||
    !nonNegativeInteger(value.baseline.pushups) ||
    !nonNegativeInteger(value.baseline.squats) ||
    !nonNegativeInteger(value.baseline.plankSeconds)
  ) return undefined;

  if (
    !isRecord(value.protocol) ||
    !exactKeys(value.protocol, [
      'daysPerWeek',
      'exercises',
      'preferredTime',
      'version',
    ]) ||
    !nonNegativeInteger(value.protocol.version) ||
    !nonNegativeInteger(value.protocol.daysPerWeek) ||
    !oneOf(value.protocol.preferredTime, ['morning', 'afternoon', 'evening']) ||
    !Array.isArray(value.protocol.exercises) ||
    value.protocol.exercises.length !== 3 ||
    !value.protocol.exercises.every((exercise) => validExercise(exercise, false)) ||
    new Set(
      value.protocol.exercises.map((exercise) =>
        isRecord(exercise) ? exercise.exerciseId : undefined,
      ),
    ).size !== 3 ||
    !Array.isArray(value.minimumVariant) ||
    value.minimumVariant.length !== 3 ||
    !value.minimumVariant.every((exercise) => validExercise(exercise, true)) ||
    new Set(
      value.minimumVariant.map((exercise) =>
        isRecord(exercise) ? exercise.exerciseId : undefined,
      ),
    ).size !== 3
  ) return undefined;

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

  if (
    !isRecord(value.recentOccurrences) ||
    !exactKeys(value.recentOccurrences, ['reasons', 'statuses']) ||
    !validCountRecord(value.recentOccurrences.statuses, occurrenceStatuses) ||
    !validCountRecord(value.recentOccurrences.reasons, decisionReasons)
  ) return undefined;

  if (
    !isRecord(value.recentFeedback) ||
    !exactKeys(value.recentFeedback, ['byExercise', 'totals']) ||
    !validCountRecord(value.recentFeedback.totals, feedbackValues) ||
    !Array.isArray(value.recentFeedback.byExercise) ||
    value.recentFeedback.byExercise.length > 3 ||
    !value.recentFeedback.byExercise.every(
      (entry) =>
        isRecord(entry) &&
        exactKeys(entry, ['easy', 'exerciseId', 'hard', 'ok']) &&
        oneOf(entry.exerciseId, exerciseIds) &&
        feedbackValues.every((feedback) => nonNegativeInteger(entry[feedback])),
    )
  ) return undefined;

  return value as unknown as DeveloperChatContextV1;
}

export function parseDeveloperChatRequest(
  value: unknown,
): DeveloperChatRequestV1 | undefined {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['context', 'messages']) ||
    !Array.isArray(value.messages) ||
    value.messages.length < 1 ||
    value.messages.length > MAX_CHAT_MESSAGES
  ) return undefined;
  const context = parseDeveloperChatContext(value.context);
  if (!context) return undefined;
  let transcriptLength = 0;
  const messages: DeveloperChatTurn[] = [];
  for (const message of value.messages) {
    if (
      !isRecord(message) ||
      !exactKeys(message, ['content', 'role']) ||
      !oneOf(message.role, ['user', 'assistant']) ||
      typeof message.content !== 'string'
    ) return undefined;
    const content = message.content.trim();
    const maximumLength = message.role === 'user'
      ? MAX_CHAT_USER_MESSAGE_LENGTH
      : MAX_CHAT_ASSISTANT_MESSAGE_LENGTH;
    if (!content || content.length > maximumLength) return undefined;
    transcriptLength += content.length;
    if (transcriptLength > MAX_CHAT_TRANSCRIPT_LENGTH) return undefined;
    messages.push({ role: message.role, content });
  }
  if (messages.at(-1)?.role !== 'user') return undefined;
  for (let index = 0; index < messages.length; index += 1) {
    const expectedRole = index % 2 === 0 ? 'user' : 'assistant';
    if (messages[index]?.role !== expectedRole) return undefined;
  }
  return { context, messages };
}
