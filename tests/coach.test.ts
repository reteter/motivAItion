import { buildCoachContext, parseCoachContext, serializeCoachContext } from '../src/coach/context';
import { parseCoachProposal } from '../src/coach/contracts';
import {
  buildDeveloperChatContext,
  buildDeveloperChatRequest,
  citationSegments,
  developerChatErrorMessage,
  developerChatSessionReducer,
  initialDeveloperChatSession,
  MAX_CHAT_ASSISTANT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TRANSCRIPT_LENGTH,
  MAX_CHAT_USER_MESSAGE_LENGTH,
  parseDeveloperChatContext,
  parseDeveloperChatRequest,
  selectDeveloperChatTranscript,
} from '../src/coach/developerChat';
import {
  createLocalFallbackProposal,
  decideCoachProposal,
  recordCoachProposalOutcomes,
  storeCoachProposal,
  validateProposalForState,
} from '../src/coach/proposals';
import { resolveCoachProposal } from '../src/coach/service';
import { completeWorkout } from '../src/domain/coach';
import { startOccurrence } from '../src/domain/schedule';
import { migrateV2ToV3 } from '../src/domain/migration';
import { AppStateV2 } from '../src/domain/types';
import {
  markTelemetryAttemptFailed,
  markTelemetryDelivered,
  reconcileTelemetryOutbox,
} from '../src/coach/telemetry';
import { coachFixtureNow, coachFixtures } from './coach-fixtures';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(coachFixtures.length === 20, 'M3 quality gate requires exactly 20 fixtures.');
assert(
  new Set(coachFixtures.map((fixture) => fixture.name)).size === coachFixtures.length,
  'Every coach fixture should have a unique name.',
);

const forbiddenKeys = new Set([
  'goal',
  'limitations',
  'notificationId',
  'installationToken',
  'decisionNote',
  'evidence',
  'todayWorkout',
  'history',
]);

function assertNoForbiddenKeys(value: unknown, path = 'context') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenKeys.has(key), `Forbidden key ${path}.${key} leaked into context.`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

for (const fixture of coachFixtures) {
  const first = buildCoachContext(fixture.state, coachFixtureNow);
  const second = buildCoachContext(fixture.state, coachFixtureNow);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    `${fixture.name}: serializer must be deterministic.`,
  );
  assert(
    serializeCoachContext(fixture.state, coachFixtureNow) === JSON.stringify(first),
    `${fixture.name}: serialized fixture should be stable.`,
  );
  assert(parseCoachContext(JSON.parse(JSON.stringify(first))), `${fixture.name}: context must pass strict parsing.`);
  assertNoForbiddenKeys(first);

  const proposal = createLocalFallbackProposal(fixture.state, coachFixtureNow);
  assert(parseCoachProposal(proposal), `${fixture.name}: fallback proposal must match v1 schema.`);
  assert(
    validateProposalForState(fixture.state, proposal, coachFixtureNow),
    `${fixture.name}: fallback action must be safe for its state.`,
  );
  assert(
    first.todayState === fixture.expected.todayState,
    `${fixture.name}: expected today state ${fixture.expected.todayState}, received ${first.todayState}.`,
  );
  assert(
    proposal.rationaleCode === fixture.expected.rationale,
    `${fixture.name}: expected rationale ${fixture.expected.rationale}, received ${proposal.rationaleCode}.`,
  );
  assert(
    proposal.action?.type === fixture.expected.actionType ||
      (!proposal.action && fixture.expected.actionType === null),
    `${fixture.name}: fallback action does not match the fixture expectation.`,
  );
  assert(
    proposal.message.includes(fixture.expected.messageIncludes) &&
      proposal.message.length <= 240 &&
      !/diagnoz|leniwy|porażk/i.test(proposal.message),
    `${fixture.name}: fallback message failed the fixture quality expectation.`,
  );
  const stored = storeCoachProposal(fixture.state, proposal, 'local', coachFixtureNow);
  assert(stored !== fixture.state, `${fixture.name}: valid proposal should be stored.`);
