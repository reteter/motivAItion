import { StyleSheet, Text, View } from 'react-native';

import { levelFromXp } from '../domain/protocol';
import { CompletionResult } from '../domain/types';
import {
  Button,
  Card,
  CoachBubble,
  Eyebrow,
  Page,
  ProgressBar,
  Title,
} from '../ui/components';
import { colors, spacing } from '../ui/theme';

export function CompletionScreen({
  result,
  onDone,
}: {
  result: CompletionResult;
  onDone: () => void;
}) {
  const workout = result.state.history[0];
  const xp = levelFromXp(result.state.progress.totalXp);

  if (!workout) return null;

  const protocolChanged = result.appliedActions.some(
    (action) => action.type === 'modify_future_protocol',
  );

  return (
    <Page>
      <Eyebrow>Trening ukończony</Eyebrow>
      <Title>+{workout.earnedXp ?? 0} XP. Wykonane.</Title>
      <CoachBubble>{result.coachMessage}</CoachBubble>

      <Card>
        <View style={styles.summaryHeader}>
          <Text style={styles.cardTitle}>
            {workout.variant === 'minimum' ? 'Wersja minimum' : 'Pełny trening'}
          </Text>
          <Text style={styles.protocol}>Protocol v{workout.protocolVersion}</Text>
        </View>
        {workout.exercises.map((exercise) => (
          <View key={exercise.id} style={styles.row}>
            <View>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <Text style={styles.feedbackLine}>
                {exercise.sets.map((set) =>
                  set.feedback === 'easy' ? 'łatwo' : set.feedback === 'hard' ? 'trudno' : 'OK',
                ).join(' · ')}
              </Text>
            </View>
            <Text style={styles.exerciseValue}>
              {exercise.sets.length} × {exercise.sets[0]?.target ?? 0}
              {exercise.unit === 'seconds' ? ' s' : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.summaryHeader}>
          <Text style={styles.cardTitle}>Poziom {xp.level}</Text>
          <Text style={styles.xp}>{xp.current} / {xp.required} XP</Text>
        </View>
        <ProgressBar value={xp.current / xp.required} />
      </Card>

      {protocolChanged ? (
        <View style={styles.adaptation}>
          <Text style={styles.adaptationTitle}>Plan dostosowany</Text>
          <Text style={styles.adaptationText}>
            Feedback zmienił tylko przyszły Protocol. Historia wykonanego treningu pozostała bez zmian.
          </Text>
        </View>
      ) : null}

      <Button label="Wróć do planu" onPress={onDone} />
    </Page>
  );
}

const styles = StyleSheet.create({
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  protocol: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  exerciseName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackLine: {
    marginTop: 2,
    color: colors.inkMuted,
    fontSize: 12,
  },
  exerciseValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  xp: {
    color: colors.progress,
    fontSize: 14,
    fontWeight: '800',
  },
  adaptation: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 4,
    borderColor: colors.progress,
  },
  adaptationTitle: {
    color: colors.progress,
    fontSize: 14,
    fontWeight: '800',
  },
  adaptationText: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
