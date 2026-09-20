import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito_Sans } from 'next/font/google';
import './globals.css';

/**
 * The brand sheet pairs Fredoka for the brand and headings with Nunito Sans for
 * running text. Both are self-hosted by next/font, so a demo iPad on venue wifi
 * never waits on a font CDN.
 */
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-brand',
  display: 'swap',
});

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-text',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TalkAlotta',
  description: 'Adaptive AAC communication boards that learn with the communicator.',
  manifest: '/manifest.webmanifest',
  // The Home Screen icon. Without a real PNG, iOS screenshots the page instead.
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'TalkAlotta',
    // 'black-translucent' lets the board run under the status bar, which is what
    // the safe-area padding in globals.css is there to keep clear of.
    statusBarStyle: 'black-translucent',
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`, but iOS before 17 only
    // understands the Apple-prefixed one, and that is the version that decides
    // whether the browser bars show. Harmless on newer iOS, which uses the
    // manifest's display mode instead.
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
  themeColor: '#1c1f24',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunitoSans.variable}`}>
      <body className="kiosk min-h-dvh">{children}</body>
    </html>
  );
}
