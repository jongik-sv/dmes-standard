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
  4. run backend + frontend (foreground, or detached with -Detach)
     be-run.ps1 first prebuilds the selected modules with ONE Gradle run from
     the src\backend composite, so the modules no longer build the shared
     included builds (cactus-core / mcm-core / ...) concurrently and delete
     each other's build\classes. This replaces the old serial warm-up here.
     If that prebuild fails, be-run.ps1 starts no module and exits non-zero:
     in the foreground local-run.ps1 then stops the frontend too, and with
     -Detach this script stops the frontend it started, stops waiting and
     exits 1 (see logs\be.log).
     Workarounds: BE_PREBUILD=0 (no prebuild, modules build themselves as
     before) or BE_PREBUILD_CONTINUE=1 (start anyway), as environment
     variables or in .run.env. With -Detach put them in .run.env: the
     detached sides are created through WMI and may not inherit variables
     set in this window (not verified).

Usage:
  .\dmes-up.cmd            # normal - Ctrl+C in this window stops everything
  .\dmes-up.cmd -Detach    # background; stop with .\dmes-down.cmd
  .\dmes-up.cmd -Warmup    # kept for compatibility - no-op (be-run.ps1 prebuilds every run)
  .\dmes-up.cmd -Full      # frontend re-runs pnpm install + build:libs
  .\dmes-up.cmd -Clean     # same as -Full (-Warmup part is a no-op)
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
# Module/port catalog: scripts\lib\modules.conf (rows whose platforms include ps1)
. (Join-Path $RootDir 'scripts\lib\modules.ps1')
$BePorts    = $DmesBeModules
$FePort     = $DmesPortalPort
if ($Clean) { $Full = $true }   # -Clean used to force -Warmup too; that part is now a no-op
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
    if ($seeded) { Say "seeded gradle-wrapper.jar into $seeded wrapper dir(s)" 'Yellow' }
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

# 4. run ---------------------------------------------------------------------
# The old serial warm-up (one Gradle run per module) used to sit before this
# step. be-run.ps1 now prebuilds all selected modules with a single Gradle run
# from the src\backend composite before starting them, which covers the
# fresh-clone case as well, and stops before starting anything if it fails.
if ($Be -and $PSBoundParameters.ContainsKey('Warmup')) { Say '-Warmup is no longer needed - be-run.ps1 prebuilds on every run' 'Yellow' }

$feArgs = if ($Full) { @('--all') } else { @('--all', '-q') }

if (-not $Detach) {
    Write-Host ''
    Say "portal  http://localhost:$FePort    login  admin / admin123"
    Say (($BePorts.Keys | ForEach-Object { "$_ $($BePorts[$_])" }) -join ' | ')
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
# The 8 minutes include be-run.ps1's prebuild (one Gradle run for all modules).
# If the backend launcher exits before its ports come up (prebuild failed, port
# could not be freed, ...), stop waiting and fail right away.
Say 'waiting for ports (up to 8 minutes, including the backend prebuild on a cold build) ...'
$pending = @()
if ($Be) { foreach ($k in $BePorts.Keys) { $pending += , @($k, $BePorts[$k]) } }
if ($Fe) { $pending += , @('portal', $FePort) }

$deadline = (Get-Date).AddMinutes(8)
$up       = @{}
while ((Get-Date) -lt $deadline -and $up.Count -lt $pending.Count) {
    if ($Be -and -not (Get-Process -Id $bePid -ErrorAction SilentlyContinue)) {
        $beDown = @($BePorts.Keys | Where-Object { -not $up.ContainsKey($_) })
        if ($beDown.Count) {
            Write-Host ''
            Say "backend exited before coming up (not up: $($beDown -join ' ')) - check logs\be.log" 'Red'
            Say 'prebuild failed? fix the error, or rerun with BE_PREBUILD=0 / BE_PREBUILD_CONTINUE=1' 'Red'
            # The frontend was started next to the backend and would otherwise keep
            # running with no backend behind it (the foreground local-run.ps1 stops
            # it in this case too). Same targets as step 3 for -Fe.
            if ($Fe -and $fePid) {
                Say 'stopping the frontend started above' 'Red'
                Stop-Tree $fePid
                $null = Stop-Prior -PathNeedle (Join-Path $LogDir '_launch-frontend.ps1') -NamePattern '^(cmd|powershell)'
                $null = Stop-Prior -PathNeedle (Join-Path $RootDir 'src\frontend') -NamePattern '^(node|pnpm)'
            }
            exit 1
        }
    }
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
    Say "portal  http://localhost:$FePort    login  admin / admin123"
    Say 'stop with .\dmes-down.cmd'
} else {
    $missing = @($pending | Where-Object { -not $up.ContainsKey($_[0]) } | ForEach-Object { "$($_[0]):$($_[1])" })
    Say "not up after 8 min: $($missing -join ' ')  - check logs\be.log and logs\fe.log" 'Red'
    exit 1
}
