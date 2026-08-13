import { WorkoutOccurrence } from '../domain/types';

export type ReminderPermission = 'granted' | 'denied';

export interface ReminderPort {
  requestPermission: () => Promise<ReminderPermission>;
  schedule: (occurrence: WorkoutOccurrence) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
}
