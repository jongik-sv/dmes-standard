---
screenId: commUserMng
asIsId: CommUserMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# 사용자 관리 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl/Java/Mapper.xml/bpmn) 자산은 Runner의 WinForms (designer.cs/cs/sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + java / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl onclick / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만"은 mui 환경에 미적용. cite 는 file:line 형식 유지 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 사용자 관리 |
| 화면 식별자 (screenId) | commUserMng |
| As-Is 식별자 (asIsId) | CommUserMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 관리 (commUserMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commUserMng |
| pageId | commUserMng |
| serviceId | commUserMng |
| Frontend 파일명 | `commUserMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (패턴 1 enum 강제):

> 사용자 관리는 CommUserMng (TB_MCM_SEC_USER 사용자 마스터) 의 조회, 등록(계정생성), 수정, 삭제(논리삭제 — END_ACTIVE_DATE 마감), 계정 재생성, 사용자 역할그룹(ROLE_GROUP) 추가·삭제·복사, 비밀번호/SSO 초기화를 수행한다.

- 주 사용자: 시스템 관리자 / 보안 관리자 / IT 운영 담당자
- 업무 도메인: 보안 사용자 마스터 (mcm — Master Code Management 의 보안 영역). 본 화면이 등록하는 사용자 ID 가 전사 모든 시스템의 인증·권한 기준점이며, 사용자 역할그룹 (`TB_MCM_SEC_USER_MAPPING`) 으로 역할 부여를 관리한다.
- 기능 요약 (BPMN action 11 enum — As-Is 11 개 트랜잭션 액션 전수):
  1. `searchCmUser` — 메인 사용자 그리드 조회 (`fn_search` → `fn_run("searchCmUser")`, xfdl:846 / 566) → BPMN `Task_searchCmUser` + chain `Task_0970821` (ds_mainAll 후속 조회)
  2. `saveCmUser` — 메인 사용자 그리드 저장 (수정만 — INSERT/DELETE 주석 처리) (`fn_modify` → `fn_run("saveCmUser")`, xfdl:892 / 576) → BPMN `UserTask_1opm8fa` → `SaveCommUserMng.java`
  3. `regCmUser` — 계정 생성 (`fn_register` → `fn_run("regCmUser")`, xfdl:996 / 576) → BPMN `RegCommUserMng` → `RegCommUserMng.java`
  4. `deleteCmUser` — 계정 삭제 (논리삭제 — END_ACTIVE_DATE 마감) (`fn_delete` + `div_deletePopup_btn_save_onclick` → `fn_run("deleteCmUser")`, xfdl:1073 / 1163 / 576) → BPMN `DeleteCommUserMng` → `DeleteCommUserMng.java`
  5. `reRegCmUser` — 계정 재생성 (`div_main_div_mainDetail_div_detail_btn_reRegister_onclick` → `fn_run("reRegCmUser")`, xfdl:1433 / 599) → BPMN `UserTask_128zs8e` → `ReRegCommUserMng.java`
  6. `searchUserRoleGrp` — 선택 사용자의 역할그룹 조회 (`ds_main_onrowposchanged` → `fn_run("searchUserRoleGrp")`, xfdl:1199 / 605) → BPMN `Task_searchUserRoleGrp`
  7. `saveUserRoleGrp` — 역할그룹 추가·삭제 저장 (`fn_rolSave` → `fn_run("saveUserRoleGrp")`, xfdl:1303 / 611) → BPMN `SaveRoleGroupHis` → `SaveRoleGroupHis.java` → `Task_saveUserRoleGrp` (CommonMultiSaveTask)
  8. `searchRoleGrp` — 추가 가능한 역할그룹 목록 조회 (`fn_rolSearch` → `fn_run("searchRoleGrp")`, xfdl:1315 / 618) → BPMN `Task_searchRoleGrp`
  9. `pwdinit` — 비밀번호 초기화 / SSO 비밀번호 초기화 (`div_main_div_mainDetail_btn_PwdReset_onclick` + `div_main_btn_SSOPwdReset_onclick` → `fn_run("pwdinit")`, xfdl:1382 / 1405 / 625) → BPMN `UserTask_pwdinit` → `PasswordInit.java`
  10. `saveUserRoleGrpCopy` — 다른 사용자의 역할그룹 복사 (`div_main_div_mainDetail_div_detail_btn_RoleCopy_onclick` → `fn_run("saveUserRoleGrpCopy")`, xfdl:1421 / 640) → BPMN `SaveRoleGroupCopyHis` → `SaveRoleGroupCopyHis.java` → `Task_0v3mxy0` (mergeCommonCopyRoleGrp)
  11. `commonUserDept` — 부서코드 팝업 조회 (`div_dept_cd.fn_init` → `gfn_transaction("commonUserDept", ...)`, xfdl:421~435 → BPMN `Task_1tti6qu`)

---

## §2. 자료 수집 인벤토리 (mui 5 자산 — Java task 7 개 분리 row)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommUserMng.xfdl` | 1517 | Y | Form / Layout / Div / Grid / Button / Combo / Static / Edit / Calendar / Radio / Dataset / Script 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask — 사용자 계정 삭제 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/DeleteCommUserMng.java` | 80 | Y | `run(Context, Task)` — `ds_main` for-loop, status="deleted" 분기 + `deleteCmUser` SQL (END_ACTIVE_DATE 마감) + `TB_MCM_SEC_USER_HIS_Mapper.insert` (PROC_TYPE='D', PROC_CASE='M') 이력 적재 | §7 |
| 3 | Java UserTask — 비밀번호 초기화 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/PasswordInit.java` | 60 | Y | `run(Context, Task)` — `SSO_RESET_FLAG="Y"` 분기: ds_main for-loop 모두에 대해 `updateCommonSSOPwdInit` / 그 외: 단건 `mergeCommonPwdInit` (USER_ENC_PWD + USER_SSO_PWD bcrypt) | §7 |
| 4 | Java UserTask — 계정 생성 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/RegCommUserMng.java` | 86 | Y | `run(Context, Task)` — status="inserted" 분기 + `insertCommUser` + `mergeCommonPwdInit` (bcrypt DEFAULT_PASSWORD + bcrypt(USER_ID+USER_EMP_NO)) + `USE_TP="Y"` 강제 + `TB_MCM_SEC_USER_HIS_Mapper.insert` (PROC_TYPE='C', PROC_CASE='M') 이력 적재 | §7 |
| 5 | Java UserTask — 계정 재생성 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/ReRegCommUserMng.java` | 91 | Y | `run(Context, Task)` — ds_main.get(0) 단건 처리 — `updateReRegUser` (START_ACTIVE_DATE=오늘 / END_ACTIVE_DATE=99991231 / USE_TP=Y) + `mergeCommonPwdInit` + 이력 적재 (PROC_TYPE='C', PROC_CASE='M'). updateReRegUserCnt<0 → `UserException` | §7 |
| 6 | Java UserTask — 사용자 정보 수정 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/SaveCommUserMng.java` | 96 | Y | `run(Context, Task)` — status="updated" 분기만 처리 + `updateCommUser`. "inserted" / "deleted" 코드는 As-Is 주석 (라인 42~57 / 68~83) — Reg/Delete 가 별도 클래스로 분리되었기 때문 | §7 |
| 7 | Java UserTask — 사용자 역할그룹 복사 이력 적재 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/SaveRoleGroupCopyHis.java` | 75 | Y | `run(Context, Task)` — `selectRoleMergeObject` (USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만) for-loop + `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (RESP_GBN='A') | §7 |
| 8 | Java UserTask — 사용자 역할그룹 이력 적재 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommUserMng/SaveRoleGroupHis.java` | 83 | Y | `run(Context, Task)` — `ds_userRolegrp` for-loop + status 분기: inserted → RESP_GBN='A' / deleted → RESP_GBN='D' + `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` | §7 |
| 9 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommUserMngMapper.xml` | 286 | Y | 17 SQL ID (select 7 / insert 4 / update 4 / delete 2) — namespace=CommUserMngMapper | §6 |
| 10 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommUserMng.bpmn` | 465 | Y | StartEvent 1 / ExclusiveGateway 1 (11 outgoing) / Task 8 / UserTask 7 / EndEvent 1 / SequenceFlow 22 | §8 |
| 11 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | sheet rId94/rId99/rId102/rId90/rId98/rId105 | Y (직접 추출 완료 2026-05-30) | SEC_USER (38) / SEC_USER_MAPPING (19) / SEC_USER_PWD (24) / SEC_ROLEGROUP (24) / SEC_USER_HIS (24) / SEC_USER_ROLL_HIS (25) — 합계 154 컬럼 1:1 §9.1 등재 | Q-001 해소 |
| 12 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be McmAuditEntity 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.update / insert_item / insert_value">` 13 회 호출은 To-Be 에서 폐기. **`McmAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 9 컬럼 채움** (정책 #1 — mcm-core 기존 자산 보존 + cma 정본 패턴) | - |
| 13 | ~~외부 EAI 테이블 정의서~~ → To-Be DMES 부서 마스터 | ~~`EAIUSER.IF_DSHRMMCMHD02`~~ → **`MCMAPUSER.TB_MCM_DEPT_INFO`** (신규 설계) | 11 컬럼 | Y (2026-05-31) | **(정책 #2 / Q-002 해소)** EAI 폐기 + DMES 자체 부서 마스터 신설. `selectCommUser` DEPT_NM 은 `LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD=A.DEPT_CD` 로 전환. `selectCommDept` 는 본 테이블 단독 조회. § 9.1.7 카탈로그 등재 | §9.1.7 |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 ("사용자 관리") + 공통 topMenu (커스텀 btn_register/btn_delete + 기본 btn_search/btn_modify/btn_close) | xfdl:260~267 |
| A-FILTER | `Div div_search` | top=div_title:10 / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (사용자 / 사용여부 / 내부외부구분) | xfdl:268~279 |
| A-FOLD | `Button btn_fold` | top=93 / height=12 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:7 |
| A-MAIN | `Div div_main` | top=btn_fold:20 / bottom=40 / left=20 / right=20 | 좌측 그리드 / 중앙 상세 / 우측 역할그룹 2단 (3 컬럼) 분할 컨테이너 | xfdl:8~259 |
| A-MAIN-LEFT (G) | `Div div_mainGrd` (xfdl:11) | top=0 / bottom=0 / left=0 / right=760 | 메인 그리드 + 상단 commonLeftButton / commonRightButton + edt_srch_cseq "조회 결과" 라벨 | xfdl:11~86 |
| A-MAIN-CENTER (D) | `Div div_mainDetail` (xfdl:87) | top=0 / left=div_mainGrd:10 / width=430 / bottom=0 / formscrollbartype=none | 사용자 상세 입력 폼 (div_detail) + btn_PwdReset / btn_RoleCopy / btn_SSOPwdReset / btn_reRegister | xfdl:87~198 |
| A-MAIN-RIGHT-TOP (GR) | `Div div_roleGrpId` (xfdl:199) | top=0 / height=291 / left=div_mainDetail:10 / right=20 | 선택 사용자의 보유 역할그룹 그리드 (grd_userRolegrp) + 상단 commonRightButton (역할삭제/역할저장) | xfdl:199~227 |
| A-MAIN-RIGHT-BOT (GL) | `Div div_roleGrpIdList` (xfdl:228) | top=div_roleGrpId:10 / bottom=0 / left=div_mainDetail:10 / right=20 | 추가 가능한 전체 역할그룹 목록 그리드 (grd_rolegrpList) + 상단 commonRightButton (역할추가/역할조회) | xfdl:228~256 |
| A-POPUP-DEL | `Div div_deletePopup` (xfdl:280) | top=270 / left=415 / width=470 / height=273 / visible=false / border=2px solid #D6e2ea | 계정 삭제 확인 모달 (As-Is 본 Form 내부 Div 모달) | xfdl:280~302 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / left=20 / right=20 / cssclass=`div_WF_Footer` | 공통 bottom status (commonBottomStatus.xfdl include) | xfdl:6 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Static.text) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | 사용자 | `edt_USER_ID` (옆 Static `sts_userId`) | TextBox | 100 | (없음) | N | xfdl:274~275 |
| S-002 | 사용 여부 | `cbo_USE_TP` (옆 Static `sts_useTp`) | Combo | - | innerdataset=`ds_useTp` (Y/N), value="Y", index=0, displayrowcount=3 | N | xfdl:272~273 |
| S-003 | 내부 외부 구분 | `cbo_IN_OUT_EMP_TP` (옆 Static `sts_InOutTp`) | Combo | - | innerdataset=`ds_inOutEmpTp` (I/O), value="", index=-1, displayrowcount=3 | N | xfdl:271 / 276 |

### §3.3 메인 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, taborder=0)

> head Row 1 + body Row 1. 17 컬럼 (col 0 fixed band=left). selecttype="row", cellmovingtype="col", scrollbartype="auto", autofittype="none".

| ID | head text | body bind | 컬럼 size | edittype | displaytype | combo | 비고 / 근거 |
|---|---|---|---:|---|---|---|---|
| G-001 | 상태 | `bind:STATUS` (band="left", 고정) | 48 | (없음) | imagecontrol | - | Nexacro auto row state 아이콘. xfdl:19 / 42 / 61 |
| G-002 | 사용자ID | `bind:USER_ID` | 117 | none | normal | - | 기존 행 편집 불가. xfdl:20 / 43 / 62 |
| G-003 | 사번 | `bind:USER_EMP_NO` | 101 | - | - | - | xfdl:21 / 44 / 63 |
| G-004 | SSO ID | `bind:SSO_ID` | 80 | - | - | - | xfdl:22 / 45 / 64 |
| G-005 | 사용자명 | `bind:USER_NM` | 80 | - | - | - | xfdl:23 / 46 / 65 |
| G-006 | 유효개시일 | `bind:START_ACTIVE_DATE` | 80 | - | date (`calendardateformat="yyyy-MM-dd"`) | - | xfdl:24 / 47 / 66 |
| G-007 | 유효기한일 | `bind:END_ACTIVE_DATE` | 80 | - | date (동일) | - | xfdl:25 / 48 / 67 |
| G-008 | 부서코드 | `bind:DEPT_CD` | 80 | - | - | - | xfdl:26 / 49 / 68 |
| G-009 | 사용자분류코드 | `bind:USER_CATEGORY_CD` | 96 | - | - | - | xfdl:27 / 50 / 69 |
| G-010 | 사용구분 | `bind:USE_TP` | 71 | - | combotext | combodataset=`ds_useTp`, combocodecol=`CD`, combodatacol=`NM` | xfdl:28 / 51 / 70 |
| G-011 | EMAIL | `bind:EMAIL` | 96 | - | - | - | xfdl:29 / 52 / 71 |
| G-012 | 전화번호 | `bind:TEL_NO` | 96 | - | - | - | xfdl:30 / 53 / 72 |
| G-013 | MOBILE번호 | `bind:MOBILE_TEL_NO` | 94 | - | - | - | xfdl:31 / 54 / 73 |
| G-014 | 내부외부구분 | `bind:IN_OUT_EMP_TP` | 80 | - | combotext | combodataset=`ds_inOutEmpTp`, combodatacol=`NM`, combocodecol=`CD` | xfdl:32 / 55 / 74 |
| G-015 | GROUP ID1 | `bind:GROUP_ID1` | 80 | - | - | - | xfdl:33 / 56 / 75 |
| G-016 | GROUP ID2 | `bind:GROUP_ID2` | 80 | - | - | - | xfdl:34 / 57 / 76 |
| G-017 | GROUP ID3 | `bind:GROUP_ID3` | 80 | - | - | - | xfdl:35 / 58 / 77 |

- 그리드 옵션: `cellmovingtype="col"`, `selecttype="row"`, `scrollbartype="auto"`, head Row 1 + body Row 1
- 이벤트: `onkeydown="div_main_div_mainGrd_grd_main_onkeydown"` (xfdl:1263, 본문 비어있음), `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` (xfdl:1253, `gfn_commonOnheadclick` 공통 정렬), `ds_main.onrowposchanged="ds_main_onrowposchanged"` (xfdl:306, Row 변경 시 역할그룹 조회 + 상세 영역 readonly/btn_reRegister 토글)

### §3.4 사용자 역할그룹 그리드 GR-NNN (`grd_userRolegrp`, binddataset=`ds_userRolegrp`, taborder=0 in div_roleGrpId)

> head Row 1 + body Row 1. 2 컬럼. `autofittype="col"`.

| ID | head text | body bind | 컬럼 size | 근거 |
|---|---|---|---:|---|
| GR-001 | 역할 그룹 ID | `bind:ROLE_GROUP_ID` | 120 | xfdl:206 / 214 / 218 |
| GR-002 | 역할 그룹명 | `bind:ROLE_GROUP_NM` | 166 | xfdl:207 / 215 / 219 |

### §3.5 추가 가능 역할그룹 그리드 GL-NNN (`grd_rolegrpList`, binddataset=`ds_rolegrpList`, taborder=0 in div_roleGrpIdList)

> head Row 1 + body Row 1. 2 컬럼. `autofittype="col"`, `selecttype="multirow"`.

| ID | head text | body bind | 컬럼 size | 근거 |
|---|---|---|---:|---|
| GL-001 | 역할 그룹 ID | `bind:ROLE_GROUP_ID` | 114 | xfdl:235 / 243 / 247 |
| GL-002 | 역할 그룹명 | `bind:ROLE_GROUP_NM` | 172 | xfdl:236 / 244 / 248 |

### §3.6 상세 입력 필드 D-NNN (`div_mainDetail.div_detail` 내)

> div_detail 의 top=25 / left=0 / right=0 / bottom=-20 영역. 좌측 라벨 Static (cssclass=`stc_WF_Box` + Edit value/text 라벨 readonly) + 우측 입력. cssclass=`Essential` 표시는 필수.

| ID | 화면 표시명 (label) | 컨트롤 (xfdl id) | 입력 유형 | maxlength | inputtype / inputmode | cssclass | bind (ds_main 컬럼) | 필수 | 근거 |
|---|---|---|---|---:|---|---|---|---|---|
| D-001 | 사용자ID | `edt_user_id` | TextBox | 90 | normal / normal | Essential | USER_ID | Y (Essential) | xfdl:110 / 1501 (bind item0) |
| D-002 | 사원 번호 | `edt_user_emp_no` | TextBox | 10 | digit,alpha | Essential | USER_EMP_NO | Y (Essential) | xfdl:140 / 1513 (item12) |
| D-003 | SSO ID | `edt_sso_id` | TextBox | 90 | digit,alpha | (없음) | SSO_ID | N | xfdl:137 / 1510 (item5) |
| D-004 | 사용자명 | `edt_user_nm` | TextBox | 90 | - | Essential | USER_NM | Y (Essential) | xfdl:111 / 1502 (item1) |
| D-005 | 유효개시일 | `cal_start_active_date` | Calendar | - | - | (없음) | START_ACTIVE_DATE | - (rowAdd 기본값 = 오늘, xfdl:862) | xfdl:113 / 1507 (item10) |
| D-006 | 유효개시기한일 | `cal_end_active_date` | Calendar | - | - | (없음) | END_ACTIVE_DATE | - (rowAdd 기본값 = "99991231", xfdl:863) | xfdl:125 / 1508 (item4) |
| D-007 | 부서코드 | `div_dept_cd` (Div, url include `_com_div::commonDynamic.xfdl`) | 부서 팝업 컴포넌트 (commonDynamic) | - | - | Essential | DEPT_CD (`fn_set_value`/`fn_set_nm` 으로 ds_main 수동 갱신, xfdl:825 / 1225~1228) | Y (Essential) | xfdl:129 |
| D-008 | 사용자분류코드 | `edt_user_category_cd` | TextBox | - | - | (없음) | USER_CATEGORY_CD | N | xfdl:128 / 1514 (item13) |
| D-009 | 이메일 | `edt_email` | TextBox | 300 | - | (없음) | EMAIL | Y (Essential 라벨, edi_WF_LabelE, xfdl:105) | xfdl:115 / 1505 (item8) |
| D-010 | 전화 번호 | `ed_tel_no` | TextBox | 90 | digit | (없음) | TEL_NO | N (onchanged: `div_main_div_mainDetail_div_detail_edtTelNo_onchanged` — 본문 미확인) | xfdl:114 / 1503 (item6) |
| D-011 | 모바일번호 | `edt_mobile_no` | TextBox | 90 | digit | (없음) | MOBILE_TEL_NO | N | xfdl:134 / 1504 (item7) |
| D-012 | 내부 외부 구분 | `edt_in_out_emp_tp` | Combo | - | - | Essential | IN_OUT_EMP_TP | Y (Essential) | innerdataset=ds_inOutEmpTp, codecolumn=CD, datacolumn=NM. xfdl:136 / 1506 (item9) |
| D-013 | 사용자 그룹1 | `edt_group_id1` | Combo | - | - | (없음) | GROUP_ID1 | N | innerdataset=(빈값 — 동적 미세팅), codecolumn=condCd, datacolumn=condNm. xfdl:130 / 1509 (item3) |
| D-014 | 사용자 그룹2 | `edt_group_id2` | Combo | - | - | (없음) | GROUP_ID2 | N | (동일 미세팅). xfdl:138 / 1511 (item2) |
| D-015 | 사용자 그룹3 | `edt_group_id3` | Combo | - | - | (없음) | GROUP_ID3 | N | (동일 미세팅). xfdl:139 / 1512 (item11) |
| D-016 | 비밀번호 초기화 | `rdo_PwdReset` | Radio | - | direction=vertical | (없음) | (innerdataset Y/Yes, N/No, index=1=No 기본) | - | xfdl:143~160 |
| D-017 | 사용자 역할그룹 복사 | `edt_role_copy` | TextBox (displaynulltext="USER_ID 입력") | - | - | (없음) | (bind ✗ — script 변수) | - | xfdl:162 |
| D-018 | SSO 초기화 | `rdo_SSOReset` | Radio | - | direction=vertical | (없음) | (Y/Yes, N/No, index=1 기본) | - | xfdl:167~184 |
| D-019 | 정보처리의뢰서번호 | `edt_infReqNo` | TextBox | 300 | - | (없음) | INF_REQ_NO (저장 시 ds_main 으로 setColumn, xfdl:588) | N | xfdl:186 |
| D-020 | 처리사유 | `edt_description` | TextBox | 300 | - | (없음) | DESCRIPTION (저장 시 setColumn, xfdl:589) | N | xfdl:188 |

> bind 매트릭스 검증 (xfdl:1500~1515): 14 bind item — item0~13 = edt_user_id / edt_user_nm / edt_group_id2 / edt_group_id1 / cal_end_active_date / edt_sso_id / ed_tel_no / edt_mobile_no / edt_email / edt_in_out_emp_tp / cal_start_active_date / edt_group_id3 / edt_user_emp_no / edt_user_category_cd. SSO_ID / DEPT_CD / DEPT_NM / INF_REQ_NO / DESCRIPTION 일부는 script setColumn 으로 갱신.

### §3.7 div_deletePopup 내부 필드 (DP-NNN — A-POPUP-DEL 모달 폼)

| ID | 화면 표시명 | 컨트롤 (xfdl id) | 입력 유형 | maxlength | 기본값 | 근거 |
|---|---|---|---|---:|---|---|
| DP-001 | (타이틀) "계정삭제" | `edt_title` (Edit readonly cssclass=edi_WFHD_Title) | Static (표시 전용) | - | - | xfdl:283 |
| DP-002 | (메시지 이미지) img_msg_question.png | `img_MsgImg` (ImageViewer) | Image | - | - | xfdl:295 |
| DP-003 | 메시지 텍스트 ("계정을 삭제 하시겠습니까?") | `sts_message` (Edit readonly cssclass=edi_WFSA_Label) | Static (표시 전용 — script 에서 동적 갱신 "{USER_ID} 계정을 삭제하시겠습니까?", xfdl:1155) | - | "계정을 삭제 하시겠습니까?" | xfdl:296 |
| DP-004 | 유효개시기한일 | `cal_end_active_date` (in div_search00) | Calendar | - | (open 시 오늘로 set, xfdl:1156) | xfdl:290 |
| DP-005 | 정보처리의뢰서 번호 | `edt_infReqNo` | TextBox | 300 | (open 시 div_detail.edt_infReqNo.value 복사, xfdl:1157) | xfdl:292 |
| DP-006 | 처리사유 | `edt_description` | TextBox | 300 | (open 시 div_detail.edt_description.value 복사, xfdl:1158) | xfdl:294 |
| DP-B-001 | 취소 | `btn_close` (cssclass=btn_WF_CustomM,btn_WF_Delete) | Button | - | onclick=`div_deletePopup_btn_close_onclick` (xfdl:1182) — 팝업 닫기 + 입력 초기화 | xfdl:284 |
| DP-B-002 | 확인 | `btn_save` (cssclass=btn_WF_Save) | Button | - | onclick=`div_deletePopup_btn_save_onclick` (xfdl:1163) — ds_main rowposition deleteRow + END_ACTIVE_DATE/INF_REQ_NO/DESCRIPTION 복사 + `fn_run("deleteCmUser")` + 팝업 닫기 | xfdl:285 |

### §3.8 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 비고 | 근거 |
|---|---|---|---|---|---|
| DS-001 | `ds_main` | USER_ID / USER_EMP_NO / SSO_ID / USER_NM / START_ACTIVE_DATE / END_ACTIVE_DATE / DEPT_CD / USER_CATEGORY_CD / USE_TP / EMAIL / TEL_NO / MOBILE_TEL_NO / IN_OUT_EMP_TP / GROUP_ID1 / GROUP_ID2 / GROUP_ID3 / DEPT_NM / INF_REQ_NO / DESCRIPTION (19 컬럼) | 메인 그리드 + 상세 폼 binddataset | type STRING(256) 통일. `useclientlayout=true`, `loadkeymode=reset`, `onrowposchanged=ds_main_onrowposchanged` | xfdl:306~328 |
| DS-002 | `ds_userRolegrp` | ROLE_GROUP_ID / ROLE_GROUP_NM / USER_ID (3 컬럼) | 선택 사용자의 보유 역할그룹 그리드 | USER_ID 컬럼은 fn_rolAdd 에서 동적 addColumn (xfdl:1332) | xfdl:329~335 |
| DS-003 | `ds_rolegrpList` | ROLE_GROUP_ID / ROLE_GROUP_NM (2 컬럼) | 추가 가능 역할그룹 목록 그리드 | - | xfdl:336~341 |
| DS-004 | `ds_inOutEmpTp` | CD / NM (정적 2행: I/내부, O/외부) | S-003 / G-014 / D-012 콤보 LoV | hardcoded Dataset | xfdl:342~357 |
| DS-005 | `ds_useTp` | CD / NM (정적 2행: Y/Yes, N/No) | S-002 / G-010 콤보 LoV | hardcoded Dataset | xfdl:358~373 |
| DS-006 | `ds_mainAll` | USER_ID / USER_EMP_NO (2 컬럼) | 중복 검증용 전체 사용자 ID/사번 목록 | searchCmUser 응답 시 동시 적재 (BPMN Task_0970821, sqlKey=selectCommUserAll) | xfdl:374~379 |
| DS-007 | `ds_pwdtmp` | USER_ID / OLD_PWD / NEW_PWD / CF_PWD (4 컬럼) | WebBrowser 기반 비밀번호 변경 임시 dataset | wb_pwdChg_init_onusernotify (xfdl:697) 에서 적재 후 `/security/password/pwdtmp` 호출 | xfdl:380~387 |

### §3.9 외부 include / 공통 컴포넌트 (FX-NNN)

| ID | xfdl id | 컨트롤 종류 | 위치 | 역할 | 근거 |
|---|---|---|---|---|---|
| FX-001 | `div_topMenu` (in div_title) | Div (url include `_com_div::commonTopButton.xfdl`) | div_title 우측 (left=270 / right=0 / top=10 / height=27) | 화면 상단 커스텀+기본 버튼 등록 (`fn_commonTop_onload`) | xfdl:264 / 452~457 |
| FX-002 | `div_leftMenu` (in div_mainGrd) | Div (url include `_com_div::commonLeftButton.xfdl`) | div_mainGrd 상단 좌측 (left=edt_srch_cseq:5 / top=0 / width=223 / height=21) | 그리드 좌상단 공통 버튼 (chk_check / btn_sum / btn_copyPaste) — `fn_commonLeft_onload` | xfdl:83 / 459~463 |
| FX-003 | `div_rightMenu` (in div_mainGrd) | Div (url include `_com_div::commonRightButton.xfdl`) | div_mainGrd 상단 우측 (right=0 / width=280 / top=0 / height=21) | 그리드 우상단 공통 버튼 (btn_rowAdd / btn_rowCancel) — `fn_commonRight_onload` | xfdl:14 / 465~469 |
| FX-004 | `div_rightRole` (in div_roleGrpId) | Div (url include `_com_div::commonRightButton.xfdl`) | div_roleGrpId 상단 우측 (right=0 / width=130 / top=0 / height=21) | 역할 그리드 상단 커스텀 버튼 (btn_rolDel/fn_rolDel/역할삭제, btn_rolSave/fn_rolSave/역할저장) | xfdl:224 / 472~476 |
| FX-005 | `div_rightRoleList` (in div_roleGrpIdList) | Div (url include `_com_div::commonRightButton.xfdl`) | div_roleGrpIdList 상단 우측 (right=0 / width=130 / top=0 / height=21) | 역할 목록 그리드 상단 커스텀 버튼 (btn_rolAdd/fn_rolAdd/역할추가, btn_rolSearch/fn_rolSearch/역할조회) | xfdl:253 / 479~483 |
| FX-006 | `div_dept_cd` (in div_detail) | Div (url include `_com_div::commonDynamic.xfdl`) | div_detail (left=184 / top=172 / height=21 / right=5 / cssclass=Essential) | 부서코드 팝업/조회 공통 컴포넌트 (`commonDynamic_onload` — service `commonUserDept`, URL `csa::CommUserMng`, dataset `ds_userDept`, columns `DEPT_CD,DEPT_NM`, ID col `DEPT_CD`, Nm col `DEPT_NM`, cond `edt_DEPT_CD`) | xfdl:129 / 421~435 / 437 |
| FX-007 | `div_bottom` | Div (url include `_com_div::commonBottomStatus.xfdl`) | bottom=0 / height=20 | 하단 status bar — `fn_commonBottomStatus_msg(text)` 호출 | xfdl:6 |
| FX-008 | `edt_srch_cseq` | Edit (cssclass=edi_WF_Title1, value="조회 결과", readonly) | div_mainGrd 상단 좌측 (left=0 / top=0 / width=77 / height=21) | 그리드 좌상단 "조회 결과" 라벨 | xfdl:82 |

---

## §4. 버튼·액션 (B-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick + commonTop 등록 커스텀 버튼 포함)

| ID | 위치 | 버튼명 (text) | xfdl id / 등록 위치 | onclick 핸들러 (또는 fn_commonTop 등록 fn) | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_title 우측 topMenu | 계정생성 (커스텀) | `btn_register` (등록 fn=`fn_register`) | `fn_register` (xfdl:996~1071) | 데이터셋 INSERT 검증 + `fn_run("regCmUser")` (선처리 confirm 분기) | regCmUser | xfdl:453 / 996 |
| B-002 | div_title 우측 topMenu | 계정삭제 (커스텀) | `btn_delete` (등록 fn=`fn_delete`) | `fn_delete` (xfdl:1073~1160) | 행 선택 검증 + 필수 검증 + 중복 검증 + div_deletePopup 표시 (set_visible=true) | (popup) → deleteCmUser | xfdl:454 / 1073 |
| B-003 | div_title 우측 topMenu | (기본) 조회 | `btn_search` (기본) | `fn_search` (xfdl:846~848) | `fn_run("searchCmUser")` | searchCmUser | xfdl:455 / 846 |
| B-004 | div_title 우측 topMenu | (기본) 수정 (저장) | `btn_modify` (기본) | `fn_modify` (xfdl:892~993) | 데이터셋 UPDATE 검증 + 필수 검증 + 중복 검증 + confirm → `fn_run("saveCmUser")` | saveCmUser | xfdl:455 / 892 |
| B-005 | div_title 우측 topMenu | (기본) 닫기 | `btn_close` (기본) | `fn_close` (xfdl:1192~1196) | `objApp.gv_AppTabPath.form.fn_closeForm()` | - (클라이언트 전용) | xfdl:455 / 1192 |
| B-006 | div_search 상단 | 접기 토글 | `btn_fold` (xfdl:7) | `btn_fold_onclick` (xfdl:1258~1261) | `gfn_fold(this, div_search, div_main, btn_fold)` | - (클라이언트 전용) | xfdl:7 / 1258 |
| B-007 | div_mainGrd commonLeftButton 등록 | 선택체크 / 합계 / 복사붙여넣기 | `chk_check` / `btn_sum` / `btn_copyPaste` (외부 commonLeftButton 정의) | (외부 공통) | (외부 공통) | - | xfdl:462 |
| B-008 | div_mainGrd commonRightButton 등록 | 행추가 / 행취소 | `btn_rowAdd` (등록 fn=`fn_rowAdd`) / `btn_rowCancel` (등록 fn=`fn_rowCancel`) | `fn_rowAdd` (xfdl:857~869) — ds_main.addRow() + USE_TP="Y" / START_ACTIVE_DATE=today / END_ACTIVE_DATE="99991231" 기본값 + Detail focus + 영역 enable. `fn_rowCancel` (xfdl:888~890) — `gfn_grdInit(grd_main)` | - (클라이언트 전용) | xfdl:467 / 857 / 888 |
| B-009 | div_roleGrpId commonRightButton 등록 | 역할삭제 (커스텀) | `btn_rolDel` (등록 fn=`fn_rolDel`) | `fn_rolDel` (xfdl:1377~1380) — `gfn_deleteRow(ds_userRolegrp, ds_userRolegrp.rowposition)` | - (클라이언트 전용) | xfdl:473 / 1377 |
| B-010 | div_roleGrpId commonRightButton 등록 | 역할저장 (커스텀) | `btn_rolSave` (등록 fn=`fn_rolSave`) | `fn_rolSave` (xfdl:1303~1312) — confirm → `fn_run("saveUserRoleGrp")` | saveUserRoleGrp | xfdl:473 / 1303 |
| B-011 | div_roleGrpIdList commonRightButton 등록 | 역할추가 (커스텀) | `btn_rolAdd` (등록 fn=`fn_rolAdd`) | `fn_rolAdd` (xfdl:1321~1374) — 선택 row (single/multi Ctrl) → ds_rolegrpList 의 USER_ID 컬럼 추가 + ds_userRolegrp.addRow + copyRow + ds_rolegrpList.deleteRow + deleteColumn(USER_ID) | - (클라이언트 전용) | xfdl:480 / 1321 |
| B-012 | div_roleGrpIdList commonRightButton 등록 | 역할조회 (커스텀) | `btn_rolSearch` (등록 fn=`fn_rolSearch`) | `fn_rolSearch` (xfdl:1315~1318) — `fn_run("searchRoleGrp")` | searchRoleGrp | xfdl:480 / 1315 |
| B-013 | div_detail | 비밀번호 초기화 | `btn_PwdReset` (xfdl:161) | `div_main_div_mainDetail_btn_PwdReset_onclick` (xfdl:1382~1396) — rdo_PwdReset.value=="Y" 인 경우 confirm → `this.ssoReset = null; fn_run("pwdinit")` → fn_pwInit() (WebBrowser RSA pwChg.html 호출) | pwdinit | xfdl:161 / 1382 |
| B-014 | div_detail | 역할그룹등록 | `btn_RoleCopy` (xfdl:163) | `div_main_div_mainDetail_div_detail_btn_RoleCopy_onclick` (xfdl:1421~1429) — confirm "{edt_role_copy} 사용자의 역할그룹을 등록 하시겠습니까?" → `fn_run("saveUserRoleGrpCopy")` | saveUserRoleGrpCopy | xfdl:163 / 1421 |
| B-015 | div_detail | SSO 초기화 | `btn_SSOPwdReset` (xfdl:166) | `div_main_btn_SSOPwdReset_onclick` (xfdl:1405~1419) — rdo_SSOReset.value=="Y" 인 경우 confirm → `this.ssoReset = "Y"; fn_run("pwdinit")` (PasswordInit.java SSO 분기) | pwdinit (SSO_RESET_FLAG="Y") | xfdl:166 / 1405 |
| B-016 | div_detail | 계정 재생성 | `btn_reRegister` (xfdl:192, enable=false 기본) | `div_main_div_mainDetail_div_detail_btn_reRegister_onclick` (xfdl:1433~1498) — rowposition 검증 + USER_EMP_NO / USER_NM / IN_OUT_EMP_TP / EMAIL 필수 검증 + ds_main rowType 재설정 (rowposition 만 UPDATE / 나머지 NORMAL) + INF_REQ_NO 선처리 confirm → `fn_run("reRegCmUser")` | reRegCmUser | xfdl:192 / 1433 |
| B-017 | div_deletePopup | 취소 | `btn_close` (in div_deletePopup, xfdl:284) | `div_deletePopup_btn_close_onclick` (xfdl:1182~1189) — 팝업 입력 초기화 + visible=false | - (클라이언트 전용) | xfdl:284 / 1182 |
| B-018 | div_deletePopup | 확인 | `btn_save` (in div_deletePopup, xfdl:285) | `div_deletePopup_btn_save_onclick` (xfdl:1163~1180) — rowposition deleteRow + END_ACTIVE_DATE/INF_REQ_NO/DESCRIPTION setColumn 후 div_detail 으로 복사 → `fn_run("deleteCmUser")` + 팝업 닫기 | deleteCmUser | xfdl:285 / 1163 |

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — 본 화면 grd_main / grd_userRolegrp / grd_rolegrpList 의 Grid Cell 정의에 ButtonField / displaytype="button" 셀이 존재하지 않음 (xfdl:15~81 / 202~223 / 231~252 전수 검토).

### §4.3 공통 topMenu 버튼 (외부 인입 — FX-001)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:264) | `fn_formBeforeOnload` (xfdl:443) → `fn_commonTop_onload(this, new Array(["btn_register","fn_register","계정생성"],["btn_delete","fn_delete","계정삭제"]), new Array(["btn_search"],["btn_modify"],["btn_close"]), false, "")` | 커스텀 2 (btn_register / btn_delete) + 기본 3 (btn_search / btn_modify / btn_close) | xfdl:452~457 |

### §4.4 onload / formBeforeOnload 메서드 흐름

| # | 메서드 (xfdl id) | 호출 시점 | 처리 내용 | 근거 |
|---|---|---|---|---|
| L-001 | `fn_onload(obj, e)` | Form onload (xfdl:3 `onload="fn_onload"`) | (1) `div_dept_cd.commonDynamic_onload(...)` — 부서 팝업 초기화 (xfdl:421~435) (2) `div_dept_cd.fn_setcommonIdEssential()` (xfdl:437) (3) `gfn_formOnLoad(obj, true)` → 내부적으로 fn_formBeforeOnload 호출 추정 (4) `gfn_gridSelectedRow(grd_main, "red", "blue", "")` (xfdl:440) | xfdl:416~441 |
| L-002 | `fn_formBeforeOnload()` | gfn_formOnLoad 내부 (추정) | (1) gv_AppWorkFrameSet 으로부터 fv_menuSn 획득 (2) FX-001 commonTopButton 등록 (3) FX-002 commonLeftButton 등록 (chk_check/btn_sum/btn_copyPaste) (4) FX-003 commonRightButton 등록 (btn_rowAdd/btn_rowCancel) (5) FX-004 commonRightButton (btn_rolDel/btn_rolSave) (6) FX-005 commonRightButton (btn_rolAdd/btn_rolSearch) (7) `edt_USER_ID.setFocus()` (8) `gfn_setEnable(div_mainDetail, "false")` — Detail 비활성화 (9) gds_btn_list 에서 PERMISSION_CUSTOM 조회 — `sBtnId=="user"` 일 때 div_rightRole / div_rightRoleList / div_rightMenu / btn_RoleCopy / btn_PwdReset / btn_SSOPwdReset 모두 visible=false | xfdl:443~530 |

### §4.5 fn_beforeRun (xfdl:536~550)

| sSvcId | 처리 |
|---|---|
| `searchCmUser` | ds_main.clearData() + ds_main.filter("") + ds_userRolegrp.clearData() + ds_rolegrpList.clearData() |
| `saveCmUser` | (빈 분기 — 검증 없음) |

### §4.6 fn_run sUrl/sInDs/sOutDs/sArgs 매핑 (xfdl:553~651)

| sSvcId | sUrl | sInDs | sOutDs | sArgs | callback | 근거 |
|---|---|---|---|---|---|---|
| `searchCmUser` | `csa::CommUserMng` | "" | `ds_main=ds_main ds_mainAll=ds_mainAll` | `gfn_scanOpenerComponent(div_search.form)` | fn_callBack | xfdl:566~573 |
| `saveCmUser` / `regCmUser` / `deleteCmUser` | `csa::CommUserMng` | `ds_main=ds_main:U` | (없음) | `USER_ID=ds_main.rowposition.USER_ID` (+ ds_main 각 행에 START/END_ACTIVE_DATE 8자리로 잘라내기 + INF_REQ_NO/DESCRIPTION 복사) | fn_callBack | xfdl:576~597 |
| `reRegCmUser` | `csa::CommUserMng` | `ds_main=ds_main:U` | (없음) | `INF_REQ_NO + DESCRIPTION` | fn_callBack | xfdl:599~603 |
| `searchUserRoleGrp` | `csa::CommUserMng` | "" | `ds_userRolegrp=ds_userRolegrp` | `USER_ID=ds_main.rowposition.USER_ID` | fn_callBack | xfdl:605~609 |
| `saveUserRoleGrp` | `csa::CommUserMng` | `ds_userRolegrp=ds_userRolegrp:U` | (없음) | `INF_REQ_NO + DESCRIPTION` | fn_callBack | xfdl:611~615 |
| `searchRoleGrp` | `csa::CommUserMng` | "" | `ds_rolegrpList=ds_rolegrpList` | `USER_ID=ds_main.rowposition.USER_ID` | fn_callBack | xfdl:618~622 |
| `pwdinit` (SSO_RESET_FLAG="Y") | `csa::CommUserMng` | `ds_main=ds_main` | `ds_security=ds_security` | `USER_ID + USER_EMP_NO + SSO_RESET_FLAG="Y"` | fn_callBack | xfdl:625~633 |
| `pwdinit` (SSO_RESET_FLAG ≠ "Y") | — | — | — | — | (return false) — fn_pwInit() WebBrowser RSA pwChg.html 호출 | xfdl:634~637 / 654~680 |
| `saveUserRoleGrpCopy` | `csa::CommUserMng` | "" | "" | `USER_ID + USER_ID_COPY=edt_role_copy.value + INF_REQ_NO + DESCRIPTION` | fn_callBack | xfdl:640~648 |
| `pwdtmp` (별도) | `nexacro.getEnvironment().services["publicUrl"].url + "/security/password/pwdtmp"` | `ds_pwdtmp=ds_pwdtmp` | "" | "" | fn_callBack | xfdl:732~739 |
| `commonUserDept` | (FX-006 commonDynamic 내부 — sUrl 직접 미지정) | — | — | edt_DEPT_CD | fn_callBack (case `commonUserDept` 에서 ds_main.setColumn DEPT_CD 적재) | xfdl:824~826 |

### §4.7 fn_callBack 콜백 분기 (xfdl:745~828)

| sSvcId | nErrorCode == 0 처리 | nErrorCode != 0 처리 | 근거 |
|---|---|---|---|
| `searchCmUser` | `commonBottomStatus_msg("{ds_main}건 조회 되었습니다.")` + `ds_main.set_rowposition(-1)` + `roleSearch=true` + `gfn_setEnable(div_mainDetail, "true")` + `div_dept_cd.fn_set_value(null)` + `fn_set_nm(null)` | (분기 없음) | xfdl:748~760 |
| `saveCmUser` / `regCmUser` / `deleteCmUser` / `reRegCmUser` | `commonBottomStatus_msg("{cnt_save}건 저장 되었습니다.")` + confirm "성공적으로 저장되었습니다." → `fn_run("searchCmUser")` 재조회 | `commonBottomStatus_msg(strErrorMsg)` + `gfn_message("저장 실패 하였습니다.", "error")` | xfdl:762~779 |
| `searchUserRoleGrp` | `commonBottomStatus_msg("{ds_userRolegrp}건 조회 되었습니다.")` + `fn_run("searchRoleGrp")` 후속 호출 | (분기 없음) | xfdl:781~784 |
| `saveUserRoleGrp` | `commonBottomStatus_msg("역활 {cnt_save}건 저장 되었습니다.")` + `gfn_message("성공적으로 저장되었습니다.", "info")` | `commonBottomStatus_msg(strErrorMsg)` + `gfn_message("저장 실패 하였습니다.", "error")` (오타: `div_buttom`, xfdl:794) | xfdl:786~797 |
| `pwdinit` | `commonBottomStatus_msg("비밀번호가 초기화 되었습니다")` | (분기 없음) | xfdl:799~801 |
| `pwdtmp` | `commonBottomStatus_msg("비밀번호가 초기화 되었습니다. 임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다.")` + `ds_pwdtmp.clearData()` | `gfn_message("비밀번호 초기화에 실패 하였습니다.", "error")` | xfdl:802~809 |
| `saveUserRoleGrpCopy` | `commonBottomStatus_msg("역활그룹이 저장 되었습니다.")` + `gfn_message("성공적으로 저장되었습니다.", "info")` | `commonBottomStatus_msg(strErrorMsg)` + `gfn_message("저장 실패 하였습니다.", "error")` | xfdl:810~822 |
| `commonUserDept` | `ds_main.setColumn(rowposition, "DEPT_CD", nErrorCode.DEPT_CD)` (As-Is 코드 — nErrorCode 객체에 DEPT_CD 프로퍼티 전달되는 비표준 형태) | (분기 없음) | xfdl:824~826 |

### §4.8 ds_main_onrowposchanged (xfdl:1199~1250)

| 조건 | 처리 |
|---|---|
| rowposition > -1 && getRowCount() != 0 && e.reason != 52 && roleSearch == true | `fn_run("searchUserRoleGrp")` |
| USER_ID 값 존재 | `edt_user_id.set_readonly(true)` |
| USER_ID 값 미존재 (신규 행) | `edt_user_id.set_readonly(false)` |
| USE_TP == "Y" | `btn_reRegister.set_enable(false)` |
| USE_TP != "Y" | `btn_reRegister.set_enable(true)` |
| (마지막) | `div_dept_cd.fn_set_value(DEPT_CD)` + `fn_set_nm(DEPT_NM)` 호출 |

### §4.9 패스워드 변경 WebBrowser 흐름 (xfdl:654~740)

| # | 메서드 | 처리 |
|---|---|---|
| L-021 | `fn_pwInit()` (xfdl:654~680) | edt_email null 검증 → "사용자 이메일 저장 후 진행해주세요." 후 return. WebBrowser `wb_pwdChg` 동적 생성 + onloadcompleted / onusernotify 이벤트 등록 + show + `set_url(baseUrl + "/_uiEXt_/rsa/pwChg.html")` |
| L-022 | `wb_pwdChg_init_onloadcompleted(obj, e)` (xfdl:684~694) | obj.callMethod("fn_setValue", edt_user_id.value, ".", ".", ".", gv_publicKeyModulus, gv_publicKeyExponent) — RSA 공개키 전달 |
| L-023 | `wb_pwdChg_init_onusernotify(obj, e)` (xfdl:697~740) | document.all.sendUserId / sendOldPassword / sendNewPassword / sendConfirmPassword 수집 → ds_pwdtmp.addRow + setColumn → transaction `pwdtmp` (publicUrl + "/security/password/pwdtmp") |

---

## §5. 검증 룰

### §5.1 fn_modify (B-004 / saveCmUser) 검증 (xfdl:892~993)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-001 | ds_main.rowcount 내 ROWTYPE_UPDATE 존재 검증 | "변경된 데이터가 없습니다." (error) | xfdl:903~913 |
| V-002 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP EMAIL")` 필수 검증 | (공통 메시지) | xfdl:916~918 |
| V-003 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4 — neue/수정 행만) | "사용자ID 중복 되었습니다." (error) | xfdl:921~927 |
| V-004 | ds_mainAll 전체 사용자 내 USER_ID 중복 (& 원본값과 다른 경우만) | "사용자ID 중복 되었습니다." (error) | xfdl:928~934 |
| V-005 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | "사번이 중복 되었습니다." (error) | xfdl:940~944 |
| V-006 | ds_mainAll 전체 사용자 내 USER_EMP_NO 중복 (& 원본값 비교) | "사번이 중복 되었습니다." (error) | xfdl:945~951 |
| V-007 | confirm "수정하시겠습니까?" → 확인 시 `fn_run("saveCmUser")` | (confirm 메시지) | xfdl:986~992 |

> xfdl:956~984 의 `for ( var i=0,cnt=this.ds_main.getRowCount(); i<cnt; i++ )` 블록은 As-Is 전체 주석 (`// 플랜트코드입력` 등) — As-Is 보존, 동작 ✗.

### §5.2 fn_register (B-001 / regCmUser) 검증 (xfdl:996~1071)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-101 | ds_main.rowcount 내 ROWTYPE_INSERT 존재 검증 | "추가된 데이터가 없습니다." (error) | xfdl:998~1008 |
| V-102 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP START_ACTIVE_DATE EMAIL")` 필수 검증 | (공통 메시지) | xfdl:1010~1013 |
| V-103 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4) | "사용자ID 중복 되었습니다." (error) | xfdl:1015~1030 |
| V-104 | ds_mainAll 전체 USER_ID 중복 (& 원본 비교) | "사용자ID 중복 되었습니다." (error) | xfdl:1023~1028 |
| V-105 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | "사번이 중복 되었습니다." (error) | xfdl:1033~1037 |
| V-106 | ds_mainAll 전체 USER_EMP_NO 중복 (& 원본 비교) | "사번이 중복 되었습니다." (error) | xfdl:1040~1045 |
| V-107 | edt_infReqNo / edt_description 입력 여부 확인 → infReqNoFlag false 인 경우 confirm 메시지 분기 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n계정생성 선처리 하시겠습니까?" (confirm) | xfdl:1051~1066 |
| V-108 | infReqNoFlag == true 인 경우 confirm "계정을 생성 하시겠습니까?" | (confirm) → `fn_run("regCmUser")` | xfdl:1064~1066 |

