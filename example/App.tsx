import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VibeUpdate, checkVibeUpdate } from '@vibelabsdotto/vibeupdate';
import type { VibeUpdateError, VibeUpdateThemeOverride } from '@vibelabsdotto/vibeupdate';
import { UpdateDialog } from '@vibelabsdotto/vibeupdate/preview';
import type { Presentation } from '@vibelabsdotto/vibeupdate/preview';

const appId = process.env.EXPO_PUBLIC_VIBEUPDATE_APP_ID ?? 'app_H2RB9MHwYFaSFA5Y0VgWVdc2'; // Default belongs to this machine's local demo app.
const apiUrl = process.env.EXPO_PUBLIC_VIBEUPDATE_API_URL ?? 'http://localhost:3200';
// Shortens the 24-hour new-user period for local testing.
const newUserGracePeriodMs = process.env.EXPO_PUBLIC_VIBEUPDATE_NEW_USER_GRACE_MS ? Number(process.env.EXPO_PUBLIC_VIBEUPDATE_NEW_USER_GRACE_MS) : undefined;
const modes = ['optional', 'persistent', 'required', 'changelog'] as const;
type Mode = (typeof modes)[number];
type Theme = 'sdk' | 'coral' | 'dark';

const exampleNotes = '## Everything feels a little faster\n\nThis release makes everyday updates easier to follow. There is enough text here to wrap across several lines, so you can check that the entire message stays visible and the actions remain in place.\n\n- Faster startup, even when you open the app on a slower connection.\n- Clearer release notes with longer descriptions that wrap onto a second line instead of getting cut off.\n- Smaller fixes throughout the app.';
const coralTheme: VibeUpdateThemeOverride = {
  surface: '#FAFAF7', elevatedSurface: '#F1F1EC', text: '#16232E', mutedText: '#4A5A66',
  accent: '#FF6B4A', accentText: '#16232E', border: '#E2E2DA', pressed: '#F1573A',
};
const darkTheme: VibeUpdateThemeOverride = {
  surface: '#0B0C0E', elevatedSurface: '#1C1D21', text: '#F2F2F2', mutedText: '#A8A8A8',
  accent: '#FF7A5C', accentText: '#0B0C0E', border: '#232529', pressed: '#FF8C72',
};

function contrastText(hex: string): string {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance > 0.179 ? '#0B0C0E' : '#FFFFFF';
}

