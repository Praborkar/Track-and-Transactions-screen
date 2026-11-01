# Decision log

Ten decisions, with what I rejected and why. Where I was not sure, I say so.

## 1. Expo, not bare React Native

I used a managed Expo project: Expo Go while building, an EAS build for the APK.

Rejected: bare React Native. It means more native setup (Gradle, Android Studio, signing), and nothing in this screen needs a native module Expo does not have. The one native setting I did need, plain HTTP to the mock server, is a config plugin in `app.json` (`expo-build-properties`, `usesCleartextTraffic`).

Not sure about: Expo Go is limited with some native libraries. That is why I kept FlatList and did not try FlashList (see 9).

## 2. SQLite for the cache, not AsyncStorage

Every page is written to SQLite together with its cursor, in one transaction. If the app is killed between pages, the next launch reads the saved cursor and carries on.

Rejected: one JSON blob in AsyncStorage. A page and its cursor cannot be written atomically, so a kill can leave rows without the cursor, or a cursor without the rows. Rejected MMKV: it needs a custom dev build, so no Expo Go.

Cost: more code. A store interface, a SQLite version and an in-memory version for tests.

## 3. Transfers are excluded by marker, never by category name

A row is an own-account transfer if `counterparty.type` is `OWN_ACCOUNT` (new records) or `linked_account` is present (old records). Transfers stay in the list with a badge and in the transaction count, and are left out of spent and earned.

Rejected: excluding the category `TRANSFERS_OUT`. It sounds right and it is wrong. The data has 44 `TRANSFERS_OUT` rows and none of them is marked as a transfer. They are UPI payments to people ("UPI/RAHUL SHARMA"). With that rule, all 13 months differ from `checkpoint.json`.

Counting transfers as spending is also wrong in all 13 months. For example, October 2026 would show ₹1,34,784.98 spent instead of ₹1,09,784.98, because the ₹25,000 self transfer from HDFC to ICICI on 3 Oct would be added.

## 4. Money is integer paise, parsed from strings

Old records carry the amount as a string like "516.49". I split it at the dot and build paise from the two parts. No `parseFloat`, no `* 100`. Formatting is my own `formatInr` with Indian grouping, so 12,34,567.89 prints that way on every phone.

Rejected: `toLocaleString('en-IN')`. Its output depends on the Intl support of the device. A function I wrote and tested gives the same text everywhere.

## 5. Months are IST calendar months

A row belongs to the month it falls in at UTC+5:30. IST has no daylight saving, so the offset is a constant.

Rejected: `occurred_at.slice(0, 7)`. 43 rows change month between UTC and IST (late evening UTC on the last day of a month is already the next day in India). Grouping by UTC also makes a September 2025 appear that does not exist in the checkpoint, and all 13 months disagree with it. The switch from old to new record format sits on exactly the IST 1 April boundary, which is a sign that the data was built in IST.

## 6. The sync token is saved only with the final page

The list returns the same `sync_token` on every page. The changes feed only accepts the token from the full list or from its own last page. If I saved the token after page 1 and the app was killed, the app would think it was fully synced with 4,600 rows missing. So the token goes into the same transaction as the last page.

If the server answers 410 for a token, I keep the cached rows on screen, start a full sync tagged with a run id, and stamp every row it sees. Only when the last page arrives do I delete rows that were not stamped. An interrupted resync deletes nothing.

Not sure: the sweep deletes rows the server no longer lists. That is right for rows deleted while the app was away. It would also remove a row if the server's list were ever incomplete. The mock never does that.

## 7. Refunds are income

The 19 refunds ("AMAZON PAY REFUND", credit) count as earned, not as negative spend. With refunds counted as income, every month matches the checkpoint. The same goes for the ₹12,34,567.89 bonus in April and the 14 salary credits. I do not cap or hide outliers. February is high because of one ₹1,84,500 Tanishq Jewellers purchase, and the app shows it as it is.

## 8. Pending rows count in totals, with a switch

In this data every one of the 25 pending rows is changed to posted by the changes feed, so after a full sync there are none left. The data cannot tell me what the right rule is. I made "count pending in totals" a setting, on by default, because the money has left the account even when the bank has not settled it. Pending rows always show a badge. The setting is in Settings and tested both ways.

Not sure: this is a guess. With more time I would ask the product owner what the Track screen should do.

## 9. Totals are computed on the phone, and I ignore `/v1/summary/months`

The summary endpoint disagrees with the checkpoint. It lists September 2025 (2 rows) and gives October 2025 spend as ₹3,57,619.21 against ₹2,85,256.89 in the checkpoint. It looks like a snapshot from before the changes feed, grouped by UTC. So the app computes everything locally from the rows. I did not build the optional "reconcile" row that compares local with backend totals.

On the list: FlatList with fixed row heights and `getItemLayout`, flattened month headers and rows. I did not try FlashList because I had no measurement saying FlatList was too slow, and I did not measure (see the unfinished list).

## 10. A transaction's identity is its id, never its content

Two pairs of different ids share account, minute, amount and merchant. They could be two real chai purchases. I merge by id only. The checkpoint count of 4,686 matches by id and would not match if I merged by content.

When the same id arrives twice, the newer `updated_at` wins. An old-format row has no `updated_at`, so any dated record beats it. A delete leaves a tombstone, so a stale copy that arrives later cannot bring the row back. Server cursors repeat the boundary row on every page (47 repeats over 4,675 rows), so the merge by id is not optional.
