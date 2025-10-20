import { act, renderHook, waitFor } from '@testing-library/react'
import { useAudibleRaceAlerts } from '../useAudibleRaceAlerts'
import { fetchUpcomingRaces } from '@/services/upcomingRacesService'
import type { Race } from '@/types/meetings'

jest.mock('@/services/upcomingRacesService')

const mockFetchUpcomingRaces =
  fetchUpcomingRaces as jest.MockedFunction<typeof fetchUpcomingRaces>

const baseTime = new Date('2025-01-01T00:00:00.000Z')

class MockAudio {
  public src: string
  public preload = ''
  public currentTime = 0
  constructor(src: string) {
    this.src = src
  }
  play() {
    return Promise.resolve()
  }
  pause() {
    return undefined
  }
  load() {
    return undefined
  }
}

const buildRace = (overrides: Partial<Race> = {}): Race => ({
  $id: overrides.$id ?? 'race-doc-1',
  $createdAt: overrides.$createdAt ?? baseTime.toISOString(),
  $updatedAt: overrides.$updatedAt ?? baseTime.toISOString(),
  race_id: overrides.race_id ?? 'race-1',
  race_number: overrides.race_number ?? 1,
  name: overrides.name ?? 'Test Race',
  start_time: overrides.start_time ?? new Date(baseTime.getTime() + 120_000).toISOString(),
  meeting: overrides.meeting ?? 'meeting-1',
  status: overrides.status ?? 'Open',
})

describe('useAudibleRaceAlerts', () => {
  beforeAll(() => {
    // @ts-expect-error - assign test stub
    global.Audio = MockAudio
  })

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(baseTime)
    jest.clearAllMocks()
    mockFetchUpcomingRaces.mockImplementation(async (options) => {
      const race = buildRace()
      return options?.filter ? [race].filter(options.filter) : [race]
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('plays audio one minute before race start when enabled', async () => {
    const playSpy = jest.spyOn(MockAudio.prototype, 'play')

    renderHook(() => useAudibleRaceAlerts({ enabled: true }))

    await waitFor(() => expect(mockFetchUpcomingRaces).toHaveBeenCalled())

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(playSpy).toHaveBeenCalledTimes(1)
    playSpy.mockRestore()
  })

  it('does not play audio when disabled', async () => {
    const playSpy = jest.spyOn(MockAudio.prototype, 'play')

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAudibleRaceAlerts({ enabled }),
      { initialProps: { enabled: true } }
    )

    await waitFor(() => expect(mockFetchUpcomingRaces).toHaveBeenCalled())

    rerender({ enabled: false })

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(playSpy).not.toHaveBeenCalled()
    playSpy.mockRestore()
  })

  it('respects filter predicate when scheduling alerts', async () => {
    const playSpy = jest.spyOn(MockAudio.prototype, 'play')

    renderHook(() =>
      useAudibleRaceAlerts({
        enabled: true,
        filterRace: () => false,
      })
    )

    await waitFor(() => expect(mockFetchUpcomingRaces).toHaveBeenCalled())

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(playSpy).not.toHaveBeenCalled()
    playSpy.mockRestore()
  })
})
