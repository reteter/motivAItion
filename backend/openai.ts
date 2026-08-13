import { CoachContextV1 } from '../src/coach/context';
import { parseCoachProposal } from '../src/coach/contracts';
import { CoachProposalV1 } from '../src/domain/types';
import { BackendEnv } from './types';

const proposalParameters = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 240 },
    rationaleCode: {
      type: 'string',
      enum: [
        'recovery_after_gap',
        'low_recent_consistency',
        'time_pressure_pattern',
        'pain_requires_caution',
        'positive_momentum',
        'insufficient_evidence',
      ],
    },
    action: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['recommend_minimum_workout'] },
            occurrenceId: { type: 'string' },
            reason: {
              type: 'string',
              enum: ['low_consistency', 'time_pressure', 'recovery'],
            },
          },
          required: ['type', 'occurrenceId', 'reason'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['recommend_recovery_workout'] },
            occurrenceId: { type: 'string' },
          },
          required: ['type', 'occurrenceId'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['modify_future_protocol'] },
            reason: { type: 'string', enum: ['ai_proposal'] },
            changes: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  exerciseId: { type: 'string', enum: ['pushups', 'squats', 'plank'] },
                  targetDelta: { type: 'integer', minimum: -5, maximum: 5 },
                  source: { type: 'string', enum: ['ai_caution', 'ai_progression'] },
                },
                required: ['exerciseId', 'targetDelta', 'source'],
              },
            },
          },
          required: ['type', 'reason', 'changes'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['add_behavioral_observation'] },
            observation: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: {
                  type: 'string',
                  enum: [
                    'time_pressure_pattern',
                    'low_adherence_pattern',
                    'minimum_helped_pattern',
                  ],
                },
                confidence: { type: 'number', minimum: 0.3, maximum: 0.8 },
                evidence: { type: 'string', minLength: 1, maxLength: 160 },
              },
              required: ['kind', 'confidence', 'evidence'],
            },
          },
          required: ['type', 'observation'],
        },
      ],
    },
  },
  required: ['message', 'rationaleCode', 'action'],
} as const;

export interface ModelProposalResult {
  proposal: CoachProposalV1;
  requestId: string;
  modelVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
}

function proposalAllowedByContext(context: CoachContextV1, proposal: CoachProposalV1) {
  const action = proposal.action;
  if (!action) return context.allowedProposalTypes.includes('none');
  if (!context.allowedProposalTypes.includes(action.type)) return false;
  if (
    action.type === 'recommend_minimum_workout' ||
    action.type === 'recommend_recovery_workout'
  ) return action.occurrenceId === context.nextOccurrence?.occurrenceId;
  if (action.type === 'modify_future_protocol') {
    const ids = new Set(action.changes.map((change) => change.exerciseId));
    return ids.size === action.changes.length && action.changes.every((change) => {
      const allowed = context.allowedProtocolChanges.find(
        (candidate) => candidate.exerciseId === change.exerciseId,
      );
      return Boolean(
        allowed?.allowedTargetDeltas.includes(change.targetDelta) &&
          ((change.targetDelta < 0 && change.source === 'ai_caution') ||
            (change.targetDelta > 0 && change.source === 'ai_progression')),
      );
    });
  }
  return true;
}

export async function requestModelProposal(
  context: CoachContextV1,
  env: BackendEnv,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<ModelProposalResult> {
  if (
    !env.OPENAI_API_KEY ||
    !env.COACH_MODEL ||
    !env.COACH_REASONING_EFFORT ||
    env.PROMPT_VERSION !== context.promptVersion
  ) {
    throw new Error('Backend coach configuration is incomplete.');
  }
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.COACH_MODEL,
      reasoning: { effort: env.COACH_REASONING_EFFORT },
      store: false,
      parallel_tool_calls: false,
      max_output_tokens: 500,
      instructions:
        'Jesteś coachem realizacji planu. Zwróć jedną krótką propozycję po polsku. Użyj wyłącznie dozwolonych typów i wartości z kontekstu. Nie diagnozuj, nie przyznawaj XP, nie kończ treningu i nie zmieniaj celu. Przy sygnale bólu nie zwiększaj obciążenia.',
      input: JSON.stringify(context),
      tools: [
        {
          type: 'function',
          name: 'propose_coach_action',
          description: 'Zwraca zero lub jedną bezpieczną propozycję dla użytkownika.',
          strict: true,
          parameters: proposalParameters,
        },
      ],
      tool_choice: { type: 'function', name: 'propose_coach_action' },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Responses API returned ${response.status}.`);
  const body = (await response.json()) as {
    id?: unknown;
    model?: unknown;
    output?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  if (typeof body.id !== 'string' || !Array.isArray(body.output)) {
    throw new Error('OpenAI response envelope is invalid.');
  }
  const calls = body.output.filter(
    (item): item is { type: 'function_call'; name: string; arguments: string } =>
      Boolean(
        item &&
          typeof item === 'object' &&
          (item as { type?: unknown }).type === 'function_call' &&
          (item as { name?: unknown }).name === 'propose_coach_action' &&
          typeof (item as { arguments?: unknown }).arguments === 'string',
      ),
  );
  if (calls.length !== 1) throw new Error('Model must return exactly one proposal call.');
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(calls[0]?.arguments ?? '');
  } catch {
    throw new Error('Model function arguments are not valid JSON.');
  }
  const proposal = parseCoachProposal({
    ...(argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {}),
    proposalId: `proposal-${body.id}`.slice(0, 120),
    expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1_000).toISOString(),
    promptVersion: context.promptVersion,
  });
  if (!proposal || !proposalAllowedByContext(context, proposal)) {
    throw new Error('Model proposal failed backend validation.');
  }
  return {
    proposal,
    requestId: body.id,
    modelVersion: typeof body.model === 'string' ? body.model : undefined,
    inputTokens:
      typeof body.usage?.input_tokens === 'number' ? body.usage.input_tokens : undefined,
    outputTokens:
      typeof body.usage?.output_tokens === 'number' ? body.usage.output_tokens : undefined,
  };
}
