'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import type { SortableColumn, SortDirection, GridSortState } from '@/types/enhancedGrid';

interface SortableColumnHeaderProps {
  column: SortableColumn;
  label: string;
  currentSort: GridSortState;
  onSort: (column: SortableColumn, direction: SortDirection) => void;
  disabled?: boolean;
  className?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

interface SortableColumnsProps {
  columns: Array<{
    key: SortableColumn;
    label: string;
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
    className?: string;
  }>;
  currentSort: GridSortState;
  onSort: (column: SortableColumn, direction: SortDirection) => void;
  disabled?: boolean;
  className?: string;
}

// Sort direction icons
const SortIcons = {
  asc: '↑',
  desc: '↓',
  none: '↕'
} as const;

// Column configuration with sorting capabilities
const COLUMN_CONFIG: Record<SortableColumn, {
  label: string;
  sortable: boolean;
  align: 'left' | 'center' | 'right';
  description: string;
}> = {
  runnerNumber: {
    label: '#',
    sortable: true,
    align: 'center',
    description: 'Sort by runner number'
  },
  runnerName: {
    label: 'Runner / Jockey / Trainer',
    sortable: true,
    align: 'left',
    description: 'Sort by runner name'
  },
  winOdds: {
    label: 'Win Odds',
    sortable: true,
    align: 'right',
    description: 'Sort by win odds'
  },
  placeOdds: {
    label: 'Place Odds',
    sortable: true,
    align: 'right',
    description: 'Sort by place odds'
  },
  holdPercentage: {
    label: 'Money %',
    sortable: true,
    align: 'right',
    description: 'Sort by money flow percentage'
  },
  poolMoney: {
    label: 'Pool Money',
    sortable: true,
    align: 'right',
    description: 'Sort by pool money amount'
  },
  jockey: {
    label: 'Jockey',
    sortable: true,
    align: 'left',
    description: 'Sort by jockey name'
  }
};

// Memoized individual sortable column header
const SortableColumnHeader = memo(function SortableColumnHeader({
  column,
  label,
  currentSort,
  onSort,
  disabled = false,
  className = '',
  align = 'left',
  sortable = true
}: SortableColumnHeaderProps) {
  const isActive = currentSort.column === column;
  const currentDirection = isActive ? currentSort.direction : null;

  // Calculate next sort direction
  const nextDirection = useMemo((): SortDirection => {
    if (!isActive) return 'asc';
    return currentDirection === 'asc' ? 'desc' : 'asc';
  }, [isActive, currentDirection]);

  // Handle sort click
  const handleSort = useCallback(() => {
    if (!sortable || disabled) return;
    onSort(column, nextDirection);
  }, [sortable, disabled, onSort, column, nextDirection]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!sortable || disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSort();
    }
  }, [sortable, disabled, handleSort]);

  // Generate CSS classes
  const headerClassName = useMemo(() => {
    const baseClasses = `px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`;
    const alignClasses = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right'
    };
    const interactionClasses = sortable && !disabled 
      ? 'cursor-pointer hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:bg-gray-100 focus:text-gray-700'
      : '';
    const activeClasses = isActive ? 'bg-gray-100 text-gray-700' : '';
    
    return `${baseClasses} ${alignClasses[align]} ${interactionClasses} ${activeClasses}`.trim();
  }, [className, align, sortable, disabled, isActive]);

  // Generate sort indicator
  const sortIndicator = useMemo(() => {
    if (!sortable) return null;
    
    const icon = currentDirection ? SortIcons[currentDirection] : SortIcons.none;
    const iconColor = isActive ? 'text-blue-600' : 'text-gray-400';
    
    return (
      <span 
        className={`ml-1 ${iconColor} transition-colors`}
        aria-hidden="true"
      >
        {icon}
      </span>
    );
  }, [sortable, currentDirection, isActive]);

  // Accessibility label
  const accessibilityLabel = useMemo(() => {
    if (!sortable) return label;
    
    const sortStatus = isActive 
      ? `sorted ${currentDirection === 'asc' ? 'ascending' : 'descending'}`
      : 'not sorted';
    
    return `${label}, ${sortStatus}. Click to sort ${nextDirection === 'asc' ? 'ascending' : 'descending'}.`;
  }, [label, sortable, isActive, currentDirection, nextDirection]);

  return (
    <th
      scope="col"
      className={headerClassName}
      role="columnheader"
      aria-sort={isActive ? (currentDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={sortable && !disabled ? 0 : -1}
      onClick={handleSort}
      onKeyDown={handleKeyDown}
      aria-label={accessibilityLabel}
      title={sortable ? COLUMN_CONFIG[column]?.description : undefined}
    >
      <div className="flex items-center justify-start">
        <span>{label}</span>
        {sortIndicator}
        {currentSort.isLoading && isActive && (
          <span className="ml-2 animate-spin">⟳</span>
        )}
      </div>
    </th>
  );
});

