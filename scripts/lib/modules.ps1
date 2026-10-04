# scripts/lib/modules.ps1 — modules.conf(모듈·포트 카탈로그)를 읽는다 (dot-source 전용, 직접 실행하지 않는다)
#
#   . (Join-Path $RootDir 'scripts\lib\modules.ps1')
#
# 채우는 값 (platforms 에 ps1 이 있는 줄만):
#   $DmesBeModules    [ordered] 모듈 이름 → 포트(int). 파일 순서 = --all 기동 순서
#   $DmesBeTagColors  로그 태그 'be-<모듈>' → ConsoleColor 이름
#   $DmesPortalPort   프론트 포털 dev 포트(int)
# 같은 파일을 sh 쪽은 scripts/lib/modules.sh 가 읽는다 — 값은 modules.conf 한 곳에서만 고친다.

$DmesLibDir = $PSScriptRoot
if (-not $DmesLibDir) { $DmesLibDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$DmesModulesConf = Join-Path $DmesLibDir 'modules.conf'
if (-not (Test-Path -LiteralPath $DmesModulesConf)) {
    Write-Host '[error] ' -ForegroundColor Red -NoNewline
    Write-Host "모듈 카탈로그가 없습니다: $DmesModulesConf"
    exit 1
}

# modules.conf 의 중립 색 이름 → ConsoleColor 이름. 모르는 이름·'-' 는 Cyan(Write-Host 가 잘못된 색 이름에서 멈추지 않게).
function ConvertTo-DmesConsoleColor {
    param([string] $Name)
    $map = @{ green = 'Green'; blue = 'Blue'; magenta = 'Magenta'; cyan = 'Cyan'; yellow = 'Yellow'; red = 'Red'; dim = 'DarkGray' }
    $color = $map[$Name]
    if (-not $color -or -not [enum]::IsDefined([ConsoleColor], $color)) { return 'Cyan' }
    return $color
}

$DmesBeModules   = [ordered]@{}
$DmesBeTagColors = @{}
$DmesPortalPort  = 0
foreach ($raw in Get-Content -LiteralPath $DmesModulesConf -Encoding UTF8) {
    $line = $raw.Trim()   # Trim 이 CRLF 체크아웃의 줄 끝 \r 도 떼어 낸다
    if (-not $line -or $line.StartsWith('#')) { continue }
    $f = @($line -split '\s+')
    if ($f.Count -lt 5) { continue }
    if (@($f[4] -split ',') -notcontains 'ps1') { continue }
    if ($f[0] -eq 'be') {
        $DmesBeModules[$f[1]] = [int] $f[2]
        $DmesBeTagColors['be-' + $f[1]] = ConvertTo-DmesConsoleColor $f[3]
    } elseif ($f[0] -eq 'portal') {
        $DmesPortalPort = [int] $f[2]
    }
}
