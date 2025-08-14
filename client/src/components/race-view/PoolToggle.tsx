'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import type { PoolType } from '@/types/racePools';
import type { PoolViewState } from '@/types/enhancedGrid';

interface PoolToggleProps {
  poolViewState: PoolViewState;
  onPoolChange: (pool: PoolType) => void;
  onDisplayModeChange: (mode: 'odds' | 'money' | 'percentage') => void;
  disabled?: boolean;
  className?: string;
}

// Pool display configuration
const POOL_CONFIG = {
  win: { label: 'Win', shortLabel: 'W', color: 'blue', description: 'Win pool betting' },
  place: { label: 'Place', shortLabel: 'P', color: 'green', description: 'Place pool betting' },
  quinella: { label: 'Quinella', shortLabel: 'Q', color: 'purple', description: 'Quinella pool betting' },
  trifecta: { label: 'Trifecta', shortLabel: 'T', color: 'orange', description: 'Trifecta pool betting' },
  exacta: { label: 'Exacta', shortLabel: 'E', color: 'red', description: 'Exacta pool betting' },
  first4: { label: 'First 4', shortLabel: 'F4', color: 'indigo', description: 'First 4 pool betting' }
} as const;

const DISPLAY_MODE_CONFIG = {
  odds: { label: 'Odds', icon: '💰', description: 'Show odds values' },
  money: { label: 'Money', icon: '💵', description: 'Show money amounts' },
  percentage: { label: '%', icon: '📊', description: 'Show percentage values' }
} as const;

// Memoized pool button component
const PoolButton = memo(function PoolButton({
  pool,
  isActive,
  isAvailable,
  onClick,
  disabled
}: {
  pool: PoolType;
  isActive: boolean;
  isAvailable: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const config = POOL_CONFIG[pool];
  
  const buttonClassName = useMemo(() => {
    const baseClasses = 'px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    if (disabled || !isAvailable) {
      return `${baseClasses} bg-gray-100 text-gray-400 cursor-not-allowed`;
    }
    
    if (isActive) {
      return `${baseClasses} bg-${config.color}-600 text-white shadow-sm focus:ring-${config.color}-500`;
    }
    
    return `${baseClasses} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus:ring-${config.color}-500`;
  }, [isActive, isAvailable, disabled, config.color]);

  const handleClick = useCallback(() => {
    if (!disabled && isAvailable) {
      onClick();
    }
  }, [disabled, isAvailable, onClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || !isAvailable}
      aria-pressed={isActive}
      aria-label={`${config.description}${isActive ? ' (currently selected)' : ''}`}
      title={`${config.label}${!isAvailable ? ' (not available)' : ''}`}
    >
      <span className="hidden sm:inline">{config.label}</span>
      <span className="sm:hidden">{config.shortLabel}</span>
    </button>
  );
});

// Memoized display mode button component
const DisplayModeButton = memo(function DisplayModeButton({
  mode,
  isActive,
  onClick,
  disabled
}: {
  mode: 'odds' | 'money' | 'percentage';
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const config = DISPLAY_MODE_CONFIG[mode];
  
  const buttonClassName = useMemo(() => {
    const baseClasses = 'px-2 py-1 text-xs font-medium rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
    
    if (disabled) {
      return `${baseClasses} bg-gray-100 text-gray-400 cursor-not-allowed`;
    }
    
    if (isActive) {
      return `${baseClasses} bg-blue-100 text-blue-700 border border-blue-300`;
    }
    
    return `${baseClasses} bg-gray-100 text-gray-600 hover:bg-gray-200`;
  }, [isActive, disabled]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      onClick();
    }
  }, [disabled, onClick]);

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isActive}
      aria-label={`${config.description}${isActive ? ' (currently selected)' : ''}`}
      title={config.description}
    >
      <span className="hidden sm:inline">{config.label}</span>
      <span className="sm:hidden">{config.icon}</span>
    </button>
  );
});

