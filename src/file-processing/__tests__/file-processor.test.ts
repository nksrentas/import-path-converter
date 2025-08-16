import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import type { Stats } from 'fs';
import {
  processFile,
  replaceImports,
  batchReplaceImports,
  shouldProcessFile,
  getProcessingStats,
} from '../file-processor.js';
import { PathResolverState, ConversionResult } from '../../path-resolution/types.js';
import { ImportMatch } from '../../import-parsing/types.js';
import { ProcessingResult } from '../types.js';

vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

vi.mock('../../import-parsing/index.js', () => ({
  findImports: vi.fn(),
}));

vi.mock('../../path-resolution/index.js', () => ({
  resolveImport: vi.fn(),
}));

import { findImports } from '../../import-parsing/index.js';
import { resolveImport } from '../../path-resolution/index.js';

const mockFindImports = vi.mocked(findImports);
const mockResolveImport = vi.mocked(resolveImport);

describe('File Processing', () => {
  let mockResolverState: PathResolverState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResolverState = {
      pathMappings: new Map(),
      aliasLookup: new Map(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processFile', () => {
    it('should process a TypeScript file successfully', async () => {
      const filePath = '/test/src/components/Button.tsx';
      const fileContent = `import React from 'react';
import { Utils } from '../../utils/helpers';
import './Button.css';`;

      const mockImports: ImportMatch[] = [
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 26,
          endIndex: 67,
          type: 'es6',
        },
      ];

      const mockConversion: ConversionResult = {
        originalImport: '../../utils/helpers',
        convertedImport: '~/utils/helpers',
        reason: 'Converted using alias',
      };

      mockFs.stat.mockResolvedValue({ size: 1000 } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockFs.writeFile.mockResolvedValue();
      mockFindImports.mockReturnValue(mockImports);
      mockResolveImport.mockReturnValue(mockConversion);

      const result = await processFile(filePath, mockResolverState);

      expect(result.filePath).toBe(filePath);
      expect(result.modified).toBe(true);
      expect(result.conversions).toHaveLength(1);
      expect(result.conversions[0]).toEqual(mockConversion);
      expect(result.errors).toEqual([]);
    });

    it('should handle dry run mode', async () => {
      const filePath = '/test/src/components/Button.tsx';
      const fileContent = `import { Utils } from '../../utils/helpers';`;

      const mockImports: ImportMatch[] = [
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 43,
          type: 'es6',
        },
      ];

      const mockConversion: ConversionResult = {
        originalImport: '../../utils/helpers',
        convertedImport: '~/utils/helpers',
      };

      mockFs.stat.mockResolvedValue({ size: 1000 } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockFindImports.mockReturnValue(mockImports);
      mockResolveImport.mockReturnValue(mockConversion);

      const result = await processFile(filePath, mockResolverState, { dryRun: true });

      expect(result.modified).toBe(true);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should skip unsupported file extensions', async () => {
      const filePath = '/test/src/data.json';

      const result = await processFile(filePath, mockResolverState);

      expect(result.errors).toContain('Unsupported file extension: .json');
      expect(result.modified).toBe(false);
    });

    it('should handle files that are too large', async () => {
      const filePath = '/test/src/large-file.ts';

      mockFs.stat.mockResolvedValue({ size: 20 * 1024 * 1024 } as Stats);

      const result = await processFile(filePath, mockResolverState);

      expect(result.errors?.[0]).toContain('File too large');
      expect(result.modified).toBe(false);
    });

    it('should handle files with no imports', async () => {
      const filePath = '/test/src/constants.ts';
      const fileContent = `export const API_URL = 'https://api.example.com';`;

      mockFs.stat.mockResolvedValue({ size: 1000 } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockFindImports.mockReturnValue([]);

      const result = await processFile(filePath, mockResolverState);

      expect(result.modified).toBe(false);
      expect(result.conversions).toHaveLength(0);
    });

    it('should handle files with no convertible imports', async () => {
      const filePath = '/test/src/components/Button.tsx';
      const fileContent = `import React from 'react';`;

      const mockImports: ImportMatch[] = [
        {
          fullMatch: "import React from 'react'",
          importPath: 'react',
          startIndex: 0,
          endIndex: 25,
          type: 'es6',
        },
      ];

      const mockConversion: ConversionResult = {
        originalImport: 'react',
        convertedImport: null,
        reason: 'Not a relative import',
      };

      mockFs.stat.mockResolvedValue({ size: 1000 } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockFindImports.mockReturnValue(mockImports);
      mockResolveImport.mockReturnValue(mockConversion);

      const result = await processFile(filePath, mockResolverState);

      expect(result.modified).toBe(false);
      expect(result.conversions).toHaveLength(1);
      expect(result.conversions[0].convertedImport).toBeNull();
    });

    it('should handle file read errors', async () => {
      const filePath = '/test/src/missing.ts';

      mockFs.stat.mockResolvedValue({ size: 1000 } as Stats);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await processFile(filePath, mockResolverState);

      expect(result.errors?.[0]).toContain('Error processing file: File not found');
      expect(result.modified).toBe(false);
    });
  });

  describe('replaceImports', () => {
    it('should replace single import correctly', () => {
      const content = `import { Utils } from '../../utils/helpers';`;
      const imports: ImportMatch[] = [
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 43,
          type: 'es6',
        },
      ];
      const conversions: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: '~/utils/helpers',
        },
      ];

      const result = replaceImports(content, imports, conversions);

      expect(result).toBe(`import { Utils } from '~/utils/helpers';`);
    });

    it('should replace multiple imports correctly', () => {
      const content = `import { Utils } from '../../utils/helpers';
import { Button } from '../components/Button';
import React from 'react';`;

      const imports: ImportMatch[] = [
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 43,
          type: 'es6',
        },
        {
          fullMatch: "import { Button } from '../components/Button'",
          importPath: '../components/Button',
          startIndex: 44,
          endIndex: 90,
          type: 'es6',
        },
      ];

      const conversions: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: '~/utils/helpers',
        },
        {
          originalImport: '../components/Button',
          convertedImport: '~/components/Button',
        },
      ];

      const result = replaceImports(content, imports, conversions);

      expect(result).toContain(`import { Utils } from '~/utils/helpers';`);
      expect(result).toContain(`import { Button } from '~/components/Button';`);
      expect(result).toContain(`import React from 'react';`);
    });

    it('should preserve quote styles', () => {
      const content1 = `import { Utils } from "../../utils/helpers";`;
      const imports1: ImportMatch[] = [
        {
          fullMatch: 'import { Utils } from "../../utils/helpers";',
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 45,
          type: 'es6',
        },
      ];
      const conversions1: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: '~/utils/helpers',
        },
      ];
      const result1 = replaceImports(content1, imports1, conversions1);
      expect(result1).toBe(`import { Utils } from "~/utils/helpers";`);

      const content2 = `import { Button } from '../components/Button';`;
      const imports2: ImportMatch[] = [
        {
          fullMatch: "import { Button } from '../components/Button';",
          importPath: '../components/Button',
          startIndex: 0,
          endIndex: 47,
          type: 'es6',
        },
      ];
      const conversions2: ConversionResult[] = [
        {
          originalImport: '../components/Button',
          convertedImport: '~/components/Button',
        },
      ];
      const result2 = replaceImports(content2, imports2, conversions2);
      expect(result2).toBe(`import { Button } from '~/components/Button';`);

      const content3 = 'import { Config } from `../../config/app`;';
      const imports3: ImportMatch[] = [
        {
          fullMatch: 'import { Config } from `../../config/app`',
          importPath: '../../config/app',
          startIndex: 0,
          endIndex: 41,
          type: 'es6',
        },
      ];
      const conversions3: ConversionResult[] = [
        {
          originalImport: '../../config/app',
          convertedImport: '~/config/app',
        },
      ];
      const result3 = replaceImports(content3, imports3, conversions3);
      expect(result3).toBe('import { Config } from `~/config/app`;');
    });

    it('should handle CommonJS requires', () => {
      const content = `const utils = require('../../utils/helpers');`;
      const imports: ImportMatch[] = [
        {
          fullMatch: "require('../../utils/helpers')",
          importPath: '../../utils/helpers',
          startIndex: 14,
          endIndex: 44,
          type: 'commonjs',
        },
      ];
      const conversions: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: '~/utils/helpers',
        },
      ];

      const result = replaceImports(content, imports, conversions);

      expect(result).toBe(`const utils = require('~/utils/helpers');`);
    });

    it('should handle dynamic imports', () => {
      const content = `const module = await import('../../utils/helpers');`;
      const imports: ImportMatch[] = [
        {
          fullMatch: "import('../../utils/helpers')",
          importPath: '../../utils/helpers',
          startIndex: 21,
          endIndex: 50,
          type: 'dynamic',
        },
      ];
      const conversions: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: '~/utils/helpers',
        },
      ];

      const result = replaceImports(content, imports, conversions);

      expect(result).toBe(`const module = await import('~/utils/helpers');`);
    });

    it('should return original content when no conversions', () => {
      const content = `import React from 'react';`;
      const imports: ImportMatch[] = [];
      const conversions: ConversionResult[] = [];

      const result = replaceImports(content, imports, conversions);

      expect(result).toBe(content);
    });

    it('should skip imports with null conversions', () => {
      const content = `import { Utils } from '../../utils/helpers';`;
      const imports: ImportMatch[] = [
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 43,
          type: 'es6',
        },
      ];
      const conversions: ConversionResult[] = [
        {
          originalImport: '../../utils/helpers',
          convertedImport: null,
          reason: 'No matching alias',
        },
      ];

      const result = replaceImports(content, imports, conversions);

      expect(result).toBe(content);
    });
  });

  describe('batchReplaceImports', () => {
    it('should replace multiple imports efficiently', () => {
      const content = `import { Utils } from '../../utils/helpers';
import { Button } from '../components/Button';`;

      const replacements = new Map([
        ['../../utils/helpers', '~/utils/helpers'],
        ['../components/Button', '~/components/Button'],
      ]);

      mockFindImports.mockReturnValue([
        {
          fullMatch: "import { Utils } from '../../utils/helpers'",
          importPath: '../../utils/helpers',
          startIndex: 0,
          endIndex: 43,
          type: 'es6',
        },
        {
          fullMatch: "import { Button } from '../components/Button'",
          importPath: '../components/Button',
          startIndex: 44,
          endIndex: 90,
          type: 'es6',
        },
      ]);

      const result = batchReplaceImports(content, replacements);

      expect(result).toContain(`import { Utils } from '~/utils/helpers';`);
      expect(result).toContain(`import { Button } from '~/components/Button';`);
    });

    it('should return original content when no replacements', () => {
      const content = `import React from 'react';`;
      const replacements = new Map<string, string>();

      const result = batchReplaceImports(content, replacements);

      expect(result).toBe(content);
    });
  });

  describe('shouldProcessFile', () => {
    it('should return true for supported extensions', () => {
      expect(shouldProcessFile('test.ts', ['.ts', '.tsx', '.js', '.jsx'])).toBe(true);
      expect(shouldProcessFile('test.tsx', ['.ts', '.tsx', '.js', '.jsx'])).toBe(true);
      expect(shouldProcessFile('test.js', ['.ts', '.tsx', '.js', '.jsx'])).toBe(true);
      expect(shouldProcessFile('test.jsx', ['.ts', '.tsx', '.js', '.jsx'])).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(shouldProcessFile('test.json', ['.ts', '.tsx', '.js', '.jsx'])).toBe(false);
      expect(shouldProcessFile('test.css', ['.ts', '.tsx', '.js', '.jsx'])).toBe(false);
      expect(shouldProcessFile('test.md', ['.ts', '.tsx', '.js', '.jsx'])).toBe(false);
    });
  });

  describe('getProcessingStats', () => {
    it('should calculate statistics correctly', () => {
      const results: ProcessingResult[] = [
        {
          filePath: '/test/file1.ts',
          conversions: [
            { originalImport: '../../utils', convertedImport: '~/utils' },
            { originalImport: '../components', convertedImport: null },
          ],
          modified: true,
        },
        {
          filePath: '/test/file2.ts',
          conversions: [{ originalImport: '../../config', convertedImport: '~/config' }],
          modified: true,
        },
        {
          filePath: '/test/file3.ts',
          conversions: [],
          modified: false,
          errors: ['Some error'],
        },
      ];

      const stats = getProcessingStats(results);

      expect(stats.totalFiles).toBe(3);
      expect(stats.modifiedFiles).toBe(2);
      expect(stats.totalConversions).toBe(3);
      expect(stats.successfulConversions).toBe(2);
      expect(stats.errors).toBe(1);
    });

    it('should handle empty results', () => {
      const stats = getProcessingStats([]);

      expect(stats.totalFiles).toBe(0);
      expect(stats.modifiedFiles).toBe(0);
      expect(stats.totalConversions).toBe(0);
      expect(stats.successfulConversions).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });
});
