# Milestone 3 — ograniczona pętla AI

- Status: **enrollment i realna odpowiedź na iPhonie potwierdzone; pełny eval i rozszerzony AC8 w toku**
- Robocza nazwa: **Bounded AI Coach**

## Cel

M2 tworzy wiarygodny zapis planów, wykonań i oporu użytkownika. M3 ma po raz
pierwszy wykorzystać prawdziwy model, ale nie oddaje mu kontroli nad stanem.
Model analizuje mały, jawny kontekst i proponuje najwyżej jedną akcję z
zamkniętego katalogu. Aplikacja i domena nadal są jedynym źródłem prawdy.

Hipoteza M3:

> Krótka, kontekstowa propozycja oparta na rzeczywistym zachowaniu zwiększy
> prawdopodobieństwo kolejnego wykonania bardziej niż sam komunikat regułowy,
> jeśli pozostanie zrozumiała, odwracalna i łatwa do odrzucenia.

M3 nie ma udowodnić, że model potrafi układać idealny trening. Ma sprawdzić, czy
ograniczona personalizacja pomaga użytkownikowi podjąć następne realne działanie.

## Docelowy flow

```text
lokalny AppState v3
  → zminimalizowany CoachContext
  → bezpieczny endpoint backendowy
  → OpenAI Responses API + jedna strict function proposal
  → walidacja serwera
  → walidacja domeny w aplikacji
  → krótka rekomendacja + dlaczego
  → zaakceptuj / odrzuć
  → zapis decyzji i późniejszego wyniku
```

## Granica bezpieczeństwa

- Klucz OpenAI nie trafia do aplikacji, repozytorium, Expo config ani IPA.
- Aplikacja komunikuje się wyłącznie z własnym endpointem HTTPS.
- Backend trzyma sekret w zmiennej środowiskowej i ma limity kosztu oraz ruchu.
- Prywatny dogfood używa odwoływalnego tokenu instalacji wydanego po jednorazowym
  kodzie dostępu; wspólny sekret nie jest zaszyty w aplikacji.
- Token instalacji jest przechowywany przez adapter bezpiecznego storage i można
  go unieważnić bez wydawania nowej wersji IPA.
- Awaria sieci, modelu albo backendu zawsze wraca do lokalnego coacha M2.

Hosting został wybrany w [ADR-001](ADR_001_M3_COACH_BACKEND.md): mały Cloudflare
Worker z Durable Object, sekretem środowiskowym, limitami i revocation. Typy Cloudflare nie
przenikają do domeny ani klienta mobilnego. Dogfood działa pod
`https://motivaition-coach.arkoniel.workers.dev`.

## Minimalny kontekst wysyłany do modelu

`CoachContextV1` zawiera wyłącznie:

- wersję kontraktu i promptu;
- dzisiejszy stan: rest / scheduled / overdue / recovery / completed;
- najbliższy occurrence, jego dozwolone warianty i Protocol version;
- zagregowane Consistency 7/30;
- zagregowane statusy oraz reasons z ostatnich 14 dni;
- zagregowany feedback ćwiczeń i flagę wystąpienia bólu/ograniczenia;
- dotychczasowe BehavioralObservations jako hipotezy o ograniczonej confidence;
- dozwolone w danym momencie typy propozycji.

Nie wysyłamy surowego celu, pola `limitations`, swobodnych notatek, identyfikatorów
powiadomień, tokenu instalacji ani pełnego AppState. Użytkownik widzi ekran opt-in
opisujący wysyłane kategorie danych i może trwale wyłączyć zdalnego coacha.

## Kontrakt propozycji

Model zwraca `CoachProposalV1`:

```text
proposalId
message
rationaleCode
action: dokładnie jedna dozwolona CoachAction albo null
expiresAt
promptVersion
```

Pierwszy katalog zdalnych propozycji:

- rekomendacja Minimum dla konkretnego przyszłego occurrence;
- rekomendacja recovery;
- ograniczona zmiana przyszłego Protocolu w istniejących limitach;
- BehavioralObservation jako hipoteza;
- brak akcji z krótkim wspierającym komunikatem.

