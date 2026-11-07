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

- `src/pages/`: public pages, including the homepage with selected notes and a short introduction.
- `src/dev/fox-preview.astro`: development-only Fox test page at `/fox-preview`; injected by `astro.config.mjs` during `astro dev` and excluded from production builds.
- `src/content/notes/`: Markdown notes.
- `src/layouts/Layout.astro`: shared layout and default site title.
- `src/assets/fox/bluebottle-v1.png`: source artwork for the butterfly favicons in `public/`.
