/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useRealtimeRace } from '../useRealtimeRace';
import { Race } from '@/types/meetings';

interface MockRealtimeResponse {
  payload: Partial<Race>;
  events: string[];
  channels: string[];
  timestamp: number;
}

// Mock Appwrite client
jest.mock('@/lib/appwrite-client', () => ({
  client: {
    subscribe: jest.fn(),
  },
}));

// Get the mocked client
import * as appwriteClientModule from '@/lib/appwrite-client';
const mockClient = appwriteClientModule.client as jest.Mocked<typeof appwriteClientModule.client>;

const mockInitialRace: Race = {
  $id: 'race-123',
  $createdAt: '2025-08-10T10:00:00.000Z',
  $updatedAt: '2025-08-10T10:00:00.000Z',
  raceId: 'R1-2025-08-10-ROTORUA',
  raceNumber: 1,
  name: 'Maiden Plate',
  startTime: '2025-08-10T10:20:00.000Z',
  meeting: 'meeting-456',
  status: 'Open',
  distance: 2200,
  trackCondition: 'Good 3',
};

describe('useRealtimeRace', () => {
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockClient.subscribe.mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with provided race data', () => {
    const { result } = renderHook(() =>
      useRealtimeRace({
        initialRace: mockInitialRace,
      })
    );

    expect(result.current.race).toEqual(mockInitialRace);
    expect(result.current.isConnected).toBe(true); // True after successful subscription setup
  });

  it('sets up subscription with correct channel', () => {
    renderHook(() =>
      useRealtimeRace({
        initialRace: mockInitialRace,
      })
    );

    expect(mockClient.subscribe).toHaveBeenCalledWith(
      `databases.raceday-db.collections.races.documents.${mockInitialRace.$id}`,
      expect.any(Function)
    );
  });

  it('updates race data when receiving relevant changes', () => {
    let subscriptionCallback: (response: MockRealtimeResponse) => void;
    
    mockClient.subscribe.mockImplementation((channel: string | string[], callback: (response: MockRealtimeResponse) => void) => {
      subscriptionCallback = callback;
      return mockUnsubscribe;
    });

    const { result } = renderHook(() =>
      useRealtimeRace({
        initialRace: mockInitialRace,
      })
    );

    // Simulate receiving an update
    const updatedData = {
      $id: mockInitialRace.$id,
      status: 'Closed',
      startTime: mockInitialRace.startTime,
      distance: mockInitialRace.distance,
      trackCondition: mockInitialRace.trackCondition,
    };

    act(() => {
      subscriptionCallback!({
        payload: updatedData,
        events: ['databases.*.collections.*.documents.*.update'],
        channels: [`databases.raceday-db.collections.races.documents.${mockInitialRace.$id}`],
        timestamp: Date.now(),
      });
    });

    expect(result.current.race.status).toBe('Closed');
    expect(result.current.isConnected).toBe(true);
  });

  it('ignores updates for different races', () => {
    let subscriptionCallback: (response: MockRealtimeResponse) => void;
    
    mockClient.subscribe.mockImplementation((channel: string | string[], callback: (response: MockRealtimeResponse) => void) => {
      subscriptionCallback = callback;
      return mockUnsubscribe;
    });

    const { result } = renderHook(() =>
      useRealtimeRace({
        initialRace: mockInitialRace,
      })
    );

    // Simulate receiving an update for a different race
    const updatedData = {
      $id: 'different-race-id',
      status: 'Closed',
    };

    act(() => {
      subscriptionCallback!({
        payload: updatedData,
        events: ['databases.*.collections.*.documents.*.update'],
        channels: ['databases.raceday-db.collections.races.documents.different-race-id'],
        timestamp: Date.now(),
      });
    });

    // Should not update the race data
    expect(result.current.race.status).toBe('Open');
  });

  it('cleans up subscriptions on unmount', () => {
    const { unmount } = renderHook(() =>
      useRealtimeRace({
        initialRace: mockInitialRace,
      })
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});