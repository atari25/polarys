import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { setBluetoothActive } from './risk-store';

type Status = { deviceName: string; connected: boolean; carConnected: boolean; hasSavedCar: boolean };
type BluetoothModule = {
  getStatus(): Status;
  saveCurrentCar(): boolean;
  forgetCar(): void;
};
const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<BluetoothModule>('PolarysBluetooth') : null;
const empty: Status = { deviceName: '', connected: false, carConnected: false, hasSavedCar: false };
let simulated: boolean | null = null;

export function __simulateBluetooth(active: boolean) {
  if (!__DEV__) return;
  simulated = active;
  setBluetoothActive(active);
}

export function useBluetoothDetection() {
  const [status, setStatus] = useState<Status>(empty);
  const [failed, setFailed] = useState(false);
  const refresh = () => {
    try {
      const next = native?.getStatus() ?? empty;
      setStatus(next);
      setFailed(false);
      setBluetoothActive(__DEV__ && simulated !== null ? simulated : next.carConnected);
    } catch {
      setStatus(empty);
      setFailed(true);
      setBluetoothActive(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearInterval(interval); listener.remove(); };
  }, []);

  return {
    ...status,
    available: native !== null && !failed,
    saveCar: () => {
      try {
        const saved = native?.saveCurrentCar() ?? false;
        simulated = null;
        refresh();
        return saved;
      } catch { return false; }
    },
    forgetCar: () => {
      native?.forgetCar();
      simulated = null;
      refresh();
    },
    useLiveDetection: () => { simulated = null; refresh(); },
  };
}
