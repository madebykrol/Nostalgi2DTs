#!/usr/bin/env node

/**
 * Validates all JSON content files in the projectsite
 * Run with: node validate-content.cjs
 */

const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, 'public', 'content');
let errors = 0;
let validated = 0;

function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    console.log('✓', path.relative(contentDir, filePath));
    validated++;
    return true;
  } catch (error) {
    console.error('✗', path.relative(contentDir, filePath));
    console.error('  Error:', error.message);
    errors++;
    return false;
  }
}

function scanDirectory(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.name.endsWith('.json')) {
        validateJSON(fullPath);
      }
    }
  } catch (error) {
    console.error('✗ Error reading directory:', path.relative(contentDir, dir));
    console.error('  Error:', error.message);
    errors++;
  }
}

console.log('Validating JSON content files...\n');
scanDirectory(contentDir);

console.log('\n' + '='.repeat(50));
console.log(`Validated: ${validated} files`);
console.log(`Errors: ${errors} files`);
console.log('='.repeat(50));

process.exit(errors > 0 ? 1 : 0);
