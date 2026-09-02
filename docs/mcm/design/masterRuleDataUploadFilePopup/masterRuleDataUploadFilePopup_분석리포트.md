---
screenId: masterRuleDataUploadFilePopup
asIsId: MasterRuleDataUploadFilePopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
---

# masterRuleDataUploadFilePopup (일반 업무기준 등록(Excel Upload)) 분석리포트

> 본 문서 = 6종 산출물의 **단일 원천 (Single Source of Truth)**. 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.
> 가이드 `docs/guide/design/templates/분석리포트.template.md` 의 절 제목·구조는 참고하되, 본 화면은 nexacro/xfdl + Oasis(Java 2종 + BPMN) + MyBatis 자산이므로 WinForms 전제 항목 (designer.cs / Visible=false / `+= new EventHandler` / @Case 분기 / Runner manifest 9 파일 / SOP 30 Step) 은 강제되지 않는다. mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow)로 매핑한다 (사용자 요구사항 §6 / §8 / §10). **본 화면은 부모 masterRuleData (MasterRuleData.xfdl:722 호출) 의 자식 팝업** — masterRuleData 가족 확정 사항 1:1 정합 (사용자 확정 2026-06-04).

---

## §0. 환경 제약

| 항목 | 내용 |
|---|---|
| 입력 원천 1 (UI) | nexacro `xfdl` v2.1 (단일 파일, 330 lines) |
| 입력 원천 2 (Service — 조회) | Oasis `Wow` UserTask `GetMasterRuleDataPopup.java` (40 lines) |
| 입력 원천 3 (Service — 저장) | Oasis `Wow` UserTask `SaveMasterRuleFileUpload.java` (93 lines) |
| 입력 원천 4 (Mapper) | MyBatis `MasterRuleDataUploadFilePopupMapper.xml` (3 SELECT) — 단, Save 가 호출하는 `delete` / `insert` 는 동적 namespace `${pTable}_Mapper.*` (외부 테이블별 매퍼) |
| 입력 원천 5 (BPMN) | Camunda BPMN 2.0 (1 process, 3 분기 search / save / search_col) |
| 입력 원천 6 (부모 호출원) | `MasterRuleData.xfdl:716~722` (`fn_excelUp` → `gfn_openPopup("modal", ...)`) |
| 입력 원천 7 (To-Be 카탈로그) | `docs/external/DMES/DMES-SECTION-MCA_테이블정의서.xlsx` — sheet134 (TB_MCA_RULE_COL_LIST, 29 컬럼) / sheet135 (TB_MCA_RULE_MASTER, 26 컬럼). owner=**MCAAPUSER** (xlsx 직접 파싱 확인) |
| Auto Manifest Runner | **미적용 (R-14)** (사용자 결정 — 입력 자산은 mui 6 원천 + DMES Excel 1종). manifest 폴더 금지. 정합체크서 §D.4 = ✗ + 사유 명시. |
| SOP 30 Step | **미적용** — WinForms designer.cs / sp 분기 매트릭스 / 12 이벤트 grep 대상 자산 부재. mui 자산은 xfdl·java(2)·xml·bpmn 원천으로 SOP 결과는 본 §3~§8 본 표 결과로 갈음. |
| As-Is DBMS | Oracle (Mapper.xml `NVL` / `NVL2` / `'TB_MCA_' \|\| #{pRuleId}` 문자열결합 / `ALL_CONS_COLUMNS` 시스템 카탈로그 / schema `MCA_SOURCE` 명시) |
| To-Be DBMS | MSSQL — §11 변환점 명시 |
| 영속성 | **JPA** (masterRuleData 가족 확정 — 사용자 확정 2026-06-04) |
| 작성 일자 | 2026-06-05 |

**★ 동적 컬럼·동적 테이블 화면 — masterRuleData 가족과 동일 본질.** 본 팝업은 ① Excel 미리보기·다운로드 그리드 컬럼을 `ds_RuleColData`(= `TB_MCA_RULE_COL_LIST` 컬럼정의) 기반으로 **런타임 동적 생성**하고(xfdl:261~291), ② 조회/저장 대상 테이블명을 `TB_MCA_<업무기준ID>` 로 **런타임 동적 결정**한다(xfdl:177, 213 / Mapper `${pTable}`). 동적 로직은 §3.3 / §4 / §6 / §7 에 전수 명시.

**★ 메타 테이블은 To-Be 카탈로그에 존재 / 동적 데이터 테이블만 미수록(정상).** masterRuleData 분석리포트 §0 / §9 와 동일 구분:
- **(a) 메타 테이블 — 카탈로그 존재.** `TB_MCA_RULE_COL_LIST` (sheet134, 29 컬럼) + `TB_MCA_RULE_MASTER` (sheet135, 26 컬럼). 두 테이블의 To-Be 컬럼 카탈로그는 §9.2/§9.3 에 매핑. owner=MCAAPUSER (xlsx 확인).
- **(b) 동적 데이터 테이블 — 카탈로그 미수록(정상).** `MCA_SOURCE.TB_MCA_<업무기준ID>` (= 런타임 `${pTable}`) 는 업무기준ID 별 가변 인스턴스 테이블. **To-Be 전략 = masterRuleData 가족 확정 'DDL on-demand'** (업무기준ID별 실테이블 동적 생성/조회, owner=MCAAPUSER — 사용자 확정 2026-06-04).

---

## §1. 화면 개요

### 1.1 식별자

| 항목 | 값 | 근거 |
|---|---|---|
| 화면명 | 일반 업무기준 등록(Excel Upload) | MasterRuleDataUploadFilePopup.xfdl:3 (`titletext`) |
| 화면 식별자 (screenId) | masterRuleDataUploadFilePopup | 사용자 결정 (모듈 mcm + As-Is 화면명 lowerCamel) |
| As-Is 식별자 (asIsId) | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup.xfdl:3 (`Form@id`) |
| moduleId | mcm — 한글명 **"공통관리"** | 사용자 결정 (테이블 카탈로그 = DMES-SECTION-MCA 정의서 대응) |
| moduleGroup | cmb — 한글명 **"업무기준 관리(원장)"** | 사용자 결정 (01 부속 §A.2.3 등재) / 자산 경로: `mui/src/nxuiMui/cmb/` · `mappers-cmb/` · `services/cmb/` |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 일반 업무기준 등록(Excel Upload) | - |
| pageName / pageId / serviceId | masterRuleDataUploadFilePopup (3 식별자 동일) | MES 단일 룰 |
| BPMN process id (As-Is) | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup.bpmn:3 |
| BPMN process name | 일반 업무기준 컬럼조회 | MasterRuleDataUploadFilePopup.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleDataUploadFilePopup.bpmn:3 |
| Frontend 파일명 (To-Be 안) | masterRuleDataUploadFilePopup.tsx | MES 룰 |
| 화면 성격 | **modal popup** (부모 masterRuleData 의 자식 — `MasterRuleData.xfdl:722` `gfn_openPopup("modal", ...)`) |
| onload 핸들러 | MasterRuleDataUploadFilePopup_onload | xfdl:3 / xfdl:119 |
| 최초 생성 | 2020.07.07 최규찬 | xfdl:112 |

### 1.2 화면 목적 (패턴 1 enum)

> masterRuleDataUploadFilePopup 은 MasterRuleDataUploadFilePopup 의 **등록**, **삭제**, **조회** 를 수행한다.

- **등록**: Excel 파일을 import 하여 동적 테이블 `TB_MCA_<업무기준ID>` 에 일괄 INSERT (SaveMasterRuleFileUpload.java:60~82). 각 행에 `RULE_VER="1"` + `RULE_SEQ`(maxRuleSeq+1 채번) 부여.
- **삭제**: `chk_regFlag`(삭제등록) 체크 시 본 테이블의 모든 row 를 선 DELETE 후 재등록 (SaveMasterRuleFileUpload.java:46~53).
- **조회 (다운로드용)**: 현재 등록된 row 를 가져와 `ds_grdDownload` 에 적재 → `gfn_exportExcel` 로 Excel 내보내기 (xfdl:171~185 / xfdl:225~253). + 컬럼정의 조회 (`search_col`) 로 업로드/다운로드 그리드 동적 컬럼 구성 (xfdl:154~168 / xfdl:255~299).

