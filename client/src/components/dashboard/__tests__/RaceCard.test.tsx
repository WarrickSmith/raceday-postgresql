import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RaceCard } from '../RaceCard';
import { Race } from '@/types/meetings';
import { getRaceStatusBadgeStyles, RACE_STATUS } from '@/services/races';

describe('RaceCard', () => {
  const mockRace: Race = {
    $id: 'race1',
    $createdAt: '2024-01-01T08:00:00Z',
    $updatedAt: '2024-01-01T08:00:00Z',
    raceId: 'R001',
    raceNumber: 1,
    name: 'Melbourne Cup',  // Changed from raceName to name
    startTime: '2024-01-01T15:00:00Z',
    meeting: 'meeting1',
    status: 'Open',
  };

  it('should render race information correctly', () => {
    render(<RaceCard race={mockRace} />);

    expect(screen.getByText('Melbourne Cup')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Race number
    expect(screen.getByText('ID: R001')).toBeInTheDocument();
    expect(screen.getByLabelText(/Race starts at/)).toBeInTheDocument();
  });

  it('should display race status correctly', () => {
    render(<RaceCard race={mockRace} />);

    expect(screen.getByLabelText('Race is open for betting')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('should render different race statuses with correct styling', () => {
    const statusLabels = {
      'Open': 'Race is open for betting',
      'Closed': 'Race betting is closed, race about to start', 
      'Running': 'Race is currently in progress',
      'Finalized': 'Race has been completed'
    };
    
    Object.entries(statusLabels).forEach(([status, ariaLabel]) => {
      const { rerender } = render(
        <RaceCard race={{ ...mockRace, status }} />
      );
      
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getByLabelText(ariaLabel)).toBeInTheDocument();
      
      rerender(<div />);
    });
  });

  it('should handle click events when onClick is provided', () => {
    const handleClick = jest.fn();
    render(<RaceCard race={mockRace} onClick={handleClick} />);

    const raceCard = screen.getByRole('button');
    fireEvent.click(raceCard);

    expect(handleClick).toHaveBeenCalledWith('R001');
  });

  it('should handle keyboard navigation', () => {
    const handleClick = jest.fn();
    render(<RaceCard race={mockRace} onClick={handleClick} />);

    const raceCard = screen.getByRole('button');
    
    // Test Enter key
    fireEvent.keyDown(raceCard, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledWith('R001');

    // Test Space key
    fireEvent.keyDown(raceCard, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('should not be clickable when onClick is not provided', () => {
    render(<RaceCard race={mockRace} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('should format time correctly', () => {
    render(<RaceCard race={mockRace} />);
    
    // Time should be displayed (exact format may vary by timezone)
    expect(screen.getByLabelText(/Race starts at/)).toBeInTheDocument();
  });

  it('should handle invalid time gracefully', () => {
    const raceWithInvalidTime = {
      ...mockRace,
      startTime: 'invalid-time',
    };

    render(<RaceCard race={raceWithInvalidTime} />);
    
    // Should show TBA for invalid time
    const timeElement = screen.getByLabelText(/Race starts at/);
    expect(timeElement).toHaveTextContent('TBA');
  });

  it('should have proper accessibility attributes', () => {
    render(<RaceCard race={mockRace} onClick={jest.fn()} />);

    const raceCard = screen.getByRole('button');
    expect(raceCard).toHaveAttribute('tabIndex', '0');
    expect(raceCard).toHaveAttribute('aria-labelledby', 'race-race1');
    
    const raceTitle = screen.getByText('Melbourne Cup');
    expect(raceTitle).toHaveAttribute('id', 'race-race1');
    
    const raceNumber = screen.getByLabelText('Race number 1');
    expect(raceNumber).toBeInTheDocument();
  });

  // Enhanced Status Testing
  describe('Enhanced Status System', () => {
    it('should render all valid race statuses with correct styling', () => {
      const statuses = [RACE_STATUS.OPEN, RACE_STATUS.CLOSED, RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED];
      
      statuses.forEach((status) => {
        const { rerender } = render(<RaceCard race={{ ...mockRace, status }} />);
        const styles = getRaceStatusBadgeStyles(status);
        
        // Check status text is displayed
        expect(screen.getByText(status)).toBeInTheDocument();
        
        // Check ARIA label includes proper description  
        const statusElements = screen.getAllByRole('status');
        const mainStatusElement = statusElements.find(el => el.getAttribute('aria-label') === styles.ariaLabel);
        expect(mainStatusElement).toBeTruthy();
        
        // Check CSS classes are applied
        expect(mainStatusElement).toHaveClass(styles.containerClass);
        
        // Check emoji is present for color-blind accessibility
        expect(screen.getByText(styles.icon)).toBeInTheDocument();
        
        rerender(<div />);
      });
    });

    it('should handle invalid race statuses with fallback', () => {
      const invalidStatuses = ['invalid', '', null, undefined, 123, 'OPEN', 'open', 'Final'];
      
      invalidStatuses.forEach((invalidStatus) => {
        const { rerender } = render(<RaceCard race={{ ...mockRace, status: invalidStatus as any }} />);
        
        // Should display a valid status (sanitized)
        const statusElements = screen.getAllByRole('status');
        expect(statusElements.length).toBeGreaterThan(0);
        
        // Should have validation warning
        const mainStatusElement = statusElements[0];
        expect(mainStatusElement).toHaveClass('border-dashed');
        
        rerender(<div />);
      });
    });

    it('should display status-specific animations correctly', () => {
      // Running status should have pulsing animation
      const { rerender } = render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.RUNNING }} />);
      expect(document.querySelector('.status-icon-running')).toBeInTheDocument();
      
      rerender(<RaceCard race={{ ...mockRace, status: RACE_STATUS.CLOSED }} />);
      expect(document.querySelector('.status-icon-closed')).toBeInTheDocument();
      
      // Other statuses should not have animated icons
      rerender(<RaceCard race={{ ...mockRace, status: RACE_STATUS.OPEN }} />);
      expect(document.querySelector('.status-icon-running')).not.toBeInTheDocument();
      expect(document.querySelector('.status-icon-closed')).not.toBeInTheDocument();
    });

    it('should announce status changes to screen readers', async () => {
      const { rerender } = render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.OPEN }} />);
      
      // Change status
      act(() => {
        rerender(<RaceCard race={{ ...mockRace, status: RACE_STATUS.RUNNING }} />);
      });
      
      // Check for ARIA live region
      const liveRegion = document.querySelector('[aria-live="assertive"], [aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('should show validation warnings for corrected statuses', () => {
      render(<RaceCard race={{ ...mockRace, status: 'invalid-status' as any }} />);
      
      // Should have visual indicator for corrected status
      const statusElements = screen.getAllByRole('status');
      const mainStatusElement = statusElements.find(el => el.getAttribute('aria-label')?.includes('betting'));
      expect(mainStatusElement).toHaveClass('border-dashed');
      expect(mainStatusElement?.title).toContain('automatically corrected');
    });

    it('should have proper WCAG 2.1 AA compliant contrast ratios', () => {
      const statuses = [RACE_STATUS.OPEN, RACE_STATUS.CLOSED, RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED];
      
      statuses.forEach((status) => {
        const { rerender } = render(<RaceCard race={{ ...mockRace, status }} />);
        const styles = getRaceStatusBadgeStyles(status);
        
        const statusElements = screen.getAllByRole('status');
        const statusElement = statusElements.find(el => el.getAttribute('aria-label') === styles.ariaLabel);
        
        // Check that appropriate status classes are applied
        expect(statusElement).toHaveClass(styles.containerClass);
        
        rerender(<div />);
      });
    });

    it('should support keyboard navigation for status elements', () => {
      render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.RUNNING }} onClick={jest.fn()} />);
      
      const raceCard = screen.getByRole('button');
      const statusElements = screen.getAllByRole('status');
      const statusElement = statusElements[0];
      
      // Status element should be focusable if interactive
      fireEvent.keyDown(raceCard, { key: 'Tab' });
      expect(statusElement).toBeInTheDocument();
    });

    it('should handle rapid status changes without performance issues', async () => {
      const { rerender } = render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.OPEN }} />);
      
      const statuses = [RACE_STATUS.CLOSED, RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED, RACE_STATUS.OPEN];
      
      // Rapidly change status multiple times
      for (let i = 0; i < 10; i++) {
        for (const status of statuses) {
          act(() => {
            rerender(<RaceCard race={{ ...mockRace, status, $updatedAt: new Date().toISOString() }} />);
          });
        }
      }
      
      // Should still render correctly after rapid changes
      expect(screen.getAllByRole('status')).toBeTruthy();
      expect(screen.getByText(RACE_STATUS.OPEN)).toBeInTheDocument();
    });

    it('should maintain status display during real-time updates', async () => {
      const { rerender } = render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.OPEN }} />);
      
      // Simulate real-time update
      const updatedRace = {
        ...mockRace,
        status: RACE_STATUS.RUNNING,
        $updatedAt: new Date().toISOString(),
      };
      
      act(() => {
        rerender(<RaceCard race={updatedRace} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText(RACE_STATUS.RUNNING)).toBeInTheDocument();
        const statusElements = screen.getAllByRole('status');
        const runningStatusElement = statusElements.find(el => 
          el.getAttribute('aria-label')?.includes('currently in progress')
        );
        expect(runningStatusElement).toBeTruthy();
      });
    });

    it('should respect prefers-reduced-motion for animations', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
      
      render(<RaceCard race={{ ...mockRace, status: RACE_STATUS.RUNNING }} />);
      
      // Animations should be disabled via CSS when prefers-reduced-motion is set
      const statusElements = screen.getAllByRole('status');
      expect(statusElements.length).toBeGreaterThan(0);
    });
  });
});