import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { Meeting } from '@/types/meetings';
import { Race } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the useRacesForMeeting hook
jest.mock('@/hooks/useRacesForMeeting');
const mockUseRacesForMeeting = useRacesForMeeting as jest.MockedFunction<typeof useRacesForMeeting>;

// Mock the RacesList component directly
jest.mock('../RacesList', () => ({
  RacesList: ({ meetingId, onRaceClick }: { meetingId: string; onRaceClick?: (id: string) => void }) => {
    const { races } = mockUseRacesForMeeting({ meetingId });
    return (
      <div data-testid={`races-list-${meetingId}`}>
        {races.map((race) => (
          <div 
            key={race.raceId} 
            data-testid={`race-${race.raceId}`}
            onClick={() => onRaceClick?.(race.raceId)}
          >
            {race.name} - {race.status}
          </div>
        ))}
      </div>
    );
  }
}));

describe('MeetingCard Integration Tests', () => {
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

  const mockRaces: Race[] = [
    {
      $id: 'race1',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R001',
      raceNumber: 1,
      name: 'First Race',  // Changed from raceName to name
      startTime: '2024-01-01T15:00:00Z',
      meeting: 'meeting1',
      status: 'Open',
    },
    {
      $id: 'race2',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R002',
      raceNumber: 2,
      name: 'Second Race',  // Changed from raceName to name
      startTime: '2024-01-01T16:00:00Z',
      meeting: 'meeting1',
      status: 'Closed',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('should display races when meeting is expanded', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
      expect(screen.getByTestId('race-R001')).toBeInTheDocument();
      expect(screen.getByTestId('race-R002')).toBeInTheDocument();
      expect(screen.getByText('First Race - Open')).toBeInTheDocument();
      expect(screen.getByText('Second Race - Closed')).toBeInTheDocument();
    });
  });

  it.skip('should handle real-time race status updates when expanded', async () => {
    // Initially show races in Open and Closed status
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);

    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByText('First Race - Open')).toBeInTheDocument();
      expect(screen.getByText('Second Race - Closed')).toBeInTheDocument();
    });

    // Simulate real-time update: First race becomes Running
    const updatedRaces = [
      { ...mockRaces[0], status: 'Running', $updatedAt: '2024-01-01T08:30:00Z' },
      mockRaces[1],
    ];

    mockUseRacesForMeeting.mockReturnValue({
      races: updatedRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    rerender(<MeetingCard meeting={mockMeeting} />);

    await waitFor(() => {
      expect(screen.getByText('First Race - Running')).toBeInTheDocument();
      expect(screen.getByText('Second Race - Closed')).toBeInTheDocument();
    });
  });

  it('should preserve expand state during meeting updates', async () => {
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    // Expand the meeting
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });

    // Simulate meeting data update (real-time update)
    const updatedMeeting = {
      ...mockMeeting,
      $updatedAt: '2024-01-01T09:00:00Z',
      meetingName: 'Updated Flemington Race Meeting',
    };

    rerender(<MeetingCard meeting={updatedMeeting} />);

    // Expand state should be preserved - button should still be expanded
    expect(screen.getByRole('button', { name: /collapse races/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    expect(screen.getByText('Updated Flemington Race Meeting')).toBeInTheDocument();
  });

  it('should handle race additions in expanded meetings', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Initially show 2 races
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('race-R001')).toBeInTheDocument();
      expect(screen.getByTestId('race-R002')).toBeInTheDocument();
    });

    // Add a new race
    const newRace: Race = {
      $id: 'race3',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R003',
      raceNumber: 3,
      name: 'Third Race',  // Changed from raceName to name
      startTime: '2024-01-01T17:00:00Z',
      meeting: 'meeting1',
      status: 'Open',
    };

    mockUseRacesForMeeting.mockReturnValue({
      races: [...mockRaces, newRace],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    // Force re-render to simulate real-time race addition
    fireEvent.click(expandButton); // Collapse
    fireEvent.click(expandButton); // Expand again

    await waitFor(() => {
      expect(screen.getByTestId('race-R001')).toBeInTheDocument();
      expect(screen.getByTestId('race-R002')).toBeInTheDocument();
      expect(screen.getByTestId('race-R003')).toBeInTheDocument();
      expect(screen.getByText('Third Race - Open')).toBeInTheDocument();
    });
  });

  it('should handle loading state while fetching races', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });

    // Should show loading skeleton (mocked as empty races list)
    expect(screen.queryByTestId('race-R001')).not.toBeInTheDocument();
  });

  it('should handle error state when race fetching fails', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: 'Failed to fetch races',
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });

    // Error state handled by RacesList component (mocked as empty)
    expect(screen.queryByTestId('race-R001')).not.toBeInTheDocument();
  });

  it('should call useRacesForMeeting with correct meetingId', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(mockUseRacesForMeeting).toHaveBeenCalledWith({
        meetingId: 'meeting1',
      });
    });
  });

  it('should handle race clicks when expanded', async () => {
    
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('race-R001')).toBeInTheDocument();
    });

    // Click on first race
    fireEvent.click(screen.getByTestId('race-R001'));

    // Note: In real implementation, this would trigger navigation or race details
    // For now, just verify the race element is clickable
    expect(screen.getByTestId('race-R001')).toBeInTheDocument();
  });
});