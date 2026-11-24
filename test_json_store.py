import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from json_store import load_json, save_json, FORMAT


class SplitJsonTests(unittest.TestCase):
    def test_unicode_history_roundtrip_size_and_legacy_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "character_history.json"
            data = {str(i): {"name": "GèenWoo · 한글", "history": "x" * 2200} for i in range(5)}
            path.write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(load_json(path), data)
            manifest = save_json(path, data, max_bytes=4096)
            self.assertEqual(manifest["_format"], FORMAT)
            self.assertGreater(len(manifest["parts"]), 1)
            self.assertEqual(load_json(path), data)
            self.assertTrue(all(p.stat().st_size <= 4096 for p in Path(directory).iterdir()))

    def test_transfers_keep_metadata_order_and_exact_decimal_strings(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "funding_history.json"
            data = dict(asset="WEMIX", chain_id=1111, coverage=[dict(wallet="a", complete=False)],
                        transfers=[dict(tx_hash=str(i), amount_wei="60025000000000000000001", memo="한" * 700) for i in range(4)])
            save_json(path, data, list_field="transfers", max_bytes=4096)
            self.assertEqual(load_json(path), data)

    def test_missing_or_changed_part_cannot_silently_drop_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "character_history.json"
            manifest = save_json(path, {"3871": {"names": ["Geenwoo"]}})
            part = path.parent / manifest["parts"][0]["file"]
            original = part.read_bytes()
            part.write_bytes(original.replace(b"Geenwoo", b"Changed"))
            with self.assertRaisesRegex(ValueError, "Damaged or mixed"):
                load_json(path)
            part.unlink()
            with self.assertRaisesRegex(FileNotFoundError, "upload every part"):
                load_json(path)

    def test_manifest_switch_preserves_previous_history_on_write_failure(self):
        import json_store
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "character_history.json"
            old = {"1": {"name": "Original"}}
            save_json(path, old)
            original_write = json_store._atomic_write
            def fail_manifest(target, raw):
                if target == path:
                    raise OSError("interrupted manifest write")
                original_write(target, raw)
            with patch.object(json_store, "_atomic_write", side_effect=fail_manifest), self.assertRaises(OSError):
                save_json(path, {"1": {"name": "Updated"}})
            self.assertEqual(load_json(path), old)
            with self.assertRaisesRegex(ValueError, "One JSON record"):
                save_json(path, {"1": "x" * 5000}, max_bytes=4096)
            self.assertEqual(load_json(path), old)

    def test_updates_remove_only_obsolete_manifest_parts_and_empty_data_works(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "character_history.json"
            manifest = save_json(path, {"1": "old"})
            old_part = path.parent / manifest["parts"][0]["file"]
            unrelated = path.parent / "my-notes.json"
            unrelated.write_text("keep me")
            save_json(path, {})
            self.assertEqual(load_json(path), {})
            self.assertFalse(old_part.exists())
            self.assertEqual(unrelated.read_text(), "keep me")

    def test_manifest_cannot_reference_a_file_outside_its_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "character_history.json"
            manifest = save_json(path, {"1": "value"})
            manifest["parts"][0]["file"] = "../outside.json"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Invalid JSON part name"):
                load_json(path)

    def test_flat_upload_contains_small_complete_data_and_excludes_generated_files(self):
        from prepare_upload import prepare_upload, SOURCE_FILES
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in SOURCE_FILES:
                (root / name).write_text("{}" if name == 'item-code-mappings.json' else "source")
            save_json(root / 'item-code-mappings.json', dict(schema_version=2, items=[{'code': '30424029', 'name': 'Sindri Shoes'}]), list_field='items', max_bytes=500000)
            history = {"1": "x" * 600000, "2": "y" * 600000}
            funding = dict(asset="WEMIX", transfers=[dict(amount_wei="60025000000000000000001")])
            (root / "character_history.json").write_text(json.dumps(history))
            (root / "funding_history.json").write_text(json.dumps(funding))
            (root / "index.html").write_text("large generated page")
            (root / "sample_private.json").write_text("never upload")
            output = prepare_upload(root)
            self.assertEqual(load_json(output / 'item-code-mappings.json')['items'][0]['name'], 'Sindri Shoes')
            self.assertEqual(load_json(output / "character_history.json"), history)
            self.assertEqual(load_json(output / "funding_history.json"), funding)
            self.assertTrue(all(path.is_file() and path.stat().st_size <= 1000000 for path in output.iterdir()))
            self.assertFalse((output / "index.html").exists())
            self.assertFalse((output / "sample_private.json").exists())
            old_parts = set(output.glob("character_history.part-*.json"))
            save_json(root / "character_history.json", {"1": "new"})
            prepare_upload(root)
            self.assertTrue(all(not part.exists() for part in old_parts))
            self.assertEqual(load_json(output / "character_history.json"), {"1": "new"})
            (output / "my-notes.txt").write_text("keep me")
            with self.assertRaisesRegex(ValueError, "unrecognized files"):
                prepare_upload(root)
            self.assertTrue((output / "my-notes.txt").exists())


if __name__ == "__main__":
    unittest.main()
