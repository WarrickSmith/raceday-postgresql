/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { RaceHeader } from '../RaceHeader';
import { Race, Meeting } from '@/types/meetings';

// Mock the real-time hook
jest.mock('@/hooks/useRealtimeRace', () => ({
  useRealtimeRace: jest.fn(),
}));

// Get the mocked hook
import * as useRealtimeRaceModule from '@/hooks/useRealtimeRace';
const mockUseRealtimeRace = useRealtimeRaceModule.useRealtimeRace as jest.MockedFunction<typeof useRealtimeRaceModule.useRealtimeRace>;

const mockRace: Race = {
  $id: 'race-123',
  $createdAt: '2025-08-10T10:00:00.000Z',
  $updatedAt: '2025-08-10T10:00:00.000Z',
  raceId: 'R1-2025-08-10-ROTORUA',
  raceNumber: 1,
  name: 'Maiden Plate',
  startTime: '2025-08-10T10:20:00.000Z',
  meeting: 'meeting-456',
  status: 'Open',
  distance: 2200,
  trackCondition: 'Good 3',
};

const mockMeeting: Meeting = {
  $id: 'meeting-456',
  $createdAt: '2025-08-10T10:00:00.000Z',
  $updatedAt: '2025-08-10T10:00:00.000Z',
  meetingId: 'meeting-456',
  meetingName: 'ROTORUA',
  country: 'NZ',
  raceType: 'Thoroughbred Horse Racing',
  category: 'T',
  date: '2025-08-10',
};

describe('RaceHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRealtimeRace.mockReturnValue({
      race: mockRace,
      isConnected: true,
      lastUpdate: new Date(),
    });
  });

  it('renders race information correctly', () => {
    render(<RaceHeader initialRace={mockRace} meeting={mockMeeting} />);

    // Check race title
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Race 1: Maiden Plate');
    
    // Check meeting information
    expect(screen.getByText('NZ')).toBeInTheDocument();
    expect(screen.getByText('ROTORUA')).toBeInTheDocument();
    
    // Check race metadata
    expect(screen.getByText('2.2km')).toBeInTheDocument(); // Distance formatted
    expect(screen.getByText('Good 3')).toBeInTheDocument(); // Track condition
    expect(screen.getByText('Open')).toBeInTheDocument(); // Status
    expect(screen.getByText('Thoroughbred Horse Racing')).toBeInTheDocument(); // Race type
    expect(screen.getByText('Thoroughbred')).toBeInTheDocument(); // Category formatted
  });

  it('formats distance correctly', () => {
    const raceWithShortDistance = {
      ...mockRace,
      distance: 800,
    };
    
    mockUseRealtimeRace.mockReturnValue({
      race: raceWithShortDistance,
      isConnected: true,
      lastUpdate: new Date(),
    });
    
    render(<RaceHeader initialRace={raceWithShortDistance} meeting={mockMeeting} />);
    expect(screen.getByText('800m')).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const raceWithoutOptionalFields = {
      ...mockRace,
      distance: undefined,
      trackCondition: undefined,
    };
    
    mockUseRealtimeRace.mockReturnValue({
      race: raceWithoutOptionalFields,
      isConnected: true,
      lastUpdate: new Date(),
    });
    
    render(<RaceHeader initialRace={raceWithoutOptionalFields} meeting={mockMeeting} />);
    
    // Should still render without distance and track condition
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Race 1: Maiden Plate');
    expect(screen.getByText('Open')).toBeInTheDocument();
    
    // Should not show distance or track condition labels
    expect(screen.queryByText('Distance:')).not.toBeInTheDocument();
    expect(screen.queryByText('Track:')).not.toBeInTheDocument();
  });

  it('shows connection status indicator', () => {
    render(<RaceHeader initialRace={mockRace} meeting={mockMeeting} />);
    
    const liveIndicator = screen.getByText('🔄 Live');
    expect(liveIndicator).toBeInTheDocument();
    expect(liveIndicator).toHaveAttribute('aria-label', 'Connected to live data');
  });

  it('displays time information correctly', () => {
    render(<RaceHeader initialRace={mockRace} meeting={mockMeeting} />);
    
    // Should show formatted time
    const timeElement = screen.getByRole('time');
    expect(timeElement).toBeInTheDocument();
    expect(timeElement).toHaveAttribute('dateTime', mockRace.startTime);
  });

  it('has proper accessibility attributes', () => {
    render(<RaceHeader initialRace={mockRace} meeting={mockMeeting} />);
    
    // Check main heading has proper accessibility attributes
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('id', 'race-title');
    expect(heading).toHaveAttribute('aria-describedby', 'race-meta');
    
    // Check race meta group has proper attributes
    const metaGroup = screen.getByRole('group');
    expect(metaGroup).toHaveAttribute('aria-labelledby', 'race-title');
  });

  it('handles invalid start time gracefully', () => {
    const raceWithInvalidTime = {
      ...mockRace,
      startTime: 'invalid-date',
    };
    
    mockUseRealtimeRace.mockReturnValue({
      race: raceWithInvalidTime,
      isConnected: true,
      lastUpdate: new Date(),
    });
    
    render(<RaceHeader initialRace={raceWithInvalidTime} meeting={mockMeeting} />);
    
    // Should show 'TBA' for invalid time
    expect(screen.getByText('TBA')).toBeInTheDocument();
  });
});