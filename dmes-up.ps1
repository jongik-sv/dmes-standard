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
     Gradle 9.3.1 / Spring Boot 4). Looks in ~\.jdks first, then the current
     JAVA_HOME, then the usual install folders (Microsoft / Adoptium / Java).
  2. seed gradle-wrapper.jar where missing (.gitignore excludes *.jar, so a
     fresh clone has none: "Unable to access jarfile")
  3. start the local Oracle DB (Podman machine + tools\oracle-free compose)
     and open the PDB (BE_ORA_PDB, --pdb= in .run.env BE_RUN_ARGS, else
     L_MAIN). Skipped with -NoDb or when podman is not installed.
  4. free the dev ports
  5. run backend + frontend (foreground, or detached with -Detach)
     The PDB is passed to be-run.ps1 as --pdb=<PDB>.
     MDM (8096) is not in the ps1 module catalog, so it is started here as a
     separate detached Gradle bootRun once the backend prebuild is done (the
     first backend port is listening). It keeps running after Ctrl+C in the
     foreground mode; stop it with dmes-down.cmd. Skip it with -NoMdm.
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
  .\dmes-up.cmd -NoDb         # do not touch Podman / Oracle
  .\dmes-up.cmd -NoMdm        # do not start MDM
  .\dmes-up.cmd -Kure         # MDM with the KURE-v1 embedding model on (synonym
                              # recommendation stage 2). Needs ~1 GB more memory.
  .\dmes-up.cmd -Kure -KureMinScore 0.6   # also hide stage-2 candidates below 0.6
  .\dmes-up.cmd -Kure -KureModelDir D:\models\kure   # model folder (model.onnx + tokenizer.json)

KURE settings can also come from environment variables or .run.env:
  MDM_KURE=1                  same as -Kure
  MDM_EMBEDDING_MODEL_DIR     model folder (default %USERPROFILE%\.cache\kure-v1-onnx-int8)
  MDM_EMBEDDING_MIN_SCORE     minimum cosine similarity -1..1 (default -1 = no filter)
Synonym recommendation counts (with or without -Kure), env or .run.env, 1..100:
  MDM_RECOMMEND_STAGE1_TOP_N  stage 1 (name) candidates, default 5
  MDM_RECOMMEND_STAGE2_TOP_N  stage 2 (meaning) candidates, default 5
After the first start with -Kure, run the re-encode batch once (termMng
"execute") so stored terms get vectors; it skips terms already encoded.

Ports: portal 5100 | mls 8092 | mqc 8093 | mpp 8094 | mpn 8095 | mdm 8096 | mcm 8100 | analog 8191
Login: admin / admin123
#>
[CmdletBinding()]
param([switch] $Detach, [switch] $Warmup, [switch] $Full, [switch] $Clean, [switch] $Be, [switch] $Fe,
      [switch] $NoDb, [switch] $NoMdm,
      [switch] $Kure, [string] $KureModelDir = '', [string] $KureMinScore = '')

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

