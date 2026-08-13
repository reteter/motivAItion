# Stan projektu motivAItion

- Aktualność dokumentu: **2026-08-13**
- Baseline wdrożeniowy: **Milestone 2 / build number 2**
- Stan roboczy: **Milestone 3 / build number 3, lokalna implementacja bez deploymentu**
- Status: **M3 przechodzi testy lokalne; realny model, native CI i test urządzeniowy są otwarte**

## Aktualny vertical slice

Użytkownik może przejść pełną tygodniową pętlę realizacji:

```text
onboarding + baseline
  → versioned Protocol
  → wybór dni, pory i lokalnego przypomnienia
  → konkretne WorkoutOccurrence
  → Standard / Minimum / przełóż / pomiń
  → trening i feedback albo ustrukturyzowany powód
  → obiektywna historia + Consistency 7/30 + XP
  → spokojny recovery po pominięciu
```

Dashboard rozróżnia sesję na dziś, dzień regeneracji, termin po czasie,
ukończenie i powrót po przerwie. Standard i Minimum uruchamiają trening jednym
tapnięciem. Przełożenie i pominięcie wymagają drugiego tapnięcia wskazującego
powód ze zwalidowanego zbioru.

## Schedule i obiektywna historia

`TrainingSchedule` zapisuje wybrane dni tygodnia, lokalną porę, strefę czasową i
datę początku. Scheduler materializuje tylko najbliższe 14 dni i jest
idempotentny. Nie odtwarza wielomiesięcznego backlogu po długiej nieobecności.
Harmonogram podąża za lokalną porą użytkownika: po zmianie strefy przyszłe
nierozpoczęte occurrences są przeliczane na tę samą godzinę czasu urządzenia,
podczas gdy historia zachowuje pierwotne timestampy.

Każda sesja ma stabilne `WorkoutOccurrence` ze statusem `scheduled`,
`in_progress`, `completed`, `skipped`, `missed` albo `rescheduled`. Przełożenie
zamyka źródło i zachowuje relację z docelowym terminem; nie edytuje historii po
cichu. Tylko ukończenie treningu może nadać status `completed` i przyznać XP.

Consistency 7/30 liczy `completed / planned`. Standard i Minimum są wykonaniem,
`skipped` oraz `missed` pozostają w mianowniku, a źródła `rescheduled` są
pomijane. Dni odpoczynku nie są planowanymi occurrences i nie zaniżają wyniku.

## Recovery i bounded AI coach

W zweryfikowanym buildzie M2 coach nadal nie łączy się z API modelu. Aktualny kod
M3 ma remote port i backend adapter, ale bez wdrożonego endpointu nadal działa
wyłącznie lokalny fallback. Deterministyczny adapter może
wyłącznie wykonywać zamknięte `CoachAction`, między innymi:

- wybrać Minimum dla konkretnego occurrence;
- przełożyć albo pominąć occurrence z reason;
- zarekomendować Minimum po missed/skipped;
- zapisać `BehavioralObservation` jako hipotezę z confidence i dowodem;
- zmodyfikować wyłącznie przyszły Protocol na podstawie feedbacku.

Po pominięciu następna sesja rekomenduje Minimum, ale użytkownik może wybrać
Standard. Wybór jest zapisywany jako obserwacja, a aplikacja nie generuje kilku
zaległych Workoutów do nadrobienia. Powód `pain_or_limitation` sam w sobie nigdy
nie zwiększa trudności.

M3 dodaje minimalny `CoachContextV1`, jedną propozycję z expiry, jawne
`Zastosuj / Nie teraz`, źródło remote/local oraz zapis późniejszego wyniku.
Kontekst nie zawiera surowego Goal, `limitations`, notatek, tokenu ani pełnej
historii. Przy sygnale bólu lista dozwolonych zmian usuwa każdą progresję.

