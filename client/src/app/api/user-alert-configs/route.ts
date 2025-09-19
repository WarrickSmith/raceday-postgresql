import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, Query } from '@/lib/appwrite-server'
import { ID } from 'node-appwrite'
import type { Databases, Models } from 'node-appwrite'
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

    const indicators = response.documents.map((document) =>
      mapDocumentToIndicator(document as Models.Document)
    )

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
          userId: indicator.userId ?? userId,
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
async function createDefaultIndicators(
  databases: Databases,
  userId: string
): Promise<IndicatorConfig[]> {
  const createPromises = DEFAULT_INDICATORS.map(async (defaultConfig) => {
    const timestamp = new Date().toISOString()
    const indicatorId = ID.unique()

    const createPayload: Omit<IndicatorConfig, '$id'> = {
      userId,
      indicatorType: defaultConfig.indicatorType,
      percentageRangeMin: defaultConfig.percentageRangeMin,
      percentageRangeMax: defaultConfig.percentageRangeMax,
      color: defaultConfig.color,
      isDefault: defaultConfig.isDefault,
      enabled: defaultConfig.enabled,
      displayOrder: defaultConfig.displayOrder,
      createdAt: timestamp,
      lastUpdated: timestamp,
      audibleAlertsEnabled: true,
    }

    await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      indicatorId,
      createPayload
    )

    return { $id: indicatorId, ...createPayload }
  })

  return Promise.all(createPromises)
}

// Helper function to create missing indicators
async function createMissingIndicators(
  databases: Databases,
  userId: string,
  missingOrders: number[]
): Promise<IndicatorConfig[]> {
  const createPromises = missingOrders.map(async (order) => {
    const defaultConfig = DEFAULT_INDICATORS[order - 1]
    if (!defaultConfig) {
      throw new Error(`Missing default indicator configuration for order ${order}`)
    }

    const timestamp = new Date().toISOString()
    const indicatorId = ID.unique()

    const createPayload: Omit<IndicatorConfig, '$id'> = {
      userId,
      indicatorType: defaultConfig.indicatorType,
      percentageRangeMin: defaultConfig.percentageRangeMin,
      percentageRangeMax: defaultConfig.percentageRangeMax,
      color: defaultConfig.color,
      isDefault: defaultConfig.isDefault,
      enabled: defaultConfig.enabled,
      displayOrder: defaultConfig.displayOrder,
      createdAt: timestamp,
      lastUpdated: timestamp,
      audibleAlertsEnabled: true,
    }

    await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      indicatorId,
      createPayload
    )

    return { $id: indicatorId, ...createPayload }
  })

  return Promise.all(createPromises)
}

function mapDocumentToIndicator(document: Models.Document): IndicatorConfig {
  // Cast document to safely access dynamic properties from Appwrite
  const doc = document as Record<string, unknown>

  const percentageRangeMaxValue =
    doc.percentageRangeMax === null || doc.percentageRangeMax === undefined
      ? null
      : Number(doc.percentageRangeMax)

  return {
    $id: document.$id,
    userId:
      typeof doc.userId === 'string' ? doc.userId : DEFAULT_USER_ID,
    indicatorType: 'percentage_range',
    percentageRangeMin: Number(doc.percentageRangeMin ?? 0),
    percentageRangeMax: percentageRangeMaxValue,
    color:
      typeof doc.color === 'string'
        ? doc.color
        : DEFAULT_INDICATORS[0].color,
    isDefault: Boolean(doc.isDefault),
    enabled: Boolean(doc.enabled),
    displayOrder: Number(doc.displayOrder ?? 1),
    lastUpdated:
      typeof doc.lastUpdated === 'string' ? doc.lastUpdated : undefined,
    createdAt: typeof doc.$createdAt === 'string' ? doc.$createdAt : undefined,
    audibleAlertsEnabled:
      typeof doc.audibleAlertsEnabled === 'boolean'
        ? doc.audibleAlertsEnabled
        : undefined,
  }
}
