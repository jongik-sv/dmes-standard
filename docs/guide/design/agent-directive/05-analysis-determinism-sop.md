# Agent 화면 설계서 생성 지시서 V2

> 상위 문서: [Agent 화면 설계서 생성 지시서 V2](../00_Agent지시_가이드.md)

#### 6.4-R11 Design Determinism Guard (반복 결정성 통합 가드)

> **(MUST)** 본 절은 §6.4 / §6.4-R10 / §6.4.0~§6.4.8 의 **모든 결정 알고리즘** 을 N차 회귀 시 **셀 단위까지 동일** 하게 만드는 통합 가드. R-9 보강 (양식·구조) + R-10 보강 (카운트 분류) + R-11 보강 (셀 단위 명세) 의 **상위 검증 규칙**.

##### R11-G1. 사전 판정표 강제 (분석 시작 전 작성)

분석리포트 §4 를 작성하기 전에 다음 5 판정표를 **순서대로 사전 작성** 해야 한다 (작성 후 §4.1~§4.6 의 카운트 인용). 판정표 미작성 시 정합체크서 §D.3 ✗.

| 순서 | 사전 판정표 | 출력 |
|---:|---|---|
| 1 | **자연 제외 5 단계 판정표** (L1~L5) | §6.4.8-2 자연 제외 기록 표 |
| 2 | **S-NNN 좌표 정렬 표** (Y / X / 알파벳 / 선언순) | §4.2 정렬 근거 |
| 3 | **G-NNN / GE-NNN 분기 분류표** (sList / sList2 / sHoldInfo / sJobInfo / sDasSearch → G/GE/D/L/제외) | §4.3·§4.4 분류 근거 |
| 4 | **B-NNN / GB-NNN 분류표** (Lookup 트리거 / 일반 버튼 / 그리드셀 / 자연제외) | §4.5·§4.5-1 분류 근거 |
| 5 | **P-NNN 후보 판정표** (직접 호출 / Q-NNN / 외부만 / 주석) | §4.6 분류 근거 |

##### R11-G2. 폴백 우선순위 7 영역

각 추출 알고리즘의 폴백 / 우선순위를 **enum 으로 고정**:

| 영역 | 1순위 | 2순위 | 3순위 | 4순위 | 5순위 |
|---|---|---|---|---|---|
| **screenId** | 부속서 A.3 등재값 | 사용자 입력 (A.3 우선) | A.3 미등재 + Q-NNN | (없음) | (없음) |
| **S-NNN 정렬** | Y 좌표 (Location) | X 좌표 (Y 동일 시) | 컨트롤명 알파벳 | 선언 줄번호 | (없음) |
| **G/GE-NNN 분기** | parent FK + 다중 → L | PK 단일 → D | 다중 row → GE | (sList) → G | (없음) |
| **B-NNN 분류** | 그리드셀 → GB | Lookup 트리거 (grpsearch + Dialog 호출만) → S 흡수 | 표준 toolbar → B | 추가 ToolStrip → B | 일반 Button → B |
| **P-NNN 정렬** | 핸들러 호출 순 (OnLoad → OnSearch → OnSave → ...) | 동일 핸들러 내 라인번호 | 외부 호출만 → 마지막 | (없음) | (없음) |
| **ST-NNN 카운트** | enum 값별 1행 (workType 등) | 컬럼별 1행 (플래그) | sList where 분기 enum 통합 1행 | 검색조건/LoV → 제외 | (없음) |
| **화면 표시명 출처** | designer.cs Label.Text | designer.cs GroupBox.Text | designer.cs GridColumn.HeaderText | cs SetGridHeader / aRow["{한글}"] | 그리드 옆 Label.Text + Q-NNN |

##### R11-G3. N차 회귀 결정성 검증

동일 As-Is 자료를 **N=4회 이상** 새 세션에서 분석한 결과의 다음 항목이 모두 동일해야 한다 (정합체크서 §D.3 N차 매트릭스):

| 검증 카테고리 | 항목 | 일치 기준 |
|---|---|---|
| **카운트** | S/G/GE/D/L/B/GB/P/ST/LV-NNN 각 수 | 분산 = 0 |
| **순서** | 동일 ID 의 일련번호 부여 결과 | 분산 = 0 |
| **명명** | 화면 표시명 / To-Be 컬럼 / 입력 유형 / 표시 형식 | 셀 본문 1byte 일치 |
| **분류** | 동일 컨트롤이 동일 카테고리 (S/B/GB/P/제외) | 분산 = 0 |
| **자연 제외** | 우선순위 (L1~L5) + 컨트롤명 + 사유 | 분산 = 0 |
| **인용** | 출처 표기 (`designer.cs:line` / `.cs:line`) | 표기 형식 일치 |
| **자유 서술** | §1 화면 목적 (1 문장 / 100 자 이내 강제) | 의미 동일 (구문 차이 허용) |

