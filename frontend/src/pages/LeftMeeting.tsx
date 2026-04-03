/**
 * LeftMeetingPage — shown after leaving or being removed from a meeting.
 *
 * Mirrors Google Meet's post-call screen:
 *  - "You left the meeting" heading
 *  - Copiable room code
 *  - Rejoin button (only if room is still active)
 *  - Return to home screen button
 *  - Countdown timer (bottom-right) that auto-redirects to home after 5 s
 *
 * This page is also the target for browser back-navigation after leaving,
 * so pressing back never silently drops the user back into a live room.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Video, Home, Loader2, Copy, Check } from 'lucide-react';
import { useSpacetime } from '@/hooks/useSpacetime';

const REDIRECT_SECONDS = 5;

export function LeftMeetingPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { db, isConnected } = useSpacetime();

  const [roomEnded, setRoomEnded] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine whether the room is still active so we can show/hide Rejoin.
  useEffect(() => {
    if (!db || !roomCode) return;

    const checkStatus = () => {
      for (const room of db.db.room.iter()) {
        if (room.roomCode === roomCode) {
          setRoomEnded(room.status.tag === 'Ended');
          return;
        }
      }
      // Room not found in local cache yet — treat as ended to be safe.
      setRoomEnded(true);
    };

    checkStatus();

    // Watch for the host ending the meeting while we're on this page.
    function onRoomUpdate(_ctx: unknown, _old: unknown, newRow: { roomCode: string; status: { tag: string } }) {
      if (newRow.roomCode === roomCode && newRow.status.tag === 'Ended') {
        setRoomEnded(true);
      }
    }

    db.db.room.onUpdate(onRoomUpdate);
    return () => { db.db.room.removeOnUpdate(onRoomUpdate); };
  }, [db, roomCode]);

  // Countdown — ticks every second, redirects to home when it hits 0.
  useEffect(() => {
    if (secondsLeft <= 0) {
      navigate('/', { replace: true });
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, navigate]);

  // Cancel countdown cleanup on unmount.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  function handleCopy() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRejoin() {
    if (!roomCode) return;
    setRejoining(true);
    navigate(`/lobby/${roomCode}`);
  }

  function handleGoHome() {
    navigate('/', { replace: true });
  }

  // SVG circle progress for the countdown ring.
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / REDIRECT_SECONDS;

  return (
    <main
      className="bg-neutral-950 flex flex-col items-center justify-center px-4 py-8 overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[500px] h-[500px] rounded-full bg-white/[0.03] blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 mb-6">
          <img
            src="https://res.cloudinary.com/dbzuzz3jg/image/upload/v1773858422/nexus-logo_tcvnqf.png"
            alt="Nexus logo"
            className="w-9 h-9"
          />
        </div>

        <h1 className="text-2xl font-semibold text-white mb-2">
          You left the meeting
        </h1>

        {/* Copiable room code */}
        {roomCode && (
          <button
            onClick={handleCopy}
            title="Copy meeting code"
            className="inline-flex items-center gap-1.5 mb-8 px-2.5 py-1 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors group"
          >
            <span className="text-sm font-mono">{roomCode}</span>
            {copied
              ? <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
              : <Copy className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            }
          </button>
        )}

        <div className="flex flex-col gap-3 w-full">
          {/* Rejoin — only shown while room is still active */}
          {!roomEnded && (
            <button
              onClick={handleRejoin}
              disabled={!isConnected || rejoining}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
            >
              {rejoining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Joining…
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Rejoin
                </>
              )}
            </button>
          )}

          {/* Return home */}
          <button
            onClick={handleGoHome}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-medium text-sm transition-colors"
          >
            <Home className="w-4 h-4" />
            Return to home screen
          </button>
        </div>
      </div>

      {/* Countdown pill — bottom-right */}
      <div className="absolute bottom-6 right-6 z-10 flex items-center gap-3 px-4 py-3 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-400 text-sm">
        {/* Circular progress ring */}
        <div className="relative w-8 h-8 shrink-0">
          <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
            {/* Track */}
            <circle
              cx="16" cy="16" r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-neutral-700"
            />
            {/* Progress arc */}
            <circle
              cx="16" cy="16" r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              className="text-neutral-400 transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          {/* Number overlaid — sits outside the rotated SVG so it stays upright */}
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-neutral-400 leading-none">
            {secondsLeft}
          </span>
        </div>
        <span>Returning to home…</span>
      </div>
    </main>
  );
}
