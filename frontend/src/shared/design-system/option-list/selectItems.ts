/** One choice of a Select or OptionList. */
export interface SelectOption<Value extends string = string> {
  value: Value;
  /** Visible text; comes from the feature (i18n). */
  label: string;
  disabled?: boolean;
}

/** Choices under a heading, e.g. "Original" and "Dubbed" audio tracks. */
export interface SelectOptionGroup<Value extends string = string> {
  label: string;
  options: readonly SelectOption<Value>[];
}

export type SelectItems<Value extends string = string> = readonly (
  | SelectOption<Value>
  | SelectOptionGroup<Value>
)[];

export const isGroup = <Value extends string>(
  item: SelectOption<Value> | SelectOptionGroup<Value>
): item is SelectOptionGroup<Value> => 'options' in item;

/** All options in order, groups flattened. */
export function flattenOptions<Value extends string>(
  items: SelectItems<Value>
): SelectOption<Value>[] {
  return items.flatMap(item => (isGroup(item) ? item.options : [item]));
}

/** The next enabled option from `current` in `step` direction, clamped at the ends. */
export function stepOption<Value extends string>(
  options: readonly SelectOption<Value>[],
  current: Value | null,
  step: 1 | -1
): Value | null {
  const enabled = options.filter(option => !option.disabled);
  if (enabled.length === 0) return null;
  const index = enabled.findIndex(option => option.value === current);
  if (index === -1) return enabled[0].value;
  return enabled[Math.min(enabled.length - 1, Math.max(0, index + step))].value;
}
