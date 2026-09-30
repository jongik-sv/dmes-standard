---
screenId: ruleSetEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-26
개정일: 2026-09-30 (룰 세트 흐름도 2단계 — 캔버스 편집기·디버거)
작성자: Agent
---

# mdm — 룰 세트 편집 기능설계서

> **2026-09-30 개정(룰 세트 흐름도 2단계)**: 룰 목록 그리드 자리가 React Flow 캔버스로 바뀌었다. 분기(IF·병렬)를 그려 저장하고, 저장 전 흐름을
> 서버에서 기록 실행해 노드 단위로 따라가는 디버거가 붙었다. 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §7·§8, 결정 D-111~D-117.

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
| 화면 목적 | 세트 하나를 골라 **흐름도 캔버스**에서 룰 박스와 분기(IF·병렬)를 그려 편집하고, 흐름이 바뀔 때마다 세트 입출력 표·세트 검사를 화면에서 즉시 다시 계산한다. 저장하면 서버가 같은 검사를 다시 돌려 거부(순환·순서·없는 룰·흐름 구조 오류 등)가 있으면 거부하고, 경고만 있으면 저장한다. 저장하지 않은 흐름을 레코드 하나로 서버에서 기록 실행해 노드를 한 단계씩 따라가 보는 디버거(시뮬레이션 탭)가 있다. 폐기·되살리기도 이 화면에서 한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·편집·디버거) / 표준 관리자(`MDM_STD_ADMIN`, 조회만 — 디버거 실행 불가, P-D3) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 세트 편집, 룰 세트(`ruleSetMng`) 등록 성공·세트 ID 링크 |

근거: 06:756 「화면」 룰 세트 편집, 06:766 폐기 확인, 06:1092 저장 시 검사, 06:1110-1122 구성 지침, 시안 H:309-336, TSK-08-06 design §6.2~§6.6·§6.9·§6.10, 수용 기준 3·4·5. 2단계: 스펙 §7(캔버스)·§8(디버거)·§9.1, 결정 D-111~D-117.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | `docs/mdm/screens/README.md`, design D1 |
| mesModule | `m-mdm` | 01 A.4.5 |
| 화면식별자 (screenId) = pageName = serviceId = OBJECT_ID | `ruleSetEdit` | design I17 |
| 페이지 유형 | `B`(상단 고르기 + 툴바 + 캔버스·오른쪽 패널·아래 패널 분할) | 08-02 `ruleEdit` 골격(그 기능설계서에는 유형 칸이 없어 조회+상세 계열 `B` 로 둔다) |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleSetEdit/{action}` | design §6.12 |
| 주요 API path (BFF→BE) | `POST /oasis/ruleSetEdit/{action}` | 상동 |
| Frontend 파일 | `m-mdm/pages/dme/ruleSetEdit/` 아래 — `page.tsx`, `api.ts`, `types.ts`, `links.ts`, 순수 모듈 `set-model.ts`(목록 함수는 코퍼스 동치 테스트용, `flowIo`·`flowChecks`)·`flow-model.ts`(파싱·구조 검사)·`flow-edit.ts`(편집 연산)·`flow-layout.ts`(dagre 배치)·`flow-vars.ts`(변수 칩·검사 표시·가장 가까운 선)·`trace-view.ts`(기록 해석), 상태 `state/useRuleSetEdit.ts`, 캔버스 `canvas/{FlowCanvas,FlowToolbar,FlowPalette,RuleSearchModal,nodes,overlay,react-flow}`, 패널 `panels/{SetPanel,PropertyPanel,ChecksPanel,BottomPanel}`, 카드 `cards/{SetIoTables,GuideCard}`, 디버거 `debugger/{SimulationPanel,TraceStepper,TraceDetail,ValueTable,useSimulation}` | 2단계 계획 Task 5~11, 1단계 목록 카드(`RuleSetCard`·`RuleListGrid`)는 삭제(D-113) |
| tsup entry key | `pages/dme/ruleSetEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`(READ), `save`·`delete`(폐기)·`restore`(되살리기)·`validate`(조건식 IO)·`execute`(기록 실행 = 디버거)(EDIT). 서비스 메서드는 `validate`→`condIo`, `execute`→`simulate` | design §6.12·I17, 2단계 P5·P-D2, D-112 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 룰 세트 편집(`ruleSetEdit`, seq 005, fullSeq 5050500) | `DataInitializer.seedMdmRuleSetMenus()`, design D12 |
| 화면 간 파라미터 | `useMdmPageParams("dme/ruleSetEdit", tabId, p => open(p.setId))` | design I22 |

## 2. 화면 영역 정의

화면은 위에서 아래로 상단 바 → 흐름 툴바 → (캔버스 | 오른쪽 패널) → 아래 패널이다. 분할선은 끌어 크기를 바꾼다(`ContentBody resizable`, 저장 키 `mdm.dme.ruleSetEdit`·`.main`).
오른쪽 패널은 계획의 `ResizableFormPanel` 대신 `ContentBody resizable` + `ContentPanel width=360` 이다(FrontEnd Part B §4-3 이 신규 화면의 `ResizableFormPanel` 사용을 금지한다).

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-TOP` | 세트 고르기 바(`set-edit-topbar`) | 세트 ID·세트명 검색(`set-pick-keyword`) + 찾기 → 칸 아래 드롭다운 후보(`set-pick-list` 안 `set-pick-{setId}`, 룰 화면 룰 고르기와 같은 `IdPicker` — ↑↓·Enter·Esc, 20건이면 좁혀 검색 안내), 현재 세트(`set-edit-current`, `ID · 세트명`). 고르기 전에는 "세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다"(`set-edit-empty`) |
| `A-TOOL` | 흐름 툴바(`flow-toolbar`) | 세트 ID(`set-card-id`)·상태 배지(`set-status`)·`row_version N`(`set-row-version`)·"버전·승인 없음" · [보기](`flow-mode-view`)/[편집](`flow-mode-edit`) · [자동 정렬](`flow-auto-layout`, 편집 모드만)·[화면 맞춤](`flow-fit`)·[변수 흐름](`flow-var-toggle`, `aria-pressed`) · [세트 저장](`set-save`)·[폐기](`set-deprecate`)→[폐기 확인](`set-deprecate-confirm`)/[취소](`set-deprecate-cancel`)·[되살리기](`set-restore`)·[다시 불러오기](`set-reload`, MDM001 뒤에만) · 메시지 줄(`set-message`) |
| `A-PALETTE` | 팔레트(`flow-palette`) | 편집 모드에서만 캔버스 안쪽에 보인다. [룰](`flow-add-rule`)·[IF](`flow-add-if`)·[병렬](`flow-add-par`)·[메모](`flow-add-note`)·[그룹](`flow-add-group`) |
| `A-CANVAS` | 흐름도 캔버스(`flow-canvas`) | React Flow. 노드·선·메모·그룹 틀. 표시 내용은 §3.2 |
| `A-PROPS` | 오른쪽 패널(`flow-props`) | 선택이 없으면 **세트 패널**(`flow-prop-set` — 세트명 `set-name`·설명 `set-desc`·세트 입출력 표 `set-io-*`·구성 지침 `set-guide-*`), 룰 노드면 `flow-prop-rule`, IF 면 `flow-prop-if`, 병렬이면 `flow-prop-par`, 시작·끝·합류면 `flow-prop-node`, 메모면 `flow-prop-note`, 그룹이면 `flow-prop-group`. 디버거 결과가 있고 노드를 누르면 "실행 결과"(`sim-detail`) 탭이 함께 생긴다. 세트 패널로 돌아가려면 캔버스 빈 곳을 누른다 |
| `A-BOTTOM` | 아래 패널(`flow-bottom`) | 접기 `flow-bottom-toggle`(`aria-expanded`). 탭 두 개 — 「검사 결과 n」(`flow-tab-checks`, 검사 목록 `set-checks`·항목 `set-check-{i}`)과 「시뮬레이션」(`flow-tab-sim`, 디버거). 탭 testid 는 탭 버튼 안쪽 `span` 에 붙어 있다(`aria-selected` 는 부모 버튼 `role="tab"` 에 있다) |

