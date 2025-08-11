'use client';

import React, { useMemo } from 'react';
import { OddsHistoryData } from '@/types/meetings';

const SPARKLINE_COLORS = {
  neutral: '#6b7280', // gray-500
  down: '#ef4444', // red-500 (odds shortening)
  up: '#3b82f6', // blue-500 (odds lengthening)
} as const;

interface SparklineChartProps {
  data: OddsHistoryData[];
  width?: number;
  height?: number;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

export const SparklineChart = React.memo<SparklineChartProps>(function SparklineChart({
  data,
  width = 80,
  height = 24,
  className = '',
  'aria-label': ariaLabel,
  'data-testid': dataTestId
}) {
  // Process data and generate SVG path using useMemo for performance
  const { path, strokeColor, trendDirection } = useMemo(() => {
    if (!data || data.length < 2) {
      return { 
        path: '', 
        strokeColor: SPARKLINE_COLORS.neutral,
        trendDirection: 'neutral' as const
      };
    }

    // Calculate min/max for scaling
    const values = data.map(d => d.winOdds);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    
    // Handle case where all values are the same
    if (range === 0) {
      const y = height / 2;
      const pathData = `M 0 ${y} L ${width} ${y}`;
      return { 
        path: pathData, 
        strokeColor: SPARKLINE_COLORS.neutral,
        trendDirection: 'neutral' as const
      };
    }

    // Generate path coordinates
    const coordinates = data.map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.winOdds - minValue) / range) * height;
      return { x, y };
    });

    // Build SVG path
    const pathData = coordinates.reduce((path, coord, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${path} ${command} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`;
    }, '');

    // Determine trend and color based on first vs last values
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    let trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
    let strokeColor: string = SPARKLINE_COLORS.neutral;

    if (lastValue < firstValue) {
      // Odds shortening (getting lower)
      trendDirection = 'down';
      strokeColor = SPARKLINE_COLORS.down;
    } else if (lastValue > firstValue) {
      // Odds lengthening (getting higher)
      trendDirection = 'up';
      strokeColor = SPARKLINE_COLORS.up;
    }

    return { path: pathData, strokeColor, trendDirection };
  }, [data, width, height]);

  // Generate accessible description
  const accessibleDescription = useMemo(() => {
    if (!data || data.length < 2) {
      return 'No odds history data available';
    }

    const firstOdds = data[0].winOdds;
    const lastOdds = data[data.length - 1].winOdds;
    const change = ((lastOdds - firstOdds) / firstOdds * 100).toFixed(1);
    
    if (trendDirection === 'down') {
      return `Odds shortening trend: from ${firstOdds} to ${lastOdds}, down ${Math.abs(parseFloat(change))}%`;
    } else if (trendDirection === 'up') {
      return `Odds lengthening trend: from ${firstOdds} to ${lastOdds}, up ${change}%`;
    } else {
      return `Odds stable: from ${firstOdds} to ${lastOdds}`;
    }
  }, [data, trendDirection]);

  if (!data?.length) {
    return (
      <div 
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width, height }}
        aria-label="No odds history available"
        data-testid={dataTestId}
      >
        <span className="text-xs text-gray-400">—</span>
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex items-center ${className}`}
      style={{ width, height }}
      role="img"
      aria-label={ariaLabel || accessibleDescription}
      data-testid={dataTestId}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        role="presentation"
      >
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      
      {/* Screen reader only text */}
      <span className="sr-only">
        {accessibleDescription}
      </span>
    </div>
  );
});

SparklineChart.displayName = 'SparklineChart';