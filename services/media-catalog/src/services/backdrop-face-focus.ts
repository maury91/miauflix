import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { BackdropFocus } from '@miauflix/service-contracts';
import sharp from 'sharp';

// The package's export map does not expose the WASM Node entry to TypeScript,
// but this is the self-contained runtime that avoids requiring tfjs-node.
import { Human as HumanClass } from '../../../../node_modules/@vladmandic/human/dist/human.node-wasm.js';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score?: number;
}

export type BackdropFaceFocusDetector = (image: Buffer) => Promise<BackdropFocus | null>;

const MIN_FACE_CONFIDENCE = 0.5;

/**
 * Returns the center of the accepted faces' bounding rectangle, normalized to [0, 1].
 * Boxes and image dimensions are in pixels. Boxes are clipped to the image; invalid or
 * empty boxes and supplied scores below 0.5 or non-finite scores are ignored.
 * Returns null for non-positive or non-finite image dimensions or no accepted faces.
 */
export function getFaceGroupFocus(
  faces: readonly FaceBox[],
  imageWidth: number,
  imageHeight: number
): BackdropFocus | null {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) return null;
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) return null;

  let left = imageWidth;
  let top = imageHeight;
  let right = 0;
  let bottom = 0;
  let accepted = 0;

  for (const face of faces) {
    if (
      !Number.isFinite(face.x) ||
      !Number.isFinite(face.y) ||
      !Number.isFinite(face.width) ||
      !Number.isFinite(face.height) ||
      face.width <= 0 ||
      face.height <= 0 ||
      (face.score !== undefined &&
        (!Number.isFinite(face.score) || face.score < MIN_FACE_CONFIDENCE))
    )
      continue;

    const faceLeft = Math.max(0, Math.min(imageWidth, face.x));
    const faceTop = Math.max(0, Math.min(imageHeight, face.y));
    const faceRight = Math.max(faceLeft, Math.min(imageWidth, face.x + face.width));
    const faceBottom = Math.max(faceTop, Math.min(imageHeight, face.y + face.height));
    if (faceRight <= faceLeft || faceBottom <= faceTop) continue;

    left = Math.min(left, faceLeft);
    top = Math.min(top, faceTop);
    right = Math.max(right, faceRight);
    bottom = Math.max(bottom, faceBottom);
    accepted++;
  }

  if (accepted === 0) return null;
  return {
    x: (left + right) / 2 / imageWidth,
    y: (top + bottom) / 2 / imageHeight,
  };
}

interface HumanTensor {
  shape: number[];
}

interface HumanFace {
  box?: unknown;
  boxScore?: unknown;
}

interface HumanRuntime {
  tf: {
    tensor3d(data: Uint8Array, shape: [number, number, number], dtype: 'int32'): HumanTensor;
    dispose(tensor: HumanTensor): void;
  };
  init(): Promise<unknown>;
  load(): Promise<unknown>;
  detect(tensor: HumanTensor): Promise<{ face?: HumanFace[] }>;
}

interface HumanConstructor {
  new (config: Record<string, unknown>): HumanRuntime;
}

let humanPromise: Promise<HumanRuntime | null> | undefined;

/** Converts a directory path to a file URL with a trailing slash for resolving assets. */
function directoryUrl(directory: string): string {
  return pathToFileURL(directory.endsWith('/') ? directory : `${directory}/`).toString();
}

/** Resolves a bundled asset directory relative to this module, independent of the working directory. */
function bundledDirectory(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

/**
 * Loads the face detector from bundled assets or the configured model and WASM directories.
 * Temporarily enables file URL reads through global fetch, restoring it after initialization.
 * Initialization and model-loading failures return null; earlier configuration errors propagate.
 */
async function loadHuman(): Promise<HumanRuntime | null> {
  const modelDirectory =
    process.env.BACKDROP_FOCUS_MODEL_DIR ??
    bundledDirectory('../../../../node_modules/@vladmandic/human/models/');
  const wasmDirectory =
    process.env.BACKDROP_FOCUS_WASM_DIR ??
    bundledDirectory('../../../../node_modules/@tensorflow/tfjs-backend-wasm/dist/');
  const human = new (HumanClass as unknown as HumanConstructor)({
    backend: 'wasm',
    wasmPath: directoryUrl(wasmDirectory),
    modelBasePath: directoryUrl(modelDirectory),
    face: {
      enabled: true,
      detector: {
        enabled: true,
        modelPath: 'blazeface.json',
        maxDetected: 10,
        minConfidence: MIN_FACE_CONFIDENCE,
        rotation: false,
      },
      mesh: { enabled: false },
      iris: { enabled: false },
      description: { enabled: false },
      emotion: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
  });

  // Human uses fetch for local model files. Node and Bun do not provide a
  // file:// fetch implementation, so adapt only the duration of initialization.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith('file://')) {
      return new Response(await readFile(fileURLToPath(url)), { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await human.init();
    await human.load();
    return human;
  } catch {
    return null;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** Shares one detector initialization, caching null on failure without retrying. */
async function getHuman(): Promise<HumanRuntime | null> {
  humanPromise ??= loadHuman().catch(() => null);
  return humanPromise;
}

/** Reads a four-number finite box, or returns null; size and confidence filtering happen later. */
function readFaceBox(face: HumanFace): FaceBox | null {
  if (!Array.isArray(face.box) || face.box.length !== 4) return null;
  const values = face.box.map(value => (typeof value === 'number' ? value : Number.NaN));
  if (values.some(value => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  const score = typeof face.boxScore === 'number' ? face.boxScore : undefined;
  return { x, y, width, height, score };
}

/**
 * Finds the normalized face-group center in the image bytes after applying image orientation.
 * Returns null if detector initialization fails or no faces are accepted. Image decoding,
 * tensor creation, and detection errors propagate; the detection tensor is disposed afterward.
 */
export async function detectBackdropFaceFocus(image: Buffer): Promise<BackdropFocus | null> {
  const human = await getHuman();
  if (!human) return null;

  const { data, info } = await sharp(image)
    .rotate()
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tensor = human.tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels],
    'int32'
  );
  try {
    const result = await human.detect(tensor);
    const faces = (result.face ?? []).flatMap(face => {
      const box = readFaceBox(face);
      return box ? [box] : [];
    });
    return getFaceGroupFocus(faces, info.width, info.height);
  } finally {
    human.tf.dispose(tensor);
  }
}
