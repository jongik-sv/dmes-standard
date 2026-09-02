---
screenId: masterRuleFrame
asIsId: MasterRuleFrame
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 구조관리 (masterRuleFrame) 분석리포트

> 본 문서 = 5종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — 입력 자산은 mui (xfdl/Java/Mapper.xml/bpmn) 4종 + DMES Excel 1종 + MCM 인터페이스 테이블명세서 1종).
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow) 로 매핑. WinForms 전제 절은 mui 등가물로 채우고 절/헤더는 유지.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- R-14 미적용. manifest 폴더 생성 ✗ (사용자 지시 [처리 절차] A).
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / java 메서드 전수 / Mapper.xml SQL 전수 / bpmn flow 전수 + 연동 팝업 P-NNN 전수).
- As-Is DB = Oracle (schema `MCA_SOURCE` 명시 / `ORDER BY` / `<if>` 동적조건). To-Be DB = MSSQL. §11 변환점 명시.
- **To-Be 카탈로그 정정 (Q-001 Resolved)**: 종전 오참조(`DMES-SECTION-MCM_테이블정의서.xlsx` — MCM 정의서에 부재) → **정본 = `DMES-SECTION-MCA_테이블정의서.xlsx`**. 본 화면 주 테이블 `MCAAPUSER.TB_MCA_RULE_COL_LIST` (sheet134) / 참조 테이블 `MCAAPUSER.TB_MCA_RULE_MASTER` (sheet135) 의 To-Be 카탈로그가 **존재** (형제 화면 masterRuleList 분석리포트 §9.1 sheet135 26 컬럼 전수와 owner·PK 1:1 정합). RULE 테이블군은 MCM 정의서가 아니라 **MCA 정의서**에 등재되어 있어 종전 분석이 잘못된 시트(MCM)를 검색한 것이 원인 — §2/§9 에서 정본 카탈로그로 컬럼 매핑 작성, To-Be DDL (PK = `(RULE_ID, COL_SEQ)`) 확정.

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterRuleFrame | MasterRuleFrame.xfdl:3 (`<Form id="MasterRuleFrame" ...>`) |
| 화면 ID (To-Be) | masterRuleFrame | 사용자 결정 (모듈 mcm + As-Is 화면명, screenId = 단일 토큰 — 01 부속 §A.3.1) |
| 화면명 | 업무기준 구조관리 | MasterRuleFrame.xfdl:3 (`titletext="업무기준 구조관리"`) / MasterRuleFrame.bpmn:3 (`name="업무기준 구조관리"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 사용자 결정 (DMES-SECTION-MCM 정의서 대응) |
| 모듈 그룹 | cmb — 한글명 **"업무기준 관리(원장)"** | 사용자 결정 (As-Is 자산 경로 `mui/src/nxuiMui/cmb/` / `mappers-cmb/` / `services/cmb/`) — 01 부속 §A.2.3 **등재 완료 (2026-06-04, 영역 코드 `cm`+`b`)** |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 구조관리 (masterRuleFrame) | - |
| 화면 크기 | 1280 × 670 | MasterRuleFrame.xfdl:3 (`width="1280" height="670"`) |
| onload 핸들러 | MasterRuleFrame_onload | MasterRuleFrame.xfdl:3 / xfdl:231 |
| 최초 생성 | 2020.03.10 최민수 | MasterRuleFrame.xfdl:222 |
| 수정 | 2020.05.08 최규찬 | MasterRuleFrame.xfdl:223 |
| 화면 성격 | 업무기준(RULE)의 컬럼/구조(프레임) 정의·관리 — 좌(IN)/우(OUT) 2 그리드 구조관리 화면 (행 추가/삭제/저장) | xfdl:41~138 (div_in / div_out 2 그리드) |
| 주 사용 테이블 | MCA_SOURCE.TB_MCA_RULE_COL_LIST | MasterRuleFrameMapper.xml:21, 44 / SaveMasterRuleColList.java:34, 58, 83 |
| 참조 테이블 (JOIN 전용) | MCA_SOURCE.TB_MCA_RULE_MASTER | MasterRuleFrameMapper.xml:20, 22, 43, 45 |
| 트랜잭션 클래스 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame.SaveMasterRuleColList | SaveMasterRuleColList.java:1, MasterRuleFrame.bpmn:56 |
| BPMN 프로세스 ID | MasterRuleFrame | MasterRuleFrame.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleFrame.bpmn:3 |
| 연동 팝업 (out-going) | MasterRuleListPop (업무기준 선택) / MasterRuleFrameColListPopup (업무기준 컬럼 등록) | xfdl:407, 436 (§5) |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleFrame.xfdl | 488 | nexacro Form + Script |
| 2 | Java (UserTask) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleFrame\SaveMasterRuleColList.java | 102 | implements Wow — save 트랜잭션 (delete-all → insert) |
| 3 | Mapper.xml | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleFrameMapper.xml | 53 | namespace=MasterRuleFrameMapper, 2 SQL (SELECT 2) |
| 4 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleFrame.bpmn | 133 | Camunda Modeler 5.37.0 |
| 5 | DMES 테이블 정의서 | docs\external\DMES\DMES-SECTION-MCA_테이블정의서.xlsx | (xlsx) | **본 화면 테이블 존재** — TB_MCA_RULE_COL_LIST (MCAAPUSER, sheet134) / TB_MCA_RULE_MASTER (MCAAPUSER, sheet135 26 컬럼) — §9 매핑 (종전 MCM 정의서 오참조 정정 — Q-001 Resolved) |
| 6 | MCM 인터페이스 테이블명세서 | docs\mcm\인터페이스 관련 테이블명세서.md | 248 | MOM 6 테이블 한정 — TB_MCA_RULE_* 미포함 (cactus-core audit 표준 9 컬럼 인용용) |

추가 외부 참조(본 화면 자산에 미포함, 인용으로만 사용):
- TB_MCA_RULE_COL_LIST_Mapper.delete / TB_MCA_RULE_COL_LIST_Mapper.insert — SaveMasterRuleColList.java:34, 58, 83 에서 호출하는 공통 CRUD Mapper. 정의 본문은 본 화면 Mapper.xml(MasterRuleFrameMapper) 외부 (별도 테이블 단위 공통 Mapper — `TB_MCA_RULE_COL_LIST_Mapper`).
- gfn_* (libInClude.xjs) 공통 함수 (gfn_formOnLoad / gfn_transaction / gfn_openPopup / gfn_getReturn / gfn_setParam / gfn_isNull / gfn_trim / gfn_commonAddType / gfn_fold / gfn_commonBottomStatus_msg) — 공통 라이브러리, 본 자산 외부. xfdl:227 `include "_lib::libInClude.xjs"`.
- 연동 팝업 화면 (cmb::MasterRuleListPop.xfdl / cmb::MasterRuleFrameColListPopup.xfdl) — 본 화면이 호출(out-going). 별도 phase 산출물 (§5 P-NNN 인용만).

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:6 |
| A-002 | 조회조건 | div_search | top=div_title:0, left=20, right=20, height=43 | xfdl:19 |
| A-003 | 접기 토글 | btn_fold | top=div_search:0, left=20, right=20, height=15 | xfdl:37 |
| A-004 | 메인 (좌 IN 그리드 + 우 OUT 그리드) | div_main | top=btn_fold:5, left=20, right=20, bottom=30 | xfdl:38 |
| A-004-1 | 좌측 영역 (조건항목 IN) | div_main.div_in | top=0, left=0, width=50%, bottom=0 | xfdl:41 |
| A-004-2 | 우측 영역 (결과항목 OUT) | div_main.div_out | top=0, left=50.81%, right=0, bottom=0 | xfdl:90 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:142 |

### §3.2 조회조건 (S-NNN) — div_search.div_search1

| S-NNN | xfdl id | 종류 | 라벨 | 초기 value / text | 폭 | maxlength | readonly | 파라미터 | 근거 |
|---|---|---|---|---|---:|---:|---|---|---|
| S-001 | edt_stc_ruleId | Edit (라벨) | 업무기준 ID | "업무기준 ID" | 80 | - | true | (라벨) | xfdl:25 |
| S-002 | edt_ruleId | Edit | (업무기준 ID 값) | (없음) | 100 | 30 | true | pRuleId | xfdl:26 |
| S-003 | edt_stc_ruleNm | Edit (라벨) | 업무기준명 | "업무기준명" | 80 | - | true | (라벨) | xfdl:27 |
| S-004 | edt_ruleNm | Edit | (업무기준명 값) | (없음) | 260 | 30 | true | (표시 전용) | xfdl:28 |

비고:
- edt_ruleId / edt_ruleNm 모두 `readonly="true"` — 직접 입력 불가. 값은 업무기준 팝업(P-001) 콜백으로만 설정 (xfdl:416~417).
- inputtype `normal` (edt_ruleId — xfdl:26). edt_stc_* 2종은 cssclass `edi_WFSA_Label` 라벨 역할 (xfdl:25, 27).
- `maxlength="30"` (edt_ruleId / edt_ruleNm — xfdl:26, 28).

### §3.3 결과 그리드 G-001 (IN) — div_main.div_in.grd_in (binddataset=ds_grdIn)

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grd_in | xfdl:46 |
| binddataset | ds_grdIn | xfdl:46 |
| autofittype | col | xfdl:46 |
| selecttype | multiarea | xfdl:46 |
| cellmovingtype / cellsizingtype | col / col | xfdl:46 |
| autosizingtype | none | xfdl:46 |
| head 행수 | 2 (band=head 2행 — 병합 헤더) | xfdl:59~60 |
| body 행 높이 | 25 | xfdl:61 |

#### Grid G-001 columns 전수 (7 cols — head 2행 병합 구조)

| col | head text (병합) | bind | displaytype | edittype | editmaxlength | combo dataset | mask | 근거 |
|---:|---|---|---|---|---:|---|---|---|
| 0 | 순번 (rowspan=2) | expr:currow + 1 | (default) | - | - | - | - | xfdl:64, 74 |
| 1 | 한글항목명 (rowspan=2) | COL_NM | text | text | 100 | - | - | xfdl:65, 75 |
| 2 | 영문항목명 (rowspan=2) | COL_ID | text | text | 30 | - | - | xfdl:66, 76 |
| 3 | 코드여부 (rowspan=2) | MASTER_CODE_DIV | combocontrol | combo | - | ds_div (CODE_VAL / CODE_VAL_MEAN) | - | xfdl:67, 77 |
| 4 | 사용여부>유형 (colspan=3 / row1 유형) | COL_TYPE | combocontrol | combo | - | ds_colType (CODE_VAL / CODE_VAL_MEAN) | - | xfdl:68~69, 78 |
| 5 | 사용여부>총길이 (row1 총길이) | COL_LEN | mask | mask | 5 | - | ##,##9 (integer) | xfdl:68, 70, 79 |
| 6 | 사용여부>소수점길이 (row1 소수점길이) | COL_PREC_LEN | mask | mask | 5 | - | ##,##9 (integer) | xfdl:68, 71, 80 |

비고:
- head 는 2 밴드행 병합 구조: col 0~3 = rowspan=2 (순번/한글항목명/영문항목명/코드여부), col 4~6 = "사용여부" colspan=3 상위 + 하위 (유형/총길이/소수점길이) (xfdl:63~72).
- head 텍스트 글꼴 모두 `normal bold 12px/normal "Malgun Gothic"` (xfdl:64~71).
- col 4 (유형) combo = ds_colType (DATE / NUMBER / VARCHAR2 — xfdl:194~213). col 3 (코드여부) combo = ds_div (N / Y — xfdl:178~193).
- col 5 (총길이) / col 6 (소수점길이) = mask `##,##9`, `maskeditlimitbymask="integer"` (정수 입력 강제, xfdl:79~80).
- "사용여부" 라는 상위 병합 헤더명과 실제 하위 컬럼 (유형/총길이/소수점길이) 의미 불일치 = As-Is 헤더 라벨 (xfdl:68) — **To-Be 보존** (사용자 결정 — As-Is 1:1).

#### Grid G-002 columns 전수 (OUT) — div_main.div_out.grd_out (binddataset=ds_grdOut, xfdl:95~133)

| col | head text (병합) | bind | displaytype | edittype | editmaxlength | combo dataset | mask | 근거 |
|---:|---|---|---|---|---:|---|---|---|
| 0 | 순번 (rowspan=2) | expr:currow + 1 | (default) | - | - | - | - | xfdl:113, 123 |
| 1 | 한글항목명 (rowspan=2) | COL_NM | text | text | 100 | - | - | xfdl:114, 124 |
| 2 | 영문항목명 (rowspan=2) | COL_ID | text | text | 30 | - | - | xfdl:115, 125 |
| 3 | 코드여부 (rowspan=2) | MASTER_CODE_DIV | combocontrol | combo | - | ds_div (combodisplaynulltext="선택" / nulltype) | - | xfdl:116, 126 |
| 4 | 사용여부>유형 (colspan=3 / row1 유형) | COL_TYPE | combocontrol | combo | - | ds_colType | - | xfdl:117~118, 127 |
| 5 | 사용여부>총길이 (row1 총길이) | COL_LEN | mask | mask | 5 | - | ##,##9 (integer) | xfdl:117, 119, 128 |
| 6 | 사용여부>소수점길이 (row1 소수점길이) | COL_PREC_LEN | mask | mask | 5 | - | ##,##9 (integer) | xfdl:117, 120, 129 |

비고:
- G-001(IN) 과 컬럼 구조 동일 (7 cols / 2행 병합 head). 유일 차이: OUT col 3 (코드여부) 콤보에 `combodisplaynulltext="선택" combodisplaynulltype="nulltext"` 추가 (xfdl:126) — null 시 "선택" 표시. IN col 3 은 nulltext 미지정 (xfdl:77).

#### Dataset 컬럼 전수 (ds_grdIn — xfdl:146~161)

| 컬럼 ID | type | size | 그리드 col 매핑 | 근거 |
|---|---|---:|---|---|
| RULE_ID | STRING | 256 | (hidden — 행추가 시 set, xfdl:454) | xfdl:148 |
| COL_SEQ | STRING | 256 | (hidden — 저장 시 Java 재계산) | xfdl:149 |
| COL_ID | STRING | 256 | col 2 영문항목명 | xfdl:150 |
| COL_NM | STRING | 256 | col 1 한글항목명 | xfdl:151 |
| COL_LEN | STRING | 256 | col 5 총길이 | xfdl:152 |
| MES_COL_ID | STRING | 256 | (hidden — SELECT 반환, 미표시) | xfdl:153 |
| MASTER_CODE_DIV | STRING | 256 | col 3 코드여부 | xfdl:154 |
| COL_PREC_LEN | STRING | 256 | col 6 소수점길이 | xfdl:155 |
| IO_FLAG | STRING | 256 | (hidden — 행추가 시 "IN", xfdl:455) | xfdl:156 |
| COL_TYPE | STRING | 256 | col 4 유형 | xfdl:157 |
| OLD_COL_ID | STRING | 256 | (hidden — SELECT 반환, 미표시) | xfdl:158 |
| RULE_VER | STRING | 256 | (hidden — 저장 시 빈값이면 "1", java:53~55) | xfdl:159 |

#### Dataset 컬럼 전수 (ds_grdOut — xfdl:162~177)

| 컬럼 ID | type | size | 그리드 col 매핑 | 근거 |
|---|---|---:|---|---|
| RULE_ID | STRING | 256 | (hidden — 행추가 시 set, xfdl:472) | xfdl:164 |
| COL_SEQ | STRING | 256 | (hidden) | xfdl:165 |
| COL_ID | STRING | 256 | col 2 영문항목명 | xfdl:166 |
| COL_NM | STRING | 256 | col 1 한글항목명 | xfdl:167 |
| COL_LEN | STRING | 256 | col 5 총길이 | xfdl:168 |
| MES_COL_ID | STRING | 256 | (hidden) | xfdl:169 |
| MASTER_CODE_DIV | STRING | 256 | col 3 코드여부 | xfdl:170 |
| COL_PREC_LEN | STRING | 256 | col 6 소수점길이 | xfdl:171 |
| IO_FLAG | STRING | 256 | (hidden — 행추가 시 "OUT", xfdl:473) | xfdl:172 |
| COL_TYPE | STRING | 256 | col 4 유형 | xfdl:173 |
| OLD_COL_ID | STRING | 256 | (hidden) | xfdl:174 |
| RULE_VER | STRING | 256 | (hidden) | xfdl:175 |

비고: ds_grdIn 과 ds_grdOut 의 ColumnInfo 12 컬럼 동일 (구조 대칭). 차이는 IO_FLAG 기본값 ("IN" vs "OUT", xfdl:455/473) 뿐.

#### 정적 콤보 Dataset 전수

| dataset | 컬럼 (CODE_VAL / CODE_VAL_MEAN) | 행 | 근거 |
|---|---|---|---|
| ds_div (코드여부) | N/N, Y/Y | 2행 | xfdl:178~193 |
| ds_colType (유형) | DATE/DATE, NUMBER/NUMBER, VARCHAR2/VARCHAR2 | 3행 | xfdl:194~213 |

onload 시 `gfn_commonAddType(ds_div, "SELECT", ...)` / `gfn_commonAddType(ds_colType, "SELECT", ...)` 로 맨 앞 "SELECT" 빈행 prepend (xfdl:236~237).

### §3.4 편집 그리드 — 별도 GE-NNN 없음

- grd_in (G-001) / grd_out (G-002) 2 그리드가 결과 + 편집 겸용. col 1~6 모두 셀 인플레이스 편집 (text/combo/mask). 별도 편집 폼 영역 없음.

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 상단 메뉴 div | div_title.div_topMenu (width=290, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:10 |
| C-002 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:142 |
| C-003 | 제목 Edit (readonly) | div_title.edt_title (width=140, height=25, value="업무기준 구조관리") | (없음) | xfdl:9 |
| C-004 | IN 조건항목 수 (라벨+MaskEdit) | div_in.Static00 "조건항목 수" + mae_inCnt (readonly, number) | (없음) | xfdl:44~45 |
| C-005 | OUT 결과항목 수 (라벨+MaskEdit) | div_out.Static00 "결과항목 수" + mae_cntOut (readonly) | (없음) | xfdl:93~94 |

비고: mae_inCnt 는 `onchanged="div_main_div_in_mae_inCnt_onchanged"` 핸들러 바인딩 선언 (xfdl:45) — 그러나 Script 본문에 해당 함수 정의 ✗ (xfdl 전수 확인). As-Is 미구현 핸들러 잔존 → **To-Be 제거** (사용자 결정 — orphan 핸들러).

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:241~246)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | 조회 | fn_search (xfdl:249) | search | xfdl:245, 249~260 |
| B-002 | btn_save | 저장 | fn_save (xfdl:263) | save | xfdl:245, 263~369 |

비고: fn_button (xfdl:241) 은 `new Array(["btn_search"],["btn_save"])` 기본버튼 2종만 생성 (사용자정의버튼 ''). 우측/엑셀 메뉴 없음.

### §4.2 조회조건 영역 버튼 (div_search1)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-003 | btn_ruleIdPop | 업무기준 | div_search_div_search_btn_ruleIdPop_onclick (xfdl:401) | (client-side) 팝업 P-001 | xfdl:29, 401~408 |
| B-004 | btn_ruleCol | 기초데이터등록 | div_search_div_search1_btn_ruleCol_onclick (xfdl:424) | (client-side) 팝업 P-002 | xfdl:30, 424~437 |

### §4.3 그리드 영역 버튼 (행 추가/삭제)

| B-NNN | 버튼 ID | 라벨 | 위치 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|---|
| B-005 | div_in.btn_rowAdd | 행추가 | IN 그리드 우상단 | div_main_div_in_btn_rowAdd_onclick (xfdl:450) | (client-side) rowAdd(IN) | xfdl:86, 450~459 |
| B-006 | div_in.btn_rowDelete | 행삭제 | IN 그리드 우상단 | div_main_div_in_btn_rowDelete_onclick (xfdl:462) | (client-side) rowDelete(IN) | xfdl:85, 462~465 |
| B-007 | div_out.btn_rowAdd | 행추가 | OUT 그리드 우상단 | div_main_div_out_btn_rowAdd_onclick (xfdl:468) | (client-side) rowAdd(OUT) | xfdl:135, 468~477 |
| B-008 | div_out.btn_rowDelete | 행삭제 | OUT 그리드 우상단 | div_main_div_out_btn_rowDelete_onclick (xfdl:480) | (client-side) rowDelete(OUT) | xfdl:134, 480~483 |

### §4.4 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-009 | btn_fold | 조회조건 접기/펴기 | btn_fold_onclick (xfdl:444) | (client-side) fold | xfdl:37, 444~447 |

### §4.5 그리드 헤더 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| (없음) | - | - | 헤드 클릭 정렬/전체선택 핸들러 미바인딩 (grd_in / grd_out 에 onheadclick ✗) | xfdl:46, 95 (속성 부재) |

### §4.6 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | "" | ds_grdIn=ds_GetRuleColInList ds_grdOut=ds_GetRuleColOutList | xfdl:251~259 / bpmn:19 |
| B-002 btn_save | save | Y | SequenceFlow_1ul62kh | ds_grdIn=ds_grdIn ds_grdOut=ds_grdOut | ds_grdIn=ds_GetRuleColInList ds_grdOut=ds_GetRuleColOutList | xfdl:360~368 / bpmn:62 |
| B-003 btn_ruleIdPop | (팝업) | N (client-side만) | (해당 없음) | - | - | xfdl:401~408 |
| B-004 btn_ruleCol | (팝업) | N (client-side만) | (해당 없음) | - | - | xfdl:424~437 |
| B-005~B-008 | rowAdd/rowDelete (IN/OUT) | N (client-side만) | (해당 없음) | - | - | xfdl:450~483 |
| B-009 btn_fold | fold | N (UI 토글만) | (해당 없음) | - | - | xfdl:444~447 |

비고:
- save 의 sInDatasets 는 `ds_grdIn=ds_grdIn ds_grdOut=ds_grdOut` (전체 송신) — xfdl:363. xfdl:362 에 `ds_grdIn=ds_grdIn:U ds_grdOut=ds_grdOut:U` (변경분만) 가 **주석 처리**되어 있어, 운영은 전체 송신 + Java 가 delete-all → insert 재구성 방식 (java:30~91). **To-Be 보존** (사용자 결정 — As-Is 운영 흐름).
- search 콜백 시 `set_rowposition(this.grd_row)` (grd_row=-1) 로 행위치 복원 (xfdl:377~378).

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

| P-NNN | 호출 대상 (xfdl) | 트리거 | 인자 (oArg) | 콜백 | 반환 처리 | 근거 |
|---|---|---|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-003 btn_ruleIdPop | { sSchema : "MCA_SOURCE" } | fn_returnMasterPopupCallBack | rtVal.sRuleId → edt_ruleId / rtVal.sRuleNm → edt_ruleNm / this.ruleId 설정 → fn_search() 자동 호출 | xfdl:401~421 |
| P-002 | cmb::MasterRuleFrameColListPopup.xfdl (업무기준 컬럼 등록) | B-004 btn_ruleCol | { sRuleId : edt_ruleId.value, sRuleNm : edt_ruleNm.value } | fn_returnColListPopupCallBack | fn_search() 재조회 호출 | xfdl:424~441 |

비고:
- P-001 호출 전 선행 조건 없음 (모달 `gfn_openPopup("modal", ...)`, xfdl:407).
- P-002 호출 전 가드: edt_ruleId 미선택 시 "업무기준 선택 후 진행해주세요." alert 후 return false (xfdl:426~429).
- 두 팝업 모두 모달 (`gfn_openPopup("modal", ...)`, xfdl:407, 436).
- 연동 팝업 화면 자체 (MasterRuleListPop / MasterRuleFrameColListPopup) 는 별도 phase 산출물 — 본 문서는 호출 계약(인자/콜백) 만 인용.

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 업무기준 구조(프레임) 정의 원장 화면. 형제 화면 (MasterRuleList / MasterRuleData / MasterRuleListPop) 에서 본 화면을 in-coming 호출하는지 여부 = 본 화면 자산 범위 외 → **[확인필요: Q-003]** (호출 화면 분석은 별도 phase).

---

## §6. SQL ID 매트릭스 (Mapper.xml 모든 SQL — 전수 2개)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 결합 (JOIN) | 동적 WHERE (mybatis if) | 정렬 (ORDER BY) | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetRuleColInList | select | java.util.Map | java.util.Map | MCA_SOURCE.TB_MCA_RULE_MASTER RMASTER, MCA_SOURCE.TB_MCA_RULE_COL_LIST RCLIST | RMASTER.RULE_ID = RCLIST.RULE_ID | pRuleId (1 if) + 고정 IO_FLAG='IN' | RCLIST.COL_SEQ | (없음 — `<if>` 동적조건만) | Mapper.xml:7~28 |
| 2 | GetRuleColOutList | select | java.util.Map | java.util.Map | MCA_SOURCE.TB_MCA_RULE_MASTER RMASTER, MCA_SOURCE.TB_MCA_RULE_COL_LIST RCLIST | RMASTER.RULE_ID = RCLIST.RULE_ID | pRuleId (1 if) + 고정 IO_FLAG='OUT' | RCLIST.COL_SEQ | (없음) | Mapper.xml:30~51 |

비고:
- 본 Mapper.xml 에는 SELECT 2개만 정의. INSERT / UPDATE / DELETE 는 **외부 공통 Mapper** `TB_MCA_RULE_COL_LIST_Mapper` 의 `delete` / `insert` 를 SaveMasterRuleColList.java 가 직접 호출 (java:34, 58, 83) — 본 화면 Mapper.xml 외부 정의.
- SQL #1, #2 = SELECT 2 → bpmn Task_1j1g5cn(결과 항목 조회 IN), Task_1c4n8uv(결과 항목 조회 OUT) 에 1:1 매핑.
- 두 SELECT 는 IO_FLAG 고정값 ('IN' vs 'OUT') 만 다르고 나머지 동일 (컬럼 12 / JOIN / WHERE if / ORDER BY 동일).

### §6.1 SQL 별 컬럼 / 파라미터 상세

#### #1 GetRuleColInList (Mapper.xml:7~28)

SELECT 컬럼 12종 (모두 RCLIST = TB_MCA_RULE_COL_LIST):
| 컬럼 | 매핑 Dataset (ds_grdIn) | 그리드 표시 | 근거 |
|---|---|---|---|
| RCLIST.RULE_ID | RULE_ID | (hidden) | Mapper.xml:8 |
| RCLIST.COL_SEQ | COL_SEQ | (hidden — ORDER BY 키) | Mapper.xml:9 |
| RCLIST.COL_ID | COL_ID | col 2 영문항목명 | Mapper.xml:10 |
| RCLIST.COL_NM | COL_NM | col 1 한글항목명 | Mapper.xml:11 |
| RCLIST.COL_LEN | COL_LEN | col 5 총길이 | Mapper.xml:12 |
| RCLIST.MES_COL_ID | MES_COL_ID | (hidden) | Mapper.xml:13 |
| RCLIST.MASTER_CODE_DIV | MASTER_CODE_DIV | col 3 코드여부 | Mapper.xml:14 |
| RCLIST.COL_PREC_LEN | COL_PREC_LEN | col 6 소수점길이 | Mapper.xml:15 |
| RCLIST.IO_FLAG | IO_FLAG | (hidden — 'IN') | Mapper.xml:16 |
| RCLIST.COL_TYPE | COL_TYPE | col 4 유형 | Mapper.xml:17 |
| RCLIST.OLD_COL_ID | OLD_COL_ID | (hidden) | Mapper.xml:18 |
| RCLIST.RULE_VER | RULE_VER | (hidden) | Mapper.xml:19 |

WHERE 동적 조건 (mybatis if):
| 파라미터 | 비교 대상 컬럼 | 비교 방식 | 근거 |
|---|---|---|---|
| pRuleId | RMASTER.RULE_ID | `= #{pRuleId}` (if not null/"") | Mapper.xml:23~25 |
| (고정) | RCLIST.IO_FLAG | `= 'IN'` | Mapper.xml:26 |

JOIN: RMASTER.RULE_ID = RCLIST.RULE_ID (Mapper.xml:22). ORDER BY: RCLIST.COL_SEQ (Mapper.xml:27).

#### #2 GetRuleColOutList (Mapper.xml:30~51)

- SELECT 컬럼 12종 = #1 과 동일 (RCLIST 12 컬럼, Mapper.xml:31~42).
- JOIN: RMASTER.RULE_ID = RCLIST.RULE_ID (Mapper.xml:45).
- WHERE: pRuleId if (`= #{pRuleId}`, Mapper.xml:46~48) + 고정 `RCLIST.IO_FLAG = 'OUT'` (Mapper.xml:49).
- ORDER BY: RCLIST.COL_SEQ (Mapper.xml:50).

#### 외부 공통 Mapper (TB_MCA_RULE_COL_LIST_Mapper — 본 자산 외부)

| 호출 (java) | SQL ID | 동작 | 파라미터 | 근거 |
|---|---|---|---|---|
| dao.delete (java:34) | TB_MCA_RULE_COL_LIST_Mapper.delete | RULE_ID 단위 전체 삭제 (`MYBATIS_WHERE = "RULE_ID = '" + RULE_ID + "'"`) | setMap[MYBATIS_WHERE] | java:32~34 |
| dao.insert (java:58) | TB_MCA_RULE_COL_LIST_Mapper.insert | IN 행 1건 insert (COL_SEQ 재계산 + RULE_VER 빈값→"1") | ds_grdIn 행 entrySet 전체 + COL_SEQ | java:43~66 |
| dao.insert (java:83) | TB_MCA_RULE_COL_LIST_Mapper.insert | OUT 행 1건 insert (동일 규칙) | ds_grdOut 행 entrySet 전체 + COL_SEQ | java:68~91 |

---

## §7. Java 트랜잭션 (SaveMasterRuleColList)

### §7.1 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame | SaveMasterRuleColList.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service` (Entity·Repository 는 `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 — RULE.md §"패키지 명명 규칙" §3-1, 2026-05-29 BE 자산 mcm-core 이동) | - |
| 클래스 | SaveMasterRuleColList | java:18 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:13, 18 |
| 어노테이션 | @Slf4j (lombok) | java:15, 17 |
| 진입점 메서드 | public String run(Context context, Task task) | java:19~20 |
| BPMN 매핑 UserTask | SaveMasterRuleColList ("저장") class=#{basePackage}SaveMasterRuleColList | bpmn:51~61 |

### §7.2 메서드 전수

#### run(Context context, Task task) — 단일 메서드 (java:20~100)

| 단계 | 동작 | 호출 SQL ID | 입력 파라미터 | 결과 처리 | 근거 |
|---:|---|---|---|---|---|
| 1 | `log.debug("SaveMasterRuleColList 저장 시작")` | - | - | log | java:22 |
| 2 | `TransactionalDao dao = context.getDao()` | - | - | - | java:23 |
| 3 | `List<Map> ds_grdIn = context.get("ds_grdIn")` / `ds_grdOut = context.get("ds_grdOut")` | - | - | - | java:24~25 |
| 4 | `int cnt=0; Map setMap = new HashMap();` | - | - | - | java:27~28 |
| 5 | 기존구조 삭제: setMap[MYBATIS_WHERE] = "RULE_ID = '" + ds_grdIn[0].RULE_ID + "'" → `dao.delete("TB_MCA_RULE_COL_LIST_Mapper.delete", setMap)` | TB_MCA_RULE_COL_LIST_Mapper.delete | RULE_ID (ds_grdIn 첫 행) | RULE_ID 전체 행 삭제 (반환값 미검증 — 주석 처리된 검증 블록 java:35~40) | java:31~40 |
| 6 | IN 신규생성 루프: `for i in ds_grdIn` — `!nativeeditor_status != "deleted"` 행만, entrySet 전체 setMap.put + `COL_SEQ = cnt+1` + RULE_VER 빈값→"1" → `dao.insert("TB_MCA_RULE_COL_LIST_Mapper.insert", setMap)` ≤ 0 시 throw new Exception("...IN 신규등록 에러발생"), else cnt++ | TB_MCA_RULE_COL_LIST_Mapper.insert | ds_grdIn 행 전체 컬럼 + COL_SEQ | 영향행 ≤ 0 시 예외 | java:43~66 |
| 7 | OUT 신규생성 루프: `for i in ds_grdOut` — IN 과 동일 규칙 (deleted 제외 / COL_SEQ=cnt+1 / RULE_VER 빈값→"1") → `dao.insert(...)` ≤ 0 시 throw new Exception("...OUT 신규등록 에러발생"), else cnt++ | TB_MCA_RULE_COL_LIST_Mapper.insert | ds_grdOut 행 전체 컬럼 + COL_SEQ | 영향행 ≤ 0 시 예외 | java:68~91 |
| 8 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true);` | - | - | context 에 cnt_save 적재 | java:93 |
| 9 | `return null;` | - | - | - | java:94 |
| 10 | `catch (Exception e)` → log.info / log.error / `throw new IllegalTaskException(e)` | - | - | 예외 전파 | java:95~99 |

비고:
- 저장 = **delete-all-then-insert** 패턴: ds_grdIn 첫 행 RULE_ID 로 TB_MCA_RULE_COL_LIST 의 해당 RULE_ID 전체 행 삭제 → ds_grdIn (deleted 제외) + ds_grdOut (deleted 제외) 를 COL_SEQ 1 부터 순번 재부여하며 전량 재삽입 (java:31~91).
- COL_SEQ 는 IN/OUT 통합 단일 카운터 cnt 로 부여 (java:51, 64, 76, 89) — IN 행 N개 후 OUT 행이 N+1 부터 이어짐.
- delete 의 반환값 검증 블록 (java:35~40) 은 **주석 처리** — 삭제 실패해도 예외 없음 (As-Is). **To-Be 보존** (사용자 결정 — As-Is 1:1).
- `setMap.put(keys, vals)` 로 그리드 행의 모든 컬럼 (`!nativeeditor_status` 메타 포함) 을 그대로 insert 파라미터로 전달 (java:46~56) — `!nativeeditor_status` 키도 setMap 에 들어가나 insert SQL 의 named param 으로 미사용 (무시).

### §7.3 트랜잭션 경계

- BPMN UserTask "저장"(SaveMasterRuleColList, bpmn:51~61) 은 oasis 프레임워크에서 단일 트랜잭션으로 실행 (catch 시 IllegalTaskException 던지면 전체 롤백).
- delete(1) + insert(IN N + OUT M) 를 한 트랜잭션 내 순차 처리.
- insert 행 영향행수 ≤ 0 이면 즉시 throw → rollback (delete 까지 포함 전량 롤백).
- 성공 시 `cnt_save` (context key) = 삽입 성공 행수 누적 (xfdl:392 콜백에서 표시).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterRuleFrame | bpmn:3 |
| name | 업무기준 구조관리 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 5.37.0 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_10i9t2b | - | bpmn:7~9 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu, SequenceFlow_1ul62kh | bpmn:10~17 |
| Task_1j1g5cn | task | 결과 항목 조회(IN) | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleColInList, resultKey=ds_GetRuleColInList, isServiceResult=true | SequenceFlow_0grwghu, SequenceFlow_0ifq7qf | SequenceFlow_19mau2h | bpmn:20~34 |
| Task_1c4n8uv | task | 결과 항목 조회(OUT) | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleColOutList, resultKey=ds_GetRuleColOutList, isServiceResult=true | SequenceFlow_19mau2h | SequenceFlow_10i9t2b | bpmn:36~49 |
| SaveMasterRuleColList | userTask | 저장 | com.dongkuk.dmes.UserTask / class=#{basePackage}SaveMasterRuleColList | nextBranchSpel="", afterSpel="" | SequenceFlow_1ul62kh | SequenceFlow_0ifq7qf | bpmn:51~61 |

### §8.3 SequenceFlow 전수 (7 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:18 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_1j1g5cn (조회 IN) | action=search | bpmn:19 |
| SequenceFlow_19mau2h | - | Task_1j1g5cn | Task_1c4n8uv | (IN 조회 후 OUT 조회) | bpmn:35 |
| SequenceFlow_10i9t2b | - | Task_1c4n8uv | EndEvent_1 | - | bpmn:50 |
| SequenceFlow_1ul62kh | save | ExclusiveGateway_1 | SaveMasterRuleColList (저장) | action=save | bpmn:62 |
| SequenceFlow_0ifq7qf | - | SaveMasterRuleColList | Task_1j1g5cn (조회 IN) | (저장 후 재조회) | bpmn:63 |

비고: SequenceFlow 본문 정의는 6개 (bpmn:18, 19, 35, 50, 62, 63). Task_1j1g5cn 은 incoming 2개 (SequenceFlow_0grwghu + SequenceFlow_0ifq7qf, bpmn:31~32) — search 진입과 save 후 재조회 진입이 합류.

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → Task_1j1g5cn(조회 IN) → Task_1c4n8uv(조회 OUT) → End | GetRuleColInList → GetRuleColOutList |
| save | Start → Gateway → SaveMasterRuleColList(저장) → Task_1j1g5cn(조회 IN) → Task_1c4n8uv(조회 OUT) → End | SaveMasterRuleColList.run() → GetRuleColInList → GetRuleColOutList |

비고:
- 모든 action 종료 시 IN 조회 + OUT 조회로 양 그리드 데이터셋 갱신.
- BPMN 의 sqlKey 패턴 = `#{serviceId}Mapper.{sqlId}` — serviceId 변수는 oasis 런타임에서 주입 (As-Is serviceId = "MasterRuleFrame" → "MasterRuleFrameMapper.{sqlId}"; To-Be serviceId = "masterRuleFrame").

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 220 | 104 | 36 | 36 | bpmn:68 |
| EndEvent_1 | 220 | 639 | 36 | 36 | bpmn:74 |
| ExclusiveGateway_1 | 213 | 180 | 50 | 50 | bpmn:80 |
| Task_1j1g5cn (조회 IN) | 156 | 323 | 164 | 50 | bpmn:86 |
| Task_1c4n8uv (조회 OUT) | 156 | 420 | 164 | 50 | bpmn:90 |
| SaveMasterRuleColList (저장) | 356 | 323 | 160 | 50 | bpmn:94 |

