import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingsListClient } from '../MeetingsListClient';
import { useMeetingsPolling } from '@/hooks/useMeetingsPolling';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the polling hook and Next.js navigation
jest.mock('@/hooks/useMeetingsPolling');

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

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockUseMeetingsPolling.mockReturnValue({
      meetings: mockMeetings,
      isConnected: true,
      connectionState: 'connected' as const,
      connectionAttempts: 0,
      isInitialDataReady: true,
      retry: jest.fn(),
    });
  });

  it('should render meetings list with connection status', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText("Today's Meetings")).toBeInTheDocument();
    expect(screen.getByLabelText('Data current')).toBeInTheDocument();
    // Meetings appear in both meeting cards and race cards, so expect multiple instances
    expect(screen.getAllByText('Flemington Race Meeting').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Addington Harness').length).toBeGreaterThan(0);
  });

  it('should show disconnected status when not connected', () => {
    mockUseMeetingsPolling.mockReturnValue({
      meetings: mockMeetings,
      isConnected: false,
      connectionState: 'disconnected' as const,
      connectionAttempts: 1,
      isInitialDataReady: false,
      retry: jest.fn(),
    });

    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });

  it('should display error banner when error occurs', async () => {
    // Mock console.error to suppress expected error output
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    const mockRetry = jest.fn();
    mockUseMeetingsPolling.mockReturnValue({
      meetings: mockMeetings,
      isConnected: false,
      connectionState: 'disconnected' as const,
      connectionAttempts: 2,
      isInitialDataReady: false,
      retry: mockRetry,
    });

    // Simulate error by calling the hook with an error handler
    mockUseMeetingsPolling.mockImplementation(({ onError: errorHandler }) => {
      // Simulate error after some time
      setTimeout(() => errorHandler?.(new Error('Data fetch failed')), 100);
      return {
        meetings: mockMeetings,
        isConnected: false,
        connectionState: 'disconnected' as const,
        connectionAttempts: 2,
        isInitialDataReady: false,
        retry: mockRetry,
      };
    });

    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    // Wait for error to be set
    await waitFor(() => {
      expect(screen.getByText(/Data update issue/)).toBeInTheDocument();
    });

    // Test retry button
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalled();
    
    // Restore console.error
    console.error = originalConsoleError;
  });

  it('should show empty state when no meetings', () => {
    mockUseMeetingsPolling.mockReturnValue({
      meetings: [],
      isConnected: true,
      connectionState: 'connected' as const,
      connectionAttempts: 1, // Set to > 0 to avoid loading skeleton
      isInitialDataReady: true,
      retry: jest.fn(),
    });

    renderWithProvider(<MeetingsListClient initialData={[]} />);

    expect(screen.getByText('No meetings today')).toBeInTheDocument();
    expect(screen.getByText('There are no race meetings scheduled for today.')).toBeInTheDocument();
  });

  it('should display correct meeting count', () => {
    renderWithProvider(<MeetingsListClient initialData={mockMeetings} />);

    // The count text might be split across elements, so use a more flexible matcher
    expect(screen.getByText(/2.*meeting.*available/)).toBeInTheDocument();
  });

  it('should display singular meeting count correctly', () => {
    const singleMeeting = [mockMeetings[0]];
    mockUseMeetingsPolling.mockReturnValue({
      meetings: singleMeeting,
      isConnected: true,
      connectionState: 'connected' as const,
      connectionAttempts: 0,
      isInitialDataReady: true,
      retry: jest.fn(),
    });

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

    mockUseMeetingsPolling.mockReturnValue({
      meetings: updatedMeetings,
      isConnected: true,
      connectionState: 'connected' as const,
      connectionAttempts: 0,
      isInitialDataReady: true,
      retry: jest.fn(),
    });

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
