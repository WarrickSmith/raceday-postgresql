import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeMeetings } from '../useRealtimeMeetings';
import { client, databases } from '@/lib/appwrite-client';

// Mock Appwrite client
jest.mock('@/lib/appwrite-client', () => ({
  client: {
    subscribe: jest.fn(),
  },
  databases: {
    listDocuments: jest.fn(),
  },
  Query: {
    equal: jest.fn(),
    orderAsc: jest.fn(),
    limit: jest.fn(),
  },
}));

const mockClient = client as jest.Mocked<typeof client>;
const mockDatabases = databases as jest.Mocked<typeof databases>;

describe('useRealtimeMeetings', () => {
  const mockInitialData = [
    {
      $id: '1',
      $createdAt: '2024-01-01T08:00:00Z',
      $updatedAt: '2024-01-01T08:00:00Z',
      meetingId: 'meeting1',
      meetingName: 'Test Meeting 1',
      country: 'AU',
      raceType: 'Thoroughbred Horse Racing',
      date: '2024-01-01',
      firstRaceTime: '2024-01-01T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with initial data', () => {
    const { result } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    expect(result.current.meetings).toEqual(mockInitialData);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionAttempts).toBe(0);
  });

  it('should setup real-time subscriptions', async () => {
    const mockUnsubscribe = jest.fn();
    mockClient.subscribe.mockReturnValue(mockUnsubscribe);

    const { result } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    await waitFor(() => {
      expect(mockClient.subscribe).toHaveBeenCalledWith(
        ['databases.raceday-db.collections.meetings.documents', 'databases.raceday-db.collections.races.documents'],
        expect.any(Function)
      );
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('should handle meeting creation events', async () => {
    const mockUnsubscribe = jest.fn();
    let subscriptionCallback: (response: { events: string[]; payload: unknown }) => void;
    
    mockClient.subscribe.mockImplementation((channels, callback) => {
      subscriptionCallback = callback;
      return mockUnsubscribe;
    });

    mockDatabases.listDocuments.mockResolvedValue({
      documents: [{ startTime: '2024-01-01T09:00:00Z' }],
    });

    const { result } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const newMeeting = {
      $id: '2',
      $createdAt: '2024-01-01T07:00:00Z',
      $updatedAt: '2024-01-01T07:00:00Z',
      meetingId: 'meeting2',
      meetingName: 'Test Meeting 2',
      country: 'NZ',
      raceType: 'Harness',
      date: '2024-01-01',
    };

    await act(async () => {
      subscriptionCallback!({
        events: ['databases.raceday-db.collections.meetings.documents.create'],
        payload: newMeeting,
      });
    });

    await waitFor(() => {
      expect(result.current.meetings).toHaveLength(2);
    });
  });

  it('should handle connection failures with exponential backoff', async () => {
    mockClient.subscribe.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    const { result } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionAttempts).toBe(1);
    });

    // Fast-forward timer to trigger retry
    act(() => {
      jest.advanceTimersByTime(2000); // 2^1 * 1000 = 2000ms
    });

    await waitFor(() => {
      expect(result.current.connectionAttempts).toBe(2);
    });
  });

  it('should handle race time updates', async () => {
    const mockUnsubscribe = jest.fn();
    let subscriptionCallback: (response: { events: string[]; payload: unknown }) => void;
    
    mockClient.subscribe.mockImplementation((channels, callback) => {
      subscriptionCallback = callback;
      return mockUnsubscribe;
    });

    mockDatabases.listDocuments.mockResolvedValue({
      documents: [{ startTime: '2024-01-01T08:30:00Z' }], // Earlier time
    });

    const { result } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const raceUpdate = {
      $id: 'race1',
      meeting: 'meeting1',
      startTime: '2024-01-01T08:30:00Z',
    };

    await act(async () => {
      subscriptionCallback!({
        events: ['databases.raceday-db.collections.races.documents.update'],
        payload: raceUpdate,
      });
    });

    // Give time for the async update to process
    await waitFor(() => {
      expect(mockDatabases.listDocuments).toHaveBeenCalled();
    });
  });

  it('should cleanup subscriptions on unmount', () => {
    const mockUnsubscribe = jest.fn();
    mockClient.subscribe.mockReturnValue(mockUnsubscribe);

    const { unmount } = renderHook(() =>
      useRealtimeMeetings({ initialData: mockInitialData })
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});