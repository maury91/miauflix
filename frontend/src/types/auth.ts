// Re-export the ProfileToken type from secureStorage for consistency
export type { ProfileToken, StoredProfiles } from '@/utils/secureStorage';

export interface InitializationState {
  isComplete: boolean;
  serverAvailable: boolean;
  profileCount: number;
  currentStep: 'health' | 'auth' | 'complete' | 'error';
  error?: string;
}

export interface AuthState {
  currentProfileId?: string;
  isAuthenticated: boolean;
}

export interface AppInitializationResult {
  isInitialized: boolean;
  serverAvailable: boolean;
  profileCount: number;
  currentStep: InitializationState['currentStep'];
  error?: string;
  isLoading: boolean;
}
