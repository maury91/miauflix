import { useEffect, useState } from 'react';

import { authUtils } from '@/store/api/auth';
import { useLazyCheckHealthQuery } from '@/store/api/health';
import { navigateTo, setCurrentProfile, updateInitialization } from '@/store/slices/app';
import { useAppDispatch, useAppSelector } from '@/store/store';
import type { AppInitializationResult } from '@/types/auth';

/**
 * Hook to orchestrate app initialization flow:
 * Health Check → Profile Detection → Navigation
 */
export function useAppInitialization(): AppInitializationResult {
  const dispatch = useAppDispatch();
  const initialization = useAppSelector(state => state.app.initialization);
  const [isLoading, setIsLoading] = useState(true);

  const [checkHealth, { isLoading: isHealthLoading }] = useLazyCheckHealthQuery();

  useEffect(() => {
    async function initialize() {
      setIsLoading(true);

      try {
        // Step 1: Health Check
        dispatch(updateInitialization({ currentStep: 'health' }));

        const healthResult = await checkHealth().unwrap();

        if (healthResult.status === 'ok') {
          dispatch(
            updateInitialization({
              serverAvailable: true,
              currentStep: 'auth',
            })
          );

          // Step 2: Check for stored profiles
          const profileCount = await authUtils.getProfileCount();

          dispatch(
            updateInitialization({
              profileCount,
            })
          );

          if (profileCount === 0) {
            // No profiles - go to login
            dispatch(navigateTo('login'));
            dispatch(
              updateInitialization({
                currentStep: 'complete',
                isComplete: true,
              })
            );
          } else if (profileCount === 1) {
            // Single profile - set as current and go to home
            const profiles = await authUtils.getStoredProfiles();
            const profile = profiles[0];

            // Try to get a valid token (this will attempt refresh if needed)
            const hasValidToken = await authUtils.ensureValidToken(profile.profileId);

            if (hasValidToken) {
              dispatch(setCurrentProfile(profile.profileId));
              dispatch(navigateTo('home/categories'));
              dispatch(
                updateInitialization({
                  currentStep: 'complete',
                  isComplete: true,
                })
              );
            } else {
              // Token expired - redirect to login and remove invalid profile
              await authUtils.clearAllProfiles();
              dispatch(navigateTo('login'));
              dispatch(
                updateInitialization({
                  profileCount: 0,
                  currentStep: 'complete',
                  isComplete: true,
                })
              );
            }
          } else {
            // Multiple profiles - go to profile selection
            dispatch(navigateTo('profile-selection'));
            dispatch(
              updateInitialization({
                currentStep: 'complete',
                isComplete: true,
              })
            );
          }
        } else {
          throw new Error('Health check failed');
        }
      } catch (error) {
        console.error('App initialization failed:', error);

        dispatch(
          updateInitialization({
            serverAvailable: false,
            currentStep: 'error',
            error: error instanceof Error ? error.message : 'Server unavailable',
          })
        );
      } finally {
        setIsLoading(false);
      }
    }

    // Only run initialization if not already complete
    if (!initialization.isComplete) {
      initialize();
    } else {
      setIsLoading(false);
    }
  }, [initialization.isComplete, checkHealth, dispatch]);

  return {
    isInitialized: initialization.isComplete,
    serverAvailable: initialization.serverAvailable,
    profileCount: initialization.profileCount,
    currentStep: initialization.currentStep,
    error: initialization.error,
    isLoading: isLoading || isHealthLoading,
  };
}

/**
 * Hook to reinitialize the app (useful after logout or profile changes)
 */
export function useReinitializeApp() {
  const dispatch = useAppDispatch();

  return () => {
    dispatch(
      updateInitialization({
        isComplete: false,
        currentStep: 'health',
        error: undefined,
      })
    );
    dispatch(setCurrentProfile(undefined));
  };
}
