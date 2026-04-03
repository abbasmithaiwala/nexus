/**
 * presenceWorker — runs MediaPipe Face Landmarker in a Web Worker.
 *
 * Design:
 *  - Receives ImageBitmap frames from the main thread (zero-copy transfer).
 *  - Runs face landmark detection at whatever rate frames arrive (caller controls via 2fps sampling).
 *  - Posts back a PresenceResult message after each frame.
 *  - Uses EAR (Eye Aspect Ratio) on the 6 eye contour landmarks to detect drowsiness.
 *  - Tracks consecutive "no face" frames to distinguish away vs. momentary occlusion.
 *
 * Status codes match the backend PresenceStatus enum:
 *   0 = Unknown  (not yet ready / camera off)
 *   1 = Active   (face visible, eyes open)
 *   2 = Away     (no face detected for AWAY_THRESHOLD_FRAMES consecutive frames)
 *   3 = Drowsy   (EAR < EAR_THRESHOLD for DROWSY_THRESHOLD_FRAMES consecutive frames)
 */

// MediaPipe is loaded at runtime via importScripts from CDN.
// This avoids Vite bundling it — bundled MediaPipe calls self.import()
// which only works in unbundled module workers (a Chrome internal API).
declare const FaceLandmarker: any;
declare const FilesetResolver: any;
type FaceLandmarkerResult = any;

// ── Thresholds ─────────────────────────────────────────────────────────────
// At 2fps: 30 frames = 15 s for away, 6 frames = 3 s for drowsy.
const AWAY_THRESHOLD_FRAMES = 30;
const DROWSY_THRESHOLD_FRAMES = 6;
// Eye Aspect Ratio below this value = eyes considered closed.
const EAR_THRESHOLD = 0.20;

// ── MediaPipe Face Mesh eye landmark indices ─────────────────────────────
// Left eye: 6-point contour (top, bottom, corners).
const LEFT_EYE = [362, 385, 387, 263, 373, 380];
// Right eye: 6-point contour.
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

// ── Message types ───────────────────────────────────────────────────────────
interface WorkerFrameMessage {
  type: 'frame';
  bitmap: ImageBitmap;
}

interface WorkerReadyMessage {
  type: 'ready';
}

interface WorkerResultMessage {
  type: 'result';
  statusCode: number; // 0–3, maps to PresenceStatus
  ear: number;        // Eye Aspect Ratio for debugging / threshold tuning
}

// ── State ────────────────────────────────────────────────────────────────────
let landmarker: InstanceType<typeof FaceLandmarker> | null = null;
let noFaceFrames = 0;
let eyesClosedFrames = 0;

// ── EAR calculation ───────────────────────────────────────────────────────
/** p[i] are {x,y,z} normalized landmark coords */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function eyeAspectRatio(
  lm: { x: number; y: number; z: number }[],
  indices: number[],
): number {
  // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => lm[i]);
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = 2 * dist(p1, p4);
  return horizontal === 0 ? 1 : vertical / horizontal;
}

// ── Init MediaPipe ────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Load MediaPipe directly from CDN — bypasses Vite bundling which breaks
  // MediaPipe's internal self.import() calls.
  (self as any).importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/vision_bundle.cjs');

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
  );
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
    runningMode: 'IMAGE',
    numFaces: 1,
  });
  const ready: WorkerReadyMessage = { type: 'ready' };
  self.postMessage(ready);
}

// ── Frame handler ─────────────────────────────────────────────────────────
function processFrame(bitmap: ImageBitmap): void {
  if (!landmarker) {
    bitmap.close();
    return;
  }

  let result: FaceLandmarkerResult;
  try {
    result = landmarker.detect(bitmap);
  } finally {
    bitmap.close(); // always release GPU memory
  }

  const hasFace = result.faceLandmarks.length > 0;

  if (!hasFace) {
    noFaceFrames++;
    eyesClosedFrames = 0;
    const statusCode = noFaceFrames >= AWAY_THRESHOLD_FRAMES ? 2 : 1;
    const msg: WorkerResultMessage = { type: 'result', statusCode, ear: 1 };
    self.postMessage(msg);
    return;
  }

  noFaceFrames = 0;

  const lm = result.faceLandmarks[0];
  const leftEar = eyeAspectRatio(lm, LEFT_EYE);
  const rightEar = eyeAspectRatio(lm, RIGHT_EYE);
  const ear = (leftEar + rightEar) / 2;

  if (ear < EAR_THRESHOLD) {
    eyesClosedFrames++;
  } else {
    eyesClosedFrames = 0;
  }

  const statusCode = eyesClosedFrames >= DROWSY_THRESHOLD_FRAMES ? 3 : 1;
  const msg: WorkerResultMessage = { type: 'result', statusCode, ear };
  self.postMessage(msg);
}

// ── Message dispatch ──────────────────────────────────────────────────────
self.addEventListener('message', (e: MessageEvent<WorkerFrameMessage>) => {
  if (e.data.type === 'frame') {
    processFrame(e.data.bitmap);
  }
});

init().catch((err) => {
  console.error('[presenceWorker] init failed:', err);
});
