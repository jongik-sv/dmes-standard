---
screenId: ruleMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-24
작성자: Agent
---

# mdm — 룰(조회·등록) 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-04-02 D14·TSK-04-04 선례)**: 본 화면은 **As-Is 레거시가 없는 신규 화면**이라
> 분석리포트가 없고 5종 설계 산출물 게이트가 성립하지 않는다. 5종을 **기능설계서 1종**으로 줄여 쓴다. 표는 원천 설계
> (`docs/mdm/design/basic/06-business-rule.md`)와 선행 Design 산출물(`docs/mdm/tasks/TSK-08-02/design.md`)을 근거로 삼는다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dme` / pageName `ruleMng` /
> pageId `ruleMng` / 페이지 유형 `B` / tsup entry key `pages/dme/ruleMng/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 룰 |
| 화면 식별자 | `ruleMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dme`(업무기준) |
| 화면 목적 | 룰(`TB_MDM_RULE`) 목록을 서버 페이징으로 조회하고, MDM 원천 룰을 등록한다. 등록하면 버전 1 DRAFT 가 만들어지고 등록자가 소유자(자동 선점)가 되며 룰 화면(`ruleEdit`)이 열린다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·등록) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 |

근거: 06:741- 「화면」 룰 목록·등록, TSK-08-02 design §6.1·§6.3.2, 수용 기준 1·2·3.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | `docs/mdm/screens/README.md:23,53`, TSK-08-02 design §0(D1 — spec 의 `mdr` 는 낡은 값) |
| mesModule | `m-mdm` | 01 A.4.5 |
| 화면식별자 (screenId) = pageName = serviceId = OBJECT_ID | `ruleMng` | design I23 |
| 페이지 유형 | `B`(조회 + 등록 폼) | |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleMng/{action}` | design §6.1 |
| 주요 API path (BFF→BE) | `POST /oasis/ruleMng/{action}` | 상동 |
| Frontend 파일 | `m-mdm/pages/dme/ruleMng/page.tsx`(+ `api.ts`·`types.ts`·`components/RuleRegisterForm.tsx`) | design §2.1-FM |
| tsup entry key | `pages/dme/ruleMng/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`(READ)·`reg`(EDIT) | design §6.1·I23 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 룰(`ruleMng`) | `DataInitializer.seedMdmRuleMenus()` |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 룰 ID·명 키워드, 종류, 상태 |
| `A-GRID` | 룰 목록 | 서버 페이징(한 페이지 20건). 룰 ID 를 누르면 룰 화면으로 간다 |
| `A-PAGE` | 페이지 이동 | shared `Pagination`(이전·다음, 총 건수) |
| `A-REG` | 등록 폼 | MDM 원천 룰 등록 |
| `A-BTN` | 버튼 | `MdmPageLayout.buttons`(조회) |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_RULE_ID`/`MARU_RULE_NAME` | 룰 ID·명 | TextBox | N | (빈값) | ID(대소문자 무시) 또는 룰명 부분 일치. `%`·`_` 는 글자 그대로(I29) |
| S-002 | `RULE_KIND` | 종류 | ComboBox | N | 전체 | §10 LV-001 |
| S-003 | `STATUS` | 상태 | ComboBox | N | 전체 | §10 LV-002 |

### 3.2 조회 결과 (그리드 컬럼)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `MARU_RULE_ID` | 룰 ID | 링크 — 누르면 룰 화면 탭(`openRuleEdit`) | Left | varchar(50) |
| G-002 | `MARU_RULE_NAME` | 룰명 | | Left | text |
| G-003 | `RULE_KIND` | 종류 | 판정(DECISION)·산출(DERIVE) | Left | LV-001 |
| G-004 | `SOURCE_KIND` | 원천 | MDM·EXTERNAL | Center | |
| G-005 | `STATUS` | 상태 | 배지(작성·사용 중·폐기) | Center | LV-002 |
| G-006 | (계산) | 적용 버전 | 지금 적용 중인 RELEASED(`APPLY_FROM <= 지금 < APPLY_TO`) 버전 | Center | int |
| G-007 | `TB_MDM_RULE_VER.HIT_POLICY` | 적중 정책 | G-006 버전의 적중 정책 | Center | |
| G-008 | (계산) | 미적용 버전 | 미적용 버전(DRAFT·REQUESTED·APPROVED·적용 전 RELEASED) 중 VER 최대의 `버전 상태 · 소유자` | Left | |

> 정렬은 서버가 `MARU_RULE_ID` 로 한다(헤더 클릭 정렬 없음). 배포 대상 칸은 두지 않는다(D11).

