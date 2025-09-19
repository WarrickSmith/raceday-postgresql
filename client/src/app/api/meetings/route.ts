import { NextResponse } from 'next/server';
import { getMeetingsData } from '@/server/meetings-data';

export async function GET() {
  try {
    const meetings = await getMeetingsData();

    return NextResponse.json({
      meetings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}