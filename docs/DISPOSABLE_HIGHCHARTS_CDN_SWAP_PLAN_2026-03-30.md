# Disposable Highcharts CDN Swap Plan (2026-03-30)

This note is intentionally disposable. It exists to make the Highcharts delivery change explicit while we replace vendored snapshots with official CDN loading.

## Goal

Stop redistributing vendored Highcharts files in the public repo and load the same version from the official Highcharts CDN instead.

## CDN Target

Pinned version:
1. `https://code.highcharts.com/12.5.0/highcharts.js`
2. `https://code.highcharts.com/12.5.0/themes/dark-unica.js`

Why pinned:
1. keeps runtime behavior stable,
2. avoids silent changes from a floating `latest` URL,
3. matches the version currently vendored in the repo.

## Tasks And Subtasks

### Task 1: Replace HTML imports

Subtasks:
1. update the public HTML shell to load Highcharts from the official CDN,
2. keep the same load order as the local vendored scripts,
3. keep the rest of the boot sequence unchanged.

### Task 2: Remove vendored Highcharts snapshots

Subtasks:
1. delete `web/mockups_lab/vendor/highcharts.js`,
2. delete `web/mockups_lab/vendor/highcharts-dark-unica.js`,
3. make sure no tests or runtime code still expect those local files.

### Task 3: Update repo contract tests and copy

Subtasks:
1. update strict-mode tests that assert the old local script paths,
2. update the runtime error message so it no longer claims a local vendor file is required,
3. add one public doc note that the web app now depends on the official Highcharts CDN.

### Task 4: Validate the public repo

Subtasks:
1. run web unit tests,
2. run the UX audit,
3. run the smoke suite in a real browser,
4. run the OSS-sensitive guard.

### Task 5: Validate the private repo against the updated public repo

Subtasks:
1. move the private repo submodule to the updated public commit,
2. rerun `npm run bootstrap:private`,
3. rerun `npm run test:private`.

## Regroup Trigger

Pause if:
1. the official CDN URLs do not load reliably in a browser,
2. the swap changes runtime behavior beyond simple asset delivery,
3. the private repo needs broader web-contract changes to stay compatible.
