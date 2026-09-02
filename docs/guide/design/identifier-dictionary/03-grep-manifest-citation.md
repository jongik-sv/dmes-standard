# 부속서 A. 식별자 사전

> 상위 문서: [부속서 A. 식별자 사전](../01_Agent부속_가이드.md)

## A.7 grep 명령 enum 사전 (R-13 신설)

> **(MUST)** Agent 가 분석 절차 (00 §6.5 SOP 30 Step) 실행 시 사용하는 grep 명령은 **본 절의 7 enum (C-1 ~ C-7) 외 사용 금지**. Agent 자체 PowerShell 명령 작성 ✗ → 본 7 패턴 1byte 인용만 허용.

### A.7.1 명령 enum 정본

| ID | 패턴 | 용도 | 사용 Step (예시) |
|---|---|---|---|
| **C-1** | `Select-String '<regex>' <file> -AllMatches` | 모든 매칭 (default) | Step 1·2·6·7·11·12·19·20·26 |
| **C-2** | `Select-String '<regex>' <file> -CaseSensitive` | 대소문자 구분 (`Visible=false` ↔ `visible=false` 구분) | Step 6 정밀 매칭 시 |
| **C-3** | `Select-String '<regex>' <file> -NotMatch` | 부정 매칭 (주석 라인 제외 등) | Step 8 (주석 ≠ 활성) |
| **C-4** | `Select-String '<regex>' <file> -Context N` | 전후 N 라인 (Lookup 묶음 검증) | Step 10 (Lookup 묶음 인접 컨트롤 확인) |
| **C-5** | `Get-ChildItem <dir> -Recurse -Include *.cs \| Select-String '<regex>'` | 다중 파일 grep | Step 9 (외부 화면 호출 검색) |
| **C-6** | `<C-1> \| Where-Object { $_.Line -notmatch '<제외>' }` | 1차 grep + 필터 | Step 7 (`/* */` 블록 주석 제외) |
| **C-7** | `<C-1>.Matches \| ForEach-Object { $_.Groups[N].Value }` | 캡처 그룹 추출 | Step 8·10·26 (그룹 [1]=컨트롤명 등) |

### A.7.2 명령 사용 규칙 (MUST)

| 규칙 | 적용 |
|---|---|
| **자체 정규식 작성 ✗** | 00 §6.5 의 각 Step 본문에 박힌 정규식 1byte 인용만 허용. 변형 ✗. |
| **명령 enum 외 도구 사용 ✗** | `findstr` / `grep` (Linux) / `rg` (ripgrep) / 자체 Read 도구 패턴 검색 모두 ✗ — PowerShell `Select-String` C-1 ~ C-7 만 |
| **옵션 변경 ✗** | C-1 ~ C-7 의 옵션 (`-AllMatches`, `-CaseSensitive` 등) 1byte 변경 ✗ |
| **결과 후처리 ✗** | grep 결과를 자체 추론으로 가공 ✗ → 결과 그대로 분석리포트 §X.Y 표에 기록 |
| **사례 외 패턴 발견 시 Q-NNN** | 본 7 enum 으로 매칭 불가능한 케이스 → 즉시 [확인필요: Q-NNN] + 해당 Step △ |

### A.7.3 정합체크서 §J 와의 연계

본 A.7 의 명령 enum 본문은 정합체크서 §J.3 N차 회귀 SOP 일치율 매트릭스의 **"명령 (grep 정규식 1byte)" 행** 검증 대상. drift 발생 시 (가이드 §6.5 본문 ↔ 본 A.7 명령 enum 불일치) 정합 §E.2 ✗.

### A.7.4 검증 (정합 §B `B-A7`): 분석리포트 본문에서 사용된 grep 명령 토큰이 본 7 enum (C-1~C-7) 형식과 100% 매칭

> 분석리포트의 각 표 위 주석 또는 §-1 SOP 결과 기록표의 "명령" 컬럼에 명시된 명령 = `C-{N}: <regex>` 형식 강제. 다른 형식 ✗.

---

## A.8 Auto Manifest 9 파일 JSON 스키마 (R-14 신설)

