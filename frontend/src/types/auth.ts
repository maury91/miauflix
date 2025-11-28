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
