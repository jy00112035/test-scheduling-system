import { describe, expect, it } from 'vitest';
import { normalizeSchedulePercentage } from './workbenchCalculations';

describe('normalizeSchedulePercentage', () => {
  it.each([
    [4, 10],
    [57, 60],
    [106, 100],
    [Number.NaN, 100],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSchedulePercentage(input)).toBe(expected);
  });
});
