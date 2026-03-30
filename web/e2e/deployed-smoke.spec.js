import { test, expect } from "@playwright/test";

const EXTERNAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL
  ? String(process.env.PLAYWRIGHT_BASE_URL)
  : "";
const ALLOWED_EXTERNAL_FAILURE_PATTERNS = [
  /^https:\/\/code\.highcharts\.com\/12\.5\.0\/highcharts\.js(?:\?.*)?$/,
  /^https:\/\/code\.highcharts\.com\/12\.5\.0\/themes\/dark-unica\.js(?:\?.*)?$/,
];

test.skip(!EXTERNAL_BASE_URL, "PLAYWRIGHT_BASE_URL is required for deployed smoke checks.");

test("deployed site boots from published assets without same-origin fetch failures", async ({ page }) => {
  const sameOriginFailures = [];
  const externalFailures = [];
  const siteOrigin = new URL(EXTERNAL_BASE_URL).origin;

  page.on("response", (response) => {
    const url = response.url();
    const failure = `${response.status()} ${url}`;
    if (url.startsWith(siteOrigin)) {
      if (response.status() >= 400) {
        sameOriginFailures.push(failure);
      }
      return;
    }
    if (response.status() >= 400) {
      externalFailures.push(failure);
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = `${request.failure()?.errorText || "request failed"} ${url}`;
    if (!url.startsWith(siteOrigin)) {
      externalFailures.push(failure);
    } else {
      sameOriginFailures.push(failure);
    }
  });

  await page.goto(EXTERNAL_BASE_URL, { waitUntil: "domcontentloaded" });

  await expect(page.locator("#fo-nav-overview")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")), {
      timeout: 60_000,
    })
    .not.toBe("loading");

  const finalBootState = await page.evaluate(() => String(document.body.dataset.foBootState || ""));
  if (finalBootState === "ready") {
    await expect
      .poll(async () => page.evaluate(() => String(document.body.dataset.foLoadProfile || "")))
      .toBe("public");
    await expect(page.locator(".fo-startup-card")).toHaveCount(0);
    await expect(page.locator("#fo-overview-new-table tbody tr")).toHaveCount(8);
  } else {
    const disallowedExternalFailures = externalFailures.filter(
      (failure) =>
        !ALLOWED_EXTERNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(failure.replace(/^\S+\s+/, "")))
    );
    expect(sameOriginFailures).toEqual([]);
    expect(disallowedExternalFailures).toEqual([]);
  }

  expect(sameOriginFailures).toEqual([]);
});
