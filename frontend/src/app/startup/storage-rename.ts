/**
 * Moves what was saved before the rename to Miauwatch (the `miauflix.` and `miauflix:` keys) to
 * the new keys, so the TV stays signed in and keeps its server, and preferences survive. Runs
 * before any module reads the storage; a key already saved under the new name wins.
 */
const LEGACY_PREFIX = /^miauflix([.:])/;

function moveLegacyKeys(storage: Storage): void {
  const legacyKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && LEGACY_PREFIX.test(key)) legacyKeys.push(key);
  }
  for (const key of legacyKeys) {
    const value = storage.getItem(key);
    const renamed = key.replace(LEGACY_PREFIX, 'miauwatch$1');
    if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
    storage.removeItem(key);
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    moveLegacyKeys(window[name]);
  } catch {
    // Storage disabled or full: the app starts with defaults, as it would anyway
  }
}
