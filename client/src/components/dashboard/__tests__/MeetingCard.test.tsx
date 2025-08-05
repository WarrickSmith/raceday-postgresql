import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the dynamic RacesList import
jest.mock('next/dynamic', () => {
  return () => {
    const Component = ({ meetingId }: { meetingId: string }) => (
      <div data-testid={`races-list-${meetingId}`}>Mocked RacesList</div>
    );
    Component.displayName = 'MockedRacesList';
    return Component;
  };
});

describe('MeetingCard', () => {
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

  it('should render meeting information correctly', () => {
    render(<MeetingCard meeting={mockMeeting} />);

    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    expect(screen.getByText('Thoroughbred')).toBeInTheDocument();
    expect(screen.getByText('ID: meeting1')).toBeInTheDocument();
    // Check that time is displayed (format may vary by timezone)
    expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
  });

  it('should display Australian flag for AUS country', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    expect(screen.getByLabelText('Country: AUS')).toBeInTheDocument();
  });

  it('should display New Zealand flag for NZ country', () => {
    const nzMeeting = { ...mockMeeting, country: 'NZ' };
    render(<MeetingCard meeting={nzMeeting} />);
    
    expect(screen.getByLabelText('Country: NZ')).toBeInTheDocument();
  });

  it('should show upcoming status for future races', () => {
    const futureMeeting = {
      ...mockMeeting,
      firstRaceTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    };
    
    render(<MeetingCard meeting={futureMeeting} />);
    
    expect(screen.getByLabelText('Status: upcoming')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('should show live status for current races', () => {
    const liveMeeting = {
      ...mockMeeting,
      firstRaceTime: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    };
    
    render(<MeetingCard meeting={liveMeeting} />);
    
    expect(screen.getByLabelText('Status: live')).toBeInTheDocument();
  });

  it('should handle missing first race time gracefully', () => {
    const meetingWithoutRaceTime = { ...mockMeeting, firstRaceTime: undefined };
    
    render(<MeetingCard meeting={meetingWithoutRaceTime} />);
    
    // Check that fallback time is displayed (format may vary by timezone)
    expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
  });

  it('should display race type correctly for Harness racing', () => {
    const harnessMeeting = { 
      ...mockMeeting, 
      raceType: 'Harness Horse Racing', 
      category: RACE_TYPE_CODES.HARNESS 
    };
    
    render(<MeetingCard meeting={harnessMeeting} />);
    
    expect(screen.getByText('Harness')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-labelledby', 'meeting-1');
    
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveAttribute('id', 'meeting-1');
    
    const timeElement = screen.getByLabelText(/First race at/);
    expect(timeElement).toHaveAttribute('dateTime');
  });

  it('should truncate long meeting names', () => {
    const longNameMeeting = {
      ...mockMeeting,
      meetingName: 'Very Long Meeting Name That Should Be Truncated For Display Purposes',
    };
    
    render(<MeetingCard meeting={longNameMeeting} />);
    
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveClass('truncate');
  });

  it('should display country code text beside flag', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Check that the country code text is visible
    expect(screen.getByText('AUS')).toBeInTheDocument();
    expect(screen.getByText('AUS')).toHaveClass('text-blue-600', 'font-bold');
  });

  it('should display NZ country code for New Zealand', () => {
    const nzMeeting = { ...mockMeeting, country: 'NZ' };
    render(<MeetingCard meeting={nzMeeting} />);
    
    expect(screen.getByText('NZ')).toBeInTheDocument();
    expect(screen.getByText('NZ')).toHaveClass('text-green-600', 'font-bold');
  });

  it('should render expand/collapse button', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    expect(expandButton).toBeInTheDocument();
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should toggle expand/collapse state when button is clicked', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Initially collapsed
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId(`races-list-${mockMeeting.meetingId}`)).not.toBeInTheDocument();
    
    // Click to expand
    fireEvent.click(expandButton);
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    expect(expandButton).toHaveAccessibleName(/collapse races/i);
    
    // Wait for RacesList to be rendered
    await waitFor(() => {
      expect(screen.getByTestId(`races-list-${mockMeeting.meetingId}`)).toBeInTheDocument();
    });
    
    // Click to collapse
    fireEvent.click(expandButton);
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    expect(expandButton).toHaveAccessibleName(/expand to show races/i);
  });

  it('should handle keyboard navigation for expand/collapse', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Test Enter key
    fireEvent.keyDown(expandButton, { key: 'Enter' });
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    
    await waitFor(() => {
      expect(screen.getByTestId(`races-list-${mockMeeting.meetingId}`)).toBeInTheDocument();
    });
    
    // Test Space key to collapse
    fireEvent.keyDown(expandButton, { key: ' ' });
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should show chevron icon with correct rotation', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    const chevronIcon = expandButton.querySelector('svg');
    
    expect(chevronIcon).toBeInTheDocument();
    expect(chevronIcon).toHaveClass('transition-transform');
    
    // Click to expand and check rotation
    fireEvent.click(expandButton);
    
    expect(chevronIcon).toHaveClass('rotate-180');
  });

  it('should lazy load RacesList only when expanded', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // RacesList should not be in DOM initially
    expect(screen.queryByTestId(`races-list-${mockMeeting.meetingId}`)).not.toBeInTheDocument();
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);
    
    // RacesList should be lazy loaded after expansion
    await waitFor(() => {
      expect(screen.getByTestId(`races-list-${mockMeeting.meetingId}`)).toBeInTheDocument();
    });
  });

  it('should maintain expand state during re-renders', async () => {
    const { rerender } = render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Expand the meeting
    fireEvent.click(expandButton);
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    
    await waitFor(() => {
      expect(screen.getByTestId(`races-list-${mockMeeting.meetingId}`)).toBeInTheDocument();
    });
    
    // Re-render with updated meeting data (simulating real-time update)
    const updatedMeeting = { ...mockMeeting, $updatedAt: '2024-01-01T09:00:00Z' };
    rerender(<MeetingCard meeting={updatedMeeting} />);
    
    // Expand state should be maintained
    expect(screen.getByRole('button', { name: /collapse races/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(`races-list-${mockMeeting.meetingId}`)).toBeInTheDocument();
  });

  it('should have proper accessibility attributes for expand/collapse', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    expect(expandButton).toHaveAttribute('aria-label', 'Expand to show races');
  });
});