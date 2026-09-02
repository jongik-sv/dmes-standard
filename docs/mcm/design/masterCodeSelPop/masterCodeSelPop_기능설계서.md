---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# MCM — 마스터코드 선택 팝업 기능설계서

> 본 설계서의 모든 표는 분석리포트의 해당 절을 그대로 인용한다. 자체 추가 ✗.

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 마스터코드 선택 팝업 |
| 화면 식별자 (screenId) | masterCodeSelPop |
| As-Is 식별자 | MasterCodeSelPop (cma) |
| 모듈 / 그룹 | mcm (공통관리) / cma (Master 관리(원장)) |
| 메뉴 계층 | 공통관리 > Master 관리(원장) > 마스터코드 선택 팝업 |
| 화면 목적 | 호출 화면에서 코드 그룹 ID (sCodeId) 를 전달받아 VI_MCM_CODE_ACCESS 의 코드값을 선택할 수 있는 LoV 모달 팝업. 사용자가 선택한 `{ CODE_VAL, CODE_VAL_MEAN }` 을 호출 화면에 콜백 반환한다 (분석리포트 §1). |
| 주요 사용자 | 다른 화면 (P-001~P-006 — MasterJudgRuleDataList, MasterRuleNewSpec, MasterRuleDataList, MasterJudgRuleNewSpec) 에서 코드 선택이 필요한 사용자 |
| 접근 경로 | 모달 팝업 (직접 접근 ✗) — `gfn_openPopup("modal", "{title}", "cma::MasterCodeSelPop.xfdl", oArg, "", "{callback}")` 형태로만 호출 |

### 1.2 호출 컨텍스트 (분석리포트 §1 인용)

| 항목 | 값 | 근거 |
|---|---|---|
| 호출 방식 | 모달 팝업 (`gfn_openPopup`) | 분석 §1 |
| 입력 파라미터 (필수) | `sCodeId` (코드 그룹 ID — 예: "SPEC_CD") | 분석 §1 |
| 입력 파라미터 (선택) | `sCodeNm` (화면 표시용), `sCodeVal` (검색 초기값), `sCodeValMean` (보존 — 미사용) | 분석 §1 |
| 반환값 | `{ sCodeVal, sCodeValMean }` | 분석 §1 |

