<#
.SYNOPSIS
  Auto Manifest Runner (R14-Runner) — deterministic manifest generator
  for {CLIENT} MES design pipeline (00 §0.2 / 01 A.8 / Auto-Manifest-Runner.spec.md).

.DESCRIPTION
  외부 deterministic Runner. Agent 가 아닌 본 Runner 만이 manifest 9 파일의 결정 주체.
  동일 입력 -> 동일 byte (SHA-256) 출력 강제.

.PARAMETER SourceRoot
  As-Is 자료 루트 (절대경로)

.PARAMETER ModuleId
  00 §0.2.2 결정 결과 (예: 'mpp')

.PARAMETER TargetKey
  00 §0.2.4 결정 결과 (예: 'PJA005K')

.PARAMETER AsIsId
  As-Is 식별자 (선택 — 미제공 시 TargetKey 사용)

.PARAMETER OutputRoot
  docs 루트 (default 'docs')

.PARAMETER VerifyRuns
  재실행 회수 (default 2 / min 1 / max 10)

.NOTES
  PowerShell 5.1 (Windows PowerShell) 호환.
  ConvertTo-Json 미사용 — 자체 ConvertTo-StableJson 구현.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)] [string] $SourceRoot   = '',
  [Parameter(Mandatory=$true)]  [string] $ModuleId,
  [Parameter(Mandatory=$true)]  [string] $TargetKey,
  [string] $AsIsId       = '',
  [string] $OutputRoot   = 'docs',
  [int]    $VerifyRuns   = 2,
  [string] $ConfigPath   = '',
  [string] $ProjectRoot  = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 1.0

# ============================================================================
# §0. Constants (정본 enum)
# ============================================================================

$Script:SchemaVersion = '1.0.0'
$Script:RunnerVersion = '1.0.0'

# FILE_TYPE enum (01 A.8.2 discoveredFiles[].role)
$Script:FileTypeEnum = @(
  'designer.cs', 'cs', 'resx', 'sp.sql', 'ddl.sql',
  'entity.ts',   'mapping.md', 'capture.png'
)

# 제외 토큰 (R14-Runner 원칙 6 + .NET build artifact + assembly metadata)
$Script:ExcludeTokens = @(
  'backup', 'old', 'temp', 'sample', 'test', 'copy', 'bak', 'deprecated',
  'obj', 'bin', 'properties', '.vs', 'packages'
)

# moduleId 형식 (00 §0.2.2 검증)
$Script:ModuleIdRegex = '^[a-z][a-z0-9]{2,15}$'

# ============================================================================
# §1. Helpers — Logger / SHA256 / NFC
# ============================================================================

$Script:LogEntries = New-Object System.Collections.ArrayList

function Write-RunnerLog {
  param(
    [ValidateSet('INFO','WARN','ERROR','FATAL')] [string] $Level,
    [string] $StepName,
    [string] $Message
  )
  $iso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $line = "[$iso] [$Level] [$StepName] $Message"
  Write-Host $line
  [void]$Script:LogEntries.Add($line)
}

function Get-FileSha256 {
  param([Parameter(Mandatory=$true)] [string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToUpper()
}

function Get-StringSha256 {
  param([Parameter(Mandatory=$true)] [string] $Text)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-','')
  } finally { $sha.Dispose() }
}

function ConvertTo-Nfc {
  param([string] $Text)
  if ([string]::IsNullOrEmpty($Text)) { return $Text }
  return $Text.Normalize([System.Text.NormalizationForm]::FormC)
}

function ConvertTo-ForwardSlash {
  param([string] $Path)
  return $Path -replace '\\','/'
}

# ============================================================================
# §2. ConvertTo-StableJson — deterministic JSON stringifier (spec §7)
# ============================================================================

function Format-JsonNumber {
  param([Parameter(Mandatory=$true)] $Value)
  if ($Value -is [bool])   { if ($Value) { return 'true' } else { return 'false' } }
  if ($Value -is [int] -or $Value -is [long]) { return $Value.ToString([System.Globalization.CultureInfo]::InvariantCulture) }
  $s = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:R}', $Value)
  return $s
}

function Format-JsonString {
  param([string] $Value)
  if ($null -eq $Value) { return 'null' }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $Value.ToCharArray()) {
    switch ($ch) {
      '"'      { [void]$sb.Append('\"');  break }
      '\'      { [void]$sb.Append('\\');  break }
      "`b"     { [void]$sb.Append('\b');  break }
      "`f"     { [void]$sb.Append('\f');  break }
      "`n"     { [void]$sb.Append('\n');  break }
      "`r"     { [void]$sb.Append('\r');  break }
      "`t"     { [void]$sb.Append('\t');  break }
      default {
        $code = [int][char]$ch
        if ($code -lt 0x20) {
          [void]$sb.Append(('\u{0:x4}' -f $code))
        } else {
          [void]$sb.Append($ch)
        }
      }
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function ConvertTo-StableJson {
  param(
    [Parameter(Mandatory=$true)] [AllowNull()] $Value,
    [int] $Indent = 0
  )
  $pad      = '  ' * $Indent
  $padInner = '  ' * ($Indent + 1)

  if ($null -eq $Value) { return 'null' }

  if ($Value -is [bool] -or $Value -is [int] -or $Value -is [long] -or
      $Value -is [double] -or $Value -is [decimal]) {
    return Format-JsonNumber -Value $Value
  }

  if ($Value -is [string]) { return Format-JsonString -Value $Value }

  if ($Value -is [System.Collections.IDictionary]) {
    if ($Value.Count -eq 0) { return '{}' }
    $keys = @($Value.Keys) | Sort-Object -Culture en-US -CaseSensitive
    $parts = @()
    foreach ($k in $keys) {
      $v = ConvertTo-StableJson -Value $Value[$k] -Indent ($Indent + 1)
      $parts += "$padInner$(Format-JsonString -Value $k): $v"
    }
    return "{`n" + ($parts -join ",`n") + "`n$pad}"
  }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $items = @($Value)
    if ($items.Count -eq 0) { return '[]' }
    $parts = @()
    foreach ($item in $items) {
      $v = ConvertTo-StableJson -Value $item -Indent ($Indent + 1)
      $parts += "$padInner$v"
    }
    return "[`n" + ($parts -join ",`n") + "`n$pad]"
  }

  if ($Value -is [PSCustomObject]) {
    $dict = [ordered]@{}
    foreach ($p in $Value.PSObject.Properties) { $dict[$p.Name] = $p.Value }
    return ConvertTo-StableJson -Value $dict -Indent $Indent
  }

  return Format-JsonString -Value ([string]$Value)
}

function Write-StableJsonFile {
  param(
    [Parameter(Mandatory=$true)] [string] $Path,
    [Parameter(Mandatory=$true)] $Object
  )
  $json = ConvertTo-StableJson -Value $Object -Indent 0
  $json = $json -replace "`r`n","`n"
  if (-not $json.EndsWith("`n")) { $json += "`n" }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Write-LogFile {
  param([Parameter(Mandatory=$true)] [string] $Path)
  $text = ($Script:LogEntries -join "`n")
  if (-not $text.EndsWith("`n")) { $text += "`n" }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $text, $utf8NoBom)
}

# ============================================================================
# §3. Sort helpers (spec §5)
# ============================================================================

function Sort-OrdinalAsc {
  param(
    [Parameter(Mandatory=$true)] [System.Collections.IEnumerable] $InputObject,
    [string] $Property
  )
  if ([string]::IsNullOrEmpty($Property)) {
    return @($InputObject) | Sort-Object -Culture en-US -CaseSensitive
  }
  return @($InputObject) | Sort-Object -Culture en-US -CaseSensitive -Property $Property
}

# ============================================================================
# §4. Stage 1 — Resolve inputs (TargetKey / ModuleId / AsIsId)
# ============================================================================

function Find-SourceRoot {
  param(
    [Parameter(Mandatory=$true)] [string] $TargetKeyRaw,
    [Parameter(Mandatory=$true)] [string] $ConfigPath,
    [Parameter(Mandatory=$true)] [string] $ProjectRootPath
  )
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-RunnerLog -Level ERROR -StepName 'autoDiscover' -Message "Config 미존재: $ConfigPath"
    return @{ ok = $false; reason = 'configNotFound'; candidates = @() }
  }
  $cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $sortedRoots = @($cfg.sourceRoots) | Sort-Object -Property 'priority'
  $matchedCandidates = New-Object System.Collections.ArrayList

  foreach ($root in $sortedRoots) {
    if ($root.asIsPattern -and $TargetKeyRaw -notmatch $root.asIsPattern) {
      Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "skip priority=$($root.priority) ($($root.name)) — asIsPattern '$($root.asIsPattern)' 미매칭"
      continue
    }
    $rootPath = if ($root.pathBase -eq 'projectRoot') { Join-Path $ProjectRootPath $root.path } else { $root.path }
    if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
      Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "skip priority=$($root.priority) — path 미존재: $rootPath"
      continue
    }

    $files = Get-ChildItem -LiteralPath $rootPath -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { -not (Test-IsExcluded -Path $_.FullName) }

    $rolesFound = @{}
    foreach ($r in $cfg.discovery.minRequiredRoles) { $rolesFound[$r] = 0 }
    foreach ($f in $files) {
      $role = Get-FileRole -Path $f.FullName
      if ($null -eq $role) { continue }
      $needsTargetMatch = $role -in @('designer.cs','cs','resx')
      $isMatch = $f.Name.ToLowerInvariant().Contains($TargetKeyRaw.ToLowerInvariant())
      if ($needsTargetMatch -and -not $isMatch) { continue }
      if ($rolesFound.ContainsKey($role)) { $rolesFound[$role] += 1 }
    }

    $missing = @($cfg.discovery.minRequiredRoles | Where-Object { $rolesFound[$_] -eq 0 })
    if (@($missing).Count -eq 0) {
      [void]$matchedCandidates.Add([ordered]@{
        priority = $root.priority
        name     = $root.name
        path     = (ConvertTo-ForwardSlash -Path (Resolve-Path -LiteralPath $rootPath).Path)
        roles    = $rolesFound
      })
      Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "후보 발견: priority=$($root.priority) path=$rootPath / roles=$(($rolesFound.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ',')"
    } else {
      Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "skip priority=$($root.priority) — 필수 role 미발견: $($missing -join ',')"
    }
  }

  $matched = @($matchedCandidates)
  if ($matched.Count -eq 0) { return @{ ok = $false; reason = 'noCandidate'; candidates = @() } }
  if ($matched.Count -gt 1) {
    $samePriority = @($matched | Where-Object { $_.priority -eq $matched[0].priority })
    if ($samePriority.Count -gt 1) {
      return @{ ok = $false; reason = 'multiCandidate'; candidates = $matched }
    }
  }
  return @{ ok = $true; chosen = $matched[0]; candidates = $matched }
}

