'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Textarea } from '@workspace/ui/components/textarea';
import { ViralClipsList } from '@/components/viral-clips-list';
import { useContentAnalysis } from '@/lib/hooks/useContentAnalysis';
import { useState } from 'react';
import { toast } from 'sonner';

const SAMPLE_TRANSCRIPT = `[00:00 - 00:15] Hey everyone! Did you know that 90% of people who start a YouTube channel quit within the first year? But I'm going to show you the one secret that changed everything for me.

[00:15 - 00:45] So here's what most people don't understand about growing on YouTube. It's not about uploading every single day. It's not about having the fanciest equipment. It's about understanding the algorithm and giving it exactly what it wants.

[00:45 - 01:20] Last month, I tried something different. Instead of posting random videos, I analyzed the top 100 videos in my niche. I found three patterns that every single viral video had in common. First, they all started with a hook in the first 3 seconds. Second, they maintained curiosity throughout. And third, they had a clear payoff at the end.

[01:20 - 01:45] Once I implemented these three things, my channel exploded. I went from 500 views per video to over 100,000 in just one month. My subscriber count tripled. And the best part? I was spending less time creating content because I knew exactly what worked.

[01:45 - 02:10] Now, you might be thinking "But my niche is different" - and you're right. Every niche is unique. But these principles apply universally. Whether you're doing gaming, cooking, or business content, the psychology of human attention remains the same.

[02:10 - 02:30] Here's what you need to do right now. Go watch the top 10 videos in your niche. Write down what they do in the first 3 seconds. Notice how they keep you watching. Study their titles and thumbnails. This research phase is crucial.

[02:30 - 02:50] And remember, success on YouTube isn't about luck. It's about understanding what works and consistently applying it. If you want more tips like this, make sure to subscribe and I'll see you in the next video!`;

export default function ContentIntelligencePage() {
  const [transcript, setTranscript] = useState('');
  const { analyzeContent, isAnalyzing, analysis, error, reset } = useContentAnalysis({
    onSuccess: (data) => {
      console.log('Analysis completed:', data);
    },
    onError: (error) => {
      console.error('Analysis failed:', error);
    },
  });

  const handleAnalyze = async () => {
    if (!transcript.trim()) {
      toast.warning('Please enter a transcript to analyze');
      return;
    }
    await analyzeContent(transcript);
  };

  const loadSampleTranscript = () => {
    setTranscript(SAMPLE_TRANSCRIPT);
    reset();
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Content Intelligence Module</h1>
        <p className="text-gray-600">
          AI-powered viral clip detection for short-form content
        </p>
        <div className="flex gap-2 mt-3">
          <Badge variant="outline">GPT-4o</Badge>
          <Badge variant="outline">Vercel AI SDK</Badge>
          <Badge variant="outline">Zod Validation</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Input Transcript</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSampleTranscript}
                  disabled={isAnalyzing}
                >
                  Load Sample
                </Button>
              </div>
              <Textarea
                placeholder="Paste your video transcript here... Include timestamps like [00:00 - 00:15] for better results."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                disabled={isAnalyzing}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !transcript.trim()}
                className="flex-1"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Content'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTranscript('');
                  reset();
                }}
                disabled={isAnalyzing}
              >
                Clear
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-semibold">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Info Section */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">1. AI Analysis</h3>
              <p>
                GPT-4o acts as an expert video editor, analyzing your transcript
                to find engaging segments with viral potential.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-1">2. Viral Criteria</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Strong hooks that grab attention</li>
                <li>Complete thoughts (30-90 seconds)</li>
                <li>Emotional impact and shareability</li>
                <li>Clear conclusions or payoffs</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-1">3. Structured Output</h3>
              <p>
                Using Zod validation, we ensure the AI returns clean JSON data
                with timestamps, scores, and explanations.
              </p>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-gray-900 mb-2">Viral Score Guide</h3>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 bg-green-500 rounded"></div>
                  <span>90-100: Extremely Viral</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 bg-blue-500 rounded"></div>
                  <span>70-89: High Potential</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 bg-yellow-500 rounded"></div>
                  <span>50-69: Good Potential</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 bg-orange-500 rounded"></div>
                  <span>30-49: Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 bg-red-500 rounded"></div>
                  <span>0-29: Low Potential</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Results Section */}
      {analysis && (
        <div className="mt-8">
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-2">Analysis Summary</h2>
            <p className="text-gray-700">{analysis.analysis_summary}</p>
            <div className="flex gap-2 mt-3">
              <Badge>Total Clips: {analysis.total_clips}</Badge>
              <Badge variant="outline">
                Avg Score:{' '}
                {(
                  analysis.clips.reduce((acc, clip) => acc + clip.viral_score, 0) /
                  analysis.clips.length
                ).toFixed(1)}
              </Badge>
            </div>
          </Card>

          <ViralClipsList
            clips={analysis.clips}
            onClipSelect={(clip) => {
              console.log('Selected clip:', clip);
              // In a real app, this could trigger video player to jump to timestamp
            }}
          />
        </div>
      )}
    </div>
  );
}