##### R11-G4. 실패 시 재작성 절차

회귀 검증 1 항목이라도 ✗ → Claude 는 **설계 완료 선언 금지**. 다음 절차:

1. ✗ 항목의 R10-x / R11-x 판정표 재작성 (사전 판정표 부터 다시)
2. 재작성 후에도 불일치 → 해당 항목 **확정 금지** + `[확인필요: Q-NNN]` 등재
3. 정합체크서 §D.3 매트릭스 갱신

##### R11-G5. 가이드 인용 강제

분석리포트 §4 / §9 / §11 의 모든 표 위에 다음 형식 주석 의무:

```
<!-- 추출 알고리즘: 00 §6.4.X / 분류표: R10-Y / 폴백: R11-G2 / 사전 판정표: R11-G1.N -->
```

주석 누락 → 정합체크서 §A 구조 동일성 ✗.

##### R11-G6. SOP 30 Step 결과 기록 강제 (R-13 통합)

> **(MUST)** 분석가는 §6.4-R13 의 30 Step 을 순서대로 실행하며 각 Step 종료 조건 ✓/△/✗ 를 분석리포트 §-1 SOP 결과 기록표에 즉시 기록한다. 지연 기록 ✗ + Step 결과 자체 변경 ✗.

| 규칙 | 적용 |
|---|---|
| 즉시 기록 | Step N 완료 시점에 §-1 의 Step N 행 측정값 / 결과 기록 — 다음 Step 진입 전 |
| 결과 enum | ✓ (종료조건 충족) / △ (사례 외 발견 + Q-NNN) / ✗ (종료조건 미충족 + 재실행 필요) |
| 누락 기록 | §-1 Step N 행 빈 셀 → 정합 §J.2 ✗ + R-13 미달 |
| Step 본문 변경 | 가이드 §6.4-R13.{N} 본문 (입력/명령/출력/종료조건/사례외) 1byte 변경 ✗ → 정합 §E.2 R12-O~T drift ✗ |

검증: 정합체크서 §J.2 (30 Step 결과) + §J.3 (N차 회귀 SOP 일치율) + §J.4 (분석 결과 자체 일치율).

#### 6.4-R13 분석 SOP 30 Step (Standard Operating Procedure — R-13 신설)

> **(MUST)** 본 §6.4-R13 = 분석가의 **분석 절차 정본**. Step 1~30 순서대로 실행하며 각 Step 의 5 항목 (입력 / 명령 / 출력 / 종료조건 / 사례외) 을 모두 따른다. Step 본문 외 자체 grep 명령 작성 ✗ + Step 순서 변경 ✗ + Step 건너뛰기 ✗.

##### 6.4-R13.0 SOP 적용 원칙

1. **(MUST)** Step N 종료조건 ✓ → Step N+1 진입
2. **(MUST)** Step N 사례 외 발견 → 즉시 [확인필요: Q-NNN] 등재 + Step N △ → Step N+1 진행 가능 (단, 종속 Step 영향 시 차단)
3. **(MUST)** 01 A.7 의 C-1 ~ C-7 명령 enum 외 자체 grep 작성 ✗
4. **(MUST)** Step 결과는 분석리포트 §-1 SOP 결과 기록표에 즉시 기록 (지연 ✗)
5. **(MUST NOT)** 본 절의 정규식 / 종료조건 / 사례 외 처리 enum 1byte 변경 ✗ (정합 §E.2 R12-O~T drift 검증 ✗)
6. **(MUST — R-14 / R14-Auto 통합)** 분석 시작 시점의 **1번째 행동은 §5 Step 0 = Auto Manifest Runner 자동 호출**. Agent 는 §0.2.9 의 5 단계 절차 (Step 0-A 인자 결정 → 0-B Runner 실행 → 0-C ExitCode 분기 → 0-D hash 인용 → 0-E 본격 분석 진입) 와 §0.2.10 의 캐시 정책 4 enum 을 1byte 강제 적용한다. **manifest 가 미존재이거나 verify-report.pass != true 이면 Agent 는 분석을 시작하지 않고 Runner 를 자동 실행한다** — 사용자 입력 대기 ✗ (캐시 평가 자동) / Agent 자체 manifest 작성 ✗ (00 §0.2.0 원칙 1·5). R14-Step0 ✓ (manifest 9 파일 hash 모두 ✓ + conflict-report 미존재 + verify-report.pass=true) 일 때만 Step 1~30 진입.

##### 6.4-R13.0-R14 R-14 통합 — Auto Manifest 인용 강제 (R-14 신설)

> **(MUST — R-14 신설)** Agent 가 Step 1~30 을 실행할 때 **외부 deterministic Auto Manifest Runner 가 생성한 9 파일 (00 §0.2.1) 이 정본**. Agent 자체 grep / 분류 / 폴백 / Q-NNN ID 결정 ✗ (00 §0.2.0 원칙 5).

