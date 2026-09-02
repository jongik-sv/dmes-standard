---
screenId: masterCodeMngList
asIsId: MasterCodeMngList
moduleId: mcm
moduleGroup: cme
작성일: 2026-05-29
작성자: Agent
---

# mcm — Master Code 상세조회 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `masterCodeMngList_분석리포트.md` 의 §1~§13 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑. moduleGroup 은 ASIS `cma` → To-Be `cme` 신규 그룹 이동.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | Master Code 상세조회 |
| **화면 식별자** | masterCodeMngList |
| **모듈** | mcm (To-Be cme 그룹) |
| **화면 목적** | 시스템 공통 마스터 코드 (Master) 및 카테고리별 상세코드 (Detail) 의 **조회 전용** 화면. 등록·수정·삭제 기능 ✗. 다른 사용자가 본 화면을 통해 코드 마스터를 참조 확인한다. 등록·수정은 별도 `masterCodeMng` 화면 사용. |
| **주요 사용자** | 시스템 관리자 / 표준코드 운영 담당자 / 업무 사용자 (코드 참조 확인) |
| **접근 경로** | (As-Is) Nexacro Mui Portal — cma 그룹 → MasterCodeMngList → (To-Be) Portal → 공통관리(mcm) > Master/업무기준(가동)(cme) > Master Code 상세조회(masterCodeMngList) |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup (To-Be) | cme — 한글명 **"Master/업무기준(가동)"** | 사용자 결정 — ASIS `cma` 그룹에서 cme 로 이동 (분석 §0 / §11.1) |
| 메뉴 계층 | 공통관리 (mcm) > Master/업무기준(가동) (cme) > Master Code 상세조회 (masterCodeMngList) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | masterCodeMngList | 01 A.3 / A.4.1 (camelCase 단일 토큰) |
| pageName | masterCodeMngList | 01 A.4.2 (MES: = screenId) |
| pageId | masterCodeMngList | 01 A.4.3 (MES: = screenId) |
| serviceId | masterCodeMngList | 01 A.4.4 |
| 페이지 유형 | **D 다중 그리드** (G + GE 동시 존재) | 분석 §3 (G-NNN 11 + GE-NNN 12 + D=0 + L=0) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/masterCodeMngList/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/masterCodeMngList/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `masterCodeMngList.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/cme/masterCodeMngList` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) — To-Be cme 그룹 |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:19) | 코드ID + 코드명 (S-001 / S-002) |
| A-MAIN-LEFT (= A-GRID) | Master 그리드 영역 | `div1` (xfdl:34) | G-001~G-011 (조회 전용) + 외부 commonRightButton (숨김) |
| A-MAIN-RIGHT (= A-GRID-EXT) | Detail 그리드 영역 | `div2` (xfdl:90) | GE-001~GE-012 + 카테고리 콤보 (FX-001/FX-002) + 선택 Master 표시 (FX-003) + Export 버튼 (B-002) |
| A-BTN | 버튼 영역 | div_main 상단 + div2 toolbar | B-001 (접기) + B-002 (Detail Export) |
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:6) | 화면명 + 공통 topMenu (외부 btn_search 자동 등록) |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:29) | 공통 bottom status 메시지 |

> 본 화면은 표준 5 영역 + A-TITLE / A-FOOTER 2 영역 추가. A-MAIN-LEFT (Master) 와 A-MAIN-RIGHT (Detail) 가 좌우 분할 (div1 right=51.61% / div2 left=49.19% — 일부 겹침 As-Is 보존).

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (2 행) | ✓ |
| 입력 방식 enum (5값) | TextBox 만 사용 | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | CODE_ID | 코드ID | TextBox | N | "USD" / `inputmode="upper"` | Master 코드 ID 부분 일치 검색 (또는 MASTER_CODE 일치 — xml:32 OR 조건) |
| S-002 | CODE_NM | 코드명 | TextBox | N | "USD" | Master 코드명 부분 일치 검색 (대소문자 무시 — UPPER 비교, xml:35) |

