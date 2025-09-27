import { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes'
import type { Meeting } from '@/types/meetings'
import type { Models } from 'node-appwrite'

export type MeetingDocument = Models.Document & {
  meetingId?: string
  meetingName?: string
  country?: string
  raceType?: string
  category?: Meeting['category']
  date?: string
  weather?: string
  trackCondition?: string
}

export type RaceDocument = Models.Document & {
  raceId?: string
  raceNumber?: number
  name?: string
  startTime?: string
  actualStart?: string
  status?: string
  distance?: number
  trackCondition?: string
  weather?: string
  type?: string
  meeting?: string | MeetingDocument | null
}

export type EntrantDocument = Models.Document & {
  entrantId?: string
  name?: string
  runnerNumber?: number
  jockey?: string
  trainerName?: string
  silkColours?: string
  silkUrl64?: string
  silkUrl128?: string
  isScratched?: boolean
  raceId?: string
  race?: string | Models.Document | null
  fixedWinOdds?: number
  poolWinOdds?: number
  fixedPlaceOdds?: number
  poolPlaceOdds?: number
}

export type MoneyFlowHistoryDocument = Models.Document & {
  raceId?: string
  entrantId?: string
  entrant?: string
  holdPercentage?: number
  fixedWinOdds?: number
  poolWinOdds?: number
  fixedPlaceOdds?: number
  poolPlaceOdds?: number
}

export type RaceResultsDocument = Models.Document & {
  resultsAvailable?: boolean
  resultsData?: string
  dividendsData?: string
  fixedOddsData?: string
  resultStatus?: string
  photoFinish?: boolean
  stewardsInquiry?: boolean
  protestLodged?: boolean
  resultTime?: string
  race?: string
  raceId?: string
}

const FALLBACK_RACE_CATEGORY = SUPPORTED_RACE_TYPE_CODES[0]

export function normalizeMeetingDocument(
  meetingDoc: MeetingDocument | null,
  fallback: { id: string; createdAt: string; updatedAt: string }
): Meeting {
  return {
    $id: meetingDoc?.$id ?? fallback.id,
    $createdAt: meetingDoc?.$createdAt ?? fallback.createdAt,
    $updatedAt: meetingDoc?.$updatedAt ?? fallback.updatedAt,
    meetingId: meetingDoc?.meetingId ?? fallback.id,
    meetingName: meetingDoc?.meetingName ?? 'Unknown Meeting',
    country: meetingDoc?.country ?? 'Unknown',
    raceType: meetingDoc?.raceType ?? '',
    category: meetingDoc?.category ?? FALLBACK_RACE_CATEGORY,
    date: meetingDoc?.date ?? fallback.createdAt,
    weather: meetingDoc?.weather,
    trackCondition: meetingDoc?.trackCondition,
  }
}
