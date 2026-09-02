---
screenId: masterRuleData
asIsId: MasterRuleData
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 Data관리 (masterRuleData) 분석리포트

> 본 문서 = 6종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — 입력 자산은 mui (xfdl/Java 2종/Mapper.xml/bpmn) 5종 + DMES Excel 1종). manifest 폴더 금지(R-14 미적용).
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow) 로 매핑.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / java 메서드 전수 / Mapper.xml SQL 전수 / bpmn flow 전수). xfdl 760 lines 전수 정독 (offset 분할: 1~260 / 260~519 / 519~760).
- As-Is DB = Oracle (`NVL` / `ROW_NUMBER() OVER` / `||` 문자열 연결 / `dual` / `ALL_CONS_COLUMNS` 시스템 카탈로그 / schema `MCA_SOURCE` 명시 / `UPPER()` 래핑). To-Be DB = MSSQL. §11 변환점 명시.
- **★ 동적 컬럼·동적 테이블 화면 — masterCategoryMng (정적 컬럼) 과 본질적으로 다름.** 본 화면은 ① 그리드 컬럼을 `ds_lovData`(= `TB_MCA_RULE_COL_LIST` 컬럼정의) 기반으로 **런타임 동적 생성**하고(xfdl:593~617), ② 조회/저장 대상 테이블명을 `TB_MCA_<업무기준ID>` 로 **런타임 동적 결정**한다(xfdl:406, 557 / Mapper `${pTable}`). 동적 로직은 §3.3 / §6 / §7 에 전수 명시.
- **★ 메타 테이블은 To-Be 카탈로그에 존재 / 동적 데이터 테이블만 미수록(정상).** 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx` (masterRuleList §9.1 정합 — 동일 MCA 정의서). 본 화면 사용 테이블은 성격이 2종으로 구분된다:
  - **(a) 메타 테이블 — 카탈로그 존재.** `TB_MCA_RULE_COL_LIST` (sheet134, 컬럼정의) + `TB_MCA_RULE_MASTER` (sheet135, 26 컬럼, 업무기준 마스터, masterRuleList §7/§9.1 정합). 두 테이블의 To-Be 컬럼 카탈로그는 §9.2/§9.3 에 실제 매핑한다. 따라서 메타 테이블 "미정의" 는 **오탐 — 해소** (Q-001 Resolved).
  - **(b) 동적 데이터 테이블 — 카탈로그 미수록(정상).** `MCA_SOURCE.TB_MCA_<업무기준ID>` (= 런타임 `${pTable}`) 는 업무기준ID 별로 가변 생성되는 인스턴스 테이블 — 카탈로그에 고정 DDL 이 없는 것이 정상이며 "테이블 부재" 가 아니다. 대신 **To-Be 동적 데이터 테이블 영속/생성 전략** (DDL on-demand vs 정규화 EAV vs JSON 등) 이 핵심 미확정 설계 이슈로, 임의 확정하지 않고 **Q-001 (동적 데이터 테이블 To-Be 전략)** 로 유지한다. (가이드 §"환경 제약 발견 시 fail-fast" 준수 — 단 메타 테이블 부재 오탐은 보정.)

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterRuleData | MasterRuleData.xfdl:3 (`<Form id="MasterRuleData" ...>`) |
| 화면 ID (To-Be) | masterRuleData | 사용자 결정 (모듈 mcm + As-Is 화면명 lowerCamel) |
| 화면명 | 업무기준 Data관리 | MasterRuleData.xfdl:3 (`titletext="업무기준 Data관리"`) / MasterRuleData.bpmn:3 (`name="업무기준 DATA관리"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 사용자 결정 (테이블 카탈로그 = DMES-SECTION-MCA 정의서 대응) |
| 모듈 그룹 | cmb — 한글명 **"업무기준 관리(원장)"** | 사용자 결정 (작업지시 등재) / 자산 경로: `mui/src/nxuiMui/cmb/` / `mappers-cmb/` / `services/cmb/` |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 Data관리 (masterRuleData) | - |
| 화면 크기 | 1280 × 670 | MasterRuleData.xfdl:3 (`width="1280" height="670"`) |
| onload 핸들러 | MasterRuleData_onload | MasterRuleData.xfdl:3 / xfdl:336 |
| 최초 생성 | 2019.12.04 최민수 | MasterRuleData.xfdl:311 |
| 수정 | 2020.05.08 최규찬 | MasterRuleData.xfdl:312 |
| 긴급적용 기능 추가 | 2025.08.13 by DMES | SaveMasterRuleData.java:26, 36, 84, 160, 216 |
| 화면 성격 | 업무기준 프레임에 매핑된 실데이터 CRUD (동적 컬럼/동적 테이블 단일 그리드 + 5조건 LoV 검색 + 페이징) | xfdl 349~360 (rowAdd/rowCopy/rowDelete/rowCancel/excelUp/excelDown 6 우측 메뉴) |
| 주 사용 테이블 (동적) | MCA_SOURCE.TB_MCA_<업무기준ID> (= `${pTable}`, 런타임 결정) | MasterRuleDataMapper.xml:42, 72, 78 / GetMasterRuleData.java:50, 78 / SaveMasterRuleData.java:88, 120, 168 |
| 컬럼정의 테이블 | MCA_SOURCE.TB_MCA_RULE_COL_LIST (+ JOIN TB_MCA_RULE_MASTER) | MasterRuleDataMapper.xml:7~30 / GetMasterRuleData.java:51 |
| 트랜잭션 클래스 2종 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData.GetMasterRuleData / SaveMasterRuleData | GetMasterRuleData.java:1 / SaveMasterRuleData.java:1 / MasterRuleData.bpmn:44, 56 |
| BPMN 프로세스 ID | MasterRuleData | MasterRuleData.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleData.bpmn:3 |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleData.xfdl | 760 | nexacro Form + Script (5화면 중 최대) |
| 2 | Java (UserTask — 조회) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleData\GetMasterRuleData.java | 130 | implements Wow — 동적 조회 트랜잭션 |
| 3 | Java (UserTask — 저장) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleData\SaveMasterRuleData.java | 233 | implements Wow — 동적 저장 트랜잭션 (긴급적용 분기) |
| 4 | Mapper.xml | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleDataMapper.xml | 92 | namespace=MasterRuleDataMapper, 6 SQL |
| 5 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleData.bpmn | 172 | Camunda Modeler 3.1.2 |
| 6 | DMES 테이블 정의서 | docs/external/DMES/DMES-SECTION-MCA_테이블정의서.xlsx | (xlsx) | **메타 2테이블 수록: TB_MCA_RULE_COL_LIST (sheet134) / TB_MCA_RULE_MASTER (sheet135, 26 컬럼) — §9.2/§9.3 매핑. 동적 데이터 테이블 TB_MCA_<업무기준ID> 는 런타임 인스턴스라 미수록(정상) — §0(b) / Q-001 (동적전략)** |

추가 외부 참조(본 화면 자산에 미포함, 인용으로만 사용):
- `TB_MCA_RULE_COL_LIST_Mapper.select` (GetMasterRuleData.java:51 호출) — 컬럼정의 조회 SQL. 정의 본문은 본 화면 Mapper.xml(MasterRuleDataMapper) 외부의 별도 Mapper 파일.
- `<table>_Mapper.update / delete / insert` (SaveMasterRuleData.java:92, 124, 171 — 기존방식 분기) — `${pTable}_Mapper.*` 동적 namespace. 각 업무기준 테이블별 개별 Mapper 파일(본 화면 자산 외부).
- `DynamicSqlExecutor` (SaveMasterRuleData.java:12, 27 — 긴급적용 분기) — 공통 동적 SQL 실행기 (mui task.common 패키지, 본 화면 자산 외부).
- `CommonUtil.getCurrentDate` (SaveMasterRuleData.java:13, 218) — 공통 유틸 (본 화면 자산 외부).
- 호출 팝업 2종: `cmb::MasterRuleListPop.xfdl` (업무기준 선택 — xfdl:437) / `cmb::MasterRuleDataUploadFilePopup.xfdl` (업무기준 등록 엑셀업로드 — xfdl:722). 본 화면에서 호출만, 정의는 형제 화면.

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:6 |
| A-002 | 조회조건 (업무기준 + 5조건 LoV + 긴급적용) | div_search | top=div_title:0, left=20, right=20, height=68 | xfdl:19 |
| A-003 | 접기 토글 | btn_fold | top=div_search:0, left=20, right=20, height=15 | xfdl:171 |
| A-004 | 메인 (그리드 + 우측 메뉴 + 페이징 + 다운로드 그리드) | div_main | top=btn_fold:5, left=20, right=20, bottom=40 | xfdl:172 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:225 |

