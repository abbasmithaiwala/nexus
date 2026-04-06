/**
 * useAudioLevel — detects whether a MediaStream's audio track is producing
 * sound above a threshold (i.e. the participant is speaking).
 *
 * Uses Web Audio API AnalyserNode to compute RMS energy on each animation
 * frame. A simple hysteresis prevents rapid on/off flicker: the `isSpeaking`
 * flag only turns on when RMS exceeds SPEAK_THRESHOLD and only turns off after
 * SILENCE_FRAMES consecutive silent frames — matching the feel of Google Meet.
 */

import { useEffect, useRef, useState } from 'react';

/** RMS level (0–1) above which we consider the participant to be speaking. */
const SPEAK_THRESHOLD = 0.015;

/**
 * Number of consecutive silent frames before isSpeaking flips to false.
 * At 60 fps this is ~500 ms, at 30 fps ~1 s — intentionally asymmetric
 * so the ring lingers briefly after speech ends, just like Google Meet.
 */
const SILENCE_FRAMES = 30;

export function useAudioLevel(stream: MediaStream | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const rafRef = useRef<number>(0);
  const silentFramesRef = useRef(0);

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    try {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      // Web Audio not available (e.g. unit test environment)
      return;
    }

    const tick = () => {
      if (!analyser || !dataArray) return;

      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128; // normalise to [-1, 1]
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (rms > SPEAK_THRESHOLD) {
        silentFramesRef.current = 0;
        setIsSpeaking(true);
      } else {
        silentFramesRef.current += 1;
        if (silentFramesRef.current >= SILENCE_FRAMES) {
          setIsSpeaking(false);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source?.disconnect();
      ctx?.close().catch(() => {});
      setIsSpeaking(false);
      silentFramesRef.current = 0;
    };
  }, [stream]);

  return isSpeaking;
}
