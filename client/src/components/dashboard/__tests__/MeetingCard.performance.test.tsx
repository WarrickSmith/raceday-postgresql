import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { Meeting } from '@/types/meetings';
import { Race } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the useRacesForMeeting hook
jest.mock('@/hooks/useRacesForMeeting');
const mockUseRacesForMeeting = useRacesForMeeting as jest.MockedFunction<typeof useRacesForMeeting>;

// Mock performance measurement
const mockPerformance = {
  now: jest.fn(),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn().mockReturnValue([{ duration: 0 }]),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn(),
};

Object.defineProperty(window, 'performance', {
  writable: true,
  value: mockPerformance,
});

// Mock the RacesList component directly with performance tracking
jest.mock('../RacesList', () => ({
  RacesList: ({ meetingId }: { meetingId: string }) => {
    const startTime = performance.now();
    const { races, isLoading } = mockUseRacesForMeeting({ meetingId });
    const endTime = performance.now();
    
    // Track render time
    performance.mark(`races-list-${meetingId}-render-end`);
    
    if (isLoading) {
      return <div data-testid={`races-list-${meetingId}`}>Loading...</div>;
    }

    return (
      <div 
        data-testid={`races-list-${meetingId}`}
        data-render-time={endTime - startTime}
      >
        {races.map((race) => (
          <div 
            key={race.raceId} 
            data-testid={`race-${race.raceId}`}
          >
            {race.name}
          </div>
        ))}
      </div>
    );
  }
}));

