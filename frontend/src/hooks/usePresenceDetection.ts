/**
 * usePresenceDetection — samples the local video stream at 2fps, sends frames
 * to the presenceWorker, and returns the latest detected status code.
 *
 * - Only runs when the stream has an active video track and the tab is visible.
 * - The worker is created once and reused across re-renders.
 * - Returns statusCode: 0=Unknown, 1=Active, 2=Away, 3=Drowsy.
 */

import { useEffect, useRef, useState } from 'react';

// 2 frames per second is plenty for sleep/presence detection.
const SAMPLE_INTERVAL_MS = 500;

export function usePresenceDetection(stream: MediaStream | null): number {
  const [statusCode, setStatusCode] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<OffscreenCanvas | null>(null);
  const ctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  // Create worker once on mount.
  useEffect(() => {
    const worker = new Worker('/presenceWorker.js');

    worker.addEventListener('message', (e) => {
      if (e.data.type === 'ready') {
        workerReadyRef.current = true;
      } else if (e.data.type === 'result') {
        setStatusCode(e.data.statusCode as number);
      }
    });

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  // Start/stop sampling loop when stream changes.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      setStatusCode(0);
      return;
    }

    // Create a hidden video element to draw frames from.
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => { /* autoplay blocked — will retry */ });

    intervalRef.current = setInterval(() => {
      // Skip if tab is hidden, worker isn't ready, or video not playing.
      if (
        document.visibilityState === 'hidden' ||
        !workerReadyRef.current ||
        !workerRef.current ||
        video.readyState < 2 ||
        video.videoWidth === 0
      ) return;

      // Reuse canvas, resize only when dimensions change.
      const w = video.videoWidth;
      const h = video.videoHeight;

      if (!canvasRef.current || canvasRef.current.width !== w || canvasRef.current.height !== h) {
        canvasRef.current = new OffscreenCanvas(w, h);
        ctxRef.current = canvasRef.current.getContext('2d') as OffscreenCanvasRenderingContext2D;
      }

      ctxRef.current!.drawImage(video, 0, 0, w, h);

      // createImageBitmap is zero-copy transferable.
      createImageBitmap(canvasRef.current).then((bitmap) => {
        workerRef.current?.postMessage({ type: 'frame', bitmap }, [bitmap]);
      });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      video.srcObject = null;
    };
  }, [stream]);

  return statusCode;
}
