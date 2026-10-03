export const PRELOAD_CLIENT_ID =
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `miauflix-${Math.random().toString(36).slice(2)}`;

let sequence = 0;

export function nextPreloadSequence(): number {
  sequence += 1;
  return sequence;
}
