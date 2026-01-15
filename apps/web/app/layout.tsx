import { AppSidebar } from "@/components/layout/app-sidebar";
import "@workspace/ui/styles/globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";

const notoSans = Noto_Sans({ variable: '--font-sans', subsets: ['latin'] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Video Wizard - AI-Powered Video Analysis",
  description: "Transform your videos into viral content with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${notoSans.variable}`} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      >
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto ml-64">
            <div className="container mx-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
