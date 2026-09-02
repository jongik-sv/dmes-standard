## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증 (분석 ↔ 설계서 4 종 동일)

<!-- 검증 대상: 분석리포트 §6.4 알고리즘이 도출한 핵심 결정 항목이 본 설계서 4 종에 동일하게 등장하는지. 정본/잠금 개념 없이 알고리즘 결과 자체로 결정성 확보. -->

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 (✓/✗) |
|---|---|---|---|---|---|
| screenId |  |  |  |  |  |
| asIsId |  |  |  |  |  |
| moduleId |  |  |  |  |  |
| moduleGroup |  |  |  |  |  |
| serviceId |  |  |  |  |  |
| S-NNN 수 |  |  |  | (해당 없음) |  |
| G-NNN 수 |  |  |  | (해당 없음) |  |
| GE-NNN / G2-NNN 수 |  |  |  | (해당 없음) |  |
| B-NNN 수 |  |  |  |  |  |
| P-NNN 수 |  |  |  |  |  |
| statusCodes 목록 |  |  |  |  |  |
| C1~C6 충족 개수 |  | (해당 없음) | (해당 없음) |  |  |
| API 패턴 (OASIS / Phase 7 / 잠정 OASIS) |  | (해당 없음) | (해당 없음) |  |  |
| action 목록 |  |  |  |  |  |

**(MUST)** 모든 행 ✓ — 분석리포트 값과 다른 값을 설계서가 사용하면 ✗.

### D.2 반복 설계 결정성 검증 (동일 As-Is 자료 2 회 생성 시)

<!-- 검증 대상: 동일 As-Is 자료에 "처음 하는 작업처럼" 프롬프트로 N 차 재생성 시 동일 결과 도출. -->

| 항목 | 1차 값 | 2차 값 | 일치 (✓/✗) |
|---|---|---|---|
| S-NNN 수와 순서 |  |  |  |
| G-NNN 수와 순서 |  |  |  |
| GE-NNN / G2-NNN 수와 순서 |  |  |  |
| D-NNN / L-NNN 수와 순서 |  |  |  |
| B-NNN 수와 순서 |  |  |  |
| **GB-NNN 수와 순서** |  |  |  |
| P-NNN 수와 순서 |  |  |  |
| statusCodes 목록 (00 §6.4.6 통합) |  |  |  |
| C1~C6 판정 결과 |  |  |  |
| API 패턴 (충족 개수 → 채택) |  |  |  |
| serviceId |  |  |  |
| action 목록 |  |  |  |
| 산출물 절 순서 |  |  |  |
| 표 헤더 (컬럼명·수·순서) |  |  |  |
| **D-T1B**: S 카운트 N차 동일 (Lookup 묶음 일관) |  |  |  |
| **D-T1C**: D + L + GE 합 == SP 의 sList 외 SELECT 분기 수 (00 §6.4.3-1 매트릭스) |  |  |  |
| **D-T1D**: B + GB 합 == designer.cs 의 모든 Button + ButtonField 수 |  |  |  |
| **D-T1E**: statusCodes 카운트 == 00 §6.4.6 포함/제외 매트릭스 적용 결과 |  |  |  |
| **D-T1F**: 컨트롤별 핸들러 수 == 행 수 (Lookup 묶음 행 별도) |  |  |  |
| **D-T2C**: 디자인 §1 페이지 유형 == 00 §6.4.0 알고리즘 결과 (A~E 자동 결정) |  |  |  |
| **D-T3D**: API 라우팅 == 04 §A.2-3-2 표 그대로 (자체 분류 ✗) |  |  |  |

**(MUST)** 모든 행 ✓ — 본 §D 의 검증 대상은 모두 분석리포트 §6.4 알고리즘 결과. Q-NNN 카운트는 ±1 허용.

### D.3 N차 반복 생성 회귀 매트릭스 (R-11 + R-12 강화 — 측정 방법 컬럼 자동화)

> **(R-12 추가)** 각 검증 행에 PowerShell 측정 명령 명시 → 자동 cross diff 가능. 17~20차 회귀 시 1회 스크립트 실행으로 전체 측정.

