import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, Query } from '@/lib/appwrite-server'
import type { IndicatorConfig } from '@/types/alerts'
import { DEFAULT_INDICATORS, DEFAULT_USER_ID } from '@/types/alerts'

const DATABASE_ID = 'raceday-db'
const COLLECTION_ID = 'user-alert-configs'

/**
 * PUT /api/user-alert-configs/reset
 * Reset user configuration to defaults
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId = DEFAULT_USER_ID } = body

    const { databases } = await createServerClient()

    // Get current config
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [
        Query.equal('userId', userId),
        Query.equal('indicatorType', 'percentage_range'),
        Query.orderAsc('displayOrder')
      ]
    )

    const indicators = response.documents as unknown as IndicatorConfig[]

    // Reset each indicator to default values
    const resetPromises = indicators.map(async (indicator, index) => {
      const defaultConfig = DEFAULT_INDICATORS[index]
      const updateData = {
        color: defaultConfig.color,
        enabled: true,
        isDefault: true,
        lastUpdated: new Date().toISOString(),
      }

      return databases.updateDocument(DATABASE_ID, COLLECTION_ID, indicator.$id!, updateData)
    })

    await Promise.all(resetPromises)

    // Return updated config
    const updatedResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [
        Query.equal('userId', userId),
        Query.equal('indicatorType', 'percentage_range'),
        Query.orderAsc('displayOrder')
      ]
    )

    const updatedIndicators = updatedResponse.documents as unknown as IndicatorConfig[]

    return NextResponse.json({
      userId,
      indicators: updatedIndicators,
      toggleAll: true,
    })
  } catch (error) {
    console.error('Failed to reset to defaults:', error)
    return NextResponse.json(
      { error: 'Failed to reset configuration' },
      { status: 500 }
    )
  }
}