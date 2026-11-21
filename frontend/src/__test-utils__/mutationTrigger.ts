import { fn } from 'storybook/test';

/**
 * A story's stand-in for an RTK Query mutation trigger, resolving to what `resolve` returns for
 * the call's argument: like the real one it resolves to `{ data }`, and its `unwrap()` to the data
 * itself, so pages that read either see the result.
 */
export const mutationTriggerFrom = <Arg>(resolve: (arg: Arg) => unknown) =>
  fn((arg: Arg) => {
    const result = resolve(arg);
    return Object.assign(Promise.resolve({ data: result }), {
      unwrap: () => Promise.resolve(result),
    });
  });

/** A mutation trigger that always resolves to `result`. */
export const mutationTrigger = (result: unknown = undefined) => mutationTriggerFrom(() => result);