## 3. 조회조건 정의 (영역: A-TOP)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_RULE_SET_ID`/`MARU_RULE_SET_NAME` | 룰 세트 | TextBox | N | (빈값) | `search{target:"SET", keyword}` — ID 대문자 포함 또는 세트명 포함, ID 순 20건. 후보는 `ID · 세트명 · 상태` |

### 3.2 캔버스 노드 (룰 목록 그리드를 대신한다 — 1단계의 `set-rules-grid` 는 없어졌다)

노드 ID 는 흐름 JSON 의 `nodes[].id` 다. testid 는 `flow-node-{nodeId}` 이고 요소에 `data-kind`(노드 종류)·`data-state`(디버거 겹침 상태, 없으면 `idle`)·`data-selected` 가 붙는다.
한 줄 세트(`FLOW_JSON` NULL)는 `start` · `r1`…`rN`(RULE_IDS 순서) · `end` 로 그린다(`linearFlow`).

| 노드 종류 | 모양 | 표시 내용 | 부속 testid |
|---|---|---|---|
| `START` / `END` | 알약 | "시작" / "끝" | — |
| `RULE` | 박스 | 룰명(없는 룰이면 "(없는 룰)"), 종류·정책(`DECISION · FIRST`), 룰 ID | 링크 아이콘 `flow-rule-open-{nodeId}` → `openRuleEdit(ruleId)`, 검사 경고 점 `flow-node-mark-{nodeId}`(`data-severity` REJECT/WARN) |
| `IF` | 마름모 | 이름(`label`, 기본 "조건") | `flow-node-mark-{nodeId}` |
| `PARALLEL` | 가로 막대 | 이름(`label`, 기본 "병렬") | `flow-node-mark-{nodeId}` |
| `MERGE` | 작은 점 | (없음) — 분기를 닫는 짝 합류(`splitId` = 분기 ID) | `flow-node-mark-{nodeId}` |

선·부속 요소:

| 요소 | testid | 설명 |
|---|---|---|
| 선 이름 | `flow-edge-label-{edgeId}` | 선의 `label`. `data-state` = 디버거 선 상태(`run`·`chosen`·`dim`·`idle`) |
| 변수 칩 | `flow-edge-chips-{edgeId}` | [변수 흐름]을 켜면 룰 노드에서 나가는 선에 그 룰의 결과 변수 이름이 붙는다(`edgeChips`) |
| 메모 | `flow-note-{id}` (글 `flow-note-text-{id}`) | 화면 전용 글상자. 노드에 붙일 수 있다(`attach`) |
| 그룹 틀 | `flow-group-{id}` | 구성 노드를 감싸는 바깥 상자(제목). 화면 전용 |
| 디버거 겹침 | 순번 `flow-node-seq-{nodeId}`, 칩 `flow-node-chip-{nodeId}` | 실행된 노드의 순번, 룰 결과 첫 항목(`이름=값`) 또는 오류 코드 |

메모·그룹 위치·노드 위치는 `FLOW_JSON.view`(`positions`·`notes`·`groups`)에 저장된다. 판정에는 쓰지 않는다.

### 3.3 세트 입출력 표 (`SetIoTables`, 저장하지 않는 계산값 — 선택이 없을 때 오른쪽 세트 패널에 있다)

| 표 | 칸 | 설명 |
|---|---|---|
| 입력 변수(`set-io-inputs`, 행 `set-io-input-{이름}`) | 변수·표시명·타입·출처·읽는 룰 | 머리 "입력 변수 N개 · 세트를 부를 때 레코드에 넣어야 하는 값". 출처 배지 "컬럼 사전"(DICT)/"프로그램 변수"(PROG)/"어디에도 없음"(NONE). 앞 룰이 만들기 전에 읽는 이름도 여기 잡힌다 |
| 결과 변수(`set-io-results`, 행 `set-io-result-{이름}`) | 변수·타입·구분·만드는 룰·읽는 룰 | 머리 "결과 변수 N개 · 최종 a개, 중간 b개". 최종 먼저. 만드는 룰이 둘 이상이면 "덮어씀" 배지 |

