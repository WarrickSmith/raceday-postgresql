/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fetchMeetingsForDateMock = vi.fn()
const fetchRaceDataMock = vi.fn()
const bulkUpsertMeetingsMock = vi.fn()
const bulkUpsertRacesMock = vi.fn()
const bulkUpsertEntrantsMock = vi.fn()

vi.mock('../../../src/clients/nztab.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/clients/nztab.js')>(
    '../../../src/clients/nztab.js'
  )
  return {
    ...actual,
    fetchMeetingsForDate: fetchMeetingsForDateMock,
    fetchRaceData: fetchRaceDataMock,
  }
})

vi.mock('../../../src/database/bulk-upsert.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/database/bulk-upsert.js')>(
    '../../../src/database/bulk-upsert.js'
  )
  return {
    ...actual,
    bulkUpsertMeetings: bulkUpsertMeetingsMock,
    bulkUpsertRaces: bulkUpsertRacesMock,
    bulkUpsertEntrants: bulkUpsertEntrantsMock,
  }
})

const { runDailyBaselineInitialization } = await import(
  '../../../src/initialization/daily-baseline.js'
)

const meetingFixture = {
  meeting: 'meeting-unit-1',
  name: 'Ellerslie',
  date: '2025-10-14T18:00:00Z',
  track_condition: 'Good',
  category: 'R',
  category_name: 'Thoroughbred',
  country: 'NZ',
  state: 'NZ',
  tote_status: 'open',
  races: [
    {
      id: 'race-unit-1',
      race_number: 1,
      name: 'Race 1',
      start_time: '2025-10-14T19:00:00Z',
      status: 'open',
    },
    {
      id: 'race-unit-2',
      race_number: 2,
      name: 'Race 2',
      start_time: '2025-10-14T19:30:00Z',
      status: 'open',
    },
  ],
}

const createRacePayload = (raceId: string, raceNumber: number) => ({
  id: raceId,
  name: `Race ${String(raceNumber)}`,
  status: 'open' as const,
  race_date_nz: '2025-10-15',
  start_time_nz: `${String(6 + raceNumber - 1).padStart(2, '0')}:00:00 NZST`,
  race_number: raceNumber,
  meeting_id: meetingFixture.meeting,
  meeting: meetingFixture,
  entrants: [
    {
      entrantId: `${raceId}-entrant-1`,
      runnerNumber: 1,
      name: `Runner ${String(raceNumber)}-1`,
      barrier: 1,
      isScratched: false,
      fixedWinOdds: 3.5,
      fixedPlaceOdds: 1.5,
      poolWinOdds: 3.4,
      poolPlaceOdds: 1.4,
      jockey: 'Jockey 1',
      trainerName: 'Trainer 1',
      favourite: raceNumber === 1,
    },
    {
      entrantId: `${raceId}-entrant-2`,
      runnerNumber: 2,
      name: `Runner ${String(raceNumber)}-2`,
      barrier: 2,
      isScratched: false,
      fixedWinOdds: 4.2,
      fixedPlaceOdds: 1.8,
      poolWinOdds: 4.0,
      poolPlaceOdds: 1.7,
      jockey: 'Jockey 2',
      trainerName: 'Trainer 2',
      favourite: false,
    },
  ],
})

beforeEach(() => {
  fetchMeetingsForDateMock.mockReset()
  fetchRaceDataMock.mockReset()
  bulkUpsertMeetingsMock.mockReset()
  bulkUpsertRacesMock.mockReset()
  bulkUpsertEntrantsMock.mockReset()
})

describe('daily baseline initialization (unit)', () => {
  it('fetches meetings and races, upserts entities, and returns stats', async () => {
    fetchMeetingsForDateMock.mockResolvedValue([meetingFixture])
    fetchRaceDataMock.mockImplementation((raceId: string) => {
      if (raceId === 'race-unit-1') {
        return Promise.resolve(createRacePayload('race-unit-1', 1))
      }
      if (raceId === 'race-unit-2') {
        return Promise.resolve(createRacePayload('race-unit-2', 2))
      }
      throw new Error(`Unexpected race id ${raceId}`)
    })

    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 5 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 2, duration: 7 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 4, duration: 11 })

    const result = await runDailyBaselineInitialization({ reason: 'unit-test' })

    expect(result.success).toBe(true)
    expect(result.stats.meetingsFetched).toBe(1)
    expect(result.stats.meetingsWritten).toBe(1)
    expect(result.stats.racesFetched).toBe(2)
    expect(result.stats.racesCreated).toBe(2)
    expect(result.stats.entrantsPopulated).toBe(4)
    expect(result.stats.failedRaces).toEqual([])
    expect(result.stats.failedMeetings).toEqual([])
    expect(result.stats.retries).toBe(0)

    expect(bulkUpsertMeetingsMock).toHaveBeenCalledTimes(1)
    expect(bulkUpsertRacesMock).toHaveBeenCalledTimes(1)
    expect(bulkUpsertEntrantsMock).toHaveBeenCalledTimes(1)

    const [[racesArg]] = bulkUpsertRacesMock.mock.calls as [
      [Record<string, unknown>[]]
    ]
    expect(racesArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          race_id: 'race-unit-1',
          race_date_nz: '2025-10-15',
          start_time_nz: '06:00',
        }),
        expect.objectContaining({
          race_id: 'race-unit-2',
          race_date_nz: '2025-10-15',
          start_time_nz: '07:00',
        }),
      ])
    )
  })

  it('records failed races and retries while continuing processing', async () => {
    fetchMeetingsForDateMock.mockResolvedValue([meetingFixture])
    fetchRaceDataMock.mockImplementation((raceId: string) => {
      if (raceId === 'race-unit-1') {
        return Promise.resolve(createRacePayload('race-unit-1', 1))
      }
      return Promise.reject(new Error('Injected failure'))
    })

    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 5 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 7 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 2, duration: 11 })

    const result = await runDailyBaselineInitialization({ reason: 'unit-failure' })

    expect(result.success).toBe(true)
    expect(result.stats.racesFetched).toBe(1)
    expect(result.stats.racesCreated).toBe(1)
    expect(result.stats.entrantsPopulated).toBe(2)
    expect(result.stats.failedRaces).toEqual(['race-unit-2'])
    expect(result.stats.failedMeetings).toEqual([meetingFixture.meeting])
    expect(result.stats.retries).toBe(1)
  })
})
