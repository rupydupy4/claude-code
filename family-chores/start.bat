@echo off
rem Family Chores: double-click to start the app at http://localhost:3000
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages into this folder - this only happens the first time...
  call npm install
  if errorlevel 1 goto failed
)

if not exist .env.local (
  echo.
  echo The app needs a Supabase database before it can start.
  echo 1. Start Docker Desktop, then run:  npx supabase start
  echo 2. Run:                             npx supabase db reset
  echo 3. Copy .env.example to .env.local and paste in the URL and keys that "supabase start" printed.
  echo See README.md for the full steps.
  echo.
  pause
  exit /b 1
)

echo Starting Family Chores... your browser will open in a moment.
echo Close this window to stop the app.
start "" http://localhost:3000
call npm run dev
goto end

:failed
echo.
echo Something went wrong while installing. Check that Node.js 20.9 or newer is installed.
pause

:end
