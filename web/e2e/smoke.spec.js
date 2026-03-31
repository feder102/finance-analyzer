import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL_MOCKUP_ENTRY = "/";
const SENSITIVE_REQUIRED_FIXTURES = [
  "../mockups_lab/tmp_sensitive_data/current/Santander_joined.csv",
  "../mockups_lab/tmp_sensitive_data/current/2025-03-21-Santander-AMEX.pdf.csv",
  "../mockups_lab/tmp_sensitive_data/current/VISA-PRISMA_joined.csv",
  "../mockups_lab/tmp_sensitive_data/current/owner_map.csv",
  "../mockups_lab/tmp_sensitive_data/current/details_to_categories_map.csv",
].map((relativePath) => path.join(__dirname, relativePath));
const HAS_SENSITIVE_FIXTURES = SENSITIVE_REQUIRED_FIXTURES.every((filePath) =>
  fsSync.existsSync(filePath)
);

async function openSettingsWorkspaceDetails(page) {
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toBeVisible();
}

async function openView(page, pageId) {
  await page.locator(`#fo-nav-${pageId}`).click();
  await expect(page.locator(`#fo-nav-${pageId}`)).toHaveAttribute("aria-current", "page");
  await expect(page.locator(`#${pageId}`)).toHaveAttribute("aria-hidden", "false");
}

function parseRebuiltRawMetaText(metaText) {
  const text = String(metaText || "");
  const match = /Showing rows ([\d.,]+)-([\d.,]+) of ([\d.,]+) filtered rows/.exec(text);
  const toPlainInteger = (value) => Number(String(value || "").replace(/[^\d]/g, ""));
  return {
    start: match ? toPlainInteger(match[1]) : 0,
    end: match ? toPlainInteger(match[2]) : 0,
    total: match ? toPlainInteger(match[3]) : 0,
  };
}

async function readRebuiltRawMeta(page) {
  const metaText = await page.locator("#fo-raw-new-meta").textContent();
  return parseRebuiltRawMetaText(metaText);
}

