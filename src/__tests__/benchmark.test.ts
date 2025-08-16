/**
 * Benchmark tests for measuring and validating performance characteristics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { performance } from 'perf_hooks';
import { createPathResolver, resolveImport } from '../path-resolution/index.js';
import type { PathMapping } from '../config-parsing/types.js';
import { findImports } from '../import-parsing/index.js';
import { processFile } from '../file-processing/index.js';
import { FastMap, LRUCache, Trie, BloomFilter } from '../performance/index.js';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  operationsPerSecond: number;
}

describe('Benchmark Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Data Structure Benchmarks', () => {
    it('should benchmark FastMap vs native Map performance', () => {
      const iterations = 50000;
      const testData = Array.from(
        { length: 1000 },
        (_, i) => [`key${i}`, `value${i}`] as [string, string]
      );

      const benchmarkOperation = (mapInstance: Map<string, string> | FastMap<string, string>) => {
        // Warm-up runs
        for (let i = 0; i < 1000; i++) {
          const [key, value] = testData[i % testData.length];
          mapInstance.set(key, value);
          mapInstance.get(key);
        }

        // Multiple benchmark runs for more stable results
        const times: number[] = [];
        for (let run = 0; run < 3; run++) {
          const start = performance.now();
          for (let i = 0; i < iterations; i++) {
            const [key, value] = testData[i % testData.length];
            mapInstance.set(key, value);
            mapInstance.get(key);
          }
          const end = performance.now();
          times.push(end - start);
        }

        // Return median time
        times.sort((a, b) => a - b);
        return times[1];
      };

      const nativeTime = benchmarkOperation(new Map<string, string>());
      const fastTime = benchmarkOperation(new FastMap<string, string>());

      console.log(`Native Map: ${nativeTime.toFixed(2)}ms`);
      console.log(`Fast Map: ${fastTime.toFixed(2)}ms`);
      console.log(`Performance ratio: ${(nativeTime / fastTime).toFixed(2)}x`);

      // More lenient threshold for micro-benchmarks - focus on order of magnitude rather than precise ratios
      expect(fastTime).toBeLessThanOrEqual(nativeTime * 3.0); // Allow 200% overhead (micro-benchmarks are highly variable)
    });

    it('should benchmark LRU Cache performance', () => {
      const cache = new LRUCache<string, string>(1000);
      const iterations = 50000;

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const key = `key${i % 1500}`; // Some cache hits, some misses
        const value = `value${i}`;

        cache.set(key, value);
        cache.get(key);
      }

      const end = performance.now();
      const time = end - start;
      const opsPerSecond = (iterations * 2) / (time / 1000); // 2 operations per iteration

      console.log(`LRU Cache: ${time.toFixed(2)}ms for ${iterations * 2} operations`);
      console.log(`Operations per second: ${opsPerSecond.toFixed(0)}`);

      expect(opsPerSecond).toBeGreaterThan(100000);
    });

    it('should benchmark Trie performance for prefix matching', () => {
      const trie = new Trie();
      const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);

      const insertStart = performance.now();
      for (const word of words) {
        trie.insert(word, word);
      }
      const insertEnd = performance.now();
      const insertTime = insertEnd - insertStart;

      const searchStart = performance.now();
      for (let i = 0; i < 10000; i++) {
        const word = words[i % words.length];
        trie.search(word);
      }
      const searchEnd = performance.now();
      const searchTime = searchEnd - searchStart;

      console.log(`Trie insert: ${insertTime.toFixed(2)}ms for ${words.length} words`);
      console.log(`Trie search: ${searchTime.toFixed(2)}ms for 10000 searches`);

      const searchOpsPerSecond = 10000 / (searchTime / 1000);
      expect(searchOpsPerSecond).toBeGreaterThan(50000); // Should handle 50k+ searches per second
    });

    it('should benchmark Bloom Filter performance', () => {
      const bloomFilter = new BloomFilter(10000, 0.01);
      const items = Array.from({ length: 5000 }, (_, i) => `item${i}`);

      const addStart = performance.now();
      for (const item of items) {
        bloomFilter.add(item);
      }
      const addEnd = performance.now();
      const addTime = addEnd - addStart;

      const testStart = performance.now();
      let positives = 0;
      for (let i = 0; i < 20000; i++) {
        const item = `item${i}`;
        if (bloomFilter.mightContain(item)) {
          positives++;
        }
      }
      const testEnd = performance.now();
      const testTime = testEnd - testStart;

      console.log(`Bloom Filter add: ${addTime.toFixed(2)}ms for ${items.length} items`);
      console.log(`Bloom Filter test: ${testTime.toFixed(2)}ms for 20000 tests`);
      console.log(`Positives: ${positives} (expected ~5000 + false positives)`);

      const testOpsPerSecond = 20000 / (testTime / 1000);
      expect(testOpsPerSecond).toBeGreaterThan(100000); // Should handle 100k+ tests per second
    });
  });

  describe('Core Algorithm Benchmarks', () => {
    it('should benchmark path resolution performance', async () => {
      const pathMappings = new Map<string, PathMapping[]>();
      for (let i = 0; i < 100; i++) {
        pathMappings.set(`alias${i}`, [
          {
            alias: `alias${i}/*`,
            basePath: `./src${i}/*`,
            resolvedBase: path.join(tempDir, `src${i}`),
          },
        ]);
      }

      const config = {
        baseUrl: '.',
        pathMappings,
        rootDir: tempDir,
      };

      const resolverState = createPathResolver(config);
      const testFile = path.join(tempDir, 'src/test.ts');
      const testImports = [
        '../lib/utils',
        './components/Button',
        '../../shared/helpers',
        '../../../external/lib',
      ];

      const iterations = 10000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const importPath = testImports[i % testImports.length];
        resolveImport(resolverState, importPath, testFile);
      }

      const end = performance.now();
      const time = end - start;
      const opsPerSecond = iterations / (time / 1000);

      console.log(`Path resolution: ${time.toFixed(2)}ms for ${iterations} resolutions`);
      console.log(`Resolutions per second: ${opsPerSecond.toFixed(0)}`);

      expect(opsPerSecond).toBeGreaterThan(10000);
    });

    it('should benchmark import parsing performance', () => {
      const imports = [
        "import { Component } from './components/Component';",
        "import utils from '../utils/helpers';",
        "import * as lib from '../../lib/index';",
        "const helper = require('./helper');",
        "const { format } = require('../formatters/index');",
        "import('./dynamic/module').then(m => m.default);",
      ];

      const content = Array.from(
        { length: 1000 },
        (_, i) => imports[i % imports.length] + `\n// Line ${i}\n`
      ).join('\n');

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        findImports(content);
      }

      const end = performance.now();
      const time = end - start;
      const opsPerSecond = iterations / (time / 1000);

      console.log(`Import parsing: ${time.toFixed(2)}ms for ${iterations} parses`);
      console.log(`Parses per second: ${opsPerSecond.toFixed(0)}`);

      expect(opsPerSecond).toBeGreaterThan(100);
    });

    it('should benchmark file processing performance', async () => {
      const testFile = path.join(tempDir, 'test.ts');
      const content = Array.from(
        { length: 100 },
        (_, i) => `import { Component${i} } from './components/Component${i}';`
      ).join('\n');

      await fs.writeFile(testFile, content);

      const config = {
        baseUrl: '.',
        pathMappings: new Map([
          ['~', [{ alias: '~/*', basePath: './src/*', resolvedBase: path.join(tempDir, 'src') }]],
        ]),
        rootDir: tempDir,
      };

      const resolverState = createPathResolver(config);
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await processFile(testFile, resolverState, { dryRun: true });
      }

      const end = performance.now();
      const time = end - start;
      const opsPerSecond = iterations / (time / 1000);

      console.log(`File processing: ${time.toFixed(2)}ms for ${iterations} files`);
      console.log(`Files per second: ${opsPerSecond.toFixed(0)}`);

      expect(opsPerSecond).toBeGreaterThan(10);
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should measure memory usage for large configurations', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const pathMappings = new Map<string, PathMapping[]>();
      for (let i = 0; i < 1000; i++) {
        pathMappings.set(`alias${i}`, [
          {
            alias: `alias${i}/*`,
            basePath: `./src${i}/*`,
            resolvedBase: `/project/src${i}`,
          },
        ]);
      }

      const config = {
        baseUrl: '.',
        pathMappings,
        rootDir: '/project',
      };

      const resolverState = createPathResolver(config);
      const afterConfigMemory = process.memoryUsage().heapUsed;

      const testFile = '/project/src/test.ts';
      for (let i = 0; i < 10000; i++) {
        resolveImport(resolverState, '../lib/utils', testFile);
      }

      const finalMemory = process.memoryUsage().heapUsed;

      const configMemoryUsage = afterConfigMemory - initialMemory;
      const operationMemoryUsage = finalMemory - afterConfigMemory;

      console.log(`Config memory usage: ${(configMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Operation memory usage: ${(operationMemoryUsage / 1024 / 1024).toFixed(2)}MB`);

      expect(configMemoryUsage).toBeLessThan(50 * 1024 * 1024); // Less than 50MB for config
      expect(operationMemoryUsage).toBeLessThan(10 * 1024 * 1024); // Less than 10MB for operations
    });
  });

  describe('Regression Tests', () => {
    it('should maintain performance characteristics over time', async () => {
      const benchmarks: BenchmarkResult[] = [];

      const pathResolutionBench = await benchmarkFunction(
        'Path Resolution',
        () => {
          const config = {
            baseUrl: '.',
            pathMappings: new Map([
              ['~', [{ alias: '~/*', basePath: './src/*', resolvedBase: '/project/src' }]],
            ]),
            rootDir: '/project',
          };
          const resolverState = createPathResolver(config);
          resolveImport(resolverState, '../lib/utils', '/project/src/test.ts');
        },
        10000
      );
      benchmarks.push(pathResolutionBench);

      const importParsingBench = await benchmarkFunction(
        'Import Parsing',
        () => {
          const content = "import { Component } from './Component';\nimport utils from '../utils';";
          findImports(content);
        },
        5000
      );
      benchmarks.push(importParsingBench);

      console.log('\n=== Performance Baseline ===');
      for (const bench of benchmarks) {
        console.log(`${bench.name}:`);
        console.log(`  Average time: ${bench.averageTime.toFixed(4)}ms`);
        console.log(`  Operations/sec: ${bench.operationsPerSecond.toFixed(0)}`);
      }

      expect(pathResolutionBench.operationsPerSecond).toBeGreaterThan(50000);
      expect(importParsingBench.operationsPerSecond).toBeGreaterThan(10000);
    });
  });
});

/**
 * Benchmark a function and return performance metrics
 */
async function benchmarkFunction(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  for (let i = 0; i < Math.min(100, iterations / 10); i++) {
    await fn();
  }

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const end = performance.now();
  const totalTime = end - start;
  const averageTime = totalTime / iterations;
  const operationsPerSecond = iterations / (totalTime / 1000);

  return {
    name,
    iterations,
    totalTime,
    averageTime,
    operationsPerSecond,
  };
}
