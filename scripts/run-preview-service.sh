#!/bin/zsh

set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV="development"

pnpm_path="$(command -v pnpm || true)"
if [[ -z "$pnpm_path" ]]; then
  print -u2 "pnpm is required to run the AI course preview service."
  exit 127
fi

exec "$pnpm_path" exec vitepress dev docs \
  --host 127.0.0.1 \
  --port "${AI_COURSE_PREVIEW_PORT:-4178}"
