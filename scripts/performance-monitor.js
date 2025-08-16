#!/usr/bin/env node

/**
 * Performance monitoring script for import-path-converter
 * Runs benchmarks and tracks performance over time
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const RESULTS_DIR = path.join(__dirname, '..', 'performance-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'benchmark-history.json');

async function main() {
  console.log('🚀 Running performance benchmarks...\n');

  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true });

    console.log('Running benchmark tests...');
    const benchmarkOutput = execSync('npm test -- --run src/__tests__/benchmark.test.ts', {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..'),
    });

    console.log('Running performance tests...');
    const performanceOutput = execSync('npm test -- --run src/__tests__/performance.test.ts', {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..'),
    });

    const results = parseTestResults(benchmarkOutput + performanceOutput);
    
    const benchmarkResult = {
      timestamp: new Date().toISOString(),
      version: getPackageVersion(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      results,
    };

    let history = [];
    try {
      const existingData = await fs.readFile(RESULTS_FILE, 'utf-8');
      history = JSON.parse(existingData);
    } catch (error) {
      // File doesn't exist yet, start with empty history
    }

    history.push(benchmarkResult);

    if (history.length > 100) {
      history = history.slice(-100);
    }

    await fs.writeFile(RESULTS_FILE, JSON.stringify(history, null, 2));

    await generateReport(history);

    console.log('\n✅ Performance monitoring complete!');
    console.log(`📊 Results saved to: ${RESULTS_FILE}`);
    console.log(`📈 Report generated: ${path.join(RESULTS_DIR, 'performance-report.html')}`);

  } catch (error) {
    console.error('❌ Performance monitoring failed:', error.message);
    process.exit(1);
  }
}

function parseTestResults(output) {
  const results = {};
  
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('Operations per second:')) {
      const match = line.match(/Operations per second: ([\d,]+)/);
      if (match) {
        const opsPerSecond = parseInt(match[1].replace(/,/g, ''));
        for (let j = i - 5; j < i; j++) {
          if (j >= 0 && lines[j].includes('should')) {
            const testName = lines[j].trim();
            results[testName] = { operationsPerSecond: opsPerSecond };
            break;
          }
        }
      }
    }
    
    if (line.includes('ms for') && line.includes('operations')) {
      const match = line.match(/([\d.]+)ms for ([\d,]+) operations/);
      if (match) {
        const time = parseFloat(match[1]);
        const operations = parseInt(match[2].replace(/,/g, ''));
        const opsPerSecond = Math.round(operations / (time / 1000));
        
        for (let j = i - 5; j < i; j++) {
          if (j >= 0 && lines[j].includes('should')) {
            const testName = lines[j].trim();
            results[testName] = { 
              time,
              operations,
              operationsPerSecond: opsPerSecond 
            };
            break;
          }
        }
      }
    }
  }
  
  return results;
}

function getPackageVersion() {
  try {
    const packageJson = require('../package.json');
    return packageJson.version;
  } catch {
    return 'unknown';
  }
}

async function generateReport(history) {
  if (history.length === 0) {
    return;
  }

  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Import Path Converter - Performance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metric { background: white; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .metric h3 { margin-top: 0; color: #333; }
        .improvement { color: #28a745; }
        .regression { color: #dc3545; }
        .stable { color: #6c757d; }
        .chart { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Import Path Converter - Performance Report</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Version:</strong> ${latest.version}</p>
        <p><strong>Node.js:</strong> ${latest.nodeVersion}</p>
        <p><strong>Platform:</strong> ${latest.platform} (${latest.arch})</p>
    </div>

    <h2>Latest Results</h2>
`;

  for (const [testName, metrics] of Object.entries(latest.results)) {
    let changeIndicator = '';
    let changeClass = 'stable';
    
    if (previous && previous.results[testName]) {
      const currentOps = metrics.operationsPerSecond;
      const previousOps = previous.results[testName].operationsPerSecond;
      const change = ((currentOps - previousOps) / previousOps) * 100;
      
      if (Math.abs(change) > 5) {
        changeClass = change > 0 ? 'improvement' : 'regression';
        changeIndicator = ` (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`;
      }
    }

    html += `
    <div class="metric">
        <h3>${testName}</h3>
        <p><strong>Operations per second:</strong> <span class="${changeClass}">${metrics.operationsPerSecond?.toLocaleString() || 'N/A'}${changeIndicator}</span></p>
        ${metrics.time ? `<p><strong>Time:</strong> ${metrics.time}ms</p>` : ''}
        ${metrics.operations ? `<p><strong>Operations:</strong> ${metrics.operations.toLocaleString()}</p>` : ''}
    </div>
`;
  }

  html += `
    <h2>Performance History</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Version</th>
                <th>Node.js</th>
                <th>Key Metrics</th>
            </tr>
        </thead>
        <tbody>
`;

  const recentHistory = history.slice(-10).reverse();
  for (const result of recentHistory) {
    const date = new Date(result.timestamp).toLocaleDateString();
    const keyMetrics = Object.values(result.results)
      .filter(r => r.operationsPerSecond)
      .slice(0, 3)
      .map(r => r.operationsPerSecond.toLocaleString())
      .join(', ');

    html += `
            <tr>
                <td>${date}</td>
                <td>${result.version}</td>
                <td>${result.nodeVersion}</td>
                <td>${keyMetrics}</td>
            </tr>
`;
  }

  html += `
        </tbody>
    </table>

    <h2>Performance Guidelines</h2>
    <ul>
        <li><strong>Path Resolution:</strong> Should handle 50,000+ operations per second</li>
        <li><strong>Import Parsing:</strong> Should handle 10,000+ operations per second</li>
        <li><strong>File Processing:</strong> Should handle 10+ files per second</li>
        <li><strong>Memory Usage:</strong> Should stay under 200MB for typical projects</li>
    </ul>

    <p><em>Report generated by import-path-converter performance monitoring</em></p>
</body>
</html>
`;

  await fs.writeFile(path.join(RESULTS_DIR, 'performance-report.html'), html);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, parseTestResults, generateReport };