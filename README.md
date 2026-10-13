# hamzakababji.com

Static Astro site, deployed to Azure Static Web Apps by the GitHub workflow on every push to `main`
(the workflow builds with `npm run build` and serves `dist/`).

## Layout

The home page is the whole site in one scroll: hero, the globe (Places), the photos it leads to,
and the Garage. Click a ringed city on the globe to filter the photos to it. **Now** slides out from
the left on every page, and **Work** (the résumé) is its own page at /work. The old /photos, /places,
/garage and /now URLs redirect to the matching part of the home page.

## Run it

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # what Azure runs; check it passes before pushing
```

## Edit content

Everything you'd normally change is a file in `src/content/`:

| File | Page |
| --- | --- |
| `site.toml` | Hero: photo, crops, focal points, spec row |
| `trips.toml` | The globe: the route in driving order, plus gallery-only places |
| `now.toml` | The Now panel (bump `updated`) |
| `garage.toml` | The Garage. Trailing `# comments` show up on the tags |
| `work.toml` | /work, the résumé. Never add a phone number or address |
| `photo-notes.toml` | Per-photo alt text, city and `person` flag |

## Add or remove photos

1. In the OneDrive photo library, put the picks in a folder named `_site`
   (`Photos/<Country or Place>/_site/`). Remove a file from `_site` to un-pick it.
2. Copy `.env.example` to `.env` once and check `PHOTO_SOURCE`.
3. Run `npm run photos`. It reads only the `_site` images (never copies or changes originals),
   writes small AVIF/WebP versions to `src/assets/photos/`, updates `src/content/photos.json`,
   rebuilds the hero crops if needed, and prints a size report and any photos it couldn't place.
4. For unplaced photos, add `city = "..."` under the photo's id in `photo-notes.toml` and run it again.
   Write or check the alt text there too, and delete `draft = true` once it's right.
5. Commit `src/assets/photos`, `photos.json` and `photo-notes.toml`, then push.

Changed a hero crop in `site.toml`? Run `npm run hero`.

If the photos ever outgrow the Azure free tier (the report warns past 200 MB), upload `src/assets/photos/`
to object storage and set `PHOTO_CDN_URL` for the build; the pages pick it up without code changes.
