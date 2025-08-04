import { getMeetingsData, getMeetingById } from '../meetings-data';
import { createServerClient } from '@/lib/appwrite-server';
import type { Databases } from 'node-appwrite';
import { RACE_TYPE_CODES } from '@/constants/raceTypes';

// Mock the Appwrite server client
jest.mock('@/lib/appwrite-server', () => ({
  createServerClient: jest.fn(),
  Query: {
    equal: jest.fn((field, value) => ({ field, value, type: 'equal' })),
    orderAsc: jest.fn((field) => ({ field, type: 'orderAsc' })),
    limit: jest.fn((count) => ({ count, type: 'limit' })),
  },
}));

const mockDatabases = {
  listDocuments: jest.fn(),
  getDocument: jest.fn(),
} as jest.Mocked<Pick<Databases, 'listDocuments' | 'getDocument'>>;

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;

describe('meetings-data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockResolvedValue({
      databases: mockDatabases as unknown as Databases,
    });
  });

  describe('getMeetingsData', () => {
    it('should fetch and sort meetings by first race time', async () => {
      const mockMeetings = [
        {
          $id: '1',
          $sequence: 1,
          $collectionId: 'meetings',
          $databaseId: 'raceday-db',
          $createdAt: '2024-01-01T08:00:00Z',
          $updatedAt: '2024-01-01T08:00:00Z',
          $permissions: [],
          meetingId: 'meeting1',
          meetingName: 'Meeting 1',
          country: 'AUS',
          raceType: 'Thoroughbred Horse Racing',
          category: RACE_TYPE_CODES.THOROUGHBRED,
          date: '2024-01-01',
        },
        {
          $id: '2',
          $sequence: 2,
          $collectionId: 'meetings',
          $databaseId: 'raceday-db',
          $createdAt: '2024-01-01T06:00:00Z',
          $updatedAt: '2024-01-01T06:00:00Z',
          $permissions: [],
          meetingId: 'meeting2',
          meetingName: 'Meeting 2',
          country: 'NZ',
          raceType: 'Harness Horse Racing',
          category: RACE_TYPE_CODES.HARNESS,
          date: '2024-01-01',
        },
      ];

      const mockRaces = [
        { 
          $id: 'race1',
          $sequence: 1,
          $collectionId: 'races',
          $databaseId: 'raceday-db',
          $createdAt: '2024-01-01T08:00:00Z',
          $updatedAt: '2024-01-01T08:00:00Z',
          $permissions: [],
          startTime: '2024-01-01T10:00:00Z' 
        }, // Later race for meeting1
        { 
          $id: 'race2',
          $sequence: 2,
          $collectionId: 'races',
          $databaseId: 'raceday-db',
          $createdAt: '2024-01-01T08:00:00Z',
          $updatedAt: '2024-01-01T08:00:00Z',
          $permissions: [],
          startTime: '2024-01-01T09:00:00Z' 
        }, // Earlier race for meeting2
      ];

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: mockMeetings, total: mockMeetings.length })
        .mockResolvedValueOnce({ documents: [mockRaces[0]], total: 1 }) // meeting1 races
        .mockResolvedValueOnce({ documents: [mockRaces[1]], total: 1 }); // meeting2 races

      const result = await getMeetingsData();

      expect(result).toHaveLength(2);
      expect(result[0].meetingId).toBe('meeting2'); // Should be first due to earlier race time
      expect(result[1].meetingId).toBe('meeting1');
      expect(result[0].firstRaceTime).toBe('2024-01-01T09:00:00Z');
      expect(result[1].firstRaceTime).toBe('2024-01-01T10:00:00Z');
    });

    it('should handle empty meetings response', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getMeetingsData();

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      // Mock console.error to suppress expected error output
      console.error = jest.fn();
      
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Database error'));

      const result = await getMeetingsData();

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error fetching meetings data:', expect.any(Error));
    });

    it('should handle race fetching errors for individual meetings', async () => {
      // Mock console.error to suppress expected error output
      console.error = jest.fn();
      
      const mockMeetings = [
        {
          $id: '1',
          $sequence: 1,
          $collectionId: 'meetings',
          $databaseId: 'raceday-db',
          $createdAt: '2024-01-01T08:00:00Z',
          $updatedAt: '2024-01-01T08:00:00Z',
          $permissions: [],
          meetingId: 'meeting1',
          meetingName: 'Meeting 1',
          country: 'AUS',
          raceType: 'Thoroughbred Horse Racing',
          category: RACE_TYPE_CODES.THOROUGHBRED,
          date: '2024-01-01',
        },
      ];

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: mockMeetings, total: mockMeetings.length })
        .mockRejectedValueOnce(new Error('Race fetch error'));

      const result = await getMeetingsData();

      expect(result).toHaveLength(1);
      expect(result[0].firstRaceTime).toBe('2024-01-01T08:00:00Z'); // Falls back to created time
      expect(console.error).toHaveBeenCalledWith('Error fetching races for meeting meeting1:', expect.any(Error));
    });
  });

  describe('getMeetingById', () => {
    it('should fetch meeting by ID', async () => {
      const mockMeeting = {
        $id: '1',
        $sequence: 1,
        $collectionId: 'meetings',
        $databaseId: 'raceday-db',
        $createdAt: '2024-01-01T08:00:00Z',
        $updatedAt: '2024-01-01T08:00:00Z',
        $permissions: [],
        meetingId: 'meeting1',
        meetingName: 'Test Meeting',
        raceType: 'Thoroughbred Horse Racing',
        category: RACE_TYPE_CODES.THOROUGHBRED,
        country: 'AU',
        date: '2024-01-01',
      };

      mockDatabases.getDocument.mockResolvedValueOnce(mockMeeting);

      const result = await getMeetingById('1');

      expect(result).toEqual(mockMeeting);
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('raceday-db', 'meetings', '1');
    });

    it('should return null on error', async () => {
      // Mock console.error to suppress expected error output
      console.error = jest.fn();
      
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));

      const result = await getMeetingById('invalid-id');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching meeting invalid-id:', expect.any(Error));
    });
  });
});