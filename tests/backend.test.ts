import { CoachCoordinator, sha256 } from '../backend/coordinator';
import { handleRequest } from '../backend/handler';
import {
  BackendEnv,
  DurableObjectNamespace,
  DurableObjectStorage,
} from '../backend/types';
import { buildCoachContext } from '../src/coach/context';
import { coachFixtureNow, coachFixtures } from './coach-fixtures';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStorage implements DurableObjectStorage {
  readonly values = new Map<string, unknown>();
  private queue: Promise<void> = Promise.resolve();

  async get<T>(key: string) {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T) {
    this.values.set(key, value);
  }

  async transaction<T>(
    closure: (transaction: DurableObjectStorage) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await closure(this);
    } finally {
      release();
    }
  }
}

function namespaceFor(storage: MemoryStorage, env: () => BackendEnv): DurableObjectNamespace {
  const coordinator = new CoachCoordinator({ storage }, env());
  return {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => coordinator.fetch(request) }),
  };
}

async function jsonBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function run() {
  const accessCode = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const storage = new MemoryStorage();
  const env = {} as BackendEnv;
  Object.assign(env, {
    OPENAI_API_KEY: ['server', 'only', 'test'].join('-'),
    ACCESS_CODE_HASH: await sha256(accessCode),
    COACH_MODEL: 'pinned-eval-model',
    PROMPT_VERSION: 'm3-v1',
    MAX_REQUESTS_PER_DAY: '20',
    MAX_TOKENS_PER_DAY: '5000',
  });
  env.COACH_COORDINATOR = namespaceFor(storage, () => env);

  const health = await handleRequest(
    new Request('https://coach.example/health'),
    env,
    fetch,
    coachFixtureNow,
  );
  assert(health.status === 200, 'Health endpoint should not require installation auth.');

  const invalidEnrollment = await handleRequest(
    new Request('https://coach.example/v1/installations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessCode: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }),
    }),
    env,
    fetch,
    coachFixtureNow,
  );
  assert(invalidEnrollment.status === 403, 'Invalid access code must be rejected.');

  const enrollment = await handleRequest(
    new Request('https://coach.example/v1/installations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.1',
      },
      body: JSON.stringify({ accessCode }),
    }),
    env,
    fetch,
    coachFixtureNow,
  );
  const enrollmentBody = await jsonBody(enrollment);
  const token = enrollmentBody.installationToken;
  assert(
    enrollment.status === 201 && typeof token === 'string' && token.length >= 32,
    'Valid one-time code should issue a strong installation token.',
  );
  const usedCode = await handleRequest(
    new Request('https://coach.example/v1/installations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.2',
      },
      body: JSON.stringify({ accessCode }),
    }),
    env,
    fetch,
    coachFixtureNow,
  );
  assert(usedCode.status === 403, 'An access code cannot be exchanged twice.');

  const concurrentCode = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  env.ACCESS_CODE_HASH = await sha256(concurrentCode);
  const concurrentRequests = Array.from({ length: 2 }, (_, index) =>
    handleRequest(
      new Request('https://coach.example/v1/installations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': `192.0.2.${10 + index}`,
        },
        body: JSON.stringify({ accessCode: concurrentCode }),
      }),
      env,
      fetch,
      coachFixtureNow,
    ),
  );
  const concurrentResponses = await Promise.all(concurrentRequests);
  assert(
    concurrentResponses.filter((response) => response.status === 201).length === 1,
    'Concurrent exchange must atomically issue exactly one installation token.',
  );
  env.ACCESS_CODE_HASH = await sha256(accessCode);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await handleRequest(
      new Request('https://coach.example/v1/installations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '198.51.100.8',
        },
        body: JSON.stringify({ accessCode: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' }),
      }),
      env,
      fetch,
      coachFixtureNow,
    );
  }
  const enrollmentLimited = await handleRequest(
    new Request('https://coach.example/v1/installations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '198.51.100.8',
      },
      body: JSON.stringify({ accessCode: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' }),
    }),
    env,
    fetch,
    coachFixtureNow,
  );
  assert(enrollmentLimited.status === 429, 'Enrollment must be rate-limited per IP.');

  const unauthenticated = await handleRequest(
    new Request('https://coach.example/v1/coach/proposals', {
      method: 'POST',
      body: '{}',
    }),
    env,
    fetch,
    coachFixtureNow,
  );
  assert(unauthenticated.status === 401, 'Proposal endpoint must require bearer auth.');

  const fixture = coachFixtures.find((candidate) => candidate.name === 'scheduled session today');
  assert(fixture, 'Scheduled backend fixture should exist.');
  const context = buildCoachContext(fixture.state, coachFixtureNow);
  let capturedOpenAiBody: Record<string, unknown> | undefined;
  const fakeOpenAi: typeof fetch = async (_input, init) => {
    capturedOpenAiBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: 'resp_fixture_001',
        model: 'pinned-eval-model-2026-08-01',
        output: [
          {
            type: 'function_call',
            name: 'propose_coach_action',
            arguments: JSON.stringify({
              message: 'Plan jest wykonalny. Zacznij od pierwszej serii.',
              rationaleCode: 'positive_momentum',
              action: null,
            }),
          },
        ],
        usage: { input_tokens: 120, output_tokens: 24 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const proposalResponse = await handleRequest(
    new Request('https://coach.example/v1/coach/proposals', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(context),
    }),
    env,
    fakeOpenAi,
    coachFixtureNow,
  );
  const proposalBody = await jsonBody(proposalResponse);
  assert(
    proposalResponse.status === 200 && typeof proposalBody.proposal === 'object',
    'Valid context should receive one validated proposal.',
  );
  assert(capturedOpenAiBody, 'Backend should call Responses API adapter.');
  assert(
    capturedOpenAiBody.parallel_tool_calls === false && capturedOpenAiBody.store === false,
    'Responses request must disable parallel calls and response storage.',
  );
  const tools = capturedOpenAiBody.tools;
  assert(
    Array.isArray(tools) &&
      (tools[0] as { strict?: unknown } | undefined)?.strict === true,
    'Responses request must use one strict function tool.',
  );
  const forwardedContext = JSON.parse(String(capturedOpenAiBody.input)) as Record<string, unknown>;
  assert(
    !('goal' in forwardedContext) &&
      !('limitations' in forwardedContext) &&
      !('installationToken' in forwardedContext),
    'Backend must forward only CoachContextV1, never private app fields.',
  );

  env.MAX_REQUESTS_PER_DAY = '2';
  const concurrentQuota = await Promise.all(
    Array.from({ length: 2 }, () =>
      handleRequest(
        new Request('https://coach.example/v1/coach/proposals', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(context),
        }),
        env,
        fakeOpenAi,
        coachFixtureNow,
      ),
    ),
  );
  assert(
    concurrentQuota.filter((response) => response.status === 200).length === 1 &&
      concurrentQuota.filter((response) => response.status === 429).length === 1,
    'Concurrent quota reservations must atomically admit only the remaining request.',
  );

  env.MAX_REQUESTS_PER_DAY = '20';
  const telemetry = await handleRequest(
    new Request('https://coach.example/v1/coach/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        proposalId: 'proposal-resp_fixture_001',
        requestId: 'resp_fixture_001',
        decision: 'applied',
        outcomeCode: 'completed',
      }),
    }),
    env,
    fakeOpenAi,
    coachFixtureNow,
  );
  assert(telemetry.status === 204, 'Privacy-safe decision telemetry should be accepted.');
  const duplicateTelemetry = await handleRequest(
    new Request('https://coach.example/v1/coach/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        proposalId: 'proposal-resp_fixture_001',
        requestId: 'resp_fixture_001',
        decision: 'applied',
        outcomeCode: 'completed',
      }),
    }),
    env,
    fakeOpenAi,
    coachFixtureNow,
  );
  assert(duplicateTelemetry.status === 204, 'Duplicate telemetry delivery should be idempotent.');
  const telemetryEvents = storage.values.get('telemetry:events') as unknown[];
  assert(telemetryEvents.length === 1, 'Duplicate telemetry must create one stored event.');

  const afterRetention = new Date(coachFixtureNow.getTime() + 31 * 24 * 60 * 60 * 1_000);
  const retainedTelemetry = await handleRequest(
    new Request('https://coach.example/v1/coach/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        proposalId: 'proposal-later',
        requestId: 'request-later',
        decision: 'rejected',
      }),
    }),
    env,
    fakeOpenAi,
    afterRetention,
  );
  assert(retainedTelemetry.status === 204, 'Telemetry should remain writable after retention cleanup.');
  const eventsAfterRetention = storage.values.get('telemetry:events') as Array<{
    requestId: string;
  }>;
  assert(
    eventsAfterRetention.length === 1 && eventsAfterRetention[0]?.requestId === 'request-later',
    'Telemetry older than 30 days must be removed during the next write.',
  );

  const revoked = await handleRequest(
    new Request('https://coach.example/v1/installations/current', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    }),
    env,
    fakeOpenAi,
    coachFixtureNow,
  );
  assert(revoked.status === 204, 'Installation should be revocable.');
  const afterRevocation = await handleRequest(
    new Request('https://coach.example/v1/coach/proposals', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(context),
    }),
    env,
    fakeOpenAi,
    coachFixtureNow,
  );
  assert(afterRevocation.status === 401, 'Revoked token must stop authorizing requests.');

  console.log('M3 backend contract passed: atomic auth, enrollment limit, strict tool, quota, telemetry, revocation.');
}

void run();
