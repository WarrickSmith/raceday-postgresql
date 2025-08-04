import type { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes';

type SupportedRaceTypeCode = typeof SUPPORTED_RACE_TYPE_CODES[number];

export interface Meeting {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  meetingId: string;
  meetingName: string;
  country: string;
  raceType: string;
  category: SupportedRaceTypeCode; // Race type code: H or T (currently supported)
  date: string;
  firstRaceTime?: string;
}

export interface Race {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  raceId: string;
  raceNumber: number;
  raceName: string;
  startTime: string;
  meeting: string;
  status: string;
}

export interface MeetingWithRaces extends Meeting {
  races: Race[];
}