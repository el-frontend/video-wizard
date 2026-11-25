import { workspacePage } from '@/server/auth/page-policy';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Componentes · Video Wizard' };
export default workspacePage('/components', async (user, { searchParams }) => {
  const { entry } = await searchParams;
  return (
    <LibraryBrowser
      key={user.id}
      kind="component"
      initialId={typeof entry === 'string' ? entry : undefined}
    />
  );
});
