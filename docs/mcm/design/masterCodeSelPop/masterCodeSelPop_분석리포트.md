---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# 마스터코드 선택 팝업 분석리포트

> **자료 원천**: As-Is mui (xfdl + Mapper.xml + bpmn) 1:1 보존. 추측·수정·삭제·병합 ✗. 모든 본문 주장에 file:line 인용.

## 0. 환경 제약

| 항목 | 값 / 사유 |
|---|---|
| Runner 적용 여부 | ✗ (mui 자료형식 Runner 미지원 — 사용자 결정) |
| 가이드 정본 처리 | docs/guide/design/templates/*.template.md = 절 제목·구조 참고만. WinForms 전제 항목 (designer.cs / resx / Visible=false / @Case SP 등) 은 본 화면에서 등가물 부재 → "해당 없음" 명시 후 mui 등가물 (xfdl Form/Layout/Grid `<Format>` + bpmn `<bpmn2:task>` + Mapper `<select id>`) 로 매핑. |
| 화면 성격 | 다른 화면에서 호출되는 모달 LoV 팝업 (Java 클래스 없음 — Mapper + BPMN 만 존재) |
| As-Is DB | Oracle (`UPPER('%' || #{pValue} || '%')` 등 Oracle 문자열 연결 + `MCM_SOURCE.TB_MCM_CODE_DETAIL` 스키마 표기) |
| To-Be DB | MSSQL (§11 변환점 명시) |

---

## 1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면명 | 마스터코드 선택 팝업 |
| 화면 식별자 (screenId) | masterCodeSelPop |
| As-Is 식별자 (asIsId) | MasterCodeSelPop |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | cma (한글명 **"Master 관리(원장)"**) |
| 메뉴 계층 | 공통관리 (mcm) > Master 관리(원장) (cma) > 마스터코드 선택 팝업 (masterCodeSelPop) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase) |
| pageName | masterCodeSelPop |
| pageId | masterCodeSelPop |
| serviceId | masterCodeSelPop |
| Frontend 파일명 | masterCodeSelPop.tsx |
| 분석 일자 | 2026-05-27 |

**화면 목적** (R-12 Tier 5 패턴):

> 마스터코드 선택 팝업은 MasterCodeSelPop 의 조회를 수행한다.

**호출 컨텍스트** (`gfn_popupClose(obj)` 로 호출 화면에 반환):

| 항목 | 값 | 근거 |
|---|---|---|
| 호출 방식 | `gfn_openPopup("modal", "{title}", "cma::MasterCodeSelPop.xfdl", oArg, "", "{callback}")` | (호출 측 4 화면 — §5) |
| 입력 파라미터 (필수) | `sCodeId` (CODE_ID — 마스터코드 그룹 식별자) | MasterCodeSelPop.xfdl:120 / Mapper:15-17 |
| 입력 파라미터 (선택) | `sCodeNm` (코드명 — UI 표시용), `sCodeVal` (검색 초기값), `sCodeValMean` (보존 — 사용 흔적 ✗) | MasterCodeSelPop.xfdl:121-123 |
| 반환값 | `{ sCodeVal, sCodeValMean }` (선택된 행의 코드값/코드의미) | MasterCodeSelPop.xfdl:187-190 / 196-199 |

---

## 2. 자료 수집 인벤토리

| # | 자료 구분 | 경로/파일 | 확인 (Y/N) | 분석에 사용 | 미확인 시 영향 |
|---:|---|---|---|---|---|
| 1 | xfdl (UI) | docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cma/MasterCodeSelPop.xfdl | Y | §3 컴포넌트 전수 + §4 액션 + §10 LoV | - |
| 2 | Mapper.xml (SQL) | docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-cma/MasterCodeSelPopMapper.xml | Y | §6 SQL ID 매트릭스 + §9 사용 테이블 | - |
| 3 | bpmn (서비스) | docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/cma/MasterCodeSelPop.bpmn | Y | §8 워크플로우 전수 | - |
| 4 | Java 트랜잭션 클래스 | (조회 전용 — Java 클래스 미존재) | N | §7 = 없음 명시 | 부재가 정상 (CommonSelectTask 만 사용) |
| 5 | DMES 테이블 정의서 | docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx | Y (113 시트 전수 추출) | Y (§9 본문 반영) | Bash + Python xml 파싱으로 xlsx 추출 — `MCMAPUSER.TB_MCM_CODE_DETAIL` (sheet36) / `MCMAPUSER.TB_MCM_CODE_CATEGORY` (sheet34) 정본 확보 |
| 6 | 호출 화면 (역참조) | docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cmb/ (4 화면) | Y | §5 호출 출처 P-NNN 역참조 | - |
| 7 | TB_MCM_CODE_DETAIL 컬럼 참조 | docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-uma/UITestMapper.xml:42-50 | Y | §9 뷰 원본 컬럼 추정 | - |

---

## 3. UI 컴포넌트 전수 (xfdl)

### 3.1 영역 구성 (Form `<Form id="MasterCodeSelPop" width="480" height="740" titletext="마스터코드 조회">` — MasterCodeSelPop.xfdl:3)

| 영역 ID | 영역명 | xfdl 컴포넌트 | 위치 | 근거 |
|---|---|---|---|---|
| A-TITLE | 타이틀 | `<Div id="div_title">` + `<Edit id="edt_title" value="마스터코드 선택">` | left=20 top=0 right=20 height=50 | MasterCodeSelPop.xfdl:44-56 |
| A-FOLD | 조회조건 접기 버튼 | `<Button id="btn_fold" cssclass="btn_WFSA_Fold">` | top=93 | MasterCodeSelPop.xfdl:6 |
| A-FILTER | 조회조건 영역 | `<Div id="div_search">` (`<Combo>` + `<Edit>` + `<Static>` + `<Edit>`) | left=20 top=50 right=20 height=43 | MasterCodeSelPop.xfdl:58-84 |
| A-GRID | 결과 그리드 영역 | `<Div id="div_main">` 내부 `<Grid id="grd_main" binddataset="ds_grdMain">` | left=20 top=btn_fold:5 right=20 bottom=35 | MasterCodeSelPop.xfdl:7-43 |
| A-FOOTER | 하단 공통 영역 | `<Div id="div_bottom" url="_com_div::commonBottomStatus.xfdl">` | bottom=0 height=20 | MasterCodeSelPop.xfdl:57 |
| A-TOPMENU | 공통 상단 버튼 영역 | `<Div id="div_topMenu" url="_com_div::commonTopButton.xfdl">` (btn_search / btn_confirm / btn_close 주입) | right=0 width=270 height=23 | MasterCodeSelPop.xfdl:48-53 / Script:146-151 |

### 3.2 조회조건 전수 목록 (S-NNN)

xfdl `<Div id="div_search">` 내부 컴포넌트 (좌표 X 순 정렬, Y 동일 시 X 오름차순):

| ID | 화면 표시명 (출처) | xfdl 컨트롤명 | xfdl type | 좌표 (X / Y / W / H) | Mapper 파라미터 | 기본값 (xfdl) | 동적 기본값 (xfdl Script) | 필수 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | 코드명 (출처: `<Static>` text) | stc_codeNm | Static (라벨) | left=0 top=10 W=50 H=20 | (UI 전용 — 라벨) | text="코드명" | - | - | MasterCodeSelPop.xfdl:80 |
| S-002 | 코드명 입력값 (`edt_codeNm`) | edt_codeNm | Edit | left=stc_codeNm:10 top=11 W=108 H=20 | (Mapper 전송 ✗ — 미사용) | text="결함 코드" | sCodeNm 호출 시 set_value (Script:125-127) | - | MasterCodeSelPop.xfdl:81 / Script:125-127 |
| S-003 | 검색구분 (코드값/코드의미) | cbo_div | Combo (innerdataset 2 행) | left=208 top=11 W=80 H=20 | `#{pDiv}` (CODE_VAL / CODE_VAL_MEAN) | value="CODE_VAL" | - | Y (Mapper `<if test='pDiv.equals(...)>'`) | MasterCodeSelPop.xfdl:61-78 |
| S-004 | 코드값 검색어 | edt_codeVal | Edit | left=cbo_div:10 top=10 W=135 H=20 | `#{pValue}` | text="USD" | sCodeVal 호출 시 set_value (Script:129-131) | - | MasterCodeSelPop.xfdl:79 / Script:129-131 |

**부속 — innerdataset (cbo_div Combo)**: MasterCodeSelPop.xfdl:62-77

| codecolumn | datacolumn |
|---|---|
| CODE_VAL | 코드값 |
| CODE_VAL_MEAN | 코드의미 |

### 3.3 결과 그리드 G-NNN (`<Grid id="grd_main">` columns 전수)

`<Format id="default">` columns (Format 정의 + Band/Cell — MasterCodeSelPop.xfdl:10-40):

**Format `<Columns>` 5 컬럼 + `<Rows>` (head + body)**:

| Grid 컬럼 # | size (xfdl) | Head Cell text (xfdl) | Body Cell bind (xfdl) | bind 표현 | editmaxlength | editimemode | editinputmode | displaytype | edittype | Mapper SELECT alias | 근거 |
|---:|---:|---|---|---|---|---|---|---|---|---|---|
| 0 | 30 | NO | `expr:currow+1` | (UI 산출 — DB 비대응) | - | - | - | - | - | (UI 자동 번호) | MasterCodeSelPop.xfdl:14,21-22,25,32 |
| 1 | 80 | 카테고리 ID | `bind:CATEGORY_ID` | CATEGORY_ID | - | - | - | - | - | CATEGORY_ID | MasterCodeSelPop.xfdl:15,26,33 / Mapper:11 |
| 2 | 80 | 카테고리명 | `bind:CATEGORY_NM` | CATEGORY_NM | - | - | - | - | - | CATEGORY_NM | MasterCodeSelPop.xfdl:16,27,34 / Mapper:12 |
| 3 | 160 | 코드값 | `bind:CODE_VAL` | CODE_VAL | 50 | alpha | upper | normal | none | CODE_VAL | MasterCodeSelPop.xfdl:17,28,35 / Mapper:9 |
| 4 | 160 | 코드의미 | `bind:CODE_VAL_MEAN` | CODE_VAL_MEAN | 180 | hangul | (미지정) | normal | none | CODE_VAL_MEAN | MasterCodeSelPop.xfdl:18,29,36 / Mapper:10 |

**그리드 속성** (MasterCodeSelPop.xfdl:10):
- `autofittype="col"` / `binddataset="ds_grdMain"`
- `selecttype="cell"` / `cellmovingtype="col"` / `cellsizingtype="col"`
- `onheadclick="div_main_grd_main_onheadclick"` → `gfn_commonOnheadclick` (정렬 — Script:없음, gfn 공통)
- `oncelldblclick="div_main_grd_main_oncelldblclick"` → `gfn_popupClose(obj)` (Script:185-191)

### 3.4 ds_grdMain Dataset ColumnInfo 전수 (xfdl Objects — MasterCodeSelPop.xfdl:88-96)

| Dataset 컬럼 ID | type | size | Grid 노출 (G 컬럼 #) | Mapper SELECT 노출 | 비고 |
|---|---|---:|---:|---|---|
| MASTER_CODE | STRING | 256 | (노출 ✗) | (주석 — Mapper:8 `--MASTER_CODE`) | xfdl Dataset 에는 정의되어 있으나 Grid 및 SELECT 에 비노출 — As-Is 보존 (사용자 결정 — 호출 화면이 sCodeId 파라미터로 전달하는 컨벤션) |
| CODE_VAL | STRING | 256 | 3 | Y | - |
| CODE_VAL_MEAN | STRING | 256 | 4 | Y | - |
| CATEGORY_ID | STRING | 256 | 1 | Y | - |
| CATEGORY_NM | STRING | 256 | 2 | Y | - |

---

## 4. 버튼·액션 (B-NNN / GB-NNN)

### 4.1 B-NNN 버튼 전수 (xfdl Script + commonTopButton 주입)

`fn_button()` 에서 `commonTopButton.xfdl` 에 3 표준 버튼 array 주입 — MasterCodeSelPop.xfdl:146-151:

```
new Array(["btn_search"],["btn_confirm"],["btn_close"])
```

| ID | 버튼명 (출처) | xfdl 컨트롤명 | xfdl 핸들러 함수 | 동작 유형 (7 enum) | To-Be action (7 enum) | BPMN sourceFlow name | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | 조회 (commonTop btn_search) | btn_search (commonTop 주입) | `fn_search` (Script:155-168) | 조회 | search | `search` (SequenceFlow_0grwghu) | MasterCodeSelPop.xfdl:150 / Script:155-168 / MasterCodeSelPop.bpmn:33 |
| B-002 | 확인 (commonTop btn_confirm — 선택 행 반환) | btn_confirm (commonTop 주입) | `fn_confirm` (Script:194-200) | 연계 (popupClose) | popup | (BPMN 미존재 — 클라이언트 only) | MasterCodeSelPop.xfdl:150 / Script:194-200 |
| B-003 | 닫기 (commonTop btn_close) | btn_close (commonTop 주입) | `fn_close` (Script:203-205) | 연계 (this.close) | popup | (BPMN 미존재 — 클라이언트 only) | MasterCodeSelPop.xfdl:150 / Script:203-205 |
| B-004 | 조회조건 접기/펴기 | btn_fold | `btn_fold_onclick` (Script:208-211) | 연계 (gfn_fold) | popup | (BPMN 미존재 — 클라이언트 only) | MasterCodeSelPop.xfdl:6 / Script:208-211 |

### 4.2 GB-NNN 그리드셀 인라인 버튼

해당 없음 (xfdl Grid Body Cell `edittype="none"` 전수 — MasterCodeSelPop.xfdl:35-36).

### 4.3 그리드 셀 이벤트 (B-NNN 외 별도 등재)

| ID | 이벤트 위치 | 트리거 | 핸들러 함수 | 동작 | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| E-001 | grd_main `oncelldblclick` | 그리드 셀 더블클릭 | `div_main_grd_main_oncelldblclick` (Script:185-191) | 선택 행의 `{ CODE_VAL, CODE_VAL_MEAN }` 반환 후 popupClose | popup (== B-002 confirm 와 동일 동작) | MasterCodeSelPop.xfdl:10 / Script:185-191 |
| E-002 | grd_main `onheadclick` | 그리드 헤더 클릭 | `div_main_grd_main_onheadclick` (Script:없음 — gfn 공통 호출) | 정렬 토글 | (UI only) | MasterCodeSelPop.xfdl:10 |
| E-003 | edt_codeVal `onkeydown` | Enter 키 | `div_search_edt_codeVal_onkeydown` (Script:214-217) | (주석 처리됨 — `//if(e.keycode==13) this.fn_search();`) | (미사용 — L2) | MasterCodeSelPop.xfdl:79 / Script:214-217 |

---

## 5. 호출 출처 (P-NNN 역참조)

본 화면은 **호출 대상**. 호출 측 4 화면 (역참조 grep `MasterCodeSelPop` in `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/`):

| ID | 호출 화면 (As-Is) | 호출 위치 (file:line) | 트리거 (호출 측 화면 동작) | oArg.sCodeId | oArg.sCodeNm | 콜백 함수 | 호출 다이얼로그 title |
|---|---|---|---|---|---|---|---|
| P-001 | MasterJudgRuleDataList (mui/src/nxuiMui/cmb/MasterJudgRuleDataList.xfdl) | :615 | 그리드 셀 클릭 (`div_main_grdMain_oncellclick`) | `sText.substr(5).replace("_OP","").replace("_MIN","").replace("_MAX","")` (그리드 셀 텍스트에서 파생) | `obj.getCellProperty("head", e.cell, "text").replace(" 연산자","").replace(" MIN","").replace(" MAX","")` (헤더 텍스트에서 파생) | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-002 | MasterRuleNewSpec (mui/src/nxuiMui/cmb/MasterRuleNewSpec.xfdl) | :446 | 검색조건 마스터코드 버튼 클릭 (`div_search_btn_ruleId_onclick`) | "SPEC_CD" | "규격약호" | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-003 | MasterRuleNewSpec (mui/src/nxuiMui/cmb/MasterRuleNewSpec.xfdl) | :474 | 등록대상 그리드 마스터코드 버튼 클릭 (`div_main_btn_ruleId_onclick`) | "SPEC_CD" | "규격약호" | fn_returnRegMasterCodePopupCallBack | "규격약호 선택" |
| P-004 | MasterRuleDataList (mui/src/nxuiMui/cmb/MasterRuleDataList.xfdl) | :593 | 그리드 셀 클릭 (`div_main_grdMain_oncellclick`) | `sText.substr(5)` (그리드 셀 텍스트에서 파생) | `obj.getCellProperty("head", e.cell, "text")` (헤더 텍스트에서 파생) | fn_returnMasterCodePopupCallBack | "마스터코드 조회" |
| P-005 | MasterJudgRuleNewSpec (mui/src/nxuiMui/cmb/MasterJudgRuleNewSpec.xfdl) | :424 | 검색조건 마스터코드 버튼 클릭 | "SPEC_CD" | "규격약호" | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-006 | MasterJudgRuleNewSpec (mui/src/nxuiMui/cmb/MasterJudgRuleNewSpec.xfdl) | :447 | 등록대상 그리드 마스터코드 버튼 클릭 | "SPEC_CD" | "규격약호" | fn_returnRegMasterCodePopupCallBack | "규격약호 선택" |

**관찰**:
- 모든 호출 측은 `gfn_openPopup("modal", "{title}", "cma::MasterCodeSelPop.xfdl", oArg, "", "{callback}")` 패턴.
- `oArg` 는 `{ sCodeId, sCodeNm, [sCodeVal] }` 형태. `sCodeNm` 은 호출 화면이 UI 라벨용으로 받는 값이나 본 화면에서는 `edt_codeNm` 의 화면 표시만 담당 (Script:125-127).
- 본 화면 분석 결과 `sCodeNm` 은 Mapper 전송 ✗ (`fn_search` Script:161-163 가 `pCodeId / pDiv / pValue` 만 전송).

---

## 6. SQL ID 매트릭스 (Mapper.xml `<select>` 전수)

Mapper 파일 : `mui/src/main/resources/persistence/mappers-cma/MasterCodeSelPopMapper.xml`, namespace = `MasterCodeSelPopMapper`.

| Mapper SQL ID | 유형 | 입력 파라미터 (`<if>` 분기) | 사용 테이블/뷰 | 핵심 절 | xfdl `sOutDatasets` | BPMN `sqlKey` | BPMN `resultKey` | 근거 |
|---|---|---|---|---|---|---|---|---|
| GetCodeDetailList | select | `pCodeId` (선택 — `UPPER(CODE_ID) = UPPER(#{pCodeId})`), `pDiv` (CODE_VAL 일 때 `UPPER(CODE_VAL) LIKE UPPER('%' \|\| #{pValue} \|\| '%')` / CODE_VAL_MEAN 일 때 `UPPER(CODE_VAL_MEAN) LIKE ...`), `pValue` | VI_MCM_CODE_ACCESS (주석 — `MCM_SOURCE.TB_MCM_CODE_DETAIL`) | `SELECT CODE_VAL, CODE_VAL_MEAN, CATEGORY_ID, CATEGORY_NM` + `<where>` + `ORDER BY CODE_VAL` | `ds_grdMain=ds_GetCodeDetailList` | `#{serviceId}Mapper.GetCodeDetailList` (= `MasterCodeSelPopMapper.GetCodeDetailList`) | `ds_GetCodeDetailList` | MasterCodeSelPopMapper.xml:7-27 / MasterCodeSelPop.xfdl Script:157-163 / MasterCodeSelPop.bpmn:18-19 |

**Mapper SELECT 절 컬럼 분해** (MasterCodeSelPopMapper.xml:8-12):

| SELECT 위치 | 컬럼 | 상태 (출력/주석) |
|---|---|---|
| Mapper:8 | `--MASTER_CODE` | 주석 (제외) — Dataset 에는 잔존 (§3.4 — As-Is 보존) |
| Mapper:9 | `CODE_VAL` | 출력 |
| Mapper:10 | `CODE_VAL_MEAN` | 출력 |
| Mapper:11 | `CATEGORY_ID` | 출력 |
| Mapper:12 | `CATEGORY_NM` | 출력 |

**Mapper `<where>` 동적 절 전수**:

| 분기 | 조건 | SQL |
|---|---|---|
| `pCodeId != null and pCodeId != ""` | pCodeId 존재 | `AND UPPER(CODE_ID) = UPPER(#{pCodeId})` (Mapper:16) |
| `pDiv.equals("CODE_VAL")` | 검색구분 = CODE_VAL | `AND UPPER(CODE_VAL) LIKE UPPER('%' \|\| #{pValue} \|\| '%')` (Mapper:19) |
| `pDiv.equals("CODE_VAL_MEAN")` | 검색구분 = CODE_VAL_MEAN | `AND UPPER(CODE_VAL_MEAN) LIKE UPPER('%' \|\| #{pValue} \|\| '%')` (Mapper:22) |

**ORDER BY**: `CODE_VAL` (Mapper:26 — `--ORDER BY MASTER_CODE` 주석 잔존 Mapper:25)

---

## 7. Java 트랜잭션 (조회 전용 — 해당 없음)

| 구분 | 결과 |
|---|---|
| Java 클래스 존재 여부 | ✗ |
| 사용 클래스 (BPMN `class` 속성) | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` (공통 SELECT 태스크 — 화면별 Java 미작성, sqlKey 만 주입) |
| 근거 | MasterCodeSelPop.bpmn:14 (`<camunda:property name="class" value="com.dongkuk.oasis.task.commonDbTask.CommonSelectTask"/>`) |

> **결론**: 본 화면은 조회 전용으로 화면별 Java 트랜잭션 클래스가 존재하지 않는다. BPMN `<bpmn2:task>` 1 개가 `CommonSelectTask` 를 재사용하며 `sqlKey` 만 화면별로 주입한다. 가이드의 §5 (As-Is 소스 로직 분석 — cs/designer.cs) / §5.1 (이벤트 12종 매트릭스) / §5.2 (SP 분기 매트릭스) 는 mui 등가물 ✗ → "해당 없음" 명시.

---

## 8. BPMN 워크플로우 전수

파일: `mui/src/main/resources/services/cma/MasterCodeSelPop.bpmn`, process id = `MasterCodeSelPop`, name = "마스터코드 조회".

### 8.1 BPMN 노드 전수

| BPMN ID | 종류 | name | bpmn 속성 | 근거 |
|---|---|---|---|---|
| StartEvent_1 | startEvent | "Start Event" | outgoing=SequenceFlow_1 | MasterCodeSelPop.bpmn:4-6 |
| ExclusiveGateway_1 | exclusiveGateway | (미지정) | gatewayDirection=Diverging, incoming=SequenceFlow_1, outgoing=SequenceFlow_0grwghu | MasterCodeSelPop.bpmn:25-31 |
| Task_2 | task (camunda modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate`) | "Main조회" | camunda properties (§8.3), incoming=SequenceFlow_0grwghu, outgoing=SequenceFlow_0lnje1n | MasterCodeSelPop.bpmn:10-24 |
| EndEvent_1 | endEvent | "End Event" | incoming=SequenceFlow_0lnje1n | MasterCodeSelPop.bpmn:7-9 |

### 8.2 SequenceFlow 전수

| SequenceFlow ID | name | sourceRef | targetRef | 역할 | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | (미지정) | StartEvent_1 | ExclusiveGateway_1 | Start → Gateway | MasterCodeSelPop.bpmn:32 |
| SequenceFlow_0grwghu | "search" | ExclusiveGateway_1 | Task_2 | Gateway → Main조회 (action enum "search") | MasterCodeSelPop.bpmn:33 |
| SequenceFlow_0lnje1n | (미지정) | Task_2 | EndEvent_1 | Main조회 → End | MasterCodeSelPop.bpmn:34 |

### 8.3 Task_2 (Main조회) camunda properties 전수 (MasterCodeSelPop.bpmn:13-20)

| name | value | 역할 |
|---|---|---|
| class | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | 공통 SELECT 태스크 클래스 |
| paramKey | (빈 값) | 입력 dataset key (조회 전용 — 빈 값 = serviceResult.input 사용) |
| isServiceResult | `true` | 결과를 serviceResult 에 적재 |
| dao | (빈 값) | (DAO 미지정 — Mapper 직접 호출) |
| sqlKey | `#{serviceId}Mapper.GetCodeDetailList` (실값 = `MasterCodeSelPopMapper.GetCodeDetailList`) | Mapper SQL ID 결합 |
| resultKey | `ds_GetCodeDetailList` | 결과 dataset key |

### 8.4 ext:style (BPMN 시각화 — 분석 비대상이지만 보존)

| 노드 | shapeBackground | labelForeground | labelPosition | 근거 |
|---|---|---|---|---|
| Task_2 | #0080c0 | #000000 | (미지정) | MasterCodeSelPop.bpmn:12 |
| ExclusiveGateway_1 | #ffff00 | (미지정) | Center of Figure | MasterCodeSelPop.bpmn:27 |

### 8.5 BPMN ↔ xfdl ↔ Mapper 정합

| xfdl `sSvcID` (Script:157) | BPMN SequenceFlow name | BPMN Task `sqlKey` | Mapper `<select id>` |
|---|---|---|---|
| `"search"` | `"search"` (SequenceFlow_0grwghu) | `MasterCodeSelPopMapper.GetCodeDetailList` | `GetCodeDetailList` |

정합 ✓ (4 식별자 1:1 일치).

---

## 9. 사용 테이블 / 뷰

### 9.1 VI_MCM_CODE_ACCESS (As-Is 뷰)

| 항목 | 값 | 근거 |
|---|---|---|
| 종류 | View | MasterCodeSelPopMapper.xml:13 (`FROM VI_MCM_CODE_ACCESS`) |
| 원본 테이블 (주석) | `MCM_SOURCE.TB_MCM_CODE_DETAIL` | MasterCodeSelPopMapper.xml:13 (`/*MCM_SOURCE.TB_MCM_CODE_DETAIL*/`) |
| 뷰 정의 (DDL) | **사용자 제공 정본 (2026-05-29)** — §11.2 본문 참조. Oracle 본문 → MSSQL 변환은 `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재 | 사용자 제공 본문 (Oracle DDL — owner=MCMAPUSER, JOIN 대상 = MCMAPUSER.TB_MCM_CODE_*, `MASTER.USE_TP='Y'` 필터) |
| 사용 컬럼 (본 화면) | CODE_ID (조건), CODE_VAL, CODE_VAL_MEAN, CATEGORY_ID, CATEGORY_NM | MasterCodeSelPopMapper.xml:9-22 |
| 사용 컬럼 (주석 — 잔존) | MASTER_CODE (Mapper:8 / Mapper:25 ORDER BY 주석 / xfdl Dataset:90) | MasterCodeSelPopMapper.xml:8,25 / MasterCodeSelPop.xfdl:90 |