const rejected = decideCoachProposal(stored, proposal.proposalId, 'reject', coachFixtureNow);
  const rejectedAgain = decideCoachProposal(rejected, proposal.proposalId, 'reject', coachFixtureNow);
  assert(rejectedAgain === rejected, `${fixture.name}: a decision must be idempotent.`);
}

const scheduledFixture = coachFixtures.find((fixture) => fixture.name === 'scheduled session today');
assert(scheduledFixture, 'Scheduled fixture should exist.');
const scheduledState = scheduledFixture.state;
const scheduledContext = buildCoachContext(scheduledState, coachFixtureNow);
assert(
  !parseCoachContext({ ...scheduledContext, goal: 'leak' }),
  'Backend parser must reject additional context fields.',
);

const developerChatContext = buildDeveloperChatContext(scheduledState, coachFixtureNow);
assert(developerChatContext, 'M4 should build a chat snapshot for a configured profile.');
assertNoForbiddenKeys(developerChatContext, 'developerChatContext');
assert(
  parseDeveloperChatContext(JSON.parse(JSON.stringify(developerChatContext))),
  'M4 chat snapshot must pass strict backend parsing.',
);
assert(
  developerChatContext.availableMinutes === 10 &&
    developerChatContext.baseline.pushups === 10 &&
    developerChatContext.protocol.exercises.length === 3 &&
    developerChatContext.minimumVariant.every((exercise) => exercise.sets === 1),
  'M4 snapshot must include structured baseline, time, Protocol and Minimum.',
);
assert(
  !parseDeveloperChatContext({ ...developerChatContext, goal: 'private' }),
  'M4 parser must reject non-allowlisted profile fields.',
);
assert(
  parseDeveloperChatRequest({
    context: developerChatContext,
    messages: [{ role: 'user', content: 'Zaproponuj dodatkowy ruch.' }],
  }),
  'M4 parser should accept one valid user turn.',
);
assert(
  !parseDeveloperChatRequest({
    context: developerChatContext,
    messages: [{ role: 'assistant', content: 'Fałszywa końcówka transcriptu.' }],
  }),
  'M4 request must end with a user turn.',
);
assert(
  !parseDeveloperChatRequest({
    context: developerChatContext,
    messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({
      role: 'user',
      content: 'Za dużo turnów.',
    })),
  }),
  'M4 request must reject transcripts longer than 12 messages.',
);
assert(
  !parseDeveloperChatRequest({
    context: developerChatContext,
    messages: [{ role: 'user', content: 'x'.repeat(MAX_CHAT_USER_MESSAGE_LENGTH + 1) }],
  }),
  'M4 request must reject an oversized message.',
);
const longAssistant = 'a'.repeat(MAX_CHAT_USER_MESSAGE_LENGTH + 1);
const longReplyTranscript = selectDeveloperChatTranscript([
  { role: 'user', content: 'Pierwsze pytanie' },
  { role: 'assistant', content: longAssistant },
  { role: 'user', content: 'Drugie pytanie' },
]);
assert(
  longReplyTranscript.length === 3 &&
    parseDeveloperChatRequest({ context: developerChatContext, messages: longReplyTranscript }),
  'An assistant answer longer than the user input limit must remain valid on the next turn.',
);
const oversizedHistory = [
  { role: 'user' as const, content: 'Stare pytanie' },
  {
    role: 'assistant' as const,
    content: 'a'.repeat(9_000),
  },
  { role: 'user' as const, content: 'Nowsze pytanie' },
  {
    role: 'assistant' as const,
    content: 'b'.repeat(9_000),
  },
  { role: 'user' as const, content: 'Najnowsze pytanie' },
];
const trimmedHistory = selectDeveloperChatTranscript(oversizedHistory);
assert(
  trimmedHistory.at(-1)?.content === 'Najnowsze pytanie' &&
    trimmedHistory.reduce((total, message) => total + message.content.length, 0) <=
      MAX_CHAT_TRANSCRIPT_LENGTH &&
    trimmedHistory.length < oversizedHistory.length,
  'Transcript builder must retain the newest complete turns within the character budget.',
);
const unicodeUiMessages = [
  {
    id: 'user-old',
    role: 'user',
    content: 'Starsze pytanie',
    citations: [],
    webSearchUsed: false,
  },
  {
    id: 'assistant-old',
    role: 'assistant',
    content: '€'.repeat(MAX_CHAT_ASSISTANT_MESSAGE_LENGTH),
    citations: [],
    webSearchUsed: false,
  },
  {
    id: 'user-new',
    role: 'user',
    content: 'Najnowsze pytanie',
    citations: [],
    webSearchUsed: false,
  },
] as const;
const unicodeRequest = buildDeveloperChatRequest(developerChatContext, unicodeUiMessages);
assert(
  unicodeRequest?.messages.length === 1 &&
    Object.keys(unicodeRequest.messages[0] ?? {}).sort().join(',') === 'content,role' &&
    new TextEncoder().encode(JSON.stringify(unicodeRequest)).byteLength <= 32_000,
  'Request builder must trim by UTF-8 size and strip every UI-only message field.',
);
const oversizedLatestRequest = buildDeveloperChatRequest(
  { ...developerChatContext, localDate: 'x'.repeat(31_500) },
  [{ role: 'user', content: '€'.repeat(MAX_CHAT_USER_MESSAGE_LENGTH) }],
);
assert(
  !oversizedLatestRequest,
  'The newest turn must either fit the final byte budget or be rejected locally.',
);

