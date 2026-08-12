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
  protocolVersion: number;
  plannedAt: string;
  variant: WorkoutVariant;
  status: 'planned' | 'in_progress' | 'completed';
  exercises: WorkoutExercise[];
  completedAt?: string;
  earnedXp?: number;
}

export interface BehavioralObservation {
  id: string;
  createdAt: string;
  kind: 'low_energy_minimum_helped' | 'hard_exercise' | 'easy_exercise';
  confidence: number;
  evidence: string;
}

export interface Progress {
  totalXp: number;
  completedWorkouts: number;
  minimumWorkouts: number;
}

export interface AppState {
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

export type CoachAction =
  | {
      type: 'reduce_today_workout';
      reason: 'low_energy' | 'limited_time';
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
