#!/usr/bin/env bash
# 使用国内镜像安装前后端依赖（前端：淘宝 npmmirror；后端：清华 PyPI）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Frontend: corepack + pnpm install (registry.npmmirror.com)"
cd "$ROOT/frontend"
if ! command -v corepack >/dev/null 2>&1; then
  echo "未找到 corepack，请使用 Node.js 16.10+ 并确保 corepack 可用。" >&2
  exit 1
fi
corepack enable
corepack prepare pnpm@11.9.0 --activate
corepack pnpm install

echo "==> Backend: pip install (pypi.tuna.tsinghua.edu.cn)"
export PIP_CONFIG_FILE="$ROOT/backend/pip.conf"
cd "$ROOT/backend"
python -m pip install -U pip
python -m pip install -r requirements.txt
unset PIP_CONFIG_FILE

echo "依赖安装完成。"
