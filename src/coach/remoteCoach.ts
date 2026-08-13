import * as SecureStore from 'expo-secure-store';

import { CoachProposalV1, RemoteCoachRequestMetadata } from '../domain/types';
import { CoachContextV1 } from './context';
import { parseCoachProposal } from './contracts';

const INSTALLATION_TOKEN_KEY = 'motivaition.remote-coach.installation-token.v1';
const DEFAULT_TIMEOUT_MS = 5_000;

export interface RemoteProposalResult {
  proposal: CoachProposalV1;
  metadata: Omit<RemoteCoachRequestMetadata, 'source' | 'resultCode'>;
}

export interface RemoteCoach {
  isConfigured(): boolean;
  cancelPending(): void;
  hasInstallation(): Promise<boolean>;
  enroll(accessCode: string): Promise<void>;
  revoke(): Promise<void>;
  propose(context: CoachContextV1): Promise<RemoteProposalResult>;
  recordEvent(event: {
    proposalId: string;
    requestId: string;
    decision: 'applied' | 'rejected';
    outcomeCode?: 'completed' | 'skipped' | 'missed' | 'rescheduled';
  }): Promise<void>;
}

export class RemoteCoachError extends Error {
  constructor(
    readonly code:
      | 'not_configured'
      | 'not_enrolled'
      | 'unauthorized'
      | 'rate_limited'
      | 'timeout'
      | 'network'
      | 'invalid_response',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteCoachError';
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RemoteCoachError('timeout', 'Zdalny coach nie odpowiedział na czas.');
    }
    throw new RemoteCoachError('network', 'Nie udało się połączyć ze zdalnym coachem.');
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function requestWithSingleRetry(
  input: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
) {
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchWithTimeout(input, init, DEFAULT_TIMEOUT_MS, externalSignal);
      if (response.status < 500 || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
  }
  if (response) return response;
  throw lastError;
}

function endpointUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function configuredEndpoint() {
  return process.env.EXPO_PUBLIC_COACH_API_URL?.trim() ?? '';
}

export class HttpRemoteCoach implements RemoteCoach {
  private readonly pendingControllers = new Set<AbortController>();
  private pendingEnrollment?: Promise<void>;

  constructor(private readonly baseUrl = configuredEndpoint()) {}

  isConfigured() {
    return /^https:\/\//.test(this.baseUrl);
  }

  cancelPending() {
    for (const controller of this.pendingControllers) controller.abort();
    this.pendingControllers.clear();
  }

  private async cancelable<T>(request: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    this.pendingControllers.add(controller);
    try {
      return await request(controller.signal);
    } finally {
      this.pendingControllers.delete(controller);
    }
  }

  async hasInstallation() {
    return Boolean(await SecureStore.getItemAsync(INSTALLATION_TOKEN_KEY));
  }

  async enroll(accessCode: string) {
    if (!this.isConfigured()) {
      throw new RemoteCoachError('not_configured', 'Endpoint AI coacha nie jest skonfigurowany.');
    }
    const enrollment = this.cancelable(async (signal) => {
      const response = await fetchWithTimeout(
        endpointUrl(this.baseUrl, '/v1/installations'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessCode: accessCode.trim() }),
        },
        DEFAULT_TIMEOUT_MS,
        signal,
      );
      if (response.status === 401 || response.status === 403) {
        throw new RemoteCoachError('unauthorized', 'Kod dostępu jest nieprawidłowy lub wykorzystany.');
      }
      if (!response.ok) {
        throw new RemoteCoachError('network', 'Nie udało się aktywować instalacji.');
      }
      const body: unknown = await response.json();
      const installationToken =
        body && typeof body === 'object' && 'installationToken' in body
          ? (body as { installationToken?: unknown }).installationToken
          : undefined;
      if (typeof installationToken !== 'string' || installationToken.length < 32) {
        throw new RemoteCoachError('invalid_response', 'Backend zwrócił nieprawidłowy token.');
      }
      if (signal.aborted) {
        throw new RemoteCoachError('network', 'Aktywacja instalacji została anulowana.');
      }
      await SecureStore.setItemAsync(INSTALLATION_TOKEN_KEY, installationToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (signal.aborted) {
        throw new RemoteCoachError('network', 'Aktywacja instalacji została anulowana.');
      }
    });
    this.pendingEnrollment = enrollment;
    try {
      await enrollment;
    } finally {
      if (this.pendingEnrollment === enrollment) this.pendingEnrollment = undefined;
    }
  }

