/**
 * CLI validation tests
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CLI Validation Functions', () => {
  describe('File Pattern Validation', () => {
    function validatePatterns(patterns: string[]): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (patterns.length === 0) {
        errors.push('At least one file pattern must be specified');
      }

      for (const pattern of patterns) {
        if (pattern.trim() === '') {
          errors.push('Empty file pattern provided');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    }

    it('should validate non-empty patterns', () => {
      const result = validatePatterns(['src/', 'lib/']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty pattern list', () => {
      const result = validatePatterns([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one file pattern must be specified');
    });

    it('should reject empty patterns', () => {
      const result = validatePatterns(['src/', '', 'lib/']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty file pattern provided');
    });

    it('should reject whitespace-only patterns', () => {
      const result = validatePatterns(['src/', '   ', 'lib/']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty file pattern provided');
    });
  });

  describe('Config File Detection', () => {
    function findTsConfig(startDir: string = process.cwd()): string | null {
      let currentDir = path.resolve(startDir);
      const root = path.parse(currentDir).root;

      while (currentDir !== root) {
        const tsConfigPath = path.join(currentDir, 'tsconfig.json');
        if (fs.existsSync(tsConfigPath)) {
          return tsConfigPath;
        }
        currentDir = path.dirname(currentDir);
      }

      return null;
    }

    it('should find tsconfig.json in current directory', () => {
      const config = findTsConfig();
      expect(config).toBeTruthy();
      expect(config?.endsWith('tsconfig.json')).toBe(true);
    });

    it('should return null when no tsconfig.json is found', () => {
      const config = findTsConfig('/tmp');
      expect(config).toBeNull();
    });
  });

  describe('File Extension Validation', () => {
    function shouldProcessFile(filePath: string, extensions: string[]): boolean {
      const ext = path.extname(filePath);
      return extensions.includes(ext);
    }

    it('should process TypeScript files', () => {
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];

      expect(shouldProcessFile('test.ts', extensions)).toBe(true);
      expect(shouldProcessFile('component.tsx', extensions)).toBe(true);
      expect(shouldProcessFile('script.js', extensions)).toBe(true);
      expect(shouldProcessFile('app.jsx', extensions)).toBe(true);
    });

    it('should skip non-supported files', () => {
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];

      expect(shouldProcessFile('test.py', extensions)).toBe(false);
      expect(shouldProcessFile('config.json', extensions)).toBe(false);
      expect(shouldProcessFile('readme.md', extensions)).toBe(false);
      expect(shouldProcessFile('style.css', extensions)).toBe(false);
    });

    it('should handle files without extensions', () => {
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];

      expect(shouldProcessFile('Dockerfile', extensions)).toBe(false);
      expect(shouldProcessFile('LICENSE', extensions)).toBe(false);
    });
  });

  describe('CLI Option Defaults', () => {
    function applyDefaults(
      options: Partial<{
        patterns: string[];
        dryRun: boolean;
        verbose: boolean;
        config?: string;
        ignore?: string;
      }>
    ): Required<typeof options> {
      return {
        patterns: options.patterns || ['src/**/*.{ts,tsx,js,jsx}'],
        dryRun: options.dryRun || false,
        verbose: options.verbose || false,
        config: options.config,
        ignore: options.ignore,
      };
    }

    it('should apply default patterns when none provided', () => {
      const options = applyDefaults({});
      expect(options.patterns).toEqual(['src/**/*.{ts,tsx,js,jsx}']);
    });

    it('should preserve provided patterns', () => {
      const options = applyDefaults({ patterns: ['lib/', 'app/'] });
      expect(options.patterns).toEqual(['lib/', 'app/']);
    });

    it('should apply default boolean values', () => {
      const options = applyDefaults({});
      expect(options.dryRun).toBe(false);
      expect(options.verbose).toBe(false);
    });

    it('should preserve provided boolean values', () => {
      const options = applyDefaults({ dryRun: true, verbose: true });
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(true);
    });
  });

  describe('Error Message Formatting', () => {
    function formatError(error: unknown): string {
      return error instanceof Error ? error.message : 'Unknown error';
    }

    it('should format Error objects correctly', () => {
      const error = new Error('Test error message');
      expect(formatError(error)).toBe('Test error message');
    });

    it('should handle non-Error objects', () => {
      expect(formatError('string error')).toBe('Unknown error');
      expect(formatError(null)).toBe('Unknown error');
      expect(formatError(undefined)).toBe('Unknown error');
      expect(formatError(42)).toBe('Unknown error');
    });
  });
});
