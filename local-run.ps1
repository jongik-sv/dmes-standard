#Requires -Version 5.1
<#
local-run.ps1 — BE + FE 동시 실행 스크립트 (Windows / local-run.sh 대응)
                be-run.ps1 과 fe-run.ps1 을 함께 실행한다.

사용법:
  .\local-run.ps1              # .run.env 의 LOCAL_RUN_ARGS 사용 (기본 --all)
  .\local-run.ps1 --all        # BE 전체 모듈 + FE 전체 실행
  .\local-run.ps1 --all -q     # FE 설치/빌드 건너뛰고 전체 실행
  .\local-run.ps1 --clean      # FE m-mcm\.next 캐시 삭제
  .\local-run.ps1 --no-build   # FE install + build 건너뜀

백엔드만:  .\be-run.ps1 [--all|--mpn|--mcm|--mls|--mqc|--mpp|--analog]
프론트만:  .\fe-run.ps1 [--all|--mpn] [--install|--build|--clean|-q]

BE 대상 모듈은 .run.env 의 BE_RUN_ARGS 가 정한다 (본 스크립트 인자는 FE 로만 전달).

종료: Ctrl+C 한 번으로 BE/FE 자식 스크립트 일괄 정리.
#>
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $ScriptArgs)

$ErrorActionPreference = 'Stop'
$RootDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunEnvFile = Join-Path $RootDir '.run.env'
. (Join-Path $RootDir 'scripts\lib\modules.ps1')   # 모듈·포트 카탈로그(scripts\lib\modules.conf)

function Write-Launcher { param([string] $Message) Write-Host '[launcher] ' -ForegroundColor Green -NoNewline; Write-Host $Message }

function Read-RunEnvValue {
    param([string] $Name)
    if (-not (Test-Path $RunEnvFile)) { return $null }
    foreach ($line in Get-Content -LiteralPath $RunEnvFile -Encoding UTF8) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") { return $Matches[1].Trim('"').Trim("'") }
    }
    return $null
}

function Stop-ProcessTree {
    param([int] $ProcessId, [switch] $Force)
    if (-not $ProcessId) { return }
    $argList = @('/PID', $ProcessId, '/T')
    if ($Force) { $argList += '/F' }
    & taskkill.exe @argList 2>$null | Out-Null
}

# 자식 스크립트가 TERM 을 못 받고 죽으면 손자 프로세스가 고아로 남는다.
# 그러면 "프론트만 살아 있고 백엔드는 없는" 상태가 되어 화면은 뜨는데 로그인만 실패한다.
function Stop-RepoStragglers {
    param([switch] $Force)
    $needle = Join-Path $RootDir 'src'
    try {
        $victims = @(Get-CimInstance Win32_Process -ErrorAction Stop |
                     Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like "*$needle*" } |
                     Select-Object -ExpandProperty ProcessId)
    } catch { return }
    foreach ($p in $victims) { Stop-ProcessTree -ProcessId $p -Force:$Force }
}

$scopeArgs = @('--all', '--full', '--mpn', '--mpn-only')
$hasScope  = $false
foreach ($a in $ScriptArgs) { if ($scopeArgs -contains $a) { $hasScope = $true } }

if (-not $hasScope) {
    $defaults = Read-RunEnvValue 'LOCAL_RUN_ARGS'
    if ($defaults) {
        $ScriptArgs = @($defaults -split '\s+' | Where-Object { $_ }) + @($ScriptArgs | Where-Object { $_ })
        Write-Launcher ".run.env 기본 옵션 사용: LOCAL_RUN_ARGS=$defaults"
    } else {
        # .run.env 는 개인 설정이라 git 에 없다(.gitignore). --all 로 폴백한다.
        $ScriptArgs = @('--all') + @($ScriptArgs | Where-Object { $_ })
        Write-Launcher '.run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)'
    }
}

# FE 로 넘길 인자만 추린다. BE 모듈 플래그는 be-run.ps1 이 .run.env 에서 읽는다.
$feAllowed = @('--all','--full','--mpn','--mpn-only','--install','--build','--clean','--no-install','--no-build','-q')
# FE 범위 플래그와 겹치는 모듈(--mpn)은 FE 쪽으로 넘긴다 — 결과는 종전 목록(--mcm --mls --mqc --mpp --analog --keep-port)과 같다.
$beOnly    = @($DmesBeModules.Keys | ForEach-Object { '--' + $_ } | Where-Object { $feAllowed -notcontains $_ }) + @('--keep-port')
$FeArgs    = @()
foreach ($a in $ScriptArgs) {
    if ($feAllowed -contains $a) { $FeArgs += $a }
    elseif ($beOnly -contains $a) { }
    elseif ($a -in @('-h','--help')) { Get-Help $MyInvocation.MyCommand.Path -Detailed; exit 0 }
    else { Write-Host "알 수 없는 옵션: $a" -ForegroundColor Red; exit 2 }
}

$psExe     = (Get-Process -Id $PID).Path            # 현재 셸과 같은 PowerShell 로 자식 실행
if (-not $psExe) { $psExe = 'powershell.exe' }
$beScript  = Join-Path $RootDir 'be-run.ps1'
$feScript  = Join-Path $RootDir 'fe-run.ps1'
$beProc    = $null
$feProc    = $null
$cleanedUp = $false

function Invoke-Cleanup {
    if ($script:cleanedUp) { return }
    $script:cleanedUp = $true
    Write-Host ''
    Write-Launcher '종료 신호 수신, 자식 스크립트 정리 중...'
    foreach ($p in @($beProc, $feProc)) {
        if ($p -and -not $p.HasExited) { Stop-ProcessTree -ProcessId $p.Id }
    }
    Start-Sleep -Seconds 3
    foreach ($p in @($beProc, $feProc)) {
        if ($p -and -not $p.HasExited) { Stop-ProcessTree -ProcessId $p.Id -Force }
    }
    Stop-RepoStragglers
    Start-Sleep -Seconds 2
    Stop-RepoStragglers -Force
    Write-Launcher '정리 완료.'
}

try {
    $beProc = Start-Process -FilePath $psExe `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $beScript `
        -WorkingDirectory $RootDir -NoNewWindow -PassThru

    $feArgList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $feScript) + $FeArgs
    $feProc = Start-Process -FilePath $psExe -ArgumentList $feArgList `
        -WorkingDirectory $RootDir -NoNewWindow -PassThru

    Write-Launcher 'BE + FE 모두 기동. Ctrl+C 로 종료.'
    Write-Launcher "  포털 http://localhost:$DmesPortalPort  (초기 계정 admin / admin123)"
    Write-Launcher '  백엔드 기동에는 시간이 더 걸린다 — be-mcm 이 뜨기 전에는 로그인이 실패한다.'

    # 어느 쪽이 먼저 끝났는지 알려준다. 한쪽만 조용히 죽어 원인을 못 찾는 상황을 막는다.
    while ($true) {
        if ($beProc.HasExited) { Write-Host '[launcher] 백엔드(be-run.ps1)가 종료됐습니다. 위 [be] 로그에서 원인을 확인하세요.' -ForegroundColor Yellow; break }
        if ($feProc.HasExited) { Write-Host '[launcher] 프론트엔드(fe-run.ps1)가 종료됐습니다. 위 [fe] 로그에서 원인을 확인하세요.' -ForegroundColor Yellow; break }
        Start-Sleep -Seconds 1
    }
} finally {
    Invoke-Cleanup
}
