import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import {
  createIgnoreState,
  compilePatterns,
  shouldIgnore,
  shouldIgnoreDirectory,
  filterIgnoredFiles,
} from '../ignore-manager.js';
import type { IgnoreState } from '../types.js';

describe('ignore-manager', () => {
  const testIgnoreFile = '.test-importignore';

  afterEach(() => {
    if (existsSync(testIgnoreFile)) {
      unlinkSync(testIgnoreFile);
    }
  });

  describe('createIgnoreState', () => {
    it('should create ignore state with default patterns', () => {
      const state = createIgnoreState();

      expect(state.patterns).toBeDefined();
      expect(state.originalPatterns).toBeDefined();
      expect(state.originalPatterns.length).toBeGreaterThan(0);
      expect(state.originalPatterns).toContain('node_modules/**');
      expect(state.originalPatterns).toContain('**/*.d.ts');
    });

    it('should read patterns from ignore file', () => {
      const ignoreContent = `
# This is a comment
*.log
temp/
src/generated/**
!important.log
`;
      writeFileSync(testIgnoreFile, ignoreContent);

      const state = createIgnoreState(testIgnoreFile);

      expect(state.originalPatterns).toContain('*.log');
      expect(state.originalPatterns).toContain('temp/');
      expect(state.originalPatterns).toContain('src/generated/**');
      expect(state.originalPatterns).toContain('!important.log');
      expect(state.originalPatterns).not.toContain('# This is a comment');
    });

    it('should handle additional patterns from options', () => {
      const state = createIgnoreState(undefined, {
        additionalPatterns: ['custom/**', '*.custom'],
      });

      expect(state.originalPatterns).toContain('custom/**');
      expect(state.originalPatterns).toContain('*.custom');
    });

    it('should handle missing ignore file gracefully', () => {
      const state = createIgnoreState('non-existent-file');

      expect(state.patterns).toBeDefined();
      expect(state.originalPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('compilePatterns', () => {
    it('should compile simple filename patterns', () => {
      const patterns = compilePatterns(['*.log', '*.tmp']);

      expect(patterns).toHaveLength(2);
      expect(patterns[0].test('error.log')).toBe(true);
      expect(patterns[0].test('src/error.log')).toBe(true);
      expect(patterns[0].test('error.txt')).toBe(false);
      expect(patterns[1].test('temp.tmp')).toBe(true);
    });

    it('should compile directory patterns', () => {
      const patterns = compilePatterns(['temp/', 'build/']);

      expect(patterns[0].test('temp')).toBe(true);
      expect(patterns[0].test('temp/')).toBe(true);
      expect(patterns[0].test('temp/file.txt')).toBe(true);
      expect(patterns[0].test('src/temp')).toBe(true);
      expect(patterns[0].test('temporary')).toBe(false);
    });

    it('should compile wildcard patterns', () => {
      const patterns = compilePatterns(['src/**/*.test.js', 'docs/*']);

      expect(patterns[0].test('src/utils/helper.test.js')).toBe(true);
      expect(patterns[0].test('src/deep/nested/path/component.test.js')).toBe(true);
      expect(patterns[0].test('src/component.js')).toBe(false);

      expect(patterns[1].test('docs/readme.md')).toBe(true);
      expect(patterns[1].test('docs/deep/readme.md')).toBe(false);
    });

    it('should handle absolute patterns (starting with /)', () => {
      const patterns = compilePatterns(['/root-only.txt', '/config/']);

      expect(patterns[0].test('root-only.txt')).toBe(true);
      expect(patterns[0].test('src/root-only.txt')).toBe(false);

      expect(patterns[1].test('config')).toBe(true);
      expect(patterns[1].test('src/config')).toBe(false);
    });

    it('should handle negation patterns', () => {
      const patterns = compilePatterns(['*.log', '!important.log']);

      expect(patterns[0].test('error.log')).toBe(true);
      expect(patterns[1].test('important.log')).toBe(true);
    });

    it('should handle question mark wildcards', () => {
      const patterns = compilePatterns(['test?.js', 'file??.txt']);

      expect(patterns[0].test('test1.js')).toBe(true);
      expect(patterns[0].test('testA.js')).toBe(true);
      expect(patterns[0].test('test12.js')).toBe(false);
      expect(patterns[0].test('test.js')).toBe(false);

      expect(patterns[1].test('file01.txt')).toBe(true);
      expect(patterns[1].test('fileAB.txt')).toBe(true);
      expect(patterns[1].test('file1.txt')).toBe(false);
    });

    it('should handle empty and invalid patterns', () => {
      const patterns = compilePatterns(['', '   ', 'valid.txt']);

      expect(patterns).toHaveLength(3);
      expect(patterns[0].test('anything')).toBe(false);
      expect(patterns[1].test('anything')).toBe(false);
      expect(patterns[2].test('valid.txt')).toBe(true);
    });
  });

  describe('shouldIgnore', () => {
    let state: IgnoreState;

    beforeEach(() => {
      state = createIgnoreState(undefined, {
        useDefaults: false,
        ignoreNodeModules: false,
        additionalPatterns: [
          '*.log',
          'temp/',
          'src/**/*.test.js',
          '!important.log',
          '/root-only.txt',
        ],
      });
    });

    it('should ignore files matching patterns', () => {
      const result1 = shouldIgnore(state, 'error.log');
      expect(result1.shouldIgnore).toBe(true);
      expect(result1.matchedPattern).toBe('*.log');

      const result2 = shouldIgnore(state, 'src/utils/helper.test.js');
      expect(result2.shouldIgnore).toBe(true);
      expect(result2.matchedPattern).toBe('src/**/*.test.js');
    });

    it('should not ignore files that do not match patterns', () => {
      const result = shouldIgnore(state, 'src/component.js');
      expect(result.shouldIgnore).toBe(false);
      expect(result.reason).toBe('No ignore patterns matched');
    });

    it('should handle negation patterns correctly', () => {
      const result = shouldIgnore(state, 'important.log');
      expect(result.shouldIgnore).toBe(false);
      expect(result.matchedPattern).toBe('!important.log');
      expect(result.reason).toContain('Negation pattern');
    });

    it('should handle directory patterns', () => {
      const result1 = shouldIgnore(state, 'temp/file.txt');
      expect(result1.shouldIgnore).toBe(true);
      expect(result1.matchedPattern).toBe('temp/');

      const result2 = shouldIgnore(state, 'temp');
      expect(result2.shouldIgnore).toBe(true);
    });

    it('should handle absolute patterns', () => {
      const result1 = shouldIgnore(state, 'root-only.txt');
      expect(result1.shouldIgnore).toBe(true);
      expect(result1.matchedPattern).toBe('/root-only.txt');

      const result2 = shouldIgnore(state, 'src/root-only.txt');
      expect(result2.shouldIgnore).toBe(false);
    });

    it('should normalize path separators', () => {
      const result = shouldIgnore(state, 'temp\\file.txt');
      expect(result.shouldIgnore).toBe(true);
      expect(result.matchedPattern).toBe('temp/');
    });

    it('should handle paths with leading slashes', () => {
      const result = shouldIgnore(state, '/temp/file.txt');
      expect(result.shouldIgnore).toBe(true);
      expect(result.matchedPattern).toBe('temp/');
    });
  });

  describe('shouldIgnoreDirectory', () => {
    let state: IgnoreState;

    beforeEach(() => {
      state = createIgnoreState(undefined, {
        useDefaults: false,
        ignoreNodeModules: false,
        additionalPatterns: ['temp/', 'build/', 'node_modules/**'],
      });
    });

    it('should ignore directories matching patterns', () => {
      expect(shouldIgnoreDirectory(state, 'temp')).toBe(true);
      expect(shouldIgnoreDirectory(state, 'temp/')).toBe(true);
      expect(shouldIgnoreDirectory(state, 'build')).toBe(true);
      expect(shouldIgnoreDirectory(state, 'node_modules')).toBe(true);
    });

    it('should not ignore directories that do not match patterns', () => {
      expect(shouldIgnoreDirectory(state, 'src')).toBe(false);
      expect(shouldIgnoreDirectory(state, 'docs')).toBe(false);
    });

    it('should handle nested directories', () => {
      expect(shouldIgnoreDirectory(state, 'src/temp')).toBe(true);
      expect(shouldIgnoreDirectory(state, 'project/build')).toBe(true);
    });
  });

  describe('filterIgnoredFiles', () => {
    let state: IgnoreState;

    beforeEach(() => {
      state = createIgnoreState(undefined, {
        useDefaults: false,
        ignoreNodeModules: false,
        additionalPatterns: ['*.log', 'temp/', 'node_modules/**', '!important.log'],
      });
    });

    it('should filter out ignored files', () => {
      const files = [
        'src/component.js',
        'error.log',
        'temp/cache.txt',
        'important.log',
        'node_modules/package/index.js',
        'docs/readme.md',
      ];

      const filtered = filterIgnoredFiles(state, files);

      expect(filtered).toContain('src/component.js');
      expect(filtered).toContain('important.log');
      expect(filtered).toContain('docs/readme.md');
      expect(filtered).not.toContain('error.log');
      expect(filtered).not.toContain('temp/cache.txt');
      expect(filtered).not.toContain('node_modules/package/index.js');
    });

    it('should return empty array when all files are ignored', () => {
      const files = ['error.log', 'debug.log', 'temp/file.txt'];
      const filtered = filterIgnoredFiles(state, files);

      expect(filtered).toHaveLength(0);
    });

    it('should return all files when none are ignored', () => {
      const files = ['src/component.js', 'docs/readme.md', 'important.log'];
      const filtered = filterIgnoredFiles(state, files);

      expect(filtered).toHaveLength(3);
      expect(filtered).toEqual(files);
    });
  });

  describe('integration tests', () => {
    it('should handle complex gitignore-style patterns', () => {
      const ignoreContent = `
# Dependencies
node_modules/
npm-debug.log*

# Build outputs
dist/
build/
*.tsbuildinfo

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Test files
**/*.test.js
**/*.spec.ts
coverage/

# But keep important test files
!src/important.test.js
!**/*.integration.test.js

# Logs
logs/
*.log
!error.log

# Temporary files
tmp/
temp/
*.tmp
`;

      writeFileSync(testIgnoreFile, ignoreContent);
      const state = createIgnoreState(testIgnoreFile, { useDefaults: false });

      expect(shouldIgnore(state, 'node_modules/package/index.js').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, 'dist/bundle.js').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, 'src/component.test.js').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, 'debug.log').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, '.DS_Store').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, 'coverage/lcov.info').shouldIgnore).toBe(true);

      expect(shouldIgnore(state, 'src/important.test.js').shouldIgnore).toBe(false);
      expect(shouldIgnore(state, 'src/api.integration.test.js').shouldIgnore).toBe(false);
      expect(shouldIgnore(state, 'error.log').shouldIgnore).toBe(false);
      expect(shouldIgnore(state, 'src/component.js').shouldIgnore).toBe(false);
      expect(shouldIgnore(state, 'README.md').shouldIgnore).toBe(false);
    });

    it('should handle edge cases and malformed patterns', () => {
      const state = createIgnoreState(undefined, {
        useDefaults: false,
        additionalPatterns: ['', '   ', '*.', '**', '***', '[invalid', 'normal.txt'],
      });

      expect(shouldIgnore(state, 'normal.txt').shouldIgnore).toBe(true);
      expect(shouldIgnore(state, 'other.txt').shouldIgnore).toBe(false);
    });
  });
});