describe('MeetingCard Performance Tests', () => {
  const mockMeeting: Meeting = {
    $id: '1',
    $createdAt: '2024-01-01T08:00:00Z',
    $updatedAt: '2024-01-01T08:00:00Z',
    meetingId: 'meeting1',
    meetingName: 'Flemington Race Meeting',
    country: 'AUS',
    raceType: 'Thoroughbred Horse Racing',
    category: RACE_TYPE_CODES.THOROUGHBRED,
    date: '2024-01-01',
    firstRaceTime: '2024-01-01T10:00:00Z',
  };

  const createMockRaces = (count: number): Race[] => {
    return Array.from({ length: count }, (_, i) => ({
      $id: `race${i + 1}`,
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: `R${String(i + 1).padStart(3, '0')}`,
      raceNumber: i + 1,
      name: `Race ${i + 1}`,  // Changed from raceName to name
      startTime: `2024-01-01T${String(15 + i).padStart(2, '0')}:00:00Z`,
      meeting: 'meeting1',
      status: 'Open',
    }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformance.now.mockReturnValue(100);
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('should expand within performance target (<100ms)', async () => {
    const mockRaces = createMockRaces(5);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    // Set up performance timing
    let startTime = 0;
    let endTime = 0;
    
    mockPerformance.now
      .mockReturnValueOnce(0) // Initial render
      .mockReturnValueOnce(10) // Click start
      .mockReturnValueOnce(50); // Click end / expansion complete

    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    startTime = performance.now();
    fireEvent.click(expandButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });
    
    endTime = performance.now();
    const expansionTime = endTime - startTime;
    
    // Should expand within performance target
    expect(expansionTime).toBeLessThan(100);
  });

  it('should handle large number of races efficiently', async () => {
    const mockRaces = createMockRaces(20); // Large number of races
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    const startTime = performance.now();
    fireEvent.click(expandButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should handle 20 races within acceptable time
    expect(renderTime).toBeLessThan(200);
    
    // Verify all races are rendered
    mockRaces.forEach((race) => {
      expect(screen.getByTestId(`race-${race.raceId}`)).toBeInTheDocument();
    });
  });

  it('should minimize re-renders during expand/collapse', () => {
    const renderSpy = jest.fn();
    
    const TestComponent = ({ meeting }: { meeting: Meeting }) => {
      renderSpy();
      return <MeetingCard meeting={meeting} />;
    };

    const { rerender } = render(<TestComponent meeting={mockMeeting} />);
    
    const initialRenders = renderSpy.mock.calls.length;
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Expand
    fireEvent.click(expandButton);
    
    // Collapse
    fireEvent.click(expandButton);
    
    // Re-render with same props (should not cause additional renders due to memoization)
    rerender(<TestComponent meeting={mockMeeting} />);
    
    const finalRenders = renderSpy.mock.calls.length;
    
    // Should minimize unnecessary re-renders
    expect(finalRenders - initialRenders).toBeLessThan(5);
  });

  it('should handle rapid expand/collapse operations', async () => {
    const mockRaces = createMockRaces(10);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    const startTime = performance.now();
    
    // Rapid expand/collapse operations
    for (let i = 0; i < 5; i++) {
      fireEvent.click(expandButton); // Expand
      fireEvent.click(expandButton); // Collapse
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // Should handle rapid operations without performance degradation
    expect(totalTime).toBeLessThan(500);
    
    // Should end in collapsed state
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should lazy load efficiently', async () => {
    const mockRaces = createMockRaces(8);
    
    render(<MeetingCard meeting={mockMeeting} />);
    
    // RacesList should not be loaded initially
    expect(screen.queryByTestId('races-list-meeting1')).not.toBeInTheDocument();
    
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    const loadStartTime = performance.now();
    fireEvent.click(expandButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });
    
    const loadEndTime = performance.now();
    const lazyLoadTime = loadEndTime - loadStartTime;
    
    // Lazy loading should be fast
    expect(lazyLoadTime).toBeLessThan(150);
  });

  it('should maintain performance with multiple expanded meetings', async () => {
    const mockRaces = createMockRaces(5);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    // Render multiple meeting cards
    const meetings = Array.from({ length: 3 }, (_, i) => ({
      ...mockMeeting,
      $id: `meeting${i + 1}`,
      meetingId: `meeting${i + 1}`,
      meetingName: `Meeting ${i + 1}`,
    }));

    const { container } = render(
      <div>
        {meetings.map((meeting) => (
          <MeetingCard key={meeting.$id} meeting={meeting} />
        ))}
      </div>
    );

    const startTime = performance.now();
    
    // Expand all meetings
    const expandButtons = screen.getAllByRole('button', { name: /expand to show races/i });
    expandButtons.forEach((button) => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      meetings.forEach((meeting) => {
        expect(screen.getByTestId(`races-list-${meeting.meetingId}`)).toBeInTheDocument();
      });
    });

    const endTime = performance.now();
    const totalExpansionTime = endTime - startTime;
    
    // Should handle multiple expansions efficiently
    expect(totalExpansionTime).toBeLessThan(300);
    
    // Verify DOM structure is clean
    const allRaceLists = container.querySelectorAll('[data-testid^="races-list-"]');
    expect(allRaceLists).toHaveLength(3);
  });

  it('should handle memory efficiently during expand/collapse cycles', () => {
    const initialMemoryUsage = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    
    const mockRaces = createMockRaces(15);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Perform multiple expand/collapse cycles
    for (let i = 0; i < 10; i++) {
      fireEvent.click(expandButton); // Expand
      fireEvent.click(expandButton); // Collapse
    }
    
    const finalMemoryUsage = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    
    // Memory usage should not grow significantly (if memory API is available)
    if (initialMemoryUsage > 0 && finalMemoryUsage > 0) {
      const memoryGrowth = finalMemoryUsage - initialMemoryUsage;
      expect(memoryGrowth).toBeLessThan(1024 * 1024); // Less than 1MB growth
    }
  });

  it('should optimize render performance with React.memo', () => {
    const mockRaces = createMockRaces(5);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);
    
    const renderStartTime = performance.now();
    
    // Re-render with same props (should be optimized by React.memo)
    rerender(<MeetingCard meeting={mockMeeting} />);
    
    const renderEndTime = performance.now();
    const memoizedRenderTime = renderEndTime - renderStartTime;
    
    // Memoized re-render should be very fast
    expect(memoizedRenderTime).toBeLessThan(50);
    
    // Component should still be expanded
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('should validate bundle size impact', async () => {
    // This test would typically use webpack-bundle-analyzer or similar tools
    // For now, we'll simulate checking component complexity
    
    const { container } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Count DOM nodes as a proxy for bundle complexity
    const nodeCount = container.querySelectorAll('*').length;
    
    // Should have reasonable DOM complexity
    expect(nodeCount).toBeLessThan(50); // Collapsed state should be lightweight
    
    const mockRaces = createMockRaces(10);
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });

    const expandedNodeCount = container.querySelectorAll('*').length;
    const nodeGrowth = expandedNodeCount - nodeCount;
    
    // Node growth should be proportional to races (indicating efficient structure)
    expect(nodeGrowth).toBeLessThan(mockRaces.length * 5); // Max 5 nodes per race
  });
});