test("default / entrypoint serves the canonical integrated app directly", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foLoadProfile || ""))
    .toBe("public");
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foAppBasePath || "")))
    .toBe("./mockups_lab/");

  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("ready");
  await expect(page.locator("#fo-overview-new-kpi-title")).toHaveText("Monthly snapshot (latest vs previous)");
  await expect(page.locator("#fo-overview-metric-help-note")).toContainText(
    "Use the info buttons in the Metric column for short definitions."
  );
  await expect(page.locator("#fo-overview-new-table .fo-metric-help")).toHaveCount(8);
  await expect(page.locator("#fo-overview-new-table tbody tr")).toHaveCount(8);
  await expect(page.locator("#fo-overview-new-table tbody")).toContainText("Net statement");
  await page.locator("#fo-overview-new-table .fo-metric-help").first().click();
  await expect(page.locator("#fo-overview-new-table .fo-metric-help-tooltip").first()).toBeVisible();
  await expect(page.locator("#fo-overview-new-table .fo-metric-help-tooltip").first()).toContainText(
    "The total amount billed for this statement month."
  );
  await expect(page.locator("#fo-overview-q001-title")).toHaveText("Where did our money go this month?");
  await expect(page.locator("#fo-overview-statement-table tbody")).toContainText("Carry over debt");
  await expect(page.locator("#fo-overview-statement-table tbody")).toContainText("New debt");
  await expect(page.locator("#fo-overview-statement-table tbody")).toContainText("Taxes");
  await expect(page.locator("#fo-overview-statement-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-overview-statement-meta")).toContainText("This table shows how the full statement total");
  await expect(page.locator("#fo-overview-categories-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-overview-categories-meta")).toContainText("This table shows which categories made up this month's card movements.");
  await expect(page.locator("#fo-overview-categories-meta")).toContainText("Refunds or credits reduce a category total.");
  await expect(page.locator("#fo-overview-q34-title")).toHaveText("What changed vs last month?");
  await expect(page.locator("#fo-overview-q34-meta")).toContainText("Compared with:");
  await expect(page.locator("#fo-overview-q34-meta")).toContainText("largest month-over-month changes in spending");
  await expect(page.locator("#fo-overview-q3-table thead")).toContainText("Δ ARS");
  await expect(page.locator("#fo-overview-q4-table thead")).toContainText("Δ ARS");
  await expect(page.locator("#fo-overview-q8-title")).toHaveText("Is total debt growing or shrinking?");
  await expect(page.locator("#fo-overview-q8-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-overview-q8-meta")).toContainText(
    "This chart tracks total remaining installment debt by statement month."
  );
  await expect(page.locator("#fo-overview-q8-meta")).toContainText(
    "That total already includes next month's installments."
  );
  await page.locator("#fo-nav-debt").click();
  await expect(page.locator("#debt")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#fo-debt-new-priority-strip")).toHaveCount(0);
  await expect(page.locator("#fo-debt-new-total-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-debt-new-total-host .highcharts-root").first()).toBeVisible();
  const debtTotalProbe = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("#fo-debt-new-total-host .fo-highcharts-host"));
    return hosts.map((host) => {
      const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
      return chart && Array.isArray(chart.series) ? chart.series.map((series) => String(series.name || "")) : [];
    });
  });
  expect(debtTotalProbe[0]).toContain("Total remaining installment debt ARS");
  expect(debtTotalProbe[1]).toContain("Total remaining installment debt USD");
  await expect(page.locator("#fo-debt-new-projected-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-debt-new-projected-host .highcharts-root").first()).toBeVisible();
  const debtProjectedProbe = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("#fo-debt-new-projected-host .fo-highcharts-host"));
    return hosts.map((host) => {
      const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
      return chart && Array.isArray(chart.series) ? chart.series.map((series) => String(series.name || "")) : [];
    });
  });
  expect(debtProjectedProbe[0]).toContain("Installment maturity ARS");
  expect(debtProjectedProbe[1]).toContain("Installment maturity USD");
  await expect(page.locator("#fo-debt-new-finance-cost-body")).toContainText("Taxes");
  await expect(page.locator("#fo-debt-new-finance-cost-body")).toContainText("Total financial costs");
  await expect(page.locator("#fo-debt-new-finance-cost-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-debt-new-finance-cost-meta")).toContainText(
    "This table shows taxes, fees, and interest billed in the latest month, separated from actual spending."
  );
  await expect(page.locator("#fo-debt-new-delta-meta")).toContainText(
    "Bars show the percentage change in total remaining installment debt vs the previous month."
  );
  await expect(page.locator("#fo-debt-new-delta-meta")).toContainText("Tooltip includes the absolute delta.");
  await expect(page.locator("#fo-debt-new-delta-host .highcharts-root").first()).toBeVisible();
  const debtDeltaProbe = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("#fo-debt-new-delta-host .fo-highcharts-host"));
    return hosts.map((host) => {
      const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
      const percentAxisFormatter =
        chart && chart.yAxis && chart.yAxis[0] && chart.yAxis[0].options && chart.yAxis[0].options.labels
          ? chart.yAxis[0].options.labels.formatter
          : null;
      const tooltipFormatter = chart && chart.tooltip && chart.tooltip.options ? chart.tooltip.options.formatter : null;
      const percentPoint =
        chart && chart.series && chart.series[0] && chart.series[0].points ? chart.series[0].points[1] : null;
      return {
        seriesTypes: chart && Array.isArray(chart.series) ? chart.series.map((series) => String(series.type || "")) : [],
        seriesNames: chart && Array.isArray(chart.series) ? chart.series.map((series) => String(series.name || "")) : [],
        axisCount: chart && Array.isArray(chart.yAxis) ? chart.yAxis.length : 0,
        percentTickSample:
          typeof percentAxisFormatter === "function" ? String(percentAxisFormatter.call({ value: 12.34 })) : "",
        percentTooltipSample:
          typeof tooltipFormatter === "function"
            ? String(
                tooltipFormatter.call(
                  percentPoint || {
                    y: 12.34,
                    series: { name: "Δ total remaining debt ARS %" },
                    options: {
                      custom: {
                        formatterKind: "percent",
                        statementMonth: "2025-01",
                        closeDateLabel: "2025-01-15",
                        absoluteDelta: 123456,
                        absoluteLabel: "Δ ARS"
                      }
                    }
                  }
                )
              )
          : "",
        percentCloseDate:
          percentPoint && percentPoint.options && percentPoint.options.custom
            ? String(percentPoint.options.custom.closeDateLabel || "")
            : ""
      };
    });
  });
  expect(debtDeltaProbe[0].seriesTypes).toEqual(["column"]);
  expect(debtDeltaProbe[1].seriesTypes).toEqual(["column"]);
  expect(debtDeltaProbe[0].seriesNames).toContain("Δ total remaining debt ARS %");
  expect(debtDeltaProbe[1].seriesNames).toContain("Δ total remaining debt USD %");
  expect(debtDeltaProbe[0].axisCount).toBe(1);
  expect(debtDeltaProbe[1].axisCount).toBe(1);
  expect(debtDeltaProbe[0].percentTickSample).toMatch(/%$/);
  expect(String(debtDeltaProbe[0].percentTooltipSample)).toContain("Δ %:");
  expect(String(debtDeltaProbe[0].percentTooltipSample)).toContain("Close date:");
  expect(String(debtDeltaProbe[0].percentTooltipSample)).toContain("Δ ARS:");
  expect(String(debtDeltaProbe[0].percentTooltipSample)).not.toContain("Statement month:");
  expect(debtDeltaProbe[0].percentCloseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.locator("#fo-nav-overview").click();
  await expect
    .poll(async () => await page.locator("#fo-overview-categories-table tbody tr").count())
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await page.locator("#fo-overview-q3-table tbody tr").count())
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await page.locator("#fo-overview-q4-table tbody tr").count())
    .toBeGreaterThan(0);
  await expect(page.locator("#fo-overview-q8-host .highcharts-root").first()).toBeVisible();
  const overviewQ8Datasets = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("#fo-overview-q8-host .fo-highcharts-host"));
    return hosts.map((host) => {
      const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
      return chart && Array.isArray(chart.series) ? chart.series.map((series) => String(series.name || "")) : [];
    });
  });
  expect(overviewQ8Datasets[0]).toContain("Total remaining installment debt ARS");
  expect(overviewQ8Datasets[1]).toContain("Total remaining installment debt USD");
  const overviewQ8TickConfig = await page.evaluate(() => {
    const host = document.querySelector("#fo-overview-q8-host .fo-highcharts-host");
    const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
    return chart
      ? {
          xTickInterval: chart.xAxis[0] && chart.xAxis[0].options ? chart.xAxis[0].options.tickInterval : null,
          xGridLineWidth: chart.xAxis[0] && chart.xAxis[0].options ? chart.xAxis[0].options.gridLineWidth : null,
          xTickWidth: chart.xAxis[0] && chart.xAxis[0].options ? chart.xAxis[0].options.tickWidth : null,
          yTickAmount: chart.yAxis[0] && chart.yAxis[0].options ? chart.yAxis[0].options.tickAmount : null,
          yTickWidth: chart.yAxis[0] && chart.yAxis[0].options ? chart.yAxis[0].options.tickWidth : null
        }
      : null;
  });
  expect(overviewQ8TickConfig).toEqual({
    xTickInterval: 1,
    xGridLineWidth: 1,
    xTickWidth: 1,
    yTickAmount: 6,
    yTickWidth: 1,
  });
  const overviewQ8TooltipProbe = await page.evaluate(() => {
    const host = document.querySelector("#fo-overview-q8-host .fo-highcharts-host");
    const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
    if (!chart || !chart.series || !chart.series[0] || !chart.series[0].points || !chart.series[0].points[0]) {
      return null;
    }
    const point = chart.series[0].points[0];
    const tooltipFormatter = chart.tooltip && chart.tooltip.options ? chart.tooltip.options.formatter : null;
    return {
      closeDateLabel: point.options && point.options.custom ? String(point.options.custom.closeDateLabel || "") : "",
      tooltipSample: typeof tooltipFormatter === "function" ? String(tooltipFormatter.call(point)) : ""
    };
  });
  expect(overviewQ8TooltipProbe?.closeDateLabel).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(overviewQ8TooltipProbe?.tooltipSample).toContain("Close date:");

  await page.locator("#fo-nav-categories").click();
  await expect(page.locator("#categories")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#fo-categories-new-top-title")).toHaveText("Where did category spending go this month?");
  await expect(page.locator("#fo-categories-new-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-categories-new-meta")).not.toContainText("Top3 share");
  await expect(page.locator("#fo-categories-new-table-ars thead")).toContainText("Movements");
  await expect(page.locator("#fo-categories-new-table-ars thead")).toContainText("Carry over debt ARS");
  await expect(page.locator("#fo-categories-new-table-ars thead")).toContainText("New debt ARS");
  await page.locator("#fo-nav-owners").click();
  await expect(page.locator("#owners")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#owners")).not.toContainText("This view intentionally starts empty.");
  await expect(page.locator("#fo-owners-new-trend-title")).toHaveText(
    "How are owner amounts evolving over time?"
  );
  await expect(page.locator("#fo-owners-new-trend-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-owners-new-trend-host .highcharts-root").first()).toBeVisible();
  const ownersTrendProbe = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll("#fo-owners-new-trend-host .fo-highcharts-host"));
    return hosts.map((host) => {
      const chart = host && host._foHighchartsInstance ? host._foHighchartsInstance : null;
      return chart && Array.isArray(chart.series)
        ? chart.series.map((series) => String(series.name || ""))
        : [];
    });
  });
  expect(ownersTrendProbe[0].length).toBeGreaterThan(0);
  await expect(page.locator("#fo-owners-new-rank-title")).toHaveText(
    "Which owner is driving the highest spending this month?"
  );
  await expect(page.locator("#fo-owners-new-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-owners-new-table-ars thead")).toContainText("Movements");
  await expect(page.locator("#fo-owners-new-table-ars thead")).toContainText("Amount ARS");
  await expect(page.locator("#fo-owners-new-table-usd thead")).toContainText("Amount USD");
  await expect
    .poll(async () => await page.locator("#fo-owners-new-ars-body tr").count())
    .toBeGreaterThan(0);
  await expect(page.locator("#fo-owners-new-pairs-title")).toHaveText(
    "Which owner-category pairs are largest this month?"
  );
  await expect(page.locator("#fo-owners-new-pairs-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-owners-new-pairs-table-ars thead")).toContainText("Category");
  await expect(page.locator("#fo-owners-new-pairs-table-ars thead")).toContainText("Movements");
  await expect(page.locator("#fo-owners-new-pairs-table-ars thead")).toContainText("Amount ARS");
  await expect
    .poll(async () => await page.locator("#fo-owners-new-pairs-ars-body tr").count())
    .toBeGreaterThan(0);
  await page.locator("#fo-nav-categories").click();
  await expect(page.locator("#categories")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#fo-categories-new-table-ars thead")).toContainText("Total ARS");
  await expect(page.locator("#fo-categories-new-table-usd thead")).toContainText("Movements");
  await expect(page.locator("#fo-categories-new-table-usd thead")).toContainText("Carry over debt USD");
  await expect(page.locator("#fo-categories-new-table-usd thead")).toContainText("New debt USD");
  await expect(page.locator("#fo-categories-new-table-usd thead")).toContainText("Total USD");
  await expect
    .poll(async () => await page.locator("#fo-categories-new-ars-body tr").count())
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await page.locator("#fo-categories-new-usd-body tr").count())
    .toBeGreaterThan(0);
  await expect(page.locator("#fo-categories-new-ed-title")).toHaveCount(0);
  await expect(page.locator("#fo-categories-new-ed-body")).toHaveCount(0);
  await expect(page.locator("#fo-categories-new-mom-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-categories-new-mom-meta")).toContainText("Compared with:");
  await expect(page.locator("#fo-categories-new-mom-meta")).toContainText(
    "These tables show the biggest category increases and decreases between the latest and previous month."
  );
  await expect
    .poll(async () => await page.locator("#fo-categories-new-mom-ars-body tr").count())
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await page.locator("#fo-categories-new-mom-usd-body tr").count())
    .toBeGreaterThan(0);
  await page.locator("#fo-nav-dq").click();
  await expect(page.locator("#dq")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#dq")).not.toContainText("This view intentionally starts empty.");
  await expect(page.locator("#fo-dq-new-meta")).toContainText("Latest month:");
  await expect(page.locator("#fo-dq-new-summary-total")).not.toContainText("-");
  await expect(page.locator("#fo-dq-new-summary-category")).not.toContainText("-");
  await expect(page.locator("#fo-dq-new-summary-owner")).not.toContainText("-");
  const dqNewProbe = await page.evaluate(() => {
    const totalText = String(
      (document.getElementById("fo-dq-new-summary-total") || {}).textContent || ""
    );
    const totalIssues = Number(totalText.replace(/[^\d]/g, "")) || 0;
    const dataRows = Array.from(document.querySelectorAll("#fo-dq-new-issues-body tr")).filter(
      (tr) => tr.querySelectorAll("td").length === 6
    );
    return {
      totalIssues,
      renderedRows: dataRows.length,
      pageText: String((document.getElementById("fo-dq-new-page") || {}).textContent || ""),
      nextDisabled: Boolean((document.getElementById("fo-dq-new-next") || {}).disabled),
      hasRuleFocus: Boolean(document.querySelector("#dq #fo-dq-rule-focus-controls")),
      hasMappingDrift: Boolean(document.querySelector("#dq #fo-dq-mapping-drift-table")),
    };
  });
  expect(dqNewProbe.hasRuleFocus).toBeFalsy();
  expect(dqNewProbe.hasMappingDrift).toBeFalsy();
  expect(dqNewProbe.pageText).toMatch(/^Page \d+ of \d+$/);
  if (dqNewProbe.totalIssues > 0) {
    expect(dqNewProbe.renderedRows).toBeLessThanOrEqual(50);
    await expect(page.locator("#fo-dq-new-note")).toContainText("Showing rows");
    if (!dqNewProbe.nextDisabled) {
      await page.locator("#fo-dq-new-next").click();
      await expect(page.locator("#fo-dq-new-page")).toContainText("Page 2 of");
    }
  } else {
    await expect(page.locator("#fo-dq-new-note")).toContainText("No strict DQ issues");
  }

  await openView(page, "settings");
  await openSettingsWorkspaceDetails(page);
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toContainText("demo_extracted.csv");
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).not.toContainText("Santander_joined.csv");
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).not.toContainText(
    "2025-03-21-Santander-AMEX.pdf.csv"
  );
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).not.toContainText("VISA-PRISMA_joined.csv");
});

