import { computeIndicatorMatrix } from '@/hooks/useGridIndicators'
import type { Entrant } from '@/types/meetings'
import type { IndicatorConfig } from '@/types/alerts'
import type { EntrantMoneyFlowTimeline } from '@/types/moneyFlow'
import { DEFAULT_INDICATORS } from '@/types/alerts'

type PartialEntrant =
  Pick<Entrant, '$id' | 'entrant_id' | 'name' | 'runner_number' | 'is_scratched'> &
  Partial<Pick<Entrant, '$createdAt' | '$updatedAt'>>

const buildEntrant = (overrides: PartialEntrant): Entrant => ({
  $createdAt: overrides.$createdAt ?? '2024-01-01T00:00:00.000Z',
  $updatedAt: overrides.$updatedAt ?? '2024-01-01T00:00:00.000Z',
  jockey: undefined,
  trainer_name: undefined,
  weight: undefined,
  silk_url: undefined,
  silk_colours: undefined,
  silk_url_64: undefined,
  silk_url_128: undefined,
  race: 'race-id',
  entrant_id: overrides.entrant_id,
  name: overrides.name,
  runner_number: overrides.runner_number,
  is_scratched: overrides.is_scratched,
  $id: overrides.$id,
}) as Entrant

const indicatorConfigs: IndicatorConfig[] = DEFAULT_INDICATORS.map((indicator, index) => ({
  ...indicator,
  $id: `indicator-${index}`,
  userId: 'test-user',
  last_updated: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
}))

const createTimelinePoint = (
  entrant: string,
  interval: number,
  values: Partial<EntrantMoneyFlowTimeline['data_points'][number]>
): EntrantMoneyFlowTimeline['data_points'][number] => ({
  $id: `${entrant}-${interval}`,
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  entrant,
  polling_timestamp: '2024-01-01T00:00:00.000Z',
  time_to_start: interval,
  time_interval: interval,
  winPoolAmount: 0,
  placePoolAmount: 0,
  total_pool_amount: 0,
  pool_percentage: 0,
  incremental_amount: values.incremental_win_amount ?? 0,
  incremental_win_amount: values.incremental_win_amount ?? 0,
  incremental_place_amount: values.incremental_place_amount ?? 0,
  fixed_win_odds: values.fixed_win_odds,
  fixed_place_odds: values.fixed_place_odds,
  pool_win_odds: values.pool_win_odds,
  pool_place_odds: values.pool_place_odds,
})

const buildTimeline = (
  entrant_id: string,
  data_points: EntrantMoneyFlowTimeline['data_points']
): EntrantMoneyFlowTimeline => ({
  entrant_id,
  data_points,
  latest_percentage: 0,
  trend: 'neutral',
  significant_change: false,
})

describe('computeIndicatorMatrix', () => {
  it('detects money increase indicators for win view', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrant_id: 'a',
        name: 'Runner A',
        runner_number: 1,
        is_scratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrant_id: 'b',
        name: 'Runner B',
        runner_number: 2,
        is_scratched: false,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { incremental_win_amount: 100 }),
          createTimelinePoint('a', 55, { incremental_win_amount: 200 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { incremental_win_amount: 100 }),
          createTimelinePoint('b', 55, { incremental_win_amount: 50 }),
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
      entrant_id: 'a',
      indicator_type: '25-50%',
    })
    expect(intervalIndicators?.get('a')?.percentage_change).toBeCloseTo(30, 3)
    expect(intervalIndicators?.has('b')).toBe(false)
    expect(matrix.get(60)).toBeUndefined()
  })

  it('uses place incremental amounts when place view is active', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrant_id: 'a',
        name: 'Runner A',
        runner_number: 1,
        is_scratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrant_id: 'b',
        name: 'Runner B',
        runner_number: 2,
        is_scratched: false,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { incremental_place_amount: 40 }),
          createTimelinePoint('a', 55, { incremental_place_amount: 90 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { incremental_place_amount: 40 }),
          createTimelinePoint('b', 55, { incremental_place_amount: 10 }),
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
    expect(indicator?.indicator_type).toBe('25-50%')
    expect(indicator?.percentage_change).toBeCloseTo(40, 3)
  })

  it('detects odds shortening and ignores scratched entrants', () => {
    const entrants: Entrant[] = [
      buildEntrant({
        $id: 'a',
        entrant_id: 'a',
        name: 'Runner A',
        runner_number: 1,
        is_scratched: false,
      }),
      buildEntrant({
        $id: 'b',
        entrant_id: 'b',
        name: 'Runner B',
        runner_number: 2,
        is_scratched: false,
      }),
      buildEntrant({
        $id: 'c',
        entrant_id: 'c',
        name: 'Runner C',
        runner_number: 3,
        is_scratched: true,
      }),
    ]

    const timelineData = new Map<string, EntrantMoneyFlowTimeline>([
      [
        'a',
        buildTimeline('a', [
          createTimelinePoint('a', 60, { fixed_win_odds: 12 }),
          createTimelinePoint('a', 55, { fixed_win_odds: 6 }),
        ]),
      ],
      [
        'b',
        buildTimeline('b', [
          createTimelinePoint('b', 60, { fixed_win_odds: 5 }),
          createTimelinePoint('b', 55, { fixed_win_odds: 5 }),
        ]),
      ],
      [
        'c',
        buildTimeline('c', [
          createTimelinePoint('c', 60, { fixed_win_odds: 10 }),
          createTimelinePoint('c', 55, { fixed_win_odds: 2 }),
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
    expect(indicator?.indicator_type).toBe('50%+')
    expect(indicator?.percentage_change).toBeCloseTo(50, 3)

    expect(matrix.get(55)?.has('b')).toBe(false)
    expect(matrix.get(55)?.has('c')).toBe(false)
  })
})
