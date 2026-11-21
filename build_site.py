"""Generate and verify the complete two-page GitHub Pages artifact."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
from html.parser import HTMLParser
import shutil

PAGES = ("index.html", "graph.html")


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
    destination.mkdir(parents=True, exist_ok=True)
    for name in PAGES:
        shutil.copyfile(source / name, destination / name)
        print(f"Staged {destination / name}")
    (destination / ".nojekyll").touch()


if __name__ == "__main__":
    from generate_html import main
    main()
    prepare_site()
