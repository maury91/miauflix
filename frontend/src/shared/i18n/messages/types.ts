/** A message whose wording depends on `count`: `one` for a single item, `other` otherwise. */
export interface PluralMessage {
  one: string;
  other: string;
}

/** One area's English messages; keys are `<area>.<name>`, `{name}` marks a placeholder. */
export type MessageSection = Record<string, string | PluralMessage>;

/** Another language's messages for a section: every key, each in the same shape. */
export type Translation<Section extends MessageSection> = {
  [Key in keyof Section]: Section[Key] extends string ? string : PluralMessage;
};
