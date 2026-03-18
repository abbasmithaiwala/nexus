import { AlertTriangle, Loader2, Mic, MicOff, User, Video, VideoOff } from 'lucide-react';
import { MediaToggleButton } from '@/components/MediaToggleButton';
import type { LocalPreview } from '@/hooks/useLocalPreview';

export function VideoPreview({ preview }: { preview: LocalPreview }) {
  const { videoRef, status, audioEnabled, videoEnabled, toggleAudio, toggleVideo, retry } = preview;
  const showVideo = status === 'ready' && videoEnabled;

  return (
    <div className="flex-1 relative rounded-2xl overflow-hidden bg-neutral-900 aspect-video sm:min-h-64 md:aspect-auto md:min-h-72">
      {/* Live video — always rendered so the ref is attached; hidden when not live */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity ${showVideo ? 'opacity-100' : 'opacity-0'}`}
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Overlay for non-live states */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-500">
          {status === 'loading' && (
            <>
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Requesting camera…</span>
            </>
          )}
          {status === 'denied' && (
            <>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
              <p className="text-sm text-center px-4">
                Camera/mic permission denied.
                <br />
                <button onClick={retry} className="underline text-neutral-300 hover:text-white mt-1">
                  Try again
                </button>
              </p>
            </>
          )}
          {status === 'unavailable' && (
            <>
              <VideoOff className="w-8 h-8" />
              <span className="text-sm">No camera detected</span>
            </>
          )}
          {status === 'ready' && !videoEnabled && (
            <>
              <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center">
                <User className="w-10 h-10 text-neutral-500" />
              </div>
              <span className="text-sm">Camera is off</span>
            </>
          )}
        </div>
      )}

      {/* Toggle controls overlaid at bottom */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <MediaToggleButton
          active={audioEnabled}
          icon={audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          label={audioEnabled ? 'Mute mic' : 'Unmute mic'}
          onClick={toggleAudio}
          disabled={status === 'loading'}
        />
        <MediaToggleButton
          active={videoEnabled}
          icon={videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          onClick={toggleVideo}
          disabled={status === 'loading'}
        />
      </div>
    </div>
  );
}
