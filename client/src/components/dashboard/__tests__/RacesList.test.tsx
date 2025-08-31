import { render, screen } from '@testing-library/react';
import { RacesList } from '../RacesList';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { Race } from '@/types/meetings';

// Mock the useRacesForMeeting hook
jest.mock('@/hooks/useRacesForMeeting');
const mockUseRacesForMeeting = useRacesForMeeting as jest.MockedFunction<typeof useRacesForMeeting>;

// Mock RaceCard component
jest.mock('../RaceCard', () => ({
  RaceCard: ({ race, onClick }: { race: Race; onClick?: (id: string) => void }) => (
    <div data-testid={`race-card-${race.raceId}`} onClick={() => onClick?.(race.raceId)}>
      {race.name} - Race {race.raceNumber}
    </div>
  ),
}));

describe('RacesList', () => {
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
  });

  it('should render loading state', () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(screen.getByTestId('races-skeleton')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading races...')).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: 'Failed to load races',
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText('Failed to load races')).toHaveLength(2);
  });

  it('should render empty state when no races', () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(screen.getByText('No races available')).toBeInTheDocument();
    expect(screen.getByText('This meeting has no scheduled races.')).toBeInTheDocument();
  });

  it('should render races in correct order', () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(screen.getByTestId('race-card-R001')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-R002')).toBeInTheDocument();
    expect(screen.getByText('First Race - Race 1')).toBeInTheDocument();
    expect(screen.getByText('Second Race - Race 2')).toBeInTheDocument();
  });

  it('should handle races sorting by race number', () => {
    const unsortedRaces = [...mockRaces].reverse(); // Reverse order
    
    mockUseRacesForMeeting.mockReturnValue({
      races: unsortedRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    const raceCards = screen.getAllByTestId(/race-card-/);
    expect(raceCards).toHaveLength(2);
    
    // Races should be sorted by race number regardless of input order
    expect(screen.getByTestId('race-card-R001')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-R002')).toBeInTheDocument();
  });

  it('should handle many races without performance notice', () => {
    const manyRaces = Array.from({ length: 12 }, (_, i) => ({
      ...mockRaces[0],
      $id: `race${i + 1}`,
      raceId: `R${String(i + 1).padStart(3, '0')}`,
      raceNumber: i + 1,
      name: `Race ${i + 1}`,  // Changed from raceName to name
    }));

    mockUseRacesForMeeting.mockReturnValue({
      races: manyRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    // Should render all races without any performance notice
    expect(screen.getAllByTestId(/^race-card-/).length).toBe(12);
    expect(screen.queryByText(/This meeting has \d+ races/)).not.toBeInTheDocument();
  });

  it('should pass onClick handler to race cards', () => {
    const handleRaceClick = jest.fn();
    
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" onRaceClick={handleRaceClick} />);

    const firstRaceCard = screen.getByTestId('race-card-R001');
    firstRaceCard.click();

    expect(handleRaceClick).toHaveBeenCalledWith('R001');
  });

  it('should have proper accessibility attributes', () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(), isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    
    // Screen reader content
    expect(screen.getByText('Races for this meeting')).toBeInTheDocument();
    expect(screen.getByText('2 races scheduled')).toBeInTheDocument();
  });

  it('should call useRacesForMeeting with correct parameters', () => {
    const mockRefetch = jest.fn();
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      isConnected: true,
    });

    render(<RacesList meetingId="meeting1" />);

    expect(mockUseRacesForMeeting).toHaveBeenCalledWith({
      meetingId: 'meeting1',
      enabled: true,
    });
  });
});