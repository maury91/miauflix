/** A definition uses something outside the supported Cardigann subset. */
export class UnsupportedFeature extends Error {
  constructor(feature: string) {
    super(`Unsupported Cardigann feature: ${feature}`);
  }
}
