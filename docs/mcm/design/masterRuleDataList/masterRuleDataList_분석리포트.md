---
screenId: masterRuleDataList
asIsId: MasterRuleDataList
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
---

# 업무기준 상세조회 (masterRuleDataList) 분석리포트

> 본 문서 = 6종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — 입력 자산은 mui (xfdl/Java 1종/Mapper.xml/bpmn) 4종 + DMES Excel 1종). manifest 폴더 금지(R-14 미적용).
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow) 로 매핑. 템플릿 절/표 헤더는 삭제하지 않고 "해당 없음(WinForms 미해당 — mui 등가: ...)" 로 유지.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / java 메서드 전수 / Mapper.xml SQL 전수 / bpmn flow 전수). xfdl 603 lines 전수 정독 (offset 분할: 1~302 / 303~603).
- As-Is DB = Oracle (`NVL` / `ROW_NUMBER() OVER` / `dual` / `ALL_CONS_COLUMNS` 시스템 카탈로그 / `'TB_MCA_' || #{pRuleId}` 문자열 결합 / `UPPER()` 래핑 / schema `MCAAPUSER` 명시). To-Be DB = MSSQL. §11 변환점 명시.
- **★ 본 화면은 형제 화면 `masterRuleData`(업무기준 Data관리)의 조회 전용(read-only) 서브셋이다.** 즉 동적 컬럼/동적 테이블 화면이지만, masterRuleData 와 달리 **저장 트랜잭션(SaveMasterRuleData)·행추가/복사/삭제/취소·긴급적용·PK 필수검증·GetMaxRuleSeq 채번·orphan SQL·DynamicSqlExecutor 가 모두 없다.** 본 화면의 action 은 `search`/`lov`/`search_export` 3종뿐이며(xfdl:398, 429, 571 / bpmn:22, 37, 64), 그리드는 읽기 전용(편집 불가, 동적 셀에 edittype 미지정 — xfdl:451~466). 대신 **마스터코드 셀(CODE_YN=='Y')을 클릭하면 마스터코드 조회 팝업(cma::MasterCodeSelPop)을 띄우는 기능을 추가**로 가진다(xfdl:583~595).
- **★ 동적 컬럼·동적 테이블 화면 — 본질.** ① 그리드 컬럼을 `ds_lovData`(= `TB_MCA_RULE_COL_LIST` 컬럼정의) 기반으로 **런타임 동적 생성**하고(xfdl:451~467), ② 조회 대상 테이블명을 `TB_MCA_<업무기준ID>` 로 **런타임 동적 결정**한다(xfdl:402, 433 / Mapper `${pTable}`). 동적 로직은 §3.3 / §6 / §7 에 전수 명시.
- **★ 메타 테이블은 To-Be 카탈로그에 존재 / 동적 데이터 테이블만 미수록(정상).** 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx`. 본 화면 사용 테이블은 성격이 2종으로 구분된다:
  - **(a) 메타 테이블 — 카탈로그 존재.** `TB_MCA_RULE_COL_LIST` (sheet134, 컬럼정의, owner=`MCAAPUSER.TB_MCA_RULE_COL_LIST` — Python xml 파싱 실측 B2) + `TB_MCA_RULE_MASTER` (sheet135, 26 컬럼, 업무기준 마스터, masterRuleList §9.1 정합). 두 테이블의 To-Be 컬럼 카탈로그는 §9.2/§9.3 에 실제 매핑한다. 메타 테이블 "미정의" 는 **오탐 — 해소** (Q-001a Resolved).
  - **(b) 동적 데이터 테이블 — 카탈로그 미수록(정상).** `MCAAPUSER.TB_MCA_<업무기준ID>` (= 런타임 `${pTable}`) 는 업무기준ID 별로 가변 생성되는 인스턴스 테이블 — 카탈로그에 고정 DDL 이 없는 것이 정상이며 "테이블 부재" 가 아니다. To-Be 동적 데이터 테이블 영속/접근 전략 = **Q-001b 확정(가족 공통 2026-06-04): As-Is 동일 'DDL on-demand'** (업무기준ID별 실테이블 `TB_MCA_<업무기준ID>` 동적 조회, owner=MCAAPUSER).
- 동적 스키마: As-Is 는 `MCAAPUSER` 를 고정 사용(Mapper.xml:23~24 / java:49). 단 호출 팝업 P-001(MasterRuleListPop) 에는 `oArg={ sSchema:"MCAAPUSER" }` 를 명시 전달(xfdl:544~546). 가족 공통 결정: `${sSchema}` 미전달 시 기본 = MCAAPUSER.

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterRuleDataList | MasterRuleDataList.xfdl:3 (`<Form id="MasterRuleDataList" ...>`) |
| 화면 ID (To-Be) | masterRuleDataList | 사용자 결정 (모듈 mcm + As-Is 화면명 lowerCamel) |
| 화면명 | 업무기준 상세조회 | MasterRuleDataList.xfdl:3 (`titletext="업무기준 상세조회"`) / xfdl:9 (`value="업무기준 상세조회"`) / bpmn:3 (`name="업무기준 상세조회"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 사용자 결정 (테이블 카탈로그 = DMES-SECTION-MCA 정의서 대응) / 01_Agent부속_가이드.md §A.2.3 cmb 등재 |
| 모듈 그룹 | cmb — 한글명 **"업무기준 관리(원장)"** | 자산 경로: `mui/src/nxuiMui/cmb/` / `mappers-cmb/` / `services/cmb/` |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 상세조회 (masterRuleDataList) | - |
| 화면 크기 | 1280 × 670 | MasterRuleDataList.xfdl:3 (`width="1280" height="670"`) |
| onload 핸들러 | MasterRuleDataList_onload | MasterRuleDataList.xfdl:3 / xfdl:337 |
| 최초 생성 | 2019.11.21 최민수 | MasterRuleDataList.xfdl:314 |
| 수정 | 2020.05.08 최규찬 | MasterRuleDataList.xfdl:315 |
| 화면 성격 | 업무기준(프레임)에 매핑된 실데이터의 **조회 전용**(동적 컬럼/동적 테이블 단일 그리드 + 5조건 LoV 검색 + 페이징 + 엑셀 Export + 마스터코드 셀 조회 팝업) — CRUD 중 R 만 | xfdl:353~357 (우측 메뉴 btn_excelDown 1종) / xfdl:174 (그리드 읽기 전용) |
| 주 사용 테이블 (동적) | MCAAPUSER.TB_MCA_<업무기준ID> (= `${pTable}`, 런타임 결정) | MasterRuleDataListMapper.xml:42, 71 / GetMasterRuleDataList.java:29, 83 / xfdl:402, 433 |
| 컬럼정의 테이블 | MCAAPUSER.TB_MCA_RULE_COL_LIST (+ JOIN TB_MCA_RULE_MASTER) | MasterRuleDataListMapper.xml:7~30 / GetMasterRuleDataList.java:51 |
| 트랜잭션 클래스 (조회 1종) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList.GetMasterRuleDataList | GetMasterRuleDataList.java:1 / MasterRuleDataList.bpmn:43 |
| BPMN 프로세스 ID | MasterRuleDataList | MasterRuleDataList.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleDataList.bpmn:3 |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 (절대) | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleDataList.xfdl | 603 | nexacro Form + Script (조회 전용 — 13 함수) |
| 2 | Java (UserTask — 조회) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleDataList\GetMasterRuleDataList.java | 135 | implements Wow — 동적 조회 트랜잭션 (저장 클래스 없음) |
| 3 | Mapper.xml | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleDataListMapper.xml | 74 | namespace=MasterRuleDataListMapper, 3 SQL |
| 4 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleDataList.bpmn | 143 | Camunda Modeler 3.1.2 |
| 5 | DMES 테이블 정의서 | docs\external\DMES\DMES-SECTION-MCA_테이블정의서.xlsx | (xlsx) | **메타 2테이블 수록: TB_MCA_RULE_COL_LIST (sheet134, B2=MCAAPUSER.TB_MCA_RULE_COL_LIST) / TB_MCA_RULE_MASTER (sheet135, 26 컬럼, B2=MCAAPUSER.TB_MCA_RULE_MASTER) — §9.2/§9.3 매핑. 동적 데이터 테이블 TB_MCA_<업무기준ID> 는 런타임 인스턴스라 미수록(정상) — §0(b) / Q-001b (DDL on-demand)** |

