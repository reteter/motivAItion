# Milestone 4 — deweloperski czat AI

- Status: **zaimplementowany, niezależnie zatwierdzony i wdrożony; build 6 oczekuje na natywne CI i dogfood na iPhonie**
- Robocza nazwa: **Developer Coach Chat**

## Cel

M4 dodaje osobny, eksperymentalny czat z `gpt-5.6-terra`/Low. Użytkownik może
swobodnie omówić bieżący dzień i poprosić o propozycję dodatkowego albo dłuższego
treningu. Czat nie zastępuje bounded coacha M3 i nie ma prawa modyfikować stanu
aplikacji.

Przykładowe pytania:

- „Cześć, dzisiaj mam dobry dzień i chciałbym dodatkowo się rozruszać — co proponujesz?”
- „Dzisiaj możemy wydłużyć trening do 30 minut, zaproponuj mi proszę workout.”

## Zatwierdzone decyzje

- Czat działa w jawnie oznaczonym trybie deweloperskim.
- `web_search` jest dostępny modelowi domyślnie w każdym requestcie; model decyduje,
  czy wyszukiwanie jest potrzebne. Odpowiedzi korzystające z sieci pokazują źródła.
- Rozmowa jest wieloturowa tylko podczas otwartego ekranu i nie jest utrwalana.
- Klient trzyma transcript wyłącznie w stanie komponentu. Wyjście z ekranu,
  „Nowy czat” albo restart aplikacji usuwa rozmowę.
- Backend używa `store: false`, nie tworzy Conversation i nie korzysta z
  `previous_response_id`; każdy request zawiera ograniczony transcript bieżącego ekranu.
- Czat zwraca wyłącznie tekst. Nie otrzymuje function tools ani actions aplikacji.
- Sugestia czatu nie zmienia Protocolu, Workout, historii, XP ani Consistency.

## Kontekst i prywatność

Request zawiera allowlistowany snapshot treningowy oraz swobodny tekst rozmowy:

- dzisiejszy stan i plan, wariant Minimum oraz bieżący Protocol;
- baseline i dostępny czas w ustrukturyzowanej postaci;
- zagregowane Consistency i feedback;
- structured pain/limitation flag;
- maksymalnie 12 ostatnich wiadomości bieżącego, nietrwałego czatu.

Przed pierwszym wejściem UI jawnie informuje, że swobodny tekst i dane widoczne na
ekranie są wysyłane do OpenAI oraz że `web_search` może wysyłać zapytania do sieci.
Backend nie loguje treści wiadomości, transcriptu ani wyników wyszukiwania.

## Backend i budżet deweloperski

Nowy endpoint:

```text
POST /v1/coach/chat
```

Używa istniejącego odwoływalnego tokenu instalacji, ale ma osobną atomową pulę:

```text
MAX_CHAT_REQUESTS_PER_DAY=30
MAX_CHAT_TOKENS_PER_DAY=200000
```

Obecne `MAX_REQUESTS_PER_DAY=20` i `MAX_TOKENS_PER_DAY=20000` pozostają pulą
bounded coacha M3. Dzięki rozdzieleniu intensywny czat nie blokuje propozycji
potrzebnych do głównej pętli produktu. Limit czatu jest wdrożony razem z
endpointem, a pula M3 pozostała bez zmian.

Parametry pierwszego dogfood:

- model `gpt-5.6-terra`, reasoning effort `low`;
- `tools: [{ "type": "web_search" }]`, automatyczny wybór użycia narzędzia;
- `store: false`, bez function calling i bez trwałego state;
- maksymalnie 2 000 tokenów odpowiedzi na turn;
- limit długości pojedynczej wiadomości, transcriptu i request body;
- quota rezerwowana przed requestem i rozliczana z rzeczywistego usage po odpowiedzi.

## UI

- osobny ekran `DeveloperChatScreen` dostępny z dashboardu;
- stała etykieta `DEV · web search dostępny`;
- komunikat „Ta rozmowa nie jest zapisywana”;
- lista wiadomości, pole nad klawiaturą i przycisk `Wyślij`;
- szybkie prompty dla dodatkowego ruchu i wydłużonego treningu;
- przycisk `Nowy czat`, który natychmiast usuwa lokalny transcript;
- źródła web search jako klikalne linki przy odpowiedzi;
- czytelne stany loading, timeout, offline, unauthorized i quota exhausted.

## Prompt i granice

