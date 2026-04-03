export interface WorkerFrameMessage {
  type: 'frame';
  bitmap: ImageBitmap;
}

export interface WorkerReadyMessage {
  type: 'ready';
}

export interface WorkerResultMessage {
  type: 'result';
  statusCode: number; // 0–3, maps to PresenceStatus
  ear: number;        // Eye Aspect Ratio for debugging / threshold tuning
}
