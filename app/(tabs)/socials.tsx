import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { deviceStorage as AsyncStorage, STORAGE_KEYS } from '@/src/storage';
import { AppColors as colors } from '@/constants/theme';
import snapshot from '@/data/football-snapshot.json';
import { FOOTBALL_SOURCE, parseFootballSchedule, upcomingSocials, SocialEvent } from '@/services/social-events';
const CACHE = STORAGE_KEYS.football;
const initial = { checkedAt: snapshot.checkedAt, games: snapshot.games as SocialEvent[] };
const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Could not open link', 'Please try again.'));
export default function SocialsScreen() {
  const [schedule, setSchedule] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('Saved official schedule');
  const [now, setNow] = useState(new Date());
  const [filter, setFilter] = useState('All');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    setNow(new Date());
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timeout = setTimeout(abort, 15000);
    try {
      const cached = await AsyncStorage.getItem(CACHE);
      if (cached && !signal?.aborted) {
        try {
          const parsed = JSON.parse(cached);
          if (typeof parsed.checkedAt === 'string' && Array.isArray(parsed.games) && parsed.games.every((g: SocialEvent) => typeof g.date === 'string' && typeof g.title === 'string' && typeof g.detail === 'string' && g.source === FOOTBALL_SOURCE && g.kind === 'Game day')) setSchedule(parsed);
        } catch { /* Use bundled schedule if cache is invalid. */ }
      }
      const response = await fetch(FOOTBALL_SOURCE, { signal: controller.signal });
      if (!response.ok) throw new Error('Schedule unavailable');
      const games = parseFootballSchedule(await response.text());
      if (signal?.aborted) return;
      const updated = { games, checkedAt: new Date().toISOString() };
      setSchedule(updated);
      setStatus('Updated from Iowa State Athletics');
      await AsyncStorage.setItem(CACHE, JSON.stringify(updated)).catch(() => {});
    } catch {
      if (!signal?.aborted) setStatus('Could not refresh · showing saved schedule. Check official listings for changes.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]));
  const events = upcomingSocials(schedule.games, now).filter(event => filter === 'All' || event.kind === filter);
  return <SafeAreaView style={styles.root} edges={['top','left','right']}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.highlight} />}>
      <Text style={styles.title}>Upcoming socials</Text>
      <Text style={styles.subtitle}>Cyclone game days and occasions to plan ahead for.</Text>
      <View style={styles.filters}>{['All','Game day','Social occasion'].map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.selected]}><Text style={{ color: filter === item ? '#111' : '#FFF' }}>{item}</Text></Pressable>)}</View>
      <Text style={styles.note}>{status}{'\n'}Last checked: {new Date(schedule.checkedAt).toLocaleDateString()} · Football · Times as published by Athletics.</Text>
      <Pressable accessibilityRole="link" onPress={() => void open(FOOTBALL_SOURCE)}><Text style={styles.link}>Official football schedule ↗</Text></Pressable>
      {events.length === 0 && <Text style={styles.subtitle}>No upcoming dates in this category. Check the official schedule for new announcements.</Text>}
      {events.map(event => <View key={event.id} style={styles.card}>
        <Text style={styles.date}>{new Date(`${event.date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short',year:'numeric',timeZone:'America/Chicago'})} · {event.kind}</Text>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.subtitle}>{event.detail}</Text>
        {event.source && <Pressable accessibilityRole="link" onPress={() => void open(event.source!)}><Text style={styles.link}>Confirm game details ↗</Text></Pressable>}
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/ride')}><Text style={styles.link}>Plan a safe ride →</Text></Pressable>
      </View>)}
      {filter !== 'Game day' && <View style={styles.card}>
        <Text style={styles.date}>LOCAL TRADITION · NEXT DATE UNCONFIRMED</Text>
        <Text style={styles.eventTitle}>801 Day · Ames</Text>
        <Text style={styles.subtitle}>An informal start-of-fall-semester tradition, usually the Saturday before classes. It is not August 1 or an official university event. We’ll show an exact date only when verified.</Text>
        <Pressable accessibilityRole="link" onPress={() => void open('https://www.registrar.iastate.edu/academic-calendars')}><Text style={styles.link}>Check the academic calendar ↗</Text></Pressable>
      </View>}
      <Text style={styles.note}>Social occasions are planning dates, not confirmed parties or predictions of anyone’s drinking. Local celebrations may take place on a different day.</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
 root:{flex:1,backgroundColor:colors.background},content:{padding:20,gap:16,paddingBottom:32},
 title:{fontSize:30,fontWeight:'800',color:colors.highlight},subtitle:{color:'#DDD',fontSize:14,lineHeight:21},
 filters:{flexDirection:'row',flexWrap:'wrap',gap:8},filter:{padding:12,borderRadius:24,backgroundColor:colors.surface,minHeight:44},selected:{backgroundColor:colors.highlight},
 card:{backgroundColor:colors.surface,borderRadius:18,borderLeftWidth:3,borderLeftColor:colors.accent,padding:18,gap:12},
 date:{color:colors.highlight,fontSize:12,fontWeight:'700'},eventTitle:{color:'#FFF',fontSize:20,fontWeight:'700'},link:{color:colors.highlight,fontSize:14,fontWeight:'600',paddingVertical:8},note:{color:'#AAA',fontSize:12,lineHeight:18},
});
