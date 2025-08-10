import { notFound } from 'next/navigation';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting } from '@/types/meetings';
import { RaceHeader } from '@/components/race-view/RaceHeader';

interface RaceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getRaceById(raceId: string): Promise<{ race: Race; meeting: Meeting } | null> {
  try {
    const { databases } = await createServerClient();
    
    // Fetch race by raceId field (not $id)
    const raceQuery = await databases.listDocuments(
      'raceday-db', 
      'races',
      [Query.equal('raceId', raceId), Query.limit(1)]
    );

    if (!raceQuery.documents.length) {
      return null;
    }

    const raceData = raceQuery.documents[0];
    
    // Validate that meeting data is populated
    if (!raceData.meeting || !raceData.meeting.meetingId) {
      return null;
    }

    // The race already has the meeting data populated as a nested object
    // Convert to our expected format
    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId,
      raceNumber: raceData.raceNumber,
      name: raceData.name,
      startTime: raceData.startTime,
      meeting: raceData.meeting.meetingId, // Extract the meetingId for the Race interface
      status: raceData.status,
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
    };

    const meeting: Meeting = {
      $id: raceData.meeting.$id,
      $createdAt: raceData.meeting.$createdAt,
      $updatedAt: raceData.meeting.$updatedAt,
      meetingId: raceData.meeting.meetingId,
      meetingName: raceData.meeting.meetingName,
      country: raceData.meeting.country,
      raceType: raceData.meeting.raceType,
      category: raceData.meeting.category,
      date: raceData.meeting.date,
    };
    
    return { race, meeting };
  } catch (error) {
    console.error('Error fetching race details:', error);
    return null;
  }
}

export default async function RaceDetailPage({ params }: RaceDetailPageProps) {
  const { id } = await params;
  const raceData = await getRaceById(id);
  
  if (!raceData) {
    notFound();
  }

  const { race, meeting } = raceData;

  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className="max-w-4xl mx-auto">
        {/* Race Header */}
        <RaceHeader initialRace={race} meeting={meeting} />

        {/* Future Features Placeholder */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800 text-sm">
              <strong>Coming Soon:</strong> Detailed entrant information, odds, and form guide will be available in future updates.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}