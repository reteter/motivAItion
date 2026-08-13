import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing } from './theme';

export function Page({ children }: PropsWithChildren) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      style={styles.pageScroll}
    >
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function CoachBubble({ children }: PropsWithChildren) {
  return (
    <View style={styles.coachBubble} accessibilityLabel={`Coach: ${String(children)}`}>
      <View style={styles.coachMark}>
        <Text style={styles.coachMarkText}>AI</Text>
      </View>
      <Text style={styles.coachText}>{children}</Text>
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet';
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  accessibilityHint,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`]]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface ChoiceProps {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
}

export function Choice({ label, detail, selected = false, onPress }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {detail ? <Text style={styles.choiceDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.min(1, Math.max(0, value));
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safeValue * 100) }}
    >
      <View style={[styles.progressFill, { width: `${safeValue * 100}%` }]} />
    </View>
  );
}

export function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingText}>Otwieram Twój plan…</Text>
    </View>
  );
}

export function TopBar({
  title,
  left,
  right,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topSide}>{left}</View>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={[styles.topSide, styles.topSideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 48,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 25,
  },
  muted: {
    color: colors.inkMuted,
  },
  coachBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  coachMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  coachMarkText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '900',
  },
  coachText: {
    flex: 1,
    color: colors.surface,
    fontSize: 16,
    lineHeight: 23,
  },
  button: {
    minHeight: 58,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  quietButton: {
    minHeight: 46,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButtonText: {
    color: colors.surface,
  },
  secondaryButtonText: {
    color: colors.ink,
  },
  quietButtonText: {
    color: colors.inkMuted,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.4,
  },
  choice: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: '#FFF3EE',
  },
  choiceCopy: {
    flex: 1,
    gap: 3,
  },
  choiceLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  choiceDetail: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  progressTrack: {
    height: 12,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.progressSoft,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.progress,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.inkMuted,
    fontSize: 16,
  },
  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topSide: {
    width: 76,
  },
  topSideRight: {
    alignItems: 'flex-end',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
});