function Resolve-RunnerInputs {
  if ($ModuleId -notmatch $Script:ModuleIdRegex) {
    Write-RunnerLog -Level FATAL -StepName 'resolve' -Message "Invalid ModuleId format: $ModuleId (must match $($Script:ModuleIdRegex))"
    return $null
  }

  $tk = ConvertTo-Nfc -Text $TargetKey
  $tk = $tk -replace '\s',''
  $tk = $tk -replace '[\\/:*?"<>|]','_'

  $aId = if ([string]::IsNullOrEmpty($AsIsId)) { $tk } else { ConvertTo-Nfc -Text $AsIsId }

  if ($VerifyRuns -lt 1) { $VerifyRuns = 1 }
  if ($VerifyRuns -gt 10) { $VerifyRuns = 10 }

  $projectRootResolved = if (-not [string]::IsNullOrEmpty($ProjectRoot)) { (Resolve-Path -LiteralPath $ProjectRoot).Path } else { (Get-Location).Path }
  $configPathResolved  = if (-not [string]::IsNullOrEmpty($ConfigPath))  { $ConfigPath } else { Join-Path $PSScriptRoot 'source-roots.config.json' }

  $effectiveSourceRoot = $SourceRoot
  $autoDiscovered      = $false
  $autoDiscoverInfo    = $null

  if ([string]::IsNullOrEmpty($effectiveSourceRoot)) {
    Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "SourceRoot 미제공 → config 자동 탐색 시작 (config=$configPathResolved / projectRoot=$projectRootResolved)"
    $disc = Find-SourceRoot -TargetKeyRaw $tk -ConfigPath $configPathResolved -ProjectRootPath $projectRootResolved
    if (-not $disc.ok) {
      Write-RunnerLog -Level FATAL -StepName 'autoDiscover' -Message "SourceRoot 자동 탐색 실패: reason=$($disc.reason) candidates=$($disc.candidates.Count)"
      return @{ __conflict = $true; conflictType = "sourceRoot.$($disc.reason)"; candidates = $disc.candidates }
    }
    $effectiveSourceRoot = $disc.chosen.path
    $autoDiscovered      = $true
    $autoDiscoverInfo    = $disc.chosen
    Write-RunnerLog -Level INFO -StepName 'autoDiscover' -Message "SourceRoot 자동 결정: $effectiveSourceRoot (priority=$($disc.chosen.priority) / $($disc.chosen.name))"
  }

  if (-not (Test-Path -LiteralPath $effectiveSourceRoot -PathType Container)) {
    Write-RunnerLog -Level FATAL -StepName 'resolve' -Message "SourceRoot not found: $effectiveSourceRoot"
    return $null
  }

  Write-RunnerLog -Level INFO -StepName 'resolve' -Message "moduleId=$ModuleId / targetKey=$tk / asIsId=$aId / verifyRuns=$VerifyRuns / autoDiscovered=$autoDiscovered"

  return [ordered]@{
    moduleId         = $ModuleId
    targetKey        = $tk
    asIsId           = $aId
    sourceRoot       = (ConvertTo-ForwardSlash -Path (Resolve-Path -LiteralPath $effectiveSourceRoot).Path)
    outputRoot       = (ConvertTo-ForwardSlash -Path (Resolve-Path -LiteralPath $OutputRoot).Path)
    verifyRuns       = $VerifyRuns
    autoDiscovered   = $autoDiscovered
    autoDiscoverInfo = $autoDiscoverInfo
    configPath       = $configPathResolved
  }
}

# ============================================================================
# §5. Stage 2 — Discover (source-root index + role classify)
# ============================================================================

function Test-IsExcluded {
  param([string] $Path)
  $lower = $Path.ToLowerInvariant()
  foreach ($tok in $Script:ExcludeTokens) {
    if ($lower -match "(^|[\\/_.\-])$tok($|[\\/_.\-])") { return $true }
  }
  return $false
}

