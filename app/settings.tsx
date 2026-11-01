import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DEFAULT_API_URL, useTrack } from '../src/app/runtime';
import { useTheme } from '../src/ui/theme';

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const { apiUrl, saveApiUrl, includePending, setIncludePending, snapshot } = useTrack();
  const [url, setUrl] = useState(apiUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${url.trim().replace(/\/+$/, '')}/v1/health`, { signal: ctl.signal });
      clearTimeout(timer);
      setMsg(r.ok ? 'Reached the server.' : `The server answered with ${r.status}.`);
    } catch {
      setMsg('Could not reach that address. On a phone use your computer’s Wi-Fi address, not 10.0.2.2.');
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    try {
      await saveApiUrl(url);
      router.back();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    }
    setBusy(false);
  }

  const rejected = snapshot?.state.rejected;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
        <Text style={[s.h, { color: t.text }]}>Server address</Text>
        <Text style={{ color: t.sub, fontSize: 13 }}>
          Default {DEFAULT_API_URL}. Emulator: http://10.0.2.2:4010. A real phone: http://your-computer’s-Wi-Fi-address:4010.
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Server address"
          style={[s.input, { color: t.text, backgroundColor: t.chip }]}
        />
        {msg ? (
          <Text style={{ color: t.sub }} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable disabled={busy} onPress={test} accessibilityRole="button" style={[s.btn, { borderColor: t.accent }]}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>Test</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={save} accessibilityRole="button" style={[s.btn, { backgroundColor: t.accent, borderColor: t.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Save and sync</Text>
          </Pressable>
        </View>
        <Text style={{ color: t.sub, fontSize: 12 }}>Saving a new address keeps your saved transactions on screen and replaces them only once the new server has sent everything.</Text>
      </View>
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.h, { color: t.text }]}>Count pending in totals</Text>
            <Text style={{ color: t.sub, fontSize: 13 }}>Pending transactions are shown with a badge either way.</Text>
          </View>
          <Switch value={includePending} onValueChange={(v) => void setIncludePending(v)} accessibilityLabel="Count pending transactions in totals" />
        </View>
      </View>
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
        <Text style={[s.h, { color: t.text }]}>Data health</Text>
        <Text style={{ color: t.sub }}>
          {rejected && rejected.total > 0
            ? `${rejected.total} record(s) could not be read and are not counted: ${Object.entries(rejected.byReason)
                .map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`)
                .join(', ')}.`
            : 'Every record received was readable.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  h: { fontSize: 16, fontWeight: '700' },
  input: { height: 44, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