Backend z [ADR-001](ADR_001_M3_COACH_BACKEND.md) wymaga jednorazowego kodu,
wydaje losowy token instalacji, przechowuje wyłącznie jego hash i egzekwuje
dzienne limity requestów/tokenów. Sekret OpenAI i model są wyłącznie konfiguracją
serwera. Worker nie został jeszcze wdrożony.

## Przypomnienia lokalne

`src/notifications` zawiera port i adapter `expo-notifications`; domena nie
importuje biblioteki natywnej. Po zapisaniu harmonogramu aplikacja prosi o zgodę
systemową i planuje maksymalnie jedno przypomnienie dla najbliższej przyszłej
sesji. Zmiana, przełożenie albo ukończenie anuluje nieaktualny identyfikator.
Odmowa uprawnień nie blokuje harmonogramu ani treningów.

Zweryfikowany build M2 ma numer `2`. Kod M3 zwiększa numer do `3`, a bundle identifier pozostaje
`com.jakub.motivaition`, aby aktualizacja przez Sideloadly mogła zachować dane.

## Persistence i migracja

Stan M3 ma `schemaVersion: 3`, ale zachowuje istniejący klucz AsyncStorage
`@motivaition/app-state/v1`, aby odnaleźć instalację M1. Migracja v1 → v2 zachowuje
profil, baseline, wersje Protocolu, Workout history, observations i XP, a dla
historycznych treningów tworzy completed occurrences. Migracja v2 → v3 dodaje
wyłącznie pusty, domyślnie niezaakceptowany stan remote coacha.

Token instalacji nie trafia do AppState ani AsyncStorage. Przechowuje go
`expo-secure-store`; lokalna historia propozycji zawiera tylko proposal,
źródło, decyzję, metadane i ewentualny wynik occurrence.

## Weryfikacja M3 lokalnie

- `npm run typecheck` — PASS;
- `npm run test:domain` — PASS, w tym 20/20 fixtures i 100% safety fixtures;
- `npm run test:backend` — PASS: atomowy one-time code, enrollment limit,
  transakcyjny auth/quota/revocation, telemetry i strict tool;
- timeout, offline i semantycznie błędna propozycja przechodzą na local fallback;
- decision/outcome telemetry używa trwałego bounded outboxu z backoffem,
  deduplikacją i 5 próbami; opt-out natychmiast anuluje requesty, czyści kolejkę
  i blokuje późniejsze odtworzenie porzuconych zdarzeń;
- dodatkowe pola, obcy occurrence, forbidden action, expiry i drugie apply są odrzucane;
- apply nie może przyznać XP, dopisać completion ani zmienić Goal;
- `npm run check:expo` — PASS, build number 3 i oba config plugins;
- `npx expo install --check` — PASS;
- `npx expo-doctor` — 18/18 checks;
- `npx expo export --platform ios --output-dir dist` — PASS, 740 modułów,
  Hermes bundle 2.1 MB;
- składnia workflow, secret scan i `git diff --check` — PASS.

Wciąż wymagane są natywny workflow build 3, deployment backendu, prawdziwy model
eval i iPhone E2E.

Nieznany albo uszkodzony format jest odrzucany. Po błędzie odczytu stan domyślny
nie może przejść do zwykłego flow ani zostać zapisany. Osobny ekran pozwala
ponowić odczyt albo świadomie rozpocząć od nowa; jeżeli surowy payload został
odczytany, przed zastąpieniem aplikacja zachowuje go pod lokalnym kluczem recovery.

## Weryfikacja M2

### Zweryfikowane lokalnie

- `npm run typecheck`;
- `npm run test:domain` — ścisła walidacja v1/v2, blokada persistence po read
  error, daty, idempotencja, invarianty completion, overdue reminder,
  przełożenie, Consistency, recovery, rollover oraz przeliczenie strefy;
- `npm run check:expo`;
- `npx expo install --check`;
- `npx expo-doctor` — 18/18 checks;
- `npx expo export --platform ios --output-dir dist` — 731 modułów, bundle 2.04 MB;
- parsowanie składni workflow i `git diff --check`.