function Get-FileRole {
  param([string] $Path)
  $name  = [System.IO.Path]::GetFileName($Path).ToLowerInvariant()
  $lower = ($Path -replace '\\','/').ToLowerInvariant()

  if ($name -like '*.designer.cs')                            { return 'designer.cs' }
  if ($name -like '*.cs')                                     { return 'cs' }
  if ($name -like '*.resx')                                   { return 'resx' }
  if ($name -like '*.sql' -and $lower -match '/procedures/')  { return 'sp.sql' }
  if ($name -like '*.sql' -and $lower -match '/tables/')      { return 'ddl.sql' }
  if ($name -like '*.entity.ts')                              { return 'entity.ts' }
  if ($name -like '*_mapping.md' -or $lower -match '/mapping/') { return 'mapping.md' }
  if ($name -like '*.png' -and $lower -match '/(캡처|capture)/'){ return 'capture.png' }
  return $null
}

function Test-IsTargetMatch {
  param([string] $Path, [string] $TargetKey)
  $name = [System.IO.Path]::GetFileName($Path).ToLowerInvariant()
  $tkLower = $TargetKey.ToLowerInvariant()
  return $name.Contains($tkLower)
}

function Invoke-DiscoverStage {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir
  )

  Write-RunnerLog -Level INFO -StepName 'discover' -Message "Scanning SourceRoot=$($Resolved.sourceRoot)"

  $allFiles = Get-ChildItem -LiteralPath $Resolved.sourceRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { -not (Test-IsExcluded -Path $_.FullName) }

  $candidates = New-Object System.Collections.ArrayList
  $tk = $Resolved.targetKey

  foreach ($f in $allFiles) {
    $role = Get-FileRole -Path $f.FullName
    if ($null -eq $role) { continue }
    $isMatch = Test-IsTargetMatch -Path $f.FullName -TargetKey $tk
    if (-not $isMatch -and $role -in @('sp.sql','ddl.sql','entity.ts','mapping.md','capture.png')) {
      $isMatch = $true
    }
    if (-not $isMatch) { continue }

    [void]$candidates.Add([ordered]@{
      path   = (ConvertTo-ForwardSlash -Path $f.FullName)
      sha256 = (Get-FileSha256 -Path $f.FullName)
      mtime  = $f.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
      size   = $f.Length
      role   = $role
    })
  }

  $sortedCandidates = @($candidates) | Sort-Object -Culture en-US -CaseSensitive -Property 'path'

  $roleCounts = [ordered]@{}
  foreach ($r in $Script:FileTypeEnum) { $roleCounts[$r] = 0 }
  foreach ($c in $sortedCandidates)    { $roleCounts[$c.role] += 1 }

  $steps = @(
    @{ stepNo = 1; command = 'C-1'; regex = "(role=ddl.sql) sp_addextendedproperty 'MS_Description'"; matchCount = $roleCounts['ddl.sql']; result = $(if ($roleCounts['ddl.sql'] -ge 1) { 'OK' } else { 'PARTIAL' }) },
    @{ stepNo = 2; command = 'C-1'; regex = "(role=resx) <data name=\w+\.Text>"; matchCount = $roleCounts['resx']; result = $(if ($roleCounts['resx'] -ge 1) { 'OK' } else { 'PARTIAL' }) },
    @{ stepNo = 3; command = 'C-1'; regex = "(role=capture.png) Test-Path"; matchCount = $roleCounts['capture.png']; result = 'OK' },
    @{ stepNo = 4; command = 'C-1'; regex = "(role=mapping.md) Test-Path"; matchCount = $roleCounts['mapping.md']; result = $(if ($roleCounts['mapping.md'] -ge 1) { 'OK' } else { 'PARTIAL' }) },
    @{ stepNo = 5; command = 'C-1'; regex = "(role=entity.ts) @Column"; matchCount = $roleCounts['entity.ts']; result = $(if ($roleCounts['entity.ts'] -ge 1) { 'OK' } else { 'PARTIAL' }) }
  )

  foreach ($s in $steps) {
    if ($s.result -eq 'PARTIAL') { $s.qNNN = 'Q-NNN-' + $s.stepNo } else { $s.qNNN = $null }
  }

  $discoverTrace = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    steps         = $steps
  }

  $index = [ordered]@{
    schemaVersion   = $Script:SchemaVersion
    targetKey       = $Resolved.targetKey
    discoveredFiles = $sortedCandidates
    roleCounts      = $roleCounts
  }

  Write-StableJsonFile -Path (Join-Path $ManifestDir 'discover.trace.json') -Object $discoverTrace
  Write-StableJsonFile -Path (Join-Path $ManifestDir 'index.json')          -Object $index

  $missing = @(@($Script:FileTypeEnum) | Where-Object { $_ -in @('designer.cs','cs') -and $roleCounts[$_] -eq 0 })
  if (@($missing).Count -gt 0) {
    Write-RunnerLog -Level FATAL -StepName 'discover' -Message ("필수 role 미발견: " + (@($missing) -join ', '))
    return @{ ok = $false; conflictType = 'sourceFile.notFound'; missing = $missing; index = $index }
  }

  Write-RunnerLog -Level INFO -StepName 'discover' -Message "$($sortedCandidates.Count) files indexed (Phase 1 form)"
  return @{ ok = $true; index = $index; discoverTrace = $discoverTrace; sortedCandidates = $sortedCandidates; roleCounts = $roleCounts }
}

# ============================================================================
# §5.1 Stage 2.5 — Phase 2/3 Resolve External References (R14-Phase2)
# ============================================================================

