#!/usr/bin/env node

/**
 * Migration Script for SolidWorks MCP Server Refactoring
 * Automates common refactoring tasks
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { execSync } from 'child_process';

// ============================================
// CONFIGURATION
// ============================================

const config = {
  srcDir: join(process.cwd(), 'src'),
  fixesDir: join(process.cwd(), 'Fixes-V2'),
  backupDir: join(process.cwd(), 'backup'),
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// ============================================
// UTILITIES
// ============================================

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = {
    info: '✅',
    warn: '⚠️',
    error: '❌',
  }[level];
  
  console.log(`${prefix} ${message}`);
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`);
  }
}

function backup(filePath: string) {
  if (existsSync(filePath)) {
    const backupPath = join(
      config.backupDir,
      `${basename(filePath)}.${Date.now()}.bak`
    );
    ensureDir(dirname(backupPath));
    
    if (!config.dryRun) {
      const content = readFileSync(filePath, 'utf-8');
      writeFileSync(backupPath, content);
    }
    
    log(`Backed up: ${filePath} → ${backupPath}`);
  }
}

// ============================================
// REFACTORING TASKS
// ============================================

/**
 * Task 1: Create new folder structure
 */
function createFolderStructure() {
  log('Creating new folder structure...', 'info');
  
  const folders = [
    'core/entities',
    'core/value-objects',
    'core/errors',
    'core/interfaces',
    'application/use-cases',
    'application/services',
    'application/dto',
    'application/mappers',
    'infrastructure/solidworks',
    'infrastructure/repositories',
    'infrastructure/config',
    'infrastructure/logging',
    'presentation/mcp',
    'presentation/validators',
    'presentation/transformers',
    'shared/types',
    'shared/constants',
    'shared/utils',
  ];

  for (const folder of folders) {
    const fullPath = join(config.srcDir, folder);
    if (!config.dryRun) {
      ensureDir(fullPath);
    } else {
      log(`Would create: ${fullPath}`, 'info');
    }
  }
}

/**
 * Task 2: Copy core files from Fixes-V2
 */
function copyCoreFiles() {
  log('Copying core files...', 'info');
  
  const fileMappings = [
    ['core-abstractions.ts', 'core/interfaces/abstractions.ts'],
    ['solidworks-constants.ts', 'shared/constants/solidworks.ts'],
    ['solidworks-adapter.ts', 'infrastructure/solidworks/adapter.ts'],
    ['configuration-manager.ts', 'infrastructure/config/manager.ts'],
    ['refactored-modeling-tools.ts', 'application/use-cases/modeling.ts'],
  ];

  for (const [source, dest] of fileMappings) {
    const sourcePath = join(config.fixesDir, source);
    const destPath = join(config.srcDir, dest);
    
    if (existsSync(sourcePath)) {
      if (!config.dryRun) {
        ensureDir(dirname(destPath));
        const content = readFileSync(sourcePath, 'utf-8');
        writeFileSync(destPath, content);
      }
      log(`Copied: ${source} → ${dest}`);
    } else {
      log(`Source file not found: ${source}`, 'warn');
    }
  }
}

/**
 * Task 3: Replace 'any' types with 'unknown'
 */
function replaceAnyTypes() {
  log('Replacing "any" types with "unknown"...', 'info');
  
  const processFile = (filePath: string) => {
    if (!filePath.endsWith('.ts')) return;
    
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let modified = false;
    
    const newLines = lines.map(line => {
      // Skip if it's a comment or import
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return line;
      }
      
      // Replace : any with : unknown
      if (line.includes(': any')) {
        modified = true;
        return line.replace(/: any/g, ': unknown /* TODO: Add proper type */');
      }
      
      return line;
    });

    if (modified) {
      backup(filePath);
      if (!config.dryRun) {
        writeFileSync(filePath, newLines.join('\n'));
      }
      log(`Updated types in: ${basename(filePath)}`);
    }
  };

  const scanDir = (dir: string) => {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('node_modules')) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        processFile(fullPath);
      }
    }
  };

  scanDir(config.srcDir);
}

/**
 * Task 4: Extract magic numbers
 */
function extractMagicNumbers() {
  log('Extracting magic numbers...', 'info');
  
  const magicNumbers = new Map<string, Set<string>>();
  
  const processFile = (filePath: string) => {
    if (!filePath.endsWith('.ts')) return;
    
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Pattern to find numeric literals (excluding 0, 1, -1)
    const numberPattern = /\b(?!0\b|1\b|-1\b)(-?\d+(?:\.\d+)?)\b/g;
    
    lines.forEach((line, index) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return;
      }
      
      const matches = line.matchAll(numberPattern);
      for (const match of matches) {
        const num = match[1];
        if (!magicNumbers.has(filePath)) {
          magicNumbers.set(filePath, new Set());
        }
        magicNumbers.get(filePath)!.add(`Line ${index + 1}: ${num} in "${line.trim()}"`);
      }
    });
  };

  const scanDir = (dir: string) => {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('node_modules')) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        processFile(fullPath);
      }
    }
  };

  scanDir(config.srcDir);

  // Generate report
  if (magicNumbers.size > 0) {
    let report = '# Magic Numbers Report\n\n';
    for (const [file, numbers] of magicNumbers) {
      report += `## ${basename(file)}\n`;
      for (const num of numbers) {
        report += `- ${num}\n`;
      }
      report += '\n';
    }
    
    const reportPath = join(config.fixesDir, 'magic-numbers-report.md');
    if (!config.dryRun) {
      writeFileSync(reportPath, report);
    }
    log(`Magic numbers report saved to: ${reportPath}`);
  }
}

