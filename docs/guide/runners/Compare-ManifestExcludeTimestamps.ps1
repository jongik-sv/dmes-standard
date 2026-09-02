<#
.SYNOPSIS
  Compare-ManifestExcludeTimestamps — 두 manifest 디렉토리의 byte 동일성 검증
  (검증 5: lockedAt / runs 같은 시각성 필드 제외).

.DESCRIPTION
  manifest.lock.json 의 lockedAt 필드 / verify-report.json 의 runs[] 같이
  실행 시각에 의존하는 필드를 normalize 하여 hash 비교. R-14 의 *결정성 본질*
  을 측정하는 도구.

.PARAMETER DirA
  비교 디렉토리 1 (예: 23차/manifest/PJA005K)

.PARAMETER DirB
  비교 디렉토리 2 (예: 24차/manifest/PJA005K)

.NOTES
  PowerShell 5.1 호환. ConvertFrom-Json + 시각성 필드 제거 후 다시 stable
  stringify → 두 결과 SHA-256 비교.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)] [string] $DirA,
  [Parameter(Mandatory=$true)] [string] $DirB
)

$ErrorActionPreference = 'Stop'

$timestampFields = @{
  'manifest.lock.json'  = @('lockedAt')
  'verify-report.json'  = @('runs')
  'discover.trace.json' = @()
  'classify.trace.json' = @()
  'fallback.trace.json' = @()
  'q-stable-key.json'   = @()
  'index.json'          = @()
}

function Remove-Fields {
  param([Parameter(Mandatory=$true)] $Object, [string[]] $Fields)
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Collections.IDictionary]) {
    $copy = [ordered]@{}
    foreach ($k in @($Object.Keys)) {
      if ($Fields -notcontains $k) { $copy[$k] = $Object[$k] }
    }
    return $copy
  }
  if ($Object -is [PSCustomObject]) {
    $copy = [ordered]@{}
    foreach ($p in $Object.PSObject.Properties) {
      if ($Fields -notcontains $p.Name) { $copy[$p.Name] = $p.Value }
    }
    return $copy
  }
  return $Object
}

function Get-StableHash {
  param([Parameter(Mandatory=$true)] [string] $JsonText)
  $normalized = $JsonText.Trim() -replace "`r`n","`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-','').Substring(0,16)
  } finally { $sha.Dispose() }
}

function Get-FilteredHash {
  param([string] $Path, [string[]] $ExcludeFields)
  if (-not (Test-Path -LiteralPath $Path)) { return '<MISSING>' }
  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($ExcludeFields.Count -eq 0) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.Substring(0,16)
  }
  $obj = $raw | ConvertFrom-Json
  $filtered = Remove-Fields -Object $obj -Fields $ExcludeFields
  $reSerialized = $filtered | ConvertTo-Json -Depth 100 -Compress
  return Get-StableHash -JsonText $reSerialized
}

Write-Host "=== Compare-ManifestExcludeTimestamps ==="
Write-Host "DirA: $DirA"
Write-Host "DirB: $DirB"
Write-Host ""
Write-Host ("{0,-25} | {1,-18} | {2,-18} | {3,-12} | {4}" -f 'file','hash A (filtered)','hash B (filtered)','동일성','제외 필드')
Write-Host ('-' * 100)

$diffCount = 0
$totalCount = 0
foreach ($f in $timestampFields.Keys) {
  $excludes = $timestampFields[$f]
  $hashA = Get-FilteredHash -Path (Join-Path $DirA $f) -ExcludeFields $excludes
  $hashB = Get-FilteredHash -Path (Join-Path $DirB $f) -ExcludeFields $excludes
  $eq = if ($hashA -eq $hashB) { 'SAME' } else { 'DIFF'; $diffCount++ }
  if ($hashA -eq $hashB) { 'SAME' | Out-Null } else { $diffCount++ }
  $totalCount++
  $excText = if ($excludes.Count -eq 0) { '(원본 hash)' } else { "제외: $($excludes -join ',')" }
  Write-Host ("{0,-25} | {1,-18} | {2,-18} | {3,-12} | {4}" -f $f, $hashA, $hashB, $eq, $excText)
}
Write-Host ""
Write-Host "결과: $totalCount 파일 중 $($totalCount - $diffCount) SAME / $diffCount DIFF"
if ($diffCount -eq 0) {
  Write-Host "✓ 시각성 제외 byte 동일성 통과 (R-14 결정성 본질 ✓)"
  exit 0
} else {
  Write-Host "✗ 시각성 제외 후에도 차이 존재 — 진짜 결정성 위반"
  exit 1
}
