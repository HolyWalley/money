# Icon sources

`icon-source.svg` and `icon-maskable-source.svg` are the design sources the PNG
icons in `public/` are exported from (`icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`).

They live here rather than in `public/` because everything in `public/` is
copied into the deployed asset directory and precached by the service worker;
these files are referenced by neither `index.html` nor the webmanifest, so
shipping them only costs every user's cache.
