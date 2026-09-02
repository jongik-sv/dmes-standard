---
screenId: masterCodeMngList
asIsId: MasterCodeMngList
moduleId: mcm
moduleGroup: cme
작성일: 2026-05-29
작성자: Agent
---

# Master Code 상세조회 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner 의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + java / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 "manifest 인용만" 미적용. cite 는 file:line 형식 유지 |
| moduleGroup 표기 | 산출물 §1 / frontmatter = **cme** (To-Be) | 사용자 결정 — ASIS 자산은 `nxuiMui/cma/` 폴더에 있으나 To-Be 는 cme(Master/업무기준(가동)) 그룹으로 분류. 본 화면이 등록·수정 기능 없는 **조회 전용** (asis MasterCodeMng 의 상세 뷰)이라 cme 의 "업무기준 조회" 성격에 부합. mcm-core 가 entity/repository 를 모듈 공통으로 흡수하므로 그룹 이동은 서비스/DTO/UI 레벨에서만 발생 |
| **정책 #4 (0) As-Is/To-Be 표준 우선 원칙** | As-Is 1:1 보존도 To-Be 개발 표준 (cactus-core audit / MSSQL / JPA / schema 명시) 충돌 시 To-Be 우선 — 6 정책 결정 일괄 반영, 2026-05-31 | mcm 전체 cross-cutting 원칙. 본 화면은 SELECT 전용 + BIZ_SYSTEM_CODE / APPHOST / 외부 mapper / EAI 사용 ✗ → 직접 영향 ✗ (audit/ref_Audit 도 SELECT 만이라 자동 채움 영향 ✗). 본 행은 cross-cutting 원칙 본문 명시 목적의 기록 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | Master Code 상세조회 |
| 화면 식별자 (screenId) | masterCodeMngList |
| As-Is 식별자 (asIsId) | MasterCodeMngList |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup (To-Be) | **cme** (한글명 **"Master/업무기준(가동)"**) — ASIS `cma` 그룹에서 cme 로 이동 (§11 변환점 명시) |
| 메뉴 계층 (To-Be) | 공통관리 (mcm) > Master/업무기준(가동) (cme) > Master Code 상세조회 (masterCodeMngList) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | masterCodeMngList |
| pageId | masterCodeMngList |
| serviceId | masterCodeMngList |
| Frontend 파일명 | `masterCodeMngList.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> Master Code 상세조회는 MasterCodeMngList의 조회를 수행한다.

- 주 사용자: 시스템 관리자 / 표준코드 운영 담당자 / 업무 사용자 (코드 참조 확인)
- 업무 도메인: 공통 마스터 코드 (mcm — Master Code Management) 의 코드 마스터(Master) + 코드 상세(Detail) **조회 전용** 화면. masterCodeMng 화면의 등록/수정/삭제 기능을 배제한 read-only 뷰. 등록·수정은 별도 `masterCodeMng` 화면 사용.
- 기능 요약 (BPMN action 2 enum — As-Is 1:1):
  1. `search` — Master 그리드 조회 (`fn_search`, xfdl:284)
  2. `searchDetail` — 선택 Master 의 Detail + Category 콤보 LoV 조회 (`fn_searchDetail`, xfdl:303 / `div_main_div1_grd_main_oncellclick`, xfdl:363)

---

## §2. 자료 수집 인벤토리 (mui 5 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cma/MasterCodeMngList.xfdl` | 415 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / Dataset / Script 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask | (없음 — `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/cma/` 하위에 MasterCodeMng / MasterCategoryMng / MasterCategoryPop / MasterCodeUploadFilePopup 4 폴더만 존재. **MasterCodeMngList 폴더 부재**) | 0 | N (자산 부재 — 조회 전용 화면) | 본 화면은 BPMN 의 commonDbTask (CommonSelectTask) 만 사용 — UserTask Java 불필요 | §7 (해당 없음) |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-cma/MasterCodeMngListMapper.xml` | 108 | Y | 4 SQL ID (select 4 — `GetCodeMasterList` / `GetCodeMasterAllList` / `GetCodeDetailList` / `GetTbMcmCodeCategoryList`) | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/cma/MasterCodeMngList.bpmn` | 141 | Y | StartEvent 1 / EndEvent 1 / ExclusiveGateway 1 (2 outgoing) / Task 3 (CommonSelectTask) / SequenceFlow 6 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | Y (113 시트 — masterCodeMng 작업 시 추출분 인용) | Y | masterCodeMng 분석리포트 §9.1~§9.3 의 sheet39 (MASTER) / sheet36 (DETAIL) / sheet34 (CATEGORY) 컬럼 카탈로그 인용 | §9 (조회만 — 본 화면은 SELECT 만 사용) |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (본 화면 SELECT 만 — audit 영향 ✗) | 본 화면 Mapper.xml 의 4 SQL 은 모두 SELECT (INSERT/UPDATE/DELETE 없음). `<include refid="ref_Audit.*">` 호출 0 회. ref_Audit 폐기 (cactus-core 적용) 의 영향은 본 화면에 직접적이지 않음 (등록 화면 masterCodeMng 가 처리) | §11 (변환점 정보만 인용) |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=50 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu | xfdl:6~18 |
| A-FILTER | `Div div_search` | top=50 / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (코드ID + 코드명) | xfdl:19~28 |
| A-FOLD | `Button btn_fold` | top=93 / height=15 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:30 |
| A-MAIN | `Div div_main` | top=113 / bottom=30 / left=20 / right=20 | 마스터+상세 좌우 분할 컨테이너 | xfdl:31~157 |
| A-MAIN-LEFT (G) | `Div div1` | top=0 / bottom=0 / left=0 / right=51.61% | Master 그리드 + commonRightButton | xfdl:34~89 |
| A-MAIN-RIGHT (GE+FX+B) | `Div div2` | top=0 / bottom=0 / left=49.19% / right=0 | Detail 그리드 + 카테고리 콤보 + Export 버튼 | xfdl:90~154 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:29 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Static.text) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | 코드ID | `edt_codeVal` (옆 Static `stc_codeVal`) | TextBox | 0 (제한 없음) | "USD" / `inputmode="upper"` / onkeydown=`div_search_edtDpNm_onkeydown` (xfdl 정의에 함수 본문 ✗ — 외부/공통 이벤트로 추정) | N | xfdl:22~23 |
| S-002 | 코드명 | `edt_codeNm` (옆 Static `stc_codeValMean`) | TextBox | 0 | "USD" / onkeydown=`div_search_edtDpNm_onkeydown` | N | xfdl:24~25 |

### §3.3 마스터 그리드 G-NNN (`grd_main`, binddataset=`ds_grdMain`, taborder=0, xfdl:37)

> 그리드 옵션: `cellmovingtype="col"`, `cellsizingtype="col"`, `selecttype="cell"`, `autoenter="select"`. Format `default` — head Row 1 + body Row 1.

| ID | head text | body bind | 컬럼 size | edittype | editmaxlength | 기타 (combo / inputmode / displaytype) | 필수 (CellEssentail) | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | NO | `expr:currow+1` | 30 | (없음 — 자동) | - | - | - | xfdl:41 / 58 / 71 |
| G-002 | 코드ID | `bind:CODE_ID` | 120 | (xfdl 별도 edittype 정의 ✗ — 본 화면은 조회 전용으로 body cell 에 `editmaxlength="50"` / `editimemode="alpha"` / `editinputmode="upper"` 만 존재) | 50 | tooltiptext=`bind:CODE_ID` / cssclass head 만 `CellEssentail` + bold | Y (head CellEssentail) | xfdl:42 / 59 / 72 |
| G-003 | 코드명 | `bind:CODE_NM` | 120 | (위 동일) | 180 | `editimemode="hangul"` / tooltiptext=`bind:CODE_NM` / cssclass head 만 `CellEssentail` + bold | Y (head CellEssentail) | xfdl:43 / 60 / 73 |
| G-004 | 설명 | `bind:CODE_DESC` | 120 | (위 동일) | 300 | `editimemode="hangul"` / tooltiptext=`bind:CODE_DESC` / cssclass head 만 bold | N | xfdl:44 / 61 / 74 |
| G-005 | 마스터코드 | `bind:MASTER_CODE` | 120 | (위 동일) | 300 | `editimemode="hangul"` / tooltiptext=`bind:MASTER_CODE` / cssclass head 만 bold | N | xfdl:45 / 62 / 75 |
| G-006 | 참조1 | `bind:MASTER_CODE_REF1_NM` | 120 | (없음) | - | (없음 — body cell 단순 표시) | N | xfdl:46 / 63 / 76 |
| G-007 | 참조2 | `bind:MASTER_CODE_REF2_NM` | 120 | (없음) | - | (동일) | N | xfdl:47 / 64 / 77 |
| G-008 | 참조3 | `bind:MASTER_CODE_REF3_NM` | 120 | (없음) | - | (동일) | N | xfdl:48 / 65 / 78 |
| G-009 | 참조4 | `bind:MASTER_CODE_REF4_NM` | 120 | (없음) | - | (동일) | N | xfdl:49 / 66 / 79 |
| G-010 | 참조5 | `bind:MASTER_CODE_REF5_NM` | 120 | (없음) | - | (동일) | N | xfdl:50 / 67 / 80 |
| G-011 | 사용여부 | `bind:USE_TP` | 55 | combo (`displaytype="combotext"`) | - | combodataset=`ds_chkYn`, combocodecol=`CODE_VAL`, combodatacol=`CODE_VAL_MEAN`, combodisplaynulltype=`nulltext` / cssclass head 만 `delBorder_r,CellEssentail` + bold | Y (head CellEssentail) | xfdl:51 / 68 / 81 |

- 이벤트: `oncellclick="div_main_div1_grd_main_oncellclick"` (Detail 조회 트리거, xfdl:363), `onheadclick="div_main_div1_grd_main_onheadclick"` (gfn 공통 정렬, xfdl:404)
- **주의 (조회 전용)**: 본 화면의 G-NNN body cell 들은 `editmaxlength` / `editimemode` / `editinputmode` 만 지정되어 있고 별도 `edittype="text"` 가 없음 — Nexacro 의 기본 grid 는 `autoenter="select"` 일 때 셀 진입만 가능하며 실제 편집은 발생하지 않음. masterCodeMng (수정 가능 화면) 의 동일 컬럼 정의와 비교 시 본 화면이 read-only 인 이유 = `displaytype` / `edittype` 명시 부재.

### §3.4 상세 그리드 GE-NNN (`grd_detail`, binddataset=`ds_grdDetail`, taborder=0, xfdl:93)

