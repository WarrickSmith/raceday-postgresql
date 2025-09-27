import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RaceDataHeader } from '../RaceDataHeader'
import type { Meeting, Race } from '@/types/meetings'

jest.mock('@/contexts/RaceContext', () => ({
  useRace: jest.fn(() => ({ raceData: null })),
}))

describe('RaceDataHeader status mapping', () => {
  const baseMeeting: Meeting = {
    $id: 'meeting-1',
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    meetingId: 'meeting-1',
    meetingName: 'Example Park',
    country: 'NZ',
    raceType: 'Thoroughbred',
    category: 'T',
    date: '2024-01-01T00:00:00.000Z',
  }

  const buildRace = (status: Race['status']): Race => ({
    $id: 'race-1',
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    raceId: 'race-1',
    raceNumber: 1,
    name: 'Test Stakes',
    startTime: '2024-01-01T01:00:00.000Z',
    status,
    distance: 1200,
    trackCondition: 'Good',
    weather: 'Fine',
    type: 'T',
    meeting: 'meeting-1',
  })

  it('renders Final for finalized status with purple styles', () => {
    render(
      <RaceDataHeader
        race={buildRace('Finalized')}
        meeting={baseMeeting}
        entrants={[]}
        className=""
      />
    )

    // Status label should map to Final
    const label = screen.getByText('Final')
    expect(label).toBeInTheDocument()
    // Should use purple color class from status config
    expect(label.className).toMatch(/text-purple-700/)
  })

  it('renders Abandoned for cancelled status with red styles', () => {
    render(
      <RaceDataHeader
        race={buildRace('Cancelled')}
        meeting={baseMeeting}
        entrants={[]}
        className=""
      />
    )

    const label = screen.getByText('Abandoned')
    expect(label).toBeInTheDocument()
    expect(label.className).toMatch(/text-red-700/)
  })
})

