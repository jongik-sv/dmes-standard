#Requires -Version 5.1
<#
fe-run.ps1 — 프론트엔드 실행 스크립트 (Windows / fe-run.sh 대응)

사용법:
  .\fe-run.ps1              # .run.env 의 FE_RUN_ARGS 사용 (기본 --all)
  .\fe-run.ps1 --all        # pnpm install -> 화면 라이브러리 전체 build -> 전체 dev
  .\fe-run.ps1 --all -q     # 설치/빌드 건너뛰고 전체 dev 만 (dist 가 이미 있을 때)
  .\fe-run.ps1 --mpn -q     # MPN 만 (shared + m-mpn watch + mcm portal)
  .\fe-run.ps1 --install    # pnpm install 먼저 실행
  .\fe-run.ps1 --build      # build 수행
  .\fe-run.ps1 --clean      # m-mcm\.next 캐시 삭제
  .\fe-run.ps1 --no-install # pnpm install 건너뜀
  .\fe-run.ps1 --no-build   # install + build 모두 건너뛰고 바로 dev
  .\fe-run.ps1 -q           # quick dev (--no-build 와 동일)

종료: Ctrl+C 로 자식 프로세스(pnpm/node) 일괄 정리.
실행 정책 때문에 막히면 fe-run.cmd 를 쓴다.
#>
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $ScriptArgs)

$ErrorActionPreference = 'Stop'
$RootDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $RootDir 'src\frontend'
$McmDir      = Join-Path $FrontendDir 'm-mcm'
$RunEnvFile  = Join-Path $RootDir '.run.env'
$PortalPort  = 5100

function Write-DevLog  { param([string] $Message) Write-Host '[fe] ' -ForegroundColor Cyan -NoNewline; Write-Host $Message }
function Write-DevError { param([string] $Message) Write-Host '[error] ' -ForegroundColor Red -NoNewline; Write-Host $Message }

function Read-RunEnvValue {
    param([string] $Name)
    if (-not (Test-Path $RunEnvFile)) { return $null }
    foreach ($line in Get-Content -LiteralPath $RunEnvFile -Encoding UTF8) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") { return $Matches[1].Trim('"').Trim("'") }
    }
    return $null
}

function Get-PortListenerPids {
    param([int] $Port)
    $pids = @()
    try {
        $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
                  Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        $pids = @(netstat -ano -p TCP 2>$null | Select-String 'LISTENING' |
                  Where-Object { $_ -match ":$Port\s" } |
                  ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique)
    }
    return @($pids | Where-Object { $_ -and $_ -ne 0 -and $_ -ne $PID })
}

function Stop-ProcessTree {
    param([int] $ProcessId, [switch] $Force)
    if (-not $ProcessId) { return }
    $argList = @('/PID', $ProcessId, '/T')
    if ($Force) { $argList += '/F' }
    & taskkill.exe @argList 2>$null | Out-Null
}

function Wait-ProcessExit {
    param([int[]] $ProcessIds, [int] $TimeoutSeconds = 15)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (@($ProcessIds | Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) }).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

# pnpm --parallel 이 띄운 워커(tsup watch / next dev)는 중간에 재부모화돼 트리 추적을 벗어난다.
# 종료 시 이 저장소의 frontend 경로를 명령줄에 물고 있는 프로세스만 골라 한 번 더 쓸어 담는다.
function Stop-FrontendStragglers {
    param([switch] $Force)
    try {
        $victims = @(Get-CimInstance Win32_Process -ErrorAction Stop |
                     Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like "*$FrontendDir*" } |
                     Select-Object -ExpandProperty ProcessId)
    } catch { return }
    foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p -Force:$Force }
}

