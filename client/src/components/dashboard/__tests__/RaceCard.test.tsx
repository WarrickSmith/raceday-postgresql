import { render, screen, fireEvent } from '@testing-library/react';
import { RaceCard } from '../RaceCard';
import { Race } from '@/types/meetings';

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

    expect(screen.getByLabelText('Race status: Open')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('should render different race statuses with correct styling', () => {
    const statuses = ['Open', 'Closed', 'Running', 'Finalized'];
    
    statuses.forEach((status) => {
      const { rerender } = render(
        <RaceCard race={{ ...mockRace, status }} />
      );
      
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getByLabelText(`Race status: ${status}`)).toBeInTheDocument();
      
      // Running status should have animated pulse
      if (status === 'Running') {
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      }
      
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
});