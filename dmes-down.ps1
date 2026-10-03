#Requires -Version 5.1
<#
dmes-down.ps1 - stop every DMES server started from this repo.

Kills java / node processes whose command line points inside this repo.
Processes from other projects are left alone.

Gradle daemons are NOT stopped: `gradlew --stop` stops every daemon of the same
user and Gradle version, which breaks builds/tests running in other worktrees.
Idle daemons exit on their own after org.gradle.daemon.idletimeout (10 min).
#>
[CmdletBinding()]
param()

$RootDir    = Split-Path -Parent $MyInvocation.MyCommand.Path

$victims = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
             Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and
                            $_.CommandLine -like "*$RootDir*" -and
                            $_.Name -match '^(java|javaw|node|pnpm)' } |
             Select-Object -ExpandProperty ProcessId)

if ($victims.Count -eq 0) {
    Write-Host '[down] nothing running from this repo' -ForegroundColor DarkGray
} else {
    Write-Host "[down] stopping pid: $($victims -join ' ')" -ForegroundColor Yellow
    foreach ($p in $victims) { & taskkill.exe /PID $p /T /F 2>&1 | Out-Null }
}

# portal + backend ports from scripts\lib\modules.conf (rows whose platforms include ps1)
. (Join-Path $RootDir 'scripts\lib\modules.ps1')
$ports = @($DmesPortalPort) + @($DmesBeModules.Values)
$still = @($ports | Where-Object {
    Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue })
if ($still.Count -eq 0) { Write-Host '[down] all ports free' -ForegroundColor Green }
else { Write-Host "[down] still listening: $($still -join ' ')" -ForegroundColor Red }
