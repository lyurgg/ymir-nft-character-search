"""Load the captured English catalog, including its checksummed upload parts."""
import re
from pathlib import Path
from json_store import load_json

ROOT = Path(__file__).parent


def load_item_mappings(path=None):
    data = load_json(Path(path) if path is not None else ROOT / 'item-code-mappings.json')
    if data.get('schema_version') == 2:
        if data.get('verification') != 'verified_base_item_name' or not isinstance(data.get('items'), list):
            raise ValueError('Invalid verified item catalog')
        items = {}
        for row in data['items']:
            code = row['code']
            if not isinstance(code, str) or not re.fullmatch(r'[0-9]{1,20}', code) or code in items:
                raise ValueError('Invalid or duplicate item code')
            if not isinstance(row.get('name'), str) or not row['name'].strip() or not isinstance(row.get('name_key'), str):
                raise ValueError('Item catalog is missing a name or record key')
            items[code] = dict(name=row['name'], name_key=row['name_key'], verification=data['verification'], enhancement=None)
            if code in data.get('reported_enhancements', {}):
                items[code]['reported_enhancement'] = data['reported_enhancements'][code]
        return {**data, 'schema_version': 1, 'items': items}
    if data.get('schema_version') != 1 or not isinstance(data.get('items'), dict):
        raise ValueError('Unsupported item-code lookup schema')
    return data
