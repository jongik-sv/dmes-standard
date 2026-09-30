---
screenId: ruleSetEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-26
개정일: 2026-09-30 (룰 세트 흐름도 3단계 — 편집기·디버거 보강)
작성자: Agent
---

# mdm — 룰 세트 편집 기능설계서

> **2026-09-30 개정(룰 세트 흐름도 2단계)**: 룰 목록 그리드 자리가 React Flow 캔버스로 바뀌었다. 분기(IF·병렬)를 그려 저장하고, 저장 전 흐름을
> 서버에서 기록 실행해 노드 단위로 따라가는 디버거가 붙었다. 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §7·§8, 결정 D-111~D-117.

> **2026-09-30 개정(룰 세트 흐름도 3단계)**: 캔버스 편집기에 끌어 놓기·[+]·되돌리기·우클릭 메뉴·복사·분기 편집·선 경로 편집·찾기·접기를 더하고,
> 아래 패널의 시뮬레이션 탭을 [보기][편집][디버그] 세 모드 가운데 **디버그 모드**로 옮겼다(단계 실행·중단점·조사식·식 즉석 평가·테스트 케이스·실행 비교).
> 옛 시뮬레이션 탭과 오른쪽 「실행 결과」 탭은 없어졌다(설명도 지웠다). 스펙 `docs/superpowers/specs/2026-09-30-rule-set-flow-editor-debugger-design.md`, 결정 D-118~D-123.
> 이 문서에서 「3단계 P-D n」은 3단계 계획의 편차 번호이고, 앞에 「3단계」가 없는 P-D n 은 2단계 계획의 편차 번호다(번호가 겹친다). 이 문서는 구현된 동작을 기준으로 적는다 — 스펙과 다른 곳은 §11 N-25 에 모았다.

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
| 화면 목적 | 세트 하나를 골라 **흐름도 캔버스**에서 룰 박스와 분기(IF·병렬)를 그려 편집하고, 흐름이 바뀔 때마다 세트 입출력 표·세트 검사를 화면에서 즉시 다시 계산한다. 저장하면 서버가 같은 검사를 다시 돌려 거부(순환·순서·없는 룰·흐름 구조 오류 등)가 있으면 거부하고, 경고만 있으면 저장한다. 3단계 편집기는 끌어 놓기·선 위 [+]·되돌리기·우클릭 메뉴·복사 붙여넣기·분기 바꾸기·풀기·선 경로 편집·찾기·블록 접기를 준다. 저장하지 않은 흐름을 레코드 하나로 서버에서 기록 실행해 노드를 한 단계씩 따라가 보는 **디버그 모드**(단계 실행·중단점·조사식·식 즉석 평가·테스트 케이스·실행 비교)가 있다. 폐기·되살리기도 이 화면에서 한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·편집·디버거 실행·테스트 케이스 저장) / 표준 관리자(`MDM_STD_ADMIN`, 조회만 — 디버그 모드에는 들어가 볼 수 있으나 실행·케이스 실행·식 평가·케이스 저장은 못 한다, 2단계 P-D3·3단계 P-D1·P-D2) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 세트 편집, 룰 세트(`ruleSetMng`) 등록 성공·세트 ID 링크 |

근거: 06:756 「화면」 룰 세트 편집, 06:766 폐기 확인, 06:1092 저장 시 검사, 06:1110-1122 구성 지침, 시안 H:309-336, TSK-08-06 design §6.2~§6.6·§6.9·§6.10, 수용 기준 3·4·5. 2단계: 스펙 §7(캔버스)·§8(디버거)·§9.1, 결정 D-111~D-117. 3단계: 스펙 2026-09-30 §3(편집기)·§4(디버거), 결정 D-118~D-123.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | `docs/mdm/screens/README.md`, design D1 |
| mesModule | `m-mdm` | 01 A.4.5 |
| 화면식별자 (screenId) = pageName = serviceId = OBJECT_ID | `ruleSetEdit` | design I17 |
| 페이지 유형 | `B`(상단 고르기 + 툴바 + 왼쪽 패널·캔버스·오른쪽 패널·아래 패널 분할) | 08-02 `ruleEdit` 골격(그 기능설계서에는 유형 칸이 없어 조회+상세 계열 `B` 로 둔다) |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleSetEdit/{action}` | design §6.12 |
| 주요 API path (BFF→BE) | `POST /oasis/ruleSetEdit/{action}` | 상동 |
| Frontend 파일 | `m-mdm/pages/dme/ruleSetEdit/` 아래 — `page.tsx`, `api.ts`, `types.ts`, `links.ts`, 순수 모듈 `set-model.ts`(목록 함수는 코퍼스 동치 테스트용, `flowIo`·`flowChecks`)·`flow-model.ts`(파싱·구조 검사)·`flow-edit.ts`(편집 연산 — 3단계에 `moveNode`·`replaceRule`·`copyFragment`·`pasteFragment`·`duplicateNode`·`changeSplitKind`·`dissolveSplit`·`reorderBranches` 추가)·`flow-layout.ts`(dagre 배치)·`flow-vars.ts`(변수 칩·검사 표시·가장 가까운 선·끌기 대상 선)·`trace-view.ts`(기록 해석·`debugOverlay`), 상태 `state/{useRuleSetEdit,edit-history,useEditActions,useDragActions,useFind,useCollapse}.ts`, 캔버스 `canvas/{FlowCanvas,FlowToolbar,FlowPalette,RulePanel,RuleSearchModal,ContextMenu,context-menu,shortcuts,collapse,route-path,nodes,overlay,react-flow}` 와 우클릭 메뉴 제공자 `canvas/menus/{index,edit-menu,collapse-menu,debug-menu,view-menu}`, 패널 `panels/{SetPanel,PropertyPanel,ChecksPanel,BottomPanel}`, 카드 `cards/{SetIoTables,GuideCard}`, 디버거 `debugger/{DebugToolbar,DebugInputs,InputForm,VariablePanel,TestCasePanel,CaseEditModal,ValuesTab,ValueTable,RunCompare,SimWarnings,TraceDetail,useSimulation,useTestCases,useExprEval,debug-model,expr-eval,local-store}`, 스타일 `rsf-styles.ts`·`styles/{base,collapse,debug,drag,menu,props,route}.ts`(TS 문자열 + `<style href precedence>`, 로컬 `.css` import 없음 — Local-Rules §17). 선 경로 편집(C14)의 순수 계산(둥근 꺾은선 경로·가운데 점·점 더하기)은 `canvas/route-path.ts`, 손잡이 스타일은 `styles/route.ts` 에 있다 | 2단계 계획 Task 5~11, 3단계 계획 Task 0~12·15. 1단계 목록 카드(`RuleSetCard`·`RuleListGrid`)는 삭제(D-113), 2단계 `SimulationPanel`·`TraceStepper`·시뮬레이션 탭은 삭제(D-118) |
| tsup entry key | `pages/dme/ruleSetEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`(READ), `save`·`delete`(폐기)·`restore`(되살리기)·`validate`(조건식 IO)·`execute`(기록 실행 = 디버거)(EDIT). 서비스 메서드는 `validate`→`condIo`, `execute`→`simulate`. **3단계는 새 action 동사를 만들지 않고 칸만 더한다**(ADR-0003 D5 16단어): `save` 의 `part=CASE`(테스트 케이스 저장, 삭제는 `caseDeleted=true`), `view` 응답의 `cases`(케이스 목록), `validate` 의 `exprText`(식 파싱만 — 응답 `expr`), `execute` 의 `runCases`·`caseIds`·`setId`(저장된 케이스 일괄 실행 — 응답 `cases`, `trace` 는 null) | design §6.12·I17, 2단계 P5·P-D2, D-112, 3단계 P-D1·P-D12, D-120·D-122 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 룰 세트 편집(`ruleSetEdit`, seq 005, fullSeq 5050500) | `DataInitializer.seedMdmRuleSetMenus()`, design D12 |
| 화면 간 파라미터 | `useMdmPageParams("dme/ruleSetEdit", tabId, p => open(p.setId))` | design I22 |

## 2. 화면 영역 정의

화면은 위에서 아래로 상단 바 → 흐름 툴바(디버그 모드면 그 아래 디버그 툴바 한 줄이 더 붙는다) → (왼쪽 패널 | 캔버스 | 오른쪽 패널) → 아래 패널이다. 분할선은 끌어 크기를 바꾼다(`ContentBody resizable`, 저장 키 `mdm.dme.ruleSetEdit`·`.main`). 세 패널(왼쪽 280·오른쪽 360 기본)은 모드와 무관하게 늘 두고 **내용만 바꾼다** — 모드를 바꿔도 사용자가 끈 너비가 남는다. 아래 패널 기본 높이는 280 이다.
오른쪽 패널은 계획의 `ResizableFormPanel` 대신 `ContentBody resizable` + `ContentPanel width=360` 이다(FrontEnd Part B §4-3 이 신규 화면의 `ResizableFormPanel` 사용을 금지한다).

모드는 툴바의 [보기][편집][디버그] 셋이다. 세트를 열면 보기 모드다. 배치는 모드마다 다르다.

```
[보기]
┌ 상단 바: 세트 고르기 · 현재 세트 ────────────────────────────────────────────────┐
├ 흐름 툴바: 세트 · [보기][편집][디버그] · 되돌리기 · 찾기 · [?] · 정렬·맞춤·변수·미니맵 · 폐기·저장 ┤
├ 왼쪽: 룰 목록 ──┬ 가운데: 캔버스 ───────────────┬ 오른쪽: 세트 패널 / 속성 ────┤
│ (찾기·목록만.   │ 노드·선·메모·그룹, 접힌 블록,   │ 선택 없음 = 세트 패널         │
│  끌기 없음)     │ 확대 막대·미니맵                │ 선택 있음 = 속성(읽기 전용)   │
├────────────────┴────────────────────────────────┴──────────────────────────────┤
│ 아래 패널: [검사 결과 n]                                                           │
└────────────────────────────────────────────────────────────────────────────────┘

[편집]  왼쪽 위에 팔레트(룰·IF·병렬·메모·그룹)가 더해지고 목록 줄은 캔버스 선 위로 끌 수 있다. 오른쪽 속성은 고칠 수 있다. 캔버스는 끌기·[+]·우클릭 편집이 켜진다.

[디버그]
┌ 흐름 툴바 ─────────────────────────────────────────────────────────────────────┐
├ 디버그 툴바: [계속 F5][한 단계 F10][이전][여기까지][처음부터][끝내기] · 3/7 r2 실행 전 · 지난 흐름 기준 ┤
├ 왼쪽: 입력 ───────┬ 가운데: 캔버스 ────────────────┬ 오른쪽: 변수 ───────────────┤
│ 판정 시각          │ 실행한 노드: 초록·순번         │ 조사식(고정 변수)            │
│ 입력 변수 폼       │ 지금 노드: 굵은 테두리         │ 변수 표(커서 자리 전체,      │
│ [JSON 붙여넣기]▾   │ 다음 노드: 점선                │  바뀐 값 강조·새 배지)       │
│ 최근 입력 ▾        │ 아직 안 탄 노드: 회색          │ 노드 상세(선택 노드)         │
│ 테스트 케이스      │ 중단점: 노드 왼쪽 빨간 점      │ 식 평가                      │
│ (목록·모두 실행)   │ 접힌 블록: "안쪽 실행 k개"     │                              │
├───────────────────┴────────────────────────────────┴─────────────────────────────┤
│ 아래 패널: [값 표(변수×단계)] [실행 비교] [검사 결과 n]                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

