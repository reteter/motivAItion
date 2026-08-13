export type ExperienceLevel =
  | 'never_trained'
  | 'beginner'
  | 'returning_after_break'
  | 'currently_active'
  | 'advanced';

export type ActivityLevel = 'none' | 'sometimes' | 'regular';
export type PreferredTime = 'morning' | 'afternoon' | 'evening';
export type SetFeedback = 'easy' | 'ok' | 'hard';
export type WorkoutVariant = 'standard' | 'minimum';
export type ExerciseUnit = 'reps' | 'seconds';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type DecisionReason =
  | 'low_energy'
  | 'no_time'
  | 'pain_or_limitation'
  | 'exercise_resistance'
  | 'other';

export interface UserProfile {
  goal: string;
  experience: ExperienceLevel;
  activity: ActivityLevel;
  availableMinutes: 5 | 10 | 15;
  daysPerWeek: 2 | 3 | 4;
  preferredTime: PreferredTime;
  limitations: string;
}

export interface Baseline {
  pushups: number;
  squats: number;
  plankSeconds: number;
}

export interface ProtocolExercise {
  id: 'pushups' | 'squats' | 'plank';
  name: string;
  sets: number;
  target: number;
  unit: ExerciseUnit;
}

export interface Protocol {
  version: number;
  createdAt: string;
  daysPerWeek: number;
  preferredTime: PreferredTime;
  exercises: ProtocolExercise[];
  reason: string;
}

export interface WorkoutSet {
  index: number;
  target: number;
  completedAt?: string;
  feedback?: SetFeedback;
}

export interface WorkoutExercise {
  id: ProtocolExercise['id'];
  name: string;
  unit: ExerciseUnit;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  occurrenceId?: string;
  protocolVersion: number;
  plannedAt: string;
  variant: WorkoutVariant;
  status: 'planned' | 'in_progress' | 'completed';
  exercises: WorkoutExercise[];
  completedAt?: string;
  earnedXp?: number;
}

export interface TrainingSchedule {
  weekdays: Weekday[];
  localTime: string;
  timeZone: string;
  startsOn: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkoutOccurrenceStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'missed'
  | 'rescheduled';

export interface WorkoutOccurrence {
  id: string;
  localDate: string;
  scheduledAt: string;
  protocolVersion: number;
  status: WorkoutOccurrenceStatus;
  sourceOccurrenceId?: string;
  decisionReason?: DecisionReason;
  decisionNote?: string;
  recommendedVariant?: WorkoutVariant;
  chosenVariant?: WorkoutVariant;
  workoutId?: string;
  completedAt?: string;
}

export type BehavioralObservationKind =
  | 'low_energy_minimum_helped'
  | 'hard_exercise'
  | 'easy_exercise'
  | 'recovery_minimum_accepted'
  | 'recovery_standard_chosen'
  | 'workout_skipped'
  | 'workout_rescheduled';

export interface BehavioralObservation {
  id: string;
  createdAt: string;
  kind: BehavioralObservationKind;
  confidence: number;
  evidence: string;
}

export interface Progress {
  totalXp: number;
  completedWorkouts: number;
  minimumWorkouts: number;
}

export interface ReminderState {
  enabled: boolean;
  permission: 'unknown' | 'granted' | 'denied';
  notificationId?: string;
  occurrenceId?: string;
  scheduledAt?: string;
}

export interface AppStateV1 {
  schemaVersion: 1;
  onboardingDraft: Partial<UserProfile>;
  profile?: UserProfile;
  baseline?: Baseline;
  protocols: Protocol[];
  todayWorkout?: Workout;
  history: Workout[];
  observations: BehavioralObservation[];
  progress: Progress;
}

export interface AppState {
  schemaVersion: 2;
  onboardingDraft: Partial<UserProfile>;
  profile?: UserProfile;
  baseline?: Baseline;
  protocols: Protocol[];
  schedule?: TrainingSchedule;
  occurrences: WorkoutOccurrence[];
  todayWorkout?: Workout;
  history: Workout[];
  observations: BehavioralObservation[];
  progress: Progress;
  reminders: ReminderState;
}

export type CoachAction =
  | {
      type: 'choose_minimum_workout';
      occurrenceId: string;
      reason: 'low_energy' | 'no_time' | 'recovery';
    }
  | {
      type: 'reschedule_workout_occurrence';
      occurrenceId: string;
      reason: DecisionReason;
    }
  | {
      type: 'skip_workout_occurrence';
      occurrenceId: string;
      reason: DecisionReason;
    }
  | {
      type: 'recommend_recovery_workout';
      occurrenceId: string;
    }
  | {
      type: 'modify_future_protocol';
      reason: 'workout_feedback';
      changes: Array<{
        exerciseId: ProtocolExercise['id'];
        targetDelta: number;
        source: 'hard' | 'easy';
      }>;
    }
  | {
      type: 'add_behavioral_observation';
      observation: Omit<BehavioralObservation, 'id' | 'createdAt'>;
    };

export interface CompletionResult {
  state: AppState;
  coachMessage: string;
  appliedActions: CoachAction[];
}

export interface ConsistencyResult {
  completed: number;
  planned: number;
  ratio: number;
}