| Step 범위 | manifest 정본 파일 | 인용 방식 |
|---|---|---|
| **Step 1~5** (P1 자료 수집) | `discover.trace.json` (01 A.8.3) | 각 Step 의 명령 결과 = `discover.trace.json` 의 `steps[stepNo=N]` 인용 (matchCount / result / qNNN). Agent 자체 grep ✗ |
| **Step 6~12** (P2 사전 판정) | `classify.trace.json` (01 A.8.4) | 각 Step 의 분류 결과 = `classify.trace.json` 의 `items[]` 인용 (id / controlName / sourceFile:sourceLine / classification enum) |
| **표시명 폴백 5단계** (S-NNN / G-NNN) | `fallback.trace.json` (01 A.8.5) | `fallbacks[targetId=ID]` 의 `level (1~5) / source (Label.Text·GroupBox.Text·Tag·cs.dynamic·AsIs.alias·DDL.extprop) / value / applied` 인용 |
| **Q-NNN ID 결정** (사전 7 + append-only) | `q-stable-key.json` (01 A.8.6) | `slots[qId]` (Q-001~Q-007) 또는 `appended[qId]` (Q-008+) 인용 + `stableKey = SHA-256(원천+조건+조치)` 동일 시 동일 qId 재사용 강제 |

**(MUST)** Step 1~30 실행 결과는 분석리포트 §-1 R14-Step0 의 9 파일 hash 가 모두 ✓ 인 경우에만 유효. R14-Step0 ✗ → Step 1~30 결과 모두 무효 + 산출물 생성 ✗.

**(MUST)** Step 1~12 본문 (§6.4-R13.1 ~ §6.4-R13.12) 의 "입력 / 명령 / 검증" 항은 R-13 정본으로 유지하되, **R-14 적용 화면에서는 Auto Manifest 9 파일 인용으로 대체** — Agent 가 Step 본문의 grep 명령을 직접 실행 ✗. Runner 가 동일한 grep 명령을 deterministic 환경에서 실행하여 trace JSON 으로 박는다 (Agent 가 Runner 실행 결과를 해석·수정·보완·재분류 ✗ — 00 §0.2.0 필수 문장).

**(MUST — R14-Classify-v2 / R14-v3.0 / 검증 4)** **Step 13~18 (§4.2~§4.6) 및 §5.1 / §5.2 / §7 / §8 / §13 / §14 작성 시 원본 자료 grep 절대 금지**. 입력은 *오직* manifest `classify.trace.json` items[] / `q-stable-key.json` / `discover.trace.json` / `verify-report.json` 의 인용. Agent 가 designer.cs / cs / sp.sql / entity 본문을 다시 읽어 분석.template 셀 작성 ✗. 위반 시 정합 §D.4 행 10 (`enum 외 값 사용 여부`) ✗ + 정합 §A.2 manifest 행 수 ↔ 산출물 행 수 비교 ✗.

| 분석.template 절 | 입력 정본 (manifest 위치) | 금지 행동 |
|---|---|---|
| §0.1 (L1~L5) | `classify.trace.json` items[classification IN ('L1','L2','L3','L4','L5')] | designer.cs / cs / sp.sql 직접 grep ✗ |
| §0.2 (S 좌표) | `classify.trace.json` items[stepNo=10, classification='S'] | designer.cs Location 직접 grep ✗ |
| §0.3 (G/GE/D/L 분기) | `classify.trace.json` items[stepNo=21] | sp.sql @Case 직접 grep ✗ |
| §0.4 (B/GB) | `classify.trace.json` items[stepNo=12] | designer.cs Button 직접 grep ✗ |
| §0.5 (P 후보) | `classify.trace.json` items[stepNo=9] | cs OpenForm 직접 grep ✗ |
| **§4.2 S-NNN** | §0.2 인용 강제 | 원본 grep ✗ |
| **§4.3 G/GE-NNN** | `classify.trace.json` items[stepNo=14, classification='SELECT_ALIAS'] | sp.sql SELECT 직접 grep ✗ |
| §4.4 D/L-NNN | §0.3 인용 강제 | 원본 grep ✗ |
| §4.5 B-NNN | §0.4 인용 강제 | 원본 grep ✗ |
| §4.5-1 GB-NNN | §0.4 인용 강제 | 원본 grep ✗ |
| §4.6 P-NNN | §0.5 인용 강제 | 원본 grep ✗ |
| **§5.1 이벤트 12종** | `classify.trace.json` items[stepNo=20, classification='EVENT12'] | cs `+= EventHandler` 직접 grep ✗ |
| **§5.2 SP 분기 매트릭스** | `classify.trace.json` items[stepNo=21] | sp.sql 직접 grep ✗ |
| **§7 To-Be Entity** | `classify.trace.json` items[classification='ENTITY_COL'] | entity.ts `@Column` 직접 grep ✗ |
| **§8 매핑** | `discover.trace.json` (mapping 자료 인용 — 미존재 시 Q-NNN) | 자체 매핑 추론 ✗ |
| **§9.1 ST-NNN** | (R14-v3 보강 후보 — workType 자동 분류) | 자체 분류 ✗ |
| **§9.2 LV-NNN** | `classify.trace.json` items[stepNo=9, callKind='NewCodeQuery'] (LV 마스터 코드 추출) | cs NewCodeQuery 직접 grep ✗ |
| **§13 Q-NNN** | `q-stable-key.json` slots[] + appended[] 인용 | 자체 Q-NNN 발급 ✗ (stableKey 동일 시 동일 qId 재사용) |
| **§14 커버리지** | `classify.trace.json` coverage 객체 인용 | 자체 합 산출 ✗ |