타입 표시: NUMBER 는 `Number(scale 또는 -)`, 일자 String 은 "일자 String", 코드 도메인은 "코드 String", 그 밖은 dataType, 없으면 "-".

## 4. 편집 필드 정의 (영역: A-PROPS·A-PALETTE)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_RULE_SET_NAME` | 세트명 | TextBox(`set-name`) | Y | 불러온 값 | 100자 이하 |
| D-002 | `DESCRIPTION` | 설명 | Textarea(`set-desc`) | N | 불러온 값 | 빈 값은 null |
| D-003 | `FLOW_JSON` | 흐름 | 캔버스 편집(팔레트 끼우기·끌기·연결·속성 패널·지침 적용) | — | 불러온 흐름(없으면 `RULE_IDS` 의 한 줄 흐름) | P2 정규 JSON 문자열(`flowJson`). 서버가 파싱한 정의로 다시 써 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다. 같은 룰이 다른 갈래에 두 번 있을 수 있다 |
| D-004 | — | 룰 찾기(팝업) | TextBox(`flow-rule-search-keyword`) + 찾기(`flow-rule-search-find`) | — | — | 팔레트 [룰]이 연다. `search{target:"RULE"}` 룰 ID·룰명 앞부분 20건(후보 `flow-rule-cand-{id}`, 룰명·상태·버전, 이미 세트에 있으면 "사용 중" 배지). RELEASED 버전이 없는 룰은 뺀다. 누르면 끼울 선에 새 룰 노드를 끼운다. 실패 문구 `flow-rule-search-error` |
| D-005 | — | 지침 결과 변수 | TextBox(`set-guide-var`) + 찾기(`set-guide-run`) | — | — | `search{target:"GUIDE", resultVar}` — 세트 패널에 있다 |
| D-006 | (`FLOW_JSON.view`) | 속성 패널 입력 | 룰(읽기 전용 표), IF·병렬 갈래 이름 `flow-prop-branch-{edgeId}-label`·조건식 `flow-prop-branch-{edgeId}-cond`("그 외" 갈래는 조건식 칸 없음), 분기 이름 `flow-prop-label`, 메모 글 `flow-prop-note-text`, 그룹 제목 `flow-prop-group-title` | — | — | 보기 모드에서는 모두 읽기 전용이고 ▲▼✕·지우기·더하기가 없다 |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명(testid) | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 찾기 | A-TOP | `search`(SET) | 세트 후보 |
| B-002 | 세트 저장(`set-save`) | A-TOOL | `save` | 편집 모드이고 dirty 이며 **거부(REJECT) 검사가 없고** 조건식 IO 응답을 기다리지 않을 때만 켜진다(P-D4). 꺼진 까닭은 title 로 보인다 |
| B-003 | 폐기(`set-deprecate`) → 폐기 확인(`set-deprecate-confirm`)/취소(`set-deprecate-cancel`) | A-TOOL | `delete` | INUSE·editable·`delete` 권한. 두 단계로만 폐기한다(D14, I14) |
| B-004 | 되살리기(`set-restore`) | A-TOOL | `restore` | DEPRECATED·restorable·`restore` 권한 |
| B-005 | 다시 불러오기(`set-reload`) | A-TOOL | `view` | MDM001 충돌 뒤에만 보인다 |
| B-006 | 보기(`flow-mode-view`)/편집(`flow-mode-edit`) | A-TOOL | (없음) | 세트를 열면 보기 모드다. [편집]은 `view.editable`·INUSE·`save` 권한일 때만 켜진다. 편집 → 보기는 편집 내용을 버리지 않는다 |
| B-007 | 자동 정렬(`flow-auto-layout`) | A-TOOL | (없음) | dagre 위→아래 배치로 모든 노드 위치를 다시 잡는다(편집 모드만) |
| B-008 | 화면 맞춤(`flow-fit`)·변수 흐름(`flow-var-toggle`) | A-TOOL | (없음) | 보기 조절. 서버를 부르지 않는다 |
| B-009 | 룰(`flow-add-rule`)·IF(`flow-add-if`)·병렬(`flow-add-par`)·메모(`flow-add-note`)·그룹(`flow-add-group`) | A-PALETTE | `search`(RULE, 룰 팝업) | 편집 모드만. 동작은 §5.3 |
| B-010 | 찾기(지침, `set-guide-run`) | A-PROPS(세트 패널) | `search`(GUIDE) | |
| B-011 | 이 순서로 한 줄 흐름 만들기(`set-guide-apply`) | A-PROPS(세트 패널) | (없음) | 한 줄 흐름이면 제안 순서로 `linearFlow(순서)` 를 만들고(배치 초기화) 응답 `rules` 의 입출력을 더한다(dirty). 편집 모드·`save` 권한일 때만 켜진다. **분기가 있는 흐름이면 꺼진다**(P-D5, 1단계 Ruling 13) |
| B-012 | 지우기(`flow-prop-delete`) | A-PROPS | (없음) | 룰·분기·메모·그룹 지우기. 룰은 앞뒤 선을 이어 붙이고 분기는 짝 합류까지 블록째 지운다. 시작·끝·합류는 지울 수 없다 |
| B-013 | 갈래 더하기(`flow-prop-add-branch`)·갈래 ▲▼✕(`flow-prop-branch-{edgeId}-up/-down/-remove`) | A-PROPS(IF·병렬) | (없음) | 갈래는 2개 미만으로 줄일 수 없고 IF 의 "그 외" 갈래는 지울 수 없다 |
| B-014 | 룰 편집 열기(`flow-prop-rule-open`) | A-PROPS(룰) | (없음) | `openRuleEdit(ruleId)` |
| B-015 | 그룹 구성 노드 빼기(`flow-prop-group-remove-{nodeId}`)·선택 노드 더하기(`flow-prop-group-add`) | A-PROPS(그룹) | (없음) | 구성 노드 목록 `flow-prop-group-member-{nodeId}`. 다 빼면 그룹이 없어진다 |
| B-016 | 접기(`flow-bottom-toggle`)·탭(`flow-tab-checks`·`flow-tab-sim`) | A-BOTTOM | (없음) | |
| B-017 | 검사 항목(`set-check-{i}`) | A-BOTTOM | (없음) | 누르면 그 노드를 고르고 캔버스를 그 노드로 옮긴다(노드 ID 가 없는 항목은 눌 수 없다) |
| B-018 | 실행(`sim-run`) | A-BOTTOM(시뮬레이션) | `execute` | `execute` 권한(EDIT)이 있을 때만 켜진다. 꺼져 있으면 title `디버거는 편집 권한이 있어야 쓸 수 있다`(P-D3) |
| B-019 | 처음(`sim-first`)·이전(`sim-prev`)·다음(`sim-next`)·끝(`sim-last`) | A-BOTTOM(시뮬레이션) | (없음) | 서버를 부르지 않고 받아 둔 실행 기록을 넘긴다. 키보드 ←→ 로도 넘긴다 |
| B-020 | 표시 지우기(`sim-clear`) | A-BOTTOM(시뮬레이션) | (없음) | 실행 겹침과 결과를 지운다 |

