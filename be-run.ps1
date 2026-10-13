#Requires -Version 5.1
<#
be-run.ps1 — 백엔드 모듈(local 프로파일) 실행 스크립트 (Windows / be-run.sh 대응)

실행 대상 모듈과 포트:
  mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mcm 8100 · analog 8191
  (mcm 이 포털 호스트 — FE 는 mcm 8100 을 본다)

사용법:
  .\be-run.ps1              # .run.env 의 BE_RUN_ARGS 사용 (기본 --all)
  .\be-run.ps1 --all        # 전체 모듈
  .\be-run.ps1 --mcm        # mcm 만
  .\be-run.ps1 --mcm --mpn  # 여러 모듈 조합
  .\be-run.ps1 --all --dry-run  # 아무것도 끄거나 띄우지 않고, 실행할 명령만 출력
  .\be-run.ps1 --dry-run        # 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all) 대상으로

모듈 플래그: --mpn --mcm --mls --mqc --mpp --analog
--all 은 6개 JVM 을 동시에 띄운다. 메모리가 빠듯하면 필요한 모듈만 골라 쓴다.
옵션(--dry-run·--keep-port)만 주고 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all)의 모듈을 쓴다.

모듈을 2개 이상 띄우면 기동 전에 src\backend 루트 composite 에서 Gradle 한 번으로 선빌드한다
(공유 includeBuild 를 여러 bootRun 이 동시에 빌드하지 않게). 건너뛰려면 BE_PREBUILD=0.
선빌드(또는 그 계획 gradlew -m)가 실패하면 아무 모듈도 띄우지 않고 0 이 아닌 코드로 끝난다.
  $env:BE_PREBUILD = '0'           # 선빌드 없이 종전처럼 모듈별 bootRun 이 각자 빌드
  $env:BE_PREBUILD_CONTINUE = '1'  # 선빌드가 실패해도 기동 (모듈 하나의 오류가 나머지를 막지 않게)
  (둘 다 .run.env 에 BE_PREBUILD=0 / BE_PREBUILD_CONTINUE=1 로 둬도 된다)

이미 돌고 있는 be-run 이 있어도 고른 모듈만 가져온다: 같은 체크아웃의 이전 be-run.ps1 은 끝내지 않고 그 모듈의
  gradlew 실행기·앱 JVM 만 내린다(모듈마다 .be-run\<모듈>.own 에 맡은 be-run·실행기 pid 를 남긴다). 이전 be-run 이 맡은
  다른 모듈은 계속 돈다. 맡은 모듈을 모두 다른 be-run 에 넘겨준 실행은 종료 코드 79 로 끝난다(be-run.sh 와 같다).
  표식(.be-run\<pid>.alive) 없이 뜬 예전 판 be-run.ps1 만 종전처럼 통째로 끝낸다. 다른 체크아웃의 be-run 은 건드리지 않는다.
  be-run.sh(Git Bash)와 pid 공간이 달라 같은 체크아웃에서 두 판을 섞어 쓰면 기록을 서로 알아보지 못한다.
무거운 명령 슬롯(heavy.mjs, 대책 J)은 이 판에서 쓰지 않는다: be-run.sh 도 Windows(실행 중인 JVM 이 쥔 jar 를 덮어쓰지 못한다)와
  종전 bootRun 방식은 이전 서버를 내린 뒤 빌드하고, 그때는 슬롯 대기 = 서버 정지 시간이라 슬롯 없이 빌드한다. 이 판은 늘 그 경우다
  (--build-only 도 없다). 선빌드가 Gradle 을 스스로 줄 세우는 것은 gradlew 쪽 규칙이다.

대상 포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다.
  .\be-run.ps1 --keep-port  # 회수하지 않고 "점유 중" 으로 중단

종료: Ctrl+C 로 이 실행이 띄운 것(gradlew 실행기·이 체크아웃의 bootRun 앱 JVM)만 정리한다.
  Gradle 데몬은 멈추지 않는다(gradlew --stop 은 같은 버전의 모든 데몬을 멈춰 다른 워크트리 빌드를 깬다).
  쉬는 데몬은 org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
실행 정책 때문에 막히면 be-run.cmd 를 쓰거나 다음처럼 실행한다.
  powershell -ExecutionPolicy Bypass -File .\be-run.ps1
#>
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $ScriptArgs)

$ErrorActionPreference = 'Stop'
$RootDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir 'src\backend'
$RunEnvFile = Join-Path $RootDir '.run.env'

# ── 모듈 카탈로그 ────────────────────────────────────────────
# 모듈·포트·로그 색은 scripts\lib\modules.conf 한 곳에 있다(be-run.sh 도 같은 파일을 읽는다). platforms 에 ps1 이
# 있는 줄만 쓴다 — mdm 은 아직 sh 전용이라 여기 --all 에 들지 않는다. 신규 모듈은 modules.conf 에 한 줄 더하면
# --<모듈> 플래그까지 따라온다(머리말과 "실행 대상을 선택하세요" 안내문은 따로 고친다).
. (Join-Path $RootDir 'scripts\lib\modules.ps1')
$BeModules = $DmesBeModules
$TagColors = @{ 'be' = 'Green' } + $DmesBeTagColors

# ── 로그 ─────────────────────────────────────────────────────
function Write-DevLog {
    param([string] $Tag, [string] $Message)
    $color = $TagColors[$Tag]
    if (-not $color) { $color = 'Cyan' }
    Write-Host "[$Tag] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}
function Write-DevError {
    param([string] $Message)
    Write-Host '[error] ' -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# ── .run.env 파싱 (셸 문법이지만 KEY="value" 형태만 읽으면 충분하다) ──
function Read-RunEnvValue {
    param([string] $Name)
    if (-not (Test-Path $RunEnvFile)) { return $null }
    foreach ($line in Get-Content -LiteralPath $RunEnvFile -Encoding UTF8) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") {
            return $Matches[1].Trim('"').Trim("'")
        }
    }
    return $null
}

# ── 프로세스 유틸 ────────────────────────────────────────────
function Get-PortListenerPids {
    param([int] $Port)
    $pids = @()
    try {
        $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
                  Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        # Get-NetTCPConnection 이 없는 구형 환경 폴백
        $pids = @(netstat -ano -p TCP 2>$null |
                  Select-String -Pattern "LISTENING" |
                  Where-Object { $_ -match ":$Port\s" } |
                  ForEach-Object { ($_ -split '\s+')[-1] } |
                  Sort-Object -Unique)
    }
    return @($pids | Where-Object { $_ -and $_ -ne 0 -and $_ -ne $PID })
}

