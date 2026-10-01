# 룰 세트 흐름도 — 룰 노드 외관 옵션(색·크기·표시 항목·아이콘·모양) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트 편집 화면(`dme/ruleSetEdit`)의 룰·빈 단계(RULE·TASK) 노드마다 색·크기·표시 항목·아이콘·모양을 고르게 하고, `view.styles` 에 저장하며, 노드별 크기를 배치·스냅·그룹·선 계산 전부에 쓴다.

**Architecture:** 화면만 바꾼다(백엔드 `RuleSetFlowJson` 은 view 를 받은 그대로 저장한다 — 계약·엔진·서비스 변경 없음). Task 1 이 저장 형식(`node-style.ts`)·정규화(`stylesFor`, `routesFor`·`labelsFor` 와 같은 자리)·노드별 크기 함수(`nodeSizeOf`)·크기 바꿀 때 그린 위치 고정(`restyleNode`)·팔레트 토큰을 먼저 깔고, 그 위에서 노드 그리기(Task 2)와 오른쪽 패널 「외관」 섹션(Task 3)을 병렬로, 캔버스 크기 손잡이(Task 4)를 그 뒤에, 문서(Task 5)를 마지막에 한다. 4단계 그룹 크기(G2)의 `pad` 저장 방식·`GroupPadStore`·`groupSizeApi` 가 본보기다.

**Tech Stack:** TypeScript + React 19 + `@dk-oasis/shared`(Mantine 9 래퍼), `@xyflow/react` 12(`@xyflow/system@0.0.83`), `@dagrejs/dagre`, `@tabler/icons-react` 3.46, Vitest(happy-dom).

**Spec:** `docs/superpowers/specs/2026-10-01-rule-set-flow-node-style-design.md`(정본). 결정 S-D1~S-D12 는 스펙 §6. 이 계획의 Rulings(아래)는 스펙이 정하지 않은 세부만 정한다.

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow-4`, 브랜치 `feat/rule-set-node-style`(이 계획 커밋 포함). 태스크마다 하위 워크트리 `.claude/worktrees/rsns-tN`(브랜치 `rsns-tN`, 그때의 `feat/rule-set-node-style` 끝에서 분기)에서 구현하고, 리뷰 통과 뒤 feat 에 `--no-ff` 로 병합한다. 아래 명령은 해당 워크트리 루트 기준이다.

**병렬 표**

| 태스크 | 모델 | 먼저 병합돼야 할 태스크 | 고치는 파일(만들기 포함) | 겹침 |
|---|---|---|---|---|
| 1 모델·codec·노드별 크기 배관 | opus | — | `node-style.ts`(새), `flow-edit.ts`, `flow-layout.ts`, `flow-vars.ts`, `state/useEditActions.ts`, `canvas/align.ts`, `canvas/FlowCanvas.tsx`, `canvas/nodes.tsx`(타입·`handlesOf` 만), `canvas/node-icons.ts`(새), `styles/node-style.ts`(새, 토큰만), `rsf-styles.ts`, 시험 3개(새) | 단독 |
| 2 노드 그리기 | sonnet | 1 | `canvas/nodes.tsx`(그리기), `styles/node-style.ts`(노드 규칙 덧붙임), 시험 1개(새) | Task 3 과 겹치는 파일 없음 → 병렬 |
| 3 오른쪽 패널 「외관」 | sonnet | 1 | `panels/NodeStylePanel.tsx`(새), `panels/PropertyPanel.tsx`, `panels/SidePanel.tsx`, `page.tsx`, `styles/props.ts`, 시험 1개(새) | Task 2 와 겹치는 파일 없음 → 병렬 |
| 4 캔버스 크기 손잡이 | sonnet | 2, 3 | `canvas/node-size.ts`(새), `canvas/nodes.tsx`, `canvas/FlowCanvas.tsx`, `page.tsx`, `styles/node-style.ts`, 시험 2개(새) | nodes.tsx(T2)·page.tsx(T3) 를 이어 고친다 → 둘 다 병합된 뒤 |
| 5 문서·결정 | haiku | 1~4 | `docs/mdm/decisions.md`, `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` | 단독 |

순서: Task 1 → (Task 2 ∥ Task 3) → Task 4 → Task 5. 경로의 접두어 `src/frontend/m-mdm/pages/dme/ruleSetEdit/` 는 표·본문에서 줄여 쓴다(시험은 `src/frontend/m-mdm/tests/dme/ruleSetEdit/`).

---

## Global Constraints

- **화면만 바꾼다.** 백엔드·엔진·계약 파일(`engine-contract.*`, Java)은 고치지 않는다. 저장 형식은 흐름 JSON `view.styles?: Record<노드 ID, NodeStyle>` 하나만 더한다(스펙 §1).
- **외관을 쓰지 않은 세트의 저장 글자·dirty 기준은 예전과 한 글자도 같다**(S-D1). `styles` 가 비면 저장 JSON 에도, 메모리의 `EditFlow.view` 에도 키를 두지 않는다. 그래서 `EMPTY_VIEW` 와 기존 `view toEqual` 시험(`flow-edit.test.ts:113`, `rule-set-edit-page.test.ts:308`)은 **고치지 않고** 그대로 통과해야 한다 — 이 시험을 고치게 되면 구현이 틀린 것이다.
- 칸 순서 `color, w, h, hide, icon, shape`, 노드 키 순서는 흐름 노드 배열 순서, `styles` 는 `view` 의 마지막 키(`labels` 뒤).
- 크기 범위: 너비 232~640, 높이 68~320(흐름 좌표, 정수). 최소는 지금 룰 크기(`NODE_SIZE.RULE`)와 같다.
- 외관 적용 대상은 RULE·TASK 뿐이다. 시작·끝·분기·합류·메모·그룹은 지금 모양 그대로다. 접힌 분기 상자는 지금처럼 룰 기본 크기다.
- 상태 표시(디버그 current·next·pending·error·run, 선택, 끌어 놓기 대상)는 색보다 우선한다(S-D3). pending 의 흐림·회색도 그대로다.
- 화면 작업은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 따른다. 화면 모듈은 `@mantine/*` 를 import 하지 않고 `@dk-oasis/shared/*` 만 쓴다(shared 에는 SegmentedControl·NumberInput·Tooltip 래퍼가 없다 — Ruling 6). shared 래퍼 추가는 사용자 승인 사항이라 하지 않는다. 아이콘은 `@tabler/icons-react`.
- 규칙 정본 `docs/guide/FrontEnd/Local-Rules.md`:
  - §8 한 변 색 바 금지 — 색은 전체 테두리·배경 톤으로만 보인다.
  - §16 무거운 계산은 실제로 읽는 값만 의존성으로 둔다. 끄는 동안 page 를 다시 그리지 않고 dagre 도 다시 돌지 않는다(캔버스 안 저장소 + `useSyncExternalStore`, 놓을 때 콜백 한 번).
  - §17 로컬 `.css` import 금지 — 새 CSS 는 `styles/*.ts` 의 TS 문자열 상수로만 넣고 `rsf-styles.ts` 가 잇는다.
  - §19 memo — 노드·선 memo 의존성을 건드리면 **바꾸는 prop 하나만 바꾸고 나머지는 같은 참조로 둔 시험**을 둔다. 손잡이 등 누름을 받는 표시에는 `nodrag nopan`. 초점을 가진 요소를 지우면 캔버스 host 로 초점을 돌린다.
- **색:** 화면 CSS 에 16진수·`rgb()` 를 쓰지 않는다. 팔레트는 `:root` 의 `--rsf-c-{색}-bg`·`--rsf-c-{색}-border` 토큰이고 값은 shared 의미 토큰(`--color-primary`·`--color-success`·`--color-warning`·`--color-danger`·`--color-bg`·`--color-input-cell`)을 `color-mix()` 로 섞어 만든다. 어두운 화면 값은 `:root[data-mantine-color-scheme="dark"]` 에 둔다(Ruling 4). 노드·패널은 이 토큰만 쓴다.
- 새 노드 좌표는 저장하지 않는다(4단계 Ruling 19) — 단 **크기를 바꾸는 편집**(손잡이·패널·[기본 크기]·크기가 바뀌는 [외관 초기화])은 그때 그린 위치 전부를 저장 위치로 적는다(S-D6). 크기가 그대로인 외관 편집은 위치를 적지 않는다(되돌리기 칸이 헛돌지 않게).
- 편집 한 번 = `page.tsx` 의 `edit(f => …)` 한 번 = 되돌리기 한 칸. 외관 편집에는 `mergeKey` 를 쓰지 않는다.
- 컴포넌트 시험은 `src/frontend/m-mdm/tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 시험은 파일 첫 줄 `/** @vitest-environment happy-dom */`.
- 명령(워크트리 루트 기준):
  - 처음 한 번: `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`.
  - 시험 파일 하나: `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run <m-mdm 기준 경로>` (예: `tests/dme/ruleSetEdit/node-style-model.test.ts`).
  - 전체: `cd src/frontend/m-mdm && rtk proxy pnpm run test` — 완료 게이트는 `[m-mdm test 합계]` 줄.
  - 타입 검사: `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm run lint`(tsc --noEmit). 오류 0.
  - audit: `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 파일…>` 와 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일…>` 0건.
  - `.css` import 없음: `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0건.
  - 서버(bootRun·local-run·fe-run)는 띄우지 않는다. 도커 금지. 브라우저 확인은 계획 끝 「수동 브라우저 확인」에서 컨트롤러만 한다(ego-browser).
- git: 워크트리 루트에서 `/usr/bin/git` 단순 한 줄 명령만(cd 결합·파이프 금지). 자기가 만든·고친 파일만 경로로 지정해 `/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "..." -- <paths>`. `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(m-mdm): 한국어 요약`(문서는 `docs(mdm): …`) + 빈 줄 + 트레일러 두 줄:
  - `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2`
- 기준선: 착수 때 컨트롤러가 전체 시험 수를 한 번 돌려 진행 장부에 적는다. 각 태스크 완료 보고는 기준선 대비 증감과 audit·lint 결과를 적는다.
- `docs/mdm/decisions.md` 는 append-only 이고 **Task 5 만** 쓴다.

## Review Focus

1. **외관 없는 세트의 저장 글자 불변** — `styles` 가 없거나, 빈 객체이거나, 모두 버려지는 값(`default` 색·232×68·RULE/TASK 아닌 노드·없는 노드)만 있으면 `flowJsonOf` 결과가 예전과 같고 `view` 에 `styles` 키가 없다. 담당: Task 1(`node-style-model.test.ts` 「외관 없는 세트의 저장 글자는 예전과 같다」).
2. **스타일만 바뀐 흐름에서 배치가 다시 돈다** — 노드·선은 그대로이고 `view.styles` 만 바뀐 흐름을 다른 prop 은 같은 참조로 넘겨도 그 노드가 새 크기로 그려지고 자동 배치(dagre)가 다시 돌아 가운데가 맞는다. 담당: Task 1(`node-style-size.test.ts` 「memo — 스타일만 바뀐 흐름」).
3. **큰 노드가 자동 배치에서 겹치지 않는다** — 640×320 노드가 한 줄 흐름·IF 세 갈래 어느 갈래에 있어도 `autoLayout` 결과 상자가 서로 겹치지 않고 갈래 순서(왼→오)도 지킨다. 위험은 dagre 가 아니라 `orderBranches` 가 폭이 다른 갈래를 다른 갈래 자리에 옮기는 것이다. 담당: Task 1(`node-style-layout.test.ts` 「자동 배치 — 큰 노드」).
4. **디버그·선택·검사 상태 테두리가 색에 묻히지 않는다** — 색 규칙은 `.rsf-node:where([data-color=…])`(우선순위 0,1,0)로 base 뒤에 두고 `!important`·`box-shadow`·`border-width` 를 쓰지 않으며 `--rsf-border` 를 바꾸지 않는다(그래야 pending 회색 테두리가 색을 따라가지 않는다). 담당: Task 2(`node-style-view.test.ts` 「상태 표시가 색보다 우선」).
5. **분기 블록을 지우면 안쪽 노드 외관이 빠짐없이 정리된다** — `removeNode(분기)`·`removeBranch`·`dissolveSplit` 은 모두 `dropNodes` 를 지나므로 `dropNodes` 가 `styles` 를 넘기지 않으면 조용히 실패한다. 담당: Task 1(`node-style-model.test.ts` 「분기 블록을 지우면 안쪽 외관이 빠짐없이 지워진다」).

## Rulings(스펙이 정하지 않은 세부 — 이 계획이 정했다)

1. **메모리에서도 빈 `styles` 는 키를 두지 않는다.** `FlowView.styles` 는 선택 칸(`styles?:`)이고, 정규화 결과가 비면 키를 지운다. 기존 시험·`EMPTY_VIEW` 가 그대로 맞는다(Global Constraints).
2. **기본값과 같은 칸은 저장하지 않는다.** `color: "default"`, `w: 232`, `h: 68`, 빈 `hide` 는 버린다(스펙 §1 「기본값과 같은 칸은 두지 않는다」). 패널의 「기본」 색·「둥근 모서리」 모양은 칸 지우기다.
3. **편집 조각은 `NodeStylePatch`(칸마다 값 | null)** — null 은 그 칸 지우기, undefined 는 그대로, 조각 자체가 null 이면 외관 전부 지우기([외관 초기화]).
4. **어두운 화면:** 앱에는 어두운 테마가 없다(`shared/src/ui-provider/index.tsx` 의 `MantineProvider defaultColorScheme="light"`, `m-mcm/app/layout.tsx` 의 `ColorSchemeScript defaultColorScheme="light"`, shared `variables.css` 에 어두운 값 없음). `prefers-color-scheme` 를 쓰면 OS 가 어두울 때 채움만 어두워지고 글자는 그대로라 대비가 깨지므로 쓰지 않는다. 어두운 값은 Mantine 이 붙이는 `:root[data-mantine-color-scheme="dark"]` 에 둔다(오늘은 적용되지 않고, 앱이 어두운 테마를 켜면 따라간다).
5. **팔레트 값:** 파랑=`--color-primary`, 초록=`--color-success`, 노랑=`--color-warning` 테두리 + `--color-input-cell` 채움, 빨강=`--color-danger`, 주황=`color-mix(--color-warning 55%, --color-danger)`, 보라=`color-mix(--color-primary 50%, --color-danger)`. 채움은 테두리색을 `--color-bg` 에 10~12% 섞은 옅은 색(글자색 그대로라 대비 유지). 빨강 노드와 오류 상태가 비슷해 보이는 것은 오류 상태의 바깥 고리(box-shadow)와 굵기로 구별된다(S-D3 범위).
6. **패널 조작 요소:** 색 견본·아이콘·모양은 네이티브 `<button type="button" aria-pressed>`(색을 칠해야 하는데 shared `Button` 의 모양을 화면 CSS 로 덮지 않는다), 표시 항목은 shared `Checkbox`(aria-label), 너비·높이는 shared `Input type="number"`(지역 초안 + Enter·칸 밖 저장). 스펙의 SegmentedControl 은 shared 래퍼가 없어 누름 단추 3개로 대신한다. 툴팁은 `title`.
7. **색 규칙의 우선순위:** `.rsf-node:where([data-color="blue"]) { --rsf-node-bg: …; border-color: … }` — 우선순위 (0,1,0)이라 base `.rsf-node` 뒤에 두면 기본 테두리를 이기고, 상태 규칙(`.rsf-node.rsf-node-current`·`[data-state]`·`[data-selected]`·`:hover`·`.rsf-node-drop`, 모두 0,2,0)에는 진다. `--rsf-border` 는 바꾸지 않는다(pending 이 `var(--rsf-border)` 회색을 쓴다). 모양도 같은 방식(`.rsf-node:where([data-shape=…])`). 색 노드에 마우스를 올리면 hover 테두리(회색)가 잠깐 이긴다 — 지금 hover 동작 그대로다.
8. **`groupBox` 의 접힌 분기 크기:** 지금은 접힌 분기를 제 종류 크기(IF 176×44)로 재 그룹 틀이 그린 상자(232×68)보다 작다. 노드별 크기로 바꾸면서 접힌 분기는 그린 상자(룰 기본 크기)로 잰다 — 동작이 바뀌므로 시험을 둔다(Task 1). `nearestEdge`·`nodeAtPoint` 는 지금처럼 접힘을 보지 않는다(`blocks` 인자 없음, 바뀌는 동작 없음).
9. **`measured` 캐시:** `@xyflow/system` 의 `getNodeDimensions` 는 `node.measured?.width ?? node.width` 순서라 크기가 바뀐 뒤 옛 `measured` 를 넘기면 옛 크기가 이긴다. 캐시가 있고 새 크기와 다르면 `{width: s.w, height: s.h}` 를 넘기고, 같거나 캐시가 없으면 지금처럼 넘긴다(캐시가 없을 때 measured 를 새로 만들면 fitView 시점이 바뀐다).
10. **갈래 다시 벌리기:** `orderBranches` 가 갈래를 dagre 의 다른 갈래 자리로 옮긴 뒤, 왼쪽 갈래의 노드와 **세로 범위가 겹치는**(같은 높이의) 오른쪽 갈래 노드 사이가 40(nodesep)보다 좁으면 그 갈래와 뒤 갈래들을 밀고 전체를 처음 자리 가운데로 되돌린다(`spreadLanes`). 갈래 경계 상자끼리 견주면 중첩 분기가 든 갈래(아래 층에서만 넓다)와 이웃이 겹친다고 잘못 보아 기본 배치까지 바뀌므로 노드끼리 견준다. 실제로 가까운 노드가 없으면 아무것도 하지 않으므로 기본 크기 흐름의 배치는 바뀌지 않는다. 빈 갈래(선만 지나는 자리)는 견주지 않고 함께 밀린다.
11. **크기 바꾸기 + 위치 고정은 `flow-layout.ts` 의 `restyleNode`** — `foldOffsetX` 가 필요하고 `flow-layout.ts` 가 `flow-edit.ts` 를 import 하므로(순환 방지) `shiftSpace` 옆에 둔다. 순수 외관 편집 `setNodeStyle` 은 `flow-edit.ts` 에 둔다. 패널·손잡이 모두 `restyleNode` 를 부른다.
12. **패널이 쓰는 그린 위치:** page 가 이미 있는 `alignSourceRef`(캔버스가 채움, `drawn`·`blocks` 포함)에서 `layoutSource()` 를 만들어 SidePanel → PropertyPanel 로 넘긴다. 캔버스가 없으면 null 이고 위치를 적지 않는다.
13. **「외관」 섹션은 편집 모드면 보이고, 불러오는 동안은 조작만 끈다.** `editable` 은 `editing && !loading` 이라 그것으로 감추면 저장·검사 때마다 섹션이 깜빡인다. PropertyPanel 에 `editing` 을 따로 넘긴다. 보기 모드는 감추고, 디버그 모드는 오른쪽에 변수 패널이 그려져 원래 없다.
14. **표시 항목 이름:** 룰은 `sub`=「종류·정책 줄」, `id`=「룰 ID 줄」, `open`=「룰 편집 열기 단추」, 빈 단계의 `sub`=「안내 줄」. 빈 단계 패널에는 `sub` 만 보이고 저장돼 있던 `id`·`open` 은 그대로 둔다(스펙 §2.3). `open` 을 숨기면 룰 노드 오른쪽 여백(28px)을 10px 로 줄인다.
15. **제목 줄 수(S-D11):** `titleLines(h, smallRows)` — 높이가 68 이하면 1(한 줄 말줄임), 크면 `floor((h − 12 − 15 × 보이는 작은 줄 수) / 16)`(1 이상). 제목 줄 높이 16·작은 줄 15·위아래 여백 6+6 은 `styles/base.ts` 값이다. 2줄 이상이면 `data-lines` 와 인라인 사용자 정의 속성 `--rsf-lines` 를 주고 CSS 가 `-webkit-line-clamp: var(--rsf-lines)` 로 줄바꿈 말줄임한다(happy-dom 이 `-webkit-line-clamp` 인라인 값을 버리므로 시험할 수 있는 사용자 정의 속성으로 넘긴다).
16. **크기 손잡이 자리:** 오른쪽 변 가운데·아래 변 가운데에는 이미 네 변 잇기 손잡이(`rsf-link`, C1)가 있다. 크기 손잡이 `e` 는 오른쪽 변의 위에서 75%, `s` 는 아래 변의 왼쪽에서 75%, `se` 는 오른쪽 아래 모서리에 둔다(잇기 손잡이를 가리지 않는다).
17. **손잡이를 보이는 조건:** 편집 모드 && 노드가 RULE·TASK && 접힌 상자가 아님 && `selectedId === 노드 ID` && React Flow 다중 선택이 둘 이상이 아님(「하나만 고른」).
18. **아이콘 이름(툴팁·aria):** calc 계산, check 검사, filter 거르기, calendar 날짜, money 금액, alert 주의, database 데이터, ruler 치수, scale 무게, truck 물류, settings 설정, flag 표시. 색 이름: 기본·파랑·초록·노랑·주황·빨강·보라. 모양: 둥근 모서리·각진 모서리·알약.
19. **필 모양 안쪽 여백:** `pill` 은 `border-radius: 999px`(= 높이의 절반)이고 글자가 둥근 끝에 닿지 않게 룰·빈 단계 좌우 안쪽 여백을 6px 더한다.

---

### Task 1: 모델·codec·노드별 크기 배관

**모델:** opus — 여러 파일의 크기 계산을 한 함수로 모으고, 뒤 태스크 셋이 모두 이 태스크의 이름을 쓴다.

**Files:**
- Create: `node-style.ts`(저장 형식·목록·정규화, React 의존 없음)
- Create: `canvas/node-icons.ts`(아이콘 키 → Tabler 컴포넌트)
- Create: `styles/node-style.ts`(팔레트 토큰 `NODE_STYLE_CSS` — 이 태스크는 `:root` 토큰만)
- Modify: `flow-edit.ts`(`FlowView.styles`, `copyView`·`clone`·`sanitizeView`·`done`·`dropNodes`·`toEditFlow`·`flowJsonOf`, `Fragment.styles`·`copyFragment`·`pasteFragment`, 새 `setNodeStyle`)
- Modify: `flow-layout.ts`(`nodeSize`·`nodeSizeOf`·`StyledFlow`, `autoLayout`·`orderBranches`(+`spreadLanes`·`LaneBox`)·`drawnPositions`, 새 `pinDrawn`·`restyleNode`·`NodeLayoutSource`)
- Modify: `flow-vars.ts:41-67, 104-118`(`nearestEdge`·`nodeAtPoint`)
- Modify: `state/useEditActions.ts:134-149, 186-195`(`centerOf`·`placeNote`)
- Modify: `canvas/align.ts:13, 45`(`itemsOf`)
- Modify: `canvas/FlowCanvas.tsx:66, 991-1012, 1122-1171, 1568-1570`(import·`groupBox`·노드 memo·포커스 이동)
- Modify: `canvas/nodes.tsx:22, 36-61, 382-399`(`FlowNodeData.style`, `handlesOf(kind, size)`)
- Modify: `rsf-styles.ts`(`NODE_STYLE_CSS` 를 맨 뒤에 잇기)
- Test(새): `tests/dme/ruleSetEdit/node-style-model.test.ts`, `tests/dme/ruleSetEdit/node-style-layout.test.ts`, `tests/dme/ruleSetEdit/node-style-size.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces(Task 2·3·4 가 이 이름을 그대로 쓴다):
  - `node-style.ts`
    ```ts
    export type NodeColor = "default" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";
    export type NodePart = "sub" | "id" | "open";
    export type NodeIcon = "calc" | "check" | "filter" | "calendar" | "money" | "alert" | "database" | "ruler" | "scale" | "truck" | "settings" | "flag";
    export type NodeShape = "square" | "pill";
    export type NodeShapeChoice = "round" | NodeShape; // 패널 — round = 칸 지우기
    export interface NodeStyle { color?: NodeColor; w?: number; h?: number; hide?: NodePart[]; icon?: NodeIcon; shape?: NodeShape }
    export type NodeStylePatch = { [K in keyof NodeStyle]?: NodeStyle[K] | null };
    export interface NodeSize { w: number; h: number }
    export const NODE_COLORS: readonly NodeColor[];            // default 먼저, 스펙 §2.1 순서
    export const NODE_COLOR_LABEL: Readonly<Record<NodeColor, string>>;
    export const NODE_PARTS: readonly NodePart[];              // ["sub", "id", "open"]
    export const NODE_PART_LABEL: Readonly<Record<NodePart, string>>; // 룰 기준
    export const TASK_SUB_LABEL: string;                       // "안내 줄"
    export const NODE_ICONS: readonly NodeIcon[];              // 스펙 §2.4 순서
    export const NODE_ICON_LABEL: Readonly<Record<NodeIcon, string>>;
    export const NODE_SHAPE_CHOICES: readonly NodeShapeChoice[]; // ["round", "square", "pill"]
    export const NODE_SHAPE_LABEL: Readonly<Record<NodeShapeChoice, string>>;
    export const NODE_W_MIN = 232, NODE_W_MAX = 640, NODE_H_MIN = 68, NODE_H_MAX = 320;
    export const STYLED_KINDS: ReadonlySet<string>;            // RULE·TASK
    export function normalizeNodeStyle(raw: unknown): NodeStyle | null;
    export function mergeNodeStyle(cur: NodeStyle | undefined, patch: NodeStylePatch | null): NodeStyle | null;
    export function stylesFor(nodes: readonly { id: string; kind: string }[], styles: Readonly<Record<string, unknown>> | undefined): Record<string, NodeStyle>;
    ```
  - `flow-edit.ts`: `FlowView.styles?: Record<string, NodeStyle>`, `Fragment.styles?: Record<string, NodeStyle>`, `export function setNodeStyle(f: EditFlow, nodeId: string, patch: NodeStylePatch | null): EditResult` — 거부 문구 「룰·빈 단계 노드만 외관을 바꾼다」, 「노드 크기가 올바르지 않다」, 없는 노드는 `노드 ${id}를 찾지 못했다`.
  - `flow-layout.ts`
    ```ts
    export type StyledFlow = { view?: { styles?: Readonly<Record<string, NodeStyle>> } };
    export function nodeSize(kind: FlowNodeKind, style?: NodeStyle | null, folded?: boolean): NodeSize;
    export function nodeSizeOf(f: StyledFlow, n: { id: string; kind: FlowNodeKind }, blocks?: Readonly<Record<string, unknown>>): NodeSize;
    export interface NodeLayoutSource { drawn: Record<string, FlowPos>; blocks: SpaceBlocks }
    export function pinDrawn(f: EditFlow, drawn: Readonly<Record<string, FlowPos>>, blocks?: SpaceBlocks): EditFlow;
    export function restyleNode(f: EditFlow, nodeId: string, patch: NodeStylePatch | null, drawn?: Readonly<Record<string, FlowPos>>, blocks?: SpaceBlocks): EditResult;
    // autoLayout(f: RuleSetFlow & StyledFlow, blocks?) — 시그니처는 인자 타입만 넓어진다
    ```
  - `canvas/node-icons.ts`: `export const NODE_ICON_COMPONENT: Readonly<Record<NodeIcon, TablerIcon>>`.
  - `canvas/nodes.tsx`: `FlowNodeData.style?: NodeStyle`(접힌 상자·RULE/TASK 아닌 노드는 undefined), `export function handlesOf(kind: FlowNode["kind"], size?: NodeSize)`. FlowCanvas 가 `data.style` 을 채운다(그리기는 Task 2).
  - `styles/node-style.ts`: `export const NODE_STYLE_CSS: string` — `:root` 에 6색 × `--rsf-c-{색}-bg`·`--rsf-c-{색}-border`, `:root[data-mantine-color-scheme="dark"]` 에 같은 12개. `rsf-styles.ts` 의 `RSF_CSS` 맨 끝(TASK_CSS 뒤)에 잇는다. Task 2·4 는 이 상수 끝에 규칙을 덧붙인다.