### 3.2 조회 결과 (G-NNN 메인 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 (11 행) | ✓ |
| 표시명 1 enum 매칭 | 확정 한글 8 행 + "NO" 1 행 (시스템 표준) + "참조N" 5 행 (한글) | ✓ |

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 (분기) | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | (currow+1) | NO | 행 번호 (그리드 자동 생성) | Center | int | N | - |
| G-002 | CODE_ID | 코드ID | Master 코드 ID (PK) | Left | varchar(50) `editmaxlength=50`, alpha+upper | N (조회 전용 — editmaxlength 만 지정, edittype 명시 ✗) | Y (head CellEssentail) |
| G-003 | CODE_NM | 코드명 | Master 코드명 | Left | varchar(180) `editmaxlength=180`, hangul ime | N (조회 전용) | Y (head CellEssentail) |
| G-004 | CODE_DESC | 설명 | Master 코드 설명 | Left | varchar(300) `editmaxlength=300`, hangul ime | N | N |
| G-005 | MASTER_CODE | 마스터코드 | 마스터 대표 코드 (Detail 의 외래키) | Left | varchar(300) `editmaxlength=300`, hangul ime | N | N |
| G-006 | MASTER_CODE_REF1_NM | 참조1 | 참조 마스터 1 의 코드명 (SQL scalar subquery 결과) | Left | varchar | N | N |
| G-007 | MASTER_CODE_REF2_NM | 참조2 | (동일 — REF2) | Left | varchar | N | N |
| G-008 | MASTER_CODE_REF3_NM | 참조3 | (동일 — REF3) | Left | varchar | N | N |
| G-009 | MASTER_CODE_REF4_NM | 참조4 | (동일 — REF4) | Left | varchar | N | N |
| G-010 | MASTER_CODE_REF5_NM | 참조5 | (동일 — REF5) | Left | varchar | N | N |
| G-011 | USE_TP | 사용여부 | 사용 여부 (Y/N) | Center | char(1) (combo Y/N — combodataset=ds_chkYn) | N (조회 전용 — combo 표시만) | Y (head CellEssentail) |

**확장/서브 그리드 (GE-NNN) — Detail 그리드 (분석 §3.4 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GE-001 | (currow+1) | NO (head row 0 rowspan=2) | 행 번호 (자동) | Center | int |
| GE-002 | CODE_VAL | 값 (head row 1 col 1, head row 0 colspan=2 "코드") | Detail 코드 값 (PK 일부) | Left | varchar(50), editinputmode=upper, alpha ime, CellEssentail (head) |
| GE-003 | CODE_VAL_MEAN | 의미 (head row 1 col 2) | Detail 코드 의미 | Left | varchar(120), hangul ime, CellEssentail (head) |
| GE-004 | CATEGORY_ID | ID (head row 1 col 3, head row 0 colspan=2 "카테고리") | 카테고리 ID (PK 일부) | Left | CellEssentail (head) |
| GE-005 | CATEGORY_NM | 명 (head row 1 col 4) | 카테고리 명 | Left | (read-only) |
| GE-006 | SORT_SEQ | 정렬\\r\\n순서 (rowspan=2) | 정렬 순서 (mask) | Right | mask `###,###,###,###,###,###` |
| GE-007 | CODE_VAL_DESC | 설명 (rowspan=2) | Detail 코드 설명 | Left | varchar(300), hangul ime |
| GE-008 | CODE_VAL_REF1_MN | 참조1 (rowspan=2) | Detail 참조1 의 의미값 (SQL nested scalar subquery + NVL fallback) | Left | - |
| GE-009 | CODE_VAL_REF2_MN | 참조2 (rowspan=2) | (동일 동적) | Left | - |
| GE-010 | CODE_VAL_REF3_MN | 참조3 (rowspan=2) | (동일 동적) | Left | - |
| GE-011 | CODE_VAL_REF4_MN | 참조4 (rowspan=2) | (동일 동적) | Left | - |
| GE-012 | CODE_VAL_REF5_MN | 참조5 (rowspan=2) | (동일 동적) | Left | - |

> **masterCodeMng 와의 차이점**: GE-NNN 에 (1) 선택 체크박스 (CHK) (2) 상태 아이콘 (STATUS) (3) 동적 displaytype/edittype 분기 (USER_DEFINE) — 3 가지 모두 부재. 본 화면은 grid-level read-only.

### 3.3 코드값 표시 변환 (분석 §10 인용)

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| USE_TP | LV-001 (xfdl `ds_chkYn` 정적 Y/N) | Y → "Y" / N → "N" |
| CATEGORY_ID (FX-002) | LV-002 (`GetTbMcmCodeCategoryList` + "" / "전체" prepend) | "SZ0000" → "공통" (예) |
| CODE_VAL_REF{N}_MN (GE-008~GE-012) | LV-003 (`GetCodeDetailList` SQL 내부 nested scalar subquery — `CATEGORY_ID='SZ0000'` 하드코딩 + NVL fallback) | DB 값 의미 또는 원본 값 |
| (MASTER_CODE 전체 LoV) | LV-004 (`GetCodeMasterAllList`) — **호출 ✗, To-Be 제거** | (적용 안 함) |

---

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

해당 없음 — 본 화면은 D-NNN (단일 상세 폼) ✗. 모든 데이터 표시는 G-NNN (Master) + GE-NNN (Detail) 그리드 셀로 수행.

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인) ✗. Detail 그리드(GE)는 master-detail 관계이지만 PK 가 (MASTER_CODE + CATEGORY_ID + CODE_VAL) 복합으로 분기 분류 표상 GE-NNN 으로 분류.

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | (접기 토글 — 아이콘) | div_main 상단 | (클라이언트 전용) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 |
| B-002 | Export | div2 (Detail 그리드 우상단) | export | `rowposition==-1` 차단 후 `gfn_exportExcel(grd_detail, titletext, ["마스터코드 : "+MASTER_CODE])` |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" 셀 ✗.

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용)

