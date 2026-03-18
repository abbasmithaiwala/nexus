/**
 * useRoomLifecycle — owns the room-ended redirect and exposes leave/end actions.
 *
 * Subscribes to room update events and navigates to '/' when the room status
 * becomes 'Ended'. Also provides handleLeave and handleEndMeeting callbacks
 * for the ControlsBar.
 *
 * Stable-ref pattern: the onUpdate handler is defined outside the effect and
 * registered once per `db` instance. roomCode and navigate are read via refs
 * so the subscription never needs to be torn down just because they change.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { DbConnection } from '@/module_bindings';

interface RoomLifecycle {
  handleLeave: () => Promise<void>;
  handleEndMeeting: () => Promise<void>;
}

interface UseRoomLifecycleOptions {
  onRoomEnded?: () => void;
}

export function useRoomLifecycle(
  db: DbConnection | null,
  roomId: bigint | null,
  roomCode: string | undefined,
  options?: UseRoomLifecycleOptions,
): RoomLifecycle {
  const navigate = useNavigate();

  const onRoomEndedRef = useRef(options?.onRoomEnded);
  onRoomEndedRef.current = options?.onRoomEnded;

  // Keep mutable values in refs so the stable handler always reads the latest.
  const roomCodeRef = useRef(roomCode);
  const navigateRef = useRef(navigate);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  // Subscribe to room updates once per db instance.
  useEffect(() => {
    if (!db) return;

    function onRoomUpdate(
      _ctx: unknown,
      _old: unknown,
      newRow: { roomCode: string; status: { tag: string } },
    ) {
      if (newRow.roomCode === roomCodeRef.current && newRow.status.tag === 'Ended') {
        onRoomEndedRef.current?.();
        // Delay navigation slightly so the toast has time to render.
        setTimeout(() => navigateRef.current('/'), 2000);
      }
    }

    db.db.room.onUpdate(onRoomUpdate);
    return () => { db.db.room.removeOnUpdate(onRoomUpdate); };
  }, [db]);

  const handleLeave = useCallback(async () => {
    if (db && roomId != null) {
      try { await db.reducers.leaveRoom({ roomId }); } catch { /* reducer ended the room */ }
    }
    navigate('/');
  }, [db, roomId, navigate]);

  const handleEndMeeting = useCallback(async () => {
    if (db && roomId != null) {
      try { await db.reducers.endMeeting({ roomId }); } catch { /* ignore */ }
    }
    navigate('/');
  }, [db, roomId, navigate]);

  return { handleLeave, handleEndMeeting };
}
