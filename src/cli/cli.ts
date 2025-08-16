#!/usr/bin/env node

import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { parseConfig } from '../config-parsing/index.js';
import { createPathResolver } from '../path-resolution/index.js';
import { createIgnoreState, shouldIgnore } from '../ignore-handling/index.js';
import { processFile, getProcessingStats } from '../file-processing/index.js';
import type { ProcessingResult } from '../file-processing/types.js';
import type { IgnoreState } from '../ignore-handling/types.js';

/**
 * CLI interface for import-path-converter
 */

interface CLIOptions {
  patterns: string[];
  config?: string;
  ignore?: string;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

const HELP_TEXT = `
import-path-converter - Convert relative imports to path alias imports

USAGE:
  import-path-converter [patterns...] [options]

ARGUMENTS:
  patterns              File patterns to process (default: "src/**/*.{ts,tsx,js,jsx}")

OPTIONS:
  --config, -c <path>   Path to tsconfig.json (default: auto-detect)
  --ignore, -i <path>   Path to ignore file (default: .importignore)
  --dry-run, -d         Show what would be changed without modifying files
  --verbose, -v         Show detailed output
  --help, -h            Show this help message
  --version, -V         Show version number

EXAMPLES:
  import-path-converter src/
  import-path-converter "src/**/*.ts" --config tsconfig.json --dry-run
  import-path-converter src/ --ignore .importignore --verbose
`;

const VERSION = '1.0.0';

/**
 * Parse command line arguments and validate them
 */
function parseCliArgs(): CLIOptions {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        config: {
          type: 'string',
          short: 'c',
        },
        ignore: {
          type: 'string',
          short: 'i',
        },
        'dry-run': {
          type: 'boolean',
          short: 'd',
          default: false,
        },
        verbose: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
        version: {
          type: 'boolean',
          short: 'V',
          default: false,
        },
      },
      allowPositionals: true,
    });

    const options: CLIOptions = {
      patterns: positionals.length > 0 ? positionals : ['src/**/*.{ts,tsx,js,jsx}'],
      config: values.config,
      ignore: values.ignore,
      dryRun: values['dry-run'] || false,
      verbose: values.verbose || false,
      help: values.help || false,
      version: values.version || false,
    };

    return options;
  } catch (error) {
    console.error(
      'Error parsing arguments:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}

/**
 * Validate CLI options and check file existence
 */
function validateOptions(options: CLIOptions): void {
  if (options.config && !fs.existsSync(options.config)) {
    console.error(`Error: Config file not found: ${options.config}`);
    process.exit(1);
  }

  if (options.ignore && !fs.existsSync(options.ignore)) {
    console.error(`Error: Ignore file not found: ${options.ignore}`);
    process.exit(1);
  }

  if (options.patterns.length === 0) {
    console.error('Error: At least one file pattern must be specified');
    process.exit(1);
  }

  for (const pattern of options.patterns) {
    if (pattern.trim() === '') {
      console.error('Error: Empty file pattern provided');
      process.exit(1);
    }
  }
}

/**
 * Find tsconfig.json file automatically
 */
function findTsConfig(startDir: string = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const tsConfigPath = path.join(currentDir, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      return tsConfigPath;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Process files based on CLI options
 */
async function processFiles(options: CLIOptions): Promise<void> {
  try {
    if (options.verbose) {
      console.log(`Parsing config: ${options.config}`);
    }

    const config = parseConfig(options.config!);
    const resolverState = createPathResolver(config);
    const ignoreState = createIgnoreState(options.ignore);

    if (options.verbose) {
      console.log(`Finding files matching patterns: ${options.patterns.join(', ')}`);
    }

    const filesToProcess = await findFiles(options.patterns, ignoreState);

    if (filesToProcess.length === 0) {
      console.log('No files found to process.');
      return;
    }

    if (options.verbose) {
      console.log(`Found ${filesToProcess.length} files to process`);
    }

    const results: ProcessingResult[] = [];
    let processedCount = 0;

    for (const filePath of filesToProcess) {
      if (options.verbose) {
        console.log(`Processing ${++processedCount}/${filesToProcess.length}: ${filePath}`);
      }

      const result = await processFile(filePath, resolverState, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      results.push(result);
    }

    displayResults(results, options);
  } catch (error) {
    console.error(
      'Error during processing:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}

/**
 * Find files matching the given patterns
 */
async function findFiles(patterns: string[], ignoreState: IgnoreState): Promise<string[]> {
  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    const files = await expandPattern(pattern);
    for (const file of files) {
      const ignoreResult = shouldIgnore(ignoreState, file);
      if (!ignoreResult.shouldIgnore) {
        allFiles.add(file);
      }
    }
  }

  return Array.from(allFiles).sort();
}

/**
 * Expand a file pattern to actual file paths
 */
async function expandPattern(pattern: string): Promise<string[]> {
  const files: string[] = [];

  if (pattern.endsWith('/')) {
    pattern = pattern + '**/*.{ts,tsx,js,jsx}';
  }
  if (pattern.includes('**')) {
    const basePath = pattern.split('**')[0];
    const extension = pattern.includes('*.{')
      ? pattern.match(/\*\.{([^}]+)}/)?.[1]?.split(',') || ['ts', 'tsx', 'js', 'jsx']
      : ['ts', 'tsx', 'js', 'jsx'];

    await walkDirectory(basePath || '.', files, extension);
  } else if (pattern.includes('*')) {
    const dir = path.dirname(pattern);
    const filePattern = path.basename(pattern);

    try {
      const entries = await fs.promises.readdir(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.promises.stat(fullPath);

        if (stat.isFile() && matchesPattern(entry, filePattern)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore directory read errors - directory may not exist or be inaccessible
    }
  } else {
    try {
      const stat = await fs.promises.stat(pattern);
      if (stat.isFile()) {
        files.push(pattern);
      } else if (stat.isDirectory()) {
        await walkDirectory(pattern, files, ['ts', 'tsx', 'js', 'jsx']);
      }
    } catch {
      // Ignore directory read errors - directory may not exist or be inaccessible
    }
  }

  return files;
}

/**
 * Recursively walk directory to find files
 */
async function walkDirectory(dir: string, files: string[], extensions: string[]): Promise<void> {
  try {
    const entries = await fs.promises.readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      try {
        const stat = await fs.promises.stat(fullPath);

        if (stat.isDirectory()) {
          await walkDirectory(fullPath, files, extensions);
        } else if (stat.isFile()) {
          const ext = path.extname(entry).slice(1);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      } catch {
      // Ignore directory read errors - directory may not exist or be inaccessible
    }
    }
  } catch {
    // Ignore directory traversal errors
  }
}

/**
 * Simple pattern matching for filenames
 */
function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Display processing results
 */
function displayResults(results: ProcessingResult[], options: CLIOptions): void {
  const stats = getProcessingStats(results);

  console.log('\n=== Processing Summary ===');
  console.log(`Files processed: ${stats.totalFiles}`);
  console.log(`Files modified: ${stats.modifiedFiles}`);
  console.log(`Total conversions: ${stats.successfulConversions}`);

  if (stats.errors > 0) {
    console.log(`Files with errors: ${stats.errors}`);
  }

  if (options.dryRun) {
    console.log('\n(Dry run mode - no files were actually modified)');
  }

  if (options.verbose) {
    console.log('\n=== Detailed Results ===');
    for (const result of results) {
      if (result.modified || (result.errors && result.errors.length > 0)) {
        console.log(`\n${result.filePath}:`);

        if (result.errors && result.errors.length > 0) {
          console.log('  Errors:');
          for (const error of result.errors) {
            console.log(`    - ${error}`);
          }
        }

        const successfulConversions = result.conversions.filter(c => c.convertedImport !== null);
        if (successfulConversions.length > 0) {
          console.log('  Conversions:');
          for (const conversion of successfulConversions) {
            console.log(`    ${conversion.originalImport} -> ${conversion.convertedImport}`);
          }
        }
      }
    }
  }

  if (stats.errors > 0) {
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const options = parseCliArgs();

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (options.version) {
    console.log(VERSION);
    process.exit(0);
  }

  validateOptions(options);

  if (!options.config) {
    const autoConfig = findTsConfig();
    if (!autoConfig) {
      console.error(
        'Error: No tsconfig.json found. Please specify one with --config or create one in your project root.'
      );
      process.exit(1);
    }
    options.config = autoConfig;
    if (options.verbose) {
      console.log(`Auto-detected config: ${options.config}`);
    }
  }

  if (!options.ignore) {
    const defaultIgnore = path.join(process.cwd(), '.importignore');
    if (fs.existsSync(defaultIgnore)) {
      options.ignore = defaultIgnore;
      if (options.verbose) {
        console.log(`Using ignore file: ${options.ignore}`);
      }
    }
  }

  if (options.verbose) {
    console.log('CLI Options:', {
      patterns: options.patterns,
      config: options.config,
      ignore: options.ignore,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }

  await processFiles(options);
}

const isMainModule = process.argv[1] && process.argv[1].endsWith('cli.js');
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
}
