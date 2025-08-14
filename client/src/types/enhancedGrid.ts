/**
 * Enhanced Grid State Management Types for v4.7 Race Interface
 * Supports sorting, pool toggle, and grid interaction state
 */

import type { PoolType } from './racePools';
import type { Entrant } from './meetings';

// Grid sorting configuration
export type SortableColumn = 
  | 'runnerNumber' 
  | 'runnerName' 
  | 'winOdds' 
  | 'placeOdds' 
  | 'holdPercentage' 
  | 'poolMoney' 
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
  lastUpdated: string;
}

// Grid interaction events
export interface GridInteractionEvents {
  onSort: (column: SortableColumn, direction: SortDirection) => void;
  onPoolToggle: (pool: PoolType) => void;
  onDisplayModeChange: (mode: 'odds' | 'money' | 'percentage') => void;
  onEntrantSelect: (entrantId: string) => void;
  onEntrantHighlight: (entrantIds: string[]) => void;
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
    setSelectedEntrant: (entrantId: string | undefined) => void;
    highlightEntrants: (entrantIds: string[]) => void;
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
    runnerNumber: 80,
    runnerName: 200,
    jockey: 150,
    winOdds: 100,
    placeOdds: 100,
    holdPercentage: 120,
    poolMoney: 140
  }
};

export const DEFAULT_POOL_VIEW_STATE: PoolViewState = {
  activePool: 'win',
  displayMode: 'odds',
  availablePools: ['win', 'place', 'quinella']
};

export const DEFAULT_GRID_ACCESSIBILITY_CONFIG: GridAccessibilityConfig = {
  announceChanges: true,
  useAriaLabels: true,
  highContrast: false,
  reducedMotion: false,
  screenReaderOptimized: false
};