- [ ] **Step 1: 모델 실패 시험 — `tests/dme/ruleSetEdit/node-style-model.test.ts`**

```ts
// 외관 옵션(S1) — NodeStyle 정규화·view.styles 코덱·노드 연산(지우기·룰 지정·복사)·setNodeStyle.
import { describe, expect, it } from "vitest";

import {
  addBranch, assignRule, copyFragment, dissolveSplit, duplicateNode, flowJsonOf, insertSplit, insertTask, pasteFragment,
  removeBranch, removeNode, setNodeStyle, toEditFlow, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { NODE_H_MAX, NODE_W_MAX, mergeNodeStyle, normalizeNodeStyle, stylesFor } from "../../../pages/dme/ruleSetEdit/node-style";
import { NODE_STYLE_CSS } from "../../../pages/dme/ruleSetEdit/styles/node-style";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → end, 선 e1 start→r1 · e2 r1→r2 · e3 r2→end. */
const base = () => toEditFlow(null, ["NS_A", "NS_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));
/**
 * start → r1 → if1{ e4: r3(룰 NS_C) / e5 그 외: r4(빈 단계) } → m1 → r2 → end. r1·r3·r4 에 외관.
 * 노드 배열은 끼운 순서라 [start, r1, if1, r4, r3, m1, r2, end] 다(새 노드는 선의 출발 노드 바로 뒤) — 외관 키 순서도 r1·r4·r3.
 */
function branched(): EditFlow {
  let f = ok(insertSplit(base(), "e2", "IF"));
  f = ok(insertTask(f, "e4"));
  f = ok(insertTask(f, "e5"));
  f = ok(assignRule(f, "r3", "NS_C"));
  expect([f.edges.find((e) => e.id === "e4")!.to, f.edges.find((e) => e.id === "e5")!.to]).toEqual(["r3", "r4"]);
  f = styled(f, "r1", { color: "blue" });
  f = styled(f, "r3", { color: "red", w: 300 });
  return styled(f, "r4", { icon: "flag" });
}

describe("normalizeNodeStyle", () => {
  it("칸마다 아는 값만 남기고 color·w·h·hide·icon·shape 순서로 쓴다", () => {
    const s = normalizeNodeStyle({ shape: "pill", icon: "calc", hide: ["open", "sub", "open", "x"], h: 100.4, w: 300.6, color: "blue", extra: 1 });
    expect(s).toEqual({ color: "blue", w: 301, h: 100, hide: ["sub", "open"], icon: "calc", shape: "pill" });
    expect(Object.keys(s!)).toEqual(["color", "w", "h", "hide", "icon", "shape"]);
  });

  it("범위 밖은 자르고 기본값(default 색·232·68)·모르는 값·빈 목록은 버린다. 남는 칸이 없으면 null", () => {
    expect(normalizeNodeStyle({ w: 9999, h: -5 })).toEqual({ w: NODE_W_MAX });
    expect(normalizeNodeStyle({ w: 1, h: 9999 })).toEqual({ h: NODE_H_MAX });
    expect(normalizeNodeStyle({ color: "default", w: 232, h: 68, hide: [], icon: "nope", shape: "round" })).toBeNull();
    expect(normalizeNodeStyle({ w: Number.NaN, h: "100", hide: "sub" })).toBeNull();
    for (const raw of ["blue", null, undefined, 3, []]) expect(normalizeNodeStyle(raw)).toBeNull();
  });

  it("mergeNodeStyle — null 칸은 지우고 undefined 칸은 그대로, 조각이 null 이면 전부 지운다", () => {
    expect(mergeNodeStyle({ color: "red", w: 300 }, { color: null, icon: "flag", w: undefined })).toEqual({ w: 300, icon: "flag" });
    expect(mergeNodeStyle({ color: "red" }, null)).toBeNull();
    expect(mergeNodeStyle(undefined, { color: "default" })).toBeNull();
  });

  it("stylesFor — RULE·TASK 이고 흐름에 있는 노드만, 흐름 노드 배열 순서로", () => {
    const nodes = [{ id: "start", kind: "START" }, { id: "r2", kind: "TASK" }, { id: "r1", kind: "RULE" }];
    const out = stylesFor(nodes, { r1: { color: "red" }, start: { color: "blue" }, r2: { icon: "flag" }, ghost: { color: "blue" } });
    expect(out).toEqual({ r2: { icon: "flag" }, r1: { color: "red" } });
    expect(Object.keys(out)).toEqual(["r2", "r1"]);
  });
});

describe("view.styles 코덱(S-D1)", () => {
  it("외관 없는 세트의 저장 글자는 예전과 같다 — styles 키가 없다(Review Focus 1)", () => {
    const plain = base();
    const s = flowJsonOf(plain);
    expect(s).not.toContain("styles");
    expect(s.endsWith('"labels":{}}}')).toBe(true);
    const junk: unknown[] = [{}, { r1: {} }, { r1: { color: "default", w: 232, h: 68 } }, { start: { color: "blue" } }, { zz: { color: "blue" } }, "x", [], null];
    for (const styles of junk) {
      const f = toEditFlow({ ...plain, view: { ...plain.view, styles } } as never, []);
      expect(flowJsonOf(f)).toBe(s);
      expect("styles" in f.view).toBe(false);
    }
    expect("styles" in toEditFlow(JSON.parse(s), []).view).toBe(false);
  });

  it("styles 는 view 의 마지막 키, 노드 키는 흐름 노드 배열 순서 — 왕복이 같다", () => {
    let f = styled(base(), "r2", { shape: "pill", color: "green" });
    f = styled(f, "r1", { icon: "flag", w: 300 });
    const s = flowJsonOf(f);
    expect(s).toContain('"labels":{},"styles":{"r1":{"w":300,"icon":"flag"},"r2":{"color":"green","shape":"pill"}}}');
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });

  it("읽기 — RULE·TASK 가 아닌 노드·없는 노드의 키는 버리고 칸은 정규화한다", () => {
    const plain = base();
    const raw = { ...plain, view: { ...plain.view, styles: { start: { color: "red" }, r1: { color: "purple", w: 700 }, ghost: { color: "blue" } } } };
    expect(toEditFlow(raw as never, []).view.styles).toEqual({ r1: { color: "purple", w: 640 } });
  });

  it("팔레트 토큰 — 여섯 색 모두 채움·테두리 토큰이 :root 와 어두운 화면에 있고 16진수·rgb() 가 없다", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const light = /:root \{([^}]*)\}/.exec(css)![1];
    const dark = /:root\[data-mantine-color-scheme="dark"\] \{([^}]*)\}/.exec(css)![1];
    for (const c of ["blue", "green", "yellow", "orange", "red", "purple"]) {
      for (const part of ["bg", "border"]) {
        expect(light).toContain(`--rsf-c-${c}-${part}:`);
        expect(dark).toContain(`--rsf-c-${c}-${part}:`);
      }
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|prefers-color-scheme/);
  });
});

describe("setNodeStyle", () => {
  it("조각을 합치고 null 칸은 지운다. 모두 지우면 노드 키·styles 키가 없다. 입력은 바뀌지 않는다", () => {
    const f0 = base();
    const before = flowJsonOf(f0);
    const f1 = styled(f0, "r1", { color: "blue", icon: "calc" });
    expect(f1.view.styles).toEqual({ r1: { color: "blue", icon: "calc" } });
    const f2 = styled(f1, "r1", { color: null });
    expect(f2.view.styles).toEqual({ r1: { icon: "calc" } });
    expect("styles" in styled(f2, "r1", null).view).toBe(false);
    expect(flowJsonOf(f0)).toBe(before);
  });

  it("RULE·TASK 만 — 시작·분기·없는 노드·유한하지 않은 크기는 거부한다", () => {
    expect(setNodeStyle(base(), "start", { color: "blue" })).toEqual({ ok: false, reason: "룰·빈 단계 노드만 외관을 바꾼다" });
    expect(setNodeStyle(base(), "zz", { color: "blue" })).toEqual({ ok: false, reason: "노드 zz를 찾지 못했다" });
    expect(setNodeStyle(base(), "r1", { w: Number.NaN })).toEqual({ ok: false, reason: "노드 크기가 올바르지 않다" });
    expect(setNodeStyle(base(), "r1", { h: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
});

describe("노드 연산과 외관(S-D10·S-D12)", () => {
  it("룰 노드를 지우면 그 외관도 지운다", () => {
    const f = ok(removeNode(styled(base(), "r1", { color: "blue" }), "r1"));
    expect("styles" in f.view).toBe(false);
  });

  it("분기 블록을 지우면 안쪽 노드의 외관이 빠짐없이 지워진다 — removeNode·removeBranch·dissolveSplit(Review Focus 5)", () => {
    const f = branched();
    expect(Object.keys(f.view.styles!)).toEqual(["r1", "r4", "r3"]);
    expect(Object.keys(ok(removeNode(f, "if1")).view.styles!)).toEqual(["r1"]);
    const three = ok(addBranch(f, "if1"));
    expect(Object.keys(ok(removeBranch(three, "if1", "e4")).view.styles!)).toEqual(["r1", "r4"]);
    expect(Object.keys(ok(dissolveSplit(f, "if1", "e5")).view.styles!)).toEqual(["r1", "r4"]);
    expect(Object.keys(ok(dissolveSplit(f, "if1", "e4")).view.styles!)).toEqual(["r1", "r3"]);
  });

  it("빈 단계에 룰을 지정해도(같은 노드 ID) 외관이 남는다", () => {
    let f = ok(insertTask(base(), "e2"));
    const id = f.edges.find((e) => e.id === "e2")!.to;
    f = styled(f, id, { color: "yellow", h: 120 });
    expect(ok(assignRule(f, id, "NS_C")).view.styles).toEqual({ [id]: { color: "yellow", h: 120 } });
  });

  it("복사·붙여넣기·복제는 새 ID 로 외관을 옮기고 원본 외관은 그대로", () => {
    const f = styled(base(), "r1", { color: "blue", w: 300 });
    const frag = copyFragment(f, "r1");
    if (typeof frag === "string") throw new Error(frag);
    expect(frag.styles).toEqual({ r1: { color: "blue", w: 300 } });
    const pasted = ok(pasteFragment(f, "e3", frag));
    const newId = pasted.edges.find((e) => e.id === "e3")!.to;
    expect(newId).not.toBe("r1");
    expect(pasted.view.styles).toEqual({ r1: { color: "blue", w: 300 }, [newId]: { color: "blue", w: 300 } });
    const dup = ok(duplicateNode(branched(), "if1"));
    const copies = dup.nodes.filter((n) => n.kind === "RULE" && n.ruleId === "NS_C");
    expect(copies).toHaveLength(2);
    for (const n of copies) expect(dup.view.styles![n.id]).toEqual({ color: "red", w: 300 });
  });

  it("외관 없는 조각은 styles 를 싣지 않는다", () => {
    const frag = copyFragment(base(), "r1");
    if (typeof frag === "string") throw new Error(frag);
    expect("styles" in frag).toBe(false);
  });

  it("자동 정렬은 외관을 지우지 않는다", () => {
    const f = branched();
    expect(autoArrange(f).view.styles).toEqual(f.view.styles);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/node-style-model.test.ts` → FAIL(`node-style` 모듈 없음).

- [ ] **Step 3: `node-style.ts` 만들기**

```ts
/**
 * 룰·빈 단계 노드 외관(S1, 스펙 2026-10-01-rule-set-flow-node-style-design.md) — 저장 형식·목록·정규화. React 의존이 없다.
 * 흐름 JSON `view.styles[노드 ID]` 에 둔다. 백엔드는 view 를 그대로 통과시킨다(계약 변경 없음, S-D1).
 * 기본값과 같은 칸(default 색·232·68·빈 hide)은 두지 않고, 남는 칸이 없으면 노드 키도 두지 않는다 — 외관 없는 세트의 저장 글자가 예전과 같다.
 */
export type NodeColor = "default" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";
export type NodePart = "sub" | "id" | "open";
export type NodeIcon = "calc" | "check" | "filter" | "calendar" | "money" | "alert" | "database" | "ruler" | "scale" | "truck" | "settings" | "flag";
export type NodeShape = "square" | "pill";
/** 패널 모양 고르기 — round 는 칸 지우기(지금 모양). */
export type NodeShapeChoice = "round" | NodeShape;

/** 룰·빈 단계 노드 외관(S1). 모든 칸은 선택이다. 기본값과 같은 칸은 두지 않는다. */
export interface NodeStyle {
  color?: NodeColor;
  /** 너비(흐름 좌표, 정수, 232~640). 없으면 232. */
  w?: number;
  /** 높이(정수, 68~320). 없으면 68. */
  h?: number;
  /** 숨길 표시 항목(NODE_PARTS 순서, 중복 없음). */
  hide?: NodePart[];
  icon?: NodeIcon;
  shape?: NodeShape;
}
/** 외관 편집 조각 — 값은 그 칸을 바꾸고, null 은 그 칸을 지우고, undefined 는 그대로 둔다. */
export type NodeStylePatch = { [K in keyof NodeStyle]?: NodeStyle[K] | null };
export interface NodeSize {
  w: number;
  h: number;
}

export const NODE_COLORS: readonly NodeColor[] = ["default", "blue", "green", "yellow", "orange", "red", "purple"];
export const NODE_COLOR_LABEL: Readonly<Record<NodeColor, string>> = {
  default: "기본", blue: "파랑", green: "초록", yellow: "노랑", orange: "주황", red: "빨강", purple: "보라",
};
export const NODE_PARTS: readonly NodePart[] = ["sub", "id", "open"];
export const NODE_PART_LABEL: Readonly<Record<NodePart, string>> = { sub: "종류·정책 줄", id: "룰 ID 줄", open: "룰 편집 열기 단추" };
/** 빈 단계의 `sub` 이름(빈 단계에는 `id`·`open` 이 없다). */
export const TASK_SUB_LABEL = "안내 줄";
export const NODE_ICONS: readonly NodeIcon[] = ["calc", "check", "filter", "calendar", "money", "alert", "database", "ruler", "scale", "truck", "settings", "flag"];
export const NODE_ICON_LABEL: Readonly<Record<NodeIcon, string>> = {
  calc: "계산", check: "검사", filter: "거르기", calendar: "날짜", money: "금액", alert: "주의",
  database: "데이터", ruler: "치수", scale: "무게", truck: "물류", settings: "설정", flag: "표시",
};
export const NODE_SHAPE_CHOICES: readonly NodeShapeChoice[] = ["round", "square", "pill"];
export const NODE_SHAPE_LABEL: Readonly<Record<NodeShapeChoice, string>> = { round: "둥근 모서리", square: "각진 모서리", pill: "알약" };

/** 크기 범위(흐름 좌표). 최소는 지금 룰 크기(`NODE_SIZE.RULE`)와 같다(S-D4). */
export const NODE_W_MIN = 232;
export const NODE_W_MAX = 640;
export const NODE_H_MIN = 68;
export const NODE_H_MAX = 320;
/** 외관을 가질 수 있는 노드 종류(스펙 §0). */
export const STYLED_KINDS: ReadonlySet<string> = new Set(["RULE", "TASK"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const among = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** 모양이 맞는 칸만 정해진 순서로 남긴다. 범위 밖 숫자는 자르고, 기본값과 같은 칸은 버린다. 남는 칸이 없으면 null. */
export function normalizeNodeStyle(raw: unknown): NodeStyle | null {
  if (!isObj(raw)) return null;
  const out: NodeStyle = {};
  if (among(NODE_COLORS, raw.color) && raw.color !== "default") out.color = raw.color;
  if (finite(raw.w)) {
    const w = clampInt(raw.w, NODE_W_MIN, NODE_W_MAX);
    if (w !== NODE_W_MIN) out.w = w;
  }
  if (finite(raw.h)) {
    const h = clampInt(raw.h, NODE_H_MIN, NODE_H_MAX);
    if (h !== NODE_H_MIN) out.h = h;
  }
  if (Array.isArray(raw.hide)) {
    const given = raw.hide as unknown[];
    const hide = NODE_PARTS.filter((p) => given.includes(p));
    if (hide.length > 0) out.hide = hide;
  }
  if (among(NODE_ICONS, raw.icon)) out.icon = raw.icon;
  if (raw.shape === "square" || raw.shape === "pill") out.shape = raw.shape;
  return Object.keys(out).length > 0 ? out : null;
}

/** 지금 외관에 조각을 합친 정규화 결과(빈 값이면 null). 조각이 null 이면 전부 지운다([외관 초기화]). */
export function mergeNodeStyle(cur: NodeStyle | undefined, patch: NodeStylePatch | null): NodeStyle | null {
  if (patch === null) return null;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return normalizeNodeStyle(next);
}

/**
 * 흐름에 있는 RULE·TASK 노드의 외관만, 흐름 노드 배열 순서로 정규화해 모은다(S-D12 — 정리는 이 한 곳).
 * `routesFor`·`labelsFor` 와 같은 자리(toEditFlow·clone·done)에서 불러 노드를 한꺼번에 지우는 연산에서도 빠짐없이 정리한다.
 */
export function stylesFor(nodes: readonly { id: string; kind: string }[], styles: Readonly<Record<string, unknown>> | undefined): Record<string, NodeStyle> {
  const out: Record<string, NodeStyle> = {};
  if (!isObj(styles)) return out;
  for (const n of nodes) {
    if (!STYLED_KINDS.has(n.kind) || !Object.prototype.hasOwnProperty.call(styles, n.id)) continue;
    const s = normalizeNodeStyle(styles[n.id]);
    if (s) out[n.id] = s;
  }
  return out;
}
```

