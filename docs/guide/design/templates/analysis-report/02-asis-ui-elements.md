## 4. As-Is 화면 요소 전수 분석

### 4.1 화면 요소 수량 요약

<!--
  T1-A 행 10 항목 고정 (MUST). 행 추가·삭제·순서 변경 ✗.
  알고리즘 (00 §6.4.0 페이지 유형 A~E 자동 결정):
  - A 단순 조회: A-FILTER + A-GRID 단일 / D=0 / L=0 / GE=0
  - B 조회+상세: A-FILTER + A-GRID + A-DETAIL / D≥1 / GE=0 / L=0
  - C 조회+라인: A-FILTER + A-GRID + A-DETAIL + L≥1 (parent FK)
  - D 다중 그리드: GE≥1 또는 G2≥1 (확장 그리드 존재)
  - E 등록 폼: A-FILTER 없음 + A-DETAIL 위주
  매핑 사례 (Tier 6):
  - workReport: G=85, GE=24 → D 다중 그리드
  - codeMaster: G=15, GE=0, D=0, L=0 → A 단순 조회
  - orderRegistration: G=10, D=5, L=8 → C 조회+라인
-->

| 항목 | 식별 수 | 전수 여부 | 근거 | 비고 |
|---|---:|---|---|---|
| 조회조건 (S-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.1 / §0.2 | - |
| 메인 그리드 (G-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.2 / §0.3 | - |
| 확장/서브 그리드 (GE-NNN / G2-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.3 / §0.3 | - |
| 상세 필드 (D-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.3 / §0.3 | - |
| 라인 필드 (L-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.3 / §0.3 | - |
| 버튼 (B-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.4 / §0.4 | - |
| 그리드셀 인라인 버튼 (GB-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.4-2 / §0.4 | - |
| 팝업/탭/연동 (P-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.5 / §0.5 | flat 체계 |
| 상태값 (ST-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.6 | - |
| 코드값/LoV (LV-NNN) | 0 | 전수/부분/확인필요 | 00 §6.4.6-2 | - |

### 4.2 조회조건 전수 목록 (S-NNN)

<!--
  추출 알고리즘 (00 §6.4.1 — 10 단계 본문 직접 박힘):
  1. 입력: designer.cs 의 grpsearch 또는 검색 영역 컨테이너
  2. 필터 1: Visible=false 자동 제외 (this.X.Visible = false 라인 grep)
  3. 필터 2: 주석 처리 자동 제외
  4. 포함 컴포넌트: TextBox / ComboBox / CheckBox / DatePicker / Lookup
  5. 제외: Label 단독
  6. 정렬: §0.2 좌표 정렬 표 결과
  7. 일련번호: S-001~ 3자리
  8. Lookup 묶음 (T1-B): txt+btn+txtNm = 1 행
  9. 1 컨트롤 N 핸들러 (T1-F): N 행 분리
  10. Lookup 트리거 분류 (R-11): grpsearch 내부 + Dialog 호출만 = S 흡수

  셀별 작성 규칙 (자유도 0):
  - 화면 표시명 (출처 enum 5단계 — 01 A.4.10):
    1) Label.Text → 2) GroupBox.Text → 3) Tag 속성 → 4) cs 동적 → 5) 미존재 = "alias [Q-NNN]"
    표기 enum (R-12 Tier 3 — 1 enum 축소):
    - 확정: "한글" (출처 인용 필수)
    - 미확정: "alias [Q-NNN]" (괄호 / "(후보)" / "(As-Is DDL)" 모두 ✗)
  - As-Is 컨트롤명: designer.cs 변수명 그대로
  - As-Is 필드/컬럼: SP 매개변수명 (@DateType 등)
  - To-Be 컬럼: As-Is 어간 → camelCase 직역 (T2-B). 축약 ✗ (`Fr` → `FromDt` 강제)
  - 입력 유형: 5 enum 만 (TextBox / ComboBox / CheckBox / DatePicker / Lookup)
  - 코드/LoV: LV-NNN ID 인용 또는 자체 enum
  - 기본값: As-Is `Value` 속성 / OnLoad 핸들러 발췌 / 미상 → "[Q-NNN]"
  - 필수: Y / N (Tag="required" 또는 검증 코드)
  - 근거: `designer.cs:line / .cs:line` 형식 (1 enum)

  매핑 사례 라이브러리 (Tier 6 — 5 사례):
  1. cboDateType (ComboBox) + Tag="required = 일자타입" → S-001 / 표시명="일자타입" (출처: Tag) / ComboBox / Y
  2. txtCustCd + btnCust + txtCustNm (Lookup 묶음) → S-002 / 표시명=라벨.Text "고객" / Lookup / N
  3. dtpReportFr (DatePicker) + 라벨 인접 "시작일자" → S-003 / 표시명="시작일자" (출처: Label.Text) / DatePicker / Y
  4. chkInSideFlag (CheckBox) + 라벨 미존재 → S-004 / 표시명="chkInSideFlag [Q-004]" / CheckBox / N
  5. btnRes (Lookup + 일괄변경 T1-F) → S-Lookup 1 행 + B-NNN 1 행 (분리)
-->

| ID | 화면 표시명 (출처: 01 A.4.10 폴백 5단계 / 표기: 확정·미확정 1 enum) | As-Is 컨트롤명 | As-Is 필드/컬럼 | To-Be 컬럼 (T2-B 직역) | 입력 유형 (5 enum) | 코드/LoV | 기본값 | 필수 (Y/N) | 근거 (파일:line) |
|---|---|---|---|---|---|---|---|---|---|
| <!-- 예시 (orderRegistration) --> |
| S-001 | 일자타입 | cboDateType | @DateType | dateType | ComboBox | LV-001 | A | Y | designer.cs:48 |
| S-002 | 고객 | txtCustCd + btnCust + txtCustNm | @CustCd | custCd | Lookup | LV-002 | - | N | designer.cs:65 |
| <!-- 본 화면 --> |

### 4.3 그리드 컬럼 전수 목록 (G-NNN 메인 / GE-NNN 확장)

<!--
  추출 알고리즘 (00 §6.4.2 + §6.4.3-1 본문 직접 박힘):
  G-NNN (00 §6.4.2):
  1. 입력: procedures/{SP}.sql 메인 SELECT (sList 분기)
  2. 분해: SQL alias 1 개 = 1 행 (UI/aRow 단위 분해 ✗)
  3. 정렬: SELECT 절 등장 순서
  4. 일련번호: G-001~
  5. 임시테이블 동기화 (R-11): #prod 정의 ≠ 최종 SELECT alias 시 **최종 SELECT 우선**
  6. 자동생성 컬럼: SP 에 alias 명시되어 있으면 포함 / 클라이언트만 추가 = 제외
  7. 주석 SELECT: 제외 + §11.3 자연제외 등재

  GE-NNN (00 §6.4.3-1):
  - sList2 / sSubList / 명세 외 분기 → §0.3 분기 분류표 적용
  - GE vs G2 우선 (R-11): 확장 그리드 1 개 시 GE-NNN 강제 (G2 ✗)

  셀별 작성 규칙 (자유도 0):
  - 화면 표시명 (출처 enum 5단계 — 01 A.4.10):
    1) GridColumn.HeaderText → 2) Column.Caption → 3) cs SetGridHeader → 4) aRow["{한글}"] → 5) 그리드 옆 Label.Text → 미존재 = "alias [Q-NNN]"
    표기 1 enum: 확정 = "한글" / 미확정 = "alias [Q-NNN]" (괄호 / "(As-Is DDL)" 모두 ✗)
  - As-Is 컬럼 (alias): SP SELECT 절 alias 그대로
  - To-Be 컬럼: alias → camelCase 직역
  - 표시 형식 (T3-C — 자료형(길이) 강제): varchar(N) / int(N) / decimal(P,S) / date(YYYY-MM-DD) / bit(Y/N) — 미확보 = "[Q-NNN]"
  - 정렬: Left / Center / Right (3 enum)
  - 편집 여부: Y / N
  - 상태별 제어: ST-NNN ID 인용 / `-` (없음)

  매핑 사례 라이브러리 (Tier 6 — 5 사례):
  1. WORK_TYPE (alias) + GridColumn.HeaderText="작업유형" → G-001 / 표시명="작업유형" (출처: HeaderText) / workType / varchar(20) / Center
  2. EQUIP_NM (alias) + 폴백 5 미존재 → G-002 / 표시명="EQUIP_NM [Q-005]" (미확정 1 enum) / equipNm / varchar(80) / Left
  3. ST_RUNTIME (alias) + DDL extended property "표준작업시간" → G-003 / 표시명="표준작업시간" (출처: DDL ext property) / stRuntime / decimal(18,2) / Right
  4. CASE WHEN ... AS workTypeNm (case 변환) → G-004 / 표시명="작업유형명" / workTypeNm / varchar(20) / Center / 비고: case 변환 컬럼
  5. -- BAD_QTY (주석) → 제외 + §11.3 L2 자연제외
