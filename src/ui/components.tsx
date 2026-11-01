import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatInr, formatIst, formatIstShort, formatMoney } from '../domain';
import type { Txn } from '../domain';
import type { ListItem } from '../state/selectors';
import type { EngineSnapshot } from '../sync/engine';
import { GAP, HEADER_HEIGHT, ROW_HEIGHT, SIDE, font, iconFor, theme as t } from './theme';

type Header = Extract<ListItem, { type: 'header' }>;

export const MonthHeader = memo(function MonthHeader({ item }: { item: Header }) {
  const { totals } = item;
  const label = `${item.label}. Spent ${formatInr(totals.spent)}. Earned ${formatInr(totals.earned)}. ${totals.count} transactions.${item.loading ? ' Older transactions are still loading, so this total is not final.' : ''}`;
  return (
    <View style={{ height: HEADER_HEIGHT, paddingTop: GAP, paddingHorizontal: SIDE }}>
      <View style={s.headerCard} accessible accessibilityRole="header" accessibilityLabel={label}>
        <View style={s.headerTop}>
          <Text style={s.month}>{item.label}</Text>
          <View style={s.countChip}>
            <Text style={s.countText}>{item.matches !== null ? `${item.matches} of ${totals.count}` : `${totals.count} transactions`}</Text>
          </View>
        </View>
        <View style={s.panels}>
          <View style={[s.panel, { backgroundColor: '#FDEFED' }]}>
            <Text style={s.cap}>Spent</Text>
            <Text style={[s.total, { color: t.spent }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatInr(totals.spent)}
            </Text>
          </View>
          <View style={[s.panel, { backgroundColor: '#E8F7EF' }]}>
            <Text style={s.cap}>Earned</Text>
            <Text style={[s.total, { color: t.earned }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatInr(totals.earned)}
            </Text>
          </View>
        </View>
        {item.loading ? (
          <Text style={[s.note, { color: t.warnText }]}>Still loading older transactions - not final</Text>
        ) : totals.transfers > 0 ? (
          <Text style={s.note}>{totals.transfers} transfers between your accounts left out</Text>
        ) : (
          <Text style={s.note}> </Text>
        )}
      </View>
    </View>
  );
});

export const TxnRow = memo(function TxnRow({ txn, last, account, onPress }: { txn: Txn; last: boolean; account: string; onPress: (id: string) => void }) {
  const debit = txn.direction === 'debit';
  const sign = txn.isTransfer ? '' : debit ? '-' : '+';
  const color = txn.isTransfer ? t.sub : debit ? t.spent : t.earned;
  const inr = txn.inrMinor !== null ? formatInr(txn.inrMinor) : null;
  const shown = txn.currency === 'INR' ? formatInr(txn.amountMinor) : inr ?? formatMoney(txn.amountMinor, txn.currency);
  const foreign = txn.currency !== 'INR' ? formatMoney(txn.amountMinor, txn.currency) : null;
  const label = `${txn.merchant || 'Unnamed'}, ${debit ? 'paid' : 'received'} ${shown}${foreign && inr ? `, ${foreign}` : ''}, ${formatIst(txn.occurredAt)}, ${account}${txn.isTransfer ? ', transfer between your accounts' : ''}${txn.status === 'PENDING' ? ', pending' : ''}${txn.currency !== 'INR' && !inr ? ', not converted to rupees' : ''}`;
  const icon = iconFor(txn.category);
  return (
    <View style={{ height: ROW_HEIGHT + (last ? GAP : 0), paddingHorizontal: SIDE, paddingBottom: last ? GAP : 0 }}>
      <View style={[s.seg, last && s.segLast]}>
        <View style={s.divider} />
        <Pressable
          onPress={() => onPress(txn.id)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens the details"
          android_ripple={{ color: '#00000010' }}
          style={s.row}
        >
          <View style={[s.avatar, { backgroundColor: icon.bg }]} importantForAccessibility="no-hide-descendants">
            <Text style={s.emoji}>{icon.emoji}</Text>
          </View>
          <View style={s.rowLeft}>
            <Text numberOfLines={1} style={s.merchant}>
              {txn.merchant || 'Unnamed'}
            </Text>
            <Text numberOfLines={1} style={s.sub}>
              {formatIstShort(txn.occurredAt)} · {account.replace(/ ··\d+$/, '')}
            </Text>
            {txn.isTransfer || txn.status === 'PENDING' || (txn.currency !== 'INR' && !inr) ? (
              <View style={s.badges}>
                {txn.isTransfer ? <Badge text="Transfer" /> : null}
                {txn.status === 'PENDING' ? <Badge text="Pending" warn /> : null}
                {txn.currency !== 'INR' && !inr ? <Badge text="Not converted" warn /> : null}
              </View>
            ) : null}
          </View>
          <View style={s.rowRight}>
            <Text style={[s.amount, { color }]}>
              {sign}
              {shown}
            </Text>
            {foreign && inr ? <Text style={s.sub}>{foreign}</Text> : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
});

export function Badge({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={[s.badge, { backgroundColor: warn ? t.warnBg : t.chip }]}>
      <Text style={[s.badgeText, { color: warn ? t.warnText : t.sub }]}>{text}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[s.chip, selected && s.chipOn]}
    >
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Pick one month, or all of them, and narrow to money out, money in or transfers. */
export function FilterBar({
  months,
  month,
  onMonth,
  kind,
  onKind,
}: {
  months: Array<{ key: string; label: string }>;
  month: string | null;
  onMonth: (m: string | null) => void;
  kind: 'all' | 'spent' | 'earned' | 'transfers';
  onKind: (k: 'all' | 'spent' | 'earned' | 'transfers') => void;
}) {
  const kinds = [
    ['all', 'All'],
    ['spent', 'Spent'],
    ['earned', 'Earned'],
    ['transfers', 'Transfers'],
  ] as const;
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} accessibilityLabel="Choose month">
        <Chip label="All months" selected={month === null} onPress={() => onMonth(null)} />
        {months.map((m) => (
          <Chip key={m.key} label={m.label} selected={month === m.key} onPress={() => onMonth(m.key)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} accessibilityLabel="Choose type">
        {kinds.map(([k, label]) => (
          <Chip key={k} label={label} selected={kind === k} onPress={() => onKind(k)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** What is happening with the sync, in words, without ever hiding the data below it. */
export function SyncBanner({ snap, rows, onRetry }: { snap: EngineSnapshot; rows: number; onRetry: () => void }) {
  const { status, state } = snap;
  const rejected = state.rejected.total;
  let bg: string = t.infoBg;
  let fg: string = t.infoText;
  let dot = '#4C7DF0';
  let text: string;
  let retry = false;
  if (status.kind === 'syncing') {
    text = state.phase === 'full' ? `Loading your history… ${rows.toLocaleString('en-IN')} transactions so far` : 'Checking for new transactions…';
  } else if (status.kind === 'paused' || status.kind === 'failed') {
    bg = t.errBg;
    fg = t.errText;
    dot = t.spent;
    text = status.message;
    retry = true;
  } else if (state.lastSyncedAt) {
    bg = t.okBg;
    fg = t.okText;
    dot = t.earned;
    text = `Up to date · synced ${new Date(state.lastSyncedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    return null;
  }
  return (
    <View style={[s.banner, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <View style={[s.dot, { backgroundColor: dot }]} />
      <Text style={{ color: fg, flex: 1, fontSize: 12.5, fontFamily: font.medium }}>
        {text}
        {rejected > 0 ? `\n${rejected} record${rejected === 1 ? '' : 's'} could not be read and ${rejected === 1 ? 'is' : 'are'} not counted.` : ''}
      </Text>
      {retry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry sync" hitSlop={8} style={s.retry}>
          <Text style={{ color: t.onAccent, fontFamily: font.semi, fontSize: 13 }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  chipRow: { paddingHorizontal: SIDE, gap: 8 },
  chip: { backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 },
  chipOn: { backgroundColor: t.accent, borderColor: t.accent },
  chipText: { fontSize: 12.5, fontFamily: font.medium, color: t.text },
  chipTextOn: { color: t.onAccent, fontFamily: font.semi },
  headerCard: {
    flex: 1,
    backgroundColor: t.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: t.line,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    justifyContent: 'space-between',
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 17, fontFamily: font.semi, color: t.text },
  countChip: { backgroundColor: t.chip, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText: { fontSize: 11.5, fontFamily: font.medium, color: t.sub },
  panels: { flexDirection: 'row', gap: 10 },
  panel: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  cap: { fontSize: 10.5, fontFamily: font.medium, color: t.sub, textTransform: 'uppercase', letterSpacing: 0.8 },
  total: { fontSize: 18, fontFamily: font.bold },
  note: { fontSize: 11.5, fontFamily: font.regular, color: t.sub },
  seg: { flex: 1, backgroundColor: t.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.line },
  segLast: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' },
  divider: { position: 'absolute', top: 0, left: 14, right: 14, height: 1, backgroundColor: t.line },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  rowLeft: { flex: 1, gap: 1 },
  rowRight: { alignItems: 'flex-end' },
  merchant: { fontSize: 14.5, fontFamily: font.semi, color: t.text },
  sub: { fontSize: 11.5, fontFamily: font.regular, color: t.sub },
  amount: { fontSize: 15, fontFamily: font.bold },
  badges: { flexDirection: 'row', gap: 6, marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontFamily: font.medium },
  banner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SIDE, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  retry: { backgroundColor: t.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5 },
});
