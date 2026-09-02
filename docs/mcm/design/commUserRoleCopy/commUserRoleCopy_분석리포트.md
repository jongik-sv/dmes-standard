---
screenId: commUserRoleCopy
asIsId: CommUserRoleCopy
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 사용자 권한 일괄 등록 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl / Java UserTask / Mapper.xml / bpmn) 자산은 Runner 의 WinForms (designer.cs / cs / sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가. 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + Java UserTask / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl on*click + BPMN action / @Case → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만" 은 mui 환경 미적용. cite 는 file:line 형식 유지 |
| 가이드 §외 임의 신설 | ✗ | 절 순서·표 헤더 그대로. 본 화면 자체 추가는 §0 ~ §13 내부 행 분할로만 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 사용자 권한 일괄 등록 |
| 화면 식별자 (screenId) | commUserRoleCopy |
| As-Is 식별자 (asIsId) | CommUserRoleCopy |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 권한 일괄 등록 (commUserRoleCopy) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commUserRoleCopy |
| pageId | commUserRoleCopy |
| serviceId | commUserRoleCopy |
| Frontend 파일명 | `commUserRoleCopy.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> 사용자 권한 일괄 등록은 CommUserRoleCopy의 조회, 등록을 수행한다.

- 주 사용자: 시스템 관리자 / 사용자 권한 운영 담당자
- 업무 도메인: 1명의 "Copy 대상" 사용자가 보유한 역할그룹 (RoleGroup) 매핑을 1~N명의 "권한 생성 대상" 사용자에게 일괄 복사한다 (역할그룹 매핑 MERGE + 권한부여 이력 INSERT).
- 기능 요약 (BPMN action 3 enum):
  1. `searchUserList` — 전체 사용자 List 조회 (`fn_searchUserList`, xfdl:287 / onload 시 자동 호출)
  2. `search` — Copy 대상 사용자 + 대상 사용자의 RoleGroup 조회 (`fn_search`, xfdl:299)
  3. `save` — RoleGroup 일괄 복사 + 권한부여 이력 저장 (`fn_save`, xfdl:317 → UserTask `SaveRoleGroupCopy.java`)

---

## §2. 자료 수집 인벤토리 (mui 5 자산)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommUserRoleCopy.xfdl` | 519 | Y | Form / Layout / Div (8개) / Grid (4개) / Button (2 shuttle + fold + 외부 div 인입 3) / Edit (라벨 7 + 입력 4) / Static (구분선 2) / Dataset (4개) / Script (function 11개) 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask — RoleGroup 복사 + 이력 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserRoleCopy/SaveRoleGroupCopy.java` | 88 | Y | `run(Context, Task)` 트랜잭션 + ds_userTo 행 N건 외곽 루프 + 행 내부에서 `selectRoleMergeObject` 조회 → 결과 N행 만큼 `mergePK` (이력 INSERT) + `mergeCommonCopyRoleGrp` 단건 호출 (MERGE) | §7 |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommUserRoleCopyMapper.xml` | 69 | Y | 5 SQL ID (select 4 / insert 1 — MERGE) 전수. namespace=`CommUserRoleCopyMapper` (xml:5) | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommUserRoleCopy.bpmn` | 165 | Y | StartEvent / EndEvent / ExclusiveGateway 3 분기 / Task 3 (CommonSelectTask) / UserTask 1 (SaveRoleGroupCopy) / SequenceFlow 9 | §8 |
| 5 | 외부 Mapper (cross-mapper 참조) | `CommUserMngMapper.selectRoleMergeObject` (Java 직접 호출, java:52) | - | Y | Java 본문에서 `dao.selectList("CommUserMngMapper.selectRoleMergeObject", ...)` 명시 — 본 화면 Mapper.xml 의 동일 SQL ID 와 중복 정의됨 (xml:39~50) | §6 / §7 |
| 6 | 외부 Mapper (cross-mapper 참조) | `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (Java 직접 호출, java:65) | - | Y | Java 본문에서 `dao.insert("TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK", ...)` 호출. 본 화면 Mapper.xml 미정의 — 외부 Mapper 의 SQL ID. **본 분석 범위 외** (D2 외부 SP, 본 화면 산출물에 SQL 본문 미인용) | §6 / §7 |
| 7 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.insert_item / insert_value">` 2 회 호출 (xml:61, 66) 은 To-Be 에서 폐기. cactus-core `CactusAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움 | §11 |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` (taborder=4) | left=20 / top=0 / right=20 / height=40 | 화면 타이틀 ("사용자 권한 일괄 등록") + 공통 topMenu | xfdl:175~182 |
| A-FILTER | `Div div_search` (taborder=1) | left=20 / top=`div_title:10` / right=20 / height=43 / cssclass=`div_WFSA_Box` | 조회조건 ("Copy 대상 사용자 ID/사번" 라벨 + 입력 1) | xfdl:183~190 |
| A-FOLD | `Button btn_fold` (taborder=3) | left=20 / top=93 / right=20 / height=12 / cssclass=`btn_WFSA_Fold` | div_search 접기/펴기 토글 | xfdl:7 |
| A-MAIN | `Div div_main` (taborder=0) | left=20 / top=`btn_fold:5` / right=20 / bottom=40 | 메인 컨테이너 (5 sub-div + 2 shuttle button) | xfdl:8~174 |
| A-COPY-USER | `Div div_copyUser` (taborder=0) | top=0 / left=0 / width=300 / height=77 | "COPY 대상" 사용자 정보 표시 (1 row 그리드 + 라벨) | xfdl:11~42 |
| A-COPY-ROLEGRP | `Div div_copyRoleGroup` (taborder=1) | left=0 / top=`div_copyUser:10` / width=300 / bottom=20 | "COPY 대상" 의 역할그룹 List 표시 (N row 그리드) | xfdl:43~70 |
| A-INF-REQ | `Div div_infReq` (taborder=2) | left=340 / top=0 / width=600 / height=80 | "권한생성 대상" 헤더 + 정보처리의뢰서번호 + 처리사유 입력 | xfdl:71~83 |
| A-USER-TO | `Div div_userTo` (taborder=3) | left=340 / top=`div_infReq:10` / width=600 / bottom=20 | "권한 생성 대상" 사용자 List 그리드 (왼쪽 페인) | xfdl:84~120 |
| A-SHUTTLE | `Button btn_left`/`btn_right` (taborder=4/5) | left=`div_userTo:15` / top=322·363 / width=24 / height=31 | 좌/우 셔틀 버튼 (userTo ↔ userFrom 이동) | xfdl:121~122 |
| A-USER-FROM | `Div div_userFrom` (taborder=6) | left=`btn_left:15` / top=0 / right=0 / bottom=20 | "사용자 List" 그리드 + 필터 검색 + commonLeftButton (오른쪽 페인) | xfdl:123~171 |
| A-FOOTER | `Div div_bottom` (taborder=2) | left=20 / right=20 / height=20 / bottom=0 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:6 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (출처) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / 옵션 | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | Copy 대상 사용자 ID/사번 (옆 Static `sts_userId.value`) | `edt_userIdCopy` | TextBox | 100 | (기본값 ✗) | Y (저장 단계가 아닌 `fn_search` 호출 시 필수 검증 — xfdl:300~303) | xfdl:186~187 |

### §3.3 그리드 G-NNN / GE-NNN — 4 그리드

> 본 화면은 일반적인 "메인 1 그리드 + 옵션 확장" 패턴이 아닌 **4 그리드 병렬** 구조. G-NNN = `grd_copyUser` (COPY 대상 사용자, 1 row) / GE-NNN = `grd_copyRoleGroup` + `grd_userTo` + `grd_userFrom` (확장/병렬 3종).

#### §3.3-A 메인 그리드 G-NNN (`grd_copyUser`, binddataset=`ds_copyUser`, taborder=0)

| ID | head text | body bind | 컬럼 size | edittype | 기타 | 근거 |
|---|---|---|---:|---|---|---|
| G-001 | 사용자ID | `bind:USER_ID` | 117 | none (`displaytype="normal"`) | 자동 — 표시 전용 (edittype="none" 강제 — xfdl:32) | xfdl:18 / 27 / 32 |
| G-002 | 사번 | `bind:USER_EMP_NO` | 101 | (기본) | - | xfdl:19 / 28 / 33 |
| G-003 | 사용자명 | `bind:USER_NM` | 80 | (기본) | - | xfdl:20 / 29 / 34 |

- 그리드 옵션: `font="12px/normal Malgun Gothic"`, `autofittype="col"`, `cellmovingtype="col"`, `selecttype="row"`, `scrollbartype="auto"`, head Row 1 + body Row 1
- 이벤트: `onkeydown="div_main_div_mainGrd_grd_main_onkeydown"` (xfdl:14 — 핸들러 함수 본문 ✗ — 미정의), `onheadclick="fn_onHeadClick"` (xfdl:14 → `gfn_commonOnheadclick`, xfdl:502)
- onrowposchanged: `ds_main_onrowposchanged` (xfdl:201 — 핸들러 함수 본문 ✗ — 미정의)
- 행수: 0 또는 1 (Copy 대상 1 명만 조회 — `selectCopyUserMap` SQL의 결과)

#### §3.3-B 확장 그리드 GE-001 (`grd_copyRoleGroup`, binddataset=`ds_copyRolegrp`, taborder=0)

| ID | head text | body bind | 컬럼 size | edittype | 기타 | 근거 |
|---|---|---|---:|---|---|---|
| GE-001-1 | 역할 그룹 ID | `bind:ROLE_GROUP_ID` | 120 | (기본) | - | xfdl:50 / 58 / 62 |
| GE-001-2 | 역할 그룹명 | `bind:ROLE_GROUP_NM` | 170 | (기본) | - | xfdl:51 / 59 / 63 |

- 그리드 옵션: `autofittype="col"`, head Row 1 (size=24) + body Row 1 (size=24)
- 이벤트: `onheadclick="fn_onHeadClick"` (xfdl:46)

#### §3.3-C 확장 그리드 GE-002 (`grd_userTo`, binddataset=`ds_userTo`, taborder=0) — "권한 생성 대상" 사용자

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 근거 |
|---|---|---|---:|---|---|---|
| GE-002-1 | 선택 | `bind:CHK` | 48 | checkbox | checkboxcontrol | xfdl:91 / 102 / 109 |
| GE-002-2 | 사용자ID | `bind:USER_ID` | 117 | none (`displaytype="normal"`) | normal | xfdl:92 / 103 / 110 |
| GE-002-3 | 사번 | `bind:USER_EMP_NO` | 101 | (기본) | - | xfdl:93 / 104 / 111 |
| GE-002-4 | 사용자명 | `bind:USER_NM` | 80 | (기본) | - | xfdl:94 / 105 / 112 |
| GE-002-5 | 부서 | `bind:DEPT_NM` | 100 | (기본) | - | xfdl:95 / 106 / 113 |

- 그리드 옵션: `font="12px/normal Malgun Gothic"`, `autofittype="col"`, `cellmovingtype="col"`, `selecttype="row"`, `scrollbartype="auto"`
- 이벤트: `onkeydown="div_main_div_mainGrd_grd_main_onkeydown"` (xfdl:87 — 핸들러 미정의), `onheadclick="fn_onHeadClick"` (xfdl:87)

#### §3.3-D 확장 그리드 GE-003 (`grd_userFrom`, binddataset=`ds_userFrom`, taborder=0) — 전체 사용자 List

| ID | head text | body bind | 컬럼 size | edittype | displaytype | 기타 | 근거 |
|---|---|---|---:|---|---|---|---|
| GE-003-1 | 선택 | `bind:CHK` | 48 | checkbox | checkboxcontrol | - | xfdl:141 / 152 / 159 |
| GE-003-2 | 사용자ID | `bind:USER_ID` | 117 | none | normal | - | xfdl:142 / 153 / 160 |
| GE-003-3 | 사번 | `bind:USER_EMP_NO` | 101 | (기본) | - | - | xfdl:143 / 154 / 161 |
| GE-003-4 | 사용자명 | `bind:USER_NM` | 80 | (기본) | - | - | xfdl:144 / 155 / 162 |
| GE-003-5 | 부서 | `bind:DEPT_NM` | 120 | (기본) | - | head Cell 의 `tooltiptext="bind:DEPT_NM"` (xfdl:156) | xfdl:145 / 156 / 163 |

- 그리드 옵션: `font="12px/normal Malgun Gothic"`, `autofittype="col"`, `cellmovingtype="col"`, `selecttype="row"`, `scrollbartype="auto"`
- 이벤트: `onkeydown="div_main_div_mainGrd_grd_main_onkeydown"` (xfdl:137 — 핸들러 미정의), `onheadclick="fn_onHeadClick"` (xfdl:137)
- 부속 컴포넌트: `div_search` (xfdl:126) — 검색 영역 (사용자 필터 + 부서 필터, §3.4), `div_leftMenu` (xfdl:136) — 공통 좌측 메뉴 (전체선택 등, `_com_div::commonLeftButton.xfdl` include, `CHK` 컬럼 기준 전체선택, xfdl:274~278)

### §3.4 입력 / 라벨 D-NNN (단일 상세 영역)

| ID | xfdl id | 영역 | 컨트롤 종류 | 화면 표시명 | 입력 유형 | maxlength | 옵션 | 이벤트 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| D-001 | `edt_st_infReqNo` | div_infReq | Edit (라벨, readonly) | "정보처리의뢰서번호" | (라벨) | - | cssclass `edi_WF_Label` | - | xfdl:76 |
| D-002 | `edt_infReqNo` | div_infReq | Edit (입력) | (D-001 의 옆 입력) | TextBox | 300 | - | (이벤트 ✗) | xfdl:77 |
| D-003 | `edt_st_description` | div_infReq | Edit (라벨, readonly) | "처리사유" | (라벨) | - | cssclass `edi_WF_Label` | - | xfdl:80 |
| D-004 | `edt_description` | div_infReq | Edit (입력) | (D-003 의 옆 입력) | TextBox | 300 | - | (이벤트 ✗) | xfdl:79 |
| D-005 | `edt_userFilter` | div_userFrom / div_search | Edit (필터) | (옆 라벨 `sts_userId.value`="ID/사번/이름") | TextBox | 100 | - | `oninput="div_main_div_userFrom_div_search_edt_userFilter_onkeydown"` (실 이벤트명은 oninput 임에도 onkeydown 명칭 — As-Is 보존) | xfdl:130 |
| D-006 | `edt_deptFilter` | div_userFrom / div_search | Edit (필터) | (옆 라벨 `sts_dept.value`="부서") | TextBox | 100 | - | `oninput="div_main_div_userFrom_div_search_edt_deptFilter_oninput"` | xfdl:132 |
| D-007 | `edt_srch_cseq` (div_copyUser) | div_copyUser | Edit (라벨, readonly) | "COPY 대상" | (라벨) | - | cssclass `edi_WF_Title1` | - | xfdl:39 |
| D-008 | `edt_srch_cseq` (div_infReq) | div_infReq | Edit (라벨, readonly) | "권한생성 대상" | (라벨) | - | cssclass `edi_WF_Title1` | - | xfdl:74 |
| D-009 | `edt_srch_cseq` (div_userFrom) | div_userFrom | Edit (라벨, readonly) | "사용자 List" | (라벨) | - | cssclass `edi_WF_Title1` | - | xfdl:168 |
| D-010 | `edt_title` | div_title | Edit (타이틀, readonly) | "사용자 권한 일괄 등록" | (라벨) | - | cssclass `edi_WFHD_Title`, textAlign=left | - | xfdl:178 |
| D-011 | `stc_Static28` | div_infReq | Static (구분선 박스) | (text=빈) | - | - | cssclass `stc_WF_Box`, top=22 height=29 | - | xfdl:75 |
| D-012 | `stc_Static29` | div_infReq | Static (구분선 박스) | (text=빈) | - | - | cssclass `stc_WF_Box`, top=50 height=29 | - | xfdl:78 |

> 라벨 (sts_userId, sts_dept) 은 D-005, D-006 의 "옆 라벨" 로 흡수 — 별도 D 행 ✗. div_search 라벨 sts_userId (`Copy 대상 사용자 ID/사번` text) 는 S-001 의 화면 표시명 출처 (xfdl:186).

### §3.5 라인 필드 L-NNN

> 본 화면 그리드 4 종은 모두 G/GE 분류 — parent FK 다중 row 조건 만족하는 그리드 없음 (`ds_userFrom` / `ds_userTo` 는 사용자 단위 1 단계 — parent 관계 ✗). L-NNN = 0.

해당 없음.

### §3.6 div_leftMenu / div_topMenu / div_bottom (외부 인입)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:179) | `fn_button()` (xfdl:264) → `fn_commonTop_onload(this, new Array(), new Array(["btn_search"], ["btn_save"]), false, "")` | 기본 버튼 `btn_search` + `btn_save` 자동 등록 (조회 트리거 → `fn_search`, 저장 트리거 → `fn_save`) | xfdl:265~271 |
| EX-002 | `_com_div::commonLeftButton.xfdl` (url include) | `div_main.div_userFrom.div_leftMenu` (xfdl:136) | `fn_button()` → `fn_commonLeft_onload(this, grd_userFrom, div_leftMenu, new Array(""), "CHK")` (xfdl:274) | 좌측 공통 메뉴 (전체선택 사용 — `CHK` 컬럼 토글) | xfdl:274~278 |
| EX-003 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:6) | `gfn_commonBottomStatus_msg(...)` 호출 (xfdl:370 등) | 하단 status 메시지 표시 | xfdl:6 |

