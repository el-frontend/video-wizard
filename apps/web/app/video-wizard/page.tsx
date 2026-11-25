import { workspacePage } from '@/server/auth/page-policy';
import { VideoContainer } from '@/features/video/containers/video-container';

/**
 * Video Wizard Page
 *
 * Server component that renders the video processing feature
 */
export default workspacePage('/video-wizard', (user) => {
  return <VideoContainer ownerId={user.id} />;
});
