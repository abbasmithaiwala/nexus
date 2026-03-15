/**
 * LobbyPage — pre-join screen with camera/mic preview.
 *
 * Orchestrates: useLocalPreview (media), VideoPreview, JoinPanel.
 * Owns only the display-name state, room-code copy, and join flow.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, Copy } from 'lucide-react';
import { useSpacetime } from '@/hooks/useSpacetime';
import { useLocalPreview } from '@/hooks/useLocalPreview';
import { STORAGE_KEYS } from '@/lib/constants';
import { VideoPreview } from './lobby/VideoPreview';
import { JoinPanel } from './lobby/JoinPanel';

export function LobbyPage() {
  const navigate = useNavigate();
  const { roomCode } = useParams<{ roomCode: string }>();
  const { db, isConnected } = useSpacetime();
  const preview = useLocalPreview();

  // ── Display name ──────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(STORAGE_KEYS.displayName) ?? '',
  );
  function persistName(name: string) {
    setDisplayName(name);
    localStorage.setItem(STORAGE_KEYS.displayName, name);
  }

  // ── Copy room code ────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  function copyCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Join meeting ──────────────────────────────────────────────────────────
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  async function handleJoin() {
    if (!db || !isConnected || !roomCode) return;
    const name = displayName.trim();
    if (!name) { setJoinError('Please enter your name.'); return; }

    setJoining(true);
    setJoinError('');
    try {
      await db.reducers.joinRoom({ roomCode, displayName: name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Host already has a participant row from createRoom — treat as success.
      if (!msg.includes('Already in this room')) {
        setJoining(false);
        setJoinError(msg || 'Failed to join meeting.');
        return;
      }
    }
    // Navigation unmounts this component, which stops the preview stream.
    navigate(`/room/${roomCode}`);
  }

  const canJoin = isConnected && !!displayName.trim() && !joining;

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Ready to join?</h1>
          {roomCode && (
            <div className="mt-2 inline-flex items-center gap-2">
              <span className="text-gray-400 text-sm font-mono">{roomCode}</span>
              <button
                onClick={copyCode}
                title="Copy meeting code"
                className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              >
                {copied
                  ? <Check className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch">
          <VideoPreview preview={preview} />
          <JoinPanel
            displayName={displayName}
            onNameChange={persistName}
            audioEnabled={preview.audioEnabled}
            videoEnabled={preview.videoEnabled}
            joining={joining}
            joinError={joinError}
            canJoin={canJoin}
            isConnected={isConnected}
            onJoin={handleJoin}
          />
        </div>
      </div>
    </main>
  );
}
