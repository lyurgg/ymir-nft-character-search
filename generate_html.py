import csv
import json
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
            })

    return characters


# ============================================================
# Generate HTML
# ============================================================

def generate_html(characters):

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

        .col-server {
            width: 220px;
        }

        .col-gp {
            width: 150px;

            /*
             * IMPORTANT:
             * Header and body are both right aligned.
             */
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

            .col-server {
                width: 150px;
            }

            .col-gp {
                width: 125px;
            }

            .col-link {
                width: 110px;
            }


            th,
            td {
                padding: 13px 12px;
            }

        }

    </style>

</head>


<body>

<div class="container">


    <!-- ====================================================
         Header
    ===================================================== -->

    <div class="header">

        <h1>
            Legend of <span class="accent">YMIR</span>
        </h1>

        <div class="subtitle">
            NFT Character Search
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
                placeholder="Search character name or server..."
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
                Clear
            </button>

        </div>

        <div id="resultCount"></div>

    </div>


    <!-- ====================================================
         Results
    ===================================================== -->

    <div class="table-card">

        <div
            id="results"
            class="table-container"
        >

            <div class="empty">

                <div class="empty-title">
                    Search for a character
                </div>

                Enter a character name or server above.

            </div>

        </div>

    </div>


    <div class="footer">
        Legend of YMIR NFT Character Index
    </div>


</div>


<script>


// ============================================================
// Data
// ============================================================

const characters = __CHARACTER_DATA__;

const BASE_URL = "__BASE_URL__";


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

                    <th class="col-server">
                        Server
                    </th>

                    <th class="col-gp">
                        GP
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


        const gp =
            escapeHtml(
                character.gp || "-"
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

                    <span class="server-badge">
                        ${server}
                    </span>

                </td>


                <td class="gp">
                    ${gp}
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

        clearResults();

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

    );


    // --------------------------------------------------------
    // Exact character-name match first.
    //
    // Everything else sorted by GP descending.
    // --------------------------------------------------------

    matches.sort((a, b) => {

        const nameA =
            a.character_name.toLowerCase();

        const nameB =
            b.character_name.toLowerCase();


        const exactA =
            nameA === query;

        const exactB =
            nameB === query;


        if (exactA && !exactB) {
            return -1;
        }


        if (!exactA && exactB) {
            return 1;
        }


        return (
            gpToNumber(b.gp) -
            gpToNumber(a.gp)
        );

    });


    createTable(matches);

}


// ============================================================
// Show All
// ============================================================

function showAll() {

    const sorted =
        [...characters].sort(

            (a, b) =>
                gpToNumber(b.gp) -
                gpToNumber(a.gp)

        );


    createTable(sorted);

}


// ============================================================
// Clear
// ============================================================

function clearResults() {

    document
        .getElementById("searchInput")
        .value = "";


    document
        .getElementById("resultCount")
        .innerHTML = "";


    document
        .getElementById("results")
        .innerHTML = `

            <div class="empty">

                <div class="empty-title">
                    Search for a character
                </div>

                Enter a character name or server above.

            </div>

        `;

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