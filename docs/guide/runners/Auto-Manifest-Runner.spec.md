---
name: Auto Manifest Runner Spec (R14-Runner)
version: 1.0.0
schema-version: 1.0.0
runtime: PowerShell 5.1 (Windows PowerShell)
정본: 본 문서
작성일: 2026-05-07
---

# R14-Runner — Auto Manifest Runner 초안 명세

> **(MUST)** 본 명세는 `00_Agent지시_가이드.md §0.2 Auto Manifest 본처리` 와 `01_Agent부속_가이드.md A.8 Auto Manifest 9 파일 JSON 스키마` 를 *집행* 하는 외부 deterministic Runner 의 정본 명세이다.
>
> Agent 는 본 Runner 의 결과를 *해석·수정·보완·재분류할 수 없다* (00 §0.2.0 필수 문장). 결정값은 Runner 가 생성한 JSON 파일만 정본이다.

---

## §1. Runner 실행 명령

### 1.1 PowerShell 호출 형태 (정본)

```powershell
.\Auto-Manifest-Runner.ps1 `
  -SourceRoot   "<source-root 절대경로>" `
  -ModuleId     "<moduleId>" `
  -TargetKey    "<As-Is 코드 또는 screenId>" `
  [-AsIsId      "<As-Is 코드>"] `
  [-OutputRoot  "<docs 루트>"] `
  [-VerifyRuns  2]
```

### 1.2 호출 예시

```powershell
.\Auto-Manifest-Runner.ps1 `
  -SourceRoot "D:\devAi\Antigravity\project\ksm\docs\external\KsmErpK" `
  -ModuleId   "mpp" `
  -TargetKey  "PJA005K" `
  -AsIsId     "PJA005K" `
  -OutputRoot "D:\devAi\Antigravity\project\ksm\docs" `
  -VerifyRuns 2
```

### 1.3 종료 코드 enum

| ExitCode | 의미 |
|---:|---|
| 0 | 정상 — manifest 9 파일 모두 생성 + verify-report.pass=true |
| 1 | conflict — `conflict-report.json` 생성 후 중단 (산출물 생성 ✗) |
| 2 | input error — SourceRoot 미존재 / ModuleId 형식 오류 등 |
| 3 | verify failed — N 회 재실행 byte diff != 0 |
| 4 | runtime error — error.log 참조 |

---

## §2. 입력 인자 정의

| 인자 | 필수 | 타입 | 설명 | 검증 |
|---|:---:|---|---|---|
| `-SourceRoot` | Y | string (절대경로) | As-Is 자료 루트 (예: `docs/external/KsmErpK/`) | `Test-Path -PathType Container` 통과 |
| `-ModuleId` | Y | string | 00 §0.2.2 결정 결과 (예: `mpp`) | `^[a-z][a-z0-9]{2,15}$` enum 검증 |
| `-TargetKey` | Y | string | 00 §0.2.4 결정 결과 (예: `PJA005K`) | 공백·경로구분자 0 + NFC 정규화 |
| `-AsIsId` | N | string | As-Is 식별자 — 미제공 시 TargetKey 사용 | - |
| `-OutputRoot` | N | string | docs 루트 (default: `docs`) | `Test-Path -PathType Container` 통과 |
| `-VerifyRuns` | N | int | 재실행 회수 (default: 2 / min: 2 / max: 10) | byte diff 검증용 |

> Runner 는 본 6 인자 외 추가 입력을 받지 않는다. **사용자는 manifest 를 직접 작성하지 않는다** (R14-Runner 원칙 1).

---

## §3. 출력 파일 9 종 (01 A.8 스키마 1byte 준수)

출력 디렉토리: `{OutputRoot}/{ModuleId}/manifest/{TargetKey}/`

