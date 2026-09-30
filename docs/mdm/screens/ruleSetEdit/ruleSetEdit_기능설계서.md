---
screenId: ruleSetEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-26
작성자: Agent
---

# mdm — 룰 세트 편집 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-08-02 `ruleEdit` 선례)**: 본 화면은 **As-Is 레거시가 없는 신규 화면**이라
> 분석리포트가 없고 5종 설계 산출물 게이트가 성립하지 않는다. 5종을 **기능설계서 1종**으로 줄여 쓴다. 표는 원천 설계
> (`docs/mdm/design/basic/06-business-rule.md`)와 선행 Design 산출물(`docs/mdm/tasks/TSK-08-06/design.md`)을 근거로 삼는다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dme` / pageName `ruleSetEdit` /
> pageId `ruleSetEdit` / 페이지 유형 `B` / tsup entry key `pages/dme/ruleSetEdit/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 룰 세트 편집 |
| 화면 식별자 | `ruleSetEdit` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dme`(업무기준) |
| 화면 목적 | 세트 하나를 골라 룰 목록의 순서를 편집(▲▼✕·드래그·룰 추가·구성 지침 적용)하고, 순서가 바뀔 때마다 세트 입출력 표·의존 룰·세트 검사를 화면에서 즉시 다시 계산한다. 저장하면 서버가 같은 검사를 다시 돌려 거부(순환·순서·없는 룰 등)가 있으면 거부하고, 경고(중복 대입 등)만 있으면 저장한다. 폐기·되살리기도 이 화면에서 한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·편집) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 세트 편집, 룰 세트(`ruleSetMng`) 등록 성공·세트 ID 링크 |

근거: 06:756 「화면」 룰 세트 편집, 06:766 폐기 확인, 06:1092 저장 시 검사, 06:1110-1122 구성 지침, 시안 H:309-336, TSK-08-06 design §6.2~§6.6·§6.9·§6.10, 수용 기준 3·4·5.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | `docs/mdm/screens/README.md`, design D1 |
| mesModule | `m-mdm` | 01 A.4.5 |
| 화면식별자 (screenId) = pageName = serviceId = OBJECT_ID | `ruleSetEdit` | design I17 |
| 페이지 유형 | `B`(상단 고르기 + 상세 편집 카드 2개) | 08-02 `ruleEdit` 골격(그 기능설계서에는 유형 칸이 없어 조회+상세 계열 `B` 로 둔다) |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleSetEdit/{action}` | design §6.12 |
| 주요 API path (BFF→BE) | `POST /oasis/ruleSetEdit/{action}` | 상동 |
| Frontend 파일 | `m-mdm/pages/dme/ruleSetEdit/page.tsx`(+ `api.ts`·`types.ts`·`set-model.ts`·`links.ts`·`state/useRuleSetEdit.ts`·`cards/{RuleSetCard,RuleListGrid,SetIoTables,GuideCard}.tsx`) | design §2.3 |
| tsup entry key | `pages/dme/ruleSetEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`(READ), `save`·`delete`(폐기)·`restore`(되살리기)(EDIT) | design §6.12·I17 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 룰 세트 편집(`ruleSetEdit`, seq 005, fullSeq 5050500) | `DataInitializer.seedMdmRuleSetMenus()`, design D12 |
| 화면 간 파라미터 | `useMdmPageParams("dme/ruleSetEdit", tabId, p => open(p.setId))` | design I22 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-TOP` | 세트 고르기 바 | 세트 ID·세트명 검색(`set-pick-keyword`) + 찾기 → 칸 아래 드롭다운 후보(`set-pick-list` 안 `set-pick-{setId}`, 룰 화면 룰 고르기와 같은 `IdPicker` — ↑↓·Enter·Esc, 20건이면 좁혀 검색 안내), 현재 세트(`set-edit-current`, `ID · 세트명`). 고르기 전에는 "세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다" |
| `A-SET` | 룰 세트 카드(span 10) | 머리(세트 ID·상태 배지·`row_version N`·"버전·승인 없음"), 세트명·설명, 룰 목록 그리드, 룰 추가, 세트 검사, 세트 입출력 표, 버튼, 메시지 |
| `A-GUIDE` | 세트 구성 지침 카드(span 6) | 결과 변수를 적으면 그 변수를 만드는 룰부터 조건 변수를 거슬러 올라가 의존 순서를 제안한다 |

## 3. 조회조건 정의 (영역: A-TOP)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_RULE_SET_ID`/`MARU_RULE_SET_NAME` | 룰 세트 | TextBox | N | (빈값) | `search{target:"SET", keyword}` — ID 대문자 포함 또는 세트명 포함, ID 순 20건. 후보는 `ID · 세트명 · 상태` |

