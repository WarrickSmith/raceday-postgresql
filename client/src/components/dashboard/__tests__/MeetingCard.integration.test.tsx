import { render, screen, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

type MeetingStatusResponseBody = { isCompleted: boolean };

const createFetchResponse = (body: MeetingStatusResponseBody): Response => {
  if (typeof Response === 'undefined') {
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

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

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fetch for meeting completion status
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () =>
      createFetchResponse({ isCompleted: false })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should integrate with API to show meeting status', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for API call to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });

    // Should display the meeting information
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    expect(screen.getByText('THROUGHBRED')).toBeInTheDocument();
    
    // Verify API was called
    expect(global.fetch).toHaveBeenCalledWith('/api/meetings/meeting1/status');
  });

  it('should handle API errors gracefully', async () => {
    // Mock API failure
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
      throw new Error('API Error');
    });
    
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Should still render meeting info despite API error
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    
    // Wait for fallback status logic
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });

    // Should use fallback heuristic for status when API fails
    expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
  });

  it('should show completed status from API response', async () => {
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () =>
      createFetchResponse({ isCompleted: true })
    );

    render(<MeetingCard meeting={mockMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
    });

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('should update status when API response changes', async () => {
    let resolvePromise: ((value: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });

    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(() => responsePromise);

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Initially should show loading/default state
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();

    // Resolve the API call
    resolvePromise?.(createFetchResponse({ isCompleted: true }));

    await waitFor(() => {
      expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
    });

    const initialFetchCallCount = fetchMock.mock.calls.length;

    // Re-render with updated meeting (simulating real-time update)
    const updatedMeeting = { ...mockMeeting, $updatedAt: '2024-01-01T09:00:00Z' };
    rerender(<MeetingCard meeting={updatedMeeting} />);

    // Should maintain the completed status
    expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(initialFetchCallCount);
  });

  it('should handle different country codes properly', async () => {
    const nzMeeting = { ...mockMeeting, country: 'NZ' };
    
    render(<MeetingCard meeting={nzMeeting} />);
    
    // Should display correct country flag and code
    expect(screen.getByLabelText('Country: NZ')).toBeInTheDocument();
    expect(screen.getByText('NZ')).toBeInTheDocument();
    expect(screen.getByText('NZ')).toHaveClass('text-green-600');
    
    // Wait for status to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should handle race type categories correctly', async () => {
    const harnessMeeting = {
      ...mockMeeting,
      raceType: 'Harness Horse Racing',
      category: RACE_TYPE_CODES.HARNESS,
    };
    
    render(<MeetingCard meeting={harnessMeeting} />);
    
    // Should display correct race type
    expect(screen.getByText('HARNESS')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should integrate with real-time status determination', async () => {
    // Test with past race time (should be live)
    const pastMeeting = {
      ...mockMeeting,
      firstRaceTime: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    };
    
    render(<MeetingCard meeting={pastMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Status: live')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should handle missing optional data integration', async () => {
    const incompleteData = {
      ...mockMeeting,
      firstRaceTime: undefined,
      weather: undefined,
      trackCondition: undefined,
    };
    
    render(<MeetingCard meeting={incompleteData} />);
    
    // Should still render core information
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Should handle fallback time display
    expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
  });

  it('should integrate with weather and track conditions when available', async () => {
    const meetingWithConditions = {
      ...mockMeeting,
      weather: 'Fine',
      trackCondition: 'Good',
    };
    
    render(<MeetingCard meeting={meetingWithConditions} />);
    
    // Should display weather and track information
    expect(screen.getByText('Fine')).toBeInTheDocument();
    expect(screen.getByText(/Track: Good/)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should handle component lifecycle with async operations', async () => {
    const { unmount } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    });
    
    // Unmount component
    unmount();
    
    // Should cleanup properly without memory leaks
    // (This is mainly tested by the absence of console errors)
  });

  it('should integrate with memoization for performance', async () => {
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const initialFetchCallCount = fetchMock.mock.calls.length;
    
    // Re-render with identical props
    rerender(<MeetingCard meeting={mockMeeting} />);
    
    // Should not make additional API calls due to memoization
    expect(fetchMock.mock.calls.length).toBe(initialFetchCallCount);
    
    // Component should still be rendered
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
  });
});
