---
screenId: commPermMng
asIsId: CommPermMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# PERMISSION 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner 의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 (manifest 9 파일 검증) | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + java / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만"은 mui 환경에 미적용. cite 는 file:line 형식 유지 |
| Java UserTask 디렉토리 | (해당 없음 — ScriptTask 만) | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/` 하위에 `CommPermMng` 폴더 부재 (ls 확인). BPMN 의 Task 3 개 모두 `CommonSelectTask` / `CommonMultiSaveTask` 표준 ScriptTask — 화면 전용 Java 코드 없음 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | PERMISSION 관리 (xfdl titletext: "PERMISSON 관리" — 오타) |
| 화면 식별자 (screenId) | commPermMng |
| As-Is 식별자 (asIsId) | CommPermMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > PERMISSION 관리 (commPermMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commPermMng |
| pageId | commPermMng |
| serviceId | commPermMng |
| Frontend 파일명 | `commPermMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> PERMISSION 관리는 CommPermMng (TB_MCM_SEC_PERM 권한 마스터) 의 조회, 등록, 수정, 저장을 수행한다.

- 주 사용자: 시스템 관리자 / 권한 운영 담당자
- 업무 도메인: 공통 보안 모듈 (mcm — Master Code Management) 의 권한 마스터 (PERMISSION) 정의 화면. 권한 ID 단위로 공통 버튼 / CUSTOM 버튼 / POPUP 버튼 / ACTION 권한 을 등록·관리하며, 다른 권한 관련 화면 (commRoleGrpMng / commRoleMng / commUserMng 등) 이 본 화면에서 등록한 PERMISSION_ID 를 참조한다.
- 기능 요약 (BPMN action 2 enum + UI 트리거 2 = 4 동작 — **cross-cutting 정책 #1 적용 (2026-05-31): BIZ_SYSTEM_CODE 폐기로 lov action 제거**):
  1. `searchCmPerm` — Permission 그리드 조회 (`fn_search` → `fn_run("searchCmPerm")`, xfdl:368~370 / xfdl:297~302)
  2. `saveCmPerm` — Permission 그리드 일괄 저장 (UPDATE/INSERT/DELETE 분기) (`fn_save` → `fn_run("saveCmPerm")`, xfdl:423~442)
  3. ~~`lov` — BIZ SYSTEM (App Host ID) 콤보 LoV 조회~~ — **As-Is**: `fn_lov` (xfdl:256~263, onload 1회) → cross-module `CommObjMngMapper.selectAppHostId` 호출. **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기 + cross-module 호출 제거)
  4. (popup) `commonPermBtnPopup` — 공통 버튼 권한 / CUSTOM 버튼 권한 textarea 채움 팝업 (xfdl:472~482)
  5. (client 전용) row 추가 / 행복사 / 행삭제 / 행취소 / 초기화 / 접기 (xfdl:378~421 / xfdl:467~469)

---

