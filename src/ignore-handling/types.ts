/**
 * State object containing compiled ignore patterns for efficient matching
 */
export interface IgnoreState {
  /** Compiled regular expressions for ignore patterns */
  patterns: RegExp[];
  /** Original pattern strings for debugging */
  originalPatterns: string[];
  /** Whether to ignore directories by default */
  ignoreDirectories?: boolean;
}

/**
 * Options for configuring ignore behavior
 */
export interface IgnoreOptions {
  /** Path to ignore file (defaults to .importignore) */
  ignoreFilePath?: string;
  /** Additional patterns to ignore */
  additionalPatterns?: string[];
  /** Whether to use default ignore patterns */
  useDefaults?: boolean;
  /** Whether to ignore node_modules by default */
  ignoreNodeModules?: boolean;
  /** Whether to ignore directories by default */
  ignoreDirectories?: boolean;
}

/**
 * Result of checking if a file should be ignored
 */
export interface IgnoreCheckResult {
  /** Whether the file should be ignored */
  shouldIgnore: boolean;
  /** The pattern that matched (if any) */
  matchedPattern?: string;
  /** Reason for ignoring */
  reason?: string;
}
