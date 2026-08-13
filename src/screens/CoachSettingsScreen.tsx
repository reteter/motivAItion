import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
  const coach = state.remoteCoach;
  const enabled = coach.mode === 'enabled';
  const connected = enabled && coach.installationStatus === 'active';
  const busy = coachRequestStatus === 'loading';
  const lastProposal = coach.proposals[0];

  return (
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
          <TextInput
            accessibilityLabel="Jednorazowy kod dostępu"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            editable={!busy && remoteCoachConfigured}
            onChangeText={setAccessCode}
            placeholder="Kod dostępu"
            placeholderTextColor={colors.inkMuted}
            secureTextEntry
            style={styles.input}
            value={accessCode}
          />
          <Button
            label={busy ? 'Łączę…' : 'Połącz instalację'}
            disabled={busy || !remoteCoachConfigured || !accessCode.trim()}
            onPress={() => {
              void connectRemoteCoach(accessCode).then((success) => {
                if (success) setAccessCode('');
              });
            }}
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
  );
}

const styles = StyleSheet.create({
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
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 17,
    paddingHorizontal: spacing.md,
  },
  warning: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  status: { color: colors.progress, fontSize: 14, lineHeight: 20 },
});
