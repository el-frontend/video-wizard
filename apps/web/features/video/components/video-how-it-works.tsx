'use client';

import { Card } from '@workspace/ui/components/card';

/**
 * Video How It Works Component
 * 
 * Informational component explaining the video processing workflow
 */
export function VideoHowItWorks() {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-3">How does it work?</h3>
      <div className="space-y-3 text-sm">
        <div className="flex gap-3">
          <span className="text-2xl">📤</span>
          <div>
            <p className="font-semibold">1. Upload your video</p>
            <p>Select any video from your computer (max. 5GB)</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-2xl">🎙️</span>
          <div>
            <p className="font-semibold">2. Automatic extraction</p>
            <p>The system extracts audio and generates subtitles with precise timestamps</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <p className="font-semibold">3. AI analysis</p>
            <p>GPT-4o identifies the most viral segments for YouTube Shorts, TikTok, and Instagram Reels</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-2xl">🎬</span>
          <div>
            <p className="font-semibold">4. Get your clips</p>
            <p>Receive a list of recommended clips with scores and detailed analysis</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