- 디버그 모드에서는 캔버스를 고칠 수 없다(끌기·연결·[+]·삭제·붙여넣기·편집 메뉴 항목 없음). 흐름을 고치려면 편집 모드로 돌아간다. 입력값·중단점·조사식·기록은 모드를 오가도 유지한다(훅이 page 에 있다).
- 디버그 모드에서는 속성 패널 자리에 변수 패널이 오므로 노드를 눌러도 속성이 아니라 노드 상세가 보인다. 속성을 보려면 보기·편집 모드로 간다.
- 디버그 모드에 들어가면 [변수 흐름]을 켜고 나오면 들어가기 전 값으로 돌린다(3단계 P-D16). 아래 패널은 모드를 바꿀 때 그 모드의 첫 탭(디버그 = 값 표, 그 밖 = 검사 결과)으로 간다.
- 디버그 툴바는 세트 툴바 아래 둘째 줄이다(3단계 P-D22 — 한 줄에 단추가 넘친다). 스펙 §4.1 그림은 한 줄로 그렸다.

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-TOP` | 세트 고르기 바(`set-edit-topbar`) | 세트 ID·세트명 검색(`set-pick-keyword`) + 찾기 → 칸 아래 드롭다운 후보(`set-pick-list` 안 `set-pick-{setId}`, 룰 화면 룰 고르기와 같은 `IdPicker` — ↑↓·Enter·Esc, 20건이면 좁혀 검색 안내), 현재 세트(`set-edit-current`, `ID · 세트명`). 고르기 전에는 "세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다"(`set-edit-empty`) |
| `A-TOOL` | 흐름 툴바(`flow-toolbar`) | 세트 ID(`set-card-id`)·상태 배지(`set-status`)·`row_version N`(`set-row-version`)·"버전·승인 없음" · [보기](`flow-mode-view`)/[편집](`flow-mode-edit`)/[디버그](`flow-mode-debug`) · [되돌리기](`flow-undo`)·[다시 하기](`flow-redo`) · 찾기 칸(`flow-find`)·[다음](`flow-find-next`)·`flow-find-count`("2/5", 없으면 "0/0")·[?] 단축키 도움말(`flow-help`→`flow-help-panel`) · [자동 정렬](`flow-auto-layout`, 편집 모드만 켜진다)·[화면 맞춤](`flow-fit`)·[변수 흐름](`flow-var-toggle`, `aria-pressed`)·[미니맵](`flow-minimap-toggle`, `aria-pressed`) · [세트 저장](`set-save`)·[폐기](`set-deprecate`)→[폐기 확인](`set-deprecate-confirm`)/[취소](`set-deprecate-cancel`)·[되살리기](`set-restore`)·[다시 불러오기](`set-reload`, MDM001 뒤에만) · 메시지 줄(`set-message`) |
| `A-DBG` | 디버그 툴바(`dbg-toolbar`, 디버그 모드만) | [계속](`dbg-continue`)·[한 단계](`dbg-step`)·[이전](`dbg-step-back`)·[여기까지](`dbg-run-to`)·[처음부터](`dbg-restart`)·[끝내기](`dbg-finish`) · 상태 문구(`dbg-status`, `data-end` = idle·running·done·error) · 낡은 기록 배지(`dbg-stale`) · 알림(`dbg-notice`, `data-kind` = notice·error) |
| `A-LEFT` | 왼쪽 패널 | 보기·편집 = **룰 패널**(`flow-rule-panel`): 편집 모드면 위에 팔레트(`flow-palette` — [룰](`flow-add-rule`)·[IF](`flow-add-if`)·[병렬](`flow-add-par`)·[메모](`flow-add-note`)·[그룹](`flow-add-group`)), 아래에 룰 목록(접기 `flow-rule-panel-toggle`, 검색 `flow-rule-panel-search`·`flow-rule-panel-find`, 목록 `flow-rule-rows`, 줄 `flow-rule-row-{ruleId}`). 보기 모드는 목록만이고 줄을 끌 수 없다. 디버그 = **입력 패널**(`dbg-inputs`, 3단계 P-D10 — 룰 목록을 두지 않는다) |
| `A-CANVAS` | 흐름도 캔버스(`flow-canvas`) | React Flow. 노드·선·메모·그룹 틀. 표시 내용은 §3.2. 오른쪽 아래에 확대 막대(`Controls` — 확대·축소·화면 맞춤, 잠금 단추 없음)와 미니맵. 캔버스 감싸개(`rsf-canvas-host`)가 단축키(§5.4)를 받고 우클릭·[+] 메뉴(`flow-menu`, §5.5)를 안에 띄운다 |
| `A-PROPS` | 오른쪽 패널(`flow-props`) | 보기·편집 = 선택이 없으면 **세트 패널**(`flow-prop-set` — 세트명 `set-name`·설명 `set-desc`·세트 입출력 표 `set-io-*`·구성 지침 `set-guide-*`), 룰 노드면 `flow-prop-rule`, IF 면 `flow-prop-if`, 병렬이면 `flow-prop-par`, 시작·끝·합류면 `flow-prop-node`, 메모면 `flow-prop-note`, 그룹이면 `flow-prop-group`. 세트 패널로 돌아가려면 캔버스 빈 곳을 누른다. 디버그 = **변수 패널**(`var-panel`) — 조사식(`var-watches`)·변수 표(`var-grid`)·노드 상세(`sim-detail`)·식 평가(`expr-input`) |
| `A-BOTTOM` | 아래 패널(`flow-bottom`) | 접기 `flow-bottom-toggle`(`aria-expanded`). 보기·편집 = 탭 하나 「검사 결과 n」(`flow-tab-checks`, 검사 목록 `set-checks`·항목 `set-check-{i}`). 디버그 = 「값 표」(`flow-tab-values`, 안에 `sim-values`·`sim-warnings`)·「실행 비교」(`flow-tab-compare`, 안에 `run-compare`)·「검사 결과 n」. 탭 testid 는 탭 버튼 안쪽 `span` 에 붙어 있다(`aria-selected` 는 부모 버튼 `role="tab"` 에 있다) |


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
| 디버거 겹침 | 순번 `flow-node-seq-{nodeId}`, 칩 `flow-node-chip-{nodeId}` | 실행된 노드의 순번(지금 노드는 순번·칩 없음), 룰 결과 첫 항목(`이름=값`) 또는 오류 코드. 디버그 모드에서는 `data-state` 값에 `current`·`next`·`pending` 이 더 있다(아래 표) |

3단계에서 캔버스에 더해진 요소:

| 요소 | testid | 설명 |
|---|---|---|
| 선 위 [+] | `flow-edge-add-{edgeId}` | 편집 모드에서만. 선 가운데(조건 라벨이 있으면 라벨 오른쪽)에 둔다. 누르면 메뉴(룰 넣기·IF 넣기·병렬 넣기, 클립보드가 있으면 붙여넣기) |
| 끌기 대상 선 강조 | `flow-edge-drop-{edgeId}` | 팔레트 항목·룰 목록 줄·놓인 노드/블록을 끄는 동안 커서에서 화면 80px 안(`80/zoom` 흐름 좌표) 가장 가까운 선을 굵은 파란 선으로 그리고 가운데에 「여기에 넣기」 표지를 띄운다 |
| 즉석 조건식 입력 칸 | `flow-edge-cond-input-{edgeId}` | IF 의 「그 외」가 아닌 갈래의 선 라벨을 두 번 누르면 라벨 자리에 열린다(§5.3). 선 라벨 요소에 `data-cond-edge` |
| 중단점 점 | `flow-bp-{nodeId}` (`data-on` = true·false) | 룰·IF·병렬·합류 노드의 왼쪽 가장자리. 디버그 모드에서는 눌러 켜고 끄는 단추이고(노드 선택은 바뀌지 않는다), 그 밖 모드에서는 켜진 것만 작은 점으로 보이며 누를 수 없다 |
| 접힌 블록 | `flow-collapsed-{splitId}` (`data-error`), `flow-collapsed-ran-{splitId}` | 접힌 분기를 룰 박스 크기의 노드 하나로 그린다 — 문구 「IF 조건 · 노드 6개」/「병렬 · 노드 6개」(분기·짝 합류를 뺀 안쪽 노드 수). 디버거 기록이 있으면 형제 요소 「안쪽 실행 k개」, 안쪽 또는 합류가 오류로 끝났으면 빨간 테두리. 접힌 분기에서 나가는 선은 합류 뒤로 이어지고 갈래 이름·조건 편집이 없다. 접힘은 화면 상태이고 저장하지 않는다 |
| 디버그 상태 모양 | 노드 `data-state` | `current` 굵은 강조 테두리, `next` 점선, `pending` 회색(끝에 닿으면 2단계 최종 겹침과 같이 `run`·`error`·`dim`). 변수 칩(`flow-edge-chips-{edgeId}`)에 마우스를 올리면 `title` 로 커서 자리 값(`이름 = 값`, 아직이면 `이름 · 아직 없음`)을 보인다 |
| 선 경로 손잡이(C14, Task 15 구현) | `flow-route-handle-{edgeId}-{i}` (`data-selected="true"` = 고른 손잡이, `data-dragging="true"` = 끌리는 손잡이) | 편집 모드에서 선을 고르면 꺾는 점마다 손잡이가 보인다. 동작은 §5.3 |

`FLOW_JSON.view` — 화면 전용 저장 칸. 판정에는 쓰지 않는다.

| 키 | 내용 |
|---|---|
| `positions` | 노드 ID → `{x, y}` (흐름 좌표) |
| `notes` | 메모 목록(글·위치·붙은 노드) |
| `groups` | 그룹 틀(제목·구성 노드) |
| `routes` (C14, Task 15 구현) | 선 ID → 꺾는 점 목록 `{x, y}[]` (흐름 좌표). 선 하나에 20개까지. 키 순서는 선 순서이고 없는 선의 경로는 버린다. 꺾는 점이 없는 선은 자동 경로로 그린다 |

서버 `RuleSetFlowJson` 은 view 를 읽지 않는다(객체인지만 본다) — 정규 JSON 을 다시 쓸 때 받은 view 객체를 그대로 싣는다(`out.set("view", view)` 확인). 그래서 `routes` 를 더해도 서버·DB·엔진은 바뀌지 않는다. 화면 `sanitizeView`·`flowJsonOf` 만 `routes` 를 읽고 쓴다. **앞 스펙(2026-09-29) §3.3 저장 형식의 view 정의에는 `routes` 가 없다 — view 의 정본은 이 문서다.** 블록 접힘·중단점·조사식·최근 입력·미니맵 표시는 view 에 넣지 않는다(개인 화면 상태, 일부는 브라우저 저장소 — §5.6).

### 3.3 세트 입출력 표 (`SetIoTables`, 저장하지 않는 계산값 — 선택이 없을 때 오른쪽 세트 패널에 있다)

| 표 | 칸 | 설명 |
|---|---|---|
| 입력 변수(`set-io-inputs`, 행 `set-io-input-{이름}`) | 변수·표시명·타입·출처·읽는 룰 | 머리 "입력 변수 N개 · 세트를 부를 때 레코드에 넣어야 하는 값". 출처 배지 "컬럼 사전"(DICT)/"프로그램 변수"(PROG)/"어디에도 없음"(NONE). 앞 룰이 만들기 전에 읽는 이름도 여기 잡힌다 |
| 결과 변수(`set-io-results`, 행 `set-io-result-{이름}`) | 변수·타입·구분·만드는 룰·읽는 룰 | 머리 "결과 변수 N개 · 최종 a개, 중간 b개". 최종 먼저. 만드는 룰이 둘 이상이면 "덮어씀" 배지 |

타입 표시: NUMBER 는 `Number(scale 또는 -)`, 일자 String 은 "일자 String", 코드 도메인은 "코드 String", 그 밖은 dataType, 없으면 "-".

## 4. 편집 필드 정의 (영역: A-PROPS·A-LEFT·A-DBG)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_RULE_SET_NAME` | 세트명 | TextBox(`set-name`) | Y | 불러온 값 | 100자 이하 |
| D-002 | `DESCRIPTION` | 설명 | Textarea(`set-desc`) | N | 불러온 값 | 빈 값은 null |
| D-003 | `FLOW_JSON` | 흐름 | 캔버스 편집(팔레트 끼우기·끌어 놓기·놓인 노드/블록 옮기기·선 위 [+]·복사 붙여넣기·복제·룰 바꾸기·분기 바꾸기·풀기·갈래 순서 끌기·선 경로 편집(Task 15)·연결·속성 패널·지침 적용) | — | 불러온 흐름(없으면 `RULE_IDS` 의 한 줄 흐름) | P2 정규 JSON 문자열(`flowJson`). 서버가 파싱한 정의로 다시 써 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다. 같은 룰이 다른 갈래에 두 번 있을 수 있다. 노드는 200개까지이고 넘게 하는 끼우기·붙여넣기는 거부한다(「노드는 흐름 하나에 200개까지 둔다」) |
| D-004 | — | 룰 찾기(팝업) | TextBox(`flow-rule-search-keyword`) + 찾기(`flow-rule-search-find`) | — | — | 팔레트 [룰]·선 [+]/우클릭 「룰 넣기」·노드 「룰 바꾸기」가 연다. `search{target:"RULE"}` 룰 ID·룰명 앞부분 20건(후보 `flow-rule-cand-{id}`, 룰명·상태·버전, 이미 세트에 있으면 "사용 중" 배지). RELEASED 버전이 없는 룰은 뺀다. 누르면 끼울 선에 새 룰 노드를 끼우거나(넣기) 노드의 `ruleId` 만 바꾼다(바꾸기 — 자리·선은 그대로, 같은 룰이 이미 세트에 있어도 막지 않고 검사가 판단한다). 실패 문구 `flow-rule-search-error` |
| D-005 | — | 지침 결과 변수 | TextBox(`set-guide-var`) + 찾기(`set-guide-run`) | — | — | `search{target:"GUIDE", resultVar}` — 세트 패널에 있다 |
| D-006 | (`FLOW_JSON.view`) | 속성 패널 입력 | 룰(읽기 전용 표), IF·병렬 갈래 이름 `flow-prop-branch-{edgeId}-label`·조건식 `flow-prop-branch-{edgeId}-cond`("그 외" 갈래는 조건식 칸 없음), 분기 이름 `flow-prop-label`, 메모 글 `flow-prop-note-text`, 그룹 제목 `flow-prop-group-title` | — | — | 보기 모드에서는 모두 읽기 전용이고 ▲▼✕·지우기·더하기·끌기 손잡이가 없다. 입력 칸은 같은 칸을 1초 안에 연달아 고치면 되돌리기 기록 한 번으로 합친다(§5.4) |

### 4.1 디버그 모드 입력 필드 (영역: A-DBG·A-LEFT·A-PROPS)