> **R-14 미적용 화면 (Auto Manifest Runner 미실행)** 의 경우: 가이드 §0.2 에 따라 Runner 실행 후 Step 1~30 진행. Runner 미실행 상태에서 Agent 가 Step 1~5 의 grep 명령 자체 실행 ✗.

##### 6.4-R13.1 Step 1 — DDL extended property 수집

| 항목 | 값 |
|---|---|
| Phase | P1 자료 수집 |
| 입력 | `docs/external/ksmerpk/db/{table}.sql` (본 화면 SP 가 SELECT 하는 모든 테이블) |
| 명령 | C-1: `Select-String "EXEC sp_addextendedproperty.*'MS_Description'" docs/external/ksmerpk/db/{table}.sql -AllMatches` |
| 출력 | 분석리포트 §2 자료 인벤토리 행 1 (확인 여부 Y/N + 활용 결과) + (Y 시) 표시명 폴백 5-a 출처 |
| 종료 조건 | 본 화면 SP 의 `FROM` / `JOIN` 으로 등장하는 모든 테이블에 대해 ext.prop. 존재 여부 결정. `(SP grep FROM 결과 테이블 수) == (§2 자료 인벤토리 #1 검사 테이블 수)` |
| 사례 외 처리 | `sp_addextendedproperty` 외 형식 (예: `sys.sp_addextendedproperty`) → 즉시 [확인필요: Q-004] + Step △ |
| 검증 | `Verify-Step -StepNo 1 -ExpectedCount $tableCount -ActualCount $extPropCount` |

##### 6.4-R13.2 Step 2 — resx PropBag 수집

| 항목 | 값 |
|---|---|
| Phase | P1 자료 수집 |
| 입력 | `docs/external/ksmerpk/resx/{form}.ko.resx` |
| 명령 | C-1: `Select-String '<data name="(\w+)\.Text".*?<value>([^<]+)' docs/external/ksmerpk/resx/{form}.ko.resx -AllMatches` |
| 출력 | 분석리포트 §2 행 2 + (Y 시) S-NNN 화면 표시명 폴백 4 출처 |
| 종료 조건 | resx 파일 존재 시 `<data>` 노드 모두 grep 완료 / 미존재 시 Y/N = N 명시 |
| 사례 외 처리 | resx 외 다국어 자료 (예: i18n json) → Q-004 변형 + Step △ |
| 검증 | `Verify-Step -StepNo 2` (resx 미존재 = Pass / 존재 시 grep 행수 ≥ 1) |

##### 6.4-R13.3 Step 3 — 운영 화면 캡처 확인

| 항목 | 값 |
|---|---|
| Phase | P1 자료 수집 |
| 입력 | `docs/캡처/{화면}.png` |
| 명령 | C-1: `Test-Path "docs/캡처/{화면}.png"` |
| 출력 | 분석리포트 §2 행 3 + 디자인설계서 §10 캡처 경로 |
| 종료 조건 | 캡처 존재 (Y/N) 결정 |
| 사례 외 처리 | 미존재 → Q-NNN 미등재 (영향 낮음) + 디자인 §10 = "해당 없음" |
| 검증 | (Test-Path 결과 그대로 §2 행 3 에 기록) |

##### 6.4-R13.4 Step 4 — 매핑 문서 수집

| 항목 | 값 |
|---|---|
| Phase | P1 자료 수집 |
| 입력 | `docs/매핑/{화면}.xlsx` |
| 명령 | C-1: `Test-Path "docs/매핑/{화면}.xlsx"` |
| 출력 | 분석리포트 §2 행 4 + (Y 시) §8 As-Is ↔ To-Be 매핑 표 출처 |
| 종료 조건 | 매핑 문서 존재 (Y/N) 결정 |
| 사례 외 처리 | 미존재 → §8 매핑 행 작성 시 Q-NNN + Step △ |
| 검증 | (Test-Path 결과 기록) |

##### 6.4-R13.5 Step 5 — Entity 구조 수집

