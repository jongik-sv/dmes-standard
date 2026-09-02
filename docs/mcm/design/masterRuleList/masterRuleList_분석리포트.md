---
screenId: masterRuleList
asIsId: MasterRuleList
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 목록조회 (masterRuleList) 분석리포트

> 본 문서 = 5종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — R-14 Auto Manifest 미적용. 입력 자산은 mui (xfdl/Java/Mapper.xml/bpmn) 4종 + DMES Excel 1종). manifest 폴더 미생성.
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 / SP @Case 분기 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / Java Wow 트랜잭션 / bpmn flow) 로 매핑.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / Dataset 컬럼 전수 / Java 메서드 전수 / Mapper.xml SQL 전수 / bpmn flow 전수). "주요/대표/등" 표현 ✗.
- As-Is DB = Oracle (`NVL()` 함수 / `||` 문자열 연결 / schema `MCA_SOURCE` 명시). To-Be DB = MSSQL. §11 변환점 명시.
- 본 화면은 형제 화면(MasterRuleListPop / MasterRuleFrame / MasterRuleData / MasterRuleFrameColListPopup) 과 같은 `cmb` 폴더에 속하나, 본 분석은 `MasterRuleList` 4 자산만 대상으로 한다 (형제 화면 혼입 ✗).

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterRuleList | MasterRuleList.xfdl:3 (`<Form id="MasterRuleList" ...>`) |
| 화면 ID (To-Be) | masterRuleList | 사용자 결정 (모듈 mcm + As-Is 화면명 단일 토큰) |
| 화면명 | 업무기준 목록조회 | MasterRuleList.xfdl:3 (`titletext="업무기준 목록조회"`) / MasterRuleList.bpmn:3 (`name="업무기준 목록조회"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 사용자 지시 (DMES-SECTION 대응) |
| 모듈 그룹 | cmb — 한글명 **"업무기준 관리(원장)"** | 사용자 지시 등재 (01 부속서 A.2.1 영역 코드 `cmb`) / 자산 경로 `mui/src/nxuiMui/cmb/` |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 목록조회 (masterRuleList) | - |
| 화면 크기 | 1280 × 670 | MasterRuleList.xfdl:3 (`width="1280" height="670"`) |
| onload 핸들러 | MasterRuleList_onload | MasterRuleList.xfdl:3 / xfdl:122 |
| 최초 생성 | 2019.11.21 최민수 | MasterRuleList.xfdl:114 |
| 수정 | 2020.05.08 최규찬 | MasterRuleList.xfdl:115 |
| 화면 성격 | 업무기준 CRUD 단일 그리드 화면 (행 추가/삭제/저장) | xfdl:138~144 (search/save 상단 2 + rowAdd/rowDelete/excelDown 우측 3) |
| 주 사용 테이블 | MCA_SOURCE.TB_MCA_RULE_MASTER | MasterRuleListMapper.xml:20 / SaveMasterRule.java:48, 65, 77 |
| 참조 테이블 | (없음 — 단일 테이블, JOIN 없음) | MasterRuleListMapper.xml:7~30 |
| 트랜잭션 클래스 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList.SaveMasterRule | SaveMasterRule.java:1, MasterRuleList.bpmn:42 |
| BPMN 프로세스 ID | MasterRuleList | MasterRuleList.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleList.bpmn:3 |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleList.xfdl | 294 | nexacro Form + Script |
| 2 | Java (UserTask) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleList\SaveMasterRule.java | 92 | implements Wow — save 트랜잭션 (insert/update 2 분기) |
| 3 | Mapper.xml | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleListMapper.xml | 32 | namespace=MasterRuleListMapper, 1 SQL |
| 4 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleList.bpmn | 117 | Camunda Modeler 3.1.2 |
| 5 | DMES 테이블 정의서 | docs/external/DMES/DMES-SECTION-MCA_테이블정의서.xlsx | (xlsx) | MCAAPUSER.TB_MCA_RULE_MASTER 카탈로그 (sheet135, 26 컬럼 — §9 매핑) |

추가 외부 참조(본 화면 자산에 미포함, 인용으로만 사용):
- `TB_MCA_RULE_MASTER_Mapper.select` / `.insert` / `.update` (SaveMasterRule.java:48, 65, 77 에서 호출). 본 SQL 정의(`TB_MCA_RULE_MASTER_Mapper` namespace) 는 본 화면 자산(`MasterRuleListMapper.xml`) 외부 — 공통 CRUD Mapper 로 추정. §6.2 참조.
- `_com_div::commonTopButton.xfdl` / `commonRightButton.xfdl` / `commonBottomStatus.xfdl` (xfdl:10, 82, 86) — 공통 메뉴/상태바 div (본 자산 외부).
- `gfn_*` 공통 스크립트 함수 (`gfn_transaction` / `gfn_setParam` / `gfn_message` / `gfn_isNull` / `gfn_isDatasetChanged` / `gfn_scanOpenerComponent` / `gfn_commonOnheadclick` / `gfn_fold` / `gfn_exportExcel` / `gfn_commonBottomStatus_msg` / `gfn_formOnLoad`) — `_lib::libInClude.xjs` (xfdl:119) 정의, 본 자산 외부.

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom/height) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:6 |
| A-002 | 조회조건 | div_search | top=div_title:0, left=20, right=20, height=43 | xfdl:19 |
| A-003 | 접기 토글 | btn_fold | top=div_search:0, left=20, right=20, height=15 | xfdl:29 |
| A-004 | 메인 (그리드 + 우측 메뉴) | div_main | top=btn_fold:5, left=20, right=20, bottom=40 | xfdl:30 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:86 |

### §3.2 조회조건 (S-NNN) — div_search

> 화면 표시명 출처: `Static.text` (01 부속서 A.4.10 폴백 1단계 — 인접 Static 라벨). 입력 유형 enum: Edit → `TextBox` (01 부속서 A.4.12).

| S-NNN | xfdl id | 종류 | 라벨 (As-Is Static.text) | 초기 value / text | 폭 | maxlength | inputmode | 파라미터 | To-Be 컬럼 (직역) | 근거 |
|---|---|---|---|---|---:|---:|---|---|---|---|
| S-001 | stc_ruleId | Static (라벨) | 업무기준 ID | "업무기준 ID" | 80 | - | - | (라벨) | - | xfdl:22 |
| S-002 | edt_ruleId | Edit (TextBox) | (업무기준 ID 입력) | text="USD" | 100 | 0 | normal | pRuleId | ruleId | xfdl:23 |
| S-003 | stc_ruleNm | Static (라벨) | 업무기준명 | "업무기준명" | 80 | - | - | (라벨) | - | xfdl:24 |
| S-004 | edt_ruleNm | Edit (TextBox) | (업무기준명 입력) | text="USD" | 260 | 0 | normal | pRuleNm | ruleNm | xfdl:25 |

비고:
- 2 Edit 컴포넌트(edt_ruleId / edt_ruleNm) As-Is `text="USD"` 초기값 (xfdl:23/25). **To-Be 제거 — 빈 문자열** (사용자 결정 2026-06-05: §12 "USD 보존" 철회. 사유 = 저장후 자동 재조회가 현재 필터를 적용 → "USD" 기본필터가 비-USD 신규행을 가려 "저장 안됨" 혼란. masterCategoryMng "USD 취소" 선례와 정합).
- `maxlength="0"` 는 nexacro 표기상 무제한.
- edt_ruleNm 에는 `onkeydown="div_search_edt_ruleNm_onkeydown"` 핸들러가 선언되어 있으나, Script 본문에 해당 함수 정의가 **존재하지 않음** (xfdl:25 선언만, Script 영역 미정의). As-Is 미구현 — To-Be 미반영 + Q-008 등재.

### §3.3 결과 그리드 G-001 — div_main.grd_Main (binddataset=ds_grdMain)

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grd_Main | xfdl:33 |
| binddataset | ds_grdMain | xfdl:33 |
| autofittype | col | xfdl:33 |
| selecttype | multiarea | xfdl:33 |
| cellmovingtype / cellsizingtype | col / col | xfdl:33 |
| onheadclick | div_main_grd_Main_onheadclick | xfdl:33 / xfdl:253 |
| head 행 높이 | 25 | xfdl:50 |
| body 행 높이 | 25 | xfdl:51 |

#### Grid columns 전수 (11 cols — head Band / body Band)

| col | head text | bind | displaytype | edittype | editinputtype | 부가 속성 | 근거 |
|---:|---|---|---|---|---|---|---|
| 0 | 구분 | STATUS | imagecontrol | (기본) | - | - | xfdl:54, 67 |
| 1 | 순번 | expr:currow+1 | normal | (기본) | - | head font bold 12px | xfdl:55, 68 |
| 2 | 업무기준ID | RULE_ID | 신규행=editcontrol / else normal | 신규행=text / else none | - | head font bold 12px | xfdl:56, 69 |
| 3 | 업무기준명 | RULE_NM | 신규행=editcontrol / else normal | 신규행=text / else none | - | textAlign=left / head font bold 12px | xfdl:57, 70 |
| 4 | 설명 | RULE_DESC | 신규행=editcontrol / else normal | 신규행=text / else none | - | textAlign=left / head font bold 12px | xfdl:58, 71 |
| 5 | 사용여부 | USE_TP | normal | none | - | head font bold 12px | xfdl:59, 72 |
| 6 | Version | RULE_VER | (기본) | (기본) | number | head font bold 12px | xfdl:60, 73 |
| 7 | 담당자 | RULE_OWNER_EMP_NO | (기본) | (기본) | - | head font bold 12px | xfdl:61, 74 |
| 8 | 시작일자 | CREATION_TIMESTAMP | (기본) | (기본) | - | calendardateformat=yyyy-MM-dd HH:mm:ss / calendardisplaynulltype=none / head font bold 12px | xfdl:62, 75 |
| 9 | 최종수정자 | LAST_UPDATED_OBJECT_ID | (기본) | (기본) | - | head font bold 12px | xfdl:63, 76 |
| 10 | 최종수정일 | LAST_UPDATE_TIMESTAMP | (기본) | (기본) | - | calendardateformat=yyyy-MM-dd HH:mm:ss / calendardisplaynulltype=none / head font bold 12px | xfdl:64, 77 |

비고:
- col 0 (구분) = `displaytype="imagecontrol" text="bind:STATUS"` — STATUS 값(이미지)으로 행 상태 아이콘 표시. STATUS 컬럼은 ds_grdMain ColumnInfo(xfdl:91~104) 에 **미선언** — Nexacro auto row state 동작. **To-Be FE 프레임워크에서 동일 row state 표시 구현** (사용자 결정 — masterCategoryMng 선례 동일).
- col 1 (순번) text = `expr:currow+1` (1 부터 시작 일련번호).
- col 2 (업무기준ID) / col 3 (업무기준명) / col 4 (설명) = 신규행(`getRowType(currow) == Dataset.ROWTYPE_INSERT`)일 때만 editcontrol/text, 기존행은 normal/none (read-only). 기존행 편집 차단 의도. col 5~10 은 displaytype/edittype 명시 없음(grid 기본값 = normal/none, 비편집).
- 단, fn_save 의 검증(fn_checkSave, xfdl:264~292)은 `ROWTYPE_UPDATE` 도 저장 대상에 포함하므로(xfdl:280), 셀 편집 자체가 비활성인 col 도 데이터셋 변경(setColumn 등)으로 updated 상태가 될 수 있음 — As-Is 동작 그대로 보존.
- col 6 (Version) `editinputtype="number"` (숫자 입력 제약).
- col 8 (시작일자) / col 10 (최종수정일) = `calendardateformat="yyyy-MM-dd HH:mm:ss"` 날짜 포맷 표시 / `calendardisplaynulltype="none"` (null 시 빈 표시).

#### Dataset 컬럼 전수 (ds_grdMain — xfdl:90~105, 12 컬럼)

| 컬럼 ID | type | size | 그리드 col 매핑 | 근거 |
|---|---|---:|---|---|
| RULE_ID | STRING | 256 | col 2 업무기준ID | xfdl:92 |
| OLD_RULE_ID | STRING | 256 | (그리드 미표시 — WHERE 필터 전용) | xfdl:93 |
| RULE_NM | STRING | 256 | col 3 업무기준명 | xfdl:94 |
| RULE_DESC | STRING | 256 | col 4 설명 | xfdl:95 |
| RULE_VER | STRING | 256 | col 6 Version | xfdl:96 |
| RULE_TP | STRING | 256 | (그리드 미표시 — rowAdd 시 'A' 세팅) | xfdl:97 |
| RULE_OWNER_DEPT_NM | STRING | 256 | (그리드 미표시 — SELECT 반환) | xfdl:98 |
| RULE_OWNER_EMP_NO | STRING | 256 | col 7 담당자 | xfdl:99 |
| USE_TP | STRING | 256 | col 5 사용여부 | xfdl:100 |
| CREATION_TIMESTAMP | STRING | 256 | col 8 시작일자 | xfdl:101 |
| LAST_UPDATED_OBJECT_ID | STRING | 256 | col 9 최종수정자 | xfdl:102 |
| LAST_UPDATE_TIMESTAMP | STRING | 256 | col 10 최종수정일 | xfdl:103 |

비고:
- col 0 (STATUS) 는 ColumnInfo 미선언 (Nexacro auto row state) — 위 §3.3 col 표 참조.
- col 1 (순번) 은 `expr:currow+1` 계산식 — 컬럼 미선언.
- OLD_RULE_ID / RULE_TP / RULE_OWNER_DEPT_NM 3 컬럼은 그리드 헤드에 미표시되나 dataset 에 존재 — OLD_RULE_ID 는 SQL WHERE 필터(`RULE_ID != NVL(OLD_RULE_ID,...)`) 에 사용, RULE_TP 는 rowAdd 시 'A' 세팅(xfdl:229) 후 INSERT 송신, RULE_OWNER_DEPT_NM 은 SELECT 반환(Mapper.xml:14) 되나 그리드/INSERT 미사용.

### §3.4 편집 그리드 — 해당 없음

- grd_Main 단일 그리드가 결과 + 편집 겸용 (신규행만 col 2~4 인라인 편집). 별도 GE-NNN 없음.

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 제목 Edit (readonly) | div_title.edt_title (width=140, height=25, left=0, bottom=10) | (없음) | xfdl:9 |
| C-002 | 상단 메뉴 div | div_title.div_topMenu (width=290, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:10 |
| C-003 | 우측 메뉴 div | div_main.div_rightMenu (top=0, height=20, right=0, width=300) | _com_div::commonRightButton.xfdl | xfdl:82 |
| C-004 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:86 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:135~145)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | (commonTop 표준 조회) | fn_search (xfdl:148) | search | xfdl:139, 148~161 |
| B-002 | btn_save | (commonTop 표준 저장) | fn_save (xfdl:164) | save | xfdl:139, 164~183 |

비고: 라벨은 `_com_div::commonTopButton.xfdl` 공통 div 의 표준 조회/저장 버튼(`["btn_search"]`/`["btn_save"]` 배열 키, xfdl:139) — 텍스트는 공통 div 내부 정의(본 자산 외부). 01 부속서 A.4.10 폴백 5단계 미존재 → action enum 으로 표기.

### §4.2 우측 메뉴 (commonRight — fn_button xfdl:140~144)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-003 | btn_rowAdd | (commonRight 표준 행추가) | fn_rowAdd (xfdl:222) | (client-side) rowAdd | xfdl:142, 222~235 |
| B-004 | btn_rowDelete | (commonRight 표준 행삭제) | fn_rowDelete (xfdl:238) | (client-side) rowDelete | xfdl:142, 238~250 |
| B-005 | btn_excelDown | (commonRight 표준 엑셀다운) | fn_excelDown (xfdl:216) | (client-side) excelDown | xfdl:142, 216~219 |

비고: 버튼 키 배열 = `new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_excelDown"])` (xfdl:142). masterCategoryMng 의 우측 5 버튼(rowAdd/rowCopy/rowDelete/rowCancel/excelDown) 과 달리 본 화면은 **rowAdd / rowDelete / excelDown 3 버튼만** (rowCopy / rowCancel 없음).

### §4.3 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-006 | btn_fold | (접기/펴기 화살표 — text="") | btn_fold_onclick (xfdl:210) | (client-side) fold | xfdl:29, 210~213 |

비고: btn_fold 의 `text=""` (xfdl:29) — 라벨 없음, cssclass=`btn_WFSA_Fold` 화살표 아이콘.

### §4.4 그리드 헤더 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| GB-001 | grd_Main 헤드(전 컬럼) | div_main_grd_Main_onheadclick (xfdl:253) → gfn_commonOnheadclick(obj, e) | 그리드 정렬 (공통 함수 위임) | xfdl:33, 253~256 |

비고: masterCategoryMng 의 CHK 전체선택 토글(GB-001)과 달리 본 화면은 CHK 컬럼이 없으므로 헤드 클릭은 **정렬 위임만** (gfn_commonOnheadclick). 전체선택/해제 토글 ✗.

### §4.5 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | "" | ds_grdMain=ds_GetRuleMasterList | xfdl:152~155 / bpmn:35 |
| B-002 btn_save | save | Y | SequenceFlow_0nago4p | ds_grdMain=ds_grdMain:U | "" | xfdl:172~177 / bpmn:48 |
| B-003~B-005 | rowAdd/rowDelete/excelDown | N (client-side만) | (해당 없음) | - | - | xfdl:216~250 |
| B-006 btn_fold | fold | N (UI 토글만) | (해당 없음) | - | - | xfdl:210~213 |

비고:
- save 의 `sOutDatasets = ""` (xfdl:175) — 저장 응답 데이터셋 없음. 단 BPMN 상 save → Task_2(Main조회) 후행(SequenceFlow_0tacpyk → Task_2, bpmn:49) 으로 저장 후 자동 재조회되어 그리드 갱신됨.
- save 의 sArgument = `gfn_scanOpenerComponent(this.div_search.form)` (xfdl:176) — div_search 내 컴포넌트(조회조건 2 파라미터) 자동 스캔 송신.
- search 의 sArgument = pRuleId + pRuleNm 2 파라미터 (xfdl:156~157).
- masterCategoryMng 와 달리 **delete action / delete BPMN flow 자체가 부재** (BPMN 에 delete 노드 없음 — bpmn:1~117 전수 확인). 삭제는 신규행 client-side 삭제만(fn_rowDelete).

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

- mui xfdl 본문에 `goPopup` / `setUserPopup` / `nexacro.createDialog` 등 팝업 직접 호출 ✗.
- 행 추가 시 `setFocus()` 로 그리드 포커스 이동만 수행 (xfdl:225).
- → **본 화면에서 호출하는 팝업 없음**.

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 업무기준 마스터 목록 자체. 형제 화면 `MasterRuleListPop` (업무기준 List조회 팝업) 이 별도 존재하나 본 화면(MasterRuleList) 을 in-coming 호출하지 않음 (별개 팝업 화면 — 본 분석 범위 외).
- mcm 모듈 단독 화면 — 다른 화면에서 본 화면을 직접 호출하지 않음 (사용자 결정).

---

## §6. SQL ID 매트릭스

### §6.1 본 화면 Mapper.xml SQL (전수 1개 — MasterRuleListMapper.xml)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 결합 (JOIN) | 동적 WHERE (mybatis if) | 정렬 (ORDER BY) | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetRuleMasterList | select | java.util.Map | java.util.Map | MCA_SOURCE.TB_MCA_RULE_MASTER | (없음 — 단일 테이블) | pRuleId / pRuleNm (2 if) | RULE_ID | `NVL(OLD_RULE_ID, 'ZZZZ0000')` / `\|\|` 문자열 결합 (LIKE '%' \|\| #{x} \|\| '%') × 2 / `UPPER()` | MasterRuleListMapper.xml:7~30 |

#### #1 GetRuleMasterList (MasterRuleListMapper.xml:7~30)

SELECT 컬럼 12종 (전수):
| 별칭 | 매핑 컬럼 (Dataset) | 근거 |
|---|---|---|
| RULE_ID | ds_grdMain.RULE_ID (col 2 업무기준ID) | Mapper.xml:8 |
| OLD_RULE_ID | ds_grdMain.OLD_RULE_ID (WHERE 필터 전용) | Mapper.xml:9 |
| RULE_NM | ds_grdMain.RULE_NM (col 3 업무기준명) | Mapper.xml:10 |
| RULE_DESC | ds_grdMain.RULE_DESC (col 4 설명) | Mapper.xml:11 |
| RULE_VER | ds_grdMain.RULE_VER (col 6 Version) | Mapper.xml:12 |
| RULE_TP | ds_grdMain.RULE_TP (rowAdd 시 'A') | Mapper.xml:13 |
| RULE_OWNER_DEPT_NM | ds_grdMain.RULE_OWNER_DEPT_NM (미표시) | Mapper.xml:14 |
| RULE_OWNER_EMP_NO | ds_grdMain.RULE_OWNER_EMP_NO (col 7 담당자) | Mapper.xml:15 |
| USE_TP | ds_grdMain.USE_TP (col 5 사용여부) | Mapper.xml:16 |
| CREATION_TIMESTAMP | ds_grdMain.CREATION_TIMESTAMP (col 8 시작일자) | Mapper.xml:17 |
| LAST_UPDATED_OBJECT_ID | ds_grdMain.LAST_UPDATED_OBJECT_ID (col 9 최종수정자) | Mapper.xml:18 |
| LAST_UPDATE_TIMESTAMP | ds_grdMain.LAST_UPDATE_TIMESTAMP (col 10 최종수정일) | Mapper.xml:19 |

WHERE 절 (전수):
| # | 조건 | 종류 | 근거 |
|---:|---|---|---|
| 1 | `RULE_ID != NVL(OLD_RULE_ID, 'ZZZZ0000')` | 고정 필터 (OLD_RULE_ID 와 동일한 행 = 구버전/이력 제외) | Mapper.xml:21 |
| 2 | `AND UPPER(RULE_ID) LIKE UPPER('%' \|\| #{pRuleId} \|\| '%')` | 동적 if (pRuleId != null && != "") | Mapper.xml:22~24 |
| 3 | `AND UPPER(RULE_NM) LIKE UPPER('%' \|\| #{pRuleNm} \|\| '%')` | 동적 if (pRuleNm != null && != "") | Mapper.xml:25~27 |
| 4 | `AND NVL(USE_TP,'N') != 'N'` | 고정 필터 (사용여부 'N'(미사용) 제외) | Mapper.xml:28 |

ORDER BY: RULE_ID (Mapper.xml:29).

비고:
- WHERE #1 `RULE_ID != NVL(OLD_RULE_ID, 'ZZZZ0000')` = OLD_RULE_ID 가 채워진(= 변경 이력으로 복제된) 행을 목록에서 제외하는 As-Is 룰. masterCategoryMng 에 없는 본 화면 고유 로직 — **To-Be 보존** (사용자 결정 필요 — §12 / Q-009).
- WHERE #4 `NVL(USE_TP,'N') != 'N'` = USE_TP 가 NULL 이거나 'N' 인 행(미사용/논리삭제) 제외. 즉 **본 목록조회는 USE_TP != 'N' 인 활성 업무기준만 표시** — 삭제 대신 USE_TP 토글로 논리삭제하는 As-Is 정책 시사.
- LIKE 검색 2종 모두 `UPPER()` 양변 적용 — 대소문자 무시 검색 (masterCategoryMng 는 컬럼만 UPPER 미적용, 본 화면은 `UPPER(컬럼) LIKE UPPER('%'||#{x}||'%')` 양변 UPPER).

### §6.2 Java 호출 SQL (TB_MCA_RULE_MASTER_Mapper namespace — 본 자산 외부)

> SaveMasterRule.java 가 호출하는 3 SQL ID. namespace = `TB_MCA_RULE_MASTER_Mapper` (MasterRuleListMapper namespace 아님). 본 SQL 정의는 본 화면 자산 외부(공통 테이블 CRUD Mapper) — 인용만.

| # | SQL ID (호출 문자열) | 유형 | 호출 위치 | 입력 파라미터 | 근거 |
|---:|---|---|---|---|---|
| 1 | TB_MCA_RULE_MASTER_Mapper.select | select | inserted 분기 (중복 PK 사전 체크) | pRuleId + MYBATIS_WHERE("RULE_ID = #{pRuleId}") | SaveMasterRule.java:48 |
| 2 | TB_MCA_RULE_MASTER_Mapper.insert | insert | inserted 분기 | RULE_ID / RULE_TP / RULE_DESC / RULE_OWNER_EMP_NO / RULE_NM / USE_TP / RULE_VER (7 컬럼) | SaveMasterRule.java:65 |
| 3 | TB_MCA_RULE_MASTER_Mapper.update | update | updated 분기 | RULE_NM / RULE_DESC / USE_TP (SET 3) + pRuleId + MYBATIS_WHERE("RULE_ID = #{pRuleId}") | SaveMasterRule.java:77 |

비고:
- select(#1) 은 INSERT 전 동일 RULE_ID 존재 여부 사전 체크용 (`dao.selectOne`, java:48). 결과 not null 시 `UserException("[RULE_ID] 동일한 업무기준ID가 존재합니다.")` throw (java:50~54).
- insert(#2) WHERE/PK = RULE_ID 단일 (masterCategoryMng 의 복합 PK 2 컬럼과 달리 본 화면은 RULE_ID 단일 PK).
- update(#3) SET = RULE_NM / RULE_DESC / USE_TP 3 컬럼만 (RULE_TP / RULE_VER / RULE_OWNER_EMP_NO 는 UPDATE 미포함). WHERE = `RULE_ID = #{pRuleId}` (CactusConstants.MYBATIS_WHERE 사용, java:75).
- **delete 분기 부재** — SaveMasterRule.java 에는 inserted / updated 2 분기만 (java:43, 67). deleted 분기 없음. 삭제는 신규행 client 삭제만(fn_rowDelete, xfdl:242~244) — 기존행 서버 삭제 경로 ✗.

---

## §7. Java 트랜잭션 (SaveMasterRule)

### §7.1 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList | SaveMasterRule.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cmb.masterRuleList.service` (RULE.md §"패키지 명명 규칙" / masterCategoryMng 선례 — Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}.*`) | - |
| 클래스 | SaveMasterRule | java:19 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:14, 19 |
| 어노테이션 | @Slf4j (lombok) | java:16, 18 |
| 진입점 메서드 | public String run(Context context, Task task) | java:20~21 |
| BPMN 매핑 UserTask | SaveMasterRule ("메인저장") class=#{basePackage}SaveMasterRule | bpmn:37~47 |

### §7.2 메서드 전수

#### run(Context context, Task task) — 단일 메서드 (java:20~90)

| 단계 | 동작 | 호출 SQL ID | 입력 파라미터 | 결과 처리 | 근거 |
|---:|---|---|---|---|---|
| 1 | `log.debug("##########	SaveMasterRule 시작")` | - | - | log | java:23 |
| 2 | `TransactionalDao dao = context.getDao()` | - | - | - | java:26 |
| 3 | `List<Map<String,Object>> grdMainList = (List...) context.get("ds_grdMain")` | - | - | - | java:27 |
| 4 | mapInsert / mapUpdate / mapSelect HashMap 초기화 | - | - | - | java:29~31 |
| 5 | `if(grdMainList.size() > 0)` → `for(i=0; i<size(); i++)` 루프 시작 | - | - | - | java:33~37 |
| 5.0 | `String nativeeditor_status = grdMainMap.get("!nativeeditor_status")` + log.debug | - | - | - | java:40~41 |
| 5.1 | "inserted" 분기: mapSelect.put(pRuleId, RULE_ID) + MYBATIS_WHERE → `dao.selectOne("TB_MCA_RULE_MASTER_Mapper.select", mapSelect)` → not null 시 `throw new UserException("["+RULE_ID+"] 동일한 업무기준ID가 존재합니다.")` | TB_MCA_RULE_MASTER_Mapper.select | pRuleId | 중복 시 UserException | java:43~54 |
| 5.2 | "inserted" 분기 (계속): mapInsert.put(RULE_ID / RULE_TP / RULE_DESC / RULE_OWNER_EMP_NO / RULE_NM / USE_TP / RULE_VER 7) → `dao.insert("TB_MCA_RULE_MASTER_Mapper.insert", mapInsert)` | TB_MCA_RULE_MASTER_Mapper.insert | RULE_ID, RULE_TP, RULE_DESC, RULE_OWNER_EMP_NO, RULE_NM, USE_TP, RULE_VER | INSERT 실행 | java:56~65 |
| 5.3 | "updated" 분기: mapUpdate.put(RULE_NM / RULE_DESC / USE_TP 3) + pRuleId + MYBATIS_WHERE("RULE_ID = #{pRuleId}") → `dao.update("TB_MCA_RULE_MASTER_Mapper.update", mapUpdate)` | TB_MCA_RULE_MASTER_Mapper.update | RULE_NM, RULE_DESC, USE_TP, pRuleId | UPDATE 실행 | java:67~78 |
| 6 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", grdMainList.size(), null, true)` | - | - | context 에 cnt_save 적재 (= 전체 행수) | java:82 |
| 7 | `return null;` | - | - | - | java:83 |
| 8 | `catch (Exception e)` → log.info / log.error / `throw new IllegalTaskException(e)` | - | - | 예외 전파 | java:84~88 |

비고:
- masterCategoryMng(SaveTbMcmCodeCategory) 와의 차이: (a) **deleted 분기 없음** (insert/update 2 분기만), (b) inserted 분기에 **중복 PK 사전 SELECT 체크 + UserException** 존재 (masterCategoryMng 은 사전 체크 없이 직접 INSERT), (c) insert 영향행 ≤ 0 검사 없음 (masterCategoryMng 은 영향행 ≤ 0 시 throw), (d) cnt_save 에 **전체 행수**(`grdMainList.size()`) 적재 (실제 처리 행수 아님 — masterCategoryMng 의 cnt 누적과 다름).
- insert 컬럼에 `RULE_TP`(rowAdd 시 'A' 세팅, xfdl:229) 포함 — masterCategoryMng 과 달리 RULE_TP 명시 전달.
- update SET 에 RULE_VER 미포함 — 버전은 INSERT 시 '1' 고정(xfdl:231) 후 UPDATE 미변경.

### §7.3 트랜잭션 경계

- BPMN UserTask "메인저장"(SaveMasterRule, bpmn:37~47) 은 oasis 프레임워크에서 단일 트랜잭션으로 실행 (catch 시 IllegalTaskException 던지면 전체 롤백).
- nativeeditor_status 2종 (inserted/updated) 을 한 트랜잭션 내 순차 처리.
- ds_grdMain 행 단위 처리 — inserted 행에서 중복 PK 발견 시 즉시 UserException → rollback.
- 성공 시 `cnt_save` (context key) = 전체 행수 적재 (xfdl:201 콜백에서 표시).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterRuleList | bpmn:3 |
| name | 업무기준 목록조회 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_0lnje1n | - | bpmn:7~9 |
| Task_2 | task | Main조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleMasterList, resultKey=ds_GetRuleMasterList, isServiceResult=true, paramKey="" | SequenceFlow_0grwghu, SequenceFlow_0tacpyk | SequenceFlow_0lnje1n | bpmn:10~25 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu, SequenceFlow_0nago4p | bpmn:26~33 |
| SaveMasterRule | userTask | 메인저장 | com.dongkuk.dmes.UserTask / class=#{basePackage}SaveMasterRule | nextBranchSpel="", afterSpel="" | SequenceFlow_0nago4p | SequenceFlow_0tacpyk | bpmn:37~47 |

비고: masterCategoryMng 의 6 노드(+Task_0k24d4u 삭제, +Task_0lk57sx 전체조회)와 달리 본 화면은 **5 노드** (Start/End/Gateway/Task_2/UserTask) — Main삭제 노드 / Main전체조회 노드 모두 부재.

### §8.3 SequenceFlow 전수 (5 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:34 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 (Main조회) | action=search | bpmn:35 |
| SequenceFlow_0lnje1n | - | Task_2 | EndEvent_1 | (조회 후 종료) | bpmn:36 |
| SequenceFlow_0nago4p | save | ExclusiveGateway_1 | SaveMasterRule (메인저장) | action=save | bpmn:48 |
| SequenceFlow_0tacpyk | - | SaveMasterRule | Task_2 (Main조회) | (저장 후 재조회) | bpmn:49 |

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → Task_2(Main조회) → End | GetRuleMasterList |
| save | Start → Gateway → SaveMasterRule(메인저장) → Task_2(Main조회) → End | SaveMasterRule.run() → GetRuleMasterList |

비고:
- 두 action 모두 Task_2(Main조회) 를 거쳐 종료 — save 는 저장 후 자동 재조회.
- masterCategoryMng 와 달리 **전체조회(AllList) 후행 없음** — Task_2 → End 직결. 클라이언트 전체 중복체크(ds_grdMainAll) 미사용.
- BPMN 의 sqlKey 패턴 = `#{serviceId}Mapper.GetRuleMasterList` — serviceId 변수는 oasis 런타임 주입 (As-Is serviceId = "MasterRuleList" → "MasterRuleListMapper.GetRuleMasterList"; To-Be serviceId = "masterRuleList").

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 220 | 104 | 36 | 36 | bpmn:54 |
| EndEvent_1 | 220 | 641 | 36 | 36 | bpmn:60 |
| Task_2 | 156 | 411 | 164 | 50 | bpmn:66 |
| ExclusiveGateway_1 | 213 | 180 | 50 | 50 | bpmn:72 |
| SaveMasterRule | 373 | 411 | 160 | 50 | bpmn:97 |

---

## §9. 사용 테이블

### §9.1 MCAAPUSER.TB_MCA_RULE_MASTER (주 테이블 — DMES MCA Excel sheet135 전수 26 컬럼)

> 정본 owner = `MCAAPUSER.TB_MCA_RULE_MASTER` (DMES-SECTION-MCA 테이블정의서 sheet135 — Python xml 파싱 추출, B2=`MCAAPUSER.TB_MCA_RULE_MASTER`, E2 항목개수=26). As-Is Mapper.xml 의 `MCA_SOURCE.` 는 Oracle synonym. **To-Be**: `MCAAPUSER.TB_MCA_RULE_MASTER` 보존 + audit 부분은 mcm-core `McmAuditEntity` 9 컬럼 적용으로 폐기(masterCategoryMng 선례 동일). Excel 의 Type/자릿수/한글의미 셀은 정의서 misalignment 로 추출 불가(A 컬럼이 수치코드) → Q-010 등재.

| 순서(C) | 영문항목명(D) | KEY/NULL(H) | 한글의미 | 본 화면 사용 | 출현 위치 | 근거 |
|---:|---|---|---|---|---|---|
| 0 | CREATED_OBJECT_TYPE | NULL=Y | 생성TYPE | ✓ (audit) | (INSERT audit 자동) | Excel sheet135 r6 |
| 1 | CREATED_OBJECT_ID | NULL=Y | 생성USER | ✓ (audit) | (INSERT audit 자동) | Excel sheet135 r7 |
| 2 | CREATED_PROGRAM_ID | NULL=Y | 생성SERVICE | ✓ (audit) | (INSERT audit 자동) | Excel sheet135 r8 |
| 3 | CREATION_TIMESTAMP | NULL=Y | 생성일시 | ✓ (col 8 시작일자) | SELECT (Mapper.xml:17) / 그리드 col 8 | Excel sheet135 r9 |
| 4 | LAST_UPDATED_OBJECT_TYPE | NULL=Y | 최종변경TYPE | ✓ (audit) | (UPDATE audit 자동) | Excel sheet135 r10 |
| 5 | LAST_UPDATED_OBJECT_ID | NULL=Y | 최종변경USER | ✓ (col 9 최종수정자) | SELECT (Mapper.xml:18) / 그리드 col 9 | Excel sheet135 r11 |
| 6 | LAST_UPDATE_PROGRAM_ID | NULL=Y | 최종변경SERVICE | ✓ (audit) | (UPDATE audit 자동) | Excel sheet135 r12 |
| 7 | LAST_UPDATE_TIMESTAMP | NULL=Y | 최종변경일시 | ✓ (col 10 최종수정일) | SELECT (Mapper.xml:19) / 그리드 col 10 | Excel sheet135 r13 |
| 8 | DATA_END_STATUS | NULL=Y | 데이터종료STATUS | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet135 r14 |
| 9 | DATA_END_OBJECT_TYPE | NULL=Y | 데이터종료TYPE | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet135 r15 |
| 10 | DATA_END_OBJECT_ID | NULL=Y | 데이터종료USER | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet135 r16 |
| 11 | DATA_END_PROGRAM_ID | NULL=Y | 데이터종료SERVICE | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet135 r17 |
| 12 | DATA_END_TIMESTAMP | NULL=Y | 데이터종료일시 | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet135 r18 |
| 13 | ARCHIVE_COMPLETED_FLAG | NULL=Y | Archive완료FLAG | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet135 r19 |
| 14 | ARCHIVED_EMPLOYEE_NUM | NULL=Y | Archive완료USER | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet135 r20 |
| 15 | ARCHIVED_TIMESTAMP | NULL=Y | Archive완료일시 | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet135 r21 |
| 16 | ARCHIVE_PROGRAM_ID | NULL=Y | Archive완료SERVICE | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet135 r22 |
| 17 | RULE_VER | NULL=Y | 업무기준Version | ✓ (col 6 Version) | SELECT (Mapper.xml:12) / INSERT (java:63, '1' 고정) / 그리드 col 6 | Excel sheet135 r23 |
| 18 | RULE_ID | **NULL=N (PK)** | 업무기준ID | ✓ (col 2 / PK) | SELECT / WHERE / INSERT / UPDATE / 중복체크 SELECT (Mapper.xml:8, 23 / java:46, 57, 74) | Excel sheet135 r24 |
| 19 | OLD_RULE_ID | NULL=Y | 구업무기준ID | ✓ (WHERE 필터) | SELECT (Mapper.xml:9) / WHERE `RULE_ID != NVL(OLD_RULE_ID,...)` (Mapper.xml:21) | Excel sheet135 r25 |
| 20 | RULE_NM | **NULL=N** | 업무기준명 | ✓ (col 3 업무기준명) | SELECT / WHERE LIKE / INSERT / UPDATE (Mapper.xml:10, 26 / java:61, 70) | Excel sheet135 r26 |
| 21 | RULE_DESC | NULL=Y | 업무기준설명 | ✓ (col 4 설명) | SELECT / INSERT / UPDATE (Mapper.xml:11 / java:59, 71) | Excel sheet135 r27 |
| 22 | RULE_TP | NULL=Y | 업무기준구분 | ✓ (rowAdd='A' / INSERT) | SELECT / INSERT (Mapper.xml:13 / java:58) / xfdl:229 'A' | Excel sheet135 r28 |
| 23 | RULE_OWNER_DEPT_NM | NULL=Y | 담당부서명 | ✓ (SELECT 만) | SELECT (Mapper.xml:14) — 그리드/INSERT 미사용 | Excel sheet135 r29 |
| 24 | RULE_OWNER_EMP_NO | NULL=Y | 담당자사번 | ✓ (col 7 담당자) | SELECT / INSERT (Mapper.xml:15 / java:60) / rowAdd 시 로그인 사용자 사번(xfdl:232) | Excel sheet135 r30 |
| 25 | USE_TP | NULL=Y | 사용여부 | ✓ (col 5 사용여부) | SELECT / WHERE `NVL(USE_TP,'N')!='N'` / INSERT 'Y' / UPDATE (Mapper.xml:16, 28 / java:62, 72 / xfdl:230) | Excel sheet135 r31 |

PK 추정 결론: `RULE_ID` 단일 PK (Excel sheet135 r24 H26=N(NOT NULL) + UPDATE/select WHERE 절이 RULE_ID 단일 등치 — Mapper.xml(외부)/java:47, 75). masterCategoryMng 의 복합 PK 2 컬럼과 달리 **단일 PK**.

한글의미: Excel sheet135 의 한글항목명(A 컬럼) 이 수치 코드(0/2/6)로 misalign 되어 직접 추출 불가 → 위 한글의미는 As-Is xfdl 그리드 헤드(xfdl:54~64) + 컬럼명 직역 기반 보강. 정의서 원문 한글의미 미확정 → Q-010 등재.

### §9.2 audit 컬럼 To-Be 전환

| As-Is audit 그룹 | 컬럼 | To-Be 처리 |
|---|---|---|
| 그룹 1 (생성) | CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP | mcm-core `McmAuditEntity` C_* 4 컬럼 매핑 (CREATION_TIMESTAMP = 그리드 col 8 표시 보존) |
| 그룹 2 (최종변경) | LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP | mcm-core `McmAuditEntity` U_* 4 컬럼 매핑 (LAST_UPDATED_OBJECT_ID = col 9 / LAST_UPDATE_TIMESTAMP = col 10 표시 보존) |
| 그룹 3 (데이터종료) | DATA_END_STATUS / DATA_END_OBJECT_TYPE / DATA_END_OBJECT_ID / DATA_END_PROGRAM_ID / DATA_END_TIMESTAMP (5) | **To-Be 제거** (사용자 결정 — masterCategoryMng 선례 동일) |
| 그룹 4 (Archive) | ARCHIVE_COMPLETED_FLAG / ARCHIVED_EMPLOYEE_NUM / ARCHIVED_TIMESTAMP / ARCHIVE_PROGRAM_ID (4) | **To-Be 제거** (사용자 결정) |

비고: As-Is 17 audit 컬럼(그룹 1·2 8 + 그룹 3 5 + 그룹 4 4 = 17) → To-Be mcm-core `McmAuditEntity` 9 컬럼(C_* 4 + U_* 4 + VER 1). 단, As-Is 에 별도 `RULE_VER`(r23) 컬럼이 존재하므로 mcm-core VER(@Version) 과 의미 중복 가능 — As-Is RULE_VER 은 업무 버전(INSERT '1' 고정), mcm-core VER 은 낙관적 락 → 별개 컬럼 유지 (Q-011).

### §9.3 DMES Excel 매핑

- DMES MCA 테이블정의서(`DMES-SECTION-MCA_테이블정의서.xlsx`) sheet135 전수 추출 (Python xml 파싱). TB_MCA_RULE_MASTER 26 컬럼 §9.1 본문 직접 보강.
- 본 RULE_MASTER 테이블은 MCM(`DMES-SECTION-MCM`) 정의서에 **부재** — MCA 정의서에만 존재 (As-Is Mapper.xml schema = `MCA_SOURCE` 와 일치). To-Be 스키마 owner = `MCAAPUSER` (Excel sheet135 B2 정본).
- TB_MCA_RULE_MASTER 외 형제 테이블 TB_MCA_RULE_COL_LIST (Excel sheet134 r134 — MasterRuleFrameColListPopup 등 형제 화면용) 존재하나 본 화면 미사용 — 분석 범위 외.

---

## §10. 코드값 / LoV

- 본 화면 데이터셋 컬럼 STATUS (col 0 imagecontrol) 는 ColumnInfo 미선언 + SQL 미반환 → Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정).
- USE_TP (사용여부) 는 그리드 col 5 에 값 그대로 표시 (Y/N) — 별도 코드 마스터 LoV 호출(`gfn_codeList` 등) 없음. rowAdd 시 'Y' 고정(xfdl:230).
- RULE_TP (업무기준구분) rowAdd 시 'A' 고정(xfdl:229) — 코드 마스터 LoV 미연결.
- 자체 정의 코드값 / 정적 LoV / 콤보박스 ✗ (조회조건 2 Edit 모두 자유 텍스트).

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 문자열 결합 | `'%' \|\| #{x} \|\| '%'` | Mapper.xml:23, 26 | `'%' + #{x} + '%'` 또는 `CONCAT('%', #{x}, '%')` |
| NVL 함수 | `NVL(OLD_RULE_ID, 'ZZZZ0000')` / `NVL(USE_TP,'N')` | Mapper.xml:21, 28 | `ISNULL(OLD_RULE_ID, 'ZZZZ0000')` / `ISNULL(USE_TP,'N')` (MSSQL) 또는 `COALESCE(...)` |
| 대소문자 검색 | `UPPER(RULE_ID) LIKE UPPER('%' \|\| #{pRuleId} \|\| '%')` 양변 UPPER | Mapper.xml:22~27 | `UPPER(RULE_ID) LIKE UPPER('%' + #{pRuleId} + '%')` (MSSQL 기본 CI collation 이면 UPPER 생략 가능 — 정책 확인 Q-012) |
| 스키마명 | `MCA_SOURCE.TB_MCA_RULE_MASTER` (Oracle synonym) | Mapper.xml:20 | **To-Be `MCAAPUSER.TB_MCA_RULE_MASTER` 보존** (사용자 결정 — As-Is 테이블명 그대로, masterCategoryMng 선례 동일) |
| 감사 컬럼 | (As-Is audit 17 컬럼 — Mapper SQL 미명시, DB DDL/공통 Mapper 자동) | §9.1 r6~r22 | **To-Be**: mcm-core `McmAuditEntity` 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1) JPA `@PrePersist`/`@PreUpdate` 자동. audit 그룹 3·4 (DATA_END_*/ARCHIVE_*) 9 컬럼 제거 |
| 명시 PK 정의 | (DDL 본문 자산 외 — Excel r24 RULE_ID NOT NULL) | - | (MSSQL) `RULE_ID` 단일 PK 명시 |
| Java 호출 SQL namespace | `TB_MCA_RULE_MASTER_Mapper.{select,insert,update}` (공통 CRUD Mapper) | java:48, 65, 77 | **To-Be**: JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.RuleMasterRepository`. select(중복체크)=`existsById` / insert=`save` / update=`save` (dirty checking). As-Is Mapper.xml.asis 보존 |
| 목록 SQL namespace | `MasterRuleListMapper.GetRuleMasterList` | Mapper.xml:5 / bpmn:18 | **To-Be `masterRuleListMapper.GetRuleMasterList`** (oasis 호환 native query) 또는 JPQL |
| **RULE_ID != OLD_RULE_ID 필터** | `RULE_ID != NVL(OLD_RULE_ID, 'ZZZZ0000')` | Mapper.xml:21 | **To-Be 보존** (As-Is 이력행 제외 룰 — 사용자 결정 §12 / Q-009) |
| **USE_TP != 'N' 필터** | `NVL(USE_TP,'N') != 'N'` | Mapper.xml:28 | **To-Be 보존** (활성 업무기준만 표시 — 논리삭제 정책 보존) |
| **delete 경로 부재** | (As-Is 자체에 기존행 서버 삭제 ✗ — USE_TP 토글 논리삭제만) | java / bpmn 전수 | **To-Be 동일** (delete API 미생성 — As-Is 보존) |
| RULE_VER vs @Version | As-Is `RULE_VER` 업무 버전 (INSERT '1' 고정) | java:63 / xfdl:231 | As-Is RULE_VER 컬럼 보존 (업무 의미) + mcm-core `VER`(@Version) 낙관적 락 별도 컬럼 (Q-011) |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList.*` | - | **To-Be Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}.*`** (masterCategoryMng 선례) |
| **로그 메시지** | `"##########	SaveMasterRule 시작"` (오타/혼동 없음) | java:23 | (정정 불필요 — masterCategoryMng 과 달리 namespace 오타 없음) |
| onkeydown 미정의 핸들러 | `div_search_edt_ruleNm_onkeydown` 선언만, 함수 본문 부재 | xfdl:25 | **To-Be 미반영** (As-Is 미구현 — Q-008) |

---

## §12. 결정 누적 (사용자 결정 필요 / 완료)

> 활성 확인필요 = **0 건**. Q-008(미반영)·Q-010(직역 보존)·Q-012(UPPER 유지)는 **사용자 확정 2026-06-05** (영향도 낮음). Q-009(이력행 제외 보존)·Q-011(RULE_VER 별개 컬럼)·영속성(JPA)은 사용자 확정 2026-06-04. 본 표는 결정 후보 — 사용자 결정 시 본문 반영.

| 결정 영역 | 결정 후보/내용 | 사유 (5 enum) | 본문 반영 |
|---|---|---|---|
| **STATUS 컬럼 (그리드 col 0)** | Nexacro auto row state — **To-Be FE 프레임워크에서 동일 row state 표시 기능 구현** (masterCategoryMng 선례) | (2) 의도적 To-Be 정책 | §3.3 / §10 |
| **edt_* "USD" 초기값** | **제거 — 빈 문자열** (사용자 2026-06-05: 저장후 재조회 가림 혼란 → §12 "보존" 철회, masterCategoryMng 정합) | (2) 의도적 To-Be 정책 | §3.2 |
| **호출됨 팝업** | mcm 모듈 내 단독 화면 (MasterRuleListPop 은 별개 팝업 — 본 화면 호출 ✗) | (2) 의도적 To-Be 정책 | §5 |
| **delete 경로** | As-Is 기존행 서버 삭제 부재 (USE_TP 논리삭제만) → **To-Be delete API 미생성** | (2) 의도적 To-Be 정책 (As-Is 보존) | §6 / §7 / §11 |
| **RULE_ID != OLD_RULE_ID 필터** | As-Is 이력행 제외 룰 → **To-Be 보존** (Q-009) | (2) 의도적 To-Be 정책 | §6.1 / §11 |
| **USE_TP != 'N' 필터** | 활성 업무기준만 표시 → **To-Be 보존** | (2) 의도적 To-Be 정책 | §6.1 / §11 |
| **중복 PK 사전 체크** | As-Is inserted 분기 SELECT + UserException → **To-Be 보존** (existsById + 동일 메시지) | (2) 의도적 To-Be 정책 | §7 |
| **스키마/테이블명** | `MCA_SOURCE.` synonym → **`MCAAPUSER.TB_MCA_RULE_MASTER` 보존** (대문자 prefix) | (2) 의도적 To-Be 정책 | §11 |
| **키 변경 제약** | As-Is 정책 보존 (기존행 RULE_ID 편집 불가 — 신규행만 col 2~4 편집) | (2) 의도적 To-Be 정책 | §3.3 |
| **audit 컬럼** | As-Is audit 17 컬럼 → To-Be mcm-core `McmAuditEntity` 9 컬럼. DATA_END_*/ARCHIVE_* 9 제거 | (2) 의도적 To-Be 정책 | §9.2 / §11 |
| **RULE_VER vs @Version** | As-Is RULE_VER(업무 버전) 보존 + mcm-core VER(@Version) 별도 (Q-011) | (5) 기타 + Q-011 | §9.2 / §11 |
| **권한** | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | (3) 운영 권한 조직 합의 | 기능 §8 |
| **통신 채널** | OASIS REST (cactus 표준) | (2) 의도적 To-Be 정책 | BPMN §2 |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList.*` → Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}.*` | (2) 의도적 To-Be 정책 | §7 / §11 |
| **onkeydown 미정의 핸들러** | `div_search_edt_ruleNm_onkeydown` 선언만, 본문 부재 → To-Be 미반영 (Q-008) | (5) 기타 + Q-008 | §3.2 / §11 |
| **Excel 한글의미 misalign** | sheet135 한글항목명(A) 수치코드 misalign → 그리드 헤드 직역 보강 (Q-010) | (5) 기타 + Q-010 | §9.1 |

---

## §13. 확인필요 / Gap 목록 (Q-NNN — append-only)

### Q-NNN 사전 슬롯 (7 항목)

| ID | 사전 정의 항목 | 본 화면 발생 여부 |
|---|---|---|
| Q-001 | screenId (01 A.3 미등재) | 미발생 (사용자 지시 masterRuleList 확정) |
| Q-002 | moduleGroup (01 A.2 미등재) | 미발생 (cmb 01 A.2.1 등재 — 사용자 지시) |
| Q-003 | To-Be 테이블/Entity 미확보 | 미발생 (Excel sheet135 확보) |
| Q-004 | S-NNN 화면 표시명 폴백 5 미충족 | 미발생 (Static.text 폴백 1 충족) |
| Q-005 | G-NNN 화면 표시명 폴백 5 미충족 | 미발생 (그리드 head text 폴백 1 충족) |
| Q-006 | P-NNN To-Be 화면명 미확정 | 미발생 (호출 팝업 없음) |
| Q-007 | 이벤트 핸들러 미사용 (L3) | Q-008 로 등재 (onkeydown 미정의) |

### Q-NNN 등재 표 (Q-008+ append-only)

| ID | 항목 | 내용 (`{원천}이 {조건}일 때 {조치}` 패턴) | 영향도 | 설계 반영 방식 | 후속 조치 | 상태 |
|---|---|---|---|---|---|---|
| Q-008 | onkeydown 미정의 핸들러 | xfdl `div_search_edt_ruleNm_onkeydown` 이 선언(xfdl:25)만 있고 Script 본문 부재일 때 To-Be 미반영 | 낮음 | 디자인/기능서 비고 명시 | 운영 의도 확인 (Enter 검색 의도였는지) | **확정: To-Be 미반영 (2026-06-05)** |
| Q-009 | RULE_ID != OLD_RULE_ID 필터 | Mapper.xml:21 `RULE_ID != NVL(OLD_RULE_ID,'ZZZZ0000')` 이 이력행 제외 룰일 때 To-Be 보존 | 중간 | §6.1 / §11 보존 명시 | OLD_RULE_ID 채번/이력 정책 확인(개발 무관) | **확정 (As-Is 보존 — 사용자 2026-06-04)** |
| Q-010 | Excel 한글의미 misalign | DMES MCA 정의서 sheet135 한글항목명(A 컬럼)이 수치코드로 misalign 일 때 그리드 헤드 직역 보강 | 낮음 | §9.1 한글의미 보강 | 정의서 원문 한글의미 확인 | **확정: 그리드 헤드 직역 보존 (2026-06-05)** |
| Q-011 | RULE_VER vs @Version 중복 | As-Is RULE_VER(업무 버전, INSERT '1' 고정) 과 mcm-core VER(@Version 낙관락) 의미 중복일 때 별개 컬럼 유지 | 중간 | §9.2 별개 컬럼 명시 | 업무 버전 운영 의미 확인(개발 무관) | **확정 (별개 컬럼 유지 — 사용자 2026-06-04)** |
| Q-012 | MSSQL UPPER 양변 검색 | As-Is `UPPER(col) LIKE UPPER(...)` 양변 UPPER 를 MSSQL CI collation 환경에서 유지/생략할지 | 낮음 | §11 변환점 명시 | DB collation 정책 확인 | **확정: UPPER 양변 유지 (2026-06-05)** |

---

## §14. 누락 방지 커버리지 매트릭스

**(MUST)** 발견 수 = 설계 반영 수 + 확인필요 수 + 제외 수.

| 원천 항목 | 발견 수 | 설계 반영 수 | 확인필요 수 | 제외 수 | 누락 여부 |
|---|---:|---:|---:|---:|---|
| 조회조건 (S) | 4 (stc 2 + edt 2) | 4 | 0 | 0 | 없음 |
| 메인 그리드 (G) | 1 그리드 / 11 cols | 11 cols | 0 | 0 | 없음 |
| 확장 그리드 (GE/G2) | 0 | 0 | 0 | 0 | 없음 (해당 없음) |
| 상세 필드 (D) | 0 | 0 | 0 | 0 | 없음 (해당 없음) |
| 라인 필드 (L) | 0 | 0 | 0 | 0 | 없음 (해당 없음) |
| 버튼 (B) | 6 (상단 2 + 우측 3 + fold 1) | 6 | 0 | 0 | 없음 |
| 그리드셀 (GB) | 1 (헤드 정렬) | 1 | 0 | 0 | 없음 |
| 팝업 (P) | 0 | 0 | 0 | 0 | 없음 (해당 없음) |
| 상태값 (ST) | 7 (insert/update/clean/search done/save done/error + STATUS auto) | 7 | 0 | 0 | 없음 (기능 §7) |
| 코드값/LoV (LV) | 0 | 0 | 0 | 0 | 없음 (해당 없음) |
| Dataset 컬럼 | 12 (ds_grdMain) | 12 | 0 | 0 | 없음 |
| Mapper SQL | 1 (GetRuleMasterList) + 3 (java 외부 select/insert/update) | 4 | 0 | 0 | 없음 |
| Java 메서드 | 1 (run) | 1 | 0 | 0 | 없음 |
| BPMN 노드 | 5 | 5 | 0 | 0 | 없음 |
| BPMN SequenceFlow | 5 | 5 | 0 | 0 | 없음 |
| Script 함수 | 11 (onload/formAfterOnload/button/search/save/callBack/fold_onclick/excelDown/rowAdd/rowDelete/onheadclick/checkSave) | 12 (실제) | 0 | 0 | 없음 |

비고: Script 함수 전수 = 12 (MasterRuleList_onload, fn_formAfterOnload, fn_button, fn_search, fn_save, fn_callBack, btn_fold_onclick, fn_excelDown, fn_rowAdd, fn_rowDelete, div_main_grd_Main_onheadclick, fn_checkSave — xfdl:122~292). 선언만 있고 미정의된 `div_search_edt_ruleNm_onkeydown`(xfdl:25) 은 Script 본문 부재 → Q-008.

---

## §15. 분석완료 게이트 결과

| 게이트 | 결과 (○/×/△) | 근거 | 후속 조치 |
|---|---|---|---|
| G1. 자료 인벤토리 (§2 자산 4 + Excel 1 확보) | ○ | §2 | - |
| G2. 화면 요소 전수성 (§4.1 항목 채움) | ○ | §3 / §4 | - |
| G3. 소스 로직 연결성 (xfdl Script 12 함수 + Java run + Mapper SQL + bpmn flow 전수) | ○ | §6 / §7 / §8 | - |
| G4. DB 매핑성 (§6 / §9 / §11 일치) | ○ | §9 / §11 | - |
| G5. 업무 규칙 반영성 (§10 / §12 → 기능 §6 BR) | ○ | §12 | - |
| G6. API 패턴 판정 (search/save 2 action OASIS) | ○ | §8 / BPMN §2 | - |
| G7. 커버리지 (§14 합 일치) | ○ | §14 | - |
| G8. 자유도 0 (모든 본문 file:line cite) | ○ | 본 문서 전수 | - |
| G9. 활성 확인필요 (0 건) | ○ | §13 | Q-008/010/012 사용자 확정 2026-06-05 / Q-009·Q-011·영속성 확정 2026-06-04 |
| G10. Runner 미적용 명시 | ○ | §0, 정합체크서 §D.4 | - |

> G9 = △ (Q-008/Q-010/Q-012 3 건 open, 모두 영향도 낮음 — 미정의 핸들러/한글의미 misalign/collation). Q-009·Q-011·영속성(JPA) 사용자 확정 2026-06-04. 본문에 보존/미반영 방침 명시 — 설계 4종 작성 차단 사유 아님 (00 §0.1.4 "확인필요 Q-NNN 존재 = 완료 가능하나 미확정 항목으로 별도 보고").

## §16. As-Is Procedure 분석 (§17 등가)

- **해당 없음 (mui 등가: Mapper SQL / Java Wow 트랜잭션)**. As-Is 는 WinForms + MSSQL SP 가 아닌 mui (nexacro xfdl + oasis Java Wow + MyBatis Mapper.xml) 환경.
- SP @Case 분기 매트릭스 미해당 → mui 등가물(Mapper.xml SQL 1 + Java 외부 호출 SQL 3) 은 §6 에 전수, Java 트랜잭션 부수효과는 §7 에 전수 분해.
- 부수효과 = INSERT 7 컬럼(java:57~63) / UPDATE 3 컬럼(java:70~72) / 중복체크 SELECT 1(java:48) — §7.2 단계 5.1~5.3 전수.