function Stop-ProcessTree {
    param([int] $ProcessId, [switch] $Force)
    if (-not $ProcessId) { return }
    # taskkill /T 가 자식(gradle → java)까지 함께 정리한다.
    $argList = @('/PID', $ProcessId, '/T')
    if ($Force) { $argList += '/F' }
    & taskkill.exe @argList 2>$null | Out-Null
}

function Wait-ProcessExit {
    param([int[]] $ProcessIds, [int] $TimeoutSeconds = 15)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $alive = @($ProcessIds | Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) })
        if ($alive.Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

# ── 인자 파싱 ────────────────────────────────────────────────
# 인자가 없거나 옵션(--dry-run·--keep-port)뿐이면 모듈 대상은 기본값(BE_RUN_ARGS, 없으면 --all)에서 가져온다.
# 모듈 플래그·--help·모르는 인자가 하나라도 있으면 기본값을 붙이지 않는다.
$GivenArgs   = @($ScriptArgs | Where-Object { $_ })
$OptionsOnly = @($GivenArgs | Where-Object { $_ -notmatch '^--(dry-run|keep-port|pdb=.+)$' }).Count -eq 0
if ($OptionsOnly) {
    $defaults = Read-RunEnvValue 'BE_RUN_ARGS'
    if ($defaults) {
        $ScriptArgs = $GivenArgs + @($defaults -split '\s+' | Where-Object { $_ })
        Write-DevLog 'be' ".run.env 기본 옵션 사용: BE_RUN_ARGS=$defaults"
    } else {
        # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
        # 인자 없이 바로 뜨도록 --all 로 폴백한다. .run.env.example 을 복사해 조정한다.
        $ScriptArgs = $GivenArgs + @('--all')
        Write-DevLog 'be' '.run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)'
    }
}

$Selected = New-Object System.Collections.Generic.List[string]
$KeepPort = $false
$DryRun   = $false
foreach ($arg in $ScriptArgs) {
    switch -Regex ($arg) {
        '^--(all|full)$'   { foreach ($m in $BeModules.Keys) { if (-not $Selected.Contains($m)) { $Selected.Add($m) } } }
        '^--keep-port$'    { $KeepPort = $true }
        '^--dry-run$'      { $DryRun = $true }
        '^--pdb=(.+)$'     { $env:BE_ORA_PDB = $Matches[1] }
        # 모듈 플래그(--<모듈>)는 카탈로그에 있는 이름만 받는다. 위 패턴들과 겹치지 않는다(--all·--full 은 모듈 이름이 아니다).
        { $_ -like '--*' -and $BeModules.Contains($_.Substring(2)) } {
            $m = $arg.Substring(2)
            if (-not $Selected.Contains($m)) { $Selected.Add($m) }
        }
        '^(-h|--help)$'    { Get-Help $MyInvocation.MyCommand.Path -Detailed; exit 0 }
        default            { Write-DevError "알 수 없는 옵션: $arg"; exit 2 }
    }
}
if ($Selected.Count -eq 0) {
    Write-DevError 'BE 실행 대상을 선택하세요: --all 또는 --mpn/--mcm/--mls/--mqc/--mpp/--analog'
    exit 2
}

# ── Oracle PDB 접속값(oracle-1007 b6) ────────────────────────────
# BE_ORA_PDB(또는 --pdb=<PDB>)가 있으면 앱 JVM 이 물려받을 환경 변수로 접속값을 내보낸다. 없으면 아무것도 하지 않아
# 종전 SQLite 동작 그대로다. 값은 be-run.sh 와 같다: DMES_ORA_PDB·DMES_ORA_HOST·DMES_ORA_PORT·DMES_ORA_URL.
if ($env:BE_ORA_PDB) {
    $env:DMES_ORA_PDB  = $env:BE_ORA_PDB.ToUpper()
    if (-not $env:DMES_ORA_HOST) { $env:DMES_ORA_HOST = 'localhost' }
    if (-not $env:DMES_ORA_PORT) { $env:DMES_ORA_PORT = '1521' }
    $env:DMES_ORA_URL = "jdbc:oracle:thin:@//$($env:DMES_ORA_HOST):$($env:DMES_ORA_PORT)/$($env:DMES_ORA_PDB)"
    Write-DevLog 'be' "Oracle PDB 접속값 전달: $($env:DMES_ORA_URL)"
}

# 모듈 전용 wrapper 가 있으면 그것을, 없으면 src\backend 공용 wrapper 를 쓴다.
function Get-ModuleGradlew {
    param([string] $Module)
    $local = Join-Path (Join-Path $BackendDir $Module) 'gradlew.bat'
    if (Test-Path $local) { return $local }
    return (Join-Path $BackendDir 'gradlew.bat')
}

# ── 선빌드 ───────────────────────────────────────────────────
# 모듈마다 따로 bootRun 을 띄우면 Gradle 프로세스 여러 개가 공유 includeBuild(cactus-core·mcm-core·
# maru-mdm-engine 등)를 동시에 빌드하며 서로의 build\classes·jar 를 덮어쓴다. 그래서 모듈이 2개 이상이면
# 기동 전에 src\backend 루트 composite 에서 Gradle 한 번으로 bootRun 이 쓰는 산출물(classes·jar)을 먼저 만든다.
# includeBuild 의 실행 기록은 각 빌드 폴더의 .gradle 에 남으므로, 이어서 모듈 폴더에서 도는 bootRun 은
# 컴파일·jar 가 모두 UP-TO-DATE 라 기동만 한다(기동 방식·프로파일·로그는 종전 그대로).
# 선빌드할 태스크는 손으로 적지 않고, 선택 모듈의 bootRun 을 -m(실행 없이 계획만)으로 돌려 나온 태스크에서
# bootRun 만 뺀다. 계획이나 선빌드가 실패하면 기동하지 않고 끝난다(계획 실패 exit 1, 빌드 실패 exit <gradle 코드>) —
# 실패한 채 bootRun 을 띄우면 그 모듈들이 공유 includeBuild 를 다시 동시에 빌드해 이 단계가 없애려던 경합이 되살아난다.
# 종전처럼 실패해도 띄우려면 BE_PREBUILD_CONTINUE=1, 선빌드 자체를 끄려면 BE_PREBUILD=0.
# (dmes-up.ps1 의 직렬 warm-up 을 이 단계가 대신한다.)
$BackendGradlew = Join-Path $BackendDir 'gradlew.bat'
$script:PrebuildPlanOutput = @()

function Test-PrebuildEnabled {
    $flag = $env:BE_PREBUILD
    if (-not $flag) { $flag = Read-RunEnvValue 'BE_PREBUILD' }
    return ($flag -ne '0' -and $Selected.Count -ge 2)
}

function Test-PrebuildContinue {
    $flag = $env:BE_PREBUILD_CONTINUE
    if (-not $flag) { $flag = Read-RunEnvValue 'BE_PREBUILD_CONTINUE' }
    return ($flag -eq '1')
}

function Get-PrebuildPlanArgs {
    return @($Selected | ForEach-Object { ':{0}:api:bootRun' -f $_ })
}

# 선빌드할 태스크 목록. 계획 실패·빈 목록이면 빈 배열.
function Get-PrebuildTasks {
    $planArgs = Get-PrebuildPlanArgs
    # Gradle 은 경고를 stderr 로 쓴다. 'Stop' 아래에서 2>&1 로 받으면 NativeCommandError 로 스크립트가 멈추므로
    # 이 블록 안에서만 'Continue' 로 둔다.
    $script:PrebuildPlanOutput = @(& {
        $ErrorActionPreference = 'Continue'
        Push-Location $BackendDir
        try { & $BackendGradlew @planArgs '-m' '-q' '--console=plain' 2>&1 | ForEach-Object { "$_" } }
        finally { Pop-Location }
    })
    if ($LASTEXITCODE -ne 0) { return @() }

    $tasks = New-Object System.Collections.Generic.List[string]
    foreach ($line in $script:PrebuildPlanOutput) {
        $l = $line.TrimEnd("`r")
        if ($l -match '^(:\S+) SKIPPED$') {
            $task = $Matches[1]
            if ($task -notmatch ':bootRun$') { $tasks.Add($task) }
        }
    }
    return $tasks.ToArray()
}

function Write-PrebuildPlanFailure {
    Write-DevError '선빌드 계획(gradlew -m) 실패 — 아래 출력에서 원인을 확인하세요.'
    $script:PrebuildPlanOutput | Select-Object -Last 15 | ForEach-Object { Write-DevLog 'be-build' $_ }
}

# 선빌드가 실패했을 때: 기본은 아무것도 띄우지 않고 $ExitCode 로 끝낸다. BE_PREBUILD_CONTINUE=1 이면 기동을 이어 간다.
function Stop-OnPrebuildFailure {
    param([int] $ExitCode)
    if ($ExitCode -eq 0) { $ExitCode = 1 }
    if (Test-PrebuildContinue) {
        Write-DevError 'BE_PREBUILD_CONTINUE=1 — 선빌드 실패에도 모듈별 bootRun 으로 기동한다. 실패한 모듈은 자기 로그에 같은 오류를 다시 낸다.'
        return
    }
    Write-DevError "선빌드가 실패해 백엔드 모듈을 띄우지 않고 종료한다 (exit $ExitCode)."
    Write-DevError "  선빌드 없이 종전처럼 모듈별 bootRun 으로 띄우려면: `$env:BE_PREBUILD='0'; .\be-run.ps1 $(($Selected | ForEach-Object { '--' + $_ }) -join ' ')"
    Write-DevError '  선빌드 실패에도 기동을 이어 가려면: BE_PREBUILD_CONTINUE=1 (환경 변수 또는 .run.env)'
    Exit-BeRun $ExitCode
}

function Invoke-Prebuild {
    $tasks = @(Get-PrebuildTasks)
    if ($tasks.Count -eq 0) { Write-PrebuildPlanFailure; Stop-OnPrebuildFailure -ExitCode 1; return }

    Write-DevLog 'be' "선빌드 시작 (태스크 $($tasks.Count)개, Gradle 1회) — cwd=$BackendDir"
    & {
        $ErrorActionPreference = 'Continue'
        Push-Location $BackendDir
        try { & $BackendGradlew @tasks '--continue' '--console=plain' 2>&1 | ForEach-Object { Write-DevLog 'be-build' "$_" } }
        finally { Pop-Location }
    }
    $rc = $LASTEXITCODE
    if ($rc -eq 0) {
        Write-DevLog 'be' '선빌드 완료 — 이어서 모듈별 bootRun 은 컴파일 없이 기동한다.'
        return
    }
    Write-DevError "선빌드 실패 (exit=$rc) — 위 [be-build] 로그에서 원인을 확인하세요."
    Stop-OnPrebuildFailure -ExitCode $rc
}

# ── 모듈 소유 기록(be-run.sh 의 「모듈 소유 기록」 대응) ─────────
# 같은 체크아웃에서 be-run 을 여러 번 띄워도 모듈 하나만 다시 띄울 수 있게, 어느 be-run 이 어느 모듈을 맡았는지
# .be-run\<모듈>.own 에 한 줄로 남긴다: "<맡은 be-run pid> <gradlew 실행기(cmd) pid 또는 ->".
# 새 실행은 자기가 고른 모듈의 기록만 가져오고(그 모듈의 실행기·앱 JVM 만 내린다) 이전 be-run 은 끝내지 않는다.
# 이전 be-run 의 나머지 모듈은 계속 돌고, 모듈을 모두 빼앗긴 이전 be-run 은 종료 코드 79 로 끝난다(be-run.sh 와 같은 값).
# - 살아 있음 표식 .be-run\<pid>.alive 에는 그 프로세스의 시작 시각(FileTime)을 적어 pid 재사용과 구분한다.
#   표식이 없는 예전 판 be-run.ps1 은 종전처럼 끝낸다(아래 Stop-UnregisteredBeRuns).
# - 기록 읽기·쓰기는 .be-run\lock.ps1 파일(CreateNew 원자 생성, 최대 10초 대기)로 묶는다. 쥔 프로세스가 죽었거나
#   이 체크아웃의 be-run 이 아니면 낡은 잠금으로 보고 치운다. 살아 있는 be-run 의 잠금은 빼앗지 않는다.
# 주의: be-run.sh(Git Bash)와 pid 공간이 달라 같은 체크아웃에서 두 판을 섞어 쓰면 기록을 서로 알아보지 못한다(낡은 기록으로 무시된다).
$StateDir  = Join-Path $RootDir '.be-run'
$LockFile  = Join-Path $StateDir 'lock.ps1'
$script:LockHeld   = $false
$script:LockFailed = $false
$script:AnyTaken   = $false   # 내 모듈을 다른 be-run 이 가져간 적이 있으면 true — 끝날 때 79 로 알린다
$script:AnyDied    = $false   # 모듈이 스스로 비정상 종료한 적이 있으면 true — 이어받음이 이 오류를 가리지 않는다
$BeRunHandedOverRc = 79

function Get-ProcStartTicks {
    param([int] $ProcessId)
    try { return [string] (Get-Process -Id $ProcessId -ErrorAction Stop).StartTime.ToFileTimeUtc() } catch { return $null }
}

function Set-AliveMark {
    $null = New-Item -ItemType Directory -Force -Path $StateDir
    $ticks = Get-ProcStartTicks -ProcessId $PID
    if ($ticks) { [System.IO.File]::WriteAllText((Join-Path $StateDir "$PID.alive"), $ticks) }
}

function Clear-AliveMark {
    Remove-Item -LiteralPath (Join-Path $StateDir "$PID.alive") -Force -ErrorAction SilentlyContinue
}

# pid 가 이 체크아웃에서 도는 (표식이 있는 새 판) be-run.ps1 인지. 내 pid 면 참.
function Test-OwnBeRun {
    param([int] $ProcessId)
    if ($ProcessId -eq $PID) { return $true }
    $f = Join-Path $StateDir "$ProcessId.alive"
    if (-not (Test-Path -LiteralPath $f)) { return $false }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
        return $false
    }
    $want = Get-ProcStartTicks -ProcessId $ProcessId
    if (-not $want) { return $true }   # 살아 있지만 시작 시각을 못 읽는다(권한 등) — 표식을 믿는다
    try { return ([System.IO.File]::ReadAllText($f).Trim() -eq $want) } catch { return $false }
}

