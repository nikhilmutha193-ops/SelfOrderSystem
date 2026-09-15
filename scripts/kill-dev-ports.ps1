# Frees ports 5000 (server) and 5173 (client) before a fresh dev/debug session starts.
# Shared by dev.bat/dev.ps1 and the VS Code "Server: Debug (ts-node)" preLaunchTask.
$ErrorActionPreference = 'SilentlyContinue'

function Get-ListeningPids {
    param([int]$Port)
    $lines = netstat -ano | Select-String -Pattern ":$Port\s+.*LISTENING"
    $ids = @()
    foreach ($line in $lines) {
        $parts = ($line.Line -split '\s+') | Where-Object { $_ -ne '' }
        $ownerId = $parts[-1]
        if ($ownerId -match '^\d+$' -and $ownerId -ne '0') { $ids += [int]$ownerId }
    }
    return $ids | Select-Object -Unique
}

function Stop-PortOwners {
    param([int]$Port)

    foreach ($procId in (Get-ListeningPids -Port $Port)) {
        # nodemon (the server's watcher) restarts its ts-node child the instant it dies, so killing
        # only the child races a freshly-launched instance for the same port. Walk up and kill any
        # nodemon ancestor first so it can't respawn a new child onto this port.
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        while ($current -and $current.ParentProcessId) {
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($current.ParentProcessId)" -ErrorAction SilentlyContinue
            if (-not $parent) { break }
            if ($parent.CommandLine -match 'nodemon') {
                Write-Output "  Killing nodemon watcher PID $($parent.ProcessId) (port $Port)"
                Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
            }
            $current = $parent
        }

        Write-Output "  Killing PID $procId (port $Port)"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "Stopping any process already using port 5000 (server) or 5173 (client)..."
Stop-PortOwners -Port 5000
Stop-PortOwners -Port 5173
Start-Sleep -Milliseconds 800
