import { render, screen, waitFor } from '@testing-library/react'
import Home from '../page'
import { getMeetingsData } from '@/server/meetings-data'

// Mock the meetings data function
jest.mock('@/server/meetings-data', () => ({
  getMeetingsData: jest.fn(),
}));

const mockGetMeetingsData = getMeetingsData as jest.MockedFunction<typeof getMeetingsData>;

describe('Home Page', () => {
  const originalConsoleError = console.error;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock getMeetingsData to return empty array by default
    mockGetMeetingsData.mockResolvedValue([]);
    // Suppress React async component warnings in tests
    console.error = jest.fn();
  });
  
  afterEach(() => {
    // Restore console.error after each test
    console.error = originalConsoleError;
  });

  it('renders dashboard header', async () => {
    render(<Home />)
    
    expect(screen.getByText('Race Day Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Today\'s race meetings and races')).toBeInTheDocument()
  })

  it('renders main content area', async () => {
    render(<Home />)
    
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('shows loading skeleton initially', async () => {
    render(<Home />)
    
    // Should show loading skeleton while data is being fetched
    await waitFor(() => {
      expect(screen.getByTestId('meetings-skeleton')).toBeInTheDocument()
    }, { timeout: 500 })
  })
})
