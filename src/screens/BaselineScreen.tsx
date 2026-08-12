import { useMemo, useState } from 'react';
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native';

import { Baseline, UserProfile } from '../domain/types';
import { useAppStore } from '../store/AppStore';
import {
  Body,
  Button,
  CoachBubble,
  Eyebrow,
  Page,
  Title,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

function toProfile(draft: Partial<UserProfile>): UserProfile | undefined {
  if (
    !draft.goal ||
    !draft.experience ||
    !draft.activity ||
    !draft.availableMinutes ||
    !draft.daysPerWeek ||
    !draft.preferredTime ||
    draft.limitations === undefined
  ) {
    return undefined;
  }
  return draft as UserProfile;
}

function BaselineInput({
  label,
  hint,
  value,
  onChange,
  keyboardType = 'number-pad',
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputCopy}>
        <Text style={styles.inputLabel}>{label}</Text>
        <Text style={styles.inputHint}>{hint}</Text>
      </View>
      <TextInput
        accessibilityLabel={`${label}, ${hint}`}
        keyboardType={keyboardType}
        maxLength={3}
        selectTextOnFocus
        style={styles.input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
      />
    </View>
  );
}

export function BaselineScreen() {
  const { state, finishSetup } = useAppStore();
  const [pushups, setPushups] = useState('');
  const [squats, setSquats] = useState('');
  const [plank, setPlank] = useState('');
  const profile = toProfile(state.onboardingDraft);

  const baseline = useMemo<Baseline | undefined>(() => {
    const values = [pushups, squats, plank].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return undefined;
    if (pushups === '' || squats === '' || plank === '') return undefined;
    return {
      pushups: Math.min(values[0] ?? 0, 100),
      squats: Math.min(values[1] ?? 0, 150),
      plankSeconds: Math.min(values[2] ?? 0, 300),
    };
  }, [plank, pushups, squats]);

  return (
    <Page>
      <Eyebrow>Baseline · 3 krótkie próby</Eyebrow>
      <Title>Sprawdźmy punkt startu.</Title>
      <CoachBubble>
        To nie egzamin. Zatrzymaj każdą próbę, gdy technika przestaje być komfortowa.
      </CoachBubble>
      <Body muted>
        Odpocznij między próbami. Przy ostrym bólu przerwij — aplikacja nie zastępuje konsultacji medycznej.
      </Body>

      <View style={styles.inputs}>
        <BaselineInput
          label="Pompki"
          hint="komfortowe powtórzenia"
          value={pushups}
          onChange={setPushups}
        />
        <BaselineInput
          label="Przysiady"
          hint="komfortowe powtórzenia"
          value={squats}
          onChange={setSquats}
        />
        <BaselineInput
          label="Plank"
          hint="sekundy"
          value={plank}
          onChange={setPlank}
        />
      </View>

      <Button
        label="Utwórz mój pierwszy plan"
        disabled={!baseline || !profile}
        onPress={() => {
          if (baseline && profile) finishSetup(profile, baseline);
        }}
      />
      {!profile ? (
        <Text style={styles.error}>Brakuje odpowiedzi z onboardingu. Wróć i uzupełnij rozmowę.</Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  inputs: {
    gap: spacing.sm,
  },
  inputRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  inputCopy: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  inputHint: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  input: {
    width: 78,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
  },
  error: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
});