| 필드ID | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|
| D-007 | 판정 시각 | TextBox(`dbg-evalts`) | N | 빈값(= 서버 현재 시각) | `yyyy-MM-dd HH:mm:ss` (KST). 형식이 틀리면 칸 아래 오류이고 실행하지 않는다 |
| D-008 | 입력 변수 | 줄마다 키 보냄 체크(`dbg-send-{name}`) + 값 TextBox(`dbg-input-{name}`) | N | 보냄 | `flowIo` 입력 변수 가운데 출처가 컬럼 사전(DICT)·프로그램 변수(PROG)인 이름만 칸으로 만든다(NONE 은 검사가 이미 거부한다, 2단계 P-D8). 켜 놓고 비운 칸은 null 로, 끈 칸은 키를 보내지 않는다 |
| D-009 | JSON 붙여넣기 | Textarea(`dbg-json`) + [폼으로 가져오기](`dbg-json-import`) — 접이 영역 | N | 빈값 | 글이 있으면 **폼 대신 이것을 보낸다**. 그동안 폼 칸(키 보냄·값)은 꺼지고 「JSON 입력을 보낸다. 폼을 쓰려면 JSON 칸을 비운다」(`dbg-json-active`)가 뜬다. 객체가 아니면 칸 아래 오류이고 실행하지 않는다. [폼으로 가져오기]는 객체를 폼 줄로 풀고 칸을 비운다 |
| D-010 | 최근 입력 | Select(`dbg-recent`) | N | — | 세트별 최근 10개(같은 입력은 한 번만). 고르면 폼에 채운다. 실행에 성공한 입력만 기억한다 |
| D-011 | 케이스 이름 | TextBox(`case-modal-name`) | Y | 「케이스 N」 | 케이스 팝업. 100자 이하 |
| D-012 | 케이스 설명 | TextBox(`case-modal-desc`) | N | 빈값 | |
| D-013 | 케이스 입력 JSON | Textarea(`case-modal-input`) | Y | 지금 입력 | 객체 |
| D-014 | 케이스 판정 시각 | TextBox(`case-modal-evalts`) | N | 지금 입력의 판정 시각 | 형식 D-007 과 같다. 비우면 실행할 때의 시각 |
| D-015 | 케이스 기대 JSON | Textarea(`case-modal-expected`) | N | 조건부 — 새 케이스이고 낡지 않은 마지막 기록의 입력이 지금 입력과 같을 때만 그 기록의 최종 변수로 채운다 | **결과 변수만** 적는다(입력 변수 이름은 「결과에 없음」 실패). 비우면 기대값 없이 실행만 하는 케이스 |
| D-016 | 조사식 | 변수 표 핀 칸 누르기 / 조사식 ✕(`var-watch-remove-{name}`) | N | 없음 | 세트별 브라우저 저장. 흐름 입력·결과 이름이 아니면 「없는 변수」 배지(`data-missing="true"`) |
| D-017 | 식 | TextBox(`expr-input`) | N | 빈값 | Enter 로 평가. 최근 식 5개(`expr-recent-{i}`) |


## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명(testid) | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 찾기 | A-TOP | `search`(SET) | 세트 후보 |
| B-002 | 세트 저장(`set-save`) | A-TOOL | `save` | 편집 모드이고 dirty 이며 **거부(REJECT) 검사가 없고** 조건식 IO 응답을 기다리지 않을 때만 켜진다(P-D4). 꺼진 까닭은 title 로 보인다 |
| B-003 | 폐기(`set-deprecate`) → 폐기 확인(`set-deprecate-confirm`)/취소(`set-deprecate-cancel`) | A-TOOL | `delete` | INUSE·editable·`delete` 권한. 두 단계로만 폐기한다(D14, I14) |
| B-004 | 되살리기(`set-restore`) | A-TOOL | `restore` | DEPRECATED·restorable·`restore` 권한 |
| B-005 | 다시 불러오기(`set-reload`) | A-TOOL | `view` | MDM001 충돌 뒤에만 보인다 |
| B-006 | 보기(`flow-mode-view`)/편집(`flow-mode-edit`)/디버그(`flow-mode-debug`) | A-TOOL | (없음) | 세트를 열면 보기 모드다. [편집]은 `view.editable`·INUSE·`save` 권한일 때만 켜진다. [디버그]는 누구나 들어간다(실행 단추는 `execute` 권한이 따로 켠다). 편집 → 보기/디버그는 편집 내용을 버리지 않는다. 디버그 모드 입력값·중단점·조사식·기록은 모드를 오가도 유지한다 |
| B-007 | 자동 정렬(`flow-auto-layout`) | A-TOOL | (없음) | dagre 위→아래 배치로 모든 노드 위치를 다시 잡는다(편집 모드만 켜진다). 모든 선의 경로(`view.routes`)도 함께 지운다(C14). 위치와 경로 지우기는 이력 한 칸이라 되돌리기 한 번으로 함께 살아난다 |
| B-008 | 화면 맞춤(`flow-fit`)·변수 흐름(`flow-var-toggle`)·미니맵(`flow-minimap-toggle`) | A-TOOL | (없음) | 보기 조절. 서버를 부르지 않는다. 미니맵은 켜고 끔을 브라우저 저장소(`rsf:minimap`)에 기억한다 |
| B-009 | 룰(`flow-add-rule`)·IF(`flow-add-if`)·병렬(`flow-add-par`)·메모(`flow-add-note`)·그룹(`flow-add-group`) | A-LEFT(팔레트) | `search`(RULE, 룰 팝업) | 편집 모드만. 동작은 §5.3 |
| B-010 | 찾기(지침, `set-guide-run`) | A-PROPS(세트 패널) | `search`(GUIDE) | |
| B-011 | 이 순서로 한 줄 흐름 만들기(`set-guide-apply`) | A-PROPS(세트 패널) | (없음) | 한 줄 흐름이면 제안 순서로 `linearFlow(순서)` 를 만들고(배치 초기화) 응답 `rules` 의 입출력을 더한다(dirty). 편집 모드·`save` 권한일 때만 켜진다. **분기가 있는 흐름이면 꺼진다**(P-D5, 1단계 Ruling 13) |
| B-012 | 지우기(`flow-prop-delete`) | A-PROPS | (없음) | 룰·분기·메모·그룹 지우기. 룰은 앞뒤 선을 이어 붙이고 분기는 짝 합류까지 블록째 지운다. 시작·끝·합류는 지울 수 없다 |
| B-013 | 갈래 더하기(`flow-prop-add-branch`)·갈래 ▲▼✕(`flow-prop-branch-{edgeId}-up/-down/-remove`) | A-PROPS(IF·병렬) | (없음) | 갈래는 2개 미만으로 줄일 수 없고 IF 의 "그 외" 갈래는 지울 수 없다 |
| B-014 | 룰 편집 열기(`flow-prop-rule-open`) | A-PROPS(룰) | (없음) | `openRuleEdit(ruleId)` |
| B-015 | 그룹 구성 노드 빼기(`flow-prop-group-remove-{nodeId}`)·선택 노드 더하기(`flow-prop-group-add`) | A-PROPS(그룹) | (없음) | 구성 노드 목록 `flow-prop-group-member-{nodeId}`. 다 빼면 그룹이 없어진다 |
| B-016 | 접기(`flow-bottom-toggle`)·탭(`flow-tab-checks`, 디버그 모드는 `flow-tab-values`·`flow-tab-compare` 가 더 있다) | A-BOTTOM | (없음) | |
| B-017 | 검사 항목(`set-check-{i}`) | A-BOTTOM | (없음) | 누르면 그 노드를 고르고 캔버스를 그 노드로 옮긴다(노드 ID 가 없는 항목은 눌 수 없다) |
| B-018 | 되돌리기(`flow-undo`)·다시 하기(`flow-redo`) | A-TOOL | (없음) | 편집 모드에서 이력이 있을 때만 켜진다. 단축키 Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z·Y(§5.4). 이력은 흐름 사본 100개까지 |
| B-019 | 찾기 칸(`flow-find`)·다음(`flow-find-next`)·개수(`flow-find-count`) | A-TOOL | (없음) | 룰 ID·룰 이름·노드 라벨로 찾는다(대소문자 무시). **Enter(또는 [다음])에서만** 다음 결과로 옮기고 글자를 치는 동안은 옮기지 않는다 — 첫 Enter 는 첫 결과, 그다음부터 한 칸씩 돌아 끝에서 처음으로 간다. 옮기면 그 노드를 고르고 캔버스를 그 노드로 옮기며 깜빡인다. 접힌 블록 안의 노드면 블록을 펼친다 |
| B-020 | 단축키 도움말(`flow-help` → `flow-help-panel`) | A-TOOL | (없음) | 지금 모드에서 쓸 수 있는 단축키만 표로 보인다. Mac 이면 「F9·F10·F5 는 fn 과 함께 누른다」 안내. Esc 로 닫는다 |
| B-021 | 룰 목록 찾기(`flow-rule-panel-find`, 검색 칸 Enter)·줄(`flow-rule-row-{ruleId}`) | A-LEFT | `search`(RULE) | 룰 ID·룰명으로 찾아 RELEASED 버전이 있는 룰만 보인다. 편집 모드에서 줄을 캔버스 선 위로 끌거나 두 번 누르면 끼운다(두 번 누르기는 **고른 선이 있어야** 하고 없으면 「넣을 선을 먼저 고른다」 — END 앞 선으로 넘어가지 않는다) |
| B-022 | 계속(`dbg-continue`)·한 단계(`dbg-step`)·여기까지(`dbg-run-to`)·처음부터(`dbg-restart`)·끝내기(`dbg-finish`) | A-DBG | `execute` | `execute` 권한(EDIT)이 없으면 꺼지고 title `디버거는 편집 권한이 있어야 쓸 수 있다`(2단계 P-D3). 실행 중에는 모두 꺼진다. [여기까지]는 캔버스에서 고른 흐름 노드가 있어야 켜진다. 동작은 §5.2 |
| B-023 | 이전(`dbg-step-back`) | A-DBG | (없음) | 커서를 한 칸 되돌린다(0 아래로는 가지 않는다). 서버를 부르지 않으므로 `execute` 권한과 무관하다. Shift+F10 |
| B-024 | 중단점 점(`flow-bp-{nodeId}`)·우클릭 「중단점 켜기/끄기」·F9 | A-CANVAS | (없음) | 룰·IF·병렬·합류에 걸 수 있다. 개인 화면 상태(브라우저 저장소 `rsf:bp:<setId>`)라 권한과 무관하다. 흐름에서 사라진 노드의 중단점은 불러올 때 버린다 |
| B-025 | 케이스: 지금 입력 저장(`case-save-current`)·모두 실행(`case-run-all`)·불러오기(`case-load`)·디버그로 열기(`case-debug`)·고치기(`case-edit`)·삭제(`case-delete` → `case-delete-confirm`/`case-delete-cancel`) | A-LEFT(디버그) | `save`(part=CASE)·`execute`(runCases) | [지금 입력 저장]·[고치기]·[삭제]는 편집할 수 있는 세트(담당자·INUSE·`save` 권한)일 때만, [모두 실행]·[디버그로 열기]는 `execute` 권한이 있을 때만 켜진다. 팝업(`case-modal` — 저장 `case-modal-save`·취소 `case-modal-cancel`). 동작은 §5.2 |
| B-026 | 변수 표 핀 칸·조사식 ✕(`var-watch-remove-{name}`)·식 평가(`expr-input` Enter)·최근 식(`expr-recent-{i}`) | A-PROPS(디버그) | `validate`(식 파싱) | 식 평가는 `validate` 권한(EDIT)이 없거나 실행 기록이 없으면 칸이 꺼지고 title 로 이유를 보인다. 동작은 §5.2 |
| B-027 | 아래 탭 값 표(`flow-tab-values`)·실행 비교(`flow-tab-compare`) | A-BOTTOM(디버그) | (없음) | 서버를 부르지 않는다 |

### 5.1-1 캔버스·표 안의 인라인 동작 (GB-NNN)