const pendingMessage = {
  id: 'user-1',
  role: 'user' as const,
  content: 'Pytanie',
  citations: [],
  webSearchUsed: false,
};
const loadingSession = developerChatSessionReducer(initialDeveloperChatSession, {
  type: 'start',
  generation: 1,
  messages: [pendingMessage],
});
const duplicateStart = developerChatSessionReducer(loadingSession, {
  type: 'start',
  generation: 1,
  messages: [pendingMessage],
});
const failedSession = developerChatSessionReducer(loadingSession, {
  type: 'fail',
  generation: 1,
  message: developerChatErrorMessage('network'),
  retryDraft: pendingMessage.content,
});
const retryMessage = { ...pendingMessage, id: 'user-retry' };
const retryRequest = buildDeveloperChatRequest(developerChatContext, [
  ...failedSession.messages,
  retryMessage,
]);
const resetSession = developerChatSessionReducer(loadingSession, { type: 'reset' });
const staleCompletion = developerChatSessionReducer(resetSession, {
  type: 'succeed',
  generation: 1,
  message: {
    ...pendingMessage,
    id: 'assistant-late',
    role: 'assistant',
    content: 'Spóźniona odpowiedź',
  },
});
const staleCancellation = developerChatSessionReducer(resetSession, {
  type: 'clear_error',
  generation: 1,
});
assert(
  resetSession.messages.length === 0 &&
    resetSession.status === 'idle' &&
    staleCompletion === resetSession &&
    staleCancellation === resetSession &&
    duplicateStart === loadingSession &&
    failedSession.messages.length === 0 &&
    failedSession.draft === pendingMessage.content &&
    retryRequest?.messages.length === 1 &&
    retryRequest.messages[0]?.content === pendingMessage.content,
  'New chat/remount semantics must clear transcript and ignore late completions.',
);
for (const code of [
  'not_configured',
  'not_enrolled',
  'unauthorized',
  'rate_limited',
  'timeout',
  'network',
  'invalid_request',
  'invalid_response',
] as const) {
  assert(developerChatErrorMessage(code), `M4 must expose a readable ${code} error.`);
}
assert(
  developerChatErrorMessage('cancelled') === '',
  'An intentional lifecycle cancellation must remain silent.',
);
const segmented = citationSegments('Ruch według źródła.', [
  { startIndex: 11, endIndex: 17, title: 'Źródło', url: 'https://example.com' },
]);
assert(
  segmented.some((segment) => segment.citation?.url === 'https://example.com'),
  'Validated citation ranges must remain addressable for accessible link rendering.',
);

