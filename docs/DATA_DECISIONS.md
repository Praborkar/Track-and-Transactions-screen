# What the data made me decide

The assignment says it will not tell you what is in the data. These are the things I found, what I chose to do about each, and what I would do with more time. Counts come from running my own code on `mock/fixtures`.

## The data

| What I saw | What I chose | With more time |
|---|---|---|
| Two record shapes in one list. 2,394 new (`amount_minor`, ISO time, `direction`) and 2,281 old (`amount` as a string, `txn_time` in epoch seconds, `type` DR/CR, no currency, no `updated_at`). Old rows run from 30 Sep 2025 to 31 Mar 2026, new rows start the same evening. | One `normalize()` that returns a single shape. Unknown or invalid rows are rejected into a list, counted, and shown in the sync banner and in Settings. Nothing throws. | Ask what the old shape's missing currency means. I assume INR. |
| Own-account transfers come in two spellings: `counterparty.type = OWN_ACCOUNT` (26 rows) and `linked_account` (24 rows). 12 of them are card bill payments, with a matching "PAYMENT RECEIVED" credit. | Left out of spent and earned when either marker is present. Still in the count and in the list with a Transfer badge. A Transfers filter shows only these. | Show both sides of a transfer together on the detail screen. |
| 44 rows have the category `TRANSFERS_OUT`. None carries a transfer marker. They are UPI payments to people. | They are spending. Never exclude by category or merchant text. | Nothing. |
| 15 USD rows (Notion, Apple). `amount_minor` is US cents. `fx.inr_minor` holds the rupee value (Notion: 1000 cents, 86,661 paise). | Totals use the rupee value. The detail screen shows both, "$10.00" and "₹866.61". A foreign row with no rate is left out of totals and shown as "Not converted". None are missing a rate in this file. | Decide what to do when the rate is missing. Left out and flagged is the safest I could think of. |
| 19 refunds and 14 salary credits. One ₹12,34,567.89 bonus in April makes April income ₹14,79,390.89. February spend is ₹4,43,341.40. | Refunds are income. Outliers are shown, not capped. February is one ₹1,84,500 Tanishq Jewellers purchase; without it February is about ₹2.59 lakh, like the other months. | A way to tag one-off items. |
| 43 rows fall in a different month under IST than under UTC. | Group by IST calendar month. | Support users outside India. The assignment says our users are in India, so I fixed the offset. |
| 25 rows are PENDING in the list. All 25 are changed to POSTED by the changes feed (21 status edits, 11 amount edits). | The changes feed is the truth. Pending rows get a badge. Whether they count in totals is a setting, on by default. | Ask the product owner. The file cannot answer it. |
| 3 old-format ids come back in the changes feed in the new shape, and 2 ids appear twice in the changes feed. | Merge by id. Newer `updated_at` wins. An undated row loses to any dated one. Apply changes in order. | Nothing. |
| 7 deletes in the changes feed. | Delete the row and keep a tombstone. | Expire old tombstones. They grow forever now. |
| Two pairs of different ids share account, minute, amount and merchant. | Never merge by content. | Nothing. |
| 47 merchant strings in three styles: "SWIGGY\*BANGALORE", "Swiggy Instamart", "UPI/CHAI POINT". | Search ignores case, punctuation and the UPI/ prefix, and also matches category and amount. The original text is shown. | Fuzzy match for typos, and highlighting. |

## The API

| What I saw | What I chose |
|---|---|
| The next cursor points one row back, so every page repeats the last row of the previous one. With 100 per page I receive 4,722 rows for 4,675 distinct ids. | Merge by id. Treat cursors as opaque. The cursor also carries `Date.now() % 1000`, so two cursors for the same position differ, and I never compare them. |
| The 6th list call returns 500. The 11th returns 429 with `Retry-After: 3`. The first changes call returns 503 with `Retry-After: 2`. | Retry with exponential backoff and jitter, at most 4 attempts per page. A `Retry-After` is obeyed. After 4 failures the sync pauses with a banner and a Retry button, and the saved rows stay. |
| The 3rd list call takes 4.2 seconds, and some later ones 2.6 seconds. | A 15 second timeout, so slow but good calls are not failed. The banner shows how many transactions have loaded. |
| About 48 sequential calls for the full history, 45 to 70 seconds with the delays (45.6 s on my laptop against the real hostile server, about 65 s on my phone). | Newest first, and the screen draws after the first page. The oldest month shown is marked "Still loading older transactions - not final" until a row from an older month arrives, so a partial total is never shown as final. |
| The changes feed accepts only the token from the full list or from its own last page. Anything else returns 410. The new token comes only on the last page of the feed. | Apply a changes batch and its new token in one commit, only after the last page. On 410, keep the rows, drop the token, resync (see decision 6). |
| `/v1/summary/months` disagrees with the checkpoint (September 2025 appears, October 2025 spend is ₹3,57,619.21 instead of ₹2,85,256.89). | Compute locally. Ignore the endpoint. |
| The server speaks plain HTTP on port 4010, and the evaluators will use their own server. | Cleartext enabled in the build config. The server address is a setting in the app (Test and Save and sync), with `EXPO_PUBLIC_API_URL` as the default. |

## What I could not know from this file

- A timestamp without a time zone: `Date.parse` would read it as phone-local time. I reject it and count it.
- A zero or negative amount, a missing field, a bad currency code, a record with both shapes at once. All rejected and counted, not thrown.
- A foreign currency other than USD, or a USD row without a rate. Handled as "not converted".
- A duplicate id inside one page. Handled by the merge.

A random-data test builds datasets with all of these traps, in both shapes, with edits, deletes and stale copies, and compares the app's totals with a plain brute-force count. It runs 12 seeds.