// Main sortable columns component
export const SortableColumns = memo(function SortableColumns({
  columns,
  currentSort,
  onSort,
  disabled = false,
  className = ''
}: SortableColumnsProps) {
  // Handle keyboard navigation between columns
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    const currentIndex = columns.findIndex(col => col.key === currentSort.column);
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextIndex = Math.min(columns.length - 1, currentIndex + 1);
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = columns.length - 1;
        break;
      default:
        return; // Don't prevent default for other keys
    }

    if (nextIndex !== currentIndex) {
      const nextColumn = columns[nextIndex];
      if (nextColumn && nextColumn.sortable !== false) {
        // Focus the new column header
        const headers = document.querySelectorAll('[role="columnheader"][tabindex="0"]');
        const targetHeader = headers[nextIndex] as HTMLElement;
        if (targetHeader) {
          targetHeader.focus();
        }
      }
    }
  }, [disabled, columns, currentSort.column]);

  return (
    <thead 
      className={`bg-gray-50 ${className}`} 
      role="rowgroup"
      onKeyDown={handleKeyDown}
    >
      <tr role="row">
        {columns.map((column) => (
          <SortableColumnHeader
            key={column.key}
            column={column.key}
            label={column.label}
            currentSort={currentSort}
            onSort={onSort}
            disabled={disabled}
            className={column.className}
            align={column.align || COLUMN_CONFIG[column.key]?.align || 'left'}
            sortable={column.sortable !== false && COLUMN_CONFIG[column.key]?.sortable !== false}
          />
        ))}
      </tr>
      
      {/* Screen reader instructions */}
      <tr className="sr-only">
        <td colSpan={columns.length}>
          Column headers are sortable. Use Enter or Space to sort by a column. 
          Use arrow keys to navigate between column headers.
          Current sort: {COLUMN_CONFIG[currentSort.column]?.label || currentSort.column} {currentSort.direction}.
        </td>
      </tr>
    </thead>
  );
});

// Utility hook for managing sort state
export function useSortableColumns(initialColumn: SortableColumn = 'runnerNumber', initialDirection: SortDirection = 'asc') {
  const [sortState, setSortState] = useState<GridSortState>({
    column: initialColumn,
    direction: initialDirection,
    isLoading: false
  });

  const handleSort = useCallback((column: SortableColumn, direction: SortDirection) => {
    setSortState(prev => ({
      ...prev,
      column,
      direction,
      isLoading: true
    }));

    // Simulate async sorting (in real implementation, this would be actual sorting logic)
    setTimeout(() => {
      setSortState(prev => ({
        ...prev,
        isLoading: false
      }));
    }, 100);
  }, []);

  const sortEntrants = useCallback((entrants: any[], sortState: GridSortState) => {
    const { column, direction } = sortState;
    
    return [...entrants].sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (column) {
        case 'runnerNumber':
          valueA = a.runnerNumber;
          valueB = b.runnerNumber;
          break;
        case 'runnerName':
          valueA = a.name?.toLowerCase() || '';
          valueB = b.name?.toLowerCase() || '';
          break;
        case 'winOdds':
          valueA = a.winOdds || 999;
          valueB = b.winOdds || 999;
          break;
        case 'placeOdds':
          valueA = a.placeOdds || 999;
          valueB = b.placeOdds || 999;
          break;
        case 'holdPercentage':
          valueA = a.holdPercentage || 0;
          valueB = b.holdPercentage || 0;
          break;
        case 'poolMoney':
          valueA = a.poolMoney?.total || 0;
          valueB = b.poolMoney?.total || 0;
          break;
        case 'jockey':
          valueA = a.jockey?.toLowerCase() || '';
          valueB = b.jockey?.toLowerCase() || '';
          break;
        default:
          return 0;
      }

      // Handle numeric vs string comparison
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return direction === 'asc' ? valueA - valueB : valueB - valueA;
      } else {
        const stringA = String(valueA);
        const stringB = String(valueB);
        return direction === 'asc' 
          ? stringA.localeCompare(stringB)
          : stringB.localeCompare(stringA);
      }
    });
  }, []);

  return {
    sortState,
    handleSort,
    sortEntrants,
    setSortState
  };
}

export default SortableColumns;