# .run.env is shell syntax; KEY="value" lines are enough here (same as be-run.ps1).
function Read-RunEnv {
    param([string] $Key)
    $file = Join-Path $RootDir '.run.env'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    foreach ($raw in Get-Content -LiteralPath $file) {
        if ($raw -match "^\s*$Key\s*=\s*[`"']?([^`"']*)[`"']?\s*$") { return $Matches[1] }
    }
    return $null
}

# MDM runs only from the sh scripts (modules.conf platforms 'sh'), so read its port directly.
$MdmPort = 0
foreach ($raw in Get-Content -LiteralPath (Join-Path $RootDir 'scripts\lib\modules.conf')) {
    if ($raw -match '^\s*be\s+mdm\s+(\d+)\s') { $MdmPort = [int] $Matches[1] }
}
$StartMdm = $Be -and -not $NoMdm -and $MdmPort -gt 0 -and (Test-Path (Join-Path $BackendDir 'mdm'))

# Oracle PDB: env BE_ORA_PDB > --pdb= in BE_RUN_ARGS > BE_ORA_PDB in .run.env > L_MAIN
$Pdb = $env:BE_ORA_PDB
if (-not $Pdb) { $a = Read-RunEnv 'BE_RUN_ARGS'; if ($a -match '--pdb=(\S+)') { $Pdb = $Matches[1] } }
if (-not $Pdb) { $Pdb = Read-RunEnv 'BE_ORA_PDB' }
if (-not $Pdb) { $Pdb = 'L_MAIN' }
$Pdb = $Pdb.ToUpper()

# KURE embedding model for MDM: parameter > environment variable > .run.env > default
$UseKure = $Kure -or $env:MDM_KURE -eq '1' -or (Read-RunEnv 'MDM_KURE') -eq '1'
if ($UseKure) {
    if (-not $KureModelDir) { $KureModelDir = $env:MDM_EMBEDDING_MODEL_DIR }
    if (-not $KureModelDir) { $KureModelDir = Read-RunEnv 'MDM_EMBEDDING_MODEL_DIR' }
    if (-not $KureModelDir) { $KureModelDir = Join-Path $env:USERPROFILE '.cache\kure-v1-onnx-int8' }
    foreach ($f in 'model.onnx', 'tokenizer.json') {
        if (-not (Test-Path -LiteralPath (Join-Path $KureModelDir $f))) {
            throw "KURE model file missing: $(Join-Path $KureModelDir $f). Download it as in poc\mdm-embedding-bench\README.md, or start without -Kure."
        }
    }
    if (-not $KureMinScore) { $KureMinScore = $env:MDM_EMBEDDING_MIN_SCORE }
    if (-not $KureMinScore) { $KureMinScore = Read-RunEnv 'MDM_EMBEDDING_MIN_SCORE' }
    if ($KureMinScore) {
        $n = 0.0
        $ok = [double]::TryParse($KureMinScore, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref] $n)
        if (-not $ok -or $n -lt -1 -or $n -gt 1) { throw "KureMinScore must be a number from -1 to 1 (got '$KureMinScore')." }
    }
}

# 1. JDK 21 ------------------------------------------------------------------
function Test-Jdk21 {
    param([string] $Dir)
    if (-not $Dir -or -not (Test-Path (Join-Path $Dir 'bin\java.exe'))) { return $false }
    $release = Join-Path $Dir 'release'
    if (Test-Path $release) { return [bool](Select-String -LiteralPath $release -Pattern 'JAVA_VERSION="21' -Quiet) }
    return ($Dir -match '21')
}
$candidates = @('C:\Users\DKSYSTEMS\.jdks\graalvm-jdk-21.0.7')
$candidates += @(Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -ErrorAction SilentlyContinue |
                 Where-Object { $_.Name -match '21' } | Select-Object -ExpandProperty FullName)
$candidates += $env:JAVA_HOME
foreach ($base in @("$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java")) {
    $candidates += @(Get-ChildItem $base -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
                     Sort-Object Name -Descending | Select-Object -ExpandProperty FullName)
}
$jdk = $candidates | Where-Object { Test-Jdk21 $_ } | Select-Object -First 1
if (-not $jdk) { Say 'JDK 21 not found (~\.jdks, JAVA_HOME, Program Files) - install it first' 'Red'; exit 1 }
$jdk = $jdk.TrimEnd('\')
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

# 3. local Oracle (Podman) ----------------------------------------------------
# Native podman writes progress to stderr; under 'Stop' that would abort, so run it in 'Continue'.
function Invoke-Native {
    param([scriptblock] $Block)
    & { $ErrorActionPreference = 'Continue'; & $Block 2>&1 | Out-String }
}
$OraContainer = 'oracle-26ai-free'
if ($Be -and -not $NoDb) {
    if (-not (Get-Command podman -ErrorAction SilentlyContinue)) {
        Say 'podman not found - skipping DB start (start Oracle yourself, or pass -NoDb)' 'Yellow'
    } else {
        $null = Invoke-Native { podman info }
        if ($LASTEXITCODE -ne 0) {
            Say 'starting Podman machine ...'
            $null = Invoke-Native { podman machine start }
        }
        $compose = Join-Path $RootDir 'tools\oracle-free\docker-compose.yml'
        $null = Invoke-Native { podman compose -f $compose up -d }
        if ($LASTEXITCODE -ne 0) { Say 'podman compose up failed - check: podman compose -f tools\oracle-free\docker-compose.yml up -d' 'Red'; exit 1 }

        Say "waiting for Oracle PDB $Pdb (up to 5 minutes) ..."
        $query = "set heading off feedback off`nselect open_mode from v`$pdbs where name='$Pdb';`nexit"
        $dbDeadline = (Get-Date).AddMinutes(5)
        $state = ''
        while ((Get-Date) -lt $dbDeadline) {
            $out = Invoke-Native { $query | podman exec -i $OraContainer sqlplus -s '/ as sysdba' }
            if ($out -match 'READ WRITE') { $state = 'open'; break }
            if ($out -match 'MOUNTED') {
                Say "opening PDB $Pdb" 'Yellow'
                $null = Invoke-Native { "alter pluggable database $Pdb open;`nalter pluggable database $Pdb save state;`nexit" | podman exec -i $OraContainer sqlplus -s '/ as sysdba' }
                continue
            }
            # connected but no row: the PDB does not exist (create it per README step 4)
            if ($out -notmatch 'ORA-|ERROR|SP2-' -and $out.Trim() -eq '') { $state = 'missing'; break }
            Start-Sleep -Seconds 5
        }
        if ($state -eq 'open')        { Say "Oracle ready: PDB $Pdb is open" }
        elseif ($state -eq 'missing') { Say "PDB $Pdb does not exist in $OraContainer - see README (Oracle step 4)" 'Red'; exit 1 }
        else                          { Say "Oracle PDB $Pdb not open after 5 min - check: podman logs $OraContainer" 'Red'; exit 1 }
    }
}

