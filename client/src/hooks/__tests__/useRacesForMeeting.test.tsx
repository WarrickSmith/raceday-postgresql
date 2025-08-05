import { renderHook, waitFor, act } from '@testing-library/react';
import { useRacesForMeeting, clearRaceCache } from '../useRacesForMeeting';
import { Race } from '@/types/meetings';

// Mock the entire services module
jest.mock('@/services/races', () => ({
  fetchRacesForMeeting: jest.fn(),
  validateRaceData: jest.fn((race) => race && typeof race === 'object'),
}));

// Mock the appwrite client to prevent actual database calls in tests
jest.mock('@/lib/appwrite-client', () => ({
  databases: {
    listDocuments: jest.fn()
  }
}));

import { fetchRacesForMeeting } from '@/services/races';
const mockFetchRacesForMeeting = fetchRacesForMeeting as jest.MockedFunction<typeof fetchRacesForMeeting>;

describe('useRacesForMeeting', () => {
  const mockRaces: Race[] = [
    {
      $id: 'race1',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R001',
      raceNumber: 1,
      name: 'First Race',
      startTime: '2024-01-01T15:00:00Z',
      meeting: 'meeting1',
      status: 'Open',
    },
    {
      $id: 'race2',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      raceId: 'R002',
      raceNumber: 2,
      name: 'Second Race',
      startTime: '2024-01-01T16:00:00Z',
      meeting: 'meeting1',
      status: 'Closed',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    clearRaceCache();
  });

  it('should fetch races successfully', async () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meetingId: 'meeting1' })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.races).toEqual(mockRaces);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).toHaveBeenCalledWith('meeting1');
  });

  it('should handle fetch error', async () => {
    const errorMessage = 'Failed to fetch races';
    mockFetchRacesForMeeting.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => 
      useRacesForMeeting({ meetingId: 'meeting1' })
    );

    // Hook has retry logic with exponential backoff, so wait longer
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 10000 });

    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBe('Failed to fetch races');
  });

  it('should not fetch when disabled', () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meetingId: 'meeting1', enabled: false })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).not.toHaveBeenCalled();
  });

  it('should not fetch when meetingId is empty', () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meetingId: '' })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).not.toHaveBeenCalled();
  });

  it('should handle refetch', async () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meetingId: 'meeting1' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchRacesForMeeting).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchRacesForMeeting).toHaveBeenCalledTimes(2);
  });

  it('should cleanup on unmount', () => {
    mockFetchRacesForMeeting.mockImplementation(() => new Promise(() => {}));

    const { unmount } = renderHook(() => 
      useRacesForMeeting({ meetingId: 'meeting1' })
    );

    expect(() => unmount()).not.toThrow();
  });
});