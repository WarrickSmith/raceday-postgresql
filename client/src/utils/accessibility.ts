/**
 * Accessibility utilities for the RaceDay application
 * Provides enhanced screen reader support, keyboard navigation, and ARIA attributes
 */

// Screen reader announcements
export class ScreenReaderAnnouncer {
  private static instance: ScreenReaderAnnouncer;
  private announceElement: HTMLElement | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.initializeAnnouncer();
    }
  }

  public static getInstance(): ScreenReaderAnnouncer {
    if (!ScreenReaderAnnouncer.instance) {
      ScreenReaderAnnouncer.instance = new ScreenReaderAnnouncer();
    }
    return ScreenReaderAnnouncer.instance;
  }

  private initializeAnnouncer(): void {
    // Create a live region for announcements
    this.announceElement = document.createElement('div');
    this.announceElement.setAttribute('aria-live', 'assertive');
    this.announceElement.setAttribute('aria-atomic', 'true');
    this.announceElement.className = 'sr-only';
    this.announceElement.id = 'screen-reader-announcer';
    document.body.appendChild(this.announceElement);
  }

  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.announceElement) return;
    
    this.announceElement.setAttribute('aria-live', priority);
    this.announceElement.textContent = message;
    
    // Clear after announcement to allow repeated messages
    setTimeout(() => {
      if (this.announceElement) {
        this.announceElement.textContent = '';
      }
    }, 1000);
  }

  public announceRaceNavigation(raceName: string, meetingName: string): void {
    const message = `Navigated to ${raceName} at ${meetingName}`;
    this.announce(message, 'assertive');
  }

  public announceOddsUpdate(runnerName: string, newOdds: string, changeDirection: 'up' | 'down'): void {
    const direction = changeDirection === 'up' ? 'lengthened' : 'shortened';
    const message = `${runnerName} odds ${direction} to ${newOdds}`;
    this.announce(message, 'polite');
  }

  public announceRaceStatusChange(newStatus: string): void {
    const message = `Race status changed to ${newStatus}`;
    this.announce(message, 'assertive');
  }
}

// Keyboard navigation utilities
export const KeyboardHandler = {
  /**
   * Handle arrow key navigation for grid/table components
   */
  handleGridNavigation: (
    event: KeyboardEvent,
    currentCell: HTMLElement,
    gridContainer: HTMLElement
  ): void => {
    const { key } = event;
    
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      return;
    }

    event.preventDefault();
    
    const cells = Array.from(gridContainer.querySelectorAll('[role="gridcell"], [role="columnheader"]'));
    const currentIndex = cells.indexOf(currentCell);
    
    if (currentIndex === -1) return;

    const rows = Array.from(gridContainer.querySelectorAll('[role="row"]'));
    const currentRow = currentCell.closest('[role="row"]');
    const currentRowIndex = rows.indexOf(currentRow!);
    const cellsInRow = Array.from(currentRow!.querySelectorAll('[role="gridcell"], [role="columnheader"]'));
    const cellIndexInRow = cellsInRow.indexOf(currentCell);

    switch (key) {
      case 'ArrowUp':
        if (currentRowIndex > 0) {
          const prevRow = rows[currentRowIndex - 1];
          const prevRowCells = Array.from(prevRow.querySelectorAll('[role="gridcell"], [role="columnheader"]'));
          const targetCell = prevRowCells[Math.min(cellIndexInRow, prevRowCells.length - 1)];
          (targetCell as HTMLElement).focus();
        }
        break;
      case 'ArrowDown':
        if (currentRowIndex < rows.length - 1) {
          const nextRow = rows[currentRowIndex + 1];
          const nextRowCells = Array.from(nextRow.querySelectorAll('[role="gridcell"], [role="columnheader"]'));
          const targetCell = nextRowCells[Math.min(cellIndexInRow, nextRowCells.length - 1)];
          (targetCell as HTMLElement).focus();
        }
        break;
      case 'ArrowLeft':
        if (cellIndexInRow > 0) {
          (cellsInRow[cellIndexInRow - 1] as HTMLElement).focus();
        }
        break;
      case 'ArrowRight':
        if (cellIndexInRow < cellsInRow.length - 1) {
          (cellsInRow[cellIndexInRow + 1] as HTMLElement).focus();
        }
        break;
      case 'Home':
        (cellsInRow[0] as HTMLElement).focus();
        break;
      case 'End':
        (cellsInRow[cellsInRow.length - 1] as HTMLElement).focus();
        break;
    }
  },

  /**
   * Handle tab navigation for custom components
   */
  handleTabNavigation: (
    event: KeyboardEvent,
    items: HTMLElement[],
    currentIndex: number,
    onIndexChange: (index: number) => void
  ): void => {
    const { key } = event;
    
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      return;
    }

    event.preventDefault();
    
    let nextIndex = currentIndex;

    switch (key) {
      case 'ArrowLeft':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'ArrowRight':
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== currentIndex) {
      onIndexChange(nextIndex);
      items[nextIndex]?.focus();
    }
  }
};

