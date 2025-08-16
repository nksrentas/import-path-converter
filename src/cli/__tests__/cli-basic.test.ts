/**
 * Basic CLI tests that can run without full compilation
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from 'node:util';

describe('CLI Argument Parsing', () => {
  it('should parse basic arguments correctly', () => {
    const args = ['src/', '--dry-run', '--verbose'];

    const { values, positionals } = parseArgs({
      args,
      options: {
        'dry-run': {
          type: 'boolean',
          short: 'd',
          default: false,
        },
        verbose: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      allowPositionals: true,
    });

    expect(positionals).toEqual(['src/']);
    expect(values['dry-run']).toBe(true);
    expect(values.verbose).toBe(true);
    expect(values.help).toBe(false);
  });

  it('should parse short flags correctly', () => {
    const args = ['-d', '-v', '-h'];

    const { values } = parseArgs({
      args,
      options: {
        'dry-run': {
          type: 'boolean',
          short: 'd',
          default: false,
        },
        verbose: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      allowPositionals: true,
    });

    expect(values['dry-run']).toBe(true);
    expect(values.verbose).toBe(true);
    expect(values.help).toBe(true);
  });

  it('should parse config and ignore options', () => {
    const args = ['--config', 'tsconfig.json', '--ignore', '.importignore'];

    const { values } = parseArgs({
      args,
      options: {
        config: {
          type: 'string',
          short: 'c',
        },
        ignore: {
          type: 'string',
          short: 'i',
        },
      },
      allowPositionals: true,
    });

    expect(values.config).toBe('tsconfig.json');
    expect(values.ignore).toBe('.importignore');
  });

  it('should handle multiple positional arguments', () => {
    const args = ['src/', 'lib/', 'app/'];

    const { positionals } = parseArgs({
      args,
      options: {},
      allowPositionals: true,
    });

    expect(positionals).toEqual(['src/', 'lib/', 'app/']);
  });

  it('should handle mixed arguments', () => {
    const args = ['src/', '--config', 'custom.json', 'lib/', '--dry-run'];

    const { values, positionals } = parseArgs({
      args,
      options: {
        config: {
          type: 'string',
          short: 'c',
        },
        'dry-run': {
          type: 'boolean',
          short: 'd',
          default: false,
        },
      },
      allowPositionals: true,
    });

    expect(positionals).toEqual(['src/', 'lib/']);
    expect(values.config).toBe('custom.json');
    expect(values['dry-run']).toBe(true);
  });
});

describe('CLI Validation Logic', () => {
  it('should validate file patterns are not empty', () => {
    const patterns = ['src/', 'lib/', ''];

    const hasEmptyPattern = patterns.some(pattern => pattern.trim() === '');
    expect(hasEmptyPattern).toBe(true);
  });

  it('should validate all patterns are non-empty', () => {
    const patterns = ['src/', 'lib/', 'app/'];

    const hasEmptyPattern = patterns.some(pattern => pattern.trim() === '');
    expect(hasEmptyPattern).toBe(false);
  });

  it('should provide default patterns when none specified', () => {
    const patterns: string[] = [];
    const defaultPatterns = ['src/**/*.{ts,tsx,js,jsx}'];

    const finalPatterns = patterns.length > 0 ? patterns : defaultPatterns;
    expect(finalPatterns).toEqual(['src/**/*.{ts,tsx,js,jsx}']);
  });
});

describe('Pattern Matching Logic', () => {
  function matchesPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  it('should match exact filenames', () => {
    expect(matchesPattern('test.ts', 'test.ts')).toBe(true);
    expect(matchesPattern('test.js', 'test.ts')).toBe(false);
  });

  it('should match wildcard patterns', () => {
    expect(matchesPattern('test.ts', '*.ts')).toBe(true);
    expect(matchesPattern('test.js', '*.ts')).toBe(false);
    expect(matchesPattern('any-file.tsx', '*.tsx')).toBe(true);
  });

  it('should match complex patterns', () => {
    expect(matchesPattern('component.test.ts', '*.test.ts')).toBe(true);
    expect(matchesPattern('component.spec.ts', '*.test.ts')).toBe(false);
    expect(matchesPattern('file.d.ts', '*.d.ts')).toBe(true);
  });
});
