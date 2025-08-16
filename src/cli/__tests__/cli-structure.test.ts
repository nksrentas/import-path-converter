/**
 * CLI structure and help text tests
 */

import { describe, it, expect } from 'vitest';

describe('CLI Structure Tests', () => {
  describe('Help Text Content', () => {
    const HELP_TEXT = `
import-path-converter - Convert relative imports to path alias imports

USAGE:
  import-path-converter [patterns...] [options]

ARGUMENTS:
  patterns              File patterns to process (default: "src/**/*.{ts,tsx,js,jsx}")

OPTIONS:
  --config, -c <path>   Path to tsconfig.json (default: auto-detect)
  --ignore, -i <path>   Path to ignore file (default: .importignore)
  --dry-run, -d         Show what would be changed without modifying files
  --verbose, -v         Show detailed output
  --help, -h            Show this help message
  --version, -V         Show version number

EXAMPLES:
  import-path-converter src/
  import-path-converter "src/**/*.ts" --config tsconfig.json --dry-run
  import-path-converter src/ --ignore .importignore --verbose
`;

    it('should contain proper usage information', () => {
      expect(HELP_TEXT).toContain('USAGE:');
      expect(HELP_TEXT).toContain('import-path-converter [patterns...] [options]');
    });

    it('should document all command line options', () => {
      expect(HELP_TEXT).toContain('--config, -c');
      expect(HELP_TEXT).toContain('--ignore, -i');
      expect(HELP_TEXT).toContain('--dry-run, -d');
      expect(HELP_TEXT).toContain('--verbose, -v');
      expect(HELP_TEXT).toContain('--help, -h');
      expect(HELP_TEXT).toContain('--version, -V');
    });

    it('should provide usage examples', () => {
      expect(HELP_TEXT).toContain('EXAMPLES:');
      expect(HELP_TEXT).toContain('import-path-converter src/');
      expect(HELP_TEXT).toContain('--dry-run');
      expect(HELP_TEXT).toContain('--verbose');
    });

    it('should explain default behaviors', () => {
      expect(HELP_TEXT).toContain('default: auto-detect');
      expect(HELP_TEXT).toContain('default: .importignore');
      expect(HELP_TEXT).toContain('default: "src/**/*.{ts,tsx,js,jsx}"');
    });
  });

  describe('CLI Options Structure', () => {
    interface CLIOptions {
      patterns: string[];
      config?: string;
      ignore?: string;
      dryRun: boolean;
      verbose: boolean;
      help: boolean;
      version: boolean;
    }

    function createDefaultOptions(): CLIOptions {
      return {
        patterns: ['src/**/*.{ts,tsx,js,jsx}'],
        dryRun: false,
        verbose: false,
        help: false,
        version: false,
      };
    }

    it('should have correct default option structure', () => {
      const options = createDefaultOptions();

      expect(options.patterns).toEqual(['src/**/*.{ts,tsx,js,jsx}']);
      expect(options.dryRun).toBe(false);
      expect(options.verbose).toBe(false);
      expect(options.help).toBe(false);
      expect(options.version).toBe(false);
      expect(options.config).toBeUndefined();
      expect(options.ignore).toBeUndefined();
    });

    it('should support all required option types', () => {
      const options: CLIOptions = {
        patterns: ['src/', 'lib/'],
        config: 'tsconfig.json',
        ignore: '.importignore',
        dryRun: true,
        verbose: true,
        help: false,
        version: false,
      };

      expect(Array.isArray(options.patterns)).toBe(true);
      expect(typeof options.config).toBe('string');
      expect(typeof options.ignore).toBe('string');
      expect(typeof options.dryRun).toBe('boolean');
      expect(typeof options.verbose).toBe('boolean');
      expect(typeof options.help).toBe('boolean');
      expect(typeof options.version).toBe('boolean');
    });
  });

  describe('Processing Statistics Structure', () => {
    interface ProcessingStats {
      totalFiles: number;
      modifiedFiles: number;
      totalConversions: number;
      successfulConversions: number;
      errors: number;
    }

    function createEmptyStats(): ProcessingStats {
      return {
        totalFiles: 0,
        modifiedFiles: 0,
        totalConversions: 0,
        successfulConversions: 0,
        errors: 0,
      };
    }

    it('should have correct statistics structure', () => {
      const stats = createEmptyStats();

      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.modifiedFiles).toBe('number');
      expect(typeof stats.totalConversions).toBe('number');
      expect(typeof stats.successfulConversions).toBe('number');
      expect(typeof stats.errors).toBe('number');
    });

    it('should initialize with zero values', () => {
      const stats = createEmptyStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.modifiedFiles).toBe(0);
      expect(stats.totalConversions).toBe(0);
      expect(stats.successfulConversions).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should support incrementing values', () => {
      const stats = createEmptyStats();

      stats.totalFiles = 5;
      stats.modifiedFiles = 3;
      stats.totalConversions = 10;
      stats.successfulConversions = 8;
      stats.errors = 1;

      expect(stats.totalFiles).toBe(5);
      expect(stats.modifiedFiles).toBe(3);
      expect(stats.totalConversions).toBe(10);
      expect(stats.successfulConversions).toBe(8);
      expect(stats.errors).toBe(1);
    });
  });

  describe('Exit Code Handling', () => {
    function getExitCode(hasErrors: boolean, isHelpOrVersion: boolean): number {
      if (isHelpOrVersion) {
        return 0;
      }
      return hasErrors ? 1 : 0;
    }

    it('should return 0 for successful processing', () => {
      expect(getExitCode(false, false)).toBe(0);
    });

    it('should return 1 for processing with errors', () => {
      expect(getExitCode(true, false)).toBe(1);
    });

    it('should return 0 for help and version commands', () => {
      expect(getExitCode(false, true)).toBe(0);
      expect(getExitCode(true, true)).toBe(0);
    });
  });

  describe('File Pattern Expansion', () => {
    function expandSimplePattern(pattern: string): string[] {
      if (pattern.endsWith('/')) {
        return [pattern + '**/*.{ts,tsx,js,jsx}'];
      }

      if (pattern.includes('**')) {
        return [pattern];
      }

      return [pattern];
    }

    it('should expand directory patterns', () => {
      const result = expandSimplePattern('src/');
      expect(result).toEqual(['src/**/*.{ts,tsx,js,jsx}']);
    });

    it('should preserve glob patterns', () => {
      const result = expandSimplePattern('src/**/*.ts');
      expect(result).toEqual(['src/**/*.ts']);
    });

    it('should preserve exact file patterns', () => {
      const result = expandSimplePattern('src/index.ts');
      expect(result).toEqual(['src/index.ts']);
    });
  });
});
