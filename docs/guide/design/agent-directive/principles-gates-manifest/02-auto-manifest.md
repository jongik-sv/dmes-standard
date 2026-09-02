# Auto Manifest 본처리

> 상위 문서: [최우선 원칙, 게이트, Auto Manifest](../01-principles-gates-manifest.md)

## 0.2 Auto Manifest 본처리 (R-14)

### 0.2.0 R-14 결정 주체 원칙 (9 원칙 + 필수 문장)

> **(MUST)** Agent 가 Auto Manifest Runner 를 실행할 수는 있으나, 실행 결과를 해석·수정·보완·재분류할 수 없다. 결정값은 runner 가 생성한 JSON 파일만 정본으로 한다.

**Auto Manifest 본처리의 결정 주체는 Agent / LLM 이 아니다.** 외부 deterministic script / runner 가 수행한다. Agent 는 runner 가 생성한 manifest 9 파일을 *읽고 인용만* 한다.

**R-14 9 원칙**:

| # | 원칙 |
|---:|---|
| 1 | Auto Manifest 본처리의 결정 주체는 Agent / LLM 이 아니다. |
| 2 | Auto Manifest 는 외부 deterministic script / runner 가 수행한다. |
| 3 | Agent 는 runner 가 생성한 9 파일 (manifest.lock.json / index.json / discover.trace.json / classify.trace.json / fallback.trace.json / q-stable-key.json / conflict-report.json / verify-report.json / error.log) 을 읽고 인용만 한다. |
| 4 | Agent 는 `manifest.lock.json` 에 없는 파일을 분석하지 않는다. |
| 5 | Agent 는 discover / classify / fallback 결과를 재계산하지 않는다. |
| 6 | Agent 는 후보 충돌 시 임의 선택하지 않는다. |
| 7 | `conflict-report.json` 이 존재하면 분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 정합체크서를 생성하지 않는다. |
| 8 | `verify-report.json` 이 실패이면 산출물을 임의 수정하지 않고 실패 보고만 한다. |
| 9 | 동일 입력 재실행 byte diff 가 실패하면 R-14 통과로 보지 않는다. |

> **즉, Agent 는 manifest 생성자가 아니라 manifest 소비자다.**

### 0.2.1 Auto Manifest / trace / 검증 파일 생성 위치

Auto Manifest 관련 파일은 최종 설계 산출물 폴더 (`docs/{moduleId}/design/{화면식별자}/`) 에 생성하지 않는다.

최종 설계 산출물 폴더는 기존 가이드에 따라 5종 산출물 저장 위치로만 사용한다.

**최종 설계 산출물 위치**:

```
docs/{moduleId}/design/{화면식별자}/
```

**최종 산출물 파일**:

```
{화면식별자}_분석리포트.md
{화면식별자}_기능설계서.md
{화면식별자}_디자인설계서.md
{화면식별자}_BPMN설계서.md
{화면식별자}_정합체크.md
```

**Auto Manifest / trace / hash / conflict / verify 관련 내부 실행 증적 위치**:

```
docs/{moduleId}/manifest/{targetKey}/
```

**표준 9 파일**:

| # | 파일명 | 역할 |
|---:|---|---|
| 1 | `manifest.lock.json` | 입력 잠금 (정본 SHA-256 / 경로 / mtime) |
| 2 | `index.json` | 자동 발견 결과 인덱스 |
| 3 | `discover.trace.json` | 입력 자료 발견 trace (Step 1~5) |
| 4 | `classify.trace.json` | 분류 결과 trace (Step 6~12) |
| 5 | `fallback.trace.json` | 폴백 5 단계 적용 trace (표시명 / Q-NNN) |
| 6 | `q-stable-key.json` | Q-NNN ID 안정 키 |
| 7 | `conflict-report.json` | 후보 충돌 보고 (moduleId / screenId / targetKey 등) |
| 8 | `verify-report.json` | 동일 입력 재실행 byte diff 결과 |
| 9 | `error.log` | runner 실행 오류 로그 |

### 0.2.2 moduleId 선결정 규칙

`docs/{moduleId}/manifest/{targetKey}/` 경로를 생성하려면 `moduleId` 가 먼저 결정되어야 한다. 따라서 Auto Manifest 본처리 전에 `moduleId` 선결정 단계를 수행한다.

**moduleId 결정 우선순위 5 enum**:

| 순위 | 결정 기준 |
|---:|---|
| 1 | `01_Agent부속_가이드.md` A.3 화면 ↔ As-Is 매핑에 As-Is 코드가 등재되어 있으면 해당 `moduleId` 사용 |
| 2 | 사용자 입력에 `moduleId` 가 명시되어 있고 A.3 등재값과 충돌하지 않으면 사용자 입력값 사용 |
| 3 | As-Is 코드 또는 targetId 가 A.3 미등재이지만 파일 경로가 `docs/{moduleId}/...` 구조로 단일하게 식별되면 해당 `moduleId` 후보 사용 |
| 4 | 동일 우선순위 moduleId 후보가 2 개 이상이면 자동 선택 ✗ |
| 5 | moduleId 를 확정할 수 없으면 `manifest.lock.json` 을 생성하지 않고 `conflict-report.json` 만 생성 |

**moduleId 충돌 시 Agent 는 임의로 선택하지 않는다.**

**충돌 예**:

- 동일 targetId 가 `mpp`, `mqc` 양쪽에서 발견됨
- A.3 등재값과 사용자 입력 moduleId 가 다름
- source-root 탐색 결과 동일 우선순위 moduleId 후보가 2 개 이상임

이 경우 설계 산출물을 생성하지 않는다.

### 0.2.3 moduleId 미확정 시 처리

moduleId 가 확정되지 않으면 다음을 수행한다.

| # | 처리 |
|---:|---|
| 1 | `manifest.lock.json` 생성 ✗ |
| 2 | 분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 정합체크서 생성 ✗ |
| 3 | 구조화된 conflict-report 만 생성 |
| 4 | 사용자가 선택할 수 있는 moduleId 후보를 명시 |

**moduleId 미확정 conflict-report 위치**:

```
docs/_unresolved/manifest/{targetKey}/conflict-report.json
```

단, 이 위치는 임시 충돌 보고 전용이다. 정상 manifest 위치는 반드시 다음을 사용한다.

```
docs/{moduleId}/manifest/{targetKey}/manifest.lock.json
```

### 0.2.4 targetKey 규칙

`targetKey` 는 manifest 디렉토리명으로만 사용한다. 최종 산출물의 `screenId` 로 직접 사용하지 않는다.

**targetKey 결정 규칙 7 enum**:

| 순위 | 규칙 |
|---:|---|
| 1 | 사용자가 As-Is 코드를 제공한 경우: normalized As-Is 코드 사용 (예: `PJA005K`) |
| 2 | 사용자가 screenId 만 제공한 경우: normalized screenId 사용 (예: `workReport`) |
| 3 | As-Is 코드와 screenId 가 모두 제공된 경우: As-Is 코드 우선 (예: `PJA005K`) |
| 4 | 공백 제거 |
| 5 | 경로 구분자 제거 또는 `_` 로 정규화 |
| 6 | Unicode NFC 정규화 |
| 7 | 대소문자 규칙 — As-Is 코드는 대문자 유지 / screenId 는 기존 camelCase 유지 |

### 0.2.5 manifest 와 최종 산출물의 관계

manifest 계열 파일은 최종 설계 산출물이 아니다.

**역할 구분**:

| 위치 | 역할 |
|---|---|
| `docs/{moduleId}/manifest/{targetKey}/` | 입력 잠금 / 자동 발견 결과 / 후보 선택 trace / fallback trace / Q-NNN stable key / hash 검증 / conflict 보고 / 반복 결정성 검증 증적 |
| `docs/{moduleId}/design/{화면식별자}/` | 분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 정합체크서 |

최종 설계 산출물은 Auto Manifest 완료 후 확정된 `screenId` 기준으로 기존 저장 위치에 생성한다.

### 0.2.6 정합체크서 반영 방식

정합체크서에는 manifest 원문을 붙여넣지 않는다.

정합체크서에는 기존 템플릿 구조를 유지하면서 §D 반복 설계 결정성 검증에 다음 값만 기록한다 (12 행).

| # | 행 |
|---:|---|
| 1 | manifest.lock.json 경로 |
| 2 | manifest.lock hash |
| 3 | index hash |
| 4 | discover trace hash |
| 5 | classify trace hash |
| 6 | fallback trace hash |
| 7 | q-stable-key hash |
| 8 | verify-report 결과 |
| 9 | 동일 입력 재실행 byte diff 결과 |
| 10 | enum 외 값 사용 여부 |
| 11 | trace 누락 여부 |
| 12 | conflict 미해결 여부 |

정합체크서의 최상위 절 구조는 변경하지 않는다.