-->

**메인 그리드 (G-NNN)**:

| ID | 그리드명 | 화면 표시명 (출처 5단계 / 1 enum) | As-Is 컬럼 (alias) | To-Be 컬럼 | 표시 형식 | 정렬 (3 enum) | 편집 여부 (Y/N) | 상태별 제어 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| <!-- 예시 (workReport) --> |
| G-001 | spread1 | 작업유형 | WORK_TYPE | workType | varchar(20) | Center | N | ST-001~005 | soPGA020.sql:280 |
| G-002 | spread1 | EQUIP_NM [Q-005] | EQUIP_NM | equipNm | varchar(80) | Left | N | - | soPJA005.sql:42 |
| <!-- 본 화면 --> |

**확장/서브 그리드 (GE-NNN / G2-NNN)** — 해당 없음 시 표 아래 "해당 없음" 명시 + 빈 표 유지:

| ID | 영역 | 그리드명 | As-Is 컬럼 (alias) | To-Be 컬럼 | 분기 | 표시 형식 | 편집 여부 | 근거 |
|---|---|---|---|---|---|---|---|---|

### 4.4 상세/라인 필드 전수 목록 (D-NNN / L-NNN)

<!--
  추출 알고리즘 (00 §6.4.3-1 분기 분류 매트릭스):
  - L 후보: parent FK + 다중 row → L-NNN
  - D 후보: PK 단일 row → D-NNN
  - 그 외: GE-NNN (§4.3 등재)
  셀별 규칙: §4.2 / §4.3 와 동일 (T2-A / T2-B / T3-B / T3-C / 표시명 출처 5단계 / 표기 1 enum).
  해당 없음 시 "해당 없음" 1 줄 + 빈 표 유지 (절 / 표 삭제 ✗).
