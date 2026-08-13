# Backend M3 — Bounded AI Coach

Kod jest przenośnym handlerem Fetch przygotowanym dla Cloudflare Workers. Wymaga
bindingu Durable Object `COACH_COORDINATOR` do eksportowanej klasy
`CoachCoordinator` oraz sekretów/zmiennych:

- `OPENAI_API_KEY` — sekret, nigdy `EXPO_PUBLIC_*`;
- `ACCESS_CODE_HASH` — SHA-256 jednorazowego kodu dogfood. Kod musi być wynikiem
  32 losowych bajtów zapisanych jako 43 znaki base64url bez paddingu;
- `COACH_MODEL=gpt-5.6-terra` — przypięty model wybrany do pierwszego dogfood;
- `COACH_REASONING_EFFORT=low` — jawny kompromis latency/jakość dla krótkiej
  propozycji w aplikacji mobilnej;
- `PROMPT_VERSION=m3-v1`;
- opcjonalnie `MAX_REQUESTS_PER_DAY` (domyślnie 20) i
  `MAX_TOKENS_PER_DAY` (domyślnie 20000).

Kod i hash generuje lokalnie:

```powershell
npm run coach:generate-access-code
```

Pierwszą linię przekazuje się użytkownikowi prywatnie, a wyłącznie hash ustawia
się jako sekret Workera. Kod jest wyświetlany tylko raz i nie trafia do pliku.

Worker udostępnia `POST /v1/installations`, `DELETE
/v1/installations/current`, `POST /v1/coach/proposals`, `POST /v1/coach/events`
i `GET /health`.
Kontekst nigdy nie jest logowany. Logi zawierają wyłącznie request ID, wersje,
latency, usage i kod wyniku generacji. Decyzje i outcome pozostają wyłącznie w
bounded storage Durable Object z retencją 30 dni.

Dogfood jest wdrożony pod `https://motivaition-coach.arkoniel.workers.dev` z
modelem `gpt-5.6-terra` i reasoning effort `low`. Pojedynczy real-model smoke
potwierdził enrollment, strict proposal, quota accounting i revocation.

Deployment i migracja Durable Object pozostają operacją administracyjną poza
repozytorium. Build aplikacji dostaje wyłącznie publiczny adres przez
`EXPO_PUBLIC_COACH_API_URL`.
