jest.mock('@/state/connectionState', () => ({
  isConnectionHealthy: jest.fn(),
  ensureConnection: jest.fn(),
}))

import { fetchUpcomingRaces } from '../upcomingRacesService'
import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'

const mockIsConnectionHealthy = isConnectionHealthy as jest.MockedFunction<typeof isConnectionHealthy>
const mockEnsureConnection = ensureConnection as jest.MockedFunction<typeof ensureConnection>
const originalFetch = global.fetch

describe('fetchUpcomingRaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsConnectionHealthy.mockReturnValue(true)
    mockEnsureConnection.mockResolvedValue(true)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ races: [], total: 0, timestamp: new Date().toISOString() }),
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns an empty array without querying when connection is unavailable', async () => {
    mockIsConnectionHealthy.mockReturnValue(false)
    mockEnsureConnection.mockResolvedValue(false)

    const result = await fetchUpcomingRaces()

    expect(result).toEqual([])
    expect(mockEnsureConnection).toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
