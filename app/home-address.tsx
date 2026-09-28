import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { AddressSuggestion, findFullAddress, readHome, resolveAddress, saveHome, suggestAddresses } from '@/src/home-address';
import { HomeAddress } from '@/src/ride-links';
export default function HomeAddressScreen() {
  const [input,setInput] = useState('');
  const [results,setResults] = useState<AddressSuggestion[]>([]);
  const [selected,setSelected] = useState<HomeAddress | null>(null);
  const [busy,setBusy] = useState(false);
  const [searching,setSearching] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const revision = useRef(0);
  useEffect(() => { void readHome().then(home => { if (home && revision.current === 0) { setInput(home.address === 'Home' ? '' : home.address); setSelected(home.address === 'Home' ? null : home); } }); },[]);
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
    <Text style={styles.title}>Home address</Text>
    <Text style={styles.body}>Where should your ride take you?</Text>
    <TextInput accessibilityLabel="Home street address" placeholder="Street address, city, state" placeholderTextColor="#B9A497" value={input}
      editable={!busy} autoCorrect={false} autoComplete="street-address" style={styles.input}
      onChangeText={value => { revision.current++; setInput(value); setSelected(null); setResults([]); setError(null); }} />
    {!selected && <Pressable accessibilityRole="button" disabled={busy || input.trim().length < 4} onPress={() => void find()}><Text style={styles.body}>{busy ? 'Finding your address…' : 'Find address'}</Text></Pressable>}
    {searching && <Text accessibilityLiveRegion="polite" style={styles.hint}>Looking up addresses…</Text>}
    {results.map(result => <Pressable key={result.id} disabled={busy} accessibilityRole="button" onPress={() => void choose(result)} style={styles.result}><Text style={styles.body}>{result.address}</Text></Pressable>)}
    {results.some(result => result.source === 'google') && <Image accessibilityLabel="Powered by Google" source={{uri:'https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png'}} style={{width:120,height:18,backgroundColor:'#FFF'}} resizeMode="contain" />}
    {error && <Text accessibilityLiveRegion="polite" style={styles.body}>{error}</Text>}
    {selected && <View style={styles.result}><Text style={styles.body}>{selected.address}</Text><Text style={styles.hint}>Check this address, then tap Save home address</Text></View>}
    <Pressable accessibilityRole="button" disabled={input.trim().length < 4 || busy} style={[styles.button,(input.trim().length < 4 || busy) && {opacity:0.4}]} onPress={() => {
      if (!selected) { void find(); return; }
      setBusy(true); void saveHome(selected).then(() => router.back()).catch(() => Alert.alert('Could not save home','Please try again.')).finally(() => setBusy(false));
    }}><Text style={styles.buttonText}>{busy ? 'Please wait…' : selected ? 'Save home address' : 'Find & review home address'}</Text></Pressable>
    <Text style={styles.hint}>Used for Uber, Lyft, transit, and ending your night at home. You review and book the ride in the ride app.</Text>
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:AppColors.background},content:{padding:24,gap:16},title:{color:AppColors.highlight,fontSize:28,fontWeight:'700'},
 body:{color:AppColors.highlight,fontSize:16,lineHeight:23},hint:{color:'#C6B4A8',fontSize:13,lineHeight:19},
 input:{color:AppColors.highlight,backgroundColor:AppColors.surface,borderWidth:1,borderColor:AppColors.border,borderRadius:12,padding:16,fontSize:16},
 result:{backgroundColor:AppColors.surface,padding:16,borderRadius:12,gap:8},button:{backgroundColor:AppColors.highlight,padding:18,borderRadius:14},
 buttonText:{color:AppColors.background,fontWeight:'700',textAlign:'center'},
});