export const PoolToggle = memo(function PoolToggle({
  poolViewState,
  onPoolChange,
  onDisplayModeChange,
  disabled = false,
  className = ''
}: PoolToggleProps) {
  const { activePool, displayMode, availablePools } = poolViewState;

  // Handle pool change with keyboard support
  const handlePoolChange = useCallback((pool: PoolType) => {
    onPoolChange(pool);
  }, [onPoolChange]);

  // Handle display mode change
  const handleDisplayModeChange = useCallback((mode: 'odds' | 'money' | 'percentage') => {
    onDisplayModeChange(mode);
  }, [onDisplayModeChange]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const currentIndex = availablePools.indexOf(activePool);
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        const nextIndex = (currentIndex + direction + availablePools.length) % availablePools.length;
        const nextPool = availablePools[nextIndex];
        if (nextPool) {
          handlePoolChange(nextPool);
        }
        break;
      }
      case ' ': {
        e.preventDefault();
        // Space key cycles through display modes
        const modes: Array<'odds' | 'money' | 'percentage'> = ['odds', 'money', 'percentage'];
        const currentModeIndex = modes.indexOf(displayMode);
        const nextMode = modes[(currentModeIndex + 1) % modes.length];
        handleDisplayModeChange(nextMode);
        break;
      }
    }
  }, [disabled, availablePools, activePool, displayMode, handlePoolChange, handleDisplayModeChange]);

  // Accessibility announcement for screen readers
  const accessibilityLabel = useMemo(() => {
    const poolLabel = POOL_CONFIG[activePool]?.label || activePool;
    const modeLabel = DISPLAY_MODE_CONFIG[displayMode]?.label || displayMode;
    return `Pool toggle controls. Currently showing ${poolLabel} pool in ${modeLabel} mode. Use arrow keys to change pools, space to change display mode.`;
  }, [activePool, displayMode]);

  return (
    <div 
      className={`pool-toggle-container ${className}`}
      role="toolbar"
      aria-label={accessibilityLabel}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      <div className="flex items-center justify-between space-x-4">
        {/* Pool Selection */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700 hidden sm:inline">
            Pool:
          </span>
          <div 
            className="flex space-x-1"
            role="radiogroup"
            aria-label="Pool selection"
          >
            {availablePools.map((pool) => (
              <PoolButton
                key={pool}
                pool={pool}
                isActive={pool === activePool}
                isAvailable={true}
                onClick={() => handlePoolChange(pool)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>

        {/* Display Mode Selection */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700 hidden sm:inline">
            View:
          </span>
          <div 
            className="flex space-x-1"
            role="radiogroup"
            aria-label="Display mode selection"
          >
            {(['odds', 'money', 'percentage'] as const).map((mode) => (
              <DisplayModeButton
                key={mode}
                mode={mode}
                isActive={mode === displayMode}
                onClick={() => handleDisplayModeChange(mode)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="sr-only" aria-live="polite">
        Use left and right arrow keys to navigate between pools. 
        Press space to cycle through display modes.
        Current selection: {POOL_CONFIG[activePool]?.label} pool, {DISPLAY_MODE_CONFIG[displayMode]?.label} view.
      </div>
    </div>
  );
});

// Utility hook for managing pool toggle state
export function usePoolToggle(initialPool: PoolType = 'win', availablePools: PoolType[] = ['win', 'place']) {
  const [poolViewState, setPoolViewState] = useState<PoolViewState>({
    activePool: initialPool,
    displayMode: 'odds',
    availablePools
  });

  const handlePoolChange = useCallback((pool: PoolType) => {
    setPoolViewState(prev => ({
      ...prev,
      activePool: pool
    }));
  }, []);

  const handleDisplayModeChange = useCallback((mode: 'odds' | 'money' | 'percentage') => {
    setPoolViewState(prev => ({
      ...prev,
      displayMode: mode
    }));
  }, []);

  return {
    poolViewState,
    handlePoolChange,
    handleDisplayModeChange,
    setPoolViewState
  };
}

export default PoolToggle;