| 버튼ID | 버튼명 | 소속 | 핸들러 | 설명 |
|---|---|---|---|---|
| GB-001 | 룰 박스 링크 아이콘(`flow-rule-open-{nodeId}`) | 캔버스 RULE 노드 | `openRuleEdit(ruleId)`(`@/dme/rule-handoff`, 버전 없음) | 룰 화면 탭을 연다. **박스 누르기는 선택 + 속성 패널만 열고 룰 화면을 열지 않는다.** 두 번 누르기는 아무것도 하지 않는다 |
| GB-002 | (변수 링크 `set-var-link-{이름}`) | 세트 입출력 표 | DICT → `openMdmPage("dma/columnMng")`(파라미터 없음, D13), 결과 변수 → 만드는 첫 룰의 `openRuleEdit` | PROG·NONE 은 링크 없음(title "컬럼 사전 밖 이름이라 갈 곳이 없다") |
| GB-003 | 룰 박스 누르기 | 캔버스 | 선택 → 속성 패널 | 룰 노드의 속성 패널은 입력 변수(`flow-prop-input-{이름}`)의 출처·앞 룰 결과 여부, 결과 변수(`flow-prop-result-{이름}`), 그 노드에 걸린 검사 문구를 보인다 |
| GB-004 | 선 위 [+](`flow-edge-add-{edgeId}`) | 캔버스 선(편집 모드) | 메뉴 열기(`{kind:"edge", via:"plus"}`) | 룰 넣기·IF 넣기·병렬 넣기·(클립보드가 있으면) 붙여넣기. 누른 자리 화면 좌표에 뜬다 |
| GB-005 | 선 라벨 두 번 누르기(`flow-edge-label-{edgeId}`) | 캔버스 선(편집 모드, IF 의 「그 외」가 아닌 갈래만) | 즉석 조건식 입력 칸 | 3단계 P-D17 — 라벨은 갈래 이름을 보이지만 여는 칸은 **조건식(`cond`)** 이다. Enter 확정(속성 패널과 같은 `updateEdge`, 되돌리기 합치기 키 `cond:{edgeId}`), Esc·칸 밖 누르기·초점 잃음은 취소 |
| GB-006 | 중단점 점(`flow-bp-{nodeId}`) | 캔버스 노드(디버그 모드) | `toggleBreakpoint(nodeId)` | 노드 선택은 바뀌지 않는다 |
| GB-007 | 룰 목록 줄 두 번 누르기 | 왼쪽 룰 패널(편집 모드) | `dropRule(ruleId, 고른 선)` | B-021 |

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작(단계별) | 호출 액션 |
|---|---|---|---|---|
| (세트 열기) | 후보 클릭·넘겨받은 setId | dirty 면 확인 "저장하지 않은 변경이 있습니다. 버리고 이동할까요?" | `view{setId}` → 세트·흐름·멤버 룰 입출력·검사·조건식 IO(`condIo`)·**테스트 케이스 목록(`cases`)**·`editable`·`restorable`. 흐름은 `toEditFlow` 로 편집 모델이 되고 모드는 보기다. 편집 이력은 비운다. 다른 세트로 바뀌면 선택·접힘·디버거 기록과 커서를 지우고 그 세트의 중단점·조사식·최근 입력을 브라우저 저장소에서 읽는다. 저장된 흐름을 읽을 수 없으면 MDM026 을 문장으로 보인다 | `view` |
| B-002 | 클릭 | 위 조건 | 1) `save{setId, setName, description?, rowVersion, flowJson}` — `flowJson` 은 `flowJsonOf(flow)`(P2 정규 JSON 과 같은 키 순서). `grids` 는 보내지 않는다 2) 서버 순서: 길이(262,144자) → 형식(MDM021) → 룰 ID 규칙 → 담당자 → 세트 저장 검사(거부면 MDM024) → 정규 JSON 저장 + 펼친 `RULE_IDS` 3) 성공 "저장 · row_version N" + 경고 줄 → 서버 정규 흐름으로 다시 불러온다. **모드와 되돌리기 이력은 그대로다**(3단계 P1 — 편집 모드에서 저장하면 편집 모드에 남는다. 폐기·되살리기 뒤 편집할 수 없게 되면 보기로 내린다) 4) 거부는 서버 `meta.message`(`set-message`), 편집 중 흐름은 둔다 5) MDM001 은 "다른 창에서 바뀌었습니다. 다시 불러오세요" + 다시 불러오기 6) `flowJson` 없는 옛 목록 저장이 `FLOW_JSON` 이 있는 세트에 오면 `FLOW_READONLY` 로 거부한다(§6.2 XV-019) | `save` |
| (조건식 IO) | IF 의 "그 외"가 아닌 갈래의 `(id, cond)` 가 바뀜 | 편집 모드 | 400ms 디바운스 뒤 `validate{flowJson}` → `condIo`(선 ID → 조건식이 읽는 변수의 출처·타입). 요청 순번으로 늦게 온 응답은 버리고(Local-Rules §11), 응답을 기다리는 동안(`condIoPending`) 저장을 막는다. 실패하면 오류 창 + 기다림 해제(condIo 는 그대로) | `validate` |
| B-003 | 폐기 → 폐기 확인 | INUSE | 1) 폐기를 누르면 경고 "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다."와 폐기 확인/취소 2) 폐기 확인 → `delete{setId, rowVersion}` 3) "폐기 · row_version N. 행은 남기고 되살릴 수 있다" | `delete` |
| B-004 | 클릭 | DEPRECATED | `restore{setId, rowVersion}` → 저장된 흐름으로 검사를 다시 돌려 거부가 없을 때만 INUSE. "되살림 · row_version N" + 경고. 저장된 흐름이 손상됐으면 MDM026 | `restore` |
| B-010 | 클릭·Enter | 결과 변수 입력 | `search{target:"GUIDE", resultVar}` → 오류(`set-guide-error`) 또는 "제안 순서 · 1. A → 2. B …" + "고르기" 배지(한 결과 변수를 만드는 룰이 둘 이상) | `search` |
| (디버그 실행) | [한 단계]·[계속]·[여기까지]·[처음부터]·[끝내기]·F10·F5 | `execute` 권한, 실행 중 아님, 입력 오류 없음 | 1) **새로 실행하는 경우** — 기록이 없거나, 기록이 낡았거나(흐름 구조가 실행 뒤 바뀜), 지금 입력이 기록 입력과 다르다(3단계 P-D9). 그때 `execute{flowJson, recordJson, evalTs?}` 를 **저장하지 않은 현재 흐름**으로 보낸다(폼에서 만든 레코드, `dbg-json` 이 있으면 그것, 빈 판정 시각은 보내지 않는다). 응답의 실행 기록과 **그때의 흐름 사본**을 결과에 두고, 바로 전 결과는 「이전 실행」(한 개)으로 보관한다. 실행에 성공한 입력은 최근 입력(10개)에 기억한다 2) **기록이 있는 동안은 서버를 다시 부르지 않고** 커서만 옮긴다(스펙 §4.2 — 실행이 결정적이라 미리 끝까지 돌리고 한 칸씩 보여 주는 것이 진짜 단계 실행과 결과가 같다) 3) 커서 위치: 새 실행 직후 — [한 단계]·[처음부터] 0, [계속] 중단점 노드가 처음 나오는 칸(0 포함, 없으면 끝), [여기까지] 고른 노드가 처음 나오는 칸, [끝내기] 끝. 기록이 있을 때 — [한 단계] 한 칸(끝에서 멈춤), [계속] 커서 **뒤**에서 중단점 노드가 처음 나오는 칸(없으면 끝), [여기까지] 커서 뒤에서 고른 노드가 처음 나오는 칸, [처음부터] 0, [끝내기] 끝, [이전] 한 칸 뒤로 4) [여기까지]로 고른 노드가 커서 뒤에 없으면 알림(`dbg-notice`) — 앞에 있으면 「이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다」, 기록에 없으면 「이 입력으로는 이 노드를 지나지 않는다」 5) 요청을 보내지 못하면(서버 거부·입력 오류) 오류 문구만 두고 기록·커서는 그대로. 늦게 온 응답은 요청 순번·세트·흐름 버전으로 버린다. 서버 응답: `{trace, warnings}`(§11 N-16) | `execute` |
| (조사식) | 변수 표 핀 칸 누르기 | 디버그 모드 | 이름을 `var-watches` 에 더하거나 뺀다(대소문자 무시). 값은 커서 자리 값, 아직 없으면 「아직 없음」. 세트별 브라우저 저장소 `rsf:watch:<setId>` | (없음) |
| (식 즉석 평가) | 식 칸 Enter | 실행 기록이 있고 `validate` 권한 | 1) `validate{exprText}` 로 **서버가 파싱만** 한다(`ast`·`refVars`·`supported`·`problems`, 3단계 P-D1) 2) 화면이 브라우저 `evalex` `evaluate` 로 커서 자리 변수(세트가 선언한 타입으로 바꿔 넣는다)에 대해 평가한다 3) 결과 `expr-result`(`data-kind`): 참·거짓·NULL·값·「오류 — …」. `supported=false` 이거나 평가기가 폴백 신호를 내는 식(평가 시각에 기대는 함수, LIST 값 변수를 읽는 식, 3단계 P-D15)이면 「화면에서 계산할 수 없는 식이다」만 보이고 서버 평가를 부르지 않는다 4) 「참고용이다. 실행 판정은 서버가 한다」를 작게 보인다. 최근 식 5개 `rsf:expr:<setId>` | `validate` |
| (케이스 저장) | [지금 입력 저장] → 팝업 [저장] / [고치기] → [저장] | 편집할 수 있는 세트, 입력 오류 없음 | `save{part:"CASE", setId, caseId?, rowVersion?, caseName, inputJson, evalTs?, expectedJson?, description?}`. 새 케이스는 서버가 같은 세트 안 최대 번호 + 1 로 발급. 성공하면 `view` 를 다시 불러 **`cases` 만** 받는다 — 세트 흐름·모드·dirty·이력·커서는 건드리지 않는다(3단계 P-D11). 옛 결과(통과·실패)는 그 케이스에서 지운다. 저장이 MDM001(다른 창에서 바뀜/동시 저장)이면 목록을 다시 읽고 충돌 문구. 폐기된 세트는 MDM009 | `save` |
| (케이스 삭제) | [삭제] → [지우기] | 케이스를 고름 | 두 단계(Local-Rules §9). `save{part:"CASE", setId, caseId, rowVersion, caseDeleted:true}` 뒤 케이스 목록만 다시 읽는다 | `save` |
| (케이스 모두 실행) | [모두 실행] | `execute` 권한, 케이스 1건 이상 | `execute{setId, flowJson(현재 흐름 — 저장 전 포함), runCases:true, caseIds(콤마로 이은 문자열)}` → `{cases:[{caseId, caseName, outcome, pass, mismatches, finalValues, errors}]}`(`trace` 는 null). 목록 「마지막 결과」 칸이 통과·실패·실행만(`pass=null`)으로 바뀌고 요약 `case-summary` 「8/10 통과」(분모는 기대값이 있는 케이스만, `pass=null` 은 「· 실행만 N건」 로 따로). 실패한 케이스를 고르면 `case-diff` — 기대·실제 표(실제가 null 이면 결과에 그 키가 있을 때 「NULL」, 키가 없으면 「결과에 없음」으로 가른다), 오류로 끝난 케이스는 오류 문장 목록(`case-diff-error-{i}`, 단계·코드는 title). 늦게 온 응답은 순번으로 버린다 | `execute` |
| (케이스 불러오기) | [불러오기] / [디버그로 열기] | 케이스를 고름 | 입력을 폼에 채운다(값이 모두 글자·null 인 객체면 폼만, 숫자·불린 값이 있으면 뜻을 잃지 않게 보낼 원문을 JSON 칸에 둔다). [디버그로 열기]는 이어서 [처음부터] 를 누른 것과 같다 — 바뀐 입력이므로 새로 실행한다 | `execute` |

디버그 툴바 상태 문구(`dbg-status`, 커서 k 는 「노드 k 실행 전」 — N-19): 기록이 없으면 `아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다`, 기록 노드가 0개면 `실행 전 오류 — {첫 위반 문구}`, k < n 이면 `{k+1}/{n} · {nodeId} 실행 전`, k = n 이고 마지막 노드가 오류면 `오류로 멈춤 — {nodeId}: {첫 위반 문구}`, 그 밖 k = n 이면 `완료 · {n}단계 · 결과 변수 {m}개`, 실행 중에는 ` · 실행 중`이 붙는다. 흐름 구조가 실행 뒤 바뀌면 문구 옆 배지 `dbg-stale` 「지난 흐름 기준」(툴팁: 흐름 구조가 이 실행 뒤 바뀌었다. 다음 동작에서 새로 실행한다). 값 표 `sim-values`(행 = 변수, 열 = 단계, 바뀐 칸 배경 강조·지금 단계 열 테두리, 값 없음은 `—`), 경고 `sim-warnings`(코드 배지 + 문구), 노드 상세 `sim-detail`. 실행 비교 `run-compare`: 바로 전 실행과 지금 실행의 최종 변수 이전·지금·같음/다름 표(`run-compare-values`)와 한쪽 실행에만 지난 노드(`run-compare-path` — 「이전에만」 `run-compare-only-before`·「지금만」 `run-compare-only-after`). 이전 실행이 없으면 안내 문구. 변수 패널: 커서 k 자리의 변수 전체(이름 순)를 보이고 직전 노드가 바꾼 값은 노란 배경, 새로 생긴 값은 「새」 배지. 병렬 갈래 안에서는 그 갈래 범위의 값을 보인다. 노드 상세는 **커서 앞에서 실행된** 노드만 보이고 아니면 「아직 실행하지 않은 노드다」. 기록이 없으면 「실행하면 커서 시점 값이 보인다」.

### 5.3 캔버스 동작

