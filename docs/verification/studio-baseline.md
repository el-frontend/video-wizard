# Studio baseline

The baseline for F1 is `2abff01` with the workspace lockfile, pnpm 10.15.0, and Node 22.12.0.

| Check                                 | Baseline result                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter web test`              | Exited successfully after printing `No tests yet`. It executed no tests.                                                                                                                      |
| `pnpm --filter web exec tsc --noEmit` | Passed.                                                                                                                                                                                       |
| `pnpm --filter web lint`              | Passed with 12 warnings and zero errors. The warnings were unused values and one missing React hook dependency.                                                                               |
| `pnpm --filter web build`             | The sandboxed production build could not fetch Geist, Geist Mono, or Noto Sans from Google Fonts.                                                                                             |
| `pnpm --filter web build --webpack`   | The isolated baseline compiled and passed TypeScript when network access was available. Without local configuration it stopped while collecting page data because `DATABASE_URL` was missing. |
| Configured build                      | The baseline with Webpack and F1 with Turbopack both compiled and passed TypeScript, then failed during prerendering. `/signin` calls `useSearchParams()` without a Suspense boundary.        |

## Subtitle timing fixture

The fixture uses an eight-second MP4 with silent audio, a caption at 0.500–2.300 seconds, and a timed word at 0.600–0.900 seconds. The standalone editor stores the caption at 500–2300 ms and the word at 600–900 ms. Preview and rendering use seconds. The existing 200 ms caption offset applies in both. Source duration gives 240 frames at 30 fps, including when the subtitle list is empty.

```sh
pnpm --filter web test
pnpm --filter web typecheck
cd apps/processing-engine
python3 -m unittest -v test_video_metadata
```

The Python test generates a local fixture with FFmpeg and measures it with ffprobe. The browser fixture used real playback, authentication, PostgreSQL, and the worker. An HTTP fixture supplied the transcript and captured render requests. The checks cover the Remotion request and the media timeline in the player. They do not exercise Whisper inference or video encoding by the Remotion server.

Older render requests can omit `sourceDurationMs`. The processing engine probes a local video inside `uploads/` or `output/`, resolves symlinks before checking containment, and accepts self-contained video containers. These are the existing public media mounts and have no per-user ownership model. The probe requires FFmpeg's `ffprobe` executable, which the processing engine image already includes. [FFmpeg probe reference](https://ffmpeg.org/ffprobe-all.html)
