import React from 'react';
import { Sync } from '../lib/sync';
import { useAuth } from '@/contexts/AuthContext';

export function useSync(
  deviceId: string
) {
  const { user, isPremium } = useAuth()
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'error'>('idle');
  const syncRef = React.useRef<Sync | null>(null);

  React.useEffect(() => {
    if (!isPremium) {
      return;
    }

    const initializeSync = async () => {
      try {
        setSyncStatus('syncing');
        syncRef.current = new Sync(deviceId);

        // Initial pull sync on app load (pass premium activation timestamp)
        await syncRef.current.pull(user?.premium?.activatedAt);

        setSyncStatus('idle');
      } catch (error) {
        console.error('Initial sync failed:', error);
        setSyncStatus('error');
      }
    };

    initializeSync();
  }, [deviceId, isPremium, user?.premium?.activatedAt]);

  const manualSync = React.useCallback(async () => {
    if (!isPremium) {
      console.warn('Manual sync is only available for premium users.');
      return;
    }

    if (syncRef.current && syncStatus !== 'syncing') {
      setSyncStatus('syncing');
      try {
        await syncRef.current.pull(user?.premium?.activatedAt);
        setSyncStatus('idle');
      } catch (error) {
        console.error('Manual sync failed:', error);
        setSyncStatus('error');
      }
    }
  }, [syncStatus, isPremium, user?.premium?.activatedAt]);

  return { syncStatus, manualSync };
}
