// npm run photos
//
// Reads the picked photos (any image directly inside a `_site` folder under PHOTO_SOURCE),
// writes small web versions to src/assets/photos/<id>/ and upserts src/content/photos.json.
// Originals are only read, never copied or modified. Only picked files are opened, so
// OneDrive doesn't download the rest of the library.
//
// Where a photo is, in order:
//   1. folder names: the folder above `_site` is a country ("Netherlands") or a place ("Toronto")
//   2. GPS: nearest trips.toml stop/place in that country within 50 km
//   3. src/content/photo-notes.toml: `city = "..."` for that photo id
//   4. otherwise it is listed as unplaced and captioned with the country name
//
// Idempotent: keyed on a hash of the source path + modified time (+ output settings).
// Un-picked photos have their outputs and entries removed. Ends with a size report.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { ROOT, CONTENT, readToml, photoSource, findPicks, dirSize, mb } from './lib/common.mjs';
import { buildHero } from './hero.mjs';

const OUT = path.join(ROOT, 'src', 'assets', 'photos');
const JSON_PATH = path.join(CONTENT, 'photos.json');
const NOTES_PATH = path.join(CONTENT, 'photo-notes.toml');
const SIZES = { grid: 1200, full: 2000 };
// Grid images are small, so they can afford more quality; lightbox images carry the bytes.
const QUALITY = { grid: { avif: 58, webp: 74 }, full: { avif: 56, webp: 68 } };
const SETTINGS = JSON.stringify([SIZES, QUALITY, 2]);
const GPS_RADIUS_KM = 50;
const WARN_MB = 200;

const source = photoSource();
const trips = readToml('trips.toml');
const notes = fs.existsSync(NOTES_PATH) ? readToml('photo-notes.toml') : {};
const known = [...trips.stop, ...(trips.place ?? [])];
const tripLabels = trips.trips ?? {};
const countryByName = new Map(known.map((s) => [s.country.toLowerCase(), s]));
const placeByName = new Map(known.map((s) => [s.city.toLowerCase(), s]));

const previous = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : { photos: [] };
const prevById = new Map(previous.photos.map((p) => [p.id, p]));
const GPS_CACHE = path.join(OUT, '..', '.photo-gps-cache.json');
const gpsCache = fs.existsSync(GPS_CACHE) ? JSON.parse(fs.readFileSync(GPS_CACHE, 'utf8')) : {};

const picks = findPicks(source);
console.log(`Found ${picks.length} picked photos in _site folders under ${source}\n`);

// ---------- ids: file name, made unique if two folders share one ----------
const stems = new Map();
for (const p of picks) {
  const stem = path.parse(p).name.toLowerCase();
  stems.set(stem, (stems.get(stem) ?? 0) + 1);
}
const idFor = (p) => {
  const stem = path.parse(p).name.toLowerCase();
  if (stems.get(stem) === 1) return stem;
  const h = crypto.createHash('sha1').update(path.relative(source, p)).digest('hex').slice(0, 4);
  return `${stem}-${h}`;
};