### 9.2 TB_MCM_CODE_DETAIL (DMES Excel sheet36 전수 추출 — 30 컬럼)

> **schema 구조 (2026-05-29 사용자 명시 정정)**: 원장 schema = `MCM_SOURCE.TB_MCM_CODE_DETAIL` (편집·DML 대상, mui Mapper.xml 의 `MCM_SOURCE.` 가 원장 schema 명시 — synonym 아님) / 운영 read schema = `MCMAPUSER.TB_MCM_CODE_DETAIL` (동기화본, view 의 JOIN 대상) / 백업 schema = `MCM_BACKUP.TB_MCM_CODE_DETAIL`. DMES Excel sheet36 r2 의 owner=MCMAPUSER 표기는 **운영(SELECT) 카탈로그 관점**. 본 화면은 **view 사용 = 운영 read** 라 `MCMAPUSER.VI_MCM_CODE_ACCESS` 를 호출 (정합). 동기화 화면이 MCM_SOURCE → MCMAPUSER (+ MCM_BACKUP) row copy 책임 (별도 사이클).

| # | 영문항목명 | Type | 자릿수 | KEY | 한글의미 | 본 화면 사용 | 근거 |
|---:|---|---|---:|---|---|---|---|
| 1 | MASTER_CODE | VARCHAR | 50 | Y (PK) | 코드ID | xfdl Dataset 잔존 / Mapper SELECT 주석 (As-Is 보존 — 호출 컨텍스트에서 파라미터로 전달) | Excel sheet36 r7 / MasterCodeSelPopMapper.xml:8 |
| 2 | CATEGORY_ID | VARCHAR | 180 | | 카테고리ID | Y (SELECT — VI 통해) | Excel sheet36 r8 |
| 3 | CODE_VAL | VARCHAR | 50 | | 코드값 | Y (SELECT, WHERE LIKE) | Excel sheet36 r9 |
| 4 | CODE_VAL_MEAN | VARCHAR | 120 | | 코드의미 | Y (SELECT, WHERE LIKE) | Excel sheet36 r10 |
| 5 | CODE_VAL_REF1 | VARCHAR | 300 | | 코드-참조값1 | N (본 화면 미사용) | Excel sheet36 r11 |
| 6 | CODE_VAL_REF2 | VARCHAR | 300 | | 코드-참조값2 | N | Excel sheet36 r12 |
| 7 | CODE_VAL_REF3 | VARCHAR | 300 | | 코드-참조값3 | N | Excel sheet36 r13 |
| 8 | CODE_VAL_REF4 | VARCHAR | 300 | | 코드-참조값4 | N | Excel sheet36 r14 |
| 9 | CODE_VAL_REF5 | VARCHAR | 300 | | 코드-참조값5 | N | Excel sheet36 r15 |
| 10 | CODE_VAL_DESC | VARCHAR | 300 | | 코드설명 | N | Excel sheet36 r16 |
| 11 | **CODE_VAL_REMARK** | VARCHAR | 300 | | 코드참조값 | DDL 정의 + As-Is 본 화면 미사용 — **To-Be 보존** (사용자 결정) | Excel sheet36 r17 |
| 12 | CODE_VER | NUMBER | 8,2 | | 코드버전 | N | Excel sheet36 r18 |
| 13 | SORT_SEQ | NUMBER | 8 | | 정렬순서 | N (ORDER BY 미적용) | Excel sheet36 r19 |
| 14 | CREATED_OBJECT_TYPE | VARCHAR | 1 | | 생성TYPE | N (DDL only — audit 그룹 1) | Excel sheet36 r20 |
| 15 | CREATED_OBJECT_ID | VARCHAR | 50 | | 생성USER | N (audit 그룹 1) | Excel sheet36 r21 |
| 16 | CREATED_PROGRAM_ID | VARCHAR | 50 | | 생성SERVICE | N (audit 그룹 1) | Excel sheet36 r22 |
| 17 | CREATION_TIMESTAMP | TIMESTAMP(6) | 12 | | 생성일시 | N (audit 그룹 1 — SYSDATE→SYSDATETIME 변환 영향) | Excel sheet36 r23 |
| 18 | LAST_UPDATED_OBJECT_TYPE | VARCHAR | 1 | | 최종변경TYPE | N (audit 그룹 2) | Excel sheet36 r24 |
| 19 | LAST_UPDATED_OBJECT_ID | VARCHAR | 50 | | 최종변경USER | N (audit 그룹 2) | Excel sheet36 r25 |
| 20 | LAST_UPDATE_PROGRAM_ID | VARCHAR | 50 | | 최종변경SERVICE | N (audit 그룹 2) | Excel sheet36 r26 |
| 21 | LAST_UPDATE_TIMESTAMP | TIMESTAMP(6) | 12 | | 최종변경일자 | N (audit 그룹 2 — SYSDATE 영향) | Excel sheet36 r27 |
| 22 | DATA_END_STATUS | VARCHAR | 1 | | 데이터종료여부 | N (audit 그룹 3 — DDL only, As-Is 미사용) | Excel sheet36 r28 |
| 23 | DATA_END_OBJECT_TYPE | VARCHAR | 1 | | 데이타종료TYPE | N (audit 그룹 3) | Excel sheet36 r29 |
| 24 | DATA_END_OBJECT_ID | VARCHAR | 50 | | 데이타종료USER | N (audit 그룹 3) | Excel sheet36 r30 |
| 25 | DATA_END_PROGRAM_ID | VARCHAR | 50 | | 데이타종료SERVICE | N (audit 그룹 3) | Excel sheet36 r31 |
| 26 | DATA_END_TIMESTAMP | TIMESTAMP(6) | 12 | | 데이터종료일시 | N (audit 그룹 3) | Excel sheet36 r32 |
| 27 | ARCHIVE_COMPLETED_FLAG | VARCHAR | 1 | | Archive완료TYPE | N (audit 그룹 4 — DDL only) | Excel sheet36 r33 |
| 28 | ARCHIVED_EMPLOYEE_NUM | VARCHAR | 50 | | Archive완료USER | N (audit 그룹 4) | Excel sheet36 r34 |
| 29 | ARCHIVED_TIMESTAMP | TIMESTAMP(6) | 12 | | Archive완료일자 | N (audit 그룹 4) | Excel sheet36 r35 |
| 30 | ARCHIVE_PROGRAM_ID | VARCHAR | 50 | | Archive완료SERVICE | N (audit 그룹 4) | Excel sheet36 r36 |