Model nie może ukończyć treningu, przyznać XP, usunąć historii, zmienić Goal,
samodzielnie pominąć/przełożyć sesji ani zwiększyć trudności po sygnale
`pain_or_limitation`. Propozycja zmienia stan dopiero po ponownej walidacji i
akceptacji użytkownika.

Backend używa Responses API z function calling w trybie `strict: true`, schematem
bez dodatkowych pól i `parallel_tool_calls: false`, aby odpowiedź zawierała zero
lub jedną propozycję. Jest to zgodne z aktualnymi zaleceniami
[OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling).
Model i reasoning effort są konfiguracją serwera, nie częścią kontraktu aplikacji;
wybór następuje na podstawie fixture evals, kosztu i opóźnienia.

## Stan implementacji — 2026-08-13

Zaimplementowane:

- schema v3 i bezstratna migracja v1 → v2 → v3 przy zachowaniu klucza storage;
- `CoachContextV1`, strict parser oraz deterministyczny serializer;
- `CoachProposalV1`, zamknięty katalog actions i podwójna walidacja;
- zapis pending/applied/rejected/expired, idempotencja i outcome occurrence;
- jawny opt-in/opt-out, ekran kategorii danych i etykieta remote/local;
- token instalacji w iOS Secure Store i ponawialna revocation;
- timeout 5 s, maksymalnie jeden retry requestu oraz czysty local fallback service;
- trwały, ograniczony telemetry outbox z backoffem i limitem 5 prób; opt-out
  natychmiast anuluje requesty, czyści kolejkę i tombstonuje porzucone zdarzenia;
- Worker: atomowy one-time access code, enrollment rate limit, hash tokenu,
  transakcyjny auth/quota/revocation, decision/outcome telemetry i metadata-only logs;
- OpenAI adapter:
  OpenAI Responses API z `strict: true`, `parallel_tool_calls: false`, `store: false`,
  modelem `gpt-5.6-terra` i reasoning effort `low`;
- 20 deterministycznych fixtures z expected state/action/rationale/message,
  100% safety fixtures i test kontraktu backendu;
- wdrożony Worker, migracja SQLite Durable Object i prawdziwy smoke request;
- build 4 zbudowany w natywnym CI, podpisany, zainstalowany i połączony z Terra/Low
  na fizycznym iPhonie;
- build 5 z zielonym natywnym CI, poprawiający pole kodu dostępu i generator bez
  mylących znaków.

Niewykonane lub niezweryfikowane:

- pełny eval przypiętej konfiguracji na reprezentatywnych outputs realnego modelu;
- urządzeniowa walidacja poprawki UX builda 5;
- airplane mode, revocation i opt-out podczas requestu na fizycznym iPhonie;
- zaakceptowana i odrzucona propozycja wraz z późniejszym wynikiem w dogfood.

Status AC: AC1–AC4 i AC7 są pokryte implementacyjnie, a prawdziwa odpowiedź modelu
dotarła do builda 4 na iPhonie. AC5 wymaga urządzeniowego testu failure modes,
AC6 pełnego real-model eval, a AC8 dogfood apply/reject wraz z outcomes.

## UX

Na dashboardzie pojawia się jedna karta „Coach proponuje”:

- jednozdaniowa rekomendacja;
- krótki, konkretny powód oparty na danych, nie diagnoza psychologiczna;
- przyciski `Zastosuj` i `Nie teraz`;
- jawna etykieta, czy odpowiedź pochodzi ze zdalnego AI czy lokalnego fallbacku.

Odrzucenie nie obniża XP ani Consistency. Ta sama propozycja nie wraca po każdym
renderze; ma stabilne ID, expiry i zapis decyzji.

## Kryteria akceptacji

### AC1 — sekret i dostęp są poza klientem

- Repo, bundle JavaScript i IPA nie zawierają klucza OpenAI ani sekretu backendu.
- Endpoint wymaga odwoływalnego tokenu instalacji i egzekwuje rate/spend limits.
- Brak tokenu lub jego unieważnienie uruchamia bezpieczny fallback lokalny.

### AC2 — kontekst jest minimalny i jawny

