import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseConfig, buildPathMappingLookup } from '../config-parser.js';
import { TSConfigPaths } from '../types.js';

describe('Config Parser', () => {
  const testDir = path.join(__dirname, 'test-configs');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseConfig', () => {
    it('should parse a basic tsconfig.json with paths', () => {
      const configContent = {
        compilerOptions: {
          baseUrl: './src',
          paths: {
            '~/*': ['./app/*'],
            '@/*': ['./components/*'],
          },
        },
      };

      const configPath = path.join(testDir, 'tsconfig.json');
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

      const result = parseConfig(configPath);

      expect(result.baseUrl).toBe('./src');
      expect(result.rootDir).toBe(testDir);
      expect(result.pathMappings.size).toBe(2);
      expect(result.pathMappings.has('~')).toBe(true);
      expect(result.pathMappings.has('@')).toBe(true);
    });

    it('should handle tsconfig.json without paths', () => {
      const configContent = {
        compilerOptions: {
          baseUrl: './',
        },
      };

      const configPath = path.join(testDir, 'tsconfig.json');
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

      const result = parseConfig(configPath);

      expect(result.baseUrl).toBe('./');
      expect(result.pathMappings.size).toBe(0);
    });

    it('should use default baseUrl when not specified', () => {
      const configContent = {
        compilerOptions: {
          paths: {
            '~/*': ['./app/*'],
          },
        },
      };

      const configPath = path.join(testDir, 'tsconfig.json');
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

      const result = parseConfig(configPath);

      expect(result.baseUrl).toBe('.');
    });

    it('should handle tsconfig.json with comments', () => {
      const configContent = `{

        "compilerOptions": {
          "baseUrl": "./src", /* Another comment */
          "paths": {
            "~/*": ["./app/*"], // Line comment
            "@/*": ["./components/*"]
          }
        }
      }`;

      const configPath = path.join(testDir, 'tsconfig.json');
      fs.writeFileSync(configPath, configContent);

      const result = parseConfig(configPath);

      expect(result.baseUrl).toBe('./src');
      expect(result.pathMappings.size).toBe(2);
    });

    it('should handle extended configurations', () => {
      const baseConfig = {
        compilerOptions: {
          baseUrl: './src',
          paths: {
            '~/*': ['./app/*'],
          },
        },
      };

      const baseConfigPath = path.join(testDir, 'tsconfig.base.json');
      fs.writeFileSync(baseConfigPath, JSON.stringify(baseConfig, null, 2));

      const extendingConfig = {
        extends: './tsconfig.base.json',
        compilerOptions: {
          paths: {
            '@/*': ['./components/*'],
          },
        },
      };

      const configPath = path.join(testDir, 'tsconfig.json');
      fs.writeFileSync(configPath, JSON.stringify(extendingConfig, null, 2));

      const result = parseConfig(configPath);

      expect(result.baseUrl).toBe('./src');
      expect(result.pathMappings.size).toBe(2);
      expect(result.pathMappings.has('~')).toBe(true);
      expect(result.pathMappings.has('@')).toBe(true);
    });

    it('should throw error for non-existent config file', () => {
      const nonExistentPath = path.join(testDir, 'non-existent.json');

      expect(() => parseConfig(nonExistentPath)).toThrow('tsconfig.json not found');
    });

    it('should throw error for invalid JSON', () => {
      const configPath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(configPath, '{ invalid json }');

      expect(() => parseConfig(configPath)).toThrow('Failed to parse tsconfig.json');
    });
  });

  describe('buildPathMappingLookup', () => {
    it('should build efficient lookup structures', () => {
      const paths: TSConfigPaths = {
        '~/*': ['./app/*'],
        '@/*': ['./src/*'],
        '@components/*': ['./src/components/*'],
      };

      const baseUrl = './';
      const rootDir = '/project';

      const result = buildPathMappingLookup(paths, baseUrl, rootDir);

      expect(result.size).toBe(3);
      expect(result.has('~')).toBe(true);
      expect(result.has('@')).toBe(true);
      expect(result.has('@components')).toBe(true);

      const tildeMapping = result.get('~')!;
      expect(tildeMapping).toHaveLength(1);
      expect(tildeMapping[0].alias).toBe('~/*');
      expect(tildeMapping[0].basePath).toBe('./app/*');
      expect(tildeMapping[0].resolvedBase).toBe(path.resolve('/project', './', './app'));
    });

    it('should handle multiple paths for same alias', () => {
      const paths: TSConfigPaths = {
        '@/*': ['./src/*', './lib/*'],
      };

      const baseUrl = './';
      const rootDir = '/project';

      const result = buildPathMappingLookup(paths, baseUrl, rootDir);

      expect(result.size).toBe(1);
      const atMapping = result.get('@')!;
      expect(atMapping).toHaveLength(2);
      expect(atMapping[0].basePath).toBe('./src/*');
      expect(atMapping[1].basePath).toBe('./lib/*');
    });

    it('should handle empty paths configuration', () => {
      const paths: TSConfigPaths = {};
      const baseUrl = './';
      const rootDir = '/project';

      const result = buildPathMappingLookup(paths, baseUrl, rootDir);

      expect(result.size).toBe(0);
    });

    it('should correctly resolve absolute paths', () => {
      const paths: TSConfigPaths = {
        '~/*': ['./app/*'],
      };

      const baseUrl = './src';
      const rootDir = '/project';

      const result = buildPathMappingLookup(paths, baseUrl, rootDir);

      const tildeMapping = result.get('~')!;
      expect(tildeMapping[0].resolvedBase).toBe(path.resolve('/project', './src', './app'));
    });

    it('should handle complex alias patterns', () => {
      const paths: TSConfigPaths = {
        '@utils/*': ['./src/utils/*'],
        '@components/*': ['./src/components/*'],
        '@pages/*': ['./src/pages/*'],
      };

      const baseUrl = './';
      const rootDir = '/project';

      const result = buildPathMappingLookup(paths, baseUrl, rootDir);

      expect(result.size).toBe(3);
      expect(result.has('@utils')).toBe(true);
      expect(result.has('@components')).toBe(true);
      expect(result.has('@pages')).toBe(true);
    });
  });
});
