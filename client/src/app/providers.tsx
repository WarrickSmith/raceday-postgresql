'use client'

import type { ReactNode } from 'react'
import { AudibleAlertProvider } from '@/contexts/AudibleAlertContext'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AudibleAlertProvider>{children}</AudibleAlertProvider>
  )
}
