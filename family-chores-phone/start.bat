@echo off
rem Family Chores (device version): double-click to open the built app in your browser.
cd /d "%~dp0"
title Family Chores
where npm >nul 2>nul || (echo Node.js is needed. Install it from https://nodejs.org and try again. & pause & exit /b 1)

if not exist "node_modules\vite" (
  echo Installing the app's parts for the first time. This takes a minute...
  call npm install || (echo Installing failed. & pause & exit /b 1)
)

if not exist "dist\index.html" (
  echo Building the app. This takes a moment...
  call npm run build || (echo Building failed. & pause & exit /b 1)
)

echo.
echo Starting Family Chores, usually at http://localhost:4173/claude-code/family-chores/
echo (if that port is busy, the address shown below is used instead).
echo Your browser will open it. Close this window to stop it.
echo.
echo Tip: to see it phone-sized, press F12 in the browser, then Ctrl+Shift+M
echo (device toolbar) and pick a phone such as iPhone 12 Pro.
echo.
call npx vite preview --base /claude-code/family-chores/ --port 4173 --open
pause
