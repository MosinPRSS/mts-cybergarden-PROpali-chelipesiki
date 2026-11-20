@echo off
title MTS Incident Command Backend
set CURR_DIR=%~dp0

echo Starting server on http://localhost:8000 ...
echo Dashboard URL: http://localhost:8000/dashboard/
echo.

cd /d "%CURR_DIR%"
call .venv\Scripts\activate.bat
python -m uvicorn main:app --app-dir "%CURR_DIR%" --reload --host 0.0.0.0 --port 8000
pause
