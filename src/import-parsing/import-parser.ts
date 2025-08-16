import { ImportMatch, ImportType, ImportParsingOptions } from './types.js';

export const IMPORT_PATTERNS = {
  ES6_IMPORT:
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]/g,
  ES6_IMPORT_SIDE_EFFECT: /import\s+['"`]([^'"`]+)['"`]/g,
  COMMONJS_REQUIRE: /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  DYNAMIC_IMPORT: /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ES6_NAMED_IMPORT: /import\s+\{[^}]*\}\s+from\s+['"`]([^'"`]+)['"`]/g,
  ES6_DEFAULT_IMPORT: /import\s+\w+\s+from\s+['"`]([^'"`]+)['"`]/g,
  ES6_NAMESPACE_IMPORT: /import\s+\*\s+as\s+\w+\s+from\s+['"`]([^'"`]+)['"`]/g,
  ES6_MIXED_IMPORT: /import\s+\w+\s*,\s*\{[^}]*\}\s+from\s+['"`]([^'"`]+)['"`]/g,
} as const;

const DEFAULT_OPTIONS: Required<ImportParsingOptions> = {
  includeES6: true,
  includeCommonJS: true,
  includeDynamic: true,
  skipMalformed: true,
};

/**
 * Parse ES6 import statements from source code
 */
export function parseES6Imports(content: string): ImportMatch[] {
  const matches: ImportMatch[] = [];

  Object.values(IMPORT_PATTERNS).forEach(pattern => {
    if (pattern.global) pattern.lastIndex = 0;
  });
  const patterns = [
    IMPORT_PATTERNS.ES6_NAMED_IMPORT,
    IMPORT_PATTERNS.ES6_DEFAULT_IMPORT,
    IMPORT_PATTERNS.ES6_NAMESPACE_IMPORT,
    IMPORT_PATTERNS.ES6_MIXED_IMPORT,
    IMPORT_PATTERNS.ES6_IMPORT_SIDE_EFFECT,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        matches.push({
          fullMatch: match[0],
          importPath,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          type: 'es6',
        });
      }
    }
  }

  return matches;
}

/**
 * Parse CommonJS require statements from source code
 */
export function parseCommonJSImports(content: string): ImportMatch[] {
  const matches: ImportMatch[] = [];

  IMPORT_PATTERNS.COMMONJS_REQUIRE.lastIndex = 0;
  let match;

  while ((match = IMPORT_PATTERNS.COMMONJS_REQUIRE.exec(content)) !== null) {
    const importPath = match[1];

    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      matches.push({
        fullMatch: match[0],
        importPath,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'commonjs',
      });
    }
  }

  return matches;
}

/**
 * Parse dynamic import() statements from source code
 */
export function parseDynamicImports(content: string): ImportMatch[] {
  const matches: ImportMatch[] = [];

  IMPORT_PATTERNS.DYNAMIC_IMPORT.lastIndex = 0;
  let match;

  while ((match = IMPORT_PATTERNS.DYNAMIC_IMPORT.exec(content)) !== null) {
    const importPath = match[1];

    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      matches.push({
        fullMatch: match[0],
        importPath,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type: 'dynamic',
      });
    }
  }

  return matches;
}

/**
 * Safely parse imports with error recovery for malformed statements
 */
function safeParseImports(
  parseFunction: (content: string) => ImportMatch[],
  content: string,
  type: ImportType
): ImportMatch[] {
  try {
    return parseFunction(content);
  } catch (error) {
    console.warn(`Error parsing ${type} imports, attempting recovery:`, error);

    try {
      const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      return parseFunction(cleanContent);
    } catch (recoveryError) {
      console.warn(`Recovery failed for ${type} imports:`, recoveryError);
      return [];
    }
  }
}

/**
 * Validate and sanitize import path
 */
function validateImportPath(importPath: string): string | null {
  if (!importPath || typeof importPath !== 'string') {
    return null;
  }

  const trimmed = importPath.trim();

  if (trimmed.length === 0 || trimmed.includes('\n') || trimmed.includes('\r')) {
    return null;
  }

  return trimmed;
}

/**
 * Find all import statements in source code with comprehensive error handling
 */
export function findImports(content: string, options: ImportParsingOptions = {}): ImportMatch[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allMatches: ImportMatch[] = [];

  if (!content || typeof content !== 'string') {
    return [];
  }

  try {
    if (opts.includeES6) {
      const es6Matches = safeParseImports(parseES6Imports, content, 'es6');
      allMatches.push(...es6Matches);
    }

    if (opts.includeCommonJS) {
      const cjsMatches = safeParseImports(parseCommonJSImports, content, 'commonjs');
      allMatches.push(...cjsMatches);
    }

    if (opts.includeDynamic) {
      const dynamicMatches = safeParseImports(parseDynamicImports, content, 'dynamic');
      allMatches.push(...dynamicMatches);
    }

    const validMatches = allMatches
      .map(match => {
        const validPath = validateImportPath(match.importPath);
        return validPath ? { ...match, importPath: validPath } : null;
      })
      .filter((match): match is ImportMatch => match !== null);

    validMatches.sort((a, b) => a.startIndex - b.startIndex);

    const uniqueMatches = validMatches.filter((match, index) => {
      if (index === 0) return true;
      const prev = validMatches[index - 1];
      return !(match.startIndex === prev.startIndex && match.importPath === prev.importPath);
    });

    return uniqueMatches;
  } catch (error) {
    if (opts.skipMalformed) {
      console.warn('Error parsing imports, skipping malformed statements:', error);
      return [];
    }
    throw error;
  }
}
