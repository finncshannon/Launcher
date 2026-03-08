@echo off
echo ============================================
echo   Shannon Launcher — Release Build
echo ============================================
echo.
cd /d "%~dp0.."
echo [1/3] Building frontend...
call npm run build:frontend
if errorlevel 1 (echo Frontend build failed! & pause & exit /b 1)
echo.
echo [2/3] Building electron...
call npm run build:electron
if errorlevel 1 (echo Electron build failed! & pause & exit /b 1)
echo.
echo [3/3] Packaging...
cd electron
set APP_BUILDER_BIN_PATH=%~dp0..\node_modules\app-builder-bin\win\x64\app-builder.exe
call npx electron-builder --config electron-builder.yml --win
if errorlevel 1 (echo Packaging failed! & pause & exit /b 1)
echo.
echo ============================================
echo   Build complete! Installer in electron/release/
echo ============================================
pause
