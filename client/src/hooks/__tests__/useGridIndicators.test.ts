import { computeIndicatorMatrix } from '@/hooks/useGridIndicators'
import type { Entrant } from '@/types/meetings'
import type { IndicatorConfig } from '@/types/alerts'
import type { EntrantMoneyFlowTimeline } from '@/types/moneyFlow'
import { DEFAULT_INDICATORS } from '@/types/alerts'

type PartialEntrant = Pick<
  Entrant,
  '$id' | '$createdAt' | '$updatedAt' | 'entrantId' | 'name' | 'runnerNumber' | 'isScratched'
>

const buildEntrant = (overrides: PartialEntrant): Entrant => ({
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  jockey: undefined,
  trainerName: undefined,
  weight: undefined,
  silkUrl: undefined,
  silkColours: undefined,
  silkUrl64: undefined,
  silkUrl128: undefined,
  race: 'race-id',
  entrantId: overrides.entrantId,
  name: overrides.name,
  runnerNumber: overrides.runnerNumber,
  isScratched: overrides.isScratched,
  $id: overrides.$id,
}) as Entrant

const indicatorConfigs: IndicatorConfig[] = DEFAULT_INDICATORS.map((indicator, index) => ({
  ...indicator,
  $id: `indicator-${index}`,
  userId: 'test-user',
  lastUpdated: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
}))

const createTimelinePoint = (
  entrant: string,
  interval: number,
  values: Partial<EntrantMoneyFlowTimeline['dataPoints'][number]>
): EntrantMoneyFlowTimeline['dataPoints'][number] => ({
  $id: `${entrant}-${interval}`,
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  entrant,
  pollingTimestamp: '2024-01-01T00:00:00.000Z',
  timeToStart: interval,
  timeInterval: interval,
  winPoolAmount: 0,
  placePoolAmount: 0,
  totalPoolAmount: 0,
  poolPercentage: 0,
  incrementalAmount: values.incrementalWinAmount ?? 0,
  incrementalWinAmount: values.incrementalWinAmount ?? 0,
  incrementalPlaceAmount: values.incrementalPlaceAmount ?? 0,
  fixedWinOdds: values.fixedWinOdds,
  fixedPlaceOdds: values.fixedPlaceOdds,
  poolWinOdds: values.poolWinOdds,
  poolPlaceOdds: values.poolPlaceOdds,
})

const buildTimeline = (
  entrantId: string,
  dataPoints: EntrantMoneyFlowTimeline['dataPoints']
): EntrantMoneyFlowTimeline => ({
  entrantId,
  dataPoints,
  latestPercentage: 0,
  trend: 'neutral',
  significantChange: false,
})

describe('computeIndicatorMatrix', () => {
  it('detects money increase indicators for win view', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrantId: 'a',
        name: 'Runner A',
        runnerNumber: 1,
        isScratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrantId: 'b',
        name: 'Runner B',
        runnerNumber: 2,
        isScratched: false,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { incrementalWinAmount: 100 }),
          createTimelinePoint('a', 55, { incrementalWinAmount: 200 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { incrementalWinAmount: 100 }),
          createTimelinePoint('b', 55, { incrementalWinAmount: 50 }),
        ]),
      ],
    ])

    const matrix = computeIndicatorMatrix({
      timelineData,
      entrants,
      intervals: [60, 55],
      selectedView: 'win',
      indicatorConfigs,
    })

    const intervalIndicators = matrix.get(55)

    expect(intervalIndicators?.get('a')).toMatchObject({
      entrantId: 'a',
      indicatorType: '25-50%',
    })
    expect(intervalIndicators?.get('a')?.percentageChange).toBeCloseTo(30, 3)
    expect(intervalIndicators?.has('b')).toBe(false)
    expect(matrix.get(60)).toBeUndefined()
  })

  it('uses place incremental amounts when place view is active', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrantId: 'a',
        name: 'Runner A',
        runnerNumber: 1,
        isScratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrantId: 'b',
        name: 'Runner B',
        runnerNumber: 2,
        isScratched: false,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { incrementalPlaceAmount: 40 }),
          createTimelinePoint('a', 55, { incrementalPlaceAmount: 90 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { incrementalPlaceAmount: 40 }),
          createTimelinePoint('b', 55, { incrementalPlaceAmount: 10 }),
        ]),
      ],
    ])

    const matrix = computeIndicatorMatrix({
      timelineData,
      entrants,
      intervals: [60, 55],
      selectedView: 'place',
      indicatorConfigs,
    })

    const indicator = matrix.get(55)?.get('a')
    expect(indicator).toBeDefined()
    expect(indicator?.indicatorType).toBe('25-50%')
    expect(indicator?.percentageChange).toBeCloseTo(40, 3)
  })

  it('detects odds shortening and ignores scratched entrants', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrantId: 'a',
        name: 'Runner A',
        runnerNumber: 1,
        isScratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrantId: 'b',
        name: 'Runner B',
        runnerNumber: 2,
        isScratched: false,
      }),
      buildEntrant({
        $id: 'c',
        entrantId: 'c',
        name: 'Runner C',
        runnerNumber: 3,
        isScratched: true,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { fixedWinOdds: 12 }),
          createTimelinePoint('a', 55, { fixedWinOdds: 6 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { fixedWinOdds: 5 }),
          createTimelinePoint('b', 55, { fixedWinOdds: 5 }),
        ]),
      ],
      [
        'c',
        buildTimeline('c', [
          createTimelinePoint('c', 60, { fixedWinOdds: 10 }),
          createTimelinePoint('c', 55, { fixedWinOdds: 2 }),
        ]),
      ],
    ])

    const matrix = computeIndicatorMatrix({
      timelineData,
      entrants,
      intervals: [60, 55],
      selectedView: 'odds',
      indicatorConfigs,
    })

    const indicator = matrix.get(55)?.get('a')
    expect(indicator).toBeDefined()
    expect(indicator?.indicatorType).toBe('50%+')
    expect(indicator?.percentageChange).toBeCloseTo(50, 3)

    expect(matrix.get(55)?.has('b')).toBe(false)
    expect(matrix.get(55)?.has('c')).toBe(false)
  })
})
