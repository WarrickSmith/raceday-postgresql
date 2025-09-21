'use client'

import type { ReactNode } from 'react'
import { AudibleAlertProvider } from '@/contexts/AudibleAlertContext'
import { SubscriptionCleanupProvider } from '@/contexts/SubscriptionCleanupContext'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SubscriptionCleanupProvider>
      <AudibleAlertProvider>{children}</AudibleAlertProvider>
    </SubscriptionCleanupProvider>
  )
}
