"""Render the wallet's recent named item trades as a standalone Pages view."""
import json
from pathlib import Path
from generate_items import load_items

ROOT = Path(__file__).parent


def generate_wallet_items():
    _, rows = load_items()
    html = (ROOT / 'wallet-items-template.html').read_text(encoding='utf-8')
    replacements = {
        '__THEME_CSS__': (ROOT / 'theme.css').read_text(encoding='utf-8'),
        '__SALES_CSS__': (ROOT / 'item-sales.css').read_text(encoding='utf-8'),
        '__WALLET_ITEMS_CSS__': (ROOT / 'wallet-items.css').read_text(encoding='utf-8'),
        '__SALES_CORE__': (ROOT / 'item-sales-core.js').read_text(encoding='utf-8'),
        '__WALLET_ITEMS_CORE__': (ROOT / 'wallet-items-core.js').read_text(encoding='utf-8'),
        '__WALLET_ITEMS_SCRIPT__': (ROOT / 'wallet-items.js').read_text(encoding='utf-8'),
        '__SALE_NAMES__': json.dumps(dict(rows), ensure_ascii=False).replace('<', '\\u003c'),
        '__ITEM_COUNT__': f'{len(rows):,}',
    }
    for token, value in replacements.items():
        html = html.replace(token, value)
    return html
