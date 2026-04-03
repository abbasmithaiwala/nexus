/**
 * presenceWorker — runs MediaPipe Face Landmarker in a Web Worker.
 * Loaded from /public so Vite never bundles it.
 * MediaPipe is loaded via importScripts from the local /mediapipe-vision.js
 * which is the +esm CDN bundle with ES export syntax stripped.
 *
 * Status codes: 0=Unknown, 1=Active, 2=Away, 3=Drowsy
 */

importScripts('/mediapipe-vision.js');

// ── Thresholds ──────────────────────────────────────────────────────────────
const AWAY_THRESHOLD_FRAMES = 30;
const DROWSY_THRESHOLD_FRAMES = 6;
const EAR_THRESHOLD = 0.20;

// ── Eye landmark indices ────────────────────────────────────────────────────
const LEFT_EYE  = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33,  160, 158, 133, 153, 144];

// ── State ───────────────────────────────────────────────────────────────────
let landmarker      = null;
let noFaceFrames    = 0;
let eyesClosedFrames = 0;

// ── EAR helpers ─────────────────────────────────────────────────────────────
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function eyeAspectRatio(lm, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map(i => lm[i]);
  const vertical   = dist(p2, p6) + dist(p3, p5);
  const horizontal = 2 * dist(p1, p4);
  return horizontal === 0 ? 1 : vertical / horizontal;
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
  );

  // Try GPU first; fall back to CPU if the GPU delegate fails (e.g. partial
  // binary download causes a RangeError during delegate initialisation).
  try {
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
  } catch (gpuErr) {
    console.warn('[presenceWorker] GPU delegate failed, retrying with CPU:', gpuErr);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'CPU',
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'IMAGE',
      numFaces: 1,
    });
  }

  self.postMessage({ type: 'ready' });
}

// ── Frame handler ────────────────────────────────────────────────────────────
function processFrame(bitmap) {
  if (!landmarker) { bitmap.close(); return; }

  let result;
  try {
    result = landmarker.detect(bitmap);
  } catch (err) {
    console.error('[presenceWorker] detect failed:', err);
    return;
  } finally {
    bitmap.close();
  }

  const hasFace = result.faceLandmarks.length > 0;

  if (!hasFace) {
    noFaceFrames++;
    eyesClosedFrames = 0;
    const statusCode = noFaceFrames >= AWAY_THRESHOLD_FRAMES ? 2 : 1;
    self.postMessage({ type: 'result', statusCode, ear: 1 });
    return;
  }

  noFaceFrames = 0;
  const lm       = result.faceLandmarks[0];
  const ear      = (eyeAspectRatio(lm, LEFT_EYE) + eyeAspectRatio(lm, RIGHT_EYE)) / 2;

  if (ear < EAR_THRESHOLD) eyesClosedFrames++;
  else                     eyesClosedFrames = 0;

  const statusCode = eyesClosedFrames >= DROWSY_THRESHOLD_FRAMES ? 3 : 1;
  self.postMessage({ type: 'result', statusCode, ear });
}

// ── Message dispatch ─────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data.type === 'frame') processFrame(e.data.bitmap);
});

init().catch(err => console.error('[presenceWorker] init failed:', err));