const safeProposal = createLocalFallbackProposal(scheduledState, coachFixtureNow);
assert(
  !parseCoachProposal({ ...safeProposal, grantXp: 10 }),
  'Proposal parser must reject additional fields.',
);
assert(
  !parseCoachProposal({
    ...safeProposal,
    action: { type: 'complete_workout', occurrenceId: 'today' },
  }),
  'Proposal parser must reject forbidden action types.',
);
assert(
  !validateProposalForState(
    scheduledState,
    {
      ...safeProposal,
      proposalId: 'wrong-occurrence',
      action: {
        type: 'recommend_minimum_workout',
        occurrenceId: 'somebody-elses-occurrence',
        reason: 'recovery',
      },
    },
    coachFixtureNow,
  ),
  'Client validation must reject an action for a different occurrence.',
);

const painFixture = coachFixtures.find((fixture) => fixture.name === 'recent pain signal');
assert(painFixture, 'Pain fixture should exist.');
assert(
  buildCoachContext(painFixture.state, coachFixtureNow).allowedProtocolChanges.every(
    (exercise) => exercise.allowedTargetDeltas.every((delta) => delta < 0),
  ),
  'Pain must remove every progression delta from the model context.',
);

const stored = storeCoachProposal(
  scheduledState,
  safeProposal,
  'local',
  coachFixtureNow,
);
const applied = decideCoachProposal(stored, safeProposal.proposalId, 'apply', coachFixtureNow);
const appliedAgain = decideCoachProposal(applied, safeProposal.proposalId, 'apply', coachFixtureNow);
assert(appliedAgain === applied, 'A proposal cannot be applied twice.');
assert(
  applied.progress.totalXp === scheduledState.progress.totalXp &&
    applied.history.length === scheduledState.history.length &&
    applied.profile?.goal === scheduledState.profile?.goal,
  'Applying a proposal must not grant XP, complete history, or change Goal.',
);

const expiring = storeCoachProposal(
  scheduledState,
  { ...safeProposal, proposalId: 'expires-cleanly' },
  'local',
  coachFixtureNow,
);
const expired = recordCoachProposalOutcomes(
  expiring,
  new Date(coachFixtureNow.getTime() + 7 * 60 * 60 * 1_000),
);
assert(
  expired.remoteCoach.proposals[0]?.status === 'expired',
  'Pending proposals should become explicitly expired after their deadline.',
);

