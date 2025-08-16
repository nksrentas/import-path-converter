/**
 * Import Path Converter - Convert relative imports to path aliases
 *
 * This package automatically converts relative imports (using `../../` syntax)
 * to path alias imports based on TypeScript configuration paths. It reads
 * tsconfig.json files, understands the path mappings, and efficiently
 * transforms import statements while providing options to ignore specific
 * files or directories.
 *
 * @example Basic Usage
 * ```typescript
 * import { convertImports } from 'import-path-converter';
 *
 * // Convert all imports in src directory
 * const results = await convertImports('./src');
 *
 * // Check results
 * results.forEach(result => {
 *   if (result.modified) {
 *     console.log(`Modified ${result.filePath}`);
 *     result.conversions.forEach(conv => {
 *       if (conv.convertedImport) {
 *         console.log(`  ${conv.originalImport} -> ${conv.convertedImport}`);
 *       }
 *     });
 *   }
 * });
 * ```
 *
 * @example Advanced Usage with Options
 * ```typescript
 * import { convertImportsBatch } from 'import-path-converter';
 *
 * const result = await convertImportsBatch('./src', {
 *   dryRun: true,           // Don't modify files, just report changes
 *   verbose: true,          // Show detailed output
 *   extensions: ['.ts'],    // Only process TypeScript files
 *   configPath: './tsconfig.build.json',  // Custom tsconfig
 *   ignoreFile: './.importignore'          // Custom ignore file
 * });
 *
 * console.log(`Would modify ${result.filesModified} files`);
 * console.log(`Would convert ${result.importsConverted} imports`);
 * ```
 *
 * @example Programmatic Integration
 * ```typescript
 * import {
 *   parseConfig,
 *   createPathResolver,
 *   processFile
 * } from 'import-path-converter';
 *
 * // Manual setup for custom workflows
 * const config = parseConfig('./tsconfig.json');
 * const resolver = createPathResolver(config);
 * const result = await processFile('./src/component.ts', resolver, {
 *   dryRun: true
 * });
 * ```
 *
 * @packageDocumentation
 */

export * from './api.js';
export * from './config-parsing/index.js';
export * from './path-resolution/index.js';
export * from './file-processing/index.js';
export * from './import-parsing/index.js';
export * from './ignore-handling/index.js';
