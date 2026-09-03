# 启动后端（推荐 Windows 使用，比直接 uvicorn --reload 更稳）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$env:PYTHONUTF8 = "1"
Set-Location (Join-Path $Root "backend")
Write-Host "Backend: http://localhost:8001 (reload via run_dev.py)" -ForegroundColor Cyan
python run_dev.py