// ---------- helpers ----------
const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function locate(rel, gps, id) {
  const parts = rel.split(path.sep);
  const siteIdx = parts.lastIndexOf('_site');
  const folder = parts[siteIdx - 1] ?? '';
  const above = parts.slice(0, siteIdx - 1);
  const trip = above.map((f) => tripLabels[f]).find(Boolean) ?? null;
  const note = notes[id] ?? {};

  // A place folder (Toronto, Rattlesnake Point, Fanshawe Park, Port Stanley)
  const place = placeByName.get(folder.toLowerCase());
  if (place) return { country: place.id, city: place.city, how: 'folder', trip };

  // A country folder: city from GPS, then photo-notes.toml
  const country = countryByName.get(folder.toLowerCase());
  if (!country) return { country: null, city: null, how: 'unassigned', trip, folder };
  if (gps) {
    const near = known
      .filter((s) => s.id === country.id)
      .map((s) => ({ s, d: haversineKm(gps, s) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= GPS_RADIUS_KM) return { country: country.id, city: near.s.city, how: 'gps', trip };
  }
  if (note.city) return { country: country.id, city: note.city, how: 'notes', trip };
  return { country: country.id, city: null, how: 'unplaced', trip, folder };
}

function lensName(model = '', make = '') {
  if (/XF23mm\s*F2/i.test(model)) return 'XF23mm f/2 R WR';
  if (/18-300mm/i.test(model)) return 'Tamron 18–300mm';
  return [make, model].filter(Boolean).join(' ').trim() || null;
}

function shutter(t) {
  if (!t) return null;
  if (t >= 1) return `${+t.toFixed(1)}s`;
  return `1/${Math.round(1 / t)}s`;
}

/** EXIF DateTimeOriginal as the camera's wall-clock time, "YYYY-MM-DDTHH:mm:ss". */
function wallClock(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
  }
  return null;
}

async function writeVariants(file, dir) {
  const files = {};
  const base = sharp(file, { failOn: 'none' }).rotate(); // apply EXIF orientation, then strip everything
  for (const [name, size] of Object.entries(SIZES)) {
    const resized = base.clone().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
    const avif = await resized.clone().avif({ quality: QUALITY[name].avif, effort: 6 }).toBuffer({ resolveWithObject: true });
    const webp = await resized.clone().webp({ quality: QUALITY[name].webp, effort: 5 }).toBuffer({ resolveWithObject: true });
    fs.writeFileSync(path.join(dir, `${name}.avif`), avif.data);
    fs.writeFileSync(path.join(dir, `${name}.webp`), webp.data);
    files[name] = { w: avif.info.width, h: avif.info.height, avif: `${name}.avif`, webp: `${name}.webp` };
  }
  return files;
}

// ---------- main ----------
fs.mkdirSync(OUT, { recursive: true });
const result = [];
const problems = [];
let made = 0;

for (const file of picks) {
  const id = idFor(file);
  const rel = path.relative(source, file);
  const stat = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`${rel}|${stat.mtimeMs}|${SETTINGS}`).digest('hex').slice(0, 16);
  const dir = path.join(OUT, id);
  const prev = prevById.get(id);
  const note = notes[id] ?? {};

  let entry;
  const outputsExist = ['grid.avif', 'grid.webp', 'full.avif', 'full.webp'].every((f) => fs.existsSync(path.join(dir, f)));
  if (prev && prev.key === key && outputsExist) {
    entry = { ...prev, _gps: gpsCache[id] ?? null };
  } else {
    process.stdout.write(`  processing ${rel} ... `);
    const ex =
      (await exifr.parse(file, {
        pick: ['DateTimeOriginal', 'LensModel', 'LensMake', 'Make', 'Model', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'Orientation'],
        reviveValues: false,
        translateValues: false,
      }).catch(() => null)) ?? {};
    const g = await exifr.gps(file).catch(() => null);
    const gps = g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) ? { lat: g.latitude, lon: g.longitude } : null;

    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const files = await writeVariants(file, dir);
    made++;
    const bytes = dirSize(dir);
    console.log(`${(bytes / 1024).toFixed(0)} KB`);

    entry = {
      id,
      key,
      source: rel.split(path.sep).join('/'),
      files,
      width: files.full.w,
      height: files.full.h,
      date: wallClock(ex.DateTimeOriginal),
      exif: {
        camera: ex.Model ? String(ex.Model).trim() : null,
        lens: lensName(ex.LensModel, ex.LensMake),
        focal: ex.FocalLength ? `${Math.round(ex.FocalLength)}mm` : null,
        aperture: ex.FNumber ? `f/${+Number(ex.FNumber).toFixed(1)}` : null,
        shutter: shutter(ex.ExposureTime),
        iso: ex.ISO ? `ISO ${ex.ISO}` : null,
      },
      gps: Boolean(gps), // only whether GPS existed; coordinates are never stored or published
      _gps: gps,
    };
  }

  // Location and the hand-edited fields are recomputed every run, so editing
  // trips.toml or photo-notes.toml takes effect without reprocessing images.
  const gps = entry._gps ?? null;
  const loc = locate(path.join(...entry.source.split('/')), gps, id);
  entry.country = loc.country;
  entry.city = loc.city;
  entry.placed = loc.how;
  entry.trip = loc.trip;
  entry.hasPerson = Boolean(note.person ?? prev?.hasPerson ?? false);
  entry.alt = note.alt ?? `Photo from ${loc.city ?? loc.folder ?? 'the trip'}`;
  entry.altDraft = !note.alt || Boolean(note.draft);
  if (loc.how === 'unplaced' || loc.how === 'unassigned') problems.push({ id, source: entry.source, how: loc.how });
  result.push(entry);
}

// ---------- remove un-picked ----------
const keep = new Set(result.map((p) => p.id));
let removed = 0;
for (const dir of fs.readdirSync(OUT)) {
  if (!keep.has(dir)) {
    fs.rmSync(path.join(OUT, dir), { recursive: true, force: true });
    removed++;
  }
}

result.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
const publicEntries = result.map(({ _gps, ...rest }) => rest);
// _gps is kept only in a gitignored cache so city lookups survive re-runs without re-reading EXIF.
fs.writeFileSync(GPS_CACHE, JSON.stringify(Object.fromEntries(result.map((p) => [p.id, p._gps ?? null]))));
fs.writeFileSync(JSON_PATH, JSON.stringify({ generated: 'npm run photos', photos: publicEntries }, null, 2) + '\n');

await buildHero({ source, picks });

// ---------- report ----------
const photosBytes = dirSize(OUT);
const heroBytes = dirSize(path.join(ROOT, 'src', 'assets', 'hero'));
const distDir = path.join(ROOT, 'dist');
const codeBytes = fs.existsSync(distDir)
  ? Math.max(0, dirSize(distDir) - photosBytes - heroBytes)
  : 3 * 1024 * 1024;
const projected = photosBytes + heroBytes + codeBytes;

console.log('\n---------- photo report ----------');
console.log(`Picked:      ${result.length} (${made} processed, ${result.length - made} unchanged, ${removed} removed)`);
const byHow = result.reduce((m, p) => ((m[p.placed] = (m[p.placed] ?? 0) + 1), m), {});
console.log(`Placed by:   ${Object.entries(byHow).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`Photos:      ${mb(photosBytes)} in src/assets/photos (${(photosBytes / 1024 / Math.max(1, result.length)).toFixed(0)} KB per photo)`);
console.log(`Hero:        ${mb(heroBytes)}`);
console.log(`Projected deployed site: ${mb(projected)} (keep it under ~200 MB)`);
if (projected > WARN_MB * 1024 * 1024) {
  console.log(`\n!! WARNING: the site would be over ${WARN_MB} MB. Un-pick some photos or move them to a CDN (PHOTO_CDN_URL).`);
}
const drafts = result.filter((p) => p.altDraft).length;
if (drafts) console.log(`Alt text:    ${drafts} still draft (edit src/content/photo-notes.toml)`);
if (problems.length) {
  console.log(`\nUnplaced (${problems.length}): add  [<id>] city = "..."  to src/content/photo-notes.toml`);
  for (const p of problems) console.log(`  ${p.id.padEnd(12)} ${p.source}${p.how === 'unassigned' ? '  (folder is not a known country or place)' : ''}`);
}
