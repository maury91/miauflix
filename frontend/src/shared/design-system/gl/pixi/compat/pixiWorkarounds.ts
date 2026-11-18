import { Texture, type TextureSource, type WebGLRenderer } from 'pixi.js';

/**
 * Two Pixi (8.23) habits that flood the WebGL console with warnings on every load, without
 * changing what is drawn. Applied once Pixi is up, and again after a context restore (Pixi
 * re-creates its GL wrappers then).
 */
export function quietPixiGlWarnings(pixi: WebGLRenderer) {
  keepTextureUnitsBound(pixi);
  deleteVertexArraysOnce(pixi);
}

const PATCHED = Symbol('miauflix.pixiPatched');
type Patchable = { [PATCHED]?: true };

/**
 * Freeing a texture unbinds it, leaving its unit empty; the batch shader still declares a sampler
 * for every unit, and WebGL warns "there is no texture bound to the unit N" on each draw that uses
 * fewer textures. Pixi binds its empty texture to every unit at start; this puts it back.
 */
function keepTextureUnitsBound(pixi: WebGLRenderer) {
  const system = pixi.texture as WebGLRenderer['texture'] & Patchable;
  if (system[PATCHED]) return;
  system[PATCHED] = true;
  const unbind = system.unbind.bind(system);
  system.unbind = texture => {
    unbind(texture);
    const bound = (system as unknown as { _boundTextures?: (TextureSource | null)[] })
      ._boundTextures;
    bound?.forEach((source, unit) => {
      if (!source) system.bind(Texture.EMPTY, unit);
    });
  };
}

/**
 * A geometry's VAO is cached under both its program and its layout signature, and unloading the
 * geometry deletes every entry: the same VAO twice ("deleteVertexArray: no object or object
 * deleted"). Deleting it once is enough.
 */
function deleteVertexArraysOnce(pixi: WebGLRenderer) {
  const gl = pixi.gl as WebGL2RenderingContext;
  // Marked on the function: without WebGL2, Pixi assigns its own again on a context change
  if ((gl.deleteVertexArray as Patchable)[PATCHED]) return;
  const deleteVertexArray = gl.deleteVertexArray.bind(gl);
  const deleted = new WeakSet<WebGLVertexArrayObject>();
  const deleteOnce: typeof gl.deleteVertexArray & Patchable = vao => {
    if (!vao || deleted.has(vao)) return;
    deleted.add(vao);
    deleteVertexArray(vao);
  };
  deleteOnce[PATCHED] = true;
  gl.deleteVertexArray = deleteOnce;
}
