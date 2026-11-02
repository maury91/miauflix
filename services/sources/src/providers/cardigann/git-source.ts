import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { IndexEntry } from './definition-store';

export interface GitSpec {
  url: string;
  ref: string;
  /** Folder of the definitions inside the repository, without leading or trailing slash. */
  path: string;
}
export type GitUrlFor = (owner: string, repo: string) => string;

const GIT_TIMEOUT_MS = 180_000;
const MAX_DEFINITION_BYTES = 512 * 1024;

/** `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` as a clone spec; else null. */
export function gitSpecFor(
  base: string,
  urlFor: GitUrlFor = (owner, repo) => `https://github.com/${owner}/${repo}.git`
): GitSpec | null {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+?)\/?$/.exec(
    base
  );
  if (!match) return null;
  const [, owner, repo, ref, path] = match;
  return { url: urlFor(owner, repo), ref, path };
}

/**
 * A sparse, shallow, blob-less clone of the definitions folder. One fetch tells which files
 * changed (their blob shas) and one checkout downloads only the changed ones in a single pack,
 * where a request per file takes minutes over a VPN.
 */
export class GitSource {
  constructor(private dir: string) {}

  private git(args: string[], signal: AbortSignal, cwd = this.dir): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        // Ownership of the data volume can differ from the user running the service.
        ['-c', 'safe.directory=*', ...args],
        {
          cwd,
          signal,
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: 32 * 1024 * 1024,
          env: {
            PATH: process.env.PATH ?? '',
            HOME: this.dir,
            GIT_TERMINAL_PROMPT: '0',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_SYSTEM: '/dev/null',
            LANG: 'C',
          },
        },
        (error, stdout, stderr) =>
          error
            ? reject(
                new Error(
                  `git ${args[0]} failed: ${(stderr || error.message).trim().slice(0, 300)}`
                )
              )
            : resolve(stdout)
      );
    });
  }

  private async currentUrl(signal: AbortSignal): Promise<string | null> {
    if (!existsSync(join(this.dir, '.git'))) return null;
    try {
      return (await this.git(['remote', 'get-url', 'origin'], signal)).trim();
    } catch {
      return null;
    }
  }

  /** Brings the clone up to date and lists the definition files with their blob shas. */
  async sync(spec: GitSpec, signal: AbortSignal): Promise<{ sha: string; entries: IndexEntry[] }> {
    if ((await this.currentUrl(signal)) !== spec.url) {
      // A new source (or a damaged clone): start over rather than mixing histories.
      rmSync(this.dir, { recursive: true, force: true });
      try {
        await this.git(
          [
            'clone',
            '--quiet',
            '--depth=1',
            '--filter=blob:none',
            '--no-checkout',
            '--sparse',
            `--branch=${spec.ref}`,
            spec.url,
            this.dir,
          ],
          signal,
          process.cwd()
        );
      } catch (error) {
        rmSync(this.dir, { recursive: true, force: true });
        throw error;
      }
    }
    await this.git(['sparse-checkout', 'set', '--no-cone', `/${spec.path}/`], signal);
    await this.git(
      ['fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', spec.ref],
      signal
    );
    // Checking out downloads the blobs the working tree lacks, all in one request.
    await this.git(['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], signal);
    const sha = (await this.git(['rev-parse', `FETCH_HEAD:${spec.path}`], signal)).trim();
    const listing = await this.git(['ls-tree', '-r', 'FETCH_HEAD', '--', `${spec.path}/`], signal);
    const entries: IndexEntry[] = [];
    for (const line of listing.split('\n')) {
      const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
      const name = match?.[2].slice(spec.path.length + 1);
      if (match && name?.endsWith('.yml') && !name.includes('/'))
        entries.push({ id: name.slice(0, -4), sha: match[1] });
    }
    return { sha, entries };
  }

  /** A definition from the working tree, or null when it is not there. */
  read(spec: GitSpec, id: string): string | null {
    const file = join(this.dir, spec.path, `${id}.yml`);
    try {
      if (!existsSync(file) || statSync(file).size > MAX_DEFINITION_BYTES) return null;
      return readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  }
}