> head Row 2 줄 (rowspan / colspan 사용) — head row 0 + head row 1 + body row 1. CellEssentail 필수 컬럼 4 개 (CODE_VAL / CODE_VAL_MEAN / CATEGORY_ID / CATEGORY_NM). 그리드 옵션: `autofittype="col"`, `cellmovingtype="col"`, `cellsizingtype="col"`, `autoenter="select"`, `selecttype="multiarea"`.

| ID | head row 0 text | head row 1 text | body bind | columns size | edittype | editmaxlength | 기타 (displaytype / cssclass) | 근거 |
|---|---|---|---|---:|---|---:|---|---|
| GE-001 | NO (rowspan=2) | - | `expr:currow+1` | 30 | (없음 — 자동) | - | - | xfdl:97 / 116 / 132 |
| GE-002 | 코드 (col=1, colspan=2) | 값 (row=1 col=1, CellEssentail) + bold | `bind:CODE_VAL` | 48 | (없음 — body cell `editmaxlength="50"` / `editimemode="alpha"` / `editinputmode="upper"` 만) | 50 | tooltiptext=`bind:CODE_VAL` | xfdl:98 / 117,126 / 133 |
| GE-003 | (코드 colspan 흡수) | 의미 (row=1 col=2, CellEssentail) + bold | `bind:CODE_VAL_MEAN` | 80 | (위 동일 — `editmaxlength="120"` / `editimemode="hangul"`) | 120 | tooltiptext=`bind:CODE_VAL_MEAN` | xfdl:99 / 127 / 134 |
| GE-004 | 카테고리 (col=3, colspan=2) | ID (row=1 col=3, CellEssentail) + bold | `bind:CATEGORY_ID` | 48 | (없음) | - | tooltiptext=`bind:CATEGORY_ID` | xfdl:100 / 118,128 / 135 |
| GE-005 | (카테고리 colspan 흡수) | 명 (row=1 col=4) | `bind:CATEGORY_NM` | 80 | (없음) | - | tooltiptext=`bind:CATEGORY_NM` | xfdl:101 / 129 / 136 |
| GE-006 | 정렬\\r\\n순서 (rowspan=2, head 텍스트 정확히 `정렬&#13;&#10;순서`) | - | `bind:SORT_SEQ` | 30 | mask (`maskeditformat="###,###,###,###,###,###"`) | - | - | xfdl:102 / 119 / 137 |
| GE-007 | 설명 (rowspan=2) | - | `bind:CODE_VAL_DESC` | 120 | (없음 — body cell `editmaxlength="300"` / `editimemode="hangul"`) | 300 | tooltiptext=`bind:CODE_VAL_DESC` | xfdl:103 / 120 / 138 |
| GE-008 | 참조1 (rowspan=2) | - | `bind:CODE_VAL_REF1_MN` | 48 | (없음) | - | tooltiptext=`bind:CODE_VAL_REF1_MN` | xfdl:104 / 121 / 139 |
| GE-009 | 참조2 (rowspan=2) | - | `bind:CODE_VAL_REF2_MN` | 48 | (없음) | - | tooltiptext=`bind:CODE_VAL_REF2_MN` | xfdl:105 / 122 / 140 |
| GE-010 | 참조3 (rowspan=2) | - | `bind:CODE_VAL_REF3_MN` | 48 | (없음) | - | tooltiptext=`bind:CODE_VAL_REF3_MN` | xfdl:106 / 123 / 141 |
| GE-011 | 참조4 (rowspan=2) | - | `bind:CODE_VAL_REF4_MN` | 48 | (없음) | - | tooltiptext=`bind:CODE_VAL_REF4_MN` | xfdl:107 / 124 / 142 |
| GE-012 | 참조5 (rowspan=2) | - | `bind:CODE_VAL_REF5_MN` | 48 | (없음) | - | tooltiptext=`bind:CODE_VAL_REF5_MN` | xfdl:108 / 125 / 143 |

- 이벤트: `onheadclick="div_main_div2_grd_detail_onheadclick"` (xfdl:410 — gfn 공통 정렬 호출 / masterCodeMng 와 달리 CHK 컬럼이 없으므로 전체 토글 동작 없음)
- **주의 (조회 전용)**: GE-NNN 의 모든 컬럼에 `edittype` / `displaytype` 가 명시되지 않아 read-only 표시. CHK (선택) / STATUS 등 변경 표시 컬럼이 없음 (등록 화면 masterCodeMng 와의 핵심 차이점).

### §3.5 상세 입력 필드 D-NNN (단일 상세 영역)

> 단일 상세 입력 폼 영역 ✗ — 본 화면은 Master 그리드 + Detail 그리드의 2 그리드 형 (D = 0). div2 상단에 카테고리 콤보가 있으나 이는 GE-NNN 의 필터/세트용 컴포넌트 → 별도 §3.6 컴포넌트에서 처리.

해당 없음.

### §3.6 div2 상단 컴포넌트 (Static / Combo / Button)

| ID | xfdl id | 컨트롤 종류 | 좌표 | 역할 | 데이터셋 / 코드열 / 표시열 | 이벤트 | 근거 |
|---|---|---|---|---|---|---|---|
| FX-001 | `Static00` | Static (cssclass `stc_WFSA_Label`) | top=0 / left=0 / width=60 / height=20 | "카테고리" 라벨 | - | - | xfdl:149 |
| FX-002 | `cbo_categoryId` | Combo | top=0 / left=`Static00:10` / width=120 / height=20 | 선택 Master 의 카테고리 필터 | innerdataset=`ds_lovCategoryId` (xfdl:204), codecolumn=`CATEGORY_ID`, datacolumn=`CATEGORY_NM` | `onitemchanged="div_main_div2_cbo_categoryId_onitemchanged"` (xfdl:355 — 선택 변경 시 ds_grdDetail.filter) | xfdl:150 |
| FX-003 | `stc_master` | Static (cssclass `stc_WFSA_Label,stc_fontColor_indigo`) | left=`cbo_categoryId:5` / top=0 / height=20 / right=341 | 선택 Master 표시 (조회 후 표시) | - | - | xfdl:151 / set_text(MASTER_CODE) at xfdl:345 |
| FX-004 | `div_rightMenu` | Div (url include `_com_div::commonRightButton.xfdl`) | top=0 / height=20 (div1 내) / `visible="false"` | 공통 우측 메뉴 (개인화/숨김 등) | - | - (xfdl:86) | xfdl:86 |

### §3.7 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_grdMain` | CODE_ID / CODE_NM / CODE_DESC / CODE_VER / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / CODE_OWNER_DEPT_NM / CODE_OWNER_EMP_NO / CODE_CHARACTER / MASTER_CODE / MASTER_CODE_REF1~5 / MASTER_CODE_REF1_NM~5_NM (총 22 컬럼) | 마스터 그리드 데이터 | type STRING(256) 통일. **참조1~5 는 코드(`*_REF{N}`) + 명(`*_REF{N}_NM`) 양쪽 보유** — Mapper SQL scalar subquery 결과 인입 | xfdl:161~185 |
| DS-002 | `ds_grdDetail` | MASTER_CODE / CATEGORY_ID / CATEGORY_NM / SORT_SEQ / CODE_VAL / CODE_VAL_MEAN / CODE_VAL_DESC / CODE_VER / CHK / CODE_VAL_REF1_MN~5_MN (총 14 컬럼) | 상세 그리드 데이터 | `useclientlayout="true"`. **`CODE_VAL_REF{N}_MN`** (이름 끝 `_MN` — masterCodeMng 의 `CODE_VAL_REF{N}` 과 다르며 Mapper alias 와 일치, As-Is 그대로 보존). CHK 컬럼 정의됨 (등록 화면과 동일) 이나 본 화면 xfdl Script 에 CHK 토글/세트 함수 ✗ — **잔존 컬럼** | xfdl:186~203 |
| DS-003 | `ds_lovCategoryId` | CATEGORY_ID / CATEGORY_NM | div2 카테고리 콤보 LoV | xfdl:341~344 에서 "" / "전체" 행 prepend | xfdl:204~209 |
| DS-004 | `ds_chkYn` | CODE_VAL / CODE_VAL_MEAN | G-011 (사용여부) 콤보 LoV (Y/Y, N/N 2 행) | 정적 hardcoded Dataset | xfdl:210~225 |
| DS-005 | `ds_grdMainAll` | CODE_ID | (xfdl 정의만 — 컬럼 1 개. 본 화면 Script 에서 직접 사용 ✗. As-Is 잔존) | xfdl Script grep 결과 `ds_grdMainAll.` 호출 0 회 — 잔존 Dataset | xfdl:226~230 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick)

| ID | 위치 | 버튼명 (text) | xfdl id | onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_main 상단 | (접기 토글 — 아이콘) | `btn_fold` | `btn_fold_onclick` (xfdl:381~384) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 | - (클라이언트 전용) | xfdl:30 / 381 |
| B-002 | div2 (Detail 그리드 우상단) | Export | `btn_excelDown` | `div_main_div2_btn_excelDown_onclick` (xfdl:393~401) | `rowposition==-1 차단` → `gfn_exportExcel(grd_detail, titletext, ["마스터코드 : "+MASTER_CODE])` | export | xfdl:148 / 393 |

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:38~84 G / 94~146 GE 전수 검토).

### §4.3 공통 topMenu 버튼 (외부 인입)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:10) | `fn_button()` (xfdl:270~281) → `fn_commonTop_onload(this, '', new Array(["btn_search"]))` | 기본 버튼 `btn_search` 자동 등록 (조회 트리거 → `fn_search`) | xfdl:270~273 |
| EX-002 | `_com_div::commonRightButton.xfdl` (url include) | `div1.div_rightMenu` (xfdl:86) / `visible="false"` | `fn_button()` 의 두 번째 호출 (xfdl:276~280) → `fn_commonRight_onload(this, '', new Array(["btn_excelDown"]), false, "")` | 우측 메뉴 (사용자정의 ✗ + 기본버튼 `btn_excelDown` 등록 + 표시여부=false) | xfdl:276~280 |
| EX-003 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:29) | `gfn_commonBottomStatus_msg(...)` 호출 (xfdl:332 등) | 하단 status 메시지 표시 | xfdl:29 |