### §5.3 fn_delete (B-002 / deleteCmUser 전 모달) 검증 (xfdl:1073~1160)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-201 | ds_main.rowposition < 0 차단 | "사용자 선택 후 삭제처리 해주세요." (error) | xfdl:1095~1098 |
| V-202 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP END_ACTIVE_DATE")` 필수 검증 | (공통 메시지) | xfdl:1100~1103 |
| V-203 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4) | "사용자ID 중복 되었습니다." (error) | xfdl:1106~1120 |
| V-204 | ds_mainAll 전체 USER_ID 중복 (& 원본 비교) | (동일) | xfdl:1113~1118 |
| V-205 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | "사번이 중복 되었습니다." (error) | xfdl:1123~1127 |
| V-206 | ds_mainAll 전체 USER_EMP_NO 중복 (& 원본 비교) | (동일) | xfdl:1130~1135 |
| V-207 | div_deletePopup 표시 — sts_message="{USER_ID} 계정을 삭제하시겠습니까?" + cal_end_active_date=today + edt_infReqNo/edt_description 복사 | (모달 표시) | xfdl:1153~1159 |

> xfdl:1076~1093 / 1139~1152 의 As-Is "ROWTYPE_DELETE 존재 검증" 및 confirm 메시지 분기는 전체 주석 처리됨 (실제 동작 없음 — 모달 방식으로 대체).

