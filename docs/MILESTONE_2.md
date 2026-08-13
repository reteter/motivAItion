# Milestone 2 — tygodniowa pętla realizacji

- Status: **zatwierdzony do implementacji 2026-08-13**
- Robocza nazwa: **Return Tomorrow**

## Cel

M1 udowodnił, że użytkownik może przejść pełny pojedynczy trening. M2 ma sprawić,
że aplikacja stanie się użyteczna przez cały tydzień i zacznie mierzyć zachowanie,
które jest najważniejsze dla produktu: czy zaplanowane działanie rzeczywiście się
wydarzyło i co pomogło albo przeszkodziło.

Hipoteza M2:

> Konkretny harmonogram, przypomnienie we właściwym momencie oraz łatwa decyzja
> Standard / Minimum / przełóż / pomiń zwiększą szansę powrotu do kolejnego
> treningu bez karania użytkownika za pojedyncze potknięcie.

M2 nadal używa lokalnego, deterministycznego coacha. Nie podłączamy jeszcze API
modelu, ponieważ najpierw potrzebujemy wiarygodnego zapisu planowanych i
niewykonanych zdarzeń.

## Docelowy flow użytkownika

```text
Protocol + wybrane dni i pora
  → konkretna zaplanowana sesja
  → lokalne przypomnienie
  → Standard / Minimum / przełóż / pomiń
  → wykonanie albo jawny powód niewykonania
  → historia wystąpienia
  → Consistency 7/30
  → spokojny powrót po przerwie
```

## Zakres funkcjonalny

### 1. Jawny harmonogram

Użytkownik wybiera konkretne dni tygodnia zgodne z `daysPerWeek` oraz preferowaną
porę. Aplikacja materializuje kolejne wystąpienie treningu zamiast wyliczać je
wyłącznie z daty ostatniego completion.

Minimalny model:

```text
TrainingSchedule
  weekdays
  localTime
  timeZone

WorkoutOccurrence
  id
  localDate
  protocolVersion
  status: scheduled | in_progress | completed | skipped | missed | rescheduled
  sourceOccurrenceId?
  decisionReason?
```

Historia wystąpień jest append-only. Przełożenie zamyka stare wystąpienie jako
`rescheduled` i tworzy nowe; nie zmienia daty po cichu.

### 2. Aktywna reakcja coacha

Dashboard rozróżnia:

- trening zaplanowany dziś;
- dzień odpoczynku;
- trening zaległy;
- powrót po pominiętej sesji;
- trening już wykonany.

W dniu treningu dostępne są cztery jednoznaczne ścieżki:

- zacznij Standard;
- zrób Minimum;
- przełóż na najbliższy dozwolony termin;
- pomiń i wskaż krótki powód.

Powody w M2 są zamkniętym zbiorem: `low_energy`, `no_time`, `pain_or_limitation`,
`exercise_resistance`, `other`. Dłuższy opis pozostaje opcjonalny.

### 3. Lokalne przypomnienia iOS

Dodajemy wyłącznie lokalne przypomnienia przez adapter powiadomień. Nie dodajemy
push backendu ani konta użytkownika.

Zasady:

- prośba o zgodę pojawia się dopiero po pokazaniu wartości i wybraniu terminu;
- odmowa nie blokuje korzystania z aplikacji;
- powiadomienie dotyczy najbliższej konkretnej sesji;
- zmiana lub przełożenie sesji anuluje stare przypomnienie;
- aplikacja nie planuje duplikatów po restarcie;
- tekst przypomnienia jest konkretny i pokazuje dostępność wersji Minimum.

Warstwa domenowa nie importuje `expo-notifications`. Otrzymuje port, a adapter
platformowy realizuje planowanie i anulowanie.

### 4. Consistency zamiast streaka

Dashboard i historia pokazują:

- Consistency 7 dni;
- Consistency 30 dni;
- liczbę `completed / planned` w danym oknie.

Reguły:

- Standard i Minimum liczą się jako wykonanie;
- dni odpoczynku nie wchodzą do mianownika;
- `skipped` i `missed` pozostają w mianowniku;
- `rescheduled` nie liczy się dwa razy — liczy się docelowe wystąpienie;
- pojedyncze pominięcie nie zeruje dotychczasowego wyniku.

### 5. Recovery po przerwie

Po pominięciu aplikacja nie tworzy backlogu kilku treningów. Przy następnym
terminie coach proponuje spokojny powrót: Minimum jako rekomendację, z możliwością
wybrania Standardu. Fakt przyjęcia lub odrzucenia rekomendacji jest zapisywany.

## Kontrolowane actions M2

Rozszerzamy istniejący zamknięty zestaw operacji o:

```text
choose_minimum_workout
reschedule_workout_occurrence
skip_workout_occurrence
recommend_recovery_workout
add_behavioral_observation
```

Actions nie mogą usuwać occurrence, cofać completion, zmieniać Goal ani tworzyć
więcej treningów niż dopuszcza harmonogram.

## Kryteria akceptacji

### AC1 — schedule jest źródłem planowanych terminów

