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
    <html lang="es" className={`${geist.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="antialiased dark">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
