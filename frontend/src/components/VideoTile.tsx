/**
 * VideoTile — renders one participant's video (or avatar when camera is off).
 *
 * Safari/iOS autoplay note:
 *  Remote video is not muted, so Safari blocks autoplay until the user has
 *  interacted with the page. We handle this by listening for the first click/
 *  touch on the document and retrying play() at that point. The video element
 *  is also given `playsInline` (mandatory on iOS) and `autoPlay` (Chrome/Firefox).
 *
 *  srcObject is reassigned whenever the stream reference OR the track ids change
 *  (trackIds key) — this covers the case where PeerConnectionManager replaces a
 *  track in-place on the same MediaStream object.
 */

import { memo, useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import type { FloatingReaction } from '@/hooks/useReactions';

export interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing?: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isSpeaking?: boolean;
  mirrored?: boolean;
  floatingReactions?: FloatingReaction[];
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  return (
    <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-semibold select-none">
      {initials || '?'}
    </div>
  );
}

/** Attempt play(); if blocked (autoplay policy), retry on next user interaction. */
function playVideo(el: HTMLVideoElement): void {
  el.play().catch(() => {
    const retry = () => { el.play().catch(() => {}); };
    document.addEventListener('click', retry, { once: true, passive: true });
    document.addEventListener('touchstart', retry, { once: true, passive: true });
    document.addEventListener('keydown', retry, { once: true, passive: true });
    // Also retry when the video element itself receives focus or is clicked.
    el.addEventListener('click', retry, { once: true, passive: true });
  });
}

export const VideoTile = memo(function VideoTile({
  stream,
  displayName,
  audioEnabled,
  videoEnabled,
  isScreenSharing = false,
  isLocal = false,
  isHost = false,
  isSpeaking = false,
  mirrored = false,
  floatingReactions = [],
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Derive a key from track ids: when PeerConnectionManager replaces a track
  // in-place on the same MediaStream object, the stream reference doesn't change
  // but the track ids do — this ensures the effect re-runs and reattaches.
  const trackIds = stream ? stream.getTracks().map((t) => t.id).sort().join(',') : '';

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      playVideo(el);
    } else {
      el.srcObject = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, trackIds]);

  return (
    <div
      className={`relative w-full h-full bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center ${
        isSpeaking ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`absolute inset-0 w-full h-full ${isScreenSharing ? 'object-contain' : 'object-cover'} ${
          mirrored && !isScreenSharing ? '-scale-x-100' : ''
        } ${(videoEnabled || isScreenSharing) && stream ? 'opacity-100' : 'opacity-0'}`}
      />

      {((!videoEnabled && !isScreenSharing) || !stream) && (
        <div className="flex flex-col items-center gap-2">
          <Initials name={displayName} />
          <span className="text-neutral-300 text-sm font-medium">{displayName}</span>
        </div>
      )}

      {!!((videoEnabled || isScreenSharing) && stream) && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
            {displayName}
          </span>
        </div>
      )}

      {!audioEnabled && (
        <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-red-600/90 flex items-center justify-center">
          <MicOff size={12} className="text-white" />
        </div>
      )}

      {floatingReactions.length > 0 && (
        <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none overflow-hidden">
          {floatingReactions.map((r) => (
            <span key={r.id} className="reaction-float absolute text-3xl">
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      <div className="absolute top-2 left-2 flex gap-1">
        {isHost && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-xs font-semibold backdrop-blur-sm">
            Host
          </span>
        )}
        {isLocal && (
          <span className="px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-xs font-semibold backdrop-blur-sm">
            You
          </span>
        )}
      </div>
    </div>
  );
});