### 0.2.7 금지사항

| # | 금지 |
|---:|---|
| 1 | `docs/{moduleId}/design/{화면식별자}/` 아래에 manifest.lock.json 기본 생성 ✗ |
| 2 | 최종 5종 설계 산출물과 manifest 파일을 같은 폴더에 섞어 저장 ✗ |
| 3 | moduleId 미확정 상태에서 `docs/{moduleId}/manifest` 경로를 임의 생성 ✗ |
| 4 | moduleId 후보가 복수인데 Agent 가 하나를 임의 선택 ✗ |
| 5 | manifest 파일을 설계 산출물로 간주 ✗ |
| 6 | manifest 원문을 정합체크서 본문에 삽입 ✗ |

### 0.2.8 R14-Runner 정본 위치 (R-14 필수 후속 — 본 가이드만으로 1byte 동일성 ✗)

> **(MUST)** 본 §0.2 의 9 원칙 / 9 파일 / moduleId 선결정 / targetKey / 금지사항을 *집행* 하는 외부 deterministic Runner 가 **반드시 존재**해야 한다. 본 가이드 본문만으로는 동일 As-Is 입력에 대한 1byte 동일성을 보장할 수 없다.

| 항목 | 정본 위치 |
|---|---|
| Runner 명세 (13 항목) | [`docs/guide/runners/Auto-Manifest-Runner.spec.md`](../../../runners/Auto-Manifest-Runner.spec.md) |
| Runner 초안 코드 (PowerShell 5.1) | [`docs/guide/runners/Auto-Manifest-Runner.ps1`](../../../runners/Auto-Manifest-Runner.ps1) |
| Runner 호출 형태 | `.\Auto-Manifest-Runner.ps1 -SourceRoot <abs> -ModuleId <id> -TargetKey <key> [-AsIsId <id>] [-OutputRoot <docs>] [-VerifyRuns 2]` |
| Runner 종료 코드 enum | 0 정상 / 1 conflict / 2 input error / 3 verify failed / 4 runtime error |
| Runner 결과 인용 위치 | 분석.template `§-1 R14-Step0` (9 파일 hash) + 정합.template `§D.4` (12 행) |

> Agent 는 Runner 를 *실행* 할 수는 있으나, 실행 결과를 *해석·수정·보완·재분류* 할 수 없다. 결정값은 Runner 가 생성한 9 JSON 파일만 정본이다 (00 §0.2.0 필수 문장).

### 0.2.9 Agent Runner 자동 호출 절차 (R14-Auto 신설 — 5 단계 / ExitCode 분기)

> **(MUST)** §5 생성 순서 Step 0 의 구체적 실행 절차. Agent 는 분석 1번째 행동으로 본 5 단계를 순차 실행한다. 단계 건너뛰기 ✗ / 자체 grep 으로 manifest 대체 ✗.

#### 0.2.9.1 Step 0-A — Runner 인자 결정 (4 enum)

| 인자 | 결정 절차 |
|---|---|
| `-SourceRoot` | 사용자 입력 As-Is 자료 절대경로 (예: `D:\devAi\...\KsmErpK`). 미제공 시 사용자에게 질의 — Agent 자체 추측 ✗ |
| `-ModuleId` | 00 §0.2.2 결정 우선순위 5 enum 적용. 후보 복수 시 conflict-report 분기 |
| `-TargetKey` | 00 §0.2.4 결정 7 enum 적용 (As-Is 코드 우선). NFC 정규화 |
| `-AsIsId` | TargetKey 와 다를 때만 명시. 동일하면 생략 (Runner 가 TargetKey 사용) |
| `-OutputRoot` | default = 프로젝트 루트의 `docs` (사용자 별도 지정 시 그 값) |
| `-VerifyRuns` | 1차 분석: `2` (default) / N차 회귀: `3` 권장 / 단독 실행: `1` |

#### 0.2.9.2 Step 0-B — Runner 호출 명령 1byte 강제

```powershell
& 'local_docs\테스트\runners\Auto-Manifest-Runner.ps1' `
  -SourceRoot <abs path> `
  -ModuleId   <moduleId> `
  -TargetKey  <targetKey> `
  -OutputRoot <docs root> `
  -VerifyRuns 2
