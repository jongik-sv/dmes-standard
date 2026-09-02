---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 컬럼 리스트 등록 팝업 분석리포트

> **자료 원천**: As-Is mui (xfdl + SaveMasterRuleBaseColList.java + Mapper.xml + bpmn + 부모 MasterRuleFrame.xfdl) 1:1 보존. 추측·수정·삭제·병합 ✗. 모든 본문 주장에 file:line 인용.

## 0. 환경 제약

| 항목 | 값 / 사유 |
|---|---|
| Runner 적용 여부 (R-14) | ✗ (mui 자료형식 Auto Manifest Runner 미지원 — 사용자 결정). manifest 폴더 미생성 (본 phase 지시 A). |
| 가이드 정본 처리 | docs/guide/design/templates/*.template.md = 절 제목·구조 참고만. WinForms 전제 항목 (designer.cs / resx / Visible=false / @Case SP / 이벤트 12종 매트릭스 등) 은 본 화면 등가물 부재 → "해당 없음" 명시 후 mui 등가물 (xfdl Form/Layout/Grid `<Format>` + Java UserTask + bpmn `<bpmn2:task>`/`<bpmn2:userTask>` + Mapper `<select id>`) 로 매핑. |
| 화면 성격 | 부모 화면(MasterRuleFrame)에서 호출되는 모달 등록 팝업. 업무기준(RULE)에 등록할 컬럼 리스트를 조회·편집 후 `save` 액션으로 TB_MCA_RULE_COL_LIST 전체 재등록 (DELETE 후 INSERT). |
| As-Is DB | Oracle (`ALL_TAB_COLUMNS` / `ALL_COL_COMMENTS` 메타 딕셔너리 + `DECODE()` + `OWNER='MCA_SOURCE'` 스키마). |
| To-Be DB | MSSQL (§11 변환점 명시) — Oracle 메타 딕셔너리 조회는 MSSQL `INFORMATION_SCHEMA` / `sys.*` 로 변환 필요 (§11). |
| 정합체크 §D.4 Runner | ✗ (Runner 미실행 — 본 환경 mui 미지원). |
| 부모 연동 | 부모 MasterRuleFrame.xfdl 의 `div_search_div_search1_btn_ruleCol_onclick` (MasterRuleFrame.xfdl:424-437) 가 `gfn_openPopup` 으로 본 팝업 호출. 전달 파라미터 `{ sRuleId, sRuleNm }` (MasterRuleFrame.xfdl:431-434). 콜백 `fn_returnColListPopupCallBack` (MasterRuleFrame.xfdl:439-441) 은 `fn_search()` 만 호출 (반환값 미소비). |

---

## 1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면명 | 업무기준 컬럼 리스트 등록 팝업 |
| 화면 식별자 (screenId) | masterRuleFrameColListPopup |
| As-Is 식별자 (asIsId) | MasterRuleFrameColListPopup |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | cmb (한글명 **"업무기준 관리(원장)"**) |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 컬럼 리스트 등록 팝업 (masterRuleFrameColListPopup) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase) |
| pageName | masterRuleFrameColListPopup |
| pageId | masterRuleFrameColListPopup |
| serviceId | masterRuleFrameColListPopup |
| Frontend 파일명 | masterRuleFrameColListPopup.tsx |
| 분석 일자 | 2026-06-04 |

**화면 목적** (R-12 Tier 5 패턴):

> 업무기준 컬럼 리스트 등록 팝업은 MasterRuleFrameColListPopup 의 조회, 등록을 수행한다.

**호출 컨텍스트** (부모 MasterRuleFrame 에서 `gfn_openPopup` 호출 → 본 팝업이 `gfn_popupClose()` 로 닫힘):

| 항목 | 값 | 근거 |
|---|---|---|
| 호출 방식 | `gfn_openPopup("modal", "업무기준 컬럼 등록", "cmb::MasterRuleFrameColListPopup.xfdl", oArg, "", "fn_returnColListPopupCallBack")` | MasterRuleFrame.xfdl:436 |
| 호출 트리거 | 부모 "기초데이터 등록 버튼" `btn_ruleCol` 클릭 (`div_search_div_search1_btn_ruleCol_onclick`) — 부모 `edt_ruleId.value` 미입력 시 `alert("업무기준 선택 후 진행해주세요.")` 후 중단 | MasterRuleFrame.xfdl:424-429 |
| 입력 파라미터 (필수) | `sRuleId` (부모 `edt_ruleId.value` = 업무기준 ID) | MasterRuleFrame.xfdl:432 / MasterRuleFrameColListPopup.xfdl:182 |
| 입력 파라미터 (필수) | `sRuleNm` (부모 `edt_ruleNm.value` = 업무기준명, UI 표시용 read-only) | MasterRuleFrame.xfdl:433 / MasterRuleFrameColListPopup.xfdl:183 |
| 본 화면 onload 파라미터 수신 | `this.gfn_Data_Return("sRuleId", this.name)` / `this.gfn_Data_Return("sRuleNm", this.name)` | MasterRuleFrameColListPopup.xfdl:182-183 |
| 반환값 | 없음 (`gfn_popupClose()` 인자 없이 호출 — Script:321) → 부모 콜백 `fn_returnColListPopupCallBack` 은 `fn_search()` 만 실행 | MasterRuleFrameColListPopup.xfdl:321 / MasterRuleFrame.xfdl:439-441 |

---

## 2. 자료 수집 인벤토리

| # | 자료 구분 | 경로/파일 | 확인 (Y/N) | 분석에 사용 | 미확인 시 영향 |
|---:|---|---|---|---|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleFrameColListPopup.xfdl (342 lines) | Y | §3 컴포넌트 전수 + §4 액션 + §10 LoV | - |
| 2 | Java UserTask (저장) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleFrameColListPopup\SaveMasterRuleBaseColList.java | Y | §7 Java 트랜잭션 + §5 로직 + §8 매핑 | - |
| 3 | Mapper.xml (SQL) | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleFrameColListPopupMapper.xml | Y | §6 SQL ID 매트릭스 + §9 사용 테이블 | - |
| 4 | bpmn (서비스) | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleFrameColListPopup.bpmn | Y | §8 워크플로우 전수 | - |
| 5 | 부모 화면 (호출 출처) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleFrame.xfdl (24909 bytes) | Y | §1 호출 컨텍스트 + §5.3 P-NNN 역참조 | - |
| 6 | DMES 테이블 정의서 | docs\external\DMES\DMES-SECTION-MCA_테이블정의서.xlsx | Y | §7 / §9 — **TB_MCA_RULE_COL_LIST 등재 확인** (MCAAPUSER, sheet134 — 공통감사 17 + 업무 12 = 29 컬럼). 정본 카탈로그 = DMES-SECTION-MCA (이전 DMES-SECTION-MCM 참조는 오참조 — 본 테이블은 MCA 정의서 소관). 참조 TB_MCA_RULE_MASTER = sheet135 (masterRuleList §7 정합) | - |
| 7 | To-Be 기존 엔티티 | src\backend\mcm-core\src\main\java\com\dongkuk\dmes\mcm\entity\ | Y (전수 ls) | §7 — 동일 테이블(TB_MCA_RULE_COL_LIST)을 사용하는 형제 화면 masterRuleFrame §7 이 To-Be Entity `MasterRuleColList` / Repository `MasterRuleColListRepository` 를 이미 확정 → 동일 엔티티 재사용 (mcm 평탄 패키지) | - |

---

## 3. UI 컴포넌트 전수 (xfdl)

### 3.1 영역 구성 (Form `<Form id="MasterRuleFrameColListPopup" width="1260" height="630" titletext="업무기준 구조 등록 팝업" onload="MasterRuleFrameColListPopup_onload">` — MasterRuleFrameColListPopup.xfdl:3)

| 영역 ID | 영역명 | xfdl 컴포넌트 | 위치 | 근거 |
|---|---|---|---|---|
| A-TITLE | 타이틀 | `<Div id="div_title">` + `<Edit id="edt_title" value="업무기준 구조 등록 팝업" cssclass="edi_WFHD_Title">` | left=20 top=0 right=20 height=50 | MasterRuleFrameColListPopup.xfdl:59-71 |
| A-TOPMENU | 공통 상단 버튼 영역 | `<Div id="div_topMenu" url="_com_div::commonTopButton.xfdl">` (btn_save / btn_close 주입) | right=0 width=270 height=23 bottom=10 | MasterRuleFrameColListPopup.xfdl:63-68 / Script:198-207 |
| A-FILTER | 업무기준 표시 영역 (read-only) | `<Div id="div_search" cssclass="div_WFSA_Box">` (`<Static>` + `<Edit>` × 2 read-only) | left=20 top=50 right=20 height=43 | MasterRuleFrameColListPopup.xfdl:73-82 |
| A-FOLD | 조회조건 접기/펴기 버튼 | `<Button id="btn_fold" cssclass="btn_WFSA_Fold">` | top=93 left=20 right=20 height=15 | MasterRuleFrameColListPopup.xfdl:6 |
| A-GRID | 컬럼 리스트 그리드 영역 | `<Div id="div_main">` 내부 `<Grid id="grd_main" binddataset="ds_grdRuleCol">` | left=20 top=btn_fold:5 right=20 bottom=30 | MasterRuleFrameColListPopup.xfdl:7-58 |
| A-FOOTER | 하단 공통 영역 | `<Div id="div_bottom" url="_com_div::commonBottomStatus.xfdl" cssclass="div_WF_Footer">` | bottom=0 height=20 | MasterRuleFrameColListPopup.xfdl:72 |

### 3.2 조회조건/표시 전수 목록 (S-NNN)

xfdl `<Div id="div_search">` 내부 컴포넌트 (좌표 X 순 정렬, Y 동일 시 X 오름차순). 본 팝업의 div_search 는 **검색 입력이 아니라 부모에서 전달받은 업무기준 ID/명을 표시하는 read-only 영역** (Mapper 전송 ✗):

| ID | 화면 표시명 (출처) | xfdl 컨트롤명 | xfdl type | 좌표 (X / Y / W / H) | Mapper 파라미터 | 기본값 (xfdl) | 동적 기본값 (xfdl Script) | 필수 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | 업무기준 (출처: `<Static>` text) | stc_ruldId | Static (라벨) | left=0 top=10 W=60 H=20 | (UI 전용 — 라벨) | text="업무기준" | - | - | MasterRuleFrameColListPopup.xfdl:76 |
| S-002 | 업무기준 ID 표시값 | edt_MasterRuleId | Edit (readonly="true") | left=stc_ruldId:5 top=10 W=80 H=20 | (Mapper 전송 ✗ — 표시 전용) | text="결함 코드" | `sRuleId` 호출 시 `set_value` (Script:185-187) | - | MasterRuleFrameColListPopup.xfdl:77 / Script:185-187 |
| S-003 | 업무기준명 (출처: `<Static>` text) | stc_ruleNM | Static (라벨) | left=edt_MasterRuleId:10 top=10 W=75 H=20 | (UI 전용 — 라벨) | text="업무기준명" | - | - | MasterRuleFrameColListPopup.xfdl:78 |
| S-004 | 업무기준명 표시값 | edt_MasterRuleNm | Edit (readonly="true") | left=stc_ruleNM:5 top=10 W=300 H=20 | (Mapper 전송 ✗ — 표시 전용) | text="결함 코드" | `sRuleNm` 호출 시 `set_value` (Script:188-190) | - | MasterRuleFrameColListPopup.xfdl:79 / Script:188-190 |

> **주의 (As-Is 보존)**: `edt_MasterRuleId` 의 set_value 분기 조건이 `if( !this.gfn_isNull(this.sRuleId) )` (Script:185), `edt_MasterRuleNm` 의 set_value 분기 조건도 동일하게 `if( !this.gfn_isNull(this.sRuleId) )` (Script:188 — `sRuleNm` 이 아닌 `sRuleId` 로 판정. As-Is 코드 그대로 보존). Mapper 조회 파라미터(`fn_search`)는 `pRuleId`(=sRuleId) + `pTable`(="TB_MCA_"+sRuleId) 만 전송 (Script:226-227) — div_search 의 4 컴포넌트는 검색 조건이 아니라 표시 전용.

### 3.3 결과 그리드 G-NNN (`<Grid id="grd_main" binddataset="ds_grdRuleCol">` Format 전수)

`<Format id="default">` (MasterRuleFrameColListPopup.xfdl:10-55). `<Columns>` 9 컬럼 + `<Rows>` (head 2행 + body 1행) + `<Band id="head">` (rowspan/colspan 병합) + `<Band id="body">`:

**Format `<Columns>` 9 컬럼 (size)** — MasterRuleFrameColListPopup.xfdl:14-22:

| Grid 컬럼 # | size | Head 그룹 (colspan/rowspan) | Head Cell text | Body Cell bind / expr | bind 표현 | displaytype / edittype | edit 속성 | combo dataset | Mapper SELECT alias | 근거 |
|---:|---:|---|---|---|---|---|---|---|---|---|
| 0 | 30 | "순번" (rowspan=2) | 순번 | `expr:currow + 1` | (UI 산출 — DB 비대응) | - | - | - | (UI 자동 번호) | xfdl:14,30,43 |
| 1 | 135 | "영문항목명" (rowspan=2) | 영문항목명 | `bind:COL_ID` | COL_ID | text / text | editmaxlength=30 | - | COL_ID | xfdl:15,31,44 / Mapper:11 |
| 2 | 127 | "한글항목명" (rowspan=2) | 한글항목명 | `bind:COL_NM` | COL_NM | text / text | editmaxlength=100 | - | COL_NM | xfdl:16,32,45 / Mapper:12 |
| 3 | 30 | "IN/OUT" (col3 colspan=2) → row1 "선택" | 선택 | `bind:CHK` | CHK | checkboxcontrol / checkbox | - | - | (UI 전용 — 일괄선택 체크) | xfdl:17,33,36,46 |
| 4 | 60 | "IN/OUT" (col3 colspan=2) → row1 combo | (combocontrol head) | `bind:IO_FLAG` | IO_FLAG | combocontrol / combo | combocodecol=CODE_VAL combodatacol=CODE_VAL_MEAN | ds_inOut | IO_FLAG | xfdl:18,33,37,47 / Mapper:16 |
| 5 | 63 | "코드여부" (rowspan=2) | 코드여부 | `bind:MASTER_CODE_DIV` | MASTER_CODE_DIV | combocontrol / combo | combocodecol=CODE_VAL combodatacol=CODE_VAL_MEAN | ds_div | MASTER_CODE_DIV | xfdl:19,34,48 / Mapper:17 |
| 6 | 88 | "컬럼속성" (col6 colspan=3) → row1 "유형" | 유형 | `bind:COL_TYPE` | COL_TYPE | combocontrol / combo | combocodecol=CODE_VAL combodatacol=CODE_VAL_MEAN | ds_colType | COL_TYPE | xfdl:20,35,38,49 / Mapper:13 |
| 7 | 69 | "컬럼속성" (col6 colspan=3) → row1 "총길이" | 총길이 | `bind:COL_LEN` | COL_LEN | mask / mask | editmaxlength=5 maskeditformat="##,##9" maskeditlimitbymask=integer | - | COL_LEN | xfdl:21,35,39,50 / Mapper:14 |
| 8 | 72 | "컬럼속성" (col6 colspan=3) → row1 "소수점길이" | 소수점길이 | `bind:COL_PREC_LEN` | COL_PREC_LEN | mask / mask | editmaxlength=5 maskeditformat="##,##9" maskeditlimitbymask=integer | - | COL_PREC_LEN | xfdl:22,35,40,51 / Mapper:15 |

**Head Band 병합 구조 전수** (MasterRuleFrameColListPopup.xfdl:29-41):
- `<Cell rowspan="2" text="순번">` (col0) / `<Cell col="1" rowspan="2" text="영문항목명">` / `<Cell col="2" rowspan="2" text="한글항목명">`
- `<Cell col="3" colspan="2" text="IN/OUT">` → row1 분할: `<Cell row="1" col="3" text="선택">` / `<Cell row="1" col="4" displaytype="combocontrol" edittype="combo">` (헤더 콤보 — 일괄 IN/OUT 적용용)
- `<Cell col="5" rowspan="2" text="코드여부">`
- `<Cell col="6" colspan="3" text="컬럼속성">` → row1 분할: `<Cell row="1" col="6" text="유형">` / `<Cell row="1" col="7" text="총길이">` / `<Cell row="1" col="8" text="소수점길이">`

**그리드 속성** (MasterRuleFrameColListPopup.xfdl:10):
- `binddataset="ds_grdRuleCol"` / `autofittype="col"` / `selecttype="multiarea"` / `autosizingtype="none"`
- `cellmovingtype="col"` / `cellsizingtype="col"`
- 헤더 col4 combocontrol → `fn_comboCallBackInOut` (Script:209-217) 로 CHK=1 행 일괄 IO_FLAG 설정 (Script:194 `gfn_comboCreate` 로 ds_inOut 연결)

### 3.4 ds_grdRuleCol Dataset ColumnInfo 전수 (xfdl Objects — MasterRuleFrameColListPopup.xfdl:86-102)

| Dataset 컬럼 ID | type | size | Grid 노출 (G 컬럼 #) | Mapper SELECT 노출 | Java INSERT 노출 | 비고 |
|---|---|---:|---:|---|---|---|
| RULE_ID | STRING | 256 | (비노출) | Y (Mapper:10 — `#{pRuleId}` AS RULE_ID) | Y (Java:41 — context.get("pRuleId")) | 업무기준 ID |
| COL_SEQ | STRING | 256 | (비노출) | (SELECT 미노출 — Mapper:43 주석 RULE_SEQ 제외) | Y (Java:43 — `++cnt` 순번) | 항목 순서 (Java 가 1부터 재채번) |
| COL_ID | STRING | 256 | 1 | Y | Y (Java:44) | 영문항목명 |
| COL_NM | STRING | 256 | 2 | Y | Y (Java:45) | 한글항목명 |
| COL_LEN | STRING | 256 | 7 | Y (Mapper:14) | Y (Java:49) | 총길이 |
| MES_COL_ID | STRING | 256 | (비노출) | (미노출) | (주석 — Java:51 `//mapInsert.put("MES_COL_ID"...)`) | MES 테이블 항목명 (As-Is 주석 보존) |
| MASTER_CODE_DIV | STRING | 256 | 5 | Y (Mapper:17 — 'N' default) | Y (Java:52) | 마스터코드 여부 (코드여부) |
| COL_PREC_LEN | STRING | 256 | 8 | Y (Mapper:15) | Y (Java:50) | 소수점 길이 |
| IO_FLAG | STRING | 256 | 4 | Y (Mapper:16 — 'OUT' default) | Y (Java:47) | IN/OUT 여부 |
| COL_TYPE | STRING | 256 | 6 | Y (Mapper:13 — DECODE) | Y (Java:48) | 항목 형식 (유형) |
| OLD_COL_ID | STRING | 256 | (비노출) | (미노출) | (주석 — Java:46 `//mapInsert.put("OLD_COL_ID"...)`) | 기존항목 ID (As-Is 주석 보존) |
| RULE_VER | STRING | 256 | (비노출) | Y (Mapper:9 — '1' AS RULE_VER) | Y (Java:42 — "1" 고정) | RULE VER. (고정값 1) |
| CHK | STRING | 256 | 3 | (미노출 — UI 전용) | (미노출) | 일괄 IN/OUT 적용 대상 체크 (Script:212) |

### 3.5 부속 Dataset (Combo innerdataset — xfdl Objects)

| Dataset ID | 컬럼 | 행 (CODE_VAL / CODE_VAL_MEAN) | 사용 위치 (G 컬럼) | 근거 |
|---|---|---|---|---|
| ds_div | CODE_VAL / CODE_VAL_MEAN | N/N, Y/Y | G-005 (코드여부 MASTER_CODE_DIV) | xfdl:103-118 |
| ds_colType | CODE_VAL / CODE_VAL_MEAN | DATE/DATE, NUMBER/NUMBER, VARCHAR2/VARCHAR2 | G-006 (유형 COL_TYPE) | xfdl:119-138 |
| ds_inOut | CODE_VAL / CODE_VAL_MEAN | (공백)/선택, IN/IN, OUT/OUT | G-004 (IO_FLAG) + 헤더 col4 일괄 combo | xfdl:139-158 |

---

## 4. 버튼·액션 (B-NNN / GB-NNN)

### 4.1 B-NNN 버튼 전수 (xfdl Script + commonTopButton 주입)

`fn_button()` 에서 `commonTopButton.xfdl` 에 2 표준 버튼 array 주입 — MasterRuleFrameColListPopup.xfdl:203-206:

```
new Array(["btn_save"],["btn_close"])
```

| ID | 버튼명 (출처) | xfdl 컨트롤명 | xfdl 핸들러 함수 | 동작 유형 (7 enum) | To-Be action (7 enum) | BPMN sourceFlow name | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | 등록 (commonTop btn_save) | btn_save (commonTop 주입) | `fn_save` (Script:235-303) | 저장 | save | `save` (SequenceFlow_1ul62kh) | xfdl:205 / Script:235-303 / MasterRuleFrameColListPopup.bpmn:47 |
| B-002 | 닫기 (commonTop btn_close) | btn_close (commonTop 주입) | `fn_close` (Script:330-332) | 연계 (popupClose) | popup | (BPMN 미존재 — 클라이언트 only) | xfdl:205 / Script:330-332 |
| B-003 | 조회조건 접기/펴기 | btn_fold | `btn_fold_onclick` (Script:335-338) | 연계 (gfn_fold) | popup | (BPMN 미존재 — 클라이언트 only) | xfdl:6 / Script:335-338 |

> **참고**: As-Is fn_save 의 To-Be action 핸들러 매핑 — 사용자 메시지 확인(`gfn_message confirm` Script:302) 후 `save` 트랜잭션 호출. 단, `fn_save` 의 sOutDatasets 는 `ds_grdDownload=ds_GetRuleDataUploadList` (Script:294) 를 지정하나, Java(SaveMasterRuleBaseColList) 는 `cnt_save` 만 context 적재 (Java:64) 하고 `ds_GetRuleDataUploadList` 를 생성하지 않음 → 반환 dataset 불일치 (As-Is 보존, §13 Q-002).

### 4.2 GB-NNN 그리드셀 인라인 버튼

해당 없음 (xfdl Grid Body Cell 에 ButtonField / IconField 없음 — 모든 body cell 이 text/combo/mask/checkbox edittype — MasterRuleFrameColListPopup.xfdl:42-52).

### 4.3 그리드 셀 이벤트 / 콤보 콜백 (B-NNN 외 별도 등재)

| ID | 이벤트 위치 | 트리거 | 핸들러 함수 | 동작 | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| E-001 | grd_main 헤더 col4 combocontrol | 헤더 IN/OUT 콤보 선택 | `fn_comboCallBackInOut` (Script:209-217) | CHK=1 인 모든 행에 선택한 IO_FLAG 일괄 setColumn | (UI only — 클라이언트 일괄 편집) | xfdl:37 / Script:194,209-217 |

---

## 5. As-Is 소스 로직 분석

### 5.1 xfdl Script 함수 전수 (D1 — 본 화면)

| # | 함수 | 트리거 | 핵심 로직 | 호출 대상 | 검증 (V-NNN) | 부수효과 | 근거 |
|---:|---|---|---|---|---|---|---|
| 1 | MasterRuleFrameColListPopup_onload | onload | gfn_formOnLoad → fn_button → sRuleId/sRuleNm 수신 (gfn_Data_Return) → edt 표시 set_value → fn_search → gfn_comboCreate(ds_inOut, fn_comboCallBackInOut) | fn_button / fn_search / gfn_comboCreate | - | div_search 표시값 세팅 | Script:176-195 |
| 2 | fn_button | onload 내부 | commonTopButton 에 `[btn_save][btn_close]` 2 버튼 주입 | div_topMenu.fn_commonTop_onload | - | 상단 버튼 생성 | Script:198-207 |
| 3 | fn_comboCallBackInOut | 헤더 IN/OUT 콤보 변경 (E-001) | ds_grdRuleCol 전 행 순회 → CHK==1 인 행에 IO_FLAG = code 일괄 적용 | (없음 — 클라이언트) | - | ds_grdRuleCol 일괄 수정 | Script:209-217 |
| 4 | fn_search | onload 자동 호출 | ds_grdRuleCol.clearData → svc "search" 호출 (pRuleId=sRuleId, pTable="TB_MCA_"+sRuleId) → outDataset ds_grdRuleCol | gfn_transaction("search") | - | 그리드 로드 | Script:219-231 |
| 5 | fn_save | B-001 등록 클릭 | V-001~V-006 검증 → gfn_message confirm → 확인 시 svc "save" 호출 | gfn_message / gfn_transaction("save") | V-001~V-006 | TB_MCA_RULE_COL_LIST 재등록 | Script:235-303 |
| 6 | fn_callBack | svc 응답 (search/save) | search: 건수 bottom 메시지 + gfn_comboCreate / save: 성공 시 gfn_popupClose, 실패 시 bottom 메시지 | gfn_popupClose / gfn_commonBottomStatus_msg | - | 팝업 닫기 (save 성공) | Script:306-327 |
| 7 | fn_close | B-002 닫기 클릭 | gfn_popupClose() | gfn_popupClose | - | 팝업 닫기 | Script:330-332 |
| 8 | btn_fold_onclick | B-003 접기 클릭 | gfn_fold(this, div_search, div_main, btn_fold) | gfn_fold | - | div_search 토글 | Script:335-338 |

### 5.2 fn_save 검증 로직 전수 (V-NNN — Script:235-303)

| ID | 검증 내용 | 조건 | 메시지 | 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | IN 조건 컬럼 존재 | `ds_grdRuleCol.findRow("IO_FLAG", "IN") < 0` | "IN 조건을 포함한 컬럼이 없습니다. 확인해주세요." | return false | Script:237-240 |
| V-002 | OUT 조건 컬럼 존재 | `ds_grdRuleCol.findRow("IO_FLAG", "OUT") < 0` | "OUT 조건을 포함한 컬럼이 없습니다. 확인해주세요." | return false | Script:242-245 |
| V-003 | 한글항목명 필수 (행별) | `gfn_isNull(COL_NM)` | "한글항목명을 입력해 주십시오." | 해당 행 포커스 + setCellPos(COL_NM) + return | Script:248-254 |
| V-004 | 영문항목명 필수 (행별) | `gfn_isNull(COL_ID)` | "영문항목명을 입력해 주십시오." | 해당 행 포커스 + setCellPos(COL_ID) + return | Script:256-262 |
| V-005 | 코드여부 필수 (행별) | `gfn_isNull(MASTER_CODE_DIV)` | "코드여부를 선택해 주십시오." | 해당 행 포커스 + setCellPos(MASTER_CODE_DIV) + return | Script:264-270 |
| V-006 | 유형 필수 (행별) | `gfn_isNull(COL_TYPE)` | "유형을 선택해 주십시오." | 해당 행 포커스 + setCellPos(COL_TYPE) + return | Script:272-278 |
| V-007 | 총길이 필수 (행별) | `gfn_isNull(COL_LEN)` | "총길이를 입력해 주십시오." | 해당 행 포커스 + setCellPos(COL_LEN) + return | Script:280-286 |
| XV-001 | 저장 확인 (사용자 컨펌) | confirm | "저장하시면 기존에 있던 컬럼정보들은 모두 삭제됩니다.\n저장하시겠습니까?" | 확인 시 svc "save" 호출 | Script:289-302 |

### 5.3 Java 트랜잭션 로직 전수 (SaveMasterRuleBaseColList.java — D1 저장 핸들러)

| # | 단계 | 로직 | SQL ID | 근거 |
|---:|---|---|---|---|
| 1 | 입력 수신 | `ds_grdRuleCol` = (List<Map>)context.get("ds_grdRuleCol") | - | Java:24 |
| 2 | 기존 구조 삭제 | mapDelete: pRuleId + MYBATIS_WHERE="RULE_ID = #{pRuleId}" → `dao.delete("TB_MCA_RULE_COL_LIST_Mapper.delete", mapDelete)` | TB_MCA_RULE_COL_LIST_Mapper.delete (외부 공통 Mapper) | Java:32-35 |
| 3 | 수정 구조 생성 (loop) | ds_grdRuleCol 각 행 → mapInsert (RULE_ID / RULE_VER="1" / COL_SEQ=++cnt / COL_ID / COL_NM / IO_FLAG / COL_TYPE / COL_LEN / COL_PREC_LEN / MASTER_CODE_DIV) → `dao.insert("TB_MCA_RULE_COL_LIST_Mapper.insert", mapInsert)` | TB_MCA_RULE_COL_LIST_Mapper.insert (외부 공통 Mapper) | Java:38-61 |
| 4 | INSERT 실패 처리 | insert 반환 ≤ 0 시 `throw new Exception("SaveMasterRuleColList IN 신규등록 에러발생")` | - | Java:57-60 |
| 5 | 결과 적재 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` | - | Java:64 |
| 6 | 예외 처리 | catch Exception → log.error + `throw new IllegalTaskException(e)` | - | Java:66-70 |

**주석 보존 (As-Is)**: Java:46 `//mapInsert.put("OLD_COL_ID"...)` / Java:51 `//mapInsert.put("MES_COL_ID"...)` — 주석 처리됨, INSERT 비포함.

### 5.4 이벤트 12종 매트릭스 (WinForms 전제 — mui 등가물 ✗)

해당 없음 (mui xfdl 은 WinForms 이벤트 모델 ✗). mui 등가 이벤트는 §4.1 (commonTop 버튼) + §4.3 (E-001 콤보 콜백) + §5.1 (Script 함수) 로 전수 등재.

### 5.5 SP 분기 매트릭스 (@Case SP — mui 등가물 ✗)

해당 없음 (As-Is 는 @Case 분기 SP 미사용). mui 등가 = §6 Mapper SQL ID 매트릭스 + Java UserTask DELETE/INSERT (외부 공통 Mapper).

---

## 6. SQL ID 매트릭스 (Mapper.xml `<select>` + Java DAO 호출 전수)

Mapper 파일 : `mui/src/main/resources/persistence/mappers-cmb/MasterRuleFrameColListPopupMapper.xml`, namespace = `MasterRuleFrameColListPopupMapper`.

| SQL ID | namespace | 유형 | 입력 파라미터 | 사용 테이블/뷰 | 핵심 절 | 호출 주체 | 근거 |
|---|---|---|---|---|---|---|---|
| GetRuleColList | MasterRuleFrameColListPopupMapper | select | `pRuleId` (SELECT 상수), `pTable` (`AND COL.TABLE_NAME = #{pTable}`) | `ALL_TAB_COLUMNS COL`, `ALL_COL_COMMENTS COM` (Oracle 메타 딕셔너리) | SELECT 8 컬럼 + 4 JOIN 조건 + `OWNER='MCA_SOURCE'` + COLUMN_NAME NOT IN (16 audit/rule 컬럼) | BPMN GetRuleColList (CommonSelectTask, search 분기) | Mapper:7-45 / bpmn:21-34 |
| TB_MCA_RULE_COL_LIST_Mapper.delete | TB_MCA_RULE_COL_LIST_Mapper (외부 공통) | delete | pRuleId + MYBATIS_WHERE="RULE_ID = #{pRuleId}" | TB_MCA_RULE_COL_LIST | DELETE WHERE RULE_ID = #{pRuleId} | Java SaveMasterRuleBaseColList | Java:35 |
| TB_MCA_RULE_COL_LIST_Mapper.insert | TB_MCA_RULE_COL_LIST_Mapper (외부 공통) | insert | RULE_ID/RULE_VER/COL_SEQ/COL_ID/COL_NM/IO_FLAG/COL_TYPE/COL_LEN/COL_PREC_LEN/MASTER_CODE_DIV | TB_MCA_RULE_COL_LIST | INSERT (행별) | Java SaveMasterRuleBaseColList | Java:55 |

**GetRuleColList SELECT 절 컬럼 분해** (Mapper:8-17):

| SELECT 위치 | 표현식 | alias | 비고 |
|---|---|---|---|
| Mapper:9 | `'1'` | RULE_VER | 고정값 1 |
| Mapper:10 | `#{pRuleId}` | RULE_ID | 파라미터 바인딩 상수 |
| Mapper:11 | `COL.COLUMN_NAME` | COL_ID | 메타 딕셔너리 컬럼명 = 영문항목명 |
| Mapper:12 | `COM.COMMENTS` | COL_NM | 컬럼 코멘트 = 한글항목명 |
| Mapper:13 | `DECODE(COL.DATA_TYPE, 'VARCHAR', 'VARCHAR2', COL.DATA_TYPE)` | COL_TYPE | VARCHAR→VARCHAR2 치환 |
| Mapper:14 | `DATA_LENGTH` | COL_LEN | 총길이 |
| Mapper:15 | `DATA_PRECISION` | COL_PREC_LEN | 소수점 길이 |
| Mapper:16 | `'OUT'` | IO_FLAG | 기본 OUT |
| Mapper:17 | `'N'` | MASTER_CODE_DIV | 기본 N (코드여부 아님) |

**GetRuleColList WHERE/JOIN 절 전수** (Mapper:18-44):

| 위치 | 조건 |
|---|---|
| Mapper:19 | `COL.TABLE_NAME = COM.TABLE_NAME` (JOIN) |
| Mapper:20 | `AND COL.OWNER = COM.OWNER` (JOIN) |
| Mapper:21 | `AND COL.COLUMN_NAME = COM.COLUMN_NAME` (JOIN) |
| Mapper:22 | `AND COL.TABLE_NAME = #{pTable}` (= "TB_MCA_"+sRuleId) |
| Mapper:23 | `AND COL.OWNER = 'MCA_SOURCE'` |
| Mapper:24-44 | `AND COL.COLUMN_NAME NOT IN (...)` — 16 컬럼 제외: CREATED_OBJECT_TYPE, CREATED_OBJECT_ID, CREATED_PROGRAM_ID, CREATION_TIMESTAMP, LAST_UPDATED_OBJECT_TYPE, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_PROGRAM_ID, LAST_UPDATE_TIMESTAMP, DATA_END_STATUS, DATA_END_OBJECT_TYPE, DATA_END_OBJECT_ID, DATA_END_PROGRAM_ID, DATA_END_TIMESTAMP, ARCHIVE_COMPLETED_FLAG, ARCHIVED_EMPLOYEE_NUM, ARCHIVED_TIMESTAMP, ARCHIVE_PROGRAM_ID, RULE_VER, RULE_SEQ (총 19 nested 식별자 — audit 17 + RULE_VER + RULE_SEQ) |

> **정정**: Mapper:24-44 의 NOT IN 목록은 실제 19 식별자 (audit 17 + RULE_VER + RULE_SEQ). 본문 "16" 표기는 audit 그룹 기준 약식 — 정본은 19 식별자 (Mapper:25-43 전수).

**ORDER BY**: 없음 (GetRuleColList 에 ORDER BY 절 미존재 — Mapper:7-45).

---

## 7. Java 트랜잭션 + To-Be 테이블/Entity 분석

### 7.1 Java 트랜잭션 클래스 (존재 — search 외 save 핸들러)

| 구분 | 결과 |
|---|---|
| Java 클래스 존재 여부 | Y (저장 액션만 — `SaveMasterRuleBaseColList implements Wow`) |
| search 액션 Java | ✗ (BPMN GetRuleColList = CommonSelectTask 공통 클래스) |
| save 액션 Java | `SaveMasterRuleBaseColList` (TransactionalDao delete + insert loop) |
| BPMN class 속성 (save) | `#{basePackage}SaveMasterRuleBaseColList` (UserTask) |
| BPMN class 속성 (search) | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` |
| 근거 | Java:18 / bpmn:24,41 |

### 7.2 To-Be 테이블/Entity 분석 (TB_MCA_RULE_COL_LIST — DMES-SECTION-MCA sheet134 등재, Q-001 Resolved)

> **(Q-001 Resolved)** TB_MCA_RULE_COL_LIST 는 **DMES-SECTION-MCA_테이블정의서.xlsx sheet134 (MCAAPUSER 스키마)** 에 등재됨 — 공통감사 17 컬럼 + 업무 12 컬럼 = **29 컬럼** 카탈로그 확보. 또한 동일 테이블을 save 대상으로 사용하는 형제 화면 **masterRuleFrame §7** 이 To-Be Entity `com.dongkuk.dmes.mcm.entity.MasterRuleColList` / Repository `com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository` 를 이미 확정 (mcm 평탄 패키지) → **동일 테이블 = 동일 엔티티명 재사용**. 본 팝업의 save(`SaveMasterRuleBaseColList`)는 RULE_ID 기준 DELETE 후 INSERT loop 로 동일 테이블을 재등록하므로 컬럼 매핑이 1:1 정합한다.
>
> To-Be 정책 (masterRuleList·masterRuleFrame §7 정합): 스키마 owner = **MCAAPUSER** (As-Is `MCA_SOURCE` synonym → To-Be 보존). 공통감사 17 컬럼 → mcm-core **`McmAuditEntity`** 매핑 (C_* 4 + U_* 4 + VER 1 = 9 컬럼; DATA_END_* / ARCHIVE_* 그룹 9 컬럼은 To-Be 제거 — masterRuleList §9.2 정책 정합). Lombok 금지. PK = (RULE_ID, COL_SEQ) 복합 2키 — *2026-07-08 정정: 종전 "RULE_ID+RULE_VER+COL_SEQ" 표기는 오기(sheet134 KEY=RULE_ID PK1·COL_SEQ PK2, RULE_VER 는 일반 컬럼 — 형제 masterRuleFrame §9.1·구현 엔티티 MasterRuleColListId 정합, 사용자 확정)*.

**7.2.1 TB_MCA_RULE_COL_LIST 업무 12 컬럼 ↔ To-Be 매핑 (DMES-SECTION-MCA sheet134 정본)**:

| # | DMES 컬럼 (SNAKE) | Type / 길이 | 한글명 | To-Be 필드 (camelCase) | As-Is 출처 / 값 | save INSERT | 근거 |
|---:|---|---|---|---|---|---|---|
| 1 | RULE_VER | NUMBER(8,2) | RULE VER. | ruleVer | RULE_VER = "1" (고정) | Y | sheet134 / Java:42 |
| 2 | RULE_ID | VARCHAR(10) | 업무기준ID | ruleId | RULE_ID (context.get("pRuleId")) | Y (PK) | sheet134 / Java:41 |
| 3 | COL_SEQ | NUMBER(3) | 항목순서 | colSeq | COL_SEQ = ++cnt (1부터 재채번) | Y (PK) | sheet134 / Java:43 |
| 4 | COL_ID | VARCHAR(30) | 항목ID | colId | COL_ID (영문항목명) | Y | sheet134 / Java:44 |
| 5 | COL_NM | VARCHAR(100) | 항목명 | colNm | COL_NM (한글항목명) | Y | sheet134 / Java:45 |
| 6 | OLD_COL_ID | VARCHAR(100) | 기존항목ID | oldColId | OLD_COL_ID (Java 주석 — 미INSERT) | N | sheet134 / Java:46 |
| 7 | IO_FLAG | VARCHAR(10) | IN/OUT여부 | ioFlag | IO_FLAG (IN/OUT) | Y | sheet134 / Java:47 |
| 8 | COL_TYPE | VARCHAR(10) | 항목형식 | colType | COL_TYPE (DATE/NUMBER/VARCHAR2) | Y | sheet134 / Java:48 |
| 9 | COL_LEN | NUMBER(5) | 항목길이 | colLen | COL_LEN (총길이) | Y | sheet134 / Java:49 |
| 10 | COL_PREC_LEN | NUMBER(5) | 항목소수점길이 | colPrecLen | COL_PREC_LEN (소수점 길이) | Y | sheet134 / Java:50 |
| 11 | MES_COL_ID | VARCHAR(50) | MES테이블항목명 | mesColId | MES_COL_ID (Java 주석 — 미INSERT) | N | sheet134 / Java:51 |
| 12 | MASTER_CODE_DIV | VARCHAR(2) | (코드여부) | masterCodeDiv | MASTER_CODE_DIV (Y/N) | Y | sheet134 / Java:52 |

> **PK = (RULE_ID, COL_SEQ) 복합 2키 — *2026-07-08 정정: 종전 "RULE_ID+RULE_VER+COL_SEQ" 표기는 오기(sheet134 KEY=RULE_ID PK1·COL_SEQ PK2, RULE_VER 는 일반 컬럼 — 형제 masterRuleFrame §9.1·구현 엔티티 MasterRuleColListId 정합, 사용자 확정)***. save 의 RULE_ID 기준 DELETE→INSERT loop 가 COL_SEQ 를 1부터 재채번하는 동작과 PK 정의 1:1 정합 (Java:43).
> **OLD_COL_ID / MES_COL_ID** 는 DMES sheet134 에 정의된 컬럼이나, As-Is save(`SaveMasterRuleBaseColList`)는 주석 처리하여 INSERT 비포함 (Java:46,51). To-Be Entity 에는 컬럼 보유, save INSERT 매핑은 As-Is 1:1 보존(미INSERT).

**7.2.2 공통감사 17 컬럼 (DMES-SECTION-MCA sheet134) ↔ mcm-core McmAuditEntity 매핑**:

| As-Is 감사 그룹 | DMES 컬럼 | To-Be |
|---|---|---|
| 그룹 1 (생성) | CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP | mcm-core `McmAuditEntity` C_* 4 컬럼 |
| 그룹 2 (최종변경) | LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP | mcm-core `McmAuditEntity` U_* 4 컬럼 |
| 그룹 3 (데이터종료) | DATA_END_STATUS / DATA_END_OBJECT_TYPE / DATA_END_OBJECT_ID / DATA_END_PROGRAM_ID / DATA_END_TIMESTAMP | To-Be 제거 (masterRuleList §9.2 정책 정합) |
| 그룹 4 (Archive) | ARCHIVE_COMPLETED_FLAG / ARCHIVED_EMPLOYEE_NUM / ARCHIVED_TIMESTAMP / ARCHIVE_PROGRAM_ID | To-Be 제거 (동일 정책) |

> 비고: As-Is RULE_VER 은 업무 버전(INSERT '1' 고정 — 업무 12 컬럼), mcm-core VER(@Version 낙관적 락)과 의미 별개 → 별개 컬럼 유지 (masterRuleList §9.1 정합).

---

## 8. BPMN 워크플로우 전수

파일: `mui/src/main/resources/services/cmb/MasterRuleFrameColListPopup.bpmn`, process id = `MasterRuleFrameColListPopup`, name = "업무기준 구조 등록 팝업", isExecutable=false (bpmn:3).

### 8.1 BPMN 노드 전수

| BPMN ID | 종류 | name | bpmn 속성 | 근거 |
|---|---|---|---|---|
| StartEvent_1 | startEvent | "Start Event" | outgoing=SequenceFlow_1 | bpmn:4-6 |
| ExclusiveGateway_1 | exclusiveGateway | (미지정) | gatewayDirection=Diverging, incoming=SequenceFlow_1, outgoing=SequenceFlow_0grwghu + SequenceFlow_1ul62kh | bpmn:11-18 |
| GetRuleColList | task (modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate`) | "컬럼 리스트 조회" | camunda properties (§8.3), incoming=SequenceFlow_0grwghu, outgoing=SequenceFlow_19mau2h | bpmn:21-34 |
| SaveMasterRuleBaseColList | userTask (modelerTemplate=`com.dongkuk.dmes.UserTask`) | "저장" | camunda properties (§8.4), incoming=SequenceFlow_1ul62kh, outgoing=SequenceFlow_184pcc9 | bpmn:36-46 |
| EndEvent_1 | endEvent | "End Event" | incoming=SequenceFlow_19mau2h + SequenceFlow_184pcc9 | bpmn:7-10 |

### 8.2 SequenceFlow 전수

| SequenceFlow ID | name | sourceRef | targetRef | 역할 | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | (미지정) | StartEvent_1 | ExclusiveGateway_1 | Start → Gateway | bpmn:19 |
| SequenceFlow_0grwghu | "search" | ExclusiveGateway_1 | GetRuleColList | Gateway → 조회 (action "search") | bpmn:20 |
| SequenceFlow_19mau2h | (미지정) | GetRuleColList | EndEvent_1 | 조회 → End | bpmn:35 |
| SequenceFlow_1ul62kh | "save" | ExclusiveGateway_1 | SaveMasterRuleBaseColList | Gateway → 저장 (action "save") | bpmn:47 |
| SequenceFlow_184pcc9 | (미지정) | SaveMasterRuleBaseColList | EndEvent_1 | 저장 → End | bpmn:48 |

### 8.3 GetRuleColList (컬럼 리스트 조회) camunda properties 전수 (bpmn:23-30)

| name | value | 역할 |
|---|---|---|
| class | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | 공통 SELECT 태스크 |
| paramKey | (빈 값) | 입력 dataset key |
| isServiceResult | `true` | 결과를 serviceResult 적재 |
| dao | (빈 값) | DAO 미지정 |
| sqlKey | `#{serviceId}Mapper.GetRuleColList` (실값 = `MasterRuleFrameColListPopupMapper.GetRuleColList`) | Mapper SQL ID 결합 |
| resultKey | `ds_grdRuleCol` | 결과 dataset key |

### 8.4 SaveMasterRuleBaseColList (저장) camunda properties 전수 (bpmn:38-42)

| name | value | 역할 |
|---|---|---|
| nextBranchSpel | (빈 값) | 다음 분기 SpEL |
| afterSpel | (빈 값) | 후처리 SpEL |
| class | `#{basePackage}SaveMasterRuleBaseColList` | 화면별 Java UserTask 클래스 |

### 8.5 BPMN ↔ xfdl ↔ Mapper/Java 정합

| xfdl `sSvcID` | BPMN SequenceFlow name | BPMN Task/UserTask | sqlKey / class | Mapper/Java |
|---|---|---|---|---|
| `"search"` (Script:222) | `"search"` (SequenceFlow_0grwghu) | GetRuleColList (CommonSelectTask) | `MasterRuleFrameColListPopupMapper.GetRuleColList` | Mapper GetRuleColList |
| `"save"` (Script:291) | `"save"` (SequenceFlow_1ul62kh) | SaveMasterRuleBaseColList (UserTask) | `#{basePackage}SaveMasterRuleBaseColList` | Java SaveMasterRuleBaseColList (TB_MCA_RULE_COL_LIST delete+insert) |

정합 ✓ (search / save 양 액션 1:1 일치).

### 8.6 ext:style (BPMN 시각화 — 분석 비대상이지만 보존)

| 노드 | 시각 속성 | 근거 |
|---|---|---|
| ExclusiveGateway_1 | shapeBackground=#ffff00, labelPosition=Center of Figure | bpmn:12-13 |
| GetRuleColList | bioc:stroke=#1E88E5, bioc:fill=#BBDEFB | bpmn:82 |
| SaveMasterRuleBaseColList | bioc:stroke=rgb(251,140,0), bioc:fill=rgb(255,224,178) | bpmn:89 |

---

## 9. 사용 테이블 / 뷰

### 9.1 ALL_TAB_COLUMNS / ALL_COL_COMMENTS (As-Is — Oracle 메타 딕셔너리, search)

| 항목 | 값 | 근거 |
|---|---|---|
| 종류 | Oracle 시스템 뷰 (메타 딕셔너리) | Mapper:18 |
| 용도 | `TB_MCA_{sRuleId}` 테이블(소스 테이블)의 실제 컬럼 정의 조회 → 컬럼 리스트 초기값 | Mapper:7-44 |
| 스키마 필터 | `COL.OWNER = 'MCA_SOURCE'` | Mapper:23 |
| 동적 테이블명 | `COL.TABLE_NAME = #{pTable}` (= "TB_MCA_"+sRuleId — Script:227) | Mapper:22 |
| To-Be 변환 | Oracle ALL_TAB_COLUMNS/ALL_COL_COMMENTS → MSSQL `INFORMATION_SCHEMA.COLUMNS` + `sys.extended_properties` (§11) | §11 |

### 9.2 TB_MCA_RULE_COL_LIST (As-Is — save 대상 테이블, DMES-SECTION-MCA sheet134 등재, Q-001 Resolved)

| 항목 | 값 | 근거 |
|---|---|---|
| 종류 | 테이블 (RULE_ID 기준 DELETE 후 INSERT 재등록) | Java:35,55 |
| owner / 스키마 | As-Is `MCA_SOURCE` synonym → To-Be **MCAAPUSER** 보존 (masterRuleList·masterRuleFrame §7 정합) | sheet134 / Java:35,55 |
| DMES Excel 등재 | ✓ (DMES-SECTION-MCA sheet134 — 공통감사 17 + 업무 12 = 29 컬럼) | DMES-SECTION-MCA 카탈로그 |
| To-Be 컬럼 | §7.2 (업무 12 컬럼 + 공통감사 17 → McmAuditEntity 9) | sheet134 / Java:41-52 |
| To-Be Entity / Repository | `com.dongkuk.dmes.mcm.entity.MasterRuleColList` / `com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository` (형제 masterRuleFrame §7 정합 — 동일 테이블 동일 엔티티) | §7.2 |
| To-Be PK | (RULE_ID, COL_SEQ) 복합 2키 (2026-07-08 오기 정정 — §7.2) | §7.2 |

### 9.3 사용 테이블 / 뷰 요약

| As-Is | 용도 | To-Be |
|---|---|---|
| ALL_TAB_COLUMNS / ALL_COL_COMMENTS (Oracle 메타) | search — 소스 테이블 컬럼 조회 | MSSQL INFORMATION_SCHEMA.COLUMNS + sys.extended_properties (§11) |
| TB_MCA_{sRuleId} (동적 소스 테이블) | search 대상 (메타 조회) | 보존 (동적 테이블명 — §11 메타 전환) |
| TB_MCA_RULE_COL_LIST | save 대상 (delete+insert) | To-Be Entity `MasterRuleColList` (DMES-SECTION-MCA sheet134 등재 — 형제 masterRuleFrame §7 정합) |

---

## 10. 코드값 / LoV

### 10.1 본 화면 자체 정의 LoV (xfdl innerdataset)

| ID (LV-NNN) | 코드 그룹 | 값 | 표시명 | 사용 위치 (G 컬럼) | 근거 |
|---|---|---|---|---|---|
| LV-001 | ds_div (코드여부) | N | N | G-005 (MASTER_CODE_DIV) | xfdl:109-116 |
| LV-001 | ds_div (코드여부) | Y | Y | G-005 | xfdl:113-116 |
| LV-002 | ds_colType (유형) | DATE | DATE | G-006 (COL_TYPE) | xfdl:125-128 |
| LV-002 | ds_colType (유형) | NUMBER | NUMBER | G-006 | xfdl:129-132 |
| LV-002 | ds_colType (유형) | VARCHAR2 | VARCHAR2 | G-006 | xfdl:133-136 |
| LV-003 | ds_inOut (IN/OUT) | (공백) | 선택 | G-004 (IO_FLAG) + 헤더 col4 일괄 | xfdl:145-148 |
| LV-003 | ds_inOut (IN/OUT) | IN | IN | G-004 | xfdl:149-152 |
| LV-003 | ds_inOut (IN/OUT) | OUT | OUT | G-004 | xfdl:153-156 |

---

## 11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

### 11.1 SQL 변환 항목

| # | As-Is (Oracle) | To-Be (MSSQL) | 위치 | 비고 |
|---|---|---|---|---|
| C-001 | `ALL_TAB_COLUMNS` / `ALL_COL_COMMENTS` (Oracle 메타 딕셔너리) | `INFORMATION_SCHEMA.COLUMNS` (컬럼 정의) + `sys.extended_properties` (컬럼 코멘트) | Mapper:18 | Oracle 메타 → MSSQL 메타 재작성 (COL_NM=코멘트 출처 변경) |
| C-002 | `DECODE(COL.DATA_TYPE, 'VARCHAR', 'VARCHAR2', COL.DATA_TYPE)` | `CASE WHEN DATA_TYPE='varchar' THEN 'VARCHAR2' ELSE DATA_TYPE END` | Mapper:13 | DECODE → CASE WHEN |
| C-003 | `DATA_LENGTH` / `DATA_PRECISION` (Oracle 컬럼) | MSSQL `CHARACTER_MAXIMUM_LENGTH` / `NUMERIC_PRECISION` (INFORMATION_SCHEMA.COLUMNS) | Mapper:14-15 | 컬럼명 변환 |
| C-004 | `COL.OWNER = 'MCA_SOURCE'` | `TABLE_SCHEMA = 'MCA_SOURCE'` (또는 To-Be 스키마) | Mapper:23 | OWNER → TABLE_SCHEMA |
| C-005 | TB_MCA_RULE_COL_LIST_Mapper.delete / insert (외부 공통 Mapper) | To-Be Repository.deleteByRuleId + saveAll (또는 동등 Mapper) | Java:35,55 | DELETE+INSERT 재등록 패턴 보존 |

### 11.2 영향 받는 Mapper / Java / BPMN

| 영향 위치 | 변경 필요 | 비고 |
|---|---|---|
| MasterRuleFrameColListPopupMapper.xml:13 | DECODE → CASE WHEN | MSSQL 문법 |
| MasterRuleFrameColListPopupMapper.xml:18-23 | ALL_TAB_COLUMNS/ALL_COL_COMMENTS → INFORMATION_SCHEMA + sys.extended_properties | 메타 딕셔너리 재작성 |
| SaveMasterRuleBaseColList.java | TransactionalDao delete+insert → To-Be Repository `MasterRuleColListRepository.deleteByRuleId(ruleId)` + `saveAll(rows)` (형제 masterRuleFrame §7 정합) | TB_MCA_RULE_COL_LIST To-Be Entity 확정 (§7.2) |
| MasterRuleFrameColListPopup.bpmn | (변경 불필요 — sqlKey / class 만 참조) | 식별자만 To-Be 변환 |

---

## 12. 결정 누적 / 미결정

> 활성 미결정 = **0 건**. Q-002(save 반환 dataset)는 **사용자 확정 2026-06-04 — As-Is 보존 + `savedCount`만 반환(미사용 dataset 제거)**. Q-001(테이블)은 DMES-SECTION-MCA sheet134 등재 + 형제 masterRuleFrame §7 엔티티 확정으로 Resolved. 영속성=JPA(cmb 공통). 그 외 항목은 본문 §3 / §5 / §6 / §7 / §11 에 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **부모 연동 파라미터** | 부모 MasterRuleFrame 에서 `{ sRuleId, sRuleNm }` 전달, 반환값 없음 (popupClose 인자 ✗), 부모 콜백 = fn_search() 만 호출 — As-Is 1:1 보존 | §1 / §13 |
| **div_search read-only 표시** | As-Is 보존 (검색 입력 아님 — 부모 전달값 표시 전용) | §3.2 |
| **edt_MasterRuleNm set_value 분기 조건** | As-Is 보존 (Script:188 이 `sRuleNm` 이 아닌 `sRuleId` 로 isNull 판정 — As-Is 코드 그대로) | §3.2 |
| **NOT IN 19 식별자** | As-Is 보존 (audit 17 + RULE_VER + RULE_SEQ 제외) | §6 |
| **save 시 전체 재등록 (DELETE 후 INSERT)** | As-Is 보존 (XV-001 "기존 컬럼정보 모두 삭제" 확인 메시지) | §5.2 / §5.3 |
| **Oracle 메타 딕셔너리** | To-Be MSSQL INFORMATION_SCHEMA + sys.extended_properties 변환 | §11 |
| **TB_MCA_RULE_COL_LIST 정본** | **Q-001 Resolved** — DMES-SECTION-MCA sheet134 등재 (MCAAPUSER, 29 컬럼) + 형제 masterRuleFrame §7 엔티티 `MasterRuleColList` 확정 → To-Be 컬럼/owner/audit 정합 | §7.2 / §9.2 |
| **save 반환 dataset 불일치 (Q-002 — 확정)** | xfdl sOutDatasets `ds_grdDownload=ds_GetRuleDataUploadList` (Script:294) vs Java 는 cnt_save 만 적재 (Java:64) → **To-Be: `savedCount`만 반환, 미사용 dataset 제거** (사용자 확정 2026-06-04) | §4.1 |

---

## 13. 확인필요 항목 (Q-NNN)

| ID | 항목 | 내용 | 영향도 | 설계 반영 방식 | 후속 조치 | 상태 |
|---|---|---|---|---|---|---|
| Q-001 | TB_MCA_RULE_COL_LIST To-Be 정본 | **DMES-SECTION-MCA_테이블정의서.xlsx sheet134 (MCAAPUSER) 에 등재 확인** — 공통감사 17 + 업무 12 = 29 컬럼. 동일 테이블을 save 대상으로 쓰는 형제 화면 masterRuleFrame §7 이 To-Be Entity `MasterRuleColList` / Repository `MasterRuleColListRepository` 확정. owner=MCAAPUSER 보존, audit=McmAuditEntity 9 컬럼 (그룹3·4 제거) | 높음 | To-Be 컬럼 = sheet134 업무 12 + audit→McmAuditEntity (§7.2). PK = (RULE_ID, COL_SEQ) 2키 (2026-07-08 오기 정정) | (없음 — 정본 확보) | **resolved** |
| Q-002 | save 반환 dataset 불일치 | xfdl fn_save sOutDatasets = `ds_grdDownload=ds_GetRuleDataUploadList` (Script:294) 이나 Java(Save...) 는 `cnt_save` 만 context 적재 (Java:64) 하여 `ds_GetRuleDataUploadList` 미생성. As-Is 동작상 save 성공 시 즉시 popupClose (Script:321) 라 반환 dataset 미소비 | 낮음 | As-Is 보존 — To-Be save 는 cnt 만 반환, 클라이언트는 성공 시 팝업 닫기 | 반환 형식 `{ savedCount }` 표준화 (확정) | **확정 (As-Is 보존 + cnt 표준화 — 사용자 2026-06-04)** |

---

## 14. 정합 게이트 자가 점검

| 게이트 | 조건 | 결과 | 사유 |
|---|---|---|---|
| G1. xfdl 컴포넌트 전수 | 모든 Layout 자식 + Objects Dataset 전수 매핑 | ✓ | §3.1 (6 영역) + §3.2 (S-001~004) + §3.3 (Grid 9 컬럼 + head 병합 + body) + §3.4 (Dataset 13 컬럼) + §3.5 (innerdataset 3) |
| G2. Grid columns 전수 | Format `<Columns>` 9 행 + Band head(2행)/body cell 전수 | ✓ | §3.3 9 컬럼 — colspan/rowspan 병합 + displaytype/edittype/editmaxlength/mask/combo 모두 분해 |
| G3. Mapper SQL 전수 | Mapper.xml `<select>` + Java DAO 호출 전부 등재 | ✓ | §6 (GetRuleColList SELECT 9 + WHERE/JOIN/NOT IN 19 + delete/insert 외부 Mapper) |
| G4. BPMN 노드 전수 | bpmn 모든 노드 등재 | ✓ | §8.1 (5 노드: Start/Gateway/GetRuleColList task/SaveMasterRuleBaseColList userTask/End) + §8.2 (5 sequenceFlow) + §8.3/§8.4 (camunda properties) |
| G5. file:line 인용 100% | 모든 본문 주장에 file:line | ✓ | (각 표 "근거" 컬럼) |
| G6. 추측 0 | 검증 안 한 추론 ✗ | ○ | TB_MCA_RULE_COL_LIST 정본 확보(Q-001 resolved) / save 반환(Q-002) 사용자 확정 — 잔존 0 |
| G7. 활성 확인필요 | Q-001·Q-002 모두 해소 | ○ | 0 건 open — Q-001 resolved / Q-002 확정 (사용자 2026-06-04) (§13) |
| G8. As-Is 1:1 보존 | 임의 수정·삭제·병합 ✗ | ✓ | xfdl/Java/Mapper/bpmn 본문 직접 인용 + cite |
| G9. 부모 연동 역참조 | 부모 호출 파라미터/콜백 등재 | ✓ | §1 (MasterRuleFrame.xfdl:424-441) |
| G10. SQL ID ↔ BPMN ↔ xfdl sSvcID 정합 | search / save 양 액션 1:1 | ✓ | §8.5 |

**§14 결과**: G1~G10 = ✓ (Q-001 resolved + Q-002 사용자 확정 2026-06-04). → 분석리포트 작성 완료.
