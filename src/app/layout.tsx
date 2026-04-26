import type { Metadata } from 'next'
import './globals.css'
import { AuthGate } from '@/components/auth/AuthGate'

export const metadata: Metadata = {
  title: 'Planr',
  description: '나만의 주간 플래너',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  )
}
