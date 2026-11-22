import { workspacePage } from '@/server/auth/page-policy';
import { AssetBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Recursos · Video Wizard' };
export default workspacePage('/assets', async (user) => {
  return <AssetBrowser key={user.id} />;
});
