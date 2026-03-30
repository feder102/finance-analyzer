#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_root="$repo_root/web"
publish_root="$repo_root/dist/pages"

copy_file() {
  local source_path="$1"
  local target_path="$2"
  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
}

copy_dir() {
  local source_dir="$1"
  local target_dir="$2"
  mkdir -p "$target_dir"
  rsync -a --delete "$source_dir"/ "$target_dir"/
}

copy_runtime_dir() {
  local source_dir="$1"
  local target_dir="$2"
  mkdir -p "$target_dir"
  rsync -a --delete --exclude='*.test.js' "$source_dir"/ "$target_dir"/
}

rm -rf "$publish_root"
mkdir -p "$publish_root"

bash "$repo_root/scripts/build-web-wasm.sh"
copy_file "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$publish_root/wasm_exec.js"

copy_file "$web_root/index.html" "$publish_root/index.html"
copy_file "$web_root/finance.wasm" "$publish_root/finance.wasm"
copy_file "$web_root/csvCombine.js" "$publish_root/csvCombine.js"
copy_file "$web_root/format.js" "$publish_root/format.js"
copy_file "$web_root/mappingsCsvParse.js" "$publish_root/mappingsCsvParse.js"
copy_file "$web_root/tableRenderer.js" "$publish_root/tableRenderer.js"
copy_file "$web_root/node_modules/idb/build/index.js" "$publish_root/node_modules/idb/build/index.js"

copy_runtime_dir "$web_root/runtime" "$publish_root/runtime"
copy_runtime_dir "$web_root/storage" "$publish_root/storage"
copy_dir "$web_root/mockups_lab/app" "$publish_root/mockups_lab/app"
copy_dir "$web_root/mockups_lab/shared" "$publish_root/mockups_lab/shared"
copy_dir "$web_root/mockups_lab/tmp_public_data" "$publish_root/mockups_lab/tmp_public_data"

touch "$publish_root/.nojekyll"
