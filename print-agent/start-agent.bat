@echo off
cd /d "%~dp0"
rem Runs PrintAgent.exe when it is next to this file (no Node.js needed), otherwise the installed Node.js.
if not exist PrintAgent.exe if not exist agent.js (
  echo agent.js was not found next to this file.
  echo If you opened this from inside a .zip file, close it, right-click the zip and choose "Extract All",
  echo then run this file again from the extracted folder.
  pause
  exit /b 1
)
:loop
if exist PrintAgent.exe (
  PrintAgent.exe
) else (
  node agent.js
)
timeout /t 10 /nobreak >nul
goto loop
