---
screenId: ruleSetMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-26
작성자: Agent
---

# mdm — 룰 세트(조회·등록) 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-08-02 `ruleMng` 선례)**: 본 화면은 **As-Is 레거시가 없는 신규 화면**이라
> 분석리포트가 없고 5종 설계 산출물 게이트가 성립하지 않는다. 5종을 **기능설계서 1종**으로 줄여 쓴다. 표는 원천 설계
> (`docs/mdm/design/basic/06-business-rule.md`)와 선행 Design 산출물(`docs/mdm/tasks/TSK-08-06/design.md`)을 근거로 삼는다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dme` / pageName `ruleSetMng` /
> pageId `ruleSetMng` / 페이지 유형 `B` / tsup entry key `pages/dme/ruleSetMng/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 룰 세트 |
| 화면 식별자 | `ruleSetMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dme`(업무기준) |
| 화면 목적 | 룰 세트(`TB_MDM_RULE_SET`) 목록을 계산 칸(룰 수·최종 결과 변수·입력 변수 수·세트 검사)과 함께 조회하고, 빈 세트를 등록한다. 등록하면 INUSE·룰 없음 한 행이 만들어지고 룰 세트 편집(`ruleSetEdit`)이 그 세트로 열린다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·등록) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 세트 |

근거: 06:754-755 「화면」 룰 세트 조회·등록, 시안 H:281-307, TSK-08-06 design §6.7·§6.11, 수용 기준 1·2.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | `docs/mdm/screens/README.md`, TSK-08-06 design §0(D1 — spec 의 `mdr` 는 낡은 값) |
| mesModule | `m-mdm` | 01 A.4.5 |
| 화면식별자 (screenId) = pageName = serviceId = OBJECT_ID | `ruleSetMng` | design I17 |
| 페이지 유형 | `B`(조회 + 등록 폼) | |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleSetMng/{action}` | design §6.12 |
| 주요 API path (BFF→BE) | `POST /oasis/ruleSetMng/{action}` | 상동 |
| Frontend 파일 | `m-mdm/pages/dme/ruleSetMng/page.tsx`(+ `api.ts`·`types.ts`·`components/RuleSetRegisterForm.tsx`) | design §2.3 |
| tsup entry key | `pages/dme/ruleSetMng/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`(READ)·`reg`(EDIT) | design §6.12·I17 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 룰 세트(`ruleSetMng`, seq 004, fullSeq 5050400) | `DataInitializer.seedMdmRuleSetMenus()`, design D12 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 세트, 담은 룰, 결과 변수, 상태 |
| `A-GRID` | 룰 세트 목록 | 한 페이지 20건. 세트 ID 를 누르면 룰 세트 편집으로 간다 |
| `A-PAGE` | 페이지 이동 | shared `Pagination`(이전·다음, 총 건수) |
| `A-REG` | 등록 폼 | 빈 세트 등록(`ContentPanel width={380}`) |
| `A-BTN` | 버튼 | `MdmPageLayout.buttons`(조회) |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_RULE_SET_ID`/`MARU_RULE_SET_NAME` | 세트 | TextBox | N | (빈값) | ID(대소문자 무시) 또는 세트명(대소문자 구분) 부분 일치 |
| S-002 | `RULE_IDS` | 담은 룰 | TextBox | N | (빈값) | 멤버 룰 ID 가운데 하나라도 부분 일치(대소문자 무시) |
| S-003 | (계산) | 결과 변수 | TextBox | N | (빈값) | 멤버 룰이 만드는 결과 변수와 정확 일치(대문자 비교). **중간 결과도** 찾는다 |
| S-004 | `STATUS` | 상태 | ComboBox | N | 전체 | §10 LV-001 |

### 3.2 조회 결과 (그리드 컬럼)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `MARU_RULE_SET_ID` | 세트 ID | 링크 — 누르면 룰 세트 편집 탭(`openMdmPage("dme/ruleSetEdit", {setId})`) | Left | varchar(50) |
| G-002 | `MARU_RULE_SET_NAME` | 세트명 | | Left | varchar(100) |
| G-003 | (계산) | 룰 수 | `RULE_IDS` 목록 길이 | Center | int |
| G-004 | (계산) | 최종 결과 변수 | 세트 입출력 표에서 어느 룰도 다시 읽지 않는 결과 변수(코드 칩), 없으면 "-" | Left | |
| G-005 | (계산) | 입력 변수 수 | 세트를 부를 때 레코드에 넣어야 하는 이름 수 | Center | int |
| G-006 | `DESCRIPTION` | 설명 | | Left | text |
| G-007 | (계산) | 세트 검사 | DEPRECATED 면 "-", 거부가 있으면 "거부 N", 아니면 "통과". 경고가 있으면 뒤에 " · 경고 N" | Center | |
| G-008 | `STATUS` | 상태 | 배지(`INUSE`·`DEPRECATED`) | Center | LV-001 |

> 계산 칸은 멤버 룰마다 **최신 RELEASED 버전**(VER 최대, design D3)으로 서버가 계산하고 저장하지 않는다. 룰이 폐기되거나 새 버전이 나오면
> 저장된 세트도 거부로 바뀔 수 있다(목록 아래 설명 문장). 정렬은 서버가 세트 ID 로 한다(헤더 클릭 정렬 없음).