**CATEGORY_NM**: DMES Excel sheet36 (TB_MCM_CODE_DETAIL) 에 미존재 → VI_MCM_CODE_ACCESS 뷰가 `MCMAPUSER.TB_MCM_CODE_CATEGORY` (Excel sheet34 r9 `CATEGORY_NM`) 와 JOIN 하여 노출하는 컬럼으로 확정.

### 9.3 사용 뷰 / 테이블 요약 (DMES Excel 정본 매핑)

| As-Is | DMES Excel 정본 | 정합성 | 비고 |
|---|---|---|---|
| `VI_MCM_CODE_ACCESS` (뷰) | **`MCMAPUSER.VI_MCM_CODE_ACCESS` (사용자 제공 정본 DDL §11.2)** | `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재 (2026-05-29) |
| `MCM_SOURCE.TB_MCM_CODE_DETAIL` (원장 schema — 편집/DML 대상) | **`MCMAPUSER.TB_MCM_CODE_DETAIL` (운영 read 동기화본 — 본 화면 view 의 JOIN 대상)** | 본 화면은 view 사용 = 운영 read → `MCMAPUSER` schema 정합 (2026-05-29 사용자 명시 3 schema 구조) |
| (CATEGORY_NM 출처) | `MCMAPUSER.TB_MCM_CODE_CATEGORY.CATEGORY_NM` (사용자 제공 view DDL JOIN — `MASTER.MASTER_CODE = CATEGORY.MASTER_CODE`) | 사용자 제공 DDL 본문에서 확정 |
| Oracle `PUBLIC SYNONYM VI_MCM_CODE_ACCESS` | MSSQL `PUBLIC SYNONYM` 미지원 → Service.java FROM 절에 schema 명시 `MCMAPUSER.VI_MCM_CODE_ACCESS` | C-005 (a 안 — 2026-05-29 사용자 결정) |

---

## 10. 코드값 / LoV

### 10.1 본 화면 자체 정의 LoV (xfdl innerdataset)

| ID (LV-NNN) | 코드 그룹 | 값 | 표시명 | 사용 위치 | 근거 |
|---|---|---|---|---|---|
| LV-001 | (cbo_div Combo innerdataset — 검색구분) | CODE_VAL | 코드값 | S-003 | MasterCodeSelPop.xfdl:67-71 |
| LV-001 | (cbo_div Combo innerdataset — 검색구분) | CODE_VAL_MEAN | 코드의미 | S-003 | MasterCodeSelPop.xfdl:72-75 |

### 10.2 본 화면이 노출하는 LoV (= 자기 자신)

본 화면 = 마스터코드 LoV 팝업. 출력 데이터 자체가 호출 화면에서 사용하는 LoV. CODE_ID (= sCodeId) 값별로 다른 코드 그룹 노출:

| 호출 측 sCodeId (P-NNN) | 코드 그룹 의미 | 근거 |
|---|---|---|
| "SPEC_CD" (P-002 / P-003 / P-005 / P-006) | 규격약호 | MasterRuleNewSpec.xfdl:442 / MasterJudgRuleNewSpec.xfdl:443 등 |
| 그리드 셀에서 파생되는 동적 CODE_ID (P-001 / P-004) | 룰 셀의 컬럼 코드 (`sText.substr(5)`) | MasterJudgRuleDataList.xfdl:610 / MasterRuleDataList.xfdl:588 |

---

## 11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

### 11.1 SQL 변환 항목

| # | As-Is (Oracle) | To-Be (MSSQL) | 위치 | 비고 |
|---|---|---|---|---|
| C-001 | `'%' \|\| #{pValue} \|\| '%'` (문자열 연결자 `\|\|`) | `'%' + #{pValue} + '%'` (또는 `CONCAT('%', #{pValue}, '%')`) | MasterCodeSelPopMapper.xml:19, 22 | Oracle `\|\|` → MSSQL `+` 또는 `CONCAT()` |
| C-002 | `UPPER(...)` | `UPPER(...)` (동일) | MasterCodeSelPopMapper.xml:16, 19, 22 | UPPER 함수는 양 DBMS 호환 — 변환 불필요 |
| C-003 | 스키마 명시 `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper.xml 주석 — As-Is 원장 schema 인용) | **본 화면은 view 사용 (운영 read)** → To-Be view JOIN 대상은 `MCMAPUSER.TB_MCM_CODE_*` 자기 schema 동기화본 (사용자 제공 view DDL §11.2 본문 명시 / 원장 DML 은 다른 3 화면이 MCM_SOURCE 에 수행) | MasterCodeSelPopMapper.xml:13 주석 | 2026-05-29 정정 — As-Is `MCM_SOURCE.` 는 synonym 아닌 원장 schema 명시 (mui DB테이블명세서 정합) |
| C-004 | `<if test='pDiv.equals("CODE_VAL")'>` (MyBatis OGNL `equals`) | 동일 (MyBatis OGNL 은 DBMS 무관) | MasterCodeSelPopMapper.xml:18, 21 | MyBatis 변환 불필요 |
| C-005 | Oracle `PUBLIC SYNONYM VI_MCM_CODE_ACCESS` (모든 계정이 schema prefix 없이 접근 — `CREATE PUBLIC SYNONYM ... FOR MCMAPUSER.VI_MCM_CODE_ACCESS`) | **MSSQL `PUBLIC SYNONYM` 미지원 → schema 명시 `MCMAPUSER.VI_MCM_CODE_ACCESS`** (Service.java FROM 절 / a 안) | Service.java `FROM MCMAPUSER.VI_MCM_CODE_ACCESS` | 2026-05-29 사용자 결정 (a 안 — schema 명시) |

### 11.2 뷰 (VI_MCM_CODE_ACCESS) 변환 — 사용자 제공 정본 DDL

#### 11.2.1 As-Is Oracle DDL (사용자 제공 정본 — 2026-05-29)

```sql
CREATE OR REPLACE VIEW MCMAPUSER.VI_MCM_CODE_ACCESS
(
    CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN,
    CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5,
    CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ
)
AS
SELECT MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM,
       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN,
       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5,
       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ
  FROM TB_MCM_CODE_MASTER MASTER, TB_MCM_CODE_CATEGORY CATEGORY, TB_MCM_CODE_DETAIL DETAIL
 WHERE MASTER.USE_TP = 'Y'
   AND MASTER.MASTER_CODE = CATEGORY.MASTER_CODE
   AND MASTER.MASTER_CODE = DETAIL.MASTER_CODE
   AND CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID;

