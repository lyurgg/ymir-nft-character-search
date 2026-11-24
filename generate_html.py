import csv
import json

from datetime import datetime, timedelta, timezone
from pathlib import Path
from character_history import load_history, clean_price
from marketplace import BASE_URL as MARKET_URL


CSV_PATH = "characters.csv"
OUTPUT_PATH = "index.html"

BASE_URL = "https://www.legendofymir.com/en/blockchain/nft/"


# ============================================================
# Load CSV
# ============================================================

def load_characters(csv_path: str):
    characters = []
    history = load_history(csv_path=csv_path)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            entry = history.get(row["nft_id"], {})
            market = entry.get("character", {}).get("market", {})
            characters.append({
                "nft_id": int(row["nft_id"]),
                "character_name": row["character_name"].strip(),
                "server": row["server"].strip(),
                "gp": row["gp"].strip(),
                "character_class": row.get("character_class", "").strip(),
                "starting_price": clean_price(market.get("listed_price")),
                "market": market,
                "last_known_price": entry.get("last_known_price", ""),
                "last_known_price_at": entry.get("last_known_price_at"),
                "last_known_price_source": entry.get("last_known_price_source", ""),
                "last_known_currency": entry.get("last_known_currency", ""),
                "name_history": entry.get("names", []),
                "price_history": entry.get("prices", []),
                "owner_history": entry.get("owners", []),
                "transfers": entry.get("transfers", []),
                "transfer_check": entry.get("transfer_check", {}),
                "last_scan": entry.get("last_scan", {}),
            })

    return characters


# ============================================================
# Generate HTML
# ============================================================