| # | 파일명 | 스키마 정본 | 생성 시점 |
|---:|---|---|---|
| 1 | `manifest.lock.json` | 01 A.8.1 | 모든 Step 통과 후 |
| 2 | `index.json` | 01 A.8.2 | discover 직후 |
| 3 | `discover.trace.json` | 01 A.8.3 | discover 단계 |
| 4 | `classify.trace.json` | 01 A.8.4 | classify 단계 |
| 5 | `fallback.trace.json` | 01 A.8.5 | fallback 단계 (해당 없으면 빈 배열) |
| 6 | `q-stable-key.json` | 01 A.8.6 | qStableKey 단계 |
| 7 | `conflict-report.json` | 01 A.8.7 | 충돌 시 only (정상 시 미생성) |
| 8 | `verify-report.json` | 01 A.8.8 | verify 단계 |
| 9 | `error.log` | 01 A.8.9 | 모든 단계 (라인당 1 entry) |

### 3.1 conflict 시 미생성 파일

Runner 는 conflict 발생 시 다음 파일을 *생성하지 않는다*:

- `manifest.lock.json` (00 §0.2.3 처리 1)
- `index.json` ~ `q-stable-key.json` (5 trace 파일)
- `verify-report.json`

오직 `conflict-report.json` + `error.log` 만 생성. 위치는 다음으로 분기:

| moduleId 결정 여부 | conflict-report 위치 |
|---|---|
| 확정 | `{OutputRoot}/{ModuleId}/manifest/{TargetKey}/conflict-report.json` |
| 미확정 | `{OutputRoot}/_unresolved/manifest/{TargetKey}/conflict-report.json` (00 §0.2.3) |

---

## §4. 디렉토리 생성 규칙

### 4.1 생성 순서

1. `{OutputRoot}/{ModuleId}/manifest/{TargetKey}/` 존재 검사
2. 미존재 시 `New-Item -ItemType Directory -Force` 로 생성 (재귀 부모 포함)
3. 기존 존재 시 — 모든 9 파일 *덮어쓰기* (Runner 는 idempotent)
4. conflict 시 — `_unresolved/manifest/{TargetKey}/` 분기 (`{ModuleId}` 폴더 생성 ✗)

### 4.2 디렉토리 경로 정규화

