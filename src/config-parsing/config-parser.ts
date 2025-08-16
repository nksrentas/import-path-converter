import * as fs from 'fs';
import * as path from 'path';
import { TSConfig, ParsedConfig, TSConfigPaths, PathMapping } from './types.js';

/**
 * Parse a tsconfig.json file and extract path mapping configuration
 */
export function parseConfig(configPath: string): ParsedConfig {
  const resolvedConfigPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(`tsconfig.json not found at: ${resolvedConfigPath}`);
  }

  const config = loadTSConfig(resolvedConfigPath);
  const mergedConfig = resolveExtendedConfig(config, path.dirname(resolvedConfigPath));

  const compilerOptions = mergedConfig.compilerOptions || {};
  const baseUrl = compilerOptions.baseUrl || '.';
  const paths = compilerOptions.paths || {};
  const rootDir = path.dirname(resolvedConfigPath);

  const pathMappings = buildPathMappingLookup(paths, baseUrl, rootDir);

  return {
    baseUrl,
    pathMappings,
    rootDir,
  };
}

/**
 * Load and parse a tsconfig.json file
 */
function loadTSConfig(configPath: string): TSConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');

    return JSON.parse(cleanContent);
  } catch (error) {
    throw new Error(
      `Failed to parse tsconfig.json at ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Resolve extended configurations by merging parent configs
 */
function resolveExtendedConfig(config: TSConfig, configDir: string): TSConfig {
  if (!config.extends) {
    return config;
  }

  const extendedConfigPath = resolveExtendedPath(config.extends, configDir);
  const parentConfig = loadTSConfig(extendedConfigPath);
  const resolvedParent = resolveExtendedConfig(parentConfig, path.dirname(extendedConfigPath));

  return {
    ...resolvedParent,
    ...config,
    compilerOptions: {
      ...resolvedParent.compilerOptions,
      ...config.compilerOptions,
      paths: {
        ...resolvedParent.compilerOptions?.paths,
        ...config.compilerOptions?.paths,
      },
    },
  };
}

/**
 * Resolve the path to an extended configuration file
 */
function resolveExtendedPath(extendsPath: string, configDir: string): string {
  if (extendsPath.startsWith('./') || extendsPath.startsWith('../')) {
    return path.resolve(configDir, extendsPath);
  }

  if (path.isAbsolute(extendsPath)) {
    return extendsPath;
  }

  try {
    return require.resolve(extendsPath, { paths: [configDir] });
  } catch {
    return path.resolve(configDir, extendsPath);
  }
}

/**
 * Build efficient lookup structures from tsconfig paths configuration
 */
export function buildPathMappingLookup(
  paths: TSConfigPaths,
  baseUrl: string,
  rootDir: string
): Map<string, PathMapping[]> {
  const pathMappings = new Map<string, PathMapping[]>();

  for (const [alias, pathList] of Object.entries(paths)) {
    let aliasPrefix = alias;
    if (alias.includes('*')) {
      aliasPrefix = alias.split('*')[0];
    }
    if (alias.includes('/')) {
      aliasPrefix = alias.split('/')[0];
    }

    const mappings: PathMapping[] = [];

    for (const basePath of pathList) {
      const resolvedBase = path.resolve(rootDir, baseUrl, basePath.replace('/*', ''));

      mappings.push({
        alias,
        basePath,
        resolvedBase,
      });
    }

    if (!pathMappings.has(aliasPrefix)) {
      pathMappings.set(aliasPrefix, []);
    }

    pathMappings.get(aliasPrefix)!.push(...mappings);
  }

  return pathMappings;
}
