#!/usr/bin/env node

/**
 * Example: Using the Remotion Render Server
 * 
 * This script demonstrates how to:
 * 1. Create a render job
 * 2. Poll for job status
 * 3. Download the rendered video
 */

const SERVER_URL = 'http://localhost:3001';

/**
 * Creates a new render job
 */
async function createRenderJob() {
  console.log('📹 Creating render job...');

  const response = await fetch(`${SERVER_URL}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      compositionId: 'VideoWithSubtitles',
      inputProps: {
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        subtitles: [
          {
            id: 1,
            start: 0,
            end: 3,
            text: 'Welcome to the Remotion Render Server',
          },
          {
            id: 2,
            start: 3,
            end: 6,
            text: 'Create amazing videos with AI-powered subtitles',
          },
          {
            id: 3,
            start: 6,
            end: 9,
            text: 'Choose from multiple professional templates',
          },
          {
            id: 4,
            start: 9,
            end: 12,
            text: 'Perfect for social media content',
          },
        ],
        template: 'viral', // Try: 'default', 'viral', 'minimal', 'modern'
        backgroundColor: '#000000',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create render job: ${response.statusText}`);
  }

  const { jobId } = await response.json();
  console.log(`✅ Job created: ${jobId}`);

  return jobId;
}

/**
 * Polls for job status until completion
 */
async function waitForJobCompletion(jobId) {
  console.log('⏳ Waiting for render to complete...');

  while (true) {
    const response = await fetch(`${SERVER_URL}/renders/${jobId}`);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const job = await response.json();

    if (job.status === 'completed') {
      console.log('✅ Render completed!');
      console.log(`📥 Download: ${job.videoUrl}`);
      return job;
    }

    if (job.status === 'failed') {
      console.error('❌ Render failed:', job.error);
      throw new Error(job.error.message);
    }

    if (job.status === 'in-progress') {
      const progressPercent = Math.round(job.progress * 100);
      console.log(`⏳ Progress: ${progressPercent}%`);
    }

    // Wait 2 seconds before next check
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🎬 Remotion Render Server Example\n');

    // Check if server is running
    try {
      const health = await fetch(`${SERVER_URL}/health`);
      if (!health.ok) {
        throw new Error('Server is not healthy');
      }
      console.log('✅ Server is running\n');
    } catch (error) {
      console.error('❌ Server is not running. Please start it with: cd apps/remotion-server && pnpm dev');
      process.exit(1);
    }

    // Create render job
    const jobId = await createRenderJob();

    // Wait for completion
    const result = await waitForJobCompletion(jobId);

    console.log('\n🎉 Success! Your video is ready.');
    console.log(`\nTo view the video, open: ${result.videoUrl}`);
    console.log(`Or check the renders directory: apps/remotion-server/renders/${jobId}.mp4`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
