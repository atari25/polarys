import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '@/constants/theme';

/** A points dial, not a measure of intoxication or fitness to drive. */
export function PointsGauge({ points, available = true }: { points: number; available?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const target = available ? Math.min(100, Math.max(0, points)) / 100 : 0;

  useEffect(() => {
    let active = true;
    const update = (reduceMotion: boolean) => {
      if (!active) return;
      progress.stopAnimation();
      if (reduceMotion) progress.setValue(target);
      else Animated.timing(progress, {
        toValue: target,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    // Stay still until the accessibility preference is known.
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { active = false; subscription.remove(); progress.stopAnimation(); };
  }, [progress, target]);

  return <View accessible accessibilityRole="image" accessibilityLabel={available ? `${points} activity points. Not a sobriety measure.` : 'Activity points unavailable.'} style={styles.container}>
    <View style={styles.dial} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: 41 }, (_, i) => {
        const angle = (-120 + i * 6) * Math.PI / 180;
        const major = i % 10 === 0;
        return <View key={i} style={[styles.tick, {
          left: 130 + Math.sin(angle) * 112 - (major ? 2 : 1),
          top: 130 - Math.cos(angle) * 112 - (major ? 9 : 5),
          width: major ? 4 : 2, height: major ? 18 : 10,
          backgroundColor: available && i / 40 <= target ? AppColors.highlight : AppColors.border,
          transform: [{ rotate: `${i * 6 - 120}deg` }],
        }]} />;
      })}
      <Text style={[styles.scale, styles.minimum]}>0</Text>
      <Text style={[styles.scale, styles.maximum]}>100+</Text>
      <Animated.View style={[styles.needlePivot, { transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-120deg', '120deg'] }) }] }]}>
        <View style={styles.needle} />
      </Animated.View>
      <View style={styles.hub} />
    </View>
    <Text style={styles.total}>{available ? points : '—'}</Text>
    <Text style={styles.label}>{available ? 'ACTIVITY POINTS' : 'UNAVAILABLE'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 8 },
  dial: { width: 260, height: 208 },
  tick: { position: 'absolute', borderRadius: 2 },
  scale: { position: 'absolute', top: 189, color: '#BAA69D', fontSize: 12 },
  minimum: { left: 20 }, maximum: { right: 12 },
  needlePivot: { position: 'absolute', left: 30, top: 30, width: 200, height: 200 },
  needle: { position: 'absolute', left: 98, top: 16, width: 4, height: 86, borderRadius: 2, backgroundColor: AppColors.highlight },
  hub: { position: 'absolute', left: 121, top: 121, width: 18, height: 18, borderRadius: 9, backgroundColor: AppColors.highlight, borderWidth: 5, borderColor: AppColors.accent },
  total: { color: AppColors.highlight, fontSize: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { color: '#BAA69D', fontSize: 11, letterSpacing: 2, marginTop: 4 },
});
