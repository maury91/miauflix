import type { Entries } from 'type-fest';

export function objectEntries<O extends object>(object: O): Entries<O> {
  return Object.entries(object) as Entries<O>;
}

export function objectFromEntries<K extends PropertyKey, V>(
  entries: Iterable<readonly [K, V]>
): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

export function objectKeys<O extends object>(object: O): Entries<O>[number][0][] {
  return Object.keys(object) as (keyof O)[];
}

export function hasKey<O extends object>(object: O, key: PropertyKey): key is keyof O {
  return key in object;
}
