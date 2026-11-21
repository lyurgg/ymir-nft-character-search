"""Lossless, checksummed JSON parts small enough for GitHub browser uploads."""
import hashlib
import json
import re
from pathlib import Path

FORMAT = "ymir-split-json-v1"
PART_BYTES = 1_000_000


def _encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _part_path(target, name):
    pattern = re.escape(target.stem) + r"\.part-\d{3,}-[0-9a-f]{12}\.json"
    if not isinstance(name, str) or not re.fullmatch(pattern, name):
        raise ValueError(f"Invalid JSON part name in {target}: {name!r}")
    result = target.parent / name
    if result.resolve().parent != target.parent.resolve():
        raise ValueError(f"JSON part escapes its dataset directory: {name}")
    return result


def load_json(path):
    """Read a legacy JSON file or reconstruct a split dataset; never skip a part."""
    target = Path(path)
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "_format" not in data:
        return data
    if data["_format"] != FORMAT or data.get("kind") not in ("mapping", "array-field"):
        raise ValueError(f"Unsupported split JSON format: {target}")
    mapping = data["kind"] == "mapping"
    result = {} if mapping else []
    names = set()
    if not isinstance(data.get("parts"), list) or not data["parts"]:
        raise ValueError(f"Split JSON has no parts: {target}")
    for part in data["parts"]:
        chunk = _part_path(target, part["file"])
        if chunk.name in names:
            raise ValueError(f"Duplicate JSON part: {chunk}")
        names.add(chunk.name)
        try:
            raw = chunk.read_bytes()
        except FileNotFoundError as error:
            raise FileNotFoundError(f"Missing data part {chunk.name}; upload every part listed in {target.name}.") from error
        if len(raw) != part["bytes"] or hashlib.sha256(raw).hexdigest() != part["sha256"]:
            raise ValueError(f"Damaged or mixed data part: {chunk}")
        records = json.loads(raw)
        if not isinstance(records, dict if mapping else list) or len(records) != part["records"]:
            raise ValueError(f"Unexpected record type/count in {chunk}")
        if mapping:
            if result.keys() & records.keys():
                raise ValueError(f"Duplicate history IDs in {chunk}")
            result.update(records)
        else:
            result.extend(records)
    if len(result) != data["record_count"]:
        raise ValueError(f"Split JSON total record count is incorrect: {target}")
    if mapping:
        return result
    if not isinstance(data.get("base"), dict) or not isinstance(data.get("field"), str) or data["field"] in data["base"]:
        raise ValueError(f"Invalid split JSON metadata: {target}")
    return {**data["base"], data["field"]: result}


def _atomic_write(path, raw):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(raw)
    temporary.replace(path)


def save_json(path, data, *, list_field=None, max_bytes=PART_BYTES):
    """Write new parts before switching the manifest; remove only obsolete managed parts."""
    target = Path(path)
    if not isinstance(data, dict) or max_bytes < 64:
        raise ValueError("Expected a JSON object and a useful part size")
    mapping = list_field is None
    if not mapping and not isinstance(data.get(list_field), list):
        raise ValueError(f"Expected an array in {list_field}")
    records = data if mapping else data[list_field]
    encoded = [(_encoded(key) + b":" + _encoded(value)) for key, value in records.items()] if mapping else [_encoded(value) for value in records]
    chunks, pending, size = [], [], 3  # opening/closing brackets and a newline
    for row in encoded:
        if len(row) + 3 > max_bytes:
            raise ValueError("One JSON record exceeds the part limit; original manifest was preserved")
        if pending and size + 1 + len(row) > max_bytes:
            chunks.append(pending)
            pending, size = [], 3
        size += len(row) + bool(pending)
        pending.append(row)
    chunks.append(pending)
    manifest = dict(_format=FORMAT, kind="mapping" if mapping else "array-field",
                    record_count=len(records), parts=[])
    if not mapping:
        manifest.update(field=list_field, base={key: value for key, value in data.items() if key != list_field})
    output = []
    for index, rows in enumerate(chunks, 1):
        raw = (b"{" if mapping else b"[") + b",".join(rows) + (b"}\n" if mapping else b"]\n")
        digest = hashlib.sha256(raw).hexdigest()
        name = f"{target.stem}.part-{index:03d}-{digest[:12]}.json"
        manifest["parts"].append(dict(file=name, bytes=len(raw), sha256=digest, records=len(rows)))
        output.append((_part_path(target, name), raw))
    manifest_raw = (json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    if len(manifest_raw) > max_bytes:
        raise ValueError("JSON manifest exceeds the part limit; original manifest was preserved")
    old = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    for chunk, raw in output:
        if not chunk.exists() or chunk.read_bytes() != raw:
            _atomic_write(chunk, raw)
    _atomic_write(target, manifest_raw)
    current = {chunk.name for chunk, _ in output}
    if isinstance(old, dict) and old.get("_format") == FORMAT:
        for part in old["parts"]:
            chunk = _part_path(target, part["file"])
            if chunk.name not in current and chunk.is_file():
                chunk.unlink()
    return manifest
