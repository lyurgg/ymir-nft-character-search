// ============================================================
// Data
// ============================================================

const characters = __CHARACTER_DATA__;

const BASE_URL = "__BASE_URL__";
const scanReport = __SCAN_REPORT__;
const PAGE_SIZE = 100;
let currentPage = 0;
let favorites = new Set();
try { favorites = new Set(JSON.parse(localStorage.getItem('ymir-favorites') || '[]').map(Number)); } catch (_) {}
const byId = new Map(characters.map(character => [Number(character.nft_id), character]));
const walletIndex = buildWalletIndex(characters);

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

function observedDate(value) {
    if (!value) return "date unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "date unknown" : date.toLocaleString(undefined, {timeZone: "Asia/Manila"}) + " PHT";
}

function availability(value) {
    return value === true ? "Available" : value === false ? "Unavailable" : "Unknown";
}

function freshness(character, now = Date.now()) {
    const market = character.market || {};
    if (market.error || (character.last_scan && character.last_scan.status !== 'ok')) return 'failed';
    const checked = Date.parse(market.checked_at || '');
    if (!Number.isFinite(checked)) return 'unknown';
    return now - checked <= 24 * 60 * 60 * 1000 && checked <= now + 300000 ? 'fresh' : 'stale';
}

function freshnessLabel(character) {
    const value = freshness(character);
    const labels = {fresh: 'Checked within 24h', stale: 'Outdated snapshot', failed: 'Latest check failed', unknown: 'Never checked'};
    return `<span class="freshness ${value}">${labels[value]}</span>`;
}

function listingValue(character) {
    const price = priceToNumber(marketSnapshot(character).listed_price);
    const power = gpToNumber(character.gp);
    return price !== null && power > 0 ? price / power * 100000 : null;
}

function validWallet(value) {
    return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
}

function buildWalletIndex(data) {
    const index = new Map();
    for (const character of data) {
        const wallets = new Set((character.owner_history || []).map(item => item.wallet));
        for (const transfer of character.transfers || []) { wallets.add(transfer.from); wallets.add(transfer.to); }
        const current = (character.market || {}).owner;
        wallets.add(current);
        for (const wallet of wallets) {
            if (!validWallet(wallet)) continue;
            const normalized = wallet.toLowerCase();
            if (!index.has(normalized)) index.set(normalized, new Map());
            index.get(normalized).set(Number(character.nft_id), {character, current: normalized === String(current || '').toLowerCase()});
        }
    }
    return index;
}

function relatedCharacters(character, index = walletIndex) {
    const current = String((character.market || {}).owner || '').toLowerCase();
    const wallets = new Set((character.owner_history || []).map(item => item.wallet));
    for (const event of character.transfers || []) { wallets.add(event.from); wallets.add(event.to); }
    wallets.add(current);
    const groups = {current_current: [], current_former: [], former_current: [], former_former: []};
    for (const normalized of new Set([...wallets].filter(validWallet).map(wallet => wallet.toLowerCase()))) {
        for (const related of (index.get(normalized) || new Map()).values()) {
            if (Number(related.character.nft_id) === Number(character.nft_id)) continue;
            const key = (normalized === current ? 'current' : 'former') + '_' + (related.current ? 'current' : 'former');
            groups[key].push({...related, wallet: normalized});
        }
    }
    return groups;
}

function walletButton(wallet) {
    if (!validWallet(wallet)) return 'Mint / burn / unknown';
    return `<a class="wallet-link wallet" href="https://scan.wemix.com/address/${escapeHtml(wallet.toLowerCase())}" target="_blank" rel="noopener noreferrer">${escapeHtml(wallet.toLowerCase())}</a> <a href="wallet.html?wallet=${escapeHtml(wallet.toLowerCase())}">Activity</a> <button class="wallet-related" data-wallet="${escapeHtml(wallet.toLowerCase())}">Related</button>`;
}