| 항목 | 1차 | 2차 | 3차 | 4차 | 측정 방법 (PowerShell) | max-min | 결과 |
|---|---|---|---|---|---|---|---|
| screenId |  |  |  |  | `(Get-Content $f -TotalCount 10 \| Select-String '^screenId:').Line` |  |  |
| serviceId |  |  |  |  | `(Get-Content $f -TotalCount 30 \| Select-String 'serviceId:.+\|').Matches.Value` |  |  |
| S-NNN 수 |  |  |  |  | `(Select-String '^\| S-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| G-NNN 수 |  |  |  |  | `(Select-String '^\| G-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| GE-NNN 수 |  |  |  |  | `(Select-String '^\| GE-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| D-NNN / L-NNN 수 |  |  |  |  | `(Select-String '^\| (D\|L)-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| B-NNN 수 |  |  |  |  | `(Select-String '^\| B-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| GB-NNN 수 |  |  |  |  | `(Select-String '^\| GB-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| P-NNN 수 |  |  |  |  | `(Select-String '^\| P-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| ST-NNN 수 |  |  |  |  | `(Select-String '^\| ST-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| LV-NNN 수 |  |  |  |  | `(Select-String '^\| LV-\d{3} \|' $f -AllMatches).Matches.Count` |  |  |
| C1~C6 충족 개수 |  |  |  |  | `(Select-String '^\| C[1-6]\..+\| Y \|' $f -AllMatches).Matches.Count` |  |  |
| API 패턴 |  |  |  |  | `(Select-String '채택 패턴.+\|' $f).Line` |  |  |
| §4.1 행 수 (T1-A) |  |  |  |  | `Compare-MdSection -Path $f -Section '4.1' -RowCount` (== 10) |  |  |
| §0.1~§0.5 사전 판정표 작성 |  |  |  |  | `(Select-String '^### 0\.[1-5]' $f).Count -eq 5` |  |  |
| 절 순서 (## 헤더) |  |  |  |  | `(Select-String '^## ' $f).Line -join ';'` |  |  |
| 표 헤더 동일성 |  |  |  |  | `Compare-Object $tpl_headers $out_headers` |  |  |

<!--
  검증 대상: 동일 As-Is 자료를 N=4회 이상 반복 생성한 결과의 차수별 일관성.
  본 표는 §D.2 의 2회 비교를 N차 (4 회 권장) 로 확장한 회귀 매트릭스.
  R10-1~R10-7 결정성 보강 규칙 + R-11 폴백 우선순위 + 사전 판정표가 N차에 걸쳐 동일 결과를 도출하는지 검증.

  R-11 추가 검증:
  - R11-A: 사전 판정표 5종 작성 여부 (자연제외 / S 정렬 / G/GE 분기 / B/GB 분류 / P 후보)
  - R11-B: 화면 표시명 폴백 5단계 적용 (한글/영어 혼재 ✗)
  - R11-C: 자연제외 우선순위 (L1~L5) 일관 적용
  - R11-D: GE vs G2 명명 우선 (확장 1 개 시 GE 강제)
  - R11-E: T1-E 산식 적용 결과 일치
  - R11-F: P-NNN 호출 순서 (line number) 일관
-->

| 항목 | 1차 | 2차 | 3차 | 4차 | max-min / 불일치 | 결과 (✓/✗) |
|---|---|---|---|---|---|---|
| screenId |  |  |  |  |  |  |
| serviceId |  |  |  |  |  |  |
| S-NNN 수 |  |  |  |  |  |  |
| S-NNN 순서 |  |  |  |  |  |  |
| G-NNN 수 |  |  |  |  |  |  |
| G-NNN 순서 |  |  |  |  |  |  |
| GE-NNN / G2-NNN 수 |  |  |  |  |  |  |
| D-NNN 수 |  |  |  |  |  |  |
| L-NNN 수 |  |  |  |  |  |  |
| B-NNN 수 |  |  |  |  |  |  |
| GB-NNN 수 |  |  |  |  |  |  |
| P-NNN 수 |  |  |  |  |  |  |
| ST-NNN 수 |  |  |  |  |  |  |
| LV-NNN 수 |  |  |  |  |  |  |
| C1~C6 충족 개수 |  |  |  |  |  |  |
| API 패턴 (OASIS / Phase 7 / 잠정 OASIS) |  |  |  |  |  |  |
| §4.1 표 행 수 (T1-A) |  |  |  |  |  |  |
| 절 순서 (## 헤더 시퀀스) |  |  |  |  |  |  |
| **R11-A**: 사전 판정표 5종 작성 (자연제외 / S 정렬 / G·GE 분기 / B·GB 분류 / P 후보) |  |  |  |  |  |  |
| **R11-B**: 화면 표시명 — G-NNN 행별 한글/영어/괄호 일관성 (01 A.4.10 폴백 5단계) |  |  |  |  |  |  |
| **R11-B**: 화면 표시명 — S-NNN 행별 (Label.Text 1byte 일치) |  |  |  |  |  |  |
| **R11-C**: 자연제외 표 — 우선순위 L1~L5 + 컨트롤명 분산 0 |  |  |  |  |  |  |
| **R11-D**: GE vs G2 명명 (확장 그리드 1 개 시 GE 강제) |  |  |  |  |  |  |
| **R11-E**: T1-E 산식 결과 (workType 값별 + 플래그 컬럼별 + DateType 통합) |  |  |  |  |  |  |
| **R11-F**: P-NNN 호출 순서 (OnLoad → OnSearch → OnSave → ... + line number) |  |  |  |  |  |  |
| **R11-G**: §1 화면 목적 (1 문장 / 100 자 이내) |  |  |  |  |  |  |
| **R11-H**: G-NNN 카운트 (#prod 정의 vs 최종 SELECT alias 동기화 — 최종 우선) |  |  |  |  |  |  |
| **R11-I**: T1-F 적용 컨트롤 목록 (다중 핸들러 = 무조건 분리) |  |  |  |  |  |  |
| **R11-J**: B-NNN 분류 (그리드셀 → GB / Lookup 트리거 → S 흡수 / 표준 toolbar → B 포함) |  |  |  |  |  |  |
| **R11-K**: LV-NNN 범위 (본 화면 직접만 / 의존 SP 제외) |  |  |  |  |  |  |

**판정 규칙**

- screenId / serviceId / API 패턴 / C1~C6 충족 개수 / §4.1 행 수 / 절 순서는 **모든 차수 값이 완전 동일**해야 한다.
- S / G / GE / B / GB / P / ST / LV 는 **수량과 순서가 모두 동일**해야 한다.
- 하나라도 불일치하면 §D 결과는 ✗ 이다.
- 불일치 항목은 다음 보강 규칙을 다시 작성한다:
  - screenId 불일치 → R10-1 (01 A.3 강제) / S 불일치 → R10-2 + R-11 정렬 (00 §6.4.1 R-11 강화)
  - G·GE 불일치 → R10-3 + R-11 #prod 동기화 (00 §6.4.2) + GE/G2 우선 (01 A.4.8)
  - B·GB 불일치 → R10-4 + R-11 Lookup 트리거 분류 (00 §6.4.4) + T1-F 트리거 조건
  - P 불일치 → R10-5 + R-11 호출 순서 (00 §6.4.5) + 사전 판정표
  - ST 불일치 → R10-6 + R-11 T1-E 산식 (00 §6.4.6-1)
  - LV 불일치 → R10-7 + R-11 본 화면 vs 의존 SP 범위 (00 §6.4.6-2)
  - 자연제외 불일치 → R-11 5 단계 우선순위 (00 §6.4.8-1)
  - 화면 표시명 불일치 → R-11 폴백 5 단계 (01 A.4.10)
- 재작성 후에도 불일치하면 해당 항목은 확정하지 않고 `[확인필요: Q-NNN]` 으로 등록한다 (R10-8).

**(MUST)** N차 회귀 매트릭스 모든 행 ✓ 일 때만 본 §D 통과. 1행이라도 ✗ → 설계 미완성 + R10/R-11 판정표 재작성.

### D.4 R-14 Auto Manifest 검증 매트릭스 (R-14 신설 — 12 행)

> **(MUST)** Agent 는 manifest 9 파일을 생성하지 않는다. 외부 deterministic Auto Manifest Runner 가 생성한 결과를 인용만 한다 (00 §0.2.0 9 원칙). 본 표 12 행 모두 ✓ 일 때만 R-14 통과.

| # | 검증 행 | 1차 값 | 2차 값 | 3차 값 | 4차 값 | 측정 방법 (PowerShell) | 결과 (✓/✗) |
|---:|---|---|---|---|---|---|---|
| 1 | manifest.lock.json 경로 (= `docs/{moduleId}/manifest/{targetKey}/manifest.lock.json`) |  |  |  |  | `Test-Path $manifestPath` |  |
| 2 | manifest.lock hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $manifestPath).Hash` |  |
| 3 | index hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $indexPath).Hash` |  |
| 4 | discover.trace hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $discoverPath).Hash` |  |
| 5 | classify.trace hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $classifyPath).Hash` |  |
| 6 | fallback.trace hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $fallbackPath).Hash` |  |
| 7 | q-stable-key hash (SHA-256) |  |  |  |  | `(Get-FileHash -Algorithm SHA256 $qStablePath).Hash` |  |
| 8 | verify-report 결과 (`pass` 필드) |  |  |  |  | `(Get-Content $verifyPath \| ConvertFrom-Json).pass` |  |
| 9 | 동일 입력 재실행 byte diff 결과 (`byteDiff` 모든 항 == 0) |  |  |  |  | `(Get-Content $verifyPath \| ConvertFrom-Json).byteDiff` |  |
| 10 | enum 외 값 사용 여부 (01 A.8 스키마 외 필드 / enum 외 값 발견 0) |  |  |  |  | `Test-AutoManifestSchema -Dir $manifestDir` |  |
| 11 | trace 누락 여부 (manifest 필수 파일 7 종 모두 존재) |  |  |  |  | `@('manifest.lock.json','index.json','discover.trace.json','classify.trace.json','fallback.trace.json','q-stable-key.json','verify-report.json') \| ForEach-Object { Test-Path (Join-Path $manifestDir $_) }` |  |
| 12 | conflict 미해결 여부 (conflict-report.json 미존재 또는 `resolution` 채워짐) |  |  |  |  | `-not (Test-Path $conflictPath) -or (Get-Content $conflictPath \| ConvertFrom-Json).resolution -ne $null` |  |

**판정 규칙**:

- **1차 단독**: 행 1 / 2~7 / 8 / 10 / 11 / 12 모두 ✓ 강제. 행 9 (byte diff) 는 N차 회귀 시만 측정.
- **N ≥ 2 회귀**: 행 2~7 모두 동일 hash + 행 9 byte diff 모든 항 == 0 강제. 1byte 라도 다르면 R-14 통과 ✗ (00 §0.2.0 원칙 9).
- 1 행이라도 ✗ → §D 결과 ✗ + 산출물 임의 수정 ✗ + 실패 보고만 (00 §0.2.0 원칙 8).

**(MUST)** R-14 통과 = 본 D.4 12 행 모두 ✓ + D.1~D.3 모두 ✓ + 분석리포트 §-1 R14-Step0 ✓.

---

## §E. 가이드 중복 제거 검증

<!-- 검증 대상: 단일 정본 원칙 (한 규칙 = 한 정본). 정본 위치 외 다른 가이드/산출물 본문에 동일 규칙 본문 잔존 0. 참조 1 줄은 허용. -->

| 영역 | 정본 위치 | 다른 가이드 본문 잔존 (✓ 잔존 0 / ✗ 발견) | grep 키워드 (예시) |
|---|---|---|---|
| 명명 규칙 본문 (camelCase / kebab-case / SNAKE_CASE / flat) | 01 A.4 |  | 명명 규칙 표 본문 |
| moduleId / moduleGroup 카탈로그 | 01 A.1 / A.2 |  | 모듈 카탈로그 표 본문 |
| 화면 ↔ As-Is 매핑 | 01 A.3 |  | 화면 매핑 표 본문 |
| API URL / OASIS / Phase 7 규칙 | 04 §A.2-3 |  | `POST /api/{moduleId}/oasis` |
| C1~C6 API 패턴 자동 판정 기준 | 04 §A.2-3-2 |  | C1~C6 판정 기준 표 본문 |
| 사용자 결정 카탈로그 | 02 §A.1-2-1 |  | 사용자 묻지 말고 채택 / 묻어야 |
| Q-NNN 확인필요 형식 (7 컬럼) | 분석리포트.template.md §13 |  | Q-NNN 7 컬럼 표 본문 |
| 산출물 양식 (분석 / 기능 / 디자인 / BPMN / 정합) | templates/*.template.md |  | 산출물 §1~§N 표 본문 |
| As-Is 추출 알고리즘 (S/G/B/P/statusCodes/API/비활성) | 00 §6.4.1 ~ §6.4.8 |  | 알고리즘 8 표 본문 |

**§E 결과**: 모든 행 ✓ (정본 위치 외 본문 잔존 0). 1 행이라도 ✗ → 단일 정본 원칙 위배 → 설계 미완성.

### E.2 가이드 ↔ templates Drift 검증 (R-12 신설)

<!--
  R-12 옵션 C 채택 후: 가이드 본문 (학습 정본) + templates 표 위 주석 (작업 정본) 이중 정본.
  Drift 위험 = 한쪽만 갱신되어 양쪽 본문 불일치. 정합체크서가 동기성 검증.
-->

| 검증 항목 | 가이드 위치 | templates 위치 | drift 검증 (Y/N 동기) |
|---|---|---|---|
| **E-R12-A**: §6.4.0 페이지 유형 A~E | 00 §6.4.0 | 분석.template §4.1 표 위 주석 |  |
| **E-R12-B**: §6.4.1 S-NNN 10 단계 | 00 §6.4.1 | 분석.template §4.2 표 위 주석 |  |
| **E-R12-C**: §6.4.2 G-NNN + #prod 동기화 | 00 §6.4.2 | 분석.template §4.3 표 위 주석 |  |
| **E-R12-D**: §6.4.3-1 D/L/GE 분기 | 00 §6.4.3-1 | 분석.template §0.3 + §4.3 / §4.4 |  |
| **E-R12-E**: §6.4.4 B-NNN 11 단계 + T1-F | 00 §6.4.4 | 분석.template §4.5 표 위 주석 |  |
| **E-R12-F**: §6.4.4-2 GB-NNN | 00 §6.4.4-2 | 분석.template §4.5-1 |  |
| **E-R12-G**: §6.4.5 P-NNN + 사전 판정표 | 00 §6.4.5 | 분석.template §0.5 + §4.6 |  |
| **E-R12-H**: §6.4.6 statusCodes + T1-E 산식 | 00 §6.4.6 + §6.4.6-1 | 분석.template §9.1 표 위 주석 |  |
| **E-R12-I**: §6.4.6-2 LV 5 단계 | 00 §6.4.6-2 | 분석.template §9.2 표 위 주석 |  |
| **E-R12-J**: §6.4.7 + §6.4.7-1 API 라우팅 | 00 §6.4.7 | 분석.template §11 표 위 주석 |  |
| **E-R12-K**: §6.4.8-1 자연제외 L1~L5 | 00 §6.4.8-1 | 분석.template §0.1 + §11.3 |  |
| **E-R12-L**: A.4.10 폴백 5 단계 | 01 A.4.10 | 분석.template / 기능.template / 디자인.template / BPMN.template 셀 헤더 명시 |  |
| **E-R12-M**: 예시 행 마커 동기성 | (templates 만) | `<!-- 예시 -->` Count == `<!-- 본 화면 -->` Count |  |
| **E-R12-N**: Q-NNN 사전 슬롯 7 잔존 | (templates 만) | 분석.template §13 Q-001~Q-007 잔존 |  |
| **E-R12-O**: §6.4-R13 30 Step 본문 (R-13) | 00 §6.4-R13.1~30 | plan §4.2 30 Step 본문 1byte 일치 + 분석.template §-1 인용 |  |
| **E-R12-P**: SOP grep 명령 enum (R-13) | 01 A.7 (C-1~C-7) | 가이드 §6.4-R13.{N} 명령 컬럼의 모든 명령 = `C-{1~7}: <regex>` 형식 |  |
| **E-R12-Q**: SOP Step 5 항목 양식 (R-13) | 00 §6.4-R13 본문 | 분석.template §-1 컬럼 (Step/Phase/제목/명령/측정값/종료조건/결과/Q-NNN) 동일 |  |
| **E-R12-R**: Phase 합 종료 조건 (R-13) | 00 §6.4-R13.31 | P1~P4 Phase 합 검증 표 동기 |  |
| **E-R12-S**: SOP 회귀 검증 R11-G6 (R-13) | 00 §6.4-R11 R11-G6 | "Step 결과 기록 강제" 단락 잔존 |  |
| **E-R12-T**: 정합체크서 §J 함수 (R-13) | 정합.template §J.1 | PowerShell `Verify-Step` / `Verify-AllSteps` / `Compare-SOPSteps` 함수 본문 |  |
| **E-R14-A**: §0.2 Auto Manifest 본처리 (R-14) | 00 §0.2.0~§0.2.7 | 9 원칙 + 필수 문장 + 위치 (`docs/{moduleId}/manifest/{targetKey}/`) + 9 파일 + 금지사항 6 |  |
| **E-R14-B**: manifest 9 파일 JSON 스키마 (R-14) | 01 A.8.1~A.8.9 | manifest.lock / index / discover / classify / fallback / q-stable-key / conflict-report / verify-report / error.log 필드 enum |  |
| **E-R14-C**: 분석.template §-1 R14-Step0 (R-14) | 분석.template §-1 R14-Step0 | manifest 9 파일 hash 인용 표 + 결과 ✓/✗ + §0~§16 인용 규칙 |  |
| **E-R14-D**: 정합.template §D.4 R-14 검증 매트릭스 (R-14) | 정합.template §D.4 | 12 행 (manifest.lock 경로 / 7 hash / verify pass / byte diff / enum 외 / trace 누락 / conflict) |  |
| **E-R14-E**: §6.4-R13.0-R14 Auto Manifest 인용 강제 (R-14) | 00 §6.4-R13.0-R14 | Step 1~5 = discover.trace 인용 / Step 6~12 = classify.trace / 폴백 = fallback.trace / Q-NNN = q-stable-key |  |
| **E-R14-F**: §6.4-R13.0 SOP 적용 원칙 6번 (R-14) | 00 §6.4-R13.0 원칙 6 | "분석 1번째 행동은 R14-Step0" + "Runner 자동 실행 / 사용자 입력 대기 ✗" 강제 단락 잔존 |  |
| **E-R14-Auto-1**: §5 생성 순서 Step 0 (R14-Auto) | 00 §5 | Step 0 = Auto Manifest Runner 자동 호출 + Step 1~16 진입 조건 단락 잔존 |  |
| **E-R14-Auto-2**: §0.2.9 자동 호출 5 단계 (R14-Auto) | 00 §0.2.9.1~§0.2.9.5 | Step 0-A 인자 결정 / 0-B 호출 명령 / 0-C ExitCode 분기 5 enum / 0-D hash 인용 / 0-E 본격 진입 |  |
| **E-R14-Auto-3**: §0.2.10 manifest 캐시 정책 (R14-Auto) | 00 §0.2.10.1~§0.2.10.4 | 캐시 평가 4 enum + As-Is mtime 비교 + 강제 재실행 + conflict 잔존 처리 |  |
| **E-R14-Auto-4**: §0.2.11 SourceRoot 자동 탐색 (R14-Auto-6) | 00 §0.2.11 | source-roots.config.json 정본 위치 + 탐색 우선순위 enum + 후보 단일성 검증 |  |
| **E-R14-Auto-5**: source-roots.config.json (R14-Auto-6) | docs/guide/runners/source-roots.config.json | 후보 source-root 디렉토리 enum + As-Is 코드 패턴 |  |

**§E.2 결과**: 모든 행 동기 ✓ — 1 행이라도 ✗ → 가이드 본문 또는 templates 주석 갱신 PR 진행.

---

## §F. 삭제 참조 검증

<!-- 검증 대상: 폐기된 개념 (정본 / 차수 / 잠금 / supersede / locks frontmatter) 의 키워드 잔존. 본 §F 양식 본문 자체는 검증 대상 외 (자기 검증 자기모순 회피). -->

> **검증 grep 예외 (MUST)**: 삭제 키워드 grep 검증 시 다음 위치는 **검증 대상 제외** — `templates/정합체크서.template.md` 의 §F 본문 / 정합체크서 산출물의 §F 본문 / Part C 샘플. 검증 범위는 **가이드 5종 (00~04) 본문 + 4 종 설계서 산출물 본문 (§F 제외)** 에 한정.

| 검증 항목 | 잔존 (✓ 잔존 0 / ✗ 발견) | 검증 범위 |
|---|---|---|
| 삭제된 §22 (정본 분석리포트 선정 절차) 인용 |  | 가이드 5종 + 설계서 4종 본문 (§F 제외) |
| 삭제된 §23 (Decision Lock frontmatter) 인용 |  | 동일 |
| `locks:` (frontmatter) 인용 |  | 동일 |
| `supersede` / `superseded` 인용 |  | 동일 |
| `정본 차수` / `sourceIteration` 인용 |  | 동일 |
| `lockedAt` / `guideVersion` 인용 |  | 동일 |
| `status: locked` / `status: draft` 인용 |  | 동일 |

**§F 결과**: 모든 행 잔존 0 ✓. 1 행이라도 ✗ → 폐기 개념 잔존 → 설계 미완성.

---
