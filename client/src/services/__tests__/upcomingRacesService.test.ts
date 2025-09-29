jest.mock('@/state/connectionState', () => ({
  isConnectionHealthy: jest.fn(),
  ensureConnection: jest.fn(),
}))

jest.mock('@/lib/appwrite-client', () => ({
  databases: {
    listDocuments: jest.fn(),
  },
  Query: {
    greaterThan: jest.fn(),
    lessThanEqual: jest.fn(),
    notEqual: jest.fn(),
    orderAsc: jest.fn(),
    limit: jest.fn(),
  },
}))

import { fetchUpcomingRaces } from '../upcomingRacesService'
import { databases } from '@/lib/appwrite-client'
import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'

const mockListDocuments = databases.listDocuments as jest.MockedFunction<typeof databases.listDocuments>
const mockIsConnectionHealthy = isConnectionHealthy as jest.MockedFunction<typeof isConnectionHealthy>
const mockEnsureConnection = ensureConnection as jest.MockedFunction<typeof ensureConnection>

describe('fetchUpcomingRaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsConnectionHealthy.mockReturnValue(true)
    mockEnsureConnection.mockResolvedValue(true)
  })

  it('returns an empty array without querying when connection is unavailable', async () => {
    mockIsConnectionHealthy.mockReturnValue(false)
    mockEnsureConnection.mockResolvedValue(false)

    const result = await fetchUpcomingRaces()

    expect(result).toEqual([])
    expect(mockEnsureConnection).toHaveBeenCalled()
    expect(mockListDocuments).not.toHaveBeenCalled()
  })
})
