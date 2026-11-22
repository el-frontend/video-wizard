import { workspacePage } from '@/server/auth/page-policy';
import { ShortsWorkspace } from '@/features/studio-shorts/components/shorts-workspace';
export const metadata = { title: 'Shorts · Video Wizard' };
export default workspacePage('/shorts', async (user) => {
  return <ShortsWorkspace key={user.id} />;
});
