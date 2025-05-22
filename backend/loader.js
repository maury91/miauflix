import { createEsmHooks, register } from 'ts-node';
import * as tsConfigPaths from 'tsconfig-paths';
import { pathToFileURL } from 'url';

const {
  resolve: resolveTs,
  load,
  transformSource,
} = createEsmHooks(
  register({
    cwd: import.meta.dirname,
  })
);

const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig(import.meta.dirname);
const matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);

export function resolve(specifier, ctx, defaultResolve) {
  const match = matchPath(specifier);
  return match
    ? resolveTs(pathToFileURL(`${match}`).href, ctx, defaultResolve)
    : resolveTs(specifier, ctx, defaultResolve);
}

export { load, transformSource };
