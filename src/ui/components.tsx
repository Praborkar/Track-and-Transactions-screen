import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatInr, formatIst, formatMoney } from '../domain';
import type { Txn } from '../domain';
import type { ListItem } from '../app/selectors';
import type { EngineSnapshot } from '../sync/engine';
import { HEADER_HEIGHT, ROW_HEIGHT, useTheme } from './theme';

type Header = Extract<ListItem, { type: 'header' }>;

export const MonthHeader = memo(function MonthHeader({ item }: { item: Header }) {
  const t = useTheme();
  const { totals } = item;
  const label = `${item.label}. Spent ${formatInr(totals.spent)}. Earned ${formatInr(totals.earned)}. ${totals.count} transactions.${item.loading ? ' Older transactions are still loading, so this total is not final.' : ''}`;
  return (
    <View style={[s.header, { backgroundColor: t.bg, borderColor: t.line, height: HEADER_HEIGHT }]} accessible accessibilityRole="header" accessibilityLabel={label}>
      <View style={s.headerTop}>
        <Text style={[s.month, { color: t.text }]}>{item.label}</Text>
        <Text style={[s.sub, { color: t.sub }]}>
          {item.matches !== null ? `${item.matches} of ${totals.count}` : `${totals.count} transactions`}
        </Text>
      </View>
      <View style={s.headerTotals}>
        <View>
          <Text style={[s.cap, { color: t.sub }]}>Spent</Text>
          <Text style={[s.total, { color: t.spent }]}>{formatInr(totals.spent)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.cap, { color: t.sub }]}>Earned</Text>
          <Text style={[s.total, { color: t.earned }]}>{formatInr(totals.earned)}</Text>
        </View>
      </View>
      {item.loading ? (
        <Text style={[s.note, { color: t.warnText }]}>Still loading older transactions - not final</Text>
      ) : totals.transfers > 0 ? (
        <Text style={[s.note, { color: t.sub }]}>{totals.transfers} transfers between your accounts left out</Text>
      ) : null}
    </View>
  );
});

export const TxnRow = memo(function TxnRow({ txn, account, onPress }: { txn: Txn; account: string; onPress: (id: string) => void }) {
  const t = useTheme();
  const debit = txn.direction === 'debit';
  const sign = txn.isTransfer ? '' : debit ? '-' : '+';
  const color = txn.isTransfer ? t.sub : debit ? t.spent : t.earned;
  const inr = txn.inrMinor !== null ? formatInr(txn.inrMinor) : null;
  const shown = txn.currency === 'INR' ? formatInr(txn.amountMinor) : inr ?? formatMoney(txn.amountMinor, txn.currency);
  const foreign = txn.currency !== 'INR' ? formatMoney(txn.amountMinor, txn.currency) : null;
  const label = `${txn.merchant || 'Unnamed'}, ${debit ? 'paid' : 'received'} ${shown}${foreign && inr ? `, ${foreign}` : ''}, ${formatIst(txn.occurredAt)}, ${account}${txn.isTransfer ? ', transfer between your accounts' : ''}${txn.status === 'PENDING' ? ', pending' : ''}${txn.currency !== 'INR' && !inr ? ', not converted to rupees' : ''}`;
  return (
    <Pressable
      onPress={() => onPress(txn.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the details"
      style={({ pressed }) => [s.row, { backgroundColor: pressed ? t.chip : t.card, borderColor: t.line, height: ROW_HEIGHT }]}
    >
      <View style={s.rowLeft}>
        <Text numberOfLines={1} style={[s.merchant, { color: t.text }]}>
          {txn.merchant || 'Unnamed'}
        </Text>
        <Text numberOfLines={1} style={[s.sub, { color: t.sub }]}>
          {formatIst(txn.occurredAt)} · {account}
        </Text>
        <View style={s.badges}>
          {txn.isTransfer ? <Badge text="Transfer" /> : null}
          {txn.status === 'PENDING' ? <Badge text="Pending" warn /> : null}
          {txn.currency !== 'INR' && !inr ? <Badge text="Not converted" warn /> : null}
        </View>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.amount, { color }]}>
          {sign}
          {shown}
        </Text>
        {foreign && inr ? <Text style={[s.sub, { color: t.sub }]}>{foreign}</Text> : null}
      </View>
    </Pressable>
  );
});

export function Badge({ text, warn }: { text: string; warn?: boolean }) {
  const t = useTheme();
  return (
    <View style={[s.badge, { backgroundColor: warn ? t.warnBg : t.chip }]}>
      <Text style={[s.badgeText, { color: warn ? t.warnText : t.sub }]}>{text}</Text>
    </View>
  );
}

/** What is happening with the sync, in words, without ever hiding the data below it. */
export function SyncBanner({ snap, rows, onRetry }: { snap: EngineSnapshot; rows: number; onRetry: () => void }) {
  const t = useTheme();
  const { status, state } = snap;
  const rejected = state.rejected.total;
  let bg = t.infoBg;
  let fg = t.infoText;
  let text: string;
  let retry = false;
  if (status.kind === 'syncing') {
    text = state.phase === 'full' ? `Loading your history… ${rows.toLocaleString('en-IN')} transactions so far` : 'Checking for new transactions…';
  } else if (status.kind === 'paused' || status.kind === 'failed') {
    bg = t.errBg;
    fg = t.errText;
    text = status.message;
    retry = true;
  } else if (state.lastSyncedAt) {
    text = `Up to date · synced ${new Date(state.lastSyncedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    return null;
  }
  return (
    <View style={[s.banner, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Text style={{ color: fg, flex: 1, fontSize: 13 }}>
        {text}
        {rejected > 0 ? `\n${rejected} record${rejected === 1 ? '' : 's'} could not be read and ${rejected === 1 ? 'is' : 'are'} not counted.` : ''}
      </Text>
      {retry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry sync" hitSlop={8}>
          <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headerTotals: { flexDirection: 'row', justifyContent: 'space-between' },
  month: { fontSize: 17, fontWeight: '700' },
  cap: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  total: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  rowLeft: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  merchant: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12 },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
});