### 1.3 화면 수정 이력 (xfdl 헤더 인용)

| 일자 | 작성자 | 설명 | 근거 |
|---|---|---|---|
| 2020.07.07 | 최규찬 | 최초 생성 | xfdl:112 |

---

## §2. 입력 자산 인벤토리

| # | 자료 구분 | 경로 (file) | 라인 수 | 분석 활용 결과 |
|---:|---|---|---:|---|
| 1 | xfdl (UI 정의 + xscript) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleDataUploadFilePopup.xfdl | 330 | §3 UI / §4 버튼 / §10 메시지 / §5 호출 출처 |
| 2 | Java UserTask (조회) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleDataUploadFilePopup\GetMasterRuleDataPopup.java | 40 | §6 SQL #2 / §7 트랜잭션 / §8 BPMN ↔ Java |
| 3 | Java UserTask (저장) | D:\dmes-Section\workspace-Section\mui\src\main\java\com\dongkuk\dmes\mui\task\ui\cmb\MasterRuleDataUploadFilePopup\SaveMasterRuleFileUpload.java | 93 | §7 트랜잭션 / §8 BPMN ↔ Java |
| 4 | MyBatis Mapper (본 화면) | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleDataUploadFilePopupMapper.xml | 41 | §6 SQL `GetRuleColList` / `GetMasterRuleDataList` / `GetMaxRuleSeq` |
| 5 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleDataUploadFilePopup.bpmn | 139 | §8 워크플로우 전수 |
| 6 | 부모 호출원 xfdl (역추적) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleData.xfdl | (716~729 인용) | §5 P-NNN 호출 출처 |
| 7 | DMES 테이블정의서 | docs/external/DMES/DMES-SECTION-MCA_테이블정의서.xlsx | (binary — sheet134/135) | §9 메타 테이블 컬럼 카탈로그 (xlsx 직접 파싱) |

추가 외부 참조(본 화면 자산에 미포함, 인용으로만 사용):
- `${pTable}_Mapper.delete` (SaveMasterRuleFileUpload.java:52) / `${pTable}_Mapper.insert` (java:77) — `TB_MCA_<업무기준ID>_Mapper.*` 동적 namespace. 각 업무기준 테이블별 개별 Mapper 파일(본 화면 자산 외부).
- `MasterRuleDataMapper.GetMaxRuleSeq` (SaveMasterRuleFileUpload.java:57 호출) — **부모 masterRuleData 의 Mapper namespace** 의 SQL 을 호출. 본 화면 Mapper(MasterRuleDataUploadFilePopupMapper)에도 동명 `GetMaxRuleSeq` 가 정의되어 있으나(Mapper.xml:36~39), Save 는 `MasterRuleDataMapper.GetMaxRuleSeq` 를 사용 — namespace 불일치 (§6 비고 / Q-103).
- `CactusConstants.MYBATIS_WHERE` (SaveMasterRuleFileUpload.java:8, 51) — cactus 공통 상수.

---

## §3. UI 컴포넌트 전수 (xfdl)

### 3.1 영역 구성 (4 Div + 1 fold 버튼)

| ID | 종류 | 영역 명 | 위치 | 비고 | 근거 |
|---|---|---|---|---|---|
| R-001 | Div | div_title | left=20, top=0, height=50, right=20 | 화면 타이틀 + 공용 상단 메뉴 (`commonTopButton.xfdl`) | xfdl:55-67 |
| R-002 | Div | div_search | left=20, top=50, height=43, right=20 | 업무기준 / 업무기준명 / 삭제등록 체크박스 — **조회조건 영역** | xfdl:69-80 |
| R-003 | Button | btn_fold | top=93, height=15, left=20, right=20 | div_search 접기/펴기 (`gfn_fold`) | xfdl:6 / xfdl:325-327 |
| R-004 | Div | div_main | left=20, top=btn_fold:5, right=20, bottom=30 | **메인 본문** — `grd_Upload` (보임) + `grd_Download` (visible=false) 포함 | xfdl:7-54 |
| R-005 | Div | div_bottom | left=0, height=20, bottom=0, right=0 | 공용 하단 상태바 (`commonBottomStatus.xfdl`) | xfdl:68 |

### 3.2 조회조건 (div_search 영역) — S-NNN

| ID | 표시명 (출처) | xfdl 컨트롤 | 종류 | bind / value | 읽기전용 | 코드/LoV | 기본값 | 필수 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | 업무기준 (Static stc_ruldId) | edt_MasterRuleId | Edit | this.sRuleId (= 부모가 전달한 `sRuleId`) | true | - | text="결함 코드" (디자인 기본값, 실제는 부모 sRuleId) | N (read-only) | xfdl:72-73 / xfdl:126 / xfdl:129-131 |
| S-002 | 업무기준명 (Static stc_ruleNM) | edt_MasterRuleNm | Edit | this.sRuleNm (= 부모 전달 `sRuleNm`) | true | - | text="결함 코드" (디자인 기본값, 실제는 부모 sRuleNm) | N (read-only) | xfdl:74-75 / xfdl:127 / xfdl:132-134 |
| S-003 | 삭제등록 (Static stc_flag) | chk_regFlag | CheckBox | (UI state — `value` 직접 read) | - | bool | false | N | xfdl:76-77 / xfdl:214 |

> S-001 / S-002 는 부모 (`MasterRuleData`) 가 modal 인자로 넘긴 `sRuleId` / `sRuleNm` 을 read-only 로 표시. 사용자가 본 popup 안에서 변경 불가 (xfdl:129-134).

### 3.3 메인 그리드 G-NNN — grd_Upload (Excel Import 미리보기, 본 그리드만 사용자 가시) — ★동적 컬럼

`Grid id="grd_Upload"` (xfdl:10-28), binddataset=`ds_grdUpload` (xfdl:89-93), `selecttype="multiarea"`, `cellmovingtype=col`, `cellsizingtype=col`, `autosizingtype=col`, `autosizebandtype=allband`.

| 속성 | 값 | 근거 |
|---|---|---|
| 정적 Format default 컬럼 | 1 컬럼 (size=80), head row 1 + body row 1 (24px) | xfdl:12-26 |
| ds_grdUpload 선언 컬럼 | RULE_ID (STRING 256) 1개뿐 — 동적 컬럼은 런타임 addColumn | xfdl:89-93 |

#### Grid 동적 컬럼 (런타임 추가 — fn_callBack "search_col" / xfdl:261~273)

| 동작 | 상세 | 근거 |
|---|---|---|
| 추가 트리거 | search_col 콜백 성공(nErrorCode==0) 시 `ds_RuleColData.rowcount` 만큼 반복 | xfdl:261 |
| 컬럼 추가 | `ds_grdUpload.addColumn(COL_ID, "STRING")` + `grd_Upload.appendContentsCol("body")` | xfdl:262-263 |
| head text | `COL_NM` (컬럼정의 항목명) | xfdl:269 |
| body bind | `text = "bind:"+COL_ID` | xfdl:270 |
| body cssclass | `sIoFlag=="IN" ? cellBody_BgColor_red : cellBody_BgColor_blue` (IN/OUT 색 구분) | xfdl:271 |
| DATE 타입 처리 | `sColType=="DATE"` 면 calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" | xfdl:266-268 |
| 빈컬럼 제거 | `grd_Upload.deleteContentsCol("body", ds_RuleColData.rowcount)` (초기 정적 1 컬럼 제거) | xfdl:273 |

### 3.4 숨김 그리드 GE-NNN — grd_Download (Excel Export 용, `visible="false"`) — ★동적 컬럼

`Grid id="grd_Download"` (xfdl:29-51), binddataset=`ds_grdDownload`, `visible="false"`, `width=200`, `top=200 right=0 bottom=0`, `autosizingtype=col`, `autosizebandtype=allband`.

