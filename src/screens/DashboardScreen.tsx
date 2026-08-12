import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { currentProtocol, levelFromXp } from '../domain/protocol';
import { ProtocolExercise } from '../domain/types';
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

function targetLabel(exercise: ProtocolExercise) {
  return exercise.unit === 'seconds'
    ? `${exercise.sets} × ${exercise.target} s`
    : `${exercise.sets} × ${exercise.target}`;
}

function preferredTimeLabel(value: 'morning' | 'afternoon' | 'evening') {
  return { morning: 'rano', afternoon: 'w ciągu dnia', evening: 'wieczorem' }[value];
}

export function DashboardScreen({
  onStart,
  onHistory,
}: {
  onStart: () => void;
  onHistory: () => void;
}) {
  const {
    state,
    persistenceMessage,
    prepareToday,
    reduceToday,
    startWorkout,
  } = useAppStore();
  const [coachMessage, setCoachMessage] = useState(
    'Dziś nie szukamy idealnego momentu. Zaczynamy od pierwszej serii.',
  );

  useEffect(() => {
    prepareToday();
  }, [prepareToday]);

  const protocol = currentProtocol(state);
  const workout = state.todayWorkout;
  const xp = levelFromXp(state.progress.totalXp);
  const completedToday = state.history.some(
    (entry) =>
      entry.completedAt &&
      new Date(entry.completedAt).toDateString() === new Date().toDateString(),
  );

  return (
    <Page>
      <TopBar
        title="motivAItion"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otwórz historię"
            hitSlop={10}
            onPress={onHistory}
          >
            <Text style={styles.historyLink}>Historia</Text>
          </Pressable>
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Eyebrow>Dzisiaj</Eyebrow>
          <Title>{completedToday ? 'Zrobione.' : 'Mały próg. Realny ruch.'}</Title>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNumber}>{xp.level}</Text>
          <Text style={styles.levelLabel}>POZIOM</Text>
        </View>
      </View>

      <Card>
        <View style={styles.xpHeader}>
          <Text style={styles.cardTitle}>Twój progres</Text>
          <Text style={styles.xpValue}>{xp.current} / {xp.required} XP</Text>
        </View>
        <ProgressBar value={xp.current / xp.required} />
        <Text style={styles.cardMeta}>
          {state.progress.completedWorkouts} ukończonych treningów
        </Text>
      </Card>

      {persistenceMessage ? (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningText}>{persistenceMessage}</Text>
        </View>
      ) : null}

      {workout && protocol ? (
        <>
          <Card>
            <View style={styles.workoutHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  {workout.variant === 'minimum' ? 'Wersja minimum' : 'Dzisiejszy trening'}
                </Text>
                <Text style={styles.cardMeta}>
                  Protocol v{workout.protocolVersion} · około {workout.variant === 'minimum' ? 4 : 10} min
                </Text>
              </View>
              <View style={styles.todayDot} />
            </View>

            <View style={styles.exerciseList}>
              {workout.exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseTarget}>
                    {exercise.sets.length} × {exercise.sets[0]?.target ?? 0}
                    {exercise.unit === 'seconds' ? ' s' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <CoachBubble>{coachMessage}</CoachBubble>
          <Button
            label={workout.status === 'in_progress' ? 'Wróć do treningu' : 'Zacznij trening'}
            onPress={() => {
              startWorkout();
              onStart();
            }}
          />

          {workout.variant === 'standard' ? (
            <View style={styles.resistanceActions}>
              <Button
                label="Mam tylko 5 minut"
                variant="secondary"
                onPress={() => {
                  reduceToday('limited_time');
                  setCoachMessage('OK. Skracam dzisiejszy plan do jednej małej rundy.');
                }}
              />
              <Button
                label="Nie mam dziś energii"
                variant="quiet"
                onPress={() => {
                  reduceToday('low_energy');
                  setCoachMessage('Nie robimy pełnego treningu. Jedna krótka runda i zamykamy temat.');
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}

      {!workout && completedToday ? (
        <>
          <CoachBubble>Dzisiejszy trening jest zapisany. Nie dokładam drugiego tylko po to, żeby nabić licznik.</CoachBubble>
          <Button label="Zobacz historię" variant="secondary" onPress={onHistory} />
        </>
      ) : null}

      {!workout && !completedToday ? (
        <CoachBubble>
          Dziś nie ma zaplanowanego treningu. Regeneracja jest częścią Protocolu — wróć jutro.
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
  historyLink: {
    color: colors.accentDark,
    fontSize: 14,
    fontWeight: '800',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  levelBadge: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: colors.progress,
  },
  levelNumber: {
    color: colors.surface,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '900',
  },
  levelLabel: {
    color: colors.progressSoft,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  cardMeta: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  xpValue: {
    color: colors.progress,
    fontSize: 14,
    fontWeight: '800',
  },
  warning: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#F5E1CF',
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  exerciseList: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  exerciseRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  exerciseName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseTarget: {
    color: colors.inkMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  resistanceActions: {
    gap: spacing.xs,
  },
  protocolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  protocolName: {
    color: colors.inkMuted,
    fontSize: 15,
  },
  protocolTarget: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
});