- [ ] **Step 4: `flow-edit.ts` 고치기** — 아래 다섯 view 재구성 자리를 **모두** 고친다(하나라도 빠지면 그 연산 뒤 `styles` 가 조용히 사라진다).

머리 import 에 더한다:

```ts
import { mergeNodeStyle, stylesFor, type NodeStyle, type NodeStylePatch } from "./node-style";
```

`FlowView` 에 칸을 더한다(`labels` 뒤):

```ts
  /** 노드 ID → 외관(S1, 룰·빈 단계만). 비면 키를 두지 않는다(저장 글자·dirty 비교가 예전 세트와 같다, S-D1). */
  styles?: Record<string, NodeStyle>;
```

`Fragment` 에 칸을 더한다:

```ts
  /** 조각 노드의 외관(S-D10 — 붙여 넣을 때 새 ID 로 옮긴다). 없으면 키가 없다. */
  styles?: Record<string, NodeStyle>;
```

`labelsFor` 아래에 도우미를 더한다:

```ts
/** view 에 외관을 싣는다 — 비면 styles 키를 두지 않는다(계획 Ruling 1). 나머지 칸은 그대로(복사하지 않는다). */
function withStyles(v: FlowView, styles: Record<string, NodeStyle>): FlowView {
  const out: FlowView = { positions: v.positions, notes: v.notes, groups: v.groups, routes: v.routes, labels: v.labels };
  if (Object.keys(styles).length > 0) out.styles = styles;
  return out;
}
```

① `copyView`·`clone` — 노드를 받아 외관을 거른다:

```ts
function copyView(v: FlowView | undefined, nodes: readonly FlowNode[], edges: readonly FlowEdge[]): FlowView {
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(v?.positions ?? {})) positions[k] = copyPos(p);
  const view: FlowView = {
    positions, notes: (v?.notes ?? []).map(copyNote), groups: (v?.groups ?? []).map(copyGroup), routes: routesFor(edges, v?.routes),
    labels: labelsFor(edges, v?.labels),
  };
  return withStyles(view, stylesFor(nodes, v?.styles));
}

function clone(f: EditFlow): EditFlow {
  const nodes = (f.nodes ?? []).map(copyNode);
  const edges = (f.edges ?? []).map(copyEdge);
  return { version: 1, nodes, edges, view: copyView(f.view, nodes, edges) };
}
```

② `sanitizeView` — 끝(`return view;` 앞)에 모양이 맞는 외관만 읽는다(노드 걸러내기는 ③ 에서):

```ts
  if (isObj(raw.styles)) {
    const styles: Record<string, NodeStyle> = {};
    for (const [k, s] of Object.entries(raw.styles)) {
      const n = normalizeNodeStyle(s);
      if (n) styles[k] = n;
    }
    if (Object.keys(styles).length > 0) view.styles = styles;
  }
```

(`normalizeNodeStyle` 도 import 에 더한다.)

③ `toEditFlow` — 노드를 먼저 만들고 외관을 거른다:

```ts
export function toEditFlow(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): EditFlow {
  const src = raw ?? linearFlow(ruleIds);
  const nodes = (Array.isArray(src.nodes) ? src.nodes : []).map(copyNode);
  const edges = (Array.isArray(src.edges) ? src.edges : []).map(copyEdge);
  const view: FlowView = raw ? sanitizeView(raw.view) : { positions: {}, notes: [], groups: [], routes: {}, labels: {} };
  return {
    version: 1,
    nodes,
    edges,
    view: withStyles({ ...view, routes: routesFor(edges, view.routes), labels: labelsFor(edges, view.labels) }, stylesFor(nodes, view.styles)),
  };
}
```

④ `done` — 외관도 정규화한다:

```ts
const done = (flow: EditFlow): EditResult => {
  if (!flow.view) return { ok: true, flow };
  const routes = routesFor(flow.edges, flow.view.routes);
  const labels = labelsFor(flow.edges, flow.view.labels);
  return { ok: true, flow: { ...flow, view: withStyles({ ...flow.view, routes, labels }, stylesFor(flow.nodes, flow.view.styles)) } };
};
```

⑤ `dropNodes` — 마지막 줄의 view 리터럴이 `styles` 를 넘기게 한다(`done` 이 지운 노드 키를 거른다):

```ts
  return {
    version: f.version, nodes, edges,
    view: withStyles({ positions, notes, groups, routes: f.view.routes, labels: f.view.labels }, stylesFor(nodes, f.view.styles)),
  };
```

`flowJsonOf` — `styles` 를 마지막 키로 쓴다(`clone` 이 이미 정규화·빈 값 제거):

```ts
export function flowJsonOf(f: EditFlow): string {
  const c = clone(f);
  const v = c.view;
  return JSON.stringify({
    version: 1, nodes: c.nodes, edges: c.edges,
    view: { positions: v.positions, notes: v.notes, groups: v.groups, routes: v.routes, labels: v.labels, ...(v.styles ? { styles: v.styles } : {}) },
  });
}
```

`copyFragment` — 조각 노드의 외관을 싣는다(두 갈래 모두):

```ts
/** 조각 노드의 외관(없으면 undefined — 키를 싣지 않는다). */
function fragmentStyles(f: EditFlow, nodes: readonly FlowNode[]): Record<string, NodeStyle> | undefined {
  const s = stylesFor(nodes, f.view?.styles);
  return Object.keys(s).length > 0 ? s : undefined;
}
```

`copyFragment` 의 두 `return` 을 다음처럼 바꾼다(룰 하나·분기 블록):

```ts
  if (isStep(n.kind)) {
    const nodes = [copyNode(n)];
    const styles = fragmentStyles(f, nodes);
    return { nodes, edges: [], entry: nodeId, exit: nodeId, ...(styles ? { styles } : {}) };
  }
  // … 분기 블록
  const nodes = f.nodes.filter((x) => inside.has(x.id)).map(copyNode);
  const styles = fragmentStyles(f, nodes);
  return {
    nodes,
    edges: f.edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map(copyEdge),
    entry: nodeId,
    exit: mergeOf(f, nodeId)!.id,
    ...(styles ? { styles } : {}),
  };
```

`pasteFragment` — `insertAfter(g.edges, ti, ...edges, exit);` 다음, `return done(g);` 앞에:

```ts
  if (frag.styles) {
    const styles: Record<string, NodeStyle> = { ...g.view.styles };
    for (const [oldId, s] of Object.entries(frag.styles)) if (idOf.has(oldId)) styles[nid(oldId)] = s;
    g.view = { ...g.view, styles }; // done 이 노드 순서·정규화로 다시 맞춘다
  }
```

`setGroupPad` 다음에 새 연산:

```ts
/**
 * 룰·빈 단계 노드 하나의 외관을 바꾼다(S1). 조각의 값은 그 칸을, null 은 칸 지우기, 조각이 null 이면 전부 지우기([외관 초기화]).
 * 범위 밖 크기는 자르고 기본값과 같은 칸은 두지 않는다. 위치는 건드리지 않는다 — 크기를 바꾸며 그린 위치를 고정하는 것은 `restyleNode`(flow-layout).
 */
export function setNodeStyle(f: EditFlow, nodeId: string, patch: NodeStylePatch | null): EditResult {
  const n = findNode(f, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (!isStep(n.kind)) return fail("룰·빈 단계 노드만 외관을 바꾼다");
  if (patch && [patch.w, patch.h].some((v) => v != null && !finite(v))) return fail("노드 크기가 올바르지 않다");
  const g = clone(f);
  const styles: Record<string, NodeStyle> = { ...g.view.styles };
  const next = mergeNodeStyle(styles[nodeId], patch);
  if (next) styles[nodeId] = next;
  else delete styles[nodeId];
  g.view = { ...g.view, styles };
  return done(g);
}
```

`notFound` 는 파일 아래쪽 3단계 영역에 `const` 로 있다 — `setNodeStyle` 을 그보다 아래(파일 끝)에 두거나 `notFound` 를 위로 올린다(호이스팅되지 않는 `const` 다). 파일 끝에 두는 쪽을 택한다.

- [ ] **Step 5: 팔레트 토큰·아이콘 지도 만들기**

`styles/node-style.ts`:

```ts
/**
 * 룰·빈 단계 노드 외관(S1) — 팔레트 토큰(이 파일 머리), 노드 규칙(Task 2), 크기 손잡이(Task 4).
 * 패널 색 견본이 캔버스 밖에서도 같은 토큰을 쓰도록 `:root` 에 둔다. 값은 shared 의미 토큰을 color-mix 로 섞는다(16진수·rgb() 금지).
 * 어두운 화면 값은 Mantine 이 붙이는 `[data-mantine-color-scheme="dark"]` 에 둔다 — 앱은 지금 밝은 테마만 쓴다(계획 Ruling 4).
 * `:root` 의 사용자 정의 속성은 `:root` 에서 풀리므로 `.rsf-canvas` 에만 있는 `--rsf-node-bg`·`--rsf-border` 를 섞지 않는다.
 */
const PALETTE = `
:root {
  --rsf-c-blue-border: var(--color-primary);
  --rsf-c-blue-bg: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
  --rsf-c-green-border: var(--color-success);
  --rsf-c-green-bg: color-mix(in srgb, var(--color-success) 12%, var(--color-bg));
  --rsf-c-yellow-border: var(--color-warning);
  --rsf-c-yellow-bg: var(--color-input-cell);
  --rsf-c-orange-border: color-mix(in srgb, var(--color-warning) 55%, var(--color-danger));
  --rsf-c-orange-bg: color-mix(in srgb, var(--color-warning) 7%, color-mix(in srgb, var(--color-danger) 5%, var(--color-bg)));
  --rsf-c-red-border: var(--color-danger);
  --rsf-c-red-bg: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg));
  --rsf-c-purple-border: color-mix(in srgb, var(--color-primary) 50%, var(--color-danger));
  --rsf-c-purple-bg: color-mix(in srgb, var(--color-primary) 6%, color-mix(in srgb, var(--color-danger) 6%, var(--color-bg)));
}
:root[data-mantine-color-scheme="dark"] {
  --rsf-c-blue-border: color-mix(in srgb, var(--color-primary) 65%, white);
  --rsf-c-blue-bg: color-mix(in srgb, var(--color-primary) 30%, var(--mantine-color-body));
  --rsf-c-green-border: color-mix(in srgb, var(--color-success) 65%, white);
  --rsf-c-green-bg: color-mix(in srgb, var(--color-success) 30%, var(--mantine-color-body));
  --rsf-c-yellow-border: color-mix(in srgb, var(--color-warning) 65%, white);
  --rsf-c-yellow-bg: color-mix(in srgb, var(--color-warning) 30%, var(--mantine-color-body));
  --rsf-c-orange-border: color-mix(in srgb, color-mix(in srgb, var(--color-warning) 55%, var(--color-danger)) 65%, white);
  --rsf-c-orange-bg: color-mix(in srgb, color-mix(in srgb, var(--color-warning) 55%, var(--color-danger)) 30%, var(--mantine-color-body));
  --rsf-c-red-border: color-mix(in srgb, var(--color-danger) 65%, white);
  --rsf-c-red-bg: color-mix(in srgb, var(--color-danger) 30%, var(--mantine-color-body));
  --rsf-c-purple-border: color-mix(in srgb, color-mix(in srgb, var(--color-primary) 50%, var(--color-danger)) 65%, white);
  --rsf-c-purple-bg: color-mix(in srgb, color-mix(in srgb, var(--color-primary) 50%, var(--color-danger)) 30%, var(--mantine-color-body));
}
`;

export const NODE_STYLE_CSS = PALETTE;
```

`rsf-styles.ts` — import 를 더하고 배열 맨 끝(TASK_CSS 뒤)에 `NODE_STYLE_CSS` 를 둔다(색 규칙이 base 뒤에 와야 한다, Ruling 7). 머리 주석 영역 목록에 「node-style 노드 외관」을 더한다.

`canvas/node-icons.ts`:

```ts
/** 외관 아이콘 키 → Tabler 아이콘(S1 §2.4). 노드(Task 2)와 패널(Task 3)이 함께 쓴다. */
import {
  IconAlertTriangle, IconCalculator, IconCalendar, IconChecks, IconCoin, IconDatabase, IconFilter, IconFlag, IconRuler2, IconScale,
  IconSettings, IconTruck, type TablerIcon,
} from "@tabler/icons-react";

import type { NodeIcon } from "../node-style";

export const NODE_ICON_COMPONENT: Readonly<Record<NodeIcon, TablerIcon>> = {
  calc: IconCalculator, check: IconChecks, filter: IconFilter, calendar: IconCalendar, money: IconCoin, alert: IconAlertTriangle,
  database: IconDatabase, ruler: IconRuler2, scale: IconScale, truck: IconTruck, settings: IconSettings, flag: IconFlag,
};
```

- [ ] **Step 6: 모델 시험 통과 확인** — Step 2 명령. `autoArrange` 시험은 Step 9 의 `flow-layout.ts` 변경 없이도 통과한다(`clone` 이 외관을 지킨다). Expected: PASS.

- [ ] **Step 7: 배치 실패 시험 — `tests/dme/ruleSetEdit/node-style-layout.test.ts`**