test("canonical app loads without browser console noise or runtime page errors", async ({ page }) => {
  const consoleEvents = [];
  const pageErrors = [];
  const badResponses = [];
  page.on("console", (msg) => {
    consoleEvents.push({
      type: String(msg.type() || ""),
      text: String(msg.text() || ""),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String((error && error.message) || error || ""));
  });
  page.on("response", (response) => {
    const status = Number(response.status());
    if (status >= 400) {
      badResponses.push({
        status,
        url: String(response.url() || ""),
      });
    }
  });

  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("ready");

  expect(pageErrors).toEqual([]);
  expect(consoleEvents).toEqual([]);
  expect(badResponses).toEqual([]);

  if (HAS_SENSITIVE_FIXTURES) {
    consoleEvents.length = 0;
    pageErrors.length = 0;
    badResponses.length = 0;
    await page.goto(`${CANONICAL_MOCKUP_ENTRY}?entry=sensitive-shortcut`);
    await expect
      .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
      .toBe("ready");
    expect(pageErrors).toEqual([]);
    expect(consoleEvents).toEqual([]);
    expect(badResponses).toEqual([]);
  }
});

test("root sensitive profile query resolves to strict sensitive autoload flow", async ({
  page,
}) => {
  test.skip(
    !HAS_SENSITIVE_FIXTURES,
    "Sensitive fixtures are private-only; skip sensitive profile smoke when unavailable in OSS worktrees."
  );
  await page.goto(`${CANONICAL_MOCKUP_ENTRY}?entry=sensitive-shortcut`);
  await expect(page).toHaveURL(/\/\?entry=sensitive-shortcut$/);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foLoadProfile || ""))
    .toBe("sensitive");
  await expect
    .poll(async () => Number(await page.evaluate(() => document.body.dataset.foRuntimeTables || "0")))
    .toBeGreaterThan(0);

  await openView(page, "settings");
  await openSettingsWorkspaceDetails(page);
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toContainText("Santander_joined.csv");
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toContainText("2025-03-21-Santander-AMEX.pdf.csv");
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toContainText("VISA-PRISMA_joined.csv");
});

test("root canonical page loads versioned finance-overview asset via shared loader", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);

  const token = await page.evaluate(() => String(window.__FO_ASSET_VERSION__ || ""));
  expect(token.length).toBeGreaterThan(0);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const script = Array.from(document.scripts).find((node) =>
          String(node.src || "").includes("/shared/finance-overview.js")
        );
        return script ? String(script.src || "") : "";
      })
    )
    .toContain("/mockups_lab/shared/finance-overview.js");

  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foAssetSharedVersion || "")))
    .toBe(token);
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foAssetRuntimeVersion || "")))
    .toBe(token);
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foAssetWasmVersion || "")))
    .toBe(token);

  const assetInfo = await page.evaluate(() => {
    const loaderScript = Array.from(document.scripts).find((node) =>
      String(node.src || "").includes("/shared/finance-overview-loader.js")
    );
    const overviewScript = Array.from(document.scripts).find((node) =>
      String(node.src || "").includes("/shared/finance-overview.js")
    );
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => String((entry && entry.name) || ""));
    function findLatestResource(fragment) {
      for (let i = resources.length - 1; i >= 0; i -= 1) {
        if (resources[i].includes(fragment)) {
          return resources[i];
        }
      }
      return "";
    }
    return {
      loaderSrc: loaderScript ? String(loaderScript.src || "") : "",
      overviewSrc: overviewScript ? String(overviewScript.src || "") : "",
      runtimeRequestUrl: findLatestResource("/runtime/mockupsRuntime.js"),
      wasmExecRequestUrl: findLatestResource("/wasm_exec.js"),
      wasmRequestUrl: findLatestResource("/finance.wasm"),
      readyThenType:
        window.__foFinanceOverviewReady && typeof window.__foFinanceOverviewReady.then === "function"
          ? "function"
          : "",
      sharedVersion: document.body && document.body.dataset ? String(document.body.dataset.foAssetSharedVersion || "") : "",
      runtimeVersion: document.body && document.body.dataset ? String(document.body.dataset.foAssetRuntimeVersion || "") : "",
      wasmVersion: document.body && document.body.dataset ? String(document.body.dataset.foAssetWasmVersion || "") : "",
    };
  });

  expect(assetInfo.loaderSrc).toContain("/mockups_lab/shared/finance-overview-loader.js");
  expect(assetInfo.overviewSrc).toContain("/mockups_lab/shared/finance-overview.js");
  expect(assetInfo.overviewSrc).toContain(`v=${encodeURIComponent(token)}`);
  expect(assetInfo.runtimeRequestUrl).toContain(`v=${encodeURIComponent(token)}`);
  expect(assetInfo.wasmExecRequestUrl).toContain(`v=${encodeURIComponent(token)}`);
  expect(assetInfo.wasmRequestUrl).toContain(`v=${encodeURIComponent(token)}`);
  expect(assetInfo.readyThenType).toBe("function");
  expect(assetInfo.sharedVersion).toBe(token);
  expect(assetInfo.runtimeVersion).toBe(token);
  expect(assetInfo.wasmVersion).toBe(token);
});