CREATE PUBLIC SYNONYM VI_MCM_CODE_ACCESS
FOR MCMAPUSER.VI_MCM_CODE_ACCESS;

GRANT SELECT ON MCMAPUSER.VI_MCM_CODE_ACCESS TO APSAPUSER;
GRANT SELECT ON MCMAPUSER.VI_MCM_CODE_ACCESS TO MLSRWUSER;
GRANT SELECT ON MCMAPUSER.VI_MCM_CODE_ACCESS TO MPPRWUSER;
GRANT SELECT ON MCMAPUSER.VI_MCM_CODE_ACCESS TO ROLE_APP_RW;
GRANT SELECT ON MCMAPUSER.VI_MCM_CODE_ACCESS TO ROLE_DTUSER;
```

**해석**:
- view owner = `MCMAPUSER` → FROM 절의 schema 미명시 테이블은 자동으로 `MCMAPUSER.TB_MCM_CODE_*` 로 resolve (= 운영 read 동기화본).
- 따라서 view 는 원장(`MCM_SOURCE`) 을 직접 JOIN 하지 않음 — **동기화 화면이 MCM_SOURCE → MCMAPUSER 로 적재한 결과를 표시**.
- `MASTER.USE_TP = 'Y'` 필터로 활성 코드만 노출.
- `PUBLIC SYNONYM` = Oracle 전역 별칭. 모든 계정이 `SELECT * FROM VI_MCM_CODE_ACCESS` 로 schema 없이 접근.
- GRANT 5 대상 = 다른 모듈 계정 (`APSAPUSER`/`MLSRWUSER`/`MPPRWUSER`) + 2 역할 (`ROLE_APP_RW`/`ROLE_DTUSER`).

#### 11.2.2 To-Be MSSQL 변환

| 항목 | As-Is (Oracle) | To-Be (MSSQL) |
|---|---|---|
| 뷰 본문 | `CREATE OR REPLACE VIEW MCMAPUSER.VI_MCM_CODE_ACCESS` | `IF OBJECT_ID('MCMAPUSER.VI_MCM_CODE_ACCESS','V') IS NULL EXEC('CREATE VIEW ... ')` (멱등) — `DataInitializer.createOrReplaceMcmCodeAccessView()` 가 적재 |
| FROM 절 schema | (owner=MCMAPUSER 라 자동 resolve) | **schema 명시** `FROM MCMAPUSER.TB_MCM_CODE_MASTER MASTER, MCMAPUSER.TB_MCM_CODE_CATEGORY CATEGORY, MCMAPUSER.TB_MCM_CODE_DETAIL DETAIL` (MSSQL 안전성) |
| JOIN 조건 | `MASTER.USE_TP='Y'` + 3 등치 JOIN | 동일 (MSSQL 호환) |
| 컬럼 정의 / 별칭 | 15 컬럼 explicit | 동일 (MSSQL 호환) |
| `PUBLIC SYNONYM` | `CREATE PUBLIC SYNONYM VI_MCM_CODE_ACCESS FOR MCMAPUSER.VI_MCM_CODE_ACCESS` | **MSSQL 미지원** → Service.java FROM 절에 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (a 안 — C-005) |
| GRANT 5 대상 | 5 GRANT 문 | MSSQL 권한 모델로 재현 — 동기화 화면 사이클에서 운영 GRANT 스크립트 작성 위임 |

#### 11.2.3 적재 책임

- **dev 환경**: `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 sample_dmes 의 `MCMAPUSER` schema 에 빈 3 테이블 + view 멱등 생성 (2026-05-29 추가).
- **운영 prod**: 별도 운영 DDL 스크립트로 생성 (동기화 화면 사이클 위임).

