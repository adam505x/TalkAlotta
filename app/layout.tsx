import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TalkAlotta',
  description: 'Adaptive AAC communication boards that learn with the communicator.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'TalkAlotta',
    statusBarStyle: 'default',
  },
  other: {
    // Next renders the modern `mobile-web-app-capable` for appleWebApp.capable
    // and no longer emits the Apple-prefixed one. Safari still reads the legacy
    // name, and without it an icon added to the Home Screen can open in a normal
    // tab with the address bar showing. Belt and braces alongside the
    // manifest's display: standalone.
    'apple-mobile-web-app-capable': 'yes',
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