function Resolve-ExternalReferences {
  param(
    [hashtable] $Resolved,
    [hashtable] $DiscoverResult,
    [string]    $ConfigPath,
    [string]    $ManifestDir
  )

  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-RunnerLog -Level INFO -StepName 'phase2' -Message "config 미존재 — Phase 2 skip"
    return @{ ok = $true; addedFiles = @(); steps = @() }
  }
  $cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not (Get-Member -InputObject $cfg -Name externalSourceDirs -ErrorAction SilentlyContinue)) {
    Write-RunnerLog -Level INFO -StepName 'phase2' -Message "config.externalSourceDirs 미정의 — Phase 2 skip"
    return @{ ok = $true; addedFiles = @(); steps = @() }
  }

  $addedFiles = New-Object System.Collections.ArrayList
  $traceSteps = New-Object System.Collections.ArrayList

  $phase1Files = @($DiscoverResult.sortedCandidates | Where-Object { $_.role -in @('cs','designer.cs') })

  $sortedExt = @($cfg.externalSourceDirs) | Sort-Object -Property @{Expression={if (Get-Member -InputObject $_ -Name resolveFromPhase -ErrorAction SilentlyContinue) { $_.resolveFromPhase } else { 99 }}}

  foreach ($ext in $sortedExt) {
    $extName    = $ext.name
    $isEnabled  = if (Get-Member -InputObject $ext -Name enabled -ErrorAction SilentlyContinue) { $ext.enabled } else { $true }
    if (-not $isEnabled) {
      Write-RunnerLog -Level INFO -StepName 'phase2' -Message "skip ($extName) — enabled=false"
      continue
    }
    $extPath    = $ext.path
    if (-not (Test-Path -LiteralPath $extPath -PathType Container)) {
      Write-RunnerLog -Level WARN -StepName 'phase2' -Message "skip ($extName) — path 미존재: $extPath"
      continue
    }

    $resolveFromPhase = if (Get-Member -InputObject $ext -Name resolveFromPhase -ErrorAction SilentlyContinue) { $ext.resolveFromPhase } else { 1 }

    $sourceFiles = if ($resolveFromPhase -eq 1) { $phase1Files } else { @($addedFiles) }
    if (@($sourceFiles).Count -eq 0) {
      Write-RunnerLog -Level INFO -StepName 'phase2' -Message "skip ($extName) — Phase $resolveFromPhase 결과 0"
      continue
    }

    $extractedNames = New-Object System.Collections.Generic.HashSet[string]
    foreach ($srcFile in $sourceFiles) {
      $srcPath = if ($srcFile -is [hashtable] -or $srcFile -is [System.Collections.Specialized.OrderedDictionary]) { $srcFile.path } else { $srcFile.path }
      if ([string]::IsNullOrEmpty($srcPath)) { continue }
      if (-not (Test-Path -LiteralPath $srcPath)) { continue }
      $content = Get-Content -LiteralPath $srcPath -Raw -Encoding UTF8
      foreach ($pattern in $ext.resolveCallPatterns) {
        $matchResults = [regex]::Matches($content, $pattern)
        foreach ($m in $matchResults) {
          if ($m.Groups.Count -ge 2) {
            $name = $m.Groups[1].Value
            if (-not [string]::IsNullOrEmpty($name)) { [void]$extractedNames.Add($name) }
          }
        }
      }
    }

    $sortedNames = @($extractedNames) | Sort-Object -Culture en-US -CaseSensitive
    Write-RunnerLog -Level INFO -StepName 'phase2' -Message "$extName — 추출 이름 $(@($sortedNames).Count) 개: $((@($sortedNames) | Select-Object -First 10) -join ', ')"

    $resolvedCount = 0
    foreach ($n in $sortedNames) {
      $filename = $ext.filenamePattern -replace '\{[^\}]+\}', $n
      $candidatePath = Join-Path $extPath $filename
      if (-not (Test-Path -LiteralPath $candidatePath)) {
        Write-RunnerLog -Level INFO -StepName 'phase2' -Message "  - skip $n — 파일 미존재: $candidatePath"
        continue
      }
      if (Test-IsExcluded -Path $candidatePath) { continue }
      $fileItem = Get-Item -LiteralPath $candidatePath
      [void]$addedFiles.Add([ordered]@{
        path   = (ConvertTo-ForwardSlash -Path $fileItem.FullName)
        sha256 = (Get-FileSha256 -Path $fileItem.FullName)
        mtime  = $fileItem.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        size   = $fileItem.Length
        role   = $ext.role
      })
      $resolvedCount += 1
    }
    Write-RunnerLog -Level INFO -StepName 'phase2' -Message "$extName — 발견 파일 $resolvedCount / 추출 이름 $(@($sortedNames).Count)"

    [void]$traceSteps.Add([ordered]@{
      phaseStep        = "phase$($resolveFromPhase + 1).resolveExternal"
      externalDir      = $extName
      role             = $ext.role
      patterns         = @($ext.resolveCallPatterns)
      extractedNames   = $sortedNames
      resolvedCount    = $resolvedCount
      candidateNames   = @($sortedNames).Count
    })
  }

  return @{ ok = $true; addedFiles = $addedFiles; steps = $traceSteps }
}

# ============================================================================
# §6. Stage 3 — Classify (placeholder: role 별 통계만 박음 — v1)
# ============================================================================

