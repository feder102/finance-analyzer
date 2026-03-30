#!/usr/bin/env node

const baseURL = process.env.PLAYWRIGHT_BASE_URL ? String(process.env.PLAYWRIGHT_BASE_URL) : "";

if (!baseURL) {
  console.error("[verify-pages-light] PLAYWRIGHT_BASE_URL is required.");
  process.exit(1);
}

const requiredPaths = [
  "",
  "mockups_lab/app/main.js",
  "runtime/mockupsRuntime.js",
  "wasm_exec.js",
  "finance.wasm",
  "node_modules/idb/build/index.js",
  "mockups_lab/tmp_public_data/current/demo_extracted.csv",
  "mockups_lab/tmp_public_data/current/owner_map.csv",
  "mockups_lab/tmp_public_data/current/details_to_categories_map.csv",
  "mockups_lab/tmp_public_data/current/category_segments_map.csv",
];

function resolveUrl(pathname) {
  return new URL(pathname, baseURL).toString();
}

async function fetchRequired(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response;
}

async function main() {
  const failures = [];

  for (const pathname of requiredPaths) {
    const url = resolveUrl(pathname);
    try {
      await fetchRequired(url);
      // eslint-disable-next-line no-console
      console.log(`[verify-pages-light] OK ${url}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error("[verify-pages-light] Missing or unreachable published assets:");
    for (const failure of failures) {
      // eslint-disable-next-line no-console
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("[verify-pages-light] PASS");
}

await main();
