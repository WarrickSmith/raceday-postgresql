import type { RaceStatus } from '@/types/racePools';

export interface RaceStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}

// Comprehensive status configuration for consistent styling across components
export const STATUS_CONFIG: Record<RaceStatus, RaceStatusConfig> = {
  open: {
    label: 'Open',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: '🟢',
    description: 'Betting is open'
  },
  closed: {
    label: 'Closed',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: '🟡',
    description: 'Betting has closed'
  },
  interim: {
    label: 'Interim',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: '🔵',
    description: 'Interim results available'
  },
  final: {
    label: 'Final',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: '🏁',
    description: 'Final results confirmed'
  },
  abandoned: {
    label: 'Abandoned',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: '🔴',
    description: 'Race has been abandoned'
  },
  postponed: {
    label: 'Postponed',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: '⏸️',
    description: 'Race has been postponed'
  }
};

/**
 * Get status configuration for a given race status with fallback
 */
export function getStatusConfig(status: string | undefined): RaceStatusConfig {
  if (!status) return STATUS_CONFIG.open;
  
  // Handle case variations
  const normalizedStatus = status.toLowerCase() as RaceStatus;
  
  return STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.open;
}

/**
 * Get status badge classes for different sizes
 */
export function getStatusBadgeClasses(
  status: string | undefined, 
  size: 'small' | 'medium' | 'large' = 'medium'
): string {
  const config = getStatusConfig(status);
  
  const sizeClasses = {
    small: 'px-2 py-1 text-xs font-semibold rounded',
    medium: 'px-3 py-1.5 text-sm font-bold rounded-md', 
    large: 'px-6 py-3 text-2xl font-bold rounded-xl'
  };
  
  return `${sizeClasses[size]} ${config.color} ${config.bgColor}`;
}