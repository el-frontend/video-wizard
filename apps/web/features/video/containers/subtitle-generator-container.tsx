'use client';

import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Progress } from '@workspace/ui/components/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { AlertCircle, CheckCircle2, Upload, Video } from 'lucide-react';
import { SubtitleEditor } from '../components/subtitle-editor';
import { TemplateSelector } from '../components/template-selector';
import { useSubtitleGeneration } from '../hooks/use-subtitle-generation';

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

export function SubtitleGeneratorContainer() {
  const {
    file,
    currentStep,
    subtitles,
    language,
    selectedTemplate,
    renderedVideoUrl,
    error,
    progress,
    setFile,
    setLanguage,
    setTemplate,
    updateSubtitles,
    generateSubtitles,
    renderVideo,
    resetState,
  } = useSubtitleGeneration();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFile(selectedFile || null);
  };

  const isProcessing =
    currentStep === 'uploading' ||
    currentStep === 'generating-subtitles' ||
    currentStep === 'rendering';

  const canGenerate = file && !isProcessing;
  const canRender = currentStep === 'editing' && subtitles.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Subtitle Generator
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload a video, generate subtitles, and render with your preferred style
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Display */}
        {currentStep === 'complete' && renderedVideoUrl && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Video rendered successfully! You can download it below.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Indicator */}
        {isProcessing && (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                <p className="text-sm font-medium">{progress}</p>
              </div>
              <Progress value={undefined} className="w-full" />
            </div>
          </Card>
        )}

        {/* Step 1: Upload & Configure */}
        {(currentStep === 'idle' || currentStep === 'error') && (
          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">
                  Step 1: Upload Video
                </h2>
                <p className="text-muted-foreground">
                  Select a video file to generate subtitles
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="video-upload"
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">Click to upload</span> or
                        drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        MP4, MOV, AVI (MAX. 500MB)
                      </p>
                      {file && (
                        <p className="mt-4 text-sm font-medium text-primary">
                          Selected: {file.name}
                        </p>
                      )}
                    </div>
                    <input
                      id="video-upload"
                      type="file"
                      className="hidden"
                      accept="video/*"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={generateSubtitles}
                  disabled={!canGenerate}
                  className="w-full"
                  size="lg"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload and Generate Subtitles
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Edit Subtitles */}
        {currentStep === 'editing' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    Step 2: Edit Subtitles
                  </h2>
                  <p className="text-muted-foreground">
                    Review and edit the generated subtitles
                  </p>
                </div>

                <SubtitleEditor
                  subtitles={subtitles}
                  onSubtitlesChange={updateSubtitles}
                />
              </div>
            </Card>

            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    Step 3: Select Template
                  </h2>
                  <p className="text-muted-foreground">
                    Choose a subtitle style for your video
                  </p>
                </div>

                <TemplateSelector
                  selectedTemplate={selectedTemplate}
                  onTemplateChange={setTemplate}
                />

                <div className="flex gap-4">
                  <Button
                    onClick={renderVideo}
                    disabled={!canRender}
                    className="flex-1"
                    size="lg"
                  >
                    <Video className="mr-2 h-4 w-4" />
                    Render Video with Subtitles
                  </Button>
                  <Button onClick={resetState} variant="outline" size="lg">
                    Start Over
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Step 3: Download Result */}
        {currentStep === 'complete' && renderedVideoUrl && (
          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">
                  Step 4: Download Your Video
                </h2>
                <p className="text-muted-foreground">
                  Your video with subtitles is ready!
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <video
                  src={renderedVideoUrl}
                  controls
                  className="w-full max-w-2xl mx-auto rounded-lg border"
                />

                <div className="flex gap-4 justify-center">
                  <Button size="lg" asChild>
                    <a href={renderedVideoUrl} download>
                      Download Video
                    </a>
                  </Button>
                  <Button onClick={resetState} variant="outline" size="lg">
                    Generate Another Video
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
