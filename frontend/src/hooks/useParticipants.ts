/**
 * useParticipants — maintains the live list of active participants for a room.
 *
 * Subscribes to SpaceTimeDB participant table events and applies:
 *  - insert: add if leftAt is null and not already present
 *  - update: remove if leftAt is now set, otherwise replace row
 *  - delete: remove by participantId
 *
 * Stable-ref pattern: the three handlers are defined outside the effect and
 * kept in refs. The effect registers one stable wrapper per handler and only
 * re-subscribes when `db` changes — not on every `roomId` change. `roomId`
 * is read from a ref at call time, so it is always current.
 */

import { useEffect, useRef, useState } from 'react';
import type { DbConnection } from '@/module_bindings';
import type { Participant } from '@/module_bindings/types';

interface UseParticipantsOptions {
  onJoin?: (participant: Participant) => void;
  onLeave?: (participant: Participant) => void;
}

export function useParticipants(
  db: DbConnection | null,
  roomId: bigint | null,
  options?: UseParticipantsOptions,
): Participant[] {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const participantsRef = useRef<Participant[]>([]);

  const onJoinRef = useRef(options?.onJoin);
  const onLeaveRef = useRef(options?.onLeave);
  onJoinRef.current = options?.onJoin;
  onLeaveRef.current = options?.onLeave;

  // Keep roomId in a ref so handlers always read the latest value.
  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // Reload the snapshot whenever roomId becomes known (or db reconnects).
  useEffect(() => {
    if (!db || roomId == null) {
      participantsRef.current = [];
      setParticipants([]);
      return;
    }
    const snapshot: Participant[] = [];
    for (const p of db.db.participant.participant_by_room.filter(roomId)) {
      if (p.leftAt == null) snapshot.push(p as Participant);
    }
    participantsRef.current = snapshot;
    setParticipants(snapshot);
  }, [db, roomId]);

  // Subscribe to table events once per db instance.
  useEffect(() => {
    if (!db) return;

    function onInsert(_ctx: unknown, row: Participant) {
      if (row.roomId !== roomIdRef.current || row.leftAt != null) return;
      if (participantsRef.current.some((p) => p.participantId === row.participantId)) return;
      participantsRef.current = [...participantsRef.current, row];
      setParticipants(participantsRef.current);
      onJoinRef.current?.(row);
    }

    function onUpdate(_ctx: unknown, _old: Participant, newRow: Participant) {
      if (newRow.roomId !== roomIdRef.current) return;
      if (newRow.leftAt != null) {
        const wasPresent = participantsRef.current.some((p) => p.participantId === newRow.participantId);
        participantsRef.current = participantsRef.current.filter((p) => p.participantId !== newRow.participantId);
        setParticipants(participantsRef.current);
        if (wasPresent) onLeaveRef.current?.(newRow);
        return;
      }
      participantsRef.current = participantsRef.current.map((p) =>
        p.participantId === newRow.participantId ? newRow : p,
      );
      setParticipants(participantsRef.current);
    }

    function onDelete(_ctx: unknown, row: Participant) {
      if (row.roomId !== roomIdRef.current) return;
      participantsRef.current = participantsRef.current.filter((p) => p.participantId !== row.participantId);
      setParticipants(participantsRef.current);
    }

    db.db.participant.onInsert(onInsert);
    db.db.participant.onUpdate(onUpdate);
    db.db.participant.onDelete(onDelete);

    return () => {
      db.db.participant.removeOnInsert(onInsert);
      db.db.participant.removeOnUpdate(onUpdate);
      db.db.participant.removeOnDelete(onDelete);
    };
  }, [db]);

  return participants;
}
