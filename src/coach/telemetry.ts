import { AppState, CoachProposalRecord } from '../domain/types';

const terminalOutcomes = ['completed', 'skipped', 'missed', 'rescheduled'] as const;

function telemetryEvent(proposal: CoachProposalRecord) {
  if (
    proposal.source !== 'remote' ||
    !proposal.requestId ||
    !['applied', 'rejected'].includes(proposal.status) ||
    (proposal.outcomeStatus !== undefined &&
      !terminalOutcomes.includes(
        proposal.outcomeStatus as (typeof terminalOutcomes)[number],
      ))
  ) return undefined;
  const outcomeCode = proposal.outcomeStatus as
    | (typeof terminalOutcomes)[number]
    | undefined;
  return {
    eventId: `${proposal.requestId}:${proposal.status}:${outcomeCode ?? 'decision'}`,
    proposalId: proposal.proposalId,
    requestId: proposal.requestId,
    decision: proposal.status as 'applied' | 'rejected',
    ...(outcomeCode ? { outcomeCode } : {}),
  };
}

export function reconcileTelemetryOutbox(state: AppState, now = new Date()): AppState {
  if (state.remoteCoach.mode !== 'enabled') {
    const discardedEventIds = state.remoteCoach.telemetryOutbox.map(
      (event) => event.eventId,
    );
    const telemetrySettledEventIds = Array.from(
      new Set([
        ...state.remoteCoach.telemetrySettledEventIds,
        ...discardedEventIds,
      ]),
    ).slice(-200);
    const proposals = state.remoteCoach.proposals.map((proposal) =>
      proposal.requestId ? { ...proposal, requestId: undefined } : proposal,
    );
    const changed =
      state.remoteCoach.telemetryOutbox.length > 0 ||
      telemetrySettledEventIds.length !==
        state.remoteCoach.telemetrySettledEventIds.length ||
      proposals.some(
        (proposal, index) => proposal !== state.remoteCoach.proposals[index],
      );
    return !changed
      ? state
      : {
          ...state,
          remoteCoach: {
            ...state.remoteCoach,
            telemetryOutbox: [],
            telemetrySettledEventIds,
            proposals,
          },
        };
  }
  const existing = new Set([
    ...state.remoteCoach.telemetryOutbox.map((event) => event.eventId),
    ...state.remoteCoach.telemetrySettledEventIds,
  ]);
  const additions = state.remoteCoach.proposals
    .map(telemetryEvent)
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .filter((event) => !existing.has(event.eventId))
    .map((event) => ({
      ...event,
      attempts: 0,
      createdAt: now.toISOString(),
    }));
  if (additions.length === 0) return state;
  return {
    ...state,
    remoteCoach: {
      ...state.remoteCoach,
      telemetryOutbox: [...state.remoteCoach.telemetryOutbox, ...additions].slice(-100),
    },
  };
}

export function markTelemetryDelivered(state: AppState, eventId: string): AppState {
  const telemetryOutbox = state.remoteCoach.telemetryOutbox.filter(
    (event) => event.eventId !== eventId,
  );
  return telemetryOutbox.length === state.remoteCoach.telemetryOutbox.length
    ? state
    : {
        ...state,
        remoteCoach: {
          ...state.remoteCoach,
          telemetryOutbox,
          telemetrySettledEventIds: [
            ...state.remoteCoach.telemetrySettledEventIds,
            eventId,
          ].slice(-200),
        },
      };
}

const retryDelaysMs = [5_000, 30_000, 120_000, 600_000, 3_600_000] as const;

export function markTelemetryAttemptFailed(
  state: AppState,
  eventId: string,
  now = new Date(),
): AppState {
  let changed = false;
  let abandoned = false;
  const telemetryOutbox = state.remoteCoach.telemetryOutbox
    .map((event) => {
      if (event.eventId !== eventId) return event;
      changed = true;
      const attempts = event.attempts + 1;
      return {
        ...event,
        attempts,
        nextAttemptAt: new Date(
          now.getTime() + (retryDelaysMs[Math.min(attempts - 1, retryDelaysMs.length - 1)] ?? 0),
        ).toISOString(),
      };
    })
    .filter((event) => {
      if (event.attempts < 5) return true;
      abandoned = true;
      return false;
    });
  return changed
    ? {
        ...state,
        remoteCoach: {
          ...state.remoteCoach,
          telemetryOutbox,
          telemetrySettledEventIds: abandoned
            ? [...state.remoteCoach.telemetrySettledEventIds, eventId].slice(-200)
            : state.remoteCoach.telemetrySettledEventIds,
        },
      }
    : state;
}
