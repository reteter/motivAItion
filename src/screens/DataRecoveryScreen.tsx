import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAppStore } from '../store/AppStore';
import { Body, Button, Card, Eyebrow, Page, Title } from '../ui/components';
import { colors } from '../ui/theme';

export function DataRecoveryScreen() {
  const {
    persistenceMessage,
    retryHydration,
    startFreshAfterReadError,
  } = useAppStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const [working, setWorking] = useState(false);

  return (
    <Page>
      <Eyebrow>Ochrona danych</Eyebrow>
      <Title>Nie otwieram planu na siłę.</Title>
      <Body>
        Lokalny zapis ma nieznany albo uszkodzony format. Aplikacja zablokowała
        automatyczny zapis, żeby nie nadpisać danych domyślnym profilem.
      </Body>
      {persistenceMessage ? (
        <Card>
          <Text style={styles.warning}>{persistenceMessage}</Text>
        </Card>
      ) : null}
      <Button label="Spróbuj odczytać ponownie" onPress={retryHydration} />
      {!confirmReset ? (
        <Button
          label="Rozpocznij od nowa"
          variant="quiet"
          onPress={() => setConfirmReset(true)}
        />
      ) : (
        <Card>
          <Text style={styles.confirmTitle}>Potwierdź nowy profil</Text>
          <Body muted>
            Jeśli surowe dane są dostępne, najpierw zachowamy ich lokalną kopię
            odzyskiwania. Dopiero potem nowy profil zastąpi aktywny zapis.
          </Body>
          <Button
            label={working ? 'Zabezpieczam dane…' : 'Zachowaj kopię i zacznij od nowa'}
            disabled={working}
            onPress={() => {
              setWorking(true);
              void startFreshAfterReadError().finally(() => setWorking(false));
            }}
          />
          <Button
            label="Anuluj"
            variant="quiet"
            disabled={working}
            onPress={() => setConfirmReset(false)}
          />
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  warning: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  confirmTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
});
