#Requires -Version 5.1
<#
dmes-up.ps1 - one shot: DMES backend (6 modules) + frontend, with everything
              a fresh clone needs already handled.

By default it runs in the foreground through local-run.ps1, so Ctrl+C in this
window stops backend and frontend together. With -Detach it starts the two
sides as independent background processes that survive this window closing;
stop those with dmes-down.cmd.

Steps:
  1. pin JAVA_HOME to JDK 21 (machine default is JDK 8, which cannot run
     Gradle 9.3.1 / Spring Boot 4)
  2. seed gradle-wrapper.jar where missing (.gitignore excludes *.jar, so a
     fresh clone has none: "Unable to access jarfile")
  3. free the dev ports
  4. serial gradle warm-up when needed - otherwise the six modules build the
     shared included builds (oasis / cactus-core / mcm-core) concurrently and
     delete each other's build\classes
  5. run backend + frontend (foreground, or detached with -Detach)

Usage:
  .\dmes-up.cmd            # normal - Ctrl+C in this window stops everything
  .\dmes-up.cmd -Detach    # background; stop with .\dmes-down.cmd
  .\dmes-up.cmd -Warmup    # force the serial warm-up
  .\dmes-up.cmd -Full      # frontend re-runs pnpm install + build:libs
  .\dmes-up.cmd -Clean     # both of the above
  .\dmes-up.cmd -Detach -Be   # backend only     (-Fe for frontend only)

Ports: portal 5100 | mls 8092 | mqc 8093 | mpp 8094 | mpn 8095 | mcm 8100 | analog 8191
Login: admin / admin123
#>
[CmdletBinding()]
param([switch] $Detach, [switch] $Warmup, [switch] $Full, [switch] $Clean, [switch] $Be, [switch] $Fe)

$ErrorActionPreference = 'Stop'
$RootDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir 'src\backend'
$LogDir     = Join-Path $RootDir 'logs'
$Modules    = @('mcm', 'mls', 'mqc', 'mpp', 'mpn', 'analog')
$BePorts    = [ordered]@{ mls = 8092; mqc = 8093; mpp = 8094; mpn = 8095; mcm = 8100; analog = 8191 }
$FePort     = 5000
if ($Clean) { $Warmup = $true; $Full = $true }
if (-not $Be -and -not $Fe) { $Be = $true; $Fe = $true }

function Say { param([string] $Message, [string] $Color = 'Green') Write-Host '[up] ' -ForegroundColor $Color -NoNewline; Write-Host $Message }
function Test-Listening { param([int] $Port) [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }

# taskkill writes to stderr for anything it cannot touch (already gone, denied),
# and under $ErrorActionPreference = 'Stop' that NativeCommandError aborts the
# whole script. Always kill through here.
function Stop-Tree {
    param([int] $ProcessId)
    if (-not $ProcessId) { return }
    & {
        $ErrorActionPreference = 'SilentlyContinue'
        taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
    }
}

$null = New-Item -ItemType Directory -Force -Path $LogDir

# 1. JDK 21 ------------------------------------------------------------------
$jdk = 'C:\Users\DKSYSTEMS\.jdks\graalvm-jdk-21.0.7'
if (-not (Test-Path $jdk)) {
    $jdk = Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -match '21' } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $jdk) { Say 'JDK 21 not found under ~\.jdks - install it first' 'Red'; exit 1 }
$env:JAVA_HOME = $jdk
$env:PATH      = "$jdk\bin;$env:PATH"
Say "JDK 21: $jdk"

