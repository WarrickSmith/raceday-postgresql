import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import { jsonWithCompression } from '@/lib/http/compression'

interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  database?: string
  workers?: string
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    const payload = await apiClient.get<HealthResponse>('/health', {
      cache: 'no-store',
    })

    return jsonWithCompression(request, payload, { status: 200 })
  } catch (error) {
    const fallback: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error:
        error instanceof ApiError
          ? `${error.status} ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unknown error contacting health endpoint',
    }

    const status = error instanceof ApiError ? error.status : 503

    return jsonWithCompression(request, fallback, { status })
  }
}