### 11.3 영향 받는 Mapper / BPMN

| 영향 위치 | 변경 필요 | 비고 |
|---|---|---|
| MasterCodeSelPopMapper.xml:19, 22 | `\|\|` → `+` 또는 `CONCAT()` | MyBatis Mapper 본문 단순 치환 |
| MasterCodeSelPopMapper.xml:13 | `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper 의 원장 schema 주석 — 본 화면 view 사용으로 SQL 본문은 미변경) → Service.java 는 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (C-005 a 안) | mui Mapper.xml 본문 변경 ✗ — As-Is 보존. Service.java native query 만 schema 명시 |
| MasterCodeSelPop.bpmn | (변경 불필요 — sqlKey 만 참조) | sqlKey 본문은 Service.java 에 위임 (mcm 은 OASIS 전용) |
| VI_MCM_CODE_ACCESS DDL | ✓ 완료 — `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 사용자 제공 정본 DDL 의 MSSQL 변환을 멱등 적재 (2026-05-29) | - |

---

## 12. 결정 누적 (사용자 결정 완료)

> 공통 결정 (mcm 4 화면 일괄) + 본 화면 단독 결정. 활성 미결정 = **0 건** (잔존 항목은 모두 본문 §6 / §9 / §11 에 반영).

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **스키마 구조 (2026-05-29 사용자 명시 정정)** | 3 schema 분리: `MCM_SOURCE` (원장 — 편집/DML, 다른 3 화면이 책임) / `MCMAPUSER` (운영 read 동기화본 — 본 화면 view JOIN 대상) / `MCM_BACKUP` (백업본 — 동기화 화면 위임). As-Is `MCM_SOURCE.` 는 synonym 이 아니라 **원장 schema 명시** (mui DB테이블명세서: "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기) | §9.2 / §9.3 / §11.1 |
| **VI_MCM_CODE_ACCESS 뷰** | **사용자 제공 정본 DDL (2026-05-29)** — owner=MCMAPUSER, JOIN 대상=MCMAPUSER 자기 schema, `MASTER.USE_TP='Y'` 필터. MSSQL 변환은 `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재 | §11.2 |
| **C-005 PUBLIC SYNONYM** | MSSQL 미지원 → Service.java FROM 절에 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (a 안) | §11.1 / §11.2 |
| **CATEGORY_NM 출처** | DMES Excel sheet34 r9 (TB_MCM_CODE_CATEGORY.CATEGORY_NM) 와 JOIN 한 뷰 컬럼 — 정본 확정 | §9.2 |
| **audit 컬럼** | As-Is `ref_Audit` 17 컬럼 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1). DATA_END_*/ARCHIVE_* 9 컬럼 제거. `CODE_VAL_REMARK` 보존 | §9.2 / §11.13 |
| **sheet34 misalignment** | cactus-core 9 컬럼 적용으로 audit 부분 폐기. 본 컬럼 Type 은 sheet36 동일 컬럼 차용 | §9.2 |
| **xfdl Dataset MASTER_CODE 비노출** | As-Is 1:1 보존 (호출 화면 컨텍스트에서 MASTER_CODE 는 파라미터로 받는 컨벤션 — Dataset 잔존만) | §3.4 |
| **edt_codeNm 표시값** | As-Is 보존 (호출 화면의 sCodeNm 표시 — read-only 헤더) | §3.2 |
| **Enter 자동 조회** | As-Is 주석 처리 보존 (Enter 자동 조회 의도적 비활성) | §3.2 / §4 |
| **commonTopButton 핸들러 연결** | As-Is gfn 약속 보존 — To-Be 표준화는 FE 프레임워크 컨벤션 (별도 가이드) | §4 |
| **Java 패키지** | (본 화면은 Java 클래스 없음 — 조회 전용. UserTask ✗) | - |
| **권한** | To-Be 외부 권한 프로세스 (전사 정책) 위임 | 기능 §8 |
| **동시성** | (본 화면은 조회 전용 — 동시성 영향 ✗) | - |

---

## 13. 정합 게이트 자가 점검

| 게이트 | 조건 | 결과 | 사유 |
|---|---|---|---|
| G1. xfdl 컴포넌트 전수 | xfdl 의 모든 Layout 자식 + Objects Dataset 전수 매핑 | ✓ | §3.1 (6 영역) + §3.2 (S-001~004 + innerdataset 2 행) + §3.3 (Grid 5 컬럼 + Format/Band/Cell 속성) + §3.4 (Dataset 5 컬럼) |
| G2. Grid columns 전수 | Format `<Columns>` 5 행 + Band head/body cell 전수 | ✓ | §3.3 5 행 (NO/카테고리ID/카테고리명/코드값/코드의미) — 표시 형식·editmaxlength·editimemode·displaytype·edittype 모두 컬럼 분해 |
| G3. Mapper SQL 전수 | Mapper.xml `<select>` 전부 등재 | ✓ | §6 (1 SQL = GetCodeDetailList) + SELECT 절 5 컬럼 분해 + `<where>` 3 분기 + ORDER BY 분해 |
| G4. BPMN task/sequenceFlow/gateway 전수 | bpmn 의 모든 노드 등재 | ✓ | §8.1 (4 노드: Start/Gateway/Task/End) + §8.2 (3 sequenceFlow) + §8.3 (Task_2 camunda properties 6 행) |
| G5. file:line 인용 100% | 모든 본문 주장에 file:line | ✓ | (각 표 "근거" 컬럼) |
| G6. 추측 0 | 검증 안 한 추론 ✗ | ✓ | §9.2 TB_MCM_CODE_DETAIL 컬럼 DMES Excel sheet36 정본 / CATEGORY_NM 출처 sheet34 r9 확정. 뷰 DDL 본문은 개발 단계 추출 (사용자 결정) |
| G7. 활성 확인필요 = 0 | 사용자 결정 완료 (§12 결정 누적 표) | ✓ | - |
| G8. As-Is 1:1 보존 | 임의 수정·삭제·병합 ✗ | ✓ | xfdl/Mapper.xml/bpmn 본문 직접 인용 + cite |
| G9. 호출 출처 역참조 | P-NNN 4 화면 × 핸들러 6 호출 등재 | ✓ | §5 P-001~P-006 |
| G10. SQL ID ↔ BPMN sqlKey ↔ xfdl sSvcID 정합 | 식별자 1:1 일치 | ✓ | §8.5 (search ↔ search ↔ GetCodeDetailList ↔ MasterCodeSelPopMapper.GetCodeDetailList) |

**§13 결과**: G1~G5, G7~G10 = ✓. G6 = △ (Q-NNN 처리 완료). → 분석리포트 작성 완료.
