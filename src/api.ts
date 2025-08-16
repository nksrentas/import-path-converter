import fs from 'fs/promises';
import path from 'path';
import {
  ProcessingOptions,
  ProcessingResult,
  BatchProcessingResult,
} from './file-processing/types.js';
import { parseConfig } from './config-parsing/index.js';
import { createPathResolver } from './path-resolution/index.js';
import { processFile, shouldProcessFile, getProcessingStats } from './file-processing/index.js';
import { createIgnoreState, shouldIgnore } from './ignore-handling/index.js';
import { processBatch, BatchProcessingOptions } from './performance/index.js';

/**
 * Main API function for converting imports in files or directories
 *
 * Converts relative imports (using `../` or `./` syntax) to path alias imports
 * based on TypeScript configuration paths. Reads tsconfig.json files, understands
 * the path mappings, and efficiently transforms import statements.
 *
 * @example
 * ```typescript
 * import { convertImports } from 'import-path-converter';
 *
 * // Convert imports in a single file
 * const results = await convertImports('./src/components/Button.tsx');
 *
 * // Convert imports in entire directory
 * const results = await convertImports('./src', {
 *   dryRun: true,
 *   verbose: true,
 *   extensions: ['.ts', '.tsx']
 * });
 *
 * // Use custom tsconfig and ignore file with performance optimizations
 * const results = await convertImports('./src', {
 *   configPath: './tsconfig.build.json',
 *   ignoreFile: './.importignore',
 *   dryRun: false,
 *   concurrency: 4,
 *   batchSize: 100
 * });
 * ```
 *
 * @param targetPath Path to file or directory to process
 * @param options Processing options to control behavior
 * @returns Promise resolving to array of processing results for each file
 * @throws Error if tsconfig.json cannot be found or parsed
 */
export async function convertImports(
  targetPath: string,
  options: ProcessingOptions & BatchProcessingOptions = {}
): Promise<ProcessingResult[]> {
  try {
    const configPath = options.configPath || (await findTsConfig(targetPath));
    const config = parseConfig(configPath);
    const resolverState = createPathResolver(config);
    const ignoreState = createIgnoreState(options.ignoreFile);
    const files = await getFilesToProcess(targetPath, options);

    if (options.verbose) {
      console.log(`Found ${files.length} files in directory`);
      files.forEach(file => console.log(`  - ${file}`));
    }

    const filesToProcess = files.filter(file => !shouldIgnore(ignoreState, file).shouldIgnore);

    if (options.verbose) {
      console.log(`Processing ${filesToProcess.length} files after filtering...`);
    }

    if (filesToProcess.length > 10 && (options.concurrency || options.batchSize)) {
      const batchResult = await processBatch(filesToProcess, resolverState, options);
      return batchResult.results;
    }

    const results: ProcessingResult[] = [];
    for (const filePath of filesToProcess) {
      if (shouldProcessFile(filePath, options.extensions || ['.ts', '.tsx', '.js', '.jsx'])) {
        const result = await processFile(filePath, resolverState, options);
        results.push(result);
      }
    }

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return [
      {
        filePath: targetPath,
        conversions: [],
        modified: false,
        errors: [errorMessage],
      },
    ];
  }
}

/**
 * Batch convert imports with summary statistics
 *
 * Similar to `convertImports` but returns additional summary statistics
 * about the conversion process, including total files processed, files modified,
 * and total imports converted.
 *
 * @example
 * ```typescript
 * import { convertImportsBatch } from 'import-path-converter';
 *
 * const result = await convertImportsBatch('./src', {
 *   dryRun: true,
 *   verbose: true
 * });
 *
 * console.log(`Processed ${result.filesProcessed} files`);
 * console.log(`Modified ${result.filesModified} files`);
 * console.log(`Converted ${result.importsConverted} imports`);
 *
 * // Check for errors
 * if (result.errors.length > 0) {
 *   console.error('Errors encountered:', result.errors);
 * }
 * ```
 *
 * @param targetPath Path to file or directory to process
 * @param options Processing options to control behavior
 * @returns Promise resolving to batch processing result with statistics
 */
export async function convertImportsBatch(
  targetPath: string,
  options: ProcessingOptions = {}
): Promise<BatchProcessingResult> {
  const results = await convertImports(targetPath, options);
  const stats = getProcessingStats(results);

  return {
    filesProcessed: stats.totalFiles,
    filesModified: stats.modifiedFiles,
    importsConverted: stats.successfulConversions,
    results,
    errors: results.flatMap(r => r.errors || []),
  };
}

/**
 * Find tsconfig.json file starting from a given path
 * @param startPath Path to start searching from
 * @returns Path to tsconfig.json file
 */
async function findTsConfig(startPath: string): Promise<string> {
  let currentDir = path.isAbsolute(startPath) ? startPath : path.resolve(startPath);

  try {
    const stat = await fs.stat(currentDir);
    if (stat.isFile()) {
      currentDir = path.dirname(currentDir);
    }
  } catch {}

  while (currentDir !== path.dirname(currentDir)) {
    const configPath = path.join(currentDir, 'tsconfig.json');
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      currentDir = path.dirname(currentDir);
    }
  }

  throw new Error('No tsconfig.json found');
}

/**
 * Get list of files to process from target path
 * @param targetPath Path to file or directory
 * @param options Processing options
 * @returns Array of file paths to process
 */
async function getFilesToProcess(
  targetPath: string,
  options: ProcessingOptions
): Promise<string[]> {
  const stat = await fs.stat(targetPath);

  if (stat.isFile()) {
    return [targetPath];
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    const extensions = options.extensions || ['.ts', '.tsx', '.js', '.jsx'];
    await walkDirectory(targetPath, files, extensions, options.verbose);
    return files;
  }

  throw new Error(`Invalid target path: ${targetPath}`);
}

/**
 * Recursively walk directory to find files with specified extensions
 * @param dir Directory to walk
 * @param files Array to collect file paths
 * @param extensions File extensions to include
 * @param verbose Whether to show verbose output
 */
async function walkDirectory(
  dir: string,
  files: string[],
  extensions: string[],
  verbose = false
): Promise<void> {
  try {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await walkDirectory(fullPath, files, extensions, verbose);
      } else if (stat.isFile()) {
        const ext = path.extname(entry);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    if (verbose) {
      console.warn(`Warning: Could not read directory ${dir}: ${error}`);
    }
  }
}