추가 외부 참조(본 화면 자산에 미포함, 인용으로만 사용):
- `TB_MCA_RULE_COL_LIST_Mapper.select` (GetMasterRuleDataList.java:51 호출) — 컬럼정의 조회 SQL. 정의 본문은 본 화면 Mapper.xml(MasterRuleDataListMapper) 외부의 별도 Mapper 파일.
- 호출 팝업 2종: `cmb::MasterRuleListPop.xfdl` (업무기준 선택 — xfdl:548) / `cma::MasterCodeSelPop.xfdl` (마스터코드 조회 — xfdl:593). 본 화면에서 호출만, 정의는 형제 화면(masterRuleListPop 설계서 / cma 모듈).

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:6 |
| A-002 | 조회조건 (업무기준 + 5조건 LoV) | div_search | top=div_title:0, left=20, right=20, height=68 | xfdl:19 |
| A-003 | 접기 토글 | btn_fold | top=div_search:0, left=20, right=20, height=15 | xfdl:170 |
| A-004 | 메인 (그리드 + 우측 메뉴 + 페이징 + 다운로드 그리드) | div_main | top=btn_fold:5, left=20, right=20, bottom=40 | xfdl:171 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:217 |

### §3.2 조회조건 (S-NNN) — div_search

| S-NNN | xfdl id | 종류 | 라벨 | 초기 value / text | 폭 | readonly | innerdataset | 파라미터 | 근거 |
|---|---|---|---|---|---:|---|---|---|---|
| S-001 | stc_ruleId | Static (라벨) | 업무기준 ID | "업무기준 ID" | 80 | - | - | (라벨) | xfdl:22 |
| S-002 | edt_ruleId | Edit | (업무기준 ID — 필수, readonly) | text="USD" | 100 | true | - | pRuleId / pTable(=`TB_MCA_`+값) | xfdl:23 |
| S-003 | stc_ruleNm | Static (라벨) | 업무기준명 | "업무기준명" | 80 | - | - | (라벨) | xfdl:24 |
| S-004 | edt_ruleNm | Edit | (업무기준명, readonly) | text="USD" | 260 | true | - | pRuleNm (lov 송신용) | xfdl:25 |
| S-005 | btn_ruleId | Button | 업무기준 | "업무기준" | 69 | - | - | (팝업 호출 P-001) | xfdl:26 |
| S-006 | cbo_lov1 | Combo | 조건1 | text="조건1" index=-1 | 100 | - | ds_lov1 (codecolumn=COL_ID / datacolumn=COL_NM) | pWhere1 | xfdl:27 |
| S-007 | cbo_operator1 | Combo | 연산자 | text="연산자" index=0 | 50 | - | innerdataset (LIKE/=/<=/>=) | pOperator1 | xfdl:28~53 |
| S-008 | edt_val1 | Edit | (조건1 값) | (없음) | 60 | - | - | pVal1 | xfdl:54 |
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

비고:
- edt_ruleId / edt_ruleNm 둘 다 `text="USD"` 초기값 보존 (xfdl:23/25 — 원본 그대로). **To-Be 동일 보존** (가족 선례 Q-002 확정 — 사용자 2026-06-04).
- edt_ruleId 는 `readonly="true"` + `cssclass="Essential"` (필수) — 직접 입력 불가, 업무기준 버튼(S-005)→팝업으로만 채움 (xfdl:23, 26, 540~549).
- **★ masterRuleData 와 달리 본 화면에는 `chk_option`(긴급적용) 체크박스가 없다** — 조회 전용이라 저장 분기 자체가 없음.
- 5조건 LoV 콤보(cbo_lov1~5) 의 innerdataset(ds_lov1~5) 는 업무기준 선택 후 `fn_callBack` 의 `case "lov"`(xfdl:502~529) 에서 `ds_lovData` 복사 + "조건N" 헤더행 삽입으로 동적 구성 — 컬럼 선택 LoV.
- 각 연산자 콤보(cbo_operator1~5) 의 innerdataset 은 xfdl 인라인 정적 Dataset (LIKE / = / <= / >= 4행) — 5개 콤보 모두 동일 (xfdl:29~52, 57~80, 85~108, 113~136, 141~164).

### §3.3 결과 그리드 G-001 — div_main.grdMain (binddataset=ds_grdMain) — ★동적 컬럼·읽기 전용

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grdMain | xfdl:174 |
| binddataset | ds_grdMain | xfdl:174 |
| cellmovingtype / cellsizingtype | col / col | xfdl:174 |
| selecttype | multiarea | xfdl:174 |
| autosizingtype | col | xfdl:174 |
| oncellclick | div_main_grdMain_oncellclick (마스터코드 셀 클릭 → P-002) | xfdl:174 / xfdl:583 |
| onheadclick | div_main_grdMain_onheadclick (정렬) | xfdl:174 / xfdl:598 |
| 행 높이 | 25 (head/body 공통) | xfdl:181~182 |

#### Grid 정적 컬럼 (Format default — 초기 1 col, xfdl:175~191)

| col | head text | bind | displaytype | edittype | 근거 |
|---:|---|---|---|---|---|
| 0 | 순번 | SEQ | normal | - (읽기 전용) | xfdl:185, 188 |

비고: masterRuleData 의 정적 3컬럼(CHK/SEQ/STATUS) 과 달리 본 화면 정적 컬럼은 **순번(SEQ) 단 1개**뿐 — 저장 대상 체크박스(CHK)·행 상태 아이콘(STATUS)이 없다(조회 전용).

#### Grid 동적 컬럼 (런타임 추가 — fn_callBack "search" / xfdl:451~467)

| 동작 | 상세 | 근거 |
|---|---|---|
| 추가 트리거 | search 콜백 성공(nErrorRule==0) 시 `ds_lovData.rowcount` 만큼 반복 | xfdl:451 |
| 컬럼 추가 | `grdMain.appendContentsCol("body")` (col index = i+1) | xfdl:453 |
| head text | `ds_lovData.getColumn(i, "COL_NM")` (COL_NM 그대로 — PK ` * ` prefix 없음) | xfdl:458 |
| 컬럼 폭 | `13 * COL_NM.length` (한글 길이 기반 자동) + autosizecol="limitmin" | xfdl:459~460 |
| body bind | `text = "bind:"+COL_ID` | xfdl:461 |
| DATE 타입 처리 | `sColType=="DATE"` 면 calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" | xfdl:455~457 |
| ★ 마스터코드 컬럼 스타일 | `CODE_YN=="Y"` 면 cssclass="cellBody_fontColor_blue, cellBody_underline" + cursor="pointer" (클릭 가능 표시) | xfdl:463~466 |
| 재조회 시 초기화 | fn_search 진입 시 `grdMain.deleteContentsCol("body", 1, true)` 로 기존 동적 컬럼(1번 이후) 전수 제거 후 ds_grdMain.clearData() | xfdl:392~396 |

