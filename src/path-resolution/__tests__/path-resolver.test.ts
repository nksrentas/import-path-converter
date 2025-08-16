import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { createPathResolver, resolveImport, findBestMatch } from '../index.js';
import { ParsedConfig, PathMapping } from '../../config-parsing/types.js';
import { PathResolverState } from '../types.js';

describe('Path Resolution', () => {
  let mockConfig: ParsedConfig;
  let resolverState: PathResolverState;

  beforeEach(() => {
    const pathMappings = new Map<string, PathMapping[]>();

    pathMappings.set('~', [
      {
        alias: '~/*',
        basePath: './app/*',
        resolvedBase: '/project/app',
      },
    ]);

    pathMappings.set('@', [
      {
        alias: '@/*',
        basePath: './src/*',
        resolvedBase: '/project/src',
      },
    ]);

    pathMappings.set('@components', [
      {
        alias: '@components/*',
        basePath: './src/components/*',
        resolvedBase: '/project/src/components',
      },
    ]);

    pathMappings.set('@utils', [
      {
        alias: '@utils/*',
        basePath: './src/utils/*',
        resolvedBase: '/project/src/utils',
      },
    ]);

    mockConfig = {
      baseUrl: '/project',
      pathMappings,
      rootDir: '/project',
    };

    resolverState = createPathResolver(mockConfig);
  });

  describe('createPathResolver', () => {
    it('should create resolver state with correct path mappings', () => {
      expect(resolverState.pathMappings).toBeDefined();
      expect(resolverState.aliasLookup).toBeDefined();
      expect(resolverState.pathMappings.size).toBe(4);
    });

    it('should build reverse lookup map correctly', () => {
      expect(resolverState.aliasLookup.get('/project/app')).toBe('~');
      expect(resolverState.aliasLookup.get('/project/src')).toBe('@');
      expect(resolverState.aliasLookup.get('/project/src/components')).toBe('@components');
      expect(resolverState.aliasLookup.get('/project/src/utils')).toBe('@utils');
    });
  });

  describe('findBestMatch', () => {
    it('should find exact match for configured paths', () => {
      const match = findBestMatch(resolverState, '/project/app/components/Button.ts');
      expect(match).toBeTruthy();
      expect(match?.alias).toBe('~/*');
    });

    it('should prefer more specific matches', () => {
      const match = findBestMatch(resolverState, '/project/src/components/Button.ts');
      expect(match).toBeTruthy();
      expect(match?.alias).toBe('@components/*');
    });

    it('should return null for paths with no matching alias', () => {
      const match = findBestMatch(resolverState, '/other/project/file.ts');
      expect(match).toBeNull();
    });

    it('should handle nested paths correctly', () => {
      const match = findBestMatch(resolverState, '/project/src/utils/helpers/format.ts');
      expect(match).toBeTruthy();
      expect(match?.alias).toBe('@utils/*');
    });
  });

  describe('resolveImport', () => {
    const fromFile = '/project/src/pages/Home.tsx';

    it('should convert relative import to alias', () => {
      const result = resolveImport(resolverState, '../components/Button', fromFile);

      expect(result.originalImport).toBe('../components/Button');
      expect(result.convertedImport).toBe('@components/Button');
      expect(result.reason).toContain('@components/*');
    });

    it('should handle deep relative imports', () => {
      const result = resolveImport(resolverState, '../../app/services/api', fromFile);

      expect(result.originalImport).toBe('../../app/services/api');
      expect(result.convertedImport).toBe('~/services/api');
    });

    it('should not convert non-relative imports', () => {
      const result = resolveImport(resolverState, 'react', fromFile);

      expect(result.originalImport).toBe('react');
      expect(result.convertedImport).toBeNull();
      expect(result.reason).toBe('Not a relative import');
    });

    it('should handle imports with no matching alias', () => {
      const result = resolveImport(resolverState, '../../../external/lib', fromFile);

      expect(result.originalImport).toBe('../../../external/lib');
      expect(result.convertedImport).toBeNull();
      expect(result.reason).toBe('No matching path alias found');
    });

    it('should handle current directory imports', () => {
      const result = resolveImport(resolverState, './LocalComponent', fromFile);

      expect(result.originalImport).toBe('./LocalComponent');
      expect(result.convertedImport).toBe('@/pages/LocalComponent');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed file paths gracefully', () => {
      const result = resolveImport(resolverState, '../components/Button', '');

      expect(result.originalImport).toBe('../components/Button');
      expect(result.convertedImport).toBeNull();
      expect(result.reason).toContain('Error during conversion');
    });

    it('should handle paths with special characters', () => {
      const specialFromFile = '/project/src/pages/user-profile.tsx';
      const result = resolveImport(resolverState, '../components/user-card', specialFromFile);

      expect(result.convertedImport).toBe('@components/user-card');
    });

    it('should handle invalid paths gracefully', () => {
      const result = resolveImport(resolverState, '../components/Button', '/invalid/path');

      expect(result.originalImport).toBe('../components/Button');
      expect(result.convertedImport).toBeNull();
      expect(result.reason).toBe('No matching path alias found');
    });
  });

  describe('Module Resolution Behavior Validation', () => {
    it('should maintain module resolution semantics', () => {
      const fromFile = '/project/src/pages/user/Profile.tsx';
      const originalImport = '../../components/Button';

      const originalResolved = path.resolve(path.dirname(fromFile), originalImport);

      const result = resolveImport(resolverState, originalImport, fromFile);

      if (result.convertedImport) {
        const expectedPath = '/project/src/components/Button';
        expect(originalResolved).toBe(expectedPath);
      }
    });

    it('should handle file extensions correctly', () => {
      const result = resolveImport(
        resolverState,
        '../components/Button.tsx',
        '/project/src/pages/Home.tsx'
      );

      expect(result.convertedImport).toBe('@components/Button.tsx');
    });

    it('should handle index files', () => {
      const result = resolveImport(resolverState, '../components', '/project/src/pages/Home.tsx');

      expect(result.convertedImport).toBe('@components');
    });
  });

  describe('Performance and Efficiency', () => {
    it('should handle large numbers of path mappings efficiently', () => {
      const largeMappings = new Map<string, PathMapping[]>();

      for (let i = 0; i < 100; i++) {
        largeMappings.set(`@lib${i}`, [
          {
            alias: `@lib${i}/*`,
            basePath: `./lib${i}/*`,
            resolvedBase: `/project/lib${i}`,
          },
        ]);
      }

      const largeConfig: ParsedConfig = {
        baseUrl: '/project',
        pathMappings: largeMappings,
        rootDir: '/project',
      };

      const largeResolverState = createPathResolver(largeConfig);

      const start = Date.now();
      const result = resolveImport(
        largeResolverState,
        '../lib50/utils',
        '/project/src/pages/Home.tsx'
      );
      const end = Date.now();

      expect(end - start).toBeLessThan(10); 
      expect(result.convertedImport).toBe('@lib50/utils');
    });
  });
});
