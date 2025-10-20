import { render, screen, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/race_types';

describe('MeetingCard', () => {
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
    // Mock fetch for meeting completion status
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ isCompleted: false }),
      })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render meeting information correctly', async () => {
    render(<MeetingCard meeting={mockMeeting} />);

    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    expect(screen.getByText('THROUGHBRED')).toBeInTheDocument();
    // meeting_id is no longer displayed as per Task 1 requirements

    // Wait for async status to load
    await waitFor(() => {
      expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
    });
  });

  it('should display Australian flag for AUS country', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    expect(screen.getByLabelText('Country: AUS')).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should display New Zealand flag for NZ country', async () => {
    const nzMeeting = { ...mockMeeting, country: 'NZ' };
    render(<MeetingCard meeting={nzMeeting} />);
    
    expect(screen.getByLabelText('Country: NZ')).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should show upcoming status for future races', async () => {
    const futureMeeting = {
      ...mockMeeting,
      first_race_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    };
    
    render(<MeetingCard meeting={futureMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Status: upcoming')).toBeInTheDocument();
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
    });
  });

  it('should show live status for current races', async () => {
    const liveMeeting = {
      ...mockMeeting,
      first_race_time: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    };
    
    render(<MeetingCard meeting={liveMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Status: live')).toBeInTheDocument();
    });
  });

  it('should handle missing first race time gracefully', async () => {
    const meetingWithoutRaceTime = { ...mockMeeting, first_race_time: undefined };
    
    render(<MeetingCard meeting={meetingWithoutRaceTime} />);
    
    // Check that fallback time is displayed (format may vary by timezone)
    await waitFor(() => {
      expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
    });
  });

  it('should display race type correctly for Harness racing', async () => {
    const harnessMeeting = { 
      ...mockMeeting, 
      race_type: 'Harness Horse Racing', 
      category: RACE_TYPE_CODES.HARNESS 
    };
    
    render(<MeetingCard meeting={harnessMeeting} />);
    
    expect(screen.getByText('HARNESS')).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should have proper accessibility attributes', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-labelledby', 'meeting-1');
    
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveAttribute('id', 'meeting-1');
    
    await waitFor(() => {
      const timeElement = screen.getByLabelText(/First race at/);
      expect(timeElement).toHaveAttribute('dateTime');
    });
  });

  it('should truncate long meeting names', async () => {
    const longNameMeeting = {
      ...mockMeeting,
      meeting_name: 'Very Long Meeting Name That Should Be Truncated For Display Purposes',
    };
    
    render(<MeetingCard meeting={longNameMeeting} />);
    
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveClass('truncate');
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should display country code text beside flag', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Check that the country code text is visible
    expect(screen.getByText('AUS')).toBeInTheDocument();
    expect(screen.getByText('AUS')).toHaveClass('text-blue-600', 'font-bold');
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should display NZ country code for New Zealand', async () => {
    const nzMeeting = { ...mockMeeting, country: 'NZ' };
    render(<MeetingCard meeting={nzMeeting} />);
    
    expect(screen.getByText('NZ')).toBeInTheDocument();
    expect(screen.getByText('NZ')).toHaveClass('text-green-600', 'font-bold');
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    // Mock fetch failure
    global.fetch = jest.fn(() => Promise.reject(new Error('API Error'))) as jest.Mock;
    
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Should still render the meeting information
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    
    // Wait for error handling and fallback status
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should show completed status when API returns completed', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ isCompleted: true }),
      })
    ) as jest.Mock;

    render(<MeetingCard meeting={mockMeeting} />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Status: completed')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  it('should display weather information when available', async () => {
    const meetingWithWeather = {
      ...mockMeeting,
      weather: 'Fine',
    };
    
    render(<MeetingCard meeting={meetingWithWeather} />);
    
    expect(screen.getByText('Fine')).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should display track condition when available', async () => {
    const meetingWithTrack = {
      ...mockMeeting,
      track_condition: 'Good',
    };
    
    render(<MeetingCard meeting={meetingWithTrack} />);
    
    expect(screen.getByText(/Track: Good/)).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should handle unknown country gracefully', async () => {
    const unknownCountryMeeting = {
      ...mockMeeting,
      country: 'XX',
    };
    
    render(<MeetingCard meeting={unknownCountryMeeting} />);
    
    // Should display unknown country fallback
    expect(screen.getByText('XX')).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });

  it('should maintain component state during re-renders', async () => {
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Re-render with updated meeting data (simulating polling refresh)
    const updatedMeeting = { ...mockMeeting, $updatedAt: '2024-01-01T09:00:00Z' };
    rerender(<MeetingCard meeting={updatedMeeting} />);
    
    // Should still render correctly
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
  });
});