| 항목 | 값 |
|---|---|
| Phase | P1 자료 수집 |
| 입력 | `backend-v2/entity/{table}.entity.ts` (To-Be 테이블 매핑 후보) |
| 명령 | C-1: `Select-String '@Column\(' backend-v2/entity/{table}.entity.ts -AllMatches` |
| 출력 | 분석리포트 §2 행 5 + §7 To-Be 테이블/Entity 표 |
| 종료 조건 | Entity 파일 존재 시 `@Column` 컬럼 수 == §7 행 수 |
| 사례 외 처리 | 미존재 → Q-003 + §7 = "[확인필요: Q-003]" |
| 검증 | `Verify-Step -StepNo 5 -ExpectedCount $columnCount -ActualCount $section7RowCount` |

##### 6.4-R13.6 Step 6 — designer.cs Visible=false 컨트롤 (L1 자연 제외)

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `{화면}.designer.cs` 전체 |
| 명령 | C-1: `Select-String 'this\.\w+\.Visible\s*=\s*false' {화면}.designer.cs -AllMatches` |
| 출력 | 분석리포트 §0.1 자연 제외표 L1 행 (컨트롤명 + 라인번호) |
| 종료 조건 | grep 결과 라인 수 == §0.1 L1 행 수 |
| 사례 외 처리 | `this.X.Visible = System.Convert.ToBoolean(false)` 같은 변형 → Q-NNN + Step △ |
| 검증 | `Verify-Step -StepNo 6 -ExpectedCount $grepLines -ActualCount $sec0_1_L1Rows` |

##### 6.4-R13.7 Step 7 — 주석 처리 컨트롤 (L2 자연 제외)

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `{화면}.designer.cs`, `{화면}.cs`, `procedures/{SP}.sql` |
| 명령 | C-1: `Select-String '^\s*//.*\.(Visible\|Click\|Add)\s*' {화면}.cs -AllMatches` + `Select-String '^\s*--.*' procedures/{SP}.sql -AllMatches` |
| 출력 | §0.1 L2 행 |
| 종료 조건 | (cs `//` 라인 + sql `--` 라인) 수 == §0.1 L2 행 수 |
| 사례 외 처리 | 블록 주석 `/* */` → C-6 으로 추가 grep + Q-NNN 변형 |
| 검증 | `Verify-Step -StepNo 7` |

##### 6.4-R13.8 Step 8 — 호출 미발견 컨트롤 (L3 자연 제외)

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `{화면}.designer.cs`, `{화면}.cs` |
| 명령 | C-7: `Select-String '\w+_Click\s*\+=' {화면}.cs -AllMatches` 후 등록된 핸들러명 추출 → designer.cs 의 메서드 시그니처 (`btnX_Click`) cross check |
| 출력 | §0.1 L3 행 + §13 Q-007 등재 |
| 종료 조건 | (cs 메서드 존재 ∩ `+=` 미발견) 컨트롤 모두 등재 |
| 사례 외 처리 | 비표준 등록 (`AddHandler`, `Subscribe`, 람다 등) → Q-NNN |
| 검증 | `Verify-Step -StepNo 8` (메서드명 ↔ 등록 cross) |

##### 6.4-R13.9 Step 9 — 외부 화면만 호출 (L4 자연 제외)

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | 다른 폼 cs / SP 파일 (본 화면 cs 제외) |
| 명령 | C-5: `Get-ChildItem **/*.cs -Recurse -Exclude {화면}.cs \| Select-String 'OpenForm\("{본화면id}"\)\|new {본화면form}\(' -AllMatches` |
| 출력 | §0.1 L4 행 |
| 종료 조건 | 외부 호출 검색 결과 모두 등재 |
| 사례 외 처리 | 호출 미발견 ✓ + Q-NNN ✗ (자연 제외 정상) / SP 에서 호출 발견 → 별도 행 |
| 검증 | (외부 호출 수 기록) |

##### 6.4-R13.10 Step 10 — S-NNN 좌표 정렬 (Y / X / 알파벳 / 선언순)

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `{화면}.designer.cs` 의 grpsearch 컨테이너 내부 컨트롤 |
| 명령 | C-7: `Select-String 'this\.(\w+)\.Location\s*=\s*new System\.Drawing\.Point\((\d+),\s*(\d+)\)' {화면}.designer.cs -AllMatches` 후 그룹 [1]=컨트롤명 / [2]=X / [3]=Y 추출 |
| 출력 | §0.2 좌표 정렬표 (Y → X → 알파벳 → 선언줄 4 단계 정렬) |
| 종료 조건 | grpsearch 내부 컨트롤 모두 등재 + Y/X 정렬 적용 |
| 사례 외 처리 | Lookup 묶음 (txt+btn+txtNm) → 좌표 = txt{X}Cd 의 Location 사용 (R10-2) |
| 검증 | `Verify-Step -StepNo 10` (정렬 결과 deterministic) |