test("mockups_lab integrated page shows low-detail Stage 1 skeleton before runtime ready", async ({ page }) => {
  await page.route("**/finance.wasm*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto(CANONICAL_MOCKUP_ENTRY);

  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("loading");

  await expect(page.locator("#fo-overview-new-table tbody")).toContainText("Loading runtime metrics...");
  await expect(page.locator("#fo-overview-new-table tbody")).not.toContainText("Net statement");

  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("ready");
  await expect(page.locator("#fo-overview-new-table tbody tr")).toHaveCount(8);
  await expect(page.locator("#fo-overview-new-table tbody")).toContainText("Net statement");
});

test("mockups_lab topbar action buttons keep stable position from loading to ready", async ({ page }) => {
  await page.route("**/finance.wasm*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("loading");

  const before = await page.locator("#fo-load-btn").boundingBox();
  expect(before).not.toBeNull();

  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("ready");
  const after = await page.locator("#fo-load-btn").boundingBox();
  expect(after).not.toBeNull();

  const deltaX = Math.abs(after.x - before.x);
  const deltaY = Math.abs(after.y - before.y);
  expect(deltaX).toBeLessThanOrEqual(1);
  expect(deltaY).toBeLessThanOrEqual(1);
});

test("mockups_lab overview delta semantic tones follow metric polarity contract (including New debt)", async ({
  page,
}) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");
  await openView(page, "overview");

  const overviewSemantics = await page.evaluate(() => {
    const METRIC_DIRECTION = {
      "Net statement": -1,
      "Card movements": -1,
      "New debt": -1,
      "Carry over debt": -1,
      "Next month installments": -1,
      "Total remaining installments": -1,
      Taxes: -1,
      "Net past payments": 1,
    };
    function parseEsNumber(rawValue) {
      const raw = String(rawValue || "")
        .replace(/^[A-Z]{3}\s+/, "")
        .trim();
      if (!raw) {
        return 0;
      }
      const normalized = raw.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function toneFor(metricLabel, delta) {
      if (!delta) {
        return "";
      }
      const direction = METRIC_DIRECTION[metricLabel] || 1;
      return direction * delta > 0 ? "fo-cell-pos" : "fo-cell-neg";
    }

    const rows = Array.from(document.querySelectorAll("#fo-overview-new-table tbody tr"))
      .map((tr) => Array.from(tr.querySelectorAll("td")))
      .filter((cells) => cells.length >= 9)
      .map((cells) => {
        const labelNode = cells[0].querySelector(".fo-metric-help-label");
        const label = String((labelNode && labelNode.textContent) || cells[0].textContent || "").trim();
        return {
          label,
          deltaArTitle: String(cells[3].getAttribute("title") || cells[3].textContent || ""),
          deltaUsdTitle: String(cells[7].getAttribute("title") || cells[7].textContent || ""),
          deltaArClasses: Array.from(cells[3].classList),
          pctArClasses: Array.from(cells[4].classList),
          deltaUsdClasses: Array.from(cells[7].classList),
          pctUsdClasses: Array.from(cells[8].classList),
          pctArIsNA: String(cells[4].textContent || "").trim() === "N/A",
          pctUsdIsNA: String(cells[8].textContent || "").trim() === "N/A",
        };
      })
      .filter((row) => Object.prototype.hasOwnProperty.call(METRIC_DIRECTION, row.label))
      .map((row) => {
        const deltaAr = parseEsNumber(row.deltaArTitle);
        const deltaUsd = parseEsNumber(row.deltaUsdTitle);
        return {
          label: row.label,
          expectedArTone: toneFor(row.label, deltaAr),
          expectedUsdTone: toneFor(row.label, deltaUsd),
          deltaArClasses: row.deltaArClasses,
          pctArClasses: row.pctArClasses,
          deltaUsdClasses: row.deltaUsdClasses,
          pctUsdClasses: row.pctUsdClasses,
          pctArIsNA: row.pctArIsNA,
          pctUsdIsNA: row.pctUsdIsNA,
        };
      });

    return {
      expectedLabels: Object.keys(METRIC_DIRECTION),
      renderedLabels: rows.map((row) => row.label),
      checks: rows,
    };
  });

  expect(overviewSemantics.renderedLabels).toEqual(
    expect.arrayContaining(overviewSemantics.expectedLabels)
  );
  const newDebtRow = overviewSemantics.checks.find((row) => row.label === "New debt");
  expect(newDebtRow).toBeTruthy();

  const toneClasses = ["fo-cell-pos", "fo-cell-neg"];
  for (const row of overviewSemantics.checks) {
    if (row.expectedArTone) {
      expect(row.deltaArClasses).toContain(row.expectedArTone);
      if (!row.pctArIsNA) {
        expect(row.pctArClasses).toContain(row.expectedArTone);
      }
    } else {
      expect(row.deltaArClasses.some((className) => toneClasses.includes(className))).toBeFalsy();
      expect(row.pctArClasses.some((className) => toneClasses.includes(className))).toBeFalsy();
    }

    if (row.expectedUsdTone) {
      expect(row.deltaUsdClasses).toContain(row.expectedUsdTone);
      if (!row.pctUsdIsNA) {
        expect(row.pctUsdClasses).toContain(row.expectedUsdTone);
      }
    } else {
      expect(row.deltaUsdClasses.some((className) => toneClasses.includes(className))).toBeFalsy();
      expect(row.pctUsdClasses.some((className) => toneClasses.includes(className))).toBeFalsy();
    }
  }
});

test("mockups_lab settings isolates destructive actions in a dedicated danger zone", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");
  const dangerZone = page.locator(".fo-settings-danger-card");
  await expect(dangerZone).toBeVisible();
  await expect(dangerZone).toContainText("Danger zone");
  await expect(dangerZone.locator("#fo-settings-clear-mappings-btn")).toBeVisible();
  await expect(dangerZone.locator("#fo-settings-delete-all-btn")).toBeVisible();
  await expect(dangerZone.locator(".fo-btn-danger")).toHaveCount(2);
});

test("mockups_lab rebuilt settings exposes the minimal operational surface with live state", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await page.locator("#fo-nav-settings").click();
  await expect(page.locator("#settings.page.active")).toBeVisible();
  await expect(page.locator("#settings")).toContainText("Compute");
  await expect(page.locator("#settings")).toContainText("Status and storage");
  await expect(page.locator("#settings")).toContainText("Mappings");
  await expect(page.locator("#settings")).toContainText("Workspace and loaded files");
  await expect(page.locator("#settings")).toContainText("Rule editor");
  await expect(page.locator("#settings")).toContainText("Danger zone");
  await expect(page.locator("#fo-settings-export-table-select")).toHaveCount(0);
  await expect
    .poll(async () => page.locator("#fo-settings-loaded-files-list-rebuild li").count())
    .toBeGreaterThan(0);
  await expect(page.locator("#fo-settings-status")).not.toHaveText("Idle");
  await expect(page.locator("#fo-settings-storage-usage")).toContainText("Storage:");
  await expect(page.locator("#fo-settings-mappings-summary")).not.toContainText("no data loaded");
});