비고:
- 동적 컬럼은 `ds_lovData`(컬럼정의) 의 COL_ID/COL_NM/CODE_YN/COL_TYPE 메타로 생성 — 컬럼 개수·이름·타입이 선택한 업무기준에 따라 가변. masterRuleData 와 달리 **IO_FLAG 색상·PK ` * ` prefix·edittype·CHK cssclass 처리는 없다**(조회 전용). **To-Be FE 동적 그리드 컬럼 빌드 동일 구현** 필요 (Q-003).
- **★ 마스터코드 셀(CODE_YN=='Y') 은 파란 밑줄·포인터 커서로 렌더되고, 클릭 시 마스터코드 조회 팝업(P-002)을 호출**한다 (xfdl:463~466 스타일 + xfdl:583~595 oncellclick). 이는 masterRuleData 에는 없는 본 화면 고유 기능이다.

#### Dataset 컬럼 전수 (ds_grdMain — xfdl:221~236)

| 컬럼 ID | type | size | 근거 |
|---|---|---:|---|
| RULE_ID | STRING | 256 | xfdl:223 |
| OLD_RULE_ID | STRING | 256 | xfdl:224 |
| RULE_NM | STRING | 256 | xfdl:225 |
| RULE_DESC | STRING | 256 | xfdl:226 |
| RULE_VER | STRING | 256 | xfdl:227 |
| RULE_TP | STRING | 256 | xfdl:228 |
| RULE_OWNER_DEPT_NM | STRING | 256 | xfdl:229 |
| RULE_OWNER_EMP_NO | STRING | 256 | xfdl:230 |
| USE_TP | STRING | 256 | xfdl:231 |
| CREATION_TIMESTAMP | STRING | 256 | xfdl:232 |
| LAST_UPDATED_OBJECT_ID | STRING | 256 | xfdl:233 |
| LAST_UPDATE_TIMESTAMP | STRING | 256 | xfdl:234 |

비고: ds_grdMain 의 선언 컬럼 12개는 업무기준 마스터 성격 컬럼이나, 실제 조회 결과(동적 데이터 테이블 `${pTable}`)의 동적 업무기준 컬럼은 모두 콜백에서 런타임 addColumn(`bind:`+COL_ID)된다. SEQ·TOTALCOUNT 등은 SQL 결과로 매핑. (선언 컬럼은 masterRuleList 계열 잔존 — As-Is 보존.)

#### Dataset 컬럼 전수 (ds_lovData — 컬럼정의 캐시 — xfdl:237~245)

| 컬럼 ID | type | size | 용도 | 근거 |
|---|---|---:|---|---|
| COL_ID | STRING | 256 | 동적 컬럼 ID (bind 키) | xfdl:239 |
| COL_NM | STRING | 256 | 동적 컬럼 헤더명 | xfdl:240 |
| CODE_YN | STRING | 256 | 코드 여부 (MASTER_CODE_DIV) → 마스터코드 셀 클릭 활성 | xfdl:241 |
| PK_YN | STRING | 256 | PK 여부 (SQL 반환, 본 화면 그리드 빌드 미사용) | xfdl:242 |
| COL_TYPE | STRING | 256 | 컬럼 타입 (VARCHAR2 / DATE 등) | xfdl:243 |

비고: SQL(GetRuleColList) 은 COL_LEN / COL_PREC_LEN / MES_COL_ID / IO_FLAG / COL_SEQ / RULE_ID 도 반환(Mapper.xml:9~22)하나 ds_lovData ColumnInfo 에는 5컬럼만 선언. PK_YN 은 선언되었으나 본 화면 동적 컬럼 빌드(xfdl:451~467)에서 미사용 — masterRuleData 와 달리 PK ` * ` prefix 가 없음.

#### Dataset 전수 (검색 LoV 콤보 소스 — xfdl:246~275)

| Dataset | 컬럼 | 용도 | 근거 |
|---|---|---|---|
| ds_lov1 | COL_ID / COL_NM | cbo_lov1 innerdataset | xfdl:246~251 |
| ds_lov2 | COL_ID / COL_NM | cbo_lov2 innerdataset | xfdl:252~257 |
| ds_lov3 | COL_ID / COL_NM | cbo_lov3 innerdataset | xfdl:258~263 |
| ds_lov4 | COL_ID / COL_NM | cbo_lov4 innerdataset | xfdl:264~269 |
| ds_lov5 | COL_ID / COL_NM | cbo_lov5 innerdataset | xfdl:270~275 |

#### Dataset 전수 (공통/페이징/다운로드 — xfdl:276~305)

| Dataset | 컬럼 | 용도 | 근거 |
|---|---|---|---|
| ds_srch | totalCount / countPerPage(초기 "Y") / currentPage / errorMessage / errorCode / keyword | 페이징 송신(countPerPage/currentPage) | xfdl:276~290 |
| ds_common | totalCount / countPerPage / currentPage / errorMessage / errorCode / keyword | 공통 (미사용) | xfdl:291~300 |
| ds_grdDownload | RULE_ID (+ 런타임 동적 컬럼) | 엑셀 Export 그리드(grd_Download) 소스 | xfdl:301~305 / xfdl:482~494 |

### §3.4 편집 그리드 — 해당 없음

- 본 화면은 조회 전용 — 편집 그리드(GE-NNN) 없음. grdMain 단일 그리드(동적 컬럼, 읽기 전용).
- grd_Download (xfdl:195~213) = 엑셀 Export 전용 숨김 그리드 (visible="false", binddataset=ds_grdDownload).

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 상단 메뉴 div | div_title.div_topMenu (width=290, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:10 |
| C-002 | 우측 메뉴 div | div_main.div_rightMenu (top=0, height=20, width=300, right=0) | _com_div::commonRightButton.xfdl | xfdl:193 |
| C-003 | 페이징 div | div_main.div_paging (left=0, bottom=0, right=0, height=21) | _com_div::commonPagingButton.xfdl | xfdl:194 |
| C-004 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:217 |
| C-005 | 제목 Edit (readonly) | div_title.edt_title (width=140, height=25) | (없음) | xfdl:9 |
| C-006 | 다운로드 그리드 | div_main.grd_Download (visible="false", top=400) | (없음) | xfdl:195~213 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:348~358)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | 조회 | fn_search (xfdl:369) | search | xfdl:352, 369~422 |

비고: 상단 메뉴 기본버튼 배열 = `["btn_search"]` 단 1종 (xfdl:352) — masterRuleData 의 저장(btn_save) 이 없다.

### §4.2 우측 메뉴 (commonRight — fn_button xfdl:353~357)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-002 | btn_excelDown | 엑셀다운 | fn_excelDown (xfdl:425) | search_export (server) | xfdl:355, 425~440 |

비고: 우측 메뉴 기본버튼 배열 = `["btn_excelDown"]` 단 1종 (xfdl:355) — masterRuleData 의 행추가/복사/삭제/취소/엑셀업이 모두 없다(조회 전용).

### §4.3 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-003 | btn_fold | 조회조건 접기/펴기 | btn_fold_onclick (xfdl:534) | (client-side) fold | xfdl:170, 534~537 |
| B-004 | btn_ruleId | 업무기준 (선택 팝업) | div_search_btn_ruleId_onclick (xfdl:540) | (client-side, 팝업 P-001) | xfdl:26, 540~549 |

