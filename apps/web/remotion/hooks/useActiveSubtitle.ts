import {
  useActiveSubtitle as useSharedSubtitle,
  type SubtitleSegment,
} from '@workspace/remotion-compositions';

export function useActiveSubtitle(subtitles: SubtitleSegment[], currentTime: number) {
  return useSharedSubtitle(subtitles, currentTime, 0);
}
