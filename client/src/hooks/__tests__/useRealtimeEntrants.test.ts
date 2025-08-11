import { renderHook, act } from '@testing-library/react';
import { useRealtimeEntrants } from '../useRealtimeEntrants';
import { Entrant } from '@/types/meetings';



// Mock the Appwrite client
jest.mock('@/lib/appwrite-client', () => ({
  client: {
    subscribe: jest.fn(),
  },
}));

import * as appwriteClientModule from '@/lib/appwrite-client';
const mockClient = appwriteClientModule.client as jest.Mocked<typeof appwriteClientModule.client>;

const mockEntrants: Entrant[] = [
  {
    $id: '1',
    $createdAt: '2025-01-01T00:00:00Z',
    $updatedAt: '2025-01-01T00:00:00Z',
    entrantId: 'e1',
    name: 'Thunder Bolt',
    runnerNumber: 1,
    jockey: 'J. Smith',
    trainerName: 'T. Johnson',
    weight: 57.0,
    silkUrl: '',
    isScratched: false,
    race: 'race1',
    winOdds: 3.50,
    placeOdds: 1.80,
  },
  {
    $id: '2',
    $createdAt: '2025-01-01T00:00:00Z',
    $updatedAt: '2025-01-01T00:00:00Z',
    entrantId: 'e2',
    name: 'Lightning Fast',
    runnerNumber: 2,
    jockey: 'M. Davis',
    trainerName: 'S. Wilson',
    weight: 55.5,
    silkUrl: '',
    isScratched: false,
    race: 'race1',
    winOdds: 8.00,
    placeOdds: 3.20,
  },
];

describe('useRealtimeEntrants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful subscription by default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation(() => {
      // Simulate successful connection
      return jest.fn(); // Return unsubscribe function
    });
  });

  test('initializes with provided entrants', () => {
    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    expect(result.current.entrants).toEqual(mockEntrants);
    expect(result.current.isConnected).toBe(true); // Connection is established when subscription is set up
    expect(result.current.oddsUpdates).toEqual({});
  });

  test('sets up subscription on mount', () => {
    renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    expect(mockClient.subscribe).toHaveBeenCalledWith(
      'databases.raceday-db.collections.entrants.documents',
      expect.any(Function)
    );
  });

  test('updates entrant when receiving update event', () => {
    let subscriptionCallback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation((_: string, callback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void) => {
      subscriptionCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    // Simulate an entrant update
    act(() => {
      subscriptionCallback({
        payload: {
          $id: '1',
          race: 'race1',
          winOdds: 4.00, // Updated odds
        },
        events: ['databases.raceday-db.collections.entrants.documents.update'],
      });
    });

    expect(result.current.entrants[0].winOdds).toBe(4.00);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.oddsUpdates['1']).toBeDefined();
  });

  test('ignores updates for different race', () => {
    let subscriptionCallback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation((_: string, callback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void) => {
      subscriptionCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    const originalEntrants = [...result.current.entrants];

    // Simulate an entrant update for different race
    act(() => {
      subscriptionCallback({
        payload: {
          $id: '1',
          race: 'race2', // Different race
          winOdds: 4.00,
        },
        events: ['databases.raceday-db.collections.entrants.documents.update'],
      });
    });

    // Should not update entrants
    expect(result.current.entrants).toEqual(originalEntrants);
    expect(result.current.isConnected).toBe(true); // Still connected, just ignored the update
  });

  test('adds new entrant when receiving create event', () => {
    let subscriptionCallback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation((_: string, callback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void) => {
      subscriptionCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    const newEntrant: Entrant = {
      $id: '3',
      $createdAt: '2025-01-01T00:00:00Z',
      $updatedAt: '2025-01-01T00:00:00Z',
      entrantId: 'e3',
      name: 'Storm Chaser',
      runnerNumber: 3,
      jockey: 'A. Wilson',
      trainerName: 'B. Taylor',
      weight: 56.5,
      silkUrl: '',
      isScratched: false,
      race: 'race1',
      winOdds: 6.00,
      placeOdds: 2.50,
    };

    // Simulate a new entrant creation
    act(() => {
      subscriptionCallback({
        payload: newEntrant,
        events: ['databases.raceday-db.collections.entrants.documents.create'],
      });
    });

    expect(result.current.entrants).toHaveLength(3);
    expect(result.current.entrants[2]).toEqual(newEntrant);
  });

  test('removes entrant when receiving delete event', () => {
    let subscriptionCallback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation((_: string, callback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void) => {
      subscriptionCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    // Simulate entrant deletion
    act(() => {
      subscriptionCallback({
        payload: {
          $id: '1',
          race: 'race1',
        },
        events: ['databases.raceday-db.collections.entrants.documents.delete'],
      });
    });

    expect(result.current.entrants).toHaveLength(1);
    expect(result.current.entrants.find(e => e.$id === '1')).toBeUndefined();
  });

  test('tracks odds updates', () => {
    let subscriptionCallback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation((_: string, callback: (response: { payload?: Partial<Entrant> & { $id: string }; events?: string[] }) => void) => {
      subscriptionCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    // Simulate odds update
    act(() => {
      subscriptionCallback({
        payload: {
          $id: '1',
          race: 'race1',
          winOdds: 4.00,
          placeOdds: 2.00,
        },
        events: ['databases.raceday-db.collections.entrants.documents.update'],
      });
    });

    expect(result.current.oddsUpdates['1']).toBeDefined();
    expect(result.current.oddsUpdates['1'].win).toBe(4.00);
    expect(result.current.oddsUpdates['1'].place).toBe(2.00);
    expect(result.current.oddsUpdates['1'].timestamp).toBeInstanceOf(Date);
  });

  test('handles subscription errors gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockImplementation(() => {
      throw new Error('Connection failed');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const { result } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    expect(result.current.isConnected).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to setup entrants subscription:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  test('cleans up subscription on unmount', () => {
    const unsubscribeMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClient.subscribe as any).mockReturnValue(unsubscribeMock);

    const { unmount } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });

  test('memoizes entrants to prevent unnecessary re-renders', () => {
    const { result, rerender } = renderHook(() =>
      useRealtimeEntrants({
        initialEntrants: mockEntrants,
        raceId: 'race1',
      })
    );

    const firstRender = result.current.entrants;

    // Rerender without changes
    rerender();

    const secondRender = result.current.entrants;

    // Should be the same reference
    expect(firstRender).toBe(secondRender);
  });
});