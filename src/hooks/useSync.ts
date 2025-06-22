import React from 'react';
import { Sync } from '../lib/sync';

export function useSync(
  deviceId: string
) {
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'error'>('idle');
  const syncRef = React.useRef<Sync | null>(null);

  React.useEffect(() => {
    const initializeSync = async () => {
      try {
        setSyncStatus('syncing');
        syncRef.current = new Sync(deviceId);

        // Initial pull sync on app load
        await syncRef.current.pull();

        setSyncStatus('idle');
      } catch (error) {
        console.error('Initial sync failed:', error);
        setSyncStatus('error');
      }
    };

    initializeSync();
  }, [deviceId]);

  const manualSync = React.useCallback(async () => {
    if (syncRef.current && syncStatus !== 'syncing') {
      setSyncStatus('syncing');
      try {
        await syncRef.current.pull();
        setSyncStatus('idle');
      } catch (error) {
        console.error('Manual sync failed:', error);
        setSyncStatus('error');
      }
    }
  }, [syncStatus]);

  return { syncStatus, manualSync };
}
