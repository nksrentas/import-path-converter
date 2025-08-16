import { PathMapping, ParsedConfig } from '../config-parsing/types.js';

/**
 * Result of attempting to convert a relative import to a path alias
 */
export interface ConversionResult {
  /** The original import path that was processed */
  originalImport: string;
  /** The converted import path using alias, or null if no conversion was possible */
  convertedImport: string | null;
  /** Optional reason explaining why conversion succeeded or failed */
  reason?: string;
}

/**
 * State object containing all data needed for efficient path resolution
 */
export interface PathResolverState {
  /** Map of alias prefixes to their path mappings for forward lookup */
  pathMappings: Map<string, PathMapping[]>;
  /** Reverse lookup map from resolved absolute paths to their best alias */
  aliasLookup: Map<string, string>;
}

/**
 * Function signatures for path resolution operations
 */

/**
 * Create a path resolver state from parsed configuration
 * @param config Parsed TypeScript configuration
 * @returns Initialized path resolver state with lookup structures
 */
export type CreatePathResolverFunction = (config: ParsedConfig) => PathResolverState;

/**
 * Resolve a relative import to a path alias if possible
 * @param state Path resolver state with lookup structures
 * @param importPath The relative import path to convert
 * @param fromFile The file path where the import is located
 * @returns Conversion result with original and converted paths
 */
export type ResolveImportFunction = (
  state: PathResolverState,
  importPath: string,
  fromFile: string
) => ConversionResult;

/**
 * Find the best matching path alias for an absolute path
 * @param state Path resolver state with lookup structures
 * @param absolutePath The absolute path to find an alias for
 * @returns The best matching PathMapping or null if no match found
 */
export type FindBestMatchFunction = (
  state: PathResolverState,
  absolutePath: string
) => PathMapping | null;
