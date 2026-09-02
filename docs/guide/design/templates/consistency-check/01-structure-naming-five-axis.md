## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

<!-- 검증 대상: 본 설계서 4 종의 절 순서·표 헤더·"해당 없음" 유지 여부가 templates/*.template.md 와 동일한지 -->

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 (✓/✗) | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 템플릿과 동일 |  |  |  |  |  |  |
| 표 헤더 (컬럼명·수·순서) — 템플릿과 동일 |  |  |  |  |  |  |
| "해당 없음" 유지 (적용 대상 없는 절 / 행 삭제 0) |  |  |  |  |  |  |
| 임의 ## 헤더 추가 (템플릿 외) |  |  |  |  |  |  |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) |  |  |  |  |  |  |
| **A-T1A**: 분석리포트 §4.1 행 수 == 10 (T1-A) |  | (해당 없음) | (해당 없음) | (해당 없음) |  |  |
| **A-R12-1**: 사전 판정표 5 종 작성 (분석 §0.1~§0.5) |  | (해당 없음) | (해당 없음) | (해당 없음) |  |  |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 (`<!-- 예시 -->` Count == `<!-- 본 화면 -->` Count) |  |  |  |  |  |  |
| **A-R12-3**: 외부 호출 D1~D3 추적 (분석 §5 깊이 컬럼 D1/D2/D3 모두 등재) |  | (해당 없음) | (해당 없음) | (해당 없음) |  |  |
| **A-R12-4**: 이벤트 12종 매트릭스 작성 (분석 §5.1 12 행 모두 채워짐) |  | (해당 없음) | (해당 없음) | (해당 없음) |  |  |
| **A-R12-5**: SP 분기 매트릭스 (분석 §5.2 본 SP 모든 @Case 전수) |  | (해당 없음) | (해당 없음) | (해당 없음) |  |  |
| **A-R12-6**: 자유 서술 0 (§1 패턴 enum / §5 표 분해 / §6.2 표 분해 / §12 사유 5 enum / §13 Q 내용 패턴) |  |  |  |  |  |  |

### A.2 누락 검증 (분석리포트 §14 매트릭스 합 일치 + 코드 구현 정합)

<!-- 검증 대상: 분석리포트 §14 의 "발견 수 = 반영 수 + 확인필요 수 + 제외 수" 합 일치 + 코드 구현 수 일치 (§K 와 일관성). -->
<!-- "코드 구현 수" 열: 개발 완료 시점에 실제 코드 (BE Entity + FE GRID_COLS / Search / Buttons 등) 의 항목 수. 차이 발생 시 Q-NNN 등재 또는 §6-A 위반. -->

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | **코드 구현 수** | 확인필요 수 | 제외 수 | 합 일치 (✓/✗) |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 |  |  |  |  |  |  |  |  |
| 그리드 컬럼 |  |  |  |  |  |  |  |  |
| 상세 필드 |  |  |  |  |  |  |  |  |
| 버튼 |  |  |  |  |  |  |  |  |
| 팝업/탭/연동 |  |  |  |  |  |  |  |  |
| 상태값 |  |  |  |  |  |  |  |  |
| 코드값/LoV |  |  |  |  |  |  |  |  |
| 검증 규칙 |  |  |  |  |  |  |  |  |
| 프로시저/함수/트리거 |  |  |  |  |  |  |  |  |
| To-Be 컬럼 |  |  |  |  |  |  |  |  |

### A.3 manifest 행 수 ↔ 산출물 행 수 검증 (R14-v3.0 신설)

> **(MUST)** Runner 의 `classify.trace.json` items[] 카운트 = 분석.template / 4 설계서의 표 행 수. 1 행이라도 차이 시 `enum 외 값 사용` 또는 `자체 grep 발생` 으로 판정 → §A ✗.

| 분석 원천 | manifest items 카운트 (정본) | 분석.template 행 수 | 일치 (✓/✗) | 근거 |
|---|---:|---:|---|---|
| L1 (자연제외) | `items[classification='L1'].Count` |  |  | classify.trace.json |
| S-NNN (좌표) | `items[classification='S'].Count` |  |  | §0.2 / §4.2 |
| G-NNN (SELECT alias) | `items[classification='SELECT_ALIAS' AND branch='sList'].Count` |  |  | §0.3 / §4.3 |
| GE-NNN | `items[classification='SELECT_ALIAS' AND branch~='sList2|sList3'].Count` |  |  | §0.3 / §4.3 |
| D-NNN / L-NNN | `items[stepNo=21, classification IN ('D','L')].Count` |  |  | §0.3 / §4.4 |
| B-NNN | `items[classification='B'].Count` |  |  | §0.4 / §4.5 |
| GB-NNN | `items[classification='GB'].Count` |  |  | §0.4 / §4.5-1 |
| P-NNN | `items[classification='L4'].Count` |  |  | §0.5 / §4.6 |
| 이벤트 12종 | `items[classification='EVENT12'].Count` (= 12 강제) |  |  | §5.1 |
| SP 분기 | `items[classification='SP_BRANCH'].Count` |  |  | §5.2 |
| Entity 컬럼 | `items[classification='ENTITY_COL'].Count` |  |  | §7 |
| Q-NNN | `q-stable-key.json` slots[].Count + appended[].Count |  |  | §13 |

**§A.3 결과**: 모든 행 일치 ✓ 일 때만 §A.3 통과. 1 행 차이 → Runner 결과 vs 산출물 비결정성 — Agent 가 manifest 외부 자료 grep 한 의심 → §A ✗.

**§A 결과**: A.1 모든 행 ✓ + A.2 모든 행 합 일치 ✓ + A.3 모든 행 일치 ✓ 일 때만 §A ✓.

---

## §B. 명명 규칙 검증

<!--
  검증 대상: 부속서 A (식별자 사전) 의 카탈로그 등재 + 명명 컨벤션 적합성. 미등재 식별자 임의 확정 금지 (MUST NOT) → §G 에 [확인필요] 등재.

  명명 룰 (MES 단일 규칙 + APS 예외 — 사용자 결정 사항):

  **B.1 MES 모듈 (mls / mqc / mpp / mpn 외 등 표준 MES 화면) — camelCase 단일 룰 강제**:
    - screenId  = pageId = serviceId = pageName  =  `{화면명}` camelCase (예: `plateSlittingMgmt`)
    - **4개 식별자 모두 단일 camelCase 동일값** (kebab-case ✗ / dash ✗ / underscore ✗)
    - Frontend 파일명 = `{screenId}.tsx` (예: `plateSlittingMgmt.tsx`)
    - pageId 가 portal 이중배지 형식 (`portal:{moduleGroup}/{pageName}`) 으로 표기되는 경우에도 `{pageName}` 자리에는 camelCase 그대로 넣는다 (kebab 변환 ✗).
    - tsup entry key 도 동일 camelCase: `pages/{moduleGroup}/{pageName}` (`-page` 접미사 ✗ — APS 예외 전용 표기)

  **B.2 APS 모듈 (mpn — 사용자 결정 예외) — kebab + `-page.tsx`**:
    - pageName = kebab-case (예: `order-registration`)
    - Frontend 파일명 = `{pageName}-page.tsx`
    - tsup entry key = `pages/{moduleGroup}/{pageName}-page` (`-page` 접미사 유지)
    - 본 예외는 **mpn 모듈에 한정** — 신규 MES 모듈 추가 시 본 예외 확장 ✗ → 사용자 명시 결정 필요.

  본 §B 검증은 행별 "적용 룰" 컬럼으로 MES 룰 / APS 예외 분리 추적.
-->

### B.1 모듈 룰 결정 (선행 단계 — 본 §B 의 모든 행 평가 전 결정)

| 항목 | 값 | 결과 (✓/✗) |
|---|---|---|
| moduleId |  |  |
| 적용 명명 룰 (`MES 단일 룰` / `APS 예외 (mpn)`) |  |  |

> moduleId == `mpn` 일 때만 "APS 예외 (mpn)" 선택. 그 외 모듈은 모두 "MES 단일 룰" 선택. 다른 모듈에 APS 예외 적용 시 본 §B ✗.

### B.2 식별자별 검증 (행별 적용 룰 명시)

| 항목 | 값 | 적용 룰 (MES / APS-mpn) | 부속서 A 근거 | 검증 결과 (✓/✗) |
|---|---|---|---|---|
| moduleId |  | (전체 공통) | 01 A.1 모듈 카탈로그 등재 |  |
| moduleGroup |  | (전체 공통) | 01 A.2 moduleGroup 카탈로그 등재 |  |
| 화면식별자 (screenId) |  | MES: camelCase `{화면명}` / APS-mpn: camelCase | 01 A.3 화면 매핑 등재 + A.4.1 camelCase 단수 영문 |  |
| pageName |  | **MES: camelCase = screenId** (kebab ✗) / **APS-mpn: kebab-case** | 01 A.4.2 (모듈별 분기) |  |
| pageId |  | MES: camelCase = screenId / APS-mpn: `portal:{moduleGroup}/{pageName}` | 01 A.4.3 |  |
| serviceId |  | MES: = screenId (단일 camelCase) / APS-mpn: = screenId | 01 A.4.4 |  |
| mesModule |  | (전체 공통) `m-{moduleId}` | 01 A.4.5 |  |
| Frontend 파일명 |  | **MES: `{screenId}.tsx`** / **APS-mpn: `{pageName}-page.tsx`** | 03 컨벤션 |  |
| tsup entry key |  | **MES: `pages/{moduleGroup}/{pageName}`** (`-page` 접미사 ✗) / **APS-mpn: `pages/{moduleGroup}/{pageName}-page`** | 01 A.4.6 (모듈별 분기) |  |
| 팝업 ID 체계 |  | (전체 공통) | 01 A.4.7 (flat MUST, P-001~) |  |
| 필드/컬럼/버튼 ID |  | (전체 공통) | 01 A.4.8 (S/G/GE/D/L/B/GB/P/V/XV/ST/LV-NNN) |  |
| DB 컬럼 / API JSON |  | (전체 공통) | 01 A.4.9 (SNAKE_CASE / camelCase) |  |
| **B-T2A**: 화면 표시명 == As-Is `Label.Text` / `GridColumn.HeaderText` / `Button.Text` 1byte 일치 (T2-A) |  | (전체 공통) | 01 A.4.10 |  |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 (축약 ✗) (T2-B) |  | (전체 공통) | 01 A.4.11 |  |
| **B-T3A**: 영역 ID ⊆ 5값 enum (`A-FILTER` / `A-GRID` / `A-GRID-EXT` / `A-DETAIL` / `A-BTN`) (T3-A) |  | (전체 공통) | 01 A.4.8 |  |
| **B-T3B**: 입력 유형 ⊆ 5값 enum (`TextBox` / `ComboBox` / `CheckBox` / `DatePicker` / `Lookup`) (T3-B) |  | (전체 공통) | 01 A.4.12 |  |
| **B-T3C**: 표시 형식 = 자료형(길이/자릿수) 강제 (`varchar(20)` ○ / `varchar` ✗) (T3-C) |  | (전체 공통) | 01 A.4.13 |  |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) |  | MES 만 적용 (APS-mpn 시 N/A) | 사용자 결정 (MES 단일 룰) |  |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case + 파일명 = `{pageName}-page.tsx` |  | APS-mpn 만 적용 (MES 시 N/A) | 사용자 결정 (APS 예외) |  |

**§B 결과**: 모든 행 ✓ — 1 행이라도 ✗ → 설계 미완성. 미등재 항목은 §G 에 Q-NNN 등재 후 부속서 A 등재 PR 진행.

> **위반 패턴 (즉시 ✗)**: MES 모듈에서 pageName 을 kebab-case 로 표기 / MES 모듈에서 Frontend 파일명에 `-page.tsx` 접미사 사용 / APS 외 모듈 (mls, mqc, mpp 등) 에 APS 예외 적용.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

<!-- 검증 대상: 분석리포트 §4.2 (조회조건) / §4.3 (그리드) / §4.5 (버튼) / §4.6 (팝업) 의 모든 행을 5축 산출물에서 행 단위로 인용. 자체 추가 금지. -->

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 (✓/✗) |
|---|---|---|---|---|---|---|
| 화면식별자 |  |  |  |  |  |  |
| moduleId |  |  |  |  |  |  |
| moduleGroup |  |  |  |  |  |  |
| pageName |  |  |  |  |  |  |
| pageId |  |  |  |  |  |  |
| serviceId |  |  |  |  |  |  |
| 필드ID (S-NNN 전수) | §4.2 |  |  |  |  |  |
| 컬럼ID (G-NNN 전수) | §4.3 |  |  |  |  |  |
| 컬럼ID (GE-NNN 확장) | §4.3 |  |  |  |  |  |
| 버튼ID (B-NNN 전수) | §4.5 |  |  |  |  |  |
| 팝업ID (P-NNN 전수) | §4.6 |  |  |  |  |  |
| DB 컬럼명 (SNAKE_CASE) |  |  |  |  |  |  |
| 상태코드 (statusCodes) | §9.1 |  |  |  |  |  |
| action 목록 |  |  |  |  |  |  |

**§C 결과**: 모든 행 ✓ — 설계서가 분석리포트에 **없는 행** 을 추가하면 ✗ (자체 작성 금지 — 00 §16).

---
