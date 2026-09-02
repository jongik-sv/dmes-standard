---
screenId: commRoleMng
asIsId: CommRoleMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# 역할 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + Java UserTask (본 화면은 없음) / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick + BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만"은 mui 환경에 미적용. cite 는 file:line 형식 유지 |
| Java UserTask 디렉토리 | 부재 — ScriptTask 만 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleMng/` 디렉토리 자체 미존재 (ls 검증 — 2026-05-29). 본 화면의 모든 BPMN task 는 cactus oasis 의 `CommonSelectTask` / `CommonMultiSaveTask` (= ScriptTask 등가) 만 사용 |
| As-Is DDL | mui 자산 동봉 ✗ — DMES `DMES-SECTION-MCM_테이블정의서.xlsx` (시트 113) 참조 | TB_MCM_SEC_ROLE / TB_MCM_SEC_ROLE_MAPPING / TB_MCM_SEC_OBJ / TB_MCM_SEC_PERM / TB_MCM_SEC_ROLEGROUP_MAPPING 5 테이블 — As-Is xml 본문에 컬럼 참조 그대로 잔존 |
| ref_Audit (Mapper) | As-Is `<include refid="ref_Audit.update / insert_item / insert_value">` 6 회 호출 — To-Be 폐기 | To-Be 는 cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 채움. As-Is 1:1 보존 + §11 변환점 명시 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 역할 관리 |
| 화면 식별자 (screenId) | commRoleMng |
| As-Is 식별자 (asIsId) | CommRoleMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 역할 관리 (commRoleMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commRoleMng |
| pageId | commRoleMng |
| serviceId | commRoleMng |
| Frontend 파일명 | `commRoleMng.tsx` |
| 분석 일자 | 2026-05-29 |
| Form id (xfdl) | `CommRoleMng` (xfdl:3 — `<Form id="CommRoleMng" width="1280" height="670" titletext="역할 관리" onload="CommRoleMng_onload">`) |
| BPMN process id | `CommRoleMng` (bpmn:3 — `<bpmn2:process id="CommRoleMng" name="부모역할 부여 조회">`) |
| Mapper namespace | `CommRoleMngMapper` (xml:5) |
| BPMN URL (As-Is) | `csa::CommRoleMng` (xfdl:370 — `var sUrl = "csa::CommRoleMng"`) |

**화면 목적** (패턴 1 enum 강제):

> 역할 관리는 CommRoleMng의 조회, 등록, 수정, 삭제, 상태변경을 수행한다.

- 주 사용자: 시스템 관리자 (역할/권한 운영 담당자)
- 업무 도메인: KMC (Key Management Console) 보안 모델의 핵심 — 역할(Role) 마스터 등록 + 역할에 권한(Permission) 부여/회수. 본 화면이 등록한 ROLE_ID 는 별도 사용자-역할 매핑 화면 (CommUserMng) / 역할그룹 매핑 (CommRoleGrpMng) 에서 참조된다.
- 기능 요약 (BPMN action 6 enum + lov):
  1. `searchCmRole` — 역할 마스터 그리드 조회 (`fn_search`, xfdl:630~632)
  2. `saveCmRole` — 역할 마스터 일괄 저장 (INSERT/UPDATE/DELETE 분기, MultiSaveTask) (`fn_save`, xfdl:648~659)
  3. `searchCmRoleMap` — 선택 역할의 현재 권한 조회 (`fn_run("searchCmRoleMap")`, xfdl:393~402, `ds_main_onrowposchanged` 트리거 xfdl:756)
  4. `saveCmRoleMap` — 현재 권한 일괄 저장 (`fn_run("saveCmRoleMap")`, xfdl:404~407 + `fn_removeRoleMapRow` xfdl:557~569 + `fn_appendRoleMapRow` xfdl:572~607)
  5. `searchCmPerm` — 전체 권한 후보 조회 (`fn_permSearch`, xfdl:662~665 + `ds_main_onrowposchanged` 트리거 xfdl:758)
  6. `searchCmRoleMapPnt` — 부모 역할 권한 조회 (As-Is 주석 처리 / BPMN 잔존, xfdl:432~444 / bpmn:118~133)
  7. `pntRoleIdPop` — 부모 역할 POPUP (As-Is 주석 처리 / BPMN 잔존, xfdl:544~546 / bpmn:134~149)
  8. `lov` — LoV (BIZ SYSTEM + MENU_ID 마스터 조회) (`fn_lov`, xfdl:349~356)

---

## §2. 자료 수집 인벤토리 (mui 5 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommRoleMng.xfdl` | 1054 | Y | Form / Layout / Div(div_title, div_search, div_main = div_mainGrd + div_subGrd1 + div_subGrd2 + div_mainDetail + div_buttonGrp + div_bottom) / Grid 3개 (grd_main / grd_sub1 / grd_sub2) / Edit·Combo·Calendar·Radio 컴포넌트 / 9 Dataset / Script 함수 36개 + Bind 9개 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask (csa/CommRoleMng) | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleMng/` | - | **N (디렉토리 부재)** | ls 검증 (2026-05-29) — 본 화면 전용 Java UserTask 디렉토리 자체 미존재. BPMN 8 Task 모두 cactus oasis 의 `CommonSelectTask` / `CommonMultiSaveTask` (= ScriptTask 등가) 사용 → As-Is Java 비즈니스 로직 부재 (= 순수 CRUD 매퍼 호출) | §7 (없음) |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommRoleMngMapper.xml` | 215 | Y | 11 SQL ID (select 5 / insert 2 / update 2 / delete 2) — 9 호출 + 2 미호출 후보. namespace `CommRoleMngMapper` | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommRoleMng.bpmn` | 348 | Y | StartEvent 1 / ExclusiveGateway 1 (8 분기) / Task 9 (Task_00oihyb~Task_17ggria) / EndEvent 1 (8 incoming) / SequenceFlow 17 (1 진입 + 8 분기 + 8 종료) | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (113 시트) | Y (참조) | TB_MCM_SEC_ROLE / TB_MCM_SEC_ROLE_MAPPING / TB_MCM_SEC_OBJ / TB_MCM_SEC_PERM / TB_MCM_SEC_ROLEGROUP_MAPPING 5 테이블 — DMES 시트 컬럼 카탈로그는 본 분석에서 직접 추출 ✗ (Q-002 — 차후 마이그레이션 시 인입) | §9 |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.update / insert_item / insert_value">` 6 회 호출 (xml:49/60/72/117/123) 은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | §11 |
| 7 | 외부 xfdl include | `_com_div::commonTopButton.xfdl` / `_com_div::commonLeftButton.xfdl` / `_com_div::commonRightButton.xfdl` / `_com_div::commonBottomStatus.xfdl` / `_com_div::commonDynamic.xfdl` | - | Y (호출 패턴 인용만) | xfdl:10 / 141 / 185·297·303 / 256 / 129 — 각 공통 div 의 함수 (fn_commonTop_onload / fn_commonLeft_onload / fn_commonRight_onload / fn_commonBottomStatus_msg / commonDynamic_onload) 호출만 인용 | §3 / §5 |
| 8 | 외부 화면 호출 (Q 후보) | `csa::CommMenuMng` (commonDynamic 의 OBJECT 조회 url 인자, xfdl:325) + `csa/csa::CommObjMng` (`fn_linkCommMenu` → `fn_openMenu`, xfdl:842~845) | - | Y | P-NNN 후보 2 (P-001 OBJECT 조회 commonDynamic / P-002 화면이동 CommObjMng) | §5 |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu | xfdl:6~13 |
| A-FILTER | `Div div_search` | top=`div_title:10` / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (BIZ SYSTEM / 역할 ID / 역할명 / 사용 여부) | xfdl:14~27 |
| A-FOLD | `Button btn_fold` | top=93 / height=10 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:28 |
| A-MAIN | `Div div_main` | top=`btn_fold:20` / bottom=40 / left=20 / right=20 | 마스터+상세+셔틀+서브2 통합 컨테이너 | xfdl:29~255 |
| A-MAIN-LEFT-UP (G) | `Div div_mainGrd` | top=0 / height=277 / left=0 / right=440 | 역할 목록 메인 그리드 + leftMenu (chk_check/btn_sum/btn_copyPaste) + rightMenu (btn_rowAdd/btn_rowDelete/btn_rowCopy/btn_rowCancel) | xfdl:137~187 |
| A-MAIN-RIGHT-UP (D) | `Div div_mainDetail` | top=0 / left=`div_mainGrd:10` / width=430 / height=277 | 역할 상세 입력 폼 (9 라벨 + 9 컨트롤) | xfdl:197~252 |
| A-MAIN-LEFT-DOWN (GE1) | `Div div_subGrd1` | top=287 / left=0 / width=605 / bottom=0 | 현재 버튼 권한 그리드 (ds_roleMap) + Perm 필터 | xfdl:32~89 |
| A-MAIN-RIGHT-DOWN (GE2) | `Div div_subGrd2` | top=287 / left=639 / right=0 / bottom=0 | 전체 버튼 권한 그리드 (ds_perm) + OBJECT ID 선택 + Perm 필터 + rightMenu (btn_permSearch) | xfdl:90~136 |
| A-SHUTTLE | `Div div_buttonGrp` | top=65% / right=`div_subGrd2:5` / left=`div_subGrd1:5` / height=75 | 셔틀 버튼 2개 (btn_right=현재권한 삭제 / btn_left=현재권한 추가) | xfdl:189~196 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:256 |

### §3.2 조회조건 (S-NNN)

> 4 단계 lexicographic 정렬: Y 좌표 오름 (모두 top=10 동일) → X 좌표 오름 → 컨트롤명 알파벳 → 선언줄.

