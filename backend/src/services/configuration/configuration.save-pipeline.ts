import { errorMessage } from './configuration.runtime';
import type { ConfigurationStore } from './configuration.store';
import type {
  ConfigServiceActionResult,
  SaveConfigsResult,
  ServiceName,
  TestConfigsResult,
} from './configuration.types';

/** A save that changed nothing (or failed before anything was applied). */
export const unappliedSaveResult = (
  success: boolean,
  services: ConfigServiceActionResult[],
  invalidKeys?: string[]
): SaveConfigsResult => ({
  success,
  services,
  restarted: [],
  needsProcessRestart: [],
  changed: [],
  recovered: [],
  ...(invalidKeys ? { invalidKeys } : {}),
});

/** Result of an action that stopped before saving: a save-shaped result when `save` was asked. */
export const unappliedActionResult = (
  save: boolean,
  success: boolean,
  services: ConfigServiceActionResult[]
): SaveConfigsResult | TestConfigsResult =>
  save ? unappliedSaveResult(success, services) : { success, services };

export type ApplyOutcome = Pick<
  SaveConfigsResult,
  'changed' | 'needsProcessRestart' | 'recovered' | 'restarted'
>;

/** Tracks the service being applied, so a failure can be blamed on it. */
export type ApplyProgress = { applying?: ServiceName };

/**
 * The flow-specific parts of saving a tested configuration. Everything else — snapshot, write to
 * config.json, rollback of the store and file, blaming the failing service, change notification —
 * is shared by saveAndApply().
 */
export interface SavePlan {
  /** Test results; later phases mark failures and append rollback notes onto them. */
  results: ConfigServiceActionResult[];
  /** Writes the candidate into the store (values and staged file data). Returns false when nothing changed. */
  stage(): boolean;
  /** Pushes the saved configuration to the running services. Throws to trigger rollback. */
  apply(progress: ApplyProgress): Promise<ApplyOutcome>;
  /** Undoes runtime side effects after a failed apply; the store and file are already restored. */
  rollback(): Promise<void>;
  /** Service blamed when apply fails before naming the service in flight. */
  fallbackFailedService?(): string | undefined;
  /**
   * Called when rewriting config.json during rollback fails, after which rollback continues.
   * Without it, that failure is thrown once the runtime rollback has run.
   */
  onRollbackSaveError?(error: unknown): void;
}

/**
 * Stage → save config.json → apply to services. On failure, restore the previous values and file,
 * roll back the services, and report the error on the service being applied.
 */
export async function saveAndApply(
  store: ConfigurationStore,
  plan: SavePlan,
  notifyChanges: () => void
): Promise<SaveConfigsResult> {
  const snapshot = store.snapshot();
  if (!plan.stage()) return unappliedSaveResult(true, plan.results);

  const progress: ApplyProgress = {};
  let outcome: ApplyOutcome;
  try {
    await store.save();
    outcome = await plan.apply(progress);
  } catch (error) {
    store.restore(snapshot);
    try {
      if (plan.onRollbackSaveError) await store.save().catch(plan.onRollbackSaveError);
      else await store.save();
    } finally {
      // The services must leave the rejected candidate even when config.json cannot be restored;
      // a file error is still thrown afterwards.
      await plan.rollback();
    }
    const failedService = progress.applying ?? plan.fallbackFailedService?.();
    const failed = plan.results.find(result => result.service === failedService);
    if (failed) {
      failed.success = false;
      failed.message = errorMessage(error);
    }
    return unappliedSaveResult(false, plan.results);
  }

  notifyChanges();
  return { success: true, services: plan.results, ...outcome };
}
