---
screenId: commRoleGrpMng
asIsId: CommRoleGrpMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 역할 그룹 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §D.4 (manifest 9 파일 검증) | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script (단, 본 화면은 Java UserTask 디렉토리 부재 — 모든 비즈니스가 ScriptTask 만) / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만"은 mui 환경에 미적용. cite 는 file:line 형식 유지 |
| Java UserTask 자산 부재 | 본 화면은 `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleGrpMng/` 디렉토리 **부재** → BPMN 의 모든 비즈니스 노드는 ScriptTask 만 사용 (UserTask 0). Service Java 클래스 새로 작성 ✗ — As-Is 1:1 보존 정책으로 BPMN 의 commonDbTask 만 To-Be 매핑 | 직접 ls 확인 — `csa/` 하위에 `CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 디렉토리만 존재 / `CommRoleGrpMng` 디렉토리 ✗ |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 역할 그룹 관리 |
| 화면 식별자 (screenId) | commRoleGrpMng |
| As-Is 식별자 (asIsId) | CommRoleGrpMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 역할 그룹 관리 (commRoleGrpMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commRoleGrpMng |
| pageId | commRoleGrpMng |
| serviceId | commRoleGrpMng |
| Frontend 파일명 | `commRoleGrpMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> 역할 그룹 관리는 CommRoleGrpMng의 조회, 등록, 수정, 삭제, 상태변경을 수행한다.

- 주 사용자: 시스템 관리자 / 보안 운영 담당자
- 업무 도메인: 시스템관리 (csa — Common System Administration) 의 역할 그룹 (Role Group) 마스터 관리 + 역할 그룹별 역할(Role) 매핑 관리 + 매핑 결과로 결정되는 메뉴 트리 조회.
- 기능 요약 (BPMN action **6 enum** — To-Be 정책 #1 적용 결과: `lov` 폐기 / BIZ SYSTEM 콤보·외부 cross-namespace 일괄 폐기 / action 6 enum 정합):
  1. `searchCmRoleGrp` — 역할 그룹 메인 그리드 조회 (`fn_search` → `fn_run("searchCmRoleGrp")`, xfdl:665)
  2. `saveCmRoleGrp` — 역할 그룹 메인 그리드 일괄 저장 (INSERT/UPDATE/DELETE 통합 `:U`) (`fn_save` → `fn_run("saveCmRoleGrp")`, xfdl:674)
  3. `searchCmRoleGrpMap` — 선택 역할 그룹의 현재 매핑된 역할 조회 (`fn_run("searchCmRoleGrpMap")`, xfdl:476)
  4. `saveCmRoleGrpMap` — 역할 그룹-역할 매핑 저장 (INSERT/DELETE) (`fn_removeRoleMapRow` / `fn_appendRoleMapRow` → `fn_run("saveCmRoleGrpMap")`, xfdl:611 / xfdl:625)
  5. `searchCmRole` — 선택 역할 그룹에 미매핑된 전체 역할 조회 (`fn_run("searchCmRole")`, xfdl:497)
  6. `searchCmRoleGrpMenu` — 선택 역할 그룹의 매핑 역할이 보유한 메뉴 트리 조회 (`fn_run("searchCmRoleGrpMenu")`, xfdl:509)

> **As-Is 원본**: BPMN action 7 enum (lov 포함). **To-Be 정책 #1 (BIZ SYSTEM 콤보 제거)** 에 의거 lov action 및 Task_1erud76 노드를 폐기 → 활성 action 6 enum (lov 행 삭제). 사용자 사전 명시 "6 enum" 과 정합 (§12 결정 누적표 참조).

---

## §2. 자료 수집 인벤토리 (mui 5 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommRoleGrpMng.xfdl` | 873 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / Calendar / Radio / Dataset / BindItem / Script 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleGrpMng/` | **없음 — ScriptTask 만** | N (디렉토리 부재) | 직접 ls 확인 — `csa/` 하위에 `CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 디렉토리만 존재 / `CommRoleGrpMng` 디렉토리 ✗. 본 화면의 모든 비즈니스 노드는 BPMN ScriptTask (commonDbTask.CommonSelectTask / CommonMultiSaveTask) 만 사용 | §7 (해당 없음) |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommRoleGrpMngMapper.xml` | 250 | Y | 8 SQL ID (select 4 / insert 2 / update 1 / delete 2) — 8 호출 + 추가 0. 단, `updateCommRoleGrpMap` (xml:113) 은 더미 SELECT (실 UPDATE ✗) | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommRoleGrpMng.bpmn` | 292 | Y | StartEvent / ExclusiveGateway 7 분기 / Task 7 (CommonSelectTask 5 + CommonMultiSaveTask 2) / UserTask 0 / EndEvent 1 / SequenceFlow 15 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (mcm cma 4 화면 작업에서 이미 113 시트 추출 — 본 화면 csa 영역 시트는 별도 시트, mcm 모듈 전체 동봉) | Y (재인용) | TB_MCM_SEC_ROLEGROUP / TB_MCM_SEC_ROLEGROUP_MAPPING / TB_MCM_SEC_ROLE / TB_MCM_SEC_ROLE_MAPPING / TB_MCM_SEC_USER_MAPPING / TB_MCM_SEC_MENU / TB_MCM_SEC_MENU_FLD / TB_MCM_SEC_OBJ 8 테이블 — As-Is Mapper xml 등재 컬럼 기반 추론 + DMES Excel 카탈로그 보강. 단 csa 영역 신규 시트는 별도 §11 Q 등재 | §9 |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.insert_item / insert_value / update">` 5 회 호출은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | §11 #5 |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu (`commonTopButton.xfdl`) | xfdl:6~13 |
| A-FILTER | `Div div_search` | top=`div_title:10` / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (BIZ SYSTEM 콤보 + 역할 그룹 ID + 역할 그룹명 + 사용 여부 콤보) | xfdl:14~45 |
| A-FOLD | `Button btn_fold` | top=93 / height=10 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:46 |
| A-MAIN | `Div div_main` | top=`btn_fold:20` / bottom=40 / left=20 / right=20 | 좌상 메인 그리드 + 우상 상세 + 좌하 좌측 트리/현재역할 + 가운데 셔틀 + 우하 전체역할 통합 컨테이너 | xfdl:47~272 |
| A-MAIN-TOP-LEFT (= A-GRID) | `Div div_mainGrd` | top=0 / left=0 / height=222 / right=440 | 역할 그룹 목록 그리드 (G-NNN) + 좌측 메뉴 + 우측 메뉴 | xfdl:124~172 |
| A-MAIN-TOP-RIGHT (= A-DETAIL) | `Div div_mainDetail` | top=0 / left=`div_mainGrd:10` / width=430 / height=222 | 역할 그룹 상세 입력 폼 (D-NNN) | xfdl:220~269 |
| A-MAIN-BOT-LEFT (= A-GRID-EXT1 + A-TREE) | `Div div_subGrd1` | top=202 / left=0 / width=800 / bottom=0 / ondragmove + ondrop | 좌하 패널: 좌측 메뉴 트리 + 우측 "현재 역할" 그리드 (GE1-NNN) | xfdl:50~115 |
| A-MAIN-CENTER (= A-SHUTTLE) | `Div div_buttonGrp` | top=62.50% / height=75 / left=`div_subGrd1:5` / width=24 | 셔틀 버튼 (좌→우 추가 / 우→좌 제외) | xfdl:116~123 |
| A-MAIN-BOT-RIGHT (= A-GRID-EXT2) | `Div div_subGrd2` | top=`div_mainGrd:10` / left=`div_buttonGrp:5` / bottom=0 / right=0 | 우하 패널: "전체 역할" 그리드 (GE2-NNN) + 필터 입력 + 우측 메뉴 | xfdl:173~219 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:273 |

> 본 화면은 "역할 그룹 — 매핑된 역할 — 전체 역할" 3 그리드 + 좌측 보조 트리 + 1 셔틀 + 1 상세 폼 = 매우 복잡한 6 패널 레이아웃 (As-Is 1:1 보존).

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Edit.text/value) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / cssclass | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ SYSTEM~~ | ~~`cbo_bizSystemCode`~~ | ~~ComboBox~~ | - | ~~`value="Y"` / innerdataset=`ds_lovSubSystem`~~ | N | ~~xfdl:17~18~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM 콤보 제거: lov action / Task_1erud76 / `ds_lovSubSystem` / `cbo_bizSystemCode` 전부 폐기 / §12 결정 누적표 참조) |
| S-002 | 역할 그룹ID | `edt_ROLE_GROUP_ID` (옆 Static `sts_roleGroupId` value="역할 그룹ID") | TextBox | 100 | text="부산역 CY" (디자인 시점 더미) | N | xfdl:19~20 |
| S-003 | 역할 그룹명 | `edt_ROLE_GROUP_NM` (옆 Static `sts_roleGroupNm` value="역할 그룹명") | TextBox | 100 | text="부산역 CY" (디자인 시점 더미) | N | xfdl:21~22 |
| S-004 | 사용 여부 | `cbo_USE_TP` (옆 Static `sts_useTp` value="사용 여부") | ComboBox | - | `value="Y"` / `text="Y"` / innerdataset=정적 (Y/Y, N/N 2 행) / displayrowcount=3 | N | xfdl:23~42 |

> **S-NNN 활성 합계 = 3** (S-001 BIZ SYSTEM 콤보 폐기 — 정책 #1). Static 라벨 — `sts_roleGroupId`(역할 그룹ID, xfdl:19) / `sts_roleGroupNm`(역할 그룹명, xfdl:21) / `sts_useTp`(사용 여부, xfdl:23) — 모두 cssclass=`edi_WFSA_Label` readonly=true tabstop=false. (As-Is 의 `stc_bizSystemCode` 라벨도 S-001 콤보와 함께 To-Be 폐기.)

### §3.3 메인 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, taborder=0, 영역 A-MAIN-TOP-LEFT)

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 기타 (calendardateformat 등) | 근거 |
|---|---|---|---:|---|---|---|---|
| G-001 | 상태 | `bind:STATUS` | 48 (band=left) | `none` | `imagecontrol` | head displaytype=normal | xfdl:133 / 147 / 157 |
| G-002 | 역할 그룹 ID | `bind:ROLE_GROUP_ID` | 90 | `none` (head 명시 — body 셀은 edittype 미지정 = 기본 편집 가능) | normal | textAlign=left | xfdl:134 / 148 / 158 |
| G-003 | 역할 그룹명 | `bind:ROLE_GROUP_NM` | 140 | (기본 편집) | (기본) | textAlign=left | xfdl:135 / 149 / 159 |
| G-004 | 역할 그룹 설명 | `bind:ROLE_GROUP_DESC` | 140 | (기본 편집) | (기본) | textAlign=left | xfdl:136 / 150 / 160 |
| ~~G-005~~ | ~~BIZ SYSTEM~~ | ~~`bind:BIZ_SYSTEM_CODE`~~ | 80 | (기본 편집) | (기본) | - | ~~xfdl:137 / 151 / 161~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM 메인 그리드 컬럼 폐기) |
| G-006 | 사용구분 | `bind:USE_TP` | 80 | (기본 편집) | (기본) | - | xfdl:138 / 152 / 162 |
| G-007 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:139 / 153 / 163 |
| G-008 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:140 / 154 / 164 |

- 그리드 옵션: `autofittype="col"`, `cellmovingtype="col"`, `cellsizingtype="col"`, `selecttype="cell"`, `autosizebandtype="allband"`, `autosizingtype="col"`, head Row 1 + body Row 1 (`band="head"` / body)
- 이벤트: `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` (xfdl:797 — `gfn_commonOnheadclick`)
- 추가 동적 동작: `ds_main_onrowposchanged` (xfdl:753) — 행 위치 변경 시 자동 searchCmRoleGrpMap + searchCmRole + searchCmRoleGrpMenu 3 회 트리거
- 그리드 옆 라벨/외부 div: `edt_rol_grp_list` (Edit cssclass=`edi_WF_Title1` value="역할그룹 목록", xfdl:127) / `div_leftMenu` url=`_com_div::commonLeftButton.xfdl` (xfdl:128) / `div_rightMenu` url=`_com_div::commonRightButton.xfdl` (xfdl:169)

### §3.4 확장 그리드 GE1-NNN (`grd_sub1` "현재 역할", binddataset=`ds_roleGrpMap`, taborder=1, 영역 A-MAIN-BOT-LEFT 우측)

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 기타 | 근거 |
|---|---|---|---:|---|---|---|---|
| GE1-001 | (체크박스) | `bind:CHK` | 30 (band=left) | `checkbox` | `checkboxcontrol` | head 동일 displaytype/edittype + `autosizecol="limitmin"` | xfdl:58 / 72 / 82 |
| GE1-002 | 역할 ID | `bind:ROLE_ID` | 89 | (기본) | (기본) | - | xfdl:59 / 73 / 83 |
| GE1-003 | 역할명 | `bind:ROLE_NM` | 140 | (기본) | (기본) | textAlign=left | xfdl:60 / 74 / 84 |
| GE1-004 | 부모역할 ID | `bind:PARENT_ROLE_ID` | 101 | (기본) | (기본) | - | xfdl:61 / 75 / 85 |
| GE1-005 | 사용 여부 | `bind:USE_TP` | 60 | (기본) | (기본) | - | xfdl:62 / 76 / 86 |
| GE1-006 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:63 / 77 / 87 |
| GE1-007 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:64 / 78 / 88 |
| GE1-008 | 역할 그룹 ID | `bind:ROLE_GROUP_ID` | 80 | (기본) | (기본) | - | xfdl:65 / 79 / 89 |

