# Import Path Converter

Automatically converts relative imports to path alias imports based on TypeScript configuration.

## Features

- 🚀 **Fast & Efficient**: Uses O(1) hash map lookups for optimal performance
- 📁 **Smart Ignore Handling**: Supports .importignore files with gitignore-style patterns
- 🔧 **TypeScript Integration**: Reads tsconfig.json path mappings automatically
- 🎯 **Accurate Conversions**: Maintains module resolution behavior after conversion
- 📦 **Multiple Interfaces**: CLI tool and programmatic API
- ⚡ **Batch Processing**: Handles large codebases efficiently

## Installation

```bash
npm install -g import-path-converter
```

Or use without installation:

```bash
npx import-path-converter src/
```

## Usage

### CLI

```bash
# Convert all files in src directory
import-path-converter src/

# Dry run to see what would be changed
import-path-converter src/ --dry-run

# Use custom config and ignore files
import-path-converter src/ --config custom-tsconfig.json --ignore .customignore

# Verbose output
import-path-converter src/ --verbose
```

### Programmatic API

```typescript
import { convertImports } from 'import-path-converter';

const results = await convertImports('./src', {
  dryRun: false,
  verbose: true,
  configPath: './tsconfig.json'
});

console.log(`Processed ${results.totalFiles} files`);
console.log(`Made ${results.totalConversions} conversions`);
```

## Configuration

The tool reads your `tsconfig.json` file automatically to understand path mappings:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"],
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

### Ignore Files

Create a `.importignore` file to exclude files from processing:

```
node_modules/**
**/*.d.ts
dist/**
build/**
*.test.ts
*.spec.ts
```

## Examples

### Before
```typescript
import { Button } from '../../components/Button';
import { utils } from '../../../utils/helpers';
import { config } from '../../../../config/app';
```

### After
```typescript
import { Button } from '@components/Button';
import { utils } from '~/utils/helpers';
import { config } from '~/config/app';
```

## Performance

- **Large Codebases**: Efficiently handles 10,000+ files
- **Memory Efficient**: Streams large files instead of loading entirely
- **Fast Lookups**: O(1) path resolution using hash maps
- **Parallel Processing**: Batch processes multiple files safely

## Requirements

- Node.js >= 16.0.0
- TypeScript project with tsconfig.json

## License

MIT