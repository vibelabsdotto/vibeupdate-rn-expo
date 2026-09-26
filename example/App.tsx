import { useCallback, useState } from 'react';
import { Button, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VibeUpdate, checkVibeUpdate } from '@vibelabsdotto/vibeupdate';
import type { VibeUpdateError } from '@vibelabsdotto/vibeupdate';

const appId = process.env.EXPO_PUBLIC_VIBEUPDATE_APP_ID ?? 'app_H2RB9MHwYFaSFA5Y0VgWVdc2'; // Default belongs to this machine's local demo app.
const apiUrl = process.env.EXPO_PUBLIC_VIBEUPDATE_API_URL ?? 'http://localhost:3200';

export default function App() {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState('Press Check to inspect the live API response.');
  const onError = useCallback((error: VibeUpdateError) => {
    setResult(`SDK error: ${error.code} — ${error.message}`);
  }, []);
  const check = async () => {
    setResult('Checking…');
    const response = await checkVibeUpdate({ appId, apiUrl, onError });
    setResult(response ? JSON.stringify(response, null, 2) : 'No trustworthy SDK response');
  };
  const reset = async () => {
    const prefix = `@vibelabsdotto/vibeupdate:v1:${encodeURIComponent(appId)}:${Platform.OS}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix));
    await AsyncStorage.multiRemove(keys);
    setResult(`Cleared ${keys.length} local SDK keys. Tap Remount SDK to recheck.`);
  };
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>VibeUpdate SDK demo</Text>
        <Text>Native build 1 · {Platform.OS} · {apiUrl}</Text>
        <Text style={styles.hint}>The SDK checks after mount. Reload it to inspect each newly published release. Optional updates are shown once per target build; Required and Persistent repeat.</Text>
        <View style={styles.buttons}>
          <Button title="Check API" onPress={() => { void check(); }} />
          <Button title="Remount SDK" onPress={() => setGeneration(value => value + 1)} />
          <Button title="Reset demo state" onPress={() => { void reset(); }} />
        </View>
        <Text selectable style={styles.output}>{result}</Text>
      </ScrollView>
      <VibeUpdate key={generation} appId={appId} apiUrl={apiUrl} onError={onError} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700' },
  hint: { fontSize: 15, lineHeight: 22, color: '#525252' },
  buttons: { gap: 8 },
  output: { fontFamily: 'Menlo', fontSize: 11, lineHeight: 17 },
});