### §3.2 조회조건 (S-NNN) — div_search

| S-NNN | xfdl id | 종류 | 라벨 | 초기 value / text | 폭 | readonly | innerdataset | 파라미터 | 근거 |
|---|---|---|---|---|---:|---|---|---|---|
| S-001 | stc_ruleId | Static (라벨) | 업무기준 ID | "업무기준 ID" | 80 | - | - | (라벨) | xfdl:22 |
| S-002 | edt_ruleId | Edit | (업무기준 ID — 필수, readonly) | text="USD" | 100 | true | - | pRuleId / pTable(=`TB_MCA_`+값) | xfdl:23 |
| S-003 | stc_ruleNm | Static (라벨) | 업무기준명 | "업무기준명" | 80 | - | - | (라벨) | xfdl:24 |
| S-004 | edt_ruleNm | Edit | (업무기준명, readonly) | text="USD" | 260 | true | - | (표시용) | xfdl:25 |
| S-005 | btn_ruleId | Button | 업무기준 | "업무기준" | 69 | - | - | (팝업 호출 P-001) | xfdl:26 |
| S-006 | cbo_lov1 | Combo | 조건1 | text="조건1" index=-1 | 100 | - | ds_lov1 (codecolumn=COL_ID / datacolumn=COL_NM) | pWhere1 | xfdl:27 |
| S-007 | cbo_operator1 | Combo | 연산자 | text="연산자" index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator1 | xfdl:28~53 |
| S-008 | edt_val1 | Edit | (조건1 값) | text="KR/A" | 60 | - | - | pVal1 | xfdl:54 |
| S-009 | cbo_lov2 | Combo | 조건2 | text="조건2" index=-1 | 100 | - | ds_lov2 | pWhere2 | xfdl:55 |
| S-010 | cbo_operator2 | Combo | 연산자 | index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator2 | xfdl:56~81 |
| S-011 | edt_val2 | Edit | (조건2 값) | (없음) | 60 | - | - | pVal2 | xfdl:82 |
| S-012 | cbo_lov3 | Combo | 조건3 | text="조건3" index=-1 | 100 | - | ds_lov3 | pWhere3 | xfdl:83 |
| S-013 | cbo_operator3 | Combo | 연산자 | index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator3 | xfdl:84~109 |
| S-014 | edt_val3 | Edit | (조건3 값) | (없음) | 60 | - | - | pVal3 | xfdl:110 |
| S-015 | cbo_lov4 | Combo | 조건4 | text="조건4" index=-1 | 100 | - | ds_lov4 | pWhere4 | xfdl:111 |
| S-016 | cbo_operator4 | Combo | 연산자 | index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator4 | xfdl:112~137 |
| S-017 | edt_val4 | Edit | (조건4 값) | (없음) | 60 | - | - | pVal4 | xfdl:138 |
| S-018 | cbo_lov5 | Combo | 조건5 | text="조건5" index=-1 | 100 | - | ds_lov5 | pWhere5 | xfdl:139 |
| S-019 | cbo_operator5 | Combo | 연산자 | index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator5 | xfdl:140~165 |
| S-020 | edt_val5 | Edit | (조건5 값) | (없음) | 60 | - | - | pVal5 | xfdl:166 |
| S-021 | chk_option | CheckBox | 긴급적용 | text="긴급적용" | 100 | - | - | pOption(Y/N) | xfdl:167 |

비고:
- edt_ruleId / edt_ruleNm 둘 다 `text="USD"` 초기값 보존 (xfdl:23/25 — 원본 그대로). **To-Be 동일 보존** (운영 의도 — Q-002 확인 위임).
- edt_ruleId 는 `readonly="true"` + `cssclass="Essential"` (필수) — 직접 입력 불가, 업무기준 버튼(S-005)→팝업으로만 채움 (xfdl:23, 26, 437).
- edt_val1 초기값 `text="KR/A"` 보존 (xfdl:54 — 원본 그대로). **To-Be 보존** (Q-002 확인 위임).
- 5조건 LoV 콤보(cbo_lov1~5) 의 innerdataset(ds_lov1~5) 는 업무기준 선택 후 `fn_lov` 콜백(xfdl:652~679) 에서 `ds_lovData` 복사 + "조건N" 헤더행 삽입으로 동적 구성 — 컬럼 선택 LoV.
- 각 연산자 콤보(cbo_operator1~5) 의 innerdataset 은 xfdl 인라인 정적 Dataset (LIKE / = / <= / >= 4행) — 5개 콤보 모두 동일 (xfdl:29~52, 57~80, 85~108, 113~136, 141~164).
- `chk_option`(긴급적용)=true 시 Mapper 미경유 DynamicSqlExecutor 직접 실행 경로 활성 (xfdl:546~551 confirm / SaveMasterRuleData.java:87, 119, 167).

### §3.3 결과 그리드 G-001 — div_main.grd_main (binddataset=ds_grdMain) — ★동적 컬럼

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grd_main | xfdl:175 |
| binddataset | ds_grdMain | xfdl:175 |
| cellmovingtype / cellsizingtype | col / col | xfdl:175 |
| selecttype | multiarea | xfdl:175 |
| autosizebandtype / autosizingtype | allband / col | xfdl:175 |
| onheadclick | div_main_grd_main_onheadclick | xfdl:175 / xfdl:732 |
| 행 높이 | 25 (head/body 공통) | xfdl:184~185 |

#### Grid 정적 컬럼 (Format default — 초기 3 cols, xfdl:176~197)

| col | head text | bind | displaytype | edittype | cssclass (조건부) | 근거 |
|---:|---|---|---|---|---|---|
| 0 | (head checkbox) `dataset.parent.mainChk` | CHK | checkboxcontrol | checkbox | CHK=="1" → cellBody_BgColor_red | xfdl:188, 193 |
| 1 | 순번 | SEQ | normal | - | CHK=="1" → cellBody_BgColor_red | xfdl:189, 194 |
| 2 | 상태 | STATUS | normal(head) / imagecontrol(body) | - | CHK=="1" → cellBody_BgColor_red | xfdl:190, 195 |

#### Grid 동적 컬럼 (런타임 추가 — fn_callBack "search" / xfdl:593~617)

| 동작 | 상세 | 근거 |
|---|---|---|
| 추가 트리거 | search 콜백 성공(nErrorRule==0) 시 `ds_lovData.rowcount` 만큼 반복 | xfdl:595 |
| 컬럼 추가 | `ds_grdMain.addColumn(COL_ID, "STRING")` + `grd_main.appendContentsCol("body")` (col index = i+3) | xfdl:597~598 |
| head text | `sPkYn=="Y" ? " * "+sColNm : sColNm` (PK 컬럼은 ` * ` prefix) | xfdl:607 |
| head cssclass | `sIoFlag=="IN" ? cellHead_BgColor_red : cellHead_BgColor_blue` (IN/OUT 색 구분) | xfdl:608 |
| body bind | `text = "bind:"+COL_ID` | xfdl:611 |
| body edittype | `"text"` (전 컬럼 편집 가능 — RULE_SEQ 로 WHERE 대체하여 기존 key 도 수정 허용) | xfdl:614 |
| DATE 타입 처리 | `sColType=="DATE"` 면 calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" | xfdl:604~606 |
| 컬럼 폭 | `13 * COL_NM.length` (한글 길이 기반 자동) + autosizecol="limitmin" | xfdl:609~610 |
| body cssclass | `CHK=='1' ? cellBody_BgColor_red : ''` | xfdl:616 |
| 재조회 시 초기화 | fn_search 진입 시 `grd_main.deleteContentsCol("body", 3, true)` 로 기존 동적 컬럼(3번 이후) 전수 제거 후 ds_grdMain.clear() | xfdl:395~400 |

비고:
- 동적 컬럼은 `ds_lovData`(컬럼정의) 의 COL_ID/COL_NM/PK_YN/COL_TYPE/IO_FLAG 메타로 생성 — 컬럼 개수·이름·타입이 선택한 업무기준에 따라 가변. **To-Be FE 동적 그리드 컬럼 빌드 동일 구현** 필요 (Q-003 위임).
- col 2 (상태) body = `displaytype="imagecontrol"` — STATUS 값으로 상태 아이콘 표시. STATUS 는 ds_grdMain ColumnInfo(xfdl:229~233) 에 미선언 (Nexacro auto row state). **To-Be FE 동일 row state 표시 구현**.
- 모든 셀에 `CHK==1 → cellBody_BgColor_red` cssclass binding (xfdl:193~195, 616).

