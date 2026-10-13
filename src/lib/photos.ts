// Gallery data from src/content/photos.json (written locally by `npm run photos`).
// Image URLs go through photoUrl(), so the web versions can later move to object
// storage by setting PHOTO_CDN_URL at build time, without touching any page.
import { stops, places, countryNames, tripLabels } from './content';

export interface PhotoFile {
  w: number;
  h: number;
  avif: string;
  webp: string;
}

export interface Photo {
  id: string;
  source: string;
  files: { grid: PhotoFile; full: PhotoFile };
  width: number;
  height: number;
  date: string | null;
  exif: {
    camera: string | null;
    lens: string | null;
    focal: string | null;
    aperture: string | null;
    shutter: string | null;
    iso: string | null;
  };
  country: string | null;
  city: string | null;
  placed: string;
  trip: string | null;
  hasPerson: boolean;
  alt: string;
  altDraft: boolean;
}

const found = import.meta.glob('../content/photos.json', { eager: true, import: 'default' }) as Record<string, any>;
const data = (found['../content/photos.json'] ?? { photos: [] }) as { photos: Photo[] };

export const allPhotos: Photo[] = data.photos.filter((p) => p.country);

const localUrls = import.meta.glob('../assets/photos/*/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const CDN = (import.meta.env.PHOTO_CDN_URL || '').replace(/\/$/, '');

export function photoUrl(id: string, file: string): string {
  if (CDN) return `${CDN}/${id}/${file}`;
  const url = localUrls[`../assets/photos/${id}/${file}`];
  if (!url) throw new Error(`Missing photo file ${id}/${file}. Run npm run photos.`);
  return url;
}

export function srcset(p: Photo, fmt: 'avif' | 'webp') {
  return (['grid', 'full'] as const).map((k) => `${photoUrl(p.id, p.files[k][fmt])} ${p.files[k].w}w`).join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09-03T14:02:11" -> "3 Sep" or "3 Sep 2026". Camera wall-clock, no time zone maths. */
export function formatDate(date: string | null, withYear = false) {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export const cityLabel = (p: Photo) => p.city ?? countryNames[p.country ?? ''] ?? '';

/** Countries with photos, in route order (by each country's last stop), with counts. */
export function countryFilters() {
  const lastIndex = new Map<string, number>();
  [...stops, ...places].forEach((s, i) => lastIndex.set(s.id, i < stops.length ? i : lastIndex.get(s.id) ?? i));
  const counts = new Map<string, number>();
  for (const p of allPhotos) counts.set(p.country!, (counts.get(p.country!) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (lastIndex.get(a[0]) ?? 99) - (lastIndex.get(b[0]) ?? 99))
    .map(([id, count]) => {
      const cities = new Map<string, number>();
      for (const p of allPhotos) if (p.country === id) cities.set(cityLabel(p), (cities.get(cityLabel(p)) ?? 0) + 1);
      return { id, name: countryNames[id] ?? id, count, cities: [...cities.entries()].map(([name, n]) => ({ name, label: name === countryNames[id] ? 'Elsewhere' : name, count: n })) };
    });
}

export const photoStats = {
  total: allPhotos.length,
  countries: new Set(allPhotos.map((p) => p.country)).size,
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export { tripLabels };