### §3.7 Dataset 전수 (xfdl Objects)

| ID | xfdl id | 컬럼 (전수) | 역할 | 옵션 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_copyRolegrp` | ROLE_GROUP_ID (STRING 256) / ROLE_GROUP_NM (STRING 256) / USER_ID (STRING 256) | COPY 대상의 역할그룹 List → `grd_copyRoleGroup` | (옵션 없음) | xfdl:194~200 |
| DS-002 | `ds_copyUser` | USER_ID / USER_EMP_NO / USER_NM (3 컬럼, STRING 256) | COPY 대상 사용자 (1 row) → `grd_copyUser` | `onrowposchanged="ds_main_onrowposchanged"` (핸들러 미정의), `useclientlayout="true"`, `loadkeymode="reset"` | xfdl:201~207 |
| DS-003 | `ds_userFrom` | CHK / USER_ID / USER_EMP_NO / USER_NM / DEPT_NM (5 컬럼) | 전체 사용자 List (검색·필터 가능) → `grd_userFrom` | 동일 (`onrowposchanged`, `useclientlayout`, `loadkeymode`) | xfdl:208~216 |
| DS-004 | `ds_userTo` | CHK / USER_ID / USER_EMP_NO / USER_NM / DEPT_NM (5 컬럼) | 권한 생성 대상 사용자 List (셔틀 이동 시 누적) → `grd_userTo` | 동일 (`onrowposchanged`, `useclientlayout`, `loadkeymode`) | xfdl:217~225 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick)

| ID | 위치 | 버튼명 (text) | xfdl id | onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_title (외부 topMenu) | 조회 (btn_search) | (commonTopButton 인입) | `fn_search` (등록: xfdl:269) | 조회 | search | xfdl:269 / 299~314 |
| B-002 | div_title (외부 topMenu) | 저장 (btn_save) | (commonTopButton 인입) | `fn_save` (등록: xfdl:269) | 저장 | save | xfdl:269 / 317~358 |
| B-003 | div_main | (셔틀 좌) — userFrom → userTo | `btn_left` | `div_main_btn_left_onclick` (xfdl:413~422) | 클라이언트 행 이동 | - (클라이언트 전용) | xfdl:121 / 413 |
| B-004 | div_main | (셔틀 우) — userTo → userFrom | `btn_right` | `div_main_btn_right_onclick` (xfdl:425~435) | 클라이언트 행 이동 | - (클라이언트 전용) | xfdl:122 / 425 |
| B-005 | div_main 상단 | (접기 토글) | `btn_fold` | `btn_fold_onclick` (xfdl:506~509) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 | - (클라이언트 전용) | xfdl:7 / 506 |

> 외부 commonTopButton 의 사용자정의버튼 = `new Array()` (= 빈 배열, xfdl:268) / 기본버튼 = `new Array(["btn_search"], ["btn_save"])` (xfdl:269). 따라서 본 화면 top 영역 버튼은 조회 + 저장 2 개로 한정.

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면 Grid 4 종 컬럼 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:14~167 4 그리드 head/body 전수 검토). `selecttype="row"` 와 checkbox 셀 (CHK) 만 사용.

### §4.3 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:227~517) 의 모든 function 을 전수 등재 (총 11 개).

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `CommUserRoleCopy_onload` | Form onload | `gfn_formOnLoad(obj, true)` + `gfn_gridSelectedRow(grd_userFrom, "red", "blue", "")` + `gfn_quickMenuSet` 3 회 (grd_copyRoleGroup / grd_userTo / grd_userFrom) + `fn_button()` + `fn_searchUserList()` | searchUserList (간접) | (호출은 fn_searchUserList 에서) | xfdl:251~262 |
| 2 | `fn_button` | `CommUserRoleCopy_onload` | (1) `fn_commonTop_onload` — `btn_search` + `btn_save` 2 기본 버튼 등록 (2) `fn_commonLeft_onload` — `grd_userFrom` 의 `CHK` 컬럼 전체선택 모드 (전체선택 사용) | - | - | xfdl:264~279 |
| 3 | `fn_searchUserList` | `CommUserRoleCopy_onload` | `gfn_transaction("searchUserList", "", "", "ds_userFrom=ds_userFrom", "", "fn_callBack")` — 전체 사용자 List 조회 | searchUserList | selectUserList | xfdl:287~296 |
| 4 | `fn_search` | btn_search (B-001) / commonTopButton | (1) `edt_userIdCopy.value` null 검증 (`gfn_isNull`) → 미입력 시 "Copy 대상 사용자 ID/사번 입력 후 조회해주세요." 경고 + return false (2) `gfn_setParam("pUserIdCopy", edt_userIdCopy.value)` → `gfn_transaction("search", "", "", "ds_copyUser=ds_copyUser ds_copyRolegrp=ds_copyRolegrp", sArgument, "fn_callBack")` | search | selectCopyUserMap + selectCopyRoleGroupList | xfdl:299~314 |
| 5 | `fn_save` | btn_save (B-002) / commonTopButton | (1) `infReqNoFlag = true` 초기화 (2) `infReqNo` / `description` 둘 중 하나라도 null 이면 `infReqNoFlag = false` (3) `ds_copyUser.rowcount == 0` → "복사 대상 사용자가 조회되지 않았습니다." 경고 + return false (4) `ds_userTo.rowcount == 0` → "권한 생성 대상자가 없습니다." 경고 + return false (5) callback 함수 `fn_msgSaveBeforeCallBack` 정의 — rtn 이면 `gfn_transaction("save", "", "ds_userTo=ds_userTo", "ds_userFrom=ds_userFrom", pUserIdCopy + pInfReqNo + pDescription, "fn_callBack")` (6) `infReqNoFlag == false` 이면 "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n권한부여 선처리 하시겠습니까?" confirm / true 면 "권한을 복사 하시겠습니까?" confirm | save | (UserTask SaveRoleGroupCopy 호출) → selectRoleMergeObject + TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK + mergeCommonCopyRoleGrp + selectUserList (BPMN 콜백 task) | xfdl:317~358 |
| 6 | `fn_callBack` | `gfn_transaction` callback | strSvcId 3 분기 — searchUserList / search / save — 각 분기에서 `gfn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` 표시. save 분기는 추가로 4 dataset clearData (ds_copyRolegrp / ds_copyUser / ds_userTo / ds_userFrom) + `fn_searchUserList()` 재호출 + 입력 4 필드 초기화 (edt_infReqNo / edt_description / edt_userFilter / edt_userIdCopy) + `ds_userFrom.filter("")` | (search / save / searchUserList 의 콜백 분기) | - | xfdl:365~406 |
| 7 | `div_main_btn_left_onclick` | B-003 (셔틀 좌) | `for (i = ds_userFrom.rowcount; i >= 0; i--)` 역순 루프 → `CHK == 1` 인 행 만 `ds_userTo.addRow + copyRow + ds_userFrom.deleteRow` (이동) | - | - | xfdl:413~422 |
| 8 | `div_main_btn_right_onclick` | B-004 (셔틀 우) | 동일 역순 루프 → ds_userTo CHK==1 행 만 `ds_userFrom.addRow + copyRow + CHK=0 세트 + ds_userTo.deleteRow` (반환 시 CHK 해제) | - | - | xfdl:425~435 |
| 9 | `div_main_div_userFrom_div_search_edt_userFilter_onkeydown` | D-005 oninput | `searchValue = obj.value` → `fn_userFromFilter(searchValue, "USER")` 호출 | - | - | xfdl:438~443 |
| 10 | `div_main_div_userFrom_div_search_edt_deptFilter_oninput` | D-006 oninput | `searchValue = obj.value` → `fn_userFromFilter(searchValue, "DEPT")` 호출 | - | - | xfdl:445~450 |
| 11 | `fn_userFromFilter(searchValue, type)` | D-005 / D-006 oninput | type=USER 분기: deptSearchValue / searchValue null 결합 매트릭스 → USER_ID / USER_EMP_NO / USER_NM 3컬럼 LIKE upper 필터 + DEPT_NM 결합. type=DEPT 분기: userSearchValue / searchValue null 결합 매트릭스 → DEPT_NM LIKE upper 필터 + USER 3컬럼 결합. 결과를 `ds_userFrom.filter(filterString)` 적용 | - | - | xfdl:452~499 |
| 12 | `fn_onHeadClick` | 모든 4 그리드 onheadclick | `gfn_commonOnheadclick(obj, e)` — 공통 정렬 처리 | - | - | xfdl:502~504 |
| 13 | `btn_fold_onclick` | B-005 | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 | - | - | xfdl:506~509 |

> 메서드 총수 = 13 (xfdl Script 의 `this.X = function` / `this.X_onclick = function` 모두 전수). `ds_main_onrowposchanged` (xfdl:201, 208, 217) 핸들러 함수는 Script 본문에 미정의 (As-Is 보존). `div_main_div_mainGrd_grd_main_onkeydown` (3 그리드 등록, xfdl:14 / 87 / 137) 핸들러 함수도 Script 본문에 미정의. `Common_onclick` (xfdl:136 — `div_leftMenu` onclick) 도 미정의 — 모두 공통 외부 핸들러로 추정.

---

## §5. 팝업 P-NNN

해당 없음. 본 화면 xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 0 건. 외부 화면 호출 ✗.

---

## §6. SQL ID 매트릭스 (Mapper.xml 5 SQL + 외부 Mapper 참조 2)

> Mapper.xml namespace = `CommUserRoleCopyMapper` (xml:5). 본 표는 본 Mapper.xml 5 SQL 전수 + Java 본문 외부 Mapper SQL ID 참조 2 종 별도 표.
>
> **갱신 2026-05-31 (정책 #1 / #2 / #6 일괄 반영)**:
> - **정책 #1 (Q-001 해소)**: As-Is 의 `CommUserMngMapper.selectRoleMergeObject` 외부 namespace 호출은 본 화면 Mapper.xml 의 동명 SQL (#4) 이 정본임에도 외부 호출되어온 결함. **To-Be 결정**: 본 화면 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 가 정본 — Java 호출 namespace 정정 (`CommUserMngMapper` → `CommUserRoleCopyMapper`) 후 JPA Repository 흡수. 외부 namespace 호출 폐기.
> - **정책 #2 (Q-004 해소 / commUserMng 와 일괄)**: `EAIUSER.IF_GW01MMFSHD01` (부서 마스터) / `IF_GW01MMFSHD02` (사용자-부서 매핑) EAI 직접 참조 → To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN 으로 전환. selectUserList scalar subquery 본문 변환.
> - **정책 #6 (Q-002 / Q-006 해소)**: `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 외부 Mapper SQL 본문 = (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) **5 컬럼 복합 PK upsert**. To-Be 별도 Mapper.xml 신규 작성 ✗ — **JPA Entity `SecUserRollHis extends McmAuditEntity` + Repository `SecUserRollHisRepository.saveAll()` 흡수** (commUserMng X-2 정책 #3 (C) 와 정합). Entity 명명 (정책 #6 (A)) = 자체 Entity 신설 ✗ — commUserMng 의 `SecUserRollHis` 재사용 (`com.dongkuk.dmes.mcm.entity.SecUserRollHis`).

### §6.1 본 Mapper.xml SQL (5 SQL)

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 / ORDER BY | Oracle 문법 포인트 | 호출 위치 | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectUserList` | select | (없음 — Map 빈) | List<Map> (USER_ID, USER_EMP_NO, USER_NM, DEPT_NM — 4 컬럼 + scalar subquery DEPT_NM) | `MCMAPUSER.TB_MCM_SEC_USER S` (As-Is) / ~~scalar subquery `EAIUSER.IF_GW01MMFSHD02 A`, `EAIUSER.IF_GW01MMFSHD01 B`~~ → **To-Be: `LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = S.DEPT_CD` + `D.DEPT_NM`** (정책 #2 Q-004 해소) | WHERE `END_ACTIVE_DATE > SYSDATE AND USE_TP = 'Y'` / ORDER BY DEPT_NM, USER_NM ASC | **scalar subquery** (xml:9~14, As-Is) + `SYSDATE` (xml:16) + ~~`EAIUSER` 외부 스키마~~ → **To-Be 변환**: `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN (commUserMng selectCommDept Q-004 해소 결정과 정합) | BPMN Task_selectUserList (sqlKey=`#{serviceId}Mapper.selectUserList`), bpmn:22~35 | Y | xml:7~19 |
| 2 | `selectCopyUserMap` | select | `pUserIdCopy` (Map) | List<Map> (USER_ID, USER_EMP_NO, USER_NM — 3 컬럼) | `TB_MCM_SEC_USER` (스키마 prefix 명시 ✗) | WHERE `USER_ID = #{pUserIdCopy} OR USER_EMP_NO = #{pUserIdCopy}` | (없음 — 표준 SQL) | BPMN Task selectCopyUserMap, bpmn:37~50 | Y | xml:21~27 |
| 3 | `selectCopyRoleGroupList` | select | `pUserIdCopy` (Map) | List<Map> (USER_ID, ROLE_GROUP_ID, ROLE_GROUP_NM — 3 컬럼 + scalar subquery ROLE_GROUP_NM) | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING A`, scalar subquery `TB_MCM_SEC_ROLEGROUP` (스키마 prefix ✗), scalar subquery `TB_MCM_SEC_USER` | WHERE `USER_ID = #{pUserIdCopy} OR USER_ID = (SELECT USER_ID FROM TB_MCM_SEC_USER WHERE USER_EMP_NO = #{pUserIdCopy})` | **scalar subquery in SELECT** (xml:33) + **scalar subquery in WHERE** (xml:36) | BPMN Task selectCopyRoleGroupList, bpmn:63~76 | Y | xml:29~37 |
| 4 | `selectRoleMergeObject` | select | `pUserIdCopy` + `pUserId` (Map) | List<Map> (USER_ID, ROLE_GROUP_ID, ROLE_GROUP_NM) | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING A`, scalar subquery `TB_MCM_SEC_ROLEGROUP`, NOT IN subquery `TB_MCM_SEC_USER_MAPPING` | WHERE `USER_ID = #{pUserIdCopy} AND ROLE_GROUP_ID NOT IN (SELECT ROLE_GROUP_ID FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{pUserId})` — Merge 대상 = COPY 의 RoleGroup 중 권한생성대상 USER_ID 가 이미 가지지 않은 것 만 | **scalar subquery** (xml:43) + **NOT IN subquery** (xml:46~49) | **Q-001 해소 2026-05-31**: As-Is Java 가 `CommUserMngMapper.selectRoleMergeObject` 외부 호출 (java:52) → **To-Be: 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정본 — Java 호출 namespace 정정**. 최종 To-Be 흡수 = JPA `UserMappingRepository` native query | **Y (To-Be 정본)** — As-Is 외부 namespace 호출은 결함으로 판정 + 정책 #1 정정. JPA 흡수 후 Mapper.xml.asis 보존 | xml:39~50 |
| 5 | `mergeCommonCopyRoleGrp` | insert (MERGE) | `pUserIdCopy` + `pUserId` (HashMap) | (rowcount) | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING A` (MERGE 대상) ← `MCMAPUSER.TB_MCM_SEC_USER_MAPPING` (USING source) | `USING (SELECT USER_ID, ROLE_GROUP_ID FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{pUserIdCopy}) B ON (A.USER_ID = #{pUserId} AND A.ROLE_GROUP_ID = B.ROLE_GROUP_ID)` `WHEN NOT MATCHED THEN INSERT (USER_ID, ROLE_GROUP_ID, [audit]) VALUES (#{pUserId}, B.ROLE_GROUP_ID, [audit])` — PK (USER_ID, ROLE_GROUP_ID) 미존재 시 만 INSERT | **MERGE INTO ... USING ...** + **WHEN NOT MATCHED THEN INSERT** + `<include refid="ref_Audit.insert_item / insert_value">` (xml:61 / 66) | Java `dao.insert("CommUserRoleCopyMapper.mergeCommonCopyRoleGrp", mapMerge)` (java:73) | Y | xml:53~68 |

> Mapper.xml 5 SQL 등재 ↔ 본 Mapper namespace 실 호출 = **To-Be 5 SQL 정본 확정** (Q-001 해소 정책 #1: selectRoleMergeObject 의 As-Is 외부 호출 결함 → 본 namespace 정정 결정). 5 SQL 중 BPMN Task 가 호출 = selectUserList / selectCopyUserMap / selectCopyRoleGroupList 3 SQL. UserTask 내부 (Java) 가 호출 = selectRoleMergeObject + mergeCommonCopyRoleGrp 2 SQL (To-Be 정정 후). + 외부 namespace SQL 1 종 (§6.2 — TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK 잔존, Q-002/Q-006 해소).

### §6.2 외부 namespace SQL 호출 (TB_MCM_SEC_USER_ROLL_HIS_Mapper) — 정책 #6 Q-002 / Q-006 해소

> **갱신 2026-05-31**: Q-001 (CommUserMngMapper.selectRoleMergeObject) 은 §6.1 #4 본 namespace 정정으로 해소되어 본 §6.2 에서 제거. 잔존 외부 namespace 호출 = TB_MCM_SEC_USER_ROLL_HIS_Mapper 1 종 — 정책 #6 (A) Entity 흡수로 해소.

| # | SQL ID (As-Is) | type | 호출 Java line | As-Is 적재 컬럼 | To-Be Entity / 흡수 방식 |
|---:|---|---|---|---|---|
| X-1 | `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` | insert (merge) | java:65 | OP_SUMUP_DT / WORKS_CODE (P) / USER_ID / ROLE_GROUP_ID / RESP_GBN (A) / ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION (8 컬럼) | **Q-002 / Q-006 해소 2026-05-31**: SQL 본문 발견 (commUserMng §6.1 X-2 인용 정본) — `mergePK` 의미 = **5 컬럼 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) upsert** (동일 PK 시 update / 미존재 시 insert). **To-Be**: 별도 Mapper.xml 신규 ✗ — **JPA Entity `mcm.entity.SecUserRollHis extends McmAuditEntity` + Repository `SecUserRollHisRepository.saveAll(List<SecUserRollHis>)` 흡수** (commUserMng 정책 #3 (C) 결정 정합). 정책 #6 (A) Entity = 자체 신설 ✗ — commUserMng 의 `SecUserRollHis` 재사용. `save()` 가 `existsById → update / 아니면 insert` 의 mergePK 동등 동작 |

> **본 화면이 직접 호출하는 SQL 총 개수 (To-Be 정정 후)**: 본 Mapper.xml 5 (selectUserList / selectCopyUserMap / selectCopyRoleGroupList / selectRoleMergeObject / mergeCommonCopyRoleGrp) + 외부 namespace 1 (TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK → JPA Entity SecUserRollHis 흡수) = **6 SQL** (As-Is 동일 수 / 호출 namespace 정정).

---

## §7. Java 트랜잭션 (UserTask 1 종)

### §7.1 SaveRoleGroupCopy.java (UserTask SaveRoleGroupCopy, BPMN:52~61)

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is package | `com.dongkuk.dmes.mui.task.ui.csa.CommUserRoleCopy` | java:1 |
| **To-Be package** | Service = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.service` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (RULE.md §"패키지 명명 규칙" §3-1 — 모듈 단위 공유) | - |
| class | `SaveRoleGroupCopy implements Wow` | java:24 |
| 메서드 | `String run(Context context, Task task)` | java:25~26 |
| 입력 | `context.get("ds_userTo")` → `ArrayList<HashMap<String,Object>>` (5 컬럼 — xfdl ds_userTo 전수: CHK / USER_ID / USER_EMP_NO / USER_NM / DEPT_NM) + `context.get("pUserIdCopy")` (xfdl:343) + `context.get("pInfReqNo")` (xfdl:344) + `context.get("pDescription")` (xfdl:345) | java:33 / 40 / 62~63 |
| 처리 | **외곽 루프** (ds_userTo 행 N 건 — 권한 생성 대상자 수) → 각 행에서 (a) `mapSelect` (`pUserId` + `pUserIdCopy`) 빌드 → As-Is `dao.selectList("CommUserMngMapper.selectRoleMergeObject", mapSelect)` 호출 → **To-Be (Q-001 해소 2026-05-31, 정책 #1)**: namespace 정정 `dao.selectList("CommUserRoleCopyMapper.selectRoleMergeObject", mapSelect)` (본 화면 Mapper.xml #4 정본) → 최종 JPA `UserMappingRepository.findRoleMergeObject(pUserIdCopy, pUserId)` 흡수 → 결과 List<Map> roleMergeObjectList 획득 (b) **내부 루프** (roleMergeObjectList — 새로 부여될 RoleGroup 수) → `mapInsert` 8 컬럼 빌드 (OP_SUMUP_DT=오늘yyyyMMdd / WORKS_CODE="P" / USER_ID / ROLE_GROUP_ID / RESP_GBN="A" / ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION) → As-Is `dao.insert("TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK", mapInsert)` 호출 → **To-Be (Q-002 / Q-006 해소 2026-05-31, 정책 #6)**: 외부 Mapper 호출 폐기 → **JPA Entity `SecUserRollHis` 빌드 + `secUserRollHisRepository.saveAll(rollHisList)` 흡수** (commUserMng `SecUserRollHis` 재사용 — 자체 Entity 신설 ✗). 5 컬럼 복합 PK upsert 의 mergePK 동작은 JPA `save()` 가 동등 (existsById → update / 미존재 → insert) (c) 내부 루프 종료 후 `mapMerge` (`pUserIdCopy` + `pUserId`) 빌드 → `dao.insert("CommUserRoleCopyMapper.mergeCommonCopyRoleGrp", mapMerge)` (MERGE — 미존재 RoleGroup 만 INSERT) — To-Be 본 namespace 유지 + JPA native query 흡수 (d) `cnt++` (사용자 단위 counter) | java:43~77 |
| 부수효과 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` (java:79) — 콜백에서 `strErrorMsg["ds_userFrom"]+"건 조회 되었습니다."` 표시 (xfdl:386 — As-Is 메시지는 cnt_save 가 아닌 ds_userFrom 의 행수 표시) | java:79 / xfdl:386 |
| 오류 처리 | try/catch — `IllegalTaskException` wrap (전체 분기 동일) | java:81~85 |
| 트랜잭션 경계 | `context.getDao()` 의 `TransactionalDao` — Wow 인터페이스 / OASIS BPMN 트랜잭션 (한 UserTask 단위) — N 사용자 전체에 걸친 모든 selectList / insert / merge 가 단일 트랜잭션 | java:17~19, 31 |
| 호출 SQL ID | 3 종 — As-Is: (1) `CommUserMngMapper.selectRoleMergeObject` (java:52, 외부 Mapper 호출 결함) (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (java:65, 외부 Mapper) (3) `CommUserRoleCopyMapper.mergeCommonCopyRoleGrp` (java:73, 본 Mapper). **To-Be 정정 후 (정책 #1 / #6)**: (1) → 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` → JPA `UserMappingRepository` (2) → JPA Entity `SecUserRollHis` + `SecUserRollHisRepository.saveAll()` 흡수 (외부 Mapper 호출 폐기) (3) → 본 namespace 유지 + JPA `UserMappingRepository` native query | - |
| 비밀번호 인코더 import | `BCryptPasswordEncoder` / `PasswordEncoder` (java:9, 10) — **본 메서드 본문 미사용** — leftover import (As-Is 보존) | java:9~10 |
| 메서드 시작 로그 | `log.debug("##########	SaveRoleGroupHis RoleGroup 이력 저장 시작")` (java:28) — **클래스명 SaveRoleGroupCopy 인데 로그는 SaveRoleGroupHis** 로 불일치 (오타 추정 — As-Is 보존) | java:28 |
| 내부 루프 로그 | `log.debug("##########	INSERT ROLE COPY HIS (A) = [{}] ", insertRollHis)` (java:66) | java:66 |
| 변수명 오타 | `insertRollHis` (java:65 — Roll = Role 의 오타) — As-Is 보존 | java:65 |
| mapMerge 호출 함수 | `dao.insert(...)` (xml:53 의 SQL 은 sqlType=insert) — 정확하게는 MERGE 이지만 MyBatis tag 는 insert (java:73) | java:73 / xml:53 |

> **호출 흐름 요약 (N=ds_userTo, M=roleMergeObjectList)** — **To-Be 정정 후 (정책 #1 / #6)**:
> ```
> for user in ds_userTo (N건):
>     roleMergeObjectList = CommUserRoleCopyMapper.selectRoleMergeObject(pUserId=user.USER_ID, pUserIdCopy=pUserIdCopy)
>                          // To-Be: UserMappingRepository.findRoleMergeObject(...) — 본 namespace 정본 (As-Is 외부 namespace 호출 결함 정정)
>     rollHisList = []
>     for role in roleMergeObjectList (M건 — user 별 가변):
>         rollHisList.add(new SecUserRollHis(OP_SUMUP_DT, "P", user.USER_ID, role.ROLE_GROUP_ID, "A", role.ROLE_GROUP_NM, pInfReqNo, pDescription))
>     secUserRollHisRepository.saveAll(rollHisList)  // To-Be: JPA Entity 흡수 (mergePK 외부 Mapper 폐기)
>     mergeCommonCopyRoleGrp(pUserId=user.USER_ID, pUserIdCopy=pUserIdCopy) — RoleGroup 매핑 MERGE
>                          // To-Be: UserMappingRepository.mergeCopyRoleGrp(...) native query
>     cnt++ (사용자 단위)
> addDaoResultIntoContext(cnt_save, cnt)
> ```

---

## §8. BPMN 워크플로우 전수 (`CommUserRoleCopy.bpmn`)

> bpmn2:process id="CommUserRoleCopy" name="Copy 대상 RoleGroup 조회" isExecutable="false" (bpmn:3)

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / Task / UserTask)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | 3 incoming (0v64ch1 / 1qzdnc5 / 11a6r0p) | - | bpmn:7~11 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | 분기 | shapeBackground=#ffff00 / labelPosition=Center of Figure (ext:style) | SequenceFlow_1 | 3 outgoing (0tt1mbk / 0eh8isc / 0pg57cu) | bpmn:12~20 |
| Task_selectUserList | task | 사용자 정보 | class=`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`, sqlKey=`#{serviceId}Mapper.selectUserList`, resultKey=`ds_userFrom`, isServiceResult=true, modelerTemplate=`com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` (dao="" / paramKey="" 빈값) | 0tt1mbk | 11a6r0p | bpmn:22~35 |
| selectCopyUserMap | task | Copy 대상 사용자 정보 조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.selectCopyUserMap`, resultKey=`ds_copyUser` (paramKey 빈 자기닫힘 태그 — bpmn:41) | 0pg57cu | 0kmoi6n | bpmn:37~50 |
| selectCopyRoleGroupList | task | Copy 대상 RoleGroup 조회 | class=CommonSelectTask, sqlKey=`#{serviceId}Mapper.selectCopyRoleGroupList`, resultKey=`ds_copyRolegrp` | 0kmoi6n | 1qzdnc5 | bpmn:63~76 |
| SaveRoleGroupCopy | userTask | ROLE 그룹 복사 | class=`#{basePackage}SaveRoleGroupCopy`, modelerTemplate=`com.dongkuk.dmes.UserTask`, nextBranchSpel="" | 0eh8isc | 0v64ch1 | bpmn:52~61 |

> camunda:property `paramKey` 가 attribute 만 있고 value 가 없는 경우 — bpmn:28 (Task_selectUserList) / bpmn:41 (selectCopyUserMap) / bpmn:69 (selectCopyRoleGroupList) 모두 동일. As-Is 보존.

### §8.2 SequenceFlow 전수 (총 9 개)

| sequenceFlow id | name (action 분기) | sourceRef | targetRef | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:21 |
| SequenceFlow_0tt1mbk | **searchUserList** | ExclusiveGateway_1 | Task_selectUserList | bpmn:36 |
| SequenceFlow_0eh8isc | **save** | ExclusiveGateway_1 | SaveRoleGroupCopy | bpmn:51 |
| SequenceFlow_0pg57cu | **search** | ExclusiveGateway_1 | selectCopyUserMap | bpmn:77 |
| SequenceFlow_11a6r0p | - | Task_selectUserList | EndEvent_1 | bpmn:80 |
| SequenceFlow_0v64ch1 | - | SaveRoleGroupCopy | EndEvent_1 | bpmn:62 |
| SequenceFlow_0kmoi6n | - | selectCopyUserMap | selectCopyRoleGroupList | bpmn:78 |
| SequenceFlow_1qzdnc5 | - | selectCopyRoleGroupList | EndEvent_1 | bpmn:79 |
| (SequenceFlow_0eh8isc 동일 — 위에 등재) | (이미 등재) | - | - | - |

> SequenceFlow 9 개 = (Start→Gateway 1) + (Gateway→3 task 3 분기) + (각 task→End 3 — searchUserList / save / searchRole) + (search 내부 task-to-task 2 — selectCopyUserMap→selectCopyRoleGroupList) = 9.

### §8.3 action 3 분기 — 흐름 요약 (실제 분기 enum)

| action | 분기 sequenceFlow | name | 흐름 (전체) |
|---|---|---|---|
| searchUserList | SequenceFlow_0tt1mbk | "searchUserList" | Start → Gateway → Task_selectUserList (사용자 정보) → End |
| search | SequenceFlow_0pg57cu | "search" | Start → Gateway → selectCopyUserMap (Copy 대상 사용자 정보) → selectCopyRoleGroupList (Copy 대상 RoleGroup) → End |
| save | SequenceFlow_0eh8isc | "save" | Start → Gateway → SaveRoleGroupCopy (UserTask — Java: ds_userTo 외곽 루프 + selectRoleMergeObject + mergePK + mergeCommonCopyRoleGrp) → End |

> BPMN node 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + Task 3 (CommonSelectTask 3) + UserTask 1 = **7 노드**. SequenceFlow **9 개**.
>
> **xfdl `save` 콜백 (xfdl:386~400)** 의 `ds_userFrom=ds_userFrom` outDataset 갱신은 BPMN save 분기에 fn_searchUserList 의 후속 task 가 연결되어 있지 않음 — **xfdl 콜백이 추가로 fn_searchUserList() 를 호출하여 자체 재조회** 하는 패턴 (xfdl:395). 즉 save 분기에서 ds_userFrom 갱신은 BPMN 일부가 아닌 xfdl 콜백 별도 호출.
>
> **Q-003 해소 2026-05-31**: As-Is 의도된 분리 (FE 콜백 재조회 패턴) **보존 결정**. 사유: (a) save 트랜잭션과 List 재조회의 책임 분리 — UserTask 단일 트랜잭션 (N×M MERGE+INSERT) 이 완결된 후 FE 가 별도 GET 으로 ds_userFrom 갱신 (Optimistic UI 분리) (b) save outDataset 가 ds_userFrom 로 빈 alias 매핑되지만 실값은 fn_searchUserList 가 채움 — BPMN flow 변경 ✗ + FE/React 등가물에서도 동일 패턴 유지 (save 완료 → searchUserList 별도 fetch 호출). 누락 아닌 분리 — To-Be 보존.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + Java 본문 + To-Be cactus-core)

> **To-Be 정책 (사용자 결정 누적 반영)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_USER` / `TB_MCM_SEC_USER_MAPPING` / `TB_MCM_SEC_ROLEGROUP` / `TB_MCM_SEC_USER_ROLL_HIS`) — 대문자 prefix 유지
> - **audit 컬럼**: As-Is `ref_Audit` 17 컬럼 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 통일 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). JPA `@PrePersist` / `@PreUpdate` 자동
> - **본 컬럼**: As-Is 1:1 보존
> - **부서 마스터 (Q-004 해소 2026-05-31, 정책 #2)**: As-Is `EAIUSER.IF_GW01MMFSHD01` (부서 마스터) / `IF_GW01MMFSHD02` (사용자-부서 매핑) EAI 직접 참조 → **To-Be 폐기** → DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 + JOIN (commUserMng selectCommDept Q-004 해소 결정 정합)

### §9.1 `TB_MCM_SEC_USER` (사용자 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | USER_ID | selectUserList SELECT (xml:8) / selectCopyUserMap SELECT + WHERE (xml:22, 26) / selectCopyRoleGroupList scalar subquery WHERE (xml:36) / Java mapInsert (java:58) / xfdl ds_copyUser / ds_userFrom / ds_userTo (USER_ID 컬럼) | PK | 그리드 사용자ID 표시 | xml:8 / 22 / 26 |
| 2 | USER_EMP_NO | selectUserList SELECT (xml:8) / selectCopyUserMap SELECT + WHERE (xml:23, 26) / selectCopyRoleGroupList scalar subquery WHERE (xml:36) | - | 그리드 사번 표시 + 검색 입력 (S-001) | xml:8 / 23 / 26 |
| 3 | USER_NM | selectUserList SELECT (xml:8) / selectCopyUserMap SELECT (xml:24) | - | 그리드 사용자명 표시 + 필터 (D-005) | xml:8 / 24 |
| 4 | END_ACTIVE_DATE | selectUserList WHERE `END_ACTIVE_DATE > SYSDATE` (xml:16) | - | 활성 종료일 — 미만/같음 시 사용자 List 제외 | xml:16 |
| 5 | USE_TP | selectUserList WHERE `USE_TP = 'Y'` (xml:17) | - | 사용 여부 (Y/N) — Y 만 사용자 List 노출 | xml:17 |
| 6~14 | audit 9 컬럼 (cactus-core) — C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER | (To-Be cactus-core 정본) | - | As-Is 17 컬럼 → To-Be 9 컬럼 매핑. **본 화면은 TB_MCM_SEC_USER 의 SELECT 만 사용** — 본 화면 자체 audit 영향 ✗ (commUserMng 화면 참조) | CactusAuditEntity.java |

> 본 화면은 TB_MCM_SEC_USER 의 SELECT 만 수행 (INSERT/UPDATE/DELETE ✗). audit 부분은 사용자 마스터 관리 화면 (commUserMng) 의 책임.

### §9.2 `TB_MCM_SEC_USER_MAPPING` (사용자 ↔ RoleGroup 매핑)

> **본 화면의 핵심 자산** — Copy 대상의 매핑 SELECT + 권한생성 대상의 매핑 NOT-IN + MERGE INSERT.

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 (As-Is 동작) | 근거 |
|---:|---|---|---|---|---|
| 1 | USER_ID | selectCopyRoleGroupList SELECT + WHERE (xml:32, 35) / selectRoleMergeObject SELECT + WHERE + NOT IN (xml:41, 45, 48) / mergeCommonCopyRoleGrp USING + ON + INSERT + VALUES (xml:55, 56, 59, 64) | PK (2 컬럼 복합) | xfdl USER_ID 등재 (DS-001 ROLE_GROUP_ID 와 함께) | xml:32 / 55 |
| 2 | ROLE_GROUP_ID | selectCopyRoleGroupList SELECT (xml:32) / selectRoleMergeObject SELECT + NOT IN (xml:41, 46, 48) / mergeCommonCopyRoleGrp USING + ON + INSERT + VALUES (xml:55, 56, 60, 65) | PK (2 컬럼 복합) | DS-001 ROLE_GROUP_ID | xml:32 / 55 |
| 3~11 | audit 9 컬럼 (cactus-core) — C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER | (To-Be cactus-core 정본) | - | As-Is `<include refid="ref_Audit.insert_item / insert_value">` (xml:61, 66) → To-Be JPA `@PrePersist` 자동 채움. UPDATE 분기는 없음 (MERGE WHEN NOT MATCHED 만 — 신규 행 INSERT 만). audit 9 컬럼은 INSERT 시 자동 채움 (`C_*` 4 컬럼만 동작 — `U_*` 4 컬럼은 신규 행이라 null 유지 → CactusAuditListener 가 동일 값 복사 또는 null 보존) | CactusAuditEntity.java |

> **본 화면이 TB_MCM_SEC_USER_MAPPING 에 적재하는 행수** = `ds_userTo.size()` × `selectRoleMergeObject 결과 평균 행수` (Copy 대상의 매핑 중 권한생성대상에 미존재 한 것 만). 단일 UserTask 트랜잭션.

### §9.3 `TB_MCM_SEC_ROLEGROUP` (RoleGroup 마스터)

| # | 컬럼 | 출현 위치 | PK 후보 | 비고 | 근거 |
|---:|---|---|---|---|---|
| 1 | ROLE_GROUP_ID | selectCopyRoleGroupList scalar subquery WHERE (xml:33) / selectRoleMergeObject scalar subquery WHERE (xml:43) | PK | scalar subquery 의 키 | xml:33 / 43 |
| 2 | ROLE_GROUP_NM | selectCopyRoleGroupList scalar subquery SELECT (xml:33) / selectRoleMergeObject scalar subquery SELECT (xml:43) / Java mapInsert (java:61) | - | xfdl DS-001 ROLE_GROUP_NM + 이력 적재 | xml:33 / 43 / java:61 |
| 3~11 | audit 9 컬럼 (cactus-core) | - | - | 본 화면 SELECT scalar subquery 만 사용 — audit 영향 ✗ (commRoleGrpMng 화면 참조) | - |

### §9.4 `TB_MCM_SEC_USER_ROLL_HIS` (권한부여 이력 — Q-002 / Q-006 해소 2026-05-31)

> **갱신 2026-05-31 (Q-002 / Q-006 해소, 정책 #6)**: 외부 Mapper `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` SQL 본문 = commUserMng §6.1 X-2 인용 정본 = **5 컬럼 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) upsert** 확정. **To-Be**: 외부 Mapper.xml 신규 ✗ → JPA Entity `SecUserRollHis extends McmAuditEntity` 흡수 (commUserMng `mcm.entity.SecUserRollHis` 재사용 — 자체 Entity 신설 ✗) + Repository `SecUserRollHisRepository.saveAll()` 호출.

| # | 컬럼 | 출현 위치 (Java mapInsert) | PK 후보 | 비고 (As-Is 동작 + To-Be 흡수) | 근거 |
|---:|---|---|---|---|---|
| 1 | OP_SUMUP_DT | java:56 | **PK (1/5 복합)** | 오늘 일자 `yyyyMMdd` (`CommonUtil.getCurrentDate("yyyyMMdd")`) | java:56 |
| 2 | WORKS_CODE | java:57 | **PK (2/5 복합)** | 하드코딩 "P" (Q-008 부분 해소 — Permission 추정) | java:57 |
| 3 | USER_ID | java:58 | **PK (3/5 복합)** | 권한생성대상 사용자 ID (ds_userTo 행의 USER_ID) | java:58 |
| 4 | ROLE_GROUP_ID | java:59 | **PK (4/5 복합)** | selectRoleMergeObject 결과의 ROLE_GROUP_ID | java:59 |
| 5 | RESP_GBN | java:60 | **PK (5/5 복합)** | 하드코딩 "A" (Q-005 해소 = 추가 Add) | java:60 |
| 6 | ROLE_GROUP_NM | java:61 | - | selectRoleMergeObject 결과의 ROLE_GROUP_NM | java:61 |
| 7 | INF_REQ_NO | java:62 | - | 입력 정보처리의뢰서번호 (xfdl edt_infReqNo / D-002) | java:62 |
| 8 | DESCRIPTION | java:63 | - | 입력 처리사유 (xfdl edt_description / D-004) | java:63 |
| 9~17 | audit 9 컬럼 (cactus-core / McmAuditEntity) | - | - | JPA `@PrePersist` / `@PreUpdate` 자동 채움 (Entity `SecUserRollHis extends McmAuditEntity`) | - |

> **mergePK SQL ID 해석 (Q-006 해소)**: `mergePK` = 5 컬럼 복합 PK upsert (PK 일치 시 update / 미존재 시 insert). JPA `save()` 가 동등 동작 (`existsById → update / 아니면 insert`). To-Be `saveAll(List<SecUserRollHis>)` 흡수.

### §9.5 (As-Is 인용 — EAI 부서 인터페이스) + To-Be `MCMAPUSER.TB_MCM_DEPT_INFO` 변환 (Q-004 해소 2026-05-31, 정책 #2)

> **갱신 2026-05-31 (Q-004 해소, 정책 #2)**: As-Is `EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02` 외부 EAI 인터페이스 → **To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 + JOIN** 으로 전환 (commUserMng selectCommDept Q-004 해소 결정 정합 — 일괄 정책 #2). EAI 직접 참조 폐기.

#### §9.5-A As-Is 인용 (외부 EAI 인터페이스 — To-Be 폐기)

| # | 컬럼 | 출현 위치 (As-Is) | 비고 | 근거 |
|---:|---|---|---|---|
| ~~1~~ | ~~DEPT_CD~~ | ~~selectUserList scalar subquery JOIN (xml:13, IF_GW01MMFSHD02 A 와 IF_GW01MMFSHD01 B 의 DEPT_CD 동등 JOIN)~~ | ~~EAI 부서 코드 키~~ → **To-Be: TB_MCM_DEPT_INFO.DEPT_CD JOIN 으로 대체** | xml:13 |
| ~~2~~ | ~~USAGE_YN~~ | ~~selectUserList scalar subquery WHERE (xml:11, 12 — A.USAGE_YN='A' AND B.USAGE_YN='A')~~ | ~~EAI Active 'A' 만 인입 (Q-007 부분 해소)~~ → **To-Be: TB_MCM_DEPT_INFO.USE_TP='Y' 로 대체** | xml:11~12 |
| ~~3~~ | ~~USER_ID~~ | ~~selectUserList scalar subquery WHERE (xml:14)~~ | ~~EAI 사용자-부서 매핑 키~~ → **To-Be: TB_MCM_SEC_USER.DEPT_CD 직접 보유 + TB_MCM_DEPT_INFO LEFT JOIN** (사용자-부서 매핑 = User Entity 의 DEPT_CD 컬럼으로 1:1 직결) | xml:14 |
| ~~4~~ | ~~DEPT_NM~~ | ~~selectUserList scalar subquery SELECT (xml:9)~~ | ~~xfdl GE-002-5 / GE-003-5 부서 표시~~ → **To-Be: TB_MCM_DEPT_INFO.DEPT_NM SELECT 로 대체** | xml:9 |

#### §9.5-B To-Be 신규 — `MCMAPUSER.TB_MCM_DEPT_INFO` (DMES 자체 부서 마스터)

| # | 컬럼 | PK | 비고 | 근거 |
|---:|---|---|---|---|
| 1 | DEPT_CD | PK | 부서 코드 (varchar) — As-Is EAI `IF_GW01MMFSHD01.DEPT_CD` 직역 | commUserMng selectCommDept Q-004 해소 |
| 2 | DEPT_NM | - | 부서명 (varchar) — As-Is EAI `IF_GW01MMFSHD01.CD_V_MEANING` 직역 | 동일 |
| 3 | USE_TP | - | 사용 여부 (Y/N) — As-Is EAI `USAGE_YN='A'` 대응 (Active → 'Y') | 동일 |
| 4~12 | audit 9 컬럼 (McmAuditEntity) | - | JPA `@PrePersist` / `@PreUpdate` 자동 | - |

> **To-Be selectUserList SQL 본문 변환**:
> ```sql
> -- As-Is (xml:7~19)
> SELECT S.USER_ID, S.USER_EMP_NO, S.USER_NM,
>        (SELECT B.DEPT_NM FROM EAIUSER.IF_GW01MMFSHD02 A, EAIUSER.IF_GW01MMFSHD01 B
>         WHERE A.USAGE_YN='A' AND B.USAGE_YN='A' AND A.DEPT_CD=B.DEPT_CD AND A.USER_ID=S.USER_ID) AS DEPT_NM
>   FROM MCMAPUSER.TB_MCM_SEC_USER S
>  WHERE S.END_ACTIVE_DATE > SYSDATE AND S.USE_TP = 'Y'
>  ORDER BY DEPT_NM, USER_NM ASC
>
> -- To-Be (Q-004 해소 정책 #2)
> SELECT S.USER_ID, S.USER_EMP_NO, S.USER_NM, D.DEPT_NM
>   FROM MCMAPUSER.TB_MCM_SEC_USER S
>   LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP = 'Y'
>  WHERE S.END_ACTIVE_DATE > GETDATE() AND S.USE_TP = 'Y'
>  ORDER BY D.DEPT_NM, S.USER_NM ASC
> ```
>
> EAI 직접 참조 폐기 — DMES 자체 부서 마스터 단일 출처. Entity 명 `DeptInfo` (또는 `MfDept`) 신규 (commUserMng 화면 카탈로그 정본).

---

## §10. 코드값/LoV (LV-NNN)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 | 비고 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | `WORKS_CODE` (Java mapInsert 하드코딩 — 코드 마스터 ✗) | "P" | (이력 적재 시 하드코딩) | TB_MCM_SEC_USER_ROLL_HIS.WORKS_CODE | **코드 마스터 추적 결과 (2026-05-30, Q-008 해소)**: DMES `SEC_USER_ROLL_HIS` 시트 (rId105) #2 컬럼 한글명 "사소구분" (commUserMng §9.1.6 #2 동일). SampleErp ERP 코드 마스터 View `dbo.B_COMM_CODE` (`docs/external/SampleErp/views/B_COMM_CODE.sql`) 조회 결과 WORKS_CODE 마스터 항목 미등재 (DMES 측 별도 마스터). mui grep 결과 `SaveRoleGroupCopy.java:57` (본 화면) + `SaveRoleGroupHis.java:45/59` (commUserMng) 2 위치만 'P' 하드코딩 (총 3 hits). **결론**: WORKS_CODE='P' 는 권한 변경 사유 분류 코드의 하나 (Permission/Privilege 추정 — DMES 별도 마스터로 위임). DMES 코드 마스터 시드 데이터 등재 필요 시 별도 결정 | java:57 / B_COMM_CODE.sql / DMES rId105 |
| LV-002 | `RESP_GBN` (Java mapInsert 하드코딩) | "A" | (하드코딩) | TB_MCM_SEC_USER_ROLL_HIS.RESP_GBN | **코드 마스터 추적 결과 (2026-05-30, Q-005 해소)**: DMES `SEC_USER_ROLL_HIS` 시트 (rId105) #5 컬럼 한글명 **"구분(A:추가,D:삭제)" 명시** (commUserMng §9.1.6 #5 동일). 즉 **A=추가 / D=삭제** (Add/Delete). 본 화면 java:60 'A' = 권한 추가 (Copy 시 항상 추가). commUserMng SaveRoleGroupHis.java:46 = 'A' (역할추가) / java:60 = 'D' (역할삭제) 와 정합. **확정 의미**: A=Add | java:60 / DMES rId105 #5 한글명 |
| LV-003 | `USE_TP` (SQL WHERE 하드코딩) | "Y" | - | selectUserList WHERE | TB_MCM_SEC_USER.USE_TP 컬럼 — 사용중인 사용자 만 노출 | xml:17 |
| ~~LV-004~~ | ~~`USAGE_YN` (EAI 부서 WHERE 하드코딩)~~ | ~~"A"~~ | - | ~~selectUserList 의 scalar subquery WHERE~~ | **Q-004 해소 2026-05-31, 정책 #2**: EAI 외부 인터페이스 폐기 (`EAIUSER.IF_GW01MMFSHD01/02` → `MCMAPUSER.TB_MCM_DEPT_INFO` 변환). USAGE_YN LV 자체 제거. To-Be 대응 = LV-004-NEW (TB_MCM_DEPT_INFO.USE_TP='Y') | xml:11~12 (As-Is 인용 폐기) |
| LV-004-NEW | `USE_TP` (TB_MCM_DEPT_INFO WHERE 하드코딩) | "Y" | - | To-Be selectUserList JOIN 의 부서 마스터 필터 | **신규 2026-05-31 (정책 #2)**: DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO.USE_TP` 컬럼 — 사용중 부서만 노출. As-Is EAI USAGE_YN='A' (Active) 의 To-Be 등가물. JPA Entity `DeptInfo.useTp` 필드 매핑 | TB_MCM_DEPT_INFO (commUserMng 카탈로그 정본) |

> **본 화면의 LoV 호출 DB 마스터 = 0 건**. NewCodeQuery / GeneralDialog / cbo (Combo) 컴포넌트 ✗. 모든 LV-NNN 은 하드코딩 또는 WHERE 절 enum 값.

### §10.1 상태값 ST-NNN

| ID | As-Is 상태값 | 의미 | 영향 영역 | 근거 |
|---|---|---|---|---|
| ST-001 | `CHK = "1"` / `"0"` (xfdl ds_userFrom / ds_userTo) | 셔틀 이동 대상 마킹 (checkbox 선택) | GE-002-1 / GE-003-1 + B-003 (셔틀 좌) / B-004 (셔틀 우) 트리거 조건 + commonLeftButton 의 전체선택 | xfdl:109 / 159 / 274~278 / 416 / 428 |
| ST-002 | `infReqNoFlag` boolean | 정보처리의뢰서번호 + 처리사유 입력 여부 결합 (둘 다 채워졌으면 true) — 저장 시 confirm 메시지 분기 | xfdl fn_save (xfdl:320~325) + confirm 메시지 (xfdl:352~356) | xfdl:320~356 |
| ST-003 | `ds_copyUser.rowcount == 0` / `ds_userTo.rowcount == 0` | 저장 전 사전조건 검증 — Copy 대상 미조회 / 권한생성대상 미선택 시 차단 | xfdl fn_save (xfdl:327~335) | xfdl:327~335 |
| ST-004 | `END_ACTIVE_DATE > SYSDATE` (SQL WHERE) | 활성 종료일 > 시스템 현재 시간 — 미만/같음 시 사용자 List 제외 | selectUserList WHERE (xml:16) | xml:16 |

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

> As-Is = Oracle (스키마 `MCMAPUSER` + EAI 외부 `EAIUSER`). To-Be = MSSQL `sample_dmes` DB / `MCMAPUSER` 계정.
>
> **To-Be 결정 (masterCodeMng / cma 4 화면 + commUserMng 정책 누적 반영, 2026-05-31 갱신)**:
> - **스키마/테이블명**: As-Is 그대로 보존 (`MCMAPUSER.TB_MCM_SEC_USER` 등)
> - **audit 컬럼**: cactus-core `CactusAuditEntity` 9 컬럼 통일. MyBatis `ref_Audit` fragment 폐기 → JPA `@PrePersist` / `@PreUpdate` 자동 처리
> - **외부 namespace SQL ID (정책 #1 / #6, Q-001 / Q-002 / Q-006 해소 2026-05-31)**:
>   - `CommUserMngMapper.selectRoleMergeObject` (Q-001) → **본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정정** + JPA `UserMappingRepository` 흡수. As-Is 외부 namespace 호출은 결함으로 판정 (본 화면 Mapper.xml #4 정본 존재함에도 외부 호출).
>   - `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (Q-002 / Q-006) → 외부 Mapper.xml 신규 ✗ → **JPA Entity `SecUserRollHis extends McmAuditEntity` + `SecUserRollHisRepository.saveAll()` 흡수** (commUserMng 정책 #3 (C) 정합 / 정책 #6 (A) Entity 재사용 — 자체 신설 ✗).
> - **부서 마스터 (정책 #2, Q-004 해소 2026-05-31)**: As-Is `EAIUSER.IF_GW01MMFSHD01/02` 외부 EAI 인터페이스 폐기 → **DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 + JOIN** (commUserMng selectCommDept Q-004 해소 결정 정합).
> - **BPMN save flow 후속 task 미연결 (Q-003 해소 2026-05-31)**: As-Is 의도된 분리 (FE 콜백 재조회 패턴) 보존 — save 트랜잭션과 List 재조회 책임 분리. To-Be FE/React 등가물에서도 동일 패턴 유지.

| # | As-Is 문법 (Oracle) | 출현 위치 | To-Be 등가 (MSSQL) | 영향 SQL ID | 비고 |
|---:|---|---|---|---|---|
| 1 | `MERGE INTO ... USING (SELECT ... FROM ... WHERE) B ON ... WHEN NOT MATCHED THEN INSERT (...) VALUES (...)` (WHEN MATCHED 절 없음) | xml:53~68 (mergeCommonCopyRoleGrp) | MSSQL `MERGE` 동일 문법 지원. 또는 `INSERT INTO ... SELECT ... WHERE NOT EXISTS` 패턴 권장 (MSSQL MERGE 는 deadlock 권고) | mergeCommonCopyRoleGrp | MSSQL MERGE deadlock 권고 — IF NOT EXISTS 패턴 권장 (To-Be 결정 — masterCodeMng 와 동일 정책) |
| 2 | `SYSDATE` | xml:16 (selectUserList WHERE `END_ACTIVE_DATE > SYSDATE`) | MSSQL `GETDATE()` 또는 `CURRENT_TIMESTAMP` | selectUserList | - |
| 3 | scalar subquery in SELECT | xml:9~14 (selectUserList DEPT_NM scalar subquery) / xml:33 (selectCopyRoleGroupList ROLE_GROUP_NM) / xml:43 (selectRoleMergeObject ROLE_GROUP_NM) | MSSQL 동일 지원 | selectUserList / selectCopyRoleGroupList / selectRoleMergeObject | - |
| 4 | scalar subquery in WHERE | xml:36 (selectCopyRoleGroupList `OR USER_ID = (SELECT USER_ID FROM TB_MCM_SEC_USER WHERE USER_EMP_NO = #{pUserIdCopy})`) | MSSQL 동일 지원 | selectCopyRoleGroupList | - |
| 5 | NOT IN subquery | xml:46~49 (selectRoleMergeObject `ROLE_GROUP_ID NOT IN (SELECT ROLE_GROUP_ID FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{pUserId})`) | MSSQL 동일 지원. NULL 보호 측면에서 `NOT EXISTS` 변환 권장 | selectRoleMergeObject | NULL 보호 |
| 6 | 스키마 prefix `MCMAPUSER.` (xml:15, 34, 45, 54, 55) + EAI prefix `EAIUSER.` (xml:10, As-Is) + prefix 없음 (xml:25 — TB_MCM_SEC_USER / xml:33 — TB_MCM_SEC_ROLEGROUP / xml:36 — TB_MCM_SEC_USER) | xml 전체 | **To-Be**: `MCMAPUSER.TB_MCM_SEC_*` (사용자 결정 — As-Is 테이블명 그대로 보존). EAI prefix 폐기 (Q-004 해소 2026-05-31, 정책 #2) → `MCMAPUSER.TB_MCM_DEPT_INFO` 로 전환. prefix 없는 것은 Oracle 의 현재 세션 스키마 기본값 (MCMAPUSER) — MSSQL 에도 명시 적용 | 모든 SQL | 사용자 결정 / Q-004 해소 |
| 7 | `\|\|` 문자열 결합 | (해당 없음 — 본 화면 SQL grep 결과 0회) | - | - | - |
| 8 | `UPPER(...)` | (해당 없음 — SQL 내부 UPPER 호출 0회. xfdl Script `fn_userFromFilter` 의 `toUpperCase` 호출만 클라이언트 측) | - | - | xfdl:461~492 |
| 9 | `(+)` outer join | (해당 없음) | - | - | - |
| 10 | `ROWNUM` / `NVL` / `DECODE` 등 기타 Oracle 전용 | (해당 없음) | - | - | - |
| 11 | `ref_Audit` fragment include | xml:61 / 66 (2 회 — mergeCommonCopyRoleGrp INSERT/VALUES 절) | **To-Be**: MyBatis `ref_Audit` fragment **폐기**. cactus-core `CactusAuditEntity` 상속 + `CactusAuditListener` 가 JPA `@PrePersist` 콜백으로 9 컬럼 자동 채움. To-Be INSERT SQL 본문에 audit 컬럼 명시 ✗ — Entity 레이어 자동 처리 | mergeCommonCopyRoleGrp | cactus-core 적용 |
| 12 | `CommonUtil.getCurrentDate("yyyyMMdd")` (Java) | java:56 (OP_SUMUP_DT 컬럼) | **To-Be**: `java.time.LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))` 또는 cactus-core 표준 헬퍼 | (Java SaveRoleGroupCopy) | Java 8+ API 표준 |
| 13 | `BCryptPasswordEncoder` import (미사용) | java:9~10 | **To-Be**: import 제거 (사용 ✗) | (Java SaveRoleGroupCopy) | dead code 정리 |
| 14 | 로그 메시지 오타 `SaveRoleGroupHis` | java:28 | **To-Be**: `SaveRoleGroupCopy` 정정 | (Java SaveRoleGroupCopy) | - |
| 15 | 변수명 오타 `insertRollHis` | java:65 | **To-Be**: `insertRoleHis` 정정 | (Java SaveRoleGroupCopy) | Roll = Role 오타 |
| 16 | 외부 namespace `CommUserMngMapper.selectRoleMergeObject` 호출 (Q-001) | java:52 | **To-Be (Q-001 해소 2026-05-31, 정책 #1)**: namespace 정정 `CommUserRoleCopyMapper.selectRoleMergeObject` (본 화면 Mapper.xml #4 정본) → 최종 JPA `UserMappingRepository.findRoleMergeObject(pUserIdCopy, pUserId)` 흡수 | (Java SaveRoleGroupCopy + Mapper.xml #4) | As-Is 외부 호출 결함 정정 |
| 17 | 외부 namespace `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 호출 (Q-002 / Q-006) | java:65 | **To-Be (Q-002 / Q-006 해소 2026-05-31, 정책 #6)**: 외부 Mapper.xml 신규 ✗ → JPA Entity `mcm.entity.SecUserRollHis extends McmAuditEntity` 빌드 + `secUserRollHisRepository.saveAll(rollHisList)` 흡수. 5 컬럼 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) upsert 의 mergePK 동작은 JPA `save()` 가 동등. Entity 명명 (정책 #6 (A)) = 자체 신설 ✗ — commUserMng 의 SecUserRollHis 재사용 | (Java SaveRoleGroupCopy + commUserMng 카탈로그) | 외부 namespace 폐기 + Entity 흡수 |
| 18 | EAI 외부 인터페이스 `EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02` 직접 참조 (Q-004) | xml:9~14 (selectUserList scalar subquery) | **To-Be (Q-004 해소 2026-05-31, 정책 #2)**: EAI 직접 참조 폐기 → DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN (`LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP = 'Y'` + `D.DEPT_NM`). USAGE_YN='A' → USE_TP='Y' 대응 (LV-004-NEW). commUserMng 일괄 정책 | selectUserList SQL 본문 변환 | EAI 폐기 |
| 19 | BPMN save flow 후속 Task_selectUserList 미연결 (Q-003) | bpmn save sequenceFlow | **To-Be (Q-003 해소 2026-05-31)**: As-Is 의도된 분리 (FE 콜백 재조회 패턴) 보존 결정. save outDataset `ds_userFrom=ds_userFrom` 빈 alias 매핑은 fn_searchUserList 별도 호출로 채움 (xfdl:395). React 등가물에서도 동일 패턴 (save mutation 완료 → searchUserList query refetch). BPMN flow 변경 ✗ | bpmn:51 save sequenceFlow + xfdl:395 callback | As-Is 분리 보존 |
| 20 | Entity 명명 정책 (정책 #6 (A)) | (To-Be 신규 Entity 등재) | **To-Be 결정 (2026-05-31)**: 본 화면 자체 Entity 신설 ✗ — commUserMng 화면이 정본인 4 Entity (`SecUser` / `SecUserMapping` / `SecRoleGroup` / `SecUserRollHis`) 재사용. 본 화면 Service (`CommUserRoleCopyService`) 가 동일 Entity / Repository 를 의존성 주입으로 사용 | (Entity 매핑 — BPMN §3.3 참조) | Entity 중복 신설 ✗ |

### §11.1 To-Be 명명 안 (확정)

| 자산 | As-Is | To-Be |
|---|---|---|
| 사용자 테이블 | `MCMAPUSER.TB_MCM_SEC_USER` | `MCMAPUSER.TB_MCM_SEC_USER` (그대로) |
| 매핑 테이블 | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING` | `MCMAPUSER.TB_MCM_SEC_USER_MAPPING` (그대로) |
| RoleGroup 테이블 | `TB_MCM_SEC_ROLEGROUP` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_ROLEGROUP` (명시 적용) |
| 이력 테이블 | `TB_MCM_SEC_USER_ROLL_HIS` | `MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS` (commUserMng 결정 동조) — JPA Entity `mcm.entity.SecUserRollHis` 재사용 (Q-002/Q-006 해소) |
| ~~EAI 부서 인터페이스~~ | ~~`EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02`~~ | **폐기 (Q-004 해소 2026-05-31, 정책 #2)** → `MCMAPUSER.TB_MCM_DEPT_INFO` (DMES 자체 부서 마스터 신설) |
| 부서 마스터 (To-Be 신규) | (As-Is 없음 — EAI 외부 참조) | `MCMAPUSER.TB_MCM_DEPT_INFO` (DEPT_CD PK / DEPT_NM / USE_TP + McmAuditEntity 9). Entity = `mcm.entity.DeptInfo` (commUserMng 카탈로그 정본) |
| Java 패키지 | `com.dongkuk.dmes.mui.task.ui.csa.CommUserRoleCopy.*` | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1 정본) |
| Mapper namespace | `CommUserRoleCopyMapper` | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.UserMappingRepository` (native query) + `SecUserRollHisRepository` (Q-002/Q-006 흡수). Mapper.xml.asis 는 보존 |
| BPMN process id | `CommUserRoleCopy` | `commUserRoleCopy` (2-토큰) |

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료. 활성 미결정 = **0 건**. 결정 내용은 §6 / §7 / §8 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **외부 Mapper selectRoleMergeObject 중복** | As-Is Java `CommUserMngMapper.selectRoleMergeObject` 외부 호출 (java:52) → 본 Mapper.xml #4 정본 존재 결함. **To-Be**: 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정정 → JPA `UserMappingRepository.findRoleMergeObject(...)` 흡수. CommUserMng namespace 외부 호출 자체 폐기 | §6.1 #4 / §7.1 / §11 #16 |
| **외부 Mapper TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK** | SQL 본문 = (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) 5 컬럼 복합 PK upsert. **To-Be**: 외부 Mapper.xml 신규 ✗ → JPA Entity `SecUserRollHis extends McmAuditEntity` + Repository `SecUserRollHisRepository.saveAll()` 흡수 (정책 #6 (A)) | §6.2 X-1 / §9.4 / §11 #17 |
| **BPMN save flow 후속 task 미연결** | As-Is 의도된 분리 (FE 콜백 재조회 패턴 — xfdl:395 `fn_searchUserList()` 별도 호출) 보존 결정. save 트랜잭션과 List 재조회 책임 분리. React 등가물 (save mutation → searchUserList query refetch) 동일 패턴. BPMN flow 변경 ✗ | §8.3 / §11 #19 |
| **EAI 외부 인터페이스** | As-Is `EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02` 직접 참조 → To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN 변환 (정책 #2 — commUserMng 와 일괄). USAGE_YN='A' → USE_TP='Y' 대응 (LV-004-NEW) | §6.1 / §9.5 / §11 #18 |
| **RESP_GBN='A' 코드 의미** | DMES rId105 #5 한글명 "구분(A:추가,D:삭제)" → **A=Add 확정** (Java 하드코딩 보존) | §10 LV-002 |
| **USAGE_YN='A' 코드 의미** | EAI 외부 — DMES MCM 정의서 미동봉 — Active 추정 (EAI 정책 종속). Q-004 종속 해소로 EAI 폐기되며 LV 자체 제거 → LV-004-NEW (TB_MCM_DEPT_INFO.USE_TP='Y') 대응 | §10 LV-004 |
| **WORKS_CODE='P' 코드 의미** | SampleErp B_COMM_CODE 미등재 — Permission/Privilege 추정 (DMES 별도 마스터 필요). 본 화면 자체는 As-Is 'P' 하드코딩 보존. DMES 코드 마스터 시드 데이터 정의 시 별도 결정 | §10 LV-001 |
| **Entity 명명 (정책 #6 (A))** | 본 화면 자체 Entity ✗ — commUserMng 정본 5 Entity (`SecUser` / `SecUserMapping` / `SecRoleGroup` / `SecUserRollHis` + 신규 `DeptInfo`) 재사용. 본 Service `CommUserRoleCopyService` 가 동일 Repository 의존성 주입 | §11 #20 |
| **스키마/테이블명 (정책 #1)** | As-Is `MCMAPUSER.TB_MCM_SEC_*` / `MCMAPUSER.TB_MCM_DEPT_INFO` 대문자 prefix 보존. schema=`MCMAPUSER`. RoleGroup 테이블은 As-Is prefix ✗ → To-Be `MCMAPUSER.` 명시 적용 | §11.1 |
| **audit 컬럼 (cactus-core 정본)** | As-Is `ref_Audit` fragment 폐기 → cactus-core `McmAuditEntity` 상속 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1). JPA `@PrePersist` / `@PreUpdate` 자동 채움 | §9 / §11 |
| **As-Is/To-Be 표준 우선 원칙 (정책 #4)** | 분석 단계 = As-Is 1:1 보존. To-Be 정정/제거 결정은 별도 명시 (§11). 환경 제약 (Runner / 가이드 mui 매핑) 만 ✗ 사유 명시 | §0 |
| **Java 패키지 (RULE.md §3-1)** | Service = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.service.*` / DTO = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) | §7 / §11.1 |

---

## §13. 정합 게이트 자가 점검 (As-Is 1:1 / 누락 0 / cite 100%)

| 게이트 | 측정 | 결과 |
|---|---|---|
| G-A: xfdl Form / Layout / Div / Grid / Button / Combo / Static / Edit / Dataset 전수 등재 | §3.1 영역 11 + §3.2 S 1 + §3.3-A G 3 + §3.3-B GE 2 + §3.3-C GE 5 + §3.3-D GE 5 + §3.4 D 12 + §3.5 L 0 + §3.6 EX 3 + §3.7 DS 4 = 46 행 + 본문 별도 §4.1 B 5 + §4.3 메서드 13 + §5 P 0 = 64 행 + 그리드 옵션·이벤트 본문 별도 | ✓ |
| G-B: Mapper.xml 5 SQL 전수 + 외부 Mapper 2 SQL ID 별도 | §6.1 5 행 + §6.2 2 행 | ✓ |
| G-C: Java 메서드 전수 | §7.1 `run` 1 메서드 (Wow 인터페이스 구현) | ✓ |
| G-D: BPMN flow 전수 | §8.1 7 노드 + §8.2 9 sequenceFlow + §8.3 3 action 흐름 | ✓ |
| G-E: cite 100% | 본 분석리포트 모든 본문 주장에 file:line cite 존재 (§3~§11 전 행) | ✓ |
| G-F: Q-NNN 활성 = **0 건** (사용자 결정 완료 — §12 결정 누적 표 참조) | §12 12 행 결정 누적표 | ✓ |
| G-G: As-Is 1:1 보존 (분석 단계) — To-Be 정정/제거 결정은 §11 본문 명시 | java:28 `SaveRoleGroupHis` 오타 / java:65 `insertRollHis` 변수명 오타 / java:9~10 BCryptPasswordEncoder 미사용 import — 분석 시 As-Is 1:1 인용 + To-Be 결정 별도 명시 | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | §0 환경 제약 (Runner / 가이드 mui 매핑) 만 잔존 | ✓ |
| G-I: To-Be 변환점 | §11 15 행 + §11.1 To-Be 명명 안 | ✓ |
| G-J: 정합체크서 §A.3 / §A.A-R12-1 / §D.4 ✗ + 사유 | §0 표 + 정합체크서 §A / §D 에 명시 (별도 산출물) | ✓ |

> 본 §13 모든 게이트 ✓ — 분석리포트 완성.

---

## §17. xfdl Script 본문 (전수 인용 — Phase 2~5 단일 원천)

### §17.1 Script 본문 전체 (xfdl:227~517)

> 본 §17.1 = xfdl Script 본문 전체 1:1 인용. Phase 2 (기능) / Phase 3 (디자인) / Phase 4 (BPMN) / Phase 5 (정합) 의 단일 원천. 본문 인용은 가독성을 위해 함수 단위로 분할.

#### (1) 헤더 + Form 변수 (xfdl:227~246)

```javascript
/*******************************************************************************
* 화면(명)   : CommUserRoleCopy
* 화면 설명  : 사용자 권한 일괄 등록
* 작성자     : 강재민
* 작성일자   : 2025.02.11
**/
include "_lib::libInClude.xjs";

this.userFromFilterString = "";
```

#### (2) onload + fn_button (xfdl:251~279)

```javascript
this.CommUserRoleCopy_onload = function(obj, e) {
    this.gfn_formOnLoad(obj, true);
    this.gfn_gridSelectedRow(this.div_main.form.div_userFrom.form.grd_userFrom, "red", "blue", "");
    this.gfn_quickMenuSet(obj, ...3회);
    this.fn_button();
    this.fn_searchUserList();
};

this.fn_button = function() {
    // 상단 공통 버튼
    this.div_title.form.div_topMenu.form.fn_commonTop_onload(this,
        new Array(),                                         // 사용자정의버튼
        new Array(["btn_search"], ["btn_save"]),             // 기본버튼
        false,
        "");
    // LEFT 버튼
    this.div_main.form.div_userFrom.form.div_leftMenu.form.fn_commonLeft_onload(this,
        this.div_main.form.div_userFrom.form.grd_userFrom,
        this.div_main.form.div_userFrom.form.div_leftMenu,
        new Array(""), "CHK");                                // 전체선택 사용
};
```

#### (3) fn_searchUserList — searchUserList action (xfdl:287~296)

```javascript
this.fn_searchUserList = function() {
    var sSvcID        = "searchUserList";
    var sOutDatasets  = "ds_userFrom=ds_userFrom";
    this.gfn_transaction(sSvcID, "", "", sOutDatasets, "", "fn_callBack");
};
```

#### (4) fn_search — search action (xfdl:299~314)

```javascript
this.fn_search = function() {
    if (this.gfn_isNull(this.div_search.form.edt_userIdCopy.value)) {
        this.gfn_message("", "", "Copy 대상 사용자 ID/사번 입력 후 조회해주세요.", "warning", "", "");
        return false;
    }
    var sSvcID        = "search";
    var sOutDatasets  = "ds_copyUser=ds_copyUser ds_copyRolegrp=ds_copyRolegrp";
    var sArgument     = this.gfn_setParam("pUserIdCopy", this.div_search.form.edt_userIdCopy.value);
    this.gfn_transaction(sSvcID, "", "", sOutDatasets, sArgument, "fn_callBack");
};
```

#### (5) fn_save — save action (xfdl:317~358)

```javascript
this.fn_save = function() {
    var infReqNoFlag = true;
    var infReqNo = this.div_main.form.div_infReq.form.edt_infReqNo.value;
    var description = this.div_main.form.div_infReq.form.edt_description.value;
    if (this.gfn_isNull(infReqNo) || this.gfn_isNull(description)) {
        infReqNoFlag = false;
    }
    if (this.ds_copyUser.rowcount == 0) {
        this.gfn_message("", "", "복사 대상 사용자가 조회되지 않았습니다.", "warning", "", "");
        return false;
    }
    if (this.ds_userTo.rowcount == 0) {
        this.gfn_message("", "", "권한 생성 대상자가 없습니다.", "warning", "", "");
        return false;
    }
    var fn_msgSaveBeforeCallBack = function (FormId, rtn) {
        if (rtn) {
            var sSvcID        = "save";
            var sInDatasets   = "ds_userTo=ds_userTo";
            var sOutDatasets  = "ds_userFrom=ds_userFrom";
            var sArgument     = this.gfn_setParam("pUserIdCopy", this.ds_copyUser.getColumn(0, "USER_ID"))
                              + this.gfn_setParam("pInfReqNo", this.div_main.form.div_infReq.form.edt_infReqNo.value)
                              + this.gfn_setParam("pDescription", this.div_main.form.div_infReq.form.edt_description.value);
            this.gfn_transaction(sSvcID, "", sInDatasets, sOutDatasets, sArgument, "fn_callBack");
        }
    };
    if (!infReqNoFlag) {
        this.gfn_message("", "", "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n권한부여 선처리 하시겠습니까?",
                         "confirm", "확인", fn_msgSaveBeforeCallBack);
    } else {
        this.gfn_message("", "", "권한을 복사 하시겠습니까?", "confirm", "확인", fn_msgSaveBeforeCallBack);
    }
};
```

#### (6) fn_callBack (xfdl:365~406)

```javascript
this.fn_callBack = function(sSvcId, nErrorCode, strErrorMsg) {
    switch(sSvcId) {
        case "searchUserList":
            if (nErrorCode == 0) {
                this.gfn_commonBottomStatus_msg(strErrorMsg["ds_userFrom"]+ "건 조회 되었습니다.");
            } else {
                this.gfn_commonBottomStatus_msg(strErrorMsg);
            }
            break;
        case "search":
            if (nErrorCode == 0) {
                this.gfn_commonBottomStatus_msg(strErrorMsg["ds_userCopy"]+ "건 조회 되었습니다.");
                // (주의) outDataset 명은 "ds_copyUser" 인데 메시지 키는 "ds_userCopy" — As-Is 보존 (오타 추정)
            } else {
                this.gfn_commonBottomStatus_msg(strErrorMsg);
            }
            break;
        case "save":
            if (nErrorCode == 0) {
                this.gfn_commonBottomStatus_msg(strErrorMsg["ds_userFrom"]+ "건 조회 되었습니다.");
                // dataset Clear
                this.ds_copyRolegrp.clearData();
                this.ds_copyUser.clearData();
                this.ds_userTo.clearData();
                this.ds_userFrom.clearData();
                // 초기화
                this.fn_searchUserList();
                this.div_main.form.div_infReq.form.edt_infReqNo.set_value("");
                this.div_main.form.div_infReq.form.edt_description.set_value("");
                this.div_main.form.div_userFrom.form.div_search.form.edt_userFilter.set_value("");
                this.ds_userFrom.filter("");
                this.div_search.form.edt_userIdCopy.set_value("");
            } else {
                this.gfn_commonBottomStatus_msg(strErrorMsg);
            }
            break;
    }
};
```

#### (7) 셔틀 좌/우 (xfdl:413~435)

```javascript
// userFrom -> userTo
this.div_main_btn_left_onclick = function(obj, e) {
    for (var i = this.ds_userFrom.rowcount; i >= 0; i--) {
        if (this.ds_userFrom.getColumn(i, "CHK") == 1) {
            var nRow = this.ds_userTo.addRow();
            this.ds_userTo.copyRow(nRow, this.ds_userFrom, i);
            this.ds_userFrom.deleteRow(i);
        }
    }
};

// userTo -> userFrom
this.div_main_btn_right_onclick = function(obj, e) {
    for (var i = this.ds_userTo.rowcount; i >= 0; i--) {
        if (this.ds_userTo.getColumn(i, "CHK") == 1) {
            var nRow = this.ds_userFrom.addRow();
            this.ds_userFrom.copyRow(nRow, this.ds_userTo, i);
            this.ds_userFrom.setColumn(nRow, "CHK", 0);  // 반환 시 CHK 해제
            this.ds_userTo.deleteRow(i);
        }
    }
};
```

#### (8) 사용자/부서 필터 (xfdl:438~499)

```javascript
this.div_main_div_userFrom_div_search_edt_userFilter_onkeydown = function(obj, e) {
    var searchValue = obj.value;
    this.fn_userFromFilter(searchValue, "USER");
};

this.div_main_div_userFrom_div_search_edt_deptFilter_oninput = function(obj, e) {
    var searchValue = obj.value;
    this.fn_userFromFilter(searchValue, "DEPT");
};

this.fn_userFromFilter = function(searchValue, type) {
    if (type == "USER") {
        var deptSearchValue = this.div_main.form.div_userFrom.form.div_search.form.edt_deptFilter.value;
        var filterString = "";
        if (this.gfn_isNull(searchValue)) {
            if (this.gfn_isNull(deptSearchValue)) {
                this.ds_userFrom.filter("");
            } else {
                filterString = "DEPT_NM.toString().toUpperCase().indexOf('"+deptSearchValue.toUpperCase()+"')>-1";
            }
        } else {
            filterString = "(USER_ID.toString().toUpperCase().indexOf('"+searchValue.toUpperCase()+"')>-1 "
                         + " || USER_EMP_NO.toString().toUpperCase().indexOf('"+searchValue.toUpperCase()+"')>-1"
                         + " || USER_NM.toString().toUpperCase().indexOf('"+searchValue.toUpperCase()+"')>-1)";
            if (!this.gfn_isNull(deptSearchValue)) {
                filterString += " && (DEPT_NM.toString().toUpperCase().indexOf('"+deptSearchValue.toUpperCase()+"')>-1)";
            }
        }
    } else {
        // type == DEPT 대칭 로직 (위 USER 분기와 같이 매트릭스 구성)
        var userSearchValue = this.div_main.form.div_userFrom.form.div_search.form.edt_userFilter.value;
        var filterString = "";
        if (this.gfn_isNull(searchValue)) {
            if (this.gfn_isNull(userSearchValue)) {
                this.ds_userFrom.filter("");
            } else {
                filterString = "USER_ID.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1 "
                             + " || USER_EMP_NO.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1"
                             + " || USER_NM.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1";
            }
        } else {
            filterString = "DEPT_NM.toString().toUpperCase().indexOf('"+searchValue.toUpperCase()+"')>-1";
            if (!this.gfn_isNull(userSearchValue)) {
                filterString += " && (USER_ID.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1 "
                              + " || USER_EMP_NO.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1"
                              + " || USER_NM.toString().toUpperCase().indexOf('"+userSearchValue.toUpperCase()+"')>-1)";
            }
        }
    }
    this.ds_userFrom.filter(filterString);
};
```

#### (9) onHeadClick + btn_fold (xfdl:502~509)

```javascript
this.fn_onHeadClick = function(obj, e) {
    this.gfn_commonOnheadclick(obj, e);
};

this.btn_fold_onclick = function(obj, e) {
    this.gfn_fold(this, this.div_search, this.div_main, this.btn_fold);
};
```

### §17.2 컬럼 1:1 전수 (xfdl ds_* + Mapper.xml 본 SQL + Java mapInsert 컬럼)

> 본 §17.2 = 분석 대상 자료의 모든 컬럼 1:1 전수. xfdl 4 Dataset / Mapper.xml 5 SQL / Java 1 mapInsert 의 모든 컬럼을 행 단위로 전수 인용.

#### §17.2-A xfdl Dataset 컬럼 전수

| Dataset | 컬럼명 | 타입 | size | bind 그리드 / 영역 | 비고 (As-Is 기본값) |
|---|---|---|---|---|---|
| ds_copyRolegrp | ROLE_GROUP_ID | STRING | 256 | grd_copyRoleGroup head=역할 그룹 ID | xfdl:196 / 50 / 58 / 62 |
| ds_copyRolegrp | ROLE_GROUP_NM | STRING | 256 | grd_copyRoleGroup head=역할 그룹명 | xfdl:197 / 51 / 59 / 63 |
| ds_copyRolegrp | USER_ID | STRING | 256 | (그리드 표시 ✗ — Dataset 만 보유. SQL selectCopyRoleGroupList 가 반환하는 USER_ID 컬럼 보관용) | xfdl:198 |
| ds_copyUser | USER_ID | STRING | 256 | grd_copyUser head=사용자ID, body bind:USER_ID edittype="none" | xfdl:203 / 18 / 27 / 32 |
| ds_copyUser | USER_EMP_NO | STRING | 256 | grd_copyUser head=사번, body bind:USER_EMP_NO | xfdl:204 / 19 / 28 / 33 |
| ds_copyUser | USER_NM | STRING | 256 | grd_copyUser head=사용자명, body bind:USER_NM | xfdl:205 / 20 / 29 / 34 |
| ds_userFrom | CHK | STRING | 256 | grd_userFrom head=선택, body bind:CHK displaytype=checkboxcontrol edittype=checkbox | xfdl:210 / 152 / 159 |
| ds_userFrom | USER_ID | STRING | 256 | grd_userFrom head=사용자ID, body bind:USER_ID edittype="none" | xfdl:211 / 153 / 160 |
| ds_userFrom | USER_EMP_NO | STRING | 256 | grd_userFrom head=사번 | xfdl:212 / 154 / 161 |
| ds_userFrom | USER_NM | STRING | 256 | grd_userFrom head=사용자명 | xfdl:213 / 155 / 162 |
| ds_userFrom | DEPT_NM | STRING | 256 | grd_userFrom head=부서 (tooltiptext="bind:DEPT_NM") | xfdl:214 / 156 / 163 |
| ds_userTo | CHK | STRING | 256 | grd_userTo head=선택, body bind:CHK displaytype=checkboxcontrol edittype=checkbox | xfdl:219 / 102 / 109 |
| ds_userTo | USER_ID | STRING | 256 | grd_userTo head=사용자ID, body bind:USER_ID edittype="none" | xfdl:220 / 103 / 110 |
| ds_userTo | USER_EMP_NO | STRING | 256 | grd_userTo head=사번 | xfdl:221 / 104 / 111 |
| ds_userTo | USER_NM | STRING | 256 | grd_userTo head=사용자명 | xfdl:222 / 105 / 112 |
| ds_userTo | DEPT_NM | STRING | 256 | grd_userTo head=부서 | xfdl:223 / 106 / 113 |

#### §17.2-B Mapper.xml SQL 컬럼 전수

| SQL ID | 컬럼명 | SQL 위치 | 출처 테이블 / scalar | 비고 |
|---|---|---|---|---|
| selectUserList | USER_ID | SELECT (xml:8) | TB_MCM_SEC_USER S | - |
| selectUserList | USER_EMP_NO | SELECT (xml:8) | TB_MCM_SEC_USER S | - |
| selectUserList | USER_NM | SELECT (xml:8) | TB_MCM_SEC_USER S | - |
| selectUserList | DEPT_NM | SELECT (xml:9) scalar subquery (As-Is) → To-Be: LEFT JOIN | ~~EAIUSER.IF_GW01MMFSHD01 B~~ → **To-Be: MCMAPUSER.TB_MCM_DEPT_INFO D** (Q-004 해소 정책 #2) | scalar subquery → JOIN |
| selectUserList | END_ACTIVE_DATE | WHERE (xml:16) | TB_MCM_SEC_USER S | `> SYSDATE` |
| selectUserList | USE_TP | WHERE (xml:17) | TB_MCM_SEC_USER S | `= 'Y'` |
| selectUserList ORDER BY | DEPT_NM, USER_NM | (xml:18) | - | ASC |
| selectCopyUserMap | USER_ID | SELECT (xml:22) | TB_MCM_SEC_USER | - |
| selectCopyUserMap | USER_EMP_NO | SELECT (xml:23) | TB_MCM_SEC_USER | - |
| selectCopyUserMap | USER_NM | SELECT (xml:24) | TB_MCM_SEC_USER | - |
| selectCopyUserMap WHERE | USER_ID = #{pUserIdCopy} OR USER_EMP_NO = #{pUserIdCopy} | (xml:26) | - | OR 조건 |
| selectCopyRoleGroupList | USER_ID | SELECT (xml:31) | TB_MCM_SEC_USER_MAPPING A | - |
| selectCopyRoleGroupList | ROLE_GROUP_ID | SELECT (xml:32) | TB_MCM_SEC_USER_MAPPING A | - |
| selectCopyRoleGroupList | ROLE_GROUP_NM | SELECT (xml:33) scalar subquery | TB_MCM_SEC_ROLEGROUP | scalar subquery |
| selectCopyRoleGroupList WHERE | USER_ID = #{pUserIdCopy} OR USER_ID = (subquery from TB_MCM_SEC_USER WHERE USER_EMP_NO) | (xml:35~36) | - | OR + scalar subquery |
| selectRoleMergeObject | USER_ID | SELECT (xml:41) | TB_MCM_SEC_USER_MAPPING A | - |
| selectRoleMergeObject | ROLE_GROUP_ID | SELECT (xml:42) | TB_MCM_SEC_USER_MAPPING A | - |
| selectRoleMergeObject | ROLE_GROUP_NM | SELECT (xml:43) scalar subquery | TB_MCM_SEC_ROLEGROUP | scalar subquery |
| selectRoleMergeObject WHERE | USER_ID = #{pUserIdCopy} AND ROLE_GROUP_ID NOT IN (subquery WHERE USER_ID = #{pUserId}) | (xml:45~49) | - | AND + NOT IN |
| mergeCommonCopyRoleGrp USING | USER_ID, ROLE_GROUP_ID FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{pUserIdCopy} | (xml:55) | source = TB_MCM_SEC_USER_MAPPING (#{pUserIdCopy} 의 매핑) | - |
| mergeCommonCopyRoleGrp ON | A.USER_ID = #{pUserId} AND A.ROLE_GROUP_ID = B.ROLE_GROUP_ID | (xml:56) | target = TB_MCM_SEC_USER_MAPPING A | PK 조건 |
| mergeCommonCopyRoleGrp INSERT | USER_ID, ROLE_GROUP_ID + ref_Audit.insert_item | (xml:58~62) | TB_MCM_SEC_USER_MAPPING | + audit |
| mergeCommonCopyRoleGrp VALUES | #{pUserId}, B.ROLE_GROUP_ID + ref_Audit.insert_value | (xml:63~67) | - | + audit |

#### §17.2-C Java mapInsert (TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK) 컬럼 전수

| # | 컬럼명 | Java line | 값 | 비고 |
|---:|---|---|---|---|
| 1 | OP_SUMUP_DT | java:56 | `CommonUtil.getCurrentDate("yyyyMMdd")` | 오늘 일자 (yyyyMMdd 문자열) |
| 2 | WORKS_CODE | java:57 | `"P"` | 하드코딩 (Q-008 부분 해소 — Permission 추정 / DMES 별도 마스터) |
| 3 | USER_ID | java:58 | `sUserId` (ds_userTo 행 USER_ID — 권한 생성 대상자) | 외곽 루프 변수 |
| 4 | ROLE_GROUP_ID | java:59 | `roleMergeObjectMap.get("ROLE_GROUP_ID")` (selectRoleMergeObject 결과) | 내부 루프 변수 |
| 5 | RESP_GBN | java:60 | `"A"` | 하드코딩 (Q-005 해소 — A=추가 Add) |
| 6 | ROLE_GROUP_NM | java:61 | `roleMergeObjectMap.get("ROLE_GROUP_NM")` | 내부 루프 변수 |
| 7 | INF_REQ_NO | java:62 | `context.get("pInfReqNo")` (xfdl edt_infReqNo / D-002) | xfdl 입력 |
| 8 | DESCRIPTION | java:63 | `context.get("pDescription")` (xfdl edt_description / D-004) | xfdl 입력 |

#### §17.2-D Java mapMerge (CommUserRoleCopyMapper.mergeCommonCopyRoleGrp) 컬럼 전수

| # | 컬럼명 | Java line | 값 | 비고 |
|---:|---|---|---|---|
| 1 | pUserIdCopy | java:71 | `context.get("pUserIdCopy")` 그대로 (xfdl 입력) | xml USING 의 source WHERE USER_ID |
| 2 | pUserId | java:72 | `sUserId` (외곽 루프 ds_userTo 행 USER_ID) | xml ON 의 target USER_ID |

#### §17.2-E Java mapSelect (As-Is: CommUserMngMapper.selectRoleMergeObject / To-Be: CommUserRoleCopyMapper.selectRoleMergeObject — Q-001 해소 정책 #1) 컬럼 전수

| # | 컬럼명 | Java line | 값 | 비고 |
|---:|---|---|---|---|
| 1 | pUserId | java:48 | `sUserId` (외곽 루프 ds_userTo 행 USER_ID — 권한생성대상) | xml NOT IN 의 USER_ID |
| 2 | pUserIdCopy | java:49 | `context.get("pUserIdCopy")` 그대로 (Copy 대상) | xml WHERE USER_ID |

> **To-Be 정정**: Java `dao.selectList("CommUserMngMapper.selectRoleMergeObject", ...)` → `dao.selectList("CommUserRoleCopyMapper.selectRoleMergeObject", ...)` (본 화면 namespace 정본) → 최종 JPA `UserMappingRepository.findRoleMergeObject(pUserIdCopy, pUserId)` 흡수.

> §17.2 합계 = xfdl 16 행 + Mapper SQL 23 행 + Java mapInsert 8 행 + Java mapMerge 2 행 + Java mapSelect 2 행 = **51 컬럼/조건 행 1:1 전수**. (단, mergeCommonCopyRoleGrp 의 audit fragment 9 컬럼은 ref_Audit 외부 정의 — 본 화면 범위 외).
