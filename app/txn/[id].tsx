import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatInr, formatIst, formatMoney, formatUtc } from '../../src/domain';
import { useTrack } from '../../src/app/runtime';
import { Badge } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function Detail() {
  const t = useTheme();
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
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>This transaction is no longer available.</Text>
        <Text style={{ color: t.sub, marginTop: 6, textAlign: 'center' }}>It may have been removed in the latest sync.</Text>
      </View>
    );
  }

  const foreign = txn.currency !== 'INR';
  const rows: Array<[string, string]> = [
    ['Merchant', txn.merchant || 'Unnamed'],
    ['Amount', foreign ? `${formatMoney(txn.amountMinor, txn.currency)}${txn.inrMinor !== null ? `, ${formatInr(txn.inrMinor)}` : ' (not converted to rupees)'}` : formatInr(txn.amountMinor)],
    ['Type', `${txn.direction === 'debit' ? 'Money out' : 'Money in'}${txn.isTransfer ? ' - transfer between your own accounts, not counted as spent or earned' : ''}`],
    ['Status', txn.status === 'PENDING' ? 'Pending' : 'Posted'],
    ['When (IST)', formatIst(txn.occurredAt)],
    ['When (UTC)', formatUtc(txn.occurredAt)],
    ['Category', txn.category],
    ['Account', name(txn.accountId) ?? txn.accountId],
  ];
  if (txn.counterAccountId) rows.push([txn.direction === 'debit' ? 'Sent to' : 'Received from', name(txn.counterAccountId) ?? txn.counterAccountId]);
  rows.push(['Last updated', txn.updatedAt ? formatIst(txn.updatedAt) : 'Not recorded']);
  rows.push(['Transaction ID', txn.id]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
        <Text style={{ color: txn.isTransfer ? t.sub : txn.direction === 'debit' ? t.spent : t.earned, fontSize: 28, fontWeight: '800' }} accessibilityRole="header">
          {txn.isTransfer ? '' : txn.direction === 'debit' ? '-' : '+'}
          {txn.inrMinor !== null ? formatInr(txn.inrMinor) : formatMoney(txn.amountMinor, txn.currency)}
        </Text>
        {foreign ? <Text style={{ color: t.sub }}>{formatMoney(txn.amountMinor, txn.currency)}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {txn.isTransfer ? <Badge text="Transfer" /> : null}
          {txn.status === 'PENDING' ? <Badge text="Pending" warn /> : null}
        </View>
      </View>
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.line }]}>
        {rows.map(([k, v]) => (
          <View key={k} style={s.line} accessible accessibilityLabel={`${k}: ${v}`}>
            <Text style={[s.k, { color: t.sub }]}>{k}</Text>
            <Text style={[s.v, { color: t.text }]} selectable>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => setRaw((r) => !r)} accessibilityRole="button" accessibilityState={{ expanded: raw }} accessibilityLabel={raw ? 'Hide raw record' : 'Show raw record'}>
        <Text style={{ color: t.accent, fontWeight: '600' }}>{raw ? 'Hide raw record' : 'Show raw record'}</Text>
      </Pressable>
      {raw ? (
        <Text selectable style={{ color: t.text, backgroundColor: t.chip, padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}>
          {JSON.stringify(txn.raw, null, 2)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  line: { gap: 2 },
  k: { fontSize: 12 },
  v: { fontSize: 15 },
});
