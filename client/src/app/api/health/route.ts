import { NextResponse } from 'next/server';
import { AppwriteException } from 'node-appwrite';
import { createServerClient, Query } from '@/lib/appwrite-server';

interface HealthResponse {
  status: 'healthy' | 'unconfigured' | 'unhealthy';
  timestamp: string;
  uptime?: number;
  error?: string;
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const hasRequiredEnv = Boolean(
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT &&
        process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID &&
        process.env.APPWRITE_API_KEY
    );

    if (!hasRequiredEnv) {
      const body: HealthResponse = {
        status: 'unconfigured',
        timestamp,
      };

      return NextResponse.json(body, { status: 200 });
    }

    const { databases } = await createServerClient();

    await databases.listDocuments('raceday-db', 'meetings', [Query.limit(1)]);

    const body: HealthResponse = {
      status: 'healthy',
      timestamp,
      uptime: process.uptime(),
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    let errorMessage = 'Unknown error';

    if (error instanceof AppwriteException) {
      errorMessage = `${error.code ?? 'Appwrite'}: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    const body: HealthResponse = {
      status: 'unhealthy',
      timestamp,
      error: errorMessage,
    };

    return NextResponse.json(body, { status: 503 });
  }
}