---

## §9. 사용 테이블

> **정본 카탈로그 (Q-001 Resolved)**: 본 화면 주 테이블 `MCAAPUSER.TB_MCA_RULE_COL_LIST` (DMES-SECTION-MCA sheet134) / 참조 테이블 `MCAAPUSER.TB_MCA_RULE_MASTER` (sheet135) 가 정본 테이블정의서에 **존재**. 아래 카탈로그는 정본 정의서 Type·길이·한글명 + As-Is Mapper.xml SELECT / Java insert / xfdl Dataset ColumnInfo 출현 위치를 정합한 것이며, 형제 화면 masterRuleList 분석리포트 §9.1 (sheet135 26 컬럼) 과 owner·PK·audit 1:1 정합. To-Be DDL: PK = `(RULE_ID, COL_SEQ)`.

### §9.1 MCAAPUSER.TB_MCA_RULE_COL_LIST (주 테이블 — DMES-SECTION-MCA sheet134, 업무 12 + 공통감사 17)

> 업무 12 컬럼 (정본 Type·길이·한글명 — sheet134 깨끗한 시트). audit 17 컬럼은 As-Is DDL 컬럼이며 To-Be 는 mcm-core `McmAuditEntity` 9 컬럼(C_* 4 + U_* 4 + VER 1)으로 매핑(DATA_END_*/ARCHIVE_* 9 제거 — §9.4 / masterRuleList §9.2 선례 동일).

