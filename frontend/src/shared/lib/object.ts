export const typedEntries = <T extends Record<string, unknown>>(
  obj: T
): [keyof T, T[keyof T]][] => {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
};

export const mapObject = <T extends Record<string, unknown>, R>(
  obj: T,
  fn: (key: keyof T, value: T[keyof T], obj: T) => R
): Record<keyof T, R> => {
  return Object.fromEntries(
    typedEntries(obj).map(([key, value]) => [key, fn(key, value, obj)])
  ) as Record<keyof T, R>;
};
