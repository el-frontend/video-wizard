import Link from 'next/link';
import { Video, Sparkles, Film, ArrowRight, Subtitles } from 'lucide-react';

/**
 * Dashboard Home Page
 * Welcome screen with quick access to main features
 */
export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Welcome to Video Wizard
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Transform your videos into viral content with AI-powered analysis and editing tools.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Video Wizard Card */}
        <Link href="/video-wizard" className="group">
          <div className="rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Video className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Video Wizard</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Upload videos, extract subtitles, and generate viral clips with AI analysis.
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              <span>Get started</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>

        {/* Content Intelligence Card */}
        <Link href="/content-intelligence" className="group">
          <div className="rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Content Intelligence</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              AI-powered content analysis, viral score prediction, and engagement insights.
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              <span>Explore</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>

        {/* Subtitle Generator Card */}
        <Link href="/subtitle-generator" className="group">
          <div className="rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Subtitles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Subtitle Generator</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Generate and render beautiful subtitles with AI transcription and customizable templates.
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              <span>Create subtitles</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>

        {/* Remotion Studio Card */}
        <Link href="/remotion" className="group">
          <div className="rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Film className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Remotion Studio</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Advanced video composition engine for programmatic video generation.
            </p>
            <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
              <span>Launch studio</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">0</div>
          <div className="text-sm text-muted-foreground">Videos Processed</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">0</div>
          <div className="text-sm text-muted-foreground">Clips Generated</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold text-foreground">0</div>
          <div className="text-sm text-muted-foreground">Hours Saved</div>
        </div>
      </div>
    </div>
  );
}
