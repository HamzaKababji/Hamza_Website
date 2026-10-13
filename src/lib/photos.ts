// Gallery data from src/content/photos.json (written by `npm run photos`).
const found = import.meta.glob('../content/photos.json', { eager: true, import: 'default' }) as Record<string, any>;
const data = found['../content/photos.json'] ?? { photos: [] };

export const allPhotos: any[] = data.photos;

export const photoStats = {
  total: allPhotos.length,
  countries: new Set(allPhotos.map((p) => p.country)).size,
};
