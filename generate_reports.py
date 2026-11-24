"""Render the dated, captured wallet investigation without changing its evidence."""
import json
import re
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from html import escape
from pathlib import Path
from item_mappings import load_item_mappings

ROOT = Path(__file__).parent
COLLECTION = '0x58f803dcd53edd804cece0d59166785fdd4735f9'


def amount(value):
    return format(Decimal(value) / 10**18, ',f')


def stamp(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value).timestamp()
    return datetime.fromtimestamp(value, timezone(timedelta(hours=8))).strftime('%b %d, %Y · %H:%M:%S')


def address_link(value, label=None):
    if not re.fullmatch(r'0x[0-9a-f]{40}', value):
        raise ValueError('Invalid address in captured report')
    return f'<a href="https://scan.wemix.com/address/{value}" title="{value}" target="_blank" rel="noopener noreferrer">{escape(label or value[:10]+"…"+value[-6:])}</a>'


def tx_link(value, label='View receipt'):
    if not re.fullmatch(r'0x[0-9a-f]{64}', value):
        raise ValueError('Invalid transaction hash in captured report')
    return f'<a href="https://scan.wemix.com/tx/{value}" target="_blank" rel="noopener noreferrer">{escape(label)}</a>'


def character_link(nft, name):
    return f'<a href="https://wemixplay.com/nft/marketplace/detail/{COLLECTION}/{int(nft)}" target="_blank" rel="noopener noreferrer">{escape(name)} ({int(nft)})</a>'


def connection_graph(data):
    owners = {nft: '0x'+value[-40:] for nft, value in data['owners'].items()}
    nodes = [
        (20, 180, 'Shared source', '0x50870ef0bfa668afe4a2a2ffd24e39eeeac9180c', 'source', ''),
        (340, 20, 'Investigated wallet', data['wallet'], 'focus', ''),
        (340, 145, 'kufuking2 (1154)', owners['1154'], '', 'Formerly kufuking (3433)'),
        (340, 285, 'NARIOzzy (4046)', owners['4046'], '', ''),
        (650, 285, 'kufuking3 (3871)', owners['3871'], '', 'Previously GèenWoo'),
        (960, 165, 'Bunn1eSSS (1358)', owners['1358'], '', ''),
        (960, 400, '史帝芬葛格 (850)', owners['850'], '', ''),
    ]
    svg = ['<svg class="report-graph" viewBox="0 0 1200 510" role="group" aria-label="Directed WEMIX transfer paths connecting the investigated wallet, kufuking wallets, NARIOzzy, Bunn1eSSS and NFT 850"><title>Captured wallet connections</title><desc>Arrows represent selected native WEMIX transfers, not an assertion of common identity. The wallet currently holding kufuking2 previously held kufuking. Detailed dates and receipts follow below.</desc><defs><marker id="reportArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#66796c"/></marker></defs>']
    edges = [
        ('M250 220 C280 70 290 65 340 65', 180, 115, '53,314.1375 WEMIX'),
        ('M250 220 L340 195', 175, 160, '2,227.0613 total'),
        ('M250 220 C280 325 300 330 340 330', 165, 365, '15.7944 WEMIX'),
        ('M570 330 L650 330', 585, 310, '300'),
        ('M880 330 C925 330 915 210 960 210', 900, 265, '60,025'),
        ('M880 330 C925 330 915 445 960 445', 895, 405, '60,100'),
    ]
    for path, x, y, label in edges:
        svg.append(f'<path class="report-edge" d="{path}"/><text class="report-edge-label" x="{x}" y="{y}">{label}</text>')
    for x, y, label, wallet, style, note in nodes:
        short = wallet[:10]+'…'+wallet[-6:]
        note_text = f'<text class="report-node-address" x="{x+14}" y="{y+76}">{escape(note)}</text>' if note else ''
        svg.append(f'<g class="report-node {style}"><a href="https://scan.wemix.com/address/{wallet}" target="_blank" rel="noopener noreferrer" aria-label="Open {escape(label)} wallet {wallet} on WEMIX Scan"><title>{escape(label)} · {wallet}</title><rect x="{x}" y="{y}" width="230" height="95" rx="9"/><text x="{x+14}" y="{y+28}">{escape(label)}</text><text class="report-node-address" x="{x+14}" y="{y+52}">{escape(short)}</text>{note_text}</a></g>')
    svg.append('</svg>')
    return ''.join(svg)


def hop_list(path):
    return '<ol>'+''.join(f'<li>{address_link(r["from"])} → {address_link(r["to"])}<br><strong>{amount(r["amount_wei"])} WEMIX</strong><small>{stamp(r["at"])} PHT · {tx_link(r["tx_hash"], "Transaction")}</small></li>' for r in path)+'</ol>'


