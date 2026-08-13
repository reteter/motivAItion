# motivAItion

Mobile-first, iOS-only training app with an active adaptive coach. M4 adds an
explicitly experimental, ephemeral developer chat next to the bounded M3 AI
loop. The chat can advise and use web search, but the application remains the
only source of truth and exposes no state-changing actions to it.

## Project status

Milestone 2 is implemented, independently reviewed and passes local domain,
Expo and native iOS gates. Its [device build](https://github.com/reteter/motivAItion/actions/runs/31657121631)
publishes build number 2 as `motivaition-ios-unsigned`. Notification delivery and
the update path still need physical-iPhone validation before M2 is fully closed.

M3 is deployed for dogfood as build number 4: versioned minimal context, strict
proposal validation, opt-in UX, Secure Store installation token, local fallback,
20 fixture scenarios and a tested Cloudflare Worker backend adapter for OpenAI
Responses API. The Cloudflare Worker uses `gpt-5.6-terra` with low reasoning at
`https://motivaition-coach.arkoniel.workers.dev`; its OpenAI key remains a server
secret. A real backend/model smoke test passes. The physical-device M3 flow is
also verified for one-time enrollment and a real Terra response. Full
real-model eval, device failure modes and apply/reject outcome dogfood remain
open. Build 5 improves keyboard handling, code visibility and manual
transcription; its native CI build is green and awaits installation on the iPhone.

M4 is independently approved and its Worker is deployed. The pinned
`gpt-5.6-terra`/Low live eval passes 6/6 scenarios, including injection, spoofed
transcript, pain/dyspnea safety and WHO web search with citations. Build 6 adds
the non-persistent developer chat; its unsigned IPA build is green and awaits
physical-iPhone dogfood.

Current implementation details, verification evidence and known limitations are
tracked in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). M2 scope and device
acceptance criteria are in [docs/MILESTONE_2.md](docs/MILESTONE_2.md). M3 scope,
evidence and remaining rollout work are in [docs/MILESTONE_3.md](docs/MILESTONE_3.md).
M4 implementation and release evidence are in
[docs/MILESTONE_4.md](docs/MILESTONE_4.md).

## What works locally

- conversational onboarding and a conservative baseline;
- versioned training Protocol generated from the user's current ability;
- today's standard workout and a one-tap Minimum alternative;
- one-handed set flow with `easy / OK / hard` feedback;
- objective local history, XP, levels and progress;
- deterministic coach actions that can reduce today's plan, adapt the next
  Protocol and add tentative behavioral observations;
- local persistence through AsyncStorage.
- an explicit weekly schedule with selected weekdays and time;
- append-only workout occurrences with scheduled, in-progress, completed,
  skipped, missed and rescheduled states;
- two-tap Standard, Minimum, reschedule and skip decisions with structured reasons;
- deterministic Consistency for 7 and 30 days instead of a resettable streak;
- a Minimum recovery recommendation after a skipped or missed session;
- one local iOS reminder for the nearest session, synchronized through a separate
  notification adapter;
- strict, in-place migration from schema v1 to v2 without changing the
  AsyncStorage key, plus a recovery screen that blocks unsafe overwrites.
- lossless schema v2 → v3 migration for local M3 proposal state;
- explicit remote-AI consent and visible data categories;
- `CoachContextV1` without raw goal, limitations or free-text notes;
- one pending `CoachProposalV1`, with apply/reject, expiry, idempotency and later
  occurrence outcome;
- deterministic local fallback for missing token, timeout, offline and invalid
  remote proposals;
- install/revoke flow with the token held in `expo-secure-store` rather than
  AsyncStorage;
- portable Worker backend with an atomic one-time access code, enrollment limit,
  hashed revocable tokens, transactional daily quotas, privacy-safe decision
  telemetry and one strict Responses API tool;
- an ephemeral multi-turn developer chat with bounded context, separate quota,
  optional web search, visible HTTPS citations and no application actions;
- persistent bounded telemetry delivery with backoff, deduplication and immediate opt-out
  that cancels in-flight coach requests and prevents replay after re-enabling
  cleanup.

There is no model API key in the mobile client, no EAS and no third-party analytics.
M3 has bounded first-party metadata telemetry for proposal decisions and outcomes.
Remote AI is live in the backend with a pinned model; the public HTTPS endpoint is
injected into local Expo development and CI builds through
`EXPO_PUBLIC_COACH_API_URL`.
Accounts/cloud sync, characters, quests and social systems remain out of scope.

## Local development on Windows 11

Requirements: Node.js 20 LTS, npm and Expo Go compatible with Expo SDK 54.

```powershell
npm ci
npm run typecheck
npm test
npm run check:expo
npx expo install --check
npx expo-doctor
npx expo start --clear
```

Scan the QR code in Expo Go on an iPhone connected to the same network. If LAN
discovery is blocked, run `npx expo start --tunnel`. Local Windows development
cannot run `xcodebuild`.

## Unsigned iOS build

`.github/workflows/ios-build.yml` runs for pull requests, pushes to `main` and
manual dispatches. It generates the native iOS project, builds a Release bundle
for a physical iPhone with signing disabled and publishes:

- GitHub artifact: `motivaition-ios-unsigned`
- file after extracting the artifact: `motivaition-unsigned.ipa`

The bundle identifier is `com.jakub.motivaition`. Verified M3 build 4 runs on a
physical iPhone; build 5 has a verified unsigned IPA and awaits device installation.
M4 uses build number 6; its native workflow is green, while signing/installation
and device dogfood remain open. Keep the bundle ID and the Apple ID used by
Sideloadly stable across reinstalls to preserve local app data; increment the
build number for later installable releases.

To install on Windows, use 64-bit Sideloadly with the classic 64-bit iTunes and
iCloud packages (not Microsoft Store editions). Connect and trust the unlocked
iPhone, choose the IPA, sign with the same Apple ID, then enable Developer Mode
and trust the profile under `Settings > General > VPN & Device Management`.

## Architecture

```text
src/domain       source-of-truth types, Protocol generation, validated coach actions
src/coach        minimal context, proposal validation, fallback and remote port
src/store        hydration and safe local persistence
src/notifications local-reminder port and Expo iOS adapter
src/screens      mobile interaction flow
src/ui           reusable visual primitives
backend          provider-isolated Worker handler, auth/quota and Responses adapter
```

Generated `ios` and `android` directories, build output, IPA files and signing
material are intentionally excluded from Git.

## Product documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Current project state](docs/PROJECT_STATUS.md)
- [Milestone 2 plan](docs/MILESTONE_2.md)
- [Milestone 3 plan](docs/MILESTONE_3.md)
- [Milestone 4 developer chat implementation](docs/MILESTONE_4.md)