| # | 영문항목명 | Type (정본) | KEY | 한글명 (정본) | 본 화면 사용 | 출현 위치 | 근거 |
|---:|---|---|---|---|---|---|---|
| 1 | RULE_VER | NUMBER(8,2) | - | 업무기준 버전 (빈값→"1") | ✓ (hidden) | SELECT / insert (Java 보정) | sheet134 / Mapper.xml:19 / java:53~55 / xfdl:159 |
| 2 | RULE_ID | VARCHAR(10) | **PK 1 (NOT NULL)** | 업무기준ID | ✓ | SELECT / delete WHERE / insert | sheet134 / Mapper.xml:8, 22, 24 / java:33, 54 / xfdl:148 |
| 3 | COL_SEQ | NUMBER(3) | **PK 2** | 항목순서 | ✓ | SELECT / ORDER BY / insert (Java 재계산) | sheet134 / Mapper.xml:9, 27 / java:51, 76 / xfdl:149 |
| 4 | COL_ID | VARCHAR(30) | - | 항목ID (영문항목명) | ✓ | SELECT / insert / 그리드 col 2 (editmaxlength=30) | sheet134 / Mapper.xml:10 / xfdl:76, 150 |
| 5 | COL_NM | VARCHAR(100) | - | 항목명 (한글항목명) | ✓ | SELECT / insert / 그리드 col 1 (editmaxlength=100) | sheet134 / Mapper.xml:11 / xfdl:75, 151 |
| 6 | OLD_COL_ID | VARCHAR(100) | - | 기존항목ID | ✓ (hidden) | SELECT / insert (그리드 미표시) | sheet134 / Mapper.xml:18 / xfdl:158 |
| 7 | IO_FLAG | VARCHAR(10) | - | IN/OUT여부 | ✓ | SELECT / WHERE 고정 / insert (행추가 set) | sheet134 / Mapper.xml:16, 26, 49 / xfdl:156, 455 |
| 8 | COL_TYPE | VARCHAR(10) | - | 항목형식 (DATE/NUMBER/VARCHAR2) | ✓ | SELECT / insert / 그리드 col 4 (combo ds_colType) | sheet134 / Mapper.xml:17 / xfdl:78, 157 |
| 9 | COL_LEN | NUMBER(5) | - | 항목길이 (총길이) | ✓ | SELECT / insert / 그리드 col 5 (mask integer, max 5) | sheet134 / Mapper.xml:12 / xfdl:79, 152 |
| 10 | COL_PREC_LEN | NUMBER(5) | - | 항목소수점길이 (소수점길이) | ✓ | SELECT / insert / 그리드 col 6 (mask integer, max 5) | sheet134 / Mapper.xml:15 / xfdl:80, 155 |
| 11 | MES_COL_ID | VARCHAR(50) | - | MES테이블항목명 | ✓ (hidden) | SELECT / insert (그리드 미표시) | sheet134 / Mapper.xml:13 / xfdl:153 |
| 12 | MASTER_CODE_DIV | VARCHAR(2) | - | 코드여부 (N/Y) | ✓ | SELECT / insert / 그리드 col 3 (combo ds_div) | sheet134 / Mapper.xml:14 / xfdl:77, 154 |
| 13~29 | (공통감사 17 컬럼) | VARCHAR(1·50)/TIMESTAMP(6) | - | 생성/변경/종료/Archive audit | **To-Be mcm-core `McmAuditEntity` 9 컬럼** (C_* 4 + U_* 4 + VER 1) — DATA_END_*/ARCHIVE_* 9 제거 | sheet134 (정본 DDL) | §9.4 / masterRuleList §9.2 |