## §2. 자료 수집 인벤토리 (mui 4 자산 + Java 폴더 부재)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommPermMng.xfdl` | 509 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / TextArea / Radio / Calendar / Dataset / Script / Bind 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask | (해당 없음) | - | N | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommPermMng/` 폴더 부재 (ls 확인 — csa 하위는 CommChainMasterMng / CommSyncMng / CommUserMng / CommUserRoleCopy 4 폴더만 존재). 본 화면은 ScriptTask (`CommonSelectTask` / `CommonMultiSaveTask`) 표준 Task 만 사용 — 화면 전용 Java UserTask ✗ | §7 (해당 없음) |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommPermMngMapper.xml` | 99 | Y | 4 SQL ID (select 1 / insert 1 / update 1 / delete 1) — 모두 호출 | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommPermMng.bpmn` | 155 | Y | StartEvent / ExclusiveGateway 3 분기 / Task 3 (CommonSelectTask 2 + CommonMultiSaveTask 1) / EndEvent 1 / SequenceFlow 7 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (csa cma 모듈 SEC 시트 분리 확인 필요) | N (본 분석 시점 미인입) | TB_MCM_SEC_PERM / TB_MCM_SEC_ROLE_MAPPING DDL 정의서 부재 → [확인필요: Q-001] DMES Excel csa 시트 추출 (xlsx 압축 해제 + xml 파싱). 본 분석은 Mapper.xml 의 INSERT/UPDATE 컬럼 + As-Is 보존 컬럼만 카탈로그 등재 | §9 |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.insert_item / insert_value / update">` 3 회 호출은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | §11 |
| 7 | commonPermBtnPopup.xfdl | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/_com_popup/commonPermBtnPopup.xfdl` (추정 경로 — gfn_openPopup 인자 `_com_popup::commonPermBtnPopup.xfdl` 기준) | - | N (본 화면 외부 — 별도 화면 분석 대상) | 본 분석은 호출 인자 (`oArg = {btnChk:"common" or "custom"}`) + 콜백 반환 (`rtVal.rtnValeChk + rtnVale`) 만 §5 P-NNN 에 등재 | §5 |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 ("PERMISSON 관리") + 공통 topMenu | xfdl:134~141 |
| A-FILTER | `Div div_search` | top=`div_title:10` / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (BIZ SYSTEM / PERMISSION ID / PERMISSION 명 / 사용 여부) | xfdl:142~155 |
| A-FOLD | `Button btn_fold` | top=93 / height=12 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:7 |
| A-MAIN | `Div div_main` | top=`btn_fold:20` / bottom=40 / left=20 / right=20 | 마스터 그리드 + 상세 영역 좌우 분할 컨테이너 | xfdl:8 |
| A-MAIN-LEFT (G) | `Div div_mainGrd` | top=0 / bottom=0 / left=0 / right=520 | Permission 마스터 그리드 + commonLeftButton / commonRightButton | xfdl:11~71 |
| A-MAIN-RIGHT (D) | `Div div_mainDetail` | top=0 / left=`div_mainGrd:10` / width=500 / height=475 | Permission 상세 입력 폼 (PERMISSION ID / 명 / 설명 / BIZ SYSTEM / 사용여부 / 유효개시일 / 유효기한일 / 공통/CUSTOM/POPUP/ACTION 권한 TextArea) | xfdl:72~130 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:6 |

### §3.2 조회조건 (S-NNN)

> **cross-cutting 정책 #1 적용 (2026-05-31)**: S-001 `cbo_bizSystemCode` 콤보는 **To-Be 폐기** (BIZ_SYSTEM_CODE 컬럼 폐기 + cross-module `CommObjMngMapper.selectAppHostId` 호출 제거). As-Is 인용은 보존 + To-Be 폐기 명시.

| ID | 화면 표시명 (Static.text or value) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ SYSTEM~~ | ~~`cbo_bizSystemCode` (옆 라벨 `stc_bizSystemCode` Edit readonly)~~ | ~~Combo~~ | - | ~~innerdataset=`ds_lovSubSystem`, codecolumn=`APP_HOST_ID`, datacolumn=`APP_HOST_ID`, value="Y", text="Y", displaynulltext="전체"~~ | ~~N~~ | xfdl:145~146 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |
| S-002 | PERMISSION ID | `edt_PERMISSION_ID` (옆 라벨 `sts_permissionId` Edit readonly) | TextBox | 100 | text="부산역 CY" (default placeholder — 저장 ✗) | N | xfdl:147~148 |
| S-003 | PERMISSION 명 | `edt_PERMISSION_NM` (옆 라벨 `sts_permissionNm` Edit readonly) | TextBox | 100 | text="부산역 CY" (default placeholder) | N | xfdl:149~150 |
| S-004 | 사용 여부 | `cbo_USE_TP` (옆 라벨 `sts_useTp` Edit readonly) | Combo | - | innerdataset=`ds_cmbValidYn` (Y/N 2 행 hardcoded), codecolumn=`condCd`, datacolumn=`condNm`, value="Y", text="Y", index=0 | N | xfdl:151~152 |

> S-002 / S-003 의 `text="부산역 CY"` 는 xfdl 작성 시 default placeholder 텍스트 (편집기 미정리). xfdl onload 콜백 `gfn_setFirstRow(ds_cmbValidYn, ...)` (xfdl:247) + `fn_reset` 의 `set_index(1)` (xfdl:375) 로 화면 표시 시 첫 행 선택됨. **To-Be**: 빈 값으로 정정.

### §3.3 마스터 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, taborder=0)

| ID | head text | body bind | 컬럼 size | edittype | editmaxlength | 기타 (combo / inputmode / displaytype) | 필수 (CellEssentail) | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | 상태 | `bind:STATUS` (displaytype=`imagecontrol`, band="left") | 30 | - (자동) | - | Nexacro auto row state icon | - | xfdl:19 / 37 / 51 |
| G-002 | PERMISSION ID | `bind:PERMISSION_ID` | 107 | (기본 — text 추정) | - | textAlign="left", autosizecol="limitmin" | (가이드 fn_save 필수 — `gfn_dsRequired("PERMISSION_ID USE_TP")`, xfdl:431) | xfdl:20 / 38 / 52 |
| G-003 | PERMISSION명 | `bind:PERMISSION_NM` | 117 | text | - | textAlign="left", autosizecol="limitmin" | N | xfdl:21 / 39 / 53 |
| G-004 | 공통 버튼 권한 | `bind:PERMISSION_COMMON` | 193 | text | - | textAlign="left", autosizecol="none" | N | xfdl:22 / 40 / 54 |
| G-005 | CUSTOM 버튼 권한 | `bind:PERMISSION_CUSTOM` | 210 | text | - | textAlign="left", autosizecol="none" | N | xfdl:23 / 41 / 55 |
| G-006 | POPUP\r\n버튼 (멀티라인) | `bind:POPUP_BTN` | 80 | text | - | textAlign="left", autosizecol="limitmin" | N | xfdl:24 / 42 / 56 |
| G-007 | ACTION 권한 | `bind:PERMISSION_ACTION` | 135 | text | - | textAlign="left", autosizecol="none" | N | xfdl:25 / 43 / 57 |
| G-008 | BIZ\r\nSYSTEM (멀티라인) | `bind:BIZ_SYSTEM_CODE` | 56 | text | - | autosizecol="limitmin" | N | xfdl:26 / 44 / 58 |
| G-009 | 사용\r\n여부 (멀티라인) | `bind:USE_TP` | 30 | text | - | autosizecol="limitmin" | (fn_save 필수 — xfdl:431) | xfdl:27 / 45 / 59 |
| G-010 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | (date) | - | calendardateformat="yyyy-MM-dd", autosizecol="limitmin", displaytype="date" | N | xfdl:28 / 46 / 60 |
| G-011 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | (date) | - | calendardateformat="yyyy-MM-dd", autosizecol="limitmin", displaytype="date" | N | xfdl:29 / 47 / 61 |
| G-012 | 권한 설명 | `bind:PERMISSION_DESC` | 134 | text | - | autosizecol="limitmin" | N | xfdl:30 / 48 / 62 |

- 그리드 옵션: `selecttype="cell"`, `scrollbartype="auto"`, `autosizingtype="col"`, `cellsizingtype="col"`, `cellmovingtype="col"`, `cellsizebandtype="allband"`, head Row 1 size=40 + body Row 1 size=24, band="left" (G-001 만)
- 이벤트: `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` (gfn 공통 정렬, xfdl:462~465)

### §3.4 상세 그리드 GE-NNN

해당 없음 — 본 화면은 단일 마스터 그리드 + 상세 입력 폼 (D-NNN) 구조 (GE = 0). div_mainDetail 영역은 §3.5 에서 등재.

### §3.5 상세 입력 필드 D-NNN (`div_mainDetail`, taborder=1)

> div_mainDetail 영역의 모든 입력 컴포넌트를 전수 등재. Bind (xfdl:495~507) 11 개 BindItem 통해 `ds_main` 와 양방향 바인딩.

| ID | 화면 표시명 (Static.text / Edit.value) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 바인딩 컬럼 | 필수 (cssclass `Essential`) | 근거 |
|---|---|---|---|---:|---|---|---|---|
| D-001 | (라벨) "PERMISSION ID" | `edt_st_permission_id` (Edit readonly, cssclass `edi_WF_LabelFirstE` — E = Essential 라벨) | (표시 전용) | - | - | - | (라벨 자체 E) | xfdl:85 |
| D-002 | PERMISSION ID (입력) | `edt_permission_id` | TextBox (cssclass `Essential`) | 90 | inputtype="normal", inputmode="normal", text="부산역 CY" (placeholder — 저장 ✗) | `PERMISSION_ID` | Y (cssclass `Essential` — xfdl:92) | xfdl:92 / bind item0 (xfdl:496) |
| D-003 | (라벨) "PERMISSION명" | `edt_st_permission_nm` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:83 |
| D-004 | PERMISSION명 (입력) | `edt_permission_nm` | TextBox | 100 | inputtype="normal", text="부산역 CY" (placeholder) | `PERMISSION_NM` | N | xfdl:94 / bind item4 (xfdl:498) |
| D-005 | (라벨) "PERMISSION 설명" | `edt_st_permission_desc` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:86 |
| D-006 | PERMISSION 설명 (입력) | `edt_permission_desc` | TextBox | 100 | inputtype="normal", text="부산역 CY" (placeholder) | `PERMISSION_DESC` | N | xfdl:114 / bind item8 (xfdl:501) |
| ~~D-007~~ | ~~(라벨) "BIZ SYSTEM"~~ | ~~`edt_st_BIZ_SYSTEM_CODE` (Edit readonly, cssclass `edi_WF_LabelE` — E = Essential 라벨)~~ | ~~(표시 전용)~~ | - | - | - | ~~(라벨 자체 E)~~ | xfdl:126 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |
| ~~D-008~~ | ~~BIZ SYSTEM (선택)~~ | ~~`cbo_bizSystemCode` (Detail 영역 — div_mainDetail)~~ | ~~Combo (cssclass `Essential`)~~ | - | ~~index=0, codecolumn="APP_HOST_ID", datacolumn="APP_HOST_ID", displayrowcount=10, text="내부 neXacro", innerdataset=`ds_lovSubSystem`~~ | ~~`BIZ_SYSTEM_CODE`~~ | ~~Y (cssclass `Essential` — xfdl:127)~~ | xfdl:127 / bind item10 (xfdl:506) (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1 — Essential cssclass 제거 / Bind item10 제거) |
| D-009 | (라벨) "사용 여부" | `edt_st_use_tp` (Edit readonly, cssclass `edi_WF_LabelFirst`) | (표시 전용) | - | - | - | - | xfdl:87 |
| D-010 | 사용 여부 (선택) | `edt_use_tp` (Radio) | Radio (vertical) | - | innerdataset (hardcoded Y/Yes + N/No), codecolumn="codecolumn", datacolumn="datacolumn", direction="vertical", value="Y", text="Yes", index=0 | `USE_TP` | (fn_save 시 필수 — xfdl:431) | xfdl:95~112 / bind item6 (xfdl:499) |
| D-011 | (라벨) "유효 개시일" | `ed_st_start_active_date` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:82 |
| D-012 | 유효 개시일 (입력) | `cal_start_active_date` | Calendar | - | usetrailingday="true", dateformat="yyyy-MM-dd" | `START_ACTIVE_DATE` | N | xfdl:113 / bind item7 (xfdl:500) |
| D-013 | (라벨) "유효 기한일" | `edt_st_end_active_date` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:91 |
| D-014 | 유효 기한일 (입력) | `cal_end_active_date` | Calendar | - | usetrailingday="true", dateformat="yyyy-MM-dd" | `END_ACTIVE_DATE` | N | xfdl:93 / bind item2 (xfdl:497) |
| D-015 | (라벨) "공통 버튼 권한\r\n(commonTop, commonTopCustom, \r\ncommonRight)" (멀티라인 Static, cssclass `stc_WF_Label1`) | `edt_st_permission_common` (Static) | (표시 전용 — 멀티라인 라벨) | - | - | - | - | xfdl:119 |
| D-016 | 공통 버튼 권한 (입력) | `txa_permission_common` (TextArea) | TextArea | - | - | `PERMISSION_COMMON` | N | xfdl:115 / bind item1 (xfdl:502) |
| D-017 | (보조) 공통 버튼 권한 팝업 호출 버튼 | `btn_common_find` (Button, cssclass `btn_WF_Find`) | Button | - | - | - (팝업 호출 — txa_permission_common 에 값 세트) | - | xfdl:120 / handler xfdl:472~476 |
| D-018 | (라벨) "CUSTOM 버튼 권한" | `edt_st_permission_custom` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:84 |
| D-019 | CUSTOM 버튼 권한 (입력) | `txa_permission_custom` (TextArea) | TextArea | - | - | `PERMISSION_CUSTOM` | N | xfdl:116 / bind item5 (xfdl:503) |
| D-020 | (보조) CUSTOM 버튼 권한 팝업 호출 버튼 | `btn_custom_find` (Button, cssclass `btn_WF_Find`) | Button | - | - | - (팝업 호출 — txa_permission_custom 에 값 세트) | - | xfdl:121 / handler xfdl:478~482 |
| D-021 | (라벨) "POPUP 버튼" | `edt_st_popup_btn` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:89 |
| D-022 | POPUP 버튼 (입력) | `txa_popup_btn` (TextArea) | TextArea | - | - | `POPUP_BTN` | N | xfdl:117 / bind item3 (xfdl:504) |
| D-023 | (라벨) "ACTION 권한" | `edt_st_permission_action` (Edit readonly, cssclass `edi_WF_Label`) | (표시 전용) | - | - | - | - | xfdl:124 |
| D-024 | ACTION 권한 (입력) | `txa_permission_action` (TextArea) | TextArea | - | - | `PERMISSION_ACTION` | N | xfdl:123 / bind item9 (xfdl:505) |
| D-025 | (영역 라벨) "상세 정보" | `edt_dtl_info` (Edit readonly, cssclass `edi_WF_Title1`) | (표시 전용 — div_mainDetail 상단 타이틀) | - | - | - | - | xfdl:118 |
| D-026 | (영역 라벨) "조회 결과" | `edt_srch_cseq` (Edit readonly, cssclass `edi_WF_Title1`, div_mainGrd 상단 좌측) | (표시 전용 — div_mainGrd 상단 타이틀) | - | - | - | - | xfdl:67 |

> div_mainDetail 의 모든 Static stc_StaticN (Box / line — 시각적 구분만, cssclass `stc_WF_Box` / `stc_WF_BoxFirst`) 는 D-NNN 등재 ✗ (입력/표시 의미 없음, xfdl:75~81 / 88 / 90 / 122 / 125). 영역 구분은 §3.1 A-MAIN-RIGHT 에 흡수.

### §3.6 div_mainDetail / div_mainGrd 상단 컴포넌트 (Static / Combo / Div include)

| ID | xfdl id | 컨트롤 종류 | 좌표 | 역할 | 데이터셋 / 코드열 / 표시열 | 이벤트 | 근거 |
|---|---|---|---|---|---|---|---|
| FX-001 | `div_rightMenu` | Div (url include `_com_div::commonRightButton.xfdl`) | top=0 / height=21 (div_mainGrd 내) / right=0 / width=310 | 공통 우측 메뉴 (행추가 / 행복사 / 행삭제 / 행취소 4 버튼) | - | (외부 처리 — `fn_commonRight_onload` 등록) | xfdl:14 / handler xfdl:237~241 |
| FX-002 | `div_leftMenu` | Div (url include `_com_div::commonLeftButton.xfdl`) | top=0 / left=`edt_srch_cseq:5` / width=213 / height=21 (div_mainGrd 내) | 공통 좌측 메뉴 (chk_check / btn_sum) | - | (외부 처리 — `fn_commonLeft_onload` 등록) | xfdl:68 / handler xfdl:231~235 |
| FX-003 | `div_topMenu` | Div (url include `_com_div::commonTopButton.xfdl`) | height=27 / left=270 / right=0 / top=10 (div_title 내) | 공통 상단 메뉴 (btn_search / btn_reset / btn_save / btn_close 4 버튼) | - | (외부 처리 — `fn_commonTop_onload` 등록) | xfdl:138 / handler xfdl:225~229 |
| FX-004 | `div_bottom` | Div (url include `_com_div::commonBottomStatus.xfdl`) | bottom=0 / height=20 | 공통 하단 status 메시지 (`fn_commonBottomStatus_msg`) | - | (외부 처리) | xfdl:6 / 호출 xfdl:334 / 343 |

### §3.7 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_main` | PERMISSION_ID / PERMISSION_NM / PERMISSION_DESC / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / USE_TP / PERMISSION_ACTION / START_ACTIVE_DATE / END_ACTIVE_DATE / ~~BIZ_SYSTEM_CODE~~ (To-Be 폐기) / ROLE_ID (총 12 컬럼 — To-Be **11 컬럼**) | 마스터 + 상세 그리드 데이터 (양방향 바인딩) | useclientlayout=true / `onrowposchanged="ds_main_onrowposchanged"` (xfdl:451~459) / loadkeymode="reset" / type STRING(256) 통일. **To-Be 정책 #1**: BIZ_SYSTEM_CODE 컬럼 폐기로 ds_main 11 컬럼 | xfdl:159~174 |
| DS-002 | `ds_cmbValidYn` | condCd / condNm | S-004 (사용 여부 콤보) LoV (Y/Y, N/N 2 행) | 정적 hardcoded Dataset (xfdl:180~189) | xfdl:175~190 |
| ~~DS-003~~ | ~~`ds_lovSubSystem`~~ | ~~APP_HOST_ID~~ | ~~S-001 / D-008 (BIZ SYSTEM 콤보 — 검색조건 + 상세 입력) LoV~~ | ~~DB 호출 — `fn_lov` (xfdl:256~263) → `gfn_transaction("lov", ...)` → BPMN action `lov` → `CommObjMngMapper.selectAppHostId` (BPMN bpmn:65, **cross-module mapper 참조**)~~ | xfdl:191~195 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |

> Radio `edt_use_tp` (D-010, xfdl:95~112) 내부의 `innerdataset` 은 Component-local Dataset (codecolumn / datacolumn Y/Yes + N/No 2 행 hardcoded) — DS-NNN 별도 등재 ✗ (컴포넌트 내장). xfdl:96~111 참조.

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick)

| ID | 위치 | 버튼명 (text) | xfdl id | onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_main 상단 (접기 토글) | (접기 토글) | `btn_fold` | `btn_fold_onclick` (xfdl:467~470) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 | - (클라이언트 전용) | xfdl:7 / 467 |
| B-002 | div_mainDetail 내 (D-016 우측) | (공통버튼 권한 찾기) | `btn_common_find` | `div_main_div_mainDetail_btn_common_find_onclick` (xfdl:472~476) | `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", oArg={btnChk:"common"}, "", "fn_PermBtnCallBack")` | popup | xfdl:120 / 472 |
| B-003 | div_mainDetail 내 (D-019 우측) | (CUSTOM 권한 찾기) | `btn_custom_find` | `div_main_div_mainDetail_btn_custom_find_onclick` (xfdl:478~482) | `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", oArg={btnChk:"custom"}, "", "fn_PermBtnCallBack")` | popup | xfdl:121 / 478 |

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:36~63 G 전수 검토).

