import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, Query } from '@/lib/appwrite-server'
import { ID } from 'node-appwrite'
import type { IndicatorConfig } from '@/types/alerts'
import { DEFAULT_INDICATORS, DEFAULT_USER_ID } from '@/types/alerts'

const DATABASE_ID = 'raceday-db'
const COLLECTION_ID = 'user-alert-configs'

/**
 * GET /api/user-alert-configs?userId=Default%20User
 * Load user alert configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || DEFAULT_USER_ID

    const { databases } = await createServerClient()

    // Query for all indicators for this user
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

    // If no indicators found, create defaults
    if (indicators.length === 0) {
      const defaultIndicators = await createDefaultIndicators(databases, userId)
      return NextResponse.json({
        userId,
        indicators: defaultIndicators,
        toggleAll: true,
        audibleAlertsEnabled: true,
      })
    }

    // Check if we have all 6 indicators, create missing ones
    const existingOrders = indicators.map(ind => ind.displayOrder)
    const missingOrders = [1, 2, 3, 4, 5, 6].filter(order => !existingOrders.includes(order))

    if (missingOrders.length > 0) {
      const missingIndicators = await createMissingIndicators(databases, userId, missingOrders)
      indicators.push(...missingIndicators)
      indicators.sort((a, b) => a.displayOrder - b.displayOrder)
    }

    // Calculate toggleAll state (true if all are enabled)
    const toggleAll = indicators.every(ind => ind.enabled)
    const audibleAlertsEnabled =
      indicators[0]?.audibleAlertsEnabled ?? true

    return NextResponse.json({
      userId,
      indicators,
      toggleAll,
      audibleAlertsEnabled,
    })
  } catch (error) {
    console.error('Failed to load user alert config:', error)
    return NextResponse.json(
      { error: 'Failed to load alert configuration' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user-alert-configs
 * Save user alert configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId = DEFAULT_USER_ID,
      indicators,
      audibleAlertsEnabled = true,
    } = body

    if (!indicators || !Array.isArray(indicators)) {
      return NextResponse.json(
        { error: 'Invalid indicators data' },
        { status: 400 }
      )
    }

    const { databases } = await createServerClient()

    // Update each indicator
    const updatePromises = indicators.map(async (indicator: IndicatorConfig) => {
      const updateData = {
        enabled: indicator.enabled,
        color: indicator.color,
        isDefault: indicator.isDefault,
        lastUpdated: new Date().toISOString(),
        audibleAlertsEnabled,
      }

      if (indicator.$id) {
        // Update existing indicator
        return databases.updateDocument(DATABASE_ID, COLLECTION_ID, indicator.$id, updateData)
      } else {
        // Create new indicator
        const createData = {
          ...updateData,
          userId: indicator.userId,
          indicatorType: indicator.indicatorType,
          percentageRangeMin: indicator.percentageRangeMin,
          percentageRangeMax: indicator.percentageRangeMax,
          displayOrder: indicator.displayOrder,
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled,
        }
        return databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), createData)
      }
    })

    await Promise.all(updatePromises)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save user alert config:', error)
    return NextResponse.json(
      { error: 'Failed to save alert configuration' },
      { status: 500 }
    )
  }
}


// Helper function to create default indicators for a new user
async function createDefaultIndicators(databases: any, userId: string): Promise<IndicatorConfig[]> {
  const createPromises = DEFAULT_INDICATORS.map(async (defaultConfig) => {
    const createData = {
      userId,
      indicatorType: defaultConfig.indicatorType,
      percentageRangeMin: defaultConfig.percentageRangeMin,
      percentageRangeMax: defaultConfig.percentageRangeMax,
      color: defaultConfig.color,
      isDefault: defaultConfig.isDefault,
      enabled: defaultConfig.enabled,
      displayOrder: defaultConfig.displayOrder,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      audibleAlertsEnabled: true,
    }

    const doc = await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), createData)
    return doc as unknown as IndicatorConfig
  })

  return Promise.all(createPromises)
}

// Helper function to create missing indicators
async function createMissingIndicators(databases: any, userId: string, missingOrders: number[]): Promise<IndicatorConfig[]> {
  const createPromises = missingOrders.map(async (order) => {
    const defaultConfig = DEFAULT_INDICATORS[order - 1] // Convert to 0-based index

    const createData = {
      userId,
      indicatorType: defaultConfig.indicatorType,
      percentageRangeMin: defaultConfig.percentageRangeMin,
      percentageRangeMax: defaultConfig.percentageRangeMax,
      color: defaultConfig.color,
      isDefault: defaultConfig.isDefault,
      enabled: defaultConfig.enabled,
      displayOrder: defaultConfig.displayOrder,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      audibleAlertsEnabled: true,
    }

    const doc = await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), createData)
    return doc as unknown as IndicatorConfig
  })

  return Promise.all(createPromises)
}
