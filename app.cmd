@echo off
setlocal
title Kutumb - Local Server

cd /d "%~dp0"

echo ============================================
echo   KUTUMB - Local Application Launcher
echo ============================================
echo.
echo Working folder: %cd%
echo.

rem ---------------------------------------------------------
rem 0. Make sure this is really the extracted project folder
rem ---------------------------------------------------------
if exist "package.json" goto HAVE_PACKAGE_JSON
echo [ERROR] package.json was not found in this folder.
echo.
echo This usually means the ZIP file has not been fully extracted yet.
echo   1. Right-click the downloaded ZIP file
echo   2. Choose Extract All, and extract it somewhere on your disk
echo   3. Open the extracted Kutumb-main folder
echo   4. Double-click app.cmd from inside that extracted folder
echo.
goto FAIL

:HAVE_PACKAGE_JSON
rem ---------------------------------------------------------
rem 1. Check Node.js is installed
rem ---------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
goto HAVE_NODE

:NO_NODE
echo [ERROR] Node.js was not found on this machine.
echo Please install Node.js 18 or later from https://nodejs.org
echo then run this file again.
goto FAIL

:HAVE_NODE
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo Using Node.js %NODE_VERSION%
echo.

rem ---------------------------------------------------------
rem 2. Set up .env if it doesn't exist yet
rem ---------------------------------------------------------
if exist ".env" goto SKIP_ENV_SETUP
if not exist ".env.example" goto SKIP_ENV_SETUP
copy /y ".env.example" ".env" >nul
echo [SETUP] Created .env from .env.example
echo         Open .env later to add your SMTP / WhatsApp details.
echo         The app runs fine without them - those two features
echo         are simply skipped until configured.
echo.
:SKIP_ENV_SETUP

rem ---------------------------------------------------------
rem 3. Install dependencies (first run, or "app.cmd install")
rem ---------------------------------------------------------
set DO_INSTALL=0
if not exist "node_modules" set DO_INSTALL=1
if /i "%1"=="install" set DO_INSTALL=1
if "%DO_INSTALL%"=="0" goto SKIP_INSTALL

echo [SETUP] Installing dependencies with npm install ...
echo         This can take a few minutes the first time.
echo.
call npm install
if errorlevel 1 goto INSTALL_FAILED
goto AFTER_INSTALL

:INSTALL_FAILED
echo.
echo [ERROR] npm install failed. See the messages above.
goto FAIL

:SKIP_INSTALL
echo Dependencies already installed - skipping npm install.
echo Run "app.cmd install" to force a fresh install.

:AFTER_INSTALL
echo.

rem ---------------------------------------------------------
rem 3b. Apply database schema + import seed data (Neon Postgres)
rem     Safe to run every time - idempotent after the first run.
rem ---------------------------------------------------------
echo [SETUP] Applying database schema to your Neon database...
echo         (all app data now lives in Postgres, not JSON files)
echo.
call node server\db\migrate.js
if errorlevel 1 goto MIGRATE_FAILED
goto AFTER_MIGRATE

:MIGRATE_FAILED
echo.
echo [ERROR] Database migration failed. This almost always means
echo         DATABASE_URL in your .env file is missing or wrong.
echo         Open .env and check it against your Neon dashboard,
echo         then run app.cmd again.
goto FAIL

:AFTER_MIGRATE
echo.

rem ---------------------------------------------------------
rem 4. Build the frontend (first run, or "app.cmd rebuild")
rem ---------------------------------------------------------
set DO_BUILD=0
if not exist "dist" set DO_BUILD=1
if /i "%1"=="rebuild" set DO_BUILD=1
if "%DO_BUILD%"=="0" goto SKIP_BUILD

echo [BUILD] Building frontend for production ...
echo.
call npm run build
if errorlevel 1 goto BUILD_FAILED
goto AFTER_BUILD

:BUILD_FAILED
echo.
echo [ERROR] Build failed. See the messages above.
goto FAIL

:SKIP_BUILD
echo Existing build found in "dist" - skipping build.
echo Run "app.cmd rebuild" after changing source files.

:AFTER_BUILD
echo.

rem ---------------------------------------------------------
rem 5. Start the server
rem ---------------------------------------------------------
if "%PORT%"=="" set PORT=8080

echo ============================================
echo   Starting Kutumb server on port %PORT%
echo   URL: http://localhost:%PORT%
echo   Press Ctrl+C in this window to stop it.
echo ============================================
echo.

start "Opening browser..." cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"

call npm start

echo.
echo Server stopped.
goto END

:FAIL
echo.
echo Setup could not continue - see the message(s) above for what to fix.

:END
echo.
echo ============================================
pause
