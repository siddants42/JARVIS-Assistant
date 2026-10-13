@echo off
setlocal
cd /d "%~dp0"
title JARVIS Setup

echo ========================================
echo   JARVIS - Local AI Assistant Setup
echo ========================================
echo.
where py >nul 2>nul || (echo Python launcher not found. Install Python 3.11+ and enable Add to PATH.& pause & exit /b 1)
where node >nul 2>nul || (echo Node.js not found. Install Node.js 20+ and reopen this script.& pause & exit /b 1)
where ollama >nul 2>nul || (echo Ollama not found. Install Ollama from https://ollama.com/download and reopen this script.& pause & exit /b 1)

echo Checking local model qwen2.5:3b...
ollama list | findstr /i "qwen2.5:3b" >nul
if errorlevel 1 (
  echo Model not found; downloading it now. This may take a while...
  ollama pull qwen2.5:3b
  if errorlevel 1 (echo Model download failed. Check Ollama and internet, then retry.& pause & exit /b 1)
)

if not exist "backend\.venv\Scripts\python.exe" py -3 -m venv backend\.venv
if errorlevel 1 (echo Could not create Python environment.& pause & exit /b 1)
echo Installing backend requirements...
call backend\.venv\Scripts\python.exe -m pip install --upgrade pip
call backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 (echo Backend dependency installation failed.& pause & exit /b 1)

echo Applying database migrations...
cd /d "%~dp0backend"
call .venv\Scripts\python.exe manage.py makemigrations assistant_api
call .venv\Scripts\python.exe manage.py migrate
if errorlevel 1 (echo Database migration failed.& pause & exit /b 1)

if not exist "%~dp0frontend\node_modules" (
  echo Installing frontend packages...
  cd /d "%~dp0frontend"
  call npm install
  if errorlevel 1 (echo Frontend dependency installation failed.& pause & exit /b 1)
)

start "JARVIS Django API" cmd /k "cd /d "%~dp0backend" ^&^& set JARVIS_LLM_BASE_URL=http://localhost:11434/v1 ^&^& set JARVIS_LLM_API_KEY=ollama ^&^& set JARVIS_LLM_MODEL=qwen2.5:3b ^&^& .venv\Scripts\python.exe manage.py runserver 8000"
start "JARVIS React Frontend" cmd /k "cd /d "%~dp0frontend" ^&^& npm run dev"
echo.
echo JARVIS is starting in two terminal windows.
echo Wait for both servers, then open http://localhost:5173
 echo API health: http://127.0.0.1:8000/api/health/
echo Keep both terminal windows open while using JARVIS.
echo.
pause
