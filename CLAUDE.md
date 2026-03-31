# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference: Build, Test, and Run Commands

### Go Backend
```bash
# Run all tests
go test ./...

# Run tests for a specific package
go test ./pkg/internal/extractor/santander

# Run a specific test
go test -run TestName ./path/to/package

# Install the CLI locally for development
go install github.com/Alechan/finance-analyzer/pkg/cmd/finpdf2csv@latest
```

### Web Frontend
```bash
cd web

# Build WASM module from Go
npm run build:wasm

# Run unit tests (JavaScript)
npm run test:unit

# Run smoke tests (end-to-end with Playwright)
npm run test:smoke

# Run UX audit with Playwright
npm run audit:ux

# Check for sensitive data that should not be in repo
npm run guard:oss-sensitive

# Enable pre-commit hooks for OSS sensitive artifact checks
../scripts/install-git-hooks.sh

# Local development with dynamic reloading
npm run serve:no-store
# Then open http://127.0.0.1:8787
```

### Full Local Development Setup
```bash
# Build and serve everything locally
cd web
npm install
npm run build:wasm
python3 -m http.server 8080 -d .
# Open http://localhost:8080
```

## Architecture Overview

### Three Go Binaries

1. **`finpdf2csv`** (`pkg/cmd/finpdf2csv/main.go`)
   - CLI that extracts credit card statements from PDFs and outputs CSV
   - Entry point: `pkg/internal/pdf2csvcli/run.go`
   - Supports Santander and Visa Prisma statement formats

2. **`financewasm`** (`pkg/cmd/financewasm/main.go`)
   - Compiles to WebAssembly for browser execution
   - Exports JavaScript functions: `computeFromCSV`, `exportTableCSVFromResult`, `demoCSV`, `demoMappingsJSON`
   - Imported and used by web app for local-only computation

3. **`financeenginecli`** (`pkg/cmd/financeenginecli/main.go`)
   - CLI for computing finance metrics (currently minimal; web uses WASM equivalent)

### Bank Extraction System

The extractor system is pluggable and bank-specific:

- **Common interfaces and utilities**: `pkg/internal/extractor/pdftable/` defines table iteration and PDF parsing
- **Bank implementations**:
  - `pkg/internal/extractor/santander/` - Santander statement extraction
  - `pkg/internal/extractor/visaprisma/` - Visa Prisma statement extraction
  - `pkg/internal/extractor/galicia/` (under development) - Banco Galicia support
- **Output format**: All extractors produce `pdfcardsummary.Movement` objects → CSV rows via `pkg/internal/pdfcardsummary/csv_builder.go`

**To add a new bank**: Create a new package in `pkg/internal/extractor/{bankname}` that:
1. Parses the PDF structure specific to that bank's statement format
2. Extracts movements (transactions) into `pdfcardsummary.Movement` objects
3. Implements any bank-specific balance or summary logic

### Finance Engine

`pkg/internal/financeengine/` is the core computation layer:
- **Input**: CSV data + category/owner mappings
- **Output**: Computed tables (spending, debt, owners, quality checks)
- Functions: `compute.go` (main orchestrator), `export.go` (table export), `format.go` (formatting)

The web app calls the WASM-compiled version of this engine.

### Web App (Client-Side Only)

- **Storage**: IndexedDB for CSV files, mappings, workspace state, computed results
- **No backend**: All data stays local; can be hosted as static files on GitHub Pages
- **Build**: Uses `web/package.json` scripts; WASM is built in CI and packed as JavaScript module
- **Testing**:
  - Unit tests: Node.js test runner on `.test.js` files
  - Smoke tests: Playwright browser automation
  - Validation: `demoDatasetContract.test.js` ensures demo data compatibility across versions

### CSV as Interchange Format

The CSV format is the bridge between extraction and web app:
- CLI outputs `.csv` files from PDFs
- Web app imports CSVs and passes them to the WASM finance engine
- Mappings CSV files define category and owner associations

## Key Development Notes

### Testing Patterns

- **Go**: Uses `testify/assert`, `go.uber.org/mock` for unit tests
- **Web**: Node.js native test runner for units, Playwright for e2e
- **Bank extraction**: Tested with real PDF samples; test data in `pkg/internal/extractor/{bank}/testdata/`

### PDF Parsing

PDF text extraction uses `github.com/Alechan/pdf` (custom fork). The core flow:
1. Extract text and positions from PDF pages
2. Identify table structures within pages
3. Parse rows based on column positions (bank-specific)
4. Convert rows to domain objects (Cards, Movements, etc.)

### Local-First Design Philosophy

- All financial data computation happens in-browser (WASM)
- No server backend or external API for data processing
- Browser storage (IndexedDB) persists user's files and workspace
- Deployable as static GitHub Pages site

### Deployment

- Automated from `main` branch via GitHub Actions to GitHub Pages
- Post-deploy verification in `docs/DEPLOYMENT.md`
- Prefers demo/public data by default; users replace with their own via the UI

### Data Quality Checks

The engine includes data validation (`dq.go`). These checks identify:
- Missing or inconsistent data
- Formatting issues
- Reconciliation gaps

The web app displays these as warnings to users.

## Current Work Context

The `feature/format-bgalicia` branch adds support for Banco Galicia (a new Argentinian bank). This requires:
- Creating extractor in `pkg/internal/extractor/galicia/`
- Defining Galicia-specific PDF parsing logic
- Adding Galicia to the bank registry in `pkg/internal/pdf2csvcli/bank_type.go`
- Testing with sample Galicia PDFs
