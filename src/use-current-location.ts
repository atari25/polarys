import { useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { currentLocation, CurrentLocation } from './user-location';
export function useCurrentLocation() {
  const [location,setLocation] = useState<CurrentLocation | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setLocation(await currentLocation()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Location unavailable.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => {
    void refresh();
    const listener = AppState.addEventListener('change',state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); },60000);
    return () => { listener.remove(); clearInterval(timer); };
  },[refresh]);
  return { location,error,loading,refresh };
}