| 동작 | 설명 |
|---|---|
| 노드 누르기 | 선택하고 오른쪽 패널을 그 노드의 속성으로 바꾼다. 빈 곳을 누르면 선택이 풀린다. 보기 모드에서도 선택·속성 보기는 된다(읽기 전용) |
| 다중 선택 | 편집 모드에서 Shift(또는 Ctrl·Meta)+누르기로 노드를 더하고 Shift+끌기 상자로 고른다. 메모·그룹은 다중 선택 목록에 넣지 않는다. [그룹]은 이 목록(없으면 고른 노드 하나)으로 그룹을 만든다 |
| 노드 끌기 | 편집 모드에서 위치를 바꾼다(`view.positions` 저장). 선 위에 놓았으면 「놓인 노드 옮기기」(아래), 아니면 위치만 바뀌므로 구조가 아니라 디버거 표시는 유지된다. 분기를 끌면 짝 합류와 안쪽 노드까지 블록 전체가 같은 만큼 움직인다 |
| 선 잇기·지우기 | 편집 모드에서 노드 아래 점에서 다른 노드로 끌어 잇는다(`connect`). 선을 고른 뒤 Delete·Backspace 로 지운다(`removeEdge` — 키는 단축키 디스패처가 받는다, §5.4). 같은 두 노드를 잇는 선이 이미 있으면 거부한다 |
| 팔레트로 끼우기 | 팔레트 **누르기**의 끼울 선은 **고른 선**이다. 고른 선이 없으면 END 로 들어가는 선이다(2단계 P-D10). [룰]은 룰 찾기 팝업에서 고른 룰을, [IF]·[병렬]은 분기+짝 합류(갈래 2개)를 그 선에 끼우고 새 노드를 고른다. 노드가 200개를 넘게 하는 끼우기는 막는다(문구 "노드는 흐름 하나에 200개까지 둔다") |
| 팔레트·룰 목록 끌어 놓기(A1·A4) | 항목을 끄는 동안 커서에서 화면 80px 안(`80/zoom` 흐름 좌표)의 가장 가까운 선을 굵은 파란 선으로 강조하고 가운데에 「여기에 넣기」(`flow-edge-drop-{edgeId}`)를 띄운다. 선 위에 놓으면 그 선에 끼운다(같은 연산). **빈 곳에 놓으면 넣지 않고 「선 위에 놓아야 한다」 알림**을 띄운다(2단계의 "없으면 고른 선·END 앞 선"은 없어졌다). 메모·그룹은 선이 필요 없어 놓은 자리에 만들거나 묶는다(끄는 동안은 메모·그룹도 선 강조가 뜬다 — 놓은 결과는 정상) |
| 놓인 노드·블록 옮기기(A2) | 룰 노드나 분기(IF·병렬)를 끌어 다른 선 가까이 가면 같은 강조를 띄운다. 놓으면 흐름에서 떼어 그 선에 끼우고(`moveNode`) 떠난 자리는 앞뒤를 다시 잇는다. 자기 자신에 붙은 선·자기 블록 안쪽 선은 대상에서 뺀다. 선에서 먼 곳에 놓으면 위치만 바뀐다. 거부되면(룰 노드의 선이 하나씩이 아님·자기 자리·블록이 닫히지 않음) 알림을 띄우고 끌던 위치를 되돌린다. 위치 적기와 옮기기는 되돌리기 **한 번**이다. **접힌 분기는 선 위로 옮길 수 없다**(위치 이동만) |
| 선 위 [+]·복사 붙여넣기(A3·B9) | [+] 메뉴(§5.5)에서 룰·IF·병렬·붙여넣기. 복사 단위는 룰 노드 하나 또는 분기 블록 하나(안쪽 전체)이며 여러 노드 선택 복사는 없다. 클립보드는 화면 메모리라 세트를 바꿔도 남고 새로 고침하면 사라진다(시스템 클립보드는 쓰지 않는다). 붙여넣기는 고른 선(또는 [+]·선 우클릭의 선)에 끼우고 노드·선 ID 를 새로 발급하며 조건식·갈래 이름·분기 이름은 복사한다. 붙여 넣은 노드는 저장된 위치가 없어 자동 배치 좌표로 그려지므로 겹칠 수 있다([자동 정렬]로 푼다, 3단계 P-D18). 다른 세트에 붙일 때 룰 정보가 없으면 복사한 조각의 룰 입출력을 함께 들여온다. 복제(Ctrl+D)는 복사한 뒤 원본 바로 뒤 선에 붙인다. 결과가 노드 200개를 넘으면 거부 |
| 분기 편집(C11~C13) | **IF↔병렬 바꾸기** — IF→병렬은 갈래 조건식·「그 외」 표시를 지우고 순서를 1..n 으로 다시 매긴다, 병렬→IF 는 마지막 갈래를 「그 외」로 두고 나머지 조건식을 비운다(빈 조건식은 검사 오류로 드러나 사용자가 채운다). 노드 ID 는 유지하고 기본 라벨(「조건」·「병렬」)이면 새 기본 라벨로 바꾼다. **분기 풀기** — 고른 갈래의 안쪽 노드만 남겨 분기 앞 선과 합류 뒤 선 사이에 잇고 분기·합류·다른 갈래는 지운다(빈 갈래를 고르면 앞뒤를 바로 잇는다). **갈래 순서 끌기** — 속성 패널 갈래의 손잡이(`flow-prop-branch-{edgeId}-handle`)를 끌어 놓은 자리에 맞게 순서를 바꾼다(`reorderBranches`, IF 의 「그 외」는 손잡이가 없고 늘 마지막). ▲▼ 단추도 그대로 있다 |
| 블록 접기(D16) | 우클릭 「접기/펼치기」(§5.5). 접힌 블록은 분기 앞 선과 합류 뒤 선을 이어 받는 노드 하나로 그린다. 접힘은 화면 상태라 저장하지 않고 세트를 바꾸면 비운다. 분기가 사라지거나 블록이 닫히지 않게 되면 접힘은 풀린다. 찾기·검사 항목 이동이 접힌 블록 안 노드를 가리키면 그 블록을 펼친다. **접힌 블록의 구성이 편집으로 바뀌면(접힌 채 갈래 더하기 등) 편집 직후에 그 분기를 펼친다** — 스펙의 「편집 전에 먼저 펼친다」와 다르다(N-25). 위치만 바뀌는 흐름 변경은 접힘을 건드리지 않는다. 디버거 겹침은 접힌 블록에 「안쪽 실행 k개」 배지를 달고 안쪽 오류가 있으면 빨간 테두리를 그린다. 커서가 접힌 블록 안 노드에 있으면 접힌 블록으로 옮기고 깜빡인다(펼치지 않는다). **분기를 접으면 숨는 노드와 선을 가리키던 선택은 푼다**(Task 11 고침) — 보이지 않는 대상에 속성 패널·Delete·복사가 적용되지 않게 한다 |
| 선 경로 편집(C14, Task 15 구현) | 편집 모드에서 선을 고르면 꺾는 점마다 손잡이가 보인다. 손잡이를 끌어 옮기고, 선을 두 번 누르면 누른 자리(가장 가까운 구간)에 꺾는 점을 더한다. 손잡이를 두 번 누르거나 손잡이를 고른 채 Delete 를 누르면 그 점을 뺀다. 꺾는 점이 있는 선은 시작 손잡이 → 꺾는 점들 → 끝 손잡이를 모서리를 둥글게 한 직선으로 그리고, 없으면 지금처럼 자동 경로로 그린다. 조건 라벨과 [+] 는 경로 길이의 가운데에 두고(라벨이 있으면 [+] 는 그 옆), 변수 칩은 경로가 있는 선이면 그 가운데에서 20px 아래에, 경로가 없는 선이면 2단계처럼 출발점 아래 20px 에 둔다. 선 우클릭 메뉴 [경로 초기화](`route-reset`)는 그 선의 꺾는 점을 모두 지우고 [자동 정렬]은 모든 선의 경로를 함께 지운다(되돌리기로 살린다). 편집 연산이 선을 없애면(노드 삭제·옮기기·분기 풀기 등) 그 선의 경로도 버린다. 노드를 옮겨도 꺾는 점은 흐름 좌표에 그대로 있고 양 끝만 노드를 따라간다. 꺾는 점은 선 하나에 20개까지. 보기·디버그 모드에서는 저장된 경로로 그리기만 한다. 저장은 `view.routes`(§3.2) |
| 조건식 즉석 편집(B10) | IF 의 「그 외」가 아닌 갈래 선의 라벨을 두 번 누르거나 우클릭 「조건 편집」을 고르면 그 자리에 조건식 입력 칸이 열린다. Enter 확정, Esc·칸 밖 누르기·초점 잃음은 취소. 병렬 갈래·「그 외」·접힌 분기에서 나가는 선은 열리지 않는다 |
| 검사 이동 | 검사 항목 `set-check-{i}` 를 누르면 그 노드를 고르고 화면을 그 노드로 옮긴다(접힌 블록 안이면 펼친다). 같은 항목을 다시 눌러도 다시 옮기고 깜빡인다 |
| 즉시 재계산 | 흐름이 바뀔 때마다 `set-model.ts` 의 `flowIo`·`flowChecks`(서버 `RuleSetAnalyzer` 와 코퍼스로 동치)로 입출력 표·검사·경고 점을 다시 그린다. 조건식 IO 는 `validate` 응답으로 갱신한다 |
| 화면 맞춤·자동 정렬 | [화면 맞춤]은 전체가 보이게 하고 [자동 정렬]은 위치를 다시 잡는다 |
| 디버거 겹침 | 디버그 모드에서 **낡지 않은 기록**이 있으면 `debugOverlay(trace, flow, cursor)` 로 노드 `data-state`(`run`·`error`·`current`·`next`·`pending`·`dim`)·순번·칩, 선 상태(`run`·`chosen`·`dim`·`idle`)를 그린다. 커서 k = 「노드 k 실행 전」: 앞 노드(0..k-1) 초록·순번·결과 칩(오류면 `error`), 노드 k 는 굵은 강조 테두리(`current`, 순번·칩 없음), 노드 k+1 은 점선(`next`), 나머지는 회색(`pending`). 끝(k = n)에 닿으면 2단계 최종 겹침(안 탄 갈래 `dim`)이다. 기록이 낡았으면(흐름 구조가 실행 뒤 바뀜) **캔버스에는 겹침을 그리지 않고** 패널(변수·값 표·실행 비교·노드 상세)만 옛 기록 기준으로 남기며 「지난 흐름 기준」 배지를 보인다(3단계 P-D9). 커서가 옮겨지면 그 노드로 캔버스를 옮기되 노드가 이미 화면 안에 다 보이면 옮기지 않고 깜빡이기만 한다(화면이 흔들리지 않게). 보기·편집 모드에는 실행 겹침이 없다 |

### 5.4 단축키

스펙 §2: 단축키는 보조 수단이다 — 모든 동작은 툴바·메뉴 버튼으로 할 수 있어야 한다. 키 처리는 **디스패처 한 곳**(`canvas/shortcuts.ts`)이다. page 가 캔버스 감싸개(`rsf-canvas-host`)의 `onKeyDown` 에서 모드별 손잡이 표를 만들어 한 번 부른다.

| 동작 | Win/Linux | Mac | 모드 | 설명 |
|---|---|---|---|---|
| 되돌리기 | Ctrl+Z | Cmd+Z | 편집 | 흐름 사본 이력 100개까지. 저장해도 비우지 않는다 |
| 다시 하기 | Ctrl+Shift+Z · Ctrl+Y | Cmd+Shift+Z · Cmd+Y | 편집 | |
| 선택 삭제 | Delete · Backspace | ⌫ · Delete | 편집 | 고른 꺾는 점(C14)이 있으면 그 점만 먼저 빼고 이웃 점을 고른 채로 둔다(연속 Delete 가 선 전체 삭제로 새지 않는다. 점이 더 없으면 선택 없음). 고른 점이 없으면 고른 노드·메모·그룹·선을 지운다. 시작·끝·합류는 지울 수 없다. Shift+Delete·Shift+Backspace 는 무시한다 |
| 복사 / 붙여넣기 / 복제 | Ctrl+C / Ctrl+V / Ctrl+D | Cmd+C / Cmd+V / Cmd+D | 편집 | 복사·복제는 흐름 노드를 골라야 하고, 붙여넣기는 선을 골라야 한다(없으면 알림) |
| 노드 찾기 | Ctrl+F | Cmd+F | 모든 모드 | 툴바 찾기 칸으로 초점을 옮긴다 |
| 선택 해제·메뉴 닫기 | Esc | Esc | 모든 모드 | 메뉴나 단축키 도움말이 열려 있으면 그것만 닫는다. 아니면 즉석 조건식 편집을 취소하고 선택을 푼다 |
| 계속 | F5 | fn+F5 | 디버그 | `execute` 권한이 있을 때만 |
| 한 단계 / 이전 | F10 / Shift+F10 | fn+F10 / fn+Shift+F10 | 디버그 | 한 단계는 `execute` 권한이 있을 때만, 이전은 권한과 무관 |
| 중단점 켜고 끄기 | F9 | fn+F9 | 디버그 | 흐름 노드를 골랐을 때만 |

