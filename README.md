# motivAItion

Mobile-first, iOS-only training app with an active adaptive coach. The first
vertical slice tests one loop: a low-friction plan should make a real workout
more likely to happen and to be repeated.

## Project status

Milestone 1 is complete. The full single-session loop works on an iPhone through
Expo Go and the unsigned physical-device IPA is built by GitHub Actions. The
[verified iOS build](https://github.com/reteter/motivAItion/actions/runs/31652514043)
publishes the `motivaition-ios-unsigned` artifact.

The coach currently runs locally from deterministic rules. It does **not** call a
model API and there is no API key, backend or cloud sync. This is intentional:
the application owns and validates all state changes, while a future model
adapter will only be allowed to propose controlled actions.

Current implementation details, verification evidence and known limitations are
tracked in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). The next approved
vertical slice is [docs/MILESTONE_2.md](docs/MILESTONE_2.md).

## What works in Milestone 1

- conversational onboarding and a conservative baseline;
- versioned training Protocol generated from the user's current ability;
- today's standard workout and a one-tap Minimum alternative;
- one-handed set flow with `easy / OK / hard` feedback;
- objective local history, XP, levels and progress;
- deterministic coach actions that can reduce today's plan, adapt the next
  Protocol and add tentative behavioral observations;
- local persistence through AsyncStorage.

The coach adapter is intentionally local in M1. There is no model API key in the
mobile client, no backend, no EAS and no analytics. Domain actions and their
validation are separated from React Native so a remote AI adapter can propose the
same controlled actions later without becoming the source of truth.

Not implemented yet: explicit workout dates, missed/skipped/rescheduled session
states, reminders, Consistency 7/30, a remote AI adapter, backend, characters,
quests or social systems.

## Local development on Windows 11

Requirements: Node.js 20 LTS, npm and Expo Go compatible with Expo SDK 54.

```powershell
npm ci
npm run typecheck
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

The bundle identifier is `com.jakub.motivaition` and build number is `1`. Keep the
bundle ID and the Apple ID used by Sideloadly stable across reinstalls to preserve
local app data; increment the build number for later installable releases.

To install on Windows, use 64-bit Sideloadly with the classic 64-bit iTunes and
iCloud packages (not Microsoft Store editions). Connect and trust the unlocked
iPhone, choose the IPA, sign with the same Apple ID, then enable Developer Mode
and trust the profile under `Settings > General > VPN & Device Management`.

## Architecture

```text
src/domain       source-of-truth types, Protocol generation, validated coach actions
src/store        hydration and safe local persistence
src/screens      mobile interaction flow
src/ui           reusable visual primitives
```

Generated `ios` and `android` directories, build output, IPA files and signing
material are intentionally excluded from Git.

## Product documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Current project state](docs/PROJECT_STATUS.md)
- [Milestone 2 plan](docs/MILESTONE_2.md)
