import { Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { quietPixiGlWarnings } from './pixiWorkarounds';

/** The parts of Pixi's WebGL renderer the workarounds touch. */
function fakePixi() {
  const textureA = { source: { id: 'a' } };
  const textureB = { source: { id: 'b' } };
  const texture = {
    _boundTextures: [textureA.source, textureB.source, Texture.EMPTY.source] as unknown[],
    bind: vi.fn((tex: { source: unknown }, unit: number) => {
      texture._boundTextures[unit] = tex.source;
    }),
    unbind(tex: { source: unknown }) {
      texture._boundTextures = texture._boundTextures.map(source =>
        source === tex.source ? null : source
      );
    },
  };
  const deleteVertexArray = vi.fn();
  const gl = { deleteVertexArray };
  const pixi = { texture, gl } as unknown as WebGLRenderer;
  return { pixi, texture, gl, deleteVertexArray, textureA, textureB };
}

describe('quietPixiGlWarnings', () => {
  it('binds the empty texture to the unit a freed texture leaves empty', () => {
    const { pixi, texture, textureA, textureB } = fakePixi();
    quietPixiGlWarnings(pixi);

    texture.unbind(textureB);

    expect(texture._boundTextures).toEqual([
      textureA.source,
      Texture.EMPTY.source,
      Texture.EMPTY.source,
    ]);
    expect(texture.bind).toHaveBeenCalledTimes(1);
    expect(texture.bind).toHaveBeenCalledWith(Texture.EMPTY, 1);
  });

  it('deletes a vertex array once, however often Pixi deletes it', () => {
    const { pixi, gl, deleteVertexArray } = fakePixi();
    quietPixiGlWarnings(pixi);
    const vao = {};

    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(null);

    expect(deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(deleteVertexArray).toHaveBeenCalledWith(vao);
  });

  it('patches again only what Pixi replaced on a context change', () => {
    const { pixi, gl, texture } = fakePixi();
    quietPixiGlWarnings(pixi);
    const patchedUnbind = texture.unbind;
    const replaced = vi.fn();
    gl.deleteVertexArray = replaced;

    quietPixiGlWarnings(pixi);
    const vao = {};
    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(vao);

    expect(texture.unbind).toBe(patchedUnbind);
    expect(replaced).toHaveBeenCalledTimes(1);
  });
});