test("mockups_lab settings storage telemetry resolves from placeholder to runtime status", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");
  const storageUsage = page.locator("#fo-settings-storage-usage");
  await expect
    .poll(async () => (await storageUsage.textContent())?.trim() || "")
    .not.toBe("Storage: unknown");

  const usageText = ((await storageUsage.textContent()) || "").trim();
  expect(usageText.startsWith("Storage:")).toBeTruthy();
  expect(
    usageText.includes("Persistent storage enabled.") ||
      usageText.includes("May be cleared under storage pressure") ||
      usageText.includes("unavailable")
  ).toBeTruthy();
});

test("mockups_lab settings toggles lifecycle busy-state and disables controls during CSV import", async (
  { page },
  testInfo
) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foLifecycleBusy || ""))
    .toBe("false");

  const computeBtn = page.locator("#fo-settings-run-compute-btn");
  await expect(computeBtn).toBeEnabled();

  const demoCsvPath = path.join(__dirname, "../../pkg/demo_dataset/extracted.csv");
  const demoCsvRaw = await fs.readFile(demoCsvPath, "utf8");
  const [demoHeader = "", ...demoBodyRows] = demoCsvRaw.split(/\r?\n/);
  const normalizedBodyRows = demoBodyRows.map((row) => row.trim()).filter(Boolean);
  expect(normalizedBodyRows.length).toBeGreaterThan(0);
  const repeatedRows = [];
  for (let i = 0; i < 16000; i += 1) {
    repeatedRows.push(normalizedBodyRows[i % normalizedBodyRows.length]);
  }
  const largeCsvContent = `${demoHeader}\n${repeatedRows.join("\n")}\n`;
  const largeCsvPathA = testInfo.outputPath("busy_state_large_a.csv");
  const largeCsvPathB = testInfo.outputPath("busy_state_large_b.csv");
  await fs.writeFile(largeCsvPathA, largeCsvContent, "utf8");
  await fs.writeFile(largeCsvPathB, largeCsvContent, "utf8");
  const importPromise = page.locator("#fo-import-csv-input").setInputFiles([largeCsvPathA, largeCsvPathB]);
  await expect
    .poll(
      async () =>
        page.evaluate(() => ({
          lifecycleBusy: document.body.dataset.foLifecycleBusy || "",
          computeDisabled: Boolean(document.getElementById("fo-settings-run-compute-btn")?.disabled),
        })),
      {
        message: "lifecycle busy-state and compute control should flip together while import+compute is running",
      }
    )
    .toEqual({
      lifecycleBusy: "true",
      computeDisabled: true,
    });

  await importPromise;
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foLifecycleBusy || ""), {
      message: "lifecycle busy-state should settle back to false after the import finishes",
    })
    .toBe("false");
  await expect(page.locator("#fo-settings-status")).toContainText("Imported 2 CSV file(s)");
  await expect(computeBtn).toBeEnabled();
});

test("mockups_lab settings CSV lifecycle controls support import and compute", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");
  await openSettingsWorkspaceDetails(page);

  const beforeFileCount = await page.locator("#fo-settings-loaded-files-list-rebuild li").count();
  const csvPath = path.join(__dirname, "../../pkg/demo_dataset/extracted.csv");
  await page.locator("#fo-import-csv-input").setInputFiles(csvPath);
  await expect(page.locator("#fo-settings-status")).toContainText("Imported 1 CSV file(s)");
  await expect(page.locator("#fo-settings-status")).toContainText("Recomputed");
  const importedExtractedRow = page
    .locator("#fo-settings-loaded-files-list-rebuild li")
    .filter({ hasText: /^extracted\.csv\b/ });
  await expect(importedExtractedRow).toHaveCount(1);
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild li")).toHaveCount(beforeFileCount + 1);

  await page.getByRole("button", { name: "Compute" }).click();
  await expect(page.locator("#fo-settings-status")).toContainText("Computed");
  await expect
    .poll(async () => Number(await page.evaluate(() => document.body.dataset.foRuntimeTables || "0")))
    .toBeGreaterThan(0);
});

test("mockups_lab settings mappings controls support JSON import/export and rule-editor flows", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");

  const templateDownloadPromise = page.waitForEvent("download");
  await page.locator("#fo-settings-download-template-mappings-btn").click();
  const templateDownload = await templateDownloadPromise;
  await expect(templateDownload.suggestedFilename()).toBe("mappings.template.json");
  const templatePath = await templateDownload.path();
  expect(templatePath).not.toBeNull();
  const templateJson = JSON.parse(await fs.readFile(templatePath, "utf8"));
  expect(templateJson).toHaveProperty("ownersByCardOwner");
  expect(templateJson).toHaveProperty("ownersByCardNumber");
  expect(templateJson).toHaveProperty("categoryByDetail");

  const currentDownloadPromise = page.waitForEvent("download");
  await page.locator("#fo-settings-download-mappings-btn").click();
  const currentDownload = await currentDownloadPromise;
  await expect(currentDownload.suggestedFilename()).toBe("mappings.current.json");
  const currentPath = await currentDownload.path();
  expect(currentPath).not.toBeNull();
  const currentJson = JSON.parse(await fs.readFile(currentPath, "utf8"));
  expect(currentJson).toHaveProperty("categoryByDetail");
  expect(Object.keys(currentJson.categoryByDetail || {}).length).toBeGreaterThan(0);

  const mappingsJsonPath = path.join(__dirname, "fixtures", "mockup_mappings.json");
  let confirmMessage = "";
  page.once("dialog", async (dialog) => {
    confirmMessage = dialog.message();
    await dialog.accept();
  });
  await page.locator("#fo-settings-import-mappings-input").setInputFiles(mappingsJsonPath);
  await expect
    .poll(() => confirmMessage, { message: "overwrite confirm should be shown for mappings JSON import" })
    .toContain("Replace current mappings?");
  await expect(page.locator("#fo-settings-status")).toContainText("Loaded mappings from mockup_mappings.json");
  await expect(page.locator("#fo-settings-mappings-summary")).toContainText("card-owner rule");

  await page.locator("#fo-settings-rule-editor-type").selectOption("ownersByCardNumber");
  await page.locator("#fo-settings-rule-editor-key").fill("INVALID");
  await page.locator("#fo-settings-rule-editor-value").fill("Owner Test");
  await page.locator("#fo-settings-rule-editor-save-btn").click();
  await expect(page.locator("#fo-settings-status")).toContainText(
    "Save rule failed: Card-number rule key must include at least 4 digits."
  );
  await expect(page.locator("#fo-settings-rule-editor-validation")).toContainText(
    "Card-number rule key must include at least 4 digits."
  );

  await page.locator("#fo-settings-rule-editor-type").selectOption("categoryByDetail");
  await page.locator("#fo-settings-rule-editor-search").fill("SUPERMARKET");
  const supermarketRow = page.locator("#fo-settings-rule-editor-body tr", { hasText: "SUPERMARKET" });
  await expect(supermarketRow).toBeVisible();

  await supermarketRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#fo-settings-rule-editor-key")).toHaveValue("SUPERMARKET");
  await expect(page.locator("#fo-settings-rule-editor-value")).toHaveValue("Food");

  await page.locator("#fo-settings-rule-editor-value").fill("Food Updated");
  await page.locator("#fo-settings-rule-editor-save-btn").click();
  await expect(page.locator("#fo-settings-status")).toContainText("Saved rule 'SUPERMARKET'");
  await expect(page.locator("#fo-settings-rule-editor-body")).toContainText("Food Updated");

  let deleteConfirmMessage = "";
  page.once("dialog", async (dialog) => {
    deleteConfirmMessage = dialog.message();
    await dialog.accept();
  });
  await supermarketRow.getByRole("button", { name: "Delete" }).click();
  await expect
    .poll(() => deleteConfirmMessage, {
      message: "rule editor delete should ask for confirmation",
    })
    .toContain("Delete rule 'SUPERMARKET'");
  await expect(page.locator("#fo-settings-status")).toContainText("Deleted rule 'SUPERMARKET'");
  await expect(page.locator("#fo-settings-rule-editor-body")).not.toContainText("SUPERMARKET");

  await page.locator("#fo-settings-clear-mappings-btn").click();
  await expect(page.locator("#fo-settings-status")).toContainText("Cleared mappings");
  await expect(page.locator("#fo-settings-mappings-summary")).toContainText("No mappings loaded.");
});

