@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting Habit Tracker at http://localhost:8642
  start "" "http://localhost:8642"
  node serve.js
) else (
  echo Node.js was not found, so opening the app straight from the file.
  echo It works the same, but "install" and offline mode need Node.js.
  start "" "%~dp0index.html"
  timeout /t 5 >nul
)
