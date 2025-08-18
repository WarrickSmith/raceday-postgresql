'use client';

import { RaceProvider } from '@/contexts/RaceContext';

interface RaceLayoutProps {
  children: React.ReactNode;
}

export default function RaceLayout({ children }: RaceLayoutProps) {
  return (
    <RaceProvider initialData={null}>
      {children}
    </RaceProvider>
  );
}