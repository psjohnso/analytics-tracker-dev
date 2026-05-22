#!/usr/bin/env node
/*
 * stamp-version.js — cache-bust automation.
 *
 * Rewrites every local `src/...` script and stylesheet reference in index.html
 * with the current APP_VERSION (read from src/constants.js), so cache-busting
 * is a single edit (bump APP_VERSION) plus one command — instead of hand-bumping
 * each `?v=` string and risking "forgot to bump one" stale-cache bugs.
 *
 * Deploy workflow:
 *   1. Make your code changes.
 *   2. Bump APP_VERSION in src/constants.js.
 *   3. node scripts/stamp-version.js
 *   4. Commit and push.
 *
 * Every local asset is stamped to the same APP_VERSION, so a deploy busts all
 * caches at once — simple and impossible to forget. (Switch to per-file content
 * hashes later if re-fetching unchanged files ever becomes a concern.)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const constants = fs.readFileSync(path.join(root, 'src', 'constants.js'), 'utf8');
const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!match) {
  console.error('stamp-version: could not find APP_VERSION in src/constants.js');
  process.exit(1);
}
const version = match[1];

const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

let count = 0;
html = html.replace(/((?:src|href)="src\/[^"?]+)(?:\?v=[^"]*)?"/g, function (_m, base) {
  count++;
  return base + '?v=' + version + '"';
});

fs.writeFileSync(indexPath, html);
console.log('stamp-version: stamped ' + count + ' local asset refs in index.html with v=' + version);
