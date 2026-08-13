# Backend M3/M4 — Bounded AI Coach i Developer Chat

Kod jest przenośnym handlerem Fetch przygotowanym dla Cloudflare Workers. Wymaga
bindingu Durable Object `COACH_COORDINATOR` do eksportowanej klasy
`CoachCoordinator` oraz sekretów/zmiennych:

- `OPENAI_API_KEY` — sekret, nigdy `EXPO_PUBLIC_*`;
- `ACCESS_CODE_HASH` — SHA-256 jednorazowego kodu dogfood. Generator tworzy
  kryptograficznie losowy kod o długości 43 znaków z alfabetu bez mylących
  `I`, `l`, `O`, `0` i `1`;
- `COACH_MODEL=gpt-5.6-terra` — przypięty model wybrany do pierwszego dogfood;
- `COACH_REASONING_EFFORT=low` — jawny kompromis latency/jakość dla krótkiej
  propozycji w aplikacji mobilnej;
- `PROMPT_VERSION=m3-v1`;
- opcjonalnie `MAX_REQUESTS_PER_DAY` (domyślnie 20) i
  `MAX_TOKENS_PER_DAY` (domyślnie 20000);
- opcjonalnie `MAX_CHAT_REQUESTS_PER_DAY` (domyślnie 30) i
  `MAX_CHAT_TOKENS_PER_DAY` (domyślnie 200000) dla osobnej puli M4.

Kod i hash generuje lokalnie:

```powershell
npm run coach:generate-access-code
```

Kod z pierwszej linii przekazuje się użytkownikowi prywatnie; wariant `Manual
entry` można wpisać razem ze spacjami w aplikacji. Wyłącznie hash ustawia się
jako sekret Workera. Kod jest wyświetlany tylko raz i nie trafia do pliku.

Worker udostępnia `POST /v1/installations`, `DELETE
/v1/installations/current`, `POST /v1/coach/proposals`, `POST /v1/coach/chat`,
`POST /v1/coach/events` i `GET /health`.
Kontekst nigdy nie jest logowany. Logi zawierają wyłącznie request ID, wersje,
latency, usage i kod wyniku generacji. Decyzje i outcome pozostają wyłącznie w
bounded storage Durable Object z retencją 30 dni.

Dogfood jest wdrożony pod `https://motivaition-coach.arkoniel.workers.dev` z
modelem `gpt-5.6-terra` i reasoning effort `low`. Pojedynczy real-model smoke
potwierdził enrollment, strict proposal, quota accounting i revocation.

M4 używa tego samego odwoływalnego tokenu instalacji, lecz osobnego limitu. Czat
wysyła tylko allowlistowany snapshot i ograniczony transcript, używa `store: false`,
udostępnia wyłącznie `web_search`, waliduje cytowania HTTPS i nie ma function
actions. Końcowy live eval Terra/Low przeszedł 6/6 scenariuszy.

Live eval M4 uruchamia się z tokenem testowej instalacji wyłącznie w zmiennych
procesu:

```powershell
$env:COACH_API_URL='https://motivaition-coach.arkoniel.workers.dev'
$env:INSTALLATION_TOKEN='<token>'
npm run coach:evaluate-chat
```

Skrypt nie utrwala tokenu; raport zawiera syntetyczne odpowiedzi, latency, usage
i cytowania potrzebne do manualnego review.

Deployment i migracja Durable Object pozostają operacją administracyjną poza
repozytorium. Build aplikacji dostaje wyłącznie publiczny adres przez
`EXPO_PUBLIC_COACH_API_URL`.