const linkedProposal = {
  ...safeProposal,
  proposalId: 'linked-outcome',
  action: {
    type: 'recommend_minimum_workout' as const,
    occurrenceId: 'today',
    reason: 'low_consistency' as const,
  },
};
const linkedStored = storeCoachProposal(
  scheduledState,
  linkedProposal,
  'remote',
  coachFixtureNow,
);
const linkedApplied = decideCoachProposal(
  linkedStored,
  linkedProposal.proposalId,
  'apply',
  coachFixtureNow,
);
const linkedCompleted = recordCoachProposalOutcomes(
  {
    ...linkedApplied,
    occurrences: linkedApplied.occurrences.map((occurrence) =>
      occurrence.id === 'today'
        ? {
            ...occurrence,
            status: 'completed' as const,
            workoutId: 'later-workout',
            chosenVariant: 'minimum' as const,
            completedAt: new Date(coachFixtureNow.getTime() + 60_000).toISOString(),
          }
        : occurrence,
    ),
  },
  new Date(coachFixtureNow.getTime() + 60_000),
);
assert(
  linkedCompleted.remoteCoach.proposals[0]?.outcomeStatus === 'completed',
  'An applied proposal should retain the later objective occurrence outcome.',
);
const linkedDecisionQueued = reconcileTelemetryOutbox({
  ...linkedApplied,
  remoteCoach: {
    ...linkedApplied.remoteCoach,
    mode: 'enabled',
    proposals: linkedApplied.remoteCoach.proposals.map((proposal) => ({
      ...proposal,
      requestId: 'request-linked-completion',
    })),
  },
}, coachFixtureNow);
const linkedWorkoutStarted = startOccurrence(
  linkedDecisionQueued,
  'today',
  'minimum',
  coachFixtureNow,
);
const linkedWorkoutReadyToFinish = {
  ...linkedWorkoutStarted,
  todayWorkout: linkedWorkoutStarted.todayWorkout
    ? {
        ...linkedWorkoutStarted.todayWorkout,
        exercises: linkedWorkoutStarted.todayWorkout.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            feedback: 'ok' as const,
            completedAt: new Date(coachFixtureNow.getTime() + 30_000).toISOString(),
          })),
        })),
      }
    : undefined,
};
const linkedCompletion = completeWorkout(
  linkedWorkoutReadyToFinish,
  new Date(coachFixtureNow.getTime() + 60_000),
);
assert(linkedCompletion, 'The linked workout must complete through the domain flow.');
const linkedOutcomeQueued = reconcileTelemetryOutbox(
  recordCoachProposalOutcomes(
    linkedCompletion.state,
    new Date(coachFixtureNow.getTime() + 60_000),
  ),
  new Date(coachFixtureNow.getTime() + 60_000),
);
assert(
  linkedOutcomeQueued.remoteCoach.telemetryOutbox.length === 2 &&
    linkedOutcomeQueued.remoteCoach.telemetryOutbox.filter(
      (event) => event.outcomeCode === 'completed',
    ).length === 1 &&
    new Set(
      linkedOutcomeQueued.remoteCoach.telemetryOutbox.map((event) => event.eventId),
    ).size === 2,
  'Completing a workout must queue one outcome event without duplicating its decision event.',
);

const rejectedLinked = decideCoachProposal(
  linkedStored,
  linkedProposal.proposalId,
  'reject',
  coachFixtureNow,
);
const rejectedCompleted = recordCoachProposalOutcomes(
  {
    ...rejectedLinked,
    occurrences: rejectedLinked.occurrences.map((occurrence) =>
      occurrence.id === 'today'
        ? {
            ...occurrence,
            status: 'completed' as const,
            workoutId: 'later-without-proposal',
            chosenVariant: 'standard' as const,
            completedAt: new Date(coachFixtureNow.getTime() + 120_000).toISOString(),
          }
        : occurrence,
    ),
  },
  new Date(coachFixtureNow.getTime() + 120_000),
);
assert(
  rejectedCompleted.remoteCoach.proposals[0]?.outcomeStatus === 'completed',
  'A rejected proposal should retain the later objective occurrence outcome.',
);

const protocolProposal = {
  ...safeProposal,
  proposalId: 'protocol-next-session',
  action: {
    type: 'modify_future_protocol' as const,
    reason: 'ai_proposal' as const,
    changes: [
      {
        exerciseId: 'pushups' as const,
        targetDelta: 1,
        source: 'ai_progression' as const,
      },
    ],
  },
};
const protocolStored = storeCoachProposal(
  scheduledState,
  protocolProposal,
  'remote',
  coachFixtureNow,
  'request-protocol',
);
const protocolApplied = decideCoachProposal(
  protocolStored,
  protocolProposal.proposalId,
  'apply',
  coachFixtureNow,
);
const updatedOccurrence = protocolApplied.occurrences.find(
  (occurrence) => occurrence.id === 'today',
);
assert(
  updatedOccurrence?.protocolVersion === 2,
  'Accepted future protocol change must rebase the next scheduled occurrence.',
);
const nextWorkout = startOccurrence(protocolApplied, 'today', 'standard', coachFixtureNow);
assert(
  nextWorkout.todayWorkout?.protocolVersion === 2 &&
    nextWorkout.todayWorkout.exercises.find((exercise) => exercise.id === 'pushups')
      ?.sets[0]?.target === 5,
  'The next workout must materialize the accepted AI protocol target.',
);
assert(
  protocolApplied.protocols[1]?.reason.includes('AI coacha'),
  'AI protocol history must describe its actual source.',
);

