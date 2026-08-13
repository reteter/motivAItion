# Stan projektu motivAItion

- Aktualność dokumentu: **2026-08-13**
- Baseline wdrożeniowy: **Milestone 2 / build number 2**
- Status: **implementacja i niezależne review zakończone; AC8 w toku**

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

## Recovery i coach

Coach nadal **nie łączy się z API modelu**. Lokalny deterministyczny adapter może
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

## Przypomnienia lokalne

`src/notifications` zawiera port i adapter `expo-notifications`; domena nie
importuje biblioteki natywnej. Po zapisaniu harmonogramu aplikacja prosi o zgodę
systemową i planuje maksymalnie jedno przypomnienie dla najbliższej przyszłej
sesji. Zmiana, przełożenie albo ukończenie anuluje nieaktualny identyfikator.
Odmowa uprawnień nie blokuje harmonogramu ani treningów.

Build number został zwiększony do `2`, a bundle identifier pozostaje
`com.jakub.motivaition`, aby aktualizacja przez Sideloadly mogła zachować dane.

## Persistence i migracja

Stan ma `schemaVersion: 2`, ale zachowuje istniejący klucz AsyncStorage
`@motivaition/app-state/v1`, aby odnaleźć instalację M1. Migracja v1 → v2 zachowuje
profil, baseline, wersje Protocolu, Workout history, observations i XP, a dla
historycznych treningów tworzy completed occurrences.

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
- prawdziwy build GitHub Actions z `expo-notifications` i publikacja IPA;
- instalacja aktualizacyjna IPA przez Sideloadly i zachowanie danych M1;
- siedmiodniowy scenariusz Standard / Minimum / przełożenie albo pominięcie;
- zachowanie przy realnej zmianie strefy czasowej oraz DST mimo lokalnych testów
  kontraktu wall-clock.

Ostatnim natywnie zweryfikowanym wydaniem pozostaje M1:
[GitHub Actions run 31653186278](https://github.com/reteter/motivAItion/actions/runs/31653186278),
artefakt `motivaition-ios-unsigned`, plik `motivaition-unsigned.ipa`.

## Aktualny stack

- Expo `54.0.36`;
- React Native `0.81.5`, React `19.1.0`, TypeScript `5.9.3` strict;
- AsyncStorage `2.2.0`;
- `expo-notifications` `0.32.17`;
- iOS only, Continuous Native Generation;
- GitHub Actions `macos-26`, Xcode 26.6, build bez code signing.

`npm audit` raportuje 19 problemów zależności przechodnich: 8 moderate i 11 high,
bez critical. Nie zastosowano `npm audit fix --force`, ponieważ proponuje
niezweryfikowany upgrade głównego toolchainu Expo.

## Mapa kodu

```text
src/domain/types.ts          modele v2 i CoachAction
src/domain/schedule.ts       daty, occurrences, Consistency i recovery
src/domain/migration.ts      bezpieczna migracja v1 → v2
src/domain/persistence.ts    reguła blokady zapisu przed bezpieczną hydratacją
src/domain/protocol.ts       generowanie i wersjonowanie Protocolu
src/domain/coach.ts          walidacja actions i adaptacja
src/store/AppStore.tsx       hydratacja, persistence i synchronizacja reminderów
src/notifications/           port oraz lokalny adapter iOS
src/screens/                 schedule, dashboard, workout, completion i historia
tests/domain.test.ts         deterministyczne regresje domeny i migracji
```

## Następny krok

Najpierw należy zamknąć AC8: test Expo Go, lokalne przypomnienie, natywny workflow
i instalacja aktualizacyjna IPA. Równolegle można przygotować kontrakty i fixture
evals dla [M3 — Bounded AI Coach](MILESTONE_3.md). Włączenie zdalnego modelu dla
użytkownika wymaga opt-in, bezpiecznego proxy i pozytywnego wyniku dogfood M2.