### §4.4 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:232~413) 의 모든 function 을 전수 등재 (총 13 개 — onload 1 + AfterOnload 1 + fn_button 1 + fn_search 1 + fn_searchDetail 1 + 콜백 1 + 카테고리 콤보 1 + Master cellclick 1 + 접기 1 + fn_excelDown 1 + Detail Excel down 1 + Master headclick 1 + Detail headclick 1)

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `MasterCodeMngList_onload` | Form onload | `gfn_formOnLoad(obj)` + `gfn_quickMenuSet(this, grd_main, "", true, true, false, false, true)` + `gfn_quickMenuSet(this, grd_detail, "", true, true, true, true, true)` + `ds_grdMain.set_enableevent(false)` | - | - | xfdl:246~261 |
| 2 | `fn_formAfterOnload` | (gfn 라이프사이클 — 외부 호출) | `fn_button()` + `gfn_gridSelectedRow(grd_main)` 호출. **주의**: `this.fn_search();` 라인은 주석 처리 (xfdl:266) — 자동 조회 ✗ | - | - | xfdl:263~268 |
| 3 | `fn_button` | `fn_formAfterOnload` | (1) commonTopButton 의 `fn_commonTop_onload(this, '', [["btn_search"]])` — 기본 `btn_search` 등록 / (2) div_rightMenu 의 `fn_commonRight_onload(this, '', [["btn_excelDown"]], false, "")` — 본 화면 Master 측 commonRightButton 의 기본버튼은 `btn_excelDown` (visible=false 상태) | - | - | xfdl:270~281 |
| 4 | `fn_search` | btn_search (공통 top, EX-001) | (1) `ds_grdMain.clearData()` / `stc_master.set_text(null)` / `ds_grdDetail.clearData()` / `ds_lovCategoryId.clearData()` (2) `gfn_transaction("search", "", "", "ds_grdMain=ds_GetCodeMasterList", pCodeId + pCodeNm)` | search | GetCodeMasterList | xfdl:284~300 |
| 5 | `fn_searchDetail` | `div_main_div1_grd_main_oncellclick` (Master 행 선택) | (1) `ds_grdDetail.clearData()` / `ds_lovCategoryId.clearData()` (2) `gfn_transaction("searchDetail", "", "", "ds_grdDetail=ds_GetCodeDetailList ds_lovCategoryId=ds_GetTbMcmCodeCategoryList", pCodeId=MASTER_CODE + pCodeIdRef1~5=MASTER_CODE_REF1~5)` | searchDetail | GetCodeDetailList + GetTbMcmCodeCategoryList | xfdl:303~321 |
| 6 | `fn_callBack` | `gfn_transaction` callback | strSvcId 2 분기 — search / searchDetail. **search 분기**: `ds_grdMain.set_rowposition(this.grd_row)` + `ds_grdMain.set_enableevent(true)` + 정상 시 `gfn_commonBottomStatus_msg(strErrorMsg["ds_GetCodeMasterList"] + "건 조회 되었습니다.")` (xfdl:331~335) **searchDetail 분기**: `ds_grdDetail.set_rowposition(this.grd_row)` + 정상 시 `ds_lovCategoryId.insertRow(0)` + CATEGORY_ID="" / CATEGORY_NM="전체" + `cbo_categoryId.set_index(0)` + `stc_master.set_text(MASTER_CODE)` + `gfn_commonBottomStatus_msg(strErrorMsg["ds_GetCodeDetailList"] + "건 조회 되었습니다.")` (xfdl:338~349) | (콜백 분기) | (sqlKey 결과 처리) | xfdl:324~352 |
| 7 | `div_main_div2_cbo_categoryId_onitemchanged` | FX-002 onitemchanged | `ds_grdDetail.reset()` + `ds_grdDetail.filter(gfn_isNull(sCategoryId) ? "" : "CATEGORY_ID == '"+sCategoryId+"'")` — null 이면 필터 제거 | - | - | xfdl:355~360 |
| 8 | `div_main_div1_grd_main_oncellclick` | G grid oncellclick | (1) `this.rowpo == e.row` 가드 코드 주석 처리 (xfdl:365) (2) row != -1 + rowType != 2 (신규 아님) → `ds_grdDetail.filter("")` + `fn_searchDetail()` 호출 + `ds_grdMain.reset()` + `ds_grdMain.set_rowposition(e.row)` + `grd_main.setFocus()` + `grd_main.setCellPos(e.col, e.row)` (3) 그 외 → `ds_grdDetail.clearData()` + `ds_lovCategoryId.clearData()` (4) `this.rowpo = ds_grdMain.rowposition` 마지막 라인 기록 | searchDetail (간접) | (fn_searchDetail 의 sqlKey 그대로) | xfdl:363~378 |
| 9 | `btn_fold_onclick` | B-001 | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:381~384 |
| 10 | `fn_excelDown` | (외부 등록 — `fn_button` 에서 commonRightButton 의 기본 btn_excelDown 으로 매핑) | `gfn_exportExcel(grd_main, titletext)` | - | - | xfdl:387~390 |
| 11 | `div_main_div2_btn_excelDown_onclick` | B-002 | `ds_grdMain.rowposition == -1` → return / 그 외 → 헤더 array 준비 (`["마스터코드 : "+MASTER_CODE]`) + `gfn_exportExcel(grd_detail, titletext, objAry)` | - | - | xfdl:393~401 |
| 12 | `div_main_div1_grd_main_onheadclick` | G grid onheadclick | `gfn_commonOnheadclick(obj, e)` | - | - | xfdl:404~407 |
| 13 | `div_main_div2_grd_detail_onheadclick` | GE grid onheadclick | `gfn_commonOnheadclick(obj, e)` | - | - | xfdl:410~413 |

> 메서드 총수 = 13 (xfdl Script 의 `this.X = function`/`this.X_onclick = function` 모두 전수). masterCodeMng 의 28 메서드 대비 약 절반 — 등록/수정/삭제 메서드 부재 (조회 전용).
> **참고**: `div_search_edtDpNm_onkeydown` (S-001 / S-002 의 onkeydown 핸들러) 은 xfdl 본문에 함수 정의 ✗ — 외부 공통 함수 또는 다른 화면에서 inherit 되는 것으로 추정 (Enter 키 → 조회 트리거 일 가능성, masterCodeMng 에도 동명 핸들러 등재되어 동일 패턴).

---

## §5. 팝업 P-NNN

해당 없음 — xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 결과 0 회. 본 화면은 외부 팝업을 호출하지 않으며, 다른 화면에서 본 화면을 팝업으로 호출하는 흔적도 mui 자료 내에서 식별되지 않음.

| ID | 유형 | 이름 | 호출 위치 | 비고 |
|---|---|---|---|---|
| - | - | - | - | (해당 없음) |

---

## §6. SQL ID 매트릭스 (Mapper.xml 4 SQL 전수 — As-Is 3 호출 + 1 미사용)

> Mapper.xml namespace = `MasterCodeMngListMapper` (mapper:5). 본 표는 4 SQL 모두 전수 — As-Is 1:1 보존. **As-Is 미호출 1 SQL** (`GetCodeMasterAllList`) 은 BPMN 에도 등재되어 있지 않으며 (BPMN sqlKey grep 0 hit), xfdl 의 `sOutDatasets` 인자에서도 호출 ✗ — Mapper.xml 잔존 자산.

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `GetCodeMasterList` | select | `pCodeId` / `pCodeNm` (Map) | List<Map> (CODE_ID, CODE_NM, CODE_DESC, CODE_VER, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, CODE_OWNER_DEPT_NM, CODE_OWNER_EMP_NO, CODE_CHARACTER, MASTER_CODE, MASTER_CODE_REF1~5, MASTER_CODE_REF1_NM~5_NM — 21 컬럼) | `MCMAPUSER.TB_MCM_CODE_MASTER MAIN` + 5 회 scalar subquery `MCMAPUSER.TB_MCM_CODE_MASTER SUB` (각 SUB.CODE_ID = MAIN.MASTER_CODE_REF{N}) | `<where>` + `MAIN.CODE_ID LIKE '%' \|\| #{pCodeId} \|\| '%' OR MAIN.MASTER_CODE LIKE '%' \|\| #{pCodeId} \|\| '%'` (xml:32) + `UPPER(MAIN.CODE_NM) LIKE UPPER('%' \|\| #{pCodeNm} \|\| '%')` (xml:35) / ORDER BY MAIN.CODE_ID | `\|\|` 문자열 결합 + scalar subquery 5 회 + 스키마 prefix `MCMAPUSER.` (synonym 미사용 — masterCodeMng 의 `MCM_SOURCE.` 와 다름) | Task_2 (Main조회), bpmn:11~25 | Y | xml:7~39 |
| 2 | `GetCodeMasterAllList` | select | (없음) | List<Map> (CODE_ID — 1 컬럼) | `MCMAPUSER.TB_MCM_CODE_MASTER` | (없음) | 스키마 prefix `MCMAPUSER.` | (없음 — BPMN task 등재 ✗) | **N — To-Be 제거** (As-Is BPMN/xfdl 모두 미호출. Mapper.xml 잔존 — As-Is 미사용 → To-Be 이전 ✗) | xml:41~44 |
| 3 | `GetCodeDetailList` | select | `pCodeId` (=MASTER_CODE) / `pCodeIdRef1~5` (=MASTER_CODE_REF1~5 — 외부 RefN_MN scalar subquery 의 SUB.MASTER_CODE 결정용) | List<Map> (MASTER_CODE, CATEGORY_ID, CATEGORY_NM(scalar subquery), SORT_SEQ, MASTER_CODE(중복 — As-Is 그대로 보존, xml:54), CODE_VAL, CODE_VAL_MEAN, CODE_VAL_DESC, CODE_VER, CODE_VAL_REF1_MN~5_MN (scalar subquery + NVL fallback) — 14 컬럼) | `MCMAPUSER.TB_MCM_CODE_DETAIL CDETAIL` + 1 회 scalar subquery `MCMAPUSER.TB_MCM_CODE_CATEGORY` (CATEGORY_NM) + 5 회 nested scalar subquery `MCMAPUSER.TB_MCM_CODE_DETAIL SUB` (CATEGORY_ID='SZ0000' AND SUB.CODE_VAL = CDETAIL.CODE_VAL_REF{N}) — 각 SUB.MASTER_CODE 는 다시 (SELECT MAST.MASTER_CODE FROM TB_MCM_CODE_MASTER MAST WHERE MAST.CODE_ID = #{pCodeIdRef{N}}) | `<where>` + `CDETAIL.MASTER_CODE = #{pCodeId}` (xml:97) / ORDER BY CDETAIL.SORT_SEQ | scalar subquery 깊이 2 + NVL fallback + `CATEGORY_ID = 'SZ0000'` 하드코딩 (5회 — xml:64, 71, 78, 85, 92) | Task_1uvph9e (Detail조회), bpmn:36~49 | Y | xml:46~101 |
| 4 | `GetTbMcmCodeCategoryList` | select | `pCodeId` (=MASTER_CODE) | List<Map> (CATEGORY_ID, CATEGORY_NM — 2 컬럼) | `MCMAPUSER.TB_MCM_CODE_CATEGORY` | `WHERE MASTER_CODE = #{pCodeId}` | - | Task_0zyza07 (Category조회), bpmn:51~64 | Y | xml:103~108 |

> **SQL 정합 요약 (As-Is)**: Mapper.xml 4 SQL 등재 ↔ 실 호출 3 SQL ✓ + 미사용 1 SQL (`GetCodeMasterAllList`).
>
> **To-Be 적용**: As-Is 미사용 1 SQL 은 To-Be Mapper 에서 제거. 활성 SQL 3 개만 이전 (Master 조회 + Detail 조회 + Category 조회).

---

## §7. Java 트랜잭션 (UserTask)

해당 없음 — 본 화면은 등록/수정/삭제 기능이 없는 **조회 전용** 화면으로 Java UserTask 부재. `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/cma/` 하위 4 폴더 (MasterCodeMng / MasterCategoryMng / MasterCategoryPop / MasterCodeUploadFilePopup) 중 `MasterCodeMngList` 부재 — Bash `ls` 검증 완료.

BPMN 의 3 Task 는 모두 `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` 사용 (bpmn:15 / 39 / 53) — OASIS 표준 조회 task 로 별도 Java 클래스 작성 불필요.

| 항목 | 값 |
|---|---|
| As-Is Java UserTask | 0 개 |
| To-Be Java UserTask | 0 개 |
| 비고 | 조회 전용 화면 — BPMN commonDbTask 만으로 충족 |

---

## §8. BPMN 워크플로우 전수 (`MasterCodeMngList.bpmn`)

> bpmn2:process id="MasterCodeMngList" name="detailSave&#10;" isExecutable="false" (bpmn:3). process name 의 "detailSave" 는 As-Is 잔존 (실제 본 화면은 detailSave 가 아닌 단순 조회) — 명칭 As-Is 그대로 보존.

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / Task)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | SequenceFlow_0xwr48s / SequenceFlow_0vevv59 | - | bpmn:7~10 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (없음) | - | SequenceFlow_1 | 2 outgoing — SequenceFlow_0grwghu (search) / SequenceFlow_02ocl0p (searchDetail) | bpmn:26~33 |
| Task_2 | task | Main조회 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`, sqlKey=`#{serviceId}Mapper.GetCodeMasterList`, resultKey=`ds_GetCodeMasterList`, isServiceResult=true, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` | SequenceFlow_0grwghu | SequenceFlow_0xwr48s (→ End) | bpmn:11~25 |
| Task_0zyza07 | task | Category조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.GetTbMcmCodeCategoryList`, resultKey=`ds_GetTbMcmCodeCategoryList`, isServiceResult=true | SequenceFlow_02ocl0p | SequenceFlow_0av6mvx | bpmn:51~64 |
| Task_1uvph9e | task | Detail조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.GetCodeDetailList`, resultKey=`ds_GetCodeDetailList`, isServiceResult=true | SequenceFlow_0av6mvx | SequenceFlow_0vevv59 (→ End) | bpmn:36~49 |

