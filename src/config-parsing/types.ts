/**
 * Represents a single path mapping from tsconfig.json paths configuration
 */
export interface PathMapping {
  /** The alias pattern (e.g., "~/*", "@components/*") */
  alias: string;
  /** The base path pattern from tsconfig (e.g., "./app/*", "./src/components/*") */
  basePath: string;
  /** The resolved absolute base path */
  resolvedBase: string;
}

/**
 * Parsed TypeScript configuration with path mappings
 */
export interface ParsedConfig {
  /** Base URL from tsconfig.json */
  baseUrl: string;
  /** Map of alias prefixes to their path mappings */
  pathMappings: Map<string, PathMapping[]>;
  /** Root directory of the project */
  rootDir: string;
}

export interface TSConfigPaths {
  [key: string]: string[];
}

export interface TSConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: TSConfigPaths;
    rootDir?: string;
  };
  extends?: string;
}

/**
 * Function signatures for config parsing operations
 */

/**
 * Parse a tsconfig.json file and extract path mapping configuration
 * @param configPath Path to the tsconfig.json file
 * @returns Parsed configuration with path mappings
 */
export type ParseConfigFunction = (configPath: string) => ParsedConfig;

/**
 * Build efficient lookup structures from tsconfig paths configuration
 * @param paths The paths object from tsconfig.json
 * @param baseUrl The base URL from tsconfig.json
 * @param rootDir The root directory path
 * @returns Map of alias prefixes to path mappings
 */
export type BuildPathMappingLookupFunction = (
  paths: TSConfigPaths,
  baseUrl: string,
  rootDir: string
) => Map<string, PathMapping[]>;