```

> **(MUST)** Agent 는 본 명령 외 형태로 Runner 호출 ✗ (인자 순서·옵션 변경 ✗). 실행 후 ExitCode 캡처.

#### 0.2.9.3 Step 0-C — ExitCode 분기 처리 (5 enum)

| ExitCode | Runner 결과 | Agent 행동 (1byte 강제) |
|---:|---|---|
| **0** | 정상 (manifest 9 파일 + verify-report.pass=true) | Step 1~16 진행 가능 → 분석.template §-1 R14-Step0 에 9 파일 hash 인용 → §0~§16 작성 (manifest 인용만) |
| **1** | conflict (`conflict-report.json` 생성됨) | **Step 1~16 진행 ✗** + 산출물 5 종 생성 ✗ + conflict-report 사용자 전달 + candidates 선택 요청 (00 §0.2.0 원칙 7) |
| **2** | input error (SourceRoot 미존재 / ModuleId 형식 오류 등) | 인자 재확인 — Agent 자체 인자 추측 ✗ — 사용자에게 SourceRoot / ModuleId 확인 요청 |
| **3** | verify failed (byteDiff != 0) | **산출물 임의 수정 ✗** + 실패 보고만 (00 §0.2.0 원칙 8) — Runner 비결정성 = 버그 → Runner 수정 후 재실행 (Agent 영역 ✗) |
| **4** | runtime error | error.log 본문 사용자 전달 — Agent 가 Runner 오류 회피·우회 ✗ |

#### 0.2.9.4 Step 0-D — manifest 9 파일 hash 인용

ExitCode 0 시: Agent 는 `docs/{ModuleId}/manifest/{TargetKey}/` 디렉토리의 9 파일 SHA-256 을 측정하여 분석.template §-1 R14-Step0 표에 기록. 측정 명령 enum:

```powershell
$manifestDir = "docs\{ModuleId}\manifest\{TargetKey}"
@('manifest.lock.json','index.json','discover.trace.json','classify.trace.json','fallback.trace.json','q-stable-key.json','conflict-report.json','verify-report.json','error.log') |
  ForEach-Object {
    $p = Join-Path $manifestDir $_
    if (Test-Path $p) { (Get-FileHash -Algorithm SHA256 $p).Hash } else { '(없음)' }
  }
