"""Prepare a flat set of small files for GitHub's browser uploader; no Git required."""
import hashlib
import json
import shutil
from pathlib import Path
from json_store import load_json, save_json, PART_BYTES

SOURCE_FILES = (
    ".gitignore", "README.md", "requirements.txt", "characters.csv", "scan_report.json",
    "app.js", "build_site.py", "character_history.py", "collect_funding.py",
    "dashboard.css", "extract_name.py", "extract_name_parallel.py", "funding_case_report.json",
    "funding-core.js", "funding-ui.js", "funding.py", "generate_graph.py", "generate_html.py",
    "graph-core.js", "graph-template.html", "graph.css", "graph.js", "json_store.py", "marketplace.py",
    "prepare_upload.py", "test_build_site.py", "test_character_data.py", "test_frontend.cjs",
    "test_funding.cjs", "test_funding.py", "test_graph_page.cjs", "test_graph.cjs",
    "test_json_store.py", "theme.css", "verify_live.py",
)
PACKAGE = "ymir-browser-upload-v1"
REPORT = "UPLOAD_MANIFEST.json"
INSTRUCTIONS = """UPLOAD THESE FILES, NOT THE FOLDER

1. On GitHub, open .github/workflows/deploy.yml and choose Edit.
   Replace its contents with the updated local .github/workflows/deploy.yml.
   Commit the edit. The workflow now saves the JSON parts after each scan.

2. At the repository ROOT, choose Add file > Upload files > choose your files.
   Open this local github-upload folder, select ALL FILES inside it, and upload.
   Do not upload the github-upload folder itself. Keep every filename unchanged.
   Commit the files together. All files are under 1 MB; no folder upload is needed.

3. The upload triggers the workflow, which generates and publishes both pages.
   A run triggered by step 1 may fail before step 2 supplies the new source files;
   the run after step 2 has everything it needs. Re-run that latest run if needed.

character_history.json and funding_history.json are now small index files.
Their part files contain the original observations and transfers. Keep ALL of
them together. Missing or mixed parts stop the build instead of dropping history.
Unused old part files already on GitHub are ignored by the current indexes.

Do not add index.html, graph.html, _site, .venv, __pycache__, or sample_* files.
The workflow generates the large pages automatically. UPLOAD_MANIFEST.json and
this instructions file may be uploaded with the rest; they are harmless records.
"""


def prepare_upload(root=None, output=None):
    root = Path(root) if root is not None else Path(__file__).parent
    output = Path(output) if output is not None else root / "github-upload"
    if output.resolve() == root.resolve() or root.resolve().is_relative_to(output.resolve()):
        raise ValueError("Upload output must be a separate folder")
    selected = list(SOURCE_FILES)
    for name, field in (("character_history.json", None), ("funding_history.json", "transfers")):
        path = root / name
        if not path.exists():
            if field:
                continue
            raise FileNotFoundError(f"Missing required history: {path}")
        original = load_json(path)
        manifest = save_json(path, original, list_field=field)
        if load_json(path) != original:
            raise ValueError(f"Split history differs from the original: {name}")
        selected.extend([name, *(part["file"] for part in manifest["parts"])])
    for name in selected:
        path = root / name
        if not path.is_file() or path.stat().st_size > PART_BYTES:
            raise ValueError(f"Missing source file or file over 1 MB: {name}")
    output.mkdir(parents=True, exist_ok=True)
    previous_path = output / REPORT
    previous = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {}
    if previous and previous.get("package") != PACKAGE:
        raise ValueError("Output folder does not belong to this upload packager")
    managed = set(previous.get("files", []))
    for name in managed:
        if Path(name).name != name or (output / name).resolve().parent != output.resolve():
            raise ValueError("Invalid filename in previous upload package")
    unexpected = {path.name for path in output.iterdir()} - managed - {REPORT}
    if unexpected:
        raise ValueError(f"Choose an empty output folder; unrecognized files: {sorted(unexpected)}")
    for name in selected:
        target = output / name
        if target.resolve().parent != output.resolve():
            raise ValueError(f"Upload path escapes its directory: {name}")
        shutil.copyfile(root / name, target)
    (output / "UPLOAD_INSTRUCTIONS.txt").write_text(INSTRUCTIONS, encoding="utf-8")
    current = set(selected) | {"UPLOAD_INSTRUCTIONS.txt"}
    for name in managed - current:
        target = output / name
        if target.is_file():
            target.unlink()
    for name in ("character_history.json", "funding_history.json"):
        if name in current and load_json(output / name) != load_json(root / name):
            raise ValueError(f"Upload package history verification failed: {name}")
    report = dict(package=PACKAGE, files=sorted(current),
                  hashes={name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in sorted(current)},
                  file_count=len(current) + 1,
                  largest_bytes=max((output / name).stat().st_size for name in current))
    previous_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {report['file_count']} flat files in {output.resolve()}")
    print(f"Largest file: {report['largest_bytes']:,} bytes. Upload files inside this folder, not the folder itself.")
    return output


if __name__ == "__main__":
    prepare_upload()
