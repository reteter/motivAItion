# ADR-001 — backend Bounded AI Coach

- Status: **accepted for implementation, deployment pending**
- Data: 2026-08-13

## Decyzja

M3 używa małego Cloudflare Workera z Web Fetch API i pojedynczym Durable Object
`CoachCoordinator` jako transakcyjnym magazynem kodów, tokenów, dziennych
liczników i telemetry. Klient zna tylko adres
HTTPS. OpenAI API key, hash jednorazowego kodu, model i limity są konfiguracją
Workera.

Logika produktu nie importuje typów Cloudflare. Backend ma mały port storage i
czysty handler, dlatego testuje się bez sieci, a hosting można później wymienić
bez zmian w domenie aplikacji.

## Dlaczego teraz

- darmowy/prywatny dogfood potrzebuje małego blast radius;
- token instalacji można odwołać bez nowej IPA;
- Durable Object serializuje operacje i wspiera transakcje wymagane przez kod
  jednorazowy, revocation oraz accounting;
- serwer utrzymuje klucz i konfigurację modelu poza klientem.

## Threat model i zabezpieczenia

| Ryzyko | Kontrola |
|---|---|
| klucz OpenAI w IPA | sekret istnieje wyłącznie w środowisku Workera |
| skopiowany kod dostępu | 43 kryptograficznie losowe znaki z alfabetu bez `I/l/O/0/1` (>240 bitów), limit 5 prób/IP/godzinę i atomowe oznaczenie jako użyty |
| przejęty token | losowy token 256-bit, w Durable Object tylko SHA-256, atomowy revocation |
| nieograniczony koszt | atomowa rezerwacja limitu requestów i tokenów przed modelem, krótki output |
| prompt injection z danych | brak swobodnego tekstu w `CoachContextV1`, strict tool schema |
| niedozwolona akcja | walidacja backendu i niezależna walidacja domeny klienta |
| wyciek danych w logach | wyłącznie metadane, bez surowego kontekstu i propozycji |
| awaria sieci/modelu | krótki timeout klienta, jeden retry, fallback lokalny |

Pojedynczy globalny Durable Object jest właściwy dla prywatnego dogfood, lecz nie
jest architekturą masowego rolloutu. Przed szerszym udostępnieniem należy
partycjonować koordynatory i dodać zewnętrzny edge rate limit jako drugą warstwę.

## Retencja i usuwanie

Telemetry decyzji i outcome ma retencję 30 dni i limit 200 zdarzeń; nie zawiera
kontekstu ani treści propozycji i nie jest kopiowana do platformowych logów.
Rekord instalacji pozostaje do revocation;
nie zawiera danych treningowych. Wyłączenie coacha wywołuje revocation i usuwa
lokalny token z Secure Store. Historia decyzji pozostaje lokalnie jako część
obiektywnego dziennika produktu.