### Niezależne review

Świeży agent wykonał read-only review domeny, persistence, powiadomień, praktyk
iOS i zgodności AC1–AC8. Pierwsza runda wykryła trzy P1 i cztery P2/spec gaps.
Po poprawkach ten sam agent potwierdził zamknięcie wszystkich problemów
implementacyjnych, brak nowych regresji oraz gotowość kodu do testu urządzeniowego
i commita. Otwarte pozostały wyłącznie elementy wymagające realnego iPhone'a lub CI.

### Wymaga jeszcze weryfikacji

- pełny flow M2 przez Expo Go na fizycznym iPhonie;
- odebranie lokalnego przypomnienia oraz brak duplikatu po restarcie;
- instalacja aktualizacyjna IPA przez Sideloadly i zachowanie danych M1;
- siedmiodniowy scenariusz Standard / Minimum / przełożenie albo pominięcie;
- zachowanie przy realnej zmianie strefy czasowej oraz DST mimo lokalnych testów
  kontraktu wall-clock.

### Zweryfikowane w natywnym CI

[GitHub Actions run 31657121631](https://github.com/reteter/motivAItion/actions/runs/31657121631)
dla commita `70a274e` zakończył się sukcesem w 4m16s. Runner wygenerował projekt
iOS, zainstalował CocoaPods, zbudował Release dla fizycznego urządzenia bez
podpisu, spakował i opublikował:

- artefakt: `motivaition-ios-unsigned` — 6 329 596 B;
- plik w artefakcie: `motivaition-unsigned.ipa` — 6 407 984 B.

Pobrana zawartość artefaktu została sprawdzona i zawiera dokładnie jeden
oczekiwany plik IPA. Workflow zgłosił nieblokujące ostrzeżenie o migracji
wewnętrznego runtime Node dla `actions/upload-artifact@v4`; build aplikacji nadal
używa skonfigurowanego Node 20.

## Aktualny stack

- Expo `54.0.36`;
- React Native `0.81.5`, React `19.1.0`, TypeScript `5.9.3` strict;
- AsyncStorage `2.2.0`;
- `expo-notifications` `0.32.17`;
- `expo-secure-store` zgodny z Expo SDK 54;
- iOS only, Continuous Native Generation;
- GitHub Actions `macos-26`, Xcode 26.6, build bez code signing.

`npm audit` raportuje 19 problemów zależności przechodnich: 8 moderate i 11 high,
bez critical. Nie zastosowano `npm audit fix --force`, ponieważ proponuje
niezweryfikowany upgrade głównego toolchainu Expo.

## Mapa kodu

```text
src/domain/types.ts          modele v3, CoachProposal i bounded actions
src/domain/schedule.ts       daty, occurrences, Consistency i recovery
src/domain/migration.ts      bezpieczna migracja v1 → v2 → v3
src/domain/persistence.ts    reguła blokady zapisu przed bezpieczną hydratacją
src/domain/protocol.ts       generowanie i wersjonowanie Protocolu
src/domain/coach.ts          walidacja actions i adaptacja
src/store/AppStore.tsx       hydratacja, persistence i synchronizacja reminderów
src/notifications/           port oraz lokalny adapter iOS
src/coach/                   kontekst, contracts, fallback, remote port i service
src/screens/                 schedule, dashboard, AI opt-in, workout i historia
backend/                     Worker, auth/quota, Responses API i threat boundary
tests/coach*.ts              20 fixtures, privacy, safety i failure modes
tests/backend.test.ts        kontrakt auth/tool/quota/revocation
```

## Następny krok

Najbliższa ścieżka to pełne lokalne gate’y M3, review diffu i — po zgodzie na
publikację — natywny build 3. Równolegle trzeba zamknąć urządzeniowe AC8 M2.
Włączenie prawdziwego modelu wymaga utworzenia Workera/Durable Object, ustawienia sekretów,
real-model evals oraz publicznego `EXPO_PUBLIC_COACH_API_URL` w buildzie.