### 3.2 조회 결과 (그리드 컬럼 — 룰 목록 `set-rules-grid`)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | (목록 순번) | 순서 | 드래그 손잡이(편집 가능할 때만) | Center | int |
| G-002 | `RULE_IDS[i]` | 룰 ID | 링크 `set-rule-link-{id}` → `openRuleEdit(ruleId)` | Left | |
| G-003 | `MARU_RULE_NAME` | 룰명 | 없는 룰이면 "(없음)" | Left | |
| G-004 | `RULE_KIND`·`HIT_POLICY` | 종류·정책 | `DECISION · FIRST` / `DERIVE` | Left | |
| G-005 | (계산) | 조건 변수 | 칩. DICT 이거나 앞에서 아직 안 만들어진 PROG 면 보통 칩, 그 밖은 붉은 칩이고 앞에서 만들어지지 않은 것에는 "앞에 없음" 배지 | Left | |
| G-006 | (계산) | 결과 변수 | 칩 | Left | |
| G-007 | (계산) | 의존 룰 | 세트 안에서 이 룰의 DICT 아닌 조건을 만드는 룰(링크). 목록에서 뒤에 있으면 "뒤에 있음" 배지(`set-dep-later-{id}-{dep}`), 없으면 "없음" | Left | |
| G-008 | — | 동작 | ▲(`set-rule-up-{id}`)·▼(`set-rule-down-{id}`)·✕(`set-rule-remove-{id}`). 편집 가능할 때만 칸이 있다 | Center | |

### 3.3 세트 입출력 표 (`SetIoTables`, 저장하지 않는 계산값)

| 표 | 칸 | 설명 |
|---|---|---|
| 입력 변수(`set-io-inputs`, 행 `set-io-input-{이름}`) | 변수·표시명·타입·출처·읽는 룰 | 머리 "입력 변수 N개 · 세트를 부를 때 레코드에 넣어야 하는 값". 출처 배지 "컬럼 사전"(DICT)/"프로그램 변수"(PROG)/"어디에도 없음"(NONE). 앞 룰이 만들기 전에 읽는 이름도 여기 잡힌다 |
| 결과 변수(`set-io-results`, 행 `set-io-result-{이름}`) | 변수·타입·구분·만드는 룰·읽는 룰 | 머리 "결과 변수 N개 · 최종 a개, 중간 b개". 최종 먼저. 만드는 룰이 둘 이상이면 "덮어씀" 배지 |

타입 표시: NUMBER 는 `Number(scale 또는 -)`, 일자 String 은 "일자 String", 코드 도메인은 "코드 String", 그 밖은 dataType, 없으면 "-".

## 4. 편집 필드 정의 (영역: A-SET)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_RULE_SET_NAME` | 세트명 | TextBox(`set-name`) | Y | 불러온 값 | 100자 이하 |
| D-002 | `DESCRIPTION` | 설명 | Textarea(`set-desc`) | N | 불러온 값 | 빈 값은 null |
| D-003 | `RULE_IDS` | 룰 목록 | 그리드 편집(▲▼✕·드래그·룰 추가·지침 적용) | — | 불러온 목록 | JSON 배열(요청 순서 그대로 저장). 같은 룰은 두 번 담지 않는다(D15) |
| D-004 | — | 룰 추가 | TextBox(`set-rule-add-keyword`) + 찾기(`set-rule-add-find`) | — | — | `search{target:"RULE"}` 룰 ID·룰명 앞부분 20건(후보 `set-rule-cand-{id}`, 룰명·상태). 누르면 목록 끝에 더한다. 이미 있으면 "이미 담은 룰이다" |
| D-005 | — | 지침 결과 변수 | TextBox(`set-guide-var`) + 찾기(`set-guide-run`) | — | — | `search{target:"GUIDE", resultVar}` |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 찾기 | A-TOP | `search`(SET) | 세트 후보 |
| B-002 | 세트 저장(`set-save`) | A-SET | `save` | dirty && editable && `save` 권한일 때만 켜진다. 화면 검사의 거부는 버튼을 막지 않는다(D9) |
| B-003 | 폐기(`set-deprecate`) → 폐기 확인(`set-deprecate-confirm`)/취소 | A-SET | `delete` | INUSE·editable·`delete` 권한. 두 단계로만 폐기한다(D14, I14) |
| B-004 | 되살리기(`set-restore`) | A-SET | `restore` | DEPRECATED·restorable·`restore` 권한 |
| B-005 | 다시 불러오기 | A-SET | `view` | MDM001 충돌 뒤에만 보인다 |
| B-006 | 찾기(룰 추가) | A-SET | `search`(RULE) | |
| B-007 | 찾기(지침) | A-GUIDE | `search`(GUIDE) | |
| B-008 | 이 순서를 목록에 적용(`set-guide-apply`) | A-GUIDE | (없음) | 목록을 제안 순서로 바꾸고 응답 `rules` 의 입출력을 더한다(dirty). editable·`save` 권한 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

