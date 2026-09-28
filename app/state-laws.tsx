import { AppColors } from '@/constants/theme';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getDuiStatsForState,
  getStateLawSummary,
  STATE_CODE_TO_NAME,
} from '@/services/state-laws';

export default function StateLawsScreen() {
  const params = useLocalSearchParams<{ stateCode?: string }>();
  const stateCode = typeof params.stateCode === 'string' ? params.stateCode.toUpperCase() : null;
  const law = getStateLawSummary(stateCode);
  const stats = law ? getDuiStatsForState(law.stateCode) : null;
  const stateName = law?.stateName ?? (stateCode ? STATE_CODE_TO_NAME[stateCode] ?? stateCode : 'State');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.kicker}>STATE LAWS</Text>
          <Text style={styles.title}>{stateName}</Text>
        </View>

        {law ? (
          <>
            <View style={styles.summaryRow}>
              <StatTile label="Legal BAC" value={stats?.legalLimit ?? '--'} />
              <StatTile label="Fine" value={stats?.fine ?? '--'} />
              <StatTile label="Suspension" value={stats?.suspension ?? '--'} />
            </View>

            <LawPoint number="1" title="Legal Limit" body={law.legalLimit} />
            <LawPoint number="2" title="Test Refusal / Non-Refusal" body={law.testConsequences} />
            <LawPoint number="3" title="License Suspension" body={law.licenseSuspension} />
            <LawPoint number="4" title="DUI Fine" body={law.duiFine} />

            <Pressable style={styles.sourceButton} onPress={() => void Linking.openURL(law.sourceUrl)}>
              <Text style={styles.sourceText}>{law.sourceLabel}</Text>
            </Pressable>
            <Text style={styles.note}>Summary only, not legal advice. Last reviewed {law.lastReviewed}.</Text>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.unsupportedTitle}>Verified summary unavailable</Text>
            <Text style={styles.unsupportedBody}>
              Polarys detected {stateName}, but verified DUI law data has not been added for this state yet.
              Legal limits, refusal penalties, suspension periods, and fines vary by state.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LawPoint({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.pointHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Text style={styles.pointTitle}>{title}</Text>
      </View>
      <Text style={styles.pointBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    gap: 8,
    paddingBottom: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: {
    color: AppColors.highlight,
    fontSize: 14,
    fontWeight: '800',
  },
  kicker: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 10,
  },
  title: {
    color: AppColors.highlight,
    fontSize: 34,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  statValue: {
    color: AppColors.highlight,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    gap: 12,
  },
  pointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
  },
  pointTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  pointBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 21,
  },
  sourceButton: {
    backgroundColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sourceText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  note: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  unsupportedTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  unsupportedBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 21,
  },
});
