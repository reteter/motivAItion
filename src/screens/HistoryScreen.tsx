import { Pressable, StyleSheet, Text, View } from 'react-native';

import { consistency, toLocalDate } from '../domain/schedule';
import { WorkoutOccurrenceStatus } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import { Card, Eyebrow, Page, ProgressBar, Title, TopBar } from '../ui/components';
import { colors, spacing } from '../ui/theme';

const statusLabels: Record<WorkoutOccurrenceStatus, string> = {
  scheduled: 'zaplanowany',
  in_progress: 'w trakcie',
  completed: 'wykonany',
  skipped: 'pominięty',
  missed: 'niewykonany',
  rescheduled: 'przełożony',
};

const reasonLabels = {
  low_energy: 'mało energii',
  no_time: 'brak czasu',
  pain_or_limitation: 'ból lub ograniczenie',
  exercise_resistance: 'opór przed ćwiczeniem',
  other: 'inny powód',
};

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const { state } = useAppStore();
  const score7 = consistency(state.occurrences, 7);
  const score30 = consistency(state.occurrences, 30);
  const occurrences = [...state.occurrences]
    .filter((occurrence) => occurrence.localDate <= toLocalDate(new Date()))
    .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));

  return (
    <Page>
      <TopBar
        title="HISTORIA"
        left={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wróć do planu"
            hitSlop={12}
            onPress={onBack}
          >
            <Text style={styles.back}>‹ Wróć</Text>
          </Pressable>
        }
      />
      <Eyebrow>Obiektywny zapis</Eyebrow>
      <Title>Powroty, nie seria.</Title>

      <View style={styles.scores}>
        {[
          { label: '7 dni', score: score7 },
          { label: '30 dni', score: score30 },
        ].map(({ label, score }) => (
          <Card key={label}>
            <Text style={styles.scoreValue}>
              {score.planned === 0 ? '—' : `${Math.round(score.ratio * 100)}%`}
            </Text>
            <Text style={styles.meta}>
              {label} · {score.completed}/{score.planned}
            </Text>
            <ProgressBar value={score.ratio} />
          </Card>
        ))}
      </View>

      {occurrences.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>Jeszcze pusto.</Text>
          <Text style={styles.emptyText}>
            Pierwsza zaplanowana sesja pojawi się tutaj razem z decyzją i feedbackiem.
          </Text>
        </Card>
      ) : (
        occurrences.map((occurrence) => {
          const workout = state.history.find(
            (candidate) => candidate.occurrenceId === occurrence.id,
          );
          const feedback = workout?.exercises.flatMap((exercise) =>
            exercise.sets.map((set) => set.feedback),
          ) ?? [];
          const hard = feedback.filter((value) => value === 'hard').length;
          const easy = feedback.filter((value) => value === 'easy').length;
          return (
            <Card key={occurrence.id}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.date}>
                    {new Date(occurrence.scheduledAt).toLocaleDateString('pl-PL', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                  <Text style={styles.meta}>
                    {statusLabels[occurrence.status]} · Protocol v{occurrence.protocolVersion}
                  </Text>
                </View>
                {workout ? <Text style={styles.xp}>+{workout.earnedXp ?? 0} XP</Text> : null}
              </View>

              {workout?.exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseValue}>
                    {exercise.sets.length} × {exercise.sets[0]?.target ?? 0}
                    {exercise.unit === 'seconds' ? ' s' : ''}
                  </Text>
                </View>
              ))}
              {workout ? (
                <Text style={styles.feedback}>
                  {workout.variant === 'minimum' ? 'Minimum' : 'Standard'} · Feedback: {easy}{' '}
                  łatwo · {feedback.length - easy - hard} OK · {hard} trudno
                </Text>
              ) : null}
              {occurrence.decisionReason ? (
                <Text style={styles.decision}>
                  Powód: {reasonLabels[occurrence.decisionReason]}
                  {occurrence.sourceOccurrenceId ? ' · termin docelowy' : ''}
                </Text>
              ) : null}
            </Card>
          );
        })
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accentDark, fontSize: 14, fontWeight: '800' },
  scores: { gap: spacing.sm },
  scoreValue: { color: colors.progress, fontSize: 30, fontWeight: '900' },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  emptyText: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  xp: { color: colors.progress, fontSize: 15, fontWeight: '900' },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xs },
  exerciseName: { color: colors.inkMuted, fontSize: 14 },
  exerciseValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  feedback: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
    color: colors.inkMuted,
    fontSize: 12,
  },
  decision: { color: colors.warning, fontSize: 12, fontWeight: '700' },
});
