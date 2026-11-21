import tempfile
import unittest
from pathlib import Path
from build_site import prepare_site


class SiteArtifactTests(unittest.TestCase):
    def test_missing_graph_cannot_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="graph.html">Graph</a>')
            with self.assertRaises(FileNotFoundError):
                prepare_site(root, root / "output")
            self.assertFalse((root / "output").exists())

    def test_both_pages_and_query_links_are_staged(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="graph.html?root=4200">Graph</a>')
            (root / "graph.html").write_text('<a href="index.html?nft=4200">Character</a>')
            prepare_site(root, root / "output")
            self.assertEqual({path.name for path in (root / "output").iterdir()},
                             {"index.html", "graph.html", ".nojekyll"})

    def test_root_links_are_rejected_for_project_sites(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "index.html").write_text('<a href="/graph.html">Graph</a>')
            (root / "graph.html").write_text('Graph')
            with self.assertRaises(ValueError):
                prepare_site(root, root / "output")


if __name__ == "__main__":
    unittest.main()
