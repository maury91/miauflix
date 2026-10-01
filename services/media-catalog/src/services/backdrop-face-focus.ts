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

export interface BackdropObjectBox {
  label: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackdropFaceAnalysis {
  width: number;
  height: number;
  faces: FaceBox[];
  objects: BackdropObjectBox[];
  subjectFocus: BackdropFocus | null;
  focus: BackdropFocus | null;
}

export interface BackdropObjectAnalysis {
  width: number;
  height: number;
  objects: BackdropObjectBox[];
  focus: BackdropFocus | null;
}

export type BackdropFaceFocusDetector = (image: Buffer) => Promise<BackdropFocus | null>;

const MIN_FACE_CONFIDENCE = 0.5;
const ANIMAL_FACE_CONFIDENCE = 0.2;
const MIN_PERSON_CONFIDENCE = 0.3;
const MIN_FACE_ASPECT_RATIO = 0.65;
const MAX_FACE_ASPECT_RATIO = 1.5;
const MAX_FACE_SIZE_RATIO = 0.135;

/**
 * Returns the center of the accepted faces' bounding rectangle, normalized to [0, 1].
 * Boxes and image dimensions are in pixels. Boxes are clipped to the image; invalid or
 * empty boxes and supplied scores below the minimum confidence are ignored.
 * Returns null for non-positive or non-finite image dimensions or no accepted faces.
 */
export function getFaceGroupFocus(
  faces: readonly FaceBox[],
  imageWidth: number,
  imageHeight: number,
  minimumConfidence = MIN_FACE_CONFIDENCE
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
      (face.score !== undefined && (!Number.isFinite(face.score) || face.score < minimumConfidence))
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

/** Prominent faces define the anchor; bodies fill gaps when a subject's face is missed. */
export function getSubjectFocus(
  faces: readonly FaceBox[],
  objects: readonly BackdropObjectBox[],
  imageWidth: number,
  imageHeight: number
): BackdropFocus | null {
  if (
    !Number.isFinite(imageWidth) ||
    imageWidth <= 0 ||
    !Number.isFinite(imageHeight) ||
    imageHeight <= 0
  )
    return null;
  const anchors: { x: number; y: number; weight: number }[] = [];
  for (const face of faces) {
    const center = getFaceGroupFocus([face], imageWidth, imageHeight, ANIMAL_FACE_CONFIDENCE);
    if (!center) continue;
    const width = Math.min(imageWidth, face.x + face.width) - Math.max(0, face.x);
    const height = Math.min(imageHeight, face.y + face.height) - Math.max(0, face.y);
    anchors.push({ ...center, weight: Math.sqrt(width * height) * (face.score ?? 1) });
  }
  for (const object of objects) {
    const center = getObjectGroupFocus([object], imageWidth, imageHeight);
    if (!center) continue;
    const matched = faces.some(face => {
      const point = getFaceGroupFocus([face], imageWidth, imageHeight, ANIMAL_FACE_CONFIDENCE);
      return (
        point &&
        point.x * imageWidth >= object.x &&
        point.x * imageWidth <= object.x + object.width &&
        point.y * imageHeight >= object.y &&
        point.y * imageHeight <= object.y + object.height
      );
    });
    if (matched) continue;
    const width = Math.min(imageWidth, object.x + object.width) - Math.max(0, object.x);
    const height = Math.min(imageHeight, object.y + object.height) - Math.max(0, object.y);
    // Estimate head scale from visible body size; unmatched bodies are less reliable than faces.
    anchors.push({ ...center, weight: Math.sqrt(width * height) * 0.18 * object.score });
  }
  if (!anchors.length) return null;
  const total = anchors.reduce((sum, point) => sum + point.weight, 0);
  return {
    x: anchors.reduce((sum, point) => sum + point.x * point.weight, 0) / total,
    y: anchors.reduce((sum, point) => sum + point.y * point.weight, 0) / total,
  };
}

// Human shares model state internally. Serialize whole analyses, including initialization
// and crop passes, so unrelated concurrent catalog requests cannot mix detector state.
let detectionQueue: Promise<unknown> = Promise.resolve();
function serializeDetection<T>(work: () => Promise<T>): Promise<T> {
  const result = detectionQueue.then(work);
  detectionQueue = result.catch(() => undefined);
  return result;
}

interface HumanTensor {
  shape: number[];
}

interface HumanFace {
  box?: unknown;
  boxScore?: unknown;
}

interface HumanObject {
  label?: unknown;
  score?: unknown;
  box?: unknown;
}

interface HumanRuntime {
  tf: {
    tensor3d(data: Uint8Array, shape: [number, number, number], dtype: 'int32'): HumanTensor;
    dispose(tensor: HumanTensor): void;
  };
  init(): Promise<unknown>;
  load(): Promise<unknown>;
  detect(
    tensor: HumanTensor,
    config?: Record<string, unknown>
  ): Promise<{ face?: HumanFace[]; object?: HumanObject[] }>;
}

interface HumanConstructor {
  new (config: Record<string, unknown>): HumanRuntime;
}

type HumanMode = 'combined' | 'object';
const humanPromises = new Map<HumanMode, Promise<HumanRuntime | null>>();

/** Converts a directory path to a file URL with a trailing slash for resolving assets. */
function directoryUrl(directory: string): string {
  return pathToFileURL(directory.endsWith('/') ? directory : `${directory}/`).toString();
}

/** Resolves a bundled asset directory relative to this module, independent of the working directory. */
function bundledDirectory(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

/**
 * Loads the requested detector from bundled assets or the configured model and WASM directories.
 * Temporarily enables file URL reads through global fetch, restoring it after initialization.
 * Initialization and model-loading failures return null; earlier configuration errors propagate.
 */
async function loadHuman(mode: HumanMode): Promise<HumanRuntime | null> {
  const modelDirectory =
    process.env.BACKDROP_FOCUS_MODEL_DIR ??
    bundledDirectory('../../../../node_modules/@vladmandic/human/models/');
  const wasmDirectory =
    process.env.BACKDROP_FOCUS_WASM_DIR ??
    bundledDirectory('../../../../node_modules/@tensorflow/tfjs-backend-wasm/dist/');
  const human = new (HumanClass as unknown as HumanConstructor)({
    backend: 'wasm',
    // Face and object models share the WASM tensor pipeline; serializing them avoids
    // nondeterministic face results when the two models run concurrently.
    async: false,
    cacheSensitivity: 0,
    skipAllowed: false,
    wasmPath: directoryUrl(wasmDirectory),
    modelBasePath: directoryUrl(modelDirectory),
    face: {
      enabled: mode !== 'object',
      detector: {
        enabled: mode !== 'object',
        modelPath: 'blazeface.json',
        maxDetected: 30,
        skipFrames: 0,
        skipTime: 0,
        // Keep lower-confidence candidates available for stylized animal faces. They are
        // accepted only when the scene also contains a confident person-shaped object.
        minConfidence: ANIMAL_FACE_CONFIDENCE,
        rotation: false,
      },
      mesh: { enabled: false },
      iris: { enabled: false },
      description: { enabled: false },
      emotion: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: {
      enabled: true,
      modelPath: 'centernet.json',
      maxDetected: 10,
      minConfidence: MIN_PERSON_CONFIDENCE,
    },
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

/** Shares in-flight detector initialization and retains only successful runtimes for reuse. */
async function getHuman(mode: HumanMode): Promise<HumanRuntime | null> {
  const existing = humanPromises.get(mode);
  if (existing) return existing;
  const promise = loadHuman(mode)
    .catch(() => null)
    .then(human => {
      if (!human) humanPromises.delete(mode);
      return human;
    });
  humanPromises.set(mode, promise);
  return promise;
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

const OBJECT_FOCUS_LABELS = new Set([
  'person',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
]);
const OBJECT_HEAD_POSITION = 0.18;

function readObjectBox(object: HumanObject): BackdropObjectBox | null {
  if (
    typeof object.label !== 'string' ||
    !OBJECT_FOCUS_LABELS.has(object.label) ||
    !Array.isArray(object.box) ||
    object.box.length !== 4 ||
    typeof object.score !== 'number' ||
    !Number.isFinite(object.score)
  )
    return null;
  const values = object.box.map(value => (typeof value === 'number' ? value : Number.NaN));
  if (values.some(value => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { label: object.label, score: object.score, x, y, width, height };
}

/**
 * Estimates a group focus from detected subject boxes when no face box is available.
 * The point for each subject is near the top-center of its box, where a head usually sits.
 */
export function getObjectGroupFocus(
  objects: readonly BackdropObjectBox[],
  imageWidth: number,
  imageHeight: number,
  minimumConfidence = MIN_PERSON_CONFIDENCE
): BackdropFocus | null {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) return null;
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) return null;

  let left = imageWidth;
  let top = imageHeight;
  let right = 0;
  let bottom = 0;
  let accepted = 0;

  for (const object of objects) {
    if (
      !OBJECT_FOCUS_LABELS.has(object.label) ||
      !Number.isFinite(object.score) ||
      object.score < minimumConfidence ||
      !Number.isFinite(object.x) ||
      !Number.isFinite(object.y) ||
      !Number.isFinite(object.width) ||
      !Number.isFinite(object.height) ||
      object.width <= 0 ||
      object.height <= 0
    )
      continue;

    const objectLeft = Math.max(0, Math.min(imageWidth, object.x));
    const objectTop = Math.max(0, Math.min(imageHeight, object.y));
    const objectRight = Math.max(0, Math.min(imageWidth, object.x + object.width));
    const objectBottom = Math.max(0, Math.min(imageHeight, object.y + object.height));
    if (objectRight <= objectLeft || objectBottom <= objectTop) continue;

    const headY = objectTop + (objectBottom - objectTop) * OBJECT_HEAD_POSITION;
    left = Math.min(left, (objectLeft + objectRight) / 2);
    right = Math.max(right, (objectLeft + objectRight) / 2);
    top = Math.min(top, headY);
    bottom = Math.max(bottom, headY);
    accepted++;
  }

  if (accepted === 0) return null;
  return {
    x: (left + right) / 2 / imageWidth,
    y: (top + bottom) / 2 / imageHeight,
  };
}

function hasConfidentPerson(objects: readonly HumanObject[] | undefined): boolean {
  return (objects ?? []).some(
    object =>
      object.label === 'person' &&
      typeof object.score === 'number' &&
      Number.isFinite(object.score) &&
      object.score >= MIN_PERSON_CONFIDENCE
  );
}

function isFaceCandidate(face: FaceBox, imageWidth: number, imageHeight: number): boolean {
  if (
    face.score !== undefined &&
    (!Number.isFinite(face.score) || face.score < ANIMAL_FACE_CONFIDENCE)
  )
    return false;
  const aspectRatio = face.width / face.height;
  return (
    aspectRatio >= MIN_FACE_ASPECT_RATIO &&
    aspectRatio <= MAX_FACE_ASPECT_RATIO &&
    face.width <= imageWidth * MAX_FACE_SIZE_RATIO &&
    face.height <= imageHeight * MAX_FACE_SIZE_RATIO
  );
}

/**
 * Accepts BlazeFace candidates in a person-shaped scene so stylized animal faces can use its
 * lower-confidence detections. Scenes without that signal keep the stricter human-face threshold.
 */
function selectFaceBoxes(
  faces: readonly FaceBox[],
  objects: readonly HumanObject[] | undefined,
  imageWidth: number,
  imageHeight: number
) {
  if (hasConfidentPerson(objects))
    return faces.filter(
      face =>
        (face.score !== undefined && face.score >= MIN_FACE_CONFIDENCE) ||
        (isFaceCandidate(face, imageWidth, imageHeight) &&
          (objects ?? []).some(object => {
            const box = readObjectBox(object);
            return (
              box?.label === 'person' &&
              box.score >= MIN_PERSON_CONFIDENCE &&
              face.x + face.width / 2 >= box.x &&
              face.x + face.width / 2 <= box.x + box.width &&
              face.y + face.height / 2 >= box.y &&
              face.y + face.height / 2 <= box.y + box.height * 0.5
            );
          }))
    );
  return faces.filter(face => face.score === undefined || face.score >= MIN_FACE_CONFIDENCE);
}

/**
 * Finds the normalized face-group center in the image bytes after applying image orientation.
 * Returns null if detector initialization fails or no faces are accepted. Image decoding,
 * tensor creation, and detection errors propagate; the detection tensor is disposed afterward.
 */
async function analyzeFaces(image: Buffer): Promise<BackdropFaceAnalysis | null> {
  const human = await getHuman('combined');
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
    const result = await human.detect(tensor, { object: { enabled: true } });
    const detectedFaces = (result.face ?? []).flatMap(face => {
      const box = readFaceBox(face);
      return box ? [box] : [];
    });
    const objects = (result.object ?? []).flatMap(object => {
      const box = readObjectBox(object);
      return box ? [box] : [];
    });
    // BlazeFace's fixed 256px input loses small faces in wide backdrops. Re-run on
    // upper-body crops for up to four prominent people whose faces were not found.
    const people = objects
      .filter(
        object =>
          object.label === 'person' &&
          !detectedFaces.some(
            face =>
              (face.score ?? 0) >= MIN_FACE_CONFIDENCE &&
              face.x + face.width / 2 >= object.x &&
              face.x + face.width / 2 <= object.x + object.width &&
              face.y + face.height / 2 >= object.y &&
              face.y + face.height / 2 <= object.y + object.height * 0.5
          )
      )
      .sort((a, b) => b.width * b.height * b.score - a.width * a.height * a.score)
      .slice(0, 4);
    for (const person of people) {
      const left = Math.max(0, Math.floor(person.x - person.width * 0.15));
      const top = Math.max(0, Math.floor(person.y - person.height * 0.05));
      const width = Math.min(info.width - left, Math.ceil(person.width * 1.3));
      const height = Math.min(info.height - top, Math.ceil(person.height * 0.6));
      if (width <= 0 || height <= 0) continue;
      const crop = await sharp(image)
        .rotate()
        .extract({ left, top, width, height })
        .toColourspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const cropTensor = human.tf.tensor3d(
        new Uint8Array(crop.data),
        [crop.info.height, crop.info.width, crop.info.channels],
        'int32'
      );
      try {
        const cropResult = await human.detect(cropTensor, { object: { enabled: false } });
        for (const detected of cropResult.face ?? []) {
          const box = readFaceBox(detected);
          if (!box || (box.score ?? 0) < MIN_FACE_CONFIDENCE) continue;
          const translated = { ...box, x: box.x + left, y: box.y + top };
          const duplicate = detectedFaces.findIndex(face => {
            const overlapWidth = Math.max(
              0,
              Math.min(face.x + face.width, translated.x + translated.width) -
                Math.max(face.x, translated.x)
            );
            const overlapHeight = Math.max(
              0,
              Math.min(face.y + face.height, translated.y + translated.height) -
                Math.max(face.y, translated.y)
            );
            return (
              overlapWidth * overlapHeight >
              0.5 * Math.min(face.width * face.height, translated.width * translated.height)
            );
          });
          if (duplicate < 0) detectedFaces.push(translated);
          else if ((translated.score ?? 0) > (detectedFaces[duplicate]!.score ?? 0))
            detectedFaces[duplicate] = translated;
        }
      } finally {
        human.tf.dispose(cropTensor);
      }
    }
    const faces = selectFaceBoxes(detectedFaces, result.object, info.width, info.height);
    return {
      width: info.width,
      height: info.height,
      faces,
      objects,
      subjectFocus: getSubjectFocus(faces, objects, info.width, info.height),
      focus: getFaceGroupFocus(faces, info.width, info.height, ANIMAL_FACE_CONFIDENCE),
    };
  } finally {
    human.tf.dispose(tensor);
  }
}

/**
 * Runs only the object detector and estimates focus from the head area of accepted subjects.
 * This is intentionally separate from face analysis so the two approaches can be compared on
 * the same fixtures without changing the face snapshots.
 */
async function analyzeObjects(image: Buffer): Promise<BackdropObjectAnalysis | null> {
  const human = await getHuman('object');
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
    const objects = (result.object ?? []).flatMap(object => {
      const box = readObjectBox(object);
      return box ? [box] : [];
    });
    return {
      width: info.width,
      height: info.height,
      objects,
      focus: getObjectGroupFocus(objects, info.width, info.height),
    };
  } finally {
    human.tf.dispose(tensor);
  }
}

export async function detectBackdropFaceFocus(image: Buffer): Promise<BackdropFocus | null> {
  return (await analyzeBackdropFaces(image))?.focus ?? null;
}

export async function detectBackdropObjectFocus(image: Buffer): Promise<BackdropFocus | null> {
  return (await analyzeBackdropObjects(image))?.focus ?? null;
}

export function analyzeBackdropFaces(image: Buffer): Promise<BackdropFaceAnalysis | null> {
  return serializeDetection(() => analyzeFaces(image));
}

export function analyzeBackdropObjects(image: Buffer): Promise<BackdropObjectAnalysis | null> {
  return serializeDetection(() => analyzeObjects(image));
}

export async function detectBackdropSubjectFocus(image: Buffer): Promise<BackdropFocus | null> {
  return (await analyzeBackdropFaces(image))?.subjectFocus ?? null;
}
