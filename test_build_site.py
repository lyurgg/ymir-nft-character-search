import tempfile
import unittest
from pathlib import Path
from build_site import prepare_site
import json


def wallet_assets(root):
    (root / "wallet.html").write_text('<a href="index.html">Characters</a>')
    (root / "reports.html").write_text('<a href="reports-evidence.json">Evidence</a>')
    (root / "reports-evidence.json").write_text('{}')
    (root / "items.html").write_text('<a href="items.csv">CSV</a><a href="items.json">JSON</a>')
    (root / "item-sales.html").write_text('<a href="items.html">Item codes</a>')
    (root / "items.csv").write_text('item_code,english_name\n')
    (root / "items.json").write_text('{}')
    assets = root / "wallet-data"
    assets.mkdir()
    (assets / "index.json").write_text(json.dumps(dict(schema_version=1, snapshots={})))
    for i in range(256):
        (assets / f"funding-{i:02x}.json").write_text("{}")


class SiteArtifactTests(unittest.TestCase):
    def test_missing_graph_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="graph.html">Graph</a>')
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            self.assertFalse((root / "output").exists())

    def test_all_pages_and_query_links_are_staged(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="graph.html?root=4200">Graph</a>')
            (root / "graph.html").write_text('<a href="index.html?nft=4200">Character</a>')
            wallet_assets(root)
            prepare_site(root, root / "output")
            self.assertEqual({path.name for path in (root / "output").iterdir()},
                             {"index.html", "graph.html", "wallet.html", "reports.html", "reports-evidence.json", "items.html", "items.csv", "item-sales.html", "items.json", "wallet-data", ".nojekyll"})

    def test_missing_item_download_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('Characters')
            (root / "graph.html").write_text('Graph')
            wallet_assets(root)
            (root / "items.csv").unlink()
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            self.assertFalse((root / "output").exists())

    def test_item_dictionary_and_csv_cover_every_verified_mapping(self):
        import csv
        import io
        from html.parser import HTMLParser
        from generate_items import generate_items, items_csv, load_items
        class Items(HTMLParser):
            def __init__(self):
                super().__init__()
                self.items = {}
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'tr' and 'data-code' in attrs:
                    self.items[attrs['data-code']] = attrs['data-name']
        data, expected = load_items()
        page = generate_items()
        parser = Items()
        parser.feed(page)
        self.assertGreaterEqual(len(expected), 7889)
        self.assertEqual(parser.items, dict(expected[:50]))
        self.assertEqual(dict(expected)['30424029'], 'Sindri Shoes')
        self.assertEqual(dict(expected)['30414029'], 'Sindri Shoes')
        import re
        embedded = json.loads(re.search(r'<script type="application/json" id="itemData">(.*?)</script>', page, re.S).group(1))
        self.assertEqual(dict(embedded), dict(expected))
        exported = list(csv.DictReader(io.StringIO(items_csv())))
        safe_expected = {code: "'"+name if name.startswith(('=', '+', '-', '@', '\t', '\r')) else name for code, name in expected}
        self.assertEqual({row['item_code']: row['english_name'] for row in exported}, safe_expected)
        self.assertNotIn('__ITEM_', page)
        self.assertNotIn('__THEME_CSS__', page)
        self.assertIn(data['client_content_build'], page)

    def test_missing_report_cannot_publish_incomplete_section(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="reports.html">Report</a>')
            (root / "graph.html").write_text("Graph")
            wallet_assets(root)
            (root / "reports-evidence.json").unlink()
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            self.assertFalse((root / "output").exists())

    def test_captured_report_has_linked_directed_paths_and_exact_totals(self):
        from generate_reports import generate_reports
        from html.parser import HTMLParser
        class Purchases(HTMLParser):
            def __init__(self):
                super().__init__()
                self.amounts = []
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'tr' and 'data-amount' in attrs:
                    self.amounts.append(int(attrs['data-amount']))
        html = generate_reports()
        rows = Purchases()
        rows.feed(html)
        self.assertEqual(len(rows.amounts), 20)
        self.assertEqual(sum(rows.amounts), 344500)
        for text in ('Formerly kufuking (3433)', 'kufuking2 (1154)', 'kufuking3 (3871)', 'Bunn1eSSS (1358)', 'marker id="reportArrow"', 'reports-evidence.json'):
            self.assertIn(text, html)
        self.assertNotIn('__CONNECTION_GRAPH__', html)
        self.assertIn('Agelmund Recurve Bow', html)
        self.assertIn('Valtram Shoes', html)
        self.assertIn('Megingjord', html)
        self.assertIn('Reported +15 · level unverified', html)
        self.assertNotIn('Item name not mapped', html)
        from generate_reports import captured_report_evidence
        evidence = captured_report_evidence()
        required = {p['events'][0]['code'] for p in evidence['purchases']}
        self.assertEqual(required, set(evidence['item_name_mappings']['items']))
        self.assertTrue(all(m['enhancement'] is None for m in evidence['item_name_mappings']['items'].values()))

    def test_missing_wallet_page_or_data_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text("Characters")
            (root / "graph.html").write_text("Graph")
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            wallet_assets(root)
            (root / "wallet-data" / "funding-00.json").unlink()
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            self.assertFalse((root / "output").exists())

    def test_root_links_are_rejected_for_project_sites(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="/graph.html">Graph</a>')
            (root / "graph.html").write_text('Graph')
            with self.assertRaises(ValueError):
                prepare_site(root, root / "output")


if __name__ == "__main__":
    unittest.main()
