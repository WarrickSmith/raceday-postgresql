import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EntrantsGrid } from '../EntrantsGrid';
import { Entrant } from '@/types/meetings';

// Mock the useRealtimeEntrants hook
jest.mock('@/hooks/useRealtimeEntrants', () => ({
  useRealtimeEntrants: jest.fn(),
}));

import * as useRealtimeEntrantsModule from '@/hooks/useRealtimeEntrants';
const mockUseRealtimeEntrants = useRealtimeEntrantsModule.useRealtimeEntrants as jest.MockedFunction<typeof useRealtimeEntrantsModule.useRealtimeEntrants>;

const mockEntrants: Entrant[] = [
  {
    $id: '1',
    $createdAt: '2025-01-01T00:00:00Z',
    $updatedAt: '2025-01-01T00:00:00Z',
    entrantId: 'e1',
    name: 'Thunder Bolt',
    runnerNumber: 1,
    jockey: 'J. Smith',
    trainerName: 'T. Johnson',
    weight: 57.0,
    silkUrl: '',
    isScratched: false,
    race: 'race1',
    winOdds: 3.50,
    placeOdds: 1.80,
    holdPercentage: 25.50,
    moneyFlowTrend: 'up' as const,
  },
  {
    $id: '2',
    $createdAt: '2025-01-01T00:00:00Z',
    $updatedAt: '2025-01-01T00:00:00Z',
    entrantId: 'e2',
    name: 'Lightning Fast',
    runnerNumber: 2,
    jockey: 'M. Davis',
    trainerName: 'S. Wilson',
    weight: 55.5,
    silkUrl: '',
    isScratched: true,
    race: 'race1',
    winOdds: 8.00,
    placeOdds: 3.20,
    holdPercentage: 15.25,
    moneyFlowTrend: 'neutral' as const,
  },
  {
    $id: '3',
    $createdAt: '2025-01-01T00:00:00Z',
    $updatedAt: '2025-01-01T00:00:00Z',
    entrantId: 'e3',
    name: 'Wind Runner',
    runnerNumber: 3,
    jockey: 'K. Brown',
    trainerName: 'P. Miller',
    weight: 56.0,
    silkUrl: '',
    isScratched: false,
    race: 'race1',
    winOdds: 12.00,
    placeOdds: 4.50,
    holdPercentage: 8.75,
    moneyFlowTrend: 'down' as const,
  },
];

