import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { buildListView } from '../src/state/selectors';
import type { ListItem } from '../src/state/selectors';
import { useTrack } from '../src/state/runtime';
import { FilterBar, MonthHeader, SyncBanner, TxnRow } from '../src/ui/components';
import { GAP, HEADER_HEIGHT, ROW_HEIGHT, SIDE, font, theme as t } from '../src/ui/theme';

const rowHeight = (it: ListItem) => (it.type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT + (it.last ? GAP : 0));

export default function Track() {
  const router = useRouter();
  const { ready, snapshot, query, month, kind, includePending, setQuery, setMonth, setKind, refresh } = useTrack();
  const listRef = useRef<FlatList<ListItem>>(null);

  const ledger = snapshot?.ledger;
  const historyLoading = snapshot?.state.phase === 'full';
  const view = useMemo(
    () => (ledger ? buildListView(ledger, { query, month, kind, includePending, historyLoading }) : null),
    [ledger, query, month, kind, includePending, historyLoading],
  );
  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of snapshot?.accounts ?? []) m.set(a.id, `${a.nickname} ··${a.last4}`);
    return m;
  }, [snapshot?.accounts]);

  // fixed heights let the list jump straight to any offset without measuring rows
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const it of view?.items ?? []) {
      out.push(y);
      y += rowHeight(it);
    }
    return out;
  }, [view]);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: view ? rowHeight(view.items[index]) : ROW_HEIGHT, offset: offsets[index], index }),
    [view, offsets],
  );

  // a new filter starts at the top of its results
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, month, kind]);

  const open = useCallback((id: string) => router.push({ pathname: '/txn/[id]', params: { id } }), [router]);
  const renderItem: ListRenderItem<ListItem> = useCallback(
    ({ item }) =>
      item.type === 'header' ? (
        <MonthHeader item={item} />
      ) : (
        <TxnRow txn={item.txn} last={item.last} account={accountNames.get(item.txn.accountId) ?? item.txn.accountId} onPress={open} />
      ),
    [accountNames, open],
  );

  if (!ready || !snapshot || !view) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={t.accent} />
        <Text style={s.muted}>Opening your saved transactions…</Text>
      </View>
    );
  }

  const syncing = snapshot.status.kind === 'syncing';
  const empty = view.total === 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search merchant, category or amount"
          placeholderTextColor={t.sub}
          accessibilityLabel="Search transactions"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={s.search}
        />
        {view.searching ? (
          <Text style={[s.muted, { marginTop: 6, marginLeft: 6 }]} accessibilityLiveRegion="polite">
            {view.matching} of {view.total} transactions
          </Text>
        ) : null}
      </View>
      <FilterBar months={view.months} month={month} onMonth={setMonth} kind={kind} onKind={setKind} />
      <SyncBanner snap={snapshot} rows={view.total} onRetry={() => void refresh('retry')} />
      {empty ? (
        <View style={s.center}>
          {syncing ? <ActivityIndicator color={t.accent} /> : null}
          <Text style={[s.muted, { textAlign: 'center', paddingHorizontal: 24 }]}>{syncing ? 'Loading your transactions…' : 'Nothing to show yet. Pull down to sync.'}</Text>
        </View>
      ) : view.searching && view.matching === 0 ? (
        <View style={s.center}>
          <Text style={s.muted}>{query.trim() ? `No transactions match “${query.trim()}”.` : 'No transactions for this filter.'}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={view.items}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListFooterComponent={<View style={{ height: 24 }} />}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh('pull to refresh')} colors={[t.accent]} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.bg },
  muted: { color: t.sub, fontSize: 13, fontFamily: font.regular },
  searchWrap: { paddingHorizontal: SIDE, paddingTop: 4 },
  search: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    fontSize: 14,
    fontFamily: font.regular,
    color: t.text,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
  },
});