| 버튼ID | 버튼명 | 소속 그리드 | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | (룰 ID 링크) | 룰 목록 | G-002 | `openRuleEdit(ruleId)` | 룰 화면 탭 |
| GB-002 | (의존 룰 링크) | 룰 목록 | G-007 | `openRuleEdit(dep)` | |
| GB-003 | ▲ / ▼ / ✕ | 룰 목록 | G-008 | `moveUp`·`moveDown`·`remove` | 서버를 부르지 않고 즉시 다시 계산(I21) |
| GB-004 | (변수 링크 `set-var-link-{이름}`) | 입출력 표 | 변수 | DICT → `openMdmPage("dma/columnMng")`(파라미터 없음, D13), 결과 변수 → 만드는 첫 룰의 `openRuleEdit` | PROG·NONE 은 링크 없음(title "컬럼 사전 밖 이름이라 갈 곳이 없다") |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| (세트 열기) | 후보 클릭·넘겨받은 setId | dirty 면 확인 "저장하지 않은 변경이 있습니다. 버리고 이동할까요?" | `view{setId}` → 세트·멤버 룰 입출력·검사·`editable`·`restorable` | `view` |
| B-002 | 클릭 | dirty, 권한 | 1) `save{setId, setName, description?, rowVersion}` + `grids.rules.rows=[{ruleId}…]` 2) 성공 "저장 · row_version N" + 경고 줄 3) 거부는 서버 `meta.message`(`set-message`), 편집 중 목록은 둔다 4) MDM001 은 "다른 창에서 바뀌었습니다. 다시 불러오세요" + 다시 불러오기 5) 분기 세트(`set.branched`)는 버튼이 꺼진다. 서버는 `flow` 없는 save 가 분기 세트에 오면 MDM024 + `FLOW_READONLY` 로 거부한다(흐름을 한 줄로 덮어쓰지 않는다). 요청에 `flow` 가 있으면 서버가 흐름으로 검사하고 FLOW_JSON 과 펼친 RULE_IDS 를 함께 저장한다 | `save` |
| B-003 | 폐기 → 폐기 확인 | INUSE | 1) 폐기를 누르면 경고 "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다."와 폐기 확인/취소 2) 폐기 확인 → `delete{setId, rowVersion}` 3) "폐기 · row_version N. 행은 남기고 되살릴 수 있다" | `delete` |
| B-004 | 클릭 | DEPRECATED | `restore{setId, rowVersion}` → 저장된 목록으로 검사를 다시 돌려 거부가 없을 때만 INUSE. "되살림 · row_version N" + 경고 | `restore` |
| B-007 | 클릭·Enter | 결과 변수 입력 | `search{target:"GUIDE", resultVar}` → 오류(`set-guide-error`) 또는 "제안 순서 · 1. A → 2. B …" + "고르기" 배지(한 결과 변수를 만드는 룰이 둘 이상) | `search` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 드래그 | ag-grid managed row drag(`rowDragField="seqNo"`), 끝나면 `onRowOrderChange(순서)` → 즉시 재계산. 편집 가능할 때만 |
| 헤더 클릭 | 정렬 없음(목록 순서가 곧 실행 순서) |
| 빈 목록 | "룰이 없다. 아래에서 룰을 더하거나 오른쪽 지침으로 순서를 받는다" |
| 즉시 재계산 | 목록이 바뀔 때마다 `set-model.ts` 의 `setIo`·`setDeps`·`setChecks` 로 입출력 표·의존 룰·검사 목록을 다시 그린다. 서버를 부르지 않는다(I21) |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증 (요청 검사, 쓰기 전에 거부 — I13)

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | D-001 | 필수, 100자 이하 | 세트명은 필수입니다. / 세트명은 100자 이하여야 합니다. |
| V-002 | D-003 | 룰 ID 마다 `RuleIdRules.validateRuleId` | 룰 ID 는 컬럼 물리명 규칙 … |
| V-003 | D-003 | 같은 룰 ID 두 번 | MDM021 입력값이 올바르지 않습니다: … |
| V-004 | `rowVersion` | 필수 | (REQUIRED_VALUE) |