### 5.1-1 캔버스·표 안의 인라인 동작 (GB-NNN)

| 버튼ID | 버튼명 | 소속 | 핸들러 | 설명 |
|---|---|---|---|---|
| GB-001 | 룰 박스 링크 아이콘(`flow-rule-open-{nodeId}`) | 캔버스 RULE 노드 | `openRuleEdit(ruleId)`(`@/dme/rule-handoff`, 버전 없음) | 룰 화면 탭을 연다. **박스 누르기는 선택 + 속성 패널만 열고 룰 화면을 열지 않는다.** 두 번 누르기는 아무것도 하지 않는다 |
| GB-002 | (변수 링크 `set-var-link-{이름}`) | 세트 입출력 표 | DICT → `openMdmPage("dma/columnMng")`(파라미터 없음, D13), 결과 변수 → 만드는 첫 룰의 `openRuleEdit` | PROG·NONE 은 링크 없음(title "컬럼 사전 밖 이름이라 갈 곳이 없다") |
| GB-003 | 룰 박스 누르기 | 캔버스 | 선택 → 속성 패널 | 룰 노드의 속성 패널은 입력 변수(`flow-prop-input-{이름}`)의 출처·앞 룰 결과 여부, 결과 변수(`flow-prop-result-{이름}`), 그 노드에 걸린 검사 문구를 보인다 |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| (세트 열기) | 후보 클릭·넘겨받은 setId | dirty 면 확인 "저장하지 않은 변경이 있습니다. 버리고 이동할까요?" | `view{setId}` → 세트·흐름·멤버 룰 입출력·검사·조건식 IO(`condIo`)·`editable`·`restorable`. 흐름은 `toEditFlow` 로 편집 모델이 되고 모드는 보기다. 다른 세트로 바뀌면 선택·디버거 표시를 지운다. 저장된 흐름을 읽을 수 없으면 MDM026 을 문장으로 보인다 | `view` |
| B-002 | 클릭 | 위 조건 | 1) `save{setId, setName, description?, rowVersion, flowJson}` — `flowJson` 은 `flowJsonOf(flow)`(P2 정규 JSON 과 같은 키 순서). `grids` 는 보내지 않는다 2) 서버 순서: 길이(262,144자) → 형식(MDM021) → 룰 ID 규칙 → 담당자 → 세트 저장 검사(거부면 MDM024) → 정규 JSON 저장 + 펼친 `RULE_IDS` 3) 성공 "저장 · row_version N" + 경고 줄 → 서버 정규 흐름으로 다시 불러와 **보기 모드로 돌아간다** 4) 거부는 서버 `meta.message`(`set-message`), 편집 중 흐름은 둔다 5) MDM001 은 "다른 창에서 바뀌었습니다. 다시 불러오세요" + 다시 불러오기 6) `flowJson` 없는 옛 목록 저장이 `FLOW_JSON` 이 있는 세트에 오면 `FLOW_READONLY` 로 거부한다(§6.2 XV-019) | `save` |
| (조건식 IO) | IF 의 "그 외"가 아닌 갈래의 `(id, cond)` 가 바뀜 | 편집 모드 | 400ms 디바운스 뒤 `validate{flowJson}` → `condIo`(선 ID → 조건식이 읽는 변수의 출처·타입). 요청 순번으로 늦게 온 응답은 버리고(Local-Rules §11), 응답을 기다리는 동안(`condIoPending`) 저장을 막는다. 실패하면 오류 창 + 기다림 해제(condIo 는 그대로) | `validate` |
| B-003 | 폐기 → 폐기 확인 | INUSE | 1) 폐기를 누르면 경고 "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다."와 폐기 확인/취소 2) 폐기 확인 → `delete{setId, rowVersion}` 3) "폐기 · row_version N. 행은 남기고 되살릴 수 있다" | `delete` |
| B-004 | 클릭 | DEPRECATED | `restore{setId, rowVersion}` → 저장된 흐름으로 검사를 다시 돌려 거부가 없을 때만 INUSE. "되살림 · row_version N" + 경고. 저장된 흐름이 손상됐으면 MDM026 | `restore` |
| B-010 | 클릭·Enter | 결과 변수 입력 | `search{target:"GUIDE", resultVar}` → 오류(`set-guide-error`) 또는 "제안 순서 · 1. A → 2. B …" + "고르기" 배지(한 결과 변수를 만드는 룰이 둘 이상) | `search` |
| B-018 | 클릭 | `execute` 권한 | `execute{flowJson, recordJson, evalTs?}` — **저장하지 않은 현재 흐름**을 보낸다. 입력 칸(`sim-input-{name}`)은 `flowIo` 입력 변수 가운데 출처가 DICT·PROG 인 이름으로 만들고(NONE 은 검사가 이미 거부한다, P-D8) 빈 칸은 null 로 보낸다. `sim-json` 이 비어 있지 않으면 폼 대신 이것을 보낸다(객체가 아니면 칸 아래 오류). 판정 시각 `sim-evalts`(`yyyy-MM-dd HH:mm:ss`, 빈 칸이면 서버 현재 시각). 응답의 실행 기록과 **그때의 흐름 사본**을 결과에 두고 마지막 단계로 둔다. 서버 응답: `{trace, warnings}`(§11 N-16) | `execute` |