### §8.2 SequenceFlow 전수 (총 6 개)

| sequenceFlow id | name (action 분기) | sourceRef | targetRef | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:34 |
| SequenceFlow_0grwghu | **search** | ExclusiveGateway_1 | Task_2 | bpmn:35 |
| SequenceFlow_02ocl0p | **searchDetail** | ExclusiveGateway_1 | Task_0zyza07 | bpmn:50 |
| SequenceFlow_0av6mvx | - | Task_0zyza07 | Task_1uvph9e | bpmn:65 |
| SequenceFlow_0xwr48s | - | Task_2 | EndEvent_1 | bpmn:66 |
| SequenceFlow_0vevv59 | - | Task_1uvph9e | EndEvent_1 | bpmn:67 |

### §8.3 action 2 분기 — 흐름 요약

| action | 분기 sequenceFlow | 흐름 (전체) |
|---|---|---|
| search | SequenceFlow_0grwghu | Start → Gateway → Task_2 (Main조회 / GetCodeMasterList) → End |
| searchDetail | SequenceFlow_02ocl0p | Start → Gateway → Task_0zyza07 (Category조회 / GetTbMcmCodeCategoryList) → Task_1uvph9e (Detail조회 / GetCodeDetailList) → End |

> BPMN node 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 3 (CommonSelectTask 3) + UserTask 0 = 6 노드. SequenceFlow 6 개.
> **masterCodeMng 와의 차이점**: (1) action 2 개 (masterCodeMng 6 개 대비 단순) — save/saveDetail/delete/deleteDetail 미포함. (2) UserTask 0 개 (masterCodeMng 2 개 대비) — Java 트랜잭션 없음. (3) searchDetail 흐름에서 `GetCodeDetailRef1~5List` 5 task 미포함 — Ref1~5 의 코드명은 본 화면의 `GetCodeDetailList` SQL 내부에서 scalar subquery 로 직접 합쳐서 반환 (CODE_VAL_REF1_MN~5_MN). (4) search 흐름에서 `GetCodeMasterAllList` 후속 task 미포함 — 본 화면은 Master 그리드의 참조1~5 콤보가 없으므로 마스터 전체 LoV 불필요.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + DMES Excel + To-Be cactus-core 통합)

> **스키마 정본 (DMES Excel 기준)** = `MCMAPUSER.TB_MCM_CODE_*` (Excel sheet34/36/39 의 Table 명 행 — masterCodeMng 분석리포트 §9 인용). **본 화면은 Mapper.xml 에서 `MCMAPUSER.` 를 직접 사용** (xml:24 / 29 / 43 / 50 / 60 / 67 / 74 / 81 / 88 / 94 / 106) — masterCodeMng 의 `MCM_SOURCE.` synonym 과 다름.
>
> **To-Be 정책 (사용자 결정 누적 반영, masterCodeMng 와 공유)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`MCMAPUSER.TB_MCM_CODE_MASTER` / `TB_MCM_CODE_DETAIL` / `TB_MCM_CODE_CATEGORY`)
> - **audit 컬럼**: cactus-core `CactusAuditEntity` 9 컬럼 통일 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). **본 화면은 SELECT 만 사용** 이므로 audit 컬럼은 단순 SELECT 가능 — INSERT/UPDATE 자동 채움 영향 ✗.
> - **본 컬럼**: As-Is 1:1 보존

### §9.1 `TB_MCM_CODE_MASTER` (마스터 코드) — 본 화면에서 SELECT 만 사용

> 본 화면은 `GetCodeMasterList` SELECT 만 수행. INSERT/UPDATE/DELETE ✗. 본 화면 SQL 에 출현하는 컬럼만 등재 (전수 33 컬럼 카탈로그는 masterCodeMng 분석리포트 §9.1 참조).

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | CODE_ID | GetCodeMasterList SELECT (xml:8) + WHERE LIKE (xml:32 — `MAIN.CODE_ID LIKE`) + 5 scalar subquery WHERE (xml:24~28 — `SUB.CODE_ID = MAIN.MASTER_CODE_REF{N}`) / GetCodeMasterAllList SELECT (xml:42) | PK | xfdl G-002 / DS-001 / DS-005 | xml:8 / 32 |
| 2 | CODE_NM | GetCodeMasterList SELECT (xml:9) + scalar subquery SELECT (xml:24~28 — `SELECT SUB.CODE_NM ...`) + WHERE LIKE (xml:35) / GetCodeMasterAllList (xml:42 ✗ — 본 SQL 은 CODE_ID 만 SELECT) | - | xfdl G-003 / scalar subquery 결과는 MASTER_CODE_REF{N}_NM alias 로 노출 | xml:9 / 35 |
| 3 | CODE_DESC | GetCodeMasterList SELECT (xml:10) | - | xfdl G-004 (설명) | xml:10 |
| 4 | CODE_VER | GetCodeMasterList SELECT (xml:11) | - | xfdl ds_grdMain (히든) | xml:11 |
| 5 | USE_TP | GetCodeMasterList SELECT (xml:12) | - | xfdl G-011 (사용여부, Y/N) | xml:12 |
| 6 | START_ACTIVE_DATE | GetCodeMasterList SELECT (xml:13) | - | (조회만) | xml:13 |
| 7 | END_ACTIVE_DATE | GetCodeMasterList SELECT (xml:14) | - | (조회만) | xml:14 |
| 8 | CODE_OWNER_DEPT_NM | GetCodeMasterList SELECT (xml:15) | - | (조회만 — 화면 표시 ✗ but dataset 보유) | xml:15 |
| 9 | CODE_OWNER_EMP_NO | GetCodeMasterList SELECT (xml:16) | - | (동일) | xml:16 |
| 10 | CODE_CHARACTER | GetCodeMasterList SELECT (xml:17) | - | (동일) | xml:17 |
| 11 | MASTER_CODE | GetCodeMasterList SELECT (xml:18) + WHERE LIKE `MAIN.MASTER_CODE LIKE '%' \|\| #{pCodeId} \|\| '%'` (xml:32, CODE_ID 와 동일 검색어 OR 조건) | - | xfdl G-005 (마스터코드) — Detail 의 외래키 대상 | xml:18 / 32 |
| 12 | MASTER_CODE_REF1 | GetCodeMasterList SELECT (xml:19) + scalar subquery (xml:24, `SUB.CODE_ID = MAIN.MASTER_CODE_REF1`) | - | xfdl DS-001 (히든) / `MASTER_CODE_REF1_NM` alias 가 G-006 에 binding | xml:19 / 24 |
| 13 | MASTER_CODE_REF2 | xml:20 / 25 | - | (동일 — G-007) | xml:20 |
| 14 | MASTER_CODE_REF3 | xml:21 / 26 | - | (동일 — G-008) | xml:21 |
| 15 | MASTER_CODE_REF4 | xml:22 / 27 | - | (동일 — G-009) | xml:22 |
| 16 | MASTER_CODE_REF5 | xml:23 / 28 | - | (동일 — G-010) | xml:23 |

### §9.2 `TB_MCM_CODE_DETAIL` (상세 코드) — 본 화면에서 SELECT 만 사용

