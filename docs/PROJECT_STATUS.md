# Stan projektu motivAItion

- Aktualność dokumentu: **2026-08-13**
- Baseline aplikacji: `main` po commitach `57727c8`, `ea4290e`, `31a24c3`
- Status: **Milestone 1 dostarczony**

## Co można zrobić w aplikacji

Użytkownik może przejść kompletną pętlę pojedynczej sesji:

```text
onboarding
  → baseline
  → Protocol v1
  → dzisiejszy trening Standard lub Minimum
  → wykonanie kolejnych serii
  → feedback łatwo / OK / trudno
  → completion
  → historia + XP + poziom
  → adaptacja przyszłego Protocolu
```

Onboarding zbiera cel, doświadczenie, aktualną aktywność, realny czas, liczbę
treningów tygodniowo, preferowaną porę i ograniczenia. Baseline obejmuje pompki,
przysiady oraz plank. Pierwszy Protocol jest zachowawczy i zachowuje oddzielnie
doświadczenie użytkownika oraz jego obecną sprawność.

Podczas treningu użytkownik obsługuje jedną serię naraz i przekazuje feedback
jednym tapnięciem. Może też przed rozpoczęciem wybrać reakcję na brak czasu lub
energii; coach redukuje wtedy trening do wersji Minimum.

## Jak działa coach

Coach **nie łączy się obecnie z API modelu**. Jest lokalnym, deterministycznym
adapterem, który:

- zmniejsza dzisiejszy trening do Minimum;
- podnosi lub obniża cele przyszłego Protocolu na podstawie feedbacku;
- zapisuje ostrożne `BehavioralObservation` z confidence i dowodem;
- generuje przygotowane, kontekstowe komunikaty w interfejsie.

Każda zmiana przechodzi przez zamknięty typ `CoachAction` i walidację domenową.
Coach nie może zmienić Goal, usunąć historii ani oznaczyć treningu jako wykonany.
Aplikacja i lokalne dane pozostają źródłem prawdy.

## Stan danych i persistence

Stan `AppState` ma wersję schematu `1` i jest zapisywany w AsyncStorage pod
kluczem `@motivaition/app-state/v1`. Obejmuje:

- profil i baseline;
- pełną historię wersji Protocolu;
- dzisiejszy Workout i wykonanie każdej serii;
- historię maksymalnie 30 ostatnich treningów;
- BehavioralObservations;
- XP, liczbę ukończonych treningów i liczbę treningów Minimum.

Zapis nie nadpisuje poprawnych danych stanem domyślnym po błędzie hydratacji.
Operacja zapisu jest odblokowana po hydratacji albo świadomej zmianie użytkownika.

## Aktualne reguły produktu

- Standard daje `50 XP`, a Minimum `25 XP`.
- Każde `100 XP` zwiększa poziom.
- Feedback większości serii `trudno` obniża przyszły cel ćwiczenia.
- Feedback wszystkich serii `łatwo` podnosi przyszły cel ćwiczenia.
- Jedno ukończenie może utworzyć najwyżej jedną kolejną wersję Protocolu.
- Historia wykonanego treningu nie jest zmieniana przez późniejszą adaptację.
- Po wykonaniu nie powstaje drugi trening tego samego dnia.
- Obecny odstęp między treningami jest uproszczony: odpowiednio 1, 2 lub 3 dni
  dla Protocolu 4, 3 lub 2 razy w tygodniu.

Ostatni punkt nie jest jeszcze prawdziwym harmonogramem. Aplikacja nie zna
konkretnych dni tygodnia ani osobnych wystąpień planowanych sesji.

## Weryfikacja

### Zweryfikowane lokalnie

- `npm ci`;
- `npm run typecheck`;
- `npm run test:domain`;
- `npm run check:expo`;
- `npx expo install --check`;
- `npx expo-doctor` — 18/18 checks;
- `npx expo export --platform ios --output-dir dist`;
- parsowanie składni workflow i `git diff --check`.

### Zweryfikowane na urządzeniu i w CI

- pełny flow aplikacji działa na fizycznym iPhonie przez Expo Go — potwierdzone
  przez użytkownika;
- [GitHub Actions run 31652514043](https://github.com/reteter/motivAItion/actions/runs/31652514043)
  zbudował Release dla fizycznego iPhone'a bez podpisu;
- opublikowany artefakt: `motivaition-ios-unsigned`;
- plik w artefakcie: `motivaition-unsigned.ipa`.

Nie potwierdzono jeszcze instalacji tego konkretnego IPA przez Sideloadly.

## Aktualny stack

- Expo `54.0.36`;
- React Native `0.81.5`;
- React `19.1.0`;
- TypeScript `5.9.3`, strict;
- AsyncStorage `2.2.0`;
- iOS only, Continuous Native Generation;
- GitHub Actions `macos-26`, Xcode 26.6, build bez code signing.

## Granice obecnej wersji

M1 celowo nie zawiera:

- połączenia z LLM, backendu ani bezpiecznego proxy API;
- jawnego harmonogramu konkretnych sesji;
- stanów `skipped`, `missed` i `rescheduled`;
- lokalnych przypomnień;
- Consistency 7/30;
- edycji profilu, resetu danych i zmiany Protocolu przez UI;
- biblioteki zamienników ćwiczeń;
- postaci Gabawersum, questów i alternatywnego użytkownika;
- analityki, kont, synchronizacji i płatności.

`npm audit` raportuje 18 problemów zależności przechodnich: 7 moderate i 11 high,
bez critical. Automatyczna proponowana naprawa podnosi Expo do niezweryfikowanego
SDK 57, dlatego nie zastosowano `npm audit fix --force`. Aktualizacja toolchainu
jest osobnym zadaniem wymagającym sprawdzenia Expo Go oraz prawdziwego builda IPA.

## Mapa kodu

```text
App.tsx                     composition root
src/AppNavigator.tsx        prosty lokalny routing ekranów
src/domain/types.ts         źródłowe modele danych i CoachAction
src/domain/protocol.ts      generowanie Protocolu i Workout
src/domain/coach.ts         walidacja, actions i adaptacja
src/store/AppStore.tsx      hydratacja, persistence i komendy aplikacji
src/screens/                onboarding, baseline, dashboard, workout, completion, history
src/ui/                     dostępne komponenty i theme
tests/domain.test.ts        regresje domeny bez runtime React Native
.github/workflows/          build niepodpisanego IPA
```

## Następny krok

Najbliższy zatwierdzony vertical slice to tygodniowa pętla realizacji opisana w
[MILESTONE_2.md](MILESTONE_2.md). Prawdziwy model AI powinien wejść dopiero, gdy
aplikacja potrafi przekazać mu rzetelne dane o planach, wykonaniu, przełożeniach i
pominięciach.