| To-Be action | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | UserTask Java |
|---|---|---|---|---|
| search | `fn_search` (xfdl:284) — btn_search (공통 top, EX-001) | `SequenceFlow_0grwghu` (search) | (1) GetCodeMasterList | - |
| searchDetail | `fn_searchDetail` (xfdl:303) — `div_main_div1_grd_main_oncellclick` (xfdl:363) | `SequenceFlow_02ocl0p` (searchDetail) | (1) GetTbMcmCodeCategoryList → (2) GetCodeDetailList | - |
| export | B-002 → `div_main_div2_btn_excelDown_onclick` (xfdl:393) / 외부 등록 `fn_excelDown` (xfdl:387, commonRightButton 기본 버튼) | (BPMN 외 — 클라이언트 엑셀) | - | - |

> **As-Is 6 action 미적용**: masterCodeMng 의 save/saveDetail/delete/deleteDetail 4 action 모두 본 화면 BPMN/xfdl 부재 — 조회 전용.

---

## 6. 비즈니스 룰 (validation / 도메인 룰)

### 6.1 fn_search 동작 룰 (분석 §4.4 #4 / xfdl:284~300)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | search 호출 전 4 dataset clear (ds_grdMain / ds_grdDetail / ds_lovCategoryId / stc_master) | btn_search 클릭 | - | (선처리) | xfdl:286~289 |
| V-002 | gfn_transaction sInDatasets="" / sOutDatasets="ds_grdMain=ds_GetCodeMasterList" / sArgument = pCodeId(edt_codeVal.value) + pCodeNm(edt_codeNm.value) | 동일 | - | - | xfdl:291~299 |

### 6.2 fn_searchDetail 동작 룰 (분석 §4.4 #5 / xfdl:303~321)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | searchDetail 호출 전 2 dataset clear (ds_grdDetail / ds_lovCategoryId) | grd_main oncellclick → fn_searchDetail | - | (선처리) | xfdl:305~306 |
| V-102 | gfn_transaction sInDatasets="" / sOutDatasets="ds_grdDetail=ds_GetCodeDetailList ds_lovCategoryId=ds_GetTbMcmCodeCategoryList" / sArgument = pCodeId(MASTER_CODE) + pCodeIdRef1~5(MASTER_CODE_REF1~5) | 동일 | - | - | xfdl:308~320 |

### 6.3 div_main_div1_grd_main_oncellclick 룰 (분석 §4.4 #8 / xfdl:363~378)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-201 | 현재 선택 row 재선택 시 skip 가드 (`if (this.rowpo == e.row) return;`) → **As-Is 주석 처리** | grd_main 셀 클릭 | - | (가드 비활성 — As-Is 주석) | xfdl:365 |
| V-202 | e.row != -1 && rowType != 2 (신규 아님) → ds_grdDetail.filter("") + `fn_searchDetail()` 호출 + ds_grdMain.reset() + ds_grdMain.set_rowposition(e.row) + grd_main.setFocus() + grd_main.setCellPos(e.col, e.row) | 동일 | - | - | xfdl:366~372 |
| V-203 | e.row == -1 또는 rowType == 2 → ds_grdDetail.clearData() + ds_lovCategoryId.clearData() | 동일 | - | (Detail 초기화) | xfdl:373~376 |
| V-204 | 마지막 `this.rowpo = ds_grdMain.rowposition` 기록 (다음 클릭 시 가드 비교용) | 동일 | - | (상태 저장) | xfdl:377 |

> **참고**: rowType==2 (신규 행) 가드는 본 화면이 조회 전용이라 dead code (행추가 버튼 ✗ 이므로 신규 행 발생 불가) — As-Is 1:1 보존. 분석 §12 결정 누적 표 참조.

