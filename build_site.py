"""Generate and verify the complete GitHub Pages artifact and wallet data assets."""
from pathlib import Path
import json
import re
from urllib.parse import urlsplit, unquote
from html.parser import HTMLParser
import shutil

PAGES = ("index.html", "graph.html", "wallet.html", "reports.html", "items.html", "item-sales.html")
DOWNLOADS = ("reports-evidence.json", "items.csv", "items.json")


class LocalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        url = urlsplit(href)
        if not url.scheme and not url.netloc and url.path:
            if url.path.startswith("/"):
                raise ValueError(f"Root-relative link breaks project Pages hosting: {href}")
            self.paths.append(unquote(url.path))


def prepare_site(source=Path("."), destination=Path("_site")):
    source, destination = Path(source), Path(destination)
    # Check every required page before staging anything; never publish index alone.
    for name in PAGES:
        path = source / name
        if not path.is_file():
            raise FileNotFoundError(f"Required page missing: {path}. Run generate_html.py first.")
        links = LocalLinks()
        links.feed(path.read_text(encoding="utf-8"))
        for relative in links.paths:
            if not (source / relative).is_file():
                raise FileNotFoundError(f"Broken page link in {name}: {relative}")
    assets = source / "wallet-data"
    index = json.loads((assets / "index.json").read_text(encoding="utf-8"))
    names = ["index.json", *(f"funding-{i:02x}.json" for i in range(256)), *index["snapshots"].values()]
    for name in names:
        if not re.fullmatch(r"index\.json|funding-[0-9a-f]{2}\.json|snapshot-0x[0-9a-f]{40}\.json", name):
            raise ValueError("Invalid wallet asset path")
        if not (assets / name).is_file():
            raise FileNotFoundError(f"Wallet asset missing: {name}")
    for name in DOWNLOADS:
        if not (source / name).is_file():
            raise FileNotFoundError(f"Download asset missing: {name}")
    destination.mkdir(parents=True, exist_ok=True)
    for name in DOWNLOADS:
        shutil.copyfile(source / name, destination / name)
    for name in PAGES:
        shutil.copyfile(source / name, destination / name)
        print(f"Staged {destination / name}")
    (destination / ".nojekyll").touch()
    (destination / "wallet-data").mkdir(exist_ok=True)
    for name in names:
        shutil.copyfile(assets / name, destination / "wallet-data" / name)


if __name__ == "__main__":
    from generate_html import main
    main()
    prepare_site()
