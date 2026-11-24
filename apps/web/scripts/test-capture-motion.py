"""Check bounded capture consistency against a changing synthetic source."""
import hashlib
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
    def test_two_identical_intermediate_observations_require_the_committed_revision(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            video = root / "videos/demo"
            video.mkdir(parents=True)
            state = root / ".studio/projects/demo/state.json"
            state.parent.mkdir(parents=True)
            stage = root / "capture"
            stage.mkdir()
            episode = {"scenes": [{"duration": 2, "sourceOnly": 1}]}
            captions = [{"start": 0, "end": 1, "text": "Old"}]
            (video / "episode.json").write_text(json.dumps(episode))
            (video / "captions.json").write_text(json.dumps(captions))
            def commit():
                model = {"title": "Demo", "styleId": None, "episode": episode, "captions": captions}
                revision = hashlib.sha256(json.dumps(model, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]
                state.write_text(json.dumps({"title": "Demo", "revision": revision}))
            commit()
            episode["scenes"][0]["sourceOnly"] = 2
            (video / "episode.json").write_text(json.dumps(episode))
            with patch.object(sys, "argv", ["capture", str(root), "demo", str(stage), "30"]):
                with self.assertRaises(ValueError):
                    capture.main()
                self.assertFalse((stage / "model.json").exists())
                captions[0]["text"] = "New"
                (video / "captions.json").write_text(json.dumps(captions))
                commit()
                capture.main()
                self.assertEqual(json.loads((stage / "model.json").read_text())["captions"], captions)

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
