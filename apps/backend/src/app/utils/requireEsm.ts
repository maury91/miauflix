/**
 * Workaround for Import ESM modules in plugin
 *
 * @see {@link https://github.com/nrwl/nx/issues/18974} related issue
 * @see {@link https://github.com/nrwl/nx/issues/15682} related issue
 * @see {@link https://gist.github.com/passbyval/b85f79381816c197c5c651b7c0b00d5e} for alternative approach
 *
 * @example
 * const { default: chalk } = await requireEsm<typeof import('chalk')>('chalk');
 */
export async function requireEsm<T>(module: string) {
  try {
    return await (Function(`return import("${module}")`)() as Promise<T>);
  } catch (e) {
    if (
      e instanceof TypeError &&
      'code' in e &&
      e.code === 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING'
    ) {
      console.error(
        [
          'Nx failed to import ESM module due to https://github.com/nrwl/nx/issues/18974',
          'Add DISABLE_V8_COMPILE_CACHE=1 to your .env',
        ].join('\n')
      );
    }
    throw e;
  }
}
