@echo off
title MTS Incident Command Backend
set ROOT_DIR=%~dp0

echo Starting server on http://localhost:8000 ...
echo Dashboard URL: http://localhost:8000/dashboard/
echo.

cd /d "%ROOT_DIR%backend"
call .venv\Scripts\activate.bat
python -m uvicorn main:app --app-dir "%ROOT_DIR%backend" --reload --host 0.0.0.0 --port 8000
pause