def generate_reports():
    data = json.loads((ROOT / 'wallet-investigation.json').read_text(encoding='utf-8'))
    item_names = load_item_mappings()
    if data.get('schema_version') != 1:
        raise ValueError('Unsupported captured report schema')
    if item_names.get('schema_version') != 1:
        raise ValueError('Unsupported item-name mapping schema')
    purchases = sorted(data['purchases'], key=lambda p:int(p['record']['amount_wei']), reverse=True)
    rows, recipients = [], set()
    for item in purchases:
        row, event = item['record'], item['events'][0]
        if event['payer'] != data['wallet'] or event['gross_wei'] != row['amount_wei']:
            raise ValueError('Purchase event does not match its payer and gross payment')
        recipient = event['seller']
        recipients.add(recipient)
        item = item_names['items'].get(event['code'], {})
        name = item.get('name', 'Item name not mapped') if item.get('verification') == 'verified_base_item_name' else 'Item name not mapped'
        level = item.get('reported_enhancement')
        if level is not None and (type(level) is not int or not 0 <= level <= 100):
            raise ValueError('Invalid reported enhancement')
        level_note = f'<small>Reported +{level} · level unverified</small>' if level is not None else ''
        rows.append(f'<tr data-amount="{Decimal(row["amount_wei"])/10**18}" data-at="{row["at"]}" data-recipient="{recipient}"><td>{stamp(row["at"])}</td><td><strong>{amount(row["amount_wei"])}</strong></td><td><strong>{escape(name)}</strong><small>Code <code>{escape(event["code"])}</code></small>{level_note}</td><td>{address_link(recipient)}</td><td>{tx_link(row["tx_hash"])}</td></tr>')
    cards = []
    for nft, label in [('1154', 'kufuking2'), ('4046', 'NARIOzzy')]:
        wallet = '0x'+data['owners'][nft][-40:]
        transfers = [r for r in data['direct_shared_source_transfers'] if r['to'] == wallet]
        note = 'The source transfers followed this wallet’s September 21 NFT purchase. This wallet formerly held kufuking (3433).' if nft == '1154' else 'A shared-source link to the wallet holding this character; not proof the source financed its acquisition.'
        cards.append(f'<article class="report-path"><h3>{character_link(nft,label)}</h3><p>Direct shared source · {address_link(wallet)}</p><p>{note}</p><details><summary>Review {len(transfers)} source transfers</summary>{hop_list(transfers)}</details></article>')
    for nft in (1358, 850):
        matches = [m for m in data['matches'] if m['other']['purchase']['nft_id'] == nft]
        sections = []
        for match in matches:
            purchase = match['other']['purchase']
            sections.append(f'<details><summary>Source {escape(match["source"][:10])}… · three hops to buyer</summary><h4>To the 0x99e445… wallet</h4>{hop_list(match["focus"]["path"])}<h4>To the character’s buyer</h4>{hop_list(match["other"]["path"])}<p>Recorded NFT purchase: {stamp(purchase["at"])} PHT · {tx_link(purchase["tx_hash"])} · {escape(purchase["price"])} WWEMIX.</p></details>')
        cards.append(f'<article class="report-path"><h3>{character_link(nft,data["character_labels"][str(nft)])}</h3><p>Three-hop paths from two shared sources. Transfers precede their respective purchases; amounts are not conserved between hops.</p>{"".join(sections)}</article>')
    totals = [(str(len(purchases)), 'purchases of 5,000 WEMIX or more'), (amount(str(sum(int(p['record']['amount_wei']) for p in purchases))), 'WEMIX across these purchases'), ('145,000', 'WEMIX · nine purchases from 0xbeaabc…'), ('5', 'connected NFT-owning wallets')]
    replacements = {
        '__THEME_CSS__': (ROOT/'theme.css').read_text(encoding='utf-8'),
        '__REPORTS_CSS__': (ROOT/'reports.css').read_text(encoding='utf-8'),
        '__REPORTS_SCRIPT__': (ROOT/'reports.js').read_text(encoding='utf-8'),
        '__FOCUS_WALLET__': address_link(data['wallet'],data['wallet']),
        '__CHECKED_AT__': stamp(data['checked_at']),
        '__ITEM_NAMES_CHECKED_AT__': stamp(item_names['checked_at']),
        '__ITEM_CLIENT_BUILD__': escape(item_names['client_content_build']),
        '__REPORT_STATS__': ''.join(f'<article class="report-card"><strong>{escape(n)}</strong><span>{escape(label)}</span></article>' for n,label in totals),
        '__RECIPIENT_OPTIONS__': ''.join(f'<option value="{r}">{r[:10]}…{r[-6:]}</option>' for r in sorted(recipients)),
        '__PURCHASE_ROWS__': ''.join(rows),
        '__CONNECTION_GRAPH__': connection_graph(data),
        '__CHARACTER_LINKS__': ''.join(character_link(nft,label) for nft,label in [('3433','kufuking · former wallet link'),*data['character_labels'].items()]),
        '__PATH_CARDS__': ''.join(cards),
    }
    html = (ROOT/'reports-template.html').read_text(encoding='utf-8')
    for token, value in replacements.items():
        html = html.replace(token,value)
    return html


def captured_report_evidence():
    data = json.loads((ROOT / 'wallet-investigation.json').read_text(encoding='utf-8'))
    names = load_item_mappings()
    required = {p['events'][0]['code'] for p in data['purchases']}
    data['item_name_mappings'] = {**names, 'items': {code: names['items'][code] for code in sorted(required)}}
    return data
