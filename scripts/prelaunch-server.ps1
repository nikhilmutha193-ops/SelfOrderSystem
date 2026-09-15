# preLaunchTask for VS Code's "Server: Debug (ts-node)" config: frees ports 5000/5173, then
# starts the client dev server in its own detached window and returns immediately (so VS Code
# doesn't have to track a chained background task before launching the debugger).
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

& "$root\scripts\kill-dev-ports.ps1"

Write-Output "Starting client (http://localhost:5173)..."
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$root\client`" && npm run dev"
