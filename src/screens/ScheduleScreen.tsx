import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  defaultLocalTime,
  defaultWeekdays,
} from '../domain/schedule';
import { Weekday } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import {
  Body,
  Button,
  Card,
  CoachBubble,
  Eyebrow,
  Page,
  Title,
  TopBar,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const days: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: 'Pn' },
  { value: 2, label: 'Wt' },
  { value: 3, label: 'Śr' },
  { value: 4, label: 'Cz' },
  { value: 5, label: 'Pt' },
  { value: 6, label: 'So' },
  { value: 7, label: 'Nd' },
];

const times = [
  { value: '07:30', label: 'Rano', detail: '07:30' },
  { value: '13:00', label: 'W dzień', detail: '13:00' },
  { value: '18:30', label: 'Wieczór', detail: '18:30' },
];

export function ScheduleScreen({ onDone }: { onDone?: () => void }) {
  const { state, saveSchedule } = useAppStore();
  const profile = state.profile;
  const expectedDays = profile?.daysPerWeek ?? 3;
  const initialDays = useMemo(
    () => state.schedule?.weekdays ?? defaultWeekdays(expectedDays),
    [expectedDays, state.schedule?.weekdays],
  );
  const [selectedDays, setSelectedDays] = useState<Weekday[]>(initialDays);
  const [localTime, setLocalTime] = useState(
    state.schedule?.localTime ??
      defaultLocalTime(profile?.preferredTime ?? 'morning'),
  );
  const [enableReminder, setEnableReminder] = useState(
    state.schedule ? state.reminders.enabled : true,
  );
  const [saving, setSaving] = useState(false);
  const isValid = selectedDays.length === expectedDays;

  function toggleDay(day: Weekday) {
    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((candidate) => candidate !== day);
      if (current.length >= expectedDays) return current;
      return [...current, day].sort((left, right) => left - right);
    });
  }

  return (
    <Page>
      {onDone ? (
        <TopBar
          title="HARMONOGRAM"
          left={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wróć do planu"
              hitSlop={12}
              onPress={onDone}
            >
              <Text style={styles.back}>‹ Wróć</Text>
            </Pressable>
          }
        />
      ) : null}
      <Eyebrow>Twój rytm tygodnia</Eyebrow>
      <Title>Kiedy realnie wrócisz?</Title>
      <CoachBubble>
        Konkretny termin pomaga bardziej niż ambitna obietnica. Wybierz {expectedDays}{' '}
        dni, które mają szansę wydarzyć się naprawdę.
      </CoachBubble>

      <Card>
        <Text style={styles.cardTitle}>Dni treningowe</Text>
        <Text style={styles.meta}>
          Wybrano {selectedDays.length} / {expectedDays}
        </Text>
        <View style={styles.days} accessibilityRole="radiogroup">
          {days.map((day) => {
            const selected = selectedDays.includes(day.value);
            return (
              <Pressable
                key={day.value}
                accessibilityRole="checkbox"
                accessibilityLabel={day.label}
                accessibilityState={{ checked: selected }}
                onPress={() => toggleDay(day.value)}
                style={({ pressed }) => [
                  styles.day,
                  selected && styles.daySelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                  {day.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Preferowana pora</Text>
        <View style={styles.timeChoices}>
          {times.map((time) => {
            const selected = localTime === time.value;
            return (
              <Pressable
                key={time.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setLocalTime(time.value)}
                style={({ pressed }) => [
                  styles.time,
                  selected && styles.timeSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.timeLabel}>{time.label}</Text>
                <Text style={styles.timeDetail}>{time.detail}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Jedno konkretne przypomnienie</Text>
        <Body muted>
          Przypomnę tylko o najbliższej sesji i od razu pokażę, że wersja Minimum też
          się liczy. Systemowe pytanie o zgodę pojawi się dopiero po zapisaniu.
        </Body>
        <View style={styles.reminderActions}>
          <Button
            label={enableReminder ? '✓ Przypomnienie włączone' : 'Włącz przypomnienie'}
            variant={enableReminder ? 'primary' : 'secondary'}
            onPress={() => setEnableReminder(true)}
          />
          <Button
            label="Bez przypomnienia"
            variant={!enableReminder ? 'secondary' : 'quiet'}
            onPress={() => setEnableReminder(false)}
          />
        </View>
      </Card>

      <Button
        label={saving ? 'Zapisuję…' : 'Zapisz tygodniowy rytm'}
        disabled={!isValid || saving}
        onPress={() => {
          setSaving(true);
          void saveSchedule(selectedDays, localTime, enableReminder).finally(() => {
            setSaving(false);
            onDone?.();
          });
        }}
      />
      {!isValid ? (
        <Text style={styles.validation}>Wybierz dokładnie {expectedDays} dni.</Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accentDark, fontSize: 14, fontWeight: '800' },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.inkMuted, fontSize: 13 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  day: {
    width: 39,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  daySelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayText: { color: colors.inkMuted, fontSize: 13, fontWeight: '800' },
  dayTextSelected: { color: colors.surface },
  timeChoices: { flexDirection: 'row', gap: spacing.xs },
  time: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
  },
  timeSelected: { borderColor: colors.accent, backgroundColor: '#FFF3EE' },
  timeLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  timeDetail: { color: colors.inkMuted, fontSize: 12 },
  reminderActions: { gap: spacing.xs },
  validation: { color: colors.warning, textAlign: 'center', fontSize: 13 },
  pressed: { opacity: 0.72 },
});