> **(MUST)** Auto Manifest Runner 가 생성하는 9 파일의 정본 스키마. Agent 는 본 스키마와 일치하는 파일만 인용 가능. 스키마 외 필드 / 누락 필드 발견 시 정합체크서 §D `enum 외 값 사용 여부` ✗ + `trace 누락 여부` ✗.

### A.8.1 `manifest.lock.json` — 입력 잠금

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | 스키마 버전 (예: `"1.0.0"`) | Y |
| `targetKey` | string | 0.2.4 결정 결과 (예: `"PJA005K"`) | Y |
| `moduleId` | string | 0.2.2 결정 결과 (예: `"mpp"`) | Y |
| `screenId` | string \| null | 분석 후 확정 시 채움. 미확정이면 null | N |
| `asIsId` | string \| null | As-Is 식별자 (예: `"PJA005K"`) | N |
| `lockedAt` | string (ISO8601) | 잠금 시각 | Y |
| `inputs[]` | array | 입력 자료 목록 (각 행 = `{ path, sha256, mtime, size, role }`) | Y |
| `runnerVersion` | string | runner 실행 파일 버전 | Y |
| `inputHash` | string | inputs 전체의 결정성 해시 (SHA-256) | Y |

### A.8.2 `index.json` — 자동 발견 결과 인덱스

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | 스키마 버전 | Y |
| `targetKey` | string | manifest.lock.json 과 일치 | Y |
| `discoveredFiles[]` | array | 발견 파일 (`{ path, role, sha256 }`) — role enum: `designer.cs` / `cs` / `resx` / `sp.sql` / `ddl.sql` / `entity.ts` / `mapping.md` / `capture.png` | Y |
| `roleCounts` | object | role 별 파일 수 (예: `{ "designer.cs": 1, "sp.sql": 1, ... }`) | Y |

### A.8.3 `discover.trace.json` — 입력 자료 발견 trace (Step 1~5)

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `steps[]` | array | 각 행 = `{ stepNo: 1~5, command: "C-1~C-7", regex: string, file: string, matchCount: int, result: "✓" \| "△" \| "✗", qNNN: string \| null }` | Y |

### A.8.4 `classify.trace.json` — 분류 결과 trace (Step 6~12)

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `steps[]` | array | 각 행 = `{ stepNo: 6~12, command, regex, matchCount, classification: "L1"\|"L2"\|"L3"\|"L4"\|"L5"\|"G"\|"GE"\|"D"\|"L"\|"B"\|"GB"\|"S"\|"P", items[] }` | Y |
| `items[]` | array | 각 분류 항목 = `{ id, controlName, sourceFile, sourceLine, reason }` | Y |

### A.8.5 `fallback.trace.json` — 폴백 5 단계 적용 trace

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `fallbacks[]` | array | 각 행 = `{ targetId: "S-001"\|"G-001"\|...,  level: 1~5, source: "Label.Text"\|"GroupBox.Text"\|"Tag"\|"cs.dynamic"\|"AsIs.alias"\|"DDL.extprop", value: string, applied: bool, qNNN: string \| null }` | Y |

### A.8.6 `q-stable-key.json` — Q-NNN ID 안정 키

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `slots[]` | array (사전 7) | `{ qId: "Q-001"~"Q-007", reserved: true, condition: string }` | Y |
| `appended[]` | array (Q-008+) | `{ qId, stableKey: SHA-256(원천+조건+조치), condition, action }` — append-only / `stableKey` 동일하면 동일 `qId` 재사용 강제 | Y |

### A.8.7 `conflict-report.json` — 후보 충돌 보고

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `conflictType` | string enum | `"moduleId.multiCandidate"` \| `"moduleId.userVsA3"` \| `"screenId.undecidable"` \| `"targetKey.duplicate"` \| `"sourceFile.notFound"` 등 | Y |
| `candidates[]` | array | `{ value, source: "A.3"\|"userInput"\|"pathScan", priority: 1~5 }` | Y |
| `resolution` | string \| null | 미해결 시 null. 해결 시 사용자 선택값 + 결정 시각 | N |

### A.8.8 `verify-report.json` — 동일 입력 재실행 byte diff 결과

