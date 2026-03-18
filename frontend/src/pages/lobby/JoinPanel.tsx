import { ArrowRight, Loader2, Mic, Video } from 'lucide-react';

export interface JoinPanelProps {
  displayName: string;
  onNameChange: (name: string) => void;
  audioEnabled: boolean;
  videoEnabled: boolean;
  joining: boolean;
  joinError: string;
  canJoin: boolean;
  isConnected: boolean;
  onJoin: () => void;
}

export function JoinPanel({
  displayName,
  onNameChange,
  audioEnabled,
  videoEnabled,
  joining,
  joinError,
  canJoin,
  isConnected,
  onJoin,
}: JoinPanelProps) {
  return (
    <div className="md:w-72 flex flex-col justify-center gap-5">
      {/* Display name */}
      <div>
        <label htmlFor="display-name" className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wider">
          Your name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter your name"
          maxLength={50}
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/30 focus:border-white/20 transition text-sm"
        />
      </div>

      {/* Media state summary */}
      <div className="flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1.5 ${audioEnabled ? 'text-neutral-300' : 'text-neutral-600 line-through'}`}>
          <Mic className="w-3.5 h-3.5" />
          {audioEnabled ? 'Mic on' : 'Mic off'}
        </span>
        <span className="text-neutral-700">·</span>
        <span className={`flex items-center gap-1.5 ${videoEnabled ? 'text-neutral-300' : 'text-neutral-600 line-through'}`}>
          <Video className="w-3.5 h-3.5" />
          {videoEnabled ? 'Camera on' : 'Camera off'}
        </span>
      </div>

      {/* Join button */}
      <button
        onClick={onJoin}
        disabled={!canJoin}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors shadow-[0_0_20px_rgba(255,255,255,0.15)]"
      >
        {joining ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Joining…</>
        ) : (
          <>Join Now<ArrowRight className="w-4 h-4" /></>
        )}
      </button>

      {joinError && <p className="text-red-400 text-xs text-center">{joinError}</p>}

      {!isConnected && (
        <p className="flex items-center justify-center gap-1.5 text-neutral-600 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          Connecting to server…
        </p>
      )}
    </div>
  );
}
