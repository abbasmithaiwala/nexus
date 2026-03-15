/**
 * useLocalStream — manages the getUserMedia stream + screen share for the live meeting room.
 *
 * Mirrors the structure of useLocalPreview but adds screen share support.
 *
 * Key design decisions:
 * - A `videoEnabledRef` is kept in sync so the `'ended'` screen-share listener
 *   always reads the latest value instead of a stale closure capture.
 * - Track toggles are applied via effects (not inside state updaters) so they
 *   are safe under React StrictMode double-invoke.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';

export interface LocalStream {
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

export function useLocalStream(): LocalStream {
  const streamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false',
  );
  const [videoEnabled, setVideoEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false',
  );
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Keep a ref in sync so async callbacks always read the latest value.
  const videoEnabledRef = useRef(videoEnabled);
  useEffect(() => { videoEnabledRef.current = videoEnabled; }, [videoEnabled]);

  // ── Stream lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }

        // Apply persisted toggle state to the fresh stream.
        s.getAudioTracks().forEach((t) => (t.enabled = localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false'));
        s.getVideoTracks().forEach((t) => (t.enabled = localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false'));

        cameraTrackRef.current = s.getVideoTracks()[0] ?? null;
        streamRef.current = s;
        setStream(s);
      })
      .catch(() => {
        // Permission denied or device unavailable — stream stays null.
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Persist and sync track.enabled ─────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.videoEnabled, String(videoEnabled));
    // Don't touch the video track while screen sharing — the screen track is active.
    if (!isScreenSharing) {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoEnabled));
    }
  }, [videoEnabled, isScreenSharing]);

  // ── Toggles ─────────────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => setAudioEnabled((p) => !p), []);
  const toggleVideo = useCallback(() => setVideoEnabled((p) => !p), []);

  // ── Screen share ────────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const displayTrack = display.getVideoTracks()[0];
      if (!displayTrack || !streamRef.current) return;

      // Swap camera track out, screen track in.
      const oldTrack = streamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        streamRef.current.removeTrack(oldTrack);
        oldTrack.enabled = false;
      }
      streamRef.current.addTrack(displayTrack);
      setStream(new MediaStream(streamRef.current.getTracks()));
      setIsScreenSharing(true);

      // Auto-restore camera when the user closes the browser share prompt.
      displayTrack.addEventListener('ended', () => {
        if (oldTrack && streamRef.current) {
          streamRef.current.removeTrack(displayTrack);
          // Read the ref so we get the current videoEnabled, not the stale closure value.
          oldTrack.enabled = videoEnabledRef.current;
          streamRef.current.addTrack(oldTrack);
          setStream(new MediaStream(streamRef.current.getTracks()));
        }
        setIsScreenSharing(false);
      });
    } catch {
      // User cancelled or permission denied — silently ignore.
    }
  }, []); // no dependency on videoEnabled — reads via ref

  const stopScreenShare = useCallback(() => {
    if (!streamRef.current || !cameraTrackRef.current) return;

    const screenTrack = streamRef.current
      .getVideoTracks()
      .find((t) => t !== cameraTrackRef.current);

    if (screenTrack) {
      screenTrack.stop();
      streamRef.current.removeTrack(screenTrack);
    }
    cameraTrackRef.current.enabled = videoEnabledRef.current;
    streamRef.current.addTrack(cameraTrackRef.current);
    setStream(new MediaStream(streamRef.current.getTracks()));
    setIsScreenSharing(false);
  }, []); // reads videoEnabled via ref

  return {
    stream,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
