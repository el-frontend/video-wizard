# Remotion Compositions

Shared Remotion video compositions for the Video Wizard monorepo.

## Features

- 📹 **VideoWithSubtitles**: Main composition for rendering videos with synchronized subtitles
- 🎨 **Multiple Templates**: default, viral, minimal, modern
- 📝 **Word-level Timing**: Support for precise word synchronization
- 🎬 **Customizable**: Props-based configuration for flexibility

## Compositions

### VideoWithSubtitles

Main composition that combines video and subtitles with template selection.

**Props:**
```typescript
{
  videoUrl: string;           // Source video URL
  subtitles: SubtitleSegment[]; // Subtitle data with timing
  template: 'default' | 'viral' | 'minimal' | 'modern';
  backgroundColor?: string;   // Background color (default: #000000)
  videoStartTime?: number;    // Start offset in source video
}
```

## Templates

### Default Template
Clean, professional design with text at the bottom of the screen. Suitable for most content types.

### Viral Template
High-impact design optimized for social media shorts (TikTok, Instagram Reels). Features:
- Large text chunks
- Yellow highlight backgrounds
- Word-by-word animations
- Bottom positioning

### Minimal Template
Ultra-clean design with minimal styling. Perfect for professional or educational content.

### Modern Template
Contemporary design with gradient accents and smooth animations. Modern typography and effects.

## Usage

### In Remotion Studio

```bash
cd packages/remotion-compositions
pnpm studio
```

### In Render Server

Compositions are automatically bundled and used by the render server at `apps/remotion-server`.

### Programmatically

```typescript
import { renderMedia, selectComposition } from '@remotion/renderer';

const composition = await selectComposition({
  serveUrl: bundleUrl,
  id: 'VideoWithSubtitles',
  inputProps: {
    videoUrl: 'https://example.com/video.mp4',
    subtitles: [
      { id: 1, start: 0, end: 2, text: 'Hello World' }
    ],
    template: 'viral',
  },
});

await renderMedia({
  composition,
  serveUrl: bundleUrl,
  outputLocation: './output.mp4',
});
```

## Development

All compositions use TypeScript and follow strict type safety with Zod schemas.

## Structure

```
packages/remotion-compositions/
├── src/
│   ├── index.ts              # Entry point
│   ├── Root.tsx              # Composition registry
│   ├── types.ts              # TypeScript types
│   ├── compositions/         # Main composition components
│   │   ├── VideoComposition.tsx
│   │   └── CaptionOverlay.tsx
│   ├── templates/            # Caption templates
│   │   ├── DefaultTemplate.tsx
│   │   ├── ViralTemplate.tsx
│   │   ├── MinimalTemplate.tsx
│   │   └── ModernTemplate.tsx
│   └── hooks/                # React hooks
│       └── useActiveSubtitle.ts
├── package.json
├── tsconfig.json
└── README.md
```

## License

See LICENSE in the root of the monorepo.