업무 12 컬럼 = As-Is Mapper.xml SELECT 12 컬럼 (Mapper.xml:8~19) 과 1:1 (정본 sheet134 정합). PK = `(RULE_ID, COL_SEQ)` — RULE_ID(VARCHAR(10) NOT NULL) + COL_SEQ(NUMBER(3), IN/OUT 통합 단일 순번 java:51, 64, 76, 89). delete-all(RULE_ID) 후 재삽입 패턴과 정합. **(Q-001 Resolved — 정본 sheet134 카탈로그 확정)**.

### §9.2 MCAAPUSER.TB_MCA_RULE_MASTER (참조 테이블 — DMES-SECTION-MCA sheet135, 업무 9 + 공통감사 17)

본 화면 직접 사용 = RULE_ID (JOIN/필터) 단일. 정본 카탈로그(sheet135, 26 컬럼)는 형제 화면 masterRuleList 분석리포트 §9.1 과 1:1 정합 (PK·NULL여부 정본):

| 컬럼 | NULL여부 | 본 화면 사용 | 용도 | 근거 |
|---|---|---|---|---|
| RULE_VER | NULL=Y | (참조 전용) | 업무기준 Version | sheet135 / masterRuleList §9.1 r23 |
| RULE_ID | **NULL=N (PK)** | ✓ | JOIN 조인키 (RMASTER.RULE_ID = RCLIST.RULE_ID) + WHERE pRuleId 필터 | sheet135 r24 / Mapper.xml:20, 22, 24, 43, 45, 47 |
| OLD_RULE_ID | NULL=Y | - | 구업무기준ID | sheet135 r25 |
| RULE_NM | **NULL=N** | - (P-001 콜백으로 화면 표시) | 업무기준명 | sheet135 r26 |
| RULE_DESC | NULL=Y | - | 업무기준설명 | sheet135 r27 |
| RULE_TP | NULL=Y | - | 업무기준구분 | sheet135 r28 |
| RULE_OWNER_DEPT_NM | NULL=Y | - | 담당부서명 | sheet135 r29 |
| RULE_OWNER_EMP_NO | NULL=Y | - | 담당자사번 | sheet135 r30 |
| USE_TP | NULL=Y | - | 사용여부 | sheet135 r31 |
| (공통감사 17) | NULL=Y | - | audit | **To-Be mcm-core `McmAuditEntity` 9 컬럼** | sheet135 r6~r22 |

