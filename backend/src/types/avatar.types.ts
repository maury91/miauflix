/**
 * A profile's Plushie look, stored as given by the frontend editor.
 *
 * Option names follow the `plushies` package (`kind`, `fabric`, `eyes`, ...). The server only
 * checks their shape, so new library options do not need a backend release.
 */
export type AvatarLook = Record<string, boolean | number | string>;
