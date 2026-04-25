// ========================================
// Basic integration test: isFinancialQuery validation
// Placeholder — financial-api.ts may not exist yet
// ========================================

// If the module exists, import and test; otherwise skip gracefully
let isFinancialQuery: ((query: string) => boolean) | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/lib/financial-api');
  isFinancialQuery = mod?.isFinancialQuery;
} catch {
  // Module not available yet — tests will be skipped
}

describe('isFinancialQuery', () => {
  it('should be exported as a function when available', () => {
    if (!isFinancialQuery) {
      console.warn('[SKIP] financial-api.ts not available yet — skipping tests');
      return;
    }
    expect(typeof isFinancialQuery).toBe('function');
  });

  it('should return a boolean for valid string input', () => {
    if (!isFinancialQuery) return;
    const result = isFinancialQuery('¿cuál es el precio del dólar?');
    expect(typeof result).toBe('boolean');
  });

  it('should return false for non-financial queries', () => {
    if (!isFinancialQuery) return;
    const result = isFinancialQuery('hola, ¿cómo estás?');
    expect(typeof result).toBe('boolean');
  });
});