const plannedSnapshot = {
  ...scheduledState,
  todayWorkout: {
    id: 'legacy-arbitrary-workout-id',
    occurrenceId: 'today',
    protocolVersion: 1,
    plannedAt: coachFixtureNow.toISOString(),
    variant: 'standard' as const,
    status: 'planned' as const,
    exercises: scheduledState.protocols[0]!.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      sets: Array.from({ length: exercise.sets }, (_, index) => ({
        index,
        target: exercise.target,
      })),
    })),
  },
  occurrences: scheduledState.occurrences.map((occurrence) =>
    occurrence.id === 'today'
      ? {
          ...occurrence,
          workoutId: 'legacy-arbitrary-workout-id',
          chosenVariant: 'standard' as const,
        }
      : occurrence,
  ),
};
const { remoteCoach: _plannedRemoteCoach, ...plannedLegacyFields } = plannedSnapshot;
const plannedV2: AppStateV2 = {
  ...plannedLegacyFields,
  schemaVersion: 2,
};
const migratedPlannedSnapshot = migrateV2ToV3(plannedV2);
const plannedStored = storeCoachProposal(
  migratedPlannedSnapshot,
  { ...protocolProposal, proposalId: 'protocol-planned-snapshot' },
  'remote',
  coachFixtureNow,
  'request-planned',
);
const plannedApplied = decideCoachProposal(
  plannedStored,
  'protocol-planned-snapshot',
  'apply',
  coachFixtureNow,
);
assert(
  plannedApplied.todayWorkout?.protocolVersion === 2 &&
    plannedApplied.todayWorkout.id === 'legacy-arbitrary-workout-id' &&
    plannedApplied.occurrences.find((occurrence) => occurrence.id === 'today')
      ?.workoutId === plannedApplied.todayWorkout.id &&
    plannedApplied.todayWorkout.exercises.find((exercise) => exercise.id === 'pushups')
      ?.sets[0]?.target === 5,
  'Rebasing an accepted protocol must replace a pre-materialized planned workout snapshot.',
);