# 4. stop whatever this repo already has running ------------------------------
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
    $stopped += Stop-Prior -PathNeedle (Join-Path $LogDir '_launch-mdm.ps1') -NamePattern '^(cmd|powershell)'
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
if ($StartMdm) { $wanted += $MdmPort }
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

# 5. run ---------------------------------------------------------------------
# The old serial warm-up (one Gradle run per module) used to sit before this
# step. be-run.ps1 now prebuilds all selected modules with a single Gradle run
# from the src\backend composite before starting them, which covers the
# fresh-clone case as well, and stops before starting anything if it fails.
if ($Be -and $PSBoundParameters.ContainsKey('Warmup')) { Say '-Warmup is no longer needed - be-run.ps1 prebuilds on every run' 'Yellow' }

$feArgs = if ($Full) { @('--all') } else { @('--all', '-q') }
$beArgs = @('--all', "--pdb=$Pdb")

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
function Start-Shim {
    param([string[]] $Body, [string] $LogPath, [string] $Tag)

    $shim = Join-Path $LogDir "_launch-$Tag.ps1"
    @(
        "`$env:JAVA_HOME = '$jdk'"
        "`$env:PATH      = '$jdk\bin;' + `$env:PATH"
        "Set-Location '$RootDir'"
    ) + $Body | Set-Content -LiteralPath $shim -Encoding ASCII

    # WMI starts a small hidden outer PowerShell (escapes the caller's job object), which
    # starts the shim with Start-Process -WindowStyle Hidden and redirects its output.
    # No visible console: closing one would kill the server. (cmd.exe /c under a hidden
    # WMI window got a Ctrl+C right after start and stopped be-run.ps1.)
    $psExe = (Get-Command powershell.exe).Source
    $errPath = [IO.Path]::ChangeExtension($LogPath, '.err.log')
    $pidFile = "$shim.pid"
    Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
    $inner = "`$p = Start-Process -PassThru -FilePath '{0}' -WindowStyle Hidden -WorkingDirectory '{1}' -RedirectStandardOutput '{2}' -RedirectStandardError '{3}' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{4}'; Set-Content -LiteralPath '{5}' -Value `$p.Id" -f $psExe, $RootDir, $LogPath, $errPath, $shim, $pidFile
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
    $line  = '"{0}" -NoProfile -WindowStyle Hidden -EncodedCommand {1}' -f $psExe, $encoded
    $startup = ([wmiclass] 'root\cimv2:Win32_ProcessStartup').CreateInstance()
    $startup.ShowWindow = 0
    $res   = ([wmiclass] 'root\cimv2:Win32_Process').Create($line, $RootDir, $startup)
    if ($res.ReturnValue -ne 0) { Say "failed to start $Tag (WMI code $($res.ReturnValue))" 'Red'; exit 1 }
    # the outer PowerShell exits at once; return the shim's own pid
    $until = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $until -and -not (Test-Path -LiteralPath $pidFile)) { Start-Sleep -Milliseconds 300 }
    $shimPid = if (Test-Path -LiteralPath $pidFile) { [int] ((Get-Content -LiteralPath $pidFile -TotalCount 1).Trim()) } else { 0 }
    if (-not $shimPid) { Say "failed to start $Tag (no pid after 30s)" 'Red'; exit 1 }
    return $shimPid
}

function Start-Side {
    param([string] $Script, [string[]] $Arguments, [string] $LogPath, [string] $Tag)
    $call = "& '" + (Join-Path $RootDir $Script) + "' " + ($Arguments -join ' ')
    return Start-Shim -Body @($call) -LogPath $LogPath -Tag $Tag
}

