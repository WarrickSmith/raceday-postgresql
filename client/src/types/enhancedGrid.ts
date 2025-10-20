/**
 * Enhanced Grid State Management Types for v4.7 Race Interface
 * Supports sorting, pool toggle, and grid interaction state
 */

import type { PoolType } from './racePools';
import type { Entrant } from './meetings';

// Grid sorting configuration
export type SortableColumn = 
  | 'runner_number' 
  | 'runnerName' 
  | 'win_odds' 
  | 'place_odds' 
  | 'hold_percentage' 
  | 'pool_money' 
  | 'jockey';

export type SortDirection = 'asc' | 'desc';

export interface GridSortState {
  column: SortableColumn;
  direction: SortDirection;
  isLoading: boolean;
}

// Pool view toggle state
export interface PoolViewState {
  activePool: PoolType;
  displayMode: 'odds' | 'money' | 'percentage';
  availablePools: PoolType[];
}

// Grid display configuration
export interface GridDisplayConfig {
  showMoneyFlowColumns: boolean;
  showJockeySilks: boolean;
  compactMode: boolean;
  virtualScrolling: boolean;
  stickyColumns: boolean;
  columnWidths: Record<string, number>;
}

// Grid performance state
export interface GridPerformanceState {
  visibleRows: number;
  totalRows: number;
  renderTime: number;
  scrollPosition: number;
  isVirtualized: boolean;
}

// Enhanced grid state combining all aspects
export interface EnhancedGridState {
  sort: GridSortState;
  poolView: PoolViewState;
  display: GridDisplayConfig;
  performance: GridPerformanceState;
  selectedEntrant?: string;
  highlightedEntrants: string[];
  last_updated: string;
}

// Grid interaction events
export interface GridInteractionEvents {
  onSort: (column: SortableColumn, direction: SortDirection) => void;
  onPoolToggle: (pool: PoolType) => void;
  onDisplayModeChange: (mode: 'odds' | 'money' | 'percentage') => void;
  onEntrantSelect: (entrant_id: string) => void;
  onEntrantHighlight: (entrant_ids: string[]) => void;
  onColumnResize: (column: string, width: number) => void;
  onScroll: (position: number) => void;
}

// Keyboard navigation state
export interface KeyboardNavigationState {
  focusedRow: number;
  focusedColumn: number;
  isNavigating: boolean;
  lastKeyPressed: string;
  navigationMode: 'grid' | 'header' | 'footer';
}

// Grid accessibility configuration
export interface GridAccessibilityConfig {
  announceChanges: boolean;
  useAriaLabels: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderOptimized: boolean;
}

// Grid data processing state
export interface GridDataState {
  rawEntrants: Entrant[];
  sortedEntrants: Entrant[];
  filteredEntrants: Entrant[];
  isProcessing: boolean;
  processingTime: number;
  dataVersion: number;
}

// Complete enhanced grid context
export interface EnhancedGridContext {
  state: EnhancedGridState;
  data: GridDataState;
  keyboard: KeyboardNavigationState;
  accessibility: GridAccessibilityConfig;
  events: GridInteractionEvents;
  actions: {
    updateSort: (column: SortableColumn, direction: SortDirection) => void;
    togglePool: (pool: PoolType) => void;
    updateDisplayConfig: (config: Partial<GridDisplayConfig>) => void;
    setSelectedEntrant: (entrant_id: string | undefined) => void;
    highlightEntrants: (entrant_ids: string[]) => void;
    navigateKeyboard: (direction: 'up' | 'down' | 'left' | 'right') => void;
    resetState: () => void;
  };
}

// Grid update optimization
export interface GridUpdateOptimization {
  batchUpdates: boolean;
  updateThreshold: number; // minimum time between updates (ms)
  maxBatchSize: number;
  debounceDelay: number;
  prioritizeVisible: boolean;
}

// Grid error state
export interface GridErrorState {
  hasError: boolean;
  errorMessage?: string;
  errorType?: 'data' | 'render' | 'performance' | 'network';
  retryAttempts: number;
  lastErrorTime?: string;
}

// Default configurations
export const DEFAULT_GRID_DISPLAY_CONFIG: GridDisplayConfig = {
  showMoneyFlowColumns: true,
  showJockeySilks: true,
  compactMode: false,
  virtualScrolling: true,
  stickyColumns: true,
  columnWidths: {
    runner_number: 80,
    runnerName: 200,
    jockey: 150,
    win_odds: 100,
    place_odds: 100,
    hold_percentage: 120,
    pool_money: 140
  }
};

export const DEFAULT_POOL_VIEW_STATE: PoolViewState = {
  activePool: 'win',
  displayMode: 'odds',
  availablePools: ['win', 'place']
};

export const DEFAULT_GRID_ACCESSIBILITY_CONFIG: GridAccessibilityConfig = {
  announceChanges: true,
  useAriaLabels: true,
  highContrast: false,
  reducedMotion: false,
  screenReaderOptimized: false
};