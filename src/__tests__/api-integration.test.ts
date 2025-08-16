/**
 * Integration tests for the main API
 */

import { describe, it, expect } from 'vitest';
import { convertImports } from '../api.js';

describe('API Integration', () => {
  it('should export convertImports function', () => {
    expect(typeof convertImports).toBe('function');
  });

  it('should handle non-existent paths gracefully', async () => {
    const results = await convertImports('/non/existent/path', {
      dryRun: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].errors).toBeDefined();
    expect(results[0].errors!.length).toBeGreaterThan(0);
  });

  it('should handle missing tsconfig gracefully', async () => {
    const results = await convertImports('./src/api.ts', {
      dryRun: true,
      verbose: false,
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });
});