> 본 화면은 `GetCodeDetailList` SELECT 만 수행. INSERT/UPDATE/DELETE ✗.

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MASTER_CODE | GetCodeDetailList SELECT (xml:47, 54 — 중복 SELECT 보존) + WHERE `CDETAIL.MASTER_CODE = #{pCodeId}` (xml:97) + nested scalar subquery 5 회 `SUB.MASTER_CODE = (SELECT MAST.MASTER_CODE ... )` (xml:61 / 68 / 75 / 82 / 89) | PK (3 컬럼 복합) | xfdl GE 영역 표시 ✗ — Detail 자체의 MASTER_CODE 컬럼 | xml:47 / 54 / 97 |
| 2 | CATEGORY_ID | GetCodeDetailList SELECT (xml:48) + scalar subquery WHERE (xml:51, `WHERE CATEGORY_ID = CDETAIL.CATEGORY_ID`) + nested scalar subquery WHERE `SUB.CATEGORY_ID = 'SZ0000'` (xml:64 / 71 / 78 / 85 / 92) | PK (3 컬럼 복합) | xfdl GE-004 / FX-002 (cbo_categoryId) | xml:48 |
| 3 | CATEGORY_NM | GetCodeDetailList scalar subquery alias (xml:49~52 — `TB_MCM_CODE_CATEGORY` 조인 `WHERE CATEGORY_ID = CDETAIL.CATEGORY_ID AND MASTER_CODE = CDETAIL.MASTER_CODE`) | - | xfdl GE-005 / FX-002 의 표시명 | xml:49~52 |
| 4 | SORT_SEQ | GetCodeDetailList SELECT (xml:53) + ORDER BY (xml:100) | - | xfdl GE-006 (정렬순서, mask 자료형) | xml:53 / 100 |
| 5 | CODE_VAL | GetCodeDetailList SELECT (xml:55) + nested scalar subquery `SUB.CODE_VAL = CDETAIL.CODE_VAL_REF{N}` (xml:65 / 72 / 79 / 86 / 93) | PK (3 컬럼 복합) | xfdl GE-002 (코드 값, CellEssentail) | xml:55 |
| 6 | CODE_VAL_MEAN | GetCodeDetailList SELECT (xml:56) + nested scalar subquery SELECT `SUB.CODE_VAL_MEAN` (xml:59 / 66 / 73 / 80 / 87) | - | xfdl GE-003 (의미, CellEssentail) | xml:56 |
| 7 | CODE_VAL_DESC | GetCodeDetailList SELECT (xml:57) | - | xfdl GE-007 (설명) | xml:57 |
| 8 | CODE_VER | GetCodeDetailList SELECT (xml:58) | - | xfdl ds_grdDetail (히든) | xml:58 |
| 9 | CODE_VAL_REF1 | GetCodeDetailList nested scalar subquery WHERE `SUB.CODE_VAL = CDETAIL.CODE_VAL_REF1` (xml:65) + NVL fallback (xml:65 — `NVL((subquery), CDETAIL.CODE_VAL_REF1)`) — alias `CODE_VAL_REF1_MN` | - | xfdl GE-008 (참조1) `bind:CODE_VAL_REF1_MN` | xml:65 |
| 10 | CODE_VAL_REF2 | xml:72 / NVL fallback / alias `CODE_VAL_REF2_MN` | - | xfdl GE-009 (참조2) | xml:72 |
| 11 | CODE_VAL_REF3 | xml:79 / alias `CODE_VAL_REF3_MN` | - | xfdl GE-010 (참조3) | xml:79 |
| 12 | CODE_VAL_REF4 | xml:86 / alias `CODE_VAL_REF4_MN` | - | xfdl GE-011 (참조4) | xml:86 |
| 13 | CODE_VAL_REF5 | xml:93 / alias `CODE_VAL_REF5_MN` | - | xfdl GE-012 (참조5) | xml:93 |

### §9.3 `TB_MCM_CODE_CATEGORY` (카테고리) — 본 화면에서 SELECT 만 사용

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 | 근거 |
|---:|---|---|---|---|---|
| 1 | MASTER_CODE | GetTbMcmCodeCategoryList WHERE (xml:107) + GetCodeDetailList scalar subquery WHERE (xml:52, `MASTER_CODE = CDETAIL.MASTER_CODE`) + nested scalar subquery `MAST.CODE_ID = #{pCodeIdRef{N}}` 의 `MAST.MASTER_CODE` 반환 (xml:62 / 69 / 76 / 83 / 90) | PK 후보 (CATEGORY_ID 와 복합) | - | xml:107 / 52 |
| 2 | CATEGORY_ID | GetTbMcmCodeCategoryList SELECT (xml:104) + GetCodeDetailList scalar subquery WHERE (xml:51) | PK 후보 | xfdl FX-002 codecolumn | xml:104 / 51 |
| 3 | CATEGORY_NM | GetTbMcmCodeCategoryList SELECT (xml:105) + GetCodeDetailList scalar subquery 반환 (xml:49) | - | xfdl FX-002 datacolumn / GE-005 | xml:105 / 49 |