```ts
// 외관 옵션(S1) — 노드별 크기(nodeSize·nodeSizeOf), 자동 배치·겹침 풀기·맞춤·놓기 대상, 크기 바꿀 때 그린 위치 고정(restyleNode).
import { describe, expect, it } from "vitest";

import { alignNodes } from "../../../pages/dme/ruleSetEdit/canvas/align";
import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import {
  addBranch, flowJsonOf, insertSplit, insertTask, setNodeStyle, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import {
  NODE_SIZE, autoLayout, drawnPositions, foldOffsetX, nodeSize, nodeSizeOf, restyleNode, spreadLanes,
} from "../../../pages/dme/ruleSetEdit/flow-layout";
import { nearestEdge, nodeAtPoint } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { NODE_H_MIN, NODE_W_MIN, type NodeStyle } from "../../../pages/dme/ruleSetEdit/node-style";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const base = () => toEditFlow(null, ["NL_A", "NL_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));
type Box = { id: string; x: number; y: number; w: number; h: number };
const boxesOf = (f: EditFlow, pos: Record<string, FlowPos>): Box[] => f.nodes.map((n) => ({ id: n.id, ...pos[n.id], ...nodeSizeOf(f, n) }));
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function expectNoOverlap(f: EditFlow, pos: Record<string, FlowPos>) {
  const bs = boxesOf(f, pos);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlap(bs[i], bs[j]), `${bs[i].id}×${bs[j].id}`).toBe(false);
}
/** start → r1 → if1{ 갈래1 · 갈래2 · 그 외 — 갈래마다 빈 단계 하나 } → m1 → r2 → end. lanes 는 갈래 순서의 빈 단계 ID. */
function threeLanes(): { f: EditFlow; lanes: string[] } {
  let f = ok(addBranch(ok(insertSplit(base(), "e2", "IF")), "if1"));
  const key = (e: EditFlow["edges"][number]) => (e.otherwise ? Number.POSITIVE_INFINITY : (e.order ?? 0));
  const branchIds = f.edges.filter((e) => e.from === "if1").sort((a, b) => key(a) - key(b)).map((e) => e.id);
  for (const id of branchIds) f = ok(insertTask(f, id));
  return { f, lanes: branchIds.map((id) => f.edges.find((e) => e.id === id)!.to) };
}

describe("nodeSize·nodeSizeOf(S-D5)", () => {
  it("기본은 종류별 크기, RULE·TASK 는 저장한 w·h, 다른 종류는 외관을 보지 않고, 접힌 분기는 룰 기본 크기", () => {
    expect(NODE_SIZE.RULE).toEqual({ w: NODE_W_MIN, h: NODE_H_MIN });
    expect(nodeSize("RULE")).toEqual({ w: 232, h: 68 });
    expect(nodeSize("RULE", { w: 300 })).toEqual({ w: 300, h: 68 });
    expect(nodeSize("TASK", { h: 120 })).toEqual({ w: 232, h: 120 });
    expect(nodeSize("IF", { w: 500 } as NodeStyle)).toEqual(NODE_SIZE.IF);
    expect(nodeSize("IF", undefined, true)).toEqual(NODE_SIZE.RULE);
    const f = styled(base(), "r1", { w: 400, h: 100 });
    expect(nodeSizeOf(f, { id: "r1", kind: "RULE" })).toEqual({ w: 400, h: 100 });
    expect(nodeSizeOf(f, { id: "r2", kind: "RULE" })).toEqual({ w: 232, h: 68 });
  });
});

describe("자동 배치 — 큰 노드(Review Focus 3)", () => {
  it("한 줄 흐름 — 큰 노드 아래 노드가 큰 높이만큼 내려가고 가운데가 맞는다", () => {
    const f = styled(base(), "r1", { w: 640, h: 320 });
    const p = autoLayout(f);
    expect(p.r2.y).toBeGreaterThanOrEqual(p.r1.y + 320);
    expect(p.r1.x + 320).toBe(p.r2.x + 116); // 가운데 x 가 같다
    expectNoOverlap(f, p);
  });

  it.each([0, 1, 2])("IF 세 갈래 — %i 번째 갈래 노드가 640×200 이어도 겹치지 않고 갈래 순서(왼→오)를 지킨다", (wide) => {
    const { f, lanes } = threeLanes();
    const g = styled(f, lanes[wide], { w: 640, h: 200 });
    const p = autoLayout(g);
    expectNoOverlap(g, p);
    const cx = (id: string) => p[id].x + nodeSizeOf(g, g.nodes.find((n) => n.id === id)!).w / 2;
    expect(cx(lanes[0])).toBeLessThan(cx(lanes[1]));
    expect(cx(lanes[1])).toBeLessThan(cx(lanes[2]));
  });

  it("기본 크기 세 갈래도 겹치지 않는다(배치가 바뀌지 않음은 기존 branch-order·flow-layout 시험이 그대로 지킨다)", () => {
    const { f } = threeLanes();
    expectNoOverlap(f, autoLayout(f));
  });

  it("spreadLanes — 갈래 경계는 겹쳐도 같은 높이의 노드가 떨어져 있으면 움직이지 않는다(중첩 분기가 든 갈래)", () => {
    // 왼쪽 갈래: 위층 룰(136~368, y 0~68) + 아래층 중첩 분기의 넓은 줄(0~504, y 100~168). 오른쪽 갈래: 위층 룰(420~652, y 0~68).
    const left = { at: 252, boxes: [{ x1: 136, x2: 368, y1: 0, y2: 68 }, { x1: 0, x2: 504, y1: 100, y2: 168 }] };
    const right = { at: 536, boxes: [{ x1: 420, x2: 652, y1: 0, y2: 68 }] };
    expect(spreadLanes([left, right], [252, 536], 40)).toEqual([252, 536]);
  });

  it("spreadLanes — 같은 높이에서 40 보다 가까우면 오른쪽 갈래를 밀고 전체 가운데를 되돌린다", () => {
    const wide = { at: 320, boxes: [{ x1: 0, x2: 640, y1: 0, y2: 200 }] };
    const narrow = { at: 416, boxes: [{ x1: 300, x2: 532, y1: 0, y2: 68 }] };
    const out = spreadLanes([wide, narrow], [320, 416], 40);
    expect(out).toEqual([130, 606]); // 380 밀고 가운데(368)로 되돌림
    expect(640 + (out[0] - 320) + 40).toBe(300 + (out[1] - 416)); // 사이가 꼭 40
  });

  it("중첩 분기가 든 갈래가 있는 기본 크기 흐름도 겹치지 않는다", () => {
    const { f, lanes } = threeLanes();
    const inner = f.edges.find((e) => e.to === lanes[0])!.id; // 첫 갈래 빈 단계로 들어가는 선
    const g = ok(insertSplit(f, inner, "IF"));
    expectNoOverlap(g, autoLayout(g));
  });

  it("겹침 풀기(drawnPositions)는 노드별 크기로 본다 — 고정한 큰 노드에 겹친 자동 노드가 비킨다", () => {
    const f0 = styled(base(), "r1", { w: 640, h: 300 });
    const auto = autoLayout(f0);
    const f = setPositions(f0, { r1: auto.r2 }); // 큰 r1 을 r2 자리에 고정
    const d = drawnPositions(f);
    const box = (id: string): Box => ({ id, ...d[id], ...nodeSizeOf(f, f.nodes.find((n) => n.id === id)!) });
    expect(overlap(box("r1"), box("r2"))).toBe(false);
  });
});

describe("크기를 쓰는 다른 계산", () => {
  it("룰 줄 놓기 대상(nodeAtPoint)·선 중점(nearestEdge)이 노드별 크기를 쓴다", () => {
    const f = styled(base(), "r1", { w: 400, h: 100 });
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 500 } };
    const kinds = new Set(["RULE", "TASK"]);
    expect(nodeAtPoint(f, pos, { x: 350, y: 190 }, kinds)).toBe("r1");
    expect(nodeAtPoint(base(), pos, { x: 350, y: 190 }, kinds)).toBeNull();
    // e2(r1→r2) 중점: x = (200 + 116) / 2 = 158, y = (100 + 100 + 300) / 2 = 250
    expect(nearestEdge(f, pos, { x: 158, y: 250 }, 1)).toBe("e2");
  });

  it("오른쪽 맞춤(alignNodes)이 노드별 너비를 쓴다", () => {
    const f = setPositions(styled(base(), "r1", { w: 400 }), { r1: { x: 0, y: 0 }, r2: { x: 0, y: 200 } });
    const g = alignNodes(f, ["r1", "r2"], "right", drawnPositions(f), {});
    expect(g.view.positions.r2).toEqual({ x: 168, y: 200 });
  });
});

describe("restyleNode — 크기가 바뀌면 그린 위치 전부를 저장 위치로(S-D6)", () => {
  it("크기를 바꾸면 그린 위치를 모두 적고 이웃 자리는 그대로다", () => {
    const f = base();
    const drawn = drawnPositions(f);
    const g = ok(restyleNode(f, "r1", { w: 500 }, drawn));
    expect(g.view.styles).toEqual({ r1: { w: 500 } });
    expect(g.view.positions).toEqual(drawn);
    expect(drawnPositions(g).r2).toEqual(drawn.r2);
  });

  it("크기가 그대로면(색만·같은 크기) 위치를 적지 않는다 — 되돌리기 칸이 헛돌지 않는다", () => {
    const f = base();
    expect(ok(restyleNode(f, "r1", { color: "red" }, drawnPositions(f))).view.positions).toEqual({});
    const big = styled(f, "r1", { w: 500 });
    expect(flowJsonOf(ok(restyleNode(big, "r1", { w: 500 }, drawnPositions(big))))).toBe(flowJsonOf(big));
  });

  it("[외관 초기화]·[기본 크기] — w·h 를 실제로 지웠을 때만 위치를 적는다", () => {
    const f = styled(base(), "r1", { color: "blue" });
    expect(ok(restyleNode(f, "r1", null, drawnPositions(f))).view.positions).toEqual({});
    const g = styled(base(), "r1", { color: "blue", h: 120 });
    const r = ok(restyleNode(g, "r1", null, drawnPositions(g)));
    expect("styles" in r.view).toBe(false);
    expect(Object.keys(r.view.positions).sort()).toEqual(["end", "r1", "r2", "start"]);
    const s = ok(restyleNode(g, "r1", { w: null, h: null }, drawnPositions(g)));
    expect(s.view.styles).toEqual({ r1: { color: "blue" } });
    expect(Object.keys(s.view.positions)).toHaveLength(4);
  });

  it("그린 위치가 없으면(캔버스 없음) 외관만 바꾼다. 거부는 그대로 올린다", () => {
    expect(ok(restyleNode(base(), "r1", { w: 400 })).view.positions).toEqual({});
    expect(restyleNode(base(), "start", { w: 400 }).ok).toBe(false);
  });

  it("접힌 분기는 제 크기 기준 좌표(+foldOffsetX)로 적는다", () => {
    const f = ok(insertSplit(base(), "e2", "IF"));
    const v = collapseView(f, new Set(["if1"]));
    const drawn = drawnPositions(v.flow, v.blocks);
    const g = ok(restyleNode(f, "r1", { w: 400 }, drawn, v.blocks));
    expect(g.view.positions.if1).toEqual({ x: drawn.if1.x + foldOffsetX("IF"), y: drawn.if1.y });
  });
});
```

- [ ] **Step 8: 실패 확인** — `… vitest run tests/dme/ruleSetEdit/node-style-layout.test.ts` → FAIL(`nodeSize` 등 없음).

- [ ] **Step 9: `flow-layout.ts` 고치기**

import 를 바꾼다:

```ts
import { clearLabels, clearRoutes, setNodeStyle, setPositions, type EditFlow, type EditResult, type FlowPos } from "./flow-edit";
import { parseFlow, type Seq } from "./flow-model";
import { STYLED_KINDS, type NodeSize, type NodeStyle, type NodeStylePatch } from "./node-style";
```

`NODE_SIZE` 아래에 더한다:

```ts
/** 외관(view.styles)을 읽을 수 있는 흐름 — EditFlow, 또는 view 없는 RuleSetFlow. */
export type StyledFlow = { view?: { styles?: Readonly<Record<string, NodeStyle>> } };

/**
 * 노드 하나의 그린 크기(S-D5) — 종류별 크기, RULE·TASK 는 외관의 w·h, 접힌 분기(folded)는 룰 기본 크기.
 * 반복문에서 흐름을 다시 찾지 않도록 종류·외관·접힘을 받는다.
 */
export function nodeSize(kind: FlowNodeKind, style?: NodeStyle | null, folded = false): NodeSize {
  if (folded) return NODE_SIZE.RULE;
  const base = NODE_SIZE[kind];
  if (!style || !STYLED_KINDS.has(kind)) return base;
  return { w: style.w ?? base.w, h: style.h ?? base.h };
}
/** 흐름 노드 하나의 그린 크기 — blocks 에 든 분기(접힌 블록)는 룰 기본 크기. */
export function nodeSizeOf(f: StyledFlow, n: { id: string; kind: FlowNodeKind }, blocks: Readonly<Record<string, unknown>> = {}): NodeSize {
  return nodeSize(n.kind, f.view?.styles?.[n.id], !!blocks[n.id]);
}
```

`autoLayout` — 크기를 한 번만 재어 지도에 둔다(`orderBranches` 의 `widthOf` 가 노드마다 `.find` 하던 것도 없앤다):

```ts
export function autoLayout(f: RuleSetFlow & StyledFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const nodes = f.nodes ?? [];
  const size = new Map(nodes.map((n) => [n.id, nodeSizeOf(f, n, blocks)] as const));
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODESEP, ranksep: 46 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    const s = size.get(n.id)!;
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  for (const e of f.edges ?? []) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const cx = new Map<string, number>();
  for (const n of nodes) cx.set(n.id, g.node(n.id).x);
  orderBranches(f, g, cx, (id) => size.get(id)!);
  const out: Record<string, FlowPos> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    const s = size.get(n.id)!;
    out[n.id] = { x: Math.round(cx.get(n.id)! - s.w / 2), y: Math.round(p.y - s.h / 2) };
  }
  return out;
}
```

`const NODESEP = 40;` 을 `autoLayout` 위에 두고 `g.setGraph` 의 40 을 바꾼다.

`orderBranches` — 네 번째 인자를 `widthOf` 에서 노드 크기 `sizeOf` 로 바꾸고(`autoLayout` 은 `orderBranches(f, g, cx, (id) => size.get(id)!)` 로 부른다), 갈래마다 노드 상자(세로는 dagre 자리)를 모아 옮긴 자리를 `spreadLanes` 로 벌린다:

```ts
function orderBranches(f: RuleSetFlow, g: InstanceType<typeof dagre.graphlib.Graph>, cx: Map<string, number>, sizeOf: (id: string) => NodeSize) {
  // … (tree·visit 그대로)
      const boxOf = (id: string): LaneBox => {
        const s = sizeOf(id);
        const x = cx.get(id)!;
        const y = g.node(id).y;
        return { x1: x - s.w / 2, x2: x + s.w / 2, y1: y - s.h / 2, y2: y + s.h / 2 };
      };
      const lanes = b.branches.map((br) => {
        const ids = bodyIds(br.body).filter((id) => cx.has(id));
        if (ids.length > 0) {
          const boxes = ids.map(boxOf);
          return { ids, at: (Math.min(...boxes.map((x) => x.x1)) + Math.max(...boxes.map((x) => x.x2))) / 2, boxes };
        }
        const pts = (g.edge(b.nodeId, b.mergeId) as { points?: { x: number }[] } | undefined)?.points ?? [];
        return { ids, at: pts.length > 0 ? pts[Math.floor(pts.length / 2)].x : cx.get(b.nodeId)!, boxes: [] as LaneBox[] };
      });
      const slots = spreadLanes(lanes, lanes.map((l) => l.at).sort((a, c) => a - c), NODESEP);
      lanes.forEach((l, i) => {
        const d = slots[i] - l.at;
        if (d !== 0) for (const id of l.ids) cx.set(id, cx.get(id)! + d);
      });
```

`orderBranches` 아래에 더한다(시험이 직접 부르도록 내보낸다):

```ts
/** 갈래 겹침 판정용 노드 상자(흐름 좌표, 가운데 x 는 갈래를 옮기기 전 자리). */
export interface LaneBox {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}
/**
 * 갈래(왼쪽부터, 각자 옮기기 전 가운데 at·노드 상자)를 slots 자리로 옮길 때, **세로 범위가 겹치는**(같은 높이의) 두 노드가 gap 보다 가까우면
 * 오른쪽 갈래와 그 뒤 갈래들을 민 뒤 전체 자리 가운데를 처음 자리 가운데로 되돌린다(외관 S1 — 폭이 다른 갈래를 다른 갈래 자리에 옮기면 겹칠 수 있다, 계획 Ruling 10).
 * 갈래 경계 상자끼리가 아니라 노드끼리 견준다 — 중첩 분기가 든 갈래는 아래 층에서만 넓으므로 경계 상자로 견주면 겹치지 않는 기본 배치까지 바뀐다.
 * 빈 갈래(상자 없음)는 함께 밀릴 뿐 견주지 않는다. 움직일 것이 없으면 slots 를 그대로 돌려준다(기본 크기 흐름의 배치 불변).
 */
export function spreadLanes(lanes: readonly { at: number; boxes: readonly LaneBox[] }[], slots: readonly number[], gap: number): number[] {
  const out = [...slots];
  let moved = false;
  for (let i = 1; i < lanes.length; i++) {
    if (lanes[i].boxes.length === 0) continue;
    const di = out[i] - lanes[i].at;
    let need = 0;
    for (let j = 0; j < i; j++) {
      const dj = out[j] - lanes[j].at;
      for (const a of lanes[j].boxes) {
        for (const b of lanes[i].boxes) {
          if (a.y1 < b.y2 && b.y1 < a.y2) need = Math.max(need, a.x2 + dj + gap - (b.x1 + di));
        }
      }
    }
    if (need > 0.5) { // dagre 좌표의 소수 오차로 움직이지 않게
      for (let k = i; k < out.length; k++) out[k] += need;
      moved = true;
    }
  }
  if (!moved) return out;
  const mid = (xs: readonly number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;
  const d = mid(slots) - mid(out);
  return out.map((x) => x + d);
}
```

`import { STYLED_KINDS, type NodeSize, … } from "./node-style";` 의 `NodeSize` 를 여기서도 쓴다.

주의: 이 계산은 같은 높이의 노드가 실제로 가까울 때만 움직이므로 기존 `flow-layout.test.ts`·`branch-order` 관련 배치 시험은 기대값을 고치지 않고 통과해야 한다. 하나라도 깨지면 기대값을 고치지 말고, 그 사례의 이전·이후 상자를 적어 DONE_WITH_CONCERNS 로 보고한다(그 사례는 예전에도 같은 높이에서 겹치던 배치다).

`drawnPositions` 의 상자:

```ts
  const boxes = (f.nodes ?? []).map((n) => ({ id: n.id, ...nodeSizeOf(f, n, blocks) }));
```

`shiftSpace` 아래에 더한다:

```ts
/** 크기·자리 바꾸기에 쓰는 그린 위치 묶음 — 캔버스가 정렬 출처(alignSourceRef)로 올린다(page 의 layoutSource). */
export interface NodeLayoutSource {
  drawn: Record<string, FlowPos>;
  blocks: SpaceBlocks;
}

/** 그린 위치 전부를 저장 위치로 적는다 — 접힌 분기는 제 크기 기준 좌표(+foldOffsetX). 그린 위치가 없는 노드는 건드리지 않는다. */
export function pinDrawn(f: EditFlow, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {}): EditFlow {
  const pos: Record<string, FlowPos> = {};
  for (const n of f.nodes ?? []) {
    const p = drawn[n.id];
    if (!p) continue;
    pos[n.id] = blocks[n.id] ? { x: p.x + foldOffsetX(n.kind), y: p.y } : { x: p.x, y: p.y };
  }
  return Object.keys(pos).length > 0 ? setPositions(f, pos) : f;
}

/**
 * 외관 편집(패널·크기 손잡이 공통, S1). `setNodeStyle` 결과에서 그 노드의 그린 크기가 바뀌었으면 그때 그린 위치 전부를 저장 위치로 적는다(S-D6) —
 * 저장 위치가 없는 노드는 자동 배치가 다시 놓으므로 한 노드 크기만 바꿔도 이웃이 밀리기 때문이다(`shiftSpace` 와 같은 방식).
 * 크기가 그대로면(색·아이콘만, 같은 크기) 위치를 적지 않는다 — 저장 글자가 바뀌지 않아 되돌리기 칸이 헛돌지 않는다. 커져서 이웃과 겹치면 겹친 채 둔다.
 */
export function restyleNode(
  f: EditFlow, nodeId: string, patch: NodeStylePatch | null, drawn: Readonly<Record<string, FlowPos>> = {}, blocks: SpaceBlocks = {},
): EditResult {
  const r = setNodeStyle(f, nodeId, patch);
  if (!r.ok) return r;
  const n = f.nodes.find((x) => x.id === nodeId)!;
  const before = nodeSizeOf(f, n);
  const after = nodeSizeOf(r.flow, n);
  if (before.w === after.w && before.h === after.h) return r;
  return { ok: true, flow: pinDrawn(r.flow, drawn, blocks) };
}
```

- [ ] **Step 10: 나머지 `NODE_SIZE[...]` 사용처 바꾸기** — `grep -rn "NODE_SIZE" src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 남은 곳을 확인하며 아래 표대로 바꾼다. **접힘을 보는지(blocks)는 지금 사용처의 뜻을 그대로 둔다**(바뀌는 곳은 groupBox 하나, Ruling 8).

| 파일:줄(지금) | 지금 식 | 바꿀 식 | 접힘 |
|---|---|---|---|
| `flow-vars.ts:41-67` `nearestEdge` | `const kind = new Map(... n.kind)` … `NODE_SIZE[ka]`·`NODE_SIZE[kb]` | `const size = new Map((f.nodes ?? []).map((n) => [n.id, nodeSizeOf(f, n)] as const));` 뒤 `const sa = size.get(e.from); const sb = size.get(e.to); if (!a \|\| !b \|\| !sa \|\| !sb) continue;` `mx = (a.x + sa.w / 2 + b.x + sb.w / 2) / 2`, `my = (a.y + sa.h + b.y) / 2` | 보지 않음(그대로) |
| `flow-vars.ts` `nearestEdge`·`dropTargetAt`·`nodeAtPoint` 의 `f: RuleSetFlow` | | `f: RuleSetFlow & StyledFlow` | — |
| `flow-vars.ts:114` `nodeAtPoint` | `const s = NODE_SIZE[n.kind];` | `const s = nodeSizeOf(f, n);` | 보지 않음(그대로) |
| `state/useEditActions.ts:134-149` `centerOf` | `kinds` 지도 + `NODE_SIZE[k]` | `for (const n of v.flow.nodes) { const p = pos[n.id]; if (!p) continue; const s = nodeSizeOf(v.flow, n, v.blocks); x1 = …; x2 = Math.max(x2, p.x + s.w); y2 = Math.max(y2, p.y + s.h); }` | 봄(그대로) |
| `state/useEditActions.ts:194` `placeNote` | `NODE_SIZE[v.blocks[selNode.id] ? "RULE" : selNode.kind].w` | `nodeSizeOf(v.flow, selNode, v.blocks).w` | 봄(그대로) |
| `canvas/align.ts:45` `itemsOf` | `NODE_SIZE[block ? "RULE" : n.kind]` | `nodeSizeOf(f, n, blocks)` | 봄(그대로) |
| `canvas/align.ts:7` 머리 주석 | 「종류별 `NODE_SIZE`」 | 「노드별 크기 `nodeSizeOf`(외관 w·h, 접힌 분기는 룰 크기)」 | — |
| `canvas/FlowCanvas.tsx:992` `groupBox` | `kinds: Map<string, keyof typeof NODE_SIZE>` … `NODE_SIZE[k]` | `sizes: ReadonlyMap<string, NodeSize>` … `const s = sizes.get(id); if (!p \|\| !s) continue;` | **바뀜**: 접힌 분기를 그린 상자(룰 크기)로(Ruling 8) |
| `canvas/FlowCanvas.tsx:1124` 노드 memo `kinds` | `new Map(vflow.nodes.map((n) => [n.id, n.kind]))` | `const sizes = new Map(vflow.nodes.map((n) => [n.id, nodeSizeOf(vflow, n, view.blocks)] as const));` → `groupBox(g.nodeIds, pos, sizes, pad)` | — |
| `canvas/FlowCanvas.tsx:1141` 노드 크기 | `NODE_SIZE[block ? "RULE" : n.kind]` | `sizes.get(n.id)!` | 봄(그대로) |
| `canvas/FlowCanvas.tsx:1160` 노드 객체 | `measured: measured[n.id]`, `handles: handlesOf(block ? "RULE" : n.kind)` | `measured: staleMeasure(measured[n.id], s) ? { width: s.w, height: s.h } : measured[n.id]`, `handles: handlesOf(block ? "RULE" : n.kind, s)` | — |
| `canvas/FlowCanvas.tsx:1569` 포커스 이동 | `NODE_SIZE[view.blocks[target] ? "RULE" : n.kind]` | `nodeSizeOf(vflow, n, view.blocks)` | 봄(그대로) |
| `canvas/nodes.tsx:387` `handlesOf` | `function handlesOf(kind)` … `const { w, h } = NODE_SIZE[kind];` | `function handlesOf(kind: FlowNode["kind"], size: NodeSize = NODE_SIZE[kind])` … `const { w, h } = size;` | — |

`FlowCanvas.tsx` 에 도우미를 둔다(`groupBox` 위):

```ts
/** 캐시한 잰 크기가 새 크기와 다른가 — getNodeDimensions 는 measured 를 width 보다 먼저 보므로 옛 값을 넘기면 옛 크기로 그린다(계획 Ruling 9). */
const staleMeasure = (m: Measured | undefined, s: NodeSize) => !!m && (m.width !== s.w || m.height !== s.h);
```

노드 데이터에 외관을 싣는다(노드 memo 의 `data` 객체에 한 줄 — 접힌 상자는 외관 없음):

```ts
        style: block ? undefined : vflow.view.styles?.[n.id],
```

`canvas/nodes.tsx` 의 `FlowNodeData` 끝에:

```ts
  /** 외관(S1) — RULE·TASK 이고 접히지 않았을 때만. 그리기는 계획 Task 2. */
  style?: NodeStyle;