- 그리드 옵션: `autofittype="none"`, `cellmovingtype="col"`, `cellsizingtype="col"`, `selecttype="row"`, `autoenter="select"`, `treeusebutton="no"`, `treeusecheckbox="false"`, `treeuseimage="false"`, `treeuseline="false"`, `autosizebandtype="allband"`, `autosizingtype="col"`, `cellsizebandtype="allband"`, head Row 1 + body Row 1, `minheight="50"`, font=`12px/normal Malgun Gothic`
- 이벤트: `onheadclick="div_main_div_subGrd1_grd_sub1_onheadclick"` (xfdl:802 — CHK 헤드 클릭 시 전체 선택 / 그 외 컬럼 gfn 공통 정렬)
- 그리드 옆 라벨: `edt_roleMapList` (Edit cssclass=`edi_WF_Title1` value="현재 역할", xfdl:53)
- 보조 컴포넌트: 좌측에 `grd_M0F1` (메뉴 트리 — §3.5 별도) 동거

### §3.5 좌측 보조 트리 (`grd_M0F1` "메뉴 구조", binddataset=`ds_menuTreeList`, taborder=0, 영역 A-MAIN-BOT-LEFT 좌측)

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 기타 | 근거 |
|---|---|---|---:|---|---|---|---|
| LT-001 | 메뉴 구조 | `bind:MENU_NM` | 182 | `tree` | `treeitemcontrol` | `treelevel="bind:LEV"` / `treestartlevel="0"` | xfdl:98 / 105 / 108 |

- 그리드 옵션: `treeinitstatus="expand,all"`, `treeusebutton="use"`, `autofittype="col"`, `wheelscrollrow="2"`, cssclass=`grd_LF_Tree`, head Row 1 + body Row 1, width=250
- 이벤트: `oncellclick="div_main_grd_M0F1_oncellclick"` (xfdl Script 내 핸들러 정의 ✗ — As-Is 동작 ✗ 보존, §12 결정 누적표 참조) / `onmousemove="div_main_grd_M0F1_onmousemove"` (Script 정의 ✗ — As-Is 동작 ✗ 보존, §12)

### §3.6 확장 그리드 GE2-NNN (`grd_sub2` "전체 역할", binddataset=`ds_role`, taborder=0, 영역 A-MAIN-BOT-RIGHT)

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 기타 | 근거 |
|---|---|---|---:|---|---|---|---|
| GE2-001 | (체크박스) | `bind:CHK` | 48 (band=left) | `checkbox` | `checkboxcontrol` | head 동일 displaytype/edittype + `autosizecol="limitmin"` | xfdl:181 / 194 / 203 |
| GE2-002 | 역할 ID | `bind:ROLE_ID` | 105 | (기본) | (기본) | - | xfdl:182 / 195 / 204 |
| GE2-003 | 역할명 | `bind:ROLE_NM` | 120 | (기본) | (기본) | textAlign=left | xfdl:183 / 196 / 205 |
| GE2-004 | 부모역할 ID | `bind:PARENT_ROLE_ID` | 80 | (기본) | (기본) | textAlign=left | xfdl:184 / 197 / 206 |
| GE2-005 | 사용여부 | `bind:USE_TP` | 60 | (기본) | (기본) | - | xfdl:185 / 198 / 207 |
| GE2-006 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:186 / 199 / 208 |
| GE2-007 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | (기본) | `date` | calendardateformat=`yyyy-MM-dd` | xfdl:187 / 200 / 209 |

- 그리드 옵션: `autofittype="col"`, `cellmovingtype="col"`, `cellsizingtype="col"`, `selecttype="row"`, `autoenter="select"`, `treeinitstatus="expand,all"`, `treeusecheckbox="false"`, `treeuseimage="false"`, `treeuseline="false"`, `autosizebandtype="allband"`, `autosizingtype="col"`, `cellsizebandtype="allband"`, head Row 1 + body Row 1
- 이벤트: `onheadclick="div_main_div_subGrd2_grd_sub2_onheadclick"` (xfdl:819 — CHK 헤드 클릭 시 전체 선택 / 그 외 컬럼 gfn 공통 정렬) / `onkeydown="div_main_div_subGrd2_grd_sub2_onkeydown"` (xfdl:829 — 본문 핸들러 내부 전부 주석 처리)
- 그리드 옆 라벨/필터: `edt_auth_list` (Edit cssclass=`edi_WF_Title1` value="전체 역할", xfdl:176) / `edt_auth_list2` value="Role" (xfdl:216) / `edt_rolefilter` (Edit width=140 onkeyup, xfdl:215) / `div_rightMenu` url=`_com_div::commonRightButton.xfdl` (xfdl:214)

### §3.7 상세 입력 폼 D-NNN (`div_mainDetail` > `div_detail`, 영역 A-MAIN-TOP-RIGHT)

| ID | xfdl id | 컨트롤 | 라벨 (Edit.value/text) | 좌표 (left/top/width/height) | maxlength | 입력 유형 | 필수 (cssclass `Essential`) | 근거 |
|---|---|---|---|---|---|---|---|---|
| D-001 | `edt_st_roleGroupId` (라벨) + `edt_role_group_id` (입력) | Edit | "역할 그룹 ID" (cssclass=`edi_WF_LabelFirstE` — Essential 라벨) | 라벨 0/0/180/29 / 입력 184/4/240/21 | 90 | TextBox | Y (cssclass=`Essential`) | xfdl:233 / 238 |
| ~~D-002~~ | ~~`edt_st_BIZ_SYSTEM_CODE` (라벨) + `cbo_subSystemCode` (입력)~~ | ~~ComboBox~~ | ~~"BIZ SYSTEM"~~ | - | - | ~~ComboBox~~ | Y | ~~xfdl:262 / 263~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM Detail 콤보 제거: `cbo_subSystemCode` / `edt_st_BIZ_SYSTEM_CODE` 라벨 / `stc_Static5` 배경 / BindItem `BI-007` 폐기 / §12 결정 누적표 참조) |
| D-003 | `edt_st_roleGroupNm` (라벨) + `edt_role_group_nm` (입력) | Edit | "역할 그룹명" (cssclass=`edi_WF_Label`) | 라벨 0/56/180/29 / 입력 184/60/240/21 | 100 | TextBox | N | xfdl:232 / 240 |
| D-004 | `edt_st_roleGroupDesc` (라벨) + `edt_role_group_desc` (입력) | Edit | "역할 그룹 설명" (cssclass=`edi_WF_Label`) | 라벨 0/84/180/29 / 입력 184/88/240/21 | 100 | TextBox | N | xfdl:234 / 260 |
| D-005 | `edt_st_useTp` (라벨) + `edt_use_tp` (입력) | Radio | "사용 여부" (cssclass=`edi_WF_LabelFirst`) | 라벨 0/112/180/29 / 입력 185/116/128/21 | - | Radio (codecolumn=Y/N, datacolumn=Yes/No, direction=vertical, value="Y") | N | xfdl:235 / 241~258 |
| D-006 | `edt_st_startActiveDate` (라벨) + `cal_start_active_date` (입력) | Calendar | "유효 개시일" (cssclass=`edi_WF_Label`) | 라벨 0/140/180/29 / 입력 184/143/240/21 | - | Calendar (usetrailingday=true) | N | xfdl:231 / 259 |
| D-007 | `edt_st_endActiveDate` (라벨) + `cal_end_active_date` (입력) | Calendar | "유효 기한일" (cssclass=`edi_WF_Label`) | 라벨 0/166/180/29 / 입력 184/170/240/21 | - | Calendar (usetrailingday=true) | N | xfdl:237 / 239 |