function toggleFavorite(nftId) {
    favorites.has(nftId) ? favorites.delete(nftId) : favorites.add(nftId);
    try { localStorage.setItem('ymir-favorites', JSON.stringify([...favorites])); } catch (_) {}
    searchCharacters(false);
}

function showDetails(nftId) {
    const character = byId.get(Number(nftId));
    if (!character) return;
    const market = marketSnapshot(character);
    const check = character.transfer_check || {};
    const transfers = [...(character.transfers || [])].reverse();
    const prices = [...(character.price_history || [])].reverse();
    const historyWarning = check.error ? 'Latest history check failed; saved records are retained.' : check.checked_at ? `${check.total_count ?? '?'} records reported by WEMIX; ${check.all_returned ? 'all returned in the last response' : 'the response was partial'}. Earlier events may be unavailable.` : 'Ownership history has not been fetched yet.';
    const groupTitles = {
        current_current: 'Current wallet: other currently held characters',
        current_former: 'Current wallet: characters formerly held',
        former_current: 'Former wallets: characters currently held',
        former_former: 'Former wallets: characters formerly held',
    };
    const groups = relatedCharacters(character);
    const relatedHtml = Object.entries(groupTitles).map(([key, title]) => `<h4>${title}</h4>${groups[key].length ? `<ul class="related-list">${groups[key].map(item => `<li><button class="detail-trigger" data-nft-id="${item.character.nft_id}">#${item.character.nft_id} ${escapeHtml(item.character.character_name)}</button> ${freshnessLabel(item.character)}<br>Shared wallet: ${walletButton(item.wallet)}<br><span class="muted">${item.current ? 'Last observed owner' : 'Historical wallet association'} · ${escapeHtml(observedDate((item.character.market || {}).checked_at))}</span></li>`).join('')}</ul>` : '<p class="muted">No matching indexed characters recorded.</p>'}`).join('');
    document.getElementById('detailsContent').innerHTML = `
        <div class="detail-hero"><span class="surface-eyebrow">Character dossier · NFT #${character.nft_id}</span><h2 id="detailsTitle">${escapeHtml(character.character_name)}</h2>
        <div class="detail-stat-grid"><div><span>Class</span><strong>${escapeHtml(character.character_class || "Unknown")}</strong></div><div><span>Server</span><strong>${escapeHtml(character.server || "Unknown")}</strong></div><div><span>Growth power</span><strong>${escapeHtml(character.gp || "—")}</strong></div></div></div>
        <section class="detail-market">${marketDetails(character)}</section>
        <p class="detail-actions"><a href="__MARKET_URL__${character.nft_id}" target="_blank" rel="noopener noreferrer">Open WEMIX record</a> · <a href="graph.html?root=${character.nft_id}">Explore ownership graph</a> · <a href="graph.html?root=${character.nft_id}&amp;view=funding&amp;fundingDepth=3&amp;fundingDays=90&amp;buyerRoots=1">Discover shared funders</a></p>
        <section class="detail-owner"><h3>Current wallet</h3><p>${walletButton(market.owner)}</p>
        <p class="muted">Last observed: ${escapeHtml(observedDate(market.checked_at))}. A wallet association does not identify the player or prove that characters share a player.</p></section>
        <div class="detail-sections"><details class="detail-section" open><summary>Ownership and transfers <span>${transfers.length} records</span></summary><section>
        <p class="muted">${escapeHtml(historyWarning)} Checked: ${escapeHtml(observedDate(check.checked_at))}</p>
        ${transfers.length ? `<ol class="timeline">${transfers.map(event => `<li><strong>${escapeHtml(event.event)}</strong> · ${escapeHtml(observedDate(event.at * 1000))}<br>From ${walletButton(event.from)}<br>To ${walletButton(event.to)}${event.price ? `<br>Transaction price: ${escapeHtml(event.price)} <span class="muted">${escapeHtml(event.currency)}</span>` : ''}<details class="transaction-details"><summary>Transaction details</summary><span class="wallet">${escapeHtml(event.tx_hash)}</span><br><span class="muted">WEMIX history · ${escapeHtml(event.chain)}</span></details></li>`).join('')}</ol>` : '<p>No transfer records available. This does not mean there were no previous owners.</p>'}
        <h4>Owners observed by this archive</h4>
        ${(character.owner_history || []).length ? `<ol class="timeline">${[...character.owner_history].reverse().map(item => `<li>${walletButton(item.wallet)}<br>First seen ${escapeHtml(observedDate(item.first_seen))}<br>Last seen ${escapeHtml(observedDate(item.last_seen))}</li>`).join('')}</ol>` : '<p class="muted">No owner observations recorded.</p>'}
        </section></details><details class="detail-section"><summary>Price history <span>${prices.length} observations</span></summary><section>
        <p class="muted">Listing and previous-price observations use scan times. Transaction prices are shown with their transfer records.</p>
        ${prices.length ? `<ol class="timeline">${prices.map(item => `<li><strong>${escapeHtml(item.price || 'No active listing')}</strong> · ${escapeHtml(item.kind)}${item.status ? ' · ' + escapeHtml(item.status) : ''}<br>First seen ${escapeHtml(observedDate(item.first_seen))}<br>Last seen ${escapeHtml(observedDate(item.last_seen))}${item.currency ? `<br><span class="wallet muted">${escapeHtml(item.currency)}</span>` : ''}</li>`).join('')}</ol>` : '<p>No price changes recorded yet.</p>'}
        </section></details><details class="detail-section"><summary>Name history <span>${(character.name_history || []).length} observations</span></summary><section><ol class="timeline">${(character.name_history || []).map(item => `<li><strong>${escapeHtml(item.name)}</strong><br><span class="muted">First seen ${escapeHtml(observedDate(item.first_seen))} · Last seen ${escapeHtml(observedDate(item.last_seen))}</span></li>`).join("")}</ol></section></details></div>
        <details class="detail-section"><summary>Related characters through wallets</summary><section>
        <p class="muted">Only indexed YMIR characters with recorded wallets are included. Holdings can be outdated. Click a wallet to search all its recorded associations.</p>
        ${relatedHtml}</section></details>`;
    const dialog = document.getElementById('characterDetails');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
}