| 속성 | 값 | 근거 |
|---|---|---|
| 정적 Format default 컬럼 | 1 컬럼 (size=48), head 3 row (24px) + body 1 row | xfdl:31-49 |
| ds_grdDownload 선언 컬럼 | RULE_ID (STRING 256) 1개뿐 — 동적 컬럼은 런타임 addColumn | xfdl:84-88 |

#### Grid 동적 컬럼 (런타임 추가 — fn_callBack "search_col" / xfdl:276~291)

| 동작 | 상세 | 근거 |
|---|---|---|
| 추가 트리거 | search_col 콜백 성공 시 `ds_RuleColData.rowcount` 만큼 반복 | xfdl:276 |
| 컬럼 추가 | `ds_grdDownload.addColumn(COL_ID, "STRING")` + `grd_Download.appendContentsCol("body")` | xfdl:277-278 |
| head row=0 text | `sIoFlag` (IN/OUT 표기) | xfdl:285 |
| head row(매핑) text | `COL_NM` (`(i*2)+2`) / `COL_ID` (`((i*2)+2)+(i+2)`) — 3행 헤더 구성 | xfdl:286-287 |
| body bind | `text = "bind:"+COL_ID` | xfdl:288 |
| body cssclass | `sIoFlag=="IN" ? cellBody_BgColor_red : cellBody_BgColor_blue` | xfdl:289 |
| DATE 타입 처리 | `sColType=="DATE"` 면 calendardateformat / nulltype / invalidtype | xfdl:281-283 |
| 빈컬럼 제거 | `grd_Download.deleteContentsCol("body", ds_RuleColData.rowcount)` | xfdl:291 |

> **차이점 정리**: `grd_Upload` (가시) = 사용자가 Excel 을 import 한 결과 보기 (head 1행) / `grd_Download` (숨김) = 서버 조회 결과를 받아 Excel export (head 3행: IN/OUT + 컬럼명 + 컬럼ID). 두 그리드 모두 컬럼이 `ds_RuleColData`(컬럼정의) 기반 **런타임 동적 생성** — 컬럼 개수·이름·타입이 선택한 업무기준에 따라 가변. **To-Be FE 동적 그리드 컬럼 빌드 동일 구현** 필요 (Q-101).

### 3.5 dataset 컬럼 (xfdl `<Objects>` 전수)

| dataset | 컬럼 ID | type | size | 용도 | 근거 |
|---|---|---|---:|---|---|
| ds_grdDownload | RULE_ID | STRING | 256 | (+ 런타임 동적 컬럼) Excel Export 그리드 소스 | xfdl:84-88 |
| ds_grdUpload | RULE_ID | STRING | 256 | (+ 런타임 동적 컬럼) Excel Import 그리드 소스 | xfdl:89-93 |
| ds_RuleColData | COL_ID | STRING | 256 | 동적 컬럼 ID (bind 키) | xfdl:96 |
| ds_RuleColData | COL_NM | STRING | 256 | 동적 컬럼 헤더명 | xfdl:97 |
| ds_RuleColData | CODE_YN | STRING | 256 | 코드 여부 (MASTER_CODE_DIV) | xfdl:98 |
| ds_RuleColData | PK_YN | STRING | 256 | PK 여부 (ALL_CONS_COLUMNS 런타임 산출) | xfdl:99 |
| ds_RuleColData | COL_TYPE | STRING | 256 | 컬럼 타입 (DATE → 캘린더·14자 절단 / VARCHAR2 등) | xfdl:100 |
| ds_RuleColData | IO_FLAG | STRING | 256 | IN/OUT 여부 (그리드 셀 색상) | xfdl:101 |

> ds_grdUpload / ds_grdDownload 는 선언 컬럼이 RULE_ID 1개뿐 — 실제 업무기준 컬럼은 모두 `search_col` 콜백에서 런타임 addColumn (xfdl:262, 277). `ds_RuleColData` = 컬럼정의 캐시 (SQL `GetRuleColList` 반환).

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

> mui 의 버튼은 `commonTopButton.xfdl` 의 `fn_commonTop_onload` 에 동적 배열로 등록된다 (xfdl:145-149).

### 4.1 사용자 정의 버튼 (B-NNN) — `fn_button` 등록 (xfdl:140-151)

| ID | 버튼 식별자 | 라벨 | 핸들러 (xfdl method) | 동작 유형 (7 enum) | To-Be action | 비고 | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | btn_fileDown | 다운로드 | fn_fileDown | 조회 + 출력 | search → export | 서버 조회(`GetMasterRuleDataList`, action=`search`) 후 콜백에서 Excel export | xfdl:146 / xfdl:171-185 / xfdl:225-253 |
| B-002 | btn_fileUpload | 파일선택 | fn_fileUpload | 조회 (client side) | importExcel (client) | `gfn_importExcel` → ds_grdUpload 적재. 서버 호출 ✗ | xfdl:147 / xfdl:188-193 |
| B-003 | btn_fileSave | 등록 | fn_fileSave | 저장 | save | ds_grdUpload + ds_RuleColData 를 server 로 전송, (조건부 DELETE →) INSERT loop | xfdl:148 / xfdl:206-218 |

### 4.2 기본 버튼 (B-기본)

| ID | 버튼 식별자 | 라벨 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|---|
| B-099 | btn_close | 닫기 | fn_close (`gfn_popupClose`) | popup close | xfdl:149 / xfdl:315-322 |

### 4.3 부수 트리거 (CheckBox / fold / lov 자동)

| ID | 트리거명 | 컨트롤 / 시점 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|---|
| T-001 | div_search 접기/펴기 | btn_fold | btn_fold_onclick → `gfn_fold` | UI 접기/펴기 | xfdl:6 / xfdl:325-327 |
| T-002 | 삭제등록 토글 | chk_regFlag | (이벤트 핸들러 없음 — value 만 fn_fileSave 시 읽음) | UI state | xfdl:77 / xfdl:214 |
| T-003 | 컬럼정의 자동 조회 | onload 후 fn_formAfterOnload → fn_lov | fn_lov (action=`search_col`) | 그리드 동적 컬럼 구성 (서버 호출, 사용자 버튼 아님) | xfdl:136 / xfdl:154-168 |

### 4.4 action 매트릭스 (server-side 호출 여부)

| 버튼/트리거 | sSvcID | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_fileDown | search | Y | SequenceFlow_0grwghu | "" | ds_grdDownload=ds_GetRuleDataUploadList | xfdl:173-176 / bpmn:22 |
| B-003 btn_fileSave | save | Y | SequenceFlow_0r4u7xr | ds_RuleColData=ds_RuleColData ds_grdUpload=ds_grdUpload | ds_grdDownload=ds_GetRuleDataUploadList | xfdl:208-211 / bpmn:33 |
| T-003 fn_lov (onload) | search_col | Y | SequenceFlow_0qe9z05 | "" | ds_RuleColData=ds_GetRuleColUploadList | xfdl:158-161 / bpmn:60 |
| B-002 btn_fileUpload | (없음 — client) | N | (해당 없음) | - | - | xfdl:188-193 |
| B-099 btn_close / B-009 btn_fold | (없음) | N | (해당 없음) | - | - | xfdl:315, 325 |

비고:
- B-001 search sArgument = `gfn_setParam("pTable", "TB_MCA_"+this.sRuleId)` (xfdl:177).
- B-003 save sArgument = `pRuleId`(=sRuleId) + `pTable`(="TB_MCA_"+sRuleId) + `pRegFlag`(=chk_regFlag.value) (xfdl:212-214).
- T-003 search_col sArgument = `gfn_setParam("pRuleId", edt_MasterRuleId.value)` (xfdl:161).

---

## §5. 팝업 (P-NNN)

> 본 화면은 popup 이므로 **호출 출처 (= caller P-NNN)** 만 의미가 있고, 본 화면이 다른 popup 을 띄우는 경우는 없음 (xfdl 안에 openPopup 호출 ✗).

