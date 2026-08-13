import { useEffect, useReducer, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  buildDeveloperChatContext,
  buildDeveloperChatRequest,
  citationSegments,
  developerChatErrorMessage,
  developerChatSessionReducer,
  DeveloperChatCitation,
  DeveloperChatSessionMessage,
  initialDeveloperChatSession,
  MAX_CHAT_USER_MESSAGE_LENGTH,
} from '../coach/developerChat';
import { remoteCoach, RemoteCoachError } from '../coach/remoteCoach';
import { useAppStore } from '../store/AppStore';
import { Body, Button, Card, Eyebrow, Title, TopBar } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const quickPrompts = [
  'Dzisiaj mam dobry dzień i chcę dodatkowo się rozruszać. Co proponujesz?',
  'Dzisiaj mogę wydłużyć trening do 30 minut. Zaproponuj mi workout.',
];

function errorMessage(error: unknown) {
  if (!(error instanceof RemoteCoachError)) {
    return 'Czat jest chwilowo niedostępny. Spróbuj ponownie.';
  }
  return developerChatErrorMessage(error.code);
}

function AnnotatedText({
  text,
  citations,
  onLinkError,
}: {
  text: string;
  citations: DeveloperChatCitation[];
  onLinkError: () => void;
}) {
  const segments = citationSegments(text, citations);

  return (
    <Text style={styles.messageText}>
      {segments.map((segment, index) =>
        segment.citation ? (
          <Text
            key={`${segment.citation.url}-${index}`}
            accessibilityRole="link"
            onPress={() => {
              const url = segment.citation?.url ?? '';
              void Linking.canOpenURL(url)
                .then((supported) => supported ? Linking.openURL(url) : Promise.reject())
                .catch(onLinkError);
            }}
            style={styles.inlineCitation}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={`text-${index}`}>{segment.text}</Text>
        ),
      )}
    </Text>
  );
}