```

import: `nodes.tsx` 에 `import type { NodeSize, NodeStyle } from "../node-style";`, `FlowCanvas.tsx` 에 `nodeSizeOf` 와 `type NodeSize`, `flow-vars.ts`·`useEditActions.ts`·`align.ts` 에 `nodeSizeOf`(`flow-vars.ts` 는 `type StyledFlow` 도). 쓰지 않게 된 `NODE_SIZE` import 는 지운다(`nodes.tsx` 는 `handlesOf` 기본값으로 계속 쓴다).

`FlowCanvas.tsx` 머리 주석 끝에 문단을 더한다:

```
 * 노드 외관(S1): RULE·TASK 노드는 `view.styles` 의 크기로 그린다 — 크기는 모두 `nodeSizeOf`(접힌 분기는 룰 크기)로 재고, 노드 데이터 `style` 로 색·아이콘·모양·표시 항목을 넘긴다.
 * 배치 memo(`basePos`)는 표시 흐름(vflow) 참조에 묶여 있어 외관만 바뀐 편집에도 다시 돈다(편집은 늘 새 흐름 객체다).
```

- [ ] **Step 11: 배치 시험 통과 확인** — Step 8 명령 → PASS. 이어 `… vitest run tests/dme/ruleSetEdit/flow-layout.test.ts tests/dme/ruleSetEdit/branch-order.test.ts tests/dme/ruleSetEdit/flow-vars.test.ts tests/dme/ruleSetEdit/task-node.test.ts tests/dme/ruleSetEdit/align-unit.test.ts` → PASS(기대값을 고치지 않는다).

- [ ] **Step 12: 캔버스 실패 시험 — `tests/dme/ruleSetEdit/node-style-size.test.ts`**

```ts
/** @vitest-environment happy-dom */

// 외관 옵션(S1) — 캔버스가 노드별 크기로 노드 상자·선 끝·그룹 틀을 그리고, 외관만 바뀐 흐름에도 배치가 다시 돈다(Local-Rules §19).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const layout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (layout.calls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { addGroup, insertSplit, setNodeStyle, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoLayout } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const base = () => toEditFlow(null, ["NZ_A", "NZ_B"]);
/** start(0,0) · r1(0,150) · r2(0,300) · end(0,450) 고정. */
const pinned = (f: EditFlow) => setPositions(f, { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  layout.calls = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: base(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
const wrap = (el: ReturnType<typeof createElement>) =>
  createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, el));
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(wrap(createElement(FlowCanvas, p)));
  });
  await flush();
}
/** React Flow 노드 감싸개의 자리·크기. */
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const ends = (edgeId: string) => {
  const d = document.querySelector(`.react-flow__edge[data-id="${edgeId}"] path.react-flow__edge-path`)!.getAttribute("d")!;
  const nums = (s: string) => s.trim().split(/[\s,]+/).map(Number);
  const first = nums(/^M\s*([-\d.]+[\s,]+[-\d.]+)/.exec(d)![1]);
  const last = nums(/L\s*([-\d.]+[\s,]+[-\d.]+)\s*$/.exec(d)![1]);
  return { from: { x: first[0], y: first[1] }, to: { x: last[0], y: last[1] } };
};

describe("캔버스 — 노드별 크기(S-D5)", () => {
  it("노드 상자와 선 끝(아래 가운데 → 위 가운데)이 외관 크기를 따른다", async () => {
    await draw(props({ flow: ok(setNodeStyle(pinned(base()), "r1", { w: 400, h: 100 })) }));
    expect(box("r1")).toEqual({ x: 0, y: 150, w: 400, h: 100 });
    expect(ends("e2").from).toEqual({ x: 200, y: 150 + 100 + 4 }); // 8px 연결점의 바깥 가장자리(4px)
    expect(box("r2")).toEqual({ x: 0, y: 300, w: 232, h: 68 });
  });

  it("그룹 틀은 노드별 크기로 잰다", async () => {
    const f = ok(addGroup(ok(setNodeStyle(pinned(base()), "r1", { w: 400, h: 100 })), ["r1"], "묶음"));
    await draw(props({ flow: f }));
    expect(box("g1")).toEqual({ x: -16, y: 134, w: 432, h: 132 });
  });

  it("접힌 분기를 담은 그룹 틀은 그린 접힌 상자(룰 크기)로 잰다(계획 Ruling 8)", async () => {
    const f = ok(addGroup(ok(insertSplit(base(), "e2", "IF")), ["if1"], "분기"));
    await draw(props({ flow: f, collapsed: new Set(["if1"]) }));
    const b = box("if1");
    expect(box("g1")).toEqual({ x: b.x - 16, y: b.y - 16, w: 232 + 32, h: 68 + 32 });
  });

  it("memo — 다른 props 는 같은 참조로 두고 외관만 바꾼 흐름을 넘겨도 새 크기로 그리고 자동 배치가 다시 돈다(Review Focus 2)", async () => {
    const p = props();
    await draw(p);
    expect(box("r1").w).toBe(232);
    const calls = layout.calls;
    const wide = ok(setNodeStyle(p.flow, "r1", { w: 640 }));
    await draw({ ...p, flow: wide });
    expect(layout.calls).toBeGreaterThan(calls);
    expect(box("r1").w).toBe(640);
    expect(box("r1").x).toBe(autoLayout(wide).r1.x);
    expect(box("r2").x).toBe(autoLayout(wide).r2.x);
  });
});
```

- [ ] **Step 13: 실패 확인 → 통과 확인** — Step 10 을 끝내기 전이면 `… vitest run tests/dme/ruleSetEdit/node-style-size.test.ts` → FAIL(상자가 232). Step 10 뒤 → PASS.

- [ ] **Step 14: 전체·타입·audit** — `cd src/frontend/m-mdm && rtk proxy pnpm run test` → 기준선 + 새 시험 수, 실패 0(특히 `flow-edit`·`flow-edit-3`·`rule-set-edit-page`·`group-pad`·`flow-connect`·`snap-canvas`·`space-*`·`align-*`·`browser-fix` 는 기대값을 고치지 않는다). `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm run lint` → 오류 0. audit 두 개를 바꾼 `.ts`·`.tsx` 전부에 → 0건. `.css` import grep 0건.

- [ ] **Step 15: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/node-style.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/node-icons.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/align.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-layout.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-size.test.ts
/usr/bin/git commit -m "feat(m-mdm): 룰 노드 외관 저장 형식과 노드별 크기를 배치·그룹·선 계산에 넣는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/node-style.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/node-icons.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-vars.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/align.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/rsf-styles.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-layout.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-size.test.ts
```

---

### Task 2: 노드 그리기 — 색·아이콘·모양·표시 항목·제목 여러 줄

**모델:** sonnet — 한 컴포넌트 파일과 CSS 상수.

**Files:**
- Modify: `canvas/nodes.tsx`(`RuleBody`·`TaskBody`·`FlowNodeView`, 새 `titleLines`·`TitleRow`)
- Modify: `styles/node-style.ts`(`NODE_STYLE_CSS` 에 노드 규칙 덧붙임)
- Test(새): `tests/dme/ruleSetEdit/node-style-view.test.ts`

**Interfaces:**
- Consumes(Task 1): `FlowNodeData.style?: NodeStyle`, `NODE_ICON_COMPONENT`, `NODE_ICON_LABEL`, `NODE_COLORS`, `NODE_H_MIN`, `STYLED_KINDS`, `NODE_STYLE_CSS`(팔레트 토큰 `--rsf-c-{색}-bg|border`), `nodeSize`.
- Produces(Task 4 가 기대는 DOM 계약):
  - 노드 루트 `.rsf-node`(testid `flow-node-{id}`)에 `data-color="{색}"`(기본이면 속성 없음)·`data-shape="square|pill"`(기본이면 없음)·`data-no-open="true"`(룰 열기 단추를 숨겼을 때).
  - 아이콘: `<span class="rsf-node-icon" data-testid="flow-node-icon-{id}" data-icon="{키}" title="{이름}">`.
  - 제목: 여러 줄이면 `.rsf-title` 에 `data-lines="{n}"` 과 인라인 `--rsf-lines: n`.
  - `export function titleLines(h: number, smallRows: number): number`(nodes.tsx).

- [ ] **Step 1: 실패 시험 — `tests/dme/ruleSetEdit/node-style-view.test.ts`**

```ts
/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 2 — 노드 그리기: 색·모양·아이콘·표시 항목·제목 여러 줄, 상태 표시가 색보다 우선(S-D3).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { titleLines } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { insertTask, setNodeStyle, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { BASE_CSS } from "../../../pages/dme/ruleSetEdit/styles/base";
import { NODE_STYLE_CSS } from "../../../pages/dme/ruleSetEdit/styles/node-style";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
const RULES = { NV_A: io("NV_A"), NV_B: io("NV_B") };
const base = () => toEditFlow(null, ["NV_A", "NV_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: base(), rules: RULES, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const node = (id: string) => document.querySelector(`[data-testid="flow-node-${id}"]`) as HTMLElement;
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe("노드 외관 그리기", () => {
  it("색·모양은 data 속성, 기본이면 속성이 없다 — 보기·디버그 모드도", async () => {
    const f = styled(styled(base(), "r1", { color: "blue", shape: "pill" }), "r2", { shape: "square" });
    for (const mode of ["edit", "view", "debug"] as const) {
      await draw(props({ flow: f, mode }));
      expect(node("r1").getAttribute("data-color"), mode).toBe("blue");
      expect(node("r1").getAttribute("data-shape")).toBe("pill");
      expect(node("r2").hasAttribute("data-color")).toBe(false);
      expect(node("r2").getAttribute("data-shape")).toBe("square");
      expect(node("start").hasAttribute("data-color")).toBe(false);
    }
  });

  it("아이콘은 제목 왼쪽에 16px — data-icon·title 이름", async () => {
    await draw(props({ flow: styled(base(), "r1", { icon: "truck" }) }));
    const icon = q('[data-testid="flow-node-icon-r1"]')!;
    expect(icon.getAttribute("data-icon")).toBe("truck");
    expect(icon.getAttribute("title")).toBe("물류");
    expect(icon.querySelector("svg")!.getAttribute("width")).toBe("16");
    expect(icon.nextElementSibling!.classList.contains("rsf-title")).toBe(true);
    expect(q('[data-testid="flow-node-icon-r2"]')).toBeNull();
  });

  it("표시 항목 — 룰은 sub·id·open 을 숨기고 제목·검사 점은 늘 보인다", async () => {
    const f = styled(base(), "r1", { hide: ["sub", "id", "open"] });
    await draw(props({ flow: f, checks: [{ code: "SET_ORDER", severity: "WARN", message: "m", nodeId: "r1" } as never] }));
    const r1 = node("r1");
    expect(r1.querySelector(".rsf-sub")).toBeNull();
    expect(r1.querySelector(".rsf-id")).toBeNull();
    expect(q('[data-testid="flow-rule-open-r1"]')).toBeNull();
    expect(r1.getAttribute("data-no-open")).toBe("true");
    expect(r1.querySelector(".rsf-title")!.textContent).toBe("NV_A 이름");
    expect(q('[data-testid="flow-node-mark-r1"]')).not.toBeNull();
    expect(node("r2").querySelector(".rsf-sub")).not.toBeNull();
    expect(q('[data-testid="flow-rule-open-r2"]')).not.toBeNull();
  });

  it("빈 단계는 sub(안내 줄)만 숨길 수 있다 — 저장된 id·open 은 해가 없다", async () => {
    let f = ok(insertTask(base(), "e2"));
    const id = f.edges.find((e) => e.id === "e2")!.to;
    f = styled(f, id, { hide: ["sub", "id", "open"], color: "green" });
    await draw(props({ flow: f }));
    expect(node(id).querySelector(".rsf-sub")).toBeNull();
    expect(node(id).getAttribute("data-color")).toBe("green");
    expect(node(id).classList.contains("rsf-task")).toBe(true); // 점선 테두리 그대로
  });

  it("titleLines — 기본 높이는 1줄, 높으면 남는 높이만큼(작은 줄 수를 뺀다)", () => {
    expect(titleLines(68, 2)).toBe(1);
    expect(titleLines(68, 0)).toBe(1); // 기본 높이에서는 숨겨도 한 줄
    expect(titleLines(100, 2)).toBe(3); // (100 - 12 - 30) / 16 = 3.6
    expect(titleLines(100, 0)).toBe(5);
    expect(titleLines(70, 2)).toBe(1);
  });

  it("높이를 키운 노드는 제목이 여러 줄(data-lines·--rsf-lines), 기본 높이는 그대로 한 줄", async () => {
    await draw(props({ flow: styled(base(), "r1", { h: 100 }) }));
    const t = node("r1").querySelector(".rsf-title") as HTMLElement;
    expect(t.getAttribute("data-lines")).toBe("3");
    expect(t.style.getPropertyValue("--rsf-lines")).toBe("3");
    expect(node("r2").querySelector(".rsf-title")!.hasAttribute("data-lines")).toBe(false);
  });

  it("상태 표시가 색보다 우선 — 디버그 current 와 색이 함께 있으면 두 표시가 다 붙는다(DOM)", async () => {
    const overlay = { nodes: { r1: { state: "current" as const, seq: 1, chip: null } }, edges: {} };
    await draw(props({ flow: styled(base(), "r1", { color: "red" }), mode: "debug", overlay }));
    expect(node("r1").getAttribute("data-color")).toBe("red");
    expect(node("r1").classList.contains("rsf-node-current")).toBe(true);
  });
});

describe("CSS — 상태 표시가 색보다 우선(S-D3, Review Focus 4)", () => {
  it("색 규칙은 .rsf-node:where([data-color]) 로 base 뒤, !important·box-shadow·border-width·--rsf-border 없음", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const colorRules = css.match(/[^{}]*\[data-color=[^{}]*\{[^}]*\}/g) ?? [];
    expect(colorRules).toHaveLength(6);
    for (const r of colorRules) {
      expect(r.trim().startsWith('.rsf-node:where([data-color="')).toBe(true);
      expect(r).not.toMatch(/!important|box-shadow|border-width|border-style|--rsf-border:/);
    }
    expect(RSF_CSS.indexOf(NODE_STYLE_CSS)).toBeGreaterThan(RSF_CSS.indexOf(BASE_CSS));
    const all = RSF_CSS.replace(/\s+/g, " ");
    expect(all).toMatch(/\.rsf-node\.rsf-node-current \{[^}]*border-color: var\(--color-primary\)/);
    expect(all).toMatch(/\.rsf-node\[data-state="error"\] \{[^}]*border-color: var\(--color-danger\)/);
    expect(all).toMatch(/\.rsf-node\[data-selected="true"\] \{[^}]*border-color: var\(--color-primary\)/);
    expect(all).toMatch(/\.rsf-node\.rsf-node-pending \{[^}]*border-color: var\(--rsf-border\)/);
  });

  it("모양 규칙도 낮은 우선순위, 제목 여러 줄은 줄바꿈 말줄임, 16진수·rgb() 없음", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-node:where\(\[data-shape="square"\]\) \{[^}]*border-radius: 0/);
    expect(css).toMatch(/\.rsf-node:where\(\[data-shape="pill"\]\) \{[^}]*border-radius: 999px/);
    expect(css).toMatch(/\.rsf-title\[data-lines\] \{[^}]*white-space: normal[^}]*-webkit-box-orient: vertical[^}]*-webkit-line-clamp: var\(--rsf-lines\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|!important/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `… vitest run tests/dme/ruleSetEdit/node-style-view.test.ts` → FAIL(`titleLines` 없음, data 속성 없음).

- [ ] **Step 3: `nodes.tsx` 고치기**

import 를 더한다:

```ts
import { NODE_ICON_COMPONENT } from "./node-icons";
import { NODE_H_MIN, NODE_ICON_LABEL, type NodeStyle } from "../node-style";
```

`Badges` 위에 도우미 둘:

```ts
/** 제목 줄 높이·작은 줄 높이·위아래 여백(styles/base.ts 의 .rsf-title 16px·.rsf-sub/.rsf-id 15px·padding 6px). */
const TITLE_LINE = 16;
const SMALL_LINE = 15;
const PAD_Y = 12;
/**
 * 제목 줄 수(S-D11, 계획 Ruling 15) — 기본 높이면 1(한 줄 말줄임), 더 높으면 남는 높이를 제목 줄 높이로 나눈 수(1 이상).
 * smallRows 는 보이는 작은 줄(종류·정책·룰 ID·안내) 수다.
 */
export function titleLines(h: number, smallRows: number): number {
  if (h <= NODE_H_MIN) return 1;
  return Math.max(1, Math.floor((h - PAD_Y - smallRows * SMALL_LINE) / TITLE_LINE));
}

/** 아이콘(있으면) + 제목. 여러 줄이면 data-lines 와 줄 수 `--rsf-lines`(CSS 가 line-clamp 로 쓴다). 제목 칸의 testid·두 번 누르기는 그대로 넘긴다. */
function TitleRow({ nodeId, style, lines, titleProps, children }: {
  nodeId: string; style: NodeStyle | undefined; lines: number; titleProps?: HTMLAttributes<HTMLDivElement> & { "data-testid"?: string }; children: ReactNode;
}) {
  const Icon = style?.icon ? NODE_ICON_COMPONENT[style.icon] : null;
  const multi = lines > 1;
  return (
    <div className="rsf-title-row">
      {Icon && style?.icon && (
        <span className="rsf-node-icon" data-testid={`flow-node-icon-${nodeId}`} data-icon={style.icon} title={NODE_ICON_LABEL[style.icon]}>
          <Icon size={16} aria-hidden="true" />
        </span>
      )}
      <div
        {...titleProps}
        className={`rsf-title${titleProps?.className ? ` ${titleProps.className}` : ""}`}
        data-lines={multi ? lines : undefined}
        style={multi ? ({ "--rsf-lines": lines } as CSSProperties) : undefined}
      >
        {children}
      </div>
    </div>
  );
}
```

(타입은 `import type { CSSProperties, HTMLAttributes, ReactNode } from "react";` 로 가져온다 — 기존 `import { useContext, useRef, useState, type MouseEvent } from "react";` 줄에 합친다.)

`RuleBody` 를 바꾼다:

```tsx
function RuleBody({ data }: { data: FlowNodeData }) {
  const { node, io, mark, onOpenRule, varDisplay, style } = data;
  const hide = new Set(style?.hide ?? []);
  const ruleId = node.ruleId ?? "";
  const missing = !io || !io.exists;
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenRule(ruleId);
  };
  const idMode = !missing && varDisplay === "id";
  const title = missing ? "(없는 룰)" : idMode ? ruleId : (io.ruleName ?? ruleId);
  const small = idMode ? (io.ruleName ?? "") : ruleId;
  const showSub = !hide.has("sub");
  const showId = small !== "" && !hide.has("id");
  const lines = titleLines(style?.h ?? NODE_H_MIN, (showSub ? 1 : 0) + (showId ? 1 : 0));
  return (
    <>
      <TitleRow nodeId={node.id} style={style} lines={lines}>{title}</TitleRow>
      {showSub && <div className="rsf-sub">{missing ? "룰 정보를 찾지 못했다" : [io.ruleKind, io.hitPolicy].filter(Boolean).join(" · ")}</div>}
      {showId && <div className="rsf-id">{small}</div>}
      {!hide.has("open") && (
        <button type="button" className="rsf-open nodrag" data-testid={`flow-rule-open-${node.id}`} aria-label="룰 편집 열기" title="룰 편집 열기" onClick={open}>
          <IconExternalLink size={12} />
        </button>
      )}
      {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} title={mark === "REJECT" ? "거부 검사 있음" : "경고 검사 있음"} />}
    </>
  );
}
```

`TaskBody` — 제목 `div` 를 `TitleRow` 로 감싼다(testid·`nopan`·`title`·`onDoubleClick` 은 `titleProps` 로 넘긴다). 안내 줄은 `!hide.has("sub")` 일 때만:

```tsx
  const { node, mark, onRenameTask, style } = data;
  const showSub = !(style?.hide ?? []).includes("sub");
  const lines = titleLines(style?.h ?? NODE_H_MIN, showSub ? 1 : 0);
  // …(draft·open·close 그대로)
      ) : (
        <TitleRow
          nodeId={node.id}
          style={style}
          lines={lines}
          titleProps={{
            className: "nopan",
            "data-testid": `flow-task-title-${node.id}`,
            title: onRenameTask ? "두 번 눌러 제목을 고친다" : undefined,
            onDoubleClick: onRenameTask ? (e) => { e.stopPropagation(); open(); } : undefined,
          }}
        >
          {title}
        </TitleRow>
      )}
      {showSub && <div className="rsf-sub">빈 단계 — 룰을 지정하면 룰 노드가 된다</div>}
```

`FlowNodeView` 의 루트 `div` 에 속성을 더한다(접힌 상자·외관 없는 노드는 속성 없음):

```tsx
  const st = collapsed ? undefined : data.style;
  // …
    <div
      className={cls}
      data-testid={`flow-node-${node.id}`}
      data-state={overlay?.state ?? "idle"}
      data-selected={selected ? "true" : "false"}
      data-kind={kind}
      data-color={st?.color}
      data-shape={st?.shape}
      data-no-open={kind === "RULE" && st?.hide?.includes("open") ? "true" : undefined}
    >
