import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { AlertsConfig, IndicatorConfig } from '@/types/alerts'
import { DEFAULT_USER_ID, validateIndicatorConfig } from '@/types/alerts'
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
  created_at?: string
  updated_at?: string
}

interface ServerAlertsConfig {
  user_id: string
  indicators: ServerIndicator[]
  toggle_all: boolean
  audible_alerts_enabled: boolean
}

const toClientIndicator = (indicator: ServerIndicator): IndicatorConfig => ({
  indicator_id: indicator.indicator_id ?? undefined,
  user_id: indicator.user_id,
  indicator_type: indicator.indicator_type,
  percentage_range_min: indicator.percentage_range_min,
  percentage_range_max: indicator.percentage_range_max,
  color: indicator.color,
  is_default: indicator.is_default,
  enabled: indicator.enabled,
  display_order: indicator.display_order,
  created_at: indicator.created_at,
  last_updated: indicator.updated_at,
  audible_alerts_enabled: indicator.audible_alerts_enabled ?? true,
})

const toClientConfig = (config: ServerAlertsConfig): AlertsConfig => ({
  user_id: config.user_id,
  indicators: config.indicators.map(toClientIndicator),
  toggle_all: config.toggle_all,
  audible_alerts_enabled: config.audible_alerts_enabled,
})

const toServerIndicator = (
  indicator: IndicatorConfig,
  fallbackUserId: string
): ServerIndicator => ({
  indicator_id: indicator.indicator_id ?? null,
  user_id: indicator.user_id ?? fallbackUserId,
  indicator_type: indicator.indicator_type,
  percentage_range_min: indicator.percentage_range_min,
  percentage_range_max: indicator.percentage_range_max,
  color: indicator.color,
  is_default: indicator.is_default,
  enabled: indicator.enabled,
  display_order: indicator.display_order,
  audible_alerts_enabled: indicator.audible_alerts_enabled ?? true,
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') ?? DEFAULT_USER_ID

    const payload = await apiClient.get<ServerAlertsConfig>(
      '/api/user-alert-configs',
      {
        params: { userId },
        cache: 'no-store',
      }
    )

    return jsonWithCompression(request, toClientConfig(payload))
  } catch (error) {
    console.error('Failed to load user alert config:', error)

    const status = error instanceof ApiError ? error.status : 500
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to load alert configuration'

    return jsonWithCompression(
      request,
      { error: message },
      { status }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AlertsConfig
    const {
      user_id = DEFAULT_USER_ID,
      indicators,
      audible_alerts_enabled = true,
      toggle_all = true,
    } = body

    if (!Array.isArray(indicators) || indicators.length === 0) {
      return jsonWithCompression(
        request,
        { error: 'Invalid indicators data' },
        { status: 400 }
      )
    }

    const validationErrors = indicators.flatMap(validateIndicatorConfig)
    if (validationErrors.length > 0) {
      return jsonWithCompression(
        request,
        { error: validationErrors.join('; ') },
        { status: 400 }
      )
    }

    await apiClient.post('/api/user-alert-configs', {
      user_id: user_id,
      indicators: indicators.map((indicator) =>
        toServerIndicator(indicator, user_id)
      ),
      audible_alerts_enabled: audible_alerts_enabled,
      toggle_all: toggle_all,
    })

    return jsonWithCompression(request, { success: true })
  } catch (error) {
    console.error('Failed to save user alert config:', error)

    const status = error instanceof ApiError ? error.status : 500
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to save alert configuration'

    return jsonWithCompression(
      request,
      { error: message },
      { status }
    )
  }
}