/**
 * Task 5: Add TypeScript strict checks
 */
function updateTsConfig() {
  log('Updating TypeScript configuration...', 'info');
  
  const tsconfigPath = join(process.cwd(), 'tsconfig.json');
  
  if (!existsSync(tsconfigPath)) {
    log('tsconfig.json not found', 'error');
    return;
  }

  backup(tsconfigPath);
  
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  
  // Add strict checks
  tsconfig.compilerOptions = {
    ...tsconfig.compilerOptions,
    strict: true,
    noImplicitAny: true,
    strictNullChecks: true,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    strictPropertyInitialization: true,
    noImplicitThis: true,
    alwaysStrict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedIndexedAccess: true,
  };

  if (!config.dryRun) {
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
  }
  
  log('Updated tsconfig.json with strict checks');
}

/**
 * Task 6: Generate migration report
 */
function generateMigrationReport() {
  log('Generating migration report...', 'info');
  
  const report = {
    timestamp: new Date().toISOString(),
    filesProcessed: 0,
    anyTypesFound: 0,
    magicNumbersFound: 0,
    recommendations: [] as string[],
  };

  // Count TypeScript files
  const countFiles = (dir: string): number => {
    if (!existsSync(dir)) return 0;
    
    let count = 0;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('node_modules')) {
        count += countFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        count++;
        
        // Check for any types
        const content = readFileSync(fullPath, 'utf-8');
        const anyMatches = content.match(/: any/g);
        if (anyMatches) {
          report.anyTypesFound += anyMatches.length;
        }
      }
    }
    return count;
  };

  report.filesProcessed = countFiles(config.srcDir);

  // Add recommendations
  if (report.anyTypesFound > 0) {
    report.recommendations.push(
      `Replace ${report.anyTypesFound} "any" types with proper types`
    );
  }

  report.recommendations.push(
    'Add unit tests for all refactored components',
    'Set up CI/CD pipeline',
    'Configure linting and formatting',
    'Add pre-commit hooks',
    'Document API changes'
  );

  const reportPath = join(config.fixesDir, 'migration-report.json');
  if (!config.dryRun) {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  
  log(`Migration report saved to: ${reportPath}`);
  
  // Print summary
  console.log('\n📊 Migration Summary:');
  console.log(`   Files processed: ${report.filesProcessed}`);
  console.log(`   Any types found: ${report.anyTypesFound}`);
  console.log(`   Recommendations: ${report.recommendations.length}`);
}

/**
 * Task 7: Install dependencies
 */
function installDependencies() {
  log('Installing dependencies...', 'info');
  
  const dependencies = [
    'zod@^3.23.8',
    'winston@^3.15.0',
    'dotenv@^16.4.5',
  ];

  const devDependencies = [
    '@types/node@^22.5.1',
    'typescript@^5.5.4',
    'vitest@^1.2.1',
    '@vitest/ui@^1.2.1',
    'tsx@^4.7.0',
    'eslint@^9.35.0',
    '@typescript-eslint/eslint-plugin@^8.4.0',
    '@typescript-eslint/parser@^8.4.0',
    'prettier@^3.3.3',
  ];

  if (!config.dryRun) {
    log('Installing production dependencies...');
    execSync(`npm install ${dependencies.join(' ')}`, { stdio: 'inherit' });
    
    log('Installing dev dependencies...');
    execSync(`npm install -D ${devDependencies.join(' ')}`, { stdio: 'inherit' });
  } else {
    log('Would install dependencies:', 'info');
    console.log('  Production:', dependencies.join(', '));
    console.log('  Development:', devDependencies.join(', '));
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('🚀 SolidWorks MCP Server Migration Script');
  console.log('==========================================\n');
  
  if (config.dryRun) {
    console.log('🔍 Running in DRY RUN mode (no changes will be made)\n');
  }

  // Parse command line arguments
  const tasks = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  
  const availableTasks = {
    'structure': createFolderStructure,
    'copy': copyCoreFiles,
    'types': replaceAnyTypes,
    'numbers': extractMagicNumbers,
    'tsconfig': updateTsConfig,
    'report': generateMigrationReport,
    'deps': installDependencies,
    'all': async () => {
      await createFolderStructure();
      await copyCoreFiles();
      await replaceAnyTypes();
      await extractMagicNumbers();
      await updateTsConfig();
      await installDependencies();
      await generateMigrationReport();
    },
  };

  if (tasks.length === 0) {
    console.log('Usage: npm run migrate [task] [options]\n');
    console.log('Tasks:');
    console.log('  structure  - Create new folder structure');
    console.log('  copy       - Copy core files from Fixes-V2');
    console.log('  types      - Replace "any" with "unknown"');
    console.log('  numbers    - Extract magic numbers');
    console.log('  tsconfig   - Update TypeScript config');
    console.log('  report     - Generate migration report');
    console.log('  deps       - Install dependencies');
    console.log('  all        - Run all tasks\n');
    console.log('Options:');
    console.log('  --dry-run  - Preview changes without making them');
    console.log('  --verbose  - Show detailed output\n');
    return;
  }

  for (const task of tasks) {
    if (task in availableTasks) {
      console.log(`\n📋 Running task: ${task}`);
      console.log('─'.repeat(40));
      await availableTasks[task as keyof typeof availableTasks]();
    } else {
      log(`Unknown task: ${task}`, 'error');
    }
  }

  console.log('\n✨ Migration script completed!');
  
  if (config.dryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

export { main };