디버거 화면 문구(P10·Task 11): 상태 문구(`sim-status`) — 끝까지 갔으면 `완료 · {n}단계 · 결과 변수 {m}개`, 멈췄으면 `오류로 멈춤 — {nodeId}: {첫 위반 문구}`, 기록이 비었으면 `실행 전 오류 — {첫 위반 문구}`, 따라가는 중이면 `{step+1}/{n} · {nodeId}`, 흐름 구조가 바뀌면 `흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다`. 진행 막대 `sim-progress`, 값 표 `sim-values`(행 = 변수, 열 = 단계, 바뀐 칸 배경 강조·지금 단계 열 테두리, 값 없음은 `—`), 경고 `sim-warnings`(코드 배지 + 문구), 노드 상세 `sim-detail`.

### 5.3 캔버스 동작

| 동작 | 설명 |
|---|---|
| 노드 누르기 | 선택하고 오른쪽 패널을 그 노드의 속성으로 바꾼다. 빈 곳을 누르면 선택이 풀린다. 보기 모드에서도 선택·속성 보기는 된다(읽기 전용) |
| 다중 선택 | 편집 모드에서 Shift(또는 Ctrl·Meta)+누르기로 노드를 더하고 Shift+끌기 상자로 고른다. 메모·그룹은 다중 선택 목록에 넣지 않는다. [그룹]은 이 목록(없으면 고른 노드 하나)으로 그룹을 만든다 |
| 노드 끌기 | 편집 모드에서 위치를 바꾼다(`view.positions` 저장). 구조가 아니라 위치만 바뀌므로 디버거 표시는 유지된다 |
| 선 잇기·지우기 | 편집 모드에서 노드 아래 점에서 다른 노드로 끌어 잇는다(`connect`). 선을 고른 뒤 Delete 로 지운다(`removeEdge`). 같은 두 노드를 잇는 선이 이미 있으면 거부한다 |
| 팔레트로 끼우기 | 끼울 선은 **고른 선**이다. 고른 선이 없으면 END 로 들어가는 선이다(P-D10). [룰]은 룰 찾기 팝업에서 고른 룰을, [IF]·[병렬]은 분기+짝 합류(갈래 2개)를 그 선에 끼우고 새 노드를 고른다. 노드가 200개를 넘게 하는 끼우기는 막는다(문구 "노드는 흐름 하나에 200개까지 둔다") |
| 팔레트 끌어 놓기 | 팔레트 항목을 캔버스로 끌어 놓으면 놓은 자리에서 선 중점이 80px 안에서 가장 가까운 선에 끼운다(같은 연산). 없으면 고른 선·END 앞 선 |
| 검사 이동 | 검사 항목 `set-check-{i}` 를 누르면 그 노드를 고르고 화면을 그 노드로 옮긴다. 같은 항목을 다시 눌러도 다시 옮기고 깜빡인다 |
| 즉시 재계산 | 흐름이 바뀔 때마다 `set-model.ts` 의 `flowIo`·`flowChecks`(서버 `RuleSetAnalyzer` 와 코퍼스로 동치)로 입출력 표·검사·경고 점을 다시 그린다. 조건식 IO 는 `validate` 응답으로 갱신한다 |
| 화면 맞춤·자동 정렬 | [화면 맞춤]은 전체가 보이게 하고 [자동 정렬]은 위치를 다시 잡는다 |
| 디버거 겹침 | 실행 결과가 있으면 `overlayAt(trace, flow, step)` 로 노드 `data-state`(`run`·`error`·`current`·`pending`·`dim`)·순번·칩, 선 상태(`run`·`chosen`·`dim`·`idle`)를 그린다. 지금 단계 노드로 캔버스를 옮긴다 |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증 (요청 검사, 쓰기 전에 거부 — I13)

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | D-001 | 필수, 100자 이하 | 세트명은 필수입니다. / 세트명은 100자 이하여야 합니다. |
| V-002 | D-003 | 흐름에 나온 룰 ID 마다 `RuleIdRules.validateRuleId` | 룰 ID 는 컬럼 물리명 규칙 … |
| V-003 | D-003 | 흐름 JSON 형식·크기: 노드 200·선 400·JSON 262,144자, `version` 정수 1, 문자열 칸이 문자열, `order` 정수, `otherwise` 불린, `view` 객체, 필수 칸 | MDM021 `흐름 형식이 올바르지 않습니다: {원인}` |
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
| XV-019 | `FLOW_READONLY` | 거부 | `flowJson` 없는 옛 목록 저장이 `FLOW_JSON` 이 있는 세트에 왔다(흐름·배치가 조용히 사라지지 않게 한다) | 분기 흐름: 분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다 / 한 줄 흐름: 흐름도로 저장한 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다 |
| XV-020 | `COND_UNTYPED` | 경고 | IF 조건식이 읽는 DICT 출처 변수가 세트 안 어느 룰의 입출력(`RuleIo.conds ∪ results`, 대소문자 무시)에도 없다. RELEASED 가 없는 룰은 입출력을 모르므로 선언에 치지 않는다(P-D7) | {edgeId} 갈래 조건식이 읽는 {var}는 세트 안 어느 룰도 타입을 선언하지 않아 레코드 값 그대로 비교한다. 숫자를 문자열로 넘기면 사전순으로 비교된다 |
| XV-009 | (MDM024) | — | 거부가 하나라도 있으면 저장·되살리기 거부 | 룰 세트 저장 검사를 통과하지 못했습니다: {ruleId}[{var}] {code} {문구}; … |
| XV-010 | (MDM001) | — | `ROW_VERSION` 불일치 | 다른 창에서 바뀌었습니다(화면 안내) |
| XV-011 | (MDM009) | — | DEPRECATED 세트 저장·이미 DEPRECATED 폐기·INUSE 되살리기 | MDM009 허용되지 않는 상태 전이입니다 |
| XV-012 | (MDM013) | — | 쓰기(save·delete·restore) 요청자가 담당자가 아니다 | MDM013 담당자 역할이 있어야 할 수 있습니다 |
| XV-021 | (MDM021) | — | 흐름 JSON 형식·크기 위반(V-003) | 흐름 형식이 올바르지 않습니다: {원인} |
| XV-022 | (MDM026) | — | 저장된 룰 정의·FLOW_JSON 을 읽을 수 없다(손상). `view`·`restore`·`execute`·`simulate` 가 `StoredDefinitionException` 만 이 코드(500)로 바꾼다. 그 밖의 IAE·ISE 는 감싸지 않는다(엔진 버그를 입력 오류로 가리지 않는다). 문구에 룰 ID 는 붙이지 않는다(원인 그대로, 서버 로그로 추적) | 룰 세트 {setId} 의 저장된 흐름을 읽을 수 없습니다 — {원인} / 룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — {원인} |

