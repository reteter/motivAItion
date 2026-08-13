import {
  BackendEnv,
  DurableObjectState,
  DurableObjectStorage,
  UsageRecord,
} from './types';

const INSTALLATION_PREFIX = 'installation:';
const ACCESS_CODE_PREFIX = 'access-code:';
const USAGE_PREFIX = 'usage:';
const CHAT_USAGE_PREFIX = 'chat-usage:';
const ENROLLMENT_PREFIX = 'enrollment:';
const TELEMETRY_KEY = 'telemetry:events';
const ENROLLMENT_ATTEMPTS_PER_HOUR = 5;
const TELEMETRY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const ACCESS_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type QuotaPool = 'coach' | 'chat';

interface InstallationRecord {
  createdAt: string;
  revoked: boolean;
  revokedAt?: string;
}

interface EnrollmentRate {
  hour: string;
  attempts: number;
}

interface TelemetryEvent {
  eventId: string;
  proposalId: string;
  requestId: string;
  decision: 'applied' | 'rejected';
  outcomeCode?: 'completed' | 'skipped' | 'missed' | 'rescheduled';
  recordedAt: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function utcDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

function utcHour(now: Date) {
  return now.toISOString().slice(0, 13);
}

function tokenFromRequest(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
}

async function requestJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function installation(
  storage: DurableObjectStorage,
  tokenHash: string,
) {
  return storage.get<InstallationRecord>(`${INSTALLATION_PREFIX}${tokenHash}`);
}

export class CoachCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: BackendEnv,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    const now = new Date(request.headers.get('x-coordinator-now') ?? Date.now());

    if (request.method === 'POST' && url.pathname === '/enroll') {
      return this.enroll(request, now);
    }

    const token = tokenFromRequest(request);
    if (!token) return json(401, { error: 'unauthorized' });
    const tokenHash = await sha256(token);

