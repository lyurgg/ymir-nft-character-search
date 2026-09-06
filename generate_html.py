import csv
import json

from datetime import datetime, timedelta, timezone
from pathlib import Path


CSV_PATH = "characters.csv"
OUTPUT_PATH = "index.html"

BASE_URL = "https://www.legendofymir.com/en/blockchain/nft/"


# ============================================================
# Load CSV
# ============================================================

def load_characters(csv_path: str):
    characters = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            characters.append({
                "nft_id": int(row["nft_id"]),
                "character_name": row["character_name"].strip(),
                "server": row["server"].strip(),
                "gp": row["gp"].strip(),
                "character_class": row.get("character_class", "").strip(),
                "starting_price": row.get("starting_price", "").strip(),
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

    html = """<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Legend of YMIR NFT Character Search</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Patrick+Hand&family=Press+Start+2P&display=swap"
    >

    <style>

        /* ==================================================
           Variables
        ================================================== */

        :root {
            --bg: #0d0f13;
            --surface: #15181e;
            --surface-light: #1b1f27;
            --surface-hover: #20252e;

            --border: #292e38;

            --text: #f1f3f5;
            --text-muted: #969da9;

            --gold: #d8b664;
            --gold-hover: #e6c875;
            --gold-dark: #9f8140;

            --radius: 10px;
        }


        /* ==================================================
           Base
        ================================================== */

        * {
            box-sizing: border-box;
        }

        html {
            color-scheme: dark;
        }

        body {
            margin: 0;

            font-family:
                Inter,
                "Segoe UI",
                Arial,
                Helvetica,
                sans-serif;

            background:
                radial-gradient(
                    circle at top,
                    #171b23 0,
                    #0d0f13 420px
                );

            color: var(--text);

            min-height: 100vh;
        }


        /* ==================================================
           Layout
        ================================================== */

        .container {
            max-width: 1280px;

            margin: 0 auto;

            padding:
                48px
                28px
                80px;
        }


        /* ==================================================
           Header
        ================================================== */

        .header {
            margin-bottom: 32px;
        }

        h1 {
            margin: 0;

            font-size: 34px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        .accent {
            color: var(--gold);
        }

        .subtitle {
            color: var(--text-muted);

            margin-top: 8px;

            font-size: 16px;
        }


        /* ==================================================
           Search Card
        ================================================== */

        .search-card {
            padding: 20px;

            background: rgba(21, 24, 30, 0.9);

            border: 1px solid var(--border);

            border-radius: var(--radius);

            margin-bottom: 22px;
        }


        .search-container {
            display: flex;

            gap: 12px;
        }


        #searchInput {
            flex: 1;

            padding: 14px 16px;

            font-size: 16px;

            background: var(--surface-light);
            color: var(--text);

            border: 1px solid #303640;

            border-radius: 8px;

            outline: none;

            transition:
                border-color 0.15s ease,
                box-shadow 0.15s ease;
        }


        #searchInput::placeholder {
            color: #777e89;
        }


        #searchInput:focus {
            border-color: var(--gold);

            box-shadow:
                0 0 0 3px
                rgba(216, 182, 100, 0.10);
        }


        /* ==================================================
           Buttons
        ================================================== */

        button {
            border: 0;

            border-radius: 8px;

            padding: 13px 20px;

            font-size: 14px;
            font-weight: 600;

            cursor: pointer;

            transition:
                background 0.15s ease,
                transform 0.08s ease;
        }


        button:active {
            transform: translateY(1px);
        }


        .primary-button {
            background: var(--gold);
            color: #151515;
        }


        .primary-button:hover {
            background: var(--gold-hover);
        }


        .secondary-button {
            background: #262b34;
            color: #d7dbe1;

            border: 1px solid #343a45;
        }


        .secondary-button:hover {
            background: #303640;
        }


        /* ==================================================
           Toolbar
        ================================================== */

        .toolbar {
            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 16px;

            margin-bottom: 14px;
        }


        .toolbar-buttons {
            display: flex;
            gap: 10px;
        }


        #resultCount {
            color: var(--text-muted);

            font-size: 14px;
        }


        .result-number {
            color: var(--text);
            font-weight: 600;
        }


        /* ==================================================
           Table Card
        ================================================== */

        .table-card {
            overflow: hidden;

            background: var(--surface);

            border: 1px solid var(--border);

            border-radius: var(--radius);

            box-shadow:
                0 12px 36px
                rgba(0, 0, 0, 0.18);
        }


        .table-container {
            overflow-x: auto;
        }


        table {
            width: 100%;

            border-collapse: collapse;

            table-layout: fixed;
        }


        /* ==================================================
           Table Header
        ================================================== */

        th {
            padding: 15px 18px;

            background: #20242c;

            color: #f5f5f5;

            font-size: 13px;
            font-weight: 600;

            text-transform: uppercase;

            letter-spacing: 0.04em;

            text-align: left;

            border-bottom: 1px solid #303640;

            position: sticky;

            top: 0;

            z-index: 5;
        }


        /* ==================================================
           Table Rows
        ================================================== */

        td {
            padding: 15px 18px;

            font-size: 15px;

            border-bottom: 1px solid #252a32;

            vertical-align: middle;
        }


        tbody tr {
            transition: background 0.12s ease;
        }


        tbody tr:hover {
            background: var(--surface-hover);
        }


        tbody tr:last-child td {
            border-bottom: none;
        }


        /* ==================================================
           Individual Columns
        ================================================== */

        .col-id {
            width: 100px;
        }

        .col-name {
            width: auto;
        }

        .col-class {
            width: 170px;
        }

        .col-server {
            width: 180px;
        }

        .col-gp {
            width: 145px;

            /*
             * IMPORTANT:
             * Header and body are both right aligned.
             */
            text-align: right;
        }

        .col-price {
            width: 155px;
            text-align: right;
        }

        .col-link {
            width: 130px;
        }


        .id {
            color: var(--text-muted);

            font-variant-numeric:
                tabular-nums;
        }


        .character-name {
            font-weight: 500;
        }


        /* ==================================================
           GP
        ================================================== */

        .gp {
            text-align: right;

            font-variant-numeric:
                tabular-nums;

            font-weight: 600;

            color: #f2f2f2;

            white-space: nowrap;
        }


        /* ==================================================
           Server Badge
        ================================================== */

        .server-badge {
            display: inline-block;

            padding: 5px 10px;

            background: #242932;

            border: 1px solid #353b46;

            border-radius: 999px;

            font-size: 13px;

            color: #d9dde3;

            white-space: nowrap;
        }


        .class-badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 999px;
            white-space: nowrap;
        }


        .price {
            text-align: right;
            white-space: nowrap;
        }


        /* ==================================================
           NFT Links
        ================================================== */

        .nft-link {
            display: inline-flex;

            align-items: center;

            gap: 5px;

            color: var(--gold);

            text-decoration: none;

            font-size: 14px;
            font-weight: 500;

            white-space: nowrap;
        }


        .nft-link:hover {
            color: var(--gold-hover);
        }


        .arrow {
            font-size: 12px;

            opacity: 0.7;
        }


        /* ==================================================
           Empty State
        ================================================== */

        .empty {
            padding: 60px 20px;

            text-align: center;

            color: var(--text-muted);
        }


        .empty-title {
            font-size: 18px;

            color: var(--text);

            margin-bottom: 6px;
        }


        /* ==================================================
           Footer
        ================================================== */

        .footer {
            margin-top: 22px;

            text-align: center;

            color: #666d78;

            font-size: 12px;
        }


        /* ==================================================
           Mobile
        ================================================== */

        @media (max-width: 700px) {

            .container {
                padding:
                    28px
                    14px
                    60px;
            }


            h1 {
                font-size: 28px;
            }


            .search-container {
                flex-direction: column;
            }


            .search-container button {
                width: 100%;
            }


            .toolbar {
                flex-direction: column;

                align-items: stretch;
            }


            .toolbar-buttons {
                width: 100%;
            }


            .toolbar-buttons button {
                flex: 1;
            }


            .col-id {
                width: 80px;
            }

            .col-name {
                width: 210px;
            }

            .col-class {
                width: 150px;
            }

            .col-server {
                width: 150px;
            }

            .col-gp {
                width: 125px;
            }

            .col-price {
                width: 140px;
            }

            .col-link {
                width: 110px;
            }


            th,
            td {
                padding: 13px 12px;
            }

        }

        /* ==================================================
           Kings Asgard Raffle sketch / arcade theme
        ================================================== */

        :root {
            --bg: #faf4e6;
            --bg-deep: #f0e6d1;
            --bg-raised: #fffdf6;
            --bg-muted: #f4ecd9;
            --bg-well: #ede2ca;
            --ink: #2f2a24;
            --ink-soft: #574d40;
            --muted: #7c7263;
            --line: #2f2a24;
            --line-soft: #d8cbaf;
            --gold: #e08a1e;
            --gold-bright: #ffb445;
            --gold-dim: #a6621a;
            --sky: #2b7fd4;
            --grape: #8455c9;
            --serif: "Patrick Hand", "Bradley Hand", "Segoe Print", cursive;
            --sans: "Nunito", "Segoe UI", system-ui, sans-serif;
            --arcade: "Press Start 2P", ui-monospace, monospace;
            --r-sm: 9px 7px 10px 8px / 7px 10px 8px 9px;
            --r-md: 14px 11px 16px 12px / 11px 16px 12px 14px;
            --r-lg: 22px 17px 24px 19px / 17px 24px 19px 22px;
            --shadow: 3px 3px 0 rgb(47 42 36 / 0.14);
            --shadow-pop: 4px 4px 0 var(--ink);
            --shadow-pop-sm: 2px 2px 0 var(--ink);
        }

        html { color-scheme: light; }

        ::selection { background: var(--gold-bright); color: var(--ink); }

        body {
            background:
                radial-gradient(760px 340px at 12% -6%, rgb(224 138 30 / 0.16), transparent 62%),
                radial-gradient(900px 420px at 88% -10%, rgb(43 127 212 / 0.13), transparent 64%),
                radial-gradient(700px 500px at 50% 108%, rgb(132 85 201 / 0.09), transparent 68%),
                repeating-linear-gradient(0deg, rgb(47 42 36 / 0.045) 0 1px, transparent 1px 26px),
                repeating-linear-gradient(90deg, rgb(47 42 36 / 0.045) 0 1px, transparent 1px 26px),
                linear-gradient(180deg, var(--bg) 0%, var(--bg-deep) 100%);
            background-attachment: fixed;
            color: var(--ink);
            font-family: var(--sans);
            font-weight: 600;
            line-height: 1.55;
            -webkit-font-smoothing: antialiased;
        }

        :focus-visible {
            outline: 2px dashed var(--gold-dim);
            outline-offset: 3px;
            border-radius: 4px;
        }

        .container { max-width: 1420px; padding-top: 32px; }

        .header {
            position: relative;
            overflow: hidden;
            margin-bottom: 28px;
            padding: clamp(24px, 4vw, 48px);
            border: 3px solid var(--line);
            border-radius: 24px;
            background:
                radial-gradient(circle at 1px 1px, rgb(47 42 36 / 0.14) 1px, transparent 1.6px) 0 0 / 14px 14px,
                radial-gradient(680px 320px at 100% 0%, rgb(255 180 69 / 0.55), transparent 66%),
                radial-gradient(560px 300px at 0% 100%, rgb(43 127 212 / 0.24), transparent 68%),
                linear-gradient(145deg, #fff8e6, #fdeecd 58%, #f8e2bd);
            box-shadow: 7px 7px 0 var(--ink);
        }

        .header::after {
            content: "";
            position: absolute;
            right: -95px;
            top: -105px;
            width: 260px;
            height: 260px;
            border: 2px dashed rgb(47 42 36 / 0.2);
            border-radius: 50%;
            box-shadow: 0 0 0 34px rgb(47 42 36 / 0.05), 0 0 0 76px rgb(47 42 36 / 0.035);
            pointer-events: none;
        }

        .surface-eyebrow {
            position: relative;
            z-index: 1;
            display: block;
            margin-bottom: 8px;
            color: var(--gold-dim);
            font-family: var(--arcade);
            font-size: 0.56rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        h1 {
            position: relative;
            z-index: 1;
            margin: 0 0 10px;
            color: var(--ink);
            font-family: var(--serif);
            font-size: clamp(2.5rem, 6.6vw, 4.6rem);
            font-weight: 400;
            letter-spacing: 0;
            line-height: 0.95;
            text-shadow: 3px 3px 0 rgb(255 180 69 / 0.85);
            text-wrap: balance;
        }

        .accent { color: var(--ink); }

        .subtitle {
            position: relative;
            z-index: 1;
            max-width: 62ch;
            margin: 0;
            color: var(--ink-soft);
            font-size: 1rem;
            font-weight: 600;
        }

        .search-card,
        .table-card {
            background: linear-gradient(180deg, var(--bg-raised), var(--bg-muted));
            border: 2px solid var(--line);
            border-radius: var(--r-md);
            box-shadow: var(--shadow-pop);
        }

        .search-card { padding: 18px 20px; }

        #searchInput,
        select {
            background: #fffdf7;
            color: var(--ink);
            border: 2px solid var(--line);
            border-radius: var(--r-sm);
            box-shadow: inset 2px 2px 0 rgb(47 42 36 / 0.07);
            font-family: var(--sans);
            font-weight: 700;
        }

        #searchInput:focus,
        select:focus {
            outline: none;
            border-color: var(--gold-dim);
            box-shadow: inset 2px 2px 0 rgb(47 42 36 / 0.07), 0 0 0 3px rgb(224 138 30 / 0.32);
        }

        #searchInput::placeholder { color: #a89d89; }

        button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            border: 2px solid var(--line);
            border-radius: var(--r-sm);
            background: var(--bg-raised);
            color: var(--ink);
            box-shadow: var(--shadow-pop-sm);
            font-family: var(--sans);
            font-weight: 800;
        }

        button:hover {
            background: var(--gold-bright);
            color: var(--ink);
            transform: translate(-1px, -1px);
            box-shadow: 3px 3px 0 var(--ink);
        }

        button:active { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--ink); }

        .primary-button {
            background: linear-gradient(180deg, var(--gold-bright), var(--gold));
            color: var(--ink);
            font-weight: 900;
        }

        .primary-button:hover { background: linear-gradient(180deg, #ffc96a, var(--gold-bright)); }
        .secondary-button { background: var(--bg-raised); color: var(--ink); border-color: var(--line); }

        .toolbar { margin: 26px 2px 16px; flex-wrap: wrap; }
        .toolbar-buttons, .sort-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

        .surface-heading {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 16px;
            margin: 32px 2px 10px;
        }

        .surface-heading .surface-eyebrow { margin-bottom: 0; }

        .surface-heading h2 {
            margin: 3px 0 0;
            color: var(--ink);
            font-family: var(--serif);
            font-size: clamp(1.45rem, 3vw, 2rem);
            font-weight: 400;
            line-height: 1.15;
        }

        .sort-label {
            color: var(--ink-soft);
            font-family: var(--arcade);
            font-size: 0.56rem;
            font-weight: 400;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        select { padding: 10px 36px 10px 12px; font-size: 14px; cursor: pointer; }
        #sortDirection { min-width: 118px; }

        #resultCount {
            padding: 5px 11px;
            border: 2px solid var(--line);
            border-radius: 999px;
            background: var(--bg-raised);
            color: var(--ink-soft);
            font-size: 0.78rem;
            font-weight: 800;
        }

        .result-number { color: var(--ink); font-weight: 900; }

        .table-card { overflow: hidden; }
        .table-container { padding: 6px 12px 12px; }

        th {
            padding-top: 14px;
            padding-bottom: 12px;
            background: rgb(255 255 255 / 0.025);
            color: var(--ink-soft);
            border-bottom: 1px solid var(--line-soft);
            font-family: var(--arcade);
            font-size: 0.64rem;
            font-weight: 400;
            letter-spacing: 0.04em;
        }

        td { border-bottom: 1px solid var(--line-soft); color: var(--ink); }
        tbody tr:hover { background: color-mix(in srgb, var(--gold-bright) 14%, transparent); }
        .id { color: var(--muted); font-weight: 800; }
        .character-name { color: var(--ink); font-family: var(--serif); font-size: 1.25rem; font-weight: 400; }
        .gp { color: var(--gold-dim); font-family: var(--arcade); font-size: 0.76rem; font-weight: 400; }

        .server-badge {
            background: #e5d7f7;
            border: 2px solid var(--line);
            border-radius: 999px;
            color: var(--ink);
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .class-badge {
            background: #cfe8f4;
            border: 2px solid var(--line);
            color: var(--ink);
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.04em;
        }

        .price {
            color: var(--gold-dim);
            font-family: var(--arcade);
            font-size: 0.72rem;
            font-weight: 400;
        }

        .price.not-listed {
            color: var(--muted);
            font-family: var(--sans);
            font-size: 0.82rem;
            font-style: italic;
            font-weight: 700;
        }

        .nft-link {
            color: var(--gold-dim);
            font-weight: 700;
            text-decoration: underline;
            text-decoration-style: wavy;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }

        .nft-link:hover { color: var(--gold); }
        .footer { color: var(--muted); font-family: var(--arcade); font-size: 0.56rem; font-weight: 400; letter-spacing: 0.06em; }

        @media (max-width: 850px) {
            .container { padding-top: 18px; }
            .toolbar { align-items: stretch; }
            .surface-heading { align-items: center; }
            .sort-controls { width: 100%; }
            .sort-controls select { flex: 1; }
        }

    </style>

</head>


<body>

<div class="container">


    <!-- ====================================================
         Header
    ===================================================== -->

    <div class="header">

        <span class="surface-eyebrow">
            Kings Asgard · Legend of YMIR
        </span>

        <h1>
            NFT Character Search
        </h1>

        <div class="subtitle">
            Browse the character archive and compare each NFT's class, power, server, and current marketplace listing.
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
                placeholder="Search character name, class, or server..."
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

    <div class="table-card">

        <div
            id="results"
            class="table-container"
        >

            <!-- All rows are rendered automatically on page load. -->

        </div>

    </div>


    <div class="footer">
        Legend of YMIR NFT Character Index · Refreshed __GENERATED_AT__<br>
        Price is the current marketplace starting price when available.
    </div>


</div>


<script>


// ============================================================
// Data
// ============================================================

const characters = __CHARACTER_DATA__;

const BASE_URL = "__BASE_URL__";

let visibleCharacters = [...characters];
let sortAscending = false;


// ============================================================
// Helpers
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function gpToNumber(gp) {

    if (!gp) {
        return 0;
    }

    return Number(
        String(gp).replaceAll(",", "")
    ) || 0;

}


function priceToNumber(price) {

    if (!price) {
        return null;
    }

    const normalized = String(price)
        .replaceAll(",", "")
        .replace(/[^0-9.]/g, "");

    if (!normalized) {
        return null;
    }

    const value = Number(normalized);

    return Number.isFinite(value) ? value : null;

}


function compareText(a, b) {

    return String(a || "").localeCompare(
        String(b || ""),
        undefined,
        {numeric: true, sensitivity: "base"}
    );

}


function sortedCharacters(data) {

    const field = document.getElementById("sortField").value;
    const direction = sortAscending ? 1 : -1;

    return [...data].sort((a, b) => {

        let comparison = 0;

        if (field === "power") {
            comparison = gpToNumber(a.gp) - gpToNumber(b.gp);
        } else if (field === "name") {
            comparison = compareText(a.character_name, b.character_name);
        } else if (field === "class") {
            comparison = compareText(a.character_class, b.character_class);
        } else if (field === "server") {
            comparison = compareText(a.server, b.server);
        } else if (field === "price") {

            const priceA = priceToNumber(a.starting_price);
            const priceB = priceToNumber(b.starting_price);

            if (priceA === null && priceB === null) {
                comparison = 0;
            } else if (priceA === null) {
                return 1;
            } else if (priceB === null) {
                return -1;
            } else {
                comparison = priceA - priceB;
            }

        } else {
            comparison = Number(a.nft_id) - Number(b.nft_id);
        }

        return comparison * direction;

    });

}


function updateSortDirectionLabel() {

    const field = document.getElementById("sortField").value;
    const button = document.getElementById("sortDirection");
    const alphabetical = field === "name" || field === "class" || field === "server";

    button.textContent = alphabetical
        ? (sortAscending ? "A → Z" : "Z → A")
        : (sortAscending ? "Low → High" : "High → Low");

}


function applySort() {

    updateSortDirectionLabel();
    createTable(sortedCharacters(visibleCharacters));

}


function toggleSortDirection() {

    sortAscending = !sortAscending;
    applySort();

}


// ============================================================
// Create Table
// ============================================================

function createTable(data) {

    const results =
        document.getElementById("results");

    const resultCount =
        document.getElementById("resultCount");


    // --------------------------------------------------------
    // Empty
    // --------------------------------------------------------

    if (data.length === 0) {

        results.innerHTML = `
            <div class="empty">

                <div class="empty-title">
                    No characters found
                </div>

                Try another character name or server.

            </div>
        `;

        resultCount.innerHTML =
            `<span class="result-number">0</span> characters found`;

        return;
    }


    // --------------------------------------------------------
    // Count
    // --------------------------------------------------------

    resultCount.innerHTML =
        `<span class="result-number">
            ${data.length.toLocaleString()}
        </span>
        characters found`;


    // --------------------------------------------------------
    // Table
    // --------------------------------------------------------

    let html = `

        <table>

            <thead>

                <tr>

                    <th class="col-id">
                        NFT ID
                    </th>

                    <th class="col-name">
                        Character Name
                    </th>

                    <th class="col-class">
                        Class
                    </th>

                    <th class="col-server">
                        Server
                    </th>

                    <th class="col-gp">
                        Power
                    </th>

                    <th class="col-price">
                        Listed Price
                    </th>

                    <th class="col-link">
                        Link
                    </th>

                </tr>

            </thead>


            <tbody>

    `;


    // --------------------------------------------------------
    // Rows
    // --------------------------------------------------------

    for (const character of data) {

        const nftId =
            character.nft_id;


        const characterName =
            escapeHtml(
                character.character_name
            );


        const server =
            escapeHtml(
                character.server || "Unknown"
            );


        const characterClass =
            escapeHtml(
                character.character_class || "Unknown"
            );


        const gp =
            escapeHtml(
                character.gp || "-"
            );


        const hasPrice = Boolean(
            character.starting_price
        );


        const startingPrice =
            escapeHtml(
                character.starting_price || "Not listed"
            );


        const url =
            BASE_URL +
            encodeURIComponent(nftId);


        html += `

            <tr>

                <td class="id">
                    ${nftId}
                </td>


                <td class="character-name">
                    ${characterName}
                </td>


                <td>

                    <span class="class-badge">
                        ${characterClass}
                    </span>

                </td>


                <td>

                    <span class="server-badge">
                        ${server}
                    </span>

                </td>


                <td class="gp">
                    ${gp}
                </td>


                <td class="price ${hasPrice ? "" : "not-listed"}">
                    ${startingPrice}
                </td>


                <td>

                    <a
                        class="nft-link"
                        href="${url}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        View NFT
                        <span class="arrow">↗</span>
                    </a>

                </td>

            </tr>

        `;

    }


    html += `

            </tbody>

        </table>

    `;


    results.innerHTML = html;

}


// ============================================================
// Search
// ============================================================

function searchCharacters() {

    const query = document
        .getElementById("searchInput")
        .value
        .trim()
        .toLowerCase();


    if (!query) {
        showAll();
        return;
    }


    const matches = characters.filter(
        character =>

            character.character_name
                .toLowerCase()
                .includes(query)

            ||

            (character.server || "")
                .toLowerCase()
                .includes(query)

            ||

            (character.character_class || "")
                .toLowerCase()
                .includes(query)

    );


    visibleCharacters = matches;
    applySort();

}


// ============================================================
// Show All
// ============================================================

function showAll() {

    visibleCharacters = [...characters];
    applySort();

}


// ============================================================
// Clear
// ============================================================

function clearResults() {

    document
        .getElementById("searchInput")
        .value = "";


    document.getElementById("sortField").value = "power";
    sortAscending = false;
    showAll();

}


// ============================================================
// Live Search
// ============================================================

document
    .getElementById("searchInput")
    .addEventListener(
        "input",
        searchCharacters
    );


// Show every character immediately instead of starting with hidden rows.
showAll();


// ============================================================
// Enter
// ============================================================

document
    .getElementById("searchInput")
    .addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                searchCharacters();
            }

        }
    );


</script>

</body>

</html>
"""


    # ========================================================
    # Embed data
    # ========================================================

    html = html.replace(
        "__CHARACTER_DATA__",
        character_json,
    )


    html = html.replace(
        "__BASE_URL__",
        BASE_URL,
    )


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


    print(
        f"Generated: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