function Get-FileContent {
  param([string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Invoke-Step6-L1Visible {
  param([array] $DesignerFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $DesignerFiles) {
    $content = Get-FileContent -Path $f.path
    $regexMatches = [regex]::Matches($content, '(?m)^\s*this\.(\w+)\.Visible\s*=\s*false')
    foreach ($m in $regexMatches) {
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      [void]$list.Add([ordered]@{
        controlName    = $m.Groups[1].Value
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = 'L1'
        reason         = 'designer.cs Visible=false (자연 제외 1단계)'
      })
    }
  }
  return $list.ToArray()
}

function Invoke-Step7-L2Comment {
  param([array] $CodeFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $CodeFiles) {
    $content = Get-FileContent -Path $f.path
    $pattern = if ($f.role -eq 'sp.sql') { '(?m)^\s*--' } else { '(?m)^\s*//' }
    $regexMatches = [regex]::Matches($content, $pattern)
    foreach ($m in $regexMatches) {
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      [void]$list.Add([ordered]@{
        controlName    = "comment-line-$lineNo"
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = 'L2'
        reason         = '주석 라인 (자연 제외 2단계)'
      })
    }
  }
  return $list.ToArray()
}

function Invoke-Step9-L4External {
  param([array] $CsFiles)
  $list = New-Object System.Collections.ArrayList
  $patterns = @(
    @{ regex='OpenFormWithParameter\s*\(\s*"(\w+)"';                        kind='OpenFormWithParameter'; cls='L4' },
    @{ regex='OpenForm\s*\(\s*"(\w+)"';                                     kind='OpenForm';              cls='L4' },
    @{ regex='CreateDialog\s*\(\s*"(\w+)"';                                 kind='CreateDialog';          cls='L4' },
    @{ regex='ShowDialog\s*\(\s*"(\w+)"';                                   kind='ShowDialog';            cls='L4' },
    @{ regex='NewCodeQuery\s*\(\s*"(\w+)"';                                 kind='NewCodeQuery';          cls='L4' },
    @{ regex='GeneralDialog\s*\(\s*"(\w+)"';                                kind='GeneralDialog';         cls='L4' }
  )
  foreach ($f in $CsFiles) {
    $content = Get-FileContent -Path $f.path
    foreach ($pat in $patterns) {
      $regexMatches = [regex]::Matches($content, $pat.regex)
      foreach ($m in $regexMatches) {
        $upToMatch = $content.Substring(0, $m.Index)
        $lineNo = ($upToMatch -split "`n").Count
        [void]$list.Add([ordered]@{
          controlName    = $m.Groups[1].Value
          sourceFile     = $f.path
          sourceLine     = $lineNo
          classification = $pat.cls
          reason         = "$($pat.kind) 호출 (외부 화면 / 다이얼로그 / LoV 마스터)"
          callKind       = $pat.kind
        })
      }
    }
  }
  $arr = $list.ToArray()
  $sorted = @($arr | Sort-Object -Property @{Expression={[string]$_.callKind}},@{Expression={[string]$_.controlName}},@{Expression={[int]$_.sourceLine}})
  return $sorted
}

function Invoke-Step10-SCoord {
  param([array] $DesignerFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $DesignerFiles) {
    $content = Get-FileContent -Path $f.path
    $regexMatches = [regex]::Matches($content, 'this\.(\w+)\.Location\s*=\s*new\s+System\.Drawing\.Point\((\d+),\s*(\d+)\)')
    foreach ($m in $regexMatches) {
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      [void]$list.Add([ordered]@{
        controlName    = $m.Groups[1].Value
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = 'S'
        reason         = "Location=Point($($m.Groups[2].Value),$($m.Groups[3].Value))"
        x              = [int]$m.Groups[2].Value
        y              = [int]$m.Groups[3].Value
      })
    }
  }
  $arr = $list.ToArray()
  $sorted = @($arr | Sort-Object -Property @{Expression={[int]$_.y}},@{Expression={[int]$_.x}},@{Expression={[string]$_.controlName}},@{Expression={[int]$_.sourceLine}})
  return $sorted
}

function Invoke-Step11-SpCase {
  param([array] $SpFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $SpFiles) {
    $content = Get-FileContent -Path $f.path
    $regexMatches = [regex]::Matches($content, "@Case\s*=\s*'(\w+)'")
    $seenInFile = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in $regexMatches) {
      $caseName = $m.Groups[1].Value
      $key = "$($f.path)|$caseName"
      if ($seenInFile.Contains($key)) { continue }
      [void]$seenInFile.Add($key)
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      [void]$list.Add([ordered]@{
        controlName    = $caseName
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = 'SP_BRANCH'
        reason         = "SP @Case='$caseName' 분기"
      })
    }
  }
  return $list.ToArray()
}

function Invoke-Step12-Button {
  param([array] $DesignerFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $DesignerFiles) {
    $content = Get-FileContent -Path $f.path
    $regexMatches = [regex]::Matches($content, '(?m)^\s*private\s+(?:System\.Windows\.Forms\.)?(Button|ButtonField|ToolStripButton)\s+(\w+);')
    foreach ($m in $regexMatches) {
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      $kind = $m.Groups[1].Value
      $btnClass = if ($kind -eq 'ButtonField') { 'GB' } else { 'B' }
      [void]$list.Add([ordered]@{
        controlName    = $m.Groups[2].Value
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = $btnClass
        reason         = "$kind 컨트롤 선언"
      })
    }
  }
  return $list.ToArray()
}

function Invoke-Step19-D1D3 {
  param([array] $CsFiles, [array] $SpFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $CsFiles) {
    [void]$list.Add([ordered]@{
      controlName    = (Split-Path -Leaf $f.path)
      sourceFile     = $f.path
      sourceLine     = 0
      classification = 'D1'
      reason         = 'cs (form code-behind) — 직접 호출 깊이 1'
    })
  }
  foreach ($f in $SpFiles) {
    [void]$list.Add([ordered]@{
      controlName    = (Split-Path -Leaf $f.path)
      sourceFile     = $f.path
      sourceLine     = 0
      classification = 'D2'
      reason         = 'sp.sql (cs 가 NewQuery 호출) — 깊이 2'
    })
  }
  return $list.ToArray()
}

function Invoke-Step21-SpBranchMatrix {
  param([array] $SpFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $SpFiles) {
    $content = Get-FileContent -Path $f.path
    $branchMatches = [regex]::Matches($content, "@Case\s*=\s*'(\w+)'")
    $seenInFile = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in $branchMatches) {
      $caseName = $m.Groups[1].Value
      if ($seenInFile.Contains($caseName)) { continue }
      [void]$seenInFile.Add($caseName)
      $upToMatch = $content.Substring(0, $m.Index)
      $lineNo = ($upToMatch -split "`n").Count
      $hasOrderBy = $content -match "(?is)goto\s+${caseName}_handler.*?ORDER\s+BY"
      $hasLimit   = $content -match "(?is)goto\s+${caseName}_handler.*?(TOP\s+1|LIMIT\s+1)"
      $branchType = if ($hasLimit) { 'D' } elseif ($hasOrderBy) { 'G' } else { 'LV' }
      [void]$list.Add([ordered]@{
        controlName    = "$($f.role):$caseName"
        sourceFile     = $f.path
        sourceLine     = $lineNo
        classification = $branchType
        reason         = "SP @Case='$caseName' → $branchType 분기 (orderBy=$hasOrderBy / limit=$hasLimit)"
      })
    }
  }
  return $list.ToArray()
}

function Invoke-Step14-GridAlias {
  param([array] $SpFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $SpFiles) {
    $content = Get-FileContent -Path $f.path
    $blockPattern = '(?si)(\w+)_handler\s*:\s*begin(.*?)(?=(\w+_handler\s*:)|\Z)'
    $blocks = [regex]::Matches($content, $blockPattern)
    foreach ($b in $blocks) {
      $branchName = $b.Groups[1].Value
      $branchBody = $b.Groups[2].Value
      $selectPattern = '(?si)\bselect\s+(.+?)\s+from\s+'
      $selectMatch   = [regex]::Match($branchBody, $selectPattern)
      if (-not $selectMatch.Success) { continue }
      $selectClause = $selectMatch.Groups[1].Value
      $columns = $selectClause -split ','
      $idx = 0
      foreach ($col in $columns) {
        $colTrim = ($col -split '--')[0].Trim()
        if ([string]::IsNullOrWhiteSpace($colTrim)) { continue }
        $alias = $null
        if ($colTrim -match '^\w+\.(\w+)\s+(\w+)$')      { $alias = $matches[2] }
        elseif ($colTrim -match "^'[^']*'\s+(\w+)$")     { $alias = $matches[1] }
        elseif ($colTrim -match '^\w+\.(\w+)$')          { $alias = $matches[1] }
        elseif ($colTrim -match '^(\w+)$')               { $alias = $matches[1] }
        elseif ($colTrim -match '\b(\w+)\s*$')           { $alias = $matches[1] }
        if ([string]::IsNullOrEmpty($alias)) { continue }
        $idx += 1
        [void]$list.Add([ordered]@{
          controlName    = $alias
          sourceFile     = $f.path
          sourceLine     = 0
          classification = 'SELECT_ALIAS'
          reason         = "$branchName 분기 SELECT alias [#$idx]"
          branch         = $branchName
          colIdx         = $idx
        })
      }
    }
  }
  $arr = $list.ToArray()
  $sorted = @($arr | Sort-Object -Property @{Expression={[string]$_.branch}},@{Expression={[int]$_.colIdx}})
  return $sorted
}

function Invoke-Step20-Events {
  param([array] $CsFiles)
  $events = @('Click','DoubleClick','CellClick','CellDoubleClick','SelectionChanged','ValueChanged','KeyDown','Validating','Leave','Enter','TextChanged','MouseDown')
  $list = New-Object System.Collections.ArrayList
  foreach ($ev in $events) {
    $found = 0
    foreach ($f in $CsFiles) {
      $content = Get-FileContent -Path $f.path
      $pattern = "\+= new\s+\w*${ev}EventHandler"
      $m = [regex]::Matches($content, $pattern)
      $found += $m.Count
    }
    [void]$list.Add([ordered]@{
      controlName    = $ev
      sourceFile     = if ($CsFiles.Count -gt 0) { $CsFiles[0].path } else { '(none)' }
      sourceLine     = 0
      classification = 'EVENT12'
      reason         = "이벤트 12종 매트릭스 — $ev 발견 수: $found"
      eventName      = $ev
      foundCount     = $found
    })
  }
  return $list.ToArray()
}

function Invoke-Entity-Columns {
  param([array] $EntityFiles)
  $list = New-Object System.Collections.ArrayList
  foreach ($f in $EntityFiles) {
    $content = Get-FileContent -Path $f.path
    $pattern = '@Column\s*\([^\)]*\)\s*(\w+)'
    $m = [regex]::Matches($content, $pattern)
    foreach ($mm in $m) {
      [void]$list.Add([ordered]@{
        controlName    = $mm.Groups[1].Value
        sourceFile     = $f.path
        sourceLine     = 0
        classification = 'ENTITY_COL'
        reason         = '@Column 데코레이터 추출'
      })
    }
  }
  return $list.ToArray()
}

function Invoke-QStableKey-Slots {
  $slots = @(
    @{ qId='Q-001'; reserved=$true; condition='screenId (01 A.3 미등재)'; stableKey=(Get-StringSha256 -Text 'Q-001|01 A.3 미등재|폴더명 잠정 사용').Substring(0,16) },
    @{ qId='Q-002'; reserved=$true; condition='moduleGroup (01 A.2 미등재)'; stableKey=(Get-StringSha256 -Text 'Q-002|01 A.2 미등재|폴더 경로 잠정').Substring(0,16) },
    @{ qId='Q-003'; reserved=$true; condition='To-Be 테이블/Entity 미확보'; stableKey=(Get-StringSha256 -Text 'Q-003|Entity 미확보|T2-B 직역').Substring(0,16) },
    @{ qId='Q-004'; reserved=$true; condition='S-NNN 표시명 폴백 5 미충족'; stableKey=(Get-StringSha256 -Text 'Q-004|S-NNN 폴백5 미충족|alias 표기').Substring(0,16) },
    @{ qId='Q-005'; reserved=$true; condition='G-NNN 표시명 폴백 5 미충족'; stableKey=(Get-StringSha256 -Text 'Q-005|G-NNN 폴백5 미충족|alias 표기').Substring(0,16) },
    @{ qId='Q-006'; reserved=$true; condition='P-NNN To-Be 화면명 미확정'; stableKey=(Get-StringSha256 -Text 'Q-006|P-NNN ToBe 미확정|navigate').Substring(0,16) },
    @{ qId='Q-007'; reserved=$true; condition='이벤트 핸들러 미사용 (L3)'; stableKey=(Get-StringSha256 -Text 'Q-007|핸들러 미사용 L3|자연 제외').Substring(0,16) }
  )
  return $slots
}

function Get-CoverageMatrix {
  param([System.Collections.ArrayList] $AllItems)
  $cov = [ordered]@{}
  $categories = @('S','G','GE','D','L','B','GB','P','ST','LV','L1','L2','L3','L4','L5')
  foreach ($cat in $categories) {
    $found = ($AllItems | Where-Object { $_.classification -eq $cat }).Count
    $cov[$cat] = [ordered]@{
      found    = $found
      reflected= 0
      qNNN     = 0
      excluded = 0
    }
  }
  return $cov
}

function Invoke-ClassifyStage {
  param(
    [hashtable] $Resolved,
    [hashtable] $DiscoverResult,
    [string]    $ManifestDir
  )

  $designerFiles = @($DiscoverResult.sortedCandidates | Where-Object { $_.role -eq 'designer.cs' })
  $csOnlyFiles   = @($DiscoverResult.sortedCandidates | Where-Object { $_.role -eq 'cs' })
  $spFiles       = @($DiscoverResult.sortedCandidates | Where-Object { $_.role -eq 'sp.sql' })
  $entityFiles   = @($DiscoverResult.sortedCandidates | Where-Object { $_.role -eq 'entity.ts' })
  $codeFiles     = @($csOnlyFiles + $spFiles)

  $step6  = @(Invoke-Step6-L1Visible    -DesignerFiles $designerFiles)
  $step7  = @(Invoke-Step7-L2Comment    -CodeFiles     $codeFiles)
  $step9  = @(Invoke-Step9-L4External   -CsFiles       $csOnlyFiles)
  $step10 = @(Invoke-Step10-SCoord      -DesignerFiles $designerFiles)
  $step11 = @(Invoke-Step11-SpCase      -SpFiles       $spFiles)
  $step12 = @(Invoke-Step12-Button      -DesignerFiles $designerFiles)
  $step14 = @(Invoke-Step14-GridAlias   -SpFiles       $spFiles)
  $step19 = @(Invoke-Step19-D1D3        -CsFiles       $csOnlyFiles -SpFiles $spFiles)
  $step20 = @(Invoke-Step20-Events      -CsFiles       $csOnlyFiles)
  $step21 = @(Invoke-Step21-SpBranchMatrix -SpFiles    $spFiles)
  $entityItems = @(Invoke-Entity-Columns -EntityFiles  $entityFiles)

  $items = New-Object System.Collections.ArrayList
  $counters = @{}

  $allStepResults = @(
    @{ stepNo = 6;  data = $step6  },
    @{ stepNo = 7;  data = $step7  },
    @{ stepNo = 9;  data = $step9  },
    @{ stepNo = 10; data = $step10 },
    @{ stepNo = 11; data = $step11 },
    @{ stepNo = 12; data = $step12 },
    @{ stepNo = 14; data = $step14 },
    @{ stepNo = 19; data = $step19 },
    @{ stepNo = 20; data = $step20 },
    @{ stepNo = 21; data = $step21 },
    @{ stepNo = 7000; data = $entityItems }
  )

  foreach ($stepRes in $allStepResults) {
    $stepNo = $stepRes.stepNo
    foreach ($it in @($stepRes.data)) {
      if ($null -eq $it) { continue }
      $cls = [string]$it.classification
      if ([string]::IsNullOrEmpty($cls)) { $cls = 'X' }
      $idPrefix = if ($cls -eq 'SP_BRANCH') { 'SPB' } else { $cls }
      if (-not $counters.ContainsKey($cls)) { $counters[$cls] = 0 }
      $counters[$cls] = [int]$counters[$cls] + 1
      $idNum = $counters[$cls]

      $rawLine = $it.sourceLine
      if ($rawLine -is [System.Array]) { $rawLine = @($rawLine)[0] }
      $intLine = 0
      if ($null -ne $rawLine) { try { $intLine = [int]([string]$rawLine) } catch { $intLine = 0 } }

      $newItem = [ordered]@{
        id             = ('{0}-{1:000}' -f $idPrefix, $idNum)
        stepNo         = $stepNo
        controlName    = [string]$it.controlName
        sourceFile     = [string]$it.sourceFile
        sourceLine     = $intLine
        classification = $cls
        reason         = [string]$it.reason
      }
      [void]$items.Add($newItem)
    }
  }

  $sortedItems = @($items) | Sort-Object -Culture en-US -CaseSensitive -Property 'id'

  $steps = @(
    [ordered]@{ stepNo=6;  command='C-1'; regex='(?m)^\s*this\.(\w+)\.Visible\s*=\s*false';                              classification='L1';        itemCount=$step6.Count },
    [ordered]@{ stepNo=7;  command='C-1'; regex='(?m)^\s*//|^\s*--';                                                      classification='L2';        itemCount=$step7.Count },
    [ordered]@{ stepNo=9;  command='C-5'; regex='(OpenFormWithParameter|OpenForm|CreateDialog|ShowDialog|NewCodeQuery|GeneralDialog)\("(\w+)"'; classification='L4'; itemCount=$step9.Count },
    [ordered]@{ stepNo=10; command='C-7'; regex='this\.(\w+)\.Location\s*=\s*new\s+System\.Drawing\.Point\((\d+),\s*(\d+)\)'; classification='S';     itemCount=$step10.Count },
    [ordered]@{ stepNo=11; command='C-7'; regex="@Case\s*=\s*'(\w+)'";                                                    classification='SP_BRANCH'; itemCount=$step11.Count },
    [ordered]@{ stepNo=12; command='C-1'; regex='(?m)^\s*private\s+(?:System\.Windows\.Forms\.)?(Button|ButtonField|ToolStripButton)\s+(\w+);'; classification='B/GB'; itemCount=$step12.Count },
    [ordered]@{ stepNo=14; command='C-1'; regex='(?si)(\w+)_handler\s*:\s*begin.*?\bselect\s+(.+?)\s+from\s+';            classification='SELECT_ALIAS'; itemCount=$step14.Count },
    [ordered]@{ stepNo=19; command='(synthesize)'; regex='cs:D1 / sp:D2';                                                 classification='D1/D2';     itemCount=$step19.Count },
    [ordered]@{ stepNo=20; command='C-1'; regex='\+= new\s+\w*(Click|DoubleClick|CellClick|CellDoubleClick|SelectionChanged|ValueChanged|KeyDown|Validating|Leave|Enter|TextChanged|MouseDown)EventHandler'; classification='EVENT12'; itemCount=$step20.Count },
    [ordered]@{ stepNo=21; command='C-7'; regex="@Case\s*=\s*'(\w+)'\s+\+\s+ORDER BY\s/\sLIMIT";                          classification='G/GE/D/L/LV'; itemCount=$step21.Count }
  )

  $coverage = Get-CoverageMatrix -AllItems $items

  $classifyTrace = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    steps         = $steps
    items         = $sortedItems
    coverage      = $coverage
  }

  Write-StableJsonFile -Path (Join-Path $ManifestDir 'classify.trace.json') -Object $classifyTrace

  $alSelect = if ($counters.ContainsKey('SELECT_ALIAS')) { $counters['SELECT_ALIAS'] } else { 0 }
  $evCount  = if ($counters.ContainsKey('EVENT12'))      { $counters['EVENT12'] }      else { 0 }
  $entCount = if ($counters.ContainsKey('ENTITY_COL'))   { $counters['ENTITY_COL'] }   else { 0 }
  Write-RunnerLog -Level INFO -StepName 'classify' -Message "$($sortedItems.Count) items classified (v2.5 — L1=$($counters['L1']) / L2=$($counters['L2']) / L4=$($counters['L4']) / S=$($counters['S']) / B=$($counters['B']) / GB=$($counters['GB']) / SELECT_ALIAS=$alSelect / EVENT12=$evCount / ENTITY_COL=$entCount / SP_BRANCH=$($counters['SP_BRANCH']))"
  return @{ ok = $true; classifyTrace = $classifyTrace }
}