비고: TB_MCA_RULE_MASTER 는 본 화면에서 RULE_ID 한 컬럼만 JOIN/필터로 사용 (업무기준명 RULE_NM 등은 본 SELECT 미반환 — 화면 edt_ruleNm 은 P-001 팝업 콜백으로 채움, xfdl:417). 전수 26 컬럼 카탈로그는 형제 화면 masterRuleList 분석리포트 §9.1 (정본 sheet135) 참조 — 엔티티명·PK 1:1 정합. PK = RULE_ID 단일 (Excel sheet135 r24 NOT NULL).

### §9.3 DMES Excel / 테이블명세서 매핑

- DMES MCA 테이블정의서 (`DMES-SECTION-MCA_테이블정의서.xlsx`) 에 본 화면 두 테이블 **존재**: TB_MCA_RULE_COL_LIST (sheet134) / TB_MCA_RULE_MASTER (sheet135). RULE 테이블군은 MCM 정의서가 아니라 **MCA 정의서**에 등재 (As-Is Mapper.xml schema `MCA_SOURCE` 와 일치, owner = `MCAAPUSER`). **종전 MCM 정의서 오참조 정정 (Q-001 Resolved)**.
- 인터페이스 테이블명세서 (docs/mcm/인터페이스 관련 테이블명세서.md) 는 MOM 6 테이블 (FORMAT_LIST / FORMAT_LAYOUT / INTERFACES / TC_LIST / TC_SKIP / TC_ERROR) 한정 — TB_MCA_RULE_* 미포함 (audit 표준 인용 무관).
- 따라서 §9.1 / §9.2 카탈로그는 정본 sheet134/135 정합. audit 컬럼은 mcm-core `McmAuditEntity` 9 컬럼 표준 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 적용 (masterRuleList 선례 동일 — §9.4 / §11).

