#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ "$#" -eq 0 ]]; then
  set -- backend frontend
fi

exec docker compose --progress plain build "$@"