> **§9 결론**: 본 화면은 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY) 의 **SELECT** 만 수행. INSERT/UPDATE/DELETE 0 회 → audit 컬럼 (cactus-core) 자동 채움 영향 ✗. cactus-core `VER` (Optimistic Locking) 도 SELECT 에서는 영향 없음.

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 (S/G/GE/FX) | 비고 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | (xfdl 정적 Dataset `ds_chkYn`) | Y / N | Y / N | G-011 (사용여부) | DB 호출 ✗ — xfdl 내 hardcoded 2 행 | xfdl:210~225 |
| LV-002 | TB_MCM_CODE_CATEGORY (선택 Master 의 CATEGORY) → `ds_lovCategoryId` | CATEGORY_ID / CATEGORY_NM | (DB 값 그대로) + "" / "전체" 행 prepend (xfdl:341~344) | FX-002 (`cbo_categoryId`) | `GetTbMcmCodeCategoryList` 결과 | xfdl:204~209 / 341 / xml:103 |
| LV-003 | TB_MCM_CODE_DETAIL Ref1~5 → SQL 내부 scalar subquery (DB 호출 ✗ 별도 LoV 콤보) | CODE_VAL_REF{N}_MN (`SUB.CODE_VAL_MEAN` from `MASTER_CODE = (SELECT MASTER_CODE WHERE CODE_ID = #{pCodeIdRef{N}}) AND CATEGORY_ID = 'SZ0000' AND CODE_VAL = CDETAIL.CODE_VAL_REF{N}`) + NVL fallback (subquery null 시 원래 `CDETAIL.CODE_VAL_REF{N}` 표시) | (DB 값 그대로 — 변환된 의미 또는 원본 값) | GE-008 ~ GE-012 (참조1~5, body bind) | `GetCodeDetailList` SQL 내 nested scalar subquery (xml:59~94, 5회) — 별도 LoV 조회 ✗ | xml:59~94 / xfdl:139~143 |
| LV-004 | TB_MCM_CODE_MASTER 전체 → `ds_grdMainAll` | CODE_ID | (조회 ✗ — As-Is xfdl/BPMN 에서 미호출) | (없음 — DS-005 잔존만, sOutDatasets 에 등재 ✗) | `GetCodeMasterAllList` Mapper 등재 + BPMN/xfdl 미호출 → To-Be 제거 | xfdl:226~230 / xml:41 |

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-011 (그리드 콤보 — combodataset=ds_chkYn) | xfdl:81 / xml:12 |
| ST-002 | `CODE_VER` | 코드 버전 (조회 결과 표시) | DS-001 / DS-002 (히든) | xml:11 / 58 |
| ST-003 | `ds_grdMain.getRowType(currow) == 2` (신규 행) | 그리드 row 상태 (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | G grid oncellclick 의 `e.row != -1 && rowType != 2` 분기 (xfdl:366) — 본 화면은 조회만이지만 As-Is 코드에 잔존. 실제 본 화면에서 신규 행은 발생할 수 없음 (행추가 버튼 ✗) — 잔존 가드 | xfdl:366 |
| ST-004 | `ds_grdDetail.CHK` | (DS-002 에 정의됨, xfdl:196) | (xfdl Script 에서 CHK 토글/세트 0 회 — 미사용 잔존 컬럼) | xfdl:196 |

> **masterCodeMng 와의 비교**: ST-004 `CHK` 컬럼은 DS-002 에 정의되어 있으나 본 화면의 xfdl Script 에 CHK 변경 / 토글 / 세트 로직 ✗ — masterCodeMng 의 oncolumnchanged 자동 세트 / onheadclick 전체 토글 / saveDetail validation 호출 등 일체 부재. **잔존 컬럼**. ST-005 (Nexacro auto STATUS) / ST-006 (USER_DEFINE 분기) 도 본 화면에 부재 — 등록/수정 기능이 없어 적용 대상 자체가 없음.

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (스키마 prefix `MCMAPUSER.` 직접 — masterCodeMng 의 synonym `MCM_SOURCE.` 와 다름). To-Be = MSSQL (사용자 명시 `sample_dmes` DB / `MCMAPUSER` 계정).
>
> **To-Be 결정 (사용자 결정 누적 반영, masterCodeMng 와 공유)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`MCMAPUSER.TB_MCM_CODE_MASTER` / `TB_MCM_CODE_DETAIL` / `TB_MCM_CODE_CATEGORY`)
> - **moduleGroup**: ASIS `cma` → To-Be `cme` 신규 그룹 이동 (사용자 결정 — §0 환경 제약 참조)
> - **미사용 SQL** (`GetCodeMasterAllList`): To-Be 제거 (As-Is BPMN/xfdl 미호출 — Mapper 잔존 자산)

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `\|\|` 문자열 결합 | xml:32 (`LIKE '%' \|\| #{pCodeId} \|\| '%'`), xml:35 (UPPER 결합) | MSSQL `+` 연산자 또는 `CONCAT(...)` — `LIKE '%' + #{pCodeId} + '%'` (또는 `CONCAT('%', #{pCodeId}, '%')`) | GetCodeMasterList | - |
| 2 | `UPPER(...)` | xml:35 (`UPPER(MAIN.CODE_NM) LIKE UPPER('%' \|\| #{pCodeNm} \|\| '%')`) | MSSQL `UPPER(...)` 동일 (또는 컬럼 collation 으로 case-insensitive 처리 가능) | GetCodeMasterList | - |
| 3 | 스키마 prefix `MCMAPUSER.` | xml 전체 (xml:24, 25, 26, 27, 28, 29, 43, 50, 60, 67, 74, 81, 88, 94, 106) — 모든 테이블 reference | **To-Be**: `MCMAPUSER.TB_MCM_CODE_*` 그대로 보존 (사용자 결정). MSSQL `sample_dmes` DB 의 `MCMAPUSER` 스키마 | 모든 SQL | masterCodeMng 의 `MCM_SOURCE.` synonym 대비 본 화면은 As-Is 부터 `MCMAPUSER.` 직접 — 별도 변환 ✗ |
| 4 | scalar subquery in SELECT | xml:24~28 (5회 — MASTER_CODE_REF{N}_NM), xml:49~52 (CATEGORY_NM), xml:59~94 (Detail 의 CODE_VAL_REF{N}_MN 5회) | MSSQL 동일 지원 | GetCodeMasterList / GetCodeDetailList | - |
| 5 | `(SELECT MAST.MASTER_CODE FROM ... WHERE MAST.CODE_ID = #{pCodeIdRef{N}})` nested scalar subquery in WHERE | xml:61~63 / 68~70 / 75~77 / 82~84 / 89~91 (5회 — Ref1~5) | MSSQL 동일 지원 | GetCodeDetailList | - |
| 6 | `NVL(subquery, fallback)` | xml:59 / 66 / 73 / 80 / 87 (5회 — `NVL((SELECT ... ), CDETAIL.CODE_VAL_REF{N})`) | MSSQL `ISNULL(...)` 또는 `COALESCE(...)` | GetCodeDetailList | - |
| 7 | `'SZ0000'` 카테고리 하드코딩 | xml:64 / 71 / 78 / 85 / 92 (5회) | (DBMS 무관 — 하드코딩 그대로) | GetCodeDetailList | masterCodeMng 와 동일 결정 — As-Is 보존 |
| 8 | MyBatis `<if>` dynamic SQL + Map 파라미터 | xml:31~34 / 96~98 | MSSQL 동일 지원 (MyBatis 레벨, DBMS 무관) | GetCodeMasterList / GetCodeDetailList | - |
| 9 | `ROWNUM` / `(+)` outer join / `DECODE` / `MERGE INTO` / `SYSDATE` / `TO_DATE` / `FROM DUAL` Oracle 전용 문법 | (해당 없음 — 본 화면 SQL 전수 grep 결과 7 종 모두 0 회) | - | - | 본 화면은 SELECT 만 — INSERT/UPDATE/MERGE 부재로 SYSDATE/TO_DATE/FROM DUAL 영향 ✗ |
| 10 | `ref_Audit` fragment include | (해당 없음 — 본 화면 4 SQL 모두 SELECT) | (해당 없음) | (모든 SQL) | masterCodeMng 의 ref_Audit → cactus-core 변환은 본 화면에 직접 영향 ✗ |
| 11 | **정책 #6 (A) csa 신규 Entity 명명 = As-Is 직역** (SecUser/SecObj/SecRole 등 — 기존 mcm-core 와 패키지 다름 공존) | (해당 없음 — 본 화면 cme 그룹, csa 가 아님) | (해당 없음) | (해당 없음) | mcm 전체 cross-cutting 정책. 본 화면 cme 그룹은 직접 영향 ✗ — 본 행은 기록 목적 (2026-05-31 6 정책 결정 일괄 반영) |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be |
|---|---|---|
| 마스터 테이블 | `MCMAPUSER.TB_MCM_CODE_MASTER` | `MCMAPUSER.TB_MCM_CODE_MASTER` (동일 — 변환 ✗) |
| 상세 테이블 | `MCMAPUSER.TB_MCM_CODE_DETAIL` | `MCMAPUSER.TB_MCM_CODE_DETAIL` (동일) |
| 카테고리 테이블 | `MCMAPUSER.TB_MCM_CODE_CATEGORY` | `MCMAPUSER.TB_MCM_CODE_CATEGORY` (동일) |
| moduleGroup (산출물) | (xfdl 폴더 `cma`) | `cme` (사용자 결정 — Master/업무기준(가동) 신규 그룹) |
| 메뉴 계층 | (As-Is Portal) | 공통관리 (mcm) > Master/업무기준(가동) (cme) > Master Code 상세조회 (masterCodeMngList) |
| Java 패키지 | (해당 없음 — UserTask 0 개) | Service·DTO = `com.dongkuk.dmes.mcm.cme.masterCodeMngList.{service,dto}.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` (모듈 단위 평탄 — masterCodeMng 와 공유 / RULE.md §"패키지 명명 규칙" §3-1) |
| Mapper namespace | `MasterCodeMngListMapper` | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.MasterCode*Repository` (native query — 본 화면의 4 SQL 은 모두 SELECT 로 Service 의 query method 로 흡수 가능). Mapper.xml.asis 는 보존 |
| BPMN process id | `MasterCodeMngList` | `masterCodeMngList` (2-토큰 lowercase 시작) |

> 사용자 결정: As-Is 테이블명 (대문자 prefix) + `MCMAPUSER` 스키마 그대로 보존. moduleGroup 만 cma → cme 변경. Service/DTO/FE 는 cme 그룹 하위로 배치. 본 화면은 SELECT 전용 — entity 는 masterCodeMng 와 공유.

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 활성 확인필요 = **0 건**. 결정 내용은 §6 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **moduleGroup 이동** | ASIS `cma` (Master 관리(원장)) → To-Be `cme` (Master/업무기준(가동)) 신규 그룹. 본 화면이 조회 전용 (상세조회) 이라 cme 의 "업무기준 조회" 성격에 부합 | §0 / §1 / §11.1 |
| **audit 컬럼 (cactus-core 적용)** | 본 화면은 SELECT 만 사용 — audit 자동 채움 영향 ✗. masterCodeMng 의 `ref_Audit` → cactus-core `CactusAuditEntity` 9 컬럼 통일 정책은 본 화면에 직접 영향 ✗ (entity 공유로 간접 적용만) | §9 / §11 #10 |
| **`SZ0000` 카테고리 하드코딩** | As-Is 그대로 보존 (Detail Ref1~5 의 nested scalar subquery 의 `CATEGORY_ID = 'SZ0000'` 유지) — masterCodeMng 와 동일 결정 | §6 #3 / §10 LV-003 |
| **스키마/테이블명** | As-Is `MCMAPUSER.TB_MCM_CODE_*` (synonym 미사용) → To-Be 그대로 보존 | §11 #3 / §11.1 |
| **`ds_grdMainAll` Dataset 잔존 + `GetCodeMasterAllList` SQL 잔존** | As-Is xfdl/BPMN 어디서도 미호출. To-Be 제거 결정 — Mapper.xml 잔존 SQL + DS-005 (DataSet 정의) 동시 제거 | §6 #2 / §10 LV-004 |
| **`ds_grdDetail.CHK` 컬럼 잔존 + `MASTER_CODE` 중복 SELECT (xml:54) 잔존** | As-Is xfdl/Mapper 그대로 보존. 본 화면 Script 에 CHK 변경/토글 로직 ✗ — read-only 화면의 잔존 컬럼. xml:54 의 중복 SELECT 도 As-Is 그대로. **To-Be**: CHK 컬럼은 DS-002 에서 제거 권고 (잔존 가드도 동시 제거). 본 분석에서는 As-Is 1:1 보존 + 제거 결정 §6 / §10 명시 | §10.1 ST-004 / §6 #3 |
| **`fn_search` 자동 호출 주석 (xfdl:266)** | As-Is xfdl 의 `fn_formAfterOnload` 에서 `this.fn_search();` 주석 처리됨 — 본 화면 진입 시 자동 조회 ✗. 사용자 btn_search 클릭 시점에만 조회. To-Be 동일 동작 (자동 조회 ✗) | §4.4 #2 |
| **`grd_main` cell `oncellclick` 의 rowType==2 가드** | As-Is xfdl:366 의 `rowType != 2` 분기는 본 화면에 신규 행이 발생할 수 없으므로 dead code. **As-Is 1:1 보존** + To-Be 단순화 (단순 `e.row != -1` 만으로 충분) | §10.1 ST-003 / §4.4 #8 |
| **`MASTER_CODE` 중복 SELECT (xml:47, 54)** | As-Is GetCodeDetailList 의 `CDETAIL.MASTER_CODE` 중복 SELECT 보존 — 결과 Map 의 key 충돌 가능 (마지막 쓰기가 이김). **As-Is 1:1 보존** | §6 #3 |
| **process name "detailSave" (bpmn:3)** | As-Is BPMN process name 이 "detailSave\n" 인데 실제 본 화면은 detailSave 가 아닌 단순 조회. As-Is 잔존 — To-Be 에서는 정정 권고 ("Master Code 상세조회" 또는 screenId 동일 `masterCodeMngList`) | §8 / §11.1 |
| **Java 패키지** | (해당 없음 — UserTask 0 개) | §11.1 (To-Be Service 패키지 명만 명시) |
| **권한 / 접근 제어** | To-Be 권한 프로세스 (외부 모델) 위임. 본 화면 자체 권한 분기 ✗ | 기능설계서 §8 |
| **동시성 / Optimistic Locking** | (조회 전용 — Optimistic Locking 영향 ✗) | - |
| **As-Is/To-Be 표준 우선 원칙 (cross-cutting 정책 #4 (0))** | As-Is 1:1 보존 우선 원칙은 To-Be 개발 표준 (cactus-core audit / MSSQL / JPA / schema 명시) 와 충돌 시 To-Be 우선 — 본 화면은 **SELECT 전용** + BIZ_SYSTEM_CODE/APPHOST/EAI 사용 ✗ → 직접 영향 ✗ (기록만) | §0 환경 제약 / §11 변환점 |
| **Entity 명명 As-Is 직역 (cross-cutting 정책 #6 (A))** | csa 화면들의 신규 Entity 명명 = As-Is 직역 (SecUser/SecObj/SecRole 등). 본 화면 cma 그룹 (entity는 masterCodeMng 와 공유 — MasterCode/MasterCodeDetail/MasterCodeCategory) 이라 직접 영향 ✗ — 기록만 | §11 변환점 / 정합 §F |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / Dataset 전수 등재 | §3.1~§3.7 행수 (영역 7 + S 2 + G 11 + GE 12 + FX 4 + 외부 3 + DS 5) = 44 행 + §4.4 메서드 13 행 + §4.1 버튼 2 행 + §5 팝업 (해당 없음) | ✓ |
| G-B: Mapper.xml 4 SQL 전수 | §6 표 4 행 (선언 4) — 호출 3 + 미사용 1 | ✓ |
| G-C: Java 메서드 전수 | (해당 없음 — UserTask 0) — §7 명시 | ✓ |
| G-D: BPMN flow 전수 | §8.1 (6 노드) + §8.2 (6 sequenceFlow) + §8.3 (2 action 흐름) | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: Q-NNN 활성 = 0 (사용자 결정 완료 — §12 결정 누적 표 참조) | §12 15 행 결정 누적표 (본 화면 결정 13 행 + cross-cutting 정책 #4/#6 기록 2 행) | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §12 누적표 명시 | xml:47/54 MASTER_CODE 중복 / xml:41 GetCodeMasterAllList 미호출 / xfdl:226 ds_grdMainAll 미호출 / xfdl:266 fn_search 주석 / xfdl:366 dead code 가드 — 분석 시 As-Is 1:1 인용 + To-Be 결정 별도 명시 | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑 / moduleGroup 이동) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 10 행 + §11.1 To-Be 명명 안 | ✓ |
| G-J: 정합체크서 §D.4 ✗ + 사유 | §0 표 + 정합체크서 §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성.

---

## §17. 컬럼 단위 1:1 전수 행 분해 (사용자 요구사항 §17.2 — As-Is 1:1 보존 최우선)

> 본 §17 은 사용자 요구사항 [3 누락 금지 / 5 분량 회피·요약화 금지] 에 따라 xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / Dataset 의 모든 cell-level 정의를 1:1 전수 행 분해한다. §3 의 표가 ID 단위 요약이라면 본 §17.2 는 **xfdl line 단위 raw 인용** 이다.

### §17.1 xfdl Form 메타 (헤더 + Form 속성)

| line | xfdl 원문 (요지) | 의미 / 본 화면 영향 |
|---:|---|---|
| 1 | `<?xml version="1.0" encoding="utf-8"?>` | XML 선언 |
| 2 | `<FDL version="2.1">` | Nexacro Forms Definition Language v2.1 |
| 3 | `<Form id="MasterCodeMngList" width="1280" height="670" titletext="Master Code 상세조회" onload="MasterCodeMngList_onload">` | Form id / 크기 / 타이틀 (한글) / onload 핸들러 |
| 4 | `<Layouts>` | (컨테이너) |
| 5 | `<Layout height="670" mobileorientation="landscape" width="1280">` | 기본 Layout — landscape 모바일 지원 |

### §17.2 xfdl Layout 내 모든 자식 컴포넌트 cell-level 전수 (xfdl:6~157)

> 본 §17.2 는 Layout 의 모든 자식을 1 행씩 분해한다. 각 행 = 1 xfdl 컴포넌트.

| # | line | 컴포넌트 종류 | id | 속성 (raw) | 역할 |
|---:|---:|---|---|---|---|
| 1 | 6 | Div (컨테이너) | div_title | taborder=0 / text="Div00" / left=20 / top=0 / height=50 / right=20 | 타이틀 영역 컨테이너 |
| 2 | 9 | Edit | edt_title | taborder=0 / readonly=true / tabstop=false / value="Master Code 상세조회" / text="Master Code 상세조회" / width=220 / cssclass=edi_WFHD_Title / left=0 / height=30 / bottom=10 | 타이틀 표시 (Edit readonly) |
| 3 | 10 | Div (포함된 url) | div_topMenu | taborder=1 / text="Div00" / width=600 / height=23 / right=0 / url=`_com_div::commonTopButton.xfdl` / bottom=10 | 공통 topMenu (btn_search 기본 등록) |
| 4 | 19 | Div (컨테이너) | div_search | taborder=1 / text="Div00" / left=20 / top=50 / height=43 / right=20 / cssclass=div_WFSA_Box | 조회조건 영역 |
| 5 | 22 | Static | stc_codeVal | taborder=1 / text="코드ID" / left=10 / top=10 / width=50 / height=20 / cssclass=stc_WFSA_Label | S-001 라벨 |
| 6 | 23 | Edit | edt_codeVal | taborder=0 / left=stc_codeVal:10 / top=10 / width=135 / height=20 / text="USD" / maxlength=0 / tooltiptype=hover / onkeydown=div_search_edtDpNm_onkeydown / inputmode=upper | S-001 입력 |
| 7 | 24 | Static | stc_codeValMean | taborder=2 / text="코드명" / left=edt_codeVal:20 / top=10 / width=50 / height=20 / cssclass=stc_WFSA_Label | S-002 라벨 |
| 8 | 25 | Edit | edt_codeNm | taborder=3 / left=stc_codeValMean:10 / top=10 / width=135 / height=20 / text="USD" / maxlength=0 / tooltiptype=hover / onkeydown=div_search_edtDpNm_onkeydown | S-002 입력 |
| 9 | 29 | Div (포함된 url) | div_bottom | taborder=2 / left=0 / height=20 / right=0 / bottom=0 / cssclass=div_WF_Footer / url=`_com_div::commonBottomStatus.xfdl` | 공통 bottom status |
| 10 | 30 | Button | btn_fold | taborder=3 / top=93 / height=15 / left=20 / right=20 / cssclass=btn_WFSA_Fold / text="" / onclick=btn_fold_onclick | B-001 접기 토글 |
| 11 | 31 | Div (컨테이너) | div_main | taborder=4 / left=20 / top=113 / bottom=30 / text="" / right=20 | 메인 컨테이너 (좌우 분할) |
| 12 | 34 | Div (컨테이너) | div1 (A-MAIN-LEFT) | taborder=1 / left=0 / top=0 / bottom=0 / right=51.61% | Master 그리드 컨테이너 |
| 13 | 37 | Grid | grd_main | taborder=0 / left=0 / top=25 / right=0 / cellmovingtype=col / cellsizingtype=col / binddataset=ds_grdMain / bottom=0 / oncellclick=div_main_div1_grd_main_oncellclick / selecttype=cell / autoenter=select / onheadclick=div_main_div1_grd_main_onheadclick | Master 그리드 (G-NNN) |
| 14 | 38~84 | Grid Format/Columns/Rows/Bands | (grd_main 내부) | 11 Column size [30/120×9/55] + head Row 1 (25px) + body Row 1 (25px) + Band head 11 cell (NO/코드ID/코드명/설명/마스터코드/참조1~5/사용여부) + Band body 11 cell (currow+1/CODE_ID/CODE_NM/CODE_DESC/MASTER_CODE/MASTER_CODE_REF1_NM~5_NM/USE_TP) | (G-001~G-011 정의) |
| 15 | 86 | Div (포함된 url) | div_rightMenu | taborder=1 / text="" / top=0 / height=20 / font=12px / url=`_com_div::commonRightButton.xfdl` / tabstop=false / right=0 / left=0 / visible=false | FX-004 공통 우측 메뉴 (숨김) |
| 16 | 90 | Div (컨테이너) | div2 (A-MAIN-RIGHT) | taborder=0 / left=49.19% / top=0 / bottom=0 / text="" / right=0 | Detail 그리드 컨테이너 |
| 17 | 93 | Grid | grd_detail | taborder=0 / left=0 / top=25 / right=0 / autofittype=col / cellmovingtype=col / cellsizingtype=col / bottom=0 / autoenter=select / binddataset=ds_grdDetail / onheadclick=div_main_div2_grd_detail_onheadclick / selecttype=multiarea | Detail 그리드 (GE-NNN) |
| 18 | 94~146 | Grid Format/Columns/Rows/Bands | (grd_detail 내부) | 12 Column size [30/48/80/48/80/30/120/48×5] + head Row 2 (25px×2) + body Row 1 (25px) + Band head row 0: 11 cell (NO rowspan=2 / 코드 colspan=2 / 카테고리 colspan=2 / 정렬\\r\\n순서 rowspan=2 / 설명 rowspan=2 / 참조1~5 rowspan=2) + head row 1: 4 cell (값 CellEssentail / 의미 CellEssentail / ID CellEssentail / 명) + Band body 12 cell (currow+1/CODE_VAL/CODE_VAL_MEAN/CATEGORY_ID/CATEGORY_NM/SORT_SEQ/CODE_VAL_DESC/CODE_VAL_REF1_MN~5_MN) | (GE-001~GE-012 정의) |
| 19 | 148 | Button | btn_excelDown | taborder=1 / top=0 / height=20 / cssclass=btn_WF_ExcelDown / text="Export" / textPadding="0px 0px 0px 5px" / right=0 / width=64 / onclick=div_main_div2_btn_excelDown_onclick | B-002 Detail Export |
| 20 | 149 | Static | Static00 | taborder=3 / text="카테고리" / left=0 / top=0 / width=60 / height=20 / cssclass=stc_WFSA_Label | FX-001 카테고리 라벨 |
| 21 | 150 | Combo | cbo_categoryId | taborder=2 / top=0 / width=120 / height=20 / left=Static00:10 / innerdataset=ds_lovCategoryId / codecolumn=CATEGORY_ID / datacolumn=CATEGORY_NM / onitemchanged=div_main_div2_cbo_categoryId_onitemchanged | FX-002 카테고리 콤보 |
| 22 | 151 | Static | stc_master | taborder=4 / left=cbo_categoryId:5 / top=0 / height=20 / cssclass=stc_WFSA_Label,stc_fontColor_indigo / right=341 | FX-003 선택 Master 표시 |

> Layout 자식 총 22 행 (Div 5 / Edit 3 / Static 4 / Grid 2 + Format 본문 2 / Button 2 / Combo 1 + Div(url include) 4). xfdl:6 ~ xfdl:154 의 모든 컴포넌트 1:1 전수 분해.

### §17.3 xfdl Objects 내 Dataset cell-level 전수 (xfdl:160~230)

| # | line | Dataset id | ColumnInfo | 비고 |
|---:|---:|---|---|---|
| 1 | 161~185 | ds_grdMain | 22 Column (CODE_ID / CODE_NM / CODE_DESC / CODE_VER / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / CODE_OWNER_DEPT_NM / CODE_OWNER_EMP_NO / CODE_CHARACTER / MASTER_CODE / MASTER_CODE_REF1 / MASTER_CODE_REF2 / MASTER_CODE_REF3 / MASTER_CODE_REF4 / MASTER_CODE_REF5 / MASTER_CODE_REF1_NM / MASTER_CODE_REF2_NM / MASTER_CODE_REF3_NM / MASTER_CODE_REF4_NM / MASTER_CODE_REF5_NM) — 모두 STRING(256) | DS-001 — Master 그리드 데이터셋 |
| 2 | 186~203 | ds_grdDetail (useclientlayout=true) | 14 Column (MASTER_CODE / CATEGORY_ID / CATEGORY_NM / SORT_SEQ / CODE_VAL / CODE_VAL_MEAN / CODE_VAL_DESC / CODE_VER / CHK / CODE_VAL_REF1_MN / CODE_VAL_REF2_MN / CODE_VAL_REF3_MN / CODE_VAL_REF4_MN / CODE_VAL_REF5_MN) — 모두 STRING(256) | DS-002 — Detail 그리드 데이터셋. **CHK 컬럼 잔존 (xfdl Script 미사용)** |
| 3 | 204~209 | ds_lovCategoryId | 2 Column (CATEGORY_ID / CATEGORY_NM) — STRING(256) | DS-003 — 카테고리 콤보 LoV |
| 4 | 210~225 | ds_chkYn | 2 Column (CODE_VAL / CODE_VAL_MEAN) — STRING(256) + 정적 Rows 2 (Y/Y, N/N) | DS-004 — 사용여부 콤보 LoV (hardcoded) |
| 5 | 226~230 | ds_grdMainAll | 1 Column (CODE_ID) — STRING(256) | DS-005 — **As-Is 잔존 (xfdl Script 미사용)** |

### §17.4 xfdl Script function cell-level 전수 (xfdl:232~413)

> 본 §17.4 는 xfdl Script 내 모든 `this.X = function(...)` / `this.X_onclick = function(...)` 정의를 1 행씩 분해. §4.4 의 표는 트리거 / 호출 관계 매트릭스이고 본 §17.4 는 line range 정본.

| # | line range | 함수명 | 시그니처 | 본문 요약 (1:1) |
|---:|---|---|---|---|
| 1 | 246~261 | MasterCodeMngList_onload | (obj:nexacro.Form, e:nexacro.LoadEventInfo) | gfn_formOnLoad(obj) / (개인화 5 라인 주석 처리 — xfdl:249~256) / gfn_quickMenuSet(this, grd_main, "", true, true, false, false, true) / gfn_quickMenuSet(this, grd_detail, "", true, true, true, true, true) / ds_grdMain.set_enableevent(false) |
| 2 | 263~268 | fn_formAfterOnload | () | fn_button() / `this.fn_search();` 라인 주석 처리 (xfdl:266) / gfn_gridSelectedRow(grd_main) |
| 3 | 270~281 | fn_button | () | fn_commonTop_onload(this, '', [["btn_search"]]) on div_title.div_topMenu / fn_commonRight_onload(this, '', [["btn_excelDown"]], false, "") on div1.div_rightMenu |
| 4 | 284~300 | fn_search | (obj:nexacro.Button, e:nexacro.ClickEventInfo) | ds_grdMain.clearData() / div2.stc_master.set_text(null) / ds_grdDetail.clearData() / ds_lovCategoryId.clearData() / gfn_transaction("search", "", "", "ds_grdMain=ds_GetCodeMasterList", pCodeId+pCodeNm, "fn_callBack") |
| 5 | 303~321 | fn_searchDetail | (obj:nexacro.Button, e:nexacro.ClickEventInfo) | ds_grdDetail.clearData() / ds_lovCategoryId.clearData() / gfn_transaction("searchDetail", "", "", "ds_grdDetail=ds_GetCodeDetailList ds_lovCategoryId=ds_GetTbMcmCodeCategoryList", pCodeId(MASTER_CODE)+pCodeIdRef1(MASTER_CODE_REF1)+...+pCodeIdRef5(MASTER_CODE_REF5), "fn_callBack") |
| 6 | 324~352 | fn_callBack | (strSvcId, nErrorCode, strErrorMsg) | switch(strSvcId): case "search" → ds_grdMain.set_rowposition(this.grd_row) / set_enableevent(true) / errorCode==0 ? bottomStatus("{N}건 조회되었습니다.") : bottomStatus(strErrorMsg) / case "searchDetail" → ds_grdDetail.set_rowposition(this.grd_row) / errorCode==0 ? (ds_lovCategoryId.insertRow(0) / CATEGORY_ID="" / CATEGORY_NM="전체" / cbo_categoryId.set_index(0) / stc_master.set_text(MASTER_CODE) / bottomStatus("{N}건 조회되었습니다.")) : bottomStatus(strErrorMsg) |
| 7 | 355~360 | div_main_div2_cbo_categoryId_onitemchanged | (obj:nexacro.Combo, e:nexacro.ItemChangeEventInfo) | ds_grdDetail.reset() / sCategoryId=cbo_categoryId.value / ds_grdDetail.filter(gfn_isNull(sCategoryId) ? "" : "CATEGORY_ID == '"+sCategoryId+"'") |
| 8 | 363~378 | div_main_div1_grd_main_oncellclick | (obj:nexacro.Grid, e:nexacro.GridClickEventInfo) | `if (this.rowpo == e.row) return;` 가드 주석 (xfdl:365) / e.row != -1 && rowType != 2 → ds_grdDetail.filter("") / fn_searchDetail() / ds_grdMain.reset() / ds_grdMain.set_rowposition(e.row) / grd_main.setFocus() / grd_main.setCellPos(e.col, e.row) / else → ds_grdDetail.clearData() / ds_lovCategoryId.clearData() / 마지막 this.rowpo = ds_grdMain.rowposition |
| 9 | 381~384 | btn_fold_onclick | (obj:nexacro.Button, e:nexacro.ClickEventInfo) | gfn_fold(this, div_search, div_main, btn_fold) |
| 10 | 387~390 | fn_excelDown | (obj:nexacro.Button, e:nexacro.ClickEventInfo) | gfn_exportExcel(grd_main, titletext) |
| 11 | 393~401 | div_main_div2_btn_excelDown_onclick | (obj:nexacro.Button, e:nexacro.ClickEventInfo) | rowposition == -1 → return / (Detail export 행 주석된 단순 라인 xfdl:397) / objAry = new Array() / objAry.push("마스터코드 : " + MASTER_CODE) / gfn_exportExcel(grd_detail, titletext, objAry) |
| 12 | 404~407 | div_main_div1_grd_main_onheadclick | (obj:nexacro.Grid, e:nexacro.GridClickEventInfo) | gfn_commonOnheadclick(obj, e) |
| 13 | 410~413 | div_main_div2_grd_detail_onheadclick | (obj:nexacro.Grid, e:nexacro.GridClickEventInfo) | gfn_commonOnheadclick(obj, e) |

> §17.4 함수 총 13 — xfdl:232 의 `include "_lib::libInClude.xjs";` (외부 lib) / xfdl:245 의 `this.grd_row = -1;` (멤버 변수) 도 본 화면에서 1 회 사용 (xfdl:329 / 339 에서 grd_row 참조). xfdl Script 의 모든 `function` 정의 1:1 매핑 완료.

### §17.5 Mapper.xml SQL cell-level 전수 (xml:1~108)

| # | line range | SQL ID | type | parameterType / resultType | 호출 (Y/N) | scalar subquery 수 |
|---:|---|---|---|---|---|---:|
| 1 | 7~39 | GetCodeMasterList | select | java.util.Map / java.util.Map | Y (Task_2) | 5 (MASTER_CODE_REF1~5_NM) |
| 2 | 41~44 | GetCodeMasterAllList | select | java.util.Map / java.util.Map | N (잔존) | 0 |
| 3 | 46~101 | GetCodeDetailList | select | java.util.Map / java.util.Map | Y (Task_1uvph9e) | 1 (CATEGORY_NM) + 5 nested (CODE_VAL_REF{N}_MN with NVL) |
| 4 | 103~108 | GetTbMcmCodeCategoryList | select | java.util.Map / java.util.Map | Y (Task_0zyza07) | 0 |

> §17.5 SQL 총 4 — Mapper.xml `<select|insert|update|delete>` 태그 모두 select. INSERT/UPDATE/DELETE/MERGE 0 개 (조회 전용 화면).

### §17.6 BPMN process / node cell-level 전수 (bpmn:1~141)

| # | line range | BPMN 요소 | id | name | type / class |
|---:|---|---|---|---|---|
| 1 | 3 | process | MasterCodeMngList | "detailSave\n" (As-Is 잔존 — 실제는 단순 조회) | isExecutable=false |
| 2 | 4~6 | startEvent | StartEvent_1 | Start Event | - |
| 3 | 7~10 | endEvent | EndEvent_1 | End Event | 2 incoming (SequenceFlow_0xwr48s / SequenceFlow_0vevv59) |
| 4 | 11~25 | task | Task_2 | Main조회 | CommonSelectTask / sqlKey=`#{serviceId}Mapper.GetCodeMasterList` / resultKey=`ds_GetCodeMasterList` |
| 5 | 26~33 | exclusiveGateway | ExclusiveGateway_1 | (없음) | Diverging / 2 outgoing |
| 6 | 34 | sequenceFlow | SequenceFlow_1 | (없음) | StartEvent_1 → ExclusiveGateway_1 |
| 7 | 35 | sequenceFlow | SequenceFlow_0grwghu | search | ExclusiveGateway_1 → Task_2 |
| 8 | 36~49 | task | Task_1uvph9e | Detail조회 | CommonSelectTask / sqlKey=`#{serviceId}Mapper.GetCodeDetailList` / resultKey=`ds_GetCodeDetailList` |
| 9 | 50 | sequenceFlow | SequenceFlow_02ocl0p | searchDetail | ExclusiveGateway_1 → Task_0zyza07 |
| 10 | 51~64 | task | Task_0zyza07 | Category조회 | CommonSelectTask / sqlKey=`#{serviceId}Mapper.GetTbMcmCodeCategoryList` / resultKey=`ds_GetTbMcmCodeCategoryList` |
| 11 | 65 | sequenceFlow | SequenceFlow_0av6mvx | (없음) | Task_0zyza07 → Task_1uvph9e |
| 12 | 66 | sequenceFlow | SequenceFlow_0xwr48s | (없음) | Task_2 → EndEvent_1 |
| 13 | 67 | sequenceFlow | SequenceFlow_0vevv59 | (없음) | Task_1uvph9e → EndEvent_1 |
| 14 | 69~136 | bpmndi:BPMNDiagram | (Default Process Diagram) | (시각화 좌표) | BPMNShape / BPMNEdge / BPMNLabel — 본 분석은 process 행위 정본 기준이므로 좌표 본문은 별도 표 분해 불필요 |
| 15 | 137~139 | bpmndi:BPMNLabelStyle | BPMNLabelStyle_1 | (font arial 9) | - |

> §17.6 BPMN node 총 6 (start 1 + end 1 + gateway 1 + task 3) + sequenceFlow 6 + BPMNDiagram 1 (시각화) = process 정본 1:1 보존.

---