test("mockups_lab settings workspace and loaded-files controls support delete/export/import parity flows", async ({
  page,
}) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "settings");
  await openSettingsWorkspaceDetails(page);

  const loadedCheckboxes = page.locator('#fo-settings-loaded-files-list-rebuild input[type="checkbox"]');
  const initialCount = await loadedCheckboxes.count();
  expect(initialCount).toBeGreaterThan(0);

  const csvPath = path.join(__dirname, "../../pkg/demo_dataset/extracted.csv");
  await page.locator("#fo-import-csv-input").setInputFiles(csvPath);
  await expect(page.locator("#fo-settings-status")).toContainText("Imported 1 CSV file(s)");
  const importedExtractedRow = page
    .locator("#fo-settings-loaded-files-list-rebuild li")
    .filter({ hasText: /^extracted\.csv\b/ });
  await expect(importedExtractedRow).toHaveCount(1);
  await expect(loadedCheckboxes).toHaveCount(initialCount + 1);

  const exportAllDownloadPromise = page.waitForEvent("download");
  await page.locator("#fo-settings-export-all-csvs-btn").click();
  const exportAllDownload = await exportAllDownloadPromise;
  await expect(page.locator("#fo-settings-status")).toContainText("Exported");
  expect(exportAllDownload.suggestedFilename().toLowerCase().endsWith(".csv")).toBeTruthy();
  const exportAllPath = await exportAllDownload.path();
  expect(exportAllPath).not.toBeNull();

  const extractedCheckbox = page
    .locator("#fo-settings-loaded-files-list-rebuild li")
    .filter({ hasText: /^extracted\.csv\b/ })
    .locator('input[type="checkbox"]');
  await extractedCheckbox.check();
  await page.locator("#fo-settings-delete-selected-btn").click();
  await expect(page.locator("#fo-settings-status")).toContainText("Removed 1 file(s)");
  await expect(importedExtractedRow).toHaveCount(0);
  await expect(loadedCheckboxes).toHaveCount(initialCount);

  const workspaceDownloadPromise = page.waitForEvent("download");
  await page.locator("#fo-export-workspace-btn").click();
  const workspaceDownload = await workspaceDownloadPromise;
  await expect(workspaceDownload.suggestedFilename()).toBe("workspace.json");
  const workspacePath = await workspaceDownload.path();
  expect(workspacePath).not.toBeNull();
  const workspaceJson = JSON.parse(await fs.readFile(String(workspacePath), "utf8"));
  expect(Array.isArray(workspaceJson.csvFiles)).toBeTruthy();
  expect(workspaceJson.csvFiles.length).toBeGreaterThan(0);

  let replaceConfirmMessage = "";
  page.once("dialog", async (dialog) => {
    replaceConfirmMessage = dialog.message();
    await dialog.accept();
  });
  await page.locator("#fo-workspace-file-input").setInputFiles(String(workspacePath));
  await expect
    .poll(() => replaceConfirmMessage, {
      message: "workspace import should ask before replacing existing runtime state",
    })
    .toContain("Replace current data with workspace?");
  await expect(page.locator("#fo-settings-status")).toContainText("Imported workspace");

  await page.locator("#fo-settings-delete-all-btn").click();
  await expect(page.locator("#fo-settings-status")).toContainText("Deleted all loaded files and mappings.");
  await expect(page.locator("#fo-settings-loaded-files-list-rebuild")).toContainText("No files loaded.");
  await expect(page.locator("#fo-settings-mappings-summary")).toContainText("No mappings loaded.");
  await expect(page.locator("#fo-error-overlay")).toContainText("No CSV files loaded");
  await expect(page.locator("#fo-error-overlay")).toContainText("Load CSV(s) or import a workspace to continue.");

  await page.evaluate(() => document.getElementById("fo-settings-run-compute-btn")?.click());
  await expect(page.locator("#fo-settings-status")).toContainText(
    "No CSV files loaded. Load CSV(s) or import a workspace to continue."
  );

  await page.locator("#fo-workspace-file-input").setInputFiles(String(workspacePath));
  await expect(page.locator("#fo-settings-status")).toContainText("Imported workspace");
  await expect(loadedCheckboxes).toHaveCount(workspaceJson.csvFiles.length);
  await expect(page.locator("#fo-error-overlay")).toHaveCount(0);
});

test("mockups_lab full mockup raw explorer baseline filters rows", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await openView(page, "raw");
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(14);
  const columnControlsDetails = page.locator("#fo-raw-new-column-controls-details");
  const columnControlsSummary = page.locator("#fo-raw-new-column-controls-summary");
  expect(await columnControlsDetails.getAttribute("open")).toBeNull();
  await expect(columnControlsSummary).toContainText("Columns:");
  await page.locator("#fo-raw-new-column-controls-details > summary").click();
  await expect(columnControlsDetails).toHaveAttribute("open", "");
  await page.locator("#fo-raw-new-columns-preset-compact").click();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(11);
  await expect(columnControlsSummary).toContainText("11/14 visible");
  await expect(page.locator("#fo-raw-new-col-visible-receiptNumber")).not.toBeChecked();
  await page.locator("#fo-raw-new-columns-preset-all").click();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(14);
  await expect(columnControlsSummary).toContainText("14/14 visible");

  const monthSelect = page.locator("#fo-raw-new-filter-month");
  const ownerSelect = page.locator("#fo-raw-new-filter-owner");
  const typeSelect = page.locator("#fo-raw-new-filter-type");
  const downloadFilteredButton = page.locator("#fo-raw-new-download-filtered-btn");

  const monthOptions = await monthSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter((value) => value));
  if (monthOptions.length === 0) {
    await expect(page.locator("#fo-raw-new-meta")).toContainText("No strict runtime rows available");
    await expect(page.locator("#fo-raw-new-body tr")).toHaveCount(1);
    await expect(page.locator("#fo-raw-new-body")).toContainText("No rows match current filters.");
    return;
  }

  const detailVisibilityToggle = page.locator("#fo-raw-new-col-visible-detail");
  const receiptVisibilityToggle = page.locator("#fo-raw-new-col-visible-receiptNumber");
  await expect(detailVisibilityToggle).toBeChecked();
  await detailVisibilityToggle.uncheck();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(13);
  await expect(columnControlsSummary).toContainText("13/14 visible");
  await expect(page.locator("#fo-raw-new-col-filter-detail")).toHaveCount(0);
  await expect(page.locator("#fo-raw-new-meta")).toContainText("Visible columns: 13 of 14.");
  await detailVisibilityToggle.check();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(14);

  const detailColumnFilter = page.locator("#fo-raw-new-col-filter-detail");
  await expect(detailColumnFilter).toBeVisible();
  const monthValue = monthOptions[0];
  await monthSelect.selectOption(monthValue);

  const closeDates = await page.locator("#fo-raw-new-body tr td:nth-child(1)").allTextContents();
  expect(closeDates.length).toBeGreaterThan(0);
  for (const closeDate of closeDates) {
    expect(closeDate.trim().startsWith(String(monthValue))).toBeTruthy();
  }

  const detailCells = await page.locator("#fo-raw-new-body tr td:nth-child(10)").allTextContents();
  const detailSample = detailCells.find((value) => value && value.trim().length >= 3);
  if (detailSample) {
    const token = detailSample.trim().slice(0, Math.min(8, detailSample.trim().length));
    await detailColumnFilter.fill(token);
    const filteredDetails = await page.locator("#fo-raw-new-body tr td:nth-child(10)").allTextContents();
    expect(filteredDetails.length).toBeGreaterThan(0);
    for (const detail of filteredDetails) {
      expect(detail.toLowerCase()).toContain(token.toLowerCase());
    }
    await detailColumnFilter.fill("");
  }

  const ownerValue = (
    await page.locator("#fo-raw-new-body tr td:nth-child(7)").allTextContents()
  )
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (ownerValue) {
    await ownerSelect.selectOption(ownerValue);

    const owners = await page.locator("#fo-raw-new-body tr td:nth-child(7)").allTextContents();
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) {
      expect(owner.trim()).toBe(ownerValue);
    }
  }

  const typeValue = (
    await page.locator("#fo-raw-new-body tr td:nth-child(8)").allTextContents()
  )
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (typeValue) {
    await typeSelect.selectOption(typeValue);

    const types = await page.locator("#fo-raw-new-body tr td:nth-child(8)").allTextContents();
    expect(types.length).toBeGreaterThan(0);
    for (const movementType of types) {
      expect(movementType.trim()).toBe(typeValue);
    }
  }

  await expect(downloadFilteredButton).toBeEnabled();
  const visibleFilteredRowCount = await page.locator("#fo-raw-new-body tr").count();
  const downloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("raw_data_filtered_");
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const downloadCsv = await fs.readFile(downloadPath, "utf8");
  const downloadLines = downloadCsv.trim().split(/\r?\n/);
  expect(downloadLines[0]).toContain("Card Close Date");
  expect(downloadLines[0]).toContain("Movement Type");
  expect(downloadLines.length).toBe(visibleFilteredRowCount + 1);
  if (typeValue) {
    for (const line of downloadLines.slice(1)) {
      expect(line).toContain(";" + typeValue + ";");
    }
  }

  await receiptVisibilityToggle.uncheck();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(13);

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(monthSelect).toHaveValue("");
  await expect(ownerSelect).toHaveValue("");
  await expect(typeSelect).toHaveValue("");
  await expect(detailVisibilityToggle).toBeChecked();
  await expect(receiptVisibilityToggle).toBeChecked();
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(14);
  await expect(detailColumnFilter).toHaveValue("");
});