##### 6.4-R13.11 Step 11 — G / GE / D / L 분기 분류

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `procedures/{SP}.sql` |
| 명령 | C-7: `Select-String '@Case\s*=\s*''(\w+)''' procedures/{SP}.sql -AllMatches` 후 각 분기에서 `Select-String 'WHERE.*=\s*@\w+\|ORDER BY\|TOP\s+1' {분기범위}` |
| 출력 | §0.3 분기 분류표 (G / GE / D / L / 제외) |
| 종료 조건 | 모든 @Case 분기 분류 완료 (R-11 폴백 5단계 적용) |
| 사례 외 처리 | parent FK ↔ 다중row 양립 시 → R-11 폴백 우선순위 / 미분류 → Q-NNN |
| 검증 | `Verify-Step -StepNo 11` (분기 수 == 분류 행 수) |

##### 6.4-R13.12 Step 12 — B / GB / S 흡수 분류

| 항목 | 값 |
|---|---|
| Phase | P2 사전 판정 |
| 입력 | `{화면}.designer.cs`, `{화면}.cs` |
| 명령 | C-1: `Select-String 'btn\w+\|ToolStripButton\|ButtonField' {화면}.designer.cs -AllMatches` 후 위치 (grpsearch / toolbar / 본체 / 그리드셀) 분류 |
| 출력 | §0.4 분류표 (S 흡수 / B / GB / 제외) |
| 종료 조건 | 모든 button 컨트롤 4 enum 분류 완료 |
| 사례 외 처리 | 1 컨트롤 N 핸들러 (T1-F) → 분해 후 별도 행 |
| 검증 | `Verify-Step -StepNo 12` (전수 분류) |

##### 6.4-R13.13 Step 13 — §4.2 S-NNN 본 표 작성 (사전 판정 §0.2 인용)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | 분석리포트 §0.2 좌표 정렬표 |
| 명령 | (자체 grep ✗ — §0.2 결과 그대로 인용) |
| 출력 | §4.2 S-NNN 표 N 행 |
| 종료 조건 | `§0.2 행 수 == §4.2 행 수` |
| 사례 외 처리 | (사례 외 ✗ — Step 10 에서 Q-NNN 처리됨) |
| 검증 | `Verify-Step -StepNo 13` |

##### 6.4-R13.14 Step 14 — §4.3 G / GE-NNN 본 표 작성 (§0.3 인용)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | §0.3 분기 분류표 (G / GE 만) + Step 1 DDL ext.prop. (표시명 폴백 5-a) |
| 명령 | (자체 grep ✗ — §0.3 인용 + 표시명 폴백 5단계 적용) |
| 출력 | §4.3 메인 그리드 + 확장 그리드 표 |
| 종료 조건 | `§0.3 G+GE 행 수 == §4.3 행 수` |
| 사례 외 처리 | 폴백 5-c~e 적용 시 → 출처 컬럼 명시 + Q-005 |
| 검증 | `Verify-Step -StepNo 14` |

##### 6.4-R13.15 Step 15 — §4.4 D / L-NNN 본 표 작성 (§0.3 인용)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | §0.3 분기 분류표 (D / L 만) |
| 명령 | (자체 grep ✗) |
| 출력 | §4.4 표 N 행 |
| 종료 조건 | `§0.3 D+L 행 수 == §4.4 행 수` |
| 사례 외 처리 | (사례 외 ✗) |
| 검증 | `Verify-Step -StepNo 15` |

##### 6.4-R13.16 Step 16 — §4.5 B-NNN 본 표 작성 (§0.4 B 인용)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | §0.4 분류표 (B 만) |
| 명령 | (자체 grep ✗) |
| 출력 | §4.5 표 N 행 + To-Be action 7 enum (search/save/delete/changeStatus/popup/link/export) |
| 종료 조건 | `§0.4 B 행 수 == §4.5 행 수` + 모든 행의 action ⊆ 7 enum |
| 사례 외 처리 | action 7 enum 미매칭 시 → Q-NNN (예: reset 폴백) |
| 검증 | `Verify-Step -StepNo 16` |

##### 6.4-R13.17 Step 17 — §4.5-1 GB-NNN 본 표 작성 (§0.4 GB 인용)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | §0.4 분류표 (GB 만) |
| 명령 | (자체 grep ✗) |
| 출력 | §4.5-1 표 N 행 |
| 종료 조건 | `§0.4 GB 행 수 == §4.5-1 행 수` |
| 사례 외 처리 | (사례 외 ✗) |
| 검증 | `Verify-Step -StepNo 17` |

##### 6.4-R13.18 Step 18 — §4.6 P-NNN 본 표 작성 (§0.5 직접 호출만)

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | §0.5 P-NNN 후보 판정표 (직접 호출 분류만) |
| 명령 | (자체 grep ✗) |
| 출력 | §4.6 표 N 행 |
| 종료 조건 | `§0.5 직접 호출 행 수 == §4.6 행 수` |
| 사례 외 처리 | 외부 호출만 → §11.3 인용, Q-NNN 분류는 §13 / 본 표 ✗ |
| 검증 | `Verify-Step -StepNo 18` |

