import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatInr, formatIst, formatMoney, formatUtc } from '../../src/domain';
import { useTrack } from '../../src/state/runtime';
import { Badge } from '../../src/ui/components';
import { card, font, iconFor, theme as t } from '../../src/ui/theme';

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useTrack((s) => s.snapshot);
  const [raw, setRaw] = useState(false);
  const txn = snapshot?.ledger.txns.get(String(id));
  const name = (accId: string | null) => {
    if (!accId) return null;
    const a = snapshot?.accounts.find((x) => x.id === accId);
    return a ? `${a.nickname} (${a.bank}, ending ${a.last4})` : accId;
  };

  if (!txn) {
    return (
      <View style={s.center}>
        <Text style={{ color: t.text, fontSize: 16, fontFamily: font.semi }}>This transaction is no longer available.</Text>
        <Text style={{ color: t.sub, marginTop: 6, textAlign: 'center', fontFamily: font.regular }}>It may have been removed in the latest sync.</Text>
      </View>
    );
  }

  const foreign = txn.currency !== 'INR';
  const icon = iconFor(txn.category);
  const debit = txn.direction === 'debit';
  const color = txn.isTransfer ? t.sub : debit ? t.spent : t.earned;
  const rows: Array<[string, string]> = [
    ['Merchant', txn.merchant || 'Unnamed'],
    ['Amount', foreign ? `${formatMoney(txn.amountMinor, txn.currency)}${txn.inrMinor !== null ? `, ${formatInr(txn.inrMinor)}` : ' (not converted to rupees)'}` : formatInr(txn.amountMinor)],
    ['Type', `${debit ? 'Money out' : 'Money in'}${txn.isTransfer ? ' - transfer between your own accounts, not counted as spent or earned' : ''}`],
    ['Status', txn.status === 'PENDING' ? 'Pending' : 'Posted'],
    ['When (IST)', formatIst(txn.occurredAt)],
    ['When (UTC)', formatUtc(txn.occurredAt)],
    ['Category', txn.category],
    ['Account', name(txn.accountId) ?? txn.accountId],
  ];
  if (txn.counterAccountId) rows.push([debit ? 'Sent to' : 'Received from', name(txn.counterAccountId) ?? txn.counterAccountId]);
  rows.push(['Last updated', txn.updatedAt ? formatIst(txn.updatedAt) : 'Not recorded']);
  rows.push(['Transaction ID', txn.id]);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
      <View style={[card, s.hero]}>
        <View style={[s.avatar, { backgroundColor: icon.bg }]} importantForAccessibility="no-hide-descendants">
          <Text style={{ fontSize: 26 }}>{icon.emoji}</Text>
        </View>
        <Text style={s.heroName} numberOfLines={2}>
          {txn.merchant || 'Unnamed'}
        </Text>
        <Text style={[s.heroAmount, { color }]} accessibilityRole="header">
          {txn.isTransfer ? '' : debit ? '-' : '+'}
          {txn.inrMinor !== null ? formatInr(txn.inrMinor) : formatMoney(txn.amountMinor, txn.currency)}
        </Text>
        {foreign ? <Text style={s.sub}>{formatMoney(txn.amountMinor, txn.currency)}</Text> : null}
        <Text style={s.sub}>{formatIst(txn.occurredAt)}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {txn.isTransfer ? <Badge text="Transfer" /> : null}
          {txn.status === 'PENDING' ? <Badge text="Pending" warn /> : <Badge text="Posted" />}
        </View>
      </View>

      <View style={[card, { padding: 16, gap: 14 }]}>
        <Text style={s.cardTitle}>Details</Text>
        {rows.map(([k, v]) => (
          <View key={k} style={s.line} accessible accessibilityLabel={`${k}: ${v}`}>
            <Text style={s.k}>{k}</Text>
            <Text style={s.v} selectable>
              {v}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => setRaw((r) => !r)}
        accessibilityRole="button"
        accessibilityState={{ expanded: raw }}
        accessibilityLabel={raw ? 'Hide raw record' : 'Show raw record'}
        style={s.rawBtn}
      >
        <Text style={{ color: t.text, fontFamily: font.medium, fontSize: 13 }}>{raw ? 'Hide raw record' : 'Show raw record'}</Text>
      </Pressable>
      {raw ? (
        <Text selectable style={s.raw}>
          {JSON.stringify(txn.raw, null, 2)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', padding: 20, gap: 4 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heroName: { fontSize: 16, fontFamily: font.semi, color: t.text, textAlign: 'center' },
  heroAmount: { fontSize: 30, fontFamily: font.bold },
  sub: { fontSize: 12.5, fontFamily: font.regular, color: t.sub },
  cardTitle: { fontSize: 15, fontFamily: font.semi, color: t.text },
  line: { gap: 1 },
  k: { fontSize: 11.5, fontFamily: font.regular, color: t.sub },
  v: { fontSize: 14, fontFamily: font.medium, color: t.text },
  rawBtn: { alignSelf: 'center', backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  raw: { color: t.text, backgroundColor: t.card, padding: 12, borderRadius: 12, fontFamily: 'monospace', fontSize: 12, borderWidth: 1, borderColor: t.line },
});
