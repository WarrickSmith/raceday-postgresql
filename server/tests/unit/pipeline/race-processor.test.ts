/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RaceData } from '../../../src/clients/nztab-types.js'
import type {
  TransformedEntrant,
  TransformedMeeting,
  TransformedRace,
} from '../../../src/workers/messages.js'
import type { OddsRecord } from '../../../src/database/time-series.js'

type BulkResult = Promise<{ rowCount: number; duration: number }>

const fetchRaceDataMock = vi.fn<(raceId: string) => Promise<RaceData | null>>()
const workerExecMock = vi.fn<(data: RaceData) => Promise<TransformedRace>>()
const bulkUpsertMeetingsMock = vi.fn<(meetings: TransformedMeeting[]) => BulkResult>()
const bulkUpsertRacesMock = vi.fn<(races: NonNullable<TransformedRace['race']>[] ) => BulkResult>()
const bulkUpsertEntrantsMock = vi.fn<(entrants: TransformedEntrant[]) => BulkResult>()
const insertMoneyFlowHistoryMock = vi.fn<(records: TransformedRace['moneyFlowRecords']) => BulkResult>()
const insertOddsHistoryMock = vi.fn<(records: OddsRecord[]) => BulkResult>()

const clientsModulePromise = vi.importActual<
  typeof import('../../../src/clients/nztab.js')
>('../../../src/clients/nztab.js')

const bulkModulePromise = vi.importActual<
  typeof import('../../../src/database/bulk-upsert.js')
>('../../../src/database/bulk-upsert.js')

const timeSeriesModulePromise = vi.importActual<
  typeof import('../../../src/database/time-series.js')
>('../../../src/database/time-series.js')

vi.mock('../../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../../src/clients/nztab.js', async () => {
  const actual = await clientsModulePromise
  return {
    ...actual,
    fetchRaceData: fetchRaceDataMock,
  }
})

vi.mock('../../../src/workers/worker-pool.js', () => ({
  workerPool: {
    exec: workerExecMock,
  },
}))

vi.mock('../../../src/database/bulk-upsert.js', async () => {
  const actual = await bulkModulePromise

  return {
    ...actual,
    bulkUpsertMeetings: bulkUpsertMeetingsMock,
    bulkUpsertRaces: bulkUpsertRacesMock,
    bulkUpsertEntrants: bulkUpsertEntrantsMock,
  }
})

vi.mock('../../../src/database/time-series.js', async () => {
  const actual = await timeSeriesModulePromise

  return {
    ...actual,
    insertMoneyFlowHistory: insertMoneyFlowHistoryMock,
    insertOddsHistory: insertOddsHistoryMock,
  }
})

const { NzTabError } = await clientsModulePromise
const { DatabaseWriteError, TransactionError } = await bulkModulePromise
const { PartitionNotFoundError } = await timeSeriesModulePromise

const {
  processRace,
  FetchError,
  TransformError,
  WriteError,
} = await import('../../../src/pipeline/race-processor.js')
const { logger } = await import('../../../src/shared/logger.js')