# ============================================================================
# §7. Stage 4 — Fallback (placeholder: 빈 배열 — v1)
# ============================================================================

function Invoke-FallbackStage {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir
  )
  $fallbackTrace = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    fallbacks     = @()
  }
  Write-StableJsonFile -Path (Join-Path $ManifestDir 'fallback.trace.json') -Object $fallbackTrace
  Write-RunnerLog -Level INFO -StepName 'fallback' -Message "0 fallbacks (v1 placeholder)"
  return @{ ok = $true; fallbackTrace = $fallbackTrace }
}

# ============================================================================
# §8. Stage 5 — Q Stable Key
# ============================================================================

function Invoke-QStableKeyStage {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir
  )
  $slots = Invoke-QStableKey-Slots
  $qStableKey = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    slots         = $slots
    appended      = @()
  }
  Write-StableJsonFile -Path (Join-Path $ManifestDir 'q-stable-key.json') -Object $qStableKey
  Write-RunnerLog -Level INFO -StepName 'qStableKey' -Message "$($slots.Count) slots reserved (v2.5 — stableKey SHA-256 박힘 / appended 자동 분류는 v3 보강)"
  return @{ ok = $true; qStableKey = $qStableKey }
}

# ============================================================================
# §9. Stage 6 — Manifest Lock
# ============================================================================

