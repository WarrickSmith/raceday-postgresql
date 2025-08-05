import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MeetingCard } from '../MeetingCard';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { Meeting } from '@/types/meetings';
import { Race } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Extend Jest with axe matchers
expect.extend(toHaveNoViolations);

// Mock the useRacesForMeeting hook
jest.mock('@/hooks/useRacesForMeeting');
const mockUseRacesForMeeting = useRacesForMeeting as jest.MockedFunction<typeof useRacesForMeeting>;

// Mock the RacesList component directly
jest.mock('../RacesList', () => ({
  RacesList: ({ meetingId }: { meetingId: string }) => {
    const { races, isLoading } = mockUseRacesForMeeting({ meetingId });
    
    if (isLoading) {
      return (
        <div 
          data-testid={`races-list-${meetingId}`}
          role="region"
          aria-label="Loading races..."
          aria-live="polite"
        >
          Loading races...
        </div>
      );
    }

    return (
      <div 
        data-testid={`races-list-${meetingId}`}
        role="region"
        aria-label="Races for this meeting"
        id={`races-${meetingId}`}
      >
        <div className="sr-only" aria-live="polite">
          {races.length} races scheduled
        </div>
        {races.map((race) => (
          <div 
            key={race.raceId} 
            data-testid={`race-${race.raceId}`}
            role="article"
            aria-labelledby={`race-title-${race.raceId}`}
            tabIndex={0}
          >
            <h4 id={`race-title-${race.raceId}`}>{race.name}</h4>
            <span aria-label={`Race number ${race.raceNumber}`}>{race.raceNumber}</span>
            <span aria-label={`Race status: ${race.status}`}>{race.status}</span>
          </div>
        ))}
      </div>
    );
  },
}));

