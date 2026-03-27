/**
 * useLocalStream — manages the getUserMedia stream + screen share for the live meeting room.
 *
 * Mirrors the structure of useLocalPreview but adds screen share support.
 *
 * Key design decisions:
 * - A `videoEnabledRef` is kept in sync so the `'ended'` screen-share listener
 *   always reads the latest value instead of a stale closure capture.
 * - Track toggles **stop the hardware track** when disabling and re-acquire via
 *   getUserMedia when re-enabling, so the webcam/mic indicator light turns off.
 *   This is the privacy-correct behaviour — track.enabled=false keeps the
 *   hardware active and the indicator light on.
 * - After re-acquiring a camera track the stream object is replaced so the
 *   PeerConnectionManager (via useWebRTC) picks up the new track and calls
 *   replaceTrack on all open peer connections.
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

  // Keep refs in sync so async callbacks always read the latest values.
  const audioEnabledRef = useRef(audioEnabled);
  const videoEnabledRef = useRef(videoEnabled);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);
  useEffect(() => { videoEnabledRef.current = videoEnabled; }, [videoEnabled]);

  // ── Stream lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const wantsVideo = localStorage.getItem(STORAGE_KEYS.videoEnabled) !== 'false';
    const wantsAudio = localStorage.getItem(STORAGE_KEYS.audioEnabled) !== 'false';

    // Only request devices that are actually enabled — this prevents the
    // webcam/mic hardware from activating (and the indicator light from
    // turning on) when the user had them disabled in the previous session.
    if (!wantsVideo && !wantsAudio) {
      // Both disabled: create an empty stream now; tracks are added when re-enabled.
      const s = new MediaStream();
      streamRef.current = s;
      if (!cancelled) setStream(s);
    } else {
      navigator.mediaDevices
        .getUserMedia({
          video: wantsVideo
            ? { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } }
            : false,
          audio: wantsAudio
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 }
            : false,
        })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          // Apply toggle state that may have changed while getUserMedia was
          // in-flight (e.g. user toggled camera off before the promise resolved).
          // The toggle effects already ran on mount but saw streamRef=null and
          // bailed — so we must re-apply the current state here.
          if (!videoEnabledRef.current) {
            s.getVideoTracks().forEach((t) => { t.stop(); s.removeTrack(t); });
          }
          if (!audioEnabledRef.current) {
            s.getAudioTracks().forEach((t) => { t.stop(); s.removeTrack(t); });
          }
          cameraTrackRef.current = s.getVideoTracks()[0] ?? null;
          streamRef.current = s;
          setStream(s);
        })
        .catch(() => {
          // Permission denied or device unavailable — stream stays null.
        });
    }

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Persist audio preference ────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
  }, [audioEnabled]);

  // ── Persist video preference ────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.videoEnabled, String(videoEnabled));
  }, [videoEnabled]);

  // ── Stop/re-acquire audio track when mic is toggled ─────────────────────────
  useEffect(() => {
    if (!streamRef.current) return;

    if (!audioEnabled) {
      // Stop the mic — hardware indicator turns off.
      streamRef.current.getAudioTracks().forEach((t) => {
        t.stop();
        streamRef.current!.removeTrack(t);
      });
      setStream(new MediaStream(streamRef.current.getTracks()));
    } else {
      // Re-acquire the mic.
      navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
          video: false,
        })
        .then((s) => {
          const newTrack = s.getAudioTracks()[0];
          if (!newTrack || !streamRef.current) return;
          streamRef.current.addTrack(newTrack);
          setStream(new MediaStream(streamRef.current.getTracks()));
        })
        .catch(() => {
          // Permission denied — stay muted.
        });
    }
  }, [audioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop/re-acquire video track when camera is toggled ──────────────────────
  useEffect(() => {
    // Don't touch the video track while screen sharing.
    if (isScreenSharing) return;
    if (!streamRef.current) return;

    if (!videoEnabled) {
      // Stop the camera — hardware indicator light turns off.
      streamRef.current.getVideoTracks().forEach((t) => {
        t.stop();
        streamRef.current!.removeTrack(t);
      });
      cameraTrackRef.current = null;
      setStream(new MediaStream(streamRef.current.getTracks()));
    } else {
      // Re-acquire the camera.
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        })
        .then((s) => {
          const newTrack = s.getVideoTracks()[0];
          if (!newTrack || !streamRef.current) return;
          cameraTrackRef.current = newTrack;
          streamRef.current.addTrack(newTrack);
          setStream(new MediaStream(streamRef.current.getTracks()));
        })
        .catch(() => {
          // Permission denied — stay with camera off.
        });
    }
  }, [videoEnabled, isScreenSharing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggles ─────────────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => setAudioEnabled((p) => !p), []);
  const toggleVideo = useCallback(() => setVideoEnabled((p) => !p), []);

  // ── Screen share ────────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const displayTrack = display.getVideoTracks()[0];
      if (!displayTrack || !streamRef.current) return;

      // Remove the camera track (already stopped if video was off).
      const oldCameraTrack = cameraTrackRef.current;
      if (oldCameraTrack) {
        oldCameraTrack.stop();
        streamRef.current.removeTrack(oldCameraTrack);
        cameraTrackRef.current = null;
      }
      streamRef.current.addTrack(displayTrack);
      setStream(new MediaStream(streamRef.current.getTracks()));
      setIsScreenSharing(true);

      // Auto-restore when the user closes the browser share prompt.
      displayTrack.addEventListener('ended', () => {
        if (!streamRef.current) return;
        streamRef.current.removeTrack(displayTrack);

        if (videoEnabledRef.current) {
          // Re-acquire the camera track.
          navigator.mediaDevices
            .getUserMedia({
              video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } },
              audio: false,
            })
            .then((s) => {
              const newTrack = s.getVideoTracks()[0];
              if (!newTrack || !streamRef.current) return;
              cameraTrackRef.current = newTrack;
              streamRef.current.addTrack(newTrack);
              setStream(new MediaStream(streamRef.current.getTracks()));
            })
            .catch(() => {});
        } else {
          setStream(new MediaStream(streamRef.current.getTracks()));
        }
        setIsScreenSharing(false);
      });
    } catch {
      // User cancelled or permission denied — silently ignore.
    }
  }, []); // no dependency on videoEnabled — reads via ref

  const stopScreenShare = useCallback(() => {
    if (!streamRef.current) return;

    const screenTrack = streamRef.current
      .getVideoTracks()
      .find((t) => t !== cameraTrackRef.current);

    if (screenTrack) {
      screenTrack.stop();
      streamRef.current.removeTrack(screenTrack);
    }

    if (videoEnabledRef.current) {
      // Re-acquire the camera.
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        })
        .then((s) => {
          const newTrack = s.getVideoTracks()[0];
          if (!newTrack || !streamRef.current) return;
          cameraTrackRef.current = newTrack;
          streamRef.current.addTrack(newTrack);
          setStream(new MediaStream(streamRef.current.getTracks()));
        })
        .catch(() => {});
    } else {
      setStream(new MediaStream(streamRef.current.getTracks()));
    }
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
