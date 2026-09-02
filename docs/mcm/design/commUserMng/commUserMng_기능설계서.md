---
screenId: commUserMng
asIsId: CommUserMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# mcm — 사용자 관리 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `commUserMng_분석리포트.md` 의 §1~§18 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑.
> **2026-05-31 갱신**: 분석 §11 6 정책 결정 반영 (Q 13건 해소 / 활성 = 0). 본 기능설계서는 분석 §11.0 P-1~P-6-A 일괄 인용 + §6 SQL 변환점 + LV-005/LV-006 갱신 인용. 정책 #4 (0) **As-Is/To-Be 표준 우선 원칙** 적용.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | 사용자 관리 |
| **화면 식별자** | commUserMng |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 시스템 사용자 마스터 (TB_MCM_SEC_USER) 의 조회·계정생성·수정·논리삭제 (END_ACTIVE_DATE 마감)·계정 재생성, 사용자 보유 역할그룹 (TB_MCM_SEC_USER_MAPPING) 의 추가·삭제·복사, 비밀번호 / SSO 비밀번호 초기화를 단일 화면에서 처리한다. 본 화면이 등록한 사용자 ID 가 전사 모든 시스템의 인증·권한 기준점이다. |
| **주요 사용자** | 시스템 관리자 / 보안 관리자 / IT 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommUserMng |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 관리 (commUserMng) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commUserMng | 01 A.3 / A.4.1 (camelCase `{화면명}`) |
| pageName | commUserMng | 01 A.4.2 (MES: = screenId) |
| pageId | commUserMng | 01 A.4.3 (MES: = screenId) |
| serviceId | commUserMng | 01 A.4.4 |
| 페이지 유형 | **D 다중 그리드 + 상세 폼** (G + GR + GL 동시 존재 + 상세 D-NNN 20 + 팝업 모달 1) | 분석 §3 (G-017 + GR-002 + GL-002 + D-020 + DP-006) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commUserMng/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commUserMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commUserMng.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commUserMng` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:260) | 화면명 "사용자 관리" + 공통 topMenu (커스텀 btn_register/btn_delete + 기본 btn_search/btn_modify/btn_close) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:268) | 사용자 / 사용 여부 / 내부 외부 구분 |
| A-FOLD | 접기 토글 | `btn_fold` (xfdl:7) | div_search 접기/펴기 |
| A-MAIN-LEFT (= A-GRID) | 메인 그리드 영역 | `div_mainGrd` (xfdl:11) | G-001~G-017 + commonLeftButton (chk_check / btn_sum / btn_copyPaste) + commonRightButton (btn_rowAdd / btn_rowCancel) + edt_srch_cseq "조회 결과" 라벨 |
| A-MAIN-CENTER (= A-DETAIL) | 사용자 상세 입력 영역 | `div_mainDetail.div_detail` (xfdl:87 / 90) | D-001~D-020 + btn_PwdReset / btn_RoleCopy / btn_SSOPwdReset / btn_reRegister |
| A-MAIN-RIGHT-TOP (= A-GR) | 보유 역할그룹 그리드 | `div_roleGrpId` (xfdl:199) | GR-001~GR-002 + commonRightButton (btn_rolDel / btn_rolSave) |
| A-MAIN-RIGHT-BOT (= A-GL) | 추가 가능 역할그룹 목록 | `div_roleGrpIdList` (xfdl:228) | GL-001~GL-002 + commonRightButton (btn_rolAdd / btn_rolSearch) |
| A-POPUP-DEL | 계정삭제 모달 | `div_deletePopup` (xfdl:280) | DP-001~DP-006 + btn_close / btn_save (As-Is Form 내부 Div 모달) |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:6) | commonBottomStatus.xfdl include |

> 본 화면은 표준 5 영역 + A-TITLE / A-FOOTER 추가 + A-MAIN-RIGHT 2 단 (TOP/BOT) + A-POPUP-DEL (Form 내부 모달). 총 10 영역.

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (3 행) | ✓ |
| 입력 방식 enum (5값) | TextBox 1 + Combo 2 | ✓ |

| 필드ID | DB 컬럼명 (mapper param) | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | edt_USER_ID (mapper `#{edt_USER_ID}`) | 사용자 | TextBox | N | (없음) | USER_ID / USER_EMP_NO / USER_NM 3 컬럼 UPPER LIKE OR 조건 (xml:27~31), maxlength=100 |
| S-002 | cbo_USE_TP (mapper `#{cbo_USE_TP}`) | 사용 여부 | Combo (LV-001 ds_useTp Y/N) | N | "Y" (index=0) | USE_TP = #{cbo_USE_TP} (xml:32~34) |
| S-003 | cbo_IN_OUT_EMP_TP (mapper `#{cbo_IN_OUT_EMP_TP}`) | 내부 외부 구분 | Combo (LV-002 ds_inOutEmpTp I/O) | N | "" (index=-1, 미선택) | IN_OUT_EMP_TP = #{cbo_IN_OUT_EMP_TP} (xml:35~37) |

