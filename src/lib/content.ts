// Build-time readers for the .toml content files. The raw text is kept too,
// so the Now and Garage pages can show the file itself.
import { parse } from 'smol-toml';
import { geoDistance } from 'd3-geo';
import siteRaw from '../content/site.toml?raw';
import tripsRaw from '../content/trips.toml?raw';
import nowRaw from '../content/now.toml?raw';
import garageRaw from '../content/garage.toml?raw';

export interface Stop {
  id: string;
  city: string;
  country: string;
  iso?: string;
  lon: number;
  lat: number;
  note?: string;
}

export interface SiteConfig {
  hero: {
    file: string;
    focus: string;
    mobile_focus: string;
    alt: string;
  };
  specs: Record<'based_in' | 'studying' | 'building' | 'shooting', string>;
}

export const site = parse(siteRaw) as unknown as SiteConfig;

const tripsData = parse(tripsRaw) as unknown as { stop: Stop[]; place?: Stop[]; trips?: Record<string, string> };
export const stops: Stop[] = tripsData.stop;
export const places: Stop[] = tripsData.place ?? [];
export const tripLabels: Record<string, string> = tripsData.trips ?? {};

const EARTH_KM = 6371;
export const kmBetween = (a: Stop, b: Stop) => geoDistance([a.lon, a.lat], [b.lon, b.lat]) * EARTH_KM;
export const routeKm = stops.slice(1).reduce((sum, s, i) => sum + kmBetween(stops[i], s), 0);

/** Country id -> display name, from the route and the extra places. */
export const countryNames: Record<string, string> = Object.fromEntries(
  [...stops, ...places].map((s) => [s.id, s.country]),
);

export const nowRawText = nowRaw;
export const now = parse(nowRaw) as any;
export const garageRawText = garageRaw;
export const garage = parse(garageRaw) as any;

import workRaw from '../content/work.toml?raw';
export const work = parse(workRaw) as any;

/** The trailing `# comment` on a key (or on a [table] header when key is omitted) in a raw TOML file. */
export function tomlComment(raw: string, table: string, key?: string): string {
  let current = '';
  for (const line of raw.split(/\r?\n/)) {
    const h = /^\s*\[([^\]]+)\]\s*(?:#\s*(.*))?$/.exec(line);
    if (h) {
      current = h[1].trim();
      if (!key && current === table) return h[2]?.trim() ?? '';
      continue;
    }
    if (key && current === table) {
      const kv = new RegExp(`^\\s*${key}\\s*=.*?#\\s*(.*)$`).exec(line);
      if (kv && !/^\s*#/.test(line)) return kv[1].trim();
    }
  }
  return '';
}
