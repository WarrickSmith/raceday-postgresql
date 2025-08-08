import { notFound } from 'next/navigation';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting } from '@/types/meetings';

interface RaceDetailPageProps {
  params: {
    id: string;
  };
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
  
  const formatTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) {
        return 'TBA';
      }
      return date.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return 'TBA';
    }
  };

  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className="max-w-4xl mx-auto">
        {/* Race Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <span>{meeting.country}</span>
              <span>•</span>
              <span>{meeting.meetingName}</span>
              <span>•</span>
              <time dateTime={race.startTime}>
                {formatTime(race.startTime)}
              </time>
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Race {race.raceNumber}: {race.name}
            </h1>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Race ID:</span>
                <span className="ml-2 text-sm font-mono text-gray-700">{race.raceId}</span>
              </div>
              
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Status:</span>
                <span 
                  className={`ml-2 px-3 py-1 rounded-full text-sm font-medium ${
                    race.status === 'Open' ? 'bg-green-100 text-green-800' :
                    race.status === 'Closed' ? 'bg-yellow-100 text-yellow-800' :
                    race.status === 'Running' ? 'bg-blue-100 text-blue-800' :
                    race.status === 'Finalized' ? 'bg-gray-100 text-gray-800' :
                    'bg-gray-100 text-gray-600'
                  }`}
                  role="status"
                  aria-label={`Race status: ${race.status}`}
                >
                  {race.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Race Details Placeholder */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Race Details</h2>
          <div className="text-gray-600">
            <p className="mb-2">
              <strong>Meeting:</strong> {meeting.meetingName} ({meeting.country})
            </p>
            <p className="mb-2">
              <strong>Race Type:</strong> {meeting.raceType}
            </p>
            <p className="mb-2">
              <strong>Start Time:</strong> {formatTime(race.startTime)}
            </p>
            <p className="mb-4">
              <strong>Current Status:</strong> {race.status}
            </p>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800 text-sm">
                <strong>Note:</strong> Detailed race information including entrants and additional data will be available in future updates.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}