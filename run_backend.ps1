Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Запуск MTS Incident Command Backend & Dashboard" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$backendDir = Join-Path $PSScriptRoot "backend"
Set-Location $backendDir

$python = Join-Path $backendDir ".venv\Scripts\python.exe"

if (Test-Path $python) {
    Write-Host "[OK] Виртуальное окружение найдено." -ForegroundColor Green
    Write-Host "[*] Сервер запускается на http://localhost:8000" -ForegroundColor Yellow
    Write-Host "[*] Дашборд доступен на http://localhost:8000/dashboard/" -ForegroundColor Yellow
    Write-Host ""
    & $python -m uvicorn main:app --app-dir $backendDir --reload --host 0.0.0.0 --port 8000
} else {
    Write-Host "[!] .venv не найден в папке backend." -ForegroundColor Red
}
