import { AppColors } from '@/constants/theme';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLegalHelpContact, getStateLawSummary, STATE_CODE_TO_NAME } from '@/services/state-laws';

export default function GotDuiScreen() {
  const params = useLocalSearchParams<{ stateCode?: string }>();
  const stateCode = typeof params.stateCode === 'string' ? params.stateCode.toUpperCase() : null;
  const law = getStateLawSummary(stateCode);
  const contact = getLegalHelpContact(stateCode);
  const stateName = law?.stateName ?? (stateCode ? STATE_CODE_TO_NAME[stateCode] ?? stateCode : 'your state');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.kicker}>GOT A DUI?</Text>
          <Text style={styles.title}>{stateName}</Text>
          <Text style={styles.subtitle}>Stay calm, stop driving, and handle the next steps carefully.</Text>
        </View>

        <ChecklistItem number="1" title="Do not drive further" body="If you have been stopped, cited, or released, arrange a sober ride before doing anything else." />
        <ChecklistItem number="2" title="Save the paperwork" body="Keep the citation, temporary license paperwork, court date, tow information, and any testing paperwork together." />
        <ChecklistItem number="3" title="Write down the timeline" body="As soon as you can, note where you were, when you were stopped, whether a test was requested, and what paperwork you received." />
        <ChecklistItem number="4" title="Check license deadlines" body="DUI/OWI cases can have separate court and license deadlines. Missing either can make things worse." />
        <ChecklistItem number="5" title="Talk to a lawyer quickly" body="Ask specifically about DUI/OWI, license suspension, refusal consequences, and consultation cost before hiring anyone." />

        <View style={styles.contactCard}>
          <Text style={styles.contactKicker}>LEGAL HELP</Text>
          <Text style={styles.contactTitle}>{contact?.label ?? 'Local lawyer referral'}</Text>
          <Text style={styles.contactBody}>
            {contact?.note ?? 'Use your state or local bar association to find a licensed DUI/OWI attorney and compare fees.'}
          </Text>
          {contact ? (
            <View style={styles.contactActions}>
              <Pressable style={styles.actionButton} onPress={() => void Linking.openURL(`tel:${contact.phone}`)}>
                <Text style={styles.actionText}>Call {contact.phone}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void Linking.openURL(contact.url)}>
                <Text style={styles.secondaryText}>Open resource</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable
          style={styles.stateLawButton}
          onPress={() =>
            router.push({
              pathname: '/state-laws',
              params: { stateCode: stateCode ?? '' },
            })
          }>
          <Text style={styles.stateLawText}>View state law summary</Text>
        </Pressable>

        <Text style={styles.note}>This is general information, not legal advice.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChecklistItem({ number, title, body }: { number: string; title: string; body: string }) {
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
  subtitle: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 15,
    lineHeight: 21,
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
  contactCard: {
    backgroundColor: AppColors.highlight,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  contactKicker: {
    color: 'rgba(28,28,28,0.62)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  contactTitle: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '900',
  },
  contactBody: {
    color: 'rgba(28,28,28,0.74)',
    fontSize: 14,
    lineHeight: 20,
  },
  contactActions: {
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
  stateLawButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateLawText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  note: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
