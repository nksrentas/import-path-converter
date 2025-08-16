import fs from 'fs/promises';
import * as fsSync from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export interface MemoryManagerOptions {
  /** Maximum memory usage in bytes before triggering cleanup */
  maxMemoryUsage: number;
  /** Interval in milliseconds to check memory usage */
  checkInterval: number;
  /** Enable automatic garbage collection */
  enableGC: boolean;
  /** Chunk size for streaming operations */
  chunkSize: number;
}

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Memory manager for monitoring and controlling memory usage
 */
export class MemoryManager {
  private options: MemoryManagerOptions;
  private monitorInterval?: NodeJS.Timeout;
  private memoryHistory: MemoryStats[] = [];
  private callbacks: Array<(stats: MemoryStats) => void> = [];

  constructor(options: Partial<MemoryManagerOptions> = {}) {
    this.options = {
      maxMemoryUsage: 500 * 1024 * 1024, // 500MB
      checkInterval: 5000, // 5 seconds
      enableGC: true,
      chunkSize: 64 * 1024, // 64KB
      ...options,
    };
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(): void {
    if (this.monitorInterval) {
      return;
    }

    this.monitorInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      this.memoryHistory.push(stats);

      if (this.memoryHistory.length > 100) {
        this.memoryHistory.shift();
      }

      if (stats.heapUsed > this.options.maxMemoryUsage) {
        this.handleMemoryPressure(stats);
      }
      this.callbacks.forEach(callback => callback(stats));
    }, this.options.checkInterval);
  }

  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  /**
   * Get memory usage history
   */
  getMemoryHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  /**
   * Register callback for memory updates
   */
  onMemoryUpdate(callback: (stats: MemoryStats) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Check if memory usage is high
   */
  isMemoryHigh(): boolean {
    const stats = this.getMemoryStats();
    return stats.heapUsed > this.options.maxMemoryUsage * 0.8;
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): void {
    if (this.options.enableGC && global.gc) {
      global.gc();
    }
  }

  /**
   * Handle memory pressure by triggering cleanup
   */
  private handleMemoryPressure(stats: MemoryStats): void {
    console.warn(`Memory usage high: ${Math.round(stats.heapUsed / 1024 / 1024)}MB`);

    if (this.options.enableGC) {
      this.forceGC();
    }

    process.nextTick(() => {
      console.warn('Memory pressure detected');
    });
  }

  /**
   * Create a memory-efficient file reader stream
   */
  createFileStream(): Readable {
    return new Readable({
      highWaterMark: this.options.chunkSize,
      async read() {},
    });
  }

  /**
   * Process large file with streaming to minimize memory usage
   */
  async processLargeFile(
    filePath: string,
    processor: (chunk: string) => Promise<string>
  ): Promise<void> {
    const stats = await fs.stat(filePath);

    if (stats.size < this.options.chunkSize * 10) {
      const content = await fs.readFile(filePath, 'utf-8');
      const processed = await processor(content);
      await fs.writeFile(filePath, processed);
      return;
    }

    // Initialize chunks array for future streaming implementation
    const readStream = fsSync.createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: this.options.chunkSize,
    });

    await pipeline(
      readStream,
      async function* (source) {
        for await (const chunk of source) {
          const processed = await processor(chunk);
          yield processed;
        }
      },
      fsSync.createWriteStream(filePath + '.tmp')
    );

    await fs.rename(filePath + '.tmp', filePath);
  }
}

/**
 * Cache implementation with memory-aware eviction
 */
export class MemoryAwareCache<K, V> {
  private cache = new Map<K, { value: V; lastAccessed: number; size: number }>();
  private maxSize: number;
  private currentSize = 0;

  constructor(maxSize: number = 100 * 1024 * 1024) {
    this.maxSize = maxSize;
  }

  set(key: K, value: V, size?: number): void {
    const estimatedSize = size || this.estimateSize(value);

    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentSize -= existing.size;
    }
    while (this.currentSize + estimatedSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
      size: estimatedSize,
    });
    this.currentSize += estimatedSize;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  size(): number {
    return this.cache.size;
  }

  memoryUsage(): number {
    return this.currentSize;
  }

  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.delete(oldestKey);
    }
  }

  private estimateSize(value: V): number {
    if (typeof value === 'string') {
      return value.length * 2;
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2;
    }
    return 64;
  }
}

/**
 * Buffer pool for reusing buffers and reducing GC pressure
 */
export class BufferPool {
  private pools = new Map<number, Buffer[]>();
  private maxPoolSize = 10;

  getBuffer(size: number): Buffer {
    const pool = this.pools.get(size);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }
    return Buffer.allocUnsafe(size);
  }

  releaseBuffer(buffer: Buffer): void {
    const size = buffer.length;
    let pool = this.pools.get(size);

    if (!pool) {
      pool = [];
      this.pools.set(size, pool);
    }

    if (pool.length < this.maxPoolSize) {
      buffer.fill(0);
      pool.push(buffer);
    }
  }

  clear(): void {
    this.pools.clear();
  }

  getStats(): { totalPools: number; totalBuffers: number } {
    let totalBuffers = 0;
    for (const pool of this.pools.values()) {
      totalBuffers += pool.length;
    }
    return {
      totalPools: this.pools.size,
      totalBuffers,
    };
  }
}
