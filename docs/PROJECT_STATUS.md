# Stan projektu motivAItion

- Aktualność dokumentu: **2026-08-13**
- Baseline urządzeniowy: **Milestone 3 / build number 4 na fizycznym iPhonie**
- Stan roboczy: **Milestone 4 / build number 6, nietrwały Developer Coach Chat**
- Status: **M4 zatwierdzony i backend wdrożony; live eval 6/6, natywne CI i dogfood builda 6 są otwarte**

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

W zweryfikowanym buildzie M2 coach nadal nie łączy się z API modelu. Build 4 M3
dostaje publiczny adres wdrożonego Workera przez `EXPO_PUBLIC_COACH_API_URL`, a
przy braku konfiguracji, tokenu albo sieci nadal używa lokalnego fallbacku.
Deterministyczny adapter może
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
serwera. Worker działa pod `https://motivaition-coach.arkoniel.workers.dev` z
`gpt-5.6-terra` i reasoning effort `low`.

## Milestone 4 — Developer Coach Chat

M4 dodaje z dashboardu osobny, jawnie deweloperski czat. Rozmowa istnieje tylko
podczas otwartego ekranu: wyjście, restart i `Nowy czat` usuwają transcript.
Snapshot danych jest ścisłą allowlistą, a request zachowuje najnowsze pełne tury
w limitach liczby wiadomości, znaków i bajtów UTF-8. Odpowiedzi mogą użyć
`web_search`; cytowania są renderowane inline oraz jako klikalne linki HTTPS.

Czat nie otrzymuje function actions, nie zapisuje rozmowy i nie może zmieniać
Protocolu, Workoutów, historii ani XP. Backend wymusza `store: false`, status
ukończonej odpowiedzi i prawidłowe cytowania. Osobna atomowa pula M4 ma 30
requestów i 200 000 tokenów dziennie, więc nie uszczupla limitu bounded coacha M3.
Nieznane błędy pozostawiają konserwatywną rezerwację, a błędy z rozpoznanym usage
są rozliczane według faktycznego kosztu.

Worker version `4b7e7fca-859d-4714-a823-08f2633233c2` jest wdrożony. Końcowy
live eval `gpt-5.6-terra`/Low przeszedł 6/6: dwa scenariusze celu, direct injection,
spoofed transcript, ból/duszność/zawroty oraz WHO web search z trzema cytowaniami.
Run zużył 37 112 tokenów wejścia i 1 929 wyjścia, z latency 1,866–11,303 s.
Szacowany koszt to co najmniej 0,1317 USD: około 0,1217 USD za tokeny plus co
najmniej 0,01 USD za web search według bieżącego cennika.

Świeży reviewer przeprowadził iteracyjny review kodu i po zamknięciu wszystkich
findingów P1–P3 dwukrotnie zatwierdził finalny stan jako gotowy produkcyjnie.
Otwarte pozostają wyłącznie natywny build IPA builda 6 i test na fizycznym
iPhonie: klawiatura, linki, VoiceOver, restart/reset, offline, timeout, revocation,
quota oraz ocena użyteczności.

## Przypomnienia lokalne

`src/notifications` zawiera port i adapter `expo-notifications`; domena nie
importuje biblioteki natywnej. Po zapisaniu harmonogramu aplikacja prosi o zgodę
systemową i planuje maksymalnie jedno przypomnienie dla najbliższej przyszłej
sesji. Zmiana, przełożenie albo ukończenie anuluje nieaktualny identyfikator.
Odmowa uprawnień nie blokuje harmonogramu ani treningów.

Zweryfikowany i zainstalowany build M3 ma numer `4`. Bieżące źródła zwiększają numer
do `5` dla poprawki pola jednorazowego kodu, a bundle identifier pozostaje
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

## Weryfikacja M3 i M4 lokalnie

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
- `npm run check:expo` — PASS, build number 6, publiczny URL coacha i oba config plugins;
- `npx expo install --check` — PASS;
- `npx expo-doctor` — 18/18 checks;
- `npx expo export --platform ios --output-dir dist` — PASS, 741 modułów,
  Hermes bundle 2.1 MB;
- składnia workflow, secret scan i `git diff --check` — PASS.

Wdrożony endpoint i health check są aktywne. Prawdziwy smoke request Terra/Low
przeszedł w 2933 ms: 775 tokenów wejścia, 71 wyjścia i zwalidowana rekomendacja
Minimum. Build 4 został następnie zainstalowany na fizycznym iPhonie: jednorazowy
kod został wymieniony na token, a aplikacja otrzymała prawidłową odpowiedź
zdalnego coacha. Kod dostępu został zgodnie z kontraktem zużyty.

Bieżący build 5 poprawia ręczne wpisywanie kodu: ekran reaguje na klawiaturę,
pozwala pokazać/ukryć znaki, używa fontu monospace, liczy 43 znaki i pomija
spacje. Generator kolejnych kodów nie używa mylących `I/l/O/0/1`. Lokalne gate'y
i natywny workflow builda 5 są zielone; test tej poprawki na iPhonie jest otwarty.

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

[GitHub Actions run 31688700959](https://github.com/reteter/motivAItion/actions/runs/31688700959)
dla commita `e833246` zbudował M3 build 4 w 4m29s i opublikował artefakt
`motivaition-ios-unsigned` z plikiem `motivaition-unsigned.ipa`. IPA została
podpisana przez Sideloadly, zainstalowana na fizycznym iPhonie i połączyła się
z wdrożonym coachem Terra/Low.

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
src/coach/                   kontekst, contracts, fallback, chat i remote port
src/screens/                 schedule, dashboard, AI opt-in, chat, workout i historia
backend/                     Worker, auth/quota, Responses API i threat boundary
tests/coach*.ts              M3 fixtures oraz M4 privacy, lifecycle i failure modes
tests/backend.test.ts        kontrakt auth/tools/quota/citations/revocation
```

## Pozostałe względem specyfikacji

1. Zamknąć M3: real-model eval, offline/revoked-token fallback oraz dogfood
   `Zastosuj` i `Nie teraz` z późniejszym wynikiem occurrence.
2. Dokończyć walidację urządzeniową M2: przypomnienie bez duplikatów, zachowanie
   danych przy aktualizacji, tygodniowy scenariusz i realna zmiana strefy/DST.
3. Zweryfikować, czy coach rzeczywiście poprawia długoterminową realizację celu;
   obecny test potwierdza techniczny vertical slice, nie główną hipotezę KPI.
4. Dopiero później rozszerzać produkt o bogatsze Behavioral Memory, aktywne
   interwencje coacha, Bonus/nagrody oraz warstwy Gabawersum, questów i
   alternatywnego użytkownika.

Najbliższy krok techniczny to natywny build i urządzeniowy dogfood builda 6.
Zaimplementowany eksperyment opisuje [MILESTONE_4.md](MILESTONE_4.md): nietrwały
czat deweloperski z domyślnym dostępem do `web_search`, bez actions aplikacji.
Pula M3 20/20 000 pozostaje niezależna od wdrożonej puli czatu 30/200 000.
