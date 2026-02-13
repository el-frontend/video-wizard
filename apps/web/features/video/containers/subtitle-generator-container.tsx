'use client';

import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Progress } from '@workspace/ui/components/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { AlertCircle, CheckCircle2, Download, FileText, Link, Upload, Video } from 'lucide-react';
import { AspectRatioSelector } from '../components/aspect-ratio-selector';
import { BrandKitSettings } from '../components/brand-kit-settings';
import { SubtitleEditor } from '../components/subtitle-editor';
import { TemplateSelector } from '../components/template-selector';
import { useBrandKit } from '../hooks/use-brand-kit';
import type { VideoInputMode } from '../hooks/use-subtitle-generation';
import { useSubtitleGeneration } from '../hooks/use-subtitle-generation';
import { downloadSrt, downloadVtt } from '../lib/subtitle-export';
import { isYouTubeUrl } from '../lib/youtube';

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
    youtubeUrl,
    inputMode,
    aspectRatio,
    currentStep,
    subtitles,
    language,
    selectedTemplate,
    renderedVideoUrl,
    error,
    progress,
    setFile,
    setYoutubeUrl,
    setInputMode,
    setAspectRatio,
    setLanguage,
    setTemplate,
    updateSubtitles,
    generateSubtitles,
    renderVideo,
    resetState,
  } = useSubtitleGeneration();

  const { brandKit, setBrandKit } = useBrandKit();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFile(selectedFile || null);
  };

  const isProcessing =
    currentStep === 'uploading' ||
    currentStep === 'generating-subtitles' ||
    currentStep === 'rendering';

  const isYouTubeValid = youtubeUrl.trim() !== '' && isYouTubeUrl(youtubeUrl);
  const canGenerate =
    inputMode === 'file' ? file && !isProcessing : isYouTubeValid && !isProcessing;
  const canRender = currentStep === 'editing' && subtitles.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Subtitle Generator</h1>
          <p className="text-muted-foreground text-lg">
            Upload a video or paste a YouTube URL to generate subtitles
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
                <h2 className="text-2xl font-semibold mb-2">Step 1: Select Video</h2>
                <p className="text-muted-foreground">Upload a file or paste a YouTube URL</p>
              </div>

              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as VideoInputMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="file" className="flex-1">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload File
                  </TabsTrigger>
                  <TabsTrigger value="youtube" className="flex-1">
                    <Link className="w-4 h-4 mr-2" />
                    YouTube URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file">
                  <div className="space-y-4">
                    <label
                      htmlFor="video-upload"
                      className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">MP4, MOV, AVI (MAX. 500MB)</p>
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
                </TabsContent>

                <TabsContent value="youtube">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">YouTube Video URL</label>
                      <Input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                      />
                      {youtubeUrl && (
                        <p
                          className={`text-xs ${isYouTubeValid ? 'text-green-600' : 'text-destructive'}`}
                        >
                          {isYouTubeValid
                            ? 'Valid YouTube URL'
                            : 'Please enter a valid YouTube URL'}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Supports youtube.com/watch, youtu.be, and youtube.com/shorts URLs
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

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
                {inputMode === 'youtube' ? (
                  <>
                    <Link className="mr-2 h-4 w-4" />
                    Download and Generate Subtitles
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload and Generate Subtitles
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Edit Subtitles */}
        {currentStep === 'editing' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Step 2: Edit Subtitles</h2>
                  <p className="text-muted-foreground">Review and edit the generated subtitles</p>
                </div>

                <SubtitleEditor subtitles={subtitles} onSubtitlesChange={updateSubtitles} />
              </div>
            </Card>

            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Step 3: Configure Output</h2>
                  <p className="text-muted-foreground">Choose aspect ratio and subtitle style</p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Output Format</label>
                  <AspectRatioSelector selected={aspectRatio} onChange={setAspectRatio} />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Subtitle Style</label>
                  <TemplateSelector
                    selectedTemplate={selectedTemplate}
                    onTemplateChange={setTemplate}
                  />
                </div>

                <BrandKitSettings brandKit={brandKit} onBrandKitChange={setBrandKit} />

                <div className="flex gap-4">
                  <Button
                    onClick={() => renderVideo(brandKit ?? undefined)}
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
                <h2 className="text-2xl font-semibold mb-2">Step 4: Download Your Video</h2>
                <p className="text-muted-foreground">Your video with subtitles is ready!</p>
              </div>

              <div className="flex flex-col gap-4">
                <video
                  src={renderedVideoUrl}
                  controls
                  className="w-full max-w-2xl mx-auto rounded-lg border"
                />

                <div className="flex flex-col gap-4 items-center">
                  <div className="flex gap-4">
                    <Button size="lg" asChild>
                      <a href={renderedVideoUrl} download>
                        Download Video
                      </a>
                    </Button>
                    <Button onClick={resetState} variant="outline" size="lg">
                      Generate Another Video
                    </Button>
                  </div>

                  {subtitles.length > 0 && (
                    <div className="flex gap-3">
                      <Button size="sm" variant="secondary" onClick={() => downloadSrt(subtitles)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export SRT
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => downloadVtt(subtitles)}>
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        Export VTT
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
