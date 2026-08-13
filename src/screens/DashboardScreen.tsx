import { useEffect, useMemo, useState } from 'react';
import {
  AppState as NativeAppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { currentProtocol, levelFromXp } from '../domain/protocol';
import {
  consistency,
  isOccurrenceOverdue,
  millisecondsUntilNextLocalDay,
  nextActionableOccurrence,
  occurrenceForToday,
} from '../domain/schedule';
import {
  CoachProposalRationaleCode,
  DecisionReason,
  ProtocolExercise,
} from '../domain/types';
import { useAppStore } from '../store/AppStore';
import {
  Body,
  Button,
  Card,
  CoachBubble,
  Eyebrow,
  Page,
  ProgressBar,
  Title,
  TopBar,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const reasons: Array<{ value: DecisionReason; label: string }> = [
  { value: 'low_energy', label: 'Mało energii' },
  { value: 'no_time', label: 'Brak czasu' },
  { value: 'pain_or_limitation', label: 'Ból lub ograniczenie' },
  { value: 'exercise_resistance', label: 'Opór przed ćwiczeniem' },
  { value: 'other', label: 'Inny powód' },
];

function targetLabel(exercise: ProtocolExercise) {
  return exercise.unit === 'seconds'
    ? `${exercise.sets} × ${exercise.target} s`
    : `${exercise.sets} × ${exercise.target}`;
}

function preferredTimeLabel(value: 'morning' | 'afternoon' | 'evening') {
  return { morning: 'rano', afternoon: 'w ciągu dnia', evening: 'wieczorem' }[value];
}

function consistencyLabel(completed: number, planned: number) {
  return planned === 0 ? '—' : `${Math.round((completed / planned) * 100)}%`;
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

type DecisionMode = 'skip' | 'reschedule';

function rationaleLabel(code: CoachProposalRationaleCode) {
  return {
    recovery_after_gap: 'spokojny powrót po przerwie',
    low_recent_consistency: 'niższa Consistency w ostatnich 7 dniach',
    time_pressure_pattern: 'powtarzający się brak czasu',
    pain_requires_caution: 'ostatni sygnał bólu lub ograniczenia',
    positive_momentum: 'plan nie wymaga teraz zmiany',
    insufficient_evidence: 'za mało danych do bezpiecznej zmiany',
  }[code];
}

export function DashboardScreen({
  onStart,
  onHistory,
  onSchedule,
  onCoach,
}: {
  onStart: () => void;
  onHistory: () => void;
  onSchedule: () => void;
  onCoach: () => void;
}) {
  const {
    state,
    persistenceMessage,
    prepareToday,
    chooseWorkout,
    rescheduleToday,
    skipToday,
    coachRequestStatus,
    coachRequestMessage,
    requestCoachProposal,
    applyCoachProposal,
    rejectCoachProposal,
  } = useAppStore();
  const [decisionMode, setDecisionMode] = useState<DecisionMode>();
  const [referenceNow, setReferenceNow] = useState(() => new Date());
  const [coachMessage, setCoachMessage] = useState(
    'Dziś nie szukamy idealnego momentu. Zaczynamy od pierwszej serii.',
  );

  useEffect(() => {
    prepareToday();
  }, [prepareToday]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleRollover = () => {
      timer = setTimeout(() => {
        setReferenceNow(new Date());
        prepareToday();
        scheduleRollover();
      }, millisecondsUntilNextLocalDay());
    };
    scheduleRollover();
    return () => clearTimeout(timer);
  }, [prepareToday]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setReferenceNow(new Date());
        prepareToday();
      }
    });
    return () => subscription.remove();
  }, [prepareToday]);

  const now = referenceNow;
  const protocol = currentProtocol(state);
  const occurrence = occurrenceForToday(state, now);
  const nextOccurrence = nextActionableOccurrence(state, now);
  const xp = levelFromXp(state.progress.totalXp);
  const consistency7 = useMemo(
    () => consistency(state.occurrences, 7, referenceNow),
    [referenceNow, state.occurrences],
  );
  const consistency30 = useMemo(
    () => consistency(state.occurrences, 30, referenceNow),
    [referenceNow, state.occurrences],
  );
  const canTrain =
    occurrence?.status === 'scheduled' || occurrence?.status === 'in_progress';
  const completedToday = occurrence?.status === 'completed';
  const decidedToday =
    occurrence?.status === 'skipped' || occurrence?.status === 'rescheduled';
  const recovery = canTrain && occurrence.recommendedVariant === 'minimum';
  const overdue = occurrence ? isOccurrenceOverdue(occurrence, now) : false;
  const pendingProposal = state.remoteCoach.proposals.find(
    (proposal) =>
      proposal.status === 'pending' &&
      new Date(proposal.expiresAt).getTime() > referenceNow.getTime(),
  );

  function begin(variant: 'standard' | 'minimum') {
    if (chooseWorkout(variant)) onStart();
  }

  return (
    <Page>
      <TopBar
        title="motivAItion"
        left={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edytuj harmonogram"
            hitSlop={10}
            onPress={onSchedule}
          >
            <Text style={styles.topLink}>Plan</Text>
          </Pressable>
        }
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otwórz historię"
            hitSlop={10}
            onPress={onHistory}
          >
            <Text style={styles.topLink}>Historia</Text>
          </Pressable>
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Eyebrow>Dzisiaj</Eyebrow>
          <Title>
            {completedToday
              ? 'Zrobione.'
              : decidedToday
                ? 'Decyzja zapisana.'
                : recovery
                  ? 'Spokojny powrót.'
                  : overdue
                    ? 'Możesz zacząć teraz.'
                    : canTrain
                      ? 'Mały próg. Realny ruch.'
                      : 'Dzień regeneracji.'}
          </Title>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNumber}>{xp.level}</Text>
          <Text style={styles.levelLabel}>POZIOM</Text>
        </View>
      </View>

      <Card>
        <View style={styles.consistencyHeader}>
          <Text style={styles.cardTitle}>Consistency</Text>
          <Text style={styles.xpValue}>{state.progress.totalXp} XP</Text>
        </View>
        <View style={styles.consistencyGrid}>
          <View style={styles.consistencyCell}>
            <Text style={styles.consistencyValue}>
              {consistencyLabel(consistency7.completed, consistency7.planned)}
            </Text>
            <Text style={styles.cardMeta}>
              7 dni · {consistency7.completed}/{consistency7.planned}
            </Text>
          </View>
          <View style={styles.consistencyCell}>
            <Text style={styles.consistencyValue}>
              {consistencyLabel(consistency30.completed, consistency30.planned)}
            </Text>
            <Text style={styles.cardMeta}>
              30 dni · {consistency30.completed}/{consistency30.planned}
            </Text>
          </View>
        </View>
        <ProgressBar value={xp.current / xp.required} />
        <Text style={styles.cardMeta}>
          Poziom {xp.level} · {xp.current}/{xp.required} XP do kolejnego
        </Text>
      </Card>

      {persistenceMessage ? (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningText}>{persistenceMessage}</Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.coachCardHeader}>
          <View style={styles.coachCardCopy}>
            <Text style={styles.cardTitle}>Aktywny AI coach</Text>
            <Text style={styles.cardMeta}>
              {state.remoteCoach.mode === 'enabled'
                ? state.remoteCoach.installationStatus === 'active'
                  ? 'Zdalne AI aktywne'
                  : 'Tryb lokalny · brak aktywnego tokenu'
                : 'Zdalne AI wyłączone'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ustawienia AI coacha"
            hitSlop={10}
            onPress={onCoach}
          >
            <Text style={styles.topLink}>Ustawienia</Text>
          </Pressable>
        </View>

        {pendingProposal ? (
          <>
            <View style={styles.proposalSource}>
              <Text style={styles.proposalSourceText}>
                {pendingProposal.source === 'remote' ? 'ZDALNY AI' : 'FALLBACK LOKALNY'}
              </Text>
            </View>
            <Text style={styles.proposalMessage}>{pendingProposal.message}</Text>
            <Text style={styles.cardMeta}>
              Dlaczego: {rationaleLabel(pendingProposal.rationaleCode)}.
            </Text>
            <Text style={styles.cardMeta}>
              Zmiana zostanie wykonana dopiero po Twojej akceptacji.
            </Text>
            <View style={styles.twoColumns}>
              <View style={styles.flexButton}>
                <Button
                  label="Zastosuj"
                  onPress={() => {
                    applyCoachProposal(pendingProposal.proposalId);
                    setCoachMessage('Propozycja zastosowana. Nadal możesz wybrać Standard.');
                  }}
                />
              </View>
              <View style={styles.flexButton}>
                <Button
                  label="Nie teraz"
                  variant="secondary"
                  onPress={() => rejectCoachProposal(pendingProposal.proposalId)}
                />
              </View>
            </View>
          </>
        ) : state.remoteCoach.mode === 'enabled' ? (
          <>
            <Text style={styles.cardMeta}>
              Poproś o jedną propozycję opartą na zagregowanej historii. Trening nie
              czeka na odpowiedź sieciową.
            </Text>
            <Button
              label={coachRequestStatus === 'loading' ? 'Analizuję…' : 'Zaproponuj następny krok'}
              variant="secondary"
              disabled={coachRequestStatus === 'loading'}
              onPress={() => void requestCoachProposal()}
            />
          </>
        ) : (
          <>
            <Text style={styles.cardMeta}>
              Możesz włączyć ograniczonego coacha i dokładnie zobaczyć, jakie kategorie
              danych są wysyłane.
            </Text>
            <Button label="Poznaj i włącz" variant="secondary" onPress={onCoach} />
          </>
        )}

        {coachRequestMessage ? (
          <Text
            style={coachRequestStatus === 'error' ? styles.warningText : styles.coachStatus}
            accessibilityRole={coachRequestStatus === 'error' ? 'alert' : undefined}
          >
            {coachRequestMessage}
          </Text>
        ) : null}
      </Card>

      {canTrain && protocol && occurrence ? (
        <>
          <Card>
            <View style={styles.workoutHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  {recovery ? 'Rekomendacja: Minimum' : 'Dzisiejsza sesja'}
                </Text>
                <Text style={styles.cardMeta}>
                  Protocol v{occurrence.protocolVersion} · {state.schedule?.localTime}
                  {overdue ? ' · termin minął' : ''}
                </Text>
              </View>
              <View style={styles.todayDot} />
            </View>
            <View style={styles.exerciseList}>
              {protocol.exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseTarget}>{targetLabel(exercise)}</Text>
                </View>
              ))}
            </View>
          </Card>

          <CoachBubble>
            {recovery
              ? 'Po przerwie proponuję Minimum. Bez nadrabiania i bez kary — Standard nadal jest dostępny.'
              : coachMessage}
          </CoachBubble>
          <Button
            label={occurrence.status === 'in_progress' ? 'Wróć do treningu' : 'Zacznij Standard'}
            onPress={() => begin(occurrence.chosenVariant ?? 'standard')}
          />
          {occurrence.status === 'scheduled' ? (
            <View style={styles.resistanceActions}>
              <Button
                label="Zrób Minimum"
                variant={recovery ? 'primary' : 'secondary'}
                onPress={() => begin('minimum')}
              />
              <View style={styles.twoColumns}>
                <View style={styles.flexButton}>
                  <Button
                    label="Przełóż"
                    variant="quiet"
                    onPress={() => setDecisionMode('reschedule')}
                  />
                </View>
                <View style={styles.flexButton}>
                  <Button
                    label="Pomiń"
                    variant="quiet"
                    onPress={() => setDecisionMode('skip')}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {decisionMode ? (
            <Card>
              <Text style={styles.cardTitle}>
                {decisionMode === 'skip' ? 'Dlaczego pomijasz?' : 'Dlaczego przekładasz?'}
              </Text>
              <Text style={styles.cardMeta}>Jedno tapnięcie zapisze decyzję.</Text>
              <View style={styles.reasonGrid}>
                {reasons.map((reason) => (
                  <Pressable
                    key={reason.value}
                    accessibilityRole="button"
                    onPress={() => {
                      if (decisionMode === 'skip') skipToday(reason.value);
                      else rescheduleToday(reason.value);
                      setCoachMessage(
                        decisionMode === 'skip'
                          ? 'Zapisane. Nie dokładam zaległości — wrócimy przy następnym terminie.'
                          : 'Zapisane. Przenoszę sesję i aktualizuję przypomnienie.',
                      );
                      setDecisionMode(undefined);
                    }}
                    style={({ pressed }) => [styles.reason, pressed && styles.pressed]}
                  >
                    <Text style={styles.reasonText}>{reason.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Button label="Anuluj" variant="quiet" onPress={() => setDecisionMode(undefined)} />
            </Card>
          ) : null}
        </>
      ) : null}

      {!canTrain && completedToday ? (
        <>
          <CoachBubble>
            Dzisiejszy trening jest zapisany. Nie dokładam drugiego tylko po to, żeby nabić licznik.
          </CoachBubble>
          <Button label="Zobacz historię" variant="secondary" onPress={onHistory} />
        </>
      ) : null}

      {!canTrain && !completedToday ? (
        <CoachBubble>
          {decidedToday
            ? 'Decyzja jest częścią historii. Nie tworzę backlogu — następny termin zaczyna się czysto.'
            : nextOccurrence
              ? `Dziś odpoczynek. Następna sesja: ${dateLabel(nextOccurrence.scheduledAt)}.`
              : 'Dziś odpoczynek. Kolejna sesja pojawi się zgodnie z harmonogramem.'}
        </CoachBubble>
      ) : null}

      {protocol ? (
        <Card>
          <Text style={styles.cardTitle}>Aktualny Protocol v{protocol.version}</Text>
          <Text style={styles.cardMeta}>
            {protocol.daysPerWeek}× w tygodniu · {preferredTimeLabel(protocol.preferredTime)}
          </Text>
          {protocol.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.protocolRow}>
              <Text style={styles.protocolName}>{exercise.name}</Text>
              <Text style={styles.protocolTarget}>{targetLabel(exercise)}</Text>
            </View>
          ))}
          <Body muted>{protocol.reason}</Body>
        </Card>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  topLink: { color: colors.accentDark, fontSize: 14, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.xs },
  levelBadge: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: colors.progress,
  },
  levelNumber: { color: colors.surface, fontSize: 28, lineHeight: 30, fontWeight: '900' },
  levelLabel: { color: colors.progressSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  consistencyHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  consistencyGrid: { flexDirection: 'row', gap: spacing.sm },
  consistencyCell: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.progressSoft,
  },
  consistencyValue: { color: colors.progress, fontSize: 26, fontWeight: '900' },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  cardMeta: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  xpValue: { color: colors.progress, fontSize: 14, fontWeight: '800' },
  warning: { padding: spacing.md, borderRadius: radius.sm, backgroundColor: '#F5E1CF' },
  warningText: { color: colors.warning, fontSize: 13, lineHeight: 19 },
  coachCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  coachCardCopy: { flex: 1 },
  proposalSource: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.progressSoft,
  },
  proposalSourceText: {
    color: colors.progress,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  proposalMessage: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '700' },
  coachStatus: { color: colors.progress, fontSize: 13, lineHeight: 19 },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  exerciseList: { marginTop: spacing.sm, borderTopWidth: 1, borderColor: colors.line },
  exerciseRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  exerciseName: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  exerciseTarget: { color: colors.inkMuted, fontSize: 16, fontWeight: '700' },
  resistanceActions: { gap: spacing.xs },
  twoColumns: { flexDirection: 'row', gap: spacing.xs },
  flexButton: { flex: 1 },
  reasonGrid: { gap: spacing.xs },
  reason: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  reasonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  protocolRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  protocolName: { color: colors.inkMuted, fontSize: 15 },
  protocolTarget: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