- **캔버스 초점 규칙**: 키 이벤트는 초점을 가진 캔버스(`rsf-canvas`, `tabIndex=0` — 캔버스를 누르면 초점이 간다)에서 올라온 것만 받는다. 캔버스 밖(툴바·패널)에서는 받지 않는다.
- **입력 칸 무시**: 초점이 `input`·`textarea`·`select`·`contenteditable` 에 있으면 판정하지 않는다(입력 칸에서 Delete·Ctrl+Z 가 캔버스를 건드리지 않는다). Alt 가 눌렸으면 무시한다. Mac 에서 Ctrl+Z, Win 에서 Meta+Z 는 무시한다. F 키·Delete·Esc 는 Ctrl/Cmd 가 눌리면 무시한다.
- **손잡이가 있을 때만 가로챈다**: 그 모드에 손잡이가 있는 키만 `preventDefault`·`stopPropagation` 한다. 손잡이가 없으면 브라우저·포털 동작이 그대로다 — 예: 보기 모드의 Ctrl+D 는 북마크, 캔버스 초점 밖의 F5 는 새로 고침, `execute` 권한이 없는 디버그 모드의 F5·F10 도 브라우저 동작 그대로다. 캔버스 초점 밖에서 Cmd+F 는 브라우저 찾기가 뜬다.
- **Mac fn**: Mac 에서 F5·F9·F10 은 fn 을 함께 눌러야 한다(도움말에 안내).
- **포털 전역 키와 겹치지 않는다**: 포털은 F8(저장 등 primary)·F3(메뉴 검색, 수정키 없음)·모달의 Esc 만 쓴다(`PageLayout`·`portal-shell`·`modal`).
- 저장하지 않은 편집이 있는 동안(dirty)에는 `beforeunload` 로 떠나기 전에 확인한다.
- 메뉴 단추(`flow-menu`)에 초점이 있으면 메뉴 루트가 Esc(닫기)를 스스로 처리하고 모든 키를 캔버스 디스패처로 올리지 않는다.
- 입력 칸 되돌리기 합치기: 같은 칸을 1초 안에 연달아 고치면 한 번으로 합친다(선 조건식 `cond:{edgeId}`, 선 이름 `elabel:{edgeId}`, 노드 이름 `nlabel:{nodeId}`, 메모 글 `note:{id}`, 그룹 제목 `group:{id}`). 끌기는 놓을 때 한 번 기록한다. 되돌린 뒤 첫 입력은 새 기록이다. dirty 는 저장된 정규 JSON 과 비교하므로 되돌려서 저장본과 같아지면 dirty 가 풀린다.

### 5.5 우클릭 메뉴

우클릭(노드·선·빈 곳)과 선 위 [+] 가 메뉴를 연다(`flow-menu`, 항목 `flow-menu-item-{id}`). 항목은 제공자(편집·접기·디버그·보기 순)가 모드로 걸러 만들고 항목이 0개면 메뉴를 열지 않는다. 꺼진 항목은 `disabled` + title 로 이유를 보인다. 항목을 누르면 실행한 뒤 닫는다. Esc·바깥 누르기·스크롤로 닫고, 화면 밖으로 넘치면 안쪽으로 당긴다.

| 대상 | 항목(id) | 모드 |
|---|---|---|
| 룰 노드 | 룰 바꾸기(`rule-replace`) · 복사(`copy`) · 복제(`duplicate`) · 삭제(`delete`) | 편집 |
| 룰 노드 | 중단점 켜기/끄기(`bp-toggle`) · 여기까지 실행(`run-to`, `execute` 권한이 없으면 꺼짐) | 디버그 |
| 룰 노드 | 룰 편집 열기(`open-rule`) | 모든 모드 |
| 분기(IF·병렬) | IF↔병렬 바꾸기(`split-kind`, 「병렬로 바꾸기」/「IF로 바꾸기」) · 분기 풀기(`dissolve` — 남길 갈래를 `dissolve-{edgeId}` 하위 항목으로 들여 써서 보인다. 라벨 = 갈래 이름, 빈 갈래면 「(빈 갈래)」) · 갈래 더하기(`add-branch`) · 블록 복사(`copy`) · 블록 삭제(`delete`) | 편집 |
| 분기(IF·병렬) | 접기/펼치기(`collapse`, 블록이 닫힌 분기만) | 모든 모드 |
| 분기·합류 | 중단점 켜기/끄기(`bp-toggle`) · 여기까지 실행(`run-to`) | 디버그 |
| 선 | 룰 넣기(`insert-rule`) · IF 넣기(`insert-if`) · 병렬 넣기(`insert-par`) · 붙여넣기(`paste`, 클립보드가 있을 때만 항목이 생긴다) · 조건 편집(`edit-cond`, IF 의 「그 외」가 아닌 갈래만) · 선 삭제(`edge-delete`). [+] 로 열면 앞 넷만 | 편집 |
| 선 | 경로 초기화(`route-reset`, `flow-menu-item-route-reset`) — 그 선에 꺾는 점이 있을 때만 항목이 생긴다. [+] 로 열면 나오지 않는다 | 편집 |
| 빈 곳 | 메모 더하기(`note-add`) · 붙여넣기(`paste` — 클립보드가 있고 **고른 선이 있을 때**, 대상은 고른 선) · 자동 정렬(`auto-layout`) | 편집 |
| 빈 곳 | 화면 맞춤(`fit`) | 모든 모드 |

보기 모드에는 편집 항목이 없고 `open-rule`·`collapse`·`fit` 만 남는다. 디버그 모드는 보기 모드 항목 + `bp-toggle`·`run-to` 다.

### 5.6 브라우저 저장소 (개인 편의)

중단점·조사식·최근 입력·최근 식·미니맵은 서버에 저장하지 않고 브라우저 `localStorage` 에만 기억한다. 읽기·쓰기는 모두 try/catch 로 감싸고 저장소가 없어도(시크릿 창·차단) 화면은 그대로 동작한다.

| 키 | 내용 |
|---|---|
| `rsf:bp:<setId>` | 중단점 노드 ID 목록 |
| `rsf:watch:<setId>` | 조사식 이름 목록 |
| `rsf:recent:<setId>` | 최근 입력 10개(레코드 JSON + 판정 시각) |
| `rsf:expr:<setId>` | 최근 식 5개 |
| `rsf:minimap` | 미니맵 표시 여부 |


## 6. 입력값 검증 규칙

### 6.1 필드별 검증 (요청 검사, 쓰기 전에 거부 — I13)

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | D-001 | 필수, 100자 이하 | 세트명은 필수입니다. / 세트명은 100자 이하여야 합니다. |
| V-002 | D-003 | 흐름에 나온 룰 ID 마다 `RuleIdRules.validateRuleId` | 룰 ID 는 컬럼 물리명 규칙 … |
| V-003 | D-003 | 흐름 JSON 형식·크기: 노드 200·선 400·JSON 262,144자, `version` 정수 1, 문자열 칸이 문자열, `order` 정수, `otherwise` 불린, `view` 객체, 필수 칸 | MDM021 `흐름 형식이 올바르지 않습니다: {원인}` |
| V-004 | `rowVersion` | 필수 | (REQUIRED_VALUE) |
| V-005 | 케이스 이름(D-011) | 필수, 100자 이하 | 케이스 이름은 필수입니다. / 테스트 케이스 상한 — 케이스 이름이 N자다. 100자까지 받는다 |
| V-006 | 케이스 입력 JSON(D-013) | 필수, JSON 객체 | 입력 JSON(inputJson)은 필수입니다. / 입력 … 객체여야 한다 |
| V-007 | 케이스 기대 JSON(D-015) | 비었으면 실행만, 있으면 JSON 객체 | 기대 … 객체여야 한다 |
| V-008 | 케이스·실행 판정 시각(D-007·D-014) | `yyyy-MM-dd HH:mm:ss` (KST), 저장은 받은 글자를 그대로 둔다(3단계 P-D6) | 판정 시각은 yyyy-MM-dd HH:mm:ss 형식으로 쓴다 |
| V-009 | 세트당 케이스 수 | 새 케이스 저장은 50건까지(3단계 P-D5) | 입력값이 올바르지 않습니다: 테스트 케이스 상한 — 세트의 케이스가 이미 N건이다. 세트마다 50건까지 둔다 (MDM021) |
| V-010 | 일괄 실행 | 한 번에 50건까지. 넘으면 아무것도 돌리지 않고 거부 | 테스트 케이스 상한 — 한 번에 N건을 돌리려 한다. 50건까지 돌린다 (MDM021) |
| V-011 | 케이스 쓰기 | 폐기된 세트에는 쓸 수 없다(조회는 된다). 담당자만(MDM013). 낙관적 잠금 `ROW_VERSION` 불일치·동시 발급 충돌은 MDM001 | 폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다 (MDM009) |

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
| XV-022 | (MDM026) | — | 저장된 룰 정의·FLOW_JSON 을 읽을 수 없다(손상, 500). 경로가 둘이다 — ① `view`·`restore` 는 저장된 FLOW_JSON 의 parse 실패를 `storedFlow()` 가 바로 MDM026 으로 바꾼다. ② 기록 실행은 `StoredDefinitionLookup` 이 저장된 룰 정의를 읽다 낸 IAE·ISE 를 `StoredDefinitionException` 으로 감싸고, 서비스 메서드 `simulate`(화면 action `execute`)와 OASIS 입구 `RuleSetRunner.execute` 가 이 예외만 MDM026 으로 바꾼다. 그 밖의 IAE·ISE 는 감싸지 않는다(엔진 버그를 입력 오류로 가리지 않는다). 문구에 룰 ID 는 붙이지 않는다(원인 그대로, 서버 로그로 추적) | 룰 세트 {setId} 의 저장된 흐름을 읽을 수 없습니다 — {원인} / 룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — {원인} |

서버는 화면 검사 결과를 받지 않고 요청 흐름으로 다시 계산한다(I12). 흐름 세트는 같은 검사를 흐름 경로 기준으로 한다: `ORDER`·`CYCLE`·`DUP_RESULT` 는 같은 경로 위의 룰끼리만 보고, IF 의 서로 다른 갈래가 같은 결과를 쓰는 것은 정상이다. 검사 항목에는 흐름 위치 `nodeId`·`edgeId` 가 붙는다(목록 세트는 null). 2단계 화면은 흐름이 바뀔 때마다 `flowChecks` 로 검사를 다시 계산해 캔버스 경고 점·검사 패널·속성 패널에 보이고, 조건식이 읽는 변수의 출처·타입은 `view`·`validate` 의 `condIo` 로 받는다.

룰 확정 검사(`RuleSetOrderCheck`)의 `SET_IF_SIBLING`·`SET_PAR_SIBLING` 은 2단계에서 세트 저장 검사와 같은 경로 상태(`RuleSetPathState`)로 판정한다. 판정이 바뀐 사례는 §11 N-17 에 있다.

### 6.3 테스트 케이스 판정 규칙 (서버 `RuleSetCaseJudge`, 룰 케이스 `RuleCaseJudge` 와 같은 비교)

케이스는 세트 하나에 딸린 입력·기대값 묶음이다(`TB_MDM_RULE_SET_TEST_CASE`, V15 — `MARU_RULE_SET_ID`(FK) + `CASE_ID` 복합 PK, 세트 테이블을 가리키는 **첫 FK** 라 앞으로 세트 테이블을 다시 만드는 마이그레이션은 자식 테이블을 먼저 다룬다, D-121). `CASE_ID` 는 같은 세트 안 최대 번호 + 1 로 발급하고 PK 충돌은 MDM001 로 거부한다. 세트를 폐기해도 케이스는 남고 `view` 는 상태와 무관하게 싣는다(폐기 세트는 읽기 전용, 3단계 P-D8).

| 규칙 | 내용 |
|---|---|
| 비교 대상(3단계 P-D4) | `EXPECTED_JSON` 에 **적힌 키만** `RunTrace.finalValues` 와 견준다. `finalValues` 는 **최상위에서 룰이 만든 결과 변수**만 담으므로 입력 변수 이름을 기대값에 적으면 「결과에 없음」 실패다. 키는 대소문자를 무시하고 찾는다 |
| 값 비교(3단계 P-D3) | `RuleCaseJudge.sameValue` — NUMBER 는 십진 값 비교(`1.10` = `1.1`), BOOLEAN 은 불린 또는 `"true"/"false"` 대소문자 무시, 목록은 원소별, 그 밖은 문자열. 스펙의 「TypedValue 계약 문자열 비교」가 아니다 |
| 통과·실패·실행만 | 실행이 오류로 끝나면 기대값이 없어도 `pass=false`(`outcome=ERROR`, 오류 코드·문구를 `errors` 로 준다). 오류가 없고 기대값이 비면 `pass=null`(**실행만**). 그 밖은 차이가 없으면 `true`, 있으면 `false` + `mismatches`(`{key, expected, actual}`) |
| 실행 입력 | 화면이 보낸 **현재 흐름**(저장 전 포함 `flowJson`)과 케이스 ID 목록(콤마 문자열). 케이스마다 `runner.trace` 를 돌린다. 깨진 입력 JSON 은 그 케이스만 오류다 |
| 상한(3단계 P-D5) | 세트당 저장 50건, 한 번 실행 50건 |
| 마지막 결과 | 화면 메모리에만 둔다(3단계 P-D19). 흐름 구조가 바뀌거나 세트를 바꾸면 모두 「안 돌림」으로 돌아간다 — 옛 흐름의 통과·실패를 지금 흐름의 결과로 보이지 않는다 |
| 왕복 | [지금 입력 저장]의 기대값은 실행 결과의 최종 변수로 채운다 — NUMBER 는 글자 그대로(`1.10` 을 `1.1` 로 바꾸지 않는다), BOOLEAN 은 불린, NULL 은 null, LIST 는 기록의 `items` 를 원소마다 푼 배열. 그래서 방금 실행한 결과로 채운 케이스는 같은 흐름에서 통과한다 |