-->

| ID | 영역 (상세/라인) | 화면 표시명 | As-Is 필드/컬럼 | To-Be 컬럼 | 입력 유형 | 필수 | 상태별 제어 | 근거 |
|---|---|---|---|---|---|---|---|---|

### 4.5 버튼 전수 목록 (B-NNN)

<!--
  추출 알고리즘 (00 §6.4.4 — 11 단계 본문 직접 박힘):
  1. 입력: designer.cs Button + cs `.Click +=` 등록
  2~4. 필터: 이벤트 연결 / Visible=false / 주석 제외
  5. 미연결: → L3 자연제외 + Q-NNN
  6. 표시명 중복: 핸들러명 기준 구분
  7. 정렬: designer 선언 순서
  8. 일련번호: B-001~
  9. 1 컨트롤 N 핸들러 (T1-F): N 행 분리 강제 — 다중 핸들러 시 무조건 분리
  10. T1-F 트리거 조건: (a) Click += 2개 이상 + (b) 다른 To-Be action 매핑 + (c) 비고 명시
  11. Lookup 트리거 vs 일반 분류 (§0.4): grpsearch + Dialog 호출만 = S 흡수 / 그 외 = B

  셀별 작성 규칙 (자유도 0):
  - 버튼명 (출처 enum 5단계 — 01 A.4.10): 1) Button.Text → 2) ToolbarButton.Text → 3) ButtonField.Caption → 4) cs btn.Text 동적 → 5) 미존재 = "컨트롤명 [Q-NNN]"
  - 동작 유형 enum 7값: 조회 / 저장 / 삭제 / 상태변경 / 팝업 / 연계 / 출력
  - To-Be action: As-Is 어간 → camelCase 직역 (T2-B). action enum 7: search / save / delete / changeStatus / popup / link / export
  - 그리드셀 인라인은 §4.5-1 GB-NNN 별도

  매핑 사례 라이브러리 (Tier 6 — 5 사례):
  1. btnSearch.Click → OnSearch() + toolbar → B-001 search / 조회
  2. btnSave.Click → OnSave() + toolbar → B-002 save / 저장
  3. btnDelete.Click → OnGridButtonClicked + 그리드셀 → GB-NNN (§4.5-1, B 제외)
  4. btnLookupCust.Click → Dialog.Show() + grpsearch → S 흡수 (§4.2, B 제외)
  5. btnRes.Click → Lookup + 일괄변경 (T1-F) → S Lookup 1 + B 일괄변경 1 (2 행)
