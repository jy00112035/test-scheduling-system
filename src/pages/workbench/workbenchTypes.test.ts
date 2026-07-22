import { describe, expect, it } from 'vitest';
import { formatFamiliarModules } from './workbenchTypes';

describe('formatFamiliarModules', () => {
  it('uses a placeholder when structured familiarity is empty', () => {
    expect(formatFamiliarModules([])).toBe('-');
  });
});