### §4.3 공통 topMenu / leftMenu / rightMenu 버튼 (외부 인입)

| ID | 경로 | 등록 위치 | 호출 함수 | 등록 버튼 | 트리거 → 핸들러 | 근거 |
|---|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:138) | `fn_commonTop_onload(this, "", new Array(["btn_search"],["btn_reset"],["btn_save"],["btn_close"]), false, "")` (xfdl:225~229) | btn_search / btn_reset / btn_save / btn_close (4 기본 버튼) | btn_search → `fn_search()` (xfdl:368) / btn_reset → `fn_reset()` (xfdl:373) / btn_save → `fn_save()` (xfdl:423) / btn_close → `fn_close()` (xfdl:444) | xfdl:225 |
| EX-002 | `_com_div::commonLeftButton.xfdl` (url include) | `div_main.div_mainGrd.div_leftMenu` (xfdl:68) | `fn_commonLeft_onload(this, grd_main, div_leftMenu, new Array("chk_check","btn_sum"), "")` (xfdl:231~235) | chk_check / btn_sum (2 버튼) | (외부 처리 — 체크박스 / sum 행) | xfdl:231 |
| EX-003 | `_com_div::commonRightButton.xfdl` (url include) | `div_main.div_mainGrd.div_rightMenu` (xfdl:14) | `fn_commonRight_onload(this, "", new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` (xfdl:237~241) | btn_rowAdd / btn_rowDelete / btn_rowCopy / btn_rowCancel (4 기본 버튼) | btn_rowAdd → `fn_rowAdd()` (xfdl:378) / btn_rowDelete → `fn_rowDelete()` (xfdl:402) / btn_rowCopy → `fn_rowCopy()` (xfdl:391) / btn_rowCancel → `fn_rowCancel()` (xfdl:419) | xfdl:237 |
| EX-004 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:6) | `fn_commonBottomStatus_msg(...)` 호출 (xfdl:334 / 343) | (외부 표시 전용) | (외부 처리 — status 메시지 표시) | xfdl:6 |