| 정렬순 | xfdl id | 컨트롤 종류 | top | X 정렬 (relative) | 선언줄 | 화면 표시명 (인접 Edit Static.value 1byte) | 입력 유형 (5 enum) | maxlength / 기본값 | innerdataset / codecolumn / datacolumn | 이벤트 | 필수 | 근거 |
|---:|---|---|---:|---|---:|---|---|---|---|---|---|---|
| 1 (S-001) | `cbo_bizSystemCode` | ~~Combo~~ → **제거 (정책 #1)** | 10 | `stc_bizSystemCode:10` (X≈100) | 18 | ~~"BIZ SYSTEM"~~ (As-Is 출처: `stc_bizSystemCode.value="BIZ SYSTEM"`, xfdl:17) | ~~ComboBox~~ | ~~width=80 / `value="Y"` `text="Y"` `displaynulltext="전체"` `index="0"`~~ | ~~`ds_lovSubSystem` / `APP_HOST_ID` / `APP_HOST_ID`~~ | (없음) | N | xfdl:17~18 (As-Is 인용만) — **To-Be 폐기** (정책 #1: BIZ_SYSTEM_CODE / APP_HOST_ID / selectAppHostId 컬럼·LoV 일괄 제거. Q-005 자동 해소) |
| 2 (S-002) | `edt_ROLE_ID` | Edit (TextBox) | 10 | `sts_roleId:10` (X≈260) | 20 | "역할 ID" (출처: `sts_roleId.value="역할 ID"`, xfdl:19) | TextBox | width=120 / `maxlength="100"` / ~~`text="부산역 CY"`~~ (As-Is 디폴트 더미 — Q-001 As-Is 인용만 / To-Be 빈 문자열 placeholder) | - | (없음) | N | xfdl:19~20 |
| 3 (S-003) | `edt_ROLE_NM` | Edit (TextBox) | 10 | `sts_roleId00:10` (X≈480) | 22 | "역할명" (출처: `sts_roleId00.value="역할명"`, xfdl:21) | TextBox | width=200 / `maxlength="100"` / ~~`text="부산역 CY"`~~ (Q-001 동일) | - | (없음) | N | xfdl:21~22 |
| 4 (S-004) | `cbo_USE_TP` | Combo | 10 | `sts_useTp:10` (X≈770) | 24 | "사용 여부" (출처: `sts_useTp.value="사용 여부"`, xfdl:23) | ComboBox | width=50 / `value="Y"` `text="Y"` `index="0"` / `displayrowcount="3"` | `ds_useTp` / `CD` / `NM` (xfdl:1024~1040 — Y/사용 + N/미사용 + 빈행) | `onitemchanged="div_search_cbo_USE_TP_onitemchanged"` (xfdl:24 — As-Is 핸들러 본문 ✗ — Q-003 인용만 / To-Be 미반영 — 신규 미반영 정책) | N | xfdl:23~24 |

> S 카운트 (As-Is) = 4 / **To-Be = 3** (S-001 cbo_bizSystemCode 콤보 제거 — 정책 #1). 본 화면은 BIZ SYSTEM (`cbo_bizSystemCode`) Combo 만 Lookup 연동 LoV (ds_lovSubSystem) 사용했으나 To-Be 에서 BIZ_SYSTEM_CODE 컬럼 / LoV / 선행 데이터 일체 제거 (정책 #1 일괄). Q-005 (D-003 cbo_bizSystemCode mismatch) 도 콤보 자체 제거로 자동 해소.

### §3.3 메인 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, 영역 div_mainGrd)

> 그리드 위치 xfdl:142~184. binddataset `ds_main` (ds:968~981 — 10 컬럼). columns size 9 + body 9 bind + head 9 text + 좌측 band column size=30 (인디케이터).

| ID | head text | body bind | 컬럼 size | edittype / displaytype | 정렬 | combo (combodataset/code/data) | 추가 속성 | 근거 |
|---|---|---|---:|---|---|---|---|---|
| G-001 | "상태" | `bind:STATUS` (displaytype `imagecontrol`) | 30 (head 40 / body 24) | image | Center (default) | - | (CRUD 행 상태 아이콘 — Inserted/Updated/Deleted) | xfdl:146 / 161 / 172 |
| G-002 | "ROLE ID" | `bind:ROLE_ID` | 80 | (default) | Center | - | autosizecol="limitmin" | xfdl:147 / 162 / 173 |
| G-003 | "ROLE 이름" | `bind:ROLE_NM` | 160 | (default) | textAlign="left" | - | - | xfdl:148 / 163 / 174 |
| G-004 | "ROLE 설명" | `bind:ROLE_DESC` | 240 | (default) | textAlign="left" | - | - | xfdl:149 / 164 / 175 |
| G-005 | "MENU" | `bind:MENU_ID` | 48 | (default) | Center | - | - | xfdl:150 / 165 / 176 |
| G-006 | "BIZ\nSYSTEM" (head text 줄바꿈 = `&#10;`) | `bind:BIZ_SYSTEM_CODE` | 55 | (default) | Center | - | head text 는 `\n` 줄바꿈 포함 As-Is 보존 | xfdl:151 / 166 / 177 |
| G-007 | "사용구분" | `bind:USE_TP` | 55 | combotext | Center | combodataset=`ds_useTp`, combocodecol=`CD`, combodatacol=`NM` | - | xfdl:152 / 167 / 178 |
| G-008 | "유효개시일" | `bind:START_ACTIVE_DATE` (displaytype `date`) | 80 | date | Center | - | calendardateformat="yyyy-MM-dd" | xfdl:153 / 168 / 179 |
| G-009 | "유효기한일" | `bind:END_ACTIVE_DATE` (displaytype `date`) | 80 | date | Center | - | calendardateformat="yyyy-MM-dd" | xfdl:154 / 169 / 180 |

- 그리드 옵션: `autofittype="col"` `selecttype="cell"` `cellmovingtype="col"` `cellsizingtype="col"` `autosizingtype="col"` `autosizebandtype="allband"` (xfdl:142)
- 이벤트: `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` (xfdl:142 → `gfn_commonOnheadclick`, xfdl:797~800) / `onkeydown` 핸들러 주석 처리 (xfdl:790~794 — Ctrl+C 카피 페이스트 주석)
- 그리드 셀 코딩 (xfdl:341): `gfn_gridSelectedRow(grd_main, "red", "blue", "")` — 선택 행 색상 설정

### §3.4 확장 그리드 GE-NNN (`grd_sub1` + `grd_sub2`)

> 본 화면은 메인 그리드 외 동등 위상의 확장 그리드 2 개 존재 (sub1 = 현재 권한 / sub2 = 전체 권한). GE/G2 우선 규칙 (R-11) 적용: 확장 2개 이상 → G1/G2 명명 가능하나 본 분석은 영역 분리가 명확 (sub1/sub2 와 binddataset 다름) → **GE-NNN 단일 등재** + 영역 컬럼으로 sub1/sub2 분리.

**GE 그리드 1 (`grd_sub1`, binddataset=`ds_roleMap`, 영역 div_subGrd1 — 현재 버튼 권한)**:

> 그리드 위치 xfdl:36~84. 11 columns + body 11 bind + head 11 text + 좌측 band column size=28 (CHK checkbox).

| ID | 영역 | head text | body bind | 컬럼 size | displaytype / edittype | 정렬 | 근거 |
|---|---|---|---|---:|---|---|---|
| GE-001 | sub1 (현재 권한) | (체크 셀 — band="left") | `bind:CHK` (displaytype `checkboxcontrol`, edittype `checkbox`) | 28 | checkbox | (head 동일) | xfdl:40 / 57 / 70 |
| GE-002 | sub1 | "PERMISSION ID" | `bind:PERMISSION_ID` | 107 | (default) | textAlign="left" | xfdl:41 / 58 / 71 |
| GE-003 | sub1 | "OBJECT ID" | `bind:OBJECT_ID` | 97 | (default) | textAlign="left" | xfdl:42 / 59 / 72 |
| GE-004 | sub1 | "PERMISSION 명" | `bind:PERMISSION_NM` | 120 | (default) | textAlign="left" | xfdl:43 / 60 / 73 |
| GE-005 | sub1 | "공통 권한" | `bind:PERMISSION_COMMON` | 155 | (default) | textAlign="left" | xfdl:44 / 61 / 74 |
| GE-006 | sub1 | "CUSTOM 권한" | `bind:PERMISSION_CUSTOM` | 148 | (default) | textAlign="left" | xfdl:45 / 62 / 75 |
| GE-007 | sub1 | "POPUP 버튼" | `bind:POPUP_BTN` | 135 | (default) | textAlign="left" | xfdl:46 / 63 / 76 |
| GE-008 | sub1 | "OBJECT 명" | `bind:OBJECT_NM` | 100 | (default) | textAlign="left" | xfdl:47 / 64 / 77 |
| GE-009 | sub1 | "SYSTEM" | `bind:SYSTEM_CODE` | 60 | (default) | Center | xfdl:48 / 65 / 78 |
| GE-010 | sub1 | "SERVICE" | `bind:SERVICE` | 80 | (default) | textAlign="left" | xfdl:49 / 66 / 79 |
| GE-011 | sub1 | "역할 ID" | `bind:ROLE_ID` | 80 | (default) | textAlign="left" | xfdl:50 / 67 / 80 |

**GE 그리드 2 (`grd_sub2`, binddataset=`ds_perm`, 영역 div_subGrd2 — 전체 버튼 권한 후보)**:

> 그리드 위치 xfdl:95~128. 6 columns + body 6 bind + head 6 text + 좌측 band column size=30 (CHK checkbox).

| ID | 영역 | head text | body bind | 컬럼 size | displaytype / edittype | 정렬 | 근거 |
|---|---|---|---|---:|---|---|---|
| GE-012 | sub2 (전체 권한) | (체크 셀 — band="left") | `bind:CHK` (displaytype `checkboxcontrol`, edittype `checkbox`) | 30 | checkbox | (head 동일) | xfdl:99 / 111 / 119 |
| GE-013 | sub2 | "PERMISSION ID" | `bind:PERMISSION_ID` | 128 | (default) | textAlign="left" | xfdl:100 / 112 / 120 |
| GE-014 | sub2 | "PERMISSION명" (As-Is 띄어쓰기 없음 — sub1 GE-004 "PERMISSION 명" 과 표기 비대칭, As-Is 1:1 보존) | `bind:PERMISSION_NM` | 128 | (default) | textAlign="left" | xfdl:101 / 113 / 121 |
| GE-015 | sub2 | "공통 권한" | `bind:PERMISSION_COMMON` | 167 | (default) | textAlign="left" | xfdl:102 / 114 / 122 |
| GE-016 | sub2 | "CUSTOM 권한" | `bind:PERMISSION_CUSTOM` | 155 | (default) | textAlign="left" | xfdl:103 / 115 / 123 |
| GE-017 | sub2 | "POPUP버튼" (As-Is 띄어쓰기 없음 — sub1 GE-007 "POPUP 버튼" 과 표기 비대칭, As-Is 1:1 보존) | `bind:POPUP_BTN` | 120 | (default) | textAlign="left" | xfdl:104 / 116 / 124 |

- 그리드 옵션 (sub1): `cellmovingtype="col"` `cellsizingtype="col"` `selecttype="row"` `autosizingtype="col"` `autosizebandtype="allband"` / `font="12px/normal &quot;Malgun Gothic&quot;"` (xfdl:36)
- 그리드 옵션 (sub2): 동일 + `selecttype="row"` (xfdl:95)
- 이벤트 (sub1): `onheadclick="div_main_div_subGrd1_grd_sub1_onheadclick"` (xfdl:802~810 — CHK 헤드 클릭 시 전체 선택 `gfn_setGridCheckAll` / 그 외 `gfn_commonOnheadclick`) + 셀 색상 `gfn_gridSelectedRow(grd_sub1, "red", "blue", "")` (xfdl:342)
- 이벤트 (sub2): `onheadclick="div_main_div_subGrd2_grd_sub2_onheadclick"` (xfdl:819~826 — 동일 분기) + 셀 색상 `gfn_gridSelectedRow(grd_sub2, "red", "blue", "")` (xfdl:343) + `ds_perm.oncolumnchanged="ds_perm_oncolumnchanged"` (xfdl:957 → xfdl:837~840 → `fn_setChkDs(obj, e, grd_sub2)` — CHK 헤드 카운트 동기화)

### §3.5 상세 입력 필드 D-NNN (`div_mainDetail`, 영역 우상)

> 위치 xfdl:197~252. 영역 외곽 = `div_mainDetail` top=0 / left=`div_mainGrd:10` / width=430 / height=277. 내부 `div_detail` (top=25 / left=0 / right=0 / bottom=0). 9 라벨 (Static cssclass `stc_WF_Box(First)`) + 9 컨트롤 (Edit / Combo / Calendar / Radio). xfdl:340 에서 `gfn_setEnable("this.div_main.form.div_mainDetail","false")` — 기본 비활성, ds_main row 존재 시 활성 (xfdl:458). 신규 행 (rowType==2) 시 cbo_folder / edt_id 만 활성 (xfdl:764~768).

| 정렬순 | ID | 화면 표시명 (Edit value 1byte) | xfdl id (컨트롤) | top | 입력 유형 (5 enum) | 데이터셋 바인딩 | 필수 (cssclass `Essential`) | 추가 속성 | 근거 |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | D-001 | ~~"BIZ SYSTEM"~~ (As-Is Edit value, xfdl:211) | ~~`cbo_bizsystem` (Combo)~~ | 4 | ~~ComboBox~~ | ~~ds_main.BIZ_SYSTEM_CODE (Bind item3, xfdl:1050)~~ | Y (cssclass `Essential`) | **To-Be 폐기 (정책 #1)** — BIZ_SYSTEM_CODE 컬럼·LoV·콤보 일괄 제거. As-Is 인용: innerdataset=`ds_lovSubSystem` / codecolumn=`APP_HOST_ID` / datacolumn=`APP_HOST_ID` / `onitemchanged="...cbo_bizsystem_onitemchanged"` (xfdl:918~924 — ds_lovMenuId 필터링) | xfdl:211 / 245 / 1050 (As-Is 인용만) |
| 2 | D-002 | ~~"역활 ID"~~ → **"역할 ID"** (As-Is Edit value, xfdl:243 — As-Is 오타 "역활" → To-Be 정정 "역할" / Q-013 해소) | `edt_role_id` (Edit) | 32 | TextBox | ds_main.ROLE_ID (Bind item0, xfdl:1051) | Y (cssclass `Essential`) | `maxlength="90"` / `readonly="true"` (자동 생성 ID — xfdl:913 `"role_"+MENU_ID+"_"+ID` 합성) / As-Is `canchange="...edt_object_id_canchange"` (xfdl:246 — 핸들러 본문 ✗ — Q-004 신규 미반영 / As-Is 1:1 인용만) | xfdl:243 / 246 / 1051 |
| 3 | D-003 | "메뉴 ID" (Edit value, xfdl:240) | `cbo_folder` (Combo) | 60 | ComboBox | ds_main.MENU_ID (Bind item1, xfdl:1049) | Y (cssclass `Essential`) | innerdataset=`ds_lovMenuId` / codecolumn=`MENU_ID` / datacolumn=`MENU_ID_NM` / As-Is `onitemchanged="...cbo_bizSystemCode_onitemchanged"` (xfdl:244 — 핸들러명 표기는 `cbo_bizSystemCode_onitemchanged` 이지만 컨트롤은 `cbo_folder` 인 As-Is mismatch / 본문 정의 ✗ — Q-005 자동 해소 (정책 #1 로 cbo_bizSystemCode 자체 제거 → mismatch 무효) / **To-Be ds_lovMenuId 는 BIZ_SYSTEM_CODE 종속 필터링 제거 — MENU_ID 단일 LoV**) | xfdl:240 / 244 / 1049 |
| 4 | D-004 | "ID" (Edit value, xfdl:210) | `edt_id` (Edit) | 89 | TextBox | ds_main.ID (Bind item2, xfdl:1048) | Y (cssclass `Essential`) | `maxlength="100"` / `imemode="alpha"` / `inputtype="numberandenglish,symbol"` / `inputfilter="none"` / As-Is `onchanged="...edt_id_onchanged"` (xfdl:241 — 핸들러 본문 ✗ — Q-006 신규 미반영 / As-Is 1:1 인용만. ROLE_ID 자동 합성은 ds_main_oncolumnchanged xfdl:906) | xfdl:210 / 241 / 1048 |
| 5 | D-005 | "역할명" (Edit value, xfdl:212) | `edt_role_nm` (Edit) | 116 | TextBox | ds_main.ROLE_NM (Bind item9, xfdl:1047) | N | `maxlength="100"` / `inputtype="normal"`. As-Is 라벨 컨트롤명 `edt_st_roleDesc` ↔ 의미 (ROLE_NM) 비일관 → **To-Be 정정 라벨 컨트롤명 = `edt_st_roleNm`** (Q-014 해소) | xfdl:212 / 218 / 1047 |
| 6 | D-006 | "역할 설명" (Edit value, xfdl:214) | `edt_role_desc` (Edit) | 144 | TextBox | ds_main.ROLE_DESC (Bind item8, xfdl:1046) | N | `maxlength="100"` / `inputtype="normal"`. As-Is 라벨 컨트롤명 `edt_st_parentRoleId` ↔ 의미 (ROLE_DESC) 비일관 → **To-Be 정정 라벨 컨트롤명 = `edt_st_roleDesc`** (Q-014 해소) | xfdl:214 / 238 / 1046 |
| 7 | D-007 | "사용 여부" (Edit value, xfdl:213) | `edt_use_tp` (Radio) | 172 | **Radio** (UI 자연 흡수 — Y/Yes, N/No 정적 2옵션 RadioGroup. Q-007 해소 = 가이드 5 enum 외이지만 React RadioGroup 으로 자연 흡수) | ds_main.USE_TP (Bind item6, xfdl:1044) | N | innerdataset 내장 (Y/Yes, N/No 정적 2 행, xfdl:220~235) / direction="vertical" / value="Y" / index="0" | xfdl:213 / 219~236 / 1044 |
| 8 | D-008 | "유효 개시일" (Edit value, xfdl:209) | `cal_start_active_date` (Calendar) | 199 | DatePicker | ds_main.START_ACTIVE_DATE (Bind item5, xfdl:1043) | N | usetrailingday="true" / dateformat="yyyy-MM-dd" / 신규 행 기본값 `gfn_today()` (xfdl:694) | xfdl:209 / 237 / 1043 |
| 9 | D-009 | "유효 기한일" (Edit value, xfdl:216) | `cal_end_active_date` (Calendar) | 226 | DatePicker | ds_main.END_ACTIVE_DATE (Bind item7, xfdl:1045) | N | usetrailingday="true" / dateformat="yyyy-MM-dd" / 신규 행 기본값 `"99991231"` (xfdl:695) | xfdl:216 / 217 / 1045 |

> D 카운트 = 9. 본 영역은 ds_main 의 row 선택에 따라 양방향 바인딩되는 단일 상세 폼. 신규 행 (rowType==2) 만 cbo_folder + edt_id 편집 가능 (xfdl:763~769).

### §3.6 셔틀 버튼 (영역 A-SHUTTLE — `div_buttonGrp`)

| ID | xfdl id | 좌표 | 화면 표시명 (cssclass) | onclick | 동작 | 근거 |
|---|---|---|---|---|---|---|
| BS-001 | `btn_right` | top=42 / left=0 / width=24 / height=31 | As-Is cssclass `btn_WF_ShuttleAddH` (Add 이지만 실 동작 = 삭제) → **To-Be cssclass `btn_WF_ShuttleDeleteH`** (의미 정합 swap — Q-008 해소) | `div_main_div_buttonGrp_btn_right_onclick` (xfdl:773~779) | 현재 권한 삭제 (CHK=1 행 → ds_roleMap deleteRow + saveCmRoleMap 호출) | xfdl:192 / 773 |
| BS-002 | `btn_left` | top=1 / left=0 / width=24 / height=31 | As-Is cssclass `btn_WF_ShuttleDeleteH` (Delete 이지만 실 동작 = 추가) → **To-Be cssclass `btn_WF_ShuttleAddH`** (의미 정합 swap — Q-008 해소) | `div_main_div_buttonGrp_btn_left_onclick` (xfdl:782~788) | 현재 권한 추가 (ROLE_ID 검증 + OBJECT_ID 검증 → ds_perm CHK=1 행 → ds_roleMap addRow + saveCmRoleMap 호출) | xfdl:193 / 782 |

> BS-001 / BS-002 의 As-Is cssclass 명 `ShuttleAddH` / `ShuttleDeleteH` 가 실 동작과 반대 → **To-Be swap 정정** (Q-008 해소 = cssclass 의미 일치).

### §3.7 외부 commonDynamic 컴포넌트 (`div_object_id`, sub2 내부)

| ID | xfdl id | 좌표 | 역할 | 호출 함수 (xfdl:321~336) | 외부 URL 호출 | 근거 |
|---|---|---|---|---|---|---|
| FX-001 | `div_object_id` (div, url=`_com_div::commonDynamic.xfdl`) | left=188 / top=29 / right=10 / height=21 / cssclass `Essential` | OBJECT ID 입력 + 조회 팝업 | `commonDynamic_onload(this, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst", "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL", "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID", "fn_callBack", "1", 150)` | `csa::CommMenuMng` 의 commonList 서비스 → OBJECT 조회 팝업 (P-001) | xfdl:129 / 321~336 |

### §3.8 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 / 정적 데이터 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_perm` | PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / CHK / PERMISSION_ID_UPPER (7 컬럼) | sub2 그리드 (전체 권한 후보) | `oncolumnchanged="ds_perm_oncolumnchanged"` (xfdl:957 → CHK 동기화) | xfdl:957~967 |
| DS-002 | `ds_main` | ROLE_ID / ROLE_NM / ROLE_DESC / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID / BIZ_SYSTEM_CODE / ID (10 컬럼) | 메인 그리드 + 상세 영역 (양방향 바인딩) | `onrowposchanged="ds_main_onrowposchanged"` (xfdl:740) + `oncolumnchanged="ds_main_oncolumnchanged"` (xfdl:906 → MENU_ID/ID 변경 시 ROLE_ID 자동 합성 `"role_"+MENU_ID+"_"+ID`) | xfdl:968~981 |
| DS-003 | `ds_roleMap` | PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / OBJECT_ID / OBJECT_NM / SYSTEM_CODE / SERVICE / ROLE_ID / CHK / PERMISSION_ID_UPPER (12 컬럼) | sub1 그리드 (현재 권한 매핑) | `keystring="S:+PERMISSION_ID"` (PK 정렬) | xfdl:982~997 |
| DS-004 | `ds_roleMapParent` | OBJECT_ID / OBJECT_NM / PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / SERVICE / SYSTEM_CODE / ROLE_ID (10 컬럼) | 부모 역할 권한 (As-Is 주석 처리 — searchCmRoleMapPnt) | (호출 ✗ — xfdl:432~444 주석) | xfdl:998~1011 |
| DS-005 | `ds_lovSubSystem` | APP_HOST_ID (1 컬럼) | S-001 / D-001 BIZ SYSTEM LoV | `fn_lov` (xfdl:349~356) 에서 `lov` 서비스로 조회 → `ds_selectAppHostId` 매핑 | xfdl:1012~1016 |
| DS-006 | `ds_lovMenuId` | MENU_ID / BIZ_SYSTEM_CODE / MENU_ID_NM (3 컬럼) | D-003 메뉴 ID LoV | `fn_lov` 에서 `ds_selectMenuId` 매핑 + cbo_bizsystem 선택 시 `BIZ_SYSTEM_CODE` 필터 (xfdl:918~924) | xfdl:1017~1023 |
| DS-007 | `ds_useTp` | CD / NM (2 컬럼) | S-004 + G-007 (사용여부) LoV | 정적 데이터셋 — 3 행: 빈 행 / Y/사용 / N/미사용 (xfdl:1029~1039) | xfdl:1024~1040 |

> Dataset 갯수 = 7 (ds_main / ds_roleMap / ds_perm / ds_roleMapParent / ds_lovSubSystem / ds_lovMenuId / ds_useTp).

---

## §4. 버튼·액션 (B-NNN / GB-NNN / EX-NNN) + 이벤트 핸들러 매핑

### §4.1 공통 topMenu 버튼 (`fn_commonTop_onload` 등록 — div_title.div_topMenu)

> 등록 위치 xfdl:285~289 (`fn_formBeforeOnload`). 기본버튼 4 개 + 사용자정의 0. 외부 commonTopButton 의 표준 핸들러 → 본 화면 메서드 호출.

| ID | 위치 | 버튼명 (As-Is array) | xfdl id | 호출 메서드 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_title.topMenu (toolbar) | btn_search | `btn_search` (외부) | `fn_search` (xfdl:630~632) | 조회 (`fn_run("searchCmRole")`) | search → BPMN sequenceFlow `searchCmRole` | xfdl:287 / 631 |
| B-002 | div_title.topMenu (toolbar) | btn_reset | `btn_reset` (외부) | `fn_reset` (xfdl:634~637) | 초기화 (`gfn_setDivDefault(div_search)`) | reset (클라이언트 전용) | xfdl:287 / 634 |
| B-003 | div_title.topMenu (toolbar) | btn_save | `btn_save` (외부) | `fn_save` (xfdl:648~659) | 저장 (확인 dialog → `fn_before_save_chk()` → `fn_run("saveCmRole")`) | save → BPMN sequenceFlow `saveCmRole` | xfdl:287 / 648 |
| B-004 | div_title.topMenu (toolbar) | btn_close | `btn_close` (외부) | `fn_close` (xfdl:640~644) | 닫기 (`objApp.gv_AppTabPath.form.fn_closeForm()`) | close (클라이언트 전용) | xfdl:287 / 640 |

### §4.2 commonLeftButton (`fn_commonLeft_onload` — div_main.div_mainGrd.div_leftMenu)

> 등록 위치 xfdl:291~295. 사용자정의 3 개 + 기본 0. 외부 commonLeftButton 의 표준 버튼 (chk_check / btn_sum / btn_copyPaste).

| ID | 위치 | 버튼명 (As-Is array) | 호출 메서드 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| B-005 | div_mainGrd.leftMenu (그리드 좌상단) | chk_check | (외부 등록 — 본 화면 핸들러 ✗ — Q-009) | 그리드 체크 토글 (commonLeft 기본) | check (클라이언트 전용) | xfdl:294 |
| B-006 | div_mainGrd.leftMenu | btn_sum | (외부 등록 — 본 화면 핸들러 ✗ — Q-009) | 합계 표시 (commonLeft 기본) | sum (클라이언트 전용) | xfdl:294 |
| B-007 | div_mainGrd.leftMenu | btn_copyPaste | (외부 등록 — 본 화면 핸들러 ✗ — Q-009) | 행 복사/붙여넣기 (commonLeft 기본 — onkeydown 주석된 ctrl+C 핸들러 잔존 xfdl:790~794) | copyPaste (클라이언트 전용) | xfdl:294 |

### §4.3 commonRightButton 1 (`fn_commonRight_onload` — div_main.div_mainGrd.div_rightMenu)

> 등록 위치 xfdl:297~301. 사용자정의 0 + 기본 4 (btn_rowAdd / btn_rowDelete / btn_rowCopy / btn_rowCancel).

| ID | 위치 | 버튼명 (As-Is array) | 호출 메서드 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| B-008 | div_mainGrd.rightMenu (그리드 우상단) | btn_rowAdd | `fn_rowAdd` (xfdl:687~697) | 행추가 (`ds_main.addRow()` + USE_TP/START_ACTIVE_DATE/END_ACTIVE_DATE 디폴트) | rowAdd (클라이언트 전용) | xfdl:299 / 687 |
| B-009 | div_mainGrd.rightMenu | btn_rowDelete | `fn_rowDelete` (xfdl:710~725) | 행삭제 (ROLE_GROUP_ID 검증 + ds_roleMap rowcount 검증 → `gfn_deleteRow`) | rowDelete (클라이언트 전용 + 검증) | xfdl:299 / 710 |
| B-010 | div_mainGrd.rightMenu | btn_rowCopy | `fn_rowCopy` (xfdl:699~708) | 행복사 (`gfn_rowcopyData(ds_main, rowposition)`) | rowCopy (클라이언트 전용) | xfdl:299 / 699 |
| B-011 | div_mainGrd.rightMenu | btn_rowCancel | `fn_rowCancel` (xfdl:736~738) | 행취소 (`gfn_grdInit(grd_main)`) | rowCancel (클라이언트 전용) | xfdl:299 / 736 |

### §4.4 commonRightButton 2 (`fn_commonRight_onload` — div_main.div_subGrd2.div_rightMenu)

> 등록 위치 xfdl:303~307. 사용자정의 1 (btn_permSearch) + 기본 0.

| ID | 위치 | 버튼명 (As-Is array) | 호출 메서드 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|
| B-012 | div_subGrd2.rightMenu (전체 권한 그리드 우상단) | btn_permSearch | `fn_permSearch` (xfdl:662~665) | 전체 버튼 권한 조회 (`fn_run("searchCmPerm")`) | searchCmPerm → BPMN sequenceFlow `searchCmPerm` | xfdl:304 / 662 |

### §4.5 본체 버튼 (div_main 직속)

| ID | 위치 | xfdl id | 화면 표시명 (cssclass / text) | onclick | 동작 | 근거 |
|---|---|---|---|---|---|---|
| B-013 | div_main (상단) | `btn_fold` | (cssclass `btn_WFSA_Fold` — 접기/펴기 토글 아이콘) | `btn_fold_onclick` (xfdl:625~627 → `gfn_fold(this, div_search, div_main, btn_fold)`) | 조회조건 접기/펴기 | xfdl:28 / 625 |

### §4.6 셔틀 버튼 (재인용 — §3.6 참조)

| ID | 위치 | xfdl id | 화면 표시명 | onclick | 동작 | 호출 BPMN action | 근거 |
|---|---|---|---|---|---|---|---|
| B-014 | div_buttonGrp | `btn_right` | (cssclass `btn_WF_ShuttleAddH`) | `div_main_div_buttonGrp_btn_right_onclick` (xfdl:773~779) | 현재권한 삭제 → `fn_removeRoleMapRow()` → ds_roleMap CHK=1 행 deleteRow + `fn_run("saveCmRoleMap")` | saveCmRoleMap (간접) | xfdl:192 / 773 |
| B-015 | div_buttonGrp | `btn_left` | (cssclass `btn_WF_ShuttleDeleteH`) | `div_main_div_buttonGrp_btn_left_onclick` (xfdl:782~788) | 현재권한 추가 → `fn_appendRoleMapRow()` → ROLE_ID/OBJECT_ID 검증 → ds_perm CHK=1 행 addRow + `fn_run("saveCmRoleMap")` | saveCmRoleMap (간접) | xfdl:193 / 782 |

### §4.7 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:38~84 sub1 / 97~127 sub2 / 144~184 main 전수 검토. CHK 컬럼은 displaytype `checkboxcontrol` — 인라인 버튼이 아닌 체크박스).

### §4.8 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:259~955) 의 모든 function 을 전수 등재.

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `fn_formBeforeOnload` | (gfn 라이프사이클 — formOnLoad 이전) | commonTop / commonLeft / commonRight 2회 / `div_search.edt_ROLE_ID.setFocus()` | - | - | xfdl:283~314 |
| 2 | `CommRoleMng_onload` | Form onload (xfdl:3 — `onload="CommRoleMng_onload"`) | `div_object_id.commonDynamic_onload(...)` 호출 + `gfn_formOnLoad(obj)` + 상세 비활성화 + 3 그리드 selectedRow 색상 설정 + `fn_lov()` 호출 | lov (간접) | (LoV SQL — CommObjMng 의 selectAppHostId / selectMenuId) | xfdl:316~347 |
| 3 | `fn_lov` | `CommRoleMng_onload` | `gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId ds_lovMenuId=ds_selectMenuId", "")` | lov | (외부 CommObjMng Mapper) | xfdl:349~356 |
| 4 | `fn_beforeRun(sSvcId)` | (gfn 라이프사이클 — transaction 이전) | `return true` (validation 없음) | - | - | xfdl:361~363 |
| 5 | `fn_run(sSvcId)` | (메인 transaction 분기기) | sUrl=`csa::CommRoleMng` + 6 svcId 분기: searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / (주석 처리: searchCmRoleMapPnt) | searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm | (각 분기의 SQL — §6 참조) | xfdl:366~445 |
| 6 | `fn_callBack(sSvcId, nErrorCode, strErrorMsg)` | gfn_transaction 콜백 | 5 svcId 분기 (searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm) + 주석: searchCmRoleMapPnt / pntRoleIdPop. 각 분기에서 `div_bottom.fn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` 표시 + saveCmRole 콜백 시 "저장 되었습니다." 메시지 후 fn_search 재호출. searchCmRoleMap / searchCmPerm 콜백에서 PERMISSION_ID_UPPER 컬럼 계산 (대문자 변환) | (모든 action 콜백) | (모든 SQL 결과 처리) | xfdl:451~551 |
| 7 | `fn_removeRoleMapRow` | B-014 (btn_right) | enableevent=false → ds_roleMap CHK=1 행 deleteRow (역방향 루프) → `fn_run("saveCmRoleMap")` | saveCmRoleMap | (deleteCommRoleMap + selectCommRoleMapList + selectCommPerm 재조회) | xfdl:557~569 |
| 8 | `fn_appendRoleMapRow` | B-015 (btn_left) | ROLE_ID 검증 → OBJECT_ID 검증 (`div_object_id.fn_get_value()`) → enableevent=false → ds_perm CHK=1 행 ds_roleMap addRow (ROLE_ID/OBJECT_ID/PERMISSION_ID 세트) → `fn_run("saveCmRoleMap")` (주석: 등록 후 전체권한에서 제외 코드 잔존 xfdl:600~606) | saveCmRoleMap | (insertCommRoleMap + selectCommRoleMapList + selectCommPerm 재조회) | xfdl:572~607 |
| 9 | `fn_setChkDs(obj, e, grdObj)` | ds_perm / ds_roleMap oncolumnchanged | columnid=="CHK" 시 헤드 텍스트 "1"/"0" 동기화 (전체 선택 여부) | - | - | xfdl:610~620 |
| 10 | `btn_fold_onclick` | B-013 | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:625~627 |
| 11 | `fn_search` | B-001 | `fn_run("searchCmRole")` | searchCmRole | selectCommRole | xfdl:630~632 |
| 12 | `fn_reset` | B-002 | `gfn_setDivDefault(div_search)` | - | - | xfdl:634~637 |
| 13 | `fn_close` | B-004 | `objApp.gv_AppTabPath.form.fn_closeForm()` | - | - | xfdl:640~644 |
| 14 | `fn_save` | B-003 | 확인 다이얼로그 → `fn_before_save_chk()` → `fn_run("saveCmRole")` | saveCmRole | (insertCommRole / updateCommRole / deleteCommRole — 행상태 분기) | xfdl:648~659 |
| 15 | `fn_permSearch` | B-012 | `fn_run("searchCmPerm")` | searchCmPerm | selectCommPerm | xfdl:662~665 |
| 16 | `fn_before_save_chk` | `fn_save` | (주석: ROLE_ID vs PARENT_ROLE_ID 동일성 검증 xfdl:670~676 — As-Is 미사용) → `gfn_isDatasetChanged(ds_main)` 시 `gfn_cpRequired(this, "ROLE_ID")` 호출 / 아니면 "저장할 데이터가 없습니다." 표시 후 false | - | - | xfdl:667~685 |
| 17 | `fn_rowAdd` | B-008 | `ds_main.addRow()` + 상세 활성화 + USE_TP="Y" / START_ACTIVE_DATE=오늘 / END_ACTIVE_DATE="99991231" 디폴트 | - | - | xfdl:687~697 |
| 18 | `fn_rowCopy` | B-010 | rowposition < 0 차단 → `gfn_rowcopyData(ds_main, rowposition)` + 상세 활성화 | - | - | xfdl:699~708 |
| 19 | `fn_rowDelete` | B-009 | ROLE_GROUP_ID 검증 (`연결된 [역할그룹] 이 존재합니다. 제외 후 삭제 하세요`) + ds_roleMap rowcount 검증 (`연결된 [권한] 이 존재합니다. 제외 후 삭제 하세요`) → `gfn_deleteRow(ds_main, nRow)` | - | - | xfdl:710~725 |
| 20 | `fn_MsgDeleteCallBack(FormId, rtn)` | (미호출 — fn_rowDelete 가 직접 deleteRow 호출 — As-Is 잔존) | rtn 시 deleteRow / 아니면 return | - | - | xfdl:727~734 |
| 21 | `fn_rowCancel` | B-011 | `gfn_grdInit(grd_main)` | - | - | xfdl:736~738 |
| 22 | `ds_main_onrowposchanged` | ds_main rowposition 변경 | rowType != 2 + rowposition > -1 + rowcount != 0 + reason != 52 시 sub1/sub2 헤드 CHK=0 초기화 + `fn_run("searchCmRoleMap")` + `fn_run("searchCmPerm")` (주석: `fn_run("searchCmRoleMapPnt")` xfdl:760). rowType==2 (신규) 시 cbo_folder / edt_id 활성화 / 아니면 비활성화 | searchCmRoleMap + searchCmPerm | selectCommRoleMapList + selectCommPerm | xfdl:740~770 |
| 23 | `div_main_div_buttonGrp_btn_right_onclick` | B-014 | `fn_removeRoleMapRow()` + sub1/sub2 헤드 CHK=0 초기화 | saveCmRoleMap (간접) | (deleteCommRoleMap + 재조회) | xfdl:773~779 |
| 24 | `div_main_div_buttonGrp_btn_left_onclick` | B-015 | `fn_appendRoleMapRow()` + sub1/sub2 헤드 CHK=0 초기화 | saveCmRoleMap (간접) | (insertCommRoleMap + 재조회) | xfdl:782~788 |
| 25 | `div_main_div_mainGrd_grd_main_onkeydown` | grd_main keydown | 본문 주석 처리 (ctrl+C `gfn_grdCopy_Paste` 주석) | - | - | xfdl:790~795 |
| 26 | `div_main_div_mainGrd_grd_main_onheadclick` | grd_main headclick | `gfn_commonOnheadclick(obj, e)` | - | - | xfdl:797~800 |
| 27 | `div_main_div_subGrd1_grd_sub1_onheadclick` | grd_sub1 headclick | CHK 컬럼 헤드 시 `gfn_setGridCheckAll` / 그 외 `gfn_commonOnheadclick` | - | - | xfdl:802~810 |
| 28 | `div_main_div_subGrd1_grd_sub1_onkeydown` | grd_sub1 keydown | 본문 주석 처리 | - | - | xfdl:812~817 |
| 29 | `div_main_div_subGrd2_grd_sub2_onheadclick` | grd_sub2 headclick | CHK 컬럼 헤드 시 `gfn_setGridCheckAll` / 그 외 `gfn_commonOnheadclick` | - | - | xfdl:819~827 |
| 30 | (주석) `div_main_div_subGrd2_grd_sub2_onkeydown` | (주석 처리) | - | - | - | xfdl:829~835 |
| 31 | `ds_perm_oncolumnchanged` | ds_perm 컬럼 변경 | `fn_setChkDs(obj, e, grd_sub2)` 호출 | - | - | xfdl:837~840 |
| 32 | `fn_linkCommMenu` | (외부 호출 — As-Is 주석 처리 fn_commonTop_onload 의 사용자정의 array xfdl:289) | `fn_openMenu("csa/csa::CommObjMng", "")` | - (외부 화면 이동) | (P-002 외부 화면) | xfdl:842~846 |
| 33 | `fn_openMenu(sFullId, pArg)` | `fn_linkCommMenu` | objApp.gds_menuInfo 에서 FULL_ID 검색 → 없으면 "메뉴가 존재하지 않습니다." 경고 / 있으면 `gfn_openMainTabMenu(sFullId, pArg)` | - (외부 화면 이동) | - | xfdl:848~860 |
| 34 | (주석) `div_horizontalBar_move_ondrag` / `div_main_div_subGrd1_ondragmove` / `div_main_div_subGrd1_ondrop` | (전체 주석 처리 — 미사용 드래그 리사이즈) | - | - | - | xfdl:862~904 |
| 35 | `ds_main_oncolumnchanged` | ds_main 컬럼 변경 | columnid=="MENU_ID" 또는 "ID" 시 ROLE_ID 자동 합성 (`"role_"+MENU_ID+"_"+ID`) | - | - | xfdl:906~916 |
| 36 | `div_main_div_mainDetail_div_detail_cbo_bizsystem_onitemchanged` | D-001 cbo_bizsystem onitemchanged | value null 시 ds_lovMenuId 필터 제거 / 아니면 `BIZ_SYSTEM_CODE == '{값}'` 필터 적용 | - | - | xfdl:918~924 |
| 37 | `div_main_div_subGrd2_edt_permfilter_onkeyup` | sub2 edt_permfilter keyup | enableredraw=false → 입력값 대문자 변환 후 `PERMISSION_ID_UPPER.indexOf('{값}')>-1` 필터 적용 / 빈 값이면 필터 제거 → enableredraw=true | - | - | xfdl:927~940 |
| 38 | `div_main_div_subGrd1_edt_permfilter2_onkeyup` | sub1 edt_permfilter2 keyup | 동일 패턴 — ds_roleMap 에 동일 필터 적용 | - | - | xfdl:942~954 |

> 메서드 총수 = 38 (this.X = function 그대로 35 정의 + 주석 4 잔존 — 23/25/27/29/34 등은 본문 자체가 주석. 표는 표시상 38 행).
>
> **As-Is 핸들러 미정의 (xfdl 본문 ✗ — Q 후보)**: `div_search_cbo_USE_TP_onitemchanged` (xfdl:24) / `div_main_div_mainDetail_div_detail_edt_id_onchanged` (xfdl:241) / `div_main_div_mainDetail_div_detail_edt_object_id_canchange` (xfdl:246) / `div_main_div_mainDetail_div_detail_cbo_bizSystemCode_onitemchanged` (xfdl:244 — As-Is 메서드명 표기 오타, 컨트롤은 cbo_folder) — 4 핸들러 모두 본문 미정의. As-Is 1:1 보존 (Q-003~006).

---

## §5. 팝업 / 외부 화면 호출 P-NNN

| ID | 유형 | 이름 (xfdl Title arg) | 호출 위치 (메서드 / 라인) | 호출 함수 | 전달 파라미터 | 콜백 | 반환 처리 | 근거 |
|---|---|---|---|---|---|---|---|---|
| P-001 | popup (commonDynamic) | "OBJECT 조회" | `CommRoleMng_onload` / xfdl:329 | `div_object_id.commonDynamic_onload(this, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst", "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL", "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID", "fn_callBack", "1", 150)` | service ID=`commonList`, URL=`csa::CommMenuMng`, 표시 컬럼=`OBJECT_ID, OBJECT_NM, FORM_URL`, 한글 헤더=`OBJECTID, OBJECT명, FORM URL`, ID 컬럼=`OBJECT_ID`, Nm 컬럼=`OBJECT_NM`, 조회 조건=`edt_OBJECT_ID`, 조회 입력창 수="1", 코드 너비=150 | `fn_callBack` (xfdl:451) | (commonDynamic 자동 설정 — div_object_id 의 value 갱신) | xfdl:129 / 321~336 |
| P-002 | external (메뉴 이동) | (메뉴 이동 — Title arg 없음) | `fn_linkCommMenu` / xfdl:842~846 → `fn_openMenu("csa/csa::CommObjMng", "")` | `gfn_openMainTabMenu(sFullId, pArg)` | sFullId=`csa/csa::CommObjMng`, pArg="" | (없음 — 메뉴 이동 후 새 탭) | (메뉴 부재 시 "메뉴가 존재하지 않습니다." 경고) | xfdl:842~860 |

- P-001 호출 위치: Form onload 시점 (1 회) — div_object_id 컴포넌트의 클릭 시점에 commonDynamic 자체 로직으로 팝업 표시.
- P-002 호출 위치: `fn_commonTop_onload` 의 사용자정의 array (xfdl:289 주석 — `["fn_linkCommMenu","Object 관리","F"]` 주석 처리) + sub2 commonRightButton 등록 (xfdl:307 주석) → **As-Is 모두 주석 처리** → 실제 호출 없음 (Q-010).

---

## §6. SQL ID 매트릭스 (Mapper.xml 11 SQL 전수 — As-Is 9 호출 + 2 미호출 + 마지막은 주석 fragment 보존)

> Mapper.xml namespace = `CommRoleMngMapper` (xml:5). 본 표는 11 SQL 모두 전수 — As-Is 1:1 보존. **As-Is 미호출 2 SQL 은 To-Be 제거 확정** (`updateCommRoleMap` 명목만 / `selectCommPntRoleMapPop` 본문 전체가 주석 fragment).

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task | 호출 메서드 (xfdl) | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommRole` | select | Map (edt_ROLE_ID / edt_ROLE_NM / cbo_USE_TP) — **To-Be cbo_bizSystemCode 파라미터 제거 (정책 #1)** | List<Map> (ROLE_ID, ROLE_NM, ROLE_DESC, MENU_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, ROLE_GROUP_ID(서브쿼리), ID — **9 컬럼 / BIZ_SYSTEM_CODE 컬럼 제거**) | `TB_MCM_SEC_ROLE A` + scalar subquery `TB_MCM_SEC_ROLEGROUP_MAPPING B` | As-Is `<where>` + 4 동적 필터 → **To-Be 3 동적 필터** (`UPPER(ROLE_ID) LIKE UPPER('%' + #{edt_ROLE_ID} + '%')` / `UPPER(ROLE_NM) LIKE ... edt_ROLE_NM` / `USE_TP = #{cbo_USE_TP}` — `BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}` 분기 제거 / 정책 #1) / ORDER BY `A.START_ACTIVE_DATE` | As-Is Oracle: `\|\|` 문자열 결합 + `ROWNUM = 1` 서브쿼리 (xml:18) + `SUBSTR(A.ROLE_ID, INSTR(A.ROLE_ID,'_',-1,1)+1, LENGTH(A.ROLE_ID)) AS ID` (xml:20 — ROLE_ID 의 마지막 `_` 이후 토큰 추출) / **To-Be MSSQL: `+` 결합 + `TOP 1` + `SUBSTRING/CHARINDEX/REVERSE`** | Task_00oihyb (역할 조회), bpmn:32~46 | `fn_run("searchCmRole")` → `fn_search` (xfdl:631) | Y | xml:7~37 |
| 2 | `insertCommRole` | insert | Map (ROLE_ID, ROLE_NM, ROLE_DESC, MENU_ID, USE_TP, BIZ_SYSTEM_CODE, START_ACTIVE_DATE, END_ACTIVE_DATE + audit) | (rowcount) | `TB_MCM_SEC_ROLE` | (INSERT — WHERE 없음) | `TO_DATE(SUBSTR(#{START_ACTIVE_DATE}, 1, 14), 'YYYYMMDDhh24miss')` (xml:58~59 — 14자리 datetime) + `<include refid="ref_Audit.insert_item / insert_value">` (xml:49 / 60) | Task_1dh8dal (역할 저장) — CommonMultiSaveTask insertSqlKey, bpmn:55 | `fn_run("saveCmRole")` (INSERT 분기 — ds_main rowType=2 행) | Y | xml:39~62 |
| 3 | `updateCommRole` | update | Map (ROLE_NM, ROLE_DESC, MENU_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE + audit) | (rowcount) | `TB_MCM_SEC_ROLE` | `WHERE ROLE_ID = #{ROLE_ID}` | `TO_DATE(SUBSTR(...))` (xml:70~71) + `<include refid="ref_Audit.update">` (xml:72) | Task_1dh8dal (역할 저장) — CommonMultiSaveTask updateSqlKey, bpmn:56 | `fn_run("saveCmRole")` (UPDATE 분기 — ds_main rowType=4 행) | Y | xml:64~74 |
| 4 | `deleteCommRole` | delete | Map (ROLE_ID) | (rowcount) | `TB_MCM_SEC_ROLE A` | `WHERE A.ROLE_ID = #{ROLE_ID}` + `NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLEGROUP_MAPPING B WHERE B.ROLE_ID = A.ROLE_ID)` + `NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING C WHERE C.ROLE_ID = A.ROLE_ID)` | NOT EXISTS 2 회 (참조 무결성 보호) | Task_1dh8dal (역할 저장) — CommonMultiSaveTask deleteSqlKey, bpmn:57 | `fn_run("saveCmRole")` (DELETE 분기 — ds_main rowType=8 행) | Y (Mapper 등재 — fn_rowDelete 가 직접 트리거 ✗ — fn_save 호출 시 행상태 분기) | xml:76~87 |
| 5 | `selectCommRoleMapList` | select | Map (ROLE_ID) — **To-Be cbo_bizSystemCode 파라미터 제거 (정책 #1)** | List<Map> (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, POPUP_BTN, OBJECT_ID, OBJECT_NM, SYSTEM_CODE, SERVICE, ROLE_ID — **10 컬럼 / BIZ_SYSTEM_CODE 컬럼 제거**) | `TB_MCM_SEC_ROLE_MAPPING A` + `TB_MCM_SEC_OBJ B` + `TB_MCM_SEC_PERM C` | `A.OBJECT_ID = B.OBJECT_ID AND A.PERMISSION_ID = C.PERMISSION_ID AND A.ROLE_ID = #{ROLE_ID}` — **`<if test="cbo_bizSystemCode != null">AND B.BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}</if>` 분기 제거 (정책 #1)** | 3 테이블 join (Oracle 콤마 join → To-Be ANSI JOIN) | Task_0xxo78b (역할 부여 조회), bpmn:65~78 + ~~Task_0f9lt7e (부모역할 부여 조회 — 동일 sqlKey 재사용, bpmn:118~131)~~ **(To-Be 제거)** | `fn_run("searchCmRoleMap")` (xfdl:393) | Y | xml:89~110 |
| 6 | `insertCommRoleMap` | insert | Map (ROLE_ID, OBJECT_ID, PERMISSION_ID + audit) | (rowcount) | `TB_MCM_SEC_ROLE_MAPPING` | (INSERT — WHERE 없음) | `<include refid="ref_Audit.insert_item / insert_value">` (xml:117 / 123) | Task_0weig4p (역할 부여 저장) — CommonMultiSaveTask insertSqlKey, bpmn:92 | `fn_run("saveCmRoleMap")` (INSERT 분기 — fn_appendRoleMapRow 가 addRow 한 행) | Y | xml:112~125 |
| 7 | ~~`updateCommRoleMap`~~ | ~~update (no-op)~~ | ~~Map (없음)~~ | ~~`SELECT 'X' FROM DUAL` (no-op — UPDATE 본문이 SELECT)~~ | ~~DUAL~~ | **To-Be 제거 — JPA `saveAll` 흡수 (UI 자연 흡수)** As-Is `SELECT 'X' FROM DUAL` no-op 행은 To-Be 에서 별도 SQL 정의 없이 JPA `RoleMappingRepository.saveAll(...)` 이 INSERT-only 시 update 행 없음을 자연 처리 (Q-011 해소) | ~~As-Is 의도 미상~~ Q-011 해소 = no-op SELECT 행 일괄 제거 | ~~Task_0weig4p — updateSqlKey~~ **(To-Be 제거: updateSqlKey property 자체 삭제)** | (호출 ✗ — As-Is ds_roleMap 의 rowType=4 (UPDATE) 행이 발생하지 않음 — fn_appendRoleMapRow 는 addRow 만 / fn_removeRoleMapRow 는 deleteRow 만) | **N — To-Be 제거** (As-Is no-op 본문 + 호출 ✗) | xml:127~130 (As-Is 인용만) |
| 8 | `deleteCommRoleMap` | delete | Map (ROLE_ID, OBJECT_ID, PERMISSION_ID) | (rowcount) | `TB_MCM_SEC_ROLE_MAPPING A` | `WHERE A.ROLE_ID = #{ROLE_ID} AND A.OBJECT_ID = #{OBJECT_ID} AND A.PERMISSION_ID = #{PERMISSION_ID}` (PK = 3 컬럼 복합키) | (주석 잔존: `NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLEGROUP_MAPPING B WHERE B.ROLE_ID = A.ROLE_ID)` xml:137~140 — As-Is 의도적 주석 처리, 실 동작 없음) | Task_0weig4p (역할 부여 저장) — CommonMultiSaveTask deleteSqlKey, bpmn:94 | `fn_run("saveCmRoleMap")` (DELETE 분기 — fn_removeRoleMapRow 가 deleteRow 한 행) | Y | xml:132~141 |
| 9 | `selectCommPerm` | select | Map (ROLE_ID) | List<Map> (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, POPUP_BTN — 5 컬럼) | `TB_MCM_SEC_PERM A` | `A.USE_TP = 'Y' AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID AND B.ROLE_ID = #{ROLE_ID})` / ORDER BY A.PERMISSION_ID | NOT EXISTS — 본 ROLE_ID 에 미할당 권한만 조회 (전체 후보 풀) + 주석 잔존: `A.PERMISSION_ID LIKE '%'\|\|#{PERM}\|\|'%'` xml:151 / `B.OBJECT_ID = #{OBJECT_ID}` xml:156 — As-Is 주석 처리 | Task_1re6tzu (PERMISSION 조회), bpmn:102~115 | `fn_run("searchCmPerm")` (xfdl:409 + xfdl:758 ds_main_onrowposchanged) | Y | xml:143~159 |
| 10 | `selectMenuObjPop` | select | Map (edt_OBJECT_ID) | List<Map> (OBJECT_ID, OBJECT_NM, SERVICE, FORM_URL, PARAM — 5 컬럼) | `TB_MCM_SEC_OBJ` | `WHERE USE_TP = 'Y'` + `<if test="edt_OBJECT_ID != null">AND (UPPER(OBJECT_ID) LIKE UPPER(#{edt_OBJECT_ID} \|\|'%') OR UPPER(OBJECT_NM) LIKE UPPER(#{edt_OBJECT_ID}\|\|'%'))</if>` | LIKE prefix 매칭 (OBJECT_ID OR OBJECT_NM) | (BPMN 직접 매핑 없음 — commonDynamic 의 commonList 서비스 내부에서 호출 추정) | (P-001 OBJECT 조회 commonDynamic 의 `commonList` 서비스 — 본 화면 BPMN 외 외부 서비스에서 호출) | Y (간접 — commonDynamic 경유) | xml:161~173 |
| 11 | `selectCommPntRoleMapPop` | select | Map (없음 — 본문 활성 부분에 파라미터 없음) | (활성 SELECT 본문 = 2 컬럼 ROLE_ID, ROLE_NM 만) | `TB_MCM_SEC_ROLE A` + `TB_MCM_SEC_ROLE_MAPPING B` + `TB_MCM_SEC_OBJ C` + `TB_MCM_SEC_PERM D` | 4 테이블 join + `A.USE_TP='Y' AND C.USE_TP='Y' AND D.USE_TP='Y'` | DISTINCT + 4 테이블 join. 본문 후반 (xml:189~213) 전체가 주석 fragment 잔존 (PARENT_ROLE_ID IS NULL 분기 + 6 컬럼 SELECT + edt_ROLE_ID LIKE 필터 + ORDER BY A.START_ACTIVE_DATE) | Task_1sm19m8 (부모 역할 POPUP), bpmn:134~149 | (호출 ✗ — `pntRoleIdPop` BPMN 분기는 As-Is xfdl Script 에 호출 메서드 없음 — `fn_callBack` xfdl:544~546 주석만 잔존) | **N — To-Be 제거** (As-Is 본문 절반 주석 + 호출 ✗) | xml:175~214 |

> **SQL 정합 요약 (As-Is)**: Mapper.xml 11 SQL 등재 ↔ 실 호출 9 SQL ✓ + 미사용 2 SQL (`updateCommRoleMap` / `selectCommPntRoleMapPop`).
>
> **To-Be 적용**: As-Is 미사용 2 SQL 은 To-Be Mapper 에서 제거. 활성 SQL 9 개만 이전 (`selectCommRole` / `insertCommRole` / `updateCommRole` / `deleteCommRole` / `selectCommRoleMapList` / `insertCommRoleMap` / `deleteCommRoleMap` / `selectCommPerm` / `selectMenuObjPop`). BPMN 의 `pntRoleIdPop` action flow + `searchCmRoleMapPnt` flow + Task_1sm19m8 / Task_0f9lt7e 도 동시 제거.

---

## §7. Java UserTask 트랜잭션

해당 없음 — 본 화면은 Java UserTask 디렉토리 자체가 미존재 (§2 #2 / §0 확인 ✗). 8 BPMN Task 모두 cactus oasis 의 `CommonSelectTask` (조회) / `CommonMultiSaveTask` (INSERT/UPDATE/DELETE 일괄 — 행상태 분기) 만 사용한다.

**As-Is BPMN Task 의 cactus oasis class 매핑** (bpmn:32~180):

| BPMN Task ID | name | cactus class | 호출 SQL ID | bpmn property | 비고 |
|---|---|---|---|---|---|
| Task_00oihyb | 역할 조회 | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | `#{serviceId}Mapper.selectCommRole` | resultKey=`ds_main` | bpmn:32~46 |
| Task_1dh8dal | 역할 저장 | `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` | insertSqlKey=`#{serviceId}Mapper.insertCommRole` / updateSqlKey=`#{serviceId}Mapper.updateCommRole` / deleteSqlKey=`#{serviceId}Mapper.deleteCommRole` | paramKey=`ds_main` / resultKey=`ds_main` / nextBranchSpel=`""` | bpmn:48~64 |
| Task_0xxo78b | 역할 부여 조회 | `CommonSelectTask` | `#{serviceId}Mapper.selectCommRoleMapList` | resultKey=`ds_roleMap` | bpmn:65~78 |
| Task_0weig4p | 역할 부여 저장 | `CommonMultiSaveTask` | insertSqlKey=`#{serviceId}Mapper.insertCommRoleMap` / updateSqlKey=`#{serviceId}Mapper.updateCommRoleMap` / deleteSqlKey=`#{serviceId}Mapper.deleteCommRoleMap` | paramKey=`ds_roleMap` / resultKey=`ds_roleMap` | bpmn:83~99 |
| Task_1re6tzu | PERMISSION 조회 | `CommonSelectTask` | `#{serviceId}Mapper.selectCommPerm` | resultKey=`ds_perm` | bpmn:102~115 |
| Task_0f9lt7e | 부모역할 부여 조회 | `CommonSelectTask` | `#{serviceId}Mapper.selectCommRoleMapList` (재사용) | resultKey=`ds_roleMapParent` | bpmn:118~131 (As-Is 미호출 — To-Be 제거) |
| Task_1sm19m8 | 부모 역할 POPUP | `CommonSelectTask` | `#{serviceId}Mapper.selectCommPntRoleMapPop` | resultKey=`ds_roleMapPntPop` | bpmn:134~147 (As-Is 미호출 — To-Be 제거) |
| ~~Task_0r5ztlq~~ | ~~lov_SUBSYSTEM 조회~~ | ~~`CommonSelectTask`~~ | ~~`CommObjMngMapper.selectAppHostId` (cross-namespace 외부 Mapper)~~ | ~~resultKey=`ds_selectAppHostId`~~ | bpmn:150~163 (As-Is 인용만 — **To-Be 노드 제거 / 정책 #1**) |
| Task_17ggria | lov_MENU_ID 조회 | `CommonSelectTask` | `CommObjMngMapper.selectMenuId` (외부 Mapper) → **To-Be: `commRoleMngMapper.selectMenuId` 본 namespace 내재화 (Q-015 oasis ScriptTask 표준 등가)** | resultKey=`ds_selectMenuId` | bpmn:166~179 |

**To-Be 적용**: cactus oasis ScriptTask 표준 패턴 (가이드 §6-C/D/E + §7-A/B) 적용 (Q-015 UI 자연 흡수 해소 — `dao=""` + `isServiceResult=true` 의 As-Is 동작은 oasis `OasisServiceExecutor` + `MyBatisSqlRunner` 로 재설계). 정책 #1 일괄 적용으로 **lov 분기는 MENU_ID 단일 분기 (Task_17ggria)** 만 잔존 — Task_0r5ztlq (lov_SUBSYSTEM 조회 = cross-namespace `CommObjMngMapper.selectAppHostId`) 는 BIZ_SYSTEM_CODE/APP_HOST_ID 컬럼·LoV 일괄 제거에 따라 본 화면에서 노드 제거. As-Is sequenceFlow `lov` 도 단일 Task 로 단순화.

---

## §8. BPMN 흐름 상세 (bpmn:1~348)

### §8.1 BPMN 구조 요약

| 항목 | 갯수 | 근거 |
|---|---:|---|
| StartEvent | 1 (`StartEvent_1`) | bpmn:4~6 |
| EndEvent | 1 (`EndEvent_1` — 8 incoming) | bpmn:7~16 |
| ExclusiveGateway | 1 (`ExclusiveGateway_1` — 1 incoming + 8 outgoing) | bpmn:17~30 |
| Task (CommonSelectTask / CommonMultiSaveTask) | 9 (Task_00oihyb / Task_1dh8dal / Task_0xxo78b / Task_0weig4p / Task_1re6tzu / Task_0f9lt7e / Task_1sm19m8 / Task_0r5ztlq / Task_17ggria) | bpmn:32~180 |
| SequenceFlow | 17 (1 진입 StartEvent→Gateway + 8 분기 Gateway→Task + 8 종료 Task→EndEvent. 단, Task_0r5ztlq → Task_17ggria 는 직렬 → 8 종료가 아닌 7 종료 + 1 직렬 + 1 EndEvent) — 정정: StartEvent→Gateway(1) + Gateway→Task 8 분기(8) + Task→EndEvent 7 (`Task_00oihyb→End`, `Task_1dh8dal→End`, `Task_0xxo78b→End`, `Task_0weig4p→End`, `Task_1re6tzu→End`, `Task_0f9lt7e→End`, `Task_1sm19m8→End`) + Task_0r5ztlq→Task_17ggria(1) + Task_17ggria→EndEvent(1) = 18 (정정 — 본 행 표시 17 은 오기. 실 카운트 = 17 SequenceFlow → bpmn:31, 46, 47, 79, 80, 81, 82, 100, 101, 116, 117, 132, 133, 148, 149, 164, 165, 180 = 18 행 cite). **재카운트** = bpmn line `<bpmn2:sequenceFlow id=` grep 결과 = 18. | bpmn:31 / 46~47 / 79~82 / 100~101 / 116~117 / 132~133 / 148~149 / 164~165 / 180 |

### §8.2 SequenceFlow 분기 8 enum (Gateway → Task) + action 매핑

| sequenceFlow id | name (= action enum) | source | target | 호출 task | xfdl 트리거 (메서드) | 근거 |
|---|---|---|---|---|---|---|
| SequenceFlow_0tt1mbk | searchCmRole | ExclusiveGateway_1 | Task_00oihyb | 역할 조회 | `fn_search` (B-001) → `fn_run("searchCmRole")` | bpmn:47 |
| SequenceFlow_11y43nf | searchCmRoleMap | ExclusiveGateway_1 | Task_0xxo78b | 역할 부여 조회 | `ds_main_onrowposchanged` (xfdl:756) → `fn_run("searchCmRoleMap")` | bpmn:79 |
| SequenceFlow_0grwghu | saveCmRole | ExclusiveGateway_1 | Task_1dh8dal | 역할 저장 | `fn_save` (B-003) → `fn_run("saveCmRole")` | bpmn:82 |
| SequenceFlow_109h9q1 | saveCmRoleMap | ExclusiveGateway_1 | Task_0weig4p | 역할 부여 저장 | `fn_removeRoleMapRow` (B-014) / `fn_appendRoleMapRow` (B-015) → `fn_run("saveCmRoleMap")` | bpmn:100 |
| SequenceFlow_13bmd6q | searchCmPerm | ExclusiveGateway_1 | Task_1re6tzu | PERMISSION 조회 | `fn_permSearch` (B-012) / `ds_main_onrowposchanged` (xfdl:758) → `fn_run("searchCmPerm")` | bpmn:116 |
| SequenceFlow_1mp2ve7 | searchCmRoleMapPnt | ExclusiveGateway_1 | Task_0f9lt7e | 부모역할 부여 조회 | (As-Is 주석 — xfdl:432~444) | bpmn:132 |
| SequenceFlow_1dx0nky | pntRoleIdPop | ExclusiveGateway_1 | Task_1sm19m8 | 부모 역할 POPUP | (As-Is 주석 — `fn_callBack` xfdl:544~546) | bpmn:148 |
| SequenceFlow_112renl | lov | ExclusiveGateway_1 | Task_0r5ztlq | lov_SUBSYSTEM 조회 (→ Task_17ggria lov_MENU_ID 조회 직렬) | `fn_lov` (xfdl:349~356) → `CommRoleMng_onload` | bpmn:164 |

> action enum (8) = searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / searchCmRoleMapPnt / pntRoleIdPop / lov. **xfdl 실 호출 6 + 미호출 2** (searchCmRoleMapPnt + pntRoleIdPop).

### §8.3 Task → EndEvent SequenceFlow 매핑

| sequenceFlow id | source | target | 비고 | 근거 |
|---|---|---|---|---|
| SequenceFlow_105vwsz | Task_00oihyb | EndEvent_1 | searchCmRole 종료 | bpmn:46 |
| SequenceFlow_1tgyodp | Task_0xxo78b | EndEvent_1 | searchCmRoleMap 종료 | bpmn:80 |
| SequenceFlow_1vkp3qd | Task_1dh8dal | EndEvent_1 | saveCmRole 종료 | bpmn:81 |
| SequenceFlow_11vs9ef | Task_0weig4p | EndEvent_1 | saveCmRoleMap 종료 | bpmn:101 |
| SequenceFlow_0p8l9xo | Task_1re6tzu | EndEvent_1 | searchCmPerm 종료 | bpmn:117 |
| SequenceFlow_1t99ejv | Task_0f9lt7e | EndEvent_1 | searchCmRoleMapPnt 종료 (As-Is 미호출) | bpmn:133 |
| SequenceFlow_1u69i6f | Task_1sm19m8 | EndEvent_1 | pntRoleIdPop 종료 (As-Is 미호출) | bpmn:149 |
| SequenceFlow_1w3vtuk | Task_0r5ztlq | Task_17ggria | lov 직렬 (SubSystem → MenuId) | bpmn:165 |
| SequenceFlow_1uoow5p | Task_17ggria | EndEvent_1 | lov 종료 | bpmn:180 |

### §8.4 BPMN process 이름 정정 (Q-012 해소)

As-Is `<bpmn2:process id="CommRoleMng" name="부모역할 부여 조회" ...>` (bpmn:3) — process name 이 "부모역할 부여 조회" 로 설정되어 화면명 "역할 관리" 와 불일치 (다른 화면명 복붙 잔존 추정).

→ **To-Be 정정 (Q-012 해소)**: process name = **"역할 관리"** (화면식별자 commRoleMng 와 일치). To-Be process id = `commRoleMng` (camelCase 적용).

---

## §9. As-Is DB / 테이블 / LoV 분석

### §9.1 본 화면 사용 테이블 5종 (DMES-SECTION-MCM)

| # | 테이블 | 영문명 | 용도 | 본 화면 참조 | 근거 |
|---|---|---|---|---|---|
| 1 | TB_MCM_SEC_ROLE | Role Master | 역할 마스터 (ROLE_ID PK + ROLE_NM/ROLE_DESC/MENU_ID/USE_TP/BIZ_SYSTEM_CODE/START_ACTIVE_DATE/END_ACTIVE_DATE + audit 9) | selectCommRole / insertCommRole / updateCommRole / deleteCommRole | xml:21 / 40 / 65 / 77 |
| 2 | TB_MCM_SEC_ROLE_MAPPING | Role-Permission Mapping | 역할 ↔ 권한 매핑 (PK = ROLE_ID + OBJECT_ID + PERMISSION_ID 복합) | selectCommRoleMapList / insertCommRoleMap / deleteCommRoleMap | xml:101 / 113 / 133 |
| 3 | TB_MCM_SEC_OBJ | Object Master | 화면/객체 마스터 (OBJECT_ID PK + OBJECT_NM / SYSTEM_CODE / SERVICE / BIZ_SYSTEM_CODE / FORM_URL / PARAM / USE_TP) | selectCommRoleMapList (JOIN) / selectMenuObjPop | xml:102 / 167 |
| 4 | TB_MCM_SEC_PERM | Permission Master | 권한 마스터 (PERMISSION_ID PK + PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / USE_TP) | selectCommRoleMapList (JOIN) / selectCommPerm | xml:103 / 149 |
| 5 | TB_MCM_SEC_ROLEGROUP_MAPPING | RoleGroup-Role Mapping | 역할그룹 ↔ 역할 매핑 (참조 무결성 검증용) | selectCommRole (서브쿼리) / deleteCommRole (NOT EXISTS) | xml:16 / 81 |

> 컬럼 카탈로그 (As-Is DMES Excel 시트 별 전수 추출) 는 §9.4 (2026-05-30 추가) 에서 본 화면 사용 5 테이블 전수 (TB_MCM_SEC_ROLE 26 / TB_MCM_SEC_ROLE_MAPPING 20 / TB_MCM_SEC_OBJ 31 / TB_MCM_SEC_PERM 29 / TB_MCM_SEC_ROLEGROUP_MAPPING 19 = 125 컬럼) 완료. Q-002 해소.

### §9.4 DMES 테이블 정의서 5 시트 전수 컬럼 카탈로그 (Q-002 해소 — 2026-05-30)

> **출처**: `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` 직접 시트 추출 (2026-05-30 작성, sheet rId89 / rId92 / rId87 / rId88 / rId91). 시트명은 `SEC_ROLE` / `SEC_ROLE_MAPPING` / `SEC_OBJ` / `SEC_PERM` / `SEC_ROLEGROUP_MAPPING` (TB_MCM_ prefix 없음). To-Be 적용 시 `MCMAPUSER.TB_MCM_SEC_*` 그대로 보존.
>
> **§9.1 본 화면 5 테이블 매핑 + §9.4 전수 컬럼 카탈로그**: §9.1 은 As-Is Mapper 사용 컬럼만 등재, §9.4 는 5 테이블 모든 실 컬럼 1:1 전수.

#### §9.4.1 SEC_ROLE (역할그룹정보 — 본 화면 주 테이블) — TB_MCM_SEC_ROLE / 26 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할ID | ROLE_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.1 #1 |
| 2 | 역할 명 | ROLE_NM | VARCHAR | 100 |  | NOT NULL | - | G-002 / D-002 / D-005 |
| 3 | 역할 설명 | ROLE_DESC | VARCHAR | 300 |  | NULL | - | G-003 / D-006 |
| 4 | 부모 역할ID | PARENT_ROLE_ID | VARCHAR | 30 |  | NULL | - | (As-Is 본 화면 미사용 — 부모역할 부여 화면 정본) |
| 5 | 메뉴ID | MENU_ID | VARCHAR | 30 |  | NULL | - | D-003 cbo_folder / FK → TB_MCM_SEC_MENU_FLD |
| 6 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | ~~S-001 / D-001~~ **(As-Is) → To-Be 본 화면 UI/SQL 일괄 미사용 (정책 #1). 테이블 컬럼은 DDL 보존 (다른 화면 / 운영 관점 유지)** |
| 7 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | S-004 / G-007 / D-007 |
| 8 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | (As-Is 본 화면 미사용 — 표시 ✗) |
| 9 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | (As-Is 본 화면 미사용) |
| 10~26 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (§9.6.1 동일) | - |  | NULL | - | cactus-core 자동 처리 (§11 #9) |

#### §9.4.2 SEC_ROLE_MAPPING (역할별퍼미션 — 본 화면 매핑 테이블) — TB_MCM_SEC_ROLE_MAPPING / 20 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할ID | ROLE_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.1 #2 (복합 PK) — ds_roleMap.ROLE_ID |
| 2 | Object ID | OBJECT_ID | VARCHAR | 50 | (PK 후보) | NOT NULL | - | §9.1 #2 (복합 PK) — ds_roleMap.OBJECT_ID |
| 3 | 퍼미션ID | PERMISSION_ID | VARCHAR | 100 | (PK 후보) | NOT NULL | - | §9.1 #2 (복합 PK) — ds_roleMap.PERMISSION_ID |
| 4~20 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

#### §9.4.3 SEC_OBJ (프로그램정보 — 본 화면 read-only JOIN) — TB_MCM_SEC_OBJ / 31 컬럼

> 본 화면은 read-only JOIN (selectCommRoleMapList xml:102) 및 selectMenuObjPop (xml:167). OBJECT_ID 만 사용. 전수 컬럼은 commObjMng §9.6.1 (31 컬럼) 참조 — 중복 표 생략.

| 본 화면 사용 컬럼 | 출현 위치 | 비고 |
|---|---|---|
| OBJECT_ID | xml:102 / xml:167 / xml:168 (USE_TP='Y' WHERE) | §9.1 #3 — 복합 PK FK |
| OBJECT_NM | (P-001 OBJECT 후보 조회 — selectMenuObjPop xml:167) | LOV 표시 |
| 기타 28 컬럼 | (본 화면 미사용 — commObjMng 정본 §9.6.1 참조) | - |

#### §9.4.4 SEC_PERM (퍼미션정보 — 본 화면 read-only JOIN) — TB_MCM_SEC_PERM / 29 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 권한 ID | PERMISSION_ID | VARCHAR | 100 | PK | NOT NULL | - | §9.1 #4 / ST-004 |
| 2 | 권한 Name | PERMISSION_NM | VARCHAR | 100 |  | NULL | - | selectCommRoleMapList JOIN |
| 3 | 권한 설명 | PERMISSION_DESC | VARCHAR | 300 |  | NULL | - | (본 화면 미사용 — commPermMng 정본) |
| 4 | 공통 권한 | PERMISSION_COMMON | VARCHAR | 500 |  | NULL | - | (본 화면 미사용) |
| 5 | 커스텀 권한 | PERMISSION_CUSTOM | VARCHAR | 500 |  | NULL | - | (본 화면 미사용) |
| 6 | Popup 버튼 | POPUP_BTN | VARCHAR | 1000 |  | NULL | - | (본 화면 미사용) |
| 7 | ACTION 권한 | PERMISSION_ACTION | VARCHAR | 500 |  | NULL | - | (본 화면 미사용) |
| 8 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | (본 화면 미사용 — selectCommPerm WHERE 조건 후보) **정책 #1: To-Be 본 화면 SQL 에서 일괄 미참조** |
| 9 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | ST-004 (USE_TP='Y' WHERE) |
| 10 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | (본 화면 미사용) |
| 11 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | (본 화면 미사용) |
| 12~28 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |
| 29 | 권한그룹 | PERMISSION_GROUP | VARCHAR | 100 |  | NULL | - | (본 화면 미사용 — commPermMng 정본) |

#### §9.4.5 SEC_ROLEGROUP_MAPPING (사용자그룹별 역할 정보 — 본 화면 참조 무결성 검증) — TB_MCM_SEC_ROLEGROUP_MAPPING / 19 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.1 #5 (FK 후보) |
| 2 | 역할ID | ROLE_ID | VARCHAR | 30 | (PK 후보) | NOT NULL | - | §9.1 #5 (selectCommRole 서브쿼리 + deleteCommRole NOT EXISTS) |
| 3~19 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

> **§9.4 카탈로그 합계**: 26 + 20 + 31 + 29 + 19 = **125 컬럼 등재** (SEC_OBJ 31 컬럼은 commObjMng §9.6.1 참조로 중복 생략 가능 — 본 표 합계는 31 포함 125).

### §9.2 상태값 ST-NNN

> 본 화면의 표시 영향 enum 컬럼 + workType/플래그 후보.

| ID (ST-NNN) | As-Is 컬럼 | As-Is 값 | As-Is 의미 | To-Be 상태코드 | 단순 표시 / 동작 제어 | 영향 영역 | 근거 |
|---|---|---|---|---|---|---|---|
| ST-001 | TB_MCM_SEC_ROLE.USE_TP | "Y" | 사용 (Active 역할) | useTpY | 표시 (G-007 사용구분 콤보 / S-004 / D-007) + 그리드 조회 조건 분기 | S-004 / G-007 / D-007 | xfdl:1031~1033 / xml:29 |
| ST-002 | TB_MCM_SEC_ROLE.USE_TP | "N" | 미사용 (Inactive 역할) | useTpN | 표시 + 그리드 조회 조건 분기 | S-004 / G-007 / D-007 | xfdl:1034~1037 / xml:29 |
| ST-003 | ds_main.STATUS (행상태 이미지) | (Inserted/Updated/Deleted 의 image control) | CRUD 행상태 (저장 전 표시) | rowStatus | G-001 그리드 좌측 이미지 | G-001 | xfdl:172 |
| ST-004 | TB_MCM_SEC_PERM.USE_TP | "Y" | 사용 (Active 권한 후보만 조회) | permUseTpY | searchCmPerm 의 필터 (`A.USE_TP = 'Y'`) | (서버 분기 — 화면 표시 영향 ✗) | xml:150 |
| ST-005 | TB_MCM_SEC_OBJ.USE_TP | "Y" | 사용 (Active OBJECT 만 조회) | objUseTpY | selectMenuObjPop 의 필터 (`WHERE USE_TP = 'Y'`) | (서버 분기 — P-001 OBJECT 후보) | xml:168 |

### §9.3 코드값/LoV LV-NNN

| ID (LV-NNN) | 코드 그룹 | As-Is 데이터셋 | As-Is 값 | To-Be 코드 | 사용 위치 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | BIZ SYSTEM 코드 | `ds_lovSubSystem` (APP_HOST_ID) | (lov 서비스로 `ds_selectAppHostId` 동적 조회 — `CommObjMngMapper.selectAppHostId`) | bizSystemCode | S-001 cbo_bizSystemCode / D-001 cbo_bizsystem | xfdl:1012~1016 / bpmn:158 |
| LV-002 | MENU ID 코드 (BIZ_SYSTEM 종속) | `ds_lovMenuId` (MENU_ID / BIZ_SYSTEM_CODE / MENU_ID_NM) | (lov 서비스로 `ds_selectMenuId` 동적 조회 — `CommObjMngMapper.selectMenuId`) | menuId | D-003 cbo_folder (BIZ SYSTEM 종속 필터, xfdl:918~924) | xfdl:1017~1023 / bpmn:174 |
| LV-003 | 사용여부 코드 | `ds_useTp` (CD / NM, 정적) | Y/사용, N/미사용 | useTp | S-004 cbo_USE_TP / G-007 사용구분 콤보 / D-007 (Radio) | xfdl:1024~1040 |

---

## §10. xfdl Script 본문 분석 (이벤트 / 핸들러 / Validation)

> §4.8 의 38 메서드 매트릭스를 기반으로 비즈니스 핵심 로직 / Validation / 부수효과를 표 컬럼 분해.

### §10.1 Validation 매트릭스 (V-NNN)

| ID | 위치 | 조건 | 에러 메시지 | 차단 / 비차단 | 근거 |
|---|---|---|---|---|---|
| V-001 | `fn_appendRoleMapRow` (xfdl:577~580) | `gfn_isNull(vRoleId)` (ROLE_ID 미선택) | "선택된 ROLE ID가 없습니다." (warning) | 차단 (return) | xfdl:577~580 |
| V-002 | `fn_appendRoleMapRow` (xfdl:583~586) | `gfn_isNull(vObjId)` (OBJECT ID 미입력) | "OBJECT ID 입력 후 추가해 주세요." (warning) | 차단 (return) | xfdl:583~586 |
| V-003 | `fn_rowDelete` (xfdl:716~718) | `roleGrpId != null` (역할그룹 매핑 존재) | "연결된 [역할그룹] 이 존재합니다. 제외 후 삭제 하세요" (warning) | 차단 (return) | xfdl:716~718 |
| V-004 | `fn_rowDelete` (xfdl:719~721) | `ds_roleMap.rowcount > 0` (현재 권한 존재) | "연결된 [권한] 이 존재합니다. 제외 후 삭제 하세요" (warning) | 차단 (return) | xfdl:719~721 |
| V-005 | `fn_before_save_chk` (xfdl:678~684) | `!gfn_isDatasetChanged(ds_main)` (변경 없음) | "저장할 데이터가 없습니다." (information) → return false | 차단 | xfdl:678~684 |
| V-006 | `fn_before_save_chk` (xfdl:680) | `gfn_cpRequired(this, "ROLE_ID")` (ROLE_ID 필수 검증 — gfn 공통) | (gfn 공통 메시지) | 차단 | xfdl:680 |
| V-007 | `fn_rowCopy` (xfdl:700~703) | `ds_main.rowposition < 0` (선택 행 없음) | "선택 행이 없습니다." (warning) | 차단 (return) | xfdl:700~703 |
| V-008 | `fn_openMenu` (xfdl:853~857) | `nRow == -1` (메뉴 부재) | "메뉴가 존재하지 않습니다." (warning) | 차단 (return false) | xfdl:853~857 |

### §10.2 부수효과 / 후속 동작

| # | 트리거 | 부수효과 | 근거 |
|---:|---|---|---|
| 1 | saveCmRole 콜백 성공 | `fn_search()` 재호출 (목록 갱신) | xfdl:472~477 |
| 2 | saveCmRoleMap 콜백 성공 | `fn_run("searchCmRoleMap")` + `fn_run("searchCmPerm")` 재호출 (양쪽 그리드 갱신) | xfdl:504~511 |
| 3 | searchCmRoleMap 콜백 성공 | ds_roleMap 각 행 PERMISSION_ID_UPPER 컬럼 계산 (대문자 변환) + edt_permfilter2_onkeyup 호출 (필터 재적용) | xfdl:489~497 |
| 4 | searchCmPerm 콜백 성공 | ds_perm 각 행 PERMISSION_ID_UPPER 컬럼 계산 + edt_permfilter_onkeyup 호출 | xfdl:520~528 |
| 5 | ds_main onrowposchanged | sub1/sub2 헤드 CHK=0 초기화 + `fn_run("searchCmRoleMap")` + `fn_run("searchCmPerm")` 자동 호출 (rowType != 2 시) | xfdl:740~770 |
| 6 | ds_main oncolumnchanged (MENU_ID / ID) | ROLE_ID 자동 합성 (`"role_"+MENU_ID+"_"+ID`) | xfdl:906~916 |
| 7 | ~~D-001 cbo_bizsystem onitemchanged~~ | ~~ds_lovMenuId 필터 (`BIZ_SYSTEM_CODE == '{값}'`) — D-003 cbo_folder 후보 동적 갱신~~ **To-Be 제거 (정책 #1 — BIZ_SYSTEM_CODE 일괄 폐기. D-003 ds_lovMenuId 는 단일 LoV)** | xfdl:918~924 (As-Is 인용만) |
| 8 | sub1/sub2 edt_permfilter onkeyup | ds_roleMap / ds_perm 에 `PERMISSION_ID_UPPER.indexOf('{대문자값}')>-1` 필터 (LIKE 대소문자 무시) | xfdl:927~954 |

---

## §11. To-Be 변환점 (As-Is Oracle → To-Be MSSQL sample_dmes — 핵심 결정 사항)

| # | 영역 | As-Is (Oracle / xfdl / mui) | To-Be (MSSQL sample_dmes / cactus-core / React) | 변환 규칙 / 이전 ✗ 결정 사유 | 근거 |
|---:|---|---|---|---|---|
| 1 | DB 스키마 | Oracle TB_MCM_SEC_* (스키마 미명시 — As-Is xml 본문) | MSSQL `sample_dmes` 스키마 (`mcm` 모듈 ↔ `mcm` 패키지 root 의 entity) | DMES 마이그레이션 시 스키마 통합 (사용자 결정 — `project_mcm_cma_dev_complete.md` 참조) | xml:21 등 |
| 2 | 문자열 결합 | `'%' \|\| #{X} \|\| '%'` (Oracle `\|\|`) | `'%' + #{X} + '%'` (MSSQL `+`) | MSSQL 문법 변환 강제 | xml:24~33 |
| 3 | 대소문자 함수 | `UPPER(...)` (양쪽 동일) | `UPPER(...)` (양쪽 동일 — 변환 ✗) | 양쪽 동일 — 변환 불필요 | xml:24~31 |
| 4 | NULL 행 제한 | `ROWNUM = 1` (Oracle) | `TOP 1` 또는 `OFFSET 0 ROWS FETCH NEXT 1 ROW ONLY` (MSSQL) | scalar subquery 의 행 제한 변환 | xml:18 |
| 5 | 문자열 추출 | `SUBSTR(A.ROLE_ID, INSTR(A.ROLE_ID,'_',-1,1)+1, LENGTH(A.ROLE_ID))` (Oracle 마지막 `_` 이후) | `SUBSTRING(A.ROLE_ID, LEN(A.ROLE_ID) - CHARINDEX('_', REVERSE(A.ROLE_ID)) + 2, LEN(A.ROLE_ID))` (MSSQL) | INSTR/LENGTH → CHARINDEX(REVERSE())/LEN 변환 | xml:20 |
| 6 | 날짜 변환 | `TO_DATE(SUBSTR(#{X}, 1, 14), 'YYYYMMDDhh24miss')` | `TRY_CAST(LEFT(#{X}, 14) AS DATETIME2)` 또는 `CONVERT(DATETIME2, LEFT(#{X}, 14), 112)` | Oracle TO_DATE → MSSQL CONVERT/TRY_CAST | xml:58~59 / 70~71 |
| 7 | Outer join | (본 화면 사용 ✗) | - | 본 화면 미사용 | - |
| 8 | DUAL 테이블 | (본 화면 사용 ✗) | - | 본 화면 미사용 | - |
| 9 | ref_Audit 매퍼 fragment | `<include refid="ref_Audit.update / insert_item / insert_value">` 6 회 (xml:49/60/72/117/123) | **폐기** — cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 가 9 컬럼 자동 채움 (CREATE_USER / CREATE_DATE / UPDATE_USER / UPDATE_DATE 등) | sec 그룹 cactus-core 적용 결정 (사용자 결정 — `project_cma_mcm_core_migration.md` 참조 / `feedback_q_resolution_propagation.md` 적용) | xml:49 / 60 / 72 / 117 / 123 |
| 10 | 미호출 SQL 2 종 | `updateCommRoleMap` (no-op) + `selectCommPntRoleMapPop` (본문 절반 주석) | **이전 ✗** — Mapper 에서 제거 | As-Is 미호출 → 이전 ✗ (마이그레이션 표준) | xml:127~130 / 175~214 |
| 11 | 미호출 BPMN flow 2 종 | `searchCmRoleMapPnt` (xfdl 주석) + `pntRoleIdPop` (xfdl 주석) | **이전 ✗** — sequenceFlow + Task_0f9lt7e + Task_1sm19m8 제거 | As-Is 미호출 → 이전 ✗ | xfdl:432~444 / 544~546 / bpmn:118~149 |
| 12 | 역할-권한 모델 (TB_MCM_SEC_ROLE_MAPPING) | PK = ROLE_ID + OBJECT_ID + PERMISSION_ID 복합. 삭제는 PK 단위 / 추가는 PK 단위 (ds_roleMap addRow + insertCommRoleMap) | To-Be Entity = `@IdClass(RolePermissionMappingId.class)` + JPA composite PK. Repository 는 `saveAll` (insert) + `deleteByRoleIdAndObjectIdAndPermissionId` (delete) | JPA composite PK 패턴 | xml:114 / 134~136 |
| 13 | Form id ↔ 화면명 비일관 | xfdl Form id=`CommRoleMng` / bpmn process name="부모역할 부여 조회" (Q-012) | To-Be process name = "역할 관리" 로 정정 | As-Is process name 은 다른 화면 이름이 잘못 복붙된 상태 (Q-012) → 정정 | bpmn:3 |
| 14 | D-002 라벨 오타 "역활 ID" | edt_st_roleId.value="역활 ID" (xfdl:243) | To-Be "역할 ID" 로 정정 | As-Is 오타 → 정정 (Q-013) | xfdl:243 |
| 15 | D-005 / D-006 라벨 ↔ 컬럼 매핑 비일관 | "역할명" 라벨 다음 ROLE_NM 바인딩 / "역할 설명" 라벨 다음 ROLE_DESC 바인딩 — 라벨 컨트롤명 (edt_st_roleDesc / edt_st_parentRoleId) 과 의미 비일관 | To-Be 는 라벨 컨트롤명도 의미에 맞게 정정 (edt_st_roleNm / edt_st_roleDesc) | As-Is 1:1 보존 후 To-Be 정정 (Q-014) | xfdl:212 / 214 |
| 16 | 셔틀 cssclass 비일관 | btn_right cssclass=`btn_WF_ShuttleAddH` (실 동작 = 삭제) / btn_left cssclass=`btn_WF_ShuttleDeleteH` (실 동작 = 추가) | To-Be 는 cssclass 명도 의미에 맞게 swap (또는 React 아이콘 컴포넌트로 재설계) | As-Is 1:1 보존 후 To-Be 정정 (Q-008) | xfdl:192~193 |
| 17 | edt_ROLE_ID / edt_ROLE_NM / edt_role_id 등 디폴트 더미 `text="부산역 CY"` | xfdl 시점의 디폴트 텍스트 (개발 잔존) | To-Be 는 빈 문자열 또는 placeholder | As-Is 잔존 더미 (Q-001) | xfdl:20 / 22 / 218 / 238 / 246 |
| 18 | **[정책 #1] BIZ_SYSTEM_CODE / APP_HOST_ID 일괄 폐기** (S-001 / D-001 콤보 + LV-001 + cross-namespace `CommObjMngMapper.selectAppHostId` + Task_0r5ztlq lov_SUBSYSTEM 분기 + selectCommRole.WHERE 분기 + selectCommRoleMapList.WHERE 분기 + ds_main_oncolumnchanged BIZ_SYSTEM 필터링) | 본 화면은 BIZ_SYSTEM_CODE 컬럼·UI·SQL·LoV 전면 사용 | **To-Be 전면 제거** — UI (S-001 / D-001), Mapper SQL (WHERE 2 분기), BPMN Task (Task_0r5ztlq), action enum (lov 단일 잔존 — Task_17ggria MENU_ID 만), JS 핸들러 (BIZ_SYSTEM 종속 필터 제거) 일괄 정리 | 정책 #1 사용자 결정 (Q-001/003/006/010 신규 미반영 + Q-005 자동 해소 + Q-008/012/013/014 To-Be 정정) | (정책 #1 일괄) |
| 19 | **[정책 #6 (A)] Entity 명명 — cactus-core sec 모델 잔존 (SecRole / SecRoleMapping) 보존 적용** | mcm-core 의 `Sec*` legacy entity 부분 등재 (cma 4 화면 마이그레이션 시 보존 결정 — `project_cma_mcm_core_migration.md`) | **본 화면 BE Entity 명명** = `SecRole` (TB_MCM_SEC_ROLE 매핑) / `SecRoleMapping` (TB_MCM_SEC_ROLE_MAPPING 매핑, `@IdClass(SecRoleMappingId.class)` 복합 PK). Repository = `SecRoleRepository` / `SecRoleMappingRepository`. Service / DTO 는 `mcm.csa.commRoleMng.*` 패키지 (가이드 §3-1 / §6-A-1 / §7-1 — 모듈 직속 Entity/Repository 룰) | cactus-core sec 모델 잔존 보존 (사용자 결정) — cma 마이그레이션 정합 | (사용자 결정 — `project_cma_mcm_core_migration.md`) |
| 20 | **[정책 #4 / Q-011] no-op `updateCommRoleMap` SELECT 'X' FROM DUAL 행 일괄 제거** | As-Is Mapper xml:127~130 본문이 SELECT — 실 UPDATE 동작 없음 / ds_roleMap rowType=4 행 발생 ✗ | **To-Be 제거** — Task_0weig4p 의 updateSqlKey property 자체 삭제 + Mapper 본문 제거. JPA `saveAll` 이 INSERT-only / DELETE-only 행을 자연 처리 (UI 자연 흡수 — Q-011 해소) | UI 자연 흡수 정책 (사용자 결정) | xml:127~130 |
| 21 | **[Q-012 해소] BPMN process name 정정** | As-Is bpmn:3 `name="부모역할 부여 조회"` (다른 화면명 복붙 잔존) | **To-Be `name="역할 관리"`** + process id `commRoleMng` (camelCase) | To-Be 정정 (Q-012 해소) | bpmn:3 |
| 22 | **[Q-013 해소] D-002 라벨 정정** | As-Is xfdl:243 `edt_st_roleId.value="역활 ID"` (오타 "역활") | **To-Be "역할 ID"** | To-Be 정정 (Q-013 해소) | xfdl:243 |
| 23 | **[Q-014 해소] D-005/D-006 라벨 컨트롤명 정정** | As-Is `edt_st_roleDesc` (실은 ROLE_NM) / `edt_st_parentRoleId` (실은 ROLE_DESC) | **To-Be `edt_st_roleNm` / `edt_st_roleDesc`** (의미 정합) | To-Be 정정 (Q-014 해소) | xfdl:212 / 214 / 218 / 238 |
| 24 | **[Q-008 해소] 셔틀 cssclass swap** | As-Is btn_right `btn_WF_ShuttleAddH` (실 삭제) / btn_left `btn_WF_ShuttleDeleteH` (실 추가) | **To-Be swap**: btn_right `btn_WF_ShuttleDeleteH` / btn_left `btn_WF_ShuttleAddH` (의미 정합) | To-Be 정정 (Q-008 해소) | xfdl:192~193 |
| 25 | **[Q-007 해소 / UI 자연 흡수] D-007 RadioGroup** | As-Is Radio (5 enum 외) | **To-Be React RadioGroup 컴포넌트로 자연 흡수** (Y/사용, N/미사용 2옵션 정적) — 디자인 §5 RadioGroup 정본 | UI 자연 흡수 (Q-007 해소) | xfdl:219~236 |
| 26 | **[Q-009 해소 / UI 자연 흡수] commonLeftButton 3 버튼** | As-Is chk_check / btn_sum / btn_copyPaste — 본 화면 핸들러 ✗ (외부 commonLeftButton 자동 처리) | **To-Be React 공통 컴포넌트 (ToolbarButtons leftMenu)로 자연 흡수** — 본 화면 별도 핸들러 없음 | UI 자연 흡수 (Q-009 해소) | xfdl:294 |
| 27 | **[Q-015 해소 / UI 자연 흡수] BPMN dao="" — oasis ScriptTask 표준 채택** | As-Is `dao=""` + `isServiceResult=true` 의 mui 외부 lib default 동작 단정 ✗ | **To-Be ksm cactus-core oasis 패키지 표준** (`OasisServiceExecutor` + `MyBatisSqlRunner` 재설계 — `isServiceResult` 미사용 / dao property 삭제) — 가이드 §6-C/D/E + §7-A/B | UI 자연 흡수 (Q-015 해소 / 가이드 정본) | bpmn:37 등 |
| 28 | **[Q-016 해소 / UI 자연 흡수] ds_roleMap setRowType normalize** | As-Is xfdl:494 `setRowType(i, ROWTYPE_NORMAL)` 강제 (조회 후 NORMAL 일괄) | **To-Be React state (`rowStatus`) 로 자연 흡수** — `useGridDataManager` 의 normalize 자동 처리 | UI 자연 흡수 (Q-016 해소) | xfdl:494 / 525 |
| 29 | **[Service 레이어 책임 / Q-004] OBJECT_ID 중복 검증** | As-Is xfdl:246 `edt_object_id_canchange` 핸들러 본문 ✗ (canchange 트리거명만) — JS 본문 없음 | **To-Be Service 레이어 책임** = `saveCmRoleMap` insert 분기 진입 시 `MccsRolePermissionMappingRepository.existsById(...)` 중복 PK 체크 → 중복 시 422 BUSINESS_RULE_VIOLATION. 화면 JS 검증 ✗ | Service 레이어 책임 (Q-004 해소) | xfdl:246 |
| 30 | **[Q-001/003/006/010 신규 미반영 정책] As-Is 동작 ✗ + 인용만** | 디폴트 더미 "부산역 CY" (Q-001) / S-004 빈 핸들러 (Q-003) / D-004 빈 핸들러 (Q-006) / fn_linkCommMenu 주석 처리 (Q-010) — As-Is 실제 동작 없음 | **To-Be 미반영** — As-Is xml/xfdl 인용은 1:1 보존 (분석리포트 §3.2 / §3.5 / §4.8 / §5 에 As-Is 인용만 명시). To-Be 구현 시 신규 추가 ✗ | 신규 미반영 (정책 — As-Is 동작 없음) | (정책 일괄) |

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 미결정 = **0 건**. 결정 내용은 §3 / §6 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **As-Is / To-Be 표준 우선 원칙** | 정책 #4 (0) — As-Is 위반 항목은 자동 As-Is 1:1 보존 + To-Be 결정은 §11 변환점에 명시 (메인 자동 / `feedback_decision_delegation.md` 정합) | §0 / §11 전 행 |
| **BIZ_SYSTEM_CODE 폐기 (정책 #1, Q-005 자동 해소)** | S-001 cbo_bizSystemCode 콤보 + D-001 cbo_bizsystem + G-006 BIZ_SYSTEM_CODE + LV-001 ds_lovSubSystem + cross-namespace `CommObjMngMapper.selectAppHostId` + BPMN Task_0r5ztlq (lov_SUBSYSTEM 분기) + selectCommRole/selectCommRoleMapList 의 WHERE 분기 + ds_main_oncolumnchanged BIZ_SYSTEM 필터링 일괄 폐기 | §3.2 (S-001) / §3.3 (G-006) / §3.5 (D-001 / D-003) / §6 #5/#10 / §8 Task_0r5ztlq / §9.3 LV-001 / §10 fn_lov / §11 #18 |
| **디폴트 텍스트 "부산역 CY" (Q-001)** | xfdl 7곳 디자인 더미 ("부산역 CY") — 의미 무관 잔존. To-Be 미반영 (신규 placeholder/빈 문자열 — 신규 미반영 정책) | §3.2 (S-002/S-003) / §3.5 (D-002 등) / §11 #17 |
| **xfdl 핸들러 본문 미정의 (Q-003 / Q-004 / Q-006)** | As-Is `div_search_cbo_USE_TP_onitemchanged` (S-004) / `edt_object_id_canchange` (D-002) / `edt_id_onchanged` (D-004) 핸들러명 등록만 / 본문 정의 ✗. To-Be 미반영 (신규 핸들러 추가 ✗) — Q-004 D-002 ROLE_ID 자동 합성은 Service 레이어 `existsById(...)` 중복 체크 + 422 BUSINESS_RULE_VIOLATION 으로 흡수 | §3.2 (S-004) / §3.5 (D-002 / D-004) / §11 #29 #30 |
| **D-007 Radio Y/N (Q-007)** | As-Is Radio (5 enum 외) → To-Be React RadioGroup 컴포넌트로 자연 흡수 (Y/사용, N/미사용 2옵션 정적). 디자인 §5 RadioGroup 정본 (03 §A.9-3 등재) | §3.5 (D-007) / §11 #25 |
| **셔틀 cssclass 정정 (Q-008)** | As-Is btn_right cssclass=`btn_WF_ShuttleAddH` (실 동작=삭제) / btn_left cssclass=`btn_WF_ShuttleDeleteH` (실 동작=추가) → **To-Be swap 정정** btn_right=`btn_WF_ShuttleDeleteH` (Delete) / btn_left=`btn_WF_ShuttleAddH` (Add) — 의미 정합 | §3.6 (BS-001 / BS-002) / §11 #16 #24 |
| **commonLeftButton (Q-009)** | As-Is chk_check / btn_sum / btn_copyPaste — 본 화면 핸들러 ✗ (외부 commonLeftButton 자동 처리). To-Be React 공통 컴포넌트 (`ToolbarButtons leftMenu`) 로 자연 흡수 | §4.2 (B-005~007) / §11 #26 |
| **fn_linkCommMenu / fn_openMenu 주석 처리 (Q-010)** | As-Is xfdl:289/307 사용자정의 array 주석 처리 + xfdl:842~860 본문 정의만 있고 실 호출 ✗. P-002 외부 화면 이동은 To-Be 미반영 (신규 라우팅 추가 ✗) | §5 (P-002) / §11 #30 |
| **updateCommRoleMap no-op (Q-011)** | As-Is Mapper xml:127~130 본문이 `SELECT 'X' FROM DUAL` 행 — 실 UPDATE 동작 없음 / ds_roleMap rowType=4 발생 ✗. To-Be Mapper SQL 폐기 + BPMN Task_0weig4p updateSqlKey property 자체 삭제. JPA `SecRoleMappingRepository.saveAll(...)` 이 INSERT-only / DELETE-only 행을 자연 처리 | §6 #9 / §8 Task_0weig4p / §11 #20 |
| **BPMN process name 정정 (Q-012)** | As-Is bpmn:3 `name="부모역할 부여 조회"` (다른 화면명 복붙 잔존) + process id `CommRoleMng` → **To-Be `name="역할 관리"` + process id `commRoleMng` (camelCase)** | §8 / §11 #13 #21 / BPMN |
| **D-002 라벨 "역활 ID" 정정 (Q-013)** | As-Is xfdl:243 `edt_st_roleId.value="역활 ID"` (오타 "역활") → **To-Be "역할 ID"** | §3.5 (D-002) / §11 #14 #22 |
| **D-005 / D-006 라벨 ↔ 컬럼 매핑 정정 (Q-014)** | As-Is 라벨 컨트롤명 `edt_st_roleDesc` (실은 ROLE_NM 라벨) / `edt_st_parentRoleId` (실은 ROLE_DESC 라벨) — 의미 비일관 → **To-Be `edt_st_roleNm` / `edt_st_roleDesc`** (라벨↔컬럼↔컨트롤 id 의미 정합) | §3.5 (D-005 / D-006) / §11 #15 #23 |
| **BPMN dao="" + isServiceResult 의도 (Q-015)** | As-Is `dao=""` + `isServiceResult=true` 의 mui 외부 lib default 동작 단정 ✗. → **To-Be ksm cactus-core oasis 패키지 표준** (`OasisServiceExecutor` + `MyBatisSqlRunner` 재설계 — `isServiceResult` 미사용 / dao property 삭제). 가이드 §6-C/D/E + §7-A/B 정본 | §8 / §11 #27 / BPMN |
| **setRowType normalize (Q-016)** | As-Is xfdl:494 `setRowType(i, ROWTYPE_NORMAL)` 강제 (조회 후 NORMAL 일괄). → **To-Be React state `rowStatus` 흡수** — `useGridDataManager` 의 normalize 자동 처리 | §10 / §11 #28 |
| **fn_msgSuccessSave this 컨텍스트 (Q-017)** | As-Is `showModal` 4번째 인자 `this` 가 callback owner 로 전달 → 본 form `fn_search` 호출 정합. As-Is 동작 정상 (libUtil.xjs:1693 / 1771). To-Be React 에서는 setState/closure 패턴으로 명시 처리 | §10 |
| **audit (cactus-core 정본)** | As-Is `ref_Audit` fragment 6 회 호출 (xml:49/60/72/117/123) → **To-Be 폐기** — cactus-core `McmAuditEntity` 상속 (정확히는 `CactusAuditEntity` 9 컬럼 — `C_*`/`U_*` 8 + `VER` 1) + JPA `@PrePersist` / `@PreUpdate` 자동 채움 | §9 / §11 #9 |
| **Entity 명명 (정책 #6 (A))** | mcm-core 의 `Sec*` legacy entity 잔존 보존 (cma 4 화면 마이그레이션 시 결정 — `project_cma_mcm_core_migration.md`). **본 화면 BE Entity = `SecRole` (TB_MCM_SEC_ROLE) / `SecRoleMapping` (TB_MCM_SEC_ROLE_MAPPING, `@IdClass(SecRoleMappingId.class)` 복합 PK)**. Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 모듈 직속 (가이드 §3-1 / §6-A-1 / §7-1 정본). Service / DTO = `com.dongkuk.dmes.mcm.csa.commRoleMng.{service,dto}.*` | §11 #19 / §11.1 |
| **스키마 / 테이블명 (정책 #1 (6)(7))** | As-Is TB_MCM_SEC_* (스키마 미명시) → **To-Be `MCMAPUSER.TB_MCM_SEC_*` (대문자 보존 + schema=MCMAPUSER)**. MSSQL `sample_dmes` 환경 통합 (사용자 결정 — `project_mcm_cma_dev_complete.md`) | §9.1 / §11 #1 / §11.1 |

---

## §12-A. 외부 자료 호출 깊이 D1~D5 추적 (참고)

| 깊이 | 자원 | 본 화면 호출 / 호출 위치 | 비고 | 근거 |
|---|---|---|---|---|
| D1 | `CommRoleMng.xfdl` (본 화면 UI/Script) | (본 화면) | 1054 line | xfdl:1~1054 |
| D1 | `CommRoleMngMapper.xml` (본 화면 Mapper) | `fn_run` 의 sUrl=`csa::CommRoleMng` 매핑 | 11 SQL | xml:5 |
| D1 | `CommRoleMng.bpmn` (본 화면 BPMN) | `gfn_transaction` 호출 시 BPMN 분기 | 9 Task + 8 sequenceFlow.name | bpmn:1~348 |
| D2 | `_com_div::commonTopButton.xfdl` (외부 공통 div) | div_title.div_topMenu (xfdl:10) + fn_commonTop_onload (xfdl:285) | btn_search/btn_reset/btn_save/btn_close 등록 | xfdl:10 / 285 |
| D2 | `_com_div::commonLeftButton.xfdl` | div_mainGrd.div_leftMenu (xfdl:141) + fn_commonLeft_onload (xfdl:291) | chk_check/btn_sum/btn_copyPaste 등록 | xfdl:141 / 291 |
| D2 | `_com_div::commonRightButton.xfdl` | div_mainGrd.div_rightMenu (xfdl:185) + div_subGrd2.div_rightMenu (xfdl:131) + fn_commonRight_onload 2회 (xfdl:297 / 303) | rowAdd/Delete/Copy/Cancel 등록 + btn_permSearch 등록 | xfdl:131 / 185 / 297 / 303 |
| D2 | `_com_div::commonBottomStatus.xfdl` | div_bottom (xfdl:256) + fn_commonBottomStatus_msg 호출 (xfdl:456 등 8 회) | 하단 상태 메시지 | xfdl:256 / 456 |
| D2 | `_com_div::commonDynamic.xfdl` | div_object_id (xfdl:129) + commonDynamic_onload 호출 (xfdl:321) | OBJECT 조회 팝업 | xfdl:129 / 321 |
| D3 | `csa::CommMenuMng.xfdl` + `CommMenuMngMapper.xml` (commonList SQL) | commonDynamic 의 sUrl 인자 (xfdl:325) → P-001 OBJECT 조회 시 commonList 서비스 호출 | (외부 화면 — 본 분석 범위 외) | xfdl:325 |
| D3 | `csa::CommObjMng.xfdl` + `CommObjMngMapper.xml` (selectAppHostId / selectMenuId) | `fn_lov` (xfdl:349) → BPMN lov 분기 → Task_0r5ztlq + Task_17ggria (bpmn:158 / 174) | 본 화면 lov 핵심 의존 — selectAppHostId / selectMenuId 외부 Mapper 직접 호출 (정책 #1 Task_0r5ztlq 폐기 — selectAppHostId cross-namespace 호출도 제거) | xfdl:349 / bpmn:158 / 174 |
| D3 | `csa/csa::CommObjMng` (메뉴 이동 — fn_linkCommMenu) | xfdl:842~846 (As-Is 주석 — 실 호출 ✗) | (외부 화면 이동 — As-Is 미호출, Q-010 closed) | xfdl:842 |
| D4+ | (D3 의 외부 Mapper 가 호출하는 SP / 함수) | - | (본 분석 범위 외 — Q 잔존) | - |

---

## §13. 확인필요 항목 (Q-NNN)

> **활성 Q = 0**. 분석 단계에서 식별된 17 항 (Q-001 ~ Q-017) 전수 해소. 결정 내용은 §12 결정 누적표 + §11 To-Be 변환점 본문에 통합 (가이드 §0.1.6 "물리 제거" 원칙 — 해소된 Q-NNN 행 보존 ✗). 신규 확인필요 발생 시 본 절에 Q-018 부터 재등재.

---

## §14. 커버리지 매트릭스

| 분석 원천 | 발견 수 | 반영 수 (§3~§9) | 확인필요 수 (§13) | 자연 제외 수 | 합계 일치 |
|---|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 4 (As-Is) / 3 (To-Be — S-001 제거 / 정책 #1) | 4 (S-001~S-004 — S-001 As-Is 인용만) | 0 | 1 (To-Be 제외: S-001 cbo_bizSystemCode) | ✓ |
| 메인 그리드 컬럼 (G-NNN) | 9 | 9 (G-001~G-009) | 0 | 0 | ✓ |
| 확장 그리드 컬럼 (GE-NNN) | 17 | 17 (GE-001~GE-017) | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | 9 (As-Is) / 8 (To-Be — D-001 제거 / 정책 #1) | 9 (D-001~D-009 — D-001 As-Is 인용만) | 0 | 1 (To-Be 제외: D-001 cbo_bizsystem) | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | 0 | ✓ (해당 없음 — 본 화면 L 부재) |
| 버튼 (B-NNN + BS-NNN) | 15 (B-001~B-013 + BS-001~BS-002) | 15 | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | 0 | ✓ (해당 없음) |
| 팝업 (P-NNN) | 2 | 2 (P-001 OBJECT 조회 + P-002 외부 화면 As-Is 미호출) | 1 (Q-010 — P-002 호출 ✗) | 0 | ✓ |
| 상태값 (ST-NNN) | 5 | 5 (ST-001~ST-005) | 0 | 0 | ✓ |
| LoV (LV-NNN) | 3 | 3 (LV-001~LV-003) | 0 | 0 | ✓ |
| Mapper SQL | 11 | 11 (§6 전수) | 0 | 2 (To-Be 제거: updateCommRoleMap / selectCommPntRoleMapPop) — **추가 To-Be: selectCommRole / selectCommRoleMapList 의 BIZ_SYSTEM_CODE WHERE 분기 제거 (정책 #1)** | ✓ |
| BPMN Task | 9 (As-Is) / 6 (To-Be) | 9 (§7 / §8.1) | 0 | 3 (To-Be 제거: Task_0f9lt7e / Task_1sm19m8 / **Task_0r5ztlq (lov_SUBSYSTEM — 정책 #1)**) | ✓ |
| BPMN SequenceFlow.name (action) | 8 (As-Is) / 6 (To-Be) | 8 (§8.2) | 0 | 2 (To-Be 제거: searchCmRoleMapPnt / pntRoleIdPop). lov 분기는 단일 Task (MENU_ID only) 로 단순화 (정책 #1) | ✓ |
| xfdl Script 메서드 | 38 (§4.8) | 38 | 4 (Q-003~006 핸들러 본문 ✗) | 4 (주석 메서드 잔존) | ✓ |
| Validation (V-NNN) | 8 (§10.1) | 8 (V-001~V-008) | 0 | 0 | ✓ |
| 테이블 | 5 (§9.1) + 125 컬럼 (§9.4 — Q-002 해소) | 5 + 125 | 0 (Q-002 해소 2026-05-30) | 0 | ✓ |

---

## §15. 게이트 G1~G9

| 게이트 | 항목 | 결과 | 사유 |
|---|---|---|---|
| G1 | 환경 제약 §0 명시 | ✓ | R-13 / R-14 미적용 사유 + mui 자산 매핑 명시 |
| G2 | §1 화면 식별자 + frontmatter | ✓ | screenId=commRoleMng / asIsId=CommRoleMng / moduleId=mcm / moduleGroup=csa |
| G3 | §2 자료 인벤토리 5 enum + 추가 자료 등재 | ✓ | 8 행 (xfdl/Java부재/Mapper/BPMN/DMES/ref_Audit/공통include/외부화면호출) |
| G4 | §3 UI 컴포넌트 전수 (S/G/GE/D/B/BS) | ✓ | S=4 / G=9 / GE=17 / D=9 / B=13 / BS=2 — 본 화면 모든 UI 컨트롤 전수 |
| G5 | §4 버튼 + 핸들러 38 메서드 전수 | ✓ | xfdl Script function 전수 (38) + Q-003~006 미정의 핸들러 4 등재 |
| G6 | §5 팝업 + §6 SQL 11 전수 + §7 Java (없음) + §8 BPMN 전수 | ✓ | P=2 + SQL=11 (호출 9 + 미호출 2) + Task=9 (호출 7 + 미호출 2) + Action=8 (호출 6 + 미호출 2) |
| G7 | §9 테이블 5 / ST 5 / LV 3 + §10 Validation 8 | ✓ | 모든 컬럼 단위 등재 |
| G8 | §11 To-Be 변환점 17 + §12 깊이 D1~D3 추적 | ✓ | Oracle → MSSQL 변환점 17 + ref_Audit 폐기 + 미사용 SQL/Task 제거 + 외부 의존 D3 명시. **본 갱신 (2026-05-31) 13 행 추가 (§11 #18~#30) — 정책 #1/#4/#6/Service 레이어/UI 자연 흡수 일괄** |
| G9 | §13 Q-NNN 17 + §14 커버리지 합 일치 + §15 게이트 자체 평가 | ✓ | **Q = 17 / 활성 0 / closed 17** (사전 2건 Q-002 / Q-017 + 본 갱신 15건 Q-001/003/004/005/006/007/008/009/010/011/012/013/014/015/016) + 커버리지 매트릭스 16 행 모두 합 일치 |

---

## §16. 인용 검증 (file:line cite 100%)

본 §0~§15 의 모든 본문 주장은 file:line cite 로 근거. 자체 추론 / 의미 추정 / "주요/대표/등" 표현 모두 부재. As-Is 1:1 보존 — xfdl Form id (`CommRoleMng`) / Mapper namespace (`CommRoleMngMapper`) / BPMN process id (`CommRoleMng`) / BPMN process name (`부모역할 부여 조회` — Q-012) / D-002 라벨 오타 (`역활 ID` — Q-013) / Q-001 디폴트 더미 텍스트 (`부산역 CY`) 등 모두 그대로 보존.

---

## §6.14 Phase 1 종료 자가 점검 (4 질문)

1. **14항 위반?** — 위반 ✗. As-Is 1:1 보존 (xfdl 1054 + Mapper 215 + BPMN 348 전수 Read 인용 유지), cite 100%, 누락 ✗, 분량 회피 ✗. **본 갱신 (2026-05-31) = Q 활성 0 / 17건 전수 closed + §11 To-Be 변환점 13행 추가 (#18~#30)**.
2. **검증 안 한 부분?** — 없음. Q-001/003/006/010 (정책 #1 신규 미반영) / Q-002/017 (사전 closed) / Q-004 (Service 레이어) / Q-005 (정책 #1 자동 해소) / Q-007/009/011/015/016 (UI 자연 흡수) / Q-008/012/013/014 (To-Be 정정) 모두 본문 §3.2 / §3.5 / §3.6 / §6 / §7 / §8 / §11 / §13 정합 일치.
3. **그대로 수용?** — As-Is 인용은 ~~취소선~~ 또는 As-Is 인용만 표기로 1:1 보존 + To-Be 결정은 §11 #18~#30 13행 명시.
4. **임의 합리화?** — 없음. 모든 결정은 6 정책 (정책 #1 / #4 / #6 (A) / Service 레이어 / UI 자연 흡수 / 신규 미반영) 매트릭스 + 사용자 결정 정본 (`project_cma_mcm_core_migration.md` / `project_mcm_csa_cme_design_cycle1.md`).

→ Phase 1 통과 (갱신 2026-05-31 — Q 활성 0).