#### Dataset 컬럼 전수 (ds_grdMain — xfdl:229~233)

| 컬럼 ID | type | size | 비고 | 근거 |
|---|---|---:|---|---|
| TOTALCOUNT | STRING | 256 | 페이징 총건수 (SQL TOTALCOUNT 반환) — 동적 컬럼/CHK 는 런타임 addColumn (xfdl:593, 597) | xfdl:231 |

비고: ds_grdMain 은 선언 컬럼이 TOTALCOUNT 1개뿐 — CHK·SEQ·STATUS·동적 업무기준 컬럼은 모두 콜백에서 런타임 추가. (oncolumnchanged=ds_grdMain_oncolumnchanged 핸들러 보유 xfdl:229, 752.)

#### Dataset 컬럼 전수 (ds_lovData — 컬럼정의 캐시 — xfdl:234~242)

| 컬럼 ID | type | size | 용도 | 근거 |
|---|---|---:|---|---|
| COL_ID | STRING | 256 | 동적 컬럼 ID (bind 키) | xfdl:236 |
| COL_NM | STRING | 256 | 동적 컬럼 헤더명 | xfdl:237 |
| CODE_YN | STRING | 256 | 코드 여부 (MASTER_CODE_DIV) | xfdl:238 |
| PK_YN | STRING | 256 | PK 여부 (head ` * ` prefix / 저장 필수 검증) | xfdl:239 |
| COL_TYPE | STRING | 256 | 컬럼 타입 (VARCHAR2 / DATE 등) | xfdl:240 |

비고: SQL(GetRuleColList) 은 COL_LEN / COL_PREC_LEN / MES_COL_ID / IO_FLAG / COL_SEQ / RULE_ID 도 반환(Mapper.xml:9~22)하나 ds_lovData ColumnInfo 에는 5컬럼만 선언 — 나머지는 동적 추가/미사용. fn_callBack 에서 IO_FLAG(xfdl:603, 608) 도 참조하므로 런타임 보강됨.

#### Dataset 전수 (검색 LoV 콤보 소스 — xfdl:243~272)

| Dataset | 컬럼 | 용도 | 근거 |
|---|---|---|---|
| ds_lov1 | COL_ID / COL_NM | cbo_lov1 innerdataset | xfdl:243~248 |
| ds_lov2 | COL_ID / COL_NM | cbo_lov2 innerdataset | xfdl:249~254 |
| ds_lov3 | COL_ID / COL_NM | cbo_lov3 innerdataset | xfdl:255~260 |
| ds_lov4 | COL_ID / COL_NM | cbo_lov4 innerdataset | xfdl:261~266 |
| ds_lov5 | COL_ID / COL_NM | cbo_lov5 innerdataset | xfdl:267~272 |

#### Dataset 전수 (공통/페이징/다운로드 — xfdl:273~302)

| Dataset | 컬럼 | 용도 | 근거 |
|---|---|---|---|
| ds_srch | totalCount / countPerPage(초기 "Y") / currentPage / errorMessage / errorCode / keyword | 페이징 송신(countPerPage/currentPage) | xfdl:273~287 |
| ds_common | totalCount / countPerPage / currentPage / errorMessage / errorCode / keyword | 공통 (미사용) | xfdl:288~297 |
| ds_grdDownload | RULE_ID (+ 런타임 동적 컬럼) | 엑셀 Export 그리드(grd_Download) 소스 | xfdl:298~302 / xfdl:632~644 |

### §3.4 편집 그리드 — 해당 없음

- grd_main 단일 그리드가 결과 + 편집 겸용 (동적 컬럼). 별도 GE-NNN 없음.
- grd_Download (xfdl:203~221) = 엑셀 Export 전용 숨김 그리드 (visible="false", binddataset=ds_grdDownload).

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 상단 메뉴 div | div_title.div_topMenu (width=290, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:10 |
| C-002 | 우측 메뉴 div | div_main.div_rightMenu (top=0, height=21, width=500, right=0) | _com_div::commonRightButton.xfdl | xfdl:201 |
| C-003 | 페이징 div | div_main.div_paging (left=0, bottom=0, right=0, height=21) | _com_div::commonPagingButton.xfdl | xfdl:202 |
| C-004 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:225 |
| C-005 | 제목 Edit (readonly) | div_title.edt_title (width=150, height=25) | (없음) | xfdl:9 |
| C-006 | Export 버튼 | div_main.Button00 (cssclass=btn_WF_ExcelExport, top=-78 → 화면 밖 숨김) | (없음) | xfdl:200 |
| C-007 | 다운로드 그리드 | div_main.grd_Download (visible="false") | (없음) | xfdl:203~221 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:349~361)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | 조회 | fn_search (xfdl:372) | search | xfdl:353, 372~426 |
| B-002 | btn_save | 저장 | fn_save (xfdl:523) | save | xfdl:353, 523~579 |

비고: 사용자정의버튼 배열에 `btn_dec`/`fn_dec`/"확정" 이 주석 처리되어 있음 (xfdl:352 — 미사용).

### §4.2 우측 메뉴 (commonRight — fn_button xfdl:356~360)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-003 | btn_rowAdd | 행추가 | fn_rowAdd (xfdl:470) | (client-side) rowAdd | xfdl:358, 470~482 |
| B-004 | btn_rowCopy | 행복사 | fn_rowCopy (xfdl:485) | (client-side) rowCopy | xfdl:358, 485~494 |
| B-005 | btn_rowDelete | 행삭제 | fn_rowDelete (xfdl:497) | (client-side) rowDelete | xfdl:358, 497~515 |
| B-006 | btn_rowCancel | 행취소 | fn_rowCancel (xfdl:518) | (client-side) rowCancel | xfdl:358, 518~520 |
| B-007 | btn_excelUp | 엑셀업 | fn_excelUp (xfdl:716) | (client-side, 팝업 P-002) excelUp | xfdl:358, 716~723 |
| B-008 | btn_excelDown | 엑셀다운 | fn_excelDown (xfdl:698) | search_export (server) | xfdl:358, 698~713 |

### §4.3 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-009 | btn_fold | 조회조건 접기/펴기 | btn_fold_onclick (xfdl:692) | (client-side) fold | xfdl:171, 692~695 |
| B-010 | btn_ruleId | 업무기준 (선택 팝업) | div_search_btn_ruleId_onclick (xfdl:429) | (client-side, 팝업 P-001) | xfdl:26, 429~438 |
| B-011 | Button00 | Export (숨김 — top=-78) | (onclick 미지정) | (미사용) | xfdl:200 |

### §4.4 그리드 헤더 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| GB-001 | grd_main 헤드(CHK 컬럼) | div_main_grd_main_onheadclick (xfdl:732) | 전체선택/해제 토글 (mainChk 변수 0↔1) | xfdl:175, 732~750 |
| GB-002 | grd_main 헤드(기타 컬럼) | div_main_grd_main_onheadclick → gfn_commonOnheadclick(obj, e) | 그리드 정렬 (공통 함수 위임) | xfdl:747 |

### §4.5 페이징 액션

| 항목 | 동작 | 근거 |
|---|---|---|
| fn_searchPaging(nPageNo) | nPageNo 설정 후 fn_search 재호출 → 'reSearch' 복귀 | xfdl:364~369 |
| fn_callAfter(arrList) | 콜백에서 총페이지/총건수/현재페이지로 페이징 div 갱신 (TOTALCOUNT/rowCntSet) | xfdl:620~622 |
| countPerPage / currentPage | ds_srch 에 set 후 GetMasterRuleDataList SQL 의 페이징 파라미터로 송신 | xfdl:374~381 / GetMasterRuleData.java:114~115 |

### §4.6 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | ds_srch=ds_srch | ds_grdMain=ds_GetMasterRuleData | xfdl:402~405 / bpmn:23 |
| B-002 btn_save | save | Y | SequenceFlow_0dqldpo | ds_srch=ds_srch ds_lovData=ds_lovData ds_grdMain=ds_grdMain:U | ds_grdMain=ds_GetMasterRuleData | xfdl:553~556 / bpmn:62 |
| B-010 btn_ruleId 콜백 fn_lov | lov | Y | SequenceFlow_1x309em | "" | ds_lovData=ds_GetRuleColList | xfdl:458~461 / bpmn:38 |
| B-008 btn_excelDown | search_export | Y | SequenceFlow_17wvr16 | "" | ds_grdDownload=ds_GetMasterRuleDataExport | xfdl:702~705 / bpmn:79 |
| B-003~B-007(excelUp), B-009 | rowAdd/rowCopy/rowDelete/rowCancel/excelUp/fold | N (client-side; excelUp 은 팝업) | (해당 없음) | - | - | xfdl:470~520, 692~723 |

