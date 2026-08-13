import {
  AppState,
  CoachProposalV1,
  RemoteCoachRequestMetadata,
} from '../domain/types';
import { buildCoachContext } from './context';
import {
  createLocalFallbackProposal,
  validateProposalForState,
} from './proposals';

export interface ProposalProvider {
  propose(context: ReturnType<typeof buildCoachContext>): Promise<{
    proposal: CoachProposalV1;
    metadata: Omit<RemoteCoachRequestMetadata, 'source' | 'resultCode'>;
  }>;
}

export interface CoachResolution {
  proposal: CoachProposalV1;
  source: 'remote' | 'local';
  resultCode: RemoteCoachRequestMetadata['resultCode'];
  metadata: Omit<RemoteCoachRequestMetadata, 'source' | 'resultCode'>;
  failureCode?: string;
}

export async function resolveCoachProposal(
  state: AppState,
  provider: ProposalProvider | undefined,
  now = new Date(),
): Promise<CoachResolution> {
  const fallback = createLocalFallbackProposal(state, now);
  const fallbackMetadata = {
    requestId: fallback.proposalId,
    requestedAt: now.toISOString(),
    promptVersion: fallback.promptVersion,
  };
  if (!provider) {
    return {
      proposal: fallback,
      source: 'local',
      resultCode: 'fallback',
      metadata: fallbackMetadata,
      failureCode: 'not_enrolled',
    };
  }

  try {
    const remote = await provider.propose(buildCoachContext(state, now));
    if (!validateProposalForState(state, remote.proposal, now)) {
      return {
        proposal: fallback,
        source: 'local',
        resultCode: 'invalid_proposal',
        metadata: fallbackMetadata,
        failureCode: 'invalid_response',
      };
    }
    return {
      proposal: remote.proposal,
      source: 'remote',
      resultCode: 'success',
      metadata: remote.metadata,
    };
  } catch (error) {
    const failureCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'network';
    return {
      proposal: fallback,
      source: 'local',
      resultCode: 'fallback',
      metadata: fallbackMetadata,
      failureCode,
    };
  }
}
