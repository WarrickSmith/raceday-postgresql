import { formatDistance, formatRaceTime, formatCategory } from '../raceFormatters';

describe('raceFormatters', () => {
  describe('formatDistance', () => {
    it('formats all distances in meters', () => {
      expect(formatDistance(2200)).toBe('2200m');
      expect(formatDistance(1600)).toBe('1600m');
      expect(formatDistance(1000)).toBe('1000m');
    });

    it('formats distances under 1000m as meters', () => {
      expect(formatDistance(800)).toBe('800m');
      expect(formatDistance(400)).toBe('400m');
    });

    it('returns null for undefined distance', () => {
      expect(formatDistance(undefined)).toBe(null);
    });
  });

  describe('formatRaceTime', () => {
    it('formats valid time strings correctly', () => {
      expect(formatRaceTime('2025-08-10T10:20:00.000Z')).toMatch(/\d{2}:\d{2}/);
    });

    it('returns TBA for invalid date strings', () => {
      expect(formatRaceTime('invalid-date')).toBe('TBA');
      expect(formatRaceTime('')).toBe('TBA');
    });
  });

  describe('formatCategory', () => {
    it('formats known categories correctly', () => {
      expect(formatCategory('T')).toBe('Thoroughbred');
      expect(formatCategory('t')).toBe('Thoroughbred');
      expect(formatCategory('H')).toBe('Harness');
      expect(formatCategory('h')).toBe('Harness');
    });

    it('returns original value for unknown categories', () => {
      expect(formatCategory('X')).toBe('X');
      expect(formatCategory('Custom')).toBe('Custom');
    });

    it('handles undefined category', () => {
      expect(formatCategory(undefined as unknown as string)).toBe('Unknown');
      expect(formatCategory('')).toBe('Unknown');
    });
  });
});