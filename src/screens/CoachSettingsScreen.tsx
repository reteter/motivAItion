import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppStore } from '../store/AppStore';
import { Body, Button, Card, Eyebrow, Page, Title, TopBar } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const sharedCategories = [
  'stan dzisiejszej i najbliższej sesji',
  'zagregowana Consistency z 7 i 30 dni',
  'liczby statusów, powodów i feedbacku z ostatnich 14 dni',
  'hipotezy behawioralne bez swobodnych notatek',
  'identyfikatory propozycji/requestu, decyzja Zastosuj lub Nie teraz i późniejszy wynik sesji; retencja backendu: 30 dni',
];

export function CoachSettingsScreen({ onBack }: { onBack: () => void }) {
  const {
    state,
    coachRequestStatus,
    coachRequestMessage,
    remoteCoachConfigured,
    setRemoteCoachConsent,
    connectRemoteCoach,
  } = useAppStore();
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const coach = state.remoteCoach;
  const enabled = coach.mode === 'enabled';
  const connected = enabled && coach.installationStatus === 'active';
  const busy = coachRequestStatus === 'loading';
  const lastProposal = coach.proposals[0];
  const accessCodeLength = accessCode.replace(/\s/g, '').length;

  const submitAccessCode = () => {
    if (busy || !remoteCoachConfigured || accessCodeLength !== 43) return;
    void connectRemoteCoach(accessCode).then((success) => {
      if (success) setAccessCode('');
    });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <Page>
      <TopBar
        title="AI coach"
        left={<Button label="Wróć" variant="quiet" onPress={onBack} />}
      />
      <Eyebrow>Twoja decyzja</Eyebrow>
      <Title>Mały kontekst. Ograniczone akcje.</Title>
      <Body muted>
        AI może zaproponować jeden następny krok. Niczego nie zmienia bez Twojego
        „Zastosuj”. Trening, XP i historia pozostają pod kontrolą aplikacji.
      </Body>

      <Card>
        <Text style={styles.cardTitle}>Co może zostać wysłane</Text>
        {sharedCategories.map((category) => (
          <View key={category} style={styles.listRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listText}>{category}</Text>
          </View>
        ))}
        <Text style={styles.safetyText}>
          Nie wysyłamy celu, ograniczeń wpisanych własnymi słowami, treści propozycji, tokenu,
          identyfikatorów powiadomień ani pełnego stanu aplikacji.
        </Text>
      </Card>

      {!enabled ? (
        <>
          {coach.installationStatus === 'active' ? (
            <Text style={styles.warning} accessibilityRole="alert">
              Wysyłanie danych jest wyłączone, ale backend nie potwierdził jeszcze
              odwołania tokenu. Możesz ponowić odwołanie.
            </Text>
          ) : null}
          <Button
            label="Włącz zdalnego AI coacha"
            disabled={busy}
            onPress={() => void setRemoteCoachConsent(true)}
          />
          {coach.installationStatus === 'active' ? (
            <Button
              label="Ponów odwołanie tokenu"
              variant="secondary"
              disabled={busy}
              onPress={() => void setRemoteCoachConsent(false)}
            />
          ) : null}
        </>
      ) : null}

      {enabled && !connected ? (
        <Card>
          <Text style={styles.cardTitle}>Połącz tę instalację</Text>
          <Text style={styles.cardMeta}>
            Jednorazowy kod wymieniamy na odwoływalny token zapisany w iOS Secure
            Store. Bez tokenu aplikacja używa fallbacku lokalnego.
          </Text>
          {!remoteCoachConfigured ? (
            <Text style={styles.warning} accessibilityRole="alert">
              Build nie ma jeszcze `EXPO_PUBLIC_COACH_API_URL`. Połączenie z backendem
              będzie dostępne po skonfigurowaniu adresu HTTPS.
            </Text>
          ) : null}
          <Text style={styles.inputHint}>
            Kod rozróżnia wielkie i małe litery. Możesz go wkleić lub odsłonić podczas
            ręcznego wpisywania. Spacje są pomijane. Wymagane są 43 znaki.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Jednorazowy kod dostępu"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              editable={!busy && remoteCoachConfigured}
              keyboardType="ascii-capable"
              onChangeText={setAccessCode}
              onSubmitEditing={submitAccessCode}
              placeholder="Kod dostępu"
              placeholderTextColor={colors.inkMuted}
              returnKeyType="done"
              secureTextEntry={!showAccessCode}
              spellCheck={false}
              style={styles.input}
              textContentType="none"
              value={accessCode}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showAccessCode ? 'Ukryj kod dostępu' : 'Pokaż kod dostępu'}
              accessibilityState={{ expanded: showAccessCode }}
              disabled={busy}
              hitSlop={8}
              onPress={() => setShowAccessCode((visible) => !visible)}
              style={({ pressed }) => [
                styles.visibilityButton,
                pressed && styles.visibilityButtonPressed,
              ]}
            >
              <Text style={styles.visibilityButtonText}>
                {showAccessCode ? 'Ukryj' : 'Pokaż'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.characterCount} accessibilityLiveRegion="polite">
            {accessCodeLength} / 43 znaków
          </Text>
          <Button
            label={busy ? 'Łączę…' : 'Połącz instalację'}
            disabled={busy || !remoteCoachConfigured || accessCodeLength !== 43}
            onPress={submitAccessCode}
          />
        </Card>
      ) : null}

      {connected ? (
        <Card>
          <Text style={styles.cardTitle}>Instalacja aktywna</Text>
          <Text style={styles.cardMeta}>
            Token jest zapisany poza AppState. Możesz go odwołać bez reinstalacji
            aplikacji.
          </Text>
        </Card>
      ) : null}

      {coachRequestMessage ? (
        <Text
          style={coachRequestStatus === 'error' ? styles.warning : styles.status}
          accessibilityRole={coachRequestStatus === 'error' ? 'alert' : undefined}
        >
          {coachRequestMessage}
        </Text>
      ) : null}

      {lastProposal ? (
        <Card>
          <Text style={styles.cardTitle}>Ostatnia propozycja</Text>
          <Text style={styles.cardMeta}>
            {lastProposal.source === 'remote' ? 'Zdalny AI' : 'Fallback lokalny'} ·{' '}
            {lastProposal.status}
          </Text>
          <Text style={styles.listText}>{lastProposal.message}</Text>
          {lastProposal.outcomeStatus ? (
            <Text style={styles.cardMeta}>Późniejszy wynik: {lastProposal.outcomeStatus}</Text>
          ) : null}
        </Card>
      ) : null}

      {enabled ? (
        <Button
          label="Wyłącz i odwołaj token"
          variant="secondary"
          disabled={busy}
          onPress={() => void setRemoteCoachConsent(false)}
        />
      ) : null}
      </Page>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  cardMeta: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  listRow: { flexDirection: 'row', gap: spacing.sm },
  bullet: { color: colors.accentDark, fontSize: 18, fontWeight: '900' },
  listText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  safetyText: {
    color: colors.progress,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  inputHint: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  inputRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 54,
    color: colors.ink,
    fontFamily: 'Menlo',
    fontSize: 16,
    letterSpacing: 0.5,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  visibilityButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  visibilityButtonPressed: { opacity: 0.6 },
  visibilityButtonText: { color: colors.accentDark, fontSize: 14, fontWeight: '800' },
  characterCount: { color: colors.inkMuted, fontSize: 12, textAlign: 'right' },
  warning: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  status: { color: colors.progress, fontSize: 14, lineHeight: 20 },
});