# 2. gradle wrapper jar ------------------------------------------------------
if ($Be) {
    $srcJar = Get-ChildItem $BackendDir -Recurse -Filter 'gradle-wrapper.jar' -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty FullName
    $seeded = 0
    foreach ($props in Get-ChildItem $BackendDir -Recurse -Filter 'gradle-wrapper.properties' -ErrorAction SilentlyContinue) {
        $target = Join-Path $props.DirectoryName 'gradle-wrapper.jar'
        if (Test-Path $target) { continue }
        if (-not $srcJar) { Say "no gradle-wrapper.jar anywhere to seed $target from" 'Red'; exit 1 }
        Copy-Item $srcJar $target
        $seeded++
    }
    if ($seeded) { Say "seeded gradle-wrapper.jar into $seeded wrapper dir(s)" 'Yellow'; $Warmup = $true }
}

# 3. stop whatever this repo already has running ------------------------------
# Ports alone are not enough: a `next dev` that has not bound 5100 yet still
# loses the race with a second one and dies with EADDRINUSE. The shim also
# hides the script name from be-run/fe-run's own "previous instance" cleanup,
# so that cleanup can no longer see the process it is meant to replace.
function Stop-Prior {
    param([string] $PathNeedle, [string] $NamePattern)
    $victims = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                 Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and
                                $_.CommandLine -like "*$PathNeedle*" -and
                                $_.Name -match $NamePattern } |
                 Select-Object -ExpandProperty ProcessId)
    foreach ($v in $victims) { Stop-Tree $v }
    return $victims.Count
}

$stopped = 0
if ($Be) {
    $stopped += Stop-Prior -PathNeedle (Join-Path $LogDir '_launch-backend.ps1') -NamePattern '^(cmd|powershell)'
    $stopped += Stop-Prior -PathNeedle $BackendDir -NamePattern '^javaw?$'
}
if ($Fe) {
    $stopped += Stop-Prior -PathNeedle (Join-Path $LogDir '_launch-frontend.ps1') -NamePattern '^(cmd|powershell)'
    $stopped += Stop-Prior -PathNeedle (Join-Path $RootDir 'src\frontend') -NamePattern '^(node|pnpm)'
}
if ($stopped) { Say "stopped $stopped process(es) from a previous run" 'Yellow'; Start-Sleep -Seconds 2 }

# free anything still holding the ports
$wanted = @()
if ($Be) { $wanted += $BePorts.Values }
if ($Fe) { $wanted += $FePort }
$held = @()
foreach ($port in $wanted) {
    $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($owner in $owners) {
        if ($owner -and $owner -ne 0) { $held += "$port/$owner"; Stop-Tree $owner }
    }
}
if ($held.Count) { Say "reclaimed ports: $($held -join ' ')" 'Yellow'; Start-Sleep -Seconds 2 }

# 4. serial warm-up ----------------------------------------------------------
if ($Be) {
    if (-not $Warmup) {
        foreach ($m in $Modules) {
            if (-not (Test-Path (Join-Path $BackendDir "$m\api\build\classes\java\main"))) {
                Say "$m not built yet - warm-up required" 'Yellow'
                $Warmup = $true
                break
            }
        }
    }
    if ($Warmup) {
        Say 'serial gradle warm-up (first run takes a few minutes)'
        foreach ($m in $Modules) {
            Write-Host "      warmup $m ..." -ForegroundColor DarkGray
            Push-Location (Join-Path $BackendDir $m)
            & (Join-Path $BackendDir 'gradlew.bat') ':api:classes' '--console=plain' | Out-Null
            $rc = $LASTEXITCODE
            Pop-Location
            if ($rc -ne 0) { Say "warm-up FAILED: $m (rerun with -Clean)" 'Red'; exit $rc }
        }
        Say 'warm-up done - all 6 modules compiled'
    } else {
        Say 'warm-up skipped (all modules already built)'
    }
}

# 5. run ---------------------------------------------------------------------
$feArgs = if ($Full) { @('--all') } else { @('--all', '-q') }