// ARIA label generators
export const AriaLabels = {
  /**
   * Generate comprehensive label for runner row
   */
  generateRunnerRowLabel: (
    runnerNumber: number,
    runnerName: string,
    jockey: string,
    trainer: string,
    winOdds?: number,
    placeOdds?: number,
    isScratched?: boolean
  ): string => {
    const statusText = isScratched ? 'Scratched runner' : 'Active runner';
    const oddsText = winOdds ? `Win odds ${winOdds.toFixed(2)}` : 'Win odds unavailable';
    const placeOddsText = placeOdds ? `Place odds ${placeOdds.toFixed(2)}` : 'Place odds unavailable';
    
    return `${statusText} number ${runnerNumber}, ${runnerName}, jockey ${jockey}, trainer ${trainer}, ${oddsText}, ${placeOddsText}`;
  },

  /**
   * Generate label for navigation buttons
   */
  generateNavigationLabel: (
    direction: string,
    raceName?: string,
    meetingName?: string,
    startTime?: string
  ): string => {
    const baseLabel = `Navigate to ${direction} race`;
    
    if (!raceName) return `${baseLabel} - not available`;
    
    const timeText = startTime ? ` starting at ${new Date(startTime).toLocaleTimeString()}` : '';
    return `${baseLabel}: ${raceName} at ${meetingName}${timeText}`;
  },

  /**
   * Generate label for pool toggle buttons
   */
  generatePoolToggleLabel: (
    poolType: string,
    displayMode: string,
    isActive: boolean
  ): string => {
    const statusText = isActive ? 'currently selected' : '';
    return `${poolType} pool betting in ${displayMode} mode ${statusText}`.trim();
  },

  /**
   * Generate label for sortable column headers
   */
  generateSortableColumnLabel: (
    columnName: string,
    sortDirection?: 'asc' | 'desc' | null,
    sortable: boolean = true
  ): string => {
    if (!sortable) return columnName;
    
    const sortText = sortDirection 
      ? `sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}`
      : 'not sorted';
    
    return `${columnName}, ${sortText}. Click to ${
      !sortDirection ? 'sort ascending' : 
      sortDirection === 'asc' ? 'sort descending' : 'sort ascending'
    }`;
  }
};

// Focus management utilities
export const FocusManager = {
  /**
   * Set focus trap for modal dialogs
   */
  trapFocus: (container: HTMLElement): (() => void) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  },

  /**
   * Restore focus to previously focused element
   */
  createFocusRestorer: (): (() => void) => {
    const previousElement = document.activeElement as HTMLElement;
    
    return () => {
      previousElement?.focus();
    };
  }
};

// Color contrast utilities for dynamic content
export const ColorUtils = {
  /**
   * Get appropriate text color based on background
   */
  getContrastColor: (backgroundColor: string): 'text-white' | 'text-black' => {
    // Simple implementation - could be enhanced with proper contrast ratio calculation
    const darkColors = ['red', 'blue', 'green', 'purple', 'gray-800', 'gray-900'];
    const isDark = darkColors.some(color => backgroundColor.includes(color));
    return isDark ? 'text-white' : 'text-black';
  },

  /**
   * Ensure minimum contrast ratio for odds movements
   */
  getOddsChangeColor: (change: 'up' | 'down', highContrast = false): string => {
    if (highContrast) {
      return change === 'up' ? 'text-blue-800' : 'text-red-800';
    }
    return change === 'up' ? 'text-blue-600' : 'text-red-600';
  }
};

// Reduced motion preferences
export const MotionUtils = {
  /**
   * Check if user prefers reduced motion
   */
  prefersReducedMotion: (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * Get appropriate animation classes based on user preference
   */
  getAnimationClass: (normalAnimation: string, reducedAnimation = ''): string => {
    return MotionUtils.prefersReducedMotion() ? reducedAnimation : normalAnimation;
  }
};

// Export singleton instance
export const screenReader = typeof window !== 'undefined' ? ScreenReaderAnnouncer.getInstance() : null;