```

#### 0.2.9.5 Step 0-E — 본격 분석 진입

R14-Step0 9 행 모두 ✓ 확인 후에만 §6.4-R13.1 Step 1 (DDL 인용) 진입. R14-Step0 행 1 개라도 ✗ → 분석 중단 + Step 0-C 분기 재처리.

### 0.2.10 manifest 캐시 정책 (R14-Auto 신설 — 중복 호출 차단 + 자동 갱신)

> **(MUST)** Agent 는 *매 화면 분석 시점* 에 본 캐시 정책을 평가한다. 결과에 따라 Runner 재실행 or 캐시 인용 분기.

#### 0.2.10.1 캐시 평가 4 enum

| # | 조건 | Agent 행동 |
|---:|---|---|
| 1 | manifest 디렉토리 미존재 (`docs/{moduleId}/manifest/{targetKey}/`) | **Runner 자동 실행** (Step 0-B) |
| 2 | manifest 디렉토리 존재 + `verify-report.json` 미존재 | **Runner 자동 실행** (불완전 — 이전 실행 중단) |
| 3 | manifest 디렉토리 존재 + `verify-report.pass=true` + As-Is 자료 mtime 동일 | **캐시 인용** (Runner 재실행 ✗) |
| 4 | manifest 디렉토리 존재 + `verify-report.pass=true` + As-Is 자료 mtime 변경 | **Runner 자동 재실행** (입력 변경 → 재생성 강제) |

#### 0.2.10.2 As-Is 자료 mtime 비교 절차

```powershell
$manifestLock = Get-Content "$manifestDir\manifest.lock.json" -Raw | ConvertFrom-Json
$cacheValid = $true
foreach ($i in $manifestLock.inputs) {
  $current = (Get-Item $i.path).LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  if ($current -ne $i.mtime) { $cacheValid = $false; break }
}
```

`$cacheValid -eq $false` → Runner 자동 재실행 (Step 0-B).

#### 0.2.10.3 사용자 강제 재실행 옵션

사용자가 manifest 강제 재생성을 원할 때:

```powershell
Remove-Item "docs\{moduleId}\manifest\{targetKey}" -Recurse -Force
```

→ 캐시 평가 1번 분기 (미존재) → 자동 재실행.

#### 0.2.10.4 conflict-report.json 잔존 시 처리

`conflict-report.json` 이 캐시에 잔존하고 `resolution` 필드가 채워지지 않았으면 → **Step 1~16 진행 ✗**. 사용자가 candidates 선택 후 Runner 재실행 강제.

### 0.2.11 SourceRoot 자동 탐색 (R14-Auto-6 신설)

> **(MUST)** `SourceRoot` 인자 미제공 시 Runner 가 [`docs/guide/runners/source-roots.config.json`](../../../runners/source-roots.config.json) 을 인용하여 **자동 탐색**한다. Agent 는 SourceRoot 를 사용자에게 묻지 않는다 — config 가 정본.

#### 0.2.11.1 config 정본 위치 + 스키마

| 항목 | 값 |
|---|---|
| 정본 위치 | [`docs/guide/runners/source-roots.config.json`](../../../runners/source-roots.config.json) |
| 스키마 버전 | `1.0.0` |
| 핵심 필드 | `sourceRoots[]` (priority 정렬) / `discovery.minRequiredRoles` / `conflictPolicy` |
| 후보 행 enum | `priority` (int) / `name` / `path` / `pathBase` (`projectRoot` \| `absolute`) / `vendor` / `asIsPattern` (regex) / `moduleHint` / `innerConvention` |

#### 0.2.11.2 자동 탐색 알고리즘 (Runner 측 — `Find-SourceRoot` 함수)

| Step | 처리 |
|---:|---|
| 1 | config 의 `sourceRoots[]` 를 `priority` asc 정렬 |
| 2 | 각 후보에 대해: `asIsPattern` 매칭 검사 → 미매칭 시 skip |
| 3 | 후보 path 가 `pathBase=projectRoot` 면 `Join-Path $ProjectRoot $path` / `absolute` 면 그대로 |
| 4 | path 미존재 시 skip |
| 5 | path 내부 파일 grep → role 분류 → `minRequiredRoles` 모두 발견 시 후보 채택 (designer.cs / cs / resx 는 TargetKey 매칭 강제 / sp.sql / ddl.sql / mapping.md 등은 매칭 없이도 인정) |
| 6 | 채택 후보 0 개 → `conflictType=sourceRoot.noCandidate` + 산출물 ✗ |
| 7 | 채택 후보 1 개 → SourceRoot 결정 ✓ |
| 8 | 동일 priority 채택 후보 ≥ 2 → `conflictType=sourceRoot.multiCandidate` + 산출물 ✗ |
| 9 | 다른 priority 채택 후보 ≥ 2 → 최고 priority 후보 자동 채택 (priority asc 우선) |

#### 0.2.11.3 Agent 호출 형태

```powershell
# SourceRoot 미제공 → 자동 탐색 사용
& '<runner.ps1>' -ModuleId <id> -TargetKey <key> -OutputRoot <docs> -ProjectRoot <proj> -VerifyRuns 2

