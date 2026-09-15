$root = Split-Path -Parent $MyInvocation.MyCommand.Path

& "$root\scripts\kill-dev-ports.ps1"

Write-Output "Starting server (http://localhost:5000)..."
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$root\server`" && npm run dev"

Write-Output "Starting client (http://localhost:5173)..."
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$root\client`" && npm run dev"

Write-Output "Done. Server and client are starting in separate windows."
