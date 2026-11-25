import { workspacePage } from '@/server/auth/page-policy';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Plantillas · Video Wizard' };
export default workspacePage('/templates', async (user, { searchParams }) => {
  const { entry } = await searchParams;
  return (
    <LibraryBrowser
      key={user.id}
      kind="template"
      initialId={typeof entry === 'string' ? entry : undefined}
    />
  );
});
