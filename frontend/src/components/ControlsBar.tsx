/**
 * ControlsBar — the bottom action bar shown during a meeting.
 *
 * Provides:
 *  - Mic toggle
 *  - Camera toggle
 *  - Screen share toggle
 *  - Chat toggle (with unread badge)
 *  - Reactions button
 *  - Leave meeting
 *  - End meeting (host only)
 *
 * Desktop: icon + label below each button
 * Mobile: icons only, fixed to bottom of screen
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
  CircleStop,
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

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  disabled?: boolean;
}

function ControlButton({
  icon,
  label,
  onClick,
  active = true,
  danger = false,
  badge,
  disabled = false,
}: ControlButtonProps) {
  const base =
    'relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

  const color = danger
    ? 'bg-red-600 hover:bg-red-500 text-white'
    : active
      ? 'bg-gray-700 hover:bg-gray-600 text-white'
      : 'bg-red-600/90 hover:bg-red-500/90 text-white';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`${base} ${color}`}
    >
      {icon}
      <span className="hidden sm:block text-xs font-medium">{label}</span>

      {/* Unread badge */}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
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
    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800">
      <ControlButton
        icon={audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        label={audioEnabled ? 'Mute' : 'Unmute'}
        onClick={onToggleAudio}
        active={audioEnabled}
      />

      <ControlButton
        icon={videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        label={videoEnabled ? 'Stop video' : 'Start video'}
        onClick={onToggleVideo}
        active={videoEnabled}
      />

      <ControlButton
        icon={isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
        label={isScreenSharing ? 'Stop share' : 'Share screen'}
        onClick={onToggleScreenShare}
        active={!isScreenSharing}
      />

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block" />

      <ControlButton
        icon={<MessageSquare size={20} />}
        label="Chat"
        onClick={onToggleChat}
        active={isChatOpen}
        badge={isChatOpen ? 0 : unreadCount}
      />

      <ControlButton
        icon={<Smile size={20} />}
        label="Reactions"
        onClick={onOpenReactions}
        active
      />

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block" />

      <ControlButton
        icon={<PhoneOff size={20} />}
        label="Leave"
        onClick={onLeave}
        danger
      />

      {isHost && (
        <ControlButton
          icon={<CircleStop size={20} />}
          label="End"
          onClick={onEndMeeting}
          danger
        />
      )}
    </div>
  );
}
