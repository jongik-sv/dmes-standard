---
screenId: commMenuMng
asIsId: CommMenuMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 메뉴 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner 의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §D.4 (manifest 9 파일 검증) | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + Java UserTask / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만" 은 mui 환경에 미적용. cite 는 file:line 형식 유지 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 메뉴 관리 |
| 화면 식별자 (screenId) | commMenuMng |
| As-Is 식별자 (asIsId) | CommMenuMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 메뉴 관리 (commMenuMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commMenuMng |
| pageId | commMenuMng |
| serviceId | commMenuMng |
| Frontend 파일명 | `commMenuMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> 메뉴 관리는 CommMenuMng 의 조회, 등록, 수정, 삭제를 수행한다.

- 주 사용자: 시스템 관리자 / 메뉴 권한 운영 담당자
- 업무 도메인: 공통 마스터 (mcm — Master Code Management) 의 시스템관리 (csa) 그룹에서 **포털 메뉴 트리** (`TB_MCM_SEC_MENU_FLD` 폴더) + **메뉴 항목** (`TB_MCM_SEC_MENU` 엔트리) + **연결 OBJECT** (`TB_MCM_SEC_OBJ` FORM/URL/SERVICE/PARAM) 의 통합 등록을 담당한다. 다른 모듈의 모든 화면이 본 화면에서 등록한 메뉴 ↔ OBJECT 연결을 통해 포털에서 호출된다.
- 기능 요약 (BPMN action — To-Be 5 enum, As-Is 6 enum 중 `lov` 폐기 = cross-cutting 정책 #1 BIZ_SYSTEM_CODE 폐기 동기):
  1. `searchCmMenu` — 메뉴 리스트 조회 (`fn_search`, xfdl:461 / `div_main_grd_M0F1_oncellclick` 트리 click 트리거, xfdl:770)
  2. `searchMenuGrp` — 메뉴 폴더 트리 조회 (`fn_formAfterOnload`, xfdl:429)
  3. `saveCmMenu` — 메뉴 리스트 일괄 저장 (MERGE 형 update/insert/delete) (`fn_save` → `fn_MsgSaveCallBack`, xfdl:476 / 644)
  4. `searchObj` — 선택 메뉴의 OBJECT 정보 조회 (`fn_searchObj`, xfdl:758)
  5. `commonList` — OBJECT 팝업 LoV 조회 (commonDynamic.xfdl 동적 LoV, xfdl:385)
  6. ~~`lov` — BIZ SYSTEM CODE LoV 조회 (`fn_lov`, xfdl:418)~~ — **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 자체 폐기. As-Is xfdl:418 fn_lov + bpmn:111~124 Task_1z04i9v + xfdl:415 onload 호출 모두 제거. cross-namespace `CommObjMngMapper.selectAppHostId` 참조도 동시 제거)

---

## §2. 자료 수집 인벤토리 (mui 4 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommMenuMng.xfdl` | 910 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / TextArea / Radio / Calendar / Dataset / BindItem / Script 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask 디렉토리 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommMenuMng/` | - | **N** | csa Java 폴더에 `CommMenuMng/` 서브폴더 부재 (`CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 개만 존재) — **Java UserTask 없음, 전부 ScriptTask** | §7 |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommMenuMngMapper.xml` | 169 | Y | 8 SQL ID (select 6 / insert 1 / update 1 / delete 1) — 7 호출 + 1 미호출 후보 | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommMenuMng.bpmn` | 254 | Y | StartEvent / ExclusiveGateway 6 분기 / Task 6 / EndEvent 1 / SequenceFlow 13 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (XLSX 시트 다수) | Y (참조) | 테이블 정의 참조 — DDL 부재 시 As-Is Mapper.xml 컬럼 출현 위치 + audit cactus-core 9 컬럼 통합 | §9 |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.update / insert_item / insert_value">` 3 회 호출은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | - |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu (btn_search/btn_reset/btn_save/btn_close) | xfdl:6~13 |
| A-FILTER | `Div div_search` | top=div_title:10 / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (BIZ SYSTEM / 메뉴 ID / 메뉴 명 / 사용 유무) | xfdl:14~27 |
| A-FOLD | `Button btn_fold` | top=93 / height=10 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:29 |
| A-MAIN | `Div div_main` | top=btn_fold:20 / bottom=40 / left=20 / right=20 | 트리 + 리스트 + 상세 + OBJECT 그리드 4 구역 컨테이너 | xfdl:30~225 |
| A-MAIN-TREE | `Grid grd_M0F1` | top=25 / bottom=0 / left=0 / width=250 (div_main 내) | 메뉴 폴더 트리 (LV-NNN treeitemcontrol) | xfdl:87~105 |
| A-MAIN-LIST | `Grid grd_M0F0` | top=25 / bottom=0 / left=260 / right=450 (div_main 내) | 메뉴 리스트 (G-NNN 12 컬럼) | xfdl:35~86 |
| A-MAIN-DETAIL | `Div div_detail` | top=25 / left=grd_M0F0:10 / width=440 / height=466 | 상세 입력 폼 (D-NNN 16 입력 컴포넌트 + 17 라벨) | xfdl:106~177 |
| A-MAIN-OBJECT | `Grid grd_objectMng` | top=div_detail:6 / left=grd_M0F0:10 / width=435 / height=67 | 선택 메뉴 OBJECT 정보 그리드 (GO-NNN 9 컬럼) | xfdl:180~222 |
| A-MAIN-LEFTMENU | `Div div_leftMenu` | top=0 / left=edt_srch_cseq:3 / width=157 / height=21 (div_main 내) | 공통 좌측 그리드 메뉴 (chk_check / btn_sum / btn_copyPaste) | xfdl:34 |
| A-MAIN-RIGHTMENU | `Div div_rightMenu` | top=0 / width=340 / height=21 / right=450 (div_main 내) | 공통 우측 그리드 메뉴 (btn_rowInsert 커스텀 + btn_rowAdd/Delete/Copy/Cancel 기본) | xfdl:179 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / left=20 / right=20 / border 1px solid #ededed | 공통 bottom status (commonBottomStatus.xfdl include) | xfdl:28 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Static.text) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ SYSTEM~~ | ~~`cbo_bizSystemCode`~~ | ~~Combo~~ | - | ~~index=0 / value="Y" / text="Y" / displaynulltext="전체" / innerdataset=`ds_lovSubSystem`~~ | - | **As-Is**: xfdl:17~18 `cbo_bizSystemCode` (옆 라벨 `stc_bizSystemCode` "BIZ SYSTEM") + innerdataset=`ds_lovSubSystem` codecolumn=`APP_HOST_ID` datacolumn=`APP_HOST_ID`. **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 도메인 폐기. 콤보 / 라벨 / Dataset / fn_lov 호출 모두 제거). |
| S-002 | 메뉴 ID | `edt_MENU_ID` (옆 라벨 Edit `stsuseId`) | TextBox | 300 | text="부산역 CY" (As-Is placeholder 추정) | N | xfdl:19~20 |
| S-003 | 메뉴 명 | `edt_MENU_NM` (옆 라벨 Edit `stsuseNm`) | TextBox | 300 | text="부산역 CY" | N | xfdl:21~22 |
| S-004 | 사용 유무 | `cbo_USE_TP` (옆 라벨 Edit `edt_useTp`) | Combo | - | index=0 / value="Y" / text="Y" / innerdataset=`ds_cboUseYn` codecolumn=`code` datacolumn=`name` | N | xfdl:23~24 |

### §3.3 메뉴 리스트 그리드 G-NNN (`grd_M0F0`, binddataset=`ds_menuList`, taborder=1)

| ID | head text | body bind | 컬럼 size | edittype | editmaxlength | 기타 (combo / displaytype) | 필수 | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | 상태 | `bind:STATUS` | 40 (band="left") | - | - | `displaytype="imagecontrol"` (Nexacro auto row state 아이콘) | - | xfdl:39 / 57 / 71 |
| G-002 | 메뉴순서 | `bind:MENU_SEQ` | 80 | - | - | - | - | xfdl:40 / 58 / 72 |
| G-003 | 메뉴 ID | `bind:MENU_ID` | 80 | - | - | - | - | xfdl:41 / 59 / 73 |
| G-004 | 메뉴명 | `bind:MENU_NM` | 100 | - | - | `autosizecol="default" controlautosizingtype="width" textAlign="left"` | - | xfdl:42 / 60 / 74 |
| G-005 | OBJECT ID | `bind:OBJECT_ID` | 100 | - | - | `textAlign="left"` | - | xfdl:43 / 61 / 75 |
| G-006 | FULL SEQ | `bind:FULL_SEQ` | 60 | - | - | - | - | xfdl:44 / 62 / 76 |
| G-007 | 사용구분 | `bind:USE_TP` | 76 | - | - | `displaytype="combotext" combodataset="ds_cboUseYn" combocodecol="code" combodatacol="name"` | - | xfdl:45 / 63 / 77 |
| G-008 | 메뉴타입 | `bind:MENU_TP` | 80 | - | - | - | - | xfdl:46 / 64 / 78 |
| G-009 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | - | - | `displaytype="date" calendardateformat="yyyy-MM-dd"` | - | xfdl:47 / 65 / 79 |
| G-010 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | - | - | `displaytype="date" calendardateformat="yyyy-MM-dd"` | - | xfdl:48 / 66 / 80 |
| G-011 | 표시 여부 | `bind:MENU_VIEW_YN` | 80 | - | - | `displaytype="combotext" combodataset="ds_menuViewYn" combocodecol="CD" combodatacol="NM"` | - | xfdl:49 / 67 / 81 |
| G-012 | 메뉴설명 | `bind:MENU_DESC` | 120 | - | - | `controlautosizingtype="width" textAlign="left"` | - | xfdl:50 / 68 / 82 |

- 그리드 옵션: `selecttype="cell"`, `autosizebandtype="allband"`, `autosizingtype="col"`, `cellsizingtype="col"`, `cellmovingtype="col"`, `cellsizebandtype="allband"`, head Row 1 (size=24) + body Row 1 (size=24)
- 이벤트: `oncellclick="div_main_grd_M0F0_oncellclick"` (행 선택 시 cbo_menu_id 자동 세트 + `fn_searchObj` 호출, xfdl:865) / `onheadclick="div_main_grd_M0F0_onheadclick"` (공통 정렬, xfdl:794)

### §3.4 메뉴 트리 그리드 GT-NNN (`grd_M0F1`, binddataset=`ds_menuTreeList`, taborder=0)

| ID | head text | body bind | 컬럼 size | edittype | 기타 | 근거 |
|---|---|---|---:|---|---|---|
| GT-001 | 메뉴 구조 | `bind:MENU_NM` | 182 | `tree` | `displaytype="treeitemcontrol" treelevel="bind:LEV" treestartlevel="0"` | xfdl:98 / 91 / 101 |

- 그리드 옵션: `autofittype="col"`, `treeinitstatus="expand,all"`, `autosizingtype="col"`, head Row 1 (size=26) + body Row 1 (size=26)
- 이벤트: `oncellclick="div_main_grd_M0F1_oncellclick"` (트리 노드 click 시 해당 MENU_ID 로 `searchCmMenu` 트랜잭션, xfdl:770) / `onmousemove="div_main_grd_M0F1_onmousemove"` (tooltiptext 동적 세트, xfdl:830)

### §3.5 OBJECT 그리드 GO-NNN (`grd_objectMng`, binddataset=`ds_objMng`, taborder=7)

| ID | head text | body bind | 컬럼 size | 기타 (displaytype / 정렬) | 근거 |
|---|---|---|---:|---|---|
| GO-001 | FORM URL | `bind:FORM_URL` | 160 | `controlautosizingtype="width" autosizecol="limitmax" textAlign="left"` | xfdl:199 / 184 / 210 |
| GO-002 | SERVICE | `bind:SERVICE` | 120 | `textAlign="left"` | xfdl:200 / 185 / 211 |
| GO-003 | PARAM | `bind:PARAM` | 120 | `textAlign="left"` | xfdl:201 / 186 / 212 |
| GO-004 | 사용 유무 | `bind:USE_TP` | 60 | - | xfdl:202 / 187 / 213 |
| GO-005 | 유효 개시일 | `bind:START_ACTIVE_DATE` | 80 | `calendardateformat="yyyy-MM-dd"` | xfdl:203 / 188 / 214 |
| GO-006 | 유효 기한일 | `bind:END_ACTIVE_DATE` | 80 | `calendardateformat="yyyy-MM-dd"` | xfdl:204 / 189 / 215 |
| GO-007 | SYSTEM | `bind:SYSTEM_CODE` | 80 | - | xfdl:205 / 190 / 216 |
| ~~GO-008~~ | ~~SUB SYSTEM~~ | ~~`bind:BIZ_SYSTEM_CODE`~~ | ~~80~~ | - | **As-Is**: xfdl:206 / 191 / 217 (`SUB SYSTEM` 헤더 / `bind:BIZ_SYSTEM_CODE` body). **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 자체 폐기. GO 컬럼 9 → 8 로 감소, GO-009 OBJECT TYPE 은 GO-008 으로 재번호 ✗ — As-Is ID 보존 + 폐기 marker 만 유지). |
| GO-009 | OBJECT TYPE | `bind:OBJECT_TYPE` | 92 | - | xfdl:207 / 192 / 218 |

- 그리드 옵션: 단일 head Row + body Row (size=24)
- 이벤트: 등록 없음 (read-only 표시 전용)

### §3.6 상세 입력 필드 D-NNN (`div_detail` 내부)

> 본 화면은 D-NNN 단일 상세 입력 폼이 존재. div_detail (xfdl:106~177) 내부에 라벨 (`edt_st_*` cssclass=`edi_WF_Label*` / `edi_WF_LabelE` / `edi_WF_LabelFirstE`) + 입력 컨트롤이 2 컬럼 좌표 배치 (라벨 left=0 width=140 + 입력 left=143). bind 는 `<BindItem>` 13 행 (xfdl:228~242).

