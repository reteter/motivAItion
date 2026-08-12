import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../store/AppStore';
import { Card, Eyebrow, Page, Title, TopBar } from '../ui/components';
import { colors, spacing } from '../ui/theme';

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const { state } = useAppStore();

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
      <Title>Ostatnie treningi.</Title>

      {state.history.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>Jeszcze pusto.</Text>
          <Text style={styles.emptyText}>Pierwszy ukończony trening pojawi się tutaj razem z feedbackiem.</Text>
        </Card>
      ) : (
        state.history.map((workout) => {
          const feedback = workout.exercises.flatMap((exercise) =>
            exercise.sets.map((set) => set.feedback),
          );
          const hard = feedback.filter((value) => value === 'hard').length;
          const easy = feedback.filter((value) => value === 'easy').length;
          return (
            <Card key={workout.id}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.date}>
                    {new Date(workout.completedAt ?? workout.plannedAt).toLocaleDateString('pl-PL', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                  <Text style={styles.meta}>
                    {workout.variant === 'minimum' ? 'minimum' : 'standard'} · Protocol v{workout.protocolVersion}
                  </Text>
                </View>
                <Text style={styles.xp}>+{workout.earnedXp ?? 0} XP</Text>
              </View>
              {workout.exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseValue}>
                    {exercise.sets.length} × {exercise.sets[0]?.target ?? 0}
                    {exercise.unit === 'seconds' ? ' s' : ''}
                  </Text>
                </View>
              ))}
              <Text style={styles.feedback}>
                Feedback: {easy} łatwo · {feedback.length - easy - hard} OK · {hard} trudno
              </Text>
            </Card>
          );
        })
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  back: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  xp: {
    color: colors.progress,
    fontSize: 15,
    fontWeight: '900',
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  exerciseName: {
    color: colors.inkMuted,
    fontSize: 14,
  },
  exerciseValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  feedback: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
    color: colors.inkMuted,
    fontSize: 12,
  },
});
