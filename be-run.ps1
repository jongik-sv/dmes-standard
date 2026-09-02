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

모듈 플래그: --mpn --mcm --mls --mqc --mpp --analog
--all 은 6개 JVM 을 동시에 띄운다. 메모리가 빠듯하면 필요한 모듈만 골라 쓴다.

대상 포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다.
  .\be-run.ps1 --keep-port  # 회수하지 않고 "점유 중" 으로 중단

종료: Ctrl+C 로 자식 프로세스 및 gradle daemon 일괄 정리.
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
# 신규 모듈을 추가하면 아래 2곳만 손보면 된다. (1) $BeModules  (2) $TagColors
$BeModules = [ordered]@{
    mls    = 8092
    mqc    = 8093
    mpp    = 8094
    mpn    = 8095
    mcm    = 8100
    analog = 8191
}
$TagColors = @{
    'be'        = 'Green'
    'be-mcm'    = 'Blue'
    'be-mpn'    = 'Magenta'
    'be-mls'    = 'Cyan'
    'be-mqc'    = 'Yellow'
    'be-mpp'    = 'Green'
    'be-analog' = 'DarkGray'
}

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
if (-not $ScriptArgs -or $ScriptArgs.Count -eq 0) {
    $defaults = Read-RunEnvValue 'BE_RUN_ARGS'
    if ($defaults) {
        $ScriptArgs = $defaults -split '\s+' | Where-Object { $_ }
        Write-DevLog 'be' ".run.env 기본 옵션 사용: BE_RUN_ARGS=$defaults"
    } else {
        # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
        # 인자 없이 바로 뜨도록 --all 로 폴백한다. .run.env.example 을 복사해 조정한다.
        $ScriptArgs = @('--all')
        Write-DevLog 'be' '.run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)'
    }
}

$Selected = New-Object System.Collections.Generic.List[string]
$KeepPort = $false
foreach ($arg in $ScriptArgs) {
    switch -Regex ($arg) {
        '^--(all|full)$'   { foreach ($m in $BeModules.Keys) { if (-not $Selected.Contains($m)) { $Selected.Add($m) } } }
        '^--keep-port$'    { $KeepPort = $true }
        '^--(mpn|mcm|mls|mqc|mpp|analog)$' {
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

# ── 사전 점검 ────────────────────────────────────────────────
foreach ($m in $Selected) {
    $dir = Join-Path $BackendDir $m
    if (-not (Test-Path $dir)) { Write-DevError "디렉토리 누락: $dir"; exit 1 }
}
# local 프로파일 SQLite 경로 — 모든 모듈 application.yml 이 ../data/{모듈}.db 를 가리킨다.
$null = New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir 'data')

# 모듈 전용 wrapper 가 있으면 그것을, 없으면 src\backend 공용 wrapper 를 쓴다.
function Get-ModuleGradlew {
    param([string] $Module)
    $local = Join-Path (Join-Path $BackendDir $Module) 'gradlew.bat'
    if (Test-Path $local) { return $local }
    return (Join-Path $BackendDir 'gradlew.bat')
}

# ── 이전 실행 인스턴스 종료 ──────────────────────────────────
# 포트만 뺏으면 이전 be-run 이 "내 모듈이 다 죽었다" 고 판단해 뒤늦게 cleanup 을 돌린다.
# 그 cleanup 의 `gradlew --stop` 은 전역이라 방금 띄운 모듈까지 함께 죽는다.
function Stop-PreviousBeRuns {
    $victims = @()
    try {
        $victims = @(Get-CimInstance Win32_Process -ErrorAction Stop |
                     Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match 'be-run\.ps1' } |
                     Select-Object -ExpandProperty ProcessId)
    } catch { return }
    if ($victims.Count -eq 0) { return }

    Write-DevLog 'be' "이전 be-run 인스턴스 종료 대기 (pid $($victims -join ' ')) — Gradle 데몬 정리까지 끝나야 안전하다"
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

function Stop-GradleDaemons {
    Write-DevLog 'be' 'gradle daemon 정리 중...'
    foreach ($m in $Selected) {
        $gradlew = Get-ModuleGradlew -Module $m
        $dir     = Join-Path $BackendDir $m
        try {
            Start-Process -FilePath $env:ComSpec `
                          -ArgumentList ('/c ""' + $gradlew + '" --stop"') `
                          -WorkingDirectory $dir -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
        } catch { }
    }
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
        # 포트를 아직 물고 있는 잔존 리스너까지 회수 (bootRun JVM 이 cmd 트리 밖으로 새는 경우)
        foreach ($p in (Get-PortListenerPids -Port $entry.Port)) { Stop-ProcessTree -ProcessId $p -Force }
        foreach ($sub in $entry.Subscriptions) {
            Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue
            Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-QueuedLogs
    Stop-GradleDaemons
    Write-DevLog 'be' '정리 완료.'
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