# ── 인자 파싱 ────────────────────────────────────────────────
if (-not $ScriptArgs -or $ScriptArgs.Count -eq 0) {
    $defaults = Read-RunEnvValue 'FE_RUN_ARGS'
    if ($defaults) {
        $ScriptArgs = $defaults -split '\s+' | Where-Object { $_ }
        Write-DevLog ".run.env 기본 옵션 사용: FE_RUN_ARGS=$defaults"
    } else {
        # .run.env 는 개인 설정이라 git 에 없다(.gitignore). --all 로 폴백한다.
        $ScriptArgs = @('--all')
        Write-DevLog '.run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)'
    }
}

$DoInstall = $false; $DoBuild = $false; $DoClean = $false; $DevScope = ''
foreach ($arg in $ScriptArgs) {
    switch -Regex ($arg) {
        '^--(all|full)$'      { $DevScope = 'all'; $DoBuild = $true; $DoInstall = $true }
        '^--(mpn|mpn-only)$'  { $DevScope = 'mpn' }
        '^--install$'         { $DoInstall = $true }
        '^--build$'           { $DoBuild = $true }
        '^--clean$'           { $DoClean = $true }
        '^--no-install$'      { $DoInstall = $false }
        '^(--no-build|-q)$'   { $DoBuild = $false; $DoInstall = $false }
        '^(-h|--help)$'       { Get-Help $MyInvocation.MyCommand.Path -Detailed; exit 0 }
        default               { Write-DevError "알 수 없는 옵션: $arg"; exit 2 }
    }
}
if (-not $DevScope) { Write-DevError 'FE 범위를 선택하세요: --all 또는 --mpn'; exit 2 }

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Write-DevError 'pnpm 이 설치되어 있지 않습니다.'; exit 1 }
if (-not (Test-Path $FrontendDir)) { Write-DevError "디렉토리 누락: $FrontendDir"; exit 1 }

# pnpm 은 pnpm.cmd / pnpm.ps1 로 풀리는 셸 런처라 CreateProcess 로 직접 띄우면 환경마다 실패한다.
# cmd.exe /c 로 감싸면 어느 설치 형태든 동일하게 동작한다.
function Start-Pnpm {
    param([string[]] $Arguments, [switch] $Wait)
    $cmdLine = '/c "pnpm ' + ($Arguments -join ' ') + '"'
    return Start-Process -FilePath $env:ComSpec -ArgumentList $cmdLine `
                         -WorkingDirectory $FrontendDir -NoNewWindow -PassThru -Wait:$Wait
}
function Invoke-Pnpm {
    param([string[]] $Arguments, [string] $FailMessage)
    $p = Start-Pnpm -Arguments $Arguments -Wait
    if ($p.ExitCode -ne 0) { Write-DevError $FailMessage; exit 1 }
}

# ── m-mcm 환경변수 부트스트랩 ────────────────────────────────
# NextAuth 는 AUTH_SECRET 이 없으면 기동 자체가 실패한다. .env / .env.local 이 하나도 없을 때만
# .env.example 을 복사해 만든다. 이미 있으면 절대 건드리지 않는다.
function Initialize-McmEnv {
    $envFile = Join-Path $McmDir '.env'
    if (Test-Path $envFile) { return }
    if (Test-Path (Join-Path $McmDir '.env.local')) { return }
    $sample = Join-Path $McmDir '.env.example'
    if (-not (Test-Path $sample)) {
        Write-DevError 'm-mcm\.env 가 없고 .env.example 도 없습니다. 환경변수를 직접 만들어 주세요.'
        exit 1
    }
    $bytes = New-Object 'System.Byte[]' 64
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 48)

    $header = @(
        '# fe-run.ps1 이 .env.example 로부터 자동 생성한 로컬 개발용 파일이다.',
        '# 실 프로젝트에서는 AUTH_SECRET 을 비롯한 값들을 반드시 새로 발급해 쓴다.'
    )
    $body = Get-Content -LiteralPath $sample -Encoding UTF8 |
            ForEach-Object { if ($_ -match '^AUTH_SECRET=') { "AUTH_SECRET=`"$secret`"" } else { $_ } }
    ($header + $body) | Set-Content -LiteralPath $envFile -Encoding UTF8

    Write-DevLog 'm-mcm\.env 생성 (.env.example 기반, AUTH_SECRET 자동 발급)'
    Write-DevLog '  운영/공유 환경에 쓸 값이 아니다. 실 프로젝트 착수 시 전부 교체할 것.'
}
Initialize-McmEnv

