import { openRide, openTransitHome, textFriendWithLocation } from '@/src/ride-actions';
import { AppColors } from '@/constants/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRiskStore } from '@/services/risk-store';

type Step =
  | 'leaving'
  | 'transport'
  | 'drinks'
  | 'ride-options'
  | 'none';

interface Props {
  barName: string;
  onDismiss: () => void;
}

export function GeofenceExitFlow({ barName, onDismiss }: Props) {
  const [step, setStep] = useState<Step>('leaving');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { bluetoothActive, venueSession } = useRiskStore();
  const bluetoothRiskActive = bluetoothActive && venueSession !== null;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [slideAnim]);

  const animateOut = useCallback(
    (callback: () => void) => {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }).start(callback);
    },
    [slideAnim]
  );

  const dismiss = useCallback(() => {
    animateOut(() => {
      setStep('none');
      onDismiss();
    });
  }, [animateOut, onDismiss]);

  const advance = useCallback(
    (next: Step) => {
      animateOut(() => {
        setStep(next);
        slideAnim.setValue(300);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 10,
        }).start();
      });
    },
    [animateOut, slideAnim]
  );

  const runRideAction = async (action: () => Promise<void>) => {
    try { await action(); dismiss(); }
    catch (error) { Alert.alert('Could not open ride option', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const openUber = () => runRideAction(() => openRide('uber'));
  const openLyft = () => runRideAction(() => openRide('lyft'));
  const openTransit = () => runRideAction(openTransitHome);
  const textFriend = () => runRideAction(textFriendWithLocation);

  if (step === 'none') return null;

  const btnStyle = bluetoothRiskActive ? styles.buttonDanger : styles.buttonNormal;
  const btnTextStyle = bluetoothRiskActive ? styles.buttonTextDanger : styles.buttonText;

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {bluetoothActive && (
            <View style={[styles.btBanner, bluetoothRiskActive ? styles.btBannerDanger : styles.btBannerSafe]}>
              <Text style={styles.btBannerText}>
                {bluetoothRiskActive
                  ? "⚠️ Bluetooth is connected - Don't drive!"
                  : 'Bluetooth is connected'}
              </Text>
            </View>
          )}

          {step === 'leaving' && (
            <StepLeaving
              barName={barName}
              onYes={() => advance('transport')}
              onNo={dismiss}
              btnStyle={btnStyle}
              btnTextStyle={btnTextStyle}
            />
          )}

          {step === 'transport' && (
            <StepTransport
              onSober={dismiss}
              onDriving={() => advance('drinks')}
              btnStyle={btnStyle}
              btnTextStyle={btnTextStyle}
            />
          )}

          {step === 'drinks' && (
            <StepDrinks
              onNoDrinks={dismiss}
              onHadDrinks={() => advance('ride-options')}
              btnStyle={btnStyle}
              btnTextStyle={btnTextStyle}
            />
          )}

          {step === 'ride-options' && (
            <StepRideOptions
              onUber={() => void openUber()}
              onLyft={() => void openLyft()}
              onTransit={() => void openTransit()}
              onText={() => void textFriend()}
              btnStyle={btnStyle}
              btnTextStyle={btnTextStyle}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Sub-step components ──────────────────────────────────────────────────────

function StepLeaving({
  barName, onYes, onNo, btnStyle, btnTextStyle,
}: {
  barName: string;
  onYes: () => void;
  onNo: () => void;
  btnStyle: object;
  btnTextStyle: object;
}) {
  return (
    <>
      <Text style={styles.title}>Are you leaving {barName}?</Text>
      <Pressable style={[styles.button, btnStyle]} onPress={onYes}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>Yes</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onNo}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>No</Text>
      </Pressable>
    </>
  );
}

function StepTransport({
  onSober, onDriving, btnStyle, btnTextStyle,
}: {
  onSober: () => void;
  onDriving: () => void;
  btnStyle: object;
  btnTextStyle: object;
}) {
  return (
    <>
      <Text style={styles.title}>How are you{'\n'}getting home?</Text>
      <Pressable style={[styles.button, btnStyle]} onPress={onDriving}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>{"I'm driving"}</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onDriving}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>My friend is driving</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onSober}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>I have a sober ride</Text>
      </Pressable>
    </>
  );
}

function StepDrinks({
  onNoDrinks, onHadDrinks, btnStyle, btnTextStyle,
}: {
  onNoDrinks: () => void;
  onHadDrinks: () => void;
  btnStyle: object;
  btnTextStyle: object;
}) {
  return (
    <>
      <Text style={styles.title}>How many drinks have you had?</Text>
      <Pressable style={[styles.button, btnStyle]} onPress={onNoDrinks}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>0</Text>
      </Pressable>
      {(['1-3', '3-5', '5+'] as const).map((label) => (
        <Pressable key={label} style={[styles.button, btnStyle]} onPress={onHadDrinks}>
          <Text style={[styles.buttonLabel, btnTextStyle]}>{label}</Text>
        </Pressable>
      ))}
    </>
  );
}

function StepRideOptions({
  onUber, onLyft, onTransit, onText, btnStyle, btnTextStyle,
}: {
  onUber: () => void;
  onLyft: () => void;
  onTransit: () => void;
  onText: () => void;
  btnStyle: object;
  btnTextStyle: object;
}) {
  return (
    <>
      <Text style={styles.title}>How to get home?</Text>
      <Pressable style={[styles.button, btnStyle]} onPress={onUber}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>Get Uber</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onLyft}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>Get Lyft</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onTransit}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>Public Transit</Text>
      </Pressable>
      <Pressable style={[styles.button, btnStyle]} onPress={onText}>
        <Text style={[styles.buttonLabel, btnTextStyle]}>Text a Friend</Text>
      </Pressable>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  btBanner: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  btBannerDanger: {
    backgroundColor: AppColors.accent,
  },
  btBannerSafe: {
    backgroundColor: '#444444',
  },
  btBannerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonNormal: {
    backgroundColor: '#E5E5E5',
  },
  buttonDanger: {
    backgroundColor: AppColors.accent,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
  },
  buttonText: {
    color: '#111111',
  },
  buttonTextDanger: {
    color: '#FFFFFF',
  },
  buttonTextSafe: {
    color: '#FFFFFF',
  },
});
