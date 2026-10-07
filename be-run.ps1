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
    exit $ExitCode
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

# ── 드라이런 ─────────────────────────────────────────────────
# 이전 인스턴스 종료·포트 회수보다 앞에서 끝낸다 — 아무 프로세스도 끄거나 띄우지 않는다.
# 선빌드 태스크 목록을 보이려고 gradlew -m(계획만, 태스크 실행 없음)만 한 번 부른다.
if ($DryRun) {
    Write-DevLog 'be' "[dry-run] 기동 대상: $($Selected -join ' ')"
    $ports = ($Selected | ForEach-Object { $BeModules[$_] }) -join ' '
    if ($KeepPort) { Write-DevLog 'be' "[dry-run] 포트 점유 시 중단(--keep-port): $ports" }
    else           { Write-DevLog 'be' "[dry-run] 이전 be-run 인스턴스 종료 뒤 포트 회수: $ports" }

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
    exit 0
}

# ── 사전 점검 ────────────────────────────────────────────────
foreach ($m in $Selected) {
    $dir = Join-Path $BackendDir $m
    if (-not (Test-Path $dir)) { Write-DevError "디렉토리 누락: $dir"; exit 1 }
}
# local 프로파일 SQLite 경로 — 모든 모듈 application.yml 이 ../data/{모듈}.db 를 가리킨다.
$null = New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir 'data')


# ── 이전 실행 인스턴스 종료 ──────────────────────────────────
# 포트만 뺏으면 이전 be-run 이 "내 모듈이 다 죽었다" 고 판단해 뒤늦게 cleanup 을 돌린다.
# 그 cleanup 은 모듈 포트의 앱 JVM 을 정리하므로 방금 띄운 같은 포트의 모듈까지 함께 죽일 수 있다.
function Stop-PreviousBeRuns {
    $victims = @()
    try {
        $victims = @(Get-CimInstance Win32_Process -ErrorAction Stop |
                     Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match 'be-run\.ps1' } |
                     Select-Object -ExpandProperty ProcessId)
    } catch { return }
    if ($victims.Count -eq 0) { return }

    Write-DevLog 'be' "이전 be-run 인스턴스 종료 대기 (pid $($victims -join ' ')) — 그 cleanup 이 끝나야 안전하다"
    foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p }
    if (-not (Wait-ProcessExit -ProcessIds $victims -TimeoutSeconds 30)) {
        foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p -Force }
    }
}
Stop-PreviousBeRuns

# ── 포트 회수 ────────────────────────────────────────────────
function Clear-PortListener {
    param([int] $Port, [string] $Tag)
    $pids = Get-PortListenerPids -Port $Port
    if ($pids.Count -eq 0) { return $true }

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
    if (-not (Clear-PortListener -Port $BeModules[$m] -Tag "be-$m")) { exit 1 }
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
    foreach ($entry in $Running) {
        if ($entry.Process -and -not $entry.Process.HasExited) { Stop-ProcessTree -ProcessId $entry.Process.Id }
    }
    Wait-ProcessExit -ProcessIds @($Running | ForEach-Object { $_.Process.Id }) -TimeoutSeconds 10 | Out-Null
    foreach ($entry in $Running) {
        if ($entry.Process -and -not $entry.Process.HasExited) { Stop-ProcessTree -ProcessId $entry.Process.Id -Force }
        # 포트를 아직 물고 있는 이 체크아웃의 bootRun 앱 JVM 회수 (Gradle 데몬의 자식이라 cmd 트리 밖에 남는다).
        # 콘솔 JVM 은 taskkill(/F 없음)에 응하지 않으므로 종전처럼 바로 /F 로 끝낸다. 남의 체크아웃 리스너는 둔다.
        foreach ($p in (Get-PortListenerPids -Port $entry.Port)) {
            if (Test-OwnBackendJvm -ProcessId $p -Module $entry.Module) {
                Write-DevLog 'be' "$($entry.Tag) 포트 $($entry.Port) 앱 JVM 정리 (pid=$p)"
                Stop-ProcessTree -ProcessId $p -Force
            } else {
                Write-DevLog 'be' "$($entry.Tag) 포트 $($entry.Port) 리스너 pid=$p 는 이 체크아웃의 bootRun JVM 이 아니라 건드리지 않는다"
            }
        }
        foreach ($sub in $entry.Subscriptions) {
            Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue
            Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-QueuedLogs
    # Gradle 데몬은 멈추지 않는다 — gradlew --stop 은 같은 사용자·같은 Gradle 버전의 데몬을 모두 멈춰 다른 워크트리의
    # 빌드·시험을 깨뜨린다. bootRun 을 돌던 데몬은 쉬게 되고 org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
    Write-DevLog 'be' '정리 완료. (Gradle 데몬은 그대로 둔다 — 쉬면 10분 뒤 스스로 내려간다)'
}

try {
    foreach ($m in $Selected) { $Running += (Start-BackendModule -Module $m) }

    Write-DevLog 'be' "기동 대상: $($Selected -join ' ')"
    foreach ($m in $Selected) { Write-DevLog 'be' "  be-$m -> http://localhost:$($BeModules[$m])" }
    Write-DevLog 'be' '백엔드 기동 완료. Ctrl+C 로 종료.'

    # 모듈 하나가 죽어도 나머지는 계속 띄운다. 전부 죽었을 때만 빠져나온다.
    while ($true) {
        Write-QueuedLogs
        $alive = 0
        foreach ($entry in $Running) {
            if ($entry.Process.HasExited) {
                if (-not $entry.Reported) {
                    $entry.Reported = $true
                    Write-DevError "$($entry.Tag) 프로세스가 종료됐습니다 (exit=$($entry.Process.ExitCode)). 위 로그에서 원인을 확인하세요."
                    Write-DevError "  다시 띄우려면: .\be-run.ps1 --$($entry.Module)"
                }
            } else { $alive++ }
        }
        if ($alive -eq 0) {
            Write-DevError '실행 중인 백엔드 모듈이 없습니다 — 정리 후 종료합니다.'
            break
        }
        Start-Sleep -Milliseconds 400
    }
} finally {
    Invoke-Cleanup
}
