import React from 'react';
import { Sync } from '../lib/sync';
import { useAuth } from '@/contexts/AuthContext';

export function useSync(
  deviceId: string
) {
  const { user } = useAuth()
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'error'>('idle');
  const syncRef = React.useRef<Sync | null>(null);

  React.useEffect(() => {
    if (!user?.premium) {
      return;
    }

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
  }, [deviceId, user?.premium]);

  const manualSync = React.useCallback(async () => {
    if (!user?.premium) {
      console.warn('Manual sync is only available for premium users.');
      return;
    }

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
  }, [syncStatus, user?.premium]);

  return { syncStatus, manualSync };
}