# ── install / build ──────────────────────────────────────────
if ($DoInstall) {
    Write-DevLog "pnpm install 실행 ($FrontendDir)"
    Invoke-Pnpm -Arguments @('install') -FailMessage 'pnpm install 실패'
}
if ($DoClean) {
    $nextDir = Join-Path $McmDir '.next'
    if (Test-Path $nextDir) {
        Write-DevLog "m-mcm\.next 캐시 삭제 ($nextDir)"
        Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
if ($DoBuild) {
    if ($DevScope -eq 'mpn') {
        Write-DevLog 'MPN 범위 빌드 실행 (shared + m-mpn)'
        Invoke-Pnpm -Arguments @('--filter', '@dk-oasis/shared', 'build') -FailMessage 'shared build 실패'
        Invoke-Pnpm -Arguments @('--filter', '@dk-oasis/m-mpn', 'build') -FailMessage 'm-mpn build 실패'
    } else {
        # 화면 라이브러리(dist)만 빌드한다. m-mcm 은 next dev 가 직접 컴파일한다.
        Write-DevLog '화면 라이브러리 전체 build 실행 (shared + m-mpn/m-mpp/m-mqc/m-mls/m-analog)'
        Invoke-Pnpm -Arguments @('build:libs') -FailMessage '라이브러리 build 실패'
    }
}

# ── dev 실행 ─────────────────────────────────────────────────
foreach ($p in (Get-PortListenerPids -Port $PortalPort)) {
    Write-DevLog "portal 포트 $PortalPort 점유 프로세스 종료 중 (pid=$p)"
    Stop-ProcessTree -ProcessId $p
}
if (-not (Wait-ProcessExit -ProcessIds (Get-PortListenerPids -Port $PortalPort) -TimeoutSeconds 10)) {
    foreach ($p in (Get-PortListenerPids -Port $PortalPort)) { Stop-ProcessTree -ProcessId $p -Force }
}

$devArgs = @('dev')
if ($DevScope -eq 'mpn') {
    $devArgs = @('--parallel', '--filter', '@dk-oasis/shared', '--filter', '@dk-oasis/m-mpn', '--filter', '@dk-oasis/mcm', 'dev')
    Write-DevLog 'MPN 범위 dev 실행 (shared + m-mpn watch + mcm portal)'
} else {
    Write-DevLog "전체 frontend dev 실행 (라이브러리 watch + mcm portal :$PortalPort)"
}

$devProc  = $null
$cleanedUp = $false
function Invoke-Cleanup {
    if ($script:cleanedUp) { return }
    $script:cleanedUp = $true
    Write-Host ''
    Write-DevLog '종료 신호 수신, 자식 프로세스 정리 중...'
    if ($devProc -and -not $devProc.HasExited) { Stop-ProcessTree -ProcessId $devProc.Id }
    if ($devProc) { Wait-ProcessExit -ProcessIds @($devProc.Id) -TimeoutSeconds 10 | Out-Null }
    if ($devProc -and -not $devProc.HasExited) { Stop-ProcessTree -ProcessId $devProc.Id -Force }
    # pnpm --parallel 워커 잔존분 정리 — 남겨두면 포트 5100 과 tsup watch 가 계속 물려 있다.
    Stop-FrontendStragglers
    Start-Sleep -Seconds 2
    Stop-FrontendStragglers -Force
    Write-DevLog '정리 완료.'
}

try {
    $devProc = Start-Pnpm -Arguments $devArgs
    Write-DevLog "dev 시작 (pid $($devProc.Id)) — http://localhost:$PortalPort"
    $devProc.WaitForExit()
} finally {
    Invoke-Cleanup
}
