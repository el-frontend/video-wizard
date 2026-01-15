'use client';

import { Badge } from '@workspace/ui/components/badge';

interface VideoHeaderProps {
  title?: string;
  description?: string;
  badges?: string[];
}

/**
 * Video Header Component
 * 
 * Header section for the video feature
 */
export function VideoHeader({
  title = 'Video Wizard 🎬',
  description = 'Upload your video, extract subtitles, and discover viral clips automatically',
  badges = ['Automatic transcription', 'AI analysis', 'Viral clips'],
}: VideoHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-bold mb-2">{title}</h1>
      <p className="text-gray-600">{description}</p>
      <div className="flex gap-2 mt-3">
        {badges.map((badge) => (
          <Badge key={badge} variant="outline">
            {badge}
          </Badge>
        ))}
      </div>
    </div>
  );
}
