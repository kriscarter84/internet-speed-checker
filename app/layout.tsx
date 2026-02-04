import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Speed Test - Measure Your Internet Speed',
  description: 'Professional browser-based internet speed test measuring ping, jitter, download, and upload speeds',
  manifest: '/manifest.json',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
  themeColor: '#4A90E2',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Speed Test',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
