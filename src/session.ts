// Legacy UI session store. Phase 2 introduces the pure persisted night-session model.
import { LEGACY_CONFIG } from './config';
import { useEffect, useRef, useState } from 'react';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface VenueSession {
  name: string;
  enteredAt: number;
  exitedAt?: number;
}

// Singleton mutable state — shared across the app without a Provider
let bluetoothActive = false;
let movingAtVehicleSpeed = false;
let venueSession: VenueSession | null = null;
let clockInterval: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function getMinutesAtVenue() {
  if (!venueSession) return 0;
  const end = venueSession.exitedAt ?? Date.now();
  return Math.max(0, Math.floor((end - venueSession.enteredAt) / 60_000));
}

function isInVenueRiskContext() {
  return venueSession !== null;
}

export function getRiskBreakdown() {
  const minutesAtVenue = getMinutesAtVenue();
  const timePoints = minutesAtVenue * LEGACY_CONFIG.pointsPerMinute;
  const bluetoothPoints = bluetoothActive && isInVenueRiskContext() ? LEGACY_CONFIG.bluetoothPoints : 0;
  const total = timePoints + bluetoothPoints;

  return {
    minutesAtVenue,
    timePoints,
    leftVenuePoints: venueSession?.exitedAt ? 0 : 0,
    bluetoothPoints,
    movingPoints: movingAtVehicleSpeed ? 0 : 0,
    total,
  };
}

export function getRiskScore() {
  return getRiskBreakdown().total;
}

export function getRiskLevel(): RiskLevel {
  const total = getRiskScore();
  if (total >= LEGACY_CONFIG.highPoints) return 'HIGH';
  if (total >= LEGACY_CONFIG.mediumPoints) return 'MEDIUM';
  return 'LOW';
}

export function getRiskLabel(level = getRiskLevel()) {
  if (level === 'HIGH') return "High risk — don't drive";
  if (level === 'MEDIUM') return 'Moderate risk — stay aware';
  return 'Visit monitoring active';
}

export function isBluetoothActive() {
  return bluetoothActive;
}

export function isMovingAtVehicleSpeed() {
  return movingAtVehicleSpeed;
}

export function getVenueSession() {
  return venueSession;
}

export function startVenueSession(name: string) {
  if (venueSession?.name === name && !venueSession.exitedAt) return;
  venueSession = { name, enteredAt: Date.now() };

  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(notify, LEGACY_CONFIG.clockIntervalMs);

  notify();
}

export function markVenueExited() {
  if (!venueSession?.exitedAt) {
    venueSession = venueSession ? { ...venueSession, exitedAt: Date.now() } : null;
    notify();
  }
}

export function endVenueSession({ resetRisk = true }: { resetRisk?: boolean } = {}) {
  venueSession = null;
  movingAtVehicleSpeed = false;
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  if (resetRisk) bluetoothActive = false;
  notify();
}

export function setBluetoothActive(active: boolean) {
  if (bluetoothActive === active) return;
  bluetoothActive = active;
  notify();
}

export function setMovingAtVehicleSpeed(active: boolean) {
  if (movingAtVehicleSpeed === active) return;
  movingAtVehicleSpeed = active;
  notify();
}

export function useRiskStore() {
  const [, forceUpdate] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener = () => {
      if (mountedRef.current) forceUpdate((n) => n + 1);
    };
    listeners.add(listener);
    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  return {
    riskLevel: getRiskLevel(),
    riskLabel: getRiskLabel(),
    riskScore: getRiskScore(),
    riskBreakdown: getRiskBreakdown(),
    bluetoothActive: isBluetoothActive(),
    movingAtVehicleSpeed: isMovingAtVehicleSpeed(),
    venueSession: getVenueSession(),
  };
}
