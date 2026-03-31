(function (global) {
  "use strict";

  var IMPROVEMENT_DIRECTION = {
    netStatement: -1,
    cardMovements: -1,
    newDebt: -1,
    carryOverDebt: -1,
    nextMonthDebt: -1,
    remainingDebt: -1,
    taxes: -1,
    pastPayments: 1
  };
  var OWNER_SERIES_PALETTE = Object.freeze([
    "#22c55e",
    "#38bdf8",
    "#f59e0b",
    "#a78bfa",
    "#f472b6",
    "#fb7185",
    "#14b8a6",
    "#facc15"
  ]);
  var assetHelpers = global.__FO_ASSET_HELPERS__ || {};
  function fallbackAppendVersion(path, token) {
    var value = String(path || "");
    var cleanToken = typeof token === "string" ? token.trim() : "";
    if (!cleanToken) {
      return value;
    }
    var sep = value.indexOf("?") >= 0 ? "&" : "?";
    return value + sep + "v=" + encodeURIComponent(cleanToken);
  }
  function resolveVersionToken(scriptHref) {
    if (typeof assetHelpers.readCanonicalVersionToken === "function") {
      return String(assetHelpers.readCanonicalVersionToken({ scriptHref: scriptHref }) || "");
    }
    if (typeof global.__FO_ASSET_VERSION__ === "string" && global.__FO_ASSET_VERSION__.trim()) {
      return global.__FO_ASSET_VERSION__.trim();
    }
    return "";
  }
  function appendVersion(path, token) {
    if (typeof assetHelpers.appendVersionParam === "function") {
      return assetHelpers.appendVersionParam(path, token);
    }
    return fallbackAppendVersion(path, token);
  }
  function versionFromUrl(url) {
    if (typeof assetHelpers.readVersionFromUrl === "function") {
      return String(
        assetHelpers.readVersionFromUrl(
          url,
          global.location && global.location.href ? global.location.href : document.baseURI
        ) || ""
      );
    }
    return "";
  }

  var scriptSrc = document.currentScript && document.currentScript.src ? document.currentScript.src : document.baseURI;
  var cacheBustToken = resolveVersionToken(scriptSrc);
  var runtimeModuleUrl = appendVersion(
    new URL("../../runtime/mockupsRuntime.js", scriptSrc).href,
    cacheBustToken
  );
  var mappingsCsvModuleUrl = appendVersion(
    new URL("../../mappingsCsvParse.js", scriptSrc).href,
    cacheBustToken
  );
  var storageUtilsModuleUrl = appendVersion(
    new URL("../../storage/utils.js", scriptSrc).href,
    cacheBustToken
  );
  var runtimeModulePromise = null;
  var mappingsCsvModulePromise = null;
  var storageUtilsModulePromise = null;
  var lastRuntimeState = null;
  var lastRenderedModel = null;
  var activeBootConfig = null;
  var lifecycleControlsBound = false;
  var lifecycleBusy = false;
  var EXPECTED_MAPPINGS_KEYS = [
    "ownersByCardOwner",
    "ownersByCardNumber",
    "categoryByDetail",
    "categorySegmentByCategory"
  ];
  var RULE_EDITOR_RENDER_LIMIT = 200;
  var RULE_EDITOR_MAX_FIELD_LENGTH = 160;
  var NUMBER_FORMAT_MODE = Object.freeze({
    COMPACT: "compact",
    FULL: "full"
  });
  var VIEW_NUMBER_FORMAT_POLICY = Object.freeze({
    default: NUMBER_FORMAT_MODE.COMPACT,
    overviewTable: NUMBER_FORMAT_MODE.COMPACT,
    singleCurrencyKpiTable: NUMBER_FORMAT_MODE.COMPACT,
    ownerRankTable: NUMBER_FORMAT_MODE.FULL,
    categoryRankTable: NUMBER_FORMAT_MODE.FULL
  });
  var CHART_NUMBER_FORMAT_POLICY = Object.freeze({
    yAxisTicks: NUMBER_FORMAT_MODE.COMPACT,
    tooltipValues: NUMBER_FORMAT_MODE.FULL
  });
  var RAW_NUMBER_FORMAT_POLICY = Object.freeze({
    amountCells: NUMBER_FORMAT_MODE.FULL
  });
  var OWNER_CATEGORY_MATRIX_LIMITS = Object.freeze({
    maxOwners: 8,
    maxCategories: 6
  });
  var OWNER_REBUILT_RANK_LIMIT = 12;
  var OWNER_CATEGORY_PAIR_LIMIT = 12;
  var OVERVIEW_CATEGORY_TOP_LIMIT = 5;
  var CATEGORY_MOM_DELTA_LIMIT = 5;
  var UNCATEGORIZED_DETAILS_BACKLOG_LIMIT = 40;
  var UNCATEGORIZED_SORT_DEFAULT = "rows-desc";
  var uncategorizedBacklogState = {
    sortKey: UNCATEGORIZED_SORT_DEFAULT
  };
  var DQ_RULE_FILTER = Object.freeze({
    ALL: "ALL",
    DQ003: "DQ003",
    DQ004: "DQ004"
  });
  var DQ_REBUILT_PAGE_SIZE = 50;
  var RAW_REBUILT_PAGE_SIZE = 100;
  var dqIssueFilterState = {
    ruleId: DQ_RULE_FILTER.ALL
  };
  var dqRebuiltTableState = {
    page: 1
  };
  var rawRebuiltTableState = {
    page: 1
  };
  var FINANCE_COST_DETAIL_KEYWORDS = Object.freeze({
    interest: Object.freeze(["INTERES", "INT.FIN", "FINANCIACION", "INTEREST"]),
    fees: Object.freeze(["COM MANT", "MANT CTA", "RENOV", "COMISION", "FEE", "CARGO"]),
    taxes: Object.freeze(["IVA", "IMPUEST", "IIBB", " RG ", "DB.", "DB "])
  });
  var FINANCE_COST_BUCKETS = Object.freeze([
    Object.freeze({ key: "taxes", label: "Taxes" }),
    Object.freeze({ key: "fees", label: "Fees" }),
    Object.freeze({ key: "interest", label: "Interest" }),
    Object.freeze({ key: "total", label: "Total financial costs" })
  ]);
  var TOP_MERCHANTS_LIMIT = 15;
  var RECURRING_SMALL_CHARGES_LIMIT = 12;
  var ONE_OFF_SPIKES_LIMIT = 12;
  var MERCHANT_SMALL_CHARGE_PERCENTILE = 0.4;
  var MERCHANT_SPIKE_PERCENTILE = 0.9;
  var MOVEMENT_TYPE_UNEXPECTED_DELTA_PCT = 0.25;
  var MOVEMENT_TYPE_UNEXPECTED_DELTA_ARS = 50000;
  var MOVEMENT_TYPE_UNEXPECTED_DELTA_USD = 25;
  var PAYMENT_METHOD_ORDER = Object.freeze(["Card", "Transfer", "Cash", "Other"]);
  var NA_REASON = Object.freeze({
    DELTA_PCT_PREV_ZERO: "Previous month value is 0 (percentage delta is undefined).",
    SHARE_ZERO_TOTAL: "Total positive amount for this currency is 0 in selected scope.",
    MAPPING_NO_CARD_MOVEMENT_ROWS: "No CardMovement rows for this statement month.",
    MAPPING_NO_PREV_MONTH: "No previous month available for comparison."
  });
  var LOAD_PROFILE = Object.freeze({
    PUBLIC: "public",
    SENSITIVE: "sensitive"
  });
  var LOAD_PROFILE_REQUIRED_FILES = Object.freeze({
    public: Object.freeze([
      "tmp_public_data/current/demo_extracted.csv",
      "tmp_public_data/current/owner_map.csv",
      "tmp_public_data/current/details_to_categories_map.csv",
      "tmp_public_data/current/category_segments_map.csv"
    ]),
    sensitive: Object.freeze([
      "tmp_sensitive_data/current/Santander_joined.csv",
      "tmp_sensitive_data/current/2025-03-21-Santander-AMEX.pdf.csv",
      "tmp_sensitive_data/current/VISA-PRISMA_joined.csv",
      "tmp_sensitive_data/current/owner_map.csv",
      "tmp_sensitive_data/current/details_to_categories_map.csv",
      "tmp_sensitive_data/current/category_segments_map.csv"
    ])
  });
  var RULE_EDITOR_SECTION_CONFIG = {
    ownersByCardOwner: { label: "card-owner mappings" },
    ownersByCardNumber: { label: "card-number mappings" },
    categoryByDetail: { label: "category mappings" },
    categorySegmentByCategory: { label: "category-segment mappings" }
  };
  var ruleEditorState = {
    sectionKey: "categoryByDetail",
    search: "",
    draftKey: "",
    draftValue: "",
    editOriginalKey: "",
    validationMessage: ""
  };
  var LIFECYCLE_CONTROL_IDS = [
    "fo-load-btn",
    "fo-import-csv-input",
    "fo-compute-btn",
    "fo-settings-run-compute-btn",
    "fo-export-table-btn",
    "fo-load-demo-btn",
    "fo-import-mappings-btn",
    "fo-import-mappings-input",
    "fo-settings-import-mappings-btn",
    "fo-settings-import-mappings-input",
    "fo-download-template-mappings-btn",
    "fo-settings-download-template-mappings-btn",
    "fo-download-mappings-btn",
    "fo-settings-download-mappings-btn",
    "fo-copy-mappings-btn",
    "fo-settings-copy-mappings-btn",
    "fo-clear-mappings-btn",
    "fo-settings-clear-mappings-btn",
    "fo-import-card-owner-csv-btn",
    "fo-card-owner-csv-input",
    "fo-import-card-number-csv-btn",
    "fo-card-number-csv-input",
    "fo-import-category-csv-btn",
    "fo-category-csv-input",
    "fo-import-category-segment-csv-btn",
    "fo-category-segment-csv-input",
    "fo-download-category-segment-template-csv-btn",
    "fo-download-category-segment-csv-btn",
    "fo-download-card-owner-template-csv-btn",
    "fo-download-card-number-template-csv-btn",
    "fo-download-category-template-csv-btn",
    "fo-delete-selected-btn",
    "fo-settings-delete-selected-btn",
    "fo-delete-all-btn",
    "fo-settings-delete-all-btn",
    "fo-export-all-csvs-btn",
    "fo-settings-export-all-csvs-btn",
    "fo-import-workspace-btn",
    "fo-workspace-file-input",
    "fo-export-workspace-btn",
    "fo-rule-editor-type",
    "fo-rule-editor-search",
    "fo-rule-editor-key",
    "fo-rule-editor-value",
    "fo-rule-editor-save-btn",
    "fo-rule-editor-reset-btn",
    "fo-settings-rule-editor-type",
    "fo-settings-rule-editor-search",
    "fo-settings-rule-editor-key",
    "fo-settings-rule-editor-value",
    "fo-settings-rule-editor-save-btn",
    "fo-settings-rule-editor-reset-btn"
  ];

  function getRuntimeModule() {
    if (!runtimeModulePromise) {
      runtimeModulePromise = import(runtimeModuleUrl);
    }
    return runtimeModulePromise;
  }

  function getMappingsCsvModule() {
    if (!mappingsCsvModulePromise) {
      mappingsCsvModulePromise = import(mappingsCsvModuleUrl);
    }
    return mappingsCsvModulePromise;
  }

  function getStorageUtilsModule() {
    if (!storageUtilsModulePromise) {
      storageUtilsModulePromise = import(storageUtilsModuleUrl);
    }
    return storageUtilsModulePromise;
  }

  function setRuntimeMarkers(runtimeSnapshot, mode) {
    if (!document.body) {
      return;
    }
    var source = runtimeSnapshot && runtimeSnapshot.source ? runtimeSnapshot.source : "unknown";
    var tableCount = runtimeSnapshot && runtimeSnapshot.tableCount ? String(runtimeSnapshot.tableCount) : "0";
    var runtimeMode = mode || (runtimeSnapshot && runtimeSnapshot.mode) || "strict";
    var loadProfile =
      (activeBootConfig && activeBootConfig.loadProfile) ||
      (runtimeSnapshot && runtimeSnapshot.loadProfile) ||
      LOAD_PROFILE.PUBLIC;
    var sharedVersion = cacheBustToken || "";
    var runtimeVersion = versionFromUrl(runtimeModuleUrl) || sharedVersion;
    var wasmVersion = versionFromUrl(lastRuntimeState && lastRuntimeState.wasmPath) || sharedVersion;
    document.body.dataset.foRuntimeEngine = "wasm";
    document.body.dataset.foRuntimeSource = source;
    document.body.dataset.foRuntimeTables = tableCount;
    document.body.dataset.foRuntimeMode = runtimeMode;
    document.body.dataset.foLoadProfile = String(loadProfile || LOAD_PROFILE.PUBLIC);
    document.body.dataset.foAssetSharedVersion = sharedVersion || "none";
    document.body.dataset.foAssetRuntimeVersion = runtimeVersion || "none";
    document.body.dataset.foAssetWasmVersion = wasmVersion || "none";
  }

  function setBootState(state) {
    if (!document.body) {
      return;
    }
    document.body.dataset.foBootState = state || "loading";
  }

  function boot(config) {
    var bootConfig = createBootConfig(config);
    activeBootConfig = bootConfig;
    disableLoadButtons();
    injectSharedStyles();
    bindMockupLifecycleControls();
    setBootState("loading");
    setLiveStatus("Loading startup data...", true);
    setLifecycleStatus("Bootstrapping strict runtime...");

    loadModel(bootConfig)
      .then(function (model) {
        if (model && model.emptyWorkspace) {
          clearBlockingOverlay();
          showEmptyWorkspaceOverlay();
          setBootState("ready");
          syncLifecycleUiFromState();
          setLiveStatus(
            "No CSV files loaded. Load CSV(s), import a workspace, or reload demo data to continue.",
            false
          );
          setLifecycleStatus(
            "No CSV files loaded. Load CSV(s), import a workspace, or reload demo data to continue."
          );
          return;
        }
        renderVariant(bootConfig.variant, model);
        setBootState("ready");
        syncLifecycleUiFromState();
        var runtimeTail = "";
        if (model.runtime && model.runtime.tableCount) {
          runtimeTail =
            " Runtime: WASM tables=" +
            model.runtime.tableCount +
            " source=" +
            (model.runtime.source || "unknown") +
            " mode=" +
            (model.runtimeMode || "strict") +
            ".";
        }
        setLiveStatus(
          "Overview loaded for latest month " +
            (model.latestMonth || "N/A") +
            ". Data quality warnings: " +
            getOverviewWarningSummary(model).total +
            "." +
            runtimeTail,
          false
        );
        setLifecycleStatus(
          "Loaded latest month " +
            (model.latestMonth || "N/A") +
            ". Runtime tables: " +
            toLocale(toFiniteNumber(model.runtime && model.runtime.tableCount), 0, 0) +
            "."
        );
      })
      .catch(function (err) {
        setBootState("error");
        showBlockingError(err && err.message ? err.message : String(err));
        setLiveStatus("Blocking startup error: " + (err && err.message ? err.message : String(err)), false);
        setLifecycleStatus("Blocking startup error: " + (err && err.message ? err.message : String(err)));
      });
  }

  function disableLoadButtons() {
    var buttons = Array.from(document.querySelectorAll("button"));
    var loadProfile =
      activeBootConfig && activeBootConfig.loadProfile
        ? String(activeBootConfig.loadProfile)
        : LOAD_PROFILE.PUBLIC;
    var autoloadHint =
      loadProfile === LOAD_PROFILE.SENSITIVE
        ? "Autoloaded from sensitive transaction CSVs plus private mappings on startup"
        : "Autoloaded from tmp_public_data/current/demo_extracted.csv plus public mappings on startup";
    buttons.forEach(function (btn) {
      var txt = (btn.textContent || "").trim().toLowerCase();
      if (txt.indexOf("load csv") >= 0 && btn.id !== "fo-load-btn") {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        });
        btn.title = autoloadHint;
      }
    });
  }

  function injectSharedStyles() {
    if (document.getElementById("fo-shared-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "fo-shared-style";
    style.textContent = [
      ".fo-error-overlay {",
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: 99999;",
      "  background: rgba(11, 12, 16, 0.96);",
      "  color: #f3f4f6;",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  padding: 24px;",
      "  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;",
      "}",
      ".fo-error-card {",
      "  width: min(900px, 92vw);",
      "  border: 1px solid rgba(255, 255, 255, 0.2);",
      "  border-radius: 14px;",
      "  padding: 18px;",
      "  background: rgba(17, 24, 39, 0.92);",
      "}",
      ".fo-error-title { font-size: 18px; font-weight: 700; margin: 0 0 10px 0; }",
      ".fo-error-text { opacity: 0.92; line-height: 1.4; margin: 0 0 8px 0; white-space: pre-wrap; }",
      ".fo-error-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }",
      ".fo-error-actions .btn { background: rgba(255,255,255,.04); }",
      ".fo-note { font-size: 11px; opacity: 0.8; margin-top: 6px; }",
      ".fo-cell-neg { color: #ef4444; }",
      ".fo-cell-pos { color: #22c55e; }",
      ".fo-semantic-cue { font-weight: 600; }",
      ".fo-chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }",
      ".fo-chart-panel { display: grid; gap: 8px; }",
      ".fo-chart-panel h4 { margin: 0; font-size: 13px; font-weight: 700; }",
      ".fo-chart-frame { min-height: 190px; border-radius: 12px; background: rgba(15, 23, 42, 0.04); padding: 8px; }",
      ".fo-highcharts-host { width: 100%; height: 100%; min-height: 190px; }",
      ".fo-sr-only {",
      "  position: absolute;",
      "  width: 1px;",
      "  height: 1px;",
      "  padding: 0;",
      "  margin: -1px;",
      "  overflow: hidden;",
      "  clip: rect(0, 0, 0, 0);",
      "  white-space: nowrap;",
      "  border: 0;",
      "}",
      ".fo-inline-warning {",
      "  font-weight: 600;",
      "  color: #fbbf24;",
      "}",
      ".fo-inline-action {",
      "  margin-left: 8px;",
      "  border: 0;",
      "  background: transparent;",
      "  color: #93c5fd;",
      "  text-decoration: underline;",
      "  cursor: pointer;",
      "  padding: 0;",
      "  font: inherit;",
      "}",
      ".fo-inline-action:hover {",
      "  color: #bfdbfe;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function setLiveStatus(message, busy) {
    var node = document.getElementById("fo-live-status");
    if (!node) {
      node = document.createElement("div");
      node.id = "fo-live-status";
      node.className = "fo-sr-only";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    node.setAttribute("aria-busy", busy ? "true" : "false");
    node.textContent = message;
  }

  function setLifecycleControlsDisabled(disabled) {
    LIFECYCLE_CONTROL_IDS.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node || !("disabled" in node)) {
        return;
      }
      node.disabled = !!disabled;
    });
  }

  function setLifecycleBusyState(isBusy) {
    lifecycleBusy = !!isBusy;
    if (document.body) {
      document.body.dataset.foLifecycleBusy = lifecycleBusy ? "true" : "false";
    }
    setLifecycleControlsDisabled(lifecycleBusy);
  }

  async function runLifecycleAction(actionName, actionFn) {
    if (lifecycleBusy) {
      var busyMessage = "Another action is already running. Please wait.";
      setLifecycleStatus(busyMessage);
      setLiveStatus(busyMessage, false);
      return null;
    }
    setLifecycleBusyState(true);
    try {
      return await actionFn();
    } catch (err) {
      throw err;
    } finally {
      setLifecycleBusyState(false);
    }
  }

  function clearBlockingOverlay() {
    var existing = document.getElementById("fo-error-overlay");
    if (existing) {
      existing.remove();
    }
  }

  function showBlockingOverlay(title, paragraphs, actions) {
    clearBlockingOverlay();
    var overlay = document.createElement("div");
    overlay.id = "fo-error-overlay";
    overlay.className = "fo-error-overlay";

    var cardHtml =
      '<div class="fo-error-card">' +
      '<h2 class="fo-error-title">' + escapeHtml(String(title || "Notice")) + "</h2>" +
      (Array.isArray(paragraphs) ? paragraphs : [])
        .map(function (paragraph) {
          return '<p class="fo-error-text">' + escapeHtml(String(paragraph || "")) + "</p>";
        })
        .join("") +
      "</div>";
    overlay.innerHTML = cardHtml;

    if (Array.isArray(actions) && actions.length) {
      var card = overlay.querySelector(".fo-error-card");
      var actionsWrap = document.createElement("div");
      actionsWrap.className = "fo-error-actions";
      actions.forEach(function (action) {
        if (!action || typeof action !== "object" || typeof action.onClick !== "function") {
          return;
        }
        var button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.textContent = String(action.label || "Action");
        button.addEventListener("click", action.onClick);
        actionsWrap.appendChild(button);
      });
      if (card && actionsWrap.childNodes.length) {
        card.appendChild(actionsWrap);
      }
    }

    document.body.appendChild(overlay);
  }

  function clickLoadDemoButton() {
    var button = document.getElementById("fo-load-demo-btn");
    if (button && typeof button.click === "function") {
      button.click();
    }
  }

  function isRecoverableDataConfigError(message) {
    var text = String(message || "");
    if (!text) {
      return false;
    }
    if (/Failed to fetch dynamically imported module|Cannot find module|Unexpected token|ReferenceError|TypeError/i.test(text)) {
      return false;
    }
    return /(error parsing csv|could not be fetched|could not be loaded|could not be validated|tmp_(public|sensitive)_data|demo_extracted\.csv|owner_map\.csv|details_to_categories_map\.csv|category_segments_map\.csv|joined\.csv)/i.test(text);
  }

  function showBlockingError(message) {
    var requiredFiles = Array.isArray(activeBootConfig && activeBootConfig.requiredFiles)
      ? activeBootConfig.requiredFiles
      : LOAD_PROFILE_REQUIRED_FILES[LOAD_PROFILE.PUBLIC];
    var expectedFilesText =
      requiredFiles && requiredFiles.length
        ? requiredFiles.join(", ")
        : "tmp_public_data/current/demo_extracted.csv, tmp_public_data/current/owner_map.csv, tmp_public_data/current/details_to_categories_map.csv, tmp_public_data/current/category_segments_map.csv";
    var actions = isRecoverableDataConfigError(message)
      ? [
          {
            label: "Reload demo data",
            onClick: clickLoadDemoButton
          }
        ]
      : [];
    showBlockingOverlay(
      "Blocking startup error",
      [
        "Required data/config files could not be loaded or validated.",
        String(message || "Unknown error"),
        "Expected files for active load profile: " + expectedFilesText
      ],
      actions
    );
  }

  function showEmptyWorkspaceOverlay() {
    showBlockingOverlay(
      "No CSV files loaded",
      [
        "Load CSV(s) or import a workspace to continue."
      ],
      [
        {
          label: "Load CSV(s)",
          onClick: function () {
            var button = document.getElementById("fo-load-btn");
            if (button && typeof button.click === "function") {
              button.click();
            }
          }
        },
        {
          label: "Import workspace",
          onClick: function () {
            var button = document.getElementById("fo-import-workspace-btn");
            if (button && typeof button.click === "function") {
              button.click();
            }
          }
        },
        {
          label: "Reload demo data",
          onClick: clickLoadDemoButton
        }
      ]
    );
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function normalizeBasePath(basePath) {
    var path = String(basePath || "./").trim();
    if (!path) {
      return "./";
    }
    return path.endsWith("/") ? path : path + "/";
  }

  function resolveDataPath(basePath, fileName) {
    return normalizeBasePath(basePath) + fileName;
  }

  function normalizeLoadProfile(loadProfile) {
    var profile = String(loadProfile || "").trim().toLowerCase();
    return profile === LOAD_PROFILE.SENSITIVE ? LOAD_PROFILE.SENSITIVE : LOAD_PROFILE.PUBLIC;
  }

  function resolveLoadProfile(config) {
    if (config && config.loadProfile) {
      return normalizeLoadProfile(config.loadProfile);
    }
    try {
      var params = new URLSearchParams((global.location && global.location.search) || "");
      var explicitProfile = params.get("loadProfile");
      if (explicitProfile) {
        return normalizeLoadProfile(explicitProfile);
      }
      var entry = String(params.get("entry") || "").trim().toLowerCase();
      if (entry === "sensitive-shortcut") {
        return LOAD_PROFILE.SENSITIVE;
      }
    } catch {
      // Keep public profile default when URL parsing is unavailable.
    }
    return LOAD_PROFILE.PUBLIC;
  }

  function requiredFilesForLoadProfile(loadProfile) {
    var normalized = normalizeLoadProfile(loadProfile);
    var required = LOAD_PROFILE_REQUIRED_FILES[normalized] || [];
    return required.slice();
  }

  function createBootConfig(config) {
    var variant = config && config.variant ? String(config.variant) : "mockup1";
    var basePath = config && config.basePath ? String(config.basePath) : "./";
    var runtimeMode = config && config.runtimeMode ? String(config.runtimeMode) : "strict";
    var runtimeBasePath =
      config && config.runtimeBasePath
        ? String(config.runtimeBasePath)
        : normalizeBasePath(basePath) + "../";
    var loadProfile = resolveLoadProfile(config);
    var wasmExecPath = appendVersion(resolveDataPath(runtimeBasePath, "wasm_exec.js"), cacheBustToken);
    var wasmPath = appendVersion(resolveDataPath(runtimeBasePath, "finance.wasm"), cacheBustToken);
    return {
      variant: variant,
      basePath: basePath,
      runtimeMode: runtimeMode,
      loadProfile: loadProfile,
      requiredFiles: requiredFilesForLoadProfile(loadProfile),
      runtimeBasePath: runtimeBasePath,
      wasmExecPath: wasmExecPath,
      wasmPath: wasmPath
    };
  }

  async function loadModel(options) {
    var bootConfig = createBootConfig(options);
    var runtimeMode = bootConfig.runtimeMode;
    activeBootConfig = activeBootConfig || bootConfig;

    var runtime = await getRuntimeModule();
    var bundle = await runtime.loadMockupBundle({
      basePath: bootConfig.basePath,
      preferStorage: true,
      loadProfile: bootConfig.loadProfile
    });
    if (!Array.isArray(bundle.csvFiles) || bundle.csvFiles.length === 0) {
      lastRuntimeState = {
        bundle: bundle,
        compute: null,
        wasmExecPath: bootConfig.wasmExecPath,
        wasmPath: bootConfig.wasmPath
      };
      lastRenderedModel = null;
      setRuntimeMarkers(
        {
          source: bundle.source || "storage",
          tableCount: 0
        },
        "strict"
      );
      return {
        emptyWorkspace: true,
        latestMonth: "N/A",
        runtimeMode: "strict",
        runtime: {
          source: bundle.source || "storage",
          tableCount: 0
        }
      };
    }
    var bundleCompute = await runtime.computeBundle(bundle, {
      wasmExecPath: bootConfig.wasmExecPath,
      wasmPath: bootConfig.wasmPath,
      scope: global
    });
    var runtimeSnapshot = bundleCompute.runtime || {};
    if (runtimeMode !== "strict") {
      console.warn(
        "[FinanceOverview] runtimeMode='" +
          runtimeMode +
          "' requested, but strict mode is canonical. Rendering in strict mode."
      );
    }

    lastRuntimeState = {
      bundle: bundle,
      compute: bundleCompute,
      wasmExecPath: bootConfig.wasmExecPath,
      wasmPath: bootConfig.wasmPath
    };

    var model = buildModelFromRuntime(runtimeSnapshot);
    setRuntimeMarkers(runtimeSnapshot, model.runtimeMode);

    return model;
  }

  function setLifecycleStatus(message) {
    var text = String(message || "");
    ["fo-status", "fo-settings-status"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) {
        node.textContent = text;
      }
    });
  }

  function setStorageWarningBanner(message) {
    var text = String(message || "").trim();
    ["fo-storage-unavailable-banner", "fo-settings-storage-banner"].forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) {
        return;
      }
      if (!text) {
        node.classList.add("is-hidden");
        return;
      }
      node.textContent = text;
      node.classList.remove("is-hidden");
    });
  }

  function fallbackFormatStorageUsage(usage, quota) {
    var usedMB = (toFiniteNumber(usage) / 1024 / 1024).toFixed(2);
    if (quota == null || quota === undefined) {
      return usedMB + " MB used";
    }
    var totalMB = (toFiniteNumber(quota) / 1024 / 1024).toFixed(2);
    return usedMB + " MB / " + totalMB + " MB used";
  }

  function fallbackPersistentStorageStatus(persisted) {
    return persisted
      ? "Persistent storage enabled."
      : "May be cleared under storage pressure; export workspace recommended.";
  }

  async function toStorageWarningMessage(err) {
    try {
      var storageUtils = await getStorageUtilsModule();
      if (storageUtils && typeof storageUtils.getStorageWarning === "function") {
        return String(storageUtils.getStorageWarning(err) || "");
      }
    } catch {
      // Fall through to local fallback wording.
    }
    var isQuotaExceeded = err && (err.name === "QuotaExceededError" || err.code === 22);
    return isQuotaExceeded
      ? "Storage full. Your data is in memory but won't persist. Export to save a copy."
      : "Storage unavailable. Data will not persist across reloads.";
  }

  async function refreshStorageTelemetry() {
    var usageNodes = ["fo-storage-usage", "fo-settings-storage-usage"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!usageNodes.length) {
      return;
    }
    if (
      !global.navigator ||
      !global.navigator.storage ||
      typeof global.navigator.storage.estimate !== "function"
    ) {
      usageNodes.forEach(function (node) {
        node.textContent = "Storage: unavailable";
      });
      setStorageWarningBanner("Storage unavailable. Data will not persist across reloads.");
      return;
    }
    try {
      var estimate = await global.navigator.storage.estimate();
      var persisted = false;
      if (typeof global.navigator.storage.persisted === "function") {
        persisted = !!(await global.navigator.storage.persisted());
      }
      var storageUtils = null;
      try {
        storageUtils = await getStorageUtilsModule();
      } catch {
        storageUtils = null;
      }
      var usageFormatter =
        storageUtils && typeof storageUtils.formatStorageUsage === "function"
          ? storageUtils.formatStorageUsage
          : fallbackFormatStorageUsage;
      var statusFormatter =
        storageUtils && typeof storageUtils.getPersistentStorageStatus === "function"
          ? storageUtils.getPersistentStorageStatus
          : fallbackPersistentStorageStatus;
      var text =
        "Storage: " +
        usageFormatter(estimate && estimate.usage, estimate && estimate.quota) +
        ". " +
        statusFormatter(persisted);
      usageNodes.forEach(function (node) {
        node.textContent = text;
      });
    } catch {
      usageNodes.forEach(function (node) {
        node.textContent = "Storage: unavailable";
      });
      setStorageWarningBanner("Storage unavailable. Data will not persist across reloads.");
    }
  }

  function refreshStorageTelemetrySafe() {
    refreshStorageTelemetry().catch(function () {
      ["fo-storage-usage", "fo-settings-storage-usage"].forEach(function (id) {
        var usageNode = document.getElementById(id);
        if (usageNode) {
          usageNode.textContent = "Storage: unavailable";
        }
      });
      setStorageWarningBanner("Storage unavailable. Data will not persist across reloads.");
    });
  }

  function downloadTextFile(text, fileName, mimeType) {
    var blob = new Blob([String(text == null ? "" : text)], {
      type: mimeType || "text/plain;charset=utf-8;"
    });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = String(fileName || "download.txt");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadJsonFile(value, fileName) {
    var text = JSON.stringify(value, null, 2);
    downloadTextFile(text, fileName, "application/json");
  }

  function formatFileSize(bytes) {
    var amount = toFiniteNumber(bytes);
    if (amount < 1024) {
      return toLocale(amount, 0, 0) + " B";
    }
    if (amount < 1024 * 1024) {
      return toLocale(amount / 1024, 1, 1) + " KB";
    }
    return toLocale(amount / (1024 * 1024), 1, 1) + " MB";
  }

  function loadedFileSelectionId(file, index) {
    if (file && file.id) {
      return String(file.id);
    }
    return "mem-" + String(index);
  }

  function getComputedTables() {
    var computeResult = lastRuntimeState && lastRuntimeState.compute && lastRuntimeState.compute.computeResult;
    if (!computeResult || !Array.isArray(computeResult.Tables)) {
      return [];
    }
    return computeResult.Tables;
  }

  function syncExportTableSelect() {
    var selects = ["fo-export-table-select"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!selects.length) {
      return;
    }

    var tables = getComputedTables();
    selects.forEach(function (select) {
      var previous = String(select.value || "");
      select.innerHTML = "";

      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = tables.length ? "(select table)" : "(no computed tables)";
      select.appendChild(placeholder);

      tables.forEach(function (table) {
        var tableID = String(table && table.TableID ? table.TableID : "");
        if (!tableID) {
          return;
        }
        var rowCount = Array.isArray(table.Rows) ? table.Rows.length : 0;
        var option = document.createElement("option");
        option.value = tableID;
        option.textContent = tableID + " (" + toLocale(rowCount, 0, 0) + " rows)";
        select.appendChild(option);
      });

      if (previous && tables.some(function (table) { return String(table.TableID || "") === previous; })) {
        select.value = previous;
        return;
      }

      select.value = tables.length ? String(tables[0].TableID || "") : "";
    });
  }

  function updateSettingsWorkspaceSummary(loadedCount) {
    var summary = document.getElementById("fo-settings-workspace-summary");
    var count = Math.max(0, toFiniteNumber(loadedCount));
    if (summary) {
      summary.textContent = "Workspace and loaded files (" + toLocale(count, 0, 0) + " loaded)";
    }
    var meta = document.getElementById("fo-settings-loaded-files-meta");
    if (meta) {
      meta.textContent = "Loaded files: " + toLocale(count, 0, 0);
    }
  }

  function renderLoadedFilesListInto(list) {
    if (!list) {
      return;
    }

    var files = lastRuntimeState && lastRuntimeState.bundle && Array.isArray(lastRuntimeState.bundle.csvFiles)
      ? lastRuntimeState.bundle.csvFiles
      : [];
    list.innerHTML = "";

    if (!files.length) {
      var empty = document.createElement("li");
      empty.textContent = "No files loaded.";
      list.appendChild(empty);
      updateSettingsWorkspaceSummary(0);
      return;
    }

    files.forEach(function (file, index) {
      var name = String((file && file.name) || "data.csv");
      var size = formatFileSize((file && String(file.content || "").length) || 0);
      var createdAt = toFiniteNumber(file && file.createdAt);
      var createdText = createdAt > 0 ? " - " + new Date(createdAt * 1000).toLocaleDateString("es-AR") : "";

      var li = document.createElement("li");
      var label = document.createElement("label");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = loadedFileSelectionId(file, index);
      checkbox.dataset.fileIndex = String(index);
      checkbox.style.marginRight = "6px";
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(name + " (" + size + ")" + createdText));
      li.appendChild(label);
      list.appendChild(li);
    });
    updateSettingsWorkspaceSummary(files.length);
  }

  function syncLoadedFilesList() {
    renderLoadedFilesListInto(document.getElementById("fo-loaded-files-list"));
    renderLoadedFilesListInto(document.getElementById("fo-settings-loaded-files-list-rebuild"));
  }

  function ensureMappingsShape(mappingsObj) {
    var out = cloneMappingsObject(mappingsObj);
    EXPECTED_MAPPINGS_KEYS.forEach(function (key) {
      if (!out[key] || typeof out[key] !== "object" || Array.isArray(out[key])) {
        out[key] = {};
      }
    });
    return out;
  }

  function mappingRuleCount(section) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return 0;
    }
    return Object.keys(section).length;
  }

  function mappingsSummaryText(mappingsObj) {
    var shaped = ensureMappingsShape(mappingsObj);
    var ownerCount = mappingRuleCount(shaped.ownersByCardOwner);
    var cardCount = mappingRuleCount(shaped.ownersByCardNumber);
    var categoryCount = mappingRuleCount(shaped.categoryByDetail);
    var categorySegmentCount = mappingRuleCount(shaped.categorySegmentByCategory);
    if (ownerCount === 0 && cardCount === 0 && categoryCount === 0 && categorySegmentCount === 0) {
      return "No mappings loaded.";
    }
    var parts = [];
    if (ownerCount) {
      parts.push(ownerCount + " card-owner rule" + (ownerCount === 1 ? "" : "s"));
    }
    if (cardCount) {
      parts.push(cardCount + " card-number rule" + (cardCount === 1 ? "" : "s"));
    }
    if (categoryCount) {
      parts.push(categoryCount + " category rule" + (categoryCount === 1 ? "" : "s"));
    }
    if (categorySegmentCount) {
      parts.push(categorySegmentCount + " category-segment rule" + (categorySegmentCount === 1 ? "" : "s"));
    }
    return parts.join(", ") + ".";
  }

  function syncMappingsView() {
    var summaryNodes = ["fo-mappings-summary", "fo-settings-mappings-summary"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    var jsonNodes = ["fo-mappings-json", "fo-settings-mappings-json"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!summaryNodes.length && !jsonNodes.length) {
      return;
    }

    var mappingsObj = ensureMappingsShape(lastRuntimeState && lastRuntimeState.bundle && lastRuntimeState.bundle.mappingsObj);
    var summaryText = mappingsSummaryText(mappingsObj);
    summaryNodes.forEach(function (node) {
      node.textContent = summaryText;
    });
    var jsonText = JSON.stringify(mappingsObj, null, 2);
    jsonNodes.forEach(function (node) {
      node.textContent = jsonText;
    });
  }

  function normalizeRuleEditorSectionKey(value) {
    var key = String(value || "").trim();
    if (Object.prototype.hasOwnProperty.call(RULE_EDITOR_SECTION_CONFIG, key)) {
      return key;
    }
    return "categoryByDetail";
  }

  function ruleEditorSectionLabel(sectionKey) {
    var normalized = normalizeRuleEditorSectionKey(sectionKey);
    return RULE_EDITOR_SECTION_CONFIG[normalized].label;
  }

  function setRuleEditorValidationMessage(message) {
    ruleEditorState.validationMessage = String(message || "");
  }

  function validateRuleEditorDraft(sectionKey, key, value, section, originalKey) {
    var normalizedKey = String(key || "").trim();
    var normalizedValue = String(value || "").trim();
    var normalizedOriginalKey = String(originalKey || "").trim();
    if (!normalizedKey || !normalizedValue) {
      return "Rule key and value are required.";
    }
    if (/[\r\n]/.test(normalizedKey) || /[\r\n]/.test(normalizedValue)) {
      return "Rule key and value must be single-line text.";
    }
    if (normalizedKey.length > RULE_EDITOR_MAX_FIELD_LENGTH) {
      return "Rule key is too long (max " + RULE_EDITOR_MAX_FIELD_LENGTH + " chars).";
    }
    if (normalizedValue.length > RULE_EDITOR_MAX_FIELD_LENGTH) {
      return "Rule value is too long (max " + RULE_EDITOR_MAX_FIELD_LENGTH + " chars).";
    }
    if (sectionKey === "ownersByCardNumber") {
      var digitCount = normalizedKey.replace(/\D/g, "").length;
      if (digitCount < 4) {
        return "Card-number rule key must include at least 4 digits.";
      }
    }
    if (sectionKey === "categorySegmentByCategory") {
      var normalizedSegment = normalizedCategoryKey(normalizedValue);
      if (normalizedSegment !== "essential" && normalizedSegment !== "discretionary") {
        return "Category-segment rule value must be essential or discretionary.";
      }
    }
    var existingSection = section && typeof section === "object" ? section : {};
    var lowerKey = normalizedKey.toLowerCase();
    var duplicateCaseKey = Object.keys(existingSection).find(function (existingKey) {
      if (normalizedOriginalKey && existingKey === normalizedOriginalKey) {
        return false;
      }
      return String(existingKey || "").toLowerCase() === lowerKey && existingKey !== normalizedKey;
    });
    if (duplicateCaseKey) {
      return "Rule key conflicts with existing key '" + duplicateCaseKey + "' (case-insensitive).";
    }
    return "";
  }

  function resetRuleEditorDraft() {
    ruleEditorState.draftKey = "";
    ruleEditorState.draftValue = "";
    ruleEditorState.editOriginalKey = "";
    setRuleEditorValidationMessage("");
  }

  function resolvePreferredPageId(pageId) {
    var normalizedPageId = String(pageId || "").trim();
    if (!normalizedPageId) {
      return "";
    }
    var preferredCandidates =
      normalizedPageId === "settings"
        ? [normalizedPageId, normalizedPageId + "-old"]
        : [normalizedPageId + "-old", normalizedPageId];
    for (var index = 0; index < preferredCandidates.length; index += 1) {
      var candidate = preferredCandidates[index];
      if (document.querySelector('.nav button[data-page="' + candidate + '"]')) {
        return candidate;
      }
    }
    return normalizedPageId;
  }

  function showPageByNavButton(pageId) {
    var targetPage = resolvePreferredPageId(pageId);
    if (!targetPage) {
      return false;
    }
    var button = document.querySelector('.nav button[data-page="' + targetPage + '"]');
    if (!button || typeof button.click !== "function") {
      return false;
    }
    button.click();
    return true;
  }

  function openRuleEditorForCategoryDetail(detail) {
    var cleanDetail = String(detail || "").trim();
    if (!cleanDetail || cleanDetail === "(empty detail)") {
      var emptyMessage = "Cannot prefill rule editor from an empty detail row.";
      setLifecycleStatus(emptyMessage);
      setLiveStatus(emptyMessage, false);
      return false;
    }

    if (!showPageByNavButton("settings")) {
      var unavailableMessage = "Rule editor is unavailable in this page.";
      setLifecycleStatus(unavailableMessage);
      setLiveStatus(unavailableMessage, false);
      return false;
    }

    var typeSelect = document.getElementById("fo-rule-editor-type");
    if (typeSelect) {
      typeSelect.value = "categoryByDetail";
    }

    ruleEditorState.sectionKey = "categoryByDetail";
    ruleEditorState.search = "";
    ruleEditorState.editOriginalKey = "";
    ruleEditorState.draftKey = cleanDetail;
    ruleEditorState.draftValue = "";
    setRuleEditorValidationMessage("");
    syncRuleEditorView();

    var valueInput = document.getElementById("fo-rule-editor-value");
    if (valueInput && typeof valueInput.focus === "function") {
      valueInput.focus();
    }

    var successMessage =
      "Category rule draft loaded from uncategorized detail '" +
      cleanDetail +
      "'. Fill value and save.";
    setLifecycleStatus(successMessage);
    setLiveStatus(successMessage, false);
    return true;
  }

  function syncRuleEditorView() {
    var typeSelect =
      document.getElementById("fo-rule-editor-type") ||
      document.getElementById("fo-settings-rule-editor-type");
    var searchInput =
      document.getElementById("fo-rule-editor-search") ||
      document.getElementById("fo-settings-rule-editor-search");
    var keyInput =
      document.getElementById("fo-rule-editor-key") ||
      document.getElementById("fo-settings-rule-editor-key");
    var valueInput =
      document.getElementById("fo-rule-editor-value") ||
      document.getElementById("fo-settings-rule-editor-value");
    var saveBtn =
      document.getElementById("fo-rule-editor-save-btn") ||
      document.getElementById("fo-settings-rule-editor-save-btn");
    var body =
      document.getElementById("fo-rule-editor-body") ||
      document.getElementById("fo-settings-rule-editor-body");
    var meta =
      document.getElementById("fo-rule-editor-meta") ||
      document.getElementById("fo-settings-rule-editor-meta");
    var validation =
      document.getElementById("fo-rule-editor-validation") ||
      document.getElementById("fo-settings-rule-editor-validation");
    if (
      !typeSelect &&
      !searchInput &&
      !keyInput &&
      !valueInput &&
      !saveBtn &&
      !body &&
      !meta &&
      !validation
    ) {
      return;
    }

    var sectionKey = normalizeRuleEditorSectionKey(
      (typeSelect && typeSelect.value) || ruleEditorState.sectionKey
    );
    ruleEditorState.sectionKey = sectionKey;
    if (typeSelect && typeSelect.value !== sectionKey) {
      typeSelect.value = sectionKey;
    }

    if (searchInput && String(searchInput.value || "") !== String(ruleEditorState.search || "")) {
      searchInput.value = String(ruleEditorState.search || "");
    }
    if (keyInput && String(keyInput.value || "") !== String(ruleEditorState.draftKey || "")) {
      keyInput.value = String(ruleEditorState.draftKey || "");
    }
    if (valueInput && String(valueInput.value || "") !== String(ruleEditorState.draftValue || "")) {
      valueInput.value = String(ruleEditorState.draftValue || "");
    }
    if (saveBtn) {
      saveBtn.textContent = ruleEditorState.editOriginalKey ? "Update rule" : "Save rule";
    }
    if (validation) {
      var validationMessage = String(ruleEditorState.validationMessage || "").trim();
      validation.textContent = validationMessage;
      validation.classList.toggle("is-hidden", !validationMessage);
    }

    var mappingsObj = ensureMappingsShape(lastRuntimeState && lastRuntimeState.bundle && lastRuntimeState.bundle.mappingsObj);
    var section = mappingsObj[sectionKey] && typeof mappingsObj[sectionKey] === "object"
      ? mappingsObj[sectionKey]
      : {};
    var entries = Object.entries(section).sort(function (a, b) {
      return String(a[0] || "").localeCompare(String(b[0] || ""), undefined, { sensitivity: "base" });
    });

    var searchTerm = String(ruleEditorState.search || "").trim().toLowerCase();
    var filtered = searchTerm
      ? entries.filter(function (entry) {
          return (
            String(entry[0] || "").toLowerCase().includes(searchTerm) ||
            String(entry[1] || "").toLowerCase().includes(searchTerm)
          );
        })
      : entries;
    var visible = filtered.slice(0, RULE_EDITOR_RENDER_LIMIT);

    if (body) {
      body.innerHTML = "";
      if (!visible.length) {
        var emptyRow = document.createElement("tr");
        var emptyCell = document.createElement("td");
        emptyCell.colSpan = 3;
        emptyCell.textContent = entries.length
          ? "No rules match the current search."
          : "No rules in this mapping section.";
        emptyRow.appendChild(emptyCell);
        body.appendChild(emptyRow);
      } else {
        visible.forEach(function (entry) {
          var key = String(entry[0] || "");
          var value = String(entry[1] || "");
          var row = document.createElement("tr");

          var keyCell = document.createElement("td");
          keyCell.textContent = key;
          row.appendChild(keyCell);

          var valueCell = document.createElement("td");
          valueCell.textContent = value;
          row.appendChild(valueCell);

          var actionCell = document.createElement("td");
          var editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn";
          editBtn.dataset.ruleAction = "edit";
          editBtn.dataset.ruleKey = key;
          editBtn.textContent = "Edit";
          actionCell.appendChild(editBtn);

          var deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "btn";
          deleteBtn.dataset.ruleAction = "delete";
          deleteBtn.dataset.ruleKey = key;
          deleteBtn.textContent = "Delete";
          deleteBtn.style.marginLeft = "6px";
          actionCell.appendChild(deleteBtn);

          row.appendChild(actionCell);
          body.appendChild(row);
        });
      }
    }

    if (meta) {
      var prefix = "Showing " + toLocale(visible.length, 0, 0) + " of " + toLocale(filtered.length, 0, 0);
      if (filtered.length !== entries.length) {
        prefix += " matching " + toLocale(entries.length, 0, 0);
      }
      var suffix = " rule(s) in " + ruleEditorSectionLabel(sectionKey) + ".";
      if (filtered.length > RULE_EDITOR_RENDER_LIMIT) {
        suffix += " Refine search to narrow results.";
      }
      if (ruleEditorState.editOriginalKey) {
        suffix += " Editing: " + ruleEditorState.editOriginalKey + ".";
      }
      meta.textContent = prefix + suffix;
    }

    syncSettingsRuleEditorMirror();
  }

  function syncSettingsRuleEditorMirror() {
    var legacyType = document.getElementById("fo-rule-editor-type");
    var legacySearch = document.getElementById("fo-rule-editor-search");
    var legacyKey = document.getElementById("fo-rule-editor-key");
    var legacyValue = document.getElementById("fo-rule-editor-value");
    var legacySave = document.getElementById("fo-rule-editor-save-btn");
    var legacyBody = document.getElementById("fo-rule-editor-body");
    var legacyMeta = document.getElementById("fo-rule-editor-meta");
    var legacyValidation = document.getElementById("fo-rule-editor-validation");

    var typeSelect = document.getElementById("fo-settings-rule-editor-type");
    var searchInput = document.getElementById("fo-settings-rule-editor-search");
    var keyInput = document.getElementById("fo-settings-rule-editor-key");
    var valueInput = document.getElementById("fo-settings-rule-editor-value");
    var saveBtn = document.getElementById("fo-settings-rule-editor-save-btn");
    var body = document.getElementById("fo-settings-rule-editor-body");
    var meta = document.getElementById("fo-settings-rule-editor-meta");
    var validation = document.getElementById("fo-settings-rule-editor-validation");

    if (!typeSelect && !searchInput && !keyInput && !valueInput && !saveBtn && !body && !meta && !validation) {
      return;
    }

    if (typeSelect && legacyType) {
      var nextValue = String(legacyType.value || "categoryByDetail");
      var hasOption = Array.from(typeSelect.options || []).some(function (option) {
        return String(option.value || "") === nextValue;
      });
      typeSelect.value = hasOption ? nextValue : "categoryByDetail";
    }
    if (searchInput && legacySearch) {
      searchInput.value = String(legacySearch.value || "");
    }
    if (keyInput && legacyKey) {
      keyInput.value = String(legacyKey.value || "");
    }
    if (valueInput && legacyValue) {
      valueInput.value = String(legacyValue.value || "");
    }
    if (saveBtn && legacySave) {
      saveBtn.textContent = legacySave.textContent || "Save rule";
    }
    if (body && legacyBody) {
      body.innerHTML = legacyBody.innerHTML;
    }
    if (meta && legacyMeta) {
      meta.textContent = legacyMeta.textContent || "";
    }
    if (validation && legacyValidation) {
      validation.textContent = legacyValidation.textContent || "";
      validation.classList.toggle("is-hidden", legacyValidation.classList.contains("is-hidden"));
    }
  }

  async function saveRuleEditorDraft() {
    var sectionKey = normalizeRuleEditorSectionKey(ruleEditorState.sectionKey);
    var nextKey = String(ruleEditorState.draftKey || "").trim();
    var nextValue = String(ruleEditorState.draftValue || "").trim();

    var mappingsObj = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
    var section = Object.assign({}, mappingsObj[sectionKey] || {});
    var originalKey = String(ruleEditorState.editOriginalKey || "").trim();
    var validationError = validateRuleEditorDraft(sectionKey, nextKey, nextValue, section, originalKey);
    if (validationError) {
      setRuleEditorValidationMessage(validationError);
      throw new Error(validationError);
    }
    if (sectionKey === "categorySegmentByCategory") {
      nextValue = normalizedCategoryKey(nextValue);
    }
    if (originalKey && originalKey !== nextKey) {
      delete section[originalKey];
    }
    section[nextKey] = nextValue;
    mappingsObj[sectionKey] = section;

    var computeInfo = await applyMappingsAndMaybeRecompute(mappingsObj);
    setRuleEditorValidationMessage("");
    ruleEditorState.editOriginalKey = nextKey;
    ruleEditorState.draftKey = nextKey;
    ruleEditorState.draftValue = nextValue;

    var message = "Saved rule '" + nextKey + "' in " + ruleEditorSectionLabel(sectionKey) + ".";
    if (computeInfo.hasCsvFiles) {
      message += " Recomputed " + toLocale(computeInfo.tableCount, 0, 0) + " table(s).";
    }
    if (computeInfo.storageWarning) {
      message += " Storage warning: " + computeInfo.storageWarning;
    }
    return message;
  }

  async function deleteRuleEditorKey(ruleKey) {
    var sectionKey = normalizeRuleEditorSectionKey(ruleEditorState.sectionKey);
    var cleanKey = String(ruleKey || "").trim();
    if (!cleanKey) {
      throw new Error("Rule key is required.");
    }

    var mappingsObj = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
    var section = Object.assign({}, mappingsObj[sectionKey] || {});
    if (!Object.prototype.hasOwnProperty.call(section, cleanKey)) {
      return "Rule '" + cleanKey + "' was not found.";
    }
    delete section[cleanKey];
    mappingsObj[sectionKey] = section;

    var computeInfo = await applyMappingsAndMaybeRecompute(mappingsObj);
    if (ruleEditorState.editOriginalKey === cleanKey) {
      resetRuleEditorDraft();
    }

    var message = "Deleted rule '" + cleanKey + "' from " + ruleEditorSectionLabel(sectionKey) + ".";
    if (computeInfo.hasCsvFiles) {
      message += " Recomputed " + toLocale(computeInfo.tableCount, 0, 0) + " table(s).";
    }
    if (computeInfo.storageWarning) {
      message += " Storage warning: " + computeInfo.storageWarning;
    }
    return message;
  }

  function syncLifecycleUiFromState() {
    syncExportTableSelect();
    syncLoadedFilesList();
    syncMappingsView();
    syncRuleEditorView();
    refreshStorageTelemetrySafe();
  }

  function cloneMappingsObject(mappingsObj) {
    if (!mappingsObj || typeof mappingsObj !== "object") {
      return {};
    }
    try {
      return JSON.parse(JSON.stringify(mappingsObj));
    } catch {
      return {};
    }
  }

  function cloneBundle(bundle) {
    var csvFiles = Array.isArray(bundle && bundle.csvFiles)
      ? bundle.csvFiles.map(function (file) {
          return {
            id: file && file.id ? file.id : undefined,
            name: String((file && file.name) || "data.csv"),
            content: String((file && file.content) || ""),
            createdAt: toFiniteNumber(file && file.createdAt) || Math.floor(Date.now() / 1000)
          };
        })
      : [];
    return {
      source: String((bundle && bundle.source) || "files"),
      csvFiles: csvFiles,
      mappingsObj: cloneMappingsObject(bundle && bundle.mappingsObj)
    };
  }

  function getCurrentBundle() {
    if (!lastRuntimeState || !lastRuntimeState.bundle) {
      throw new Error("Runtime bundle is not initialized yet.");
    }
    return lastRuntimeState.bundle;
  }

  async function runBundleComputeAndRender(bundle) {
    var runtime = await getRuntimeModule();
    var bootConfig = activeBootConfig || createBootConfig({});
    var bundleCompute = await runtime.computeBundle(bundle, {
      wasmExecPath: bootConfig.wasmExecPath,
      wasmPath: bootConfig.wasmPath,
      scope: global
    });

    lastRuntimeState = {
      bundle: bundle,
      compute: bundleCompute,
      wasmExecPath: bootConfig.wasmExecPath,
      wasmPath: bootConfig.wasmPath
    };

    var model = buildModelFromRuntime(bundleCompute.runtime || {});
    setRuntimeMarkers(bundleCompute.runtime || {}, model.runtimeMode);
    renderVariant(bootConfig.variant || "mockup1", model);
    clearBlockingOverlay();
    setBootState("ready");
    syncLifecycleUiFromState();
    return model;
  }

  async function tryPersistBundleToStorage(bundle) {
    try {
      var runtime = await getRuntimeModule();
      await runtime.persistBundleToStorage(bundle);
      setStorageWarningBanner("");
      refreshStorageTelemetrySafe();
      return "";
    } catch (err) {
      var warningMessage = await toStorageWarningMessage(err);
      setStorageWarningBanner(warningMessage);
      refreshStorageTelemetrySafe();
      return warningMessage;
    }
  }

  function readOkValue(result, label) {
    if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "ok")) {
      if (result.ok) {
        return String(result.value == null ? "" : result.value);
      }
      throw new Error(label + " failed: " + String(result.err || result.error || "unknown error"));
    }
    return String(result == null ? "" : result);
  }

  function hasAnyMappings(mappingsObj) {
    var shaped = ensureMappingsShape(mappingsObj);
    return (
      mappingRuleCount(shaped.ownersByCardOwner) > 0 ||
      mappingRuleCount(shaped.ownersByCardNumber) > 0 ||
      mappingRuleCount(shaped.categoryByDetail) > 0 ||
      mappingRuleCount(shaped.categorySegmentByCategory) > 0
    );
  }

  async function applyBundleAndMaybeRecompute(nextBundle) {
    var bundle = cloneBundle(nextBundle);
    var hasCsvFiles = Array.isArray(bundle.csvFiles) && bundle.csvFiles.length > 0;
    var tableCount = 0;
    if (hasCsvFiles) {
      var model = await runBundleComputeAndRender(bundle);
      tableCount = toFiniteNumber(model && model.runtime && model.runtime.tableCount);
    } else {
      lastRuntimeState = Object.assign({}, lastRuntimeState || {}, {
        bundle: bundle,
        compute: null
      });
      lastRenderedModel = null;
      setRuntimeMarkers(
        {
          source: bundle.source || "ui",
          tableCount: 0
        },
        "strict"
      );
      syncLifecycleUiFromState();
      showEmptyWorkspaceOverlay();
    }
    var storageWarning = await tryPersistBundleToStorage(bundle);
    return {
      hasCsvFiles: hasCsvFiles,
      tableCount: tableCount,
      storageWarning: storageWarning
    };
  }

  function mappingValidationMessage(rawObj) {
    var missing = EXPECTED_MAPPINGS_KEYS.filter(function (key) {
      return !Object.prototype.hasOwnProperty.call(rawObj || {}, key);
    });
    if (missing.length === 0) {
      return "Valid structure.";
    }
    return (
      "Missing expected keys: " +
      missing.join(", ") +
      ". Expected: " +
      EXPECTED_MAPPINGS_KEYS.join(", ") +
      "."
    );
  }

  async function applyMappingsAndMaybeRecompute(nextMappingsObj) {
    var bundle = cloneBundle(getCurrentBundle());
    bundle.mappingsObj = ensureMappingsShape(nextMappingsObj);
    bundle.source = "ui-mappings";
    return applyBundleAndMaybeRecompute(bundle);
  }

  async function importMappingsJsonFile(file) {
    var text = await file.text();
    var obj = JSON.parse(text);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error("Mappings JSON must contain an object.");
    }
    var validationMessage = mappingValidationMessage(obj);
    var computeInfo = await applyMappingsAndMaybeRecompute(obj);
    var message = "Loaded mappings from " + file.name + ". " + validationMessage;
    if (computeInfo.hasCsvFiles) {
      message += " Recomputed " + toLocale(computeInfo.tableCount, 0, 0) + " table(s).";
    }
    if (computeInfo.storageWarning) {
      message += " Storage warning: " + computeInfo.storageWarning;
    }
    return message;
  }

  async function importMappingsCsvFile(file, mappingKey, label) {
    var text = await file.text();
    var module = await getMappingsCsvModule();
    if (!module || typeof module.parseMappingsCsv !== "function") {
      throw new Error("Mappings CSV parser is unavailable.");
    }
    var parser =
      mappingKey === "categorySegmentByCategory" ? module.parseCategorySegmentsCsv : module.parseMappingsCsv;
    if (typeof parser !== "function") {
      throw new Error("Requested mappings CSV parser is unavailable.");
    }
    var parsed = parser(text);
    var parsedCount = Object.keys(parsed).length;
    if (parsedCount === 0) {
      return "Warning: " + file.name + " is empty or has no valid rows. Mappings not updated.";
    }

    var current = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
    current[mappingKey] = Object.assign({}, current[mappingKey] || {}, parsed);
    var computeInfo = await applyMappingsAndMaybeRecompute(current);
    var message =
      "Loaded " +
      toLocale(parsedCount, 0, 0) +
      " " +
      label +
      " rules from " +
      file.name +
      ".";
    if (computeInfo.hasCsvFiles) {
      message += " Recomputed " + toLocale(computeInfo.tableCount, 0, 0) + " table(s).";
    }
    if (computeInfo.storageWarning) {
      message += " Storage warning: " + computeInfo.storageWarning;
    }
    return message;
  }

  async function clearMappings() {
    var computeInfo = await applyMappingsAndMaybeRecompute({});
    var message = "Cleared mappings.";
    if (computeInfo.hasCsvFiles) {
      message += " Recomputed " + toLocale(computeInfo.tableCount, 0, 0) + " table(s).";
    }
    if (computeInfo.storageWarning) {
      message += " Storage warning: " + computeInfo.storageWarning;
    }
    return message;
  }

  function selectedLoadedFileIds() {
    var ids = [];
    ["fo-loaded-files-list", "fo-settings-loaded-files-list-rebuild"].forEach(function (listId) {
      var list = document.getElementById(listId);
      if (!list) {
        return;
      }
      Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).forEach(function (node) {
        var value = String(node && node.value ? node.value : "");
        if (value && ids.indexOf(value) === -1) {
          ids.push(value);
        }
      });
    });
    return ids;
  }

  async function deleteSelectedCsvFilesAndMaybeRecompute() {
    var selectedIds = selectedLoadedFileIds();
    if (selectedIds.length === 0) {
      return {
        removedCount: 0,
        hasCsvFiles: Array.isArray(getCurrentBundle().csvFiles) && getCurrentBundle().csvFiles.length > 0,
        tableCount: 0,
        storageWarning: ""
      };
    }
    var bundle = cloneBundle(getCurrentBundle());
    var beforeCount = Array.isArray(bundle.csvFiles) ? bundle.csvFiles.length : 0;
    bundle.csvFiles = (bundle.csvFiles || []).filter(function (file, index) {
      return selectedIds.indexOf(loadedFileSelectionId(file, index)) === -1;
    });
    bundle.source = "ui-files-delete-selected";
    var computeInfo = await applyBundleAndMaybeRecompute(bundle);
    return {
      removedCount: Math.max(0, beforeCount - bundle.csvFiles.length),
      hasCsvFiles: computeInfo.hasCsvFiles,
      tableCount: computeInfo.tableCount,
      storageWarning: computeInfo.storageWarning
    };
  }

  async function deleteAllCsvFilesAndMappings() {
    var bundle = cloneBundle(getCurrentBundle());
    bundle.csvFiles = [];
    bundle.mappingsObj = {};
    bundle.source = "ui-files-delete-all";
    return applyBundleAndMaybeRecompute(bundle);
  }

  function exportAllCsvFiles() {
    var bundle = getCurrentBundle();
    var files = Array.isArray(bundle && bundle.csvFiles) ? bundle.csvFiles : [];
    if (files.length === 0) {
      return 0;
    }
    files.forEach(function (entry, index) {
      var name = String((entry && entry.name) || "");
      var safeName = name.trim() ? name : "data_" + String(index + 1) + ".csv";
      var content = String((entry && entry.content) || "");
      downloadTextFile(content, safeName, "text/csv;charset=utf-8;");
    });
    return files.length;
  }

  function exportWorkspaceArtifactJson() {
    var runtime = getRuntimeModule();
    return runtime.then(function (module) {
      var workspace = module.exportWorkspaceArtifact(getCurrentBundle());
      downloadJsonFile(workspace, "workspace.json");
      return workspace;
    });
  }

  async function importWorkspaceArtifactFile(file) {
    var text = await file.text();
    var runtime = await getRuntimeModule();
    var parsed = runtime.parseWorkspaceArtifact(text);
    var now = Math.floor(Date.now() / 1000);
    var csvFiles = Array.isArray(parsed && parsed.csvFiles) ? parsed.csvFiles : [];
    var mappingsObj = ensureMappingsShape(parsed && parsed.config ? parsed.config : {});
    var normalizedCsvFiles = csvFiles.map(function (entry, index) {
      var name = String((entry && entry.name) || "workspace_" + String(index + 1) + ".csv");
      var content = String((entry && entry.content) || "");
      runtime.parseCsvAsObjects(content, runtime.DATA_HEADERS, name);
      return {
        name: name,
        content: content,
        createdAt: now
      };
    });
    var nextBundle = {
      source: "ui-workspace-import",
      csvFiles: normalizedCsvFiles,
      mappingsObj: mappingsObj
    };
    var computeInfo = await applyBundleAndMaybeRecompute(nextBundle);
    return {
      fileCount: normalizedCsvFiles.length,
      hasCsvFiles: computeInfo.hasCsvFiles,
      tableCount: computeInfo.tableCount,
      storageWarning: computeInfo.storageWarning
    };
  }

  async function loadDemoBundle() {
    var runtime = await getRuntimeModule();
    var bootConfig = activeBootConfig || createBootConfig({});
    return runtime.loadMockupBundle({
      basePath: bootConfig.basePath,
      preferStorage: false,
      loadProfile: "public"
    });
  }

  async function importCsvFilesAndCompute(fileList) {
    var files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) {
      return;
    }

    setLiveStatus("Importing CSV files...", true);
    setLifecycleStatus("Importing " + toLocale(files.length, 0, 0) + " CSV file(s)...");

    try {
      var runtime = await getRuntimeModule();
      var baseBundle = cloneBundle(getCurrentBundle());
      var importedEntries = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var text = await file.text();
        runtime.parseCsvAsObjects(text, runtime.DATA_HEADERS, file.name || "data.csv");
        importedEntries.push({
          name: file.name || "data.csv",
          content: text,
          createdAt: Math.floor(Date.now() / 1000)
        });
      }

      var nextBundle = cloneBundle(baseBundle);
      nextBundle.csvFiles = nextBundle.csvFiles.concat(importedEntries);
      nextBundle.source = "ui-import";
      var model = await runBundleComputeAndRender(nextBundle);
      var storageWarning = await tryPersistBundleToStorage(nextBundle);
      var tableCount = toFiniteNumber(model.runtime && model.runtime.tableCount);
      var message =
        "Imported " +
        toLocale(importedEntries.length, 0, 0) +
        " CSV file(s): " +
        importedEntries
          .map(function (entry) {
            return entry.name;
          })
          .join(", ") +
        ". Recomputed " +
        toLocale(tableCount, 0, 0) +
        " table(s).";
      if (storageWarning) {
        message += " Storage warning: " + storageWarning;
      }
      setLifecycleStatus(message);
      setLiveStatus(message, false);
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      setLifecycleStatus("CSV import failed: " + errorMessage);
      setLiveStatus("CSV import failed: " + errorMessage, false);
    }
  }

  async function computeCurrentBundle() {
    var bundle = cloneBundle(getCurrentBundle());
    if (!Array.isArray(bundle.csvFiles) || bundle.csvFiles.length === 0) {
      var emptyMessage = "No CSV files loaded. Load CSV(s) or import a workspace to continue.";
      setLifecycleStatus(emptyMessage);
      setLiveStatus(emptyMessage, false);
      showEmptyWorkspaceOverlay();
      return;
    }
    setLiveStatus("Computing tables...", true);
    setLifecycleStatus("Computing runtime tables...");
    try {
      var model = await runBundleComputeAndRender(bundle);
      var storageWarning = await tryPersistBundleToStorage(bundle);
      var tableCount = toFiniteNumber(model.runtime && model.runtime.tableCount);
      var message = "Computed " + toLocale(tableCount, 0, 0) + " table(s).";
      if (storageWarning) {
        message += " Storage warning: " + storageWarning;
      }
      setLifecycleStatus(message);
      setLiveStatus(message, false);
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      setLifecycleStatus("Compute failed: " + errorMessage);
      setLiveStatus("Compute failed: " + errorMessage, false);
    }
  }

  async function handleExportSelectedTable() {
    setLiveStatus("Exporting selected table...", true);
    try {
      var tableSelect = document.getElementById("fo-export-table-select");
      var tableID = tableSelect ? String(tableSelect.value || "").trim() : "";
      if (!tableID) {
        throw new Error("Select a table first.");
      }
      var csvText = await exportRuntimeTable(tableID);
      downloadTextFile(csvText, tableID + ".csv", "text/csv;charset=utf-8;");
      var successMessage = "Exported " + tableID + ".csv";
      setLifecycleStatus(successMessage);
      setLiveStatus(successMessage, false);
    } catch (err) {
      var errorMessage = err && err.message ? err.message : String(err);
      setLifecycleStatus("Export failed: " + errorMessage);
      setLiveStatus("Export failed: " + errorMessage, false);
    }
  }

  async function handleImportMappingsJsonInputFile(file) {
    if (!file) {
      return;
    }
    await runLifecycleAction("import-mappings-json", async function () {
      try {
        if (hasAnyMappings(getCurrentBundle().mappingsObj)) {
          if (!global.confirm("Replace current mappings?")) {
            return;
          }
        }
        setLiveStatus("Importing mappings JSON...", true);
        setLifecycleStatus("Importing mappings from " + file.name + "...");
        var message = await importMappingsJsonFile(file);
        setLifecycleStatus(message);
        setLiveStatus(message, false);
      } catch (err) {
        var errorMessage = err && err.message ? err.message : String(err);
        setLifecycleStatus("Mappings import failed (" + file.name + "): " + errorMessage);
        setLiveStatus("Mappings import failed: " + errorMessage, false);
      }
    });
  }

  function bindMockupLifecycleControls() {
    if (lifecycleControlsBound) {
      return;
    }

    var loadCsvBtn = document.getElementById("fo-load-btn");
    var csvInput = document.getElementById("fo-import-csv-input");
    var computeBtn = document.getElementById("fo-compute-btn");
    var settingsComputeBtn = document.getElementById("fo-settings-run-compute-btn");
    var exportTableBtn = document.getElementById("fo-export-table-btn");
    var loadDemoBtn = document.getElementById("fo-load-demo-btn");
    var importMappingsBtn = document.getElementById("fo-import-mappings-btn");
    var importMappingsInput = document.getElementById("fo-import-mappings-input");
    var settingsImportMappingsBtn = document.getElementById("fo-settings-import-mappings-btn");
    var settingsImportMappingsInput = document.getElementById("fo-settings-import-mappings-input");
    var downloadTemplateMappingsBtn = document.getElementById("fo-download-template-mappings-btn");
    var settingsDownloadTemplateMappingsBtn = document.getElementById("fo-settings-download-template-mappings-btn");
    var downloadMappingsBtn = document.getElementById("fo-download-mappings-btn");
    var settingsDownloadMappingsBtn = document.getElementById("fo-settings-download-mappings-btn");
    var copyMappingsBtn = document.getElementById("fo-copy-mappings-btn");
    var settingsCopyMappingsBtn = document.getElementById("fo-settings-copy-mappings-btn");
    var clearMappingsBtn = document.getElementById("fo-clear-mappings-btn");
    var settingsClearMappingsBtn = document.getElementById("fo-settings-clear-mappings-btn");
    var importCardOwnerCsvBtn = document.getElementById("fo-import-card-owner-csv-btn");
    var cardOwnerCsvInput = document.getElementById("fo-card-owner-csv-input");
    var importCardNumberCsvBtn = document.getElementById("fo-import-card-number-csv-btn");
    var cardNumberCsvInput = document.getElementById("fo-card-number-csv-input");
    var importCategoryCsvBtn = document.getElementById("fo-import-category-csv-btn");
    var categoryCsvInput = document.getElementById("fo-category-csv-input");
    var importCategorySegmentCsvBtn = document.getElementById("fo-import-category-segment-csv-btn");
    var categorySegmentCsvInput = document.getElementById("fo-category-segment-csv-input");
    var downloadCategorySegmentTemplateCsvBtn = document.getElementById("fo-download-category-segment-template-csv-btn");
    var downloadCategorySegmentCsvBtn = document.getElementById("fo-download-category-segment-csv-btn");
    var downloadCardOwnerTemplateCsvBtn = document.getElementById("fo-download-card-owner-template-csv-btn");
    var downloadCardNumberTemplateCsvBtn = document.getElementById("fo-download-card-number-template-csv-btn");
    var downloadCategoryTemplateCsvBtn = document.getElementById("fo-download-category-template-csv-btn");
    var deleteSelectedBtn = document.getElementById("fo-delete-selected-btn");
    var settingsDeleteSelectedBtn = document.getElementById("fo-settings-delete-selected-btn");
    var deleteAllBtn = document.getElementById("fo-delete-all-btn");
    var settingsDeleteAllBtn = document.getElementById("fo-settings-delete-all-btn");
    var exportAllCsvsBtn = document.getElementById("fo-export-all-csvs-btn");
    var settingsExportAllCsvsBtn = document.getElementById("fo-settings-export-all-csvs-btn");
    var importWorkspaceBtn = document.getElementById("fo-import-workspace-btn");
    var workspaceFileInput = document.getElementById("fo-workspace-file-input");
    var exportWorkspaceBtn = document.getElementById("fo-export-workspace-btn");
    var ruleEditorType = document.getElementById("fo-rule-editor-type");
    var ruleEditorSearch = document.getElementById("fo-rule-editor-search");
    var ruleEditorKeyInput = document.getElementById("fo-rule-editor-key");
    var ruleEditorValueInput = document.getElementById("fo-rule-editor-value");
    var ruleEditorSaveBtn = document.getElementById("fo-rule-editor-save-btn");
    var ruleEditorResetBtn = document.getElementById("fo-rule-editor-reset-btn");
    var ruleEditorBody = document.getElementById("fo-rule-editor-body");
    var settingsRuleEditorType = document.getElementById("fo-settings-rule-editor-type");
    var settingsRuleEditorSearch = document.getElementById("fo-settings-rule-editor-search");
    var settingsRuleEditorKeyInput = document.getElementById("fo-settings-rule-editor-key");
    var settingsRuleEditorValueInput = document.getElementById("fo-settings-rule-editor-value");
    var settingsRuleEditorSaveBtn = document.getElementById("fo-settings-rule-editor-save-btn");
    var settingsRuleEditorResetBtn = document.getElementById("fo-settings-rule-editor-reset-btn");
    var settingsRuleEditorBody = document.getElementById("fo-settings-rule-editor-body");
    if (
      !loadCsvBtn &&
      !csvInput &&
      !computeBtn &&
      !settingsComputeBtn &&
      !exportTableBtn &&
      !loadDemoBtn &&
      !importMappingsBtn &&
      !importMappingsInput &&
      !settingsImportMappingsBtn &&
      !settingsImportMappingsInput &&
      !downloadTemplateMappingsBtn &&
      !settingsDownloadTemplateMappingsBtn &&
      !downloadMappingsBtn &&
      !settingsDownloadMappingsBtn &&
      !copyMappingsBtn &&
      !settingsCopyMappingsBtn &&
      !clearMappingsBtn &&
      !settingsClearMappingsBtn &&
      !importCardOwnerCsvBtn &&
      !cardOwnerCsvInput &&
      !importCardNumberCsvBtn &&
      !cardNumberCsvInput &&
      !importCategoryCsvBtn &&
      !categoryCsvInput &&
      !importCategorySegmentCsvBtn &&
      !categorySegmentCsvInput &&
      !downloadCategorySegmentTemplateCsvBtn &&
      !downloadCategorySegmentCsvBtn &&
      !downloadCardOwnerTemplateCsvBtn &&
      !downloadCardNumberTemplateCsvBtn &&
      !downloadCategoryTemplateCsvBtn &&
      !deleteSelectedBtn &&
      !settingsDeleteSelectedBtn &&
      !deleteAllBtn &&
      !settingsDeleteAllBtn &&
      !exportAllCsvsBtn &&
      !settingsExportAllCsvsBtn &&
      !importWorkspaceBtn &&
      !workspaceFileInput &&
      !exportWorkspaceBtn &&
      !ruleEditorType &&
      !ruleEditorSearch &&
      !ruleEditorKeyInput &&
      !ruleEditorValueInput &&
      !ruleEditorSaveBtn &&
      !ruleEditorResetBtn &&
      !ruleEditorBody &&
      !settingsRuleEditorType &&
      !settingsRuleEditorSearch &&
      !settingsRuleEditorKeyInput &&
      !settingsRuleEditorValueInput &&
      !settingsRuleEditorSaveBtn &&
      !settingsRuleEditorResetBtn &&
      !settingsRuleEditorBody
    ) {
      return;
    }

    lifecycleControlsBound = true;
    setLifecycleBusyState(false);
    syncRuleEditorView();

    function triggerDownloadTemplateMappings() {
      var template = ensureMappingsShape({});
      downloadJsonFile(template, "mappings.template.json");
      setLifecycleStatus("Downloaded mappings.template.json.");
      setLiveStatus("Downloaded mappings template.", false);
    }

    function triggerDownloadCurrentMappings() {
      try {
        var currentMappings = ensureMappingsShape(getCurrentBundle().mappingsObj);
        downloadJsonFile(currentMappings, "mappings.current.json");
        setLifecycleStatus("Downloaded mappings.current.json.");
        setLiveStatus("Downloaded current mappings.", false);
      } catch (err) {
        var errorMessage = err && err.message ? err.message : String(err);
        setLifecycleStatus("Download mappings failed: " + errorMessage);
        setLiveStatus("Download mappings failed: " + errorMessage, false);
      }
    }

    async function triggerCopyMappings() {
      await runLifecycleAction("copy-mappings", async function () {
        try {
          if (
            !global.navigator ||
            !global.navigator.clipboard ||
            typeof global.navigator.clipboard.writeText !== "function"
          ) {
            throw new Error("Clipboard API unavailable.");
          }
          var mappingsText = JSON.stringify(ensureMappingsShape(getCurrentBundle().mappingsObj), null, 2);
          await global.navigator.clipboard.writeText(mappingsText);
          setLifecycleStatus("Copied mappings to clipboard.");
          setLiveStatus("Copied mappings to clipboard.", false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Copy mappings failed: " + errorMessage);
          setLiveStatus("Copy mappings failed: " + errorMessage, false);
        }
      });
    }

    async function triggerClearMappings() {
      await runLifecycleAction("clear-mappings", async function () {
        setLiveStatus("Clearing mappings...", true);
        setLifecycleStatus("Clearing mappings...");
        try {
          var message = await clearMappings();
          setLifecycleStatus(message);
          setLiveStatus(message, false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Clear mappings failed: " + errorMessage);
          setLiveStatus("Clear mappings failed: " + errorMessage, false);
        }
      });
    }

    function loadRuleEditorDraftForKey(ruleKey) {
      try {
        var mappingsObj = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
        var sectionKey = normalizeRuleEditorSectionKey(ruleEditorState.sectionKey);
        var section = mappingsObj[sectionKey] && typeof mappingsObj[sectionKey] === "object"
          ? mappingsObj[sectionKey]
          : {};
        var value = Object.prototype.hasOwnProperty.call(section, ruleKey) ? String(section[ruleKey]) : "";
        ruleEditorState.editOriginalKey = ruleKey;
        ruleEditorState.draftKey = ruleKey;
        ruleEditorState.draftValue = value;
        setRuleEditorValidationMessage("");
        syncRuleEditorView();
        setLifecycleStatus("Editing rule '" + ruleKey + "' in " + ruleEditorSectionLabel(sectionKey) + ".");
        setLiveStatus("Rule loaded into editor form.", false);
      } catch (err) {
        var editMessage = err && err.message ? err.message : String(err);
        setLifecycleStatus("Rule editor unavailable: " + editMessage);
        setLiveStatus("Rule editor unavailable: " + editMessage, false);
      }
    }

    async function triggerRuleEditorSave() {
      await runLifecycleAction("rule-editor-save", async function () {
        setLiveStatus("Saving rule...", true);
        try {
          var message = await saveRuleEditorDraft();
          setLifecycleStatus(message);
          setLiveStatus(message, false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Save rule failed: " + errorMessage);
          setLiveStatus("Save rule failed: " + errorMessage, false);
        } finally {
          syncRuleEditorView();
        }
      });
    }

    async function triggerRuleEditorDelete(ruleKey) {
      var sectionLabel = ruleEditorSectionLabel(ruleEditorState.sectionKey);
      if (!global.confirm("Delete rule '" + ruleKey + "' from " + sectionLabel + "?")) {
        return;
      }
      await runLifecycleAction("rule-editor-delete", async function () {
        setLiveStatus("Deleting rule...", true);
        try {
          var message = await deleteRuleEditorKey(ruleKey);
          setLifecycleStatus(message);
          setLiveStatus(message, false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Delete rule failed: " + errorMessage);
          setLiveStatus("Delete rule failed: " + errorMessage, false);
        } finally {
          syncRuleEditorView();
        }
      });
    }

    async function triggerDeleteSelectedFiles() {
      await runLifecycleAction("delete-selected-files", async function () {
        setLiveStatus("Deleting selected CSV files...", true);
        try {
          var result = await deleteSelectedCsvFilesAndMaybeRecompute();
          if (result.removedCount === 0) {
            setLifecycleStatus("No loaded files selected.");
            setLiveStatus("No loaded files selected.", false);
            return;
          }
          var message = "Removed " + toLocale(result.removedCount, 0, 0) + " file(s).";
          if (result.hasCsvFiles) {
            message += " Recomputed " + toLocale(result.tableCount, 0, 0) + " table(s).";
          } else {
            message += " No CSV files remain loaded.";
          }
          if (result.storageWarning) {
            message += " Storage warning: " + result.storageWarning;
          }
          setLifecycleStatus(message);
          setLiveStatus(message, false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Delete selected failed: " + errorMessage);
          setLiveStatus("Delete selected failed: " + errorMessage, false);
        }
      });
    }

    async function triggerDeleteAllFiles() {
      await runLifecycleAction("delete-all-files", async function () {
        setLiveStatus("Deleting all loaded files and mappings...", true);
        setLifecycleStatus("Deleting all loaded files and mappings...");
        try {
          var result = await deleteAllCsvFilesAndMappings();
          var message = "Deleted all loaded files and mappings.";
          if (result.storageWarning) {
            message += " Storage warning: " + result.storageWarning;
          }
          setLifecycleStatus(message);
          setLiveStatus(message, false);
        } catch (err) {
          var errorMessage = err && err.message ? err.message : String(err);
          setLifecycleStatus("Delete all failed: " + errorMessage);
          setLiveStatus("Delete all failed: " + errorMessage, false);
        }
      });
    }

    function triggerExportAllCsvs() {
      if (lifecycleBusy) {
        return;
      }
      try {
        var count = exportAllCsvFiles();
        if (count === 0) {
          setLifecycleStatus("No files to export.");
          setLiveStatus("No files to export.", false);
          return;
        }
        var message = "Exported " + toLocale(count, 0, 0) + " CSV file(s).";
        setLifecycleStatus(message);
        setLiveStatus(message, false);
      } catch (err) {
        var errorMessage = err && err.message ? err.message : String(err);
        setLifecycleStatus("Export all CSVs failed: " + errorMessage);
        setLiveStatus("Export all CSVs failed: " + errorMessage, false);
      }
    }

    if (loadCsvBtn && csvInput) {
      loadCsvBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        csvInput.click();
      });
      loadCsvBtn.title = "Import CSV files and append them to the current runtime dataset.";
    }

    if (csvInput) {
      csvInput.addEventListener("change", async function (event) {
        var files = Array.from((event.target && event.target.files) || []);
        await runLifecycleAction("import-csv", async function () {
          await importCsvFilesAndCompute(files);
        });
        if (event.target) {
          event.target.value = "";
        }
      });
    }

    if (computeBtn) {
      computeBtn.addEventListener("click", function () {
        runLifecycleAction("compute", async function () {
          await computeCurrentBundle();
        });
      });
    }

    if (settingsComputeBtn) {
      settingsComputeBtn.addEventListener("click", function () {
        if (computeBtn && typeof computeBtn.click === "function") {
          computeBtn.click();
          return;
        }
        runLifecycleAction("compute", async function () {
          await computeCurrentBundle();
        });
      });
    }

    if (exportTableBtn) {
      exportTableBtn.addEventListener("click", function () {
        runLifecycleAction("export-selected-table", async function () {
          await handleExportSelectedTable();
        });
      });
    }

    if (loadDemoBtn) {
      loadDemoBtn.addEventListener("click", async function () {
        await runLifecycleAction("load-demo", async function () {
          var current = getCurrentBundle();
          var hasCurrentCsvFiles = Array.isArray(current.csvFiles) && current.csvFiles.length > 0;
          if (hasCurrentCsvFiles || hasAnyMappings(current.mappingsObj)) {
            if (!global.confirm("Replace current data with demo data?")) {
              return;
            }
          }
          setLiveStatus("Reloading public demo dataset...", true);
          setLifecycleStatus("Reloading public demo dataset...");
          try {
            var demoBundle = await loadDemoBundle();
            var model = await runBundleComputeAndRender(demoBundle);
            var storageWarning = await tryPersistBundleToStorage(demoBundle);
            var tableCount = toFiniteNumber(model.runtime && model.runtime.tableCount);
            var message =
              "Reloaded demo dataset. Recomputed " +
              toLocale(tableCount, 0, 0) +
              " table(s).";
            if (storageWarning) {
              message += " Storage warning: " + storageWarning;
            }
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Reload demo failed: " + errorMessage);
            setLiveStatus("Reload demo failed: " + errorMessage, false);
          }
        });
      });
      loadDemoBtn.title = "Replace the current workspace with the public demo dataset.";
    }

    if (importMappingsBtn && importMappingsInput) {
      importMappingsBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        importMappingsInput.click();
      });
    }

    if (importMappingsInput) {
      importMappingsInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await handleImportMappingsJsonInputFile(file);
      });
    }

    if (settingsImportMappingsBtn && settingsImportMappingsInput) {
      settingsImportMappingsBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        settingsImportMappingsInput.click();
      });
    }

    if (settingsImportMappingsInput) {
      settingsImportMappingsInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await handleImportMappingsJsonInputFile(file);
      });
    }

    if (downloadTemplateMappingsBtn) {
      downloadTemplateMappingsBtn.addEventListener("click", function () {
        triggerDownloadTemplateMappings();
      });
    }

    if (settingsDownloadTemplateMappingsBtn) {
      settingsDownloadTemplateMappingsBtn.addEventListener("click", function () {
        if (downloadTemplateMappingsBtn && typeof downloadTemplateMappingsBtn.click === "function") {
          downloadTemplateMappingsBtn.click();
          return;
        }
        triggerDownloadTemplateMappings();
      });
    }

    if (downloadMappingsBtn) {
      downloadMappingsBtn.addEventListener("click", function () {
        triggerDownloadCurrentMappings();
      });
    }

    if (settingsDownloadMappingsBtn) {
      settingsDownloadMappingsBtn.addEventListener("click", function () {
        if (downloadMappingsBtn && typeof downloadMappingsBtn.click === "function") {
          downloadMappingsBtn.click();
          return;
        }
        triggerDownloadCurrentMappings();
      });
    }

    if (copyMappingsBtn) {
      copyMappingsBtn.addEventListener("click", async function () {
        await triggerCopyMappings();
      });
    }

    if (settingsCopyMappingsBtn) {
      settingsCopyMappingsBtn.addEventListener("click", async function () {
        if (copyMappingsBtn && typeof copyMappingsBtn.click === "function") {
          copyMappingsBtn.click();
          return;
        }
        await triggerCopyMappings();
      });
    }

    if (clearMappingsBtn) {
      clearMappingsBtn.addEventListener("click", async function () {
        await triggerClearMappings();
      });
    }

    if (settingsClearMappingsBtn) {
      settingsClearMappingsBtn.addEventListener("click", async function () {
        if (clearMappingsBtn && typeof clearMappingsBtn.click === "function") {
          clearMappingsBtn.click();
          return;
        }
        await triggerClearMappings();
      });
    }

    if (ruleEditorType) {
      ruleEditorType.addEventListener("change", function (event) {
        ruleEditorState.sectionKey = normalizeRuleEditorSectionKey(event.target && event.target.value);
        resetRuleEditorDraft();
        syncRuleEditorView();
        setLifecycleStatus("Rule editor now targeting " + ruleEditorSectionLabel(ruleEditorState.sectionKey) + ".");
        setLiveStatus("Rule editor section changed.", false);
      });
    }

    if (ruleEditorSearch) {
      ruleEditorSearch.addEventListener("input", function (event) {
        ruleEditorState.search = String((event.target && event.target.value) || "");
        syncRuleEditorView();
      });
    }

    if (ruleEditorKeyInput) {
      ruleEditorKeyInput.addEventListener("input", function (event) {
        ruleEditorState.draftKey = String((event.target && event.target.value) || "");
        setRuleEditorValidationMessage("");
        syncRuleEditorView();
      });
    }

    if (ruleEditorValueInput) {
      ruleEditorValueInput.addEventListener("input", function (event) {
        ruleEditorState.draftValue = String((event.target && event.target.value) || "");
        setRuleEditorValidationMessage("");
        syncRuleEditorView();
      });
    }

    if (ruleEditorResetBtn) {
      ruleEditorResetBtn.addEventListener("click", function () {
        resetRuleEditorDraft();
        syncRuleEditorView();
        setLifecycleStatus("Rule editor form reset.");
        setLiveStatus("Rule editor form reset.", false);
      });
    }

    if (ruleEditorSaveBtn) {
      ruleEditorSaveBtn.addEventListener("click", async function () {
        await triggerRuleEditorSave();
      });
    }

    if (ruleEditorBody) {
      ruleEditorBody.addEventListener("click", async function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== "function") {
          return;
        }
        var button = target.closest("button[data-rule-action]");
        if (!button) {
          return;
        }

        var action = String(button.dataset.ruleAction || "");
        var ruleKey = String(button.dataset.ruleKey || "");
        if (!ruleKey) {
          return;
        }

        if (action === "edit") {
          loadRuleEditorDraftForKey(ruleKey);
          return;
        }

        if (action === "delete") {
          await triggerRuleEditorDelete(ruleKey);
        }
      });
    }

    if (settingsRuleEditorType) {
      settingsRuleEditorType.addEventListener("change", function (event) {
        var nextValue = normalizeRuleEditorSectionKey(event.target && event.target.value);
        if (ruleEditorType) {
          ruleEditorType.value = nextValue;
          ruleEditorType.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
        ruleEditorState.sectionKey = nextValue;
        resetRuleEditorDraft();
        syncRuleEditorView();
      });
    }

    if (settingsRuleEditorSearch) {
      settingsRuleEditorSearch.addEventListener("input", function (event) {
        var nextValue = String((event.target && event.target.value) || "");
        if (ruleEditorSearch) {
          ruleEditorSearch.value = nextValue;
          ruleEditorSearch.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        ruleEditorState.search = nextValue;
        syncRuleEditorView();
      });
    }

    if (settingsRuleEditorKeyInput) {
      settingsRuleEditorKeyInput.addEventListener("input", function (event) {
        var nextValue = String((event.target && event.target.value) || "");
        if (ruleEditorKeyInput) {
          ruleEditorKeyInput.value = nextValue;
          ruleEditorKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        ruleEditorState.draftKey = nextValue;
        setRuleEditorValidationMessage("");
        syncRuleEditorView();
      });
    }

    if (settingsRuleEditorValueInput) {
      settingsRuleEditorValueInput.addEventListener("input", function (event) {
        var nextValue = String((event.target && event.target.value) || "");
        if (ruleEditorValueInput) {
          ruleEditorValueInput.value = nextValue;
          ruleEditorValueInput.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        ruleEditorState.draftValue = nextValue;
        setRuleEditorValidationMessage("");
        syncRuleEditorView();
      });
    }

    if (settingsRuleEditorResetBtn) {
      settingsRuleEditorResetBtn.addEventListener("click", function () {
        if (ruleEditorResetBtn && typeof ruleEditorResetBtn.click === "function") {
          ruleEditorResetBtn.click();
          return;
        }
        resetRuleEditorDraft();
        syncRuleEditorView();
      });
    }

    if (settingsRuleEditorSaveBtn) {
      settingsRuleEditorSaveBtn.addEventListener("click", async function () {
        if (ruleEditorSaveBtn && typeof ruleEditorSaveBtn.click === "function") {
          ruleEditorSaveBtn.click();
          return;
        }
        await triggerRuleEditorSave();
      });
    }

    if (settingsRuleEditorBody) {
      settingsRuleEditorBody.addEventListener("click", async function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== "function") {
          return;
        }
        var button = target.closest("button[data-rule-action][data-rule-key]");
        if (!button) {
          return;
        }
        var selector =
          'button[data-rule-action="' +
          String(button.dataset.ruleAction || "") +
          '"][data-rule-key="' +
          CSS.escape(String(button.dataset.ruleKey || "")) +
          '"]';
        var legacyButton = ruleEditorBody ? ruleEditorBody.querySelector(selector) : null;
        if (legacyButton && typeof legacyButton.click === "function") {
          legacyButton.click();
          return;
        }
        if (button.dataset.ruleAction === "edit") {
          loadRuleEditorDraftForKey(String(button.dataset.ruleKey || ""));
          return;
        }
        if (button.dataset.ruleAction === "delete") {
          await triggerRuleEditorDelete(String(button.dataset.ruleKey || ""));
        }
      });
    }

    if (importCardOwnerCsvBtn && cardOwnerCsvInput) {
      importCardOwnerCsvBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        cardOwnerCsvInput.click();
      });
    }

    if (cardOwnerCsvInput) {
      cardOwnerCsvInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await runLifecycleAction("import-card-owner-csv", async function () {
          setLiveStatus("Importing card-owner mappings CSV...", true);
          setLifecycleStatus("Importing card-owner mappings from " + file.name + "...");
          try {
            var message = await importMappingsCsvFile(file, "ownersByCardOwner", "card-owner");
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Card-owner CSV load failed (" + file.name + "): " + errorMessage);
            setLiveStatus("Card-owner CSV load failed: " + errorMessage, false);
          }
        });
      });
    }

    if (importCardNumberCsvBtn && cardNumberCsvInput) {
      importCardNumberCsvBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        cardNumberCsvInput.click();
      });
    }

    if (cardNumberCsvInput) {
      cardNumberCsvInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await runLifecycleAction("import-card-number-csv", async function () {
          setLiveStatus("Importing card-number mappings CSV...", true);
          setLifecycleStatus("Importing card-number mappings from " + file.name + "...");
          try {
            var message = await importMappingsCsvFile(file, "ownersByCardNumber", "card-number");
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Card-number CSV load failed (" + file.name + "): " + errorMessage);
            setLiveStatus("Card-number CSV load failed: " + errorMessage, false);
          }
        });
      });
    }

    if (importCategoryCsvBtn && categoryCsvInput) {
      importCategoryCsvBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        categoryCsvInput.click();
      });
    }

    if (categoryCsvInput) {
      categoryCsvInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await runLifecycleAction("import-category-csv", async function () {
          setLiveStatus("Importing category mappings CSV...", true);
          setLifecycleStatus("Importing category mappings from " + file.name + "...");
          try {
            var message = await importMappingsCsvFile(file, "categoryByDetail", "category");
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Category CSV load failed (" + file.name + "): " + errorMessage);
            setLiveStatus("Category CSV load failed: " + errorMessage, false);
          }
        });
      });
    }

    if (importCategorySegmentCsvBtn && categorySegmentCsvInput) {
      importCategorySegmentCsvBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        categorySegmentCsvInput.click();
      });
    }

    if (categorySegmentCsvInput) {
      categorySegmentCsvInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await runLifecycleAction("import-category-segment-csv", async function () {
          setLiveStatus("Importing category-segment mappings CSV...", true);
          setLifecycleStatus("Importing category-segment mappings from " + file.name + "...");
          try {
            var message = await importMappingsCsvFile(file, "categorySegmentByCategory", "category-segment");
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Category-segment CSV load failed (" + file.name + "): " + errorMessage);
            setLiveStatus("Category-segment CSV load failed: " + errorMessage, false);
          }
        });
      });
    }

    if (downloadCardOwnerTemplateCsvBtn) {
      downloadCardOwnerTemplateCsvBtn.addEventListener("click", function () {
        downloadTextFile("card_owner_label;canonical_owner\n", "card_owner_mappings.template.csv", "text/csv;charset=utf-8;");
        setLifecycleStatus("Downloaded card_owner_mappings.template.csv");
        setLiveStatus("Downloaded card-owner template CSV.", false);
      });
    }

    if (downloadCardNumberTemplateCsvBtn) {
      downloadCardNumberTemplateCsvBtn.addEventListener("click", function () {
        downloadTextFile("card_number;canonical_owner\n", "card_number_mappings.template.csv", "text/csv;charset=utf-8;");
        setLifecycleStatus("Downloaded card_number_mappings.template.csv");
        setLiveStatus("Downloaded card-number template CSV.", false);
      });
    }

    if (downloadCategoryTemplateCsvBtn) {
      downloadCategoryTemplateCsvBtn.addEventListener("click", function () {
        downloadTextFile("detail;category\n", "category_mappings.template.csv", "text/csv;charset=utf-8;");
        setLifecycleStatus("Downloaded category_mappings.template.csv");
        setLiveStatus("Downloaded category template CSV.", false);
      });
    }

    if (downloadCategorySegmentTemplateCsvBtn) {
      downloadCategorySegmentTemplateCsvBtn.addEventListener("click", function () {
        downloadTextFile("category;segment\n", "category_segments.template.csv", "text/csv;charset=utf-8;");
        setLifecycleStatus("Downloaded category_segments.template.csv");
        setLiveStatus("Downloaded category-segment template CSV.", false);
      });
    }

    if (downloadCategorySegmentCsvBtn) {
      downloadCategorySegmentCsvBtn.addEventListener("click", async function () {
        await runLifecycleAction("download-category-segment-csv", async function () {
          try {
            var module = await getMappingsCsvModule();
            if (!module || typeof module.serializeCategorySegmentsCsv !== "function") {
              throw new Error("Category-segment CSV serializer is unavailable.");
            }
            var mappingsObj = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
            var csvText = module.serializeCategorySegmentsCsv(mappingsObj.categorySegmentByCategory || {});
            downloadTextFile(csvText, "category_segments.current.csv", "text/csv;charset=utf-8;");
            setLifecycleStatus("Downloaded category_segments.current.csv");
            setLiveStatus("Downloaded current category-segment CSV.", false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Download category-segment CSV failed: " + errorMessage);
            setLiveStatus("Download category-segment CSV failed: " + errorMessage, false);
          }
        });
      });
    }

    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener("click", async function () {
        await triggerDeleteSelectedFiles();
      });
    }

    if (settingsDeleteSelectedBtn) {
      settingsDeleteSelectedBtn.addEventListener("click", async function () {
        if (deleteSelectedBtn && typeof deleteSelectedBtn.click === "function") {
          deleteSelectedBtn.click();
          return;
        }
        await triggerDeleteSelectedFiles();
      });
    }

    if (deleteAllBtn) {
      deleteAllBtn.addEventListener("click", async function () {
        await triggerDeleteAllFiles();
      });
    }

    if (settingsDeleteAllBtn) {
      settingsDeleteAllBtn.addEventListener("click", async function () {
        if (deleteAllBtn && typeof deleteAllBtn.click === "function") {
          deleteAllBtn.click();
          return;
        }
        await triggerDeleteAllFiles();
      });
    }

    if (exportAllCsvsBtn) {
      exportAllCsvsBtn.addEventListener("click", function () {
        triggerExportAllCsvs();
      });
    }

    if (settingsExportAllCsvsBtn) {
      settingsExportAllCsvsBtn.addEventListener("click", function () {
        if (exportAllCsvsBtn && typeof exportAllCsvsBtn.click === "function") {
          exportAllCsvsBtn.click();
          return;
        }
        triggerExportAllCsvs();
      });
    }

    if (importWorkspaceBtn && workspaceFileInput) {
      importWorkspaceBtn.addEventListener("click", function () {
        if (lifecycleBusy) {
          return;
        }
        workspaceFileInput.click();
      });
    }

    if (workspaceFileInput) {
      workspaceFileInput.addEventListener("change", async function (event) {
        var file = event.target && event.target.files ? event.target.files[0] : null;
        if (event.target) {
          event.target.value = "";
        }
        if (!file) {
          return;
        }
        await runLifecycleAction("import-workspace", async function () {
          try {
            var current = getCurrentBundle();
            var hasCurrentCsvFiles = Array.isArray(current.csvFiles) && current.csvFiles.length > 0;
            if (hasCurrentCsvFiles || hasAnyMappings(current.mappingsObj)) {
              if (!global.confirm("Replace current data with workspace?")) {
                return;
              }
            }
            setLiveStatus("Importing workspace...", true);
            setLifecycleStatus("Importing workspace from " + file.name + "...");
            var info = await importWorkspaceArtifactFile(file);
            var message = "Imported workspace: " + toLocale(info.fileCount, 0, 0) + " file(s).";
            if (info.hasCsvFiles) {
              message += " Computed " + toLocale(info.tableCount, 0, 0) + " table(s).";
            }
            if (info.storageWarning) {
              message += " Storage warning: " + info.storageWarning;
            }
            setLifecycleStatus(message);
            setLiveStatus(message, false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Import workspace failed: " + errorMessage);
            setLiveStatus("Import workspace failed: " + errorMessage, false);
          }
        });
      });
    }

    if (exportWorkspaceBtn) {
      exportWorkspaceBtn.addEventListener("click", async function () {
        await runLifecycleAction("export-workspace", async function () {
          setLiveStatus("Exporting workspace artifact...", true);
          try {
            await exportWorkspaceArtifactJson();
            setLifecycleStatus("Exported workspace.json.");
            setLiveStatus("Exported workspace.json.", false);
          } catch (err) {
            var errorMessage = err && err.message ? err.message : String(err);
            setLifecycleStatus("Export workspace failed: " + errorMessage);
            setLiveStatus("Export workspace failed: " + errorMessage, false);
          }
        });
      });
    }
  }

  var OVERVIEW_METRIC_KEYS = [
    "netStatement",
    "cardMovements",
    "newDebt",
    "carryOverDebt",
    "nextMonthDebt",
    "remainingDebt",
    "taxes",
    "pastPayments"
  ];
  var OVERVIEW_METRIC_HELP_TEXT = Object.freeze({
    netStatement: "The total amount billed for this statement month.",
    cardMovements:
      "The part of this month's statement that comes from card spending, including unpaid card movements from previous months and new card movements from this month.",
    newDebt: "New debt added in this statement month from purchases and charges that started this month.",
    carryOverDebt: "Old debt from earlier months that is still due in this month's statement.",
    nextMonthDebt:
      "Installment debt already committed to next month's statement (similar to next month's carryover from installments, though it may not match exactly).",
    remainingDebt:
      "If you stopped adding new debt today, this is the total installment debt still left to pay.",
    taxes: "Taxes, fees, and similar financial charges added to the statement.",
    pastPayments:
      "Payments or credits tied to older statements, shown separately so they do not look like new spending."
  });
  var RAW_BASELINE_COLUMNS = [
    { key: "cardStatementCloseDate", label: "Card Close Date", kind: "date" },
    { key: "cardStatementDueDate", label: "Card Due Date", kind: "date" },
    { key: "bank", label: "Bank", kind: "text" },
    { key: "cardCompany", label: "Card Company", kind: "text" },
    { key: "movementDate", label: "Movement Date", kind: "date" },
    { key: "cardNumber", label: "Card Number", kind: "text" },
    { key: "cardOwner", label: "Card Owner", kind: "text" },
    { key: "movementType", label: "Movement Type", kind: "text" },
    { key: "receiptNumber", label: "Receipt Number", kind: "text" },
    { key: "detail", label: "Detail", kind: "text" },
    { key: "installmentCurrent", label: "Installment Current", kind: "integer" },
    { key: "installmentTotal", label: "Installment Total", kind: "integer" },
    { key: "amountARS", label: "Amount ARS", kind: "money_ars" },
    { key: "amountUSD", label: "Amount USD", kind: "money_usd" }
  ];
  var RAW_COLUMN_COMPACT_KEYS = [
    "cardStatementCloseDate",
    "bank",
    "cardCompany",
    "movementDate",
    "cardOwner",
    "movementType",
    "detail",
    "installmentCurrent",
    "installmentTotal",
    "amountARS",
    "amountUSD"
  ];

  function toFiniteNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function emptyOverviewCurrencyBucket() {
    return {
      netStatement: 0,
      cardMovements: 0,
      newDebt: 0,
      carryOverDebt: 0,
      nextMonthDebt: 0,
      remainingDebt: 0,
      taxes: 0,
      pastPayments: 0
    };
  }

  function copyOverviewCurrencyBucket(source) {
    var out = emptyOverviewCurrencyBucket();
    OVERVIEW_METRIC_KEYS.forEach(function (metricKey) {
      out[metricKey] = toFiniteNumber(source && source[metricKey]);
    });
    return out;
  }

  function emptyOverviewBucket() {
    return {
      currency: {
        ARS: emptyOverviewCurrencyBucket(),
        USD: emptyOverviewCurrencyBucket()
      }
    };
  }

  function copyOverviewBucket(source) {
    return {
      currency: {
        ARS: copyOverviewCurrencyBucket(source && source.currency && source.currency.ARS),
        USD: copyOverviewCurrencyBucket(source && source.currency && source.currency.USD)
      }
    };
  }

  function emptyMetricSeries() {
    return {
      netStatement: [],
      cardMovements: [],
      newDebt: [],
      carryOverDebt: [],
      nextMonthDebt: [],
      remainingDebt: [],
      taxes: [],
      pastPayments: []
    };
  }

  function copyMetricSeries(source) {
    var out = emptyMetricSeries();
    OVERVIEW_METRIC_KEYS.forEach(function (metricKey) {
      var values = source && Array.isArray(source[metricKey]) ? source[metricKey] : [];
      out[metricKey] = values.map(toFiniteNumber);
    });
    return out;
  }

  function emptyOverviewTrend() {
    return {
      months: [],
      ARS: emptyMetricSeries(),
      USD: emptyMetricSeries()
    };
  }

  function copyOverviewTrend(source) {
    if (!source) {
      return emptyOverviewTrend();
    }
    return {
      months: Array.isArray(source.months) ? source.months.slice() : [],
      ARS: copyMetricSeries(source.ARS),
      USD: copyMetricSeries(source.USD)
    };
  }

  function normalizeDriverSeries(series) {
    if (!series || !Array.isArray(series.labels) || !Array.isArray(series.values)) {
      return { labels: ["No data"], values: [0] };
    }
    var size = Math.min(series.labels.length, series.values.length);
    if (size === 0) {
      return { labels: ["No data"], values: [0] };
    }
    var labels = [];
    var values = [];
    for (var i = 0; i < size; i++) {
      labels.push(String(series.labels[i]));
      values.push(toFiniteNumber(series.values[i]));
    }
    return { labels: labels, values: values };
  }

  function toRankedListFromSeries(series, prefix) {
    return series.labels
      .map(function (label, index) {
        return {
          label: prefix + ": " + label,
          value: series.values[index]
        };
      })
      .sort(function (a, b) {
        return Math.abs(b.value) - Math.abs(a.value);
      });
  }

  function buildModelFromRuntime(runtimeSnapshot) {
    var projection = runtimeSnapshot && runtimeSnapshot.overviewProjection;
    if (!projection || !projection.available) {
      throw new Error("Strict runtime projection is unavailable.");
    }

    var months = Array.isArray(projection.months) ? projection.months.slice() : [];
    if (!months.length) {
      throw new Error("No statement months available in strict runtime projection.");
    }

    var topOwnersArs = normalizeDriverSeries(runtimeSnapshot && runtimeSnapshot.topOwners && runtimeSnapshot.topOwners.ARS);
    var topOwnersUsd = normalizeDriverSeries(runtimeSnapshot && runtimeSnapshot.topOwners && runtimeSnapshot.topOwners.USD);
    var topCategoriesArs = normalizeDriverSeries(
      runtimeSnapshot && runtimeSnapshot.topCategories && runtimeSnapshot.topCategories.ARS
    );
    var topCategoriesUsd = normalizeDriverSeries(
      runtimeSnapshot && runtimeSnapshot.topCategories && runtimeSnapshot.topCategories.USD
    );
    var dqDiagnostics = runtimeSnapshot && runtimeSnapshot.dq ? runtimeSnapshot.dq : {};
    var dqIssues = Array.isArray(dqDiagnostics.issues) ? dqDiagnostics.issues.slice() : [];
    var dqWarnings = dqIssues.map(function (issue) {
      return {
        ruleId: issue.ruleId || "",
        message: issue.message || "",
        closeDate: issue.closeDate || "",
        detail: issue.detail || "",
        cardOwner: issue.cardOwner || ""
      };
    });
    var uncategorizedCount = toFiniteNumber(dqDiagnostics.missingCategoryCount);
    var unmappedOwnerCount = toFiniteNumber(dqDiagnostics.missingOwnerCount);
    var totalIssues = toFiniteNumber(dqDiagnostics.totalIssues || dqIssues.length);
    var rawExplorer = runtimeSnapshot && runtimeSnapshot.rawExplorer ? runtimeSnapshot.rawExplorer : {};

    return {
      warnings: dqWarnings,
      uncategorizedCount: uncategorizedCount,
      processedRows: [],
      months: months,
      latestMonth: projection.latestMonth || runtimeSnapshot.latestMonth || months[months.length - 1],
      prevMonth: projection.prevMonth || (months.length > 1 ? months[months.length - 2] : null),
      latest: copyOverviewBucket(projection.latest || emptyOverviewBucket()),
      prev: copyOverviewBucket(projection.prev || emptyOverviewBucket()),
      trend: copyOverviewTrend(projection.trend),
      drivers: {
        ARS: topOwnersArs,
        USD: topOwnersUsd
      },
      topByOwner: {
        ARS: toRankedListFromSeries(topOwnersArs, "Owner"),
        USD: toRankedListFromSeries(topOwnersUsd, "Owner")
      },
      topByBank: {
        ARS: [],
        USD: []
      },
      topByCategory: {
        ARS: toRankedListFromSeries(topCategoriesArs, "Category"),
        USD: toRankedListFromSeries(topCategoriesUsd, "Category")
      },
      dq: {
        totalIssues: totalIssues,
        uncategorizedCount: uncategorizedCount,
        unmappedOwnerCount: unmappedOwnerCount,
        issues: dqIssues
      },
      rawExplorer: rawExplorer,
      runtime: runtimeSnapshot || {},
      runtimeMode: "strict"
    };
  }

  function toRankedList(map, prefix) {
    return Array.from(map.entries())
      .map(function (entry) {
        return { label: prefix + ": " + entry[0], value: entry[1] };
      })
      .sort(function (a, b) {
        return Math.abs(b.value) - Math.abs(a.value);
      });
  }

  function renderVariant(variant, model) {
    lastRenderedModel = model || null;
    if (variant !== "mockup1") {
      throw new Error("Unknown FinanceOverview variant: " + variant);
    }
    renderMockup1(model);
  }

  function renderMockup1(model) {
    renderOverviewSnapshotTables(model);
    renderOverviewQ001Section(model);
    renderOverviewQ003Q004Section(model);
    renderOverviewQ008Section(model);
    renderPaymentSemanticsNote(model);
    renderLatestMonthLabel(document.getElementById("fo-latest-month"), model, true);
    renderOwnersSection(model);
    renderCategoriesSection(model);
    renderDebtSection(model);
    renderDqSection(model);
    renderRawSection(model);
  }

  function getOwnerLookupFromCurrentMappings() {
    try {
      var mappings = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
      return {
        byCardOwner:
          mappings && mappings.ownersByCardOwner && typeof mappings.ownersByCardOwner === "object"
            ? mappings.ownersByCardOwner
            : {},
        byCardNumber:
          mappings && mappings.ownersByCardNumber && typeof mappings.ownersByCardNumber === "object"
            ? mappings.ownersByCardNumber
            : {}
      };
    } catch {
      return {
        byCardOwner: {},
        byCardNumber: {}
      };
    }
  }

  function resolveCanonicalOwnerFromRawRow(row, ownerLookup) {
    var cardNumber = rawText(row && row.cardNumber);
    var cardOwner = rawText(row && row.cardOwner);
    var mappedByCardNumber = rawText(ownerLookup && ownerLookup.byCardNumber && ownerLookup.byCardNumber[cardNumber]);
    if (mappedByCardNumber) {
      return mappedByCardNumber;
    }
    var mappedByCardOwner = rawText(ownerLookup && ownerLookup.byCardOwner && ownerLookup.byCardOwner[cardOwner]);
    if (mappedByCardOwner) {
      return mappedByCardOwner;
    }
    return cardOwner || "Unknown owner";
  }

  function normalizedDetailLookupKey(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function mappedCategoryFromLookup(detail, categoryLookup) {
    var rawDetail = rawText(detail);
    if (!rawDetail) {
      return "";
    }
    var direct = rawText(categoryLookup && categoryLookup[rawDetail]);
    if (direct) {
      return direct;
    }
    var normalized = normalizedDetailLookupKey(rawDetail);
    return rawText(categoryLookup && categoryLookup[normalized]);
  }

  function buildOwnerRankingProjection(rows, latestMonth, currency, ownerLookup) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var grouped = Object.create(null);

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      if (amount === 0) {
        return;
      }
      var owner = resolveCanonicalOwnerFromRawRow(row, ownerLookup);
      if (!grouped[owner]) {
        grouped[owner] = {
          owner: owner,
          movements: 0,
          total: 0
        };
      }
      grouped[owner].movements += 1;
      grouped[owner].total += amount;
    });

    var ranked = Object.keys(grouped)
      .map(function (owner) {
        var entry = grouped[owner];
        entry.movements = toFiniteNumber(entry.movements);
        entry.total = toFiniteNumber(entry.total);
        return entry;
      })
      .sort(function (a, b) {
        var totalDiff = toFiniteNumber(b.total) - toFiniteNumber(a.total);
        if (totalDiff !== 0) {
          return totalDiff;
        }
        var movementDiff = toFiniteNumber(b.movements) - toFiniteNumber(a.movements);
        if (movementDiff !== 0) {
          return movementDiff;
        }
        return String(a.owner || "").localeCompare(String(b.owner || ""));
      })
      .slice(0, OWNER_REBUILT_RANK_LIMIT);

    return {
      currency: useCurrency,
      latestMonth: latestMonth || "",
      rows: ranked
    };
  }

  function renderOwnerRankingTableRebuilt(tbody, projection, currency) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    var ranked = Array.isArray(projection && projection.rows) ? projection.rows : [];
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="4">No owner rows for the latest month.</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.owner || "Unknown owner");
      appendCell(tr, toLocale(toFiniteNumber(row.movements), 0, 0), "num");
      appendNumberCell(
        tr,
        toFiniteNumber(row.total),
        currency,
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.ownerRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function ownerCategoryPairKey(owner, category) {
    return String(owner) + "\u0000" + String(category);
  }

  function buildOwnerCategoryPairProjection(rows, latestMonth, currency, ownerLookup, categoryLookup) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var grouped = Object.create(null);

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      if (amount === 0) {
        return;
      }
      var owner = resolveCanonicalOwnerFromRawRow(row, ownerLookup);
      var category = mappedCategoryFromLookup(row && row.detail, categoryLookup) || "Uncategorized";
      var pairKey = ownerCategoryPairKey(owner, category);
      if (!grouped[pairKey]) {
        grouped[pairKey] = {
          owner: owner,
          category: category,
          movements: 0,
          total: 0
        };
      }
      grouped[pairKey].movements += 1;
      grouped[pairKey].total += amount;
    });

    var ranked = Object.keys(grouped)
      .map(function (key) {
        var entry = grouped[key];
        entry.movements = toFiniteNumber(entry.movements);
        entry.total = toFiniteNumber(entry.total);
        return entry;
      })
      .sort(function (a, b) {
        var totalDiff = toFiniteNumber(b.total) - toFiniteNumber(a.total);
        if (totalDiff !== 0) {
          return totalDiff;
        }
        var movementDiff = toFiniteNumber(b.movements) - toFiniteNumber(a.movements);
        if (movementDiff !== 0) {
          return movementDiff;
        }
        var ownerDiff = String(a.owner || "").localeCompare(String(b.owner || ""));
        if (ownerDiff !== 0) {
          return ownerDiff;
        }
        return String(a.category || "").localeCompare(String(b.category || ""));
      })
      .slice(0, OWNER_CATEGORY_PAIR_LIMIT);

    return {
      currency: useCurrency,
      latestMonth: latestMonth || "",
      rows: ranked
    };
  }

  function renderOwnerCategoryPairTableRebuilt(tbody, projection, currency) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    var ranked = Array.isArray(projection && projection.rows) ? projection.rows : [];
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="5">No owner-category rows for the latest month.</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.owner || "Unknown owner");
      appendCell(tr, row.category || "Uncategorized");
      appendCell(tr, toLocale(toFiniteNumber(row.movements), 0, 0), "num");
      appendNumberCell(
        tr,
        toFiniteNumber(row.total),
        currency,
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.ownerRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function colorForOwnerSeries(index) {
    var palette = OWNER_SERIES_PALETTE;
    if (!Array.isArray(palette) || !palette.length) {
      return "#38bdf8";
    }
    return palette[index % palette.length];
  }

  function buildOwnerEvolutionProjection(rows, currency, ownerLookup) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var monthSet = new Set();
    var totalByOwnerMonth = Object.create(null);

    (rows || []).forEach(function (row) {
      if (row.movementType !== "CardMovement") {
        return;
      }
      var month = rawText(row && row.statementMonth);
      if (!month) {
        return;
      }
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      if (amount === 0) {
        return;
      }
      var owner = resolveCanonicalOwnerFromRawRow(row, ownerLookup);
      monthSet.add(month);
      if (!totalByOwnerMonth[owner]) {
        totalByOwnerMonth[owner] = Object.create(null);
      }
      totalByOwnerMonth[owner][month] = toFiniteNumber(totalByOwnerMonth[owner][month]) + amount;
    });

    var months = Array.from(monthSet).sort();
    var latestMonth = months.length ? months[months.length - 1] : "";
    var owners = Object.keys(totalByOwnerMonth).sort(function (a, b) {
      var latestDiff =
        toFiniteNumber(totalByOwnerMonth[b] && totalByOwnerMonth[b][latestMonth]) -
        toFiniteNumber(totalByOwnerMonth[a] && totalByOwnerMonth[a][latestMonth]);
      if (latestDiff !== 0) {
        return latestDiff;
      }
      var totalDiff =
        months.reduce(function (sum, month) {
          return sum + toFiniteNumber(totalByOwnerMonth[b] && totalByOwnerMonth[b][month]);
        }, 0) -
        months.reduce(function (sum, month) {
          return sum + toFiniteNumber(totalByOwnerMonth[a] && totalByOwnerMonth[a][month]);
        }, 0);
      if (totalDiff !== 0) {
        return totalDiff;
      }
      return String(a || "").localeCompare(String(b || ""));
    });

    var series = owners.map(function (owner, index) {
      return {
        owner: owner,
        color: colorForOwnerSeries(index),
        values: months.map(function (month) {
          return {
            y: toFiniteNumber(totalByOwnerMonth[owner] && totalByOwnerMonth[owner][month]),
            custom: {
              statementMonth: month,
              owner: owner
            }
          };
        })
      };
    });

    return {
      currency: useCurrency,
      months: months,
      latestMonth: latestMonth,
      series: series
    };
  }

  function buildOwnerEvolutionChartConfig(projection) {
    var currency = rawText(projection && projection.currency) || "ARS";
    var months = Array.isArray(projection && projection.months) ? projection.months : [];
    var series = Array.isArray(projection && projection.series) ? projection.series : [];
    return {
      type: "line",
      labels: months,
      datasets: series.map(function (entry) {
        return {
          label: entry.owner || "Unknown owner",
          data: Array.isArray(entry.values) ? entry.values : [],
          borderColor: entry.color,
          backgroundColor: entry.color,
          lineWidth: 2,
          marker: { enabled: true, radius: 3, symbol: "circle" }
        };
      }),
      tooltipLabelFormatter: function (context) {
        var owner = rawText(context && context.dataset && context.dataset.label) || "Owner";
        var value =
          context && context.parsed && typeof context.parsed.y === "number"
            ? context.parsed.y
            : 0;
        var month =
          rawText(context && context.raw && context.raw.custom && context.raw.custom.statementMonth) || "N/A";
        return [
          "<b>" + owner + ":</b> " + formatChartTooltipValue(value),
          "<b>Statement month:</b> " + month,
          "<b>Currency:</b> " + currency
        ];
      }
    };
  }

  function renderOwnersRebuiltSection(model) {
    var trendMetaNode = document.getElementById("fo-owners-new-trend-meta");
    var trendHost = document.getElementById("fo-owners-new-trend-host");
    var metaNode = document.getElementById("fo-owners-new-meta");
    var arsBody = document.getElementById("fo-owners-new-ars-body");
    var usdBody = document.getElementById("fo-owners-new-usd-body");
    var pairsMetaNode = document.getElementById("fo-owners-new-pairs-meta");
    var pairsArsBody = document.getElementById("fo-owners-new-pairs-ars-body");
    var pairsUsdBody = document.getElementById("fo-owners-new-pairs-usd-body");

    if (!trendMetaNode && !trendHost && !metaNode && !arsBody && !usdBody && !pairsMetaNode && !pairsArsBody && !pairsUsdBody) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var ownerLookup = getOwnerLookupFromCurrentMappings();
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var trendArsProjection = buildOwnerEvolutionProjection(rows, "ARS", ownerLookup);
    var trendUsdProjection = buildOwnerEvolutionProjection(rows, "USD", ownerLookup);
    var arsProjection = buildOwnerRankingProjection(rows, latestMonth, "ARS", ownerLookup);
    var usdProjection = buildOwnerRankingProjection(rows, latestMonth, "USD", ownerLookup);
    var pairsArsProjection = buildOwnerCategoryPairProjection(rows, latestMonth, "ARS", ownerLookup, categoryLookup);
    var pairsUsdProjection = buildOwnerCategoryPairProjection(rows, latestMonth, "USD", ownerLookup, categoryLookup);

    if (trendHost) {
      renderDualHighchartsHost(trendHost, {
        ARS: buildOwnerEvolutionChartConfig(trendArsProjection),
        USD: buildOwnerEvolutionChartConfig(trendUsdProjection)
      });
    }
    renderOwnerRankingTableRebuilt(arsBody, arsProjection, "ARS");
    renderOwnerRankingTableRebuilt(usdBody, usdProjection, "USD");
    renderOwnerCategoryPairTableRebuilt(pairsArsBody, pairsArsProjection, "ARS");
    renderOwnerCategoryPairTableRebuilt(pairsUsdBody, pairsUsdProjection, "USD");

    if (trendMetaNode) {
      setOverviewMetaDescription(trendMetaNode, latestMonth, []);
    }
    if (metaNode) {
      setOverviewMetaDescription(metaNode, latestMonth, []);
    }
    if (pairsMetaNode) {
      setOverviewMetaDescription(pairsMetaNode, latestMonth, []);
    }
  }

  function renderOwnersSection(model) {
    renderOwnersRebuiltSection(model);
  }

  function renderOwnerRankTable(tbody, rows, currency) {
    if (!tbody) {
      return;
    }

    var ranked = Array.isArray(rows) ? rows.slice(0, 10) : [];
    tbody.innerHTML = "";

    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="3">No data</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, stripRankLabel(row.label));
      appendNumberCell(
        tr,
        toFiniteNumber(row.value),
        currency,
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.ownerRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function stripRankLabel(label) {
    var text = String(label || "").trim();
    var marker = text.indexOf(":");
    if (marker === -1) {
      return text || "Unknown";
    }
    return text.slice(marker + 1).trim() || "Unknown";
  }

  function describeRankedOwner(entry, currency) {
    if (!entry) {
      return "No data";
    }
    return stripRankLabel(entry.label) + " (" + currency + " " + formatCompact(toFiniteNumber(entry.value)) + ")";
  }

  function countPositiveOwnerCardinality(series) {
    var values = Array.isArray(series && series.values) ? series.values : [];
    return values.reduce(function (count, value) {
      return count + (toFiniteNumber(value) > 0 ? 1 : 0);
    }, 0);
  }

  function buildOwnerCardinalityInsight(ownersArs, ownersUsd) {
    var countArs = countPositiveOwnerCardinality(ownersArs);
    var countUsd = countPositiveOwnerCardinality(ownersUsd);
    var maxCount = Math.max(countArs, countUsd);
    var base =
      "Latest month owner cardinality: ARS " +
      toLocale(countArs, 0, 0) +
      " | USD " +
      toLocale(countUsd, 0, 0) +
      ".";

    if (maxCount <= 1) {
      return {
        tone: "warning",
        message:
          base +
          " Single-owner month: concentration reaches 100% at Top1 by construction; compare with previous months before treating this as concentration risk."
      };
    }
    if (maxCount === 2) {
      return {
        tone: "warning",
        message:
          base +
          " Two-owner month: concentration reaches near 100% by Top2; review month-over-month trajectory to separate structural concentration from temporary spikes."
      };
    }
    return {
      tone: "neutral",
      message:
        base +
        " Multi-owner month: use Top3 share and concentration slope to assess concentration risk."
    };
  }

  function getCategoryLookupFromCurrentMappings() {
    try {
      var mappings = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
      if (!mappings || !mappings.categoryByDetail || typeof mappings.categoryByDetail !== "object") {
        return {};
      }
      return mappings.categoryByDetail;
    } catch {
      return {};
    }
  }

  function getCategorySegmentLookupFromCurrentMappings() {
    try {
      var mappings = ensureMappingsShape(getCurrentBundle() && getCurrentBundle().mappingsObj);
      if (!mappings || !mappings.categorySegmentByCategory || typeof mappings.categorySegmentByCategory !== "object") {
        return {};
      }
      var lookup = Object.create(null);
      Object.keys(mappings.categorySegmentByCategory).forEach(function (category) {
        var categoryKey = normalizedCategoryKey(category);
        var segmentKey = normalizedCategoryKey(mappings.categorySegmentByCategory[category]);
        if (!categoryKey) {
          return;
        }
        if (segmentKey !== "essential" && segmentKey !== "discretionary") {
          return;
        }
        lookup[categoryKey] = segmentKey;
      });
      return lookup;
    } catch {
      return {};
    }
  }

  function ownerCategoryMatrixCellKey(owner, category) {
    return String(owner) + "\u0000" + String(category);
  }

  function buildOwnerCategoryMatrixProjection(rows, categoryLookup, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var sumsByCell = Object.create(null);
    var totalByOwner = Object.create(null);
    var totalByCategory = Object.create(null);

    (rows || []).forEach(function (row) {
      var owner = rawText(row && row.cardOwner) || "Unknown owner";
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var category = mappedCategory || "Uncategorized";
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      var cellKey = ownerCategoryMatrixCellKey(owner, category);
      sumsByCell[cellKey] = toFiniteNumber(sumsByCell[cellKey]) + amount;
      totalByOwner[owner] = toFiniteNumber(totalByOwner[owner]) + amount;
      totalByCategory[category] = toFiniteNumber(totalByCategory[category]) + amount;
    });

    var owners = Object.keys(totalByOwner)
      .sort(function (a, b) {
        var diff = Math.abs(toFiniteNumber(totalByOwner[b])) - Math.abs(toFiniteNumber(totalByOwner[a]));
        if (diff !== 0) {
          return diff;
        }
        return a.localeCompare(b);
      })
      .slice(0, OWNER_CATEGORY_MATRIX_LIMITS.maxOwners);

    var categories = Object.keys(totalByCategory)
      .sort(function (a, b) {
        var diff = Math.abs(toFiniteNumber(totalByCategory[b])) - Math.abs(toFiniteNumber(totalByCategory[a]));
        if (diff !== 0) {
          return diff;
        }
        return a.localeCompare(b);
      })
      .slice(0, OWNER_CATEGORY_MATRIX_LIMITS.maxCategories);

    return {
      currency: useCurrency,
      owners: owners,
      categories: categories,
      sumsByCell: sumsByCell,
      totalByOwner: totalByOwner
    };
  }

  function renderOwnerCategoryMatrixTable(head, body, matrix) {
    if (!head || !body) {
      return;
    }

    var owners = Array.isArray(matrix && matrix.owners) ? matrix.owners : [];
    var categories = Array.isArray(matrix && matrix.categories) ? matrix.categories : [];
    var currency = String((matrix && matrix.currency) || "ARS");

    head.innerHTML = "";
    var headRow = document.createElement("tr");
    var ownerTh = document.createElement("th");
    ownerTh.textContent = "Owner";
    headRow.appendChild(ownerTh);
    categories.forEach(function (category) {
      var th = document.createElement("th");
      th.textContent = category;
      headRow.appendChild(th);
    });
    var totalTh = document.createElement("th");
    totalTh.textContent = "Total " + currency;
    headRow.appendChild(totalTh);
    head.appendChild(headRow);

    body.innerHTML = "";
    if (!owners.length || !categories.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = categories.length + 2;
      td.textContent = "No owner-category rows for current latest month.";
      empty.appendChild(td);
      body.appendChild(empty);
      return;
    }

    owners.forEach(function (owner) {
      var tr = document.createElement("tr");
      appendCell(tr, owner);
      categories.forEach(function (category) {
        var td = document.createElement("td");
        var amount = toFiniteNumber(matrix.sumsByCell[ownerCategoryMatrixCellKey(owner, category)]);
        td.classList.add("num");
        if (amount === 0) {
          td.textContent = "—";
          td.title = currency + " " + formatFull(amount);
        } else {
          td.textContent = formatFull(amount);
          td.title = currency + " " + formatFull(amount);
        }
        tr.appendChild(td);
      });
      var totalTd = document.createElement("td");
      totalTd.classList.add("num");
      var total = toFiniteNumber(matrix.totalByOwner[owner]);
      totalTd.textContent = formatFull(total);
      totalTd.title = currency + " " + formatFull(total);
      tr.appendChild(totalTd);
      body.appendChild(tr);
    });
  }

  function renderOwnerCategoryMatrixSection(model) {
    var arsHead = document.getElementById("fo-owner-category-matrix-ars-head");
    var arsBody = document.getElementById("fo-owner-category-matrix-ars-body");
    var usdHead = document.getElementById("fo-owner-category-matrix-usd-head");
    var usdBody = document.getElementById("fo-owner-category-matrix-usd-body");
    var metaNode = document.getElementById("fo-owner-category-matrix-meta");

    if (!arsHead && !arsBody && !usdHead && !usdBody && !metaNode) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var filtered = rows.filter(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return false;
      }
      return row.movementType === "CardMovement";
    });

    var arsMatrix = buildOwnerCategoryMatrixProjection(filtered, categoryLookup, "ARS");
    var usdMatrix = buildOwnerCategoryMatrixProjection(filtered, categoryLookup, "USD");
    renderOwnerCategoryMatrixTable(arsHead, arsBody, arsMatrix);
    renderOwnerCategoryMatrixTable(usdHead, usdBody, usdMatrix);

    if (metaNode) {
      var ownerCount = arsMatrix.owners.length;
      var categoryCount = arsMatrix.categories.length;
      var mappedCount = filtered.filter(function (row) {
        return Boolean(rawText(categoryLookup[row.detail]));
      }).length;
      var uncategorizedCount = filtered.length - mappedCount;
      metaNode.textContent =
        "Latest month: " +
        (latestMonth || "N/A") +
        " | CardMovement rows: " +
        toLocale(filtered.length, 0, 0) +
        " | Owners: " +
        toLocale(ownerCount, 0, 0) +
        " | Categories: " +
        toLocale(categoryCount, 0, 0) +
        " | Uncategorized rows: " +
        toLocale(uncategorizedCount, 0, 0) +
        " | Source: strict raw explorer + category mappings.";
    }
  }

  function computeTopNSharePercent(values, topN) {
    var source = Array.isArray(values) ? values.map(function (value) { return Math.abs(toFiniteNumber(value)); }) : [];
    var total = source.reduce(function (sum, value) { return sum + value; }, 0);
    if (total <= 0) {
      return 0;
    }
    var limit = Math.max(1, Math.trunc(toFiniteNumber(topN) || 1));
    var head = source.slice(0, limit).reduce(function (sum, value) { return sum + value; }, 0);
    return (head / total) * 100;
  }

  function buildCumulativeShareCurve(series) {
    var labels = Array.isArray(series && series.labels) ? series.labels.slice() : [];
    var values = Array.isArray(series && series.values)
      ? series.values.map(function (value) { return Math.abs(toFiniteNumber(value)); })
      : [];
    var size = Math.min(labels.length, values.length);
    if (!size) {
      return { labels: ["Top 1"], values: [0] };
    }
    var total = values.slice(0, size).reduce(function (sum, value) { return sum + value; }, 0);
    if (total <= 0) {
      return {
        labels: labels.slice(0, size).map(function (_, index) { return "Top " + String(index + 1); }),
        values: new Array(size).fill(0)
      };
    }
    var running = 0;
    var outValues = [];
    for (var i = 0; i < size; i++) {
      running += values[i];
      outValues.push((running / total) * 100);
    }
    return {
      labels: labels.slice(0, size).map(function (_, index) { return "Top " + String(index + 1); }),
      values: outValues
    };
  }

  function percentileFromValues(values, percentile) {
    var p = Number(percentile);
    if (!Number.isFinite(p)) {
      p = 0.5;
    }
    if (p <= 0) {
      p = 0;
    } else if (p >= 1) {
      p = 1;
    }
    var source = (Array.isArray(values) ? values : [])
      .map(toFiniteNumber)
      .filter(function (value) {
        return value > 0;
      })
      .sort(function (a, b) {
        return a - b;
      });
    if (!source.length) {
      return 0;
    }
    if (source.length === 1 || p === 0) {
      return source[0];
    }
    var position = (source.length - 1) * p;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) {
      return source[lower];
    }
    var weight = position - lower;
    return source[lower] * (1 - weight) + source[upper] * weight;
  }

  function buildMerchantAggregateProjection(rows, latestMonth) {
    var grouped = Object.create(null);
    var totalCardMovementRows = 0;
    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var amountARS = Math.max(0, toFiniteNumber(row.amountARS));
      var amountUSD = Math.max(0, toFiniteNumber(row.amountUSD));
      if (amountARS <= 0 && amountUSD <= 0) {
        return;
      }
      totalCardMovementRows += 1;
      var detail = rawText(row.detail) || "(empty detail)";
      if (!grouped[detail]) {
        grouped[detail] = {
          detail: detail,
          rows: 0,
          amountARS: 0,
          amountUSD: 0,
          avgARS: 0,
          avgUSD: 0
        };
      }
      grouped[detail].rows += 1;
      grouped[detail].amountARS += amountARS;
      grouped[detail].amountUSD += amountUSD;
    });
    var allEntries = Object.keys(grouped).map(function (detail) {
      var entry = grouped[detail];
      var rowsCount = Math.max(1, toFiniteNumber(entry.rows));
      entry.avgARS = toFiniteNumber(entry.amountARS) / rowsCount;
      entry.avgUSD = toFiniteNumber(entry.amountUSD) / rowsCount;
      return entry;
    });
    allEntries.sort(function (a, b) {
      var arsDiff = toFiniteNumber(b.amountARS) - toFiniteNumber(a.amountARS);
      if (arsDiff !== 0) {
        return arsDiff;
      }
      var usdDiff = toFiniteNumber(b.amountUSD) - toFiniteNumber(a.amountUSD);
      if (usdDiff !== 0) {
        return usdDiff;
      }
      var rowsDiff = toFiniteNumber(b.rows) - toFiniteNumber(a.rows);
      if (rowsDiff !== 0) {
        return rowsDiff;
      }
      return String(a.detail || "").localeCompare(String(b.detail || ""));
    });
    return {
      latestMonth: latestMonth || "",
      totalCardMovementRows: totalCardMovementRows,
      rows: allEntries,
      topRows: allEntries.slice(0, TOP_MERCHANTS_LIMIT)
    };
  }

  function renderMerchantTopTable(tbody, rows) {
    if (!tbody) {
      return;
    }
    var ranked = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"5\">No merchant rows found for latest month.</td>";
      tbody.appendChild(empty);
      return;
    }
    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.detail || "(empty detail)");
      appendNumberCell(tr, toFiniteNumber(row.amountARS), "ARS", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(tr, toFiniteNumber(row.amountUSD), "USD", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendCell(tr, toLocale(toFiniteNumber(row.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
  }

  function buildMovementTypeDeltaProjection(rows, latestMonth, prevMonth) {
    var byType = Object.create(null);
    function ensure(typeKey) {
      var key = typeKey || "Unknown";
      if (!byType[key]) {
        byType[key] = {
          movementType: key,
          prevARS: 0,
          latestARS: 0,
          deltaARS: 0,
          prevUSD: 0,
          latestUSD: 0,
          deltaUSD: 0,
          unexpected: false
        };
      }
      return byType[key];
    }

    (rows || []).forEach(function (row) {
      var movementType = rawText(row.movementType) || "Unknown";
      var entry = ensure(movementType);
      if (latestMonth && row.statementMonth === latestMonth) {
        entry.latestARS += toFiniteNumber(row.amountARS);
        entry.latestUSD += toFiniteNumber(row.amountUSD);
      } else if (prevMonth && row.statementMonth === prevMonth) {
        entry.prevARS += toFiniteNumber(row.amountARS);
        entry.prevUSD += toFiniteNumber(row.amountUSD);
      }
    });

    var entries = Object.keys(byType).map(function (movementType) {
      var entry = byType[movementType];
      entry.deltaARS = toFiniteNumber(entry.latestARS) - toFiniteNumber(entry.prevARS);
      entry.deltaUSD = toFiniteNumber(entry.latestUSD) - toFiniteNumber(entry.prevUSD);
      var pctARS = entry.prevARS === 0 ? null : entry.deltaARS / Math.abs(entry.prevARS);
      var pctUSD = entry.prevUSD === 0 ? null : entry.deltaUSD / Math.abs(entry.prevUSD);
      var unexpectedByPctArs =
        pctARS != null &&
        Math.abs(pctARS) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_PCT &&
        Math.abs(entry.deltaARS) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_ARS;
      var unexpectedByPctUsd =
        pctUSD != null &&
        Math.abs(pctUSD) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_PCT &&
        Math.abs(entry.deltaUSD) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_USD;
      var unexpectedByNewArs =
        entry.prevARS === 0 &&
        Math.abs(entry.latestARS) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_ARS;
      var unexpectedByNewUsd =
        entry.prevUSD === 0 &&
        Math.abs(entry.latestUSD) >= MOVEMENT_TYPE_UNEXPECTED_DELTA_USD;
      entry.unexpected =
        unexpectedByPctArs || unexpectedByPctUsd || unexpectedByNewArs || unexpectedByNewUsd;
      return entry;
    });

    entries.sort(function (a, b) {
      if (a.unexpected !== b.unexpected) {
        return a.unexpected ? -1 : 1;
      }
      var arsDiff = Math.abs(toFiniteNumber(b.deltaARS)) - Math.abs(toFiniteNumber(a.deltaARS));
      if (arsDiff !== 0) {
        return arsDiff;
      }
      var usdDiff = Math.abs(toFiniteNumber(b.deltaUSD)) - Math.abs(toFiniteNumber(a.deltaUSD));
      if (usdDiff !== 0) {
        return usdDiff;
      }
      return String(a.movementType || "").localeCompare(String(b.movementType || ""));
    });

    return {
      latestMonth: latestMonth || "",
      prevMonth: prevMonth || "",
      rows: entries,
      unexpectedRows: entries.filter(function (entry) {
        return Boolean(entry.unexpected);
      }).length
    };
  }

  function renderMovementTypeDeltaTable(tbody, projection) {
    if (!tbody) {
      return;
    }
    var rows = projection && Array.isArray(projection.rows) ? projection.rows : [];
    tbody.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"8\">No movement-type rows available.</td>";
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (entry) {
      var tr = document.createElement("tr");
      appendCell(tr, entry.movementType || "Unknown");
      appendNumberCell(tr, toFiniteNumber(entry.prevARS), "ARS", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(tr, toFiniteNumber(entry.latestARS), "ARS", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(
        tr,
        toFiniteNumber(entry.deltaARS),
        "ARS",
        true,
        true,
        entry.unexpected ? "fo-cell-neg" : "",
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(tr, toFiniteNumber(entry.prevUSD), "USD", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(tr, toFiniteNumber(entry.latestUSD), "USD", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(
        tr,
        toFiniteNumber(entry.deltaUSD),
        "USD",
        true,
        true,
        entry.unexpected ? "fo-cell-neg" : "",
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendCell(tr, entry.unexpected ? "Yes" : "No", entry.unexpected ? "fo-cell-neg" : "");
      tbody.appendChild(tr);
    });
  }

  function buildRecurringSmallChargesProjection(merchantProjection) {
    var rows = merchantProjection && Array.isArray(merchantProjection.rows) ? merchantProjection.rows : [];
    var avgArsValues = rows
      .map(function (entry) {
        return Math.abs(toFiniteNumber(entry.avgARS));
      })
      .filter(function (value) {
        return value > 0;
      });
    var avgUsdValues = rows
      .map(function (entry) {
        return Math.abs(toFiniteNumber(entry.avgUSD));
      })
      .filter(function (value) {
        return value > 0;
      });
    var thresholdARS = percentileFromValues(avgArsValues, MERCHANT_SMALL_CHARGE_PERCENTILE);
    var thresholdUSD = percentileFromValues(avgUsdValues, MERCHANT_SMALL_CHARGE_PERCENTILE);
    var repeating = rows
      .filter(function (entry) {
        var rowsCount = toFiniteNumber(entry.rows);
        if (rowsCount < 3) {
          return false;
        }
        var avgARS = Math.abs(toFiniteNumber(entry.avgARS));
        var avgUSD = Math.abs(toFiniteNumber(entry.avgUSD));
        var qualifiesARS = thresholdARS > 0 && avgARS > 0 && avgARS <= thresholdARS;
        var qualifiesUSD = thresholdUSD > 0 && avgUSD > 0 && avgUSD <= thresholdUSD;
        return qualifiesARS || qualifiesUSD;
      })
      .sort(function (a, b) {
        var rowsDiff = toFiniteNumber(b.rows) - toFiniteNumber(a.rows);
        if (rowsDiff !== 0) {
          return rowsDiff;
        }
        var arsDiff = toFiniteNumber(b.amountARS) - toFiniteNumber(a.amountARS);
        if (arsDiff !== 0) {
          return arsDiff;
        }
        return String(a.detail || "").localeCompare(String(b.detail || ""));
      })
      .slice(0, RECURRING_SMALL_CHARGES_LIMIT);
    return {
      rows: repeating,
      thresholdARS: thresholdARS,
      thresholdUSD: thresholdUSD
    };
  }

  function renderRecurringSmallChargesTable(tbody, rows) {
    if (!tbody) {
      return;
    }
    var ranked = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"5\">No repeating small charges for current heuristic.</td>";
      tbody.appendChild(empty);
      return;
    }
    ranked.forEach(function (entry, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, entry.detail || "(empty detail)");
      appendCell(tr, toLocale(toFiniteNumber(entry.rows), 0, 0), "num");
      appendNumberCell(tr, toFiniteNumber(entry.amountARS), "ARS", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(tr, toFiniteNumber(entry.avgARS), "ARS", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      tbody.appendChild(tr);
    });
  }

  function buildOneOffSpikeProjection(merchantProjection) {
    var rows = merchantProjection && Array.isArray(merchantProjection.rows) ? merchantProjection.rows : [];
    var oneOffs = rows.filter(function (entry) {
      return toFiniteNumber(entry.rows) === 1;
    });
    var arsValues = oneOffs
      .map(function (entry) {
        return Math.abs(toFiniteNumber(entry.amountARS));
      })
      .filter(function (value) {
        return value > 0;
      });
    var usdValues = oneOffs
      .map(function (entry) {
        return Math.abs(toFiniteNumber(entry.amountUSD));
      })
      .filter(function (value) {
        return value > 0;
      });
    var thresholdARS = percentileFromValues(arsValues, MERCHANT_SPIKE_PERCENTILE);
    var thresholdUSD = percentileFromValues(usdValues, MERCHANT_SPIKE_PERCENTILE);
    var spikes = oneOffs
      .filter(function (entry) {
        var amountARS = Math.abs(toFiniteNumber(entry.amountARS));
        var amountUSD = Math.abs(toFiniteNumber(entry.amountUSD));
        var byArs = thresholdARS > 0 && amountARS >= thresholdARS;
        var byUsd = thresholdUSD > 0 && amountUSD >= thresholdUSD;
        return byArs || byUsd;
      })
      .sort(function (a, b) {
        var arsDiff = Math.abs(toFiniteNumber(b.amountARS)) - Math.abs(toFiniteNumber(a.amountARS));
        if (arsDiff !== 0) {
          return arsDiff;
        }
        var usdDiff = Math.abs(toFiniteNumber(b.amountUSD)) - Math.abs(toFiniteNumber(a.amountUSD));
        if (usdDiff !== 0) {
          return usdDiff;
        }
        return String(a.detail || "").localeCompare(String(b.detail || ""));
      })
      .slice(0, ONE_OFF_SPIKES_LIMIT);
    return {
      rows: spikes,
      thresholdARS: thresholdARS,
      thresholdUSD: thresholdUSD
    };
  }

  function renderOneOffSpikesTable(tbody, rows) {
    if (!tbody) {
      return;
    }
    var ranked = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"5\">No one-off spikes for current heuristic.</td>";
      tbody.appendChild(empty);
      return;
    }
    ranked.forEach(function (entry, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, entry.detail || "(empty detail)");
      appendNumberCell(tr, toFiniteNumber(entry.amountARS), "ARS", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendNumberCell(tr, toFiniteNumber(entry.amountUSD), "USD", false, true, undefined, VIEW_NUMBER_FORMAT_POLICY.categoryRankTable);
      appendCell(tr, toLocale(toFiniteNumber(entry.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
  }

  function renderMerchantInsightsSection(model) {
    var topBody = document.getElementById("fo-merchants-top-body");
    var topMetaNode = document.getElementById("fo-merchants-top-meta");
    var movementTypeBody = document.getElementById("fo-movement-type-delta-body");
    var movementTypeMetaNode = document.getElementById("fo-movement-type-delta-meta");
    var recurringBody = document.getElementById("fo-merchants-recurring-body");
    var recurringMetaNode = document.getElementById("fo-merchants-recurring-meta");
    var spikesBody = document.getElementById("fo-merchants-spikes-body");
    var spikesMetaNode = document.getElementById("fo-merchants-spikes-meta");
    if (
      !topBody &&
      !topMetaNode &&
      !movementTypeBody &&
      !movementTypeMetaNode &&
      !recurringBody &&
      !recurringMetaNode &&
      !spikesBody &&
      !spikesMetaNode
    ) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var prevMonth = rawText(model && model.prevMonth);
    var merchantProjection = buildMerchantAggregateProjection(rows, latestMonth);
    var movementTypeProjection = buildMovementTypeDeltaProjection(rows, latestMonth, prevMonth);
    var recurringProjection = buildRecurringSmallChargesProjection(merchantProjection);
    var spikesProjection = buildOneOffSpikeProjection(merchantProjection);

    renderMerchantTopTable(topBody, merchantProjection.topRows);
    renderMovementTypeDeltaTable(movementTypeBody, movementTypeProjection);
    renderRecurringSmallChargesTable(recurringBody, recurringProjection.rows);
    renderOneOffSpikesTable(spikesBody, spikesProjection.rows);

    if (topMetaNode) {
      topMetaNode.textContent =
        "Latest month: " +
        (latestMonth || "N/A") +
        " | CardMovement rows considered: " +
        toLocale(merchantProjection.totalCardMovementRows, 0, 0) +
        " | Showing top " +
        toLocale((merchantProjection.topRows || []).length, 0, 0) +
        " merchants by ARS." +
        " | Source: strict raw explorer.";
    }
    if (movementTypeMetaNode) {
      movementTypeMetaNode.textContent =
        "Latest vs prev: " +
        (latestMonth || "N/A") +
        " vs " +
        (prevMonth || "N/A") +
        " | Unexpected threshold: |Δ%| >= " +
        toLocale(MOVEMENT_TYPE_UNEXPECTED_DELTA_PCT * 100, 0, 0) +
        "% with |ΔARS| >= " +
        toLocale(MOVEMENT_TYPE_UNEXPECTED_DELTA_ARS, 0, 0) +
        " or |ΔUSD| >= " +
        toLocale(MOVEMENT_TYPE_UNEXPECTED_DELTA_USD, 0, 0) +
        "." +
        " | Unexpected rows: " +
        toLocale(movementTypeProjection.unexpectedRows, 0, 0) +
        ".";
    }
    if (recurringMetaNode) {
      recurringMetaNode.textContent =
        "Heuristic: rows >= 3 and avg amount <= percentile " +
        toLocale(MERCHANT_SMALL_CHARGE_PERCENTILE * 100, 0, 0) +
        "." +
        " | Threshold ARS: " +
        formatCompact(recurringProjection.thresholdARS) +
        " | Threshold USD: " +
        formatCompact(recurringProjection.thresholdUSD) +
        " | Rows: " +
        toLocale((recurringProjection.rows || []).length, 0, 0) +
        ".";
    }
    if (spikesMetaNode) {
      spikesMetaNode.textContent =
        "Heuristic: one-off rows above percentile " +
        toLocale(MERCHANT_SPIKE_PERCENTILE * 100, 0, 0) +
        "." +
        " | Threshold ARS: " +
        formatCompact(spikesProjection.thresholdARS) +
        " | Threshold USD: " +
        formatCompact(spikesProjection.thresholdUSD) +
        " | Rows: " +
        toLocale((spikesProjection.rows || []).length, 0, 0) +
        ".";
    }
  }

  function renderCategoriesSection(model) {
    renderCategoriesRebuiltSection(model);
  }

  function renderCategoriesRebuiltSection(model) {
    var metaNode = document.getElementById("fo-categories-new-meta");
    var arsBody = document.getElementById("fo-categories-new-ars-body");
    var usdBody = document.getElementById("fo-categories-new-usd-body");
    var momArsBody = document.getElementById("fo-categories-new-mom-ars-body");
    var momUsdBody = document.getElementById("fo-categories-new-mom-usd-body");
    var momMetaNode = document.getElementById("fo-categories-new-mom-meta");

    if (
      !metaNode &&
      !arsBody &&
      !usdBody &&
      !momArsBody &&
      !momUsdBody &&
      !momMetaNode
    ) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var prevMonth = rawText(model && model.prevMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var arsRankProjection = buildCategoryDebtRankingProjection(rows, categoryLookup, latestMonth, "ARS");
    var usdRankProjection = buildCategoryDebtRankingProjection(rows, categoryLookup, latestMonth, "USD");

    renderCategoryDebtRankingTable(arsBody, arsRankProjection, "ARS");
    renderCategoryDebtRankingTable(usdBody, usdRankProjection, "USD");

    if (metaNode) {
      metaNode.textContent = "Latest month: " + (latestMonth || "N/A");
    }

    var arsProjection = buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, "ARS");
    var usdProjection = buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, "USD");
    renderCategoryMoMDeltaTable(momArsBody, arsProjection, "ARS");
    renderCategoryMoMDeltaTable(momUsdBody, usdProjection, "USD");
    if (momMetaNode) {
      setOverviewMetaDescription(momMetaNode, latestMonth, [
        "Compared with: " + (prevMonth || "N/A"),
        "These tables show the biggest category increases and decreases between the latest and previous month."
      ]);
    }
  }

  function validInstallmentFromRawRow(row) {
    var currentInstallment = optionalInteger(row && row.installmentCurrent);
    var totalInstallments = optionalInteger(row && row.installmentTotal);
    if (
      currentInstallment == null ||
      totalInstallments == null ||
      currentInstallment <= 0 ||
      totalInstallments <= 0 ||
      totalInstallments < currentInstallment
    ) {
      return { hasInstallment: false, currentInstallment: null, totalInstallments: null };
    }
    return {
      hasInstallment: true,
      currentInstallment: currentInstallment,
      totalInstallments: totalInstallments
    };
  }

  function buildCategoryDebtRankingProjection(rows, categoryLookup, latestMonth, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var grouped = Object.create(null);

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      if (amount === 0) {
        return;
      }
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var category = mappedCategory || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = {
          category: category,
          movements: 0,
          carryOverDebt: 0,
          newDebt: 0,
          total: 0
        };
      }
      var target = grouped[category];
      target.movements += 1;
      target.total += amount;

      var installment = validInstallmentFromRawRow(row);
      if (installment.hasInstallment && installment.currentInstallment > 1) {
        target.carryOverDebt += amount;
      } else {
        target.newDebt += amount;
      }
    });

    var ranked = Object.keys(grouped)
      .map(function (category) {
        var entry = grouped[category];
        entry.total = toFiniteNumber(entry.total);
        entry.newDebt = toFiniteNumber(entry.newDebt);
        entry.carryOverDebt = toFiniteNumber(entry.carryOverDebt);
        entry.movements = toFiniteNumber(entry.movements);
        return entry;
      })
      .sort(function (a, b) {
        var totalDiff = toFiniteNumber(b.total) - toFiniteNumber(a.total);
        if (totalDiff !== 0) {
          return totalDiff;
        }
        var movementDiff = toFiniteNumber(b.movements) - toFiniteNumber(a.movements);
        if (movementDiff !== 0) {
          return movementDiff;
        }
        return String(a.category || "").localeCompare(String(b.category || ""));
      })
      .slice(0, 12);

    return {
      currency: useCurrency,
      latestMonth: latestMonth || "",
      rows: ranked
    };
  }

  function renderCategoryDebtRankingTable(tbody, projection, currency) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    var ranked = Array.isArray(projection && projection.rows) ? projection.rows : [];
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="6">No category debt rows for the latest month.</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.category || "Uncategorized");
      appendCell(tr, toLocale(toFiniteNumber(row.movements), 0, 0), "num");
      appendNumberCell(
        tr,
        toFiniteNumber(row.carryOverDebt),
        currency,
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.newDebt),
        currency,
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.total),
        currency,
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function renderCategoryRankTable(tbody, rows, currency) {
    if (!tbody) {
      return;
    }

    var ranked = Array.isArray(rows) ? rows.slice(0, 10) : [];
    tbody.innerHTML = "";

    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="3">No data</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, stripRankLabel(row.label));
      appendNumberCell(
        tr,
        toFiniteNumber(row.value),
        currency,
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function normalizedCategoryKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function categorySegmentFromMappedCategory(category, categorySegmentLookup) {
    var key = normalizedCategoryKey(category);
    if (!key || key === "?" || key === "uncategorized" || key === "adjustments") {
      return "unclassified";
    }
    return categorySegmentLookup && categorySegmentLookup[key] ? categorySegmentLookup[key] : "unclassified";
  }

  function emptyCategorySegment(label) {
    return {
      label: label,
      amountARS: 0,
      amountUSD: 0,
      rows: 0
    };
  }

  function buildCategoryEssentialDiscretionaryProjection(rows, categoryLookup, latestMonth, categorySegmentLookup) {
    var segments = {
      essential: emptyCategorySegment("Essential"),
      discretionary: emptyCategorySegment("Discretionary"),
      unclassified: emptyCategorySegment("Unclassified")
    };
    var totalARS = 0;
    var totalUSD = 0;
    var totalRows = 0;

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var segmentKey = categorySegmentFromMappedCategory(mappedCategory, categorySegmentLookup);
      var amountARS = toFiniteNumber(row && row.amountARS);
      var amountUSD = toFiniteNumber(row && row.amountUSD);
      var spendARS = amountARS > 0 ? amountARS : 0;
      var spendUSD = amountUSD > 0 ? amountUSD : 0;
      if (spendARS <= 0 && spendUSD <= 0) {
        return;
      }
      var segment = segments[segmentKey] || segments.unclassified;
      segment.amountARS += spendARS;
      segment.amountUSD += spendUSD;
      segment.rows += 1;
      totalARS += spendARS;
      totalUSD += spendUSD;
      totalRows += 1;
    });

    return {
      latestMonth: latestMonth || "",
      totalARS: totalARS,
      totalUSD: totalUSD,
      totalRows: totalRows,
      rows: [segments.essential, segments.discretionary, segments.unclassified].map(function (segment) {
        return {
          label: segment.label,
          amountARS: toFiniteNumber(segment.amountARS),
          amountUSD: toFiniteNumber(segment.amountUSD),
          shareARS: totalARS > 0 ? segment.amountARS / totalARS : null,
          shareUSD: totalUSD > 0 ? segment.amountUSD / totalUSD : null,
          rows: toFiniteNumber(segment.rows)
        };
      })
    };
  }

  function renderCategoryEssentialDiscretionaryTable(tbody, projection) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    var rows = Array.isArray(projection && projection.rows) ? projection.rows : [];
    if (!rows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"6\">No category split data available.</td>";
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.label);
      appendNumberCell(
        tr,
        toFiniteNumber(row.amountARS),
        "ARS",
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendPercentCell(tr, row.shareARS, true, "", NA_REASON.SHARE_ZERO_TOTAL);
      appendNumberCell(
        tr,
        toFiniteNumber(row.amountUSD),
        "USD",
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendPercentCell(tr, row.shareUSD, true, "", NA_REASON.SHARE_ZERO_TOTAL);
      appendCell(tr, toLocale(toFiniteNumber(row.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
  }

  function renderCategoryEssentialDiscretionarySection(model, tbody, metaNode) {
    if (!tbody && !metaNode) {
      return;
    }
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var categorySegmentLookup = getCategorySegmentLookupFromCurrentMappings();
    var projection = buildCategoryEssentialDiscretionaryProjection(
      rows,
      categoryLookup,
      latestMonth,
      categorySegmentLookup
    );
    renderCategoryEssentialDiscretionaryTable(tbody, projection);

    if (!metaNode) {
      return;
    }
    metaNode.textContent =
      "Latest month: " +
      (projection.latestMonth || "N/A") +
      " | CardMovement rows considered: " +
      toLocale(projection.totalRows, 0, 0) +
      " | Scope: positive spend only." +
      " | Segments: Essential / Discretionary / Unclassified." +
      " | N/A share means total positive amount for a currency is 0 in this scope." +
      " | Source: strict raw explorer + category mappings.";
  }

  function buildCategoryTotalsForMonth(rows, categoryLookup, targetMonth, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var totals = Object.create(null);
    var cardMovementRows = 0;

    (rows || []).forEach(function (row) {
      if (targetMonth && row.statementMonth !== targetMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      cardMovementRows += 1;
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var category = mappedCategory || "Uncategorized";
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      totals[category] = toFiniteNumber(totals[category]) + amount;
    });

    return {
      totals: totals,
      cardMovementRows: cardMovementRows
    };
  }

  function compareCategoryIncreaseRows(a, b) {
    var deltaDiff = toFiniteNumber(b.delta) - toFiniteNumber(a.delta);
    if (deltaDiff !== 0) {
      return deltaDiff;
    }
    var latestDiff = Math.abs(toFiniteNumber(b.latest)) - Math.abs(toFiniteNumber(a.latest));
    if (latestDiff !== 0) {
      return latestDiff;
    }
    return String(a.category || "").localeCompare(String(b.category || ""));
  }

  function compareCategoryDecreaseRows(a, b) {
    var deltaDiff = toFiniteNumber(a.delta) - toFiniteNumber(b.delta);
    if (deltaDiff !== 0) {
      return deltaDiff;
    }
    var latestDiff = Math.abs(toFiniteNumber(b.latest)) - Math.abs(toFiniteNumber(a.latest));
    if (latestDiff !== 0) {
      return latestDiff;
    }
    return String(a.category || "").localeCompare(String(b.category || ""));
  }

  function buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    if (!latestMonth || !prevMonth) {
      return {
        available: false,
        currency: useCurrency,
        latestMonth: latestMonth || "",
        prevMonth: prevMonth || "",
        latestRows: 0,
        prevRows: 0,
        rows: [],
        increases: 0,
        decreases: 0,
        message: "Need both latest and previous statement month to compute category MoM deltas."
      };
    }

    var latestTotals = buildCategoryTotalsForMonth(rows, categoryLookup, latestMonth, useCurrency);
    var prevTotals = buildCategoryTotalsForMonth(rows, categoryLookup, prevMonth, useCurrency);
    var categories = new Set(
      Object.keys(latestTotals.totals || {}).concat(Object.keys(prevTotals.totals || {}))
    );
    var deltas = [];
    categories.forEach(function (category) {
      var latest = toFiniteNumber(latestTotals.totals[category]);
      var prev = toFiniteNumber(prevTotals.totals[category]);
      var delta = latest - prev;
      if (delta === 0) {
        return;
      }
      deltas.push({
        category: category,
        prev: prev,
        latest: latest,
        delta: delta
      });
    });

    var increases = deltas
      .filter(function (row) { return row.delta > 0; })
      .sort(compareCategoryIncreaseRows)
      .slice(0, CATEGORY_MOM_DELTA_LIMIT);
    var decreases = deltas
      .filter(function (row) { return row.delta < 0; })
      .sort(compareCategoryDecreaseRows)
      .slice(0, CATEGORY_MOM_DELTA_LIMIT);

    var ranked = [];
    increases.forEach(function (row) {
      ranked.push({
        direction: "Increase",
        directionClass: "fo-cell-neg",
        category: row.category,
        prev: row.prev,
        latest: row.latest,
        delta: row.delta
      });
    });
    decreases.forEach(function (row) {
      ranked.push({
        direction: "Decrease",
        directionClass: "fo-cell-pos",
        category: row.category,
        prev: row.prev,
        latest: row.latest,
        delta: row.delta
      });
    });

    return {
      available: true,
      currency: useCurrency,
      latestMonth: latestMonth,
      prevMonth: prevMonth,
      latestRows: latestTotals.cardMovementRows,
      prevRows: prevTotals.cardMovementRows,
      rows: ranked,
      increaseRows: increases,
      decreaseRows: decreases,
      increases: increases.length,
      decreases: decreases.length,
      message: ""
    };
  }

  function renderCategoryMoMDeltaTable(tbody, projection, currency) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    if (!projection || !projection.available) {
      var unavailable = document.createElement("tr");
      unavailable.innerHTML =
        '<td colspan="6">' +
        String((projection && projection.message) || "No category MoM deltas available.") +
        "</td>";
      tbody.appendChild(unavailable);
      return;
    }
    var ranked = Array.isArray(projection.rows) ? projection.rows : [];
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"6\">No category deltas between latest and previous month.</td>";
      tbody.appendChild(empty);
      return;
    }
    ranked.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.direction, row.directionClass);
      appendCell(tr, row.category || "Uncategorized");
      appendNumberCell(
        tr,
        toFiniteNumber(row.prev),
        currency,
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.latest),
        currency,
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.delta),
        currency,
        true,
        true,
        row.directionClass,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      tbody.appendChild(tr);
    });
  }

  function renderCategoryMoMDeltaSection(model, arsBody, usdBody, metaNode) {
    if (!arsBody && !usdBody && !metaNode) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var prevMonth = rawText(model && model.prevMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var arsProjection = buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, "ARS");
    var usdProjection = buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, "USD");

    renderCategoryMoMDeltaTable(arsBody, arsProjection, "ARS");
    renderCategoryMoMDeltaTable(usdBody, usdProjection, "USD");

    if (!metaNode) {
      return;
    }
    if (!arsProjection.available || !usdProjection.available) {
      metaNode.textContent = (arsProjection && arsProjection.message) || "Category MoM deltas unavailable.";
      return;
    }
    metaNode.textContent =
      "Latest vs prev: " +
      (latestMonth || "N/A") +
      " vs " +
      (prevMonth || "N/A") +
      " | ARS increases: " +
      toLocale(arsProjection.increases, 0, 0) +
      " | ARS decreases: " +
      toLocale(arsProjection.decreases, 0, 0) +
      " | USD increases: " +
      toLocale(usdProjection.increases, 0, 0) +
      " | USD decreases: " +
      toLocale(usdProjection.decreases, 0, 0) +
      " | CardMovement rows latest/prev: " +
      toLocale(arsProjection.latestRows, 0, 0) +
      "/" +
      toLocale(arsProjection.prevRows, 0, 0) +
      " | Source: strict raw explorer + category mappings.";
  }

  function describeRankedCategory(entry, currency) {
    if (!entry) {
      return "No data";
    }
    return stripRankLabel(entry.label) + " (" + currency + " " + formatCompact(toFiniteNumber(entry.value)) + ")";
  }

  function normalizeUncategorizedSortKey(value) {
    var key = String(value || "").trim();
    if (
      key === "rows-desc" ||
      key === "amount-ars-desc" ||
      key === "amount-usd-desc" ||
      key === "detail-asc"
    ) {
      return key;
    }
    return UNCATEGORIZED_SORT_DEFAULT;
  }

  function uncategorizedSortLabel(sortKey) {
    var normalized = normalizeUncategorizedSortKey(sortKey);
    if (normalized === "amount-ars-desc") {
      return "Amount ARS (abs desc)";
    }
    if (normalized === "amount-usd-desc") {
      return "Amount USD (abs desc)";
    }
    if (normalized === "detail-asc") {
      return "Detail (A-Z)";
    }
    return "Rows (desc)";
  }

  function sortCategoryUncategorizedRows(rows, sortKey) {
    var normalizedSort = normalizeUncategorizedSortKey(sortKey);
    return (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
      if (normalizedSort === "amount-ars-desc") {
        var arsDiff = Math.abs(toFiniteNumber(b.amountARS)) - Math.abs(toFiniteNumber(a.amountARS));
        if (arsDiff !== 0) {
          return arsDiff;
        }
      } else if (normalizedSort === "amount-usd-desc") {
        var usdDiff = Math.abs(toFiniteNumber(b.amountUSD)) - Math.abs(toFiniteNumber(a.amountUSD));
        if (usdDiff !== 0) {
          return usdDiff;
        }
      } else if (normalizedSort === "detail-asc") {
        var detailDiff = String(a.detail || "").localeCompare(String(b.detail || ""));
        if (detailDiff !== 0) {
          return detailDiff;
        }
      }
      var rowDiff = toFiniteNumber(b.rows) - toFiniteNumber(a.rows);
      if (rowDiff !== 0) {
        return rowDiff;
      }
      var amountA = Math.abs(toFiniteNumber(a.amountARS)) + Math.abs(toFiniteNumber(a.amountUSD));
      var amountB = Math.abs(toFiniteNumber(b.amountARS)) + Math.abs(toFiniteNumber(b.amountUSD));
      var amountDiff = amountB - amountA;
      if (amountDiff !== 0) {
        return amountDiff;
      }
      return String(a.detail || "").localeCompare(String(b.detail || ""));
    });
  }

  function buildCategoryUncategorizedBacklog(rows, categoryLookup, latestMonth, sortKey) {
    var grouped = Object.create(null);
    var totalCardMovementRows = 0;
    var totalUncategorizedRows = 0;

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      totalCardMovementRows += 1;
      var detailKey = rawText(row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detailKey]);
      if (mappedCategory) {
        return;
      }
      totalUncategorizedRows += 1;
      var detail = detailKey || "(empty detail)";
      if (!grouped[detail]) {
        grouped[detail] = {
          detail: detail,
          rows: 0,
          amountARS: 0,
          amountUSD: 0
        };
      }
      grouped[detail].rows += 1;
      grouped[detail].amountARS += toFiniteNumber(row.amountARS);
      grouped[detail].amountUSD += toFiniteNumber(row.amountUSD);
    });

    var details = Object.keys(grouped).map(function (key) {
      return grouped[key];
    });
    var activeSortKey = normalizeUncategorizedSortKey(sortKey);
    var sortedDetails = sortCategoryUncategorizedRows(details, activeSortKey);

    return {
      latestMonth: latestMonth || "",
      totalCardMovementRows: totalCardMovementRows,
      totalUncategorizedRows: totalUncategorizedRows,
      distinctDetails: sortedDetails.length,
      sortKey: activeSortKey,
      rows: sortedDetails.slice(0, UNCATEGORIZED_DETAILS_BACKLOG_LIMIT)
    };
  }

  function renderCategoryUncategorizedBacklogTable(tbody, rows) {
    if (!tbody) {
      return;
    }

    var ranked = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="6">No uncategorized details for current latest month.</td>';
      tbody.appendChild(empty);
      return;
    }

    ranked.forEach(function (entry, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, entry.detail);
      appendCell(tr, toLocale(toFiniteNumber(entry.rows), 0, 0));
      appendNumberCell(
        tr,
        toFiniteNumber(entry.amountARS),
        "ARS",
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(entry.amountUSD),
        "USD",
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.categoryRankTable
      );
      var actionTd = document.createElement("td");
      var detail = String(entry.detail || "").trim();
      if (!detail || detail === "(empty detail)") {
        actionTd.textContent = "N/A";
        actionTd.title = "Cannot create rule for empty detail.";
      } else {
        var mapBtn = document.createElement("button");
        mapBtn.type = "button";
        mapBtn.className = "btn";
        mapBtn.textContent = "Map";
        mapBtn.dataset.uncategorizedAction = "map-category-rule";
        mapBtn.dataset.detail = detail;
        actionTd.appendChild(mapBtn);
      }
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  function bindCategoryUncategorizedBacklogActions(tbody) {
    if (!tbody || tbody.dataset.foUncategorizedActionsBound === "1") {
      return;
    }
    tbody.dataset.foUncategorizedActionsBound = "1";
    tbody.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }
      var button = target.closest("button[data-uncategorized-action]");
      if (!button) {
        return;
      }
      var action = String(button.dataset.uncategorizedAction || "");
      if (action !== "map-category-rule") {
        return;
      }
      var detail = String(button.dataset.detail || "");
      openRuleEditorForCategoryDetail(detail);
    });
  }

  function bindCategoryUncategorizedBacklogSortControl(select, tbody, metaNode) {
    if (!select || select.dataset.foUncategorizedSortBound === "1") {
      return;
    }
    select.dataset.foUncategorizedSortBound = "1";
    select.addEventListener("change", function (event) {
      uncategorizedBacklogState.sortKey = normalizeUncategorizedSortKey(
        event && event.target ? event.target.value : ""
      );
      if (!lastRenderedModel) {
        return;
      }
      renderCategoryUncategorizedBacklogSection(lastRenderedModel, tbody, metaNode, select);
    });
  }

  function renderCategoryUncategorizedBacklogSection(model, tbody, metaNode, sortSelect) {
    if (!tbody && !metaNode && !sortSelect) {
      return;
    }
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var selectNode = sortSelect || document.getElementById("fo-categories-uncategorized-sort");
    var activeSortKey = normalizeUncategorizedSortKey(
      (selectNode && selectNode.value) || uncategorizedBacklogState.sortKey
    );
    uncategorizedBacklogState.sortKey = activeSortKey;
    if (selectNode && selectNode.value !== activeSortKey) {
      selectNode.value = activeSortKey;
    }
    bindCategoryUncategorizedBacklogSortControl(selectNode, tbody, metaNode);
    var backlog = buildCategoryUncategorizedBacklog(rows, categoryLookup, latestMonth, activeSortKey);

    bindCategoryUncategorizedBacklogActions(tbody);
    renderCategoryUncategorizedBacklogTable(tbody, backlog.rows);

    if (metaNode) {
      metaNode.textContent =
        "Latest month: " +
        (latestMonth || "N/A") +
        " | CardMovement rows: " +
        toLocale(backlog.totalCardMovementRows, 0, 0) +
        " | Uncategorized rows: " +
        toLocale(backlog.totalUncategorizedRows, 0, 0) +
        " | Distinct uncategorized details: " +
        toLocale(backlog.distinctDetails, 0, 0) +
        " | Showing top " +
        toLocale(backlog.rows.length, 0, 0) +
        " details." +
        " | Sort: " +
        uncategorizedSortLabel(backlog.sortKey) +
        "." +
        " | Source: strict raw explorer + category mappings.";
    }
  }

  function buildOverviewTrendKpiStripItems(model) {
    var ars = model && model.latest && model.latest.currency ? model.latest.currency.ARS || {} : {};
    var usd = model && model.latest && model.latest.currency ? model.latest.currency.USD || {} : {};
    return [
      {
        label: "Latest Net ARS",
        value: toFiniteNumber(ars.netStatement),
        currency: "ARS",
        deltaText: "",
        deltaClass: ""
      },
      {
        label: "Latest Net USD",
        value: toFiniteNumber(usd.netStatement),
        currency: "USD",
        deltaText: "",
        deltaClass: ""
      },
      {
        label: "Latest Spend ARS",
        value: toFiniteNumber(ars.cardMovements),
        currency: "ARS",
        deltaText: "",
        deltaClass: ""
      },
      {
        label: "Latest Spend USD",
        value: toFiniteNumber(usd.cardMovements),
        currency: "USD",
        deltaText: "",
        deltaClass: ""
      }
    ];
  }

  function buildDebtTrendConfig(model) {
    return {
      ARS: {
        type: "line",
        labels: model.trend.months,
        datasets: [
          {
            label: "New debt ARS",
            data: model.trend.ARS.newDebt,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.18)"
          },
          {
            label: "Carry debt ARS",
            data: model.trend.ARS.carryOverDebt,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245,158,11,0.18)"
          },
          {
            label: "Next month debt ARS",
            data: model.trend.ARS.nextMonthDebt,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,0.18)"
          },
          {
            label: "Remaining debt ARS",
            data: model.trend.ARS.remainingDebt,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.18)"
          }
        ]
      },
      USD: {
        type: "line",
        labels: model.trend.months,
        datasets: [
          {
            label: "New debt USD",
            data: model.trend.USD.newDebt,
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,0.18)"
          },
          {
            label: "Carry debt USD",
            data: model.trend.USD.carryOverDebt,
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167,139,250,0.18)"
          },
          {
            label: "Next month debt USD",
            data: model.trend.USD.nextMonthDebt,
            borderColor: "#f472b6",
            backgroundColor: "rgba(244,114,182,0.18)"
          },
          {
            label: "Remaining debt USD",
            data: model.trend.USD.remainingDebt,
            borderColor: "#fb7185",
            backgroundColor: "rgba(251,113,133,0.18)"
          }
        ]
      }
    };
  }

  function buildDeltaSeries(values) {
    var source = Array.isArray(values) ? values.map(toFiniteNumber) : [];
    if (!source.length) {
      return [];
    }
    return source.map(function (value, index) {
      if (index === 0) {
        return 0;
      }
      return value - source[index - 1];
    });
  }

  function buildCumulativeAmountSeries(values) {
    var source = Array.isArray(values) ? values.map(toFiniteNumber) : [];
    var running = 0;
    return source.map(function (value) {
      running += value;
      return running;
    });
  }

  function buildDebtDeltaTrendConfig(model) {
    return {
      ARS: {
        type: "line",
        labels: model.trend.months,
        datasets: [
          {
            label: "New debt Δ ARS",
            data: buildDeltaSeries(model.trend.ARS.newDebt),
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.18)"
          },
          {
            label: "Carry debt Δ ARS",
            data: buildDeltaSeries(model.trend.ARS.carryOverDebt),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245,158,11,0.18)"
          },
          {
            label: "Next month debt Δ ARS",
            data: buildDeltaSeries(model.trend.ARS.nextMonthDebt),
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,0.18)"
          },
          {
            label: "Remaining debt Δ ARS",
            data: buildDeltaSeries(model.trend.ARS.remainingDebt),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.18)"
          }
        ]
      },
      USD: {
        type: "line",
        labels: model.trend.months,
        datasets: [
          {
            label: "New debt Δ USD",
            data: buildDeltaSeries(model.trend.USD.newDebt),
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,0.18)"
          },
          {
            label: "Carry debt Δ USD",
            data: buildDeltaSeries(model.trend.USD.carryOverDebt),
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167,139,250,0.18)"
          },
          {
            label: "Next month debt Δ USD",
            data: buildDeltaSeries(model.trend.USD.nextMonthDebt),
            borderColor: "#f472b6",
            backgroundColor: "rgba(244,114,182,0.18)"
          },
          {
            label: "Remaining debt Δ USD",
            data: buildDeltaSeries(model.trend.USD.remainingDebt),
            borderColor: "#fb7185",
            backgroundColor: "rgba(251,113,133,0.18)"
          }
        ]
      }
    };
  }

  function buildDeltaSeriesNullable(values) {
    var source = Array.isArray(values) ? values.map(toFiniteNumber) : [];
    if (!source.length) {
      return [];
    }
    return source.map(function (value, index) {
      if (index === 0) {
        return null;
      }
      return value - source[index - 1];
    });
  }

  function buildDeltaPercentSeries(values) {
    var source = Array.isArray(values) ? values.map(toFiniteNumber) : [];
    if (!source.length) {
      return [];
    }
    return source.map(function (value, index) {
      if (index === 0) {
        return null;
      }
      var prev = source[index - 1];
      if (!prev) {
        return null;
      }
      return ((value - prev) / Math.abs(prev)) * 100;
    });
  }

  function buildSignedBarColors(values) {
    var source = Array.isArray(values) ? values : [];
    return source.map(function (value) {
      if (value == null || !Number.isFinite(value)) {
        return "rgba(148,163,184,0.18)";
      }
      if (value > 0) {
        return "rgba(239,68,68,0.45)";
      }
      if (value < 0) {
        return "rgba(34,197,94,0.45)";
      }
      return "rgba(148,163,184,0.28)";
    });
  }

  function buildSignedBarBorders(values) {
    var source = Array.isArray(values) ? values : [];
    return source.map(function (value) {
      if (value == null || !Number.isFinite(value)) {
        return "rgba(148,163,184,0.3)";
      }
      if (value > 0) {
        return "#ef4444";
      }
      if (value < 0) {
        return "#22c55e";
      }
      return "#94a3b8";
    });
  }

  function buildDebtTotalDeltaProjection(model, currency) {
    var closeDateByMonth = buildStatementMonthCloseDateMap(model);
    var months =
      model && model.trend && Array.isArray(model.trend.months)
        ? model.trend.months
            .map(function (month) {
              return rawText(month);
            })
            .filter(Boolean)
        : [];
    var remainingDebtSeries =
      model && model.trend && model.trend[currency] && Array.isArray(model.trend[currency].remainingDebt)
        ? model.trend[currency].remainingDebt.map(toFiniteNumber)
        : [];
    var size = Math.min(months.length, remainingDebtSeries.length);
    months = months.slice(0, size);
    remainingDebtSeries = remainingDebtSeries.slice(0, size);
    return {
      months: months,
      closeDates: months.map(function (month) {
        return rawText(closeDateByMonth[month]);
      }),
      absolute: buildDeltaSeriesNullable(remainingDebtSeries),
      percent: buildDeltaPercentSeries(remainingDebtSeries)
    };
  }

  function buildDebtTotalDeltaPointData(values, months, closeDates, formatterKind, customBuilder) {
    var normalizedValues = Array.isArray(values) ? values : [];
    var buildCustom = typeof customBuilder === "function" ? customBuilder : null;
    return normalizedValues.map(function (value, index) {
      return {
        y: value,
        custom: Object.assign(
          {
            statementMonth: rawText(months && months[index]),
            closeDateLabel: rawText(closeDates && closeDates[index]),
            formatterKind: formatterKind || "amount"
          },
          buildCustom ? buildCustom(value, index) : {}
        )
      };
    });
  }

  function buildDebtTotalDeltaPercentBarDataset(percentValues, absoluteValues, label, currency, months, closeDates) {
    var normalizedPercentValues = Array.isArray(percentValues) ? percentValues : [];
    var normalizedAbsoluteValues = Array.isArray(absoluteValues) ? absoluteValues : [];
    return {
      label: label,
      data: buildDebtTotalDeltaPointData(
        normalizedPercentValues,
        months,
        closeDates,
        "percent",
        function (_value, index) {
          return {
            absoluteDelta: normalizedAbsoluteValues[index],
            absoluteLabel: "Δ " + currency
          };
        }
      ),
      backgroundColor: buildSignedBarColors(normalizedPercentValues),
      borderColor: buildSignedBarBorders(normalizedPercentValues),
      borderWidth: 1
    };
  }

  function buildDebtTotalDeltaMergedCurrencyConfig(projection, currency) {
    return {
      type: "bar",
      labels: projection.months,
      yAxes: [
        {
          title: currency + " percentage change",
          beginAtZero: true,
          formatter: function (value) {
            return formatPercent(value);
          }
        }
      ],
      datasets: [
        buildDebtTotalDeltaPercentBarDataset(
          projection.percent,
          projection.absolute,
          "Δ total remaining debt " + currency + " %",
          currency,
          projection.months,
          projection.closeDates
        )
      ],
      tooltipLabelFormatter: function (context) {
        return formatDebtDeltaTooltipLabel(context, "percent");
      }
    };
  }

  function buildDebtTotalDeltaMergedConfig(model) {
    var ars = buildDebtTotalDeltaProjection(model, "ARS");
    var usd = buildDebtTotalDeltaProjection(model, "USD");
    return {
      ARS: buildDebtTotalDeltaMergedCurrencyConfig(ars, "ARS"),
      USD: buildDebtTotalDeltaMergedCurrencyConfig(usd, "USD")
    };
  }

  function formatDebtDeltaTooltipLabel(context, formatterKind) {
    var rawPoint = context && context.raw ? context.raw : {};
    var custom = rawPoint && rawPoint.custom ? rawPoint.custom : {};
    var effectiveFormatter = formatterKind || rawText(custom && custom.formatterKind).toLowerCase() || "amount";
    var value = context && context.parsed && typeof context.parsed.y === "number" ? context.parsed.y : null;
    var primaryLabel = effectiveFormatter === "percent" ? "Δ %" : rawText(context && context.dataset && context.dataset.label) || "Value";
    var formatTooltipLine = function (label, renderedValue) {
      return "<b>" + label + ":</b> " + renderedValue;
    };
    if (value == null || !Number.isFinite(value)) {
      return formatTooltipLine(primaryLabel, "N/A");
    }
    var lines = [formatTooltipLine(primaryLabel, effectiveFormatter === "percent" ? formatPercent(value) : formatChartTooltipValue(value))];
    if (custom.closeDateLabel) {
      lines.push(formatTooltipLine("Close date", custom.closeDateLabel));
    }
    if (Number.isFinite(custom.absoluteDelta)) {
      lines.push(formatTooltipLine(rawText(custom.absoluteLabel) || "Δ", formatChartTooltipValue(custom.absoluteDelta)));
    }
    return lines;
  }

  function normalizeDebtMaturityProjection(projection) {
    var available = Boolean(projection && projection.available);
    var months = Array.isArray(projection && projection.months) ? projection.months.slice() : [];
    var ars = Array.isArray(projection && projection.ARS) ? projection.ARS.map(toFiniteNumber) : [];
    var usd = Array.isArray(projection && projection.USD) ? projection.USD.map(toFiniteNumber) : [];
    var counts = Array.isArray(projection && projection.installmentCount) ? projection.installmentCount : [];
    var size = Math.min(months.length, ars.length, usd.length);

    months = months.slice(0, size).map(function (month) {
      return String(month || "").trim();
    });
    ars = ars.slice(0, size);
    usd = usd.slice(0, size);

    var installmentCount = [];
    for (var i = 0; i < size; i++) {
      var count = i < counts.length ? toFiniteNumber(counts[i]) : 0;
      installmentCount.push(Math.max(0, Math.trunc(count)));
    }

    return {
      available: available,
      baseStatementMonth: String((projection && projection.baseStatementMonth) || "").trim(),
      months: months,
      ARS: ars,
      USD: usd,
      installmentCount: installmentCount,
      totalARS: toFiniteNumber(projection && projection.totalARS),
      totalUSD: toFiniteNumber(projection && projection.totalUSD),
      horizonMonths: size
    };
  }

  function buildDebtMaturityConfig(model) {
    var maturity = normalizeDebtMaturityProjection(model && model.runtime && model.runtime.debtMaturity);
    var labels = maturity.months.length ? maturity.months : ["No future installments"];
    var arsValues = maturity.months.length ? maturity.ARS : [0];
    var usdValues = maturity.months.length ? maturity.USD : [0];

    return {
      maturity: maturity,
      charts: {
        ARS: {
          type: "bar",
          labels: labels,
          datasets: [
            {
              label: "Installment maturity ARS",
              data: arsValues,
              backgroundColor: "rgba(56,189,248,0.45)",
              borderColor: "#0ea5e9",
              borderWidth: 1
            }
          ]
        },
        USD: {
          type: "bar",
          labels: labels,
          datasets: [
            {
              label: "Installment maturity USD",
              data: usdValues,
              backgroundColor: "rgba(96,165,250,0.45)",
              borderColor: "#60a5fa",
              borderWidth: 1
            }
          ]
        }
      }
    };
  }

  function buildDebtMaturityCumulativeConfig(maturity) {
    var normalized = normalizeDebtMaturityProjection(maturity);
    var labels = normalized.months.length ? normalized.months : ["No future installments"];
    var arsValues = normalized.months.length ? buildCumulativeAmountSeries(normalized.ARS) : [0];
    var usdValues = normalized.months.length ? buildCumulativeAmountSeries(normalized.USD) : [0];

    return {
      ARS: {
        type: "line",
        labels: labels,
        datasets: [
          {
            label: "Installment maturity cumulative ARS",
            data: arsValues,
            borderColor: "#0ea5e9",
            backgroundColor: "rgba(14,165,233,0.18)"
          }
        ]
      },
      USD: {
        type: "line",
        labels: labels,
        datasets: [
          {
            label: "Installment maturity cumulative USD",
            data: usdValues,
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,0.18)"
          }
        ]
      }
    };
  }

  function renderPaymentSemanticsNote(model) {
    var node = document.getElementById("fo-payment-semantics-note");
    if (!node) {
      return;
    }
    var latestArs = model && model.latest && model.latest.currency ? model.latest.currency.ARS || {} : {};
    var latestUsd = model && model.latest && model.latest.currency ? model.latest.currency.USD || {} : {};
    var expectedArs =
      toFiniteNumber(latestArs.cardMovements) +
      toFiniteNumber(latestArs.taxes) +
      toFiniteNumber(latestArs.pastPayments);
    var expectedUsd =
      toFiniteNumber(latestUsd.cardMovements) +
      toFiniteNumber(latestUsd.taxes) +
      toFiniteNumber(latestUsd.pastPayments);
    var diffArs = toFiniteNumber(latestArs.netStatement) - expectedArs;
    var diffUsd = toFiniteNumber(latestUsd.netStatement) - expectedUsd;
    node.textContent =
      "Latest-month strict check: Net statement = Card movements + Taxes + Past payments" +
      " | ARS reconciliation diff: " +
      formatFull(diffArs) +
      " | USD reconciliation diff: " +
      formatFull(diffUsd) +
      " | N/A in Δ% columns means previous month value is 0.";
    node.title =
      "ARS net " +
      formatFull(toFiniteNumber(latestArs.netStatement)) +
      " vs components " +
      formatFull(expectedArs) +
      " | USD net " +
      formatFull(toFiniteNumber(latestUsd.netStatement)) +
      " vs components " +
      formatFull(expectedUsd) +
      ".";
  }

  function renderOverviewSnapshotTables(model) {
    var labels = {
      nextMonth: "Next month installments",
      remaining: "Total remaining installments",
      past: "Net past payments"
    };
    var newTable = document.getElementById("fo-overview-new-table");
    var oldTable = document.getElementById("fo-overview-table");
    if (newTable) {
      renderCombinedKpiTable(newTable, model, labels, {
        metricHelpByKey: OVERVIEW_METRIC_HELP_TEXT
      });
      attachMetricHelpHandlers("overview");
    }
    if (oldTable) {
      renderCombinedKpiTable(oldTable, model, labels);
    }
  }

  function buildOverviewStatementCompositionProjection(model, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var latestBucket = model && model.latest && model.latest.currency ? model.latest.currency[useCurrency] || {} : {};
    var netStatement = toFiniteNumber(latestBucket.netStatement);
    var rows = [
      { key: "carryOverDebt", label: "Carry over debt" },
      { key: "newDebt", label: "New debt" },
      { key: "taxes", label: "Taxes" },
      { key: "pastPayments", label: "Net past payments" }
    ].map(function (entry) {
      var amount = toFiniteNumber(latestBucket[entry.key]);
      return {
        key: entry.key,
        label: entry.label,
        amount: amount,
        share: netStatement === 0 ? null : amount / netStatement
      };
    });

    return {
      latestMonth: rawText(model && model.latestMonth),
      currency: useCurrency,
      netStatement: netStatement,
      rows: rows
    };
  }

  function renderOverviewStatementCompositionTable(tbody, projection) {
    if (!tbody) {
      return;
    }
    var rows = Array.isArray(projection && projection.rows) ? projection.rows : [];
    tbody.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="3">No statement composition data.</td>';
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.label);
      appendNumberCell(
        tr,
        toFiniteNumber(row.amount),
        String((projection && projection.currency) || "ARS"),
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.overviewTable
      );
      appendPercentCell(tr, row.share, false, "", NA_REASON.SHARE_ZERO_TOTAL);
      tbody.appendChild(tr);
    });
  }

  function buildOverviewCategoryShareProjection(model, currency) {
    var useCurrency = currency === "USD" ? "USD" : "ARS";
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var totals = Object.create(null);
    var totalAmount = 0;

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      if (row.movementType !== "CardMovement") {
        return;
      }
      var amount = useCurrency === "USD" ? toFiniteNumber(row && row.amountUSD) : toFiniteNumber(row && row.amountARS);
      if (amount === 0) {
        return;
      }
      totalAmount += amount;
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var category = mappedCategory || "Uncategorized";
      totals[category] = toFiniteNumber(totals[category]) + amount;
    });

    var entries = Object.keys(totals)
      .map(function (category) {
        return {
          category: category,
          amount: toFiniteNumber(totals[category])
        };
      })
      .filter(function (entry) {
        return entry.amount !== 0;
      })
      .sort(function (a, b) {
        var amountDiff = toFiniteNumber(b.amount) - toFiniteNumber(a.amount);
        if (amountDiff !== 0) {
          return amountDiff;
        }
        return String(a.category || "").localeCompare(String(b.category || ""));
      });

    var uncategorizedEntry = null;
    var rankedRows = [];
    var otherAmount = 0;

    entries.forEach(function (entry) {
      if (entry.category === "Uncategorized") {
        uncategorizedEntry = entry;
        return;
      }
      if (rankedRows.length < OVERVIEW_CATEGORY_TOP_LIMIT) {
        rankedRows.push(entry);
        return;
      }
      otherAmount += toFiniteNumber(entry.amount);
    });

    var rowsForTable = rankedRows.slice();
    if (uncategorizedEntry) {
      rowsForTable.push(uncategorizedEntry);
    }
    if (otherAmount > 0) {
      rowsForTable.push({
        category: "Other",
        amount: otherAmount
      });
    }

    rowsForTable = rowsForTable.map(function (entry) {
      return {
        category: entry.category,
        amount: toFiniteNumber(entry.amount),
        share: totalAmount > 0 ? toFiniteNumber(entry.amount) / totalAmount : null
      };
    });

    return {
      latestMonth: latestMonth,
      currency: useCurrency,
      totalAmount: totalAmount,
      rows: rowsForTable
    };
  }

  function renderOverviewCategoryShareTable(tbody, projection) {
    if (!tbody) {
      return;
    }
    var rows = Array.isArray(projection && projection.rows) ? projection.rows : [];
    tbody.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="3">No non-zero card-movement category totals for latest month.</td>';
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.category || "Uncategorized");
      appendNumberCell(
        tr,
        toFiniteNumber(row.amount),
        String((projection && projection.currency) || "ARS"),
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.overviewTable
      );
      appendPercentCell(tr, row.share, false, "", NA_REASON.SHARE_ZERO_TOTAL);
      tbody.appendChild(tr);
    });
  }

  function renderOverviewCategoryDeltaTable(tbody, projection, rows, emptyLabel, semanticTone) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = "";
    if (!projection || !projection.available) {
      var unavailable = document.createElement("tr");
      unavailable.innerHTML =
        '<td colspan="4">' +
        String((projection && projection.message) || "No category month-over-month data available.") +
        "</td>";
      tbody.appendChild(unavailable);
      return;
    }
    var ranked = Array.isArray(rows) ? rows : [];
    if (!ranked.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="4">' + String(emptyLabel || "No category changes.") + "</td>";
      tbody.appendChild(empty);
      return;
    }
    ranked.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.category || "Uncategorized");
      appendNumberCell(
        tr,
        toFiniteNumber(row.prev),
        "ARS",
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.overviewTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.latest),
        "ARS",
        false,
        false,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.overviewTable
      );
      appendNumberCell(
        tr,
        toFiniteNumber(row.delta),
        "ARS",
        true,
        false,
        semanticTone,
        VIEW_NUMBER_FORMAT_POLICY.overviewTable
      );
      tbody.appendChild(tr);
    });
  }

  function setOverviewMetaDescription(node, monthText, descriptionText) {
    if (!node) {
      return;
    }
    node.textContent = "";
    var monthLine = document.createElement("strong");
    monthLine.textContent = "Latest month: " + (monthText || "N/A");
    node.appendChild(monthLine);
    var lines = Array.isArray(descriptionText) ? descriptionText : [descriptionText];
    lines.forEach(function (line) {
      if (!line) {
        return;
      }
      node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(String(line)));
    });
  }

  function renderOverviewQ001Section(model) {
    var statementBody = document.getElementById("fo-overview-statement-body");
    var statementMeta = document.getElementById("fo-overview-statement-meta");
    var categoriesBody = document.getElementById("fo-overview-categories-body");
    var categoriesMeta = document.getElementById("fo-overview-categories-meta");
    if (!statementBody && !statementMeta && !categoriesBody && !categoriesMeta) {
      return;
    }

    var statementProjection = buildOverviewStatementCompositionProjection(model, "ARS");
    var categoryProjection = buildOverviewCategoryShareProjection(model, "ARS");

    renderOverviewStatementCompositionTable(statementBody, statementProjection);
    renderOverviewCategoryShareTable(categoriesBody, categoryProjection);

    if (statementMeta) {
      setOverviewMetaDescription(
        statementMeta,
        statementProjection.latestMonth,
        "This table shows how the full statement total (" +
          formatNumberByMode(
            toFiniteNumber(statementProjection.netStatement),
            VIEW_NUMBER_FORMAT_POLICY.overviewTable
          ) +
          " ARS) is split between old debt, new debt, taxes, and past payments."
      );
    }

    if (categoriesMeta) {
      setOverviewMetaDescription(
        categoriesMeta,
        categoryProjection.latestMonth,
        "This table shows which categories made up this month's card movements. Refunds or credits reduce a category total."
      );
    }
  }

  function renderOverviewQ003Q004Section(model) {
    var metaNode = document.getElementById("fo-overview-q34-meta");
    var increasesBody = document.getElementById("fo-overview-q3-body");
    var decreasesBody = document.getElementById("fo-overview-q4-body");
    if (!metaNode && !increasesBody && !decreasesBody) {
      return;
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var prevMonth = rawText(model && model.prevMonth);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var projection = buildCategoryMoMDeltaProjection(rows, categoryLookup, latestMonth, prevMonth, "ARS");

    renderOverviewCategoryDeltaTable(
      increasesBody,
      projection,
      projection && projection.increaseRows,
      "No category increases between latest and previous month.",
      "fo-cell-neg"
    );
    renderOverviewCategoryDeltaTable(
      decreasesBody,
      projection,
      projection && projection.decreaseRows,
      "No category decreases between latest and previous month.",
      "fo-cell-pos"
    );

    if (metaNode) {
      if (!projection || !projection.available) {
        setOverviewMetaDescription(
          metaNode,
          latestMonth || "N/A",
          "Need both the latest and previous statement month to compare category changes."
        );
        return;
      }
      setOverviewMetaDescription(
        metaNode,
        (projection.latestMonth || "N/A") + " | Compared with: " + (projection.prevMonth || "N/A"),
        "These tables show the categories with the largest month-over-month changes in spending."
      );
    }
  }

  function buildOverviewDebtDirectionProjection(model, currency) {
    var latestCurrency = model && model.latest && model.latest.currency ? model.latest.currency[currency] || {} : {};
    var prevCurrency = model && model.prev && model.prev.currency ? model.prev.currency[currency] || {} : {};
    var closeDateByMonth = buildStatementMonthCloseDateMap(model);
    var trendMonths =
      model && model.trend && Array.isArray(model.trend.months)
        ? model.trend.months
            .map(function (month) {
              return rawText(month);
            })
            .filter(Boolean)
        : [];
    var series =
      model && model.trend && model.trend[currency] && Array.isArray(model.trend[currency].remainingDebt)
        ? model.trend[currency].remainingDebt.map(toFiniteNumber)
        : [];
    var size = Math.min(trendMonths.length, series.length);
    var months = trendMonths.slice(0, size);
    var values = series.slice(0, size);
    var closeDates = months.map(function (month) {
      return rawText(closeDateByMonth[month]);
    });
    var latestMonth = rawText(model && model.latestMonth);
    if (!values.length && latestMonth) {
      months = [latestMonth];
      values = [toFiniteNumber(latestCurrency.remainingDebt)];
      closeDates = [rawText(closeDateByMonth[latestMonth])];
    }

    var latest = toFiniteNumber(latestCurrency.remainingDebt);
    var prev = toFiniteNumber(prevCurrency.remainingDebt);
    return {
      available: values.length > 0,
      latestMonth: latestMonth || (months.length ? months[months.length - 1] : ""),
      prevMonth: rawText(model && model.prevMonth),
      months: months,
      values: values,
      closeDates: closeDates,
      latest: latest,
      prev: prev,
      delta: latest - prev,
      direction: debtDirectionLabel(latest - prev)
    };
  }

  function buildStatementMonthCloseDateMap(model) {
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var closeDatesByMonth = Object.create(null);

    rows.forEach(function (row) {
      var month = rawText(row && row.statementMonth);
      var closeDate = rawText(row && row.cardStatementCloseDate);
      if (!month || !closeDate) {
        return;
      }
      if (!closeDatesByMonth[month]) {
        closeDatesByMonth[month] = new Set();
      }
      closeDatesByMonth[month].add(closeDate);
    });

    var out = Object.create(null);
    Object.keys(closeDatesByMonth).forEach(function (month) {
      var values = Array.from(closeDatesByMonth[month]).sort(function (a, b) {
        return a.localeCompare(b);
      });
      if (values.length === 1) {
        out[month] = values[0];
        return;
      }
      if (values.length > 1) {
        out[month] = values.join(", ");
      }
    });
    return out;
  }

  function buildOverviewDebtDirectionChartConfig(model) {
    var ars = buildOverviewDebtDirectionProjection(model, "ARS");
    var usd = buildOverviewDebtDirectionProjection(model, "USD");
    return {
      ARS: {
        type: "line",
        labels: ars.months.length ? ars.months : ["No debt trend"],
        datasets: [
          {
            label: "Total remaining installment debt ARS",
            data: ars.months.length
              ? ars.values.map(function (value, index) {
                  return {
                    y: value,
                    custom: {
                      statementMonth: ars.months[index] || "",
                      closeDateLabel: ars.closeDates[index] || ""
                    }
                  };
                })
              : [0],
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.18)"
          }
        ]
      },
      USD: {
        type: "line",
        labels: usd.months.length ? usd.months : ["No debt trend"],
        datasets: [
          {
            label: "Total remaining installment debt USD",
            data: usd.months.length
              ? usd.values.map(function (value, index) {
                  return {
                    y: value,
                    custom: {
                      statementMonth: usd.months[index] || "",
                      closeDateLabel: usd.closeDates[index] || ""
                    }
                  };
                })
              : [0],
            borderColor: "#f472b6",
            backgroundColor: "rgba(244,114,182,0.18)"
          }
        ]
      }
    };
  }

  function renderOverviewQ008Section(model) {
    var metaNode = document.getElementById("fo-overview-q8-meta");
    var host = document.getElementById("fo-overview-q8-host");
    if (!metaNode && !host) {
      return;
    }

    var ars = buildOverviewDebtDirectionProjection(model, "ARS");
    var usd = buildOverviewDebtDirectionProjection(model, "USD");
    if (metaNode) {
      if (!ars.available && !usd.available) {
        setOverviewMetaDescription(
          metaNode,
          rawText(model && model.latestMonth) || "N/A",
          "Need debt trend data to evaluate whether total remaining installment debt is growing or shrinking."
        );
      } else {
        setOverviewMetaDescription(
          metaNode,
          ars.latestMonth || usd.latestMonth || "N/A",
          [
            "This chart tracks total remaining installment debt by statement month.",
            "That total already includes next month's installments. ARS " +
              formatCompact(ars.latest) +
              " (Prev " +
              formatCompact(ars.prev) +
              ", Δ " +
              formatCompact(ars.delta) +
              ", " +
              ars.direction +
              ") | USD " +
              formatCompact(usd.latest) +
              " (Prev " +
              formatCompact(usd.prev) +
              ", Δ " +
              formatCompact(usd.delta) +
              ", " +
              usd.direction +
              ")."
          ]
        );
      }
    }
    if (host) {
      renderOverviewDebtDirectionHighchartsHost(host, buildOverviewDebtDirectionChartConfig(model));
    }
  }

  function setMetricHelpOpen(wrap, open) {
    if (!wrap) {
      return;
    }
    var button = wrap.querySelector(".fo-metric-help");
    if (open) {
      wrap.setAttribute("data-open", "true");
    } else {
      wrap.removeAttribute("data-open");
    }
    if (button) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function closeOverviewMetricHelp(scope, keepWrap) {
    if (!scope) {
      return;
    }
    Array.prototype.forEach.call(
      scope.querySelectorAll(".fo-metric-help-wrap[data-open='true']"),
      function (wrap) {
        if (keepWrap && wrap === keepWrap) {
          return;
        }
        setMetricHelpOpen(wrap, false);
      }
    );
  }

  function attachOverviewMetricHelpHandlers() {
    attachMetricHelpHandlers("overview");
  }

  function attachMetricHelpHandlers(scopeId) {
    var scope = typeof scopeId === "string" ? document.getElementById(scopeId) : scopeId;
    if (!scope || scope.dataset.foMetricHelpBound === "true") {
      return;
    }
    scope.dataset.foMetricHelpBound = "true";

    scope.addEventListener("click", function (event) {
      var trigger = event.target && event.target.closest ? event.target.closest(".fo-metric-help") : null;
      var wrap = trigger && trigger.closest ? trigger.closest(".fo-metric-help-wrap") : null;
      if (!wrap) {
        closeOverviewMetricHelp(scope);
        return;
      }
      event.preventDefault();
      var shouldOpen = wrap.getAttribute("data-open") !== "true";
      closeOverviewMetricHelp(scope, wrap);
      setMetricHelpOpen(wrap, shouldOpen);
    });

    scope.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeOverviewMetricHelp(scope);
      }
    });
  }

  function normalizeSearchText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function detailContainsAny(detail, keywords) {
    return (keywords || []).some(function (keyword) {
      return detail.indexOf(keyword) >= 0;
    });
  }

  function classifyFinancialCostBucket(row) {
    var detail = normalizeSearchText(row && row.detail);
    var movementType = normalizeSearchText(row && row.movementType);
    if (detailContainsAny(detail, FINANCE_COST_DETAIL_KEYWORDS.interest)) {
      return "interest";
    }
    if (detailContainsAny(detail, FINANCE_COST_DETAIL_KEYWORDS.fees)) {
      return "fees";
    }
    if (movementType === "TAX" || detailContainsAny(detail, FINANCE_COST_DETAIL_KEYWORDS.taxes)) {
      return "taxes";
    }
    return "";
  }

  function buildFinanceCostProjection(model) {
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);
    var latestMonth = rawText(model && model.latestMonth);
    var byBucket = {
      taxes: { amountARS: 0, amountUSD: 0, rows: 0 },
      fees: { amountARS: 0, amountUSD: 0, rows: 0 },
      interest: { amountARS: 0, amountUSD: 0, rows: 0 }
    };

    rows
      .filter(function (row) {
        return row && row.statementMonth === latestMonth;
      })
      .forEach(function (row) {
        var bucket = classifyFinancialCostBucket(row);
        if (!bucket || !byBucket[bucket]) {
          return;
        }
        var amountARS = Math.max(0, toFiniteNumber(row && row.amountARS));
        var amountUSD = Math.max(0, toFiniteNumber(row && row.amountUSD));
        if (amountARS <= 0 && amountUSD <= 0) {
          return;
        }
        byBucket[bucket].amountARS += amountARS;
        byBucket[bucket].amountUSD += amountUSD;
        byBucket[bucket].rows += 1;
      });

    var bucketRows = FINANCE_COST_BUCKETS.map(function (bucket) {
      if (bucket.key === "total") {
        return {
          key: bucket.key,
          label: bucket.label,
          amountARS: byBucket.taxes.amountARS + byBucket.fees.amountARS + byBucket.interest.amountARS,
          amountUSD: byBucket.taxes.amountUSD + byBucket.fees.amountUSD + byBucket.interest.amountUSD,
          rows: byBucket.taxes.rows + byBucket.fees.rows + byBucket.interest.rows
        };
      }
      return {
        key: bucket.key,
        label: bucket.label,
        amountARS: byBucket[bucket.key].amountARS,
        amountUSD: byBucket[bucket.key].amountUSD,
        rows: byBucket[bucket.key].rows
      };
    });

    return {
      latestMonth: latestMonth,
      rows: bucketRows
    };
  }

  function renderFinanceCostTable(tbody, projection) {
    if (!tbody) {
      return;
    }
    var rows = projection && Array.isArray(projection.rows) ? projection.rows : [];
    tbody.innerHTML = "";
    rows.forEach(function (entry) {
      var tr = document.createElement("tr");
      appendCell(tr, entry.label, entry.key === "total" ? "metric" : "");
      appendNumberCell(tr, toFiniteNumber(entry.amountARS), "ARS", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.ownerRankTable);
      appendNumberCell(tr, toFiniteNumber(entry.amountUSD), "USD", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.ownerRankTable);
      appendCell(tr, toLocale(toFiniteNumber(entry.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
    if (!rows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="4">No financial-cost rows found.</td>';
      tbody.appendChild(empty);
    }
  }

  function renderFinanceCostSectionInto(targetIds, projection) {
    if (!targetIds) {
      return;
    }
    var body = document.getElementById(targetIds.bodyId);
    var metaNode = document.getElementById(targetIds.metaId);
    if (!body && !metaNode) {
      return;
    }
    renderFinanceCostTable(body, projection);
    if (metaNode) {
      var total = (projection && projection.rows || []).find(function (row) {
        return row.key === "total";
      });
      var latestMonth = projection && projection.latestMonth ? projection.latestMonth : "N/A";
      if (targetIds.variant === "new") {
        metaNode.textContent =
          "Latest month: " +
          latestMonth +
          " | This table shows taxes, fees, and interest billed in the latest month, separated from actual spending." +
          " Classified rows: " +
          toLocale(toFiniteNumber(total && total.rows), 0, 0) +
          ".";
      } else {
        metaNode.textContent =
          "Latest month: " +
          latestMonth +
          " | Scope: strict raw explorer, positive amounts only." +
          " | Classification priority: Interest > Fees > Taxes." +
          " | Total rows classified: " +
          toLocale(toFiniteNumber(total && total.rows), 0, 0) +
          ".";
      }
    }
  }

  function renderFinanceCostSection(model, projection) {
    var resolvedProjection = projection || buildFinanceCostProjection(model);
    [
      {
        bodyId: "fo-finance-cost-body",
        metaId: "fo-finance-cost-meta",
        variant: "old"
      },
      {
        bodyId: "fo-debt-new-finance-cost-body",
        metaId: "fo-debt-new-finance-cost-meta",
        variant: "new"
      }
    ].forEach(function (targetIds) {
      renderFinanceCostSectionInto(targetIds, resolvedProjection);
    });
    return resolvedProjection;
  }

  var DEBT_PRIORITY_HELP_TEXT = Object.freeze({
    newDebt:
      "How much new debt was added this month compared with the previous month.",
    cost:
      "Taxes, fees, and interest billed in the latest month, separated from actual spending.",
    maturity:
      "How many months of installment debt are still ahead, plus the total amount still pending."
  });

  function setDebtPriorityItem(node, labelText, valueText, hintText, toneClass) {
    var helpText = arguments.length > 5 ? arguments[5] : "";
    if (!node) {
      return;
    }
    node.classList.remove("fo-cell-pos", "fo-cell-neg");
    if (toneClass === "fo-cell-pos" || toneClass === "fo-cell-neg") {
      node.classList.add(toneClass);
    }
    node.innerHTML = "";

    var labelNode = document.createElement("span");
    labelNode.className = "fo-debt-priority-label";
    if (helpText) {
      labelNode.appendChild(buildMetricHelpWrap(labelText, helpText));
    } else {
      labelNode.textContent = labelText;
    }
    node.appendChild(labelNode);

    var valueNode = document.createElement("span");
    valueNode.className = "fo-debt-priority-value";
    valueNode.textContent = valueText;
    node.appendChild(valueNode);

    var hintNode = document.createElement("span");
    hintNode.className = "fo-debt-priority-hint";
    hintNode.textContent = hintText;
    node.appendChild(hintNode);
  }

  function renderDebtPriorityStripInto(targetIds, model, financeCostProjection, maturity) {
    var newDebtNode = document.getElementById(targetIds.newDebtId);
    var costNode = document.getElementById(targetIds.costId);
    var maturityNode = document.getElementById(targetIds.maturityId);
    if (!newDebtNode && !costNode && !maturityNode) {
      return;
    }

    var metricHelpByKey = targetIds.metricHelpByKey || {};
    var newDebtArs = computeDiff(model, "ARS", "newDebt");
    var newDebtUsd = computeDiff(model, "USD", "newDebt");
    var newDebtTone = semanticClass("newDebt", newDebtArs.delta);
    var newDebtHint =
      newDebtArs.delta > 0
        ? "Latest month added debt vs previous month."
        : newDebtArs.delta < 0
          ? "Latest month reduced new debt vs previous month."
          : "New debt unchanged vs previous month.";
    setDebtPriorityItem(
      newDebtNode,
      "New debt pressure",
      "Δ ARS " + formatCompact(newDebtArs.delta) + " | Δ USD " + formatCompact(newDebtUsd.delta),
      newDebtHint,
      newDebtTone,
      metricHelpByKey.newDebt
    );

    var totalCost = (financeCostProjection && financeCostProjection.rows || []).find(function (row) {
      return row.key === "total";
    }) || { amountARS: 0, amountUSD: 0, rows: 0 };
    var hasFinancialCost = toFiniteNumber(totalCost.amountARS) > 0 || toFiniteNumber(totalCost.amountUSD) > 0;
    setDebtPriorityItem(
      costNode,
      "Financial cost load",
      "ARS " + formatCompact(totalCost.amountARS) + " | USD " + formatCompact(totalCost.amountUSD),
      "Classified rows: " + toLocale(toFiniteNumber(totalCost.rows), 0, 0) + ".",
      hasFinancialCost ? "fo-cell-neg" : "fo-cell-pos",
      metricHelpByKey.cost
    );

    var horizon = maturity && maturity.horizonMonths ? toFiniteNumber(maturity.horizonMonths) : 0;
    if (horizon <= 0) {
      setDebtPriorityItem(
        maturityNode,
        "Installment maturity horizon",
        "No future installments detected",
        "Check maturity source output for upcoming months.",
        undefined,
        metricHelpByKey.maturity
      );
    } else {
      setDebtPriorityItem(
        maturityNode,
        "Installment maturity horizon",
        "Horizon " + toLocale(horizon, 0, 0) + " months",
        "Total ARS " + formatCompact(maturity.totalARS) + " | Total USD " + formatCompact(maturity.totalUSD) + ".",
        "fo-cell-pos",
        metricHelpByKey.maturity
      );
    }
  }

  function renderDebtPriorityStrip(model, financeCostProjection, maturity) {
    [
      {
        newDebtId: "fo-debt-priority-new-debt",
        costId: "fo-debt-priority-cost",
        maturityId: "fo-debt-priority-maturity"
      },
      {
        newDebtId: "fo-debt-new-priority-new-debt",
        costId: "fo-debt-new-priority-cost",
        maturityId: "fo-debt-new-priority-maturity",
        metricHelpByKey: DEBT_PRIORITY_HELP_TEXT
      }
    ].forEach(function (targetIds) {
      renderDebtPriorityStripInto(targetIds, model, financeCostProjection, maturity);
    });
    attachMetricHelpHandlers("debt");
  }

  function renderDebtNewTotalSection(model) {
    var metaNode = document.getElementById("fo-debt-new-total-meta");
    var host = document.getElementById("fo-debt-new-total-host");
    if (!metaNode && !host) {
      return;
    }

    var latestMonth = rawText(model && model.latestMonth) || "N/A";

    if (metaNode) {
      metaNode.textContent = "Latest month: " + latestMonth;
    }

    if (host) {
      renderDualHighchartsHost(host, buildOverviewDebtDirectionChartConfig(model));
    }
  }

  function renderDebtNewProjectedSection(model, maturityConfig) {
    var metaNode = document.getElementById("fo-debt-new-projected-meta");
    var host = document.getElementById("fo-debt-new-projected-host");
    if (!metaNode && !host) {
      return;
    }
    var resolvedMaturityConfig = maturityConfig || buildDebtMaturityConfig(model);
    var maturity = resolvedMaturityConfig && resolvedMaturityConfig.maturity ? resolvedMaturityConfig.maturity : null;
    var latestMonth = rawText(model && model.latestMonth) || "N/A";

    if (metaNode) {
      if (!maturity || toFiniteNumber(maturity.horizonMonths) <= 0) {
        metaNode.textContent = "Latest month: " + latestMonth + " | No future installments detected.";
      } else {
        metaNode.textContent =
          "Latest month: " +
          latestMonth +
          " | Future months already committed by current installments.";
      }
    }

    if (host && resolvedMaturityConfig && resolvedMaturityConfig.charts) {
      renderDualHighchartsHost(host, resolvedMaturityConfig.charts);
    }
  }

  function bindDebtMaturityCumulativeDetails(detailsNode) {
    if (!detailsNode || detailsNode.dataset.foDebtMaturityBound === "true") {
      return;
    }
    detailsNode.addEventListener("toggle", function () {
      if (detailsNode.open && lastRenderedModel) {
        renderDebtSection(lastRenderedModel);
      }
    });
    detailsNode.dataset.foDebtMaturityBound = "true";
  }

  function renderDebtSection(model) {
    var host = document.getElementById("fo-debt-trend-host");
    var metaNode = document.getElementById("fo-debt-meta");
    var totalDebtNode = document.getElementById("fo-debt-total-kpi");
    var newTotalMetaNode = document.getElementById("fo-debt-new-total-meta");
    var newTotalHost = document.getElementById("fo-debt-new-total-host");
    var newProjectedMetaNode = document.getElementById("fo-debt-new-projected-meta");
    var newProjectedHost = document.getElementById("fo-debt-new-projected-host");
    var newFinanceCostBody = document.getElementById("fo-debt-new-finance-cost-body");
    var newFinanceCostMeta = document.getElementById("fo-debt-new-finance-cost-meta");
    var newDeltaMetaNode = document.getElementById("fo-debt-new-delta-meta");
    var newDeltaHost = document.getElementById("fo-debt-new-delta-host");
    var maturityHost = document.getElementById("fo-debt-maturity-host");
    var maturityCumulativeDetailsNode = document.getElementById("fo-debt-maturity-cumulative-details");
    var maturityCumulativeHost = document.getElementById("fo-debt-maturity-cumulative-host");
    var maturityMetaNode = document.getElementById("fo-debt-maturity-meta");
    var maturityEmptyNode = document.getElementById("fo-debt-maturity-empty");
    var deltaHost = document.getElementById("fo-debt-delta-host");
    if (
      !host &&
      !metaNode &&
      !totalDebtNode &&
      !document.getElementById("fo-debt-priority-strip") &&
      !document.getElementById("fo-finance-cost-body") &&
      !document.getElementById("fo-finance-cost-meta") &&
      !newFinanceCostBody &&
      !newFinanceCostMeta &&
      !newTotalMetaNode &&
      !newTotalHost &&
      !newProjectedMetaNode &&
      !newProjectedHost &&
      !newDeltaMetaNode &&
      !newDeltaHost &&
      !maturityCumulativeDetailsNode &&
      !maturityHost &&
      !maturityCumulativeHost &&
      !maturityMetaNode &&
      !maturityEmptyNode &&
      !deltaHost
    ) {
      return;
    }
    var maturityConfig = buildDebtMaturityConfig(model);
    var financeCostProjection = buildFinanceCostProjection(model);
    bindDebtMaturityCumulativeDetails(maturityCumulativeDetailsNode);
    renderFinanceCostSection(model, financeCostProjection);
    renderDebtPriorityStrip(model, financeCostProjection, maturityConfig.maturity);
    renderDebtNewTotalSection(model);
    renderDebtNewProjectedSection(model, maturityConfig);
    if (newDeltaHost) {
      renderDualHighchartsHost(newDeltaHost, buildDebtTotalDeltaMergedConfig(model));
    }
    if (host) {
      renderDualHighchartsHost(host, buildDebtTrendConfig(model));
    }
    if (maturityHost) {
      renderDualHighchartsHost(maturityHost, maturityConfig.charts);
    }
    if (maturityCumulativeHost) {
      if (!maturityCumulativeDetailsNode || maturityCumulativeDetailsNode.open) {
        renderDualHighchartsHost(
          maturityCumulativeHost,
          buildDebtMaturityCumulativeConfig(maturityConfig.maturity)
        );
      }
    }
    if (deltaHost) {
      renderDualHighchartsHost(deltaHost, buildDebtDeltaTrendConfig(model));
    }
    if (metaNode) {
      metaNode.textContent =
        "Latest month: " +
        (model.latestMonth || "N/A") +
        " | Debt trend source: strict runtime overview_projection." +
        " | Debt delta source: strict runtime overview_projection." +
        " | Maturity source: debt_maturity_schedule_by_month_v1." +
        " | Maturity cumulative source: debt_maturity_schedule_by_month_v1.";
    }
    if (newDeltaMetaNode) {
      newDeltaMetaNode.textContent =
        "Latest month: " +
        (model.latestMonth || "N/A") +
        " | Bars show the percentage change in total remaining installment debt vs the previous month. Tooltip includes the absolute delta. Values above 0 mean more debt than the previous month; values below 0 mean less. Percentage is N/A when the previous month debt is 0.";
    }
    if (totalDebtNode) {
      var totalArs = computeTotalDebtSummary(model, "ARS");
      var totalUsd = computeTotalDebtSummary(model, "USD");
      totalDebtNode.textContent =
        "Total remaining installment debt:" +
        " ARS " +
        formatCompact(totalArs.latest) +
        " (Prev " +
        formatCompact(totalArs.prev) +
        ", Δ " +
        formatCompact(totalArs.delta) +
        ", " +
        debtDirectionLabel(totalArs.delta) +
        ")" +
        " | USD " +
        formatCompact(totalUsd.latest) +
        " (Prev " +
        formatCompact(totalUsd.prev) +
        ", Δ " +
        formatCompact(totalUsd.delta) +
        ", " +
        debtDirectionLabel(totalUsd.delta) +
        ").";
      totalDebtNode.title =
        "Latest month total remaining installment debt uses remainingDebt from strict overview_projection trend fields. remainingDebt already includes next month's installments.";
    }
    if (maturityMetaNode) {
      var maturity = maturityConfig.maturity;
      var baseMonth = maturity.baseStatementMonth || model.latestMonth || "N/A";
      if (maturityEmptyNode) {
        if (maturity.horizonMonths <= 0) {
          maturityEmptyNode.textContent =
            "No future maturity rows in strict runtime output. Base month: " +
            baseMonth +
            ". Review source table debt_maturity_schedule_by_month_v1.";
          maturityEmptyNode.classList.remove("is-hidden");
        } else {
          maturityEmptyNode.textContent = "";
          maturityEmptyNode.classList.add("is-hidden");
        }
      }
      if (maturity.horizonMonths <= 0) {
        maturityMetaNode.textContent =
          "Base month: " + baseMonth + " | No future installment maturity rows in strict runtime output.";
      } else {
        maturityMetaNode.textContent =
          "Base month: " +
          baseMonth +
          " | Horizon: " +
          toLocale(maturity.horizonMonths, 0, 0) +
          " months" +
          " | Total ARS: " +
          formatCompact(maturity.totalARS) +
          " | Total USD: " +
          formatCompact(maturity.totalUSD) +
          " | Source table: debt_maturity_schedule_by_month_v1.";
      }
    }
  }

  function computeTotalDebtSummary(model, currency) {
    var latestCurrency = model && model.latest && model.latest.currency ? model.latest.currency[currency] || {} : {};
    var prevCurrency = model && model.prev && model.prev.currency ? model.prev.currency[currency] || {} : {};
    var latest = toFiniteNumber(latestCurrency.remainingDebt);
    var prev = toFiniteNumber(prevCurrency.remainingDebt);
    return {
      latest: latest,
      prev: prev,
      delta: latest - prev
    };
  }

  function debtDirectionLabel(delta) {
    if (delta > 0) {
      return "growing";
    }
    if (delta < 0) {
      return "shrinking";
    }
    return "flat";
  }

  function formatDqRuleLabel(ruleId) {
    if (ruleId === "DQ003") {
      return "Missing category mapping";
    }
    if (ruleId === "DQ004") {
      return "Missing owner mapping";
    }
    return ruleId || "Unknown";
  }

  function normalizeDqRuleFilter(value) {
    var key = rawText(value).toUpperCase();
    if (key === DQ_RULE_FILTER.DQ003) {
      return DQ_RULE_FILTER.DQ003;
    }
    if (key === DQ_RULE_FILTER.DQ004) {
      return DQ_RULE_FILTER.DQ004;
    }
    return DQ_RULE_FILTER.ALL;
  }

  function filterDqIssuesByRule(issues, ruleFilter) {
    var source = Array.isArray(issues) ? issues : [];
    var activeFilter = normalizeDqRuleFilter(ruleFilter);
    if (activeFilter === DQ_RULE_FILTER.ALL) {
      return source.slice();
    }
    return source.filter(function (issue) {
      return rawText(issue && issue.ruleId).toUpperCase() === activeFilter;
    });
  }

  function renderDqIssueTable(tbody, issues, ruleFilter, options) {
    if (!tbody) {
      return {
        renderedRows: 0,
        filteredIssues: 0,
        activeFilter: DQ_RULE_FILTER.ALL
      };
    }

    var config = options && typeof options === "object" ? options : {};
    var hasExplicitLimit = Object.prototype.hasOwnProperty.call(config, "limit");
    var limit = hasExplicitLimit ? config.limit : 20;
    var filteredIssues = filterDqIssuesByRule(issues, ruleFilter);
    var activeFilter = normalizeDqRuleFilter(ruleFilter);
    var rows =
      limit == null || limit < 0 ? filteredIssues.slice() : filteredIssues.slice(0, limit);
    tbody.innerHTML = "";

    if (!rows.length) {
      var empty = document.createElement("tr");
      if (activeFilter === DQ_RULE_FILTER.ALL) {
        empty.innerHTML =
          '<td colspan="6">' +
          (config.emptyMessageAll || "No issues found in strict diagnostics.") +
          "</td>";
      } else {
        empty.innerHTML =
          '<td colspan="6">' +
          (config.emptyMessageFiltered || "No issues found for selected rule focus.") +
          "</td>";
      }
      tbody.appendChild(empty);
      return {
        renderedRows: 0,
        filteredIssues: filteredIssues.length,
        activeFilter: activeFilter
      };
    }

    rows.forEach(function (issue) {
      var tr = document.createElement("tr");
      appendCell(tr, formatDqRuleLabel(issue.ruleId));
      appendCell(tr, issue.closeDate || "N/A");
      appendCell(tr, issue.detail || "N/A");
      appendCell(tr, issue.cardOwner || "N/A");
      appendCell(tr, issue.cardNumber || "N/A");
      appendCell(tr, issue.message || "");
      tbody.appendChild(tr);
    });

    return {
      renderedRows: rows.length,
      filteredIssues: filteredIssues.length,
      activeFilter: activeFilter
    };
  }

  function buildCategoryMappingDriftProjection(rows, categoryLookup) {
    var byMonth = Object.create(null);

    (rows || []).forEach(function (row) {
      if (rawText(row && row.movementType) !== "CardMovement") {
        return;
      }
      var month = rawText(row && row.statementMonth);
      if (!month) {
        return;
      }
      if (!byMonth[month]) {
        byMonth[month] = {
          statementMonth: month,
          cardMovementRows: 0,
          uncategorizedRows: 0,
          uncategorizedShare: null,
          distinctUncategorizedDetails: 0,
          deltaShareVsPrev: null,
          _uncategorizedDetails: new Set()
        };
      }
      var entry = byMonth[month];
      entry.cardMovementRows += 1;
      var detail = rawText(row && row.detail);
      var mappedCategory = rawText(categoryLookup && categoryLookup[detail]);
      var mappedKey = normalizedCategoryKey(mappedCategory);
      var mapped = Boolean(mappedCategory) && mappedKey !== "uncategorized" && mappedCategory !== "?";
      if (!mapped) {
        entry.uncategorizedRows += 1;
        entry._uncategorizedDetails.add(detail || "(empty detail)");
      }
    });

    var monthsAsc = Object.keys(byMonth).sort(function (a, b) {
      return a.localeCompare(b);
    });
    monthsAsc.forEach(function (monthKey, index) {
      var current = byMonth[monthKey];
      current.distinctUncategorizedDetails = current._uncategorizedDetails.size;
      current.uncategorizedShare =
        current.cardMovementRows > 0 ? current.uncategorizedRows / current.cardMovementRows : null;
      if (index === 0) {
        current.deltaShareVsPrev = null;
      } else {
        var prev = byMonth[monthsAsc[index - 1]];
        if (current.uncategorizedShare == null || prev.uncategorizedShare == null) {
          current.deltaShareVsPrev = null;
        } else {
          current.deltaShareVsPrev = current.uncategorizedShare - prev.uncategorizedShare;
        }
      }
      delete current._uncategorizedDetails;
    });

    var monthsDesc = monthsAsc.slice().reverse();
    var rowsDesc = monthsDesc.map(function (monthKey) {
      return byMonth[monthKey];
    });
    return {
      rows: rowsDesc,
      monthsCount: rowsDesc.length
    };
  }

  function renderCategoryMappingDriftTable(tbody, rows) {
    if (!tbody) {
      return;
    }
    var driftRows = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!driftRows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="6">No CardMovement rows by month for mapping stability.</td>';
      tbody.appendChild(empty);
      return;
    }

    driftRows.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.statementMonth || "N/A");
      appendCell(tr, toLocale(toFiniteNumber(row.cardMovementRows), 0, 0), "num");
      var uncategorizedCell = document.createElement("td");
      uncategorizedCell.classList.add("num");
      if (toFiniteNumber(row.uncategorizedRows) > 0) {
        uncategorizedCell.classList.add("fo-cell-neg");
      }
      uncategorizedCell.textContent = toLocale(toFiniteNumber(row.uncategorizedRows), 0, 0);
      tr.appendChild(uncategorizedCell);
      appendPercentCell(
        tr,
        row.uncategorizedShare,
        true,
        row.uncategorizedShare > 0 ? "fo-cell-neg" : "",
        NA_REASON.MAPPING_NO_CARD_MOVEMENT_ROWS
      );
      appendCell(tr, toLocale(toFiniteNumber(row.distinctUncategorizedDetails), 0, 0), "num");
      var deltaCell = document.createElement("td");
      deltaCell.classList.add("num");
      if (row.deltaShareVsPrev == null) {
        deltaCell.textContent = "N/A";
        deltaCell.title = NA_REASON.MAPPING_NO_PREV_MONTH;
      } else {
        if (row.deltaShareVsPrev > 0) {
          deltaCell.classList.add("fo-cell-neg");
        } else if (row.deltaShareVsPrev < 0) {
          deltaCell.classList.add("fo-cell-pos");
        }
        deltaCell.textContent = formatPercent(row.deltaShareVsPrev * 100);
        deltaCell.title = formatPercent(row.deltaShareVsPrev * 100);
      }
      tr.appendChild(deltaCell);
      tbody.appendChild(tr);
    });
  }

  function getOverviewWarningSummary(model) {
    var dq = model && model.dq ? model.dq : {};
    var uncategorizedCount = toFiniteNumber(
      dq.uncategorizedCount == null ? model && model.uncategorizedCount : dq.uncategorizedCount
    );
    var unmappedOwnerCount = toFiniteNumber(dq.unmappedOwnerCount);
    var totalWarnings = toFiniteNumber(dq.totalIssues);
    if (totalWarnings <= 0) {
      totalWarnings = Number(model && model.warnings && model.warnings.length) || 0;
    }
    return {
      total: totalWarnings,
      uncategorizedCount: uncategorizedCount,
      unmappedOwnerCount: unmappedOwnerCount
    };
  }

  function renderDqRebuiltSection(model) {
    var metaNode = document.getElementById("fo-dq-new-meta");
    var totalNode = document.getElementById("fo-dq-new-summary-total");
    var categoryNode = document.getElementById("fo-dq-new-summary-category");
    var ownerNode = document.getElementById("fo-dq-new-summary-owner");
    var issuesBody = document.getElementById("fo-dq-new-issues-body");
    var issuesNote = document.getElementById("fo-dq-new-note");
    var prevButton = document.getElementById("fo-dq-new-prev");
    var nextButton = document.getElementById("fo-dq-new-next");
    var pageNode = document.getElementById("fo-dq-new-page");

    if (
      !metaNode &&
      !totalNode &&
      !categoryNode &&
      !ownerNode &&
      !issuesBody &&
      !issuesNote &&
      !prevButton &&
      !nextButton &&
      !pageNode
    ) {
      return;
    }

    var dq = model && model.dq ? model.dq : {};
    var warningSummary = getOverviewWarningSummary(model);
    var totalIssues = warningSummary.total;
    var uncategorizedCount = warningSummary.uncategorizedCount;
    var unmappedOwnerCount = warningSummary.unmappedOwnerCount;
    var issues = Array.isArray(dq.issues) ? dq.issues : [];
    var availableIssueCount = issues.length;
    var totalPages = Math.max(1, Math.ceil(availableIssueCount / DQ_REBUILT_PAGE_SIZE));
    if (!Number.isFinite(dqRebuiltTableState.page) || dqRebuiltTableState.page < 1) {
      dqRebuiltTableState.page = 1;
    }
    if (dqRebuiltTableState.page > totalPages) {
      dqRebuiltTableState.page = totalPages;
    }
    var currentPage = dqRebuiltTableState.page;
    var pageStartIndex = availableIssueCount > 0 ? (currentPage - 1) * DQ_REBUILT_PAGE_SIZE : 0;
    var pageEndIndex = Math.min(pageStartIndex + DQ_REBUILT_PAGE_SIZE, availableIssueCount);
    var pagedIssues = issues.slice(pageStartIndex, pageEndIndex);
    var issueRender = renderDqIssueTable(issuesBody, pagedIssues, DQ_RULE_FILTER.ALL, {
      limit: null,
      emptyMessageAll: "No strict DQ issues for current mappings."
    });

    if (totalNode) {
      totalNode.textContent = toLocale(totalIssues, 0, 0);
      totalNode.title = "Total strict diagnostics issues";
    }
    if (categoryNode) {
      categoryNode.textContent = toLocale(uncategorizedCount, 0, 0);
      categoryNode.title = "Missing category mapping issues (DQ003)";
    }
    if (ownerNode) {
      ownerNode.textContent = toLocale(unmappedOwnerCount, 0, 0);
      ownerNode.title = "Missing owner mapping issues (DQ004)";
    }
    if (metaNode) {
      metaNode.textContent =
        "Latest month: " +
        (model.latestMonth || "N/A") +
        " | Total strict issues: " +
        toLocale(totalIssues, 0, 0) +
        " | Missing category mappings: " +
        toLocale(uncategorizedCount, 0, 0) +
        " | Missing owner mappings: " +
        toLocale(unmappedOwnerCount, 0, 0) +
        ".";
    }
    if (issuesNote) {
      if (totalIssues <= 0) {
        issuesNote.textContent = "No strict DQ issues for current mappings.";
      } else if (availableIssueCount <= 0) {
        issuesNote.textContent = "Strict DQ summary exists, but no issue rows are available to inspect.";
      } else {
        issuesNote.textContent =
          "Showing rows " +
          toLocale(pageStartIndex + 1, 0, 0) +
          "-" +
          toLocale(pageEndIndex, 0, 0) +
          " of " +
          toLocale(availableIssueCount, 0, 0) +
          " strict issue rows listed below.";
      }
    }
    if (pageNode) {
      pageNode.textContent =
        "Page " +
        toLocale(currentPage, 0, 0) +
        " of " +
        toLocale(totalPages, 0, 0);
    }
    if (prevButton) {
      prevButton.disabled = currentPage <= 1 || availableIssueCount <= 0;
      prevButton.onclick = function () {
        if (dqRebuiltTableState.page <= 1) {
          return;
        }
        dqRebuiltTableState.page -= 1;
        if (lastRenderedModel) {
          renderDqSection(lastRenderedModel);
        }
      };
    }
    if (nextButton) {
      nextButton.disabled = currentPage >= totalPages || availableIssueCount <= 0;
      nextButton.onclick = function () {
        if (dqRebuiltTableState.page >= totalPages) {
          return;
        }
        dqRebuiltTableState.page += 1;
        if (lastRenderedModel) {
          renderDqSection(lastRenderedModel);
        }
      };
    }
  }

  function renderDqLegacySection(model) {
    var metaNode = document.getElementById("fo-dq-meta");
    var totalNode = document.getElementById("fo-dq-summary-total");
    var categoryNode = document.getElementById("fo-dq-summary-category");
    var ownerNode = document.getElementById("fo-dq-summary-owner");
    var issueFocusControlsNode = document.getElementById("fo-dq-rule-focus-controls");
    var issuesBody = document.getElementById("fo-dq-issues-body");
    var issuesNote = document.getElementById("fo-dq-issues-note");
    var mappingDriftBody = document.getElementById("fo-dq-mapping-drift-body");
    var mappingDriftMetaNode = document.getElementById("fo-dq-mapping-drift-meta");

    if (
      !metaNode &&
      !totalNode &&
      !categoryNode &&
      !ownerNode &&
      !issueFocusControlsNode &&
      !issuesBody &&
      !issuesNote &&
      !mappingDriftBody &&
      !mappingDriftMetaNode
    ) {
      return;
    }

    var dq = model && model.dq ? model.dq : {};
    var warningSummary = getOverviewWarningSummary(model);
    var totalIssues = warningSummary.total;
    var uncategorizedCount = warningSummary.uncategorizedCount;
    var unmappedOwnerCount = warningSummary.unmappedOwnerCount;
    var issues = Array.isArray(dq.issues) ? dq.issues : [];
    var activeRuleFilter = normalizeDqRuleFilter(dqIssueFilterState.ruleId);
    dqIssueFilterState.ruleId = activeRuleFilter;

    if (totalNode) {
      totalNode.textContent = toLocale(totalIssues, 0, 0);
      totalNode.title = "Total strict diagnostics issues";
    }
    if (categoryNode) {
      categoryNode.textContent = toLocale(uncategorizedCount, 0, 0);
      categoryNode.title = "Missing category mapping issues (DQ003)";
    }
    if (ownerNode) {
      ownerNode.textContent = toLocale(unmappedOwnerCount, 0, 0);
      ownerNode.title = "Missing owner mapping issues (DQ004)";
    }

    if (issueFocusControlsNode) {
      var focusButtons = Array.from(
        issueFocusControlsNode.querySelectorAll("button[data-fo-dq-rule-filter]")
      );
      focusButtons.forEach(function (button) {
        var buttonFilter = normalizeDqRuleFilter(button.dataset.foDqRuleFilter);
        var isActive = buttonFilter === activeRuleFilter;
        button.classList.toggle("primary", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.onclick = function () {
          var nextFilter = normalizeDqRuleFilter(button.dataset.foDqRuleFilter);
          if (dqIssueFilterState.ruleId === nextFilter) {
            return;
          }
          dqIssueFilterState.ruleId = nextFilter;
          if (lastRenderedModel) {
            renderDqSection(lastRenderedModel);
          }
        };
      });
    }

    var issueRender = renderDqIssueTable(issuesBody, issues, activeRuleFilter);
    var renderedIssueRows = issueRender.renderedRows;
    var filteredIssueCount = issueRender.filteredIssues;
    activeRuleFilter = issueRender.activeFilter;
    if (issuesNote) {
      if (totalIssues <= 0) {
        issuesNote.textContent = "No strict DQ issues for current mappings.";
      } else {
        var focusLabel =
          activeRuleFilter === DQ_RULE_FILTER.ALL
            ? "All rules"
            : activeRuleFilter + " (" + formatDqRuleLabel(activeRuleFilter) + ")";
        issuesNote.textContent =
          "Rule focus: " +
          focusLabel +
          " | Showing " +
          toLocale(renderedIssueRows, 0, 0) +
          " of " +
          toLocale(filteredIssueCount, 0, 0) +
          " matching issues (" +
          toLocale(totalIssues, 0, 0) +
          " total strict DQ issues).";
      }
    }

    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rawRows = normalizeRawExplorerRows(rawExplorer.rows);
    var categoryLookup = getCategoryLookupFromCurrentMappings();
    var driftProjection = buildCategoryMappingDriftProjection(rawRows, categoryLookup);
    renderCategoryMappingDriftTable(mappingDriftBody, driftProjection.rows);
    if (mappingDriftMetaNode) {
      mappingDriftMetaNode.textContent =
        "Scope: CardMovement rows by statement month using active category mappings." +
        " | MoM Δ Share = uncategorized share change vs previous month." +
        " | N/A reasons: Uncategorized Share => no CardMovement rows in month; MoM Δ Share => no previous month." +
        " | Months: " +
        toLocale(driftProjection.monthsCount, 0, 0) +
        ".";
    }

    if (metaNode) {
      metaNode.textContent =
        "Latest month: " +
        (model.latestMonth || "N/A") +
        " | Total DQ issues (strict): " +
        toLocale(totalIssues, 0, 0) +
        " | Uncategorized (strict): " +
        toLocale(uncategorizedCount, 0, 0) +
        " | Unmapped owners (strict): " +
        toLocale(unmappedOwnerCount, 0, 0) +
        " | Source tables: dq_summary_by_rule + dq_issues.";
    }
  }

  function renderDqSection(model) {
    renderDqRebuiltSection(model);
    renderDqLegacySection(model);
  }

  function monthKeyFromDate(value) {
    var text = String(value || "").trim();
    if (!text) {
      return "";
    }
    var match = /^(\d{4}-\d{2})/.exec(text);
    return match ? match[1] : text;
  }

  function rawText(value) {
    return String(value == null ? "" : value).trim();
  }

  function optionalInteger(value) {
    var text = rawText(value);
    if (!text) {
      return null;
    }
    var n = Number(text);
    if (!Number.isFinite(n)) {
      return null;
    }
    return Math.trunc(n);
  }

  function normalizeRawExplorerRows(rawRows) {
    if (!Array.isArray(rawRows)) {
      return [];
    }

    return rawRows.map(function (row) {
      var closeDate = rawText(row && row.cardStatementCloseDate);
      return {
        cardStatementCloseDate: closeDate,
        cardStatementDueDate: rawText(row && row.cardStatementDueDate),
        statementMonth: rawText(row && row.statementMonth) || monthKeyFromDate(closeDate),
        bank: rawText(row && row.bank),
        cardCompany: rawText(row && row.cardCompany),
        movementDate: rawText(row && row.movementDate),
        cardNumber: rawText(row && row.cardNumber),
        cardOwner: rawText(row && row.cardOwner),
        movementType: rawText(row && row.movementType),
        receiptNumber: rawText(row && row.receiptNumber),
        detail: rawText(row && row.detail),
        installmentCurrent: optionalInteger(row && row.installmentCurrent),
        installmentTotal: optionalInteger(row && row.installmentTotal),
        amountARS: toFiniteNumber(row && row.amountARS),
        amountUSD: toFiniteNumber(row && row.amountUSD)
      };
    });
  }

  function uniqueSorted(rows, key, desc) {
    var seen = new Set();
    var values = [];
    rows.forEach(function (row) {
      var value = rawText(row && row[key]);
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      values.push(value);
    });
    values.sort(function (a, b) {
      return desc ? b.localeCompare(a) : a.localeCompare(b);
    });
    return values;
  }

  function fillSelectOptions(selectNode, values, allLabel) {
    if (!selectNode) {
      return;
    }
    var previous = rawText(selectNode.value);
    selectNode.innerHTML = "";
    var defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = allLabel;
    selectNode.appendChild(defaultOption);

    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      selectNode.appendChild(option);
    });

    if (previous && values.includes(previous)) {
      selectNode.value = previous;
    } else {
      selectNode.value = "";
    }
  }

  function rawExplorerScopeKey(scopeKey) {
    var scope = rawText(scopeKey);
    return scope || "raw";
  }

  function rawExplorerId(scopeKey, suffix) {
    return "fo-" + rawExplorerScopeKey(scopeKey) + "-" + suffix;
  }

  function columnFilterInputId(scopeOrColumnKey, maybeColumnKey) {
    if (arguments.length < 2) {
      return "fo-raw-col-filter-" + rawText(scopeOrColumnKey);
    }
    var scope = rawExplorerScopeKey(scopeOrColumnKey);
    var columnKey = rawText(maybeColumnKey);
    if (scope === "raw") {
      return "fo-raw-col-filter-" + columnKey;
    }
    return "fo-" + scope + "-col-filter-" + columnKey;
  }

  function columnVisibilityInputId(scopeOrColumnKey, maybeColumnKey) {
    if (arguments.length < 2) {
      return "fo-raw-col-visible-" + rawText(scopeOrColumnKey);
    }
    var scope = rawExplorerScopeKey(scopeOrColumnKey);
    var columnKey = rawText(maybeColumnKey);
    if (scope === "raw") {
      return "fo-raw-col-visible-" + columnKey;
    }
    return "fo-" + scope + "-col-visible-" + columnKey;
  }

  function rawColumnFilterHaystack(row, column) {
    var value = row && row[column.key];
    if (column.kind === "integer") {
      return value == null ? "" : String(value).toLowerCase();
    }
    if (column.kind === "money_ars" || column.kind === "money_usd") {
      var amount = toFiniteNumber(value);
      return [
        String(amount),
        formatRawMoneyValue(amount),
        formatCompact(amount),
        toLocale(amount, 0, 0),
        toLocale(amount, 2, 2)
      ]
        .join(" ")
        .toLowerCase();
    }
    return rawText(value).toLowerCase();
  }

  function renderRawTableHead(head, columns, filterValues, scopeKey) {
    if (!head) {
      return {};
    }
    var visibleColumns = Array.isArray(columns) && columns.length ? columns : RAW_BASELINE_COLUMNS;
    var filters = filterValues || {};
    head.innerHTML = "";
    var tr = document.createElement("tr");
    var filtersRow = document.createElement("tr");
    var inputs = {};
    visibleColumns.forEach(function (column) {
      var th = document.createElement("th");
      th.textContent = column.label;
      tr.appendChild(th);

      var tdFilter = document.createElement("td");
      var input = document.createElement("input");
      input.type = "text";
      input.id = columnFilterInputId(scopeKey, column.key);
      input.className = "raw-col-filter-input";
      input.placeholder = "Filter";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Filter " + column.label);
      input.value = rawText(filters[column.key]);
      tdFilter.appendChild(input);
      filtersRow.appendChild(tdFilter);
      inputs[column.key] = input;
    });
    head.appendChild(tr);
    head.appendChild(filtersRow);
    return inputs;
  }

  function renderRawTableBody(body, rows, columns) {
    if (!body) {
      return;
    }
    var visibleColumns = Array.isArray(columns) && columns.length ? columns : RAW_BASELINE_COLUMNS;

    body.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = visibleColumns.length;
      td.textContent = "No rows match current filters.";
      empty.appendChild(td);
      body.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      visibleColumns.forEach(function (column) {
        var td = document.createElement("td");
        var value = row[column.key];
        if (column.kind === "integer") {
          td.textContent = value == null ? "" : toLocale(value, 0, 0);
        } else if (column.kind === "money_ars") {
          td.textContent = formatRawMoneyValue(toFiniteNumber(value));
          td.title = "ARS " + formatRawMoneyValue(toFiniteNumber(value));
        } else if (column.kind === "money_usd") {
          td.textContent = formatRawMoneyValue(toFiniteNumber(value));
          td.title = "USD " + formatRawMoneyValue(toFiniteNumber(value));
        } else {
          td.textContent = rawText(value);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function rawCsvCellValue(row, column) {
    if (!column) {
      return "";
    }
    var value = row && row[column.key];
    if (column.kind === "integer") {
      return value == null ? "" : String(value);
    }
    if (column.kind === "money_ars" || column.kind === "money_usd") {
      return formatFull(toFiniteNumber(value));
    }
    return rawText(value);
  }

  function escapeSemicolonCsvCell(value) {
    var text = String(value == null ? "" : value);
    if (/[;"\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function buildRawFilteredCsv(rows, columns) {
    var visibleColumns = Array.isArray(columns) && columns.length ? columns : RAW_BASELINE_COLUMNS;
    var filteredRows = Array.isArray(rows) ? rows : [];
    var header = visibleColumns.map(function (column) {
      return escapeSemicolonCsvCell(column.label);
    }).join(";");
    var lines = filteredRows.map(function (row) {
      return visibleColumns.map(function (column) {
        return escapeSemicolonCsvCell(rawCsvCellValue(row, column));
      }).join(";");
    });
    return [header].concat(lines).join("\n") + "\n";
  }

  function buildRawFilteredDownloadName() {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return "raw_data_filtered_" + stamp + ".csv";
  }

  function renderRawActiveFilters(node, entries, onRemove, onClearAll, scopeKey) {
    if (!node) {
      return;
    }
    var scope = rawExplorerScopeKey(scopeKey);
    var filters = Array.isArray(entries)
      ? entries.filter(function (entry) {
          return entry && rawText(entry.key) && rawText(entry.label);
        })
      : [];
    node.innerHTML = "";

    var label = document.createElement("span");
    label.className = "raw-active-filter-label";
    label.textContent = "Active filters:";
    node.appendChild(label);

    if (!filters.length) {
      var none = document.createElement("span");
      none.className = "raw-active-filter-none";
      none.textContent = "none";
      node.appendChild(none);
      return;
    }

    var chipContainer = document.createElement("div");
    chipContainer.className = "raw-active-filter-chips";
    filters.forEach(function (entry) {
      var key = rawText(entry.key);
      var labelText = rawText(entry.label);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "raw-active-filter-chip";
      chip.dataset.foRawFilterKey = key;
      chip.setAttribute("aria-label", "Remove filter " + labelText);
      chip.textContent = labelText + " ×";
      chip.addEventListener("click", function () {
        if (typeof onRemove === "function") {
          onRemove(key);
        }
      });
      chipContainer.appendChild(chip);
    });
    node.appendChild(chipContainer);

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.id =
      scope === "raw"
        ? "fo-raw-active-filters-clear"
        : rawExplorerId(scope, "active-filters-clear");
    clearButton.className = "btn raw-active-filter-clear";
    clearButton.textContent = "Clear all";
    clearButton.addEventListener("click", function () {
      if (typeof onClearAll === "function") {
        onClearAll();
      }
    });
    node.appendChild(clearButton);
  }

  function buildRawPaginationWindow(currentPage, totalPages) {
    var current = Math.max(1, Math.trunc(toFiniteNumber(currentPage) || 1));
    var total = Math.max(1, Math.trunc(toFiniteNumber(totalPages) || 1));
    if (total <= 7) {
      return Array.from({ length: total }, function (_, index) {
        return index + 1;
      });
    }

    var pages = [1];
    var start = Math.max(2, current - 1);
    var end = Math.min(total - 1, current + 1);

    if (current <= 3) {
      start = 2;
      end = Math.min(total - 1, 4);
    } else if (current >= total - 2) {
      start = Math.max(2, total - 3);
      end = total - 1;
    }

    if (start > 2) {
      pages.push(null);
    }
    for (var page = start; page <= end; page += 1) {
      pages.push(page);
    }
    if (end < total - 1) {
      pages.push(null);
    }
    pages.push(total);
    return pages;
  }

  function aggregateInstrumentRankingRows(rows, latestMonth, key) {
    var sums = Object.create(null);
    (rows || [])
      .filter(function (row) {
        return (
          row &&
          row.statementMonth === latestMonth &&
          rawText(row.movementType) === "CardMovement"
        );
      })
      .forEach(function (row) {
        var label = rawText(row[key]) || "Unknown";
        if (!sums[label]) {
          sums[label] = {
            label: label,
            amountARS: 0,
            amountUSD: 0,
            rows: 0
          };
        }
        var amountARS = Math.max(0, toFiniteNumber(row.amountARS));
        var amountUSD = Math.max(0, toFiniteNumber(row.amountUSD));
        if (amountARS <= 0 && amountUSD <= 0) {
          return;
        }
        sums[label].amountARS += amountARS;
        sums[label].amountUSD += amountUSD;
        sums[label].rows += 1;
      });
    return Object.values(sums)
      .sort(function (a, b) {
        var ars = b.amountARS - a.amountARS;
        if (ars !== 0) {
          return ars;
        }
        var usd = b.amountUSD - a.amountUSD;
        if (usd !== 0) {
          return usd;
        }
        var rowsCmp = b.rows - a.rows;
        if (rowsCmp !== 0) {
          return rowsCmp;
        }
        return a.label.localeCompare(b.label);
      })
      .slice(0, 10);
  }

  function paymentMethodFromMovementType(movementType) {
    var key = rawText(movementType).toLowerCase();
    if (!key) {
      return "Other";
    }
    if (key === "cardmovement" || key.indexOf("card") >= 0) {
      return "Card";
    }
    if (key.indexOf("transfer") >= 0 || key.indexOf("wire") >= 0 || key.indexOf("bank transfer") >= 0) {
      return "Transfer";
    }
    if (key.indexOf("cash") >= 0 || key.indexOf("efectivo") >= 0) {
      return "Cash";
    }
    return "Other";
  }

  function buildPaymentMethodSplitProjection(rows, latestMonth) {
    var grouped = Object.create(null);
    PAYMENT_METHOD_ORDER.forEach(function (method) {
      grouped[method] = {
        method: method,
        amountARS: 0,
        amountUSD: 0,
        shareARS: null,
        shareUSD: null,
        rows: 0
      };
    });

    var totalARS = 0;
    var totalUSD = 0;
    var totalRows = 0;
    var movementTypesSeen = new Set();

    (rows || []).forEach(function (row) {
      if (latestMonth && row.statementMonth !== latestMonth) {
        return;
      }
      var amountARS = Math.max(0, toFiniteNumber(row.amountARS));
      var amountUSD = Math.max(0, toFiniteNumber(row.amountUSD));
      if (amountARS <= 0 && amountUSD <= 0) {
        return;
      }
      totalARS += amountARS;
      totalUSD += amountUSD;
      totalRows += 1;
      var method = paymentMethodFromMovementType(row.movementType);
      var bucket = grouped[method] || grouped.Other;
      bucket.amountARS += amountARS;
      bucket.amountUSD += amountUSD;
      bucket.rows += 1;
      var movementType = rawText(row.movementType);
      if (movementType) {
        movementTypesSeen.add(movementType);
      }
    });

    var splitRows = PAYMENT_METHOD_ORDER.map(function (method) {
      var entry = grouped[method];
      entry.shareARS = totalARS > 0 ? entry.amountARS / totalARS : null;
      entry.shareUSD = totalUSD > 0 ? entry.amountUSD / totalUSD : null;
      return entry;
    });

    return {
      latestMonth: latestMonth || "",
      totalARS: totalARS,
      totalUSD: totalUSD,
      totalRows: totalRows,
      movementTypesSeen: Array.from(movementTypesSeen).sort(),
      rows: splitRows
    };
  }

  function renderPaymentMethodSplitTable(tbody, rows) {
    if (!tbody) {
      return;
    }
    var splitRows = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!splitRows.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"6\">No positive-amount rows for latest month.</td>";
      tbody.appendChild(empty);
      return;
    }
    splitRows.forEach(function (row) {
      var tr = document.createElement("tr");
      appendCell(tr, row.method || "Other");
      appendNumberCell(
        tr,
        toFiniteNumber(row.amountARS),
        "ARS",
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.ownerRankTable
      );
      appendPercentCell(tr, row.shareARS, true, "", NA_REASON.SHARE_ZERO_TOTAL);
      appendNumberCell(
        tr,
        toFiniteNumber(row.amountUSD),
        "USD",
        false,
        true,
        undefined,
        VIEW_NUMBER_FORMAT_POLICY.ownerRankTable
      );
      appendPercentCell(tr, row.shareUSD, true, "", NA_REASON.SHARE_ZERO_TOTAL);
      appendCell(tr, toLocale(toFiniteNumber(row.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
  }

  function renderPaymentMethodSplitSection(model, rows, available) {
    var body = document.getElementById("fo-payment-method-split-body");
    var metaNode = document.getElementById("fo-payment-method-split-meta");
    if (!body && !metaNode) {
      return;
    }
    if (!available || !Array.isArray(rows) || rows.length === 0) {
      renderPaymentMethodSplitTable(body, []);
      if (metaNode) {
        metaNode.textContent = "No strict runtime rows available for payment method split.";
      }
      return;
    }
    var latestMonth = rawText(model && model.latestMonth);
    var projection = buildPaymentMethodSplitProjection(rows, latestMonth);
    renderPaymentMethodSplitTable(body, projection.rows);
    if (metaNode) {
      metaNode.textContent =
        "Latest month: " +
        (projection.latestMonth || "N/A") +
        " | Scope: positive-amount rows in strict raw explorer." +
        " | Mapping: CardMovement/card* -> Card, transfer* -> Transfer, cash* -> Cash, else Other." +
        " | N/A share means total positive amount for a currency is 0 in this scope." +
        " | Rows considered: " +
        toLocale(projection.totalRows, 0, 0) +
        "." +
        " | Movement types seen: " +
        (projection.movementTypesSeen.length ? projection.movementTypesSeen.join(", ") : "none") +
        ".";
    }
  }

  function renderInstrumentRankingTable(tbody, rows, emptyLabel) {
    if (!tbody) {
      return;
    }
    var ranking = Array.isArray(rows) ? rows : [];
    tbody.innerHTML = "";
    if (!ranking.length) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="5">' + String(emptyLabel || "No data") + "</td>";
      tbody.appendChild(empty);
      return;
    }
    ranking.forEach(function (row, index) {
      var tr = document.createElement("tr");
      appendCell(tr, String(index + 1));
      appendCell(tr, row.label || "Unknown");
      appendNumberCell(tr, toFiniteNumber(row.amountARS), "ARS", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.ownerRankTable);
      appendNumberCell(tr, toFiniteNumber(row.amountUSD), "USD", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.ownerRankTable);
      appendCell(tr, toLocale(toFiniteNumber(row.rows), 0, 0), "num");
      tbody.appendChild(tr);
    });
  }

  function renderCardInstrumentRankingSection(model, rows, available) {
    var companyBody = document.getElementById("fo-card-company-ranking-body");
    var numberBody = document.getElementById("fo-card-number-ranking-body");
    var metaNode = document.getElementById("fo-card-instrument-meta");
    if (!companyBody && !numberBody && !metaNode) {
      return;
    }
    var latestMonth = rawText(model && model.latestMonth);
    if (!available || !Array.isArray(rows) || rows.length === 0) {
      renderInstrumentRankingTable(companyBody, [], "No strict runtime rows available.");
      renderInstrumentRankingTable(numberBody, [], "No strict runtime rows available.");
      if (metaNode) {
        metaNode.textContent = "No strict runtime rows available for card/company ranking.";
      }
      return;
    }
    var topCompanies = aggregateInstrumentRankingRows(rows, latestMonth, "cardCompany");
    var topCardNumbers = aggregateInstrumentRankingRows(rows, latestMonth, "cardNumber");
    renderInstrumentRankingTable(companyBody, topCompanies, "No ranked card companies for latest month.");
    renderInstrumentRankingTable(numberBody, topCardNumbers, "No ranked card numbers for latest month.");
    if (metaNode) {
      var topCompany = topCompanies.length ? topCompanies[0] : null;
      var topCardNumber = topCardNumbers.length ? topCardNumbers[0] : null;
      metaNode.textContent =
        "Latest month: " +
        (latestMonth || "N/A") +
        " | Scope: CardMovement-only, positive amounts, strict raw explorer." +
        " | Sort: Amount ARS desc (tie: Amount USD desc)." +
        " | Top company: " +
        (topCompany ? topCompany.label + " (ARS " + formatCompact(topCompany.amountARS) + ")" : "No data") +
        " | Top card number: " +
        (topCardNumber
          ? topCardNumber.label + " (ARS " + formatCompact(topCardNumber.amountARS) + ")"
          : "No data");
    }
  }

  function renderRawExplorerSection(model, rows, available, options) {
    var config = options || {};
    var scopeKey = rawExplorerScopeKey(config.scopeKey);
    var tableHead = document.getElementById(rawExplorerId(scopeKey, "head"));
    var tableBody = document.getElementById(rawExplorerId(scopeKey, "body"));
    var metaNode = document.getElementById(rawExplorerId(scopeKey, "meta"));
    var activeFiltersNode = document.getElementById(rawExplorerId(scopeKey, "active-filters"));
    var monthSelect = document.getElementById(rawExplorerId(scopeKey, "filter-month"));
    var ownerSelect = document.getElementById(rawExplorerId(scopeKey, "filter-owner"));
    var typeSelect = document.getElementById(rawExplorerId(scopeKey, "filter-type"));
    var columnControlsNode = document.getElementById(rawExplorerId(scopeKey, "column-controls"));
    var columnControlsDetailsNode = document.getElementById(rawExplorerId(scopeKey, "column-controls-details"));
    var columnControlsSummaryNode = document.getElementById(rawExplorerId(scopeKey, "column-controls-summary"));
    var compactColumnsPresetButton = document.getElementById(rawExplorerId(scopeKey, "columns-preset-compact"));
    var allColumnsPresetButton = document.getElementById(rawExplorerId(scopeKey, "columns-preset-all"));
    var resetButton = document.getElementById(rawExplorerId(scopeKey, "filter-reset"));
    var downloadFilteredButton = document.getElementById(rawExplorerId(scopeKey, "download-filtered-btn"));
    var prevButton = document.getElementById(rawExplorerId(scopeKey, "prev"));
    var nextButton = document.getElementById(rawExplorerId(scopeKey, "next"));
    var pageStripNode = document.getElementById(rawExplorerId(scopeKey, "page-strip"));
    var paginationEnabled = Boolean(prevButton || nextButton || pageStripNode);
    var pageSize = Number.isFinite(config.pageSize) && config.pageSize > 0 ? config.pageSize : null;
    var paginationState = config.paginationState || { page: 1 };

    if (
      !tableHead &&
      !tableBody &&
      !metaNode &&
      !activeFiltersNode &&
      !monthSelect &&
      !ownerSelect &&
      !typeSelect &&
      !columnControlsNode &&
      !columnControlsDetailsNode &&
      !columnControlsSummaryNode &&
      !compactColumnsPresetButton &&
      !allColumnsPresetButton &&
      !resetButton &&
      !downloadFilteredButton &&
      !prevButton &&
      !nextButton &&
      !pageStripNode
    ) {
      return;
    }

    var columnFilterInputs = {};
    var columnVisibilityInputs = {};
    var visibleColumns = RAW_BASELINE_COLUMNS.slice();
    var columnFilterValues = {};
    var lastFilteredRows = [];
    var lastVisibleColumns = visibleColumns.slice();

    var renderColumnVisibilityControls = function () {
      if (!columnControlsNode) {
        return;
      }
      var previous = {};
      RAW_BASELINE_COLUMNS.forEach(function (column) {
        var input = columnVisibilityInputs[column.key];
        previous[column.key] = input ? input.checked : true;
      });
      columnControlsNode.innerHTML = "";
      RAW_BASELINE_COLUMNS.forEach(function (column) {
        var wrapper = document.createElement("label");
        wrapper.className = "raw-col-visibility";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.id = columnVisibilityInputId(scopeKey, column.key);
        input.checked = previous[column.key] !== false;
        var text = document.createElement("span");
        text.textContent = column.label;
        wrapper.appendChild(input);
        wrapper.appendChild(text);
        columnControlsNode.appendChild(wrapper);
        columnVisibilityInputs[column.key] = input;
      });
    };

    var readVisibleColumns = function () {
      var selected = [];
      RAW_BASELINE_COLUMNS.forEach(function (column) {
        var input = columnVisibilityInputs[column.key];
        var isVisible = !input || input.checked;
        if (isVisible) {
          selected.push(column);
        }
      });
      return selected.length ? selected : RAW_BASELINE_COLUMNS.slice(0, 1);
    };

    var syncColumnFilterValues = function () {
      Object.keys(columnFilterInputs).forEach(function (key) {
        columnFilterValues[key] = rawText(columnFilterInputs[key] && columnFilterInputs[key].value);
      });
    };

    var updateColumnControlsSummary = function (activeColumnFilterCount) {
      if (!columnControlsSummaryNode) {
        return;
      }
      var totalColumns = RAW_BASELINE_COLUMNS.length;
      var visibleCount = visibleColumns.length || totalColumns;
      var hiddenCount = Math.max(0, totalColumns - visibleCount);
      var parts = [
        "Columns: " + toLocale(visibleCount, 0, 0) + "/" + toLocale(totalColumns, 0, 0) + " visible"
      ];
      if (hiddenCount > 0) {
        parts.push(toLocale(hiddenCount, 0, 0) + " hidden");
      }
      if (activeColumnFilterCount > 0) {
        parts.push(toLocale(activeColumnFilterCount, 0, 0) + " column filters");
      }
      columnControlsSummaryNode.textContent = parts.join(" | ");
    };

    var bindColumnFilterInputs = function (listener) {
      visibleColumns.forEach(function (column) {
        var input = columnFilterInputs[column.key];
        if (!input || input.dataset.foRawBound) {
          return;
        }
        input.addEventListener("input", listener);
        input.dataset.foRawBound = "1";
      });
    };

    var rebuildRawHead = function (listener) {
      syncColumnFilterValues();
      visibleColumns = readVisibleColumns();
      var visibleKeys = new Set(
        visibleColumns.map(function (column) {
          return column.key;
        })
      );
      RAW_BASELINE_COLUMNS.forEach(function (column) {
        if (!visibleKeys.has(column.key)) {
          columnFilterValues[column.key] = "";
        }
      });
      columnFilterInputs = renderRawTableHead(tableHead, visibleColumns, columnFilterValues, scopeKey);
      bindColumnFilterInputs(listener);
    };

    var applyVisibilityPreset = function (visibleKeys, listener) {
      RAW_BASELINE_COLUMNS.forEach(function (column) {
        var visibilityInput = columnVisibilityInputs[column.key];
        if (!visibilityInput) {
          return;
        }
        visibilityInput.checked = visibleKeys.has(column.key);
      });
      var anyChecked = RAW_BASELINE_COLUMNS.some(function (column) {
        var visibilityInput = columnVisibilityInputs[column.key];
        return visibilityInput && visibilityInput.checked;
      });
      if (!anyChecked) {
        var first = RAW_BASELINE_COLUMNS[0];
        if (first) {
          var firstInput = columnVisibilityInputs[first.key];
          if (firstInput) {
            firstInput.checked = true;
          }
        }
      }
      rebuildRawHead(listener);
      listener();
    };

    var resetPagination = function () {
      if (paginationEnabled) {
        paginationState.page = 1;
      }
    };

    renderColumnVisibilityControls();
    columnFilterInputs = renderRawTableHead(tableHead, visibleColumns, columnFilterValues, scopeKey);

    if (!available || rows.length === 0) {
      fillSelectOptions(monthSelect, [], "All months");
      fillSelectOptions(ownerSelect, [], "All owners");
      fillSelectOptions(typeSelect, [], "All movement types");
      renderRawTableBody(tableBody, [], visibleColumns);
      if (activeFiltersNode) {
        renderRawActiveFilters(activeFiltersNode, [], null, null, scopeKey);
      }
      if (pageStripNode) {
        pageStripNode.innerHTML = "";
      }
      if (prevButton) {
        prevButton.disabled = true;
      }
      if (nextButton) {
        nextButton.disabled = true;
      }
      if (metaNode) {
        metaNode.textContent = "No strict runtime rows available for Raw Explorer.";
      }
      updateColumnControlsSummary(0);
      return;
    }

    fillSelectOptions(monthSelect, uniqueSorted(rows, "statementMonth", true), "All months");
    fillSelectOptions(ownerSelect, uniqueSorted(rows, "cardOwner", false), "All owners");
    fillSelectOptions(typeSelect, uniqueSorted(rows, "movementType", false), "All movement types");

    var renderPaginationStrip = function (currentPage, totalPages) {
      if (!pageStripNode) {
        return;
      }
      pageStripNode.innerHTML = "";
      buildRawPaginationWindow(currentPage, totalPages).forEach(function (entry) {
        if (entry == null) {
          var ellipsis = document.createElement("span");
          ellipsis.className = "raw-page-ellipsis";
          ellipsis.setAttribute("aria-hidden", "true");
          ellipsis.textContent = "…";
          pageStripNode.appendChild(ellipsis);
          return;
        }
        var button = document.createElement("button");
        button.type = "button";
        button.className = "raw-page-chip";
        button.dataset.foRawPage = String(entry);
        button.textContent = String(entry);
        if (entry === currentPage) {
          button.setAttribute("aria-current", "page");
        }
        pageStripNode.appendChild(button);
      });
    };

    var readColumnFilters = function () {
      var filters = {};
      visibleColumns.forEach(function (column) {
        var value = rawText(columnFilterInputs[column.key] && columnFilterInputs[column.key].value).toLowerCase();
        filters[column.key] = value;
        columnFilterValues[column.key] = value;
      });
      return filters;
    };

    var applyFilters = function (options) {
      var preservePage = Boolean(options && options.preservePage);
      if (!preservePage) {
        resetPagination();
      }

      var selectedMonth = rawText(monthSelect && monthSelect.value);
      var selectedOwner = rawText(ownerSelect && ownerSelect.value);
      var selectedType = rawText(typeSelect && typeSelect.value);
      var columnFilters = readColumnFilters();
      var activeColumnFilterCount = Object.values(columnFilters).filter(function (value) {
        return Boolean(value);
      }).length;
      updateColumnControlsSummary(activeColumnFilterCount);
      var activeFilterEntries = [];
      if (selectedMonth) {
        activeFilterEntries.push({
          key: "month",
          label: "Statement Month: " + selectedMonth
        });
      }
      if (selectedOwner) {
        activeFilterEntries.push({
          key: "owner",
          label: "Card Owner: " + selectedOwner
        });
      }
      if (selectedType) {
        activeFilterEntries.push({
          key: "type",
          label: "Movement Type: " + selectedType
        });
      }
      visibleColumns.forEach(function (column) {
        var needle = rawText(columnFilters[column.key]);
        if (!needle) {
          return;
        }
        activeFilterEntries.push({
          key: "column:" + column.key,
          label: column.label + ": " + needle
        });
      });

      var filtered = rows.filter(function (row) {
        if (selectedMonth && row.statementMonth !== selectedMonth) {
          return false;
        }
        if (selectedOwner && row.cardOwner !== selectedOwner) {
          return false;
        }
        if (selectedType && row.movementType !== selectedType) {
          return false;
        }
        for (var i = 0; i < visibleColumns.length; i++) {
          var column = visibleColumns[i];
          var needle = columnFilters[column.key];
          if (!needle) {
            continue;
          }
          if (rawColumnFilterHaystack(row, column).indexOf(needle) === -1) {
            return false;
          }
        }
        return true;
      });

      lastFilteredRows = filtered.slice();
      lastVisibleColumns = visibleColumns.slice();

      var pagedRows = filtered;
      var totalPages = 1;
      var pageStartIndex = filtered.length > 0 ? 0 : 0;
      var pageEndIndex = filtered.length;
      if (paginationEnabled && pageSize) {
        totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        if (!Number.isFinite(paginationState.page) || paginationState.page < 1) {
          paginationState.page = 1;
        }
        if (paginationState.page > totalPages) {
          paginationState.page = totalPages;
        }
        pageStartIndex = filtered.length > 0 ? (paginationState.page - 1) * pageSize : 0;
        pageEndIndex = Math.min(pageStartIndex + pageSize, filtered.length);
        pagedRows = filtered.slice(pageStartIndex, pageEndIndex);
      }

      renderRawTableBody(tableBody, pagedRows, visibleColumns);
      if (activeFiltersNode) {
        renderRawActiveFilters(
          activeFiltersNode,
          activeFilterEntries,
          function (filterKey) {
            var key = rawText(filterKey);
            if (!key) {
              return;
            }
            if (key === "month" && monthSelect) {
              monthSelect.value = "";
            } else if (key === "owner" && ownerSelect) {
              ownerSelect.value = "";
            } else if (key === "type" && typeSelect) {
              typeSelect.value = "";
            } else if (key.indexOf("column:") === 0) {
              var columnKey = key.slice("column:".length);
              columnFilterValues[columnKey] = "";
              var input = columnFilterInputs[columnKey];
              if (input) {
                input.value = "";
              }
            }
            applyFilters();
          },
          function () {
            if (monthSelect) {
              monthSelect.value = "";
            }
            if (ownerSelect) {
              ownerSelect.value = "";
            }
            if (typeSelect) {
              typeSelect.value = "";
            }
            RAW_BASELINE_COLUMNS.forEach(function (column) {
              columnFilterValues[column.key] = "";
              var input = columnFilterInputs[column.key];
              if (input) {
                input.value = "";
              }
            });
            applyFilters();
          },
          scopeKey
        );
      }

      if (paginationEnabled && pageSize) {
        renderPaginationStrip(paginationState.page, totalPages);
        if (prevButton) {
          prevButton.disabled = paginationState.page <= 1;
        }
        if (nextButton) {
          nextButton.disabled = paginationState.page >= totalPages;
        }
      }

      if (metaNode) {
        if (paginationEnabled && pageSize) {
          metaNode.textContent =
            "Showing rows " +
            (filtered.length > 0 ? toLocale(pageStartIndex + 1, 0, 0) : "0") +
            "-" +
            toLocale(pageEndIndex, 0, 0) +
            " of " +
            toLocale(filtered.length, 0, 0) +
            " filtered rows (strict runtime)." +
            (activeColumnFilterCount > 0
              ? " Column filters active: " + toLocale(activeColumnFilterCount, 0, 0) + "."
              : "") +
            " Visible columns: " +
            toLocale(visibleColumns.length, 0, 0) +
            " of " +
            toLocale(RAW_BASELINE_COLUMNS.length, 0, 0) +
            ".";
        } else {
          metaNode.textContent =
            "Showing " +
            toLocale(filtered.length, 0, 0) +
            " of " +
            toLocale(rows.length, 0, 0) +
            " rows (strict runtime)." +
            (activeColumnFilterCount > 0
              ? " Column filters active: " + toLocale(activeColumnFilterCount, 0, 0) + "."
              : "") +
            " Visible columns: " +
            toLocale(visibleColumns.length, 0, 0) +
            " of " +
            toLocale(RAW_BASELINE_COLUMNS.length, 0, 0) +
            ".";
        }
      }

      if (downloadFilteredButton) {
        downloadFilteredButton.disabled = filtered.length === 0;
        downloadFilteredButton.title =
          filtered.length === 0
            ? "No rows match current filters."
            : "Download the currently filtered raw movements as CSV.";
      }
    };

    rebuildRawHead(applyFilters);

    if (monthSelect && !monthSelect.dataset.foRawBound) {
      monthSelect.addEventListener("change", applyFilters);
      monthSelect.dataset.foRawBound = "1";
    }
    if (ownerSelect && !ownerSelect.dataset.foRawBound) {
      ownerSelect.addEventListener("change", applyFilters);
      ownerSelect.dataset.foRawBound = "1";
    }
    if (typeSelect && !typeSelect.dataset.foRawBound) {
      typeSelect.addEventListener("change", applyFilters);
      typeSelect.dataset.foRawBound = "1";
    }
    RAW_BASELINE_COLUMNS.forEach(function (column) {
      var input = columnVisibilityInputs[column.key];
      if (!input || input.dataset.foRawBound) {
        return;
      }
      input.addEventListener("change", function () {
        var anyChecked = RAW_BASELINE_COLUMNS.some(function (candidate) {
          var candidateInput = columnVisibilityInputs[candidate.key];
          return candidateInput && candidateInput.checked;
        });
        if (!anyChecked) {
          input.checked = true;
          return;
        }
        rebuildRawHead(applyFilters);
        applyFilters();
      });
      input.dataset.foRawBound = "1";
    });
    if (compactColumnsPresetButton && !compactColumnsPresetButton.dataset.foRawBound) {
      compactColumnsPresetButton.addEventListener("click", function () {
        applyVisibilityPreset(new Set(RAW_COLUMN_COMPACT_KEYS), applyFilters);
        if (columnControlsDetailsNode) {
          columnControlsDetailsNode.open = true;
        }
      });
      compactColumnsPresetButton.dataset.foRawBound = "1";
    }
    if (allColumnsPresetButton && !allColumnsPresetButton.dataset.foRawBound) {
      allColumnsPresetButton.addEventListener("click", function () {
        applyVisibilityPreset(
          new Set(
            RAW_BASELINE_COLUMNS.map(function (column) {
              return column.key;
            })
          ),
          applyFilters
        );
        if (columnControlsDetailsNode) {
          columnControlsDetailsNode.open = true;
        }
      });
      allColumnsPresetButton.dataset.foRawBound = "1";
    }
    if (resetButton && !resetButton.dataset.foRawBound) {
      resetButton.addEventListener("click", function () {
        if (monthSelect) {
          monthSelect.value = "";
        }
        if (ownerSelect) {
          ownerSelect.value = "";
        }
        if (typeSelect) {
          typeSelect.value = "";
        }
        RAW_BASELINE_COLUMNS.forEach(function (column) {
          var visibilityInput = columnVisibilityInputs[column.key];
          if (visibilityInput) {
            visibilityInput.checked = true;
          }
          columnFilterValues[column.key] = "";
        });
        rebuildRawHead(applyFilters);
        RAW_BASELINE_COLUMNS.forEach(function (column) {
          var input = columnFilterInputs[column.key];
          if (input) {
            input.value = "";
          }
        });
        applyFilters();
      });
      resetButton.dataset.foRawBound = "1";
    }
    if (downloadFilteredButton && !downloadFilteredButton.dataset.foRawBound) {
      downloadFilteredButton.addEventListener("click", function () {
        if (!lastFilteredRows.length) {
          return;
        }
        downloadTextFile(
          buildRawFilteredCsv(lastFilteredRows, lastVisibleColumns),
          buildRawFilteredDownloadName(),
          "text/csv;charset=utf-8;"
        );
      });
      downloadFilteredButton.dataset.foRawBound = "1";
    }
    if (paginationEnabled && prevButton && !prevButton.dataset.foRawBound) {
      prevButton.addEventListener("click", function () {
        if (paginationState.page <= 1) {
          return;
        }
        paginationState.page -= 1;
        applyFilters({ preservePage: true });
      });
      prevButton.dataset.foRawBound = "1";
    }
    if (paginationEnabled && nextButton && !nextButton.dataset.foRawBound) {
      nextButton.addEventListener("click", function () {
        paginationState.page += 1;
        applyFilters({ preservePage: true });
      });
      nextButton.dataset.foRawBound = "1";
    }
    if (paginationEnabled && pageStripNode && !pageStripNode.dataset.foRawBound) {
      pageStripNode.addEventListener("click", function (event) {
        var target = event.target && event.target.closest("[data-fo-raw-page]");
        if (!target) {
          return;
        }
        var targetPage = Number(target.dataset.foRawPage);
        if (!Number.isFinite(targetPage)) {
          return;
        }
        paginationState.page = Math.max(1, Math.trunc(targetPage));
        applyFilters({ preservePage: true });
      });
      pageStripNode.dataset.foRawBound = "1";
    }

    applyFilters();
  }

  function renderRawSection(model) {
    var paymentMethodSplitBody = document.getElementById("fo-payment-method-split-body");
    var paymentMethodSplitMetaNode = document.getElementById("fo-payment-method-split-meta");
    var rawExplorer = model && model.rawExplorer ? model.rawExplorer : {};
    var rows = normalizeRawExplorerRows(rawExplorer.rows);

    if (paymentMethodSplitBody || paymentMethodSplitMetaNode) {
      renderPaymentMethodSplitSection(model, rows, rawExplorer.available);
      renderCardInstrumentRankingSection(model, rows, rawExplorer.available);
    }

    renderRawExplorerSection(model, rows, rawExplorer.available, {
      scopeKey: "raw-new",
      pageSize: RAW_REBUILT_PAGE_SIZE,
      paginationState: rawRebuiltTableState
    });
    renderRawExplorerSection(model, rows, rawExplorer.available, {
      scopeKey: "raw"
    });
  }

  function renderCombinedKpiTable(table, model, labels, options) {
    ensureNode(table, "Overview KPI table");
    var body = table.querySelector("tbody");
    ensureNode(body, "Overview KPI tbody");
    var metricHelpByKey = options && options.metricHelpByKey ? options.metricHelpByKey : null;

    var defs = [
      { key: "netStatement", label: "Net statement" },
      { key: "cardMovements", label: "Card movements" },
      { key: "newDebt", label: "New debt" },
      { key: "carryOverDebt", label: "Carry over debt" },
      { key: "nextMonthDebt", label: labels.nextMonth },
      { key: "remainingDebt", label: labels.remaining },
      { key: "taxes", label: "Taxes" },
      { key: "pastPayments", label: labels.past }
    ];

    body.innerHTML = "";
    defs.forEach(function (def) {
      var ar = computeDiff(model, "ARS", def.key);
      var us = computeDiff(model, "USD", def.key);
      var toneAr = semanticClass(def.key, ar.delta);
      var toneUs = semanticClass(def.key, us.delta);
      var tr = document.createElement("tr");
      appendMetricCell(tr, def, metricHelpByKey);
      appendNumberCell(tr, ar.latest, "ARS", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendNumberCell(tr, ar.prev, "ARS", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendNumberCell(tr, ar.delta, "ARS", true, false, toneAr, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendPercentCell(tr, ar.deltaPct, false, toneAr, NA_REASON.DELTA_PCT_PREV_ZERO);
      appendNumberCell(tr, us.latest, "USD", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendNumberCell(tr, us.prev, "USD", false, false, undefined, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendNumberCell(tr, us.delta, "USD", true, false, toneUs, VIEW_NUMBER_FORMAT_POLICY.overviewTable);
      appendPercentCell(tr, us.deltaPct, false, toneUs, NA_REASON.DELTA_PCT_PREV_ZERO);
      body.appendChild(tr);
    });
  }

  function appendMetricCell(tr, def, metricHelpByKey) {
    var td = document.createElement("td");
    td.classList.add("metric");
    var helpText = metricHelpByKey && metricHelpByKey[def.key] ? String(metricHelpByKey[def.key]) : "";
    if (!helpText) {
      td.textContent = def.label;
      tr.appendChild(td);
      return;
    }

    td.appendChild(buildMetricHelpWrap(def.label, helpText));
    tr.appendChild(td);
  }

  function buildMetricHelpWrap(labelText, helpText) {
    var wrap = document.createElement("span");
    wrap.className = "fo-metric-help-wrap";

    var label = document.createElement("span");
    label.className = "fo-metric-help-label";
    label.textContent = labelText;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "fo-metric-help";
    button.textContent = "i";
    button.setAttribute("aria-label", labelText + ": " + helpText);
    button.setAttribute("aria-expanded", "false");

    var tooltip = document.createElement("span");
    tooltip.className = "fo-metric-help-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.textContent = helpText;

    wrap.appendChild(label);
    wrap.appendChild(button);
    wrap.appendChild(tooltip);
    return wrap;
  }

  function computeDiff(model, currency, key) {
    var latest = model.latest.currency[currency][key] || 0;
    var prev = model.prev.currency[currency][key] || 0;
    var delta = latest - prev;
    var deltaPct = prev === 0 ? null : delta / prev;
    return { latest: latest, prev: prev, delta: delta, deltaPct: deltaPct };
  }

  function formatOverviewAnswerDelta(diff) {
    var latest = toFiniteNumber(diff && diff.latest);
    var prev = toFiniteNumber(diff && diff.prev);
    var delta = toFiniteNumber(diff && diff.delta);
    var deltaPct = diff ? diff.deltaPct : null;
    if (!delta && !latest && !prev) {
      return "flat vs prev";
    }
    if (!delta) {
      return "flat vs prev";
    }
    if (deltaPct == null) {
      if (prev === 0) {
        return latest === 0 ? "flat vs prev" : "prev was 0";
      }
      return (delta > 0 ? "up " : "down ") + formatCompact(Math.abs(delta)) + " vs prev";
    }
    return (delta > 0 ? "up " : "down ") + formatPercent(Math.abs(deltaPct * 100)) + " vs prev";
  }

  function appendCell(tr, value, klass) {
    var td = document.createElement("td");
    if (klass) {
      td.classList.add(klass);
    }
    td.textContent = value;
    tr.appendChild(td);
  }

  function normalizeNumberFormatMode(mode) {
    return mode === NUMBER_FORMAT_MODE.FULL ? NUMBER_FORMAT_MODE.FULL : NUMBER_FORMAT_MODE.COMPACT;
  }

  function formatNumberByMode(value, mode) {
    if (normalizeNumberFormatMode(mode) === NUMBER_FORMAT_MODE.FULL) {
      return formatFull(value);
    }
    return formatCompact(value);
  }

  function formatChartTickValue(value) {
    return formatNumberByMode(Number(value), CHART_NUMBER_FORMAT_POLICY.yAxisTicks);
  }

  function formatChartTooltipValue(value) {
    return formatNumberByMode(toFiniteNumber(value), CHART_NUMBER_FORMAT_POLICY.tooltipValues);
  }

  function formatRawMoneyValue(value) {
    return formatNumberByMode(toFiniteNumber(value), RAW_NUMBER_FORMAT_POLICY.amountCells);
  }

  function appendNumberCell(tr, value, currency, isDelta, rightAligned, semanticTone, formatMode) {
    var td = document.createElement("td");
    if (rightAligned) {
      td.classList.add("num");
    }
    if (isDelta && semanticTone) {
      td.classList.add(semanticTone);
    }
    td.textContent = formatNumberByMode(value, formatMode || VIEW_NUMBER_FORMAT_POLICY.default);
    td.title = currency + " " + formatFull(value);
    if (isDelta && semanticTone) {
      applySemanticCue(td, semanticTone);
    }
    tr.appendChild(td);
  }

  function appendPercentCell(tr, ratio, rightAligned, semanticTone, naReason) {
    var td = document.createElement("td");
    if (rightAligned) {
      td.classList.add("num");
    }
    if (ratio == null) {
      td.textContent = "N/A";
      td.title = String(naReason || NA_REASON.DELTA_PCT_PREV_ZERO);
    } else {
      var pct = ratio * 100;
      if (semanticTone) {
        td.classList.add(semanticTone);
      }
      td.textContent = formatPercent(pct);
      td.title = formatPercent(pct);
    }
    if (semanticTone) {
      applySemanticCue(td, semanticTone);
    }
    tr.appendChild(td);
  }

  function semanticToneLabel(semanticTone) {
    if (semanticTone === "fo-cell-pos") {
      return "improving";
    }
    if (semanticTone === "fo-cell-neg") {
      return "worsening";
    }
    return "neutral";
  }

  function applySemanticCue(td, semanticTone) {
    if (!td) {
      return;
    }
    td.classList.add("fo-semantic-cue");
    var toneLabel = semanticToneLabel(semanticTone);
    td.dataset.foSemanticTone = toneLabel;
    var rawLabel = rawText(td.getAttribute("aria-label")) || rawText(td.textContent);
    var ariaLabel = rawLabel ? rawLabel + " (" + toneLabel + ")" : toneLabel;
    td.setAttribute("aria-label", ariaLabel);
  }

  function toggleDqReviewAction(visible) {
    var cta = document.getElementById("fo-dq-review-link");
    if (!cta) {
      return;
    }
    if (!cta.dataset.foBound) {
      cta.dataset.foBound = "true";
      cta.addEventListener("click", function () {
        var dqPageId = resolvePreferredPageId("dq");
        var dqButton = dqPageId
          ? document.querySelector('.nav button[data-page="' + dqPageId + '"]')
          : null;
        if (!dqButton) {
          return;
        }
        dqButton.click();
        var dqSection = dqPageId ? document.getElementById(dqPageId) : null;
        if (dqSection && typeof dqSection.scrollIntoView === "function") {
          dqSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
    cta.classList.toggle("is-hidden", !visible);
  }

  function renderLatestMonthLabel(node, model, verbose) {
    if (!node) {
      return;
    }
    var warningSummary = getOverviewWarningSummary(model);
    var totalWarnings = warningSummary.total;
    var uncategorizedCount = warningSummary.uncategorizedCount;
    var unmappedOwnerCount = warningSummary.unmappedOwnerCount;
    var monthNoteNode = document.getElementById("fo-latest-month-note");
    node.textContent = model.latestMonth || "N/A";
    if (monthNoteNode) {
      monthNoteNode.textContent = "(CloseDate)";
    }
    renderTopbarDqSummary({
      totalWarnings: totalWarnings,
      uncategorizedCount: uncategorizedCount,
      unmappedOwnerCount: unmappedOwnerCount
    });
    node.title =
      "Latest: " +
      model.latestMonth +
      " | Previous: " +
      (model.prevMonth || "N/A") +
      " | Data quality warnings: " +
      totalWarnings +
      " | Uncategorized movements (DQ003): " +
      uncategorizedCount +
      " | Unmapped owners (DQ004): " +
      unmappedOwnerCount;
  }

  function renderTopbarDqSummary(summary) {
    var summaryNode = document.getElementById("fo-topbar-dq-summary");
    if (!summaryNode) {
      return;
    }
    var totalWarnings = toFiniteNumber(summary && summary.totalWarnings);
    var uncategorizedCount = toFiniteNumber(summary && summary.uncategorizedCount);
    var unmappedOwnerCount = toFiniteNumber(summary && summary.unmappedOwnerCount);
    var hasWarnings = totalWarnings > 0;
    summaryNode.textContent =
      toLocale(totalWarnings, 0, 0) +
      " (Uncategorized: " +
      toLocale(uncategorizedCount, 0, 0) +
      ", Unmapped owners: " +
      toLocale(unmappedOwnerCount, 0, 0) +
      ").";
    summaryNode.title =
      "Data quality warnings: " +
      totalWarnings +
      " | Uncategorized (DQ003): " +
      uncategorizedCount +
      " | Unmapped owners (DQ004): " +
      unmappedOwnerCount;
    toggleDqReviewAction(hasWarnings && Boolean(resolvePreferredPageId("dq")));
  }

  function renderDualHighchartsHost(host, configs) {
    ensureNode(host, "Dual Highcharts host");
    var contextLabel = chartContextLabelFromHost(host);
    host.classList.remove("fo-stage1-skeleton");
    host.classList.add("fo-chart-ready");
    host.style.display = "block";
    host.style.minHeight = "0";
    host.style.height = "auto";
    host.style.padding = "8px";
    host.innerHTML = "";

    var grid = document.createElement("div");
    grid.className = "fo-chart-grid";

    var panelArs = buildHighchartsPanel("ARS");
    var panelUsd = buildHighchartsPanel("USD");
    grid.appendChild(panelArs.panel);
    grid.appendChild(panelUsd.panel);
    host.appendChild(grid);

    setChartContainerAccessibility(panelArs.container, configs.ARS, contextLabel, "ARS");
    setChartContainerAccessibility(panelUsd.container, configs.USD, contextLabel, "USD");
    renderHighchartsOnContainer(panelArs.container, configs.ARS);
    renderHighchartsOnContainer(panelUsd.container, configs.USD);
  }

  function renderOverviewDebtDirectionHighchartsHost(host, configs) {
    renderDualHighchartsHost(host, configs);
  }

  function buildHighchartsPanel(title) {
    var panel = document.createElement("div");
    panel.className = "fo-chart-panel";
    var h = document.createElement("h4");
    h.textContent = title;
    var frame = document.createElement("div");
    frame.className = "fo-chart-frame";
    var container = document.createElement("div");
    container.className = "fo-highcharts-host";
    panel.appendChild(h);
    frame.appendChild(container);
    panel.appendChild(frame);
    return { panel: panel, container: container };
  }

  function chartContextLabelFromHost(host) {
    var explicit = rawText(host && host.getAttribute && host.getAttribute("data-fo-chart-title"));
    if (explicit) {
      return explicit;
    }
    var card = host && typeof host.closest === "function" ? host.closest(".card") : null;
    var heading = card && typeof card.querySelector === "function" ? card.querySelector("h3") : null;
    var headingText = rawText(heading && heading.textContent);
    if (headingText) {
      return headingText;
    }
    return rawText(host && host.id) || "Chart";
  }

  function buildChartAriaLabel(config, contextLabel, panelLabel) {
    var datasets = Array.isArray(config && config.datasets) ? config.datasets : [];
    var datasetLabels = datasets
      .map(function (dataset) {
        return rawText(dataset && dataset.label);
      })
      .filter(Boolean);
    var scopeText = datasetLabels.length > 0 ? datasetLabels.join(", ") : "no datasets";
    var parts = [rawText(contextLabel) || "Chart"];
    if (panelLabel) {
      parts.push(rawText(panelLabel));
    }
    parts.push(scopeText);
    return parts.join(" | ");
  }

  function setChartContainerAccessibility(container, config, contextLabel, panelLabel) {
    if (!container || typeof container.setAttribute !== "function") {
      return;
    }
    container.setAttribute("role", "img");
    container.setAttribute("tabindex", "0");
    container.setAttribute("aria-label", buildChartAriaLabel(config, contextLabel, panelLabel));
  }

  function mapChartTypeToHighcharts(type) {
    var normalized = rawText(type).toLowerCase();
    if (normalized === "bar") {
      return "column";
    }
    return normalized || "line";
  }

  function normalizeHighchartsPoint(value, index, dataset, seriesType) {
    var point =
      value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "y")
        ? Object.assign({}, value)
        : { y: value };
    var backgroundColor = Array.isArray(dataset && dataset.backgroundColor)
      ? rawText(dataset.backgroundColor[index])
      : "";
    var borderColor = Array.isArray(dataset && dataset.borderColor)
      ? rawText(dataset.borderColor[index])
      : "";

    if (seriesType === "column") {
      if (backgroundColor) {
        point.color = backgroundColor;
      } else if (borderColor) {
        point.color = borderColor;
      }
      if (borderColor) {
        point.borderColor = borderColor;
      }
      if (
        dataset &&
        typeof dataset.borderWidth === "number" &&
        Number.isFinite(dataset.borderWidth)
      ) {
        point.borderWidth = dataset.borderWidth;
      }
    }

    return point;
  }

  function buildHighchartsSeriesCollection(config) {
    var chartType = mapChartTypeToHighcharts(config && config.type);
    var datasets = Array.isArray(config && config.datasets) ? config.datasets : [];
    return datasets.map(function (dataset) {
      var seriesType = mapChartTypeToHighcharts((dataset && dataset.highchartsType) || chartType);
      var rawData = Array.isArray(dataset && dataset.data) ? dataset.data : [];
      var seriesData = rawData.map(function (value, index) {
        return normalizeHighchartsPoint(value, index, dataset, seriesType);
      });
      var backgroundColor =
        dataset && !Array.isArray(dataset.backgroundColor) ? rawText(dataset.backgroundColor) : "";
      var borderColor =
        dataset && !Array.isArray(dataset.borderColor) ? rawText(dataset.borderColor) : "";
      return {
        name: rawText(dataset && dataset.label) || "Series",
        type: seriesType,
        data: seriesData,
        color: borderColor || backgroundColor || undefined,
        borderColor: borderColor || undefined,
        yAxis:
          dataset && typeof dataset.yAxis === "number" && Number.isFinite(dataset.yAxis) ? dataset.yAxis : undefined,
        lineWidth:
          typeof (dataset && dataset.lineWidth) === "number" && Number.isFinite(dataset.lineWidth)
            ? dataset.lineWidth
            : seriesType === "line"
            ? 2
            : undefined,
        borderWidth:
          typeof (dataset && dataset.borderWidth) === "number" && Number.isFinite(dataset.borderWidth)
            ? dataset.borderWidth
            : undefined,
        marker:
          dataset && dataset.marker
            ? Object.assign({}, dataset.marker)
            : seriesType === "line"
            ? { enabled: true, radius: 3, symbol: "circle" }
            : undefined,
        legendSymbol: rawText(dataset && dataset.legendSymbol) || undefined,
        zIndex:
          dataset && typeof dataset.zIndex === "number" && Number.isFinite(dataset.zIndex)
            ? dataset.zIndex
            : undefined
      };
    });
  }

  function extractNumericValueFromChartPoint(point) {
    if (point && typeof point === "object" && Object.prototype.hasOwnProperty.call(point, "y")) {
      return toFiniteNumber(point.y);
    }
    return toFiniteNumber(point);
  }

  function buildHighchartsAxisExtremes(config) {
    if (!config || !config.beginAtZero) {
      return { min: undefined, max: undefined };
    }
    var datasets = Array.isArray(config.datasets) ? config.datasets : [];
    var values = [];
    datasets.forEach(function (dataset) {
      var seriesValues = Array.isArray(dataset && dataset.data) ? dataset.data : [];
      seriesValues.forEach(function (point) {
        if (point == null) {
          return;
        }
        var value = extractNumericValueFromChartPoint(point);
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
    });
    if (!values.length) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(0, Math.min.apply(null, values)),
      max: Math.max(0, Math.max.apply(null, values))
    };
  }

  function buildHighchartsAxisExtremesForDatasets(datasets, beginAtZero) {
    if (!beginAtZero) {
      return { min: undefined, max: undefined };
    }
    var values = [];
    var source = Array.isArray(datasets) ? datasets : [];
    source.forEach(function (dataset) {
      var seriesValues = Array.isArray(dataset && dataset.data) ? dataset.data : [];
      seriesValues.forEach(function (point) {
        if (point == null) {
          return;
        }
        var value = extractNumericValueFromChartPoint(point);
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
    });
    if (!values.length) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(0, Math.min.apply(null, values)),
      max: Math.max(0, Math.max.apply(null, values))
    };
  }

  function buildHighchartsYAxisCollection(config) {
    var yAxes = Array.isArray(config && config.yAxes) ? config.yAxes : [];
    var datasets = Array.isArray(config && config.datasets) ? config.datasets : [];
    if (!yAxes.length) {
      var yTickFormatter =
        config && typeof config.yTickFormatter === "function"
          ? config.yTickFormatter
          : function (value) {
              return formatChartTickValue(value);
            };
      var axisExtremes = buildHighchartsAxisExtremes(config);
      return {
        title: { text: null },
        tickAmount: 6,
        tickWidth: 1,
        tickLength: 4,
        min: axisExtremes.min,
        max: axisExtremes.max,
        labels: {
          formatter: function () {
            return yTickFormatter(this.value);
          }
        },
        plotLines:
          config && config.beginAtZero
            ? [{ value: 0, color: "rgba(148,163,184,0.4)", width: 1, zIndex: 3 }]
            : []
      };
    }
    return yAxes.map(function (axisConfig, axisIndex) {
      var axisFormatter =
        axisConfig && typeof axisConfig.formatter === "function"
          ? axisConfig.formatter
          : function (value) {
              return formatChartTickValue(value);
            };
      var axisDatasets = datasets.filter(function (dataset) {
        var datasetAxis =
          dataset && typeof dataset.yAxis === "number" && Number.isFinite(dataset.yAxis) ? dataset.yAxis : 0;
        return datasetAxis === axisIndex;
      });
      var axisExtremes = buildHighchartsAxisExtremesForDatasets(
        axisDatasets,
        Boolean(axisConfig && axisConfig.beginAtZero)
      );
      return {
        title: { text: rawText(axisConfig && axisConfig.title) || null },
        tickAmount:
          axisConfig && typeof axisConfig.tickAmount === "number" && Number.isFinite(axisConfig.tickAmount)
            ? axisConfig.tickAmount
            : 6,
        tickWidth: 1,
        tickLength: 4,
        min: axisExtremes.min,
        max: axisExtremes.max,
        opposite: Boolean(axisConfig && axisConfig.opposite),
        labels: {
          formatter: function () {
            return axisFormatter(this.value);
          }
        },
        plotLines:
          axisConfig && axisConfig.beginAtZero
            ? [{ value: 0, color: "rgba(148,163,184,0.4)", width: 1, zIndex: 3 }]
            : []
      };
    });
  }

  function buildChartJsLikeTooltipContextFromHighcharts(pointContext) {
    var point = pointContext && pointContext.point ? pointContext.point : pointContext;
    var rawPoint = point && point.options ? point.options : {};
    return {
      dataset: { label: rawText(point && point.series && point.series.name) || "Series" },
      parsed: { y: typeof (point && point.y) === "number" ? point.y : null },
      raw: rawPoint
    };
  }

  function renderHighchartsOnContainer(container, config) {
    if (!global.Highcharts || typeof global.Highcharts.chart !== "function") {
      throw new Error("Highcharts runtime is missing. Expected the pinned official CDN asset to load first.");
    }
    if (container._foHighchartsInstance && typeof container._foHighchartsInstance.destroy === "function") {
      container._foHighchartsInstance.destroy();
      container._foHighchartsInstance = null;
    }
    var categories = Array.isArray(config && config.labels) ? config.labels.slice() : [];
    var seriesCollection = buildHighchartsSeriesCollection(config);
    var chartType = mapChartTypeToHighcharts(config && config.type);
    var tooltipLabelFormatter =
      config && typeof config.tooltipLabelFormatter === "function" ? config.tooltipLabelFormatter : null;
    var yAxisCollection = buildHighchartsYAxisCollection(config);
    try {
      container._foHighchartsInstance = global.Highcharts.chart(container, {
        accessibility: { enabled: false },
        chart: {
          type: chartType,
          backgroundColor: "transparent",
          animation: false,
          spacingTop: 8,
          spacingRight: 8,
          spacingBottom: 8,
          spacingLeft: 8,
          style: { fontFamily: "inherit" }
        },
        title: { text: null },
        credits: { enabled: false },
        legend: {
          enabled: true,
          align: "center",
          verticalAlign: "top"
        },
        xAxis: {
          categories: categories,
          title: { text: null },
          gridLineWidth: 1,
          lineWidth: 1,
          tickWidth: 1,
          tickLength: 4,
          tickInterval: 1,
          labels: {
            rotation: -45
          }
        },
        yAxis: yAxisCollection,
        tooltip: {
          formatter: function () {
            if (tooltipLabelFormatter) {
              var formatted = tooltipLabelFormatter(
                buildChartJsLikeTooltipContextFromHighcharts(this.point || this)
              );
              if (Array.isArray(formatted)) {
                return formatted.join("<br/>");
              }
              return String(formatted || "");
            }
            var closeDateText = rawText(this.point && this.point.custom && this.point.custom.closeDateLabel);
            var lines = [this.series.name + ": " + formatChartTooltipValue(this.y)];
            if (closeDateText) {
              lines.push("Close date: " + closeDateText);
            }
            return lines.join("<br/>");
          }
        },
        plotOptions: {
          series: {
            animation: false
          },
          column: {
            borderWidth: 1,
            pointPadding: 0.04,
            groupPadding: 0.08,
            pointRange: 1,
            borderRadius: 2
          }
        },
        series: seriesCollection
      });
    } catch (err) {
      var panel = container && typeof container.closest === "function" ? container.closest(".fo-chart-panel") : null;
      var panelTitle = rawText(panel && panel.querySelector && panel.querySelector("h4") && panel.querySelector("h4").textContent);
      var context = chartContextLabelFromHost(container && typeof container.closest === "function" ? container.closest(".placeholder, .card, .fo-chart-host") || container : container);
      throw new Error(
        "Highcharts render failed for " +
          (context || "chart") +
          (panelTitle ? " [" + panelTitle + "]" : "") +
          ": " +
          (err && err.message ? err.message : String(err))
      );
    }
  }

  function semanticClass(metricKey, delta) {
    if (!delta) {
      return "";
    }
    var direction = IMPROVEMENT_DIRECTION[metricKey] || 1;
    var improving = direction * delta > 0;
    return improving ? "fo-cell-pos" : "fo-cell-neg";
  }

  function ensureNode(node, label) {
    if (!node) {
      throw new Error(label + " not found in DOM.");
    }
  }

  function formatCompact(value) {
    var abs = Math.abs(value);
    if (abs >= 1000000) {
      return toLocale(value / 1000000, 1, 1) + "M";
    }
    if (abs >= 1000) {
      return toLocale(value / 1000, 1, 1) + "K";
    }
    return toLocale(value, 0, 2);
  }

  function formatFull(value) {
    return toLocale(value, 2, 2);
  }

  function formatPercent(value) {
    return toLocale(value, 2, 2) + "%";
  }

  function toLocale(value, minDigits, maxDigits) {
    return Number(value).toLocaleString("es-AR", {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits
    });
  }

  function rankMap(map, prefix, limit) {
    var labelPrefix = prefix || "Item";
    var ranked = toRankedList(map, labelPrefix);
    if (typeof limit === "number" && Number.isFinite(limit)) {
      return ranked.slice(0, Math.max(0, limit));
    }
    return ranked;
  }

  async function exportRuntimeTable(tableID) {
    if (!lastRuntimeState || !lastRuntimeState.compute) {
      throw new Error("Runtime is not initialized yet.");
    }
    var runtime = await getRuntimeModule();
    return runtime.exportTableCSV(lastRuntimeState.compute, tableID, {
      wasmExecPath: lastRuntimeState.wasmExecPath,
      wasmPath: lastRuntimeState.wasmPath,
      scope: global
    });
  }

  function exportRuntimeWorkspace() {
    if (!lastRuntimeState || !lastRuntimeState.bundle) {
      throw new Error("Runtime is not initialized yet.");
    }
    return {
      version: 1,
      csvFiles: (lastRuntimeState.bundle.csvFiles || []).map(function (file) {
        return {
          name: file.name,
          content: file.content
        };
      }),
      config: lastRuntimeState.bundle.mappingsObj || {}
    };
  }

  function getRuntimeSnapshot() {
    if (!lastRuntimeState || !lastRuntimeState.compute) {
      return null;
    }
    return lastRuntimeState.compute.runtime || null;
  }

  var helperApi = Object.freeze({
    buildOverviewTrendKpiStripItems: buildOverviewTrendKpiStripItems,
    computeDiff: computeDiff,
    buildOwnerCardinalityInsight: buildOwnerCardinalityInsight,
    exportRuntimeTable: exportRuntimeTable,
    exportRuntimeWorkspace: exportRuntimeWorkspace,
    formatCompact: formatCompact,
    formatFull: formatFull,
    formatPercent: formatPercent,
    getOverviewWarningSummary: getOverviewWarningSummary,
    getRuntimeSnapshot: getRuntimeSnapshot,
    rankMap: rankMap,
    renderCombinedKpiTable: renderCombinedKpiTable,
    renderOwnerRankTable: renderOwnerRankTable,
    renderCategoryRankTable: renderCategoryRankTable,
    renderLatestMonthLabel: renderLatestMonthLabel,
    semanticClass: semanticClass,
    showBlockingError: showBlockingError
  });

  global.FinanceOverview = {
    boot: boot,
    loadModel: loadModel,
    helpers: helperApi
  };
})(window);
