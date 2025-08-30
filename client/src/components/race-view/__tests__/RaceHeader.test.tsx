/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { RaceHeader } from '../RaceHeader';
import { RaceProvider } from '@/contexts/RaceContext';
import { Race, Meeting, RaceNavigationData, Entrant } from '@/types/meetings';

// Mock the real-time hook
jest.mock('@/hooks/useRealtimeRace', () => ({
  useRealtimeRace: jest.fn(),
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(), isConnected: true,
  })),
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

const mockNavigationData: RaceNavigationData = {
  previousRace: {
    raceId: 'prev-race-123',
    name: 'Previous Race',
    startTime: '2025-08-10T09:50:00.000Z',
    meetingName: 'ROTORUA'
  },
  nextRace: {
    raceId: 'next-race-123',
    name: 'Next Race',
    startTime: '2025-08-10T10:50:00.000Z',
    meetingName: 'ROTORUA'
  },
  nextScheduledRace: {
    raceId: 'scheduled-race-123',
    name: 'Scheduled Race',
    startTime: '2025-08-10T11:20:00.000Z',
    meetingName: 'AUCKLAND'
  }
};

// Mock race context data
const mockRaceData = {
  race: mockRace,
  meeting: mockMeeting,
  entrants: [] as Entrant[],
  navigationData: mockNavigationData,
  dataFreshness: {
    lastUpdated: new Date().toISOString(),
    entrantsDataAge: 0,
    oddsHistoryCount: 0,
    moneyFlowHistoryCount: 0
  }
};

// Helper function to render with RaceProvider
const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <RaceProvider initialData={mockRaceData}>
      {component}
    </RaceProvider>
  );
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
    renderWithProvider(<RaceHeader initialRace={mockRace} meeting={mockMeeting} navigationData={mockNavigationData} />);

    // Check race title
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Race 1: Maiden Plate');
    
    // Check meeting information
    expect(screen.getByText('NZ')).toBeInTheDocument();
    expect(screen.getByText('ROTORUA')).toBeInTheDocument();
    
    // Check race metadata
    expect(screen.getByText('2.2km')).toBeInTheDocument(); // Distance formatted
    expect(screen.getByText('Good 3')).toBeInTheDocument(); // Track condition
    expect(screen.getByText('🟢 Open')).toBeInTheDocument(); // Status with icon
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
    
    renderWithProvider(<RaceHeader initialRace={raceWithShortDistance} meeting={mockMeeting} navigationData={mockNavigationData} />);
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
    
    renderWithProvider(<RaceHeader initialRace={raceWithoutOptionalFields} meeting={mockMeeting} navigationData={mockNavigationData} />);
    
    // Should still render without distance and track condition
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Race 1: Maiden Plate');
    expect(screen.getByText('🟢 Open')).toBeInTheDocument();
    
    // Should not show distance or track condition labels
    expect(screen.queryByText('Distance:')).not.toBeInTheDocument();
    expect(screen.queryByText('Track:')).not.toBeInTheDocument();
  });

  it('shows connection status indicator', () => {
    renderWithProvider(<RaceHeader initialRace={mockRace} meeting={mockMeeting} navigationData={mockNavigationData} />);
    
    const liveIndicator = screen.getByText('🔄 Live');
    expect(liveIndicator).toBeInTheDocument();
    expect(liveIndicator).toHaveAttribute('aria-label', 'Connected to live data');
  });

  it('displays time information correctly', () => {
    renderWithProvider(<RaceHeader initialRace={mockRace} meeting={mockMeeting} navigationData={mockNavigationData} />);
    
    // Should show formatted time
    const timeElement = screen.getByRole('time');
    expect(timeElement).toBeInTheDocument();
    expect(timeElement).toHaveAttribute('dateTime', mockRace.startTime);
  });

  it('has proper accessibility attributes', () => {
    renderWithProvider(<RaceHeader initialRace={mockRace} meeting={mockMeeting} navigationData={mockNavigationData} />);
    
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
    
    renderWithProvider(<RaceHeader initialRace={raceWithInvalidTime} meeting={mockMeeting} navigationData={mockNavigationData} />);
    
    // Should show 'TBA' for invalid time
    expect(screen.getByText('TBA')).toBeInTheDocument();
  });
});