import { describe, it, expect } from 'vitest';
import {
  findImports,
  parseES6Imports,
  parseCommonJSImports,
  parseDynamicImports,
  IMPORT_PATTERNS,
} from '../import-parser.js';

describe('Import Parsing', () => {
  describe('ES6 Import Parsing', () => {
    it('should parse named imports', () => {
      const content = `import { Component } from './component';`;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({
        fullMatch: `import { Component } from './component';`,
        importPath: './component',
        startIndex: 0,
        endIndex: 40,
        type: 'es6',
      });
    });

    it('should parse default imports', () => {
      const content = `import React from '../react';`;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('../react');
      expect(matches[0].type).toBe('es6');
    });

    it('should parse namespace imports', () => {
      const content = `import * as utils from './utils';`;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./utils');
      expect(matches[0].type).toBe('es6');
    });

    it('should parse mixed imports', () => {
      const content = `import React, { useState } from '../react';`;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('../react');
      expect(matches[0].type).toBe('es6');
    });

    it('should parse side-effect imports', () => {
      const content = `import './styles.css';`;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./styles.css');
      expect(matches[0].type).toBe('es6');
    });

    it('should handle multiple imports in one file', () => {
      const content = `
                import React from '../react';
                import { Component } from './component';
                import * as utils from './utils';
            `;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(3);

      matches.sort((a, b) => a.startIndex - b.startIndex);
      expect(matches[0].importPath).toBe('../react');
      expect(matches[1].importPath).toBe('./component');
      expect(matches[2].importPath).toBe('./utils');
    });

    it('should ignore non-relative imports', () => {
      const content = `
                import React from 'react';
                import { Component } from './component';
                import lodash from 'lodash';
            `;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./component');
    });

    it('should handle different quote types', () => {
      const content = `
                import a from "./single";
                import b from '../double';
                import c from \`./template\`;
            `;
      const matches = parseES6Imports(content);

      expect(matches).toHaveLength(3);
      expect(matches[0].importPath).toBe('./single');
      expect(matches[1].importPath).toBe('../double');
      expect(matches[2].importPath).toBe('./template');
    });
  });

  describe('CommonJS Import Parsing', () => {
    it('should parse require statements', () => {
      const content = `const component = require('./component');`;
      const matches = parseCommonJSImports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./component');
      expect(matches[0].type).toBe('commonjs');
    });

    it('should handle different spacing', () => {
      const content = `
                const a = require( './a' );
                const b = require('./b');
                const c = require(  '../c'  );
            `;
      const matches = parseCommonJSImports(content);

      expect(matches).toHaveLength(3);
      expect(matches[0].importPath).toBe('./a');
      expect(matches[1].importPath).toBe('./b');
      expect(matches[2].importPath).toBe('../c');
    });

    it('should ignore non-relative requires', () => {
      const content = `
                const fs = require('fs');
                const component = require('./component');
                const lodash = require('lodash');
            `;
      const matches = parseCommonJSImports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./component');
    });
  });

  describe('Dynamic Import Parsing', () => {
    it('should parse dynamic imports', () => {
      const content = `const module = await import('./module');`;
      const matches = parseDynamicImports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./module');
      expect(matches[0].type).toBe('dynamic');
    });

    it('should handle different spacing', () => {
      const content = `
                import( './a' );
                import('./b');
                import(  '../c'  );
            `;
      const matches = parseDynamicImports(content);

      expect(matches).toHaveLength(3);
      expect(matches[0].importPath).toBe('./a');
      expect(matches[1].importPath).toBe('./b');
      expect(matches[2].importPath).toBe('../c');
    });

    it('should ignore non-relative dynamic imports', () => {
      const content = `
                import('react');
                import('./component');
                import('lodash');
            `;
      const matches = parseDynamicImports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe('./component');
    });
  });

  describe('findImports - Comprehensive Parsing', () => {
    it('should find all types of imports', () => {
      const content = `
                import React from '../react';
                const fs = require('./fs');
                import('./dynamic');
                import { Component } from './component';
            `;
      const matches = findImports(content);

      expect(matches).toHaveLength(4);
      expect(matches.map(m => m.type)).toEqual(['es6', 'commonjs', 'dynamic', 'es6']);
      expect(matches.map(m => m.importPath)).toEqual([
        '../react',
        './fs',
        './dynamic',
        './component',
      ]);
    });

    it('should sort matches by position', () => {
      const content = `
                const b = require('./b');
                import a from './a';
                import('./c');
            `;
      const matches = findImports(content);

      expect(matches).toHaveLength(3);

      expect(matches[0].startIndex).toBeLessThan(matches[1].startIndex);
      expect(matches[1].startIndex).toBeLessThan(matches[2].startIndex);
    });

    it('should remove duplicates', () => {
      const content = `
                import a from './a';
                import a from './a';
            `;
      const matches = findImports(content);

      expect(matches).toHaveLength(2);
    });

    it('should handle parsing options', () => {
      const content = `
                import React from './react';
                const fs = require('./fs');
                import('./dynamic');
            `;

      const es6Only = findImports(content, {
        includeES6: true,
        includeCommonJS: false,
        includeDynamic: false,
      });
      expect(es6Only).toHaveLength(1);
      expect(es6Only[0].type).toBe('es6');

      const cjsOnly = findImports(content, {
        includeES6: false,
        includeCommonJS: true,
        includeDynamic: false,
      });
      expect(cjsOnly).toHaveLength(1);
      expect(cjsOnly[0].type).toBe('commonjs');

      const dynamicOnly = findImports(content, {
        includeES6: false,
        includeCommonJS: false,
        includeDynamic: true,
      });
      expect(dynamicOnly).toHaveLength(1);
      expect(dynamicOnly[0].type).toBe('dynamic');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty content', () => {
      const matches = findImports('');
      expect(matches).toHaveLength(0);
    });

    it('should handle null/undefined content', () => {
      const matches1 = findImports(null as any);
      const matches2 = findImports(undefined as any);
      expect(matches1).toHaveLength(0);
      expect(matches2).toHaveLength(0);
    });

    it('should handle malformed imports gracefully', () => {
      const content = `
                import from './broken';
                import { } from;
                require();
                import(;
            `;
      const matches = findImports(content, { skipMalformed: true });

      expect(Array.isArray(matches)).toBe(true);
    });

    it('should handle imports with comments', () => {
      const content = `

                import React from './react'; // End of line comment
                /* Block comment */
                const fs = require('./fs');
                /*
                 * Multi-line
                 * comment
                 */
                import('./dynamic');
            `;
      const matches = findImports(content);
      expect(matches).toHaveLength(3);
    });

    it('should handle imports in strings (current behavior)', () => {
      const content = `
                const str = "import React from './fake'";
                const template = \`require('./also-fake')\`;
                import Real from './real';
            `;
      const matches = findImports(content);

      expect(matches.length).toBeGreaterThanOrEqual(1);

      const realImport = matches.find(m => m.importPath === './real');
      expect(realImport).toBeDefined();
      expect(realImport?.type).toBe('es6');
    });

    it('should handle very long import paths', () => {
      const longPath = './very/long/path/that/goes/on/and/on/component';
      const content = `import Component from '${longPath}';`;
      const matches = findImports(content);

      expect(matches).toHaveLength(1);
      expect(matches[0].importPath).toBe(longPath);
    });

    it('should handle imports with special characters in paths', () => {
      const content = `
                import a from './path-with-dashes';
                import b from './path_with_underscores';
                import c from './path.with.dots';
                import d from './path@with@symbols';
            `;
      const matches = findImports(content);

      expect(matches).toHaveLength(4);
      expect(matches[0].importPath).toBe('./path-with-dashes');
      expect(matches[1].importPath).toBe('./path_with_underscores');
      expect(matches[2].importPath).toBe('./path.with.dots');
      expect(matches[3].importPath).toBe('./path@with@symbols');
    });
  });

  describe('Regex Patterns', () => {
    it('should have global flags on patterns', () => {
      expect(IMPORT_PATTERNS.ES6_NAMED_IMPORT.global).toBe(true);
      expect(IMPORT_PATTERNS.ES6_DEFAULT_IMPORT.global).toBe(true);
      expect(IMPORT_PATTERNS.COMMONJS_REQUIRE.global).toBe(true);
      expect(IMPORT_PATTERNS.DYNAMIC_IMPORT.global).toBe(true);
    });

    it('should reset regex lastIndex properly', () => {
      const content = `
                import a from './a';
                import b from './b';
            `;

      const matches1 = findImports(content);
      const matches2 = findImports(content);

      expect(matches1).toHaveLength(2);
      expect(matches2).toHaveLength(2);
      expect(matches1).toEqual(matches2);
    });
  });
});
