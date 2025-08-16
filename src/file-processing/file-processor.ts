/**
 * File processing functionality for transforming import statements
 */

import fs from 'fs/promises';
import path from 'path';
import { PathResolverState, ConversionResult } from '../path-resolution/types.js';
import { resolveImport } from '../path-resolution/index.js';
import { findImports, ImportMatch } from '../import-parsing/index.js';
import { ProcessingOptions, ProcessingResult } from './types.js';

/**
 * Default processing options
 */
const DEFAULT_OPTIONS: Required<ProcessingOptions> = {
  dryRun: false,
  verbose: false,
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  configPath: '',
  ignoreFile: '',
  concurrency: 1,
  maxMemoryUsage: 500 * 1024 * 1024, // 500MB
  batchSize: 50,
  useWorkers: false,
};

/**
 * Process a single file to convert relative imports to path aliases
 * @param filePath Path to the file to process
 * @param resolverState Path resolver state with lookup structures
 * @param options Processing options
 * @returns Processing result with conversions performed
 */
export async function processFile(
  filePath: string,
  resolverState: PathResolverState,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: ProcessingResult = {
    filePath,
    conversions: [],
    modified: false,
    errors: [],
  };

  try {
    const ext = path.extname(filePath);
    if (!opts.extensions.includes(ext)) {
      result.errors?.push(`Unsupported file extension: ${ext}`);
      return result;
    }

    const stats = await fs.stat(filePath);
    if (stats.size > opts.maxFileSize) {
      result.errors?.push(`File too large: ${stats.size} bytes (max: ${opts.maxFileSize})`);
      return result;
    }

    const content = await fs.readFile(filePath, 'utf-8');

    if (opts.verbose) {
      console.log(`Processing file: ${filePath}`);
    }

    const imports = findImports(content);

    if (imports.length === 0) {
      if (opts.verbose) {
        console.log(`No relative imports found in: ${filePath}`);
      }
      return result;
    }

    const conversions: ConversionResult[] = [];

    for (const importMatch of imports) {
      const conversion = resolveImport(resolverState, importMatch.importPath, filePath);

      conversions.push(conversion);

      if (opts.verbose && conversion.convertedImport) {
        console.log(`  ${conversion.originalImport} -> ${conversion.convertedImport}`);
      }
    }

    const successfulConversions = conversions.filter(c => c.convertedImport !== null);

    if (successfulConversions.length === 0) {
      if (opts.verbose) {
        console.log(`No conversions possible for: ${filePath}`);
      }
      result.conversions = conversions;
      return result;
    }

    const modifiedContent = replaceImports(content, imports, successfulConversions);

    if (!opts.dryRun && modifiedContent !== content) {
      await fs.writeFile(filePath, modifiedContent, 'utf-8');
      result.modified = true;
    } else if (modifiedContent !== content) {
      result.modified = true;
    }

    result.conversions = conversions;

    if (opts.verbose) {
      console.log(`Processed ${filePath}: ${successfulConversions.length} conversions`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors?.push(`Error processing file: ${errorMessage}`);

    if (opts.verbose) {
      console.error(`Error processing ${filePath}:`, error);
    }
  }

  return result;
}

/**
 * Replace imports in content with converted versions
 * Performs replacements in reverse order to maintain correct indices
 * Handles multiple import replacements in single file pass while preserving formatting
 * @param content Original file content
 * @param imports Array of import matches found in the content
 * @param conversions Array of successful conversions
 * @returns Modified content with imports replaced
 */
export function replaceImports(
  content: string,
  imports: ImportMatch[],
  conversions: ConversionResult[]
): string {
  const conversionMap = new Map<string, string>();
  for (const conversion of conversions) {
    if (conversion.convertedImport) {
      conversionMap.set(conversion.originalImport, conversion.convertedImport);
    }
  }

  if (conversionMap.size === 0) {
    return content;
  }

  const sortedImports = [...imports].sort((a, b) => b.startIndex - a.startIndex);

  let modifiedContent = content;

  for (const importMatch of sortedImports) {
    const convertedImport = conversionMap.get(importMatch.importPath);

    if (convertedImport) {
      const importPath = importMatch.importPath;
      const fullMatch = importMatch.fullMatch;

      const newFullMatch = replaceImportPathInStatement(fullMatch, importPath, convertedImport);

      modifiedContent =
        modifiedContent.slice(0, importMatch.startIndex) +
        newFullMatch +
        modifiedContent.slice(importMatch.endIndex);
    }
  }

  return modifiedContent;
}

/**
 * Check if a file should be processed based on its extension
 * @param filePath Path to the file
 * @param extensions Allowed extensions
 * @returns True if file should be processed
 */
export function shouldProcessFile(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath);
  return extensions.includes(ext);
}

/**
 * Get processing statistics from results
 * @param results Array of processing results
 * @returns Summary statistics
 */
export function getProcessingStats(results: ProcessingResult[]) {
  const stats = {
    totalFiles: results.length,
    modifiedFiles: 0,
    totalConversions: 0,
    successfulConversions: 0,
    errors: 0,
  };

  for (const result of results) {
    if (result.modified) {
      stats.modifiedFiles++;
    }

    stats.totalConversions += result.conversions.length;
    stats.successfulConversions += result.conversions.filter(
      c => c.convertedImport !== null
    ).length;

    if (result.errors && result.errors.length > 0) {
      stats.errors++;
    }
  }

  return stats;
} /**
 * R
eplace import path within an import statement while preserving quote style and formatting
 * @param fullMatch The complete import statement
 * @param originalPath The original import path to replace
 * @param newPath The new import path
 * @returns The import statement with the path replaced
 */
function replaceImportPathInStatement(
  fullMatch: string,
  originalPath: string,
  newPath: string
): string {
  let quoteChar = '"';

  if (fullMatch.includes(`'${originalPath}'`)) {
    quoteChar = "'";
  } else if (fullMatch.includes(`"${originalPath}"`)) {
    quoteChar = '"';
  } else if (fullMatch.includes(`\`${originalPath}\``)) {
    quoteChar = '`';
  }

  const quotedOriginal = `${quoteChar}${originalPath}${quoteChar}`;
  const quotedNew = `${quoteChar}${newPath}${quoteChar}`;

  return fullMatch.replace(quotedOriginal, quotedNew);
}

/**
 * Batch replace multiple imports efficiently in a single pass
 * This is an optimized version for processing many files with many imports
 * @param content Original file content
 * @param replacements Map of import paths to their replacements
 * @returns Modified content with all imports replaced
 */
export function batchReplaceImports(content: string, replacements: Map<string, string>): string {
  if (replacements.size === 0) {
    return content;
  }

  const imports = findImports(content);

  const importsToReplace = imports.filter(imp => replacements.has(imp.importPath));

  if (importsToReplace.length === 0) {
    return content;
  }

  const sortedImports = importsToReplace.sort((a, b) => b.startIndex - a.startIndex);

  let modifiedContent = content;

  for (const importMatch of sortedImports) {
    const newPath = replacements.get(importMatch.importPath);
    if (newPath) {
      const newFullMatch = replaceImportPathInStatement(
        importMatch.fullMatch,
        importMatch.importPath,
        newPath
      );

      modifiedContent =
        modifiedContent.slice(0, importMatch.startIndex) +
        newFullMatch +
        modifiedContent.slice(importMatch.endIndex);
    }
  }

  return modifiedContent;
}
