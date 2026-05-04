import { History } from 'lucide-react';
import { redirect } from 'next/navigation';

import { Badge } from '@workspace/ui/components/badge';
import { Card } from '@workspace/ui/components/card';

import { auth } from '@/auth';
import {
  type Job,
  type JobStatus,
  type JobType,
  jobHistoryService,
} from '@/server/services/job-history-service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Job History · Video Wizard',
};

const TYPE_LABELS: Record<JobType, string> = {
  transcription: 'Transcription',
  render: 'Render',
  clip_creation: 'Clip',
  analysis: 'Analysis',
};

const STATUS_VARIANTS: Record<JobStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  queued: 'outline',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

interface JobsPageProps {
  searchParams: Promise<{ type?: string; status?: string }>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/signin?callbackUrl=/jobs');
  }

  const { type, status } = await searchParams;

  const items = await jobHistoryService.listByUser(session.user.id, {
    type: isJobType(type) ? type : undefined,
    status: isJobStatus(status) ? status : undefined,
    limit: 100,
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <History className="text-primary h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job History</h1>
          <p className="text-muted-foreground text-sm">
            Every transcription, analysis, render and clip you have run.
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No jobs yet. Start a transcription, analysis or render and it will show up here.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Progress</th>
                  <th className="px-4 py-3 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3">
        <span className="font-medium">{TYPE_LABELS[job.type]}</span>
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANTS[job.status]}>{job.status}</Badge>
      </td>
      <td className="text-muted-foreground px-4 py-3">{formatDateTime(job.createdAt)}</td>
      <td className="text-muted-foreground px-4 py-3">
        {formatDuration(job.startedAt, job.completedAt)}
      </td>
      <td className="px-4 py-3">
        <ProgressCell progress={job.progress} status={job.status} />
      </td>
      <td className="text-muted-foreground max-w-md px-4 py-3">
        {job.status === 'failed' && job.errorMessage ? (
          <span className="text-destructive line-clamp-2 text-xs">{job.errorMessage}</span>
        ) : (
          <span className="line-clamp-1 text-xs">{summarizeInput(job.inputData)}</span>
        )}
      </td>
    </tr>
  );
}

function ProgressCell({ progress, status }: { progress: number; status: JobStatus }) {
  if (status === 'completed') {
    return <span className="text-muted-foreground text-xs">100%</span>;
  }
  if (status === 'failed' || status === 'cancelled') {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
        <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-muted-foreground text-xs">{progress}%</span>
    </div>
  );
}

function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '—';
  const obj = input as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.template === 'string') parts.push(`template: ${obj.template}`);
  if (typeof obj.aspectRatio === 'string') parts.push(`ratio: ${obj.aspectRatio}`);
  if (typeof obj.language === 'string') parts.push(`lang: ${obj.language}`);
  if (typeof obj.subtitleCount === 'number') parts.push(`${obj.subtitleCount} segs`);
  if (typeof obj.transcriptLength === 'number') parts.push(`${obj.transcriptLength} chars`);
  if (typeof obj.videoPath === 'string') {
    const filename = obj.videoPath.split(/[\\/]/).pop();
    if (filename) parts.push(filename);
  }
  return parts.join(' · ') || '—';
}

function isJobType(value: string | undefined): value is JobType {
  return (
    value === 'transcription' ||
    value === 'render' ||
    value === 'clip_creation' ||
    value === 'analysis'
  );
}

function isJobStatus(value: string | undefined): value is JobStatus {
  return (
    value === 'pending' ||
    value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  );
}