## 7. 상태 정의 및 상태별 제어

| 상태 | 캔버스 편집(팔레트·끌기·[+]·메뉴·속성 입력)·세트명·설명·지침 적용 | 세트 저장 | 폐기 | 되살리기 | 디버그 모드 | 케이스 저장·삭제 |
|---|---|---|---|---|---|---|
| `INUSE` · 보기 모드(세트를 열면 기본) | 읽기 전용 — 팔레트·[자동 정렬] 없음, 룰 목록 줄 끌기 없음, 속성 패널 입력 잠김. 노드 선택·속성 보기·룰 링크·접기·[변수 흐름]·[화면 맞춤]·찾기는 동작 | 비활성(title "편집 모드에서 저장한다") | O | — | 들어갈 수 있다. 실행은 `execute` 권한이면 O | — |
| `INUSE` · 편집 모드([편집] — editable·`save` 권한일 때만) | 편집 가능 | dirty 이고 거부 검사가 없고 조건식 IO 를 기다리지 않을 때만 | O | — | 들어갈 수 있다(편집 내용은 그대로) | — |
| `INUSE` · 디버그 모드 | 캔버스 편집 꺼짐(끌기·연결·[+]·삭제·붙여넣기·편집 메뉴 없음), 왼쪽은 입력 패널, 오른쪽은 변수 패널 | 비활성(편집 모드만) | O | — | 실행 단추는 `execute` 권한 | 편집할 수 있는 세트(담당자·INUSE·`save` 권한)일 때만 |
| `DEPRECATED` | [편집]·팔레트 없음, 세트명·설명 잠김 | 비활성 | — | O | 들어갈 수 있고 케이스 목록도 보인다(읽기 전용) | 불가(MDM009) |
| 담당자가 아님 / `save` 권한 없음 | [편집] 비활성(title "담당자이고 사용 중인 세트이며 저장 권한이 있어야 편집한다") | 비활성 | 비활성 | 비활성 | 들어갈 수 있다. `execute` 권한 없으면 실행 단추 비활성 | 불가 |

**디버그 결과의 「지난 흐름 기준」(3단계 P-D9)**: 실행 뒤 흐름 **구조**(실행에 영향을 주는 칸 — 노드 id·kind·ruleId·splitId, 선 id·from·to·order·cond·otherwise)가 바뀌면 그 기록은 낡은 것이다. 낡은 기록은 캔버스 겹침을 그리지 않고 패널(변수·값 표·실행 비교·노드 상세)만 옛 기록으로 남기며 `dbg-stale` 배지를 보인다. 다음 [한 단계]·[계속]·[여기까지]·[처음부터]·[끝내기]는 새로 실행한다. 노드를 끌어 옮기거나 메모를 고치거나 `label` 만 바꾼 것은 구조 변경이 아니다. **지금 입력이 기록 입력과 다를 때도** 낡은 것과 같이 다음 동작에서 새로 실행한다(배지는 없다 — 흐름이 아니라 입력이 바뀐 것이다). 다른 세트를 열면 기록을 지운다.

분기가 있는 세트도 1단계와 달리 **읽기 전용이 아니다**. 캔버스에서 그대로 편집·저장한다(옛 안내 `set-branched-notice` 는 없어졌다). 다만 구성 지침의 "이 순서로 한 줄 흐름 만들기"는 분기 흐름이면 꺼진다(P-D5).
편집 → 보기/디버그 전환은 편집 내용을 버리지 않는다. **세트 저장·폐기·되살리기 뒤의 다시 불러오기는 모드와 되돌리기 이력을 그대로 둔다**(편집할 수 없게 되면 보기로 내린다). [다시 불러오기]·다른 세트 열기는 보기 모드로 돌아가고 이력을 비운다.

세트에는 버전·DRAFT·선점이 없다. 저장은 `ROW_VERSION` 조건부 UPDATE 한 번이고, 동시 편집은 MDM001 로만 막는다(I3·D16). 테스트 케이스는 케이스마다 `ROW_VERSION` 을 따로 가진다.


## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 세트 고르기·보기·룰 검색·지침 찾기·케이스 목록 보기 | O | O | O | `search`·`view`(READ) |
| 편집 모드·저장·폐기·되살리기·지침 적용 | O | O | X | `save`·`delete`·`restore`(EDIT) + 서버 `RuleStewardCheck.requireSteward()`, view 의 `editable`·`restorable` 은 `isSteward()`. 권한이 없으면 버튼을 비활성으로 둔다 |
| 조건식 IO(`validate`) | O | O | X | EDIT. 편집 중에만 화면이 부른다. 서버는 읽기만 하므로 `requireSteward` 를 부르지 않고 권한 action 이 막는다 |
| **디버그 모드 진입**(중단점·조사식·입력 폼·최근 입력·변수 패널 보기) | O | O | O | 화면 모드일 뿐 서버를 부르지 않는다. 표준 관리자도 들어가 볼 수 있다 |
| **디버거 실행·케이스 실행**(`execute`) | O | O | **X** | EDIT (2단계 P-D2·P-D3, 3단계 P-D1). `execute` 가 EDIT 권한이라 DME 에서 READ 인 표준 관리자는 실행할 수 없다(BFF RBAC 403, 화면은 실행 단추 비활성 + title). 기록 실행·케이스 일괄 실행은 저장하지 않고 읽기만 하지만 어휘 16개를 늘리지 않으려 이렇게 정했다 — 사용자 확인 사항이다 |
| **테스트 케이스 저장·삭제**(`save` `part=CASE`) | O | O | X | 세트 저장과 같은 EDIT + 서버 `requireSteward()`(MDM013). 편집할 수 있는 세트(INUSE)일 때만 |
| **식 즉석 평가**(`validate` `exprText`) | O | O | X | EDIT. 표준 관리자는 식 평가 칸이 꺼진다(title 로 이유). 평가 자체는 브라우저에서 하지만 파싱을 서버가 한다(3단계 P-D1) |
| 중단점·조사식·최근 입력·미니맵 | O | O | O | 서버를 부르지 않는 개인 화면 상태 |

권한 검증: 백엔드 필터 체인에는 RBAC 가 없어 HTTP 테스트로 403 을 만들 수 없다(BFF 몫). 그래서 (1) 표준 관리자의 케이스 저장·삭제가 MDM013 이고 DB 가 그대로임을 HTTP 로, (2) `save`·`execute`·`validate` 가 EDIT 어휘에 있고 READ 어휘에 없음을 계약 테스트로 고정한다. 실제 403 은 e2e 가 본다(3단계 P-D2).


## 9. 연동 화면 / 팝업

| 대상 | 방식 | 넘기는 값 |
|---|---|---|
| 룰 세트(`ruleSetMng`) → 이 화면 | `openMdmPage("dme/ruleSetEdit", {setId})` / `useMdmPageParams` | 세트 ID |
| 룰 화면(`ruleEdit`) | `@/dme/rule-handoff` `openRuleEdit(ruleId)` | 룰 ID |
| 컬럼 사전(`columnMng`) | `openMdmPage("dma/columnMng")` | 없음(D13) |
| 룰 화면(`ruleEdit`) — 디버그 모드 | `openRuleEdit(ruleId)` (변수 패널 노드 상세 [룰 편집 열기]) | 룰 ID |

## 10. 기타 열거형 (LoV)

