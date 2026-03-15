/**
 * useLocalPreview — manages a getUserMedia stream for the lobby preview.
 *
 * - Starts the stream on mount and stops it on unmount.
 * - Stops the old stream before requesting a new one (retry).
 * - Side effects (track enable/disable, localStorage) run in effects, not
 *   inside setState updaters, so they're safe in StrictMode.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';

export type MediaStatus = 'loading' | 'ready' | 'denied' | 'unavailable';

export interface LocalPreview {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: MediaStatus;
  audioEnabled: boolean;
  videoEnabled: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  retry: () => void;
}

export function useLocalPreview(): LocalPreview {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<MediaStatus>('loading');
  const [audioEnabled, setAudioEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false',
  );
  const [videoEnabled, setVideoEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false',
  );

  // ── Persist toggles and sync track.enabled ────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.videoEnabled, String(videoEnabled));
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoEnabled));
  }, [videoEnabled]);

  // ── Stream lifecycle ──────────────────────────────────────────────────────
  const startPreview = useCallback(async () => {
    // Stop any existing stream before requesting a new one.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('loading');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      // Apply current toggle state to the fresh stream.
      stream.getAudioTracks().forEach(
        (t) => (t.enabled = localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false'),
      );
      stream.getVideoTracks().forEach(
        (t) => (t.enabled = localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false'),
      );
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus('ready');
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      setStatus(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'denied'
          : 'unavailable',
      );
    }
  }, []);

  useEffect(() => {
    startPreview();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startPreview]);

  return {
    videoRef,
    status,
    audioEnabled,
    videoEnabled,
    toggleAudio: () => setAudioEnabled((p) => !p),
    toggleVideo: () => setVideoEnabled((p) => !p),
    retry: startPreview,
  };
}
