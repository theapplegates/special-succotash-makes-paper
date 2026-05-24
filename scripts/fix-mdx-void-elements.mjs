#!/usr/bin/env node
/**
 * Fixes void HTML elements in MDX files that are missing self-closing />.
 * In MDX (JSX), void elements like <source> and <img> must use /> not >.
 *
 * Usage:
 *   node scripts/fix-mdx-void-elements.mjs src/content/essay/dad.mdx
 *   node scripts/fix-mdx-void-elements.mjs src/content/**\/*.mdx   (shell expands glob)
 */

import { readFileSync, writeFileSync } from 'fs';

const VOID_ELEMENTS = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr';
const RE = new RegExp(`(<(?:${VOID_ELEMENTS})\\b[^>]*?)(?<!/)>`, 'gs');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: fix-mdx-void-elements.mjs <file.mdx> [file2.mdx ...]');
  process.exit(1);
}

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  const fixed = original.replace(RE, '$1/>');
  if (fixed !== original) {
    writeFileSync(file, fixed);
    console.log(`Fixed: ${file}`);
  } else {
    console.log(`OK (no changes): ${file}`);
  }
}