- Serializer ma wersję i deterministyczne testy snapshot/fixture.
- Payload nie zawiera zakazanych pól ani swobodnego tekstu użytkownika.
- Opt-in pokazuje kategorie danych; opt-out zatrzymuje wszystkie zdalne requesty.

### AC3 — odpowiedź modelu jest ograniczona

- Backend dopuszcza zero lub jedną strict function proposal.
- Zarówno backend, jak i klient odrzucają nieznany typ, dodatkowe pola, zły
  occurrence, wygaśnięcie i przekroczenie limitów domeny.
- Model nie ma ścieżki do completion, XP, kasowania historii ani zmiany Goal.

### AC4 — użytkownik zachowuje kontrolę

- Żadna propozycja nie zmienia stanu przed `Zastosuj`.
- Akceptacja i odrzucenie są zapisywane wraz z późniejszym wynikiem occurrence.
- Propozycja jest idempotentna i nie może zostać zastosowana dwa razy.

### AC5 — failure mode nie blokuje treningu

- Timeout, offline, 4xx/5xx, refusal i invalid schema pokazują lokalny fallback.
- Request ma krótki timeout, retry z limitem i nie blokuje startu Workout.
- Błąd zdalny nie nadpisuje ostatniego poprawnego AppState.

### AC6 — jakość jest mierzona przed rolloutem

- Minimum 20 fixture scenarios obejmuje rest, overdue, recovery, pain, dobrą
  realizację, słabą realizację i sprzeczne obserwacje.
- Każdy fixture ocenia poprawność action, bezpieczeństwo, uzasadnienie i brak
  zakazanych danych; wynik jest powtarzalny dla przypiętej konfiguracji.
- Rollout wymaga 100% safety fixtures oraz jawnego progu jakości propozycji.

### AC7 — obserwowalność nie narusza prywatności

- Logowane są request ID, prompt/model version, latency, token usage, kod wyniku
  walidacji i decyzja użytkownika — bez surowego CoachContext.
- Użytkownik może zobaczyć ostatnią propozycję i źródło jej zastosowania.
- Retencja metadanych i sposób usuwania tokenu są udokumentowane.

### AC8 — realny vertical slice

- Fizyczny iPhone otrzymuje prawdziwą propozycję z backendu i potrafi zastosować
  ją do następnej sesji.
- Tryb samolotowy i unieważniony token potwierdzają lokalny fallback.
- CI testuje klienta, kontrakt backendu i fixtures, a workflow publikuje IPA.
- Dogfood zapisuje co najmniej jedną zaakceptowaną i jedną odrzuconą propozycję
  wraz z wynikiem następnego occurrence.

## Kolejność implementacji

1. ADR hostingu, threat model, `CoachContextV1` i `CoachProposalV1`.
2. Czyste serializery, walidatory i 20 fixture scenarios bez sieci.
3. Port `RemoteCoach`, lokalny fake i UX opt-in/proposal/fallback.
4. Minimalny backend, token instalacji, rate limit i Responses API strict tool.
5. Integracja end-to-end, telemetry metadata i testy failure modes.
6. iPhone, CI/IPA i ograniczony dogfood.

## Poza zakresem M3

- otwarty chatbot i wieloturowa pamięć rozmów;
- autonomiczne wykonywanie wielu actions;
- wysyłanie pełnej historii lub swobodnych notatek;
- konta społecznościowe i pełna synchronizacja chmurowa;
- zdalne push notifications;
- voice coach;
- Gabawersum, questy, alternatywny użytkownik i rankingi;
- automatyczny wybór najnowszego modelu bez evals;
- fine-tuning.

## Warunki wejścia i zakończenia

Przed udostępnieniem M3 użytkownikowi muszą być zamknięte techniczne elementy AC8
M2: działający reminder na iPhonie, zielony natywny build oraz aktualizacja IPA bez
utraty danych. Siedmiodniowy dogfood M2 może trwać równolegle z budową kontraktów,
fixture evals i lokalnego fake adaptera M3.

Milestone jest zakończony dopiero po przejściu safety fixtures, prawdziwym
request/response na iPhonie, udowodnionym fallbacku i porównaniu co najmniej kilku
propozycji z zachowaniem lokalnego coacha.
