@echo off
cd /d "%~dp0"
:loop
node agent.js
timeout /t 10 /nobreak >nul
goto loop
