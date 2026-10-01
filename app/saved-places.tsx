import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { AddressSuggestion, findFullAddress, resolveAddress, suggestAddresses } from '@/src/home-address';
import { HomeAddress } from '@/src/ride-links';
import { SavedPlace, readSavedPlaces, savePlace, removeSavedPlace } from '@/src/saved-places';
import { refreshSavedPlaceMonitoring } from '@/src/geofencing';
import * as Location from 'expo-location';
import { getNotificationPermission } from '@/src/notifications';
export default function SavedPlacesScreen() {
  const [places,setPlaces] = useState<SavedPlace[]>([]);
  const [name,setName] = useState('');
  const [status,setStatus] = useState<string | null>(null);
  const [input,setInput] = useState('');
  const [results,setResults] = useState<AddressSuggestion[]>([]);
  const [selected,setSelected] = useState<HomeAddress | null>(null);
  const [busy,setBusy] = useState(false);
  const [searching,setSearching] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const revision = useRef(0);
  useEffect(() => { void readSavedPlaces().then(setPlaces).catch(() => setError('Could not load your saved places.')); },[]);
  async function updateMonitoring() {
    try {
      await refreshSavedPlaceMonitoring();
      const permission = await Location.getBackgroundPermissionsAsync();
      const notifications = await getNotificationPermission();
      setStatus(permission.granted && notifications
        ? 'Saved places are ready for nighttime reminders.'
        : 'Saved. Enable Always location, Precise Location, and notifications in Settings for departure reminders.');
    } catch { setStatus('Your changes are saved, but monitoring could not update. Reopen Polarys with location enabled to retry.'); }
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await savePlace(selected, name);
      setPlaces(await readSavedPlaces());
      revision.current++; setInput(''); setName(''); setSelected(null); setResults([]);
      await updateMonitoring();
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save this place.'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError(null); setStatus(null);
    try { await removeSavedPlace(id); setPlaces(await readSavedPlaces()); await updateMonitoring(); }
    catch { setError('Could not remove this place. Please try again.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (selected || input.trim().length < 4) { setResults([]); setSearching(false); return; }
    const request = new AbortController(), version = revision.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void suggestAddresses(input,request.signal).then(values => {
        if (!request.signal.aborted && version === revision.current) { setResults(values); setError(values.length ? null : 'No matches yet. Include your street number, city, and state.'); }
      }).catch(e => { if (!request.signal.aborted && version === revision.current) setError(e.message || 'Address lookup is unavailable. Try your full address.'); }).finally(() => { if (!request.signal.aborted && version === revision.current) setSearching(false); });
    },800);
    return () => { clearTimeout(timer); request.abort(); };
  },[input,selected]);
  async function choose(suggestion: AddressSuggestion) {
    revision.current++; setSearching(false); setBusy(true); setError(null); const version = revision.current;
    try {
      const home = await resolveAddress(suggestion);
      if (version === revision.current) { setSelected(home); setInput(home.address); setResults([]); }
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load this address.'); }
    finally { setBusy(false); }
  }
  async function find() {
    revision.current++; setSearching(false); setBusy(true); setError(null);
    try {
      const values = await findFullAddress(input);
      setResults(values);
      if (values.length === 1 && values[0].coordinates) {
        setSelected(values[0].coordinates); setInput(values[0].address); setResults([]);
      } else if (!values.length) setError('No match. Include the street number, city, and state.');
      else setError('Choose your address below, then save it.');
    }
    catch { setError('Address search is unavailable. Try again with your full street address.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.root}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.body}>‹ Settings</Text></Pressable>
    <Text style={styles.title}>I do stupid stuff here</Text>
    <Text style={styles.body}>A friend’s place, a house party, or somewhere you want a reminder to get home safely.</Text>
    <Text style={styles.hint}>Like bars: monitored from 9 PM–5 AM. Leaving after 45+ accumulated venue minutes can send “How are you getting home?” The same night session and one departure reminder apply across bars and saved places.</Text>
    <Text style={styles.hint}>Your saved home still ends your night, so use a different address here.</Text>
    {places.map(place => <View key={place.id} style={styles.result}>
      <Text style={styles.body}>{place.name}</Text><Text style={styles.hint}>{place.address}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name}`} disabled={busy} onPress={() => Alert.alert('Remove this place?', 'Polarys will stop monitoring this saved address.', [{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>void remove(place.id)}])}><Text style={styles.body}>Remove</Text></Pressable>
    </View>)}
    <Text style={styles.body}>Add a place</Text>
    <TextInput accessibilityLabel="Place nickname" placeholder="Nickname (optional)" placeholderTextColor="#B9A497" value={name} onChangeText={setName} editable={!busy} maxLength={80} style={styles.input} />
    <TextInput accessibilityLabel="Place street address" placeholder="Street address, city, state" placeholderTextColor="#B9A497" value={input}
      editable={!busy} autoCorrect={false} autoComplete="street-address" style={styles.input}
      onChangeText={value => { revision.current++; setInput(value); setSelected(null); setResults([]); setError(null); }} />
    {!selected && <Pressable accessibilityRole="button" disabled={busy || input.trim().length < 4} onPress={() => void find()}><Text style={styles.body}>{busy ? 'Finding your address…' : 'Find address'}</Text></Pressable>}
    {searching && <Text accessibilityLiveRegion="polite" style={styles.hint}>Looking up addresses…</Text>}
    {results.map(result => <Pressable key={result.id} disabled={busy} accessibilityRole="button" onPress={() => void choose(result)} style={styles.result}><Text style={styles.body}>{result.address}</Text></Pressable>)}
    {results.some(result => result.source === 'google') && <Image accessibilityLabel="Powered by Google" source={{uri:'https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png'}} style={{width:120,height:18,backgroundColor:'#FFF'}} resizeMode="contain" />}
    {error && <Text accessibilityLiveRegion="polite" style={styles.body}>{error}</Text>}
    {selected && <View style={styles.result}><Text style={styles.body}>{selected.address}</Text><Text style={styles.hint}>Check the full address, then tap Save place</Text></View>}
    <Pressable accessibilityRole="button" disabled={!selected || busy} style={[styles.button,(!selected || busy) && {opacity:0.4}]} onPress={() => void save()}><Text style={styles.buttonText}>{busy ? 'Please wait…' : 'Save place'}</Text></Pressable>
    {status && <Text accessibilityLiveRegion="polite" style={styles.body}>{status}</Text>}
    <Text style={styles.hint}>Up to 10 places. Saved on this phone until you remove them. Address search uses Google or your device’s location service. Drink answers are not saved.</Text>

  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:AppColors.background},content:{padding:24,gap:16},title:{color:AppColors.highlight,fontSize:28,fontWeight:'700'},
 body:{color:AppColors.highlight,fontSize:16,lineHeight:23},hint:{color:'#C6B4A8',fontSize:13,lineHeight:19},
 input:{color:AppColors.highlight,backgroundColor:AppColors.surface,borderWidth:1,borderColor:AppColors.border,borderRadius:12,padding:16,fontSize:16},
 result:{backgroundColor:AppColors.surface,padding:16,borderRadius:12,gap:8},button:{backgroundColor:AppColors.highlight,padding:18,borderRadius:14},
 buttonText:{color:AppColors.background,fontWeight:'700',textAlign:'center'},
});
