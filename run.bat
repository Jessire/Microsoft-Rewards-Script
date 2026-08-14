@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\index.js" (
    echo [run] dist\index.js not found. Run setup.bat or npm run build first.
    exit /b 1
)

call npm start
exit /b %ERRORLEVEL%