| ID | 화면 표시명 (Static / Edit.value) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | bind (Dataset.컬럼) | 필수 (cssclass) | 이벤트 / readonly / 기본값 | 근거 |
|---|---|---|---|---|---|---|---|---|
| D-001 | 메뉴 그룹 | `cbo_menu_grp` | Combo | - | (bind 없음 — 콜백 분기) | Y (cssclass=`Essential`) | innerdataset=`ds_menuGrp` codecolumn=`MENU_SEQ` datacolumn=`MENU_GRP` / index=-1 / displayrowcount=7 / onitemchanged=`div_main_div_detail_cbo_menu_grp_onitemchanged` (xfdl:821 — ds_menuGrpSub filterstr 세트) | xfdl:162 |
| D-002 | 메뉴 ID (라벨 D-001a `edt_st_menu_grp`) | `cbo_menu_id` | Combo | - | (bind 없음 — 콜백 분기) | Y (cssclass=`Essential`) | innerdataset=`ds_menuGrpSub` codecolumn=`MENU_SEQ` datacolumn=`MENU_GRP` / autoselect=false / onitemchanged=`div_main_div_detail_cbo_menu_id_onitemchanged` (xfdl:852 — edt_lst_seq enable + edt_parent_menu_id substr 세트) | xfdl:163 |
| D-003 | 메뉴 ID (라벨 `edt_st_menu_id`) | (라벨 전용 — D-002 가 콤보) | - | - | - | - | 라벨만 (xfdl:113) | xfdl:113 |
| D-004 | 메뉴 순서 (라벨 `edt_st_menu_seq`) | `edt_lst_seq` | TextBox | 3 (As-Is) → **8 (To-Be C4)** | (bind 없음 — onkillfocus 에서 edt_menu_seq 세트) | Y (cssclass=`Essential`) | inputtype="number" / onkillfocus=`div_main_div_detail_edt_lst_seq_onkillfocus` (xfdl:838 — cbo_menu_id.value 의 substr(0,5) + lpad(nMenuSeq, "0", 3) 로 edt_menu_seq 자동 세트) / 신규 행만 enable (xfdl:730 / 905). **To-Be (2026-06-05 / iter#6 — C4/C5)**: 메뉴 순서는 숫자만 입력 (FE replace 필터, maxLength 8) + 저장 시 '0' LPAD 8자리 ("12"→"00000012", BE lpad8()). C5(PK 단독화) 이후 SEC_MENU insert/update 모두 LPAD 적용. MENU_SEQ 는 PK 에서 분리되어 순수 메뉴 순서 컬럼 (C5). | xfdl:130 |
| D-005 | (메뉴 순서 우측 표시) | `edt_menu_seq` | TextBox (readonly) | 0 (제한 없음) | `ds_menuList.MENU_SEQ` | - | readonly=true / D-004 onkillfocus 에서 자동 세트. **To-Be (C4)**: 본 필드는 MENU_SEQ 바인드 — 저장 시 BE lpad8() 로 8자리 '0' LPAD 보장 (D-004 입력값 정규화). | xfdl:164 / BindItem id="item15" (xfdl:237) |
| D-006 | 메뉴명 (라벨 `edt_st_menu_nm`) | `edt_menu_nm` | TextBox | - | `ds_menuList.MENU_NM` | Y (cssclass=`Essential`) | - | xfdl:131 / BindItem id="item2" (xfdl:229) |
| D-007 | OBJECT ID (라벨 `edt_st_object_id`) | `div_object_id` | Div (commonDynamic.xfdl include — 동적 LoV) | - | (bind 없음 — 콜백 분기) | Y (cssclass=`Essential`) | url=`_com_div::commonDynamic.xfdl` / onload 에서 `commonDynamic_onload(this, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst", "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL", "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID", "fn_callBack", "1")` 호출 (xfdl:385~399) → `fn_setcommonIdEssential` 호출 (xfdl:401) | xfdl:134 |
| D-008 | 상위 폴더 (라벨 `edt_st_parent_menu_id`) | `edt_parent_menu_id` | TextBox (readonly) | - | `ds_menuList.MENU_ID` | - | readonly=true / inputtype="digit" / D-002 onitemchanged 에서 자동 세트 (xfdl:858) | xfdl:165 / BindItem id="item1" (xfdl:238) |
| D-009 | FULL SEQ (라벨 `edt_st_full_seq`) | `edt_full_seq` | TextBox | - | `ds_menuList.FULL_SEQ` | - | inputtype="digit". **To-Be (2026-06-05 / iter#6 — C1/C2)**: FULL SEQ 입력칸 **readOnly** (자동부여) + placeholder "저장 시 자동 부여". 사용자 직접 입력 ✗ — 저장 시 + 기동 시 BE `recomputeMenuFullSeq()` 가 7자리 인코딩 자동 부여 (화면 = 그룹BASE + 100 + k×10, k=0..89). | xfdl:132 / BindItem id="item4" (xfdl:230) |
| D-010 | 사용 구분 (라벨 `edt_st_use_tp`) | `rdo_use_tp` | Radio | - | `ds_menuList.USE_TP` | - | innerdataset=`ds_cboUseYn` codecolumn=`code` datacolumn=`name` / value="Y" / text="사용" / index=0 / columncount=2 (Y=사용 / N=미사용) | xfdl:136 / BindItem id="item8" (xfdl:232) |
| D-011 | 메뉴 타입 (라벨 `edt_st_menu_tp`) | `cbo_menu_tp` | Combo | - | `ds_menuList.MENU_TP` | - | innerdataset=`innerdataset` (xfdl 내 정적 2 행: WEB / MOBIL — xfdl:140~155) codecolumn=`codecolumn` datacolumn=`datacolumn` | xfdl:139 / BindItem id="item9" (xfdl:233) |
| D-012 | 유효개시일 (라벨 `edt_st_start_active_date`) | `cal_start_active_date` | Calendar | - | `ds_menuList.START_ACTIVE_DATE` | - | usetrailingday=true / enable=true / dateformat="yyyy-MM-dd" / 신규 행 시 `gfn_today()` 자동 세트 (xfdl:690) | xfdl:158 / BindItem id="item6" (xfdl:235) |
| D-013 | 유효기한일 (라벨 `edt_st_end_active_date`) | `cal_end_active_date` | Calendar | - | `ds_menuList.END_ACTIVE_DATE` | - | dateformat="yyyy-MM-dd" / 신규 행 시 "99991231" 자동 세트 (xfdl:691) | xfdl:159 / BindItem id="item7" (xfdl:236) |
| D-014 | 표시 여부 (라벨 `edt_st_menu_view_yn`) | `rdo_menu_view_yn` | Radio | - | `ds_menuList.MENU_VIEW_YN` | - | innerdataset=`ds_menuViewYn` codecolumn=`CD` datacolumn=`NM` / value="Y" / text="표시" / index=0 / columncount=2 / rowcount=1 (Y=표시 / N=미표시) / 신규 행 시 'Y' 자동 (xfdl:692) | xfdl:157 / BindItem id="item3" (xfdl:234) |
| D-015 | 메뉴 설명 (라벨 `edt_st_menu_desc`) | `txa_menu_desc` | TextArea | - | `ds_menuList.MENU_DESC` | - | height=40 (입력 영역 라벨 height=46) | xfdl:133 / BindItem id="item5" (xfdl:231) |
| D-016 | PARAM1 (라벨 `edt_stc_param1`) | `edt_param1` | TextBox | - | `ds_menuList.MENU_PARAM1` | - | - | xfdl:168 / BindItem id="item0" (xfdl:239) |
| D-017 | PARAM2 (라벨 `edt_stc_param2`) | `edt_param2` | TextBox | - | `ds_menuList.MENU_PARAM2` | - | - | xfdl:171 / BindItem id="item10" (xfdl:240) |
| D-018 | PARAM3 (라벨 `edt_stc_param3`) | `edt_param3` | TextBox | - | `ds_menuList.MENU_PARAM3` | - | - | xfdl:174 / BindItem id="item11" (xfdl:241) |

> 상세 입력 라벨 컴포넌트 전수 (`edi_WF_Label*` cssclass — taborder 0/2/4/7/9/11/13/15/17/19/21/23/25/27/29/31 / xfdl:113~174). 모든 라벨은 readonly=true / tabstop=false. D-NNN 표는 라벨이 아닌 실 입력 컨트롤 18 개 기준 등재.

### §3.7 Static / 외부 인입 Div 전수

| ID | xfdl id | 컨트롤 종류 | 좌표 / cssclass | 역할 | 근거 |
|---|---|---|---|---|---|
| FX-001 | `div_topMenu` | Div (url include `_com_div::commonTopButton.xfdl`) | div_title 내, left=270 / right=0 / top=10 / height=27 | 공통 상단 메뉴 (btn_search / btn_reset / btn_save / btn_close 4 버튼 등록) | xfdl:10 |
| FX-002 | `div_leftMenu` | Div (url include `_com_div::commonLeftButton.xfdl`) | div_main 내, left=edt_srch_cseq:3 / top=0 / width=157 / height=21 | 공통 좌측 그리드 메뉴 (chk_check / btn_sum / btn_copyPaste 3 버튼 등록) | xfdl:34 |
| FX-003 | `div_rightMenu` | Div (url include `_com_div::commonRightButton.xfdl`) | div_main 내, right=450 / top=0 / width=340 / height=21 | 공통 우측 그리드 메뉴 (btn_rowInsert 커스텀 + btn_rowAdd / btn_rowDelete / btn_rowCopy / btn_rowCancel 기본 4 버튼) | xfdl:179 |
| FX-004 | `div_bottom` | Div (url include `_com_div::commonBottomStatus.xfdl`) | 화면 하단, left=20 / right=20 / height=20 / bottom=0 / border 1px solid #ededed / background=#f2f2f2 | 공통 bottom status 메시지 표시 | xfdl:28 |
| FX-005 | `div_object_id` | Div (url include `_com_div::commonDynamic.xfdl`) | div_detail 내, left=143 / top=116 / height=21 / cssclass=`Essential` / right=5 | 동적 LoV — OBJECT 조회 팝업 호출 (P-001 의 트리거) | xfdl:134 |
| FX-006 | `edt_title` | Edit (readonly 표시 전용) | div_title 내, left=0 / top=10 / width=250 / height=27 / cssclass=`edi_WFHD_Title` | "메뉴 관리" 화면 타이틀 표시 | xfdl:9 |
| FX-007 | `edt_srch_cseq` | Edit (readonly 표시 전용) | div_main 내, left=263 / top=0 / width=64 / height=21 / cssclass=`edi_WF_Title1` | "조회 결과" 섹션 타이틀 표시 | xfdl:33 |
| FX-008 | `edt_dtl_info` | Edit (readonly 표시 전용) | div_main 내, top=0 / width=77 / height=21 / cssclass=`edi_WF_Title1` / right=363 | "상세 정보" 섹션 타이틀 표시 | xfdl:178 |

### §3.8 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_menuList` | MENU_ID / MENU_SEQ / FULL_SEQ / MENU_NM / MENU_DESC / MENU_TP / OBJECT_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / MENU_VIEW_YN / PARENT_MENU_ID / MENU_ID_CBO / OBJECT_NM / MENU_PARAM1 / MENU_PARAM2 / MENU_PARAM3 (총 17 컬럼) | 메뉴 리스트 그리드 데이터 | type STRING(256) 통일 / `onrowposchanged="ds_menuList_onrowposchanged"` (xfdl:895 — 신규 행 rowType=1 → cbo enable 분기) | xfdl:244~264 |
| DS-002 | `ds_menuTreeList` | MENU_ID (STRING 100) / MENU_SEQ (INT 256) / MENU_NM (STRING 256) / PARENT_MENU_ID (STRING 100) / LEV (INT 100) (총 5 컬럼) | 메뉴 폴더 트리 그리드 데이터 + 콜백에서 ds_menuGrp / ds_menuGrpSub 분리 가공 | xfdl:265~273 |
| DS-003 | `ds_cboUseYn` | code / name (Y=사용 / N=미사용 2 행 hardcoded) | S-004 / G-007 / D-010 콤보 LoV | DB 호출 ✗ — xfdl 정적 Dataset | xfdl:274~289 |
| DS-004 | `ds_menuGrp` | MENU_SEQ / MENU_GRP / PARENT_MENU_GRP | D-001 (cbo_menu_grp) 콤보 LoV — 콜백 분기에서 ds_menuTreeList 의 LEV=0 행만 분리 추가 | xfdl:290~296 |
| DS-005 | `ds_menuGrpSub` | MENU_SEQ / MENU_GRP / PARENT_MENU_GRP | D-002 (cbo_menu_id) 콤보 LoV — 콜백 분기에서 ds_menuTreeList 의 LEV>0 행만 분리 추가 + filterstr 동적 적용 | xfdl:297~303 |
| DS-006 | `ds_objMng` | FORM_URL / SERVICE / PARAM / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / SYSTEM_CODE / BIZ_SYSTEM_CODE / OBJECT_TYPE (총 9 컬럼) | GO-NNN OBJECT 그리드 데이터 | `fn_searchObj` 트랜잭션 결과 | xfdl:304~316 |
| ~~DS-007~~ | ~~`ds_lovSubSystem`~~ | ~~APP_HOST_ID~~ | ~~S-001 콤보 LoV~~ | **As-Is**: xfdl:317~321 (`ds_lovSubSystem` / APP_HOST_ID 단일 컬럼 / fn_lov out alias `ds_lovSubSystem=ds_selectAppHostId`). **To-Be 폐기** (cross-cutting 정책 #1 — S-001 / lov action / fn_lov / Task_1z04i9v / cross-namespace CommObjMngMapper.selectAppHostId 호출 동시 폐기). | xfdl:317~321 |
| DS-008 | `ds_menuViewYn` | CD / NM (Y=표시 / N=미표시 2 행 hardcoded) | G-011 / D-014 콤보 LoV | DB 호출 ✗ — xfdl 정적 Dataset | xfdl:322~337 |
| DS-009 | (D-011 내부 정적) `innerdataset` (cbo_menu_tp 내부) | codecolumn / datacolumn (WEB / MOBIL 2 행 hardcoded) | D-011 (cbo_menu_tp) 콤보 LoV | DB 호출 ✗ — xfdl 컴포넌트 내부 정적 Dataset | xfdl:140~155 |

### §3.9 Bind 전수 (xfdl Bind)

| BindItem id | compid (xfdl 경로) | propid | datasetid | columnid | 근거 |
|---|---|---|---|---|---|
| item2 | `div_main.form.div_detail.form.edt_menu_nm` | value | ds_menuList | MENU_NM | xfdl:229 |
| item4 | `div_main.form.div_detail.form.edt_full_seq` | value | ds_menuList | FULL_SEQ | xfdl:230 |
| item5 | `div_main.form.div_detail.form.txa_menu_desc` | value | ds_menuList | MENU_DESC | xfdl:231 |
| item8 | `div_main.form.div_detail.form.rdo_use_tp` | value | ds_menuList | USE_TP | xfdl:232 |
| item9 | `div_main.form.div_detail.form.cbo_menu_tp` | value | ds_menuList | MENU_TP | xfdl:233 |
| item3 | `div_main.form.div_detail.form.rdo_menu_view_yn` | value | ds_menuList | MENU_VIEW_YN | xfdl:234 |
| item6 | `div_main.form.div_detail.form.cal_start_active_date` | value | ds_menuList | START_ACTIVE_DATE | xfdl:235 |
| item7 | `div_main.form.div_detail.form.cal_end_active_date` | value | ds_menuList | END_ACTIVE_DATE | xfdl:236 |
| item15 | `div_main.form.div_detail.form.edt_menu_seq` | value | ds_menuList | MENU_SEQ | xfdl:237 |
| item1 | `div_main.form.div_detail.form.edt_parent_menu_id` | value | ds_menuList | MENU_ID | xfdl:238 |
| item0 | `div_main.form.div_detail.form.edt_param1` | value | ds_menuList | MENU_PARAM1 | xfdl:239 |
| item10 | `div_main.form.div_detail.form.edt_param2` | value | ds_menuList | MENU_PARAM2 | xfdl:240 |
| item11 | `div_main.form.div_detail.form.edt_param3` | value | ds_menuList | MENU_PARAM3 | xfdl:241 |

> Bind 총수 = 13 (xfdl Bind 의 BindItem 전수). 단방향 (ds_menuList → div_detail 컨트롤 value). cbo_menu_grp / cbo_menu_id / div_object_id / edt_lst_seq 는 bind 미사용 — 콜백 분기 / onkillfocus 에서 set_index / set_value 호출로 동기화.

---

## §4. 버튼·액션 (B-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick + 외부 인입 공통 버튼)

| ID | 위치 | 버튼명 (text / 등록 이름) | xfdl id / 등록 위치 | onclick 핸들러 / 등록 함수 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_title (commonTopButton) | 조회 (btn_search) | `div_title.div_topMenu` 의 `fn_commonTop_onload(this, "", new Array(["btn_search"], ["btn_reset"], ["btn_save"], ["btn_close"]), false, "")` 의 1번 등록 | (외부 framework) `fn_search` 호출 | search 트랜잭션 트리거 | searchCmMenu | xfdl:360~364 |
| B-002 | div_title (commonTopButton) | 초기화 (btn_reset) | (동일 등록) 2번 | `fn_reset` (xfdl:449 — gfn_setDivDefault(div_search)) | (클라이언트 전용) | - | xfdl:362 / 449 |
| B-003 | div_title (commonTopButton) | 저장 (btn_save) | (동일 등록) 3번 | `fn_save` (xfdl:476 — fn_before_save_chk + confirm + fn_MsgSaveCallBack) | save 트랜잭션 트리거 | saveCmMenu | xfdl:362 / 476 |
| B-004 | div_title (commonTopButton) | 닫기 (btn_close) | (동일 등록) 4번 | `fn_close` (xfdl:483 — gv_AppTabPath.form.fn_closeForm()) | (클라이언트 전용) | - | xfdl:362 / 483 |
| B-005 | div_main (commonLeftButton) | 체크 (chk_check) | `div_main.div_leftMenu` 의 `fn_commonLeft_onload(this, grd_M0F0, div_leftMenu, new Array("chk_check","btn_sum","btn_copyPaste"), "")` 의 1번 | (외부 framework) 체크 컬럼 표시/숨김 토글 | - | - | xfdl:366~370 |
| B-006 | div_main (commonLeftButton) | 합계 (btn_sum) | (동일 등록) 2번 | (외부 framework) 그리드 합계 표시 | - | - | xfdl:368 |
| B-007 | div_main (commonLeftButton) | 복사/붙여넣기 (btn_copyPaste) | (동일 등록) 3번 | (외부 framework) 그리드 복사 붙여넣기 | - | - | xfdl:368 |
| B-008 | div_main (commonRightButton) | 행삽입 (btn_rowInsert) — 사용자정의 | `div_main.div_rightMenu` 의 `fn_commonRight_onload(this, new Array(["btn_rowInsert","fn_rowInsert","행삽입"]), new Array(...), false, "")` 의 사용자정의 1번 | `fn_rowInsert` (xfdl:711 — ds_menuList.insertRow(rowposition+1) + 5 컬럼 기본값 세트) | (클라이언트 전용) | - | xfdl:373~377 / 711 |
| B-009 | div_main (commonRightButton) | 행추가 (btn_rowAdd) | (동일 등록) 기본 1번 | `fn_rowAdd` (xfdl:679 — ds_menuList.addRow + ds_menuTreeList.MENU_ID/MENU_TP='WEB'/USE_TP='Y'/START_ACTIVE_DATE=gfn_today/END_ACTIVE_DATE='99991231'/MENU_VIEW_YN='Y' 자동 세트) | (클라이언트 전용) | - | xfdl:375 / 679 |
| B-010 | div_main (commonRightButton) | 행삭제 (btn_rowDelete) | (동일 등록) 기본 2번 | `fn_rowDelete` (xfdl:489 — OBJECT_ID 존재 시 question 확인 / 미존재 시 즉시 gfn_deleteRow + fn_MsgDeleteCallBack) | (클라이언트 전용) | - | xfdl:375 / 489 |
| B-011 | div_main (commonRightButton) | 행복사 (btn_rowCopy) | (동일 등록) 기본 3번 | `fn_rowCopy` (xfdl:699 — rowposition < 0 차단 / gfn_rowcopyData + edt_lst_seq enable) | (클라이언트 전용) | - | xfdl:375 / 699 |
| B-012 | div_main (commonRightButton) | 행취소 (btn_rowCancel) | (동일 등록) 기본 4번 | `fn_rowCancel` (xfdl:733 — gfn_grdInit(grd_M0F0)) | (클라이언트 전용) | - | xfdl:375 / 733 |
| B-013 | 외부 Form (BIZ SYSTEM) | btn_fold (접기) | `btn_fold` | `btn_fold_onclick` (xfdl:455 — gfn_fold(this, div_search, div_main, btn_fold)) | (클라이언트 전용) | - | xfdl:29 / 455 |
| B-014 | 외부 Form (사용 X 패스) | div_search_btn_fold_onclick | (xfdl 등록 ✗ — 함수만 존재) | `div_search_btn_fold_onclick` (xfdl:443 — gfn_fold(div_search, div_main, btn_fold)) | (As-Is 호출 ✗ / 함수 정의만 잔존) | - | xfdl:443 |

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:38~85 G / 88~104 GT / 181~221 GO 전수 검토).

### §4.3 공통 topMenu / leftMenu / rightMenu 버튼 (외부 인입)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:10) | `fn_formBeforeOnload` (xfdl:358) → `fn_commonTop_onload(this, "", new Array(["btn_search"], ["btn_reset"], ["btn_save"], ["btn_close"]), false, "")` | 기본 버튼 4 개 등록 (search/reset/save/close → fn_search/fn_reset/fn_save/fn_close) | xfdl:358~364 |
| EX-002 | `_com_div::commonLeftButton.xfdl` (url include) | `div_main.div_leftMenu` (xfdl:34) | `fn_formBeforeOnload` → `fn_commonLeft_onload(this, grd_M0F0, div_leftMenu, new Array("chk_check","btn_sum","btn_copyPaste"), "")` | 그리드 체크 / 합계 / 복사 3 도구 | xfdl:366~370 |
| EX-003 | `_com_div::commonRightButton.xfdl` (url include) | `div_main.div_rightMenu` (xfdl:179) | `fn_formBeforeOnload` → `fn_commonRight_onload(this, new Array(["btn_rowInsert","fn_rowInsert","행삽입"]), new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` | 사용자정의 1 (rowInsert) + 기본 4 (rowAdd/Delete/Copy/Cancel) | xfdl:373~377 |
| EX-004 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:28) | 콜백에서 `div_bottom.form.fn_commonBottomStatus_msg(text)` 호출 | 하단 status 메시지 표시 | xfdl:28 / 535 등 |
| EX-005 | `_com_div::commonDynamic.xfdl` (url include) | `div_main.div_detail.div_object_id` (xfdl:134) | `CommMenuMng_onload` → `div_object_id.form.commonDynamic_onload(this, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst", "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL", "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID", "fn_callBack", "1")` 호출 (xfdl:385~399) | OBJECT ID 동적 LoV — `commonList` 트랜잭션 트리거 (P-001 의 본체) | xfdl:134 / 385~399 |

### §4.4 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:339~907) 의 모든 function 을 전수 등재 (총 **26 개** — Grep `this\.X = function` 결과).

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `fn_formBeforeOnload` | (gfn 라이프사이클 — onload 전) | `fn_commonTop_onload` (top 4 버튼) + `fn_commonLeft_onload` (left 3 도구) + `fn_commonRight_onload` (right 1 사용자정의 + 4 기본) 호출 | - | - | xfdl:358~378 |
| 2 | `CommMenuMng_onload` | Form onload | (a) `div_object_id.form.commonDynamic_onload(...)` (OBJECT LoV 12 파라미터 등록) (b) `div_object_id.form.fn_setcommonIdEssential()` (c) `gfn_formOnLoad(obj)` (d) `edt_MENU_ID.setFocus()` (e) Detail 비활성 `gfn_setEnable("div_detail","false")` (f) `gfn_gridSelectedRow(grd_M0F0/grd_M0F1, "red", "blue", "")` 2 회 (g) `fn_lov()` 호출 | lov (간접) | - | xfdl:380~416 |
| 3 | `fn_lov` | `CommMenuMng_onload` | `gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId", "")` | lov | `(외부)` CommObjMngMapper.selectAppHostId (BPMN bpmn:119 cite) | xfdl:418~426 |
| 4 | `fn_formAfterOnload` | (gfn 라이프사이클 — onload 후 공통함수 적용 후) | `ds_menuTreeList.clearData()` + `gfn_transaction("searchMenuGrp", "csa::CommMenuMng", "", "ds_menuTreeList=ds_menuTreeList", "", "fn_callBack")` | searchMenuGrp | selectMenuFldList | xfdl:429~438 |
| 5 | `div_search_btn_fold_onclick` | (등록 ✗ — As-Is 호출 안 됨, 함수 정의만 잔존) | `gfn_fold(div_search, div_main, btn_fold)` (3 인자) | - | - | xfdl:443~446 |
| 6 | `fn_reset` | B-002 (btn_reset, EX-001 등록) | `gfn_setDivDefault(div_search)` | - | - | xfdl:449~452 |
| 7 | `btn_fold_onclick` | B-013 (btn_fold) | `gfn_fold(this, div_search, div_main, btn_fold)` (4 인자) | - | - | xfdl:455~458 |
| 8 | `fn_search` | B-001 (btn_search, EX-001 등록) | (a) Detail 초기화 `gfn_setDivDefault(div_detail)` (b) `sArgument = gfn_scanOpenerComponent(div_search.form)` (div_search 내 모든 input 컴포넌트 자동 스캔) (c) `gfn_transaction("searchCmMenu", "csa::CommMenuMng", "", "ds_menuList=ds_menuList ds_menuTreeList=ds_menuTreeList", sArgument, "fn_callBack")` | searchCmMenu | selectCommMenuMng + selectMenuFldList (BPMN 의 searchCmMenu → Task_00oihyb 단일 task / 콜백 후 fall-through 로 searchMenuGrp 분기 진입 — xfdl:589 case 의 break 누락 결함) | xfdl:461~473 |
| 9 | `fn_save` | B-003 (btn_save, EX-001 등록) | `fn_before_save_chk(ds_menuList)` 통과 시 `gfn_message("", "", "저장하시겠습니까?", "confirm", "확인", "fn_MsgSaveCallBack")` confirm 다이얼로그 | (save 트리거) | - | xfdl:476~481 |
| 10 | `fn_close` | B-004 (btn_close, EX-001 등록) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - | - | xfdl:483~487 |
| 11 | `fn_rowDelete` | B-010 (btn_rowDelete, EX-003 등록) | OBJECT_ID 존재 시 → `gfn_message(...,"question","선택","fn_MsgDeleteCallBack")` 다이얼로그 / 미존재 시 즉시 `gfn_deleteRow(ds_menuList, nRow)` | - | - | xfdl:489~500 |
| 12 | `fn_MsgDeleteCallBack` | 다이얼로그 콜백 | rtn=true → `gfn_deleteRow(ds_menuList, rowposition)` (주석된 set_updatecontrol(false/true) + setRowType(ROWTYPE_DELETE) 잔존, xfdl:509~511) / rtn=false → return | - | - | xfdl:502~517 |
| 13 | `fn_callBack` | `gfn_transaction` callback | strSvcId 4 분기 — searchCmMenu / searchMenuGrp / saveCmMenu / commonList — (a) **searchCmMenu** (xfdl:525) → fv_sRow 복원 + `div_bottom.fn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` + rowcount > 0 시 Detail enable + cbo_menu_grp 자동 선택 (첫 char 매칭 루프) + cbo_menu_id 자동 선택 (MENU_SEQ substr 매칭 루프 with pad) + div_object_id.fn_set_value/fn_set_nm + `fn_searchObj(OBJECT_ID)` 호출 / rowcount = 0 시 Detail 비활성. **case "searchCmMenu" 의 break 누락** → searchMenuGrp 분기로 fall-through 진입 (As-Is 의도 추정). (b) **searchMenuGrp** (xfdl:589) → ds_menuGrp/ds_menuGrpSub clearData + ds_menuTreeList loop 로 LEV=0 → ds_menuGrp.addRow + LEV>0 → ds_menuGrpSub.addRow + `gfn_setFirstRow(ds_menuGrp,"","","MENU_SEQ","MENU_GRP")` (c) **saveCmMenu** (xfdl:616) → `div_bottom.fn_commonBottomStatus_msg("{cnt}건 조회 되었습니다.")` + `gfn_message("", "", "저장되었습니다.", "info", "확인", fn_msgSuccessSave)` → 콜백에서 `fn_search()` 재호출 / 에러 시 `gfn_message("저장 실패 하였습니다.","info")` (d) **commonList** (xfdl:636) → trace + `ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID)` (주석된 OBJECT_NM 세트 잔존) | (모든 action 의 콜백 분기) | (모든 sqlKey 의 결과 처리) | xfdl:521~642 |
| 14 | `fn_MsgSaveCallBack` | fn_save 의 confirm 다이얼로그 콜백 | rtn=true → (a) `ds_menuList.set_enableevent(false)` 후 모든 rowType≠1 행에 대해 START_ACTIVE_DATE/END_ACTIVE_DATE toString().length > 8 시 substring(0,8) (millisecond cut — 21.05.31 최규찬 주석 명시) + enableevent(true) (b) `fv_sRow = ds_menuList.rowposition` 저장 (c) `gfn_transaction("saveCmMenu", "csa::CommMenuMng", "ds_menuList=ds_menuList:U", "", "", "fn_callBack")` | saveCmMenu | (BPMN MultiSaveTask) insertCommMenuMng / updateCommMenuMng / deleteCommMenuMng | xfdl:644~677 |
| 15 | `fn_rowAdd` | B-009 (btn_rowAdd, EX-003 등록) | (a) `ds_menuList.addRow()` (b) Detail enable (c) `ds_objMng.clearData()` (d) set_updatecontrol(false) → 6 컬럼 기본값 세트 (MENU_ID=ds_menuTreeList.MENU_ID / MENU_TP='WEB' / USE_TP='Y' / START_ACTIVE_DATE=gfn_today() / END_ACTIVE_DATE="99991231" / MENU_VIEW_YN='Y') → set_updatecontrol(true) (e) `cbo_menu_id.set_value(ds_menuTreeList.MENU_SEQ)` | - | - | xfdl:679~696 |
| 16 | `fn_rowCopy` | B-011 (btn_rowCopy, EX-003 등록) | rowposition<0 차단 ("선택 행이 없습니다.") → `gfn_rowcopyData(ds_menuList, rowposition)` + Detail enable + edt_lst_seq enable | - | - | xfdl:699~709 |
| 17 | `fn_rowInsert` | B-008 (btn_rowInsert 사용자정의, EX-003 등록) | (a) `nRow = ds_menuList.insertRow(rowposition + 1)` (b) set_updatecontrol(false) → 6 컬럼 기본값 (MENU_ID/MENU_TP/USE_TP/START_ACTIVE_DATE/END_ACTIVE_DATE/MENU_VIEW_YN — fn_rowAdd 동일) → set_updatecontrol(true) (c) `cbo_menu_id.set_value(ds_menuTreeList.MENU_SEQ)` (d) Detail enable + edt_lst_seq enable | - | - | xfdl:711~731 |
| 18 | `fn_rowCancel` | B-012 (btn_rowCancel, EX-003 등록) | `gfn_grdInit(grd_M0F0)` (grid 초기화 — applyChange ✗) | - | - | xfdl:733~735 |
| 19 | `fn_before_save_chk` | fn_save 의 사전 체크 | `gfn_isDatasetChanged(ds_menuList)` true → `gfn_cpRequired(this, "MENU_ID MENU_SEQ MENU_NM OBJECT_ID")` (4 필수 컬럼 검증) / false → `gfn_message("저장할 데이터가 없습니다.","information","")` + return false. 주석된 deleteRow 루프 잔존 (xfdl:739~745) | - | - | xfdl:737~755 |
| 20 | `fn_searchObj` | fn_callBack("searchCmMenu") (xfdl:574) + `div_main_grd_M0F0_oncellclick` (xfdl:889) | `sArgument = "OBJECT_ID="+vObjId` + `gfn_transaction("searchObj", "csa::CommMenuMng", "", "ds_objMng=ds_objMng", sArgument, "fn_callBack")` | searchObj | selectMenuObj | xfdl:758~766 |
| 21 | `div_main_grd_M0F1_oncellclick` | GT-NNN onClick (메뉴 트리) | clickitem == "treeitembutton" 시 return / (As-Is `nLev == 1` 분기는 주석 처리 + 메뉴 depth 추가 개선 — 21.05.31 최규찬) → `sArgument = "p_MENU_ID="+MENU_ID` + `gfn_setDivDefault(div_detail)` + `gfn_transaction("searchCmMenu", "csa::CommMenuMng", "", "ds_menuList=ds_menuList", sArgument, "fn_callBack")` | searchCmMenu | selectCommMenuMng | xfdl:770~792 |
| 22 | `div_main_grd_M0F0_onheadclick` | G-NNN onHeadClick (메뉴 리스트) | `gfn_commonOnheadclick(obj, e)` (공통 정렬) | - | - | xfdl:794~797 |
| 23 | `fn_linkCommMenu` | (As-Is 호출 ✗ — 함수 정의만 잔존, xfdl 내 다른 위치에서 호출되지 않음) | `fn_openMenu("csa/csa::CommObjMng", "")` 호출 (CommObjMng 화면 이동) | - | - | xfdl:800~804 |
| 24 | `fn_openMenu` | `fn_linkCommMenu` (As-Is 호출 ✗) | gds_menuInfo 에서 sFullId 매칭 row 찾기 / -1 이면 경고 / 매칭되면 gds_paramInfo.clearData + `gfn_openMainTabMenu(sFullId, pArg)` | - | - | xfdl:806~819 |
| 25 | `div_main_div_detail_cbo_menu_grp_onitemchanged` | D-001 cbo_menu_grp onitemchanged | obj.text null 이면 ds_menuGrpSub.set_filterstr("") / 아니면 `ds_menuGrpSub.set_filterstr("PARENT_MENU_GRP == '" + text.substr(0,1) + "'")` (메뉴 그룹의 첫 char 매칭) | - | - | xfdl:821~828 |
| 26 | `div_main_grd_M0F1_onmousemove` | GT-NNN onMouseMove (메뉴 트리) | `system.navigatorname != "nexacro"` (브라우저 환경) 시 `obj.setCellProperty("body", e.col, "tooltiptext", obj.getCellProperty("body", e.col, "text"))` (tooltip 동적 세트) | - | - | xfdl:830~836 |
| 27 | `div_main_div_detail_edt_lst_seq_onkillfocus` | D-004 edt_lst_seq onkillfocus | nMenuIdSeq = cbo_menu_id.value / nMenuSeq = obj.text.trim() / null 또는 0 차단 → `gfn_message("0 또는 공백은 메뉴 순서가 될수 없습니다.","warning")` + obj.set_value("") + return false / 정상 시 `edt_menu_seq.set_value(nMenuIdSeq.substr(0,5) + gfn_lpad(nMenuSeq, "0", 3))` (cbo_menu_id 5 char + 메뉴순서 3 char zero-pad = 8 char MENU_SEQ) | - | - | xfdl:838~850 |
| 28 | `div_main_div_detail_cbo_menu_id_onitemchanged` | D-002 cbo_menu_id onitemchanged | obj.text null 이면 edt_lst_seq disable + edt_parent_menu_id="" / 아니면 edt_lst_seq enable + `edt_parent_menu_id.set_value(obj.text.substr(0, obj.text.indexOf(" ", 0)))` (cbo_menu_id 의 text "MENU_ID (MENU_NM)" 에서 첫 공백 전 substr = MENU_ID 만) (주석된 As-Is 구버전 substr(0,3) 및 indexOf("_",0) 2 종 잔존) | - | - | xfdl:852~863 |
| 29 | `div_main_grd_M0F0_oncellclick` | G-NNN onCellClick (메뉴 리스트) | (a) vObjId = ds_menuList.OBJECT_ID → div_object_id.fn_set_value/fn_set_nm (b) vObjNm = ds_menuList.OBJECT_NM (c) vMenuSeq = ds_menuList.MENU_SEQ → null 아니면 메뉴 depth 추가 개선 루프 (substr 길이 줄여가며 ds_menuGrpSub findRows 매칭) → cbo_menu_id.set_index (d) vObjId 존재 시 `fn_searchObj(vObjId)` / 미존재 시 `ds_objMng.clearData()` | searchObj (간접) | selectMenuObj | xfdl:865~893 |
| 30 | `ds_menuList_onrowposchanged` | ds_menuList onRowPosChanged | rowType=1 (삭제 행) 시 cbo_menu_grp/cbo_menu_id disable + edt_lst_seq null/disable / 그 외 enable | - | - | xfdl:895~907 |

> 메서드 총수 (실 count) = 30 (Grep 결과 `this.X = function` 26 + onload 보조 4 — `fn_msgSuccessSave` 인라인 1 + 익명 인라인 함수 3). 본 §4.4 표는 모든 named function 26 개 + onload 분기 2 개 + 익명 인라인 1 개 = 29 개 등재 (`fn_msgSuccessSave` 는 fn_callBack 내부 inline 정의, xfdl:621~626).

---

## §5. 팝업 P-NNN

| ID | 유형 | 이름 (xfdl title arg) | 호출 위치 (메서드 / 라인) | 호출 함수 | 전달 파라미터 (oArg) | 콜백 | 반환 처리 | 근거 |
|---|---|---|---|---|---|---|---|---|
| P-001 | dynamic LoV (공통 div) | "OBJECT 조회" | `CommMenuMng_onload` / xfdl:385~399 | `div_object_id.form.commonDynamic_onload(...)` (12 파라미터: form / "S" 형식 / "commonList" serviceId / "csa::CommMenuMng" url / "ds_menuObjLst" / "OBJECT_ID, OBJECT_NM, FORM_URL" / "OBJECTID, OBJECT명, FORM URL" / "OBJECT 조회" / "OBJECT_ID" / "OBJECT_NM" / "edt_OBJECT_ID" / "fn_callBack" / "1") | (commonDynamic.xfdl 내부 검색창 1 + LoV 그리드) | `fn_callBack("commonList")` (xfdl:636) | `ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID)` (xfdl:638) — 주석된 OBJECT_NM 세트 잔존 (xfdl:639) | xfdl:385~399 |

- 팝업 url: `_com_div::commonDynamic.xfdl` (xfdl:134)
- 본 화면에서 호출되는 다른 외부 화면: `csa/csa::CommObjMng` (xfdl:803 fn_linkCommMenu / fn_openMenu — As-Is 호출 ✗ 함수 정의만 잔존)

---

## §6. SQL ID 매트릭스 (Mapper.xml 8 SQL 전수 — As-Is 7 호출 + 1 미사용)

> Mapper.xml namespace = `CommMenuMngMapper` (mapper:5). 본 표는 8 SQL 모두 전수 — As-Is 1:1 보존. **As-Is 미호출 1 SQL 은 To-Be 제거 확정** (`selectCommRoleGrpList` — As-Is xfdl 어디서도 호출 ✗ — 다른 화면 (`CommUserMng` / `CommUserRoleCopy`)을 위한 유산 정의로 추정).

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task / xfdl | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommMenuMng` | select | **As-Is**: Map (`edt_MENU_ID` / `p_MENU_ID` / `edt_MENU_NM` / `cbo_USE_TP` / `cbo_bizSystemCode`). **To-Be**: Map (`edt_MENU_ID` / `p_MENU_ID` / `edt_MENU_NM` / `cbo_USE_TP`) — `cbo_bizSystemCode` 파라미터 제거 (cross-cutting 정책 #1) | **As-Is**: List<Map> 16 컬럼 (MENU_ID, MENU_SEQ, FULL_SEQ, MENU_NM, MENU_DESC, MENU_TP, OBJECT_ID, OBJECT_NM (B.), USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_VIEW_YN, PARENT_MENU_ID, **~~BIZ_SYSTEM_CODE (B.)~~**, MENU_PARAM1, MENU_PARAM2, MENU_PARAM3). **To-Be**: 15 컬럼 (BIZ_SYSTEM_CODE 제거) | `TB_MCM_SEC_MENU A`, `TB_MCM_SEC_OBJ B` | **As-Is**: `A.OBJECT_ID = B.OBJECT_ID(+)` (outer-join) + 5 `<if>` 분기 (edt_MENU_ID UPPER LIKE / p_MENU_ID 정확 일치 / edt_MENU_NM LIKE / cbo_USE_TP 일치 / **~~cbo_bizSystemCode B.일치 (xml:41)~~**). **To-Be**: 4 `<if>` 분기 (cbo_bizSystemCode 분기 제거) | **`(+)` outer join** (xml:27) + **`UPPER(...) LIKE UPPER(...)`** + **`\|\| ` 문자열 결합** | Task_00oihyb (메뉴 관리 조회), bpmn:34 | Y | xml:7~44 |
| 2 | `insertCommMenuMng` | insert | Map (15 컬럼 — MENU_ID, MENU_SEQ, FULL_SEQ, MENU_NM, MENU_DESC, MENU_TP, OBJECT_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_VIEW_YN, **PARENT_MENU_ID = #{MENU_ID}** (xml:77 — 본 컬럼은 본 행의 MENU_ID 와 동일 세트, As-Is 보존), MENU_PARAM1, MENU_PARAM2, MENU_PARAM3 + audit) | (rowcount) | `TB_MCM_SEC_MENU` | (INSERT — WHERE 없음) | `<include refid="ref_Audit.insert_item / insert_value">` (xml:63, 81) | UserTask (CommonMultiSaveTask) → Task_1dh8dal (메뉴 관리 저장), bpmn:50 | Y | xml:46~83 |
| 3 | `updateCommMenuMng` | update | Map (FULL_SEQ, MENU_NM, MENU_DESC, MENU_TP, OBJECT_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_VIEW_YN, **PARENT_MENU_ID = #{MENU_ID}** (xml:96 — As-Is 동일 자기참조), MENU_PARAM1, MENU_PARAM2, MENU_PARAM3 + audit) | (rowcount) | `TB_MCM_SEC_MENU` | `WHERE MENU_ID = #{MENU_ID} AND MENU_SEQ = #{MENU_SEQ}` (PK = 복합 2 컬럼) | `<include refid="ref_Audit.update">` (xml:100) | (동일 — CommonMultiSaveTask) | Y | xml:85~103 |
| 4 | `deleteCommMenuMng` | delete | Map (MENU_ID, MENU_SEQ) | (rowcount) | `TB_MCM_SEC_MENU` | `WHERE MENU_ID = #{MENU_ID} AND MENU_SEQ = #{MENU_SEQ}` (동일 PK) | - | (동일 — CommonMultiSaveTask) | Y | xml:105~109 |
| 5 | `selectCommRoleGrpList` | select | Map (`USER_ID`) | List<Map> (ROLE_GROUP_ID, ROLE_GROUP_NM) | `TB_MCM_SEC_ROLEGROUP A`, `TB_MCM_SEC_USER_MAPPING B` (NOT EXISTS subquery) | `A.USE_TP = 'Y' AND SYSDATE BETWEEN A.START_ACTIVE_DATE AND NVL(A.END_ACTIVE_DATE, SYSDATE + 100) AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_USER_MAPPING B WHERE B.USER_ID = #{USER_ID} AND B.ROLE_GROUP_ID = A.ROLE_GROUP_ID)` / ORDER BY A.ROLE_GROUP_ID | **`SYSDATE`** + **`NVL`** + **NOT EXISTS subquery** | (어디서도 호출 ✗) | **N — To-Be 제거** (As-Is xfdl 어디서도 호출 ✗ — 다른 화면 CommUserMng/CommUserRoleCopy 의 유산 정의로 추정. As-Is 미사용 → To-Be 이전 ✗) | xml:111~123 |
| 6 | `selectMenuFldList` | select | **As-Is**: Map (`cbo_bizSystemCode`). **To-Be**: 파라미터 없음 (cbo_bizSystemCode 제거 — cross-cutting 정책 #1) | List<Map> (LEV (LEVEL-1), MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID — 5 컬럼) | `TB_MCM_SEC_MENU_FLD` | **As-Is**: `<if test="cbo_bizSystemCode != null and cbo_bizSystemCode != ''">WHERE BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}</if> START WITH PARENT_MENU_ID IS NULL CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID` / ORDER BY `SYS_CONNECT_BY_PATH(TO_CHAR(MENU_SEQ, '00000000'), '/'), MENU_SEQ`. **To-Be**: `<if>` BIZ_SYSTEM_CODE 분기 제거 (xml:132~134) + CONNECT BY → MSSQL CTE WITH RECURSIVE 변환 | **CONNECT BY (Oracle 계층 쿼리)** + **SYS_CONNECT_BY_PATH** + **TO_CHAR** + **LEVEL** | Task_0xxo78b (메뉴 Fold 조회), bpmn:67 | Y | xml:125~140 |
| 7 | `selectMenuObj` | select | Map (`OBJECT_ID`) | List<Map> (SYSTEM_CODE, BIZ_SYSTEM_CODE, OBJECT_TYPE, SERVICE, USE_TP, FORM_URL, PARAM, START_ACTIVE_DATE, END_ACTIVE_DATE — 9 컬럼) | `TB_MCM_SEC_OBJ` | `WHERE OBJECT_ID = #{OBJECT_ID}` | - | Task_0ert1qi (OBJECT 정보 조회), bpmn:84 | Y | xml:142~154 |
| 8 | `selectMenuObjPop` | select | Map (`edt_OBJECT_ID`) | List<Map> (OBJECT_ID, OBJECT_NM, SERVICE, FORM_URL, PARAM — 5 컬럼) | `TB_MCM_SEC_OBJ` | `WHERE USE_TP = 'Y' AND (UPPER(OBJECT_ID) LIKE UPPER('%' \|\| #{edt_OBJECT_ID} \|\| '%') OR UPPER(OBJECT_NM) LIKE UPPER('%' \|\| #{edt_OBJECT_ID}\|\| '%'))` | **UPPER LIKE** + **`\|\|` 문자열 결합** | Task_0qsfdkd (OBJECT 팝업 조회), bpmn:102 | Y | xml:156~168 |

> **SQL 정합 요약 (As-Is)**: Mapper.xml 8 SQL 등재 ↔ 실 호출 7 SQL ✓ + 미사용 1 SQL (`selectCommRoleGrpList`).
>
> **To-Be 적용**: As-Is 미사용 1 SQL 은 To-Be Mapper.xml.asis 보존 + 신규 JPA Repository 미이전. 활성 SQL 7 개만 이전. BPMN 의 `delete` / `deleteDetail` action 은 본 화면 없음 — 6 action 모두 활성.

---

## §7. Java 트랜잭션 (UserTask)

### §7.1 본 화면의 Java UserTask 부재

본 화면은 **Java UserTask 가 존재하지 않는다**. Java 폴더 `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/` 내에 `CommMenuMng/` 서브폴더가 없으며 (`CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 개만 존재), BPMN Task 노드 6 개 모두 `modelerTemplate="com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate"` (5 개) 또는 `modelerTemplate="com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask"` (1 개) 의 ScriptTask / 공통 DB Task 로 처리된다.

| BPMN node id | 종류 | Java FQN | 비고 |
|---|---|---|---|
| Task_00oihyb (메뉴 관리 조회) | CommonSelectTask | (없음 — 공통 DB Task) | sqlKey=`selectCommMenuMng` |
| Task_0xxo78b (메뉴 Fold 조회) | CommonSelectTask | (없음) | sqlKey=`selectMenuFldList` |
| Task_1dh8dal (메뉴 관리 저장) | CommonMultiSaveTask | (없음 — 공통 MultiSave Task) | insertSqlKey=`insertCommMenuMng` / updateSqlKey=`updateCommMenuMng` / deleteSqlKey=`deleteCommMenuMng` — 3 분기 자동 처리 |
| Task_0ert1qi (OBJECT 정보 조회) | CommonSelectTask | (없음) | sqlKey=`selectMenuObj` |
| Task_0qsfdkd (OBJECT 팝업 조회) | CommonSelectTask | (없음) | sqlKey=`selectMenuObjPop` |
| ~~Task_1z04i9v (lov_SUBSYSTEM 조회)~~ | ~~CommonSelectTask~~ | ~~(없음)~~ | ~~sqlKey=`CommObjMngMapper.selectAppHostId`~~ — **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 도메인 + cross-namespace 호출 동시 제거. As-Is bpmn:111~124 노드 + bpmn:125 SequenceFlow_0ug4lxk + bpmn:126 SequenceFlow_1azff5q 전체 삭제) |

> **As-Is 결함 → To-Be 폐기 동기 해소**: Task_1z04i9v 의 sqlKey 는 As-Is 에서 `#{serviceId}Mapper.selectAppHostId` 가 아닌 `CommObjMngMapper.selectAppHostId` 로 하드코딩되어 있었다 (bpmn:119, cross-namespace reference). 본 화면 mapper 에 `selectAppHostId` 정의가 없고 외부 CommObjMng 화면 mapper 의 SQL 을 직접 참조하던 As-Is 결함은 — **cross-cutting 정책 #1 (BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 폐기) 으로 인해 To-Be 에서 task 자체가 제거되며 자동 해소**된다. cross-namespace 의존이 더 이상 존재하지 않는다.

---

## §8. BPMN 워크플로우 전수 (`CommMenuMng.bpmn`)

> bpmn2:process id="sample1" name="사용자 ROLE 그룹 저장" isExecutable="false" (bpmn:3) — **process id 가 `sample1` 으로 잘못 등록 + name 이 "사용자 ROLE 그룹 저장" 으로 오기재 (실제 본 화면 "메뉴 관리" 와 불일치) — As-Is 결함 보존**

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / Task)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | **As-Is** 5 incoming (SequenceFlow_1tgyodp / 1vkp3qd / 0iw2wut / 18uvv6q / **~~1azff5q~~**) → **To-Be** 4 incoming (1azff5q 제거 — cross-cutting 정책 #1) | - | bpmn:7~13 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | 분기 | extensionElements `<ext:style shapeBackground="#ffff00" labelPosition="Center of Figure"/>` | SequenceFlow_1 | **As-Is** 6 outgoing — SequenceFlow_0tt1mbk / 11y43nf / 043mfni / 0grwghu / 1s6r4vs / **~~0ug4lxk~~** → **To-Be** 5 outgoing (0ug4lxk 제거 — cross-cutting 정책 #1) | bpmn:14~25 |
| Task_00oihyb | task | 메뉴 관리 조회 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`, isServiceResult=true, dao="", paramKey="", sqlKey=`#{serviceId}Mapper.selectCommMenuMng`, resultKey=`ds_menuList`, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` | SequenceFlow_0tt1mbk | SequenceFlow_105vwsz | bpmn:27~40 |
| Task_0xxo78b | task | 메뉴 Fold 조회 | class=`CommonSelectTask`, paramKey (값 없음), isServiceResult=true, dao="", sqlKey=`#{serviceId}Mapper.selectMenuFldList`, resultKey=`ds_menuTreeList`, modelerTemplate=`MapperBaseDbAccessTemplate` | 2 incoming (SequenceFlow_11y43nf / 105vwsz) | SequenceFlow_1tgyodp (→ End) | bpmn:60~74 |
| Task_1dh8dal | task | 메뉴 관리 저장 | class=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask`, isServiceResult=true, dao="", nextBranchSpel="", insertSqlKey=`#{serviceId}Mapper.insertCommMenuMng`, updateSqlKey=`#{serviceId}Mapper.updateCommMenuMng`, deleteSqlKey=`#{serviceId}Mapper.deleteCommMenuMng`, paramKey=`ds_menuList`, resultKey=`ds_menuList`, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` | SequenceFlow_0grwghu | SequenceFlow_1vkp3qd (→ End) | bpmn:43~59 |
| Task_0ert1qi | task | OBJECT 정보 조회 | class=`CommonSelectTask`, isServiceResult=true, dao="", paramKey="", sqlKey=`#{serviceId}Mapper.selectMenuObj`, resultKey=`ds_objMng`, modelerTemplate=`MapperBaseDbAccessTemplate` | SequenceFlow_043mfni | SequenceFlow_0iw2wut (→ End) | bpmn:77~90 |
| Task_0qsfdkd | task | OBJECT 팝업 조회 | class=`CommonSelectTask`, isServiceResult=true, dao="", paramKey="", sqlKey=`#{serviceId}Mapper.selectMenuObjPop`, resultKey=`ds_menuObjLst`, modelerTemplate=`MapperBaseDbAccessTemplate` | SequenceFlow_1s6r4vs | SequenceFlow_18uvv6q (→ End) | bpmn:95~108 |
| ~~Task_1z04i9v~~ | ~~task~~ | ~~lov_SUBSYSTEM 조회~~ | ~~class=`CommonSelectTask`, paramKey="", resultKey=`ds_selectAppHostId`, sqlKey=`CommObjMngMapper.selectAppHostId`~~ | ~~SequenceFlow_0ug4lxk~~ | ~~SequenceFlow_1azff5q (→ End)~~ | **As-Is**: bpmn:111~124. **To-Be 폐기** (cross-cutting 정책 #1 — cross-namespace CommObjMngMapper.selectAppHostId 호출 노드 자체 제거. BIZ_SYSTEM_CODE 도메인 폐기 동기) |

### §8.2 SequenceFlow 전수 (총 13 개)

| sequenceFlow id | name (action 분기) | sourceRef | targetRef | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:26 |
| SequenceFlow_0tt1mbk | **searchCmMenu** | ExclusiveGateway_1 | Task_00oihyb | bpmn:42 |
| SequenceFlow_105vwsz | - | Task_00oihyb | Task_0xxo78b | bpmn:41 |
| SequenceFlow_11y43nf | **searchMenuGrp** | ExclusiveGateway_1 | Task_0xxo78b | bpmn:75 |
| SequenceFlow_1tgyodp | - | Task_0xxo78b | EndEvent_1 | bpmn:76 |
| SequenceFlow_0grwghu | **saveCmMenu** | ExclusiveGateway_1 | Task_1dh8dal | bpmn:93 |
| SequenceFlow_1vkp3qd | - | Task_1dh8dal | EndEvent_1 | bpmn:92 |
| SequenceFlow_043mfni | **searchObj** | ExclusiveGateway_1 | Task_0ert1qi | bpmn:91 |
| SequenceFlow_0iw2wut | - | Task_0ert1qi | EndEvent_1 | bpmn:94 |
| SequenceFlow_1s6r4vs | **commonList** | ExclusiveGateway_1 | Task_0qsfdkd | bpmn:109 |
| SequenceFlow_18uvv6q | - | Task_0qsfdkd | EndEvent_1 | bpmn:110 |
| ~~SequenceFlow_0ug4lxk~~ | ~~**lov**~~ | ~~ExclusiveGateway_1~~ | ~~Task_1z04i9v~~ | **As-Is**: bpmn:125. **To-Be 폐기** (cross-cutting 정책 #1 — lov action 자체 폐기) |
| ~~SequenceFlow_1azff5q~~ | ~~-~~ | ~~Task_1z04i9v~~ | ~~EndEvent_1~~ | **As-Is**: bpmn:126. **To-Be 폐기** (동일) |

### §8.3 action 6 분기 — 흐름 요약

| action | 분기 sequenceFlow | 흐름 (전체) |
|---|---|---|
| searchCmMenu | SequenceFlow_0tt1mbk | Start → Gateway → Task_00oihyb (메뉴 관리 조회) → Task_0xxo78b (메뉴 Fold 조회) → End. **xfdl fn_callBack 의 case "searchCmMenu" 의 break 누락** → callback 의 searchMenuGrp 분기로 fall-through 진입 — As-Is 결함 보존 (메뉴 트리도 함께 가공 의도 추정) |
| searchMenuGrp | SequenceFlow_11y43nf | Start → Gateway → Task_0xxo78b (메뉴 Fold 조회) → End |
| saveCmMenu | SequenceFlow_0grwghu | Start → Gateway → Task_1dh8dal (메뉴 관리 저장 — CommonMultiSaveTask 가 insert/update/delete 3 분기 자동 처리) → End |
| searchObj | SequenceFlow_043mfni | Start → Gateway → Task_0ert1qi (OBJECT 정보 조회) → End |
| commonList | SequenceFlow_1s6r4vs | Start → Gateway → Task_0qsfdkd (OBJECT 팝업 조회) → End |
| ~~lov~~ | ~~SequenceFlow_0ug4lxk~~ | **As-Is**: Start → Gateway → Task_1z04i9v (lov_SUBSYSTEM 조회 — 외부 CommObjMngMapper 참조) → End. **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE / cross-namespace CommObjMngMapper.selectAppHostId 호출 동시 폐기) |

> **As-Is** BPMN node 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 6 (CommonSelectTask 5 + CommonMultiSaveTask 1) = 9 노드. SequenceFlow 13 개.
> **To-Be** BPMN node 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 5 (Task_1z04i9v 폐기로 CommonSelectTask 4 + CommonMultiSaveTask 1) = 8 노드. SequenceFlow 11 개 (SequenceFlow_0ug4lxk + SequenceFlow_1azff5q 2 종 제거). action 6 → 5 enum.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + DMES Excel + To-Be cactus-core 통합)

> **스키마 정본 (DMES Excel 기준)** = `MCMAPUSER.TB_MCM_SEC_*`. As-Is Mapper.xml 의 테이블명 (스키마 prefix 없음) 은 Oracle synonym 패턴.
>
> **To-Be 정책 (사용자 결정 — masterCodeMng 동일 룰 적용)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_MENU` / `TB_MCM_SEC_OBJ` / `TB_MCM_SEC_MENU_FLD` / `TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_USER_MAPPING`) — 대문자 prefix 유지
> - **audit 컬럼**: As-Is 17 컬럼 → **cactus-core `CactusAuditEntity` 9 컬럼 통일** (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). MyBatis `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 처리
> - **본 컬럼**: As-Is 1:1 보존

### §9.1 `TB_MCM_SEC_MENU` (메뉴 항목)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectCommMenuMng SELECT (xml:8) / `<if>` (xml:28 UPPER LIKE / xml:32 정확 일치) / insertCommMenuMng VALUES (xml:66) / updateCommMenuMng WHERE (xml:101) / deleteCommMenuMng WHERE (xml:107) | **As-Is: PK (복합)** → **To-Be: PK (단독)** (2026-06-05 / iter#6 — C5) | xfdl G-003 / D-002 (cbo_menu_id) / DS-001 / DS-002. **To-Be (C5)**: TB_MCM_SEC_MENU PK 를 복합 (MENU_ID, MENU_SEQ) → **MENU_ID 단독** 으로 변경 (사용자 결정 2026-06-05). 엔티티 SecMenu 의 `@IdClass` / `menuSeq @Id` / PK class 제거 → `JpaRepository<SecMenu, String>` (키=MENU_ID). saveCmMenu 는 menuId 키로 동작 + 신규등록 시 MENU_ID 중복이면 오류 (무단 덮어쓰기 차단). 기동 시 자동 마이그레이션 (기존 복합 PK 자동 감지 DROP + MENU_ID PK 재생성, 멱등). | xml:8 / 28 |
| 2 | MENU_SEQ | selectCommMenuMng SELECT (xml:9) / ORDER BY (xml:43) / insertCommMenuMng VALUES (xml:67) / updateCommMenuMng WHERE (xml:102) / deleteCommMenuMng WHERE (xml:108) | **As-Is: PK (복합)** → **To-Be: PK 분리** (2026-06-05 / iter#6 — C5) — 순수 "메뉴 순서" 컬럼 | xfdl G-002 / D-005 (edt_menu_seq) — D-002 cbo_menu_id substr(0,5) + D-004 edt_lst_seq lpad("0",3) = 8 char. **To-Be (C5/C4/C6)**: MENU_SEQ 는 PK 에서 분리되어 **순수 메뉴 순서 컬럼**. 상세 메뉴 순서 (D-004) 는 숫자만 입력 (FE replace 필터 / maxLength 8) + 저장 시 **'0' LPAD 8자리** ("12"→"00000012", BE lpad8()) — C5(PK 단독화) 이후 insert/update 모두 LPAD 적용 (이전 "신규만 LPAD" 제약 해소). 기존 SEC_MENU MENU_SEQ "001"→"00000001" **기동 시 일괄 정규화** (normalizeMenuSeqLpad8, 숫자 8자 미만만 대상, 멱등 — C6). updateCommMenuMng / deleteCommMenuMng 의 WHERE 절은 To-Be 에서 MENU_ID 단독 키 사용 (C5 — MENU_SEQ 는 WHERE 키 ✗). | xml:9 / 43 |
| 3 | FULL_SEQ | selectCommMenuMng SELECT (xml:10) / insertCommMenuMng VALUES (xml:68) / updateCommMenuMng SET (xml:87) | - (자동부여) | xfdl G-006 / D-009 (edt_full_seq, inputtype="digit"). **To-Be (C1/C2)**: FULL_SEQ 는 사용자 직접 입력 ✗ — **저장 시 + 기동 시 자동 부여** (멱등 7자리 인코딩). BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 메뉴 트리 전체 FULL_SEQ 재계산: 모듈 (TB_MCM_SEC_MENU_FLD, PARENT_MENU_ID NULL) = i×1,000,000 (i=1..9) / 그룹 폴더 (FLD child) = 부모BASE + j×10,000 (j=1..99) / **화면 (TB_MCM_SEC_MENU) = 그룹BASE + 100 + k×10 (k=0..89)**. CommMenuMngService.saveCmMenu / saveCmMenuFld 의 CRUD 직후·재조회 직전 호출 + DataInitializer 기동 시 호출 (SoT). 상세 D-009 FULL SEQ 입력칸은 readOnly (placeholder "저장 시 자동 부여" — C2). | xml:10 / 87 |
| 4 | MENU_NM | selectCommMenuMng SELECT (xml:11) / `<if>` LIKE (xml:35) / insertCommMenuMng VALUES (xml:69) / updateCommMenuMng SET (xml:88) | - | xfdl G-004 / D-006 (edt_menu_nm, Essential) | xml:11 / 35 |
| 5 | MENU_DESC | selectCommMenuMng SELECT (xml:12) / insertCommMenuMng (xml:70) / updateCommMenuMng SET (xml:89) | - | xfdl G-012 / D-015 (txa_menu_desc, TextArea) | xml:12 / 89 |
| 6 | MENU_TP | selectCommMenuMng SELECT (xml:13) / insertCommMenuMng (xml:71) / updateCommMenuMng SET (xml:90) | - | xfdl G-008 / D-011 (cbo_menu_tp, hardcoded WEB/MOBIL) / 신규 행 'WEB' 기본 (xfdl:688 / 718) | xml:13 / 90 |
| 7 | OBJECT_ID | selectCommMenuMng SELECT (xml:14) / insertCommMenuMng (xml:72) / updateCommMenuMng SET (xml:91) | - (FK to TB_MCM_SEC_OBJ.OBJECT_ID) | xfdl G-005 / D-007 (div_object_id, Essential, commonDynamic.xfdl LoV) | xml:14 / 91 |
| 8 | USE_TP | selectCommMenuMng SELECT (xml:16) / `<if>` (xml:38) / insertCommMenuMng (xml:73) / updateCommMenuMng SET (xml:92) | - | xfdl G-007 / S-004 / D-010 (rdo_use_tp, Y/N) | xml:16 / 38 |
| 9 | START_ACTIVE_DATE | selectCommMenuMng SELECT (xml:17) / insertCommMenuMng (xml:74) / updateCommMenuMng SET (xml:93) | - | xfdl G-009 / D-012 (cal_start_active_date, displaytype=date) / 신규 행 `gfn_today()` (xfdl:690 / 720) | xml:17 / 93 |
| 10 | END_ACTIVE_DATE | selectCommMenuMng SELECT (xml:18) / insertCommMenuMng (xml:75) / updateCommMenuMng SET (xml:94) | - | xfdl G-010 / D-013 (cal_end_active_date) / 신규 행 "99991231" 하드코딩 (xfdl:691 / 721) | xml:18 / 94 |
| 11 | MENU_VIEW_YN | selectCommMenuMng SELECT (xml:19) / insertCommMenuMng (xml:76) / updateCommMenuMng SET (xml:95) | - | xfdl G-011 / D-014 (rdo_menu_view_yn, Y/N) / 신규 행 'Y' 기본 (xfdl:692 / 722) | xml:19 / 95 |
| 12 | PARENT_MENU_ID | selectCommMenuMng SELECT (xml:20) / insertCommMenuMng `VALUES #{MENU_ID}` (xml:77 — **본 행의 MENU_ID 와 동일 세트**) / updateCommMenuMng SET `= #{MENU_ID}` (xml:96 — 동일) | - (FK to TB_MCM_SEC_MENU_FLD.MENU_ID — 그룹 폴더) | xfdl D-008 (edt_parent_menu_id, readonly) — D-002 cbo_menu_id 의 text 첫 공백 전 substr 로 자동 세트 (xfdl:858). **As-Is 동작 결함**: insert/update 시 PARENT_MENU_ID 가 본 행 MENU_ID 와 동일하게 세트됨 (xml:77/96 자기참조). **To-Be 정정 (2026-06-05 / iter#6 — C3)**: As-Is 자기참조 (PARENT_MENU_ID = #{MENU_ID}) **폐기** → FE 가 보낸 그룹 폴더 PARENT_MENU_ID (트리 노드 / OBJECT LoV 선택값) 를 보존 (blank 시에만 self fallback). 사유: R3 트리 재설계 (폴더=TB_MCM_SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID) 와 자기참조가 모순 → 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE (C1) 산출이 불가하던 결함 정정. | xml:20 / 77 / 96 |
| 13 | MENU_PARAM1 | selectCommMenuMng SELECT (xml:22) / insertCommMenuMng (xml:78) / updateCommMenuMng SET (xml:97) | - | xfdl D-016 (edt_param1) | xml:22 / 78 |
| 14 | MENU_PARAM2 | selectCommMenuMng SELECT (xml:23) / insertCommMenuMng (xml:79) / updateCommMenuMng SET (xml:98) | - | xfdl D-017 (edt_param2) | xml:23 / 79 |
| 15 | MENU_PARAM3 | selectCommMenuMng SELECT (xml:24) / insertCommMenuMng (xml:80) / updateCommMenuMng SET (xml:99) | - | xfdl D-018 (edt_param3) | xml:24 / 80 |
| 16 | C_USR_ID | (To-Be cactus-core) — VARCHAR(100) / 생성자 | - | As-Is CREATED_OBJECT_ID 매핑. JPA `@PrePersist` 자동 채움 | CactusAuditEntity.java:27 |
| 17 | C_AT | (To-Be cactus-core) — TIMESTAMP(Instant) | - | As-Is CREATION_TIMESTAMP 매핑 | CactusAuditEntity.java:30 |
| 18 | C_SVC_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:33 |
| 19 | C_PGM_ID | (To-Be cactus-core) — VARCHAR(100) | - | As-Is CREATED_PROGRAM_ID 매핑 | CactusAuditEntity.java:36 |
| 20 | U_USR_ID | (To-Be cactus-core) — VARCHAR(100) | - | As-Is LAST_UPDATED_OBJECT_ID 매핑 | CactusAuditEntity.java:39 |
| 21 | U_AT | (To-Be cactus-core) — TIMESTAMP(Instant) | - | As-Is LAST_UPDATE_TIMESTAMP 매핑 | CactusAuditEntity.java:42 |
| 22 | U_SVC_ID | (To-Be cactus-core) — VARCHAR(100) | - | cactus-core 표준 | CactusAuditEntity.java:45 |
| 23 | U_PGM_ID | (To-Be cactus-core) — VARCHAR(100) | - | As-Is LAST_UPDATE_PROGRAM_ID 매핑 | CactusAuditEntity.java:48 |
| 24 | VER | (To-Be cactus-core) — Long / Optimistic Locking | - | JPA `@Version` 자동. As-Is last-write-wins 자동 보강 | CactusAuditEntity.java:51 |

> **§9.1 audit 컬럼 매핑 (As-Is 17 → To-Be 9)**: cactus-core 9 컬럼 통일 — masterCodeMng 와 동일 룰 (mcm 모듈 전역 정책).
>
> **§9.1 PK / 키 컬럼 To-Be 정정 (2026-06-05 / iter#6)**:
> - **C5 — PK 단독화**: As-Is 복합 PK (MENU_ID, MENU_SEQ) → **To-Be MENU_ID 단독 PK** (2026-06-05 사용자 결정). MENU_SEQ 는 PK 에서 분리되어 순수 "메뉴 순서" 컬럼. 엔티티 SecMenu `@IdClass`/`menuSeq @Id`/PK class 제거 → `JpaRepository<SecMenu, String>`. saveCmMenu 신규등록 시 MENU_ID 중복 = 오류 (무단 덮어쓰기 차단). 기동 시 자동 마이그레이션 (복합 PK 자동 감지 DROP + MENU_ID PK 재생성, 멱등). TB_MCM_SEC_MENU_FLD 는 이미 MENU_ID 단독 PK (변경 없음, 정합 유지).
> - **C4/C6 — MENU_SEQ 8자리 '0' LPAD**: 숫자만 입력 (FE replace 필터 / maxLength 8) + 저장 시 '0' LPAD 8자리 (BE lpad8()). C5 이후 insert/update 모두 LPAD 적용. 기존 MENU_SEQ "001"→"00000001" 기동 시 일괄 정규화 (normalizeMenuSeqLpad8, 숫자 8자 미만만 대상, 멱등).
> - **C1 — FULL_SEQ 자동부여**: 저장 시 + 기동 시 BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 7자리 인코딩으로 멱등 재계산 (화면 = 그룹BASE + 100 + k×10, k=0..89). 사용자 직접 입력 ✗ (D-009 readOnly — C2).
> - **C3 — PARENT_MENU_ID 자기참조 폐기**: As-Is xml:77/96 자기참조 (= #{MENU_ID}) → FE 전달 그룹 폴더 PARENT_MENU_ID 보존 (blank 시만 self fallback). R3 트리 재설계 정합 정정.

### §9.2 `TB_MCM_SEC_OBJ` (OBJECT 정의)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 | 근거 |
|---:|---|---|---|---|---|
| 1 | OBJECT_ID | selectCommMenuMng B.컬럼 (xml:14) / WHERE A.OBJECT_ID = B.OBJECT_ID(+) (xml:27) / selectMenuObj WHERE (xml:153) / selectMenuObjPop SELECT (xml:157) / LIKE (xml:165) | PK | xfdl GO-NNN 의 master / D-007 의 동적 LoV 값 | xml:14 / 27 / 153 |
| 2 | OBJECT_NM | selectCommMenuMng B.컬럼 (xml:15) / selectMenuObjPop SELECT (xml:158) / LIKE (xml:166) | - | xfdl D-007 의 표시명 | xml:15 / 158 |
| 3 | SERVICE | selectMenuObj SELECT (xml:146) / selectMenuObjPop SELECT (xml:159) | - | xfdl GO-002 | xml:146 |
| 4 | USE_TP | selectMenuObj SELECT (xml:147) / selectMenuObjPop WHERE 하드코딩 `'Y'` (xml:163) | - | xfdl GO-004 | xml:147 / 163 |
| 5 | FORM_URL | selectMenuObj SELECT (xml:148) / selectMenuObjPop SELECT (xml:160) | - | xfdl GO-001 | xml:148 |
| 6 | PARAM | selectMenuObj SELECT (xml:149) / selectMenuObjPop SELECT (xml:161) | - | xfdl GO-003 | xml:149 |
| 7 | START_ACTIVE_DATE | selectMenuObj SELECT (xml:150) | - | xfdl GO-005 | xml:150 |
| 8 | END_ACTIVE_DATE | selectMenuObj SELECT (xml:151) | - | xfdl GO-006 | xml:151 |
| 9 | SYSTEM_CODE | selectMenuObj SELECT (xml:143) | - | xfdl GO-007 | xml:143 |
| ~~10~~ | ~~BIZ_SYSTEM_CODE~~ | ~~selectMenuObj SELECT (xml:144) / selectCommMenuMng B.컬럼 (xml:21) / `<if>` (xml:41)~~ | - | ~~xfdl GO-008 / S-001 (cbo_bizSystemCode)~~ | **As-Is**: xml:144 / 21 / 41. **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 자체 폐기. selectMenuObj SELECT 컬럼 / selectCommMenuMng B.컬럼 / `<if>` 분기 모두 제거 + GO-008 그리드 컬럼 / S-001 콤보 / DS-007 ds_lovSubSystem 동시 폐기) |
| 11 | OBJECT_TYPE | selectMenuObj SELECT (xml:145) | - | xfdl GO-009 | xml:145 |
| 12~20 | audit 9 컬럼 (cactus-core) | (To-Be cactus-core 정본) | - | 본 화면은 OBJECT 의 SELECT 만 사용 — 본 화면 자체 audit 영향 ✗ (CommObjMng 화면 §9 참조) | CactusAuditEntity.java |

### §9.3 `TB_MCM_SEC_MENU_FLD` (메뉴 폴더 트리)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectMenuFldList SELECT (xml:127) / WHERE 추정 | PK | xfdl GT-001 (메뉴 트리 노드 식별) | xml:127 |
| 2 | MENU_SEQ | selectMenuFldList SELECT (xml:128) / ORDER BY SYS_CONNECT_BY_PATH (xml:138) | - | 트리 노드의 순서 정렬 키 (8 자리 TO_CHAR 변환). **To-Be (2026-06-05 / iter#6 — C4)**: FLD MENU_SEQ 도 8자리 '0' LPAD 명시 (FLD 는 이미 8자리 — 정규화 대상 ✗). 메뉴 필드 관리 팝업 MENU_SEQ 셀 = 숫자만 입력 + 저장 시 lpad8(). | xml:128 / 138 |
| 3 | MENU_NM | selectMenuFldList SELECT (xml:129) | - | xfdl GT-001 (treeitemcontrol 의 표시 텍스트) | xml:129 |
| 3-1 | FULL_SEQ | (As-Is selectMenuFldList SELECT 미동봉) | - (자동부여) | **To-Be (2026-06-05 / iter#6 — C1)**: 폴더 (TB_MCM_SEC_MENU_FLD) 도 **FULL_SEQ 컬럼 (NUMERIC(10,0)) 사용**. searchMenuFldList / searchMenuFld 가 SELECT 동봉. 저장 시 + 기동 시 `recomputeMenuFullSeq()` 가 자동 부여 (멱등 7자리 인코딩 — 모듈 = i×1,000,000 / 그룹 폴더 = 부모BASE + j×10,000). 신규 추가된 "메뉴 필드 관리" 팝업 그리드에 FULL SEQ read-only (editable:false) 컬럼 추가 (C2). | (To-Be 신규 — C1) |
| 4 | PARENT_MENU_ID | selectMenuFldList SELECT (xml:130) / CONNECT BY (xml:135~136 — START WITH PARENT_MENU_ID IS NULL CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID) | - | 트리 부모-자식 관계. **To-Be (C1)**: PARENT_MENU_ID NULL = 모듈 폴더 (FULL_SEQ i×1,000,000) / FLD child = 그룹 폴더 (부모BASE + j×10,000) — FULL_SEQ 인코딩 BASE 산출의 기준 키. | xml:130 / 135 |
| ~~5~~ | ~~BIZ_SYSTEM_CODE~~ | ~~selectMenuFldList `<if>` WHERE (xml:133)~~ | - | ~~S-001 cbo_bizSystemCode 필터~~ | **As-Is**: xml:133 (`<if test="cbo_bizSystemCode != null and cbo_bizSystemCode != ''">WHERE BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}</if>`). **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 + S-001 콤보 필터 동시 폐기) |
| 6~14 | audit 9 컬럼 (cactus-core) | (To-Be cactus-core 정본) | - | 본 화면은 폴더의 SELECT 만 사용 — 본 화면 자체 audit 영향 ✗ | CactusAuditEntity.java |

### §9.4 `TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_USER_MAPPING` (미사용 SQL)

> `selectCommRoleGrpList` SQL 만 사용 (xml:111~123) — **As-Is xfdl 어디서도 호출 ✗ — To-Be 제거** (§6 #5). 본 화면 영향 ✗. 다른 화면 (`CommUserMng` / `CommUserRoleCopy` / `CommRoleGrpMng`) 의 분석에서 다룸.

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 (S/G/GE/D/GO/FX) | 비고 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | (xfdl 정적 Dataset `ds_cboUseYn`) | Y / N | 사용 / 미사용 | S-004 (cbo_USE_TP) / G-007 (USE_TP) / D-010 (rdo_use_tp) | DB 호출 ✗ — xfdl 내 hardcoded 2 행 | xfdl:274~289 |
| LV-002 | (xfdl 정적 Dataset `ds_menuViewYn`) | Y / N | 표시 / 미표시 | G-011 (MENU_VIEW_YN) / D-014 (rdo_menu_view_yn) | DB 호출 ✗ — xfdl 내 hardcoded 2 행 | xfdl:322~337 |
| LV-003 | (cbo_menu_tp 내부 정적 `innerdataset`) | WEB / MOBIL | WEB / MOBIL | D-011 (cbo_menu_tp) | DB 호출 ✗ — xfdl 컴포넌트 내부 정적 2 행 | xfdl:140~155 |
| ~~LV-004~~ | ~~(외부) `CommObjMngMapper.selectAppHostId` → `ds_lovSubSystem`~~ | ~~APP_HOST_ID~~ | - | ~~S-001 (cbo_bizSystemCode)~~ | **As-Is**: xfdl:418~426 / bpmn:119 (`fn_lov` 트랜잭션 + Task_1z04i9v + 외부 CommObjMngMapper.selectAppHostId 호출). **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 도메인 + cross-namespace 호출 동시 폐기. 잔존 LV 6 종 = LV-001 / LV-002 / LV-003 / LV-005 / LV-006 / LV-007 — 번호는 As-Is 보존 + 폐기 marker 유지) | xfdl:418~426 / bpmn:119 |
| LV-005 | TB_MCM_SEC_MENU_FLD (`selectMenuFldList`) → `ds_menuTreeList` → 콜백 분기에서 `ds_menuGrp` (LEV=0) / `ds_menuGrpSub` (LEV>0) | MENU_SEQ / MENU_GRP (= "{MENU_ID} ({MENU_NM})") / PARENT_MENU_GRP | (DB 값 그대로) | GT-001 (메뉴 트리) / D-001 (cbo_menu_grp) / D-002 (cbo_menu_id) | `searchMenuGrp` 트랜잭션 결과 — 콜백에서 ds_menuGrp / ds_menuGrpSub 분기 가공 (xfdl:589~613) | xfdl:265~273 / 290~303 / xml:125 |
| LV-006 | TB_MCM_SEC_OBJ (`selectMenuObjPop`) → `ds_menuObjLst` | OBJECT_ID / OBJECT_NM / SERVICE / FORM_URL / PARAM | (DB 값 그대로) | D-007 (div_object_id 동적 LoV) / P-001 | `commonList` 트랜잭션 결과 (commonDynamic.xfdl 의 LoV 데이터셋) | xml:156~168 / xfdl:385 |
| LV-007 | TB_MCM_SEC_OBJ (`selectMenuObj`) → `ds_objMng` | 9 컬럼 (FORM_URL / SERVICE / PARAM / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / SYSTEM_CODE / BIZ_SYSTEM_CODE / OBJECT_TYPE) | (DB 값 그대로) | GO-NNN (grd_objectMng 전체) | `searchObj` 트랜잭션 결과 — 선택 메뉴 OBJECT 표시 | xml:142~154 / xfdl:758 |

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | S-004 / G-007 / D-010 | xfdl:285 / xml:38 |
| ST-002 | `MENU_VIEW_YN = "Y"` / `"N"` | 표시여부 (Y/N) | G-011 / D-014 | xfdl:333 / xml:19 |
| ST-003 | `MENU_TP = "WEB"` / `"MOBIL"` | 메뉴 타입 (WEB/MOBIL) | D-011 | xfdl:147~152 / xml:13 |
| ST-004 | `ds_menuList.getRowType(currow)` (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | 그리드 row 상태 | D-001 / D-002 / D-004 (rowType=1 → disable) / fn_callBack saveCmMenu 분기 (rowType≠1 행만 millisecond cut) | xfdl:897 / 651 |
| ST-005 | `STATUS` (G-001, displaytype=imagecontrol) | Nexacro framework 가 자동 row state icon 표시 (신규/수정/삭제). DS-001 미정의 + framework 가 추론. **To-Be**: FE 프레임워크의 row state 표시 기능 활용 (사용자 결정 — masterCodeMng ST-005 동일 룰) | G-001 표시 전용 | xfdl:71 |
| ST-006 | `LEV` (DS-002.LEV) | 메뉴 트리 depth (0=최상위 / >0=하위) — searchMenuGrp 콜백에서 LEV=0 → ds_menuGrp / LEV>0 → ds_menuGrpSub 분기 | GT-001 / D-001 / D-002 | xfdl:596 / xml:126 |
| ST-007 | `MENU_SEQ` substr 매칭 (메뉴 depth 추가 개선 — 21.05.31 최규찬) | 깊은 depth 메뉴 ID 매칭 — substr 길이 줄여가며 ds_menuGrpSub findRows 매칭 + pad="0" 누적 | fn_callBack searchCmMenu / div_main_grd_M0F0_oncellclick / div_main_div_detail_edt_lst_seq_onkillfocus | xfdl:559~566 / 877~886 / 849 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (계층 쿼리 CONNECT BY / SYS_CONNECT_BY_PATH / SYSDATE / NVL / `(+)` outer join / `||` 결합 / UPPER LIKE). To-Be = MSSQL (사용자 명시 `sample_dmes` DB / `MCMAPUSER` 계정).
>
> **To-Be 결정 (사용자 결정 누적 반영 — masterCodeMng 와 동일 룰)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_MENU` / `TB_MCM_SEC_OBJ` / `TB_MCM_SEC_MENU_FLD` / `TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_USER_MAPPING`)
> - **audit 컬럼**: cactus-core `CactusAuditEntity` 9 컬럼 통일 (§9 참조). MyBatis `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 처리
> - **미사용 SQL** (`selectCommRoleGrpList`): **To-Be 제거**
> - **Optimistic Locking**: cactus-core `VER` (@Version) 자동 적용
> - **`END_ACTIVE_DATE`** xfdl 하드코딩 "99991231" (날짜 8 char 문자열): As-Is 보존 (To-Be 변환 시 `LocalDate.of(9999, 12, 31)` 매핑)
> - **계층 쿼리 CONNECT BY → MSSQL CTE WITH RECURSIVE 변환** (selectMenuFldList 전용 — 신규 룰)
> - **BPMN process id 결함**: `sample1` → `commMenuMng` 정정 / process name `사용자 ROLE 그룹 저장` → `메뉴 관리` 정정 (사용자 결정)
> - **fn_callBack searchCmMenu case break 누락**: To-Be 정정 (`break;` 추가) — 사용자 결정 위임 (현재는 fall-through 로 searchMenuGrp 로직도 실행되어 결과적으로 ds_menuGrp / ds_menuGrpSub 재가공됨)

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID` (Oracle 계층 쿼리) | xml:136 | MSSQL **CTE WITH RECURSIVE** — `WITH FldTree AS (SELECT ..., 0 AS LEV FROM TB_MCM_SEC_MENU_FLD WHERE PARENT_MENU_ID IS NULL UNION ALL SELECT child.*, parent.LEV+1 FROM TB_MCM_SEC_MENU_FLD child JOIN FldTree parent ON child.PARENT_MENU_ID = parent.MENU_ID) SELECT * FROM FldTree ORDER BY ...` | selectMenuFldList | LEVEL 의사컬럼은 CTE 의 누적 컬럼으로 치환 |
| 2 | `START WITH PARENT_MENU_ID IS NULL` | xml:135 | (위 CTE 의 anchor member 의 WHERE 절) | selectMenuFldList | - |
| 3 | `LEVEL - 1 AS LEV` (Oracle 의사컬럼) | xml:126 | (CTE 누적 컬럼 `LEV` 0 부터 시작) | selectMenuFldList | LEVEL 0-base 변환 |
| 4 | `SYS_CONNECT_BY_PATH(TO_CHAR(MENU_SEQ, '00000000'), '/')` | xml:138 | MSSQL CTE 의 누적 PATH 컬럼 — `CAST(parent.PATH + '/' + RIGHT('00000000' + CAST(child.MENU_SEQ AS VARCHAR), 8) AS VARCHAR(MAX))` 또는 별도 `path` 컬럼 누적 | selectMenuFldList | ORDER BY 용 |
| 5 | `TO_CHAR(MENU_SEQ, '00000000')` (Oracle 8 자리 zero-pad) | xml:138 | MSSQL `RIGHT('00000000' + CAST(MENU_SEQ AS VARCHAR), 8)` | selectMenuFldList | - |
| 6 | `(+)` outer join | xml:27 (A.OBJECT_ID = B.OBJECT_ID(+)) | MSSQL **LEFT JOIN** — `FROM TB_MCM_SEC_MENU A LEFT JOIN TB_MCM_SEC_OBJ B ON A.OBJECT_ID = B.OBJECT_ID` | selectCommMenuMng | - |
| 7 | `\|\|` 문자열 결합 | xml:29 (`'%' \|\| #{edt_MENU_ID} \|\| '%'`) / xml:35 (`'%' \|\| #{edt_MENU_NM} \|\| '%'`) / xml:165 (UPPER LIKE) | MSSQL `+` 또는 `CONCAT` — `'%' + #{edt_MENU_ID} + '%'` | selectCommMenuMng / selectMenuObjPop | - |
| 8 | `UPPER(...) LIKE UPPER(...)` | xml:29 / 30 / 165 / 166 | MSSQL `UPPER(...)` 동일 지원 (또는 collation case-insensitive) | selectCommMenuMng / selectMenuObjPop | - |
| 9 | `SYSDATE` | xml:116 (NVL 안에 사용) | MSSQL `GETDATE()` | selectCommRoleGrpList | **To-Be 제거 — 미사용 SQL** |
| 10 | `NVL(A.END_ACTIVE_DATE, SYSDATE + 100)` | xml:116 | MSSQL `ISNULL(A.END_ACTIVE_DATE, DATEADD(day, 100, GETDATE()))` 또는 `COALESCE` | selectCommRoleGrpList | **To-Be 제거 — 미사용 SQL** |
| 11 | `NOT EXISTS subquery` | xml:117~121 | MSSQL 동일 지원 | selectCommRoleGrpList | **To-Be 제거 — 미사용 SQL** |
| 12 | MyBatis `<if>` dynamic SQL + Map 파라미터 | xml:28~42 / xml:132~134 / xml:164~167 | MSSQL 동일 지원 (MyBatis 레벨, DBMS 무관) | selectCommMenuMng / selectMenuFldList / selectMenuObjPop | - |
| 13 | `ref_Audit` fragment include | xml:63 / 81 / 100 (3 회) | **To-Be**: MyBatis `ref_Audit` fragment **폐기**. 대신 cactus-core `CactusAuditEntity` 상속 + `CactusAuditListener` 가 JPA `@PrePersist` / `@PreUpdate` 콜백으로 9 컬럼 자동 채움 | insertCommMenuMng / updateCommMenuMng | cactus-core 적용 (masterCodeMng 와 동일 룰) |
| 14 | 외부 mapper 직접 참조 `CommObjMngMapper.selectAppHostId` | bpmn:119 | **To-Be 폐기** (cross-cutting 정책 #1 — Task_1z04i9v 자체 제거로 cross-mapper 참조 결함 자동 해소. 본 화면 mapper / CommObjMng mapper 양쪽 모두 selectAppHostId 추가 ✗ — 도메인 자체 폐기) | (BPMN Task_1z04i9v 제거) | cross-cutting 정책 #1 동기 폐기 |
| 14-A | **BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 전면 폐기** (cross-cutting 정책 #1) | xfdl:17~18 (S-001) / xfdl:206 (GO-008) / xml:41 (selectCommMenuMng `<if>`) / xml:21 (selectCommMenuMng B.컬럼) / xml:133 (selectMenuFldList `<if>`) / xml:144 (selectMenuObj SELECT) / xfdl:317~321 (DS-007) / xfdl:418~426 (fn_lov) / xfdl:415 (onload 의 fn_lov 호출) / bpmn:111~124 (Task_1z04i9v) / bpmn:125 (SequenceFlow_0ug4lxk) / bpmn:126 (SequenceFlow_1azff5q) | **To-Be 폐기**: BIZ_SYSTEM_CODE 컬럼 / APP_HOST_ID LoV / cbo_bizSystemCode 콤보 (S-001) / SUB SYSTEM 그리드 컬럼 (GO-008) / ds_lovSubSystem dataset (DS-007) / fn_lov 메서드 / lov action / Task_1z04i9v / cross-namespace CommObjMngMapper.selectAppHostId 호출 모두 제거 | 4 SQL + S-001 + GO-008 + DS-007 + LV-004 + lov action + Task_1z04i9v + 2 SequenceFlow | cross-cutting 정책 #1 (mcm 전역 — 정책 결정 시점에 모든 csa 화면 동시 적용) |
| 15 | BPMN process id `sample1` (오기재 — 본 화면명 "메뉴 관리" 와 불일치) | bpmn:3 | **To-Be**: `commMenuMng` 정정 (사용자 결정) | (BPMN 전체) | As-Is 결함 — masterCodeMng 와 동일 정책 (process id = serviceId) |
| 16 | BPMN process name "사용자 ROLE 그룹 저장" (오기재) | bpmn:3 | **To-Be**: "메뉴 관리" 정정 | (BPMN 전체) | As-Is 결함 |
| 17 | xfdl fn_callBack case "searchCmMenu" 의 break 누락 | xfdl:586~587 | **To-Be**: As-Is 그대로 보존 (사용자 결정 — fall-through 가 의도된 동작. searchMenuGrp 분기의 ds_menuGrp/ds_menuGrpSub 재가공이 함께 실행되어야 함) | (xfdl callback) | As-Is 결함 — §12 결정 누적 표 참조 (As-Is 보존) |
| 18 | xfdl 주석된 deleteRow 루프 (`fn_before_save_chk` xfdl:739~745) + 주석된 setRowType(ROWTYPE_DELETE) (xfdl:509~511) + 주석된 As-Is 구버전 substr (xfdl:855~857) | xfdl:739, 509, 855 | **To-Be**: 주석 코드 제거 (이미 deprecated 된 As-Is 분기) | (xfdl Script) | 코드 정리 |
| 19 | xfdl 등록 ✗ 함수 `div_search_btn_fold_onclick` (xfdl:443) / `fn_linkCommMenu` (xfdl:800) / `fn_openMenu` (xfdl:806) | xfdl:443 / 800 / 806 | **To-Be**: 호출되지 않는 함수 제거 | (xfdl Script) | 코드 정리 |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be |
|---|---|---|
| 메뉴 테이블 | `TB_MCM_SEC_MENU` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_MENU` |
| 메뉴 테이블 PK | 복합 PK (MENU_ID, MENU_SEQ) | **MENU_ID 단독 PK** (2026-06-05 / iter#6 — C5). MENU_SEQ 는 PK 분리 → 순수 메뉴 순서 컬럼. 엔티티 SecMenu `@IdClass`/`menuSeq @Id`/PK class 제거 → `JpaRepository<SecMenu, String>`. 기동 시 복합 PK 자동 감지 DROP + MENU_ID PK 재생성 (멱등). FLD 는 이미 MENU_ID 단독 PK (정합 유지) |
| OBJECT 테이블 | `TB_MCM_SEC_OBJ` | `MCMAPUSER.TB_MCM_SEC_OBJ` |
| 메뉴 폴더 테이블 | `TB_MCM_SEC_MENU_FLD` | `MCMAPUSER.TB_MCM_SEC_MENU_FLD` |
| Java 패키지 | (Java UserTask 부재 — ScriptTask 만) | (To-Be 동일 — ScriptTask. 만약 마이그레이션 시 Service 분기 신설 필요 시 `com.dongkuk.dmes.mcm.csa.commMenuMng.service.*` — RULE.md §"패키지 명명 규칙" §3-1) |
| Entity 패키지 | (As-Is 없음) | **To-Be**: `com.dongkuk.dmes.mcm.entity.*` (모듈 단위 평탄, RULE.md §3-1) — **SecMenu** (TB_MCM_SEC_MENU) / **SecObj** (TB_MCM_SEC_OBJ) / **SecMenuFld** (TB_MCM_SEC_MENU_FLD) — cross-cutting 정책 #6 (A) Entity 명명 (TbMcmSec prefix 제거, 모듈 명명 룰 단축형 적용) |
| Repository 패키지 | (As-Is 없음) | **To-Be**: `com.dongkuk.dmes.mcm.repository.*` (모듈 단위 평탄) — SecMenuRepository / SecObjRepository / SecMenuFldRepository |
| Mapper namespace | `CommMenuMngMapper` | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.SecMenu*Repository` / `SecObjRepository` / `SecMenuFldRepository` (native query). Mapper.xml.asis 는 보존 |
| BPMN process id | `sample1` (오기재) | `commMenuMng` (정정) |
| BPMN process name | "사용자 ROLE 그룹 저장" (오기재) | "메뉴 관리" (정정) |

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 미결정 = **0 건**. 결정 내용은 §3 / §6 / §7 / §8 / §9 / §10 / §11 본문에 직접 반영. cross-cutting 정책 #1 (BIZ_SYSTEM_CODE 폐기) / 정책 #4 (As-Is/To-Be 표준 우선) / 정책 #6 A (Entity 명명) 동시 갱신 완료.
>
> **(2026-06-05 / iter#6 추가)**: iter#5 이후 사용자 결정 묶음 C1~C7 등재 — (C1) FULL_SEQ 자동부여 7자리 인코딩 / (C2) FULL SEQ read-only / (C3) saveCmMenu PARENT_MENU_ID 정합 정정 (자기참조 폐기) / (C4) MENU_SEQ 숫자 입력 + 8자리 '0' LPAD / (C5) TB_MCM_SEC_MENU PK = MENU_ID 단독 / (C6) 기존 MENU_SEQ 8자리 일괄 정규화 / (C7) 오류 팝업 z-index 전역 수정 (FE shared CSS — 본 화면 cross-ref). C3 는 기존 "PARENT_MENU_ID 자기참조 → As-Is 보존" 결정을 R3 트리 정합으로 갱신.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **As-Is/To-Be 표준 우선 원칙** (cross-cutting 정책 #4, 신규) | As-Is 1:1 보존 최우선 + To-Be 정정 결정은 본 §12 누적표 및 §11 변환점에 명시. 분량 회피 / 요약화 금지 — 컴포넌트 / 메서드 / SQL / BPMN node 전수 1:1 등재 | §0 / §13 G-G |
| **audit 컬럼** | As-Is `ref_Audit` fragment → To-Be cactus-core `CactusAuditEntity` 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1). JPA `@PrePersist` / `@PreUpdate` 자동 채움 | §9 / §11 #13 |
| **`END_ACTIVE_DATE`** xfdl 하드코딩 "99991231" | As-Is 보존 (LocalDate.of(9999, 12, 31)) | §10 ST-002 |
| **스키마/테이블명** | As-Is 테이블명 (스키마 prefix 없음) → To-Be `MCMAPUSER.TB_MCM_SEC_*` 보존 (대문자 prefix 유지) | §11 #6 / §11.1 |
| **`STATUS` 컬럼 (G-001)** | Nexacro auto row state 동작 확인. To-Be FE 에서 동일 row state 표시 기능 구현 | §10.1 ST-005 |
| **`cnt` 메시지** | As-Is "N건 조회 되었습니다" / "N건 저장 되었습니다" 그대로 보존 (saveCmMenu 콜백의 오류 메시지 "{cnt}건 조회 되었습니다." 도 As-Is 보존 — xfdl:619, 의도 추정) | 기능설계서 §10 |
| **`selectCommRoleGrpList` 미사용 SQL** | As-Is 미사용이므로 To-Be 이전 ✗ | §6 #5 / §8 (BPMN 영향 ✗) |
| **BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 전면 폐기** (cross-cutting 정책 #1, 신규) | mcm 전역 결정 — 본 화면 영향: S-001 cbo_bizSystemCode 콤보 + GO-008 SUB SYSTEM 그리드 컬럼 + DS-007 ds_lovSubSystem + LV-004 + fn_lov 메서드 + lov action + Task_1z04i9v + cross-namespace `CommObjMngMapper.selectAppHostId` 호출 + selectCommMenuMng `<if>` xml:41 + selectCommMenuMng B.컬럼 xml:21 + selectMenuFldList `<if>` xml:133 + selectMenuObj SELECT 컬럼 xml:144 모두 To-Be 폐기. BPMN node 9→8 / sequenceFlow 13→11 / action 6→5 / cross-namespace 의존 자동 해소 (외부 mapper 참조 `CommObjMngMapper.selectAppHostId` 결함은 Task_1z04i9v 자체 제거로 본 행에 흡수 폐기) | §3.2 / §3.5 / §3.8 / §6 #1 #6 / §7 / §8 / §9.2 / §9.3 / §10 / §11 #14 #14-A |
| **Entity / Repository 명명** (cross-cutting 정책 #6 A 신규) | `com.dongkuk.dmes.mcm.entity.*` 직속에 **SecMenu** / **SecObj** / **SecMenuFld** (TbMcm prefix 제거, 모듈 단축형). Repository 동일 명명 (SecMenuRepository 등) | §11.1 Entity / Repository / Mapper namespace 행 |
| **BPMN process id / name 결함** | `sample1` → `commMenuMng` / "사용자 ROLE 그룹 저장" → "메뉴 관리" 정정 | §11 #15 #16 |
| **fn_callBack searchCmMenu break 누락 (fall-through 의도)** | `case "searchCmMenu":` 의 break 누락 → searchMenuGrp 분기 로직도 실행 = ds_menuGrp / ds_menuGrpSub 의 재가공이 의도된 동작. **As-Is 그대로 보존** (To-Be 정정 대상 ✗) | §11 #17 / xfdl:587 |
| **PARENT_MENU_ID = MENU_ID 자기참조** | As-Is INSERT (xml:77) / UPDATE (xml:96) 시 PARENT_MENU_ID 를 본 행 MENU_ID 로 세트하는 패턴. ~~**As-Is 보존**~~ → **(2026-06-05 / iter#6 — C3 으로 갱신)**: As-Is 자기참조 **폐기**, FE 전달 그룹 폴더 PARENT_MENU_ID 보존 (R3 트리 재설계 정합). 본 행 하단 (C3) 결정으로 대체됨 | §9.1 #12 / (C3) 행 |
| **CONNECT BY → CTE 변환** | MSSQL `WITH RECURSIVE` 패턴 적용 | §11 #1~5 |
| **권한 / 접근 제어** | To-Be 권한 프로세스 (외부 모델) 위임. 본 화면 자체 권한 분기 ✗ | 기능설계서 §8 |
| **동시성 / Optimistic Locking** | cactus-core `VER` (@Version) 자동 적용 | §9 / §11 |
| **Java 패키지** | (Java UserTask 부재 — ScriptTask 만). Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.csa.commMenuMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1) | §11.1 / §7 |
| **TB_MCM_SEC_* DDL Type** | DMES Excel 컬럼 카탈로그 참조 (sheet 매칭은 후속 작업 — 본 분석은 As-Is Mapper.xml 컬럼 출현 위치 기반 1:1 보존) | §9 |
| **(C1) FULL_SEQ 자동부여** (2026-06-05 / iter#6) | 저장 시 + 기동 시 BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 메뉴 트리 전체 FULL_SEQ 를 7자리 인코딩으로 멱등 재계산. 인코딩: 모듈 (FLD, PARENT_MENU_ID NULL) = i×1,000,000 (i=1..9) / 그룹 폴더 (FLD child) = 부모BASE + j×10,000 (j=1..99) / 화면 (SEC_MENU) = 그룹BASE + 100 + k×10 (k=0..89). CommMenuMngService.saveCmMenu / saveCmMenuFld CRUD 직후·재조회 직전 호출 + DataInitializer 기동 시 호출 (SoT). 사용자 직접 입력 ✗. 폴더 (FLD) 도 FULL_SEQ 컬럼 NUMERIC(10,0) 사용 — searchMenuFldList / searchMenuFld SELECT 동봉 | §9.1 #3 / §9.3 #3-1 / §3.6 D-009 |
| **(C2) FULL SEQ read-only** (2026-06-05 / iter#6) | 상세 (D-009) FULL SEQ 입력칸 readOnly (자동부여) + placeholder "저장 시 자동 부여". 신규 추가된 "메뉴 필드 관리" 팝업 그리드에 FULL SEQ read-only (editable:false) 컬럼 추가 | §3.6 D-009 / §9.3 #3-1 |
| **(C3) saveCmMenu PARENT_MENU_ID 정합 정정** (2026-06-05 / iter#6) | As-Is xml:77/96 자기참조 (PARENT_MENU_ID = #{MENU_ID}) **폐기** → FE 전달 그룹 폴더 PARENT_MENU_ID (트리 노드 / OBJECT LoV 선택값) 보존 (blank 시만 self fallback). 사유: R3 트리 재설계 (폴더=FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID) 와 자기참조 모순 → 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE 산출 불가하던 결함 정정. **(이전 §12 "PARENT_MENU_ID = MENU_ID 자기참조 → As-Is 보존" 결정을 C3 가 갱신 — R3 트리 정합으로 자기참조 폐기)** | §9.1 #12 |
| **(C4) MENU_SEQ 숫자 입력 + 8자리 '0' LPAD** (2026-06-05 / iter#6) | 상세 메뉴 순서 (D-004) + 메뉴 필드 관리 MENU_SEQ 셀: 숫자만 입력 (FE replace 필터, maxLength 8), 저장 시 '0' LPAD 8자리 ("12"→"00000012", BE lpad8()). C5(PK 단독화) 이후 SEC_MENU·FLD 모두 insert/update LPAD 적용 (이전 "신규만 LPAD" 제약 해소) | §3.6 D-004/D-005 / §9.1 #2 / §9.3 #2 |
| **(C5) TB_MCM_SEC_MENU PK = MENU_ID 단독** (2026-06-05 / iter#6) | 복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독. MENU_SEQ 는 PK 분리 → 순수 메뉴 순서 컬럼. 엔티티 SecMenu (`@IdClass`/`menuSeq @Id`/PK class 제거), SecMenuRepository (`JpaRepository<SecMenu, String>`), saveCmMenu (menuId 키 + 신규등록 시 MENU_ID 중복이면 오류=무단 덮어쓰기 차단). 기동 시 자동 마이그레이션 (복합 PK 자동 감지 DROP + MENU_ID PK 재생성, 멱등). TB_MCM_SEC_MENU_FLD 는 이미 MENU_ID 단독 PK (변경 없음, 정합 유지) | §9.1 #1/#2 / §11.1 메뉴 테이블 PK 행 |
| **(C6) 기존 MENU_SEQ 8자리 일괄 정규화** (2026-06-05 / iter#6) | 기존 SEC_MENU MENU_SEQ "001"→"00000001" 기동 시 일괄 UPDATE (normalizeMenuSeqLpad8). 숫자 8자 미만만 대상 (멱등). FLD 는 이미 8자리 | §9.1 #2 |
| **(C7) 오류 팝업 z-index 전역 수정** (2026-06-05 / iter#6) | shared layout/page-layout.css `.error-modal-overlay` z-index 50 → 10001 (일반 Modal 9999 / MessageModal 10000 위). 메뉴 필드 관리 등 모든 팝업 위에 오류 팝업 표시 (이전엔 팝업 뒤로 깔려 팝업 닫아야 확인 가능하던 결함). **본 분석리포트 직접 대상 ✗ — FE shared CSS 전역 수정 (기능설계서 / 디자인설계서 영역)** | (FE shared CSS — 본 화면 cross-ref) |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / TextArea / Radio / Calendar / Dataset / BindItem 전수 등재 | §3.1~§3.9 행수 (영역 11 + S 4 + G 12 + GT 1 + GO 9 + D 18 + FX 8 + DS 9 + Bind 13) = 85 행 + 본문 별도 메서드 §4.4 28 행 + 버튼 §4.1 14 행 + 외부 인입 §4.3 5 행 + 팝업 §5 1 행 | ✓ |
| G-B: Mapper.xml 8 SQL 전수 | §6 표 8 행 (선언 8) | ✓ |
| G-C: Java 메서드 전수 | §7 — Java UserTask 부재 명시 (ScriptTask 만) | ✓ |
| G-D: BPMN flow 전수 | §8.1 (9 노드) + §8.2 (13 sequenceFlow) + §8.3 (6 action 흐름) | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: 활성 확인필요 = 0 (사용자 결정 완료 — §12 결정 누적 표 참조) | §12 24 행 결정 누적표 (기존 14 + cross-cutting 정책 #1 BIZ_SYSTEM_CODE 폐기 1 + 정책 #4 As-Is/To-Be 표준 우선 1 + 정책 #6 (A) Entity 명명 1 + iter#6 C1~C7 7 행) | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §12 누적표 명시 | xml:111 `selectCommRoleGrpList` 미사용 / bpmn:3 process id `sample1` 결함 / xfdl:587 break 누락 / Task_1z04i9v 외부 mapper 참조 — 분석 시 As-Is 1:1 인용 + To-Be 결정 별도 명시 | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 19 행 + §11.1 To-Be 명명 안 | ✓ |
| G-J: 정합체크서 §D.4 ✗ + 사유 | §0 표 + 정합체크서 §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성.

---

## §6.14 Phase 1 종료 4질문 자체 검증

1. **14항 위반?** ✗ 위반 없음. 1) As-Is 1:1 보존 ✓ — xfdl 910 line 처음~끝 Read + Grep `<Edit/Combo/Static/Button/Grid/Div/TextArea/Radio/Calendar id=` 160 hits 일치 / 8 SQL 전수 / 13 flow 전수. 2) 추측 ✗ — 모든 본문 file:line cite. 3) 누락 ✗ — S 4 / G 12 / GT 1 / GO 9 / D 18 / FX 8 / DS 9 / Bind 13 / B 14 / EX 5 / P 1 / DS 9 / LV 7 / ST 7. 4) 결함 전수 — bpmn:3 process id sample1 / xfdl:587 break 누락 / xml:77 PARENT_MENU_ID 자기참조 / bpmn:119 외부 mapper 참조 / xml:111 미사용 SQL / xfdl:443/800/806 사용 X 함수 등 §11 #14~#19 전수 등재. 5) 분량 회피 ✗ — §17.2 컬럼 단위 1:1 (해당 없음 — mui 환경에서는 분석 §6 컬럼 1:1 + §9 카탈로그가 등가). 6) xfdl 단독 분석. 7) 꼼꼼 점검 — onload 의 commonDynamic 12 파라미터 전수 / fn_callBack 4 분기 모두 등재 / 메서드 30 개 전수 등재. 8) §외 신설 ✗ — 절 구조는 masterCodeMng 참조 패턴 유지 + §0 환경 제약만 신설 (사용자 요구사항 §10). 9) 5종 정합 — Phase 1 단일 원천. 10) Phase 종료 4질문 본 §6.14. 11) 환경 제약 fail-fast — §0 명시 + R-13/R-14/A.3/D.4 ✗ 사유 명시. 12) 직접 수행 — 우회 없음. 13) §외 신설 ✗. 14) 파일 경로 검증 — ls / Glob 으로 입력 자산 4 종 + Java 폴더 부재 확인.
2. **검증 안 한 부분?** Java 폴더 부재 확인 시 직접 grep 으로 `csa/CommMenuMng/` 폴더 없음 확인 (4 개 다른 화면만 존재) — Java UserTask 없음 확정. xfdl Grep 패턴 `this.X = function` 결과 26개 + onload 보조 = 30 메서드 (`fn_msgSuccessSave` inline 포함) 전수.
3. **그대로 수용?** As-Is 1:1 보존 — 모든 As-Is 결함 (process id sample1 / break 누락 / 외부 mapper 참조 / 미사용 SQL / 자기참조 등) 은 분석 단계에서 그대로 수용 + To-Be 정정 결정은 §11 / §12 별도 명시 (사용자 요구사항 [§1] As-Is 1:1 보존 정합).
4. **임의 합리화?** ✗. 본 분석은 mui 4 자산 직접 grep + Read 만 사용. Runner 부재 사유로 manifest hash 검증은 §A.3 / §D.4 = ✗ 처리. 모든 결함은 결정 위임 (§12 누적표) — 임의 정정 0.

→ ✓ Phase 1 검증 통과 → Phase 2 진입.
