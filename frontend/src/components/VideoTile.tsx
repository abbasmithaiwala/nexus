/**
 * VideoTile — renders a single participant's video (or avatar when camera is off).
 *
 * Props:
 *  - stream: MediaStream | null   — remote (or local) media stream
 *  - displayName: string
 *  - audioEnabled: boolean        — shows muted icon when false
 *  - videoEnabled: boolean        — shows avatar when false
 *  - isLocal: boolean             — shows "You" badge
 *  - isHost: boolean              — shows "Host" badge
 *  - isSpeaking?: boolean         — optional speaking indicator (ring highlight)
 *  - mirrored?: boolean           — mirror the video (local camera)
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
    <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-semibold select-none">
      {initials || '?'}
    </div>
  );
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.play().catch(() => {
        // Autoplay may be blocked; the browser will play on first user interaction.
      });
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <div
      className={`relative w-full h-full bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center ${
        isSpeaking ? 'ring-2 ring-indigo-400' : ''
      }`}
    >
      {/* Video element — hidden when camera is off (unless screen sharing) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`absolute inset-0 w-full h-full ${isScreenSharing ? 'object-contain' : 'object-cover'} ${
          mirrored && !isScreenSharing ? '-scale-x-100' : ''
        } ${(videoEnabled || isScreenSharing) && stream ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Avatar shown when camera is off and not screen sharing */}
      {((!videoEnabled && !isScreenSharing) || !stream) && (
        <div className="flex flex-col items-center gap-2">
          <Initials name={displayName} />
          <span className="text-gray-300 text-sm font-medium">{displayName}</span>
        </div>
      )}

      {/* Bottom-left name label (only when video/screen is on) */}
      {!!((videoEnabled || isScreenSharing) && stream) && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
            {displayName}
          </span>
        </div>
      )}

      {/* Muted mic icon */}
      {!audioEnabled && (
        <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-red-600/90 flex items-center justify-center">
          <MicOff size={12} className="text-white" />
        </div>
      )}

      {/* Floating emoji reactions */}
      {floatingReactions.length > 0 && (
        <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none overflow-hidden">
          {floatingReactions.map((r) => (
            <span key={r.id} className="reaction-float absolute text-3xl">
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Badges — top row */}
      <div className="absolute top-2 left-2 flex gap-1">
        {isHost && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-xs font-semibold backdrop-blur-sm">
            Host
          </span>
        )}
        {isLocal && (
          <span className="px-1.5 py-0.5 rounded bg-indigo-600/90 text-white text-xs font-semibold backdrop-blur-sm">
            You
          </span>
        )}
      </div>
    </div>
  );
});