test("rebuilt raw explorer paginates filtered rows with direct page access and exports the full filtered set", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);
  await expect
    .poll(async () => page.evaluate(() => document.body.dataset.foRuntimeMode || ""))
    .toBe("strict");

  await page.locator("#fo-nav-raw").click();
  await expect(page.locator("#raw")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#raw")).not.toContainText("Payment method split");
  await expect(page.locator("#fo-raw-new-table thead th")).toHaveCount(14);
  await expect(page.locator("#fo-raw-new-active-filters")).toContainText("Active filters:");
  await expect(page.locator("#fo-raw-new-active-filters")).toContainText("none");

  const monthSelect = page.locator("#fo-raw-new-filter-month");
  const pageStrip = page.locator("#fo-raw-new-page-strip");
  const metaNode = page.locator("#fo-raw-new-meta");
  const downloadFilteredButton = page.locator("#fo-raw-new-download-filtered-btn");

  const monthOptions = await monthSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter((value) => value));
  if (monthOptions.length === 0) {
    await expect(metaNode).toContainText("No strict runtime rows available");
    await expect(page.locator("#fo-raw-new-body tr")).toHaveCount(1);
    await expect(page.locator("#fo-raw-new-body")).toContainText("No rows match current filters.");
    return;
  }

  await expect(page.locator("#fo-raw-new-column-controls-summary")).toContainText("Columns:");
  await expect(pageStrip).toBeVisible();

  const initialPagination = await page.evaluate(() => {
    const metaText = String(document.querySelector("#fo-raw-new-meta")?.textContent || "");
    const metaMatch = /Showing rows (\d+)-(\d+) of (\d+) filtered rows/.exec(metaText);
    const pages = Array.from(document.querySelectorAll("#fo-raw-new-page-strip [data-fo-raw-page]"))
      .map((node) => Number(node.getAttribute("data-fo-raw-page") || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    return {
      start: metaMatch ? Number(metaMatch[1]) : 0,
      end: metaMatch ? Number(metaMatch[2]) : 0,
      total: metaMatch ? Number(metaMatch[3]) : 0,
      totalPages: pages.length ? Math.max(...pages) : 1,
    };
  });

  if (initialPagination.totalPages > 1) {
    await page.locator('#fo-raw-new-page-strip [data-fo-raw-page="2"]').click();
    await expect(page.locator('#fo-raw-new-page-strip [aria-current="page"]')).toHaveText("2");
    const secondPageMeta = await page.evaluate(() => {
      const metaText = String(document.querySelector("#fo-raw-new-meta")?.textContent || "");
      const metaMatch = /Showing rows (\d+)-(\d+) of (\d+) filtered rows/.exec(metaText);
      return {
        start: metaMatch ? Number(metaMatch[1]) : 0,
        end: metaMatch ? Number(metaMatch[2]) : 0,
        total: metaMatch ? Number(metaMatch[3]) : 0,
      };
    });
    expect(secondPageMeta.start).toBeGreaterThan(1);
    await page.locator('#fo-raw-new-page-strip [data-fo-raw-page="1"]').click();
    await expect(page.locator('#fo-raw-new-page-strip [aria-current="page"]')).toHaveText("1");
  }

  const currentPageRowCount = await page.locator("#fo-raw-new-body tr").count();
  const filteredSnapshot = await page.evaluate(() => {
    const metaText = String(document.querySelector("#fo-raw-new-meta")?.textContent || "");
    const metaMatch = /Showing rows (\d+)-(\d+) of (\d+) filtered rows/.exec(metaText);
    return {
      total: metaMatch ? Number(metaMatch[3]) : 0,
    };
  });
  await expect(downloadFilteredButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const downloadCsv = await fs.readFile(downloadPath, "utf8");
  const downloadLines = downloadCsv.trim().split(/\r?\n/);
  expect(downloadLines[0]).toContain("Card Close Date");
  expect(downloadLines.length).toBe(filteredSnapshot.total + 1);
  if (filteredSnapshot.total > currentPageRowCount) {
    expect(downloadLines.length).toBeGreaterThan(currentPageRowCount + 1);
  }

  const monthValue = monthOptions[0];
  await monthSelect.selectOption(monthValue);
  await expect(page.locator('#fo-raw-new-page-strip [aria-current="page"]')).toHaveText("1");
  const monthChip = page.locator('#fo-raw-new-active-filters [data-fo-raw-filter-key="month"]');
  await expect(monthChip).toContainText(`Statement Month: ${monthValue}`);
  const closeDates = await page.locator("#fo-raw-new-body tr td:nth-child(1)").allTextContents();
  expect(closeDates.length).toBeGreaterThan(0);
  for (const closeDate of closeDates) {
    expect(closeDate.trim().startsWith(String(monthValue))).toBeTruthy();
  }
});

test("rebuilt raw explorer sensitive profile keeps multi-page filters and filtered CSV export consistent", async ({
  page,
}) => {
  test.skip(
    !HAS_SENSITIVE_FIXTURES,
    "Sensitive fixtures are private-only; skip sensitive raw multi-page smoke when unavailable in OSS worktrees."
  );

  await page.goto(`${CANONICAL_MOCKUP_ENTRY}?entry=sensitive-shortcut`);
  await expect
    .poll(async () => page.evaluate(() => String(document.body.dataset.foBootState || "")))
    .toBe("ready");

  await page.locator("#fo-nav-raw").click();
  await expect(page.locator("#raw")).toHaveAttribute("aria-hidden", "false");

  const monthSelect = page.locator("#fo-raw-new-filter-month");
  const ownerSelect = page.locator("#fo-raw-new-filter-owner");
  const typeSelect = page.locator("#fo-raw-new-filter-type");
  const detailColumnFilter = page.locator("#fo-raw-new-col-filter-detail");
  const resetButton = page.getByRole("button", { name: "Reset filters" });
  const downloadFilteredButton = page.locator("#fo-raw-new-download-filtered-btn");
  const pageStrip = page.locator("#fo-raw-new-page-strip");
  const activePageButton = page.locator('#fo-raw-new-page-strip [aria-current="page"]');

  await expect(pageStrip).toBeVisible();
  await expect
    .poll(async () => (await readRebuiltRawMeta(page)).total)
    .toBeGreaterThan(100);
  await expect(page.locator("#fo-raw-new-body tr")).toHaveCount(100);

  const initialMeta = await readRebuiltRawMeta(page);
  const initialVisibleRowCount = await page.locator("#fo-raw-new-body tr").count();
  expect(initialMeta.total).toBeGreaterThan(initialVisibleRowCount);

  const maxVisiblePage = await page.evaluate(() => {
    return Math.max(
      ...Array.from(document.querySelectorAll("#fo-raw-new-page-strip [data-fo-raw-page]")).map((node) =>
        Number(node.getAttribute("data-fo-raw-page") || 0)
      )
    );
  });
  expect(maxVisiblePage).toBeGreaterThan(1);
  await page.locator(`#fo-raw-new-page-strip [data-fo-raw-page="${maxVisiblePage}"]`).click();
  await expect(activePageButton).toHaveText(String(maxVisiblePage));
  const lastPageMeta = await readRebuiltRawMeta(page);
  expect(lastPageMeta.end).toBe(lastPageMeta.total);

  const unfilteredDownloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const unfilteredDownload = await unfilteredDownloadPromise;
  const unfilteredCsv = await fs.readFile(await unfilteredDownload.path(), "utf8");
  const unfilteredLines = unfilteredCsv.trim().split(/\r?\n/);
  expect(unfilteredLines.length).toBe(initialMeta.total + 1);
  expect(unfilteredLines.length).toBeGreaterThan(initialVisibleRowCount + 1);

  await resetButton.click();
  await expect(activePageButton).toHaveText("1");

  const typeOptions = await typeSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter((value) => value));
  const typeValue = typeOptions.includes("CardMovement") ? "CardMovement" : typeOptions[0];
  expect(typeValue).toBeTruthy();
  await typeSelect.selectOption(typeValue);
  await expect(activePageButton).toHaveText("1");
  await expect(page.locator('#fo-raw-new-active-filters [data-fo-raw-filter-key="type"]')).toContainText(
    `Movement Type: ${typeValue}`
  );
  const typeTexts = await page.locator("#fo-raw-new-body tr td:nth-child(8)").allTextContents();
  expect(typeTexts.length).toBeGreaterThan(0);
  for (const typeText of typeTexts) {
    expect(typeText.trim()).toBe(typeValue);
  }
  const typeMeta = await readRebuiltRawMeta(page);
  const typeVisibleRowCount = await page.locator("#fo-raw-new-body tr").count();
  const typeDownloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const typeDownload = await typeDownloadPromise;
  const typeCsv = await fs.readFile(await typeDownload.path(), "utf8");
  const typeLines = typeCsv.trim().split(/\r?\n/);
  expect(typeLines.length).toBe(typeMeta.total + 1);
  if (typeMeta.total > typeVisibleRowCount) {
    expect(typeLines.length).toBeGreaterThan(typeVisibleRowCount + 1);
  }
  for (const line of typeLines.slice(1)) {
    expect(line).toContain(";" + typeValue + ";");
  }

  await resetButton.click();
  await expect(activePageButton).toHaveText("1");

  const ownerOptions = await ownerSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter((value) => value));
  const ownerValue = ownerOptions[0];
  expect(ownerValue).toBeTruthy();
  await ownerSelect.selectOption(ownerValue);
  await expect(activePageButton).toHaveText("1");
  await expect(page.locator('#fo-raw-new-active-filters [data-fo-raw-filter-key="owner"]')).toContainText(
    `Card Owner: ${ownerValue}`
  );
  const ownerTexts = await page.locator("#fo-raw-new-body tr td:nth-child(7)").allTextContents();
  expect(ownerTexts.length).toBeGreaterThan(0);
  for (const ownerText of ownerTexts) {
    expect(ownerText.trim()).toBe(ownerValue);
  }
  const ownerMeta = await readRebuiltRawMeta(page);
  const ownerDownloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const ownerDownload = await ownerDownloadPromise;
  const ownerCsv = await fs.readFile(await ownerDownload.path(), "utf8");
  const ownerLines = ownerCsv.trim().split(/\r?\n/);
  expect(ownerLines.length).toBe(ownerMeta.total + 1);

  await resetButton.click();
  await expect(activePageButton).toHaveText("1");

  const monthOptions = await monthSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter((value) => value));
  const monthValue = monthOptions[0];
  expect(monthValue).toBeTruthy();
  await monthSelect.selectOption(monthValue);
  await expect(activePageButton).toHaveText("1");
  await expect(page.locator('#fo-raw-new-active-filters [data-fo-raw-filter-key="month"]')).toContainText(
    `Statement Month: ${monthValue}`
  );
  const closeDates = await page.locator("#fo-raw-new-body tr td:nth-child(1)").allTextContents();
  expect(closeDates.length).toBeGreaterThan(0);
  for (const closeDate of closeDates) {
    expect(closeDate.trim().startsWith(String(monthValue))).toBeTruthy();
  }

  await resetButton.click();
  await expect(activePageButton).toHaveText("1");

  const detailText = String((await page.locator("#fo-raw-new-body tr td:nth-child(10)").first().textContent()) || "");
  const detailNeedle =
    detailText
      .split(/\s+/)
      .map((part) => part.trim())
      .find((part) => part.length >= 4) || detailText.trim().slice(0, 4);
  expect(detailNeedle.length).toBeGreaterThanOrEqual(3);
  await detailColumnFilter.fill(detailNeedle);
  await expect(page.locator("#fo-raw-new-meta")).toContainText("Column filters active: 1.");
  await expect(activePageButton).toHaveText("1");
  const detailTexts = await page.locator("#fo-raw-new-body tr td:nth-child(10)").allTextContents();
  expect(detailTexts.length).toBeGreaterThan(0);
  for (const value of detailTexts) {
    expect(value.toLowerCase()).toContain(detailNeedle.toLowerCase());
  }
  const detailMeta = await readRebuiltRawMeta(page);
  const detailDownloadPromise = page.waitForEvent("download");
  await downloadFilteredButton.click();
  const detailDownload = await detailDownloadPromise;
  const detailCsv = await fs.readFile(await detailDownload.path(), "utf8");
  const detailLines = detailCsv.trim().split(/\r?\n/);
  expect(detailLines.length).toBe(detailMeta.total + 1);
});

test("canonical app keeps strict runtime even when hybrid mode is requested", async ({ page }) => {
  await page.goto(CANONICAL_MOCKUP_ENTRY);

  const state = await page.evaluate(async () => {
    const model = await window.FinanceOverview.loadModel({ basePath: window.__FO_APP_BASE_PATH__ || "./", runtimeMode: "hybrid" });
    return {
      modelMode: model.runtimeMode || "",
      markerMode: document.body.dataset.foRuntimeMode || "",
      monthCount: Array.isArray(model.months) ? model.months.length : 0,
    };
  });

  expect(state.modelMode).toBe("strict");
  expect(state.markerMode).toBe("strict");
  expect(state.monthCount).toBeGreaterThan(0);
});

test("canonical app shows blocking overlay when required startup data is missing", async ({ page }) => {
  await page.route("**/mockups_lab/tmp_public_data/current/demo_extracted.csv*", async (route) => {
    await route.abort("failed");
  });

  await page.goto(CANONICAL_MOCKUP_ENTRY);

  const overlay = page.locator("#fo-error-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Blocking startup error");
});