function marketSnapshot(character) {
    const market = {...(character.market || {})};
    if (market.status === "Auction" && market.auction_countdown_active === true && market.auction_end && market.auction_end * 1000 <= Date.now()) {
        market.status = "Auction ended";
        market.can_bid = false;
        market.can_offer = false;
        market.listed_price = "";
        market.auction_phase = "ended";
    }
    return market;
}

function marketDetails(character) {
    const market = marketSnapshot(character);
    const listed = market.listed_price;
    return `<div class="market-details">
        ${freshnessLabel(character)}<br>
        <strong>${escapeHtml(market.status || "Unknown")}</strong>
        <div title="${escapeHtml(market.listed_currency || '')}">Listed: ${escapeHtml(listed || "—")}</div>
        <div title="${escapeHtml(character.last_known_currency || '')}">Last known: ${escapeHtml(character.last_known_price || "—")}</div>
        <small>${escapeHtml(character.last_known_price_source || "No price recorded")}${character.last_known_price ? " · " + escapeHtml(observedDate(character.last_known_price_at)) : ""}</small>
        <div>Bid: ${availability(market.can_bid)} · Offer: ${availability(market.can_offer)}</div>
        ${market.auction_phase === 'awaiting_bid' ? '<small>Awaiting first bid · no active countdown</small>' : ''}
        ${market.auction_start ? `<small>Bidding starts: ${escapeHtml(observedDate(market.auction_start * 1000))}</small>` : ''}
        ${listingValue(character) !== null ? `<small>Per 100k power: ${listingValue(character).toLocaleString(undefined, {maximumFractionDigits: 2})}</small>` : ''}
        ${market.auction_end ? `<small>Auction ends: ${escapeHtml(observedDate(market.auction_end * 1000))}</small>` : ""}
        <small>${market.checked_at ? "Checked: " + escapeHtml(observedDate(market.checked_at)) : "Marketplace check unavailable"}</small>
    </div>`;
}