# MDM is always detached: it waits for the backend prebuild (first backend port
# listening, at most 10 min) so two Gradle runs do not rebuild the shared
# included builds at the same time, then runs `gradlew :api:bootRun`.
function Start-Mdm {
    $mdmDir  = Join-Path $BackendDir 'mdm'
    $gradlew = if (Test-Path (Join-Path $mdmDir 'gradlew.bat')) { Join-Path $mdmDir 'gradlew.bat' } else { Join-Path $BackendDir 'gradlew.bat' }
    $ports   = ($BePorts.Values | ForEach-Object { "$_" }) -join ','
    $body = @(
        "`$env:DMES_ORA_PDB  = '$Pdb'"
        "`$env:DMES_ORA_HOST = 'localhost'"
        "`$env:DMES_ORA_PORT = '1521'"
        "`$env:DMES_ORA_URL  = 'jdbc:oracle:thin:@//localhost:1521/$Pdb'"
    )
    # KURE on: Spring reads these through relaxed binding (mdm.embedding.encoder / model-dir / min-score).
    if ($UseKure) {
        $body += "`$env:MDM_EMBEDDING_ENCODER   = 'onnx'"
        $body += "`$env:MDM_EMBEDDING_MODEL_DIR = '$KureModelDir'"
        if ($KureMinScore) { $body += "`$env:MDM_EMBEDDING_MIN_SCORE = '$KureMinScore'" }
    }
    # Recommendation counts (1..100 each): environment variable > .run.env > application.yml default 5.
    foreach ($k in 'MDM_RECOMMEND_STAGE1_TOP_N', 'MDM_RECOMMEND_STAGE2_TOP_N') {
        $v = [Environment]::GetEnvironmentVariable($k)
        if (-not $v) { $v = Read-RunEnv $k }
        if ($v) {
            if ($v -notmatch '^\d+$' -or [int] $v -lt 1 -or [int] $v -gt 100) { throw "$k must be a whole number from 1 to 100 (got '$v')." }
            $body += "`$env:$k = '$v'"
        }
    }
    $body += @(
        "`$until = (Get-Date).AddMinutes(10)"
        "while ((Get-Date) -lt `$until -and -not (Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 3 }"
        "Set-Location '$mdmDir'"
        "& '$gradlew' :api:bootRun --args='--spring.profiles.active=local'"
    )
    return Start-Shim -Body $body -LogPath (Join-Path $LogDir 'be-mdm-run.log') -Tag 'mdm'
}

if ($StartMdm) {
    $mdmPid = Start-Mdm
    Say "mdm      queued  (pid $mdmPid, starts after the backend prebuild)  -> logs\be-mdm-run.log"
    if ($UseKure) {
        $minText = if ($KureMinScore) { $KureMinScore } else { 'none' }
        Say "mdm      KURE embedding on  (model $KureModelDir, min score $minText)"
    }
}

if (-not $Detach) {
    Write-Host ''
    Say "portal  http://localhost:$FePort    login  admin / admin123"
    Say (($BePorts.Keys | ForEach-Object { "$_ $($BePorts[$_])" }) -join ' | ')
    Say 'Ctrl+C stops backend and frontend together'
    if ($StartMdm) { Say "mdm $MdmPort runs detached - stop it with .\dmes-down.cmd" 'Yellow' }
    Write-Host ''
    if ($Be -and $Fe) {
        # local-run.ps1 hands BE_RUN_ARGS from .run.env to be-run.ps1; make sure the PDB reaches it.
        if (-not $env:BE_ORA_PDB) { $env:BE_ORA_PDB = $Pdb }
        & (Join-Path $RootDir 'local-run.ps1') @feArgs
    }
    elseif ($Be)      { & (Join-Path $RootDir 'be-run.ps1') @beArgs }
    else              { & (Join-Path $RootDir 'fe-run.ps1') @feArgs }
    exit $LASTEXITCODE
}

if ($Be) {
    $bePid = Start-Side -Script 'be-run.ps1' -Arguments $beArgs -LogPath (Join-Path $LogDir 'be.log') -Tag 'backend'
    Say "backend  started (pid $bePid)  -> logs\be.log"
}
if ($Fe) {
    $fePid = Start-Side -Script 'fe-run.ps1' -Arguments $feArgs -LogPath (Join-Path $LogDir 'fe.log') -Tag 'frontend'
    Say "frontend started (pid $fePid)  -> logs\fe.log"
}

# wait for readiness ---------------------------------------------------------
# The 10 minutes include be-run.ps1's prebuild (one Gradle run for all modules).
# If the backend launcher exits before its ports come up (prebuild failed, port
# could not be freed, ...), stop waiting and fail right away.
Say 'waiting for ports (up to 10 minutes, including the backend prebuild on a cold build) ...'
$pending = @()
if ($Be) { foreach ($k in $BePorts.Keys) { $pending += , @($k, $BePorts[$k]) } }
if ($StartMdm) { $pending += , @('mdm', $MdmPort) }
if ($Fe) { $pending += , @('portal', $FePort) }

$deadline = (Get-Date).AddMinutes(10)
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
            if ($StartMdm -and $mdmPid) { Say 'stopping the queued mdm' 'Red'; Stop-Tree $mdmPid }
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
    Say "not up after 10 min: $($missing -join ' ')  - check logs\be.log and logs\fe.log" 'Red'
    exit 1
}
