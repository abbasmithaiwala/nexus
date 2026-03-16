/**
 * HomePage — landing page with "New Meeting" and "Join with code" flows.
 *
 * - "New Meeting" calls create_room and navigates to /lobby/:roomCode
 * - "Join" validates the code format and navigates to /lobby/:roomCode
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Video, Link2, Loader2 } from 'lucide-react';
import { useSpacetime } from '@/hooks/useSpacetime';
import { STORAGE_KEYS } from '@/lib/constants';

/** Room code format: xxx-xxxx-xxx */
const ROOM_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function HomePage() {
  const navigate = useNavigate();
  const { db, isConnected, connectionError, reconnectAttempt } = useSpacetime();

  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(STORAGE_KEYS.displayName) ?? '',
  );
  const [join, setJoin] = useState({ code: '', error: '' });
  const [create, setCreate] = useState({ loading: false, error: '' });

  function persistName(name: string) {
    setDisplayName(name);
    localStorage.setItem(STORAGE_KEYS.displayName, name);
  }

  async function handleNewMeeting() {
    if (!db || !isConnected) return;
    const name = displayName.trim();
    if (!name) {
      setCreate({ loading: false, error: 'Please enter your name first.' });
      return;
    }

    setCreate({ loading: true, error: '' });

    try {
      // Snapshot existing room IDs before the reducer fires so we can detect the new one.
      const existingIds = new Set(
        [...db.db.room.iter()].map((r) => r.roomId.toString()),
      );

      await db.reducers.createRoom({ displayName: name });

      const roomCode = await waitForNewRoom(db, existingIds);
      if (roomCode) {
        navigate(`/lobby/${roomCode}`);
      } else {
        setCreate({ loading: false, error: 'Room created but code not received. Try joining manually.' });
      }
    } catch (err) {
      setCreate({ loading: false, error: err instanceof Error ? err.message : 'Failed to create meeting.' });
    }
  }

  function handleJoin(e: { preventDefault(): void }) {
    e.preventDefault();
    const code = join.code.trim().toLowerCase();
    if (!code) {
      setJoin(j => ({ ...j, error: 'Enter a meeting code.' }));
      return;
    }
    if (!ROOM_CODE_PATTERN.test(code)) {
      setJoin(j => ({ ...j, error: 'Code format must be xxx-xxxx-xxx (letters only).' }));
      return;
    }
    navigate(`/lobby/${code}`);
  }

  const canCreate = isConnected && !!displayName.trim() && !create.loading;

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo / brand */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
          <Video className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">Nexus</h1>
        <p className="mt-2 text-gray-400 text-base sm:text-lg">
          Secure, real-time video meetings
        </p>
      </div>

      {/* Connection loading / reconnect state */}
      {!isConnected && !connectionError && (
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting to server…
        </div>
      )}

      {!isConnected && connectionError && reconnectAttempt < 5 && (
        <div className="flex items-center gap-2 text-yellow-400 text-sm mb-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reconnecting… (attempt {reconnectAttempt} of 5)
        </div>
      )}

      {connectionError && reconnectAttempt >= 5 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm max-w-sm w-full text-center">
          Could not connect: {connectionError.message}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm space-y-5">
        {/* Display name */}
        <div>
          <label htmlFor="display-name" className="block text-sm text-gray-400 mb-1.5">
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => persistName(e.target.value)}
            placeholder="Enter your name"
            maxLength={50}
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
          />
        </div>

        {/* New Meeting button */}
        <button
          onClick={handleNewMeeting}
          disabled={!canCreate}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {create.loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Video className="w-4 h-4" />
              New Meeting
            </>
          )}
        </button>

        {create.error && (
          <p className="text-red-400 text-xs text-center">{create.error}</p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-gray-500 text-xs">or join with a code</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Join with code */}
        <form onSubmit={handleJoin} noValidate>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={join.code}
                onChange={(e) => {
                  const letters = e.target.value.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 10);
                  let formatted = letters;
                  if (letters.length > 3) formatted = letters.slice(0, 3) + '-' + letters.slice(3);
                  if (letters.length > 7) formatted = formatted.slice(0, 8) + '-' + formatted.slice(8);
                  setJoin({ code: formatted, error: '' });
                }}
                placeholder="xxx-xxxx-xxx"
                maxLength={12}
                className="w-full pl-9 pr-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!join.code.trim()}
              className="px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors whitespace-nowrap"
            >
              Join
            </button>
          </div>
          {join.error && (
            <p className="text-red-400 text-xs mt-1.5">{join.error}</p>
          )}
        </form>
      </div>
    </main>
  );
}

type DbType = NonNullable<ReturnType<typeof useSpacetime>['db']>;

function waitForNewRoom(db: DbType, existingIds: Set<string>): Promise<string | null> {
  return new Promise((resolve) => {
    // Check if the room already landed in the cache before we subscribed.
    for (const room of db.db.room.iter()) {
      if (!existingIds.has(room.roomId.toString())) {
        resolve(room.roomCode);
        return;
      }
    }

    const timeout = setTimeout(() => {
      db.db.room.removeOnInsert(onInsert);
      resolve(null);
    }, 10_000);

    function onInsert(_ctx: unknown, row: { roomCode: string; roomId: { toString(): string } }) {
      if (existingIds.has(row.roomId.toString())) return; // not our new room
      clearTimeout(timeout);
      db.db.room.removeOnInsert(onInsert);
      resolve(row.roomCode);
    }

    db.db.room.onInsert(onInsert);
  });
}
