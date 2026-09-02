## 17. As-Is Procedure 분석 (As-Is 가 있는 경우 MUST)

> **(MUST)** 본 절은 `/analyze-service {SCREEN-ID}` 실행 결과
> (`docs/external/KsmErpK/orgErpReport/{areaId}/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json`)
> 를 인용하여 작성한다. cache 가 없으면 BE/FE 가이드 §1-3 Step 0 진입 게이트가 차단된다.
>
> 본 절은 BE/FE 가이드 §1-3 Step 0 (analyze-service 호출 의무) 의 산출물이며,
> 정합체크서 §K.5 (SP 부수효과 매트릭스) 의 입력이다.
>
> **As-Is 가 없는 To-Be only 화면** (예: 신규 화면, 부속서 A.3 미등재 신규 등록) 은 본 절을 "해당 없음" 으로 기록.

### 17.0 절대 원칙 (모든 §17.N 보다 우선 — 위반 시 즉시 ✗ 재개발 의무)

> **🚨 본 §17.0 은 §17 전체에 우선하는 절대 원칙이다. 본 §17 의 어떤 조항도 본 §17.0 을 회피하는 근거로 사용될 수 없다.**

#### 17.0.1 As-Is 정의 1:1 보존 — 임의 변경 절대 금지

다음 모든 As-Is 정의는 **사용자 명시 결정 (§12 결정 후보 등재 → 사용자 동의) 없이 변경 불가**:
- **화면 구조**: 그리드 개수, 통합/분리, 컴포넌트 배치, 자동 연동
- **테이블/컬럼**: PK 키 개수, 컬럼명, 컬럼 수, 컬럼 타입, NULL 허용 여부
- **상태값**: hardcode 값 (예: `'A'`/`'8'`/`'9'`)
- **데이터 동작**: INSERT 컬럼 누락, UPDATE 컬럼 추가, DELETE 조건 변경
- **자동 연동**: C# 이벤트 핸들러, 표준 라이브러리 호출, 자동 채번 규칙
- **검증 로직**: 사전 EXISTS / NOT EXISTS, 차단 조건, 사전 SELECT 변수 추출

**임의 변경 근거로 사용 금지인 표현**: "효율 위해 단순화" / "MES 표준에 맞춤" / "시간 단축" / "분량이 커서" / "유사하므로 동일" / "동등하므로 동일". 이런 근거가 §K.5 의 ✗/△ 행 사유에 등장하면 = **✗ 자동 재개발 의무**.

#### 17.0.2 코드 정의 완전 분석 의무 — Skip 금지

- 매 As-Is 코드 **1 정의 = 1 행** 추출 의무 (1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리 호출 / 1 검증 / 1 사전 SELECT).
- "분량이 커서 다음 응답에" / "유사하므로 생략" / "동등하므로 동일" 패턴 사용 시 = **✗ 자동 전환**.
- 분량이 크면 **응답 분할은 허용**, **추출 자체의 skip 은 금지**.
- 모든 행은 **`file:line + 코드 본문 quote` 동시 보유** (둘 중 하나 누락 시 = ✗ 자동 전환).

#### 17.0.3 검증 단계 의무 — 매 단계 차단 조항

§17.2 작성 후 §17.5 self-check 통과해야 §17 완료 인정. 미통과 = 정합체크서 §K.5 진행 불가.

### 17.1 Primary Procedure 메타

| 항목 | 값 |
|---|---|
| Primary SP 명 | (sql_analysis.json:primaryProcedure) |
| SP 파일 경로 | (sql_analysis.json:procedurePath) |
| 줄 수 | (sql_analysis.json:procedureLines) |
| 총 case 수 | (sql_analysis.json:totalCases) |
| 외부 SP/FN 의존 | (sql_analysis.json:uniqueExternalDeps — 콤마 결합) |

### 17.2 Case × 부수효과 매트릭스 (강제 형식 — As-Is 컬럼 단위 1:1 추적)