### 6.4 div_main_div2_cbo_categoryId_onitemchanged 룰 (분석 §4.4 #7 / xfdl:355~360)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-301 | ds_grdDetail.reset() | 카테고리 콤보 선택 변경 | - | (필터 초기화) | xfdl:357 |
| V-302 | sCategoryId = cbo_categoryId.value | 동일 | - | - | xfdl:358 |
| V-303 | gfn_isNull(sCategoryId) → ds_grdDetail.filter("") (전체 표시) / 그 외 → ds_grdDetail.filter("CATEGORY_ID == '{값}'") (선택 카테고리만 표시) | 동일 | - | (그리드 필터 적용) | xfdl:359 |

### 6.5 B-002 (Detail Export) 룰 (분석 §4.4 #11 / xfdl:393~401)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-401 | ds_grdMain.rowposition == -1 → return (Master 그리드 행 미선택 시 차단) | B-002 클릭 | (메시지 없음) | return | xfdl:395 |
| V-402 | objAry.push("마스터코드 : " + MASTER_CODE) → gfn_exportExcel(grd_detail, titletext, objAry) | 동일 | - | (Excel 다운로드) | xfdl:399~400 |

### 6.6 콜백 공통 동작 (분석 §4.4 #6 / xfdl:324~352)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-501 | search 콜백 시 ds_grdMain.set_rowposition(this.grd_row) + ds_grdMain.set_enableevent(true) | fn_callBack("search") | xfdl:329~330 |
| V-502 | search 정상 → bottom status `strErrorMsg["ds_GetCodeMasterList"] + "건 조회 되었습니다."` | 동일 | xfdl:332 |
| V-503 | search 오류 → bottom status `strErrorMsg` 표시 | 동일 | xfdl:334 |
| V-504 | searchDetail 콜백 시 ds_grdDetail.set_rowposition(this.grd_row) | fn_callBack("searchDetail") | xfdl:339 |
| V-505 | searchDetail 정상 → ds_lovCategoryId.insertRow(0) + CATEGORY_ID="" / CATEGORY_NM="전체" + cbo_categoryId.set_index(0) + stc_master.set_text(MASTER_CODE) | 동일 | xfdl:341~345 |
| V-506 | searchDetail 정상 → bottom status `strErrorMsg["ds_GetCodeDetailList"] + "건 조회 되었습니다."` | 동일 | xfdl:346 |
| V-507 | searchDetail 오류 → bottom status `strErrorMsg` 표시 | 동일 | xfdl:348 |

### 6.7 onload 동작 (분석 §4.4 #1 / xfdl:246~261)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-601 | gfn_formOnLoad(obj) 호출 | Form onload | xfdl:248 |
| V-602 | gfn_quickMenuSet(this, grd_main, "", true, true, false, false, true) — 컬럼 복사/고정 활성 / 필터/표시 비활성 / 다중개인화 활성 | 동일 | xfdl:257 |
| V-603 | gfn_quickMenuSet(this, grd_detail, "", true, true, true, true, true) — 복사/고정/필터/표시/다중개인화 모두 활성 | 동일 | xfdl:258 |
| V-604 | ds_grdMain.set_enableevent(false) — 초기 이벤트 비활성 (조회 후 callback 에서 true 로 복구, V-501) | 동일 | xfdl:260 |
| V-605 | 개인화 5 라인 (`gfn_personalMultiGrid` / `gfn_personalMultiRowGridSearch` / `gfn_personalSetGrid`) **주석 처리 (xfdl:249~256)** — As-Is 잔존 | 동일 | xfdl:249~256 |

### 6.8 fn_formAfterOnload 동작 (분석 §4.4 #2 / xfdl:263~268)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-701 | fn_button() 호출 (공통 topMenu + commonRightButton 초기화) | (gfn 라이프사이클) | xfdl:265 |
| V-702 | `this.fn_search();` 라인 **주석 처리** (xfdl:266) — **본 화면 진입 시 자동 조회 ✗** | 동일 | xfdl:266 |
| V-703 | gfn_gridSelectedRow(grd_main) — 그리드 선택 표시 초기화 | 동일 | xfdl:267 |

> **V-702 결정**: 자동 조회 미적용 — 사용자 btn_search 클릭 시점에만 조회. To-Be 동일 동작 유지 (분석 §12).

