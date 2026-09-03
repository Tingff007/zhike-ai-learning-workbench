# 使用国内镜像安装前后端依赖（前端：淘宝 npmmirror；后端：清华 PyPI）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Frontend: corepack + pnpm install (registry.npmmirror.com)" -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 corepack，请使用 Node.js 16.10+ 并确保 corepack 可用。"
}
corepack enable
corepack prepare pnpm@11.9.0 --activate
corepack pnpm install
Pop-Location

Write-Host "==> Backend: pip install (pypi.tuna.tsinghua.edu.cn)" -ForegroundColor Cyan
$env:PIP_CONFIG_FILE = Join-Path $Root "backend\pip.conf"
Push-Location (Join-Path $Root "backend")
python -m pip install -U pip
python -m pip install -r requirements.txt
Pop-Location
Remove-Item Env:PIP_CONFIG_FILE -ErrorAction SilentlyContinue

Write-Host "依赖安装完成。" -ForegroundColor Green