function New-ManifestLock {
  param(
    [hashtable] $Resolved,
    [hashtable] $DiscoverResult,
    [string]    $ManifestDir
  )

  $inputs = @($DiscoverResult.index.discoveredFiles | ForEach-Object {
    [ordered]@{
      path   = $_.path
      sha256 = $_.sha256
      mtime  = $_.mtime
      size   = $_.size
      role   = $_.role
    }
  })
  $sortedInputs = @($inputs) | Sort-Object -Culture en-US -CaseSensitive -Property 'path'

  $hashSourceLines = @($sortedInputs | ForEach-Object { "$($_.path)|$($_.sha256)|$($_.size)" })
  $hashSource      = $hashSourceLines -join "`n"
  $inputHash       = Get-StringSha256 -Text $hashSource

  $lockedAt = if ($Resolved.ContainsKey('lockedAt') -and $Resolved.lockedAt) { $Resolved.lockedAt } else { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

  $manifest = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    moduleId      = $Resolved.moduleId
    screenId      = $null
    asIsId        = $Resolved.asIsId
    lockedAt      = $lockedAt
    inputs        = $sortedInputs
    runnerVersion = $Script:RunnerVersion
    inputHash     = $inputHash
  }

  Write-StableJsonFile -Path (Join-Path $ManifestDir 'manifest.lock.json') -Object $manifest
  Write-RunnerLog -Level INFO -StepName 'lock' -Message "manifest.lock.json written (inputHash=$($inputHash.Substring(0,8))...)"
  return @{ ok = $true; manifest = $manifest }
}

# ============================================================================
# §10. Stage 7 — Verify (재실행 hash 비교)
# ============================================================================

function Get-ManifestOutputHashes {
  param([string] $ManifestDir)
  $files = @(
    @{ key='manifestLock';   file='manifest.lock.json' },
    @{ key='index';          file='index.json' },
    @{ key='discoverTrace';  file='discover.trace.json' },
    @{ key='classifyTrace';  file='classify.trace.json' },
    @{ key='fallbackTrace';  file='fallback.trace.json' },
    @{ key='qStableKey';     file='q-stable-key.json' }
  )
  $h = [ordered]@{}
  foreach ($f in $files) {
    $p = Join-Path $ManifestDir $f.file
    $h[$f.key] = Get-FileSha256 -Path $p
  }
  return $h
}

function Invoke-StageOnce {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir,
    [int]       $RunNo
  )
  $disc = Invoke-DiscoverStage -Resolved $Resolved -ManifestDir $ManifestDir
  if (-not $disc.ok) { return $disc }

  $cfgPath = if ($Resolved.ContainsKey('configPath')) { $Resolved.configPath } else { '' }
  $phase2 = Resolve-ExternalReferences -Resolved $Resolved -DiscoverResult $disc -ConfigPath $cfgPath -ManifestDir $ManifestDir
  if (@($phase2.addedFiles).Count -gt 0) {
    $merged = @($disc.sortedCandidates) + @($phase2.addedFiles)
    $sortedMerged = @($merged) | Sort-Object -Culture en-US -CaseSensitive -Property 'path'
    $newRoleCounts = [ordered]@{}
    foreach ($r in $Script:FileTypeEnum) { $newRoleCounts[$r] = 0 }
    foreach ($c in $sortedMerged) { $newRoleCounts[$c.role] += 1 }
    $existingSteps = @($disc.discoverTrace.steps)
    $allSteps = @($existingSteps) + @($phase2.steps)
    $disc.discoverTrace = [ordered]@{
      schemaVersion = $Script:SchemaVersion
      targetKey     = $Resolved.targetKey
      steps         = $allSteps
    }
    $disc.index = [ordered]@{
      schemaVersion   = $Script:SchemaVersion
      targetKey       = $Resolved.targetKey
      discoveredFiles = $sortedMerged
      roleCounts      = $newRoleCounts
    }
    $disc.sortedCandidates = $sortedMerged
    Write-StableJsonFile -Path (Join-Path $ManifestDir 'discover.trace.json') -Object $disc.discoverTrace
    Write-StableJsonFile -Path (Join-Path $ManifestDir 'index.json')          -Object $disc.index
  }

  $cls  = Invoke-ClassifyStage -Resolved $Resolved -DiscoverResult $disc -ManifestDir $ManifestDir
  $fb   = Invoke-FallbackStage  -Resolved $Resolved -ManifestDir $ManifestDir
  $qsk  = Invoke-QStableKeyStage -Resolved $Resolved -ManifestDir $ManifestDir
  $lock = New-ManifestLock -Resolved $Resolved -DiscoverResult $disc -ManifestDir $ManifestDir
  return @{ ok = $true; manifest = $lock.manifest }
}