### §5.4 fn_reRegister (B-016 / reRegCmUser) 검증 (xfdl:1433~1498)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-301 | rowposition < 0 차단 | "선택 후 재생성 해주세요." (warning) | xfdl:1435~1440 |
| V-302 | USER_EMP_NO null 차단 | "사번 저장 후 재생성 해주세요." (warning) | xfdl:1444~1447 |
| V-303 | USER_NM null 차단 | "사용자명 저장 후 재생성 해주세요." (warning) | xfdl:1449~1452 |
| V-304 | IN_OUT_EMP_TP null 차단 | "내부 외부 구분 저장 후 재생성 해주세요." (warning) | xfdl:1454~1457 |
| V-305 | EMAIL null 차단 | "이메일 저장 후 재생성 해주세요." (warning) | xfdl:1459~1462 |
| V-306 | ds_main.set_updatecontrol(false) → rowposition 만 ROWTYPE_UPDATE / 나머지 ROWTYPE_NORMAL 로 재설정 → set_updatecontrol(true) | (자동) | xfdl:1466~1474 |
| V-307 | edt_infReqNo / edt_description 입력 여부 확인 → infReqNoFlag false 인 경우 confirm "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n [{USER_ID}] 계정 재생성 선처리 하시겠습니까?" | (confirm) → `fn_run("reRegCmUser")` | xfdl:1478~1497 |
| V-308 | infReqNoFlag == true 인 경우 confirm "[{USER_ID}] 계정을 재생성 하시겠습니까?" | (confirm) → `fn_run("reRegCmUser")` | xfdl:1495~1497 |

### §5.5 fn_pwInit (B-013 비밀번호 초기화 / pwdtmp) 검증 (xfdl:654~680)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-401 | div_detail.edt_email.value null 차단 | "사용자 이메일 저장 후 진행해주세요." (error) | xfdl:655~659 |

### §5.6 btn_PwdReset_onclick / btn_SSOPwdReset_onclick / btn_RoleCopy_onclick (xfdl:1382 / 1405 / 1421) — confirm 메시지

| # | 처리 | 메시지 | 근거 |
|---|---|---|---|
| V-501 | rdo_PwdReset.value=="Y" 인 경우 confirm "비밀번호를 초기화 하시겠습니까?" → 확인 시 ssoReset=null + fn_run("pwdinit") (rdo 항상 N 복귀) | (confirm) | xfdl:1382~1396 |
| V-502 | rdo_SSOReset.value=="Y" 인 경우 confirm "전체 사용자의 SSO 비밀번호를 초기화 하시겠습니까?" → 확인 시 ssoReset="Y" + fn_run("pwdinit") (rdo 항상 N 복귀) | (confirm) | xfdl:1405~1419 |
| V-503 | btn_RoleCopy 클릭 → confirm "{edt_role_copy.value} 사용자의 역할그룹을 등록 하시겠습니까?" → 확인 시 fn_run("saveUserRoleGrpCopy") | (confirm) | xfdl:1421~1429 |

### §5.7 fn_rolAdd (B-011) — 역할추가 검증 (xfdl:1321~1374)

| # | 검증 | 메시지 | 근거 |
|---|---|---|---|
| V-601 | grd_rolegrpList.selectstartrow < 0 또는 selectendrow < 0 차단 | "선택된 Role 그룹이 없습니다." (warning "경고") | xfdl:1328~1330 |
| V-602 | (Ctrl 다중 선택) selectstartrow.length > 1 또는 selectendrow.length > 1 분기 → arryAll = removeDuplicates(concat).sort() → 각 row 의 ds_rolegrpList.USER_ID 컬럼 세트 + ds_userRolegrp.addRow + copyRow + reverse deleteRow | - | xfdl:1335~1351 |
| V-603 | (단일 선택) srow~erow 범위 for-loop → 동일 처리 | - | xfdl:1352~1369 |
| V-604 | 마지막 `ds_rolegrpList.deleteColumn("USER_ID")` + `ds_main.set_enableevent(true)` | - | xfdl:1371~1372 |

---

## §6. 연동 (SQL ID — Mapper.xml 전수)