### 3.2 조회 결과 (G-NNN 메인 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 (17 행) | ✓ |
| 표시명 1 enum 매칭 | 한글 + 약어 (SSO ID / EMAIL / GROUP ID1~3 / MOBILE번호) | ✓ |

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 (분기) | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | Nexacro auto row state 아이콘 (To-Be FE 동일 row state 구현 결정 Q-014) | Center | imagecontrol | N | - |
| G-002 | USER_ID | 사용자ID | 사용자 ID (PK) | Left | normal | edittype=none (기존 행 편집 불가) | Y (Detail 폼 D-001 Essential) |
| G-003 | USER_EMP_NO | 사번 | 사번 (Detail 폼 D-002 Essential, maxlength=10, digit+alpha) | Left | - | Y | Y |
| G-004 | SSO_ID | SSO ID | SSO ID | Left | - | Y | N |
| G-005 | USER_NM | 사용자명 | 사용자명 (Detail 폼 D-004 Essential, maxlength=90) | Left | - | Y | Y |
| G-006 | START_ACTIVE_DATE | 유효개시일 | 계정 유효개시일 | Center | date (yyyy-MM-dd) | Y | - |
| G-007 | END_ACTIVE_DATE | 유효기한일 | 계정 유효기한일 (논리삭제 마감일) | Center | date (yyyy-MM-dd) | Y | - |
| G-008 | DEPT_CD | 부서코드 | 부서코드 (**To-Be `MCMAPUSER.TB_MCM_DEPT_INFO` LoV — 정책 #2 / Q-002 해소**. Detail 폼 D-007 Essential, To-Be SelectModal/Autocomplete — T-016) | Left | - | Y | Y |
| G-009 | USER_CATEGORY_CD | 사용자분류코드 | 사용자 분류 코드 | Left | - | Y | N |
| G-010 | USE_TP | 사용구분 | 사용 여부 (Y/N) | Center | combotext (LV-001 ds_useTp) | Y (combo) | - |
| G-011 | EMAIL | EMAIL | 이메일 (Detail 폼 D-009 Essential 라벨, maxlength=300) | Left | - | Y | Y |
| G-012 | TEL_NO | 전화번호 | 전화번호 (maxlength=90, digit) | Left | - | Y | - |
| G-013 | MOBILE_TEL_NO | MOBILE번호 | 모바일 번호 (maxlength=90, digit) | Left | - | Y | - |
| G-014 | IN_OUT_EMP_TP | 내부외부구분 | 내부/외부 구분 (Detail 폼 D-012 Essential) | Center | combotext (LV-002 ds_inOutEmpTp) | Y (combo) | Y |
| G-015 | GROUP_ID1 | GROUP ID1 | 사용자 그룹1 (As-Is bind 보존 — 그리드 노출은 유지. **To-Be Detail 콤보 D-013 자체 제거 (정책 #3 (D) / Q-005 해소 / T-025)**) | Left | - | Y | - |
| G-016 | GROUP_ID2 | GROUP ID2 | 사용자 그룹2 (As-Is bind 보존 — **To-Be Detail 콤보 D-014 자체 제거**) | Left | - | Y | - |
| G-017 | GROUP_ID3 | GROUP ID3 | 사용자 그룹3 (As-Is bind 보존 — **To-Be Detail 콤보 D-015 자체 제거**) | Left | - | Y | - |

**확장/서브 그리드 1 (GR-NNN) — 보유 역할그룹 그리드 (분석 §3.4 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GR-001 | ROLE_GROUP_ID | 역할 그룹 ID | 보유 역할 그룹 ID (TB_MCM_SEC_USER_MAPPING JOIN) | Left | ds_userRolegrp, autofittype=col, size=120 |
| GR-002 | ROLE_GROUP_NM | 역할 그룹명 | 보유 역할 그룹명 (TB_MCM_SEC_ROLEGROUP scalar) | Left | size=166 |

**확장/서브 그리드 2 (GL-NNN) — 추가 가능 역할그룹 목록 (분석 §3.5 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GL-001 | ROLE_GROUP_ID | 역할 그룹 ID | 추가 가능 역할 그룹 (사용자 미보유 + 활성) | Left | ds_rolegrpList, selecttype=multirow, autofittype=col, size=114 |
| GL-002 | ROLE_GROUP_NM | 역할 그룹명 | 추가 가능 역할 그룹명 | Left | size=172 |

### 3.3 코드값 표시 변환 (분석 §9 인용)

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| USE_TP | LV-001 (xfdl `ds_useTp` 정적 Y/Yes, N/No) | Y → "Yes" / N → "No" |
| IN_OUT_EMP_TP | LV-002 (xfdl `ds_inOutEmpTp` 정적 I/내부, O/외부) | I → "내부" / O → "외부" |
| DEPT_CD | LV-005 (Mapper `selectCommDept` — **To-Be `MCMAPUSER.TB_MCM_DEPT_INFO` 동적 — 정책 #2 / Q-002 해소**) | "0001" → "전산실" (예) |
| ROLE_GROUP_ID | LV-007 (Mapper `selectCommRoleGrpList` — TB_MCM_SEC_ROLEGROUP 동적) | "ADMIN" → "관리자" (예) |
| ~~GROUP_ID1~3 (D-013~015)~~ | ~~LV-006~~ | **(정책 #3 (D) / Q-005 해소)** To-Be FE Detail 콤보 D-013~015 자체 제거. ds_main 컬럼 GROUP_ID1~3 은 TB_MCM_SEC_USER 카탈로그 (§9.1.1 #14~16) 에 보존만 |
| rdo_PwdReset / rdo_SSOReset | LV-003 / LV-004 (xfdl Radio inner 정적 Y/Yes, N/No) | - |

---

## 4. 상세 영역 필드 정의 (영역: A-MAIN-CENTER / A-DETAIL — 분석 §3.6 인용)

### 4.1 상세 필드 (D-NNN)

> div_mainDetail.div_detail 의 top=25 / bottom=-20 영역. 좌측 라벨 박스 (Static cssclass=stc_WF_Box + Edit value/text 라벨 readonly) + 우측 입력 (cssclass=Essential 은 필수).

| 필드ID | DB 컬럼명 (ds_main bind) | 화면 표시명 | 입력 방식 | maxlength | 필수 | 비고 |
|---|---|---|---|---:|---|---|
| D-001 | USER_ID | 사용자ID | TextBox (Essential) | 90 | Y | inputtype=normal, onchanged=rdo 리셋 (xfdl:1398). 기존 row 선택 시 readonly true (xfdl:1211) |
| D-002 | USER_EMP_NO | 사원 번호 | TextBox (Essential) | 10 | Y | inputtype=digit,alpha |
| D-003 | SSO_ID | SSO ID | TextBox | 90 | N | inputtype=digit,alpha, displaynulltext="UNI DOS 연동" |
| D-004 | USER_NM | 사용자명 | TextBox (Essential) | 90 | Y | - |
| D-005 | START_ACTIVE_DATE | 유효개시일 | Calendar | - | - | dateformat=yyyy-MM-dd, rowAdd 기본값 = today (xfdl:862) |
| D-006 | END_ACTIVE_DATE | 유효개시기한일 | Calendar | - | - | dateformat=yyyy-MM-dd, rowAdd 기본값 = "99991231" (xfdl:863) |
| D-007 | DEPT_CD | 부서코드 | Div (commonDynamic — 부서 팝업) (Essential) | - | Y | service=commonUserDept, URL=csa::CommUserMng, dataset=ds_userDept, cond=edt_DEPT_CD. **To-Be SelectModal/Autocomplete (T-016) + 출처 `MCMAPUSER.TB_MCM_DEPT_INFO` (정책 #2 / Q-002 해소)** |
| D-008 | USER_CATEGORY_CD | 사용자분류코드 | TextBox | - | N | - |
| D-009 | EMAIL | 이메일 | TextBox | 300 | Y (라벨 cssclass=edi_WF_LabelE = Essential) | - |
| D-010 | TEL_NO | 전화 번호 | TextBox | 90 | N | inputtype=digit, onchanged=edtTelNo_onchanged (본문 미확인) |
| D-011 | MOBILE_TEL_NO | 모바일번호 | TextBox | 90 | N | inputtype=digit |
| D-012 | IN_OUT_EMP_TP | 내부 외부 구분 | Combo (Essential) | - | Y | innerdataset=ds_inOutEmpTp (LV-002), codecolumn=CD, datacolumn=NM |
| ~~D-013~~ | ~~GROUP_ID1~~ | ~~사용자 그룹1~~ | ~~Combo~~ | ~~-~~ | ~~N~~ | ~~innerdataset=""~~ | **As-Is 보존 + To-Be 신규 UI 미반영 (정책 #3 (D) / Q-005 해소 / T-025) — FE 컴포넌트에서 콤보 자체 제거. DB 컬럼 GROUP_ID1 은 TB_MCM_SEC_USER 카탈로그 §9.1.1 #14 보존만** |
| ~~D-014~~ | ~~GROUP_ID2~~ | ~~사용자 그룹2~~ | ~~Combo~~ | ~~-~~ | ~~N~~ | ~~(D-013 동일 미설정)~~ | **As-Is 보존 + To-Be 미반영 (정책 #3 (D))** |
| ~~D-015~~ | ~~GROUP_ID3~~ | ~~사용자 그룹3~~ | ~~Combo~~ | ~~-~~ | ~~N~~ | ~~(동일)~~ | **As-Is 보존 + To-Be 미반영 (정책 #3 (D))** |
| D-016 | (script `ssoReset`) | 비밀번호 초기화 | Radio | - | - | innerdataset (Y/Yes, N/No, index=1=No 기본) — B-013 btn_PwdReset 결합 |
| D-017 | (script `edt_role_copy`) | 사용자 역할그룹 복사 | TextBox | - | - | displaynulltext="USER_ID 입력" — B-014 btn_RoleCopy 결합 |
| D-018 | (script `ssoReset`) | SSO 초기화 | Radio | - | - | innerdataset (Y/Yes, N/No, index=1=No 기본) — B-015 btn_SSOPwdReset 결합 |
| D-019 | INF_REQ_NO | 정보처리의뢰서번호 | TextBox | 300 | N | 저장 시 ds_main 으로 setColumn (xfdl:588) |
| D-020 | DESCRIPTION | 처리사유 | TextBox | 300 | N | 저장 시 ds_main 으로 setColumn (xfdl:589) |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인) ✗. 본 화면의 서브 그리드는 GR (보유 역할) + GL (추가 가능 역할) 2 종 + Master/Detail 관계 ✗ (사용자 ↔ 역할은 N:M 매핑).

### 4.3 팝업 내부 필드 (DP-NNN — A-POPUP-DEL 계정삭제 모달)

| 필드ID | 화면 표시명 | 입력 방식 | maxlength | 기본값 | 비고 |
|---|---|---|---:|---|---|
| DP-001 | (타이틀) "계정삭제" | Static (Edit readonly) | - | "계정삭제" | xfdl:283 |
| DP-002 | (이미지) | ImageViewer (img_msg_question.png) | - | - | xfdl:295 |
| DP-003 | 메시지 텍스트 | Static (script 동적 갱신 "{USER_ID} 계정을 삭제하시겠습니까?") | - | "계정을 삭제 하시겠습니까?" | xfdl:296 / 1155 |
| DP-004 | 유효개시기한일 | Calendar | - | open 시 today (xfdl:1156) | dateformat=yyyy-MM-dd |
| DP-005 | 정보처리의뢰서 번호 | TextBox | 300 | open 시 div_detail.edt_infReqNo 복사 (xfdl:1157) | - |
| DP-006 | 처리사유 | TextBox | 300 | open 시 div_detail.edt_description 복사 (xfdl:1158) | - |

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용 18 행)

| 버튼ID | 버튼명 | 위치 | To-Be action (11 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 계정생성 | div_title topMenu (커스텀) | regCmUser | `fn_register` (xfdl:996) → V-101~108 검증 후 `fn_run("regCmUser")` |
| B-002 | 계정삭제 | div_title topMenu (커스텀) | (popup) → deleteCmUser | `fn_delete` (xfdl:1073) → V-201~207 검증 후 div_deletePopup 표시 (set_visible=true) |
| B-003 | (기본) 조회 | div_title topMenu | searchCmUser | `fn_search` (xfdl:846) → `fn_run("searchCmUser")` |
| B-004 | (기본) 수정 | div_title topMenu | saveCmUser | `fn_modify` (xfdl:892) → V-001~007 검증 후 `fn_run("saveCmUser")` |
| B-005 | (기본) 닫기 | div_title topMenu | - (클라이언트 전용) | `fn_close` (xfdl:1192) → `gv_AppTabPath.fn_closeForm()` |
| B-006 | (접기) | div_search 상단 | - (클라이언트 전용) | `btn_fold_onclick` → `gfn_fold(this, div_search, div_main, btn_fold)` |
| B-007 | 선택체크 / 합계 / 복사붙여넣기 | div_mainGrd commonLeftButton | - (외부 공통) | chk_check / btn_sum / btn_copyPaste (외부 정의) |
| B-008 | 행추가 / 행취소 | div_mainGrd commonRightButton | - (클라이언트 전용) | `fn_rowAdd` (xfdl:857) — addRow + USE_TP=Y/START_ACTIVE_DATE=today/END_ACTIVE_DATE=99991231 / `fn_rowCancel` (xfdl:888) — `gfn_grdInit(grd_main)` |
| B-009 | 역할삭제 | div_roleGrpId commonRightButton (커스텀) | - (클라이언트 전용) | `fn_rolDel` (xfdl:1377) — `gfn_deleteRow(ds_userRolegrp, rowposition)` |
| B-010 | 역할저장 | div_roleGrpId commonRightButton (커스텀) | saveUserRoleGrp | `fn_rolSave` (xfdl:1303) → confirm → `fn_run("saveUserRoleGrp")` |
| B-011 | 역할추가 | div_roleGrpIdList commonRightButton (커스텀) | - (클라이언트 전용) | `fn_rolAdd` (xfdl:1321) — V-601~604 multi-select 행 처리 |
| B-012 | 역할조회 | div_roleGrpIdList commonRightButton (커스텀) | searchRoleGrp | `fn_rolSearch` (xfdl:1315) → `fn_run("searchRoleGrp")` |
| B-013 | 비밀번호 초기화 | div_detail | pwdinit | `btn_PwdReset_onclick` (xfdl:1382) → V-501 rdo_PwdReset=Y 시 confirm → `fn_run("pwdinit")` → `fn_pwInit()` (WebBrowser RSA pwChg.html) |
| B-014 | 역할그룹등록 | div_detail | saveUserRoleGrpCopy | `btn_RoleCopy_onclick` (xfdl:1421) → V-503 confirm → `fn_run("saveUserRoleGrpCopy")` |
| B-015 | SSO 초기화 | div_detail | pwdinit (SSO_RESET_FLAG="Y") | `btn_SSOPwdReset_onclick` (xfdl:1405) → V-502 rdo_SSOReset=Y 시 confirm → `ssoReset="Y" + fn_run("pwdinit")` |
| B-016 | 계정 재생성 | div_detail (enable=false 기본) | reRegCmUser | `btn_reRegister_onclick` (xfdl:1433) → V-301~308 검증 후 `fn_run("reRegCmUser")` |
| B-017 | 취소 (계정삭제 모달) | div_deletePopup | - (클라이언트 전용) | `div_deletePopup_btn_close_onclick` (xfdl:1182) — 입력 초기화 + visible=false |
| B-018 | 확인 (계정삭제 모달) | div_deletePopup | deleteCmUser | `div_deletePopup_btn_save_onclick` (xfdl:1163) — rowposition deleteRow + END_ACTIVE_DATE/INF_REQ_NO/DESCRIPTION setColumn → `fn_run("deleteCmUser")` |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 grd_main / grd_userRolegrp / grd_rolegrpList 의 Grid Cell 정의에 ButtonField / displaytype="button" 셀 ✗.

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용 — 11 action × Mapper SQL)

| To-Be action | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | UserTask Java |
|---|---|---|---|---|
| searchCmUser | `fn_search` (xfdl:846) — btn_search (공통 top) | SequenceFlow_0tt1mbk (searchCmUser) | (1) selectCommUser **(To-Be DEPT_NM = LEFT JOIN `MCMAPUSER.TB_MCM_DEPT_INFO` — 정책 #2)** → (2) selectCommUserAll (Task_0970821 chain) | - |
| saveCmUser | `fn_modify` (B-004, xfdl:892) | SequenceFlow_0grwghu (saveCmUser) | (UserTask) → for-loop status="updated" → updateCommUser | `SaveCommUserMng.java` |
| regCmUser | `fn_register` (B-001, xfdl:996) | SequenceFlow_1944t12 (regCmUser) | (UserTask) → for-loop status="inserted" → insertCommUser + mergeCommonPwdInit + **(To-Be JPA `SecUserHisRepository.save()` — 정책 #3 (C) / Q-004 해소 / T-023)** | `RegCommUserMng.java` |
| deleteCmUser | `div_deletePopup_btn_save_onclick` (B-018, xfdl:1163) | SequenceFlow_0hchiuv (deleteCmUser) | (UserTask) → for-loop status="deleted" → deleteCmUser (논리삭제) + **(To-Be `SecUserHisRepository.save()` — 정책 #3 (C))** | `DeleteCommUserMng.java` |
| reRegCmUser | `btn_reRegister_onclick` (B-016, xfdl:1433) | SequenceFlow_07aq563 (reRegCmUser) | (UserTask) 단건 → updateReRegUser + mergeCommonPwdInit + **(To-Be `SecUserHisRepository.save()`)** | `ReRegCommUserMng.java` |
| searchUserRoleGrp | `ds_main_onrowposchanged` (xfdl:1199) | SequenceFlow_0bb4b1a (searchUserRoleGrp) | selectCommUserRoleGrp | - |
| saveUserRoleGrp | `fn_rolSave` (B-010, xfdl:1303) | SequenceFlow_saveUserRoleGrp | (UserTask 이력) → **(To-Be `SecUserRollHisRepository.saveAll()` — 정책 #3 (C))** + (CommonMultiSaveTask) insertCommUserRoleGrp / deleteCommUserRoleGrp | `SaveRoleGroupHis.java` |
| searchRoleGrp | `fn_rolSearch` (B-012, xfdl:1315) + searchUserRoleGrp 후속 콜백 (xfdl:783) | SequenceFlow_searchRoleGrp | selectCommRoleGrpList | - |
| pwdinit | `btn_PwdReset_onclick` (B-013) / `btn_SSOPwdReset_onclick` (B-015) | SequenceFlow_0eh8isc (pwdinit) | (UserTask) → SSO_RESET_FLAG=Y → ds_main for-loop updateCommonSSOPwdInit / 단건 mergeCommonPwdInit | `PasswordInit.java` |
| saveUserRoleGrpCopy | `btn_RoleCopy_onclick` (B-014, xfdl:1421) | SequenceFlow_1gwazq0 (saveUserRoleGrpCopy) | (UserTask 이력) → selectRoleMergeObject + **(To-Be `SecUserRollHisRepository.saveAll()` — 정책 #3 (C))** + (CommonInsertTask) mergeCommonCopyRoleGrp | `SaveRoleGroupCopyHis.java` |
| commonUserDept | `div_dept_cd.commonDynamic_onload` (FX-006, xfdl:421) | SequenceFlow_0ugd21v (commonUserDept) | selectCommDept **(To-Be `MCMAPUSER.TB_MCM_DEPT_INFO` 단독 조회 — 정책 #2)** | - |

### 5.3 BE 패키지 / FE 페이지 매핑 (정책 #1 / #3 (F))

> **정책 #1**: Service / DTO = `mcm.csa.commUserMng.{service\|dto}` (가이드 §3-1 / §6-A-1 / §7-1 — 모듈 직속 Entity / Repository / 본 화면 service-dto). Entity = `mcm.entity.*` (§분석 §11.1).

| 식별자 | FQN / 경로 | 비고 |
|---|---|---|
| Service | `com.dongkuk.dmes.mcm.csa.commUserMng.service.CommUserMngService` | 11 action 처리 + JPA Entity 흡수 (SecUserHis / SecUserRollHis) + McmAuditEntity 자동 |
| DTO (입/출력) | `com.dongkuk.dmes.mcm.csa.commUserMng.dto.*` | 11 action 별 RequestDto / ResponseDto |
| Properties (Pwd 정책) | `com.dongkuk.dmes.mcm.csa.commUserMng.config.CommUserMngPasswordProperties` | (신규) yml prefix `commUserMng.password.*` (정책 #3 (F) / Q-012 해소 / T-011). 기존 `mcm-core/security/password/McmPasswordProperties` 보존 — 본 화면용 별도 신규 |
| BE 엔드포인트 (Pwd 변경) | `POST /oasis/commUserMng/changePassword` | (신규) 본 화면 비밀번호 변경 신규 — 기존 `/oasis/secUser/resetPassword` 보존 (정책 #3 (F) / Q-013 해소 / T-012) |
| FE 메인 페이지 | `m-mcm/app/(csa)/comm-user-mng/page.tsx` (단일 토큰 `commUserMng` camelCase 룰) | - |
| FE Pwd 변경 페이지 | `m-mcm/app/password-change/page.tsx` (신규) | 정책 #3 (F) / Q-013 해소 / T-012 — nexacro WebBrowser pwChg.html 대체 |
| 권한 컨텍스트 | PortalShell + RBAC React Context (정책 #3 (G) / Q-015 해소 / T-015) | gv_AppWorkFrameSet / gds_btn_list 통합 |

---

## 6. 비즈니스 룰 (validation / 도메인 룰 — 분석 §5 인용)

### 6.1 B-004 (수정 / saveCmUser) validation 룰 (분석 §5.1 / xfdl:892~993)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | ds_main.rowcount 내 ROWTYPE_UPDATE 존재 검증 | 수정 클릭 | "변경된 데이터가 없습니다." (error) | return false | xfdl:903~913 |
| V-002 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP EMAIL")` | 변경 행 | (공통 메시지) | return false | xfdl:916~918 |
| V-003 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4 — 신규/수정 행만) | 변경 행 | "사용자ID 중복 되었습니다." (error) | setCellPos(USER_ID) + return | xfdl:921~927 |
| V-004 | ds_mainAll 전체 사용자 내 USER_ID 중복 (원본값과 다른 경우만) | 변경 행 | "사용자ID 중복 되었습니다." (error) | 동일 (USER_ID 셀로) | xfdl:928~934 |
| V-005 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | 변경 행 | "사번이 중복 되었습니다." (error) | setCellPos(USER_EMP_NO) + return | xfdl:940~944 |
| V-006 | ds_mainAll 전체 사용자 내 USER_EMP_NO 중복 (원본값 비교) | 변경 행 | "사번이 중복 되었습니다." (error) | 동일 | xfdl:945~951 |
| V-007 | confirm "수정하시겠습니까?" → 확인 시 `fn_run("saveCmUser")` | 최종 | (confirm 메시지) | - | xfdl:986~992 |

### 6.2 B-001 (계정생성 / regCmUser) validation 룰 (분석 §5.2 / xfdl:996~1071)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | ds_main.rowcount 내 ROWTYPE_INSERT 존재 검증 | 계정생성 클릭 | "추가된 데이터가 없습니다." (error) | return false | xfdl:998~1008 |
| V-102 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP START_ACTIVE_DATE EMAIL")` | 변경 행 | (공통 메시지) | return false | xfdl:1010~1013 |
| V-103 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4) | 변경 행 | "사용자ID 중복 되었습니다." (error) | setCellPos + return | xfdl:1015~1030 |
| V-104 | ds_mainAll 전체 USER_ID 중복 (원본 비교) | 변경 행 | (동일) | 동일 | xfdl:1023~1028 |
| V-105 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | 변경 행 | "사번이 중복 되었습니다." (error) | setCellPos + return | xfdl:1033~1037 |
| V-106 | ds_mainAll 전체 USER_EMP_NO 중복 (원본 비교) | 변경 행 | (동일) | 동일 | xfdl:1040~1045 |
| V-107 | edt_infReqNo / edt_description 입력 여부 → infReqNoFlag false 인 경우 confirm | 최종 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n계정생성 선처리 하시겠습니까?" (confirm) | 확인 시 `fn_run("regCmUser")` | xfdl:1051~1063 |
| V-108 | infReqNoFlag == true 인 경우 confirm | 최종 | "계정을 생성 하시겠습니까?" (confirm) | 확인 시 `fn_run("regCmUser")` | xfdl:1064~1066 |

### 6.3 B-002 (계정삭제 / 모달 진입) validation 룰 (분석 §5.3 / xfdl:1073~1160)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-201 | ds_main.rowposition < 0 차단 | 계정삭제 클릭 | "사용자 선택 후 삭제처리 해주세요." (error) | return false | xfdl:1095~1098 |
| V-202 | `gfn_dsRequired(grd_main, "USER_ID USER_EMP_NO USER_NM IN_OUT_EMP_TP END_ACTIVE_DATE")` | 변경 행 | (공통 메시지) | return false | xfdl:1100~1103 |
| V-203 | 현재 ds_main 내 USER_ID 중복 (rowType 2 or 4) | 변경 행 | "사용자ID 중복 되었습니다." (error) | setCellPos + return | xfdl:1106~1120 |
| V-204 | ds_mainAll 전체 USER_ID 중복 (원본 비교) | 변경 행 | (동일) | 동일 | xfdl:1113~1118 |
| V-205 | 현재 ds_main 내 USER_EMP_NO 중복 (rowType 2 or 4) | 변경 행 | "사번이 중복 되었습니다." (error) | setCellPos + return | xfdl:1123~1127 |
| V-206 | ds_mainAll 전체 USER_EMP_NO 중복 (원본 비교) | 변경 행 | (동일) | 동일 | xfdl:1130~1135 |
| V-207 | div_deletePopup 표시 — sts_message="{USER_ID} 계정을 삭제하시겠습니까?" + cal_end_active_date=today + edt_infReqNo/edt_description 복사 | 최종 | (모달 표시) | - | xfdl:1153~1159 |

### 6.4 B-016 (계정 재생성 / reRegCmUser) validation 룰 (분석 §5.4 / xfdl:1433~1498)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-301 | rowposition < 0 차단 | 재생성 클릭 | "선택 후 재생성 해주세요." (warning) | return | xfdl:1435~1440 |
| V-302 | USER_EMP_NO null 차단 | 변경 행 | "사번 저장 후 재생성 해주세요." (warning) | return false | xfdl:1444~1447 |
| V-303 | USER_NM null 차단 | 변경 행 | "사용자명 저장 후 재생성 해주세요." (warning) | return false | xfdl:1449~1452 |
| V-304 | IN_OUT_EMP_TP null 차단 | 변경 행 | "내부 외부 구분 저장 후 재생성 해주세요." (warning) | return false | xfdl:1454~1457 |
| V-305 | EMAIL null 차단 | 변경 행 | "이메일 저장 후 재생성 해주세요." (warning) | return false | xfdl:1459~1462 |
| V-306 | ds_main.set_updatecontrol(false) → rowposition 만 ROWTYPE_UPDATE / 나머지 ROWTYPE_NORMAL 재설정 | 자동 | - | (자동) | xfdl:1466~1474 |
| V-307 | edt_infReqNo / edt_description 입력 여부 → infReqNoFlag false 인 경우 confirm | 최종 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n [{USER_ID}] 계정 재생성 선처리 하시겠습니까?" (confirm) | 확인 시 `fn_run("reRegCmUser")` | xfdl:1478~1494 |
| V-308 | infReqNoFlag == true 인 경우 confirm | 최종 | "[{USER_ID}] 계정을 재생성 하시겠습니까?" (confirm) | 확인 시 `fn_run("reRegCmUser")` | xfdl:1495~1497 |

### 6.5 B-013 (비밀번호 초기화) validation 룰 (분석 §5.5 / xfdl:654~680)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-401 | div_detail.edt_email.value null 차단 | btn_PwdReset 클릭 후 confirm 확인 → fn_pwInit() | "사용자 이메일 저장 후 진행해주세요." (error) | return false | xfdl:655~659 |

### 6.6 B-013 / B-014 / B-015 confirm 처리 (분석 §5.6 / xfdl:1382 / 1405 / 1421)

| # | 처리 | 메시지 |
|---|---|---|
| V-501 | rdo_PwdReset.value=="Y" 인 경우 confirm → 확인 시 ssoReset=null + `fn_run("pwdinit")` → fn_pwInit() (WebBrowser 호출). rdo 항상 N 복귀 | "비밀번호를 초기화 하시겠습니까?" |
| V-502 | rdo_SSOReset.value=="Y" 인 경우 confirm → 확인 시 ssoReset="Y" + `fn_run("pwdinit")` (전체 사용자 SSO 분기). rdo 항상 N 복귀 | "전체 사용자의 SSO 비밀번호를 초기화 하시겠습니까?" |
| V-503 | B-014 클릭 → confirm "{edt_role_copy} 사용자의 역할그룹을 등록 하시겠습니까?" → 확인 시 `fn_run("saveUserRoleGrpCopy")` | (confirm) |

### 6.7 B-011 (역할추가) validation 룰 (분석 §5.7 / xfdl:1321~1374)

| # | 룰 | 메시지 | 근거 |
|---|---|---|---|
| V-601 | grd_rolegrpList.selectstartrow < 0 또는 selectendrow < 0 차단 | "선택된 Role 그룹이 없습니다." (warning "경고") | xfdl:1328~1330 |
| V-602 | (Ctrl 다중 선택) selectstartrow.length > 1 또는 selectendrow.length > 1 분기 → arryAll 처리 (ds_userRolegrp.addRow + copyRow + reverse deleteRow) | - | xfdl:1335~1351 |
| V-603 | (단일 선택) srow~erow 범위 for-loop → 동일 처리 | - | xfdl:1352~1369 |
| V-604 | 마지막 `ds_rolegrpList.deleteColumn("USER_ID")` + `ds_main.set_enableevent(true)` | - | xfdl:1371~1372 |

### 6.8 그리드 행 클릭 → 역할그룹 자동 조회 (분석 §4.8)

| # | 동작 | 트리거 | 조건 |
|---|---|---|---|
| V-701 | `fn_run("searchUserRoleGrp")` 호출 | `ds_main_onrowposchanged` | rowposition > -1 && getRowCount() != 0 && e.reason != 52 && roleSearch == true |
| V-702 | `edt_user_id.set_readonly(true/false)` | 동일 | USER_ID 값 존재 여부 |
| V-703 | `btn_reRegister.set_enable(false/true)` | 동일 | USE_TP == "Y" → 비활성 / 그 외 → 활성 |
| V-704 | `div_dept_cd.fn_set_value(DEPT_CD) + fn_set_nm(DEPT_NM)` | 동일 | (항상) |

### 6.9 콜백 공통 동작 (분석 §4.7)

| # | 동작 | 트리거 |
|---|---|---|
| V-801 | 모든 콜백 errorCode != 0 → `gfn_commonBottomStatus_msg(strErrorMsg) + gfn_message("저장 실패 하였습니다.", "error")`. **As-Is saveUserRoleGrp 분기 xfdl:794 `div_buttom` 오타 (NullReferenceException 버그) → To-Be `div_bottom` 정정 (정책 #3 (A) / Q-007 해소 / T-027)** | fn_callBack |
| V-802 | search 콜백 시 ds_main.set_rowposition(-1) + roleSearch=true + `gfn_setEnable(div_mainDetail, "true")` + `div_dept_cd.fn_set_value(null) + fn_set_nm(null)` | fn_callBack("searchCmUser") |
| V-803 | save/reg/delete/reReg 콜백 시 confirm "성공적으로 저장되었습니다." → `fn_run("searchCmUser")` 재조회 | fn_callBack |
| V-804 | searchUserRoleGrp 콜백 시 자동 `fn_run("searchRoleGrp")` 후속 호출 | fn_callBack("searchUserRoleGrp") |
| V-805 | pwdtmp 콜백 시 "임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다." + ds_pwdtmp.clearData() | fn_callBack("pwdtmp") |
| V-806 | commonUserDept 콜백 시 `ds_main.setColumn(rowposition, "DEPT_CD", nErrorCode.DEPT_CD)` (As-Is 비표준 처리 — Q-008) | fn_callBack("commonUserDept") |

---

## 7. 상태값 ST-NNN (분석 §10 / §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-010, S-002, V-002/V-102/V-202 검증, V-703 (USE_TP=Y → btn_reRegister 비활성) |
| ST-002 | `IN_OUT_EMP_TP = "I"` / `"O"` | 내부 / 외부 구분 | G-014, D-012, S-003 |
| ST-003 | `STATUS` (Nexacro auto row state) | 상태 아이콘 (To-Be FE 동일 row state 구현 결정 Q-014) | G-001 |
| ST-004 | `getRowType(i)` (1=normal / 2=inserted / 4=updated / 5=deleted) | 그리드 row 상태 | V-001 (UPDATE 존재) / V-101 (INSERT 존재) / V-306 (재생성 시 rowType 재설정) |
| ST-005 | `rdo_PwdReset.value="Y"` / `"N"` | 비밀번호 초기화 라디오 | V-501 (B-013 confirm 분기) |
| ST-006 | `rdo_SSOReset.value="Y"` / `"N"` | SSO 초기화 라디오 | V-502 (B-015 confirm 분기) |
| ST-007 | `this.ssoReset = "Y" / null` | PasswordInit.java SSO_RESET_FLAG context 전달 | B-013 (null) / B-015 (Y) — PasswordInit.java:31 분기 |
| ST-008 | `this.roleSearch = true / false` | 조회 완료 후 ds_main_onrowposchanged 의 searchUserRoleGrp 호출 허용 (IE/Chrome 호환) | V-701 조건 |
| ST-009 | `!nativeeditor_status = "inserted" / "updated" / "deleted"` | DataSet row CRUD 상태 (Java task 분기) | SaveCommUserMng (updated만) / RegCommUserMng (inserted만) / DeleteCommUserMng (deleted만) / SaveRoleGroupHis (inserted/deleted) 분기 |
| ST-010 | `PROC_TYPE = "C" / "D"`, `PROC_CASE = "M"` | TB_MCM_SEC_USER_HIS 이력 분류 (C=생성/재생성, D=삭제 / M=수동) | RegCommUserMng:64~65 / DeleteCommUserMng:58~59 / ReRegCommUserMng:72~73 |
| ST-011 | `RESP_GBN = "A" / "D"`, `WORKS_CODE = "P"` | TB_MCM_SEC_USER_ROLL_HIS 이력 분류 (A=add, D=delete / P=수동) | SaveRoleGroupHis:48 / 62 / SaveRoleGroupCopyHis:55 |

---

## 8. 권한 / 접근 제어

### 8.1 As-Is 권한 모델

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | `gv_AppWorkFrameSet._active_frame.id` → `sScrInfo` → `gds_btn_list` 의 `PERMISSION_CUSTOM` 컬럼 조회 → `sBtnId` 획득 | xfdl:513~519 |
| `sBtnId == "user"` 시 가시성 제어 | div_rightRole / div_rightRoleList / div_rightMenu / btn_RoleCopy / btn_PwdReset / btn_SSOPwdReset 모두 `set_visible(false)` | xfdl:521~529 |
| 그 외 권한 | (As-Is 명시 ✗) | - |

### 8.2 To-Be 정책

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | **(정책 #3 (G) / Q-015 해소)** To-Be PortalShell + RBAC React Context 통합 — gv_AppWorkFrameSet / gds_btn_list nexacro 권한 분기 흡수. RBAC 권한 키 = `mcm:csa:commUserMng:view` | T-015 |
| 버튼 권한 | `user` 권한 사용자는 역할 관리 / PWD / SSO / RoleCopy 6 컴포넌트 visible=false — **To-Be RBAC 권한 키 (예: `mcm:csa:commUserMng:user`) 기반 React Context `useRbac()` 분기로 보존** | xfdl:521~529 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §3.7 + §3.9 인용)

| P-ID | 유형 | 이름 | 트리거 | 호출 라인 | 전달 파라미터 | 반환 처리 |
|---|---|---|---|---|---|---|
| P-001 | modal (Form 내부 Div, visible toggle) | "계정삭제" 확인 모달 | B-002 (`fn_delete`) | xfdl:1159 (`div_deletePopup.set_visible(true)`) | 동적 입력: USER_ID 메시지 / cal_end_active_date=today / edt_infReqNo / edt_description 복사 | B-018 (`div_deletePopup_btn_save_onclick`) — ds_main rowposition deleteRow + setColumn → `fn_run("deleteCmUser")` + 팝업 닫기 |
| P-002 | external popup (commonDynamic) | "부서 조회" | D-007 (div_dept_cd 컴포넌트) | xfdl:421~435 (`commonDynamic_onload` → service=commonUserDept) | dataset=ds_userDept, columns=DEPT_CD/DEPT_NM, cond=edt_DEPT_CD | `fn_callBack` (xfdl:824~826) — `ds_main.setColumn(rowposition, "DEPT_CD", strErrorMsg.DEPT_CD)`. **To-Be SelectModal/Autocomplete (T-016) + 출처 `MCMAPUSER.TB_MCM_DEPT_INFO` (정책 #2 / Q-002 해소)** |
| P-003 | WebBrowser popup → **To-Be Next.js 별도 페이지 (정책 #3 (F) / Q-013 해소 / T-012)** | 비밀번호 변경 RSA | B-013 / B-015 → `fn_pwInit()` | xfdl:654~680 (`/_uiEXt_/rsa/pwChg.html`) | 공개키 (gv_publicKeyModulus / gv_publicKeyExponent) | `wb_pwdChg_init_onusernotify` (xfdl:697) — ds_pwdtmp 적재 + `/security/password/pwdtmp` transaction → fn_callBack("pwdtmp"). **To-Be: FE `m-mcm/app/password-change/page.tsx` (신규) + BE `POST /oasis/commUserMng/changePassword` (신규) + yml prefix `commUserMng.password.*` (CommUserMngPasswordProperties — 신규)** |

> P-001 은 Form 내부 Div 모달 (별도 xfdl 파일 ✗). P-002 는 commonDynamic 표준 컴포넌트. P-003 은 WebBrowser 컨트롤 — To-Be Next.js 별도 페이지 신규 설계 (Q-013 / T-012).

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line / java:line) | 근거 |
|---|---|---|---|---|
| M-001 | "변경된 데이터가 없습니다." | error | V-001 / xfdl:911 | - |
| M-002 | "사용자ID 중복 되었습니다." | error | V-003 / V-004 / V-103 / V-104 / V-203 / V-204 / xfdl:924 / 930 / 1019 / 1025 / 1109 / 1115 | - |
| M-003 | "사번이 중복 되었습니다." | error | V-005 / V-006 / V-105 / V-106 / V-205 / V-206 / xfdl:941 / 947 / 1036 / 1042 / 1126 / 1132 | - |
| M-004 | "수정하시겠습니까?" | confirm | V-007 / xfdl:992 | - |
| M-005 | "추가된 데이터가 없습니다." | error | V-101 / xfdl:1006 | - |
| M-006 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n계정생성 선처리 하시겠습니까?" | confirm | V-107 / xfdl:1063 | - |
| M-007 | "계정을 생성 하시겠습니까?" | confirm | V-108 / xfdl:1065 | - |
| M-008 | "사용자 선택 후 삭제처리 해주세요." | error | V-201 / xfdl:1096 | - |
| M-009 | "{USER_ID} 계정을 삭제하시겠습니까?" | popup message | V-207 / xfdl:1155 | - |
| M-010 | "계정을 삭제 하시겠습니까?" | popup default | xfdl:296 / 1174 / 1184 | - |
| M-011 | "선택 후 재생성 해주세요." | warning | V-301 / xfdl:1438 | - |
| M-012 | "사번 저장 후 재생성 해주세요." | warning | V-302 / xfdl:1445 | - |
| M-013 | "사용자명 저장 후 재생성 해주세요." | warning | V-303 / xfdl:1450 | - |
| M-014 | "내부 외부 구분 저장 후 재생성 해주세요." | warning | V-304 / xfdl:1455 | - |
| M-015 | "이메일 저장 후 재생성 해주세요." | warning | V-305 / xfdl:1460 | - |
| M-016 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n [{USER_ID}] 계정 재생성 선처리 하시겠습니까?" | confirm | V-307 / xfdl:1492~1494 | - |
| M-017 | "[{USER_ID}] 계정을 재생성 하시겠습니까?" | confirm | V-308 / xfdl:1496 | - |
| M-018 | "사용자 이메일 저장 후 진행해주세요." | error | V-401 / xfdl:657 | - |
| M-019 | "비밀번호를 초기화 하시겠습니까?" | confirm | V-501 / xfdl:1393 | - |
| M-020 | "전체 사용자의 SSO 비밀번호를 초기화 하시겠습니까?" | confirm | V-502 / xfdl:1416 | - |
| M-021 | "{edt_role_copy} 사용자의 역할그룹을 등록 하시겠습니까?" | confirm | V-503 / xfdl:1428 | - |
| M-022 | "선택된 Role 그룹이 없습니다." | warning ("경고") | V-601 / xfdl:1329 | - |
| M-023 | "저장하시겠습니까?" | confirm | B-010 fn_rolSave / xfdl:1311 | - |
| M-024 | "{N}건 조회 되었습니다." | bottom status | search / searchUserRoleGrp 콜백 / xfdl:749 / 782 | - |
| M-025 | "{N}건 저장 되었습니다." | bottom status | save/reg/delete/reReg 콜백 (`cnt_save`) / xfdl:765 | - |
| M-026 | "성공적으로 저장되었습니다." | confirm / info | save/reg/delete/reReg / saveUserRoleGrp / saveUserRoleGrpCopy 콜백 / xfdl:773 / 790 / 814 | - |
| M-027 | "저장 실패 하였습니다." | error | save/reg/delete/reReg / saveUserRoleGrp / saveUserRoleGrpCopy error 분기 / xfdl:777 / 795 / 820 | - |
| M-028 | "역활 {N}건 저장 되었습니다." → **To-Be "역할 {N}건 저장 되었습니다." (정책 #3 (A) / Q-006 해소 / T-026)** | bottom status | saveUserRoleGrp 콜백 / xfdl:789 | F-002 |
| M-029 | "역활그룹이 저장 되었습니다." → **To-Be "역할그룹이 저장 되었습니다." (정책 #3 (A) / Q-006 해소 / T-026)** | bottom status | saveUserRoleGrpCopy 콜백 / xfdl:813 | F-002 |
| M-030 | "비밀번호가 초기화 되었습니다" | bottom status | pwdinit 콜백 / xfdl:800 | - |
| M-031 | "비밀번호 초기화에 실패 하였습니다." | error | pwdtmp 콜백 nErrorCode<0 / xfdl:804 | - |
| M-032 | "비밀번호가 초기화 되었습니다. 임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다." | bottom status | pwdtmp 콜백 / xfdl:806 | - |
| M-033 | (Java 예외 메시지) "사용자 정보 업데이트에 실패했습니다." (UserException) | java exception | ReRegCommUserMng.java:61 | - |
| M-034 | (Java 로그) "##########	{Save/Reg/Delete/Re Reg}CommUserMng 저장모드 = {status}" / "{count} 확인 ==> [...]" | log.debug / log.info | SaveCommUserMng / RegCommUserMng / DeleteCommUserMng / ReRegCommUserMng / PasswordInit / SaveRoleGroupHis / SaveRoleGroupCopyHis | - |

---

## 11. As-Is 인용 정합 (분석리포트 §1~§18 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 |
| §2 | 분석 §3.1 | 영역 10 (5 표준 + 5 추가: TITLE / FOLD / MAIN-RIGHT-TOP / MAIN-RIGHT-BOT / POPUP-DEL / FOOTER) |
| §3.1 | 분석 §3.2 | 3 행 일치 |
| §3.2 | 분석 §3.3 / §3.4 / §3.5 | G 17 행 + GR 2 행 + GL 2 행 일치 |
| §3.3 | 분석 §9 | LV-001~008 인용 |
| §4.1 | 분석 §3.6 | D-001~D-020 (20 행 일치) |
| §4.2 | 분석 §3 (L-NNN 없음) | "해당 없음" 보존 |
| §4.3 | 분석 §3.7 | DP-001~DP-006 (6 행 일치) |
| §5.1 | 분석 §4.1 | 18 행 일치 (B-001~B-018) |
| §5.1-1 | 분석 §4.2 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | 11 action + Mapper SQL 매핑 일치 (DEPT JOIN 정책 #2 / Mapper Entity 흡수 정책 #3 (C) 반영) |
| §5.3 (신규) | 분석 §11.0 P-1 / P-3-C / P-3-F / P-3-G + §11.1 Entity | BE 패키지 / FE 페이지 / Pwd Properties / RBAC 매핑 — 정책 #1 / #3 (F) / #3 (G) 일괄 적용 |
| §6 | 분석 §5 (V-001~V-803) | 모두 cite |
| §7 | 분석 §10 / §10.1 | 11 ST 일치 (확장: ST-007~ST-011 — 분석 §10.1 + §10 변수 + Java status / PROC_TYPE / RESP_GBN) |
| §8 | 분석 §4.4 (FX 권한 분기) | sBtnId="user" 권한 룰 cite |
| §9 | 분석 §3.7 + §3.9 (P-001 + P-002 + P-003) | 3 행 일치 |
| §10 | 분석 §5 + §10 + java | M-001~M-034 모두 cite |
