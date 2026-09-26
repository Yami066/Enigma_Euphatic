# Starts the Euphatics local backend (FastAPI + SQLite) and frontend (Vite)
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Starting Euphatics 100% Local Stack" -ForegroundColor Cyan
Write-Host " Backend:  http://127.0.0.1:8001 (FastAPI + SQLite)" -ForegroundColor Green
Write-Host " Database: backend/euphatics.db" -ForegroundColor Green
Write-Host " Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan

$root = $PSScriptRoot

# Start Python FastAPI backend in a separate terminal process
Start-Process python -ArgumentList "-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8001", "--reload" -WorkingDirectory $root

# Start Vite frontend in current terminal
Set-Location "$root\frontend"
npm run dev