# 잠금 파일의 pid 문자열. 삭제를 막지 않게 FileShare.Delete 로 연다(읽는 쪽이 쥔 잠금을 못 지우는 일을 막는다).
function Read-LockHolder {
    try {
        $fs = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read,
            ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
        try { return (New-Object System.IO.StreamReader($fs)).ReadToEnd().Trim() } finally { $fs.Dispose() }
    } catch { return '' }
}

function Enter-StateLock {
    if ($script:LockFailed) { return $false }
    if ($script:LockHeld) { return $true }
    $null = New-Item -ItemType Directory -Force -Path $StateDir
    for ($i = 0; $i -lt 200; $i++) {
        try {
            $fs = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, ([System.IO.FileShare]::Read -bor [System.IO.FileShare]::Delete))
            try {
                $bytes = [System.Text.Encoding]::ASCII.GetBytes([string] $PID)
                $fs.Write($bytes, 0, $bytes.Length)
            } finally { $fs.Dispose() }
            $script:LockHeld = $true
            return $true
        } catch [System.IO.IOException] {
            $holder = Read-LockHolder
            if ($holder -match '^\d{1,9}$') {
                if ([int] $holder -eq $PID) { $script:LockHeld = $true; return $true }
                if (-not (Test-OwnBeRun -ProcessId ([int] $holder))) {
                    # 쥔 pid 를 다시 읽어 같은 소유자일 때만 치운다
                    try {
                        if ((Read-LockHolder) -eq $holder) { Remove-Item -LiteralPath $LockFile -Force -ErrorAction Stop }
                    } catch { }
                }
            } else {
                # 만든 직후(pid 를 아직 못 씀)일 수 있다 — 3초 넘게 비어 있으면 낡은 것으로 본다
                try {
                    if (((Get-Date) - (Get-Item -LiteralPath $LockFile -ErrorAction Stop).LastWriteTime).TotalSeconds -gt 3) {
                        Remove-Item -LiteralPath $LockFile -Force -ErrorAction Stop
                    }
                } catch { }
            }
        } catch { }
        Start-Sleep -Milliseconds 50
    }
    $script:LockFailed = $true
    return $false
}

