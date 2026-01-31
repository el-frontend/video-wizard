'use client';

import type { GeneratedClip, SubtitleSegment, SubtitleTemplate } from '@/features/video';
import {
  ClipCard,
  ClipEditModal,
  ProcessingProgress,
  TranscriptionResults,
  useVideoProcessing,
  VideoHeader,
  VideoHowItWorks,
  VideoUploader,
} from '@/features/video';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Video Container Component
 *
 * NEW WORKFLOW:
 * 1. Upload video → Extract subtitles → AI analysis
 * 2. Generate MAX 5 clips (CROP ONLY, no Remotion render)
 * 3. Show Remotion Player preview with instant client-side rendering
 * 4. User can:
 *    - Change template style (updates preview instantly)
 *    - Edit subtitles (updates preview instantly)
 * 5. When ready, click "Render Final" → sends to Remotion server for final render
 */
export function VideoContainer() {
  const [generatedClips, setGeneratedClips] = useState<GeneratedClip[]>([]);
  const [isGeneratingClips, setIsGeneratingClips] = useState(false);
  const [clipGenerationProgress, setClipGenerationProgress] = useState({ current: 0, total: 0 });
  const [editingClip, setEditingClip] = useState<GeneratedClip | null>(null);

  const {
    file,
    currentStep,
    transcription,
    analysis,
    language,
    error,
    progress,
    uploadedPath,
    setFile,
    processVideo,
    resetState,
  } = useVideoProcessing({
    onComplete: (data, _uploadedPath, _transcription) => {
      console.log('Analysis completed:', data)
      handleGenerateClips(data, _uploadedPath, _transcription);
    },
    onError: (err) => {
      console.error('Processing error:', err);
    },
  });

  /**
   * Generate clips - ONLY CROP, NO REMOTION RENDER
   * Max 5 clips, sorted by viral score
   */
  const handleGenerateClips = async (
    analysisData: typeof analysis,
    videoPath: string,
    transcriptionData: typeof transcription
  ) => {
    console.log('handleGenerateClips called', {
      analysisData,
      videoPath,
      transcriptionData,
    });

    if (!analysisData || !videoPath || !transcriptionData) {
      console.error('Missing required data for clip generation', {
        hasAnalysis: !!analysisData,
        hasUploadedPath: !!videoPath,
        hasTranscription: !!transcriptionData,
      });
      return;
    }

    setIsGeneratingClips(true);

    // Take top 5 clips by viral score
    const topClips = [...analysisData.clips]
      .sort((a, b) => b.viral_score - a.viral_score)
      .slice(0, 5);

    console.log('Top clips to generate:', topClips);

    // Get detected language from transcription
    const detectedLanguage = transcriptionData.language || 'en';

    // Initialize all clips with loading state
    const initialClips: GeneratedClip[] = topClips.map((clip, index) => ({
      index,
      summary: clip.summary,
      viralScore: clip.viral_score,
      startTime: clip.start_time,
      endTime: clip.end_time,
      duration: clip.end_time - clip.start_time,
      template: 'viral', // Default template
      language: detectedLanguage, // Pass detected language
      isLoading: true,
    }));

    setGeneratedClips(initialClips);
    setClipGenerationProgress({ current: 0, total: topClips.length });

    // Generate clips one by one (crop only)
    for (let i = 0; i < topClips.length; i++) {
      const clip = topClips[i];

      console.log(`Generating clip ${i + 1}/${topClips.length}`, clip);
      setClipGenerationProgress({ current: i + 1, total: topClips.length });

      try {
        // Step 1: Create the vertical clip (CROP ONLY)
        const clipResponse = await fetch('/api/create-clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_path: videoPath,
            start_time: clip.start_time,
            end_time: clip.end_time,
            crop_mode: 'dynamic',
          }),
        });

        if (!clipResponse.ok) {
          throw new Error('Failed to create clip');
        }

        const clipResult = await clipResponse.json();

        if (!clipResult.success) {
          throw new Error(clipResult.message || 'Clip creation failed');
        }

        // Step 2: Filter and adjust subtitles from original transcription
        const clipSubtitles: SubtitleSegment[] = transcriptionData.segments
          .filter((segment) => segment.start >= clip.start_time && segment.end <= clip.end_time)
          .map((segment) => ({
            start: segment.start - clip.start_time,
            end: segment.end - clip.start_time,
            text: segment.text,
          }));

        console.log(`Clip ${i + 1} cropped successfully. Subtitles: ${clipSubtitles.length}`);

        // Update with cropped video (NO REMOTION RENDER YET)
        // The Remotion Player will handle preview rendering client-side
        setGeneratedClips((prev) =>
          prev.map((c, idx) =>
            idx === i
              ? {
                  ...c,
                  videoUrl: clipResult.data.output_url, // Cropped video without subtitles
                  clipPath: clipResult.data.output_path,
                  subtitles: clipSubtitles,
                  language: detectedLanguage, // Ensure language is set
                  isLoading: false,
                }
              : c
          )
        );
      } catch (err) {
        console.error(`Error generating clip ${i + 1}:`, err);

        // Mark this clip as error
        setGeneratedClips((prev) =>
          prev.map((c, idx) =>
            idx === i
              ? {
                  ...c,
                  isLoading: false,
                  error: err instanceof Error ? err.message : 'Generation failed',
                }
              : c
          )
        );
      }
    }

    setIsGeneratingClips(false);
    setClipGenerationProgress({ current: 0, total: 0 });
    console.log('All clips generated successfully (crop only)');
  };

  /**
   * Handle template change (updates preview instantly)
   */
  const handleTemplateChange = (clipIndex: number, template: SubtitleTemplate) => {
    setGeneratedClips((prev) => prev.map((c) => (c.index === clipIndex ? { ...c, template } : c)));
  };

  /**
   * Handle edit clip
   */
  const handleEditClip = (clip: GeneratedClip) => {
    setEditingClip(clip);
  };

  /**
   * Save edited subtitles and template (NO RENDER YET, just update state)
   */
  const handleSaveEdit = async (editedSubtitles: SubtitleSegment[], template: SubtitleTemplate) => {
    if (!editingClip) return;

    // Update the clip with new subtitles and template
    // Preview will update instantly via Remotion Player
    setGeneratedClips((prev) =>
      prev.map((c) =>
        c.index === editingClip.index
          ? {
              ...c,
              subtitles: editedSubtitles,
              template,
            }
          : c
      )
    );

    console.log('Clip updated (preview only, no server render)');
  };

  /**
   * Render final video with Remotion server
   * This is when we actually call the Remotion server to create the final MP4
   */
  const handleRenderFinal = async (clip: GeneratedClip) => {
    if (!clip.clipPath || !clip.subtitles || clip.subtitles.length === 0) {
      toast.error('Cannot render: missing clip or subtitles');
      return;
    }

    // Mark clip as rendering
    setGeneratedClips((prev) =>
      prev.map((c) => (c.index === clip.index ? { ...c, isRendering: true } : c))
    );

    try {
      console.log(`Rendering final video for clip ${clip.index + 1} with Remotion server...`);

      // Convert subtitles to milliseconds format
      const formattedSubtitles = clip.subtitles.map((sub) => ({
        start: sub.start * 1000, // Convert to ms
        end: sub.end * 1000,
        text: sub.text,
      }));

      // Call Remotion server to render final video
      const response = await fetch('/api/render-with-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipPath: clip.clipPath,
          subtitles: formattedSubtitles,
          template: clip.template || 'viral',
          language: clip.language || 'en',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to render video');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Video render failed');
      }

      console.log(`Clip ${clip.index + 1} rendered successfully!`);

      // Update the clip with rendered video URL
      setGeneratedClips((prev) =>
        prev.map((c) =>
          c.index === clip.index
            ? {
                ...c,
                renderedVideoUrl: result.data.videoUrl,
                isRendering: false,
              }
            : c
        )
      );

      toast.success('Video rendered successfully! You can now download it.');
    } catch (err) {
      console.error('Error rendering final video:', err);

      // Mark as not rendering and show error
      setGeneratedClips((prev) =>
        prev.map((c) => (c.index === clip.index ? { ...c, isRendering: false } : c))
      );

      toast.error(err instanceof Error ? err.message : 'Failed to render video');
    }
  };

  return (
    <div className="space-y-8">
      <VideoHeader />

      <VideoUploader
        file={file}
        currentStep={currentStep}
        onFileSelect={setFile}
        onProcess={processVideo}
        onReset={resetState}
        error={error}
      />

      <ProcessingProgress currentStep={currentStep} progress={progress} error={error} />

      {transcription && currentStep !== 'idle' && currentStep !== 'complete' && (
        <TranscriptionResults transcription={transcription} />
      )}

      {/* Show analysis summary after analysis completes */}
      {analysis &&
        currentStep === 'complete' &&
        generatedClips.length === 0 &&
        !isGeneratingClips && (
          <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="text-xl font-bold mb-2 text-foreground">🎉 Analysis Complete!</h3>
            <p className="text-muted-foreground mb-4">
              Found {analysis.clips.length} viral moments. Generating top 5 clips...
            </p>
          </div>
        )}

      {/* Generated Clips Grid */}
      {generatedClips.length > 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-foreground">
              {isGeneratingClips ? 'Generating Viral Clips...' : 'Your Viral Clips'}
            </h2>
            <p className="text-muted-foreground">
              {isGeneratingClips
                ? `Cropping videos (${clipGenerationProgress.current}/${clipGenerationProgress.total})...`
                : 'Preview your clips with real-time subtitle rendering. Edit subtitles and change templates, then click "Render Final" when ready.'}
            </p>
          </div>

          {/* Progress bar when generating */}
          {isGeneratingClips && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">
                  Clip {clipGenerationProgress.current} of {clipGenerationProgress.total}
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(
                    (clipGenerationProgress.current / clipGenerationProgress.total) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(clipGenerationProgress.current / clipGenerationProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {generatedClips.map((clip) => (
              <ClipCard
                key={clip.index}
                index={clip.index}
                summary={clip.summary}
                viralScore={clip.viralScore}
                duration={clip.duration}
                videoUrl={clip.videoUrl}
                renderedVideoUrl={clip.renderedVideoUrl}
                subtitles={clip.subtitles}
                template={clip.template}
                language={clip.language}
                isLoading={clip.isLoading}
                isRendering={clip.isRendering}
                onEdit={() => handleEditClip(clip)}
                onTemplateChange={(template) => handleTemplateChange(clip.index, template)}
                onRenderFinal={() => handleRenderFinal(clip)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingClip && editingClip.videoUrl && editingClip.subtitles && (
        <ClipEditModal
          open={!!editingClip}
          onClose={() => setEditingClip(null)}
          clipIndex={editingClip.index}
          clipSummary={editingClip.summary}
          videoUrl={editingClip.videoUrl}
          subtitles={editingClip.subtitles}
          template={editingClip.template || 'viral'}
          onSave={handleSaveEdit}
        />
      )}

      {currentStep === 'idle' && <VideoHowItWorks />}
    </div>
  );
}
