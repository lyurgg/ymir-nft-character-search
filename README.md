# YMIR character search

Install dependencies with `python -m pip install -r requirements.txt`.
Run `python extract_name_parallel.py`, then `python generate_html.py`.
Open `index.html` or serve it with `python -m http.server`.

## Prices and availability

YMIR's "Starting Price" can remain on an NFT after its listing ends. Current
listing state and character metadata come from WEMIX's public JSON NFT detail endpoint.
This avoids downloading and parsing large HTML pages, including the YMIR pages
that may not expose newer characters.
Listed price is shown only for a sale or an unexpired auction. Bid and offer
availability use the marketplace's explicit flags. Missing data means Unknown.
Expired auction deadlines override stale bidding flags.

Last known price preserves a previously observed listing, the marketplace's
previous price, or an existing archive price. It is not proof of a completed sale.
Prices are token amounts; hover over a price for its currency contract. The known
currency's 18 decimals were checked against WEMIX's rendered price; unknown
currencies are left blank rather than converted with guessed decimals.

All values are scan snapshots. Check times are displayed in Philippine time.
A full local scan of IDs 1–5000 found 4,199 characters in 107.5 seconds. All IDs
in 3700–4200 were present. Runtime on GitHub depends on API latency and retries.

## Name history and persistence

`character_history.json` is durable state keyed by NFT ID. It seeds the existing
CSV names and prices with unknown dates, then records name transitions, first and
last observation times, the latest successful character data, and last known price.
Name reversions are retained. Search includes previous names and NFT IDs.
Changes before the archive and changes between daily scans cannot be recovered.
Keep this file across runs; do not regenerate it from scratch.

The daily GitHub Pages workflow commits the CSV and history back to `main` with
`[skip ci]` before deployment. Repository settings must allow the workflow token
to write to `main`; branch protection may require a different persistence setup.
Failed individual requests retain archived data and its old check time. A run
with no successfully fetched characters fails without replacing the archive.

## Checks

`python -m unittest -v test_character_data`

`node test_frontend.cjs`

`node test_graph.cjs`

`node test_graph_page.cjs`

`python verify_live.py` checks three public NFTs and updates their observations;
run the generator afterward to update the local page.

## Ownership and related characters

The public WEMIX NFT history query (`POST /market/order/trade-history`) returns
transfer and sale records with sending/receiving wallets, dates, event types, and
transaction hashes. The collector saves them without duplicating records and
retains them if a later request fails. The current owner comes from the JSON NFT detail
response. Archive owner observations have scan times; transfer records have the event
times supplied by WEMIX. The UI shows history coverage and partial responses.
These public site endpoints can change, so failures are shown rather than treated
as empty histories. No wallet connection, private key, or API secret is required.

Click a character name to open its details, price history, transfers, and related
characters. Wallet associations have four categories: the current wallet's current
and former holdings, and former wallets' current and former holdings. A wallet
search returns all recorded associations. The index covers YMIR characters in this
archive, not all NFT collections or every asset held by a wallet. Absence from a
result is not proof of no association. Shared or custodial wallets do not establish
that characters or wallets have the same player.

## Ownership graph

`python generate_html.py` also creates `graph.html`. Its source files are
`generate_graph.py`, `graph-template.html`, `graph-core.js`, `graph.js`, and `graph.css`.
The character dashboard similarly embeds `app.js` and `dashboard.css`. Both output
pages are self-contained; the workflow publishes both, and all source files must be
uploaded when redeploying this project.

NFTs and wallets are separate nodes. A solid edge means the latest owner snapshot;
a dashed edge means historical ownership. Select an edge for the source records,
dates, and transaction hashes. Graph paths do not assert simultaneous ownership.
Enter an NFT ID, a unique exact name, or a full wallet address. A second endpoint
finds the shortest path through all indexed ownership links, with a current-only
option. For example, W1—NFT78—W2—NFT313—W7 is four ownership edges and two wallet
steps. The neighborhood display is capped at 180 nodes; the path finder uses the
whole index. Drag nodes, pan, zoom, or adjust exploration depth. URL query parameters
`?root=78&to=313` preserve the selected endpoints.

## Freshness, price history, favorites, and collection reliability

Rows show checked within 24 hours, outdated, latest check failed, or never checked.
Failed marketplace requests retain the last successful values and their original
check time. Listing prices and marketplace previous prices have separate histories;
unchanged daily prices update last-seen times, and listing removals are retained.
Filters cover class, server, currency, listed/last price ranges, and freshness.
Price per 100,000 power uses listed token amounts. Choose a currency before
comparing prices across denominations. Favorites use browser local storage and
are specific to that browser. The table renders 100 rows per page.

The collector scans IDs 1 through 5,000, including gaps inside the existing archive.
It does not stop at empty ranges and does not probe beyond the ceiling. The workflow
explicitly passes `--end-id 5000`; `--ids 4000 4200` is available for a focused check.
Progress is printed every 50 completed IDs. Transient source failures are retried in
parallel. Ownership history refreshes when the owner changes, the previous request
failed or was partial, or its last successful check is at least seven days old.
Metadata, prices, and current owners are still refreshed on every run. Intermediate
transfers that return to the same wallet are collected on the next weekly history
refresh. Existing histories remain visible with their original check times.
`scan_report.json` records runtime, failures, missing archived pages, and scan scope.
It is persisted with the archive by the daily workflow.

Both pages now share `theme.css`, embedded by the generators. Upload this source
file along with the other generator, JavaScript, CSS, and template files. Generated
HTML files remain self-contained for GitHub Pages.