function Exit-StateLock {
    if (-not $script:LockHeld) { return }
    # 기다리는 쪽이 잠깐 파일을 열고 있으면 지우기가 실패할 수 있다 — 되풀이해서 지운다(못 지우면 다른 be-run 이 10초 뒤 실패한다)
    for ($i = 0; $i -lt 40; $i++) {
        if ((Read-LockHolder) -ne [string] $PID) { break }
        try { Remove-Item -LiteralPath $LockFile -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 50 }
    }
    $script:LockHeld = $false
}

function Get-OwnFile { param([string] $Module) return (Join-Path $StateDir "$Module.own") }

# 모듈 기록을 [pscustomobject]@{ Run; Jvm } 로 읽는다(없거나 숫자가 아니면 빈 값). 파일은 Move 로 통째 바뀌므로 잠금 없이 읽어도 온전하다.
function Read-Own {
    param([string] $Module)
    $r = [pscustomobject]@{ Run = $null; Jvm = $null }
    $f = Get-OwnFile -Module $Module
    if (-not (Test-Path -LiteralPath $f)) { return $r }
    try {
        $parts = ([System.IO.File]::ReadAllText($f).Trim() -split '\s+')
        if ($parts.Count -ge 1 -and $parts[0] -match '^\d+$') { $r.Run = [int] $parts[0] }
        if ($parts.Count -ge 2 -and $parts[1] -match '^\d+$') { $r.Jvm = [int] $parts[1] }
    } catch { }
    return $r
}