  async revoke() {
    const pendingEnrollment = this.pendingEnrollment;
    if (pendingEnrollment) await pendingEnrollment.catch(() => undefined);
    const token = await SecureStore.getItemAsync(INSTALLATION_TOKEN_KEY);
    if (!token) return;
    if (!this.isConfigured()) {
      throw new RemoteCoachError('not_configured', 'Nie można teraz odwołać tokenu na backendzie.');
    }
    const response = await fetchWithTimeout(
      endpointUrl(this.baseUrl, '/v1/installations/current'),
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok && response.status !== 401 && response.status !== 403) {
      throw new RemoteCoachError('network', 'Nie udało się odwołać tokenu na backendzie.');
    }
    await SecureStore.deleteItemAsync(INSTALLATION_TOKEN_KEY);
  }

  async propose(context: CoachContextV1): Promise<RemoteProposalResult> {
    if (!this.isConfigured()) {
      throw new RemoteCoachError('not_configured', 'Endpoint AI coacha nie jest skonfigurowany.');
    }
    const token = await SecureStore.getItemAsync(INSTALLATION_TOKEN_KEY);
    if (!token) {
      throw new RemoteCoachError('not_enrolled', 'Ta instalacja nie ma aktywnego tokenu.');
    }
    const response = await this.cancelable((signal) =>
      requestWithSingleRetry(
        endpointUrl(this.baseUrl, '/v1/coach/proposals'),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(context),
        },
        signal,
      ),
    );
    if (response.status === 401 || response.status === 403) {
      throw new RemoteCoachError('unauthorized', 'Token instalacji został unieważniony.');
    }
    if (response.status === 429) {
      throw new RemoteCoachError('rate_limited', 'Dzienny limit zdalnego coacha został wykorzystany.');
    }
    if (!response.ok) {
      throw new RemoteCoachError('network', 'Zdalny coach jest chwilowo niedostępny.');
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') {
      throw new RemoteCoachError('invalid_response', 'Backend zwrócił pustą odpowiedź.');
    }
    const raw = body as { proposal?: unknown; metadata?: unknown };
    const proposal = parseCoachProposal(raw.proposal);
    const metadata = raw.metadata;
    const candidate = metadata as {
      requestId?: unknown;
      requestedAt?: unknown;
      latencyMs?: unknown;
      promptVersion?: unknown;
      modelVersion?: unknown;
      inputTokens?: unknown;
      outputTokens?: unknown;
    };
    if (
      !proposal ||
      !metadata ||
      typeof metadata !== 'object' ||
      typeof candidate.requestId !== 'string' ||
      typeof candidate.requestedAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.requestedAt)) ||
      typeof candidate.promptVersion !== 'string' ||
      (candidate.latencyMs !== undefined &&
        (typeof candidate.latencyMs !== 'number' || candidate.latencyMs < 0)) ||
      (candidate.modelVersion !== undefined && typeof candidate.modelVersion !== 'string') ||
      (candidate.inputTokens !== undefined &&
        (typeof candidate.inputTokens !== 'number' || candidate.inputTokens < 0)) ||
      (candidate.outputTokens !== undefined &&
        (typeof candidate.outputTokens !== 'number' || candidate.outputTokens < 0))
    ) {
      throw new RemoteCoachError('invalid_response', 'Odpowiedź coacha nie przeszła walidacji.');
    }
    return {
      proposal,
      metadata: {
        requestId: candidate.requestId,
        requestedAt: candidate.requestedAt,
        promptVersion: candidate.promptVersion,
        ...(typeof candidate.latencyMs === 'number'
          ? { latencyMs: Math.round(candidate.latencyMs) }
          : {}),
        ...(typeof candidate.modelVersion === 'string'
          ? { modelVersion: candidate.modelVersion }
          : {}),
        ...(typeof candidate.inputTokens === 'number'
          ? { inputTokens: Math.round(candidate.inputTokens) }
          : {}),
        ...(typeof candidate.outputTokens === 'number'
          ? { outputTokens: Math.round(candidate.outputTokens) }
          : {}),
      },
    };
  }

  async recordEvent(event: {
    proposalId: string;
    requestId: string;
    decision: 'applied' | 'rejected';
    outcomeCode?: 'completed' | 'skipped' | 'missed' | 'rescheduled';
  }) {
    if (!this.isConfigured()) {
      throw new RemoteCoachError('not_configured', 'Endpoint AI coacha nie jest skonfigurowany.');
    }
    const token = await SecureStore.getItemAsync(INSTALLATION_TOKEN_KEY);
    if (!token) {
      throw new RemoteCoachError('not_enrolled', 'Ta instalacja nie ma aktywnego tokenu.');
    }
    const response = await this.cancelable((signal) =>
      fetchWithTimeout(
        endpointUrl(this.baseUrl, '/v1/coach/events'),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(event),
        },
        DEFAULT_TIMEOUT_MS,
        signal,
      ),
    );
    if (!response.ok) {
      throw new RemoteCoachError('network', 'Nie udało się zapisać metadanych decyzji.');
    }
  }
}

export const remoteCoach = new HttpRemoteCoach();
