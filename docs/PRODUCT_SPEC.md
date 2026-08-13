# PRODUCT_SPEC.md — AI Motivation & Training Coach

> **Stan realizacji — 2026-08-13:** Milestone 1 został dostarczony i zweryfikowany.
> Milestone 2 jest zaimplementowany, przeszedł niezależne review, lokalne gate'y
> i natywny build IPA; nadal wymaga urządzeniowej walidacji przypomnienia oraz
> tygodniowego użycia. Milestone 3 ma wdrożony backend, przypięty model
> `gpt-5.6-terra`/Low i zweryfikowane połączenie end-to-end na fizycznym iPhonie.
> Pełny eval modelu, failure modes oraz cykl apply/reject → outcome pozostają otwarte.
> Szczegóły są w [PROJECT_STATUS.md](PROJECT_STATUS.md) i
> [MILESTONE_2.md](MILESTONE_2.md), a następny proponowany slice w
> [MILESTONE_3.md](MILESTONE_3.md). Ta specyfikacja pozostaje dokumentem docelowym.

## 1. Cel projektu

Budujemy mobilną aplikację pomagającą użytkownikowi regularnie realizować cele, których wykonanie wymaga motywacji, konsekwencji i dopingu.

Pierwszym obsługiwanym obszarem jest **domowy trening fizyczny**.

Docelowo ten sam system powinien umożliwić obsługę innych typów celów, takich jak:

- gotowanie,
- sprzątanie,
- spacery i codzienny ruch,
- nauka,
- praca nad własnymi projektami,
- inne samodzielnie zdefiniowane cele.

Aplikacja nie ma być zwykłym trackerem nawyków ani chatbotem z listą zadań.

Jej najważniejszym elementem jest **aktywny coach AI**, którego zadaniem jest zwiększanie prawdopodobieństwa, że użytkownik rzeczywiście będzie wykonywał działania prowadzące do wybranego celu.

---

# 2. Główna filozofia produktu

Najważniejszym KPI aplikacji nie jest teoretyczna optymalność planu.

Najważniejsze jest:

> Jak duża jest szansa, że konkretny użytkownik rzeczywiście wykona zaplanowane działanie i będzie do niego wracał przez długi czas?

Plan powinien być traktowany jako hipoteza, którą aplikacja testuje i dostosowuje na podstawie rzeczywistego zachowania użytkownika.

Schemat:

```text
Goal
 ↓
Baseline
 ↓
Protocol
 ↓
Today's Action
 ↓
Execution
 ↓
Feedback
 ↓
History
 ↓
AI Analysis
 ↓
Protocol Adaptation
```

---

# 3. AI Coach

AI nie pełni roli dodatkowego chatu.

Coach jest aktywnym elementem systemu i działa w ramach ustalonego celu użytkownika.

Powinien:

- przeprowadzić początkowy wywiad;
- pomóc ustalić realny punkt startowy;
- stworzyć początkowy plan;
- prowadzić użytkownika przez kolejne działania;
- reagować na opór i brak motywacji;
- motywować przed i w trakcie działania;
- gratulować wykonania;
- analizować historię realizacji;
- rozpoznawać powtarzające się problemy;
- dostosowywać przyszły plan;
- proponować prostsze rozwiązania, jeśli dotychczasowy plan nie działa.

Coach ma dążyć do osiągnięcia celu użytkownika, a nie tylko odpowiadać na wiadomości.

---

# 4. Użytkownik nie jest zawsze początkujący

Aplikacja nie może zakładać, że brak bieżącej aktywności oznacza brak wcześniejszego doświadczenia.

Przykładowe poziomy:

```text
never_trained
beginner
returning_after_break
currently_active
advanced
```

Osoba wracająca po kilku latach przerwy może mieć bardzo słabą obecną kondycję, ale jednocześnie dobrze rozumieć ćwiczenia, technikę, serie, powtórzenia i sposób treningu.

Coach powinien uwzględniać oba aspekty.

---

# 5. Onboarding

Pierwsze uruchomienie powinno przypominać krótką rozmowę z coachem, a nie wielostronicowy formularz.

Dla treningu coach powinien ustalić między innymi:

- główny cel użytkownika;
- aktualną aktywność fizyczną;
- wcześniejsze doświadczenie treningowe;
- czas od ostatniej regularnej aktywności;
- ewentualne ograniczenia;
- dostępny sprzęt;
- realistyczny czas na trening;
- preferowaną liczbę treningów tygodniowo;
- preferowaną porę;
- ćwiczenia lub aktywności, których użytkownik nie lubi;
- poziom motywacji i oczekiwania wobec coacha.

Rozmowa powinna być krótka i naturalna.

Nie należy pytać o dane, których aplikacja nie potrzebuje do stworzenia pierwszego planu.

---

# 6. Baseline

Coach nie powinien arbitralnie zakładać możliwości użytkownika.

Jeśli jest to odpowiednie, powinien wykonać prosty test wejściowy.

Przykład:

> Zrób tyle poprawnych pompek, ile komfortowo jesteś w stanie zrobić w jednej serii.

Podobne testy mogą dotyczyć:

- pompek;
- przysiadów;
- planku;
- prostych ćwiczeń bez sprzętu.

Baseline może również powstawać stopniowo podczas pierwszych kilku sesji.

Pierwszy plan powinien być zachowawczy.

Lepiej rozpocząć od zbyt łatwego zadania i zwiększać jego trudność niż ustawić próg, który spowoduje natychmiastowe porzucenie aplikacji.

---

# 7. Goal i Protocol

Należy rozdzielić dwa pojęcia.

## Goal

Długoterminowy rezultat użytkownika.

Przykład:

```text
Poprawić kondycję i wrócić do regularnej aktywności.
```

Goal zmienia się rzadko.

## Protocol

Aktualna strategia realizacji Goal.

Przykład:

```text
Protocol v3

4 treningi tygodniowo

Pompki:
3 × 5

Przysiady:
3 × 10

Plank:
3 × 20 sekund
```

Protocol może być zmieniany wielokrotnie.

Historia poprzednich wersji powinna zostać zachowana.

---

# 8. Plan jako hipoteza

Coach powinien móc analizować skuteczność danego Protocol.

Przykład:

```text
Protocol v2

Treningi:
poniedziałek, wtorek, czwartek, sobota
18:00

Realizacja:
2 / 4
```

Jeżeli w kolejnych tygodniach okaże się, że użytkownik częściej ćwiczy rano, coach może zaproponować zmianę pory.

Przykład późniejszej analizy:

```text
Trening rano:
8 / 9 wykonanych

Trening wieczorem:
2 / 7 wykonanych
```

Wniosek:

> Trening rano działa u tego użytkownika znacznie lepiej.

Aplikacja powinna uczyć się takich zależności.

---

# 9. Behavioral Memory

Coach powinien z czasem tworzyć uproszczony model zachowania konkretnego użytkownika.

Przykładowe obserwacje:

```text
Długie treningi są częściej odkładane.

Trening rano ma wyższą realizację.

Po kilku dniach przerwy użytkownik potrzebuje łatwiejszego powrotu.

Krótki cel typu "zrób tylko jedną serię" często prowadzi do wykonania pełnego treningu.

Widoczny pasek bliski ukończenia zwiększa motywację.
```

Behavioral Memory nie może być traktowane jako niepodważalna prawda.

Są to hipotezy wynikające z historii użytkownika.

---

# 10. Reakcja na opór użytkownika

Wiadomości takie jak:

```text
Nie chce mi się.

Jestem zmęczony.

Nie mam dzisiaj czasu.

Nie będę robił przysiadów.

Mam tylko pięć minut.
```

są wartościową informacją.

Coach nie powinien odpowiadać wyłącznie generyczną motywacją.

Powinien podejmować praktyczne działania.

Przykład:

> OK. Pełnego treningu dziś nie robimy. Zrób dwie krótkie serie i zamykamy temat.

System może zapisać przyczynę:

```text
energy: low
friction: duration
resistance: high
```

Dane te mogą później służyć do adaptacji planu.

---

# 11. Minimum / Standard / Bonus

Każde działanie może opcjonalnie posiadać trzy poziomy wykonania.

Przykład:

```text
MINIMUM

3 pompki
5 przysiadów
```

```text
STANDARD

pełny zaplanowany trening
```

```text
BONUS

pełny trening + dodatkowa aktywność
```

Celem wersji Minimum jest zapobieganie sytuacji:

```text
100% planu albo 0%.
```

W słabszym dniu wykonanie małej części planu może być lepsze dla długoterminowej regularności niż całkowite pominięcie aktywności.

---

# 12. Ekran treningu

Telefon będzie często leżał obok użytkownika podczas ćwiczeń.

Interfejs powinien być bardzo prosty.

Priorytety:

- duże przyciski;
- czytelne liczby;
- minimum tekstu;
- łatwa obsługa jedną ręką;
- niewielka liczba decyzji;
- brak konieczności wpisywania danych po każdej serii.

Przykład:

```text
POMPKI

Seria 2 / 3

Cel: 5

       [ 5 ✓ ]

[ ZA ŁATWO ]
[ OK ]
[ ZA TRUDNO ]

-------------------------

Coach:
"Jeszcze jedna seria i pompki zamknięte."
```

---

# 13. Feedback

Po wykonaniu serii podstawowy feedback powinien być możliwy jednym tapnięciem:

```text
ZA ŁATWO
OK
ZA TRUDNO
```

Jeżeli potrzebne są dodatkowe informacje, coach może później zapytać o szczegóły.

Nie należy zmuszać użytkownika do regularnego wpisywania długich opisów.

---

# 14. Ukończenie treningu

Po zakończeniu treningu użytkownik powinien otrzymać krótkie podsumowanie.

Przykład:

```text
TRENING UKOŃCZONY

Pompki:
3 × 5

Przysiady:
3 × 10

Plank:
3 × 20 s
```

Coach powinien skomentować wynik w odniesieniu do rzeczywistej historii użytkownika.

Przykład:

> Wszystkie serie wykonane. W poprzedniej sesji ostatnia seria pompek była oznaczona jako „za trudno”, a dziś wszystkie były OK. To jest progres.

---

# 15. Źródło prawdy

LLM nigdy nie jest źródłem prawdy dla stanu aplikacji.

Źródłem prawdy jest aplikacja i jej dane.

Przykładowe dane:

```text
Goal
Protocol
Workout
Exercise
Set
Completion
Feedback
History
XP
```

Model otrzymuje tylko potrzebny kontekst.

Przykład:

```text
currentGoal
currentProtocol
todayWorkout
recentHistory
behavioralMemory
userMessage
```

Model nie powinien samodzielnie „pamiętać”, ile serii wykonano.

---

# 16. AI Actions

AI powinno działać przez ograniczony zestaw kontrolowanych operacji.

Przykłady:

```text
modify_today_workout
reduce_exercise_volume
replace_exercise
suggest_rest_day
modify_future_protocol
add_behavioral_observation
```

Model może zaproponować akcję.

Aplikacja sprawdza, czy jest ona prawidłowa i dozwolona.

Przykład:

```json
{
  "action": "reduce_today_workout",
  "reason": "user_reports_low_energy",
  "changes": {
    "pushups": "2x3",
    "squats": "2x5"
  }
}
```

LLM nie powinien dowolnie modyfikować stanu aplikacji poza zdefiniowanymi operacjami.

---

# 17. Uprawnienia coacha

Coach powinien mieć ograniczoną autonomię.

Może przykładowo:

- zmniejszyć dzisiejszą liczbę serii;
- zwiększyć lub zmniejszyć liczbę powtórzeń w określonym zakresie;
- zmienić kolejność ćwiczeń;
- zaproponować łatwiejszą wersję ćwiczenia;
- zaproponować dzień regeneracyjny.

Nie powinien samodzielnie:

- zmieniać głównego Goal;
- usuwać historii;
- oznaczać niewykonanych treningów jako wykonane;
- manipulować wynikami;
- wykonywać działań poza zakresem uzgodnionym z użytkownikiem.

---

# 18. Gamifikacja

Gamifikacja jest ważnym elementem aplikacji.

Pierwsza wersja powinna mieć prosty system:

- XP;
- poziom;
- pasek progresu;
- nagrody za wykonanie.

XP nie powinno być przyznawane wyłącznie za perfekcyjne wykonanie planu.

Może być przyznawane również za:

- wykonanie wersji Minimum;
- powrót po przerwie;
- regularność;
- wykonanie treningu mimo wcześniejszego oporu;
- poprawę wyniku;
- ukończenie celu tygodniowego.

