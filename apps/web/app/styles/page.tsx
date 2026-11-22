import { workspacePage } from '@/server/auth/page-policy';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Estilos · Video Wizard' };
export default workspacePage('/styles', async (user, { searchParams }) => {
  const { entry } = await searchParams;
  return (
    <LibraryBrowser
      key={user.id}
      kind="style"
      initialId={typeof entry === 'string' ? entry : undefined}
    />
  );
});
