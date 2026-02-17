import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'TrialOutline - AI-Powered Examination Outlines',
  description: 'Generate witness examination outlines with AI',
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
