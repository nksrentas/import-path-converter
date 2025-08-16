/**
 * Core types for file processing functionality
 */

import { ConversionResult } from '../path-resolution/types.js';

/**
 * Options for controlling file processing behavior
 */
export interface ProcessingOptions {
  /** If true, don't actually modify files, just report what would be changed */
  dryRun?: boolean;
  /** If true, provide detailed output about processing */
  verbose?: boolean;
  /** File extensions to process (defaults to .ts, .tsx, .js, .jsx) */
  extensions?: string[];
  /** Maximum file size to process in bytes */
  maxFileSize?: number;
  /** Path to tsconfig.json file (auto-detected if not provided) */
  configPath?: string;
  /** Path to ignore file for excluding files from processing */
  ignoreFile?: string;
  /** Maximum number of files to process concurrently */
  concurrency?: number;
  /** Maximum memory usage in bytes before switching to streaming */
  maxMemoryUsage?: number;
  /** Batch size for processing files in chunks */
  batchSize?: number;
  /** Enable worker threads for CPU-intensive operations */
  useWorkers?: boolean;
}

/**
 * Result of processing a single file
 */
export interface ProcessingResult {
  /** Path to the processed file */
  filePath: string;
  /** List of import conversions performed */
  conversions: ConversionResult[];
  /** Whether the file was actually modified */
  modified: boolean;
  /** Any errors encountered during processing */
  errors?: string[];
}

/**
 * Summary of batch processing results
 */
export interface BatchProcessingResult {
  /** Total number of files processed */
  filesProcessed: number;
  /** Number of files that were modified */
  filesModified: number;
  /** Total number of imports converted */
  importsConverted: number;
  /** List of individual file results */
  results: ProcessingResult[];
  /** Any global errors encountered */
  errors?: string[];
}
