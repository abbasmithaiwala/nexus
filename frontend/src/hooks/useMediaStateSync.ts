/**
 * useMediaStateSync — fires updateMediaState on the backend whenever the
 * local audio/video/screen-share state changes.
 *
 * Side-effect only — no return value.
 */

import { useEffect } from 'react';
import type { DbConnection } from '@/module_bindings';

interface MediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
}

export function useMediaStateSync(
  db: DbConnection | null,
  roomId: bigint | null,
  { audioEnabled, videoEnabled, isScreenSharing }: MediaState,
): void {
  useEffect(() => {
    if (!db || roomId == null) return;
    db.reducers.updateMediaState({ roomId, audioEnabled, videoEnabled, isScreenSharing });
  }, [db, roomId, audioEnabled, videoEnabled, isScreenSharing]);
}