if (-not $Detach) {
    Write-Host ''
    Say 'portal  http://localhost:5100    login  admin / admin123'
    Say 'mls 8092 | mqc 8093 | mpp 8094 | mpn 8095 | mcm 8100 | analog 8191'
    Say 'Ctrl+C stops backend and frontend together'
    Write-Host ''
    if ($Be -and $Fe) { & (Join-Path $RootDir 'local-run.ps1') @feArgs }
    elseif ($Be)      { & (Join-Path $RootDir 'be-run.ps1') '--all' }
    else              { & (Join-Path $RootDir 'fe-run.ps1') @feArgs }
    exit $LASTEXITCODE
}

# Two things make this more involved than Start-Process:
#
#  * Job objects - a process started with Start-Process stays in the caller's
#    job, so it dies the moment the launching shell exits (automation harness,
#    SSH session, closed terminal). WMI's Create runs it under WmiPrvSE, which
#    escapes the job and survives.
#  * be-run.ps1 / fe-run.ps1 kill "previous instances" by scanning every
#    process for their own file name in the command line. Naming them directly
#    in the launch command line makes them kill their own parent - and
#    themselves with it. So each side is launched through a generated shim
#    whose name they do not recognise - the shim name must not CONTAIN the
#    script name either, since they match on substring.
function Start-Side {
    param([string] $Script, [string[]] $Arguments, [string] $LogPath, [string] $Tag)

    $shim = Join-Path $LogDir "_launch-$Tag.ps1"
    @(
        "`$env:JAVA_HOME = '$jdk'"
        "`$env:PATH      = '$jdk\bin;' + `$env:PATH"
        "Set-Location '$RootDir'"
        ("& '" + (Join-Path $RootDir $Script) + "' " + ($Arguments -join ' '))
    ) | Set-Content -LiteralPath $shim -Encoding ASCII

    $psExe = (Get-Command powershell.exe).Source
    $line  = 'cmd.exe /c ""{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" > "{2}" 2>&1"' -f $psExe, $shim, $LogPath
    $res   = ([wmiclass] 'root\cimv2:Win32_Process').Create($line, $RootDir)
    if ($res.ReturnValue -ne 0) { Say "failed to start $Script (WMI code $($res.ReturnValue))" 'Red'; exit 1 }
    return $res.ProcessId
}

if ($Be) {
    $bePid = Start-Side -Script 'be-run.ps1' -Arguments @('--all') -LogPath (Join-Path $LogDir 'be.log') -Tag 'backend'
    Say "backend  started (pid $bePid)  -> logs\be.log"
}
if ($Fe) {
    $fePid = Start-Side -Script 'fe-run.ps1' -Arguments $feArgs -LogPath (Join-Path $LogDir 'fe.log') -Tag 'frontend'
    Say "frontend started (pid $fePid)  -> logs\fe.log"
}

# wait for readiness ---------------------------------------------------------
Say 'waiting for ports (up to 8 minutes on a cold build) ...'
$pending = @()
if ($Be) { foreach ($k in $BePorts.Keys) { $pending += , @($k, $BePorts[$k]) } }
if ($Fe) { $pending += , @('portal', $FePort) }

$deadline = (Get-Date).AddMinutes(8)
$up       = @{}
while ((Get-Date) -lt $deadline -and $up.Count -lt $pending.Count) {
    foreach ($entry in $pending) {
        if (-not $up.ContainsKey($entry[0]) -and (Test-Listening $entry[1])) {
            $up[$entry[0]] = $true
            Write-Host "      up: $($entry[0]) $($entry[1])" -ForegroundColor DarkGreen
        }
    }
    if ($up.Count -lt $pending.Count) { Start-Sleep -Seconds 3 }
}

Write-Host ''
if ($up.Count -eq $pending.Count) {
    Say 'all services up'
    Say 'portal  http://localhost:5100    login  admin / admin123'
    Say 'stop with .\dmes-down.cmd'
} else {
    $missing = @($pending | Where-Object { -not $up.ContainsKey($_[0]) } | ForEach-Object { "$($_[0]):$($_[1])" })
    Say "not up after 8 min: $($missing -join ' ')  - check logs\be.log and logs\fe.log" 'Red'
    exit 1
}