function Choice<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly { value: T; title: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            onPress={() => onChange(option.value)}
            style={[styles.choice, value === option.value && styles.selectedChoice]}
          >
            <Text style={[styles.choiceText, value === option.value && styles.selectedChoiceText]}>{option.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [generation, setGeneration] = useState(0);
  const [live, setLive] = useState(false);
  const [result, setResult] = useState('Noch keine API-Abfrage.');
  const [mode, setMode] = useState<Mode>('optional');
  const [locale, setLocale] = useState<'de' | 'en'>('en');
  const [theme, setTheme] = useState<Theme>('sdk');
  const [buttonColor, setButtonColor] = useState('');
  const [version, setVersion] = useState('1.2.0');
  const [notes, setNotes] = useState(exampleNotes);
  const [cta, setCta] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const onError = useCallback((error: VibeUpdateError) => {
    setResult(`SDK error: ${error.code} — ${error.message}`);
  }, []);

  const preview: Presentation = mode === 'changelog'
    ? { kind: 'changelog', changelog: { buildNumber: 1, version: version.trim() || '1.2.0', markdown: notes, locale } }
    : { kind: mode, update: {
      mode, targetBuildNumber: 2, version: version.trim() || '1.2.0',
      storeUrl: 'https://apps.apple.com/', changelog: notes, changelogLocale: locale,
    } };
  const presetTheme = theme === 'sdk' ? undefined : theme === 'coral' ? coralTheme : darkTheme;
  const customAccent = /^#[0-9a-fA-F]{6}$/.test(buttonColor.trim()) ? buttonColor.trim() : null;
  const previewTheme: VibeUpdateThemeOverride | undefined = customAccent
    ? { ...presetTheme, accent: customAccent, pressed: customAccent, accentText: contrastText(customAccent) }
    : presetTheme;

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
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style={previewOpen && theme === 'dark' ? 'light' : 'dark'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>VIBEUPDATE / PLAYGROUND</Text>
          <Text style={styles.title}>Update-Dialoge ansehen</Text>
          <Text style={styles.hint}>Vorschau ohne Backend oder gespeicherten Status. Sie verwendet den echten SDK-Dialog. Der ist derzeit ein Vollbild-Modal, kein Bottom Sheet.</Text>

          <View style={styles.card}>
            <Choice label="Darstellung" options={modes.map(value => ({ value, title: value === 'changelog' ? 'Neuigkeiten' : value === 'required' ? 'Pflicht' : value === 'persistent' ? 'Wiederholt' : 'Optional' }))} value={mode} onChange={setMode} />
            <Choice label="Sprache" options={[{ value: 'de', title: 'Deutsch' }, { value: 'en', title: 'English' }]} value={locale} onChange={setLocale} />
            <Choice label="Farben" options={[{ value: 'sdk', title: 'SDK' }, { value: 'coral', title: 'Coral' }, { value: 'dark', title: 'Dunkel' }]} value={theme} onChange={setTheme} />
            <View style={styles.field}>
              <Text style={styles.label}>Button-Farbe (optional)</Text>
              <TextInput accessibilityLabel="Button-Farbe" value={buttonColor} onChangeText={setButtonColor} style={styles.input} placeholder="#FF6B4A" autoCorrect={false} autoCapitalize="none" maxLength={7} />
              {buttonColor.length > 0 && !customAccent && <Text style={styles.validation}>Bitte einen sechsstelligen Hex-Wert eingeben, zum Beispiel #FF6B4A.</Text>}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Version</Text>
              <TextInput accessibilityLabel="Version" value={version} onChangeText={setVersion} style={styles.input} placeholder="1.2.0" autoCorrect={false} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Release Notes (Markdown)</Text>
              <TextInput accessibilityLabel="Release Notes" value={notes} onChangeText={setNotes} style={[styles.input, styles.notes]} multiline textAlignVertical="top" />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Button-Text (optional)</Text>
              <TextInput accessibilityLabel="Button-Text" value={cta} onChangeText={setCta} style={styles.input} placeholder="SDK-Standard" />
            </View>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={() => setPreviewOpen(true)}>
              <Text style={styles.primaryText}>Vorschau öffnen</Text>
            </Pressable>
            <Text style={styles.finePrint}>In der Vorschau schließt „Update Now“ nur den Dialog. Es öffnet keinen Store.</Text>
          </View>

          <Text style={styles.sectionTitle}>Live-Integration</Text>
          <Text style={styles.hint}>Separat von der Vorschau. Benötigt eine laufende API unter {apiUrl}. Build 1 · {Platform.OS}.</Text>
          <View style={styles.liveActions}>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setLive(value => !value)}><Text style={styles.secondaryText}>{live ? 'SDK deaktivieren' : 'SDK aktivieren'}</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void check(); }}><Text style={styles.secondaryText}>API prüfen</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setGeneration(value => value + 1)}><Text style={styles.secondaryText}>SDK neu laden</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void reset(); }}><Text style={styles.secondaryText}>SDK-Status zurücksetzen</Text></Pressable>
          </View>
          <Text selectable style={styles.output}>{result}</Text>
        </ScrollView>
        {live && <VibeUpdate key={generation} appId={appId} apiUrl={apiUrl} onError={onError} {...(newUserGracePeriodMs === undefined ? {} : { newUserGracePeriodMs })} />}
        {previewOpen && (
          <UpdateDialog
            presentation={preview}
            locale={locale}
            theme={previewTheme}
            stringOverrides={cta.trim() ? { updateNow: cta.trim() } : locale === 'en' ? { updateNow: 'Update Now' } : undefined}
            onDismiss={() => setPreviewOpen(false)}
            onOpenStore={() => setPreviewOpen(false)}
            onOpenLink={() => { /* Preview never opens external links. */ }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF7' },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  eyebrow: { color: '#179E90', fontWeight: '800', fontSize: 11, letterSpacing: 2 },
  title: { color: '#16232E', fontSize: 29, fontWeight: '700', letterSpacing: -0.6 },
  hint: { fontSize: 14, lineHeight: 21, color: '#4A5A66' },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E2DA', borderRadius: 20, padding: 18, gap: 20 },
  field: { gap: 9 },
  label: { fontSize: 13, fontWeight: '700', color: '#16232E' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#E2E2DA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 13, backgroundColor: '#F1F1EC' },
  selectedChoice: { borderColor: '#1FB6A6', backgroundColor: '#DDF5F1' },
  choiceText: { color: '#4A5A66', fontSize: 13, fontWeight: '600' },
  selectedChoiceText: { color: '#16232E' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#E2E2DA', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', fontSize: 15, color: '#16232E' },
  notes: { minHeight: 120, lineHeight: 21 },
  primary: { minHeight: 50, borderRadius: 12, backgroundColor: '#FF6B4A', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#16232E', fontWeight: '700', fontSize: 16 },
  finePrint: { fontSize: 12, lineHeight: 18, color: '#4A5A66' },
  validation: { fontSize: 12, lineHeight: 18, color: '#E5484D' },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: '#16232E', marginTop: 12 },
  liveActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondary: { borderWidth: 1, borderColor: '#E2E2DA', borderRadius: 12, padding: 11, backgroundColor: '#FFF' },
  secondaryText: { color: '#16232E', fontSize: 13, fontWeight: '600' },
  output: { fontFamily: 'Menlo', fontSize: 11, lineHeight: 17, color: '#4A5A66' },
});
