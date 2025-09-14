import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MeetingCard } from '../MeetingCard';
import { Meeting } from '@/types/meetings';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

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

  // Mock the meeting completion status API
  beforeEach(() => {
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

  it('should have no accessibility violations', async () => {
    const { container } = render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async state updates to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Check for accessibility violations
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should display meeting information with proper semantics', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async state updates to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Meeting should be wrapped in article
    const meetingArticle = screen.getByRole('article');
    expect(meetingArticle).toBeInTheDocument();
    expect(meetingArticle).toHaveAttribute('aria-labelledby', 'meeting-1');
    
    // Meeting title should be h3
    const meetingHeading = screen.getByRole('heading', { level: 3 });
    expect(meetingHeading).toHaveTextContent('Flemington Race Meeting');
    expect(meetingHeading).toHaveAttribute('id', 'meeting-1');
    
    // Check status indicator has proper labeling
    const statusElement = screen.getByText(/live|upcoming|completed/i);
    expect(statusElement).toHaveAttribute('aria-label');
  });

  it('should have accessible country flag information', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Country flag should have proper labeling
    const countryFlag = screen.getByLabelText(/Australia flag/i);
    expect(countryFlag).toBeInTheDocument();
    
    // Country container should also have proper labeling
    const countryContainer = screen.getByLabelText(/Country: AUS/i);
    expect(countryContainer).toBeInTheDocument();
  });

  it('should announce status changes to screen readers', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async state updates to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Status should have proper aria-label for screen readers
    const statusElement = screen.getByLabelText(/Status:/);
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('inline-flex');
  });

  it('should have proper color contrast for status indicators', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for async state updates to complete
    await waitFor(() => {
      expect(screen.getByLabelText(/Status:/)).toBeInTheDocument();
    });
    
    // Status badges should have proper contrast classes
    const statusElement = screen.getByLabelText(/Status:/);
    expect(statusElement).toHaveClass(/bg-(green|blue|gray)-100/);
    expect(statusElement).toHaveClass(/text-(green|blue|gray)-800/);
  });

  it('should display time information in accessible format', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByRole('time')).toBeInTheDocument();
    });
    
    // Time element should be properly formatted
    const timeElement = screen.getByRole('time');
    expect(timeElement).toHaveAttribute('datetime', '2024-01-01T10:00:00Z');
    expect(timeElement).toHaveAttribute('aria-label');
    expect(timeElement).toHaveTextContent(/\d{2}:\d{2}/); // HH:MM format
  });

  it('should have proper focus management', async () => {
    render(<MeetingCard meeting={mockMeeting} />);
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByRole('article')).toBeInTheDocument();
    });
    
    // Meeting card should be focusable within its container
    const article = screen.getByRole('article');
    expect(article).toHaveClass('focus-within:ring-2');
  });

  it('should provide clear race type information', async () => {
    render(<MeetingCard meeting={mockMeeting} />);

    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByText(/THROUGHBRED/)).toBeInTheDocument();
    });

    // Race type should be clearly displayed
    expect(screen.getByText(/THROUGHBRED/)).toBeInTheDocument();
  });

  it('should handle missing optional data gracefully', async () => {
    const incompleteEvent: Meeting = {
      ...mockMeeting,
      firstRaceTime: undefined,
    };
    
    const { container } = render(<MeetingCard meeting={incompleteEvent} />);
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    });
    
    // Should still render without errors
    expect(screen.getByText('Flemington Race Meeting')).toBeInTheDocument();
    
    // Should not have accessibility violations even with missing data
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});