비고:
- xfdl:577 `gfn_checkTransaction("ds_grdMain", "CHK")` = 저장 전 CHK==1 행만 송신 대상 marking 후 sInDatasets `ds_grdMain:U`(update) 로 송신.
- save sArgument 에 조회조건 5쌍(pWhereN/pOperatorN/pValN) + pRuleId + pTable(=`TB_MCA_`+ruleId) + pOption(긴급적용 Y/N) 전수 포함 (xfdl:557~574).
- save 후 후속 조회는 BPMN 에서 SaveMasterRuleData → UserTask_067lppc(Main 조회) 로 자동 재조회 (bpmn:63).

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 인자(oArg) | 콜백 | 근거 |
|---|---|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-010 btn_ruleId (xfdl:429) | `{ sSchema : "MCA_SOURCE" }` | fn_returnRulePopupCallBack (xfdl:441) → sRuleId/sRuleNm 세팅 후 fn_lov() | xfdl:433~437, 441~452 |
| P-002 | cmb::MasterRuleDataUploadFilePopup.xfdl (업무기준 등록 엑셀업로드) | B-007 btn_excelUp (xfdl:716) | `{ sRuleId, sRuleNm }` | fn_returnMasterRuleDataUploadFilePopupCallBack (xfdl:726 — 본문 no-op) | xfdl:719~722, 726~729 |

비고: P-001 콜백은 업무기준ID/명 채운 뒤 즉시 `fn_lov()` 호출 → lov 조회 → 그 콜백에서 다시 `fn_search()` 자동 실행 (xfdl:451, 678). 즉 업무기준 선택만으로 컬럼정의 로드 + 데이터 조회까지 일괄 연쇄.

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 업무기준 실데이터 관리 화면 (Form). 다른 화면에서 본 화면을 in-coming 호출하지 않음 (분석 범위 — Q-004 위임).

---

## §6. SQL ID 매트릭스 (Mapper.xml 모든 SQL — 전수 6개)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 동적 요소 | 동적 WHERE (mybatis if) | 정렬 | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetRuleColList | select | java.util.Map | java.util.Map | MCA_SOURCE.TB_MCA_RULE_MASTER RMASTER, MCA_SOURCE.TB_MCA_RULE_COL_LIST RCLIST | (없음 — 고정 테이블) | pRuleId (1 if) | COL_SEQ | `ALL_CONS_COLUMNS` 서브쿼리 PK 판정 / `NVL2` / `'TB_MCA_' \|\| #{pRuleId}` 문자열결합 | Mapper.xml:7~30 |
| 2 | GetMasterRuleDataList | select | java.util.Map | java.util.Map | MCA_SOURCE.${pTable} (동적) | `${pTable}` 테이블명 + `${pWhereN}` `${pOperatorN}` `${pValN}` 컬럼/연산자/값 (5쌍) | pWhere1~5 (5 if) | RULE_SEQ (ROW_NUMBER) | `WITH ... AS` CTE / `ROW_NUMBER() OVER(ORDER BY RULE_SEQ)` / `NVL` / `dual` | Mapper.xml:32~67 |
| 3 | GetMasterRuleDataExport | select | java.util.Map | java.util.Map | MCA_SOURCE.${pTable} (동적) | `${pTable}` 테이블명 | (없음 — 전건) | RULE_SEQ | (없음) | Mapper.xml:69~74 |
| 4 | GetMaxRuleSeq | select | java.util.Map | java.lang.String | MCA_SOURCE.${pTable} (동적) | `${pTable}` 테이블명 | (없음) | - | `NVL(MAX(RULE_SEQ),0)` | Mapper.xml:76~79 |
| 5 | InsertMasterRuleSpecDataList | insert | java.util.HashMap | - | MCA_SOURCE.${pTable} (동적) | `${pTable}` + `${pColumns}` + `${pValues}` 전부 동적 | (없음) | - | (없음) | Mapper.xml:81~85 |
| 6 | UpdateMasterRuleSpecDataList | update | java.util.HashMap | - | MCA_SOURCE.${pTable} (동적) | `${pTable}` + `${sUpdate}` + `${sUpdateWhere}` 전부 동적 | (없음 — WHERE 도 동적 문자열) | - | (없음) | Mapper.xml:87~91 |

비고:
- **★ SQL #5/#6 (Insert/Update MasterRuleSpecDataList) 는 본 Mapper.xml 에 정의되어 있으나 Java(SaveMasterRuleData) 및 BPMN 어디에서도 직접 호출되지 않음** — SaveMasterRuleData 의 "기존방식" 분기는 `${pTable}_Mapper.update/delete/insert`(java:92, 124, 171) 즉 **테이블별 외부 동적 Mapper** 를 호출하고, "긴급적용" 분기는 DynamicSqlExecutor 를 쓴다. → #5/#6 = orphan 후보. **To-Be 처리는 Q-005 위임** (As-Is 보존 vs 제거).
- SQL #1 (GetRuleColList) = lov action → bpmn Task_0ru18qa("lov목록 조회", CommonSelectTask) 에 매핑 (bpmn:24~37). 단 BPMN sqlKey 는 `#{serviceId}Mapper.GetRuleColList`(bpmn:31) 인데, Java(GetMasterRuleData) 는 동일 컬럼정의를 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 로 별도 호출 — **호출 경로 2갈래** (BPMN lov flow = MasterRuleDataMapper.GetRuleColList / Java 내부 = TB_MCA_RULE_COL_LIST_Mapper.select).
- SQL #2 (GetMasterRuleDataList) = GetMasterRuleData.java:118 호출 (search) → bpmn UserTask_067lppc("Main 조회").
- SQL #3 (GetMasterRuleDataExport) = search_export → bpmn Task_02a3gu4("Main 조회 엑셀 Export", CommonSelectTask, bpmn:64~77).
- SQL #4 (GetMaxRuleSeq) = SaveMasterRuleData.java:138 호출 (신규행 RULE_SEQ 채번용).
- `${...}` (치환) vs `#{...}` (바인딩) 혼용 — `${pTable}`/`${pWhereN}`/`${pColumns}` 등은 SQL injection 표면 (As-Is 그대로). To-Be 안전화 §11.

### §6.1 SQL 별 컬럼 / 파라미터 상세

#### #1 GetRuleColList (Mapper.xml:7~30)

SELECT 컬럼 9종:
| 별칭 | 원본 | 매핑 (ds_lovData / 동적그리드) | 근거 |
|---|---|---|---|
| RCLIST.RULE_ID | TB_MCA_RULE_COL_LIST.RULE_ID | (업무기준 키) | Mapper.xml:8 |
| RCLIST.COL_SEQ | TB_MCA_RULE_COL_LIST.COL_SEQ | (정렬 기준) | Mapper.xml:9 |
| RCLIST.COL_ID | TB_MCA_RULE_COL_LIST.COL_ID | ds_lovData.COL_ID (동적 컬럼 bind 키) | Mapper.xml:10 |
| RCLIST.COL_NM | TB_MCA_RULE_COL_LIST.COL_NM | ds_lovData.COL_NM (동적 컬럼 헤더) | Mapper.xml:11 |
| RCLIST.COL_LEN | TB_MCA_RULE_COL_LIST.COL_LEN | (editmaxlength — 주석 처리 xfdl:615) | Mapper.xml:12 |
| RCLIST.COL_PREC_LEN | TB_MCA_RULE_COL_LIST.COL_PREC_LEN | (정밀도) | Mapper.xml:13 |
| RCLIST.MES_COL_ID | TB_MCA_RULE_COL_LIST.MES_COL_ID | (MES 매핑 컬럼) | Mapper.xml:14 |
| RCLIST.MASTER_CODE_DIV AS CODE_YN | TB_MCA_RULE_COL_LIST.MASTER_CODE_DIV | ds_lovData.CODE_YN | Mapper.xml:15 |
| (서브쿼리) AS PK_YN | ALL_CONS_COLUMNS 기반 PK 판정 (`NVL2(MAX(CONSTRAINT_NAME),'Y','N')`) | ds_lovData.PK_YN | Mapper.xml:16~20 |
| RCLIST.COL_TYPE | TB_MCA_RULE_COL_LIST.COL_TYPE | ds_lovData.COL_TYPE (VARCHAR2/DATE) | Mapper.xml:21 |
| RCLIST.IO_FLAG | TB_MCA_RULE_COL_LIST.IO_FLAG | (head 색상 IN/OUT, xfdl:608) | Mapper.xml:22 |