### 6.9 fn_button 동작 (분석 §4.4 #3 / xfdl:270~281)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-801 | div_title.div_topMenu 의 `fn_commonTop_onload(this, '', [["btn_search"]])` — 공통 top 의 기본버튼 btn_search 등록 | fn_formAfterOnload | xfdl:271~273 |
| V-802 | div1.div_rightMenu 의 `fn_commonRight_onload(this, '', [["btn_excelDown"]], false, "")` — Master 측 우측 메뉴의 기본버튼 btn_excelDown 등록 (visible=false 상태) | 동일 | xfdl:276~280 |

> **V-802 결정**: commonRightButton (`div_rightMenu`) 은 `visible="false"` 로 화면에 표시되지 않으나, 기본버튼 `btn_excelDown` 은 등록되어 있어 외부에서 visible=true 로 토글 시 동작 가능 — As-Is 잔존 패턴 (개인화 / 컬럼 표시 등의 외부 menu 호출용).

---

## 7. 상태값 ST-NNN (분석 §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-011 (그리드 콤보 — combodataset=ds_chkYn) |
| ST-002 | `CODE_VER` | 코드 버전 (조회 결과 표시 — 히든) | DS-001 / DS-002 |
| ST-003 | `ds_grdMain.getRowType(currow) == 2` (신규 행) | 그리드 row 상태 (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | G grid oncellclick 의 dead code 가드 (xfdl:366) — As-Is 보존 |
| ST-004 | `ds_grdDetail.CHK` | (DS-002 에 정의됨, xfdl:196) | (xfdl Script 에서 CHK 토글/세트 0 회 — 미사용 잔존 컬럼) |

> ST-005 (Nexacro auto STATUS 표시) / ST-006 (USER_DEFINE 분기) 는 본 화면에 부재 — 등록/수정 기능 없음.

---

## 8. 권한 / 접근 제어

As-Is 코드 (xfdl) 내에 명시적 권한 체크 호출 없음 (`gfn_authority` / role check grep 0 hits). 공통 topMenu 의 `btn_search` 기본 버튼만 등록 (xfdl:273). **To-Be**: 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 프로세스 모델 (전사 정책) 에 위임 (사용자 결정).

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | (As-Is 명시 ✗ — 포털 메뉴 권한 모델 종속) | xfdl 전체 grep |
| 버튼 권한 | (As-Is 명시 ✗) | 동일 |
| To-Be 정책 | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗. 본 화면은 조회 전용이라 수정 권한 분기도 불요 | 사용자 결정 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §5 인용)

해당 없음 — xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 결과 0 회. 본 화면은 외부 팝업을 호출하지 않으며, 다른 화면에서 본 화면을 팝업으로 호출하는 흔적도 식별 ✗.

| P-ID | 유형 | 이름 | 트리거 | 호출 라인 | 전달 파라미터 | 반환 처리 |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line) | 근거 |
|---|---|---|---|---|
| M-001 | "{N}건 조회 되었습니다." (search) | bottom status | V-502 / xfdl:332 (`strErrorMsg["ds_GetCodeMasterList"] + "건 조회 되었습니다."`) | - |
| M-002 | "{N}건 조회 되었습니다." (searchDetail) | bottom status | V-506 / xfdl:346 (`strErrorMsg["ds_GetCodeDetailList"] + "건 조회 되었습니다."`) | - |
| M-003 | (서버 오류 메시지) `strErrorMsg` | bottom status | V-503 / V-507 / xfdl:334 / 348 | - |

> 본 화면은 조회 전용이라 etc. validation 모달 메시지 0 개. masterCodeMng 의 M-001~M-013 (validation warning) 은 본 화면에 미적용.

---

## 11. As-Is 인용 정합 (분석리포트 §1~§13 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 / moduleGroup To-Be cme |
| §2 | 분석 §3.1 | 영역 7 → 5 정규 + 2 추가 (TITLE / FOOTER) |
| §3.1 | 분석 §3.2 | 2 행 일치 |
| §3.2 | 분석 §3.3 / §3.4 | G 11 행 + GE 12 행 일치 |
| §4 | 분석 §3.5 | "해당 없음" 보존 |
| §5.1 | 분석 §4.1 | 2 행 일치 |
| §5.1-1 | 분석 §4.2 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | 2 active action + 1 export 행 |
| §6 | 분석 §4.4 (메서드 표) | V-001~V-802 모두 cite |
| §7 | 분석 §10.1 | 4 ST 일치 |
| §8 | (To-Be 외부 권한 프로세스 위임 — 사용자 결정) | 본 화면 권한 분기 ✗ |
| §9 | 분석 §5 | "해당 없음" 보존 |
| §10 | 분석 §4.4 | M-001~M-003 모두 cite |
