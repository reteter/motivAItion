import * as Notifications from 'expo-notifications';

import { ReminderPort } from './reminderPort';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const expoReminder: ReminderPort = {
  async requestPermission() {
    const current = await Notifications.getPermissionsAsync();
    const isAllowed = (status: typeof current) =>
      status.granted ||
      status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
    if (isAllowed(current)) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return isAllowed(requested) ? 'granted' : 'denied';
  },

  async schedule(occurrence) {
    return Notifications.scheduleNotificationAsync({
      identifier: `motivaition-${occurrence.id}`,
      content: {
        title: 'Czas na realny ruch',
        body: 'Twój trening czeka. Jeśli dzień jest ciężki, wersja Minimum też się liczy.',
        sound: 'default',
        data: { kind: 'workout-reminder', occurrenceId: occurrence.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(occurrence.scheduledAt),
      },
    });
  },

  async cancel(notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },
};
