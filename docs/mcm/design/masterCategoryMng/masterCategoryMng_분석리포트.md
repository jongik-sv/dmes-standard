---
screenId: masterCategoryMng
asIsId: MasterCategoryMng
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# 카테고리 관리 (masterCategoryMng) 분석리포트

> 본 문서 = 5종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — 입력 자산은 mui (xfdl/Java/Mapper.xml/bpmn) 4종 + DMES Excel 1종).
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow) 로 매핑.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / java 메서드 전수 / Mapper.xml SQL 전수 / bpmn flow 전수).
- As-Is DB = Oracle (MERGE INTO ~ USING DUAL / `||` 문자열 연결 / schema `MCM_SOURCE` 명시). To-Be DB = MSSQL. §11 변환점 명시.

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterCategoryMng | MasterCategoryMng.xfdl:3 (`<Form id="MasterCategoryMng" ...>`) |
| 화면 ID (To-Be) | masterCategoryMng | 사용자 결정 (모듈 mcm + As-Is 화면명) |
| 화면명 | 카테고리 관리 | MasterCategoryMng.xfdl:3 (`titletext="카테고리 관리"`) / MasterCategoryMng.bpmn:3 (`name="카테고리 관리"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 사용자 결정 (DMES-SECTION-MCM 정의서 대응) |
| 모듈 그룹 | cma — 한글명 **"Master 관리(원장)"** | 자산 경로: `mui/src/nxuiMui/cma/` / `mappers-cma/` / `services/cma/` (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > Master 관리(원장) (cma) > 카테고리 관리 (masterCategoryMng) | - |
| 화면 크기 | 1280 × 670 | MasterCategoryMng.xfdl:3 (`width="1280" height="670"`) |
| onload 핸들러 | MasterCategoryMng_onload | MasterCategoryMng.xfdl:3 / xfdl:119 |
| 최초 생성 | 2019.11.19 최민수 | MasterCategoryMng.xfdl:109 |
| 수정 | 2020.05.08 최규찬 | MasterCategoryMng.xfdl:110 |
| 화면 성격 | 카테고리 CRUD 단일 그리드 화면 (행 추가/복사/삭제/저장) | xfdl 138~141 (rowAdd/rowCopy/rowDelete/rowCancel/excelDown 5 우측 메뉴) |
| 주 사용 테이블 | MCM_SOURCE.TB_MCM_CODE_CATEGORY | MasterCategoryMngMapper.xml:13, 34, 40, 49, 55, 72 |
| 참조 테이블 (JOIN 전용) | MCM_SOURCE.TB_MCM_CODE_MASTER | MasterCategoryMngMapper.xml:14, 35 |
| 트랜잭션 클래스 | com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng.SaveTbMcmCodeCategory | SaveTbMcmCodeCategory.java:1, MasterCategoryMng.bpmn:44 |
| BPMN 프로세스 ID | MasterCategoryMng | MasterCategoryMng.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterCategoryMng.bpmn:3 |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cma/MasterCategoryMng.xfdl | 361 | nexacro Form + Script |
| 2 | Java (UserTask) | docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/cma/MasterCategoryMng/SaveTbMcmCodeCategory.java | 72 | implements Wow — save 트랜잭션 |
| 3 | Mapper.xml | docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-cma/MasterCategoryMngMapper.xml | 103 | namespace=MasterCategoryMngMapper, 5 SQL |
| 4 | BPMN | docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/cma/MasterCategoryMng.bpmn | 172 | Camunda Modeler 3.1.2 |
| 5 | DMES 테이블 정의서 | docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx | (xlsx) | TB_MCM_CODE_CATEGORY 카탈로그 (§9 매핑) |

추가 외부 참조(fragment 정의 화면 자산에 미포함, 인용으로만 사용):
- ref_Audit.update / ref_Audit.insert_item / ref_Audit.insert_value (MasterCategoryMngMapper.xml:43, 60, 67, 84, 92, 100 에서 `<include refid>` 로 호출). 정의 본문은 mui 화면 자산 외부.

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:54 |
| A-002 | 조회조건 | div_search | top=50, left=20, right=20, height=43 | xfdl:68 |
| A-003 | 접기 토글 | btn_fold | top=93, left=20, right=20, height=15 | xfdl:6 |
| A-004 | 메인 (그리드 + 우측 메뉴) | div_main | top=btn_fold:5, left=20, right=20, bottom=35 | xfdl:7 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:67 |

### §3.2 조회조건 (S-NNN) — div_search

| S-NNN | xfdl id | 종류 | 라벨 | 초기 value / text | 폭 | maxlength | inputmode | imemode | 파라미터 | 근거 |
|---|---|---|---|---|---:|---:|---|---|---|---|
| S-001 | stc_codeVal | Static (라벨) | 코드ID | "코드ID" | 50 | - | - | - | (라벨) | xfdl:71 |
| S-002 | edt_codeVal | Edit | (코드ID 입력) | text="USD" | 135 | 0 | upper | alpha | pCodeId | xfdl:72 |
| S-003 | stc_codeValMean | Static (라벨) | 코드명 | "코드명" | 50 | - | - | - | (라벨) | xfdl:73 |
| S-004 | edt_codeNm | Edit | (코드명 입력) | text="USD" | 135 | 0 | normal | hangul | pCodeNm | xfdl:74 |
| S-005 | stc_categoryId | Static (라벨) | 카테고리ID | "카테고리ID" | 75 | - | - | - | (라벨) | xfdl:75 |
| S-006 | edt_categoryId | Edit | (카테고리ID 입력) | text="USD" | 135 | 0 | upper | alpha | pCategoryId | xfdl:76 |
| S-007 | stc_categoryNm | Static (라벨) | 카테고리명 | "카테고리명" | 75 | - | - | - | (라벨) | xfdl:77 |
| S-008 | edt_categoryNm | Edit | (카테고리명 입력) | text="USD" | 135 | 0 | normal | hangul | pCategoryNm | xfdl:78 |

비고:
- 4 Edit 컴포넌트 모두 `text="USD"` 초기값 보존 (xfdl:72/74/76/78 — 원본 그대로). **To-Be 동일 보존** (사용자 결정 — 운영 의도).
- `maxlength="0"` 는 nexacro 표기상 무제한.
- inputmode `upper` = 입력 시 대문자 변환, `normal` = 변환 없음. imemode `alpha` = 영문, `hangul` = 한글.

### §3.3 결과 그리드 G-001 — div_main.grd_main (binddataset=ds_grdMain)

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grd_main | xfdl:10 |
| binddataset | ds_grdMain | xfdl:10 |
| autofittype | col | xfdl:10 |
| selecttype | multiarea | xfdl:10 |
| cellmovingtype / cellsizingtype | col / col | xfdl:10 |
| onheadclick | div_main_grd_main_onheadclick | xfdl:10 / xfdl:262 |
| 행 높이 | 26 (head/body 공통) | xfdl:24~25 |

#### Grid columns 전수 (8 cols)

| col | head text | bind | displaytype | edittype | editmaxlength | editinputmode | editimemode | cssclass (조건부) | 근거 |
|---:|---|---|---|---|---:|---|---|---|---|
| 0 | 선택 | CHK | checkboxcontrol | checkbox | - | - | - | CHK==1 → cellBody_BgColor_red | xfdl:28, 38 |
| 1 | NO | expr:currow+1 | normal | none | - | - | - | CHK==1 → cellBody_BgColor_red | xfdl:29, 39 |
| 2 | 상태 | STATUS | imagecontrol | none | - | - | - | CHK==1 → cellBody_BgColor_red | xfdl:30, 40 |
| 3 | 코드명 | CODE_NM | normal (read) | none | - | - | - | CHK==1 → cellBody_BgColor_red | xfdl:31, 41 |
| 4 | 코드 ID | MASTER_CODE | expr (신규행 editcontrol / else normal) | expr (신규행 text / else none) | - | upper | - | CHK==1 → cellBody_BgColor_red | xfdl:32, 42 |
| 5 | 카테고리 ID | CATEGORY_ID | expr (신규행 editcontrol / else normal) | expr (신규행 text / else none) | 50 | upper | alpha | CHK==1 → cellBody_BgColor_red | xfdl:33, 43 |
| 6 | 카테고리 명 | CATEGORY_NM | editcontrol | normal | 180 | - | hangul | CHK==1 → cellBody_BgColor_red | xfdl:34, 44 |
| 7 | 정렬 | SORT_SEQ | editcontrol | mask | 180 | - | - | CHK==1 → cellBody_BgColor_red | xfdl:35, 45 |

비고:
- col 4 (코드 ID) / col 5 (카테고리 ID) = 신규행(RowType==2)일 때만 편집 가능. 기존행은 read-only (PK 변경 불가 의도).
- col 6 (카테고리 명) / col 7 (정렬) = 기존행 + 신규행 모두 편집 가능.
- col 1 (NO) text = `expr:currow+1` (1 부터 시작 일련번호).
- col 2 (상태) = `displaytype="imagecontrol"` — STATUS 값(이미지 파일명/path) 으로 상태 아이콘 표시. STATUS 컬럼은 ds_grdMain ColumnInfo (xfdl:86~93) 에 미선언 — Nexacro auto row state 동작. **To-Be FE 프레임워크에서 동일 row state 표시 구현** (사용자 결정).
- 모든 셀에 `CHK==1 → cellBody_BgColor_red` cssclass binding = 선택된 행을 빨간 배경으로 표시 (xfdl:38~45).

#### Dataset 컬럼 전수 (ds_grdMain — xfdl:85~94)

| 컬럼 ID | type | size | 그리드 col 매핑 | 근거 |
|---|---|---:|---|---|
| MASTER_CODE | STRING | 256 | col 4 코드 ID | xfdl:87 |
| CATEGORY_ID | STRING | 256 | col 5 카테고리 ID | xfdl:88 |
| CATEGORY_NM | STRING | 256 | col 6 카테고리 명 | xfdl:89 |
| SORT_SEQ | STRING | 256 | col 7 정렬 | xfdl:90 |
| CODE_NM | STRING | 256 | col 3 코드명 | xfdl:91 |
| CHK | STRING | 256 | col 0 선택 | xfdl:92 |

#### Dataset 컬럼 전수 (ds_grdMainAll — xfdl:95~100)

| 컬럼 ID | type | size | 용도 | 근거 |
|---|---|---:|---|---|
| MASTER_CODE | STRING | 256 | 전체 마스터 키 중복체크 (xfdl:201) | xfdl:97 |
| CATEGORY_ID | STRING | 256 | 전체 마스터 키 중복체크 (xfdl:201) | xfdl:98 |

### §3.4 편집 그리드 — 해당 없음

- grd_main 단일 그리드가 결과 + 편집 겸용. 별도 GE-NNN 없음.

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 우측 메뉴 div | div_main.div_rightMenu (top=0, height=20, right=0, width=400) | _com_div::commonRightButton.xfdl | xfdl:50 |
| C-002 | 상단 메뉴 div | div_title.div_topMenu (width=330, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:58 |
| C-003 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:67 |
| C-004 | 제목 Edit (readonly) | div_title.edt_title (width=110, height=30) | (없음) | xfdl:57 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:131~142)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | 조회 | fn_search (xfdl:145) | search | xfdl:135, 145~158 |
| B-002 | btn_save | 저장 | fn_save (xfdl:161) | save | xfdl:135, 161~220 |

### §4.2 우측 메뉴 (commonRight — fn_button xfdl:137~141)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-003 | btn_rowAdd | 행추가 | fn_rowAdd (xfdl:286) | (client-side) rowAdd | xfdl:139, 286~293 |
| B-004 | btn_rowCopy | 행복사 | fn_rowCopy (xfdl:296) | (client-side) rowCopy | xfdl:139, 296~305 |
| B-005 | btn_rowDelete | 행삭제 | fn_rowDelete (xfdl:308) | (client-side) rowDelete | xfdl:139, 308~354 |
| B-006 | btn_rowCancel | 행취소 | fn_rowCancel (xfdl:357) | (client-side) rowCancel | xfdl:139, 357~359 |
| B-007 | btn_excelDown | 엑셀다운 | fn_excelDown (xfdl:280) | (client-side) excelDown | xfdl:139, 280~283 |

### §4.3 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-008 | btn_fold | 조회조건 접기/펴기 | btn_fold_onclick (xfdl:256) | (client-side) fold | xfdl:6, 256~259 |

### §4.4 그리드 헤더 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| GB-001 | grd_main 헤드(CHK 컬럼) | div_main_grd_main_onheadclick (xfdl:262) | 전체선택/해제 토글 (mainChk 변수 0↔1) | xfdl:10, 262~277 |
| GB-002 | grd_main 헤드(기타 컬럼) | div_main_grd_main_onheadclick → gfn_commonOnheadclick(obj, e) | 그리드 정렬 (공통 함수 위임) | xfdl:274 |

### §4.5 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | "" | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | xfdl:147~157 / bpmn:37 |
| B-002 btn_save | save | Y | SequenceFlow_0x77sm3 | ds_grdMain=ds_grdMain:U | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | xfdl:208~219 / bpmn:39 |
| (주석처리) | delete | N (주석) | SequenceFlow_0w4k9x6 (bpmn 잔존) | "" | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | xfdl:336~349 (블록 주석 /* ... */ — xfdl:327~353), bpmn:65 |
| B-003~B-007 | rowAdd/rowCopy/rowDelete/rowCancel/excelDown | N (client-side만) | (해당 없음) | - | - | xfdl:286~359 |
| B-008 btn_fold | fold | N (UI 토글만) | (해당 없음) | - | - | xfdl:256~259 |

비고:
- `delete` 서비스 호출 코드는 xfdl:327~353 블록 주석 처리되어 있음 — 운영 흐름 ✗. As-Is BPMN flow (SequenceFlow_0w4k9x6 → Task_0k24d4u "Main삭제") 잔존 (bpmn:51~66) → **To-Be 제거** (사용자 결정 — 마스터 삭제 영구 차단 정책 유지).
- xfdl:218 `gfn_checkTransaction("ds_grdMain", "CHK")` = CHK==1 인 행만 저장 대상으로 marking 후 sInDatasets `ds_grdMain:U`(update) 로 송신.

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

- mui xfdl 본문에 `goPopup` / `setUserPopup` / `nexacro.createDialog` 등 팝업 직접 호출 ✗.
- 행 추가 시 `setCellPos` 로 그리드 셀 포커스 이동만 수행 (xfdl:291).
- → **본 화면에서 호출하는 팝업 없음**.

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 카테고리 마스터 자체. mcm 모듈 단독 화면 — 다른 화면에서 본 화면을 in-coming 호출하지 않음 (사용자 결정).

---

## §6. SQL ID 매트릭스 (Mapper.xml 모든 SQL — 전수 5개)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 결합 (JOIN) | 동적 WHERE (mybatis if) | 정렬 (ORDER BY) | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetCodeCategoryList | select | java.util.Map | java.util.Map | MCM_SOURCE.TB_MCM_CODE_CATEGORY TMCCTEGORY, MCM_SOURCE.TB_MCM_CODE_MASTER CMASTER | TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID | pCodeId / pCodeNm / pCategoryId / pCategoryNm (4 if) | MASTER_CODE | `\|\|` 문자열 결합 (LIKE '%' \|\| #{x} \|\| '%') × 4 | Mapper.xml:7~29 |
| 2 | GetCodeCategoryAllList | select | java.util.Map | java.util.Map | MCM_SOURCE.TB_MCM_CODE_CATEGORY TMCCTEGORY, MCM_SOURCE.TB_MCM_CODE_MASTER CMASTER | TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID | (없음) | (없음) | (없음) | Mapper.xml:31~37 |
| 3 | UpdateTbMcmCodeCategory | update | java.util.Map | - | MCM_SOURCE.TB_MCM_CODE_CATEGORY | (없음) | (없음 — WHERE 등치 PK 2 컬럼) | - | `<include refid="ref_Audit.update">` (xml 외부 fragment) | Mapper.xml:39~46 |
| 4 | DeleteTbMcmCodeCategory | delete | java.util.Map | - | MCM_SOURCE.TB_MCM_CODE_CATEGORY | (없음) | (없음 — WHERE 등치 PK 2 컬럼) | - | (없음) | Mapper.xml:48~52 |
| 5 | InsertTbMcmCodeCategory | insert | java.util.Map | - | MCM_SOURCE.TB_MCM_CODE_CATEGORY | (없음) | (없음) | - | `<include refid="ref_Audit.insert_item/insert_value">` (xml 외부 fragment) | Mapper.xml:54~69 |
| 6 | MergeTbCodeCategory | update | java.util.HashMap | - | MCM_SOURCE.TB_MCM_CODE_CATEGORY CCATEGORY | USING (...) FROM DUAL | (없음) | - | `MERGE INTO ~ USING (... FROM DUAL) ON (...) WHEN MATCHED THEN UPDATE SET ... WHEN NOT MATCHED THEN INSERT ...` (Oracle MERGE 구문) + `<include refid="ref_Audit.update/insert_item/insert_value">` | Mapper.xml:71~103 |

비고:
- MergeTbCodeCategory (#6) 는 Mapper.xml 에 정의되어 있으나 **Java(SaveTbMcmCodeCategory) 및 BPMN 어디에서도 호출되지 않음** — orphan SQL → **To-Be 제거** (사용자 결정).
- SQL #1, #2 = SELECT 2 → bpmn Task_2(Main조회), Task_0lk57sx(Main 전체조회) 에 1:1 매핑.
- SQL #3 (UPDATE), #4 (DELETE), #5 (INSERT) = SaveTbMcmCodeCategory.java 에서 nativeeditor_status 분기로 3종 호출 (java:38, 46, 56).
- 모든 INSERT/UPDATE = ref_Audit fragment 로 감사 컬럼 자동 주입 (생성자/일시 + 수정자/일시 등 — fragment 정의는 본 자산 외부).

### §6.1 SQL 별 컬럼 / 파라미터 상세

#### #1 GetCodeCategoryList (Mapper.xml:7~29)

SELECT 컬럼 5종:
| 별칭 | 원본 | 매핑 컬럼 (Dataset) | 근거 |
|---|---|---|---|
| CMASTER.MASTER_CODE | TB_MCM_CODE_MASTER.MASTER_CODE | ds_grdMain.MASTER_CODE (col 4 코드 ID) | Mapper.xml:8 |
| CMASTER.CODE_NM | TB_MCM_CODE_MASTER.CODE_NM | ds_grdMain.CODE_NM (col 3 코드명) | Mapper.xml:9 |
| TMCCTEGORY.CATEGORY_ID | TB_MCM_CODE_CATEGORY.CATEGORY_ID | ds_grdMain.CATEGORY_ID (col 5 카테고리 ID) | Mapper.xml:10 |
| TMCCTEGORY.CATEGORY_NM | TB_MCM_CODE_CATEGORY.CATEGORY_NM | ds_grdMain.CATEGORY_NM (col 6 카테고리 명) | Mapper.xml:11 |
| TMCCTEGORY.SORT_SEQ | TB_MCM_CODE_CATEGORY.SORT_SEQ | ds_grdMain.SORT_SEQ (col 7 정렬) | Mapper.xml:12 |

비고: 그리드 col 2 `STATUS` 는 SELECT 미반환 → ColumnInfo 미선언 + SQL 미반환 두 정황 일치 (Nexacro auto row state — To-Be FE 동일 구현).

WHERE 동적 조건 (mybatis if):
| 파라미터 | 비교 대상 컬럼 | 비교 방식 | 근거 |
|---|---|---|---|
| pCodeId | CMASTER.MASTER_CODE | LIKE '%' \|\| #{pCodeId} \|\| '%' | Mapper.xml:16~18 |
| pCodeNm | CMASTER.CODE_NM | LIKE '%' \|\| #{pCodeNm} \|\| '%' | Mapper.xml:19~21 |
| pCategoryId | TMCCTEGORY.CATEGORY_ID | LIKE '%' \|\| #{pCategoryId} \|\| '%' | Mapper.xml:22~24 |
| pCategoryNm | TMCCTEGORY.CATEGORY_NM | LIKE '%' \|\| #{pCategoryNm} \|\| '%' | Mapper.xml:25~27 |

ORDER BY: MASTER_CODE (Mapper.xml:28).

#### #2 GetCodeCategoryAllList (Mapper.xml:31~37)

SELECT: CMASTER.MASTER_CODE, TMCCTEGORY.CATEGORY_ID (2 컬럼). JOIN: TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID. WHERE 동적 ✗ / ORDER BY ✗.
용도: 클라이언트 사이드에서 전체 마스터 (코드ID+카테고리ID) 키 중복 체크 (xfdl:199~206).

#### #3 UpdateTbMcmCodeCategory (Mapper.xml:39~46)

| 항목 | 값 |
|---|---|
| SET | CATEGORY_NM = #{CATEGORY_NM}, SORT_SEQ = #{SORT_SEQ} + ref_Audit.update |
| WHERE | CATEGORY_ID = #{CATEGORY_ID} AND MASTER_CODE = #{MASTER_CODE} |

#### #4 DeleteTbMcmCodeCategory (Mapper.xml:48~52)

| 항목 | 값 |
|---|---|
| WHERE | CATEGORY_ID = #{CATEGORY_ID} AND MASTER_CODE = #{MASTER_CODE} |

#### #5 InsertTbMcmCodeCategory (Mapper.xml:54~69)

| 컬럼 | 값 |
|---|---|
| MASTER_CODE | #{MASTER_CODE} |
| CATEGORY_ID | #{CATEGORY_ID} |
| CATEGORY_NM | #{CATEGORY_NM} |
| SORT_SEQ | #{SORT_SEQ} |
| (ref_Audit.insert_item / insert_value) | (외부 fragment) |

#### #6 MergeTbCodeCategory (Mapper.xml:71~103) — orphan

- ON: CCATEGORY.MASTER_CODE = DATA.MASTER_CODE AND CCATEGORY.CATEGORY_ID = DATA.CATEGORY_ID
- WHEN MATCHED → UPDATE SET CATEGORY_NM, SORT_SEQ + ref_Audit.update
- WHEN NOT MATCHED → INSERT (MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ) VALUES (...) + ref_Audit.insert_item/value
- 호출 위치 미발견 (java + bpmn 모두 ✗).

---

## §7. Java 트랜잭션 (SaveTbMcmCodeCategory)

### §7.1 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 패키지 | com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng | SaveTbMcmCodeCategory.java:1 |
| **To-Be 패키지** | `com.dongkuk.dmes.mcm.cma.masterCategoryMng.service` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | - |
| 클래스 | SaveTbMcmCodeCategory | java:17 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:12, 17 |
| 어노테이션 | @Slf4j (lombok) | java:14, 16 |
| 진입점 메서드 | public String run(Context context, Task task) | java:18~19 |
| BPMN 매핑 UserTask | UserTask_154khzh ("Main저장") class=#{basePackage}SaveTbMcmCodeCategory | bpmn:40~49 |

### §7.2 메서드 전수

#### run(Context context, Task task) — 단일 메서드 (java:19~72)

| 단계 | 동작 | 호출 SQL ID | 입력 파라미터 | 결과 처리 | 근거 |
|---:|---|---|---|---|---|
| 1 | `log.debug("##########	Master Code 관리 Main 저장 시작")` | - | - | log | java:21 |
| 2 | `TransactionalDao dao = context.getDao()` | - | - | - | java:24 |
| 3 | `ArrayList<HashMap<String,Object>> ds_grdMain = (ArrayList...) context.get("ds_grdMain")` | - | - | - | java:25~26 |
| 4 | `int cnt = 0;` | - | - | - | java:28 |
| 5 | `for(int i=0; i<ds_grdMain.size(); i++)` 루프 시작 | - | - | - | java:30 |
| 5.1 | "updated" 분기: param.put(MASTER_CODE / CATEGORY_ID / CATEGORY_NM / SORT_SEQ) → `dao.update("MasterCategoryMngMapper.UpdateTbMcmCodeCategory", param)` ≤ 0 시 throw new Exception("MasterCodeMapper.UpdateTbMcmCodeCategory 에러발생"), else `cnt++` | UpdateTbMcmCodeCategory | MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ | 영향행 ≤ 0 시 예외 | java:33~42 |
| 5.2 | "deleted" 분기: param.put(MASTER_CODE / CATEGORY_ID) → `dao.update("MasterCategoryMngMapper.DeleteTbMcmCodeCategory", param)` ≤ 0 시 throw new Exception("MasterCodeMapper.DeleteTbMcmCodeCategory 에러발생"), else `cnt++` | DeleteTbMcmCodeCategory | MASTER_CODE, CATEGORY_ID | 영향행 ≤ 0 시 예외 | java:43~50 |
| 5.3 | "inserted" 분기: param.put(MASTER_CODE / CATEGORY_ID / CATEGORY_NM / SORT_SEQ) → `dao.update("MasterCategoryMngMapper.InsertTbMcmCodeCategory", param)` ≤ 0 시 throw new Exception("MasterCodeMapper.InsertTbMcmCodeCategory 에러발생"), else `cnt++` | InsertTbMcmCodeCategory | MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ | 영향행 ≤ 0 시 예외 | java:51~60 |
| 6 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_merge", cnt, null, true);` | - | - | context 에 cnt_merge 적재 | java:64 |
| 7 | `return null;` | - | - | - | java:66 |
| 8 | `catch (Exception e)` → log.info / log.error / `throw new IllegalTaskException(e)` | - | - | 예외 전파 | java:67~71 |

### §7.3 트랜잭션 경계

- BPMN UserTask "Main저장"(UserTask_154khzh, bpmn:40~49) 은 oasis 프레임워크에서 단일 트랜잭션으로 실행 (catch 시 IllegalTaskException 던지면 전체 롤백).
- nativeeditor_status 3종 (updated/deleted/inserted) 을 한 트랜잭션 내 순차 처리.
- ds_grdMain 행 단위 처리 — 한 행 영향행수 ≤ 0 이면 즉시 throw → rollback.
- 성공 시 `cnt_merge` (context key) 가 누적 (xfdl:239 콜백에서 표시).

비고:
- 예외 메시지 텍스트가 모두 "MasterCodeMapper.*" 로 시작 (java:39, 47, 57) — namespace 는 "MasterCategoryMngMapper" 이므로 메시지 오타. **To-Be `"MasterCategoryMngMapper.*"` 정정** (사용자 결정).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterCategoryMng | bpmn:3 |
| name | 카테고리 관리 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_0wrkusx | - | bpmn:7~9 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu, SequenceFlow_0x77sm3, SequenceFlow_0w4k9x6 | bpmn:27~35 |
| Task_2 | task | Main조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetCodeCategoryList, resultKey=ds_GetCodeCategoryList, isServiceResult=true | SequenceFlow_0grwghu, SequenceFlow_0xzcgxb, SequenceFlow_10mn97r | SequenceFlow_0lnje1n | bpmn:10~26 |
| UserTask_154khzh | userTask | Main저장 | com.dongkuk.dmes.UserTask / class=#{basePackage}SaveTbMcmCodeCategory | nextBranchSpel="" | SequenceFlow_0x77sm3 | SequenceFlow_0xzcgxb | bpmn:40~49 |
| Task_0k24d4u | task | Main삭제 | MapperBaseDbAccessTemplate / class=CommonDeleteTask | sqlKey=#{serviceId}Mapper.DeleteTbMcmCodeCategory, resultKey=deleteMain, isServiceResult=true, paramKey="" | SequenceFlow_0w4k9x6 | SequenceFlow_10mn97r | bpmn:51~64 |
| Task_0lk57sx | task | Main 전체조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetCodeCategoryAllList, resultKey=ds_GetCodeCategoryAllList, isServiceResult=true | SequenceFlow_0lnje1n | SequenceFlow_0wrkusx | bpmn:67~80 |

### §8.3 SequenceFlow 전수 (8 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:36 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 (Main조회) | action=search | bpmn:37 |
| SequenceFlow_0x77sm3 | save | ExclusiveGateway_1 | UserTask_154khzh (Main저장) | action=save | bpmn:39 |
| SequenceFlow_0w4k9x6 | delete | ExclusiveGateway_1 | Task_0k24d4u (Main삭제) | action=delete (xfdl 미사용 — 주석) | bpmn:65 |
| SequenceFlow_0xzcgxb | - | UserTask_154khzh | Task_2 | (저장 후 재조회) | bpmn:50 |
| SequenceFlow_10mn97r | - | Task_0k24d4u | Task_2 | (삭제 후 재조회) | bpmn:66 |
| SequenceFlow_0lnje1n | - | Task_2 | Task_0lk57sx | (조회 후 전체조회) | bpmn:38 |
| SequenceFlow_0wrkusx | - | Task_0lk57sx | EndEvent_1 | - | bpmn:81 |

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → Task_2(Main조회) → Task_0lk57sx(Main 전체조회) → End | GetCodeCategoryList → GetCodeCategoryAllList |
| save | Start → Gateway → UserTask_154khzh(Main저장) → Task_2(Main조회) → Task_0lk57sx(Main 전체조회) → End | SaveTbMcmCodeCategory.run() → GetCodeCategoryList → GetCodeCategoryAllList |
| delete (잔존) | Start → Gateway → Task_0k24d4u(Main삭제) → Task_2(Main조회) → Task_0lk57sx(Main 전체조회) → End | DeleteTbMcmCodeCategory → GetCodeCategoryList → GetCodeCategoryAllList |

비고:
- 모든 action 종료 시 조회 + 전체조회로 결과/중복체크 데이터셋 갱신.
- delete flow 는 xfdl 에서 호출 ✗ — bpmn 만 잔존.
- BPMN 의 sqlKey 패턴 = `#{serviceId}Mapper.{sqlId}` — serviceId 변수는 oasis 런타임에서 주입 (As-Is 운영 환경 serviceId 값 = "MasterCategoryMng" → "MasterCategoryMngMapper.{sqlId}"; To-Be serviceId = "masterCategoryMng").

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 583 | 104 | 36 | 36 | bpmn:86 |
| ExclusiveGateway_1 | 576 | 180 | 50 | 50 | bpmn:104 |
| UserTask_154khzh | 371 | 301 | 160 | 50 | bpmn:137 |
| Task_0k24d4u | 156 | 301 | 164 | 50 | bpmn:145 |
| Task_2 | 519 | 433 | 164 | 50 | bpmn:98 |
| Task_0lk57sx | 519 | 523 | 164 | 50 | bpmn:161 |
| EndEvent_1 | 583 | 641 | 36 | 36 | bpmn:92 |

---

## §9. 사용 테이블

### §9.1 MCM_SOURCE.TB_MCM_CODE_CATEGORY (주 테이블 — DMES Excel sheet34 전수)

> **schema 구조 (2026-05-29 사용자 명시 정정)**: 본 화면은 **원장 편집 화면 (CRUD DML)** 이므로 To-Be 정본 owner = `MCM_SOURCE.TB_MCM_CODE_CATEGORY` (편집/DML 대상). As-Is mui Mapper.xml 의 `MCM_SOURCE.TB_MCM_CODE_CATEGORY` 는 **원장 schema 명시** (synonym 아님 — mui DB테이블명세서: "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 / `docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`). 3 schema 구조: **`MCM_SOURCE`** (원장 — 본 화면 DML 대상) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 row copy 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). DMES Excel sheet34 r2 의 owner=MCMAPUSER 표기는 **운영(SELECT) 카탈로그 관점** — 본 화면(원장 편집)은 MCM_SOURCE 정본 (정합). **To-Be**: `MCM_SOURCE.TB_MCM_CODE_CATEGORY` 보존 + audit 부분은 cactus-core 9 컬럼 적용으로 폐기 (3 schema 모두 audit 9 컬럼 동일 적용 — 동기화 시 row copy 정합 위해 / 가이드 02 §A.5-3-1 / BackEnd 가이드 §8-1 MUST). 본 컬럼 Type 은 sheet36 동일 컬럼 차용 (MASTER_CODE VARCHAR 50 / CATEGORY_ID VARCHAR 180 / SORT_SEQ NUMBER 8).

| # | 영문항목명 | Type | 자릿수 | KEY | 한글의미 | 본 화면 사용 | 출현 위치 | 근거 |
|---:|---|---|---:|---|---|---|---|---|
| 1 | MASTER_CODE | (Excel misalignment) | - | PK 1 | (-) | ✓ | GetCodeCategoryList JOIN 키 / INSERT / UPDATE / DELETE / MERGE | Mapper.xml:8, 41, 44, 49, 51, 56, 63, 73, 78, 88, 96 / Excel sheet34 r7 |
| 2 | CATEGORY_ID | (Excel misalignment) | - | PK 2 | (-) | ✓ | 동일 (5 SQL 호출) | Mapper.xml:10, 23, 57, 64, 74, 79, 89, 97 / Excel sheet34 r8 |
| 3 | CATEGORY_NM | (Excel misalignment) | - | - | (-) | ✓ | SELECT + UPDATE SET + INSERT (LIKE 검색) | Mapper.xml:11, 26, 41, 58, 65, 82, 90, 98 / Excel sheet34 r9 |
| 4 | SORT_SEQ | (Excel misalignment) | - | - | (-) | ✓ | SELECT + UPDATE SET + INSERT + MERGE | Mapper.xml:12, 42, 59, 66, 83, 91, 99 / Excel sheet34 r10 |
| 5 | CREATED_OBJECT_TYPE | - | - | - | 생성TYPE | ✓ (fragment) | ref_Audit fragment include (insert_item / insert_value) | Mapper.xml:60, 84 / Excel sheet34 r11 (audit 그룹 1) |
| 6 | CREATED_OBJECT_ID | - | - | - | 생성USER | ✓ (fragment) | 동일 | Mapper.xml:60, 84 / Excel sheet34 r12 |
| 7 | CREATED_PROGRAM_ID | - | - | - | 생성SERVICE | ✓ (fragment) | 동일 | Mapper.xml:60, 84 / Excel sheet34 r13 |
| 8 | CREATION_TIMESTAMP | TIMESTAMP(6) | - | - | 생성일시 | ✓ (fragment, SYSDATE → SYSDATETIME 변환 영향) | INSERT (SYSDATE) → §11 변환 | Mapper.xml:60, 84 / Excel sheet34 r14 |
| 9 | LAST_UPDATED_OBJECT_TYPE | - | - | - | 최종변경TYPE | ✓ (fragment) | ref_Audit fragment include (update) | Mapper.xml:43, 67, 92, 100 / Excel sheet34 r15 (audit 그룹 2) |
| 10 | LAST_UPDATED_OBJECT_ID | - | - | - | 최종변경USER | ✓ (fragment) | 동일 | Mapper.xml:43, 67, 92, 100 / Excel sheet34 r16 |
| 11 | LAST_UPDATE_PROGRAM_ID | - | - | - | 최종변경SERVICE | ✓ (fragment) | 동일 | Mapper.xml:43, 67, 92, 100 / Excel sheet34 r17 |
| 12 | LAST_UPDATE_TIMESTAMP | TIMESTAMP(6) | - | - | 최종변경일자 | ✓ (fragment, SYSDATE → SYSDATETIME) | UPDATE (SYSDATE) → §11 변환 | Mapper.xml:43, 67, 92, 100 / Excel sheet34 r18 |
| 13~21 | DATA_END_* / ARCHIVE_* (audit 그룹 3·4 — 9 컬럼) | - | - | - | (DDL only, As-Is Mapper 미사용) | **To-Be 제거** (사용자 결정 — cactus-core 9 컬럼 (`C_*` / `U_*` / `VER`) 자동 적용 / 가이드 02 §A.5-3-1 정합 / BackEnd 가이드 §8-1 MUST / 3 schema 모두 동일 적용) | Excel sheet34 r19~r27 |
| 14 | DATA_END_OBJECT_TYPE | - | - | - | 데이타종료TYPE | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet34 r20 |
| 15 | DATA_END_OBJECT_ID | - | - | - | 데이타종료USER | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet34 r21 |
| 16 | DATA_END_PROGRAM_ID | - | - | - | 데이타종료SERVICE | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet34 r22 |
| 17 | DATA_END_TIMESTAMP | TIMESTAMP(6) | - | - | 데이터종료일시 | N (audit 그룹 3) | (Mapper 미사용) | Excel sheet34 r23 |
| 18 | ARCHIVE_COMPLETED_FLAG | - | - | - | Archive완료TYPE | N (audit 그룹 4 — DDL only) | (Mapper 미사용) | Excel sheet34 r24 |
| 19 | ARCHIVED_EMPLOYEE_NUM | - | - | - | Archive완료USER | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet34 r25 |
| 20 | ARCHIVED_TIMESTAMP | TIMESTAMP(6) | - | - | Archive완료일자 | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet34 r26 |
| 21 | ARCHIVE_PROGRAM_ID | - | - | - | Archive완료SERVICE | N (audit 그룹 4) | (Mapper 미사용) | Excel sheet34 r27 |

PK 추정 결론: `(MASTER_CODE, CATEGORY_ID)` 복합 PK (Update / Delete WHERE 절 / Merge ON 절이 정확히 두 컬럼 등치) — Mapper.xml:44~45, 50~51, 77~80.

**audit 9 컬럼 룰 (2026-05-29 가이드 정본 / 본 표 audit 그룹 1·2·3·4 폐기 대체)**: audit 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) = cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 자동 적용. 3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 동일 적용 (동기화 시 row copy 정합 위해). 가이드 02 §A.5-3-1 정합 / BackEnd 가이드 §8-1 MUST.

### §9.2 MCM_SOURCE.TB_MCM_CODE_MASTER (참조 테이블 — DMES Excel sheet39 인용)

> **schema 구조 (2026-05-29 사용자 명시 정정)**: 본 화면 SELECT 의 JOIN 대상 = `MCM_SOURCE.TB_MCM_CODE_MASTER` (원장 schema — 본 화면이 카테고리 편집 시 동일 원장 schema 의 MASTER 와 JOIN). As-Is Mapper.xml 의 `MCM_SOURCE.TB_MCM_CODE_MASTER` 는 **원장 schema 명시** (synonym 아님). DMES Excel sheet39 r2 의 owner=MCMAPUSER 표기는 **운영(SELECT) 카탈로그 관점** — 본 화면(원장 편집 + 같은 원장 schema JOIN)은 MCM_SOURCE 정본. 본 화면은 참조용 3 컬럼만 사용 — 전수 33 컬럼 카탈로그는 masterCodeMng §9.1 참조.

| 컬럼 | 본 화면 사용 | 용도 | DMES Excel 한글의미 | 근거 |
|---|---|---|---|---|
| MASTER_CODE | ✓ | SELECT 표시 (코드 ID 라벨) | (Excel sheet39 r11 — 한글의미 빈 셀) | Mapper.xml:8, 32 / Excel sheet39 r11 |
| CODE_NM | ✓ | SELECT 표시 (코드명) | 코드명 | Mapper.xml:9 / Excel sheet39 r8 |
| CODE_ID | ✓ | JOIN 조인키 (TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID) | 코드ID | Mapper.xml:15, 36 / Excel sheet39 r7 |

비고: TB_MCM_CODE_MASTER 의 `MASTER_CODE` 와 `CODE_ID` 는 별개 컬럼이며, JOIN 키는 `CODE_ID` 임에 유의. (즉 본 화면의 TB_MCM_CODE_CATEGORY.MASTER_CODE 는 TB_MCM_CODE_MASTER.CODE_ID 의 FK 역할 — 명명 혼동 주의 / Excel sheet39 r11 한글의미가 비어있어 FK 의미 추가 확인 필요).

### §9.3 DMES Excel 매핑

- DMES Excel 113 시트 전수 추출 (Bash + Python xml 파싱). TB_MCM_CODE_CATEGORY (sheet34 — 21 컬럼) / TB_MCM_CODE_MASTER (sheet39 — 33 컬럼) 모두 §9.1 / §9.2 본문에 직접 보강.
- **정본 owner 확정 (2026-05-29 사용자 명시 정정)**: 본 화면은 **원장 편집 화면** 이므로 두 테이블 모두 To-Be 정본 owner = `MCM_SOURCE` 스키마 (편집/DML 대상). As-Is mui Mapper.xml 의 `MCM_SOURCE.` 는 **원장 schema 명시** (synonym 아님 — mui DB테이블명세서 정합). DMES Excel sheet 의 owner=MCMAPUSER 표기는 **운영(SELECT) 카탈로그 관점** — 본 화면(원장 편집)은 MCM_SOURCE 정본. 3 schema 구조: `MCM_SOURCE` (원장 — 본 화면 DML 대상) / `MCMAPUSER` (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상) / `MCM_BACKUP` (백업본). 동기화 화면이 MCM_SOURCE → MCMAPUSER (+ MCM_BACKUP) row copy 책임 (별도 사이클).
- sheet34 misalignment: cactus-core 9 컬럼 적용으로 audit 부분 폐기. 본 컬럼 Type 은 sheet36 동일 컬럼 차용 (사용자 결정). 3 schema 모두 audit 9 컬럼 동일 적용 (가이드 02 §A.5-3-1 / BackEnd 가이드 §8-1 MUST / 동기화 row copy 정합 위해).

---

## §10. 코드값 / LoV

- 본 화면 데이터셋 컬럼 STATUS (col 2 imagecontrol) 는 ColumnInfo 미선언 + SQL 미반환 → Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정).
- ref_Audit.update / ref_Audit.insert_item / ref_Audit.insert_value 는 외부 공통 fragment — 호출만 인용. 본 자산 외 정의.
- 자체 정의 코드값 / 정적 LoV / 콤보박스 ✗.

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 문자열 결합 | `'%' \|\| #{x} \|\| '%'` | Mapper.xml:17, 20, 23, 26 | `'%' + #{x} + '%'` 또는 `CONCAT('%', #{x}, '%')` |
| MERGE 구문 USING DUAL | `MERGE INTO ... USING (SELECT #{...} FROM DUAL) ON ... WHEN MATCHED ... WHEN NOT MATCHED ...` | Mapper.xml:72~103 | `MERGE INTO ... USING (VALUES (#{...})) AS src (col1, col2) ON ... WHEN MATCHED ... WHEN NOT MATCHED THEN INSERT ...;` (MSSQL MERGE 는 세미콜론 종결 필수, DUAL 미존재 — VALUES 또는 SELECT subquery 사용) |
| 스키마명 | `MCM_SOURCE.{TABLE}` (mui Mapper.xml 원장 schema 명시 — synonym 아님) | Mapper.xml:13, 14, 34, 35, 40, 49, 55, 72 | **To-Be `MCM_SOURCE.{TABLE}` 보존** (2026-05-29 사용자 명시 정정 — 본 화면 = 원장 편집 화면 / DML 대상 = MCM_SOURCE). 3 schema 구조: MCM_SOURCE (원장 — 본 화면 DML 대상) / MCMAPUSER (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / MCM_BACKUP (백업본 — 동기화 화면 위임). As-Is mui DB테이블명세서 "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 |
| 감사 fragment | `<include refid="ref_Audit.update/insert_item/insert_value">` | Mapper.xml:43, 60, 67, 84, 92, 100 | **To-Be**: MyBatis `ref_Audit` fragment 폐기 → cactus-core `CactusAuditEntity` 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) JPA `@PrePersist` / `@PreUpdate` 자동. 3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 audit 9 컬럼 동일 적용 — 동기화 시 row copy 정합 위해 (가이드 02 §A.5-3-1 / BackEnd 가이드 §8-1 MUST). audit 그룹 3·4 (DATA_END_*/ARCHIVE_*) 9 컬럼 제거 |
| 명시 PK 정의 | (DDL 본문 자산 외) | - | (MSSQL) `(MASTER_CODE, CATEGORY_ID)` 복합 PK 명시 + FK (`MASTER_CODE` → `TB_MCM_CODE_MASTER.CODE_ID`) 정의 |
| 테이블명 | TB_MCM_CODE_CATEGORY (As-Is) | - | **To-Be `MCM_SOURCE.TB_MCM_CODE_CATEGORY` 보존** (2026-05-29 사용자 명시 정정 — 원장 schema 명시) |
| orphan MergeTbCodeCategory | 정의됨 + 호출 ✗ | Mapper.xml:71~103 | **To-Be 제거** (As-Is 미호출 — 사용자 결정) |
| **delete BPMN flow** | Task_0k24d4u / SequenceFlow_0w4k9x6 / SequenceFlow_10mn97r | bpmn | **To-Be 제거** (As-Is xfdl 주석 처리 — 사용자 결정) |
| **Optimistic Locking** | As-Is 명시 ✗ | - | cactus-core `VER` (@Version) 자동 적용 |
| **로그 메시지 오타** | `"MasterCodeMapper.*"` | java:39, 47, 57 | **To-Be `"MasterCategoryMngMapper.*"` 정정** (사용자 결정) |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng.*` | - | **To-Be Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cma.masterCategoryMng.{service,dto}.*`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |

