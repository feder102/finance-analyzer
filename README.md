# finance-analyzer

`finance-analyzer` helps you extract structured CSV data from supported credit-card statement PDFs and explore the results in a local-first web app. Today it is focused on spending, debt, categories, owners, and data-quality checks.

## What can I use it for?

You can:
1. extract statement data from supported PDFs,
2. review the results in a browser without uploading your financial data to a backend,
3. keep working with your own CSVs and workspace state locally.

## Which statements are supported?

The CLI currently supports only:
1. `Santander`
2. `Visa Prisma`

If your PDFs come from a different bank, this repo will not parse them correctly without code changes.

## How do I install the CLI?

Install it once with Go:

```bash
go install github.com/Alechan/finance-analyzer/pkg/cmd/finpdf2csv@latest

# add it if not already added
export PATH="$(go env GOPATH)/bin:$PATH"

finpdf2csv --help
```

If you want that `PATH` change to persist, add the same `export` line to your shell profile, for example `~/.zshrc`. If `finpdf2csv` is still not on your `PATH`, run it from your Go bin directory instead. On many setups that is `$(go env GOPATH)/bin`.

## How do I extract a PDF?

From the folder that already contains your PDFs:

```bash
ls -1
# 2025-03-santander.pdf

finpdf2csv --bank santander 2025-03-santander.pdf

ls -1
# 2025-03-santander.pdf
# 2025-03-santander.pdf.csv
```

Multiple PDFs plus one combined CSV:

```bash
ls -1
# 2025-02-21-Santander-AMEX.pdf
# 2025-02-21-Santander-VISA.pdf
# 2025-03-21-Santander-AMEX.pdf
# 2025-03-21-Santander-VISA.pdf

finpdf2csv --bank santander --join-csvs COMBINED.csv \
  2025-02-21-Santander-AMEX.pdf \
  2025-02-21-Santander-VISA.pdf \
  2025-03-21-Santander-AMEX.pdf \
  2025-03-21-Santander-VISA.pdf

ls -1
# 2025-02-21-Santander-AMEX.pdf
# 2025-02-21-Santander-AMEX.pdf.csv
# 2025-02-21-Santander-VISA.pdf
# 2025-02-21-Santander-VISA.pdf.csv
# 2025-03-21-Santander-AMEX.pdf
# 2025-03-21-Santander-AMEX.pdf.csv
# 2025-03-21-Santander-VISA.pdf
# 2025-03-21-Santander-VISA.pdf.csv
# COMBINED.csv
```

The CLI writes one `.csv` next to each input PDF. When you pass `--join-csvs`, it also writes the combined file you requested.

## How do I use the website?

The fastest way to see the app is the hosted demo:

- [https://alechan.github.io/finance-analyzer/](https://alechan.github.io/finance-analyzer/)

To run it locally from this repo:

```bash
cd web
npm install
npm run build:wasm
python3 -m http.server 8080 -d .
```

Then open:

- `http://localhost:8080`

The public site loads demo/public data by default. To replace it with your own CSVs:

1. Open `Settings` in the left sidebar.
2. In `Workspace and loaded files`, select the loaded demo CSV(s) and click `Delete selected`.
3. Click `Load CSV(s)` in the top bar and choose the CSV files you generated with `finpdf2csv`.
4. If you also have owner/category mapping CSVs, stay in `Settings` and click `Import mappings`.
5. Click `Compute` if you want to recompute immediately after importing files or mappings.

Everything stays local in browser storage, so you can repeat that flow with your own files without uploading them to a backend.

## Does the website upload my data anywhere?

No. The web app is 100% local with respect to your finance data.

In this repo there is:
1. no application backend,
2. no server-side database,
3. no external persistence path for your uploaded CSVs, mappings, or workspace state.

Your data stays in browser storage on your machine. We chose that model so sensitive financial data can stay on-device while the app remains a plain static site that works locally and on GitHub Pages.

The one network dependency in the public web app is the pinned Highcharts CDN for charting code. It fetches JavaScript assets, not your financial data.

## How do I run the checks?

From the repo root:

```bash
go test ./...
cd web
npm install
npm run test:unit
npm run test:smoke
```

## Where should I look next?

1. [web/README.md](./web/README.md) for web-app-specific commands and validation
2. [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for GitHub Pages deployment details
3. [LICENSE](./LICENSE) for license terms
