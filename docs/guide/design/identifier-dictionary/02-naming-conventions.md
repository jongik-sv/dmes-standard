# 부속서 A. 식별자 사전

> 상위 문서: [부속서 A. 식별자 사전](../01_Agent부속_가이드.md)

## A.4 명명 컨벤션 (Naming Conventions)

식별자 종류별 표기 규칙 정본. 본 컨벤션 위배 시 정합체크서 §14.B ✗.

### A.4.1 화면식별자 (`screenId`)

> **(MUST — 사용자 결정 사항 정본)** MES 룰 = **`{화면명}` 단일 토큰** camelCase (모듈명·그룹명 prefix 없음). APS 예외 (`mpn`) 도 단일 토큰. (§A.3.1 정본)

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` — 정본)

- **단일 토큰 camelCase `{화면명}`** — 화면명 그 자체 (첫 글자 소문자, 모듈명/그룹명 결합 없음)
- 예: `plateSlittingMgmt`, `masterCodeMng`, `inspectionRequest`, `stockMove`
- 금지: 모듈명 prefix (`mlsPlateSlittingMgmt` ✗ — 사용자 결정으로 폐기), 그룹 토큰 삽입 (`cmaMasterCodeMng` / `mcmCmaMasterCodeMng` ✗), 숫자 prefix (`MPP_WRK010` 같은 코드명), 하이픈, 언더스코어, 복수형

#### APS 예외 (`mpn` — 별표)

- 단일 토큰 camelCase 또는 kebab-case (예: `demand` / `productionPlan` 또는 `demand` / `production-plan`)
- APS 기존 컨벤션 유지

#### legacy 호환

본 가이드 개정 이전 등재된 모듈/그룹 prefix 합성 (`mlsPlateSlittingMgmt` 등) 및 기 생성 산출물은 §A.3.2 및 각 산출물 위치에서 As-Is 1:1 보존 (개명 ✗). 신규 화면만 단일 토큰 룰 적용.

### A.4.2 pageName

> **(MUST)** MES 룰 = `screenId` 와 동일 camelCase 단일값. APS 예외 (`mpn`) 만 kebab-case 변환.

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` — 정본)

- **`screenId` 와 동일 camelCase 값** (변환 ✗)
- 예: `plateSlittingMgmt` → `plateSlittingMgmt` (동일값) / `masterCodeMng` → `masterCodeMng` (동일값)
- 금지: kebab-case 변환 (`mls-plate-slitting-mgmt` ✗) / 별도 토큰 (`plate-slitting-mgmt` ✗)

#### APS 예외 (`mpn` — 별표)

- 화면식별자의 **kebab-case** 변환
- 예: `demand` → `demand`, `productionPlan` → `production-plan`
- APS 기존 컨벤션 유지 (MES 룰 적용 ✗)

### A.4.3 pageId

