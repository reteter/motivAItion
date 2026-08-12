import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CompletionResult, SetFeedback } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import {
  Button,
  CoachBubble,
  Eyebrow,
  Page,
  ProgressBar,
  TopBar,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const feedbackOptions: Array<{
  value: SetFeedback;
  label: string;
  coach: string;
}> = [
  { value: 'easy', label: 'ZA ŁATWO', coach: 'Zapisane. Nie dokładam teraz — kolejny plan może być odrobinę mocniejszy.' },
  { value: 'ok', label: 'OK', coach: 'Dobrze dobrany próg. Następna seria.' },
  { value: 'hard', label: 'ZA TRUDNO', coach: 'Zapisane. Nie musisz udowadniać planowi, że jest ważniejszy od feedbacku.' },
];

export function WorkoutScreen({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (result: CompletionResult) => void;
}) {
  const { state, recordSet, finishWorkout } = useAppStore();
  const workout = state.todayWorkout;
  const [coachMessage, setCoachMessage] = useState(
    workout?.variant === 'minimum'
      ? 'Jedna runda. Zaczynamy i szybko zamykamy temat.'
      : 'Skup się tylko na tej serii. Reszta planu teraz nie istnieje.',
  );

  const position = useMemo(() => {
    if (!workout) return undefined;
    for (let exerciseIndex = 0; exerciseIndex < workout.exercises.length; exerciseIndex += 1) {
      const exercise = workout.exercises[exerciseIndex];
      if (!exercise) continue;
      const setIndex = exercise.sets.findIndex((set) => !set.completedAt);
      if (setIndex >= 0) return { exerciseIndex, setIndex, exercise };
    }
    return undefined;
  }, [workout]);

  if (!workout) return null;

  const allSets = workout.exercises.flatMap((exercise) => exercise.sets);
  const completedSets = allSets.filter((set) => set.completedAt).length;
  const progress = allSets.length === 0 ? 0 : completedSets / allSets.length;

  return (
    <Page>
      <TopBar
        title={workout.variant === 'minimum' ? 'WERSJA MINIMUM' : 'TRENING'}
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
      <ProgressBar value={progress} />
      <Text style={styles.progressLabel}>{completedSets} / {allSets.length} serii</Text>

      {position ? (
        <>
          <View style={styles.exerciseHero}>
            <Eyebrow>
              Seria {position.setIndex + 1} / {position.exercise.sets.length}
            </Eyebrow>
            <Text style={styles.exerciseName}>{position.exercise.name}</Text>
            <View style={styles.targetCircle}>
              <Text style={styles.targetNumber}>
                {position.exercise.sets[position.setIndex]?.target}
              </Text>
              <Text style={styles.targetUnit}>
                {position.exercise.unit === 'seconds' ? 'SEKUND' : 'POWTÓRZEŃ'}
              </Text>
            </View>
          </View>

          <CoachBubble>{coachMessage}</CoachBubble>
          <Text style={styles.feedbackPrompt}>Jak poszła ta seria?</Text>
          <View style={styles.feedbackButtons}>
            {feedbackOptions.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                variant={option.value === 'ok' ? 'primary' : 'secondary'}
                onPress={() => {
                  recordSet(position.exerciseIndex, position.setIndex, option.value);
                  setCoachMessage(option.coach);
                }}
              />
            ))}
          </View>
        </>
      ) : (
        <View style={styles.finished}>
          <Text style={styles.finishedMark}>✓</Text>
          <Text style={styles.finishedTitle}>Wszystkie serie wykonane.</Text>
          <CoachBubble>Wynik i feedback są gotowe do zapisania. Teraz dopiero aktualizuję przyszły plan.</CoachBubble>
          <Button
            label="Zapisz trening"
            onPress={() => {
              const result = finishWorkout();
              if (result) onComplete(result);
            }}
          />
        </View>
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
  progressLabel: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseHero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  exerciseName: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  targetCircle: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 95,
    backgroundColor: colors.surface,
    borderWidth: 8,
    borderColor: colors.progressSoft,
  },
  targetNumber: {
    color: colors.ink,
    fontSize: 76,
    lineHeight: 82,
    fontWeight: '900',
  },
  targetUnit: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  feedbackPrompt: {
    marginTop: spacing.xs,
    color: colors.inkMuted,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackButtons: {
    gap: spacing.sm,
  },
  finished: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  finishedMark: {
    alignSelf: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
    backgroundColor: colors.progress,
    color: colors.surface,
    textAlign: 'center',
    lineHeight: 88,
    fontSize: 48,
    fontWeight: '900',
  },
  finishedTitle: {
    color: colors.ink,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
});
