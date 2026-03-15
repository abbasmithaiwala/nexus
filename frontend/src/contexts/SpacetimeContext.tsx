/**
 * SpacetimeContext — React context providing the DbConnection, identity, and
 * connection status to the rest of the app.
 *
 * Reconnection: on disconnect, waits with exponential backoff (1s, 2s, 4s, 8s,
 * 16s) up to MAX_RETRIES before giving up. The retry count resets on a
 * successful connection.
 */

import { createContext, useEffect, useState, useRef, type ReactNode } from 'react';
import type { Identity } from 'spacetimedb';
import { DbConnection } from '@/module_bindings';
import { buildConnection } from '@/lib/spacetimedb';

export interface SpacetimeContextValue {
  /** The active DbConnection, or null while disconnecting/not yet connected. */
  db: DbConnection | null;
  /** The current client identity assigned by SpaceTimeDB. */
  identity: Identity | undefined;
  /** True once the initial subscription has been applied. */
  isConnected: boolean;
  /** Non-null while a connection error has occurred. */
  connectionError: Error | undefined;
  /** How many reconnect attempts have been made since last success. */
  reconnectAttempt: number;
}

export const SpacetimeContext = createContext<SpacetimeContextValue>({
  db: null,
  identity: undefined,
  isConnected: false,
  connectionError: undefined,
  reconnectAttempt: 0,
} satisfies SpacetimeContextValue);

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbConnection | null>(null);
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | undefined>(undefined);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const built = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useRef<(() => void) | undefined>(undefined);

  connect.current = () => {
    buildConnection(
      (conn, ident, _token) => {
        retryCountRef.current = 0;
        setReconnectAttempt(0);
        setDb(conn);
        setIdentity(ident);
        setIsConnected(true);
        setConnectionError(undefined);
      },
      (error) => {
        setIsConnected(false);
        setDb(null);
        if (error) setConnectionError(error);

        // Attempt reconnect with exponential backoff.
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
          setReconnectAttempt(retryCountRef.current);
          retryTimerRef.current = setTimeout(() => {
            connect.current?.();
          }, delay);
        }
      },
    );
  };

  useEffect(() => {
    if (built.current) return;
    built.current = true;
    connect.current?.();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return (
    <SpacetimeContext.Provider value={{ db, identity, isConnected, connectionError, reconnectAttempt }}>
      {children}
    </SpacetimeContext.Provider>
  );
}
