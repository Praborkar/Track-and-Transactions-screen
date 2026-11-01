import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DEFAULT_API_URL, useTrack } from '../src/state/runtime';
import { card, font, theme as t } from '../src/ui/theme';

export default function Settings() {
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
    <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={[card, s.card]}>
        <Text style={s.h}>Server address</Text>
        <Text style={s.sub}>Default {DEFAULT_API_URL}. Emulator: http://10.0.2.2:4010. A real phone: your computer’s Wi-Fi address with :4010.</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Server address"
          style={s.input}
        />
        {msg ? (
          <Text style={[s.sub, { color: t.text }]} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable disabled={busy} onPress={test} accessibilityRole="button" style={[s.btn, { backgroundColor: t.card, borderColor: t.line, borderWidth: 1 }]}>
            <Text style={[s.btnText, { color: t.text }]}>Test</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={save} accessibilityRole="button" style={[s.btn, { backgroundColor: t.accent, flex: 1 }]}>
            <Text style={[s.btnText, { color: t.onAccent }]}>Save and sync</Text>
          </Pressable>
        </View>
        <Text style={s.sub}>Saving a new address keeps your saved transactions on screen and replaces them only once the new server has sent everything.</Text>
      </View>

      <View style={[card, s.card]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h}>Count pending in totals</Text>
            <Text style={s.sub}>Pending transactions are shown with a badge either way.</Text>
          </View>
          <Switch
            value={includePending}
            onValueChange={(v) => void setIncludePending(v)}
            trackColor={{ true: t.accent, false: '#D5DDEA' }}
            thumbColor="#fff"
            accessibilityLabel="Count pending transactions in totals"
          />
        </View>
      </View>

      <View style={[card, s.card]}>
        <Text style={s.h}>Data health</Text>
        <Text style={s.sub}>
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
  card: { padding: 16, gap: 10 },
  h: { fontSize: 15, fontFamily: font.semi, color: t.text },
  sub: { fontSize: 12.5, fontFamily: font.regular, color: t.sub },
  input: { height: 46, borderRadius: 23, paddingHorizontal: 16, fontSize: 14, fontFamily: font.regular, color: t.text, backgroundColor: t.chip },
  btn: { borderRadius: 23, paddingHorizontal: 20, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontFamily: font.semi },
});
