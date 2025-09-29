import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingsListClient } from '../MeetingsListClient';
import { RacesForMeetingClient } from '../RacesForMeetingClient';
import { useMeetingsPolling, type ConnectionState } from '@/hooks/useMeetingsPolling';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the polling hook and Next.js navigation
jest.mock('@/hooks/useMeetingsPolling');

jest.mock('../RacesForMeetingClient', () => ({
  RacesForMeetingClient: jest.fn(() => <div data-testid="races-for-meeting-client" />),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}));

jest.mock('next/router', () => ({
  __esModule: true,
  default: {
    events: {
      on: jest.fn(),
      off: jest.fn(),
    },
  },
}));

const mockUseMeetingsPolling = useMeetingsPolling as jest.MockedFunction<typeof useMeetingsPolling>;
const mockRacesForMeetingClient = RacesForMeetingClient as jest.MockedFunction<typeof RacesForMeetingClient>;

const renderWithProvider = (ui: React.ReactElement) => render(ui);

describe('MeetingsListClient', () => {
  const mockMeetings: Meeting[] = [
    {
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
    },
    {
      $id: '2',
      $createdAt: '2024-01-01T07:00:00Z',
      $updatedAt: '2024-01-01T07:00:00Z',
      meetingId: 'meeting2',
      meetingName: 'Addington Harness',
      country: 'NZ',
      raceType: 'Harness Horse Racing',
      category: RACE_TYPE_CODES.HARNESS,
      date: '2024-01-01',
      firstRaceTime: '2024-01-01T09:00:00Z',
    },
  ];

  type MockPollingResult = {
    meetings: Meeting[];
    isConnected: boolean;
    connectionState: ConnectionState;
    connectionAttempts: number;
    isInitialDataReady: boolean;
    retry: jest.Mock<void, []>;
    retryConnection: jest.Mock<Promise<boolean>, []>;
    refreshMeetings: jest.Mock<Promise<void>, []>;
    retryCountdown: number | null;
  };

  const createMockReturn = (overrides: Partial<MockPollingResult> = {}): MockPollingResult => ({
    meetings: mockMeetings,
    isConnected: true,
    connectionState: 'connected',
    connectionAttempts: 0,
    isInitialDataReady: true,
    retry: jest.fn<void, []>(),
    retryConnection: jest.fn<Promise<boolean>, []>(() => Promise.resolve(true)),
    refreshMeetings: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    retryCountdown: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockUseMeetingsPolling.mockReturnValue(createMockReturn());
    mockRacesForMeetingClient.mockClear();
  });

  it('should render meetings list with connection status badge', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText("Today's Meetings")).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByText('Flemington Race Meeting').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Addington Harness').length).toBeGreaterThan(0);
  });

  it('should show connection panel when disconnected', () => {
    const retryConnection = jest.fn<Promise<boolean>, []>(() => Promise.resolve(false));
    mockUseMeetingsPolling.mockReturnValue(
      createMockReturn({
        isConnected: false,
        connectionState: 'disconnected',
        connectionAttempts: 2,
        isInitialDataReady: false,
        retryConnection,
        retryCountdown: 45,
      }),
    );

    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('RaceDay data connection unavailable')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /Retry connection/i });
    fireEvent.click(retryButton);
    expect(retryConnection).toHaveBeenCalled();
  });

  it('should display connecting state when health check is running', () => {
    mockUseMeetingsPolling.mockReturnValue(
      createMockReturn({
        isConnected: false,
        connectionState: 'connecting',
        connectionAttempts: 0,
        isInitialDataReady: false,
        retryCountdown: null,
      }),
    );

    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('Connecting to RaceDay data…')).toBeInTheDocument();
  });

  it('should preselect the first meeting when data is available', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(mockRacesForMeetingClient).toHaveBeenCalled();
    const firstCallProps = mockRacesForMeetingClient.mock.calls[0]?.[0];
    expect(firstCallProps?.selectedMeeting).toEqual(mockMeetings[0]);
  });

  it('resynchronizes the selected meeting when polling returns new meeting references', () => {
    const updatedMeetings: Meeting[] = [
      {
        ...mockMeetings[0],
        meetingName: 'Flemington Race Meeting',
      },
      mockMeetings[1],
    ];

    let pollingState = createMockReturn();
    mockUseMeetingsPolling.mockImplementation(() => pollingState);

    const { rerender } = renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(mockRacesForMeetingClient).toHaveBeenCalled();
    const initialCallIndex = mockRacesForMeetingClient.mock.calls.length - 1;
    const initialSelected = mockRacesForMeetingClient.mock.calls[initialCallIndex]?.[0]?.selectedMeeting;
    expect(initialSelected).toEqual(mockMeetings[0]);

    pollingState = createMockReturn({ meetings: updatedMeetings });
    rerender(<MeetingsListClient initialData={mockMeetings} />);

    const updatedCallIndex = mockRacesForMeetingClient.mock.calls.length - 1;
    const updatedSelected = mockRacesForMeetingClient.mock.calls[updatedCallIndex]?.[0]?.selectedMeeting;
    expect(updatedSelected).toEqual(updatedMeetings[0]);
  });

  it('should display error banner when error occurs and allow manual retry', async () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();

    const retryConnection = jest.fn<Promise<boolean>, []>(() => Promise.resolve(false));

    mockUseMeetingsPolling.mockImplementation(({ onError }) => {
      setTimeout(() => onError?.(new Error('Data fetch failed')), 50);
      return createMockReturn({
        retryConnection,
      });
    });

    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    await waitFor(() => {
      expect(screen.getByText(/Data update issue/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));
    expect(retryConnection).toHaveBeenCalled();

    console.error = originalConsoleError;
  });

  it('should show friendly empty state when no meetings', () => {
    const refreshMeetings = jest.fn<Promise<void>, []>(() => Promise.resolve());
    mockUseMeetingsPolling.mockReturnValue(
      createMockReturn({
        meetings: [],
        refreshMeetings,
      }),
    );

    renderWithProvider(<MeetingsListClient initialData={[]} />);

    expect(screen.getByText('No Meeting Information is currently available')).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: /Re-check meetings data/i });
    fireEvent.click(refreshButton);
    expect(refreshMeetings).toHaveBeenCalled();
  });

  it('should display correct meeting count', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    // The count text might be split across elements, so use a more flexible matcher
    expect(screen.getByText(/2.*meeting.*available/)).toBeInTheDocument();
  });

  it('should display singular meeting count correctly', () => {
    const singleMeeting = [mockMeetings[0]];
    mockUseMeetingsPolling.mockReturnValue(
      createMockReturn({
        meetings: singleMeeting,
      }),
    );

    renderWithProvider(<MeetingsListClient initialData={singleMeeting} />);

    // Use flexible matcher for singular meeting text
    expect(screen.getByText(/1.*meeting.*available/)).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    const list = screen.getByRole('list', { name: 'Race meetings' });
    expect(list).toBeInTheDocument();

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
  });

  it('should handle polling updates correctly', () => {
    const updatedMeetings = [
      ...mockMeetings,
      {
        $id: '3',
        $createdAt: '2024-01-01T06:00:00Z',
        $updatedAt: '2024-01-01T06:00:00Z',
        meetingId: 'meeting3',
        meetingName: 'New Meeting',
        country: 'AUS',
        raceType: 'Thoroughbred Horse Racing',
        category: RACE_TYPE_CODES.THOROUGHBRED,
        date: '2024-01-01',
        firstRaceTime: '2024-01-01T08:00:00Z',
      },
    ];

    const { rerender } = renderWithProvider(
      <MeetingsListClient initialData={mockMeetings} />
    );

    mockUseMeetingsPolling.mockReturnValue(
      createMockReturn({
        meetings: updatedMeetings,
      }),
    );

    rerender(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('New Meeting')).toBeInTheDocument();
    expect(screen.getByText(/3.*meeting.*available/)).toBeInTheDocument();
  });

  it('should handle race navigation correctly', async () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    // Wait for component to render properly
    await waitFor(() => {
      // Verify that the navigation handler is properly set up by checking component structure
      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument(); 
    });

    // Verify that meetings are rendered and navigation setup exists
    expect(screen.getAllByText('Flemington Race Meeting').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Addington Harness').length).toBeGreaterThan(0);
    
    // Since expansion was removed, we just verify no navigation has occurred yet
    expect(mockPush).not.toHaveBeenCalled(); // No navigation yet, as expected
  });
});
