"""Build a standalone item-code dictionary from the captured verified mappings."""
import csv
import io
import json
import re
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from item_mappings import load_item_mappings

ROOT = Path(__file__).parent


def load_items():
    data = load_item_mappings()
    if data.get('schema_version') != 1 or not isinstance(data.get('items'), dict):
        raise ValueError('Unsupported item-code lookup schema')
    rows = []
    for code, item in data['items'].items():
        if not re.fullmatch(r'[0-9]{1,20}', code):
            raise ValueError('Invalid item code in lookup')
        if item.get('verification') != 'verified_base_item_name':
            continue
        name = item.get('name')
        if not isinstance(name, str) or not name.strip():
            raise ValueError('Verified item is missing its English name')
        rows.append((code, name))
    return data, sorted(rows, key=lambda row: (row[1].casefold(), int(row[0])))


def items_csv():
    _, rows = load_items()
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(('item_code', 'english_name'))
    for code, name in rows:
        # Preserve literal names when this file is opened in a spreadsheet.
        safe_name = "'"+name if name.startswith(('=', '+', '-', '@', '\t', '\r')) else name
        writer.writerow((code, safe_name))
    return stream.getvalue()


def generate_items():
    data, rows = load_items()
    checked = datetime.fromisoformat(data['checked_at'].replace('Z', '+00:00'))
    checked = checked.astimezone(timezone(timedelta(hours=8))).strftime('%b %d, %Y · %H:%M PHT')
    html_rows = ''.join(
        f'<tr data-code="{code}" data-name="{escape(name, quote=True)}">'
        f'<td><a class="item-code" href="items.html?q={code}" aria-label="Link to item {code}">{code}</a></td>'
        f'<td><strong>{escape(name)}</strong></td><td><a href="item-sales.html?code={code}">Find purchases →</a></td></tr>'
        for code, name in rows[:50])
    replacements = {
        '__THEME_CSS__': (ROOT / 'theme.css').read_text(encoding='utf-8'),
        '__ITEMS_CSS__': (ROOT / 'items.css').read_text(encoding='utf-8'),
        '__ITEMS_SCRIPT__': (ROOT / 'items.js').read_text(encoding='utf-8'),
        '__ITEM_ROWS__': html_rows,
        '__ITEM_COUNT__': str(len(rows)),
        '__ITEM_CHECKED__': escape(checked),
        '__ITEM_BUILD__': escape(data['client_content_build']),
        '__ITEM_DATA__': json.dumps(rows, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'),
    }
    html = (ROOT / 'items-template.html').read_text(encoding='utf-8')
    for token, value in replacements.items():
        html = html.replace(token, value)
    return html


def generate_item_sales():
    _, rows = load_items()
    html = (ROOT / 'item-sales-template.html').read_text(encoding='utf-8')
    replacements = {
        '__THEME_CSS__': (ROOT / 'theme.css').read_text(encoding='utf-8'),
        '__SALES_CSS__': (ROOT / 'item-sales.css').read_text(encoding='utf-8'),
        '__SALES_CORE__': (ROOT / 'item-sales-core.js').read_text(encoding='utf-8'),
        '__SALES_SCRIPT__': (ROOT / 'item-sales.js').read_text(encoding='utf-8'),
        '__SALE_NAMES__': json.dumps(dict(rows), ensure_ascii=False).replace('<', '\\u003c'),
    }
    for token, value in replacements.items():
        html = html.replace(token, value)
    return html
