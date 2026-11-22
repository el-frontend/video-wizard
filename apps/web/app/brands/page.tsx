import { workspacePage } from '@/server/auth/page-policy';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Marcas · Video Wizard' };
export default workspacePage('/brands', async (user, { searchParams }) => {
  const { entry } = await searchParams;
  return (
    <LibraryBrowser
      key={user.id}
      kind="brand"
      initialId={typeof entry === 'string' ? entry : undefined}
    />
  );
});