### §9.4 audit 17 → mcm-core McmAuditEntity 9 매핑 (masterRuleList §9.2 선례 동일)

| As-Is audit 그룹 | As-Is 컬럼 | To-Be 매핑 |
|---|---|---|
| 그룹 1 (생성 4) | CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP | mcm-core `McmAuditEntity` C_* 4 (C_USR_ID / C_SVC_ID / C_PGM_ID / C_AT) |
| 그룹 2 (최종변경 4) | LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP | mcm-core `McmAuditEntity` U_* 4 (U_USR_ID / U_SVC_ID / U_PGM_ID / U_AT) |
| 그룹 3 (데이터종료 5) | DATA_END_STATUS / DATA_END_OBJECT_TYPE / DATA_END_OBJECT_ID / DATA_END_PROGRAM_ID / DATA_END_TIMESTAMP | **제거** (To-Be 미적용) |
| 그룹 4 (Archive 4) | ARCHIVE_COMPLETED_FLAG / ARCHIVED_EMPLOYEE_NUM / ARCHIVED_TIMESTAMP / ARCHIVE_PROGRAM_ID | **제거** (To-Be 미적용) |

비고: As-Is 17 audit → To-Be 9 (`McmAuditEntity` C_* 4 + U_* 4 + VER 1). 업무 컬럼 RULE_VER (sheet134/135 — 업무 버전, INSERT 빈값→"1") 은 mcm-core VER(@Version 낙관적 락) 과 의미 분리 → 별개 컬럼 유지 (masterRuleList Q-011 동일).