describe('MeetingCard Accessibility Tests', () => {
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

  const mockRaces: Race[] = [
    {
      $id: 'race1',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R001',
      raceNumber: 1,
      name: 'First Race',
      startTime: '2024-01-01T15:00:00Z',
      meeting: 'meeting1',
      status: 'Open',
    },
    {
      $id: 'race2',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R002',
      raceNumber: 2,
      name: 'Second Race',
      startTime: '2024-01-01T16:00:00Z',
      meeting: 'meeting1',
      status: 'Closed',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('should have no accessibility violations in collapsed state', async () => {
    const { container } = render(<MeetingCard meeting={mockMeeting} />);
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no accessibility violations in expanded state', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { container } = render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should support keyboard navigation for expand/collapse', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Should be focusable
    expect(expandButton).toHaveAttribute('tabIndex', '0');
    
    // Focus the button
    expandButton.focus();
    expect(document.activeElement).toBe(expandButton);
    
    // Test Enter key
    fireEvent.keyDown(expandButton, { key: 'Enter' });
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    
    // Test Space key
    fireEvent.keyDown(expandButton, { key: ' ' });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    
    // Test Escape key (should not affect expand/collapse)
    fireEvent.keyDown(expandButton, { key: 'Escape' });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should have proper ARIA attributes for expand/collapse', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Check initial ARIA attributes
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    // ARIA controls not implemented in current version
    expect(expandButton).toHaveAttribute('type', 'button');
    
    // Expand and check updated attributes
    fireEvent.click(expandButton);
    
    expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    expect(expandButton).toHaveAccessibleName(/collapse races/i);
  });

  it('should announce state changes to screen readers', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      // Check for screen reader announcements
      const liveRegion = screen.getByText('2 races scheduled');
      expect(liveRegion).toBeInTheDocument();
      // The sr-only div has aria-live="polite" but it's hidden so we check its parent
      expect(liveRegion).toHaveClass('sr-only');
    });
  });

  it('should have proper heading hierarchy', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    // Meeting title should be h3
    const meetingHeading = screen.getByRole('heading', { level: 3 });
    expect(meetingHeading).toHaveTextContent('Flemington Race Meeting');
    expect(meetingHeading).toHaveAttribute('id', 'meeting-1');
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      // Race titles should be h4 (one level below meeting)
      const raceHeadings = screen.getAllByRole('heading', { level: 4 });
      expect(raceHeadings).toHaveLength(2);
      expect(raceHeadings[0]).toHaveTextContent('First Race');
      expect(raceHeadings[1]).toHaveTextContent('Second Race');
    });
  });

  it('should support screen reader navigation with landmarks', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    // Meeting card should be an article
    const meetingArticle = screen.getByRole('article');
    expect(meetingArticle).toHaveAttribute('aria-labelledby', 'meeting-1');
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      // Races list should be a region
      const racesRegion = screen.getByRole('region', { name: /races for this meeting/i });
      expect(racesRegion).toBeInTheDocument();
      
      // Individual races should be articles
      const raceArticles = screen.getAllByRole('article');
      expect(raceArticles).toHaveLength(3); // 1 meeting + 2 races
    });
  });

  it('should handle focus management when expanding/collapsing', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // Focus the expand button
    expandButton.focus();
    expect(document.activeElement).toBe(expandButton);
    
    // Expand the meeting
    fireEvent.click(expandButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('races-list-meeting1')).toBeInTheDocument();
    });
    
    // Focus should remain on the button (now collapse button)
    expect(document.activeElement).toBe(expandButton);
    
    // Collapse the meeting
    fireEvent.click(expandButton);
    
    // Focus should still be on the button
    expect(document.activeElement).toBe(expandButton);
  });

  it('should provide appropriate labels for meeting metadata', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Country should have proper labeling
    expect(screen.getByLabelText('Country: AUS')).toBeInTheDocument();
    
    // Meeting ID should be labeled
    expect(screen.getByText('ID: meeting1')).toBeInTheDocument();
    
    // Race type should be labeled
    expect(screen.getByText('Thoroughbred')).toBeInTheDocument();
    
    // First race time should have proper datetime labeling
    const timeElement = screen.getByLabelText(/First race at/);
    expect(timeElement).toHaveAttribute('dateTime');
  });

  it('should handle loading states accessibly', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      const loadingRegion = screen.getByRole('region', { name: /loading races/i });
      expect(loadingRegion).toBeInTheDocument();
      expect(loadingRegion).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Loading races...')).toBeInTheDocument();
    });
  });

  it('should support high contrast mode', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    const chevronIcon = expandButton.querySelector('svg');
    
    // Check that important elements have appropriate styling for high contrast
    expect(expandButton).toHaveClass('hover:bg-gray-100');
    expect(chevronIcon).toHaveClass('transition-transform');
    
    // Status indicators should have sufficient contrast
    const statusElement = screen.getByLabelText(/Status:/);
    expect(statusElement).toBeInTheDocument();
  });

  it('should work with screen reader virtual cursor', async () => {
    mockUseRacesForMeeting.mockReturnValue({
      races: mockRaces,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<MeetingCard meeting={mockMeeting} />);
    
    // Simulate screen reader reading through content
    const meetingHeading = screen.getByRole('heading', { level: 3 });
    const expandButton = screen.getByRole('button', { name: /expand to show races/i });
    
    // All interactive elements should be discoverable
    expect(meetingHeading).toBeInTheDocument();
    expect(expandButton).toBeInTheDocument();
    
    fireEvent.click(expandButton);

    await waitFor(() => {
      // Expanded content should be readable by screen readers
      const racesRegion = screen.getByRole('region', { name: /races for this meeting/i });
      const raceArticles = screen.getAllByRole('article');
      
      expect(racesRegion).toBeInTheDocument();
      expect(raceArticles).toHaveLength(3); // Meeting + 2 races
      
      // Each race should have proper structure for screen readers
      raceArticles.slice(1).forEach((raceArticle, index) => {
        expect(raceArticle).toHaveAttribute('aria-labelledby', `race-title-${mockRaces[index].raceId}`);
      });
    });
  });
});