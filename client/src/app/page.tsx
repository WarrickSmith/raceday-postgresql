import { Suspense } from 'react';
import { Metadata } from 'next';
import { getMeetingsData } from '@/server/meetings-data';
import { MeetingsListClient } from '@/components/dashboard/MeetingsListClient';
import { MeetingsListSkeleton } from '@/components/skeletons/MeetingCardSkeleton';

export const metadata: Metadata = {
  title: "Race Day - Today's Meetings",
  description: 'View today&apos;s race meetings in chronological order with real-time updates',
  keywords: ['horse racing', 'harness racing', 'Australia', 'New Zealand', 'race meetings'],
};

// Enable static rendering with revalidation
export const revalidate = 300; // 5 minutes

async function MeetingsServerComponent() {
  const meetings = await getMeetingsData();
  
  return <MeetingsListClient initialData={meetings} />;
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Race Day Dashboard
          </h1>
          <p className="mt-2 text-gray-600">
            Today&apos;s race meetings and races
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
          <Suspense fallback={<MeetingsListSkeleton />}>
            <MeetingsServerComponent />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
