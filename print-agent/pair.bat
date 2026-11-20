@echo off
rem Pairs this computer with the restaurant server.   pair.bat https://your-server ABCD2345
cd /d "%~dp0"
if not exist PrintAgent.exe if not exist agent.js (
  echo agent.js was not found next to this file.
  echo If you opened this from inside a .zip file, close it, right-click the zip and choose "Extract All",
  echo then run this file again from the extracted folder.
  pause
  exit /b 1
)
if "%~2"=="" (
  echo Usage: pair.bat https://your-server PAIRING-CODE
  exit /b 1
)
if exist PrintAgent.exe (
  PrintAgent.exe pair --server %1 --code %2
) else (
  node agent.js pair --server %1 --code %2
)
