import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { getNavigationForRole } from '../appShell.js';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const iconSource = readFileSync(new URL('./Icons.jsx', import.meta.url), 'utf8');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

function literalIconNames(source) {
  const names = [];
  const patterns = [
    /<Icon\b[^>]*\bname=["']([^"']+)["']/g,
    /\b(?:leftIcon|rightIcon)=["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    names.push(...Array.from(source.matchAll(pattern), (match) => match[1]));
  }
  return names;
}

describe('custom icon registry', () => {
  it('contains every statically referenced icon name', () => {
    const registryNames = new Set(
      Array.from(iconSource.matchAll(/^  ([A-Za-z][A-Za-z0-9]*): \($/gm), (match) => match[1])
    );
    const navigationNames = ['admin', 'teacher', 'student'].flatMap((role) => (
      getNavigationForRole(role).flatMap((group) => group.items.map((item) => item.icon))
    ));
    const referencedNames = new Set([
      ...sourceFiles(sourceRoot).flatMap((file) => literalIconNames(readFileSync(file, 'utf8'))),
      ...navigationNames,
    ]);

    const missing = [...referencedNames].filter((name) => !registryNames.has(name)).sort();
    assert.deepEqual(missing, []);
  });

  it('uses only coordinate pairs in polyline and polygon points', () => {
    const invalid = Array.from(
      iconSource.matchAll(/<(?:polyline|polygon)\b[^>]*\bpoints="([^"]*)"/g),
      (match) => match[1]
    ).filter((points) => /[A-Za-z]/.test(points));

    assert.deepEqual(invalid, []);
  });
});