### 6.2 연관 검증 — 세트 검사 (서버 `RuleSetAnalyzer`·화면 `set-model.ts` 같은 알고리즘·같은 문구, 코퍼스 `rule-set-corpus.json` 이 고정)

| 규칙ID | 코드 | 심각도 | 조건 | 문구 |
|---|---|---|---|---|
| XV-001 | `EMPTY` | 거부 | 룰이 없다 | 룰이 하나도 없다 |
| XV-002 | `RULE_NOT_FOUND` | 거부 | 없는 룰 | {id}는 없는 룰이다 |
| XV-003 | `RULE_DEPRECATED` | 거부 | 폐기된 룰 | {id}는 DEPRECATED다 |
| XV-004 | `NO_RELEASED` | 경고 | RELEASED 버전이 없는 룰(D5) | {id}는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다 |
| XV-005 | `ORDER` | 거부 | 뒤 룰이 만드는 결과 변수를 앞 룰이 읽는다 | {id}가 뒤에 도는 {later}의 결과 변수 {var}를 읽는다. {later[0]}를 {id} 앞으로 옮긴다 |
| XV-006 | `CYCLE` | 거부 | 뒤 룰이 의존 그래프를 따라 이 룰에 닿거나 이 룰 결과를 읽는다(이행적, D6) | {id}와 {cyc}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다 |
| XV-007 | `UNKNOWN_INPUT` | 거부 | 컬럼 사전에도 없고 프로그램 변수도 아니며 세트 안 어느 룰도 만들지 않는 조건 변수 | {id}의 조건 변수 {var}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다 |
| XV-008 | `DUP_RESULT` | 경고 | 같은 결과 변수에 두 룰 이상이 대입 | {prev}와 {id}가 같은 결과 변수 {var}에 대입한다 |
| XV-013 | `FLOW_STRUCTURE` | 거부 | 흐름 구조 오류(시작·끝 개수, 없는 노드, 선 개수, 룰 ID 없음, 짝 합류, 병렬 갈래 조건·순서, 갈래가 짝 합류 밖으로 나감, 도달 불가). 1단계 검사는 모든 오류를 모아 보고하고 2단계 검사는 첫 오류에서 멈춘다. 순서·문구의 정본은 엔진 `kr.dongkuk.maru.mdm.engine.flow.FlowParser`, 화면 `pages/dme/ruleSetEdit/flow-model.ts`, 코퍼스 `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json` 이다 | 예: 분기 {id}를 닫는 합류가 {n}개다. 정확히 1개여야 한다 / 갈래가 {stop}에서 닫히지 않고 {cur}로 나간다 / {id}에 도달할 수 없다 |
| XV-014 | `FLOW_IF_ELSE` | 거부 | IF 의 "그 외" 갈래가 1개가 아니거나 "그 외" 가 아닌 갈래에 조건식이 없다 | IF {id}에 "그 외" 갈래가 {n}개다. 정확히 1개여야 한다 / IF {id}의 갈래 {edgeId}에 조건식이 없다 |
| XV-015 | `FLOW_COND` | 거부 | 갈래 조건식을 파싱할 수 없거나 그 지점에서 정의되지 않은 변수를 읽는다(불린이 아닌 결과는 실행 때 `BRANCH_EVAL_ERROR`) | {edgeId} 갈래 조건식을 읽을 수 없다: {오류} / {edgeId} 갈래 조건식이 읽는 {var}는 이 지점에서 정의되지 않았다 |
| XV-016 | `IF_SIBLING` | 거부 | IF 갈래 안의 룰이 같은 IF 의 다른 갈래에서만 만들어지는 결과를 읽는다 | {id}가 읽는 {var}는 같은 IF 의 다른 갈래({others})에서만 만들어진다. 이 갈래를 타면 값이 없다 |
| XV-017 | `PAR_SIBLING` | 거부 | 병렬 갈래가 형제 갈래의 결과를 읽거나 형제 갈래들이 같은 결과 변수를 쓴다 | {id}가 병렬 형제 갈래의 {other}가 만드는 {var}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다 / 병렬 갈래의 {other}와 {id}가 같은 결과 변수 {var}에 대입한다 |
| XV-018 | `FLOW_PARTIAL` | 경고 | IF 합류 뒤의 룰·조건식이 일부 갈래에서만 만들어지는 변수를 읽는다(실행 때 그 룰 직전에 키를 확인) | {id}가 읽는 {var}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다 |
| XV-019 | `FLOW_READONLY` | 거부 | 분기 세트에 `flow` 없는 목록 저장이 왔다 | 분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다 |
| XV-009 | (MDM024) | — | 거부가 하나라도 있으면 저장·되살리기 거부 | 룰 세트 저장 검사를 통과하지 못했습니다: {ruleId}[{var}] {code} {문구}; … |
| XV-010 | (MDM001) | — | `ROW_VERSION` 불일치 | 다른 창에서 바뀌었습니다(화면 안내) |
| XV-011 | (MDM009) | — | DEPRECATED 세트 저장·이미 DEPRECATED 폐기·INUSE 되살리기 | MDM009 허용되지 않는 상태 전이입니다 |
| XV-012 | (MDM013) | — | 쓰기(save·delete·restore) 요청자가 담당자가 아니다 | MDM013 담당자 역할이 있어야 할 수 있습니다 |

