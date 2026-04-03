/**
 * usePresenceSync — detects local presence and syncs status to SpaceTimeDB.
 *
 * Runs the detection hook on the local stream, then calls updatePresenceStatus
 * reducer whenever the status changes. Debounces reducer calls — only writes
 * when the status has been stable for DEBOUNCE_MS to avoid rapid transitions.
 */

import { useEffect, useRef } from 'react';
import type { DbConnection } from '@/module_bindings';
import { usePresenceDetection } from './usePresenceDetection';

const DEBOUNCE_MS = 1500;

export function usePresenceSync(
  db: DbConnection | null,
  roomId: bigint | null,
  stream: MediaStream | null,
): void {
  const statusCode = usePresenceDetection(stream);
  const lastSyncedRef = useRef<number>(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!db || roomId == null) return;
    if (statusCode === lastSyncedRef.current) return;

    // Clear any pending debounce for a previous status.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      // Re-check nothing changed during the debounce window.
      if (statusCode === lastSyncedRef.current) return;
      lastSyncedRef.current = statusCode;
      db.reducers.updatePresenceStatus({ roomId, statusCode });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [db, roomId, statusCode]);
}
