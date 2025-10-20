import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SparklineChart } from '../SparklineChart';
// Simplified odds data interface for testing (from MoneyFlowHistory)
interface OddsDataPoint {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  entrant: string;
  win_odds: number;
  timestamp: string;
}

// Mock data for testing
const mockOddsHistoryData: OddsDataPoint[] = [
  {
    $id: '1',
    $createdAt: '2025-08-11T10:00:00Z',
    $updatedAt: '2025-08-11T10:00:00Z',
    entrant: 'entrant1',
    win_odds: 3.5,
    timestamp: '2025-08-11T10:00:00Z'
  },
  {
    $id: '2',
    $createdAt: '2025-08-11T10:05:00Z',
    $updatedAt: '2025-08-11T10:05:00Z',
    entrant: 'entrant1',
    win_odds: 3.2,
    timestamp: '2025-08-11T10:05:00Z'
  },
  {
    $id: '3',
    $createdAt: '2025-08-11T10:10:00Z',
    $updatedAt: '2025-08-11T10:10:00Z',
    entrant: 'entrant1',
    win_odds: 2.8,
    timestamp: '2025-08-11T10:10:00Z'
  }
];

const mockFlatOddsData: OddsDataPoint[] = [
  {
    $id: '1',
    $createdAt: '2025-08-11T10:00:00Z',
    $updatedAt: '2025-08-11T10:00:00Z',
    entrant: 'entrant1',
    win_odds: 3.0,
    timestamp: '2025-08-11T10:00:00Z'
  },
  {
    $id: '2',
    $createdAt: '2025-08-11T10:05:00Z',
    $updatedAt: '2025-08-11T10:05:00Z',
    entrant: 'entrant1',
    win_odds: 3.0,
    timestamp: '2025-08-11T10:05:00Z'
  }
];

describe('SparklineChart', () => {
  it('renders sparkline with trending data', () => {
    render(
      <SparklineChart 
        data={mockOddsHistoryData} 
        data-testid="sparkline-test"
        aria-label="Test sparkline"
      />
    );

    const sparkline = screen.getByTestId('sparkline-test');
    expect(sparkline).toBeInTheDocument();
    
    // Should render an SVG
    const svg = sparkline.querySelector('svg');
    expect(svg).toBeInTheDocument();
    
    // Should have proper ARIA attributes
    expect(sparkline).toHaveAttribute('role', 'img');
    expect(sparkline).toHaveAttribute('aria-label', 'Test sparkline');
  });

  it('displays accessible description for shortening odds trend', () => {
    render(<SparklineChart data={mockOddsHistoryData} />);
    
    // Should include screen reader description for shortening trend
    expect(screen.getByText(/odds shortening trend/i)).toBeInTheDocument();
    expect(screen.getByText(/down/i)).toBeInTheDocument();
  });

  it('displays accessible description for lengthening odds trend', () => {
    const risingOddsData = [...mockOddsHistoryData].reverse();
    render(<SparklineChart data={risingOddsData} />);
    
    // Should include screen reader description for lengthening trend
    expect(screen.getByText(/odds lengthening trend/i)).toBeInTheDocument();
    expect(screen.getByText(/up/i)).toBeInTheDocument();
  });

  it('displays neutral state for flat odds', () => {
    render(<SparklineChart data={mockFlatOddsData} />);
    
    // Should include screen reader description for stable odds
    expect(screen.getByText(/odds stable/i)).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(
      <SparklineChart 
        data={[]} 
        data-testid="empty-sparkline"
      />
    );

    const sparkline = screen.getByTestId('empty-sparkline');
    expect(sparkline).toBeInTheDocument();
    
    // Should display dash for no data
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(sparkline).toHaveAttribute('aria-label', 'No odds history available');
  });

  it('handles single data point gracefully', () => {
    const singlePoint = [mockOddsHistoryData[0]];
    render(
      <SparklineChart 
        data={singlePoint} 
        data-testid="single-point-sparkline"
      />
    );

    const sparkline = screen.getByTestId('single-point-sparkline');
    expect(sparkline).toBeInTheDocument();
    
    // Should have SVG but with empty path for insufficient data
    const svg = sparkline.querySelector('svg');
    expect(svg).toBeInTheDocument();
    
    // Should have accessible description in screen reader text
    expect(sparkline).toHaveAttribute('aria-label', 'No odds history data available');
  });

  it('applies custom dimensions correctly', () => {
    render(
      <SparklineChart 
        data={mockOddsHistoryData}
        width={100}
        height={30}
        data-testid="custom-size-sparkline"
      />
    );

    const sparkline = screen.getByTestId('custom-size-sparkline');
    expect(sparkline).toHaveStyle({ width: '100px', height: '30px' });
    
    const svg = sparkline.querySelector('svg');
    expect(svg).toHaveAttribute('width', '100');
    expect(svg).toHaveAttribute('height', '30');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 30');
  });

  it('renders SVG path with correct attributes', () => {
    render(<SparklineChart data={mockOddsHistoryData} />);
    
    const svg = document.querySelector('svg');
    const path = svg?.querySelector('path');
    
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('fill', 'none');
    expect(path).toHaveAttribute('stroke-width', '1.5');
    expect(path).toHaveAttribute('stroke-linecap', 'round');
    expect(path).toHaveAttribute('stroke-linejoin', 'round');
  });

  it('uses correct colors for trend direction', () => {
    // Test shortening odds (red)
    const { rerender } = render(<SparklineChart data={mockOddsHistoryData} />);
    
    let path = document.querySelector('svg path');
    expect(path).toHaveAttribute('stroke', '#ef4444'); // red-500 for shortening odds
    
    // Test lengthening odds (blue)  
    const risingOddsData = [...mockOddsHistoryData].reverse();
    rerender(<SparklineChart data={risingOddsData} />);
    
    path = document.querySelector('svg path');
    expect(path).toHaveAttribute('stroke', '#3b82f6'); // blue-500 for lengthening odds
    
    // Test flat odds (gray)
    rerender(<SparklineChart data={mockFlatOddsData} />);
    
    path = document.querySelector('svg path');
    expect(path).toHaveAttribute('stroke', '#6b7280'); // gray for neutral
  });

  it('applies custom className', () => {
    render(
      <SparklineChart 
        data={mockOddsHistoryData}
        className="custom-sparkline-class"
        data-testid="classed-sparkline"
      />
    );

    const sparkline = screen.getByTestId('classed-sparkline');
    expect(sparkline).toHaveClass('custom-sparkline-class');
  });

  it('provides screen reader only content', () => {
    render(<SparklineChart data={mockOddsHistoryData} />);
    
    // Should have screen reader only span with accessible description
    const srOnlyElement = document.querySelector('.sr-only');
    expect(srOnlyElement).toBeInTheDocument();
    expect(srOnlyElement).toHaveTextContent(/odds.*trend/i);
  });
});