| P-NNN | 호출 유형 | 호출 화면 (file) | 호출 라인 | 트리거 | 전달 파라미터 | 콜백 | 근거 |
|---|---|---|---|---|---|---|---|
| P-001 | modal popup (역참조) | MasterRuleData.xfdl | xfdl:722 | fn_excelUp (B-007 btn_excelUp, `edt_ruleId.value` 비어있으면 return) | `{sRuleId: div_search.edt_ruleId.value, sRuleNm: div_search.edt_ruleNm.value}` | fn_returnMasterRuleDataUploadFilePopupCallBack (rtVal 미사용 — null 검사 후 종료) | MasterRuleData.xfdl:716-729 |

> P-001 의 호출 파라미터 `sRuleId` / `sRuleNm` 은 본 화면 `fn_formAfterOnload` 에서 `gfn_Data_Return` 으로 수신 → div_search 의 edt_MasterRuleId / edt_MasterRuleNm 에 표시 (xfdl:126-134). 수신 직후 `fn_button()` (xfdl:135) + `fn_lov()` (xfdl:136) 자동 실행 → search_col 으로 그리드 동적 컬럼 즉시 구성.
> 부모 가드: `fn_excelUp` 진입 시 `edt_ruleId.value` 가 null 이면 즉시 return (MasterRuleData.xfdl:718) — 업무기준 미선택 시 팝업 호출 차단.

---

## §6. SQL ID 매트릭스

> 본 화면이 사용하는 SQL = 5 건. 본 화면 전용 매퍼(`MasterRuleDataUploadFilePopupMapper`) = 3 건 (`GetRuleColList` / `GetMasterRuleDataList` / `GetMaxRuleSeq`). Save 가 호출하는 `delete` / `insert` 는 **동적 namespace** `${pTable}_Mapper.*` (= `TB_MCA_<업무기준ID>_Mapper`, 외부 테이블별 매퍼).

| SQL ID | 종류 | sqlKey (BPMN / Java 호출 식) | 매퍼 파일 (file:line) | trigger | 비고 |
|---|---|---|---|---|---|
| #1 | SELECT | `#{serviceId}Mapper.GetRuleColList` → `MasterRuleDataUploadFilePopupMapper.GetRuleColList` | MasterRuleDataUploadFilePopupMapper.xml:7-29 | BPMN `Task_1rf3f4m` (action="search_col") | parameter: pRuleId. result map → `ds_GetRuleColUploadList`. 본 화면 전용 매퍼. Oracle `ALL_CONS_COLUMNS` PK 판정 / `NVL2` / `'TB_MCA_' \|\| #{pRuleId}` |
| #2 | SELECT | `MasterRuleDataUploadFilePopupMapper.GetMasterRuleDataList` | MasterRuleDataUploadFilePopupMapper.xml:31-34 | Java `GetMasterRuleDataPopup` (action="search") | parameter: pTable. result → `ds_GetRuleDataUploadList`. `SELECT * FROM MCA_SOURCE.${pTable}` (동적 테이블) |
| #3 | SELECT | `MasterRuleDataUploadFilePopupMapper.GetMaxRuleSeq` | MasterRuleDataUploadFilePopupMapper.xml:36-39 | (정의됨 — 단 Save 는 `MasterRuleDataMapper.GetMaxRuleSeq` 사용, Q-103) | parameter: pTable. `SELECT NVL(MAX(RULE_SEQ),0) FROM MCA_SOURCE.${pTable}` |
| #4 | DELETE | `${pTable}_Mapper.delete` | (외부 동적 매퍼 `TB_MCA_<RuleId>_Mapper`) | Java `SaveMasterRuleFileUpload` (pRegFlag="true" 일 때만) | dynamic where: `MYBATIS_WHERE = "1 = 1"` (java:51) → 전건 삭제 |
| #5 | INSERT | `${pTable}_Mapper.insert` | (외부 동적 매퍼 `TB_MCA_<RuleId>_Mapper`) | Java `SaveMasterRuleFileUpload` (ds_grdUpload row 마다 호출) | dynamic insert. 본 화면 공급 컬럼: 동적 컬럼들 + `RULE_VER="1"` + `RULE_SEQ`(maxRuleSeq+1) — java:60-82 |

### 6.1 SQL #1 SELECT 본문 1:1 인용 (MasterRuleDataUploadFilePopupMapper.xml:7-29)

```xml
<select id="GetRuleColList" parameterType="java.util.Map" resultType="java.util.Map">
    SELECT RCLIST.RULE_ID,
           RCLIST.COL_SEQ,
           RCLIST.COL_ID,
           RCLIST.COL_NM,
           RCLIST.COL_LEN,
           RCLIST.MES_COL_ID,
           RCLIST.MASTER_CODE_DIV AS CODE_YN,
           (SELECT NVL2(MAX(CONSTRAINT_NAME), 'Y','N') AS PK_YN
              FROM ALL_CONS_COLUMNS
             WHERE TABLE_NAME = 'TB_MCA_' || #{pRuleId}
               AND COLUMN_NAME = RCLIST.COL_ID
             GROUP BY COLUMN_NAME) AS PK_YN,
           RCLIST.COL_TYPE,
           RCLIST.IO_FLAG
      FROM MCA_SOURCE.TB_MCA_RULE_MASTER RMASTER,
           MCA_SOURCE.TB_MCA_RULE_COL_LIST RCLIST
     WHERE RMASTER.RULE_ID = RCLIST.RULE_ID
        <if test='pRuleId != null and pRuleId != ""'>
            AND RMASTER.RULE_ID = #{pRuleId}
        </if>
     ORDER BY RCLIST.COL_SEQ
</select>
```

- SELECT 컬럼 9종: RULE_ID / COL_SEQ / COL_ID / COL_NM / COL_LEN / MES_COL_ID / MASTER_CODE_DIV(AS CODE_YN) / (서브쿼리 AS PK_YN) / COL_TYPE / IO_FLAG.
- JOIN: `RMASTER.RULE_ID = RCLIST.RULE_ID` (xml:24). 동적 WHERE: pRuleId != null 시 `AND RMASTER.RULE_ID = #{pRuleId}` (xml:25-27). PK_YN 서브쿼리 대상 테이블 = `'TB_MCA_' || #{pRuleId}` (xml:17). ORDER BY COL_SEQ (xml:28).
- ds_RuleColData ColumnInfo(xfdl:96-101)에는 COL_ID/COL_NM/CODE_YN/PK_YN/COL_TYPE/IO_FLAG 6컬럼 선언 — COL_SEQ/COL_LEN/MES_COL_ID 도 반환되나 동적 추가/미사용.

### 6.2 SQL #2 SELECT 본문 1:1 인용 (MasterRuleDataUploadFilePopupMapper.xml:31-34)

```xml
<select id="GetMasterRuleDataList" parameterType="java.util.Map" resultType="java.util.Map">
    SELECT *
      FROM MCA_SOURCE.${pTable}
</select>
```

- `${pTable}` = `TB_MCA_<업무기준ID>` (동적 치환). 페이징/WHERE 없음 — 전건. GetMasterRuleDataPopup.java:29 호출 → context `ds_GetRuleDataUploadList`.

### 6.3 SQL #3 SELECT 본문 1:1 인용 (MasterRuleDataUploadFilePopupMapper.xml:36-39)

```xml
<select id="GetMaxRuleSeq" parameterType="java.util.Map" resultType="java.lang.String">
    SELECT NVL(MAX(RULE_SEQ),0) AS RULE_SEQ
      FROM MCA_SOURCE.${pTable}
</select>
```

> **★ 본 화면 매퍼에 GetMaxRuleSeq 가 정의되어 있으나, Save 는 `MasterRuleDataMapper.GetMaxRuleSeq`(= 부모 masterRuleData 매퍼) 를 호출** (SaveMasterRuleFileUpload.java:57). 두 SQL 본문은 동일하나 namespace 가 다름 → **호출 경로 불일치** (Q-103). To-Be 는 본 화면 매퍼로 일원화 권고.

### 6.4 SQL #4 DELETE — `${pTable}_Mapper.delete`

- Java 호출 시 `MYBATIS_WHERE = "1 = 1"` (java:51) → `DELETE FROM ... WHERE 1 = 1` (= 전건 삭제). 본 테이블의 모든 row 삭제. 외부 동적 매퍼 본문은 본 화면 자산 외부.

### 6.5 SQL #5 INSERT — `${pTable}_Mapper.insert` — Java 가 공급하는 컬럼

