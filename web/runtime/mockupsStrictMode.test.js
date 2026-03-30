import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");

test("finance-overview uses strict runtime model without legacy/hybrid compute path", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /var model = buildModelFromRuntime\(runtimeSnapshot\);/);
  assert.equal(/function buildModel\(/.test(source), false);
  assert.equal(/function applyStrictOverviewProjection\(/.test(source), false);
  assert.equal(/model\.runtimeMode\s*=\s*"hybrid"/.test(source), false);
});

test("finance-overview labels DQ findings as warnings (not invalid-row errors)", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.equal(/Invalid rows skipped/.test(source), false);
  assert.match(source, /Data quality warnings:/);
  assert.match(source, /Uncategorized:/);
  assert.match(source, /Unmapped owners:/);
  assert.match(source, /fo-dq-review-link/);
});

test("integrated mockup exposes DQ review CTA copy in HTML shell", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );

  assert.match(source, /Latest statement month:/);
  assert.match(source, /Data quality warnings:/);
  assert.match(source, /id="fo-topbar-dq-summary"/);
  assert.match(source, /id="fo-latest-month-note"/);
  assert.match(source, /id="fo-dq-review-link"/);
  assert.match(source, /Demo data loads by default\. Delete loaded files and load your own CSVs to start fresh\./);
  assert.match(source, />Review in Data Quality</);
});

test("root index keeps the canonical app shell as the single HTML source", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );

  assert.match(html, /<aside class="sidebar">/);
  assert.match(html, /<div class="topbar">/);
  assert.match(html, /<section id="overview" class="page active" aria-labelledby="fo-nav-overview" data-fo-view-variant="new">/);
  assert.match(html, /<section id="debt" class="page" aria-labelledby="fo-nav-debt" data-fo-view-variant="new" hidden>/);
  assert.match(html, /<section id="owners" class="page" aria-labelledby="fo-nav-owners" data-fo-view-variant="new" hidden>/);
  assert.match(html, /<section id="categories" class="page" aria-labelledby="fo-nav-categories" data-fo-view-variant="new" hidden>/);
  assert.match(html, /<section id="dq" class="page" aria-labelledby="fo-nav-dq" data-fo-view-variant="new" hidden>/);
  assert.match(html, /<section id="raw" class="page" aria-labelledby="fo-nav-raw" data-fo-view-variant="new" hidden>/);
  assert.match(html, /<section id="settings" class="page" aria-labelledby="fo-nav-settings" data-fo-view-variant="new" hidden>/);
  assert.equal(/overview-old/.test(html), false);
  assert.equal(/debt-old/.test(html), false);
  assert.equal(/owners-old/.test(html), false);
  assert.equal(/categories-old/.test(html), false);
  assert.equal(/dq-old/.test(html), false);
  assert.equal(/raw-old/.test(html), false);
  assert.equal(/settings-old/.test(html), false);
  assert.equal(/Workspace:\s*<span/.test(html), false);
  assert.equal(/Local-first/.test(html), false);
  assert.equal(/Minimal mockup/.test(html), false);
  assert.equal(/@include /.test(html), false);

  await assert.rejects(
    fs.access(path.join(WEB_ROOT, "mockups_lab", "app", "templates", "finance_analyzer_mockup.template.html")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    fs.access(path.join(WEB_ROOT, "scripts", "lib", "mockupHtmlGenerator.mjs")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    fs.access(path.join(WEB_ROOT, "mockups_lab", "finance_analyzer_mockup.html")),
    { code: "ENOENT" }
  );
});

test("integrated mockup sidebar navigation exposes ARIA wiring for section switching", async () => {
  const [html, routerSource, sidebarSource, bootSource, mainSource] = await Promise.all([
    fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shell", "router.js"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shell", "sidebar.js"), "utf8"),
    fs.readFile(
      path.join(WEB_ROOT, "mockups_lab", "app", "boot", "startFinanceOverview.js"),
      "utf8"
    ),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "main.js"), "utf8"),
  ]);

  assert.match(html, /<nav class="nav" aria-label="Primary sections">/);
  assert.match(html, /id="fo-nav-overview"/);
  assert.match(html, /id="fo-nav-settings"/);
  assert.match(html, /aria-controls="overview"/);
  assert.match(html, /aria-controls="settings"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /section id="debt" class="page" aria-labelledby="fo-nav-debt" data-fo-view-variant="new" hidden/);
  assert.match(html, /<script type="module" src="\.\/mockups_lab\/app\/main\.js"><\/script>/);
  assert.equal(/const quickJumpSelect = document\.getElementById/.test(html), false);
  assert.equal(/show\('overview'\);/.test(html), false);
  assert.match(routerSource, /export function createShellRouter/);
  assert.match(routerSource, /pageNode\.hidden = !isActive;/);
  assert.match(routerSource, /setAttribute\("aria-hidden", isActive \? "false" : "true"\)/);
  assert.match(routerSource, /setAttribute\("aria-current", isActive \? "page" : "false"\)/);
  assert.equal(/quickJumpSelect/.test(routerSource), false);
  assert.match(sidebarSource, /export function bindSidebarNavigation/);
  assert.equal(/fo-nav-jump-select/.test(sidebarSource), false);
  assert.match(mainSource, /router\.show\("overview"\);/);
  assert.match(mainSource, /function resolveAppBasePath/);
  assert.match(mainSource, /window\.__FO_APP_BASE_PATH__ = appBasePath/);
  assert.match(mainSource, /bootConfig:\s*\{[\s\S]*basePath:\s*appBasePath,[\s\S]*\}/);
  assert.match(mainSource, /startFinanceOverview/);
  assert.match(bootSource, /export async function startFinanceOverview/);
  assert.match(bootSource, /await scope\.__foFinanceOverviewReady/);
  assert.match(bootSource, /scope\.FinanceOverview\.boot\(\{ variant, \.\.\.bootConfig \}\);/);
});

