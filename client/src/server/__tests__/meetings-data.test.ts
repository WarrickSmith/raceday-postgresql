import { getMeetingsData, getMeetingById } from '../meetings-data';
import { createServerClient } from '@/lib/appwrite-server';

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
};

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;

describe('meetings-data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockResolvedValue({
      databases: mockDatabases,
    });
  });

  describe('getMeetingsData', () => {
    it('should fetch and sort meetings by first race time', async () => {
      const mockMeetings = [
        {
          $id: '1',
          $createdAt: '2024-01-01T08:00:00Z',
          meetingId: 'meeting1',
          meetingName: 'Meeting 1',
          country: 'AU',
          raceType: 'Thoroughbred Horse Racing',
          date: '2024-01-01',
        },
        {
          $id: '2',
          $createdAt: '2024-01-01T06:00:00Z',
          meetingId: 'meeting2',
          meetingName: 'Meeting 2',
          country: 'NZ',
          raceType: 'Harness',
          date: '2024-01-01',
        },
      ];

      const mockRaces = [
        { startTime: '2024-01-01T10:00:00Z' }, // Later race for meeting1
        { startTime: '2024-01-01T09:00:00Z' }, // Earlier race for meeting2
      ];

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: mockMeetings })
        .mockResolvedValueOnce({ documents: [mockRaces[0]] }) // meeting1 races
        .mockResolvedValueOnce({ documents: [mockRaces[1]] }); // meeting2 races

      const result = await getMeetingsData();

      expect(result).toHaveLength(2);
      expect(result[0].meetingId).toBe('meeting2'); // Should be first due to earlier race time
      expect(result[1].meetingId).toBe('meeting1');
      expect(result[0].firstRaceTime).toBe('2024-01-01T09:00:00Z');
      expect(result[1].firstRaceTime).toBe('2024-01-01T10:00:00Z');
    });

    it('should handle empty meetings response', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });

      const result = await getMeetingsData();

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Database error'));

      const result = await getMeetingsData();

      expect(result).toEqual([]);
    });

    it('should handle race fetching errors for individual meetings', async () => {
      const mockMeetings = [
        {
          $id: '1',
          $createdAt: '2024-01-01T08:00:00Z',
          meetingId: 'meeting1',
          meetingName: 'Meeting 1',
          country: 'AU',
          raceType: 'Thoroughbred Horse Racing',
          date: '2024-01-01',
        },
      ];

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: mockMeetings })
        .mockRejectedValueOnce(new Error('Race fetch error'));

      const result = await getMeetingsData();

      expect(result).toHaveLength(1);
      expect(result[0].firstRaceTime).toBe('2024-01-01T08:00:00Z'); // Falls back to created time
    });
  });

  describe('getMeetingById', () => {
    it('should fetch meeting by ID', async () => {
      const mockMeeting = {
        $id: '1',
        meetingId: 'meeting1',
        meetingName: 'Test Meeting',
      };

      mockDatabases.getDocument.mockResolvedValueOnce(mockMeeting);

      const result = await getMeetingById('1');

      expect(result).toEqual(mockMeeting);
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('raceday-db', 'meetings', '1');
    });

    it('should return null on error', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));

      const result = await getMeetingById('invalid-id');

      expect(result).toBeNull();
    });
  });
});