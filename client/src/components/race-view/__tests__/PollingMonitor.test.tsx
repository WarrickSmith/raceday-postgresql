import { render, screen, fireEvent } from '@testing-library/react'
import { PollingMonitor } from '../PollingMonitor'
import type { PollingMetrics } from '@/types/pollingMetrics'

const createMockMetrics = (overrides: Partial<PollingMetrics> = {}): PollingMetrics => ({
  requests: 10,
  successRate: 90,
  errorRate: 10,
  avgLatency: 150,
  endpoints: {
    race: {
      requests: 5,
      errors: 0,
      latency: 120,
      lastSuccess: new Date('2025-01-15T10:00:00Z'),
      status: 'OK',
      fallbacks: 0,
      recoveries: 0,
      lastError: null,
    },
    entrants: {
      requests: 2,
      errors: 0,
      latency: 200,
      lastSuccess: new Date('2025-01-15T10:00:05Z'),
      status: 'OK',
      fallbacks: 0,
      recoveries: 0,
      lastError: null,
    },
    pools: {
      requests: 2,
      errors: 1,
      latency: 180,
      lastSuccess: new Date('2025-01-15T10:00:03Z'),
      status: 'WARNING',
      fallbacks: 0,
      recoveries: 1,
      lastError: 'Timeout error',
    },
    'money-flow': {
      requests: 1,
      errors: 0,
      latency: 100,
      lastSuccess: new Date('2025-01-15T10:00:02Z'),
      status: 'OK',
      fallbacks: 0,
      recoveries: 0,
      lastError: null,
    },
  },
  cadence: {
    targetIntervalMs: 30000,
    actualIntervalMs: 30500,
    status: 'on-track',
    nextPollTimestamp: Date.now() + 30000,
    durationSeconds: 120,
  },
  alerts: [],
  recentActivity: [
    {
      timestamp: new Date('2025-01-15T10:00:00Z'),
      type: 'success',
      message: 'race poll succeeded (120ms)',
      endpoint: 'race',
      durationMs: 120,
    },
    {
      timestamp: new Date('2025-01-15T10:00:05Z'),
      type: 'error',
      message: 'pools poll failed: Timeout error',
      endpoint: 'pools',
    },
  ],
  uptime: 95,
  ...overrides,
})

