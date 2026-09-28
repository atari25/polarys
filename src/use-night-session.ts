import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { emptyNight, normalizeNight } from './night-session';
import { readNight, subscribeNight } from './night-store';
import { dispatchNight } from './night-controller';
export function useNightSession() {
  const [night, setNight] = useState(() => emptyNight(Date.now()));
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void readNight().then(value => { if (active) { setNight(normalizeNight(value, Date.now())); setError(false); } }).catch(() => { if (active) setError(true); }); };
    const unsubscribe = subscribeNight(refresh);
    void dispatchNight({ type: 'tick' }).then(refresh).catch(() => { if (active) setError(true); });
    const interval = setInterval(refresh, 1000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void dispatchNight({ type: 'tick' }).then(refresh).catch(() => { if (active) setError(true); }); });
    return () => { active = false; unsubscribe(); clearInterval(interval); listener.remove(); };
  }, []);
  return { night, error };
}
