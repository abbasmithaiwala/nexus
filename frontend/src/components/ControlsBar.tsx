/**
 * ControlsBar — floating pill at the bottom of the meeting view.
 *
 * Design: Google-Meet-style floating bar — circle icon buttons, no labels,
 * single red danger button (leave), subtle muted-state indicators.
 */

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  MessageSquare,
  Smile,
  PhoneOff,
  Power,
} from 'lucide-react';

export interface ControlsBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  unreadCount: number;
  isHost: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onOpenReactions: () => void;
  onLeave: () => void;
  onEndMeeting: () => void;
}

interface BtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** 'muted' = on/off media toggle (red background when off) */
  variant?: 'default' | 'muted' | 'active' | 'danger' | 'end';
  badge?: number;
  disabled?: boolean;
}

function Btn({ icon, label, onClick, variant = 'default', badge, disabled = false }: BtnProps) {
  const base =
    'relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30';

  const styles: Record<string, string> = {
    default: 'bg-neutral-800 hover:bg-neutral-700 text-white',
    muted: 'bg-red-600/90 hover:bg-red-500 text-white',
    active: 'bg-white hover:bg-neutral-200 text-black',
    danger: 'bg-red-600 hover:bg-red-500 text-white w-14 h-12 rounded-full',
    end: 'bg-red-500/10 hover:bg-red-500/20 text-red-500 ring-1 ring-red-500/30 hover:ring-red-500/50',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`${base} ${styles[variant]}`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-white text-black text-[9px] font-bold flex items-center justify-center leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-neutral-700/60 mx-0.5" />;
}

export function ControlsBar({
  audioEnabled,
  videoEnabled,
  isScreenSharing,
  isChatOpen,
  unreadCount,
  isHost,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onOpenReactions,
  onLeave,
  onEndMeeting,
}: ControlsBarProps) {
  return (
    /* Outer strip — just provides the bottom padding so reactions panel has room */
    <div className="flex items-center justify-center px-4 pb-5 pt-2 bg-neutral-950">
      {/* Floating pill */}
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-neutral-900 shadow-2xl shadow-black/60 border border-neutral-800/60">

        {/* Media controls */}
        <Btn
          icon={audioEnabled ? <Mic size={19} /> : <MicOff size={19} />}
          label={audioEnabled ? 'Mute mic' : 'Unmute mic'}
          onClick={onToggleAudio}
          variant={audioEnabled ? 'default' : 'muted'}
        />
        <Btn
          icon={videoEnabled ? <Video size={19} /> : <VideoOff size={19} />}
          label={videoEnabled ? 'Stop camera' : 'Start camera'}
          onClick={onToggleVideo}
          variant={videoEnabled ? 'default' : 'muted'}
        />
        <Btn
          icon={isScreenSharing ? <MonitorOff size={19} /> : <Monitor size={19} />}
          label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          onClick={onToggleScreenShare}
          variant={isScreenSharing ? 'active' : 'default'}
        />

        <Divider />

        {/* Secondary controls */}
        <Btn
          icon={<MessageSquare size={19} />}
          label={isChatOpen ? 'Close chat' : 'Open chat'}
          onClick={onToggleChat}
          variant={isChatOpen ? 'active' : 'default'}
          badge={isChatOpen ? 0 : unreadCount}
        />
        <Btn
          icon={<Smile size={19} />}
          label="Reactions"
          onClick={onOpenReactions}
          variant="default"
        />

        <Divider />

        {/* Leave / End */}
        <Btn
          icon={<PhoneOff size={19} />}
          label="Leave meeting"
          onClick={onLeave}
          variant="danger"
        />
        {isHost && (
          <Btn
            icon={<Power size={19} />}
            label="End meeting for all"
            onClick={onEndMeeting}
            variant="end"
          />
        )}
      </div>
    </div>
  );
}
