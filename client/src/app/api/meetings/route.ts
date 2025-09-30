import { NextRequest } from 'next/server';
import { getMeetingsData } from '@/server/meetings-data';
import { jsonWithCompression } from '@/lib/http/compression';

export async function GET(request: NextRequest) {
  try {
    const meetings = await getMeetingsData();

    return jsonWithCompression(request, {
      meetings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return jsonWithCompression(
      request,
      { error: 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}
