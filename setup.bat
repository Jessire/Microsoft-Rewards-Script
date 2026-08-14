@echo off
setlocal
cd /d "%~dp0"

echo [setup] Checking Node.js and npm...
where node >nul 2>nul || (
    echo [setup] Node.js was not found. Install Node.js 24 or newer, then run this script again.
    exit /b 1
)
where npm >nul 2>nul || (
    echo [setup] npm was not found. Install Node.js 24 or newer, then run this script again.
    exit /b 1
)

node -e "const major=Number(process.versions.node.split('.')[0]); if(major<24){console.error('[setup] Node.js 24 or newer is required. Current: '+process.version); process.exit(1)}"
if errorlevel 1 exit /b %ERRORLEVEL%

echo [setup] Installing dependencies...
call npm ci
if errorlevel 1 exit /b %ERRORLEVEL%

echo [setup] Installing Patchright Chromium...
call npm run install:browser
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "config.json" (
    echo [setup] Creating config.json from config.example.json...
    copy /Y "config.example.json" "config.json" >nul
    if errorlevel 1 exit /b %ERRORLEVEL%
)

echo [setup] Building project...
call npm run build
if errorlevel 1 exit /b %ERRORLEVEL%

echo [setup] Complete. Copy env.example to .env and add your account credentials before running run.bat.
exit /b 0