- Użytkownik wybiera dni i porę.
- Po restarcie widzi ten sam najbliższy termin.
- Dzień odpoczynku nie pokazuje treningu jako zaległego.
- Zmiana Protocolu nie przepisuje historycznych occurrences.

### AC2 — lifecycle occurrence jest jawny i idempotentny

- Każda planowana sesja ma stabilne ID i dokładnie jeden końcowy status.
- Ponowne uruchomienie aplikacji nie tworzy duplikatu.
- Przełożenie zachowuje relację pomiędzy pierwotnym a nowym occurrence.
- Coach nie może oznaczyć sesji jako wykonanej.

### AC3 — opór użytkownika prowadzi do działania i danych

- Standard, Minimum, przełożenie i pominięcie wymagają najwyżej dwóch tapnięć.
- Minimum nadal daje XP i liczy się do Consistency.
- Przełożenie oraz pominięcie zapisują ustrukturyzowany reason.
- `pain_or_limitation` nie proponuje zwiększenia trudności.

### AC4 — przypomnienie jest użyteczne i bezpieczne

- iOS otrzymuje jedno lokalne przypomnienie dla najbliższej sesji.
- Przełożenie/ukończenie anuluje nieaktualne przypomnienie.
- Odmowa uprawnień nie psuje flow.
- Restart aplikacji nie mnoży przypomnień.

### AC5 — Consistency jest policzone z obiektywnej historii

- Wyniki 7/30 są deterministyczne dla tych samych occurrences i daty referencyjnej.
- Rest days i rescheduled sources nie zaniżają wyniku.
- Ekran pokazuje procent oraz `completed / planned`.
- Brak klasycznego resetowanego streaka jako głównej miary.

### AC6 — recovery nie karze backlogiem

- Po missed/skipped następny termin rekomenduje Minimum.
- Użytkownik może mimo rekomendacji wybrać Standard.
- Aplikacja nie generuje kilku zaległych Workoutów naraz.
- Decyzja zasila BehavioralObservation jako hipotezę, nie prawdę absolutną.

### AC7 — migracja danych jest bezpieczna

- Stan M1 `schemaVersion: 1` migruje do v2 bez utraty profilu, Protocolu, historii i XP.
- Błąd migracji nie nadpisuje zapisanych danych.
- Migracja jest pokryta testem z realnym fixture v1.

### AC8 — prawdziwy iPhone i IPA

- Pełny flow działa przez Expo Go na fizycznym iPhonie.
- Lokalne przypomnienie zostało odebrane na urządzeniu.
- GitHub Actions buduje i publikuje niepodpisany IPA.
- Instalacja IPA przez Sideloadly zachowuje dane poprzedniej wersji przy tym samym
  bundle ID i Apple ID.

## Kolejność implementacji

1. Domena `TrainingSchedule` i `WorkoutOccurrence`, migracja v1 → v2 oraz testy dat.
2. Dashboard dla scheduled/rest/missed i operacje Minimum/reschedule/skip.
3. Consistency 7/30 oraz historia decyzji.
4. Port powiadomień i lokalny adapter iOS.
5. Test pełnego tygodniowego scenariusza na urządzeniu, build IPA i instalacja
   aktualizacyjna przez Sideloadly.

Każdy etap ma kończyć się działającą aplikacją. Nie budujemy osobnego dużego
frameworka schedulera przed pierwszym ekranem korzystającym z occurrence.

## Scenariusz walidacji produktowej

Przez co najmniej 7 dni użytkownik realizuje trzy planowane sesje:

1. jedną jako Standard;
2. jedną jako Minimum po komunikacie o braku energii;
3. jedną przełożoną albo świadomie pominiętą z reason.

W trakcie testu należy zamknąć i ponownie uruchomić aplikację, odebrać minimum jedno
przypomnienie oraz sprawdzić, czy historia i Consistency odpowiadają rzeczywistym
decyzjom. Wynik testu powinien odpowiedzieć, czy aplikacja pomaga wrócić do
działania, a nie tylko czy poprawnie liczy serię.

## Poza zakresem M2

- prawdziwe API LLM, backend i przechowywanie kluczy;
- zdalne push notifications;
- konta, synchronizacja i analityka;
- rozbudowana biblioteka ćwiczeń;
- Bonus i questy;
- postacie Gabawersum;
- alternatywny użytkownik;
- social, rankingi i płatności;
- upgrade Expo SDK.

## Ryzyka i decyzje do sprawdzenia w implementacji

- zmiana strefy czasowej oraz zmiana czasu letni/zimowy;
- ograniczenia lokalnych powiadomień w Expo Go vs instalowany IPA;
- zachowanie zaplanowanego terminu po zmianie Protocolu;
- znaczenie `skipped` względem `missed` dla Consistency;
- bezpieczna migracja już istniejących danych użytkownika.

Jeśli M2 potwierdzi, że historia planów i decyzji jest wiarygodna, naturalnym
kandydatem na M3 będzie bezpieczny zdalny AI adapter, który otrzyma ograniczony
kontekst i będzie wyłącznie proponował te same walidowane actions.
