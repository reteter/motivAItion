import { applyCoachAction, validateCoachAction } from '../domain/coach';
import { nextActionableOccurrence } from '../domain/schedule';
import {
  AppState,
  BoundedCoachAction,
  CoachProposalRecord,
  CoachProposalV1,
} from '../domain/types';
import { buildCoachContext } from './context';
import {
  COACH_PROMPT_VERSION,
  proposalIsExpired,
} from './contracts';

function actionOccurrenceId(action: BoundedCoachAction | null) {
  if (
    action?.type === 'recommend_minimum_workout' ||
    action?.type === 'recommend_recovery_workout'
  ) return action.occurrenceId;
  return undefined;
}

export function validateProposalForState(
  state: AppState,
  proposal: CoachProposalV1,
  now = new Date(),
) {
  if (
    proposal.promptVersion !== COACH_PROMPT_VERSION ||
    proposalIsExpired(proposal, now) ||
    state.remoteCoach.proposals.some((candidate) => candidate.proposalId === proposal.proposalId)
  ) return false;
  if (!proposal.action) return true;

  const context = buildCoachContext(state, now);
  if (!context.allowedProposalTypes.includes(proposal.action.type)) return false;
  const occurrenceId = actionOccurrenceId(proposal.action);
  if (occurrenceId && occurrenceId !== context.nextOccurrence?.occurrenceId) return false;

  if (proposal.action.type === 'modify_future_protocol') {
    const ids = new Set(proposal.action.changes.map((change) => change.exerciseId));
    if (ids.size !== proposal.action.changes.length) return false;
    for (const change of proposal.action.changes) {
      const allowed = context.allowedProtocolChanges.find(
        (candidate) => candidate.exerciseId === change.exerciseId,
      );
      if (!allowed?.allowedTargetDeltas.includes(change.targetDelta)) return false;
      if (
        (change.targetDelta < 0 && change.source !== 'ai_caution') ||
        (change.targetDelta > 0 && change.source !== 'ai_progression')
      ) return false;
    }
  }

  return validateCoachAction(state, proposal.action);
}

export function storeCoachProposal(
  state: AppState,
  proposal: CoachProposalV1,
  source: CoachProposalRecord['source'],
  now = new Date(),
  requestId?: string,
): AppState {
  if (!validateProposalForState(state, proposal, now)) return state;
  const record: CoachProposalRecord = {
    ...proposal,
    source,
    requestId,
    receivedAt: now.toISOString(),
    status: 'pending',
  };
  return {
    ...state,
    remoteCoach: {
      ...state.remoteCoach,
      proposals: [record, ...state.remoteCoach.proposals].slice(0, 50),
    },
  };
}

export function decideCoachProposal(
  state: AppState,
  proposalId: string,
  decision: 'apply' | 'reject',
  now = new Date(),
): AppState {
  const proposal = state.remoteCoach.proposals.find(
    (candidate) => candidate.proposalId === proposalId,
  );
  if (!proposal || proposal.status !== 'pending') return state;
  if (proposalIsExpired(proposal, now)) {
    return {
      ...state,
      remoteCoach: {
        ...state.remoteCoach,
        proposals: state.remoteCoach.proposals.map((candidate) =>
          candidate.proposalId === proposalId
            ? { ...candidate, status: 'expired', decidedAt: now.toISOString() }
            : candidate,
        ),
      },
    };
  }

  if (decision === 'reject') {
    const outcomeOccurrenceId =
      actionOccurrenceId(proposal.action) ?? nextActionableOccurrence(state, now)?.id;
    return {
      ...state,
      remoteCoach: {
        ...state.remoteCoach,
        proposals: state.remoteCoach.proposals.map((candidate) =>
          candidate.proposalId === proposalId
            ? {
                ...candidate,
                status: 'rejected',
                decidedAt: now.toISOString(),
                outcomeOccurrenceId,
              }
            : candidate,
        ),
      },
    };
  }

  const proposalWithoutHistory: CoachProposalV1 = {
    proposalId: proposal.proposalId,
    message: proposal.message,
    rationaleCode: proposal.rationaleCode,
    action: proposal.action,
    expiresAt: proposal.expiresAt,
    promptVersion: proposal.promptVersion,
  };
  const stateWithoutProposal = {
    ...state,
    remoteCoach: {
      ...state.remoteCoach,
      proposals: state.remoteCoach.proposals.filter(
        (candidate) => candidate.proposalId !== proposalId,
      ),
    },
  };
  if (!validateProposalForState(stateWithoutProposal, proposalWithoutHistory, now)) {
    return state;
  }

  const outcomeOccurrenceId =
    actionOccurrenceId(proposal.action) ?? nextActionableOccurrence(state, now)?.id;
  const actionState = proposal.action
    ? applyCoachAction(state, proposal.action, now)
    : state;
  if (proposal.action && actionState === state) return state;
  return {
    ...actionState,
    remoteCoach: {
      ...actionState.remoteCoach,
      proposals: actionState.remoteCoach.proposals.map((candidate) =>
        candidate.proposalId === proposalId
          ? {
              ...candidate,
              status: 'applied',
              decidedAt: now.toISOString(),
              outcomeOccurrenceId,
            }
          : candidate,
      ),
    },
  };
}

