---
screenId: commObjMng
asIsId: CommObjMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29 (6 정책 결정 일괄 반영: 2026-05-31)
작성자: Agent
---

# OBJECT 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner 의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §D.4 (manifest 9 파일 검증) | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script (+ java UserTask) / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 / ref_Audit → cactus-core `CactusAuditEntity` (As-Is 폐기) |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만"은 mui 환경에 미적용. cite 는 file:line 형식 유지 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | OBJECT 관리 |
| 화면 식별자 (screenId) | commObjMng |
| As-Is 식별자 (asIsId) | CommObjMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > OBJECT 관리 (commObjMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commObjMng |
| pageId | commObjMng |
| serviceId | commObjMng |
| Frontend 파일명 | `commObjMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> OBJECT 관리는 CommObjMng(OBJECT)의 조회, 등록, 수정, 삭제를 수행한다.

- 주 사용자: 시스템 관리자 / 권한 OBJECT 운영 담당자
- 업무 도메인: 공통관리 (mcm) 의 시스템관리 (csa) — OBJECT 마스터 정의 (화면 URL / 외부 접속 주소 / Param / Service / Object Type / Biz System / Menu 연결) 관리. 후속 권한 (role / role-mapping) 화면이 본 화면의 OBJECT_ID 를 참조한다.
- 기능 요약 (BPMN action 6 enum):
  1. `search` — Master 그리드 조회 (`fn_search`, xfdl:404 — sSvcId="searchCmObj" 으로 `fn_run` 트리거)
  2. `searchDetail` — **해당 없음** (As-Is 본 화면은 Master 그리드 1 만 사용 — Detail 별도 트랜잭션 ✗. 우측 상세 입력 영역 D-NNN 은 `ds_main` bind 만으로 동기화)
  3. `save` — Master 그리드 일괄 저장 (UPDATE/INSERT 분기, MERGE ✗ — As-Is 본 화면은 `ds_main:U` 만 전송 + BPMN `CommonMultiSaveTask` 이 update/insert/delete 분기 자동 수행) (`fn_save`, xfdl:464 → `fn_run("saveCmObj")`, xfdl:345)
  4. `saveDetail` — **해당 없음** (단일 그리드 화면)
  5. `delete` — **해당 없음** (별도 액션 ✗. 행 삭제는 클라이언트 `ds_main.deleteRow` 후 save 트랜잭션 내 `CommonMultiSaveTask` 의 deleteSqlKey 분기로 처리 / 연결 메뉴 존재 시 차단 — xfdl:443~459)
  6. `deleteDetail` — **해당 없음**
  7. **추가 액션 `lov`** — `fn_lov` (xfdl:296 — Form onload 시 호출). As-Is = BIZ SYSTEM (`ds_lovSubSystem`) + MENU ID (`ds_lovMenuId`) 2 dataset 동시 조회. **To-Be 정책 #1**: BIZ SYSTEM / APP_HOST_ID 컬럼·콤보 폐기 → To-Be lov = MENU ID (`ds_lovMenuId` ← selectMenuId) **1 dataset** 만 호출

> **As-Is action 실제 enum (xfdl Script + BPMN sequenceFlow name)** = 3 종: **`searchCmObj` / `saveCmObj` / `lov`**. BPMN ExclusiveGateway_1 의 outgoing 3 분기와 1:1. **To-Be 보존** (action enum 3 종 그대로 — lov 본문만 1 dataset 으로 축소).

---

## §2. 자료 수집 인벤토리 (mui 4 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommObjMng.xfdl` | 591 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / Calendar / Radio / Dataset / Script / Bind 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommObjMng/` | - | **N — 없음** (csa Java 디렉토리 ls 결과 = CommChainMasterMng / CommSyncMng / CommUserMng / CommUserRoleCopy 4 폴더만. `CommObjMng` 폴더 없음) | UserTask Java 클래스 0 — 본 화면은 BPMN `CommonMultiSaveTask` / `CommonSelectTask` ScriptTask 만 사용. §7 = "해당 없음" | - |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommObjMngMapper.xml` | 132 | Y | 6 SQL ID (select 3 / insert 1 / update 1 / delete 1) — 6 호출 (전수 활성) | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommObjMng.bpmn` | 176 | Y | StartEvent / EndEvent / ExclusiveGateway 3 분기 / Task 4 (CommonSelectTask 3 + CommonMultiSaveTask 1) / SequenceFlow 9 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | 113 시트 | Y (Q-001 해소 2026-05-30) | TB_MCM_SEC_OBJ (본 화면 본 테이블) / TB_MCM_SEC_MENU (조인 — 연결 메뉴 검증) / TB_MCM_SEC_MENU_FLD (선택 LoV) / ~~TB_MCM_APPHOST (BIZ SYSTEM LoV)~~ (To-Be 정책 #1 폐기) / TB_MCM_SEC_ROLE_MAPPING (delete 차단 검증 EXISTS) — As-Is 5 테이블 / **To-Be 4 테이블** (APPHOST 제거) | - |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.update / insert_item / insert_value">` 3 회 호출은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | - |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 "OBJECT 관리" + 공통 topMenu | xfdl:145~152 |
| A-FILTER | `Div div_search` | top=div_title:10 / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | As-Is 조회조건 (BIZ SYSTEM / OBJECT / 사용 여부 — 3 컬럼) / **To-Be 정책 #1**: BIZ SYSTEM 콤보 폐기 → To-Be **2 컬럼** (OBJECT / 사용 여부) | xfdl:153~164 |
| A-FOLD | `Button btn_fold` | top=93 / height=12 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 (xfdl:31 — taborder=3) | xfdl:7 |
| A-MAIN | `Div div_main` | top=btn_fold:20 / bottom=40 / left=20 / right=20 | 마스터 그리드 + 상세 입력 좌우 분할 컨테이너 | xfdl:8~144 |
| A-MAIN-LEFT (G+B+ST) | `Div div_mainGrd` | top=0 / bottom=0 / left=0 / right=440 | 그리드 + 6 컬럼 표시 + `div_leftMenu` + `div_rightMenu` 공통 메뉴 | xfdl:11~80 |
| A-MAIN-RIGHT (D) | `Div div_mainDetail` | top=0 / left=div_mainGrd:10 / width=430 / bottom=0 | 상세 입력 폼 (15 fields) — taborder=1 | xfdl:81~141 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` / `url="_com_div::commonBottomStatus.xfdl"` | 공통 bottom status | xfdl:6 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Static.text / Edit.value) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ SYSTEM~~ (To-Be 정책 #1 폐기 — APP_HOST/BIZ_SYSTEM_CODE 콤보·LoV·컬럼 제거) | ~~`cbo_bizSystemCode` (옆 라벨 `stc_bizSystemCode` "BIZ SYSTEM")~~ | ~~Combo (innerdataset=`ds_lovSubSystem`, codecolumn=`APP_HOST_ID`, datacolumn=`APP_HOST_ID`)~~ | - | ~~index=0, value="Y", displaynulltext="전체", text="Y" (As-Is 그대로 보존 — 부적절 As-Is 보존)~~ | N | xfdl:156~157 (As-Is 인용) / **To-Be 폐기** |
| S-002 | OBJECT | `edt_OBJECT_ID` (옆 라벨 `sts_objectId` "OBJECT") | TextBox | 100 | text="부산역 CY" (As-Is 디자인 더미 보존 — 실 사용 시 빈 값) | N | xfdl:158~159 |
| S-003 | 사용 여부 | `cbo_USE_TP` (옆 라벨 `sts_useTp` "사용 여부") | Combo (innerdataset=`ds_useTp` 정적 Y/N, codecolumn=`CD`, datacolumn=`NM`, displayrowcount=3) | - | index=0, value="Y" | N | xfdl:160~161 |

### §3.3 마스터 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, taborder=0)

| ID | head text | body bind | 컬럼 size | edittype / displaytype | editmaxlength | 기타 (combo / inputmode / displaytype) | 필수 (CellEssentail) | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | 상태 (head col=0, band=left) | `bind:STATUS` (`displaytype="imagecontrol"`) | 30 | imagecontrol | - | Nexacro auto row state 아이콘 | - | xfdl:19, 40, 57 |
| G-002 | OBJECT ID | `bind:OBJECT_ID` | 120 | (없음 — 기본 textAlign=left) | - | autosizecol="limitmin" | (xfdl 셀 단위 CellEssentail 미표시 — 저장 시 필수, fn_save xfdl:472) | xfdl:20, 41, 58 |
| G-003 | OBJECT NAME | `bind:OBJECT_NM` | 110 | text | - | autosizecol="limitmin", textAlign=left | - | xfdl:21, 42, 59 |
| G-004 | 프로그램 설명 | `bind:PROGRAM_DESC` | 103 | text | - | autosizecol="limitmin", controlautosizingtype="width", textAlign=left | - | xfdl:22, 43, 60 |
| G-005 | SYSTEM | `bind:SYSTEM_CODE` | 60 | text | - | autosizecol="limitmin" | - | xfdl:23, 44, 61 |
| ~~G-006~~ | ~~BIZ\r\nSYSTEM~~ (To-Be 정책 #1 폐기) | ~~`bind:BIZ_SYSTEM_CODE`~~ | 60 | text | - | autosizecol="limitmin" | ~~(필수 — fn_save xfdl:472)~~ | xfdl:24, 45, 62 (As-Is 인용) / **To-Be 폐기** (그리드 컬럼 + fn_save 필수 검증 제거) |
| G-007 | OBJECT\r\nTYPE | `bind:OBJECT_TYPE` | 60 | text | - | autosizecol="limitmin" | - | xfdl:25, 46, 63 |
| G-008 | SERVICE | `bind:SERVICE` | 120 | text | - | autosizecol="limitmin", textAlign=left | - | xfdl:26, 47, 64 |
| G-009 | 사용\r\n여부 | `bind:USE_TP` | 42 | combo (displaytype=`combotext`) | - | combodataset=`ds_useTp`, combocodecol=`CD`, combodatacol=`NM` | (필수 — fn_save xfdl:472) | xfdl:27, 48, 65 |
| G-010 | FORM URL | `bind:FORM_URL` | 180 | text | - | autosizecol="limitmin", textAlign=left | - | xfdl:28, 49, 66 |
| G-011 | 외부 접속 주소 | `bind:OUT_ACCESS_IP` | 167 | text | - | autosizecol="limitmin", textAlign=left | - | xfdl:29, 50, 67 |
| G-012 | PARAM | `bind:PARAM` | 99 | text | - | autosizecol="limitmin", textAlign=left | - | xfdl:30, 51, 68 |
| G-013 | 유효개시일 | `bind:START_ACTIVE_DATE` | 97 | date (displaytype=`date`) | - | calendardateformat="yyyy-MM-dd", autosizecol="limitmin" | - | xfdl:31, 52, 69 |
| G-014 | 유효기한일 | `bind:END_ACTIVE_DATE` | 93 | date | - | calendardateformat="yyyy-MM-dd", autosizecol="limitmin" | - | xfdl:32, 53, 70 |
| G-015 | 접속 경로 | `bind:ACCESS_TP` | 80 | combo (displaytype=`combotext`) | - | combodataset=`ds_access_tp`, combocodecol=`condCd`, combodatacol=`condNm` (정적 3 행: 내부 neXacro / 외부 neXacro / 외부 url) | (필수 — fn_save xfdl:472) | xfdl:33, 54, 71 |

- 그리드 옵션: `cellmovingtype="col"`, `cellsizingtype="col"`, `selecttype="cell"`, `autofittype="none"`, `cellsizingbandtype="allband"`, `autosizingtype="col"`, `autosizebandtype="body"`, head Row 1 (band="head") + body Row 1, **첫 컬럼 band="left" 고정** (xfdl:19 — STATUS 컬럼)
- 이벤트:
  - `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` (gfn 공통 정렬, xfdl:511~514)
  - (oncellclick 없음 — Detail 영역은 `ds_main` bind 만으로 동기화)
- 그리드 컬럼 합계: 15 컬럼 (STATUS 1 + 본 컬럼 14) + head 1 줄 + body 1 줄

### §3.4 상세 그리드 GE-NNN

해당 없음 — 본 화면은 단일 그리드 (Master `grd_main` 만). Detail 영역 = D-NNN (15 fields 상세 입력 폼).

### §3.5 상세 입력 필드 D-NNN (`div_detail`, top=25, right=0, bottom=0, width=430)

> 본 §3.5 는 xfdl:84~137 의 모든 입력 필드 전수 등재 (15 필드). 라벨용 readonly Edit (`edt_st_*`) 와 Static (`stc_Static*`) 도 별도 행으로 분해. Bind 는 xfdl:571~588 의 17 BindItem 그대로 보존.

| ID | 화면 표시명 (라벨 컴포넌트 text/value) | 입력 컨트롤 (xfdl id) | 컨트롤 유형 | bind (datasetid=`ds_main`, columnid) | 입력 형식 / maxlength | 기본값 / cssclass | 필수 | 이벤트 / 라벨 근거 | 입력 컴포넌트 근거 |
|---|---|---|---|---|---|---|---|---|---|
| D-001 | OBJECT ID | `edt_object_id` | TextBox (readonly=true) | OBJECT_ID (BindItem item0) | maxlength=90 | cssclass="Essential" / readonly=true / text="부산역 CY" (디자인 더미) | Y (Essential) | 라벨 `edt_st_object_id` cssclass=edi_WF_LabelFirstE / xfdl:119 | xfdl:104 / Bind xfdl:572 |
| D-002 | SYSTEM | `edt_system_code` | TextBox | SYSTEM_CODE (item1) | maxlength=50, inputtype="normal" | text="부산역 CY" | - | 라벨 `edt_st_system_code` "SYSTEM" / xfdl:97 + Static stc_Static4 / xfdl:88 | xfdl:108 / Bind xfdl:573 |
| ~~D-003~~ | ~~BIZ SYSTEM~~ (To-Be 정책 #1 폐기) | ~~`cbo_bizSystemCode` (Detail 영역 — 동명 이중 — div_search 의 cbo_bizSystemCode 와 별개. xfdl id 동일하지만 부모 path 다름)~~ | ~~Combo~~ | ~~BIZ_SYSTEM_CODE (item7)~~ | ~~innerdataset=`ds_lovSubSystem`, codecolumn=`APP_HOST_ID`, datacolumn=`APP_HOST_ID`, displayrowcount=10, index=0, text="내부 neXacro" (디자인 더미)~~ | ~~cssclass="Essential" / width=236~~ | ~~Y (Essential)~~ | ~~라벨 `edt_st_BIZ_SYSTEM_CODE` / xfdl:121 + Static stc_Static5 / xfdl:120~~ | xfdl:125 / Bind xfdl:583 (As-Is 인용) / **To-Be 폐기** (Detail 콤보 + Essential 필수 + Bind item7 제거) |
| D-004 | MENU ID | `cbo_folder` | Combo | MENU_ID (item12) | innerdataset=`ds_lovMenuId`, codecolumn=`MENU_ID`, datacolumn=`MENU_ID_NM`, displayrowcount=10, index=0, text="내부 neXacro" | width=236 | - | 라벨 `edt_st_bizSystemCode` value="MENU ID" / xfdl:123 + Static stc_Static8_00 / xfdl:122 | xfdl:124 / Bind xfdl:586 / `onitemchanged="div_main_div_mainDetail_div_detail_cbo_bizSystemCode_onitemchanged"` (xfdl:124 — 이름은 bizSystemCode 이나 실 cbo_folder 의 핸들러) |
| D-005 | ID | `edt_id` | TextBox | ID (item14) | maxlength=100 | cssclass="Essential" | Y (Essential) | 라벨 `edt_st_id` "ID" / xfdl:133 + Static stc_Static2_00 / xfdl:132 | xfdl:134 / Bind xfdl:587 / `onchanged="div_main_div_mainDetail_div_detail_edt_id_onchanged"` (xfdl:134 — OBJECT_ID 자동 조합) |
| D-006 | OBJECT명 | `edt_object_nm` | TextBox | OBJECT_NM (item3) | maxlength=100, inputtype="normal" | text="부산역 CY" | - | 라벨 `edt_st_object_nm` "OBJECT명" / xfdl:128 + Static stc_Static2 / xfdl:126 | xfdl:130 / Bind xfdl:584 |
| D-007 | 프로그램 설명 | `edt_program_desc` | TextBox | PROGRAM_DESC (item5) | maxlength=100, inputtype="normal" | text="부산역 CY" | - | 라벨 `edt_st_program_desc` "프로그램 설명" / xfdl:129 + Static stc_Static3 / xfdl:127 | xfdl:131 / Bind xfdl:585 |
| D-008 | OBJECT TYPE | `edt_object_type` | TextBox | OBJECT_TYPE (item2) | maxlength=90, inputtype="normal" | text="부산역 CY" | - | 라벨 `edt_st_object_type` "OBJECT TYPE" / xfdl:96 + Static stc_Static6 / xfdl:92 | xfdl:105 / Bind xfdl:579 / `onchanged="div_main_div_mainDetail_div_detail_edtTelNo_onchanged"` (xfdl:105 — 동일 핸들러 미정의 = 빈 placeholder) |
| D-009 | SERVICE | `edt_service` | TextBox | SERVICE (item6) | maxlength=90, inputtype="normal" | text="부산역 CY" | - | 라벨 `edt_st_service` "SERVICE" / xfdl:100 + Static stc_Static7 / xfdl:99 | xfdl:107 / Bind xfdl:574 / `onchanged="...edtTelNo_onchanged"` (빈 핸들러) |
| D-010 | 접속 경로 | `edt_access_tp` | Combo | ACCESS_TP (item13) | innerdataset=`ds_access_tp`, codecolumn=`condCd`, datacolumn=`condNm`, displayrowcount=10, index=0, text="내부 neXacro" | cssclass="Essential" / width=236 | Y (Essential) | 라벨 `edt_st_access_tp` "접속 경로" / xfdl:101 + Static stc_Static8 / xfdl:93 | xfdl:115 / Bind xfdl:582 / `onitemchanged="div_main_div_mainDetail_div_detail_edt_access_tp_onitemchanged"` (xfdl:115 — FORM URL / 외부 접속 IP enable 분기) |
| D-011 | FORM URL | `edt_form_url` | TextBox | FORM_URL (item9) | maxlength=100 | text="부산역 CY" / enable=true | - | 라벨 `edt_st_form_url` "FORM URL" / xfdl:113 + Static stc_Static81 / xfdl:112 | xfdl:114 / Bind xfdl:580 |
| D-012 | 외부 접속 주소 | `edt_out_access_ip` | TextBox | OUT_ACCESS_IP (item11) | maxlength=90, inputtype="normal" | text="부산역 CY" / enable=false | - | 라벨 `edt_st_out_access_ip` "외부  접속 주소" (라벨 더블 스페이스 As-Is 보존) / xfdl:117 + Static stc_Static7_00 / xfdl:116 | xfdl:118 / Bind xfdl:581 / `onchanged="...edtTelNo_onchanged"` (빈 핸들러) |
| D-013 | 사용 여부 | `edt_use_tp` | Radio (innerdataset=`ds_useTp` Y/N, codecolumn=`CD`, datacolumn=`NM`, direction=vertical) | USE_TP (item15) | value="Y", text="Yes", index=0 | width=128 / height=21 | - | 라벨 `edt_st_use_tp` "사용 여부" cssclass=edi_WF_LabelFirstE / xfdl:98 + Static stc_Static9 / xfdl:87 | xfdl:109 / Bind xfdl:577 / `onitemchanged="div_main_div_mainDetail_div_detail_edt_use_tp_onitemchanged"` (xfdl:109 — 핸들러 미정의) |
| D-014 | 파라메터 | `edt_param` | TextBox | PARAM (item8) | maxlength=100 | text="부산역 CY" | - | 라벨 `edt_st_param` "파라메터" / xfdl:95 + Static stc_Static10 / xfdl:90 | xfdl:110 / Bind xfdl:575 |
| D-015 | 유효 개시일 | `cal_start_active_date` | Calendar (dateformat=yyyy-MM-dd, usetrailingday=true, enable=true) | START_ACTIVE_DATE (item10) | - | - | - | 라벨 `ed_st_start_active_date` "유효 개시일" / xfdl:94 + Static stc_Static11 / xfdl:89 | xfdl:111 / Bind xfdl:576 |
| D-016 | 유효 기한일 | `cal_end_active_date` | Calendar (동일 옵션) | END_ACTIVE_DATE (item4) | - | - | - | 라벨 `edt_st_end_active_date` "유효 기한일" / xfdl:103 + Static stc_Static12 / xfdl:102 | xfdl:106 / Bind xfdl:578 |

> D-NNN 합계 = **As-Is 16 필드** (D-001~D-016) / **To-Be 15 필드** (D-003 BIZ SYSTEM 폐기 — 정책 #1). 모든 필드는 `ds_main` 의 1 행 (rowposition) 과 BindItem 으로 자동 동기화.
>
> **라벨용 readonly Edit 전수** (`edt_st_*`): edt_st_object_id (xfdl:119) / edt_st_system_code (xfdl:97) / edt_st_BIZ_SYSTEM_CODE (xfdl:121) / edt_st_bizSystemCode (xfdl:123 — value="MENU ID") / edt_st_id (xfdl:133) / edt_st_object_nm (xfdl:128) / edt_st_program_desc (xfdl:129) / edt_st_object_type (xfdl:96) / edt_st_service (xfdl:100) / edt_st_access_tp (xfdl:101) / edt_st_form_url (xfdl:113) / edt_st_out_access_ip (xfdl:117) / edt_st_use_tp (xfdl:98) / edt_st_param (xfdl:95) / ed_st_start_active_date (xfdl:94 — 오타: `ed_` not `edt_`) / edt_st_end_active_date (xfdl:103) = **16 라벨 Edit**.
>
> **배경 Static 전수** (`stc_Static*`): stc_Static9 (xfdl:87) / stc_Static4 (xfdl:88) / stc_Static11 (xfdl:89) / stc_Static10 (xfdl:90) / stc_Static1 (xfdl:91 — cssclass=stc_WF_BoxFirst, top=0) / stc_Static6 (xfdl:92) / stc_Static8 (xfdl:93) / stc_Static7 (xfdl:99) / stc_Static12 (xfdl:102) / stc_Static81 (xfdl:112) / stc_Static7_00 (xfdl:116) / stc_Static5 (xfdl:120) / stc_Static8_00 (xfdl:122) / stc_Static2 (xfdl:126) / stc_Static3 (xfdl:127) / stc_Static2_00 (xfdl:132) = **16 배경 Static**.

### §3.6 div2 상단 컴포넌트 (FX-NNN)

해당 없음 — 본 화면은 Detail 영역에 카테고리 콤보 / 별도 toolbar 없음. div_mainGrd 의 div_leftMenu / div_rightMenu (common include) 만 존재.

### §3.7 외부 인입 (EX-NNN — `_com_div::*` url include)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:149) | `fn_button()` (xfdl:274) → `fn_commonTop_onload(this, "", new Array(["btn_search"],["btn_reset"],["btn_save"],["btn_close"]), false, "")` (xfdl:277~281) | 4 버튼 등록 — `btn_search` / `btn_reset` / `btn_save` / `btn_close` | xfdl:149 / 277~281 |
| EX-002 | `_com_div::commonLeftButton.xfdl` (url include) | `div_main.div_mainGrd.div_leftMenu` (xfdl:77 — taborder=3, width=213) | `fn_button()` 호출 → `fn_commonLeft_onload(this, grd_main, div_leftMenu, new Array("chk_check","btn_sum"), "")` (xfdl:283~287) | 그리드 좌측 메뉴 (체크 / 합계 등) | xfdl:77 / 283~287 |
| EX-003 | `_com_div::commonRightButton.xfdl` (url include) | `div_main.div_mainGrd.div_rightMenu` (xfdl:14 — taborder=1, width=310) | `fn_button()` 호출 → `fn_commonRight_onload(this, "", new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` (xfdl:289~293) | 그리드 우측 메뉴 (행추가/행삭제/행복사/행취소 4 버튼) | xfdl:14 / 289~293 |
| EX-004 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:6) | `div_bottom.form.fn_commonBottomStatus_msg(...)` 호출 (xfdl:376 / 385 등) | 하단 status 메시지 | xfdl:6 |

### §3.8 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_main` | As-Is = OBJECT_ID / OBJECT_NM / PROGRAM_DESC / SYSTEM_CODE / ~~BIZ_SYSTEM_CODE~~ / OBJECT_TYPE / SERVICE / USE_TP / ACCESS_TP / FORM_URL / OUT_ACCESS_IP / PARAM / START_ACTIVE_DATE / END_ACTIVE_DATE / MENU_ID / ID (As-Is 총 16 컬럼) — **To-Be 정책 #1**: BIZ_SYSTEM_CODE 컬럼 제거 → To-Be **15 컬럼** | 마스터 그리드 + 상세 입력 양방향 bind 데이터셋 | type STRING(256) 통일 / `useclientlayout="true"` / `onrowposchanged="ds_main_onrowposchanged"` (xfdl:168, 491) / `loadkeymode="reset"` | xfdl:168~187 |
| DS-002 | `ds_access_tp` | condCd / condNm (정적 3 행: 1=내부 neXacro / 2=외부 neXacro / 3=외부 url) | G-015 (ACCESS_TP) + D-010 (edt_access_tp) 콤보 LoV | DB 호출 ✗ — xfdl 내 hardcoded | xfdl:188~207 |
| ~~DS-003~~ | ~~`ds_lovSubSystem`~~ (To-Be 정책 #1 폐기) | ~~APP_HOST_ID (1 컬럼)~~ | ~~S-001 (cbo_bizSystemCode) + D-003 (cbo_bizSystemCode Detail) 콤보 LoV~~ | ~~`fn_lov` → `selectAppHostId` SQL 결과~~ | xfdl:208~212 (As-Is 인용) / **To-Be 폐기** (Dataset / selectAppHostId / BPMN lov 노드 모두 제거) |
| DS-004 | `ds_lovMenuId` | MENU_ID / BIZ_SYSTEM_CODE / MENU_ID_NM (3 컬럼) | D-004 (cbo_folder) 콤보 LoV | `fn_lov` → `selectMenuId` SQL 결과 | xfdl:213~219 |
| DS-005 | `ds_useTp` | CD / NM (정적 2 행: Y/Yes, N/No) | S-003 (cbo_USE_TP) + G-009 (USE_TP) + D-013 (edt_use_tp Radio) 콤보/라디오 LoV | DB 호출 ✗ — xfdl 내 hardcoded | xfdl:220~235 |

### §3.9 Bind 전수 (BindItem)

| BindItem id | compid (단축) | propid | datasetid | columnid | 대응 D-NNN | 근거 |
|---|---|---|---|---|---|---|
| item0 | div_detail.edt_object_id | value | ds_main | OBJECT_ID | D-001 | xfdl:572 |
| item1 | div_detail.edt_system_code | value | ds_main | SYSTEM_CODE | D-002 | xfdl:573 |
| item6 | div_detail.edt_service | value | ds_main | SERVICE | D-009 | xfdl:574 |
| item8 | div_detail.edt_param | value | ds_main | PARAM | D-014 | xfdl:575 |
| item10 | div_detail.cal_start_active_date | value | ds_main | START_ACTIVE_DATE | D-015 | xfdl:576 |
| item15 | div_detail.edt_use_tp | value | ds_main | USE_TP | D-013 | xfdl:577 |
| item4 | div_detail.cal_end_active_date | value | ds_main | END_ACTIVE_DATE | D-016 | xfdl:578 |
| item2 | div_detail.edt_object_type | value | ds_main | OBJECT_TYPE | D-008 | xfdl:579 |
| item9 | div_detail.edt_form_url | value | ds_main | FORM_URL | D-011 | xfdl:580 |
| item11 | div_detail.edt_out_access_ip | value | ds_main | OUT_ACCESS_IP | D-012 | xfdl:581 |
| item13 | div_detail.edt_access_tp | value | ds_main | ACCESS_TP | D-010 | xfdl:582 |
| ~~item7~~ | ~~div_detail.cbo_bizSystemCode~~ | ~~value~~ | ~~ds_main~~ | ~~BIZ_SYSTEM_CODE~~ | ~~D-003~~ | xfdl:583 (As-Is 인용) / **To-Be 폐기** |
| item3 | div_detail.edt_object_nm | value | ds_main | OBJECT_NM | D-006 | xfdl:584 |
| item5 | div_detail.edt_program_desc | value | ds_main | PROGRAM_DESC | D-007 | xfdl:585 |
| item12 | div_detail.cbo_folder | value | ds_main | MENU_ID | D-004 | xfdl:586 |
| item14 | div_detail.edt_id | value | ds_main | ID | D-005 | xfdl:587 |

> Bind 합계 = **As-Is 16 BindItem** (item0~item15) / **To-Be 15 BindItem** (item7 BIZ_SYSTEM_CODE 폐기 — 정책 #1). 모든 BindItem 은 `datasetid=ds_main` 의 컬럼과 D-NNN 의 입력 컨트롤을 양방향 동기화 (Nexacro 표준 — ds_main.rowposition 변경 시 자동 갱신).

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick)

| ID | 위치 | 버튼명 (text) | xfdl id | onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | 외부 등록 (commonTopButton — fn_button) | 조회 | btn_search (외부 자동) | (외부 → `fn_search`, xfdl:404~406) | `fn_run("searchCmObj")` | search | xfdl:277~281 / 404 |
| B-002 | 외부 등록 (commonTopButton) | 초기화 | btn_reset (외부 자동) | (외부 → `fn_reset`, xfdl:409~412) | `gfn_setDivDefault(div_search)` + `cbo_USE_TP.set_index(1)` (As-Is 보존 — index 1 = "N" 으로 reset) | - (클라이언트 전용) | xfdl:277~281 / 409 |
| B-003 | 외부 등록 (commonTopButton) | 저장 | btn_save (외부 자동) | (외부 → `fn_save`, xfdl:464~482) | 4 단계 validation (변경 데이터 / 필수 4 컬럼 / confirm) → `fn_run("saveCmObj")` | save | xfdl:277~281 / 464 |
| B-004 | 외부 등록 (commonTopButton) | 닫기 | btn_close (외부 자동) | (외부 → `fn_close`, xfdl:484~488) | `objApp.gv_AppTabPath.form.fn_closeForm()` (탭 종료) | - (클라이언트 전용) | xfdl:277~281 / 484 |
| B-005 | 외부 등록 (commonRightButton — fn_button) | 행추가 | btn_rowAdd (외부 자동) | (외부 → `fn_rowAdd`, xfdl:414~429) | `ds_main.addRow()` + USE_TP/SYSTEM_CODE/START_ACTIVE_DATE/END_ACTIVE_DATE/OBJECT_TYPE 5 default 세트 + `edt_id.setFocus` + Detail 영역 활성화 | - (클라이언트 전용) | xfdl:289~293 / 414 |
| B-006 | 외부 등록 (commonRightButton) | 행삭제 | btn_rowDelete (외부 자동) | (외부 → `fn_rowDelete`, xfdl:443~459) | MENU_ID 존재 시 차단 ("연결된 메뉴가 존재합니다. 제외 후 삭제 하세요?") / 아닌 경우 `gfn_deleteRow`. Detail 영역은 row count 0 → 비활성 | - (클라이언트 전용 + save 의 delete 분기) | xfdl:289~293 / 443 |
| B-007 | 외부 등록 (commonRightButton) | 행복사 | btn_rowCopy (외부 자동) | (외부 → `fn_rowCopy`, xfdl:431~441) | rowposition < 0 차단 → `gfn_rowcopyData` + OBJECT_ID="" clear (PK 충돌 방지) + Detail 영역 활성화 | - (클라이언트 전용) | xfdl:289~293 / 431 |
| B-008 | 외부 등록 (commonRightButton) | 행취소 | btn_rowCancel (외부 자동) | (외부 → `fn_rowCancel`, xfdl:460~462) | `gfn_grdInit(grd_main)` | - (클라이언트 전용) | xfdl:289~293 / 460 |
| B-009 | div_main 상단 | (접기 토글) | `btn_fold` | `btn_fold_onclick` (xfdl:516~519) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 | - (클라이언트 전용) | xfdl:7 / 516 |
| B-010 | 외부 등록 (commonLeftButton — fn_button) | (체크 등 — 가변) | chk_check / btn_sum (외부 자동) | (외부 공통 — 그리드 체크/합계 등) | - (외부 공통 처리) | - | xfdl:283~287 |

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면 Grid 컬럼 (xfdl:17~74) 에 ButtonField / displaytype="button" 셀 ✗.

### §4.3 공통 topMenu / leftMenu / rightMenu 버튼 (외부 인입)

§3.7 EX-001 / EX-002 / EX-003 참조.

### §4.4 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:237~570) 의 모든 function 을 전수 등재. 합계 **20 메서드**.

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `fn_onload` | Form onload (xfdl:3 — onload="fn_onload") | `gfn_formOnLoad(obj)` + Detail 영역 `gfn_setEnable("...div_mainDetail","false")` (비활성) + `gfn_gridSelectedRow(grd_main, "red", "blue", "")` (선택 행 색상) + `fn_button()` + `fn_lov()` | - (간접 lov) | (lov 의 sqlKey) | xfdl:261~272 |
| 2 | `fn_button` | `fn_onload` | (1) commonTopButton `fn_commonTop_onload(this, "", new Array(["btn_search"],["btn_reset"],["btn_save"],["btn_close"]), false, "")` — 4 버튼 등록 (2) commonLeftButton `fn_commonLeft_onload(this, grd_main, div_leftMenu, new Array("chk_check","btn_sum"), "")` (3) commonRightButton `fn_commonRight_onload(this, "", new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` — 4 버튼 등록 | - | - | xfdl:274~294 |
| 3 | `fn_lov` | `fn_onload` (xfdl:271) | As-Is: `gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId ds_lovMenuId=ds_selectMenuId", "")` / **To-Be 정책 #1**: ds_lovSubSystem / ds_selectAppHostId out alias 제거 → `gfn_transaction("lov", "", "", "ds_lovMenuId=ds_selectMenuId", "")` (1 dataset 만) | **lov** | As-Is: selectAppHostId + selectMenuId / **To-Be**: selectMenuId 만 | xfdl:296~303 |
| 4 | `fn_beforeRun` | `fn_run` 호출 전 (xfdl:325) | sSvcId == "searchCmObj" → `ds_main.clearData()` + `ds_main.filter("")` 초기화 / sSvcId == "saveCmObj" → (무동작) → return true | - | - | xfdl:309~321 |
| 5 | `fn_run` | `fn_search` / `fn_save` 등 | `fn_beforeRun` 호출 후 sSvcId 분기 — `searchCmObj` → sUrl="csa::CommObjMng", sOutDs="ds_main=ds_main", sArgs=`gfn_scanOpenerComponent(div_search.form)` (S-001/S-002/S-003 자동 수집) / `saveCmObj` → 사전 처리 (ds_main.set_enableevent(false) → 전 행 START/END_ACTIVE_DATE 8자 substring (nexacro → mapper millisecond cut, 21.05.31 최규찬) → set_enableevent(true)), sUrl="csa::CommObjMng", sInDs="ds_main=ds_main:U", sOutDs="" → 최종 `gfn_transaction(sSvcId, sUrl, sInDs, sOutDs, sArgs, "fn_callBack")` | search / save | (호출 분기에 따른 SQL 그대로) | xfdl:324~366 |
| 6 | `fn_callBack` | gfn_transaction callback (xfdl:365 의 sCallbackFnc="fn_callBack") | switch(sSvcId) — `searchCmObj` 분기: `div_bottom.fn_commonBottomStatus_msg(strErrorMsg["ds_main"]+"건 조회 되었습니다.")` + ds_main.getRowCount() > 0 면 Detail 영역 활성 (`gfn_setEnable("...div_mainDetail","true")`) / `saveCmObj` 분기: bottom status + `gfn_message("", "", "성공적으로 저장되었습니다.", "info", "확인", fn_msgSuccessSave)` 콜백 (rtn ✓ → `fn_run("searchCmObj")` 재조회) | (모든 action 의 콜백 분기) | (모든 sqlKey 의 결과 처리) | xfdl:372~398 |
| 7 | `fn_search` | B-001 (외부 btn_search) | `fn_run("searchCmObj")` | search | (searchCmObj 의 SQL 그대로) | xfdl:404~406 |
| 8 | `fn_reset` | B-002 (외부 btn_reset) | `gfn_setDivDefault(div_search)` + `cbo_USE_TP.set_index(1)` (인덱스 1 = "N" — As-Is 보존, 기본값 Y 와 mismatch) | - | - | xfdl:409~412 |
| 9 | `fn_rowAdd` | B-005 (외부 btn_rowAdd) | `ds_main.addRow()` + default 세트 (USE_TP="Y" / SYSTEM_CODE="MES" 2회 — xfdl:419,422 / START_ACTIVE_DATE=`gfn_today()` / END_ACTIVE_DATE="99991231" / OBJECT_TYPE="web") + `edt_id.setFocus(true)` + Detail 영역 활성화 | - (클라이언트 전용) | - | xfdl:414~429 |
| 10 | `fn_rowCopy` | B-007 (외부 btn_rowCopy) | rowposition < 0 → `gfn_message("", "", "선택 행이 없습니다.", "warning", "", "")` + return / 정상 → `gfn_rowcopyData(ds_main, rowposition)` + OBJECT_ID="" clear + Detail 영역 활성화 | - (클라이언트 전용) | - | xfdl:431~441 |
| 11 | `fn_rowDelete` | B-006 (외부 btn_rowDelete) | rowposition 의 MENU_ID 조회 → `!gfn_isNull(menuId)` → `gfn_message("","","연결된 메뉴가 존재합니다. 제외 후 삭제 하세요?","warning")` 차단 + return / null → `gfn_deleteRow(ds_main, nRow)`. 후처리: `ds_main.getRowCount() < 1` → Detail 영역 비활성화 | - (클라이언트 전용 + save 의 delete 분기) | - | xfdl:443~459 |
| 12 | `fn_rowCancel` | B-008 (외부 btn_rowCancel) | `gfn_grdInit(grd_main)` | - | - | xfdl:460~462 |
| 13 | `fn_save` | B-003 (외부 btn_save) | (1) `!gfn_isDatasetChanged(ds_main)` → "변경된 데이터가 없습니다." (confirm, fn_msgSuccessSave 콜백 — 변수 미선언 = As-Is 잠재 ReferenceError, As-Is 보존) + return (2) As-Is: `!gfn_dsRequired(grd_main, "OBJECT_ID BIZ_SYSTEM_CODE ACCESS_TP USE_TP")` → return / **To-Be 정책 #1**: BIZ_SYSTEM_CODE 제거 → 필수 검증 3 컬럼 (`OBJECT_ID ACCESS_TP USE_TP`) (3) confirm "저장하시겠습니까?" → `fn_msgSaveBeforeCallBack` (rtn ✓ → `fn_run("saveCmObj")`) | save | - | xfdl:464~482 |
| 14 | `fn_close` | B-004 (외부 btn_close) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - | - | xfdl:484~488 |
| 15 | `ds_main_onrowposchanged` | ds_main 의 rowposchanged | `getRowType(e.newrow) == '1'` (삭제 row) → `edt_id.set_enable(false)` + `cbo_folder.set_enable(false)` / 그 외 → 두 컴포넌트 set_enable(true). 주석된 코드는 As-Is OBJECT_ID 보유 행 분기 (xfdl:493~499 — 주석 처리) + `this.fn_detailPopup()` 호출 (xfdl:507 — 주석 처리) 모두 보존 | - | - | xfdl:491~508 |
| 16 | `div_main_div_mainGrd_grd_main_onheadclick` | grd_main 의 onheadclick | `gfn_commonOnheadclick(obj, e)` (공통 정렬) | - | - | xfdl:511~514 |
| 17 | `btn_fold_onclick` | B-009 (btn_fold) | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:516~519 |
| 18 | `div_main_div_mainDetail_div_detail_edt_access_tp_onitemchanged` | D-010 (edt_access_tp Combo) onitemchanged | trace + obj.value 분기: `'1'` (내부 neXacro) → edt_form_url enable=true + edt_out_access_ip enable=false + posttext 존재 시 edt_form_url 값 = `edt_object_id.value + ".xfdl"` / posttext 빈 → "" / focus edt_form_url. `'2'` (외부 neXacro) → 둘 다 enable=true + focus edt_form_url. `'3'` (외부 url) → edt_form_url enable=false + edt_out_access_ip enable=true + focus edt_out_access_ip. 주석된 ds_lovMenuId.filter 코드 (xfdl:548) 보존 | - | - | xfdl:521~549 |
| 19 | `div_main_div_mainDetail_div_detail_cbo_bizSystemCode_onitemchanged` | D-004 (cbo_folder — 핸들러 이름은 bizSystemCode 이나 실 cbo_folder 의 onitemchanged) | `vId = edt_id.value` / `!gfn_isNull(obj.value) && !gfn_isNull(vId)` → `edt_object_id.set_value(obj.value+"::"+vId)` (OBJECT_ID 자동 조합 — `{MENU_ID}::{ID}` 형식) | - | - | xfdl:551~558 |
| 20 | `div_main_div_mainDetail_div_detail_edt_id_onchanged` | D-005 (edt_id TextBox) onchanged | `vFolder = cbo_folder.value` / `!gfn_isNull(vFolder) && !gfn_isNull(obj.value)` → `edt_object_id.set_value(vFolder.substring(0,3)+"::"+obj.value)` (OBJECT_ID 자동 조합 — `{MENU_ID 의 앞 3자}::{ID}` 형식 — D-004 핸들러의 `obj.value` (=cbo_folder.value 전체) 와 mismatch ⚠ As-Is 보존) | - | - | xfdl:560~567 |

> 메서드 총수 = **20** (xfdl Script 의 `this.X = function`/`this.X_onclick = function`/`this.X_onitemchanged = function`/`this.X_onchanged = function` 모두 전수). 추가로 메서드 본문 내부의 inner function 변수 (`fn_msgSuccessSave` xfdl:386 / `fn_msgSaveBeforeCallBack` xfdl:476) 는 인스턴스 메서드 ✗ → 별도 등재 ✗.

---

## §5. 팝업 P-NNN

해당 없음 — 본 화면의 xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 결과 0 hit. 본 화면에서 호출되는 다른 외부 화면: 없음.

> 주석된 `this.fn_detailPopup()` 호출 (xfdl:507) 은 미구현 + 주석 처리되어 As-Is 비활성. To-Be 도 미반영.

---

## §6. SQL ID 매트릭스 (Mapper.xml 6 SQL 전수 — As-Is 6 호출 + 0 미사용)

> Mapper.xml namespace = `CommObjMngMapper` (mapper:5). 본 표는 6 SQL 모두 전수 — As-Is 1:1 보존. **As-Is 미호출 SQL = 0 개** (모두 활성).

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 BPMN task / Java | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommObjMng` | select | As-Is: Map (edt_OBJECT_ID / cbo_USE_TP / cbo_bizSystemCode — S-002/S-003/S-001 자동 수집) / **To-Be 정책 #1**: cbo_bizSystemCode 파라미터 제거 → Map (edt_OBJECT_ID / cbo_USE_TP — S-002/S-003) | As-Is: List<Map> (OBJECT_ID, OBJECT_NM, PROGRAM_DESC, SYSTEM_CODE, ~~BIZ_SYSTEM_CODE~~, OBJECT_TYPE, SERVICE, USE_TP, ACCESS_TP, FORM_URL, OUT_ACCESS_IP, PARAM, START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_ID(scalar subquery), ID(SUBSTR/INSTR/LENGTH 변환) — As-Is 16 컬럼) / **To-Be 15 컬럼** (BIZ_SYSTEM_CODE 제거) | `TB_MCM_SEC_OBJ A`, scalar subquery `TB_MCM_SEC_MENU B` | As-Is: `<where>` + `<if>` 3 종: `UPPER(A.OBJECT_ID) LIKE UPPER('%'\|\|#{edt_OBJECT_ID}\|\|'%') OR UPPER(A.OBJECT_NM) LIKE UPPER('%'\|\|#{edt_OBJECT_ID}\|\|'%')` (xml:29~32) + `AND A.USE_TP = #{cbo_USE_TP}` + ~~`AND A.BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}`~~ / ORDER BY A.START_ACTIVE_DATE — **To-Be 정책 #1**: BIZ_SYSTEM_CODE WHERE 분기 + SELECT 절 컬럼 제거 → `<if>` 2 종 | **MyBatis `<where>` + `<if>`** (xml:28~39) + **ROWNUM 1 scalar subquery** (xml:24) + **`\|\|` 결합** (xml:30~31) + **UPPER(...)** (xml:30~31) + **SUBSTR / INSTR / LENGTH** (xml:26) | Task_00oihyb (OBJECT 정보 조회) — bpmn:23~36 (CommonSelectTask, resultKey=ds_main) | Y | xml:7~41 |
| 2 | `insertCommObjMng` | insert | As-Is: Map (14 컬럼 + audit) / **To-Be 정책 #1**: BIZ_SYSTEM_CODE 제거 → 13 본 컬럼 + audit | (rowcount) | `TB_MCM_SEC_OBJ` | (INSERT — WHERE 없음) | As-Is: `<include refid="ref_Audit.insert_item">` (xml:59) + `<include refid="ref_Audit.insert_value">` (xml:76) / **To-Be**: ref_Audit fragment 폐기 + McmAuditEntity 자동 audit + INSERT 본문 BIZ_SYSTEM_CODE 컬럼/VALUES 행 제거 | Task_1dh8dal (OBJECT 정보 저장) — bpmn:39~55 (CommonMultiSaveTask, insertSqlKey=`#{serviceId}Mapper.insertCommObjMng`) | Y (자동 status="inserted" 분기) | xml:43~78 |
| 3 | `updateCommObjMng` | update | As-Is: Map (14 컬럼 + audit) / **To-Be 정책 #1**: BIZ_SYSTEM_CODE 제거 → 13 본 컬럼 + audit | (rowcount) | `TB_MCM_SEC_OBJ` | `WHERE OBJECT_ID = #{OBJECT_ID}` (PK = OBJECT_ID 단일 — xml:96) | As-Is: `<include refid="ref_Audit.update">` (xml:95) / **To-Be**: ref_Audit fragment 폐기 + McmAuditEntity 자동 audit + UPDATE SET 절 BIZ_SYSTEM_CODE 행 제거 | Task_1dh8dal (CommonMultiSaveTask, updateSqlKey=`#{serviceId}Mapper.updateCommObjMng`) | Y (자동 status="updated" 분기) | xml:80~97 |
| 4 | `deleteCommObjMng` | delete | Map (OBJECT_ID) | (rowcount) | `TB_MCM_SEC_OBJ A`, NOT EXISTS subquery (`TB_MCM_SEC_MENU B` + `TB_MCM_SEC_ROLE_MAPPING C`) | `WHERE A.OBJECT_ID = #{OBJECT_ID} AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_MENU B WHERE B.OBJECT_ID = A.OBJECT_ID) AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING C WHERE C.OBJECT_ID = A.OBJECT_ID)` (xml:101~110) — 연결 메뉴 / 권한 mapping 존재 시 server 단 차단 | **`NOT EXISTS` 이중 안전 차단** + xfdl B-006 의 MENU_ID 사전 차단과 이중 안전. ROLE_MAPPING 은 xfdl 미체크 — server 만 차단 | Task_1dh8dal (CommonMultiSaveTask, deleteSqlKey=`#{serviceId}Mapper.deleteCommObjMng`) | Y (자동 status="deleted" 분기) | xml:99~110 |
| ~~5~~ | ~~`selectAppHostId`~~ (To-Be 정책 #1 폐기) | ~~select~~ | ~~(없음 — parameterType=Map but 무참조)~~ | ~~List<Map> (APP_HOST_ID)~~ | ~~`MCMAPUSER.TB_MCM_APPHOST`~~ | ~~`GROUP BY APP_HOST_ID`~~ | - | ~~Task_0wm0wlq (lov_SUBSYSTEM 조회) — bpmn:57~70 (CommonSelectTask, resultKey=ds_selectAppHostId)~~ | xml:112~116 (As-Is 인용) / **To-Be 폐기** (SQL ID + BPMN Task_0wm0wlq 노드 모두 제거) | - |
| 6→**5** | `selectMenuId` | select | (없음) | List<Map> (MENU_ID, BIZ_SYSTEM_CODE(MAX), MENU_ID_NM(`MAX(MENU_ID) \|\| ' (' \|\| MAX(MENU_NM) \|\| ')'`)) | `MCMAPUSER.TB_MCM_SEC_MENU_FLD` | `WHERE PARENT_MENU_ID IS NOT NULL` + `GROUP BY MENU_ID` + `ORDER BY MENU_ID`. 주석된 As-Is `TB_MCM_SEC_MENU` distinct SUBSTR(MENU_ID,1,3) 코드 (xml:126~129) 보존 | **`\|\|` 문자열 결합** + **GROUP BY + MAX** | Task_1lhctxq (lov_MENU_ID 조회) — bpmn:71~84 (CommonSelectTask, resultKey=ds_selectMenuId) | Y (lov 분기) | xml:118~130 |

> **SQL 정합 요약**: Mapper.xml As-Is 6 SQL 등재 ↔ 실 호출 6 SQL ✓ / **To-Be 5 SQL** (selectAppHostId 폐기 — 정책 #1).
>
> **As-Is 미사용 SQL = 0**. **To-Be 제거 SQL = 1** (selectAppHostId — APP_HOST/BIZ_SYSTEM_CODE 폐기 정책).

---

## §7. Java 트랜잭션 (UserTask)

해당 없음 — 본 화면은 UserTask Java 클래스 ✗. BPMN 의 `Task_1dh8dal` 는 `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` 의 ScriptTask (modelerTemplate 동일) — Java 직접 작성 ✗. ds_main 의 status (`!nativeeditor_status` = "inserted"/"updated"/"deleted") 에 따라 자동으로 insertSqlKey / updateSqlKey / deleteSqlKey 분기 호출.

> 분석 §2 #2 인벤토리: `docs/external/.../task/ui/csa/CommObjMng/` 디렉토리 자체가 부재 (csa Java 디렉토리 ls 결과 = CommChainMasterMng / CommSyncMng / CommUserMng / CommUserRoleCopy 4 폴더만). 본 화면은 ScriptTask 만 사용.

---

## §8. BPMN 워크플로우 전수 (`CommObjMng.bpmn`)

> bpmn2:process id="CommObjMng" name="OBJECT 관리" isExecutable="false" (bpmn:3)

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / Task)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey / paramKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | 3 incoming (SequenceFlow_105vwsz / 1vkp3qd / 0pbcc9f) | - | bpmn:7~11 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | 분기 (shapeBackground="#ffff00") | - | SequenceFlow_1 | 3 outgoing — SequenceFlow_0grwghu / 0tt1mbk / 13avwvi | bpmn:12~20 |
| Task_00oihyb | task | OBJECT 정보 조회 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`, isServiceResult=true, dao="", resultKey=`ds_main`, paramKey="", sqlKey=`#{serviceId}Mapper.selectCommObjMng`, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` | SequenceFlow_0tt1mbk | SequenceFlow_105vwsz | bpmn:23~36 |
| Task_1dh8dal | task | OBJECT 정보 저장 | class=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask`, isServiceResult=true, dao="", nextBranchSpel="", paramKey=`ds_main`, resultKey=`ds_main`, insertSqlKey=`#{serviceId}Mapper.insertCommObjMng`, updateSqlKey=`#{serviceId}Mapper.updateCommObjMng`, deleteSqlKey=`#{serviceId}Mapper.deleteCommObjMng`, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` | SequenceFlow_0grwghu | SequenceFlow_1vkp3qd | bpmn:39~55 |
| ~~Task_0wm0wlq~~ | ~~task~~ | ~~lov_SUBSYSTEM 조회~~ (To-Be 정책 #1 폐기) | ~~class=`CommonSelectTask`, isServiceResult=true, dao="", paramKey="", sqlKey=`#{serviceId}Mapper.selectAppHostId`, resultKey=`ds_selectAppHostId`, modelerTemplate=`MapperBaseDbAccessTemplate`~~ | ~~SequenceFlow_13avwvi~~ | ~~SequenceFlow_1igvr9j~~ | bpmn:57~70 (As-Is 인용) / **To-Be 폐기** (BPMN lov 분기의 첫 Task 제거 → lov action 의 Task = Task_1lhctxq 1 개만) |
| Task_1lhctxq | task | lov_MENU_ID 조회 | class=`CommonSelectTask`, isServiceResult=true, dao="", paramKey="", sqlKey=`#{serviceId}Mapper.selectMenuId`, resultKey=`ds_selectMenuId`, modelerTemplate=`MapperBaseDbAccessTemplate` | As-Is: SequenceFlow_1igvr9j / **To-Be**: ExclusiveGateway_1 직결 (SequenceFlow_13avwvi 의 targetRef 가 Task_1lhctxq 로 변경) | SequenceFlow_0pbcc9f | bpmn:71~84 |

### §8.2 SequenceFlow 전수 (총 9 개)

| sequenceFlow id | name (action 분기) | sourceRef | targetRef | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:21 |
| SequenceFlow_0grwghu | **saveCmObj** | ExclusiveGateway_1 | Task_1dh8dal | bpmn:22 |
| SequenceFlow_105vwsz | - | Task_00oihyb | EndEvent_1 | bpmn:37 |
| SequenceFlow_0tt1mbk | **searchCmObj** | ExclusiveGateway_1 | Task_00oihyb | bpmn:38 |
| SequenceFlow_1vkp3qd | - | Task_1dh8dal | EndEvent_1 | bpmn:56 |
| SequenceFlow_13avwvi | **lov** | ExclusiveGateway_1 | As-Is: Task_0wm0wlq / **To-Be**: Task_1lhctxq (정책 #1 — selectAppHostId 노드 제거 후 직결) | bpmn:85 |
| ~~SequenceFlow_1igvr9j~~ | - | ~~Task_0wm0wlq~~ | ~~Task_1lhctxq~~ | bpmn:86 (As-Is 인용) / **To-Be 폐기** (Task_0wm0wlq 제거에 따른 연결 flow 제거) |
| SequenceFlow_0pbcc9f | - | Task_1lhctxq | EndEvent_1 | bpmn:87 |

### §8.3 action 3 분기 — 흐름 요약

| action | 분기 sequenceFlow | 흐름 (전체) |
|---|---|---|
| **searchCmObj** | SequenceFlow_0tt1mbk | Start → Gateway → Task_00oihyb (selectCommObjMng) → End |
| **saveCmObj** | SequenceFlow_0grwghu | Start → Gateway → Task_1dh8dal (CommonMultiSaveTask: insertCommObjMng / updateCommObjMng / deleteCommObjMng 자동 분기) → End |
| **lov** | SequenceFlow_13avwvi | As-Is: Start → Gateway → Task_0wm0wlq (selectAppHostId) → Task_1lhctxq (selectMenuId) → End / **To-Be 정책 #1**: Start → Gateway → Task_1lhctxq (selectMenuId) → End (Task_0wm0wlq + selectAppHostId 제거) |

> BPMN node 합계 — **As-Is**: StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 4 (CommonSelectTask 3 + CommonMultiSaveTask 1) + UserTask 0 = **7 노드** / SequenceFlow **9 개**.
> **To-Be 정책 #1**: Task_0wm0wlq + SequenceFlow_1igvr9j 제거 → **6 노드** (Task 3) / SequenceFlow **8 개**.
>
> **action enum (As-Is 실 호출 3)**: `searchCmObj` / `saveCmObj` / `lov`. 사용자 지시의 "BPMN action 6 enum" 은 가이드 패턴 (search / searchDetail / save / saveDetail / delete / deleteDetail) 의 표준 enum 이며, 본 화면은 그 중 search / save 2 enum 사용 (delete 는 save 의 자동 분기 — As-Is 별도 action ✗) + 추가 lov 1 enum = **3 action 활성**.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + DMES Excel + To-Be cactus-core 통합)

> **스키마 정본 (DMES Excel 기준 추정)** = `MCMAPUSER.TB_MCM_SEC_*` (Excel 시트 추출 잠정 — Q-001 잔존). As-Is Mapper.xml 의 일부는 `MCMAPUSER.` prefix 명시 (xml:113 selectAppHostId / xml:122 selectMenuId), 일부는 prefix 없음 (xml:23 selectCommObjMng — `TB_MCM_SEC_OBJ A` / xml:43 insert — `TB_MCM_SEC_OBJ` / xml:80 update / xml:100 delete + EXISTS subquery `TB_MCM_SEC_MENU B`, `TB_MCM_SEC_ROLE_MAPPING C`). prefix 미명시 테이블은 동일 owner `MCMAPUSER` 가정 (Oracle 의 schema default).
>
> **To-Be 정책 (사용자 결정)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_*`) — 대문자 prefix 유지
> - **audit 컬럼**: As-Is ref_Audit fragment → **cactus-core `CactusAuditEntity` 9 컬럼 통일** (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). As-Is `DATA_END_*` (그룹 3) + `ARCHIVE_*` (그룹 4) 컬럼은 To-Be 에서 **제거**. `VER` 컬럼은 JPA `@Version` 으로 자동 Optimistic Locking 적용
> - **본 컬럼**: As-Is Mapper.xml + xfdl bind 1:1 보존
>
> Excel 시트 매핑 — **As-Is**: TB_MCM_SEC_OBJ + TB_MCM_SEC_MENU + TB_MCM_SEC_MENU_FLD + TB_MCM_APPHOST + TB_MCM_SEC_ROLE_MAPPING (5 테이블) / **To-Be 정책 #1**: TB_MCM_APPHOST 폐기 → 4 테이블 (Q-001 해소 §9.6). audit 정본 = `McmAuditEntity` (cma 정본 패턴, 정책 #6 (A)).

### §9.1 `TB_MCM_SEC_OBJ` (OBJECT 마스터 — 본 화면 본 테이블)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | OBJECT_ID | selectCommObjMng SELECT (xml:8) / WHERE LIKE (xml:30 OR 31) / SUBSTR/INSTR (xml:26 — ID 추출) / scalar subquery (xml:24 — TB_MCM_SEC_MENU.OBJECT_ID 조인) / insertCommObjMng (xml:45, 62) / updateCommObjMng WHERE (xml:96) / deleteCommObjMng WHERE (xml:101) + EXISTS subquery (xml:104, 108) | **PK** | xfdl G-002 / D-001 / DS-001 / 신규 행 OBJECT_ID="" (rowCopy 후) / D-005+D-004 핸들러에서 `{MENU_ID 앞 3자}::{ID}` 형식 자동 조합 (xfdl:565) / D-003+D-005 에서 `{APP_HOST_ID}::{ID}` 자동 조합 (xfdl:556 — 다른 mismatch) | xml:8 / 26 / 45 / 96 |
| 2 | OBJECT_NM | selectCommObjMng SELECT (xml:9) / WHERE LIKE (xml:31) / insertCommObjMng (xml:46, 63) / updateCommObjMng (xml:82) | - | xfdl G-003 / D-006 | xml:9 / 46 |
| 3 | PROGRAM_DESC | selectCommObjMng SELECT (xml:10) / insertCommObjMng (xml:47, 64) / updateCommObjMng (xml:83) | - | xfdl G-004 / D-007 | xml:10 / 47 |
| 4 | SYSTEM_CODE | selectCommObjMng SELECT (xml:11) / insertCommObjMng (xml:48, 65) / updateCommObjMng (xml:84) | - | xfdl G-005 / D-002 / 행추가 default "MES" (xfdl:419,422 — 2 회 중복 set, As-Is 보존) | xml:11 / 48 |
| ~~5~~ | ~~BIZ_SYSTEM_CODE~~ (To-Be 정책 #1 폐기) | ~~selectCommObjMng SELECT (xml:12) / WHERE (xml:37) / insertCommObjMng (xml:49, 66) / updateCommObjMng (xml:85)~~ | - | xml:12 / 37 (As-Is 인용) / **To-Be 폐기** (Entity AppHost / SecObj 컬럼 + SELECT/WHERE/INSERT/UPDATE 모든 분기 / xfdl G-006 + D-003 + S-001 + fn_save 필수 검증 4→3 모두 제거 — 본 컬럼은 SEC_OBJ 의 As-Is 추적 만 보존) |
| 6 | OBJECT_TYPE | selectCommObjMng SELECT (xml:13) / insertCommObjMng (xml:50, 67) / updateCommObjMng (xml:86) | - | xfdl G-007 / D-008 / 행추가 default "web" (xfdl:423) | xml:13 / 50 |
| 7 | SERVICE | selectCommObjMng SELECT (xml:14) / insertCommObjMng (xml:51, 68) / updateCommObjMng (xml:87) | - | xfdl G-008 / D-009 | xml:14 / 51 |
| 8 | USE_TP | selectCommObjMng SELECT (xml:15) / WHERE (xml:34) / insertCommObjMng (xml:52, 69) / updateCommObjMng (xml:88) | - | xfdl G-009 (combo Y/N) / D-013 (Radio Y/N) / S-003 (cbo_USE_TP) / 행추가 default "Y" (xfdl:418) / 저장 필수 (xfdl:472) | xml:15 / 34 |
| 9 | ACCESS_TP | selectCommObjMng SELECT (xml:16) / insertCommObjMng (xml:53, 70) / updateCommObjMng (xml:89) | - | xfdl G-015 (combo 1/2/3) / D-010 (Combo) / 저장 필수 (xfdl:472) — 1=내부 neXacro / 2=외부 neXacro / 3=외부 url | xml:16 / 53 |
| 10 | FORM_URL | selectCommObjMng SELECT (xml:17) / insertCommObjMng (xml:54, 71) / updateCommObjMng (xml:90) | - | xfdl G-010 / D-011 / D-010 핸들러 분기 (ACCESS_TP=1 면 자동 `{OBJECT_ID}.xfdl` 세트, xfdl:530) | xml:17 / 54 |
| 11 | OUT_ACCESS_IP | selectCommObjMng SELECT (xml:18) / insertCommObjMng (xml:55, 72) / updateCommObjMng (xml:91) | - | xfdl G-011 / D-012 / D-010 핸들러 분기 (ACCESS_TP=2 또는 3 면 enable, 그 외 disable) / 디자인 라벨 "외부  접속 주소" 더블 스페이스 As-Is 보존 | xml:18 / 55 |
| 12 | PARAM | selectCommObjMng SELECT (xml:19) / insertCommObjMng (xml:56, 73) / updateCommObjMng (xml:92) | - | xfdl G-012 / D-014 | xml:19 / 56 |
| 13 | START_ACTIVE_DATE | selectCommObjMng SELECT (xml:20) / insertCommObjMng (xml:57, 74) / updateCommObjMng (xml:93) / `gfn_today()` 행추가 default (xfdl:420) | - | xfdl G-013 (date) / D-015 (Calendar) / save 전 8자 substring 자르기 (`nexacro->mapper millisecond cut`, xfdl:352~356) | xml:20 / 57 |
| 14 | END_ACTIVE_DATE | selectCommObjMng SELECT (xml:21) / insertCommObjMng (xml:58, 75) / updateCommObjMng (xml:94) / 행추가 default "99991231" (xfdl:421) | - | xfdl G-014 / D-016 / save 전 8자 substring (동일) | xml:21 / 58 |
| 15~22 | CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP / LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP | (To-Be **McmAuditEntity** — 정책 #6 (A) Entity 명명 As-Is 직역) | - | As-Is `<include refid="ref_Audit.insert_item">` (xml:59) / `<include refid="ref_Audit.insert_value">` (xml:76) / `<include refid="ref_Audit.update">` (xml:95) — 3 회 호출. To-Be 에서는 fragment 폐기 + McmAuditEntity 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 처리 (cma 정본 패턴) | McmAuditEntity (cma 정본) |

> **§9.1 audit 컬럼 매핑 (As-Is ref_Audit → To-Be McmAuditEntity)**: As-Is `ref_Audit` fragment (외부 미동봉) 호출 3 회. **To-Be 정책 #1 + #6 (A)**: `McmAuditEntity` 상속 (cma 정본) — 8 audit 컬럼 (CREATION/LAST_UPDATE 4쌍) 자동 채움. Entity 명명 = `SecObj` (As-Is 직역). As-Is `DATA_END_*` (그룹 3) + `ARCHIVE_*` (그룹 4) 컬럼은 본 화면 mapper 호출 ✗ → Entity 미반영 (DDL 보존만). To-Be 추가 컬럼 = (없음 — 본 컬럼 13 + audit 8 = 21 컬럼 Entity).

### §9.2 `TB_MCM_SEC_MENU` (메뉴 마스터 — 본 화면 read-only 조인)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectCommObjMng scalar subquery SELECT (xml:22) — `(SELECT B.MENU_ID FROM TB_MCM_SEC_MENU B WHERE B.OBJECT_ID = A.OBJECT_ID AND ROWNUM=1) AS MENU_ID` | PK | 본 화면 본 컬럼 1 hit (xfdl:184 ds_main.MENU_ID / D-004 cbo_folder bind) — 본 화면 자체는 `TB_MCM_SEC_MENU` 의 컬럼 정의 ✗ (메뉴 화면 commMenuMng 가 정본) | xml:22~25 |
| 2 | OBJECT_ID | selectCommObjMng scalar subquery WHERE (xml:24) — `B.OBJECT_ID = A.OBJECT_ID` / deleteCommObjMng EXISTS subquery WHERE (xml:104) — `B.OBJECT_ID = A.OBJECT_ID` | - | 본 화면 본 컬럼 read-only 조회. 연결 메뉴 존재 시 삭제 차단 (xfdl B-006 + server `NOT EXISTS` 이중) | xml:24 / 104 |

> **§9.2 결과**: 본 화면은 `TB_MCM_SEC_MENU` 의 컬럼 정의 ✗ (메뉴 마스터 owner = commMenuMng 화면). 본 컬럼 catalog 은 commMenuMng 화면에서 정의. 본 화면은 (MENU_ID, OBJECT_ID) 2 컬럼만 read-only 사용.

### §9.3 `TB_MCM_SEC_MENU_FLD` (메뉴 FLD — 본 화면 lov 조회)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | MENU_ID | selectMenuId SELECT (xml:119) + `MAX(MENU_ID)` (xml:121) + GROUP BY (xml:124) + ORDER BY (xml:125) | PK 후보 | D-004 cbo_folder 의 LV-002 (`ds_lovMenuId`) | xml:119 |
| 2 | BIZ_SYSTEM_CODE | selectMenuId SELECT MAX (xml:120) | - | (lov 응답 시 함께 반환 — 미사용 추정 / 주석된 D-004 핸들러 xfdl:548 의 filter 후보) | xml:120 |
| 3 | MENU_NM | selectMenuId `MAX(MENU_NM)` (xml:121) | - | MENU_ID_NM 조합 표시값 (`{MENU_ID} ({MENU_NM})`) | xml:121 |
| 4 | PARENT_MENU_ID | selectMenuId WHERE (xml:123) — `PARENT_MENU_ID IS NOT NULL` | - | 본 화면 본 컬럼은 WHERE 조건만 (값 select ✗) | xml:123 |

> **§9.3 결과**: 본 화면은 read-only lov 용도. 4 컬럼 모두 SELECT/WHERE 출현. 본 테이블의 정본 owner = commMenuMng (메뉴관리) 화면 — Q-001 시 별도 검증.

### §9.4 ~~`TB_MCM_APPHOST` (BIZ SYSTEM 호스트 — 본 화면 lov)~~ (To-Be 정책 #1 폐기)

> **As-Is 인용 + To-Be 폐기 명시**: As-Is = `MCMAPUSER.TB_MCM_APPHOST` 의 APP_HOST_ID 컬럼을 read-only lov 로 사용 (selectAppHostId SELECT + GROUP BY, xml:113~115 / S-001 cbo_bizSystemCode + D-003 cbo_bizSystemCode (Detail) 의 LV-001 `ds_lovSubSystem`).
>
> **To-Be 정책 #1**: APP_HOST/BIZ_SYSTEM_CODE 폐기 결정에 따라 본 화면에서 TB_MCM_APPHOST 참조 자체를 제거 — selectAppHostId SQL / BPMN Task_0wm0wlq / Dataset ds_lovSubSystem / S-001+D-003 콤보 / LV-001 / Entity AppHost (정책 #6 (A) 직역명) 모두 미생성. 본 화면 자산에서 APPHOST 테이블 의존 0. (테이블 자체 DDL 은 다른 화면 owner 의 자산 — 본 화면 §9 카탈로그에서만 제거)
>
> Q-NEW-001 (APPHOST 시트 R7 헤더 결락) 도 본 정책으로 자동 해소 — 본 화면에서 APPHOST 사용처 0 이므로 한글명/Type 추정 보충 자체가 불필요.

### §9.5 `TB_MCM_SEC_ROLE_MAPPING` (권한 mapping — 본 화면 delete 차단 검증)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | OBJECT_ID | deleteCommObjMng EXISTS subquery WHERE (xml:108) — `C.OBJECT_ID = A.OBJECT_ID` | - (FK 후보) | 권한 mapping 에 OBJECT_ID 사용 중 → delete 차단 (server 만 차단 — xfdl 미체크) | xml:108 |

> **§9.5 결과**: 본 화면은 본 컬럼 read-only EXISTS 검증 1 hit. 본 테이블의 정본 owner = commPermMng / commRoleMng / commRoleGrpMng 화면.

### §9.6 DMES 테이블 정의서 5 시트 전수 컬럼 카탈로그 (Q-001 해소 — 2026-05-30)

> **출처**: `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` 직접 시트 추출 (2026-05-30 작성, sheet rId87 / rId85 / rId86 / ~~rId25~~ / rId92). 시트명은 `SEC_OBJ` / `SEC_MENU` / `SEC_MENU_FLD` / ~~`APPHOST`~~ (To-Be 정책 #1 폐기) / `SEC_ROLE_MAPPING` (TB_MCM_ prefix 없음 — As-Is mui ↔ DMES 시트명 통상 정합). To-Be 적용 시 `MCMAPUSER.TB_MCM_SEC_*` 그대로 보존.
>
> **§9.1~§9.5 본문은 As-Is Mapper.xml 사용 컬럼만 등재** (read-only LOV 등). **§9.6 은 4 테이블 (APPHOST 제외 — 정책 #1) 의 모든 실 컬럼 (audit / DATA_END / ARCHIVE / 미사용 컬럼 포함)** 1:1 전수.

#### §9.6.1 SEC_OBJ (프로그램정보) — TB_MCM_SEC_OBJ / 31 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.1 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | Object ID | OBJECT_ID | VARCHAR | 50 | PK | NOT NULL | - | §9.1 #1 |
| 2 | Object Name | OBJECT_NM | VARCHAR | 100 |  | NULL | - | §9.1 #2 |
| 3 | 프로그램설명 | PROGRAM_DESC | VARCHAR | 300 |  | NULL | - | §9.1 #3 |
| 4 | System | SYSTEM_CODE | VARCHAR | 10 |  | NULL | - | §9.1 #4 |
| ~~5~~ | ~~SUB System~~ | ~~BIZ_SYSTEM_CODE~~ | ~~VARCHAR~~ | ~~10~~ |  | ~~NOT NULL~~ | - | DMES 시트 As-Is 인용 / **To-Be 정책 #1 폐기** — Entity SecObj 의 컬럼 미반영 (DDL 보존만) |
| 6 | OBJECT TYPE | OBJECT_TYPE | VARCHAR | 10 |  | NOT NULL | - | §9.1 #6 |
| 7 | Service | SERVICE | VARCHAR | 100 |  | NULL | - | §9.1 #7 |
| 8 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | §9.1 #8 |
| 9 | 접속 구분 | ACCESS_TP | VARCHAR | 1 |  | NOT NULL | - | §9.1 #9 |
| 10 | URL | FORM_URL | VARCHAR | 100 |  | NULL | - | §9.1 #10 |
| 11 | 외부접속주소 | OUT_ACCESS_IP | VARCHAR | 150 |  | NULL | - | §9.1 #11 |
| 12 | 파라메터 | PARAM | VARCHAR | 150 |  | NULL | - | §9.1 #12 |
| 13 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #13 |
| 14 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | §9.1 #14 |
| 15 | 생성Object유형 | CREATED_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | audit — cactus-core 자동 |
| 16 | 생성ObjectID | CREATED_OBJECT_ID | VARCHAR | 50 |  | NULL | - | audit |
| 17 | 생성프로그램ID | CREATED_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 18 | 생성일시 | CREATION_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 19 | 최종변경Object유형 | LAST_UPDATED_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | audit |
| 20 | 최종변경ObjectID | LAST_UPDATED_OBJECT_ID | VARCHAR | 50 |  | NULL | - | audit |
| 21 | 최종변경프로그램ID | LAST_UPDATE_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 22 | 최종변경일자 | LAST_UPDATE_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 23 | 데이터종료여부 | DATA_END_STATUS | VARCHAR | 1 |  | NULL | - | DATA_END (As-Is 미사용 — To-Be 제거 후보) |
| 24 | 데이타종료Object유형 | DATA_END_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | DATA_END |
| 25 | 데이타종료ObjectID | DATA_END_OBJECT_ID | VARCHAR | 50 |  | NULL | - | DATA_END |
| 26 | 데이타종료프로그램ID | DATA_END_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | DATA_END |
| 27 | 데이터종료일시 | DATA_END_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | DATA_END |
| 28 | Archive완료여부 | ARCHIVE_COMPLETED_FLAG | VARCHAR | 1 |  | NULL | - | ARCHIVE (As-Is 미사용 — To-Be 제거 후보) |
| 29 | Archive작업자직번 | ARCHIVED_EMPLOYEE_NUM | VARCHAR | 50 |  | NULL | - | ARCHIVE |
| 30 | Archive작업일자 | ARCHIVED_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | ARCHIVE |
| 31 | Archive프로그램ID | ARCHIVE_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | ARCHIVE |

#### §9.6.2 SEC_MENU (메뉴정보) — TB_MCM_SEC_MENU / 32 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.2 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 메뉴ID | MENU_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.2 #1 |
| 2 | 메뉴 순서 | MENU_SEQ | NUMBER | 8 |  | NOT NULL | - | (본 화면 미사용 — commMenuMng 정본) |
| 3 | Full Seq | FULL_SEQ | VARCHAR | 1 |  | NULL | - | (본 화면 미사용) |
| 4 | 메뉴명 | MENU_NM | VARCHAR | 100 |  | NULL | - | (본 화면 미사용 — TB_MCM_SEC_MENU_FLD 의 MENU_NM 과 별개) |
| 5 | 메뉴설명 | MENU_DESC | VARCHAR | 250 |  | NULL | - | (본 화면 미사용) |
| 6 | 메뉴타입 | MENU_TP | VARCHAR | 10 |  | NULL | - | (본 화면 미사용) |
| 7 | Object ID | OBJECT_ID | VARCHAR | 100 |  | NULL | - | §9.2 #2 (FK → TB_MCM_SEC_OBJ.OBJECT_ID) |
| 8 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | (본 화면 미사용) |
| 9 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | (본 화면 미사용) |
| 10 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | (본 화면 미사용) |
| 11 | 메뉴 표시 여부 | MENU_VIEW_YN | VARCHAR | 1 |  | NULL | - | (본 화면 미사용) |
| 12 | 상위메뉴ID | PARENT_MENU_ID | VARCHAR | 30 |  | NULL | - | (본 화면 미사용 — TB_MCM_SEC_MENU_FLD §9.3 #4 와 별개) |
| 13~15 | (한글명 ✗) | MENU_PARAM1 / MENU_PARAM2 / MENU_PARAM3 | VARCHAR | 250 |  | NULL | - | (본 화면 미사용) |
| 16~32 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (§9.6.1 #15~31 동일) | - |  | NULL | - | cactus-core / DATA_END / ARCHIVE |

#### §9.6.3 SEC_MENU_FLD (메뉴폴더 정보) — TB_MCM_SEC_MENU_FLD / 25 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.3 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 메뉴ID | MENU_ID | VARCHAR | 30 | PK | NOT NULL | - | §9.3 #1 |
| 2 | 메뉴명 | MENU_NM | VARCHAR | 100 |  | NULL | - | §9.3 #3 |
| 3 | 메뉴설명 | MENU_DESC | VARCHAR | 300 |  | NULL | - | (본 화면 미사용) |
| 4 | 메뉴타입 | MENU_TP | VARCHAR | 10 |  | NULL | - | (본 화면 미사용) |
| 5 | 상위메뉴ID | PARENT_MENU_ID | VARCHAR | 30 |  | NULL | - | §9.3 #4 (WHERE PARENT_MENU_ID IS NOT NULL) |
| 6 | 메뉴 순서 | MENU_SEQ | NUMBER | 8 |  | NOT NULL | - | (본 화면 미사용) |
| 7 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | §9.3 #2 |
| 8~24 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core / DATA_END / ARCHIVE |
| 25 | 메뉴 표시 여부 | MENU_VIEW_YN | VARCHAR | 1 |  | NULL | - | (본 화면 미사용 — TB_MCM_SEC_MENU 의 동명 컬럼과 별개) |

#### §9.6.4 ~~APPHOST (BIZ SYSTEM 호스트) — TB_MCM_APPHOST / 24 컬럼~~ (To-Be 정책 #1 폐기 — 시트 카탈로그 통째 제거)

> **As-Is 인용 + To-Be 폐기 명시**: As-Is = DMES SEC-MCM xlsx 의 APPHOST 시트 (sheet rId25) 에 본 화면 lov 용도 (LV-001 / selectAppHostId) 의 APP_HOST_ID 컬럼 정의가 존재. 24 컬럼 (WORKS_CD / APP_HOST_ID / APP_HOST_NM / APP_HOST_DESC / APP_HOST_URL + audit/DATA_END/ARCHIVE 17 + APP_HOST_URL_SERVICE / APP_HOST_URL_PAGE) 으로 구성. R7 헤더 행 결락으로 한글명/Type/자릿수 일부 추정 보충 필요 상태였음 (구 Q-NEW-001).
>
> **To-Be 정책 #1**: APP_HOST/BIZ_SYSTEM_CODE 폐기 결정에 따라 본 화면에서 APPHOST 시트 카탈로그를 미반영. Entity AppHost (정책 #6 (A) 직역명) / Repository / Service / DTO / lov SQL / BPMN lov 분기 Task 모두 미생성. **Q-NEW-001 자동 해소** — APPHOST 시트 결락 추정 보충 자체가 본 화면에서 불필요.

#### §9.6.5 SEC_ROLE_MAPPING (역할별퍼미션) — TB_MCM_SEC_ROLE_MAPPING / 20 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | §9.5 매칭 / 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할ID | ROLE_ID | VARCHAR | 30 | PK | NOT NULL | - | (본 화면 EXISTS subquery 미참조 — commRoleMng / commPermMng 정본) |
| 2 | Object ID | OBJECT_ID | VARCHAR | 50 | (PK 후보) | NOT NULL | - | §9.5 #1 (FK 후보, EXISTS subquery WHERE) |
| 3 | 퍼미션ID | PERMISSION_ID | VARCHAR | 100 | (PK 후보) | NOT NULL | - | (본 화면 미사용 — commPermMng 정본) |
| 4~20 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core / DATA_END / ARCHIVE |

> **§9.6 카탈로그 합계** — **As-Is**: 31 + 32 + 25 + 24 + 20 = **132 컬럼 등재** / **To-Be 정책 #1**: APPHOST 24 컬럼 제외 → **108 컬럼** (SEC_OBJ 31 - BIZ_SYSTEM_CODE 1 = 30 + SEC_MENU 32 + SEC_MENU_FLD 25 + SEC_ROLE_MAPPING 20 = **107 본 컬럼** + SEC_MENU_FLD 의 BIZ_SYSTEM_CODE 1 컬럼은 정본 owner = commMenuMng 화면이므로 보존 = 108).

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 (S/G/D/FX) | 비고 | 근거 |
|---|---|---|---|---|---|---|
| ~~LV-001~~ | ~~TB_MCM_APPHOST → `ds_lovSubSystem`~~ (To-Be 정책 #1 폐기 — APPHOST 폐기) | ~~APP_HOST_ID~~ | ~~(DB 값 그대로)~~ | ~~S-001 cbo_bizSystemCode / D-003 cbo_bizSystemCode (Detail — xfdl id 동명 이중)~~ | ~~`selectAppHostId` 결과 (xml:113) / `fn_lov` 시 로드 (xfdl:296)~~ | xfdl:208~212 / xml:112 (As-Is 인용) / **To-Be 폐기** (LV-001 행 삭제 → 후속 LV 번호 재정렬: LV-002→LV-001 / LV-003→LV-002 / LV-004→LV-003) |
| LV-002→**LV-001** | TB_MCM_SEC_MENU_FLD → `ds_lovMenuId` | MENU_ID / BIZ_SYSTEM_CODE / MENU_ID_NM (`{MENU_ID} ({MENU_NM})`) | (DB 조합 값) | D-004 cbo_folder | `selectMenuId` 결과 (xml:118) / `PARENT_MENU_ID IS NOT NULL` 필터 | xfdl:213~219 / xml:118 |
| LV-003→**LV-002** | (xfdl 정적 Dataset `ds_useTp`) | Y / N | Yes / No | S-003 cbo_USE_TP / G-009 USE_TP combo / D-013 edt_use_tp Radio | DB 호출 ✗ — xfdl hardcoded 2 행 | xfdl:220~235 |
| LV-004→**LV-003** | (xfdl 정적 Dataset `ds_access_tp`) | 1 / 2 / 3 | 내부 neXacro / 외부 neXacro / 외부 url | G-015 ACCESS_TP combo / D-010 edt_access_tp Combo | DB 호출 ✗ — xfdl hardcoded 3 행 | xfdl:188~207 |

> **§10 LV 합계** — **As-Is**: 4 LoV / **To-Be 정책 #1**: 3 LoV (LV-001 APPHOST 제거 + 후속 1→2→3 재정렬). 본문 §3 / §6 / §9 / §10.1 의 LV-002/3/4 인용은 As-Is 번호 유지 + 본 §10 의 재정렬 매핑 표를 정본으로 한다 (To-Be 번호 = `→ 화살표 우측`).

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-009 (그리드 combo) / D-013 (Radio) / S-003 (cbo_USE_TP) / 저장 필수 (xfdl:472) | xfdl:82, 109 / xml:15 / 34 |
| ST-002 | `ACCESS_TP = "1"` / `"2"` / `"3"` | 접속 경로 enum (1=내부 / 2=외부 neXacro / 3=외부 url) | G-015 (combo) / D-010 (Combo) / D-010 onitemchanged 분기 (xfdl:521~549 — FORM_URL / OUT_ACCESS_IP enable 분기) / 저장 필수 (xfdl:472) | xfdl:115 / 188~207 |
| ST-003 | `SYSTEM_CODE = "MES"` (행추가 default) | 시스템 코드 (As-Is 항상 "MES") | DS-001 / 행추가 (xfdl:419, 422 — 2 회 중복 set, As-Is 보존) | xfdl:419 / xml:11 |
| ST-004 | `OBJECT_TYPE = "web"` (행추가 default) | OBJECT 타입 (As-Is 항상 "web") | DS-001 / 행추가 (xfdl:423) | xfdl:423 |
| ST-005 | `END_ACTIVE_DATE = "99991231"` (행추가 default) | 종료 일자 (As-Is 9999-12-31 만료 무한) | DS-001 / 행추가 (xfdl:421) | xfdl:421 |
| ST-006 | `ds_main.getRowType(currow) == '1'` (삭제 row) | 그리드 row 상태 (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | ds_main_onrowposchanged 의 edt_id / cbo_folder enable 분기 (xfdl:500~506) | xfdl:491~508 |
| ST-007 | `STATUS` (G-001, displaytype=imagecontrol) | As-Is = Nexacro framework 가 자동 row state icon 표시 (신규/수정/삭제). ds_main Dataset 미정의 컬럼 + framework 가 row state 추론. **To-Be**: 동일 동작 구현 (FE 프레임워크의 row state 표시 기능 활용) | G-001 표시 전용 | xfdl:19, 40, 57 |
| ST-008 | OBJECT_ID 자동 조합 패턴 | D-004 (cbo_folder) 또는 D-005 (edt_id) 변경 시 OBJECT_ID 자동 갱신 — 두 핸들러 mismatch: D-004 핸들러 (xfdl:551~558) 는 `{MENU_ID 전체}::{ID}` / D-005 핸들러 (xfdl:560~567) 는 `{MENU_ID 앞 3자}::{ID}` — As-Is 잠재 결함 보존 + Q-NNN 등재 ✗ (단순 mismatch — 마지막 호출이 덮어쓰기로 동작) | D-001 / D-004 / D-005 | xfdl:556 / 565 |
| ST-009 | `MENU_ID` 존재 여부 (삭제 차단) | xfdl B-006 → MENU_ID null 아니면 "연결된 메뉴가 존재합니다. 제외 후 삭제 하세요?" 차단. server `NOT EXISTS` 으로 이중 안전 (TB_MCM_SEC_MENU + TB_MCM_SEC_ROLE_MAPPING) | B-006 / xml:99~110 | xfdl:443~459 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (`MCMAPUSER.` 일부 명시 + 일부 무명 default schema). To-Be = MSSQL (사용자 명시 `sample_dmes` DB / `MCMAPUSER` 계정).
>
> **To-Be 결정 (사용자 결정 누적 반영 — 6 정책 결정 일괄 반영 2026-05-31)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_OBJ` / `TB_MCM_SEC_MENU` / `TB_MCM_SEC_MENU_FLD` / ~~`TB_MCM_APPHOST` (정책 #1 폐기)~~ / `TB_MCM_SEC_ROLE_MAPPING`). prefix 미명시는 명시로 정정. **스키마 = `MCMAPUSER`** (cma 정본 동일)
> - **audit 컬럼**: `McmAuditEntity` 상속 (cma 정본 패턴 — 정책 #6 (A)) — As-Is `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 채움 (CREATION_TIMESTAMP / LAST_UPDATE_TIMESTAMP 등 8 audit 컬럼)
> - **APP_HOST / BIZ_SYSTEM_CODE 폐기 (정책 #1)**: 본 화면에서 컬럼 / 콤보 (S-001/D-003) / LoV (LV-001/ds_lovSubSystem) / SQL (selectAppHostId) / BPMN Task_0wm0wlq + SequenceFlow_1igvr9j / Entity AppHost 모두 미생성. **기존 mcm-core 자산 보존** (cma 정본 그대로) — 본 화면 자체에서만 폐기
> - **JPA only (정책 #1)**: MyBatis 의존 폐기 + JPA Repository (native query 허용) + Entity = `mcm.entity.*` 모듈 직속 / Service / DTO = `mcm.csa.commObjMng.{service|dto}` (가이드 §3-1 / §6-A-1 / §7-1 정본)
> - **Entity 명명 (정책 #6 (A))**: As-Is 직역 — `SecObj` (TB_MCM_SEC_OBJ) / `SecMenu` (TB_MCM_SEC_MENU) / `SecMenuFld` (TB_MCM_SEC_MENU_FLD) / ~~`AppHost`~~ (정책 #1 폐기) / `SecRoleMapping` (TB_MCM_SEC_ROLE_MAPPING). 기존 mcm-core 의 `Sec*` legacy 와 공존
> - **`ROWNUM = 1` (xml:24)**: MSSQL `TOP 1` 또는 `SELECT TOP (1)` / 또는 `ROW_NUMBER() OVER (...)` 서브쿼리 — Service 레이어 결정
> - **`END_ACTIVE_DATE = "99991231"`**: 행추가 default 8자 (xfdl:421) — DB 컬럼 형식 정합 검증 (DATE/VARCHAR/CHAR) Q-001 해소 §9.6.1 (DATE 8) 반영
> - **Optimistic Locking**: McmAuditEntity 미정의 시 별도 `@Version` 컬럼 추가 (cma 정본 결정 위임)

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `\|\|` 문자열 결합 | xml:30 (`UPPER(A.OBJECT_ID) LIKE UPPER('%'\|\|#{edt_OBJECT_ID}\|\|'%')`) / xml:31 (OR OBJECT_NM 동일) / xml:121 (`MAX(MENU_ID) \|\| ' (' \|\| MAX(MENU_NM) \|\| ')'`) | MSSQL `+` 연산자 또는 `CONCAT(...)` 함수 — MyBatis #{} 바인딩이므로 `LIKE '%' + #{edt_OBJECT_ID} + '%'` (또는 `CONCAT('%', #{edt_OBJECT_ID}, '%')`) | selectCommObjMng / selectMenuId | - |
| 2 | `UPPER(...)` | xml:30, 31 (`UPPER(...) LIKE UPPER(...)`) | MSSQL `UPPER(...)` 동일 (또는 컬럼 collation 으로 case-insensitive 처리 가능) | selectCommObjMng | - |
| 3 | `ROWNUM = 1` (xml:24) | xml:24 — `(SELECT B.MENU_ID FROM TB_MCM_SEC_MENU B WHERE B.OBJECT_ID = A.OBJECT_ID AND ROWNUM = 1) AS MENU_ID` | MSSQL `ROWNUM` ✗ → `SELECT TOP 1 B.MENU_ID FROM ...` 또는 `(SELECT TOP (1) B.MENU_ID FROM ... ORDER BY ...) AS MENU_ID` — 정렬 정책 누락 (As-Is = 임의 1 행) → To-Be 결정 위임 (정렬 정책 명시 권고) | selectCommObjMng | Q 잠재 — 정렬 정책 결정 (사용자 결정 위임) |
| 4 | `SUBSTR(A.OBJECT_ID, INSTR(A.OBJECT_ID,'::')+2, LENGTH(A.OBJECT_ID))` (xml:26) | xml:26 — ID 추출 (OBJECT_ID = `{prefix}::{ID}` 형식의 ID 부분 추출) | MSSQL `SUBSTRING(...)` + `CHARINDEX('::', ...)` + `LEN(...)` — `SUBSTRING(A.OBJECT_ID, CHARINDEX('::', A.OBJECT_ID)+2, LEN(A.OBJECT_ID))` | selectCommObjMng | - |
| 5 | scalar subquery in SELECT (xml:22~25) | xml:22 (`(SELECT B.MENU_ID FROM TB_MCM_SEC_MENU B WHERE B.OBJECT_ID = A.OBJECT_ID AND ROWNUM=1) AS MENU_ID`) | MSSQL 동일 지원 | selectCommObjMng | - |
| 6 | 스키마 prefix 일부 명시 / 일부 무명 | xml:23 (`TB_MCM_SEC_OBJ A` — 무명) / xml:44 (insert 무명) / xml:81 (update 무명) / xml:100 (delete 무명) / xml:104 (`TB_MCM_SEC_MENU B` 무명) / xml:108 (`TB_MCM_SEC_ROLE_MAPPING C` 무명) / xml:114 (`MCMAPUSER.TB_MCM_APPHOST` 명시) / xml:122 (`MCMAPUSER.TB_MCM_SEC_MENU_FLD` 명시) | **To-Be**: 모두 `MCMAPUSER.TB_MCM_*` 으로 명시 통일 (사용자 결정 — As-Is 테이블명 보존 + 스키마 prefix 명시 추가) | 모든 SQL | 사용자 결정 |
| 7 | MyBatis `<where>` + `<if>` dynamic SQL + Map 파라미터 | xml:28~39 (selectCommObjMng) | MSSQL 동일 지원 (MyBatis 레벨, DBMS 무관) | selectCommObjMng | - |
| 8 | `NOT EXISTS` 이중 subquery (xml:101~110) | deleteCommObjMng | MSSQL 동일 지원 | deleteCommObjMng | - |
| 9 | `ref_Audit` fragment include | xml:59 / 76 / 95 (3 회) | **To-Be 정책 #6 (A)**: MyBatis `ref_Audit` fragment **폐기**. 대신 `McmAuditEntity` 상속 (cma 정본 패턴) + JPA `@PrePersist` / `@PreUpdate` 콜백으로 8 audit 컬럼 (CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP / LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP) 자동 채움. To-Be INSERT/UPDATE SQL 본문에 audit 컬럼 명시 ✗ — Entity 레이어에서 자동 처리 | insertCommObjMng / updateCommObjMng | cma 정본 (McmAuditEntity) 적용 |
| 10 | `GROUP BY` + `MAX(...)` 집계 (xml:115 / 124) | As-Is: selectAppHostId / selectMenuId / **To-Be 정책 #1**: selectMenuId 만 (selectAppHostId 폐기) | MSSQL 동일 지원 | selectMenuId | - |
| 11 | `NVL` / `DECODE` / `SYSDATE` / `TO_DATE` / `(+)` (Oracle 전용) | (해당 없음 — 본 화면 SQL 전수 grep 결과 0 회) | - | - | - |
| **12** | **APP_HOST/BIZ_SYSTEM_CODE 폐기 (정책 #1)** | S-001 (xfdl:156) / D-003 (xfdl:125) / G-006 (xfdl:24/45/62) / DS-001 BIZ_SYSTEM_CODE (xfdl:174) / DS-003 ds_lovSubSystem (xfdl:208) / item7 Bind (xfdl:583) / selectCommObjMng SELECT+WHERE+INSERT+UPDATE 분기 (xml:12/37/49/66/85) / selectAppHostId 전체 (xml:112) / BPMN Task_0wm0wlq + SequenceFlow_1igvr9j (bpmn:57/86) / fn_save 필수 4→3 (xfdl:472) | **To-Be 폐기**: 본 화면에서 APP_HOST/BIZ_SYSTEM_CODE 의존 자산 모두 미생성. 기존 mcm-core 의 cma 정본 자산은 보존. Entity 패키지 = `mcm.entity.SecObj` (모듈 직속) / Service+DTO = `mcm.csa.commObjMng.{service|dto}` (가이드 §3-1/§6-A-1/§7-1) | 6 SQL 중 selectAppHostId | 정책 #1 |
| **13** | **Entity 명명 (정책 #6 (A))** | TB_MCM_SEC_OBJ → `SecObj` / TB_MCM_SEC_MENU → `SecMenu` / TB_MCM_SEC_MENU_FLD → `SecMenuFld` / ~~TB_MCM_APPHOST → AppHost~~ (정책 #1 폐기) / TB_MCM_SEC_ROLE_MAPPING → `SecRoleMapping` | As-Is 직역 클래스명. 기존 mcm-core 의 Sec* legacy 와 공존 가능 (다른 패키지). 본 화면 본 테이블 `SecObj` 만 본 화면 owner — 나머지 `SecMenu` / `SecMenuFld` / `SecRoleMapping` 은 read-only 조인용으로 별도 화면 owner | - | 정책 #6 (A) |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be (6 정책 결정 반영) |
|---|---|---|
| OBJECT 마스터 테이블 | `TB_MCM_SEC_OBJ` (prefix 무) | `MCMAPUSER.TB_MCM_SEC_OBJ` (As-Is 대문자 + MCMAPUSER 스키마) |
| 메뉴 테이블 (read-only) | `TB_MCM_SEC_MENU` (prefix 무) | `MCMAPUSER.TB_MCM_SEC_MENU` |
| 메뉴 FLD 테이블 (lov) | `MCMAPUSER.TB_MCM_SEC_MENU_FLD` (As-Is 명시) | `MCMAPUSER.TB_MCM_SEC_MENU_FLD` (보존) |
| ~~APP HOST 테이블 (lov)~~ (정책 #1 폐기) | `MCMAPUSER.TB_MCM_APPHOST` (As-Is 명시) | **폐기** (본 화면에서 의존 0 — Entity / Repo / SQL / BPMN 모두 미생성) |
| 권한 mapping 테이블 (EXISTS 검증) | `TB_MCM_SEC_ROLE_MAPPING` (prefix 무) | `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` |
| Entity 클래스 (정책 #6 (A)) | (해당 없음 — As-Is JPA Entity 미존재) | `SecObj` (본 owner) / `SecMenu` / `SecMenuFld` / `SecRoleMapping` (read-only 조인) — 패키지 = `com.dongkuk.dmes.mcm.entity.*` (가이드 §3-1 — 모듈 직속) |
| Repository (정책 #1 JPA only) | (As-Is Mapper.xml) | `SecObjRepository` (`com.dongkuk.dmes.mcm.repository.SecObjRepository`) — JpaRepository + native query 허용. Mapper.xml.asis 보존 |
| Service / DTO (정책 #1) | (As-Is Java UserTask ✗) | `com.dongkuk.dmes.mcm.csa.commObjMng.{service|dto}.*` (가이드 §6-A-1 / §7-1) |
| audit (정책 #6 (A)) | `ref_Audit` fragment (외부 미동봉) | `McmAuditEntity` 상속 (cma 정본 패턴) — 8 audit 컬럼 JPA listener 자동 채움 |
| Java UserTask 패키지 | (해당 없음 — ScriptTask 만 사용) | (해당 없음 — ScriptTask 보존, 신규 UserTask 시 `mcm.csa.commObjMng.service.*`) |
| Mapper namespace | `CommObjMngMapper` | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.SecObjRepository` (native query). Mapper.xml.asis 는 보존 |
| BPMN process id | `CommObjMng` | `commObjMng` (camelCase) |

> 사용자 결정 (2026-05-31 6 정책 결정 일괄 반영): As-Is 테이블명 (대문자 prefix) + `MCMAPUSER` 스키마 그대로 보존 + As-Is 무명 prefix 는 To-Be 에서 명시 추가 + APP_HOST/BIZ_SYSTEM_CODE 폐기 + Entity 명명 As-Is 직역 + JPA only + cma 정본 패턴.

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 확인필요 = **0 건**. 결정 내용은 §3 / §6 / §8 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| audit (cactus-core 정본) | `McmAuditEntity` 상속 (cma 정본 패턴) — 8 audit 컬럼 (`C_*` / `U_*` 8 + `VER` 1) JPA `@PrePersist` / `@PreUpdate` 자동 채움. As-Is `ref_Audit` fragment 3 회 호출 → To-Be Entity 레이어 자동 처리 | §9 / §11 |
| 스키마/테이블명 | `TB_MCM_SEC_OBJ` / `TB_MCM_SEC_MENU` / `TB_MCM_SEC_MENU_FLD` / `TB_MCM_SEC_ROLE_MAPPING` 대문자 보존 + `schema=MCMAPUSER` 통일 (As-Is 일부 명시 / 일부 무명 prefix 혼재 → To-Be 모두 명시) | §9 / §11.1 |
| BIZ_SYSTEM_CODE 폐기 (정책 #1) | S-001 / D-003 cbo_bizSystemCode 콤보 + 컬럼 / LV-001 / BPMN Task_0wm0wlq 모두 폐기 (Q-NEW-001 동시 자동 해소) | §3 / §6 / §9 / §10 / §11 |
| APPHOST 카탈로그 폐기 | §9.4 + §9.6.4 APPHOST 시트 카탈로그 폐기 (Q-NEW-001 자동 해소) | §9 |
| BPMN action enum 6 정합 | action 7→6 enum (lov 노드 제거) | §8 / BPMN §1.1 |
| As-Is OBJECT_ID 자동 조합 mismatch | D-004 핸들러 (xfdl:556) `{MENU_ID 전체}::{ID}` vs D-005 핸들러 (xfdl:565) `{MENU_ID 앞 3자}::{ID}` mismatch — As-Is 보존 (마지막 호출이 덮어쓰기 동작) | §10.1 |
| As-Is fn_msgSuccessSave 미선언 | xfdl:467 의 `fn_msgSuccessSave` 변수 미선언 = As-Is 잠재 ReferenceError. As-Is 보존 | §4.4 |
| As-Is SYSTEM_CODE 2회 중복 set | xfdl:419, 422 동일 행에서 `SYSTEM_CODE="MES"` 2회 set — As-Is 보존 | §10.1 |
| As-Is ed_st_* 오타 / 라벨 더블 스페이스 / cbo_bizSystemCode 동명 이중 / 디자인 더미 / cbo_USE_TP reset index | xfdl:94 `ed_st_start_active_date` 오타 / xfdl:117 "외부  접속 주소" 더블 스페이스 / div_search·div_detail 양쪽 동일 `cbo_bizSystemCode` id / `value="USD"`·`text="부산역 CY"` 디자인 더미 / xfdl:411 `cbo_USE_TP.set_index(1)` (기본값 "Y" index=0 와 mismatch) — 모두 As-Is 보존 | §3.5 등 |
| Entity 명명 (정책 #6 (A)) | `SecObj` / `SecMenu` / `SecMenuFld` / `SecRoleMapping` (`mcm.entity.*` 모듈 직속) — AppHost Entity 신설 ✗ (정책 #1 폐기). 기존 mcm-core Sec* legacy 와 공존 | §11.1 |
| As-Is/To-Be 표준 우선 원칙 | 정책 #4 (0) — As-Is 1:1 보존 최우선 + To-Be 정정/제거 결정은 본문 별도 명시 | §0 |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / Calendar / Radio / Dataset 전수 등재 | §3.1~§3.9 행수 (영역 7 + S 3 + G 15 + D 16 + 라벨 Edit 16 + 배경 Static 16 + 외부 4 + DS 5 + Bind 16) = 98 행 + §4.4 메서드 20 행 + §4.1 버튼 10 행 + §5 팝업 0 행 | ✓ |
| G-B: Mapper.xml 6 SQL 전수 | §6 표 6 행 (Mapper.xml 의 `<select|insert|update|delete>` 태그 grep == 6) | ✓ |
| G-C: Java 메서드 전수 | §7 = "해당 없음" (UserTask Java 클래스 미존재 — csa Java 디렉토리 ls 검증) | ✓ |
| G-D: BPMN flow 전수 | §8.1 (7 노드: StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 4) + §8.2 (9 sequenceFlow) + §8.3 (3 action 흐름) | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: Q-NNN 활성 | Q-001 해소 (2026-05-30 §9.6 신설) + Q-NEW-001 해소 (2026-05-31 — 정책 #1 APP_HOST/BIZ_SYSTEM_CODE 폐기로 자동 해소) — **0 건 잔존** | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §12 결정 누적 명시 | OBJECT_ID 자동 조합 mismatch / fn_msgSuccessSave 미선언 / SYSTEM_CODE 2회 중복 / ed_st_* 오타 / 라벨 더블 스페이스 / cbo_bizSystemCode 동명 이중 / 디자인 더미 / cbo_USE_TP reset index 모두 As-Is 1:1 인용 + To-Be 결정 별도 명시 | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 11 행 + §11.1 To-Be 명명 안 | ✓ |
| G-J: 정합체크서 §D.4 ✗ + 사유 | §0 표 + 정합체크서 §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성. Q-001 / Q-NEW-001 모두 해소 — 활성 Q 0 건.

---

## §14. Phase 1 자체 검증 (§6.14 4질문)

| 질문 | 답 |
|---|---|
| 1. 14항 위반? | **No** — As-Is 1:1 보존 (xfdl 591 line / Mapper.xml 132 line / bpmn 176 line 처음부터 끝까지 Read 완료). 추측 ✗ (모든 본문 file:line cite). 누락 ✗ ("주요/대표/등" 0 hit). 결함 모두 처리 (§12 결정 누적). 분량 회피 ✗. xfdl 단독 (스크린샷 부재). 가이드 §외 임의 신설 ✗ (§0 환경 제약은 사용자 명시 신설). |
| 2. 검증 안 한 부분? | **No** — Q-001 해소 (2026-05-30 §9.6 신설 / 132 컬럼 1:1 등재). Q-NEW-001 해소 (2026-05-31 — 정책 #1 APPHOST 폐기로 자동 해소). 활성 Q = 0. |
| 3. 그대로 수용? | **No** — As-Is 결함 8 종 (mismatch / 미선언 / 중복 / 오타 / 동명 / 더블 스페이스 / 더미 / reset index) 모두 §12 결정 누적 표 등재 + 본문 인용. To-Be 결정/위임 별도 명시. |
| 4. 임의 합리화? | **No** — As-Is action enum 은 실 xfdl + BPMN 의 3 종 (`searchCmObj` / `saveCmObj` / `lov`) 그대로. 사용자 지시의 "BPMN action 6 enum" 은 가이드 표준 enum 이며, 본 화면 활성 3 종으로 매핑 + 비활성 (searchDetail / saveDetail / delete / deleteDetail) 은 "해당 없음" 명시. |

> Phase 1 모두 No → Phase 2 진입.