Java `SaveMasterRuleFileUpload` 가 dynamic INSERT 에 넘기는 키 (java:60-82):

| 컬럼 | 값 출처 | 값 형식 |
|---|---|---|
| (동적 컬럼들) | ds_grdUpload[i] 의 각 key (COL_ID) — Iterator 순회 (java:64-74) | String. **COL_TYPE=="DATE" 면 `-` 제거 후 14자 절단** (java:69-72) |
| RULE_VER | **"1" 고정** (java:75) | String |
| RULE_SEQ | **maxRuleSeq++ 채번** (java:62, 76) | String (maxRuleSeq 는 GetMaxRuleSeq 결과 + 루프마다 +1) |

> audit 컬럼(CREATED_*/LAST_UPDATE_*)은 As-Is 본 화면 Save 가 직접 세팅하지 않음 — 부모 masterRuleData 의 `setAuditField` 와 달리 본 화면은 audit 미세팅 (외부 동적 매퍼의 ref 또는 DB default 의존 추정). **To-Be cactus-core `McmAuditEntity` 9 컬럼 적용** (가족 확정 Q-105).

---

## §7. Java 트랜잭션 분석

### 7.1 GetMasterRuleDataPopup (조회) — 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 클래스 FQN | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.GetMasterRuleDataPopup | java:1, java:17 |
| **To-Be 클래스 FQN** | `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.GetMasterRuleDataPopup` (RULE.md §"패키지 명명 규칙" §3-1 / masterRuleData 가족 정합) | - |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:12, java:17 |
| 메서드 | `public String run(Context context, Task task)` | java:19 |
| BPMN 매핑 UserTask | UserTask_1j7375k ("일반 업무기준 조회") class=`#{basePackage}GetMasterRuleDataPopup` | bpmn:35-44 |

#### run(Context, Task) — 단계 전수 (java:19-39)

| 단계 | 줄 | 동작 | 호출 SQL |
|---|---:|---|---|
| S1 | java:24 | `TransactionalDao dao = context.getDao();` | - |
| S2 | java:27-28 | `param = new HashMap`; `param.put("pTable", context.get("pTable"))` | - |
| S3 | java:29 | `dao.selectList("MasterRuleDataUploadFilePopupMapper.GetMasterRuleDataList", param)` → ds_GetRuleDataUploadList | #2 GetMasterRuleDataList |
| S4 | java:31 | `CommonDaoUtil.addDaoResultIntoContext(context, "ds_GetRuleDataUploadList", size, list, true)` → return null | - |
| S5 (예외) | java:34-38 | catch Exception → log → `throw new IllegalTaskException(e)` | - |

### 7.2 SaveMasterRuleFileUpload (저장) — 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 클래스 FQN | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.SaveMasterRuleFileUpload | java:1, java:19 |
| **To-Be 클래스 FQN** | `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.SaveMasterRuleFileUpload` | - |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:14, java:19 |
| 메서드 | `public String run(Context context, Task task)` | java:20-21 |
| BPMN 매핑 UserTask | UserTask_09dxtkf ("업무기준 Import") class=`#{basePackage}SaveMasterRuleFileUpload` | bpmn:23-32 |

#### run(Context, Task) — 단계 전수 (java:20-92)

| 단계 | 줄 | 동작 | 비고 |
|---|---:|---|---|
| S1 | java:23 | log 시작 | "Rule 등록 엑셀IMPORT 저장 시작" |
| S2 | java:26 | `TransactionalDao dao = context.getDao();` | - |
| S3 | java:28-30 | context 에서 `pRuleId` / `pTable` / `pRegFlag` 추출 | - |
| S4 | java:32-33 | context 에서 `ds_grdUpload` / `ds_RuleColData` 를 `ArrayList<HashMap>` 로 캐스팅 | - |
| S5 | java:35-38 | `typeDiv` Map 구성: ds_RuleColData 의 COL_ID → COL_TYPE | DATE 절단 판정용 |
| S6 | java:42 | `int cnt = 0` | 저장 카운터 |
| S7 (조건부 선삭제) | java:46-53 | `if(pRegFlag.equals("true"))`: param.put(MYBATIS_WHERE, "1 = 1") → `dao.delete(pTable+"_Mapper.delete", param)` | 본 테이블 전건 삭제 |
| S8 | java:55-57 | `getMap.put("pTable", pTable)` → `maxRuleSeq = Integer.parseInt(dao.selectOne("MasterRuleDataMapper.GetMaxRuleSeq", getMap))` | **부모 매퍼 namespace** (Q-103) |
| S9 (반복 INSERT) | java:60-82 | for(i; i<ds_grdUpload.size(); i++): maxRuleSeq++ → ds_grdUpload[i] 의 각 key 순회 (DATE 면 `-` 제거 + 14자 절단) → setMap put → RULE_VER="1" / RULE_SEQ=maxRuleSeq → `dao.insert(pTable+"_Mapper.insert", setMap)` ≤ 0 이면 throw Exception else cnt++ | atomic |
| S10 | java:84 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_import", cnt, null, true)` | result key = `cnt_import` → xfdl 콜백 표시 (xfdl:303) |
| S11 | java:86 | return null (정상) | - |
| S12 (예외) | java:87-91 | catch Exception → log → `throw new IllegalTaskException(e)` → BPMN rollback | - |

### 7.3 트랜잭션 경계

- `TransactionalDao` (Oasis 표준): UserTask 단위 = 1 트랜잭션. **DELETE(조건부) + 모든 row INSERT 가 atomic** — 한 row 라도 INSERT 실패 (dao.insert ≤ 0) 시 Exception → IllegalTaskException → BPMN rollback → 모든 DELETE/INSERT 취소.
- 따라서 **부분 성공 케이스 없음** (전부 성공 or 전부 rollback).
- search / search_col 은 read-only — 트랜잭션 의미 없음.

### 7.4 비기능 결함 / 잠재 이슈

