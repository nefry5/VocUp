import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VocUp — Apprends le vocabulaire',
  description: 'Application gamifiée pour apprendre le vocabulaire en anglais, allemand, espagnol et italien.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VocUp',
  },
}

export const viewport: Viewport = {
  themeColor: '#0e0920',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
