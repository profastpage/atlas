// ========================================
// Basic integration test: SAFETY_KEYWORDS validation
// ========================================

import { SAFETY_KEYWORDS } from '@/lib/atlas';

describe('SAFETY_KEYWORDS', () => {
  it('should be a non-empty array of strings', () => {
    expect(Array.isArray(SAFETY_KEYWORDS)).toBe(true);
    expect(SAFETY_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('should contain only non-empty strings', () => {
    for (const keyword of SAFETY_KEYWORDS) {
      expect(typeof keyword).toBe('string');
      expect(keyword.trim().length).toBeGreaterThan(0);
    }
  });

  it('should be exported and accessible', () => {
    expect(SAFETY_KEYWORDS).toBeDefined();
  });
});