Gamifikacja powinna wzmacniać powrót do działania, a nie karać za pojedyncze potknięcie.

---

# 19. Consistency zamiast brutalnego streaka

Klasyczny streak nie powinien być głównym wskaźnikiem.

Nie chcemy sytuacji:

```text
87 dni aktywności

jeden pominięty dzień

0
```

Preferowane wskaźniki:

```text
Consistency — 7 dni: 86%

Consistency — 30 dni: 77%
```

Streak może istnieć jako dodatkowa informacja.

---

# 20. Postacie i Gabawersum

Docelowo gamifikacja może być rozwijana poprzez postacie z Gabawersum.

Przykład:

```text
PANDO
Level 7

73 / 100 XP
```

Postacie mogą:

- zdobywać poziomy;
- komentować aktywność użytkownika;
- reagować na sukcesy i porażki;
- odblokowywać się;
- mieć rarity;
- tworzyć drużynę;
- posiadać własne relacje i historię.

Pierwszym naturalnym kandydatem jest Pando.

Ta warstwa nie jest wymagana do pierwszego MVP, ale architektura nie powinna uniemożliwiać jej późniejszego dodania.

---

# 21. Alternatywny użytkownik

Jednym z przyszłych eksperymentów motywacyjnych jest mechanika alternatywnego użytkownika.

Jeśli prawdziwy użytkownik regularnie pomija zadania, jego fikcyjny odpowiednik może zdobywać część progresu w alternatywnej rzeczywistości.

Przykład:

```text
TY

Pando
84 XP
```

```text
ALTERNATYWNY TY

Pando
91 XP
```

Mechanika ma wywoływać lekką rywalizację:

> Alternatywny Ty właśnie wykonał trening i wyprzedził Cię o 7 XP.

Nie implementować w pierwszym MVP.

---

# 22. Pierwszy MVP — Milestone 1

**Status:** dostarczony. Aplikacja realizuje pełną pętlę pojedynczej sesji. W zakresie
M1 coach był lokalnym, deterministycznym adapterem; M3 dodaje ograniczone połączenie
z modelem bez oddawania mu źródła prawdy.
Dokładne różnice między specyfikacją a implementacją opisuje
[PROJECT_STATUS.md](PROJECT_STATUS.md).

Pierwszy działający pionowy slice powinien dotyczyć wyłącznie treningu.

Zakres:

## 22.1 Onboarding

Użytkownik przechodzi krótki wywiad.

## 22.2 Baseline

Aplikacja zbiera podstawowe informacje o możliwościach użytkownika.

## 22.3 Pierwszy Protocol

Na podstawie baseline powstaje prosty plan.

## 22.4 Dashboard

Ekran pokazuje dzisiejszy trening.

## 22.5 Workout

Użytkownik przechodzi kolejne ćwiczenia i serie.

## 22.6 Feedback

Po ćwiczeniu może zaznaczyć:

```text
ZA ŁATWO
OK
ZA TRUDNO
```

## 22.7 Completion

Trening zostaje zapisany jako wykonany.

## 22.8 History

Można zobaczyć kilka ostatnich treningów.

## 22.9 Progress

Aplikacja pokazuje prosty XP i poziom.

---

# 23. Czego NIE implementować w pierwszym MVP

Nie dodawać bez potrzeby:

- systemu wielu różnych celów;
- gotowania;
- sprzątania;
- rozbudowanych questów;
- wielu coachów;
- marketplace;
- social features;
- rankingów między użytkownikami;
- rozbudowanego systemu postaci;
- alternatywnego użytkownika;
- skomplikowanej analityki;
- synchronizacji pomiędzy urządzeniami;
- płatności;
- App Store;
- TestFlight.

Najpierw należy zweryfikować podstawową pętlę treningową.

---

# 24. Architektura produktu

Podstawowe domeny powinny pozostać niezależne od UI.

Przykład:

```text
Goal
Protocol
Workout
Exercise
WorkoutSet
Feedback
History
BehavioralObservation
Progress
Reward
CoachAction
```

Nie umieszczać logiki biznesowej bezpośrednio w komponentach React Native.

UI powinien jedynie prezentować stan i uruchamiać działania domenowe.

---

# 25. Persistence

Stan użytkownika musi przetrwać zamknięcie i ponowne uruchomienie aplikacji.