JOIN: `RMASTER.RULE_ID = RCLIST.RULE_ID` (Mapper.xml:25). 동적 WHERE: `pRuleId != null` 시 `AND RMASTER.RULE_ID = #{pRuleId}` (Mapper.xml:26~28). PK_YN 서브쿼리 대상 테이블 = `'TB_MCA_' || #{pRuleId}` (Mapper.xml:18). ORDER BY COL_SEQ (Mapper.xml:29).

#### #2 GetMasterRuleDataList (Mapper.xml:32~67) — ★ 동적 테이블 + 동적 WHERE + 페이징

- CTE PARAM: `NVL(#{currentPage},1) PAGENUM, NVL(#{countPerPage},1) PAGEROW FROM dual` (Mapper.xml:35).
- CTE TB1: `SELECT ROW_NUMBER() OVER(ORDER BY RULE_SEQ) SEQ, TB1.* FROM MCA_SOURCE.${pTable} TB1` + 동적 WHERE (Mapper.xml:39~59).
- 동적 WHERE 5쌍 (각 `pWhereN != null` 일 때): `AND ${pWhereN} ${pOperatorN} ${pValN}` (Mapper.xml:44~58).
- 최종: `SELECT (SELECT COUNT(*) FROM TB1) AS TOTALCOUNT, TB1.* FROM TB1 WHERE SEQ BETWEEN ((PAGENUM-1)*PAGEROW)+1 AND (PAGENUM*PAGEROW)` (Mapper.xml:62~66).

#### #3 GetMasterRuleDataExport (Mapper.xml:69~74)

`SELECT * FROM MCA_SOURCE.${pTable} ORDER BY RULE_SEQ` (전건 — 페이징 없음).

#### #4 GetMaxRuleSeq (Mapper.xml:76~79)

`SELECT NVL(MAX(RULE_SEQ),0) AS RULE_SEQ FROM MCA_SOURCE.${pTable}` — 신규행 채번 base.

#### #5 InsertMasterRuleSpecDataList (Mapper.xml:81~85) — orphan 후보

`INSERT INTO MCA_SOURCE.${pTable} (${pColumns}) VALUES (${pValues})` — Java/BPMN 호출 미발견.

#### #6 UpdateMasterRuleSpecDataList (Mapper.xml:87~91) — orphan 후보

`UPDATE MCA_SOURCE.${pTable} SET ${sUpdate} WHERE ${sUpdateWhere}` — Java/BPMN 호출 미발견.

---

## §7. Java 트랜잭션

### §7.1 GetMasterRuleData (조회) — 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData | GetMasterRuleData.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cmb.masterRuleData.service` (RULE.md §"패키지 명명 규칙" §3-1 — masterCategoryMng 선례 동일) | - |
| 클래스 | GetMasterRuleData | java:19 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:14, 19 |
| 진입점 | public String run(Context context, Task task) | java:20~21 |
| BPMN 매핑 UserTask | UserTask_067lppc ("Main 조회") class=#{basePackage}GetMasterRuleData | bpmn:40~50 |

#### run(Context, Task) — 단계 전수 (java:20~128)

