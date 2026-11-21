/** A message whose wording depends on the locale's plural category for `count`. */
export type PluralMessage = Record<'one' | 'other', string> &
  Partial<Record<Intl.LDMLPluralRule, string>>;

/** One area's English messages; keys are `<area>.<name>`, `{name}` marks a placeholder. */
export type MessageSection = Record<string, string | PluralMessage>;

/** Another language's messages for a section: every key, each in the same shape. */
export type Translation<Section extends MessageSection> = {
  [Key in keyof Section]: Section[Key] extends string ? string : PluralMessage;
};