### 1.3 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm | 분석 §1 |
| moduleGroup | cma | 분석 §1 (As-Is 폴더 `mui/src/nxuiMui/cma/`) |
| mesModule | m-mcm | `m-{moduleId}` |
| 적용 명명 룰 | MES 단일 룰 | mcm 은 MES 모듈 (mpn APS 예외 ✗) |
| 화면식별자 (screenId) | masterCodeSelPop | camelCase `{moduleId}{화면명}` |
| pageName | masterCodeSelPop | MES: = screenId |
| pageId | masterCodeSelPop | MES: = screenId |
| serviceId | masterCodeSelPop | = screenId |
| 페이지 유형 | A (단순 조회 — 조회조건 + 단일 그리드 / D=0 / L=0 / GE=0) | 분석리포트 §3.1 (A-FILTER + A-GRID 단일) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/masterCodeSelPop/search` | T3-D 라우팅 (C1~C6 충족 ≤1 → 범용 OASIS) |
| 주요 API path (BFF→BE) | `POST /oasis/masterCodeSelPop/search` | 동일 |
| Frontend 파일명 | masterCodeSelPop.tsx | MES |
| tsup entry key | `pages/cma/masterCodeSelPop` | MES (`-page` ✗) |

---

## 2. 화면 영역 정의 (분석리포트 §3.1 인용)

| 영역ID | 영역명 | 설명 | 근거 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | "마스터코드 선택" Edit + 공통 상단 메뉴 (btn_search / btn_confirm / btn_close) | 분석 §3.1 |
| A-TOPMENU | 공통 상단 버튼 영역 | commonTopButton.xfdl 주입 (btn_search / btn_confirm / btn_close 3 표준 버튼) | 분석 §3.1 |
| A-FILTER | 조회조건 영역 | div_search (Combo + Edit + Static + Edit) | 분석 §3.1 |
| A-FOLD | 조회조건 접기 버튼 | btn_fold (조회조건 영역 접기/펴기) | 분석 §3.1 |
| A-GRID | 결과 그리드 영역 | div_main 내부 grd_main (5 컬럼) | 분석 §3.1 |
| A-FOOTER | 하단 공통 영역 | commonBottomStatus.xfdl (상태 메시지 영역) | 분석 §3.1 |

---

## 3. 조회 기능 (영역: A-FILTER)

### 3.1 조회조건 (분석리포트 §3.2 인용)

| 필드ID | DB 컬럼명 | 화면 표시명 (분석 §3.2 인용) | 입력 방식 (5 enum) | 필수 (Y/N) | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | (UI 라벨) | 코드명 | (Static — 라벨) | - | text="코드명" | edt_codeNm 의 좌측 라벨 |
| S-002 | (UI 표시 — 검색 미전송) | 코드명 입력값 | TextBox | N | text="결함 코드", 호출 측 sCodeNm 으로 set_value | UI 표시용 — Mapper 전송 ✗ (As-Is 보존 — 사용자 결정) |
| S-003 | CODE_ID 검색 구분 | 검색구분 | ComboBox | Y | value="CODE_VAL" (LV-001 innerdataset 2 행) | 검색 대상 컬럼 (CODE_VAL / CODE_VAL_MEAN) |
| S-004 | CODE_VAL or CODE_VAL_MEAN (S-003 분기) | 코드값 검색어 | TextBox | N | text="USD", 호출 측 sCodeVal 으로 set_value | Mapper `pValue` 전송 (LIKE %...%) |

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | `본 §3.1 행 == 분석 §3.2 행` | ✓ (4 == 4) |
| 표시명 1byte 일치 | 분석 §3.2 ↔ 본 §3.1 | ✓ |
| 입력 방식 enum (5값) | TextBox / ComboBox / CheckBox / DatePicker / Lookup | ✓ (Static 은 라벨 — 입력 방식 미적용) |

### 3.2 조회 결과 (그리드 컬럼 — 분석리포트 §3.3 인용)

**메인 그리드 (G-NNN)**:

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 (분석 §3.3 인용) | 데이터 설명 | 정렬 (3 enum) | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | (UI 산출 — `expr:currow+1`) | NO | 행 번호 (UI 자동) | Center | int |
| G-002 | CATEGORY_ID | 카테고리 ID | 코드 카테고리 식별자 | Left | VARCHAR(180) — DMES Excel sheet34 r8 |
| G-003 | CATEGORY_NM | 카테고리명 | 코드 카테고리 한글명 | Left | VI_MCM_CODE_ACCESS JOIN 컬럼 — `MCMAPUSER.TB_MCM_CODE_CATEGORY.CATEGORY_NM` (Excel sheet34 r9) |
| G-004 | CODE_VAL | 코드값 | 코드 실값 (alpha upper) | Left | varchar(50) — xfdl editmaxlength=50 |
| G-005 | CODE_VAL_MEAN | 코드의미 | 코드 한글 의미 (hangul) | Left | varchar(180) — xfdl editmaxlength=180 |

**그리드 속성**:
- 편집 ✗ (모든 body cell `edittype="none"`)
- 행 더블클릭 = E-001 (선택 행 반환 후 popupClose)
- 헤더 클릭 = E-002 (정렬 토글 — gfn_commonOnheadclick)
- 자동 컬럼 폭 조정 (`autofittype="col"`)

**확장/서브 그리드 (GE-NNN / G2-NNN)** — 해당 없음.

### 3.3 코드값 표시 변환 (분석리포트 §10 인용)

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| (cbo_div 검색구분) | LV-001 innerdataset (xfdl 자체 정의) | "CODE_VAL" → "코드값" / "CODE_VAL_MEAN" → "코드의미" |
| CODE_ID (입력 파라미터) | (호출 측 sCodeId — 본 화면 비변환) | "SPEC_CD" / 동적 파생값 (P-001 / P-004) |

---

## 4. 선택 / 반환값 (호출 측에 반환되는 데이터)

### 4.1 반환 데이터 구조 (분석리포트 §4.3 + Script:185-200 인용)

| 반환 시점 | 반환 객체 | 필드 | 출처 | 호출 측 콜백 |
|---|---|---|---|---|
| 그리드 더블클릭 (E-001) | `obj = { sCodeVal, sCodeValMean }` | sCodeVal = `ds_grdMain.getColumn(e.row, "CODE_VAL")`, sCodeValMean = `ds_grdMain.getColumn(e.row, "CODE_VAL_MEAN")` | 더블클릭된 행 | fn_returnMasterCodePopupCallBack / fn_returnRegMasterCodePopupCallBack |
| 확인 버튼 (B-002 `fn_confirm`) | `obj = { sCodeVal, sCodeValMean }` | sCodeVal / sCodeValMean = `ds_grdMain.getColumn(ds_grdMain.rowposition, "...")` | 현재 선택 행 (rowposition) | 동일 |
| 닫기 (B-003 `fn_close`) | (반환값 없음 — `this.close()`) | - | - | `gfn_isNull(rtVal)` 분기로 콜백 측에서 무시 |

### 4.2 미반환 컬럼 (As-Is 결함 / 후속 결정 후보)

| 컬럼 | Grid 노출 | 반환 객체 포함 | 사유 |
|---|---|---|---|
| CATEGORY_ID | Y (G-002) | N | As-Is 가 단순 코드 LoV 로 설계 — To-Be 보존 (호출 화면이 필요로 하는 경우 호출 컨텍스트에서 매핑) |
| CATEGORY_NM | Y (G-003) | N | 동일 |

---

## 5. 버튼 액션 (분석리포트 §4 인용)

### 5.1 버튼 목록 (분석리포트 §4.1 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | commonTopButton 주입 (A-TOPMENU) | search | Mapper GetCodeDetailList 호출 후 ds_grdMain 적재 |
| B-002 | 확인 | commonTopButton 주입 (A-TOPMENU) | popup | 현재 rowposition 의 `{ CODE_VAL, CODE_VAL_MEAN }` 호출 측 반환 후 popupClose |
| B-003 | 닫기 | commonTopButton 주입 (A-TOPMENU) | popup | this.close() (반환값 없음) |
| B-004 | 조회조건 접기/펴기 | A-FOLD | popup (UI only) | gfn_fold 호출 — div_search 와 div_main 의 영역 토글 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN) — 해당 없음

(xfdl Grid Body Cell `edittype="none"` 전수 — 분석리포트 §4.2).

### 5.1-2 그리드 셀 이벤트 (분석리포트 §4.3 인용)

| ID | 이벤트 위치 | 트리거 | 핸들러 함수 | 동작 |
|---|---|---|---|---|
| E-001 | grd_main `oncelldblclick` | 셀 더블클릭 | div_main_grd_main_oncelldblclick | `{ sCodeVal, sCodeValMean }` 반환 + popupClose |
| E-002 | grd_main `onheadclick` | 헤더 클릭 | div_main_grd_main_onheadclick | 정렬 토글 (gfn_commonOnheadclick) |
| E-003 | edt_codeVal `onkeydown` | Enter 키 | div_search_edt_codeVal_onkeydown | (주석 처리됨 — To-Be 동일 비활성 유지, 사용자 결정) |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작 (단계별) | 호출 액션 |
|---|---|---|---|---|
| B-001 | 사용자 클릭 | 화면 진입 후 OnLoad 자동 1회 + 사용자 임의 클릭 | (1) ds_grdMain.clearData (Script:166) → (2) sArgument 조립 (`pCodeId` = sCodeId, `pDiv` = cbo_div.value, `pValue` = edt_codeVal.value, Script:161-163) → (3) gfn_transaction("search", ...) (Script:167) → (4) 결과 ds_grdMain 적재 → (5) commonBottomStatus 메시지 (Script:177-178) | search |
| B-002 | 사용자 클릭 | ds_grdMain.rowposition >= 0 (선택 행 존재) | (1) obj = { sCodeVal, sCodeValMean } 조립 (Script:196-198) → (2) gfn_popupClose(obj) (Script:199) | popup (반환) |
| B-003 | 사용자 클릭 | (조건 없음) | this.close() (Script:204) — 반환값 없음 | popup (취소) |
| B-004 | 사용자 클릭 | (조건 없음) | gfn_fold(this, this.div_search, this.div_main, this.btn_fold) (Script:210) — div_search 접고 div_main 확장 / 반대 토글 | popup (UI only) |
| E-001 | grd_main 셀 더블클릭 | 더블클릭된 행 = e.row | (1) obj = { sCodeVal, sCodeValMean } 조립 (Script:188-189) → (2) gfn_popupClose(obj) (Script:190) | popup (반환 — B-002 와 동일) |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | rowposition 갱신 (xfdl `selecttype="cell"` — selectionchange 핸들러 명시적 미등록) |
| 행 더블클릭 | E-001 → 선택 행 반환 후 popupClose |
| 헤더 클릭 | 해당 컬럼 기준 정렬 토글 (gfn_commonOnheadclick) |
| 페이지 변경 | 해당 없음 (단일 페이지 — ORDER BY CODE_VAL 만, 페이지 분할 ✗) |

---

## 6. 비즈니스 룰

### 6.1 입력값 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 (As-Is) |
|---|---|---|---|
| V-001 | sCodeId (호출 파라미터) | 호출 측이 sCodeId 를 전달하지 않으면 Mapper `<if test='pCodeId != null and pCodeId != ""'>` 분기 미진입 → CODE_ID 조건 없이 전체 코드 반환 (위험) | (As-Is 검증 ✗ — Q-NNN 후보) |
| V-002 | S-003 (cbo_div) | "CODE_VAL" 또는 "CODE_VAL_MEAN" 두 값 enum 강제 (innerdataset 정의 2 행) | (UI Combo enum 강제) |
| V-003 | S-004 (edt_codeVal) | (As-Is 검증 ✗) — 빈 값일 때 `<if test='pDiv.equals("CODE_VAL")'>` 분기 진입하여 `LIKE '%%'` 가 됨 — 전체 조회 효과 | (As-Is 검증 ✗) |
| V-004 | B-002 확인 클릭 시 rowposition | (As-Is 검증 ✗) — rowposition < 0 시 `getColumn` 이 null 반환 (선택 행 없는 채로 popupClose 가능) | (As-Is 검증 ✗ — To-Be 보강 후보) |

### 6.2 비즈니스 처리 흐름

1. 화면 진입 → OnLoad → `fn_formAfterOnload` (Script:118-136)
   - 호출 측 파라미터 4종 수신 (sCodeId / sCodeNm / sCodeVal / sCodeValMean)
   - sCodeNm 이 비어있지 않으면 edt_codeNm 에 set_value (Script:125-127)
   - sCodeVal 이 비어있지 않으면 edt_codeVal 에 set_value (Script:129-131)
   - gfn_gridSelectedRow(grd_main) 호출 — 그리드 선택 행 초기화 (Script:132)
   - fn_button() 호출 — 공통 상단 버튼 array 주입 (Script:134)
   - fn_search() 자동 호출 (Script:135) — 화면 진입 즉시 1회 조회
2. 사용자 검색 조건 변경 → B-001 조회 클릭 → fn_search() (Script:155-168)
3. 사용자 행 선택 → B-002 확인 또는 E-001 더블클릭 → popupClose
4. 사용자 취소 → B-003 닫기 → this.close()

### 6.3 자동 조회 (OnLoad)

| 항목 | 값 | 근거 |
|---|---|---|
| OnLoad 자동 조회 | Y | Script:135 (`fn_formAfterOnload` 마지막에 `this.fn_search()`) |
| 호출 측 전달값으로 사전 조회 | Y | sCodeId (필수) + sCodeVal (선택) 이 OnLoad 시 fn_search 의 sArgument 에 포함 |

---

## 7. 상태값 (ST-NNN)

해당 없음 — 본 화면은 LoV 조회 전용으로 상태 전이 / workType / 표시 영향 플래그 / 진행·승인·마감·취소 enum 부재.

| ID | 비고 |
|---|---|
| - | 분석리포트 §9 등가 — workType / 표시 플래그 / 진행·승인·마감·취소 enum / sList where 분기 enum 모두 부재 |

---

## 8. 권한 / 접근 제어

본 화면은 모달 팝업으로 호출 화면의 권한에 종속한다.

| 기능 | ADMIN | MANAGER | USER | 비고 |
|---|---|---|---|---|
| 조회 (B-001 / E-001 / E-002) | O | O | O | LoV 조회 — 호출 화면의 조회 권한이 본 화면 진입 권한과 동치 |
| 확인 (B-002 / E-001) | O | O | O | 선택 후 반환 — 호출 화면의 권한에 종속 |
| 닫기 (B-003) | O | O | O | 취소 동작 |
| 신규등록 | X | X | X | 본 화면 비대상 (마스터 등록은 별도 화면 — masterCodeMng 추정) |
| 수정 | X | X | X | 동일 |
| 삭제 | X | X | X | 동일 |

**As-Is 권한 명시 코드**: 없음 (gfn 공통이 처리하는 것으로 추정 — Q-NNN 미등재, As-Is 보존).

---

## 9. 호출 화면 매핑 (역참조 — 분석리포트 §5 인용)

| ID | 호출 화면 (As-Is) | 호출 화면 (To-Be 후보) | 호출 위치 | sCodeId 값 | 콜백 함수 | 다이얼로그 title |
|---|---|---|---|---|---|---|
| P-001 | MasterJudgRuleDataList (cmb) | masterJudgRuleDataList | :615 | 동적 (`sText.substr(5).replace(...)`) | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-002 | MasterRuleNewSpec (cmb) | masterRuleNewSpec | :446 | "SPEC_CD" | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-003 | MasterRuleNewSpec (cmb) | masterRuleNewSpec | :474 | "SPEC_CD" | fn_returnRegMasterCodePopupCallBack | "규격약호 선택" |
| P-004 | MasterRuleDataList (cmb) | masterRuleDataList | :593 | 동적 (`sText.substr(5)`) | fn_returnMasterCodePopupCallBack | "마스터코드 조회" |
| P-005 | MasterJudgRuleNewSpec (cmb) | masterJudgRuleNewSpec | :424 | "SPEC_CD" | fn_returnMasterCodePopupCallBack | "규격약호 선택" |
| P-006 | MasterJudgRuleNewSpec (cmb) | masterJudgRuleNewSpec | :447 | "SPEC_CD" | fn_returnRegMasterCodePopupCallBack | "규격약호 선택" |

**To-Be 후보명**: As-Is 폴더 `cmb/` 가 화면 분포상 mcm 또는 mqc 모듈 후보 — 본 화면 (`masterCodeSelPop`) 은 mcm 모듈로 확정 (사용자 결정).

---

## 10. 메시지 / 알림

### 10.1 As-Is 표시 메시지

| ID | 메시지 (As-Is) | 표시 위치 | 트리거 | 근거 |
|---|---|---|---|---|
| M-001 | `{n}건 조회 되었습니다.` | commonBottomStatus (A-FOOTER) | fn_callBack "search" 성공 시 | MasterCodeSelPop.xfdl Script:177 |
| M-002 | strErrorMsg | commonBottomStatus | fn_callBack 실패 시 | MasterCodeSelPop.xfdl Script:178 |

### 10.2 표시 영역

| 영역 | 표시 메커니즘 |
|---|---|
| commonBottomStatus | gfn_commonBottomStatus_msg(...) — A-FOOTER div_bottom 의 공통 상태바 |
| 모달 알림 (gfn_message) | 본 화면 ✗ (모달 알림 호출 코드 미존재 — Script grep 결과) |

---

## 11. 특이사항 / 설계 결정 (분석리포트 §12 Q-NNN 인용)

### 11.1 결정 누적 (사용자 결정 완료)

활성 확인필요 = 0 건. 결정 누적 표는 분석리포트 §12 참조.

### 11.2 검토한 대안

해당 없음 (LoV 팝업은 As-Is 1:1 보존 우선 — To-Be 대안 검토 ✗).
