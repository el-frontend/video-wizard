import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

from video_metadata import probe_video_duration_ms


class VideoMetadataTest(unittest.TestCase):
    def setUp(self):
        temp_dir = TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        original_dir = Path.cwd()
        os.chdir(temp_dir.name)
        self.addCleanup(os.chdir, original_dir)
        Path("uploads").mkdir()
        Path("output").mkdir()

    def test_measures_full_media_duration(self):
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "color=size=160x90:rate=30:duration=8", "-an", "-c:v", "mpeg4",
                "uploads/fixture #1.mp4",
            ],
            check=True,
            timeout=30,
        )

        self.assertEqual(probe_video_duration_ms("uploads/fixture #1.mp4"), 8000)

    def test_rejects_paths_outside_media_directories(self):
        outside = Path("outside.mp4")
        outside.touch()
        Path("output/linked.mp4").symlink_to(outside.resolve())

        for video_path in (
            "uploads/../outside.mp4",
            "output/linked.mp4",
            str(outside.resolve()),
            "https://example.invalid/uploads/fixture.mp4",
        ):
            with self.subTest(video_path=video_path), self.assertRaises(ValueError):
                probe_video_duration_ms(video_path)

    def test_rejects_non_video_files(self):
        Path("uploads/not-a-video.mp4").write_text("invalid video")

        with self.assertRaises(ValueError):
            probe_video_duration_ms("uploads/not-a-video.mp4")


if __name__ == "__main__":
    unittest.main()