const remoteDecisionState = reconcileTelemetryOutbox({
  ...linkedApplied,
  remoteCoach: {
    ...linkedApplied.remoteCoach,
    mode: 'enabled',
    proposals: linkedApplied.remoteCoach.proposals.map((proposal) => ({
      ...proposal,
      source: 'remote' as const,
      requestId: 'request-outbox',
    })),
  },
}, coachFixtureNow);
assert(
  remoteDecisionState.remoteCoach.telemetryOutbox.length === 1,
  'A remote decision must enter the persistent telemetry outbox.',
);
const failedTelemetry = markTelemetryAttemptFailed(
  remoteDecisionState,
  remoteDecisionState.remoteCoach.telemetryOutbox[0]!.eventId,
  coachFixtureNow,
);
assert(
  failedTelemetry.remoteCoach.telemetryOutbox[0]?.attempts === 1 &&
    Date.parse(failedTelemetry.remoteCoach.telemetryOutbox[0].nextAttemptAt ?? '') >
      coachFixtureNow.getTime(),
  'A failed telemetry delivery must persist a capped backoff retry.',
);
const deliveredTelemetry = markTelemetryDelivered(
  failedTelemetry,
  failedTelemetry.remoteCoach.telemetryOutbox[0]!.eventId,
);
assert(
  deliveredTelemetry.remoteCoach.telemetryOutbox.length === 0,
  'A delivered telemetry event must leave the persistent outbox.',
);
assert(
  reconcileTelemetryOutbox(deliveredTelemetry, coachFixtureNow).remoteCoach
    .telemetryOutbox.length === 0,
  'A delivered event must not be recreated from proposal history.',
);
let exhaustedTelemetry = remoteDecisionState;
for (let attempt = 0; attempt < 5; attempt += 1) {
  exhaustedTelemetry = markTelemetryAttemptFailed(
    exhaustedTelemetry,
    exhaustedTelemetry.remoteCoach.telemetryOutbox[0]!.eventId,
    new Date(coachFixtureNow.getTime() + attempt * 4_000_000),
  );
}
assert(
  exhaustedTelemetry.remoteCoach.telemetryOutbox.length === 0 &&
    reconcileTelemetryOutbox(exhaustedTelemetry, coachFixtureNow).remoteCoach
      .telemetryOutbox.length === 0,
  'An event that exhausts capped retries must not loop forever.',
);
assert(
  reconcileTelemetryOutbox({
    ...remoteDecisionState,
    remoteCoach: { ...remoteDecisionState.remoteCoach, mode: 'disabled' },
  }).remoteCoach.telemetryOutbox.length === 0,
  'Opt-out must clear and stop the telemetry outbox.',
);
const pendingEvent = {
  ...remoteDecisionState.remoteCoach.telemetryOutbox[0]!,
  eventId: 'request-pending:applied:decision',
  requestId: 'request-pending',
};
const mixedTelemetry = {
  ...deliveredTelemetry,
  remoteCoach: {
    ...deliveredTelemetry.remoteCoach,
    mode: 'enabled' as const,
    telemetryOutbox: [pendingEvent],
  },
};
const optedOutTelemetry = reconcileTelemetryOutbox({
  ...mixedTelemetry,
  remoteCoach: { ...mixedTelemetry.remoteCoach, mode: 'disabled' as const },
});
const optedBackInTelemetry = reconcileTelemetryOutbox({
  ...optedOutTelemetry,
  remoteCoach: { ...optedOutTelemetry.remoteCoach, mode: 'enabled' as const },
});
assert(
  optedOutTelemetry.remoteCoach.telemetrySettledEventIds.includes(
    deliveredTelemetry.remoteCoach.telemetrySettledEventIds[0]!,
  ) &&
    optedOutTelemetry.remoteCoach.telemetrySettledEventIds.includes(
      pendingEvent.eventId,
    ) &&
    optedBackInTelemetry.remoteCoach.telemetryOutbox.length === 0,
  'Opt-out must tombstone discarded events and prevent replay after a later opt-in.',
);

async function testFailureModes() {
  const timeout = await resolveCoachProposal(
    scheduledState,
    {
      propose: async () => {
        throw { code: 'timeout' };
      },
    },
    coachFixtureNow,
  );
  assert(
    timeout.source === 'local' && timeout.failureCode === 'timeout',
    'Timeout must resolve to a local fallback.',
  );

  const invalid = await resolveCoachProposal(
    scheduledState,
    {
      propose: async () => ({
        proposal: {
          ...safeProposal,
          proposalId: 'invalid-remote',
          action: {
            type: 'recommend_minimum_workout' as const,
            occurrenceId: 'wrong-occurrence',
            reason: 'recovery' as const,
          },
        },
        metadata: {
          requestId: 'invalid-remote',
          requestedAt: coachFixtureNow.toISOString(),
          promptVersion: 'm3-v1',
        },
      }),
    },
    coachFixtureNow,
  );
  assert(
    invalid.source === 'local' && invalid.resultCode === 'invalid_proposal',
    'Semantically invalid remote action must resolve to a local fallback.',
  );

  const remote = await resolveCoachProposal(
    scheduledState,
    {
      propose: async () => ({
        proposal: { ...safeProposal, proposalId: 'valid-remote' },
        metadata: {
          requestId: 'valid-remote',
          requestedAt: coachFixtureNow.toISOString(),
          promptVersion: 'm3-v1',
        },
      }),
    },
    coachFixtureNow,
  );
  assert(remote.source === 'remote', 'A valid remote proposal should remain remote.');
}

void testFailureModes().then(() => {
  console.log('M3 coach fixtures passed: 20/20; safety fixtures: 100%.');
});
