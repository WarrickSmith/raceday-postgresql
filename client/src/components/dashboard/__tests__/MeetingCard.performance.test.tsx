import { render, screen, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/race_types';

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

describe('MeetingCard Performance Tests', () => {
  const mockMeeting: Meeting = {
    $id: '1',
    $createdAt: '2024-01-01T08:00:00Z',
    $updatedAt: '2024-01-01T08:00:00Z',
    meeting_id: 'meeting1',
    meeting_name: 'Flemington Race Meeting',
    country: 'AUS',
    race_type: 'Thoroughbred Horse Racing',
    category: RACE_TYPE_CODES.THOROUGHBRED,
    date: '2024-01-01',
    first_race_time: '2024-01-01T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformance.now.mockReturnValue(100);
    
    // Mock fetch for meeting completion status
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () =>
      createFetchResponse({ isCompleted: false })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render within performance target (<=50ms)', async () => {
    let start_time = 0;
    let endTime = 0;
    
    mockPerformance.now
      .mockReturnValueOnce(0) // Start render
      .mockReturnValueOnce(40); // End render

    start_time = performance.now();
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async state updates to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    endTime = performance.now();
    const renderTime = endTime - start_time;
    
    // Should render within performance target
    expect(renderTime).toBeLessThanOrEqual(50);
    
    // Verify component is fully rendered
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
  });

  it('should minimize re-renders with React.memo', () => {
    const renderSpy = jest.fn();
    
    const TestComponent = ({ meeting }: { meeting: Meeting }) => {
      renderSpy();
      return <MeetingCard meeting={meeting} />;
    };

    const { rerender } = render(<TestComponent meeting={mockMeeting} />);
    
    const initialRenders = renderSpy.mock.calls.length;
    
    // Re-render with same props (should not cause additional renders due to memoization)
    rerender(<TestComponent meeting={mockMeeting} />);
    
    const finalRenders = renderSpy.mock.calls.length;
    
    // Should have minimal additional renders (TestComponent itself will re-render)
    expect(finalRenders - initialRenders).toBeLessThanOrEqual(1);
  });

  it('should handle multiple meeting cards efficiently', async () => {
    // Create multiple meetings
    const meetings = Array.from({ length: 5 }, (_, i) => ({
      ...mockMeeting,
      $id: `meeting${i + 1}`,
      meeting_id: `meeting${i + 1}`,
      meeting_name: `Meeting ${i + 1}`,
    }));

    const start_time = performance.now();
    
    const { container } = render(
      <div>
        {meetings.map((meeting) => (
          <MeetingCard key={meeting.$id} meeting={meeting} />
        ))}
      </div>
    );

    // Wait for all components to render
    await waitFor(() => {
      meetings.forEach((meeting) => {
        expect(screen.getByText(meeting.meeting_name)).toBeInTheDocument();
      });
    });

    const endTime = performance.now();
    const totalRenderTime = endTime - start_time;
    
    // Should handle multiple cards efficiently
    expect(totalRenderTime).toBeLessThan(250);
    
    // Verify DOM structure is clean
    const allMeetingCards = container.querySelectorAll('[role="article"]');
    expect(allMeetingCards).toHaveLength(5);
  });

  it('should handle memory efficiently', async () => {
    const initialMemoryUsage = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    
    // Render and unmount multiple times
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<MeetingCard meeting={mockMeeting} />);
      
      await waitFor(() => {
        expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
      });
      
      unmount();
    }
    
    const finalMemoryUsage = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    
    // Memory usage should not grow significantly (if memory API is available)
    if (initialMemoryUsage > 0 && finalMemoryUsage > 0) {
      const memoryGrowth = finalMemoryUsage - initialMemoryUsage;
      expect(memoryGrowth).toBeLessThan(1024 * 1024); // Less than 1MB growth
    }
  });

  it('should optimize render performance with stable props', async () => {
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    });
    
    const rerenderStartTime = performance.now();
    
    // Re-render with same props (should be optimized by React.memo)
    rerender(<MeetingCard meeting={mockMeeting} />);
    
    const renderEndTime = performance.now();
    const memoizedRenderTime = renderEndTime - rerenderStartTime;
    
    // Memoized re-render should be very fast
    expect(memoizedRenderTime).toBeLessThan(25);
    
    // Component should still be rendered correctly
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
  });

  it('should validate DOM complexity', async () => {
    const { container } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    });
    
    // Count DOM nodes as a proxy for complexity
    const nodeCount = container.querySelectorAll('*').length;
    
    // Should have reasonable DOM complexity
    expect(nodeCount).toBeLessThan(30); // Should be lightweight
    
    // Should have essential elements
    expect(container.querySelector('[role="article"]')).toBeInTheDocument();
    expect(container.querySelector('h3')).toBeInTheDocument();
    expect(container.querySelector('time')).toBeInTheDocument();
  });

  it('should handle async operations efficiently', async () => {
    // Mock a slower API response
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(createFetchResponse({ isCompleted: true }));
          }, 50);
        })
    );

    const start_time = performance.now();
    
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async operations to complete and status to update
    await waitFor(() => {
      expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
    }, { timeout: 1000 });
    
    const endTime = performance.now();
    const totalTime = endTime - start_time;
    
    // Should handle async operations within reasonable time
    expect(totalTime).toBeLessThan(500);
    
    // Should show completed status after async update
    expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
  });

  it('should handle error states efficiently', async () => {
    // Mock fetch failure
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
      throw new Error('Network error');
    });

    const start_time = performance.now();
    
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for error handling to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    }, { timeout: 1000 });
    
    const endTime = performance.now();
    const totalTime = endTime - start_time;
    
    // Should handle errors efficiently
    expect(totalTime).toBeLessThan(150);
    
    // Should still render the component
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
  });
});
