/**
 * useSpacetime — convenience hook for accessing the SpaceTimeDB connection.
 *
 * Returns the db connection, identity, and connection status from context.
 *
 * @example
 * const { db, identity, isConnected } = useSpacetime();
 */

import { useContext } from 'react';
import { SpacetimeContext } from '@/contexts/SpacetimeContext';

export function useSpacetime() {
  return useContext(SpacetimeContext);
}
