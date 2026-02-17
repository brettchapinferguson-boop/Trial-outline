import './globals.css'
import { Metadata } from 'next'
import Providers from '@/components/providers'

export const metadata: Metadata = {
  title: 'TrialOutline - AI-Powered Examination Outlines',
  description: 'Generate professional witness examination outlines with AI. Upload case documents, get chapter-method cross and direct examination outlines.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