describe('PollingMonitor', () => {
  it('should render the monitor title', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    expect(screen.getByText('🛠️ Polling Monitor')).toBeInTheDocument()
  })

  it('should render collapsed by default', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Title should be visible
    expect(screen.getByText('🛠️ Polling Monitor')).toBeInTheDocument()

    // Collapsed summary stats should be visible
    expect(screen.getByText('90.0% SUCCESS')).toBeInTheDocument()
    expect(screen.getByText('10.0% ERROR')).toBeInTheDocument()

    // Detailed sections should not be visible
    expect(screen.queryByText('Endpoint Performance')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument()
  })

  it('should expand when clicked', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Initially collapsed
    expect(screen.queryByText('Endpoint Performance')).not.toBeInTheDocument()

    // Click to expand
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    // Now expanded - detailed sections should be visible
    expect(screen.getByText('Endpoint Performance')).toBeInTheDocument()
    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument()
  })

  it('should collapse when clicked again', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand first
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)
    expect(screen.getByText('Endpoint Performance')).toBeInTheDocument()

    // Collapse again
    const collapseButton = screen.getByRole('button', { name: /collapse polling monitor/i })
    fireEvent.click(collapseButton)
    expect(screen.queryByText('Endpoint Performance')).not.toBeInTheDocument()
  })

  it('should update aria-expanded attribute', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('should display success and error rates', () => {
    const metrics = createMockMetrics({
      successRate: 85.5,
      errorRate: 14.5,
    })
    render(<PollingMonitor metrics={metrics} />)

    expect(screen.getByText('85.5% SUCCESS')).toBeInTheDocument()
    expect(screen.getByText('14.5% ERROR')).toBeInTheDocument()
  })

  it('should display average latency', () => {
    const metrics = createMockMetrics({ avgLatency: 250 })
    render(<PollingMonitor metrics={metrics} />)

    expect(screen.getByText('250ms AVG')).toBeInTheDocument()
  })

  it('should show cadence status when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('On Track')).toBeInTheDocument()
  })

  it('should display cadence status as behind when behind schedule', () => {
    const metrics = createMockMetrics({
      cadence: {
        targetIntervalMs: 30000,
        actualIntervalMs: 35000,
        status: 'behind',
        nextPollTimestamp: Date.now() + 30000,
        durationSeconds: 120,
      },
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('Behind')).toBeInTheDocument()
  })

  it('should display cadence status as ahead when ahead of schedule', () => {
    const metrics = createMockMetrics({
      cadence: {
        targetIntervalMs: 30000,
        actualIntervalMs: 25000,
        status: 'ahead',
        nextPollTimestamp: Date.now() + 30000,
        durationSeconds: 120,
      },
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('Ahead')).toBeInTheDocument()
  })

  it('should display total request count when expanded', () => {
    const metrics = createMockMetrics({ requests: 42 })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('should show alert count when expanded', () => {
    const metrics = createMockMetrics({
      alerts: [
        {
          id: 'alert-1',
          severity: 'error',
          message: 'High error rate',
          timestamp: new Date(),
        },
      ],
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    // Check for alerts count specifically in the alerts section
    expect(screen.getByText('Alerts:')).toBeInTheDocument()
    const alertElements = screen.getAllByText('1')
    expect(alertElements.length).toBeGreaterThan(0) // Alert count appears in UI
  })

  it('should display active alerts when present and expanded', () => {
    const metrics = createMockMetrics({
      alerts: [
        {
          id: 'alert-1',
          severity: 'error',
          message: 'High polling error rate detected',
          endpoint: 'race',
          timestamp: new Date(),
          metadata: { errorRate: 50 },
        },
      ],
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText(/Active Alerts/i)).toBeInTheDocument()
    expect(screen.getByText(/High polling error rate detected/i)).toBeInTheDocument()
  })

  it('should not render alerts section when no alerts', () => {
    const metrics = createMockMetrics({ alerts: [] })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.queryByText(/Active Alerts/i)).not.toBeInTheDocument()
  })

  it('should render endpoint performance table when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('Endpoint Performance')).toBeInTheDocument()
    expect(screen.getByText('race')).toBeInTheDocument()
    expect(screen.getByText('entrants')).toBeInTheDocument()
    expect(screen.getByText('pools')).toBeInTheDocument()
    expect(screen.getByText('money-flow')).toBeInTheDocument()
  })

  it('should display endpoint status badges correctly when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    const statusBadges = screen.getAllByText('OK')
    expect(statusBadges.length).toBeGreaterThan(0)

    expect(screen.getByText('WARNING')).toBeInTheDocument()
  })

  it('should show recent activity log when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument()
    expect(screen.getByText(/race poll succeeded/i)).toBeInTheDocument()
    expect(screen.getByText(/pools poll failed/i)).toBeInTheDocument()
  })

  it('should display empty state for recent activity when no events', () => {
    const metrics = createMockMetrics({ recentActivity: [] })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })

  it('should format duration correctly when expanded', () => {
    const metrics = createMockMetrics({
      cadence: {
        targetIntervalMs: 30000,
        actualIntervalMs: 30000,
        status: 'on-track',
        nextPollTimestamp: Date.now() + 30000,
        durationSeconds: 125, // 2:05
      },
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('2:05')).toBeInTheDocument()
  })

  it('should show uptime percentage when expanded', () => {
    const metrics = createMockMetrics({ uptime: 99.5 })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('99.5%')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const metrics = createMockMetrics()
    const { container } = render(
      <PollingMonitor metrics={metrics} className="custom-class" />
    )

    const monitorDiv = container.firstChild as HTMLElement
    expect(monitorDiv.className).toContain('custom-class')
  })

  it('should render refresh button when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    expect(refreshButton).toBeInTheDocument()
  })

  it('should render debug button when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    const debugButton = screen.getByRole('button', { name: /debug/i })
    expect(debugButton).toBeInTheDocument()
  })

  it('should have proper ARIA labels', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    expect(screen.getByRole('region', { name: 'Polling Monitor' })).toBeInTheDocument()
  })

  it('should display error last error messages in endpoint table when expanded', () => {
    const metrics = createMockMetrics()
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('Timeout error')).toBeInTheDocument()
  })

  it('should show placeholder for missing data', () => {
    const metrics = createMockMetrics({
      endpoints: {
        race: {
          requests: 0,
          errors: 0,
          latency: 0,
          lastSuccess: null,
          status: 'OK',
          fallbacks: 0,
          recoveries: 0,
          lastError: null,
        },
        entrants: {
          requests: 0,
          errors: 0,
          latency: 0,
          lastSuccess: null,
          status: 'OK',
          fallbacks: 0,
          recoveries: 0,
          lastError: null,
        },
        pools: {
          requests: 0,
          errors: 0,
          latency: 0,
          lastSuccess: null,
          status: 'OK',
          fallbacks: 0,
          recoveries: 0,
          lastError: null,
        },
        'money-flow': {
          requests: 0,
          errors: 0,
          latency: 0,
          lastSuccess: null,
          status: 'OK',
          fallbacks: 0,
          recoveries: 0,
          lastError: null,
        },
      },
    })
    render(<PollingMonitor metrics={metrics} />)

    // Expand the monitor
    const toggleButton = screen.getByRole('button', { name: /expand polling monitor/i })
    fireEvent.click(toggleButton)

    const placeholders = screen.getAllByText('—')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})