function Invoke-VerifyStage {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir
  )
  $runs    = New-Object System.Collections.ArrayList
  $hashSet = @()
  for ($i = 1; $i -le $Resolved.verifyRuns; $i++) {
    Write-RunnerLog -Level INFO -StepName 'verify' -Message "run $i/$($Resolved.verifyRuns) — re-executing pipeline"
    $r = Invoke-StageOnce -Resolved $Resolved -ManifestDir $ManifestDir -RunNo $i
    if (-not $r.ok) { return @{ ok = $false; reason = 'stageFailed' } }
    $oh = Get-ManifestOutputHashes -ManifestDir $ManifestDir
    [void]$runs.Add([ordered]@{
      runNo         = $i
      inputHash     = $r.manifest.inputHash
      outputHashes  = $oh
    })
    $hashSet += ,$oh
  }

  $byteDiff = [ordered]@{}
  for ($i = 0; $i -lt ($hashSet.Count - 1); $i++) {
    $a = $hashSet[$i]
    $b = $hashSet[$i + 1]
    $diffCount = 0
    foreach ($k in $a.Keys) {
      if ($a[$k] -ne $b[$k]) { $diffCount++ }
    }
    $byteDiff["run$($i+1)Vs$($i+2)"] = $diffCount
  }

  $pass = $true
  foreach ($k in $byteDiff.Keys) { if ($byteDiff[$k] -ne 0) { $pass = $false } }
  if ($Resolved.verifyRuns -lt 2) { $pass = $null }

  $sortedRuns = @($runs) | Sort-Object -Property 'runNo'
  $verifyReport = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    runs          = $sortedRuns
    byteDiff      = $byteDiff
    pass          = $pass
  }
  Write-StableJsonFile -Path (Join-Path $ManifestDir 'verify-report.json') -Object $verifyReport

  $passText = if ($null -eq $pass) { 'null (single run)' } else { $pass.ToString() }
  Write-RunnerLog -Level INFO -StepName 'verify' -Message "byteDiff=$(($byteDiff | Out-String).Trim()) — pass=$passText"
  return @{ ok = $true; pass = $pass; verifyReport = $verifyReport }
}

# ============================================================================
# §11. Conflict Report
# ============================================================================

function New-ConflictReport {
  param(
    [hashtable] $Resolved,
    [string]    $ManifestDir,
    [string]    $ConflictType,
    [array]     $Candidates
  )
  $report = [ordered]@{
    schemaVersion = $Script:SchemaVersion
    targetKey     = $Resolved.targetKey
    conflictType  = $ConflictType
    candidates    = $Candidates
    resolution    = $null
  }
  Write-StableJsonFile -Path (Join-Path $ManifestDir 'conflict-report.json') -Object $report
  Write-RunnerLog -Level FATAL -StepName 'conflict' -Message $ConflictType
  return $report
}

# ============================================================================
# §12. Main
# ============================================================================

function Invoke-AutoManifestRunner {
  $resolvedRaw = Resolve-RunnerInputs
  if ($null -eq $resolvedRaw) {
    Write-LogFile -Path '.\auto-manifest-runner-error.log'
    exit 2
  }

  if ($resolvedRaw -is [hashtable] -and $resolvedRaw.ContainsKey('__conflict') -and $resolvedRaw['__conflict']) {
    $tkSafe = ConvertTo-Nfc -Text $TargetKey
    $tkSafe = $tkSafe -replace '\s',''
    $tkSafe = $tkSafe -replace '[\\/:*?"<>|]','_'
    $unresolvedDir = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path "_unresolved/manifest/$tkSafe"
    if (-not (Test-Path -LiteralPath $unresolvedDir)) {
      [void](New-Item -ItemType Directory -Path $unresolvedDir -Force)
    }
    $conflictResolved = [ordered]@{ targetKey = $tkSafe }
    [void](New-ConflictReport -Resolved $conflictResolved -ManifestDir $unresolvedDir -ConflictType $resolvedRaw['conflictType'] -Candidates @($resolvedRaw['candidates']))
    Write-LogFile -Path (Join-Path $unresolvedDir 'error.log')
    exit 1
  }

  $resolved = @{}
  foreach ($k in $resolvedRaw.Keys) { $resolved[$k] = $resolvedRaw[$k] }
  $resolved['lockedAt'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

  $manifestDir = Join-Path $resolved.outputRoot ("$($resolved.moduleId)/manifest/$($resolved.targetKey)")
  if (-not (Test-Path -LiteralPath $manifestDir)) {
    [void](New-Item -ItemType Directory -Path $manifestDir -Force)
  }

  $disc = Invoke-DiscoverStage -Resolved $resolved -ManifestDir $manifestDir
  if (-not $disc.ok) {
    $unresolvedDir = Join-Path $resolved.outputRoot "_unresolved/manifest/$($resolved.targetKey)"
    if (-not (Test-Path -LiteralPath $unresolvedDir)) {
      [void](New-Item -ItemType Directory -Path $unresolvedDir -Force)
    }
    [void](New-ConflictReport -Resolved $resolved -ManifestDir $unresolvedDir -ConflictType $disc.conflictType -Candidates @($disc.missing))
    Write-LogFile -Path (Join-Path $unresolvedDir 'error.log')
    exit 1
  }

  $cfgPath = if ($resolved.ContainsKey('configPath')) { $resolved.configPath } else { '' }
  $phase2 = Resolve-ExternalReferences -Resolved $resolved -DiscoverResult $disc -ConfigPath $cfgPath -ManifestDir $manifestDir
  if (@($phase2.addedFiles).Count -gt 0) {
    $merged = @($disc.sortedCandidates) + @($phase2.addedFiles)
    $sortedMerged = @($merged) | Sort-Object -Culture en-US -CaseSensitive -Property 'path'
    $newRoleCounts = [ordered]@{}
    foreach ($r in $Script:FileTypeEnum) { $newRoleCounts[$r] = 0 }
    foreach ($c in $sortedMerged) { $newRoleCounts[$c.role] += 1 }

    $existingSteps = @($disc.discoverTrace.steps)
    $allSteps = @($existingSteps) + @($phase2.steps)

    $disc.discoverTrace = [ordered]@{
      schemaVersion = $Script:SchemaVersion
      targetKey     = $resolved.targetKey
      steps         = $allSteps
    }
    $disc.index = [ordered]@{
      schemaVersion   = $Script:SchemaVersion
      targetKey       = $resolved.targetKey
      discoveredFiles = $sortedMerged
      roleCounts      = $newRoleCounts
    }
    $disc.sortedCandidates = $sortedMerged
    $disc.roleCounts = $newRoleCounts

    Write-StableJsonFile -Path (Join-Path $manifestDir 'discover.trace.json') -Object $disc.discoverTrace
    Write-StableJsonFile -Path (Join-Path $manifestDir 'index.json')          -Object $disc.index
    Write-RunnerLog -Level INFO -StepName 'phase2' -Message "Phase 2 통합: form $(@($disc.sortedCandidates).Count - @($phase2.addedFiles).Count) + external $(@($phase2.addedFiles).Count) = total $(@($disc.sortedCandidates).Count)"
  }

  [void](Invoke-ClassifyStage -Resolved $resolved -DiscoverResult $disc -ManifestDir $manifestDir)
  [void](Invoke-FallbackStage  -Resolved $resolved -ManifestDir $manifestDir)
  [void](Invoke-QStableKeyStage -Resolved $resolved -ManifestDir $manifestDir)
  [void](New-ManifestLock -Resolved $resolved -DiscoverResult $disc -ManifestDir $manifestDir)

  $verify = Invoke-VerifyStage -Resolved $resolved -ManifestDir $manifestDir
  Write-LogFile -Path (Join-Path $manifestDir 'error.log')

  if ($null -ne $verify.pass -and -not $verify.pass) {
    Write-RunnerLog -Level FATAL -StepName 'verify' -Message "byteDiff != 0 — Runner 비결정성 발견"
    Write-LogFile -Path (Join-Path $manifestDir 'error.log')
    exit 3
  }

  Write-RunnerLog -Level INFO -StepName 'done' -Message "9 files written to $manifestDir"
  Write-LogFile -Path (Join-Path $manifestDir 'error.log')
  exit 0
}

Invoke-AutoManifestRunner