describe('processRace', () => {
  const raceId = 'race-123'
  const raceData: RaceData = {
    id: raceId,
    name: 'Test Race',
    status: 'open',
    race_date_nz: '2025-10-13',
    start_time_nz: '12:00',
  }

const transformedRace: TransformedRace = {
    raceId,
    raceName: 'Test Race',
    status: 'open',
    transformedAt: '2025-10-13T00:00:00.000Z',
    metrics: {
      entrantCount: 1,
      poolFieldCount: 1,
      moneyFlowRecordCount: 1,
    },
    meeting: {
      meeting_id: 'meeting-1',
      name: 'Sample Meeting',
      date: '2025-10-13',
      country: 'NZ',
      category: 'R',
      track_condition: 'GOOD',
      tote_status: 'open',
    },
    race: {
      race_id: raceId,
      name: 'Test Race',
      status: 'open',
      race_number: 1,
      race_date_nz: '2025-10-13',
      start_time_nz: '12:00',
      meeting_id: 'meeting-1',
    },
    entrants: [
      {
        entrant_id: 'entrant-1',
        race_id: raceId,
        runner_number: 1,
        name: 'Runner 1',
        barrier: null,
        is_scratched: false,
        is_late_scratched: null,
        fixed_win_odds: 2.5,
        fixed_place_odds: null,
        pool_win_odds: 3.1,
        pool_place_odds: null,
        hold_percentage: 0.5,
        bet_percentage: null,
        win_pool_percentage: null,
        place_pool_percentage: null,
        win_pool_amount: 1000,
        place_pool_amount: 500,
        favourite: false,
        mover: false,
        jockey: null,
        trainer_name: null,
        silk_colours: null,
      },
    ],
    moneyFlowRecords: [
      {
        entrant_id: 'entrant-1',
        race_id: raceId,
        time_to_start: 10,
        time_interval: 5,
        interval_type: '5m',
        polling_timestamp: '2025-10-13T11:50:00.000Z',
        hold_percentage: 0.5,
        bet_percentage: null,
        win_pool_percentage: null,
        place_pool_percentage: null,
        win_pool_amount: 1000,
        place_pool_amount: 500,
        total_pool_amount: 1500,
        incremental_win_amount: 100,
        incremental_place_amount: 50,
        fixed_win_odds: 2.5,
        fixed_place_odds: null,
        pool_win_odds: 3.1,
        pool_place_odds: null,
      },
    ],
    originalPayload: raceData,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchRaceDataMock.mockReset()
    workerExecMock.mockReset()
    bulkUpsertMeetingsMock.mockReset()
    bulkUpsertRacesMock.mockReset()
    bulkUpsertEntrantsMock.mockReset()
    insertMoneyFlowHistoryMock.mockReset()
    insertOddsHistoryMock.mockReset()
  })

  it('runs fetch → transform → write sequentially and returns success result', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0) // pipeline start
      .mockReturnValueOnce(0) // fetch start
      .mockReturnValueOnce(300) // fetch end
      .mockReturnValueOnce(300) // transform start
      .mockReturnValueOnce(1000) // transform end
      .mockReturnValueOnce(1000) // write start
      .mockReturnValueOnce(1200) // write end
      .mockReturnValueOnce(1200) // total

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(transformedRace)
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 45 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 55 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 3, duration: 75 })
    insertMoneyFlowHistoryMock.mockResolvedValue({ rowCount: 1, duration: 65 })
    insertOddsHistoryMock.mockResolvedValue({ rowCount: 2, duration: 35 })

    const result = await processRace(raceId)

    expect(fetchRaceDataMock).toHaveBeenCalledWith(raceId)
    expect(workerExecMock).toHaveBeenCalledWith(raceData)
    expect(bulkUpsertMeetingsMock).toHaveBeenCalledOnce()
    expect(bulkUpsertRacesMock).toHaveBeenCalledOnce()
    expect(bulkUpsertEntrantsMock).toHaveBeenCalledOnce()
    expect(insertMoneyFlowHistoryMock).toHaveBeenCalledOnce()
    expect(insertOddsHistoryMock).toHaveBeenCalledOnce()

    expect(result).toMatchObject({
      raceId,
      status: 'success',
      success: true,
      timings: {
        fetch_ms: 300,
        transform_ms: 700,
        write_ms: 200,
        total_ms: 1200,
      },
      rowCounts: {
        meetings: 1,
        races: 1,
        entrants: 3,
        moneyFlowHistory: 1,
        oddsHistory: 2,
      },
    })

    const [fetchOrder] = fetchRaceDataMock.mock.invocationCallOrder
    const [transformOrder] = workerExecMock.mock.invocationCallOrder
    const [writeOrder] = bulkUpsertEntrantsMock.mock.invocationCallOrder

    if (fetchOrder === undefined || transformOrder === undefined || writeOrder === undefined) {
      throw new Error('Expected invocation order indices to be recorded')
    }

    expect(fetchOrder).toBeLessThan(transformOrder)
    expect(transformOrder).toBeLessThan(writeOrder)

    perfSpy.mockRestore()
  })

  it('marks pipeline over budget when total duration ≥ 2000ms', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(800)
      .mockReturnValueOnce(800)
      .mockReturnValueOnce(2200)
      .mockReturnValueOnce(2200)

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(transformedRace)
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 0, duration: 10 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 0, duration: 10 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 0, duration: 10 })
    insertMoneyFlowHistoryMock.mockResolvedValue({ rowCount: 0, duration: 10 })
    insertOddsHistoryMock.mockResolvedValue({ rowCount: 0, duration: 10 })

    await processRace(raceId)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pipeline_over_budget',
        total_ms: 2200,
        raceId,
      }),
      expect.stringContaining('exceeded 2s budget')
    )

    perfSpy.mockRestore()
  })

  it('short-circuits when fetch returns null', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(150)
      .mockReturnValueOnce(150)

    fetchRaceDataMock.mockResolvedValue(null)

    const result = await processRace(raceId)

    expect(result.status).toBe('skipped')
    expect(result.success).toBe(false)
    expect(result.rowCounts).toEqual({
      meetings: 0,
      races: 0,
      entrants: 0,
      moneyFlowHistory: 0,
      oddsHistory: 0,
    })
    expect(workerExecMock).not.toHaveBeenCalled()
    expect(bulkUpsertEntrantsMock).not.toHaveBeenCalled()

    perfSpy.mockRestore()
  })

  it('wraps fetch failures in FetchError with retryable flag', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)

    const nzError = new NzTabError('timeout', undefined, undefined, true)
    fetchRaceDataMock.mockRejectedValue(nzError)

    let captured: unknown
    try {
      await processRace(raceId)
      throw new Error('Expected fetch failure')
    } catch (error) {
      captured = error
    }

    if (!(captured instanceof FetchError)) {
      throw captured instanceof Error ? captured : new Error(String(captured))
    }
    const typed = captured
    expect(typed.retryable).toBe(true)
    expect(typed.result.status).toBe('failed')
    expect(typed.result.error).toMatchObject({
      type: 'fetch',
      message: 'timeout',
      retryable: true,
    })

    perfSpy.mockRestore()
  })

  it('wraps transform failures in TransformError and stops pipeline', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(180)

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockRejectedValue(new Error('transform boom'))

    let captured: unknown
    try {
      await processRace(raceId)
      throw new Error('Expected transform failure')
    } catch (error) {
      captured = error
    }

    if (!(captured instanceof TransformError)) {
      throw captured instanceof Error ? captured : new Error(String(captured))
    }
    const typed = captured
    expect(typed.retryable).toBe(false)
    expect(typed.result.status).toBe('failed')
    expect(typed.result.error).toMatchObject({
      type: 'transform',
      message: 'transform boom',
      retryable: false,
    })

    expect(bulkUpsertEntrantsMock).not.toHaveBeenCalled()

    perfSpy.mockRestore()
  })

  it('wraps write failures in WriteError and surfaces retryable metadata', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(260)
      .mockReturnValueOnce(260)

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(transformedRace)
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertEntrantsMock.mockRejectedValue(
      new DatabaseWriteError('db fail', raceId, undefined, true)
    )

    let captured: unknown
    try {
      await processRace(raceId)
      throw new Error('Expected write failure')
    } catch (error) {
      captured = error
    }

    if (!(captured instanceof WriteError)) {
      throw captured instanceof Error ? captured : new Error(String(captured))
    }
    const typed = captured
    expect(typed.retryable).toBe(true)
    expect(typed.result.status).toBe('failed')
    expect(typed.result.error).toMatchObject({
      type: 'write',
      message: 'db fail',
      retryable: true,
    })

    expect(insertMoneyFlowHistoryMock).not.toHaveBeenCalled()
    expect(insertOddsHistoryMock).not.toHaveBeenCalled()

    perfSpy.mockRestore()
  })

  it('treats PartitionNotFoundError as non-retryable WriteError', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(250)
      .mockReturnValueOnce(250)

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(transformedRace)
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    insertMoneyFlowHistoryMock.mockRejectedValue(
      new PartitionNotFoundError('money_flow_history', 'money_flow_history_2025_10_13', '2025-10-13T11:50:00.000Z')
    )

    let captured: unknown
    try {
      await processRace(raceId)
      throw new Error('Expected partition failure')
    } catch (error) {
      captured = error
    }

    if (!(captured instanceof WriteError)) {
      throw captured instanceof Error ? captured : new Error(String(captured))
    }
    const typed = captured
    expect(typed.retryable).toBe(false)
    expect(typed.result.status).toBe('failed')
    expect(typed.result.error).toMatchObject({
      type: 'write',
      retryable: false,
    })

    expect(insertOddsHistoryMock).not.toHaveBeenCalled()

    perfSpy.mockRestore()
  })

  it('wraps TransactionError as WriteError with retryable=false', async () => {
    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(230)
      .mockReturnValueOnce(230)

    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(transformedRace)
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 10 })
    bulkUpsertEntrantsMock.mockRejectedValue(
      new TransactionError('transaction failed', raceId)
    )

    let captured: unknown
    try {
      await processRace(raceId)
      throw new Error('Expected transaction failure')
    } catch (error) {
      captured = error
    }

    if (!(captured instanceof WriteError)) {
      throw captured instanceof Error ? captured : new Error(String(captured))
    }
    const typed = captured
    expect(typed.retryable).toBe(false)
    expect(typed.result.error).toMatchObject({ retryable: false, type: 'write' })

    perfSpy.mockRestore()
  })
})
