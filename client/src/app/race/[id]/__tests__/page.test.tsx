import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import RaceDetailPage from '../page';
import { createServerClient, Query } from '@/lib/appwrite-server';

// Mock the dependencies
jest.mock('next/navigation');
jest.mock('@/lib/appwrite-server');

const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = Query as any;

describe('RaceDetailPage', () => {
  // Mock data that matches the actual API structure with populated meeting
  const mockRaceWithMeeting = {
    $id: 'race-doc-id',
    $createdAt: '2024-01-01T08:00:00Z',
    $updatedAt: '2024-01-01T08:00:00Z',
    raceId: 'R001',
    raceNumber: 1,
    name: 'Melbourne Cup',
    startTime: '2024-01-01T15:00:00Z',
    status: 'Open',
    meeting: {
      $id: 'meeting-doc-id',
      $createdAt: '2024-01-01T06:00:00Z',
      $updatedAt: '2024-01-01T06:00:00Z',
      meetingId: 'meeting1',
      meetingName: 'Flemington',
      country: 'AU',
      raceType: 'Thoroughbred Horse Racing',
      category: 'T',
      date: '2024-01-01',
    },
  };

  const mockDatabases = {
    listDocuments: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockResolvedValue({
      databases: mockDatabases,
    });

    // Mock Query functions
    mockQuery.equal = jest.fn().mockImplementation((attr, value) => ({ attribute: attr, values: [value] }));
    mockQuery.limit = jest.fn().mockImplementation((limit) => ({ limit }));
  });

  it('should render race details when race exists', async () => {
    // Mock successful race query with populated meeting data
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [mockRaceWithMeeting] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query (empty for now)
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    const component = await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });
    render(component as React.ReactElement);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Race 1: Melbourne Cup')).toBeInTheDocument();
    expect(screen.getByText('AU')).toBeInTheDocument();
    expect(screen.getByText('Flemington')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Open');
    expect(screen.getByText('R001')).toBeInTheDocument();
  });

  it('should call notFound when race does not exist', async () => {
    // Mock empty race query (no need for entrants query since race doesn't exist)
    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });

    await expect(RaceDetailPage({ params: Promise.resolve({ id: 'non-existent' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('should call notFound when race has invalid meeting data', async () => {
    // Mock race with missing meeting data (no need for entrants query since validation fails)
    const raceWithoutMeeting = { ...mockRaceWithMeeting, meeting: null };
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [raceWithoutMeeting] });
    
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });

    await expect(RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('should call notFound when database query fails', async () => {
    // Mock database error (no need for entrants query since first query fails)
    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Database error'));
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });

    await expect(RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('should have proper semantic HTML structure', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [mockRaceWithMeeting] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    const component = await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });
    render(component as React.ReactElement);

    // Check semantic landmarks
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [mockRaceWithMeeting] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    const component = await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });
    render(component as React.ReactElement);

    // Check ARIA labels and roles
    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-label', 'Race status: Open');

    const timeElement = screen.getByRole('time');
    expect(timeElement).toHaveAttribute('dateTime');
  });

  it('should display race status with proper styling', async () => {
    // Test just one status case to avoid cleanup issues
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ ...mockRaceWithMeeting, status: 'Open' }] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    const component = await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });
    render(component as React.ReactElement);

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent('Open');
    expect(statusElement).toHaveClass('bg-green-100 text-green-800');
  });

  it('should handle invalid time gracefully', async () => {
    const raceWithInvalidTime = {
      ...mockRaceWithMeeting,
      startTime: 'invalid-time',
    };

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [raceWithInvalidTime] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    const component = await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });
    render(component as React.ReactElement);

    expect(screen.getByText('TBA')).toBeInTheDocument(); // Only one TBA in consolidated header
  });

  it('should query database with correct parameters', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [mockRaceWithMeeting] }) // Race query
      .mockResolvedValueOnce({ documents: [] }) // Entrants query
      .mockResolvedValueOnce({ documents: [] }); // Money flow query

    await RaceDetailPage({ params: Promise.resolve({ id: 'R001' }) });

    // Check race query (no meeting query needed since data is populated)
    expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
      'raceday-db',
      'races',
      expect.arrayContaining([
        expect.objectContaining({ attribute: 'raceId', values: ['R001'] })
      ])
    );
    
    // Check entrants query
    expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
      'raceday-db',
      'entrants',
      expect.arrayContaining([
        expect.objectContaining({ attribute: 'race', values: [mockRaceWithMeeting.$id] })
      ])
    );

    // Check money flow query
    expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
      'raceday-db',
      'money-flow-history',
      expect.arrayContaining([
        expect.objectContaining({ attribute: 'entrant', values: [[]] }) // Empty entrants array
      ])
    );
    
    // Should be called three times (race + entrants + money flow queries)
    expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(3);
  });
});