> **(MUST)** 매 행 = As-Is 의 1 컬럼 / 1 분기 / 1 사전 검증 / 1 사전 SELECT 1 라인. **case 단위 묶음 절대 금지** (§17.0.2).
> **(MUST)** INSERT 컬럼 N 개 = N 행 / UPDATE SET 컬럼 N 개 = N 행 / SELECT 컬럼 N 개 = N 행 / JOIN N 개 = N 행 / WHERE 조건 N 개 = N 행.
> **(MUST)** IF/ELSE / NOT EXISTS / CASE WHEN 등 조건부 분기 = 별도 행.
> **(MUST)** As-Is C# 가 SP 의 어떤 파라미터를 미전달하면 NULL 저장 — 이것도 별도 행 (예: `MOLD_OUT = NULL (C# 미전달)`).
> **(MUST)** 각 부수효과에 고유 ID `E-NNN` 부여. `E-NNN` 은 정합체크서 §K.5 의 행과 1:1 매핑.
> **(MUST)** 각 행에 As-Is 코드 위치 (`file:line`) + As-Is 코드 한 줄 이상 quote 필수. 누락 시 본 §17.2 미완성.

| Case | E-ID | 부수효과 (1 컬럼 / 1 분기) | As-Is 코드 위치 | As-Is 코드 quote |
|---|---|---|---|---|
| (예: iMoldInfo) | E-01 | 사전 검증 — P_MOLD_INFO EXISTS 차단 | `procedures/soPMA005.sql:590-598` | `if exists(select 1 from P_MOLD_INFO ...) begin select 'WR', '...' return end` |
| (예: iMoldInfo) | E-02 | P_MOLD_INFO INSERT — CoCd | `procedures/soPMA005.sql:613+625` | `(CoCd, ...) VALUES (@CoCd, ...)` |
| (예: iMoldInfo) | E-03 | P_MOLD_INFO INSERT — ITEM_NM | `procedures/soPMA005.sql:613+625` | `(... ITEM_NM ...) VALUES (..., @ItemNm, ...)` |
| (예: iMoldInfo) | E-04 | P_MOLD_INFO INSERT — MOLD_STATUS = 'A' (hardcode) | `procedures/soPMA005.sql:615+627` | `(... MOLD_STATUS ...) VALUES (..., 'A', ...)` |
| (예: iMoldInfo) | E-05 | B_ITEM_INFO 조건부 INSERT 검증 (NOT EXISTS) | `procedures/soPMA005.sql:650` | `if not exists (select 1 from B_ITEM_INFO ...)` |
| (예: iMoldInfo) | E-06 | B_ITEM_INFO INSERT — ITEM_ACCT = '90' (hardcode) | `procedures/soPMA005.sql:654+660` | `(... ITEM_ACCT ...) values (..., '90', ...)` |
| ... | ... | (INSERT/UPDATE/DELETE/SELECT 컬럼 단위 + 모든 분기) | ... | ... |

### 17.2-T1 As-Is 화면 컴포넌트 추출 매트릭스 (Designer.cs 1:1 — 강제 형식)

> **(MUST)** As-Is `*.Designer.cs` 의 `InitializeComponent()` 안의 **모든 컴포넌트** 1행씩.
> Grid / Btn / Txt / Combo / Label / GroupBox / Panel / TabControl / ToolStripButton / Spread / GeneralDialog / RfdCustomerDialog / ResourceDialog / FilterRow 등 모든 UI 컨트롤 포함.
> 누락 = §17.0.2 위반 → ✗ 자동 전환.