Na pierwszym etapie można używać lokalnego persistence.

Nie dodawać backendu tylko dlatego, że w przyszłości może się przydać.

Backend należy dodać wtedy, gdy konkretna funkcja rzeczywiście będzie go wymagała.

---

# 26. Integracja AI

Pierwsze wersje interfejsu i domeny powinny być możliwe do rozwijania również bez aktywnego połączenia z modelem AI.

Należy oddzielić:

```text
UI
Domain
Persistence
AI Adapter
```

Dzięki temu można testować trening bez ponoszenia kosztów API i bez zależności od dostępności modelu.

Po dodaniu prawdziwego coacha AI aplikacja powinna przekazywać modelowi tylko potrzebny kontekst.

---

# 27. Bezpieczeństwo danych i API

Klucze do API modeli AI nigdy nie powinny być przechowywane bezpośrednio w publicznie dystrybuowanym kliencie mobilnym.

Jeżeli projekt będzie wymagał bezpiecznego dostępu do płatnego API, należy wprowadzić odpowiednią warstwę serwerową.

Nie dodawać jej do MVP, jeśli AI nie jest jeszcze aktywnie używane.

---

# 28. UI/UX

Aplikacja powinna być:

- mobile-first;
- szybka;
- prosta;
- czytelna;
- pozbawiona zbędnych ekranów;
- wygodna podczas treningu;
- możliwa do obsługi przy minimalnej liczbie tapnięć.

Preferować:

```text
jedna decyzja → jeden ekran
```

zamiast dużych ekranów pełnych opcji.

---

# 29. Ton coacha

Coach nie powinien brzmieć jak generyczna aplikacja fitness.

Unikać przesadnego:

> Dasz radę! 💪🔥 Jesteś niesamowity!

Preferować naturalną, konkretną komunikację.

Przykład:

> Nie chce Ci się. Rozumiem. Nie będziemy teraz negocjować całego treningu. Zrób jedną serię i wtedy zdecydujemy, co dalej.

W przyszłości użytkownik może wybierać charakter coacha, np.:

```text
spokojny
konkretny
trener
sierżant
```

Nie jest to wymagane w pierwszym MVP.

---

# 30. Podstawowa zasada rozwoju

Każdy milestone powinien być możliwie małym, działającym pionowym slice'em.

Nie projektować dużej części aplikacji „na przyszłość”, jeśli nie jest potrzebna do bieżącej funkcji.

Preferowany proces:

```text
mała funkcja
 ↓
działa lokalnie
 ↓
test na prawdziwym iPhonie
 ↓
użytkowanie
 ↓
obserwacja
 ↓
kolejna decyzja produktowa
```

Rzeczywiste korzystanie z aplikacji jest częścią procesu projektowania.

---

# 31. Pierwsza hipoteza produktowa

Pierwszy MVP powinien odpowiedzieć na jedno pytanie:

> Czy aplikacja z adaptacyjnym planem, bardzo niskim progiem rozpoczęcia, feedbackiem i aktywnym coachem zwiększa prawdopodobieństwo regularnego wykonywania treningów?

Jeżeli odpowiedź będzie pozytywna, system można rozszerzać na kolejne rodzaje celów.

Milestone 1 pozwolił sprawdzić użyteczność pojedynczego treningu. Milestone 2
dodaje jawnie zaplanowane, wykonane, przełożone i pominięte sesje, Consistency
7/30 oraz spokojny recovery. Milestone 3 przekazuje ich zminimalizowane agregaty
do ograniczonego modelu AI i został połączony end-to-end na iPhonie. Jego kontrakt
i pozostałe kryteria dogfood opisuje [MILESTONE_3.md](MILESTONE_3.md).

---

# 32. Docelowa wizja

Długoterminowo aplikacja może stać się osobistym systemem realizacji celów:

```text
Goal
 ↓
AI Coach
 ↓
Daily Actions
 ↓
Feedback
 ↓
Behavioral Learning
 ↓
Adaptation
 ↓
Progress
```

Trening jest pierwszym przypadkiem użycia, a nie granicą produktu.

Najważniejszą wartością aplikacji ma być to, że z czasem coraz lepiej rozumie:

> Co sprawia, że ten konkretny użytkownik rzeczywiście zaczyna i kończy zadania?
