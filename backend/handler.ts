import { parseCoachContext } from '../src/coach/context';
import {
  MAX_CHAT_REQUEST_BYTES,
  parseDeveloperChatRequest,
} from '../src/coach/developerChat';
import { sha256 } from './coordinator';
import {
  ModelResponseError,
  requestDeveloperChat,
  requestModelProposal,
} from './openai';
import { BackendEnv } from './types';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function coordinator(env: BackendEnv) {
  return env.COACH_COORDINATOR.get(env.COACH_COORDINATOR.idFromName('global'));
}

function coordinatorRequest(
  path: string,
  request: Request,
  body?: unknown,
  now = new Date(),
) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-coordinator-now': now.toISOString(),
  });
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  return new Request(`https://coordinator.internal${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function requestJson(request: Request, maxBytes = 24_000) {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > maxBytes) {
      return undefined;
    }
  }
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('request_body_too_large');
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

export async function handleRequest(
  request: Request,
  env: BackendEnv,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, { status: 'ok', promptVersion: env.PROMPT_VERSION });
  }

  if (request.method === 'POST' && url.pathname === '/v1/installations') {
    const body = await requestJson(request);
    const accessCode =
      body && typeof body === 'object' && 'accessCode' in body
        ? (body as { accessCode?: unknown }).accessCode
        : undefined;
    if (
      typeof accessCode !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(accessCode)
    ) {
      return json(400, { error: 'invalid_access_code' });
    }
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipHash = await sha256(clientIp);
    return coordinator(env).fetch(
      coordinatorRequest('/enroll', request, { accessCode, ipHash }, now),
    );
  }

  if (request.method === 'DELETE' && url.pathname === '/v1/installations/current') {
    return coordinator(env).fetch(coordinatorRequest('/revoke', request, undefined, now));
  }

  if (request.method === 'POST' && url.pathname === '/v1/coach/events') {
    const body = await requestJson(request);
    if (!body) return json(400, { error: 'invalid_telemetry' });
    return coordinator(env).fetch(coordinatorRequest('/telemetry', request, body, now));
  }

  if (request.method === 'POST' && url.pathname === '/v1/coach/proposals') {
    const authorization = await coordinator(env).fetch(
      coordinatorRequest('/authorize', request, undefined, now),
    );
    if (!authorization.ok) return authorization;
    const context = parseCoachContext(await requestJson(request));
    if (!context) return json(400, { error: 'invalid_context' });
    // Jeden bajt wejścia jako jeden token to celowo konserwatywna rezerwacja.
    const reservedTokens = JSON.stringify(context).length + 500;
    const quota = await coordinator(env).fetch(
      coordinatorRequest('/reserve', request, { reservedTokens }, now),
    );
    if (!quota.ok) return quota;
    const startedAt = Date.now();
    try {
      const result = await requestModelProposal(
        context,
        env,
        fetcher,
        now,
        await safetyIdentifier(request),
      );
      const inputTokens = result.inputTokens ?? 0;
      const outputTokens = result.outputTokens ?? 0;
      await coordinator(env).fetch(
        coordinatorRequest(
          '/settle',
          request,
          { actualTokens: inputTokens + outputTokens, reservedTokens },
          now,
        ),
      );
      const metadata = {
        requestId: result.requestId,
        requestedAt: now.toISOString(),
        latencyMs: Date.now() - startedAt,
        promptVersion: context.promptVersion,
        modelVersion: result.modelVersion,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      console.log(JSON.stringify({ event: 'coach_proposal', result: 'success', ...metadata }));
      return json(200, { proposal: result.proposal, metadata });
    } catch (error) {
      await coordinator(env).fetch(
        coordinatorRequest('/settle', request, { actualTokens: 0, reservedTokens }, now),
      );
      console.log(
        JSON.stringify({
          event: 'coach_proposal',
          result: 'model_or_validation_error',
          promptVersion: context.promptVersion,
          latencyMs: Date.now() - startedAt,
        }),
      );
      return json(502, {
        error: 'coach_unavailable',
      });
    }
  }

  if (request.method === 'POST' && url.pathname === '/v1/coach/chat') {
    const authorization = await coordinator(env).fetch(
      coordinatorRequest('/authorize', request, undefined, now),
    );
    if (!authorization.ok) return authorization;
    const chatRequest = parseDeveloperChatRequest(
      await requestJson(request, MAX_CHAT_REQUEST_BYTES),
    );
    if (!chatRequest) return json(400, { error: 'invalid_chat_request' });
    // Rezerwacja ogranicza równoległą ekspozycję kosztową web search; settlement
    // później zastępuje ją rzeczywistym usage zwróconym przez Responses API.
    const reservedTokens = 50_000;
    const quota = await coordinator(env).fetch(
      coordinatorRequest('/chat/reserve', request, { reservedTokens }, now),
    );
    if (!quota.ok) return quota;
    const startedAt = Date.now();
    try {
      const result = await requestDeveloperChat(
        chatRequest,
        env,
        fetcher,
        await safetyIdentifier(request),
      );
      const settlement = await coordinator(env).fetch(
        coordinatorRequest(
          '/chat/settle',
          request,
          {
            actualTokens: result.inputTokens + result.outputTokens,
            reservedTokens,
          },
          now,
        ),
      );
      if (!settlement.ok) {
        console.log(
          JSON.stringify({
            event: 'developer_chat',
            result: 'settlement_error',
            status: settlement.status,
            latencyMs: Date.now() - startedAt,
          }),
        );
        return settlement.status === 401
          ? settlement
          : json(502, { error: 'coach_unavailable' });
      }
      const metadata = {
        requestId: result.requestId,
        requestedAt: now.toISOString(),
        latencyMs: Date.now() - startedAt,
        modelVersion: result.modelVersion,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      console.log(
        JSON.stringify({
          event: 'developer_chat',
          result: 'success',
          webSearchUsed: result.webSearchUsed,
          ...metadata,
        }),
      );
      return json(200, {
        reply: {
          text: result.text,
          citations: result.citations,
          webSearchUsed: result.webSearchUsed,
        },
        metadata,
      });
    } catch (error) {
      const reportedTokens = error instanceof ModelResponseError
        ? error.actualTokens
        : undefined;
      const actualTokens =
        typeof reportedTokens === 'number' && reportedTokens <= reservedTokens
          ? reportedTokens
          : reservedTokens;
      const settlement = await coordinator(env).fetch(
        coordinatorRequest(
          '/chat/settle',
          request,
          { actualTokens, reservedTokens },
          now,
        ),
      );
      console.log(
        JSON.stringify({
          event: 'developer_chat',
          result: 'model_or_validation_error',
          usageKnown: reportedTokens !== undefined,
          reservationRetained: actualTokens === reservedTokens,
          settlementStatus: settlement.status,
          latencyMs: Date.now() - startedAt,
        }),
      );
      return settlement.status === 401
        ? settlement
        : json(502, { error: 'coach_unavailable' });
    }
  }

  return json(404, { error: 'not_found' });
}

async function safetyIdentifier(request: Request) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  if (!token) return undefined;
  const tokenHash = await sha256(token);
  return `inst_${tokenHash.slice(0, 56)}`;
}