| C-ID | 컴포넌트 종류 | 컴포넌트명 | Designer.cs 위치 | Designer.cs quote | 부모 컨테이너 | 비고 (자동 연동 / 데이터 소스) |
|---|---|---|---|---|---|---|
| (예) C-001 | ManagedGrid | grid1 | `masterCodeMng.designer.cs:LXXX` | `this.grid1 = new ManagedGrid();` | grpSpread1 (메인 영역) | sMoldInfo SP case 결과 표시 |
| (예) C-002 | ManagedGrid | grid2 | `masterCodeMng.designer.cs:LYYY` | `this.grid2 = new ManagedGrid();` | grpSpread2 (우측 영역) | **AttachmentManager(grid2) 가 wwAttachmentFile 표시** — grid1 행 선택 변경 시 자동 갱신 |
| (예) C-003 | ToolStripButton | btnInsp | `masterCodeMng.cs:39` | `ToolStripButton btnInsp;` (`ToolbarManager.AddButton("검사정보조회",...)` L106) | ToolbarManager | QMA001K 외부 화면 전환 |
| (예) C-004 | C1TextBox | txtAttachments | `masterCodeMng.designer.cs:60` | `this.txtAttachments = new C1.Win.C1Input.C1TextBox();` | grpSearchMaster | 첨부번호 입력 — btnAttachments 와 연동 |
| ... | ... | ... | ... | ... | ... | ... |

### 17.2-T2 As-Is 이벤트 핸들러 추출 매트릭스 (C# 1:1 — 강제 형식)

> **(MUST)** As-Is `*.cs` 의 모든 이벤트 핸들러 1행씩. 표준 `OnSearch`/`OnSave`/`OnClear`/`OnLoad`/`OnOpen` + 모든 `OnGrid*` (RowSelectionChanged / CellDoubleClick / CellClick / RowAdded / CellChanged 등) + 모든 `*_Click` (btn 핸들러) 포함.

| EV-ID | 이벤트명 | C# 핸들러 함수 | 위치 | 핸들러 quote (첫 1-2 줄) | 트리거 → 부수 효과 (자동 호출 표준 라이브러리 / 자동 SP case / 자동 그리드 갱신 등) |
|---|---|---|---|---|---|
| (예) EV-001 | 그리드 행 선택 변경 (grid1) | `OnGridRowSelectionChanged` | `masterCodeMng.cs:373-395` | `public override void OnGridRowSelectionChanged(ManagedGrid grid, int row, int prevRow) { if (grid == grid1) { txtAttachments.Value = ""; ... grid2.Clear(); LoadGeneral(selectedAttachNo); }}` | **자동 grid2 클리어 + LoadGeneral(AttachNo) → LoadAttachGrid(grid2, AttachNo) → AttachmentManager.Load** (첨부파일 자동 표시) |
| (예) EV-002 | 그리드 셀 더블클릭 (grid1) | `OnGridCellDoubleClick` | `masterCodeMng.cs:402-407` | `public override void OnGridCellDoubleClick(...) { ... OpenFormWithParameter("PMA009K", initialValues, true); }` | PMA009K 외부 화면 전환 |
| (예) EV-003 | btnInsp 클릭 | `btnInsp_Click` | `masterCodeMng.cs:685-691` | `private void btnInsp_Click(object sender, EventArgs e) { string strInspItemCd = grid1.ActiveRow["금형코드"].Text; ... }` | QMA001K 검사정보 화면 전환 (또는 메시지) |
| ... | ... | ... | ... | ... | ... |

### 17.2-T3 As-Is 표준 라이브러리 호출 매트릭스 (Root.dll / LocalSupport.dll 등 — 강제 형식)

> **(MUST)** As-Is `*.cs` 안의 모든 외부 라이브러리 호출 1행씩.
> `AttachmentManager` / `AttachedFileList` / `AutoFillup` / `RfdCustomerDialog` / `ResourceDialog` / `GeneralDialog` / `StoreValidation` / `SearchValidation` / `NewCodeQuery` / `WorkPreset` / `OpenFormWithParameter` / `Session.User` / `Session.Organization` 등 표준 클래스 호출 모두 포함.
> **이것이 누락되면 grid2 같은 화면 자동 동작이 SP grep 만으로는 영원히 안 잡힘** (§0 위반 사례 1번).