> **갱신 2026-05-31 (정책 #3 (B) Q-003 / Q-009 해소)**: 미사용 SQL 5종 (`selectCommUserForSave` / `deleteCommUser` / `deleteCommUserMapping` / `deleteCommUserPwd` / `updateCommonPwdInit`) 은 As-Is 인용 행을 보존하면서 To-Be 제거 결정 명시. SaveCommUserMng.java 의 inserted / deleted 주석 코드는 신규 미반영. **(EAI 폐기 — 정책 #2)**: `selectCommUser` 의 DEPT_NM scalar subquery + `selectCommDept` (#18) 의 `EAIUSER.IF_DSHRMMCMHD02` 직접 참조는 To-Be DMES 신규 부서 마스터 `TB_MCM_DEPT_INFO` (schema=MCMAPUSER) JOIN/조회로 일괄 전환. **(스키마 — 정책 #1 / #3 (H))**: MSSQL 스키마 = `MCMAPUSER` + 테이블명 As-Is 대문자 `TB_MCM_SEC_*` 보존.

| # | SQL ID | type | parameterType | resultType | 호출 위치 | 본문 요약 / 비고 | To-Be 상태 | 근거 |
|---:|---|---|---|---|---|---|---|---|
| 1 | `selectCommUser` | select | Map | Map | BPMN Task_searchCmUser (xfdl:566 `searchCmUser`) | TB_MCM_SEC_USER 19 컬럼 + ~~`(SELECT CD_V_MEANING FROM EAIUSER.IF_DSHRMMCMHD02 WHERE CD_V = DEPT_CD) AS DEPT_NM`~~ → **To-Be: `LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = A.DEPT_CD` + `D.DEPT_NM`** (정책 #2). WHERE 동적: edt_USER_ID (UPPER LIKE USER_ID / USER_EMP_NO / USER_NM `||'%'`) / cbo_USE_TP / cbo_IN_OUT_EMP_TP. ORDER BY START_ACTIVE_DATE, USER_ID | 유지 (DEPT_NM 출처 전환) | xml:7~40 |
| 2 | `selectCommUserAll` | select | Map | Map | BPMN Task_0970821 (searchCmUser 후속, `ds_mainAll`) | TB_MCM_SEC_USER 의 USER_ID / USER_EMP_NO 만 | 유지 | xml:42~46 |
| ~~3~~ | ~~`selectCommUserForSave`~~ | ~~select~~ | ~~Map~~ | ~~Map~~ | ~~(Mapper 정의만 — As-Is BPMN/Java/xfdl grep 호출 ✗)~~ | ~~TB_MCM_SEC_USER 16 컬럼 WHERE USER_ID = #{USER_ID}~~ | **폐기 (정책 #3 (B) — Q-003 해소)** — As-Is 호출 0 hit | xml:48~67 |
| 4 | `insertCommUser` | insert | Map | - | RegCommUserMng.java:55 (`dao.insert("CommUserMngMapper.insertCommUser", setMap)`) | TB_MCM_SEC_USER 16 컬럼 INSERT + ~~`<include refid="ref_Audit.insert_item/value">`~~ → **To-Be: JPA Entity `SecUser extends McmAuditEntity`, @PrePersist 자동 9 컬럼** (정책 #1 / T-009) | 유지 | xml:69~108 |
| 5 | `updateCommUser` | update | Map | - | SaveCommUserMng.java:65 (`dao.update("CommUserMngMapper.updateCommUser", setMap)`) | TB_MCM_SEC_USER 12 컬럼 UPDATE (USER_ID 제외 — PK 보존, USE_TP 제외 — re-register 만 갱신 / USER_CATEGORY_CD 갱신) + `ref_Audit.update` (T-009 폐기) + WHERE USER_ID = #{USER_ID} | 유지 | xml:110~128 |
| 6 | `deleteCmUser` | update (논리삭제) | Map | - | DeleteCommUserMng.java:50 (`dao.update("CommUserMngMapper.deleteCmUser", setMap)`) | TB_MCM_SEC_USER SET END_ACTIVE_DATE = #{END_ACTIVE_DATE} WHERE USER_ID = #{pUserId} | 유지 | xml:130~134 |
| ~~7~~ | ~~`deleteCommUser`~~ | ~~delete (물리삭제)~~ | ~~Map~~ | ~~-~~ | ~~(Mapper 정의만 — SaveCommUserMng.java:76 주석)~~ | ~~DELETE FROM TB_MCM_SEC_USER WHERE USER_ID = #{USER_ID}~~ | **폐기 (정책 #3 (B) — Q-003 / Q-009 해소)** — As-Is Java 주석 (`F-005`) | xml:136~140 |
| ~~8~~ | ~~`deleteCommUserMapping`~~ | ~~delete~~ | ~~Map~~ | ~~-~~ | ~~(Mapper 정의만 — SaveCommUserMng.java:78 주석)~~ | ~~DELETE FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{USER_ID}~~ | **폐기 (정책 #3 (B))** — As-Is Java 주석 | xml:142~145 |
| ~~9~~ | ~~`deleteCommUserPwd`~~ | ~~delete~~ | ~~Map~~ | ~~-~~ | ~~(Mapper 정의만 — SaveCommUserMng.java:80 주석)~~ | ~~DELETE FROM TB_MCM_SEC_USER_PWD WHERE USER_ID = #{USER_ID}~~ | **폐기 (정책 #3 (B))** — As-Is Java 주석 | xml:147~150 |
| 10 | `selectCommUserRoleGrp` | select | Map | Map | BPMN Task_searchUserRoleGrp (searchUserRoleGrp) | TB_MCM_SEC_USER_MAPPING A JOIN TB_MCM_SEC_ROLEGROUP B ON A.ROLE_GROUP_ID=B.ROLE_GROUP_ID WHERE A.USER_ID = #{USER_ID} | 유지 | xml:152~161 |
| 11 | `insertCommUserRoleGrp` | insert | Map | - | BPMN Task_saveUserRoleGrp (CommonMultiSaveTask insertSqlKey) | TB_MCM_SEC_USER_MAPPING INSERT (USER_ID, ROLE_GROUP_ID) + ref_Audit (T-009 폐기) | 유지 | xml:163~174 |
| 12 | `deleteCommUserRoleGrp` | delete | Map | - | BPMN Task_saveUserRoleGrp (CommonMultiSaveTask deleteSqlKey) | DELETE FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID = #{USER_ID} AND ROLE_GROUP_ID = #{ROLE_GROUP_ID} | 유지 | xml:176~180 |
| 13 | `selectCommRoleGrpList` | select | Map | Map | BPMN Task_searchRoleGrp (searchRoleGrp) | TB_MCM_SEC_ROLEGROUP WHERE USE_TP='Y' AND SYSDATE BETWEEN START_ACTIVE_DATE AND NVL(END_ACTIVE_DATE, SYSDATE+100) AND NOT EXISTS (선택 사용자 보유 역할 제외) | 유지 | xml:182~194 |
| ~~14~~ | ~~`updateCommonPwdInit`~~ | ~~update~~ | ~~Map~~ | ~~-~~ | ~~(Mapper 정의만 — PasswordInit.java:51 주석)~~ | ~~TB_MCM_SEC_USER_PWD SET USER_ENC_PWD = #{USER_ENC_PWD} + ref_Audit WHERE USER_ID = #{USER_ID}~~ | **폐기 (정책 #3 (B))** — As-Is Java 주석 (mergeCommonPwdInit 대체) | xml:196~201 |
| 15 | `mergeCommonPwdInit` | insert (MERGE) | Map | - | PasswordInit.java:52 + RegCommUserMng.java:57 + ReRegCommUserMng.java:65 | MERGE INTO MCMAPUSER.TB_MCM_SEC_USER_PWD USING DUAL ON USER_ID — MATCHED UPDATE (USER_ENC_PWD/USER_SSO_PWD) / NOT MATCHED INSERT | 유지 (정책 #1 schema=MCMAPUSER) | xml:203~225 |
| 16 | `mergeCommonCopyRoleGrp` | insert (MERGE) | Map | - | BPMN Task_0v3mxy0 (saveUserRoleGrpCopy 후속) | MERGE INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING USING (SELECT USER_ID, ROLE_GROUP_ID FROM ... WHERE USER_ID = #{USER_ID_COPY}) B — NOT MATCHED INSERT (USER_ID, B.ROLE_GROUP_ID) | 유지 (schema=MCMAPUSER) | xml:227~242 |
| 17 | `updateCommonSSOPwdInit` | update | Map | - | PasswordInit.java:42 (SSO 분기 전체 사용자) | TB_MCM_SEC_USER_PWD SET USER_SSO_PWD = #{USER_SSO_PWD} + ref_Audit WHERE USER_ID = #{USER_ID} | 유지 | xml:244~249 |
| 18 | `selectCommDept` | select | Map | Map | BPMN Task_1tti6qu (commonUserDept — FX-006) | ~~`EAIUSER.IF_DSHRMMCMHD02` SELECT CD_V AS DEPT_CD, CD_V_MEANING AS DEPT_NM. WHERE 동적: edt_DEPT_CD LIKE '%val%' OR UPPER(CD_V_MEANING) LIKE UPPER('%val%')~~ → **To-Be: `SELECT DEPT_CD, DEPT_NM FROM MCMAPUSER.TB_MCM_DEPT_INFO WHERE USE_TP='Y' AND (DEPT_CD LIKE '%val%' OR UPPER(DEPT_NM) LIKE UPPER('%val%'))` (정책 #2 DMES 신규 부서 마스터)** | 출처 전환 (TB_MCM_DEPT_INFO) | xml:251~263 |
| 19 | `selectRoleMergeObject` | select | Map | Map | SaveRoleGroupCopyHis.java:45 (Java task 내부) | TB_MCM_SEC_USER_MAPPING A WHERE USER_ID = #{pUserIdCopy} AND ROLE_GROUP_ID NOT IN (USER_ID 보유) + scalar subquery ROLE_GROUP_NM | 유지 | xml:265~276 |
| 20 | `updateReRegUser` | update | Map | - | ReRegCommUserMng.java:58 | TB_MCM_SEC_USER SET START_ACTIVE_DATE = TO_DATE(#{START_ACTIVE_DATE},'YYYYMMDD'), END_ACTIVE_DATE = TO_DATE(#{END_ACTIVE_DATE},'YYYYMMDD'), USE_TP = #{USE_TP} + ref_Audit WHERE USER_ID = #{USER_ID} | 유지 | xml:278~285 |

> SQL ID 합계 = **20** (As-Is 본문 정의 그대로). **To-Be 활성 = 14 + 폐기 = 5** (정책 #3 (B) 결정 — 미사용 SQL 5종). 폐기 행은 ~~취소선~~ 처리 + As-Is 인용은 보존 (사용자 요구사항 §1: As-Is 1:1 보존).
> **외부 namespace SQL (X-1 / X-2) 흡수 결정 (정책 #3 (C))**: `TB_MCM_SEC_USER_HIS_Mapper.insert` / `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 는 To-Be 별도 Mapper.xml 신규 작성 없이 **JPA Entity `SecUserHis` / `SecUserRollHis` + Repository.saveAll() 흡수** (정책 #6 (A) Entity 직역 명명 / 정책 #1 위치 `mcm.entity.*`). §6.1 매트릭스 참조.

### §6.1 외부 namespace SQL 호출 (CommUserMngMapper 외) — 정책 #3 (C) Q-004 해소

> **갱신 2026-05-31**: As-Is 외부 namespace 2종 Mapper SQL → To-Be JPA Entity + Repository.saveAll() 흡수 결정 (정책 #3 (C)). 별도 Mapper.xml 신규 작성 ✗. Entity 명명 (정책 #6 (A) As-Is 직역) = `SecUserHis` / `SecUserRollHis`. 위치 = `com.dongkuk.dmes.mcm.entity.*` (정책 #1).

| # | SQL ID (As-Is) | type | 호출 위치 | As-Is 적재 컬럼 | To-Be Entity / 흡수 방식 |
|---|---|---|---|---|---|
| X-1 | `TB_MCM_SEC_USER_HIS_Mapper.insert` | insert | DeleteCommUserMng.java:64 / RegCommUserMng.java:70 / ReRegCommUserMng.java:78 | USER_ID / ACTIVE_DT / PROC_TYPE (C/D) / PROC_CASE (M) / USER_NM / INF_REQ_NO / DESCRIPTION | **JPA Entity `mcm.entity.SecUserHis extends McmAuditEntity` + Repository `SecUserHisRepository.save(...)` 흡수**. 호출 위치 = `mcm.csa.commUserMng.service.CommUserMngService` 내부 (Service 단일 트랜잭션). 별도 Mapper.xml 신규 ✗. |
| X-2 | `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` | insert (merge) | SaveRoleGroupHis.java:53/67 / SaveRoleGroupCopyHis.java:60 | OP_SUMUP_DT / WORKS_CODE (P) / USER_ID / ROLE_GROUP_ID / RESP_GBN (A/D) / ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION | **JPA Entity `mcm.entity.SecUserRollHis extends McmAuditEntity` + Repository `SecUserRollHisRepository.saveAll(...)`. mergePK 의미: 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) 가 동일 시 upsert — JPA `save()` 가 동일 동작 (existsById → update / 아니면 insert)**. |

---

## §7. 부수효과 (Java UserTask 분석)

### §7.1 SaveCommUserMng.java (saveCmUser → updateCommUser)

| # | 라인 | 처리 |
|---|---|---|
| 7.1-1 | java:33 | `ds_main = context.get("ds_main")` 으로 ds_main 획득 |
| 7.1-2 | java:38~85 | for-loop (i, ds_main.size()) |
| 7.1-3 | java:42~57 | **As-Is 주석** — status="inserted" 분기 (insertCommUser + mergeCommonPwdInit) — Reg 별도 클래스로 분리되어 비활성. **To-Be 미반영 (정책 #3 (B) / Q-009 해소) — RegCommUserMng 가 별도 흡수** |
| 7.1-4 | java:58~67 | status="updated" 분기 — setMap 에 ds_main 전체 key/value 복사 + `dao.update("CommUserMngMapper.updateCommUser", setMap)` |
| 7.1-5 | java:68~83 | **As-Is 주석** — status="deleted" 분기 (deleteCommUser + deleteCommUserMapping + deleteCommUserPwd) — Delete 별도 클래스로 분리되어 비활성. **To-Be 미반영 (정책 #3 (B) / Q-009 해소) — DeleteCommUserMng 가 별도 흡수** |
| 7.1-6 | java:84 | cnt++ |
| 7.1-7 | java:87 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` |

### §7.2 RegCommUserMng.java (regCmUser → insertCommUser + mergeCommonPwdInit + 이력)

| # | 라인 | 처리 |
|---|---|---|
| 7.2-1 | java:33 | ds_main 획득 |
| 7.2-2 | java:39~74 | for-loop |
| 7.2-3 | java:43~73 | status="inserted" 분기 |
| 7.2-4 | java:44~49 | setMap 에 ds_main 전체 key/value 복사 |
| 7.2-5 | java:50 | setMap.put(USER_ENC_PWD, bcrypt(DEFAULT_PASSWORD)) |
| 7.2-6 | java:51 | setMap.put(USER_SSO_PWD, bcrypt(USER_ID + USER_EMP_NO)) |
| 7.2-7 | java:52 | setMap.put("USE_TP", "Y") — 계정생성 시 Default Y 강제 |
| 7.2-8 | java:55 | `dao.insert("CommUserMngMapper.insertCommUser", setMap)` |
| 7.2-9 | java:57 | `dao.update("CommUserMngMapper.mergeCommonPwdInit", setMap)` (PWD MERGE) |
| 7.2-10 | java:60~71 | histMap (USER_ID, ACTIVE_DT=START_ACTIVE_DATE, PROC_TYPE="C", PROC_CASE="M", USER_NM, INF_REQ_NO, DESCRIPTION) → `TB_MCM_SEC_USER_HIS_Mapper.insert` |
| 7.2-11 | java:77 | cnt_save context 적재 |

### §7.3 DeleteCommUserMng.java (deleteCmUser → deleteCmUser + 이력)

| # | 라인 | 처리 |
|---|---|---|
| 7.3-1 | java:33 | ds_main 획득 |
| 7.3-2 | java:39~69 | for-loop |
| 7.3-3 | java:43~66 | status="deleted" 분기 |
| 7.3-4 | java:47~48 | setMap.put("END_ACTIVE_DATE", mainMap.END_ACTIVE_DATE) + setMap.put("pUserId", mainMap.USER_ID) |
| 7.3-5 | java:50 | `dao.update("CommUserMngMapper.deleteCmUser", setMap)` — 논리삭제 |
| 7.3-6 | java:55~64 | histMap (USER_ID, ACTIVE_DT=END_ACTIVE_DATE, PROC_TYPE="D", PROC_CASE="M", USER_NM, INF_REQ_NO, DESCRIPTION) → `TB_MCM_SEC_USER_HIS_Mapper.insert` |
| 7.3-7 | java:71 | cnt_save context 적재 |

### §7.4 ReRegCommUserMng.java (reRegCmUser → updateReRegUser + mergeCommonPwdInit + 이력)

| # | 라인 | 처리 |
|---|---|---|
| 7.4-1 | java:34 | ds_main 획득 |
| 7.4-2 | java:35 | mainMap = ds_main.get(0) — 단건 처리 |
| 7.4-3 | java:37~42 | infReqNo / description / userId / userNm / userEmpNo 추출 |
| 7.4-4 | java:48~54 | setMap: USE_TP="Y", START_ACTIVE_DATE=CommonUtil.getCurrentDate("yyyyMMdd"), END_ACTIVE_DATE="99991231", USER_ID, USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD), USER_SSO_PWD=bcrypt(userId+userEmpNo) |
| 7.4-5 | java:58 | `dao.update("CommUserMngMapper.updateReRegUser", setMap)` |
| 7.4-6 | java:59~62 | updateReRegUserCnt < 0 차단 → `throw new UserException("사용자 정보 업데이트에 실패했습니다.")` |
| 7.4-7 | java:65 | `dao.update("CommUserMngMapper.mergeCommonPwdInit", setMap)` |
| 7.4-8 | java:68~79 | histMap (PROC_TYPE="C", PROC_CASE="M") → `TB_MCM_SEC_USER_HIS_Mapper.insert` |
| 7.4-9 | java:82 | cnt_save = 1 context 적재 |

### §7.5 PasswordInit.java (pwdinit → mergeCommonPwdInit / updateCommonSSOPwdInit)

| # | 라인 | 처리 |
|---|---|---|
| 7.5-1 | java:31 | resetSSO = context.get("SSO_RESET_FLAG") |
| 7.5-2 | java:32~45 | resetSSO == "Y" 분기 (SSO 전체 초기화) — ds_main for-loop 모두에 대해 setMap.put(USER_ID, ...) + setMap.put(USER_SSO_PWD, bcrypt(userId+userEmpNo)) → `updateCommonSSOPwdInit` |
| 7.5-3 | java:47~53 | resetSSO ≠ "Y" 분기 (단건 PWD 초기화) — context 자체에 USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD) / USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) put → `mergeCommonPwdInit(context)` |

> 본 java:51 의 As-Is 주석 `//dao.update("CommUserMngMapper.updateCommonPwdInit", context);` 은 mergeCommonPwdInit 으로 변경된 잔존.

### §7.6 SaveRoleGroupHis.java (saveUserRoleGrp 직전 — userTask SaveRoleGroupHis)

| # | 라인 | 처리 |
|---|---|---|
| 7.6-1 | java:32 | userRoleGroupList = context.get("ds_userRolegrp") |
| 7.6-2 | java:37~72 | for-loop |
| 7.6-3 | java:43~55 | status="inserted" 분기 — mapInsert (OP_SUMUP_DT=today, WORKS_CODE="P", USER_ID, ROLE_GROUP_ID, RESP_GBN="A", ROLE_GROUP_NM, INF_REQ_NO, DESCRIPTION) → `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` |
| 7.6-4 | java:57~69 | status="deleted" 분기 — mapInsert (RESP_GBN="D") → 동일 mergePK |
| 7.6-5 | java:74 | cnt_save context 적재 |

### §7.7 SaveRoleGroupCopyHis.java (saveUserRoleGrpCopy 직전 — userTask SaveRoleGroupCopyHis)

| # | 라인 | 처리 |
|---|---|---|
| 7.7-1 | java:37~38 | sUserId / sUserIdCopy context 추출 |
| 7.7-2 | java:40~42 | mapSelect (pUserId, pUserIdCopy) |
| 7.7-3 | java:45 | `roleMergeObjectList = dao.selectList("CommUserMngMapper.selectRoleMergeObject", mapSelect)` |
| 7.7-4 | java:48~64 | for-loop — mapInsert (OP_SUMUP_DT=today, WORKS_CODE="P", USER_ID=sUserId, ROLE_GROUP_ID, RESP_GBN="A", ROLE_GROUP_NM, INF_REQ_NO, DESCRIPTION) → `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` |
| 7.7-5 | java:66 | cnt_save context 적재 |

---

## §8. BPMN action enum + flow 전수

### §8.1 BPMN process / 노드 / sequenceFlow

| 종류 | 수 | id 전수 |
|---|---:|---|
| startEvent | 1 | StartEvent_1 |
| endEvent | 1 | EndEvent_1 (incoming flow 11개) |
| exclusiveGateway | 1 | ExclusiveGateway_1 (incoming 1, outgoing 11) |
| task (CommonSelectTask 등) | 8 | Task_searchCmUser (selectCommUser), Task_0970821 (selectCommUserAll), Task_searchUserRoleGrp (selectCommUserRoleGrp), Task_searchRoleGrp (selectCommRoleGrpList), Task_saveUserRoleGrp (CommonMultiSaveTask insertCommUserRoleGrp/deleteCommUserRoleGrp), Task_0v3mxy0 (CommonInsertTask mergeCommonCopyRoleGrp), Task_1tti6qu (CommonSelectTask selectCommDept) |
| userTask (com.dongkuk.dmes.UserTask) | 7 | UserTask_1opm8fa (SaveCommUserMng), UserTask_pwdinit (PasswordInit), UserTask_128zs8e (ReRegCommUserMng), RegCommUserMng (RegCommUserMng), DeleteCommUserMng (DeleteCommUserMng), SaveRoleGroupHis (SaveRoleGroupHis), SaveRoleGroupCopyHis (SaveRoleGroupCopyHis) |
| sequenceFlow | 22 | (§8.2 매트릭스 참조) |

> 합계 노드 = 18. 합계 sequenceFlow = 22.

### §8.2 sequenceFlow 매트릭스 전수 (id / name / sourceRef → targetRef)

| # | id | name (분기 라벨) | sourceRef | targetRef | 근거 |
|---:|---|---|---|---|---|
| 1 | SequenceFlow_1 | (없음) | StartEvent_1 | ExclusiveGateway_1 | bpmn:37 |
| 2 | SequenceFlow_0grwghu | saveCmUser | ExclusiveGateway_1 | UserTask_1opm8fa | bpmn:38 |
| 3 | SequenceFlow_0tt1mbk | searchCmUser | ExclusiveGateway_1 | Task_searchCmUser | bpmn:53 |
| 4 | SequenceFlow_0bb4b1a | searchUserRoleGrp | ExclusiveGateway_1 | Task_searchUserRoleGrp | bpmn:68 |
| 5 | SequenceFlow_0e90wtm | (없음) | Task_searchUserRoleGrp | EndEvent_1 | bpmn:69 |
| 6 | SequenceFlow_saveUserRoleGrp | saveUserRoleGrp | ExclusiveGateway_1 | SaveRoleGroupHis | bpmn:101 |
| 7 | SequenceFlow_searchRoleGrp | searchRoleGrp | ExclusiveGateway_1 | Task_searchRoleGrp | bpmn:102 |
| 8 | SequenceFlow_07entyn | (없음) | Task_searchRoleGrp | EndEvent_1 | bpmn:103 |
| 9 | SequenceFlow_0eh8isc | pwdinit | ExclusiveGateway_1 | UserTask_pwdinit | bpmn:104 |
| 10 | SequenceFlow_0v64ch1 | (없음) | UserTask_pwdinit | EndEvent_1 | bpmn:115 |
| 11 | SequenceFlow_19ojhvj | (없음) | UserTask_1opm8fa | EndEvent_1 | bpmn:126 |
| 12 | SequenceFlow_105vwsz | (없음) | Task_searchCmUser | Task_0970821 | bpmn:141 |
| 13 | SequenceFlow_0alv1bb | (없음) | Task_0970821 | EndEvent_1 | bpmn:142 |
| 14 | SequenceFlow_1gwazq0 | saveUserRoleGrpCopy | ExclusiveGateway_1 | SaveRoleGroupCopyHis | bpmn:158 |
| 15 | SequenceFlow_0ugd21v | commonUserDept | ExclusiveGateway_1 | Task_1tti6qu | bpmn:174 |
| 16 | SequenceFlow_0ssupae | (없음) | Task_1tti6qu | EndEvent_1 | bpmn:175 |
| 17 | SequenceFlow_1944t12 | regCmUser | ExclusiveGateway_1 | RegCommUserMng | bpmn:196 |
| 18 | SequenceFlow_0hchiuv | deleteCmUser | ExclusiveGateway_1 | DeleteCommUserMng | bpmn:197 |
| 19 | SequenceFlow_1766mr8 | (없음) | RegCommUserMng | EndEvent_1 | bpmn:198 |
| 20 | SequenceFlow_0g8pzip | (없음) | DeleteCommUserMng | EndEvent_1 | bpmn:199 |
| 21 | SequenceFlow_05p4q2h | (없음) | SaveRoleGroupHis | Task_saveUserRoleGrp | bpmn:210 |
| 22 | SequenceFlow_1c1ioow | (없음) | Task_saveUserRoleGrp | EndEvent_1 | bpmn:211 |
| 23 | SequenceFlow_01hi7kv | (없음) | SaveRoleGroupCopyHis | Task_0v3mxy0 | bpmn:222 |
| 24 | SequenceFlow_15dc55q | (없음) | Task_0v3mxy0 | EndEvent_1 | bpmn:223 |
| 25 | SequenceFlow_07aq563 | reRegCmUser | ExclusiveGateway_1 | UserTask_128zs8e | bpmn:234 |
| 26 | SequenceFlow_0l2kcue | (없음) | UserTask_128zs8e | EndEvent_1 | bpmn:235 |

> sequenceFlow 합계 = **26** (xml 본문 grep). xfdl Gateway outgoing 11개 + 후속 chain 14개 + StartEvent 1개. ExclusiveGateway_1 의 outgoing 선언 (bpmn:25~35) 은 11 개이며, 이는 11 액션 분기 (saveCmUser / searchCmUser / searchUserRoleGrp / saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept / regCmUser / deleteCmUser / reRegCmUser) 와 1:1 대응.

### §8.3 action ↔ BPMN flow 매핑

| To-Be action | xfdl trigger | BPMN sequenceFlow (gateway 분기) | BPMN chain (sourceRef→…→EndEvent) | Mapper SQL (호출 순서) | Java UserTask |
|---|---|---|---|---|---|
| searchCmUser | `fn_search` (xfdl:846) | SequenceFlow_0tt1mbk | Task_searchCmUser → SequenceFlow_105vwsz → Task_0970821 → SequenceFlow_0alv1bb → EndEvent_1 | (1) selectCommUser → (2) selectCommUserAll | - |
| saveCmUser | `fn_modify` (xfdl:892) | SequenceFlow_0grwghu | UserTask_1opm8fa (SaveCommUserMng.java) → SequenceFlow_19ojhvj → EndEvent_1 | (UserTask) → for-loop status="updated" → updateCommUser | SaveCommUserMng.java |
| regCmUser | `fn_register` (xfdl:996) | SequenceFlow_1944t12 | RegCommUserMng (RegCommUserMng.java) → SequenceFlow_1766mr8 → EndEvent_1 | (UserTask) → for-loop status="inserted" → insertCommUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS_Mapper.insert | RegCommUserMng.java |
| deleteCmUser | `div_deletePopup_btn_save_onclick` (xfdl:1163) | SequenceFlow_0hchiuv | DeleteCommUserMng (DeleteCommUserMng.java) → SequenceFlow_0g8pzip → EndEvent_1 | (UserTask) → for-loop status="deleted" → deleteCmUser + TB_MCM_SEC_USER_HIS_Mapper.insert | DeleteCommUserMng.java |
| reRegCmUser | `btn_reRegister_onclick` (xfdl:1433) | SequenceFlow_07aq563 | UserTask_128zs8e (ReRegCommUserMng.java) → SequenceFlow_0l2kcue → EndEvent_1 | (UserTask) 단건 → updateReRegUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS_Mapper.insert | ReRegCommUserMng.java |
| searchUserRoleGrp | `ds_main_onrowposchanged` (xfdl:1199) | SequenceFlow_0bb4b1a | Task_searchUserRoleGrp → SequenceFlow_0e90wtm → EndEvent_1 | selectCommUserRoleGrp | - |
| saveUserRoleGrp | `fn_rolSave` (xfdl:1303) | SequenceFlow_saveUserRoleGrp | SaveRoleGroupHis (SaveRoleGroupHis.java) → SequenceFlow_05p4q2h → Task_saveUserRoleGrp (CommonMultiSaveTask) → SequenceFlow_1c1ioow → EndEvent_1 | (UserTask 이력) → TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK + (CommonMultiSaveTask) insertCommUserRoleGrp / deleteCommUserRoleGrp | SaveRoleGroupHis.java |
| searchRoleGrp | `fn_rolSearch` (xfdl:1315) + searchUserRoleGrp 후속 (xfdl:783) | SequenceFlow_searchRoleGrp | Task_searchRoleGrp → SequenceFlow_07entyn → EndEvent_1 | selectCommRoleGrpList | - |
| pwdinit | `btn_PwdReset` / `btn_SSOPwdReset` (xfdl:1382 / 1405) | SequenceFlow_0eh8isc | UserTask_pwdinit (PasswordInit.java) → SequenceFlow_0v64ch1 → EndEvent_1 | (UserTask) → SSO_RESET_FLAG=Y → ds_main for-loop updateCommonSSOPwdInit / 단건 mergeCommonPwdInit | PasswordInit.java |
| saveUserRoleGrpCopy | `btn_RoleCopy` (xfdl:1421) | SequenceFlow_1gwazq0 | SaveRoleGroupCopyHis (SaveRoleGroupCopyHis.java) → SequenceFlow_01hi7kv → Task_0v3mxy0 (CommonInsertTask) → SequenceFlow_15dc55q → EndEvent_1 | (UserTask 이력) → selectRoleMergeObject + TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK + (CommonInsertTask) mergeCommonCopyRoleGrp | SaveRoleGroupCopyHis.java |
| commonUserDept | `div_dept_cd.commonDynamic_onload` (xfdl:421) | SequenceFlow_0ugd21v | Task_1tti6qu → SequenceFlow_0ssupae → EndEvent_1 | selectCommDept | - |

> 사용자 입력 메타의 "BPMN action 6 enum" 은 가이드 템플릿 기본값(search/searchDetail/save/saveDetail/delete/deleteDetail) — 본 화면 As-Is 는 11 enum (사용자 관리 도메인 특성). To-Be enum 강제 ✗ — As-Is 11 enum 1:1 보존 (사용자 결정).

---

## §9. 코드값 / LoV (LV-NNN)

> **갱신 2026-05-31 (정책 #2 / #3 (D) / #3 (H))**: LV-005 부서 LoV 출처를 EAI `EAIUSER.IF_DSHRMMCMHD02` → To-Be DMES 신규 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 로 전환 (정책 #2). LV-006 (GROUP_ID1~3 빈 콤보) Q-005 해소 — As-Is 미설정 콤보 = **신규 UI 미반영** (To-Be FE 컴포넌트에서 D-013/D-014/D-015 콤보 제거 또는 TextBox 변경 — §11 변환점 T-025 참조). schema 정합 = `MCMAPUSER` 일괄 명시.

| ID | LoV 명 | 컬럼 | 정의 위치 | 값 | 사용 위치 | 근거 |
|---|---|---|---|---|---|---|
| LV-001 | ds_useTp | CD / NM | xfdl Objects (정적 hardcoded) | Y/Yes, N/No | S-002 (cbo_USE_TP) / G-010 (USE_TP 그리드 콤보) | xfdl:358~373 |
| LV-002 | ds_inOutEmpTp | CD / NM | xfdl Objects (정적 hardcoded) | I/내부, O/외부 | S-003 (cbo_IN_OUT_EMP_TP) / G-014 (IN_OUT_EMP_TP 그리드 콤보) / D-012 (edt_in_out_emp_tp) | xfdl:342~357 |
| LV-003 | rdo_PwdReset.innerdataset | codecolumn / datacolumn | xfdl Radio inner (정적) | Y/Yes, N/No (index=1=No 기본) | D-016 (비밀번호 초기화 라디오) | xfdl:144~159 |
| LV-004 | rdo_SSOReset.innerdataset | codecolumn / datacolumn | xfdl Radio inner (정적) | Y/Yes, N/No (index=1=No 기본) | D-018 (SSO 초기화 라디오) | xfdl:168~183 |
| LV-005 | ds_userDept (부서 LoV) — **To-Be DMES 부서 마스터 (정책 #2)** | DEPT_CD / DEPT_NM | FX-006 commonDynamic 동적 조회 (Mapper.xml selectCommDept) | ~~EAIUSER.IF_DSHRMMCMHD02 (CD_V → DEPT_CD, CD_V_MEANING → DEPT_NM)~~ → **To-Be: `MCMAPUSER.TB_MCM_DEPT_INFO` WHERE USE_TP='Y' (DEPT_CD, DEPT_NM 1:1)** | D-007 (div_dept_cd) — BPMN commonUserDept | xml:251~263 (As-Is) / §9.1.7 (To-Be 카탈로그) |
| ~~LV-006~~ | ~~(사용자 그룹1~3) 빈 콤보~~ | ~~condCd / condNm~~ | ~~xfdl Combo innerdataset (As-Is `innerdataset=""` 동적 미세팅)~~ | ~~(As-Is 미설정 — 빈 콤보)~~ | ~~D-013 / D-014 / D-015 (edt_group_id1~3)~~ | **신규 UI 미반영 (정책 #3 (D) — Q-005 해소)** — As-Is 빈 콤보는 실 운영 의미 ✗ → To-Be FE 에서 D-013/D-014/D-015 콤보 자체 제거. ds_main 컬럼 GROUP_ID1~3 은 TB_MCM_SEC_USER 카탈로그 (§9.1.1 #14~16) 에 보존만. | xfdl:130 / 138 / 139 |
| LV-007 | (역할 그룹 마스터) | ROLE_GROUP_ID / ROLE_GROUP_NM | Mapper selectCommRoleGrpList (검증 BETWEEN 활성 + 보유 제외) | TB_MCM_SEC_ROLEGROUP USE_TP='Y' | GL-001 / GL-002 (ds_rolegrpList) | xml:182~194 |
| LV-008 | (보유 역할 그룹) | ROLE_GROUP_ID / ROLE_GROUP_NM | Mapper selectCommUserRoleGrp (USER_ID JOIN) | TB_MCM_SEC_USER_MAPPING JOIN TB_MCM_SEC_ROLEGROUP | GR-001 / GR-002 (ds_userRolegrp) | xml:152~161 |

### §9.1 DMES 테이블 정의서 컬럼 카탈로그 (6 테이블 154 컬럼 전수 + To-Be 신규 부서 마스터 1 테이블 — Q-001 / Q-002 / Q-011 해소)

> **출처**: `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` 직접 시트 추출 (2026-05-30 작성, sheet rId94 / rId99 / rId102 / rId90 / rId98 / rId105). 시트명은 As-Is `SEC_*` (TB_MCM_ prefix 없음). To-Be 적용 = **`MCMAPUSER.TB_MCM_SEC_*`** (정책 #1 / #3 (H) — 스키마 = `MCMAPUSER` + 테이블명 As-Is 대문자 보존).
>
> **갱신 2026-05-31**: §9.1.7 신규 추가 — **`MCMAPUSER.TB_MCM_DEPT_INFO`** (정책 #2 — EAI 폐기 + DMES 자체 부서 마스터 신설 / Q-002 해소).
>
> 각 테이블의 항목 개수는 DMES 시트 R2 의 "항목개수" 필드 그대로 보존. **Mapper.xml / Java 본문이 사용하지 않는 audit 컬럼 (`CREATED_*` / `LAST_UPDATE*` / `DATA_END_*` / `ARCHIVE_*`) 도 1:1 전수 등재**. audit 컬럼은 To-Be **`McmAuditEntity`** 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 처리 (정책 #1 + T-009).

#### §9.1.1 SEC_USER (사용자정보) — TB_MCM_SEC_USER / 38 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 사용자ID | USER_ID | VARCHAR | 30 | PK | NOT NULL | - | D-001 입력 |
| 2 | 사번 | USER_EMP_NO | VARCHAR | 10 |  | NULL | - | D-002 입력 |
| 3 | SSO ID | SSO_ID | VARCHAR | 30 |  | NULL | - | D-003 입력 |
| 4 | 사용자명 | USER_NM | VARCHAR | 30 |  | NULL | - | D-004 입력 |
| 5 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | D-005 입력 (cal_start_active_date) |
| 6 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | D-006 입력 (cal_end_active_date) — 논리삭제 마감일 |
| 7 | 부서코드 | DEPT_CD | VARCHAR | 10 |  | NULL | - | D-007 입력 (div_dept_cd / commonDynamic) |
| 8 | 사용자분류코드 | USER_CATEGORY_CD | VARCHAR | 10 |  | NULL | - | D-008 입력 |
| 9 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | D-016 라디오 + LV-001 / G-010 |
| 10 | 이메일 | EMAIL | VARCHAR | 30 |  | NULL | - | D-009 입력 |
| 11 | 전화 번호 | TEL_NO | VARCHAR | 15 |  | NULL | - | D-010 입력 |
| 12 | 모바일 번호 | MOBILE_TEL_NO | VARCHAR | 15 |  | NULL | - | D-011 입력 |
| 13 | 내부 외부 구분 | IN_OUT_EMP_TP | VARCHAR | 1 |  | NOT NULL | - | D-012 입력 / LV-002 |
| 14 | 그룹 코드1 | GROUP_ID1 | VARCHAR | 50 |  | NULL | - | D-013 입력 / LV-006 (As-Is innerdataset="") |
| 15 | 그룹 코드2 | GROUP_ID2 | VARCHAR | 50 |  | NULL | - | D-014 입력 / LV-006 |
| 16 | 그룹 코드3 | GROUP_ID3 | VARCHAR | 50 |  | NULL | - | D-015 입력 / LV-006 |
| 17 | 테마 타입 | THEME_TP | VARCHAR | 20 |  | NULL | - | (As-Is UI 노출 ✗ — DB 보존만) |
| 18 | 메뉴상태 | MENU_TP | VARCHAR | 1 |  | NULL | 'M' | (DB Default 'M') — UI 노출 ✗ |
| 19 | 생성Object유형 | CREATED_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | audit — cactus-core 자동 처리 (T-009) |
| 20 | 생성ObjectID | CREATED_OBJECT_ID | VARCHAR | 50 |  | NULL | - | audit |
| 21 | 생성프로그램ID | CREATED_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 22 | 생성일시 | CREATION_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 23 | 최종변경Object유형 | LAST_UPDATED_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | audit |
| 24 | 최종변경ObjectID | LAST_UPDATED_OBJECT_ID | VARCHAR | 50 |  | NULL | - | audit |
| 25 | 최종변경프로그램ID | LAST_UPDATE_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 26 | 최종변경일자 | LAST_UPDATE_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 27 | 데이터종료여부 | DATA_END_STATUS | VARCHAR | 1 |  | NULL | - | audit (논리삭제 플래그) |
| 28 | 데이타종료Object유형 | DATA_END_OBJECT_TYPE | VARCHAR | 1 |  | NULL | - | audit |
| 29 | 데이타종료ObjectID | DATA_END_OBJECT_ID | VARCHAR | 50 |  | NULL | - | audit |
| 30 | 데이타종료프로그램ID | DATA_END_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 31 | 데이터종료일시 | DATA_END_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 32 | Archive완료여부 | ARCHIVE_COMPLETED_FLAG | VARCHAR | 1 |  | NULL | - | audit (Archive) |
| 33 | Archive작업자직번 | ARCHIVED_EMPLOYEE_NUM | VARCHAR | 50 |  | NULL | - | audit |
| 34 | Archive작업일자 | ARCHIVED_TIMESTAMP | TIMESTAMP(6) | 12 |  | NULL | - | audit |
| 35 | Archive프로그램ID | ARCHIVE_PROGRAM_ID | VARCHAR | 50 |  | NULL | - | audit |
| 36 | (한글명 ✗) | BOTTOM_MSG_YN | VARCHAR | 1 |  | NULL | 'Y' | (DB Default 'Y') — UI 노출 ✗ |
| 37 | 엑셀구분 | EXCEL_TP | VARCHAR | 1 |  | NULL | 'E' | (DB Default 'E') — UI 노출 ✗ |
| 38 | 비밀번호 실패 횟수 | PWD_FAIL_COUNT | NUMBER | 5 |  | NULL | - | (As-Is UI 노출 ✗ — DB 보존) |

#### §9.1.2 SEC_USER_MAPPING (사용자 그룹 매핑) — TB_MCM_SEC_USER_MAPPING / 19 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 사용자ID | USER_ID | VARCHAR | 30 | PK | NOT NULL | - | FK → TB_MCM_SEC_USER.USER_ID |
| 2 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | (PK 후보) | NOT NULL | - | FK → TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID — GR-001 / V-602 |
| 3~19 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (§9.1.1 #19~35 동일) | - |  | NULL | - | cactus-core 자동 처리 (T-009) |

#### §9.1.3 SEC_USER_PWD (사용자 패스워드 정보) — TB_MCM_SEC_USER_PWD / 24 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 사용자ID | USER_ID | VARCHAR | 30 | PK | NOT NULL | - | FK → TB_MCM_SEC_USER.USER_ID |
| 2 | 비밀번호 | USER_ENC_PWD | VARCHAR | 100 |  | NULL | - | BCrypt — RegCommUserMng:50 / PasswordInit:49 / ReRegCommUserMng:53 |
| 3 | SALT | SALT | VARCHAR | 100 |  | NULL | - | (Java 본문 미사용 — BCrypt 내장 salt) |
| 4 | 최종비밀번호 변경일 | LAST_PWD_CHNG_DATE | DATE | 8 |  | NULL | - | (Java 본문 미사용 — As-Is DB 보존) |
| 5~21 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |
| 22 | SSO비밀번호 | USER_SSO_PWD | VARCHAR | 100 |  | NULL | - | BCrypt — PasswordInit:54 SSO 초기화 |
| 23 | 임시 비밀번호 | USER_ENC_TEMP_PWD | VARCHAR | 100 |  | NULL | - | wb_pwdChg_init_onusernotify (pwdtmp transaction) |
| 24 | 임시 비밀번호 만료일 | TEMP_PWD_EXPIRATION_DATE | TIMESTAMP(6) | 12 |  | NULL | - | (As-Is xfdl 본문 미사용) |

#### §9.1.4 SEC_ROLEGROUP (사용자역할그룹) — TB_MCM_SEC_ROLEGROUP / 24 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | PK | NOT NULL | - | GR-001 / GL-001 / V-602 |
| 2 | 역할그룹명 | ROLE_GROUP_NM | VARCHAR | 100 |  | NOT NULL | - | GR-002 / GL-002 |
| 3 | 역할그룹설명 | ROLE_GROUP_DESC | VARCHAR | 300 |  | NULL | - | (As-Is selectCommRoleGrpList SELECT 미포함 — DB 보존만) |
| 4 | (한글명 ✗) | BIZ_SYSTEM_CODE | VARCHAR | 10 |  | NOT NULL | - | (As-Is xml WHERE 미포함 — 본 화면 비사용) |
| 5 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | - | xml:187 WHERE USE_TP='Y' (LV-007 활성 RoleGroup만) |
| 6 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | xml:187 BETWEEN 활성 검증 |
| 7 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | xml:187 NVL(END_ACTIVE_DATE, SYSDATE+100) |
| 8~24 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

#### §9.1.5 SEC_USER_HIS (계정생성회수이력) — TB_MCM_SEC_USER_HIS / 24 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 사용자ID | USER_ID | VARCHAR | 30 | PK | NOT NULL | - | FK → TB_MCM_SEC_USER.USER_ID |
| 2 | 기준일자 | ACTIVE_DT | VARCHAR | 8 | (PK 후보) | NOT NULL | - | YYYYMMDD |
| 3 | 구분 | PROC_TYPE | VARCHAR | 1 |  | NOT NULL | - | C=Create / D=Delete (RegCommUserMng/DeleteCommUserMng) |
| 4 | 처리유형 | PROC_CASE | VARCHAR | 1 |  | NOT NULL | - | M=Manual (As-Is 모든 호출 'M' 하드코딩) |
| 5 | 사용자명 | USER_NM | VARCHAR | 30 |  | NOT NULL | - | RegCommUserMng / DeleteCommUserMng / ReRegCommUserMng 모두 적재 |
| 6 | 정보처리의뢰서번호 | INF_REQ_NO | VARCHAR | 100 |  | NULL | - | edt_infReqNo 입력 (D-019) |
| 7 | 처리사유 | DESCRIPTION | VARCHAR | 300 |  | NULL | - | (D-019 처리사유) |
| 8~24 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

#### §9.1.6 SEC_USER_ROLL_HIS (일자별 권한변경이력) — TB_MCM_SEC_USER_ROLL_HIS / 25 컬럼

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 기준일자 | OP_SUMUP_DT | VARCHAR | 8 | PK | NOT NULL | - | YYYYMMDD (CommonUtil.getCurrentDate) |
| 2 | 사소구분 | WORKS_CODE | VARCHAR | 1 | (PK 후보) | NOT NULL | - | SaveRoleGroupHis:45/59 / SaveRoleGroupCopyHis "P" 하드코딩 |
| 3 | 사용자ID | USER_ID | VARCHAR | 30 | (PK 후보) | NOT NULL | - | FK → TB_MCM_SEC_USER.USER_ID |
| 4 | 역할그룹ID | ROLE_GROUP_ID | VARCHAR | 30 | (PK 후보) | NOT NULL | - | FK → TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID |
| 5 | 구분(A:추가,D:삭제) | RESP_GBN | VARCHAR | 1 | (PK 후보) | NOT NULL | - | **DMES 시트 명시: A=추가, D=삭제** — SaveRoleGroupHis:46(A)/60(D), SaveRoleGroupCopyHis:60(A) |
| 6 | 역할그룹명 | ROLE_GROUP_NM | VARCHAR | 100 |  | NULL | - | RoleGroup JOIN 적재 |
| 7 | 정보처리의뢰서번호 | INF_REQ_NO | VARCHAR | 100 |  | NULL | - | (D-019) |
| 8 | 처리사유 | DESCRIPTION | VARCHAR | 300 |  | NULL | - | (D-019) |
| 9~25 | audit 17 컬럼 | CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_* | (동일) | - |  | NULL | - | cactus-core 자동 처리 |

> **카탈로그 검증**: 합계 38 + 19 + 24 + 24 + 24 + 25 = **154 컬럼 등재**. audit 17 컬럼은 SEC_USER_MAPPING / SEC_USER_PWD / SEC_ROLEGROUP / SEC_USER_HIS / SEC_USER_ROLL_HIS 각 1:1 전수 (반복 컬럼 명단은 §9.1.1 SEC_USER #19~35 와 동일하므로 표 행 압축 표기 — 본문 정합 보존).
>
> **CommUserMng Mapper.xml + Java + xfdl 본문이 컬럼명 1:1 사용 검증**: 모든 INSERT / UPDATE / MERGE / Java mapInsert 의 컬럼명이 본 카탈로그에 등재됨 (cross-ref ✓).

#### §9.1.7 TB_MCM_DEPT_INFO (DMES 자체 부서 마스터 — 정책 #2 / Q-002 해소) / 신규 / 11 컬럼

> **신규 등재 2026-05-31** — As-Is `EAIUSER.IF_DSHRMMCMHD02` (외부 EAI 인터페이스 테이블) 폐기 결정에 따른 DMES 내부 부서 마스터 신설. 스키마 = `MCMAPUSER` (정책 #1). PK = DEPT_CD. To-Be JPA Entity `mcm.entity.DeptInfo extends McmAuditEntity` (정책 #6 (A) 직역 — `DeptInfo`).

| # | 한글명 | 영문명 | Type | 자릿수 | KEY | NULL | Default | 비고 |
|---:|---|---|---|---:|:---:|:---:|---|---|
| 1 | 부서코드 | DEPT_CD | VARCHAR | 10 | PK | NOT NULL | - | LV-005 / D-007 / G-008 (As-Is EAI CD_V 대체) |
| 2 | 부서명 | DEPT_NM | VARCHAR | 100 |  | NOT NULL | - | LV-005 / G-008 표시명 (As-Is EAI CD_V_MEANING 대체) |
| 3 | 부서 영문명 | DEPT_NM_EN | VARCHAR | 100 |  | NULL | - | (선택) |
| 4 | 상위 부서코드 | UPPER_DEPT_CD | VARCHAR | 10 |  | NULL | - | (선택 — 부서 계층) |
| 5 | 사용구분 | USE_TP | VARCHAR | 1 |  | NOT NULL | 'Y' | LV-005 활성 필터 (selectCommDept WHERE USE_TP='Y') |
| 6 | 유효개시일 | START_ACTIVE_DATE | DATE | 8 |  | NULL | - | - |
| 7 | 유효기한일 | END_ACTIVE_DATE | DATE | 8 |  | NULL | - | - |
| 8~11 | audit 9 컬럼 (압축) | CREATED_OBJECT_ID / CREATION_TIMESTAMP / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_TIMESTAMP 등 (총 9 컬럼은 McmAuditEntity 표준) | - | - |  | NULL | - | McmAuditEntity 상속 자동 처리 (T-009) |

> **테이블 운영 책임**: 별도 부서관리 화면 신규 설계 필요 (본 화면 범위 ✗ — 별도 결정 사항). 초기 데이터 = DataInitializer 또는 EAI 일회성 마이그레이션 적재.

---

## §10. xfdl Script 분석 (메서드 전수)

| ID | 메서드 명 | 라인 | 역할 |
|---|---|---|---|
| M-001 | fn_onload | 416~441 | Form onload — div_dept_cd 초기화 + gfn_formOnLoad + gridSelectedRow |
| M-002 | fn_formBeforeOnload | 443~530 | commonTop/Left/Right 등록 + 권한 분기 |
| M-003 | fn_beforeRun | 536~550 | searchCmUser dataset 초기화 |
| M-004 | fn_run | 553~651 | 11 sSvcId 분기 transaction (csa::CommUserMng) |
| M-005 | fn_pwInit | 654~680 | WebBrowser RSA pwChg.html 호출 |
| M-006 | wb_pwdChg_init_onloadcompleted | 684~694 | RSA 공개키 전달 |
| M-007 | wb_pwdChg_init_onusernotify | 697~740 | ds_pwdtmp 적재 + /security/password/pwdtmp transaction |
| M-008 | fn_callBack | 745~828 | 9 sSvcId 콜백 분기 (메시지 / 후속 transaction / 부수 처리) |
| M-009 | fn_detailPopup | 831~840 | divCostCentrCd 팝업 호출 (As-Is 정의만 — 호출 ✗) |
| M-010 | fn_search | 846~848 | fn_run("searchCmUser") |
| M-011 | fn_reset | 851~854 | gfn_setDivDefault(div_search) + edt_USER_ID 인덱스 |
| M-012 | fn_rowAdd | 857~869 | ds_main.addRow + USE_TP/START_ACTIVE_DATE/END_ACTIVE_DATE 기본값 + Detail focus + 영역 활성화 |
| M-013 | fn_rowDelete | 871~887 | gfn_deleteRow(ds_main, currow) + 마지막 행 시 영역 비활성화 |
| M-014 | fn_rowCancel | 888~890 | gfn_grdInit(grd_main) |
| M-015 | fn_modify | 892~993 | (§5.1 V-001~007) |
| M-016 | fn_register | 996~1071 | (§5.2 V-101~108) |
| M-017 | fn_delete | 1073~1160 | (§5.3 V-201~207) — 모달 표시 |
| M-018 | div_deletePopup_btn_save_onclick | 1163~1180 | rowposition deleteRow + setColumn + fn_run("deleteCmUser") |
| M-019 | div_deletePopup_btn_close_onclick | 1182~1189 | 모달 초기화 + 닫기 |
| M-020 | fn_close | 1192~1196 | gv_AppTabPath.fn_closeForm() |
| M-021 | ds_main_onrowposchanged | 1199~1250 | (§4.8) |
| M-022 | div_main_div_mainGrd_grd_main_onheadclick | 1253~1256 | gfn_commonOnheadclick (정렬) |
| M-023 | btn_fold_onclick | 1258~1261 | gfn_fold(this, div_search, div_main, btn_fold) |
| M-024 | div_main_div_mainGrd_grd_main_onkeydown | 1263~1268 | (As-Is 본문 모두 주석 — 비어있음) |
| M-025 | fn_init_cboWrkPlace | 1271~1299 | (As-Is 잔존 — 본 화면 미사용 / searchCdWrkPlacePopup 호출) |
| M-026 | fn_rolSave | 1303~1312 | confirm → fn_run("saveUserRoleGrp") |
| M-027 | fn_rolSearch | 1315~1318 | fn_run("searchRoleGrp") |
| M-028 | fn_rolAdd | 1321~1374 | (§5.7 V-601~604) 역할추가 |
| M-029 | fn_rolDel | 1377~1380 | gfn_deleteRow(ds_userRolegrp, rowposition) |
| M-030 | div_main_div_mainDetail_btn_PwdReset_onclick | 1382~1396 | (§5.6 V-501) PWD 초기화 confirm |
| M-031 | div_main_div_mainDetail_div_detail_edt_user_id_onchanged | 1398~1403 | rdo_PwdReset/rdo_SSOReset/edt_role_copy 모두 N/null 리셋 |
| M-032 | div_main_btn_SSOPwdReset_onclick | 1405~1419 | (§5.6 V-502) SSO 초기화 confirm |
| M-033 | div_main_div_mainDetail_div_detail_btn_RoleCopy_onclick | 1421~1429 | (§5.6 V-503) 역할 복사 confirm |
| M-034 | div_main_div_mainDetail_div_detail_btn_reRegister_onclick | 1433~1498 | (§5.4 V-301~308) 계정 재생성 |

> **잔존 / 오타 / 비활성 메서드**: M-009 `fn_detailPopup` (정의만 호출 ✗) / M-024 `onkeydown` (전체 주석) / M-025 `fn_init_cboWrkPlace` (다른 화면용 잔존) / M-031 `edt_user_id_onchanged` (D-001 변경 시 rdo 리셋) — 모두 As-Is 보존.

### §10.1 FORM 변수 (xfdl:409~412)

| 변수 | 초기값 | 역할 | 근거 |
|---|---|---|---|
| this.fv_menuSn | "" | gds_scrInfo.scrSn 적재 (xfdl:448) | xfdl:409 |
| this.fv_strRow | "" | (As-Is 잔존 — 미사용) | xfdl:410 |
| this.roleSearch | false | 조회 완료 후 ds_main_onrowposchanged 의 searchUserRoleGrp 호출 허용 플래그 (IE/Chrome 호환) | xfdl:411 |
| this.ssoReset | (undefined) | PasswordInit SSO_RESET_FLAG="Y" 전달용 변수 | xfdl:412 |

### §10.2 As-Is 오타 / 결함 식별

| # | 위치 | 내용 | 처리 (As-Is/To-Be) |
|---|---|---|---|
| F-001 | xfdl:411 (this.roleSearch comment) | "역활" (정상은 "역할") | As-Is 보존 + **To-Be 정정 (정책 #3 (A) / Q-006 해소 / T-026)** |
| F-002 | xfdl:789 / 813 (fn_callBack saveUserRoleGrp/saveUserRoleGrpCopy 메시지) | "역활 {N}건 저장 되었습니다." / "역활그룹이 저장 되었습니다." (정상은 "역할") | As-Is 보존 + **To-Be 정정 "역할 {N}건 저장 되었습니다." / "역할그룹이 저장 되었습니다." (정책 #3 (A) / Q-006 해소 / T-026)** |
| F-003 | xfdl:794 (fn_callBack saveUserRoleGrp error 분기) | `this.div_buttom.form.fn_commonBottomStatus_msg(strErrorMsg)` — 정상은 `div_bottom` | As-Is 보존 — **버그**: error 분기 시 NullReferenceException 가능. **To-Be `div_bottom` 정정 (정책 #3 (A) / Q-007 해소 / T-027)** |
| F-004 | xfdl:825 (fn_callBack commonUserDept) | `nErrorCode.DEPT_CD` — nErrorCode 는 일반적으로 숫자이나 객체 프로퍼티 접근 — As-Is 결함 (Q-008 해소: `libTran.xjs:394` 의 사용자 콜백 시그니처 `fn_callBack(sSvcId, nErrorCode, resultMsg)` — 3번째 인자 `resultMsg = JSON.parse(errorMsg)` 객체. 본 화면 다른 case 들 xfdl:765 / 782 / 789 는 `strErrorMsg["키"]` 로 정상 dereference. xfdl:825 만 2번째 인자에 .DEPT_CD 접근 = As-Is 결함, `strErrorMsg.DEPT_CD` 또는 `resultMsg.DEPT_CD` 가 맞는 표기로 추정) | As-Is 보존 + **To-Be 정정 결정** (`strErrorMsg.DEPT_CD` 로 정정 — DEPT_CD 가 객체 키로 들어오므로 정상 동작) |
| F-005 | java SaveCommUserMng:42~57 / 68~83 | inserted / deleted 분기 전체 주석 (Reg/Delete 가 별도 클래스로 분리되었기 때문) | As-Is 보존 — To-Be 폐기 (Q-009) |
| F-006 | xfdl:956~984 (fn_modify) | "팝업코드 확인" for-loop 전체 주석 (As-Is 플랜트코드/거래처 검증 잔존) | As-Is 보존 — To-Be 제거 결정 |
| F-007 | xfdl:1076~1093 / 1139~1152 (fn_delete) | ROWTYPE_DELETE 검증 + confirm 메시지 전체 주석 (모달 방식으로 대체) | As-Is 보존 — To-Be 제거 결정 |
| F-008 | xfdl:139 (cbo_categoryId ✗ — D-013/014/015 edt_group_id1~3) | `innerdataset=""` (빈 dataset) — 콤보가 LoV 미지정 상태 | As-Is 보존 + **To-Be 신규 UI 미반영 (정책 #3 (D) / Q-005 해소 / T-025) — 콤보 자체 제거** |
| F-009 | Mapper xml:187 (selectCommRoleGrpList) | `SYSDATE BETWEEN START_ACTIVE_DATE AND NVL(END_ACTIVE_DATE, SYSDATE + 100)` — Oracle 함수 | To-Be MSSQL `GETDATE() BETWEEN ... AND ISNULL(END_ACTIVE_DATE, DATEADD(day, 100, GETDATE()))` 변환 |
| F-010 | Mapper xml:24 / 255 (selectCommUser/selectCommDept) | `EAIUSER.IF_DSHRMMCMHD02` 외부 EAI 스키마 직접 참조 | As-Is 보존 + **To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 (정책 #2 / Q-002 해소 / T-008 갱신)** |
| F-011 | Mapper xml:28~30 (selectCommUser) | `LIKE UPPER(#{edt_USER_ID} ||'%')` — `||` Oracle 문자열 결합 | To-Be MSSQL `+` 또는 CONCAT 변환 |
| F-012 | Mapper xml:204 / 228 (mergeCommonPwdInit / mergeCommonCopyRoleGrp) | `MERGE INTO MCMAPUSER.TB_MCM_SEC_USER_PWD USING DUAL` — Oracle MERGE / DUAL 패턴 | To-Be MSSQL MERGE (FROM DUAL 제거) 또는 IF EXISTS 변환 |
| F-013 | Mapper xml:280~281 (updateReRegUser) | `TO_DATE(#{START_ACTIVE_DATE}, 'YYYYMMDD')` — Oracle | To-Be MSSQL `CONVERT(date, ..., 112)` 또는 string 직접 변환 |
| F-014 | xfdl:411 commit msg "IE/Chrome 에서 조회 에러 발생함" | nexacro 5.1 브라우저 호환 회피 코드 | As-Is 보존 + **To-Be 폐기 (정책 #3 (E) / Q-010 해소 / T-024) — Next.js 16 모던 브라우저만 지원. AG Grid `onRowSelected` 가 자연 흡수** |

---

## §11. To-Be 마이그레이션 변환점 (Oracle → MSSQL MCMAPUSER / ref_Audit → mcm-core / PWD 정책 + 6 정책 결정 일괄 반영)

> **갱신 2026-05-31**: Q 13 건 모두 해소 — 6 정책 결정 본문 반영. 정책 #4 (0) **As-Is/To-Be 표준 우선 원칙** + 정책 #1~#3/#6 일괄 적용. **cma 정본 패턴 = `mcm-core/security/password/McmPasswordProperties` (기존 보존) + `m-mcm` FE / `mcm.csa.commUserMng.*` BE / `mcm.entity.*` Entity 직속 (가이드 §3-1 / §6-A-1 / §7-1) / `McmAuditEntity` 상속**.

### §11.0 신규 결정 — 정책 #1 / #2 / #3 / #4 / #6 일괄 반영 행

| # | 정책 결정 항목 | 결과 | 영향 |
|---|---|---|---|
| P-1 | (정책 #1) APP_HOST / BIZ_SYSTEM_CODE 폐기 + mcm-core / kmc-core 기존 자산 보존 + cma 정본 패턴 / schema=MCMAPUSER / 테이블명 As-Is 대문자 / Entity=`mcm.entity.*` / Service-DTO=`mcm.csa.commUserMng.{service|dto}` / JPA only / McmAuditEntity 상속 | 적용 | T-007 / T-009 / §6 모든 SQL / §9.1 schema 표기 / §11.1 Entity 명명 |
| P-2 | (정책 #2 / Q-002 해소) EAI 폐기 + DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 | 적용 | T-008 폐기 → 신규 T-008' / §6 #1 #18 / §9.1.7 / LV-005 |
| P-3-A | (정책 #3 (A) / Q-006 해소) "역활"→"역할" 정정 (xfdl 3 hits 본문 메시지) | To-Be 정정 | §10.2 F-001 / F-002 / 기능 §10 M-028 / M-029 |
| P-3-A2 | (정책 #3 (A) / Q-007 해소) `div_buttom` → `div_bottom` 정정 (NullReferenceException 버그) | To-Be 정정 | §10.2 F-003 / 기능 §6.9 V-801 |
| P-3-B | (정책 #3 (B) / Q-003 해소) 미사용 SQL 5종 폐기 (selectCommUserForSave / deleteCommUser / deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit) | 폐기 | §6 #3 #7 #8 #9 #14 |
| P-3-B2 | (정책 #3 (B) / Q-009 해소) SaveCommUserMng.java inserted/deleted 주석 코드 신규 미반영 | 미반영 | §7.1 7.1-3 / 7.1-5 / §10.2 F-005 |
| P-3-C | (정책 #3 (C) / Q-004 해소) 외부 namespace SQL (X-1 X-2) → JPA Entity `SecUserHis` / `SecUserRollHis` + saveAll() 흡수 | 흡수 | §6.1 / T-023 / §11.1 Entity |
| P-3-D | (정책 #3 (D) / Q-005 해소) edt_group_id1~3 LoV 미설정 콤보 신규 UI 미반영 | 미반영 | LV-006 / D-013/014/015 / T-025 / 기능 §3.2 §4.1 / 디자인 §3.4 |
| P-3-E | (정책 #3 (E) / Q-010 / Q-014 해소) nexacro roleSearch 플래그 / STATUS row state → To-Be FE 자연 흡수 | 자연 흡수 | T-013 / T-024 / §10.2 F-014 / G-001 |
| P-3-F | (정책 #3 (F) / Q-012 / Q-013 해소) application.yml 외부화 + 신규 FE 페이지 + 신규 BE 엔드포인트 | 적용 | T-011 / T-012 — yml prefix `commUserMng.password.*` / Properties 위치 `mcm.csa.commUserMng.config.CommUserMngPasswordProperties` (기존 `mcm-core/security/password/McmPasswordProperties` 보존) / FE `m-mcm/app/password-change/page.tsx` / BE `/oasis/commUserMng/changePassword` (기존 `/oasis/secUser/resetPassword` 보존) |
| P-3-G | (정책 #3 (G) / Q-015 해소) PortalShell + RBAC 통합 (gv_AppWorkFrameSet 등 nexacro 권한 → React Context) | 통합 | T-015 |
| P-3-H | (정책 #3 (H) / Q-011 해소) schema=MCMAPUSER + 테이블명 TB_MCM_SEC_* 대문자 보존 | 확정 | T-007 / §6 모든 SQL / §9.1 |
| P-6-A | (정책 #6 (A)) Entity 명명 As-Is 직역 (SecUser/SecUserMapping/SecUserPwd/SecRoleGroup/SecUserHis/SecUserRollHis) + 위치 `com.dongkuk.dmes.mcm.entity.*` (기존 mcm-core/role/entity/SecObj 등과 패키지 다름 공존) | 적용 | §11.1 |
| P-4-0 | (정책 #4 (0)) As-Is / To-Be 표준 우선 원칙 | 원칙 명시 | 본 §11 전수 |

### §11.1 Entity 명명 + 위치 (정책 #1 / #6 (A))

> 모든 Entity 는 `com.dongkuk.dmes.mcm.entity.*` 패키지 직속 (가이드 §3-1 모듈 직속 룰). 기존 mcm-core 자산 (`mcm-core/role/entity/SecObj` 등) 과는 패키지 분리되어 공존. As-Is 테이블명 직역.

| Entity | FQN | 매핑 테이블 (schema=MCMAPUSER) | 상속 | Repository | 사용 Service |
|---|---|---|---|---|---|
| `SecUser` | `com.dongkuk.dmes.mcm.entity.SecUser` | TB_MCM_SEC_USER (38 컬럼 — §9.1.1) | McmAuditEntity | SecUserRepository | mcm.csa.commUserMng.service.CommUserMngService |
| `SecUserMapping` | `com.dongkuk.dmes.mcm.entity.SecUserMapping` | TB_MCM_SEC_USER_MAPPING (19 컬럼 — §9.1.2 / @IdClass 복합 PK USER_ID+ROLE_GROUP_ID) | McmAuditEntity | SecUserMappingRepository | 동일 |
| `SecUserPwd` | `com.dongkuk.dmes.mcm.entity.SecUserPwd` | TB_MCM_SEC_USER_PWD (24 컬럼 — §9.1.3) | McmAuditEntity | SecUserPwdRepository | 동일 |
| `SecRoleGroup` | `com.dongkuk.dmes.mcm.entity.SecRoleGroup` | TB_MCM_SEC_ROLEGROUP (24 컬럼 — §9.1.4) | McmAuditEntity | SecRoleGroupRepository | 동일 (LV-007 read-only) |
| `SecUserHis` | `com.dongkuk.dmes.mcm.entity.SecUserHis` | TB_MCM_SEC_USER_HIS (24 컬럼 — §9.1.5 / @IdClass 복합 PK USER_ID+ACTIVE_DT) | McmAuditEntity | SecUserHisRepository | 동일 (As-Is X-1 흡수 — 정책 #3 (C)) |
| `SecUserRollHis` | `com.dongkuk.dmes.mcm.entity.SecUserRollHis` | TB_MCM_SEC_USER_ROLL_HIS (25 컬럼 — §9.1.6 / @IdClass 복합 PK OP_SUMUP_DT+WORKS_CODE+USER_ID+ROLE_GROUP_ID+RESP_GBN) | McmAuditEntity | SecUserRollHisRepository | 동일 (As-Is X-2 흡수 — 정책 #3 (C)) |
| `DeptInfo` | `com.dongkuk.dmes.mcm.entity.DeptInfo` | TB_MCM_DEPT_INFO (11 컬럼 — §9.1.7 / 신규 — 정책 #2) | McmAuditEntity | DeptInfoRepository | 동일 (LV-005 부서 조회) |

### §11.2 SQL → Oracle/MSSQL 변환점 (기존 T-NNN 유지 + Q 해소 사항 반영)

| # | 변환 항목 | 영향 SQL ID | 상태 |
|---|---|---|---|
| T-001 | Oracle `MERGE INTO ... USING DUAL` → MSSQL MERGE (USING (VALUES (...)) AS B(USER_ID) 또는 IF EXISTS) | mergeCommonPwdInit / mergeCommonCopyRoleGrp | xml:204 / 228 |
| T-002 | Oracle `SYSDATE` → MSSQL `GETDATE()` | selectCommRoleGrpList | xml:187 |
| T-003 | Oracle `NVL(col, expr)` → MSSQL `ISNULL(col, expr)` | selectCommRoleGrpList | xml:187 |
| T-004 | Oracle `\|\|` 문자열 결합 → MSSQL `+` 또는 CONCAT | selectCommUser / selectCommDept | xml:28~30 / 258~259 |
| T-005 | Oracle `TO_DATE(str, 'YYYYMMDD')` → MSSQL `TRY_CONVERT(date, str, 112)` 또는 string 직접 | updateReRegUser | xml:280~281 |
| T-006 | Oracle `UPPER(...)` — MSSQL 동일 지원 | selectCommUser / selectCommDept | (변환 ✗) |
| T-007 | **(정책 #3 (H) / Q-011 해소)** 스키마 = `MCMAPUSER` 확정 + 테이블명 As-Is 대문자 `TB_MCM_*` 보존 | 모든 SQL | 결정 |
| T-008 | ~~`EAIUSER.IF_DSHRMMCMHD02` 외부 EAI 테이블 → To-Be HR 마스터 연계~~ → **(정책 #2 / Q-002 해소)** DMES 신규 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN (selectCommUser) / 단독 조회 (selectCommDept) | selectCommUser (DEPT_NM scalar subquery → LEFT JOIN) / selectCommDept | §6 #1 #18 / §9.1.7 |
| T-009 | `ref_Audit` fragment (`insert_item` / `insert_value` / `update`) → **`McmAuditEntity` 상속 + JPA `@PrePersist` / `@PreUpdate` 자동 처리** (정책 #1 — mcm-core 기존 자산 보존 + cma 정본 패턴) | insertCommUser / updateCommUser / insertCommUserRoleGrp / mergeCommonPwdInit / mergeCommonCopyRoleGrp / updateCommonSSOPwdInit / updateReRegUser (13 회 include) | 폐기 |
| T-010 | Oracle BCrypt `org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder` → To-Be Spring Boot 4 (Spring Security 7) — 동일 라이브러리 호환 | RegCommUserMng / DeleteCommUserMng (사용 ✗ — 객체 생성만) / PasswordInit / ReRegCommUserMng | (변환 ✗ — 동일) |
| T-011 | **(정책 #3 (F) / Q-012 해소)** `CactusConstants.DEFAULT_PASSWORD` → application.yml 외부화. **yml prefix = `commUserMng.password.*`** + Properties 위치 = **`mcm.csa.commUserMng.config.CommUserMngPasswordProperties`** (기존 `mcm-core/security/password/McmPasswordProperties` 보존 — 본 화면용 별도 신규) | RegCommUserMng / PasswordInit / ReRegCommUserMng | 적용 |
| T-012 | **(정책 #3 (F) / Q-013 해소)** nexacro WebBrowser 기반 RSA pwChg.html → 신규 FE 페이지 + 신규 BE 엔드포인트. **FE = `m-mcm/app/password-change/page.tsx` (신규)** + **BE = `POST /oasis/commUserMng/changePassword` (신규)** (기존 `/oasis/secUser/resetPassword` 보존 — 본 화면용 별도 신규) | fn_pwInit / wb_pwdChg_init_onloadcompleted / wb_pwdChg_init_onusernotify | 적용 |
| T-013 | **(정책 #3 (E) / Q-014 해소)** nexacro Static row state 아이콘 (G-001 STATUS displaytype=imagecontrol) → AG Grid row state 자연 흡수 (AgDataGrid `getRowClass` / `rowSelection` 기본 상태 표시) — 별도 STATUS 컬럼 신규 미반영 | G-001 | 자연 흡수 |
| T-014 | nexacro `gfn_dsRequired` 공통 함수 (필수 검증) → React-Hook-Form / Zod 등 To-Be 검증 라이브러리 | V-002 / V-102 / V-202 | (To-Be 표준 — 변환 표준) |
| T-015 | **(정책 #3 (G) / Q-015 해소)** `gv_AppWorkFrameSet._active_frame` / `gds_btn_list` 등 nexacro 전역 → To-Be PortalShell + RBAC React Context 통합 | fn_formBeforeOnload 권한 분기 (sBtnId=="user") | 통합 |
| T-016 | `commonDynamic.xfdl` 부서 팝업 컴포넌트 → To-Be SelectModal / Autocomplete (Next.js) | D-007 (div_dept_cd) | - |
| T-017 | `commonTopButton.xfdl` / `commonLeftButton.xfdl` / `commonRightButton.xfdl` → To-Be PortalShell 의 PageLayout buttons / Toolbar | FX-001 / FX-002 / FX-003 / FX-004 / FX-005 | - |
| T-018 | `commonBottomStatus.xfdl` → To-Be PortalShell footer 또는 Toast / Snackbar | FX-007 | - |
| T-019 | `gfn_message(..., "error/warning/info/confirm", ...)` → To-Be MessageModal / Toast 표준 | 모든 V-NNN 메시지 | - |
| T-020 | nexacro Form 내 모달 Div (`div_deletePopup`, visible toggle) → To-Be Modal 컴포넌트 (@dk-oasis/shared/modal) | A-POPUP-DEL / B-017 / B-018 | - |
| T-021 | Java `IllegalTaskException` / `UserException` (oasis) → To-Be cactus / oasis 동일 (cactus-core 의 oasis 패키지 그대로) | DeleteCommUserMng / PasswordInit / RegCommUserMng / ReRegCommUserMng / SaveCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis | (변환 ✗ — 패키지 동일 유지) |
| T-022 | `CactusConstants.USER_ID / USER_EMP_NO / USER_ENC_PWD / USER_SSO_PWD` 상수 → To-Be cactus-core 동일 상수 (이관 1:1) | RegCommUserMng / PasswordInit / ReRegCommUserMng | (변환 ✗) |
| T-023 | **(정책 #3 (C) / Q-004 해소)** `TB_MCM_SEC_USER_HIS_Mapper.insert` / `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (외부 namespace) → JPA Entity `SecUserHis` / `SecUserRollHis` + Repository.saveAll() 흡수 (별도 Mapper.xml 신규 ✗) | DeleteCommUserMng / RegCommUserMng / ReRegCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis | 흡수 |
| T-024 | **(정책 #3 (E) / Q-010 해소)** nexacro Dataset onrowposchanged → AG Grid `onRowSelected` (Next.js) 자연 흡수. nexacro `roleSearch` IE/Chrome 호환 플래그는 To-Be 폐기 (Next.js 16 모던 브라우저만 지원) | ds_main_onrowposchanged / xfdl:411 roleSearch | 자연 흡수 / 폐기 |
| T-025 | **(정책 #3 (D) / Q-005 해소)** nexacro Combo `innerdataset=""` (D-013~015 GROUP_ID1~3) — As-Is 빈 콤보 → **To-Be FE 신규 UI 미반영** (콤보 자체 제거). ds_main 컬럼 GROUP_ID1~3 은 TB_MCM_SEC_USER 카탈로그 (§9.1.1 #14~16) 에 보존만. | D-013 / D-014 / D-015 | 미반영 |
| T-026 | **(신규 — 정책 #3 (A) / Q-006 해소)** "역활" → "역할" 오타 정정 (xfdl 3 hits 본문 메시지) | M-028 / M-029 / xfdl:411 comment | To-Be 정정 |
| T-027 | **(신규 — 정책 #3 (A) / Q-007 해소)** `div_buttom` → `div_bottom` 오타 정정 (NullReferenceException 버그) | xfdl:794 (fn_callBack saveUserRoleGrp error) | To-Be 정정 |

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 활성 확인필요 = **0 건**. 결정 내용은 §6 / §9 / §10 / §11 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| 스키마/테이블명 (정책 #1 (6)(7)) | As-Is `TB_MCM_SEC_*` 대문자 보존 + schema=`MCMAPUSER` 명시 | §9 / §11.1 |
| BIZ_SYSTEM_CODE 폐기 (정책 #1) | (영향 ✗ — 본 화면 미사용) | - |
| EAI → DMES 부서 마스터 (정책 #2) | EAIUSER.IF_DSHRMMCMHD02 → TB_MCM_DEPT_INFO (schema=MCMAPUSER) JOIN 변환 | §6 / §9 / §11 |
| 미사용 SQL 5종 폐기 | selectCommUserForSave / deleteCommUser / deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit 신규 미반영 | §6 |
| 외부 namespace SQL JPA 흡수 | TB_MCM_SEC_USER_HIS_Mapper.insert / mergePK → JPA SecUserHis / SecUserRollHis saveAll() 흡수 | §6 / §11 |
| LoV 미설정 콤보 폐기 | edt_group_id1~3 (innerdataset="") 신규 UI 미반영 | §3.5 |
| "역활" 오타 정정 | "역활" → "역할" (xfdl:411 / 789 / 813) | §11 |
| div_buttom 오타 정정 | div_buttom → div_bottom (xfdl:794) | §11 |
| SaveCommUserMng 주석 코드 | inserted / deleted 분기 신규 미반영 (별도 클래스 분리) | §11 |
| nexacro roleSearch 자연 흡수 | To-Be 모던 브라우저 + React state — 별도 가드 불필요 | §11 |
| Grid STATUS AG Grid 자연 흡수 | AG Grid rowClassRules + CSS | §11 |
| 비밀번호 정책 외부화 | application.yml prefix `commUserMng.password.*` / 신규 위치 `mcm.csa.commUserMng.config.CommUserMngPasswordProperties` (기존 mcm-core 자산 보존) | §11 |
| 비밀번호 변경 페이지 신규 | 신규 FE `m-mcm/app/password-change/page.tsx` + 신규 BE `/oasis/commUserMng/changePassword` (기존 자산 보존) | §11 |
| PortalShell + RBAC 통합 | nexacro 권한 → React Context (정책 #1) | §11 |
| Entity 명명 As-Is 직역 (정책 #6 (A)) | SecUser / SecUserMapping / SecUserPwd / SecRoleGroup / SecUserHis / SecUserRollHis (`mcm.entity.*` 모듈 직속) | §11.1 |
| audit (cactus-core 정본) | McmAuditEntity 상속 (정책 #1 (10)) | §9 |
| As-Is/To-Be 표준 우선 원칙 (정책 #4 (0)) | As-Is 1:1 보존도 To-Be 개발 표준 충돌 시 To-Be 우선 | §0 |

---

## §17. As-Is 1:1 컬럼 단위 전수 행 분해

### §17.1 xfdl Layout 컴포넌트 전수 (Layout grep 기준)

> 본 §17.1 은 **xfdl Layout 본문의 모든 Static / Edit / Calendar / Combo / Radio / Button / ImageViewer / Grid / Div 인스턴스 1행씩** 분해. id / taborder / 좌표 / cssclass / value/text / 분류 모두 표기.

| line | tag | id | taborder | 좌표 / 크기 | cssclass | value / text | 분류 (영역 / NNN) |
|---:|---|---|---:|---|---|---|---|
| 6 | Div | div_bottom | 2 | left=20/right=20/height=20/bottom=0 | div_WF_Footer | (url commonBottomStatus.xfdl) | A-FOOTER / FX-007 |
| 7 | Button | btn_fold | 3 | top=93/left=20/right=20/height=12 | btn_WFSA_Fold | (onclick=btn_fold_onclick) | A-FOLD / B-006 |
| 8 | Div | div_main | 0 | left=20/top=btn_fold:20/right=20/bottom=40 | - | text="" | A-MAIN |
| 11 | Div | div_mainGrd | 0 | top=0/bottom=0/left=0/right=760 | - | text="div_mainGrd" | A-MAIN-LEFT |
| 14 | Div | div_rightMenu | 1 | top=0/height=21/right=0/width=280 | (font 12px) | (url commonRightButton.xfdl) | FX-003 |
| 15 | Grid | grd_main | 0 | left=0/top=25/right=0/bottom=0 | - | binddataset=ds_main | G-001~G-017 |
| 82 | Edit | edt_srch_cseq | 2 | left=0/top=0/width=77/height=21 | edi_WF_Title1 | "조회 결과" (readonly) | FX-008 |
| 83 | Div | div_leftMenu | 3 | left=edt_srch_cseq:5/top=0/width=223/height=21 | - | (url commonLeftButton.xfdl) | FX-002 |
| 87 | Div | div_mainDetail | 1 | top=0/left=div_mainGrd:10/width=430/bottom=0 | formscrollbartype=none none | text="div_mainDetail" | A-MAIN-CENTER |
| 90 | Div | div_detail | 0 | top=25/left=0/right=0/bottom=-20 | - | text="Div00" | (div_detail 컨테이너) |
| 93 | Static | stc_Static28 | 59 | left=0/top=500/right=0/height=29 | stc_WF_Box | "" | (D-019 라벨박스) |
| 94 | Static | stc_Static25 | 21 | left=0/top=416/right=0/height=29 | stc_WF_Box | "" | (D-017 라벨박스) |
| 95 | Static | stc_Static2 | 25 | left=0/top=28/right=0/height=29 | stc_WF_Box | "" | (D-002 라벨박스) |
| 96 | Static | stc_Static4 | 26 | left=0/top=84/right=0/height=29 | stc_WF_Box | "" | (D-004 라벨박스) |
| 97 | Static | stc_Static11 | 27 | left=0/top=248/right=0/height=29 | stc_WF_Box | "" | (D-010 라벨박스) |
| 98 | Static | stc_Static10 | 24 | left=0/top=222/right=0/height=29 | stc_WF_Box | "" | (D-009 라벨박스) |
| 99 | Static | stc_Static1 | 28 | top=0/left=0/right=0/height=29 | stc_WF_BoxFirst | "" | (D-001 라벨박스) |
| 100 | Static | stc_Static5 | 29 | left=0/top=112/right=0/height=29 | stc_WF_Box | "" | (D-005 라벨박스) |
| 101 | Static | stc_Static6 | 30 | left=0/top=140/right=0/height=29 | stc_WF_Box | "" | (D-006 라벨박스) |
| 102 | Static | stc_Static3 | 31 | left=0/top=56/right=0/height=29 | stc_WF_Box | "" | (D-003 라벨박스) |
| 103 | Static | stc_Static8 | 23 | left=0/top=196/right=0/height=29 | stc_WF_Box | "" | (D-008 라벨박스) |
| 104 | Edit | ed_st_tel_no | 32 | left=0/top=250/width=180/height=29 | edi_WF_Label | "전화 번호" (readonly) | D-010 라벨 |
| 105 | Edit | edt_st_email | 33 | left=0/top=222/width=180/height=29 | edi_WF_LabelE | "이메일" (readonly) | D-009 라벨 (Essential) |
| 106 | Edit | edt_st_user_emp_no | 34 | left=0/top=28/width=180/height=29 | edi_WF_LabelE | "사원 번호" (readonly) | D-002 라벨 (Essential) |
| 107 | Edit | edt_st_end_active_date | 35 | left=0/top=140/width=180/height=29 | edi_WF_Label | "유효개시기한일" (readonly) | D-006 라벨 |
| 108 | Edit | edt_st_user_id | 22 | left=0/top=0/width=180/height=29 | edi_WF_LabelFirstE | "사용자ID" (readonly) | D-001 라벨 (Essential) |
| 109 | Edit | edt_st_user_nm | 36 | left=0/top=84/width=180/height=29 | edi_WF_LabelE | "사용자명" (readonly) | D-004 라벨 (Essential) |
| 110 | Edit | edt_user_id | 0 | left=184/top=4/right=5/height=21 | Essential | maxlength=90, inputtype=normal | D-001 입력 |
| 111 | Edit | edt_user_nm | 3 | left=184/top=88/right=5/height=21 | Essential | maxlength=90 | D-004 입력 |
| 112 | Edit | edt_st_start_active_date | 39 | left=0/top=112/width=180/height=29 | edi_WF_Label | "유효개시일" (readonly) | D-005 라벨 |
| 113 | Calendar | cal_start_active_date | 4 | left=184/top=116/right=5/height=21 | - | usetrailingday=true, dateformat=yyyy-MM-dd | D-005 입력 |
| 114 | Edit | ed_tel_no | 9 | left=184/top=253/right=5/height=21 | - | maxlength=90, inputtype=digit | D-010 입력 |
| 115 | Edit | edt_email | 8 | left=184/top=226/right=5/height=21 | - | maxlength=300 | D-009 입력 |
| 116 | Static | stc_Static15 | 40 | left=0/top=360/right=0/height=29 | stc_WF_Box | "" | (D-014 라벨박스) |
| 117 | Static | stc_Static16 | 41 | left=0/top=388/right=0/height=29 | stc_WF_Box | "" | (D-015 라벨박스) |
| 118 | Edit | edt_st_group_id2 | 42 | left=0/top=360/width=180/height=29 | edi_WF_Label | "사용자 그룹2" (readonly) | D-014 라벨 |
| 119 | Edit | edt_st_group_id3 | 43 | left=0/top=388/width=180/height=29 | edi_WF_Label | "사용자 그룹3" (readonly) | D-015 라벨 |
| 120 | Edit | edt_st_sso_id | 44 | left=0/top=56/width=180/height=29 | edi_WF_Label | "SSO ID" (readonly) | D-003 라벨 |
| 121 | Edit | edt_st_role_copy | 45 | left=0/top=416/width=180/height=29 | edi_WF_Label | "사용자 역할그룹 복사" (readonly) | D-017 라벨 |
| 122 | Static | stc_Static14 | 46 | left=0/top=332/right=0/height=29 | stc_WF_Box | "" | (D-013 라벨박스) |
| 123 | Edit | edt_st_group_id1 | 47 | left=0/top=332/width=180/height=29 | edi_WF_Label | "사용자 그룹1" (readonly) | D-013 라벨 |
| 124 | Static | stc_Static7 | 48 | left=0/top=168/right=0/height=29 | stc_WF_Box | "" | (D-007 라벨박스) |
| 125 | Calendar | cal_end_active_date | 5 | left=184/top=144/right=5/height=21 | - | dateformat=yyyy-MM-dd | D-006 입력 |
| 126 | Edit | edt_st_dept_cd | 49 | left=0/top=168/width=180/height=29 | edi_WF_Label | "부서코드" (readonly) | D-007 라벨 |
| 127 | Edit | edt_st_user_category_cd | 50 | left=0/top=196/width=180/height=29 | edi_WF_Label | "사용자분류코드" (readonly) | D-008 라벨 |
| 128 | Edit | edt_user_category_cd | 7 | left=184/top=200/right=5/height=21 | - | - | D-008 입력 |
| 129 | Div | div_dept_cd | 6 | left=184/top=172/right=5/height=21 | Essential | (url commonDynamic.xfdl) | D-007 / FX-006 |
| 130 | Combo | edt_group_id1 | 12 | left=184/top=336/right=5/height=21 | - | value="," index=-1 codecolumn=condCd datacolumn=condNm innerdataset="" | D-013 입력 |
| 131 | Static | stc_Static13 | 52 | left=0/top=304/right=0/height=29 | stc_WF_Box | "" | (D-012 라벨박스) |
| 132 | Static | stc_Static12 | 51 | left=0/top=276/right=0/height=29 | stc_WF_Box | "" | (D-011 라벨박스) |
| 133 | Edit | edt_st_mobile_no | 37 | left=0/top=276/width=180/height=29 | edi_WF_Label | "모바일번호" (readonly) | D-011 라벨 |
| 134 | Edit | edt_mobile_no | 10 | left=184/top=280/right=5/height=21 | - | maxlength=90, inputtype=digit | D-011 입력 |
| 135 | Edit | edt_st_in_out_emp_tp | 38 | left=0/top=304/width=180/height=29 | edi_WF_LabelE | "내부 외부 구분" (readonly) | D-012 라벨 (Essential) |
| 136 | Combo | edt_in_out_emp_tp | 11 | left=184/top=309/right=5/height=21 | Essential | innerdataset=ds_inOutEmpTp, codecolumn=CD, datacolumn=NM | D-012 입력 |
| 137 | Edit | edt_sso_id | 2 | left=184/top=60/right=5/height=21 | - | maxlength=90, inputtype=digit,alpha, displaynulltext="UNI DOS 연동" | D-003 입력 |
| 138 | Combo | edt_group_id2 | 13 | left=184/top=364/right=5/height=21 | - | value="," index=-1 innerdataset="" | D-014 입력 |
| 139 | Combo | edt_group_id3 | 14 | left=184/top=392/right=5/height=21 | - | value="," index=-1 innerdataset="" | D-015 입력 |
| 140 | Edit | edt_user_emp_no | 1 | left=184/top=32/right=5/height=21 | Essential | maxlength=10, inputtype=digit,alpha | D-002 입력 |
| 141 | Static | stc_Static26 | 53 | left=0/top=444/right=0/height=29 | stc_WF_Box | "" | (D-016 라벨박스) |
| 142 | Edit | edt_pwd_reset | 54 | left=0/top=444/width=180/height=29 | edi_WF_Label | "비밀번호 초기화" (readonly) | D-016 라벨 |
| 143 | Radio | rdo_PwdReset | 17 | left=184/top=448/width=128/height=21 | - | innerdataset (Y/Yes,N/No), direction=vertical, index=1 (No) | D-016 입력 |
| 161 | Button | btn_PwdReset | 18 | top=448/right=5/width=100/height=22 | btn_topMenu | "비밀번호 초기화" | B-013 |
| 162 | Edit | edt_role_copy | 15 | left=184/top=420/right=110/height=21 | - | displaynulltext="USER_ID 입력" | D-017 입력 |
| 163 | Button | btn_RoleCopy | 16 | top=420/right=5/width=100/height=22 | btn_topMenu | "역할그룹등록" | B-014 |
| 164 | Static | stc_Static27 | 55 | left=0/top=472/right=0/height=29 | stc_WF_Box | "" | (D-018 라벨박스) |
| 165 | Edit | edt_pwd_reset00 | 56 | left=0/top=472/width=180/height=29 | edi_WF_Label | "SSO 초기화" (readonly) | D-018 라벨 |
| 166 | Button | btn_SSOPwdReset | 20 | top=476/right=5/width=100/height=22 | btn_topMenu | "SSO 초기화" | B-015 |
| 167 | Radio | rdo_SSOReset | 19 | left=184/top=476/width=128/height=21 | - | innerdataset (Y/Yes,N/No), direction=vertical, index=1 (No) | D-018 입력 |
| 185 | Edit | edt_st_infReqNo | 57 | left=0/top=500/width=180/height=29 | edi_WF_Label | "정보처리의뢰서번호" (readonly) | D-019 라벨 |
| 186 | Edit | edt_infReqNo | 58 | left=184/top=504/right=5/height=21 | - | maxlength=300 | D-019 입력 |
| 187 | Static | stc_Static29 | 60 | left=0/top=528/right=0/height=29 | stc_WF_Box | "" | (D-020 라벨박스) |
| 188 | Edit | edt_description | 61 | left=183/top=531/right=6/height=21 | - | maxlength=300 | D-020 입력 |
| 189 | Edit | edt_st_description | 62 | left=0/top=528/width=180/height=29 | edi_WF_Label | "처리사유" (readonly) | D-020 라벨 |
| 190 | Static | stc_Static30 | 63 | left=0/top=556/right=0/height=29 | stc_WF_Box | "" | (B-016 라벨박스) |
| 191 | Edit | edt_st_reRegister | 64 | left=0/top=556/width=180/height=29 | edi_WF_Label | "계정 재생성" (readonly) | B-016 라벨 |
| 192 | Button | btn_reRegister | 65 | top=559/left=183/right=6/height=23 | btn_topMenu | "계정 재생성" (enable=false) | B-016 |
| 199 | Div | div_roleGrpId | 2 | left=div_mainDetail:10/top=0/height=291/right=20 | - | text="div_roleGrpId" | A-MAIN-RIGHT-TOP |
| 202 | Grid | grd_userRolegrp | 0 | left=0/top=25/right=0/bottom=0 | - | binddataset=ds_userRolegrp, autofittype=col | GR-001~002 |
| 224 | Div | div_rightRole | 1 | top=0/height=21/right=0/width=130 | (font 12px) | (url commonRightButton.xfdl) | FX-004 |
| 228 | Div | div_roleGrpIdList | 3 | left=div_mainDetail:10/top=div_roleGrpId:10/right=20/bottom=0 | - | text="div_roleGrpId" (As-Is text 동일) | A-MAIN-RIGHT-BOT |
| 231 | Grid | grd_rolegrpList | 0 | left=0/top=25/right=0/bottom=0 | - | binddataset=ds_rolegrpList, autofittype=col, selecttype=multirow | GL-001~002 |
| 253 | Div | div_rightRoleList | 1 | top=0/height=21/right=0/width=130 | (font 12px) | (url commonRightButton.xfdl) | FX-005 |
| 260 | Div | div_title | 4 | left=20/top=0/right=20/height=40 | - | text="Div00" | A-TITLE |
| 263 | Edit | edt_title (in div_title) | 0 | left=0/top=10/width=250/height=27 | edi_WFHD_Title | "사용자 관리" (readonly) | A-TITLE 라벨 |
| 264 | Div | div_topMenu | 1 | left=270/right=0/top=10/height=27 | - | (url commonTopButton.xfdl) | FX-001 |
| 268 | Div | div_search | 1 | left=20/top=div_title:10/right=20/height=43 | div_WFSA_Box | text="Div00" | A-FILTER |
| 271 | Combo | cbo_IN_OUT_EMP_TP | 1 | left=370/top=10/width=80/height=21 | - | innerdataset=ds_inOutEmpTp, codecolumn=CD, datacolumn=NM, value="", index=-1 | S-003 |
| 272 | Edit | sts_useTp (in div_search) | 4 | left=cbo_IN_OUT_EMP_TP:20/top=10/width=70/height=21 | edi_WFSA_Label | "사용 여부" (readonly) | S-002 라벨 |
| 273 | Combo | cbo_USE_TP | 2 | left=sts_useTp:10/top=10/width=80/height=21 | - | innerdataset=ds_useTp, codecolumn=CD, datacolumn=NM, value="Y", text="Y", index=0 | S-002 |
| 274 | Edit | sts_userId | 3 | left=10/top=10/width=60/height=21 | edi_WFSA_Label | "사용자" (readonly) | S-001 라벨 |
| 275 | Edit | edt_USER_ID | 0 | left=sts_userId:10/top=10/width=160/height=21 | - | maxlength=100 | S-001 |
| 276 | Edit | sts_InOutTp | 5 | left=edt_USER_ID:20/top=10/width=100/height=21 | edi_WFSA_Label | "내부 외부 구분" (readonly) | S-003 라벨 |
| 280 | Div | div_deletePopup | 5 | left=415/top=270/width=470/height=273/visible=false | border=2px solid #D6e2ea | text="" | A-POPUP-DEL |
| 283 | Edit | edt_title (in div_deletePopup) | 0 | left=5/top=11/width=250/height=25 | edi_WFHD_Title | "계정삭제" (readonly) | DP-001 |
| 284 | Button | btn_close (in div_deletePopup) | 1 | right=178/bottom=15/width=65/height=25 | btn_WF_CustomM, btn_WF_Delete | "취소" | B-017 / DP-B-001 |
| 285 | Button | btn_save (in div_deletePopup) | 2 | right=btn_close:5/bottom=15/width=65/height=25 | btn_WF_Save | "확인" | B-018 / DP-B-002 |
| 286 | Div | div_search00 | 3 | left=5/top=50/bottom=58/right=5 | div_WFSA_Box | text="Div00" | (div_deletePopup 내부 컨테이너) |
| 289 | Edit | sts_useTp (in div_search00) | 0 | left=58/top=58/width=125/height=21 | edi_WFSA_Label | "유효개시기한일" (readonly) | DP-004 라벨 |
| 290 | Calendar | cal_end_active_date (in div_search00) | 1 | left=sts_useTp:10/top=58/right=53/height=21 | - | dateformat=yyyy-MM-dd | DP-004 입력 |
| 291 | Edit | sts_useTp00 (in div_search00) | 4 | left=58/top=sts_useTp:10/width=125/height=21 | edi_WFSA_Label | "정보처리의뢰서 번호" (readonly) | DP-005 라벨 |
| 292 | Edit | edt_infReqNo (in div_search00) | 2 | left=sts_useTp00:10/top=89/right=53/height=21 | - | maxlength=300 | DP-005 입력 |
| 293 | Edit | sts_useTp00_00 (in div_search00) | 5 | left=58/top=sts_useTp00:10/width=125/height=21 | edi_WFSA_Label | "처리사유" (readonly) | DP-006 라벨 |
| 294 | Edit | edt_description (in div_search00) | 3 | left=sts_useTp00_00:10/top=120/right=53/height=21 | - | maxlength=300 | DP-006 입력 |
| 295 | ImageViewer | img_MsgImg | 6 | left=63/top=7/width=40/height=40 | (border 0 none) | image="theme://images/img_msg_question.png" | DP-002 |
| 296 | Edit | sts_message | 7 | left=117/top=17/width=289/height=21 | edi_WFSA_Label | "계정을 삭제 하시겠습니까?" (readonly) | DP-003 |

> 위 §17.1 표는 xfdl Layout 본문 (xfdl:6~302) 의 **모든 인스턴스 1행씩 행 분해 (Form 외 Dataset / Bind / Script 제외)**. 총 컴포넌트 행 수 = 87 (Static 21 + Edit 35 + Calendar 3 + Combo 5 + Radio 2 + Button 9 + ImageViewer 1 + Grid 3 + Div 13 — Grid 내 Column/Cell/Band 분해 ✗).

### §17.2 그리드 컬럼 단위 1:1 전수 행 분해

#### §17.2.1 grd_main 컬럼 17 행

| col | head cell text | body cell bind / displaytype | size | band | edittype | 비고 | 근거 |
|---:|---|---|---:|---|---|---|---|
| 0 | 상태 | bind:STATUS / displaytype=imagecontrol | 48 | left | - | Nexacro auto row state | xfdl:19 / 42 / 61 |
| 1 | 사용자ID | bind:USER_ID / displaytype=normal | 117 | - | none | 기존 행 편집 불가 | xfdl:20 / 43 / 62 |
| 2 | 사번 | bind:USER_EMP_NO | 101 | - | - | - | xfdl:21 / 44 / 63 |
| 3 | SSO ID | bind:SSO_ID | 80 | - | - | - | xfdl:22 / 45 / 64 |
| 4 | 사용자명 | bind:USER_NM | 80 | - | - | - | xfdl:23 / 46 / 65 |
| 5 | 유효개시일 | bind:START_ACTIVE_DATE / displaytype=date / calendardateformat=yyyy-MM-dd | 80 | - | - | - | xfdl:24 / 47 / 66 |
| 6 | 유효기한일 | bind:END_ACTIVE_DATE / displaytype=date / calendardateformat=yyyy-MM-dd | 80 | - | - | - | xfdl:25 / 48 / 67 |
| 7 | 부서코드 | bind:DEPT_CD | 80 | - | - | - | xfdl:26 / 49 / 68 |
| 8 | 사용자분류코드 | bind:USER_CATEGORY_CD | 96 | - | - | - | xfdl:27 / 50 / 69 |
| 9 | 사용구분 | bind:USE_TP / displaytype=combotext / combodataset=ds_useTp / combocodecol=CD / combodatacol=NM | 71 | - | - | LV-001 | xfdl:28 / 51 / 70 |
| 10 | EMAIL | bind:EMAIL | 96 | - | - | - | xfdl:29 / 52 / 71 |
| 11 | 전화번호 | bind:TEL_NO | 96 | - | - | - | xfdl:30 / 53 / 72 |
| 12 | MOBILE번호 | bind:MOBILE_TEL_NO | 94 | - | - | - | xfdl:31 / 54 / 73 |
| 13 | 내부외부구분 | bind:IN_OUT_EMP_TP / displaytype=combotext / combodataset=ds_inOutEmpTp / combocodecol=CD / combodatacol=NM | 80 | - | - | LV-002 | xfdl:32 / 55 / 74 |
| 14 | GROUP ID1 | bind:GROUP_ID1 | 80 | - | - | - | xfdl:33 / 56 / 75 |
| 15 | GROUP ID2 | bind:GROUP_ID2 | 80 | - | - | - | xfdl:34 / 57 / 76 |
| 16 | GROUP ID3 | bind:GROUP_ID3 | 80 | - | - | - | xfdl:35 / 58 / 77 |

#### §17.2.2 grd_userRolegrp 컬럼 2 행

| col | head cell text | body cell bind | size | autofittype | 근거 |
|---:|---|---|---:|---|---|
| 0 | 역할 그룹 ID | bind:ROLE_GROUP_ID | 120 | col | xfdl:206 / 214 / 218 |
| 1 | 역할 그룹명 | bind:ROLE_GROUP_NM | 166 | col | xfdl:207 / 215 / 219 |

#### §17.2.3 grd_rolegrpList 컬럼 2 행

| col | head cell text | body cell bind | size | autofittype / selecttype | 근거 |
|---:|---|---|---:|---|---|
| 0 | 역할 그룹 ID | bind:ROLE_GROUP_ID | 114 | col / multirow | xfdl:235 / 243 / 247 |
| 1 | 역할 그룹명 | bind:ROLE_GROUP_NM | 172 | col / multirow | xfdl:236 / 244 / 248 |

### §17.3 ds_main 컬럼 단위 19 행

| col | column id | type | size | 근거 |
|---:|---|---|---:|---|
| 0 | USER_ID | STRING | 256 | xfdl:308 |
| 1 | USER_EMP_NO | STRING | 256 | xfdl:309 |
| 2 | SSO_ID | STRING | 256 | xfdl:310 |
| 3 | USER_NM | STRING | 256 | xfdl:311 |
| 4 | START_ACTIVE_DATE | STRING | 256 | xfdl:312 |
| 5 | END_ACTIVE_DATE | STRING | 256 | xfdl:313 |
| 6 | DEPT_CD | STRING | 256 | xfdl:314 |
| 7 | USER_CATEGORY_CD | STRING | 256 | xfdl:315 |
| 8 | USE_TP | STRING | 256 | xfdl:316 |
| 9 | EMAIL | STRING | 256 | xfdl:317 |
| 10 | TEL_NO | STRING | 256 | xfdl:318 |
| 11 | MOBILE_TEL_NO | STRING | 256 | xfdl:319 |
| 12 | IN_OUT_EMP_TP | STRING | 256 | xfdl:320 |
| 13 | GROUP_ID1 | STRING | 256 | xfdl:321 |
| 14 | GROUP_ID2 | STRING | 256 | xfdl:322 |
| 15 | GROUP_ID3 | STRING | 256 | xfdl:323 |
| 16 | DEPT_NM | STRING | 256 | xfdl:324 |
| 17 | INF_REQ_NO | STRING | 256 | xfdl:325 |
| 18 | DESCRIPTION | STRING | 256 | xfdl:326 |

### §17.4 Mapper.xml SQL ID — 본문 컬럼 1:1 전수 (selectCommUser / insertCommUser / updateCommUser)

#### §17.4.1 selectCommUser SELECT 컬럼 17 행

| # | 컬럼 | 의미 | 근거 |
|---:|---|---|---|
| 1 | USER_ID | 사용자 ID (PK) | xml:8 |
| 2 | USER_EMP_NO | 사번 | xml:9 |
| 3 | SSO_ID | SSO ID | xml:10 |
| 4 | USER_NM | 사용자명 | xml:11 |
| 5 | START_ACTIVE_DATE | 유효개시일 | xml:12 |
| 6 | END_ACTIVE_DATE | 유효기한일 | xml:13 |
| 7 | DEPT_CD | 부서코드 | xml:14 |
| 8 | USER_CATEGORY_CD | 사용자분류코드 | xml:15 |
| 9 | USE_TP | 사용여부 | xml:16 |
| 10 | EMAIL | 이메일 | xml:17 |
| 11 | TEL_NO | 전화번호 | xml:18 |
| 12 | MOBILE_TEL_NO | 모바일번호 | xml:19 |
| 13 | IN_OUT_EMP_TP | 내부외부구분 | xml:20 |
| 14 | GROUP_ID1 | 사용자 그룹1 | xml:21 |
| 15 | GROUP_ID2 | 사용자 그룹2 | xml:22 |
| 16 | GROUP_ID3 | 사용자 그룹3 | xml:23 |
| 17 | DEPT_NM (scalar subquery from EAIUSER.IF_DSHRMMCMHD02 WHERE CD_V = DEPT_CD) | 부서명 (외부 EAI) | xml:24 |

#### §17.4.2 insertCommUser INSERT 컬럼 16 행 + ref_Audit

| # | 컬럼 | 값 | 근거 |
|---:|---|---|---|
| 1 | USER_ID | #{USER_ID} | xml:71 / 90 |
| 2 | USER_EMP_NO | #{USER_EMP_NO} | xml:72 / 91 |
| 3 | SSO_ID | #{SSO_ID} | xml:73 / 92 |
| 4 | USER_NM | #{USER_NM} | xml:74 / 93 |
| 5 | START_ACTIVE_DATE | #{START_ACTIVE_DATE} | xml:75 / 94 |
| 6 | END_ACTIVE_DATE | #{END_ACTIVE_DATE} | xml:76 / 95 |
| 7 | DEPT_CD | #{DEPT_CD} | xml:77 / 96 |
| 8 | USER_CATEGORY_CD | #{USER_CATEGORY_CD} | xml:78 / 97 |
| 9 | USE_TP | #{USE_TP} | xml:79 / 98 |
| 10 | EMAIL | #{EMAIL} | xml:80 / 99 |
| 11 | TEL_NO | #{TEL_NO} | xml:81 / 100 |
| 12 | MOBILE_TEL_NO | #{MOBILE_TEL_NO} | xml:82 / 101 |
| 13 | IN_OUT_EMP_TP | #{IN_OUT_EMP_TP} | xml:83 / 102 |
| 14 | GROUP_ID1 | #{GROUP_ID1} | xml:84 / 103 |
| 15 | GROUP_ID2 | #{GROUP_ID2} | xml:85 / 104 |
| 16 | GROUP_ID3 | #{GROUP_ID3} | xml:86 / 105 |
| 17 | ref_Audit.insert_item / insert_value | (audit 9 컬럼) | xml:87 / 106 |

#### §17.4.3 updateCommUser UPDATE 컬럼 12 행 (USER_ID + USE_TP 제외) + ref_Audit

| # | 컬럼 | 값 | 근거 |
|---:|---|---|---|
| 1 | USER_EMP_NO | #{USER_EMP_NO} | xml:112 |
| 2 | SSO_ID | #{SSO_ID} | xml:113 |
| 3 | USER_NM | #{USER_NM} | xml:114 |
| 4 | START_ACTIVE_DATE | #{START_ACTIVE_DATE} | xml:115 |
| 5 | END_ACTIVE_DATE | #{END_ACTIVE_DATE} | xml:116 |
| 6 | DEPT_CD | #{DEPT_CD} | xml:117 |
| 7 | USER_CATEGORY_CD | #{USER_CATEGORY_CD} | xml:118 |
| 8 | EMAIL | #{EMAIL} | xml:120 |
| 9 | TEL_NO | #{TEL_NO} | xml:121 |
| 10 | MOBILE_TEL_NO | #{MOBILE_TEL_NO} | xml:122 |
| 11 | GROUP_ID1 | #{GROUP_ID1} | xml:123 |
| 12 | GROUP_ID2 | #{GROUP_ID2} | xml:124 |
| 13 | GROUP_ID3 | #{GROUP_ID3} | xml:125 |
| 14 | ref_Audit.update | (audit 5 컬럼) | xml:126 |

> updateCommUser 의 본문 12 행 + GROUP_ID3 (13 컬럼). USER_ID (PK, WHERE 절) + USE_TP (재생성 전용) 미포함 — As-Is 보존.

#### §17.4.4 selectCommUserRoleGrp SELECT 컬럼 3 행

| # | 컬럼 | 의미 | 근거 |
|---:|---|---|---|
| 1 | A.USER_ID | 사용자 ID | xml:153 |
| 2 | A.ROLE_GROUP_ID | 역할 그룹 ID | xml:154 |
| 3 | B.ROLE_GROUP_NM | 역할 그룹명 (TB_MCM_SEC_ROLEGROUP JOIN) | xml:155 |

#### §17.4.5 selectCommRoleGrpList SELECT 컬럼 2 행

| # | 컬럼 | 의미 | 근거 |
|---:|---|---|---|
| 1 | A.ROLE_GROUP_ID | 역할 그룹 ID | xml:183 |
| 2 | A.ROLE_GROUP_NM | 역할 그룹명 | xml:184 |

#### §17.4.6 selectCommDept SELECT 컬럼 2 행

| # | 컬럼 | 의미 | 근거 |
|---:|---|---|---|
| 1 | CD_V AS DEPT_CD | 부서코드 (EAI CD_V) | xml:253 |
| 2 | CD_V_MEANING AS DEPT_NM | 부서명 (EAI CD_V_MEANING) | xml:254 |

#### §17.4.7 selectRoleMergeObject SELECT 컬럼 3 행

| # | 컬럼 | 의미 | 근거 |
|---:|---|---|---|
| 1 | A.USER_ID | 복사 대상 사용자 (USER_ID_COPY) | xml:267 |
| 2 | A.ROLE_GROUP_ID | 복사 대상 역할 그룹 (붙여넣을 USER_ID 에 없는 것만 NOT IN) | xml:268 |
| 3 | (SELECT ROLE_GROUP_NM FROM TB_MCM_SEC_ROLEGROUP WHERE ROLE_GROUP_ID = A.ROLE_GROUP_ID) AS ROLE_GROUP_NM | 역할 그룹명 (scalar subquery) | xml:269 |

### §17.5 BPMN UserTask camunda:class 매핑 7 행

| # | userTask id | name | class (#{basePackage}…) | sourceFlow | targetFlow | 근거 |
|---:|---|---|---|---|---|---|
| 1 | UserTask_1opm8fa | 사용자 정보 저장 | SaveCommUserMng | SequenceFlow_0grwghu (saveCmUser) | SequenceFlow_19ojhvj → EndEvent_1 | bpmn:116~126 |
| 2 | UserTask_pwdinit | 패스워드 초기화 | PasswordInit | SequenceFlow_0eh8isc (pwdinit) | SequenceFlow_0v64ch1 → EndEvent_1 | bpmn:105~115 |
| 3 | RegCommUserMng | 사용자 계정 생성 | RegCommUserMng | SequenceFlow_1944t12 (regCmUser) | SequenceFlow_1766mr8 → EndEvent_1 | bpmn:176~185 |
| 4 | DeleteCommUserMng | 사용자 계정 삭제 | DeleteCommUserMng | SequenceFlow_0hchiuv (deleteCmUser) | SequenceFlow_0g8pzip → EndEvent_1 | bpmn:186~195 |
| 5 | SaveRoleGroupHis | 사용자 ROLE 그룹 수정 이력 저장 | SaveRoleGroupHis | SequenceFlow_saveUserRoleGrp | SequenceFlow_05p4q2h → Task_saveUserRoleGrp | bpmn:200~209 |
| 6 | SaveRoleGroupCopyHis | 사용자 ROLE 그룹 수정 이력 저장 | SaveRoleGroupCopyHis | SequenceFlow_1gwazq0 (saveUserRoleGrpCopy) | SequenceFlow_01hi7kv → Task_0v3mxy0 | bpmn:212~221 |
| 7 | UserTask_128zs8e | 사용자 계정 재생성 | ReRegCommUserMng | SequenceFlow_07aq563 (reRegCmUser) | SequenceFlow_0l2kcue → EndEvent_1 | bpmn:224~233 |

### §17.6 BPMN Task (CommonDbTask) camunda:class / sqlKey 매핑 8 행

| # | task id | name | class | sqlKey | resultKey / paramKey | sourceFlow | targetFlow | 근거 |
|---:|---|---|---|---|---|---|---|---|
| 1 | Task_searchCmUser | 사용자 정보 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUser | ds_main / "" | SequenceFlow_0tt1mbk | SequenceFlow_105vwsz → Task_0970821 | bpmn:39~52 |
| 2 | Task_0970821 | 사용자 정보 전체 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserAll | ds_mainAll / "" | SequenceFlow_105vwsz | SequenceFlow_0alv1bb → EndEvent_1 | bpmn:127~142 |
| 3 | Task_searchUserRoleGrp | 사용자 ROLE 그룹 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserRoleGrp | ds_userRolegrp / - | SequenceFlow_0bb4b1a | SequenceFlow_0e90wtm → EndEvent_1 | bpmn:54~67 |
| 4 | Task_searchRoleGrp | ROLE 그룹 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommRoleGrpList | ds_rolegrpList / - | SequenceFlow_searchRoleGrp | SequenceFlow_07entyn → EndEvent_1 | bpmn:87~100 |
| 5 | Task_saveUserRoleGrp | 사용자 ROLE 그룹 저장 | commonDbTask.CommonMultiSaveTask | insertSqlKey=#{serviceId}Mapper.insertCommUserRoleGrp / deleteSqlKey=#{serviceId}Mapper.deleteCommUserRoleGrp / updateSqlKey="" | ds_userRolegrp / ds_userRolegrp | SequenceFlow_05p4q2h | SequenceFlow_1c1ioow → EndEvent_1 | bpmn:70~86 |
| 6 | Task_0v3mxy0 | ROLE 그룹 복사 | commonDbTask.CommonInsertTask | #{serviceId}Mapper.mergeCommonCopyRoleGrp | ds_userRolegrp / - | SequenceFlow_01hi7kv | SequenceFlow_15dc55q → EndEvent_1 | bpmn:143~157 |
| 7 | Task_1tti6qu | 부서 팝업 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommDept | ds_userDept / - | SequenceFlow_0ugd21v | SequenceFlow_0ssupae → EndEvent_1 | bpmn:159~173 |

> Task 합계 = 7 (사용자 입력 메타의 "Task 8" 과 1 차이는 사용자 메타의 Task_0v3mxy0 (mergeCommonCopyRoleGrp) 가 CommonInsertTask 라 별도 분류 시 7+1=8 — 본 §17.6 은 6 SelectTask + 1 MultiSaveTask + 1 InsertTask = 8 행 — 사용자 메타 일치).

---

## §18. As-Is 보존 결정 누적

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 18-1 | 11 BPMN action enum (사용자 입력 메타의 "6 enum" 대신 As-Is 11 enum 보존) | As-Is 11 enum 1:1 보존 | xfdl 11 sSvcId + BPMN gateway outgoing 11 |
| 18-2 | 미사용 SQL 6 종 (selectCommUserForSave / deleteCommUser / deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit) | As-Is 보존 + To-Be 제거 후보 (Q-003) | xml + Java 호출 grep |
| 18-3 | "역활" / "div_buttom" 오타 | As-Is 보존 + To-Be 정정 후보 (Q-006 / Q-007) | xfdl 3 / 1 hits |
| 18-4 | SaveCommUserMng.java 의 inserted/deleted 분기 주석 | As-Is 보존 + To-Be 폐기 후보 (Q-009) | java:42~57 / 68~83 |
| 18-5 | div_deletePopup 모달 방식 (Form 내부 Div + visible toggle) | As-Is 보존 + To-Be Modal 컴포넌트 변환 (T-020) | xfdl:280~302 |
| 18-6 | div_dept_cd `commonDynamic.xfdl` 부서 팝업 | As-Is 보존 + To-Be SelectModal / Autocomplete (T-016) | xfdl:129 / 421~435 |
| 18-7 | `EAIUSER.IF_DSHRMMCMHD02` 외부 EAI 테이블 | As-Is 보존 + To-Be 연계 방식 결정 (Q-002) | xml:24 / 255 |
| 18-8 | `MCMAPUSER.TB_MCM_*` 스키마 prefix | As-Is 보존 + To-Be sample_dmes 스키마 결정 (Q-011) | xml:204 / 228 |
| 18-9 | `ref_Audit` fragment 13 회 include | As-Is 보존 + To-Be cactus-core `CactusAuditEntity` 자동 처리 (T-009) | xml grep 13 hits |
| 18-10 | nexacro WebBrowser RSA pwChg.html | As-Is 보존 + To-Be 별도 페이지 신규 설계 (Q-013 / T-012) | xfdl:654~740 |
| 18-11 | DMES 테이블 정의서 6 시트 직접 추출 (Q-001 해소) | DMES xlsx 직접 추출 완료 (2026-05-30) — §9.1 신설 / 154 컬럼 1:1 등재 | DMES-SECTION-MCM_테이블정의서.xlsx sheet rId94/rId99/rId102/rId90/rId98/rId105 |
| 18-12 | xfdl:825 `nErrorCode.DEPT_CD` (Q-008 해소) | As-Is 결함 (2번째 인자 number 에 객체 프로퍼티 접근) — `libTran.xjs:287/362/394` 추적 결과 사용자 콜백 3번째 인자 `resultMsg = JSON.parse(errorMsg)` 객체. To-Be `strErrorMsg.DEPT_CD` 정정 권장 | libTran.xjs:287/362/394 + CommUserMng.xfdl:825 |
| 18-13 | (2026-05-31 일괄) 6 정책 결정 본문 반영 — 정책 #1/#2/#3/#4/#6 + Q-002 / Q-003 / Q-004 / Q-005 / Q-006 / Q-007 / Q-009 / Q-010 / Q-011 / Q-012 / Q-013 / Q-014 / Q-015 13건 해소 | 정책 #1 (APP_HOST/BIZ_SYSTEM_CODE 폐기 + mcm-core 보존 + cma 정본 + schema=MCMAPUSER + `mcm.entity.*` + `mcm.csa.commUserMng.{service\|dto}` + JPA only + McmAuditEntity) / 정책 #2 (EAI → TB_MCM_DEPT_INFO 신설) / 정책 #3 (12 항목 — A 오타 / B 폐기 SQL / C 외부 namespace Entity 흡수 / D 빈 콤보 미반영 / E roleSearch+STATUS 자연 흡수 / F yml 외부화 + 신규 페이지 / G PortalShell+RBAC / H schema 보존) / 정책 #4 (As-Is/To-Be 표준 우선) / 정책 #6 (Entity 직역) | §11.0 + §11.1 + §11.2 + §12 + §6 + §9.1.7 |