describe('EntrantsGrid', () => {
  beforeEach(() => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: mockEntrants,
      isConnected: true,
      oddsUpdates: {},
      moneyFlowUpdates: {},
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders entrants grid with all required columns', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check header columns
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Runner / Jockey / Trainer')).toBeInTheDocument();
    expect(screen.getByText('Win Odds')).toBeInTheDocument();
    expect(screen.getByText('Place Odds')).toBeInTheDocument();
    expect(screen.getByText('Money%')).toBeInTheDocument();

    // Check entrant count in header
    expect(screen.getByText('Race Entrants (3)')).toBeInTheDocument();
  });

  test('displays all entrants with correct data', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check runner numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Check runner names
    expect(screen.getByText('Thunder Bolt')).toBeInTheDocument();
    expect(screen.getByText('Lightning Fast')).toBeInTheDocument();
    expect(screen.getByText('Wind Runner')).toBeInTheDocument();

    // Check jockeys
    expect(screen.getByText('J. Smith')).toBeInTheDocument();
    expect(screen.getByText('M. Davis')).toBeInTheDocument();
    expect(screen.getByText('K. Brown')).toBeInTheDocument();

    // Check trainers
    expect(screen.getByText('T. Johnson')).toBeInTheDocument();
    expect(screen.getByText('S. Wilson')).toBeInTheDocument();
    expect(screen.getByText('P. Miller')).toBeInTheDocument();
  });

  test('displays odds correctly for active entrants', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check win odds for active entrants
    expect(screen.getByText('3.50')).toBeInTheDocument();
    expect(screen.getByText('12.00')).toBeInTheDocument();

    // Check place odds for active entrants  
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('4.50')).toBeInTheDocument();
  });

  test('handles scratched entrants correctly', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check scratched indicator
    expect(screen.getByText('SCR')).toBeInTheDocument();

    // Scratched entrants should show em-dash for odds instead of actual odds
    const scratchedRow = screen.getByText('Lightning Fast').closest('tr');
    expect(scratchedRow).toHaveClass('opacity-50', 'bg-red-50');
  });

  test('displays connection status indicator', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    expect(screen.getByText('🔄 Live')).toBeInTheDocument();
  });

  test('shows disconnected status when not connected', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: mockEntrants,
      isConnected: false,
      oddsUpdates: {},
      moneyFlowUpdates: {},
    });

    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    expect(screen.getByText('📶 Disconnected')).toBeInTheDocument();
  });

  test('displays trend indicators for odds changes', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: [
        { ...mockEntrants[0], winOdds: 4.00 }, // Odds increased
      ],
      isConnected: true,
      oddsUpdates: {
        '1': { win: 3.50, timestamp: new Date() }, // Previous odds
      },
      moneyFlowUpdates: {},
    });

    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Should show upward arrow for lengthened odds
    expect(screen.getByLabelText('odds lengthened')).toBeInTheDocument();
  });

  test('sorts entrants by runner number', () => {
    const unsortedEntrants = [mockEntrants[2], mockEntrants[0], mockEntrants[1]];
    
    render(<EntrantsGrid initialEntrants={unsortedEntrants} raceId="race1" />);

    const rows = screen.getAllByRole('row');
    const dataRows = rows.slice(1); // Skip header row

    // Check that runner numbers are in order
    expect(dataRows[0]).toHaveTextContent('1');
    expect(dataRows[1]).toHaveTextContent('2');
    expect(dataRows[2]).toHaveTextContent('3');
  });

  test('displays empty state when no entrants', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: [],
      isConnected: true,
      oddsUpdates: {},
      moneyFlowUpdates: {},
    });

    render(<EntrantsGrid initialEntrants={[]} raceId="race1" />);

    expect(screen.getByText('No entrants found for this race.')).toBeInTheDocument();
  });

  test('has proper accessibility attributes', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check table accessibility
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-label', 'Race entrants data grid');
    expect(table).toHaveAttribute('aria-describedby', 'entrants-description');

    // Check column headers
    const columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders).toHaveLength(5); // Added Money% column
    columnHeaders.forEach(header => {
      expect(header).toHaveAttribute('scope', 'col');
    });

    // Check row groups (there are multiple, so use getAllByRole)
    const rowGroups = screen.getAllByRole('rowgroup');
    expect(rowGroups.length).toBeGreaterThanOrEqual(1);

    // Check live region
    expect(screen.getByLabelText('Live entrant updates')).toBeInTheDocument();
  });

  test('calls useRealtimeEntrants with correct parameters', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    expect(mockUseRealtimeEntrants).toHaveBeenCalledWith({
      initialEntrants: mockEntrants,
      raceId: 'race1',
    });
  });

  test('announces odds updates for screen readers', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: mockEntrants,
      isConnected: true,
      oddsUpdates: {
        '1': { win: 3.50, timestamp: new Date() },
        '2': { place: 3.20, timestamp: new Date() },
      },
      moneyFlowUpdates: {},
    });

    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    const liveRegion = screen.getByLabelText('Live entrant updates');
    expect(liveRegion).toHaveTextContent('Odds updated for 2 entrants');
  });

  // Money Flow specific tests
  test('displays money flow percentages correctly', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check money flow percentages for active entrants
    expect(screen.getByText('25.50%')).toBeInTheDocument();
    expect(screen.getByText('8.75%')).toBeInTheDocument();
  });

  test('displays money flow trend indicators', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check for trend indicators
    expect(screen.getByLabelText('Market interest increasing')).toBeInTheDocument();
    expect(screen.getByLabelText('Market interest decreasing')).toBeInTheDocument();
  });

  test('handles scratched entrants money flow correctly', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Scratched entrant should show em-dash for money flow
    const scratchedRow = screen.getByText('Lightning Fast').closest('tr');
    const moneyFlowCells = scratchedRow?.querySelectorAll('td');
    const moneyFlowCell = moneyFlowCells?.[4]; // Money flow is 5th column (0-indexed)
    expect(moneyFlowCell).toHaveTextContent('—');
  });

  test('announces money flow updates for screen readers', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: mockEntrants,
      isConnected: true,
      oddsUpdates: {},
      moneyFlowUpdates: {
        '1': { holdPercentage: 26.75, timestamp: new Date() },
        '3': { holdPercentage: 9.25, timestamp: new Date() },
      },
    });

    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    const liveRegion = screen.getByLabelText('Live entrant updates');
    expect(liveRegion).toHaveTextContent('Money flow updated for 2 entrants');
  });

  test('announces both odds and money flow updates together', () => {
    mockUseRealtimeEntrants.mockReturnValue({
      entrants: mockEntrants,
      isConnected: true,
      oddsUpdates: {
        '1': { win: 3.75, timestamp: new Date() },
      },
      moneyFlowUpdates: {
        '2': { holdPercentage: 16.50, timestamp: new Date() },
      },
    });

    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    const liveRegion = screen.getByLabelText('Live entrant updates');
    expect(liveRegion).toHaveTextContent('Odds updated for 1 entrant Money flow updated for 1 entrant');
  });

  test('money flow column has proper accessibility attributes', () => {
    render(<EntrantsGrid initialEntrants={mockEntrants} raceId="race1" />);

    // Check Money% column header accessibility
    const moneyFlowHeader = screen.getByText('Money%');
    expect(moneyFlowHeader).toHaveAttribute('scope', 'col');
    expect(moneyFlowHeader).toHaveAttribute('role', 'columnheader');
    expect(moneyFlowHeader).toHaveAttribute('aria-describedby', 'money-flow-description');

    // Check description exists
    expect(screen.getByText(/Money flow percentage shows the current hold percentage/)).toBeInTheDocument();
  });
});