    if (request.method === 'POST' && url.pathname === '/authorize') {
      const record = await installation(this.state.storage, tokenHash);
      return record && !record.revoked
        ? json(200, { authorized: true })
        : json(401, { error: 'unauthorized' });
    }
    if (request.method === 'POST' && url.pathname === '/reserve') {
      return this.reserve(request, tokenHash, now, 'coach');
    }
    if (request.method === 'POST' && url.pathname === '/settle') {
      return this.settle(request, tokenHash, now, 'coach');
    }
    if (request.method === 'POST' && url.pathname === '/chat/reserve') {
      return this.reserve(request, tokenHash, now, 'chat');
    }
    if (request.method === 'POST' && url.pathname === '/chat/settle') {
      return this.settle(request, tokenHash, now, 'chat');
    }
    if (request.method === 'POST' && url.pathname === '/revoke') {
      return this.revoke(tokenHash, now);
    }
    if (request.method === 'POST' && url.pathname === '/telemetry') {
      return this.telemetry(request, tokenHash, now);
    }
    return json(404, { error: 'not_found' });
  }

  private async enroll(request: Request, now: Date) {
    const body = await requestJson(request);
    const accessCode = body?.accessCode;
    const ipHash = body?.ipHash;
    if (
      typeof accessCode !== 'string' ||
      !ACCESS_CODE_PATTERN.test(accessCode) ||
      typeof ipHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ipHash)
    ) return json(400, { error: 'invalid_access_code' });

    const submittedHash = await sha256(accessCode);
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = base64Url(tokenBytes);
    const tokenHash = await sha256(token);
    const result = await this.state.storage.transaction(async (transaction) => {
      const rateKey = `${ENROLLMENT_PREFIX}${ipHash}`;
      const currentHour = utcHour(now);
      const storedRate = await transaction.get<EnrollmentRate>(rateKey);
      const rate = storedRate?.hour === currentHour
        ? storedRate
        : { hour: currentHour, attempts: 0 };
      if (rate.attempts >= ENROLLMENT_ATTEMPTS_PER_HOUR) return 'rate_limited' as const;
      await transaction.put(rateKey, { hour: currentHour, attempts: rate.attempts + 1 });
      if (!constantTimeEqual(submittedHash, this.env.ACCESS_CODE_HASH.toLowerCase())) {
        return 'invalid' as const;
      }
      const codeKey = `${ACCESS_CODE_PREFIX}${submittedHash}`;
      if (await transaction.get(codeKey)) return 'invalid' as const;
      await transaction.put(codeKey, { usedAt: now.toISOString(), installationHash: tokenHash });
      await transaction.put<InstallationRecord>(`${INSTALLATION_PREFIX}${tokenHash}`, {
        createdAt: now.toISOString(),
        revoked: false,
      });
      return 'issued' as const;
    });
    if (result === 'rate_limited') return json(429, { error: 'enrollment_rate_limited' });
    return result === 'issued'
      ? json(201, { installationToken: token })
      : json(403, { error: 'invalid_or_used_access_code' });
  }

  private async reserve(
    request: Request,
    tokenHash: string,
    now: Date,
    pool: QuotaPool,
  ) {
    const body = await requestJson(request);
    const reservedTokens = body?.reservedTokens;
    const minimumReservation = pool === 'chat' ? 2_000 : 500;
    const maximumReservation = pool === 'chat' ? 200_000 : 24_500;
    if (
      typeof reservedTokens !== 'number' ||
      !Number.isInteger(reservedTokens) ||
      reservedTokens < minimumReservation ||
      reservedTokens > maximumReservation
    ) return json(400, { error: 'invalid_reservation' });
    const result = await this.state.storage.transaction(async (transaction) => {
      const record = await installation(transaction, tokenHash);
      if (!record || record.revoked) return 'unauthorized' as const;
      const usagePrefix = pool === 'chat' ? CHAT_USAGE_PREFIX : USAGE_PREFIX;
      const usageKey = `${usagePrefix}${tokenHash}:${utcDay(now)}`;
      const usage = (await transaction.get<UsageRecord>(usageKey)) ?? {
        requests: 0,
        tokens: 0,
      };
      const maxRequests = pool === 'chat'
        ? positiveLimit(this.env.MAX_CHAT_REQUESTS_PER_DAY, 30)
        : positiveLimit(this.env.MAX_REQUESTS_PER_DAY, 20);
      const maxTokens = pool === 'chat'
        ? positiveLimit(this.env.MAX_CHAT_TOKENS_PER_DAY, 200_000)
        : positiveLimit(this.env.MAX_TOKENS_PER_DAY, 20_000);
      if (usage.requests >= maxRequests || usage.tokens + reservedTokens > maxTokens) {
        return 'rate_limited' as const;
      }
      await transaction.put<UsageRecord>(usageKey, {
        requests: usage.requests + 1,
        tokens: usage.tokens + reservedTokens,
      });
      return 'reserved' as const;
    });
    if (result === 'unauthorized') return json(401, { error: result });
    if (result === 'rate_limited') return json(429, { error: result });
    return json(200, { reservedTokens });
  }

  private async settle(
    request: Request,
    tokenHash: string,
    now: Date,
    pool: QuotaPool,
  ) {
    const body = await requestJson(request);
    const actualTokens = body?.actualTokens;
    const reservedTokens = body?.reservedTokens;
    const minimumReservation = pool === 'chat' ? 2_000 : 500;
    const maximumReservation = pool === 'chat' ? 200_000 : 24_500;
    if (
      typeof actualTokens !== 'number' || !Number.isInteger(actualTokens) || actualTokens < 0 ||
      typeof reservedTokens !== 'number' || !Number.isInteger(reservedTokens) ||
      reservedTokens < minimumReservation || reservedTokens > maximumReservation ||
      actualTokens > reservedTokens
    ) {
      return json(400, { error: 'invalid_usage' });
    }
    const authorized = await this.state.storage.transaction(async (transaction) => {
      const record = await installation(transaction, tokenHash);
      if (!record || record.revoked) return false;
      const usagePrefix = pool === 'chat' ? CHAT_USAGE_PREFIX : USAGE_PREFIX;
      const usageKey = `${usagePrefix}${tokenHash}:${utcDay(now)}`;
      const usage = (await transaction.get<UsageRecord>(usageKey)) ?? {
        requests: 0,
        tokens: reservedTokens,
      };
      await transaction.put<UsageRecord>(usageKey, {
        ...usage,
        tokens: Math.max(0, usage.tokens - reservedTokens) + actualTokens,
      });
      return true;
    });
    return authorized ? json(200, { settled: true }) : json(401, { error: 'unauthorized' });
  }

  private async revoke(tokenHash: string, now: Date) {
    const revoked = await this.state.storage.transaction(async (transaction) => {
      const record = await installation(transaction, tokenHash);
      if (!record) return false;
      await transaction.put<InstallationRecord>(`${INSTALLATION_PREFIX}${tokenHash}`, {
        ...record,
        revoked: true,
        revokedAt: now.toISOString(),
      });
      return true;
    });
    return revoked ? new Response(null, { status: 204 }) : json(401, { error: 'unauthorized' });
  }

  private async telemetry(request: Request, tokenHash: string, now: Date) {
    const body = await requestJson(request);
    const proposalId = body?.proposalId;
    const requestId = body?.requestId;
    const decision = body?.decision;
    const outcomeCode = body?.outcomeCode;
    if (
      typeof proposalId !== 'string' || proposalId.length > 120 ||
      typeof requestId !== 'string' || requestId.length > 120 ||
      !['applied', 'rejected'].includes(decision as string) ||
      (outcomeCode !== undefined &&
        !['completed', 'skipped', 'missed', 'rescheduled'].includes(outcomeCode as string))
    ) return json(400, { error: 'invalid_telemetry' });

    const stored = await this.state.storage.transaction(async (transaction) => {
      const record = await installation(transaction, tokenHash);
      if (!record || record.revoked) return false;
      const eventId = `${requestId}:${decision}:${outcomeCode ?? 'decision'}`;
      const current = (await transaction.get<TelemetryEvent[]>(TELEMETRY_KEY)) ?? [];
      const retained = current.filter(
        (event) => now.getTime() - Date.parse(event.recordedAt) <= TELEMETRY_RETENTION_MS,
      );
      if (!retained.some((event) => event.eventId === eventId)) {
        retained.push({
          eventId,
          proposalId,
          requestId,
          decision: decision as TelemetryEvent['decision'],
          outcomeCode: outcomeCode as TelemetryEvent['outcomeCode'],
          recordedAt: now.toISOString(),
        });
        await transaction.put(TELEMETRY_KEY, retained.slice(-200));
      }
      return true;
    });
    if (!stored) return json(401, { error: 'unauthorized' });
    return new Response(null, { status: 204 });
  }
}
