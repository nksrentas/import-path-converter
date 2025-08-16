export type ImportType = 'es6' | 'commonjs' | 'dynamic';

/**
 * Represents a matched import statement in source code
 */
export interface ImportMatch {
  /** The full matched import statement */
  fullMatch: string;
  /** The import path extracted from the statement */
  importPath: string;
  /** Starting index of the match in the source code */
  startIndex: number;
  /** Ending index of the match in the source code */
  endIndex: number;
  /** Type of import statement */
  type: ImportType;
  /** The variable/binding part of the import (for replacement) */
  importBinding?: string;
}

/**
 * Configuration for import parsing behavior
 */
export interface ImportParsingOptions {
  /** Whether to include ES6 import statements */
  includeES6?: boolean;
  /** Whether to include CommonJS require statements */
  includeCommonJS?: boolean;
  /** Whether to include dynamic import() statements */
  includeDynamic?: boolean;
  /** Whether to skip malformed import statements */
  skipMalformed?: boolean;
}
