/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  MeetingDataSchema,
  EntrantSchema,
  OddsSchema,
  PoolSchema,
  RaceDataSchema,
  EntrantLiabilitySchema,
  validateRaceData,
  validateMeetingData,
  validateEntrant,
  type MeetingData,
  type Entrant,
  type Odds,
  type Pool,
  type RaceData,
  type EntrantLiability,
} from '../../src/clients/nztab-types.js'

describe('NZ TAB Type Definitions', () => {
  describe('MeetingDataSchema (AC1, AC7)', () => {
    it('should validate complete meeting data', () => {
      const validMeeting = {
        meeting: 'NZ-AKL-20251010',
        name: 'Auckland Thoroughbred',
        date: '2025-10-10T00:00:00Z',
        country: 'NZ',
        category: 'R',
        category_name: 'Thoroughbred',
        state: 'Auckland',
        track_condition: 'Good3',
        tote_status: 'open',
        meeting_date: '20251010',
        meeting_type: 'thoroughbred',
        tote_meeting_number: 1,
        tote_raceday_date: '2025-10-10',
      }

      const result = MeetingDataSchema.parse(validMeeting)
      expect(result).toEqual(validMeeting)
    })

    it('should validate minimal required meeting fields', () => {
      const minimalMeeting = {
        meeting: 'NZ-CHC-20251010',
        name: 'Christchurch Harness',
        date: '2025-10-10T12:00:00Z',
        country: 'NZ',
        category: 'H',
        category_name: 'Harness',
        state: 'Canterbury',
        track_condition: 'Fast',
        tote_status: 'closed',
      }

      const result = MeetingDataSchema.parse(minimalMeeting)
      expect(result).toEqual(minimalMeeting)
    })

    it('should reject invalid datetime format for date field', () => {
      const invalidMeeting = {
        meeting: 'NZ-WLG-20251010',
        name: 'Wellington',
        date: 'not-a-datetime', // Invalid datetime
        country: 'NZ',
        category: 'G',
        category_name: 'Greyhounds',
        state: 'Wellington',
        track_condition: 'Heavy',
        tote_status: 'open',
      }

      expect(() => MeetingDataSchema.parse(invalidMeeting)).toThrow()
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const meetingWithExtras = {
        meeting: 'AU-SYD-20251010',
        name: 'Sydney',
        date: '2025-10-10T00:00:00Z',
        country: 'AU',
        category: 'R',
        category_name: 'Thoroughbred',
        state: 'NSW',
        track_condition: 'Soft5',
        tote_status: 'interim',
        // Extra fields from future API version
        weather: 'Sunny',
        temperature: 24,
        wind_speed: 15,
      }

      const result = MeetingDataSchema.parse(meetingWithExtras)
      expect(result).toHaveProperty('weather', 'Sunny')
      expect(result).toHaveProperty('temperature', 24)
      expect(result).toHaveProperty('wind_speed', 15)
    })
  })

  describe('EntrantSchema (AC1, AC7)', () => {
    it('should validate complete entrant data with all Appwrite legacy fields', () => {
      const validEntrant = {
        entrantId: 'ENT-12345',
        name: 'Fast Runner',
        runnerNumber: 5,
        barrier: 3,
        raceId: 'RACE-789',
        fixedWinOdds: 3.5,
        fixedPlaceOdds: 1.8,
        poolWinOdds: 3.2,
        poolPlaceOdds: 1.6,
        isScratched: false,
        isLateScratched: false,
        scratchTime: null,
        runnerChange: null,
        favourite: true,
        mover: false,
        jockey: 'J. Smith',
        trainerName: 'T. Jones',
        silkColours: 'Red, White stripes',
        silkUrl64: 'https://example.com/silk64.png',
        silkUrl128: 'https://example.com/silk128.png',
        lastUpdated: '2025-10-10T14:30:00Z',
        importedAt: '2025-10-10T14:35:00Z',
      }

      const result = EntrantSchema.parse(validEntrant)
      expect(result).toEqual(validEntrant)
    })

    it('should validate minimal entrant with required fields only', () => {
      const minimalEntrant = {
        entrantId: 'ENT-67890',
        name: 'Slow Walker',
        runnerNumber: 12,
      }

      const result = EntrantSchema.parse(minimalEntrant)
      expect(result.entrantId).toBe('ENT-67890')
      expect(result.name).toBe('Slow Walker')
      expect(result.runnerNumber).toBe(12)
    })

    it('should reject negative runnerNumber (AC6)', () => {
      const invalidEntrant = {
        entrantId: 'ENT-INVALID',
        name: 'Invalid Runner',
        runnerNumber: -5, // Negative not allowed
      }

      expect(() => EntrantSchema.parse(invalidEntrant)).toThrow()
    })

    it('should reject non-float odds values (AC7)', () => {
      const invalidOdds = {
        entrantId: 'ENT-ODD',
        name: 'Odd Odds',
        runnerNumber: 8,
        fixedWinOdds: 'not-a-number', // Should be number
      }

      expect(() => EntrantSchema.parse(invalidOdds)).toThrow()
    })

    it('should reject non-boolean isScratched value (AC6)', () => {
      const invalidScratch = {
        entrantId: 'ENT-SCRATCH',
        name: 'Scratched',
        runnerNumber: 3,
        isScratched: 'yes', // Should be boolean
      }

      expect(() => EntrantSchema.parse(invalidScratch)).toThrow()
    })

    it('should accept null values for nullable fields', () => {
      const entrantWithNulls = {
        entrantId: 'ENT-NULL',
        name: 'Nullable Runner',
        runnerNumber: 7,
        barrier: null,
        fixedWinOdds: null,
        fixedPlaceOdds: null,
        isScratched: null,
        jockey: null,
      }

      const result = EntrantSchema.parse(entrantWithNulls)
      expect(result.barrier).toBeNull()
      expect(result.fixedWinOdds).toBeNull()
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const entrantWithExtras = {
        entrantId: 'ENT-EXTRA',
        name: 'Extra Runner',
        runnerNumber: 10,
        // Future API fields
        color: 'Bay',
        age: 4,
        weight: 56,
      }

      const result = EntrantSchema.parse(entrantWithExtras)
      expect(result).toHaveProperty('color', 'Bay')
      expect(result).toHaveProperty('age', 4)
      expect(result).toHaveProperty('weight', 56)
    })
  })

  describe('OddsSchema', () => {
    it('should validate fixed odds', () => {
      const fixedOdds = {
        type: 'fixed',
        odds: 4.5,
        eventTimestamp: '2025-10-10T14:30:00Z',
      }

      const result = OddsSchema.parse(fixedOdds)
      expect(result.type).toBe('fixed')
      expect(result.odds).toBe(4.5)
    })

    it('should validate pool odds', () => {
      const poolOdds = {
        type: 'pool',
        odds: 3.2,
      }

      const result = OddsSchema.parse(poolOdds)
      expect(result.type).toBe('pool')
    })

    it('should validate tote odds', () => {
      const toteOdds = {
        type: 'tote',
        odds: 5.8,
      }

      const result = OddsSchema.parse(toteOdds)
      expect(result.type).toBe('tote')
    })

    it('should reject invalid odds type (AC6)', () => {
      const invalidOdds = {
        type: 'invalid-type',
        odds: 2.5,
      }

      expect(() => OddsSchema.parse(invalidOdds)).toThrow()
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const oddsWithExtras = {
        type: 'fixed',
        odds: 6.0,
        bookmaker: 'NZ TAB',
        market: 'win',
      }

      const result = OddsSchema.parse(oddsWithExtras)
      expect(result).toHaveProperty('bookmaker')
      expect(result).toHaveProperty('market')
    })
  })

  describe('PoolSchema (AC7)', () => {
    it('should validate complete pool data with money flow fields', () => {
      const validPool = {
        totalPool: 125000.50,
        winPool: 75000.25,
        placePool: 50000.25,
        holdPercentage: 15.5,
        betPercentage: 8.2,
      }

      const result = PoolSchema.parse(validPool)
      expect(result).toEqual(validPool)
    })

    it('should accept null values for all pool fields', () => {
      const poolWithNulls = {
        totalPool: null,
        winPool: null,
        placePool: null,
        holdPercentage: null,
        betPercentage: null,
      }

      const result = PoolSchema.parse(poolWithNulls)
      expect(result.totalPool).toBeNull()
      expect(result.holdPercentage).toBeNull()
    })

    it('should validate partial pool data', () => {
      const partialPool = {
        totalPool: 50000,
        holdPercentage: 12.5,
      }

      const result = PoolSchema.parse(partialPool)
      expect(result.totalPool).toBe(50000)
      expect(result.holdPercentage).toBe(12.5)
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const poolWithExtras = {
        totalPool: 100000,
        winPool: 60000,
        placePool: 40000,
        exactaPool: 25000,
        trifectaPool: 15000,
      }

      const result = PoolSchema.parse(poolWithExtras)
      expect(result).toHaveProperty('exactaPool', 25000)
      expect(result).toHaveProperty('trifectaPool', 15000)
    })
  })

  describe('EntrantLiabilitySchema (AC7)', () => {
    it('should validate entrant liability with bet and hold percentages', () => {
      const validLiability = {
        entrant_id: 'ENT-123',
        bet_percentage: 15.5,
        hold_percentage: 12.3,
      }

      const result = EntrantLiabilitySchema.parse(validLiability)
      expect(result).toEqual(validLiability)
    })

    it('should reject missing required fields (AC6)', () => {
      const incompleteLiability = {
        entrant_id: 'ENT-456',
        bet_percentage: 10.0,
        // Missing hold_percentage
      }

      expect(() => EntrantLiabilitySchema.parse(incompleteLiability)).toThrow()
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const liabilityWithExtras = {
        entrant_id: 'ENT-789',
        bet_percentage: 8.5,
        hold_percentage: 7.2,
        exposure: 50000,
        risk_level: 'medium',
      }

      const result = EntrantLiabilitySchema.parse(liabilityWithExtras)
      expect(result).toHaveProperty('exposure', 50000)
      expect(result).toHaveProperty('risk_level', 'medium')
    })
  })

  describe('RaceDataSchema (AC1, AC3, AC8)', () => {
    it('should validate complete race data with all nested entities', () => {
      const validRace: RaceData = {
        id: 'RACE-123',
        name: 'Auckland Cup',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '15:30',
        race_number: 7,
        meeting_id: 'MTG-AKL-20251010',
        entrants: [
          {
            entrantId: 'ENT-1',
            name: 'Fast Horse',
            runnerNumber: 1,
            barrier: 2,
            fixedWinOdds: 3.5,
            fixedPlaceOdds: 1.8,
            isScratched: false,
          },
          {
            entrantId: 'ENT-2',
            name: 'Slow Horse',
            runnerNumber: 2,
            barrier: 5,
            fixedWinOdds: 8.0,
            fixedPlaceOdds: 2.5,
            isScratched: false,
          },
        ],
        pools: {
          totalPool: 150000,
          winPool: 90000,
          placePool: 60000,
          holdPercentage: 14.5,
          betPercentage: 85.5,
        },
        meeting: {
          meeting: 'NZ-AKL-20251010',
          name: 'Auckland',
          date: '2025-10-10T00:00:00Z',
          country: 'NZ',
          category: 'R',
          category_name: 'Thoroughbred',
          state: 'Auckland',
          track_condition: 'Good3',
          tote_status: 'open',
        },
      }

      const result = RaceDataSchema.parse(validRace)
      expect(result).toEqual(validRace)
      expect(result.entrants).toHaveLength(2)
      expect(result.pools?.totalPool).toBe(150000)
      expect(result.meeting?.name).toBe('Auckland')
    })

    it('should validate minimal race data', () => {
      const minimalRace = {
        id: 'RACE-456',
        name: 'Race 5',
        status: 'closed',
        race_date_nz: '2025-10-10',
        start_time_nz: '16:00',
      }

      const result = RaceDataSchema.parse(minimalRace)
      expect(result.id).toBe('RACE-456')
      expect(result.status).toBe('closed')
    })

    it('should validate all status enum values (AC6)', () => {
      const statuses = ['open', 'closed', 'interim', 'final', 'abandoned'] as const

      statuses.forEach((status) => {
        const race = {
          id: `RACE-${status}`,
          name: 'Test Race',
          status,
          race_date_nz: '2025-10-10',
          start_time_nz: '14:00',
        }

        const result = RaceDataSchema.parse(race)
        expect(result.status).toBe(status)
      })
    })

    it('should reject invalid status enum value (AC6)', () => {
      const invalidRace = {
        id: 'RACE-INVALID',
        name: 'Invalid Race',
        status: 'invalid-status',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:00',
      }

      expect(() => RaceDataSchema.parse(invalidRace)).toThrow()
    })

    it('should reject missing required field raceId (AC6)', () => {
      const noIdRace = {
        // Missing id
        name: 'No ID Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:00',
      }

      expect(() => RaceDataSchema.parse(noIdRace)).toThrow()
    })

    it('should reject malformed nested entrant structure (AC6)', () => {
      const malformedRace = {
        id: 'RACE-MALFORMED',
        name: 'Malformed Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:00',
        entrants: [
          {
            entrantId: 'ENT-1',
            name: 'Valid',
            runnerNumber: 1,
          },
          {
            entrantId: 'ENT-2',
            // Missing name field
            runnerNumber: 'invalid', // Should be number
          },
        ],
      }

      expect(() => RaceDataSchema.parse(malformedRace)).toThrow()
    })

    it('should reject malformed nested pool structure (AC6)', () => {
      const malformedPool = {
        id: 'RACE-POOL-BAD',
        name: 'Bad Pool',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:00',
        pools: {
          totalPool: 'not-a-number', // Should be number
          holdPercentage: 15.5,
        },
      }

      expect(() => RaceDataSchema.parse(malformedPool)).toThrow()
    })

    it('should allow passthrough of additional fields (AC8)', () => {
      const raceWithExtras = {
        id: 'RACE-EXTRA',
        name: 'Extra Fields Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:00',
        // Future API fields
        weather: 'Sunny',
        track_rating: 'Good',
        video_url: 'https://example.com/video',
        bet_types: ['win', 'place', 'exacta'],
      }

      const result = RaceDataSchema.parse(raceWithExtras)
      expect(result).toHaveProperty('weather', 'Sunny')
      expect(result).toHaveProperty('track_rating', 'Good')
      expect(result).toHaveProperty('video_url')
      expect(result).toHaveProperty('bet_types')
    })
  })

  describe('Validation helper functions (AC3, AC4)', () => {
    const mockLogger = {
      error: vi.fn(),
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe('validateRaceData', () => {
      it('should validate and return valid race data', () => {
        const validRace = {
          id: 'RACE-VALID',
          name: 'Valid Race',
          status: 'open',
          race_date_nz: '2025-10-10',
          start_time_nz: '15:00',
        }

        const result = validateRaceData(validRace, mockLogger)
        expect(result).toEqual(validRace)
        expect(mockLogger.error).not.toHaveBeenCalled()
      })

      it('should log structured validation errors and throw (AC4)', () => {
        const invalidRace = {
          id: 'RACE-INVALID',
          name: 'Invalid Race',
          status: 'bad-status',
          race_date_nz: '2025-10-10',
          start_time_nz: '15:00',
        }

        expect(() => validateRaceData(invalidRace, mockLogger)).toThrow(
          'Race data validation failed'
        )

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'race_data_validation_error',
            errors: expect.arrayContaining([
              expect.objectContaining({
                fieldPath: 'status',
                errorReason: expect.any(String),
              }),
            ]),
          })
        )
      })

      it('should log field path and error reason (AC4)', () => {
        const missingFieldsRace = {
          id: 'RACE-MISSING',
          // Missing name, status, race_date_nz, start_time_nz
        }

        expect(() => validateRaceData(missingFieldsRace, mockLogger)).toThrow()

        const [firstCall] = mockLogger.error.mock.calls
        expect(firstCall).toBeDefined()

        if (firstCall !== undefined && firstCall[0] !== undefined) {
          const errorCall = firstCall[0] as { event: string; errors: { fieldPath: string; code: string; errorReason: string }[] }
          expect(errorCall).toHaveProperty('event', 'race_data_validation_error')
          expect(errorCall).toHaveProperty('errors')
          expect(errorCall.errors).toBeInstanceOf(Array)
          expect(errorCall.errors.length).toBeGreaterThan(0)

          errorCall.errors.forEach((error) => {
            expect(error).toHaveProperty('fieldPath')
            expect(error).toHaveProperty('errorReason')
          })
        }
      })
    })

    describe('validateMeetingData', () => {
      it('should validate and return valid meeting data', () => {
        const validMeeting = {
          meeting: 'MTG-123',
          name: 'Auckland',
          date: '2025-10-10T00:00:00Z',
          country: 'NZ',
          category: 'R',
          category_name: 'Thoroughbred',
          state: 'Auckland',
          track_condition: 'Good',
          tote_status: 'open',
        }

        const result = validateMeetingData(validMeeting, mockLogger)
        expect(result).toEqual(validMeeting)
        expect(mockLogger.error).not.toHaveBeenCalled()
      })

      it('should log structured validation errors for meeting data (AC4)', () => {
        const invalidMeeting = {
          meeting: 'MTG-BAD',
          name: 'Bad Meeting',
          date: 'not-a-datetime',
          country: 'NZ',
        }

        expect(() => validateMeetingData(invalidMeeting, mockLogger)).toThrow(
          'Meeting data validation failed'
        )

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'meeting_data_validation_error',
            errors: expect.any(Array),
          })
        )
      })
    })

    describe('validateEntrant', () => {
      it('should validate and return valid entrant data', () => {
        const validEntrant = {
          entrantId: 'ENT-123',
          name: 'Fast Runner',
          runnerNumber: 5,
          fixedWinOdds: 3.5,
        }

        const result = validateEntrant(validEntrant, mockLogger)
        expect(result).toEqual(validEntrant)
        expect(mockLogger.error).not.toHaveBeenCalled()
      })

      it('should log structured validation errors for entrant data (AC4)', () => {
        const invalidEntrant = {
          entrantId: 'ENT-BAD',
          name: 'Bad Runner',
          runnerNumber: 'not-a-number',
        }

        expect(() => validateEntrant(invalidEntrant, mockLogger)).toThrow(
          'Entrant validation failed'
        )

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'entrant_validation_error',
            errors: expect.arrayContaining([
              expect.objectContaining({
                fieldPath: 'runnerNumber',
                errorReason: expect.any(String),
              }),
            ]),
          })
        )
      })
    })
  })

  describe('Type inference with z.infer (AC2, AC5)', () => {
    it('should infer MeetingData type correctly', () => {
      const meeting: MeetingData = {
        meeting: 'MTG-TYPE',
        name: 'Type Check',
        date: '2025-10-10T00:00:00Z',
        country: 'NZ',
        category: 'R',
        category_name: 'Thoroughbred',
        state: 'Auckland',
        track_condition: 'Good',
        tote_status: 'open',
      }

      expect(meeting.meeting).toBe('MTG-TYPE')
    })

    it('should infer Entrant type correctly', () => {
      const entrant: Entrant = {
        entrantId: 'ENT-TYPE',
        name: 'Type Runner',
        runnerNumber: 7,
        fixedWinOdds: 4.0,
      }

      expect(entrant.runnerNumber).toBe(7)
    })

    it('should infer Odds type correctly', () => {
      const odds: Odds = {
        type: 'fixed',
        odds: 5.5,
      }

      expect(odds.type).toBe('fixed')
    })

    it('should infer Pool type correctly', () => {
      const pool: Pool = {
        totalPool: 100000,
        holdPercentage: 15.0,
      }

      expect(pool.totalPool).toBe(100000)
    })

    it('should infer RaceData type correctly', () => {
      const race: RaceData = {
        id: 'RACE-TYPE',
        name: 'Type Race',
        status: 'final',
        race_date_nz: '2025-10-10',
        start_time_nz: '16:30',
      }

      expect(race.status).toBe('final')
    })

    it('should infer EntrantLiability type correctly', () => {
      const liability: EntrantLiability = {
        entrant_id: 'ENT-LIA',
        bet_percentage: 12.5,
        hold_percentage: 8.3,
      }

      expect(liability.bet_percentage).toBe(12.5)
    })
  })
})
