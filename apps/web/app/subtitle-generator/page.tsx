import { SubtitleGeneratorContainer } from '@/features/video/containers/subtitle-generator-container';

export const metadata = {
  title: 'Subtitle Generator | Video Wizard',
  description: 'Generate and render subtitles for your videos with customizable templates',
};

export default function SubtitleGeneratorPage() {
  return <SubtitleGeneratorContainer />;
}