| L-ID | 라이브러리/클래스 | 호출 위치 | 호출 quote | 호출 의도 / To-Be 매핑 후보 |
|---|---|---|---|---|
| (예) L-001 | AttachmentManager | `masterCodeMng.cs:118-120` | `attachment = new AttachmentManager(grid2); attachment.DisplayColumns = new AttachmentColumn[] { FileName, FileDescription, Modifier, ModifiedDate }; attachment.Initialize();` | **메인 화면 grid2 에 wwAttachmentFile 표준 첨부 파일 자동 표시** (sAttach SP case 와 다른 데이터 소스) |
| (예) L-002 | AutoFillup | `masterCodeMng.cs:130` | `AutoFillup.Add(WorkPreset.CustomerCode, txtCustCd, txtCustNm);` | txtCustCd 입력 → txtCustNm 자동 채움 (B_CUST_INFO lookup) |
| (예) L-003 | RfdCustomerDialog | `masterCodeMng.cs:133` | `RfdCustomerDialog.CreateDialog(txtCustCd, txtCustNm, btnCust);` | btnCust 클릭 → 고객사 popup → 선택 결과를 txtCustCd/txtCustNm 에 채움 |
| (예) L-004 | NewCodeQuery | `masterCodeMng.cs:81-86` | `NewCodeQuery("B053").Load(grid1.Columns["금형분류"], ListingOption.AddEmptyItem);` | 그리드 컬럼에 B_COMM_CODE B053 LoV 자동 로드 |
| (예) L-005 | OpenFormWithParameter | `masterCodeMng.cs:406` | `OpenFormWithParameter("PMA009K", initialValues, true);` | 외부 화면 전환 (셀 더블클릭 트리거) |
| ... | ... | ... | ... | ... |

### 17.2-T4 SP case × 부수효과 매트릭스 (= §17.2 본 표 — 위 컬럼 단위 1:1 표 인용)

> §17.2 의 본 표 (Case × E-NNN × 컬럼) 가 T4 역할.

### 17.3 부속 dialog 별 case 매핑

> 메인 화면이 호출하는 부속 dialog 각각이 사용하는 SP case 를 분리 기록. 정합체크서 §K.5 의 "메인 vs 부속 분리 검증" 입력.

| 부속 dialog | 호출 case | 대상 테이블 | 부수효과 요약 |
|---|---|---|---|
| (예: masterCodeMng_detail) | iMoldPolish, uMoldPolish | P_MOLD_INFO + P_MOLD_POLISH | MOLD_STATUS 전이 + 검사의뢰 자동 (조건부) |
| ... | ... | ... | ... |

### 17.3 부속 dialog 별 case 매핑

> 메인 화면이 호출하는 부속 dialog 각각이 사용하는 SP case 를 분리 기록. 정합체크서 §K.5 의 "메인 vs 부속 분리 검증" 입력.

| 부속 dialog | 호출 case | 대상 테이블 | 부수효과 요약 |
|---|---|---|---|
| (예: masterCodeMng_detail) | iMoldPolish, uMoldPolish | P_MOLD_INFO + P_MOLD_POLISH | MOLD_STATUS 전이 + 검사의뢰 자동 (조건부) |
| ... | ... | ... | ... |

### 17.4 자동 룰 카운트 (1:1 대조용)

> 정합체크서 §K.5 와 BE/FE 가이드 §12-3 (FE §13-4) 의 체크박스 입력. 본 표의 각 값이 우리 BE/FE 구현 측 동일 항목 수와 정확히 일치해야 ✓.
> **§17.0.1 As-Is 1:1 보존 원칙** 에 따라 본 카운트 값의 변경은 사용자 명시 결정 없이 불가.

