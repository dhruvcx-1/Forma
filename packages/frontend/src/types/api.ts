/** TypeScript types matching the Forma API */

export interface User {
  id: string | number;
  username: string;
  displayName?: string | null;
  display_name?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  is_public?: boolean;
  units?: 'metric' | 'imperial';
  unit_system?: 'metric' | 'imperial';
  createdAt?: string;
  created_at?: string;
}

export interface WeightEntry {
  id: string | number;
  profile_id?: string;
  userId?: string | number;
  date: string; // YYYY-MM-DD
  recorded_at?: string;
  weight: number; // in kg
  value?: number;
  unit?: 'kg' | 'lbs';
  notes?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface WeightStats {
  currentWeight: number | null;
  startingWeight: number | null;
  totalChange: number | null;
  percentChange: number | null;
  weeklyAvg: number | null;
  trend: number | null;
}

export interface MeasurementDefinition {
  id: string | number;
  profile_id?: string | null;
  userId?: string | null;
  name: string;
  slug: string;
  unit: string;
  category?: string;
  is_system?: number | boolean;
  isBuiltIn?: boolean;
  isActive?: boolean;
  display_order?: number;
  displayOrder?: number;
  created_at?: string;
}

export interface MeasurementEntry {
  id: string | number;
  profile_id?: string;
  userId?: string | number;
  definition_id?: string | number;
  definitionId: string | number;
  date: string; // YYYY-MM-DD
  recorded_at?: string;
  value: number;
  notes?: string | null;
  name?: string;
  slug?: string;
  unit?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  definition?: MeasurementDefinition;
}

export interface MeasurementSessionEntry {
  definitionId: string | number;
  definition_id?: string | number;
  value: number;
  notes?: string;
}

export interface Goal {
  id: string | number;
  profile_id?: string;
  userId?: string | number;
  starting_weight?: number | null;
  startWeight?: number | null;
  starting_weight_unit?: string;
  target_weight?: number | null;
  targetWeight?: number | null;
  target_weight_unit?: string;
  target_date?: string | null;
  targetDate?: string | null;
  notes?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  isActive?: boolean;
}

export interface ProgressPhoto {
  id: string | number;
  profile_id?: string;
  userId?: string | number;
  date: string; // YYYY-MM-DD
  recorded_at?: string;
  viewType: 'front' | 'side' | 'back' | 'other';
  view_type?: 'front' | 'side' | 'back' | 'other';
  notes?: string | null;
  filename: string;
  original_name?: string;
  url: string;
  file_size?: number | null;
  mime_type?: string | null;
  createdAt?: string;
  created_at?: string;
}

export interface BodyCompositionData {
  bodyFat: {
    value: number;
    formula: string;
    inputs: Record<string, number | null>;
  } | null;
  bmi: {
    value: number;
    category: string;
    formula: string;
    inputs: Record<string, number | null>;
  } | null;
  availableData: {
    sex: string | null;
    heightCm: number | null;
    waistCm: number | null;
    neckCm: number | null;
    hipsCm: number | null;
    latestWeightKg: number | null;
    latestWeightRecordedAt: string | null;
  };
}

export interface ApiError {
  message: string;
  status: number;
}

export interface SetupStatus {
  isSetup: boolean;
  isAuthenticated?: boolean;
  authenticated?: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: User;
}

export interface ExportData {
  profile?: User;
  user?: User;
  weight_entries?: WeightEntry[];
  weightEntries?: WeightEntry[];
  measurement_definitions?: MeasurementDefinition[];
  measurementDefinitions?: MeasurementDefinition[];
  measurement_entries?: MeasurementEntry[];
  measurementEntries?: MeasurementEntry[];
  goals?: Goal[];
  photos?: ProgressPhoto[];
  exportedAt?: string;
  exported_at?: string;
}

export interface ImportPreview {
  weightEntries: number;
  measurementDefinitions: number;
  measurementEntries: number;
  goals: number;
}

export interface PublicProfileData {
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
  };
  stats: {
    start_weight: number | null;
    current_weight: number | null;
    total_change: number | null;
    goal_weight: number | null;
    goal_target_date: string | null;
    total_entries: number;
    first_date: string | null;
    latest_date: string | null;
    unit_system: 'metric' | 'imperial';
  };
  history: Array<{
    date: string;
    weight: number;
  }>;
}
