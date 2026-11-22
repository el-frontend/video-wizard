import { workspacePage } from '@/server/auth/page-policy';
import { VideoEditorContainer } from '@/features/video/containers/editor-container';
import { clipIntegrationService } from '@/server/services/clip-integration-service';
import type { SubtitleSegment } from '@/server/types/video-render';

/**
 * Video Editor Page
 *
 * Main editor interface for previewing and exporting videos with subtitles
 * Route: /editor/[id]?videoUrl=...&clipPath=...
 *
 * Integration with Python backend:
 * - Receives clip URL from /render-clip endpoint
 * - Fetches transcription from /transcribe endpoint
 * - Displays in Remotion player for preview/export
 */
export default workspacePage('/editor/[id]', async (_user, { params, searchParams }) => {
  const { id } = await params;
  const { videoUrl, clipPath } = await searchParams;

  let editorData: {
    videoUrl: string;
    subtitles: SubtitleSegment[];
  };

  // If real data is passed via URL params, use it
  if (typeof clipPath === 'string' && typeof videoUrl === 'string') {
    try {
      // Get full video URL
      const fullVideoUrl = clipIntegrationService.getVideoUrl(videoUrl);

      // Fetch transcription
      const transcription = await clipIntegrationService.transcribeVideo(clipPath);

      editorData = {
        videoUrl: fullVideoUrl,
        subtitles: transcription.segments.map((seg) => ({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          words: undefined, // Word-level timing would come from Whisper if enabled
        })),
      };
    } catch (error) {
      console.error('Failed to load video data:', error);
      // Fallback to mock data
      editorData = getMockVideoData(id!);
    }
  } else {
    // Use mock data for development/testing
    editorData = getMockVideoData(id!);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <VideoEditorContainer videoUrl={editorData.videoUrl} subtitles={editorData.subtitles} />
    </main>
  );
});

/**
 * Mock data function (for development/testing)
 */
function getMockVideoData(id: string): {
  videoUrl: string;
  subtitles: SubtitleSegment[];
} {
  // Mock data for testing without Python service
  return {
    videoUrl: 'http://localhost:8000/output/sample_clip.mp4',
    subtitles: [
      {
        id: 0,
        start: 0,
        end: 3,
        text: 'Welcome to Video Wizard',
        words: [
          { word: 'Welcome', start: 0, end: 0.5 },
          { word: 'to', start: 0.5, end: 0.8 },
          { word: 'Video', start: 0.8, end: 1.3 },
          { word: 'Wizard', start: 1.3, end: 3 },
        ],
      },
      {
        id: 1,
        start: 3,
        end: 6,
        text: 'Create amazing vertical videos with smart cropping',
        words: [
          { word: 'Create', start: 3, end: 3.5 },
          { word: 'amazing', start: 3.5, end: 4.2 },
          { word: 'vertical', start: 4.2, end: 5 },
          { word: 'videos', start: 5, end: 5.5 },
          { word: 'with', start: 5.5, end: 5.7 },
          { word: 'smart', start: 5.7, end: 5.9 },
          { word: 'cropping', start: 5.9, end: 6 },
        ],
      },
      {
        id: 2,
        start: 6,
        end: 9,
        text: 'Synchronized subtitles powered by AI',
        words: [
          { word: 'Synchronized', start: 6, end: 7 },
          { word: 'subtitles', start: 7, end: 7.8 },
          { word: 'powered', start: 7.8, end: 8.3 },
          { word: 'by', start: 8.3, end: 8.5 },
          { word: 'AI', start: 8.5, end: 9 },
        ],
      },
    ],
  };
}