## 4. 등록 폼 필드 정의 (영역: A-REG)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_RULE_ID` | 룰 ID | TextBox | Y | (빈값) | 컬럼 물리명 규칙(V-001). 어기면 입력 칸 아래 즉시 안내하고 등록 버튼을 막는다 |
| D-002 | `MARU_RULE_NAME` | 룰명 | TextBox | Y | (빈값) | 100자 이하 |
| D-003 | `RULE_KIND` | 종류 | ComboBox | Y | DECISION | DECISION 이면 VER 1 적중 정책 FIRST, DERIVE 면 비움 |
| D-004 | `SOURCE_KIND` | 원천 | (표시만) | — | MDM | 고르는 칸이 없다. 서버가 `MDM`·`SOURCE_SYSTEM=NULL` 로 쓴다(수용 2, I2) |
| D-005 | `DESCRIPTION` | 설명 | Textarea | N | (빈값) | |
| D-006 | `USAGE_NOTE` | 활용처 메모 | Textarea | N | (빈값) | |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | toolbar | `search` | A-FILTER 조건으로 0 페이지부터 조회 |
| B-002 | 룰 등록 | A-REG | `reg` | 등록 후 목록을 다시 조회하고 룰 화면 탭을 연다 |
| B-003 | 이전·다음 | A-PAGE | `search` | 마지막으로 조회한 조건으로 해당 페이지 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

| 버튼ID | 버튼명 | 소속 그리드 | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | (룰 ID 링크) | A-GRID | G-001 | `openRuleEdit(ruleId)` | sessionStorage `mdm.dme.ruleEdit.target` + `mdm-rule-edit-target` 이벤트 + `portal-open-tab`(`mdm:dme/ruleEdit`) (I28) |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| B-001 | 클릭·Enter | 없음 | 1) 조건 수집(빈 칸은 보내지 않음) 2) `search{keyword?, ruleKind?, status?, page: 0, size: 20}` 3) 목록·총 건수 바인딩 | `search` |
| B-002 | 클릭 | V-001·V-002 통과, `reg` 권한 | 1) `reg{maruRuleId, maruRuleName, ruleKind, description?, usageNote?}` 2) 성공 시 폼 비우고 목록 재조회 3) `openRuleEdit(id, 1)` 4) 실패 시 서버 메시지를 오류 모달로 | `reg` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 없음(룰 ID 링크만 이동) |
| 헤더 클릭 | 정렬 없음(서버 정렬) |
| 페이지 변경 | 서버 페이징 — `page`(0부터)·`size` 20 |
| 빈 상태 | "조회된 룰이 없습니다." 문구 + 건수 0건 |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | D-001 | 필수, `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, 50자 이하(`NamingRules.STD_PHYS_NAME`·`CODE_MAX`, I1) | 룰 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다 |
| V-002 | D-002 | 필수, 100자 이하 | 룰명은 100자 이하입니다 |

### 6.2 연관 검증 (서버)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | 같은 룰 ID 가 이미 있다 | 같은 룰 ID 가 이미 있습니다: {id} |
| XV-002 | `sourceKind` 가 비어 있지 않고 MDM 이 아니다 | 룰 등록은 원천 MDM 만 받습니다 … |
| XV-003 | 등록자가 담당자 역할이 아니다 | MDM013 담당자 역할이 있어야 할 수 있습니다 |

서버는 화면 검사를 믿지 않고 V-001·V-002·XV 전부를 다시 본다(수용 1 — e2e T5 가 요청을 가로채 규칙 위반 ID 를 보내 확인).

## 7. 상태 정의 및 상태별 제어

룰 상태(`TB_MDM_RULE.STATUS`)는 이 화면에서 바꾸지 않는다. 등록은 CREATED 로 쓴다. 버전 상태·소유권은 룰 화면(`ruleEdit`)이 다룬다.

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | `search`(READ) |
| 등록 | O | O | X | `reg`(EDIT) + 서버 담당자 역할 검사(`RuleStewardCheck`). 권한이 없으면 버튼을 숨기지 않고 비활성으로 둔다(§6.7.0) |

> dme 권한 매트릭스: `MDM_STEWARD → PERM_MDM_CONFIRM`, `MDM_STD_ADMIN → PERM_MDM_READ`(design F16).

## 9. 연동 화면 / 팝업

| 대상 | 방식 | 넘기는 값 |
|---|---|---|
| 룰 화면(`ruleEdit`) | `@/dme/rule-handoff` `openRuleEdit(ruleId, ver?)` — 포털 탭 열기 | 룰 ID(등록 직후는 버전 1) |

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 |
|---|---|---|
| LV-001 `RULE_KIND` | `DECISION`/`DERIVE` | 판정(DECISION)/산출(DERIVE) |
| LV-002 `STATUS` | `CREATED`/`INUSE`/`DEPRECATED` | 작성/사용 중/폐기 |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | 화면 그룹 `dme`(spec 의 `mdr` 아님) | design D1 |
| N-2 | 배포 대상 칸·조건·EXTERNAL 등록 변형은 두지 않는다 | design D11, spec "⑦배포 대상은 보류" |
| N-3 | 빈 상태 문구를 그리드 오버레이가 아니라 목록 아래 글자로 보인다 | shared `AgDataGrid` 는 조회가 끝나 `loading` 이 풀릴 때 `hideOverlay()` 로 빈 행 오버레이까지 지운다(e2e 실측) |
| N-4 | 목록 칸은 `columnSizing="fit"` + `minWidth` 로 줄어들게 한다 | 등록 폼과 나란히 두면 1280 폭에서 칸이 가상화되어 적중 정책 칸이 그려지지 않았다(e2e 실측) |
