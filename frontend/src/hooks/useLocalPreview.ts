/**
 * useLocalPreview — manages a getUserMedia stream for the lobby preview.
 *
 * - Starts the stream on mount and stops it on unmount.
 * - Stops the old stream before requesting a new one (retry).
 * - Track toggles **stop the hardware track** when disabling and re-acquire via
 *   getUserMedia when re-enabling, so the webcam/mic indicator light turns off.
 *   This is the privacy-correct behaviour — track.enabled=false keeps the
 *   hardware active and the indicator light on.
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

  // ── Persist preferences ───────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.videoEnabled, String(videoEnabled));
  }, [videoEnabled]);

  // ── Stream lifecycle ──────────────────────────────────────────────────────
  const startPreview = useCallback(async () => {
    // Stop any existing stream before requesting a new one.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('loading');

    const wantsVideo = localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false';
    const wantsAudio = localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false';

    try {
      // Only request devices that are actually enabled so the hardware
      // indicator light never turns on for disabled devices.
      const stream = !wantsVideo && !wantsAudio
        ? new MediaStream()
        : await navigator.mediaDevices.getUserMedia({
            video: wantsVideo,
            audio: wantsAudio,
          });

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

  // ── Stop/re-acquire audio track when mic is toggled ───────────────────────
  useEffect(() => {
    if (!streamRef.current || status !== 'ready') return;

    if (!audioEnabled) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.stop();
        streamRef.current!.removeTrack(t);
      });
    } else {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((s) => {
          const newTrack = s.getAudioTracks()[0];
          if (!newTrack || !streamRef.current) return;
          streamRef.current.addTrack(newTrack);
        })
        .catch(() => {});
    }
  }, [audioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop/re-acquire video track when camera is toggled ────────────────────
  useEffect(() => {
    if (!streamRef.current || status !== 'ready') return;

    if (!videoEnabled) {
      streamRef.current.getVideoTracks().forEach((t) => {
        t.stop();
        streamRef.current!.removeTrack(t);
      });
      // Clear the video element so the last frame doesn't freeze on screen.
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((s) => {
          const newTrack = s.getVideoTracks()[0];
          if (!newTrack || !streamRef.current) return;
          streamRef.current.addTrack(newTrack);
          if (videoRef.current) videoRef.current.srcObject = streamRef.current;
        })
        .catch(() => {});
    }
  }, [videoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