---

## §10. 코드값 / LoV

| LoV | 값 | 정의 위치 | 비고 |
|---|---|---|---|
| ds_div (코드여부) | N / Y (+ onload "SELECT" prepend) | xfdl:178~193 + 236 | col 3 MASTER_CODE_DIV combo |
| ds_colType (유형) | DATE / NUMBER / VARCHAR2 (+ onload "SELECT" prepend) | xfdl:194~213 + 237 | col 4 COL_TYPE combo |

비고:
- 두 LoV 모두 xfdl 내 정적 Dataset 하드코딩 (서버 코드테이블 조회 ✗). **To-Be As-Is 정적 유지 (FE enum) — 사용자 확정 2026-06-04 (Q-004 해소)**.
- `gfn_commonAddType(ds, "SELECT", "CODE_VAL", "CODE_VAL_MEAN")` 로 맨 앞 빈 "SELECT" 행 추가 (xfdl:236~237).

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 스키마명 | `MCA_SOURCE.{TABLE}` (Oracle synonym) | Mapper.xml:20, 21, 43, 44 | **To-Be `MCAAPUSER.{TABLE}` 보존** (정본 sheet134/135 B2 owner — masterRuleList 선례 동일) — Q-001 Resolved |
| 동적 WHERE | `<if test='pRuleId != null and pRuleId != ""'>` | Mapper.xml:23~25, 46~48 | MyBatis `<if>` → JPA/native 조건 분기 (동일 의미 보존) |
| 감사 컬럼 | (As-Is DDL 17 컬럼 — Mapper SQL 미명시) | sheet134 audit | mcm-core `McmAuditEntity` 9 컬럼 (`C_*` 4 / `U_*` 4 / `VER` 1) JPA `@PrePersist` / `@PreUpdate` 자동. audit 그룹 3·4 (DATA_END_*/ARCHIVE_*) 9 제거 (§9.4) |
| 외부 공통 Mapper | `TB_MCA_RULE_COL_LIST_Mapper.delete/insert` | java:34, 58, 83 | To-Be: JPA Repository `deleteByRuleId(ruleId)` + `saveAll(...)` 또는 native — Repository = `com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository` (모듈 단위 평탄, RULE.md §"패키지 명명 규칙" §3-1) |
| 명시 PK 정의 | (정본 sheet134 — RULE_ID NOT NULL) | sheet134 | (MSSQL) `(RULE_ID, COL_SEQ)` 복합 PK 명시 + FK (`RULE_ID` → `TB_MCA_RULE_MASTER.RULE_ID`) — Q-001 Resolved |
| delete 반환값 미검증 | 검증 블록 주석 처리 | java:35~40 | **To-Be 보존** (As-Is 1:1 — 사용자 결정) 또는 검증 추가 = 구현 결정 |
| save 송신 모드 | 전체 송신 (`:U` 변경분 모드 주석) | xfdl:362~363 | **To-Be 보존** (전체 delete-all → insert 재구성) |
| orphan 핸들러 | `div_main_div_in_mae_inCnt_onchanged` 바인딩만, 정의 ✗ | xfdl:45 | **To-Be 제거** (orphan — 사용자 결정) |
| LoV 하드코딩 | ds_div / ds_colType 정적 Dataset | xfdl:178~213 | **To-Be As-Is 정적 유지 (FE enum)** — 사용자 확정 2026-06-04 (Q-004 해소) |
| **Optimistic Locking** | RULE_VER (업무 버전, As-Is 명시 ✗ — 빈값→"1") + mcm-core VER 별도 | java:53~55 | RULE_VER (업무 데이터 컬럼, sheet134 NUMBER(8,2)) 보존 + mcm-core `VER` (@Version) audit 별도 자동 (의미 분리 — §9.4) |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame.*` | java:1 | **To-Be Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.{service,dto}.*`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동) |

