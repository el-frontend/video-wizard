import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@workspace/ui/components/sonner';
import '@workspace/ui/styles/globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './studio.css';

const geist = localFont({
  src: '../../../packages/style-packs/packs/fonts/Geist-variable.woff2',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap',
});
const mono = localFont({
  src: '../../../packages/style-packs/packs/fonts/GeistMono-variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});
const headings = localFont({
  src: '../../../packages/style-packs/packs/fonts/Bricolage-800.woff2',
  variable: '--font-studio-heading',
  weight: '200 800',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Video Wizard - AI-Powered Video Analysis',
  description: 'Transform your videos into viral content with AI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${mono.variable} ${headings.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased dark">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <div className="flex h-screen overflow-hidden">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto ml-64">
              <div className="container mx-auto p-6">{children}</div>
            </main>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
