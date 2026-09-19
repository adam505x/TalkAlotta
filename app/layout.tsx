import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TalkAlotta',
  description: 'Adaptive AAC communication boards that learn with the communicator.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'TalkAlotta',
    statusBarStyle: 'default',
  },
};

// viewportFit: 'cover' plus userScalable: false is what makes the
// add-to-homescreen build feel like an app and stops a stray pinch or
// double-tap zooming the board mid-use.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="kiosk min-h-dvh">{children}</body>
    </html>
  );
}