> **(MUST)** MES 룰 = `screenId` 와 동일 camelCase 단일값. APS 예외 (`mpn`) 만 `portal:{moduleGroup}/{pageName}` path 구조 가능.

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` — 정본)

- **`screenId` 와 동일 camelCase 단일값** (= `pageName` = `serviceId` 와도 동일)
- 예: `plateSlittingMgmt` / `masterCodeMng` / `inspectionRequest`
- 금지: `portal:{moduleGroup}/{pageName}` path 구조 (`portal:operation/work-report` ✗) / kebab-case (`mls-plate-slitting-mgmt` ✗)

#### APS 예외 (`mpn` — 별표)

- 형식: `portal:{moduleGroup}/{pageName}` (APS 기존 컨벤션)
- 예: `portal:planning/demand`
- 금지: `portal:{moduleId}/...` (moduleGroup 자리에 moduleId 넣기 금지)

### A.4.4 serviceId

- **화면식별자와 동일** 값 사용 (§A.3.1 단일 토큰 형식 — 예: `plateSlittingMgmt` / `masterCodeMng`)
- **MES / APS 공통 적용**: `screenId` == `serviceId` 강제 (MES 는 `pageId` / `pageName` 모두 동일 단일값)
- Phase 7 / OASIS 패턴 모두 동일 명칭. 액션은 별도 (`{serviceId}.{action}`)
- 금지: 액션이 결합된 명칭 (`workReportSearch` 같은 합성 serviceId 금지)

### A.4.4.1 BPMN 기능 식별자 (`{screenId}_{기능명}`, D4)

> **(MUST)** BPMN 다이어그램의 task/serviceTask id 및 액션 식별자는 **`{screenId}_{기능명}`** 합성 형식으로 결정한다. `{screenId}` 는 §A.3.1 / §A.4.1 의 단일 토큰 화면식별자 (MES·APS 공통 단일 토큰).

| 토큰 | 표기 | 출처 |
|---|---|---|
| `{screenId}` | screenId 본체 (단일 토큰 `{화면명}`) | §A.3.1 형식 그대로 |
| `_` | 구분자 (언더스코어 1 글자) | 고정 |
| `{기능명}` | **camelCase 동사 또는 동사+명사** | 본 절 규칙 |

**기능명 표기 규칙**:

| 규칙 | 내용 | 예시 |
|---|---|---|
| 동사 단독 | 단순 액션 | `save` / `delete` / `search` / `cancel` / `confirm` / `print` |
| 동사 + 명사 | 한정 액션 | `searchByDate` / `saveAttach` / `deleteRepair` / `printReport` |
| camelCase | 동사 lowercase 시작 + 후속 토큰 PascalCase | `searchByDate` ○ / `SearchByDate` ✗ |
| 금지 | 명사 단독 (`history` ✗ — 동사 필수) / snake_case / kebab-case | `search_by_date` ✗ |

**합성 예시 (MES 룰)**:

| screenId | 기능명 | BPMN 기능 식별자 |
|---|---|---|
| `plateSlittingMgmt` | `save` | **`plateSlittingMgmt_save`** |
| `masterCodeMng` | `save` | **`masterCodeMng_save`** |
| `masterCodeMng` | `delete` | **`masterCodeMng_delete`** |
| `masterCodeMng` | `searchByDate` | **`masterCodeMng_searchByDate`** |
| `masterCategoryMng` | `saveCategory` | **`masterCategoryMng_saveCategory`** |
| `inspectionRequest` | `confirm` | **`inspectionRequest_confirm`** |

**합성 예시 (APS 예외 `mpn`)**:

| screenId | 기능명 | BPMN 기능 식별자 |
|---|---|---|
| `demand` | `search` | **`demand_search`** |
| `planningRun` | `execute` | **`planningRun_execute`** |

**(MUST NOT)**: screenId 없이 `save` / `delete` 단독 사용 ✗ (화면 토큰 누락). 기능명에 `_` 추가 결합 ✗ (`save_attach` ✗ — `saveAttach` ○). 모듈·그룹 토큰 삽입 ✗ (`mlsPlateSlittingMgmt_save` / `mcmCmaMasterCodeMng_save` ✗ — 사용자 결정으로 폐기).

**legacy 호환**: 기 등재·기 생성된 모듈/그룹 prefix 합성 기능 식별자는 §A.3.2 등재 행 및 기 산출물과 함께 As-Is 1:1 보존 (개명 ✗).

### A.4.4.2 식별자 유일성 (Uniqueness) — MUST

> **(MUST)** **한 모듈(moduleId) 안에 같은 이름의 화면(`screenId`)이 두 개 이상 존재할 수 없다.** `screenId` = `serviceId` = BPMN 파일명 단일 식별자 룰(§A.4.4)에 따라 화면명 중복은 곧 서비스 중복이다.

**유일성 스코프 (런타임 근거)**:

- OASIS 의 BPMN 로더(`ClassPathFileServiceLoader`)는 `{serviceId}.bpmn` 을 **파일명만으로** 매칭한다 (경로 무시 — `services/aaa/foo.bpmn` 과 `services/bbb/foo.bpmn` 은 폴더가 달라도 충돌).
- 동일 배포 단위 classpath (모듈 앱 + 의존 jar — mcm-core 등 공유 core 포함) 안에 같은 파일명의 BPMN 이 2개 이상이면, 해당 serviceId **호출 시점**에 `ServiceNotFoundException: Duplicate service files exist` 가 발생해 **양쪽 화면 모두 사용 불가**가 된다 (부팅 시 검증 없음 — 배포 후 특정 화면만 늦게 죽는 형태로 발견됨).
- 따라서 유일성 보장 범위는 모듈 내부를 넘어 **동일 배포 단위 classpath 전체**다. 폴더 분리로 회피할 수 없다.

**동일 Object 발견 시 중단·질문 (MUST)**:

**설계 당시** (본 사전 등재·산출물 폴더 생성 시) 또는 **개발 당시** (BPMN·Service·FE 페이지 파일 생성 시) 동일한 이름의 Object (`screenId` / `serviceId` / BPMN 파일명 / `pageId` / FE 파일명 / 시드 `OBJECT_ID`) 가 이미 존재함을 발견하면:

1. **설계·개발을 즉시 중단**한다.
2. 분석리포트 §13 (설계) 또는 작업 보고 (개발) 에 `[확인필요: Q-NNN]` 으로 충돌 사실을 등재한다.
3. **사용자에게 질문**하여 결정(기존 화면 재사용 / 신규 화면명 부여 / 기존 개명)을 받은 후에만 재개한다.

**(MUST NOT)**: 임의 변형 식별자로 우회 (`masterCodeMng2` / `masterCodeMngNew` / suffix 부착) ✗. 기존 Object 무단 덮어쓰기·삭제 ✗. 충돌을 숨기고 다른 폴더에 생성 ✗ (파일명 매칭이라 런타임 충돌 그대로 발생).

### A.4.5 mesModule

- `m-{moduleId}` 패턴
- 예: `mpp` → `m-mpp`

### A.4.6 tsup entry key / Frontend 파일명

> **(MUST)** MES 룰 / APS 예외 별도. 파일명 = `{screenId}.tsx` (MES) vs `{kebab-pageName}-page.tsx` (APS).

#### MES 룰 (`mls` / `mqc` / `mpp` / `mas` / `mcm` — 정본)

- Frontend 파일명: **`{screenId}.tsx`** (camelCase 단일값, suffix `-page` 없음)
- 예: `plateSlittingMgmt.tsx` / `masterCodeMng.tsx` / `inspectionRequest.tsx`
- tsup entry key: `pages/{screenId}` (예: `pages/plateSlittingMgmt`)
- 금지: kebab-case 파일명 (`mls-plate-slitting-mgmt.tsx` ✗) / `-page` suffix (`plateSlittingMgmt-page.tsx` ✗) / moduleGroup 디렉토리 분기 강제 ✗

#### APS 예외 (`mpn` — 별표)

- Frontend 파일명: **`{pageName}-page.tsx`** (kebab-case + `-page` suffix 유지)
- 예: `demand-page.tsx` / `capacity-page.tsx` / `planning-run-page.tsx`
- tsup entry key: `pages/{moduleGroup}/{pageName}-page` 패턴 (APS 기존 컨벤션)
- 예: `pages/planning/demand-page`

### A.4.7 팝업 ID 체계 (`popupIdScheme`)

- **`flat` MUST** — 평면 번호 `P-001 ~ P-NNN`
- 금지: `grouped` 체계 (`P-101 자원그룹 / P-201 보류그룹 / P-301 첨부그룹` 같은 prefix 분리). 그룹화 의도가 있으면 분석리포트 §4.6 의 비고 컬럼에 그룹명 표기로 처리

### A.4.8 필드 / 컬럼 / 버튼 / 검증 ID

- 필드 (조회조건): `S-NNN` (3자리 숫자, 0 패딩)
- 그리드 컬럼: `G-NNN` (메인) / `GE-NNN` (확장) — 메인/확장 분리 시
- 그리드 다중 시: `G1-NNN` / `G2-NNN`
- **GE-NNN vs G2-NNN 우선순위 (R-11, MUST)**: 확장 그리드 1 개 (sList2 등 단일 분기) 시 → **`GE-NNN` 사용 강제** / 메인 그리드 외 동등 위상의 그리드 2 개 이상 (예: 마스터 + 디테일 그리드 + 보조 그리드) 시에만 `G1-NNN` / `G2-NNN` / `G3-NNN` 사용. 차수별 GE/G2 혼용 금지.
- 상세 필드: `D-NNN` / 라인 필드: `L-NNN`
- 버튼: `B-NNN`
- **그리드셀 인라인 버튼**: `GB-NNN` (T1-D — ButtonField / OnGridButtonClicked / CellClick 핸들러. B-NNN 과 분리)
- 팝업: `P-NNN`
- 검증: `V-NNN` / 연관 검증: `XV-NNN`
- 상태값: `ST-NNN`
- 코드값/LoV: `LV-NNN`
- **영역 (T3-A — 5값 enum 고정 MUST)**: `A-FILTER` / `A-GRID` / `A-GRID-EXT` / `A-DETAIL` / `A-BTN` 5 값만 허용. `A-TOOLBAR` 폐기 (PageLayout.buttons 배열로 통합 처리, A-BTN 흡수). 기타 임의 영역명 금지.

### A.4.9 DB 컬럼명 / API JSON 키

- DB 컬럼: `SNAKE_CASE` (대문자 + 언더스코어)
- API JSON 키 (DTO): `camelCase` (소문자 시작)
- DB 컬럼 ↔ DTO 변환: 1:1 변환 (예: `WO_NO` ↔ `woNo`)

### A.4.10 화면 표시명 (Korean Label) — T2-A

> **(MUST)** 화면 표시명 셀 = As-Is `Label.Text` / `GroupBox.Text` / `GridColumn.HeaderText` / `Button.Text` 한글 문자열을 **1 byte 도 변경 없이 인용**. 동의어 치환 / 축약 / 번역 / 띄어쓰기 정정 금지 (`날짜구분 → 일자타입` ✗).

#### 출처 enum (식별자별 매핑) — R-11 폴백 5 단계

식별자 prefix 별로 **위에서 아래 폴백 우선순위 5 단계** 순서로 평가, 먼저 매칭되는 단계로 출처 결정.

##### S-NNN / D-NNN (조회조건 / 상세 필드)

| 우선순위 | 출처 |
|---:|---|
| 1 | `designer.cs` 의 인접 `Label.Text` (해당 컨트롤 좌측 / 동일 Y 좌표) |
| 2 | `designer.cs` 의 `GroupBox.Text` (컨트롤 포함 그룹) |
| 3 | `designer.cs` 의 `Tag` 속성 인용 (예: `Tag="required = 일자타입"` → `"일자타입"`) |
| 4 | cs 코드의 `lbl{X}.Text = "..."` / `SetLabel("...")` 동적 설정 |
| 5 | 모두 미존재 → As-Is 컨트롤명 + `[확인필요: Q-NNN]` (의미 추정 / 자체 명명 / 괄호 표기 금지) |

##### G-NNN / GE-NNN / G2-NNN / L-NNN (그리드 컬럼)

| 우선순위 | 출처 |
|---:|---|
| 1 | `designer.cs` 의 `GridColumn.HeaderText` (한글 명시) |
| 2 | `designer.cs` 의 `Column.Caption` (한글 명시) |
| 3 | cs 코드의 `SetGridHeader(...)` / `Column.HeaderText = "..."` 동적 설정 |
| 4 | cs 코드의 `aRow["{한글}"] = {alias}` 매핑 (한글 키 그대로 인용) |
| 5 | 그리드 옆 `Label.Text` (단일 그리드 + 1:1 매핑 가능 시) |
| **미존재 시** | **As-Is alias 그대로 표기** (예: `WORK_TYPE` / `idx` / `ST_RUNTIME`) + `[확인필요: Q-NNN]`. **의미 추정 / 자체 한글 도출 / 괄호 컨벤션 (`(WORK_TYPE)`) 금지**. |

##### B-NNN / GB-NNN (버튼 / 그리드셀 인라인 버튼)

| 우선순위 | 출처 |
|---:|---|
| 1 | `designer.cs` 의 `Button.Text` |
| 2 | `designer.cs` 의 `ToolbarButton.Text` / `ToolStripButton.Text` |
| 3 | `designer.cs` 의 `ButtonField.Caption` (그리드 셀) |
| 4 | cs 코드의 `btn.Text = "..."` 동적 설정 |
| 5 | 모두 미존재 → As-Is 컨트롤명 + `[확인필요: Q-NNN]` |

##### P-NNN (팝업)

| 우선순위 | 출처 |
|---:|---|
| 1 | 호출 코드의 다이얼로그 `Title` / `Caption` 인자 |
| 2 | 호출 클래스명에서 한글 명명 추출 (`PGA020K_HoldInfo` → "보류 정보") — **금지** |
| 3 | 호출 라인 주변 주석 (한글 의미) |
| 4 | 외부 다이얼로그 정의 파일의 `this.Text = "..."` |
| 5 | 모두 미존재 → As-Is 클래스명 + `[확인필요: Q-NNN]` |

**(MUST 공통)**: 폴백 5 단계 모두 미존재 → **반드시 As-Is 원본 (alias / 변수명 / 클래스명) 그대로 표기 + Q-NNN 등재**. 의미 추정 / 자체 한글 도출 / 괄호 표기 (`(WORK_TYPE)`) / 영어→한글 자동 번역 모두 금지.

**검증** (정합 §B `B-T2A`): designer.cs 의 모든 라벨/헤더/버튼 텍스트 토큰 → 분석리포트 표시명 컬럼에 1:1 등장. As-Is alias 표기는 출처 미존재 시에만 허용 + Q-NNN 동반 필수.

### A.4.11 To-Be 컬럼명 직역 규칙 — T2-B

> **(MUST)** As-Is 변수 어간 → camelCase **직역**. 축약 / 의미 재해석 금지.

| 규칙 | 내용 | 예시 |
|---|---|---|
| 1. 어간 직역 | As-Is 변수명 (`dtpReportFr`) → camelCase 직역 (`reportFromDt`). 축약 금지 (`reportFr` ✗) | `dtpReportFr` → `reportFromDt` ○ |
| 2. From / To | `Fr` / `To` 접미 → `From` / `To` 풀어쓰기 (Dt 강제) | `ReportFr` → `reportFromDt` |
| 3. Dt 접미 | DatePicker 컨트롤 → `*Dt` 접미 강제 | `dtpReportFr` → `reportFromDt` |
| 4. Cd / Nm 접미 | As-Is DB 컬럼이 `_CD` / `_NM` 일 때만 보존 | `ITEM_CD` ↔ `itemCd` ○ / DB 없는데 임의 `Cd` 추가 ✗ |
| 5. 약어 사전 | 신규 약어는 본 절 사전 행 추가 후만 사용 (사전 미등재 약어 ✗) | `Wo→workOrder` 금지 / `WoNo` 보존 (관례) |

#### 약어 사전 (확장 시 본 표에 행 추가)

| As-Is 약어 | To-Be camelCase | 비고 |
|---|---|---|
| WoNo | woNo | 제조오더번호 — DB `WO_NO` |
| SoNo | soNo | 수주번호 — DB `SO_NO` |
| JobCd | jobCd | 공정코드 — DB `JOB_CD` |
| ResCd | resCd | 자원코드 — DB `RES_CD` |
| ItemCd | itemCd | 품목코드 — DB `ITEM_CD` |

**검증** (정합 §B `B-T2B`): To-Be 컬럼 토큰 ↔ As-Is 변수 어간 정규식 매칭 (`/Fr$/→/FromDt$/`, `/To$/→/ToDt$/`).

### A.4.12 입력 유형 enum 5 값 — T3-B

> **(MUST)** 입력 유형 셀 = **`TextBox` / `ComboBox` / `CheckBox` / `DatePicker` / `Lookup` 5 값만**. 변형 표기 (`combo` / `Combobox` / `드롭다운` / `text+popup`) 모두 ✗.

#### As-Is 컨트롤 → enum 매핑 (강제)

| As-Is 컨트롤 | enum |
|---|---|
| `TextBox` / `ktxt*` (단독) | `TextBox` |
| `ComboBox` / `kcmb*` | `ComboBox` |
| `CheckBox` / `kchk*` | `CheckBox` |
| `DateTimePicker` / `kdtp*` / `dtp*` | `DatePicker` |
| `txt + btn + txtNm` 묶음 (T1-B Lookup 패턴) | `Lookup` |
| `txt + btn` (txtNm 없음) | `Lookup` |

**검증** (정합 §B `B-T3B`): 입력 유형 컬럼 정규식 `^(TextBox|ComboBox|CheckBox|DatePicker|Lookup)$` 100%.

### A.4.13 표시 형식 정밀도 — T3-C

> **(MUST)** 표시 형식 셀 = **자료형 + 길이/자릿수 명시 강제**. 자료형 단독 (`varchar` / `int` / `decimal`) 금지.

| 자료형 | 형식 강제 | 예시 |
|---|---|---|
| 문자열 | `varchar({길이})` 또는 `nvarchar({길이})` | `varchar(20)` ○ / `varchar` ✗ |
| 정수 | `int({자릿수})` | `int(10)` ○ / `int` ✗ |
| 실수 | `decimal({전체},{소수})` | `decimal(18,4)` ○ / `decimal` ✗ |
| 날짜 | `date(YYYY-MM-DD)` 또는 `datetime(YYYY-MM-DD HH:mm:ss)` | `date(YYYY-MM-DD)` ○ |
| Boolean | `bit(Y/N)` 또는 `bit(1/0)` | `bit(Y/N)` ○ |

**길이 미상**: `[확인필요: Q-NNN]` 등재. 임의 추정 금지.

**검증** (정합 §B `B-T3C`): 표시 형식 컬럼 정규식 `^[a-zA-Z]+\([0-9,A-Za-z\-/: ]+\)$|^\[확인필요` 100%.

---

## A.5 미등재 처리 (MUST NOT)

### A.5.1 임의 확정 금지

본 부속서에 등재되지 않은 식별자는 **임의로 확정하지 않는다** (MUST NOT). 다음 절차로만 진행:

1. 분석리포트 §1 / §13 에 `[확인필요: 사유]` 마커 등록
2. 본 부속서 등재 PR 별도 진행
3. 사용자 결정 후 본 부속서에 행 추가
4. 분석리포트의 [확인필요] → resolved 갱신

### A.5.2 정합체크서 §14.B 와의 연계

본 부속서 미등재 식별자가 설계서에 등장하면 정합체크서 §14.B 가 ✗ 로 차단한다. ✗ 1개 이상 시 설계 미완성 처리 (00 §14 도입부 차단 규칙).

### A.5.3 잠정 채택 금지

"임시로 mpp 의 operation 그룹으로 확정하고 본 부속서는 추후 등재" 같은 잠정 채택은 금지. 반드시 본 부속서 등재가 선행되어야 설계서 작성 진행 가능.

---

## A.6 본 부속서의 자기 검증

본 부속서는 다음 조건이 모두 충족되어야 자기 일관성을 가진다.

| 조건 | 설명 |
|---|---|
| C-A1 | A.2 의 모든 moduleGroup 행의 moduleId 가 A.1 에 등재됨 |
| C-A2 | A.3 의 모든 화면 행의 moduleId / moduleGroup 이 A.1 / A.2 에 등재됨 |
| C-A3 | A.4 의 컨벤션이 A.3 의 모든 화면 식별자에 적용 가능 |

자기 검증 실패 시 본 부속서 자체가 무효 — 화면 설계 진행 불가.

---
