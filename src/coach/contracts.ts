import {
  BehavioralObservationKind,
  BoundedCoachAction,
  CoachProposalRationaleCode,
  CoachProposalV1,
  ProtocolExercise,
} from '../domain/types';

export const COACH_CONTEXT_VERSION = 'coach_context_v1' as const;
export const COACH_PROMPT_VERSION = 'm3-v1' as const;

const rationaleCodes: readonly CoachProposalRationaleCode[] = [
  'recovery_after_gap',
  'low_recent_consistency',
  'time_pressure_pattern',
  'pain_requires_caution',
  'positive_momentum',
  'insufficient_evidence',
];
const exerciseIds: readonly ProtocolExercise['id'][] = [
  'pushups',
  'squats',
  'plank',
];
const remoteObservationKinds: readonly BehavioralObservationKind[] = [
  'time_pressure_pattern',
  'low_adherence_pattern',
  'minimum_helped_pattern',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && keys.every((key, index) => key === actual[index]);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function oneOf<T>(value: unknown, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function parseAction(value: unknown): BoundedCoachAction | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  if (value.type === 'recommend_minimum_workout') {
    if (
      !hasExactKeys(value, ['occurrenceId', 'reason', 'type']) ||
      !isBoundedString(value.occurrenceId, 1, 120) ||
      !oneOf(value.reason, ['low_consistency', 'time_pressure', 'recovery'] as const)
    ) return undefined;
    return {
      type: value.type,
      occurrenceId: value.occurrenceId,
      reason: value.reason,
    };
  }

  if (value.type === 'recommend_recovery_workout') {
    if (
      !hasExactKeys(value, ['occurrenceId', 'type']) ||
      !isBoundedString(value.occurrenceId, 1, 120)
    ) return undefined;
    return { type: value.type, occurrenceId: value.occurrenceId };
  }

  if (value.type === 'modify_future_protocol') {
    if (
      !hasExactKeys(value, ['changes', 'reason', 'type']) ||
      value.reason !== 'ai_proposal' ||
      !Array.isArray(value.changes) ||
      value.changes.length < 1 ||
      value.changes.length > 3
    ) return undefined;
    const changes: Extract<
      BoundedCoachAction,
      { type: 'modify_future_protocol' }
    >['changes'] = [];
    for (const change of value.changes) {
      if (
        !isRecord(change) ||
        !hasExactKeys(change, ['exerciseId', 'source', 'targetDelta']) ||
        !oneOf(change.exerciseId, exerciseIds) ||
        !Number.isInteger(change.targetDelta) ||
        (change.targetDelta as number) === 0 ||
        Math.abs(change.targetDelta as number) > 5 ||
        !oneOf(change.source, ['ai_caution', 'ai_progression'] as const)
      ) return undefined;
      changes.push({
        exerciseId: change.exerciseId,
        targetDelta: change.targetDelta as number,
        source: change.source,
      });
    }
    return { type: value.type, reason: value.reason, changes };
  }

  if (value.type === 'add_behavioral_observation') {
    if (
      !hasExactKeys(value, ['observation', 'type']) ||
      !isRecord(value.observation) ||
      !hasExactKeys(value.observation, ['confidence', 'evidence', 'kind']) ||
      !oneOf(value.observation.kind, remoteObservationKinds) ||
      typeof value.observation.confidence !== 'number' ||
      !Number.isFinite(value.observation.confidence) ||
      value.observation.confidence < 0.3 ||
      value.observation.confidence > 0.8 ||
      !isBoundedString(value.observation.evidence, 1, 160)
    ) return undefined;
    return {
      type: value.type,
      observation: {
        kind: value.observation.kind,
        confidence: value.observation.confidence,
        evidence: value.observation.evidence,
      },
    };
  }

  return undefined;
}

export function parseCoachProposal(value: unknown): CoachProposalV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (!hasOnlyKeys(value, [
    'proposalId',
    'message',
    'rationaleCode',
    'action',
    'expiresAt',
    'promptVersion',
  ])) return undefined;
  if (!hasExactKeys(value, [
    'action',
    'expiresAt',
    'message',
    'promptVersion',
    'proposalId',
    'rationaleCode',
  ])) return undefined;

  const action = parseAction(value.action);
  if (
    action === undefined ||
    !isBoundedString(value.proposalId, 1, 120) ||
    !isBoundedString(value.message, 1, 240) ||
    !oneOf(value.rationaleCode, rationaleCodes) ||
    !isIsoDate(value.expiresAt) ||
    !isBoundedString(value.promptVersion, 1, 40)
  ) return undefined;

  return {
    proposalId: value.proposalId,
    message: value.message.trim(),
    rationaleCode: value.rationaleCode,
    action,
    expiresAt: value.expiresAt,
    promptVersion: value.promptVersion,
  };
}

export function proposalIsExpired(proposal: CoachProposalV1, now = new Date()) {
  return new Date(proposal.expiresAt).getTime() <= now.getTime();
}
