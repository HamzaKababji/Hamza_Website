// Builds the home hero crops (desktop and mobile) from the original named in
// src/content/site.toml. Run on its own with `npm run hero`, or as part of `npm run photos`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ROOT, readToml, photoSource, findPicks } from './lib/common.mjs';

const OUT = path.join(ROOT, 'src', 'assets', 'hero');
const VARIANTS = {
  desktop: [1000, 1600],
  mobile: [640, 1080],
};
const QUALITY = { avif: 62, webp: 82 };

export async function buildHero({ source = photoSource(), picks = findPicks(source), force = false } = {}) {
  const { hero } = readToml('site.toml');
  const match = picks.find((p) => path.parse(p).name.toLowerCase() === hero.file.toLowerCase());
  if (!match) throw new Error(`Hero photo ${hero.file} is not in any _site folder.`);

  const stat = fs.statSync(match);
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify([path.relative(source, match), stat.mtimeMs, hero.desktop_crop, hero.mobile_crop, VARIANTS, QUALITY]))
    .digest('hex')
    .slice(0, 12);
  const manifestPath = path.join(OUT, 'hero.json');
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (!force && previous?.key === key) {
    console.log(`hero: ${hero.file} unchanged, skipping`);
    return previous;
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const base = sharp(match).rotate();
  // metadata() reports the stored size; swap for 90° EXIF orientations.
  const m = await sharp(match).metadata();
  const [W, H] = (m.orientation ?? 1) >= 5 ? [m.height, m.width] : [m.width, m.height];

  const manifest = { key, file: hero.file, crops: {} };
  for (const [name, widths] of Object.entries(VARIANTS)) {
    const [l, t, w, h] = hero[`${name}_crop`];
    const box = {
      left: Math.round(l * W),
      top: Math.round(t * H),
      width: Math.round(w * W),
      height: Math.round(h * H),
    };
    const cropped = await base.clone().extract(box).toBuffer();
    const files = [];
    for (const width of widths) {
      const resized = sharp(cropped).resize({ width, withoutEnlargement: true });
      const avif = `${name}-${width}.avif`;
      const webp = `${name}-${width}.webp`;
      await resized.clone().avif({ quality: QUALITY.avif, effort: 6 }).toFile(path.join(OUT, avif));
      await resized.clone().webp({ quality: QUALITY.webp }).toFile(path.join(OUT, webp));
      files.push({ width, avif, webp });
    }
    manifest.crops[name] = { width: box.width, height: box.height, files };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`hero: wrote desktop and mobile crops of ${hero.file}`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildHero({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
