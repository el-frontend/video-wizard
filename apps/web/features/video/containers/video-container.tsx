'use client';

import type { GeneratedClip, SubtitleSegment } from '@/features/video';
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

/**
 * Video Container Component
 * 
 * Redesigned UX flow:
 * 1. Upload video → Extract subtitles → AI analysis (same)
 * 2. Generate MAX 5 clips inline, one by one
 * 3. Show cards with skeleton loading → video preview when ready
 * 4. User can play or edit each clip
 * 5. Edit mode allows subtitle changes → regenerate with Remotion
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
    error,
    progress,
    uploadedPath,
    setFile,
    processVideo,
    resetState,
  } = useVideoProcessing({
    onComplete: (data) => {
      console.log('Analysis completed:', data);
      console.log('uploadedPath:', uploadedPath);
      console.log('transcription:', transcription);
      // Automatically start generating clips
      setTimeout(() => {
        handleGenerateClips(data);
      }, 100);
    },
    onError: (err) => {
      console.error('Processing error:', err);
    },
  });

  /**
   * Generate clips inline one by one
   * Max 5 clips, sorted by viral score
   */
  const handleGenerateClips = async (analysisData: typeof analysis) => {
    console.log('handleGenerateClips called', {
      analysisData,
      uploadedPath,
      transcription,
    });

    if (!analysisData) {
      console.error('No analysis data');
      return;
    }

    if (!uploadedPath) {
      console.error('No uploaded path');
      return;
    }

    if (!transcription) {
      console.error('No transcription data');
      return;
    }

    setIsGeneratingClips(true);

    // Take top 5 clips by viral score
    const topClips = [...analysisData.clips]
      .sort((a, b) => b.viral_score - a.viral_score)
      .slice(0, 5);

    console.log('Top clips to generate:', topClips);

    // Initialize all clips with loading state
    const initialClips: GeneratedClip[] = topClips.map((clip, index) => ({
      index,
      summary: clip.summary,
      viralScore: clip.viral_score,
      startTime: clip.start_time,
      endTime: clip.end_time,
      duration: clip.end_time - clip.start_time,
      isLoading: true,
    }));

    setGeneratedClips(initialClips);

    // Generate clips one by one
    setClipGenerationProgress({ current: 0, total: topClips.length });

    for (let i = 0; i < topClips.length; i++) {
      const clip = topClips[i];

      console.log(`Generating clip ${i + 1}/${topClips.length}`, clip);
      setClipGenerationProgress({ current: i + 1, total: topClips.length });

      try {
        // Step 1: Create the vertical clip
        const clipResponse = await fetch('/api/create-clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_path: uploadedPath,
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
        const clipSubtitles: SubtitleSegment[] = transcription.segments
          .filter(
            (segment) =>
              segment.start >= clip.start_time && segment.end <= clip.end_time
          )
          .map((segment) => ({
            start: segment.start - clip.start_time,
            end: segment.end - clip.start_time,
            text: segment.text,
          }));

        console.log(`Rendering clip ${i + 1} with Remotion...`);

        // Step 3: Render with Remotion (add subtitles overlay)
        const remotionResponse = await fetch('/api/render-with-subtitles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clipPath: clipResult.data.output_path,
            subtitles: clipSubtitles,
          }),
        });

        if (!remotionResponse.ok) {
          console.warn('Remotion rendering failed, using original clip');
          // Fallback to original clip without Remotion
          setGeneratedClips((prev) =>
            prev.map((c, idx) =>
              idx === i
                ? {
                    ...c,
                    videoUrl: clipResult.data.output_url,
                    clipPath: clipResult.data.output_path,
                    subtitles: clipSubtitles,
                    isLoading: false,
                  }
                : c
            )
          );
        } else {
          const remotionResult = await remotionResponse.json();

          if (remotionResult.success) {
            console.log(`Clip ${i + 1} rendered with Remotion successfully`);
            // Update with Remotion-rendered video
            setGeneratedClips((prev) =>
              prev.map((c, idx) =>
                idx === i
                  ? {
                      ...c,
                      videoUrl: remotionResult.data.videoUrl,
                      clipPath: remotionResult.data.clipPath,
                      subtitles: clipSubtitles,
                      isLoading: false,
                    }
                  : c
              )
            );
          } else {
            // Fallback to original clip
            setGeneratedClips((prev) =>
              prev.map((c, idx) =>
                idx === i
                  ? {
                      ...c,
                      videoUrl: clipResult.data.output_url,
                      clipPath: clipResult.data.output_path,
                      subtitles: clipSubtitles,
                      isLoading: false,
                    }
                  : c
              )
            );
          }
        }
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
    console.log('All clips generated successfully');
  };

  /**
   * Handle play clip - video plays inline in the card
   */
  const handlePlayClip = (clip: GeneratedClip) => {
    // Video now plays inline with controls, no need to open new window
    console.log('Play clip:', clip.index);
  };

  /**
   * Handle edit clip
   */
  const handleEditClip = (clip: GeneratedClip) => {
    setEditingClip(clip);
  };

  /**
   * Save edited subtitles and regenerate video with Remotion
   */
  const handleSaveEditedSubtitles = async (
    editedSubtitles: SubtitleSegment[]
  ) => {
    if (!editingClip || !editingClip.clipPath) return;

    try {
      // Call Remotion API to regenerate video with edited subtitles
      const response = await fetch('/api/render-with-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipPath: editingClip.clipPath,
          subtitles: editedSubtitles,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate video');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Video regeneration failed');
      }

      // Update the clip with new video URL
      setGeneratedClips((prev) =>
        prev.map((c) =>
          c.index === editingClip.index
            ? {
                ...c,
                videoUrl: result.data.videoUrl,
                clipPath: result.data.clipPath,
                subtitles: editedSubtitles,
              }
            : c
        )
      );

      alert('Video regenerated successfully!');
    } catch (err) {
      console.error('Error regenerating video:', err);
      alert(err instanceof Error ? err.message : 'Failed to regenerate video');
      throw err;
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

      <ProcessingProgress
        currentStep={currentStep}
        progress={progress}
        error={error}
      />

      {transcription && currentStep !== 'idle' && currentStep !== 'complete' && (
        <TranscriptionResults transcription={transcription} />
      )}

      {/* Show analysis summary and generate button after analysis completes */}
      {analysis && currentStep === 'complete' && generatedClips.length === 0 && !isGeneratingClips && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-2 text-foreground">
            🎉 Analysis Complete!
          </h3>
          <p className="text-muted-foreground mb-4">
            Found {analysis.clips.length} viral moments. Click below to generate the top 5 clips.
          </p>
          <button
            onClick={() => handleGenerateClips(analysis)}
            className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-lg"
          >
            Generate Viral Clips
          </button>
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
                ? `Creating and rendering clips with subtitles (${clipGenerationProgress.current}/${clipGenerationProgress.total})...`
                : 'Videos with subtitles rendered. Click Play to watch or Edit to customize.'}
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
                  {Math.round((clipGenerationProgress.current / clipGenerationProgress.total) * 100)}%
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
                subtitles={clip.subtitles}
                isLoading={clip.isLoading}
                onEdit={() => handleEditClip(clip)}
                onPlay={() => handlePlayClip(clip)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingClip && editingClip.videoUrl && editingClip.subtitles && editingClip.clipPath && (
        <ClipEditModal
          open={!!editingClip}
          onClose={() => setEditingClip(null)}
          clipIndex={editingClip.index}
          clipSummary={editingClip.summary}
          videoUrl={editingClip.videoUrl}
          subtitles={editingClip.subtitles}
          onSave={handleSaveEditedSubtitles}
        />
      )}

      {currentStep === 'idle' && <VideoHowItWorks />}
    </div>
  );
}
