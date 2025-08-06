import { 
  sanitizeRaceStatus, 
  isValidRaceStatus, 
  validateStatusTransition, 
  getRaceStatusBadgeStyles,
  RACE_STATUS,
  type RaceStatus
} from '../races';

describe('Race Status Validation Functions', () => {
  describe('isValidRaceStatus', () => {
    it('should return true for all valid race statuses', () => {
      const validStatuses = Object.values(RACE_STATUS);
      validStatuses.forEach(status => {
        expect(isValidRaceStatus(status)).toBe(true);
      });
    });

    it('should return false for invalid statuses', () => {
      const invalidStatuses = [
        'INVALID_STATUS',
        'running',
        'open',
        'closed',
        'OPEN',
        'RUNNING',
        '',
        null,
        undefined,
        123,
        {},
        []
      ];
      invalidStatuses.forEach(status => {
        expect(isValidRaceStatus(status)).toBe(false);
      });
    });

    it('should be case sensitive', () => {
      expect(isValidRaceStatus('open')).toBe(false);
      expect(isValidRaceStatus('Open')).toBe(true);
      expect(isValidRaceStatus('running')).toBe(false);
      expect(isValidRaceStatus('Running')).toBe(true);
      expect(isValidRaceStatus('RUNNING')).toBe(false);
      expect(isValidRaceStatus('OPEN')).toBe(false);
    });
  });

  describe('sanitizeRaceStatus', () => {
    it('should return valid status unchanged', () => {
      Object.values(RACE_STATUS).forEach(status => {
        expect(sanitizeRaceStatus(status)).toBe(status);
      });
    });

    it('should return fallback for null/undefined', () => {
      expect(sanitizeRaceStatus(null)).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus(undefined)).toBe(RACE_STATUS.OPEN);
    });

    it('should return custom fallback when provided', () => {
      expect(sanitizeRaceStatus(null, RACE_STATUS.CLOSED)).toBe(RACE_STATUS.CLOSED);
      expect(sanitizeRaceStatus(undefined, RACE_STATUS.RUNNING)).toBe(RACE_STATUS.RUNNING);
    });

    it('should return fallback for empty strings', () => {
      expect(sanitizeRaceStatus('')).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus('   ')).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus('\t\n')).toBe(RACE_STATUS.OPEN);
    });

    it('should return fallback for invalid statuses', () => {
      expect(sanitizeRaceStatus('INVALID')).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus(123)).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus({})).toBe(RACE_STATUS.OPEN);
    });

    it('should handle case-insensitive matching', () => {
      expect(sanitizeRaceStatus('running')).toBe(RACE_STATUS.RUNNING);
      expect(sanitizeRaceStatus('RUNNING')).toBe(RACE_STATUS.RUNNING);
      expect(sanitizeRaceStatus('open')).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus('OPEN')).toBe(RACE_STATUS.OPEN);
    });

    it('should handle partial matching', () => {
      expect(sanitizeRaceStatus('final')).toBe(RACE_STATUS.FINALIZED);
      expect(sanitizeRaceStatus('finished')).toBe(RACE_STATUS.FINALIZED);
      expect(sanitizeRaceStatus('live')).toBe(RACE_STATUS.RUNNING);
      expect(sanitizeRaceStatus('betting')).toBe(RACE_STATUS.OPEN);
    });

    it('should trim whitespace from valid statuses', () => {
      expect(sanitizeRaceStatus('  Open  ')).toBe(RACE_STATUS.OPEN);
      expect(sanitizeRaceStatus('\tRunning\n')).toBe(RACE_STATUS.RUNNING);
    });

    it('should log warnings for invalid statuses', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      sanitizeRaceStatus('INVALID');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Invalid race status provided: "INVALID", using fallback: "Open"'
      );

      sanitizeRaceStatus(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Empty or null race status provided, using fallback:', 
        RACE_STATUS.OPEN
      );

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('validateStatusTransition', () => {
    it('should validate valid transitions', () => {
      // Valid transitions according to implementation
      const validTransitions = [
        [RACE_STATUS.OPEN, RACE_STATUS.CLOSED],
        [RACE_STATUS.OPEN, RACE_STATUS.RUNNING], 
        [RACE_STATUS.OPEN, RACE_STATUS.FINALIZED],
        [RACE_STATUS.CLOSED, RACE_STATUS.RUNNING],
        [RACE_STATUS.CLOSED, RACE_STATUS.FINALIZED],
        [RACE_STATUS.CLOSED, RACE_STATUS.OPEN], // Can reopen
        [RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED],
      ];

      validTransitions.forEach(([from, to]) => {
        const result = validateStatusTransition(from, to);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should validate same status transitions with warnings', () => {
      Object.values(RACE_STATUS).forEach(status => {
        const result = validateStatusTransition(status, status);
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain('Status transition to same status');
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should invalidate invalid transitions', () => {
      // Test a transition that should be invalid according to the implementation
      const result = validateStatusTransition(RACE_STATUS.FINALIZED, RACE_STATUS.RUNNING);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle unusual transitions with warnings', () => {
      // According to implementation, FINALIZED -> OPEN is unusual but allowed
      const result = validateStatusTransition(RACE_STATUS.FINALIZED, RACE_STATUS.OPEN);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Unusual status transition: Finalized -> Open');
    });

    it('should handle invalid status values', () => {
      const result = validateStatusTransition('INVALID', RACE_STATUS.OPEN);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid source status: "INVALID"');
    });

    it('should return proper structure', () => {
      const result = validateStatusTransition(RACE_STATUS.OPEN, RACE_STATUS.RUNNING);
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('getRaceStatusBadgeStyles', () => {
    it('should return styles for all valid statuses', () => {
      Object.values(RACE_STATUS).forEach(status => {
        const styles = getRaceStatusBadgeStyles(status);
        expect(styles).toBeDefined();
        expect(typeof styles.containerClass).toBe('string');
        expect(typeof styles.ariaLabel).toBe('string');
        expect(styles.containerClass.length).toBeGreaterThan(0);
        expect(styles.ariaLabel.length).toBeGreaterThan(0);
        expect(styles.status).toBe(status);
        expect(styles.isValid).toBe(true);
      });
    });

    it('should return consistent styles for each status', () => {
      const openStyles1 = getRaceStatusBadgeStyles(RACE_STATUS.OPEN);
      const openStyles2 = getRaceStatusBadgeStyles(RACE_STATUS.OPEN);
      expect(openStyles1).toEqual(openStyles2);
    });

    it('should handle invalid statuses by sanitizing', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const styles = getRaceStatusBadgeStyles('INVALID' as RaceStatus);
      expect(styles.isValid).toBe(false);
      expect(styles.status).toBe(RACE_STATUS.OPEN); // Sanitized to fallback
      
      consoleErrorSpy.mockRestore();
    });

    it('should include validation info when status is valid', () => {
      const styles = getRaceStatusBadgeStyles(RACE_STATUS.RUNNING);
      expect(styles.isValid).toBe(true);
      expect(styles.status).toBe(RACE_STATUS.RUNNING);
    });

    it('should return appropriate classes for each status', () => {
      const openStyles = getRaceStatusBadgeStyles(RACE_STATUS.OPEN);
      expect(openStyles.containerClass).toContain('race-status-open');
      
      const runningStyles = getRaceStatusBadgeStyles(RACE_STATUS.RUNNING);
      expect(runningStyles.containerClass).toContain('race-status-running');
      
      const closedStyles = getRaceStatusBadgeStyles(RACE_STATUS.CLOSED);
      expect(closedStyles.containerClass).toContain('race-status-closed');
    });

    it('should provide accessible labels', () => {
      const styles = getRaceStatusBadgeStyles(RACE_STATUS.RUNNING);
      expect(styles.ariaLabel.toLowerCase()).toContain('progress');
      
      const openStyles = getRaceStatusBadgeStyles(RACE_STATUS.OPEN);
      expect(openStyles.ariaLabel.toLowerCase()).toContain('open');
    });

    it('should include proper styling properties', () => {
      const styles = getRaceStatusBadgeStyles(RACE_STATUS.RUNNING);
      
      expect(styles.textClass).toBeDefined();
      expect(styles.bgClass).toBeDefined();
      expect(styles.borderClass).toBeDefined();
      expect(styles.icon).toBeDefined();
      expect(styles.urgency).toBeDefined();
      expect(['polite', 'assertive']).toContain(styles.urgency);
    });

    it('should handle edge cases gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Test with various invalid inputs
      const nullStyles = getRaceStatusBadgeStyles(null as unknown as string);
      expect(nullStyles).toBeDefined();
      expect(nullStyles.isValid).toBe(false);
      
      const undefinedStyles = getRaceStatusBadgeStyles(undefined as unknown as string);
      expect(undefinedStyles).toBeDefined();
      expect(undefinedStyles.isValid).toBe(false);
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large number of validations efficiently', () => {
      // Mock console methods to prevent logging overhead affecting performance
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const start = performance.now();
      
      // Perform 1000 validations
      for (let i = 0; i < 1000; i++) {
        isValidRaceStatus(RACE_STATUS.RUNNING);
        sanitizeRaceStatus('INVALID');
        validateStatusTransition(RACE_STATUS.OPEN, RACE_STATUS.RUNNING);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      
      // Should complete 1000 operations in reasonable time (increased threshold for CI environment)
      expect(duration).toBeLessThan(1000); // 1000ms threshold
    });

    it('should not create memory leaks with repeated calls', () => {
      // Create many objects and ensure they can be garbage collected
      const initialMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
      
      for (let i = 0; i < 100; i++) {
        const styles = getRaceStatusBadgeStyles(RACE_STATUS.RUNNING);
        // Use the styles to prevent optimization
        expect(styles.containerClass).toBeDefined();
      }
      
      // Force garbage collection if available (development only)
      if ((global as unknown as { gc?: () => void }).gc) {
        (global as unknown as { gc: () => void }).gc();
      }
      
      const finalMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
      
      // Memory should not have grown significantly
      if (initialMemory > 0 && finalMemory > 0) {
        const growth = finalMemory - initialMemory;
        expect(growth).toBeLessThan(1024 * 1024); // Less than 1MB growth
      }
    });
  });
});

describe('Race Status Integration Tests', () => {
  it('should handle complete status lifecycle', () => {
    let currentStatus: RaceStatus = RACE_STATUS.OPEN;
    
    // Open -> Running
    const openToRunning = validateStatusTransition(currentStatus, RACE_STATUS.RUNNING);
    expect(openToRunning.isValid).toBe(true);
    currentStatus = RACE_STATUS.RUNNING;
    
    // Running -> Finalized
    const runningToFinalized = validateStatusTransition(currentStatus, RACE_STATUS.FINALIZED);
    expect(runningToFinalized.isValid).toBe(true);
    currentStatus = RACE_STATUS.FINALIZED;
    
    // Ensure all statuses in lifecycle are valid
    expect(isValidRaceStatus(RACE_STATUS.OPEN)).toBe(true);
    expect(isValidRaceStatus(RACE_STATUS.RUNNING)).toBe(true);
    expect(isValidRaceStatus(RACE_STATUS.CLOSED)).toBe(true);
    expect(isValidRaceStatus(RACE_STATUS.FINALIZED)).toBe(true);
  });

  it('should handle different lifecycle paths', () => {
    // Open -> Closed -> Running -> Finalized
    expect(validateStatusTransition(RACE_STATUS.OPEN, RACE_STATUS.CLOSED).isValid).toBe(true);
    expect(validateStatusTransition(RACE_STATUS.CLOSED, RACE_STATUS.RUNNING).isValid).toBe(true);
    expect(validateStatusTransition(RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED).isValid).toBe(true);
    
    // Direct paths
    expect(validateStatusTransition(RACE_STATUS.OPEN, RACE_STATUS.FINALIZED).isValid).toBe(true);
  });

  it('should provide consistent styling across status changes', () => {
    const statuses = Object.values(RACE_STATUS);
    const allStyles = statuses.map(status => getRaceStatusBadgeStyles(status));
    
    // All styles should have required properties
    allStyles.forEach((styles, index) => {
      expect(styles.containerClass).toBeDefined();
      expect(styles.ariaLabel).toBeDefined();
      expect(styles.isValid).toBe(true);
      expect(styles.status).toBe(statuses[index]);
    });
    
    // Styles should be unique for different statuses
    const classNames = allStyles.map(s => s.containerClass);
    const uniqueClassNames = new Set(classNames);
    expect(uniqueClassNames.size).toBe(classNames.length);
  });
});