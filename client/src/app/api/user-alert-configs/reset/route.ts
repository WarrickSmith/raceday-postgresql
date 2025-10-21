import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { AlertsConfig } from '@/types/alerts'
import { DEFAULT_INDICATORS, DEFAULT_USER_ID } from '@/types/alerts'
import { jsonWithCompression } from '@/lib/http/compression'

interface ServerIndicator {
  indicator_id: string | null
  user_id: string
  indicator_type: 'percentage_range'
  percentage_range_min: number
  percentage_range_max: number | null
  color: string
  is_default: boolean
  enabled: boolean
  display_order: number
  audible_alerts_enabled?: boolean
}

interface ServerAlertsConfig {
  user_id: string
  indicators: ServerIndicator[]
  toggle_all: boolean
  audible_alerts_enabled: boolean
}

const toClientConfig = (config: ServerAlertsConfig): AlertsConfig => ({
  user_id: config.user_id,
  indicators: config.indicators.map((indicator) => ({
    indicator_id: indicator.indicator_id ?? undefined,
    user_id: indicator.user_id,
    indicator_type: indicator.indicator_type,
    percentage_range_min: indicator.percentage_range_min,
    percentage_range_max: indicator.percentage_range_max,
    color: indicator.color,
    is_default: indicator.is_default,
    enabled: indicator.enabled,
    display_order: indicator.display_order,
    audible_alerts_enabled: indicator.audible_alerts_enabled ?? true,
  })),
  toggle_all: config.toggle_all,
  audible_alerts_enabled: config.audible_alerts_enabled,
})

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const userId =
      typeof body?.userId === 'string' && body.userId.trim().length > 0
        ? body.userId.trim()
        : DEFAULT_USER_ID

    const payload: ServerAlertsConfig = {
      user_id: userId,
      indicators: DEFAULT_INDICATORS.map((indicator, index) => ({
        indicator_id: null,
        user_id: userId,
        indicator_type: indicator.indicator_type,
        percentage_range_min: indicator.percentage_range_min,
        percentage_range_max: indicator.percentage_range_max,
        color: indicator.color,
        is_default: true,
        enabled: true,
        display_order: indicator.display_order ?? index + 1,
        audible_alerts_enabled: true,
      })),
      audible_alerts_enabled: true,
      toggle_all: true,
    }

    await apiClient.post('/api/user-alert-configs', payload)

    const updated = await apiClient.get<ServerAlertsConfig>(
      '/api/user-alert-configs',
      {
        params: { userId },
        cache: 'no-store',
      }
    )

    return jsonWithCompression(request, toClientConfig(updated))
  } catch (error) {
    console.error('Failed to reset alert configuration:', error)

    const status = error instanceof ApiError ? error.status : 500
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to reset configuration'

    return jsonWithCompression(
      request,
      { error: message },
      { status }
    )
  }
}
