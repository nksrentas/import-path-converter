/**
 * Performance tests and benchmarks for import-path-converter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { convertImports } from '../api.js';
import { parseConfig } from '../config-parsing/index.js';
import { createPathResolver, resolveImport } from '../path-resolution/index.js';
import { processBatch } from '../performance/index.js';
import { MemoryManager } from '../performance/memory-manager.js';

describe('Performance Tests', () => {
  let tempDir: string;
  let memoryManager: MemoryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-test-'));
    memoryManager = new MemoryManager();
    memoryManager.startMonitoring();
  });

  afterEach(async () => {
    memoryManager.stopMonitoring();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Path Resolution Performance', () => {
    it('should resolve imports in O(1) time complexity', async () => {
      const config = {
        baseUrl: '.',
        pathMappings: new Map([
          ['~', [{ alias: '~/*', basePath: './src/*', resolvedBase: path.join(tempDir, 'src') }]],
          ['@', [{ alias: '@/*', basePath: './lib/*', resolvedBase: path.join(tempDir, 'lib') }]],
          [
            '@components',
            [
              {
                alias: '@components/*',
                basePath: './src/components/*',
                resolvedBase: path.join(tempDir, 'src/components'),
              },
            ],
          ],
        ]),
        rootDir: tempDir,
      };

      const resolverState = createPathResolver(config);

      const testSizes = [10, 100, 1000];
      const times: number[] = [];

      for (const size of testSizes) {
        for (let i = 0; i < size; i++) {
          config.pathMappings.set(`alias${i}`, [
            {
              alias: `alias${i}/*`,
              basePath: `./test${i}/*`,
              resolvedBase: path.join(tempDir, `test${i}`),
            },
          ]);
        }

        const newResolverState = createPathResolver(config);
        const testFile = path.join(tempDir, 'src/test.ts');
        const importPath = '../lib/utils';

        const start = process.hrtime.bigint();
        for (let i = 0; i < 1000; i++) {
          resolveImport(newResolverState, importPath, testFile);
        }
        const end = process.hrtime.bigint();

        const timeMs = Number(end - start) / 1000000; 
        times.push(timeMs);
      }

      const timeIncrease = times[2] / times[0];
      expect(timeIncrease).toBeLessThan(2); // Should not double even with 100x more mappings
    });

    it('should cache resolved imports for better performance', async () => {
      const config = {
        baseUrl: '.',
        pathMappings: new Map([
          ['~', [{ alias: '~/*', basePath: './src/*', resolvedBase: path.join(tempDir, 'src') }]],
        ]),
        rootDir: tempDir,
      };

      const resolverState = createPathResolver(config);
      const testFile = path.join(tempDir, 'src/test.ts');
      const importPath = '../lib/utils';

      const start1 = process.hrtime.bigint();
      const result1 = resolveImport(resolverState, importPath, testFile);
      const end1 = process.hrtime.bigint();
      const time1 = Number(end1 - start1);

      const start2 = process.hrtime.bigint();
      const result2 = resolveImport(resolverState, importPath, testFile);
      const end2 = process.hrtime.bigint();
      const time2 = Number(end2 - start2);

      expect(time2).toBeLessThan(time1 * 0.5);
      expect(result1).toEqual(result2);
    });
  });

  describe('Batch Processing Performance', () => {
    it('should handle large numbers of files efficiently', async () => {
      await createTestProject(tempDir, 1000); // 1000 files

      const configPath = path.join(tempDir, 'tsconfig.json');
      const config = parseConfig(configPath);
      const resolverState = createPathResolver(config);

      const files = await getAllFiles(path.join(tempDir, 'src'));

      const start = Date.now();
      const result = await processBatch(files, resolverState, {
        concurrency: 4,
        batchSize: 50,
        verbose: false,
      });
      const end = Date.now();

      const processingTime = end - start;
      const filesPerSecond = files.length / (processingTime / 1000);

      expect(result.results).toHaveLength(files.length);
      expect(filesPerSecond).toBeGreaterThan(10); // Should process at least 10 files per second
      expect(result.stats.totalFiles).toBe(files.length);
    });

    it('should manage memory usage effectively', async () => {
      await createTestProject(tempDir, 100, 50000); // 100 files, 50KB each

      const configPath = path.join(tempDir, 'tsconfig.json');
      const files = await getAllFiles(path.join(tempDir, 'src'));

      const initialMemory = process.memoryUsage().heapUsed;

      await convertImports(path.join(tempDir, 'src'), {
        configPath,
        concurrency: 2,
        batchSize: 10,
        maxMemoryUsage: 100 * 1024 * 1024,
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with project size', async () => {
      const projectSizes = [10, 50, 100];
      const processingTimes: number[] = [];

      for (const size of projectSizes) {
        const testDir = path.join(tempDir, `project-${size}`);
        await fs.mkdir(testDir, { recursive: true });
        await createTestProject(testDir, size);

        const start = Date.now();
        await convertImports(path.join(testDir, 'src'), {
          configPath: path.join(testDir, 'tsconfig.json'),
          concurrency: 2,
        });
        const end = Date.now();

        processingTimes.push(end - start);
      }

      const scalingFactor = processingTimes[2] / processingTimes[0]; 
      expect(scalingFactor).toBeLessThan(15); 
    });

    it('should handle concurrent processing without race conditions', async () => {
      await createTestProject(tempDir, 50);
      const configPath = path.join(tempDir, 'tsconfig.json');

      const promises = Array.from({ length: 5 }, () =>
        convertImports(path.join(tempDir, 'src'), {
          configPath,
          concurrency: 2,
          dryRun: true, 
        })
      );

      const results = await Promise.all(promises);

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory during repeated operations', async () => {
      await createTestProject(tempDir, 20);
      const configPath = path.join(tempDir, 'tsconfig.json');

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10; i++) {
        await convertImports(path.join(tempDir, 'src'), {
          configPath,
          dryRun: true,
        });

        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});

/**
 * Create a test project with specified number of files
 */
async function createTestProject(
  projectDir: string,
  fileCount: number,
  fileSize: number = 1000
): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      baseUrl: '.',
      paths: {
        '~/*': ['./src/*'],
        '@/*': ['./lib/*'],
        '@components/*': ['./src/components/*'],
      },
    },
  };

  await fs.writeFile(path.join(projectDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

  await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'src/components'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'lib'), { recursive: true });

  for (let i = 0; i < fileCount; i++) {
    const fileName = `file${i}.ts`;
    const filePath = path.join(projectDir, 'src', fileName);

    const imports = [
      "import { utils } from '../lib/utils';",
      "import { Component } from './components/Component';",
      "import { helper } from '../lib/helper';",
    ];

    const padding = 'x'.repeat(Math.max(0, fileSize - imports.join('\n').length));
    const content = imports.join('\n') + '\n' + `// ${padding}`;

    await fs.writeFile(filePath, content);
  }

  await fs.writeFile(path.join(projectDir, 'lib/utils.ts'), 'export const utils = {};');
  await fs.writeFile(path.join(projectDir, 'lib/helper.ts'), 'export const helper = {};');
  await fs.writeFile(
    path.join(projectDir, 'src/components/Component.ts'),
    'export const Component = {};'
  );
}

/**
 * Get all files in a directory recursively
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}
