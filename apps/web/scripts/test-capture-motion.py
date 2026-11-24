"""Check bounded capture consistency against a changing synthetic source."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("motion_capture", Path(__file__).with_name("capture-motion.py"))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class SourceCapture(unittest.TestCase):
    def test_change_between_passes_retries_then_uses_complete_new_capture(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            video = root / "videos/demo"
            video.mkdir(parents=True)
            model = video / "episode.json"
            model.write_text(json.dumps({"title":"First","scenes":[{"duration":1}]}))
            stage = root / "capture"
            stage.mkdir()
            original = capture.capture
            calls = 0
            def mutate(*args):
                nonlocal calls
                result = original(*args)
                calls += 1
                if calls == 1:
                    model.write_text(json.dumps({"title":"Second","scenes":[{"duration":2}]}))
                return result
            with patch.object(capture,"capture",mutate),patch.object(sys,"argv",["capture",str(root),"demo",str(stage),"30"]):
                capture.main()
            final = json.loads((stage/"model.json").read_text())["episode"]
            self.assertEqual(4,calls)
            self.assertEqual(("Second",2),(final["title"],final["scenes"][0]["duration"]))


if __name__ == "__main__":
    unittest.main()