-->

| ID | 버튼명 (출처: 5단계 / 1 enum) | As-Is 컨트롤명 | 이벤트 핸들러 | 동작 유형 (7 enum) | To-Be action (7 enum) | 권한 | 근거 |
|---|---|---|---|---|---|---|---|
| <!-- 예시 (orderRegistration) --> |
| B-001 | 조회 | btnSearch | btnSearch_Click | 조회 | search | (전체) | designer.cs:48 / cs:142 |
| B-002 | 저장 | btnSave | btnSave_Click | 저장 | save | (등록자) | designer.cs:50 / cs:158 |
| <!-- 본 화면 --> |

### 4.5-1 그리드셀 인라인 버튼 전수 목록 (GB-NNN)

<!--
  추출 알고리즘 (00 §6.4.4-2 — 6 단계):
  1. 입력: GridColumn.ButtonField / IconField + OnGridButtonClicked / CellClick
  2. 분해: 컬럼 정의 1 셀 = 1 행 (그리드 데이터 행 수 무관)
  3. 필터: Visible=false / 주석 제외
  4. 정렬: 컬럼 등장 순서
  5. 일련번호: GB-001~
  6. 매핑: 소속 그리드 ID (G-NNN / GE-NNN / L-NNN) 비고에 명시
-->

| ID | 버튼명 | 소속 그리드 | 셀 컬럼 | 핸들러 분기 | 동작 유형 | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| <!-- 예시 (orderRegistration) --> |
| GB-001 | 행 삭제 | G-NNN (메인) | DELETE_BTN | OnGridButtonClicked case "DELETE" | 삭제 | deleteRow | designer.cs:285 |
| <!-- 본 화면 --> |

### 4.6 팝업/탭/연동 목록 (P-NNN)

<!--
  추출 알고리즘 (00 §6.4.5 — 8 단계 본문 직접 박힘):
  1. grep: OpenForm / OpenFormWithParameter / Dialog / CreateDialog / NewCodeQuery / ShowDialog / Popup
  2~4. 필터: 실제 호출만 / 추정 제외 + Q-NNN / 중복은 최초 위치 우선
  5. 정렬 (R-11): (a) 핸들러 호출 순서 (OnLoad → OnSearch → OnSave → OnGridButtonClicked → btn*_Click) → (b) 동일 핸들러 내 라인 번호 → (c) 외부 호출만 = 마지막
  6. 일련번호: P-001~ flat
  7. ID 체계: flat MUST (P-101 / P-201 prefix 분리 ✗)
  8. 사전 판정표 (§0.5) 강제 — 미작성 시 §D ✗

  셀별 규칙 (자유도 0):
  - 이름 (출처 enum 5단계 — 01 A.4.10): 1) Dialog Title 인자 → 2) (사용 금지 — 클래스명 직역 ✗) → 3) 호출 라인 주석 → 4) 외부 다이얼로그 this.Text → 5) "클래스명 [Q-NNN]"
  - To-Be 처리 enum: navigate / popup / external
-->

| ID | 유형 (popup/tab/external) | 이름 (출처 5단계 / 1 enum) | 트리거 (B-NNN / 이벤트) | 호출 라인 (cs:line) | 전달 파라미터 | 반환값 | To-Be 처리 |
|---|---|---|---|---|---|---|---|
| <!-- 예시 (inspectionRequest) --> |
| P-001 | popup | 보류 정보 | btnHold (B-005) | btnHold_Click:142 | woNo | bool | popup |
| <!-- 본 화면 --> |
