export interface Meeting {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  meetingId: string;
  meetingName: string;
  country: string;
  raceType: string;
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