서버는 화면 검사 결과를 받지 않고 요청 흐름으로 다시 계산한다(I12). 흐름 세트는 같은 검사를 흐름 경로 기준으로 한다: `ORDER`·`CYCLE`·`DUP_RESULT` 는 같은 경로 위의 룰끼리만 보고, IF 의 서로 다른 갈래가 같은 결과를 쓰는 것은 정상이다. 검사 항목에는 흐름 위치 `nodeId`·`edgeId` 가 붙는다(목록 세트는 null). 2단계 화면은 흐름이 바뀔 때마다 `flowChecks` 로 검사를 다시 계산해 캔버스 경고 점·검사 패널·속성 패널에 보이고, 조건식이 읽는 변수의 출처·타입은 `view`·`validate` 의 `condIo` 로 받는다.

룰 확정 검사(`RuleSetOrderCheck`)의 `SET_IF_SIBLING`·`SET_PAR_SIBLING` 은 2단계에서 세트 저장 검사와 같은 경로 상태(`RuleSetPathState`)로 판정한다. 판정이 바뀐 사례는 §11 N-17 에 있다.

## 7. 상태 정의 및 상태별 제어

| 상태 | 캔버스 편집(팔레트·끌기·잇기·속성 입력)·세트명·설명·지침 적용 | 세트 저장 | 폐기 | 되살리기 | 디버거 실행 |
|---|---|---|---|---|---|
| `INUSE` · 보기 모드(세트를 열면 기본) | 읽기 전용 — 팔레트·[자동 정렬] 없음, 속성 패널 입력 잠김. 노드 선택·속성 보기·룰 링크·[변수 흐름]·[화면 맞춤]은 동작 | 비활성(title "편집 모드에서 저장한다") | O | — | `execute` 권한이면 O |
| `INUSE` · 편집 모드([편집] — editable·`save` 권한일 때만) | 편집 가능 | dirty 이고 거부 검사가 없고 조건식 IO 를 기다리지 않을 때만 | O | — | `execute` 권한이면 O |
| `DEPRECATED` | [편집]·팔레트 없음, 세트명·설명 잠김 | 비활성 | — | O | `execute` 권한이면 O |
| 담당자가 아님 / `save` 권한 없음 | [편집] 비활성(title "담당자이고 사용 중인 세트이며 저장 권한이 있어야 편집한다") | 비활성 | 비활성 | 비활성 | `execute` 권한 없으면 비활성 |

분기가 있는 세트도 1단계와 달리 **읽기 전용이 아니다**. 캔버스에서 그대로 편집·저장한다(옛 안내 `set-branched-notice` 는 없어졌다). 다만 구성 지침의 "이 순서로 한 줄 흐름 만들기"는 분기 흐름이면 꺼진다(P-D5).
편집 → 보기 전환은 편집 내용을 버리지 않는다. 저장 성공·다시 불러오기·다른 세트 열기는 모두 보기 모드로 돌아간다.

세트에는 버전·DRAFT·선점이 없다. 저장은 `ROW_VERSION` 조건부 UPDATE 한 번이고, 동시 편집은 MDM001 로만 막는다(I3·D16).

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 세트 고르기·보기·룰 검색·지침 찾기 | O | O | O | `search`·`view`(READ) |
| 편집 모드·저장·폐기·되살리기·지침 적용 | O | O | X | `save`·`delete`·`restore`(EDIT) + 서버 `RuleStewardCheck.requireSteward()`, view 의 `editable`·`restorable` 은 `isSteward()`. 권한이 없으면 버튼을 비활성으로 둔다 |
| 조건식 IO(`validate`) | O | O | X | EDIT. 편집 중에만 화면이 부른다. 서버는 읽기만 하므로 `requireSteward` 를 부르지 않고 권한 action 이 막는다 |
| 디버거 실행(`execute`) | O | O | **X** | EDIT (P-D2·P-D3). `execute` 가 EDIT 권한이라 DME 에서 READ 인 표준 관리자는 실행할 수 없다(BFF RBAC 403, 화면은 `sim-run` 비활성). 기록 실행은 저장하지 않고 읽기만 하지만 어휘 16개를 늘리지 않으려 이렇게 정했다 — 사용자 확인 사항이다 |

## 9. 연동 화면 / 팝업

