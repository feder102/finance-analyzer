# Deployment

`finance-analyzer` publishes its static web app to GitHub Pages.

## How deployment works

1. A push to `main` triggers [/.github/workflows/pages.yml](/Users/adanos/src/finance-analyzer/.github/workflows/pages.yml#L1).
2. The workflow validates Go code, web unit tests, and the public sensitive-artifact guard.
3. The publishable site is assembled by [/scripts/build-pages-output.sh](/Users/adanos/src/finance-analyzer/scripts/build-pages-output.sh#L1) into `dist/pages/`.
4. GitHub Pages deploys that artifact.
5. A lightweight post-deploy verification checks the live Pages URL after the deployment finishes.

## Live site

- [https://alechan.github.io/finance-analyzer/](https://alechan.github.io/finance-analyzer/)

## What the GitHub Actions post-deploy check verifies

The GitHub Actions post-deploy check is intentionally lightweight. It is meant to catch real publish and packaging regressions on the live GitHub Pages site without depending on a full browser boot in the runner.

It checks:
1. the deployed site becomes reachable,
2. key same-origin published assets are reachable from the live Pages URL,
3. the public demo data and browser-visible runtime files are present at the deployed location.

It intentionally does not require a complete browser boot or full success from the external Highcharts CDN, because automated environments may receive `403` responses from `code.highcharts.com` even when the deployed site itself is packaged correctly.

## Complete deployed test for local/manual use

For a fuller end-to-end check, run the deployed Playwright smoke locally against either:
1. the live GitHub Pages URL, or
2. a local Pages-style artifact served from `dist/pages/`

This local/manual check is stricter than the GitHub Actions one because it opens the site in a browser and waits for the app to finish booting.

## Local validation before pushing

From the repo root:

```bash
go test ./...
bash scripts/build-pages-output.sh
cd web
npm install
npm run test:unit
npm run guard:oss-sensitive
npm run test:smoke
```

To run the lightweight deployed check locally against the live site:

```bash
PLAYWRIGHT_BASE_URL=https://alechan.github.io/finance-analyzer/ npm --prefix web run verify:pages:light
```

To run the complete deployed-site smoke locally against the live site:

```bash
PLAYWRIGHT_BASE_URL=https://alechan.github.io/finance-analyzer/ PLAYWRIGHT_SKIP_WEBSERVER=1 npm --prefix web run test:smoke:deployed
```

To run the complete deployed-site smoke locally against a built Pages artifact:

```bash
bash scripts/build-pages-output.sh
node web/scripts/serve-no-store.mjs --root dist/pages --port 8787 --host 127.0.0.1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8787/ PLAYWRIGHT_SKIP_WEBSERVER=1 npm --prefix web run test:smoke:deployed
```
