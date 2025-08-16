import { readFileSync, existsSync } from 'fs';
import type { IgnoreState, IgnoreOptions, IgnoreCheckResult } from './types.js';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  '**/*.d.ts',
  'dist/**',
  'build/**',
  '.git/**',
  '**/.DS_Store',
];

/**
 * Creates an IgnoreState object with compiled patterns for efficient file exclusion checking
 * @param ignoreFilePath Optional path to ignore file (defaults to .importignore)
 * @param options Additional options for ignore behavior
 * @returns IgnoreState object with compiled patterns
 */
export function createIgnoreState(
  ignoreFilePath?: string,
  options: IgnoreOptions = {}
): IgnoreState {
  const patterns: string[] = [];

  if (options.useDefaults !== false) {
    patterns.push(...DEFAULT_IGNORE_PATTERNS);
  }

  if (options.ignoreNodeModules !== false) {
    patterns.push('node_modules/**');
  }
  const ignoreFile = ignoreFilePath === null ? null : ignoreFilePath || '.importignore';
  if (ignoreFile && existsSync(ignoreFile)) {
    try {
      const content = readFileSync(ignoreFile, 'utf-8');
      const filePatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      patterns.push(...filePatterns);
    } catch (error) {
      console.warn(`Warning: Could not read ignore file ${ignoreFile}:`, error);
    }
  }

  if (options.additionalPatterns) {
    patterns.push(...options.additionalPatterns);
  }
  const compiledPatterns = compilePatterns(patterns);

  return {
    patterns: compiledPatterns,
    originalPatterns: patterns,
    ignoreDirectories: options.ignoreDirectories,
  };
}

/**
 * Compiles gitignore-style patterns to regular expressions
 * @param patterns Array of gitignore-style pattern strings
 * @returns Array of compiled RegExp objects
 */
export function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map(pattern => {
    const isNegation = pattern.startsWith('!');
    const cleanPattern = isNegation ? pattern.slice(1) : pattern;

    if (!cleanPattern.trim() || cleanPattern === '**' || cleanPattern === '***') {
      return new RegExp('$.^');
    }

    let regexPattern = cleanPattern;

    const isAbsolutePattern = regexPattern.startsWith('/');
    if (isAbsolutePattern) {
      regexPattern = regexPattern.slice(1);
    }

    regexPattern = regexPattern
      .replace(/\*\*/g, '__DOUBLESTAR__')
      .replace(/\*/g, '__SINGLESTAR__')
      .replace(/\?/g, '__QUESTION__')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/__DOUBLESTAR__/g, '.*')
      .replace(/__SINGLESTAR__/g, '[^/]*')
      .replace(/__QUESTION__/g, '[^/]');

    if (cleanPattern.endsWith('/')) {
      regexPattern = regexPattern.slice(0, -1) + '(/.*)?';
    }

    if (isAbsolutePattern) {
      regexPattern = `^${regexPattern}$`;
    } else if (cleanPattern.includes('/')) {
      regexPattern = `(^|/)${regexPattern}$`;
    } else {
      regexPattern = `(^|/)${regexPattern}(/.*)?$`;
    }

    try {
      return new RegExp(regexPattern, 'i');
    } catch (error) {
      console.warn(`Warning: Invalid ignore pattern "${pattern}":`, error);
      return new RegExp('$.^');
    }
  });
}

/**
 * Checks if a file path should be ignored based on compiled patterns
 * @param state IgnoreState containing compiled patterns
 * @param filePath Path to check (can be relative or absolute)
 * @returns IgnoreCheckResult indicating whether to ignore the file
 */
export function shouldIgnore(state: IgnoreState, filePath: string): IgnoreCheckResult {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;

  let lastMatch: { shouldIgnore: boolean; matchedPattern: string; reason: string } | null = null;

  for (let i = 0; i < state.patterns.length; i++) {
    const pattern = state.patterns[i];
    const originalPattern = state.originalPatterns[i];
    const isNegation = originalPattern.startsWith('!');

    if (pattern.test(cleanPath)) {
      if (isNegation) {
        lastMatch = {
          shouldIgnore: false,
          matchedPattern: originalPattern,
          reason: `Negation pattern "${originalPattern}" matched`,
        };
      } else {
        lastMatch = {
          shouldIgnore: true,
          matchedPattern: originalPattern,
          reason: `Pattern "${originalPattern}" matched`,
        };
      }
    }
  }

  return (
    lastMatch || {
      shouldIgnore: false,
      reason: 'No ignore patterns matched',
    }
  );
}

/**
 * Checks if a directory should be ignored
 * @param state IgnoreState containing compiled patterns
 * @param dirPath Directory path to check
 * @returns boolean indicating whether to ignore the directory
 */
export function shouldIgnoreDirectory(state: IgnoreState, dirPath: string): boolean {
  const normalizedDir = dirPath.replace(/\\/g, '/');
  const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';

  const result = shouldIgnore(state, dirWithSlash);
  return result.shouldIgnore;
}

/**
 * Filters an array of file paths, removing those that should be ignored
 * @param state IgnoreState containing compiled patterns
 * @param filePaths Array of file paths to filter
 * @returns Array of file paths that should not be ignored
 */
export function filterIgnoredFiles(state: IgnoreState, filePaths: string[]): string[] {
  return filePaths.filter(filePath => !shouldIgnore(state, filePath).shouldIgnore);
}