### §4.4 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:197~494) 의 모든 function 을 전수 등재 (As-Is 총 20 개 — formBeforeOnload 1 + onload 1 + fn_lov 1 + fn_beforeRun 1 + fn_run 1 + fn_callBack 1 + fn_search 1 + fn_reset 1 + fn_rowAdd 1 + fn_rowCopy 1 + fn_rowDelete 1 + fn_rowCancel 1 + fn_save 1 + fn_close 1 + ds_main_onrowposchanged 1 + grd_main_onheadclick 1 + btn_fold_onclick 1 + btn_common_find_onclick 1 + btn_custom_find_onclick 1 + fn_PermBtnCallBack 1).
>
> **To-Be (cross-cutting 정책 #1)**: `fn_lov` (xfdl:256~263) **삭제**, `fn_callBack` 의 `lov` 분기 (xfdl:354~357) **삭제**. To-Be 메서드 총수 = 19 (단 `fn_callBack` 내부 분기 1 감소).

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `fn_formBeforeOnload` | (gfn 라이프사이클) | (1) `div_topMenu.fn_commonTop_onload` 호출 (4 버튼 등록 — btn_search/reset/save/close) (2) `div_leftMenu.fn_commonLeft_onload` 호출 (chk_check / btn_sum) (3) `div_rightMenu.fn_commonRight_onload` 호출 (행추가/삭제/복사/취소 4 버튼) | - | - | xfdl:221~242 |
| 2 | `fn_onload` | Form onload (xfdl:3 `onload="fn_onload"`) | `gfn_formOnLoad(obj)` → `gfn_setFirstRow(ds_cmbValidYn, ..., "condCd", "condNm")` → `div_search.edt_PERMISSION_ID.setFocus()` → Detail 영역 비활성화 (`gfn_setEnable("div_mainDetail", "false")`) → `gfn_gridSelectedRow(grd_main, "red", "blue", "")` → `fn_lov()` 호출 | - (`fn_lov` 가 BPMN action `lov` 호출) | - | xfdl:244~254 |
| ~~3~~ | ~~`fn_lov`~~ | ~~`fn_onload` 마지막~~ | ~~`gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId", "")` 호출~~ | ~~lov~~ | ~~(CommObjMngMapper.selectAppHostId — bpmn:65 cross-module 참조)~~ | xfdl:256~263 (As-Is) → **To-Be 삭제** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기). To-Be `fn_onload` 마지막 줄 `this.fn_lov();` 호출도 삭제 |
| 4 | `fn_beforeRun` | `fn_run` 첫 행에서 호출 | sSvcId == "searchCmPerm" 분기: `ds_main.clearData()` + `ds_main.filter("")` / sSvcId == "saveCmPerm" 분기: 무동작 | - | - | xfdl:269~281 |
| 5 | `fn_run` | btn_search / btn_save 통해 `fn_search()` / `fn_save()` 가 호출 | (1) `fn_beforeRun(sSvcId)` validation → false 면 return (2) sUrl = "csa::CommPermMng" 고정 (3) sSvcId 분기: searchCmPerm → sInDs="" + sOutDs="ds_main=ds_main" + sArgs=`gfn_scanOpenerComponent(div_search.form)` / saveCmPerm → sInDs="ds_main=ds_main:U" (4) saveCmPerm 분기 추가 전처리: `ds_main.set_enableevent(false)` → 모든 행에서 `rowType != 1` (삭제 아님) 행의 START_ACTIVE_DATE/END_ACTIVE_DATE 가 8자 초과면 8자로 truncate (nexacro→mapper millisecond cut, 21.05.31 최규찬) → `set_enableevent(true)` (5) `gfn_transaction(sSvcId, sUrl, sInDs, sOutDs, sArgs, "fn_callBack")` | searchCmPerm / saveCmPerm | (BPMN 분기) | xfdl:284~324 |
| 6 | `fn_callBack` | `gfn_transaction` callback | sSvcId 분기 (As-Is 4 → **To-Be 3**, lov 분기 폐기): (1) searchCmPerm → `fn_commonBottomStatus_msg(strErrorMsg["ds_main"] + "건 조회 되었습니다.")` + `ds_main.getRowCount() > 0` 이면 Detail 영역 활성화 (`gfn_setEnable("div_mainDetail", "true")`) (2) saveCmPerm → `fn_commonBottomStatus_msg(strErrorMsg["ds_main"] + "건 조회 되었습니다.")` (As-Is "조회" 메시지 그대로 — 저장 콜백인데 메시지가 "조회" — As-Is 그대로 보존) + confirm("성공적으로 저장되었습니다.") → `gfn_message` 콜백 `fn_msgSuccessSave` → rtn true 시 `fn_run("searchCmPerm")` (재조회) (3) ~~lov → (As-Is 주석만 — 처리 ✗, xfdl:356~357 ds_lovSubSystem prepend "" 코드 주석)~~ **To-Be 분기 자체 삭제** (cross-cutting 정책 #1) (4) default → (없음) | (search / save action 콜백) | (selectCommPermMng / insert·update·deleteCommPermMng) | xfdl:330~362 |
| 7 | `fn_search` | EX-001 btn_search | `fn_run("searchCmPerm")` 호출 | searchCmPerm | (selectCommPermMng) | xfdl:368~370 |
| 8 | `fn_reset` | EX-001 btn_reset | `gfn_setDivDefault(div_search)` → `div_search.cbo_USE_TP.set_index(1)` (사용여부 두 번째 행 "N" 선택 — As-Is 그대로) | - | - | xfdl:373~376 |
| 9 | `fn_rowAdd` | EX-003 btn_rowAdd | (1) `ds_main.addRow()` → nRow 반환 (2) 등록 초기 default 세트: USE_TP="Y" / START_ACTIVE_DATE=`gfn_today()` / END_ACTIVE_DATE="99991231" (3) `div_mainDetail.edt_permission_id.setFocus(true)` (4) Detail 영역 활성화 (`gfn_setEnable("div_mainDetail", "true")`) | - | - | xfdl:378~389 |
| 10 | `fn_rowCopy` | EX-003 btn_rowCopy | (1) rowposition < 0 이면 경고 (`gfn_message("...","warning")`) + return (2) `gfn_rowcopyData(ds_main, ds_main.rowposition)` (3) Detail 영역 활성화 | - | - | xfdl:391~400 |
| 11 | `fn_rowDelete` | EX-003 btn_rowDelete | (1) `ds_main.getColumn(rowposition, "ROLE_ID")` 추출 (2) `roleId` 가 null 아니면 경고 ("연결된 역할이 존재합니다. 제외 후 삭제 하세요?") + return (3) null 이면 `gfn_deleteRow(ds_main, nRow)` (4) `ds_main.getRowCount() < 1` 이면 Detail 영역 비활성화 | - | - | xfdl:402~418 |
| 12 | `fn_rowCancel` | EX-003 btn_rowCancel | `gfn_grdInit(grd_main)` — 그리드 초기화 (변경 행 취소) | - | - | xfdl:419~421 |
| 13 | `fn_save` | EX-001 btn_save | (1) `gfn_isDatasetChanged(ds_main)` false 면 confirm("변경된 데이터가 없습니다") + return false (2) `gfn_dsRequired(grd_main, "PERMISSION_ID USE_TP")` false 면 return false (3) confirm("저장하시겠습니까?") + 콜백 `fn_msgSaveBeforeCallBack` → rtn true 시 `this.fv_row = ds_main.rowposition` 백업 → `fn_run("saveCmPerm")` 호출 | saveCmPerm | (insertCommPermMng / updateCommPermMng / deleteCommPermMng — 분기 자동) | xfdl:423~442 |
| 14 | `fn_close` | EX-001 btn_close | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` 호출 | - | - | xfdl:444~448 |
| 15 | `ds_main_onrowposchanged` | DS-001 ds_main onrowposchanged | (1) 새 row 의 PERMISSION_ID null 아니고 rowType != 2 (신규 아님) 이면 `div_mainDetail.edt_permission_id.set_enable(false)` (기존 row PK 편집 차단) (2) 그 외 → `set_enable(true)` (신규 row PK 입력 허용) | - | - | xfdl:451~459 |
| 16 | `div_main_div_mainGrd_grd_main_onheadclick` | G grid onheadclick | `gfn_commonOnheadclick(obj, e)` 호출 (공통 정렬) | - | - | xfdl:462~465 |
| 17 | `btn_fold_onclick` | B-001 | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:467~470 |
| 18 | `div_main_div_mainDetail_btn_common_find_onclick` | B-002 | `var oArg = {"btnChk":"common"}` → `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", oArg, "", "fn_PermBtnCallBack")` | popup | - | xfdl:472~476 |
| 19 | `div_main_div_mainDetail_btn_custom_find_onclick` | B-003 | `var oArg = {"btnChk":"custom"}` → `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", oArg, "", "fn_PermBtnCallBack")` | popup | - | xfdl:478~482 |
| 20 | `fn_PermBtnCallBack` | 팝업 콜백 (`commonPermBtnPopup`) | (1) `rtVal = gfn_getReturn()` (2) `rtVal.rtnValeChk == "common"` 이면 `txa_permission_common.set_value(rtVal.rtnVale)` (3) `rtVal.rtnValeChk == "custom"` 이면 `txa_permission_custom.set_value(rtVal.rtnVale)` | (팝업 결과 반영) | - | xfdl:484~493 |

> 메서드 총수 = 20 (xfdl Script 의 `this.X = function`/`this.X_onclick = function` 모두 전수). **To-Be (cross-cutting 정책 #1)** = 19 메서드 (fn_lov 삭제).

---

## §5. 팝업 P-NNN

| ID | 유형 | 이름 (xfdl title arg) | 호출 위치 (메서드 / 라인) | 호출 함수 | 전달 파라미터 (oArg) | 콜백 | 반환 처리 | 근거 |
|---|---|---|---|---|---|---|---|---|
| P-001 | modal | "commonPermBtnPopup" (공통 버튼 권한 선택) | `div_main_div_mainDetail_btn_common_find_onclick` / xfdl:475 | `gfn_openPopup("modal", title, url, oArg, "", callback)` | `{btnChk: "common"}` | `fn_PermBtnCallBack` (xfdl:484) | `gfn_getReturn().rtnValeChk == "common"` 분기 → `txa_permission_common.set_value(rtnVale)` (D-016 채움) | xfdl:472~476 / 484~493 |
| P-002 | modal | "commonPermBtnPopup" (CUSTOM 버튼 권한 선택) | `div_main_div_mainDetail_btn_custom_find_onclick` / xfdl:481 | `gfn_openPopup("modal", title, url, oArg, "", callback)` | `{btnChk: "custom"}` | `fn_PermBtnCallBack` (xfdl:484) | `gfn_getReturn().rtnValeChk == "custom"` 분기 → `txa_permission_custom.set_value(rtnVale)` (D-019 채움) | xfdl:478~482 / 484~493 |

- 팝업 url: `_com_popup::commonPermBtnPopup.xfdl` (외부 공통 팝업 — 본 화면 분석 범위 외)
- 본 화면에서 호출되는 다른 외부 화면: 없음 (xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 2 건 — P-001 / P-002 동일 팝업 oArg 분기만)

---

## §6. SQL ID 매트릭스 (Mapper.xml 4 SQL 전수 — 4 호출, cross-module 폐기)

> Mapper.xml namespace = `CommPermMngMapper` (mapper:5). 본 표는 4 SQL 모두 전수 — As-Is 1:1 보존.
>
> **cross-cutting 정책 #1 적용 (2026-05-31)**: As-Is #5 `CommObjMngMapper.selectAppHostId` (cross-module) **To-Be 폐기** (BIZ_SYSTEM_CODE 컬럼 폐기 + cross-module 호출 제거). 본 표 #5 행 삭제. As-Is selectCommPermMng / insert / update 의 `BIZ_SYSTEM_CODE` 컬럼 분기·바인딩도 **To-Be 제거**.

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommPermMng` | select | **As-Is**: Map (`edt_PERMISSION_ID` / `edt_PERMISSION_NM` / `cbo_USE_TP` / `cbo_bizSystemCode`) → **To-Be**: Map (`edt_PERMISSION_ID` / `edt_PERMISSION_NM` / `cbo_USE_TP`) — cbo_bizSystemCode 폐기 | **As-Is**: List<Map> 13 컬럼 (PERMISSION_ID / PERMISSION_NM / PERMISSION_DESC / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / BIZ_SYSTEM_CODE / ROLE_ID / BIZ_SYSTEM_CODE — 중복 xml:18/23) → **To-Be**: 11 컬럼 (BIZ_SYSTEM_CODE 2 회 모두 제거 — cross-cutting 정책 #1) | `TB_MCM_SEC_PERM A` (alias A) + scalar subquery on `TB_MCM_SEC_ROLE_MAPPING B` | **As-Is** `<where>` + `<if>` 4 절: `UPPER(A.PERMISSION_ID) LIKE UPPER('%'\|\| #{edt_PERMISSION_ID} \|\|'%')` (xml:27) + `UPPER(A.PERMISSION_NM) LIKE UPPER('%'\|\| #{edt_PERMISSION_NM} \|\|'%')` (xml:30) + `A.USE_TP = #{cbo_USE_TP}` (xml:33) + `A.BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}` (xml:36) / ORDER BY A.START_ACTIVE_DATE (xml:39) → **To-Be**: xml:36 (BIZ_SYSTEM_CODE) `<if>` 절 **제거** | `\|\|` 문자열 결합 + `UPPER(...)` + scalar subquery + `ROWNUM = 1` (xml:22) | Task_00oihyb (PERMISSION 정보 조회), bpmn:23 | Y | xml:7~40 |
| 2 | `insertCommPermMng` | insert | **As-Is**: Map (PERMISSION_ID / PERMISSION_NM / PERMISSION_DESC / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION / BIZ_SYSTEM_CODE / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + audit) → **To-Be**: BIZ_SYSTEM_CODE 컬럼 + 바인딩 **제거** (10 본 컬럼 + audit) | (rowcount) | `TB_MCM_SEC_PERM` | (INSERT — WHERE 없음) | `<include refid="ref_Audit.insert_item / insert_value">` (xml:55 / 69) | UserTask_1dh8dal (PERMISSION 정보 저장 — CommonMultiSaveTask), bpmn:39 | Y (CommonMultiSaveTask `nativeeditor_status="inserted"` 분기) | xml:42~71 |
| 3 | `updateCommPermMng` | update | **As-Is**: Map (PERMISSION_NM / PERMISSION_DESC / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION / BIZ_SYSTEM_CODE / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + audit + PERMISSION_ID) → **To-Be**: BIZ_SYSTEM_CODE 컬럼 + 바인딩 **제거** | (rowcount) | `TB_MCM_SEC_PERM` | `WHERE PERMISSION_ID = #{PERMISSION_ID}` (xml:86) — PK = PERMISSION_ID | `<include refid="ref_Audit.update">` (xml:85) | UserTask_1dh8dal (PERMISSION 정보 저장 — CommonMultiSaveTask), bpmn:39 | Y (CommonMultiSaveTask `nativeeditor_status="updated"` 분기) | xml:73~87 |
| 4 | `deleteCommPermMng` | delete | Map (PERMISSION_ID) | (rowcount) | `TB_MCM_SEC_PERM A` + EXISTS check on `TB_MCM_SEC_ROLE_MAPPING B` | `WHERE A.PERMISSION_ID = #{PERMISSION_ID} AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID)` (xml:91~95) — ROLE_MAPPING 연결 없을 때만 삭제 | NOT EXISTS subquery (안전 삭제 — 연결 ROLE 있으면 silent skip) | UserTask_1dh8dal (PERMISSION 정보 저장 — CommonMultiSaveTask), bpmn:39 | Y (CommonMultiSaveTask `nativeeditor_status="deleted"` 분기) | xml:89~96 |
| ~~5~~ | ~~`CommObjMngMapper.selectAppHostId` (**cross-module**)~~ | ~~select~~ | ~~(없음)~~ | ~~List<Map> (APP_HOST_ID)~~ | ~~(외부 모듈 — CommObjMngMapper)~~ | ~~(외부 모듈)~~ | ~~(외부 모듈)~~ | ~~Task_08v4ryn (lov_SUBSYSTEM 조회 — CommonSelectTask), bpmn:65~~ | ~~Y (lov 분기)~~ | bpmn:65 (sqlKey="CommObjMngMapper.selectAppHostId") (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |

> **SQL 정합 요약 (As-Is)**: 본 화면 Mapper.xml 4 SQL 등재 ↔ 실 호출 4 SQL ✓. cross-module 1 SQL (`CommObjMngMapper.selectAppHostId`) As-Is 인용 (BPMN 의 lov task 가 다른 모듈 mapper sqlKey 사용) → **To-Be 폐기** (정책 #1).
>
> **To-Be 적용**: 4 자체 SQL 모두 이전. cross-module SQL 행 (#5) 폐기. 단 (1) Oracle `(+)` outer join / scalar subquery → JPA Repository native query 로 보존 또는 JPA 표준 (`@OneToMany` mapping) 으로 치환. (2) `ROWNUM = 1` (xml:22) → MSSQL `TOP 1` 또는 JPQL `setMaxResults(1)`. (3) `||` 결합 → MSSQL `+` 또는 MyBatis `CONCAT`. (4) ref_Audit 폐기 → cactus-core `CactusAuditEntity`. (5) BIZ_SYSTEM_CODE 컬럼 SQL 절·바인딩 제거 (#1 xml:36 + #2 / #3 INSERT/UPDATE 본문에서 모두 제거).

---

## §7. Java 트랜잭션 (UserTask)

해당 없음 — §0 / §2 #2 에 명시. 본 화면은 BPMN 의 표준 ScriptTask (`CommonSelectTask` / `CommonMultiSaveTask`) 만 사용 — 화면 전용 Java UserTask 코드 ✗.

> **CommonSelectTask 동작 일반** (참고): `paramKey` 로 Map 추출 → `dao.queryForList(sqlKey, param)` → `resultKey` 로 Context 에 적재. 결과는 OASIS BPMN ServiceResult 로 자동 반환.
>
> **CommonMultiSaveTask 동작 일반** (참고): `paramKey` 로 ArrayList<HashMap> 추출 → 각 행의 `nativeeditor_status` (Nexacro 표준 — "inserted" / "updated" / "deleted") 분기로 `insertSqlKey` / `updateSqlKey` / `deleteSqlKey` 호출. 모든 행을 한 트랜잭션 내에서 처리. 결과는 `cnt_insert` / `cnt_update` / `cnt_delete` 누적.

---

## §8. BPMN 워크플로우 전수 (`CommPermMng.bpmn`)

### §8.1 노드 전수 (BPMN process id = `sample1`, name = `menuInfor` — As-Is 그대로 보존)

> bpmn:3 의 `<bpmn2:process id="sample1" name="menuInfor" isExecutable="false">` — process id 가 화면명과 무관한 "sample1" / name 이 "menuInfor" (다른 화면의 As-Is 잔존 — 추정). To-Be 에서 `commPermMng` 로 정정.
>
> **cross-cutting 정책 #1 적용 (2026-05-31)**: As-Is #6 `Task_08v4ryn` (lov_SUBSYSTEM 조회 — cross-module `CommObjMngMapper.selectAppHostId`) **To-Be 폐기**. EndEvent_1 incoming 도 3 → 2 감소. Gateway outgoing 도 3 → 2 감소.

| # | 노드 ID | 노드 종류 | name | 역할 | extensionElements / class | sqlKey | paramKey / resultKey | 근거 |
|---:|---|---|---|---|---|---|---|---|
| 1 | `StartEvent_1` | startEvent | "Start Event" | 시작 이벤트 | - | - | - | bpmn:4~6 |
| 2 | `EndEvent_1` | endEvent | "End Event" | 종료 이벤트 (**As-Is 3** incoming → **To-Be 2** incoming) | - | - | - | bpmn:7~11 |
| 3 | `ExclusiveGateway_1` | exclusiveGateway | "분기" (gatewayDirection="Diverging") | sSvcId 분기 (**As-Is 3** outgoing: searchCmPerm / saveCmPerm / lov → **To-Be 2** outgoing: searchCmPerm / saveCmPerm) | (ext:style shapeBackground="#ffff00", bpmn:14) | - | - | bpmn:12~20 |
| 4 | `Task_00oihyb` | task (CommonSelectTask) | "PERMISSION 정보 조회" | searchCmPerm 분기 — 조회 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` / isServiceResult=true / dao="" / paramKey="" / resultKey="ds_main" / modelerTemplate=`MapperBaseDbAccessTemplate` | `#{serviceId}Mapper.selectCommPermMng` (xml:7) | param: "" (sArgs 가 자동 전달) / result: ds_main | bpmn:23~36 |
| 5 | `Task_1dh8dal` | task (CommonMultiSaveTask) | "PERMISSION 정보 저장" | saveCmPerm 분기 — 저장 (insert/update/delete 자동 분기) | class=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` / isServiceResult=true / dao="" / nextBranchSpel="" / paramKey="ds_main" / resultKey="ds_main" / modelerTemplate=`CommonMultiSaveTask` | insertSqlKey=`#{serviceId}Mapper.insertCommPermMng` (xml:42) / updateSqlKey=`#{serviceId}Mapper.updateCommPermMng` (xml:73) / deleteSqlKey=`#{serviceId}Mapper.deleteCommPermMng` (xml:89) | param: ds_main / result: ds_main | bpmn:39~55 |
| ~~6~~ | ~~`Task_08v4ryn`~~ | ~~task (CommonSelectTask)~~ | ~~"lov_SUBSYSTEM 조회"~~ | ~~lov 분기 — App Host ID 콤보 LoV~~ | ~~class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` / isServiceResult=true / dao="" / paramKey="" / resultKey="ds_selectAppHostId" / modelerTemplate=`MapperBaseDbAccessTemplate`~~ | ~~`CommObjMngMapper.selectAppHostId` (**cross-module** — `#{serviceId}Mapper` 미사용)~~ | ~~param: "" / result: ds_selectAppHostId~~ | bpmn:57~70 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1 — cross-module 호출 제거) |

> 노드 총수 = **As-Is 6** (Start 1 + End 1 + Gateway 1 + Task 3) → **To-Be 5** (Task_08v4ryn 폐기). 본 화면은 UserTask ✗ (모든 Task 가 ScriptTask).

### §8.2 sequenceFlow 전수

| # | flow ID | source | target | name (action 분기명) | 근거 |
|---:|---|---|---|---|---|
| 1 | `SequenceFlow_1` | StartEvent_1 | ExclusiveGateway_1 | (없음) | bpmn:21 |
| 2 | `SequenceFlow_0grwghu` | ExclusiveGateway_1 | Task_1dh8dal | **saveCmPerm** | bpmn:22 |
| 3 | `SequenceFlow_0tt1mbk` | ExclusiveGateway_1 | Task_00oihyb | **searchCmPerm** | bpmn:38 |
| ~~4~~ | ~~`SequenceFlow_1dd2kqv`~~ | ~~ExclusiveGateway_1~~ | ~~Task_08v4ryn~~ | ~~**lov**~~ | bpmn:71 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |
| 5 | `SequenceFlow_105vwsz` | Task_00oihyb | EndEvent_1 | (없음) | bpmn:37 |
| 6 | `SequenceFlow_1vkp3qd` | Task_1dh8dal | EndEvent_1 | (없음) | bpmn:56 |
| ~~7~~ | ~~`SequenceFlow_0xqzbh4`~~ | ~~Task_08v4ryn~~ | ~~EndEvent_1~~ | ~~(없음)~~ | bpmn:72 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1) |

> sequenceFlow 총수 = **As-Is 7** → **To-Be 5** (SequenceFlow_1dd2kqv + SequenceFlow_0xqzbh4 폐기). 분기 flow **As-Is 3** (searchCmPerm / saveCmPerm / lov) → **To-Be 2** (searchCmPerm / saveCmPerm) 가 `name` 으로 분기 결정 — As-Is `gfn_transaction` 의 sSvcId 가 ExclusiveGateway 에서 sequenceFlow.name 매칭. To-Be (OASIS) 에서도 동일 패턴 보존.

### §8.3 action 흐름 (As-Is 3 enum → To-Be 2 enum)

| action | 흐름 (start → end) | 호출 SQL | xfdl 트리거 |
|---|---|---|---|
| `searchCmPerm` | StartEvent_1 → ExclusiveGateway_1 (name="searchCmPerm") → Task_00oihyb (selectCommPermMng) → EndEvent_1 | selectCommPermMng | `fn_search` → `fn_run("searchCmPerm")` (xfdl:368 / 297) |
| `saveCmPerm` | StartEvent_1 → ExclusiveGateway_1 (name="saveCmPerm") → Task_1dh8dal (CommonMultiSaveTask : insertCommPermMng / updateCommPermMng / deleteCommPermMng 자동 분기) → EndEvent_1 | insertCommPermMng / updateCommPermMng / deleteCommPermMng | `fn_save` → `fn_run("saveCmPerm")` (xfdl:423 / 304) |
| ~~`lov`~~ | ~~StartEvent_1 → ExclusiveGateway_1 (name="lov") → Task_08v4ryn (CommObjMngMapper.selectAppHostId — cross-module) → EndEvent_1~~ | ~~CommObjMngMapper.selectAppHostId~~ | ~~`fn_lov` (xfdl:256, onload 1회만)~~ — **To-Be 폐기** (cross-cutting 정책 #1) |

### §8.4 BPMN diagram (시각적 표시 — di:BPMNDiagram_1)

| 노드 / flow | 좌표 / 색상 |
|---|---|
| StartEvent_1 | (578, 99) 36x36 |
| EndEvent_1 | (578, 622) 36x36 |
| ExclusiveGateway_1 | (571, 184) 50x50 (label "분기" at 630,170) |
| Task_00oihyb | (348, 392) 164x50 — stroke=`#1E88E5` (blue) / fill=`#BBDEFB` (light blue) |
| Task_1dh8dal | (667, 392) 164x50 — stroke=`rgb(142, 36, 170)` (purple) / fill=`rgb(225, 190, 231)` (light purple) |
| ~~Task_08v4ryn~~ | ~~(156, 392) 164x50 — stroke=`#1E88E5` / fill=`#BBDEFB`~~ (As-Is) → **To-Be 폐기** |
| SequenceFlow_0grwghu (saveCmPerm) | waypoints (622,209) (749,209) (749,392) — label (777, 298) "saveCmPerm" |
| SequenceFlow_0tt1mbk (searchCmPerm) | waypoints (572,210) (430,209) (430,392) — label (438, 264) "searchCmPerm" |
| ~~SequenceFlow_1dd2kqv (lov)~~ | ~~waypoints (584,196) (238,196) (238,392) — label (404, 178) "lov"~~ (As-Is) → **To-Be 폐기** |

> BPMN 표시 색상 — saveCmPerm flow 만 보라색 (mutation), search/lov 는 파란색 (read-only) — As-Is 시각적 분류. To-Be 에서 lov 파란색 flow 제거로 saveCmPerm (purple) + searchCmPerm (blue) 2 flow 만 존속.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + To-Be cactus-core 통합)

> **스키마 정본**: As-Is Mapper.xml 의 `TB_MCM_SEC_PERM` / `TB_MCM_SEC_ROLE_MAPPING` (스키마 prefix ✗ — 직접 참조). As-Is Oracle 환경에서는 현재 schema/synonym 으로 접근 추정.
>
> **To-Be 정책 (사용자 결정 누적 반영)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`TB_MCM_SEC_PERM` / `TB_MCM_SEC_ROLE_MAPPING`) — 대문자 prefix 유지. MSSQL `sample_dmes` DB / `MCMAPUSER` 스키마 (사용자 결정 — masterCodeMng 와 동일)
> - **audit 컬럼**: As-Is 17 컬럼 → **cactus-core `CactusAuditEntity` 9 컬럼 통일** (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). As-Is `DATA_END_*` (그룹 3) + `ARCHIVE_*` (그룹 4) 9 컬럼은 To-Be 에서 **제거**. `VER` 컬럼은 JPA `@Version` 으로 자동 Optimistic Locking 적용
> - **본 컬럼**: As-Is 1:1 보존
>
> [확인필요: Q-001] DMES Excel csa 시트 (TB_MCM_SEC_PERM / TB_MCM_SEC_ROLE_MAPPING) DDL 본문 미인입 — 본 §9 는 Mapper.xml 의 INSERT/UPDATE/SELECT 컬럼 + As-Is 보존 컬럼만 카탈로그 등재. DDL 추출 후 컬럼 type / length / NULL / default 정정 필요.

### §9.1 `TB_MCM_SEC_PERM` (권한 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | PERMISSION_ID | selectCommPermMng SELECT (xml:8) / selectCommPermMng WHERE LIKE (xml:27) / insertCommPermMng INSERT/VALUES (xml:44, 58) / updateCommPermMng WHERE (xml:86) / deleteCommPermMng WHERE (xml:91) / selectCommPermMng scalar subquery WHERE (xml:21) / xfdl G-002 / D-002 / Bind item0 / DS-001 / fn_save 필수 (xfdl:431) | PK | xfdl 신규 행 시 `set_enable(true)`, 기존 행 시 `set_enable(false)` (xfdl:454~457) — PK 편집 차단 패턴 | xml:8 / 27 / 44 / 86 / 91 |
| 2 | PERMISSION_NM | selectCommPermMng SELECT (xml:9) / selectCommPermMng WHERE LIKE (xml:30) / insertCommPermMng (xml:45, 59) / updateCommPermMng SET (xml:75) / xfdl G-003 / D-004 / Bind item4 / DS-001 | - | xfdl 100자 maxlength (D-004) | xml:9 / 30 / 75 |
| 3 | PERMISSION_DESC | selectCommPermMng SELECT (xml:10) / insertCommPermMng (xml:46, 60) / updateCommPermMng (xml:76) / xfdl G-012 / D-006 / Bind item8 / DS-001 | - | xfdl 100자 maxlength (D-006) | xml:10 / 76 |
| 4 | PERMISSION_COMMON | selectCommPermMng SELECT (xml:11) / insertCommPermMng (xml:47, 61) / updateCommPermMng (xml:77) / xfdl G-004 / D-016 (TextArea) / Bind item1 / DS-001 / B-002 팝업 결과 세트 (xfdl:489) | - | 공통 버튼 권한 (TextArea — 다중 값 추정 — 콤마 분리?) | xml:11 / 77 |
| 5 | PERMISSION_CUSTOM | selectCommPermMng SELECT (xml:12) / insertCommPermMng (xml:48, 62) / updateCommPermMng (xml:78) / xfdl G-005 / D-019 (TextArea) / Bind item5 / DS-001 / B-003 팝업 결과 세트 (xfdl:492) | - | CUSTOM 버튼 권한 (TextArea — 다중 값 추정) | xml:12 / 78 |
| 6 | POPUP_BTN | selectCommPermMng SELECT (xml:13) / insertCommPermMng (xml:49, 63) / updateCommPermMng (xml:79) / xfdl G-006 / D-022 (TextArea) / Bind item3 / DS-001 | - | POPUP 버튼 (TextArea — 다중 값 추정) | xml:13 / 79 |
| 7 | PERMISSION_ACTION | selectCommPermMng SELECT (xml:14) / insertCommPermMng (xml:50, 64) / updateCommPermMng (xml:80) / xfdl G-007 / D-024 (TextArea) / Bind item9 / DS-001 | - | ACTION 권한 (TextArea — 다중 값 추정) | xml:14 / 80 |
| 8 | USE_TP | selectCommPermMng SELECT (xml:15) / selectCommPermMng WHERE (xml:33) / insertCommPermMng (xml:52, 66) / updateCommPermMng (xml:82) / xfdl G-009 / D-010 (Radio Y/N) / S-004 / Bind item6 / DS-001 / DS-002 / fn_save 필수 (xfdl:431) / fn_rowAdd default "Y" (xfdl:382) | - | Y/N (Radio + 콤보 + hardcoded 2 행 LoV) | xml:15 / 33 / 82 |
| 9 | START_ACTIVE_DATE | selectCommPermMng SELECT (xml:16) / insertCommPermMng (xml:53, 67) / updateCommPermMng (xml:83) / ORDER BY (xml:39) / xfdl G-010 / D-012 (Calendar) / Bind item7 / DS-001 / fn_rowAdd default `gfn_today()` (xfdl:383) / fn_run 8자 truncate (xfdl:313) | - | yyyy-MM-dd / fn_run 에서 nexacro DateTime millisecond cut → 8자 truncate 적용 (xfdl:313) | xml:16 / 39 / 83 |
| 10 | END_ACTIVE_DATE | selectCommPermMng SELECT (xml:17) / insertCommPermMng (xml:54, 68) / updateCommPermMng (xml:84) / xfdl G-011 / D-014 (Calendar) / Bind item2 / DS-001 / fn_rowAdd default "99991231" (xfdl:384) / fn_run 8자 truncate (xfdl:314) | - | yyyy-MM-dd / 신규 default 99991231 (마지막 날짜 표식) | xml:17 / 84 |
| ~~11~~ | ~~BIZ_SYSTEM_CODE~~ | ~~selectCommPermMng SELECT (xml:18, 23 — 2 회 중복 SELECT) / selectCommPermMng WHERE (xml:36) / insertCommPermMng (xml:51, 65) / updateCommPermMng (xml:81) / xfdl G-008 / D-008 (Combo) / S-001 / Bind item10 / DS-001 / DS-003~~ | - | ~~외부 LoV (`CommObjMngMapper.selectAppHostId` cross-module) — APP_HOST_ID 값~~ — **DB DDL 컬럼은 보존** (TB_MCM_SEC_PERM 의 BIZ_SYSTEM_CODE VARCHAR(10) NOT NULL — §9.3.1 #8), **단 본 화면 SQL/UI 사용은 To-Be 폐기** (cross-cutting 정책 #1 — selectCommPermMng SELECT/WHERE / insert / update / Grid G-008 / Detail D-007/D-008 / Search S-001 / Bind item10 / DS-003 모두 제거) | xml:18 / 23 / 36 / 81 (As-Is 인용) → **To-Be 화면 미사용** |
| 12 | (audit 17 As-Is 컬럼) | `<include refid="ref_Audit.insert_item">` (xml:55) / `<include refid="ref_Audit.insert_value">` (xml:69) / `<include refid="ref_Audit.update">` (xml:85) | - | As-Is ref_Audit fragment 17 컬럼 (CREATED_OBJECT_ID/TYPE/PROGRAM_ID/TIMESTAMP + LAST_UPDATED_* 4 + DATA_END_* 4 + ARCHIVE_* 5 추정 — masterCodeMng §9.1 와 동일 패턴). **To-Be**: cactus-core 9 컬럼으로 통일 (#13~#21) | xml:55 / 69 / 85 |
| 13 | C_USR_ID | (To-Be cactus-core) — VARCHAR(100) / 생성자 | - | As-Is `CREATED_OBJECT_ID` 매핑. JPA `@PrePersist` 자동 (CactusAuditListener) | CactusAuditEntity.java:27 |
| 14 | C_AT | (To-Be cactus-core) — TIMESTAMP(Instant) / 생성일시 | - | As-Is `CREATION_TIMESTAMP` 매핑 | CactusAuditEntity.java:30 |
| 15 | C_SVC_ID | (To-Be cactus-core) — VARCHAR(100) / 생성 서비스 | - | cactus-core 표준 (`commPermMng` 세트) | CactusAuditEntity.java:33 |
| 16 | C_PGM_ID | (To-Be cactus-core) — VARCHAR(100) / 생성 프로그램 | - | As-Is `CREATED_PROGRAM_ID` 매핑 | CactusAuditEntity.java:36 |
| 17 | U_USR_ID | (To-Be cactus-core) — VARCHAR(100) / 수정자 | - | As-Is `LAST_UPDATED_OBJECT_ID` 매핑. JPA `@PreUpdate` 자동 | CactusAuditEntity.java:39 |
| 18 | U_AT | (To-Be cactus-core) — TIMESTAMP(Instant) / 수정일시 | - | As-Is `LAST_UPDATE_TIMESTAMP` 매핑 | CactusAuditEntity.java:42 |
| 19 | U_SVC_ID | (To-Be cactus-core) — VARCHAR(100) / 수정 서비스 | - | cactus-core 표준 | CactusAuditEntity.java:45 |
| 20 | U_PGM_ID | (To-Be cactus-core) — VARCHAR(100) / 수정 프로그램 | - | As-Is `LAST_UPDATE_PROGRAM_ID` 매핑 | CactusAuditEntity.java:48 |
| 21 | VER | (To-Be cactus-core) — Long / Optimistic Locking | - | JPA `@Version` 자동. As-Is 에는 없는 신규 — 동시성 문제 (As-Is last-write-wins) 자동 해결 | CactusAuditEntity.java:51 |

> **§9.1 audit 컬럼 매핑 (As-Is 17 → To-Be 9)**: masterCodeMng §9.1 와 동일 패턴. As-Is 그룹 1·2 (CREATED_*/LAST_UPDATED_* — 8 컬럼) → To-Be `C_*` / `U_*` 8 컬럼 매핑. As-Is 그룹 3·4 (DATA_END_*/ARCHIVE_* — 9 컬럼) → **To-Be 제거**. To-Be 추가: `VER` (Optimistic Locking). To-Be Entity `extends CactusAuditEntity` 만으로 9 컬럼 + listener 자동 적용.

### §9.2 `TB_MCM_SEC_ROLE_MAPPING` (Role ↔ Permission 매핑 — 본 화면 read 만)

> 본 화면은 TB_MCM_SEC_ROLE_MAPPING 을 (1) selectCommPermMng scalar subquery (xml:19~22) 로 ROLE_ID 추출, (2) deleteCommPermMng NOT EXISTS check (xml:92~95) 로 안전 삭제 검증 — 두 용도 모두 read-only. INSERT/UPDATE/DELETE 는 본 화면에서 미수행 (Role 관리 화면이 별도 담당 추정 — commRoleMng / commRoleGrpMng).

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | PERMISSION_ID | selectCommPermMng scalar subquery WHERE (xml:21) / deleteCommPermMng NOT EXISTS WHERE (xml:94) | PK 후보 (ROLE_ID 와 복합 추정) | TB_MCM_SEC_PERM.PERMISSION_ID 의 FK | xml:21 / 94 |
| 2 | ROLE_ID | selectCommPermMng scalar subquery SELECT (xml:19) | PK 후보 | 본 화면 ds_main 의 ROLE_ID 컬럼 — `fn_rowDelete` 에서 null 체크 (xfdl:407) 로 "연결된 역할이 존재합니다" 경고 사용 | xml:19 / xfdl:407 |
| 3~ | (audit 17 컬럼 — 가정) | (Mapper.xml 본 화면 미사용) | - | TB_MCM_SEC_ROLE_MAPPING 의 audit 정책은 commRoleMng 화면이 결정 (본 화면은 SELECT 만) | - |

> **§9.2 비고**: 본 화면 자체 audit 영향 ✗ (read-only). 컬럼 카탈로그 전수는 commRoleMng 화면 §9 에서 결정.

### §9.3 DMES 테이블 정의서 2 시트 전수 컬럼 카탈로그 (Q-001 해소 — 2026-05-30)

> **출처**: `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` 직접 시트 추출 (2026-05-30 작성, sheet rId88 / rId92). 시트명은 `SEC_PERM` / `SEC_ROLE_MAPPING` (TB_MCM_ prefix 없음). To-Be 적용 시 `MCMAPUSER.TB_MCM_SEC_*` 그대로 보존.

#### §9.3.1 SEC_PERM (퍼미션정보 — 본 화면 주 테이블) — TB_MCM_SEC_PERM / 29 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 권한 ID | PERMISSION_ID | VARCHAR | 100 | PK | NOT NULL | - | §9.1 #1 |
| 2 | 권한 Name | PERMISSION_NM | VARCHAR | 100 |  | NULL | - | §9.1 #2 |
| 3 | 권한 설명 | PERMISSION_DESC | VARCHAR | 300 |  | NULL | - | §9.1 #3 |
| 4 | 공통 권한 | PERMISSION_COMMON | VARCHAR | 500 |  | NULL | - | §9.1 #4 |
| 5 | 커스텀 권한 | PERMISSION_CUSTOM | VARCHAR | 500 |  | NULL | - | §9.1 #5 |
| 6 | Popup 버튼 | POPUP_BTN | VARCHAR | 1000 |  | NULL | - | §9.1 #6 |
| 7 | ACTION 권한 | PERMISSION_ACTION | VARCHAR | 500 |  | NULL | - | §9.1 #7 |
| 8 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | §9.1 #11 (As-Is SELECT 중복 xml:18/23) |
| 9 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | §9.1 #8 |
| 10 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #9 |
| 11 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #10 |
| 12~28 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (commUserMng §9.1.1 #19~35 동일) | - |  | NULL | - | §9.1 #12 — As-Is 17 → To-Be cactus-core 9 통일 (§11 #6) |
| 29 | 권한그룹 | PERMISSION_GROUP | VARCHAR | 100 |  | NULL | - | (As-Is 본 화면 mapper 미사용 — DB 보존) |

#### §9.3.2 SEC_ROLE_MAPPING (역할별퍼미션 — 본 화면 read-only) — TB_MCM_SEC_ROLE_MAPPING / 20 컬럼

> 본 화면 read-only. commObjMng §9.6.5 / commRoleMng §9.4.2 참조 — 중복 표 생략.

| 본 화면 사용 컬럼 | §9.2 매칭 |
|---|---|
| PERMISSION_ID | §9.2 #1 (PK 후보) — selectCommPermMng scalar subquery / deleteCommPermMng NOT EXISTS |
| ROLE_ID | §9.2 #2 — selectCommPermMng scalar subquery SELECT |
| 나머지 18 컬럼 (OBJECT_ID + audit 17) | (본 화면 미사용 — commObjMng §9.6.5 참조) |

> **§9.3 카탈로그 합계**: 29 + 20 = **49 컬럼 등재** (SEC_ROLE_MAPPING 20 은 commObjMng §9.6.5 참조로 본문 압축, 라인 수만 합계 명시).

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 (S/G/GE/D) | 비고 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | (xfdl 정적 Dataset `ds_cmbValidYn`) | Y / N | Y / N (hardcoded — `condCd`=`condNm`) | S-004 (사용 여부 콤보) | DB 호출 ✗ — xfdl 내 hardcoded 2 행 + `gfn_setFirstRow(ds_cmbValidYn, "", "", "condCd", "condNm")` 첫 행 추가 (xfdl:247) | xfdl:175~190 / 247 |
| LV-002 | (xfdl Radio inner Dataset — D-010 `edt_use_tp`) | Y / N | Yes / No (codecolumn=Y/N → datacolumn=Yes/No) | D-010 (Radio 사용 여부) | DB 호출 ✗ — Radio Component 내부 hardcoded 2 행 (vertical) — 상세 입력 폼 전용 | xfdl:96~111 |
| ~~LV-003~~ | ~~TB_MCM_HOST_INFO 등 (cross-module `CommObjMngMapper.selectAppHostId`) → `ds_lovSubSystem`~~ | ~~(외부 결과 — APP_HOST_ID)~~ | ~~(외부 결과 — APP_HOST_ID = codecolumn = datacolumn)~~ | ~~S-001 (검색조건 BIZ SYSTEM) / D-008 (상세 입력 BIZ SYSTEM)~~ | ~~`fn_lov` (xfdl:256) → BPMN `lov` 분기 → `CommObjMngMapper.selectAppHostId` (cross-module)~~ | xfdl:191~195 / 262 / bpmn:65 (As-Is) → **To-Be 폐기** (cross-cutting 정책 #1 — APPHOST 출처 LV 제거 + cross-module 호출 제거) |

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-009 (그리드 표시) + D-010 (Radio) + S-004 (검색조건 콤보) + 저장 시 필수 (xfdl:431) + 신규 행 default "Y" (xfdl:382) | xml:15 / 33 / 82 / xfdl:382 |
| ST-002 | `START_ACTIVE_DATE = gfn_today()` (신규 default) | 신규 행 유효개시일 = 오늘 | fn_rowAdd default 세트 (xfdl:383) | xfdl:383 |
| ST-003 | `END_ACTIVE_DATE = "99991231"` (신규 default) | 신규 행 유효기한일 = 9999-12-31 (영구) | fn_rowAdd default 세트 (xfdl:384) | xfdl:384 |
| ST-004 | `ds_main.getRowType(currow) == 2` (신규 행) / `== 1` (삭제 행) | Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제 | (1) ds_main_onrowposchanged: 신규 행만 PERMISSION_ID 입력 허용 (xfdl:453~457) (2) fn_run saveCmPerm: rowType != 1 행만 date 8자 truncate (xfdl:309~317) | xfdl:309 / 453 |
| ST-005 | `STATUS` (G-001, displaytype=imagecontrol, band="left") | Nexacro auto row state icon 표시 (신규/수정/삭제) | G-001 (band="left") 표시 전용 — DS-001 미정의, framework 추론 | xfdl:19 / 37 / 51 |
| ST-006 | `ROLE_ID != null` (selectCommPermMng scalar subquery 결과) | 연결된 ROLE 존재 마킹 (TB_MCM_SEC_ROLE_MAPPING) | fn_rowDelete 차단 사유 ("연결된 역할이 존재합니다. 제외 후 삭제 하세요?") + deleteCommPermMng NOT EXISTS 안전장치 | xfdl:407 / xml:19 / 92~95 |
| ST-007 | `gfn_isDatasetChanged(ds_main)` true/false | 변경 데이터 존재 여부 | fn_save 첫 검증 — false 면 "변경된 데이터가 없습니다" + return | xfdl:425 |
| ST-008 | Detail 영역 활성/비활성 (`gfn_setEnable("div_mainDetail", "true"/"false")`) | 마스터 row 0 건 / 1+ 건에 따라 div_mainDetail 영역 활성화 | onload 초기 비활성 (xfdl:250) / searchCmPerm 콜백 +1건 활성 (xfdl:337) / fn_rowAdd 활성 (xfdl:388) / fn_rowCopy 활성 (xfdl:398) / fn_rowDelete 0 행 비활성 (xfdl:415) | xfdl:250 / 337 / 388 / 398 / 415 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (스키마 prefix ✗ — 직접 참조 추정 / 실 owner `MCMAPUSER`). To-Be = MSSQL (사용자 명시 `sample_dmes` DB / `MCMAPUSER` 계정).
>
> **To-Be 결정 (사용자 결정 누적 반영)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`TB_MCM_SEC_PERM` / `TB_MCM_SEC_ROLE_MAPPING`) — 대문자 prefix 유지
> - **audit 컬럼**: cactus-core `CactusAuditEntity` 9 컬럼 통일 (§9 참조). MyBatis `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 처리
> - **`END_ACTIVE_DATE`** 신규 default: As-Is `"99991231"` (8자 String) → To-Be `LocalDate.of(9999,12,31)` 또는 `'9999-12-31'` 명시
> - **xfdl titletext 오타** "PERMISSON 관리" → To-Be "PERMISSION 관리" 정정
> - **BPMN process id** `sample1` / name `menuInfor` → To-Be `commPermMng` / `commPermMng` 정정
> - **selectCommPermMng BIZ_SYSTEM_CODE SELECT 절 중복** (xml:18 / 23) → 1 회로 정리

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `\|\|` 문자열 결합 | xml:27 (`LIKE '%' \|\| #{edt_PERMISSION_ID} \|\| '%'`), xml:30 (`UPPER('%' \|\| #{edt_PERMISSION_NM} \|\| '%')`) | MSSQL `+` 연산자 또는 `CONCAT(...)`: `LIKE '%' + #{edt_PERMISSION_ID} + '%'` (또는 `CONCAT('%', #{edt_PERMISSION_ID}, '%')`) | selectCommPermMng | - |
| 2 | `UPPER(...)` | xml:27 / 30 (`UPPER(A.PERMISSION_ID) LIKE UPPER('%' \|\| ... )`) | MSSQL `UPPER(...)` 동일 (또는 컬럼 collation 으로 case-insensitive 처리 가능) | selectCommPermMng | - |
| 3 | scalar subquery in SELECT + `ROWNUM = 1` | xml:19~22 (SELECT ROLE_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE ... AND ROWNUM = 1) | MSSQL `TOP 1` 또는 `SELECT TOP 1 ROLE_ID FROM ...` (scalar) → SubSELECT 내 TOP 1 사용 가능: `(SELECT TOP 1 B.ROLE_ID FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID) AS ROLE_ID` | selectCommPermMng | - |
| 4 | NOT EXISTS subquery (안전 삭제) | xml:92~95 (`NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID)`) | MSSQL 동일 지원 (DBMS 무관) | deleteCommPermMng | - |
| 5 | MyBatis `<where>` + `<if>` dynamic SQL | xml:25~38 (4 if 절) | MSSQL 동일 지원 (MyBatis 레벨, DBMS 무관) | selectCommPermMng | - |
| 6 | `ref_Audit` fragment include | xml:55 (insert_item) / xml:69 (insert_value) / xml:85 (update) — 3 회 | **To-Be**: MyBatis `ref_Audit` fragment **폐기**. 대신 cactus-core `CactusAuditEntity` 상속 + `CactusAuditListener` 가 JPA `@PrePersist` / `@PreUpdate` 콜백으로 9 컬럼 자동 채움. To-Be INSERT/UPDATE SQL 본문에 audit 컬럼 명시 ✗ — Entity 레이어에서 자동 처리 | insertCommPermMng / updateCommPermMng | cactus-core 적용 |
| 7 | 스키마 prefix ✗ — 직접 테이블 참조 (As-Is) | xml 전체 (xml:8, 24, 43, 74, 90, 94) | **To-Be**: `MCMAPUSER.TB_MCM_SEC_PERM` / `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` (사용자 결정 — masterCodeMng 와 동일 패턴) | 모든 SQL | 사용자 결정 |
| 8 | cross-module mapper sqlKey 참조 (BPMN sqlKey 하드코딩) | bpmn:65 (`CommObjMngMapper.selectAppHostId` — `#{serviceId}Mapper.X` 미사용) | **To-Be 폐기** (cross-cutting 정책 #1 — 2026-05-31) — BIZ_SYSTEM_CODE 컬럼 폐기로 cross-module 호출 자체가 불필요. BPMN Task_08v4ryn / SequenceFlow_1dd2kqv / SequenceFlow_0xqzbh4 모두 제거. As-Is commObjMng 모듈에 대한 cross-module 의존성 해소 | (BPMN Task_08v4ryn 제거) | cross-cutting 정책 #1 |
| 9 | **BIZ_SYSTEM_CODE 컬럼 화면 사용 폐기 (cross-cutting 정책 #1, 2026-05-31)** | xfdl:127 (D-008 Combo Essential cssclass) / xfdl:145~146 (S-001 검색 콤보) / xml:18·23 (selectCommPermMng SELECT 2 회) / xml:36 (selectCommPermMng WHERE `<if>` 절) / xml:51·65 (insertCommPermMng) / xml:81 (updateCommPermMng) / xfdl:191~195 (DS-003 `ds_lovSubSystem`) / xfdl:506 (Bind item10) / DS-001 ds_main 의 BIZ_SYSTEM_CODE 컬럼 / G-008 Grid 컬럼 | **To-Be**: (a) UI: S-001 / D-007 / D-008 / G-008 모두 제거 (As-Is 인용 보존, To-Be 폐기 명시). (b) SQL: selectCommPermMng SELECT 2 회 제거 (13 → 11 컬럼), WHERE `<if>` 절 제거, insertCommPermMng / updateCommPermMng 의 BIZ_SYSTEM_CODE 컬럼 + 바인딩 제거. (c) Dataset: DS-003 제거 + DS-001 의 BIZ_SYSTEM_CODE 컬럼 제거 (12 → 11 컬럼). (d) Bind: item10 제거. (e) DB DDL: TB_MCM_SEC_PERM 의 BIZ_SYSTEM_CODE VARCHAR(10) NOT NULL 컬럼 자체는 **DDL 보존** (legacy 데이터) — 본 화면 SQL/UI 에서 미사용 처리. (f) Service: To-Be Service 의 DTO / Entity 정의에 BIZ_SYSTEM_CODE 필드 미포함 | (전 영역) | cross-cutting 정책 #1 |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be |
|---|---|---|
| 권한 마스터 테이블 | `TB_MCM_SEC_PERM` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_PERM` |
| Role 매핑 테이블 | `TB_MCM_SEC_ROLE_MAPPING` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` |
| **Entity 명명 (cross-cutting 정책 #6 — A안 : 테이블명 1:1 직역)** | (해당 없음 — As-Is mui 에 Entity ✗ — Java UserTask 부재로 Entity 자체 부존재) | **`SecPerm`** (`TB_MCM_SEC_PERM` → `SecPerm` — `TB_MCM_` prefix 제거 + camelCase) — JPA `@Entity @Table(schema="MCMAPUSER", name="TB_MCM_SEC_PERM")`. **`SecPermButton` Entity 는 미생성** (As-Is mui 에 PERM_BUTTON 관련 별도 테이블 ✗ — 본 화면 ds_main 의 PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION 4 TextArea 컬럼은 모두 TB_MCM_SEC_PERM 본 테이블의 단일 컬럼 — 별도 button 테이블 ✗). Role 매핑 Entity 는 `SecRoleMapping` (read-only — commRoleMng 화면이 owner) |
| Java 패키지 (cactus-core 흡수 시) | (해당 없음 — Java UserTask ✗) | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commPermMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1 정본) |
| Repository 명명 | (해당 없음) | `com.dongkuk.dmes.mcm.repository.SecPermRepository` (Entity `SecPerm` 1:1) |
| Mapper namespace | `CommPermMngMapper` | JPA Repository 흡수 → `SecPermRepository` (native query 보존 시). Mapper.xml.asis 는 보존 |
| BPMN process id / name | `sample1` / `menuInfor` (As-Is 잔존 — 다른 화면명) | `commPermMng` / `commPermMng` |
| xfdl titletext | "PERMISSON 관리" (오타) | "PERMISSION 관리" |
| **BPMN Task / SequenceFlow 폐기 (cross-cutting 정책 #1)** | Task_08v4ryn (lov_SUBSYSTEM 조회 — cross-module CommObjMngMapper.selectAppHostId) / SequenceFlow_1dd2kqv (lov) / SequenceFlow_0xqzbh4 (chain to End) | 모두 **To-Be 폐기** (BPMN 노드 6→5 / sequenceFlow 7→5 / action 3→2 / cross-module 의존성 0) |

> 사용자 결정: As-Is 테이블명 (대문자 prefix) + `MCMAPUSER` 스키마 그대로 보존. Java 패키지는 RULE.md §"패키지 명명 규칙" §3-1 정본 적용. As-Is 오타 (xfdl titletext / BPMN process id / SELECT BIZ_SYSTEM_CODE 중복) 는 To-Be 에서 정정. **Entity 명명은 cross-cutting 정책 #6 A안 (테이블명 1:1 직역) 적용 — `SecPerm` (SecPermButton 별도 Entity 미생성)**.

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 미결정 = **0 건**. 결정 내용은 §6 / §8 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **audit 컬럼** | As-Is `ref_Audit` fragment 17 컬럼 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1). DATA_END_*/ARCHIVE_* 9 컬럼 제거. JPA `@PrePersist` / `@PreUpdate` 자동 채움 | §9.1 / §11 #6 |
| **스키마/테이블명 (cross-cutting 정책 #1 정합 — 대문자 prefix 보존)** | As-Is `TB_MCM_SEC_PERM` (mui Mapper.xml 스키마 prefix ✗) → To-Be `MCMAPUSER.TB_MCM_SEC_PERM` 대문자 prefix 보존 (MSSQL `sample_dmes` 의 `MCMAPUSER` 스키마). TB_MCM_SEC_ROLE_MAPPING 동일 처리 (read-only — commRoleMng owner) | §11 #7 / §11.1 |
| **xfdl titletext "PERMISSON" 오타** | As-Is xfdl:14 titletext "PERMISSON 관리" → To-Be "PERMISSION 관리" 정정 | §11 / §11.1 |
| **BPMN process id "sample1"** | As-Is bpmn:3 `id="sample1"` / `name="menuInfor"` (다른 화면 잔존 식별자) → To-Be `id="commPermMng"` / `name="commPermMng"` 정정 | §11 / §11.1 |
| **SELECT BIZ_SYSTEM_CODE 중복** | As-Is xml:18 / 23 중복 SELECT (1 회 정리). cross-cutting 정책 #1 적용 후 BIZ_SYSTEM_CODE 자체가 To-Be SQL 에서 폐기되므로 본 중복 정리 결정은 효력 흡수 | §11 |
| **`END_ACTIVE_DATE` 신규 default** | As-Is `"99991231"` (8자 String 하드코딩) → To-Be `LocalDate.of(9999,12,31)` 또는 `'9999-12-31'` 명시 (Service 레이어) | §11 |
| ~~**cross-module SQL `CommObjMngMapper.selectAppHostId`**~~ | ~~OASIS BPMN 의 cross-module sqlKey 하드코딩 유지 — commObjMng 화면 설계 산출물이 본 SQL 의 owner~~ → **cross-cutting 정책 #1 (2026-05-31) 로 폐기** — cross-module 의존성 해소 (Task_08v4ryn lov_SUBSYSTEM 노드 + flow 제거) | §6 (#5 행 삭제) / §11 #8 (폐기 명시) / §12 (BIZ_SYSTEM_CODE 폐기 행) |
| **`STATUS` 컬럼 (G-001)** | Nexacro auto row state 동작 확인. To-Be FE 에서 동일 row state 표시 기능 구현 | §10.1 ST-005 |
| **`fn_callBack` saveCmPerm "조회" 메시지** | As-Is "성공적으로 저장되었습니다" confirm 별도 + `commonBottomStatus_msg(... + "건 조회 되었습니다.")` 메시지 (xfdl:343) — 저장 콜백인데 메시지가 "조회" 표시. As-Is 그대로 보존 (cleanup 후보 — To-Be 결정) | 기능설계서 §10 |
| **`fn_lov` callback 주석 코드** | As-Is xfdl:354~357 — lov 분기에서 주석 처리된 `ds_lovSubSystem.insertRow(0)` + `setColumn(0, "APP_HOST_ID", "")` 코드 잔존. To-Be 동작 ✗ (콜백 무동작). cross-cutting 정책 #1 적용으로 fn_lov 메서드 자체가 폐기되어 본 잔존 코드는 To-Be 에서 완전 제거 | §4.4 #6 |
| **MasterCodeMng 와 다른 점 — Java UserTask ✗** | 본 화면은 ScriptTask (CommonSelectTask / CommonMultiSaveTask) 만 사용 — 화면 전용 Java 코드 없음 (csa 폴더 ls 검증 — CommPermMng 하위 폴더 ✗) | §0 / §2 / §7 |
| **`gfn_dsRequired` 보강** | As-Is fn_save 에서 `gfn_dsRequired("PERMISSION_ID USE_TP")` 2 컬럼만 필수 검증 (xfdl:431). 다른 Essential 컬럼은 검증 ✗ — As-Is 그대로 보존 (cross-cutting 정책 #1 적용으로 BIZ_SYSTEM_CODE Essential 자체 폐기되어 보강 대상 컬럼 없음) | 기능설계서 §6 |
| **권한 / 접근 제어** | 본 화면이 PERMISSION 마스터 자체를 관리 (시스템 관리자 전용 추정). To-Be 권한 프로세스 (외부 모델) 위임. 본 화면 자체 권한 분기 ✗ | 기능설계서 §8 |
| **동시성 / Optimistic Locking** | cactus-core `VER` (@Version) 자동 적용 | §9 / §11 |
| **Java 패키지** | UserTask 부재 (Java 클래스 ✗). cactus-core 흡수 후 Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commPermMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1 정본 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | §11.1 |
| **cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기 (2026-05-31)** | (a) UI: S-001 cbo_bizSystemCode (검색조건) + D-007 / D-008 (Detail Essential Combo) + G-008 (Grid 컬럼) 모두 제거. (b) SQL: selectCommPermMng SELECT 2 회 (xml:18/23) + WHERE `<if>` 절 (xml:36) + insertCommPermMng (xml:51/65) + updateCommPermMng (xml:81) 의 BIZ_SYSTEM_CODE 모두 제거. (c) Dataset: DS-003 ds_lovSubSystem 폐기 + DS-001 ds_main 의 BIZ_SYSTEM_CODE 컬럼 제거. (d) Bind: item10 제거. (e) BPMN: Task_08v4ryn (lov_SUBSYSTEM) + SequenceFlow_1dd2kqv (lov) + SequenceFlow_0xqzbh4 모두 제거 → action 3→2 / 노드 6→5 / flow 7→5. (f) Script: fn_lov 메서드 + fn_callBack 의 lov 분기 + fn_onload 내 fn_lov() 호출 모두 제거 → 메서드 20→19. (g) Cross-module: `CommObjMngMapper.selectAppHostId` 호출 의존성 해소. (h) DB DDL: TB_MCM_SEC_PERM 의 BIZ_SYSTEM_CODE 컬럼 자체는 보존 (legacy 데이터) — 본 화면 SQL/UI/Entity 에서 미사용 | §1 / §3.2 / §3.5 / §3.7 / §4.4 #3·#6 / §6 / §8 / §9.1 #11 / §10 / §11 #8·#9 |
| **DMES Excel csa 시트 DDL (cross-cutting 정책 #1 정합)** | DMES Excel xlsx 압축 해제 + xml 파싱 → 분석 §9.3 신설 완료 (2026-05-30). sheet rId88 (TB_MCM_SEC_PERM 29 컬럼) + sheet rId92 (TB_MCM_SEC_ROLE_MAPPING 20 컬럼 — commObjMng §9.6.5 참조) 1:1 등재. PERMISSION_ID VARCHAR(100) PK / PERMISSION_GROUP As-Is mapper 미사용 컬럼 식별. 본 컬럼 Type 은 sheet 동일 컬럼 차용 | §9.3 |
| **Entity 명명 (cross-cutting 정책 #6 A안 : 테이블명 1:1 직역, 2026-05-31)** | `TB_MCM_SEC_PERM` → Entity 명 `SecPerm` (TB_MCM_ prefix 제거 + camelCase). `SecPermButton` Entity 는 미생성 (As-Is mui 에 PERM_BUTTON 별도 테이블 ✗). Role 매핑 Entity 는 `SecRoleMapping` (read-only — commRoleMng 화면 owner). Entity 패키지 = `mcm.entity.*` 모듈 직속 (cross-cutting 정책 #6 A안) | §11.1 |
| **As-Is/To-Be 표준 우선 원칙 (cross-cutting 정책 #4 (0))** | As-Is 1:1 보존 + 누락 0 + cite 100% 가 모든 표준 (가이드 / 정책 / Runner) 보다 우선. cross-cutting 정책 #1·#6 결정도 As-Is 인용 보존 후 To-Be 폐기 ~~취소선~~ + 결정 영역 행 등재 패턴으로 일관 적용 | §0 |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / TextArea / Radio / Calendar / Dataset / Bind 전수 등재 | §3.1~§3.7 행수 (영역 7 + **As-Is S 4 / G 12 / D 26 / DS 3** → **To-Be S 3 / G 11 / D 24 / DS 2** + FX 4) + 본문 별도 메서드 **As-Is 20 / To-Be 19** §4.4 + 버튼 §4.1 3 행 + 팝업 §5 2 행 + EX 4 행 | ✓ (As-Is 1:1 인용 + To-Be 정책 #1 폐기 명시) |
| G-B: Mapper.xml 4 SQL 전수 + ~~cross-module 1 SQL 인용~~ → To-Be 자체 4 SQL 만 | §6 표 5 행 (자체 4 + ~~cross-module 1~~ 폐기) | ✓ |
| G-C: Java 메서드 전수 | (해당 없음 — Java UserTask ✗ — §0 / §2 / §7) | ✓ (skip 사유 명시) |
| G-D: BPMN flow 전수 | §8.1 (**As-Is 6 노드 → To-Be 5**) + §8.2 (**As-Is 7 sequenceFlow → To-Be 5**) + §8.3 (**As-Is 3 action 흐름 → To-Be 2**) + §8.4 (diagram 좌표 — As-Is 인용 + To-Be 폐기) | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: Q-NNN 활성 = **0 건** | §12 결정 누적표 (19 행 — 기존 15 행 + cross-cutting 정책 #1/DDL/#6/#4(0) 4 행) — 모든 결정 완료 | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §12 누적표 명시 | xfdl titletext "PERMISSON" / BPMN process id "sample1" / SELECT BIZ_SYSTEM_CODE 중복 — 분석 시 As-Is 1:1 인용 + To-Be 결정 별도 명시 | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑 / Java UserTask 부재) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 8 행 + §11.1 To-Be 명명 안 6 행 | ✓ |
| G-J: 정합체크서 §A.3 / §A.A-R12-1 / §D.4 ✗ + 사유 | §0 표 + 정합체크서 §A / §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성.

### §6.14 Phase 1 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---:|---|---|
| 1 | 14항 위반? | No — As-Is 1:1 보존 (xfdl/Mapper.xml/BPMN file:line cite 100%), 누락 0 ("주요/대표/등" 표현 0건), 분량 회피 ✗, 임의 신설 § ✗, 경로 패턴 추측 ✗ (ls 검증) |
| 2 | 검증 안 한 부분? | Q-001 해소 (2026-05-30 §9.3 신설 / 2 시트 49 컬럼 전수). 그 외 자산 4종 (xfdl / Mapper.xml / BPMN / Java 부재 확인) 모두 처음~끝 Read 완료. 잔존 0건. |
| 3 | 그대로 수용? | No — As-Is 오타 / 중복 / 무관 식별자 (xfdl titletext "PERMISSON" / BPMN process id "sample1" name "menuInfor" / SELECT BIZ_SYSTEM_CODE xml:18·23 중복 / fn_callBack saveCmPerm "조회" 메시지 / fn_lov callback 주석 코드) 모두 분석 시 As-Is 보존 + To-Be 결정 §11 / §12 에 명시 |
| 4 | 임의 합리화? | No — Java UserTask 부재 = ls 명령으로 csa 디렉토리 실 검증 (CommChainMasterMng/CommSyncMng/CommUserMng/CommUserRoleCopy 4 폴더만 존재 — CommPermMng 폴더 ✗) + BPMN 의 Task class 가 표준 `CommonSelectTask` / `CommonMultiSaveTask` 임 확인 (bpmn:26/42/60) → §0 환경 제약 / §2 #2 / §7 에 사유 명시 |

> 4 질문 모두 No (Q-001 해소 2026-05-30 + cross-cutting 정책 #1·#6 적용 2026-05-31). Phase 1 통과.
