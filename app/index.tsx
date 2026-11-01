import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { buildListView } from '../src/app/selectors';
import type { ListItem } from '../src/app/selectors';
import { useTrack } from '../src/app/runtime';
import { MonthHeader, SyncBanner, TxnRow } from '../src/ui/components';
import { HEADER_HEIGHT, ROW_HEIGHT, useTheme } from '../src/ui/theme';

export default function Track() {
  const t = useTheme();
  const router = useRouter();
  const { ready, snapshot, query, includePending, setQuery, refresh } = useTrack();

  const ledger = snapshot?.ledger;
  const historyLoading = snapshot?.state.phase === 'full';
  const view = useMemo(
    () => (ledger ? buildListView(ledger, { query, includePending, historyLoading }) : null),
    [ledger, query, includePending, historyLoading],
  );
  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of snapshot?.accounts ?? []) m.set(a.id, `${a.nickname} ··${a.last4}`);
    return m;
  }, [snapshot?.accounts]);

  // fixed heights let the list jump straight to any offset without measuring rows
  const layout = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const it of view?.items ?? []) {
      offsets.push(y);
      y += it.type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;
    }
    return offsets;
  }, [view]);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: view?.items[index].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT, offset: layout[index], index }),
    [view, layout],
  );

  const open = useCallback((id: string) => router.push({ pathname: '/txn/[id]', params: { id } }), [router]);
  const renderItem: ListRenderItem<ListItem> = useCallback(
    ({ item }) => (item.type === 'header' ? <MonthHeader item={item} /> : <TxnRow txn={item.txn} account={accountNames.get(item.txn.accountId) ?? item.txn.accountId} onPress={open} />),
    [accountNames, open],
  );

  if (!ready || !snapshot || !view) {
    return (
      <View style={[s.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator />
        <Text style={{ color: t.sub, marginTop: 12 }}>Opening your saved transactions…</Text>
      </View>
    );
  }

  const syncing = snapshot.status.kind === 'syncing';
  const empty = view.total === 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.searchWrap, { backgroundColor: t.card, borderColor: t.line }]}>
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
          style={[s.search, { color: t.text, backgroundColor: t.chip }]}
        />
        {view.searching ? (
          <Text style={{ color: t.sub, fontSize: 12, marginTop: 6 }} accessibilityLiveRegion="polite">
            {view.matching} of {view.total} transactions
          </Text>
        ) : null}
      </View>
      <SyncBanner snap={snapshot} rows={view.total} onRetry={() => void refresh('retry')} />
      {empty ? (
        <View style={s.center}>
          {syncing ? <ActivityIndicator /> : null}
          <Text style={{ color: t.sub, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }}>
            {syncing ? 'Loading your transactions…' : 'Nothing to show yet. Pull down to sync.'}
          </Text>
        </View>
      ) : view.searching && view.matching === 0 ? (
        <View style={s.center}>
          <Text style={{ color: t.sub }}>No transactions match “{query.trim()}”.</Text>
        </View>
      ) : (
        <FlatList
          data={view.items}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          stickyHeaderIndices={undefined}
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh('pull to refresh')} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { height: 40, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
});