---

## §12. 결정 누적 (사용자 결정 완료)

> 활성 확인필요 = **0 건**. 결정 내용은 §6 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **STATUS 컬럼 (그리드 col 2)** | Nexacro auto row state — **To-Be FE 프레임워크에서 동일 row state 표시 기능 구현** | §3.3 / §10 |
| **edt_* "USD" 초기값** | As-Is 보존 (운영 의도) | §3.2 |
| **호출됨 팝업** | mcm 모듈 내 단독 화면으로 확정 (masterCodeMng 등 호출 화면 없음) | §5 |
| **BPMN delete flow** | As-Is 미호출 → **To-Be 제거** (Task_0k24d4u / SequenceFlow_0w4k9x6 / SequenceFlow_10mn97r) | §8 |
| **orphan SQL (`MergeTbCodeCategory`)** | As-Is 미호출 → **To-Be 제거** | §6 |
| **로그 메시지 오타 (`MasterCodeMapper.*`)** | To-Be `MasterCategoryMngMapper.*` 정정 | §7 |
| **스키마/테이블명 (2026-05-29 사용자 명시 정정)** | As-Is `MCM_SOURCE.TB_MCM_CODE_*` (원장 schema 명시 — synonym 아님) → **To-Be `MCM_SOURCE.TB_MCM_CODE_*` 보존** (본 화면 = 원장 편집 화면 / DML 대상 = 원장 schema MCM_SOURCE). 3 schema 구조 (MCM_SOURCE 원장 / MCMAPUSER 운영 read 동기화본 / MCM_BACKUP 백업본) 명시. 동기화 화면이 MCM_SOURCE → MCMAPUSER (+ MCM_BACKUP) row copy 책임 (별도 사이클). As-Is mui DB테이블명세서 "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`) | §9.1 / §9.2 / §9.3 / §11 |
| **키 변경 제약** | As-Is 정책 보존 (기존행 MASTER_CODE / CATEGORY_ID 편집 불가) | 기능 §6 |
| **행 추가 시 CODE_NM 복사** | As-Is 휴리스틱 보존 (직전 행 CODE_NM 복사) | 기능 §6 |
| **중복체크 통합** | As-Is 클라이언트 2 단계 검증 보존 + To-Be 서버 사이드 검증 추가 (Service 레이어) | 기능 §6 |
| **audit 컬럼** | As-Is `ref_Audit` 17 컬럼 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). 3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 audit 9 컬럼 동일 적용 — 동기화 시 row copy 정합 위해. 가이드 02 §A.5-3-1 정합 / BackEnd 가이드 §8-1 MUST. DATA_END_*/ARCHIVE_* 9 컬럼 제거 | §9.1 / §11 |
| **sheet34 misalignment** | cactus-core 9 컬럼 적용으로 audit 부분 폐기. 본 컬럼 Type 은 sheet36 동일 컬럼 차용 (MASTER_CODE VARCHAR 50 / CATEGORY_ID VARCHAR 180 / SORT_SEQ NUMBER 8) | §9.1 |
| **SORT_SEQ mask** | As-Is mask 패턴 보존 (`###,###,...` 형식) | 디자인 §4 |
| **권한** | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 기능 §8 |
| **통신 채널** | OASIS REST (cactus 표준) | BPMN §1 |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng.*` → **Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cma.masterCategoryMng.{service,dto}.*`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | §7 / §8 / §11 |
| **Mapper 경로** | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.MasterCodeCategoryRepository` (native query). Mapper.xml.asis 는 보존 | §6 / §11 |
| **동시성 / Optimistic Locking** | cactus-core `VER` (@Version) 자동 적용 | §9 / §11 |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| G1 | xfdl 컴포넌트 전수 (조회조건 8 + 그리드 1 + 영역 5 + 헤더 1 + 우측 메뉴 5 + 본문 1 = 21 전수) | ○ | §3 |
| G2 | 그리드 columns 전수 (8 cols) | ○ | §3.3 |
| G3 | Dataset 컬럼 전수 (ds_grdMain 6 + ds_grdMainAll 2) | ○ | §3.3 |
| G4 | java 메서드 전수 (run 단일 — Wow 인터페이스) | ○ | §7.2 |
| G5 | Mapper.xml SQL 전수 (5 정의 + 1 orphan = 6) | ○ | §6 |
| G6 | bpmn flow 노드 전수 (Start/End + Gateway + Task 4 + UserTask 1 = 7 노드, sequenceFlow 8) | ○ | §8.2, §8.3 |
| G7 | action 매트릭스 일치 (search/save/delete + 5 client-side) | ○ | §4.5 |
| G8 | 식별자 cite (모든 본문 주장 file:line) | ○ | 본 문서 전수 |
| G9 | 활성 확인필요 = 0 (사용자 결정 완료) | ○ | §12 결정 누적 표 |
| G10 | Runner 미적용 명시 | ○ | §0, 정합체크서 §D.4 |
