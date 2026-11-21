"""Build a self-contained ownership graph page for static GitHub Pages hosting."""
import json
from pathlib import Path


def generate_graph(characters):
    root = Path(__file__).parent
    data = [{key: character.get(key) for key in (
        "nft_id", "character_name", "market", "owner_history", "transfers", "transfer_check")}
        for character in characters]
    html = (root / "graph-template.html").read_text(encoding="utf-8")
    html = html.replace("__GRAPH_CSS__", (root / "graph.css").read_text(encoding="utf-8"))
    html = html.replace("__THEME_CSS__", (root / "theme.css").read_text(encoding="utf-8"))
    script = (root / "graph-core.js").read_text(encoding="utf-8") + "\n" + (root / "graph.js").read_text(encoding="utf-8")
    # Names and other upstream text must never terminate the inline script.
    encoded = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    script = script.replace("__GRAPH_DATA__", encoded)
    return html.replace("__GRAPH_SCRIPT__", script)
