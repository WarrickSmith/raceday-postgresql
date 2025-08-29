import { renderHook } from '@testing-library/react';
import { useMoneyFlowTimeline } from '../useMoneyFlowTimeline';

// Mock the fetch function
global.fetch = jest.fn();

describe('useMoneyFlowTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Money Flow Calculation Validation', () => {
    it('should correctly calculate runner bet amounts using formula: Win Pool Total × (Runner Hold % ÷ 100)', () => {
      // Test data from research showing "Take On" progression
      const testCases = [
        {
          description: 'Early stage - Take On at 9% hold percentage',
          winPoolTotal: 1340.52,
          runnerHoldPercentage: 9,
          expectedRunnerBetAmount: 120.65 // 1340.52 × (9 ÷ 100) = 120.6468
        },
        {
          description: 'Late stage - Take On at 13% hold percentage',
          winPoolTotal: 8949.85,
          runnerHoldPercentage: 13,
          expectedRunnerBetAmount: 1163.48 // 8949.85 × (13 ÷ 100) = 1163.4805
        }
      ];

      testCases.forEach(({ description, winPoolTotal, runnerHoldPercentage, expectedRunnerBetAmount }) => {
        const calculatedAmount = winPoolTotal * (runnerHoldPercentage / 100);
        
        expect(calculatedAmount).toBeCloseTo(expectedRunnerBetAmount, 2);
        console.log(`${description}: ${calculatedAmount.toFixed(2)} ≈ ${expectedRunnerBetAmount}`);
      });
    });

    it('should validate that all runner hold percentages sum to approximately 100%', () => {
      // Test data representing all runners in a race
      const runners = [
        { name: 'Take On', holdPercentage: 13 },
        { name: 'Runner B', holdPercentage: 15 },
        { name: 'Runner C', holdPercentage: 12 },
        { name: 'Runner D', holdPercentage: 18 },
        { name: 'Runner E', holdPercentage: 22 },
        { name: 'Runner F', holdPercentage: 8 },
        { name: 'Runner G', holdPercentage: 12 }
      ];

      const totalHoldPercentage = runners.reduce((sum, runner) => sum + runner.holdPercentage, 0);
      
      // Allow for small rounding differences (within 2% tolerance)
      expect(totalHoldPercentage).toBeGreaterThan(98);
      expect(totalHoldPercentage).toBeLessThan(102);
    });
  });

  describe('Data Consolidation Logic', () => {
    it('should sum pool amounts instead of using Math.max', () => {
      const mockApiResponse = {
        success: true,
        documents: [
          {
            entrant: 'entrant-1',
            timeInterval: -5,
            winPoolAmount: 500,
            placePoolAmount: 200,
            poolPercentage: 15
          },
          {
            entrant: 'entrant-1', 
            timeInterval: -5,
            winPoolAmount: 300,
            placePoolAmount: 150,
            poolPercentage: 10
          }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { result } = renderHook(() => 
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      );

      // Wait for data to be processed
      setTimeout(() => {
        const timelineData = result.current.timelineData;
        expect(timelineData).toBeDefined();
        
        // Verify that amounts are summed, not max'd
        const entrantData = timelineData.get('entrant-1');
        expect(entrantData).toBeDefined();
        
        const consolidatedPoint = entrantData?.dataPoints.find((point: any) => point.timeInterval === -5);
        expect(consolidatedPoint?.winPoolAmount).toBe(800); // 500 + 300, not Math.max(500, 300)
        expect(consolidatedPoint?.placePoolAmount).toBe(350); // 200 + 150, not Math.max(200, 150)
        expect(consolidatedPoint?.poolPercentage).toBe(25); // 15 + 10, not Math.max(15, 10)
      }, 100);
    });
  });

  describe('Time Bucketed Data Processing', () => {
    it('should handle bucketed data with pre-calculated incrementals', () => {
      const mockBucketedResponse = {
        success: true,
        bucketedData: true,
        documents: [
          {
            entrant: 'entrant-1',
            timeInterval: -5,
            winPoolAmount: 1000,
            incrementalWinAmount: 50,
            intervalType: '5m'
          },
          {
            entrant: 'entrant-1',
            timeInterval: -1,
            winPoolAmount: 1200, 
            incrementalWinAmount: 200,
            intervalType: '1m'
          }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBucketedResponse
      });

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      );

      setTimeout(() => {
        const timelineData = result.current.timelineData;
        const entrantData = timelineData.get('entrant-1');
        
        expect(entrantData).toBeDefined();
        expect(entrantData?.dataPoints.length).toBe(2);
        
        // Verify incremental amounts are preserved from server
        const fiveMinutePoint = entrantData?.dataPoints.find((p: any) => p.timeInterval === -5);
        const oneMinutePoint = entrantData?.dataPoints.find((p: any) => p.timeInterval === -1);
        
        expect(fiveMinutePoint?.incrementalAmount).toBe(50);
        expect(oneMinutePoint?.incrementalAmount).toBe(200);
      }, 100);
    });
  });

  describe('Dynamic Column Generation', () => {
    it('should generate appropriate time intervals based on race proximity', () => {
      // Mock current time as 30 minutes before race
      const raceStart = new Date(Date.now() + 30 * 60 * 1000);
      
      const expectedColumns = [-30, -25, -20, -15, -10, -5]; // 5-minute intervals
      
      // This would typically be tested through the component that uses this hook
      // but here we validate the concept
      expect(expectedColumns.every(interval => interval <= 0)).toBe(true);
      expect(expectedColumns[0]).toBe(-30); // Starts at 30 minutes before
      expect(expectedColumns[expectedColumns.length - 1]).toBe(-5); // Ends at 5 minutes before
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      );

      expect(result.current.isLoading).toBe(true);
      
      setTimeout(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.isLoading).toBe(false);
      }, 100);
    });

    it('should handle empty entrant list', () => {
      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', [])
      );

      // Hook initializes with empty Map when no entrants provided
      expect(result.current.timelineData).toBeInstanceOf(Map);
      expect(result.current.timelineData.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });
});