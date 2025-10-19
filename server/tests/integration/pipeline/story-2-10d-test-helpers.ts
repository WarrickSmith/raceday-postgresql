/* eslint-disable @typescript-eslint/naming-convention */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { RaceData } from '../../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../../src/workers/messages.js'

const loadFixture = (relativePath: string): unknown => {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const contents = readFileSync(filePath, 'utf-8')
  return JSON.parse(contents) as unknown
}

const baseRaceData = loadFixture(
  '../../fixtures/nztab-api/race-2.10d.json'
) as RaceData

const baseTransformedRace = loadFixture(
  '../../fixtures/nztab-api/race-2.10d-transformed.json'
) as TransformedRace

export const cloneRaceData = (): RaceData =>
  JSON.parse(JSON.stringify(baseRaceData)) as RaceData

export const cloneTransformedRace = (): TransformedRace =>
  JSON.parse(JSON.stringify(baseTransformedRace)) as TransformedRace

export interface Story210DScenario {
  raceId: string
  meetingId: string
  entrantIds: string[]
  createRaceData(): RaceData
  createTransformedRace(): TransformedRace
}

export const buildScenario = (label: string): Story210DScenario => {
  const raceId = `story-2-10d-${label}`
  const meetingId = `${raceId}-meeting`
  const entrantIds = baseTransformedRace.entrants.map(
    (_, index) => `${raceId}-entrant-${String(index + 1)}`
  )

  return {
    raceId,
    meetingId,
    entrantIds,
    createRaceData: () => {
      const raceData = cloneRaceData()
      raceData.id = raceId
      raceData.meeting_id = meetingId
      if (raceData.meeting !== undefined && raceData.meeting !== null) {
        raceData.meeting.meeting = meetingId
        raceData.meeting.name = `Story 2.10D Fixture Meeting (${label})`
      }

      if (Array.isArray(raceData.entrants)) {
        raceData.entrants = raceData.entrants.map((entrant, index) => ({
          ...entrant,
          entrantId: entrantIds[index] ?? entrant.entrantId,
        }))
      }

      if (
        raceData.money_tracker !== undefined &&
        raceData.money_tracker !== null &&
        Array.isArray(raceData.money_tracker.entrants)
      ) {
        raceData.money_tracker.entrants =
          raceData.money_tracker.entrants.map((tracker, index) => ({
            ...tracker,
            entrant_id: entrantIds[index] ?? tracker.entrant_id,
          }))
      }

      return raceData
    },
    createTransformedRace: () => {
      const transformed = cloneTransformedRace()
      transformed.raceId = raceId

      if (transformed.meeting !== undefined && transformed.meeting !== null) {
        transformed.meeting.meeting_id = meetingId
        transformed.meeting.name = `Story 2.10D Fixture Meeting (${label})`
      }

      if (transformed.race !== undefined && transformed.race !== null) {
        transformed.race.race_id = raceId
        transformed.race.meeting_id = meetingId
        transformed.race.name = `Story 2.10D Fixture Race (${label})`
      }

      transformed.entrants = transformed.entrants.map((entrant, index) => ({
        ...entrant,
        entrant_id: entrantIds[index] ?? entrant.entrant_id,
        race_id: raceId,
      }))

      transformed.moneyFlowRecords = transformed.moneyFlowRecords.map(
        (record, index) => ({
          ...record,
          entrant_id: entrantIds[index] ?? record.entrant_id,
          race_id: raceId,
        })
      )

      if (Array.isArray(transformed.racePools)) {
        transformed.racePools = transformed.racePools.map((pool) => ({
          ...pool,
          race_id: raceId,
        }))
      }

      return transformed
    },
  }
}

/* eslint-enable @typescript-eslint/naming-convention */