def generate_html(characters):

    generated_at = datetime.now(
        timezone(
            timedelta(hours=8),
            name="PHT",
        )
    ).strftime("%b %d, %Y · %I:%M %p PHT")

    character_json = json.dumps(
        characters,
        ensure_ascii=False,
    ).replace("</", "<\\/")

    html = r"""<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Legend of YMIR NFT Character Search</title>

<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&amp;family=Patrick+Hand&amp;family=Press+Start+2P&amp;display=swap">
<style>__THEME_CSS__
__DASHBOARD_CSS__</style>

</head>


<body>

<div class="container">


    <!-- ====================================================
         Header
    ===================================================== -->

    <nav class="site-nav"><a class="brand" href="index.html">YMIR <span>Character atlas</span></a><div><a href="index.html" aria-current="page">Characters</a><a href="graph.html">Ownership graph</a><a href="wallet.html">Wallet activity</a><a href="reports.html">Special reports</a></div></nav>
    <div class="header">

        <span class="surface-eyebrow">
            Legend of YMIR · Character archive
        </span>

        <h1>
            NFT Character Search
        </h1>

        <div class="subtitle">
            Browse character stats, marketplace snapshots, and observed name changes.
        </div>

    </div>


    <!-- ====================================================
         Search
    ===================================================== -->

    <div class="search-card">

        <div class="search-container">

            <input
                id="searchInput"
                type="text"
                placeholder="Search name, former name, NFT ID, wallet, class, or server..."
                autocomplete="off"
            >

            <button
                class="primary-button"
                onclick="searchCharacters()"
            >
                Search
            </button>

        </div>

    </div>


    <!-- ====================================================
         Toolbar
    ===================================================== -->

    <div class="surface-heading">

        <div>
            <span class="surface-eyebrow">Character board</span>
            <h2>All NFT Characters</h2>
        </div>

        <div id="resultCount"></div>

    </div>

    <div class="toolbar">

        <div class="toolbar-buttons">

            <button
                class="primary-button"
                onclick="showAll()"
            >
                Show All Characters
            </button>

            <button
                class="secondary-button"
                onclick="clearResults()"
            >
                Reset
            </button>

        </div>

        <div class="sort-controls">

            <label class="sort-label" for="sortField">Sort by</label>

            <select id="sortField" onchange="applySort()">
                <option value="power">Power</option>
                <option value="name">Name</option>
                <option value="class">Class</option>
                <option value="server">Server</option>
                <option value="price">Listed Price</option>
                <option value="last_price">Last Known Price</option>
                <option value="value">Price per 100k Power</option>
                <option value="nft_id">NFT ID</option>
            </select>

            <button id="sortDirection" class="secondary-button" onclick="toggleSortDirection()">
                High → Low
            </button>

        </div>

    </div>


    <!-- ====================================================
         Results
    ===================================================== -->

    <div id="scanSummary" class="scan-summary" aria-live="polite"></div>
    <p><a class="nft-link" href="graph.html">Explore the ownership graph</a> · Follow connections between NFTs and current or previous wallets.</p>
    <div class="market-filter">
        <label for="marketFilter">Availability</label>
        <select id="marketFilter" onchange="searchCharacters()">
            <option value="all">All characters</option>
            <option value="listed">Listed for sale</option>
            <option value="bid">Bidding available</option>
            <option value="offer">Offers available</option>
            <option value="unknown">Unknown</option>
        </select>
        <label>Class <select id="classFilter" onchange="searchCharacters()"><option value="">All classes</option></select></label>
        <label>Server <select id="serverFilter" onchange="searchCharacters()"><option value="">All servers</option></select></label>
        <label>Currency <select id="currencyFilter" onchange="searchCharacters()"><option value="">All currencies</option></select></label>
        <label>Price type <select id="priceType" onchange="searchCharacters()"><option value="listed">Listed</option><option value="last">Last known</option></select></label>
        <label>Min price <input id="minPrice" type="number" min="0" step="any" oninput="searchCharacters()" placeholder="Any"></label>
        <label>Max price <input id="maxPrice" type="number" min="0" step="any" oninput="searchCharacters()" placeholder="Any"></label>
        <label>Freshness <select id="freshnessFilter" onchange="searchCharacters()"><option value="">Any age</option><option value="fresh">Checked within 24h</option><option value="stale">Outdated</option><option value="failed">Check failed</option><option value="unknown">Never checked</option></select></label>
        <label><input id="favoritesOnly" type="checkbox" onchange="searchCharacters()"> Favorites only</label>
    </div>
    <div id="pagination" class="pagination"></div>
    <div class="table-card">

        <div
            id="results"
            class="table-container"
        >

            <!-- All rows are rendered automatically on page load. -->

        </div>

    </div>

    <dialog id="characterDetails" aria-labelledby="detailsTitle">
        <button class="secondary-button close-details" onclick="document.getElementById('characterDetails').close()">Close</button>
        <div id="detailsContent"></div>
    </dialog>


    <div class="footer">
        Legend of YMIR NFT Character Index · Refreshed __GENERATED_AT__<br>
        Marketplace data is a snapshot, not live. Check WEMIX before bidding or offering.<br>
        Prices are token amounts (currency contract on hover). Last known prices can be previous marketplace prices or archived listings, not confirmed sales.<br>
        Name history records observations by NFT ID; dates are scan times, not exact rename times. Earlier history may be unavailable.
        <br>Wallet links cover indexed YMIR characters only. Shared wallets do not prove a shared player; marketplaces and custodians may hold NFTs for others.
    </div>


</div>


<script>
__APP_SCRIPT__
</script>

</body>

</html>
"""


    # ========================================================
    # Embed data
    # ========================================================

    html = html.replace("__APP_SCRIPT__", Path(__file__).with_name("app.js").read_text(encoding="utf-8"))
    html = html.replace("__THEME_CSS__", Path(__file__).with_name("theme.css").read_text(encoding="utf-8"))
    html = html.replace("__DASHBOARD_CSS__", Path(__file__).with_name("dashboard.css").read_text(encoding="utf-8"))
    report_path = Path("scan_report.json")
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    html = html.replace("__SCAN_REPORT__", json.dumps(report, ensure_ascii=False).replace("</", "<\\/"))

    html = html.replace(
        "__CHARACTER_DATA__",
        character_json,
    )


    html = html.replace(
        "__BASE_URL__",
        BASE_URL,
    )
    html = html.replace("__MARKET_URL__", MARKET_URL)


    html = html.replace(
        "__GENERATED_AT__",
        generated_at,
    )


    return html


# ============================================================
# Main
# ============================================================

def main():

    print(
        f"Reading: {CSV_PATH}"
    )


    characters = load_characters(
        CSV_PATH
    )


    print(
        f"Loaded {len(characters):,} characters."
    )


    html = generate_html(
        characters
    )


    Path(
        OUTPUT_PATH
    ).write_text(
        html,
        encoding="utf-8",
    )

    from generate_graph import generate_graph
    Path("graph.html").write_text(generate_graph(characters), encoding="utf-8")
    from generate_wallet import generate_wallet
    Path("wallet.html").write_text(generate_wallet(), encoding="utf-8")
    from generate_reports import generate_reports
    Path("reports.html").write_text(generate_reports(), encoding="utf-8")
    Path("reports-evidence.json").write_bytes(Path("wallet-investigation.json").read_bytes())


    print(
        f"Generated: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