| 대상 | 방식 | 넘기는 값 |
|---|---|---|
| 룰 세트(`ruleSetMng`) → 이 화면 | `openMdmPage("dme/ruleSetEdit", {setId})` / `useMdmPageParams` | 세트 ID |
| 룰 화면(`ruleEdit`) | `@/dme/rule-handoff` `openRuleEdit(ruleId)` | 룰 ID |
| 컬럼 사전(`columnMng`) | `openMdmPage("dma/columnMng")` | 없음(D13) |
| 룰 화면(`ruleEdit`) — 디버거 | `openRuleEdit(ruleId)` (노드 상세 [룰 편집 열기]) | 룰 ID |

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 |
|---|---|---|
| LV-001 `STATUS` | `INUSE`/`DEPRECATED` | 코드 그대로(배지) |
| LV-002 출처 | `DICT`/`PROG`/`NONE` | 컬럼 사전/프로그램 변수/어디에도 없음 |
| LV-003 심각도 | `REJECT`/`WARN` | 거부/경고 |
| LV-004 결과 구분 | (계산) | 최종(어느 룰도 다시 읽지 않음)/중간 |
| LV-005 노드 종류 | `START`/`END`/`RULE`/`IF`/`PARALLEL`/`MERGE` | 시작/끝/룰/조건(IF)/병렬/합류 |
| LV-006 디버거 노드 상태 | `run`/`error`/`current`/`pending`/`dim` | 실행됨/오류/지금/아직/흐림(`data-state`) |
| LV-007 디버거 선 상태 | `run`/`chosen`/`dim`/`idle` | 지나감/IF 가 고름/고르지 않음/표시 없음 |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | **세트 값 테스트 — 2단계 디버거로 채웠다(D-112).** 06:756 이 두라고 한 세트 값 테스트 카드는 1단계까지 운영 DB 를 읽는 정의 조회기가 없어 제외했다. 룰 세트 흐름도 1단계에서 조회기(`StoredDefinitionLookup`)와 실행기(`RuleSetRunner`)가 생겼고, 2단계에서 시뮬레이션 탭(`execute` action, 서비스 메서드 `simulate`)이 카드를 대신한다. 저장하지 않은 흐름을 레코드 하나로 서버에서 기록 실행한다(N-16) | design D2, spec 제약, D-108(이름 조항은 D-112 가 대체), mdm ADR-0005 D4 |
| N-2 | 화면 그룹 `dme`(spec 의 `mdr` 아님) | design D1 |
| N-3 | "지금 RELEASED" = RELEASED 가운데 VER 최대 | design D3·I7 |
| N-4 | 룰 하나의 입출력은 엔진이 세트 실행 전에 요구하는 키와 같게 새로 정의(`RuleIoReader`). 룰 화면 활용처 카드(`RuleUsageFinder`)는 고치지 않아 드문 룰에서 의존 룰이 다르게 보일 수 있다 | design D4 |
| N-5 | 순환은 이행적으로 본다(세 룰 고리도 `CYCLE`) | design D6 |
| N-6 | 구성 지침 생산자 = DEPRECATED 아니고 RELEASED 있는 룰, 룰 ID 순 첫 룰, 여럿이면 "고르기". DICT·PROG 는 거슬러 찾지 않는다. 제안일 뿐 저장하지 않는다 | design D7·I16 |
| N-7 | 저장 거부는 오류 코드 `MDM024`(400) + 상세 message. 병렬 Task 와 번호가 겹치면 머지하는 쪽이 다음 번호로 바꾼다 | design D8 |
| N-8 | **개정(P-D4, D-113)**: 캔버스에서는 화면 즉시 검사에 거부(REJECT)가 하나라도 있으면 저장 버튼을 끈다(스펙 §7 "오류가 있으면 저장을 막는다"). 서버도 같은 검사로 다시 거부한다. 1단계의 "즉시 검사는 저장 버튼을 막지 않는다"(design D9)를 대체한다. 조건식 IO 응답을 기다리는 동안에도 저장을 막는다 | 스펙 §7, 계획 P-D4, D-113 |
| N-9 | "저장 즉시 배포"는 보류 — 저장·폐기·되살리기는 `TB_MDM_RULE_SET` 한 행만 바꾼다 | design D11·I23, PRD FR-E5 |
| N-10 | 폐기는 두 단계 버튼(폐기 → 폐기 확인/취소) | design D14 |
| N-11 | 같은 룰을 두 번 담지 않는다 | design D15 |
| N-12 | 룰 목록 그리드 폭 문제(열 잘림)는 **그리드 삭제로 해당 없음**. 캔버스는 노드 크기가 고정(`NODE_SIZE`)이고 화면 맞춤으로 전체를 보인다 | D-113 |
| N-13 | e2e `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`(E1~E12, 스모크 넷 = E1·E2·E5·E8), 픽스처 `e2e/fixtures/mdm-ruleSet-data.sql`(분기 세트 `E2S_FLOW` 포함). 2단계에서 목록 testid 를 쓰던 E2·E3·E4·E5·E6·E7·E9·E10 을 캔버스 기준으로 다시 쓰고 E11(디버거)·E12(룰 박스 링크 vs 박스 누르기)를 더했다. 서버 MDM024 거부는 화면에서 저장 버튼이 꺼지므로(N-8) e2e 가 아니라 서버 테스트가 맡는다 | design §3.4.2, 2단계 Task 12 |
| N-14 | **흐름 저장(1단계)** — `TB_MDM_RULE_SET.FLOW_JSON`(흐름 정의 + 화면 전용 view)을 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다(요청의 룰 목록을 믿지 않는다). `FLOW_JSON` 이 NULL 이면 `RULE_IDS` 순서의 한 줄 흐름이다. 분기 세트는 목록 편집으로 저장할 수 없다(`FLOW_READONLY`) | 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3, D-107 |
| N-15 | 흐름 세트의 입출력 표·의존 룰은 1단계에서는 흐름을 펼친 룰 목록으로 계산했다. 2단계 세트 패널은 흐름 기준 `flowIo(flow, rules)`(경로 상태를 아는 입출력)로 계산하고, 속성 패널은 앞 룰이 만드는 변수와 컬럼 사전·프로그램 변수·"어디에도 없음"을 가려 보인다 | D-107(편차 D10), 2단계 Task 10 |
| N-16 | **디버거(2단계)** — ① *저장 전 흐름 실행*: `execute{flowJson, recordJson, evalTs}` 는 화면의 저장하지 않은 흐름을 서버 `RuleSetRunner.trace` 로 돌려 엔진 계약 `RunTrace` 를 스키마 그대로 JSON 으로 돌려준다(골든 `rule-set-trace-golden.json` 7사례로 고정, `NodeTrace.result` 가 없으면 키를 뺀다). 응답 `warnings` 는 `RULE_DEPRECATED` → `BRANCH_COND_NULL` → 룰 경고 순이다(D-110 운영 응답과 같은 순서). 입력 오류: 흐름 없음은 REQUIRED_VALUE, `recordJson` 이 객체가 아니거나 판정 시각 형식(`yyyy-MM-dd HH:mm:ss` KST)이 틀리면 INVALID_VALUE, 저장값 손상은 MDM026. ② *값 표 병렬 의미*: 병렬 갈래는 분기 직전 값의 **사본**에서 돌고, 합류에서 **각 갈래가 실제로 쓴 이름만** 갈래 실행 순서대로 덮어쓴다(뒤 갈래가 이긴다, 엔진 `FlowRun` 과 같다 — Ruling 10). 첫 갈래 값이 두 번째 갈래 단계에 보이지 않는다. IF 는 사본을 만들지 않는다. 값이 없는 칸은 NULL 값과 구별해 `—` 로 보인다. ③ *표시 유지·지움*: 실행에 영향을 주는 칸(노드 id·kind·ruleId·splitId, 선 id·from·to·order·cond·otherwise)이 바뀔 때만 흐름 구조가 바뀐 것으로 보고 표시를 지운다. 노드를 끌어 옮기거나 메모를 고치거나 **`label` 만 바꾼 것은 표시를 지우지 않는다**(Ruling 12). 다른 세트를 열면 지운다. ④ *권한*: `execute` 는 EDIT 라 표준 관리자는 실행할 수 없다(P-D3) | 스펙 §8, P5·P9, D-116·D-117 |
| N-17 | **룰 확정 검사의 형제 판정 변화(Task 3, §9.1-6, D-115)** — `RuleSetOrderCheck` 의 `SET_IF_SIBLING`·`SET_PAR_SIBLING`(읽기)이 노드 쌍 단위로 "읽는 노드 직전 경로에서 이미 정의된(defined) 또는 일부 갈래에서만 정의된(maybe) 이름"을 뺀다. 세트 저장 검사(`RuleSetAnalyzer`)와 같은 판정을 내기 위해서다(D-117). 판정이 바뀐 사례: **#3a** 같은 룰이 me 의 형제 갈래에도 있고 me 와 같은 경로 뒤에도 있으며 me 가 그 룰의 결과를 읽는다 — `SET_ORDER` 만 → `SET_ORDER` + `SET_IF_SIBLING`(거부는 그대로, 메시지 한 건 늘어남; 거르기는 읽는 노드 기준이라 other 가 그 노드 앞 경로에 있을 때만 걸러진다). **#3b** me 가 IF 한 갈래에서 S_Y 를 만들고 other 가 다른 갈래에서 S_Y 를 읽으며 합류 뒤에도 other 가 있다 — 통과 → `SET_IF_SIBLING` 거부. **#3c** me 가 IF 한 갈래(rM1)에서 S_Y 를 읽고 other 가 다른 갈래에서 S_Y 를 만들며 합류 뒤에 me 가 또 있다(rM2) — 통과 → `SET_IF_SIBLING` 거부(문구 `R_M ← [S_Y]`). #3b·#3c 는 확정이 통과에서 거부로 바뀌므로, 이미 INUSE 인 세트에 이 모양이 있으면 그 룰의 확정이 새로 막힌다(세트 저장 검사라면 이미 `IF_SIBLING` 으로 거부될 흐름이다). **#3d** 한 룰 쌍 안에 IF 형제 노드 쌍과 병렬 형제 노드 쌍이 함께 있고 한쪽이 다른 쪽 결과를 읽는다 — `SET_PAR_SIBLING` 만 → `SET_PAR_SIBLING` + `SET_IF_SIBLING`(거부는 그대로, 메시지 한 건 늘어남; 이 모양은 테스트가 아직 없다). 그 밖에 앞 경로에서 이미 정의된 이름을 형제 갈래가 다시 만드는 흐름(`r0(R_P:S_X) → IF/PAR { R_A:S_X ; R_B 읽기 S_X }`)과 형제 갈래 이름이 읽는 지점에서 일부 갈래에서만 정의된(maybe) 흐름은 SIBLING 거부 → 내지 않음이다(maybe 는 세트 저장 검사가 `FLOW_PARTIAL` 경고로 다룬다). 문구의 `me ← […]`·`other ← […]` 자리는 룰 전체의 겹치는 이름이 아니라 걸러진 뒤 남은 이름의 합이다. `SET_ORDER`·`SET_CYCLE`·`SET_DUP_RESULT`·병렬 같은 이름 대입 판정은 바뀌지 않았다. 합격 기준은 두 방향이다 — (가) 확정 검사가 me 를 읽는 쪽으로 x 에 SIBLING 을 내면 세트 저장 검사도 같은 노드·변수에 거부(`IF_SIBLING`·`PAR_SIBLING`·`ORDER`·`CYCLE`)를 낸다, (나) 세트 저장 검사가 `ruleId = me` 의 `IF_SIBLING`·`PAR_SIBLING`(읽기)을 내면 확정 검사도 SIBLING 을 낸다. 코퍼스 52건 + 퍼즈 200건 가운데 구조 오류(코퍼스 11·퍼즈 20)와 DICT 이름 겹침(코퍼스 2)을 뺀 219건 대조가 통과했다 | 스펙 §9.1-6, 계획 P4, D-115·D-117, `RuleLedgerChecksTest` |
| N-18 | 화면 구성 이탈 세 가지 — 오른쪽 패널은 `ContentBody resizable`(§2), 분기 노드에도 [지우기]가 있고(없으면 분기를 지울 길이가 없다), 그룹은 다중 선택(Shift·Ctrl·Meta 누르기, Shift+끌기 상자)으로 만들고 구성 노드를 속성 패널에서 빼고 더한다(스펙 §7 그룹 틀이 여러 노드를 묶는 기능, Ruling 11) | 계획 P10 편차, Task 10 |
