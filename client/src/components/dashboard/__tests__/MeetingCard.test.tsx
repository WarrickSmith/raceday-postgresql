import { render, screen } from '@testing-library/react';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';

describe('MeetingCard', () => {
  const mockMeeting: Meeting = {
    $id: '1',
    $createdAt: '2024-01-01T08:00:00Z',
    $updatedAt: '2024-01-01T08:00:00Z',
    meetingId: 'meeting1',
    meetingName: 'Flemington Race Meeting',
    country: 'AUS',
    raceType: 'Thoroughbred Horse Racing',
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
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should handle missing first race time gracefully', () => {
    const meetingWithoutRaceTime = { ...mockMeeting, firstRaceTime: undefined };
    
    render(<MeetingCard meeting={meetingWithoutRaceTime} />);
    
    // Check that fallback time is displayed (format may vary by timezone)
    expect(screen.getByLabelText(/First race at/)).toBeInTheDocument();
  });

  it('should display race type correctly for Harness racing', () => {
    const harnessMeeting = { ...mockMeeting, raceType: 'Harness' };
    
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
});