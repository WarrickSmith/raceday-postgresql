import { Suspense } from 'react';
import { ClientRaceView } from '@/components/ClientRaceView';
import { RaceDetailSkeleton } from '@/components/race-view/RaceDetailSkeleton';

interface RaceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RaceDetailPage({ params }: RaceDetailPageProps) {
  const { id } = await params;
  
  return (
    <Suspense fallback={<RaceDetailSkeleton />}>
      <ClientRaceView raceId={id} />
    </Suspense>
  );
}