- 모든 경로는 forward slash (`/`) 또는 OS 네이티브 (`\`) 둘 중 하나로 통일 — Runner 는 내부에서 `[System.IO.Path]::Combine` 사용 후 출력 시 forward slash 로 정규화
- Unicode 정규화: NFC (00 §0.2.4 규칙 6)
- 대소문자: As-Is 코드는 대문자 / screenId 는 camelCase (00 §0.2.4 규칙 7)

### 4.3 산출물 분리 강제 (00 §0.2.5)

Runner 는 **`{OutputRoot}/{ModuleId}/design/{ScreenId}/` 아래에 manifest 파일을 절대 생성하지 않는다**. 두 위치는 분리 강제.

---

## §5. Deterministic Sort 규칙

> 모든 배열 / 객체 키 / 파일 목록은 다음 sort 규칙에 따라 결정성 강제.

### 5.1 객체 키 정렬 (JSON object)

- **Sort key**: 사전순 (Ordinal — `[StringComparer]::Ordinal`)
- 예: `{ "alpha": 1, "Zeta": 2, "beta": 3 }` → 정렬 후 `Zeta`, `alpha`, `beta` (대문자 우선 — Ordinal)
- 모든 중첩 객체에 재귀 적용

### 5.2 배열 정렬 (JSON array)

배열 타입별 sort key 강제:

| 배열 | sort key |
|---|---|
| `inputs[]` (manifest.lock.json) | `path` Ordinal asc |
| `discoveredFiles[]` (index.json) | `path` Ordinal asc |
| `steps[]` (discover/classify trace) | `stepNo` int asc |
| `items[]` (classify trace) | `id` Ordinal asc (예: G-001 < G-002 < ... < S-001) |
| `fallbacks[]` (fallback trace) | `targetId` Ordinal asc |
| `slots[]` / `appended[]` (q-stable-key) | `qId` Ordinal asc (Q-001 < Q-002 < ...) |
| `candidates[]` (conflict-report) | `priority` int asc → `value` Ordinal asc tiebreak |
| `runs[]` (verify-report) | `runNo` int asc |

### 5.3 파일 시스템 발견 정렬

`Get-ChildItem` 결과는 OS-dependent 순서 → Runner 는 항상 다음 강제:

```powershell
Get-ChildItem ... -Recurse |
  Sort-Object @{Expression={$_.FullName.Replace('\','/')}; Culture='Ordinal'} |
  ...
```

---

## §6. Conflict 처리 규칙

### 6.1 conflict 5 enum (01 A.8.7 `conflictType`)

| enum | 발생 조건 | 처리 |
|---|---|---|
| `moduleId.multiCandidate` | 동일 우선순위 moduleId 후보 ≥ 2 | conflict-report + 중단 |
| `moduleId.userVsA3` | 사용자 입력 moduleId 와 A.3 등재값 다름 | conflict-report + 중단 |
| `screenId.undecidable` | screenId 결정 algorithm 미충족 (Q-001 등재 대상) | conflict-report (Q-001 등재 후 진행 가능) |
| `targetKey.duplicate` | 동일 targetKey 가 다른 moduleId 에 존재 | conflict-report + 중단 |
| `sourceFile.notFound` | discover 결과 필수 role (`designer.cs` / `cs` / `sp.sql`) 0 개 | conflict-report + 중단 |

### 6.2 conflict 시 Runner 동작 (R14-Runner 원칙 7~9)

1. 즉시 모든 후속 Step 중단 (classify / fallback / qStableKey / verify 진입 ✗)
2. `conflict-report.json` 생성 (candidates 배열에 모든 후보 + priority 명시)
3. `error.log` 마지막 라인에 `[FATAL] [conflict] {conflictType}` 기록
4. ExitCode 1 반환
5. **Runner 는 후보를 임의 선택하지 않는다** (00 §0.2.2 규칙 4 / R14-Runner 원칙 7)

### 6.3 사용자 해결 절차

사용자는 `conflict-report.json` 의 `candidates[]` 중 하나를 선택하여 다음 인자로 재실행:

```powershell
.\Auto-Manifest-Runner.ps1 -ModuleId <선택값> ...
```

선택 후 `conflict-report.json` 의 `resolution` 필드가 채워지면 정합 §D.4 `conflict 미해결 여부` ✓.

---

## §7. JSON Stable Stringify 규칙 (1byte 결정성 핵심)

### 7.1 인코딩

- **Encoding**: UTF-8 *No BOM* (`[System.Text.UTF8Encoding]::new($false)`)
- **BOM 금지** — 다른 도구 호환성 + byte diff 결정성

### 7.2 Line Ending

- **LF (`\n`) 통일** — CRLF (`\r\n`) ✗
- 마지막 라인 끝 LF 1개 강제 (POSIX 텍스트 파일 컨벤션)

### 7.3 들여쓰기

- **2 space** 들여쓰기
- 탭 ✗

### 7.4 Key 정렬

- 객체 키: §5.1 Ordinal asc 재귀 적용
- 배열 항목: §5.2 sort key 적용

### 7.5 숫자 / boolean / null 표기

| 타입 | 표기 |
|---|---|
| int | `42` (소수점 ✗) |
| float | `3.14` (`3.14000` ✗ — 후행 0 제거) |
| boolean | `true` / `false` (소문자) |
| null | `null` |

### 7.6 문자열 escape

- ASCII 외 문자 — Unicode escape ✗ (raw UTF-8 유지)
- 제어 문자 (`\b` `\f` `\n` `\r` `\t`) 표준 escape
- `\u` escape — ` ` ~ `` 만 (제어 문자 외 escape ✗)

### 7.7 stable stringify 의사 알고리즘

```
function StableStringify(obj, indent=0):
  if obj is null:    return "null"
  if obj is bool:    return obj ? "true" : "false"
  if obj is number:  return TrimZero(obj.ToString("R"))
  if obj is string:  return "\"" + Escape(obj) + "\""
  if obj is array:
    sorted = ApplySortKey(obj)
    return "[\n" + sorted.map(item => Indent(indent+1) + StableStringify(item, indent+1)).join(",\n") + "\n" + Indent(indent) + "]"
  if obj is object:
    keys = obj.keys.SortOrdinalAsc()
    return "{\n" + keys.map(k => Indent(indent+1) + "\"" + k + "\": " + StableStringify(obj[k], indent+1)).join(",\n") + "\n" + Indent(indent) + "}"
```

### 7.8 PowerShell `ConvertTo-Json` 미사용 사유

PowerShell 내장 `ConvertTo-Json` 은 다음 비결정성 문제:
- key order 보장 ✗ (PSCustomObject vs Hashtable 차이)
- 숫자 표기 일관성 ✗ (`3.14` ↔ `3.140000` 환경 의존)
- BOM 추가 가능성 (PowerShell 5.1)

→ Runner 는 자체 `ConvertTo-StableJson` 함수 구현 (스크립트 내장).

---

## §8. SHA-256 Hash 생성 규칙

### 8.1 파일 hash

```powershell
Get-FileHash -Algorithm SHA256 -Path $filePath | Select-Object -ExpandProperty Hash
```

→ 64 자 대문자 hex string (예: `A3B5C7...`)

### 8.2 inputs hash (manifest.lock.json `inputHash` 필드)

inputs 배열 전체의 결정성 hash:

```
inputHash = SHA256(
  inputs.SortByPathOrdinal().Select(i =>
    i.path + "|" + i.sha256 + "|" + i.size
  ).Join("\n")
)
```

> `mtime` 은 hash 입력에 포함 ✗ (파일 시스템 timestamp 비결정성 회피).

### 8.3 q-stable-key 의 stableKey

```
stableKey = SHA256("Q-NNN|" + condition + "|" + action).ToUpper()
```

→ 동일 condition + action 이면 동일 qId 강제 (Q-NNN ID 결정성 핵심).

### 8.4 verify-report 의 outputHashes

각 manifest 파일의 SHA-256:

```json
"outputHashes": {
  "manifestLock": "<SHA256 of manifest.lock.json>",
  "index": "...",
  "discoverTrace": "...",
  "classifyTrace": "...",
  "fallbackTrace": "...",
  "qStableKey": "..."
}
```

---

## §9. verify-report 생성 규칙

### 9.1 검증 알고리즘

1. Runner 는 동일 인자로 **N 회 (default 2)** Discover → Classify → Fallback → QStableKey 단계를 반복 수행
2. 각 회차마다 출력 6 파일의 SHA-256 측정 → `runs[].outputHashes` 배열에 기록
3. 회차 간 모든 파일 hash 비교:
   - 동일 → `byteDiff[runNVsM] = 0`
   - 다름 → `byteDiff[runNVsM] = N` (N = 다른 byte 수, 정확하면 `Compare-Object` 라인 수)
4. 모든 byte diff == 0 → `pass = true` / 1 라도 다름 → `pass = false`
5. 마지막 회차 결과를 정본 manifest 파일로 채택

### 9.2 verify-report.json 생성 시점

- Runner 의 *마지막 단계* (모든 trace 파일 생성 후)
- `pass = false` 시 ExitCode 3 반환 + 산출물 임의 수정 ✗ (00 §0.2.0 원칙 8)

### 9.3 1차 단독 실행 (`-VerifyRuns 1`) 처리

- 단일 실행 시 `runs[]` 1 행만 생성 / `byteDiff = {}` 빈 객체
- `pass = null` (측정 불가)
- 정합 §D.4 행 9 (byte diff) = "(N차 회귀 시만 측정)" 표기

---

## §10. 동일 입력 재실행 byte diff 검증 방식

### 10.1 검증 흐름

```powershell
# 1차 실행
.\Auto-Manifest-Runner.ps1 -SourceRoot $src -ModuleId mpp -TargetKey PJA005K -VerifyRuns 1
# → docs/mpp/manifest/PJA005K/{9 파일 (verify-report.runs[0])}

# 2차 실행 (동일 인자)
.\Auto-Manifest-Runner.ps1 -SourceRoot $src -ModuleId mpp -TargetKey PJA005K -VerifyRuns 1
# → docs/mpp/manifest/PJA005K/{9 파일 (verify-report.runs[0])}

# 외부 byte diff 검증
$run1Hashes = Get-Content "run1/manifest.lock.json" | Get-FileHash -Algorithm SHA256
$run2Hashes = Get-Content "run2/manifest.lock.json" | Get-FileHash -Algorithm SHA256
$run1Hashes.Hash -eq $run2Hashes.Hash  # → True 강제
```

### 10.2 내장 검증 (`-VerifyRuns 2+`)

```powershell
.\Auto-Manifest-Runner.ps1 -SourceRoot $src -ModuleId mpp -TargetKey PJA005K -VerifyRuns 2
# → 내부에서 2회 실행 후 verify-report.byteDiff 자동 측정
# → pass=true 일 때만 ExitCode 0
```

### 10.3 byte diff 측정 명령

```powershell
# 두 manifest 디렉토리의 byte-level diff
$run1Files = Get-ChildItem -Path $run1Dir -Filter '*.json' | Sort-Object Name
$run2Files = Get-ChildItem -Path $run2Dir -Filter '*.json' | Sort-Object Name

foreach ($f1 in $run1Files) {
  $f2 = Join-Path $run2Dir $f1.Name
  $h1 = (Get-FileHash $f1 -Algorithm SHA256).Hash
  $h2 = (Get-FileHash $f2 -Algorithm SHA256).Hash
  if ($h1 -ne $h2) { Write-Error "byte diff: $($f1.Name) — $h1 vs $h2" }
}
```

---

## §11. PowerShell 초안 코드

> 별도 파일 [`Auto-Manifest-Runner.ps1`](./Auto-Manifest-Runner.ps1) 참조 — 본 명세 §1~§10 모두 적용된 실행 가능 초안.

### 11.1 코드 구조

| Section | 함수 / 라인 | 책임 |
|---|---|---|
| 헤더 | `param()` | 인자 6개 정의 (§2) |
| 상수 | `$schemaVersion / $runnerVersion / $fileTypeEnum` | 정본 enum |
| Helpers | `ConvertTo-StableJson` / `Get-FileHashSafe` / `Write-RunnerLog` | §5·§7·§8·§9 |
| Stage 1 | `Resolve-TargetKey` | 00 §0.2.4 (§2 검증) |
| Stage 2 | `Resolve-ModuleId` | 00 §0.2.2 (5 enum) |
| Stage 3 | `Invoke-Discover` | discover.trace.json 생성 |
| Stage 4 | `Invoke-Classify` | classify.trace.json |
| Stage 5 | `Invoke-Fallback` | fallback.trace.json |
| Stage 6 | `Invoke-QStableKey` | q-stable-key.json |
| Stage 7 | `New-ManifestLock` | manifest.lock.json |
| Stage 8 | `New-Index` | index.json |
| Stage 9 | `Invoke-Verify` | verify-report.json |
| Main | `Invoke-AutoManifestRunner` | 전체 orchestration |

### 11.2 PowerShell 5.1 호환성

- `Hashtable` (ordered dict 우선) 사용 — `[ordered]@{}`
- `New-Object` 또는 `[PSCustomObject]@{}` (정렬 후 stable stringify)
- `Get-FileHash` 표준 cmdlet 사용
- `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))` — BOM 제외

---

## §12. 간단한 실행 예시

### 12.1 정상 시나리오

```powershell
PS> cd D:\devAi\Antigravity\project\ksm\local_docs\테스트\runners
PS> .\Auto-Manifest-Runner.ps1 -SourceRoot 'D:\devAi\Antigravity\project\ksm\docs\external\KsmErpK' -ModuleId 'mpp' -TargetKey 'PJA005K' -OutputRoot 'D:\devAi\Antigravity\project\ksm\docs' -VerifyRuns 2

[INFO] [resolve] moduleId=mpp / targetKey=PJA005K / asIsId=PJA005K
[INFO] [discover] 7 files indexed (designer.cs=1, cs=1, resx=1, sp.sql=1, ddl.sql=1, entity.ts=0, mapping.md=0, capture.png=0)
[INFO] [classify] 24 controls classified (S=7, G=21, B=2, P=1, L1=8 / L2=1 / L4=1)
[INFO] [fallback] 17 fallbacks applied (level=5 DDL.extprop)
[INFO] [qStableKey] 9 q ids resolved (slots=7, appended=2)
[INFO] [lock] manifest.lock.json written (inputHash=A3B5...)
[INFO] [verify] run 1/2 — outputHash recorded
[INFO] [verify] run 2/2 — outputHash recorded
[INFO] [verify] byteDiff = 0 — pass=true
[INFO] [done] 9 files written to D:\devAi\Antigravity\project\ksm\docs\mpp\manifest\PJA005K\
ExitCode: 0
```

### 12.2 conflict 시나리오 (moduleId 미확정)

```powershell
PS> .\Auto-Manifest-Runner.ps1 -SourceRoot $src -TargetKey 'PJA005K' -ModuleId 'mpp'
[WARN] [resolve] moduleId 후보 2개: mpp / mqc — A.3 미등재 + 사용자 입력값 충돌
[FATAL] [conflict] moduleId.multiCandidate
[INFO] [done] conflict-report.json 만 생성됨 — D:\devAi\Antigravity\project\ksm\docs\_unresolved\manifest\PJA005K\
ExitCode: 1
```

### 12.3 verify 실패 시나리오

```powershell
PS> .\Auto-Manifest-Runner.ps1 -SourceRoot $src -ModuleId mpp -TargetKey PJA005K -VerifyRuns 3
[INFO] [verify] run 1/3 — outputHash recorded (manifest.lock=A3B5...)
[INFO] [verify] run 2/3 — outputHash recorded (manifest.lock=B7C8...)  ← 다름!
[ERROR] [verify] byteDiff: manifest.lock.json — run 1 vs 2 = 다름
[FATAL] [verify] pass=false — Runner 비결정성 발견
ExitCode: 3
```

---

## §13. 실패 시 Agent 처리 규칙

### 13.1 ExitCode 별 Agent 행동 enum

| ExitCode | Runner 결과 | Agent 행동 |
|---:|---|---|
| 0 | 정상 | 분석리포트 §-1 R14-Step0 + 정합체크서 §D.4 에 9 파일 hash 인용 → 산출물 5 종 진행 |
| 1 | conflict-report | **산출물 5 종 생성 ✗** (00 §0.2.0 원칙 7) — 사용자에게 conflict-report 전달 + candidates 선택 요청 |
| 2 | input error | Runner 인자 재확인 — Agent 자체 인자 추측 ✗ — 사용자에게 SourceRoot / ModuleId 확인 요청 |
| 3 | verify failed | **산출물 임의 수정 ✗** (00 §0.2.0 원칙 8) — 실패 보고만. Runner 의 비결정성 = 버그 → Runner 수정 후 재실행 |
| 4 | runtime error | error.log 본문을 사용자에게 전달 — Agent 가 Runner 의 오류를 회피·우회 ✗ |

### 13.2 Agent 가 *절대 하지 않는* 행동 (00 §0.2.0 9 원칙 재확인)

| # | 금지 행동 |
|---:|---|
| 1 | Runner 결과를 *해석* 하여 다른 결론 도출 |
| 2 | Runner 결과를 *수정* 하여 산출물에 인용 |
| 3 | Runner 결과를 *보완* (누락된 파일 자체 발견·추가) |
| 4 | Runner 가 분류한 결과를 *재분류* |
| 5 | conflict-report 의 candidates 중 하나를 *임의 선택* |
| 6 | verify-report.pass=false 인데 산출물 *진행* |
| 7 | manifest.lock.json 에 없는 파일을 *분석* |
| 8 | discover/classify/fallback 결과를 *재계산* |
| 9 | Runner 가 생성한 manifest 9 파일 중 하나라도 *직접 편집* |

### 13.3 Agent 가 *할 수 있는* 행동

| # | 허용 행동 |
|---:|---|
| 1 | Runner 를 *실행* (`.\Auto-Manifest-Runner.ps1 ...`) — 단, 결과는 인용만 |
| 2 | Runner 결과를 분석리포트 §-1 R14-Step0 에 *인용* |
| 3 | Runner 결과를 정합체크서 §D.4 에 *인용* |
| 4 | manifest 9 파일의 hash 를 `Get-FileHash` 로 *재측정* (검증 목적, 수정 ✗) |
| 5 | conflict-report 를 *그대로 사용자에게 전달* |
| 6 | verify-report.pass=false 일 때 사용자에게 *실패 보고* |

---

## §14. 본 spec 의 정합 검증

### 14.1 가이드 본문 ↔ 본 spec 동기

| 영역 | 가이드 정본 | 본 spec 위치 |
|---|---|---|
| Runner 9 원칙 | 00 §0.2.0 | §13.2 |
| 9 파일 위치 | 00 §0.2.1 | §3 |
| moduleId 선결정 5 enum | 00 §0.2.2 | §6.1 (conflict 5 enum) |
| moduleId 미확정 처리 | 00 §0.2.3 | §3.1 (conflict-report 위치) |
| targetKey 7 enum | 00 §0.2.4 | §2 (입력 인자 검증) + §4.2 |
| manifest ↔ 산출물 분리 | 00 §0.2.5 | §4.3 |
| 정합 §D 12 행 | 00 §0.2.6 | §13 (Agent 행동 enum) |
| 금지사항 6 | 00 §0.2.7 | §3.1 + §4.3 + §13.2 |
| 9 파일 JSON 스키마 | 01 A.8.1~A.8.9 | §3 (출력 파일 9종) |

### 14.2 Runner 자체 결정성 검증

Runner 출시 전 다음 자체 검증:

| 검증 | 측정 | 통과 기준 |
|---|---|---|
| stable stringify 결정성 | 동일 입력 → ConvertTo-StableJson → SHA256 | N 회 동일 hash |
| sort 결정성 | 동일 배열 → §5.2 sort key → SHA256 | N 회 동일 |
| 전체 Runner 결정성 | 동일 인자 → Runner 실행 → 9 파일 SHA256 | N=10 회 byte diff = 0 |

위 3 검증 모두 통과 시 Runner 본격 사용 가능. 1 회라도 실패 → 본 spec § 7 stable stringify 규칙 / §5 sort 규칙 점검 + Runner 코드 수정.

---

## §15. 향후 확장 (R14-Runner v2+)

본 v1 초안은 **최소 동작 골격**. 다음은 v2 이후 보강 후보:

| 영역 | v1 초안 | v2 보강 |
|---|---|---|
| classify trace | designer.cs Visible=false / 주석 / 외부 호출 7 enum | 12 enum 전체 (L1~L5 + G/GE/D/L + B/GB/S 흡수) |
| fallback trace | DDL ext.prop. 5단계 골격 | 폴백 모든 출처 (Label.Text / GroupBox / Tag / cs.dynamic / asIs.alias / DDL.extprop) trace |
| q-stable-key | 사전 7 슬롯 + append-only 골격 | Q-008+ stableKey 자동 분류 + Q-NNN 패턴 검증 (`{원천}이 {조건}일 때 {조치}`) |
| Runner 자체 buld | PowerShell 5.1 단일 스크립트 | Node.js 포팅 + GitHub Actions CI (deterministic 검증 자동) |

> v2 진입 조건: v1 초안으로 21~24차 회귀 4 회 시 byte diff = 0 + Agent 산출물 1byte 일치율 ≥ 95% 도달.