# config 위치 명시 (default = runner 디렉토리의 source-roots.config.json)
& '<runner.ps1>' -ModuleId <id> -TargetKey <key> -ConfigPath <abs path>
```

#### 0.2.11.4 conflict 발생 시 Agent 행동

| `conflictType` | Agent 행동 |
|---|---|
| `sourceRoot.noCandidate` | config 후보 모두 미충족 — 사용자에게 (1) 신규 source-root 추가 또는 (2) `-SourceRoot` 명시 요청 |
| `sourceRoot.multiCandidate` | 동일 priority 후보 복수 — 사용자에게 priority 조정 또는 명시 요청 |
| `sourceRoot.configNotFound` | config 미존재 — 사용자에게 source-roots.config.json 생성 요청 |

> Agent 는 conflict 시 후보를 *임의 선택* ✗ (00 §0.2.0 원칙 6).

#### 0.2.11.5 신규 source-root 등재 절차

사용자가 새 As-Is 자료 위치를 추가할 때:

1. `source-roots.config.json` 의 `sourceRoots[]` 에 신규 행 추가 (priority / path / asIsPattern 명시)
2. priority 충돌 회피 (기존 행과 다른 값)
3. Runner 재실행 → 자동 탐색 재진행

> config 변경은 *사용자 영역*. Agent 가 config 자체를 수정 ✗ (00 §0.2.0 원칙 1).

### 0.2.12 Phase 별 자료 수집 (R14-Phase2 신설 — cs 가 호출하는 자료만)

> **(MUST)** Runner 의 자료 수집은 **Phase 1 → Phase 2 → Phase 3** 순으로 진행. 각 Phase 는 *이전 Phase 결과* 에서 자료 이름을 추출 → 외부 디렉토리에서 *해당 자료만* 검색. **무차별 grep 차단 + 무인입 차단** 의 핵심.

#### 0.2.12.1 3 Phase 구조 표

| Phase | 입력 | 처리 | 출력 (manifest inputs[]) | 정본 |
|---:|---|---|---|---|
| **Phase 1** (form discovery) | SourceRoot 단일 폴더 | 화면 cs / designer.cs / resx 발견 (TargetKey 매칭) | form 영역 (3 행 표준) | `Invoke-DiscoverStage` |
| **Phase 2** (sp resolution) | Phase 1 의 cs 본문 | `NewQuery("\w+")` grep → SP 이름 추출 → `procedures/{spName}.sql` 검색 | sp 영역 (실제 호출만 N 행) | `Resolve-ExternalReferences` |
| **Phase 3** (ddl resolution — v2 후보) | Phase 2 의 SP 본문 | `FROM \w+` `JOIN \w+` grep → 테이블 추출 → `tables/{tableName}.sql` 검색 | ddl 영역 (실제 사용만 N 행) | (`enabled=false` — v2 보강) |

#### 0.2.12.2 핵심 원칙 (R14-Phase2)

| # | 원칙 |
|---:|---|
| 1 | **무차별 grep 금지** — `procedures/` 전체를 SourceRoot 로 잡지 않는다. cs 가 *명시적으로 호출* 하는 SP 만 인입 |
| 2 | **무인입 금지** — cs 만 SourceRoot 로 잡지 않는다. cs 본문 grep 으로 호출 SP 자동 추출 |
| 3 | **호출 패턴 enum 정본** — `source-roots.config.json` 의 `externalSourceDirs[].resolveCallPatterns` 에 박힌 패턴만 사용. Agent / Runner 자체 패턴 작성 ✗ |
| 4 | **외부 디렉토리 절대경로 정본** — `externalSourceDirs[].path` 가 정본. Agent 가 다른 위치 검색 ✗ |
| 5 | **각 Phase 결과는 다음 Phase 의 입력** — `resolveFromPhase` 필드로 Phase 간 의존성 명시 |

#### 0.2.12.3 KsmErpK 환경 적용 결과 예시

```
[INFO] [discover] 3 files indexed (Phase 1 form)
  PJA005K.cs / PJA005K.Designer.cs / PJA005K.resx

[INFO] [phase2] KsmErpK procedures — 추출 이름 1 개: soPJA005
[INFO] [phase2] KsmErpK procedures — 발견 파일 1 / 추출 이름 1
[INFO] [phase2] Phase 2 통합: form 3 + external 1 = total 4
```

→ 21차 (SP 2054 노이즈) ✗ + 22차 (SP 0 부족) ✗ → **R14-Phase2 (실제 호출 SP 1개)** ✓

#### 0.2.12.4 config 의 externalSourceDirs 행 enum

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `name` | string | 외부 디렉토리 식별자 (예: "KsmErpK procedures") | Y |
| `path` | string | 외부 디렉토리 절대경로 또는 SourceRoot 상대경로 | Y |
| `pathBase` | string enum | `absolute` \| `sourceRoot` \| `projectRoot` | Y |
| `role` | string | 인입될 파일의 role enum (`sp.sql` / `ddl.sql` / ...) | Y |
| `filenamePattern` | string | 파일명 템플릿 (`{spName}.sql` / `{tableName}.sql`) | Y |
| `resolveFromPhase` | int | 호출 패턴을 grep 할 Phase 번호 (1 = form cs, 2 = sp 본문) | Y |
| `resolveCallPatterns` | array | grep 정규식 패턴 enum (group 1 = 추출 이름) | Y |
| `enabled` | bool | false 면 Phase skip (v2 보강 후보 표기용) | N (default true) |

#### 0.2.12.5 LoV master 호출 (`NewCodeQuery`) 처리 — Phase 외부

`NewCodeQuery("P021")` 같은 *공통 코드 마스터* 호출은 본 Phase 메커니즘 ✗:

| 이유 | 처리 |
|---|---|
| 공통 코드 마스터 = B_COMM_CODE 테이블 조회 (특정 SP 파일 ✗) | LV-NNN 분류로만 처리 (분석.template §9.2) |
| 코드 키 (P021/P013/...) 자체가 manifest 자료 ✗ | manifest 미인입 (만약 인입 필요 시 v2 에서 별도 mechanism) |

---