## 4. 등록 폼 필드 정의 (영역: A-REG)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_RULE_SET_ID` | 세트 ID | TextBox | Y | (빈값) | 컬럼 물리명 규칙(V-001). 어기면 입력 칸 아래(`set-reg-id-error`) 즉시 안내하고 저장 버튼을 막는다. 안내가 없을 때는 "컬럼 물리명 규칙을 따르는 전역 이름" |
| D-002 | `MARU_RULE_SET_NAME` | 세트명 | TextBox | Y | (빈값) | 100자 이하 |
| D-003 | `DESCRIPTION` | 설명 | Textarea | N | (빈값) | 빈 값은 null 로 저장 |
| — | `RULE_IDS`·`STATUS`·`ROW_VERSION` | (표시 없음) | — | — | `[]`·`INUSE`·0 | 서버가 쓴다(I2). 룰은 편집 화면에서 담는다 |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | toolbar | `search` | A-FILTER 조건으로 0 페이지부터 조회 |
| B-002 | 저장 | A-REG | `reg` | 등록 후 목록을 다시 조회하고 룰 세트 편집 탭을 그 세트로 연다 |
| B-003 | 이전·다음 | A-PAGE | `search` | 마지막으로 조회한 조건으로 해당 페이지 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

| 버튼ID | 버튼명 | 소속 그리드 | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | (세트 ID 링크) | A-GRID | G-001 | `openMdmPage("dme/ruleSetEdit", {setId})` | 받는 화면은 `useMdmPageParams` 로 받아 그 세트를 연다(I22) |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| B-001 | 클릭·Enter | 없음 | 1) 조건 수집(빈 칸은 보내지 않음) 2) `search{keyword?, ruleId?, resultVar?, status?, page: 0, size: 20}` 3) `{rows, totalCount}` 바인딩 | `search` |
| B-002 | 클릭 | V-001·V-002 통과, `reg` 권한 | 1) `reg{setId, setName, description?}` 2) 성공 시 폼 비우고 목록 재조회 3) `openMdmPage("dme/ruleSetEdit", {setId})` 4) 실패 시 서버 메시지를 오류 모달로 | `reg` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 없음(세트 ID 링크만 이동) |
| 헤더 클릭 | 정렬 없음(서버 정렬) |
| 페이지 변경 | `page`(0부터)·`size` 20. 서버가 전체 세트를 메모리에서 거른 뒤 자른다(design D10) |
| 빈 상태 | "조건에 맞는 룰 세트가 없다" 문구(목록 아래 글자) + 건수 0건 |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | D-001 | 필수, `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, 50자 이하(`NamingRules.STD_PHYS_NAME`·`CODE_MAX`, I1) | 룰 세트 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다 |
| V-002 | D-002 | 필수, 100자 이하 | 세트명은 필수입니다. / 세트명은 100자 이하여야 합니다. |

### 6.2 연관 검증 (서버)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | 같은 세트 ID 가 이미 있다(`DUPLICATE_DATA`) | 이미 있는 룰 세트 ID 입니다: {id} |
| XV-002 | 등록자가 담당자 역할이 아니다 | MDM013 담당자 역할이 있어야 할 수 있습니다 |

서버(`RuleSetIdRules`·`RuleSetMngService`)는 화면 검사를 믿지 않고 V-001·V-002·XV 전부를 다시 본다.

## 7. 상태 정의 및 상태별 제어

세트 상태(`STATUS`)는 이 화면에서 바꾸지 않는다. 등록은 `INUSE` 로 쓴다. 폐기·되살리기는 룰 세트 편집(`ruleSetEdit`)이 다룬다.
세트에는 버전·승인·선점이 없다(06:907·924·929, design I3).

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | `search`(READ) |
| 등록 | O | O | X | `reg`(EDIT) + 서버 담당자 역할 검사(`RuleStewardCheck.requireSteward()`). 권한이 없으면 버튼을 숨기지 않고 비활성으로 둔다 |

> dme 권한 매트릭스: `MDM_STEWARD → PERM_MDM_CONFIRM`, `MDM_STD_ADMIN → PERM_MDM_READ`(design F11).

## 9. 연동 화면 / 팝업

| 대상 | 방식 | 넘기는 값 |
|---|---|---|
| 룰 세트 편집(`ruleSetEdit`) | `@/shell` `openMdmPage("dme/ruleSetEdit", {setId})` — 포털 탭 열기 | 세트 ID(등록 직후·목록 링크) |

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 |
|---|---|---|
| LV-001 `STATUS` | `INUSE`/`DEPRECATED` | 코드 그대로(시안 선택지와 같다). 조회조건은 전체/INUSE/DEPRECATED |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | 화면 그룹 `dme`(spec 의 `mdr` 아님) | design D1 |
| N-2 | 계산 칸 기준 버전은 "RELEASED 가운데 VER 최대"(적용 시작이 미래인 RELEASED 포함) | design D3·I7 |
| N-3 | 결과 변수·세트 검사는 저장하지 않는 계산값이라 전체 세트를 메모리에서 거르고 자른다 | design D10 |
| N-4 | 메뉴 순번 004/005, 003 은 TSK-08-05 `ruleConfirm` 자리 | design D12 |
| N-5 | "저장 즉시 배포"는 보류 — 등록·저장은 `TB_MDM_RULE_SET` 한 행만 바꾼다 | design D11, PRD FR-E5 |
| N-6 | 빈 상태 문구를 그리드 오버레이가 아니라 목록 아래 글자로 보인다 | shared `AgDataGrid` 가 `loading` 해제 때 빈 행 오버레이까지 지운다(TSK-08-02 N-3 선례) |
| N-7 | e2e `src/frontend/e2e/mdm-ruleSetMng.spec.ts`(M1~M6, 스모크 넷 = M1·M2·M3·M4), 픽스처 `e2e/fixtures/mdm-ruleSet-data.sql` | design §3.4.1 |
