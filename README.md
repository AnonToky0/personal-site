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

## Deployment

Run from PowerShell with SSH access to `my-aliyun` (override with `-SshHost`). The server requires Bash, GNU tar/coreutils, flock, and non-interactive sudo. Nginx must serve `/var/www/personal-site` and allow symlinks.

Install dependencies with `npm ci` first (Node.js >=22.12.0). The script runs `npm run build`, but does not install dependencies, fetch Git updates, or enforce a clean working tree or branch. Deploy from an up-to-date, clean `main` after changes have been merged. Local tools required on PATH: `npm`, `ssh`, `scp`, and `tar`.

```powershell
./deploy.ps1 -CheckOnly # Check connection, sudo, and prerequisites; no build or activation
./deploy.ps1            # Build, upload a new release, then activate it
./deploy.ps1 -Rollback  # Switch back to the previous release without rebuilding
```

Only built static files are uploaded. Releases are retained under `/var/www/personal-site-releases`; `/var/www/personal-site` points to the active release and `/var/www/personal-site-previous` records the rollback target. Repeated rollback toggles between the last two releases. Old releases are deliberately retained; monitor disk usage and remove obsolete releases only after verifying they are neither active nor the rollback target.

The first deployment preserves an existing real site directory as a legacy release. This initial conversion has a brief switching window; subsequent symlink replacements are atomic. A failed build, upload, or extraction stops the deployment before activation. If SSH disconnects during activation, check the active server symlink before retrying. This script validates files, not public HTTPS responses or Nginx configuration; verify the public site after publication. Failed uploads can leave uniquely named archives in `/tmp`.

### Nginx and HTTPS

`deploy/nginx-http.conf` serves both domains and the ACME webroot `/var/www/letsencrypt`. `deploy/nginx-https.conf` is the final configuration: HTTP and `www` redirect to `https://itworksforme.cn`, preserving the requested path. Install the HTTPS configuration only after the certificate exists at `/etc/letsencrypt/live/itworksforme.cn/`.

Both domains must resolve to the server, and public TCP ports 80/443 must be allowed by the cloud firewall. Keep SSH access separately restricted. Back up the active Nginx configuration before replacing it, run `sudo nginx -t`, then reload Nginx. Certbot webroot validation needs port 80 to remain reachable for renewals.

After certificate issuance, configure a Certbot deploy hook to run `nginx -t && systemctl reload nginx`, enable `certbot.timer`, and verify renewal with `certbot renew --dry-run`. A timer alone does not verify successful renewal.

The deploy hook is tracked at `deploy/reload-nginx.sh`; install it executable at `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`. Use `sudo certbot renew --dry-run --run-deploy-hooks` to test both renewal and Nginx reload. The certificate covers the apex and `www` names. Its private key stays on the server and must never be copied into this repository. The ACME account was registered without a contact email; automatic renewal is managed by the server timer.

## Content

- `src/pages/`: public pages, including the homepage with selected notes and a short introduction.
- `src/dev/fox-preview.astro`: development-only Fox test page at `/fox-preview`; injected by `astro.config.mjs` during `astro dev` and excluded from production builds.
- `src/content/notes/`: Markdown notes.
- `src/layouts/Layout.astro`: shared layout and default site title.
- `src/assets/fox/bluebottle-v1.png`: source artwork for the butterfly favicons in `public/`.
