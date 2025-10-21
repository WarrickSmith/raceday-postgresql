import { renderHook, waitFor, act } from '@testing-library/react';
import { useRacesForMeeting, clearRaceCache } from '../useRacesForMeeting';
import { Race } from '@/types/meetings';

// Mock the entire services module
jest.mock('@/services/races', () => ({
  fetchRacesForMeeting: jest.fn(),
  validateRaceData: jest.fn((race) => race && typeof race === 'object'),
}));

import { fetchRacesForMeeting } from '@/services/races';
const mockFetchRacesForMeeting = fetchRacesForMeeting as jest.MockedFunction<typeof fetchRacesForMeeting>;

describe('useRacesForMeeting', () => {
  const mockRaces: Race[] = [
    {
      race_id: 'R001',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
      race_number: 1,
      name: 'First Race',
      start_time: '2024-01-01T15:00:00Z',
      meeting_id: 'meeting1',
      status: 'open',
    },
    {
      race_id: 'R002',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z',
      race_number: 2,
      name: 'Second Race',
      start_time: '2024-01-01T16:00:00Z',
      meeting_id: 'meeting1',
      status: 'closed',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    clearRaceCache();
  });

  it('should fetch races successfully', async () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() =>
      useRacesForMeeting({ meeting_id: 'meeting1' })
    );

    // Initial state
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();

    // Wait for fetch to complete (the hook uses setTimeout + async fetch)
    await waitFor(() => {
      expect(result.current.races).toEqual(mockRaces);
    }, { timeout: 5000 });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).toHaveBeenCalledWith('meeting1');
  });

  it('should handle fetch error', async () => {
    const errorMessage = 'Failed to fetch races';
    mockFetchRacesForMeeting.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() =>
      useRacesForMeeting({ meeting_id: 'meeting1' })
    );

    // Hook has retry logic with exponential backoff (2 retries with delays up to 2s + 4s)
    // Wait for all retries to complete and error to be set
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch races');
    }, { timeout: 15000 });

    expect(result.current.races).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should not fetch when disabled', () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meeting_id: 'meeting1', enabled: false })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).not.toHaveBeenCalled();
  });

  it('should not fetch when meeting_id is empty', () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() => 
      useRacesForMeeting({ meeting_id: '' })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.races).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetchRacesForMeeting).not.toHaveBeenCalled();
  });

  it('should handle refetch', async () => {
    mockFetchRacesForMeeting.mockResolvedValue(mockRaces);

    const { result } = renderHook(() =>
      useRacesForMeeting({ meeting_id: 'meeting1' })
    );

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.races).toEqual(mockRaces);
    }, { timeout: 5000 });

    const initialCallCount = mockFetchRacesForMeeting.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Refetch clears cache and triggers new fetch
    await act(async () => {
      await result.current.refetch();
    });

    // Wait for refetch to complete
    await waitFor(() => {
      expect(mockFetchRacesForMeeting.mock.calls.length).toBeGreaterThan(initialCallCount);
    }, { timeout: 5000 });
  });

  it('should cleanup on unmount', () => {
    mockFetchRacesForMeeting.mockImplementation(() => new Promise(() => {}));

    const { unmount } = renderHook(() => 
      useRacesForMeeting({ meeting_id: 'meeting1' })
    );

    expect(() => unmount()).not.toThrow();
  });
});
