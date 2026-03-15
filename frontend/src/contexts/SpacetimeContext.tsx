/**
 * SpacetimeContext — React context providing the DbConnection, identity, and
 * connection status to the rest of the app.
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
}

export const SpacetimeContext = createContext<SpacetimeContextValue>({
  db: null,
  identity: undefined,
  isConnected: false,
  connectionError: undefined,
});

export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbConnection | null>(null);
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | undefined>(undefined);

  // Track whether this effect has already built a connection (handles StrictMode double-mount)
  const built = useRef(false);

  useEffect(() => {
    if (built.current) return;
    built.current = true;

    buildConnection(
      (conn, ident, _token) => {
        setDb(conn);
        setIdentity(ident);
        setIsConnected(true);
        setConnectionError(undefined);
      },
      (error) => {
        setIsConnected(false);
        setDb(null);
        if (error) setConnectionError(error);
      },
    );
  }, []);

  return (
    <SpacetimeContext.Provider value={{ db, identity, isConnected, connectionError }}>
      {children}
    </SpacetimeContext.Provider>
  );
}