export function recordCoachProposalOutcomes(state: AppState, now = new Date()): AppState {
  let changed = false;
  const proposals = state.remoteCoach.proposals.map((proposal) => {
    if (proposal.status === 'pending' && proposalIsExpired(proposal, now)) {
      changed = true;
      return {
        ...proposal,
        status: 'expired' as const,
        decidedAt: now.toISOString(),
      };
    }
    if (
      !['applied', 'rejected'].includes(proposal.status) ||
      !proposal.outcomeOccurrenceId ||
      proposal.outcomeRecordedAt
    ) return proposal;
    const occurrence = state.occurrences.find(
      (candidate) => candidate.id === proposal.outcomeOccurrenceId,
    );
    if (
      !occurrence ||
      !['completed', 'skipped', 'missed', 'rescheduled'].includes(occurrence.status)
    ) return proposal;
    changed = true;
    return {
      ...proposal,
      outcomeStatus: occurrence.status,
      outcomeRecordedAt: now.toISOString(),
    };
  });
  return changed
    ? { ...state, remoteCoach: { ...state.remoteCoach, proposals } }
    : state;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createLocalFallbackProposal(
  state: AppState,
  now = new Date(),
): CoachProposalV1 {
  const context = buildCoachContext(state, now);
  const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1_000).toISOString();
  const proposalId = `local-${stableHash(JSON.stringify(context))}`;
  const occurrenceId = context.nextOccurrence?.occurrenceId;

  if (occurrenceId && context.recentFeedback.painOrLimitationReported) {
    return {
      proposalId,
      message: 'Po ostatnim sygnale bólu proponuję spokojne Minimum. Jeśli ból trwa, odpuść trening i skonsultuj go ze specjalistą.',
      rationaleCode: 'pain_requires_caution',
      action: { type: 'recommend_recovery_workout', occurrenceId },
      expiresAt,
      promptVersion: COACH_PROMPT_VERSION,
    };
  }
  if (occurrenceId && context.todayState === 'recovery') {
    return {
      proposalId,
      message: 'Wróć przez Minimum. Celem jest ponownie pojawić się na treningu, nie nadrabiać przerwę.',
      rationaleCode: 'recovery_after_gap',
      action: {
        type: 'recommend_minimum_workout',
        occurrenceId,
        reason: 'recovery',
      },
      expiresAt,
      promptVersion: COACH_PROMPT_VERSION,
    };
  }
  if (occurrenceId && context.recentOccurrences.reasons.no_time >= 2) {
    return {
      proposalId,
      message: 'Brak czasu powtarzał się ostatnio. Dzisiejsze Minimum ma utrzymać rytm bez rozpychania dnia.',
      rationaleCode: 'time_pressure_pattern',
      action: {
        type: 'recommend_minimum_workout',
        occurrenceId,
        reason: 'time_pressure',
      },
      expiresAt,
      promptVersion: COACH_PROMPT_VERSION,
    };
  }
  const { completed, planned } = context.consistency.days7;
  if (occurrenceId && planned >= 2 && completed / planned < 0.5) {
    return {
      proposalId,
      message: 'Ostatni tydzień był nierówny. Ustawmy niższy próg: zrób Minimum i zamknij dzisiejszą sesję.',
      rationaleCode: 'low_recent_consistency',
      action: {
        type: 'recommend_minimum_workout',
        occurrenceId,
        reason: 'low_consistency',
      },
      expiresAt,
      promptVersion: COACH_PROMPT_VERSION,
    };
  }
  return {
    proposalId,
    message: occurrenceId
      ? 'Plan wygląda wykonalnie. Zostawiam go bez zmian i proponuję zacząć od pierwszej serii.'
      : 'Dziś odpoczynek. Nie dokładam zadania tylko po to, żeby podbić licznik.',
    rationaleCode: occurrenceId ? 'positive_momentum' : 'insufficient_evidence',
    action: null,
    expiresAt,
    promptVersion: COACH_PROMPT_VERSION,
  };
}