서버는 화면 검사 결과를 받지 않고 요청 목록으로 다시 계산한다(I12). 흐름 세트는 같은 검사를 흐름 경로 기준으로 한다: `ORDER`·`CYCLE`·`DUP_RESULT` 는 같은 경로 위의 룰끼리만 보고, IF 의 서로 다른 갈래가 같은 결과를 쓰는 것은 정상이다. 검사 항목에는 흐름 위치 `nodeId`·`edgeId` 가 붙는다(목록 세트는 null). 1단계 화면은 분기 세트의 검사를 다시 계산하지 않고 서버 `view.checks` 를 그대로 보인다.

## 7. 상태 정의 및 상태별 제어

| 상태 | 세트명·설명·룰 목록(▲▼✕·드래그)·룰 추가·지침 적용 | 세트 저장 | 폐기 | 되살리기 |
|---|---|---|---|---|
| `INUSE` | 편집 가능(editable·`save` 권한일 때) | dirty 일 때 | O | — |
| `DEPRECATED` | 비활성(그리드 동작 칸·드래그 없음) | 비활성 | — | O |
| `INUSE` + 분기 세트(`set.branched`) | 비활성 — 안내 "분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다"(`set-branched-notice`), 룰 링크는 동작 | 비활성(서버도 `FLOW_READONLY` 로 거부) | O | — |

세트에는 버전·DRAFT·선점이 없다. 저장은 `ROW_VERSION` 조건부 UPDATE 한 번이고, 동시 편집은 MDM001 로만 막는다(I3·D16).

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 세트 고르기·보기·룰 검색·지침 찾기 | O | O | O | `search`·`view`(READ) |
| 저장·폐기·되살리기·목록 편집·지침 적용 | O | O | X | `save`·`delete`·`restore`(EDIT) + 서버 `RuleStewardCheck.requireSteward()`, view 의 `editable`·`restorable` 은 `isSteward()`. 권한이 없으면 버튼을 비활성으로 둔다 |

## 9. 연동 화면 / 팝업