```

- [ ] **Step 4: `styles/node-style.ts` 에 노드 규칙 덧붙이기** — `NODE_STYLE_CSS` 를 팔레트 + 노드 규칙으로 바꾼다:

```ts
import { NODE_COLORS } from "../node-style";

/**
 * 노드 규칙(계획 Task 2, Ruling 7) — 색·모양은 `.rsf-node:where([…])` 로 우선순위 (0,1,0)이다. base(`.rsf-node`) 뒤에 와서 기본 테두리는 이기고,
 * 상태 규칙(선택·디버그·끌어 놓기 대상·hover, 모두 0,2,0)에는 진다(S-D3). `--rsf-border` 는 바꾸지 않는다 — pending 이 그 회색을 쓴다.
 * 채움은 `--rsf-node-bg` 를 노드에서 다시 정해 검사 점 테두리·값 고침 표시도 같은 채움을 따른다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
const COLOR_RULES = NODE_COLORS.filter((c) => c !== "default")
  .map((c) => `.rsf-node:where([data-color="${c}"]) { --rsf-node-bg: var(--rsf-c-${c}-bg); border-color: var(--rsf-c-${c}-border); }`)
  .join("\n");

const NODE_RULES = `
${COLOR_RULES}
.rsf-node:where([data-shape="square"]) { border-radius: 0; }
.rsf-node:where([data-shape="pill"]) { border-radius: 999px; padding-left: 16px; padding-right: 34px; }
.rsf-node.rsf-task:where([data-shape="pill"]) { padding-left: 16px; padding-right: 16px; } /* .rsf-node.rsf-task(0,2,0)의 padding 을 이기려고 같은 우선순위로 */
.rsf-node.rsf-rule[data-no-open="true"] { padding-right: 10px; }
.rsf-node:where([data-shape="pill"]) .rsf-open { right: 10px; }

/* 아이콘 + 제목 한 줄(아이콘은 제목 첫 줄에 맞춘다) */
.rsf-title-row { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
.rsf-title-row > .rsf-title { flex: 1 1 auto; min-width: 0; }
.rsf-node-icon { flex: none; display: inline-flex; width: 16px; height: 16px; color: var(--color-text-secondary); }

/* 높이를 키운 노드의 제목 — 줄바꿈하고 남는 줄 수만큼 보인 뒤 말줄임(S-D11). 줄 수는 노드가 인라인 --rsf-lines 로 준다. */
.rsf-title[data-lines] {
  white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--rsf-lines); line-clamp: var(--rsf-lines); overflow: hidden;
}
`;

export const NODE_STYLE_CSS = [PALETTE, NODE_RULES].join("\n");
```

- [ ] **Step 5: 통과 확인** — Step 2 명령 → PASS. 이어 `… vitest run tests/dme/ruleSetEdit/rule-node-title.test.ts tests/dme/ruleSetEdit/task-node.test.ts tests/dme/ruleSetEdit/task-page.test.ts tests/dme/ruleSetEdit/flow-debug-view.test.ts` → PASS(기대값을 고치지 않는다 — 제목 testid·두 번 누르기가 그대로여야 한다).

