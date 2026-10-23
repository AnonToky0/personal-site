# It works for me.

Personal website built with Astro, with notes, projects, and an animated fox companion.

## Development

```sh
npm install
npm run dev -- --background
```

Manage the background server with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## Commands

- `npm run build`: build the site into `dist/`.
- `npm run preview`: preview the production build.
- `npm test`: run the interaction and motion tests.

## Content

- `src/pages/`: site pages; the home page currently contains only the shared layout.
- `src/content/notes/`: Markdown notes.
- `src/layouts/Layout.astro`: shared layout and default site title.
- `src/assets/fox/bluebottle-v1.png`: source artwork for the butterfly favicons in `public/`.