| ID | 결함 | 위치 | 영향 |
|---|---|---|---|
| F-001 | `dao.insert(...) ≤ 0` 시 `throw new Exception(...)` — 일반 Exception. row index 미포함 → 운영 디버깅 어려움 | java:77-78 | mid |
| F-002 | ds_grdUpload[i] 의 값을 `vals = ...toString()` cast (java:67) — Excel 셀이 number 로 import 시 위험은 적으나 null 처리 `!=null?...:""` 존재 | java:67 | low |
| F-003 | `RULE_VER` "1" 고정 (java:75) — 버전 관리 무의미 또는 의도된 단순 기본값 | java:75 | low |
| F-004 | maxRuleSeq 채번이 부모 매퍼 `MasterRuleDataMapper.GetMaxRuleSeq` 사용 (java:57) — 본 화면 매퍼의 동명 SQL(#3) 미사용. namespace 의존 결합 | java:57 | mid (Q-103) |
| F-005 | `chk_regFlag` 미체크(false) 시 DELETE 없이 INSERT 만 → PK 중복 시 INSERT 실패 가능 → 전체 rollback | java:47 | high (전체 rollback) |
| F-006 | audit 컬럼 미세팅 — 부모 masterRuleData 의 `setAuditField` 와 달리 본 화면 Save 는 CREATED_*/LAST_UPDATE_* 를 세팅하지 않음 (외부 매퍼 ref / DB default 의존 추정) | java:60-82 | mid (To-Be McmAuditEntity 로 해소) |

---

## §8. BPMN 워크플로우 전수

### 8.1 process 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterRuleDataUploadFilePopup | bpmn:3 |
| process name | 일반 업무기준 컬럼조회 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |
| basePackage 변수 | `#{basePackage}SaveMasterRuleFileUpload` / `#{basePackage}GetMasterRuleDataPopup` | bpmn:27 / bpmn:39. **To-Be**: `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.` 주입 |
| serviceId 변수 | `#{serviceId}Mapper.GetRuleColList` | bpmn:53 (runtime 에 `MasterRuleDataUploadFilePopup` 주입) |

### 8.2 flow 노드 전수

| ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4-6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_1p74ti7 / SequenceFlow_0vmabw3 / SequenceFlow_177rnzi | - | bpmn:7-11 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (no name) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu / SequenceFlow_0r4u7xr / SequenceFlow_0qe9z05 | bpmn:12-20 |
| UserTask_09dxtkf | userTask | 업무기준 Import | com.dongkuk.dmes.UserTask / class=`#{basePackage}SaveMasterRuleFileUpload` | nextBranchSpel="" | SequenceFlow_0r4u7xr | SequenceFlow_1p74ti7 | bpmn:23-32 |
| UserTask_1j7375k | userTask | 일반 업무기준 조회 | com.dongkuk.dmes.UserTask / class=`#{basePackage}GetMasterRuleDataPopup` | nextBranchSpel="" | SequenceFlow_0grwghu | SequenceFlow_0vmabw3 | bpmn:35-44 |
| Task_1rf3f4m | task | 일반 업무기준 컬럼조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=`#{serviceId}Mapper.GetRuleColList`, resultKey=ds_GetRuleColUploadList, isServiceResult=true | SequenceFlow_0qe9z05 | SequenceFlow_177rnzi | bpmn:46-59 |

### 8.3 sequenceFlow 전수 (6 개)

| ID | source | target | name (action) | 비고 | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | StartEvent_1 | ExclusiveGateway_1 | — | - | bpmn:21 |
| SequenceFlow_0grwghu | ExclusiveGateway_1 | UserTask_1j7375k | search | xfdl `sSvcID="search"` (xfdl:173) | bpmn:22 |
| SequenceFlow_0r4u7xr | ExclusiveGateway_1 | UserTask_09dxtkf | save | xfdl `sSvcID="save"` (xfdl:208) | bpmn:33 |
| SequenceFlow_1p74ti7 | UserTask_09dxtkf | EndEvent_1 | — | save 종료 | bpmn:34 |
| SequenceFlow_0vmabw3 | UserTask_1j7375k | EndEvent_1 | — | search 종료 | bpmn:45 |
| SequenceFlow_0qe9z05 | ExclusiveGateway_1 | Task_1rf3f4m | search_col | xfdl `sSvcID="search_col"` (xfdl:158) | bpmn:60 |
| SequenceFlow_177rnzi | Task_1rf3f4m | EndEvent_1 | — | search_col 종료 | bpmn:61 |

> sequenceFlow 본문 정의 = **7 개** (SequenceFlow_1 / 0grwghu / 0r4u7xr / 1p74ti7 / 0vmabw3 / 0qe9z05 / 177rnzi). 제목의 "6 개" 표기는 분기 flow(3) + 종료 flow(3) + 진입(1) 구성 기준 — 실제 요소 수 = **7개**.

### 8.4 Task_1rf3f4m (search_col) 확장 속성

| property | value | 근거 |
|---|---|---|
| modelerTemplate | com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate | bpmn:46 |
| class | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | bpmn:49 |
| paramKey | (empty) | bpmn:50 |
| isServiceResult | true | bpmn:51 |
| dao | (empty) | bpmn:52 |
| sqlKey | `#{serviceId}Mapper.GetRuleColList` | bpmn:53 |
| resultKey | ds_GetRuleColUploadList | bpmn:54 |

### 8.5 action ↔ B-NNN ↔ flow 매트릭스

| sSvcID (xfdl) | 호출 함수 (xfdl) | B-NNN/T-NNN | sequenceFlow (bpmn) | target node | sqlKey / class |
|---|---|---|---|---|---|
| search | fn_fileDown (xfdl:171-185) | B-001 | SequenceFlow_0grwghu | UserTask_1j7375k | `#{basePackage}GetMasterRuleDataPopup` → GetMasterRuleDataList(#2) |
| save | fn_fileSave (xfdl:206-218) | B-003 | SequenceFlow_0r4u7xr | UserTask_09dxtkf | `#{basePackage}SaveMasterRuleFileUpload` → delete(#4)/insert(#5) |
| search_col | fn_lov (xfdl:154-168) | T-003 | SequenceFlow_0qe9z05 | Task_1rf3f4m | CommonSelectTask → GetRuleColList(#1) |
| (없음 — client) | fn_fileUpload (xfdl:188-193) | B-002 | (서버 호출 없음) | — | `gfn_importExcel` (nexacro client API) |

비고:
- search 만 BPMN 에서 후속 task 없이 즉시 End — save 도 단일 task 후 End (부모 masterRuleData 와 달리 save 후 자동 재조회 flow 없음). 재조회는 클라이언트 콜백에서 ds_grdDownload/ds_grdUpload clearData 로만 처리 (xfdl:304-305).
- BPMN sqlKey 패턴 = `#{serviceId}Mapper.GetRuleColList` — serviceId 는 oasis 런타임 주입 (As-Is="MasterRuleDataUploadFilePopup" → "MasterRuleDataUploadFilePopupMapper.GetRuleColList").

---

## §9. 사용 테이블

> **★ 메타 테이블 존재 / 동적 데이터 테이블만 동적 (§0 구분).** 정본 카탈로그 = `DMES-SECTION-MCA_테이블정의서.xlsx`. 메타 2테이블(§9.2 TB_MCA_RULE_COL_LIST sheet134 / §9.3 TB_MCA_RULE_MASTER sheet135)은 카탈로그에 수록 — 컬럼 정의 정상 매핑. 동적 데이터 테이블(§9.1 TB_MCA_<업무기준ID>)은 런타임 인스턴스라 고정 DDL 미수록(정상)이며, 그 영속/생성 전략 = **masterRuleData 가족 확정 'DDL on-demand'** (owner=MCAAPUSER — 사용자 확정 2026-06-04).

### 9.1 MCA_SOURCE.TB_MCA_<업무기준ID> (= `${pTable}`, 동적 주 테이블)

| 컬럼 | 본 화면 사용 | 용도 | 근거 |
|---|---|---|---|
| RULE_SEQ | ✓ | PK 채번 (GetMaxRuleSeq) / inserted 시 maxRuleSeq+1 | Mapper.xml:37 / java(Save):57, 62, 76 |
| RULE_VER | ✓ | inserted 시 "1" 고정 | java(Save):75 |
| (동적 컬럼들) | ✓ | ds_RuleColData(TB_MCA_RULE_COL_LIST) 정의 기반 — COL_ID 별 가변 | xfdl:262 / Mapper.xml:33 `${pTable}` SELECT * |
| (audit 컬럼) | (DB default / 외부 매퍼 ref) | 본 화면 Save 는 직접 미세팅 — To-Be McmAuditEntity | java(Save) 미설정 (§6.5 / §7.4 F-006) |

PK 추정: `(RULE_VER, RULE_SEQ)` 복합 (부모 masterRuleData pkColSet 정합). 동적 컬럼 집합은 업무기준별로 상이.

### 9.2 MCAAPUSER.TB_MCA_RULE_COL_LIST (컬럼정의 테이블 — DMES MCA Excel sheet134, owner=MCAAPUSER)

> 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet134 (xlsx 직접 파싱): `Table 명 = MCAAPUSER.TB_MCA_RULE_COL_LIST`, 항목개수 = 29. 업무컬럼 12 + 공통감사 17. 본 화면(GetRuleColList) 이 RCLIST alias 로 SELECT 하는 컬럼을 매핑.

| 컬럼 | 본 화면 사용 | 용도 | To-Be 카탈로그 (sheet134) Type/길이 | NULL | 근거 |
|---|---|---|---|---|---|
| RULE_VER | (PK 일부) | 업무기준 버전 | NUMBER(8,2) | NULL | sheet134 r25 |
| RULE_ID | ✓ | JOIN 키 (RMASTER) + WHERE / 업무기준ID | VARCHAR(10) | - | Mapper.xml:8,24,26 / sheet134 r26 |
| COL_SEQ | ✓ | 컬럼 정렬 / 항목순서 | NUMBER(3) | - | Mapper.xml:9,28 / sheet134 r27 |
| COL_ID | ✓ | 동적 컬럼 bind 키 / 항목ID | VARCHAR(30) | NULL | Mapper.xml:10 / xfdl:262,270 / sheet134 r28 |
| COL_NM | ✓ | 동적 컬럼 헤더명 / 항목명 | VARCHAR(100) | NULL | Mapper.xml:11 / xfdl:269 / sheet134 r29 |
| OLD_COL_ID | (미사용) | 기존항목ID | VARCHAR(100) | NULL | sheet134 r30 |
| IO_FLAG | ✓ | head 색 IN(red)/OUT(blue) / IN/OUT여부 | VARCHAR(10) | NULL | Mapper.xml:21 / xfdl:264,271 / sheet134 r31 |
| COL_TYPE | ✓ | 타입 (DATE → 캘린더/14자 절단) / 항목형식 | VARCHAR(10) | NULL | Mapper.xml:20 / java(Save):37,69 / sheet134 r32 |
| COL_LEN | ✓ | 항목길이 | NUMBER(5) | NULL | Mapper.xml:12 / sheet134 r33 |
| COL_PREC_LEN | (미사용) | 항목소수점길이 | NUMBER(5) | NULL | sheet134 r34 |
| MES_COL_ID | ✓ | MES테이블항목명 | VARCHAR(50) | NULL | Mapper.xml:13 / sheet134 r35 |
| MASTER_CODE_DIV (AS CODE_YN) | ✓ | 코드 여부 | VARCHAR(2) | NULL | Mapper.xml:14 / sheet134 r36 |
| (공통감사 17 컬럼) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | (감사 표준) | NULL | sheet134 r8~r24 |

> PK_YN(ds_RuleColData) 는 카탈로그 컬럼이 아니라 Mapper #1 서브쿼리(ALL_CONS_COLUMNS PK 판정)로 런타임 산출 — sheet134 미수록 정상.

### 9.3 MCAAPUSER.TB_MCA_RULE_MASTER (업무기준 마스터 — JOIN 전용 / DMES MCA Excel sheet135, owner=MCAAPUSER)

> 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet135 (xlsx 직접 파싱): `Table 명 = MCAAPUSER.TB_MCA_RULE_MASTER`, 항목개수 = 26 (업무 9 + 공통감사 17). 본 화면(GetRuleColList) 은 JOIN 키 RULE_ID 만 직접 참조.

| 컬럼 | 본 화면 사용 | 용도 / NULL여부 | 근거 |
|---|---|---|---|
| RULE_VER | (마스터 PK 일부) | 업무기준 버전 / Y(NULL) | sheet135 r25 |
| RULE_ID | ✓ | GetRuleColList JOIN (`RMASTER.RULE_ID = RCLIST.RULE_ID`) + WHERE / N(NOT NULL) | Mapper.xml:22,24,26 / sheet135 r26 |
| OLD_RULE_ID | (미사용) | 기존 업무기준ID / Y | sheet135 r27 |
| RULE_NM | (미직접 SELECT) | 업무기준명 / N(NOT NULL) — 부모 P-001 로 표시 | sheet135 r28 |
| RULE_DESC | (미사용) | 업무기준 설명 / Y | sheet135 r29 |
| RULE_TP | (미사용) | 업무기준 유형 / Y | sheet135 r30 |
| RULE_OWNER_DEPT_NM | (미사용) | 담당부서명 / Y | sheet135 r31 |
| RULE_OWNER_EMP_NO | (미사용) | 담당자 사번 / Y | sheet135 r32 |
| USE_TP | (미사용) | 사용 구분 / Y | sheet135 r33 |
| (공통감사 17 컬럼) | (audit) | CREATED_*/LAST_UPDATE_*/DATA_END_*/ARCHIVE_* | sheet135 r8~r24 |

### 9.4 PK 추정 / DMES Excel 매핑 (정본 확정)

- 동적 데이터 테이블 PK = `(RULE_VER, RULE_SEQ)` 복합 (부모 masterRuleData pkColSet 정합).
- 메타 테이블 owner = **MCAAPUSER** (xlsx sheet134/135 r2 직접 확인). As-Is SQL schema prefix = `MCA_SOURCE` (Oracle synonym 추정) → To-Be **MCAAPUSER** 정합.
- **To-Be audit**: As-Is sheet134/135 의 DATA_END_*/ARCHIVE_* 9 컬럼 → cactus/Mcm 표준 audit 9 컬럼으로 대체 (가족 확정). 동적 데이터 테이블 audit 도 동일 정책.

---

## §10. 코드값 / LoV

### 10.1 본 화면 직접 LoV 호출

| 항목 | 내용 | 근거 |
|---|---|---|
| 그리드 동적 컬럼 정의 | ds_RuleColData(TB_MCA_RULE_COL_LIST) — COL_ID/COL_NM/CODE_YN/PK_YN/COL_TYPE/IO_FLAG (search_col) | xfdl:154-168 / Mapper.xml:7-29 |
| IO_FLAG (그리드 색상) | IN → red / OUT → blue (셀 cssclass) | xfdl:271, 289 |
| COL_TYPE=="DATE" | calendar 포맷 + 저장 시 `-` 제거·14자 절단 | xfdl:266-268 / java(Save):69-72 |
| PK_YN | ALL_CONS_COLUMNS 런타임 PK 판정 (서브쿼리) | Mapper.xml:15-19 |
| chk_regFlag (삭제등록) | 단순 trigger flag (상태 enum 아님) | xfdl:77 / java(Save):47 |

> NewCodeQuery / 공통 코드 마스터 직접 호출 ✗ (xfdl 전수 확인). 동적 컬럼 정의 자체가 본 화면의 유일한 LoV 성격 데이터.

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

### 11.1 SQL 식 단위 변환점

| # | As-Is (Oracle) | 위치 | To-Be (MSSQL) | 영향 |
|---:|---|---|---|---|
| C-001 | `NVL2(MAX(CONSTRAINT_NAME), 'Y','N')` | Mapper.xml:15 | `CASE WHEN MAX(...) IS NOT NULL THEN 'Y' ELSE 'N' END` | PK_YN 판정 |
| C-002 | `NVL(MAX(RULE_SEQ),0)` | Mapper.xml:37 | `ISNULL(MAX(RULE_SEQ),0)` 또는 `COALESCE(...)` | 채번 base |
| C-003 | `'TB_MCA_' \|\| #{pRuleId}` (문자열 결합) | Mapper.xml:17 | `'TB_MCA_' + #{pRuleId}` 또는 CONCAT | PK_YN 서브쿼리 |
| C-004 | `ALL_CONS_COLUMNS` 시스템 카탈로그 PK 판정 | Mapper.xml:16 | `sys.indexes`/`INFORMATION_SCHEMA.KEY_COLUMN_USAGE` 등가 변환 (또는 메타 컬럼 직접 보유) | 동적 PK 판정 |
| C-005 | `MCA_SOURCE.${pTable}` / `MCA_SOURCE.TB_MCA_RULE_*` schema prefix | Mapper.xml 다수 | owner **MCAAPUSER** (DMES-SECTION-MCA 정합) | 모든 SQL FROM 절 |
| C-006 | `${pTable}` 동적 테이블명 치환 (SQL injection 표면) | Mapper.xml:33,38 / java(Save):52,77 | **To-Be 안전화 필수** — 화이트리스트(업무기준ID 메타 검증) + 바인딩. 임의 테이블 치환 차단 (가족 확정 Q-104) | 동적 영속 |
| C-007 | `${pTable}_Mapper.delete/insert` 외부 동적 namespace | java(Save):52,77 | 테이블별 개별 Mapper → To-Be 동적 영속 전략 결정 (DDL on-demand 정합) | 동적 영속 |
| C-008 | `MasterRuleDataMapper.GetMaxRuleSeq` (부모 매퍼 namespace 호출) | java(Save):57 | 본 화면 매퍼(#3)로 일원화 권고 (Q-103) | 채번 호출 경로 |
| C-009 | 컬럼명 대문자/언더스코어 | 본 화면 동적 컬럼 | 그대로 유지 + Entity camelCase 매핑 | Entity 매핑 시 |

### 11.2 파일 업로드 처리 영향 (DBMS 변환과 무관)

- **xfdl `gfn_importExcel` 자체는 nexacro client 처리 — 서버 DBMS 변경 영향 없음** (xfdl:192).
- **To-Be Excel parsing**: SheetJS (FE) — 가족 정합 (masterCodeUploadFilePopup 선례).
- **To-Be 전송 spec**: REST API JSON (행 배열) — As-Is OASIS gfn_transaction 컨벤션 유지.

### 11.3 식별자 / 패키지 변환점

| As-Is | To-Be | 비고 |
|---|---|---|
| MasterRuleDataUploadFilePopup (Form id / BPMN process id) | masterRuleDataUploadFilePopup | 화면식별자 |
| MasterRuleDataUploadFilePopupMapper (namespace) | masterRuleDataUploadFilePopupMapper | namespace |
| GetRuleColList / GetMasterRuleDataList / GetMaxRuleSeq (select id) | **As-Is 보존** (PascalCase SQL id) | 가족 정합 |
| com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.{Get,Save}* | Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.{service,dto}.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 | RULE.md §"패키지 명명 규칙" §3-1 / 가족 정합 |

---

## §12. 결정 후보 / Q-NNN

> masterRuleData 가족 확정 사항(사용자 확정 2026-06-04) 을 본 화면도 1:1 적용. Q-101 / Q-102 / Q-103 = **사용자 확정 2026-06-05**. 부모 = masterRuleData (호출관계 확인). 활성 확인필요 = **0 건**. 그 외는 가족 확정으로 해소.

| Q-NNN | 영역 | 확인 내용 | 본문 | 상태 |
|---|---|---|---|---|
| Q-101 | 동적 그리드 | ds_RuleColData 기반 동적 컬럼 빌드(IN·OUT 색/DATE 캘린더/3행 다운로드 헤더) FE 동일 구현 방식 | §3.3/§3.4 | **확정: FE 동일 구현 (2026-06-05)** |
| Q-102 | 삭제등록 UX | chk_regFlag=true 시 본 테이블 전건 삭제 (`WHERE 1=1`) → **확정: confirm 메시지 추가 + 미리보기 빈 상태 시 전건삭제 차단 가드** (사용자 2026-06-05) | §6.4/§7.4 | **확정** |
| Q-103 | 채번 namespace | maxRuleSeq 가 부모 `MasterRuleDataMapper.GetMaxRuleSeq` 호출(java:57) → **확정: 본 화면 매퍼 #3 로 일원화** (사용자 2026-06-05) | §6.3/§7.4 F-004 | **확정** |

| 결정 영역 (가족 확정 — 적용) | 결정 내용 | 본문 |
|---|---|---|
| 영속성 | **JPA** (가족 확정 2026-06-04) | §0 |
| 동적 데이터 테이블 전략 | **DDL on-demand** (`TB_MCA_<업무기준ID>` 동적 생성/조회, owner=MCAAPUSER) | §9.1 |
| 동적 SQL 안전화 (Q-104) | `${pTable}` 화이트리스트(업무기준ID 메타 검증) + 바인딩 — injection 차단 | §11.1 C-006 |
| audit (Q-105) | As-Is DATA_END_*/ARCHIVE_* → cactus/Mcm 표준 audit 9 컬럼 (McmAuditEntity) | §6.5/§9.4 |
| schema/테이블명 | As-Is `MCA_SOURCE` → **MCAAPUSER** (메타) + 동적 테이블 owner=MCAAPUSER | §9.4 |
| Excel parsing | SheetJS (FE) — 가족 선례 | §11.2 |
| 전송 spec | REST API JSON (행 배열) | §11.2 |
| Java 패키지 | Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.{service,dto}.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 | §11.3 |
| 권한 | To-Be 외부 권한 프로세스 위임 | 기능 §8 |
| Mapper SQL id | As-Is PascalCase 보존 | §11.3 |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 점검 항목 | 결과 | 근거 |
|---|---|---|---|
| G-1 | xfdl Form@id == BPMN process@id == asIsId | ✓ | 모두 "MasterRuleDataUploadFilePopup" (xfdl:3 / bpmn:3) |
| G-2 | xfdl 컴포넌트 전수 (Div 4 + Button 1 + Static 3 + Edit 3 + CheckBox 1 + Grid 2 + Dataset 3) | ✓ | §3 |
| G-3 | xfdl `sSvcID` 값 (search / save / search_col) == BPMN sequenceFlow@name | ✓ | bpmn:22 / bpmn:33 / bpmn:60 |
| G-4 | Java 메서드 전수 (Get: run / Save: run) | ✓ | §7 |
| G-5 | Mapper.xml SQL 전수 (3 본화면 + delete/insert 외부 = 5) | ✓ | §6 |
| G-6 | bpmn flow 노드 전수 (Start/End + Gateway + UserTask 2 + Task 1 = 6 노드, sequenceFlow 7) | ✓ | §8.2 / §8.3 |
| G-7 | action 매트릭스 일치 (search/save/search_col + client-side 2) | ✓ | §4.4 |
| G-8 | 식별자 cite (모든 본문 주장 file:line) | ✓ | 본 문서 전수 |
| G-9 | 활성 확인필요 = 3 (Q-101/102/103) — 가족 확정(JPA/DDL on-demand/안전화/audit/MCAAPUSER/SheetJS/패키지) 적용 | △ | §12 |
| G-10 | Runner 미적용(R-14) 명시 / 메타 테이블(DMES-SECTION-MCA sheet134/135 수록) ↔ 동적 데이터 테이블(런타임 인스턴스) 구분 명시 | ✓ | §0, §9, 정합체크서 §D.4 |

## §14. 커버리지 매트릭스

| 영역 | 발견 (xfdl/java/xml/bpmn 자산 카운트) | 본 보고서 반영 | Q-NNN | 자연제외 |
|---|---:|---:|---:|---:|
| xfdl Div | 4 (div_main/div_title/div_bottom/div_search) | 4 (§3.1) | 0 | 0 |
| xfdl Static | 3 (stc_ruldId/stc_ruleNM/stc_flag) | 3 (§3.2) | 0 | 0 |
| xfdl Edit | 2 (edt_MasterRuleId/edt_MasterRuleNm) + edt_title 1 | 3 (§3.1/§3.2) | 0 | 0 |
| xfdl CheckBox | 1 (chk_regFlag) | 1 (§3.2 S-003) | 0 | 0 |
| xfdl Button (native) | 1 (btn_fold) | 1 (§4.3 T-001) | 0 | 0 |
| xfdl Button (commonTopButton 동적) | 4 (btn_fileDown/btn_fileUpload/btn_fileSave/btn_close) | 4 (§4.1/§4.2) | 0 | 0 |
| xfdl Grid | 2 (grd_Upload/grd_Download) | 2 (§3.3/§3.4) | 0 | 0 |
| xfdl Dataset | 3 (ds_grdUpload/ds_grdDownload/ds_RuleColData) | 3 (§3.5) | 0 | 0 |
| xfdl Dataset 컬럼 | 8 (2×RULE_ID + 6×ds_RuleColData) | 8 (§3.5) | 0 | 0 |
| xfdl method | 11 (onload/fn_formAfterOnload/fn_button/fn_lov/fn_fileDown/fn_fileUpload/fn_callImportBack/fn_fileSave/fn_callBack/fn_close/btn_fold_onclick) | 11 (§4/§5/§7/§10) | 0 | 0 |
| Mapper SQL (본 화면 전용) | 3 (GetRuleColList/GetMasterRuleDataList/GetMaxRuleSeq) | 3 (§6) | 0 | 0 |
| Mapper SQL (외부 동적 — Save 사용) | 2 (delete/insert) | 2 (§6) | 0 | 0 |
| Java 메서드 | 2 (GetMasterRuleDataPopup.run / SaveMasterRuleFileUpload.run) | 2 (§7) | 0 | 0 |
| BPMN node | 6 (Start/EG/UserTask 2/Task 1/End) | 6 (§8.2) | 0 | 0 |
| BPMN sequenceFlow | 7 | 7 (§8.3) | 0 | 0 |

**합계**: 발견 자산 100% 본 보고서 반영. 자연제외 0건. Q-NNN 활성 3건 (Q-101/102/103).
