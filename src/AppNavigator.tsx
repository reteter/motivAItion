import { useState } from 'react';

import { CompletionResult, UserProfile } from './domain/types';
import { BaselineScreen } from './screens/BaselineScreen';
import { CompletionScreen } from './screens/CompletionScreen';
import { CoachSettingsScreen } from './screens/CoachSettingsScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { DataRecoveryScreen } from './screens/DataRecoveryScreen';
import { DeveloperChatScreen } from './screens/DeveloperChatScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { WorkoutScreen } from './screens/WorkoutScreen';
import { useAppStore } from './store/AppStore';
import { LoadingScreen } from './ui/components';

type Route =
  | 'dashboard'
  | 'workout'
  | 'history'
  | 'completion'
  | 'schedule'
  | 'coach'
  | 'developer-chat';

function completeDraft(draft: Partial<UserProfile>) {
  return Boolean(
    draft.goal &&
      draft.experience &&
      draft.activity &&
      draft.availableMinutes &&
      draft.daysPerWeek &&
      draft.preferredTime &&
      draft.limitations !== undefined,
  );
}

export function AppNavigator() {
  const { state, hydrationStatus } = useAppStore();
  const [showBaseline, setShowBaseline] = useState(false);
  const [route, setRoute] = useState<Route>('dashboard');
  const [completion, setCompletion] = useState<CompletionResult>();

  if (hydrationStatus === 'loading') return <LoadingScreen />;
  if (hydrationStatus === 'read_error') return <DataRecoveryScreen />;

  if (!state.profile) {
    if (showBaseline || completeDraft(state.onboardingDraft)) {
      return <BaselineScreen />;
    }
    return <OnboardingScreen onReadyForBaseline={() => setShowBaseline(true)} />;
  }

  if (!state.schedule) return <ScheduleScreen />;

  if (route === 'schedule') {
    return <ScheduleScreen onDone={() => setRoute('dashboard')} />;
  }

  if (route === 'workout') {
    return (
      <WorkoutScreen
        onBack={() => setRoute('dashboard')}
        onComplete={(result) => {
          setCompletion(result);
          setRoute('completion');
        }}
      />
    );
  }

  if (route === 'history') {
    return <HistoryScreen onBack={() => setRoute('dashboard')} />;
  }

  if (route === 'coach') {
    return <CoachSettingsScreen onBack={() => setRoute('dashboard')} />;
  }

  if (route === 'developer-chat') {
    return (
      <DeveloperChatScreen
        onBack={() => setRoute('dashboard')}
        onOpenSettings={() => setRoute('coach')}
      />
    );
  }

  if (route === 'completion' && completion) {
    return (
      <CompletionScreen
        result={completion}
        onDone={() => {
          setCompletion(undefined);
          setRoute('dashboard');
        }}
      />
    );
  }

  return (
    <DashboardScreen
      onStart={() => setRoute('workout')}
      onHistory={() => setRoute('history')}
      onSchedule={() => setRoute('schedule')}
      onCoach={() => setRoute('coach')}
      onDeveloperChat={() => setRoute('developer-chat')}
    />
  );
}