- 라벨 배경 (To-Be 활성): `stc_Static1` (top=0, cssclass=`stc_WF_BoxFirst`, xfdl:229) / `stc_Static2` (top=56, xfdl:227) / `stc_Static3` (top=84, xfdl:230) / `stc_Static9` (top=112, xfdl:226) / `stc_Static11` (top=140, xfdl:228) / `stc_Static12` (top=166, xfdl:236) — 모두 cssclass=`stc_WF_Box` 또는 `stc_WF_BoxFirst`. (As-Is 의 `stc_Static5` (top=28, xfdl:261) 는 D-002 BIZ SYSTEM 콤보와 함께 To-Be 폐기 — 정책 #1.)
- 이벤트: `edt_role_group_id` 의 `canchange="div_main_div_mainDetail_div_detail_edt_object_id_canchange"` (xfdl:238) — Script 본문 미정의 (As-Is 동작 ✗ 보존, §12 결정 누적표 참조). `cbo_subSystemCode` 의 `onitemchanged` (xfdl:263) — D-002 콤보 폐기와 함께 To-Be 미적용. **D-001 ROLE_GROUP_ID 중복 검증 처리: Service 레이어 흡수** — D-001 canchange 핸들러 신규 작성 ✗ (xfdl 본문 미정의 As-Is 보존), 대신 saveCmRoleGrp Service 가 PK 중복 검증 책임 보유 (§11.1 #15 신설).

### §3.8 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_role` | ROLE_ID / ROLE_NM / PARENT_ROLE_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / CHK (7 컬럼) | 전체 역할 (GE2 binddataset) — searchCmRole 결과 | type STRING(100/100/256/10/20/20/10) | xfdl:277~287 |
| DS-002 | `ds_main` | ROLE_GROUP_ID / ROLE_GROUP_NM / ROLE_GROUP_DESC / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / USER_ID / ~~BIZ_SYSTEM_CODE~~ (As-Is 8 → **To-Be 7 컬럼**, 정책 #1 으로 BIZ_SYSTEM_CODE 컬럼 폐기) | 역할 그룹 메인 (G binddataset + D bind 대상) — searchCmRoleGrp 결과 | type STRING(256 전수) / `oncolumnchanged`/`onrowposchanged` 이벤트 등록 | xfdl:288~299 |
| DS-003 | `ds_roleGrpMap` | ROLE_ID / ROLE_NM / PARENT_ROLE_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID / CHK (8 컬럼) | 현재 매핑 역할 (GE1 binddataset) — searchCmRoleGrpMap 결과 | type STRING(256 + 50/50 START/END + 10 CHK) | xfdl:300~311 |
| DS-004 | `ds_menuTreeList` | MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID / LEV (5 컬럼) | 메뉴 트리 (LT binddataset) — searchCmRoleGrpMenu 결과 | type STRING + INT 혼용 | xfdl:312~320 |
| ~~DS-005~~ | ~~`ds_lovSubSystem`~~ | ~~APP_HOST_ID (1 컬럼)~~ | ~~BIZ SYSTEM 콤보 LoV — lov 결과~~ | - | ~~xfdl:321~325~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM 콤보 폐기로 ds_lovSubSystem Dataset 도 폐기 / §12 결정 누적표 참조) |

### §3.9 BindItem 전수 (xfdl Bind)

| ID | compid | propid | datasetid | columnid | 근거 |
|---|---|---|---|---|---|
| BI-001 | `div_main.form.div_mainDetail.form.div_detail.form.edt_role_group_id` | value | ds_main | ROLE_GROUP_ID | xfdl:328 |
| BI-002 | `div_main.form.div_mainDetail.form.div_detail.form.cal_start_active_date` | value | ds_main | START_ACTIVE_DATE | xfdl:329 |
| BI-003 | `div_main.form.div_mainDetail.form.div_detail.form.edt_use_tp` | value | ds_main | USE_TP | xfdl:330 |
| BI-004 | `div_main.form.div_mainDetail.form.div_detail.form.cal_end_active_date` | value | ds_main | END_ACTIVE_DATE | xfdl:331 |
| BI-005 | `div_main.form.div_mainDetail.form.div_detail.form.edt_role_group_desc` | value | ds_main | ROLE_GROUP_DESC | xfdl:332 |
| BI-006 | `div_main.form.div_mainDetail.form.div_detail.form.edt_role_group_nm` | value | ds_main | ROLE_GROUP_NM | xfdl:333 |
| ~~BI-007~~ | ~~`div_main.form.div_mainDetail.form.div_detail.form.cbo_subSystemCode`~~ | ~~value~~ | ~~ds_main~~ | ~~BIZ_SYSTEM_CODE~~ | ~~xfdl:334~~ (**As-Is 인용만**. To-Be 정책 #1 — D-002 콤보 폐기와 함께 BindItem 폐기) |

> **BindItem 활성 합계 = 6** (BI-001~BI-006). To-Be 정책 #1 으로 BI-007 (cbo_subSystemCode ↔ ds_main.BIZ_SYSTEM_CODE) 폐기. As-Is 의 7 BindItem 은 `ds_main` ↔ `div_detail` 7 입력과 1:1 양방향 바인딩 — To-Be 에서 BIZ_SYSTEM_CODE 컬럼 자체가 ds_main 에서 폐기되므로 BindItem 도 자연 제거.

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick)

| ID | 위치 | 버튼명 (text / commonTop 등록명) | xfdl id / onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| B-001 | A-FOLD | (접기 토글) | `btn_fold` / `btn_fold_onclick` (xfdl:46 / 661~663) | 클라이언트 토글 (`gfn_fold(this, div_search, div_main, btn_fold)`) | - (클라이언트 전용) | xfdl:46 / 661 |
| B-002 | A-MAIN-CENTER (셔틀) | (좌→우 추가, cssclass `btn_WF_ShuttleAddH`) | `btn_right` / `div_main_div_buttonGrp_btn_right_onclick` (xfdl:119 / 773~779) | **현재 역할 제외** — `fn_removeRoleMapRow()` 호출 (CHK=1 행 삭제 + saveCmRoleGrpMap) + grd_sub1/grd_sub2 head CHK 0 reset | saveCmRoleGrpMap (제외) | xfdl:119 / 773 |
| B-003 | A-MAIN-CENTER (셔틀) | (우→좌 제외, cssclass `btn_WF_ShuttleDeleteH`) | `btn_left` / `div_main_div_buttonGrp_btn_left_onclick` (xfdl:120 / 782~788) | **현재 역할 추가** — `fn_appendRoleMapRow()` 호출 (CHK=1 행 ds_roleGrpMap 에 addRow + saveCmRoleGrpMap) + grd_sub1/grd_sub2 head CHK 0 reset | saveCmRoleGrpMap (추가) | xfdl:120 / 782 |
| B-004 | A-MAIN-CENTER (셔틀 — 비고) | (xfdl 의 button name 사양 — As-Is `btn_right` cssclass=`btn_WF_ShuttleAddH` 이지만 Script 본문은 `fn_removeRoleMapRow` 호출 = 제외 동작. As-Is xfdl 의 cssclass 와 동작 의도가 반대 — To-Be 정정 결정: cssclass 의미와 동작 일치, §12 결정 누적표 참조) | (B-002/B-003 의 보존 메모로만 — 별도 버튼 ✗) | (분석 정보 행) | - | xfdl:119 / 773 |

> **B 합계 = 3** (B-001 접기 / B-002 셔틀 제외 / B-003 셔틀 추가). B-004 는 분석 메타 정보 행 — 실 버튼 ✗.

### §4.2 외부 commonTopButton 으로 등록된 버튼 (EX-NNN)

`fn_formBeforeOnload` (xfdl:360~383) 가 `div_topMenu.form.fn_commonTop_onload(this, "", new Array(["btn_search"], ["btn_reset"], ["btn_save"],["btn_close"]), true, new Array(["fn_linkCommMenu","사용자 관리","F"]))` 호출 — 공통 topMenu 의 4 기본 버튼 + 1 링크 버튼 자동 등록:

| ID | 등록명 | 트리거 함수 (xfdl Script) | 동작 | To-Be action | 근거 |
|---|---|---|---|---|---|
| EX-001 | btn_search | `fn_search` (xfdl:665~667) | `fn_run("searchCmRoleGrp")` | searchCmRoleGrp | xfdl:364 / 665 |
| EX-002 | btn_reset | `fn_reset` (xfdl:669~672) | `gfn_setDivDefault(div_search)` 초기화 | - (클라이언트 전용) | xfdl:364 / 669 |
| EX-003 | btn_save | `fn_save` (xfdl:674~685) | `fn_before_save_chk()` 통과 시 confirm → `fn_run("saveCmRoleGrp")` | saveCmRoleGrp | xfdl:364 / 674 |
| EX-004 | btn_close | `fn_close` (xfdl:687~691) | `objApp.gv_AppTabPath.form.fn_closeForm()` | - (탭 닫기) | xfdl:364 / 687 |
| EX-005 | fn_linkCommMenu (링크 — "사용자 관리") | `fn_linkCommMenu` (xfdl:842~846) | `fn_openMenu("csa/csa::CommObjMng", "")` (xfdl:845) — 외부 화면 이동 | (외부 화면 전환) | xfdl:366 / 842 |

> commonTopButton 등록 5 항목 — As-Is 1:1 보존.

### §4.3 외부 commonLeftButton 으로 등록된 버튼 (EX2-NNN)

`fn_formBeforeOnload` (xfdl:368~372) 가 `div_mainGrd.div_leftMenu.form.fn_commonLeft_onload(this, grd_main, div_leftMenu, new Array("chk_check","btn_sum","btn_copyPaste"), "")` 호출:

| ID | 등록명 | 동작 | 근거 |
|---|---|---|---|
| EX2-001 | chk_check | (체크 토글 — 공통 left 영역 기본 동작) | xfdl:371 |
| EX2-002 | btn_sum | (합계 — 공통 left 영역 기본 동작) | xfdl:371 |
| EX2-003 | btn_copyPaste | (복사/붙여넣기 — 공통 left 영역 기본 동작) | xfdl:371 |

### §4.4 외부 commonRightButton 으로 등록된 버튼 (EX3-NNN)

`fn_formBeforeOnload` (xfdl:374~378) 가 `div_mainGrd.div_rightMenu.form.fn_commonRight_onload(this, "", new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` 호출:

| ID | 등록명 | 트리거 함수 (xfdl Script) | 동작 | To-Be action | 근거 |
|---|---|---|---|---|---|
| EX3-001 | btn_rowAdd | `fn_rowAdd` (xfdl:710~723) | `ds_main.addRow()` + USE_TP="Y" + START_ACTIVE_DATE=오늘 + END_ACTIVE_DATE="99991231" + BIZ SYSTEM 검색조건 값으로 ROLE_GROUP_ID="rg_{cbo_bizSystemCode}_" 자동 prefix (선택 시) + Detail 영역 enable | - (클라이언트 전용) | xfdl:376 / 710 |
| EX3-002 | btn_rowDelete | `fn_rowDelete` (xfdl:736~747) | USER_ID 가 존재하면 "연결된 사용자가 존재합니다. 제외 후 삭제 하세요?" 경고 후 차단 / 없으면 `gfn_deleteRow(ds_main, nRow)` | - (클라이언트 전용) | xfdl:376 / 736 |
| EX3-003 | btn_rowCopy | `fn_rowCopy` (xfdl:725~734) | rowposition < 0 차단 → `gfn_rowcopyData(ds_main, rowposition)` + Detail 영역 enable | - (클라이언트 전용) | xfdl:376 / 725 |
| EX3-004 | btn_rowCancel | `fn_rowCancel` (xfdl:749~751) | `gfn_grdInit(grd_main)` | - (클라이언트 전용) | xfdl:376 / 749 |

> commonRightButton 등록 4 항목 — As-Is 1:1 보존. 본 메인 그리드 (div_mainGrd) 의 우상단 메뉴.

> **div_subGrd2 (전체 역할) 의 div_rightMenu 외부 div** (xfdl:214) 도 url include 되어 있으나, 호출하는 `fn_commonRight_onload` 가 xfdl Script 에 명시되어 있지 않음 — 주석으로 처리 (xfdl:380, 주석 상태 유지). 따라서 GE2 영역의 우측 메뉴는 외부 div include 만 되고 동적 등록 ✗ (As-Is 보존).

### §4.5 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면 Grid 컬럼 정의 (G / GE1 / GE2 / LT) 에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:54~213 전수 검토).

### §4.6 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:336~871) 의 모든 function 을 전수 등재. 주석 처리된 메서드도 등재 (To-Be 결정 위임).

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `fn_formBeforeOnload` | (gfn 라이프사이클 — Form onload 전) | commonTopButton 4 기본 + 1 링크 등록 + commonLeftButton 3 등록 + commonRightButton 4 등록 + `edt_ROLE_GROUP_ID.setFocus()` (S-002) | - | - | xfdl:360~383 |
| 2 | `CommRoleGrpMng_onload` | Form onload (xfdl:3) | `gfn_formOnLoad(obj)` + Detail 영역 비활성화 (`gfn_setEnable("this.div_main.form.div_mainDetail","false")`) + 3 그리드 SelectedRow 색상 세팅 (red/blue) + ~~`fn_lov()` 호출~~ (**To-Be 폐기 — 정책 #1, §12 결정 누적표 참조**) + `commonDynamic_onload` 호출 (xfdl:390~405) → **본문 전체 주석 처리 = As-Is 동작 ✗ 보존 (To-Be 신기능 추가 ✗)** | - (lov 폐기) | - | xfdl:385~416 |
| ~~3~~ | ~~`fn_lov`~~ | - | ~~`gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId", "")`~~ | ~~lov~~ | ~~(selectAppHostId)~~ | ~~xfdl:418~425~~ (**As-Is 인용만**. To-Be 정책 #1 — lov action 및 BIZ SYSTEM 콤보 폐기로 fn_lov 메서드 자체 폐기 / §12 결정 누적표 참조) |
| 4 | `fn_beforeRun` | `fn_run` 호출 시 (주석 처리되어 실제 사용 ✗, xfdl:436~438) | `return true` | - | - | xfdl:430~432 |
| 5 | `fn_run` | (모든 트랜잭션 진입점) | sUrl=`csa::CommRoleGrpMng` 고정. sSvcId 6 분기 (searchCmRoleGrp / saveCmRoleGrp / searchCmRoleGrpMap / saveCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) — 각 분기별 sArgs / sInDs / sOutDs 구성 | search/save 그룹 6 종 | (각 분기별 Mapper SQL — §6) | xfdl:435~522 |
| 6 | `fn_callBack` | `gfn_transaction` callback | sSvcId 6 분기 (searchCmRoleGrp / saveCmRoleGrp / searchCmRoleGrpMap / saveCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu). 각 분기에서 `div_bottom.fn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` 표시. saveCmRoleGrp 콜백 nErrorCode==0 시 "저장 되었습니다." info → `fn_search()` 재호출. saveCmRoleGrpMap 콜백 시 "저장 되었습니다." → 3 회 재호출 (searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) | (모든 action 콜백) | (모든 sqlKey 결과) | xfdl:528~605 |
| 7 | `fn_removeRoleMapRow` | B-002 (셔틀 좌→우 = 제외) | `ds_roleGrpMap.set_enableevent(false)` → CHK=="1" 행 모두 `deleteRow` → enableevent(true) → `fn_run("saveCmRoleGrpMap")` | saveCmRoleGrpMap (DELETE) | deleteCommRoleGrpMap | xfdl:611~623 |
| 8 | `fn_appendRoleMapRow` | B-003 (셔틀 우→좌 = 추가) | ds_main 의 rowposition 의 ROLE_GROUP_ID 검증 (null 차단 + 경고) → `ds_roleGrpMap.set_enableevent(false)` → ds_role 의 CHK=="1" + ROLE_ID 비-null 행 모두 ds_roleGrpMap.addRow + ROLE_GROUP_ID / ROLE_ID 세트 → enableevent(true) → `fn_run("saveCmRoleGrpMap")` | saveCmRoleGrpMap (INSERT) | insertCommRoleGrpMap | xfdl:625~645 |
| 9 | `fn_setChkDs` | `ds_role_oncolumnchanged` (xfdl:837) | columnid == "CHK" 시 전체 행 CHK=="1" 갯수 == rowCount 면 head row 0 text="1" 세트 / 그 외 "0" 세트 — head 체크박스 전체 선택 상태 동기화 | - | - | xfdl:647~656 |
| 10 | `btn_fold_onclick` | B-001 | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:661~663 |
| 11 | `fn_search` | EX-001 (btn_search) | `fn_run("searchCmRoleGrp")` | searchCmRoleGrp | selectCommRoleGrp | xfdl:665~667 |
| 12 | `fn_reset` | EX-002 (btn_reset) | `gfn_setDivDefault(div_search)` | - | - | xfdl:669~672 |
| 13 | `fn_save` | EX-003 (btn_save) | `fn_before_save_chk()` 통과 시 confirm("저장하시겠습니까?") → callback 에서 `fn_run("saveCmRoleGrp")` | saveCmRoleGrp | insertCommRoleGrp / updateCommRoleGrp / deleteCommRoleGrp | xfdl:674~685 |
| 14 | `fn_close` | EX-004 (btn_close) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - | - | xfdl:687~691 |
| 15 | `fn_before_save_chk` | `fn_save` 진입 | (1) `gfn_isDatasetChanged(ds_main)` true 시 (2) `ds_roleGrpMap.getRowCount() > 0` 이면 "현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요." error + return false (3) 아니면 `gfn_cpRequired(this, "ROLE_GROUP_ID")` 결과 반환 / 변경 ✗ 시 "저장할 데이터가 없습니다." information + return false | - (검증) | - | xfdl:693~708 |
| 16 | `fn_rowAdd` | EX3-001 (btn_rowAdd) | `ds_main.addRow()` → Detail enable → set_updatecontrol(false) → USE_TP="Y" / START_ACTIVE_DATE=`gfn_today()` / END_ACTIVE_DATE="99991231" / ~~cbo_bizSystemCode.value 가 있으면 ROLE_GROUP_ID="rg_"+cbo_bizSystemCode.value+"_" 자동 prefix~~ (**To-Be 폐기 — 정책 #1 BIZ SYSTEM 콤보 제거로 prefix 로직 제거**) → set_updatecontrol(true) | - | - | xfdl:710~723 |
| 17 | `fn_rowCopy` | EX3-003 (btn_rowCopy) | rowposition < 0 차단 (경고) → `gfn_rowcopyData(ds_main, rowposition)` → Detail 영역 enable | - | - | xfdl:725~734 |
| 18 | `fn_rowDelete` | EX3-002 (btn_rowDelete) | ds_main.rowposition 의 USER_ID 검증 — null 이면 `gfn_deleteRow(ds_main, nRow)` / null 아니면 "연결된 사용자가 존재합니다. 제외 후 삭제 하세요?" warning + return | - | - | xfdl:736~747 |
| 19 | `fn_rowCancel` | EX3-004 (btn_rowCancel) | `gfn_grdInit(grd_main)` | - | - | xfdl:749~751 |
| 20 | `ds_main_onrowposchanged` | DS-002 (`ds_main` Dataset) rowposchanged | rowposition > -1 + rowCount != 0 + e.reason != 52 (단순 rowposition 변경 외) 시 grd_sub1/grd_sub2 head row 0 text="0" reset + 3 회 fn_run 호출 (searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) | searchCmRoleGrpMap + searchCmRole + searchCmRoleGrpMenu (3 회 chain) | selectCommRoleGrpMap + selectCommRole + selectMenuObjTree | xfdl:753~770 |
| 21 | `div_main_div_buttonGrp_btn_right_onclick` | B-002 셔틀 (좌→우 cssclass=ShuttleAddH 이지만 실제 동작은 제외) | `fn_removeRoleMapRow()` → grd_sub1/grd_sub2 head row 0 text="0" reset | saveCmRoleGrpMap (DELETE) | deleteCommRoleGrpMap | xfdl:773~779 |
| 22 | `div_main_div_buttonGrp_btn_left_onclick` | B-003 셔틀 (우→좌 cssclass=ShuttleDeleteH 이지만 실제 동작은 추가) | `fn_appendRoleMapRow()` → grd_sub1/grd_sub2 head row 0 text="0" reset | saveCmRoleGrpMap (INSERT) | insertCommRoleGrpMap | xfdl:782~788 |
| 23 | `div_main_div_mainGrd_grd_main_onkeydown` | G 그리드 onkeydown | e.ctrlkey && e.keycode == 67 (Ctrl+C) → `gfn_grdCopy_Paste(obj, e)` | - | - | xfdl:790~795 |
| 24 | `div_main_div_mainGrd_grd_main_onheadclick` | G 그리드 onheadclick | `gfn_commonOnheadclick(obj, e)` (공통 정렬) | - | - | xfdl:797~800 |
| 25 | `div_main_div_subGrd1_grd_sub1_onheadclick` | GE1 그리드 onheadclick | CHK 헤드 (`getBindCellIndex("body", "CHK")`) 면 `gfn_setGridCheckAll(obj, e)` (전체 선택 토글) / 그 외 `gfn_commonOnheadclick` (정렬) | - | - | xfdl:802~810 |
| 26 | `div_main_div_subGrd1_grd_sub1_onkeydown` | (주석 처리 — 사용 X) | Ctrl+C 의 grdCopy_Paste — As-Is 주석 처리 보존 (Ctrl+C 활성화 ✗, §12 결정 누적표 참조) | - | - | xfdl:812~817 |
| 27 | `div_main_div_subGrd2_grd_sub2_onheadclick` | GE2 그리드 onheadclick | CHK 헤드 면 `gfn_setGridCheckAll(obj, e)` / 그 외 `gfn_commonOnheadclick` | - | - | xfdl:819~827 |
| 28 | `div_main_div_subGrd2_grd_sub2_onkeydown` | GE2 그리드 onkeydown | (본문 내부 전부 주석 처리 — 실제 동작 ✗, xfdl:829~835) | - | - | xfdl:829~835 |
| 29 | `ds_role_oncolumnchanged` | DS-001 (`ds_role` Dataset) oncolumnchanged | `fn_setChkDs(obj, e, div_main.div_subGrd2.grd_sub2)` 호출 (GE2 head 체크박스 전체 선택 상태 동기화) | - | - | xfdl:837~840 |
| 30 | `fn_linkCommMenu` | EX-005 (commonTop 링크) | `fn_openMenu("csa/csa::CommObjMng", "")` (외부 화면 이동) | - | - | xfdl:842~846 |
| 31 | `fn_openMenu` | `fn_linkCommMenu` (또한 일반 외부 호출 패턴) | `nexacro.getApplication().gds_menuInfo` 에 FULL_ID 검색 → nRow == -1 면 "메뉴가 존재하지 않습니다." warning + return false / 정상 시 `gds_paramInfo.clearData()` + `gfn_openMainTabMenu(sFullId, pArg)` | - | - | xfdl:848~860 |
| 32 | `div_main_div_subGrd2_edt_rolefilter_onkeyup` | `edt_rolefilter` (GE2 옆 필터 Edit) onkeyup | value 가 있으면 `ds_role.filter("ROLE_ID.indexOf('{value}')>-1")` (부분일치) / 비어 있으면 filter("") | - | - | xfdl:862~870 |

> **메서드 총수 = 32** (xfdl Script 의 `this.X = function` / `this.X_onclick = function` / `this.X_onload = function` 전수 — 활성 31 + 주석 1). 그리고 xfdl Script 에 정의되지 않은 핸들러 4 종 (xfdl 의 onevent attribute 로 참조되나 Script 본문 미발견 — 모두 §12 결정 누적표 처리):
> - `div_main_grd_M0F1_oncellclick` (xfdl:94 — As-Is 동작 ✗ 보존)
> - `div_main_grd_M0F1_onmousemove` (xfdl:94 — As-Is 동작 ✗ 보존)
> - `div_main_div_mainDetail_div_detail_edt_object_id_canchange` (xfdl:238 — Service 레이어 PK 중복 검증 흡수)
> - `div_main_div_mainDetail_div_detail_edt_access_tp_onitemchanged` (xfdl:263 — D-002 콤보 폐기로 자동 해소)

---

## §5. 팝업 P-NNN

해당 없음 — 본 화면에는 modal 팝업 호출 (`gfn_openPopup` / `nexacro.getApplication().popup`) 이 없음. 외부 화면 이동만 존재 (EX-005 `fn_linkCommMenu` → CommObjMng 화면 이동).

- 외부 화면 이동 1 건: `fn_linkCommMenu` (xfdl:842) → `fn_openMenu("csa/csa::CommObjMng", "")` (xfdl:845).
- xfdl Script 전체에 `gfn_openPopup` / `popup` / `new nexacro.Form` / `OpenForm` grep 결과 0 hits.

---

## §6. SQL ID 매트릭스 (Mapper.xml 8 SQL 전수)

> Mapper.xml namespace = `CommRoleGrpMngMapper` (mapper:5). 본 표는 8 SQL 모두 전수 — As-Is 1:1 보존. 미호출 SQL 의 To-Be 결정은 §11 / §12 결정 누적 참조.

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommRoleGrp` | select | Map (`edt_ROLE_GROUP_ID` / `edt_ROLE_GROUP_NM` / `cbo_USE_TP` / ~~`cbo_bizSystemCode`~~ — **To-Be 정책 #1 으로 BIZ SYSTEM 파라미터 제거**) | List<Map> (ROLE_GROUP_ID / ROLE_GROUP_NM / ROLE_GROUP_DESC / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / USER_ID(scalar subquery) / ~~BIZ_SYSTEM_CODE~~ — **As-Is 8 → To-Be 7 컬럼**) | `TB_MCM_SEC_ROLEGROUP` (A) + scalar subquery `TB_MCM_SEC_USER_MAPPING` (B, `ROWNUM=1`) | `<where>` 동적 — `UPPER(A.ROLE_GROUP_ID) LIKE UPPER('%' \|\| #{edt_ROLE_GROUP_ID} \|\|'%')` + 동일 `ROLE_GROUP_NM` + `A.USE_TP=#{cbo_USE_TP}` + ~~`A.BIZ_SYSTEM_CODE=#{cbo_bizSystemCode}`~~ (**As-Is 분기 — To-Be 정책 #1 으로 제거**) / ORDER BY A.START_ACTIVE_DATE | `\|\|` 문자열 결합 + scalar subquery + `ROWNUM=1` | Task_00oihyb (역할 그룹 조회) | Y | xml:7~35 |
| 2 | `insertCommRoleGrp` | insert | Map (ROLE_GROUP_ID / ROLE_GROUP_NM / ROLE_GROUP_DESC / ~~BIZ_SYSTEM_CODE~~ / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + audit) (**As-Is BIZ_SYSTEM_CODE — To-Be 정책 #1 으로 제거 → 6 본 컬럼**) | (rowcount) | `TB_MCM_SEC_ROLEGROUP` | (INSERT) | `<include refid="ref_Audit.insert_item">` (xml:46) + `<include refid="ref_Audit.insert_value">` (xml:56) — To-Be cactus-core 자동 (`ref_Audit` fragment 폐기) | (Task_1dh8dal 의 `CommonMultiSaveTask` 분기) | Y | xml:37~58 |
| 3 | `updateCommRoleGrp` | update | Map (ROLE_GROUP_NM / ROLE_GROUP_DESC / ~~BIZ_SYSTEM_CODE~~ / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID + audit) (**As-Is BIZ_SYSTEM_CODE — To-Be 정책 #1 으로 제거**) | (rowcount) | `TB_MCM_SEC_ROLEGROUP` | WHERE ROLE_GROUP_ID = #{ROLE_GROUP_ID} | `<include refid="ref_Audit.update">` (xml:68) — To-Be cactus-core 자동 | (Task_1dh8dal `CommonMultiSaveTask`) | Y | xml:60~70 |
| 4 | `deleteCommRoleGrp` | delete | Map (ROLE_GROUP_ID) | (rowcount) | `TB_MCM_SEC_ROLEGROUP` (A) + NOT EXISTS subqueries `TB_MCM_SEC_USER_MAPPING` (B) + `TB_MCM_SEC_ROLEGROUP_MAPPING` (C) | WHERE A.ROLE_GROUP_ID = #{ROLE_GROUP_ID} AND NOT EXISTS (사용자 매핑) AND NOT EXISTS (역할 매핑) — 종속 데이터가 있으면 자동 차단 | NOT EXISTS 2 회 + correlated subquery | (Task_1dh8dal `CommonMultiSaveTask`) | Y | xml:72~83 |
| 5 | `selectCommRoleGrpMap` | select | Map (ROLE_GROUP_ID) | List<Map> (ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID + **PARENT_ROLE_ID (To-Be SELECT 절 추가)** — As-Is 7 → To-Be 8 컬럼) | `TB_MCM_SEC_ROLEGROUP_MAPPING` (A) + `TB_MCM_SEC_ROLE` (B) | WHERE A.ROLE_ID = B.ROLE_ID AND A.ROLE_GROUP_ID = #{ROLE_GROUP_ID} ORDER BY B.ROLE_ID | implicit JOIN (콤마 카테시안 + WHERE) | Task_0xxo78b (역할 그룹 부여 조회) | Y | xml:85~98 |
| 6 | `insertCommRoleGrpMap` | insert | Map (ROLE_GROUP_ID / ROLE_ID + audit) | (rowcount) | `TB_MCM_SEC_ROLEGROUP_MAPPING` | (INSERT) | `<include refid="ref_Audit.insert_item / insert_value">` (xml:104 / 109) | (Task_0weig4p `CommonMultiSaveTask`) | Y | xml:100~111 |
| 7 | `updateCommRoleGrpMap` | update | Map | (rowcount — 실제로는 SELECT 'X' FROM DUAL 의 더미 SELECT) | (사용 ✗) | (없음 — 더미 SQL: `SELECT 'X' FROM DUAL`) | DUAL | (Task_0weig4p `CommonMultiSaveTask` 의 `updateSqlKey`) | (정의는 Y / 실 사용은 N — Mapping 은 INSERT/DELETE 만 운영) | xml:113~116 |
| 8 | `deleteCommRoleGrpMap` | delete | Map (ROLE_GROUP_ID / ROLE_ID) | (rowcount) | `TB_MCM_SEC_ROLEGROUP_MAPPING` | WHERE A.ROLE_GROUP_ID = #{ROLE_GROUP_ID} AND A.ROLE_ID = #{ROLE_ID} — 추가 NOT EXISTS 검증 코드는 주석 처리 (xml:122~125) | NOT EXISTS 주석 처리 | (Task_0weig4p `CommonMultiSaveTask`) | Y | xml:118~126 |

> **상기 8 외 별도 SQL 2 추가 발견** (Mapper.xml 의 selectCommRoleGrpMap 와 다른 select 표기 — `selectCommRole` 과 `selectMenuObjTree`):

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 9 | `selectCommRole` | select | Map (ROLE_GROUP_ID) | List<Map> (ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + **PARENT_ROLE_ID (To-Be SELECT 절 추가)** — As-Is 6 → To-Be 7 컬럼) | `TB_MCM_SEC_ROLE` (A) + NOT EXISTS subquery `TB_MCM_SEC_ROLEGROUP_MAPPING` (B) | WHERE A.USE_TP = 'Y' AND NOT EXISTS (해당 ROLE_GROUP_ID 에 이미 매핑된 ROLE) ORDER BY A.ROLE_ID | NOT EXISTS + 'Y' 하드코딩 + correlated subquery | Task_1re6tzu (역할 조회) | Y | xml:128~143 |
| 10 | `selectMenuObjTree` | select | Map (ROLE_GROUP_ID) | List<Map> (MENU_ID / MENU_SEQ / MENU_NM / LEV / PARENT_MENU_ID / ROW_SEQ / OBJECT_ID / MENU_VIEW_YN — 8 컬럼) | 5 테이블 join (`TB_MCM_SEC_ROLEGROUP_MAPPING` RGM + `TB_MCM_SEC_ROLEGROUP` RG + `TB_MCM_SEC_ROLE` R + `TB_MCM_SEC_ROLE_MAPPING` RM + `TB_MCM_SEC_MENU` MNU) + UNION + `TB_MCM_SEC_MENU_FLD` (A) + outer-join `TB_MCM_SEC_OBJ` (O) | WITH MROLE AS (5 테이블 join) + MENU AS (UNION) + MENU1 (계층 START WITH / CONNECT BY PRIOR) + 최종 SELECT (M.PARENT_MENU_ID IS NOT NULL OR EXISTS (자식 노드)) ORDER BY SEQ | **WITH (CTE)** + **START WITH ... CONNECT BY PRIOR** (Oracle 계층 쿼리) + **CONNECT_BY_ISLEAF** + **SYS_CONNECT_BY_PATH** + **TO_CHAR + format mask** + outer-join `O.OBJECT_ID(+)` (Oracle) + UNION + correlated subquery | Task_1p3b1yy (역할 그룹 메뉴 조회) | Y | xml:145~249 |

> **SQL 정합 요약 (As-Is)**: Mapper.xml 10 SQL 등재 ↔ 실 호출 9 SQL ✓ + 미사용 1 SQL (`updateCommRoleGrpMap` — 더미 SELECT 'X' FROM DUAL).
>
> **To-Be 적용**: `updateCommRoleGrpMap` 는 Mapper 정의는 보존하지만 (BPMN 의 `CommonMultiSaveTask` 가 updateSqlKey 요구) 실 동작은 정의 그대로 DUAL 의 더미 SELECT. To-Be 결정은 §11 / §12 참조. 활성 SQL 9 개 + 더미 1 개 보존.

---

## §7. Java 트랜잭션 (UserTask)

> **본 화면은 Java UserTask 디렉토리 부재** — `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleGrpMng/` ✗. 직접 ls 확인 (§0 / §2 / §8 참조). 모든 비즈니스 노드는 BPMN ScriptTask (commonDbTask.CommonSelectTask + commonDbTask.CommonMultiSaveTask) 만 사용 — Java 커스텀 클래스 정의 ✗.
>
> 본 화면의 service Java 클래스는 To-Be 에서 추가 작성 ✗. As-Is 1:1 보존 정책으로 BPMN 의 commonDbTask 만 To-Be 매핑 (영역 BPMN 설계서 §3 / §6.4 참조).

해당 없음.

---

## §8. BPMN 워크플로우 전수 (`CommRoleGrpMng.bpmn`)

> bpmn2:process id="CommRoleGrpMng" name="부모역할 부여 조회" isExecutable="false" (bpmn:3)

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / Task / UserTask)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | 7 incoming (1vkp3qd / 105vwsz / 1tgyodp / 11vs9ef / 0p8l9xo / 1qe8l6w / 0bmn2j8) | - | bpmn:7~15 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | 분기 | (ext:style shapeBackground="#ffff00") | SequenceFlow_1 | 7 outgoing — SequenceFlow_0tt1mbk / 11y43nf / 0grwghu / 109h9q1 / 13bmd6q / 0oowkcm / 0gdqjne | bpmn:16~28 |
| Task_00oihyb | task | 역할 그룹 조회 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`, sqlKey=`#{serviceId}Mapper.selectCommRoleGrp`, resultKey=`ds_main`, isServiceResult=true, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` | SequenceFlow_0tt1mbk | SequenceFlow_105vwsz | bpmn:30~43 |
| Task_1dh8dal | task | 역할 그룹 저장 | class=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask`, modelerTemplate=동일 CommonMultiSaveTask, paramKey=`ds_main`, resultKey=`ds_main`, insertSqlKey=`#{serviceId}Mapper.insertCommRoleGrp`, updateSqlKey=`#{serviceId}Mapper.updateCommRoleGrp`, deleteSqlKey=`#{serviceId}Mapper.deleteCommRoleGrp` | SequenceFlow_0grwghu | SequenceFlow_1vkp3qd | bpmn:45~61 |
| Task_0xxo78b | task | 역할 그룹 부여 조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.selectCommRoleGrpMap`, resultKey=`ds_roleGrpMap`, isServiceResult=true | SequenceFlow_11y43nf | SequenceFlow_1tgyodp | bpmn:62~75 |
| Task_0weig4p | task | 역할 그룹 부여 저장 | class=CommonMultiSaveTask, paramKey=`ds_roleGrpMap`, resultKey=`ds_roleGrpMap`, insertSqlKey=`#{serviceId}Mapper.insertCommRoleGrpMap`, updateSqlKey=`#{serviceId}Mapper.updateCommRoleGrpMap`, deleteSqlKey=`#{serviceId}Mapper.deleteCommRoleGrpMap` | SequenceFlow_109h9q1 | SequenceFlow_11vs9ef | bpmn:78~94 |
| Task_1re6tzu | task | 역할 조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.selectCommRole`, resultKey=`ds_role`, paramKey="" (없음) | SequenceFlow_13bmd6q | SequenceFlow_0p8l9xo | bpmn:96~109 |
| Task_1p3b1yy | task | 역할 그룹 메뉴 조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.selectMenuObjTree`, resultKey=`ds_menuTreeList` | SequenceFlow_0oowkcm | SequenceFlow_1qe8l6w | bpmn:116~129 |
| Task_1erud76 | task | lov_SUBSYSTEM 조회 | class=CommonSelectTask, sqlKey=`CommObjMngMapper.selectAppHostId`, resultKey=`ds_selectAppHostId` | SequenceFlow_0gdqjne | SequenceFlow_0bmn2j8 | bpmn:132~145 |

> **노드 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 7 (CommonSelectTask 5 + CommonMultiSaveTask 2) + UserTask 0 = 10 노드.**
>
> **(주의) Task_1erud76 (lov)** 는 sqlKey 가 `CommObjMngMapper.selectAppHostId` — 본 화면의 namespace (`CommRoleGrpMngMapper`) 가 아닌 **CommObjMng (Object 관리) 의 namespace** 사용. 본 화면 Mapper.xml 에는 `selectAppHostId` 정의 ✗ → 외부 Mapper 참조 (To-Be 정책 #1 으로 폐기, §12 결정 누적표 참조).

### §8.2 SequenceFlow 전수 (총 15 개)

| sequenceFlow id | name (action 분기) | sourceRef | targetRef | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:29 |
| SequenceFlow_0tt1mbk | **searchCmRoleGrp** | ExclusiveGateway_1 | Task_00oihyb | bpmn:44 |
| SequenceFlow_11y43nf | **searchCmRoleGrpMap** | ExclusiveGateway_1 | Task_0xxo78b | bpmn:76 |
| SequenceFlow_0grwghu | **saveCmRoleGrp** | ExclusiveGateway_1 | Task_1dh8dal | bpmn:77 |
| SequenceFlow_109h9q1 | **saveCmRoleGrpMap** | ExclusiveGateway_1 | Task_0weig4p | bpmn:95 |
| SequenceFlow_13bmd6q | **searchCmRole** | ExclusiveGateway_1 | Task_1re6tzu | bpmn:110 |
| SequenceFlow_0oowkcm | **searchCmRoleGrpMenu** (name 끝에 `&#10;` 줄바꿈 포함 — As-Is 보존) | ExclusiveGateway_1 | Task_1p3b1yy | bpmn:130 |
| SequenceFlow_0gdqjne | **lov** | ExclusiveGateway_1 | Task_1erud76 | bpmn:146 |
| SequenceFlow_1vkp3qd | - | Task_1dh8dal | EndEvent_1 | bpmn:111 |
| SequenceFlow_105vwsz | - | Task_00oihyb | EndEvent_1 | bpmn:112 |
| SequenceFlow_1tgyodp | - | Task_0xxo78b | EndEvent_1 | bpmn:113 |
| SequenceFlow_11vs9ef | - | Task_0weig4p | EndEvent_1 | bpmn:114 |
| SequenceFlow_0p8l9xo | - | Task_1re6tzu | EndEvent_1 | bpmn:115 |
| SequenceFlow_1qe8l6w | - | Task_1p3b1yy | EndEvent_1 | bpmn:131 |
| SequenceFlow_0bmn2j8 | - | Task_1erud76 | EndEvent_1 | bpmn:147 |

### §8.3 action 7 분기 — 흐름 요약

| action | 분기 sequenceFlow | 흐름 (전체) |
|---|---|---|
| lov | SequenceFlow_0gdqjne | Start → Gateway → Task_1erud76 (CommObjMngMapper.selectAppHostId) → End |
| searchCmRoleGrp | SequenceFlow_0tt1mbk | Start → Gateway → Task_00oihyb (selectCommRoleGrp) → End |
| saveCmRoleGrp | SequenceFlow_0grwghu | Start → Gateway → Task_1dh8dal (CommonMultiSaveTask — insertCommRoleGrp / updateCommRoleGrp / deleteCommRoleGrp) → End |
| searchCmRoleGrpMap | SequenceFlow_11y43nf | Start → Gateway → Task_0xxo78b (selectCommRoleGrpMap) → End |
| saveCmRoleGrpMap | SequenceFlow_109h9q1 | Start → Gateway → Task_0weig4p (CommonMultiSaveTask — insertCommRoleGrpMap / updateCommRoleGrpMap (DUAL 더미) / deleteCommRoleGrpMap) → End |
| searchCmRole | SequenceFlow_13bmd6q | Start → Gateway → Task_1re6tzu (selectCommRole) → End |
| searchCmRoleGrpMenu | SequenceFlow_0oowkcm | Start → Gateway → Task_1p3b1yy (selectMenuObjTree) → End |

> **action 합계 = 7 (As-Is) → 6 (To-Be)** — 사용자 사전 명시의 "6 enum" 은 lov 폐기 후 정합. lov 도 xfdl `fn_lov` (xfdl:418) 가 `gfn_transaction("lov", ...)` 호출 + BPMN 의 ExclusiveGateway 의 7번째 outgoing flow 로 정상 등재되어 있으나, To-Be 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 폐기 (§12 결정 누적표 참조).

> **BPMN flow chain 특징**: As-Is BPMN 의 모든 7 action 분기는 단일 Task → EndEvent 단순 구조 (masterCodeMng 의 multi-task chain 과 달리 chain 후속 ✗). 즉 각 action 은 BPMN 내 후속 자동 재조회 없이 종료 — xfdl 의 `fn_callBack` 이 추가 재조회 트리거 (xfdl:577~578 의 saveCmRoleGrpMap 콜백에서 3 회 재호출).

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + DMES Excel + To-Be cactus-core 통합)

> **스키마 정본 (DMES Excel 기준)** = `MCMAPUSER.TB_MCM_SEC_*` (Excel sheet 의 Table 명 행 — csa 영역, §9.9 시트 추출 결과 정합). As-Is Mapper.xml 의 `TB_MCM_SEC_*` 는 스키마 prefix 없이 사용 — 실 owner 는 `MCMAPUSER` (§9.9 csa 시트 추출로 확인 완료).
>
> **To-Be 정책 (사용자 결정 — cma 4 화면 작업과 동일)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_ROLEGROUP_MAPPING` / `TB_MCM_SEC_ROLE` / `TB_MCM_SEC_ROLE_MAPPING` / `TB_MCM_SEC_USER_MAPPING` / `TB_MCM_SEC_MENU` / `TB_MCM_SEC_MENU_FLD` / `TB_MCM_SEC_OBJ`) — 대문자 prefix 유지
> - **audit 컬럼**: As-Is 17 컬럼 → **cactus-core `CactusAuditEntity` 9 컬럼 통일** (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`)
> - **본 컬럼**: As-Is Mapper.xml + DMES Excel 카탈로그 1:1 보존
>
> cactus-core 정본 = [`src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/audit/CactusAuditEntity.java`](src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/audit/CactusAuditEntity.java).

### §9.1 `TB_MCM_SEC_ROLEGROUP` (역할 그룹 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | ROLE_GROUP_ID | selectCommRoleGrp SELECT (xml:8) / WHERE LIKE (xml:22) / INSERT (xml:39, 49) / UPDATE WHERE (xml:69) / DELETE WHERE (xml:74) + 본 화면 외 selectCommRoleGrp scalar subquery WHERE (xml:16) / selectCommRoleGrpMap WHERE (xml:96) / insertCommRoleGrpMap VALUES (xml:107) / deleteCommRoleGrpMap WHERE (xml:120) / selectCommRole NOT EXISTS WHERE (xml:141) / selectMenuObjTree WITH MROLE WHERE (xml:163) | PK | xfdl G-002 / D-001 / GE1-008 | xml:8 / 22 / 39 |
| 2 | ROLE_GROUP_NM | selectCommRoleGrp SELECT (xml:9) / WHERE LIKE (xml:25) / INSERT (xml:40, 50) / UPDATE SET (xml:62) | - | xfdl G-003 / D-003 | xml:9 / 25 |
| 3 | ROLE_GROUP_DESC | selectCommRoleGrp SELECT (xml:10) / INSERT (xml:41, 51) / UPDATE SET (xml:63) | - | xfdl G-004 / D-004 | xml:10 |
| 4 | USE_TP | selectCommRoleGrp SELECT (xml:11) / WHERE (xml:28) / INSERT (xml:43, 53) / UPDATE SET (xml:65) | - | xfdl G-006 / D-005 / S-004 | xml:11 |
| 5 | START_ACTIVE_DATE | selectCommRoleGrp SELECT (xml:12) / INSERT (xml:44, 54) / UPDATE SET (xml:66) / ORDER BY (xml:34) | - | xfdl G-007 / D-006 / fn_rowAdd 시 `gfn_today()` 세트 (xfdl:717) | xml:12 / 34 |
| 6 | END_ACTIVE_DATE | selectCommRoleGrp SELECT (xml:13) / INSERT (xml:45, 55) / UPDATE SET (xml:67) | - | xfdl G-008 / D-007 / fn_rowAdd 시 "99991231" 하드코딩 (xfdl:718) | xml:13 |
| ~~7~~ | ~~BIZ_SYSTEM_CODE~~ | ~~selectCommRoleGrp SELECT (xml:18) / WHERE (xml:31) / INSERT (xml:42, 52) / UPDATE SET (xml:64)~~ | - | ~~xfdl G-005 / D-002 / S-001~~ | ~~xml:18 / 31~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기. SQL SELECT/WHERE/INSERT/UPDATE/Dataset/Grid/Detail/Filter 모두 To-Be 미포함 / §12 결정 누적표 참조) |
| 8 | C_USR_ID | (To-Be cactus-core) — VARCHAR(100) / 생성자 | - | As-Is `ref_Audit.insert_item` (xml:46) 인입. cactus-core 적용 시 JPA `@PrePersist` 자동 | CactusAuditEntity.java:27 |
| 9 | C_AT | (To-Be cactus-core) — TIMESTAMP(Instant) / 생성일시 | - | As-Is `ref_Audit.insert_value` SYSDATE 추정. JPA `@PrePersist` 자동 | CactusAuditEntity.java:30 |
| 10 | C_SVC_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:33 |
| 11 | C_PGM_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:36 |
| 12 | U_USR_ID | (To-Be cactus-core) — VARCHAR(100) / 수정자 | - | As-Is `ref_Audit.update` (xml:68) 인입. JPA `@PreUpdate` 자동 | CactusAuditEntity.java:39 |
| 13 | U_AT | (To-Be cactus-core) — TIMESTAMP(Instant) | - | As-Is `ref_Audit.update` SYSDATE 추정. JPA `@PreUpdate` 자동 | CactusAuditEntity.java:42 |
| 14 | U_SVC_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:45 |
| 15 | U_PGM_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:48 |
| 16 | VER | (To-Be cactus-core) — Long / Optimistic Locking | - | JPA `@Version` — 신규 (As-Is 동시성 문제 자동 해결) | CactusAuditEntity.java:51 |

### §9.2 `TB_MCM_SEC_ROLEGROUP_MAPPING` (역할 그룹 - 역할 매핑)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | ROLE_GROUP_ID | selectCommRoleGrpMap WHERE (xml:96) / SELECT (xml:92) / insertCommRoleGrpMap (xml:102, 107) / deleteCommRoleGrpMap WHERE (xml:120) / deleteCommRoleGrp NOT EXISTS subquery (xml:80~82) / selectMenuObjTree WITH MROLE WHERE (xml:158) | PK (2 컬럼 복합) | xfdl GE1-008 | xml:92 / 96 |
| 2 | ROLE_ID | selectCommRoleGrpMap SELECT/WHERE (xml:86, 95) / insertCommRoleGrpMap (xml:103, 108) / deleteCommRoleGrpMap WHERE (xml:121) / selectCommRole NOT EXISTS WHERE (xml:140) / selectMenuObjTree WITH MROLE WHERE (xml:166) | PK (2 컬럼 복합) | xfdl GE1-002 | xml:86 / 95 |
| 3~10 | audit 9 컬럼 (cactus-core 9) — C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER | (To-Be cactus-core 정본) | - | As-Is `ref_Audit.insert_item / insert_value` (xml:104, 109) 인입. JPA Listener 자동 | CactusAuditEntity.java |

### §9.3 `TB_MCM_SEC_ROLE` (역할 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | ROLE_ID | selectCommRoleGrpMap JOIN (xml:94, 95) / selectCommRole SELECT (xml:129) / selectMenuObjTree WHERE (xml:166, 168) / DS-001 / DS-003 | PK | xfdl GE1-002 / GE2-002 | xml:94 / 129 |
| 2 | ROLE_NM | selectCommRoleGrpMap SELECT (xml:87) / selectCommRole SELECT (xml:130) / DS-001 / DS-003 | - | xfdl GE1-003 / GE2-003 | xml:87 / 130 |
| 3 | MENU_ID | selectCommRoleGrpMap SELECT (xml:88) / selectCommRole SELECT (xml:131) / selectMenuObjTree JOIN (xml:169) | - | (메뉴 연결 키) | xml:88 / 131 |
| 4 | USE_TP | selectCommRoleGrpMap SELECT (xml:89) / selectCommRole SELECT/WHERE (xml:132, 136) / selectMenuObjTree WHERE (xml:167) | - | xfdl GE1-005 / GE2-005 / selectMenuObjTree 의 WHERE = 'Y' 하드코딩 | xml:89 / 132 / 136 |
| 5 | START_ACTIVE_DATE | selectCommRoleGrpMap SELECT (xml:90) / selectCommRole SELECT (xml:133) / DS-001 / DS-003 | - | xfdl GE1-006 / GE2-006 | xml:90 / 133 |
| 6 | END_ACTIVE_DATE | selectCommRoleGrpMap SELECT (xml:91) / selectCommRole SELECT (xml:134) / DS-001 / DS-003 | - | xfdl GE1-007 / GE2-007 | xml:91 / 134 |
| 7 | PARENT_ROLE_ID | DS-001 / DS-003 의 컬럼. **As-Is 의 selectCommRoleGrpMap / selectCommRole SELECT 절에 미포함 → To-Be SELECT 절에 추가**. GE1-004 / GE2-004 binding 정상 표시 보장 (§12 결정 누적표 참조) | - | xfdl GE1-004 / GE2-004 / DS-001 col 정의 (xfdl:281) / DS-003 col 정의 (xfdl:304) | xfdl:281 / 304 + To-Be SQL §6 #5/#9 |
| 8~16 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.4 `TB_MCM_SEC_ROLE_MAPPING` (역할 - 메뉴-오브젝트 매핑)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | ROLE_ID | selectMenuObjTree WITH MROLE JOIN (xml:168) | PK | - | xml:168 |
| 2 | OBJECT_ID | selectMenuObjTree WITH MROLE JOIN (xml:170) | PK | - | xml:170 |
| 3~11 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.5 `TB_MCM_SEC_USER_MAPPING` (사용자 - 역할 그룹 매핑)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | USER_ID | selectCommRoleGrp scalar subquery SELECT (xml:14) | PK | xfdl DS-002 USER_ID (히든) — Mapper.xml 의 selectCommRoleGrp 가 scalar subquery 로 가져옴 (역할 그룹 사용 여부 확인) | xml:14 |
| 2 | ROLE_GROUP_ID | selectCommRoleGrp scalar subquery WHERE (xml:16) / deleteCommRoleGrp NOT EXISTS WHERE (xml:77) / deleteCommRoleGrpMap NOT EXISTS WHERE (주석 처리, xml:124) | PK | xfdl fn_rowDelete 의 USER_ID 검증 (xfdl:739) | xml:16 / 77 |
| 3~11 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.6 `TB_MCM_SEC_MENU` (메뉴 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectMenuObjTree WITH MROLE SELECT (xml:148) / JOIN (xml:169) | PK | - | xml:148 / 169 |
| 2 | MENU_NM | selectMenuObjTree WITH MROLE SELECT (xml:149) | - | DS-004 MENU_NM | xml:149 |
| 3 | MENU_DESC | selectMenuObjTree WITH MROLE SELECT (xml:150) | - | - | xml:150 |
| 4 | MENU_TP | selectMenuObjTree WITH MROLE SELECT (xml:151) / WHERE = 'WEB' 하드코딩 (xml:171) | - | - | xml:151 / 171 |
| 5 | MENU_SEQ | selectMenuObjTree WITH MROLE SELECT (xml:153) | - | DS-004 MENU_SEQ | xml:153 |
| 6 | OBJECT_ID | selectMenuObjTree WITH MROLE SELECT (xml:155) / JOIN (xml:170) | - | - | xml:155 |
| 7 | FULL_SEQ | selectMenuObjTree WITH MROLE SELECT (xml:156) | - | - | xml:156 |
| 8 | MENU_VIEW_YN | selectMenuObjTree WITH MROLE SELECT (xml:157) | - | - | xml:157 |
| 9 | USE_TP | selectMenuObjTree WHERE = 'Y' 하드코딩 (xml:172) | - | - | xml:172 |
| 10~18 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.7 `TB_MCM_SEC_MENU_FLD` (메뉴 폴더 — 계층 트리 구조)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectMenuObjTree MENU CTE SELECT (xml:192 — 주석 / xml:203) / WHERE START WITH (xml:213) | PK | - | xml:192 / 213 |
| 2 | MENU_NM | selectMenuObjTree MENU CTE SELECT (xml:204) | - | DS-004 MENU_NM | xml:204 |
| 3 | MENU_TP | selectMenuObjTree MENU CTE SELECT (xml:205) / WHERE = 'WEB' (주석) | - | - | xml:205 |
| 4 | PARENT_MENU_ID | selectMenuObjTree MENU CTE SELECT (xml:206) / CONNECT BY PRIOR (xml:214) / START WITH (xml:213) | - | DS-004 PARENT_MENU_ID | xml:206 / 213 / 214 |
| 5 | MENU_SEQ | selectMenuObjTree MENU CTE SELECT (xml:207) | - | DS-004 MENU_SEQ | xml:207 |
| 6 | MENU_VIEW_YN | selectMenuObjTree MENU CTE SELECT (xml:211) | - | - | xml:211 |
| 7~15 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.8 `TB_MCM_SEC_OBJ` (오브젝트 — 메뉴별 권한 단위)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | OBJECT_ID | selectMenuObjTree outer-join (xml:242) | PK | DS-004 와 직접 연결 ✗, 메뉴 트리의 OBJECT_ID 표시용 | xml:242 |
| 2~10 | audit 9 컬럼 (cactus-core 9) | (To-Be cactus-core) | - | - | CactusAuditEntity.java |

### §9.9 DMES 테이블 정의서 8 시트 전수 컬럼 카탈로그

> **출처**: `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` 직접 시트 추출 (2026-05-30 작성). 시트명 → sheet rId 매핑: SEC_ROLEGROUP (rId90) / SEC_ROLEGROUP_MAPPING (rId91) / SEC_ROLE (rId89) / SEC_ROLE_MAPPING (rId92) / SEC_USER_MAPPING (rId99) / SEC_MENU (rId85) / SEC_MENU_FLD (rId86) / SEC_OBJ (rId87). 시트명은 As-Is `SEC_*` (TB_MCM_ prefix 없음 — DMES csa 영역 명시 / csa 시트 정합 확인 완료).
>
> **§9.1~§9.8 본문은 As-Is Mapper.xml 사용 컬럼 + To-Be cactus-core 9 audit 통일 가정** (압축 표기). **§9.9 는 8 테이블의 모든 실 컬럼 (As-Is audit 17 / DATA_END / ARCHIVE / 미사용 컬럼 포함)** 1:1 전수.

#### §9.9.1 SEC_ROLEGROUP — TB_MCM_SEC_ROLEGROUP / 24 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.1 #1 |
| 2 | 역할그룹명 | ROLE_GROUP_NM | VARCHAR | 100 |  | NOT NULL | - | §9.1 #2 |
| 3 | 역할그룹설명 | ROLE_GROUP_DESC | VARCHAR | 300 |  | NULL | - | §9.1 #3 |
| 4 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | §9.1 #7 |
| 5 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | §9.1 #4 |
| 6 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #5 |
| 7 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #6 |
| 8~24 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (commUserMng §9.1.1 #19~35 동일) | - |  | NULL | - | As-Is 17 → To-Be cactus-core 9 통일 |

#### §9.9.2 SEC_ROLEGROUP_MAPPING — TB_MCM_SEC_ROLEGROUP_MAPPING / 19 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.2 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.2 #1 (복합 PK) |
| 2 | 역할ID | ROLE_ID | VARCHAR | 30 | (PK 후보) | NOT NULL | - | §9.2 #2 (복합 PK) |
| 3~19 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

#### §9.9.3 SEC_ROLE — TB_MCM_SEC_ROLE / 26 컬럼

> 본 화면 read-only. commRoleMng §9.4.1 (26 컬럼) 참조 — 중복 표 생략.

| 본 화면 사용 컬럼 | §9.3 매칭 |
|---|---|
| ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / PARENT_ROLE_ID | §9.3 #1~7 (PARENT_ROLE_ID 는 §12 결정 — To-Be SELECT 절 추가) |
| 나머지 19 컬럼 (ROLE_DESC / BIZ_SYSTEM_CODE / audit 17) | (본 화면 미사용 — commRoleMng §9.4.1 참조) |

#### §9.9.4 SEC_ROLE_MAPPING — TB_MCM_SEC_ROLE_MAPPING / 20 컬럼

> commRoleMng §9.4.2 / commObjMng §9.6.5 참조 — 중복 표 생략. 본 화면 사용 = ROLE_ID / OBJECT_ID (selectMenuObjTree WITH MROLE JOIN).

#### §9.9.5 SEC_USER_MAPPING — TB_MCM_SEC_USER_MAPPING / 19 컬럼

> commUserMng §9.1.2 (19 컬럼) 참조 — 중복 표 생략. 본 화면 사용 = USER_ID (scalar subquery 사용 검증) / ROLE_GROUP_ID (FK).

#### §9.9.6 SEC_MENU — TB_MCM_SEC_MENU / 32 컬럼

> commObjMng §9.6.2 (32 컬럼) 참조 — 중복 표 생략. 본 화면 사용 = MENU_ID / MENU_NM / MENU_DESC / MENU_TP / MENU_SEQ / OBJECT_ID / FULL_SEQ / MENU_VIEW_YN / USE_TP (selectMenuObjTree WITH MROLE).

#### §9.9.7 SEC_MENU_FLD — TB_MCM_SEC_MENU_FLD / 25 컬럼

> commObjMng §9.6.3 (25 컬럼) 참조 — 중복 표 생략. 본 화면 사용 = MENU_ID / MENU_NM / MENU_TP / PARENT_MENU_ID / MENU_SEQ / MENU_VIEW_YN (CTE MENU + Oracle CONNECT BY).

#### §9.9.8 SEC_OBJ — TB_MCM_SEC_OBJ / 31 컬럼

> commObjMng §9.6.1 (31 컬럼) 참조 — 중복 표 생략. 본 화면 사용 = OBJECT_ID (selectMenuObjTree outer-join).

> **§9.9 카탈로그 합계**: 24 + 19 + 26 + 20 + 19 + 32 + 25 + 31 = **196 컬럼 등재** (cross-ref 5 테이블은 commUserMng / commRoleMng / commObjMng §9.* 참조로 본문 압축, 라인 수만 합계 명시 — 정합 보존).

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 (S/G/D/GE/FX) | 비고 | 근거 |
|---|---|---|---|---|---|---|
| ~~LV-001~~ | ~~BIZ SYSTEM 콤보 (`ds_lovSubSystem` ← `CommObjMngMapper.selectAppHostId`)~~ | ~~APP_HOST_ID~~ | - | ~~S-001 + D-002~~ | ~~외부 Mapper namespace 인용~~ | ~~xfdl:18 / 263 / 321 / bpmn:140~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM 콤보 폐기로 LoV 자체 폐기 / §12 결정 누적표 참조) |
| LV-002 | 사용 여부 콤보 (S-004 `cbo_USE_TP`) — 정적 hardcoded innerdataset (Y/Y, N/N 2 행) | Y / N | Y / N | S-004 | xfdl 내 정적 Dataset (DB 호출 ✗) | xfdl:24~42 |
| LV-003 | 사용 여부 라디오 (D-005 `edt_use_tp`) — 정적 hardcoded innerdataset (Y/Yes, N/No 2 행) | Y / N | Yes / No (datacolumn) | D-005 | xfdl 내 정적 Dataset (DB 호출 ✗) — 의도적으로 displayName 다름 (라디오 표기) | xfdl:241~258 |

> **LV 활성 합계 = 2** (LV-002 / LV-003). To-Be 정책 #1 으로 LV-001 (APPHOST 출처) 폐기. 본 화면 To-Be 에는 NewCodeQuery / 공통 코드 마스터 호출 ✗.

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-006 / D-005 / GE1-005 / GE2-005 / S-004 / selectCommRole 의 WHERE = 'Y' 하드코딩 / selectMenuObjTree 의 RG.USE_TP='Y' + R.USE_TP='Y' + MNU.USE_TP='Y' 하드코딩 | xfdl:264~330 / xml:136 / 165 / 167 / 172 |
| ST-002 | `END_ACTIVE_DATE = "99991231"` 하드코딩 | 유효 기한일 = 9999-12-31 영구 활성 | fn_rowAdd 시 자동 세트 (xfdl:718) | xfdl:718 |
| ST-003 | `START_ACTIVE_DATE = gfn_today()` (현재일) | 유효 개시일 = 행추가 시 오늘 | fn_rowAdd 시 자동 세트 (xfdl:717) | xfdl:717 |
| ST-004 | `STATUS` (G-001, displaytype=imagecontrol) | As-Is = Nexacro framework 가 자동 row state icon 표시 (신규/수정/삭제). DS-002 (ds_main) Dataset 미정의 + framework 가 row state 추론. **To-Be**: FE 프레임워크에서 동일 row state 표시 기능 구현 (사용자 결정 — masterCodeMng ST-005 와 동일) | G-001 표시 전용 | xfdl:147 / 157 |
| ST-005 | `ds_main.getRowType(rowposition)` (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | 그리드 row 상태 — saveCmRoleGrp 시 정의되는 INSERT/UPDATE/DELETE 분기 결정 | BPMN Task_1dh8dal (`CommonMultiSaveTask` 의 `:U` 마킹) | xfdl:471 의 `ds_main=ds_main:U` 인입 |
| ST-006 | `CHK == "1"` (GE1 / GE2) | 그리드 행 선택 마킹 | GE1-001 / GE2-001 head 클릭 전체 토글 + B-002/B-003 셔틀 트리거 + `fn_removeRoleMapRow` / `fn_appendRoleMapRow` 의 행 선택 기준 + `fn_setChkDs` 의 head row 0 동기화 | xfdl:614 / 636 / 647 |
| ~~ST-007~~ | ~~`ROLE_GROUP_ID = "rg_" + cbo_bizSystemCode.value + "_"` 자동 prefix~~ | ~~행추가 시 자동 prefix (BIZ SYSTEM 코드 별 그룹 ID 컨벤션)~~ | ~~fn_rowAdd (xfdl:720~721)~~ | ~~xfdl:720~~ (**As-Is 인용만**. To-Be 정책 #1 — BIZ SYSTEM 콤보 폐기로 prefix 자동 세트 로직 To-Be 미적용) |
| ST-008 | `ROLE_GROUP_ID = ds_main.MASTER_CODE` 의 USER_MAPPING 매칭 (selectCommRoleGrp scalar subquery USER_ID 결과 시 매핑 사용자 존재) | 종속 사용자 매핑 존재 시 행삭제 차단 | fn_rowDelete 의 USER_ID null 검증 (xfdl:739~743) | xfdl:739 |
| ST-009 | `MENU_TP = "WEB"` (selectMenuObjTree WHERE) | 메뉴 트리 조회 시 WEB 메뉴만 표시 (Nexacro UI 메뉴 한정) | LT (메뉴 트리) | xml:171 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (`TB_MCM_SEC_*` 직접 — synonym 미사용). To-Be = MSSQL (사용자 명시 `sample_dmes` DB / `MCMAPUSER` 계정).
>
> **To-Be 결정 (사용자 결정 — cma 4 화면 작업과 동일 정책)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_*` — 대문자 prefix 유지)
> - **audit 컬럼**: cactus-core `CactusAuditEntity` 9 컬럼 통일 (§9 참조). MyBatis `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 처리
> - **Optimistic Locking**: cactus-core `VER` (@Version) 자동 적용
> - **`END_ACTIVE_DATE` `"99991231"` 하드코딩 (xfdl:718)**: To-Be 보존 결정 — As-Is 값 그대로 (cma 화면의 `'9999-12-31 23:59:59'` 정정과 달리 본 화면은 string `"99991231"` 형식)

### §11.1 Oracle → MSSQL 변환점

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `ROWNUM = 1` (Oracle 의사컬럼 — 첫 행만 반환) | xml:17 (selectCommRoleGrp scalar subquery `AND ROWNUM = 1`) | MSSQL `SELECT TOP 1` 또는 `OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY` | selectCommRoleGrp | scalar subquery 내부 사용 — `TOP 1` 권장 |
| 2 | `\|\|` 문자열 결합 | xml:22 (`'%' \|\| #{edt_ROLE_GROUP_ID} \|\|'%'`), xml:25 (`UPPER('%' \|\| #{edt_ROLE_GROUP_NM}\|\|'%')`) | MSSQL `+` 연산자 또는 `CONCAT(...)` 함수 | selectCommRoleGrp | - |
| 3 | `UPPER(...)` | xml:22 / xml:25 (`UPPER(A.ROLE_GROUP_ID) LIKE UPPER(...)`) | MSSQL `UPPER(...)` 동일 (또는 컬럼 collation 으로 case-insensitive) | selectCommRoleGrp | - |
| 4 | NOT EXISTS correlated subquery | xml:75 (deleteCommRoleGrp NOT EXISTS USER_MAPPING + ROLEGROUP_MAPPING), xml:137 (selectCommRole NOT EXISTS ROLEGROUP_MAPPING) | MSSQL 동일 지원 | deleteCommRoleGrp / selectCommRole | - |
| 5 | `<include refid="ref_Audit.*">` MyBatis fragment | xml:46 / 56 / 68 / 104 / 109 (5 회) | **To-Be**: MyBatis `ref_Audit` fragment **폐기**. cactus-core `CactusAuditEntity` 상속 + `CactusAuditListener` 가 JPA `@PrePersist` / `@PreUpdate` 콜백으로 9 컬럼 자동 채움. To-Be INSERT/UPDATE SQL 본문에 audit 컬럼 명시 ✗ | 모든 INSERT/UPDATE SQL | cactus-core 적용 |
| 6 | `WITH MROLE AS (...), MENU AS (...), MENU1 AS (...)` CTE (Common Table Expression) | xml:146~231 (selectMenuObjTree) | MSSQL CTE 동일 지원 (WITH 절 동일) | selectMenuObjTree | MSSQL 의 CTE 와 호환 — 변환 ✗ |
| 7 | `START WITH ... CONNECT BY PRIOR` (Oracle 계층 쿼리) | xml:213~214, 229 (selectMenuObjTree MENU CTE / MENU1 CTE) | MSSQL `WITH RECURSIVE` 패턴 (CTE 재귀) — 변환 필요 | selectMenuObjTree | **변환 큰 변경 — 메뉴 트리 재귀 패턴 재작성 필요** |
| 8 | `CONNECT_BY_ISLEAF` (Oracle 의사컬럼 — leaf 노드 여부) | xml:223 (selectMenuObjTree MENU1) | MSSQL CTE 재귀에서 `NOT EXISTS (child)` 로 대체 또는 클라이언트 처리 | selectMenuObjTree | 동일 |
| 9 | `SYS_CONNECT_BY_PATH(컬럼, '/')` (Oracle — 계층 경로) | xml:224, 230 (selectMenuObjTree MENU1) | MSSQL CTE 재귀의 누적 컬럼 (`path = parent.path + '/' + current.col`) | selectMenuObjTree | 동일 |
| 10 | `TO_CHAR(MENU_SEQ, '00000000')` (Oracle 숫자→문자 format mask) | xml:224, 230 | MSSQL `FORMAT(MENU_SEQ, '00000000')` 또는 `RIGHT('00000000' + CAST(MENU_SEQ AS VARCHAR), 8)` | selectMenuObjTree | - |
| 11 | outer-join `(+)` (Oracle 비표준 외부조인) | xml:242 (`M.OBJECT_ID = O.OBJECT_ID(+)`) | MSSQL `LEFT JOIN ... ON ...` — `MENU1 M LEFT JOIN TB_MCM_SEC_OBJ O ON M.OBJECT_ID = O.OBJECT_ID` | selectMenuObjTree | - |
| 12 | implicit JOIN (콤마 카테시안 + WHERE) | xml:93~95 (selectCommRoleGrpMap: `FROM A, B WHERE A.ROLE_ID = B.ROLE_ID`), xml:158~162 (selectMenuObjTree WITH MROLE 5 테이블 implicit JOIN) | MSSQL 동일 지원 — 단 명시적 JOIN 권장 (`INNER JOIN ... ON ...`) | selectCommRoleGrpMap / selectMenuObjTree | 호환 — 권장 변환 |
| 13 | `ROWNUM` 의사컬럼 | xml:17 (1 회) / xml:237 (`ROWNUM AS ROW_SEQ`) | MSSQL `ROW_NUMBER() OVER (ORDER BY ...)` 또는 `OFFSET/FETCH` | selectCommRoleGrp / selectMenuObjTree | 변환 필요 |
| 14 | `DUAL` 가상 테이블 | xml:114~115 (updateCommRoleGrpMap 더미 `SELECT 'X' FROM DUAL`) | MSSQL DUAL ✗ — `SELECT 'X'` (FROM 절 없음) | updateCommRoleGrpMap | - |
| 15 | (To-Be 신설) D-001 ROLE_GROUP_ID PK 중복 검증 — As-Is xfdl canchange 핸들러 본문 미정의 (As-Is 보존) | (Service 레이어 신설) | **Service 레이어 책임** — saveCmRoleGrp Service 가 insert 시 ROLE_GROUP_ID 존재 검증 + 중복 시 도메인 예외 throw (FE canchange 신설 ✗) | saveCmRoleGrp (Task_1dh8dal) | §12 결정 누적표 — Service 흡수 |
| 16 | (To-Be 폐기) BIZ_SYSTEM_CODE 컬럼 + cbo_subSystemCode / cbo_bizSystemCode 콤보 + ds_lovSubSystem Dataset + selectAppHostId 외부 호출 + lov action + Task_1erud76 BPMN 노드 | xfdl:17 / 263 / 321 / bpmn:132 / xml namespace 외부 | **To-Be 정책 #1 일괄 폐기** (S-001 / D-002 / G-005 / DS-005 / BI-007 / LV-001 / ST-007 / fn_lov / Task_1erud76 / SequenceFlow_0gdqjne 모두 폐기) | selectCommRoleGrp / insertCommRoleGrp / updateCommRoleGrp / lov | 정책 #1 / §12 결정 누적표 일괄 적용 |
| 17 | (To-Be 정정) 셔틀 cssclass 의도 일치 — `btn_right` (cssclass=ShuttleAddH) ↔ "추가" 동작 / `btn_left` (cssclass=ShuttleDeleteH) ↔ "제외" 동작 일치 | xfdl:119~120 vs 773~788 | **To-Be 정정** — btn_right.onclick → fn_appendRoleMapRow (추가) / btn_left.onclick → fn_removeRoleMapRow (제외) — As-Is 의 cssclass 와 동작 의도 반대 결함 정정 | saveCmRoleGrpMap (Task_0weig4p) | §12 결정 누적표 |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be |
|---|---|---|
| 역할 그룹 테이블 | `TB_MCM_SEC_ROLEGROUP` (스키마 prefix 없음) | `MCMAPUSER.TB_MCM_SEC_ROLEGROUP` |
| 역할 그룹 매핑 테이블 | `TB_MCM_SEC_ROLEGROUP_MAPPING` | `MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING` |
| 역할 테이블 | `TB_MCM_SEC_ROLE` | `MCMAPUSER.TB_MCM_SEC_ROLE` |
| 역할 매핑 테이블 | `TB_MCM_SEC_ROLE_MAPPING` | `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` |
| 사용자 매핑 테이블 | `TB_MCM_SEC_USER_MAPPING` | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING` |
| 메뉴 테이블 | `TB_MCM_SEC_MENU` | `MCMAPUSER.TB_MCM_SEC_MENU` |
| 메뉴 폴더 테이블 | `TB_MCM_SEC_MENU_FLD` | `MCMAPUSER.TB_MCM_SEC_MENU_FLD` |
| 오브젝트 테이블 | `TB_MCM_SEC_OBJ` | `MCMAPUSER.TB_MCM_SEC_OBJ` |
| Java 패키지 (Entity / Repository) | (As-Is Java UserTask 없음) | `com.dongkuk.dmes.mcm.entity.*` / `com.dongkuk.dmes.mcm.repository.*` (RULE.md §"패키지 명명 규칙" §3-1 — 모듈 단위 평탄, cma 작업과 동일 정책 — 본 화면은 csa 그룹) |
| Java 패키지 (Service / DTO) | (As-Is Java UserTask 없음) | `com.dongkuk.dmes.mcm.csa.commRoleGrpMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1 — 화면 단위) |
| **Entity 클래스 명명 (정책 #6 A)** | (As-Is Java UserTask 없음) | `SecRoleGroup` (TB_MCM_SEC_ROLEGROUP) / `SecRoleGroupMapping` (TB_MCM_SEC_ROLEGROUP_MAPPING) / `SecRoleGroupRole` (TB_MCM_SEC_ROLE — 본 화면 read-only 인용. 기존 commRoleMng 의 정본 Entity 와 동명 충돌 시 본 화면은 read-only 로 commRoleMng 의 SecRole Entity 재사용 — 명명 후보 `SecRoleGroupRole` 은 비-정본 별칭 / **정본은 SecRole**). 추가 read-only 인용: SecRoleMapping / SecUserMapping / SecMenu / SecMenuFld / SecObj |
| Mapper namespace | `CommRoleGrpMngMapper` | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.{role-group entities}Repository` (native query). Mapper.xml.asis 는 보존 |
| BPMN process id | `CommRoleGrpMng` (process name `"부모역할 부여 조회"` — As-Is 부정확) | `commRoleGrpMng` (process name = **"역할 그룹 관리"** — To-Be 정정) |
| BPMN action 수 | 7 (lov 포함) | **6** (lov 폐기 — 정책 #1) |

> 사용자 결정: As-Is 테이블명 (대문자 prefix) + `MCMAPUSER` 스키마 그대로 보존. Java 패키지는 RULE.md §"패키지 명명 규칙" §3-1 정본 적용. 본 화면은 As-Is Java UserTask 자산 없음 → service Java 클래스 신규 작성 ✗ (BPMN 의 commonDbTask 만 To-Be 매핑).

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 미결정 = **0 건**. 결정 내용은 §3 / §6 / §8 / §9 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| LT 그리드 핸들러 미정의 (분석 시점 oncellclick / onmousemove 2 건) | As-Is 동작 ✗ 유지 — xfdl Script 본문 미정의 보존, To-Be 에서도 신규 핸들러 정의 ✗ | §3.5 |
| D-001 `ROLE_GROUP_ID` 중복 검증 | xfdl canchange 핸들러 신설 ✗ — saveCmRoleGrp Service 레이어가 PK 중복 검증 책임 보유 (도메인 예외 throw) | §3.7 / §11.1 #15 |
| **BIZ SYSTEM 콤보 폐기 (정책 #1)** | D-002 Detail 콤보 + S-001 검색 콤보 + G-005 메인 그리드 컬럼 + ds_main.BIZ_SYSTEM_CODE 컬럼 + BI-007 BindItem + ST-007 + LV-001 모두 To-Be 폐기 — 단일 BIZ SYSTEM 운영 정책 | §3 / §11.1 #16 |
| **selectAppHostId cross-namespace 폐기 (정책 #1)** | `CommObjMngMapper.selectAppHostId` 외부 namespace 호출 / `fn_lov` xfdl 메서드 / Task_1erud76 BPMN 노드 / SequenceFlow_0gdqjne + _0bmn2j8 / DS-005 `ds_lovSubSystem` Dataset 모두 폐기 → BPMN action **7 → 6 enum** 자동 정합 | §6 / §8 / §11.1 #16 / BPMN |
| 셔틀 cssclass 정정 | btn_right (cssclass=`btn_WF_ShuttleAddH`) ↔ "추가" 동작 (fn_appendRoleMapRow) / btn_left (cssclass=`btn_WF_ShuttleDeleteH`) ↔ "제외" 동작 (fn_removeRoleMapRow) 정합 — As-Is cssclass vs 동작 의도 반대 결함 To-Be 정정 | §4.1 B-002/B-003 / §11.1 #17 |
| GE1 `onkeydown` 본문 주석 | As-Is 보존 — xfdl:812~817 주석 처리 그대로 (Ctrl+C 복사 활성화 ✗) | §4.6 #26 |
| BPMN action **6 enum** 확정 | lov action 폐기 결과 — 활성 action = searchCmRoleGrp / saveCmRoleGrp / searchCmRoleGrpMap / saveCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu (사용자 사전 명시 "6 enum" 일치) | §1 / §6 / §8 + BPMN §1.1 / §6.2 |
| `PARENT_ROLE_ID` SELECT 절 누락 정정 | selectCommRoleGrpMap (xml:85~98) + selectCommRole (xml:128~143) SELECT 절에 `PARENT_ROLE_ID` 추가 — GE1-004 / GE2-004 정상 표시 보장 | §6 #5/#9 / §9.3 #7 |
| BPMN process name 정정 | As-Is `name="부모역할 부여 조회"` (부정확) → To-Be `name="역할 그룹 관리"` (As-Is 부정확 정정) | §11.1 / BPMN §6.1 |
| `commonDynamic_onload` 전체 주석 | As-Is 보존 — xfdl:390~405 전체 주석 처리 그대로 (To-Be 신기능 추가 ✗) | §4.6 #2 |
| `ds_main_onrowposchanged` e.reason != 52 분기 | React state 자연 흡수 — useEffect dependency 로 rowposition 변경 시점에만 3 chain (searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) 호출 — Nexacro 의 reason 코드 의미는 FE state 표현으로 자연 분리 | §4.6 #20 / 기능 §6.7 V-601 |
| **Entity 명명 (정책 #6 A)** | `SecRoleGroup` (TB_MCM_SEC_ROLEGROUP) / `SecRoleGroupMapping` (TB_MCM_SEC_ROLEGROUP_MAPPING) / `SecRoleGroupRole` (별칭 — 정본은 commRoleMng 의 `SecRole`) — Entity / Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 모듈 직속 평탄 (RULE.md §"패키지 명명 규칙" §3-1 정본) | §11.1 |
| 스키마 / 테이블명 (정책 #1) | As-Is `TB_MCM_SEC_*` 대문자 prefix 그대로 보존 → To-Be `MCMAPUSER.TB_MCM_SEC_*` (cma 4 화면 정책 동일) | §11.1 |
| audit 컬럼 (cactus-core 정본) | As-Is MyBatis `ref_Audit` fragment 5 회 호출 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1) JPA `@PrePersist` / `@PreUpdate` 자동 채움. `McmAuditEntity` 상속 | §9 / §11.1 #5 |
| As-Is / To-Be 표준 우선 원칙 (정책 #4 0) | 본 분석리포트는 As-Is 1:1 보존 / 가이드 정본 영역은 자동 적용 / 비즈니스 결정만 사용자 위임 — 본 표 15 행 결정 모두 본문 직접 반영 | §0 |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / Calendar / Radio / Dataset / BindItem 전수 등재 | §3.1~§3.9 행수 (영역 10 + S 4 + G 8 + GE1 8 + LT 1 + GE2 7 + D 7 + DS 5 + BI 7) = 57 행 + §4 버튼 B 3 + EX 5 + EX2 3 + EX3 4 = 15 행 + 메서드 §4.6 32 행 + 팝업 §5 0 행 | ✓ |
| G-B: Mapper.xml 10 SQL 전수 | §6 표 10 행 (선언 10) | ✓ |
| G-C: Java 메서드 전수 | (해당 없음 — As-Is Java UserTask 부재, §7 / §0 / §2 명시) | ✓ |
| G-D: BPMN flow 전수 | §8.1 (10 노드) + §8.2 (15 sequenceFlow) + §8.3 (7 action 흐름) | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: 분석 시점 확인필요 항목 활성 = **0 건** (사용자 결정 완료) | §12 결정 누적표 15 행 모두 본문 반영 — 활성 0 | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §11 명시 | 본 화면은 분석 단계 As-Is 1:1 인용 + To-Be 결정 별도 명시 (cma 화면 정책과 동일) | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 14 행 + §11.1 To-Be 명명 안 | ✓ |
| G-J: 정합체크서 §D.4 ✗ + 사유 | §0 표 + 정합체크서 §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성. **2026-05-31 갱신**: 분석 시점 확인필요 항목 사용자 결정 완료 (활성 0) + 정책 #1 (BIZ SYSTEM 콤보 제거) + Service 흡수 + As-Is 보존 + To-Be 정정 + React state 자연 흡수 5 카테고리 → §12 결정 누적표 15 행 본문 직접 반영.

---

## §-1. §6.14 Phase 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? (As-Is 1:1 / 추측 / 누락 / 결함 / 분량 / 시각 / 꼼꼼 / 가이드 / 5종 정합 / 4질문 / 환경 제약 / 직접 수행 / §외 신설 / 경로 추측 — 14 항) | No — As-Is xfdl 873 line + Mapper.xml 250 line + BPMN 292 line 전수 Read + 모든 file:line cite + 분석 시점 확인필요 항목 사용자 결정 완료 (활성 0) + 가이드 §외 신설 ✗ (§0 환경 제약은 사용자 요구사항 [§10] 으로 신설 명시) |
| 2 | 검증 안 한 부분? | No — §12 결정 누적표 15 행 모두 본문 직접 반영 (cma 4 화면 정본 패턴). 활성 = 0 |
| 3 | 그대로 수용? (사용자 사전 명시 "6 enum" 그대로 수용했나?) | Yes — 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 lov action 폐기 → action 6 enum 으로 사용자 명시 일치 |
| 4 | 임의 합리화? | No — 가이드 §외 임의 신설 없음. 본 §0 환경 제약은 cma 4 화면 작업 시 사용자 결정 [§10] 으로 인정된 신설 양식 |

> 4 질문 모두 통과 → Phase 1 분석리포트 작성 완료. **2026-05-31 갱신 적용 — §12 결정 누적표 15 행 본문 반영 / 활성 = 0**.