| 필드 | 타입 | 의미 | 필수 |
|---|---|---|:---:|
| `schemaVersion` | string | - | Y |
| `targetKey` | string | - | Y |
| `runs[]` | array | 각 행 = `{ runNo: 1~N, inputHash, outputHashes: { manifestLock, index, discoverTrace, classifyTrace, fallbackTrace, qStableKey } }` | Y |
| `byteDiff` | object | `{ run1Vs2: 0\|N, run2Vs3: 0\|N, ... }` — 0 = 일치 | Y |
| `pass` | bool | 모든 byteDiff == 0 인지 | Y |

### A.8.9 `error.log` — runner 실행 오류 로그

| 형식 | 라인당 1 entry: `[ISO8601] [LEVEL] [stepName] message` |
|---|---|
| LEVEL enum | `INFO` \| `WARN` \| `ERROR` \| `FATAL` |
| stepName enum | `discover` \| `classify` \| `fallback` \| `qStableKey` \| `verify` \| `lock` |

### A.8.10 검증 (정합 §B `B-A8`): manifest 9 파일이 본 스키마와 1byte 일치

> Agent 는 본 스키마 외 필드 추가 / 필수 필드 누락 / enum 외 값 사용 발견 시 산출물 생성 ✗ + 정합 §D `enum 외 값 사용 여부` / `trace 누락 여부` 모두 ✗ 보고.

---

## A.9 인용·근거 정본화 (A4)

> **(MUST)** 모든 산출물의 표 행에는 **"출처·근거" 컬럼** 을 필수로 포함한다. 인용은 As-Is 원본 1 byte 그대로. 분량 회피 / 요약화 / 의미 축약 금지.

### A.9.1 출처·근거 컬럼 강제 (필수)

다음 산출물의 모든 표는 마지막 컬럼에 "출처·근거" 또는 동등 명칭 (`출처` / `근거 (file:line)` 등 — §A.10 형식) 을 둔다.

| 산출물 | 출처·근거 컬럼 필수 표 | 비고 |
|---|---|---|
| 분석리포트 | §1·§2·§3·§4·§5·§6·§7·§8·§9·§10·§11·§12·§13·§17.2·§-1 SOP | T2-A / T2-B / T3-A / T3-B / T3-C / T1-A~T1-D 모두 적용 |
| 설계서 (기능·디자인·BPMN·정합체크) | §1·§2·§3·§4·§5·§6 본문 표 | As-Is 인용이 포함된 모든 행 |
| 부속서 (A.1~A.12) | A.1.1·A.2.3·A.3.2·A.4 약어 사전 행 | 등재 PR 컬럼이 출처 역할 |

### A.9.2 인용 1 byte 보존 (MUST)

> **(MUST)** As-Is 인용은 원본 파일의 **1 byte 도 변경 없이** 인용한다. 다음 가공 금지:

| 가공 행위 | 사례 | 처리 |
|---|---|---|
| 동의어 치환 | `날짜구분 → 일자타입` | ✗ — 원본 `날짜구분` 보존 |
| 축약 | `작업오더번호 → 작업오더` | ✗ — 풀명 보존 |
| 띄어쓰기 정정 | `작업 오더 → 작업오더` | ✗ — As-Is 그대로 |
| 영어→한글 번역 | `WORK_TYPE → 작업유형` | ✗ — alias `WORK_TYPE` + Q-NNN |
| 한글→영어 음역 | `금형코드 → moldCd` (인용 컬럼에) | ✗ — To-Be 컬럼 별도 분리 |
| 의미 보충 | `(보류상태 = HOLD)` 괄호 부연 | ✗ — 원본 그대로 + 비고 컬럼 분리 |

### A.9.3 분량 회피 / 요약화 금지

- 컬럼 단위 1:1 전수 행 분해 강제 (메모리 [[feedback-design-thoroughness]]).
- 30 개 컬럼이면 30 행 (요약 / 그룹화 ✗).
- "이하 동일" / "기타 N 건" / "..." 생략 표기 ✗.

### A.9.4 검증 (정합 §B `B-A9`)