| 대상 | 방식 | 넘기는 값 |
|---|---|---|
| 룰 세트(`ruleSetMng`) → 이 화면 | `openMdmPage("dme/ruleSetEdit", {setId})` / `useMdmPageParams` | 세트 ID |
| 룰 화면(`ruleEdit`) | `@/dme/rule-handoff` `openRuleEdit(ruleId)` | 룰 ID |
| 컬럼 사전(`columnMng`) | `openMdmPage("dma/columnMng")` | 없음(D13) |

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 |
|---|---|---|
| LV-001 `STATUS` | `INUSE`/`DEPRECATED` | 코드 그대로(배지) |
| LV-002 출처 | `DICT`/`PROG`/`NONE` | 컬럼 사전/프로그램 변수/어디에도 없음 |
| LV-003 심각도 | `REJECT`/`WARN` | 거부/경고 |
| LV-004 결과 구분 | (계산) | 최종(어느 룰도 다시 읽지 않음)/중간 |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | **세트 값 테스트 카드 — 이번 범위에서 제외.** 06:756 은 카드를 두라고 했지만 시안에 없고, 운영 DB 를 읽는 엔진 정의 조회(`DefinitionLookup`) 구현이 리포에 없다(`MdmEngineConfig` 의 `EMPTY_DEFINITIONS`). 룰 값 테스트(TSK-08-04)가 같은 조회기를 만들 자리라 여기서 먼저 만들면 겹친다. 수용 기준에 값 테스트가 없다. **후속 조건**: 08-04 의 조회기가 머지되면 이 화면에 카드 하나(`view` 옆 `execute` action)로 더한다 **2026-09-30 갱신**: 룰 세트 흐름도 1단계에서 운영 정의 조회기(`StoredDefinitionLookup`)와 실행기(`RuleSetRunner`)가 생겼다. 카드는 목록 화면에 먼저 만들지 않고 2단계 디버거(시뮬레이션 탭)와 `simulate` action 으로 넣는다(D-108, mdm ADR-0005 D4) | design D2, spec 제약 "화면 설계 산출물에서 포함 여부 확정", D-108 |
| N-2 | 화면 그룹 `dme`(spec 의 `mdr` 아님) | design D1 |
| N-3 | "지금 RELEASED" = RELEASED 가운데 VER 최대 | design D3·I7 |
| N-4 | 룰 하나의 입출력은 엔진이 세트 실행 전에 요구하는 키와 같게 새로 정의(`RuleIoReader`). 룰 화면 활용처 카드(`RuleUsageFinder`)는 고치지 않아 드문 룰에서 의존 룰이 다르게 보일 수 있다 | design D4 |
| N-5 | 순환은 이행적으로 본다(세 룰 고리도 `CYCLE`) | design D6 |
| N-6 | 구성 지침 생산자 = DEPRECATED 아니고 RELEASED 있는 룰, 룰 ID 순 첫 룰, 여럿이면 "고르기". DICT·PROG 는 거슬러 찾지 않는다. 제안일 뿐 저장하지 않는다 | design D7·I16 |
| N-7 | 저장 거부는 오류 코드 `MDM024`(400) + 상세 message. 병렬 Task 와 번호가 겹치면 머지하는 쪽이 다음 번호로 바꾼다 | design D8 |
| N-8 | 화면 즉시 검사는 저장 버튼을 막지 않는다(서버가 판정) | design D9 |
| N-9 | "저장 즉시 배포"는 보류 — 저장·폐기·되살리기는 `TB_MDM_RULE_SET` 한 행만 바꾼다 | design D11·I23, PRD FR-E5 |
| N-10 | 폐기는 두 단계 버튼(폐기 → 폐기 확인/취소) | design D14 |
| N-11 | 같은 룰을 두 번 담지 않는다 | design D15 |
| N-12 | 룰 목록 그리드는 `columnSizing="fit"` + 열마다 `minWidth` 로 카드 폭에 맞춰 줄인다(TSK-08-02 ruleMng N-4 선례). 고정 폭(열 합 약 1,160px)일 때는 기본 폭 1280 에서 ag-grid 가 의존 룰·동작(▲▼✕) 열을 그리지 않았다. **해결됨(fit + minWidth)** — 동작 열 minWidth 120 은 세 버튼이 잘리지 않는 폭이고, 좁은 폭에서는 룰명·종류·정책·결과 변수 칸이 말줄임으로 줄어든다. e2e E2 가 기본 폭에서 동작·의존 룰 열을 단언한다 | TSK-08-06 build-log B8 「설계 이탈」 |
| N-13 | e2e `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`(E1~E10, 스모크 넷 = E1·E2·E5·E8), 픽스처 `e2e/fixtures/mdm-ruleSet-data.sql` | design §3.4.2 |
| N-14 | **흐름 저장(1단계)** — `TB_MDM_RULE_SET.FLOW_JSON`(흐름 정의 + 화면 전용 view)을 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다(요청의 룰 목록을 믿지 않는다). `FLOW_JSON` 이 NULL 이면 `RULE_IDS` 순서의 한 줄 흐름이다. 분기 세트는 목록 편집으로 저장할 수 없다(`FLOW_READONLY`) | 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3, D-107 |
| N-15 | 흐름 세트의 입출력 표·의존 룰은 흐름을 펼친 룰 목록으로 계산한다(1단계). 흐름 기준 입출력은 2단계 캔버스에서 필요해지면 다시 정한다 | D-107(편차 D10) |
