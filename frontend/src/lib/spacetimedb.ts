/**
 * SpaceTimeDB singleton connection for Nexus.
 *
 * Provides a single DbConnection instance shared across the app.
 * The connection is lazy — it is created on first call to `getConnection()`.
 */

import { DbConnection } from '@/module_bindings';
import type { Identity } from 'spacetimedb';

const SPACETIMEDB_URL = import.meta.env.VITE_SPACETIMEDB_URL ?? 'wss://maincloud.spacetimedb.com';
const MODULE_NAME = import.meta.env.VITE_SPACETIMEDB_MODULE ?? 'nexus';
const TOKEN_KEY = 'nexus:spacetime_token';

let connection: DbConnection | null = null;
let _identity: Identity | undefined;
let _token: string | undefined;

export function getSavedToken(): string | undefined {
  return localStorage.getItem(TOKEN_KEY) ?? undefined;
}

function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getIdentity(): Identity | undefined {
  return _identity;
}

export function getToken(): string | undefined {
  return _token;
}

export function getConnection(): DbConnection {
  if (!connection) {
    throw new Error('SpaceTimeDB connection not yet established.');
  }
  return connection;
}

export function isConnected(): boolean {
  return connection !== null && connection.isActive;
}

type OnConnectCallback = (conn: DbConnection, identity: Identity, token: string) => void;
type OnDisconnectCallback = (error?: Error) => void;

export function buildConnection(
  onConnect: OnConnectCallback,
  onDisconnect: OnDisconnectCallback,
): DbConnection {
  const conn = DbConnection.builder()
    .withUri(SPACETIMEDB_URL)
    .withDatabaseName(MODULE_NAME)
    .withToken(getSavedToken())
    .onConnect((conn, identity, token) => {
      connection = conn;
      _identity = identity;
      _token = token;
      saveToken(token);

      // Subscribe to all tables after connecting
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          onConnect(conn, identity, token);
        })
        .subscribe([
          'SELECT * FROM user',
          'SELECT * FROM room',
          'SELECT * FROM participant',
          'SELECT * FROM room_event',
          'SELECT * FROM signaling_message',
        ]);
    })
    .onDisconnect((_ctx, error) => {
      connection = null;
      _identity = undefined;
      onDisconnect(error);
    })
    .onConnectError((_ctx, error) => {
      onDisconnect(error);
    })
    .build();

  return conn;
}

export function disconnect(): void {
  if (connection) {
    connection.disconnect();
    connection = null;
    _identity = undefined;
    _token = undefined;
  }
}