##### 6.4-R13.19 Step 19 — D1~D3 외부 호출 깊이 추적

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | `{화면}.cs` 메서드 → `procedures/{SP}.sql` → 의존 SP / 함수 |
| 명령 | C-1: `Select-String 'EXEC\s+(\w+)\|dbo\.fn\w+' procedures/{SP}.sql -AllMatches` (D2→D3) |
| 출력 | §5 외부 호출 깊이 매트릭스 (D1~D5 컬럼) |
| 종료 조건 | D3 까지 추적 완료 (D4+ 발견 시 §11.3 자연제외 등재) |
| 사례 외 처리 | D4 외부 SP 발견 시 → Q-NNN + §11.3 L4 / D5 외부 화면 → §11.3 L4 |
| 검증 | `Verify-Step -StepNo 19` (D3 추적 완료 강제) |

##### 6.4-R13.20 Step 20 — 이벤트 12종 매트릭스

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | `{화면}.cs` |
| 명령 | C-1: `Select-String '\+= new (Click\|DoubleClick\|CellClick\|CellDoubleClick\|SelectionChanged\|ValueChanged\|KeyDown\|Validating\|Leave\|Enter\|TextChanged\|MouseDown)EventHandler' {화면}.cs -AllMatches` |
| 출력 | §5.1 이벤트 12종 매트릭스 (12 행 × 발견/미발견/미사용 컬럼) |
| 종료 조건 | 12 이벤트 모두 grep 완료 (0 도 명시) |
| 사례 외 처리 | 기타 이벤트 (Resize / Paint / FormClosing 등) → 별도 13 행 추가 ✗ + 비고 |
| 검증 | `Verify-Step -StepNo 20` (정확히 12 행) |

##### 6.4-R13.21 Step 21 — SP 분기 매트릭스

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | Step 11 결과 |
| 명령 | (Step 11 결과 재사용) |
| 출력 | §5.2 SP 분기 매트릭스 N 행 |
| 종료 조건 | `§0.3 행 수 == §5.2 행 수` |
| 사례 외 처리 | (Step 11 에서 처리됨) |
| 검증 | `Verify-Step -StepNo 21` |

##### 6.4-R13.22 Step 22 — §6 / §7 / §8 / §9.1 / §9.2 / §10 / §11 본 표 작성

| 항목 | 값 |
|---|---|
| Phase | P3 본 표 작성 |
| 입력 | (각 절 알고리즘 인용) — Step 5 (§7), Step 4 (§8), Step 11 SELECT (§9.1 ST-NNN 산식), 자료 인벤토리 (§9.2 LV-NNN), 사전 판정 (§10·§11) |
| 명령 | 절별 알고리즘 적용 — §9.1 산식: ST = workType enum 값별 + 표시 영향 플래그 컬럼별 + 진행/승인/마감/취소 enum 값별 + sList where 분기 enum 컬럼 1행 통합 |
| 출력 | §6 / §7 / §8 / §9.1 ST-NNN / §9.2 LV-NNN / §10 / §11 |
| 종료 조건 | 각 §0 사전 판정 결과 == 본 표 행 수 (절별) |
| 사례 외 처리 | 각 절별 사례 외 처리 enum (절 본문 명시) |
| 검증 | `Verify-Step -StepNo 22` (절별 분리) |

##### 6.4-R13.23 Step 23 — §11.1 C1~C6 자동 판정

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | Step 19 D1~D3 결과 + Step 22 §11 결과 + §0 사전 판정표 |
| 명령 | (각 C 별 측정 enum):<br>C1 = SP @Case 분기 ≥ 4 ∧ 조회/트랜잭션 분리<br>C2 = LoV master 호출 컬럼 ≥ 5<br>C3 = 회사·공장 종속 LoV ≥ 1<br>C4 = 동적 컬럼 응답 팝업/그리드 ≥ 1<br>C5 = 독립 query 분리 적합 (SP 분기 ≥ 2 ∧ LoV ≥ 5 ∧ C3=Y)<br>C6 = 외부 SP 호출로 단일 actionGateway 부적합 |
| 출력 | §11.1 표 6 행 |
| 종료 조건 | C1~C6 모두 Y/N 결정 |
| 사례 외 처리 | 측정 불가 → Q-NNN |
| 검증 | `Verify-Step -StepNo 23` |

##### 6.4-R13.24 Step 24 — §11.2 채택 결과 (T3-D 라우팅)

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | §11.1 충족 수 |
| 명령 | (자동 enum 매칭): 0~1 → OASIS / 2~3 → 잠정 OASIS + Q-NNN / ≥4 → Phase 7 분리 |
| 출력 | §11.2 표 4 행 |
| 종료 조건 | 채택 enum 1 값 결정 |
| 사례 외 처리 | (사례 외 ✗) |
| 검증 | `Verify-Step -StepNo 24` |