Instrukcja serwerowa mówi modelowi, że działa w eksperymentalnym trybie
deweloperskim motivAItion, rozmawia po polsku i może doradzać, ale nie może twierdzić,
że zmienił plan albo stan aplikacji. Tryb deweloperski nie wyłącza zasad
bezpieczeństwa. Przy bólu, urazie, duszności, zawrotach głowy albo innym sygnale
ryzyka model ma ograniczyć poradę treningową i zalecić adekwatną ostrożność.

## Kryteria akceptacji

1. Wieloturowy czat działa na fizycznym iPhonie i odpowiada na oba scenariusze celu.
2. `web_search` jest dostępny domyślnie, a odpowiedź oparta na sieci pokazuje źródła.
3. Wyjście z ekranu i restart aplikacji usuwają rozmowę; wiadomości nie trafiają do
   AppState, AsyncStorage, Secure Store ani Durable Object.
4. Request OpenAI ma `store: false`, nie używa Conversation ani `previous_response_id`.
5. Czat nie ma function actions i nie potrafi zmienić żadnego stanu treningowego.
6. Osobne limity 30 requestów i 200 000 tokenów nie naruszają puli M3.
7. Timeout, offline, revocation i wyczerpana quota pokazują błąd bez utraty AppState.
8. Testy obejmują prywatność, limity payloadu, prompt injection, safety i cytowania.
9. Natywny workflow publikuje IPA, a dogfood potwierdza koszt, latency i użyteczność.

## Stan implementacji i weryfikacji — 2026-08-13

Zaimplementowano pełny pionowy slice: osobny ekran czatu, allowlistowany snapshot,
nietrwały transcript, bezpieczne przycinanie pełnych tur, timeout i anulowanie,
czytelne błędy, reset, revocation CTA oraz klikalne cytowania HTTPS. Request
sieciowy jest normalizowany wyłącznie do `{ role, content }`; AppState,
AsyncStorage, Secure Store i Durable Object nie przechowują rozmowy.

Backend `POST /v1/coach/chat` jest wdrożony pod
`https://motivaition-coach.arkoniel.workers.dev` jako Worker version
`4b7e7fca-859d-4714-a823-08f2633233c2`. Adapter Responses API wymusza
`store: false`, akceptuje wyłącznie ukończone odpowiedzi, nie udostępnia actions,
waliduje cytowania i używa prywatnościowego `safety_identifier` utworzonego z
hasha tokenu instalacji. Osobna pula 30 requestów / 200 000 tokenów jest
rezerwowana i rozliczana atomowo, również dla błędów po płatnej odpowiedzi.

Niezależny reviewer wykonał iteracyjne pełne review i po poprawkach zatwierdził
kod jako gotowy produkcyjnie bez pozostałych problemów P1–P3. Lokalne gate'y są
zielone: `npm test`, `npm run typecheck`, `npm run check:expo`,
`npx expo install --check`, `npx expo-doctor` (18/18), eksport iOS, syntax check
eval oraz `git diff --check`.

Końcowy live eval przypiętego `gpt-5.6-terra`/Low przeszedł **6/6** scenariuszy:
dodatkowy ruch, trening 30-minutowy, bezpośredni prompt injection, podszyty
transcript, ból w klatce/duszność/zawroty oraz web search WHO. Odpowiedź WHO
zawierała trzy zwalidowane, klikalne cytowania. Zaobserwowano 37 112 tokenów
wejścia, 1 929 wyjścia i latency 1,866–11,303 s. Według cennika z dnia testu
koszt tokenów wyniósł około **0,1217 USD**; co najmniej jedno użycie web search
dodaje około **0,01 USD**, więc szacowany koszt całego runu to co najmniej
**0,1317 USD**. Dokładny koszt rozliczeniowy zależy od liczby wewnętrznych wywołań
narzędzia widocznej na fakturze.

AC2–AC8 są pokryte implementacją, deterministycznymi testami i live eval. AC1 i
AC9 pozostają częściowo otwarte do czasu zielonego natywnego builda 6 oraz testu
na fizycznym iPhonie. Nie potwierdzono jeszcze urządzeniowo klawiatury, linków,
VoiceOver, restartu/resetu, offline/timeout/revocation/quota ani użyteczności.

## Poza zakresem

- zapamiętywanie rozmów między wejściami do ekranu;
- automatyczne stosowanie sugestii do Protocolu lub Workout;
- voice chat, obrazy, pliki i inne narzędzia niż `web_search`;
- publiczny rollout bez osobnego review bezpieczeństwa i kosztów.