# 기록을 쓴다(임시 파일 + Move). 잠금을 쥔 채 부른다. Jvm 이 $null 이면 "-".
function Write-Own {
    param([string] $Module, [int] $Run, $Jvm)
    $f = Get-OwnFile -Module $Module
    $tmp = "$f.$PID.tmp"
    $jv = if ($Jvm) { [string] $Jvm } else { '-' }
    try {
        [System.IO.File]::WriteAllText($tmp, "$Run $jv`n")
        Move-Item -LiteralPath $tmp -Destination $f -Force
    } catch { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

# 모듈을 다른 be-run 이 가져갔는지: 기록이 있고, 그 pid 가 내 것이 아니며, 그 be-run 이 살아 있는 이 체크아웃의 것일 때.
function Test-TakenByOther {
    param([string] $Module)
    $o = Read-Own -Module $Module
    if (-not $o.Run -or $o.Run -eq $PID) { return $false }
    return (Test-OwnBeRun -ProcessId $o.Run)
}

# 모듈을 내 것으로 기록하고 직전 기록을 돌려준다(읽기와 쓰기를 한 잠금 안에서). 잠금을 못 얻으면 기동하지 않고 끝낸다.
function Request-OwnClaim {
    param([string] $Module)
    if (-not (Enter-StateLock)) {
        $script:LockFailed = $true
        $h = Read-LockHolder
        Write-DevError "소유 기록 잠금($LockFile)을 얻지 못했다 — 쥔 be-run pid=$h. 그 be-run 이 끝난 뒤 다시 실행하세요."
        Exit-BeRun 1
    }
    try {
        $prev = Read-Own -Module $Module
        Write-Own -Module $Module -Run $PID -Jvm $null
    } finally { Exit-StateLock }
    return $prev
}

# 방금 띄운 실행기 pid 를 모듈 기록에 남긴다. 그사이 다른 be-run 이 모듈을 가져갔으면 쓰지 않고 $false.
function Set-OwnJvm {
    param([string] $Module, [int] $LauncherPid)
    if (-not (Enter-StateLock)) {
        Write-DevLog 'be' "be-$Module 소유 기록 잠금을 얻지 못해 실행기 pid 를 기록하지 못했다(기록은 - 로 남는다)."
        return $true
    }
    try {
        $o = Read-Own -Module $Module
        if ($o.Run -and $o.Run -ne $PID -and (Test-OwnBeRun -ProcessId $o.Run)) { return $false }
        Write-Own -Module $Module -Run $PID -Jvm $LauncherPid
        return $true
    } finally { Exit-StateLock }
}

# 내가 맡은 모듈의 기록을 지운다(다른 be-run 이 가져간 기록은 그대로 둔다).
function Remove-OwnClaims {
    if ($script:LockFailed) { return }
    if (-not (Enter-StateLock)) { return }
    try {
        foreach ($m in $Selected) {
            $o = Read-Own -Module $m
            if ($o.Run -eq $PID) { Remove-Item -LiteralPath (Get-OwnFile -Module $m) -Force -ErrorAction SilentlyContinue }
        }
    } finally { Exit-StateLock }
}

function Release-BeRunState {
    Remove-OwnClaims
    Clear-AliveMark
}

# 기록·표식을 거두고 끝낸다. 드라이런·사전 점검·선빌드 실패처럼 종료 처리(try/finally)에 들어가기 전의 종료는 모두 이것으로 끝낸다.
function Exit-BeRun {
    param([int] $Code)
    Release-BeRunState
    exit $Code
}

# 이 판의 살아 있음 표식을 최대한 일찍(드라이런 포함) 남긴다 — 다른 새 실행이 표식 없는 예전 판으로 오인해 끝내지 않게.
Set-AliveMark

# ── 드라이런 ─────────────────────────────────────────────────
# 이전 인스턴스 종료·포트 회수보다 앞에서 끝낸다 — 아무 프로세스도 끄거나 띄우지 않는다.
# 선빌드 태스크 목록을 보이려고 gradlew -m(계획만, 태스크 실행 없음)만 한 번 부른다.
if ($DryRun) {
    Write-DevLog 'be' "[dry-run] 기동 대상: $($Selected -join ' ')"
    $ports = ($Selected | ForEach-Object { $BeModules[$_] }) -join ' '
    if ($KeepPort) { Write-DevLog 'be' "[dry-run] 포트 점유 시 중단(--keep-port): $ports" }
    else           { Write-DevLog 'be' "[dry-run] 이전 be-run.ps1 은 끝내지 않고 고른 모듈의 실행기·앱 JVM 만 내린 뒤 포트 회수: $ports" }
    foreach ($m in $Selected) {
        $o = Read-Own -Module $m
        if ($o.Run -and $o.Jvm -and (Get-Process -Id $o.Jvm -ErrorAction SilentlyContinue)) {
            Write-DevLog 'be' "[dry-run]   be-$m`: be-run pid $($o.Run) 가 맡은 실행기 pid $($o.Jvm) 의 트리만 내린다(그 be-run 의 다른 모듈은 그대로)"
        } elseif ($o.Run) {
            Write-DevLog 'be' "[dry-run]   be-$m`: 이전 기록(be-run pid $($o.Run))은 있으나 살아 있는 실행기가 없다"
        } else {
            Write-DevLog 'be' "[dry-run]   be-$m`: 이전 기록 없음 — 포트 점유자만 회수한다(표식 없는 예전 판 be-run.ps1 은 종전처럼 종료)"
        }
    }

    if (Test-PrebuildEnabled) {
        Write-DevLog 'be' "[dry-run] 1) 선빌드 계획: (cd $BackendDir) $BackendGradlew $((Get-PrebuildPlanArgs) -join ' ') -m -q --console=plain"
        $tasks = @(Get-PrebuildTasks)
        if ($tasks.Count -gt 0) {
            Write-DevLog 'be' "[dry-run] 2) 선빌드 (Gradle 1회, 태스크 $($tasks.Count)개): (cd $BackendDir) $BackendGradlew <아래 태스크> --continue --console=plain"
            foreach ($t in $tasks) { Write-DevLog 'be' "[dry-run]      $t" }
        } else {
            Write-PrebuildPlanFailure
        }
        if (Test-PrebuildContinue) {
            Write-DevLog 'be' '[dry-run]    계획·선빌드가 실패해도 기동을 이어 간다 (BE_PREBUILD_CONTINUE=1).'
        } else {
            Write-DevLog 'be' '[dry-run]    계획·선빌드가 실패하면 아무 모듈도 띄우지 않고 종료 (우회: BE_PREBUILD=0 또는 BE_PREBUILD_CONTINUE=1).'
        }
    } else {
        Write-DevLog 'be' '[dry-run] 선빌드 생략 (모듈 1개 또는 BE_PREBUILD=0) — 종전처럼 bootRun 이 직접 빌드한다.'
    }

    Write-DevLog 'be' '[dry-run] 기동 순서 (각자 백그라운드, 로그 접두어 [be-<모듈>]):'
    foreach ($m in $Selected) {
        $gw = Get-ModuleGradlew -Module $m
        Write-DevLog 'be' "[dry-run]   be-$m :$($BeModules[$m]) — (cd $(Join-Path $BackendDir $m)) cmd /c `"`"$gw`" :api:bootRun --args=--spring.profiles.active=local --console=plain`""
    }
    Exit-BeRun 0
}

# ── 사전 점검 ────────────────────────────────────────────────
foreach ($m in $Selected) {
    $dir = Join-Path $BackendDir $m
    if (-not (Test-Path $dir)) { Write-DevError "디렉토리 누락: $dir"; Exit-BeRun 1 }
}
# local 프로파일 SQLite 경로 — 모든 모듈 application.yml 이 ../data/{모듈}.db 를 가리킨다.
$null = New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir 'data')


# ── 이전 실행 인스턴스 종료 ──────────────────────────────────
# 포트만 뺏으면 이전 be-run 이 "내 모듈이 다 죽었다" 고 판단해 뒤늦게 cleanup 을 돌린다.
# 그 cleanup 은 모듈 포트의 앱 JVM 을 정리하므로 방금 띄운 같은 포트의 모듈까지 함께 죽일 수 있다.
# 이번에 고른 모듈만 이전 be-run 에서 가져온다(위 「모듈 소유 기록」). 이전 be-run.ps1 은 끝내지 않으므로 그 be-run 이 맡은
# 다른 모듈은 계속 돈다. 기록을 앞서 내 것으로 바꿔 두므로 이전 be-run 의 늦은 cleanup 은 이 모듈을 건드리지 않는다.

# 표식(.alive)이 없는 예전 판 be-run.ps1 만 종전처럼 끝낸다. 표식이 있는 새 판은 건드리지 않는다.
# 나를 부른 조상(be-run.cmd·local-run.ps1 등)과 시작한 지 3초가 안 된 프로세스(표식을 만들기 전일 수 있다)도 건드리지 않는다.
function Stop-UnregisteredBeRuns {
    $procs = @()
    try {
        $procs = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    } catch { return }

    $ancestors = New-Object 'System.Collections.Generic.HashSet[int]'
    $cur = $PID
    for ($d = 0; $d -lt 10; $d++) {
        $p = $procs | Where-Object { $_.ProcessId -eq $cur } | Select-Object -First 1
        if (-not $p -or -not $p.ParentProcessId -or $p.ParentProcessId -le 0) { break }
        [void] $ancestors.Add([int] $p.ParentProcessId)
        $cur = [int] $p.ParentProcessId
    }

    $victims = @()
    foreach ($p in $procs) {
        $id = [int] $p.ProcessId
        if ($id -eq $PID -or $ancestors.Contains($id)) { continue }
        if (-not $p.CommandLine -or $p.CommandLine -notmatch 'be-run\.ps1') { continue }
        if ($p.Name -notmatch '^(powershell|pwsh)(\.exe)?$') { continue }   # be-run.ps1 을 인자로만 가진 다른 실행기는 be-run 이 아니다
        # 이 체크아웃의 스크립트(절대경로)를 -File 로 돌리는 것만 대상이다. 상대경로·다른 체크아웃·-Command 문자열은 건드리지 않는다.
        if ($p.CommandLine.IndexOf((Join-Path $RootDir 'be-run.ps1'), [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        if ($p.CommandLine -match '(?i)\s-(c|command)\s') { continue }
        if (Test-OwnBeRun -ProcessId $id) { continue }                        # 표식이 있는 새 판은 끝내지 않는다
        try {
            if ($p.CreationDate -and ((Get-Date) - $p.CreationDate).TotalSeconds -lt 3) { continue }
        } catch { }
        $victims += $id
    }
    if ($victims.Count -eq 0) { return }

    Write-DevLog 'be' "표식 없는 예전 판 be-run.ps1 인스턴스 종료 대기 (pid $($victims -join ' ')) — 그 cleanup 이 끝나야 안전하다"
    foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p }
    if (-not (Wait-ProcessExit -ProcessIds $victims -TimeoutSeconds 30)) {
        foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p -Force }
    }
}

# pid 가 bootRun 을 띄운 gradlew 실행기(cmd.exe /c … :api:bootRun)인지 — pid 재사용으로 남의 프로세스를 내리지 않게 확인한다.
function Test-BootRunLauncher {
    param([int] $ProcessId)
    try {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    } catch { return $false }
    if (-not $p -or $p.Name -notmatch '^cmd\.exe$') { return $false }
    $cmd = [string] $p.CommandLine
    # 이 체크아웃의 모듈 폴더에서 돈 gradlew 실행기만(다른 체크아웃의 실행기에 pid 가 재사용됐을 수 있다)
    return ($cmd -match ':api:bootRun' -and $cmd.IndexOf($BackendDir, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

# 이번에 고른 모듈을 이전 be-run 에서 가져온다: 기록을 내 것으로 바꾼 뒤, 이전에 맡았던 실행기 트리만 내린다.
# 앱 JVM(Gradle 데몬의 자식)은 이어지는 포트 회수가 내린다.
function Invoke-TakeOverModules {
    Stop-UnregisteredBeRuns
    $launchers = @()
    foreach ($m in $Selected) {
        $prev = Request-OwnClaim -Module $m     # 먼저 내 것으로 — 이전 be-run 의 늦은 cleanup 이 이 모듈을 못 건드린다
        if (-not $prev.Jvm -or $prev.Jvm -eq $PID) { continue }
        if (-not (Get-Process -Id $prev.Jvm -ErrorAction SilentlyContinue)) { continue }
        if (Test-BootRunLauncher -ProcessId $prev.Jvm) {
            Write-DevLog 'be' "be-$m 를 이전 be-run(pid $($prev.Run))에서 가져온다 — 실행기 pid=$($prev.Jvm) 만 내린다(그 be-run 의 다른 모듈은 그대로)"
            $launchers += [int] $prev.Jvm
        } else {
            Write-DevLog 'be' "be-$m 이전 기록의 pid=$($prev.Jvm) 는 bootRun 실행기가 아니라 건드리지 않는다 — 포트 회수가 맡는다"
        }
    }
    if ($launchers.Count -eq 0) { return }
    foreach ($p in $launchers) { Stop-ProcessTree -ProcessId $p }
    if (-not (Wait-ProcessExit -ProcessIds $launchers -TimeoutSeconds 10)) {
        foreach ($p in $launchers) { Stop-ProcessTree -ProcessId $p -Force }
    }
}
Invoke-TakeOverModules

# ── 포트 회수 ────────────────────────────────────────────────
function Clear-PortListener {
    param([int] $Port, [string] $Tag)
    $pids = Get-PortListenerPids -Port $Port
    if ($pids.Count -eq 0) { return $true }

    # 같은 모듈을 더 늦게 시작한 be-run 이 이미 가져갔다면 이 포트의 JVM 은 그쪽 것일 수 있다 — 진 쪽이 이긴 쪽 JVM 을 내리지 않는다.
    $mod = $Tag -replace '^be-', ''
    if (Test-TakenByOther -Module $mod) {
        Write-DevLog 'be' "$Tag 는 be-run(pid=$((Read-Own -Module $mod).Run))이 가져갔다 — 포트 $Port 점유 프로세스는 건드리지 않는다."
        return $true
    }

    if ($KeepPort) {
        Write-DevError "$Tag 가 사용할 포트 $Port 가 이미 점유 중입니다 (pid $($pids -join ' '))."
        Write-Host "        --keep-port 가 지정돼 회수하지 않습니다. 직접 정리한 뒤 다시 실행하세요." -ForegroundColor DarkGray
        return $false
    }

    foreach ($p in $pids) {
        # 무엇을 죽이는지 보이게 남긴다 — 예상 밖의 프로세스면 여기서 알아챌 수 있다.
        $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
        Write-DevLog 'be' "$Tag 포트 $Port 점유 프로세스 정리 (pid=$p) — $name"
        Stop-ProcessTree -ProcessId $p
    }
    if (-not (Wait-ProcessExit -ProcessIds $pids -TimeoutSeconds 10)) {
        foreach ($p in (Get-PortListenerPids -Port $Port)) {
            Write-DevLog 'be' "$Tag 포트 $Port 강제 종료 (pid=$p)"
            Stop-ProcessTree -ProcessId $p -Force
        }
    }
    Start-Sleep -Milliseconds 300
    if ((Get-PortListenerPids -Port $Port).Count -gt 0) {
        Write-DevError "$Tag 가 사용할 포트 $Port 를 비우지 못했습니다. 권한이 없는 프로세스일 수 있습니다."
        return $false
    }
    return $true
}

foreach ($m in $Selected) {
    if (-not (Clear-PortListener -Port $BeModules[$m] -Tag "be-$m")) { Exit-BeRun 1 }
}

# 포트 회수 뒤에 돈다 — Windows 는 실행 중인 JVM 이 쥔 jar 를 덮어쓰지 못한다.
# 선빌드가 실패하면 여기서 끝난다(BE_PREBUILD_CONTINUE=1 이면 계속). 아직 띄운 모듈이 없어 정리할 것도 없다.
if (Test-PrebuildEnabled) { Invoke-Prebuild }

# ── 실행 ─────────────────────────────────────────────────────
# gradlew.bat 은 배치 파일이라 CreateProcess 로 직접 띄울 수 없다 — 반드시 cmd.exe /c 로 감싼다.
# 자식 출력은 이벤트 핸들러에서 큐에 넣기만 하고, 콘솔 출력은 메인 루프가 담당한다
# (핸들러에서 Write-Host 를 부르면 런스페이스 문제로 출력이 유실된다).
$LogQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$Running  = @()   # 각 원소: Tag / Module / Process / Port / Subscriptions

function Start-BackendModule {
    param([string] $Module)

    $tag     = "be-$Module"
    $dir     = Join-Path $BackendDir $Module
    $gradlew = Get-ModuleGradlew -Module $Module

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $env:ComSpec
    # cmd /c "..." 안에서는 중첩 따옴표가 깨진다. 값에 공백이 없으므로 --args 는 따옴표 없이 넘긴다.
    $psi.Arguments              = '/c ""' + $gradlew + '" :api:bootRun --args=--spring.profiles.active=local --console=plain"'
    $psi.WorkingDirectory       = $dir
    $psi.UseShellExecute        = $false
    $psi.CreateNoWindow         = $true
    # 메인 서버 mcm 연결 풀(be-run.sh 와 같은 규칙): DMES_ORA_PDB 가 L_MAIN 이거나 BE_MCM_BIG_POOL=1 일 때 mcm 에만 넘긴다.
    # BE_MCM_BIG_POOL=0 이면 L_MAIN 이어도 쓰지 않는다. 레인·시험·E2E 는 yml 기본값(3)을 그대로 쓴다.
    if ($Module -eq 'mcm') {
        $bigPool = if ($env:BE_MCM_BIG_POOL -eq '0') { $false } elseif ($env:BE_MCM_BIG_POOL -eq '1') { $true } else { $env:DMES_ORA_PDB -eq 'L_MAIN' }
        if ($bigPool) {
            $poolMax  = if ($env:BE_MCM_POOL_MAX)          { $env:BE_MCM_POOL_MAX }          else { '8' }
            $poolMin  = if ($env:BE_MCM_POOL_MIN_IDLE)     { $env:BE_MCM_POOL_MIN_IDLE }     else { '2' }
            $poolIdle = if ($env:BE_MCM_POOL_IDLE_TIMEOUT) { $env:BE_MCM_POOL_IDLE_TIMEOUT } else { '60000' }
            $psi.EnvironmentVariables['SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE'] = $poolMax
            $psi.EnvironmentVariables['SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE']      = $poolMin
            $psi.EnvironmentVariables['SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT']      = $poolIdle
            Write-DevLog 'be' "be-mcm 연결 풀: max=$poolMax minIdle=$poolMin idleTimeout=${poolIdle}ms"
        }
    }
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo           = $psi
    $proc.EnableRaisingEvents = $true

    $handler = {
        if ($EventArgs.Data) {
            $Event.MessageData.Queue.Enqueue($Event.MessageData.Tag + "`t" + $EventArgs.Data)
        }
    }
    $payload = @{ Queue = $LogQueue; Tag = $tag }
    $subs = @(
        (Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -MessageData $payload -Action $handler),
        (Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived  -MessageData $payload -Action $handler)
    )

    [void] $proc.Start()
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()

    Write-DevLog 'be' "$tag 시작 (pid $($proc.Id)) — cwd=$dir : gradlew :api:bootRun"
    return [pscustomobject]@{
        Tag           = $tag
        Module        = $Module
        Process       = $proc
        Port          = $BeModules[$Module]
        Subscriptions = $subs
        Reported      = $false
        HandedOver    = $false
    }
}

function Write-QueuedLogs {
    $line = $null
    while ($LogQueue.TryDequeue([ref] $line)) {
        $parts = $line.Split([char]9, 2)
        if ($parts.Length -eq 2) { Write-DevLog $parts[0] $parts[1] } else { Write-Host $line }
    }
}

# pid 가 이 체크아웃의 모듈($Module) bootRun 앱 JVM 인지 (be-run.sh 의 is_own_backend_jvm 대응).
# bootRun 의 앱 JVM 은 cmd → gradlew 트리가 아니라 Gradle 데몬의 자식이라 실행기만 끊으면 남는다. 그래서 종료 때
# 모듈 포트의 리스너를 따로 정리하되, 다른 체크아웃(메인 저장소·다른 워크트리)의 같은 포트 서버는 건드리지 않는다.
# Windows 는 남의 프로세스 작업 디렉터리를 쉽게 못 읽으므로 명령줄로 본다 — 이름이 java(w) 이고 명령줄(또는 Gradle 이
# 긴 명령줄을 줄인 @인자 파일 내용)에 이 체크아웃의 모듈 폴더 경로 "<BackendDir>\<모듈>\" 가 들어 있을 때만 참.
# 워크트리는 <RootDir>\.claude\worktrees\·<RootDir>\dflow-<id8> 아래라 이 문자열을 서로 포함하지 않는다.
function Test-OwnBackendJvm {
    param([int] $ProcessId, [string] $Module)
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    } catch { return $false }
    if (-not $proc -or $proc.Name -notmatch '^javaw?\.exe$') { return $false }
    $cmd = [string] $proc.CommandLine
    if (-not $cmd) { return $false }

    $needle  = (Join-Path $BackendDir $Module) + '\'
    $escaped = $needle.Replace('\', '\\')   # 인자 파일은 경로의 \ 를 \\ 로 적기도 한다
    if ($cmd.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    foreach ($match in [regex]::Matches($cmd, '@("[^"]+"|\S+)')) {
        $argFile = $match.Groups[1].Value.Trim('"')
        try { $text = [System.IO.File]::ReadAllText($argFile) } catch { continue }
        if ($text.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        if ($text.IndexOf($escaped, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

$script:CleanedUp = $false
function Invoke-Cleanup {
    if ($script:CleanedUp) { return }
    $script:CleanedUp = $true

    Write-Host ''
    Write-DevLog 'be' '종료 신호 수신, 자식 프로세스 정리 중...'
    # 다른 be-run 이 가져간 모듈은 건드리지 않는다 — 이미 내려갔고 pid·포트는 그쪽 몫이다.
    foreach ($entry in $Running) {
        if (-not $entry.HandedOver -and (Test-TakenByOther -Module $entry.Module)) {
            $entry.HandedOver = $true
            $script:AnyTaken = $true
        }
    }
    $mine = @($Running | Where-Object { -not $_.HandedOver })
    foreach ($entry in $mine) {
        if ($entry.Process -and -not $entry.Process.HasExited) { Stop-ProcessTree -ProcessId $entry.Process.Id }
    }
    Wait-ProcessExit -ProcessIds @($mine | ForEach-Object { $_.Process.Id }) -TimeoutSeconds 10 | Out-Null
    foreach ($entry in $Running) {
        foreach ($sub in $entry.Subscriptions) {
            Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue
            Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue
        }
    }
    foreach ($entry in $mine) {
        if ($entry.Process -and -not $entry.Process.HasExited) { Stop-ProcessTree -ProcessId $entry.Process.Id -Force }
        # 포트를 아직 물고 있는 이 체크아웃의 bootRun 앱 JVM 회수 (Gradle 데몬의 자식이라 cmd 트리 밖에 남는다).
        # 콘솔 JVM 은 taskkill(/F 없음)에 응하지 않으므로 종전처럼 바로 /F 로 끝낸다. 남의 체크아웃 리스너는 둔다.
        # 내려보내기 직전에 소유를 다시 확인한다(그사이 다른 be-run 이 가져갔을 수 있다).
        if (Test-TakenByOther -Module $entry.Module) { $script:AnyTaken = $true; continue }
        foreach ($p in (Get-PortListenerPids -Port $entry.Port)) {
            if (Test-OwnBackendJvm -ProcessId $p -Module $entry.Module) {
                Write-DevLog 'be' "$($entry.Tag) 포트 $($entry.Port) 앱 JVM 정리 (pid=$p)"
                Stop-ProcessTree -ProcessId $p -Force
            } else {
                Write-DevLog 'be' "$($entry.Tag) 포트 $($entry.Port) 리스너 pid=$p 는 이 체크아웃의 bootRun JVM 이 아니라 건드리지 않는다"
            }
        }
    }
    Write-QueuedLogs
    Release-BeRunState
    # Gradle 데몬은 멈추지 않는다 — gradlew --stop 은 같은 사용자·같은 Gradle 버전의 데몬을 모두 멈춰 다른 워크트리의
    # 빌드·시험을 깨뜨린다. bootRun 을 돌던 데몬은 쉬게 되고 org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
    Write-DevLog 'be' '정리 완료. (Gradle 데몬은 그대로 둔다 — 쉬면 10분 뒤 스스로 내려간다)'
}

try {
    foreach ($m in $Selected) {
        if (Test-TakenByOther -Module $m) {
            # 기동을 기다리는 사이(선빌드 등)에 같은 모듈을 더 늦게 시작한 be-run 이 가져갔다 — 지면 띄우지 않는다.
            Write-DevLog 'be' "be-$m 는 be-run(pid=$((Read-Own -Module $m).Run))이 가져갔다 — 띄우지 않는다."
            $script:AnyTaken = $true
            continue
        }
        $entry = Start-BackendModule -Module $m
        $Running += $entry
        if (-not (Set-OwnJvm -Module $m -LauncherPid $entry.Process.Id)) {
            # 띄우는 사이에 같은 모듈을 다른 be-run 이 가져갔다 — 진 쪽이라 방금 띄운 실행기 트리를 내려 고아로 남기지 않는다.
            Write-DevLog 'be' "$($entry.Tag) 를 다른 be-run 이 먼저 가져갔다 — 방금 띄운 실행기(pid=$($entry.Process.Id))를 내린다."
            Stop-ProcessTree -ProcessId $entry.Process.Id -Force
            $entry.HandedOver = $true
            $script:AnyTaken = $true
        }
    }

    if ($Running.Count -eq 0 -and $script:AnyTaken) {
        Write-DevLog 'be' '고른 모듈을 모두 다른 be-run 이 가져갔다 — 이 실행은 끝낸다.'
        exit $BeRunHandedOverRc   # finally 의 cleanup 이 기록·표식을 거둔다
    }

    Write-DevLog 'be' "기동 대상: $($Selected -join ' ')"
    foreach ($m in $Selected) { Write-DevLog 'be' "  be-$m -> http://localhost:$($BeModules[$m])" }
    Write-DevLog 'be' '백엔드 기동 완료. Ctrl+C 로 종료.'

    # 모듈 하나가 죽어도 나머지는 계속 띄운다. 전부 죽었을 때만 빠져나온다.
    while ($true) {
        Write-QueuedLogs
        $alive = 0
        foreach ($entry in $Running) {
            if ($entry.HandedOver) { continue }
            # 모듈을 다른 be-run 이 가져갔으면(새 실행이 그 모듈만 다시 띄운 경우) 더 관리하지 않고 알리기만 한다.
            # 가져가는 쪽이 기록을 먼저 바꾼 뒤 내리므로, 실행기가 끝난 것보다 이 확인이 먼저다.
            if (Test-TakenByOther -Module $entry.Module) {
                $entry.HandedOver = $true
                $script:AnyTaken = $true
                Write-DevLog 'be' "$($entry.Tag) 는 be-run(pid=$((Read-Own -Module $entry.Module).Run))이 이어받았다 — 이 실행은 더 관리하지 않는다."
                continue
            }
            if ($entry.Process.HasExited) {
                if (-not $entry.Reported) {
                    $entry.Reported = $true
                    $script:AnyDied = $true
                    Write-DevError "$($entry.Tag) 프로세스가 종료됐습니다 (exit=$($entry.Process.ExitCode)). 위 로그에서 원인을 확인하세요."
                    Write-DevError "  다시 띄우려면: .\be-run.ps1 --$($entry.Module)"
                }
            } else { $alive++ }
        }
        if ($alive -eq 0) {
            if ($script:AnyTaken -and -not $script:AnyDied) {
                Write-DevLog 'be' '고른 모듈을 모두 다른 be-run 이 가져갔다 — 이 실행은 끝낸다.'
            } else {
                Write-DevError '실행 중인 백엔드 모듈이 없습니다 — 정리 후 종료합니다.'
            }
            break
        }
        Start-Sleep -Milliseconds 400
    }
} finally {
    Invoke-Cleanup
}
# 내 모듈을 다른 be-run 이 이어받아 끝나는 것이면 그 사실을 종료 코드로 알린다(be-run.sh 와 같은 값 79).
if ($script:AnyDied) { exit 1 }
if ($script:AnyTaken) { exit $BeRunHandedOverRc }