##### 6.4-R13.25 Step 25 — §11.3 자연제외 (§0.1 인용)

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | §0.1 자연 제외표 |
| 명령 | (전수 인용) |
| 출력 | §11.3 자연 제외표 |
| 종료 조건 | `§0.1 행 수 == §11.3 행 수` |
| 사례 외 처리 | (사례 외 ✗) |
| 검증 | `Verify-Step -StepNo 25` |

##### 6.4-R13.26 Step 26 — §13 Q-NNN 정리 (사전 슬롯 + append-only)

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | Step 1~25 의 [확인필요: Q-NNN] 라인 |
| 명령 | C-7: `Select-String '\[확인필요: Q-(\d{3})\]' 분석리포트.md -AllMatches` 후 그룹 [1] 추출 + 사전 슬롯 7 (Q-001~Q-007) 우선 + Q-008+ append-only |
| 출력 | §13 등재 표 |
| 종료 조건 | `본문 [확인필요] 갯수 == §13 등재 행 수` + Q-001~Q-007 사전 슬롯 매칭 |
| 사례 외 처리 | Q-008+ 등재 패턴 (`{원천}이 {조건}일 때 {조치}`) 미준수 → 재작성 |
| 검증 | `Verify-Step -StepNo 26` |

##### 6.4-R13.27 Step 27 — §14 커버리지 매트릭스

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | §4.1~§4.6 / §9 발견 수 + §13 Q-NNN 수 + §11.3 제외 수 |
| 명령 | (수치 합산 자동) — 발견 = 반영 + Q + 제외 |
| 출력 | §14 표 10 행 |
| 종료 조건 | 발견 = 반영 + Q + 제외 (전 행) |
| 사례 외 처리 | 합 불일치 → Step 22 재실행 |
| 검증 | `Verify-Step -StepNo 27` |

##### 6.4-R13.28 Step 28 — §15 분석완료 게이트 G1~G9

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | §2 / §4.1 / §5 / §6~§8 / §10 / §11 / §14 / §0 / 자유도 |
| 명령 | (각 게이트 자동 측정):<br>G1 자료 인벤토리 / G2 화면 요소 전수성 / G3 소스 로직 (D1~D3 + 12 이벤트 + SP 분기) / G4 DB 매핑성 / G5 업무 규칙 / G6 API 패턴 / G7 커버리지 / G8 사전 판정표 5 작성 / G9 자유도 0 |
| 출력 | §15 표 9 행 |
| 종료 조건 | G1~G9 모두 ○ |
| 사례 외 처리 | × 1개 → Step 처음부터 재실행 |
| 검증 | `Verify-Step -StepNo 28` |

##### 6.4-R13.29 Step 29 — §-1 SOP 결과 기록

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | Step 1~28 종료조건 ✓/✗ |
| 명령 | (Step 별 자동 기록) |
| 출력 | 분석리포트 §-1 SOP 결과표 30 행 |
| 종료 조건 | 30 Step 모두 ✓ |
| 사례 외 처리 | × 1개 → 게이트 G10 ✗ + 해당 Step 재실행 |
| 검증 | `Verify-AllSteps -ReportPath 분석리포트.md` |

##### 6.4-R13.30 Step 30 — §16 인용 검증

| 항목 | 값 |
|---|---|
| Phase | P4 게이트 검증 |
| 입력 | §16 인용 매트릭스 |
| 명령 | (전수 점검) — §16 의 인용 위치가 본 §X.Y 와 일치 |
| 출력 | (없음 — 이미 templates 박힘) |
| 종료 조건 | §16 인용 위치 모두 본 §X.Y 와 일치 |
| 사례 외 처리 | 인용 누락 → 재작성 |
| 검증 | `Verify-Step -StepNo 30` |

##### 6.4-R13.31 Phase 합 종료 조건 (Step 1~30 종료 후 검증)

| Phase | Step 범위 | 합 종료조건 |
|---|---|---|
| P1 | 1~5 | §2 5 행 모두 채워짐 + Q-NNN 등재 (필요 시) |
| P2 | 6~12 | §0.1~§0.5 5 표 모두 채워짐 |
| P3 | 13~22 | §4 / §5 / §6 / §7 / §8 / §9 / §10 / §11 본 표 모두 채워짐 |
| P4 | 23~30 | §13 / §14 / §15 / §-1 모두 채워짐 + §11.3 = §0.1 일치 + 30 Step 모두 ✓ |

##### 6.4-R13.32 SOP 회귀 검증 (R11-G6 통합)

> **(MUST)** N차 회귀에서 분석리포트 §-1 SOP 기록표의 30 Step 결과가 모두 동일해야 한다. 1 Step 이라도 다른 결과 → R-13 ✗ + 정합체크서 §J ✗.