test("integrated mockup externalizes canonical CSS into ownership-specific files", async () => {
  const [
    html,
    tokensCss,
    shellCss,
    primitivesCss,
    priorityStripCss,
    controlsCss,
    overviewCss,
    debtCss,
    categoriesCss,
    dqCss,
    rawCss,
    settingsCss,
  ] = await Promise.all([
    fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "theme", "tokens.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shell", "shell.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shared", "primitives.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shared", "priority-strip.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shared", "controls.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "overview", "overview.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "debt", "debt.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "categories", "categories.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "dq", "dq.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "raw", "raw.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "settings", "settings.css"), "utf8"),
  ]);

  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/theme\/tokens\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/shell\/shell\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/shared\/primitives\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/shared\/priority-strip\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/shared\/controls\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/overview\/overview\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/debt\/debt\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/categories\/categories\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/dq\/dq\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/raw\/raw\.css"\/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/mockups_lab\/app\/views\/settings\/settings\.css"\/>/);
  assert.equal(/<style>/.test(html), false);
  assert.equal(/\.sidebar \{/.test(html), false);
  assert.equal(/\.topbar \{/.test(html), false);
  assert.equal(/\.fo-stage1-skeleton::after \{/.test(html), false);
  assert.equal(/\.fo-debt-priority-strip \{/.test(html), false);
  assert.equal(/\.raw-table-wrap table thead th \{/.test(html), false);
  assert.match(tokensCss, /--bg: #0b0c0f;/);
  assert.match(shellCss, /\.sidebar \{/);
  assert.match(shellCss, /\.topbar \{/);
  assert.match(shellCss, /\.page\[hidden\] \{/);
  assert.match(primitivesCss, /\.btn \{/);
  assert.match(primitivesCss, /\.card \{/);
  assert.match(primitivesCss, /\.fo-table-scroll > table \{/);
  assert.match(priorityStripCss, /\.fo-overview-priority-strip \{/);
  assert.match(priorityStripCss, /\.fo-overview-priority-chip strong \{/);
  assert.match(controlsCss, /\.fo-inline-controls \{/);
  assert.match(controlsCss, /\.fo-collapsible > summary \{/);
  assert.match(overviewCss, /\.fo-overview-metric-help-note \{/);
  assert.match(overviewCss, /\.fo-metric-help \{/);
  assert.match(overviewCss, /\.fo-metric-help-tooltip \{/);
  assert.match(overviewCss, /\.fo-overview-snapshot-table tbody tr:not\(\.fo-stage1-skeleton-row\)/);
  assert.match(overviewCss, /@keyframes fo-stage1-shimmer/);
  assert.match(debtCss, /\.fo-debt-priority-strip \{/);
  assert.match(debtCss, /#debt \.card \{/);
  assert.match(debtCss, /overflow: visible;/);
  assert.match(debtCss, /\.fo-debt-priority-label \.fo-metric-help-wrap\[data-open="true"\] \.fo-metric-help-tooltip \{/);
  assert.match(debtCss, /opacity: 1;/);
  assert.match(debtCss, /visibility: visible;/);
  assert.match(debtCss, /\.fo-debt-empty-state \{/);
  assert.match(categoriesCss, /\.fo-categories-new-rank-grid/);
  assert.match(categoriesCss, /\.fo-categories-new-mom-grid/);
  assert.match(categoriesCss, /#fo-categories-new-table-ars th/);
  assert.match(dqCss, /\.dq-summary-grid \{/);
  assert.match(dqCss, /#fo-dq-new-issues-table th:nth-child\(6\)/);
  assert.match(rawCss, /\.raw-table-wrap table thead th \{/);
  assert.match(rawCss, /#fo-raw-new-table thead tr:nth-child\(2\) td \{/);
  assert.match(rawCss, /\.raw-pagination \{/);
  assert.match(settingsCss, /\.fo-control-grid \{/);
  assert.match(settingsCss, /#fo-rule-editor-validation/);
});

test("integrated mockup CSS includes dense-table ergonomics hooks for sticky headers and readable DQ text", async () => {
  const [rawCss, dqCss] = await Promise.all([
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "raw", "raw.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "dq", "dq.css"), "utf8"),
  ]);

  assert.match(rawCss, /\.raw-table-wrap table thead th \{/);
  assert.match(rawCss, /position: sticky;/);
  assert.match(rawCss, /#fo-raw-new-table thead tr:nth-child\(2\) td \{/);
  assert.match(rawCss, /\.raw-page-strip \{/);
  assert.match(rawCss, /\.raw-page-chip \{/);
  assert.match(rawCss, /top: 37px;/);
  assert.match(dqCss, /#fo-dq-new-issues-table th:nth-child\(6\)/);
  assert.match(dqCss, /white-space: normal;/);
  assert.match(dqCss, /\.fo-dq-table-stage \{/);
  assert.match(dqCss, /max-height: 62vh;/);
  assert.match(dqCss, /\.fo-dq-table-stage thead th \{/);
  assert.match(dqCss, /position: sticky;/);
});

test("rebuilt data-quality MVP exposes a single summary-and-table shell", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /<section id="dq" class="page" aria-labelledby="fo-nav-dq" data-fo-view-variant="new" hidden>/);
  assert.match(html, /id="fo-dq-new-meta"/);
  assert.match(html, /id="fo-dq-new-summary-total"/);
  assert.match(html, /id="fo-dq-new-summary-category"/);
  assert.match(html, /id="fo-dq-new-summary-owner"/);
  assert.match(html, /id="fo-dq-new-note"/);
  assert.match(html, /id="fo-dq-new-pagination"/);
  assert.match(html, /id="fo-dq-new-prev"/);
  assert.match(html, /id="fo-dq-new-page"/);
  assert.match(html, /id="fo-dq-new-next"/);
  assert.match(html, /id="fo-dq-new-issues-table"/);
  assert.match(html, /id="fo-dq-new-issues-body"/);
  assert.equal(/Data Quality rebuild surface/.test(html), false);
  assert.match(source, /function renderDqRebuiltSection/);
  assert.match(source, /var DQ_REBUILT_PAGE_SIZE = 50;/);
  assert.match(source, /var dqRebuiltTableState = \{/);
  assert.match(source, /renderDqIssueTable\(issuesBody,\s*pagedIssues,\s*DQ_RULE_FILTER\.ALL,\s*\{/);
  assert.match(source, /limit:\s*null/);
  assert.match(source, /Showing rows /);
  assert.match(source, /Page /);
  assert.match(source, /Missing category mappings:/);
  assert.match(source, /Missing owner mappings:/);
});

test("integrated overview shell uses decision-order copy without placeholder headings", async () => {
  const [source, primitivesCss, overviewCss] = await Promise.all([
    fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "shared", "primitives.css"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "overview", "overview.css"), "utf8"),
  ]);

  assert.match(source, /id="fo-overview-new-kpi-title"/);
  assert.match(source, /id="fo-overview-metric-help-note"/);
  assert.match(source, /the info buttons in the <strong>Metric<\/strong> column for short definitions\./);
  assert.match(source, /id="fo-overview-new-table"/);
  assert.match(source, /class="fo-overview-snapshot-table"/);
  assert.match(source, /id="fo-overview-q001-title"/);
  assert.match(source, /Where did our money go this month\?/);
  assert.match(source, /id="fo-overview-statement-table"/);
  assert.match(source, /id="fo-overview-categories-table"/);
  assert.match(source, /id="fo-overview-q34-title"/);
  assert.match(source, /id="fo-overview-q34-meta"/);
  assert.match(source, /id="fo-overview-q3-table"/);
  assert.match(source, /id="fo-overview-q4-table"/);
  assert.match(source, /id="fo-overview-q8-title"/);
  assert.match(source, /id="fo-overview-q8-meta"/);
  assert.match(source, /id="fo-overview-q8-host"/);
  assert.match(source, /https:\/\/code\.highcharts\.com\/12\.5\.0\/highcharts\.js/);
  assert.match(source, /https:\/\/code\.highcharts\.com\/12\.5\.0\/themes\/dark-unica\.js/);
  assert.match(source, /Statement composition \(ARS\)/);
  assert.match(source, /Top categories within card movements \(ARS\)/);
  assert.match(source, /What changed vs last month\?/);
  assert.match(source, /Biggest increases \(ARS\)/);
  assert.match(source, /Biggest decreases \(ARS\)/);
  assert.match(source, /Is total debt growing or shrinking\?/);
  assert.match(overviewCss, /\.fo-overview-q001-grid/);
  assert.match(overviewCss, /\.fo-overview-q001-table th/);
  assert.match(overviewCss, /\.fo-overview-q34-grid/);
  assert.match(overviewCss, /\.fo-overview-q34-table th/);
  assert.match(overviewCss, /#fo-overview-q8-host/);
  assert.match(source, /Monthly snapshot \(latest vs previous\)/);
  assert.match(source, /class="fo-table-scroll"/);
  assert.match(primitivesCss, /\.fo-table-scroll \{/);
  assert.match(primitivesCss, /overflow-x: auto;/);
  assert.match(overviewCss, /\.fo-overview-snapshot-table th,/);
  assert.match(overviewCss, /text-align: center;/);
  assert.match(overviewCss, /\.fo-metric-help-wrap\[data-open="true"\] \.fo-metric-help-tooltip \{/);
  assert.match(source, />Latest ARS</);
  assert.match(source, />Prev ARS</);
  assert.match(source, />Δ ARS</);
  assert.match(source, />Δ % ARS</);
  assert.match(source, />Latest USD</);
  assert.match(source, />Prev USD</);
  assert.match(source, />Δ USD</);
  assert.match(source, />Δ % USD</);
  assert.equal(/>LatestARS</.test(source), false);
  assert.equal(/>PrevARS</.test(source), false);
  assert.equal(/>LatestUSD</.test(source), false);
  assert.equal(/>PrevUSD</.test(source), false);
});

test("obsolete launcher and prototype HTML surfaces are removed from the public tree", async () => {
  const removedHtmls = [
    path.join(WEB_ROOT, "mockups_lab", "index.html"),
    path.join(WEB_ROOT, "mockups_lab", "reference_pack", "examples", "kpi-comparison-table.html"),
    path.join(WEB_ROOT, "mockups_lab", "reference_pack", "examples", "dual-currency-trends.html"),
    path.join(WEB_ROOT, "mockups_lab", "reference_pack", "examples", "top-drivers-ranking-bars.html"),
    path.join(WEB_ROOT, "mockups_lab", "reference_pack", "examples", "blocking-error-state.html"),
    path.join(WEB_ROOT, "mockups_lab", "reference_pack", "examples", "overview-trend-readability-lab.html"),
  ];

  for (const filePath of removedHtmls) {
    await assert.rejects(fs.access(filePath), { code: "ENOENT" });
  }
});

test("finance-overview resolves load profile by entrypoint and passes it to runtime bundle loading", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /var LOAD_PROFILE = Object\.freeze/);
  assert.match(source, /function resolveLoadProfile/);
  assert.match(source, /entry === "sensitive-shortcut"/);
  assert.match(source, /tmp_public_data\/current\/demo_extracted\.csv/);
  assert.match(source, /loadProfile:\s*bootConfig\.loadProfile/);
  assert.match(source, /dataset\.foLoadProfile/);
});

test("finance-overview semantic direction keeps full metric polarity contract", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /var IMPROVEMENT_DIRECTION = \{/);
  assert.match(source, /netStatement:\s*-1/);
  assert.match(source, /cardMovements:\s*-1/);
  assert.match(source, /newDebt:\s*-1/);
  assert.match(source, /carryOverDebt:\s*-1/);
  assert.match(source, /nextMonthDebt:\s*-1/);
  assert.match(source, /remainingDebt:\s*-1/);
  assert.match(source, /taxes:\s*-1/);
  assert.match(source, /pastPayments:\s*1/);
  assert.match(source, /function semanticClass\(metricKey,\s*delta\)/);
  assert.match(source, /var direction = IMPROVEMENT_DIRECTION\[metricKey\] \|\| 1/);
  assert.match(source, /return improving \? "fo-cell-pos" : "fo-cell-neg";/);
});

test("finance-overview renders payment-semantics reconciliation and explicit total-debt summary", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function renderPaymentSemanticsNote/);
  assert.match(source, /function renderOverviewSnapshotTables/);
  assert.match(source, /var OVERVIEW_METRIC_HELP_TEXT = Object\.freeze\(\{/);
  assert.match(source, /function attachOverviewMetricHelpHandlers/);
  assert.match(source, /function appendMetricCell/);
  assert.match(source, /function buildOverviewStatementCompositionProjection/);
  assert.match(source, /function renderOverviewStatementCompositionTable/);
  assert.match(source, /function buildOverviewCategoryShareProjection/);
  assert.match(source, /function renderOverviewCategoryShareTable/);
  assert.match(source, /function renderOverviewCategoryDeltaTable/);
  assert.match(source, /function setOverviewMetaDescription/);
  assert.match(source, /function renderOverviewQ001Section/);
  assert.match(source, /function renderOverviewQ003Q004Section/);
  assert.match(source, /function renderOverviewQ008Section/);
  assert.match(source, /function buildOverviewDebtDirectionProjection/);
  assert.match(source, /function buildStatementMonthCloseDateMap/);
  assert.match(source, /function buildOverviewDebtDirectionChartConfig/);
  assert.match(source, /function renderOverviewDebtDirectionHighchartsHost/);
  assert.match(source, /function mapChartTypeToHighcharts/);
  assert.match(source, /function buildHighchartsSeriesCollection/);
  assert.match(source, /function buildChartJsLikeTooltipContextFromHighcharts/);
  assert.match(source, /document\.getElementById\("fo-overview-new-table"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-statement-body"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-categories-body"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-q34-meta"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-q3-body"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-q4-body"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-q8-meta"\)/);
  assert.match(source, /document\.getElementById\("fo-overview-q8-host"\)/);
  assert.match(source, /renderOverviewDebtDirectionHighchartsHost\(host,\s*buildOverviewDebtDirectionChartConfig\(model\)\)/);
  assert.match(source, /function renderHighchartsOnContainer/);
  assert.match(source, /Highcharts runtime is missing\. Expected the pinned official CDN asset to load first\./);
  assert.match(source, /renderDualHighchartsHost\(host,\s*configs\)/);
  assert.match(source, /closeDateLabel/);
  assert.match(source, /Close date:/);
  assert.match(source, /gridLineWidth:\s*1/);
  assert.match(source, /tickInterval:\s*1/);
  assert.match(source, /tickWidth:\s*1/);
  assert.match(source, /tickAmount:\s*6/);
  assert.match(source, /metricHelpByKey:\s*OVERVIEW_METRIC_HELP_TEXT/);
  assert.match(source, /Total remaining installments/);
  assert.match(source, /document\.getElementById\("fo-overview-new-table"\)/);
  assert.match(source, /Net statement = Card movements \+ Taxes \+ Past payments/);
  assert.match(source, /Net statement/);
  assert.match(source, /Card movements/);
  assert.match(source, /Next month installments/);
  assert.match(source, /flat vs prev/);
  assert.match(source, /Latest month: /);
  assert.match(source, /This table shows how the full statement total/);
  assert.match(source, /This table shows which categories made up this month's card movements\./);
  assert.match(source, /Refunds or credits reduce a category total\./);
  assert.match(source, /Compared with:/);
  assert.match(source, /largest month-over-month changes in spending\./);
  assert.match(source, /This chart tracks total remaining installment debt by statement month\./);
  assert.match(source, /That total already includes next month's installments\./);
  assert.match(source, /Total remaining installment debt ARS/);
  assert.match(source, /Total remaining installment debt USD/);
  assert.match(source, /var DEBT_PRIORITY_HELP_TEXT = Object\.freeze\(\{/);
  assert.match(source, /attachMetricHelpHandlers\("debt"\)/);
  assert.match(source, /How much new debt was added this month compared with the previous month\./);
  assert.match(source, /Taxes, fees, and interest billed in the latest month, separated from actual spending\./);
  assert.match(source, /How many months of installment debt are still ahead, plus the total amount still pending\./);
  assert.match(source, /N\/A in Δ% columns means previous month value is 0\./);
  assert.match(source, /reconciliation diff/);
  assert.match(source, /function computeTotalDebtSummary/);
  assert.match(source, /function debtDirectionLabel/);
  assert.match(source, /Total remaining installment debt:/);
  assert.match(source, /fo-debt-total-kpi/);
  assert.match(source, /remainingDebt already includes next month's installments/);
  assert.match(source, /function buildFinanceCostProjection/);
  assert.match(source, /function renderFinanceCostSection/);
  assert.match(source, /Classification priority: Interest > Fees > Taxes/);
  assert.match(source, /Total financial costs/);
});

test("finance-overview encodes explicit N/A reason contract for percent cells", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /var NA_REASON = Object\.freeze\(\{/);
  assert.match(source, /DELTA_PCT_PREV_ZERO/);
  assert.match(source, /SHARE_ZERO_TOTAL/);
  assert.match(source, /MAPPING_NO_CARD_MOVEMENT_ROWS/);
  assert.match(source, /MAPPING_NO_PREV_MONTH/);
  assert.match(source, /function appendPercentCell\(tr, ratio, rightAligned, semanticTone, naReason\)/);
  assert.match(source, /td\.title = String\(naReason \|\| NA_REASON\.DELTA_PCT_PREV_ZERO\);/);
  assert.match(source, /N\/A share means total positive amount for a currency is 0 in this scope\./);
});

test("finance-overview removes legacy Chart.js trend and driver helpers in favor of Highcharts hosts", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /var METRIC_COLORS = Object\.freeze\(\{/);
  assert.doesNotMatch(source, /function buildTrendChartConfig/);
  assert.doesNotMatch(source, /function buildDriverChartConfig/);
  assert.doesNotMatch(source, /function renderMockup3/);
  assert.doesNotMatch(source, /function renderSingleChart/);
  assert.doesNotMatch(source, /buildTrendChartConfig:/);
  assert.doesNotMatch(source, /buildDriverChartConfig:/);
  assert.doesNotMatch(source, /renderDualChartHost:/);
  assert.doesNotMatch(source, /renderSingleChart:/);
  assert.match(source, /function renderDualHighchartsHost/);
  assert.match(source, /function buildHighchartsPanel/);
});

test("finance-overview keeps chart accessibility labels and color-based semantic cues", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /\.fo-semantic-cue \{ font-weight: 600; \}/);
  assert.equal(/\.fo-semantic-cue\.fo-cell-pos::before/.test(source), false);
  assert.equal(/\.fo-semantic-cue\.fo-cell-neg::before/.test(source), false);
  assert.equal(/\[OK\]/.test(source), false);
  assert.equal(/\[!\]/.test(source), false);
  assert.match(source, /function chartContextLabelFromHost/);
  assert.match(source, /function buildChartAriaLabel/);
  assert.match(source, /function setChartContainerAccessibility/);
  assert.match(source, /container\.setAttribute\("role", "img"\)/);
  assert.match(source, /container\.setAttribute\("aria-label", buildChartAriaLabel/);
  assert.doesNotMatch(source, /function setChartCanvasAccessibility/);
  assert.doesNotMatch(source, /canvas\.setAttribute\("role", "img"\)/);
  assert.match(source, /function applySemanticCue/);
  assert.match(source, /td\.classList\.add\("fo-semantic-cue"\)/);
  assert.match(source, /td\.dataset\.foSemanticTone = toneLabel/);
});

test("raw explorer supports per-column filters", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function columnFilterInputId/);
  assert.match(source, /function columnVisibilityInputId/);
  assert.match(source, /function rawColumnFilterHaystack/);
  assert.match(source, /fo-raw-col-filter-/);
  assert.match(source, /fo-raw-col-visible-/);
  assert.match(source, /Column filters active:/);
  assert.match(source, /Visible columns:/);
  assert.match(source, /Active filters:/);
  assert.match(source, /Statement Month:/);
  assert.match(source, /Card Owner:/);
  assert.match(source, /Movement Type:/);
  assert.match(source, /column:/);
});

test("raw view adds collapsible column controls and quick visibility presets", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /id="fo-raw-new-column-controls-details"/);
  assert.match(html, /id="fo-raw-new-column-controls-summary"/);
  assert.match(html, /id="fo-raw-new-columns-preset-compact"/);
  assert.match(html, /id="fo-raw-new-columns-preset-all"/);
  assert.match(html, /Columns and column filters/);

  assert.match(source, /RAW_COLUMN_COMPACT_KEYS/);
  assert.match(source, /function rawExplorerId/);
  assert.match(source, /function renderRawExplorerSection/);
  assert.match(source, /updateColumnControlsSummary/);
  assert.match(source, /Columns: /);
  assert.match(source, / hidden/);
  assert.match(source, / column filters/);
  assert.match(source, /applyVisibilityPreset\s*=\s*function/);
  assert.match(source, /columns-preset-compact/);
  assert.match(source, /columns-preset-all/);
});

test("raw views include active-filter summary nodes and runtime wiring", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /id="fo-raw-new-active-filters"/);
  assert.match(html, />Active filters: none</);
  assert.match(source, /function renderRawActiveFilters/);
  assert.match(source, /function renderRawExplorerSection/);
  assert.match(source, /foRawFilterKey/);
  assert.match(html, /id="fo-raw-new-download-filtered-btn"/);
  assert.match(source, /function rawCsvCellValue/);
  assert.match(source, /function escapeSemicolonCsvCell/);
  assert.match(source, /function buildRawFilteredCsv/);
  assert.match(source, /function buildRawFilteredDownloadName/);
  assert.match(source, /raw_data_filtered_/);
  assert.match(source, /Download the currently filtered raw movements as CSV\./);
});

test("rebuilt raw MVP exposes an explorer-only shell with direct page access", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /<section id="raw" class="page" aria-labelledby="fo-nav-raw" data-fo-view-variant="new" hidden>/);
  assert.match(html, /id="fo-raw-new-filter-month"/);
  assert.match(html, /id="fo-raw-new-filter-owner"/);
  assert.match(html, /id="fo-raw-new-filter-type"/);
  assert.match(html, /id="fo-raw-new-column-controls-details"/);
  assert.match(html, /id="fo-raw-new-pagination"/);
  assert.match(html, /id="fo-raw-new-page-strip"/);
  assert.match(html, /id="fo-raw-new-table"/);
  assert.match(html, /id="fo-raw-new-meta"/);
  assert.equal(/Raw Data rebuild surface/.test(html), false);
  assert.equal(/payment method split/i.test(html.slice(html.indexOf('<section id="raw"'), html.indexOf('<section id="settings"'))), false);
  assert.match(source, /var RAW_REBUILT_PAGE_SIZE = 100;/);
  assert.match(source, /var rawRebuiltTableState = \{/);
  assert.match(source, /scopeKey:\s*"raw-new"/);
  assert.match(source, /Showing rows /);
  assert.match(source, /filtered rows \(strict runtime\)/);
  assert.match(source, /function buildRawPaginationWindow/);
  assert.match(source, /page-strip/);
  assert.match(source, /data-fo-raw-page/);
  assert.equal(/page-input/.test(source), false);
});

test("root canonical page loads finance-overview through versioned shared loader", async () => {
  const source = await fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8");

  assert.match(source, /asset-version\.js/);
  assert.match(source, /finance-overview-loader\.js/);
  assert.equal(/shared\/finance-overview\.js/.test(source), false);
});

test("finance-overview loader injects versioned runtime script and readiness promise", async () => {
  const loader = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview-loader.js"),
    "utf8"
  );

  assert.match(loader, /__foFinanceOverviewReady/);
  assert.match(loader, /__FO_ASSET_HELPERS__/);
  assert.match(loader, /appendVersionParam/);
  assert.match(loader, /readCanonicalVersionToken/);
  assert.equal(/function\s+readAssetVersionToken/.test(loader), false);
  assert.equal(/function\s+withVersion/.test(loader), false);
  assert.match(loader, /finance-overview\.js/);
});

test("finance-overview exposes asset version markers for shared/runtime/wasm", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /dataset\.foAssetSharedVersion/);
  assert.match(source, /dataset\.foAssetRuntimeVersion/);
  assert.match(source, /dataset\.foAssetWasmVersion/);
  assert.match(source, /__FO_ASSET_HELPERS__/);
  assert.match(source, /appendVersionParam/);
  assert.match(source, /readCanonicalVersionToken/);
  assert.equal(/function\s+readCacheBustToken/.test(source), false);
  assert.equal(/function\s+withCacheBust/.test(source), false);
  assert.equal(/function\s+readVersionFromUrl/.test(source), false);
});

test("asset-version defines shared version helpers used by loader/runtime entrypoints", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "asset-version.js"),
    "utf8"
  );

  assert.match(source, /__FO_ASSET_VERSION__/);
  assert.match(source, /__FO_ASSET_HELPERS__/);
  assert.match(source, /readCanonicalVersionToken/);
  assert.match(source, /appendVersionParam/);
  assert.match(source, /readVersionFromUrl/);
});

test("finance-overview includes debt month-over-month delta chart builder in debt section", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function buildDebtDeltaTrendConfig/);
  assert.match(source, /function buildDeltaSeries/);
  assert.match(source, /fo-debt-delta-host/);
  assert.match(source, /Debt delta source: strict runtime overview_projection/);
});

test("finance-overview removes the legacy overview decomposition chart surface", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /function buildNetDecompositionTrendConfig/);
  assert.doesNotMatch(source, /function updateOverviewDecompositionSummary/);
  assert.doesNotMatch(source, /function bindOverviewDecompositionDetails/);
  assert.doesNotMatch(source, /fo-overview-decomposition-summary/);
  assert.doesNotMatch(source, /fo-overview-decomposition-details/);
  assert.doesNotMatch(source, /months in trend/);
  assert.match(source, /function renderOverviewQ001Section/);
  assert.match(source, /function renderOverviewQ003Q004Section/);
  assert.match(source, /function renderOverviewQ008Section/);
});

test("finance-overview includes debt trend chart builder with strict runtime debt series labels", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function buildDebtTrendConfig/);
  assert.match(source, /New debt ARS/);
  assert.match(source, /Carry debt ARS/);
  assert.match(source, /Next month debt ARS/);
  assert.match(source, /Remaining debt ARS/);
  assert.match(source, /New debt USD/);
  assert.match(source, /Carry debt USD/);
  assert.match(source, /Next month debt USD/);
  assert.match(source, /Remaining debt USD/);
  assert.match(source, /Debt trend source: strict runtime overview_projection/);
});

test("finance-overview includes debt maturity cumulative chart builder in debt section", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function buildDebtMaturityCumulativeConfig/);
  assert.match(source, /function buildCumulativeAmountSeries/);
  assert.match(source, /fo-debt-maturity-cumulative-host/);
  assert.match(source, /Installment maturity cumulative ARS/);
  assert.match(source, /Installment maturity cumulative USD/);
});

test("finance-overview removes legacy categories chart hosts in favor of rebuilt tables", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /function buildCategoryConcentrationConfig/);
  assert.doesNotMatch(source, /function buildTopCategoriesChartConfig/);
  assert.doesNotMatch(source, /fo-categories-chart-host/);
  assert.doesNotMatch(source, /fo-categories-concentration-host/);
  assert.doesNotMatch(source, /renderDualChartHost\(chartHost,\s*buildTopCategoriesChartConfig/);
  assert.match(source, /function renderCategoriesRebuiltSection/);
  assert.match(source, /renderCategoriesRebuiltSection\(model\);/);
});

test("finance-overview removes legacy owners chart hosts in favor of rebuilt owner evolution charts", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /function buildTopOwnersChartConfig/);
  assert.doesNotMatch(source, /fo-owners-concentration-host/);
  assert.doesNotMatch(source, /renderDualChartHost\(chartHost,\s*buildTopOwnersChartConfig/);
  assert.match(source, /function buildOwnerEvolutionChartConfig\(/);
  assert.match(source, /function renderOwnersRebuiltSection\(/);
  assert.match(source, /renderDualHighchartsHost\(trendHost,\s*\{/);
});

test("rebuilt owners MVP includes latest-month owner and owner-category ranking tables", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /href="\.\/mockups_lab\/app\/views\/owners\/owners\.css"/);
  assert.match(html, /id="fo-owners-new-trend-title"/);
  assert.match(html, /How are owner amounts evolving over time\?/);
  assert.match(html, /id="fo-owners-new-trend-host"/);
  assert.match(html, /id="fo-owners-new-rank-title"/);
  assert.match(html, /Which owner is driving the highest spending this month\?/);
  assert.match(html, /id="fo-owners-new-table-ars"/);
  assert.match(html, /id="fo-owners-new-table-usd"/);
  assert.match(html, /id="fo-owners-new-pairs-title"/);
  assert.match(html, /Which owner-category pairs are largest this month\?/);
  assert.match(html, /id="fo-owners-new-pairs-table-ars"/);
  assert.match(html, /id="fo-owners-new-pairs-table-usd"/);
  assert.doesNotMatch(html, /Owners rebuild surface/);
  assert.match(source, /function getOwnerLookupFromCurrentMappings\(/);
  assert.match(source, /function resolveCanonicalOwnerFromRawRow\(/);
  assert.match(source, /function buildOwnerEvolutionProjection\(/);
  assert.match(source, /function buildOwnerEvolutionChartConfig\(/);
  assert.match(source, /function buildOwnerRankingProjection\(/);
  assert.match(source, /function renderOwnerRankingTableRebuilt\(/);
  assert.match(source, /function buildOwnerCategoryPairProjection\(/);
  assert.match(source, /function renderOwnerCategoryPairTableRebuilt\(/);
  assert.match(source, /function renderOwnersRebuiltSection\(/);
  assert.match(source, /renderOwnersRebuiltSection\(model\);/);
  assert.match(source, /renderDualHighchartsHost\(trendHost,\s*\{/);
});

test("categories essential-discretionary split consults category segment mappings before fallback", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function getCategorySegmentLookupFromCurrentMappings\(/);
  assert.match(source, /categorySegmentByCategory/);
  assert.match(source, /categorySegmentFromMappedCategory\(mappedCategory,\s*categorySegmentLookup\)/);
});

test("finance-overview defines explicit view-level number format policy", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /NUMBER_FORMAT_MODE/);
  assert.match(source, /VIEW_NUMBER_FORMAT_POLICY/);
  assert.match(source, /ownerRankTable:\s*NUMBER_FORMAT_MODE\.FULL/);
  assert.match(source, /categoryRankTable:\s*NUMBER_FORMAT_MODE\.FULL/);
  assert.match(source, /overviewTable:\s*NUMBER_FORMAT_MODE\.COMPACT/);
  assert.match(source, /singleCurrencyKpiTable:\s*NUMBER_FORMAT_MODE\.COMPACT/);
  assert.match(source, /function formatNumberByMode/);
});

test("finance-overview defines explicit chart/raw number format policy wiring", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /CHART_NUMBER_FORMAT_POLICY/);
  assert.match(source, /yAxisTicks:\s*NUMBER_FORMAT_MODE\.COMPACT/);
  assert.match(source, /tooltipValues:\s*NUMBER_FORMAT_MODE\.FULL/);
  assert.match(source, /RAW_NUMBER_FORMAT_POLICY/);
  assert.match(source, /amountCells:\s*NUMBER_FORMAT_MODE\.FULL/);
  assert.match(source, /function formatChartTickValue/);
  assert.match(source, /function formatChartTooltipValue/);
  assert.match(source, /function formatRawMoneyValue/);
  assert.match(source, /formatChartTooltipValue\(value\)/);
  assert.match(source, /formatChartTickValue\(value\)/);
  assert.match(source, /column\.kind === "money_ars"/);
  assert.match(source, /column\.kind === "money_usd"/);
});

test("finance-overview wires mockup CSV lifecycle controls through runtime helpers", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function bindMockupLifecycleControls/);
  assert.match(source, /fo-load-btn/);
  assert.match(source, /fo-import-csv-input/);
  assert.match(source, /fo-compute-btn/);
  assert.match(source, /fo-export-table-btn/);
  assert.match(source, /importCsvFilesAndCompute/);
  assert.match(source, /handleExportSelectedTable/);
  assert.match(source, /runtime\.parseCsvAsObjects\(text, runtime\.DATA_HEADERS/);
  assert.match(source, /txt\.indexOf\("load csv"\) >= 0 && btn\.id !== "fo-load-btn"/);
});

test("finance-overview wires mappings parity controls (JSON/CSV/template/copy/clear) in integrated mockup", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /getMappingsCsvModule/);
  assert.match(source, /EXPECTED_MAPPINGS_KEYS/);
  assert.match(source, /function syncMappingsView/);
  assert.match(source, /function importMappingsJsonFile/);
  assert.match(source, /function importMappingsCsvFile/);
  assert.match(source, /function clearMappings/);
  assert.match(source, /fo-import-mappings-btn/);
  assert.match(source, /fo-import-mappings-input/);
  assert.match(source, /fo-copy-mappings-btn/);
  assert.match(source, /fo-clear-mappings-btn/);
  assert.match(source, /fo-import-card-owner-csv-btn/);
  assert.match(source, /fo-import-card-number-csv-btn/);
  assert.match(source, /fo-import-category-csv-btn/);
  assert.match(source, /Replace current mappings\?/);
});

test("integrated mockup exposes rule-editor controls and finance-overview wires CRUD/search handlers", async () => {
  const html = await fs.readFile(
    path.join(WEB_ROOT, "index.html"),
    "utf8"
  );
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(html, /id=\"fo-settings-rule-editor-type\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-search\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-key\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-value\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-save-btn\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-reset-btn\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-body\"/);
  assert.match(html, /id=\"fo-settings-rule-editor-validation\"/);

  assert.match(source, /RULE_EDITOR_SECTION_CONFIG/);
  assert.match(source, /ruleEditorState/);
  assert.match(source, /function validateRuleEditorDraft/);
  assert.match(source, /function syncRuleEditorView/);
  assert.match(source, /function syncSettingsRuleEditorMirror/);
  assert.match(source, /function saveRuleEditorDraft/);
  assert.match(source, /function deleteRuleEditorKey/);
  assert.match(source, /rule-editor-save/);
  assert.match(source, /rule-editor-delete/);
  assert.match(source, /Delete rule '/);
  assert.match(source, /Card-number rule key must include at least 4 digits/);
});

test("integrated mockup rebuilt settings shell exposes minimal operational cards and removes placeholder copy", async () => {
  const html = await fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8");

  assert.doesNotMatch(html, /Settings rebuild surface/);
  assert.doesNotMatch(html, /This view intentionally starts empty/);
  assert.match(html, /id="fo-settings-run-compute-btn"/);
  assert.doesNotMatch(html, /id="fo-settings-export-table-select"/);
  assert.doesNotMatch(html, /id="fo-settings-export-table-btn"/);
  assert.match(html, /id="fo-settings-storage-usage"/);
  assert.match(html, /id="fo-settings-status"/);
  assert.match(html, /id="fo-settings-import-mappings-btn"/);
  assert.match(html, /id="fo-settings-download-mappings-btn"/);
  assert.match(html, /id="fo-settings-copy-mappings-btn"/);
  assert.match(html, /id="fo-settings-loaded-files-list-rebuild"/);
  assert.match(html, /id="fo-settings-delete-selected-btn"/);
  assert.match(html, /id="fo-settings-export-all-csvs-btn"/);
  assert.match(html, /id="fo-settings-clear-mappings-btn"/);
  assert.match(html, /id="fo-settings-delete-all-btn"/);
});

test("integrated mockup isolates destructive settings controls in a dedicated danger zone", async () => {
  const [html, settingsCss] = await Promise.all([
    fs.readFile(path.join(WEB_ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(WEB_ROOT, "mockups_lab", "app", "views", "settings", "settings.css"), "utf8"),
  ]);

  assert.match(html, /fo-settings-danger-card/);
  assert.match(html, /Danger zone/);
  assert.match(html, /id="fo-settings-clear-mappings-btn" class="btn fo-btn-danger"/);
  assert.match(html, /id="fo-settings-delete-all-btn" class="btn fo-btn-danger"/);
  assert.match(settingsCss, /\.fo-settings-danger-card/);
});

test("finance-overview wires workspace and loaded-files lifecycle parity controls in integrated mockup", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /function selectedLoadedFileIds/);
  assert.match(source, /function updateSettingsWorkspaceSummary/);
  assert.match(source, /function deleteSelectedCsvFilesAndMaybeRecompute/);
  assert.match(source, /function deleteAllCsvFilesAndMappings/);
  assert.match(source, /function exportAllCsvFiles/);
  assert.match(source, /function importWorkspaceArtifactFile/);
  assert.match(source, /function exportWorkspaceArtifactJson/);
  assert.match(source, /fo-delete-selected-btn/);
  assert.match(source, /fo-delete-all-btn/);
  assert.match(source, /fo-export-all-csvs-btn/);
  assert.match(source, /fo-settings-workspace-summary/);
  assert.match(source, /fo-import-workspace-btn/);
  assert.match(source, /fo-workspace-file-input/);
  assert.match(source, /fo-export-workspace-btn/);
  assert.match(source, /Replace current data with workspace\?/);
});

test("finance-overview wires storage telemetry and fallback banner hooks in integrated mockup", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /storage\/utils\.js/);
  assert.match(source, /function getStorageUtilsModule/);
  assert.match(source, /function refreshStorageTelemetry/);
  assert.match(source, /function setStorageWarningBanner/);
  assert.match(source, /fo-storage-usage/);
  assert.match(source, /fo-storage-unavailable-banner/);
  assert.match(source, /Storage: unavailable/);
  assert.match(source, /Persistent storage enabled\./);
});

test("finance-overview enforces lifecycle busy-state guard for integrated mockup controls", async () => {
  const source = await fs.readFile(
    path.join(WEB_ROOT, "mockups_lab", "shared", "finance-overview.js"),
    "utf8"
  );

  assert.match(source, /var lifecycleBusy = false/);
  assert.match(source, /LIFECYCLE_CONTROL_IDS/);
  assert.match(source, /function setLifecycleControlsDisabled/);
  assert.match(source, /function setLifecycleBusyState/);
  assert.match(source, /function runLifecycleAction/);
  assert.match(source, /dataset\.foLifecycleBusy/);
  assert.match(source, /Another action is already running\. Please wait\./);
});