---

## §12. 결정 누적 (사용자 결정 + 확인필요)

> 활성 확인필요 = **0 건**. Q-003(부모 호출 화면)은 호출관계 조사로 **해소: 메뉴(포털) 직접 진입 — GUI 부모 없음** (2026-06-05). Q-001(To-Be 테이블)·Q-002(cmb 등재 완료)·Q-004(LoV)·영속성(JPA)·"사용여부" 병합헤더는 사용자 확정 2026-06-04.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **To-Be 테이블 정의 (Q-001 — Resolved)** | TB_MCA_RULE_COL_LIST (MCAAPUSER, sheet134) / TB_MCA_RULE_MASTER (MCAAPUSER, sheet135) 가 정본 DMES-SECTION-MCA 정의서에 **존재** (종전 MCM 정의서 오참조). PK = `(RULE_ID, COL_SEQ)` / owner = MCAAPUSER / audit = mcm-core McmAuditEntity 9 — masterRuleList §9 1:1 정합 | §0 / §9 |
| **moduleGroup cmb 등재 (Q-002 — 해소)** | 01 부속 §A.2.3 **등재 완료 (2026-06-04)** — 영역 코드 `cm`+`b`, "업무기준 관리(원장)" | §1 |
| **호출됨 팝업 (Q-003 — 해소)** | **메뉴(포털) 직접 진입 — GUI 부모 없음** (호출관계 조사 2026-06-05: MasterRuleFrameColListPopup 만 본 화면을 자식으로 참조) | §5.2 |
| **LoV 하드코딩 (Q-004 — 확정)** | ds_div / ds_colType 정적 Dataset **As-Is 정적 유지** (FE enum — 사용자 확정 2026-06-04) | §10 / §11 |
| **screenId** | MasterRuleFrame → masterRuleFrame (단일 토큰 — 01 부속 §A.3.1) | §1 |
| **save 송신/저장 패턴** | delete-all (RULE_ID 단위) → IN+OUT 전량 재삽입 (COL_SEQ 통합 순번) — As-Is 보존 | §4.6 / §7.2 |
| **delete 반환값 미검증** | 주석 처리 블록 As-Is 보존 (사용자 결정) | §7.2 / §11 |
| **orphan 핸들러** | `mae_inCnt_onchanged` 바인딩만 정의 ✗ → To-Be 제거 | §3.5 / §11 |
| **"사용여부" 병합 헤더 의미 불일치** | 상위 헤더 "사용여부" + 하위 유형/총길이/소수점길이 — **As-Is 보존** (사용자 확정 2026-06-04) | §3.3 |
| **연동 팝업** | MasterRuleListPop (업무기준 선택) / MasterRuleFrameColListPopup (컬럼 등록) 2종 out-going 호출 보존 | §5.1 |
| **audit 컬럼** | mcm-core `McmAuditEntity` 9 컬럼 자동 (C_*/U_*/VER) — As-Is 17 → 9 (DATA_END_*/ARCHIVE_* 제거) | §9.1 / §9.4 / §11 |
| **스키마/테이블명** | `MCA_SOURCE.` synonym → **`MCAAPUSER.TB_MCA_RULE_*` 보존** (정본 sheet134/135 B2 owner) — Q-001 Resolved | §9 / §11 |
| **권한** | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 기능 §8 |
| **통신 채널** | OASIS REST (cactus 표준) | BPMN §1 |
| **Java 패키지** | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1) | §7 / §11 |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| G1 | xfdl 컴포넌트 전수 (영역 7 + 조회조건 4 + 그리드 2 + 보조 5 + 헤더/상태바 = 전수) | ○ | §3 |
| G2 | 그리드 columns 전수 (G-001 IN 7 cols + G-002 OUT 7 cols) | ○ | §3.3 |
| G3 | Dataset 컬럼 전수 (ds_grdIn 12 + ds_grdOut 12 + ds_div 2 + ds_colType 3) | ○ | §3.3 |
| G4 | java 메서드 전수 (run 단일 — Wow 인터페이스) | ○ | §7.2 |
| G5 | Mapper.xml SQL 전수 (2 SELECT + 외부 delete/insert 2 인용) | ○ | §6 |
| G6 | bpmn flow 노드 전수 (Start/End + Gateway + Task 2 + UserTask 1 = 6 노드, sequenceFlow 6) | ○ | §8.2, §8.3 |
| G7 | action 매트릭스 일치 (search/save + 팝업 2 + rowAdd/Del 4 + fold) | ○ | §4.6 |
| G8 | 팝업 연동 P-NNN 전수 (P-001 / P-002) | ○ | §5.1 |
| G9 | 식별자 cite (모든 본문 주장 file:line) | ○ | 본 문서 전수 |
| G10 | 활성 확인필요 = 0 (Q-003 부모 = 메뉴 진입 해소 2026-06-05) — Q-001·Q-002·Q-004·영속성·병합헤더 확정 | ○ | §12 결정 누적 표 |
| G11 | Runner 미적용 명시 | ○ | §0, 정합체크서 §D.4 |
