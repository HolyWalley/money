import React from 'react';
import { Sync } from '../lib/sync';

export function useSync(
  deviceId: string
) {
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'error'>('idle');
  const syncRef = React.useRef<Sync | null>(null);

  React.useEffect(() => {
    syncRef.current = new Sync(deviceId);

    // return () => {
    //   clearInterval(syncInterval);
    // };
  }, [deviceId]);

  const manualSync = React.useCallback(async () => {
    if (syncRef.current && syncStatus !== 'syncing') {
      setSyncStatus('syncing');
      try {
        // await syncRef.current.sync();
        setSyncStatus('idle');
      } catch (error) {
        console.error('Manual sync failed:', error);
        setSyncStatus('error');
      }
    }
  }, [syncStatus]);

  return { syncStatus, manualSync };
}
