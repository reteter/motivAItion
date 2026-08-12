import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActivityLevel,
  ExperienceLevel,
  PreferredTime,
  UserProfile,
} from '../domain/types';
import { useAppStore } from '../store/AppStore';
import {
  Body,
  Button,
  Choice,
  CoachBubble,
  Eyebrow,
  Page,
  ProgressBar,
  Title,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

interface Option<T> {
  value: T;
  label: string;
  detail?: string;
}

const goals: Option<string>[] = [
  { value: 'Wrócić do regularnego ruchu', label: 'Wrócić do regularności' },
  { value: 'Poprawić kondycję', label: 'Poprawić kondycję' },
  { value: 'Zbudować podstawową siłę', label: 'Zbudować podstawową siłę' },
];

const experiences: Option<ExperienceLevel>[] = [
  { value: 'never_trained', label: 'Nigdy regularnie nie trenowałem' },
  { value: 'beginner', label: 'Zaczynam od podstaw' },
  {
    value: 'returning_after_break',
    label: 'Wracam po przerwie',
    detail: 'Znam ćwiczenia, ale obecna forma może być inna.',
  },
  { value: 'currently_active', label: 'Jestem teraz aktywny' },
  { value: 'advanced', label: 'Mam duże doświadczenie' },
];

const activities: Option<ActivityLevel>[] = [
  { value: 'none', label: 'Prawie wcale' },
  { value: 'sometimes', label: 'Ruszam się od czasu do czasu' },
  { value: 'regular', label: 'Ćwiczę regularnie' },
];

const times: Option<PreferredTime>[] = [
  { value: 'morning', label: 'Rano' },
  { value: 'afternoon', label: 'W ciągu dnia' },
  { value: 'evening', label: 'Wieczorem' },
];

function initialStep(draft: Partial<UserProfile>) {
  if (Object.keys(draft).length === 0) return 0;
  if (!draft.goal) return 1;
  if (!draft.experience) return 2;
  if (!draft.activity) return 3;
  if (!draft.availableMinutes) return 4;
  if (!draft.daysPerWeek) return 5;
  if (!draft.preferredTime) return 6;
  return 7;
}

function Options<T>({
  items,
  selected,
  onSelect,
}: {
  items: Option<T>[];
  selected?: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.options}>
      {items.map((item) => (
        <Choice
          key={String(item.value)}
          label={item.label}
          detail={item.detail}
          selected={selected === item.value}
          onPress={() => onSelect(item.value)}
        />
      ))}
    </View>
  );
}

export function OnboardingScreen({
  onReadyForBaseline,
}: {
  onReadyForBaseline: () => void;
}) {
  const { state, updateOnboardingDraft } = useAppStore();
  const draft = state.onboardingDraft;
  const [step, setStep] = useState(() => initialStep(draft));
  const [limitations, setLimitations] = useState(draft.limitations ?? '');
  const progress = useMemo(() => Math.max(0, step - 1) / 7, [step]);

  const choose = <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
    nextStep: number,
  ) => {
    updateOnboardingDraft({ [key]: value });
    setStep(nextStep);
  };

  return (
    <Page>
      {step > 0 ? <ProgressBar value={progress} /> : null}

      {step === 0 ? (
        <>
          <Eyebrow>motivAItion / start</Eyebrow>
          <Title>Plan, który masz naprawdę wykonać.</Title>
          <CoachBubble>
            Nie będę układał idealnego treningu dla statystycznej osoby. Najpierw
            znajdziemy realny próg startu dla Ciebie.
          </CoachBubble>
          <Body muted>Krótka rozmowa, prosty baseline i pierwszy trening.</Body>
          <Button label="Zaczynamy" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Eyebrow>1 / 7 · cel</Eyebrow>
          <Title>Po co chcesz zacząć?</Title>
          <CoachBubble>Wybierz najważniejszy efekt. Plan będzie się zmieniał, cel nie musi.</CoachBubble>
          <Options
            items={goals}
            selected={draft.goal}
            onSelect={(value) => choose('goal', value, 2)}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Eyebrow>2 / 7 · doświadczenie</Eyebrow>
          <Title>Co już umiesz?</Title>
          <CoachBubble>Przerwa nie kasuje doświadczenia. Obecną formę sprawdzimy osobno.</CoachBubble>
          <Options
            items={experiences}
            selected={draft.experience}
            onSelect={(value) => choose('experience', value, 3)}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Eyebrow>3 / 7 · teraz</Eyebrow>
          <Title>Ile ruchu masz obecnie?</Title>
          <Options
            items={activities}
            selected={draft.activity}
            onSelect={(value) => choose('activity', value, 4)}
          />
        </>
      ) : null}

      {step === 4 ? (
        <>
          <Eyebrow>4 / 7 · czas</Eyebrow>
          <Title>Ile czasu oddasz bez negocjacji?</Title>
          <CoachBubble>Nie pytam o idealny dzień. Pytam o słabszy, zwykły dzień.</CoachBubble>
          <Options
            items={([5, 10, 15] as const).map((value) => ({
              value,
              label: `${value} minut`,
            }))}
            selected={draft.availableMinutes}
            onSelect={(value) => choose('availableMinutes', value, 5)}
          />
        </>
      ) : null}

      {step === 5 ? (
        <>
          <Eyebrow>5 / 7 · rytm</Eyebrow>
          <Title>Ile razy w tygodniu jest realne?</Title>
          <Options
            items={([2, 3, 4] as const).map((value) => ({
              value,
              label: `${value} razy`,
            }))}
            selected={draft.daysPerWeek}
            onSelect={(value) => choose('daysPerWeek', value, 6)}
          />
        </>
      ) : null}

      {step === 6 ? (
        <>
          <Eyebrow>6 / 7 · pora</Eyebrow>
          <Title>Kiedy najłatwiej Ci zacząć?</Title>
          <Options
            items={times}
            selected={draft.preferredTime}
            onSelect={(value) => choose('preferredTime', value, 7)}
          />
        </>
      ) : null}

      {step === 7 ? (
        <>
          <Eyebrow>7 / 7 · ograniczenia</Eyebrow>
          <Title>Co powinienem wiedzieć?</Title>
          <CoachBubble>
            Ból, kontuzja albo ćwiczenie, którego nie chcesz robić. Jeśli nic — zostaw puste.
          </CoachBubble>
          <TextInput
            accessibilityLabel="Ograniczenia i nielubiane ćwiczenia"
            multiline
            maxLength={240}
            placeholder="Np. boli mnie prawe kolano…"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={limitations}
            onChangeText={setLimitations}
          />
          <Text style={styles.counter}>{limitations.length} / 240</Text>
          <Button
            label="Przejdź do baseline"
            onPress={() => {
              updateOnboardingDraft({ limitations: limitations.trim() });
              onReadyForBaseline();
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.sm,
  },
  input: {
    minHeight: 130,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.inkMuted,
    fontSize: 12,
  },
});
