// Shared helpers for the local photo scripts. These run on Hamza's machine only;
// the Azure build never reads the photo library or generates images.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT = path.join(ROOT, 'src', 'content');
export const IMAGE_EXT = /\.(jpe?g|png|heic)$/i;

export function readToml(name) {
  return parse(fs.readFileSync(path.join(CONTENT, name), 'utf8'));
}

export function photoSource() {
  const src = process.env.PHOTO_SOURCE?.trim().replace(/^"|"$/g, '');
  if (!src) throw new Error('PHOTO_SOURCE is not set. Copy .env.example to .env and point it at the Photos folder.');
  if (!fs.existsSync(src)) throw new Error(`PHOTO_SOURCE does not exist: ${src}`);
  return src;
}

/** Every image directly inside a folder named `_site`, anywhere under the library.
 *  Only directory listings are read here, so cloud-only originals are not downloaded. */
export function findPicks(source) {
  const picks = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === '_site') {
        for (const f of fs.readdirSync(full, { withFileTypes: true })) {
          if (f.isFile() && IMAGE_EXT.test(f.name)) picks.push(path.join(full, f.name));
        }
      } else if (!entry.name.startsWith('.')) {
        walk(full);
      }
    }
  };
  walk(source);
  return picks.sort();
}

export function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

export const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
