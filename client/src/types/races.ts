// Re-export Race from meetings.ts to maintain consistency
export type { Race } from './meetings';
import type { Race } from './meetings';

// Race status enum type
export const RACE_STATUS = {
  OPEN: 'Open',
  CLOSED: 'Closed', 
  RUNNING: 'Running',
  FINALIZED: 'Finalized',
} as const;

export type RaceStatus = typeof RACE_STATUS[keyof typeof RACE_STATUS];

// Race loading states
export interface RaceLoadingState {
  isLoading: boolean;
  error: string | null;
}

// Race display props
export interface RaceCardProps {
  race: Race;
  onClick?: (raceId: string) => void;
}

// Races list props
export interface RacesListProps {
  meetingId: string;
  races?: Race[];
  isLoading?: boolean;
  error?: string | null;
}