/** A picture's props: what a `*.art.ts` function draws from. */
export type ArtProps = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * A picture's key, generated from the typed props it draws from (every field, in a fixed order),
 * so a prop added to the art is part of the key without anyone listing it. Absent and undefined
 * fields are the same picture.
 *
 * Keys come from props rather than from recording the drawing: a picture is a pure function of
 * its props and the statuses of the images its props name, and the renderer re-bakes a picture
 * when one of those settles, so props are enough. A recording would also have to run the drawing
 * on every render, and couldn't see the branches a status hasn't taken yet.
 */
export function artKey(name: string, props: ArtProps): string {
  const fields = Object.keys(props)
    .filter(field => props[field] !== undefined)
    .sort()
    .map(field => `${field}=${JSON.stringify(props[field])}`);
  return `${name}{${fields.join(',')}}`;
}