| 열거형(DB 컬럼) | 코드값 | 화면 표시명 |
|---|---|---|
| LV-001 `STATUS` | `INUSE`/`DEPRECATED` | 코드 그대로(배지) |
| LV-002 출처 | `DICT`/`PROG`/`NONE` | 컬럼 사전/프로그램 변수/어디에도 없음 |
| LV-003 심각도 | `REJECT`/`WARN` | 거부/경고 |
| LV-004 결과 구분 | (계산) | 최종(어느 룰도 다시 읽지 않음)/중간 |
| LV-005 노드 종류 | `START`/`END`/`RULE`/`IF`/`PARALLEL`/`MERGE` | 시작/끝/룰/조건(IF)/병렬/합류 |
| LV-006 디버거 노드 상태 | `run`/`error`/`current`/`next`/`pending`/`dim` | 실행됨/오류/지금(굵은 테두리)/다음(점선)/아직(회색)/흐림(`data-state`) |
| LV-007 디버거 선 상태 | `run`/`chosen`/`dim`/`idle` | 지나감/IF 가 고름/고르지 않음/표시 없음 |
| LV-008 케이스 마지막 결과 | 통과/실패/실행만/안 돌림 | `pass`=true/false/null, 결과 없음 |
| LV-009 식 평가 결과 종류 | `true`/`false`/`null`/`value`/`error`/`fallback` | 참/거짓/NULL/값/오류/화면에서 계산할 수 없는 식(`expr-result` 의 `data-kind`) |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | **세트 값 테스트 — 2단계 디버거로 채웠다(D-112).** 06:756 이 두라고 한 세트 값 테스트 카드는 1단계까지 운영 DB 를 읽는 정의 조회기가 없어 제외했다. 룰 세트 흐름도 1단계에서 조회기(`StoredDefinitionLookup`)와 실행기(`RuleSetRunner`)가 생겼고, 2단계에서 시뮬레이션 탭(`execute` action, 서비스 메서드 `simulate`)이 카드를 대신했고, 3단계에서 그 탭이 디버그 모드로 옮겨갔다(D-118). 저장하지 않은 흐름을 레코드 하나로 서버에서 기록 실행한다(N-16) | design D2, spec 제약, D-108(이름 조항은 D-112 가 대체), mdm ADR-0005 D4 |
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
| N-14 | **흐름 저장(1단계)** — `TB_MDM_RULE_SET.FLOW_JSON`(흐름 정의 + 화면 전용 view — `positions`·`notes`·`groups` 와 3단계 `routes`, §3.2)을 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다(요청의 룰 목록을 믿지 않는다). `FLOW_JSON` 이 NULL 이면 `RULE_IDS` 순서의 한 줄 흐름이다. 분기 세트는 목록 편집으로 저장할 수 없다(`FLOW_READONLY`) | 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3, D-107 |
| N-15 | 흐름 세트의 입출력 표·의존 룰은 1단계에서는 흐름을 펼친 룰 목록으로 계산했다. 2단계 세트 패널은 흐름 기준 `flowIo(flow, rules)`(경로 상태를 아는 입출력)로 계산하고, 속성 패널은 앞 룰이 만드는 변수와 컬럼 사전·프로그램 변수·"어디에도 없음"을 가려 보인다 | D-107(편차 D10), 2단계 Task 10 |
| N-16 | **디버거(2단계)** — ① *저장 전 흐름 실행*: `execute{flowJson, recordJson, evalTs}` 는 화면의 저장하지 않은 흐름을 서버 `RuleSetRunner.trace` 로 돌려 엔진 계약 `RunTrace` 를 스키마 그대로 JSON 으로 돌려준다(골든 `rule-set-trace-golden.json` 7사례로 고정, `NodeTrace.result` 가 없으면 키를 뺀다). 응답 `warnings` 는 `RULE_DEPRECATED` → `BRANCH_COND_NULL` → 룰 경고 순이다(D-110 운영 응답과 같은 순서). 입력 오류: 흐름 없음은 REQUIRED_VALUE, `recordJson` 이 객체가 아니거나 판정 시각 형식(`yyyy-MM-dd HH:mm:ss` KST)이 틀리면 INVALID_VALUE, 저장값 손상은 MDM026. ② *값 표 병렬 의미*: 병렬 갈래는 분기 직전 값의 **사본**에서 돌고, 합류에서 **각 갈래가 실제로 쓴 이름만** 갈래 실행 순서대로 덮어쓴다(뒤 갈래가 이긴다, 엔진 `FlowRun` 과 같다 — Ruling 10). 첫 갈래 값이 두 번째 갈래 단계에 보이지 않는다. IF 는 사본을 만들지 않는다. 값이 없는 칸은 NULL 값과 구별해 `—` 로 보인다. ③ *표시 유지·지움*: 실행에 영향을 주는 칸(노드 id·kind·ruleId·splitId, 선 id·from·to·order·cond·otherwise)이 바뀔 때만 흐름 구조가 바뀐 것으로 본다. 2단계는 이때 실행 표시를 지웠지만 **3단계는 기록을 지우지 않고 「지난 흐름 기준」(낡은 기록)으로 둔다**(§7, N-19). 노드를 끌어 옮기거나 메모를 고치거나 **`label` 만 바꾼 것은 구조 변경이 아니다**(Ruling 12). 다른 세트를 열면 지운다. ④ *권한*: `execute` 는 EDIT 라 표준 관리자는 실행할 수 없다(P-D3). 3단계는 `execute` 에 `runCases`·`caseIds`·`setId` 칸을 더해 저장된 케이스를 일괄 실행한다(N-20) | 스펙 §8, P5·P9, D-116·D-117 |
| N-17 | **룰 확정 검사의 형제 판정 변화(Task 3, §9.1-6, D-115·D-117)** — `RuleSetOrderCheck` 의 `SET_IF_SIBLING`·`SET_PAR_SIBLING`(읽기)이 노드 쌍 단위로 "읽는 노드 직전 경로에서 이미 정의된(defined) 또는 일부 갈래에서만 정의된(maybe) 이름"을 뺀다. 세트 저장 검사(`RuleSetAnalyzer`)와 같은 판정을 내기 위해서다. 판정이 바뀐 사례는 아래 「11.1 N-17 판정 변화 표」에 있다. #3b·#3c 는 확정이 **통과에서 거부로** 바뀐다 | 스펙 §9.1-6, 계획 P4, D-115·D-117, `RuleLedgerChecksTest` |
| N-18 | 화면 구성 이탈 세 가지 — 오른쪽 패널은 `ContentBody resizable`(§2), 분기 노드에도 [지우기]가 있고(없으면 분기를 지울 길이가 없다), 그룹은 다중 선택(Shift·Ctrl·Meta 누르기, Shift+끌기 상자)으로 만들고 구성 노드를 속성 패널에서 빼고 더한다(스펙 §7 그룹 틀이 여러 노드를 묶는 기능, Ruling 11) | 계획 P10 편차, Task 10 |
| N-19 | **디버거 커서 의미(3단계, D-119)** — 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 **「노드 k 실행 전」**이다: nodes[0..k-1] 실행됨, nodes[k] 지금, nodes[k+1] 다음, k = n 이면 끝. 툴바 문구 「3/7 r2 실행 전」(§5.2)과 같은 뜻이고, 다음 주 E4(멈춘 자리에서 값 고쳐 이어 실행)의 멈춤 위치와 같게 둔 것이다. 변수 패널은 노드 k 가 **실행되기 전** 그 노드 범위의 변수(병렬 갈래 범위를 지킨다)를 보인다. 새 실행 직후의 [계속]·[여기까지]는 커서 0 을 포함해 찾고, 기록이 있으면 커서 뒤(k+1..)부터 찾는다(3단계 P-D14). 첫 [한 단계]는 실행 후 커서 0 에 두고 그 뒤부터 한 칸씩 옮긴다. 낡은 기록과 입력이 달라진 경우는 §7 | 3단계 P-D9·P-D13·P-D14, D-119 |
| N-20 | **케이스 판정·왕복(3단계, D-120)** — 판정 규칙은 §6.3. 저장 → 화면 목록 → 모두 실행 → 차이 표 → [디버그로 열기]가 한 바퀴다. 케이스 쓰기 뒤에는 `view` 를 다시 불러 `cases` 만 받으므로 세트 흐름·모드·dirty·이력·커서가 유지된다(3단계 P-D11). 세트 테이블 칼럼 추가는 칼럼 순서 불변식 때문에 피해 케이스 번호는 세트 안 최대 + 1 로 발급한다(카운터 없음). OASIS 파라미터는 Map·List DTO 칸을 묶지 못하므로 케이스 ID 는 콤마 문자열, 입력·기대값은 JSON 문자열이다 | 스펙 §4.6, 3단계 P-D3~P-D8·P-D11·P-D12·P-D19, D-120·D-121 |
| N-21 | **디버그 모드의 왼쪽은 입력 패널(3단계 P-D10)** — 스펙 A4 는 「보기·디버그 모드에서는 룰 목록만 보이고 끌기는 꺼진다」고 했지만 §4.1 배치 그림이 같은 자리에 입력 패널을 요구한다. 배치 그림을 따랐다 — 디버그 모드에는 룰 목록이 없고, 보기 모드는 목록만(팔레트·끌기 없음), 편집 모드는 팔레트 + 목록(끌기)이다 | 3단계 P-D10, D-118 |
| N-22 | **E4(멈춘 자리에서 값 고쳐 이어 실행)는 이번 범위 밖이다.** 엔진 재개 입구·공개 계약 변경이 필요해 다음 주에 한다(`docs/idea.md`). 3단계 커서 의미(N-19)와 「기록 실행 한 번 + 화면 커서」 구조는 E4 가 붙어도 멈춤 위치를 그대로 쓰도록 골랐다 | 스펙 B3, `docs/idea.md` |
| N-23 | **식 즉석 평가는 서버 파싱 + 화면 평가(3단계 P-D1, D-122)** — 스펙 §4.5 는 서버를 부르지 않는다고 했으나 화면에는 식 파서가 없다(불변 9 — `ruleEdit/expr/parse-expr.ts`). 파싱은 `validate` 의 `exprText`(`ruleEdit` 의 `parseExpr` 와 같은 코드)로 서버가 하고, 평가는 브라우저 `evalex` 가 한다. 그 결과 식 평가는 `validate` 권한(EDIT)이 필요하고 표준 관리자는 쓰지 못한다. 평가기에는 평가 시각 입력이 없어 시각에 기대는 함수·LIST 값 변수는 「화면에서 계산할 수 없는 식이다」로 보인다(3단계 P-D15). 변수 값은 세트가 선언한 타입으로 바꿔 넣는다(서버 `ValueConverter.toDeclared` 와 같은 규칙) | 3단계 P-D1·P-D15, D-122 |
| N-24 | **화면 구성 이탈(3단계)** — (1) `Controls` 는 잠금 단추를 뺀다: 잠금은 React Flow 의 끌기·연결을 켜고 끄는데 그 제어는 모드가 맡아 서로 덮어쓴다(3단계 P-D22). (2) 디버그 단추는 세트 툴바 아래 둘째 줄이다(3단계 P-D22). (3) [+] 단추는 `EdgeInsert.tsx` 를 따로 두지 않고 `FlowCanvas` 선 그리기 안에 있다(3단계 P-D21). (4) 끌기 대상 선은 부모가 아니라 캔버스 내부 상태다(3단계 P-D20). (5) 디버그 모드에 들어가면 [변수 흐름]이 켜지고 나오면 되돌아간다(3단계 P-D16) — 칩이 있어야 값 툴팁을 올릴 자리가 있다 | 3단계 P-D16·P-D20~P-D22, D-118·D-123 |
| N-25 | **스펙과 구현이 다른 곳(구현 기준으로 적었다)** — ① D16 「편집 연산이 접힌 블록 안 노드를 대상으로 하면 먼저 펼친다」는 구현이 **편집 직후 펼친다**(접힌 블록의 구성이 바뀌면 훅이 그 분기를 편다). ② 접힌 분기는 선 위로 옮기기(A2) 대상이 아니다(위치 이동만). ③ 찾기(D15)는 글자를 치는 동안이 아니라 **Enter(또는 [다음])에서만** 옮긴다. ④ 디버그 입력에서 JSON 붙여넣기 칸에 글이 있는 동안 폼 칸이 꺼진다(둘 중 하나만 보낸다). ⑤ B10 즉석 편집은 라벨을 두 번 눌러 **조건식**을 고치고(3단계 P-D17), Esc·밖 누르기 외에 초점을 잃어도 취소된다. ⑥ 룰 목록 줄 두 번 누르기는 고른 선이 없으면 END 앞 선이 아니라 알림이다(팔레트 누르기는 END 앞 선). ⑦ [이전]·F9 는 `execute` 권한과 무관하다(나머지 실행 단추·F5·F10 은 권한 필요). ⑧ 팔레트에서 메모·그룹을 끌 때도 「여기에 넣기」 강조가 뜬다. ⑨ 케이스 요약 분모는 기대값이 있는 케이스만이고, 새 케이스의 기대값은 낡지 않은 기록의 입력이 지금 입력과 같을 때만 미리 채운다. ⑩ 저장 뒤 편집 모드·이력이 유지된다(2단계 문서는 「보기 모드로 돌아간다」). ⑪ 낡은 기록은 캔버스 겹침 없이 패널만 남는다(3단계 P-D9). | 화면 코드 대조(`m-mdm/pages/dme/ruleSetEdit/`), 스펙 2026-09-30 |

### 11.1 N-17 판정 변화 표 (룰 확정 검사 `SET_IF_SIBLING`·`SET_PAR_SIBLING`, Task 3 보고서 정본)

| # | 흐름 모양 | 옛 판정 | 새 판정 | 이유 |
|---|---|---|---|---|
| 1 | 앞 경로에서 이미 정의된 이름을 형제 갈래가 다시 만들고 me 가 읽는다(`r0(R_P:S_X) → IF/PAR { R_A:S_X ; R_B 읽기 S_X }`) | `SET_IF_SIBLING`/`SET_PAR_SIBLING`(거부) | 내지 않음 | 읽는 지점 직전 경로 상태(defined)에 S_X 가 있다. 세트 저장 검사도 통과시킨다 |
| 2 | 형제 갈래가 만드는 이름이 읽는 지점에서 일부 갈래에서만 정의됨(maybe) | SIBLING(거부) | SIBLING 없음 | maybe 는 세트 저장 검사가 `FLOW_PARTIAL`(경고)로 다룬다. 확정 검사는 이름을 거른다 |
| 3a | 같은 룰(other)이 me 의 형제 갈래에도 있고 me 와 같은 경로 **뒤**에도 있으며 me 가 other 의 결과를 읽는다 | `rels` 가 EXCLUSIVE 만일 때만 `SET_IF_SIBLING` 이라 `SET_ORDER` 만(거부) | `SET_ORDER` + `SET_IF_SIBLING`(거부 그대로, 메시지 한 건 늘어남) | 거르기는 **읽는 노드** 기준이다. other 가 형제 쌍의 me 노드 바로 그 노드 앞 경로에 있을 때만 걸러지고, me 의 다른 노드 앞에만 있으면 걸러지지 않는다(#3c) |
| 3b | me 가 IF 한 갈래에서 S_Y 를 만들고 other 가 다른 갈래에서 S_Y 를 읽으며 합류 **뒤**에도 other 가 있다 | 아무것도 내지 않음(**통과**) | `SET_IF_SIBLING`(**거부**) | 세트 저장 검사가 그 형제 노드에서 `IF_SIBLING` 으로 거부하는 흐름이다. 이미 INUSE 인 세트에 이 모양이 있으면(세트 저장 뒤 룰 정의가 바뀐 경우) 그 룰의 확정이 새로 막힌다 |
| 3c | me 가 IF 한 갈래(rM1)에서 S_Y 를 읽고 other 가 다른 갈래(rO)에서 S_Y 를 만들며 합류 **뒤**에 me 가 또 있다(rM2) | 아무것도 내지 않음(**통과**; 관계 {EXCLUSIVE, AFTER} 라 IF 판정을 건너뜀) | `SET_IF_SIBLING`(**거부**, 문구 `R_M ← [S_Y]`) | rM1 직전 경로에 S_Y 가 없다(R_O 는 rM2 앞에만 있다). 세트 저장 검사도 rM1 에서 `IF_SIBLING` 으로 거부한다. #3b 와 대칭인 통과 → 거부 모양 |
| 3d | 한 룰 쌍 안에 IF 형제 노드 쌍과 병렬 형제 노드 쌍이 함께 있고 한쪽이 다른 쪽 결과를 읽는다(관계 집합에 EXCLUSIVE·PARALLEL 이 함께) | `SET_PAR_SIBLING` 만(IF 게이트가 EXCLUSIVE 만일 때라 건너뜀, 거부) | `SET_PAR_SIBLING` + `SET_IF_SIBLING`(거부 그대로, 메시지 한 건 늘어남) | 노드 쌍 단위 판정. 관계별로 걸러진 이름이 남는 쌍마다 해당 코드를 낸다. **이 모양은 테스트가 아직 없다** |
| 4 | 문구의 `me ← […]`·`other ← […]` 자리 | 룰 전체의 겹치는 이름 | 노드 쌍에서 걸러지고 남은 이름의 합 | 노드 쌍 단위 판정 |

바뀌지 않은 것: `SET_ORDER`·`SET_CYCLE`·`SET_DUP_RESULT`·병렬 같은 이름 대입(`dup`) 판정. 기존 확정 검사 테스트 가운데 판정이 바뀐 것은 없다(앞 경로 정의가 없는 기존 4건은 그대로 통과).

합격 기준(두 방향):
- (가) **거친 판정 제거**: 확정 검사가 me 를 읽는 쪽으로 변수 x 에 `SET_IF_SIBLING`·`SET_PAR_SIBLING`(읽기)을 내면, 세트 저장 검사도 me 의 같은 노드·같은 변수 x 에 거부(`IF_SIBLING`·`PAR_SIBLING`·`ORDER`·`CYCLE` 중 하나)를 낸다.
- (나) **놓침 없음**: 세트 저장 검사가 `ruleId = me` 의 `IF_SIBLING`·`PAR_SIBLING`(읽기 문구)을 내면 확정 검사도 me 에 `SET_IF_SIBLING`·`SET_PAR_SIBLING` 을 낸다.
- 대조 입력은 코퍼스 52건 + 퍼즈 200건이고, 구조 오류(코퍼스 11·퍼즈 20)와 DICT 이름 겹침(코퍼스 2)을 뺀 219건에서 (가) me 쪽 172·other 쪽 172, (나) 39건이 통과했다.
