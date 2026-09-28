import { AppColors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RiskLevel, VenueSession } from '@/services/risk-store';

interface Props {
  riskLevel: RiskLevel;
  riskLabel: string;
  venueSession: VenueSession | null;
  bluetoothActive: boolean;
  onPress: () => void;
}

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: '#BBBBBB',
  MEDIUM: AppColors.highlight,
  HIGH: AppColors.accent,
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function useElapsed(enteredAt: number | null): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enteredAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enteredAt]);

  return enteredAt ? now - enteredAt : 0;
}

export function RiskCard({ riskLevel, riskLabel, venueSession, bluetoothActive, onPress }: Props) {
  const color = RISK_COLOR[riskLevel];
  const elapsed = useElapsed(venueSession?.enteredAt ?? null);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.riskBadge, { borderColor: color }]}>
        <Text style={styles.riskKicker}>RISK STATUS</Text>
        <Text style={[styles.riskLevel, { color }]}>{riskLabel}</Text>
      </View>

      {venueSession ? (
        <View style={styles.venueRow}>
          <View style={styles.venueDot} />
          <View>
            <Text style={styles.venueName}>{venueSession.name}</Text>
            <Text style={styles.venueTime}>{formatElapsed(elapsed)} at venue</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noVenue}>No bar or nightclub detected nearby</Text>
      )}

      {bluetoothActive && venueSession && (
        <View style={styles.btRow}>
          <Text style={styles.btText}>⚠️  Car Bluetooth connected</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  riskBadge: {
    alignItems: 'flex-start',
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  riskKicker: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  riskLevel: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 6,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  venueDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  venueName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  venueTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  noVenue: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
  },
  btRow: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
});