| 단계 | 동작 | 호출 SQL | 근거 |
|---:|---|---|---|
| 1 | `dao = context.getDao()` / `pTable = context.get("pRuleId")` | - | java:26, 29 |
| 2 | pWhere1~5 / pOperator1~5 / pVal1~5 (15개) context 추출 | - | java:31~47 |
| 3 | `param.put(MYBATIS_WHERE, "RULE_ID = '"+pTable+"'")` → `dao.selectList("TB_MCA_RULE_COL_LIST_Mapper.select", param)` = ds_GetRuleColList | (외부) TB_MCA_RULE_COL_LIST_Mapper.select | java:50~51 |
| 4 | 컬럼정의 루프: COL_TYPE=="VARCHAR2" && pWhereN==COL_ID 이면 `pWhereN = UPPER(pWhereN)` / `pValN = UPPER('pValN')` (대소문자 무시 검색) — 5쌍 | - | java:54~77 |
| 5 | param 에 pTable + pWhere1~5/pOperator1~5/pVal1~5 적재 | - | java:78~93 |
| 6 | ds_srch 에서 countPerPage / currentPage 추출하여 param 적재 (페이징) | - | java:112~116 |
| 7 | `dao.selectList("MasterRuleDataMapper.GetMasterRuleDataList", param)` = ds_GetMasterRuleDataList | GetMasterRuleDataList (#2) | java:118 |
| 8 | `CommonDaoUtil.addDaoResultIntoContext(context, "ds_GetMasterRuleData", size, list, true)` → return null | - | java:119~121 |
| 9 | catch(Exception) → log + `throw new IllegalTaskException(e)` | - | java:122~126 |

비고:
- java:95~110 = 이전(직접 context 값) 방식 블록 주석 — UPPER 래핑 방식으로 대체됨. As-Is 잔존 보존.
- ★ pWhereN/pValN 에 `UPPER(...)` 를 문자열로 직접 감싸 SQL 본문(`${pWhereN} ${pOperatorN} ${pValN}`) 에 치환 — `${}` 치환 + 문자열 함수 조합. To-Be 안전화 §11.

### §7.2 SaveMasterRuleData (저장) — 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData | SaveMasterRuleData.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cmb.masterRuleData.service` | - |
| 클래스 | SaveMasterRuleData | java:24 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:19, 24 |
| 필드 | DynamicSqlExecutor dynamicSqlExecutor (java:27) / SCHEMA="MCA_SOURCE." (java:28) / pkColSet=Set.of("RULE_VER","RULE_SEQ") (java:29) | java:26~29 |
| 진입점 | public String run(Context context, Task task) | java:31~32 |
| BPMN 매핑 UserTask | UserTask_0zyva5v ("Main 저장") class=#{basePackage}SaveMasterRuleData | bpmn:52~61 |

#### run(Context, Task) — 단계 전수 (java:32~190)

| 단계 | 동작 | 호출 | 근거 |
|---:|---|---|---|
| 1 | `sOption = context.get("pOption")` (긴급적용 Y/N) / userInfo→userId 추출 | - | java:37~40 |
| 2 | ds_grdMain / ds_lovData context 추출 | - | java:44~45 |
| 3 | pkDiv(COL_ID→PK_YN) / typeDiv(COL_ID→COL_TYPE) 맵 구성 | - | java:48~56 |
| 4 | ds_grdMain 루프 #1 (updated/deleted 처리) | - | java:63~134 |
| 4.1 | "updated": filterKeyByColId 로 실제 컬럼만 추출 → DATE 14자 절단 → RULE_SEQ 로 sUpdateWhere → setAuditField | - | java:70~84 |
| 4.1a | sOption=="Y"(긴급): `dynamicSqlExecutor.updateData(SCHEMA+pTable, setMap, pkColSet)` | DynamicSqlExecutor | java:87~88 |
| 4.1b | else(기존): `dao.update(pTable+"_Mapper.update", setMap)` (MYBATIS_WHERE=sUpdateWhere) | `${pTable}_Mapper.update` (외부) | java:91~92 |
| 4.2 | "deleted": filterKeyByColId → DATE 절단 → RULE_SEQ WHERE | - | java:104~116 |
| 4.2a | sOption=="Y": `dynamicSqlExecutor.deleteData(SCHEMA+pTable, setMap, pkColSet)` | DynamicSqlExecutor | java:119~120 |
| 4.2b | else: `dao.delete(pTable+"_Mapper.delete", setMap)` | `${pTable}_Mapper.delete` (외부) | java:123~124 |
| 5 | `dao.selectOne("MasterRuleDataMapper.GetMaxRuleSeq", getMap)` = maxRuleSeq | GetMaxRuleSeq (#4) | java:136~138 |
| 6 | ds_grdMain 루프 #2 (inserted 처리) | - | java:140~181 |
| 6.1 | "inserted": maxRuleSeq++ → filterKeyByColId → DATE 절단 → setAuditField → RULE_VER="1" / RULE_SEQ=maxRuleSeq | - | java:146~164 |
| 6.1a | sOption=="Y": `dynamicSqlExecutor.insertData(SCHEMA+pTable, setMap)` | DynamicSqlExecutor | java:167~168 |
| 6.1b | else: `dao.insert(pTable+"_Mapper.insert", setMap)` | `${pTable}_Mapper.insert` (외부) | java:171 |
| 7 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` → return null | - | java:183~184 |
| 8 | catch(Exception) → throw IllegalTaskException | - | java:185~189 |

#### 보조 메서드

| 메서드 | 동작 | 근거 |
|---|---|---|
| filterKeyByColId(ds_grdMain, ds_lovData) | ds_lovData 의 COL_ID 집합 + pkColSet(RULE_VER/RULE_SEQ) 에 속한 키만 LinkedHashSet 으로 필터 → Iterator 반환 (실제 컬럼만 저장) | java:193~214 |
| setAuditField(map, type, userId) | inserted 면 CREATED_OBJECT_TYPE="A"/CREATED_OBJECT_ID=userId/CREATED_PROGRAM_ID="MasterRuleData.SaveMasterRuleData"/CREATION_TIMESTAMP=now. 항상 LAST_UPDATED_* 4종 세팅 (yyyyMMddHHmmss) | java:217~231 |

### §7.3 트랜잭션 경계

- BPMN UserTask "Main 저장"(UserTask_0zyva5v) → "Main 조회"(UserTask_067lppc) 단일 트랜잭션 (catch 시 IllegalTaskException → 전체 롤백).
- nativeeditor_status 3종(updated/deleted/inserted) 한 트랜잭션 내 순차 처리. inserted 는 GetMaxRuleSeq 채번 후 루프 #2 에서 별도 처리.
- 성공 시 `cnt_save`(context key) 누적 (xfdl:684 콜백 표시).
- 긴급적용(pOption=Y) 분기 = Mapper 미경유 DynamicSqlExecutor 직접 — As-Is 주석 "추후에 반드시 Mapper파일 적용"(xfdl:548) 운영 경고 보존.

비고:
- audit 프로그램ID 가 As-Is 패키지명 기준 `"MasterRuleData.SaveMasterRuleData"`(java:223, 229) — To-Be 패키지/프로그램ID 규칙 반영 시 갱신 대상 (Q-006).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterRuleData | bpmn:3 |
| name | 업무기준 DATA관리 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_03tu9nr, SequenceFlow_1jzueym, SequenceFlow_0k1ued4 | - | bpmn:7~11 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu, SequenceFlow_1x309em, SequenceFlow_0dqldpo, SequenceFlow_17wvr16 | bpmn:12~21 |
| Task_0ru18qa | task | lov목록 조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleColList, resultKey=ds_GetRuleColList, isServiceResult=true | SequenceFlow_1x309em | SequenceFlow_03tu9nr | bpmn:24~37 |
| UserTask_067lppc | userTask | Main 조회 | com.dongkuk.dmes.UserTask / class=#{basePackage}GetMasterRuleData | nextBranchSpel="" | SequenceFlow_0grwghu, SequenceFlow_0vcg09z | SequenceFlow_1jzueym | bpmn:40~50 |
| UserTask_0zyva5v | userTask | Main 저장 | com.dongkuk.dmes.UserTask / class=#{basePackage}SaveMasterRuleData | nextBranchSpel="" | SequenceFlow_0dqldpo | SequenceFlow_0vcg09z | bpmn:52~61 |
| Task_02a3gu4 | task | Main 조회 엑셀 Export | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetMasterRuleDataExport, resultKey=ds_GetMasterRuleDataExport, isServiceResult=true | SequenceFlow_17wvr16 | SequenceFlow_0k1ued4 | bpmn:64~77 |

### §8.3 SequenceFlow 전수 (10 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:22 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | UserTask_067lppc (Main 조회) | action=search | bpmn:23 |
| SequenceFlow_1x309em | lov | ExclusiveGateway_1 | Task_0ru18qa (lov목록 조회) | action=lov | bpmn:38 |
| SequenceFlow_03tu9nr | - | Task_0ru18qa | EndEvent_1 | (lov 종료) | bpmn:39 |
| SequenceFlow_1jzueym | - | UserTask_067lppc | EndEvent_1 | (조회 종료) | bpmn:51 |
| SequenceFlow_0dqldpo | save | ExclusiveGateway_1 | UserTask_0zyva5v (Main 저장) | action=save | bpmn:62 |
| SequenceFlow_0vcg09z | - | UserTask_0zyva5v | UserTask_067lppc | (저장 후 재조회) | bpmn:63 |
| SequenceFlow_0k1ued4 | - | Task_02a3gu4 | EndEvent_1 | (export 종료) | bpmn:78 |
| SequenceFlow_17wvr16 | search_export | ExclusiveGateway_1 | Task_02a3gu4 (Main 조회 엑셀 Export) | action=search_export | bpmn:79 |

비고: 인용 flow는 9 — bpmn 본문에 정의된 sequenceFlow 요소 수 = 9 (SequenceFlow_1 / 0grwghu / 1x309em / 03tu9nr / 1jzueym / 0dqldpo / 0vcg09z / 0k1ued4 / 17wvr16). (제목의 "10개" 표기 정정: **9개**.)

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → UserTask_067lppc(Main 조회) → End | GetMasterRuleData.run() → GetMasterRuleDataList(#2) |
| lov | Start → Gateway → Task_0ru18qa(lov목록 조회) → End | CommonSelectTask → GetRuleColList(#1) |
| save | Start → Gateway → UserTask_0zyva5v(Main 저장) → UserTask_067lppc(Main 조회) → End | SaveMasterRuleData.run() → (재조회) GetMasterRuleData.run() → GetMasterRuleDataList(#2) |
| search_export | Start → Gateway → Task_02a3gu4(Main 조회 엑셀 Export) → End | CommonSelectTask → GetMasterRuleDataExport(#3) |

비고:
- save 만 후속 조회(UserTask_067lppc) 연결 — search/lov/search_export 는 단일 task 후 즉시 End.
- BPMN sqlKey 패턴 = `#{serviceId}Mapper.{sqlId}` — serviceId 는 oasis 런타임 주입 (As-Is="MasterRuleData" → "MasterRuleDataMapper.{sqlId}"; To-Be="masterRuleData").
- Java(GetMasterRuleData) 가 내부에서 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 를 추가 호출 — BPMN lov flow 와 별개로 search 시에도 컬럼정의를 한 번 더 조회.

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 405 | 104 | 36 | 36 | bpmn:84 |
| EndEvent_1 | 405 | 639 | 36 | 36 | bpmn:90 |
| ExclusiveGateway_1 | 398 | 180 | 50 | 50 | bpmn:96 |
| Task_0ru18qa | 156 | 357 | 164 | 50 | bpmn:114 |
| UserTask_067lppc | 343 | 357 | 160 | 50 | bpmn:130 |
| UserTask_0zyva5v | 532 | 357 | 160 | 50 | bpmn:137 |
| Task_02a3gu4 | 720 | 357 | 164 | 50 | bpmn:152 |

---

## §9. 사용 테이블

> **★ 메타 테이블 존재 / 동적 데이터 테이블만 동적 (§0 구분).** 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx`. 메타 2테이블(§9.2 TB_MCA_RULE_COL_LIST sheet134 / §9.3 TB_MCA_RULE_MASTER sheet135)은 카탈로그에 **수록 — 컬럼 정의 정상 매핑** (Q-001 메타 부분 해소). 동적 데이터 테이블(§9.1 TB_MCA_<업무기준ID>)은 런타임 인스턴스라 고정 DDL 미수록(정상)이며, 그 영속/생성 전략 = **Q-001 확정: As-Is 동일 'DDL on-demand'** (업무기준ID별 실테이블 `TB_MCA_<업무기준ID>` 동적 생성/조회, owner=MCAAPUSER — 사용자 확정 2026-06-04).

### §9.1 MCA_SOURCE.TB_MCA_<업무기준ID> (= `${pTable}`, 동적 주 테이블)

| 컬럼 | 본 화면 사용 | 용도 | 근거 |
|---|---|---|---|
| RULE_SEQ | ✓ | PK 채번 (GetMaxRuleSeq) / ROW_NUMBER 정렬 / Update·Delete WHERE / inserted 시 maxRuleSeq+1 | Mapper.xml:40, 73, 77 / java(Save):78, 112, 138, 163 / pkColSet java:29 |
| RULE_VER | ✓ | PK (pkColSet) / inserted 시 "1" 고정 | java(Save):29, 162 |
| (동적 컬럼들) | ✓ | ds_lovData(TB_MCA_RULE_COL_LIST) 정의 기반 — COL_ID 별 가변 | xfdl:597 / Mapper.xml:42 ${pTable} SELECT * |
| CREATED_OBJECT_TYPE/ID, CREATED_PROGRAM_ID, CREATION_TIMESTAMP | ✓ (inserted) | audit 입력 (setAuditField) | java(Save):221~224 |
| LAST_UPDATED_OBJECT_TYPE/ID, LAST_UPDATE_PROGRAM_ID, LAST_UPDATE_TIMESTAMP | ✓ | audit 갱신 (setAuditField — 항상) | java(Save):227~230 |

PK 추정: `(RULE_VER, RULE_SEQ)` 복합 (pkColSet — java:29). 동적 컬럼 집합은 업무기준별로 상이.

### §9.2 MCA_SOURCE.TB_MCA_RULE_COL_LIST (컬럼정의 테이블 — DMES MCA Excel sheet134 수록)

> **To-Be 카탈로그 존재.** 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet134 에 업무컬럼 11종 + 공통감사 17컬럼 = 28 컬럼 수록. 본 화면 사용 컬럼은 카탈로그 타입과 1:1 매핑된다 (Q-001 메타 부분 해소).

| 컬럼 | 본 화면 사용 | 용도 | To-Be 카탈로그 타입 (sheet134) | 근거 |
|---|---|---|---|---|
| RULE_VER | (PK 일부) | 업무기준 버전 | NUMBER(8,2) | Excel sheet134 / Mapper.xml(미직접 SELECT) |
| RULE_ID | ✓ | JOIN 키 (RMASTER) + WHERE / 업무기준ID | VARCHAR(10) | Mapper.xml:8, 25, 27 / java(Get):50 |
| COL_SEQ | ✓ | 컬럼 정렬 / 항목순서 | NUMBER(3) | Mapper.xml:9, 29 |
| COL_ID | ✓ | 동적 컬럼 bind 키 / 항목ID | VARCHAR(30) | Mapper.xml:10 / xfdl:597, 611 |
| COL_NM | ✓ | 동적 컬럼 헤더명 / 항목명 | VARCHAR(100) | Mapper.xml:11 / xfdl:600, 607 |
| OLD_COL_ID | (미사용) | 기존항목ID | VARCHAR(100) | Excel sheet134 |
| COL_LEN | ✓ (주석) | editmaxlength (xfdl:615 임시 주석) / 항목길이 | NUMBER(5) | Mapper.xml:12 |
| COL_PREC_LEN | ✓ | 정밀도 / 항목소수점길이 | NUMBER(5) | Mapper.xml:13 |
| MES_COL_ID | ✓ | MES 매핑 컬럼 / MES테이블항목명 | VARCHAR(50) | Mapper.xml:14 |
| MASTER_CODE_DIV (AS CODE_YN) | ✓ | 코드 여부 | VARCHAR(2) | Mapper.xml:15 |
| IO_FLAG | ✓ | head 색 IN(red)/OUT(blue) / IN/OUT여부 | VARCHAR(10) | Mapper.xml:22 / xfdl:603, 608 |
| COL_TYPE | ✓ | 타입 (VARCHAR2→UPPER 검색 / DATE→캘린더·14자절단) / 항목형식 | VARCHAR(10) | Mapper.xml:21 / java(Get):56 / java(Save):77, 111, 154 |
| (공통감사 17 컬럼) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | (감사 표준) | Excel sheet134 |

비고: PK_YN(ds_lovData) 는 카탈로그 컬럼이 아니라 Mapper #1 서브쿼리(ALL_CONS_COLUMNS PK 판정)로 런타임 산출 — sheet134 미수록 정상.

### §9.3 MCA_SOURCE.TB_MCA_RULE_MASTER (업무기준 마스터 — JOIN 전용 / DMES MCA Excel sheet135 수록)

> **To-Be 카탈로그 존재.** 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet135 에 26 컬럼 수록 (업무컬럼 9 + 공통감사 17, masterRuleList §9.1 전수 매핑 정합). 본 화면은 JOIN 키 RULE_ID 만 직접 참조하나, To-Be 카탈로그 전체 컬럼을 아래에 매핑한다 (Q-001 메타 부분 해소). 영문명+NULL여부 정본 (sheet135 한글/Type 오정렬 → masterRuleList §7 정합).

| 컬럼 | 본 화면 사용 | 용도 / NULL여부 | 근거 |
|---|---|---|---|
| RULE_VER | (마스터 PK 일부) | 업무기준 버전 | Excel sheet135 |
| RULE_ID | ✓ | GetRuleColList JOIN (`RMASTER.RULE_ID = RCLIST.RULE_ID`) + WHERE / PK, NOT NULL | Mapper.xml:23, 25, 27 / Excel sheet135 |
| OLD_RULE_ID | (미사용) | 기존 업무기준ID | Excel sheet135 |
| RULE_NM | (미직접 SELECT) | 업무기준명 / NOT NULL (P-001 콜백으로 표시) | Excel sheet135 |
| RULE_DESC | (미사용) | 업무기준 설명 | Excel sheet135 |
| RULE_TP | (미사용) | 업무기준 유형 | Excel sheet135 |
| RULE_OWNER_DEPT_NM | (미사용) | 담당부서명 | Excel sheet135 |
| RULE_OWNER_EMP_NO | (미사용) | 담당자 사번 | Excel sheet135 |
| USE_TP | (미사용) | 사용 구분 | Excel sheet135 |
| (공통감사 17 컬럼) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | Excel sheet135 (masterRuleList §9.1 r6~r22) |

비고: 업무기준명(edt_ruleNm)·업무기준ID(edt_ruleId) 는 P-001(MasterRuleListPop) 콜백으로 채워짐 — 본 화면 SQL 에서 RULE_MASTER 의 명칭 컬럼 직접 SELECT 는 없음.

### §9.4 DMES Excel 매핑

- 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx` (masterRuleList 와 동일 MCA 정의서). **메타 2테이블 수록 확인**: TB_MCA_RULE_COL_LIST (sheet134) / TB_MCA_RULE_MASTER (sheet135, 26 컬럼). → §9.2/§9.3 매핑.
- **동적 데이터 테이블** TB_MCA_<업무기준ID> 는 업무기준ID 별 런타임 인스턴스라 고정 DDL 미수록(정상) — 카탈로그 부재가 아니라 동적 전략 이슈(§9.1 / Q-001).
- 정본 스키마 owner: As-Is 는 `MCA_SOURCE` (Oracle synonym 추정). masterRuleList §9.1 카탈로그 owner = **MCAAPUSER**. To-Be 스키마 확정은 메타 테이블 owner=MCAAPUSER 정합 / 동적 테이블 owner 정책 = Q-001 (동적전략) 일부.

---

## §10. 코드값 / LoV

| 항목 | 내용 | 근거 |
|---|---|---|
| 연산자 콤보 (정적 LoV) | LIKE / = / <= / >= (5 콤보 cbo_operator1~5 모두 동일 인라인 Dataset) | xfdl:29~52 외 4 |
| 컬럼선택 콤보 (동적 LoV) | cbo_lov1~5 = ds_lov1~5 = ds_lovData(컬럼정의) 복사 + "조건N" 헤더행 (lov 콜백) | xfdl:652~676 |
| 그리드 동적 컬럼 | ds_lovData(TB_MCA_RULE_COL_LIST) — COL_ID/COL_NM/PK_YN/COL_TYPE/IO_FLAG 메타 | xfdl:593~617 |
| STATUS (그리드 col 2) | Nexacro auto row state (ColumnInfo 미선언) — To-Be FE 동일 구현 | xfdl:190, 195, 229 |
| 긴급적용 (chk_option) | Y/N — Y 시 DynamicSqlExecutor 직접 (Mapper 미경유) | xfdl:167, 546 / java(Save):37, 87 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 페이징 | `ROW_NUMBER() OVER(ORDER BY RULE_SEQ)` + `WHERE SEQ BETWEEN ...` (CTE) | Mapper.xml:40, 66 | MSSQL 도 `ROW_NUMBER() OVER` 지원 — 또는 `OFFSET/FETCH` 권장 |
| NVL | `NVL(#{x},1)` / `NVL(MAX(RULE_SEQ),0)` | Mapper.xml:35, 77 | `ISNULL(...)` 또는 `COALESCE(...)` |
| DUAL | `FROM dual` (CTE PARAM) | Mapper.xml:35 | DUAL 미존재 — `(VALUES(...))` 또는 dual 제거 |
| 문자열 결합 | `'TB_MCA_' \|\| #{pRuleId}` | Mapper.xml:18 | `'TB_MCA_' + #{pRuleId}` 또는 CONCAT |
| 시스템 카탈로그 PK 판정 | `ALL_CONS_COLUMNS` + `NVL2(MAX(CONSTRAINT_NAME),'Y','N')` | Mapper.xml:16~20 | `sys.indexes`/`INFORMATION_SCHEMA.KEY_COLUMN_USAGE` 등가 변환 (또는 메타 컬럼 직접 보유) |
| UPPER 검색 | `UPPER(col)` / `UPPER('val')` 문자열 주입 | java(Get):58~75 | MSSQL `UPPER()` 동일 — 단 `${}` 치환 안전화 동반 |
| 스키마명 | `MCA_SOURCE.{TABLE}` (Oracle synonym 추정) | Mapper.xml/java 다수 | 메타 테이블 owner = **MCAAPUSER** (DMES-SECTION-MCA 정합, masterRuleList §9.1). 동적 데이터 테이블 owner/스키마 정책 = **Q-001 (동적전략)** 일부 |
| 동적 테이블/컬럼 `${pTable}`/`${pColumns}`/`${pValues}`/`${sUpdate}`/`${sUpdateWhere}`/`${pWhereN}`/`${pOperatorN}`/`${pValN}` | MyBatis `${}` 치환 (SQL injection 표면) | Mapper.xml 다수 / java(Get):78~93 | **To-Be 안전화 필수** — 화이트리스트(컬럼정의 메타 검증) + 파라미터 바인딩. 임의 컬럼/연산자/테이블 치환 차단 (Q-007) |
| 긴급적용 DynamicSqlExecutor | Mapper 미경유 동적 SQL 직접 (pOption=Y) | java(Save):27, 87, 120, 168 | To-Be 동적 SQL 실행기 등가물 + "추후 Mapper 적용" 운영경고 정책 재검토 (Q-008) |
| 외부 동적 Mapper | `${pTable}_Mapper.update/delete/insert` (기존방식 분기) | java(Save):92, 124, 171 | 테이블별 개별 Mapper — To-Be 동적 영속 전략 결정 (Q-005 / Q-007) |
| audit | setAuditField (CREATED_*/LAST_UPDATE_* 8 컬럼 수기) | java(Save):217~231 | cactus-core `CactusAuditEntity` 적용 검토 — 단 동적 테이블이라 엔티티 매핑 비표준 (Q-006) |
| orphan SQL #5/#6 | InsertMasterRuleSpecDataList / UpdateMasterRuleSpecDataList (호출 ✗) | Mapper.xml:81~91 | **Q-005 위임** (보존 vs 제거) |
| Java 패키지 | `com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData.*` | java 2종 | **To-Be**: Service = `com.dongkuk.dmes.mcm.cmb.masterRuleData.service.*` (masterCategoryMng 선례) |
| audit 프로그램ID | `"MasterRuleData.SaveMasterRuleData"` | java(Save):223, 229 | To-Be 프로그램ID 규칙 반영 (Q-006) |

---

## §12. 결정 누적 / 확인필요 (Q-NNN)

> 본 화면은 동적 테이블/컬럼 + 동적 영속 전략. **사용자 확정 2026-06-04**: **Q-001 = 동적 데이터 테이블 To-Be 전략 = As-Is 동일 'DDL on-demand'** (업무기준ID별 실테이블 `TB_MCA_<업무기준ID>` 동적 생성/조회, owner=MCAAPUSER) / **Q-008 = 긴급적용 `DynamicSqlExecutor` 직접실행 경로 As-Is 유지** (+ 동적SQL 안전화). 함께 확정: Q-002(초기값 USD/KR-A 보존)·Q-003(FE 동적그리드 동일 구현)·Q-005(orphan SQL #5/#6 제거)·Q-006(audit McmAuditEntity + 프로그램ID 규칙)·Q-007(동적 `${}` 치환 화이트리스트+바인딩 안전화 적용)·영속성(JPA). **활성 확인필요 = 0 건** (Q-004 부모 = 호출관계 조사로 "메뉴(포털) 직접 진입, GUI 부모 없음" 해소 2026-06-05). 메타 테이블은 DMES-SECTION-MCA 수록 확인으로 해소.

| Q-NNN | 영역 | 확인 내용 | 본문 |
|---|---|---|---|
| Q-001 | 동적 데이터 테이블 To-Be 전략 | **메타 테이블(TB_MCA_RULE_COL_LIST sheet134 / TB_MCA_RULE_MASTER sheet135) = DMES-SECTION-MCA 수록 확인 → 해소.** 잔존 핵심: 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 의 To-Be 영속/생성 전략 — (i) DDL on-demand(업무기준별 실테이블 생성) / (ii) 정규화 EAV / (iii) JSON 컬럼 등 선택지 사용자 결정 필요(임의 확정 금지) + 동적 테이블 owner/스키마 정책 | §0 / §9.1 |
| Q-002 | 초기값 | edt_ruleId/edt_ruleNm="USD", edt_val1="KR/A" As-Is 초기값 To-Be 보존 여부 | §3.2 |
| Q-003 | 동적 그리드 | ds_lovData 기반 동적 컬럼 빌드(PK ` * `/IN·OUT 색/DATE 캘린더/폭) FE 동일 구현 방식 | §3.3 |
| Q-004 | in-coming | 본 화면을 호출하는 외부 화면 — **해소: 메뉴(포털) 직접 진입, GUI 부모 없음** (호출관계 조사 2026-06-05; csa/CommSyncMng 는 데이터 동기화 프로그램으로 화면 호출 아님) | §5.2 |
| Q-005 | orphan SQL | InsertMasterRuleSpecDataList / UpdateMasterRuleSpecDataList (#5/#6) 보존 vs 제거 | §6 |
| Q-006 | audit | 동적 테이블 audit (setAuditField 8컬럼) → cactus-core 적용 가능 여부 + 프로그램ID 규칙 | §7 / §11 |
| Q-007 | 동적 SQL 안전화 | `${pTable}`/`${pColumns}`/`${pWhereN}` 등 치환 화이트리스트·바인딩 전략 (injection 차단) | §11 |
| Q-008 | 긴급적용 | chk_option(긴급적용) + DynamicSqlExecutor 직접실행 경로 To-Be 유지 여부 + "추후 Mapper 적용" 정책 | §3.2 / §11 |

| 결정 영역 (선례 동일 — 잠정) | 잠정 방향 | 본문 |
|---|---|---|
| 통신 채널 | OASIS REST (cactus 표준) | BPMN §1 |
| 권한 | To-Be 외부 권한 프로세스 위임 | 기능 §8 |
| Java 패키지 | Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleData.{service,dto}.*` (masterCategoryMng 선례) | §7 / §11 |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| G1 | xfdl 컴포넌트 전수 (영역 5 + 조회조건 21(S-001~S-021) + 그리드 1 + 보조 7(C-001~C-007)) | ○ | §3 |
| G2 | 그리드 columns 전수 (정적 3 + 동적 N — 빌드 로직 전수) | ○ | §3.3 |
| G3 | Dataset 전수 (ds_grdMain / ds_lovData / ds_lov1~5 / ds_srch / ds_common / ds_grdDownload = 11) | ○ | §3.3 |
| G4 | java 메서드 전수 (Get: run / Save: run + filterKeyByColId + setAuditField) | ○ | §7 |
| G5 | Mapper.xml SQL 전수 (6 — orphan 후보 #5/#6 표기) | ○ | §6 |
| G6 | bpmn flow 노드 전수 (Start/End + Gateway + Task 2 + UserTask 2 = 6 노드, sequenceFlow 9) | ○ | §8.2, §8.3 |
| G7 | action 매트릭스 일치 (search/lov/save/search_export + client-side 6) | ○ | §4.6 |
| G8 | 식별자 cite (모든 본문 주장 file:line) | ○ | 본 문서 전수 |
| G9 | 활성 확인필요 = 0 (Q-004 부모 = 메뉴 진입 해소 2026-06-05) — Q-001·Q-002/3/5/6/7/8·영속성 확정 | ○ | §12 |
| G10 | Runner 미적용 명시 / 메타 테이블(DMES-SECTION-MCA 수록) ↔ 동적 데이터 테이블(런타임 인스턴스, Q-001 동적전략) 구분 명시 | ○ | §0, §9, 정합체크서 §D.4 |
