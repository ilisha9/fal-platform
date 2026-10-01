@echo off
setlocal
title fal Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download the LTS version from https://nodejs.org/ , install it, then run start.bat again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo.
  echo  fal Studio needs Node.js 18 or newer. You have:
  node -v
  echo  Please update from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul

echo Starting fal Studio... (close this window or press Ctrl+C to stop)
node server.js --open
if errorlevel 1 pause
