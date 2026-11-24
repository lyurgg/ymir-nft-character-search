# YMIR character search

Install dependencies with `python -m pip install -r requirements.txt`.
Run `python extract_name_parallel.py`, then `python generate_html.py`.
Open `index.html` or serve it with `python -m http.server`.

## Uploading through GitHub without Git or folder uploads

**Required Pages setting:** open repository **Settings → Pages → Build and
deployment → Source → GitHub Actions**. Keep the existing custom workflow; do not
create a new template. **Deploy from a branch** publishes the older HTML files
stored at the repository root and can overwrite the freshly generated site,
making shared funders disappear even when the custom workflow succeeds.
If the source/data files are already uploaded, change this setting and re-run
**Update character data and deploy GitHub Pages**; no data re-upload is needed.

The workflow uses separate **Build and upload website** and **Deploy website**
jobs, with deployment depending on the completed build. This avoids the reported
[Pages artifact lookup race](https://github.com/actions/deploy-pages/issues/451)
when upload and deployment run immediately next to one another in the same job.
If only the deployment job fails, retry that job without repeating the scrape or
upload. With the older single-job workflow, start a new workflow run instead of
re-running the failed job: another upload in the same run can create duplicate
`github-pages` artifacts. Switching to this workflow only requires replacing
`.github/workflows/deploy.yml`; the source and history parts need no re-upload.

Run `python prepare_upload.py` after making local changes. A clean `github-upload`
folder is already prepared in this workspace. It contains only small, flat files:
source code, tests, CSV, and split history data. Every file is under 1,000,000 bytes.
Upload the **files inside** that local folder at the GitHub repository root; do not
upload the folder itself. No cloning, pushing, or folder upload is required.

1. First update the existing `.github/workflows/deploy.yml` using GitHub's web
   editor: replace its contents with the updated local workflow file and commit.
   This makes future scans commit all history parts along with their index.
2. At the repository root, use **Add file → Upload files → choose your files**.
   Select all files inside local `github-upload` and commit them together. Keep
   their names unchanged. The package currently fits GitHub's 100-file upload
   limit; if a future archive grows beyond that, upload parts first in batches,
   then upload the small index files and source files last.
3. Let the latest workflow run build and deploy both pages. A run triggered by
   the workflow edit may fail before the new source files are uploaded; the run
   after the complete upload has all required inputs.

The upload set excludes `index.html`, `graph.html`, `_site/`, `.venv/`, caches,
and `sample_*` investigation files. The workflow builds all three HTML pages and the wallet data assets.
There is no need to upload them manually or delete older generated pages on GitHub.
`UPLOAD_MANIFEST.json` lists the prepared upload files and their checksums.
`UPLOAD_INSTRUCTIONS.txt` contains these browser steps.

`character_history.json` and `funding_history.json` are now small index files.
Their records are in adjacent `character_history.part-*.json` and
`funding_history.part-*.json` files, grouped by common filename prefixes. Keep
**every part referenced by each index**. `json_store.py` reconstructs the original
JSON automatically, validates sizes, checksums and record counts, and accepts
legacy unsplit JSON as well. Missing, mixed, or damaged parts fail clearly instead
of dropping observations. New parts are written before the index is switched;
subsequent scans retain this split format and remove obsolete managed parts.
Older unreferenced parts left on GitHub are ignored safely.

These split files are source/build inputs. The site's optional single-file import
still accepts normalized, unsplit native-transfer JSON; importing an index file
alone cannot provide its transfer parts.

## Nightly character and funding refresh

The existing workflow is scheduled for **00:00 Philippine time** (`0 16 * * *`
in UTC). It refreshes character profiles/marketplace observations and runs a
bounded native-WEMIX refresh before generating the site. GitHub may start scheduled
runs later during high load; this is a scheduled start, not a guarantee that the
published databases change at exactly midnight. See
[GitHub's scheduling notes](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

The funding step runs on **schedule** and manual **Run workflow** events. Ordinary
source-code pushes rebuild the site without repeating the funding refresh.
`funding_refresh.json` controls the nightly limits:

- At most **100 wallets**, **3 pages of 1,000 transactions per wallet**, and an
  approximately **600-second collection budget** (15-minute step timeout).
- Upstream search depth **3** and a **90-day** window before recorded purchases.
- Purchase buyers for **1358, 3433, 1154, and 3871** are prioritized. Up to 20
  wallet slots are reserved for those buyers and their upstream branches.
- The remaining work rotates across indexed purchase buyers and previously
  tracked wallets, using the oldest attempt first. New/unchecked wallets enter
  the rotation. A single nightly run does **not** refresh every wallet's complete
  history; unfinished coverage remains visible and is extended over later runs.

Every query merges transfers by transaction hash and retains prior evidence.
Previously complete histories can stop after their newest transactions overlap
known evidence; previously partial histories remain partial unless the full
transaction list is reached. Busy wallets keep the page-limit warning. Per-wallet
attempt and successful-check times distinguish stale data from a new attempt.
The collector checkpoints every ten wallets and saves when its time budget ends.

Both databases' indexes and part files are committed back to `main`. Network
failures or a funding-step timeout do not block character updates or publishing;
the latest retained funding evidence remains available. The funding view reports
its last refresh attempt, wallet count, remaining work, and failed queries.
Native WEMIX collection excludes WWEMIX and internal calls.

Run the same bounded refresh locally with `python collect_funding.py --nightly`.
The existing `--nft-ids` command remains available for a specific investigation.
To deploy this change, update `collect_funding.py`, `funding_refresh.json`,
`funding-ui.js`, `prepare_upload.py`, the changed tests, and the workflow. Existing
database parts on GitHub do not need to be replaced by an older local snapshot.

## Wallet activity and high-value outliers

Open **Wallet activity** from the navigation, or use **Activity** beside a wallet
in character details or graph inspection. The original wallet links still open
WEMIX Scan. `wallet.html` provides separate **All activity**, **Regular
transactions**, and **Internal transactions** tabs. The combined view omits root
calls duplicated by the internal API and preserves distinct traces in one parent
transaction. Gas fees belong to regular senders and are never charged again to
internal traces. Failed transfers move zero value; their regular gas fee remains
available. Internal entries without a loaded successful parent remain labelled
**Trace reported** rather than independently verified success.

For `0xbeaabc38996609c58c1de8d30acd368ef47d5b63`, the default view focuses on
**October 30, 2026 through today (Philippine time)**, with a visible **1,000 WEMIX
minimum**. This isolates four large transfers in the captured history: 25,000
received and 20,000 sent on October 30, plus 16,302.8151 and 16,302 received
internally on November 1. The cutoff is a high-value filter, not a statistical
outlier classification. Lower the minimum to include smaller unusual amounts.
The **All dates & amounts** button restores the full loaded history. Both date
boundaries use Philippine time. Filter settings are retained in the share URL.

The page supports sent/received/self filters, largest-first or newest sorting,
a minimum amount, and gas paid by the selected wallet. Wallet and transaction
links point to Scan. Missing fee data is shown as uncollected, not as a zero fee.
WEMIX, WWEMIX and other token assets are not combined into one numeric ranking.

WEMIX Scan does not allow cross-origin browser reads from GitHub Pages. The page
therefore fetches small, generated **same-origin** assets under `wallet-data/`.
It loads a full wallet snapshot where available; other wallets can use the
existing funding-transfer cache, explicitly labelled transfer-only and incomplete
for zero-value calls, fees and internal history. A wallet absent from collected
records shows instructions for collection rather than claiming no on-chain activity.

To add or refresh a wallet, open the existing deployment workflow and choose
**Run workflow → Wallet address (optional)**. The address is passed through an
environment variable and validated before use. This targeted run skips the wider
funding refresh, collects the requested wallet's regular and internal history,
preserves prior evidence, and publishes the result. Tracked wallets also refresh
nightly. `wallet_activity_config.json` sets watched addresses, a 5-wallet budget,
3 pages per category, and a 180-second collection budget. Busy histories stay
partial. Previously complete snapshots can refresh incrementally by overlap.

The durable source is `wallet_activity.json` plus its small `wallet_activity.part-*.json`
files. The initial example snapshot contains complete regular and internal API
history as checked on November 24, 2026; API row counts include discarded duplicate
root calls. The workflow commits wallet activity together with the other two
databases. `collect_wallet_activity.py --wallet 0x...` runs a local refresh.

`generate_html.py` now produces **three pages** and the generated `wallet-data/`
assets. `build_site.py` verifies and stages all of them. Upload the source files and
small durable JSON parts, not `wallet.html` or the generated `wallet-data/` folder.
`prepare_upload.py` includes the new sources and the wallet snapshot automatically.
For an existing repository, the `github-upload-wallet` patch excludes older local
character/funding database snapshots so uploading it does not roll those databases
back. Update `.github/workflows/deploy.yml` separately using GitHub's web editor.

## Prices and availability

YMIR's "Starting Price" can remain on an NFT after its listing ends. Current
listing state and character metadata come from WEMIX's public JSON NFT detail endpoint.
This avoids downloading and parsing large HTML pages, including the YMIR pages
that may not expose newer characters.
Listed price is shown for a sale or an available/upcoming auction. Bid and offer
availability use the marketplace's explicit flags. Missing data means Unknown.
Auction deadlines are applied only when WEMIX reports an active bidding countdown.
Before the first bid, `auctionEndTime` can contain a past provisional timestamp
even though bidding is available. It must not mark the auction ended or hide its
price. These auctions show “Awaiting first bid · no active countdown.” A real active
countdown can still expire between scans, and the browser handles that separately.
NFT #289 (5Flower), captured on November 21, 2026, is a regression case: 21,000
starting bid, bidding available, offers unavailable, and no active countdown.

Last known price preserves a previously observed listing, the marketplace's
previous price, or an existing archive price. It is not proof of a completed sale.
Prices are token amounts; hover over a price for its currency contract. The known
currency's 18 decimals were checked against WEMIX's rendered price; unknown
currencies are left blank rather than converted with guessed decimals.

All values are scan snapshots. Check times are displayed in Philippine time.
A full local scan of IDs 1–5000 found 4,199 characters in 107.5 seconds. All IDs
in 3700–4200 were present. Runtime on GitHub depends on API latency and retries.

## Name history and persistence

`character_history.json` and its `character_history.part-*.json` files hold durable
state keyed by NFT ID. It seeds the existing
CSV names and prices with unknown dates, then records name transitions, first and
last observation times, the latest successful character data, and last known price.
Name reversions are retained. Search includes previous names and NFT IDs.
Changes before the archive and changes between daily scans cannot be recovered.
Keep the index and all its referenced part files across runs; do not regenerate
the archive from scratch.

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

## Deploying both pages and checking a graph 404

Run `python build_site.py` to generate both pages and stage the complete website
in `_site/`. The builder checks relative page links and fails if `graph.html` is
missing, so the Actions workflow cannot publish an index-only artifact. Upload
`build_site.py`, `test_build_site.py`, and the updated `.github/workflows/deploy.yml`
along with the other source files. The workflow uploads the complete `_site/` folder.

For branch-based Pages hosting, both generated `index.html` and `graph.html` must
be in the configured publishing folder. Uploading only `index.html` leaves the
graph link pointing to a file that was never published. A graph page in the source
repository is not sufficient if it is absent from the deployed Pages artifact.
The local build serves both pages and their links correctly under a project path;
a specific deployed 404 still needs the live URL and active Pages configuration
to diagnose. Both pages use the same yellow paper palette and shared typography.

## Reference theme and directed graph exploration

The shared theme includes the exact original stylesheet from revision
`6125eb2823bf541c3a605c34e3b7f0dd72929dc0`, with extensions for the newer controls,
graph and character dossier. Both pages load the reference's Nunito, Patrick Hand
and Press Start 2P fonts with local fallbacks.

The graph defaults to **Directed transfers**, with arrows from sender wallet to
recipient wallet, labeled by IGN (NFT ID) and date at every graph size.
The checked-by-default Show NFT labels control can hide transfer labels and NFT
node labels without changing the layout, zoom, or wallet labels.
Click a wallet node to open its WEMIX Scan address. Click an NFT node in the
ownership view, or an NFT label on a transfer, to open character information.
Use the separate Inspect actions to see records, center a node, exclude a wallet,
or save a nickname and review tag. Dragging never opens another page.

Exclusions and wallet notes are stored in this browser's local storage. Excluded
wallets are removed from display and path finding; restore them in Excluded wallets.
Date filters use UTC and apply to the transfer view. Ownership connections remain
available as a separate association view. Starting from an NFT in the transfer
view centers its available owner wallet, as explained above the graph.

Wallet transfer networks can contain cycles, including transfers back to a former
owner. They are not inherently DAGs. Chronological path finding follows arrows and
strictly increasing event times, returning an earliest-arrival path, not necessarily
the fewest steps. Same-second transfers are not chained without reliable ordering.
These paths can span different NFTs and do not assert that one NFT traveled the
entire route. The display caps the neighborhood at 40 nodes; paths use the full
filtered index. Layered layout, scrollable canvas and curved parallel arrows reduce
overlap. Edge direction is never inferred from an owner snapshot.

A **Possible intermediary pattern** hint requires at least 3 distinct NFTs received
and later sent to a different destination than their sender, and at least 2 source
and 2 destination wallets. Counts and the rule are shown in Inspect. A return to the
sender does not count as pass-through. The hint is a review aid, not proof of
middleman activity, account ownership or identity. Exchanges and custody wallets
can exhibit the same pattern. Manual tags are labeled as your local notes.

Character dossiers now use a summary, current-wallet section, collapsible ownership,
price, name and related-character histories, with transaction hashes behind a
Transaction details disclosure. Wallet addresses open Scan; Related searches the
local index for wallet associations.

## Shared WEMIX funding sources

Select **Shared WEMIX funders**, enter a focused NFT ID or exact name, and leave
**Compare with** blank to discover other characters with shared funding sources.
Choose a lookback window and maximum funding depth, then Explore connections.
For example, focus on **1358 (Bunn1eSSS)** with depth 3, a 90-day lookback, and
buyer roots enabled to discover kufuking (3433), kufuking2 (1154), and
GèenWoo/kufuking3 (3871) in the included snapshot. Character info popups also have
a **Discover shared funders** link that opens this single-NFT view.

Results show `IGN (NFT ID)`, the number of shared sources, and the shortest
connection's maximum branch depth. They are sorted by shorter branches, then more
shared sources, then NFT ID, with 20 characters per page. **View connection** opens
a specific pair's graph and transaction evidence; **Find other NFTs with shared
funders** returns to discovery. The graph and evidence follow the current result
page, with an 80-node graph limit. Same-buyer 0-hop matches are labeled explicitly.
Only sources connecting to the focused NFT are returned; unrelated pairs sharing
a source are excluded. Excluded wallets also break discovery branches.

Enter a second NFT ID (for example 3871) in **Compare with** for a specific pair.
Both modes match a common source
wallet sending at least 1 native WEMIX to **different purchase buyers** before the
two NFTs' recorded purchases. It includes former purchase buyers, not just current
owners, and considers each recorded mainnet purchase separately. User-transfers
are not treated as purchases. Supported lookback windows are 1, 7, 30 and 90 days.
Exclusions apply to both matching and display. Exact amounts, funding dates,
purchase dates and both transaction hashes are shown. The graph distinguishes
native-funding edges from buyer-to-NFT purchase edges.

**Maximum funding depth** defaults to 1 hop. Choose 2 or 3 hops to include one or
two intermediate wallets on each branch. Funding depth and lookback appear in the
main controls when **Shared WEMIX funders** is selected. The ownership/transfer
view has a separate depth selector with 1, 2, 3, and 4 steps (default 2).
**Include buyer wallets as sources (0 hops)**
is enabled by default: a purchase buyer can itself be the source sending WEMIX to
the other buyer. A 0-hop branch identifies that buyer, not an incoming transfer.
Disable the checkbox to require incoming funding on every branch. Each source keeps its shortest discovered
valid branch to each purchase buyer. Branches may have different lengths, each
within the selected limit. Transfers must strictly increase in time toward the
buyer and occur before the purchase; same-second ordering is not assumed. Every
hop must fall inside the purchase's lookback window and carry at least 1 WEMIX.
Repeated wallets are excluded from a branch, and excluded intermediate wallets
break its path. The evidence list and graph include every intermediate transfer.
Pair analysis is capped at 20,000 incoming-edge checks; discovery has a shared
500,000-check budget across the index and processes the focused NFT first. Hitting
either cap is reported as incomplete. Discovery shows the number of NFTs with
recorded purchases visited. Intermediate-wallet histories are included in
coverage checks. Discovery uses the loaded dataset and does not fetch missing
histories automatically; it cannot establish that an undiscovered connection
does not exist. NFTs without recorded purchases cannot be compared by this mode.

NFT transfer history cannot supply incoming WEMIX funding. The included native
WEMIX snapshot was collected from the current WEMIX Scan API. Captured checks for
kufuking (3433), kufuking2 (1154), GèenWoo/kufuking3 (3871), and Bunn1eSSS (1358)
are saved in `funding_case_report.json`. All 13 native transfers used in those
results were also checked against WEMIX mainnet RPC for successful execution,
addresses, exact value, and block timestamp. Automated tests replay this evidence
offline. Some upstream histories remain partial due to busy-wallet API limits;
a missing match is not proof of no connection.

`collect_funding.py` is the bounded collector used by the nightly refresh and
manual investigations, for the current documented
[WEMIX Scan account API](https://certik.gitbook.io/wemix-explorer-docs/reference/api-reference/accounts).
The default Scan provider requires no API key:

```text
python collect_funding.py --nft-ids 1358 3871 --max-pages 3
python build_site.py
```

The API must be reachable and compatible with the documented schema. The older
Explorer API is available with `--provider legacy` and `WEMIX_EXPLORER_API_KEY`
in the environment; credentials are never embedded in the site. Collection stays
separate from the NFT scraping loop. The scheduled funding step has its own wallet,
page and time limits so an unavailable indexer preserves existing evidence and
allows the character update and site build to continue. Successful
records persist in `funding_history.json` and its `funding_history.part-*.json` files; incomplete/failed wallet queries retain
existing evidence and report their coverage. This file is embedded by the graph
generator when present. The collector queries at most three pages of 1,000 records
per wallet by default, newest first, and follows the documented request rate.
The Scan API exposes a maximum 10,000-record pagination window per wallet; reaching
that window is reported as partial history. Completeness refers
only to the external native-transaction list, not internal calls or wrapped tokens.

For upstream collection, match the intended search settings:

```text
python collect_funding.py --nft-ids 1358 3871 --max-depth 3 --lookback-days 30 --max-wallets 100
```

The collector expands incoming sources from buyers to intermediate wallets in
bounded layers. It preserves prior evidence, applies page/wallet limits and records
partial coverage when those limits or a query failure prevent a complete scan.
Increasing depth in the browser does not fetch missing histories automatically;
import or collect those intermediate histories first. URLs retain the selected
funding depth using `fundingDepth=1`, `fundingDepth=2`, or `fundingDepth=3`,
lookback using `fundingDays=7` (or 1, 30, 90), and the buyer option using `buyerRoots=1`
or `buyerRoots=0`. For the test pair, select 1358 and 3871, depth 3, and 90 days
to see both the buyer-to-buyer transfer and the older shared source.

Alternatively, the funding-history disclosure accepts a **normalized JSON** file
with `schema_version: 1`, `chain_id: 1111`, `asset: "WEMIX"`, `transfers: [...]` and
optional `coverage: [...]`. Each transfer needs `from`, `to`, positive decimal-string
`amount_wei`, Unix-seconds `at`, `tx_hash`, `asset: "WEMIX"`, and `chain_id: 1111`.
Coverage entries use `wallet` and `complete`; missing entries mean incomplete.
The Python `funding.scan_native_transfer` function converts current Scan records
(`funding.native_transfer` supports the legacy Explorer format)
and rejects failed or zero-value transactions. Raw Scan CSV is not accepted directly.
Imported JSON stays in page memory and is explicitly labeled not independently
verified. No live result is fabricated from the ownership network.

Native WEMIX, WWEMIX and internal transfers must remain separate until their
respective evidence is collected. A shared source may be an exchange or custodian.
Even a timed funding match does not prove common identity or that those precise
fungible coins paid for an NFT. Evidence can be reviewed, tagged or excluded.

Additional source files for this feature: `funding.py`, `collect_funding.py`,
`funding-core.js`, `funding-ui.js`, `test_funding.py`, and `test_funding.cjs`.

Upload the small `funding_history.json` index **and every referenced
`funding_history.part-*.json` file** with the source files to include this collected
snapshot in the deployed graph. `prepare_upload.py` assembles the complete set. `funding_case_report.json` is the captured evidence used by
tests; keep it with the test files. Files beginning with `sample_` are local
investigation scratch files and should stay excluded.
