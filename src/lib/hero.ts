// URLs for the committed hero crops (made locally by `npm run hero`).
import manifest from '../assets/hero/hero.json';

const urls = import.meta.glob('../assets/hero/*.{avif,webp}', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;
const url = (file: string) => urls[`../assets/hero/${file}`];

function srcset(name: 'desktop' | 'mobile', fmt: 'avif' | 'webp') {
  return manifest.crops[name].files.map((f) => `${url(f[fmt])} ${f.width}w`).join(', ');
}

export const hero = {
  desktop: {
    avif: srcset('desktop', 'avif'),
    webp: srcset('desktop', 'webp'),
    width: manifest.crops.desktop.width,
    height: manifest.crops.desktop.height,
    fallback: url(manifest.crops.desktop.files[0].webp),
  },
  mobile: {
    avif: srcset('mobile', 'avif'),
    webp: srcset('mobile', 'webp'),
    width: manifest.crops.mobile.width,
    height: manifest.crops.mobile.height,
  },
};