export function DeveloperChatScreen({
  onBack,
  onOpenSettings,
}: {
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const { state, remoteCoachConfigured, markRemoteCoachRevoked } = useAppStore();
  const [disclosureVisible, setDisclosureVisible] = useState(true);
  const [session, dispatch] = useReducer(
    developerChatSessionReducer,
    initialDeveloperChatSession,
  );
  const messageSequence = useRef(0);
  const requestGeneration = useRef(0);
  const requestInFlight = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const available =
    remoteCoachConfigured &&
    state.remoteCoach.mode === 'enabled' &&
    state.remoteCoach.installationStatus === 'active';

  useEffect(() => () => {
    requestGeneration.current += 1;
    requestInFlight.current = false;
    remoteCoach.cancelChatPending();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [session.messages, session.status]);

  function nextMessageId(role: 'user' | 'assistant') {
    messageSequence.current += 1;
    return `${role}-${Date.now()}-${messageSequence.current}`;
  }

  function newChat() {
    requestGeneration.current += 1;
    requestInFlight.current = false;
    remoteCoach.cancelChatPending();
    dispatch({ type: 'reset' });
  }

  async function send() {
    const content = session.draft.trim();
    if (
      !content ||
      content.length > MAX_CHAT_USER_MESSAGE_LENGTH ||
      session.status === 'loading' ||
      requestInFlight.current
    ) return;
    const context = buildDeveloperChatContext(state);
    if (!context) {
      dispatch({
        type: 'fail',
        generation: session.generation,
        message: 'Nie udało się przygotować bezpiecznego kontekstu treningowego.',
      });
      return;
    }
    if (!available) {
      dispatch({
        type: 'fail',
        generation: session.generation,
        message: 'Najpierw połącz instalację w ustawieniach AI coacha.',
      });
      return;
    }
    const userMessage: DeveloperChatSessionMessage = {
      id: nextMessageId('user'),
      role: 'user',
      content,
      citations: [],
      webSearchUsed: false,
    };
    const visibleMessages = [...session.messages, userMessage];
    const request = buildDeveloperChatRequest(context, visibleMessages);
    if (!request) {
      dispatch({
        type: 'fail',
        generation: session.generation,
        message: developerChatErrorMessage('invalid_request'),
      });
      return;
    }
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    requestInFlight.current = true;
    dispatch({ type: 'start', generation, messages: visibleMessages });
    try {
      const reply = await remoteCoach.chat(request);
      const assistantMessage: DeveloperChatSessionMessage = {
        id: nextMessageId('assistant'),
        role: 'assistant',
        content: reply.text,
        citations: reply.citations,
        webSearchUsed: reply.webSearchUsed,
      };
      dispatch({ type: 'succeed', generation, message: assistantMessage });
    } catch (error) {
      const message = errorMessage(error);
      if (!message) {
        dispatch({ type: 'clear_error', generation });
        return;
      }
      if (error instanceof RemoteCoachError && error.code === 'unauthorized') {
        markRemoteCoachRevoked();
      }
      dispatch({ type: 'fail', generation, message, retryDraft: content });
    } finally {
      if (requestGeneration.current === generation) requestInFlight.current = false;
    }
  }

  if (disclosureVisible) {
    return (
      <ScrollView contentContainerStyle={styles.disclosure} style={styles.screen}>
        <TopBar
          title="Developer Coach Chat"
          left={<Button label="Wróć" variant="quiet" onPress={onBack} />}
        />
        <Eyebrow>Eksperyment M4</Eyebrow>
        <Title>Czat bez pamięci.</Title>
        <Body muted>
          Swobodny tekst rozmowy i widoczny niżej snapshot treningowy będą wysyłane
          do OpenAI. Model ma domyślnie dostęp do web search, więc jego zapytania mogą
          zostać wysłane do sieci.
        </Body>
        <Card>
          <Text style={styles.cardTitle}>Co wysyłamy w każdym turnie</Text>
          <Text style={styles.cardText}>
            Dzisiejszy stan, Protocol i Minimum, baseline, dostępny czas oraz
            zagregowaną Consistency, feedback i flagę bólu lub ograniczenia.
          </Text>
          <Text style={styles.privacyEmphasis}>
            Ta rozmowa nie jest zapisywana. Wyjście z ekranu, restart aplikacji albo
            „Nowy czat” natychmiast usuwa transcript z aplikacji.
          </Text>
          <Text style={styles.cardText}>
            Sugestie są doradcze. Czat nie ma actions i nie może zmienić treningu,
            Protocolu, historii ani XP.
          </Text>
        </Card>
        {available ? (
          <Button label="Rozumiem, otwórz czat" onPress={() => setDisclosureVisible(false)} />
        ) : (
          <>
            <Text style={styles.errorText} accessibilityRole="alert">
              Czat wymaga włączonego i połączonego zdalnego AI coacha.
            </Text>
            <Button label="Otwórz ustawienia AI" onPress={onOpenSettings} />
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.chatHeader}>
        <TopBar
          title="Developer Coach Chat"
          left={<Button label="Wróć" variant="quiet" onPress={onBack} />}
          right={<Button label="Nowy czat" variant="quiet" onPress={newChat} />}
        />
        <View style={styles.devBadge}>
          <Text style={styles.devBadgeText}>DEV · web search dostępny</Text>
        </View>
        <Text style={styles.ephemeralText}>Ta rozmowa nie jest zapisywana</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.transcript}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {session.messages.length === 0 ? (
          <Card>
            <Text style={styles.cardTitle}>Od czego zaczynamy?</Text>
            {quickPrompts.map((prompt) => (
              <Pressable
                key={prompt}
                accessibilityRole="button"
                onPress={() => dispatch({ type: 'set_draft', draft: prompt })}
                style={({ pressed }) => [styles.quickPrompt, pressed && styles.pressed]}
              >
                <Text style={styles.quickPromptText}>{prompt}</Text>
              </Pressable>
            ))}
          </Card>
        ) : null}

        {session.messages.map((message) => {
          const sources = message.citations.filter(
            (citation, index, all) =>
              all.findIndex((candidate) => candidate.url === citation.url) === index,
          );
          return (
            <View
              key={message.id}
              accessibilityLabel={`${message.role === 'user' ? 'Ty' : 'AI'}: ${message.content}`}
              style={[
                styles.message,
                message.role === 'user' ? styles.userMessage : styles.assistantMessage,
              ]}
            >
              <Text style={styles.messageLabel}>
                {message.role === 'user' ? 'TY' : 'AI COACH'}
              </Text>
              {message.role === 'assistant' ? (
                <AnnotatedText
                  text={message.content}
                  citations={message.citations}
                  onLinkError={() => undefined}
                />
              ) : (
                <Text style={styles.messageText}>{message.content}</Text>
              )}
              {message.webSearchUsed ? (
                <Text style={styles.searchUsed}>Odpowiedź korzystała z web search</Text>
              ) : null}
              {sources.length > 0 ? (
                <View style={styles.sources}>
                  <Text style={styles.sourcesTitle}>Źródła</Text>
                  {sources.map((source, index) => (
                    <Pressable
                      key={`${source.url}-${index}`}
                      accessibilityRole="link"
                      onPress={() => {
                        void Linking.canOpenURL(source.url)
                          .then((supported) =>
                            supported ? Linking.openURL(source.url) : Promise.reject(),
                          )
                          .catch(() => undefined);
                      }}
                    >
                      <Text style={styles.sourceLink}>{index + 1}. {source.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {session.status === 'loading' ? (
          <Text style={styles.loadingText} accessibilityLiveRegion="polite">
            AI przygotowuje odpowiedź…
          </Text>
        ) : null}
        {session.statusMessage ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {session.statusMessage}
          </Text>
        ) : null}
        {state.remoteCoach.installationStatus === 'revoked' ? (
          <Button label="Otwórz ustawienia AI" variant="secondary" onPress={onOpenSettings} />
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Wiadomość do Developer Coach Chat"
          autoCorrect
          editable={session.status !== 'loading'}
          maxLength={MAX_CHAT_USER_MESSAGE_LENGTH}
          multiline
          onChangeText={(draft) => dispatch({ type: 'set_draft', draft })}
          placeholder="Napisz, jak się dziś czujesz…"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={session.draft}
        />
        <Text style={styles.characterCount}>
          {session.draft.length} / {MAX_CHAT_USER_MESSAGE_LENGTH}
        </Text>
        <Button
          label={session.status === 'loading' ? 'Wysyłam…' : 'Wyślij'}
          disabled={!session.draft.trim() || session.status === 'loading'}
          onPress={() => void send()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  disclosure: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 48,
  },
  chatHeader: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  devBadge: {
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.progressSoft,
  },
  devBadgeText: { color: colors.progress, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  ephemeralText: { color: colors.inkMuted, fontSize: 12, textAlign: 'center' },
  transcript: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  cardText: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  privacyEmphasis: { color: colors.progress, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  quickPrompt: {
    minHeight: 52,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  quickPromptText: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  message: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
  userMessage: { marginLeft: spacing.xl, backgroundColor: '#FFF0EA' },
  assistantMessage: { marginRight: spacing.md, backgroundColor: colors.surface },
  messageLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  messageText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  inlineCitation: { color: colors.accentDark, textDecorationLine: 'underline', fontWeight: '700' },
  searchUsed: { color: colors.progress, fontSize: 12, fontWeight: '800' },
  sources: { gap: spacing.xs, marginTop: spacing.xs },
  sourcesTitle: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  sourceLink: { color: colors.accentDark, fontSize: 13, lineHeight: 19, textDecorationLine: 'underline' },
  loadingText: { color: colors.inkMuted, fontSize: 14, fontStyle: 'italic' },
  errorText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  composer: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
  },
  input: {
    minHeight: 52,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  characterCount: { color: colors.inkMuted, fontSize: 11, textAlign: 'right' },
  pressed: { opacity: 0.7 },
});