function nameHistory(character) {
    const names = character.name_history || [];
    if (names.length < 2) return `<small class="name-history">No name changes recorded</small>`;
    return `<details class="name-history"><summary>Name history (${names.length} observations)</summary><ol>${names.map(item => `<li>${escapeHtml(item.name)}<br>First seen: ${escapeHtml(observedDate(item.first_seen))}<br>Last seen: ${escapeHtml(observedDate(item.last_seen))}</li>`).join("")}</ol></details>`;
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
        } else if (field === 'value') {
            const left = listingValue(a), right = listingValue(b);
            if (left === null) return right === null ? 0 : 1;
            if (right === null) return -1;
            comparison = left - right;
        } else if (field === "price" || field === "last_price") {

            const priceA = priceToNumber(field === "price" ? marketSnapshot(a).listed_price : a.last_known_price);
            const priceB = priceToNumber(field === "price" ? marketSnapshot(b).listed_price : b.last_known_price);

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

    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));
    document.getElementById('pagination').innerHTML = `<button class="secondary-button" onclick="changePage(-1)" ${currentPage === 0 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage + 1} of ${totalPages} · Up to ${PAGE_SIZE} per page</span><button class="secondary-button" onclick="changePage(1)" ${currentPage + 1 >= totalPages ? 'disabled' : ''}>Next</button>`;

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
                        Price &amp; Availability
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

    for (const character of data.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)) {

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
                    <button class="favorite-button" data-favorite-id="${nftId}" aria-label="${favorites.has(nftId) ? 'Remove favorite' : 'Save favorite'}" aria-pressed="${favorites.has(nftId)}">${favorites.has(nftId) ? '★' : '☆'}</button>
                    <button class="detail-trigger" data-nft-id="${nftId}">${characterName}</button>
                    ${nameHistory(character)}
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
                    ${marketDetails(character)}
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
                    <br><a class="nft-link" href="__MARKET_URL__${encodeURIComponent(nftId)}" target="_blank" rel="noopener noreferrer">Marketplace</a>

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

function searchCharacters(resetPage = true) {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const filter = document.getElementById('marketFilter').value;
    const classFilter = document.getElementById('classFilter').value;
    const serverFilter = document.getElementById('serverFilter').value;
    const currency = document.getElementById('currencyFilter').value;
    const priceType = document.getElementById('priceType').value;
    const minimum = document.getElementById('minPrice').value;
    const maximum = document.getElementById('maxPrice').value;
    const age = document.getElementById('freshnessFilter').value;
    const favoriteOnly = document.getElementById('favoritesOnly').checked;
    const walletMatches = walletIndex.get(query);
    visibleCharacters = characters.filter(character => {
        const market = marketSnapshot(character);
        if (!(filter === 'all' || (filter === 'listed' && market.status === 'Listed')
            || (filter === 'bid' && market.can_bid === true)
            || (filter === 'offer' && market.can_offer === true)
            || (filter === 'unknown' && (!market.status || market.status === 'Unknown')))) return false;
        if (classFilter && character.character_class !== classFilter) return false;
        if (serverFilter && character.server !== serverFilter) return false;
        if (age && freshness(character) !== age) return false;
        if (favoriteOnly && !favorites.has(Number(character.nft_id))) return false;
        const price = priceToNumber(priceType === 'last' ? character.last_known_price : market.listed_price);
        const denomination = priceType === 'last' ? character.last_known_currency : market.listed_currency;
        if (currency && denomination !== currency) return false;
        if (minimum !== '' && (price === null || price < Number(minimum))) return false;
        if (maximum !== '' && (price === null || price > Number(maximum))) return false;
        return !query || String(character.character_name || '').toLowerCase().includes(query)
            || String(character.server || '').toLowerCase().includes(query)
            || String(character.character_class || '').toLowerCase().includes(query)
            || String(character.nft_id).includes(query)
            || (character.name_history || []).some(item => item.name.toLowerCase().includes(query))
            || (walletMatches && walletMatches.has(Number(character.nft_id)));
    });
    if (resetPage) currentPage = 0;
    applySort();
}

function changePage(delta) {
    currentPage += delta;
    applySort();
}

function resetFilters() {
    for (const id of ['classFilter', 'serverFilter', 'currencyFilter', 'minPrice', 'maxPrice', 'freshnessFilter']) {
        document.getElementById(id).value = '';
    }
    document.getElementById('marketFilter').value = 'all';
    document.getElementById('priceType').value = 'listed';
    document.getElementById('favoritesOnly').checked = false;
}

function showAll() {
    resetFilters();
    document.getElementById('searchInput').value = '';
    searchCharacters();
}

function clearResults() {
    document.getElementById('sortField').value = 'power';
    sortAscending = false;
    showAll();
}

function initializeDashboard() {
    const fill = (id, values) => {
        document.getElementById(id).innerHTML += [...new Set(values.filter(Boolean))].sort(compareText)
            .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    };
    fill('classFilter', characters.map(c => c.character_class));
    fill('serverFilter', characters.map(c => c.server));
    fill('currencyFilter', characters.flatMap(c => [(c.market || {}).listed_currency, c.last_known_currency]));
    const fresh = characters.filter(c => freshness(c) === 'fresh').length;
    const failed = characters.filter(c => freshness(c) === 'failed').length;
    const owned = characters.filter(c => validWallet((c.market || {}).owner)).length;
    const histories = characters.filter(c => (c.transfer_check || {}).checked_at).length;
    const report = scanReport.checked_at ? `Last scan: ${escapeHtml(observedDate(scanReport.checked_at))} · ${scanReport.successful} fetched / ${scanReport.attempted} attempted · ${scanReport.new_characters} new. ${(scanReport.failed_ids || []).length} source failures, ${(scanReport.market_failed_ids || []).length} market failures, ${(scanReport.history_failed_ids || []).length} history failures. ${(scanReport.missing_archived_ids || []).length} archived pages missing. ${(scanReport.discovery || {}).mode === 'selected IDs' ? 'Selected-ID validation only.' : escapeHtml((scanReport.discovery || {}).stop_reason || '')}` : 'No full scan report is available yet.';
    document.getElementById('scanSummary').innerHTML = `<strong>${fresh.toLocaleString()} / ${characters.length.toLocaleString()} checked within 24h</strong> · ${failed} latest checks failed.<br>Wallet coverage: ${owned} characters with last observed owners; ${histories} with fetched transfer history.<br>${report}<br>Price filters and price per power use token amounts. Select a currency before comparing different denominations.`;
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


document.addEventListener('click', event => {
    const details = event.target.closest('[data-nft-id]');
    const favorite = event.target.closest('[data-favorite-id]');
    const wallet = event.target.closest('[data-wallet]');
    if (details) showDetails(Number(details.dataset.nftId));
    else if (favorite) toggleFavorite(Number(favorite.dataset.favoriteId));
    else if (wallet) {
        document.getElementById('characterDetails').close();
        resetFilters();
        document.getElementById('searchInput').value = wallet.dataset.wallet;
        searchCharacters();
    }
});
initializeDashboard();
showAll();
if (typeof location !== 'undefined') {
    const initialId = new URLSearchParams(location.search).get('nft');
    if (initialId && /^\d+$/.test(initialId)) {
        document.getElementById('searchInput').value = initialId;
        searchCharacters();
        showDetails(Number(initialId));
    }
}


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
