import path from 'path';
import { ParsedConfig, PathMapping } from '../config-parsing/types.js';
import {
  PathResolverState,
  ConversionResult,
  CreatePathResolverFunction,
  ResolveImportFunction,
  FindBestMatchFunction,
} from './types.js';
import { FastMap, LRUCache } from '../performance/index.js';

const resolveCache = new LRUCache<string, ConversionResult>(1000);

/**
 * Create a path resolver state from parsed configuration
 * Builds efficient lookup structures for O(1) path-to-alias conversion
 */
export const createPathResolver: CreatePathResolverFunction = (
  config: ParsedConfig
): PathResolverState => {
  const pathMappings = new FastMap(config.pathMappings);
  const aliasLookup = new FastMap<string, string>();
  for (const [, mappings] of pathMappings) {
    for (const mapping of mappings) {
      const cleanResolvedBase = mapping.resolvedBase.replace(/\/\*$/, '');
      const cleanAlias = mapping.alias.replace(/\/\*$/, '');
      const existingAlias = aliasLookup.get(cleanResolvedBase);
      if (
        !existingAlias ||
        cleanResolvedBase.length > (aliasLookup.get(existingAlias) || '').length
      ) {
        aliasLookup.set(cleanResolvedBase, cleanAlias);
      }
    }
  }

  return {
    pathMappings,
    aliasLookup,
  };
};

/**
 * Resolve a relative import to a path alias if possible
 * Converts relative imports like '../../app/components/Button' to '~/components/Button'
 */
export const resolveImport: ResolveImportFunction = (
  state: PathResolverState,
  importPath: string,
  fromFile: string
): ConversionResult => {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
    return {
      originalImport: importPath,
      convertedImport: null,
      reason: 'Not a relative import',
    };
  }

  const cacheKey = `${fromFile}:${importPath}`;
  const cached = resolveCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    if (!fromFile || !fromFile.trim()) {
      throw new Error('fromFile parameter cannot be empty');
    }
    const fromDir = path.dirname(fromFile);
    const absolutePath = path.resolve(fromDir, importPath);
    const bestMatch = findBestMatch(state, absolutePath);

    if (!bestMatch) {
      return {
        originalImport: importPath,
        convertedImport: null,
        reason: 'No matching path alias found',
      };
    }

    const convertedImport = convertToAlias(absolutePath, bestMatch);

    if (!convertedImport) {
      return {
        originalImport: importPath,
        convertedImport: null,
        reason: 'Failed to convert to alias format',
      };
    }

    const result = {
      originalImport: importPath,
      convertedImport,
      reason: `Converted using alias '${bestMatch.alias}'`,
    };

    resolveCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const result = {
      originalImport: importPath,
      convertedImport: null,
      reason: `Error during conversion: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };

    resolveCache.set(cacheKey, result);
    return result;
  }
};

/**
 * Find the best matching path alias for an absolute path
 * Uses specificity ranking - longer paths (more specific) take precedence
 */
export const findBestMatch: FindBestMatchFunction = (
  state: PathResolverState,
  absolutePath: string
): PathMapping | null => {
  const normalizedPath = path.normalize(absolutePath);
  let bestMatch: PathMapping | null = null;
  let bestMatchLength = 0;

  for (const [, mappings] of state.pathMappings) {
    for (const mapping of mappings) {
      const resolvedBase = path.normalize(mapping.resolvedBase.replace(/\/\*$/, ''));

      if (normalizedPath.startsWith(resolvedBase)) {
        if (resolvedBase.length > bestMatchLength) {
          bestMatch = mapping;
          bestMatchLength = resolvedBase.length;
        }
      }
    }
  }

  return bestMatch;
};

/**
 * Convert an absolute path to an alias-based import using the provided mapping
 * @param absolutePath The absolute path to convert
 * @param mapping The path mapping to use for conversion
 * @returns The alias-based import path or null if conversion fails
 */
function convertToAlias(absolutePath: string, mapping: PathMapping): string | null {
  const normalizedPath = path.normalize(absolutePath);
  const resolvedBase = path.normalize(mapping.resolvedBase.replace(/\/\*$/, ''));

  if (!normalizedPath.startsWith(resolvedBase)) {
    return null;
  }

  const relativePart = normalizedPath.slice(resolvedBase.length);
  const cleanRelativePart = relativePart.startsWith('/') ? relativePart.slice(1) : relativePart;
  const aliasBase = mapping.alias.replace(/\/\*$/, '');

  if (!cleanRelativePart) {
    return aliasBase;
  }
  return `${aliasBase}/${cleanRelativePart}`;
}