### §4.4 그리드 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| GB-001 | grdMain 셀(body) | div_main_grdMain_oncellclick (xfdl:583) | 셀 cssclass 있으면(=마스터코드 컬럼) `{sCodeId, sCodeNm, sCodeVal}` 로 P-002(MasterCodeSelPop) 호출 | xfdl:174, 583~595 |
| GB-002 | grdMain 헤드 | div_main_grdMain_onheadclick → gfn_commonOnheadclick(obj, e) | 그리드 정렬 (공통 함수 위임) | xfdl:174, 598~600 |

비고: GB-001 은 masterRuleData 에 없는 본 화면 고유 액션 — 마스터코드 셀 클릭 시 코드 조회 팝업. masterRuleData 는 동일 위치(셀)에서 편집(oncolumnchanged) 이 일어나지만, 본 화면은 읽기 전용이라 셀 클릭=코드 룩업으로 의미가 다르다.

### §4.5 페이징 액션

| 항목 | 동작 | 근거 |
|---|---|---|
| fn_searchPaging(nPageNo) | nPageNo 설정 후 fn_search 재호출 → 'reSearch' 복귀 | xfdl:361~366 |
| fn_callAfter(arrList) | 콜백에서 총페이지/총건수/현재페이지로 페이징 div 갱신 (TOTALCOUNT/rowCntSet) | xfdl:470~472 |
| countPerPage / currentPage | ds_srch 에 set 후 GetMasterRuleDataList SQL 의 페이징 파라미터로 송신 | xfdl:371~378 / GetMasterRuleDataList.java:118~120 |

### §4.6 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | ds_srch=ds_srch | ds_grdMain=ds_GetMasterRuleDataList | xfdl:400~401 / bpmn:22 |
| (B-004 콜백 fn_lov) | lov | Y | SequenceFlow_1x309em | "" | ds_lovData=ds_GetRuleColList | xfdl:573~574 / bpmn:37 |
| B-002 btn_excelDown | search_export | Y | SequenceFlow_167nz13 | "" | ds_grdDownload=ds_GetMasterRuleDataListExport | xfdl:431~432 / bpmn:64 |
| B-003 fold / B-004 ruleId / GB-001 셀클릭 / GB-002 정렬 | fold / (팝업 P-001) / (팝업 P-002) / sort | N (client-side; ruleId·셀클릭은 팝업) | (해당 없음) | - | - | xfdl:534~600 |

비고:
- search sArgument 에 pTable(=`TB_MCA_`+ruleId) + 5조건(pWhereN/pOperatorN/pValN) + pRuleId 전수 포함 (xfdl:402~418).
- **★ As-Is 버그(보존)**: search sArgument 에서 `pTable` 키에 `TB_MCA_`+ruleId 를 넣지만(xfdl:402), Java 의 `pTable` 추출은 `context.get("pRuleId")` 로 ruleId 만 받는다(java:29). 한편 Mapper `${pTable}` 에는 `context.get("pTable")`(=`TB_MCA_`+ruleId)를 그대로 넣는다(java:83). 즉 java 의 로컬변수 `pTable` 은 사실상 ruleId 값으로, GetRuleColList 의 MYBATIS_WHERE 조건(`RULE_ID = '<ruleId>'`)에 사용된다(java:50). 변수명 혼동(pTable↔pRuleId)은 As-Is 그대로 보존 — §7.1 비고.
- 본 화면은 후속 자동 조회(save→search) 같은 연쇄가 없다 — 모든 action 이 단일 task 후 End (bpmn §8.4).

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 인자(oArg) | 콜백 | 근거 |
|---|---|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-004 btn_ruleId (xfdl:540) | `{ sSchema : "MCAAPUSER" }` | fn_returnRulePopupCallBack (xfdl:552) → sRuleId/sRuleNm 세팅 후 fn_lov() | xfdl:544~548, 552~565 |
| P-002 | cma::MasterCodeSelPop.xfdl (마스터코드 조회) | GB-001 셀 클릭 (CODE_YN=="Y" 컬럼, xfdl:583) | `{ sCodeId : <COL_ID(셀 text substr(5))>, sCodeNm : <head COL_NM>, sCodeVal : <셀 값> }` | fn_returnMasterCodePopupCallBack (xfdl:593 지정 — 본문 정의 없음, no-op) | xfdl:588~593 |

비고:
- P-001 콜백(fn_returnRulePopupCallBack)은 업무기준ID/명 채운 뒤 `fn_lov()` 호출(xfdl:563) → lov 조회 → 그 콜백(case "lov")에서 다시 `fn_search()` 자동 실행(xfdl:528). 즉 업무기준 선택만으로 컬럼정의 로드 + 데이터 조회까지 일괄 연쇄.
- P-001 oArg 의 sSchema = **"MCAAPUSER"** (xfdl:545) — masterRuleData 가 "MCA_SOURCE" 를 넘기는 것과 달리 본 화면은 MCAAPUSER 를 직접 전달.
- P-001 콜백에 `/*var oArg = {sRuleId, sRuleNm};*/` 주석 잔존 (xfdl:542~543) — 이전 인자 방식. As-Is 보존.
- P-002 콜백 함수명(`fn_returnMasterCodePopupCallBack`)은 openPopup 인자로 지정되나(xfdl:593), 스크립트에 해당 함수 본문 정의가 없음 — 코드 조회 팝업은 단순 표시 후 반환값 미처리(no-op). As-Is 보존.
- P-002 인자 `sCodeId = sText.substr(5)` — 셀 text 가 `"bind:COL_ID"` 형식이므로 앞 5자("bind:") 제거하여 COL_ID 추출 (xfdl:586, 588).

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 업무기준 실데이터 **조회 화면 (Form)**. 다른 화면에서 본 화면을 in-coming 호출하지 않음 (분석 범위 — Q-004 위임).

---

## §6. SQL ID 매트릭스 (Mapper.xml 모든 SQL — 전수 3개)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 동적 요소 | 동적 WHERE (mybatis if) | 정렬 | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetRuleColList | select | java.util.Map | java.util.Map | MCAAPUSER.TB_MCA_RULE_MASTER RMASTER, MCAAPUSER.TB_MCA_RULE_COL_LIST RCLIST | (없음 — 고정 테이블) | pRuleId (1 if) | COL_SEQ | `ALL_CONS_COLUMNS` 서브쿼리 PK 판정 / `NVL2` / `'TB_MCA_' \|\| #{pRuleId}` 문자열결합 | Mapper.xml:7~30 |
| 2 | GetMasterRuleDataList | select | java.util.Map | java.util.Map | MCAAPUSER.${pTable} (동적) | `${pTable}` 테이블명 + `${pWhereN}` `${pOperatorN}` `${pValN}` 컬럼/연산자/값 (5쌍) | pWhere1~5 (5 if) | RULE_SEQ (ROW_NUMBER) | `WITH ... AS` CTE / `ROW_NUMBER() OVER(ORDER BY RULE_SEQ)` / `NVL` / `dual` | Mapper.xml:32~67 |
| 3 | GetMasterRuleDataListExport | select | java.util.Map | java.util.Map | MCAAPUSER.${pTable} (동적) | `${pTable}` 테이블명 | (없음 — 전건) | RULE_SEQ | (없음) | Mapper.xml:69~73 |

