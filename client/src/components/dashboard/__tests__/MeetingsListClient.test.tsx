import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingsListClient } from '../MeetingsListClient';
import { useRealtimeMeetings } from '@/hooks/useRealtimeMeetings';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the real-time hook
jest.mock('@/hooks/useRealtimeMeetings');

const mockUseRealtimeMeetings = useRealtimeMeetings as jest.MockedFunction<typeof useRealtimeMeetings>;

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
    mockUseRealtimeMeetings.mockReturnValue({
      meetings: mockMeetings,
      isConnected: true,
      connectionAttempts: 0,
      retry: jest.fn(),
    });
  });

  it('should render meetings list with connection status', () => {
    render(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText("Today's Race Meetings")).toBeInTheDocument();
    expect(screen.getByLabelText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    expect(screen.getByText('Addington Harness')).toBeInTheDocument();
  });

  it('should show disconnected status when not connected', () => {
    mockUseRealtimeMeetings.mockReturnValue({
      meetings: mockMeetings,
      isConnected: false,
      connectionAttempts: 1,
      retry: jest.fn(),
    });

    render(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('should display error banner when error occurs', async () => {
    // Mock console.error to suppress expected error output
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    const mockRetry = jest.fn();
    mockUseRealtimeMeetings.mockReturnValue({
      meetings: mockMeetings,
      isConnected: false,
      connectionAttempts: 2,
      retry: mockRetry,
    });

    // Simulate error by calling the hook with an error handler
    mockUseRealtimeMeetings.mockImplementation(({ onError: errorHandler }) => {
      // Simulate error after some time
      setTimeout(() => errorHandler?.(new Error('Connection failed')), 100);
      return {
        meetings: mockMeetings,
        isConnected: false,
        connectionAttempts: 2,
        retry: mockRetry,
      };
    });

    render(<MeetingsListClient initialData={mockMeetings} />);

    // Wait for error to be set
    await waitFor(() => {
      expect(screen.getByText(/Connection issue/)).toBeInTheDocument();
    });

    // Test retry button
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalled();
    
    // Restore console.error
    console.error = originalConsoleError;
  });

  it('should show empty state when no meetings', () => {
    mockUseRealtimeMeetings.mockReturnValue({
      meetings: [],
      isConnected: true,
      connectionAttempts: 1, // Set to > 0 to avoid loading skeleton
      retry: jest.fn(),
    });

    render(<MeetingsListClient initialData={[]} />);

    expect(screen.getByText('No meetings today')).toBeInTheDocument();
    expect(screen.getByText('There are no race meetings scheduled for today.')).toBeInTheDocument();
  });

  it('should display correct meeting count', () => {
    render(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('Showing 2 meetings for today')).toBeInTheDocument();
  });

  it('should display singular meeting count correctly', () => {
    const singleMeeting = [mockMeetings[0]];
    mockUseRealtimeMeetings.mockReturnValue({
      meetings: singleMeeting,
      isConnected: true,
      connectionAttempts: 0,
      retry: jest.fn(),
    });

    render(<MeetingsListClient initialData={singleMeeting} />);

    expect(screen.getByText('Showing 1 meeting for today')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<MeetingsListClient initialData={mockMeetings} />);

    const list = screen.getByRole('list', { name: 'Race meetings' });
    expect(list).toBeInTheDocument();

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
  });

  it('should handle real-time updates correctly', () => {
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

    const { rerender } = render(<MeetingsListClient initialData={mockMeetings} />);

    mockUseRealtimeMeetings.mockReturnValue({
      meetings: updatedMeetings,
      isConnected: true,
      connectionAttempts: 0,
      retry: jest.fn(),
    });

    rerender(<MeetingsListClient initialData={mockMeetings} />);

    expect(screen.getByText('New Meeting')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 meetings for today')).toBeInTheDocument();
  });
});