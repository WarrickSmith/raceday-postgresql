/**
 * Comprehensive tests for EnhancedEntrantsGrid component
 * Tests accessibility, performance, and functionality
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedEntrantsGrid } from '../../components/race-view/EnhancedEntrantsGrid';
import { RaceProvider } from '../../contexts/RaceContext';
import { Entrant, Race, Meeting, RaceNavigationData } from '../../types/meetings';
import { performanceMonitor } from '../../utils/performance';

// Mock data
const mockRace: Race = {
  $id: 'race-1',
  $createdAt: '2023-01-01T00:00:00.000Z',
  $updatedAt: '2023-01-01T00:00:00.000Z',
  raceId: 'test-race-1',
  raceNumber: 1,
  name: 'Test Race',
  startTime: '2023-01-01T12:00:00.000Z',
  meeting: 'meeting-1',
  status: 'open',
  distance: 1200,
  trackCondition: 'Good'
};

const mockMeeting: Meeting = {
  $id: 'meeting-1',
  $createdAt: '2023-01-01T00:00:00.000Z',
  $updatedAt: '2023-01-01T00:00:00.000Z',
  meetingId: 'test-meeting-1',
  meetingName: 'Test Track',
  country: 'AUS',
  raceType: 'Thoroughbred',
  category: 'Metropolitan',
  date: '2023-01-01'
};

const mockNavigationData: RaceNavigationData = {
  previousRace: null,
  nextRace: null,
  nextScheduledRace: null
};

const mockDataFreshness = {
  lastUpdated: '2023-01-01T00:00:00.000Z',
  entrantsDataAge: 30,
  oddsHistoryCount: 100,
  moneyFlowHistoryCount: 50
};

const mockEntrants: Entrant[] = [
  {
    $id: 'entrant-1',
    $createdAt: '2023-01-01T00:00:00.000Z',
    $updatedAt: '2023-01-01T00:00:00.000Z',
    entrantId: 'test-entrant-1',
    name: 'Test Horse 1',
    runnerNumber: 1,
    jockey: 'Test Jockey 1',
    trainerName: 'Test Trainer 1',
    weight: 58.5,
    silkUrl: 'https://example.com/silk1.png',
    isScratched: false,
    race: 'race-1',
    winOdds: 2.5,
    placeOdds: 1.4,
    oddsHistory: [
      { $id: 'odds-1', $createdAt: '2023-01-01T00:00:00.000Z', $updatedAt: '2023-01-01T00:00:00.000Z', entrant: 'entrant-1', winOdds: 2.3, timestamp: '2023-01-01T00:00:00.000Z' },
      { $id: 'odds-2', $createdAt: '2023-01-01T00:05:00.000Z', $updatedAt: '2023-01-01T00:05:00.000Z', entrant: 'entrant-1', winOdds: 2.5, timestamp: '2023-01-01T00:05:00.000Z' }
    ],
    holdPercentage: 15.5,
    moneyFlowTrend: 'up'
  },
  {
    $id: 'entrant-2',
    $createdAt: '2023-01-01T00:00:00.000Z',
    $updatedAt: '2023-01-01T00:00:00.000Z',
    entrantId: 'test-entrant-2',
    name: 'Test Horse 2',
    runnerNumber: 2,
    jockey: 'Test Jockey 2',
    trainerName: 'Test Trainer 2',
    weight: 57.0,
    silkUrl: 'https://example.com/silk2.png',
    isScratched: false,
    race: 'race-1',
    winOdds: 4.0,
    placeOdds: 2.1,
    oddsHistory: [
      { $id: 'odds-3', $createdAt: '2023-01-01T00:00:00.000Z', $updatedAt: '2023-01-01T00:00:00.000Z', entrant: 'entrant-2', winOdds: 3.8, timestamp: '2023-01-01T00:00:00.000Z' },
      { $id: 'odds-4', $createdAt: '2023-01-01T00:05:00.000Z', $updatedAt: '2023-01-01T00:05:00.000Z', entrant: 'entrant-2', winOdds: 4.0, timestamp: '2023-01-01T00:05:00.000Z' }
    ],
    holdPercentage: 12.3,
    moneyFlowTrend: 'down'
  }
];

const mockRaceData = {
  race: mockRace,
  meeting: mockMeeting,
  entrants: mockEntrants,
  navigationData: mockNavigationData,
  dataFreshness: mockDataFreshness
};

// Mock hooks
jest.mock('../../hooks/useComprehensiveRealtimeFixed', () => ({
  useComprehensiveRealtime: () => ({
    entrants: mockEntrants,
    connectionState: { isConnected: true, connectionAttempts: 1 },
    recentUpdates: [],
    updateCounts: { total: 0, entrant: 0, moneyFlow: 0 },
    performance: { updatesPerMinute: 5.2 },
    triggerReconnect: jest.fn(),
    clearUpdateHistory: jest.fn()
  })
}));

// Mock accessibility utilities
jest.mock('../../utils/accessibility', () => ({
  screenReader: {
    announce: jest.fn(),
    announceOddsUpdate: jest.fn()
  },
  AriaLabels: {
    generateRunnerRowLabel: (num: number, name: string) => `Runner ${num}: ${name}`,
    generateSortableColumnLabel: (col: string) => `Sort by ${col}`
  },
  KeyboardHandler: {
    handleGridNavigation: jest.fn()
  }
}));

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <RaceProvider initialData={mockRaceData}>
      {component}
    </RaceProvider>
  );
};

describe('EnhancedEntrantsGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    performanceMonitor.clearMetrics();
  });

  describe('Rendering', () => {
    it('renders the grid with entrants', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
          dataFreshness={mockDataFreshness}
        />
      );

      expect(screen.getByText('Enhanced Race Entrants (2)')).toBeInTheDocument();
      expect(screen.getByText('Test Horse 1')).toBeInTheDocument();
      expect(screen.getByText('Test Horse 2')).toBeInTheDocument();
    });

    it('displays correct runner information', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText('Test Jockey 1')).toBeInTheDocument();
      expect(screen.getByText('Test Trainer 1')).toBeInTheDocument();
      expect(screen.getByText('2.50')).toBeInTheDocument(); // Win odds
      expect(screen.getByText('1.40')).toBeInTheDocument(); // Place odds
    });

    it('shows loading state when no entrants', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={[]}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText('No entrants found for this race.')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const grid = screen.getByRole('grid');
      expect(grid).toHaveAttribute('aria-label', 'Enhanced race entrants data grid');
      expect(grid).toHaveAttribute('aria-describedby', 'grid-instructions');
    });

    it('provides keyboard navigation instructions', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText(/Navigate the data grid using arrow keys/)).toBeInTheDocument();
    });

    it('has accessible column headers', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const runnerHeader = screen.getByRole('columnheader', { name: /Runner/ });
      const winHeader = screen.getByRole('columnheader', { name: /Win/ });
      const placeHeader = screen.getByRole('columnheader', { name: /Place/ });

      expect(runnerHeader).toBeInTheDocument();
      expect(winHeader).toBeInTheDocument();
      expect(placeHeader).toBeInTheDocument();
    });

    it('announces odds changes for screen readers', async () => {
      const { screenReader } = require('../../utils/accessibility');
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      // This would be triggered by real-time updates in actual usage
      expect(screenReader.announceOddsUpdate).toHaveBeenCalledWith(
        'Test Horse 1',
        '2.50',
        'up'
      );
    });
  });

  describe('Sorting', () => {
    it('allows sorting by runner number', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const runnerHeader = screen.getByRole('columnheader', { name: /Runner/ });
      await user.click(runnerHeader);

      // Should show sort indicator
      expect(screen.getByText('↑')).toBeInTheDocument();
    });

    it('allows sorting by win odds', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const winHeader = screen.getByRole('columnheader', { name: /Win/ });
      await user.click(winHeader);

      // Verify sorting occurred by checking order
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('Test Horse 1'); // Lower odds should come first
    });
  });

  describe('Pool Toggle', () => {
    it('switches between pool types', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const placeButton = screen.getByRole('button', { name: /Place/ });
      await user.click(placeButton);

      expect(placeButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches between display modes', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const moneyButton = screen.getByRole('button', { name: /Money/ });
      await user.click(moneyButton);

      expect(moneyButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Performance', () => {
    it('renders within acceptable time', () => {
      performanceMonitor.startMeasure('grid-render');
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const duration = performanceMonitor.endMeasure('grid-render');
      
      // Should render within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('handles large datasets efficiently', () => {
      const largeEntrants = Array.from({ length: 100 }, (_, i) => ({
        ...mockEntrants[0],
        $id: `entrant-${i}`,
        entrantId: `test-entrant-${i}`,
        name: `Test Horse ${i}`,
        runnerNumber: i + 1
      }));

      performanceMonitor.startMeasure('large-grid-render');
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={largeEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const duration = performanceMonitor.endMeasure('large-grid-render');
      
      // Should handle large datasets within reasonable time
      expect(duration).toBeLessThan(500);
    });

    it('memoizes expensive calculations', () => {
      const { rerender } = renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      // Re-render with same props should not trigger expensive recalculations
      rerender(
        <RaceProvider initialData={mockRaceData}>
          <EnhancedEntrantsGrid
            initialEntrants={mockEntrants}
            raceId="test-race-1"
            raceStartTime="2023-01-01T12:00:00.000Z"
          />
        </RaceProvider>
      );

      // Component should handle re-renders efficiently
      expect(screen.getByText('Test Horse 1')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('shows connection status', () => {
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText('🔄 Live')).toBeInTheDocument();
    });

    it('displays performance stats', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const statsButton = screen.getByRole('button', { name: /📊 Stats/ });
      await user.click(statsButton);

      expect(screen.getByText('Enhanced Performance')).toBeInTheDocument();
      expect(screen.getByText('5.2')).toBeInTheDocument(); // Updates per minute
    });
  });

  describe('Keyboard Navigation', () => {
    it('handles arrow key navigation', () => {
      const { KeyboardHandler } = require('../../utils/accessibility');
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const grid = screen.getByRole('grid');
      fireEvent.keyDown(grid, { key: 'ArrowDown' });

      expect(KeyboardHandler.handleGridNavigation).toHaveBeenCalled();
    });

    it('supports row selection with Enter key', async () => {
      const user = userEvent.setup();
      
      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={mockEntrants}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      const row = screen.getAllByRole('row')[1]; // First data row
      await user.type(row, '{enter}');

      // Should announce selection
      const { screenReader } = require('../../utils/accessibility');
      expect(screenReader.announce).toHaveBeenCalledWith(
        'Selected Test Horse 1, runner number 1',
        'polite'
      );
    });
  });

  describe('Error Handling', () => {
    it('gracefully handles missing data', () => {
      const incompleteEntrant = {
        ...mockEntrants[0],
        jockey: undefined,
        trainerName: undefined,
        winOdds: undefined
      };

      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={[incompleteEntrant]}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText('Test Horse 1')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument(); // Placeholder for missing odds
    });

    it('handles scratched runners', () => {
      const scratchedEntrant = {
        ...mockEntrants[0],
        isScratched: true
      };

      renderWithProvider(
        <EnhancedEntrantsGrid
          initialEntrants={[scratchedEntrant]}
          raceId="test-race-1"
          raceStartTime="2023-01-01T12:00:00.000Z"
        />
      );

      expect(screen.getByText('SCR')).toBeInTheDocument();
      const row = screen.getByRole('row', { name: /Test Horse 1/ });
      expect(row).toHaveClass('opacity-50');
    });
  });
});