산출물 본문에서 As-Is 인용이 등장하는 모든 행 → 출처·근거 컬럼 (file:line) 존재 여부 100% 매칭 + 인용값과 원본 파일 1 byte 일치.

---

## A.10 인용 형식 정본 (A5)

> **(MUST)** 본 부속서·분석리포트·설계서·정합체크서의 **모든 인용** 은 본 절의 형식을 1 byte 단위로 준수한다. 형식 위반 시 정합 §B `B-A10` ✗.

### A.10.1 인용 형식 강제

| 형식 | 규칙 | 예시 |
|---|---|---|
| 기본 형식 | `{file}:{line}` 또는 `{file}:{lineFrom}-{lineTo}` | `HBB020.cs:402-407` |
| 파일명 | basename (확장자 포함) 단독 또는 워크스페이스 기준 경로 | `HBB020.cs` / `KsmK Project/HBB020/HBB020.cs` |
| 라인 | 정수 또는 정수-정수 (from ≤ to) | `402` / `402-407` |
| 다중 인용 | `{file}:{range}; {file}:{range}` (세미콜론 + 공백 구분) | `HBB020.cs:402-407; HBB020.Designer.cs:120-135` |
| 절·도큐먼트 인용 | `{file}:§{section}` (라인 미상 시) | `00_Agent지시_가이드.md:§6.5` |

### A.10.2 경로 표기 (MUST)

| 규칙 | 내용 |
|---|---|
| **상대 경로 금지** | `./HBB020.cs` / `../HBB020/HBB020.cs` 형식 ✗. 반드시 absolute path 또는 워크스페이스 기준 경로. |
| **워크스페이스 기준 경로** | `docs/external/KsmErpK/...` / `KsmK Project/KsmK Project/Tasks/...` 등 워크스페이스 루트 기준 단일 표현 — 동일 파일은 동일 표기. |
| **윈도우 경로 백슬래시 ✗** | 경로 구분자는 항상 `/` (forward slash). `\` 사용 ✗. |
| **공백/한글 경로** | 그대로 사용 (인용 시 따옴표 불필요 — 형식 매처가 `:` 토큰 기준으로 분리) |

### A.10.3 파일 경로 패턴 추측 금지 (MUST NOT)

> **(MUST NOT)** Agent 는 파일 경로를 패턴 추측으로 도출하지 않는다 (메모리 [[feedback-no-path-inference]] 인용). 작업 초기에 `ls` / `Glob` / `Get-ChildItem` 으로 확인한 **실제 경로만** 사용.

| 추측 사례 | 처리 |
|---|---|
| `KsmK Project/HBB020/HBB020.cs` 가 있을 것이다 (미확인) | ✗ — Glob 으로 실제 존재 확인 후 인용 |
| `docs/external/KsmErpK/procedures/SP_FOO.sql` 의 라인은 100-200 일 것이다 (미Read) | ✗ — Read 후 실제 라인 확인 후 인용 |
| 화면 코드 (`HBB020`) → 경로 (`KsmK Project/Tasks/HBB/HBB020/HBB020.cs`) 자동 매핑 | ✗ — Glob 으로 실제 위치 확인 (폴더 명명이 통일되지 않을 수 있음) |

### A.10.4 grep enum (§A.7) 연계

> 인용 형식 검증은 §A.7 의 grep 명령 enum (C-1 ~ C-7) 으로 수행. 본 §A.10 형식 위반은 정합 §J.3 N차 회귀 SOP 의 "인용 형식" 행에서 ✗.

| 검증 항목 | grep 명령 | 정규식 |
|---|---|---|
| `{file}:{line}` 형식 매칭 | C-1 | `^[^:]+:\d+(-\d+)?$` |
| 상대 경로 검출 (✗) | C-1 | `^\.\.?/` |
| 백슬래시 검출 (✗) | C-1 | `\\` |

### A.10.5 검증 (정합 §B `B-A10`)

산출물 본문의 모든 인용 토큰 → 본 §A.10.1 형식 100% 매칭. 상대 경로 / 백슬래시 / 라인 미상 (절 표기 없이) 1 건 이상 발견 시 ✗.

---