비고:
- **★ masterRuleData 와 달리 본 Mapper 에는 INSERT/UPDATE/GetMaxRuleSeq/orphan SQL 이 없다** — 조회 3종(GetRuleColList / GetMasterRuleDataList / GetMasterRuleDataListExport)뿐. orphan(#5/#6) 문제 자체가 발생하지 않는다.
- SQL #1 (GetRuleColList) = lov action → bpmn Task_0ru18qa("lov목록 조회", CommonSelectTask) 에 매핑 (bpmn:23~36). 단 BPMN sqlKey 는 `#{serviceId}Mapper.GetRuleColList`(bpmn:30) 인데, Java(GetMasterRuleDataList) 는 동일 컬럼정의를 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 로 별도 호출 — **호출 경로 2갈래** (BPMN lov flow = MasterRuleDataListMapper.GetRuleColList / Java 내부 = TB_MCA_RULE_COL_LIST_Mapper.select). 단 Java 내부 호출은 UPPER 대상 판정용 컬럼정의일 뿐 화면 lov 콤보 채우기와는 별개.
- SQL #2 (GetMasterRuleDataList) = GetMasterRuleDataList.java:123 호출 (search) → bpmn UserTask_067lppc("Main 조회").
- SQL #3 (GetMasterRuleDataListExport) = search_export → bpmn Task_0ifp7u0("Main 조회 엑셀 Export", CommonSelectTask, bpmn:50~63).
- `${...}` (치환) vs `#{...}` (바인딩) 혼용 — `${pTable}`/`${pWhereN}` 등은 SQL injection 표면 (As-Is 그대로). To-Be 안전화 §11 / Q-007.

### §6.1 SQL 별 컬럼 / 파라미터 상세

#### #1 GetRuleColList (Mapper.xml:7~30)

SELECT 컬럼 (9 항목):
| 별칭 | 원본 | 매핑 (ds_lovData / 동적그리드) | 근거 |
|---|---|---|---|
| RCLIST.RULE_ID | TB_MCA_RULE_COL_LIST.RULE_ID | (업무기준 키) | Mapper.xml:8 |
| RCLIST.COL_SEQ | TB_MCA_RULE_COL_LIST.COL_SEQ | (정렬 기준) | Mapper.xml:9 |
| RCLIST.COL_ID | TB_MCA_RULE_COL_LIST.COL_ID | ds_lovData.COL_ID (동적 컬럼 bind 키) | Mapper.xml:10 |
| RCLIST.COL_NM | TB_MCA_RULE_COL_LIST.COL_NM | ds_lovData.COL_NM (동적 컬럼 헤더) | Mapper.xml:11 |
| RCLIST.COL_LEN | TB_MCA_RULE_COL_LIST.COL_LEN | (항목길이) | Mapper.xml:12 |
| RCLIST.COL_PREC_LEN | TB_MCA_RULE_COL_LIST.COL_PREC_LEN | (정밀도) | Mapper.xml:13 |
| RCLIST.MES_COL_ID | TB_MCA_RULE_COL_LIST.MES_COL_ID | (MES 매핑 컬럼) | Mapper.xml:14 |
| RCLIST.MASTER_CODE_DIV AS CODE_YN | TB_MCA_RULE_COL_LIST.MASTER_CODE_DIV | ds_lovData.CODE_YN (마스터코드 셀 클릭 활성) | Mapper.xml:15 |
| (서브쿼리) AS PK_YN | ALL_CONS_COLUMNS 기반 PK 판정 (`NVL2(MAX(CONSTRAINT_NAME),'Y','N')`) | ds_lovData.PK_YN (선언만, 그리드 빌드 미사용) | Mapper.xml:16~20 |
| RCLIST.COL_TYPE | TB_MCA_RULE_COL_LIST.COL_TYPE | ds_lovData.COL_TYPE (VARCHAR2→UPPER / DATE→캘린더) | Mapper.xml:21 |
| RCLIST.IO_FLAG | TB_MCA_RULE_COL_LIST.IO_FLAG | (본 화면 그리드 빌드 미사용) | Mapper.xml:22 |

JOIN: `RMASTER.RULE_ID = RCLIST.RULE_ID` (Mapper.xml:25). 동적 WHERE: `pRuleId != null` 시 `AND RMASTER.RULE_ID = #{pRuleId}` (Mapper.xml:26~28). PK_YN 서브쿼리 대상 테이블 = `'TB_MCA_' || #{pRuleId}` (Mapper.xml:18). ORDER BY COL_SEQ (Mapper.xml:29). owner = `MCAAPUSER.` (Mapper.xml:23~24).

#### #2 GetMasterRuleDataList (Mapper.xml:32~67) — ★ 동적 테이블 + 동적 WHERE + 페이징

- CTE PARAM: `NVL(#{currentPage},1) PAGENUM, NVL(#{countPerPage},1) PAGEROW FROM dual` (Mapper.xml:35).
- CTE TB1: `SELECT ROW_NUMBER() OVER(ORDER BY RULE_SEQ) SEQ, TB1.* FROM MCAAPUSER.${pTable} TB1` + 동적 WHERE (Mapper.xml:39~60).
- 동적 WHERE 5쌍 (각 `pWhereN != null` 일 때): `AND ${pWhereN} ${pOperatorN} ${pValN}` (Mapper.xml:44~58).
- 최종: `SELECT (SELECT COUNT(*) FROM TB1) AS TOTALCOUNT, TB1.* FROM TB1 WHERE SEQ BETWEEN ((PAGENUM-1)*PAGEROW)+1 AND (PAGENUM*PAGEROW)` (Mapper.xml:62~66).

#### #3 GetMasterRuleDataListExport (Mapper.xml:69~73)

`SELECT * FROM MCAAPUSER.${pTable} ORDER BY RULE_SEQ` (전건 — 페이징 없음).

---

## §7. Java 트랜잭션

### §7.1 GetMasterRuleDataList (조회) — 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList | GetMasterRuleDataList.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service` (RULE.md §"패키지 명명 규칙" — masterRuleData / masterCategoryMng 선례 동일) | - |
| 클래스 | GetMasterRuleDataList | java:19 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:14, 19 |
| 진입점 | public String run(Context context, Task task) | java:20~21 |
| BPMN 매핑 UserTask | UserTask_067lppc ("Main 조회") class=#{basePackage}GetMasterRuleDataList | bpmn:39~48 |

#### run(Context, Task) — 단계 전수 (java:20~133)

| 단계 | 동작 | 호출 SQL | 근거 |
|---:|---|---|---|
| 1 | `dao = context.getDao()` / `pTable = context.get("pRuleId")` (★ 변수명 혼동 — 실제 ruleId 값) | - | java:26, 29 |
| 2 | pWhere1~5 / pOperator1~5 / pVal1~5 (15개) context 추출 | - | java:31~47 |
| 3 | `param.put("sSchema","MCAAPUSER")` + `param.put(MYBATIS_WHERE, "RULE_ID = '"+pTable+"'")` → `dao.selectList("TB_MCA_RULE_COL_LIST_Mapper.select", param)` = ds_GetRuleColList (컬럼정의) | (외부) TB_MCA_RULE_COL_LIST_Mapper.select | java:49~51 |
| 4 | 컬럼정의 루프: COL_TYPE=="VARCHAR2" && pWhereN==COL_ID 이면 `pWhereN = UPPER(pWhereN)` / `pValN = UPPER('pValN')` (대소문자 무시 검색) — 5쌍 | - | java:54~82 |
| 5 | param 에 pTable(=context.get("pTable")) + pWhere1~5/pOperator1~5/pVal1~5 적재 | - | java:83~98 |
| 6 | ds_srch 에서 countPerPage / currentPage 추출하여 param 적재 (페이징) | - | java:117~121 |
| 7 | `dao.selectList("MasterRuleDataListMapper.GetMasterRuleDataList", param)` = ds_GetMasterRuleDataList | GetMasterRuleDataList (#2) | java:123 |
| 8 | `CommonDaoUtil.addDaoResultIntoContext(context, "ds_GetMasterRuleDataList", size, list, true)` → return null | - | java:124~126 |
| 9 | catch(Exception) → log + `throw new IllegalTaskException(e)` | - | java:127~131 |

비고:
- **★ 변수명 혼동(As-Is 보존)**: java:29 `String pTable = (String)context.get("pRuleId");` — 변수명은 `pTable` 이나 실제로는 pRuleId(=ruleId) 값을 받는다. 이 값은 java:50 의 `MYBATIS_WHERE("RULE_ID = '"+pTable+"'")` 즉 컬럼정의 조회 WHERE 에 사용된다. 반면 Mapper `${pTable}` 에 들어가는 진짜 테이블명은 java:83 `param.put("pTable",(String)context.get("pTable"))` 로 별도 적재(=`TB_MCA_`+ruleId). 변수명 ↔ 실제값 혼동은 As-Is 그대로 보존, To-Be 정정 검토 (Q-009).
- java:100~115 = 이전(직접 context 값) 방식 블록 주석 — UPPER 래핑 방식으로 대체됨. As-Is 잔존 보존.
- ★ pWhereN/pValN 에 `UPPER(...)` 를 문자열로 직접 감싸 SQL 본문(`${pWhereN} ${pOperatorN} ${pValN}`) 에 치환 — `${}` 치환 + 문자열 함수 조합. To-Be 안전화 §11 / Q-007.
- masterRuleData 와 달리 본 화면에는 저장 클래스(SaveMasterRuleData)·보조 메서드(filterKeyByColId/setAuditField)·채번(GetMaxRuleSeq)·긴급분기(DynamicSqlExecutor)가 전혀 없다 — 단일 조회 클래스.

### §7.2 트랜잭션 경계

- BPMN 각 action(search/lov/search_export) 은 단일 task 후 End — 후속 연쇄 없음 (bpmn §8.4). search = UserTask_067lppc 단독, lov/export = CommonSelectTask 단독.
- catch 시 IllegalTaskException → 조회 트랜잭션 롤백(조회이므로 사실상 오류 전파).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterRuleDataList | bpmn:3 |
| name | 업무기준 상세조회 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_03tu9nr, SequenceFlow_1jzueym, SequenceFlow_1lritbv | - | bpmn:7~11 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu, SequenceFlow_1x309em, SequenceFlow_167nz13 | bpmn:12~20 |
| Task_0ru18qa | task | lov목록 조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleColList, resultKey=ds_GetRuleColList, isServiceResult=true | SequenceFlow_1x309em | SequenceFlow_03tu9nr | bpmn:23~36 |
| UserTask_067lppc | userTask | Main 조회 | com.dongkuk.dmes.UserTask / class=#{basePackage}GetMasterRuleDataList | nextBranchSpel="" | SequenceFlow_0grwghu | SequenceFlow_1jzueym | bpmn:39~48 |
| Task_0ifp7u0 | task | Main 조회 엑셀 Export | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetMasterRuleDataListExport, resultKey=ds_GetMasterRuleDataListExport, isServiceResult=true | SequenceFlow_167nz13 | SequenceFlow_1lritbv | bpmn:50~63 |

### §8.3 SequenceFlow 전수 (6 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:21 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | UserTask_067lppc (Main 조회) | action=search | bpmn:22 |
| SequenceFlow_1x309em | lov | ExclusiveGateway_1 | Task_0ru18qa (lov목록 조회) | action=lov | bpmn:37 |
| SequenceFlow_03tu9nr | - | Task_0ru18qa | EndEvent_1 | (lov 종료) | bpmn:38 |
| SequenceFlow_1jzueym | - | UserTask_067lppc | EndEvent_1 | (조회 종료) | bpmn:49 |
| SequenceFlow_167nz13 | search_export | ExclusiveGateway_1 | Task_0ifp7u0 (Main 조회 엑셀 Export) | action=search_export | bpmn:64 |
| SequenceFlow_1lritbv | - | Task_0ifp7u0 | EndEvent_1 | (export 종료) | bpmn:65 |

비고: sequenceFlow 요소 = **7개** (SequenceFlow_1 / 0grwghu / 1x309em / 03tu9nr / 1jzueym / 167nz13 / 1lritbv). masterRuleData(9개) 대비 save 관련 flow(0dqldpo/0vcg09z) 2개가 없다.

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → UserTask_067lppc(Main 조회) → End | GetMasterRuleDataList.run() → GetMasterRuleDataList(#2) |
| lov | Start → Gateway → Task_0ru18qa(lov목록 조회) → End | CommonSelectTask → GetRuleColList(#1) |
| search_export | Start → Gateway → Task_0ifp7u0(Main 조회 엑셀 Export) → End | CommonSelectTask → GetMasterRuleDataListExport(#3) |

비고:
- **★ 후속 자동 조회 없음** — 3 action 모두 단일 task 후 즉시 End. masterRuleData 의 save→재조회 연쇄가 본 화면엔 없다(저장 자체 부재).
- BPMN sqlKey 패턴 = `#{serviceId}Mapper.{sqlId}` — serviceId 는 oasis 런타임 주입 (As-Is="MasterRuleDataList" → "MasterRuleDataListMapper.{sqlId}"; To-Be="masterRuleDataList").
- Java(GetMasterRuleDataList) 가 내부에서 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 를 추가 호출 — BPMN lov flow 와 별개로 search 시에도 컬럼정의를 한 번 더 조회(UPPER 판정용).

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 405 | 104 | 36 | 36 | bpmn:70 |
| EndEvent_1 | 405 | 639 | 36 | 36 | bpmn:76 |
| ExclusiveGateway_1 | 398 | 180 | 50 | 50 | bpmn:82 |
| Task_0ru18qa | 156 | 357 | 164 | 50 | bpmn:100 |
| UserTask_067lppc | 343 | 357 | 160 | 50 | bpmn:116 |
| Task_0ifp7u0 | 543 | 357 | 164 | 50 | bpmn:123 |

---

## §9. 사용 테이블

> **★ 메타 테이블 존재 / 동적 데이터 테이블만 동적 (§0 구분).** 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx`. 메타 2테이블(§9.2 TB_MCA_RULE_COL_LIST sheet134 / §9.3 TB_MCA_RULE_MASTER sheet135)은 카탈로그에 **수록 — 컬럼 정의 정상 매핑** (Q-001a 해소). 동적 데이터 테이블(§9.1 TB_MCA_<업무기준ID>)은 런타임 인스턴스라 고정 DDL 미수록(정상)이며, 그 영속/접근 전략 = **Q-001b 확정: As-Is 동일 'DDL on-demand'** (가족 공통 — 사용자 확정 2026-06-04, owner=MCAAPUSER).

### §9.1 MCAAPUSER.TB_MCA_<업무기준ID> (= `${pTable}`, 동적 주 테이블)

| 컬럼 | 본 화면 사용 | 용도 | 근거 |
|---|---|---|---|
| RULE_SEQ | ✓ | ROW_NUMBER 정렬 / 페이징 키 / Export 정렬 | Mapper.xml:40, 72 |
| (동적 컬럼들) | ✓ | ds_lovData(TB_MCA_RULE_COL_LIST) 정의 기반 — COL_ID 별 가변 (SELECT *) | xfdl:453 / Mapper.xml:42 ${pTable} |

비고: 본 화면은 **조회 전용** — 동적 데이터 테이블에 대한 INSERT/UPDATE/DELETE 가 전혀 없다(masterRuleData 와 차이). audit 컬럼·PK 채번도 본 화면 SQL/Java 에서 직접 다루지 않음. 동적 컬럼 집합은 업무기준별로 상이.

### §9.2 MCAAPUSER.TB_MCA_RULE_COL_LIST (컬럼정의 테이블 — DMES MCA Excel sheet134 수록)

> **To-Be 카탈로그 존재.** 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet134 (Python xml 파싱 실측: B2=`MCAAPUSER.TB_MCA_RULE_COL_LIST`) 에 공통감사 17컬럼 + 업무컬럼 11종 = 28 컬럼 수록. 본 화면 사용 컬럼은 카탈로그 타입과 1:1 매핑된다.

| 컬럼 | 본 화면 사용 | 용도 | To-Be 카탈로그 타입 (sheet134) | 근거 |
|---|---|---|---|---|
| RULE_VER | (PK 일부) | 업무기준 버전 | NUMBER(8,2) | Excel sheet134 r25 |
| RULE_ID | ✓ | JOIN 키 (RMASTER) + WHERE / 업무기준ID | VARCHAR(10) | Mapper.xml:8, 25, 27 / Excel sheet134 r26 |
| COL_SEQ | ✓ | 컬럼 정렬 / 항목순서 | NUMBER(3) | Mapper.xml:9, 29 / Excel sheet134 r27 |
| COL_ID | ✓ | 동적 컬럼 bind 키 / 항목ID | VARCHAR(30) | Mapper.xml:10 / xfdl:453, 461 / Excel sheet134 r28 |
| COL_NM | ✓ | 동적 컬럼 헤더명 / 항목명 | VARCHAR(100) | Mapper.xml:11 / xfdl:458 / Excel sheet134 r29 |
| OLD_COL_ID | (미사용) | 기존항목ID | VARCHAR(100) | Excel sheet134 r30 |
| IO_FLAG | ✓ (SQL 반환) | IN/OUT여부 (본 화면 그리드 빌드 미사용) | VARCHAR(10) | Mapper.xml:22 / Excel sheet134 r31 |
| COL_TYPE | ✓ | 타입 (VARCHAR2→UPPER 검색 / DATE→캘린더) / 항목형식 | VARCHAR(10) | Mapper.xml:21 / java:56 / xfdl:455 / Excel sheet134 r32 |
| COL_LEN | ✓ (SQL 반환) | 항목길이 | NUMBER(5) | Mapper.xml:12 / Excel sheet134 r33 |
| COL_PREC_LEN | ✓ (SQL 반환) | 항목소수점길이 | NUMBER(5) | Mapper.xml:13 / Excel sheet134 r34 |
| MES_COL_ID | ✓ (SQL 반환) | MES테이블항목명 | VARCHAR(50) | Mapper.xml:14 / Excel sheet134 r35 |
| MASTER_CODE_DIV (AS CODE_YN) | ✓ | 코드 여부 → 마스터코드 셀 클릭(P-002) 활성 | VARCHAR(2) | Mapper.xml:15 / xfdl:463, 587 / Excel sheet134 r36 |
| (공통감사 17 컬럼 r8~r24) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | (감사 표준) | Excel sheet134 r8~r24 |

비고: PK_YN(ds_lovData) 는 카탈로그 컬럼이 아니라 Mapper #1 서브쿼리(ALL_CONS_COLUMNS PK 판정)로 런타임 산출 — sheet134 미수록 정상. 본 화면은 PK_YN 을 그리드 빌드에 사용하지 않음(§3.3).
To-Be audit: 가족 공통 결정 = mcm-core `McmAuditEntity` 9 컬럼 적용(공통감사 17 중 DATA_END_*/ARCHIVE_* 9 폐기).

### §9.3 MCAAPUSER.TB_MCA_RULE_MASTER (업무기준 마스터 — JOIN 전용 / DMES MCA Excel sheet135 수록)

> **To-Be 카탈로그 존재.** 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet135 (Python xml 파싱 실측: B2=`MCAAPUSER.TB_MCA_RULE_MASTER`, 항목 26 컬럼) 에 업무컬럼 9 + 공통감사 17 = 26 컬럼 수록 (masterRuleList §9.1 전수 매핑 정합). 본 화면은 JOIN 키 RULE_ID 만 직접 참조하나, To-Be 카탈로그 전체 컬럼을 아래에 매핑한다. (sheet135 의 한글/Type 셀은 정의서 misalignment → masterRuleList §7 영문명+NULL여부 정합 인용.)

| 컬럼 | 본 화면 사용 | 용도 / NULL여부 | 근거 |
|---|---|---|---|
| RULE_VER | (마스터 PK 일부) | 업무기준 버전 | Excel sheet135 r25 |
| RULE_ID | ✓ | GetRuleColList JOIN (`RMASTER.RULE_ID = RCLIST.RULE_ID`) + WHERE / **NULL=N (PK)** | Mapper.xml:23, 25, 27 / Excel sheet135 r26 |
| OLD_RULE_ID | (미사용) | 기존 업무기준ID | Excel sheet135 r27 |
| RULE_NM | (P-001 콜백 표시) | 업무기준명 / **NULL=N** | Excel sheet135 r28 |
| RULE_DESC | (미사용) | 업무기준 설명 | Excel sheet135 r29 |
| RULE_TP | (미사용) | 업무기준 유형 | Excel sheet135 r30 |
| RULE_OWNER_DEPT_NM | (미사용) | 담당부서명 | Excel sheet135 r31 |
| RULE_OWNER_EMP_NO | (미사용) | 담당자 사번 | Excel sheet135 r32 |
| USE_TP | (미사용) | 사용 구분 | Excel sheet135 r33 |
| (공통감사 17 컬럼 r8~r24) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | Excel sheet135 r8~r24 (masterRuleList §9.1 정합) |

비고: 업무기준명(edt_ruleNm)·업무기준ID(edt_ruleId) 는 P-001(MasterRuleListPop) 콜백으로 채워짐 — 본 화면 SQL 에서 RULE_MASTER 의 명칭 컬럼 직접 SELECT 는 없음(JOIN 키 RULE_ID 만).

### §9.4 DMES Excel 매핑

- 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx` (masterRuleData/masterRuleList 와 동일 MCA 정의서). **메타 2테이블 수록 확인** (Python zipfile/xml 파싱 실측): TB_MCA_RULE_COL_LIST (sheet134, B2=`MCAAPUSER.TB_MCA_RULE_COL_LIST`) / TB_MCA_RULE_MASTER (sheet135, 26 컬럼, B2=`MCAAPUSER.TB_MCA_RULE_MASTER`). → §9.2/§9.3 매핑.
- **동적 데이터 테이블** TB_MCA_<업무기준ID> 는 업무기준ID 별 런타임 인스턴스라 고정 DDL 미수록(정상) — 카탈로그 부재가 아니라 동적 전략 이슈(§9.1 / Q-001b 확정 = DDL on-demand).
- 정본 스키마 owner: As-Is 는 `MCAAPUSER.` 직접 명시(Mapper.xml:23~24, 42, 71 / java:49). 메타 테이블 카탈로그 owner = **MCAAPUSER** (sheet B2 실측). 동적 데이터 테이블 owner = MCAAPUSER (가족 공통 Q-001b 확정).

---

## §10. 코드값 / LoV

| 항목 | 내용 | 근거 |
|---|---|---|
| 연산자 콤보 (정적 LoV) | LIKE / = / <= / >= (5 콤보 cbo_operator1~5 모두 동일 인라인 Dataset) | xfdl:29~52 외 4 |
| 컬럼선택 콤보 (동적 LoV) | cbo_lov1~5 = ds_lov1~5 = ds_lovData(컬럼정의) 복사 + "조건N" 헤더행 (lov 콜백) | xfdl:502~526 |
| 그리드 동적 컬럼 | ds_lovData(TB_MCA_RULE_COL_LIST) — COL_ID/COL_NM/CODE_YN/COL_TYPE 메타 | xfdl:451~467 |
| 마스터코드 셀 (CODE_YN="Y") | 파란 밑줄·포인터 커서 표시 + 클릭 시 P-002(MasterCodeSelPop) 호출 | xfdl:463~466, 583~595 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 페이징 | `ROW_NUMBER() OVER(ORDER BY RULE_SEQ)` + `WHERE SEQ BETWEEN ...` (CTE) | Mapper.xml:40, 66 | MSSQL 도 `ROW_NUMBER() OVER` 지원 — 또는 `OFFSET/FETCH` 권장 |
| NVL | `NVL(#{x},1)` | Mapper.xml:35 | `ISNULL(...)` 또는 `COALESCE(...)` |
| DUAL | `FROM dual` (CTE PARAM) | Mapper.xml:35 | DUAL 미존재 — `(VALUES(...))` 또는 dual 제거 |
| 문자열 결합 | `'TB_MCA_' \|\| #{pRuleId}` | Mapper.xml:18 | `'TB_MCA_' + #{pRuleId}` 또는 CONCAT |
| 시스템 카탈로그 PK 판정 | `ALL_CONS_COLUMNS` + `NVL2(MAX(CONSTRAINT_NAME),'Y','N')` | Mapper.xml:16~20 | `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` / `sys.indexes` 등가 변환 (본 화면은 PK_YN 미사용이라 우선순위 낮음) |
| UPPER 검색 | `UPPER(col)` / `UPPER('val')` 문자열 주입 | java:58~80 | MSSQL `UPPER()` 동일 — 단 `${}` 치환 안전화 동반 |
| 스키마명 | `MCAAPUSER.{TABLE}` (명시) | Mapper.xml/java 다수 | 메타·동적 테이블 owner = **MCAAPUSER** (DMES-SECTION-MCA 정합). `${sSchema}` 미전달 시 기본 MCAAPUSER (가족 공통) |
| 동적 테이블/컬럼 `${pTable}`/`${pWhereN}`/`${pOperatorN}`/`${pValN}` | MyBatis `${}` 치환 (SQL injection 표면) | Mapper.xml 다수 / java:83~98 | **To-Be 안전화 필수** — 화이트리스트(컬럼정의 메타 검증) + 파라미터 바인딩. 임의 컬럼/연산자/테이블 치환 차단 (Q-007) |
| Java 변수명 혼동 | `pTable = context.get("pRuleId")` (실제 ruleId 값) | java:29 | To-Be 변수명 정정(pRuleId) 검토 (Q-009) — As-Is 보존 |
| Java 패키지 | `com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList.*` | java 1종 | **To-Be**: Service = `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service.*` (masterRuleData 선례) |

---

## §12. 결정 누적 / 확인필요 (Q-NNN)

> 본 화면은 동적 테이블/컬럼 **조회 전용** 화면. **가족 공통 확정 2026-06-04 적용**: Q-001a(메타 테이블 DMES-SECTION-MCA 수록 해소) / Q-001b(동적 데이터 테이블 = DDL on-demand, owner=MCAAPUSER) / Q-002(초기값 USD 보존) / Q-003(FE 동적그리드 동일 구현) / Q-007(동적 `${}` 치환 화이트리스트+바인딩 안전화) / 영속성(JPA). **활성 확인필요 = 0 건** (Q-004 부모 = 호출관계 조사로 "메뉴(포털) 직접 진입 — GUI 부모 없음" 해소 2026-06-05 / Q-009 변수명 = To-Be 정정 확정 2026-06-05). 본 화면은 저장·긴급적용·orphan SQL 이 없으므로 masterRuleData 의 Q-005/Q-006/Q-008 은 비해당.

| Q-NNN | 영역 | 확인 내용 | 본문 |
|---|---|---|---|
| Q-001a | 메타 테이블 | TB_MCA_RULE_COL_LIST(sheet134)/TB_MCA_RULE_MASTER(sheet135 26컬럼) = DMES-SECTION-MCA 수록 확인 → **해소** | §0 / §9.2 / §9.3 |
| Q-001b | 동적 데이터 테이블 To-Be 전략 | `TB_MCA_<업무기준ID>` 영속/접근 — **확정: As-Is 동일 'DDL on-demand'** (owner=MCAAPUSER, native 동적 SQL + 안전화) | §0 / §9.1 |
| Q-002 | 초기값 | edt_ruleId/edt_ruleNm="USD" As-Is 초기값 To-Be 보존 — **확정: 보존** | §3.2 |
| Q-003 | 동적 그리드 | ds_lovData 기반 동적 컬럼 빌드(DATE 캘린더/폭/CODE_YN 파란밑줄·클릭) FE 동일 구현 — **확정: 동일 구현** | §3.3 |
| Q-004 | in-coming | 본 화면을 호출하는 외부 화면 — **해소: 메뉴(포털) 직접 진입, GUI 부모 없음** (호출관계 조사 2026-06-05) | §5.2 |
| Q-007 | 동적 SQL 안전화 | `${pTable}`/`${pWhereN}` 등 치환 화이트리스트·바인딩 전략 — **확정: 적용** | §11 |
| Q-009 | Java 변수명 | `pTable = context.get("pRuleId")` 변수명 혼동 → **To-Be 정정 확정** (사용자 2026-06-05) | §7.1 / §11 |

| 결정 영역 (선례 동일 — 잠정) | 잠정 방향 | 본문 |
|---|---|---|
| 통신 채널 | OASIS REST (cactus 표준) | BPMN §2 |
| 권한 | To-Be 외부 권한 프로세스 위임 | 기능 §8 |
| Java 패키지 | Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.{service,dto}.*` (masterRuleData 선례) | §7 / §11 |
| 영속성 | JPA (메타) + 동적 데이터 테이블 native 동적 SQL(화이트리스트) | BPMN §2.2 |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| G1 | xfdl 컴포넌트 전수 (영역 5 + 조회조건 20(S-001~S-020) + 그리드 1 + 보조 6(C-001~C-006)) | ○ | §3 |
| G2 | 그리드 columns 전수 (정적 1(SEQ) + 동적 N — 빌드 로직 전수) | ○ | §3.3 |
| G3 | Dataset 전수 (ds_grdMain / ds_lovData / ds_lov1~5 / ds_srch / ds_common / ds_grdDownload = 11) | ○ | §3.3 |
| G4 | java 메서드 전수 (GetMasterRuleDataList: run 1) | ○ | §7 |
| G5 | Mapper.xml SQL 전수 (3 — orphan 없음) | ○ | §6 |
| G6 | bpmn flow 노드 전수 (Start/End + Gateway + Task 2 + UserTask 1 = 5 노드, sequenceFlow 7) | ○ | §8.2, §8.3 |
| G7 | action 매트릭스 일치 (search/lov/search_export + client-side fold/P-001/P-002/sort) | ○ | §4.6 |
| G8 | 식별자 cite (모든 본문 주장 file:line) | ○ | 본 문서 전수 |
| G9 | 활성 확인필요 = 2 (Q-004 부모 호출 화면 / Q-009 변수명) — Q-001a/b·Q-002/3/7·영속성(JPA) 가족 공통 확정 2026-06-04 | △ | §12 |
| G10 | Runner 미적용 명시 / 메타 테이블(DMES-SECTION-MCA 수록) ↔ 동적 데이터 테이블(런타임 인스턴스, Q-001b DDL on-demand) 구분 명시 | ○ | §0, §9, 정합체크서 §D.4 |