| 룰 종류 | 수 |
|---:|---:|
| **T1 As-Is 화면 컴포넌트 수** (Designer.cs `InitializeComponent()` 내 모든 컨트롤) | (예: 47) |
| **T2 As-Is 이벤트 핸들러 수** (`On*` + `*_Click` + `OnGrid*`) | (예: 14) |
| **T3 As-Is 표준 라이브러리 호출 수** (AttachmentManager / AutoFillup / RfdCustomerDialog / NewCodeQuery 등) | (예: 9) |
| **T4 SP case 수** (메인 + 부속 합산) | (예: 22) |
| **T4 부수효과 E-NNN 수** (§17.2 의 컬럼 단위 전수) | (예: 264) |
| 외부 SP/FN 호출 수 (`EXEC soXxx` / `goXxx` / `dbo.fn_xxx`) | (예: 3) |
| 자동 채번 룰 수 (`goSerialNumber` / MAX+1 등) | (예: 2) |
| 자동 일자 / 자동 코드 변환 룰 수 (inline SQL / 자동 일자 set 등) | (예: 4) |
| Q-MasterDomain-deferred / Q-LoV-deferred / Q-MLS-deferred 의존 수 | (예: 12) |

### 17.5 §17 self-check (✓ 처리 차단 조항)

> **(MUST)** 본 §17.5 가 모두 통과해야 §17 완성 인정. 한 항목이라도 미통과 = 정합체크서 §K.5 진행 불가.
> 미통과 항목이 있으면 ✓ 표시 금지 → ✗ 자동 전환 → 재개발 의무.

#### 17.5.1 추출 완전성 검증 (§17.0.2)

- [ ] §17.2-T1 (컴포넌트) 의 모든 행에 `Designer.cs file:line + quote` 보유
- [ ] §17.2-T2 (이벤트) 의 모든 행에 `*.cs file:line + 핸들러 quote` 보유
- [ ] §17.2-T3 (표준 라이브러리) 의 모든 행에 `*.cs file:line + 호출 quote` 보유
- [ ] §17.2-T4 (SP case 컬럼 단위) 의 모든 행에 `procedures/*.sql file:line + 본문 quote` 보유
- [ ] T1/T2/T3/T4 어느 행에도 "분량이 커서" / "유사하므로 생략" / "동등하므로 동일" 표현 없음

#### 17.5.2 임의 변경 검증 (§17.0.1)

- [ ] T1/T2/T3 의 각 As-Is 항목 중 "To-Be 에서 별도 모듈/popup 으로 분리" 라고 적힌 행은 §12 결정 후보 ID 인용 보유
- [ ] T4 의 컬럼 중 "BE 가 다른 컬럼/테이블/값으로 대체" 라고 적힌 행은 §12 결정 후보 ID 인용 보유
- [ ] 정당화 없는 분리/통합/값 변경 = 0 건

#### 17.5.3 수량 동일성 검증 (§K.5 와의 연계)

- [ ] §17.4 카운트의 T1 값 = 정합체크서 §K.5 의 To-Be 컴포넌트 수 동일 (차이 = §12 등재)
- [ ] §17.4 카운트의 T2 값 = §K.5 의 To-Be 이벤트 수 동일
- [ ] §17.4 카운트의 T3 값 = §K.5 의 To-Be 표준 라이브러리 대응 코드 수 동일
- [ ] §17.4 카운트의 T4 E-NNN 수 = §K.5 의 행 수 동일 (1:1 매핑)

#### 17.5.4 위반 사례 검출 (가이드 §17.0.4 참조용)

다음 패턴이 §17 본문에 검출되면 즉시 ✗:
- 화면 통합/분리 임의 결정 (예: As-Is 1 화면 → To-Be 2 화면 분리 사유 없음)
- 상태값 hardcode 임의 변경 (예: As-Is `'8'` → To-Be `'9'` 사유 없음)
- 테이블 임의 교체 (예: As-Is `P_JIG_HISTORY` UPDATE → To-Be `P_MOLD_INFO.CUR_SL_CD` 만)
- PK 키 단순화 (예: As-Is 5 키 → To-Be 단일 IDENTITY 사유 없음)
- 자동 연동 누락 (예: AttachmentManager 호출 → T3 에 미등재)