- [ ] **Step 6: 전체·타입·audit** — 전체 시험 → 실패 0. lint 0. audit 두 개를 `canvas/nodes.tsx`·`styles/node-style.ts` 에 → 0건.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-view.test.ts
/usr/bin/git commit -m "feat(m-mdm): 룰·빈 단계 노드를 고른 색·아이콘·모양·표시 항목으로 그리고 높은 노드는 제목을 여러 줄로 보인다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-view.test.ts
```

---

### Task 3: 오른쪽 패널 「외관」 섹션 + page 연결

**모델:** sonnet — 패널 컴포넌트 하나와 prop 배관.

**Files:**
- Create: `panels/NodeStylePanel.tsx`
- Modify: `panels/PropertyPanel.tsx`(props 2개, `StyleSection`, RuleProps·TaskProps 끝에 섹션)
- Modify: `panels/SidePanel.tsx`(props 1개 전달, `editing` 전달)
- Modify: `page.tsx:323-330`(`layoutSource`), `page.tsx:695-722`(SidePanel 에 넘기기)
- Modify: `styles/props.ts`(패널 규칙 덧붙임)
- Test(새): `tests/dme/ruleSetEdit/node-style-panel.test.ts`

**Interfaces:**
- Consumes(Task 1): `restyleNode`, `NodeLayoutSource`, `NodeStyle`, `NodeStylePatch`, `NODE_COLORS`·`NODE_COLOR_LABEL`·`NODE_ICONS`·`NODE_ICON_LABEL`·`NODE_SHAPE_CHOICES`·`NODE_SHAPE_LABEL`·`NODE_PARTS`·`NODE_PART_LABEL`·`TASK_SUB_LABEL`·`NODE_W_MIN/MAX`·`NODE_H_MIN/MAX`, `NODE_ICON_COMPONENT`, 팔레트 토큰 `--rsf-c-{색}-bg|border`.
- Produces:
  - `PropertyPanelProps.editing?: boolean`, `PropertyPanelProps.layoutSource?: () => NodeLayoutSource | null`
  - `SidePanelProps.layoutSource?: () => NodeLayoutSource | null`(SidePanel 은 `editing = p.mode === "edit"` 를 PropertyPanel 에 넘긴다)
  - `export interface NodeStylePanelProps { node: FlowNode; style: NodeStyle | undefined; disabled: boolean; onChange(patch: NodeStylePatch | null): void }`, `export function NodeStylePanel(p)`
  - testid: 섹션 `flow-section-node-style`, 색 `flow-style-color-{색}`, 아이콘 `flow-style-icon-{키|none}`, 모양 `flow-style-shape-{round|square|pill}`, 너비·높이 `flow-style-w`·`flow-style-h`, `flow-style-size-reset`, `flow-style-reset`. 표시 항목 체크는 aria-label `「{이름} 보이기」`.

- [ ] **Step 1: 실패 시험 — `tests/dme/ruleSetEdit/node-style-panel.test.ts`**

```ts
/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 3 — 오른쪽 패널 「외관」 섹션: 편집 모드의 RULE·TASK 에서만, 조작마다 편집 한 번(되돌리기 한 칸), 크기 칸 Enter·칸 밖 저장.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { insertSplit, insertTask, setNodeStyle, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, typeInto } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
/** start → if1{e5 갈래 1 / e6 그 외} → m1 → r1 → r2 → r3(빈 단계) → end. */
function flowOf(): EditFlow {
  let f = toEditFlow(null, ["NP_A", "NP_B"]); // start → r1 → r2 → end, e1 e2 e3
  f = must(insertTask(f, "e3")); // r2 → r3(빈 단계) → end
  return must(insertSplit(f, "e1", "IF")); // start → if1 → … → r1
}
function viewOf(setId: string, flow: EditFlow = flowOf()): RuleSetView {
  return {
    set: { setId, setName: "외관 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["NP_A", "NP_B"], flow, branched: true },
    rules: [io("NP_A"), io("NP_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
/**
 * 저장하고 보낸 흐름 JSON 을 돌려준다. 저장 뒤 화면은 목 서버의 처음 view 를 다시 읽으므로(외관이 사라진다) 시험의 **마지막**에만 부른다.
 */
async function saved(): Promise<EditFlow> {
  await click("set-save");
  return JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
}
async function keyOn(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}
async function blur(el: Element) {
  await act(async () => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}
const checkbox = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;

describe("오른쪽 패널 「외관」 섹션(S-D9)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("편집 모드에서 RULE·TASK 를 골랐을 때만 보인다 — 보기 모드·분기·시작은 없다", async () => {
    await openSet("NP_1", viewOf("NP_1"));
    await click("flow-node-r1");
    expect(q("flow-section-node-style")).toBeNull(); // 보기 모드
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(byTestId("flow-section-node-style-head").textContent).toContain("외관");
    await click("flow-node-r3");
    expect(q("flow-section-node-style")).not.toBeNull();
    await click("flow-node-if1");
    expect(q("flow-section-node-style")).toBeNull();
    await click("flow-node-start");
    expect(q("flow-section-node-style")).toBeNull();
  });

  it("색 견본 — 누르면 편집 한 번(되돌리기 한 칸), aria-pressed 가 따르고 저장 JSON 에 실린다. [기본]은 칸 지우기", async () => {
    await openSet("NP_2", viewOf("NP_2"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(pressed("flow-style-color-default")).toBe("true");
    await click("flow-style-color-purple");
    expect(pressed("flow-style-color-purple")).toBe("true");
    expect(pressed("flow-style-color-default")).toBe("false");
    await click("flow-style-color-default");
    expect(pressed("flow-style-color-default")).toBe("true");
    await click("flow-undo");
    expect(pressed("flow-style-color-purple")).toBe("true");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 두 번 = 두 칸
    await click("flow-style-color-purple");
    expect((await saved()).view.styles).toEqual({ r1: { color: "purple" } });
  });

  it("아이콘·모양·표시 항목 — 조작마다 편집 한 번(되돌리기 한 칸씩)", async () => {
    await openSet("NP_3", viewOf("NP_3"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-style-icon-calendar");
    await click("flow-style-shape-pill");
    await act(async () => {
      checkbox("종류·정책 줄 보이기")!.click();
    });
    await flush();
    expect(checkbox("종류·정책 줄 보이기")!.checked).toBe(false);
    expect(pressed("flow-style-icon-calendar")).toBe("true");
    expect(pressed("flow-style-shape-pill")).toBe("true");
    await click("flow-undo");
    await click("flow-undo");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 세 번 = 세 칸
    expect(pressed("flow-style-icon-none")).toBe("true");
    expect(pressed("flow-style-shape-round")).toBe("true");
  });

  it("아이콘·모양·표시 항목이 칸 순서대로 저장된다", async () => {
    await openSet("NP_3b", viewOf("NP_3b"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-style-shape-pill");
    await click("flow-style-icon-calendar");
    await act(async () => {
      checkbox("종류·정책 줄 보이기")!.click();
    });
    await flush();
    expect((await saved()).view.styles).toEqual({ r1: { hide: ["sub"], icon: "calendar", shape: "pill" } });
  });

  it("빈 단계는 표시 항목이 「안내 줄」 하나뿐이다", async () => {
    await openSet("NP_4", viewOf("NP_4"));
    await click("flow-mode-edit");
    await click("flow-node-r3");
    expect(checkbox("안내 줄 보이기")).not.toBeNull();
    expect(checkbox("룰 ID 줄 보이기")).toBeNull();
    expect(checkbox("룰 편집 열기 단추 보이기")).toBeNull();
  });

  it("너비 칸 — Enter 에 한 번 저장하고 범위로 자르며, 그린 위치 전부를 저장 위치로 적는다(S-D6)", async () => {
    await openSet("NP_5", viewOf("NP_5"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    const w = byTestId<HTMLInputElement>("flow-style-w");
    expect(w.value).toBe("232");
    await typeInto(w, "9999");
    expect(undoDisabled()).toBe(true); // 치는 동안은 저장하지 않는다
    await keyOn(w, "Enter");
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("640");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 한 칸(Enter 뒤 blur 가 한 번 더 저장하지 않았다)
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("232");
    await typeInto(byTestId<HTMLInputElement>("flow-style-w"), "500");
    await keyOn(byTestId("flow-style-w"), "Enter");
    await blur(byTestId("flow-style-w"));
    const f = await saved();
    expect(f.view.styles).toEqual({ r1: { w: 500 } });
    expect(Object.keys(f.view.positions).sort()).toEqual(f.nodes.map((n) => n.id).sort());
  });

  it("높이 칸 — 칸 밖 누르기에 저장, 같은 값·빈 값·숫자 아님은 기록하지 않고 되돌린다", async () => {
    await openSet("NP_6", viewOf("NP_6"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    const h = () => byTestId<HTMLInputElement>("flow-style-h");
    await typeInto(h(), "68");
    await blur(h());
    await typeInto(h(), "");
    await blur(h());
    expect(undoDisabled()).toBe(true);
    expect(h().value).toBe("68");
    await typeInto(h(), "150");
    await blur(h());
    expect((await saved()).view.styles).toEqual({ r1: { h: 150 } });
  });

  it("[기본 크기]는 w·h 만, [외관 초기화]는 전부 지운다 — 각각 편집 한 번", async () => {
    const styled = must(setNodeStyle(flowOf(), "r1", { color: "blue", w: 400, h: 120 }));
    await openSet("NP_7", viewOf("NP_7", styled));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("400");
    await click("flow-style-size-reset");
    expect((byTestId("flow-style-size-reset") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("232");
    expect(pressed("flow-style-color-blue")).toBe("true"); // 색은 남는다
    await click("flow-style-reset");
    expect((byTestId("flow-style-reset") as HTMLButtonElement).disabled).toBe(true);
    expect(pressed("flow-style-color-default")).toBe("true");
    await click("flow-undo");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 두 번 = 두 칸
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("400");
    await click("flow-style-size-reset");
    expect((await saved()).view.styles).toEqual({ r1: { color: "blue" } });
  });
});
```

`flowOf()` 의 ID: `insertTask(e3)` 가 r3·e4 를, `insertSplit(e1)` 이 if1·m1·e5·e6·e7 을 만든다. 저장 뒤 화면은 목 서버의 처음 view 를 다시 읽으므로(`runWrite` → `load(keepHistory)`) `saved()` 는 시험의 마지막에만 부른다.

- [ ] **Step 2: 실패 확인** — `… vitest run tests/dme/ruleSetEdit/node-style-panel.test.ts` → FAIL(섹션 없음).

- [ ] **Step 3: `panels/NodeStylePanel.tsx` 만들기**

```tsx
"use client";

/**
 * 오른쪽 패널 「외관」 섹션 본문(S1 §3) — 룰·빈 단계 노드 하나의 색·아이콘·모양·표시 항목·크기. 조작 하나가 편집 한 번이다(되돌리기 한 칸).
 * 색 견본·아이콘·모양은 누름 단추(aria-pressed), 표시 항목은 체크, 크기는 숫자 칸(Enter·칸 밖 누르기에 저장, 계획 Ruling 6).
 * shared 에 SegmentedControl·NumberInput·Tooltip 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않는다 — 툴팁은 title.
 * 색 견본은 캔버스와 같은 팔레트 토큰(`--rsf-c-{색}-bg|border`, styles/node-style.ts 의 :root)을 쓴다.
 */
import { useRef, useState } from "react";

import type { FlowNode } from "@/contract/engine-contract.generated";
import { Button, Checkbox, Input } from "@dk-oasis/shared/form";

import { NODE_ICON_COMPONENT } from "../canvas/node-icons";
import {
  NODE_COLORS, NODE_COLOR_LABEL, NODE_H_MAX, NODE_H_MIN, NODE_ICONS, NODE_ICON_LABEL, NODE_PARTS, NODE_PART_LABEL, NODE_SHAPE_CHOICES,
  NODE_SHAPE_LABEL, NODE_W_MAX, NODE_W_MIN, TASK_SUB_LABEL, type NodePart, type NodeStyle, type NodeStylePatch,
} from "../node-style";

export interface NodeStylePanelProps {
  /** RULE·TASK 노드. */
  node: FlowNode;
  style: NodeStyle | undefined;
  /** 불러오는 중 — 보이되 누를 수 없다(계획 Ruling 13). */
  disabled: boolean;
  onChange(patch: NodeStylePatch | null): void;
}

/** 숫자 칸 — 치는 동안은 초안만, Enter·칸 밖 누르기에 범위로 잘라 한 번 올린다. 같은 값·빈 값·숫자 아님은 올리지 않고 되돌린다. */
function SizeField({ label, testId, value, min, max, disabled, onCommit }: {
  label: string; testId: string; value: number; min: number; max: number; disabled: boolean; onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  /** Enter 로 올린 뒤 칸이 빠지며 오는 blur 가 한 번 더 올리지 않게(TaskBody 와 같은 방식). 다시 치면 풀린다. */
  const sentRef = useRef(false);
  const commit = () => {
    if (sentRef.current) return;
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const v = Math.max(min, Math.min(max, Math.round(n)));
    setDraft(String(v));
    if (v === value) return;
    sentRef.current = true;
    onCommit(v);
  };
  return (
    <label className="rsf-style-size-field">
      <span>{label}</span>
      <Input
        type="number"
        data-testid={testId}
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(v) => {
          sentRef.current = false;
          setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(String(value));
          }
        }}
        onBlur={commit}
      />
    </label>
  );
}

export function NodeStylePanel({ node, style, disabled, onChange }: NodeStylePanelProps) {
  const color = style?.color ?? "default";
  const shape = style?.shape ?? "round";
  const hide = style?.hide ?? [];
  const w = style?.w ?? NODE_W_MIN;
  const h = style?.h ?? NODE_H_MIN;
  const parts: readonly NodePart[] = node.kind === "RULE" ? NODE_PARTS : ["sub"];
  const partLabel = (p: NodePart) => (node.kind === "TASK" && p === "sub" ? TASK_SUB_LABEL : NODE_PART_LABEL[p]);
  return (
    <div className="rsf-style" data-testid="flow-style">
      <div className="rsf-style-row">
        <span className="rsf-style-label">색</span>
        <div className="rsf-style-swatches" role="group" aria-label="색">
          {NODE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="rsf-style-swatch"
              data-color={c}
              data-testid={`flow-style-color-${c}`}
              aria-pressed={color === c}
              aria-label={NODE_COLOR_LABEL[c]}
              title={NODE_COLOR_LABEL[c]}
              disabled={disabled}
              onClick={() => onChange({ color: c === "default" ? null : c })}
            />
          ))}
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">아이콘</span>
        <div className="rsf-style-icons" role="group" aria-label="아이콘">
          <button
            type="button"
            className="rsf-style-icon"
            data-testid="flow-style-icon-none"
            aria-pressed={!style?.icon}
            title="아이콘 없음"
            disabled={disabled}
            onClick={() => onChange({ icon: null })}
          >
            없음
          </button>
          {NODE_ICONS.map((k) => {
            const I = NODE_ICON_COMPONENT[k];
            return (
              <button
                key={k}
                type="button"
                className="rsf-style-icon"
                data-testid={`flow-style-icon-${k}`}
                aria-pressed={style?.icon === k}
                aria-label={NODE_ICON_LABEL[k]}
                title={NODE_ICON_LABEL[k]}
                disabled={disabled}
                onClick={() => onChange({ icon: k })}
              >
                <I size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">모양</span>
        <div className="rsf-style-shapes" role="group" aria-label="모양">
          {NODE_SHAPE_CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              className="rsf-style-shape"
              data-shape={s}
              data-testid={`flow-style-shape-${s}`}
              aria-pressed={shape === s}
              disabled={disabled}
              onClick={() => onChange({ shape: s === "round" ? null : s })}
            >
              {NODE_SHAPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">표시 항목</span>
        <div className="rsf-style-parts">
          {parts.map((p) => (
            <Checkbox
              key={p}
              label={partLabel(p)}
              aria-label={`${partLabel(p)} 보이기`}
              checked={!hide.includes(p)}
              disabled={disabled}
              onChange={(on) => onChange({ hide: on ? hide.filter((x) => x !== p) : [...hide, p] })}
            />
          ))}
          <p className="rsf-panel-note rsf-muted">제목·검사 표시·중단점은 늘 보인다</p>
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">크기</span>
        <div className="rsf-style-size">
          <SizeField key={`w:${node.id}:${w}`} label="너비" testId="flow-style-w" value={w} min={NODE_W_MIN} max={NODE_W_MAX} disabled={disabled} onCommit={(v) => onChange({ w: v })} />
          <SizeField key={`h:${node.id}:${h}`} label="높이" testId="flow-style-h" value={h} min={NODE_H_MIN} max={NODE_H_MAX} disabled={disabled} onCommit={(v) => onChange({ h: v })} />
          <Button size="sm" data-testid="flow-style-size-reset" disabled={disabled || (style?.w == null && style?.h == null)} onClick={() => onChange({ w: null, h: null })}>
            기본 크기
          </Button>
        </div>
        <p className="rsf-panel-note rsf-muted">{`너비 ${NODE_W_MIN}~${NODE_W_MAX}, 높이 ${NODE_H_MIN}~${NODE_H_MAX}. 캔버스에서 노드를 고르고 오른쪽·아래 손잡이를 끌어도 된다`}</p>
      </div>

      <div className="rsf-panel-actions">
        <Button size="sm" data-testid="flow-style-reset" disabled={disabled || !style} onClick={() => onChange(null)}>
          외관 초기화
        </Button>
      </div>
    </div>
  );
}
```

(크기 칸의 `key` 가 노드 ID·저장 값을 담아 노드를 바꾸거나 되돌리기로 값이 바뀌면 초안이 새로 시작한다.)

- [ ] **Step 4: `PropertyPanel.tsx` 고치기**

props 에 더한다:

```ts
  /** 편집 모드(불러오는 동안에도 true) — 「외관」 섹션을 보인다. editable 은 불러오는 동안 false 라 섹션을 감추면 깜빡인다(계획 Ruling 13). */
  editing?: boolean;
  /** 외관 크기를 바꿀 때 그때 그린 위치(S-D6) — page 가 캔버스의 정렬 출처에서 만든다. 없으면 위치를 적지 않는다. */
  layoutSource?: () => NodeLayoutSource | null;
```

import 에 `import { restyleNode, type NodeLayoutSource } from "../flow-layout";`, `import type { NodeStylePatch } from "../node-style";`, `import { NodeStylePanel } from "./NodeStylePanel";`.

`TaskProps` 위에 섹션 컴포넌트:

```tsx
/** 「외관」 섹션(S1 §3) — 편집 모드의 룰·빈 단계에서만. 조작 하나 = 편집 한 번(restyleNode — 크기가 바뀌면 그린 위치 전부 고정). */
function StyleSection({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, editing, editable, onEdit, layoutSource, sections } = props;
  if (!editing) return null;
  const change = (patch: NodeStylePatch | null) => {
    const src = layoutSource?.() ?? null;
    onEdit((f) => restyleNode(f, node.id, patch, src?.drawn ?? {}, src?.blocks ?? {}));
  };
  return (
    <Section kind={node.kind as PanelKind} id="node-style" title="외관" memory={sections}>
      <NodeStylePanel node={node} style={flow.view.styles?.[node.id]} disabled={!editable} onChange={change} />
    </Section>
  );
}
```

`RuleProps` 의 마지막 `</Section>`(결과 변수) 뒤, `TaskProps` 의 `</Section>`(빈 단계) 뒤에 `<StyleSection node={node} props={props} />` 를 한 줄씩 더한다. 파일 머리 주석에 「- 룰·빈 단계: 편집 모드면 「외관」 섹션(S1, NodeStylePanel)」 한 줄을 더한다.

- [ ] **Step 5: `SidePanel.tsx`·`page.tsx` 고치기**

`SidePanelProps` 에:

```ts
  /** 외관 크기를 바꿀 때 그린 위치(S-D6) — PropertyPanel 로 넘긴다. */
  layoutSource?: () => NodeLayoutSource | null;
```

`<PropertyPanel … />` 에 `editing={editing}` 과 `layoutSource={p.layoutSource}` 를 더한다(`import type { NodeLayoutSource } from "../flow-layout";`).

`page.tsx` — `alignSourceRef` 선언(325행) 바로 뒤:

```ts
  /** 외관 크기 바꾸기(S-D6)가 쓸 그린 위치 — 캔버스가 채운 정렬 출처에서 꺼낸다. 캔버스가 없으면 null(위치를 적지 않는다). */
  const layoutSource = useCallback((): NodeLayoutSource | null => {
    const s = alignSourceRef.current?.();
    return s ? { drawn: s.drawn, blocks: s.blocks } : null;
  }, []);
```

`<SidePanel … />` 에 `layoutSource={layoutSource}` 를 더한다. import: `import { autoArrange, shiftSpace, type NodeLayoutSource, type SpaceAxis, type SpaceBlocks } from "./flow-layout";`.

- [ ] **Step 6: `styles/props.ts` 에 패널 규칙 덧붙이기** — 파일의 내보내는 상수 끝에 아래를 잇는다(색은 토큰만, 네이티브 단추 모양 초기화 포함):

```css
/* 「외관」 섹션(S1 §3) — 색 견본은 캔버스와 같은 팔레트 토큰. 고른 것은 바깥 고리(한 변 색 바 아님, Local-Rules §8). */
.rsf-style { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.rsf-style-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rsf-style-label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-secondary); }
.rsf-style-swatches, .rsf-style-shapes { display: flex; flex-wrap: wrap; gap: 4px; }
.rsf-style-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(30px, 1fr)); gap: 4px; }
.rsf-style-swatch, .rsf-style-icon, .rsf-style-shape {
  box-sizing: border-box; margin: 0; font: inherit; color: var(--color-text); cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}
.rsf-style-swatch { width: 22px; height: 22px; padding: 0; }
.rsf-style-swatch[data-color="default"] { background: var(--color-bg); border-color: var(--color-border-strong); }
.rsf-style-icon { height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; font-size: var(--font-size-xs); }
.rsf-style-shape { height: 26px; padding: 0 var(--spacing-sm); font-size: var(--font-size-sm); }
.rsf-style-swatch[aria-pressed="true"], .rsf-style-icon[aria-pressed="true"], .rsf-style-shape[aria-pressed="true"] {
  outline: 2px solid var(--color-primary); outline-offset: 1px;
}
.rsf-style-icon[aria-pressed="true"], .rsf-style-shape[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); }
.rsf-style-swatch:disabled, .rsf-style-icon:disabled, .rsf-style-shape:disabled { cursor: default; opacity: 0.5; }
.rsf-style-parts { display: flex; flex-direction: column; gap: 4px; }
.rsf-style-size { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--spacing-xs); }
.rsf-style-size-field { display: flex; flex-direction: column; gap: 2px; width: 96px; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
```

여섯 색 견본 규칙은 TS 로 만든다(같은 파일, `NODE_COLORS` import):

```ts
const SWATCH_RULES = NODE_COLORS.filter((c) => c !== "default")
  .map((c) => `.rsf-style-swatch[data-color="${c}"] { background: var(--rsf-c-${c}-bg); border-color: var(--rsf-c-${c}-border); }`)
  .join("\n");
```

위 CSS 문자열 끝에 `${SWATCH_RULES}` 를 잇는다. 모양 단추 미리보기: `.rsf-style-shape[data-shape="square"] { border-radius: 0; } .rsf-style-shape[data-shape="pill"] { border-radius: 999px; }`.

- [ ] **Step 7: 통과 확인** — Step 2 명령 → PASS. 이어 `… vitest run tests/dme/ruleSetEdit/side-panel.test.ts tests/dme/ruleSetEdit/task-page.test.ts tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` → PASS(기대값을 고치지 않는다 — 섹션 순서 시험(`sectionIds`)이 있으면 「외관」은 RULE 은 `rule-results` 뒤, TASK 는 `task-basic` 뒤, 편집 모드에서만 늘어난다. 기존 시험이 편집 모드에서 섹션 목록 전체를 `toEqual` 하면 그 시험만 `node-style` 을 더해 고치고 보고에 적는다).

- [ ] **Step 8: 전체·타입·audit** — 전체 시험 실패 0, lint 0, audit 두 개를 `panels/NodeStylePanel.tsx`·`panels/PropertyPanel.tsx`·`panels/SidePanel.tsx`·`page.tsx`·`styles/props.ts` 에 → 0건.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/NodeStylePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/SidePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/props.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-panel.test.ts
/usr/bin/git commit -m "feat(m-mdm): 오른쪽 패널에 룰·빈 단계 「외관」 섹션(색·아이콘·모양·표시 항목·크기)을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/NodeStylePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/SidePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/props.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-style-panel.test.ts
```

---

### Task 4: 캔버스 크기 손잡이(e·s·se)

**모델:** sonnet — 4단계 그룹 크기(G2)의 `group-size.ts`·`groupSizeApi`·`GroupNodeView` 손잡이를 노드에 그대로 옮긴다.

**Files:**
- Create: `canvas/node-size.ts`(손잡이 이름·끌기 계산·저장소·문맥)
- Modify: `canvas/nodes.tsx`(`FlowNodeData.resizable`, `FlowNodeView` 손잡이)
- Modify: `canvas/FlowCanvas.tsx`(props `onNodeSizeChange`, 저장소 구독·노드 memo 의 끄는 동안 크기, `nodeSizeApi`, 문맥 Provider, 머리 주석 문단)
- Modify: `page.tsx`(`onNodeSizeChange` → `restyleNode`)
- Modify: `styles/node-style.ts`(손잡이 규칙 덧붙임)
- Test(새): `tests/dme/ruleSetEdit/node-size-grip.test.ts`(캔버스), `tests/dme/ruleSetEdit/node-size-page.test.ts`(화면)

**Interfaces:**
- Consumes: Task 1 `nodeSizeOf`·`restyleNode`·`NodeSize`·`NODE_W_*`·`NODE_H_*`·`STYLED_KINDS`, `spaceDrawnRef`(FlowCanvas 안, 그린 위치 전체)·`viewRef.current.blocks`; Task 2 의 노드 루트 DOM; Task 3 이 고친 `page.tsx`.
- Produces:
  - `canvas/node-size.ts`: `export type NodeGrip = "e" | "s" | "se"`, `export const NODE_GRIPS: readonly NodeGrip[]`, `export function dragNodeSize(base: NodeSize, grip: NodeGrip, dx: number, dy: number): NodeSize`, `export const sameSize`, `export interface NodeSizeDrag { nodeId: string; size: NodeSize }`, `export interface NodeSizeStore`, `export function createNodeSizeStore(): NodeSizeStore`, `export interface NodeSizeApi { startDrag(e: ReactPointerEvent, nodeId: string, grip: NodeGrip): void }`, `export const NodeSizeContext`.
  - `FlowNodeData.resizable?: boolean`.
  - `FlowCanvasProps.onNodeSizeChange?: (nodeId: string, size: NodeSize, drawn: Record<string, FlowPos>, blocks: SpaceBlocks) => void` — 끄는 동안은 부르지 않고 놓을 때 한 번, 바뀌었을 때만, 편집 모드에서만.
  - testid `flow-node-grip-{nodeId}-{e|s|se}`.

- [ ] **Step 1: 캔버스 실패 시험 — `tests/dme/ruleSetEdit/node-size-grip.test.ts`**

```ts
/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 4 — 노드 크기 손잡이: 계산(dragNodeSize), 보이는 조건, 끄는 동안 캔버스 안에서만·놓을 때 한 번, 범위 자르기, 성능.
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const layout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (layout.calls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { NODE_GRIPS, dragNodeSize } from "../../../pages/dme/ruleSetEdit/canvas/node-size";
import { insertSplit, insertTask, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { restyleNode, type SpaceBlocks } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { NodeSize } from "../../../pages/dme/ruleSetEdit/node-style";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/** start(0,0) · r1(0,150) · r2(0,300) · end(0,450) 고정. */
const pinned = () => setPositions(toEditFlow(null, ["NG_A", "NG_B"]), { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });

describe("dragNodeSize — 손잡이 끌기 계산", () => {
  const B: NodeSize = { w: 232, h: 68 };
  it("e 는 너비만, s 는 높이만, se 는 둘 다 — 정수로 반올림", () => {
    expect(NODE_GRIPS).toEqual(["e", "s", "se"]);
    expect(dragNodeSize(B, "e", 40.4, 30)).toEqual({ w: 272, h: 68 });
    expect(dragNodeSize(B, "s", 40, 30.6)).toEqual({ w: 232, h: 99 });
    expect(dragNodeSize(B, "se", 40, 30)).toEqual({ w: 272, h: 98 });
  });
  it("232~640 × 68~320 으로 자른다(S-D4)", () => {
    expect(dragNodeSize(B, "se", -100, -100)).toEqual({ w: 232, h: 68 });
    expect(dragNodeSize(B, "se", 1000, 1000)).toEqual({ w: 640, h: 320 });
  });
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  layout.calls = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: pinned(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: "r1", selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
const wrap = (el: ReturnType<typeof createElement>) =>
  createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, el));
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(wrap(createElement(FlowCanvas, p)));
  });
  await flush();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const grips = (id: string) => [...document.querySelectorAll(`[data-testid^="flow-node-grip-${id}-"]`)].map((e) => e.getAttribute("data-grip"));
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
async function dragGrip(testId: string, dx: number, dy: number, release = true) {
  await fire(q(testId)!, "pointerdown", { clientX: 0, clientY: 0, button: 0 });
  await fire(window, "pointermove", { clientX: dx / 2, clientY: dy / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: dx, clientY: dy, buttons: 1 });
  if (release) await fire(window, "pointerup", { clientX: dx, clientY: dy });
}

describe("FlowCanvas 노드 크기 손잡이(S-D4)", () => {
  it("편집 모드에서 고른 RULE·TASK 에만 e·s·se 손잡이가 뜬다(누름을 받는 표시 nodrag nopan)", async () => {
    await draw(props());
    expect(grips("r1")).toEqual(["e", "s", "se"]);
    const cl = q("flow-node-grip-r1-se")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
    expect(grips("r2")).toEqual([]);
    await draw(props({ mode: "view" }));
    expect(grips("r1")).toEqual([]);
    await draw(props({ mode: "debug" }));
    expect(grips("r1")).toEqual([]);
    await draw(props({ selectedId: "start" }));
    expect(grips("start")).toEqual([]);
    let f = ok(insertTask(pinned(), "e2"));
    const task = f.edges.find((e) => e.id === "e2")!.to;
    await draw(props({ flow: f, selectedId: task }));
    expect(grips(task)).toEqual(["e", "s", "se"]);
    f = ok(insertSplit(pinned(), "e2", "IF"));
    await draw(props({ flow: f, selectedId: "if1" }));
    expect(grips("if1")).toEqual([]);
    await draw(props({ flow: f, selectedId: "if1", collapsed: new Set(["if1"]) }));
    expect(grips("if1")).toEqual([]); // 접힌 상자도 없다
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedId 만, mode 만 바꿔도 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props({ selectedId: null });
    await draw(p);
    expect(grips("r1")).toEqual([]);
    const sel = { ...p, selectedId: "r1" };
    await draw(sel);
    expect(grips("r1")).toHaveLength(3);
    await draw({ ...sel, mode: "view" });
    expect(grips("r1")).toHaveLength(0);
  });

  it("se 를 끌면 끄는 동안 캔버스 안에서만 커지고(왼쪽 위 고정) 놓을 때 한 번 올린다 — 그린 위치 전부를 함께", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-se", 100, 50, false);
    expect(box("r1")).toEqual({ x: 0, y: 150, w: 332, h: 118 });
    expect(onNodeSizeChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 100, clientY: 50 });
    expect(onNodeSizeChange).toHaveBeenCalledTimes(1);
    const [id, size, drawn, blocks] = onNodeSizeChange.mock.calls[0] as [string, NodeSize, Record<string, FlowPos>, SpaceBlocks];
    expect([id, size]).toEqual(["r1", { w: 332, h: 118 }]);
    expect(Object.keys(drawn).sort()).toEqual(["end", "r1", "r2", "start"]);
    expect(blocks).toEqual({});
  });

  it("e·s 손잡이는 한 축만 바꾼다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-e", 60, 40);
    await dragGrip("flow-node-grip-r1-s", 60, 40);
    expect(onNodeSizeChange.mock.calls.map((c) => c[1])).toEqual([{ w: 292, h: 68 }, { w: 232, h: 108 }]);
  });

  it("범위 밖으로 끌면 자르고, 안쪽으로 끌어 바뀐 것이 없으면 올리지 않는다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-se", -50, -50);
    expect(onNodeSizeChange).not.toHaveBeenCalled();
    expect(box("r1").w).toBe(232);
    await dragGrip("flow-node-grip-r1-se", 2000, 2000, false);
    expect(box("r1")).toMatchObject({ w: 640, h: 320 });
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제 크기로 돌아간다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-e", 80, 0, false);
    await fire(window, "pointercancel", {});
    expect(box("r1").w).toBe(232);
    await dragGrip("flow-node-grip-r1-e", 80, 0, false);
    await fire(window, "pointermove", { clientX: 90, clientY: 0, buttons: 0 });
    await fire(window, "pointerup", { clientX: 90, clientY: 0 });
    expect(box("r1").w).toBe(232);
    expect(onNodeSizeChange).not.toHaveBeenCalled();
  });

  it("CSS — 손잡이는 잇기 손잡이 자리(변 가운데)를 비켜 75% 자리, 크기 커서", async () => {
    const { NODE_STYLE_CSS } = await import("../../../pages/dme/ruleSetEdit/styles/node-style");
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-node-grip \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="e"\] \{[^}]*top: calc\(75% - 5px\)[^}]*cursor: ew-resize/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="s"\] \{[^}]*left: calc\(75% - 5px\)[^}]*cursor: ns-resize/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="se"\] \{[^}]*cursor: nwse-resize/);
  });
});

describe("성능 — 끄는 동안 page 를 다시 그리지 않고 dagre 도 다시 돌지 않는다(Local-Rules §16)", () => {
  const renders = { host: 0 };
  function Host({ initial }: { initial: EditFlow }) {
    renders.host++;
    const [flow, setFlow] = useState(initial);
    const [, bump] = useState(0);
    const touch = () => bump((n) => n + 1);
    return createElement(FlowCanvas, props({
      flow, onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch, onRouteChange: touch,
      onNodeSizeChange: (id, size, drawn, blocks) => setFlow((f) => ok(restyleNode(f, id, { w: size.w, h: size.h }, drawn, blocks))),
    }));
  }

  it("끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 한 번 다시 그려 새 크기가 정본 — 이웃 자리는 그대로", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: toEditFlow(null, ["NG_A", "NG_B"]) })));
    });
    await flush();
    const r2 = box("r2");
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await dragGrip("flow-node-grip-r1-se", 100, 50, false);
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 100, clientY: 50 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(box("r1")).toMatchObject({ w: 332, h: 118 });
    expect(box("r2")).toEqual(r2); // 그린 위치를 모두 고정해 이웃이 밀리지 않는다(S-D6)
  });
});
```

- [ ] **Step 2: 화면 실패 시험 — `tests/dme/ruleSetEdit/node-size-page.test.ts`**

```ts
/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 4 — 화면에서 손잡이: 하나만 고른 노드에만, 놓을 때 편집 한 번(되돌리기 한 칸).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { setPositions, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
const flow = (): EditFlow => setPositions(toEditFlow(null, ["NS_A", "NS_B"]), { r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 } });
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "손잡이", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["NS_A", "NS_B"], flow: flow(), branched: false },
    rules: [io("NS_A"), io("NS_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const grips = (id: string) => document.querySelectorAll(`[data-testid^="flow-node-grip-${id}-"]`).length;

describe("화면 — 노드 크기 손잡이", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("하나만 고른 노드에만 뜨고, 여럿 고르면 사라진다(계획 Ruling 17)", async () => {
    await openSet("NZ_1", viewOf("NZ_1"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(grips("r1")).toBe(3);
    await shift("keydown");
    await click("flow-node-r2");
    await shift("keyup");
    expect(grips("r1")).toBe(0);
    expect(grips("r2")).toBe(0);
  });

  it("놓으면 편집 한 번 — 되돌리기 한 번에 제 크기로 돌아간다", async () => {
    await openSet("NZ_2", viewOf("NZ_2"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await dragE();
    expect(width("r1")).toBeGreaterThan(232);
    await click("flow-undo");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    expect(width("r1")).toBe(232);
  });

  it("저장 JSON 에 크기와 그린 위치 전부가 실린다(S-D6)", async () => {
    await openSet("NZ_3", viewOf("NZ_3"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await dragE();
    await click("set-save");
    const saved = JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
    expect(saved.view.styles?.r1?.w).toBeGreaterThan(232);
    expect(Object.keys(saved.view.positions).sort()).toEqual(["end", "r1", "r2", "start"]);
  });
});
```

위 시험 파일의 도우미(`grips` 아래)에 둘을 더한다:

```ts
const width = (id: string) => parseFloat((document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement).style.width);
/** r1 의 오른쪽 변 손잡이를 화면 100px 끈다. */
async function dragE() {
  await fire(byTestId("flow-node-grip-r1-e"), "pointerdown", { clientX: 0, clientY: 0, button: 0 });
  await fire(window, "pointermove", { clientX: 100, clientY: 0, buttons: 1 });
  await fire(window, "pointerup", { clientX: 100, clientY: 0 });
  await flush();
}
```

import 에서 쓰지 않게 된 `q` 는 뺀다. 화면 시험의 확대 배율은 1 이 아닐 수 있어 끈 거리 대신 「커졌다」만 본다(정확한 값은 캔버스 시험이 본다). 저장 뒤 화면은 목 서버의 처음 view 를 다시 읽으므로 저장은 시험의 마지막에만 한다.

- [ ] **Step 3: 실패 확인** — 두 시험 파일 → FAIL(`node-size` 모듈 없음).

- [ ] **Step 4: `canvas/node-size.ts` 만들기**

```ts
/**
 * 노드 크기 손잡이(S1 §2.2) — 손잡이 이름·끌기 계산·끌기 저장소·문맥. 그리기는 nodes.tsx(FlowNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 4단계 그룹 크기(group-size.ts)와 같은 방식 — 끄는 동안은 저장소에만 두고(캔버스의 그 노드·그룹 틀만 다시 그린다) 놓을 때 한 번 올린다.
 * 왼쪽 위 자리는 고정이다(S-D4). 범위는 232~640 × 68~320.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

import { NODE_H_MAX, NODE_H_MIN, NODE_W_MAX, NODE_W_MIN, type NodeSize } from "../node-style";

/** 오른쪽 변(e)·아래 변(s)·오른쪽 아래 모서리(se). */
export type NodeGrip = "e" | "s" | "se";
export const NODE_GRIPS: readonly NodeGrip[] = ["e", "s", "se"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 크기 — 정수로 반올림해 범위로 자른다. */
export function dragNodeSize(base: NodeSize, grip: NodeGrip, dx: number, dy: number): NodeSize {
  return {
    w: grip.includes("e") ? clamp(base.w + dx, NODE_W_MIN, NODE_W_MAX) : base.w,
    h: grip.includes("s") ? clamp(base.h + dy, NODE_H_MIN, NODE_H_MAX) : base.h,
  };
}
export const sameSize = (a: NodeSize, b: NodeSize) => a.w === b.w && a.h === b.h;

export interface NodeSizeDrag {
  nodeId: string;
  size: NodeSize;
}
/** 끄는 동안의 크기 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface NodeSizeStore {
  drag: NodeSizeDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createNodeSizeStore(): NodeSizeStore {
  const listeners = new Set<() => void>();
  return {
    drag: null,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => listeners.forEach((cb) => cb()),
  };
}

export interface NodeSizeApi {
  /** 손잡이 누르기 — 끄는 동안 저장소를 바꾸고, 놓을 때 바뀌었으면 한 번 올린다. */
  startDrag(e: ReactPointerEvent, nodeId: string, grip: NodeGrip): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16). */
export const NodeSizeContext = createContext<NodeSizeApi | null>(null);
```

- [ ] **Step 5: `nodes.tsx` 손잡이 그리기**

`FlowNodeData` 끝에:

```ts
  /** 편집 모드이고 하나만 고른 RULE·TASK(접힌 상자 아님) — 오른쪽·아래·오른쪽 아래 크기 손잡이(S1 §2.2). */
  resizable?: boolean;
```

import: `import { NODE_GRIPS, NodeSizeContext, type NodeGrip } from "./node-size";`.

`FlowNodeView` 안 맨 위에 `const sizing = useContext(NodeSizeContext);`, 루트 `div` 의 마지막 자식(`LinkHandles` 뒤)에:

```tsx
      {data.resizable &&
        sizing &&
        NODE_GRIPS.map((g) => (
          <span
            key={g}
            className="rsf-node-grip nodrag nopan"
            role="button"
            data-grip={g}
            data-testid={`flow-node-grip-${node.id}-${g}`}
            aria-label={`노드 크기 — ${NODE_GRIP_LABEL[g]}`}
            title="끌어 노드 크기를 바꾼다"
            onPointerDown={(e) => sizing.startDrag(e, node.id, g)}
          />
        ))}
```

`GRIP_LABEL` 근처에 `const NODE_GRIP_LABEL: Record<NodeGrip, string> = { e: "오른쪽 변", s: "아래 변", se: "오른쪽 아래 모서리" };`.

- [ ] **Step 6: `FlowCanvas.tsx` 연결**

props(`onGroupPadChange` 아래):

```ts
  /**
   * 노드 크기 손잡이를 놓음(S1 §2.2) — 새 크기(흐름 좌표, 범위로 자른 정수)와 그때 그린 위치 전체·접힌 블록(S-D6, page 가 `restyleNode` 로 함께 적는다).
   * 끄는 동안은 부르지 않고 놓을 때 한 번, 바뀌었을 때만. 편집 모드에서만 부른다.
   */
  onNodeSizeChange?: (nodeId: string, size: NodeSize, drawn: Record<string, FlowPos>, blocks: SpaceBlocks) => void;
```

import: `import { NodeSizeContext, createNodeSizeStore, dragNodeSize, sameSize, type NodeSizeApi } from "./node-size";`.

`groupDrag` 구독 아래:

```ts
  // 노드 크기 끌기(S1) — 끄는 동안의 크기. 구독 값이 바뀌면 Inner 가 다시 그려 nodes memo 만 다시 돈다(page·dagre 는 그대로).
  const nodeSizeStore = useMemo(createNodeSizeStore, []);
  const nodeSizeDrag = useSyncExternalStore(nodeSizeStore.subscribe, () => nodeSizeStore.drag, () => null);
```

노드 memo — 크기 지도를 끄는 크기로 덮고(그룹 틀도 따라간다), 손잡이 조건을 싣는다:

```ts
    const sizes = new Map(vflow.nodes.map((n) => [n.id, nodeSizeOf(vflow, n, view.blocks)] as const));
    if (nodeSizeDrag && sizes.has(nodeSizeDrag.nodeId)) sizes.set(nodeSizeDrag.nodeId, nodeSizeDrag.size);
    const single = rfSel.size <= 1;
    // … 노드 data 에
        resizable: editable && single && selectedId === n.id && !block && STYLED_KINDS.has(n.kind),
```

memo 의존 배열에 `nodeSizeDrag` 를 더한다(`STYLED_KINDS` 는 `../node-style` 에서 import).

`spaceDrawnRef.current = spaceDrawn;` 줄 **뒤**에 끌기 연결(그룹 크기 `groupSizeApi` 와 같은 모양):

```ts
  // 노드 크기(S1) — 끄는 동안은 nodeSizeStore 에만 두고 놓을 때 onNodeSizeChange 를 한 번 부른다. 그린 위치 전체를 함께 넘긴다(S-D6).
  const nodeSizeChangeRef = useRef(props.onNodeSizeChange);
  nodeSizeChangeRef.current = props.onNodeSizeChange;
  const nodeSizeDragRef = useRef<{ stop: () => void } | null>(null);
  const nodeSizeApi = useMemo<NodeSizeApi>(() => ({
    startDrag: (e, nodeId, grip) => {
      if (e.button !== 0 || !editableRef.current) return;
      e.stopPropagation();
      nodeSizeDragRef.current?.stop();
      const n = fullRef.current.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      const base = nodeSizeOf(fullRef.current, n);
      const sx = e.clientX;
      const sy = e.clientY;
      const onMoveEvt = (ev: MouseEvent) => {
        if (ev.buttons === 0) {
          finish(false); // pointerup 을 잃었다(창 밖에서 놓음) — 기록 없이 버린다
          return;
        }
        const k = rf.getZoom() || 1;
        const size = dragNodeSize(base, grip, (ev.clientX - sx) / k, (ev.clientY - sy) / k);
        const cur = nodeSizeStore.drag;
        if (cur && cur.nodeId === nodeId && sameSize(cur.size, size)) return;
        nodeSizeStore.drag = { nodeId, size };
        nodeSizeStore.emit();
      };
      const finish = (commit: boolean) => {
        stop();
        const d = nodeSizeStore.drag;
        if (!d) return;
        nodeSizeStore.drag = null;
        nodeSizeStore.emit();
        if (commit && editableRef.current && !sameSize(d.size, base)) {
          nodeSizeChangeRef.current?.(nodeId, d.size, spaceDrawnRef.current(), viewRef.current.blocks);
        }
      };
      const onUpEvt = () => finish(true);
      const onCancelEvt = () => finish(false);
      const stop = () => {
        nodeSizeDragRef.current = null;
        window.removeEventListener("pointermove", onMoveEvt);
        window.removeEventListener("pointerup", onUpEvt);
        window.removeEventListener("pointercancel", onCancelEvt);
      };
      nodeSizeDragRef.current = { stop };
      window.addEventListener("pointermove", onMoveEvt);
      window.addEventListener("pointerup", onUpEvt);
      window.addEventListener("pointercancel", onCancelEvt);
    },
  }), [nodeSizeStore, rf]);
  useEffect(() => {
    if (editable) return;
    nodeSizeDragRef.current?.stop();
    if (nodeSizeStore.drag) {
      nodeSizeStore.drag = null;
      nodeSizeStore.emit();
    }
  }, [editable, nodeSizeStore]);
  useEffect(() => () => nodeSizeDragRef.current?.stop(), []);
```

`spaceDrawn()` 은 숨은 멤버까지 담은 그린 위치 전체이고, 끄는 동안의 크기는 위치를 바꾸지 않으므로(왼쪽 위 고정) 놓는 순간 그대로 쓰면 된다.

반환 JSX 에서 `<GroupSizeContext.Provider value={groupSizeApi}>` 바로 안쪽에 `<NodeSizeContext.Provider value={nodeSizeApi}>` 를 두고 짝 닫는 태그를 맞춘다. 머리 주석 끝에 문단:

```
 * 노드 크기(S1 §2.2): 편집 모드에서 하나만 고른 RULE·TASK(접힌 상자 아님)에 오른쪽·아래·오른쪽 아래 손잡이(nodes.tsx)가 뜬다. 왼쪽 위는 고정이다.
 * 끄는 동안은 `NodeSizeStore` 에만 두고 놓을 때 `onNodeSizeChange` 를 그린 위치 전체와 함께 한 번 부른다(page 가 `restyleNode` 로 크기와 위치를 한 편집으로 적는다).
```

- [ ] **Step 7: `page.tsx` 연결** — `onGroupPadChange` 아래:

```ts
  // 노드 크기(S1) — 손잡이를 놓을 때 한 번 = 편집 한 번(되돌리기 한 칸). 그린 위치 전부를 함께 적는다(S-D6, restyleNode).
  const onNodeSizeChange = useCallback(
    (id: string, size: NodeSize, drawn: Record<string, FlowPos>, blocks: SpaceBlocks) =>
      editing && edit((f) => restyleNode(f, id, { w: size.w, h: size.h }, drawn, blocks)),
    [editing, edit],
  );
```

`<FlowCanvas … />` 에 `onNodeSizeChange={onNodeSizeChange}` 를 더한다. import 에 `restyleNode`(flow-layout), `type NodeSize`(node-style).

- [ ] **Step 8: 손잡이 CSS** — `styles/node-style.ts` 에 덧붙이고 `NODE_STYLE_CSS = [PALETTE, NODE_RULES, GRIP_RULES].join("\n")`:

```ts
/**
 * 노드 크기 손잡이(계획 Task 4, Ruling 16) — 오른쪽·아래 변 가운데에는 네 변 잇기 손잡이(.rsf-link, z-index 6)가 있어 75% 자리에 둔다.
 * 몸통 받기(.rsf-drop, z-index 5)·잇기 손잡이보다 위. 누름을 받는 표시라 nodrag nopan 을 단다.
 */
const GRIP_RULES = `
.rsf-node-grip {
  position: absolute; box-sizing: border-box; width: 10px; height: 10px; z-index: 7; pointer-events: auto; touch-action: none;
  background: var(--color-bg); border: 1.5px solid var(--color-primary); border-radius: 2px;
}
.rsf-node-grip:hover { background: var(--color-primary-soft); }
.rsf-node-grip[data-grip="e"] { right: -5px; top: calc(75% - 5px); cursor: ew-resize; }
.rsf-node-grip[data-grip="s"] { left: calc(75% - 5px); bottom: -5px; cursor: ns-resize; }
.rsf-node-grip[data-grip="se"] { right: -5px; bottom: -5px; cursor: nwse-resize; }
`;
```

- [ ] **Step 9: 통과 확인** — 두 시험 파일 → PASS. 이어 `… vitest run tests/dme/ruleSetEdit/group-pad.test.ts tests/dme/ruleSetEdit/flow-connect.test.ts tests/dme/ruleSetEdit/flow-drag.test.ts tests/dme/ruleSetEdit/final-fix.test.ts` → PASS(기대값을 고치지 않는다).

- [ ] **Step 10: 전체·타입·audit** — 전체 시험 실패 0, lint 0, audit 두 개를 `canvas/node-size.ts`·`canvas/nodes.tsx`·`canvas/FlowCanvas.tsx`·`page.tsx`·`styles/node-style.ts` 에 → 0건.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/node-size.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-size-grip.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-size-page.test.ts
/usr/bin/git commit -m "feat(m-mdm): 고른 룰·빈 단계 노드를 오른쪽·아래 손잡이로 끌어 크기를 바꾼다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/node-size.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/node-style.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-size-grip.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/node-size-page.test.ts
```

---

### Task 5: 문서·결정

**모델:** haiku — 아래 글을 정해진 자리에 그대로 넣는다.

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 D-130 한 항목)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(§3.2 표 RULE·TASK 행, §4 표 끝 행, §5.3 표 「그룹 크기」 행 다음, §11 표 N-27 다음)

**Interfaces:**
- Consumes: Task 1~4 의 병합 커밋 해시(컨트롤러가 진행 장부에서 넘긴다 — `<T1>`…`<T4>` 자리를 실제 해시로 바꾼다).
- Produces: 없음.

- [ ] **Step 1: `docs/mdm/decisions.md` 끝에 붙이기**(앞 항목과 빈 줄 하나 사이, 6줄 형식)

```markdown
## D-130 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 — 룰 노드 외관 옵션, 사용자가 세부 판단을 맡김)
- **Decision needed**: 룰·빈 단계 노드 외관 옵션의 저장·표시·편집 방식(사용자 요청 「각 룰에 대해 외관 옵션도 있으면 좋겠다」 — 색·크기·표시 항목·아이콘·모양 모두, 룰·빈 단계만, 크기는 모서리 끌기, 아이콘·모양은 정해진 목록)
- **Decision made**: S-D1 저장은 `view.styles[nodeId]`, 빈 값이면 키 생략(메모리에서도) · S-D2 색은 고정 팔레트 7가지(채움·테두리 한 쌍, shared 의미 토큰을 섞은 `:root` 토큰 + `[data-mantine-color-scheme="dark"]` 값) · S-D3 상태 표시(디버그·선택·검사)가 색보다 우선(색 규칙은 `.rsf-node:where([data-color])`) · S-D4 크기 232~640 × 68~320, 손잡이 e·s·se(잇기 손잡이를 비켜 75% 자리), 왼쪽 위 고정 · S-D5 모든 크기 계산을 `nodeSizeOf` 로 통일, 접힌 블록은 기본 크기(그룹 틀도 그린 접힌 상자로 잰다) · S-D6 크기를 바꾸면 그린 위치 전부를 저장 위치로 적고(크기가 그대로면 적지 않음) 커져서 겹치면 겹친 채 둔다 · S-D7 숨길 항목은 sub·id·open 3개, 제목·상태 표시는 늘 보임 · S-D8 아이콘 12개(Tabler), 모양 3가지 · S-D9 외관 편집 UI 는 오른쪽 패널 「외관」 섹션(편집 모드만, 누름 단추·체크·숫자 칸), 크기만 캔버스 손잡이도 · S-D10 빈 단계→룰 지정·붙여넣기·복제 때 외관 유지·복사 · S-D11 높이가 기본보다 크면 제목을 여러 줄(line-clamp)로 · S-D12 스타일 정리는 정규화 한 곳(`stylesFor` — toEditFlow·clone·done·dropNodes). 자동 배치는 폭이 다른 갈래가 겹치면 갈래를 벌린다(`spreadLanes`)
- **Rationale**: 백엔드가 view 를 그대로 통과시켜 계약 변경이 없고, 외관 없는 세트의 저장 글자·dirty 기준이 그대로다(G2 pad 와 같은 원칙). Camunda Modeler 의 요소 색·크기 조절 방식과 같고, 그린 크기와 배치·스냅·그룹·선 계산이 어긋나지 않는다
- **Reversible**: yes(선택 필드)
- **Source**: 스펙 `docs/superpowers/specs/2026-10-01-rule-set-flow-node-style-design.md` §6, 계획 `docs/superpowers/plans/2026-10-01-rule-set-flow-node-style.md` Rulings, 사용자 요청. 영향: view 저장 형식(선택 필드), 캔버스 노드·오른쪽 패널. 병합 커밋: <T1>(모델·크기), <T2>(노드 그리기), <T3>(외관 섹션), <T4>(크기 손잡이)
```

- [ ] **Step 2: 기능설계서 고치기**

§3.2 표의 `RULE` 행 「표시 내용」 끝에 덧붙인다: ` · 외관(S1, D-130): \`view.styles\` 의 색(\`data-color\`)·모양(\`data-shape\`)·아이콘(\`flow-node-icon-{nodeId}\`)·숨긴 표시 항목(종류·정책 줄·룰 ID 줄·열기 단추)·크기(232~640 × 68~320, 높으면 제목 여러 줄)`. `TASK` 행 끝에도 ` · 외관(S1): 룰과 같고 숨길 항목은 안내 줄 하나`.

§4 표 끝에 행을 더한다:

```markdown
| D-007 | (`FLOW_JSON.view.styles`) | 외관(S1) | 오른쪽 「외관」 섹션(`flow-section-node-style`, 편집 모드의 룰·빈 단계만): 색 견본 7개 `flow-style-color-{색}`, 아이콘 13칸 `flow-style-icon-{키\|none}`, 모양 3가지 `flow-style-shape-{round\|square\|pill}`, 표시 항목 체크(「…보이기」), 너비·높이 `flow-style-w`·`flow-style-h` + [기본 크기] `flow-style-size-reset`, [외관 초기화] `flow-style-reset` | — | 없음(지금 모양) | 조작 하나가 편집 한 번(되돌리기 한 칸). 숫자 칸은 Enter·칸 밖 누르기에 저장하고 범위로 자른다. 크기를 바꾸면 그때 그린 위치 전부를 저장 위치로 적는다. 외관을 쓰지 않은 세트는 `styles` 키가 없어 저장 글자가 예전과 같다(D-130) |
```

§5.3 표의 「그룹 크기(G2, 4단계)」 행 다음에:

```markdown
| 노드 크기(S1) | 편집 모드에서 룰·빈 단계 노드 하나만 고르면 오른쪽 변·아래 변(각 75% 자리 — 가운데는 잇기 손잡이)·오른쪽 아래 모서리에 손잡이(`flow-node-grip-{nodeId}-{e\|s\|se}`)가 뜬다. 왼쪽 위는 고정이고 너비 232~640·높이 68~320 으로 자른다. 끄는 동안은 화면에서만 바뀌고 놓을 때 한 번 기록한다(되돌리기 한 칸). 기록할 때 그린 위치 전부를 저장 위치로 적어 이웃이 밀리지 않으며, 커져서 겹치면 겹친 채 둔다([자동 정렬]이 노드별 크기로 다시 놓는다). 접힌 블록·분기·시작·끝·메모에는 손잡이가 없다 |
```

§11 표의 N-27 행 다음에:

```markdown
| N-28 | **룰 노드 외관(S1)** — ① 저장은 `view.styles[nodeId]`(색·w·h·hide·icon·shape, 기본값과 같은 칸은 두지 않음)이고 백엔드는 view 를 그대로 통과시킨다. ② 디버그·선택·검사 표시가 색보다 우선한다. ③ 크기는 배치·스냅·그룹 틀·선 끝·놓기 대상 모두에 쓰이고 접힌 블록은 룰 기본 크기다(그룹 틀도 그린 접힌 상자로 잰다). ④ 노드를 지우면 외관도 지우고, 빈 단계에 룰을 지정해도·복사·복제해도 외관이 따라간다. ⑤ 앱에 어두운 테마가 없어 어두운 화면 값은 Mantine 의 `data-mantine-color-scheme="dark"` 에만 둔다 | 스펙 `2026-10-01-rule-set-flow-node-style-design.md`, D-130 |
```

- [ ] **Step 3: 확인** — `grep -c "^## D-130 " docs/mdm/decisions.md` → 1. `grep -n "N-28\|D-007\|노드 크기(S1)" docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` → 세 줄 이상. `<T1>` 같은 자리 표시가 남지 않았는지 `grep -n "<T[1-4]>" docs/mdm/decisions.md` → 0건.

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): 룰 노드 외관 옵션 결정 D-130 과 기능설계서 외관 행을 남긴다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- docs/mdm/decisions.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

---

## 최종 검증(컨트롤러)

- `cd src/frontend/m-mdm && rtk proxy pnpm run test` — `[m-mdm test 합계]` 실패 0, 기준선 대비 증가 수를 적는다.
- `cd src/frontend && rtk proxy pnpm --filter @dk-oasis/m-mdm run lint` — 오류 0.
- audit 두 개를 이 기능이 바꾼 화면 파일 전부에 → 0건. `.css` import grep 0건.
- `grep -rn "NODE_SIZE\[" src/frontend/m-mdm/pages/dme/ruleSetEdit` — `flow-layout.ts`(`nodeSize`·`foldOffsetX`)와 `canvas/nodes.tsx`(`handlesOf` 기본값)만 남는다.
- 스펙 §4 시험 목록 대조: 모델(Task 1 model), 크기(Task 1 layout·size, Task 4), 캔버스(Task 2·4), 패널(Task 3), memo(Task 1 size·Task 4 grip).

## 수동 브라우저 확인(컨트롤러, ego-browser, dev 병합 뒤 본체 재기동)

1. 편집 모드에서 룰 노드를 고르고 「외관」 섹션에서 색 일곱 가지를 차례로 누른다 — 채움이 옅고 글자가 잘 읽히며, 노드를 고른 테두리(파랑 고리)가 색 테두리보다 눈에 띈다.
2. 디버그 모드로 실행해 멈춘다 — current 노드의 굵은 파랑 테두리·error 의 빨강 고리·pending 의 회색 흐림이 색 노드에서도 그대로 보인다.
3. 아이콘·모양(각진·알약)·표시 항목 숨기기를 바꾼다 — 알약 모양에서 글자가 둥근 끝에 닿지 않는다.
4. 오른쪽 아래 손잡이로 크기를 키운다 — 끄는 동안 선 끝이 따라오고, 놓으면 이웃 노드가 움직이지 않는다. 높이를 키운 긴 제목이 여러 줄로 보인다. 오른쪽·아래 변 가운데의 잇기 손잡이가 크기 손잡이에 가리지 않는다.
5. [자동 정렬] — 큰 노드 아래·옆 노드가 겹치지 않는다(IF 갈래 안의 큰 노드 포함). 되돌리기로 하나씩 돌아간다.
6. 저장 뒤 다시 열어 외관이 남는다. 외관을 쓰지 않은 다른 세트를 열고 아무것도 고치지 않으면 저장 단추가 꺼져 있다(dirty 아님).
```
