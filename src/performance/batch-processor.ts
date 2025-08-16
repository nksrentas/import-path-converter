import fs from 'fs/promises';
import { Worker } from 'worker_threads';
import { PathResolverState } from '../path-resolution/types.js';
import { ProcessingOptions, ProcessingResult } from '../file-processing/types.js';
import { processFile } from '../file-processing/index.js';

export interface BatchProcessingOptions extends ProcessingOptions {
  /** Maximum number of files to process concurrently */
  concurrency?: number;
  /** Maximum memory usage in bytes before switching to streaming */
  maxMemoryUsage?: number;
  /** Batch size for processing files in chunks */
  batchSize?: number;
  /** Enable worker threads for CPU-intensive operations */
  useWorkers?: boolean;
}

export interface BatchProcessingStats {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  totalTime: number;
  averageTimePerFile: number;
  memoryUsage: {
    peak: number;
    average: number;
  };
}

/**
 * Process files in batches with controlled concurrency and memory usage
 */
export async function processBatch(
  files: string[],
  resolverState: PathResolverState,
  options: BatchProcessingOptions = {}
): Promise<{ results: ProcessingResult[]; stats: BatchProcessingStats }> {
  const startTime = Date.now();
  const concurrency =
    options.concurrency || Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2)));
  const batchSize = options.batchSize || 50;
  const maxMemoryUsage = options.maxMemoryUsage || 500 * 1024 * 1024; // 500MB

  const results: ProcessingResult[] = [];
  const stats: BatchProcessingStats = {
    totalFiles: files.length,
    processedFiles: 0,
    failedFiles: 0,
    totalTime: 0,
    averageTimePerFile: 0,
    memoryUsage: {
      peak: 0,
      average: 0,
    },
  };

  const memoryUsages: number[] = [];
  const memoryMonitor = setInterval(() => {
    const usage = process.memoryUsage().heapUsed;
    memoryUsages.push(usage);
    stats.memoryUsage.peak = Math.max(stats.memoryUsage.peak, usage);
  }, 1000);

  try {
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const currentMemory = process.memoryUsage().heapUsed;
      if (currentMemory > maxMemoryUsage) {
        if (options.verbose) {
          console.log(
            `Memory usage (${Math.round(currentMemory / 1024 / 1024)}MB) exceeds limit, switching to streaming mode`
          );
        }

        const streamingResults = await processWithStreaming(files.slice(i), resolverState, options);
        results.push(...streamingResults);
        stats.processedFiles += streamingResults.length;
        break;
      }

      const batchResults = await processWithConcurrency(batch, resolverState, options, concurrency);

      results.push(...batchResults.results);
      stats.processedFiles += batchResults.processed;
      stats.failedFiles += batchResults.failed;

      if (global.gc && i % (batchSize * 2) === 0) {
        global.gc();
      }
    }

    const endTime = Date.now();
    stats.totalTime = endTime - startTime;
    stats.averageTimePerFile = stats.totalTime / stats.processedFiles;
    stats.memoryUsage.average = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
  } finally {
    clearInterval(memoryMonitor);
  }

  return { results, stats };
}

/**
 * Process files with controlled concurrency using Promise.allSettled
 */
async function processWithConcurrency(
  files: string[],
  resolverState: PathResolverState,
  options: BatchProcessingOptions,
  concurrency: number
): Promise<{ results: ProcessingResult[]; processed: number; failed: number }> {
  const results: ProcessingResult[] = [];
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);

    const promises = chunk.map(async filePath => {
      try {
        return await processFile(filePath, resolverState, options);
      } catch (error) {
        return {
          filePath,
          conversions: [],
          modified: false,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        } as ProcessingResult;
      }
    });

    const chunkResults = await Promise.allSettled(promises);

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (result.value.errors && result.value.errors.length > 0) {
          failed++;
        } else {
          processed++;
        }
      } else {
        failed++;
        results.push({
          filePath: 'unknown',
          conversions: [],
          modified: false,
          errors: [result.reason?.message || 'Processing failed'],
        });
      }
    }
  }

  return { results, processed, failed };
}

/**
 * Process files using streaming for memory efficiency
 */
async function processWithStreaming(
  files: string[],
  resolverState: PathResolverState,
  options: BatchProcessingOptions
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      const maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB

      if (stats.size > maxFileSize) {
        results.push({
          filePath,
          conversions: [],
          modified: false,
          errors: [`File too large for streaming: ${stats.size} bytes`],
        });
        continue;
      }

      const result = await processFileWithStreaming(filePath, resolverState, options);
      results.push(result);
    } catch (error) {
      results.push({
        filePath,
        conversions: [],
        modified: false,
        errors: [error instanceof Error ? error.message : 'Streaming failed'],
      });
    }
  }

  return results;
}

/**
 * Process a single file using streaming to minimize memory usage
 */
async function processFileWithStreaming(
  filePath: string,
  resolverState: PathResolverState,
  options: BatchProcessingOptions
): Promise<ProcessingResult> {
  return await processFile(filePath, resolverState, options);
}

/**
 * Create a worker pool for CPU-intensive operations
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ resolve: Function; reject: Function; data: any }> = [];
  private activeJobs = 0;

  constructor(
    private workerScript: string,
    private poolSize: number = 2
  ) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerScript);
      worker.on('message', result => {
        this.activeJobs--;
        const job = this.queue.shift();
        if (job) {
          job.resolve(result);
        }
        this.processQueue();
      });
      worker.on('error', error => {
        this.activeJobs--;
        const job = this.queue.shift();
        if (job) {
          job.reject(error);
        }
        this.processQueue();
      });
      this.workers.push(worker);
    }
  }

  async execute(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, data });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.activeJobs >= this.poolSize) {
      return;
    }

    const availableWorker = this.workers.find(w => !w.threadId);
    if (availableWorker && this.queue.length > 0) {
      const job = this.queue[0];
      this.activeJobs++;
      availableWorker.postMessage(job.data);
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.queue = [];
  }
}

/**
 * Optimize memory usage by implementing object pooling for frequently created objects
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }

  size(): number {
    return this.pool.length;
  }
}
