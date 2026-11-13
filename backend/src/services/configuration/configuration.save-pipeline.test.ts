import { saveAndApply, type SavePlan, unappliedActionResult } from './configuration.save-pipeline';
import { ConfigurationStore } from './configuration.store';
import type { ConfigServiceActionResult, VariableName } from './configuration.types';

const KEY = 'CATALOG_SERVICE_URL' as VariableName;

const makeStore = () => {
  const store = new ConfigurationStore(new Map(), new Set());
  store.raw.set(KEY, 'before');
  const save = jest.spyOn(store, 'save').mockResolvedValue(undefined);
  return { store, save };
};

const liveResult = (service: string): ConfigServiceActionResult => ({
  service,
  success: true,
  testMode: 'live',
  message: `${service} ok`,
});

const makePlan = (store: ConfigurationStore, overrides: Partial<SavePlan> = {}): SavePlan => ({
  results: [liveResult('CATALOG'), liveResult('LIST')],
  stage: () => {
    store.raw.set(KEY, 'after');
    return true;
  },
  apply: jest.fn().mockResolvedValue({
    restarted: ['CATALOG'],
    needsProcessRestart: [],
    changed: ['CATALOG'],
    recovered: [],
  }),
  rollback: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('unappliedActionResult', () => {
  it('returns a test-shaped result when not saving', () => {
    expect(unappliedActionResult(false, true, [])).toEqual({ success: true, services: [] });
  });

  it('returns a save-shaped result with nothing applied when saving', () => {
    expect(unappliedActionResult(true, false, [])).toEqual({
      success: false,
      services: [],
      restarted: [],
      needsProcessRestart: [],
      changed: [],
      recovered: [],
    });
  });
});

describe('saveAndApply', () => {
  it('saves, applies and notifies on success', async () => {
    const { store, save } = makeStore();
    const notify = jest.fn();
    const plan = makePlan(store);

    const result = await saveAndApply(store, plan, notify);

    expect(result).toEqual({
      success: true,
      services: plan.results,
      restarted: ['CATALOG'],
      needsProcessRestart: [],
      changed: ['CATALOG'],
      recovered: [],
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.raw.get(KEY)).toBe('after');
  });

  it('does nothing more when staging reports no change', async () => {
    const { store, save } = makeStore();
    const notify = jest.fn();
    const plan = makePlan(store, { stage: () => false });

    const result = await saveAndApply(store, plan, notify);

    expect(result.success).toBe(true);
    expect(result.changed).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(plan.apply).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('restores the store, rolls back and blames the service being applied', async () => {
    const { store, save } = makeStore();
    const notify = jest.fn();
    const plan = makePlan(store, {
      apply: async progress => {
        progress.applying = 'LIST';
        throw new Error('LIST rejected');
      },
    });

    const result = await saveAndApply(store, plan, notify);

    expect(result.success).toBe(false);
    expect(result.restarted).toEqual([]);
    expect(store.raw.get(KEY)).toBe('before');
    expect(save).toHaveBeenCalledTimes(2);
    expect(plan.rollback).toHaveBeenCalledTimes(1);
    expect(result.services).toEqual([
      liveResult('CATALOG'),
      { service: 'LIST', success: false, testMode: 'live', message: 'LIST rejected' },
    ]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps the rollback notes added to the failed service', async () => {
    const { store } = makeStore();
    const plan: SavePlan = makePlan(store, {
      apply: async progress => {
        progress.applying = 'LIST';
        throw new Error('LIST rejected');
      },
      rollback: async () => {
        const list = plan.results.find(item => item.service === 'LIST')!;
        list.message = `${list.message}; rollback failed`;
      },
    });

    const result = await saveAndApply(store, plan, jest.fn());

    expect(result.services[1].message).toBe('LIST rejected; rollback failed');
  });

  it('blames the fallback service when the failure happens before applying one', async () => {
    const { store, save } = makeStore();
    save.mockRejectedValueOnce(new Error('disk full'));
    const plan = makePlan(store, { fallbackFailedService: () => 'CATALOG' });

    const result = await saveAndApply(store, plan, jest.fn());

    expect(result.services[0]).toMatchObject({
      service: 'CATALOG',
      success: false,
      message: 'disk full',
    });
    expect(plan.apply).not.toHaveBeenCalled();
  });

  it('continues rolling back when onRollbackSaveError handles a failed file restore', async () => {
    const { store, save } = makeStore();
    save.mockRejectedValue(new Error('disk full'));
    const onRollbackSaveError = jest.fn();
    const plan = makePlan(store, { onRollbackSaveError });

    const result = await saveAndApply(store, plan, jest.fn());

    expect(result.success).toBe(false);
    expect(onRollbackSaveError).toHaveBeenCalledWith(expect.any(Error));
    expect(plan.rollback).toHaveBeenCalledTimes(1);
  });

  it('rolls back the services, then throws a failed file restore the plan does not handle', async () => {
    const { store, save } = makeStore();
    save.mockRejectedValue(new Error('disk full'));
    const plan = makePlan(store);

    await expect(saveAndApply(store, plan, jest.fn())).rejects.toThrow('disk full');
    expect(plan.rollback).toHaveBeenCalledTimes(1);
  });
});
