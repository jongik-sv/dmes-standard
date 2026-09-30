# 룰 세트 흐름도 4단계 구현 계획 — 값 고쳐 이어 실행·빈 단계·선분 손잡이·그룹 크기·Camunda 식 배치

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트 편집 화면(`dme/ruleSetEdit`)에 디버거 값 고쳐 이어 실행(E4), 입출력 없이 지나가는 빈 단계 노드(T1), Camunda 식 선분 손잡이(W1), 그룹 크기 조절(G2), Camunda Modeler 식 배치(떠 있는 도구 상자·오른쪽 섹션 패널, P1)를 더한다.

**Architecture:** 엔진 계약(Task 1)을 먼저 넓힌 뒤 엔진·API(Task 2·3)와 화면(Task 4~11)을 병렬 흐름으로 나눈다. E4 는 서버가 처음부터 다시 실행하며 k 번째 노드 직전에 고친 값을 그 범위 ctx 에 넣는 방식이라 엔진 재개 입구가 없다. 화면은 지금 구조(순수 함수 `flow-edit.ts`·`route-path.ts`, 캔버스 안 저장소 + `useSyncExternalStore`, 단축키 디스패처 `canvas/shortcuts.ts` 하나)를 그대로 따른다.

**Tech Stack:** Java 21, Spring Boot + OASIS(BPMN), SQLite, JUnit 5, TypeScript + React 19 + Mantine 9.6, `@xyflow/react` 12.x(`@xyflow/system@0.0.83`), AG Grid 33(`@dk-oasis/shared/grid` `AgDataGrid`), Vitest(happy-dom), json-schema-to-typescript(`gen:contract`).

**Spec:** `docs/superpowers/specs/2026-10-01-rule-set-flow-phase4-design.md`(권위). 앞 스펙 `2026-09-29-rule-set-flow-design.md`(흐름 모델·RunTrace §4.2)·`2026-09-30-rule-set-flow-editor-debugger-design.md`(재생 방식 §4.2)와 3단계 계획 `docs/superpowers/plans/2026-09-30-rule-set-flow-phase3.md` 의 편차 P-D1~P-D16 은 이 계획이 바꾼다고 적지 않은 한 그대로 유효하다.

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow-4`, 브랜치 `feat/rule-set-flow-phase4`(dev 에서 분기, 이 계획 커밋 포함). 태스크마다 하위 워크트리 `.claude/worktrees/rsf4-tN`(브랜치 `rsf4-tN`, 그때의 feat 끝에서 분기)에서 구현하고, 리뷰 통과 뒤 feat 에 `--no-ff` 로 병합한다. 모든 명령은 해당 워크트리 루트 기준이다.

**병렬 순서(스펙 §6):** 동시에 도는 구현 에이전트는 셋까지.

| 태스크 | 흐름 | 먼저 병합돼야 할 태스크 |
|---|---|---|
| 1 계약 | C | — |
| 2 엔진 | B | 1 |
| 3 API·서비스 | B | 2 |
| 4 선 경로 순수 함수 | W1 | — |
| 5 선분 손잡이 캔버스 | W1 | 4 |
| 6 그룹 크기 | G2 | — |
| 7 도구 상자·도구 모드·미니맵 | P1 | — |
| 8 오른쪽 머리글·섹션 패널·룰 목록 섹션 | P1 | 7 |
| 9 빈 단계 화면·룰 지정 | F1 | 1, 8 |
| 10 디버거 모델·시뮬 훅 | F2 | 1 |
| 11 디버거 편집 화면 | F2 | 10 |
| 12 문서·결정 | — | 전부 |

첫 물결은 1·4·7. 자리가 나면 앞 조건이 모두 병합된 태스크 가운데 번호가 작은 것부터 연다. 같은 파일(`FlowCanvas.tsx`·`nodes.tsx`·`flow-edit.ts`·`page.tsx`)을 고치는 태스크가 동시에 돌면 병합 충돌은 나중에 병합하는 쪽에서 컨트롤러가 푼다.

---

## Global Constraints

- 공개 엔진 계약(`engine-contract.schema.json`·Java 계약 타입·`engine-contract.generated.ts`·`RunTraceJson`)은 **Task 1 만** 바꾼다. 다른 태스크는 계약 파일을 고치지 않는다(필요하면 BLOCKED 로 보고).
- 저장 형식: 흐름 JSON(`FLOW_JSON`)의 노드 종류에 `TASK` 가 더해지고(Task 1·2), view 에 `groups[].pad` 가 더해진다(Task 6). 그 밖의 저장 형식은 바꾸지 않는다. 서버 `RuleSetFlowJson` 은 view 를 그대로 통과시킨다.
- 새 action 동사를 만들지 않는다(ADR-0003 D5). `ruleSetEdit` 는 search·view·save·delete·restore·validate·execute 7개 그대로. E4 는 `execute` 의 새 칸 `editsJson` 으로 한다.
- OASIS params 는 Map·List DTO 칸을 묶지 못한다(`S999 Generic type`). 목록·객체는 JSON 문자열로 받는다(`editsJson`).
- DB 검증은 SQLite 만 한다. 도커를 쓰지 않는다. 구현 태스크는 서버(bootRun·local-run·fe-run)를 띄우지 않는다. 브라우저 확인은 계획 끝 「수동 브라우저 확인」에서 컨트롤러만 한다(ego-browser).
- 화면 작업은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 따른다. 규칙 정본은 `docs/guide/FrontEnd/Local-Rules.md`(특히 §8 한 변 색 바 금지, §11 늦은 응답 버리기, §12 그리드 칸 렌더러에 입력 요소 금지, §16 무거운 계산 의존성, §17 로컬 .css import 금지, §19 React Flow 캔버스 함정). 바꾼 파일은 커밋 전 스킬의 `audit` 두 개가 0건이어야 한다. 표 모양은 AG Grid(`AgDataGrid`).
- 새 CSS 는 `styles/*.ts` 의 TS 문자열 상수로만 넣고 `page.tsx` 의 `<style href precedence>` 주입을 따른다. 색은 의미 토큰(`var(--color-*)`)만.
- 성능(Local-Rules §16·§19): 끄는 동안 page 를 다시 그리지 않는다(캔버스 안 저장소 + `useSyncExternalStore`, 놓을 때 콜백 한 번). 끄는 동안 dagre 호출이 늘지 않는다(`tests/dme/ruleSetEdit/final-fix.test.ts` 식 검사). 노드·선 memo 의존성을 더하면 **바꾸는 prop 하나만 바꾸고 나머지는 같은 참조로 둔 시험**으로 확인한다.
- 단축키는 `canvas/shortcuts.ts` 디스패처 하나뿐이다. `disableKeyboardA11y` 유지, Alt+글자는 `e.code`, 할 일이 없으면 UNHANDLED(= preventDefault 안 함). 편집 뒤 `document.activeElement` 가 body 면 캔버스 host 로 초점을 돌린다.
- 새 노드 좌표는 저장하지 않는다(Ruling 19 — 그릴 때 저장 위치 없는 노드만 비켜 겹침을 푼다). 선 경로를 바꾸는 편집은 `view.routes` 에만 쓴다.
- 브라우저 저장소(localStorage)는 개인 편의에만, `debugger/local-store.ts` 를 거쳐(try/catch) 쓴다. 이 계획의 새 UI 상태(도구, 섹션 펼침, 고친 값)는 저장하지 않는다.
- 컴포넌트 테스트는 `src/frontend/m-mdm/tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 테스트는 파일 머리에 `/** @vitest-environment happy-dom */`.
- `docs/mdm/decisions.md` 는 append-only 이고 **Task 12 만** 쓴다. 기능설계서(`docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`)는 각 태스크가 자기 기능 행·절만 고친다.
- git: 워크트리 루트에서 `/usr/bin/git` 로 단순 한 줄 명령만(cd 결합·파이프 금지). 커밋은 자기가 만든·고친 파일만 경로로 지정(`/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "..." -- <paths>`, 삭제는 `/usr/bin/git rm <path>`). `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(scope): 한국어 요약` + 빈 줄 + 트레일러 두 줄:
  - `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2`
- 테스트 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - 엔진: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` / 한 클래스 `--tests '*이름'`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 화면: 워크트리에서 처음 한 번 `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`. 테스트 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`. 타입 검사는 `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint`(rtk 가 `pnpm run lint` 를 eslint 로 바꿔 실패하므로 `rtk proxy` 를 붙인다; tsc --noEmit 이다). 완료 게이트: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 `[m-mdm test 합계]` 줄.
  - 계약 생성: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract`.
  - `pnpm build`(모든 `--filter … build` 포함)는 본체 checkout 에서 local-run·fe-run 이 떠 있을 때 돌리지 않는다. `local-run.sh` 에 `TSUP_DTS=0` 과 `--all` 을 함께 쓰지 않는다.
- 기준선: 착수 때 컨트롤러가 엔진·lib·api·화면 테스트 수를 한 번 돌려 진행 장부에 적는다. 각 태스크 완료 보고는 그 기준선 대비 증감을 적는다.

## Review Focus

1. **고친 값 퍼짐 규칙이 엔진과 화면에서 같은가** — 병렬 갈래 안 입력 고침은 그 갈래 안에서만, 갈래가 만든 결과 고침은 합류까지, 최상위 결과 고침은 `finalValues` 까지, `made` 교체는 대소문자 무시로 이미 있을 때만. PARALLEL·MERGE 노드 직전 고침은 바깥 범위. 담당: Task 2(엔진 사례)·Task 10(`frames` 같은 사례를 같은 기대값으로).
2. **`editsJson` 값 모양과 null** — NUMBER 글자 보존(`2.50` 이 `2.5` 가 되면 "고침" 표시가 사라진다), BOOLEAN, [비우기]의 `null`(Java 에서 `Map.of`·`Map.copyOf` 를 쓰면 NPE). 담당: Task 3(서비스 왕복 시험에 `2.50`·`null` 포함)·Task 10.
3. **빈 단계(TASK) 흐름 해석이 Java 와 TS 에서 같은가** — 갈래 안 TASK, TASK 만 있는 흐름(START→TASK→END, `EMPTY` 없이 `EMPTY_TASK` 경고만), 순번. 담당: Task 1(TS `flow-model`)·Task 2(Java `FlowParser`)·Task 3(코퍼스 두 사례, `rule-set-corpus.test.ts`).
4. **룰 지정이 되돌리기 한 칸이고 그림을 흩뜨리지 않는가** — 지정 뒤 노드 ID·`view.positions`·`routes`·`labels`·선 배열이 그대로이고 되돌리기 한 번에 빈 단계로 돌아간다. 룰 줄을 빈 단계·룰 노드 위에 놓으면 선 끼우기보다 지정이 이긴다. 담당: Task 9.
5. **저장 view 가 새 필드를 버리지 않는가** — 그룹 `pad` 는 `updateGroup`·`sanitizeView`·`copyGroup`·붙여넣기 뒤에도 남고, 선분 끌기로 꺾는 점이 상한을 넘으면 조용히 잘리지 않고 거부·알림 뒤 되돌아간다. 담당: Task 5·6.

## 태스크 사이 조건(조각 작성자들이 서로에게 남긴 것 — 해당 태스크 구현자는 반드시 지킨다)

- Task 3: `editsJson` 의 값은 `recordJson` 과 같은 `RuleCaseJudge.INPUT`(BigDecimal) 매퍼로 푼다. 값 맵은 null 을 허용하는 `LinkedHashMap` 으로 만든다(`Map.of`·`Map.copyOf` 금지 — [비우기]가 `null` 을 보낸다).
- Task 1: TS 쪽 TASK 해석(`flow-model.ts` `TaskStep`, `set-model`, `trace-view.scopePaths`, `Record<FlowNodeKind, …>` 맵)을 이 태스크가 넣는다. 임시 값에는 `// SEAM(T9)` 를 단다. Task 9 는 `grep -rn "SEAM(T9)"` 로 모두 채운다.
- 중단점 대상 `BREAKABLE` 에 TASK 를 넣는 일: `debugger/useSimulation.ts` 쪽은 Task 10, `debug-menu.ts` 쪽은 Task 9.
- 병합 순서: Task 2 를 Task 9 보다 먼저 병합한다(그 사이 feat 에서 Java `FlowParser` 가 TASK 를 분기로 읽는다).
- `FlowCanvas.tsx` 머리 주석에 Task 5·6·7·9 가 각자 문단을 더한다. 나중에 병합하는 쪽이 모든 문단을 남긴다.
- 기능설계서의 새 행 번호는 태스크마다 "병합 때 다음 번호" 로 적는다. 겹치면 병합 때 컨트롤러가, 마지막으로 Task 12 가 정리한다.
- 화면은 `@mantine/*` 를 직접 import 할 수 없고 shared 에 Accordion·Tooltip 래퍼가 없다. 섹션은 `button aria-expanded`, 툴팁은 CSS 로 만든다(shared 래퍼 추가는 사용자 승인 사항이라 하지 않는다).

---

### Task 1: 계약 — `TASK` 노드·`EDIT_POINT_MISMATCH`·`RunTrace.edits`/`TraceEdit`·`traceSet` 4인자·생성 TS·TS 최소 처리

**모델:** sonnet — 네 벌(Java·스키마·생성 TS·`RunTraceJson`)을 같은 이름으로 맞추는 기계적 다파일 작업이다. 실행 의미는 Task 2 가 맡는다.

**이 태스크가 정한 것(Task 1 과 Task 2 의 경계):**
- Java 의 `NodeKind` 분기는 모두 `default` 가 있거나(`FlowParser.inRule`·`outRule` — TASK 는 1·1 로 떨어지고 이것이 맞는 값이다) `==` 비교라서, `NodeKind.TASK` 를 더해도 컴파일 오류가 나지 않는다. 블록 트리 타입 `flow.TaskStep` 과 `FlowParser`·`FlowKeys`·`FlowRun` 의 TASK 처리는 **Task 2** 가 한다. Task 1 과 Task 2 사이의 feat 위에서 Java `FlowParser` 는 TASK 를 분기로 잘못 읽지만, 이 사이에 TASK 를 만드는 코드와 사례가 없으므로 테스트는 모두 초록이다.
- `RuleEngine` 은 계약 타입(`ContractTypeShapeTest.CONTRACT_TYPES`)이므로 4인자 `traceSet` 은 **이 태스크가** 더한다. `ContractTypeShapeTest` 가 interface 몸체를 `text`·`textAndAst` 만 허용하므로 두 `traceSet` 모두 추상 메서드로 두고, 3인자 → 4인자 위임은 `MdmRuleEngine` 이 한다. 4인자에 비지 않은 목록이 오면 이 태스크에서는 `UnsupportedOperationException`(`// SEAM(T2)`)을 던지고 Task 2 가 지운다.
- TS 는 생성 타입에 `"TASK"` 가 들어오면서 `Record<FlowNodeKind, …>` 네 곳이 tsc 오류가 난다. 이 태스크는 그 네 곳과, TS 흐름 해석(`flow-model.ts`)의 `TaskStep` 블록을 함께 넣는다. Task 9(빈 단계 화면)가 Task 1·8 에만 기대므로 Task 2 보다 먼저 병합될 수 있고, 그때 화면 테스트가 `parseFlow` 에서 TASK 를 분기로 읽어 깨지지 않게 하려는 것이다. `TaskStep` 을 `Block` 합집합에 넣으면 `FlowTree` 걷기·`set-model` 걷기·`trace-view.scopePaths` 의 마지막 `else` 가 좁혀지지 않으므로 세 곳 모두 TASK 갈래를 명시한다.
- 빈 단계 경고는 `EngineWarning` 이 아니라 저장 검사 목록(`RuleSetCheck`, 서버 `RuleSetAnalyzer`·화면 `set-model.ts`)에 싣는다. 코드 이름은 **`EMPTY_TASK`**(WARN)이다. 이 태스크는 TS 합집합 `RuleSetCheckCode` 에 이름만 더하고, 서버 상수·경고를 내는 코드·코퍼스는 Task 3 이 한다. `EngineWarning.Code`·`EngineWarningCode` 는 늘리지 않는다(판정 중 경고이지 저장 검사가 아니다).
- 동치 코퍼스: 식 코퍼스 `engine-corpus.json` 은 오류 코드 enum 에 값이 늘어도 사례가 바뀌지 않는다. 세트 코퍼스 `rule-set-corpus.json` 은 빈 단계 경고와 한 벌이라 Task 3 이 사례를 더한다. 이 태스크의 계약 모양 테스트는 `EngineContractSchemaTest`·`ContractTypeShapeTest`·`engine-contract.generated.test.ts` 세 개다.

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:158-168`(`FlowNode` javadoc, `NodeKind` 에 `TASK`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java:30-45`(`Code.EDIT_POINT_MISMATCH`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java`(전체 — `edits` 컴포넌트, `TraceEdit` record)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleEngine.java:29-34`(4인자 `traceSet`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:83-104`(3인자 위임, 4인자, `RunTrace` 생성자 인자)
- Modify: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(159-163 `ErrorCode`, 366-379 `RunTrace`, 381-399 `NodeTrace` 설명, 400-410 뒤에 `TraceEdit` 새 정의, 428-441 `FlowNode` 설명, 454 `FlowNodeKind`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java:17-49`(`edits` 직렬화)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:106-107`(`RunTrace` 생성자 인자 `null`)
- Modify(생성): `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(`gen:contract` 로만)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`(19-49 타입, 64-65 차수표, 204-208 `build`, 241-270 `FlowTree` 걷기)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts:317-330`(걷기의 TASK 갈래)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts:92-95`(`scopePaths` 의 TASK)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts:11-18`(`NODE_SIZE.TASK` — `// SEAM(T9)`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:53-60`(`KIND_TEXT.TASK`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:22-29`(`KIND_TEXT.TASK`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts:60-76`(`RuleSetCheckCode` 에 `"EMPTY_TASK"`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:74-75`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java:85-108`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java`(사례 하나 추가)
- Create(Test): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java`
- Test: `src/frontend/m-mdm/tests/engine-contract.generated.test.ts:13-63`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts`·`set-model.test.ts`·`trace-view.test.ts`(사례 추가)

**Interfaces:**
- Consumes: 없음(첫 물결).
- Produces(다른 조각이 이 이름을 그대로 쓴다):
  - Java `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind { START, END, RULE, TASK, IF, PARALLEL, MERGE }`
  - Java `EngineEvaluationException.Code.EDIT_POINT_MISMATCH`(단계는 늘 `Stage.INPUT_CHECK` — Task 2 가 쓴다)
  - Java `public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes, Map<String, Object> finalValues, @Nullable List<Violation> violations, @Nullable List<TraceEdit> edits)`
  - Java `public record RunTrace.TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values)` — `beforeSeq` 는 1부터(`NodeTrace.seq` 와 같은 수), `values` 의 값은 null 일 수 있다(비우기).
  - Java `RuleEngine.traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits)` — 3인자는 `traceSet(set, record, evalTs, List.of())` 와 같다. 고친 값이 비면 `RunTrace.edits` 는 null 이다.
  - 스키마 `$defs/FlowNodeKind` 에 `"TASK"`(RULE 뒤), `$defs/ErrorCode` 에 `"EDIT_POINT_MISMATCH"`(끝), `$defs/RunTrace.properties.edits = {type: array, items: $ref TraceEdit}`(required 밖), 새 `$defs/TraceEdit`.
  - 생성 TS: `FlowNodeKind` 에 `"TASK"`, `ErrorCode` 에 `"EDIT_POINT_MISMATCH"`, `RunTrace.edits?: TraceEdit[]`, `export interface TraceEdit { beforeSeq: number; nodeId: string; values: { [k: string]: TypedValue } }`.
  - JSON(`RunTraceJson.toMap`): `edits` 가 null 이면 **키를 싣지 않는다**(그래서 기존 골든 7사례·HTTP 골든은 한 글자도 바뀌지 않는다). 있으면 `violations` 뒤에 `edits: [{beforeSeq, nodeId, values: {이름: TypedValue}}]`.
  - TS `flow-model.ts`: `export interface TaskStep { type: "TASK"; nodeId: string }`, `export type Block = Seq | RuleStep | TaskStep | Split`. TASK 는 들어오는 선·나가는 선이 하나씩이고, `FlowTree` 가 위치(관계)를 갖고, `ruleSteps()`·`ruleIds()` 에는 들지 않는다.
  - TS `types.ts`: `RuleSetCheckCode` 에 `"EMPTY_TASK"`(내는 곳은 Task 3).
  - 화면 이음새(Task 9 가 채운다): `flow-layout.ts` 의 `NODE_SIZE.TASK` 는 임시 값이고 `// SEAM(T9)` 이 붙는다. `canvas/nodes.tsx` 의 `KIND_CLASS`(`Record<string, string>` 이라 tsc 가 막지 않는다)·`flow-edit.ts` 의 `NODE_PREFIX`·`canvas/menus/debug-menu.ts` 와 `debugger/useSimulation.ts` 의 `BREAKABLE` 에는 이 태스크가 TASK 를 넣지 않는다.

- [ ] **Step 1: Java 계약 실패 테스트** — 세 파일을 고친다.

`ContractTypeShapeTest.java:74-75` 의 rule 줄에 `"rule.RunTrace$TraceEdit"` 를 더한다.

```java
                    "rule.RunTrace", "rule.RunTrace$NodeTrace", "rule.RunTrace$BranchTrace", "rule.RunTrace$NodeStatus",
                    "rule.RunTrace$BranchOutcome", "rule.RunTrace$TraceEdit",
```

`EngineContractSchemaTest.java` 의 대응표 주석 `R1-R18` 을 `R1-R19` 로 바꾸고(85행 주석과 236행 주석 두 곳), `RECORDS` 끝에 한 줄을 더한다.

```java
            new RecordPair("R18", RunTrace.BranchTrace.class, "BranchTrace", Set.of(), Set.of()),
            // 4단계 E4 — 디버거에서 고친 값(4단계 spec §2.2). RunTrace.edits 는 JSON 에서 선택 칸이다(없으면 키를 뺀다).
            new RecordPair("R19", RunTrace.TraceEdit.class, "TraceEdit", Set.of(), Set.of()));
```

`RuleSetTraceTest.java` 끝(마지막 `}` 앞)에 사례를 더한다.

```java
    @Test
    void 고친_값이_없는_4인자_기록은_3인자와_같고_edits_는_null() {
        RuleSetDefinition set = new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, ifFlow("X > 10"));
        RunTrace three = engine.traceSet(set, rec("X", new BigDecimal("20")), SampleRules.EVAL_TS);
        RunTrace four = engine.traceSet(set, rec("X", new BigDecimal("20")), SampleRules.EVAL_TS, List.of());
        assertEquals(three, four);
        assertNull(four.edits());
    }
```

- [ ] **Step 2: 실패 확인** — 공통 환경(`export JAVA_HOME=… PATH=…`) 뒤 `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*ContractTypeShapeTest' --tests '*EngineContractSchemaTest' --tests '*RuleSetTraceTest' --console=plain)` → 컴파일 오류(`RunTrace.TraceEdit`·`edits()`·4인자 `traceSet` 없음).

- [ ] **Step 3: Java 계약 구현**

`DefinitionLookup.java` — `FlowNode` javadoc 과 `NodeKind`:

```java
    /**
     * {@code ruleId} 는 RULE 만, {@code splitId}(짝 분기 노드 ID)는 MERGE 만 쓴다. {@code label} 은 화면 표시용이다.
     * TASK(빈 단계, 4단계 spec §1.1)는 {@code label} 만 쓰고 실행 때 아무것도 읽거나 만들지 않고 지나간다.
     */
    record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label) {}
```
```java
    enum NodeKind { START, END, RULE, TASK, IF, PARALLEL, MERGE }
```

`EngineEvaluationException.java` — `FLOW_INVALID` 뒤:

```java
        /** 세트 흐름이 구조 검사를 통과하지 못했다(plan D5). */
        FLOW_INVALID,
        /**
         * 디버거에서 고친 값(4단계 spec §2.2)의 자리가 실행 순서와 어긋났거나(그 순번 노드 ID 가 다르다), 실행이 오류 없이 끝났는데 쓰이지 않은
         * 고친 값이 남았다. 단계는 늘 {@link Stage#INPUT_CHECK} 이다.
         */
        EDIT_POINT_MISMATCH
```

`RunTrace.java` — 전체를 아래로 바꾼다(기존 javadoc·중첩 타입은 그대로 두고 `edits`·`TraceEdit` 만 더한다).

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 실행 기록(룰 세트 흐름도 spec §4.2, plan C5) — 디버거와 나중의 운영 기록 재생이 같은 형식을 쓴다.
 * 판정 오류는 던지지 않고 {@code violations} 에 담는다(plan D7 — 스키마 전용 EngineError 대신 목록).
 *
 * @param input       받은 레코드 사본
 * @param nodes       실행 순서대로 노드 기록. 실행 전(구조·존재·입력 키) 오류면 빈 목록
 * @param finalValues 멈춘 시점(또는 끝)까지 최상위에서 만든 결과 변수
 * @param violations  멈췄으면 위반 목록, 끝까지 갔으면 null
 * @param edits       고친 값을 끼워 다시 실행했으면 받은 고친 값 그대로(4단계 spec §2.3), 아니면 null. JSON 에서는 null 이면 키를 뺀다
 */
public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations, @Nullable List<TraceEdit> edits) {

    /**
     * 노드 하나의 기록. 종류마다 쓰는 칸만 채우고 나머지는 null 이다.
     * RULE: ruleId·ver·reads(실행 직전 ctx 에서 이 룰이 읽은 값)·result(OK 인 RULE 에만 있다. 없으면 JSON 에서 키를 뺀다).
     * IF: branches·chosenEdgeId. PARALLEL: order.
     * MERGE: splitId·merged(병렬 합류에서 합친 결과 이름). TASK: 칸 없이 status 만. ERROR 노드: violations.
     *
     * @param seq 1부터
     */
    public record NodeTrace(int seq, String nodeId, NodeKind kind, NodeStatus status,
            @Nullable String ruleId, @Nullable Integer ver, @Nullable Map<String, Object> reads, @Nullable RuleResult result,
            @Nullable List<BranchTrace> branches, @Nullable String chosenEdgeId,
            @Nullable List<String> order, @Nullable String splitId, @Nullable List<String> merged,
            @Nullable List<Violation> violations) {}

    /** IF 갈래 선 하나의 평가. {@code message} 는 ERROR 일 때 원인. */
    public record BranchTrace(String edgeId, BranchOutcome outcome, @Nullable String message) {}

    /**
     * 디버거에서 고친 값 하나(4단계 spec §2.2). {@code beforeSeq} 번째 노드(1부터, {@link NodeTrace#seq} 와 같은 수)를 시작하기 직전에
     * 그 노드 범위의 ctx 에 {@code values} 를 넣는다. 값이 null 이면 비우기, ctx 에 없던 이름이면 추가다. {@code values} 의 값은 null 일 수 있다.
     */
    public record TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values) {}

    public enum NodeStatus { OK, ERROR }

    /**
     * NOT_EVALUATED = 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않았다(그 외 선은 안 골랐을 때 포함).
     * 그래서 IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다.
     */
    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
```

`RuleEngine.java` — 3인자 `traceSet` 바로 뒤에 추상 메서드를 더한다(default 금지 — `ContractTypeShapeTest` 영구 규칙).

```java
    /**
     * 고친 값을 끼워 처음부터 다시 실행한 기록(4단계 spec §2.2, E4). {@code edits} 가 비면 3인자와 같다. 받은 고친 값은 {@link RunTrace#edits}
     * 로 되돌려 준다(비었으면 null). 고친 값 자리가 어긋나거나, 실행이 오류 없이 끝났는데 쓰이지 않은 고친 값이 남으면 {@code EDIT_POINT_MISMATCH}
     * 위반을 기록에 담는다. 운영 경로({@link #evaluateSet})는 고친 값을 받지 않는다.
     */
    RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits);
```

`MdmRuleEngine.java:83-104` — 기존 `traceSet` 을 아래 두 메서드로 바꾼다.

```java
    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs) {
        return traceSet(set, record, evalTs, List.of());
    }

    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
        Objects.requireNonNull(set, "set");
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(edits, "edits");
        if (!edits.isEmpty()) {
            // SEAM(T2): Task 2 가 FlowRun 에 고친 값을 넘기고 이 거부를 지운다.
            throw new UnsupportedOperationException("고친 값으로 다시 실행하기는 아직 없다");
        }
        Instant ts = truncate(evalTs);
        Map<String, Object> input = Collections.unmodifiableMap(new LinkedHashMap<>(record));
        Prepared p;
        try {
            p = prepare(set, record, ts);
        } catch (EngineEvaluationException e) {
            return new RunTrace(set.setId(), ts, input, List.of(), Map.of(), e.violations(), null);
        }
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true);
        try {
            run.run();
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues), null, null);
        } catch (EngineEvaluationException e) {
            run.nodes.add(run.failed(e.violations()));
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                    e.violations(), null);
        }
    }
```

`engine-contract.schema.json` — 다섯 곳.

```json
    "ErrorCode": {
      "description": "판정 오류 코드(Java EngineEvaluationException.Code 와 같은 이름).",
      "enum": ["RULE_NOT_FOUND", "SET_NOT_FOUND", "SET_DEPRECATED", "MISSING_KEY", "REQUIRED_NULL", "TYPE_CONVERSION",
               "CONSTANT_KEY", "RESERVED_KEY", "EVAL_TS_KEY", "UNIQUE_MULTIPLE_HITS", "ANY_CONFLICT", "EVALUATION_ERROR",
               "BRANCH_EVAL_ERROR", "FLOW_INVALID", "EDIT_POINT_MISMATCH"]
    },
```
```json
    "RunTrace": {
      "description": "룰 세트 실행 기록(Java RunTrace, 룰 세트 흐름도 spec §4.2). 판정 오류는 던지지 않고 violations 에 담는다. 실행 전 오류면 nodes 가 비었다. edits 는 디버거에서 고친 값을 끼워 다시 실행했을 때만 있고(4단계 spec §2.3), 없으면 키를 뺀다.",
      "type": "object",
      "properties": {
        "setId": { "type": "string" },
        "evalTs": { "$ref": "#/$defs/LocalDateTime" },
        "input": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/NodeTrace" } },
        "finalValues": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "violations": { "type": ["array", "null"], "items": { "$ref": "#/$defs/Violation" } },
        "edits": { "type": "array", "items": { "$ref": "#/$defs/TraceEdit" } }
      },
      "required": ["setId", "evalTs", "input", "nodes", "finalValues", "violations"],
      "additionalProperties": false
    },
```
`NodeTrace.description` 의 `MERGE: splitId·merged,` 뒤에 ` TASK: 칸 없이 status 만,` 을 넣는다. `BranchTrace` 정의 바로 뒤에 새 정의를 넣는다.

```json
    "TraceEdit": {
      "description": "디버거에서 고친 값 하나(Java RunTrace.TraceEdit, 4단계 spec §2.2). beforeSeq 번째 노드(1부터, NodeTrace.seq 와 같은 수)를 시작하기 직전에 그 노드 범위의 ctx 에 values 를 넣는다. NULL 은 비우기, ctx 에 없던 이름은 추가다.",
      "type": "object",
      "properties": {
        "beforeSeq": { "type": "integer", "minimum": 1 },
        "nodeId": { "type": "string", "minLength": 1 },
        "values": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } }
      },
      "required": ["beforeSeq", "nodeId", "values"],
      "additionalProperties": false
    },
```
`FlowNode.description` 을 `"흐름 노드(Java DefinitionLookup.FlowNode). ruleId 는 RULE 만, splitId 는 MERGE 만 쓴다. TASK(빈 단계)는 label 만 쓰고 실행 때 그냥 지나간다."` 로, `FlowNodeKind` 를 아래로 바꾼다.

```json
    "FlowNodeKind": { "description": "흐름 노드 종류(Java DefinitionLookup.NodeKind). TASK = 빈 단계(4단계 spec §1.1).", "enum": ["START", "END", "RULE", "TASK", "IF", "PARALLEL", "MERGE"] },
```

- [ ] **Step 4: 엔진 통과 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → PASS(기준선 + 4 — R19 대응쌍이 매개변수 테스트 셋에 한 번씩, `RuleSetTraceTest` 새 사례 하나). 이때 mdm lib 은 `RunTrace` 생성자 때문에 아직 컴파일되지 않는다(다음 단계).

- [ ] **Step 5: `RunTraceJson` 실패 테스트** — `RunTraceJsonTest.java` 를 만든다.

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import org.junit.jupiter.api.Test;

/** 4단계 spec §2.3 — 실행 기록 JSON 의 edits 칸. 없으면 키를 빼서 기존 골든이 그대로다. */
class RunTraceJsonTest {

    private static final Instant TS = LocalDateTime.of(2026, 6, 1, 9, 0).atZone(MdmClockConfig.KST).toInstant();

    @Test
    void edits_가_null_이면_키를_싣지_않는다() {
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null));
        assertFalse(m.containsKey("edits"));
        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations"), List.copyOf(m.keySet()));
    }

    @Test
    void edits_는_violations_뒤에_beforeSeq_nodeId_TypedValue_values_로_싣고_NULL_을_지킨다() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("GT_G", "B");
        values.put("GT_F", new BigDecimal("1.50"));
        values.put("GT_X", null);
        RunTrace t = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, List.of(new RunTrace.TraceEdit(3, "if1", values)));

        Map<String, Object> m = RunTraceJson.toMap(t);

        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations", "edits"), List.copyOf(m.keySet()));
        Map<String, Object> typed = new LinkedHashMap<>();
        typed.put("GT_G", Map.of("type", "STRING", "value", "B"));
        typed.put("GT_F", Map.of("type", "NUMBER", "value", "1.50"));
        typed.put("GT_X", Map.of("type", "NULL"));
        assertEquals(List.of(Map.of("beforeSeq", 3, "nodeId", "if1", "values", typed)), m.get("edits"));
    }
}
```

- [ ] **Step 6: 실패 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RunTraceJsonTest' --console=plain)` → 컴파일 오류(`RuleSetRunner.java:106` 의 `RunTrace` 생성자 인자 수).

- [ ] **Step 7: lib 구현** — `RuleSetRunner.java:106-107` 의 생성자 끝에 `, null` 을 붙인다.

```java
            return new RunTrace(UNSAVED, ts, Collections.unmodifiableMap(new LinkedHashMap<>(record)), List.of(), Map.of(),
                    List.of(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, null, "흐름을 읽을 수 없다: " + e.getMessage())), null);
```

`RunTraceJson.java` — 머리 javadoc 목록에 `<li>{@code edits}: null 이면 키를 뺀다(4단계 spec §2.3). 있으면 violations 뒤에 {@code {beforeSeq, nodeId, values}}, values 는 TypedValue.</li>` 를 더하고, `toMap` 끝과 새 도우미를 아래처럼 쓴다.

```java
        m.put("violations", violations(t.violations()));
        if (t.edits() != null) {
            m.put("edits", t.edits().stream().map(RunTraceJson::edit).toList());
        }
        return m;
    }

    private static Map<String, Object> edit(RunTrace.TraceEdit e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("beforeSeq", e.beforeSeq());
        m.put("nodeId", e.nodeId());
        m.put("values", values(e.values()));
        return m;
    }
```

- [ ] **Step 8: lib·api 통과와 골든 무변경 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` → PASS(기준선 + 2). `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' --tests '*DmeOasisHttpTest' --tests '*RuleSetRunnerTest' --tests '*RuleSetCaseRunTest' --console=plain)` → PASS. 골든 파일(`rule-set-trace-golden.json`)을 다시 쓰지 않았는데 `골든_기록과_같다`·`기록은_엔진_스키마_RunTrace_를_따른다`·HTTP 골든 비교가 통과해야 한다 — `edits` 키가 새지 않았다는 증거다.

- [ ] **Step 9: 생성 TS·생성 테스트** — 화면 준비(워크트리 첫 회: `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`) 뒤 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm gen:contract` 를 돌린다. `/usr/bin/git diff -- src/frontend/m-mdm/src/contract/engine-contract.generated.ts` 로 `FlowNodeKind` 에 `"TASK"`, `ErrorCode` 에 `"EDIT_POINT_MISMATCH"`, `RunTrace` 에 `edits?: TraceEdit[];`, 새 `export interface TraceEdit` 가 생겼는지 본다. `tests/engine-contract.generated.test.ts` 의 주석 `(49개)` 를 `(50개)` 로, `EXPECTED_EXPORTS` 의 `"BranchTrace",` 뒤에 `"TraceEdit",` 를 더한다.

- [ ] **Step 10: TS 실패 테스트** — 세 파일에 사례를 더한다.

`tests/dme/ruleSetEdit/flow-model.test.ts` 끝:

```ts
describe("빈 단계(TASK) — 4단계 spec §1.1", () => {
  /** start → t1(TASK) → r1(R1) → end */
  const taskFlow = (): RuleSetFlow =>
    flow(
      [node("start", "START"), node("t1", "TASK", { label: "빈 단계" }), node("r1", "RULE", { ruleId: "R1" }), node("end", "END")],
      [edge("e1", "start", "t1"), edge("e2", "t1", "r1"), edge("e3", "r1", "end")],
    );

  it("TASK 는 블록 트리의 TASK 칸이 되고 룰 목록에는 들지 않는다", () => {
    const p = parseFlow(taskFlow());
    expect(p.issues).toEqual([]);
    expect(p.tree!.root.items).toEqual([
      { type: "TASK", nodeId: "t1" },
      { type: "RULE", nodeId: "r1", ruleId: "R1" },
    ]);
    expect(p.tree!.ruleIds()).toEqual(["R1"]);
    expect(flowRuleIds(taskFlow())).toEqual(["R1"]);
    expect(p.tree!.relation("t1", "r1")).toBe("BEFORE");
  });

  it("IF 갈래 안의 TASK 는 그 갈래 본문이고 다른 갈래와 EXCLUSIVE 다", () => {
    const f = flow(
      [node("start", "START"), node("if1", "IF"), node("t1", "TASK"), node("r2", "RULE", { ruleId: "R2" }), node("m1", "MERGE", { splitId: "if1" }), node("end", "END")],
      [
        edge("e1", "start", "if1"),
        edge("e2", "if1", "t1", { order: 1, cond: "A = 1" }),
        edge("e3", "if1", "r2", { otherwise: true }),
        edge("e4", "t1", "m1"),
        edge("e5", "r2", "m1"),
        edge("e6", "m1", "end"),
      ],
    );
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type).toBe("SPLIT");
    if (split.type !== "SPLIT") return;
    expect(split.branches[0].body.items).toEqual([{ type: "TASK", nodeId: "t1" }]);
    expect(p.tree!.relation("t1", "r2")).toBe("EXCLUSIVE");
  });

  it("TASK 는 나가는 선이 하나여야 한다", () => {
    const f = flow(
      [node("start", "START"), node("t1", "TASK"), node("r1", "RULE", { ruleId: "R1" }), node("r2", "RULE", { ruleId: "R2" }), node("end", "END")],
      [edge("e1", "start", "t1"), edge("e2", "t1", "r1"), edge("e3", "t1", "r2"), edge("e4", "r1", "end"), edge("e5", "r2", "end")],
    );
    expect(parseFlow(f).issues).toContainEqual(S("t1", "t1의 나가는 선이 2개다. 1개여야 한다"));
  });
});
```

`tests/dme/ruleSetEdit/set-model.test.ts` 끝(`RuleSetCheck` 를 `../../../pages/dme/ruleSetEdit/types` import 에 더한다):

```ts
describe("flowChecks — 빈 단계(TASK)가 있는 흐름(4단계)", () => {
  const tn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
  const te = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });

  it("TASK 는 경로 검사에서 읽고 만드는 것이 없다 — 빈 단계 경고(EMPTY_TASK, Task 3)를 빼면 TASK 를 뺀 흐름의 검사와 같다", () => {
    const rules = byId(rule("R1", [], [n("A")]), rule("R2", [n("A")], [n("B")]));
    const withTask: RuleSetFlow = {
      version: 1,
      nodes: [tn("start", "START"), tn("r1", "RULE", { ruleId: "R1" }), tn("t1", "TASK"), tn("r2", "RULE", { ruleId: "R2" }), tn("end", "END")],
      edges: [te("e1", "start", "r1"), te("e2", "r1", "t1"), te("e3", "t1", "r2"), te("e4", "r2", "end")],
    };
    const without: RuleSetFlow = {
      version: 1,
      nodes: [tn("start", "START"), tn("r1", "RULE", { ruleId: "R1" }), tn("r2", "RULE", { ruleId: "R2" }), tn("end", "END")],
      edges: [te("e1", "start", "r1"), te("e3", "r1", "r2"), te("e4", "r2", "end")],
    };
    const strip = (cs: RuleSetCheck[]) => cs.filter((c) => c.code !== "EMPTY_TASK");
    expect(strip(flowChecks(withTask, rules, {}))).toEqual(flowChecks(without, rules, {}));
  });
});
```

`tests/dme/ruleSetEdit/trace-view.test.ts` 의 `describe("trace-view(손 기록)", …)` 안 끝에:

```ts
  it("병렬 갈래 안의 빈 단계(TASK)는 그 갈래 범위의 값을 본다 — 앞 룰 결과가 보이고 형제 갈래 값은 안 보인다", () => {
    /** start → par1 ─(p1: ra → t1)─(p2: rb)→ m1 → end */
    const flow: RuleSetFlow = {
      version: 1,
      nodes: [fnode("start", "START"), fnode("par1", "PARALLEL"), fnode("ra", "RULE", { ruleId: "RA" }), fnode("t1", "TASK"),
        fnode("rb", "RULE", { ruleId: "RB" }), fnode("m1", "MERGE", { splitId: "par1" }), fnode("end", "END")],
      edges: [fedge("e1", "start", "par1"), fedge("p1", "par1", "ra", 1), fedge("e2", "ra", "t1"), fedge("e3", "t1", "m1"),
        fedge("p2", "par1", "rb", 2), fedge("e4", "rb", "m1"), fedge("e5", "m1", "end")],
    };
    const trace: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("0") }, violations: null,
      finalValues: { X: N("1"), Y: N("3") },
      nodes: [
        node(1, "start", "START"),
        node(2, "par1", "PARALLEL", { order: ["p1", "p2"] }),
        ruleNode(3, "ra", "RA", { X: N("1") }),
        node(4, "t1", "TASK"),
        ruleNode(5, "rb", "RB", { Y: N("3") }),
        node(6, "m1", "MERGE", { splitId: "par1", merged: ["X", "Y"] }),
        node(7, "end", "END"),
      ],
    };
    const fr = frames(trace, flow);
    expect(fr[3].before.X).toEqual(N("1"));
    expect(fr[3].changed).toEqual([]);
    expect(fr[4].before.X).toEqual(N("0"));
  });
```

- [ ] **Step 11: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-model.test.ts tests/dme/ruleSetEdit/set-model.test.ts tests/dme/ruleSetEdit/trace-view.test.ts tests/engine-contract.generated.test.ts` → 새 사례 FAIL(`build` 가 TASK 를 분기로 읽어 `ParseStop` 또는 예외), 생성 테스트는 PASS.

- [ ] **Step 12: TS 구현**

`flow-model.ts` — `RuleStep` 인터페이스 뒤와 `Block`:

```ts
/** 빈 단계(TASK) 노드 하나 — 읽거나 만드는 것 없이 지나간다(4단계 spec §1.1). 엔진 `flow.TaskStep` 의 짝(Task 2). */
export interface TaskStep {
  type: "TASK";
  nodeId: string;
}
```
```ts
export type Block = Seq | RuleStep | TaskStep | Split;
```
차수표:
```ts
const IN_DEGREE: Record<FlowNodeKind, Degree> = { START: NONE, END: ONE, RULE: ONE, TASK: ONE, IF: ONE, PARALLEL: ONE, MERGE: MANY };
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, TASK: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE };
```
`build` 의 `seq` 안 RULE 갈래 바로 뒤(분기 코드 앞):
```ts
      if (node.kind === "TASK") {
        items.push({ type: "TASK", nodeId: cur });
        cur = next(cur);
        continue;
      }
```
`FlowTree` 생성자 걷기(`Position.order` 주석을 `깊이 우선 순번(RULE·TASK·분기 노드).` 로 고친다):
```ts
      for (const b of s.items) {
        if (b.type === "RULE") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
          this.steps.push(b);
        } else if (b.type === "TASK") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
        } else if (b.type === "SPLIT") {
          this.hasSplit = true;
          this.positions.set(b.nodeId, { chain, order: counter++ });
          b.branches.forEach((br, i) => walk(br.body, [...chain, { split: b.nodeId, kind: b.kind, branch: i }]));
        } else {
          walk(b, chain);
        }
      }
```

`set-model.ts` 의 `pathChecks` 안 `walk`:
```ts
    for (const b of seq.items) {
      if (b.type === "RULE") rule(b, s);
      else if (b.type === "SEQ") walk(b, s);
      else if (b.type === "TASK") continue; // 빈 단계 — 읽거나 만드는 이름이 없다(4단계 spec §1.1)
      else {
```

`trace-view.ts` 의 `scopePaths`:
```ts
      if (b.type === "RULE" || b.type === "TASK") paths.set(b.nodeId, path);
```

`flow-layout.ts` 의 `NODE_SIZE` — `RULE` 줄 뒤:
```ts
  TASK: { w: 200, h: 44 }, // SEAM(T9): 빈 단계 노드 크기·모양은 Task 9 가 정한다(점선 테두리·제목만, 4단계 spec §1.2)
```

`PropertyPanel.tsx` 의 `KIND_TEXT` — `RULE` 줄 뒤에 `TASK: "빈 단계 — 입력·출력 없이 지나간다. 룰을 지정하면 룰 노드가 된다",`. `TraceDetail.tsx` 의 `KIND_TEXT` — `RULE` 줄 뒤에 `TASK: "빈 단계",`.

`types.ts` 의 `RuleSetCheckCode` 끝:
```ts
  | "COND_UNTYPED"
  /** 흐름에 빈 단계(TASK)가 있다(WARN, 4단계 spec §1.1). 서버 `RuleSetAnalyzer`·화면 `set-model.ts` 가 내는 것은 Task 3. */
  | "EMPTY_TASK";
```

- [ ] **Step 13: TS 통과 확인** — Step 11 명령 → PASS. `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS(기준선 + 5). 바꾼 `.tsx` 두 파일에 대해 `.claude/skills/mantine-aggrid-ui/SKILL.md` 의 `audit` 두 개 → 0건.

- [ ] **Step 14: 전체 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`, `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)`, `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 `[m-mdm test 합계]` 줄 → 모두 PASS, 기준선 대비 증감을 완료 보고에 적는다.

- [ ] **Step 15: 커밋** — 계약 네 벌이 한 커밋에 들어가야 중간 커밋에서도 생성 TS 테스트가 깨지지 않는다.

```
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts
/usr/bin/git commit -m "feat(mdm-engine): 4단계 계약 — TASK 노드·EDIT_POINT_MISMATCH·RunTrace.edits(TraceEdit)·traceSet 4인자" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleEngine.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJsonTest.java src/frontend/m-mdm/src/contract/engine-contract.generated.ts src/frontend/m-mdm/tests/engine-contract.generated.test.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts
```

---

### Task 2: 엔진 — 빈 단계 통과와 고친 값 끼워 다시 실행(`traceSet` edits)

> **컨트롤러 Ruling(조각 합칠 때 더함):** 빈 단계만 있고 RULE 이 없는 흐름(START→TASK→END)도 저장·실행된다(Task 3 의 `EMPTY` 규칙). 엔진 `FlowParser`·`prepare()` 가 룰 없는 흐름을 거부하지 않는지 확인하고, `traceSet` 이 START·TASK·END 세 노드 기록과 빈 `finalValues` 를 내는 시험을 이 태스크의 TASK 시험에 하나 더한다. 거부하는 곳이 있으면 TASK 가 하나 이상이면 통과하게 고친다.


**모델:** opus — 노드 순번·범위(ctx·made)·병렬 갈래 사본·오류 기록 시점이 얽힌 실행 의미다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/TaskStep.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java:4`(permits)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java:211-217`(TASK → `TaskStep`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java:70-75`(javadoc 만)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java:110-235`(세 switch 에 `TaskStep`)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(전체)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:71-104`(`evaluateSet`·4인자 `traceSet`, `SEAM(T2)` 삭제)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java`(`task` 도우미)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java`(사례 3)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetFlowEvaluationTest.java`(사례 2)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java`(사례 3)
- Create(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceEditTest.java`

`RuleEngine.java` 는 Task 1 이 이미 4인자를 더했으므로 이 태스크는 고치지 않는다. 빈 단계 **검증 경고**는 저장 검사(`RuleSetCheck`)라 엔진에 맡을 부분이 없다 — 엔진은 `EngineWarning` 을 늘리지 않고, `FlowParser` 가 TASK 를 구조 오류 없이 통과시키는 것까지가 엔진 몫이다(경고는 Task 3).

**Interfaces:**
- Consumes: Task 1 의 `NodeKind.TASK`, `Code.EDIT_POINT_MISMATCH`, `RunTrace(…, edits)`, `RunTrace.TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values)`, `RuleEngine.traceSet(set, record, evalTs, List<RunTrace.TraceEdit>)`.
- Produces:
  - `public record kr.dongkuk.maru.mdm.engine.flow.TaskStep(String nodeId) implements Block`. `FlowParser` 는 TASK 노드를 `TaskStep` 으로 만들고, `FlowTree.ruleSteps()`·`ruleIds()` 에는 넣지 않으며 위치(관계)는 준다. TASK 의 구조 규칙은 RULE 과 같다(들어오는 선·나가는 선 하나씩). TASK 에 `ruleId` 가 있어도 무시한다.
  - 실행: TASK 는 `PathStep(nodeId, TASK, null, null)` 과 `NodeTrace(seq, nodeId, TASK, OK, 나머지 모두 null)` 만 남긴다. `FlowKeys` 는 TASK 를 건너뛴다(읽는 이름·만드는 이름 없음).
  - `FlowRun(RuleEvaluator, ExpressionRunner, FlowTree, Map<String, RuleDefinition>, FlowKeys, Map<String, Object> record, Instant ts, boolean tracing, List<TraceEdit> edits)` — `tracing=false` 에 비지 않은 edits 는 `IllegalArgumentException`.
  - **퍼짐 규칙(Task 10 의 `frames()` 가 같게 흉내 낸다):**
    1. 노드를 시작할 때(START·END·TASK·RULE·IF·PARALLEL·MERGE 모두) 다음 순번 `nodes.size() + 1` 이 `beforeSeq` 인 edit 를 목록 순서대로 적용한다. 같은 순번 edit 가 여럿이면 뒤 것이 이긴다.
    2. 그 노드의 ID 가 `edit.nodeId` 와 다르면 `Violation(INPUT_CHECK, EDIT_POINT_MISMATCH, ruleId=null, rowId=null, name=edit.nodeId, "고친 값 자리가 어긋났다: {seq}번째 노드는 {실제 ID} 인데 고친 값은 {edit.nodeId} 앞에 걸려 있다")` 로 멈추고, 그 자리 노드가 ERROR 노드가 된다(RULE 이면 ruleId·ver 가 채워진다).
    3. 값마다 `RecordKeys.putReplacing(그 범위 ctx, 이름, 값)` — 대소문자만 다른 키를 지우고 edit 표기로 넣는다. 값 null 은 비우기(키는 남고 값이 null), 없던 이름은 추가다.
    4. 그 범위 `made` 에 대소문자 무시로 같은 이름이 있으면 `RecordKeys.putReplacing(made, 이름, 값)` — **made 의 키 표기도 edit 표기로 바뀐다**. 없으면 made 는 그대로다. 최상위 made 는 `finalValues` 다.
    5. 범위: 최상위·IF 갈래는 최상위 ctx·made, 병렬 갈래 안은 그 갈래 사본 ctx·갈래 made, MERGE 는 분기를 감싼 범위다. 병렬 합류는 갈래 결과를 합친 **뒤** MERGE 를 시작하므로 MERGE 자리 edit 는 합친 값을 덮는다.
    6. 실행이 오류 없이 끝났는데 안 쓰인 edit 가 있으면 edit 마다 `Violation(INPUT_CHECK, EDIT_POINT_MISMATCH, null, null, edit.nodeId, "고친 값이 쓰이지 않았다: {beforeSeq}번째 노드({nodeId}) 앞에 닿기 전에 실행이 끝났다")` 를 `RunTrace.violations` 에 담는다. 이때 ERROR 노드는 더하지 않는다. 실행 중 오류로 멈췄으면 안 쓰인 edit 를 보지 않는다.
    7. `RunTrace.edits` = edits 가 비면 null, 아니면 `List.copyOf(edits)`(구조 오류·입력 키 오류로 실행 전에 멈춘 기록에도 되돌려 준다). `prepare()` 의 입력 키 사전 검사는 고친 값을 보지 않는다.

- [ ] **Step 1: 흐름 해석 실패 테스트** — `FlowFixtures.java` 의 `merge` 뒤에 도우미를 더한다.

```java
    /** 빈 단계(TASK, 4단계 spec §1.1). */
    public static FlowNode task(String id) {
        return new FlowNode(id, NodeKind.TASK, null, null, "빈 단계");
    }
```

`FlowParserTest.java` 에 `import static …FlowFixtures.task;` 를 더하고 `// ── 정상 ──` 묶음 끝에 사례 셋을 더한다.

```java
    @Test
    void TASK_는_TaskStep_블록이고_ruleSteps_에_들지_않지만_관계는_있다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertEquals(List.of(new TaskStep("t1"), new RuleStep("a", "R_A")), p.tree().root().items());
        assertEquals(List.of(new RuleStep("a", "R_A")), p.tree().ruleSteps());
        assertEquals(List.of("R_A"), p.tree().ruleIds());
        assertEquals(FlowTree.Relation.BEFORE, p.tree().relation("t1", "a"));
        assertFalse(p.tree().branched());
    }

    @Test
    void IF_갈래_안의_TASK_는_그_갈래_본문이고_다른_갈래와_EXCLUSIVE() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "c"),
                        e("et", "t1", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertEquals(List.of(new TaskStep("t1")), s.branches().get(0).body().items());
        assertEquals(FlowTree.Relation.EXCLUSIVE, p.tree().relation("t1", "c"));
    }

    @Test
    void TASK_는_나가는_선이_하나여야_한다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), rule("b", "R_B"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "t1", "b"), e("e4", "a", "end"), e("e5", "b", "end")));
        assertTrue(issues(f).contains("FLOW_STRUCTURE|t1|null|t1의 나가는 선이 2개다. 1개여야 한다"), issues(f).toString());
    }
```

- [ ] **Step 2: 실행 실패 테스트** — 세 파일.

`RuleSetFlowEvaluationTest.java`(`import static …FlowFixtures.task;` 추가) 끝에:

```java
    // ── 빈 단계(TASK, 4단계 spec §1.1) ──

    @Test
    void 빈_단계는_path_에_TASK_로_남고_steps_와_결과는_그대로다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("start:START:null:null", "t1:TASK:null:null", "a:RULE:null:0", "end:END:null:null"), path(r));
        assertEquals(List.of("R_A"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("2", r.finalValues().get("A"));
    }

    @Test
    void 빈_단계는_아무_이름도_만들지_않는다_IF_한_갈래가_빈_단계면_합류_뒤_읽기는_지연_키_검사다() {
        // start → if1 [b1 "X > 10" → t1] [그 외 → a(R_A)] → m1 → d(R_D: A + 1) → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("a", "R_A"), merge("m1", "if1"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "a"),
                        e("et", "t1", "m1"), e("ea", "a", "m1"), e("em", "m1", "d"), e("ed", "d", "end")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_D/null/A"), violations(fail(f, rec("X", new BigDecimal("20")))));
        assertNum("1", run(f, rec("X", new BigDecimal("-1"))).finalValues().get("D"));
    }
```

`RuleSetTraceTest.java`(`import static …FlowFixtures.task;` 추가) 끝에:

```java
    @Test
    void 빈_단계는_칸_없는_OK_노드로_남고_결과를_바꾸지_않는다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:t1:TASK:OK", "3:a:RULE:OK", "4:end:END:OK"), kinds(t));
        NodeTrace tn = t.nodes().get(1);
        assertEquals(new NodeTrace(2, "t1", NodeKind.TASK, NodeStatus.OK, null, null, null, null, null, null, null, null, null, null), tn);
        assertNum("2", t.finalValues().get("A"));
    }

    @Test
    void IF_갈래_안의_빈_단계를_타면_결과가_없다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "c"),
                        e("et", "t1", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", new BigDecimal("20")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:t1:TASK:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 병렬_갈래_안의_빈_단계는_합칠_이름이_없다() {
        FlowDefinition f = flow(List.of(start(), par("p1"), task("t1"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "t1", 1), pe("p1b", "p1", "b", 2),
                        e("et", "t1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:p1:PARALLEL:OK", "3:t1:TASK:OK", "4:b:RULE:OK", "5:pm:MERGE:OK", "6:end:END:OK"), kinds(t));
        assertEquals(List.of("B"), t.nodes().get(4).merged());
    }
```

`RuleSetTraceEditTest.java` 를 만든다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 4단계 spec §2.2 — 고친 값을 k 번째 노드 직전에 그 범위 ctx 에 넣고 처음부터 다시 실행한다(퍼짐 규칙·안전장치). */
class RuleSetTraceEditTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_AB", "AB", "A + 1", "A"), calc("R_DIV", "D", "10 / X", "X"), calc("R_Y", "YY", "Y + 1", "Y"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RunTrace trace(FlowDefinition f, Map<String, Object> record, TraceEdit... edits) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS, List.of(edits));
    }

    private static TraceEdit edit(int beforeSeq, String nodeId, Object... kv) {
        return new TraceEdit(beforeSeq, nodeId, rec(kv));
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    private static List<String> v(List<Violation> vs) {
        return vs.stream().map(x -> x.stage() + "/" + x.code() + "/" + x.ruleId() + "/" + x.rowId() + "/" + x.name()).toList();
    }

    /** start → a(R_A) → ab(R_AB: A + 1) → end. 순번 1 start, 2 a, 3 ab, 4 end. */
    private static FlowDefinition chain() {
        return flow(List.of(start(), rule("a", "R_A"), rule("ab", "R_AB"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "ab"), e("e3", "ab", "end")));
    }

    /** start → p1 [p1a → a(R_A) → ab(R_AB)] [p1b → b(R_B)] → pm → end. 순번 1 start, 2 p1, 3 a, 4 ab, 5 b, 6 pm, 7 end. */
    private static FlowDefinition parChain() {
        return flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("ab", "R_AB"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), e("e1", "a", "ab"), e("e2", "ab", "pm"),
                        pe("p1b", "p1", "b", 2), e("e3", "b", "pm"), e("ee", "pm", "end")));
    }

    @Test
    void 최상위에서_앞_룰_결과를_고치면_뒤_룰이_읽고_finalValues_도_바뀌며_받은_edits_를_되돌려_준다() {
        TraceEdit ed = edit(3, "ab", "A", new BigDecimal("10"));
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), ed);
        assertNull(t.violations());
        assertNum("10", t.nodes().get(2).reads().get("A"));
        assertNum("10", t.finalValues().get("A"));
        assertNum("11", t.finalValues().get("AB"));
        assertEquals(List.of(ed), t.edits());
    }

    @Test
    void 입력_변수를_고치면_뒤_룰이_새_값을_읽고_입력은_finalValues_에_들지_않는다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(2, "a", "X", new BigDecimal("5")));
        assertNum("6", t.finalValues().get("A"));
        assertNum("7", t.finalValues().get("AB"));
        assertFalse(t.finalValues().containsKey("X"));
        assertEquals(Map.of("X", BigDecimal.ONE), t.input());
    }

    @Test
    void IF_직전에_고치면_고른_갈래가_바뀐다() {
        // ifFlow: b1 "X > 10" → a, b2 "X > 0" → b, 그 외 → c. X=20 이면 b1 인데 -1 로 고치면 그 외.
        RunTrace t = trace(ifFlow(), rec("X", new BigDecimal("20")), edit(2, "if1", "X", new BigDecimal("-1")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:c:RULE:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        assertEquals("bo", t.nodes().get(1).chosenEdgeId());
        assertNum("2", t.finalValues().get("C"));
    }

    @Test
    void 병렬_갈래_안에서_입력을_고치면_그_갈래_안에서만_보이고_합류_뒤에는_원래_값이다() {
        // parFlow: start → p1 [a(R_A)] [b(R_B)] → pm → c(R_C) → end. 순번 1 start, 2 p1, 3 a, 4 b, 5 pm, 6 c, 7 end.
        RunTrace t = trace(parFlow(), rec("X", BigDecimal.ONE), edit(4, "b", "X", new BigDecimal("100")));
        assertNum("2", t.finalValues().get("A"));
        assertNum("102", t.finalValues().get("B"));
        assertNum("1", t.nodes().get(5).reads().get("X"));
        assertNum("4", t.finalValues().get("C"));
    }

    @Test
    void 병렬_갈래_안에서_그_갈래가_만든_결과를_고치면_합류까지_간다() {
        RunTrace t = trace(parChain(), rec("X", BigDecimal.ONE), edit(4, "ab", "A", new BigDecimal("50")));
        assertNull(t.violations());
        assertEquals(List.of("A", "AB", "B"), t.nodes().get(5).merged());
        assertNum("50", t.finalValues().get("A"));
        assertNum("51", t.finalValues().get("AB"));
        assertNum("3", t.finalValues().get("B"));
    }

    @Test
    void 합류_자리에서_고치면_갈래를_합친_값을_덮는다() {
        RunTrace t = trace(parChain(), rec("X", BigDecimal.ONE), edit(6, "pm", "A", new BigDecimal("7")));
        assertNum("7", t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
        assertNum("3", t.finalValues().get("B"));
    }

    @Test
    void ERROR_노드_직전에_고치면_오류를_비켜_간다() {
        FlowDefinition f = flow(List.of(start(), rule("d", "R_DIV"), end()), List.of(e("e1", "start", "d"), e("e2", "d", "end")));
        assertEquals(List.of("1:start:START:OK", "2:d:RULE:ERROR"), kinds(trace(f, rec("X", BigDecimal.ZERO))));
        RunTrace t = trace(f, rec("X", BigDecimal.ZERO), edit(2, "d", "X", new BigDecimal("2")));
        assertNull(t.violations());
        assertNum("5", t.finalValues().get("D"));
    }

    @Test
    void 자리의_노드_ID_가_다르면_EDIT_POINT_MISMATCH_로_그_노드에서_멈춘다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(2, "zzz", "A", new BigDecimal("10")));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:ERROR"), kinds(t));
        assertEquals(List.of("INPUT_CHECK/EDIT_POINT_MISMATCH/null/null/zzz"), v(t.violations()));
        assertEquals("R_A", t.nodes().get(1).ruleId());
        assertEquals(t.nodes().get(1).violations(), t.violations());
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 정상_완료인데_안_쓰인_고친_값이_남으면_ERROR_노드_없이_EDIT_POINT_MISMATCH() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(9, "end", "A", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:OK", "3:ab:RULE:OK", "4:end:END:OK"), kinds(t));
        assertEquals(List.of("INPUT_CHECK/EDIT_POINT_MISMATCH/null/null/end"), v(t.violations()));
        assertNum("2", t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
    }

    @Test
    void 실행_오류로_멈추면_안_쓰인_고친_값은_보지_않는다() {
        FlowDefinition f = flow(List.of(start(), rule("d", "R_DIV"), end()), List.of(e("e1", "start", "d"), e("e2", "d", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ZERO), edit(3, "end", "X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:d:RULE:ERROR"), kinds(t));
        assertTrue(t.violations().stream().noneMatch(x -> x.code() == Code.EDIT_POINT_MISMATCH), v(t.violations()).toString());
    }

    @Test
    void null_은_비우기이고_키는_남는다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(4, "end", "A", null));
        assertTrue(t.finalValues().containsKey("A"));
        assertNull(t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
    }

    @Test
    void 없던_이름을_더하면_뒤쪽_갈래_진입_키_검사가_고친_ctx_로_통과한다() {
        // start → if1 [b1 "X > 0" → y(R_Y: Y + 1)] [그 외 → c] → m1 → end. Y 가 없으면 IF 진입 키 검사로 멈춘다(RuleSetTraceTest).
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("y", "R_Y"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "y", 1, "X > 0"), other("bo", "if1", "c"),
                        e("ey", "y", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(2, "if1", "Y", new BigDecimal("4")));
        assertNull(t.violations());
        assertNum("5", t.finalValues().get("YY"));
    }

    @Test
    void made_는_대소문자를_무시해_찾고_키_표기는_고친_값_표기로_바뀐다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(4, "end", "a", new BigDecimal("10")));
        assertNum("10", t.finalValues().get("a"));
        assertFalse(t.finalValues().containsKey("A"));
    }

    @Test
    void 빈_단계_자리에서도_고친다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(2, "t1", "X", new BigDecimal("5")));
        assertNull(t.violations());
        assertNum("6", t.finalValues().get("A"));
    }

    @Test
    void 구조_오류로_실행_전에_멈춘_기록에도_받은_edits_를_되돌려_준다() {
        FlowDefinition noEnd = flow(List.of(start(), rule("a", "R_A")), List.of(e("e1", "start", "a")));
        TraceEdit ed = edit(2, "a", "X", BigDecimal.ONE);
        RunTrace t = trace(noEnd, rec("X", BigDecimal.ONE), ed);
        assertEquals(List.of(), t.nodes());
        assertEquals(Code.FLOW_INVALID, t.violations().get(0).code());
        assertEquals(List.of(ed), t.edits());
    }

    @Test
    void 고친_값이_없으면_edits_는_null_이다() {
        assertNull(trace(chain(), rec("X", BigDecimal.ONE)).edits());
    }

    @Test
    void 고친_값의_목록_자체가_null_이면_거부한다() {
        RuleSetDefinition set = new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, chain());
        assertThrows(NullPointerException.class, () -> engine.traceSet(set, rec("X", BigDecimal.ONE), SampleRules.EVAL_TS, null));
    }
}
```

- [ ] **Step 3: 실패 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --tests '*RuleSetFlowEvaluationTest' --tests '*RuleSetTraceTest' --tests '*RuleSetTraceEditTest' --console=plain)` → 컴파일 오류(`TaskStep` 없음). `TaskStep` 을 만든 뒤에는 `RuleSetTraceEditTest` 가 `UnsupportedOperationException`(Task 1 SEAM)으로 FAIL 한다.

- [ ] **Step 4: 흐름 해석 구현**

`flow/TaskStep.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

/** 빈 단계(TASK) 노드 하나 — 읽거나 만드는 것 없이 지나간다(4단계 spec §1.1). m-mdm {@code flow-model.ts} 의 {@code TaskStep} 짝. */
public record TaskStep(String nodeId) implements Block {}
```

`flow/Block.java`:

```java
/** 블록 트리 한 칸 — 순차·룰·빈 단계·분기. */
public sealed interface Block permits Seq, RuleStep, TaskStep, Split {}
```

`FlowParser.java` 의 `Builder.seq` 안 RULE 갈래 바로 뒤(분기 코드 앞 — 이 자리가 아니면 TASK 가 분기로 읽혀 `mergeOf.get(cur)` 이 null 이 된다):

```java
                if (n.kind() == NodeKind.TASK) {
                    items.add(new TaskStep(cur));
                    cur = next(cur);
                    continue;
                }
```

`FlowTree.java:70-75` javadoc 의 `두 노드(RULE·IF·PARALLEL)의 관계` 를 `두 노드(RULE·TASK·IF·PARALLEL)의 관계` 로 바꾼다.

`FlowKeys.java` 의 세 switch 에 한 줄씩 더한다(`import kr.dongkuk.maru.mdm.engine.flow.TaskStep;`). `walk` 는 `case RuleStep r -> {…}` 바로 뒤, `sureProduced`·`allProduced` 도 `case RuleStep r -> {…}` 바로 뒤:

```java
                case TaskStep t -> {
                    // 빈 단계 — 읽는 이름도 만드는 이름도 없다(4단계 spec §1.1).
                }
```

- [ ] **Step 5: `FlowRun` 구현** — 파일 전체를 아래로 바꾼다. 기존 분기·병렬·기록 논리는 한 줄도 바꾸지 않고, (1) 생성자 인자 `edits`, (2) `plain`·`merge` 가 범위 ctx·made 를 받는 것, (3) 노드마다 `edit(ctx, made)` 호출, (4) `TaskStep` 갈래, (5) `unusedEdits` 만 더한다.

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 빈 단계(TASK)는 아무것도 읽거나 만들지 않고 지나간다(4단계 spec §1.1).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다.
 *
 * <p>고친 값(4단계 spec §2.2): 노드를 시작할 때 다음 순번({@code nodes.size() + 1})이 {@code beforeSeq} 인 고친 값을 그 노드 범위의 ctx 에
 * {@link RecordKeys#putReplacing} 으로 넣고, 같은 이름(대소문자 무시)이 그 범위 made 에 있으면 made 도 같은 방법으로 바꾼다. 자리의 노드 ID 가
 * 다르면 {@code EDIT_POINT_MISMATCH} 로 멈춘다. 순번은 기록 노드 수로 세므로 고친 값은 {@code tracing} 에서만 받는다.
 */
final class FlowRun {

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;
    private final boolean tracing;
    private final List<TraceEdit> edits;
    /** edits 와 같은 자리 — 그 고친 값을 넣었는가. */
    private final boolean[] used;

    final Map<String, Object> ctx;
    /** 최상위에서 만든 결과 = RuleSetResult.finalValues / RunTrace.finalValues. */
    final Map<String, Object> finalValues = new LinkedHashMap<>();
    final List<RuleResult> steps = new ArrayList<>();
    final List<PathStep> path = new ArrayList<>();
    final List<EngineWarning> warnings = new ArrayList<>();
    final List<NodeTrace> nodes = new ArrayList<>();

    // 지금 처리 중인 노드 — 실행 중 위반이 나면 traceSet 이 ERROR 노드로 남긴다.
    private String curNodeId;
    private NodeKind curKind;
    private String curRuleId;
    private Integer curVer;
    private Map<String, Object> curReads;
    private List<BranchTrace> curBranches;
    private String curChosen;

    FlowRun(RuleEvaluator evaluator, ExpressionRunner runner, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys,
            Map<String, Object> record, Instant ts, boolean tracing, List<TraceEdit> edits) {
        if (!tracing && !edits.isEmpty()) {
            throw new IllegalArgumentException("고친 값은 기록 실행(traceSet)에서만 쓴다");
        }
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.tracing = tracing;
        this.edits = List.copyOf(edits);
        this.used = new boolean[this.edits.size()];
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        plain(tree.startId(), NodeKind.START, ctx, finalValues);
        seq(tree.root(), ctx, finalValues);
        plain(tree.endId(), NodeKind.END, ctx, finalValues);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations));
    }

    /** 정상 완료 뒤 쓰이지 않은 고친 값마다 위반 하나(없으면 빈 목록). 실행 중 오류로 멈춘 경우에는 부르지 않는다. */
    List<Violation> unusedEdits() {
        List<Violation> out = new ArrayList<>();
        for (int i = 0; i < edits.size(); i++) {
            if (!used[i]) {
                TraceEdit e = edits.get(i);
                out.add(editViolation(e, "고친 값이 쓰이지 않았다: " + e.beforeSeq() + "번째 노드(" + e.nodeId() + ") 앞에 닿기 전에 실행이 끝났다"));
            }
        }
        return out;
    }

    private void begin(String nodeId, NodeKind kind) {
        curNodeId = nodeId;
        curKind = kind;
        curRuleId = null;
        curVer = null;
        curReads = null;
        curBranches = null;
        curChosen = null;
    }

    /** 지금 시작한 노드(순번 nodes.size()+1)에 걸린 고친 값을 그 범위 ctx·made 에 넣는다(4단계 spec §2.2 퍼짐 규칙). */
    private void edit(Map<String, Object> ctx, Map<String, Object> made) {
        if (edits.isEmpty()) {
            return;
        }
        int seq = nodes.size() + 1;
        for (int i = 0; i < edits.size(); i++) {
            TraceEdit e = edits.get(i);
            if (e.beforeSeq() != seq) {
                continue;
            }
            if (!curNodeId.equals(e.nodeId())) {
                throw new EngineEvaluationException(List.of(editViolation(e, "고친 값 자리가 어긋났다: " + seq + "번째 노드는 " + curNodeId
                        + " 인데 고친 값은 " + e.nodeId() + " 앞에 걸려 있다")));
            }
            used[i] = true;
            for (Map.Entry<String, Object> v : e.values().entrySet()) {
                RecordKeys.putReplacing(ctx, v.getKey(), v.getValue());
                if (hasIgnoreCase(made, v.getKey())) {
                    RecordKeys.putReplacing(made, v.getKey(), v.getValue());
                }
            }
        }
    }

    private static boolean hasIgnoreCase(Map<String, Object> m, String name) {
        for (String k : m.keySet()) {
            if (k.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    private static Violation editViolation(TraceEdit e, String message) {
        return new Violation(Stage.INPUT_CHECK, Code.EDIT_POINT_MISMATCH, null, null, e.nodeId(), message);
    }

    /** 칸 없는 노드(START·END·TASK). */
    private void plain(String nodeId, NodeKind kind, Map<String, Object> ctx, Map<String, Object> made) {
        begin(nodeId, kind);
        edit(ctx, made);
        path.add(new PathStep(nodeId, kind, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, nodeId, kind, NodeStatus.OK, null, null, null, null, null, null, null,
                    null, null, null));
        }
    }

    private void seq(Seq seq, Map<String, Object> ctx, Map<String, Object> made) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> rule(r, ctx, made);
                case TaskStep t -> plain(t.nodeId(), NodeKind.TASK, ctx, made);
                case Split s when s.kind() == NodeKind.IF -> ifSplit(s, ctx, made);
                case Split s -> parallel(s, ctx, made);
                case Seq inner -> seq(inner, ctx, made);
            }
        }
    }

    private void rule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = defs.get(r.ruleId());
        begin(r.nodeId(), NodeKind.RULE);
        curRuleId = r.ruleId();
        curVer = def.ver();
        edit(ctx, made);
        if (tracing) {
            curReads = FlowKeys.reads(def, ctx);
        }
        List<Violation> missing = new ArrayList<>();
        for (String name : keys.deferred(r.nodeId())) {
            if (!ctx.containsKey(name)) {
                missing.add(FlowKeys.missing(def.ruleId(), name));
            }
        }
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        RuleResult result = evaluator.evaluate(def, ctx, ts);
        int index = steps.size();
        steps.add(result);
        for (Map.Entry<String, Object> e : result.results().entrySet()) {
            RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
            made.put(e.getKey(), e.getValue());
        }
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, index));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.OK, curRuleId, curVer, curReads, result,
                    null, null, null, null, null, null));
        }
    }

    private void ifSplit(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.IF);
        edit(ctx, made);
        curBranches = new ArrayList<>();
        Branch chosen = null;
        for (int i = 0; i < s.branches().size(); i++) {
            Branch br = s.branches().get(i);
            if (br.otherwise()) {
                continue;
            }
            if (chosen != null) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                continue;
            }
            BranchCondition c = BranchCondition.test(runner, br.cond(), ctx, keys.condTypes(br.cond()), ts);
            if (c.outcome == BranchCondition.TRUE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.TRUE, null));
                chosen = br;
            } else if (c.outcome == BranchCondition.FALSE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.FALSE, null));
            } else if (c.outcome == BranchCondition.NULL) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NULL, null));
                warnings.add(new EngineWarning(EngineWarning.Code.BRANCH_COND_NULL, null, null, null,
                        "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식 결과가 NULL 이라 거짓으로 봤다"));
            } else {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.ERROR, c.message));
                // 뒤 선(그 외 포함)은 평가하지 않았다 — branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 둔다.
                for (Branch rest : s.branches().subList(i + 1, s.branches().size())) {
                    curBranches.add(new BranchTrace(rest.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                }
                throw new EngineEvaluationException(List.of(new Violation(Stage.BRANCH_SELECT, Code.BRANCH_EVAL_ERROR, null, null,
                        br.edgeId(), "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식을 평가하지 못했다: " + c.message)));
            }
        }
        Branch other = s.branches().get(s.branches().size() - 1); // 그 외는 늘 마지막(plan C3)
        if (chosen == null) {
            chosen = other;
        }
        curBranches.add(new BranchTrace(other.edgeId(), chosen == other ? BranchOutcome.TRUE : BranchOutcome.NOT_EVALUATED, null));
        curChosen = chosen.edgeId();
        List<Violation> missing = keys.check(chosen.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(s.nodeId(), NodeKind.IF, chosen.edgeId(), null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.IF, NodeStatus.OK, null, null, null, null,
                    List.copyOf(curBranches), curChosen, null, null, null, null));
        }
        seq(chosen.body(), ctx, made);
        merge(s, null, ctx, made);
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
        edit(ctx, made);
        path.add(new PathStep(s.nodeId(), NodeKind.PARALLEL, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.PARALLEL, NodeStatus.OK, null, null, null, null, null,
                    null, s.branches().stream().map(Branch::edgeId).toList(), null, null, null));
        }
        Map<String, Object> base = new LinkedHashMap<>(ctx);
        List<Map<String, Object>> outs = new ArrayList<>();
        for (Branch br : s.branches()) {
            Map<String, Object> branchCtx = new LinkedHashMap<>(base);
            Map<String, Object> branchMade = new LinkedHashMap<>();
            seq(br.body(), branchCtx, branchMade);
            outs.add(branchMade);
        }
        List<String> merged = new ArrayList<>();
        for (Map<String, Object> out : outs) {
            for (Map.Entry<String, Object> e : out.entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                made.put(e.getKey(), e.getValue());
                if (!merged.contains(e.getKey())) {
                    merged.add(e.getKey());
                }
            }
        }
        merge(s, merged, ctx, made);
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). ctx·made 는 분기를 감싼 범위다 — 병렬은 갈래를 합친 뒤라 고친 값이 합친 값을 덮는다. */
    private void merge(Split s, List<String> merged, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.mergeId(), NodeKind.MERGE);
        edit(ctx, made);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null));
        }
    }
}
```

- [ ] **Step 6: `MdmRuleEngine` 구현** — `evaluateSet` 의 `FlowRun` 생성에 `, List.of()` 를 더한다. 4인자 `traceSet` 을 아래로 바꾸고 Task 1 의 `SEAM(T2)` 거부를 지운다(3인자 위임은 그대로).

```java
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, false, List.of());
```
```java
    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
        Objects.requireNonNull(set, "set");
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(edits, "edits");
        Instant ts = truncate(evalTs);
        Map<String, Object> input = Collections.unmodifiableMap(new LinkedHashMap<>(record));
        List<RunTrace.TraceEdit> echo = edits.isEmpty() ? null : List.copyOf(edits);
        Prepared p;
        try {
            p = prepare(set, record, ts);
        } catch (EngineEvaluationException e) {
            return new RunTrace(set.setId(), ts, input, List.of(), Map.of(), e.violations(), echo);
        }
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true, edits);
        try {
            run.run();
        } catch (EngineEvaluationException e) {
            run.nodes.add(run.failed(e.violations()));
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                    e.violations(), echo);
        }
        // 안 쓰인 고친 값은 정상 완료 때만 본다 — run() 안에서 던지면 failed() 가 END 를 ERROR 노드로 잘못 남긴다(4단계 spec §2.2).
        List<Violation> unused = run.unusedEdits();
        return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                unused.isEmpty() ? null : List.copyOf(unused), echo);
    }
```

`finalValues` 에는 이제 null 값이 들 수 있다(비우기). `Collections.unmodifiableMap` 은 null 을 받으므로 그대로 두고, `Map.copyOf` 로 바꾸지 않는다.

- [ ] **Step 7: 통과 확인** — Step 3 명령 → PASS. `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → PASS(기준선 + Task 1 + 이 태스크 25 — FlowParserTest 3·RuleSetFlowEvaluationTest 2·RuleSetTraceTest 3·RuleSetTraceEditTest 17). `grep -n "SEAM(T2)" src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java` → 0줄. mdm 쪽 회귀: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` → PASS(`RuleSetAnalyzer`·`RuleSetPathState` 는 `instanceof` 사슬이라 `TaskStep` 을 조용히 건너뛴다), `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSet*' --tests '*DmeOasisHttpTest' --console=plain)` → PASS(골든 무변경).

- [ ] **Step 8: 커밋**

```
/usr/bin/git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/TaskStep.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetFlowEvaluationTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceEditTest.java
/usr/bin/git commit -m "feat(mdm-engine): 빈 단계(TASK)는 그냥 지나가고 traceSet 이 고친 값을 끼워 처음부터 다시 실행한다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/TaskStep.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetFlowEvaluationTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceEditTest.java
```

---

### Task 3: API·서비스 — `execute` 의 `editsJson`, 빈 단계 경고 `EMPTY_TASK`, 기능설계서 서버 행

**모델:** sonnet — 칸 하나(`editsJson`)와 검사 한 줄(`EMPTY_TASK`)을 기존 관례(recordJson 오류 규칙, 코퍼스 짝)대로 넣는다.

**조사로 정한 것:**
- BPMN `execute`(`ruleSetEdit.bpmn:132-142`)는 `camunda:property name="dto" value="…RuleSetSimulateRequest"` 로 params 전체를 DTO 에 바인딩한다. 3단계의 `runCases`·`caseIds`·`setId` 도 DTO 필드만 더해 전달됐다. 그래서 `editsJson` 도 **DTO 필드(getter·setter)만 더하면 전달된다**. BPMN 은 머리 주석의 action 표 한 줄만 고치고 흐름·task·입력은 그대로 둔다. `DmeOasisHttpTest` 의 새 사례가 실제 HTTP 로 이것을 증명한다.
- `validate` action 은 서비스 `condIo`(IF 갈래 조건식 IO·식 파싱)라 **검사 목록을 싣지 않는다**. 빈 단계 경고가 실리는 곳은 기존 경고 목록이 실리는 곳 그대로다 — 서버 `save` 응답 `checks`(경고만), `view` 응답 `checks`, `restore` 응답 `checks`, 화면 즉시 계산 `flowChecks`. 이 태스크는 `save`·`view` 로 시험한다.
- 빈 단계 경고는 저장 검사 `RuleSetCheck`(서버 `RuleSetAnalyzer`·화면 `set-model.ts`, 코퍼스 `rule-set-corpus.json` 이 동치를 고정)라 서버·화면·코퍼스·두 러너의 `MIN_CASES` 를 **한 태스크에서 함께** 바꾼다. 순서는 `EMPTY` 바로 뒤다.
- `editsJson` 의 `values` 는 `recordJson` 과 같은 변환기(`RuleCaseJudge` 의 `INPUT` 매퍼 — 소수는 BigDecimal, 정수는 Integer, 글자·불린·null 그대로)로 푼다. `RuleCaseJudge.object` 는 최상위가 객체일 때만 받고 매퍼가 private 이므로, 같은 매퍼로 배열을 푸는 `RuleCaseJudge.array(String)` 를 더한다.

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateRequest.java`(`editsJson` 필드·getter·setter·javadoc)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleCaseJudge.java:48-58`(`array` 더하기)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java:307-330`(`simulate`, 새 private `edits`·`edit`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:91-111`(`trace` 4인자 겹정의)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java:20-36`(`EMPTY_TASK`)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java:126-150`(빈 단계 경고)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts:150-176`(빈 단계 경고)
- Modify: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn:13`(머리 주석 한 줄)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(55행 action 어휘, §6.1 V-012, §6.2 XV-023, §11 N-26)
- Test: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(사례 2)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java:43`(`MIN_CASES = 54`)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts:20`(`MIN_CASES = 54`)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSimulateTest.java`(사례 5)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetCaseRunTest.java`(사례 1)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java`(사례 1)

**Interfaces:**
- Consumes: Task 1 의 `RunTrace.TraceEdit`·`RunTrace.edits`·`RunTraceJson` 의 `edits` 직렬화, Task 2 의 `MdmRuleEngine.traceSet(set, record, evalTs, edits)` 실행 의미.
- Produces(화면 Task 10·11 이 이 모양으로 부른다):
  - `execute` params 에 `editsJson`(문자열): `[{"beforeSeq": 3, "nodeId": "if1", "values": {"GT_G": "B", "GT_F": 1.5, "GT_X": null}}]`. `values` 의 값은 `recordJson` 과 같은 JSON 값(글자·숫자·불린·null)이고 서버가 같은 변환기로 푼다. 비었거나 공백·`[]` 이면 고친 값이 없다.
  - 응답 `data.result.trace.edits` = 받은 고친 값을 TypedValue 로 바꾼 `[{beforeSeq, nodeId, values: {이름: TypedValue}}]`(고친 값이 없으면 키가 없다). 자리 어긋남·안 쓰임은 `trace.violations[].code = "EDIT_POINT_MISMATCH"`, `stage = "INPUT_CHECK"`, `name` = 고친 값의 nodeId.
  - `runCases=true` 면 `editsJson` 을 읽지도 않는다(잘못된 JSON 이어도 거부하지 않는다).
  - 거부 문구(INVALID_VALUE): `고친 값 JSON 은 배열이어야 합니다: {원문}` / `고친 값 JSON 의 {i}번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: {원문}`(i 는 1부터).
  - Java `RuleSetSimulateRequest.getEditsJson()`·`setEditsJson(String)`, `RuleCaseJudge.array(String) : List<Object>`(배열이 아니거나 읽지 못하면 null), `RuleSetRunner.trace(String flowJson, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits)`(3인자는 빈 목록으로 위임).
  - 저장 검사 `RuleSetCheck.EMPTY_TASK = "EMPTY_TASK"`, 심각도 `WARN`, `ruleId`·`otherRuleId`·`varName`·`nodeId`·`edgeId` 모두 null, 문구 `빈 단계 {n}개 — 실행 때 그냥 지나간다`(n = 겹친 ID 는 첫 노드만 센 TASK 노드 수), 순서는 `EMPTY` 바로 뒤(`EMPTY` 가 없으면 존재·상태 검사 바로 뒤, 구조 검사 앞). 기능설계서 규칙 ID `XV-023`.

- [ ] **Step 1: 코퍼스 실패 사례** — `rule-set-corpus.json` 의 `cases` 배열 끝에 두 사례를 더하고(지금 마지막 사례 `flow_par_dup_result` 의 닫는 `}` 뒤에 쉼표를 먼저 붙인다 — 빠뜨리면 두 러너가 파일을 읽지 못해 엉뚱한 이유로 실패한다), `RuleSetCorpusTest.MIN_CASES` 와 `rule-set-corpus.test.ts` 의 `MIN_CASES` 를 둘 다 `54` 로 올린다.

```json
    {
      "name": "흐름 — 빈 단계는 경로 검사에서 지나가고 경고 한 줄을 낸다(4단계 T1)",
      "flow": {
        "version": 1,
        "nodes": [
          {"id": "start", "kind": "START"},
          {"id": "t1", "kind": "TASK", "label": "빈 단계"},
          {"id": "r1", "kind": "RULE", "ruleId": "D1"},
          {"id": "if1", "kind": "IF"},
          {"id": "t2", "kind": "TASK", "label": "나중에 채울 단계"},
          {"id": "r2", "kind": "RULE", "ruleId": "D2"},
          {"id": "m1", "kind": "MERGE", "splitId": "if1"},
          {"id": "end", "kind": "END"}
        ],
        "edges": [
          {"id": "e1", "from": "start", "to": "t1"},
          {"id": "e2", "from": "t1", "to": "r1"},
          {"id": "e3", "from": "r1", "to": "if1"},
          {"id": "e4", "from": "if1", "to": "t2", "order": 1, "cond": "PLAN == \"A\""},
          {"id": "e5", "from": "if1", "to": "r2", "otherwise": true},
          {"id": "e6", "from": "t2", "to": "m1"},
          {"id": "e7", "from": "r2", "to": "m1"},
          {"id": "e8", "from": "m1", "to": "end"}
        ]
      },
      "condIo": {"e4": {"ok": true, "message": null, "vars": [{"name": "PLAN", "source": "NONE"}]}},
      "ids": ["D1", "D2"],
      "rules": {
        "D1": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "DESIGN_NEED", "source": "DICT"}], "results": [{"name": "PLAN"}]},
        "D2": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "PLAN", "source": "NONE"}], "results": [{"name": "CONFIRMED"}]}
      },
      "expect": {
        "io": {
          "inputs": [{"name": "DESIGN_NEED", "source": "DICT", "users": ["D1"]}],
          "results": [{"name": "PLAN", "by": ["D1"], "readers": ["D2"]}, {"name": "CONFIRMED", "by": ["D2"], "readers": []}]
        },
        "deps": {"D1": [], "D2": ["D1"]},
        "checks": [
          {"code": "EMPTY_TASK", "severity": "WARN", "ruleId": null, "otherRuleId": null, "varName": null, "message": "빈 단계 2개 — 실행 때 그냥 지나간다"}
        ]
      }
    },
    {
      "name": "흐름 — 빈 단계만 있으면 EMPTY 없이 빈 단계 경고만(4단계 T1, Ruling: 그림부터 그리기)",
      "flow": {
        "version": 1,
        "nodes": [{"id": "start", "kind": "START"}, {"id": "t1", "kind": "TASK", "label": "빈 단계"}, {"id": "end", "kind": "END"}],
        "edges": [{"id": "e1", "from": "start", "to": "t1"}, {"id": "e2", "from": "t1", "to": "end"}]
      },
      "ids": [],
      "rules": {},
      "expect": {
        "io": {"inputs": [], "results": []},
        "deps": {},
        "checks": [
          {"code": "EMPTY_TASK", "severity": "WARN", "ruleId": null, "otherRuleId": null, "varName": null, "message": "빈 단계 1개 — 실행 때 그냥 지나간다"}
        ]
      }
    }
```

- [ ] **Step 2: 코퍼스 실패 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --console=plain)` → FAIL(`EMPTY_TASK` 없음). `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/rule-set-corpus.test.ts` → FAIL(같은 이유).

- [ ] **Step 3: 빈 단계 경고 구현(서버·화면 같은 순서·문구)**

`RuleSetCheck.java` — `COND_UNTYPED` 뒤:

```java
    /** 흐름에 빈 단계(TASK) 노드가 있다(WARN, 4단계 spec §1.1). 저장·되살리기를 막지 않는다. 위치 없이 세트 단위 한 줄이다. */
    public static final String EMPTY_TASK = "EMPTY_TASK";
```

`RuleSetAnalyzer.checks(FlowDefinition, …)` — 노드 훑기와 `EMPTY` 뒤를 아래로 바꾼다(기존 `firstNode` 규칙은 그대로다).

```java
        Map<String, String> firstNode = new HashMap<>();
        Set<String> seenNodes = new HashSet<>();
        int tasks = 0;
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null) {
                firstNode.putIfAbsent(n.ruleId(), n.id());
            } else if (n.kind() == NodeKind.TASK) {
                tasks++;
            }
        }
```
```java
        // 빈 단계도 단계로 센다 — 그림부터 그리고 룰을 나중에 채우는 흐름을 저장할 수 있게(컨트롤러 Ruling)
        if (flow.nodes().stream().noneMatch(n -> n.kind() == NodeKind.RULE || n.kind() == NodeKind.TASK)) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null, "룰이 하나도 없다"));
        }
        if (tasks > 0) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY_TASK, RuleSetCheck.WARN, null, null, null, "빈 단계 " + tasks + "개 — 실행 때 그냥 지나간다"));
        }
```
클래스 javadoc 의 `계획 C4 — 존재·상태 → EMPTY → 구조 → 경로` 를 `계획 C4 — 존재·상태 → EMPTY → 빈 단계(EMPTY_TASK) → 구조 → 경로` 로 고친다.

`set-model.ts` 의 `flowChecks` — 같은 자리:

```ts
  const firstNode = new Map<string, string>();
  const seenNodeIds = new Set<string>();
  let tasks = 0;
  for (const n of flow.nodes ?? []) {
    if (seenNodeIds.has(n.id)) continue;
    seenNodeIds.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId) && !firstNode.has(n.ruleId!)) firstNode.set(n.ruleId!, n.id);
    if (n.kind === "TASK") tasks++;
  }
```
```ts
  // 빈 단계도 단계로 센다 — 그림부터 그리고 룰을 나중에 채우는 흐름을 저장할 수 있게(컨트롤러 Ruling)
  if (!(flow.nodes ?? []).some((n) => n.kind === "RULE" || n.kind === "TASK")) out.push(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다"));
  if (tasks > 0) out.push(check("EMPTY_TASK", "WARN", null, null, null, `빈 단계 ${tasks}개 — 실행 때 그냥 지나간다`));
```
함수 머리 주석의 `존재·상태 → EMPTY → 구조` 를 `존재·상태 → EMPTY → 빈 단계(EMPTY_TASK) → 구조` 로 고친다.

- [ ] **Step 4: 코퍼스 통과 확인** — Step 2 두 명령 → PASS. `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` → PASS. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/set-model.test.ts` → PASS(Task 1 의 사례는 `EMPTY_TASK` 를 걸러 비교하므로 그대로 통과한다).

- [ ] **Step 5: 서비스·HTTP 실패 테스트**

`RuleSetSimulateTest.java` — import 에 `com.dongkuk.dmes.cactus.audit.CactusAudit`, `com.dongkuk.dmes.mdm.common.rule.RuleSetCheck`, `com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest`, `com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult`, `com.dongkuk.oasis.audit.AuditHolder` 를 더하고, 클래스 끝에 아래를 더한다.

```java
    // ────────────────────────────────────────────────────────────────
    // 4단계 E4(editsJson)·T1(빈 단계)
    // ────────────────────────────────────────────────────────────────

    /** IF_FIRST_TRUE 의 if1(순번 3) 직전에 GT_G 를 B 로 고친다 — 그 외 갈래(e4 → r3 GT_SLOW)로 간다. */
    public static final String EDIT_IF1_B = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"GT_G\":\"B\"}}]";

    private RuleSetSimulateResult simulate(String flowJson, String recordJson, String editsJson) {
        RuleSetSimulateRequest req = request(flowJson, recordJson, EVAL_TS);
        req.setEditsJson(editsJson);
        return service.simulate(req);
    }

    private static List<String> nodeIds(JsonNode trace) {
        List<String> ids = new ArrayList<>();
        trace.path("nodes").forEach(n -> ids.add(n.path("nodeId").asText()));
        return ids;
    }

    @Test
    void 고친_값을_끼워_다시_실행하면_갈래가_바뀌고_받은_edits_를_TypedValue_로_되돌려_준다() throws Exception {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode trace = response(simulate(c.flowJson(), c.recordJson(), EDIT_IF1_B)).path("trace");

        assertEquals(List.of("start", "r1", "if1", "r3", "m1", "end"), nodeIds(trace));
        assertEquals("e4", trace.path("nodes").get(2).path("chosenEdgeId").asText());
        assertEquals("B", trace.path("finalValues").path("GT_G").path("value").asText());
        assertEquals("5", trace.path("finalValues").path("GT_S").path("value").asText());
        assertTrue(trace.path("violations").isNull(), trace.toString());
        assertEquals(JSON.readTree("[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"GT_G\":{\"type\":\"STRING\",\"value\":\"B\"}}}]"),
                trace.path("edits"));
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }

    @Test
    void 비었거나_빈_배열인_editsJson_은_고친_값_없는_골든과_같고_edits_키가_없다() throws IOException {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode expected = readGolden().get("IF_FIRST_TRUE").path("response").path("trace");
        for (String none : java.util.Arrays.asList(null, "", " ", "[]")) {
            JsonNode trace = response(simulate(c.flowJson(), c.recordJson(), none)).path("trace");
            assertEquals(expected, trace, String.valueOf(none));
            assertTrue(!trace.has("edits"), String.valueOf(none));
        }
    }

    @Test
    void 잘못된_editsJson_은_recordJson_과_같은_INVALID_VALUE_로_거부한다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        for (String notArray : List.of("{}", "고침")) {
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), notArray));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), notArray);
            assertEquals("고친 값 JSON 은 배열이어야 합니다: " + notArray, e.getMessage());
        }
        for (String bad : List.of("[1]",
                "[{\"beforeSeq\":0,\"nodeId\":\"if1\",\"values\":{}}]",
                "[{\"beforeSeq\":\"3\",\"nodeId\":\"if1\",\"values\":{}}]",
                "[{\"beforeSeq\":3,\"nodeId\":\" \",\"values\":{}}]",
                "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":[]}]")) {
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), bad));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), bad);
            assertEquals("고친 값 JSON 의 1번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: " + bad, e.getMessage());
        }
    }

    @Test
    void 자리가_어긋난_고친_값은_EDIT_POINT_MISMATCH_위반으로_기록에_담긴다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode trace = response(simulate(c.flowJson(), c.recordJson(),
                "[{\"beforeSeq\":3,\"nodeId\":\"r2\",\"values\":{\"GT_G\":\"B\"}}]")).path("trace");

        assertEquals(List.of("start", "r1", "if1"), nodeIds(trace));
        assertEquals("ERROR", trace.path("nodes").get(2).path("status").asText());
        JsonNode v = trace.path("violations").get(0);
        assertEquals("INPUT_CHECK", v.path("stage").asText());
        assertEquals("EDIT_POINT_MISMATCH", v.path("code").asText());
        assertEquals("r2", v.path("name").asText());
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }

    /** start → r1(GT_GRADE) → t1(TASK) → end. */
    static String taskFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("t1", "TASK", null, null).node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "t1", null, null, false).edge("e3", "t1", "end", null, null, false);
        return f.canonical();
    }

    @Test
    void 빈_단계가_있는_흐름은_저장되고_view_와_save_가_EMPTY_TASK_경고를_싣고_실행은_지나간다() throws Exception {
        RuleSetCheck warn = new RuleSetCheck(RuleSetCheck.EMPTY_TASK, RuleSetCheck.WARN, null, null, null, "빈 단계 1개 — 실행 때 그냥 지나간다");
        storedSet("GT_TASK", "INUSE", taskFlow());
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        try {
            RuleSetViewRequest view = new RuleSetViewRequest();
            view.setSetId("GT_TASK");
            List<RuleSetCheck> viewChecks = service.view(view).getChecks();
            assertTrue(viewChecks.contains(warn), viewChecks.toString());

            RuleSetSaveRequest save = new RuleSetSaveRequest();
            save.setSetId("GT_TASK");
            save.setSetName("빈 단계 세트");
            save.setRowVersion(0L);
            save.setFlowJson(taskFlow());
            RuleSetSaveResult saved = service.save(save);
            assertTrue(saved.getChecks().contains(warn), saved.getChecks().toString());
            assertEquals(JSON.readTree("[\"GT_GRADE\"]"),
                    JSON.readTree(jdbc.queryForObject("SELECT RULE_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'GT_TASK'", String.class)));
        } finally {
            AuditHolder.remove();
        }

        JsonNode trace = response(simulate(taskFlow(), "{\"GT_THK\":\"12\"}", null)).path("trace");
        assertEquals(List.of("start", "r1", "t1", "end"), nodeIds(trace));
        assertEquals("TASK", trace.path("nodes").get(2).path("kind").asText());
        assertTrue(trace.path("violations").isNull(), trace.toString());
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }
```

`RuleSetCaseRunTest.java` 끝:

```java
    @Test
    void runCases_는_editsJson_을_읽지_않는다_잘못된_JSON_이어도_돈다() {
        putCase(1, "{\"GT_THK\":\"12\"}", RuleSetSimulateTest.EVAL_TS, "{\"GT_G\":\"A\"}");
        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(flow);
        r.setSetId(SET);
        r.setRunCases(true);
        r.setCaseIds("1");
        r.setEditsJson("이건 JSON 이 아니다");

        RuleSetSimulateResult out = service.simulate(r);

        assertNull(out.getTrace());
        assertEquals(Boolean.TRUE, only(out, 1).get("pass"), only(out, 1).toString());
    }
```

`DmeOasisHttpTest.java` — `기록_실행과_조건식_IO_는_문자열_params_로_부르고_…` 사례 바로 뒤:

```java
    /**
     * 4단계 E4 — 고친 값은 execute params 의 editsJson 문자열로 받는다. BPMN execute 는 dto 클래스로 바인딩하므로 DTO 필드만 더해 전달된다
     * (BPMN 입력을 더하지 않는다). 받은 기록은 엔진 스키마 RunTrace 를 따르고 trace.edits 로 고친 값을 되돌려 준다.
     */
    @Test
    void 기록_실행은_editsJson_문자열로_고친_값을_끼워_다시_실행한다() throws Exception {
        RuleSetSimulateTest.seedGolden(jdbc);
        JsonNode golden = RuleSetSimulateTest.readGolden().get("IF_FIRST_TRUE");
        ObjectNode params = json.createObjectNode().put("flowJson", golden.path("flowJson").asText())
                .put("recordJson", golden.path("recordJson").asText()).put("evalTs", golden.path("evalTs").asText())
                .put("editsJson", RuleSetSimulateTest.EDIT_IF1_B);

        JsonNode exec = post("ruleSetEdit", "execute", "kim", envelope("ruleSetEdit", params));

        assertTrue(exec.path("meta").path("success").asBoolean(false), exec.toString());
        JsonNode trace = exec.path("data").path("result").path("trace");
        List<String> nodeIds = new java.util.ArrayList<>();
        trace.path("nodes").forEach(n -> nodeIds.add(n.path("nodeId").asText()));
        assertEquals(List.of("start", "r1", "if1", "r3", "m1", "end"), nodeIds, trace.toString());
        assertEquals("if1", trace.path("edits").path(0).path("nodeId").asText(), trace.toString());
        assertEquals("B", trace.path("edits").path(0).path("values").path("GT_G").path("value").asText(), trace.toString());
        assertEquals(java.util.Set.of(), RuleSetSimulateTest.RUN_TRACE_SCHEMA.validate(trace), trace.toString());
    }
```

- [ ] **Step 6: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' --tests '*RuleSetCaseRunTest' --tests '*DmeOasisHttpTest' --console=plain)` → 컴파일 오류(`setEditsJson` 없음).

- [ ] **Step 7: DTO·변환기·서비스·실행기 구현**

`RuleSetSimulateRequest.java` — 클래스 javadoc 끝에 `<p>{@code editsJson} 은 디버거에서 고친 값(4단계 spec §2.3) — JSON 배열 문자열 {@code [{beforeSeq, nodeId, values}]}, values 는 recordJson 과 같은 변환기로 푼다. {@code runCases} 면 읽지 않는다. OASIS params 는 목록을 받지 못해 문자열로 받는다(D-111).` 를 더하고, 필드·접근자를 더한다.

```java
    private String editsJson;

    public String getEditsJson() { return editsJson; }
    public void setEditsJson(String v) { this.editsJson = v; }
```

`RuleCaseJudge.java` — `object` 바로 뒤:

```java
    /** JSON 배열 문자열 → 목록({@link #object} 와 같은 변환 — 소수는 BigDecimal). 배열이 아니거나 읽지 못하면 null(4단계 editsJson). */
    public static List<Object> array(String json) {
        try {
            Object v = INPUT.readValue(json, Object.class);
            return v instanceof List<?> l ? new ArrayList<Object>(l) : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }
```

`RuleSetRunner.java` — 기존 `trace` 를 두 메서드로 바꾼다(javadoc 은 3인자에 그대로 두고 4인자에 한 줄을 더한다).

```java
    public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs) {
        return trace(flowJson, record, evalTs, List.of());
    }

    /** 4단계 E4 — 고친 값을 끼워 기록 실행한다. 흐름을 읽지 못한 기록에도 받은 고친 값을 되돌려 준다(비었으면 null). */
    public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
        if (record == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "레코드는 필수입니다.");
        }
        Instant ts = ts(evalTs);
        List<RunTrace.TraceEdit> echo = edits.isEmpty() ? null : List.copyOf(edits);
        FlowDefinition def;
        try {
            def = RuleSetFlowJson.parse(flowJson);
        } catch (IllegalArgumentException e) {
            return new RunTrace(UNSAVED, ts, Collections.unmodifiableMap(new LinkedHashMap<>(record)), List.of(), Map.of(),
                    List.of(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, null, "흐름을 읽을 수 없다: " + e.getMessage())), echo);
        }
        RuleSetDefinition set = new RuleSetDefinition(UNSAVED, RuleSetFlowJson.ruleIds(def), SetStatus.INUSE, def);
        return engine().traceSet(set, record, ts, edits);
    }
```

`RuleSetEditService.java` — `simulate` 의 `RunTrace trace;` 앞에 고친 값을 풀고 4인자로 부른다(`runCases` 분기는 그 앞에서 끝나므로 `editsJson` 을 읽지 않는다). 메서드 javadoc 첫 줄 뒤에 `고친 값({@code editsJson}, 4단계 E4)이 있으면 끼워 처음부터 다시 실행하고 기록 {@code edits} 로 되돌려 준다.` 를 더한다.

```java
        Instant ts = request.getEvalTs() == null || request.getEvalTs().isBlank() ? null : RuleSetRunner.parseKst(request.getEvalTs());
        List<RunTrace.TraceEdit> edits = edits(request.getEditsJson());
        RunTrace trace;
        try {
            trace = runner.trace(flowJson, record, ts, edits);
        } catch (StoredDefinitionException e) {
```

`simulate` 아래(`runCases` 앞)에 두 도우미를 더한다(`java.util.Collections` import 가 없으면 더한다).

```java
    /**
     * 4단계 E4 — {@code editsJson}(JSON 배열 문자열)을 고친 값 목록으로. 비었거나 공백이면 빈 목록. 항목은 {@code {beforeSeq: 1 이상 정수,
     * nodeId: 글자, values: 객체}} 이고 values 는 {@code recordJson} 과 같은 변환기({@link RuleCaseJudge#array})로 푼다. 모양이 틀리면
     * {@code recordJson} 과 같은 INVALID_VALUE 로 거부한다(실행하지 않는다).
     */
    private static List<RunTrace.TraceEdit> edits(String editsJson) {
        if (editsJson == null || editsJson.isBlank()) {
            return List.of();
        }
        List<Object> items = RuleCaseJudge.array(editsJson);
        if (items == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "고친 값 JSON 은 배열이어야 합니다: " + editsJson);
        }
        List<RunTrace.TraceEdit> out = new ArrayList<>(items.size());
        for (int i = 0; i < items.size(); i++) {
            RunTrace.TraceEdit e = edit(items.get(i));
            if (e == null) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "고친 값 JSON 의 " + (i + 1)
                        + "번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: " + editsJson);
            }
            out.add(e);
        }
        return List.copyOf(out);
    }

    /** 고친 값 항목 하나 — 모양이 틀리면 null. values 의 null 값(비우기)을 지키려고 Map.copyOf 를 쓰지 않는다. */
    private static RunTrace.TraceEdit edit(Object item) {
        if (!(item instanceof Map<?, ?> m)) {
            return null;
        }
        if (!(m.get("beforeSeq") instanceof Integer seq) || seq < 1) {
            return null;
        }
        if (!(m.get("nodeId") instanceof String nodeId) || nodeId.isBlank()) {
            return null;
        }
        if (!(m.get("values") instanceof Map<?, ?> values)) {
            return null;
        }
        Map<String, Object> copy = new LinkedHashMap<>();
        values.forEach((k, v) -> copy.put(String.valueOf(k), v));
        return new RunTrace.TraceEdit(seq, nodeId, Collections.unmodifiableMap(copy));
    }
```

- [ ] **Step 8: BPMN 주석** — `ruleSetEdit.bpmn:13` 의 execute 줄 끝 `(runCases 면 케이스 일괄 실행)` 뒤에 ` (editsJson 이면 고친 값을 끼워 처음부터 다시 실행 — 응답 trace.edits)` 를 붙인다. 흐름·task·`dto` 속성은 그대로 둔다.

- [ ] **Step 9: 통과 확인** — Step 6 명령 → PASS. `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)` → PASS(api 는 기준선 대비 7건 늘어난다 — RuleSetSimulateTest 5·RuleSetCaseRunTest 1·DmeOasisHttpTest 1. 코퍼스 두 사례는 러너 한 테스트 안에서 돌면 수가 늘지 않는다). `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` → 그대로 PASS. `(cd src/backend/mdm && ../gradlew :api:test --tests '*DmeBpmnActionTest' --tests '*MdmOasisActionVocabularyTest' --console=plain)` → PASS. `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → ERROR 0. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS, `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0.

- [ ] **Step 10: 기능설계서 서버 행** — `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` 네 곳만 고친다(다른 절은 다른 태스크 몫).
  1. 55행 action 어휘 칸: `…`trace` 는 null)` 뒤에 `. **4단계도 칸만 더한다**: `execute` 의 `editsJson`(고친 값을 끼워 처음부터 다시 실행 — 응답 `trace.edits`, `runCases` 면 읽지 않는다)` 를 넣고, 근거 칸 끝에 `, 4단계 spec §2.3` 을 더한다.
  2. §6.1 표 끝(V-011 뒤)에 한 줄:
     `| V-012 | 고친 값(`editsJson`, execute) | 비었거나 `[]` 면 고친 값 없음. 있으면 JSON 배열이고 항목마다 `{beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체}`, values 는 `recordJson` 과 같은 변환. `runCases` 면 읽지 않는다. 자리 어긋남·안 쓰임은 거부가 아니라 기록의 `EDIT_POINT_MISMATCH` 위반이다(4단계 spec §2.2) | 고친 값 JSON 은 배열이어야 합니다: {원문} / 고친 값 JSON 의 {i}번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: {원문} (INVALID_VALUE) |`
  3. §6.2 표의 XV-020 줄 뒤에 한 줄:
     `| XV-023 | `EMPTY_TASK` | 경고 | 흐름에 빈 단계(TASK) 노드가 있다(겹친 노드 ID 는 첫 노드만 센다). `EMPTY` 바로 뒤에 한 줄. 저장·되살리기를 막지 않는다. 빈 단계만 있고 룰이 없어도 `EMPTY` 는 내지 않는다(RULE·TASK 가 모두 없을 때만 `EMPTY`) | 빈 단계 {n}개 — 실행 때 그냥 지나간다 |`
  4. §11 표 끝(N-25 뒤)에 한 줄:
     `| N-26 | **값 고쳐 이어 실행·빈 단계 — 서버(4단계)** — ① `execute{…, editsJson}` 은 처음부터 다시 실행하며 `beforeSeq` 번째 노드를 시작하기 직전 그 범위 ctx 에 고친 값을 넣는다(`RuleSetRunner.trace` 4인자 → 엔진 `traceSet(set, record, evalTs, edits)`). 같은 이름(대소문자 무시)이 그 범위에서 만든 결과에 있으면 결과도 바꾸므로 최상위 결과는 `finalValues` 까지 간다. 병렬 갈래 안에서 고친 입력은 그 갈래 안에서만 보인다. 받은 고친 값은 `trace.edits` 로 되돌려 주고(없으면 키가 없다), 자리의 노드 ID 가 다르거나 정상 완료인데 안 쓰인 고친 값이 있으면 `INPUT_CHECK/EDIT_POINT_MISMATCH` 위반이다. BPMN `execute` 는 dto 바인딩이라 DTO 필드만 더했다. ② 빈 단계(TASK)는 실행 때 `PathStep(TASK)`·`NodeTrace(kind=TASK, OK)` 만 남기고 키 검사는 건너뛴다. 저장 검사는 `EMPTY_TASK` 경고 한 줄이고(XV-023) `validate`(조건식 IO)는 검사를 싣지 않는다 | 4단계 spec §1.1·§2.2·§2.3 |`

- [ ] **Step 11: 커밋** — 두 커밋.

```
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateRequest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleCaseJudge.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSimulateTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetCaseRunTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java
/usr/bin/git commit -m "feat(mdm): 기록 실행이 editsJson 으로 고친 값을 받고 저장 검사가 빈 단계 경고(EMPTY_TASK)를 낸다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateRequest.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleCaseJudge.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSimulateTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetCaseRunTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java
/usr/bin/git add docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): 룰 세트 편집 기능설계서에 editsJson·EMPTY_TASK·4단계 서버 동작(N-26)을 적는다" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

---

#### Task 1~3 — Review Focus 후보(작성자)

- **`edits` 키가 새는지**: 고친 값이 없을 때 `RunTraceJson` 이 `"edits": null` 이나 `[]` 를 싣으면 스키마(`additionalProperties:false` 는 통과하지만) 골든 7사례·HTTP 골든 비교가 깨진다. 엔진은 빈 목록을 null 로, JSON 은 null 을 키 없음으로 두는지 본다(Task 1 Step 8, Task 3 `비었거나_빈_배열인_…`).
- **안 쓰인 고친 값 검사 시점과 범위**: `run()` 안에서 던지면 `failed()` 가 END 를 ERROR 노드로 남기고, 실행 오류로 멈춘 기록에 `EDIT_POINT_MISMATCH` 를 덧붙이면 진짜 ERROR 노드를 가린다. 병렬 갈래 안에서 고친 입력이 합류 뒤까지 새거나(갈래 ctx 가 아니라 바깥 ctx 에 넣음), 갈래가 만든 결과를 고쳤는데 합류에 안 실리면(갈래 made 를 안 바꿈) 스펙 §2.2 와 어긋난다(Task 2 의 병렬 사례 셋).
- **대소문자**: made 치환은 `putReplacing` 이라 `finalValues` 의 키 표기가 고친 값 표기로 바뀐다(Task 10 `frames()` 가 같게 해야 한다). 한편 지연 키 검사(`FlowRun.rule` 의 `ctx.containsKey(name)`)는 대소문자를 가려서, 표기만 다른 이름으로 고치면 원래 키가 지워져 뒤 룰이 `MISSING_KEY` 로 멈출 수 있다 — 화면은 변수 표에 보인 표기 그대로 보내야 한다.

#### Task 1~3 — 편차(작성자 결정, 진행 장부에 Ruling 으로 옮긴다)

| 스펙 | 이 계획 | 이유 |
|---|---|---|
| §2.2 "기존 3인자는 빈 목록으로 위임한다" | `RuleEngine` 에 3인자·4인자 모두 추상 메서드로 두고 위임은 `MdmRuleEngine` 이 한다 | `ContractTypeShapeTest` 가 계약 interface 의 몸체를 `text`·`textAndAst` 만 허용한다(영구 규칙) |
| §2.3 "`RunTrace` 에 선택 필드 `edits`(없으면 null)" | Java 는 null, JSON 은 키를 뺀다(스키마 `required` 밖, `type: array`, 생성 TS `edits?: TraceEdit[]`) | 기존 골든·HTTP 비교를 한 글자도 바꾸지 않는다. `NodeTrace.result` 와 같은 관례다 |
| §1.1 "경고 … 기존 경고 목록과 같은 자리", §5 "필요하면 `EngineWarning.Code` 에 빈 단계 경고" | `EngineWarning` 은 늘리지 않고 저장 검사 `RuleSetCheck` 에 `EMPTY_TASK`(WARN, XV-023)를 `EMPTY` 바로 뒤에 둔다 | 저장·검증 경고 목록은 `RuleSetCheck`(서버 `RuleSetAnalyzer`·화면 `set-model.ts`)이고 `EngineWarning` 은 판정 중 경고다 |
| §1.1 "검증(validate)·저장은 막지 않는다 … 경고" | `validate` action(`condIo`)에는 검사를 싣지 않는다. 경고는 `save`·`view`·`restore` 응답 `checks` 와 화면 `flowChecks` 에 실린다 | `validate` 는 조건식 IO·식 파싱 전용이고 검사 목록 칸이 없다 |
| §7 "잘못된 JSON 은 위반" | 잘못된 `editsJson` 은 실행 전에 `INVALID_VALUE` 업무 예외(`recordJson` 과 같은 규칙). 기록 위반 `EDIT_POINT_MISMATCH` 는 자리 어긋남·안 쓰임에만 쓴다 | 기존 `recordJson` 오류 처리와 같게 한다(요청 지시) |
| (스펙이 답하지 않음) 빈 단계만 있고 RULE 이 없는 흐름 | **컨트롤러 Ruling**: `EMPTY` 는 RULE 과 TASK 가 모두 없을 때만 낸다. 빈 단계만 있는 흐름은 `EMPTY_TASK` 경고만 내고 저장된다(실행은 아무것도 만들지 않고 끝난다) | 사용자 요청 "처음에 그림부터 그려놓고 차차 채워 나갈 수 있으면 좋겠어" |
| (스펙이 답하지 않음) 고친 값으로 made 를 바꿀 때 키 표기 | `RecordKeys.putReplacing(made, …)` — 표기가 고친 값 표기로 바뀐다 | ctx 와 같은 규칙 하나로 둔다. Task 10 `frames()` 가 같게 흉내 낸다 |
| §5 "계약 변경 모음(한 태스크에서 먼저)" 과 코퍼스 짝 규칙 | TS 흐름 해석의 TASK(`flow-model.ts` `TaskStep`)는 Task 1, Java `FlowParser` 짝은 Task 2 에 들어간다. 빈 단계 경고의 화면 짝(`set-model.ts`)은 Task 3 이 서버와 함께 고친다 | Task 9 가 Task 1·8 에만 기대므로 화면 테스트가 먼저 TASK 를 파싱할 수 있어야 한다. 공유 코퍼스에는 Task 3 전까지 TASK 사례가 없어 어느 쪽도 빨개지지 않는다 |

#### Task 1~3 — 작성자 메모

- Task 1 의 `MdmRuleEngine` 4인자 `traceSet` 은 비지 않은 목록에 `UnsupportedOperationException`(`// SEAM(T2)`)을 던진다. Task 2 Step 6 이 지우고 Step 7 이 `grep` 으로 0줄을 확인한다.
- Task 1 과 Task 2 사이의 feat 위에서 Java `FlowParser` 는 TASK 를 분기로 읽는다. 구현 태스크는 서버를 띄우지 않고 브라우저 확인은 모두 병합한 뒤이므로 해는 없지만, 컨트롤러는 Task 2 를 Task 9 보다 먼저 병합하는 편이 안전하다(Task 9 가 먼저 병합되면 그 사이 feat 에서 TASK 가 든 흐름의 저장·실행이 서버에서 구조 오류가 된다).
- 확인하지 못한 것: `json-schema-to-typescript` 가 `edits` 를 정확히 `edits?: TraceEdit[];` 로 낼지는 `gen:contract` 를 돌려야 안다(Task 1 Step 9 에서 diff 로 본다). `10 / X`(X=0)의 정확한 오류 코드는 확인하지 않았다 — Task 2 시험은 ERROR 상태만 본다. `DomainJson.write` 의 `RULE_IDS` 글자 모양은 가정하지 않고 `readTree` 로 비교한다.
- `NODE_SIZE.TASK`(`{ w: 200, h: 44 }`)는 tsc 를 통과시키려는 임시 값이다. `canvas/nodes.tsx` 의 `KIND_CLASS`, `flow-edit.ts` 의 `NODE_PREFIX`, `debug-menu.ts`·`useSimulation.ts` 의 `BREAKABLE`(스펙 §1.2 "중단점도 걸 수 있다")에는 Task 1 이 TASK 를 넣지 않는다 — Task 9·10 몫이다.
- `RuleSetFlowFuzz`(퍼즈 파일 생성기)는 TASK 를 만들지 않으므로 두 언어 퍼즈 차분은 빈 단계를 보지 않는다. 빈 단계 동치는 Task 3 의 코퍼스 두 사례가 고정한다.
- 기능설계서 N-22("E4 는 이번 범위 밖")를 닫는 표시는 Task 3 이 하지 않고 N-26 만 더한다. N-22 정리는 문서 태스크(Task 12)에 맡긴다.
- `RuleErrorText.describe` 에는 `EDIT_POINT_MISMATCH` 문구가 없어 기본(`null`) 갈래로 간다. 이 코드는 기록 실행(`simulate`)에서만 나고 운영 `RuleSetRunner.execute` 는 고친 값을 받지 않으므로 이 조각은 문구를 더하지 않았다.

---

### Task 4: 선 경로 순수 함수 — 자동 경로 점 이식·선분 손잡이 자리·선분 옮기기·일직선 맞춤·놓을 때 정리 (W1)

**모델:** sonnet — 옮길 코드(xyflow `getPoints`)와 기대값이 모두 이 계획에 있고, 계획 작성 때 64경우 일치를 스크래치 스크립트로 확인했다.

**선행:** 없음(첫 물결). `canvas/route-path.ts` 한 파일과 새 시험 파일만 고친다. `FlowCanvas.tsx` 는 고치지 않는다(`ROUTE_RADIUS` 상수를 FlowCanvas 가 가져다 쓰게 바꾸는 일은 Task 5 가 한다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/route-path.ts` — 기존 `routePath`·`routeMidpoint`·`insertRoutePoint`(1~78행)는 그대로 두고, 파일 끝에 아래 Step 3 의 코드를 더한다. 파일 머리 주석(1~4행)에 "4단계 W1: 자동 경로 점(xyflow getPoints 이식)·선분 손잡이" 한 줄을 더한다.
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment.test.ts`(새 파일)

**Interfaces:**
- Consumes: `FlowPos`(`flow-edit.ts`), 기존 `routePath(pts, radius)`, 시험에서만 `setRoute`·`toEditFlow`·`ROUTE_LIMIT_MESSAGE`(`flow-edit.ts`), `Position`·`getSmoothStepPath`(`canvas/react-flow` 재수출).
- Produces(`canvas/route-path.ts`, Task 5 가 쓴다):
  - `type Side = "left" | "top" | "right" | "bottom"` — React Flow `Position` 열거형 값을 그대로 넘길 수 있다(TS 5.9 에서 대입 가능함을 확인).
  - 상수 `ROUTE_RADIUS = 8`, `AUTO_ROUTE_OFFSET = 20`, `ROUTE_STUB = 20`, `SEGMENT_MIN_PX = 28`, `SEGMENT_CLEAR_PX = 24`, `SEGMENT_SNAP_PX = 6`
  - `interface SmoothStepInput { sourceX: number; sourceY: number; sourcePosition: Side; targetX: number; targetY: number; targetPosition: Side; offset?: number; stepPosition?: number }`
  - `smoothStepPoints(p: SmoothStepInput): FlowPos[]` — 양 끝을 포함한 원래 점 목록(xyflow `getPoints` 의 `pathPoints` 와 같다)
  - `autoRoute(p: SmoothStepInput): FlowPos[]` — 자동 경로의 꺾는 점(양 끝 제외, 단순화함)
  - `simplifyRoute(full: readonly FlowPos[]): FlowPos[]` — 양 끝을 남기고 겹친 점·한 직선 위 가운데 점을 뺀다
  - `roundPoint(p: FlowPos): FlowPos`
  - `finishRoute(source: FlowPos, points: readonly FlowPos[], target: FlowPos): FlowPos[]` — 놓을 때: 반올림 → 단순화 → 꺾는 점만
  - `type SegmentAxis = "h" | "v"`, `segmentAxis(a: FlowPos, b: FlowPos): SegmentAxis | null`
  - `interface SegmentHandle { index: number; axis: SegmentAxis; at: FlowPos }` — `index` 는 `full[index]→full[index+1]` 선분
  - `isClear(p: FlowPos, avoid: readonly FlowPos[], zoom: number): boolean`
  - `segmentHandles(full: readonly FlowPos[], zoom: number, avoid: readonly FlowPos[]): SegmentHandle[]`
  - `moveSegment(full: readonly FlowPos[], index: number, delta: number, stub?: number): { points: FlowPos[]; seg: number } | null` — `points` 는 꺾는 점만, `seg` 는 옮긴 선분의 새 번호
  - `snapSegmentDelta(full: readonly FlowPos[], index: number, delta: number, zoom: number): number`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `route-segment.test.ts` 를 새로 만든다. `shape()` 정규화 함수는 계획 작성 때 64경우에서 검증한 것이므로 글자 그대로 옮긴다.

```ts
/** @vitest-environment happy-dom */

// 4단계 W1 — 선분 손잡이 순수 함수(route-path.ts): 자동 경로 점(xyflow getPoints 이식)·단순화·선분 손잡이 자리·선분 옮기기·일직선 맞춤·놓을 때 정리.
import { describe, expect, it } from "vitest";

import { Position, getSmoothStepPath } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import {
  AUTO_ROUTE_OFFSET, ROUTE_RADIUS, ROUTE_STUB, SEGMENT_CLEAR_PX, SEGMENT_MIN_PX, SEGMENT_SNAP_PX,
  autoRoute, finishRoute, isClear, moveSegment, routePath, segmentAxis, segmentHandles, simplifyRoute, smoothStepPoints, snapSegmentDelta,
  type Side, type SmoothStepInput,
} from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import { ROUTE_LIMIT_MESSAGE, setRoute, toEditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";

const P = (x: number, y: number): FlowPos => ({ x, y });

// ───────── 모양 견주기 ─────────
const EPS = 0.01;
const same = (a: FlowPos, b: FlowPos) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const cross = (a: FlowPos, b: FlowPos, c: FlowPos) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const dot = (a: FlowPos, b: FlowPos, c: FlowPos) => (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
type Item = { t: "L" | "Q"; p: FlowPos; q?: FlowPos; from: FlowPos };
/**
 * SVG path(M·L·Q) → 모양 목록. 같은 자리 L, 곧은 Q(제어점이 한 직선 위), 같은 방향으로 곧게 이어지는 L 을 합쳐 꺾임만 남긴다(소수 첫째 자리).
 * getSmoothStepPath 는 꺾지 않는 점을 `L`, routePath 는 곧은 `Q` 로 쓰므로 글자가 아니라 모양을 견준다.
 */
function shape(d: string): string[] {
  const tok = d.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!;
  let i = 0;
  const n = () => Number(tok[i++]);
  let start = P(0, 0);
  let cur = P(0, 0);
  const items: Item[] = [];
  const push = (p: FlowPos) => {
    if (same(cur, p)) return;
    const prev = items[items.length - 1];
    if (prev && prev.t === "L" && Math.abs(cross(prev.from, prev.p, p)) < EPS && dot(prev.from, prev.p, p) > 0) {
      prev.p = p;
      cur = p;
      return;
    }
    items.push({ t: "L", p, from: cur });
    cur = p;
  };
  while (i < tok.length) {
    const c = tok[i++];
    if (c === "M") start = cur = P(n(), n());
    else if (c === "L") push(P(n(), n()));
    else if (c === "Q") {
      const q = P(n(), n());
      const e = P(n(), n());
      if (Math.abs(cross(cur, q, e)) < EPS) push(e);
      else {
        items.push({ t: "Q", q, p: e, from: cur });
        cur = e;
      }
    } else throw new Error(`모르는 명령 ${c}`);
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  return [
    `M ${r(start.x)} ${r(start.y)}`,
    ...items.map((it) => (it.t === "L" ? `L ${r(it.p.x)} ${r(it.p.y)}` : `Q ${r(it.q!.x)} ${r(it.q!.y)} ${r(it.p.x)} ${r(it.p.y)}`)),
  ];
}

const SIDES: Side[] = ["left", "top", "right", "bottom"];
const POS: Record<Side, Position> = { left: Position.Left, top: Position.Top, right: Position.Right, bottom: Position.Bottom };
/** 스펙 §3.3 — 네 변 × 네 변 × 상대 위치(위·아래·왼·오른). 출발점은 (100,100). */
const RAW_REL: Record<string, FlowPos> = { 위: P(60, -200), 아래: P(60, 200), 왼: P(-300, 40), 오른: P(300, 40) };
/** 단순화한 자동 경로 견주기용 — 원래 점 사이 선분이 16 이상인 간격(16 미만은 편차 후보 표의 「§3.3 처음 끌 때 선이 튀지 않는다」 행). */
const WIDE_REL: Record<string, FlowPos> = { 위: P(120, -200), 아래: P(120, 200), 왼: P(-300, 80), 오른: P(300, 80) };
type Case = { s: Side; t: Side; name: string; input: SmoothStepInput };
function cases(rel: Record<string, FlowPos>): Case[] {
  const out: Case[] = [];
  for (const s of SIDES) {
    for (const t of SIDES) {
      for (const [name, d] of Object.entries(rel)) {
        out.push({ s, t, name, input: { sourceX: 100, sourceY: 100, sourcePosition: s, targetX: 100 + d.x, targetY: 100 + d.y, targetPosition: t } });
      }
    }
  }
  return out;
}
const rfPath = (c: Case) =>
  getSmoothStepPath({ ...c.input, sourcePosition: POS[c.s], targetPosition: POS[c.t], borderRadius: ROUTE_RADIUS })[0];
const ends = (c: Case) => [P(c.input.sourceX, c.input.sourceY), P(c.input.targetX, c.input.targetY)] as const;

describe("자동 경로 점(@xyflow/system@0.0.83 getPoints 이식)", () => {
  it("모서리 반경·연결점 여백은 React Flow 선 그리기와 같은 값이다", () => {
    expect(ROUTE_RADIUS).toBe(8);
    expect(AUTO_ROUTE_OFFSET).toBe(20);
  });

  it.each(cases(RAW_REL))("$s → $t, 상대 위치 $name — 옮긴 점을 routePath(점, 8) 로 그린 모양이 getSmoothStepPath(borderRadius 8) 와 같다", (c) => {
    expect(shape(routePath(smoothStepPoints(c.input), ROUTE_RADIUS))).toEqual(shape(rfPath(c)));
  });

  it.each(cases(WIDE_REL))("$s → $t, 상대 위치 $name — 단순화한 자동 경로(autoRoute)로 그려도 같은 모양이다", (c) => {
    const [s, t] = ends(c);
    expect(shape(routePath([s, ...autoRoute(c.input), t], ROUTE_RADIUS))).toEqual(shape(rfPath(c)));
  });

  it("autoRoute 에는 겹친 점·한 직선 위 가운데 점이 없다", () => {
    for (const c of cases(RAW_REL)) {
      const [s, t] = ends(c);
      const full = [s, ...autoRoute(c.input), t];
      for (let i = 1; i < full.length - 1; i++) {
        expect(same(full[i - 1], full[i]), `${c.s}→${c.t} ${c.name}`).toBe(false);
        expect(Math.abs(cross(full[i - 1], full[i], full[i + 1])) > EPS, `${c.s}→${c.t} ${c.name}`).toBe(true);
      }
    }
  });

  it("dagre 기본 간격(연결점 사이 38px) — 곧은 선은 꺾는 점이 없고, 옆으로 비킨 선은 가운데 2px 턱을 그대로 둔다", () => {
    const base = { sourceX: 116, sourceY: 72, sourcePosition: "bottom" as const, targetY: 110, targetPosition: "top" as const };
    expect(autoRoute({ ...base, targetX: 116 })).toEqual([]);
    expect(autoRoute({ ...base, targetX: 266 })).toEqual([P(116, 92), P(191, 92), P(191, 90), P(266, 90)]);
  });
});

describe("simplifyRoute·finishRoute", () => {
  it("양 끝은 남기고 한 직선 위 가운데 점·겹친 점·같은 직선으로 되돌아가는 점을 뺀다", () => {
    expect(simplifyRoute([P(0, 0), P(0, 50), P(0, 100), P(100, 100)])).toEqual([P(0, 0), P(0, 100), P(100, 100)]);
    expect(simplifyRoute([P(0, 0), P(0, 50), P(0, 50), P(100, 50)])).toEqual([P(0, 0), P(0, 50), P(100, 50)]);
    expect(simplifyRoute([P(0, 0), P(0, 20), P(0, 18), P(0, 40)])).toEqual([P(0, 0), P(0, 40)]);
    expect(simplifyRoute([P(0, 0), P(50, 50), P(100, 100)])).toEqual([P(0, 0), P(100, 100)]);
  });

  it("안쪽 점이 끝점과 겹치면 안쪽 점을 뺀다. 입력은 바뀌지 않는다", () => {
    const full = [P(0, 0), P(0, 100), P(100, 100), P(100, 100)];
    const before = JSON.stringify(full);
    expect(simplifyRoute(full)).toEqual([P(0, 0), P(0, 100), P(100, 100)]);
    expect(JSON.stringify(full)).toBe(before);
  });

  it("finishRoute — 꺾는 점을 정수로 반올림한 뒤 정리하고 꺾는 점만 돌려준다", () => {
    expect(finishRoute(P(0, 0), [P(0.4, 50.6), P(100.5, 50.6)], P(100, 100))).toEqual([P(0, 51), P(101, 51)]);
    expect(finishRoute(P(0, 0), [P(0, 50)], P(0, 100))).toEqual([]);
  });
});

describe("선분 손잡이 자리", () => {
  const full = [P(0, 0), P(0, 100), P(300, 100), P(300, 300)];

  it("segmentAxis — 가로·세로만, 대각선과 길이 0 은 null", () => {
    expect(segmentAxis(P(0, 0), P(10, 0))).toBe("h");
    expect(segmentAxis(P(0, 0), P(0, 10))).toBe("v");
    expect(segmentAxis(P(0, 0), P(10, 0.3))).toBe("h");
    expect(segmentAxis(P(0, 0), P(10, 10))).toBeNull();
    expect(segmentAxis(P(5, 5), P(5, 5))).toBeNull();
  });

  it("가로·세로 선분 가운데에 두고, 대각선·화면 28px 미만 선분은 뺀다(배율을 따른다)", () => {
    expect(SEGMENT_MIN_PX).toBe(28);
    expect(segmentHandles(full, 1, [])).toEqual([
      { index: 0, axis: "v", at: P(0, 50) },
      { index: 1, axis: "h", at: P(150, 100) },
      { index: 2, axis: "v", at: P(300, 200) },
    ]);
    expect(segmentHandles([P(0, 0), P(100, 100), P(100, 127)], 1, [])).toEqual([]);
    expect(segmentHandles([P(0, 0), P(0, 28)], 1, [])).toEqual([{ index: 0, axis: "v", at: P(0, 14) }]);
    expect(segmentHandles([P(0, 0), P(0, 55)], 0.5, [])).toEqual([]); // 흐름 55 = 화면 27.5
  });

  it("가운데가 라벨·[+] 에서 화면 24px 안이면 1/4 지점(먼 쪽, 같으면 출발 쪽)으로 비키고, 1/4 지점도 가까우면 그리지 않는다", () => {
    expect(SEGMENT_CLEAR_PX).toBe(24);
    expect(segmentHandles(full, 1, [P(160, 100)])[1]).toEqual({ index: 1, axis: "h", at: P(75, 100) });
    expect(segmentHandles(full, 1, [P(150, 100)])[1].at).toEqual(P(75, 100));
    // dagre 기본 곧은 선(38px) 가운데 [+] — 1/4 지점도 9.5px 라 막대가 없다
    expect(segmentHandles([P(116, 72), P(116, 110)], 1, [P(116, 91)])).toEqual([]);
    // 배율 2 면 화면 24px = 흐름 12 — 13 떨어진 [+] 는 비키지 않는다
    expect(segmentHandles(full, 2, [P(150, 113)])[1].at).toEqual(P(150, 100));
  });

  it("isClear — 라벨·[+] 자리에서 화면 24px 이상 떨어졌는가", () => {
    expect(isClear(P(0, 0), [], 1)).toBe(true);
    expect(isClear(P(0, 0), [P(0, 23)], 1)).toBe(false);
    expect(isClear(P(0, 0), [P(0, 24)], 1)).toBe(true);
    expect(isClear(P(0, 0), [P(0, 13)], 2)).toBe(true);
  });
});

describe("moveSegment", () => {
  const full = [P(0, 0), P(0, 100), P(200, 100), P(200, 200)];

  it("가운데 선분은 수직으로만 옮기고 양 끝 점이 따라간다(이웃 선분은 길이만 바뀐다)", () => {
    expect(moveSegment(full, 1, 30)).toEqual({ points: [P(0, 130), P(200, 130)], seg: 1 });
  });

  it("노드에 붙은 첫 선분 — 노드에서 20 나온 짧은 선분과 꺾임을 끼워 나가는 방향을 지킨다", () => {
    expect(ROUTE_STUB).toBe(20);
    expect(moveSegment(full, 0, 50)).toEqual({ points: [P(0, 20), P(50, 20), P(50, 100), P(200, 100)], seg: 2 });
  });

  it("노드에 붙은 끝 선분 — 끝 노드 쪽에 짧은 선분과 꺾임을 끼운다", () => {
    expect(moveSegment(full, 2, -30)).toEqual({ points: [P(0, 100), P(170, 100), P(170, 180), P(200, 180)], seg: 2 });
  });

  it("꺾는 점 없는 곧은 선 — 양쪽에 짧은 선분을 끼운다", () => {
    expect(moveSegment([P(0, 0), P(0, 200)], 0, 40)).toEqual({ points: [P(0, 20), P(40, 20), P(40, 180), P(0, 180)], seg: 2 });
  });

  it("짧은 곧은 선(38) — 짧은 선분을 길이의 1/3 로 줄여 옮긴 가운데 선분이 남고, 놓을 때 다시 곧은 선으로 접히지 않는다", () => {
    const r = moveSegment([P(116, 72), P(116, 110)], 0, 40)!;
    expect(r.seg).toBe(2);
    expect(Math.abs(r.points[2].y - r.points[1].y)).toBeGreaterThan(10);
    expect(finishRoute(P(116, 72), r.points, P(116, 110))).toEqual([P(116, 85), P(156, 85), P(156, 97), P(116, 97)]);
  });

  it("대각선 선분·없는 선분은 null, 입력은 바뀌지 않는다", () => {
    expect(moveSegment([P(0, 0), P(50, 50), P(50, 100)], 0, 10)).toBeNull();
    expect(moveSegment(full, 5, 10)).toBeNull();
    const before = JSON.stringify(full);
    moveSegment(full, 0, 50);
    expect(JSON.stringify(full)).toBe(before);
  });

  it("짧은 선분을 끼워 꺾는 점이 20개를 넘으면 setRoute 가 거부한다(편집 실패 알림)", () => {
    const pts: FlowPos[] = [];
    for (let k = 0; k < 10; k++) pts.push(P(100 * k, 100 + 100 * k), P(100 * (k + 1), 100 + 100 * k));
    const r = moveSegment([P(0, 0), ...pts, P(1000, 1100)], 0, 30)!;
    expect(r.points).toHaveLength(22);
    expect(setRoute(toEditFlow(null, ["R_A", "R_B"]), "e2", r.points)).toEqual({ ok: false, reason: ROUTE_LIMIT_MESSAGE });
  });
});

describe("snapSegmentDelta — 끄는 동안 일직선 맞춤", () => {
  // S(0,0) → (0,100) → (200,100) → (200,250) → (400,250) → T(400,400)
  const full = [P(0, 0), P(0, 100), P(200, 100), P(200, 250), P(400, 250), P(400, 400)];

  it("옮기는 선분이 안쪽 이웃 선분과 화면 6px 안이면 일직선으로 맞춘다", () => {
    expect(SEGMENT_SNAP_PX).toBe(6);
    expect(snapSegmentDelta(full, 3, -146, 1)).toBe(-150); // y 250 → 104 → 100 에 맞춤
    expect(snapSegmentDelta(full, 3, -140, 1)).toBe(-140); // 110 — 10 떨어져 그대로
    expect(snapSegmentDelta(full, 1, 145, 1)).toBe(150); // y 100 → 245 → 250 에 맞춤
  });

  it("거리는 화면 px 이다 — 배율 0.5 면 흐름 12 안", () => {
    expect(snapSegmentDelta(full, 3, -140, 0.5)).toBe(-150);
  });

  it("노드 연결점(양 끝)의 좌표에는 맞추지 않는다 — 노드에 붙은 선분이 길이 0 이 되어 화살표가 옆으로 들어가지 않게", () => {
    expect(snapSegmentDelta(full, 1, -97, 1)).toBe(-97); // 앞 이웃 끝은 S(0,0)
    expect(snapSegmentDelta(full, 3, 147, 1)).toBe(147); // 뒤 이웃 끝은 T(400,400)
  });

  it("맞춘 뒤 놓으면 길이 0 선분과 한 직선 위 점이 지워져 선분이 하나로 합쳐진다", () => {
    const moved = moveSegment(full, 3, snapSegmentDelta(full, 3, -146, 1))!;
    expect(moved.points).toEqual([P(0, 100), P(200, 100), P(200, 100), P(400, 100)]);
    expect(finishRoute(full[0], moved.points, full[5])).toEqual([P(0, 100), P(400, 100)]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/route-segment.test.ts` → import 오류(내보내지 않은 이름)로 FAIL.

- [ ] **Step 3: 최소 구현** — `canvas/route-path.ts` 끝에 더한다. 기존 `dist`·`routePath` 는 그대로 쓴다.

```ts
// ───────────────────────── 4단계 W1 — 자동 경로 점·선분 손잡이 ─────────────────────────

/** 연결점 변 — React Flow `Position` 문자열 값과 같다(`Position` 값을 그대로 넘길 수 있다). */
export type Side = "left" | "top" | "right" | "bottom";
/** 선 경로 모서리 반경 — 자동 경로(`getSmoothStepPath` borderRadius)와 저장 경로(`routePath`)가 같은 값을 쓴다. */
export const ROUTE_RADIUS = 8;
/** 자동 경로가 연결점에서 곧게 나오는 길이 — `getSmoothStepPath` 기본 offset. */
export const AUTO_ROUTE_OFFSET = 20;
/** 노드에 붙은 선분을 옮길 때 노드 쪽에 끼우는 짧은 선분 길이(흐름 좌표, 스펙 §3.2). 선분 길이의 1/3 을 넘지 않는다. */
export const ROUTE_STUB = 20;
/** 선분 손잡이를 두는 가장 짧은 선분(화면 px). */
export const SEGMENT_MIN_PX = 28;
/** 선분 막대·자동 점 손잡이가 라벨·[+] 자리에서 비키는 거리(화면 px). */
export const SEGMENT_CLEAR_PX = 24;
/** 끄는 선분을 이웃과 일직선으로 맞추는 거리(화면 px). */
export const SEGMENT_SNAP_PX = 6;

export interface SmoothStepInput {
  sourceX: number;
  sourceY: number;
  sourcePosition: Side;
  targetX: number;
  targetY: number;
  targetPosition: Side;
  offset?: number;
  stepPosition?: number;
}

/*
 * smoothStepPoints·DIRS·stepDirection 은 @xyflow/system@0.0.83 의 getPoints·handleDirections·getDirection
 * (dist/esm/index.js 1223~1361행)을 옮긴 것이다. MIT License, Copyright (c) 2019-2025 webkid GmbH.
 * getPoints 는 공개 API 가 아니라 그대로 옮겼다. 선 그리기는 여전히 getSmoothStepPath 가 하므로 xyflow 를 올리면
 * route-segment.test.ts 의 64경우 견주기가 어긋남을 잡는다. 라벨 자리(centerX·centerY)와 getEdgeCenter(반환 오프셋에만 쓰인다)는 옮기지 않았다.
 */
const DIRS: Readonly<Record<Side, FlowPos>> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function stepDirection(source: FlowPos, sourcePosition: Side, target: FlowPos): FlowPos {
  if (sourcePosition === "left" || sourcePosition === "right") return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

/** 자동 꺾은선의 점 전체(양 끝 포함) — `getSmoothStepPath` 가 꺾임을 그리는 점과 같다. */
export function smoothStepPoints({
  sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset = AUTO_ROUTE_OFFSET, stepPosition = 0.5,
}: SmoothStepInput): FlowPos[] {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const sourceDir = DIRS[sourcePosition];
  const targetDir = DIRS[targetPosition];
  const sourceGapped = { x: source.x + sourceDir.x * offset, y: source.y + sourceDir.y * offset };
  const targetGapped = { x: target.x + targetDir.x * offset, y: target.y + targetDir.y * offset };
  const dir = stepDirection(sourceGapped, sourcePosition, targetGapped);
  const acc: "x" | "y" = dir.x !== 0 ? "x" : "y";
  const currDir = dir[acc];
  let points: FlowPos[];
  const sourceGapOffset = { x: 0, y: 0 };
  const targetGapOffset = { x: 0, y: 0 };
  if (sourceDir[acc] * targetDir[acc] === -1) {
    const centerX = acc === "x" ? sourceGapped.x + (targetGapped.x - sourceGapped.x) * stepPosition : (sourceGapped.x + targetGapped.x) / 2;
    const centerY = acc === "x" ? (sourceGapped.y + targetGapped.y) / 2 : sourceGapped.y + (targetGapped.y - sourceGapped.y) * stepPosition;
    const verticalSplit = [{ x: centerX, y: sourceGapped.y }, { x: centerX, y: targetGapped.y }];
    const horizontalSplit = [{ x: sourceGapped.x, y: centerY }, { x: targetGapped.x, y: centerY }];
    if (sourceDir[acc] === currDir) points = acc === "x" ? verticalSplit : horizontalSplit;
    else points = acc === "x" ? horizontalSplit : verticalSplit;
  } else {
    const sourceTarget = [{ x: sourceGapped.x, y: targetGapped.y }];
    const targetSource = [{ x: targetGapped.x, y: sourceGapped.y }];
    if (acc === "x") points = sourceDir.x === currDir ? targetSource : sourceTarget;
    else points = sourceDir.y === currDir ? sourceTarget : targetSource;
    if (sourcePosition === targetPosition) {
      const diff = Math.abs(source[acc] - target[acc]);
      if (diff <= offset) {
        const gapOffset = Math.min(offset - 1, offset - diff);
        if (sourceDir[acc] === currDir) sourceGapOffset[acc] = (sourceGapped[acc] > source[acc] ? -1 : 1) * gapOffset;
        else targetGapOffset[acc] = (targetGapped[acc] > target[acc] ? -1 : 1) * gapOffset;
      }
    } else {
      const opp: "x" | "y" = acc === "x" ? "y" : "x";
      const isSameDir = sourceDir[acc] === targetDir[opp];
      const gt = sourceGapped[opp] > targetGapped[opp];
      const lt = sourceGapped[opp] < targetGapped[opp];
      const flip = (sourceDir[acc] === 1 && ((!isSameDir && gt) || (isSameDir && lt))) || (sourceDir[acc] !== 1 && ((!isSameDir && lt) || (isSameDir && gt)));
      if (flip) points = acc === "x" ? sourceTarget : targetSource;
    }
  }
  const gs = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y };
  const gt2 = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y };
  const first = points[0];
  const last = points[points.length - 1];
  return [
    source,
    ...(gs.x !== first.x || gs.y !== first.y ? [gs] : []),
    ...points,
    ...(gt2.x !== last.x || gt2.y !== last.y ? [gt2] : []),
    target,
  ];
}

const SAME_EPS = 0.01;
const LINE_EPS = 0.01;
/** 가로·세로 판정 허용치(흐름 좌표). dagre 좌표의 0.5 반올림 차이를 가로·세로로 본다. */
const AXIS_EPS = 0.5;
const copyPt = (p: FlowPos): FlowPos => ({ x: p.x, y: p.y });
const samePoint = (a: FlowPos, b: FlowPos) => Math.abs(a.x - b.x) < SAME_EPS && Math.abs(a.y - b.y) < SAME_EPS;
/** a·b·c 가 한 직선 위인가(b 가 a·c 사이가 아니어도 — 같은 직선으로 되돌아가는 점도 뺀다). */
const collinear = (a: FlowPos, b: FlowPos, c: FlowPos) =>
  Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= LINE_EPS * Math.max(1, dist(a, c));
const lerp = (a: FlowPos, b: FlowPos, t: number): FlowPos => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const nearest = (p: FlowPos, avoid: readonly FlowPos[]) => avoid.reduce((m, q) => Math.min(m, dist(p, q)), Infinity);

export const roundPoint = (p: FlowPos): FlowPos => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** 양 끝을 남기고 겹친 점·한 직선 위 가운데 점을 뺀 새 목록(스펙 §3.2 합치기). 입력은 바뀌지 않는다. */
export function simplifyRoute(full: readonly FlowPos[]): FlowPos[] {
  if (full.length <= 2) return full.map(copyPt);
  const out: FlowPos[] = [copyPt(full[0])];
  for (let k = 1; k < full.length; k++) {
    const p = full[k];
    const end = k === full.length - 1;
    if (samePoint(out[out.length - 1], p)) {
      if (!end) continue;
      if (out.length > 1) out.pop(); // 끝점과 겹친 안쪽 점을 빼고 끝점을 넣는다
    }
    while (out.length >= 2 && collinear(out[out.length - 2], out[out.length - 1], p)) out.pop();
    out.push(copyPt(p));
  }
  return out;
}

/** 자동 경로의 꺾는 점(양 끝 제외) — 손잡이와 저장 경로 바꾸기에 쓴다. 그리기는 여전히 getSmoothStepPath 다. */
export function autoRoute(p: SmoothStepInput): FlowPos[] {
  return simplifyRoute(smoothStepPoints(p)).slice(1, -1);
}

/** 놓을 때 저장할 꺾는 점 — 꺾는 점을 정수로 반올림한 뒤 정리한다(양 끝은 노드 연결점이라 반올림하지 않는다). */
export function finishRoute(source: FlowPos, points: readonly FlowPos[], target: FlowPos): FlowPos[] {
  return simplifyRoute([source, ...points.map(roundPoint), target]).slice(1, -1);
}

export type SegmentAxis = "h" | "v";
export interface SegmentHandle {
  /** `full[index] → full[index + 1]` 선분. */
  index: number;
  axis: SegmentAxis;
  /** 막대 가운데(흐름 좌표). */
  at: FlowPos;
}

/** 가로(h)·세로(v) 선분인가. 대각선·길이 0 은 null. */
export function segmentAxis(a: FlowPos, b: FlowPos): SegmentAxis | null {
  const h = Math.abs(a.y - b.y) < AXIS_EPS;
  const v = Math.abs(a.x - b.x) < AXIS_EPS;
  if (h === v) return null;
  return h ? "h" : "v";
}

/** 점 p 가 비킬 자리들(라벨·[+])에서 화면 SEGMENT_CLEAR_PX 이상 떨어졌는가. */
export function isClear(p: FlowPos, avoid: readonly FlowPos[], zoom: number): boolean {
  return nearest(p, avoid) >= SEGMENT_CLEAR_PX / (zoom > 0 ? zoom : 1);
}

/**
 * 선분 손잡이 자리(스펙 §3.1) — 가로·세로이고 화면 SEGMENT_MIN_PX 이상인 선분의 가운데. 가운데가 라벨·[+] 에서 가까우면
 * 1/4 지점(비킬 자리에서 먼 쪽, 같으면 출발 쪽)으로 옮기고, 그 자리도 가까우면 그 선분에는 막대를 두지 않는다.
 */
export function segmentHandles(full: readonly FlowPos[], zoom: number, avoid: readonly FlowPos[]): SegmentHandle[] {
  const k = zoom > 0 ? zoom : 1;
  const out: SegmentHandle[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i];
    const b = full[i + 1];
    const axis = segmentAxis(a, b);
    if (!axis || dist(a, b) * k < SEGMENT_MIN_PX) continue;
    let at = lerp(a, b, 0.5);
    if (!isClear(at, avoid, k)) {
      const q1 = lerp(a, b, 0.25);
      const q3 = lerp(a, b, 0.75);
      at = nearest(q3, avoid) > nearest(q1, avoid) ? q3 : q1;
      if (!isClear(at, avoid, k)) continue;
    }
    out.push({ index: i, axis, at });
  }
  return out;
}

/**
 * 선분 index 를 선분에 수직으로 delta 만큼 옮긴 꺾는 점(스펙 §3.2). 양 끝 점이 따라가 이웃 선분은 길이만 바뀐다.
 * 노드에 붙은 첫·끝 선분은 노드 쪽 끝이 고정이라 노드에서 stub(선분 길이의 1/3 을 넘지 않게) 나온 짧은 선분과 꺾임을 끼운다.
 * 가로·세로가 아닌 선분·없는 선분은 null. 입력은 바뀌지 않는다.
 */
export function moveSegment(full: readonly FlowPos[], index: number, delta: number, stub = ROUTE_STUB): { points: FlowPos[]; seg: number } | null {
  const a = full[index];
  const b = full[index + 1];
  if (!a || !b) return null;
  const axis = segmentAxis(a, b);
  if (!axis) return null;
  const shift = (p: FlowPos): FlowPos => (axis === "h" ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y });
  const len = dist(a, b);
  const s = Math.min(stub, len / 3);
  const last = full.length - 1;
  const pts = full.map(copyPt);
  let seg = index;
  // 끝 쪽을 먼저 고친다(앞쪽에 점을 끼우면 뒤 번호가 밀린다).
  if (index + 1 === last) {
    const t1 = lerp(b, a, s / len);
    pts.splice(last, 0, shift(t1), t1);
  } else pts[index + 1] = shift(pts[index + 1]);
  if (index === 0) {
    const s1 = lerp(a, b, s / len);
    pts.splice(1, 0, s1, shift(s1));
    seg += 2;
  } else pts[index] = shift(pts[index]);
  return { points: pts.slice(1, -1), seg };
}

/**
 * 끄는 동안의 일직선 맞춤(스펙 §3.2) — 옮긴 선분이 앞 이웃의 시작점(full[index-1])이나 뒤 이웃의 끝점(full[index+2])과
 * 화면 SEGMENT_SNAP_PX 안이면 그 좌표로 맞춘 delta. 노드 연결점(양 끝)은 후보에서 뺀다. 가까운 후보가 없으면 delta 그대로.
 */
export function snapSegmentDelta(full: readonly FlowPos[], index: number, delta: number, zoom: number): number {
  const a = full[index];
  const b = full[index + 1];
  const axis = a && b ? segmentAxis(a, b) : null;
  if (!axis) return delta;
  const c: "x" | "y" = axis === "h" ? "y" : "x";
  const from = a[c];
  const want = from + delta;
  let best = delta;
  let bestD = SEGMENT_SNAP_PX / (zoom > 0 ? zoom : 1);
  for (const j of [index - 1, index + 2]) {
    if (j < 1 || j > full.length - 2) continue;
    const d = Math.abs(full[j][c] - want);
    if (d <= bestD) {
      bestD = d;
      best = full[j][c] - from;
    }
  }
  return best;
}
```

- [ ] **Step 4: 통과를 확인한다** — Step 2 명령 PASS(64 + 64 + 나머지). 기존 선 경로 시험 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-route.test.ts` PASS. `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` 0 오류. `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/route-path.ts` 와 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/route-path.ts` 0건.

- [ ] **Step 5: 커밋한다**
  - `/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/route-path.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment.test.ts`
  - `/usr/bin/git commit -m "feat(m-mdm): 선 경로 순수 함수에 자동 경로 점·선분 손잡이 계산을 더한다" --trailer "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" --trailer "Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/route-path.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment.test.ts`

---

### Task 5: 선분 손잡이 캔버스 — hover 손잡이·선분 끌기·자동 경로 바꾸기·[+] 비킴 (W1)

> **컨트롤러 Ruling(조각 합칠 때 더함):** 경로가 없는 선을 두 번 눌러 점을 더할 때는 자동 경로의 꺾임을 이어받는다 — `routeApi.addPoint(id, route ?? autoRoute(…), …)` 로 바꾸고, "자동 경로 선을 두 번 누르면 기존 꺾임이 그대로이고 누른 자리에 점 하나가 더해진다" 시험을 이 태스크에 더한다. 이유: W1 의 목표는 처음 편집할 때 선 모양이 튀지 않는 것이다(스펙 §3.3). 짧은 곧은 선(화면 96px 미만)에 막대가 없는 편차는 받아들이되, 마감 보고의 사용자 확인 목록에 올린다.


**모델:** opus — 선 하나만 다시 그리는 저장소 구독, hover 유예, 공간 넓히기 미리보기, [+] 비킴이 한 컴포넌트에서 얽힌다.

**선행:** Task 4 병합. 같은 물결에서 Task 6(그룹)·Task 7(도구 상자)이 `FlowCanvas.tsx` 를 함께 고칠 수 있으므로 **아래 구역만** 고친다.

**고치는 구역(원래 dev 기준 줄 번호):** `FlowCanvas.tsx` 머리 주석(1~45행, W1 문단 하나 더하기), import 63행(`./route-path`)과 새 import 한 줄(`../styles/route`), 141~142행(`ROUTE_RADIUS` 지역 상수 지우기), `addSpot` 바로 아래(128행 뒤)에 `segmentBox` 더하기, `RouteStore`·`RouteApi`(376~408행), `FlowEdgeView`(602~823행), `NO_SUBSCRIBE` 옆(825행) 상수 하나, `routeApi` memo(1382~1441행). **고치지 않는 것:** `FlowCanvasProps`·`Inner` 구조 분해(863~869행)·`edges`·`nodes` memo·ReactFlow props(1791~1847행)·`spaceTool`·반환 JSX 의 Provider 층. 새 prop·새 Provider 가 없다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx`(위 구역)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/route.ts` — 막대 크기 상수와 선분 막대·자동 점 CSS
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` — §3.2 표 150행(선 경로 손잡이), §5.3 표 290행(선 경로 편집)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment-canvas.test.ts`(새 파일)
- 기존 시험 가운데 기대가 바뀌는 것은 없다. `grep -rn "flow-route-handle" src/frontend/m-mdm/tests` 로 확인한 사용처(`flow-route.test.ts`·`undo.test.ts`·`addons-fix.test.ts` L6·`space-canvas.test.ts`)는 모두 저장 경로 손잡이만 센다. 자동 점은 `flow-route-auto-`, 선분 막대는 `flow-route-seg-` 로 접두어를 나눠 이 시험들이 새 손잡이를 세지 않게 한다. `addons-fix.test.ts` 의 "짧은 선 [+] 자리" 시험은 34px 곧은 선이라 막대가 없어(1/4 지점도 [+] 에서 24px 안) 그대로 통과해야 한다. 기존 시험이 깨지면 기대를 고치지 말고 원인을 찾아 보고한다.

**Interfaces:**
- Consumes(Task 4): `ROUTE_RADIUS`, `autoRoute`, `segmentHandles`, `isClear`, `segmentAxis`, `moveSegment`, `snapSegmentDelta`, `finishRoute`, `roundPoint`, `type SegmentHandle`. 기존 `HoverStore`(hover 150ms 유예), `SpaceContext`, `addSpot`, `onRouteChange`(page 가 이미 `setRoute` 로 연결 — `page.tsx` 263행, 고치지 않는다).
- Produces:
  - `FlowCanvas.tsx`: `export function segmentBox(s: SegmentHandle): CenterBox`
  - `RouteStore.drag: { edgeId: string; index: number; points: FlowPos[]; seg?: number } | null` — 선분 끌기는 `index: -1`, `seg` = 옮기는 선분 번호
  - `RouteApi.startDrag(e, edgeId, index, points, auto?: boolean)` — `auto` 면 고른 손잡이(`sel`)를 두지 않는다
  - `RouteApi.startSegmentDrag(e: ReactPointerEvent, edgeId: string, seg: number, full: readonly FlowPos[]): void`
  - `styles/route.ts`: `SEG_BAR_LONG = 16`, `SEG_BAR_SHORT = 6`
  - testid: 자동 점 `flow-route-auto-{edgeId}-{i}`(`data-auto="true"`), 선분 막대 `flow-route-seg-{edgeId}-{i}`(`data-axis="h"|"v"`, 끄는 중 `data-dragging="true"`). 저장 점 `flow-route-handle-{edgeId}-{i}` 는 그대로.

- [ ] **Step 1: 실패하는 시험을 쓴다** — `route-segment-canvas.test.ts`. happy-dom 에서는 `fitView` 가 돌지 않아 배율 1·이동 0 이다(계획 작성 때 프로브로 확인: `.react-flow__viewport` 가 `translate(0px,0px) scale(1)`). 그래서 흐름 좌표 = 화면 좌표이고, 첫 시험이 이를 확인한다. 노드 크기 RULE 232×68, 연결점은 아래 가운데 `(x+116, y+72)`·위 가운데 `(x+116, y−4)` 이다.

```ts
/** @vitest-environment happy-dom */

// 4단계 W1 — 선분 손잡이 캔버스: hover·고른 선의 점·선분 손잡이, 선분 끌기(자동 경로 바꾸기·짧은 선분 끼우기·일직선 맞춤·합치기),
// [+] 비킴, 공간 넓히기 미리보기, 성능(끄는 동안 page·dagre 다시 돌지 않음), memo(Local-Rules §19).
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

import { ADD_HOVER_GRACE_MS, FlowCanvas, addSpot, segmentBox, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { Position, getSmoothStepPath } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import { ROUTE_RADIUS } from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import { setPositions, setRoute, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/** r1(0,0) → r2(600,400): e2 자동 경로 (116,72)→(116,234)→(716,234)→(716,396), [+] 는 (416,234). */
const wide = () => setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(600, 400) });
/** r1(0,0) 바로 아래 r2(0,400): e2 곧은 선 (116,72)→(116,396), [+] 는 (116,234). */
const tall = () => setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(0, 400) });

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
    flow: wide(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const all = (prefix: string) => document.querySelectorAll(`[data-testid^="${prefix}"]`);
const segs = (edgeId: string) => all(`flow-route-seg-${edgeId}-`);
const autos = (edgeId: string) => all(`flow-route-auto-${edgeId}-`);
const saved = (edgeId: string) => all(`flow-route-handle-${edgeId}-`);
const edgePath = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path")!;
const pathOf = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path.react-flow__edge-path")!.getAttribute("d")!;
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const hoverIn = (el: Element) => fire(el, "mouseover", { relatedTarget: null });
const hoverOut = (el: Element) => fire(el, "mouseout", { relatedTarget: document.body });
const xy = (testId: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec((q(testId)!.parentElement as HTMLElement).style.transform)!;
  return P(Number(m[1]), Number(m[2]));
};
const zoom = () => Number(/scale\(\s*([\d.]+)\s*\)/.exec((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform)?.[1] ?? 1);
/** 막대 끌기 — 누른 뒤 두 번 움직이고 놓는다(단추 누른 채 움직임). */
async function dragBar(testId: string, from: FlowPos, to: FlowPos) {
  await fire(q(testId)!, "pointerdown", { clientX: from.x, clientY: from.y, button: 0 });
  await fire(window, "pointermove", { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: to.x, clientY: to.y, buttons: 1 });
  await fire(window, "pointerup", { clientX: to.x, clientY: to.y });
}

describe("선분·자동 점 손잡이 표시", () => {
  it("편집 모드에서 선에 마우스를 올리면 자동 경로의 꺾임에 점, 가로·세로 선분에 막대가 뜨고, 떠나면 150ms 유예 뒤 사라진다", async () => {
    await draw(props());
    expect(zoom()).toBe(1); // happy-dom — 흐름 좌표 = 화면 좌표
    expect(segs("e2")).toHaveLength(0);
    await hoverIn(edgePath("e2"));
    expect([...autos("e2")].map((el) => el.getAttribute("data-testid"))).toEqual(["flow-route-auto-e2-0", "flow-route-auto-e2-1"]);
    expect(xy("flow-route-auto-e2-0")).toEqual(P(116, 234));
    expect(xy("flow-route-auto-e2-1")).toEqual(P(716, 234));
    expect(q("flow-route-auto-e2-0")!.getAttribute("data-auto")).toBe("true");
    expect([...segs("e2")].map((el) => el.getAttribute("data-testid"))).toEqual(["flow-route-seg-e2-0", "flow-route-seg-e2-1", "flow-route-seg-e2-2"]);
    expect(q("flow-route-seg-e2-0")!.getAttribute("data-axis")).toBe("v");
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-axis")).toBe("h");
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 153));
    expect(xy("flow-route-seg-e2-1")).toEqual(P(266, 234)); // 가운데(416,234)가 [+] 자리 — 같은 거리라 출발 쪽 1/4
    expect(xy("flow-route-seg-e2-2")).toEqual(P(716, 315));
    expect(saved("e2")).toHaveLength(0);
    expect(segs("e1")).toHaveLength(0); // 다른 선은 그대로
    await hoverOut(edgePath("e2"));
    expect(segs("e2")).toHaveLength(3); // 유예 중
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(segs("e2")).toHaveLength(0);
    expect(autos("e2")).toHaveLength(0);
  });

  it("선에서 막대로 옮겨 가는 사이(유예 안)에는 사라지지 않는다 — 막대도 선의 hover 속성을 단다", async () => {
    await draw(props());
    await hoverIn(edgePath("e2"));
    await hoverOut(edgePath("e2"));
    await wait(40);
    await hoverIn(q("flow-route-seg-e2-1")!);
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(segs("e2")).toHaveLength(3);
    const cl = q("flow-route-seg-e2-1")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
  });

  it("고른 선은 올리지 않아도 뜨고, 보기·디버그 모드에는 없다", async () => {
    await draw(props({ selectedEdgeId: "e2" }));
    expect(segs("e2")).toHaveLength(3);
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ selectedEdgeId: "e2", mode }));
      await hoverIn(edgePath("e2"));
      expect(segs("e2"), mode).toHaveLength(0);
      expect(autos("e2"), mode).toHaveLength(0);
    }
  });

  it("dagre 기본 간격의 짧은 곧은 선(38px)은 가운데가 [+] 자리라 막대가 없다(1/4 지점도 24px 안)", async () => {
    await draw(props({ flow: toEditFlow(null, ["R_A", "R_B"]), selectedEdgeId: "e2" }));
    expect(q("flow-edge-add-e2")).not.toBeNull();
    expect(segs("e2")).toHaveLength(0);
    expect(autos("e2")).toHaveLength(0);
  });

  it("저장 경로가 있는 선은 저장 점(flow-route-handle-*)과 막대가 hover 로도 뜬다", async () => {
    const flow = ok(setRoute(wide(), "e2", [P(116, 300), P(716, 300)]));
    await draw(props({ flow }));
    await hoverIn(edgePath("e2"));
    expect(saved("e2")).toHaveLength(2);
    expect(autos("e2")).toHaveLength(0);
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-axis")).toBe("h");
  });

  it("자동 경로 그리기는 ROUTE_RADIUS 로 getSmoothStepPath 그대로다(처음 끌 때 선이 튀지 않는 기준)", async () => {
    await draw(props());
    const [d] = getSmoothStepPath({
      sourceX: 116, sourceY: 72, sourcePosition: Position.Bottom, targetX: 716, targetY: 396, targetPosition: Position.Top, borderRadius: ROUTE_RADIUS,
    });
    expect(pathOf("e2")).toBe(d);
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedEdgeId 만, 그다음 flow 만 바꿔도 손잡이가 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props();
    await draw(p);
    expect(autos("e2")).toHaveLength(0);
    const sel = { ...p, selectedEdgeId: "e2" };
    await draw(sel);
    expect(autos("e2")).toHaveLength(2);
    await draw({ ...sel, flow: ok(setRoute(sel.flow, "e2", [P(116, 300), P(716, 300)])) });
    expect(autos("e2")).toHaveLength(0);
    expect(saved("e2")).toHaveLength(2);
  });
});

describe("자동 점·선분 끌기", () => {
  it("자동 경로의 점을 끌면 저장 경로로 바꿔 옮기고 놓을 때 한 번 올린다. 자동 점은 고른 손잡이가 되지 않는다", async () => {
    const onRouteChange = vi.fn();
    const ref = { current: null as (() => boolean) | null };
    await draw(props({ selectedEdgeId: "e2", onRouteChange, removeRoutePointRef: ref }));
    await fire(q("flow-route-auto-e2-0")!, "pointerdown", { clientX: 116, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 150, clientY: 260, buttons: 1 });
    expect(onRouteChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 150, clientY: 260 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(150, 260), P(716, 234)]);
    expect(ref.current!()).toBe(false); // 고른 점이 없어 Delete 는 선택 삭제로 간다
  });

  it("움직이지 않고 놓거나 두 번 누르면 아무것도 올리지 않는다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    await fire(q("flow-route-auto-e2-1")!, "pointerdown", { clientX: 716, clientY: 234, button: 0 });
    await fire(window, "pointerup", { clientX: 716, clientY: 234 });
    await fire(q("flow-route-auto-e2-1")!, "dblclick");
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointerup", { clientX: 266, clientY: 234 });
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("가로 선분을 끌면 세로로만 옮기고, 끄는 동안은 캔버스 안에서만 다시 그리고 놓을 때 한 번 올린다(자동 경로 → 저장 경로)", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 300, clientY: 260, buttons: 1 });
    await fire(window, "pointermove", { clientX: 320, clientY: 284, buttons: 1 });
    expect(onRouteChange).not.toHaveBeenCalled();
    expect(pathOf("e2")).toContain("284");
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-dragging")).toBe("true");
    await fire(window, "pointerup", { clientX: 320, clientY: 284 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 284), P(716, 284)]); // x 이동은 버린다
  });

  it("노드에 붙은 곧은 선분 — 양쪽에 20px 짧은 선분과 꺾임을 끼워 나가는 방향을 지킨다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ flow: tall(), selectedEdgeId: "e2", onRouteChange }));
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 153)); // 가운데(116,234)는 [+] 자리 — 출발 쪽 1/4
    await dragBar("flow-route-seg-e2-0", P(116, 153), P(176, 170));
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 92), P(176, 92), P(176, 376), P(116, 376)]);
  });

  it("끄는 선분이 안쪽 이웃과 화면 6px 안이면 일직선으로 맞추고, 놓을 때 합쳐 점을 줄인다", async () => {
    // S(116,72) → (116,150) → (300,150) → (300,250) → (716,250) → T(716,396). 선분 3 가운데 (508,250).
    const flow = ok(setRoute(wide(), "e2", [P(116, 150), P(300, 150), P(300, 250), P(716, 250)]));
    const onRouteChange = vi.fn();
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange }));
    expect(xy("flow-route-seg-e2-3")).toEqual(P(508, 250));
    await dragBar("flow-route-seg-e2-3", P(508, 250), P(508, 154)); // 154 → 150 에 맞춤
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 150), P(716, 150)]);
    onRouteChange.mockClear();
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange }));
    await dragBar("flow-route-seg-e2-3", P(508, 250), P(508, 160)); // 10 떨어져 맞추지 않는다
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 150), P(300, 150), P(300, 160), P(716, 160)]);
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제자리로 돌아간다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    const before = pathOf("e2");
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 266, clientY: 300, buttons: 1 });
    await fire(window, "pointercancel", {});
    expect(pathOf("e2")).toBe(before);
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 266, clientY: 300, buttons: 1 });
    await fire(window, "pointermove", { clientX: 266, clientY: 310, buttons: 0 });
    await fire(window, "pointerup", { clientX: 266, clientY: 310 });
    expect(pathOf("e2")).toBe(before);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("공간 넓히기(Alt+끌기) 미리보기를 막대가 따라간다", async () => {
    await draw(props({ flow: tall(), selectedEdgeId: "e2" }));
    const pane = document.querySelector(".react-flow__pane")!;
    await fire(pane, "pointerdown", { clientX: 900, clientY: 100, button: 0, altKey: true });
    await fire(window, "pointermove", { clientX: 900, clientY: 102, buttons: 1 });
    await fire(window, "pointermove", { clientX: 900, clientY: 190, buttons: 1 });
    // r2(위 400)가 기준선 y 100 너머라 90 내려가 e2 가 (116,72)→(116,486) — 가운데는 [+] 자리라 출발 쪽 1/4
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 72 + 414 / 4));
    await fire(window, "pointercancel", {});
  });
});

describe("[+] 비킴·스타일", () => {
  it("segmentBox — 막대 상자(가로 16×6, 세로 6×16)를 [+] 가 비킨다", () => {
    expect(segmentBox({ index: 0, axis: "h", at: P(5, 0) })).toEqual({ x: 5, y: 0, w: 16, h: 6 });
    expect(segmentBox({ index: 0, axis: "v", at: P(5, 0) })).toEqual({ x: 5, y: 0, w: 6, h: 16 });
    expect(addSpot(P(0, 0), { w: 18, h: 18 }, [segmentBox({ index: 0, axis: "h", at: P(5, 0) })], 4)).toEqual(P(5 + 8 + 4 + 9, 0));
  });

  it("CSS — 가로 막대는 ns-resize, 세로 막대는 ew-resize, 막대만 누름을 받는다", () => {
    const css = RSF_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-route-seg\[data-axis="h"\] \{[^}]*cursor: ns-resize/);
    expect(css).toMatch(/\.rsf-route-seg\[data-axis="v"\] \{[^}]*cursor: ew-resize/);
    expect(css).toMatch(/\.rsf-route-seg \{[^}]*pointer-events: all/);
  });
});

describe("성능 — 끄는 동안 page 를 다시 그리지 않고 dagre 도 다시 돌지 않는다(Local-Rules §16)", () => {
  const renders = { host: 0 };
  /** page 대역 — 콜백이 오면 자기 상태를 바꿔 다시 그린다. */
  function Host({ initial }: { initial: EditFlow }) {
    renders.host++;
    const [flow, setFlow] = useState(initial);
    const [, bump] = useState(0);
    const touch = () => bump((n) => n + 1);
    return createElement(FlowCanvas, props({
      flow, selectedEdgeId: "e2", onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch,
      onRouteChange: (id: string, pts: FlowPos[]) => setFlow((f) => ok(setRoute(f, id, pts))),
    }));
  }

  it("선분을 끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 Host 가 한 번 다시 그려 저장 경로가 된다", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: wide() })));
    });
    await flush();
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    for (const y of [240, 260, 284]) await fire(window, "pointermove", { clientX: 266, clientY: y, buttons: 1 });
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 266, clientY: 284 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(saved("e2")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/route-segment-canvas.test.ts` → `segmentBox` 가 없어 FAIL.

- [ ] **Step 3: `styles/route.ts` 를 고친다** — 파일 머리의 `export const ROUTE_CSS` 앞에 상수를 두고, CSS 끝에 규칙을 더한다.

```ts
/** 선분 손잡이 막대 크기(px, 흐름 좌표 층이라 확대와 함께 커진다). FlowCanvas `segmentBox` 가 [+] 비킴에 같은 값을 쓴다. */
export const SEG_BAR_LONG = 16;
export const SEG_BAR_SHORT = 6;
```

```css
/* 선분 손잡이(W1, 4단계) — 가로·세로 선분 가운데의 짧은 막대. 선분에 수직으로만 끈다. 자동 경로 점은 점선 테두리. */
.rsf-route-seg {
  display: block; box-sizing: border-box; border-radius: 3px; pointer-events: all; touch-action: none;
  background: var(--color-bg); border: 1.5px solid var(--color-primary);
}
.rsf-route-seg[data-axis="h"] { width: ${SEG_BAR_LONG}px; height: ${SEG_BAR_SHORT}px; cursor: ns-resize; }
.rsf-route-seg[data-axis="v"] { width: ${SEG_BAR_SHORT}px; height: ${SEG_BAR_LONG}px; cursor: ew-resize; }
.rsf-route-seg:hover, .rsf-route-seg[data-dragging="true"] { background: var(--color-primary-soft); }
.rsf-route-handle[data-auto="true"] { border-style: dashed; }
```

- [ ] **Step 4: `FlowCanvas.tsx` 를 고친다(고치는 구역만).**
  1. import 63행을 `import { ROUTE_RADIUS, autoRoute, finishRoute, insertRoutePoint, isClear, moveSegment, roundPoint, routeMidpoint, routePath, segmentAxis, segmentHandles, snapSegmentDelta, type SegmentHandle } from "./route-path";` 로 바꾸고, 그 아래에 `import { SEG_BAR_LONG, SEG_BAR_SHORT } from "../styles/route";` 를 더한다.
  2. 141~142행의 `/** 선 경로 모서리 반경(C14). */ const ROUTE_RADIUS = 8;` 를 지운다(route-path 에서 가져온다).
  3. `addSpot`(119~128행) 바로 아래에 더한다.

```ts
/** 선분 손잡이 막대 상자(흐름 좌표, 가운데 기준, W1) — [+] 비킴(addSpot)이 피한다. 크기는 styles/route.ts 의 막대와 같다. */
export function segmentBox(s: SegmentHandle): CenterBox {
  return s.axis === "h"
    ? { x: s.at.x, y: s.at.y, w: SEG_BAR_LONG, h: SEG_BAR_SHORT }
    : { x: s.at.x, y: s.at.y, w: SEG_BAR_SHORT, h: SEG_BAR_LONG };
}
```

  4. `RouteStore`(376~381행)의 `drag` 타입을 `{ edgeId: string; index: number; points: FlowPos[]; seg?: number } | null` 로 바꾸고 주석에 "선분 끌기는 index -1, seg = 옮기는 선분 번호(짧은 선분을 끼우면 새 번호)" 를 더한다. `RouteApi`(400~407행)를 다음과 같이 바꾼다.

```ts
interface RouteApi {
  store: RouteStore;
  /** 그린 선마다 지금 모양을 읽는 함수(편집 가능한 선만) — 선 끝 손잡이 두 번 누르기가 쓴다(U2). */
  geo: Map<string, () => EdgeGeo>;
  /** 점 손잡이 끌기. auto 면 자동 경로의 점이라 고른 손잡이로 두지 않는다(Delete 없음, W1). */
  startDrag(e: ReactPointerEvent, edgeId: string, index: number, points: readonly FlowPos[], auto?: boolean): void;
  /** 선분 막대 끌기(W1) — full 은 양 끝을 포함한 지금 꺾은선(자동 경로면 autoRoute 점). 놓을 때 finishRoute 로 정리해 한 번 올린다. */
  startSegmentDrag(e: ReactPointerEvent, edgeId: string, seg: number, full: readonly FlowPos[]): void;
  addPoint(edgeId: string, points: readonly FlowPos[], source: FlowPos, target: FlowPos, clientX: number, clientY: number): void;
  removePoint(edgeId: string, points: readonly FlowPos[], index: number): void;
}
```

  5. `NO_SUBSCRIBE`(825행) 옆에 `const NO_SEGS: readonly SegmentHandle[] = Object.freeze([]);` 를 더한다.
  6. `FlowEdgeView`(602~823행)를 고친다.
     - 629~633행 `dragged` 구독을 끌기 상태 구독으로 바꾼다.

```ts
  const dragState = useSyncExternalStore(
    routeApi ? routeApi.store.subscribe : NO_SUBSCRIBE,
    () => (routeApi?.store.drag?.edgeId === id ? routeApi.store.drag : null),
    () => null,
  );
  const dragged = dragState?.points ?? null;
```

     - `selHandle` 구독(634~638행) 바로 뒤에 더한다.

```ts
  // 손잡이(W1) — 편집 모드에서 올려진 선·고른 선·끄는 중인 선에만. 배율은 손잡이를 그릴 때만 구독한다(다른 선은 확대에 다시 그리지 않는다).
  const showHandles = !!data?.routeEditable && !!routeApi && (hovered || !!data.routeHandles || dragState !== null);
  const zoom = useStore((st) => (showHandles ? st.transform[2] : 1));
```

     - 641행 `borderRadius: 8` 을 `borderRadius: ROUTE_RADIUS` 로 바꾼다.
     - `chipsAt`(691행) 바로 뒤에 더한다.

```ts
  // 선분 막대·자동 점 자리(W1) — 라벨·[+] 자리에서 화면 24px 비킨다. 자동 경로면 getSmoothStepPath 와 같은 점(autoRoute)에 둔다.
  const hasRoute = !!route && route.length > 0;
  const autoPts = showHandles && !hasRoute ? autoRoute({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }) : null;
  const avoid: FlowPos[] = [];
  if (data?.label) avoid.push(labelAt);
  if (showAdd) avoid.push({ x: addX, y: ly });
  const fullPts = showHandles ? [{ x: sourceX, y: sourceY }, ...(hasRoute ? route! : (autoPts ?? [])), { x: targetX, y: targetY }] : null;
  const segs = fullPts ? segmentHandles(fullPts, zoom, avoid) : NO_SEGS;
```

     - `useLayoutEffect`(692~705행)의 `box(chipsRef.current, chipsAt);` 다음 줄에 `for (const s of segs) boxes.push(segmentBox(s));` 를 더한다.
     - 손잡이 그리기(785~804행)를 아래로 바꾼다. 저장 점은 `showHandles` 일 때(hover 포함) 그리고 `hoverProps` 를 단다.

```tsx
        {showHandles &&
          hasRoute &&
          route!.map((p, i) => (
            <div key={`p${i}`} className="rsf-elabel" style={at(p.x, p.y)}>
              <span
                className="rsf-route-handle nodrag nopan"
                role="button"
                aria-label="꺾는 점"
                title="끌어 옮기고, 두 번 눌러 뺀다"
                data-testid={`flow-route-handle-${id}-${i}`}
                data-selected={selHandle === i ? "true" : undefined}
                data-dragging={dragState && dragState.seg === undefined && dragState.index === i ? "true" : undefined}
                {...hoverProps}
                onPointerDown={(e) => routeApi!.startDrag(e, id, i, route!)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  routeApi!.removePoint(id, route!, i);
                }}
              />
            </div>
          ))}
        {autoPts?.map((p, i) =>
          isClear(p, avoid, zoom) ? (
            <div key={`a${i}`} className="rsf-elabel" style={at(p.x, p.y)}>
              <span
                className="rsf-route-handle nodrag nopan"
                role="button"
                aria-label="꺾는 점"
                title="끌어 옮긴다"
                data-testid={`flow-route-auto-${id}-${i}`}
                data-auto="true"
                {...hoverProps}
                onPointerDown={(e) => routeApi!.startDrag(e, id, i, autoPts, true)}
              />
            </div>
          ) : null,
        )}
        {segs.map((s) => (
          <div key={`s${s.index}`} className="rsf-elabel" style={at(s.at.x, s.at.y)}>
            <span
              className="rsf-route-seg nodrag nopan"
              role="button"
              aria-label="선분"
              title="끌어 선분을 옮긴다"
              data-testid={`flow-route-seg-${id}-${s.index}`}
              data-axis={s.axis}
              data-dragging={dragState?.seg === s.index ? "true" : undefined}
              {...hoverProps}
              onPointerDown={(e) => routeApi!.startSegmentDrag(e, id, s.index, fullPts!)}
            />
          </div>
        ))}
```

  7. `routeApi` memo(1382~1441행)를 고친다.
     - `startDrag` 를 `startDrag: (e, edgeId, index, points, auto = false) => {` 로 바꾸고, `routeStore.sel = { edgeId, index };` 를 `routeStore.sel = auto ? null : { edgeId, index };` 로, `onUpEvt` 의 `routeChangeRef.current?.(edgeId, final)` 을 `routeChangeRef.current?.(edgeId, final.map(roundPoint))` 로 바꾼다(자동 점은 소수일 수 있다 — 저장 점 끌기는 이미 정수라 결과가 같다).
     - `startDrag` 뒤에 `startSegmentDrag` 를 더하고, memo 의존성을 `[routeStore, rf]` 로 바꾼다.

```ts
      startSegmentDrag: (e, edgeId, seg, full) => {
        if (e.button !== 0) return;
        const origin = full.map((p) => ({ x: p.x, y: p.y }));
        const axis = origin[seg] && origin[seg + 1] ? segmentAxis(origin[seg], origin[seg + 1]) : null;
        if (!axis) return;
        e.stopPropagation();
        wrapRef.current?.focus({ preventScroll: true });
        const sx = e.clientX;
        const sy = e.clientY;
        let lastDelta = 0;
        routeStore.drag = { edgeId, index: -1, seg, points: origin.slice(1, -1) };
        routeStore.emit();
        const onMoveEvt = (ev: MouseEvent) => {
          // 단추가 모두 떨어진 채 움직이면 pointerup 을 잃은 것이다(창 밖에서 놓음) — 기록 없이 버린다(L1 과 같다).
          if (ev.buttons === 0) {
            finish(false);
            return;
          }
          const k = rf.getZoom() || 1;
          const raw = (axis === "h" ? ev.clientY - sy : ev.clientX - sx) / k;
          const delta = snapSegmentDelta(origin, seg, raw, k);
          if (delta === lastDelta && routeStore.drag?.edgeId === edgeId) return;
          const r = moveSegment(origin, seg, delta);
          if (!r) return;
          lastDelta = delta;
          routeStore.drag = { edgeId, index: -1, seg: r.seg, points: r.points };
          routeStore.emit();
        };
        const stop = () => {
          window.removeEventListener("pointermove", onMoveEvt);
          window.removeEventListener("pointerup", onUpEvt);
          window.removeEventListener("pointercancel", onCancelEvt);
        };
        const finish = (commit: boolean) => {
          stop();
          const d = routeStore.drag;
          routeStore.drag = null;
          routeStore.emit();
          if (commit && d && lastDelta !== 0) routeChangeRef.current?.(edgeId, finishRoute(origin[0], d.points, origin[origin.length - 1]));
        };
        const onUpEvt = () => finish(true);
        const onCancelEvt = () => finish(false);
        window.addEventListener("pointermove", onMoveEvt);
        window.addEventListener("pointerup", onUpEvt);
        window.addEventListener("pointercancel", onCancelEvt);
      },
```

  8. 머리 주석의 "선 경로 편집(Task 15, C14)" 문단 뒤에 한 문단을 더한다: "선분 손잡이(4단계 W1): 편집 모드에서 선에 마우스를 올리거나(HoverStore 150ms 유예) 선을 고르면 저장 점·자동 경로 점(`autoRoute` — getSmoothStepPath 와 같은 점)·가로·세로 선분 가운데 막대가 뜬다. 막대를 끌면 선분이 수직으로만 움직이고(노드에 붙은 선분은 짧은 선분을 끼운다), 이웃과 화면 6px 안이면 일직선으로 맞춘다. 끄는 동안은 `RouteStore` 에만 두고 놓을 때 `finishRoute` 로 정리해 `onRouteChange` 를 한 번 부른다. 자동 점은 고를 수 없다(Delete 없음)."

- [ ] **Step 5: 통과를 확인한다** — Step 2 명령 PASS. 이어 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` 전체 PASS(특히 `flow-route`·`addons-fix`·`undo`·`space-canvas`·`flow-label`·`final-fix` 는 기대를 고치지 않고 통과해야 한다). lint 0 오류. audit 두 개를 바꾼 파일(`canvas/FlowCanvas.tsx`, `styles/route.ts`)에 돌려 0건. `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0건.

- [ ] **Step 6: 기능설계서를 고친다** — `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
  - §3.2 표 150행을 다음으로 바꾼다: `| 선 경로 손잡이(C14·W1) | 저장 점 `flow-route-handle-{edgeId}-{i}`(`data-selected="true"` = 고른 손잡이, `data-dragging="true"` = 끌리는 손잡이) · 자동 경로 점 `flow-route-auto-{edgeId}-{i}`(`data-auto="true"`, 점선 테두리) · 선분 막대 `flow-route-seg-{edgeId}-{i}`(`data-axis="h"`·`"v"`) | 편집 모드에서 선에 마우스를 올리거나(떠난 뒤 150ms 유예) 선을 고르면 보인다. 동작은 §5.3 |`
  - §5.3 표 290행의 첫 칸을 `선 경로 편집(C14·W1)` 로 바꾸고, 둘째 칸 첫 문장 "편집 모드에서 선을 고르면 꺾는 점마다 손잡이가 보인다." 를 다음으로 바꾼다: "편집 모드에서 선에 마우스를 올리거나 선을 고르면 손잡이가 보인다 — 저장한 꺾는 점마다 점 손잡이, 경로가 없는 선은 자동 경로의 꺾임에 점 손잡이(라벨·[+] 자리에서 화면 24px 안이면 그리지 않는다), 가로·세로 선분(화면 28px 이상) 가운데에 막대. 막대가 라벨·[+] 자리에서 24px 안이면 선분의 1/4 지점(먼 쪽)으로 비키고 그 자리도 가까우면 그리지 않는다(dagre 기본 간격의 짧은 곧은 선에는 막대가 없다). [+] 는 막대를 비킨다. 막대를 끌면 선분이 수직으로만 움직이고 양 끝 점이 따라간다. 노드에 붙은 선분은 노드에서 20px(선분 길이의 1/3 까지) 나온 짧은 선분과 꺾임을 끼워 나가는 방향을 지킨다. 끄는 선분이 안쪽 이웃 선분과 화면 6px 안이면 일직선으로 맞추고(노드 연결점 좌표에는 맞추지 않는다), 놓을 때 한 직선 위 가운데 점과 길이 0 선분을 지워 합친다. 자동 경로의 점·선분을 끌면 그때 저장 경로로 바뀐다(자동 점은 고를 수 없어 Delete 가 없다). 끄는 동안 공간 넓히기 미리보기를 따라가고, 놓을 때 한 번 기록한다(되돌리기 한 칸)."

- [ ] **Step 7: 커밋한다**
  - `/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/route.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment-canvas.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
  - `/usr/bin/git commit -m "feat(m-mdm): 흐름 선에 선분 손잡이를 두고 끌어 선분을 옮기고 합친다" --trailer "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" --trailer "Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/route.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/route-segment-canvas.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`

---

### Task 6: 그룹 크기 — `FlowGroup.pad`·네 모서리·네 변 손잡이 (G2)

**모델:** sonnet — 기존 라벨 끌기(L1) 저장소 방식을 그대로 옮기는 다파일 작업이다.

**선행:** 없음(스펙 §6 순서상 C 병합 뒤 자리가 나면 연다). Task 5·7 과 `FlowCanvas.tsx` 를 함께 고칠 수 있으므로 **아래 구역만** 고친다.

**고치는 구역(원래 dev 기준 줄 번호):** `FlowCanvas.tsx` 의 import 한 줄 추가(`./group-size`)와 55행 import 에 `normalizePad`·`type GroupPad` 더하기, `FlowCanvasProps` 의 `onLabelOffsetChange`(212행) 바로 아래 새 prop 하나, `groupBox`(845~860행), `chips` memo(954행)와 `nodes` memo 사이 세 줄, `nodes` memo 의 그룹 반복(959~967행)과 의존성 목록(1000행) — 흐름 노드·메모 반복(968~998행)은 건드리지 않는다, 라벨 끌기 블록(1483~1548행) 바로 뒤 새 블록, 반환 JSX 에서 `<LabelContext.Provider>`(1774행) 안쪽을 감싸는 Provider 한 층(1856행 닫기 앞). **고치지 않는 것:** `Inner` 구조 분해(863~869행 — Task 7 이 고치므로 새 prop 은 `props.onGroupPadChange` 로 읽는다), `FlowEdgeView`·`RouteStore`·`routeApi`(Task 5), ReactFlow props(1791~1847행)·`spaceTool`(Task 7), `rsf-styles.ts`(결합 줄 충돌을 피해 그룹 CSS 는 `styles/base.ts` 의 기존 그룹 규칙 옆에 둔다).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts` — `GroupPad`·`FlowGroup.pad?`(27~31행), `MAX_GROUP_PAD`·`normalizePad`, `copyGroup`(107행), `sanitizeView` 그룹 부분(174~180행), `updateGroup`(648~656행), 새 연산 `setGroupPad`(`removeGroup` 660행 뒤)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/group-size.ts` — 손잡이 이름·여백 끌기 계산·끌기 저장소·문맥
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx` — import(19행), `GroupNodeData`(58행), `GroupNodeView`(262~268행)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx`(위 구역)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/base.ts` — `.rsf-group-title:hover`(121행) 바로 뒤에 손잡이 규칙
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx` — import(44~47행)에 `setGroupPad`·`type GroupPad`, `onLabelOffsetChange` 콜백(265~268행) 뒤에 `onGroupPadChange`, `<FlowCanvas>` 의 `onLabelOffsetChange={…}`(631행) 뒤에 prop 한 줄
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` — §3.2 표 136행(그룹 틀)·160행(`groups`), §5.3 표 281행(맞춤 안내선) 바로 아래 새 행
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/group-pad.test.ts`(새 파일), `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts`(그룹 시험들 — 586행 근처 "그룹 — 캔버스에서 노드를 더 고른 뒤…" 시험 바로 뒤에 한 개 더하기)

**Interfaces:**
- Consumes: `clone`·`fail`·`finite`(flow-edit 내부), `addGroup`·`updateGroup`·`removeNode`·`setPositions`·`flowJsonOf`·`toEditFlow`, 기존 `useRuleSetEdit.edit`(한 번 = 되돌리기 한 칸), React Flow `useReactFlow().getZoom()`.
- Produces:
  - `flow-edit.ts`: `interface GroupPad { l: number; t: number; r: number; b: number }`, `FlowGroup.pad?: GroupPad`, `const MAX_GROUP_PAD = 2000`, `normalizePad(p: unknown): GroupPad | null`, `setGroupPad(f: EditFlow, id: string, pad: GroupPad | null): EditResult`. 이름은 기존 `setRoute`·`setLabelOffset`·`setPositions` 관례(`set` + 대상)를 따랐다.
  - `canvas/group-size.ts`: `type GroupGrip = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"`, `GROUP_GRIPS: readonly GroupGrip[]`, `ZERO_PAD: GroupPad`, `dragGroupPad(base: GroupPad, grip: GroupGrip, dx: number, dy: number): GroupPad`, `samePad(a: GroupPad, b: GroupPad): boolean`, `interface GroupPadDrag { groupId: string; pad: GroupPad }`, `interface GroupPadStore`, `createGroupPadStore(): GroupPadStore`, `interface GroupSizeApi { startDrag(e: ReactPointerEvent, groupId: string, grip: GroupGrip): void }`, `GroupSizeContext`
  - `FlowCanvasProps.onGroupPadChange?: (groupId: string, pad: GroupPad) => void` — 놓을 때 한 번, 바뀌었을 때만
  - `GroupNodeData.resizable: boolean`(편집 모드이고 고른 그룹)
  - testid `flow-group-grip-{groupId}-{grip}`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `group-pad.test.ts`(새 파일). 그룹 틀 = 소속 노드 경계 + 여백 16 + pad 이다. happy-dom 배율 1(Task 5 Step 1 과 같다).

```ts
/** @vitest-environment happy-dom */

// 4단계 G2 — 그룹 크기: FlowGroup.pad 코덱·연산, 손잡이 끌기 계산, 캔버스 손잡이·끌기·성능·memo.
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
import { GROUP_GRIPS, dragGroupPad } from "../../../pages/dme/ruleSetEdit/canvas/group-size";
import {
  MAX_GROUP_PAD, addGroup, flowJsonOf, removeNode, setGroupPad, setPositions, toEditFlow, updateGroup,
  type EditFlow, type EditResult, type FlowPos, type GroupPad,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const PAD: GroupPad = { l: 10, t: 20, r: 30, b: 40 };
/** r1(0,0)·r2(0,200) 를 담은 그룹 g1 "묶음" — 기본 틀 (-16,-16) 264×300. start·r1·r2·end, 선 e1~e3. */
function grouped(pad?: GroupPad): EditFlow {
  const base = setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(0, 200) });
  const g = addGroup(base, ["r1", "r2"], "묶음");
  if (!g.ok) throw new Error(g.reason);
  return pad ? ok(setGroupPad(g.flow, "g1", pad)) : g.flow;
}

describe("FlowGroup.pad 코덱", () => {
  it("sanitizeView — pad 를 0~2000 정수로 자르고 유한하지 않은 칸은 0, 모두 0 이거나 객체가 아니면 키를 두지 않는다", () => {
    const base = grouped();
    const raw = {
      ...base,
      view: {
        ...base.view,
        groups: [
          { id: "g1", title: "묶음", nodeIds: ["r1"], pad: { l: -5, t: 2500, r: 1.6, b: "x" } },
          { id: "g2", title: "둘", nodeIds: ["r2"], pad: { l: 0, t: 0, r: 0, b: 0 } },
          { id: "g3", title: "셋", nodeIds: ["r2"], pad: "x" },
        ],
      },
    };
    const f = toEditFlow(raw as never, []);
    expect(f.view.groups[0].pad).toEqual({ l: 0, t: MAX_GROUP_PAD, r: 2, b: 0 });
    expect("pad" in f.view.groups[1]).toBe(false);
    expect("pad" in f.view.groups[2]).toBe(false);
  });

  it("flowJsonOf — pad 는 그룹의 마지막 키(l·t·r·b 순서)이고, pad 없는 그룹의 저장 글자는 예전과 같다(dirty 기준 불변)", () => {
    expect(flowJsonOf(grouped())).toContain('"groups":[{"id":"g1","title":"묶음","nodeIds":["r1","r2"]}]');
    expect(flowJsonOf(grouped(PAD))).toContain('"groups":[{"id":"g1","title":"묶음","nodeIds":["r1","r2"],"pad":{"l":10,"t":20,"r":30,"b":40}}]');
  });

  it("왕복 — flowJsonOf → toEditFlow → flowJsonOf 가 같다", () => {
    const s = flowJsonOf(grouped(PAD));
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });
});

describe("setGroupPad·그룹 연산", () => {
  it("pad 를 두고 0~2000 정수로 자른다. 입력은 바뀌지 않는다", () => {
    const f = grouped();
    const before = flowJsonOf(f);
    expect(ok(setGroupPad(f, "g1", PAD)).view.groups[0].pad).toEqual(PAD);
    expect(ok(setGroupPad(f, "g1", { l: -1, t: 3000, r: 2.4, b: 7.5 })).view.groups[0].pad).toEqual({ l: 0, t: 2000, r: 2, b: 8 });
    expect(flowJsonOf(f)).toBe(before);
  });

  it("null 이나 모두 0 이면 pad 키를 지운다", () => {
    expect("pad" in ok(setGroupPad(grouped(PAD), "g1", null)).view.groups[0]).toBe(false);
    expect("pad" in ok(setGroupPad(grouped(PAD), "g1", { l: 0, t: 0, r: 0, b: 0 })).view.groups[0]).toBe(false);
  });

  it("없는 그룹·유한하지 않은 값은 거부한다", () => {
    expect(setGroupPad(grouped(), "zz", PAD)).toEqual({ ok: false, reason: "그룹 zz를 찾지 못했다" });
    expect(setGroupPad(grouped(), "g1", { ...PAD, r: Number.NaN })).toEqual({ ok: false, reason: "그룹 크기가 올바르지 않다" });
  });

  it("updateGroup(제목·구성 노드)과 노드 지우기는 pad 를 남긴다 — 속성 패널로 고쳐도 크기가 사라지지 않는다", () => {
    expect(updateGroup(grouped(PAD), "g1", { title: "새 이름" }).view.groups[0].pad).toEqual(PAD);
    expect(updateGroup(grouped(PAD), "g1", { nodeIds: ["r1"] }).view.groups[0].pad).toEqual(PAD);
    expect(ok(removeNode(grouped(PAD), "r1")).view.groups[0]).toEqual({ id: "g1", title: "묶음", nodeIds: ["r2"], pad: PAD });
  });
});

describe("dragGroupPad — 손잡이 끌기 계산", () => {
  const base: GroupPad = { l: 10, t: 10, r: 10, b: 10 };
  it("모서리는 두 변, 변은 한 변만 바꾼다. 왼·위 변은 바깥(음수)으로 끌면 커진다", () => {
    expect(GROUP_GRIPS).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    expect(dragGroupPad(base, "se", 40, 30)).toEqual({ l: 10, t: 10, r: 50, b: 40 });
    expect(dragGroupPad(base, "nw", -5, -10)).toEqual({ l: 15, t: 20, r: 10, b: 10 });
    expect(dragGroupPad(base, "ne", 5, -5)).toEqual({ l: 10, t: 15, r: 15, b: 10 });
    expect(dragGroupPad(base, "sw", -5, 5)).toEqual({ l: 15, t: 10, r: 10, b: 15 });
    expect(dragGroupPad(base, "n", 99, -5)).toEqual({ l: 10, t: 15, r: 10, b: 10 });
    expect(dragGroupPad(base, "e", 5, 99)).toEqual({ l: 10, t: 10, r: 15, b: 10 });
    expect(dragGroupPad(base, "s", 99, 5)).toEqual({ l: 10, t: 10, r: 10, b: 15 });
    expect(dragGroupPad(base, "w", -5, 99)).toEqual({ l: 15, t: 10, r: 10, b: 10 });
  });

  it("소속 노드보다 작게는 줄지 않고(0), 2000 을 넘지 않으며, 정수로 반올림한다", () => {
    expect(dragGroupPad(base, "se", -50, -50)).toEqual({ l: 10, t: 10, r: 0, b: 0 });
    expect(dragGroupPad(base, "e", 5000, 0).r).toBe(MAX_GROUP_PAD);
    expect(dragGroupPad(base, "e", 1.6, 0).r).toBe(12);
  });
});

// ───────────────────────── 캔버스 ─────────────────────────

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
    flow: grouped(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const grips = (id: string) => document.querySelectorAll(`[data-testid^="flow-group-grip-${id}-"]`);
/** 그룹 틀(React Flow 노드 감싸개)의 자리·크기. */
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
async function dragGrip(testId: string, from: FlowPos, to: FlowPos, release = true) {
  await fire(q(testId)!, "pointerdown", { clientX: from.x, clientY: from.y, button: 0 });
  await fire(window, "pointermove", { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: to.x, clientY: to.y, buttons: 1 });
  if (release) await fire(window, "pointerup", { clientX: to.x, clientY: to.y });
}

describe("FlowCanvas 그룹 크기", () => {
  it("저장된 pad 만큼 틀을 넓혀 그린다 — 보기·디버그 모드도", async () => {
    await draw(props());
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 264, h: 300 });
    for (const mode of ["edit", "view", "debug"] as const) {
      await draw(props({ flow: grouped(PAD), mode }));
      expect(box("g1"), mode).toEqual({ x: -26, y: -36, w: 304, h: 360 });
    }
  });

  it("소속 노드를 옮기면 틀이 따라간다(여백으로 저장하므로 크기는 그대로)", async () => {
    await draw(props({ flow: setPositions(grouped(PAD), { r1: P(100, 50), r2: P(100, 250) }) }));
    expect(box("g1")).toEqual({ x: 74, y: 14, w: 304, h: 360 });
  });

  it("편집 모드에서 고른 그룹에만 네 모서리·네 변 손잡이가 뜬다(누름을 받는 표시 nodrag nopan)", async () => {
    await draw(props({ selectedId: "g1" }));
    expect([...grips("g1")].map((el) => el.getAttribute("data-grip"))).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    const cl = q("flow-group-grip-g1-se")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
    await draw(props());
    expect(grips("g1")).toHaveLength(0);
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedId 만, mode 만, flow 만 바꿔도 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props();
    await draw(p);
    expect(grips("g1")).toHaveLength(0);
    const sel = { ...p, selectedId: "g1" };
    await draw(sel);
    expect(grips("g1")).toHaveLength(8);
    const padded = { ...sel, flow: grouped(PAD) };
    await draw(padded); // flow 만
    expect(box("g1").w).toBe(304);
    expect(grips("g1")).toHaveLength(8);
    await draw({ ...padded, mode: "view" }); // mode 만
    expect(grips("g1")).toHaveLength(0);
    expect(box("g1").w).toBe(304);
  });

  it("오른쪽 아래 손잡이를 끌면 끄는 동안 캔버스 안에서만 커지고, 놓을 때 한 번 올린다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-se", P(248, 284), P(288, 314), false);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 304, h: 330 });
    expect(onGroupPadChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 288, clientY: 314 });
    expect(onGroupPadChange).toHaveBeenCalledTimes(1);
    expect(onGroupPadChange).toHaveBeenCalledWith("g1", { l: 0, t: 0, r: 40, b: 30 });
  });

  it("왼쪽 위 손잡이는 저장된 pad 에 더해 바깥으로 넓힌다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ flow: grouped(PAD), selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-nw", P(-26, -36), P(-31, -46));
    expect(onGroupPadChange).toHaveBeenCalledWith("g1", { l: 15, t: 30, r: 30, b: 40 });
  });

  it("안쪽으로 끌어도 소속 노드보다 작아지지 않고, 바뀐 것이 없으면 올리지 않는다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-nw", P(-16, -16), P(34, 34), false);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 264, h: 300 });
    await fire(window, "pointerup", { clientX: 34, clientY: 34 });
    expect(onGroupPadChange).not.toHaveBeenCalled();
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제 크기로 돌아간다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-e", P(248, 134), P(300, 134), false);
    await fire(window, "pointercancel", {});
    expect(box("g1").w).toBe(264);
    await dragGrip("flow-group-grip-g1-e", P(248, 134), P(300, 134), false);
    await fire(window, "pointermove", { clientX: 320, clientY: 134, buttons: 0 });
    await fire(window, "pointerup", { clientX: 320, clientY: 134 });
    expect(box("g1").w).toBe(264);
    expect(onGroupPadChange).not.toHaveBeenCalled();
  });

  it("CSS — 손잡이만 누름을 받고(틀은 pointer-events: none), 모서리·변마다 크기 커서를 쓴다", () => {
    const css = RSF_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-group-grip \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.rsf-group-grip\[data-grip="se"\] \{[^}]*cursor: nwse-resize/);
    expect(css).toMatch(/\.rsf-group-grip\[data-grip="e"\] \{[^}]*cursor: ew-resize/);
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
      flow, selectedId: "g1", onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch, onRouteChange: touch,
      onGroupPadChange: (id: string, pad: GroupPad) => setFlow((f) => ok(setGroupPad(f, id, pad))),
    }));
  }

  it("손잡이를 끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 Host 가 한 번 다시 그려 새 크기가 정본이 된다", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: grouped() })));
    });
    await flush();
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await dragGrip("flow-group-grip-g1-se", P(248, 284), P(288, 314), false);
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 288, clientY: 314 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 304, h: 330 });
  });
});
```

  `rule-set-edit-page.test.ts` 의 그룹 시험들 뒤(586행 근처 "그룹 — 캔버스에서 노드를 더 고른 뒤 그룹을 누르면 [선택 노드 더하기] 로 넣는다" 시험 바로 뒤)에 더한다. page 는 세트를 열 때 `fitView` 를 부를 수 있으므로 배율을 읽어 흐름 거리로 바꾼다.

```ts
  it("그룹 크기(G2) — 고른 그룹의 오른쪽 아래 손잡이를 끌어 놓으면 틀이 커지고, 되돌리기 한 번에 돌아오며, 저장 본문에 pad 가 실린다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await openChain();
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-add-group");
    const frame = () => document.querySelector('.react-flow__node[data-id="g1"]') as HTMLElement;
    const size = () => ({ w: parseFloat(frame().style.width), h: parseFloat(frame().style.height) });
    const k = Number(/scale\(\s*([\d.]+)\s*\)/.exec((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform)?.[1] ?? 1);
    const before = size();
    const grip = byTestId("flow-group-grip-g1-se");
    await act(async () => { grip.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 })); });
    await act(async () => { window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 30, buttons: 1 })); });
    await act(async () => { window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 40, clientY: 30 })); });
    await flush();
    const grown = { w: before.w + Math.round(40 / k), h: before.h + Math.round(30 / k) };
    expect(size()).toEqual(grown);
    expect(saveButton().disabled).toBe(false);
    await click("flow-undo");
    expect(size()).toEqual(before);
    await click("flow-redo");
    expect(size()).toEqual(grown);
    await click("set-save");
    await settle();
    const saved = JSON.parse((calls("save")[0].body.params as Record<string, string>).flowJson) as { view: { groups: Array<{ pad?: unknown }> } };
    expect(saved.view.groups[0].pad).toEqual({ l: 0, t: 0, r: Math.round(40 / k), b: Math.round(30 / k) });
  });
```

  (`srv`·`ok`·`settle`·`calls`·`click`·`byTestId`·`saveButton`·`openChain` 은 이 파일에 이미 있는 도우미다 — 586행 근처 그룹 저장 시험과 같은 방식이다.)

- [ ] **Step 2: 실패를 확인한다** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/group-pad.test.ts tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` → `group-size` 모듈·`setGroupPad` 가 없어 FAIL.

- [ ] **Step 3: `flow-edit.ts` 를 고친다.**
  - 27~31행 `FlowGroup` 을 바꾸고 그 위에 `GroupPad` 를 둔다.

```ts
/** 그룹 틀에 더한 여백(흐름 좌표, G2) — 소속 노드 경계 + 기본 여백에 네 변마다 더한다. 0 이상 MAX_GROUP_PAD 이하 정수. */
export interface GroupPad {
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface FlowGroup {
  id: string;
  title: string;
  nodeIds: string[];
  /** 더한 여백(G2). 없으면 기본 크기. 네 값이 모두 0 이면 두지 않는다(저장 글자·dirty 비교가 예전 그룹과 같다). */
  pad?: GroupPad;
}
```

  - `MAX_LABEL_OFFSET`(70행) 아래에 `/** 그룹 여백 한계(흐름 좌표, G2) — 넘으면 자른다. */ export const MAX_GROUP_PAD = 2000;` 를 더한다.
  - `copyGroup`(107행)을 바꾸고 바로 위에 `normalizePad` 를 둔다(`finite`·`isObj` 는 이미 위 83~85행에 있다).

```ts
const clampPad = (n: number) => Math.max(0, Math.min(MAX_GROUP_PAD, Math.round(n)));
/** 네 변 값을 0~2000 정수로 자른 여백. 객체가 아니면 null, 유한하지 않은 칸은 0, 모두 0 이면 null(= 기본 크기). */
export function normalizePad(p: unknown): GroupPad | null {
  if (!isObj(p)) return null;
  const v = (x: unknown) => (finite(x) ? clampPad(x) : 0);
  const pad = { l: v(p.l), t: v(p.t), r: v(p.r), b: v(p.b) };
  return pad.l || pad.t || pad.r || pad.b ? pad : null;
}
/** 그룹 복사 — pad 는 있을 때만 마지막 키로 둔다. */
const copyGroup = (g: FlowGroup): FlowGroup => {
  const pad = normalizePad(g.pad);
  return pad ? { id: g.id, title: g.title, nodeIds: [...g.nodeIds], pad } : { id: g.id, title: g.title, nodeIds: [...g.nodeIds] };
};
```

  - `sanitizeView` 의 그룹 줄(178행) `view.groups.push({ id: g.id, title: g.title, nodeIds: [...(g.nodeIds as string[])] });` 를 `view.groups.push(copyGroup({ id: g.id, title: g.title, nodeIds: g.nodeIds as string[], pad: (normalizePad(g.pad) ?? undefined) }));` 로 바꾼다.
  - `updateGroup`(648~656행)의 새 그룹 객체를 `{ ...x, title: patch.title ?? x.title, nodeIds: patch.nodeIds !== undefined ? groupable(g, patch.nodeIds) : x.nodeIds }` 로 바꿔 pad 를 남긴다(키 순서는 `flowJsonOf` 가 `copyGroup` 으로 다시 맞춘다).
  - `removeGroup`(658~662행) 뒤에 더한다.

```ts
/**
 * 그룹 틀 여백을 바꾼다(G2 — 크기 손잡이를 놓을 때 한 번). 0~2000 정수로 자르고, null 이나 모두 0 이면 pad 를 지운다(기본 크기).
 * 크기를 바꿔도 소속은 바뀌지 않는다. 없는 그룹·유한하지 않은 값은 거부한다.
 */
export function setGroupPad(f: EditFlow, id: string, pad: GroupPad | null): EditResult {
  if (!f.view.groups.some((x) => x.id === id)) return fail(`그룹 ${id}를 찾지 못했다`);
  if (pad && ![pad.l, pad.t, pad.r, pad.b].every(finite)) return fail("그룹 크기가 올바르지 않다");
  const g = clone(f);
  const next = normalizePad(pad);
  g.view.groups = g.view.groups.map((x) => {
    if (x.id !== id) return x;
    const base = { id: x.id, title: x.title, nodeIds: x.nodeIds };
    return next ? { ...base, pad: next } : base;
  });
  return { ok: true, flow: g };
}
```

- [ ] **Step 4: `canvas/group-size.ts` 를 만든다.**

```ts
/**
 * 그룹 크기 손잡이(4단계 G2) — 손잡이 이름·끌기 계산·끌기 저장소·문맥. 그리기는 nodes.tsx(GroupNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 끄는 동안은 저장소에만 두고(캔버스의 그룹 틀만 다시 그린다) 놓을 때 FlowCanvas 가 onGroupPadChange 를 한 번 부른다.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

import { MAX_GROUP_PAD, type GroupPad } from "../flow-edit";

/** 네 모서리(nw·ne·se·sw)와 네 변(n·e·s·w). */
export type GroupGrip = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const GROUP_GRIPS: readonly GroupGrip[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const ZERO_PAD: GroupPad = Object.freeze({ l: 0, t: 0, r: 0, b: 0 });

const clamp = (n: number) => Math.max(0, Math.min(MAX_GROUP_PAD, Math.round(n)));

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 여백. 왼·위 변은 바깥(음수)으로 끌면 커진다. 0~2000 정수로 자른다(소속 노드보다 작아지지 않는다). */
export function dragGroupPad(base: GroupPad, grip: GroupGrip, dx: number, dy: number): GroupPad {
  return {
    l: grip.includes("w") ? clamp(base.l - dx) : base.l,
    t: grip.includes("n") ? clamp(base.t - dy) : base.t,
    r: grip.includes("e") ? clamp(base.r + dx) : base.r,
    b: grip.includes("s") ? clamp(base.b + dy) : base.b,
  };
}

export const samePad = (a: GroupPad, b: GroupPad) => a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b;

export interface GroupPadDrag {
  groupId: string;
  pad: GroupPad;
}
/** 끄는 동안의 여백 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface GroupPadStore {
  drag: GroupPadDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createGroupPadStore(): GroupPadStore {
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

export interface GroupSizeApi {
  /** 손잡이 누르기 — 끄는 동안 저장소를 바꾸고, 놓을 때 바뀌었으면 한 번 올린다. */
  startDrag(e: ReactPointerEvent, groupId: string, grip: GroupGrip): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16 — 데이터 참조가 바뀌면 노드를 모두 다시 그린다). */
export const GroupSizeContext = createContext<GroupSizeApi | null>(null);
```

- [ ] **Step 5: `nodes.tsx` 를 고친다.**
  - 19행 `import type { MouseEvent } from "react";` 를 `import { useContext, type MouseEvent } from "react";` 로 바꾸고, import 묶음에 `import { GROUP_GRIPS, GroupSizeContext, type GroupGrip } from "./group-size";` 를 더한다.
  - 58행 `GroupNodeData` 를 `{ id: string; title: string; selected: boolean; /** 편집 모드이고 고른 그룹 — 네 모서리·네 변 크기 손잡이(G2). */ resizable: boolean }` 로 바꾼다.
  - `GroupNodeView`(262~268행)를 바꾼다.

```tsx
/** 크기 손잡이 이름(aria-label). */
const GRIP_LABEL: Record<GroupGrip, string> = {
  nw: "왼쪽 위 모서리", n: "위 변", ne: "오른쪽 위 모서리", e: "오른쪽 변", se: "오른쪽 아래 모서리", s: "아래 변", sw: "왼쪽 아래 모서리", w: "왼쪽 변",
};

export function GroupNodeView({ data }: NodeProps<GroupRfNode>) {
  const size = useContext(GroupSizeContext);
  return (
    <div className="rsf-group" data-testid={`flow-group-${data.id}`} data-selected={data.selected ? "true" : "false"}>
      <span className="rsf-group-title">{data.title}</span>
      {data.resizable &&
        size &&
        GROUP_GRIPS.map((g) => (
          <span
            key={g}
            className="rsf-group-grip nodrag nopan"
            role="button"
            data-grip={g}
            data-testid={`flow-group-grip-${data.id}-${g}`}
            aria-label={`그룹 크기 — ${GRIP_LABEL[g]}`}
            title="끌어 그룹 크기를 바꾼다"
            onPointerDown={(e) => size.startDrag(e, data.id, g)}
          />
        ))}
    </div>
  );
}
```

- [ ] **Step 6: `styles/base.ts` 를 고친다** — `.rsf-group-title:hover { … }`(121행) 바로 뒤에 더한다.

```css
/* 그룹 크기 손잡이(G2, 4단계) — 편집 모드에서 고른 그룹의 네 모서리·네 변. 틀은 누름을 받지 않으므로 손잡이만 다시 켠다. */
.rsf-group-grip {
  position: absolute; box-sizing: border-box; width: 10px; height: 10px; pointer-events: auto; touch-action: none;
  background: var(--color-bg); border: 1.5px solid var(--color-primary); border-radius: 2px;
}
.rsf-group-grip:hover { background: var(--color-primary-soft); }
.rsf-group-grip[data-grip="nw"] { left: -5px; top: -5px; cursor: nwse-resize; }
.rsf-group-grip[data-grip="n"] { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
.rsf-group-grip[data-grip="ne"] { right: -5px; top: -5px; cursor: nesw-resize; }
.rsf-group-grip[data-grip="e"] { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.rsf-group-grip[data-grip="se"] { right: -5px; bottom: -5px; cursor: nwse-resize; }
.rsf-group-grip[data-grip="s"] { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
.rsf-group-grip[data-grip="sw"] { left: -5px; bottom: -5px; cursor: nesw-resize; }
.rsf-group-grip[data-grip="w"] { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
```

- [ ] **Step 7: `FlowCanvas.tsx` 를 고친다(고치는 구역만).**
  1. 55행 import 에 `normalizePad`, `type GroupPad` 를 더하고, 65행(`./nodes`) 아래에 `import { GroupSizeContext, ZERO_PAD, createGroupPadStore, dragGroupPad, samePad, type GroupSizeApi } from "./group-size";` 를 더한다.
  2. `FlowCanvasProps` 의 `onLabelOffsetChange?`(212행) 바로 아래에 더한다.

```ts
  /** 그룹 크기 손잡이를 놓음(G2) — 새 여백(흐름 좌표, 0~2000 정수). 끄는 동안은 부르지 않고 놓을 때 한 번, 바뀌었을 때만. 편집 모드에서만 부른다. */
  onGroupPadChange?: (groupId: string, pad: GroupPad) => void;
```

  3. `groupBox`(845~860행)를 바꾼다.

```ts
/** 그룹 틀 — 멤버 위치의 바깥 상자 + 여백 + 더한 여백(pad, G2). 멤버가 하나도 없으면 null. */
function groupBox(nodeIds: readonly string[], pos: Record<string, FlowPos>, kinds: Map<string, keyof typeof NODE_SIZE>, pad: GroupPad | null | undefined) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of nodeIds) {
    const p = pos[id];
    const k = kinds.get(id);
    if (!p || !k) continue;
    const s = NODE_SIZE[k];
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + s.w);
    y2 = Math.max(y2, p.y + s.h);
  }
  if (!Number.isFinite(x1)) return null;
  const d = pad ?? ZERO_PAD;
  return {
    x: x1 - GROUP_MARGIN - d.l,
    y: y1 - GROUP_MARGIN - d.t,
    w: x2 - x1 + GROUP_MARGIN * 2 + d.l + d.r,
    h: y2 - y1 + GROUP_MARGIN * 2 + d.t + d.b,
  };
}
```

  4. `chips` memo(954행) 바로 뒤, `nodes` memo 앞에 더한다.

```ts
  // 그룹 크기 끌기(G2) — 끄는 동안의 여백. 구독 값이 바뀌면 Inner 가 다시 그려 nodes memo 가 다시 돈다(공간 넓히기 미리보기와 같은 방식 — page·dagre 는 그대로다).
  const groupStore = useMemo(createGroupPadStore, []);
  const groupDrag = useSyncExternalStore(groupStore.subscribe, () => groupStore.drag, () => null);
```

  5. `nodes` memo(956~1000행)는 나누지 않는다. 그룹 반복(959~967행)의 세 줄만 바꾸고 의존성 목록(1000행) 끝에 `groupDrag` 를 더한다. 흐름 노드·메모 반복은 건드리지 않는다(Task 9·11 이 그 반복을 고친다).
     - 960행 `const b = groupBox(g.nodeIds, pos, kinds);` 를 다음 두 줄로 바꾼다.

```ts
      const pad = groupDrag?.groupId === g.id ? groupDrag.pad : g.pad; // 끄는 중이면 그 값(G2)
      const b = groupBox(g.nodeIds, pos, kinds, pad);
```

     - 962행 `const data: GroupNodeData = { id: g.id, title: g.title, selected: selectedId === g.id };` 를 다음으로 바꾼다.

```ts
      const data: GroupNodeData = { id: g.id, title: g.title, selected: selectedId === g.id, resizable: editable && selectedId === g.id };
```

     - 1000행 의존성 배열 끝 `varDisplay]` 를 `varDisplay, groupDrag]` 로 바꾼다(`editable`·`selectedId` 는 이미 들어 있다).

  6. 라벨 끌기 블록(1483~1548행, 끝은 `useEffect(() => () => labelDragRef.current?.stop(), []);`) 바로 뒤에 더한다. `editableRef`·`fullRef`·`rf` 는 이미 위에 있다.

```ts
  // 그룹 크기(G2) — 끄는 동안은 groupStore 에만 두고 놓을 때 onGroupPadChange 를 한 번 부른다(page 는 끄는 동안 다시 그리지 않는다).
  // 새 prop 은 구조 분해에 넣지 않고 props 로 읽는다(구조 분해 줄은 도구 모드 태스크가 고친다).
  const groupPadChangeRef = useRef(props.onGroupPadChange);
  groupPadChangeRef.current = props.onGroupPadChange;
  const groupDragRef = useRef<{ stop: () => void } | null>(null);
  const groupSizeApi = useMemo<GroupSizeApi>(() => ({
    startDrag: (e, groupId, grip) => {
      if (e.button !== 0 || !editableRef.current) return;
      e.stopPropagation();
      groupDragRef.current?.stop();
      const base = normalizePad(fullRef.current.view.groups.find((g) => g.id === groupId)?.pad) ?? ZERO_PAD;
      const sx = e.clientX;
      const sy = e.clientY;
      const onMoveEvt = (ev: MouseEvent) => {
        // 단추가 모두 떨어진 채 움직이면 pointerup 을 잃은 것이다(창 밖에서 놓음) — 기록 없이 버린다(L1 과 같다).
        if (ev.buttons === 0) {
          finish(false);
          return;
        }
        const k = rf.getZoom() || 1;
        const pad = dragGroupPad(base, grip, (ev.clientX - sx) / k, (ev.clientY - sy) / k);
        const cur = groupStore.drag;
        if (cur && cur.groupId === groupId && samePad(cur.pad, pad)) return;
        groupStore.drag = { groupId, pad };
        groupStore.emit();
      };
      const finish = (commit: boolean) => {
        stop();
        const d = groupStore.drag;
        if (!d) return;
        groupStore.drag = null;
        groupStore.emit();
        if (commit && editableRef.current && !samePad(d.pad, base)) groupPadChangeRef.current?.(groupId, d.pad);
      };
      const onUpEvt = () => finish(true);
      const onCancelEvt = () => finish(false);
      const stop = () => {
        groupDragRef.current = null;
        window.removeEventListener("pointermove", onMoveEvt);
        window.removeEventListener("pointerup", onUpEvt);
        window.removeEventListener("pointercancel", onCancelEvt);
      };
      groupDragRef.current = { stop };
      window.addEventListener("pointermove", onMoveEvt);
      window.addEventListener("pointerup", onUpEvt);
      window.addEventListener("pointercancel", onCancelEvt);
    },
  }), [groupStore, rf]);
  // 편집 모드를 떠나거나 언마운트하면 끌던 크기를 버린다.
  useEffect(() => {
    if (editable) return;
    groupDragRef.current?.stop();
    if (groupStore.drag) {
      groupStore.drag = null;
      groupStore.emit();
    }
  }, [editable, groupStore]);
  useEffect(() => () => groupDragRef.current?.stop(), []);
```

  7. 반환 JSX 에서 `<LabelContext.Provider value={labelApi}>`(1774행) 바로 안쪽에 `<GroupSizeContext.Provider value={groupSizeApi}>` 를 열고 `</LabelContext.Provider>`(1856행) 바로 앞에서 닫는다.
  8. 머리 주석 끝(45행 앞)에 한 문단을 더한다: "그룹 크기(4단계 G2): 그룹 틀 = 소속 노드 경계 + 여백 16 + `view.groups[].pad`. 편집 모드에서 고른 그룹에 네 모서리·네 변 손잡이(nodes.tsx)가 뜬다. 끄는 동안은 `GroupPadStore` 에만 두고(캔버스 안에서만 다시 그린다) 놓을 때 `onGroupPadChange` 를 한 번 부른다. 여백으로 저장하므로 소속 노드를 옮기면 틀이 따라가고 소속 노드보다 작게는 줄지 않는다. 크기를 바꿔도 소속은 바뀌지 않는다."

- [ ] **Step 8: `page.tsx` 를 연결한다.**
  - 44~47행 `./flow-edit` import 에 `setGroupPad`, `type GroupPad` 를 더한다.
  - `onLabelOffsetChange` 콜백(265~268행) 바로 뒤에 더한다.

```ts
  // 그룹 크기(G2) — 손잡이를 놓을 때 한 번 = 편집 한 번(되돌리기 한 칸).
  const onGroupPadChange = useCallback(
    (id: string, pad: GroupPad) => editing && edit((f) => setGroupPad(f, id, pad)),
    [editing, edit],
  );
```

  - `<FlowCanvas>` 의 `onLabelOffsetChange={onLabelOffsetChange}`(631행) 바로 아래에 `onGroupPadChange={onGroupPadChange}` 를 더한다.

- [ ] **Step 9: 통과를 확인한다** — Step 2 명령 PASS. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` 전체 PASS(특히 `flow-edit.test.ts` 의 `updateGroup` 시험·`flow-canvas.test.ts` 의 `flow-group-g1` 글자 "묶음"·`space-canvas.test.ts` 의 그룹 선택 시험은 기대를 고치지 않고 통과해야 한다). lint 0 오류. audit 두 개를 바꾼 파일(`flow-edit.ts`, `canvas/group-size.ts`, `canvas/nodes.tsx`, `canvas/FlowCanvas.tsx`, `styles/base.ts`, `page.tsx`)에 돌려 0건. `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0건.

- [ ] **Step 10: 기능설계서를 고친다** — `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
  - §3.2 표 136행을 `| 그룹 틀 | `flow-group-{id}` · 크기 손잡이 `flow-group-grip-{id}-{nw|n|ne|e|se|s|sw|w}` | 구성 노드를 감싸는 바깥 상자(제목). 크기 = 구성 노드 경계 + 여백 16 + 저장한 여백 `pad`(G2). 편집 모드에서 고른 그룹에만 네 모서리·네 변 손잡이가 보인다. 화면 전용 |` 로 바꾼다.
  - 160행을 `| `groups` | 그룹 틀(제목·구성 노드·더한 여백 `pad?: {l, t, r, b}` — 흐름 좌표 정수 0~2000, 없거나 모두 0 이면 키가 없어 예전 저장본과 글자가 같다, G2) |` 로 바꾼다.
  - §5.3 표 281행(맞춤 안내선·스냅) 바로 아래에 새 행을 더한다: `| 그룹 크기(G2, 4단계) | 편집 모드에서 그룹을 고르면(제목 누르기) 틀의 네 모서리·네 변에 손잡이가 뜬다. 끌면 그 변(모서리는 두 변)이 움직이고, 끄는 동안은 화면에서만 바뀌며 놓을 때 한 번 기록한다(되돌리기 한 칸). 크기는 구성 노드 경계에 더한 여백(`view.groups[].pad`, 0~2000)으로 저장하므로 구성 노드를 옮기면 틀이 따라가고 구성 노드보다 작게는 줄지 않는다. 크기를 바꿔도 소속은 바뀌지 않는다(틀 안으로 들어온 노드를 넣지 않는다). 보기·디버그 모드도 저장된 크기로 그린다 |`

- [ ] **Step 11: 커밋한다**
  - `/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/group-size.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/base.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/group-pad.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
  - `/usr/bin/git commit -m "feat(m-mdm): 흐름 그룹 틀 크기를 네 모서리·네 변 손잡이로 바꾼다" --trailer "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" --trailer "Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/group-size.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/base.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/group-pad.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`

---

#### Task 4~6 — Review Focus 후보(작성자)

1. 자동 점·선분 막대의 testid 가 `flow-route-handle-` 접두어와 겹치면 기존 시험(`addons-fix` L6 `route-reset` 뒤 `flow-route-handle-e2-0` 없음, `undo` 의 점 개수)이 깨진다. `flow-route-auto-`·`flow-route-seg-` 로 나뉘었는지, 기존 시험의 기대를 고치지 않고 통과했는지 본다.
2. 선분 끌기는 짧은 선분 두 개를 끼우므로 꺾는 점이 20개를 넘을 수 있다. 끄는 동안의 미리보기는 되지만, 놓으면 `setRoute` 가 거부하고 알림을 띄우며 선이 되돌아가야 한다(조용히 잘리면 안 된다). dagre 좌표가 소수(.5)이면 반올림한 짧은 선분이 0.5px 기울 수 있다.
3. `nodes` memo 의존성에 `groupDrag` 가 빠지면 끄는 동안 틀이 움직이지 않고, 그룹 반복이 `editable`·`selectedId` 를 보지 않으면 모드를 바꿔도 손잡이가 남는다. `updateGroup`·`sanitizeView`·`copyGroup` 가운데 하나라도 `pad` 를 버리면 속성 패널에서 제목만 고쳐도 크기가 사라진다. 또 pad 가 없는 그룹이 `"pad":null` 이나 빈 객체를 쓰면 열자마자 dirty 가 된다.

#### Task 4~6 — 편차(작성자 결정, 진행 장부에 Ruling 으로 옮긴다)

| 스펙 | 이 계획 | 이유 |
|---|---|---|
| §3.1 점 손잡이 — 자동 경로는 "자동 경로의 꺾임에 뜬다" | 라벨·[+] 자리에서 화면 24px 안의 자동 점은 그리지 않는다 | dagre 기본 간격(ranksep 46 → 연결점 사이 38px)에서 옆으로 비킨 선은 `getSmoothStepPath` 가 가운데에 2px 턱(꺾임 둘, 예: (191,92)·(191,90))을 만든다. 그 자리가 [+] 자리라 손잡이 둘이 겹쳐 [+] 아래에 깔린다. 그 꺾임은 이웃 선분 막대로 옮길 수 있다. |
| §3.1 막대 — 라벨·[+] 에서 24px 안이면 "1/4 지점으로 옮긴다" | 1/4 지점도 24px 안이면 막대를 그리지 않는다 | 가장 흔한 선(dagre 기본 38px 곧은 선)에서 1/4 지점은 [+] 에서 9.5px 이라 막대가 [+] 와 겹치고, [+] 가 막대를 비켜 옆으로 밀린다(기존 U1 시험 `addons-fix` "짧은 선 [+] 자리"가 깨진다). 화면 96px 이상인 선분에는 막대가 있다. |
| §3.2 합치기 — "이웃과 일직선(화면 6px 안)에 가까워지면 딱 맞춘다" | 맞춤 후보는 안쪽 점뿐이다(노드 연결점 좌표는 뺀다) | 연결점 좌표에 맞추면 노드에 붙은 선분 길이가 0 이 되고, 놓을 때 단순화하면 옮긴 선분이 노드에 바로 붙어 화살표가 노드 옆으로 들어간다. 스펙이 짧은 선분으로 지키려는 "나가는 방향"이 깨진다. |
| §3.2 첫·끝 선분 — "노드에서 20px 나온 짧은 선분" | `min(20, 선분 길이/3)` | 38px 곧은 선을 옮기면 20px 짧은 선분 둘이 만나 옮긴 선분 길이가 0 이 되고, 놓을 때 단순화가 다시 곧은 선으로 접는다(끌어도 아무 일이 없다). |
| §3.3 `getPoints`·`getDirection`·`handleDirections`·`getEdgeCenter` 이식 | `getEdgeCenter` 와 라벨 자리(centerX·centerY) 계산은 옮기지 않는다 | `getPoints` 에서 반환 오프셋·라벨 자리에만 쓰이고 점 계산에는 쓰이지 않는다. [+]·라벨 자리는 지금처럼 `getSmoothStepPath` 반환값을 쓴다. |
| §3.3 "처음 끌 때 선이 튀지 않는다" | 저장 경로로 바꿀 때 단순화한 점(`autoRoute`)을 쓴다 — 원래 점 사이 선분이 16px 미만이고 그 옆의 곧은 점이 빠지면 모서리 반경이 달라진다 | 단순화하지 않으면 노드에서 곧게 나온 선분이 두 조각으로 남아 그 조각을 옮길 때 노드 쪽 조각이 대각선이 된다. 스펙 64경우(원래 점)는 모두 같고, 넓은 간격 64경우도 단순화 뒤 같다. 좁은 간격 64경우 가운데 2경우(right→left, 옆 60)에서만 반경이 5→8 로 바뀐다(계획 작성 때 스크래치로 확인). |
| §3.2 "놓을 때 한 직선 위 가운데 점과 길이 0 선분을 지운다" | 선분 끌기에만 적용한다. 점 끌기(저장 경로·자동 경로)는 반올림만 하고 정리하지 않는다 | 점 끌기는 "지금과 같다"(스펙 §3.2)이다. 사용자가 일부러 한 직선 위에 둔 점이 사라지지 않게 한다. |
| §4 "0 이상 2000 이하로 자른다" | 정수로 반올림도 한다 | 저장 글자·dirty 비교를 안정시키려는 것이다(`view.labels` 오프셋과 같은 관례). |

#### Task 4~6 — 작성자 메모

- 계획 작성 때 직접 확인한 것: (1) `@xyflow/system@0.0.83`(`@xyflow/react` 12.12.0 이 쓰는 판)의 `getPoints` 를 옮긴 코드가 스펙의 네 변×네 변×네 위치 64경우에서 `getSmoothStepPath(borderRadius 8)` 와 모양이 같다. 단순화 판은 넓은 간격에서 64/64, 좁은 간격에서 62/64 이다. (2) happy-dom 캔버스는 `translate(0px,0px) scale(1)` 이다(FlowCanvas 단독 렌더에서 fitView 가 돌지 않는다). (3) dagre 기본 배치의 곧은 선은 연결점 사이 38px, `r1(0,0)→r2(600,400)` 의 e2 자동 경로는 `(116,72)→(116,234)→(716,234)→(716,396)` 이다. (4) 그룹 노드 감싸개 style 에 `transform: translate(-16px,-16px)`·`width: 264px`·`height: 100px` 가 붙는다(구성 노드 r1 하나일 때). (5) TS 5.9 에서 `Position` 열거형 값을 `"left"|"top"|"right"|"bottom"` 타입에 넘길 수 있다.
- 확인하지 못한 것: page 수준 시험(`rule-set-edit-page`)에서 세트를 열 때 `fitView` 가 배율을 바꾸는지이다. 그래서 page 시험은 배율을 읽어 흐름 거리로 바꾸게 썼다.
- Task 7 이 `spaceTool` prop 을 바꿀 수 있어 Task 5 의 공간 넓히기 시험은 Alt+끌기(스펙상 그대로 남는다)로 썼다. Task 6 은 `Inner` 구조 분해 줄을 건드리지 않으려고 `props.onGroupPadChange` 로 읽고, 그룹 CSS 는 `rsf-styles.ts` 결합 줄 대신 `styles/base.ts` 의 기존 그룹 규칙 옆에 둔다. Task 5·6 은 `FlowCanvas.tsx` 의 서로 다른 구역만 고치지만, 머리 주석 끝에 둘 다 문단을 더하므로 나중에 병합하는 쪽이 두 문단을 모두 남긴다.
- 스펙대로 "두 번 눌러 점 더하기는 지금과 같다"를 지켰으므로, 경로가 없는 선을 두 번 누르면 지금처럼 점 하나만 둔 경로가 된다(자동 경로의 꺾임을 이어받지 않아 선 모양이 바뀐다). 자동 점을 이어받게 바꾸는 일은 한 줄(`routeApi.addPoint(id, route ?? autoRoute(…), …)`)이지만 스펙 밖이라 넣지 않았다. 사용자 확인 후보이다.
- Task 6 은 `nodes` memo 를 나누지 않고 그룹 반복 세 줄과 의존성 하나만 고친다. 그룹 크기를 끄는 동안 노드 객체가 모두 새로 만들어지지만(공간 넓히기 미리보기와 같다) §16 이 요구하는 page 다시 그리기 없음·dagre 호출 불변은 시험으로 지킨다. 나누면 Task 9·11 이 고칠 흐름 노드 반복 전체가 옮겨져 병합 충돌이 커진다.

---

### Task 7: 떠 있는 도구 상자·도구 모드·미니맵 자리 (P1 왼쪽)

**모델:** sonnet — 배치를 옮기는 일이 대부분이고, 도구 모드는 ReactFlow props 두 개로 정해진다.

**경로 약칭:** 이 조각에서 `canvas/…`·`panels/…`·`state/…`·`styles/…`·`page.tsx`·`flow-*.ts` 는 `src/frontend/m-mdm/pages/dme/ruleSetEdit/` 아래이고, `tests/…` 는 `src/frontend/m-mdm/tests/dme/ruleSetEdit/` 아래다.

**Files:**
- Create: `canvas/FlowToolbox.tsx`(도구 상자 — 도구 묶음 + 구분선 + 요소 묶음), `styles/toolbox.ts`(`TOOLBOX_CSS`)
- Modify: `canvas/FlowPalette.tsx`(전체 — 아이콘만·`aria-label`·`data-tip`, 파일과 `FlowPalette` 이름·testid 는 그대로 둔다)
- Modify: `canvas/FlowCanvas.tsx` — **이 네 곳만** 고친다(Task 5·6 이 같은 파일의 선·그룹 부분을 고치므로 줄 번호가 아니라 기호로 찾는다):
  1. `FlowCanvasProps` 의 `spaceTool?` 바로 위에 `dragTool?` prop 한 개
  2. `function Inner` 의 props 구조 분해에 `dragTool` 를 더하고, `const debugging = mode === "debug";` 다음 줄에 `hand` 계산 한 줄
  3. 루트 `<div ref={wrapRef} className="rsf-canvas" …>` 에 `data-drag-tool` 속성 한 줄, `<ReactFlow` props 의 `selectionOnDrag`·`panOnDrag` 두 줄과 그 위 주석
  4. `MINIMAP_STYLE` 상수 삭제와 `<MiniMap position=…>` 한 줄(주석 포함), 파일 머리 주석의 "편집 모드 화면 이동은 Figma 방식" 문단 한 줄 보탬
- Modify: `canvas/FlowToolbar.tsx`(`spaceTool`·`onToggleSpaceTool` prop 과 [공간] 단추, `IconArrowAutofitWidth` import, 머리 주석 S1 줄)
- Modify: `canvas/RulePanel.tsx`(팔레트·`onPick`·`loading` 제거 — 목록만 남긴다)
- Modify: `canvas/shortcuts.ts`(`GestureId` 에 `"handDrag"`, `SHORTCUT_HELP` 의 `escape`·`boxSelect`·`spaceDrag` 문구와 `handDrag` 줄)
- Modify: `page.tsx`(도구 상태, 왼쪽 칸은 디버그 모드만, 도구 상자 그리기, 룰 목록 임시 자리, Esc, 머리 주석)
- Modify: `styles/base.ts`(`/* 팔레트 */` 두 줄과 `.rsf-rule-panel > .rsf-palette` 한 줄 삭제), `rsf-styles.ts`(`TOOLBOX_CSS` 잇기)
- Test: `tests/toolbox.test.ts`(새), `tests/seams.test.ts`(사례 1), `tests/space-canvas.test.ts`(「보기 모드 — [공간] 이 꺼져 있고…」 사례)
- Docs: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` §2(그림·A-TOOL·A-LEFT·A-CANVAS 행, 새 A-TOOLBOX 행), §5.1 B-009·B-028 행과 새 행(도구 [손]·[영역 선택])
- e2e: `src/frontend/e2e/mdm-user/dme.user.ts`(도구 단추 누르기 — 버튼 전수 확인)

**Interfaces:**
- Consumes: 3단계 `PALETTE_MIME`·`PaletteItem`(`canvas/FlowCanvas.tsx`), `keepFocusOffButtons`(`canvas/FlowToolbar.tsx`), `editActions.pickPalette`(`state/useEditActions.ts`), `FlowMode`(`state/useRuleSetEdit.ts`). FlowCanvas 의 기존 `spaceTool`·`onSpaceToolChange` prop 은 그대로 쓴다(이름·뜻 유지).
- Produces:
  - `canvas/FlowToolbox.tsx`: `export type CanvasTool = "hand" | "select" | "space"`, `export function defaultTool(mode: FlowMode): CanvasTool`(편집 `"select"`, 보기·디버그 `"hand"`), `export function FlowToolbox(props: FlowToolboxProps)` — `FlowToolboxProps = { mode: FlowMode; tool: CanvasTool; onTool(t: CanvasTool): void; onPick(item: PaletteItem): void; disabled: boolean }`.
  - `FlowCanvasProps.dragTool?: "hand" | "select"` — 없으면 모드 기본(편집 = select, 보기·디버그 = hand). 루트 요소 `data-drag-tool="hand" | "select"`.
  - testid: `flow-toolbox`(`role="toolbar"`, `aria-orientation="vertical"`), `flow-tool-hand`·`flow-tool-select`(새), `flow-space-tool`(툴바에서 도구 상자로 옮김 — testid 유지), `flow-palette`·`flow-add-{rule|if|par|note|group}`(유지). 도구 단추는 `aria-pressed`.
  - page 안 상태 `tool: CanvasTool`(저장 안 함). Task 8·9 는 이 상태를 쓰지 않는다.
  - **중간 상태(이 태스크 병합 ~ Task 8 병합 사이):** 보기·편집 모드의 오른쪽 패널은 지금 속성·세트 패널 아래에 기존 `RulePanel`(룰 목록 — 접기 `flow-rule-panel-toggle`·찾기·줄 끌기·두 번 누르기)을 **그대로** 붙인다. testid·동작이 바뀌지 않아 `flow-drag.test.ts` 의 룰 목록 사례와 e2e(`flow-rule-panel-*`)가 그대로 돈다. 팔레트 [룰] 은 이 태스크에서도 룰 찾기 창(`RuleSearchModal`)을 연다(Task 9 가 바꾼다).

- [ ] **Step 1: 실패하는 테스트** — `tests/toolbox.test.ts` 를 새로 쓴다.

```ts
/** @vitest-environment happy-dom */

// 4단계 Task 7(P1) — 떠 있는 도구 상자(아이콘·툴팁·aria-label), 도구 모드([손]·[영역 선택]·[공간]·Esc), 왼쪽 분할 칸 없애기, 미니맵 자리.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), rfProps: [] as Record<string, unknown>[] }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));
// React Flow 에 넘긴 props 를 적어 둔다(그리기는 진짜 ReactFlow 가 한다) — space-canvas.test.ts 와 같은 방식.
vi.mock("../../../pages/dme/ruleSetEdit/canvas/react-flow", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/canvas/react-flow")>();
  const Spy = (p: Record<string, unknown>) => {
    mocks.rfProps.push(p);
    return createElement(real.ReactFlow as never, p as never);
  };
  return { ...real, ReactFlow: Spy };
});

import { FlowToolbox, defaultTool, type CanvasTool } from "../../../pages/dme/ruleSetEdit/canvas/FlowToolbox";
import { PALETTE_MIME } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { SHORTCUT_HELP } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "도구 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["TB_A", "TB_B"], flow: null, branched: false },
    rules: [io("TB_A"), io("TB_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const NAMES: Record<string, string> = {
  "flow-tool-hand": "손", "flow-tool-select": "영역 선택", "flow-space-tool": "공간",
  "flow-add-rule": "룰", "flow-add-if": "IF 분기", "flow-add-par": "병렬 분기", "flow-add-note": "메모", "flow-add-group": "그룹",
};
const lastRf = () => mocks.rfProps[mocks.rfProps.length - 1];
const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
async function esc() {
  const canvas = byTestId("flow-canvas");
  await act(async () => {
    canvas.focus();
  });
  await act(async () => {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("도구 상자(단위)", () => {
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
  });
  const draw = (mode: FlowMode, tool: CanvasTool, onTool = vi.fn(), onPick = vi.fn()) =>
    act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(FlowToolbox, { mode, tool, onTool, onPick, disabled: false })));
    });
  const inHost = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it("편집 모드 — 도구 셋·구분선·요소 다섯. 아이콘만 있고 이름은 aria-label 과 오른쪽 툴팁(data-tip)이 같다", async () => {
    await draw("edit", "select");
    for (const [id, name] of Object.entries(NAMES)) {
      const b = inHost(id);
      expect(b, id).not.toBeNull();
      expect(b!.getAttribute("aria-label"), id).toBe(name);
      expect(b!.getAttribute("data-tip"), id).toBe(name);
      expect((b!.textContent ?? "").trim(), id).toBe("");
    }
    const box = inHost("flow-toolbox")!;
    expect(box.getAttribute("role")).toBe("toolbar");
    expect(box.getAttribute("aria-orientation")).toBe("vertical");
    expect(box.querySelector('[role="separator"]')).not.toBeNull();
    expect(inHost("flow-tool-select")!.getAttribute("aria-pressed")).toBe("true");
    expect(inHost("flow-tool-hand")!.getAttribute("aria-pressed")).toBe("false");
    expect(inHost("flow-space-tool")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("보기·디버그 모드 — [손]·[영역 선택] 만 있고 [공간]·요소·구분선이 없다", async () => {
    for (const mode of ["view", "debug"] as const) {
      await draw(mode, "hand");
      expect(inHost("flow-tool-hand"), mode).not.toBeNull();
      expect(inHost("flow-tool-select"), mode).not.toBeNull();
      expect(inHost("flow-space-tool"), mode).toBeNull();
      expect(inHost("flow-palette"), mode).toBeNull();
      expect(inHost("flow-toolbox")!.querySelector('[role="separator"]'), mode).toBeNull();
      expect(inHost("flow-tool-hand")!.getAttribute("aria-pressed"), mode).toBe("true");
    }
  });

  it("도구 누르기는 onTool, 요소 누르기는 onPick, 요소 끌기는 PALETTE_MIME 에 항목을 싣는다", async () => {
    const onTool = vi.fn();
    const onPick = vi.fn();
    await draw("edit", "select", onTool, onPick);
    await act(async () => {
      inHost("flow-tool-hand")!.click();
    });
    expect(onTool).toHaveBeenLastCalledWith("hand");
    await act(async () => {
      inHost("flow-space-tool")!.click();
    });
    expect(onTool).toHaveBeenLastCalledWith("space");
    await act(async () => {
      inHost("flow-add-if")!.click();
    });
    expect(onPick).toHaveBeenLastCalledWith("if");
    const data: Record<string, string> = {};
    const ev = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: "" } });
    await act(async () => {
      inHost("flow-add-note")!.dispatchEvent(ev);
    });
    expect(data[PALETTE_MIME]).toBe("note");
  });

  it("도구 단추는 mousedown 기본 동작(초점 옮기기)을 막고, 요소 단추는 HTML5 끌기를 살리려고 막지 않는다", async () => {
    await draw("edit", "select");
    const down = (id: string) => {
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      inHost(id)!.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(down("flow-tool-hand")).toBe(true);
    expect(down("flow-space-tool")).toBe(true);
    expect(down("flow-add-rule")).toBe(false);
  });

  it("defaultTool — 편집은 영역 선택, 보기·디버그는 손(3단계 동작 그대로)", () => {
    expect(defaultTool("edit")).toBe("select");
    expect(defaultTool("view")).toBe("hand");
    expect(defaultTool("debug")).toBe("hand");
  });

  it("도움말 표 — [공간] 은 도구 상자, [손] 끌기 줄이 모든 모드에 있다", () => {
    expect(SHORTCUT_HELP.find((h) => h.id === "spaceDrag")?.label).toContain("도구 상자 [공간]");
    const hand = SHORTCUT_HELP.find((h) => h.id === "handDrag");
    expect(hand?.modes).toEqual(["view", "edit", "debug"]);
  });
});

describe("화면 — 도구 상자·도구 모드·미니맵 자리", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.rfProps = [];
  });
  afterEach(() => uninstallServer());

  it("왼쪽 분할 칸이 없다 — 도구 상자는 캔버스 감싸개 안, 룰 목록은 오른쪽 패널 아래(임시 자리). 디버그만 왼쪽 입력 패널", async () => {
    await openSet("TB_1", viewOf("TB_1"));
    const host = document.querySelector(".rsf-canvas-host")!;
    expect(host.querySelector('[data-testid="flow-toolbox"]')).not.toBeNull();
    expect(byTestId("flow-props").querySelector('[data-testid="flow-rule-panel"]')).not.toBeNull();
    expect(q("flow-palette")).toBeNull();
    expect(q("dbg-inputs")).toBeNull();
    expect(pressed("flow-tool-hand")).toBe("true");

    await click("flow-mode-edit");
    expect(byTestId("flow-toolbox").querySelector('[data-testid="flow-palette"]')).not.toBeNull();
    expect(byTestId("flow-toolbar").querySelector('[data-testid="flow-space-tool"]')).toBeNull(); // 툴바에서 빠졌다
    expect(pressed("flow-tool-select")).toBe("true");

    await click("flow-mode-debug");
    expect(q("dbg-inputs")).not.toBeNull();
    expect(q("flow-rule-panel")).toBeNull();
    expect(q("flow-space-tool")).toBeNull();
    expect(pressed("flow-tool-hand")).toBe("true");
  });

  it("편집 [손] — 끌기 = 화면 이동(영역 선택 없음), 초점은 캔버스. Esc 는 [영역 선택] 으로만 돌리고 선택은 그대로, 다음 Esc 가 선택을 푼다", async () => {
    await openSet("TB_2", viewOf("TB_2"));
    await click("flow-mode-edit");
    expect(lastRf()).toMatchObject({ selectionOnDrag: true, panOnDrag: [1], panOnScroll: true });
    await click("flow-tool-hand");
    expect(pressed("flow-tool-hand")).toBe("true");
    expect(byTestId("flow-canvas").getAttribute("data-drag-tool")).toBe("hand");
    expect(lastRf()).toMatchObject({ selectionOnDrag: false, panOnDrag: true, panOnScroll: true, selectionKeyCode: "Shift" });
    expect(document.activeElement).toBe(byTestId("flow-canvas"));
    await click("flow-node-r1");
    await esc();
    expect(pressed("flow-tool-select")).toBe("true");
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("true");
    await esc();
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("false");
  });

  it("보기 [영역 선택] — 끌기 = 영역 선택, 휠은 그대로 확대. Esc 는 보기 기본 [손] 으로", async () => {
    await openSet("TB_3", viewOf("TB_3"));
    expect(lastRf()).toMatchObject({ selectionOnDrag: false, panOnDrag: true, panOnScroll: false });
    await click("flow-tool-select");
    expect(byTestId("flow-canvas").getAttribute("data-drag-tool")).toBe("select");
    expect(lastRf()).toMatchObject({ selectionOnDrag: true, panOnDrag: [1], panOnScroll: false, selectionKeyCode: null });
    await esc();
    expect(pressed("flow-tool-hand")).toBe("true");
  });

  it("모드를 바꾸면 그 모드의 기본 도구로 돌아간다(편집 [손] → 디버그 → 편집 = [영역 선택])", async () => {
    await openSet("TB_4", viewOf("TB_4"));
    await click("flow-mode-edit");
    await click("flow-tool-hand");
    await click("flow-mode-debug");
    expect(pressed("flow-tool-hand")).toBe("true");
    await click("flow-mode-edit");
    expect(pressed("flow-tool-select")).toBe("true");
  });

  it("[공간] 은 한 번 누르면 켜지고 다시 누르면 [영역 선택] 으로 돌아간다. 다른 도구를 고르면 꺼진다", async () => {
    await openSet("TB_5", viewOf("TB_5"));
    await click("flow-mode-edit");
    await click("flow-space-tool");
    expect(pressed("flow-space-tool")).toBe("true");
    expect(byTestId("flow-canvas").getAttribute("data-space-tool")).toBe("true");
    await click("flow-space-tool");
    expect(pressed("flow-tool-select")).toBe("true");
    await click("flow-space-tool");
    await click("flow-tool-hand");
    expect(pressed("flow-space-tool")).toBe("false");
    expect(byTestId("flow-canvas").getAttribute("data-space-tool")).toBeNull();
  });

  it("미니맵은 오른쪽 위, 확대·축소 단추는 오른쪽 아래", async () => {
    await openSet("TB_6", viewOf("TB_6"));
    const mini = byTestId("flow-canvas").querySelector(".react-flow__minimap")!;
    expect([...mini.classList]).toEqual(expect.arrayContaining(["top", "right"]));
    const ctl = byTestId("flow-canvas").querySelector(".react-flow__controls")!;
    expect([...ctl.classList]).toEqual(expect.arrayContaining(["bottom", "right"]));
  });
});
```

기존 사례 고치기(같은 Step 에서 기대부터 바꾼다):
- `tests/seams.test.ts` 사례 1: 제목을 「세트를 열면 모드 단추 셋이 있고 보기 모드이며, 팔레트가 없다. 편집 모드면 도구 상자에 팔레트가 있다」로 바꾸고, `expect(byTestId("flow-rule-panel").querySelector('[data-testid="flow-palette"]')).not.toBeNull();` 를 `expect(byTestId("flow-toolbox").querySelector('[data-testid="flow-palette"]')).not.toBeNull();` 로 바꾼다(`q("flow-rule-panel")` 이 있다는 기대는 임시 자리라 그대로 참이다).
- `tests/space-canvas.test.ts` 「보기 모드 — [공간] 이 꺼져 있고 Alt+끌기도 무시한다. 편집 모드를 떠나면 켜 둔 토글이 꺼진다」: 첫 줄 `expect((byTestId("flow-space-tool") as HTMLButtonElement).disabled).toBe(true);` 를 `expect(q("flow-space-tool")).toBeNull(); // 보기 모드 도구 상자는 [손]·[영역 선택] 만` 로, `await click("flow-mode-view"); expect(pressed()).toBe("false");` 를 `await click("flow-mode-view"); expect(q("flow-space-tool")).toBeNull();` 로 바꾼다. 마지막 두 줄(편집으로 돌아오면 꺼짐)은 그대로 둔다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/toolbox.test.ts tests/dme/ruleSetEdit/seams.test.ts tests/dme/ruleSetEdit/space-canvas.test.ts` → `toolbox.test.ts` 는 `FlowToolbox` 모듈이 없어 FAIL, 나머지 두 파일은 바꾼 사례만 FAIL.

- [ ] **Step 3: 구현 — 도구 상자·팔레트·스타일**

`canvas/FlowToolbox.tsx`(새):

```tsx
"use client";

/**
 * 떠 있는 도구 상자(4단계 계획 Task 7, 스펙 §1.3 P1) — 캔버스 감싸개(`rsf-canvas-host`) 안 왼쪽 위(여백 12px)의 세로 막대.
 * 위 묶음은 도구(한 번에 하나, 고른 도구는 `aria-pressed`), 구분선 아래는 요소(편집 모드만 — `FlowPalette`).
 * 아이콘만 보이고 이름은 오른쪽으로 뜨는 툴팁(`data-tip`, `styles/toolbox.ts` 의 CSS)이며 `aria-label` 도 같은 이름이다.
 * shared 에 툴팁·접는 목록 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않으므로(mantine-aggrid-ui 스킬 §3) CSS 툴팁으로 둔다.
 * 도구 단추는 mousedown 기본 동작(초점 옮기기)을 막는다(Local-Rules §19 — 단추에 초점이 남으면 스페이스+끌기가 그 단추를 다시 누른다).
 * 요소 단추는 HTML5 끌기를 살리려고 막지 않고, 누르거나 끌어 놓은 뒤 초점을 놓는다(`FlowPalette`).
 * 도구는 저장하지 않는다. 기본 도구는 모드마다 다르다(`defaultTool`) — Esc·모드 바꾸기·다른 세트 열기가 그리로 돌린다(page).
 * FlowCanvas 밖(page)에서 그려 캔버스 파일을 건드리지 않는다 — 캔버스 루트의 포인터 캡처(공간 넓히기)·끌어 놓기와도 섞이지 않는다.
 */
import { IconArrowAutofitWidth, IconHandStop, IconLasso } from "@tabler/icons-react";

import type { FlowMode } from "../state/useRuleSetEdit";
import type { PaletteItem } from "./FlowCanvas";
import { FlowPalette } from "./FlowPalette";
import { keepFocusOffButtons } from "./FlowToolbar";

export type CanvasTool = "hand" | "select" | "space";

/** 모드의 기본 도구 — 편집 = 영역 선택(3단계 편집 동작), 보기·디버그 = 손(3단계 보기·디버그 동작: 끌기 = 화면 이동). */
export function defaultTool(mode: FlowMode): CanvasTool {
  return mode === "edit" ? "select" : "hand";
}

export interface FlowToolboxProps {
  mode: FlowMode;
  tool: CanvasTool;
  /** 도구 단추 누르기 — page 가 [공간] 을 다시 누르면 영역 선택으로 돌리고 초점을 캔버스로 옮긴다. */
  onTool(t: CanvasTool): void;
  /** 요소 누르기(편집 모드만) — 고른 선(없으면 END 앞 선)에 끼운다. */
  onPick(item: PaletteItem): void;
  /** 서버를 부르는 중 — [공간]·요소를 끈다. */
  disabled: boolean;
}

const TOOLS: { tool: CanvasTool; testId: string; label: string; icon: typeof IconHandStop; editOnly: boolean }[] = [
  { tool: "hand", testId: "flow-tool-hand", label: "손", icon: IconHandStop, editOnly: false },
  { tool: "select", testId: "flow-tool-select", label: "영역 선택", icon: IconLasso, editOnly: false },
  { tool: "space", testId: "flow-space-tool", label: "공간", icon: IconArrowAutofitWidth, editOnly: true },
];

export function FlowToolbox({ mode, tool, onTool, onPick, disabled }: FlowToolboxProps) {
  const editing = mode === "edit";
  return (
    <div className="rsf-toolbox" data-testid="flow-toolbox" role="toolbar" aria-orientation="vertical" aria-label="도구 상자">
      <div className="rsf-toolbox-group" role="group" aria-label="도구" onMouseDown={keepFocusOffButtons}>
        {TOOLS.filter((t) => editing || !t.editOnly).map(({ tool: t, testId, label, icon: Icon, editOnly }) => (
          <button
            key={t}
            type="button"
            className="rsf-tool"
            data-testid={testId}
            aria-label={label}
            data-tip={label}
            aria-pressed={tool === t}
            disabled={editOnly && disabled}
            onClick={() => onTool(t)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      {editing && (
        <>
          <div className="rsf-toolbox-sep" role="separator" />
          <FlowPalette onPick={onPick} disabled={disabled} />
        </>
      )}
    </div>
  );
}
```

`canvas/FlowPalette.tsx`(전체 바꿈 — 이름·testid·끌기 규칙 유지):

```tsx
"use client";

/**
 * 도구 상자의 요소 묶음(3단계 팔레트 → 4단계 Task 7 에서 아이콘만) — 누르면 onPick, 끌어서 캔버스에 놓아도 된다(HTML5 드래그, `PALETTE_MIME`).
 * 이름은 오른쪽 툴팁(`data-tip`)·`aria-label` 이다. 마우스로 누르거나 끌어 놓은 뒤에는 초점을 놓는다(S1 리뷰 Important 2).
 * 툴바처럼 mousedown 을 막지 않는 까닭: mousedown 기본 동작을 막으면 HTML5 끌기가 시작되지 않는다.
 */
import type { DragEvent, MouseEvent } from "react";

import { IconArrowsSplit, IconBoxMultiple, IconGitBranch, IconListDetails, IconNote } from "@tabler/icons-react";

import { PALETTE_MIME, type PaletteItem } from "./FlowCanvas";

export interface FlowPaletteProps {
  onPick: (item: PaletteItem) => void;
  disabled: boolean;
}

/** 요소 — 아이콘은 오른쪽 패널 머리글(Task 8)도 같은 것을 쓴다. */
export const PALETTE_ITEMS: { item: PaletteItem; testId: string; label: string; icon: typeof IconNote }[] = [
  { item: "rule", testId: "flow-add-rule", label: "룰", icon: IconListDetails },
  { item: "if", testId: "flow-add-if", label: "IF 분기", icon: IconGitBranch },
  { item: "par", testId: "flow-add-par", label: "병렬 분기", icon: IconArrowsSplit },
  { item: "note", testId: "flow-add-note", label: "메모", icon: IconNote },
  { item: "group", testId: "flow-add-group", label: "그룹", icon: IconBoxMultiple },
];

export function FlowPalette({ onPick, disabled }: FlowPaletteProps) {
  const start = (item: PaletteItem) => (e: DragEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(PALETTE_MIME, item);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="rsf-palette" data-testid="flow-palette" role="group" aria-label="요소">
      {PALETTE_ITEMS.map(({ item, testId, label, icon: Icon }) => (
        <button
          key={item}
          type="button"
          className="rsf-tool"
          data-testid={testId}
          aria-label={label}
          data-tip={label}
          disabled={disabled}
          draggable={!disabled}
          onDragStart={start(item)}
          onDragEnd={(e: DragEvent<HTMLButtonElement>) => e.currentTarget.blur()}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            onPick(item);
            if (e.detail > 0) e.currentTarget.blur(); // 마우스로 눌렀으면 초점을 놓는다(키보드 Enter·Space 는 detail 0 — 그대로)
          }}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
```

`FlowCanvas.tsx` 의 모듈 상수 `PALETTE_ITEMS: readonly string[]` 과 이름이 같지만 다른 모듈이라 충돌하지 않는다(FlowCanvas 는 FlowPalette 를 import 하지 않는다).

`styles/toolbox.ts`(새):

```ts
/**
 * 떠 있는 도구 상자(4단계 계획 Task 7, 스펙 §1.3) — 캔버스 안 왼쪽 위 세로 막대, 아이콘 단추 36px, 오른쪽으로 뜨는 CSS 툴팁(`data-tip`).
 * 색은 의미 토큰만 쓴다. 고른 도구는 전체 테두리·배경 톤으로 보인다(한 변 색 바 금지, Local-Rules §8).
 */
export const TOOLBOX_CSS = `
.rsf-toolbox {
  position: absolute; top: 12px; left: 12px; z-index: 5;
  display: flex; flex-direction: column; gap: 2px; padding: 4px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}
.rsf-toolbox-group, .rsf-palette { display: flex; flex-direction: column; gap: 2px; }
.rsf-toolbox-sep { height: 1px; margin: 2px 4px; background: var(--color-border-light); }
.rsf-tool {
  position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-secondary); cursor: pointer;
}
.rsf-tool:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text); }
.rsf-tool[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
.rsf-tool:disabled { opacity: 0.4; cursor: default; }
.rsf-tool:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.rsf-palette .rsf-tool[draggable="true"] { cursor: grab; }
.rsf-tool[data-tip]:hover::after, .rsf-tool[data-tip]:focus-visible::after {
  content: attr(data-tip); position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); z-index: 1;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm);
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
`;
```

`rsf-styles.ts`: `import { TOOLBOX_CSS } from "./styles/toolbox";` 를 더하고 `RSF_CSS` 배열 끝(`CONNECT_CSS` 뒤)에 `TOOLBOX_CSS` 를 잇는다. 머리 주석 영역 목록에 `toolbox 도구 상자` 를 더한다.
`styles/base.ts`: `/* 팔레트 */` 아래 `.rsf-palette {…}`·`.rsf-palette button[draggable="true"] {…}` 두 줄과 `.rsf-rule-panel > .rsf-palette {…}` 한 줄을 지운다(팔레트 모양은 `toolbox.ts` 가 맡는다).

- [ ] **Step 4: 구현 — FlowCanvas 네 곳**

1. `FlowCanvasProps` 의 `/** [공간] 토글(S1) … */ spaceTool?: boolean;` 바로 위:

```ts
  /**
   * 빈 곳 끌기 도구(4단계 P1) — "hand" 면 끌기 = 화면 이동, "select" 면 끌기 = 영역 선택(이동은 가운데 버튼·스페이스+끌기).
   * 없으면 모드 기본(편집 = select, 보기·디버그 = hand — 3단계 동작 그대로). 휠·Shift 영역 선택·다중 선택 키는 도구와 관계없이 모드를 따른다.
   * [공간] 은 따로 `spaceTool` 이다(빈 곳 누르기를 캡처 단계에서 가로채 영역 선택·화면 이동보다 이긴다).
   */
  dragTool?: "hand" | "select";
```

2. `function Inner` 의 구조 분해 마지막 줄 `spaceTool, onSpaceToolChange, onShiftSpace,` 를 `spaceTool, onSpaceToolChange, onShiftSpace, dragTool,` 로 바꾸고, `const debugging = mode === "debug";` 다음 줄에:

```ts
  /** [손] 도구 — 빈 곳 끌기가 화면 이동이다(4단계 P1). */
  const hand = (dragTool ?? (editable ? "select" : "hand")) === "hand";
```

3. 루트 `<div ref={wrapRef} className="rsf-canvas" …>` 의 `data-space-tool=…` 줄 다음에 `data-drag-tool={hand ? "hand" : "select"}` 를 넣고, `<ReactFlow` 의 주석·두 줄을 바꾼다:

```tsx
        // 빈 곳 끌기는 도구(4단계 P1)를 따른다 — [영역 선택] = 영역 선택(상자에 조금이라도 걸린 노드), 이동은 스페이스+끌기·가운데 버튼,
        // [손] = 화면 이동. 휠·Shift·다중 선택 키는 모드를 따른다(편집 = 두 손가락 스크롤 이동·핀치/Ctrl+휠 확대, 보기·디버그 = 휠 확대).
        selectionOnDrag={!hand}
        selectionMode={SelectionMode.Partial}
        panOnDrag={hand ? true : EDIT_PAN_BUTTONS}
```

(`panOnScroll={editable}`·`selectionKeyCode`·`multiSelectionKeyCode` 는 그대로 둔다. `EDIT_PAN_BUTTONS` 의 주석을 「영역 선택 도구일 때 화면 이동 마우스 단추 — 가운데(1)만」으로 고친다.)

4. `/** 미니맵을 확대·축소 단추 줄(가로) 위에 둔다. */ const MINIMAP_STYLE = …;` 두 줄을 지우고, ReactFlow 자식을 이렇게 바꾼다:

```tsx
        {/* 오른쪽 아래 확대·축소 단추 줄, 오른쪽 위 미니맵(4단계 P1 — 왼쪽 위는 page 가 그리는 도구 상자 자리) */}
        <Controls position="bottom-right" orientation="horizontal" showInteractive={false} />
        {showMiniMap && <MiniMap position="top-right" pannable zoomable />}
```

`FlowCanvasProps.showMiniMap` 주석 「오른쪽 아래 미니맵(D14)」을 「오른쪽 위 미니맵(D14, 4단계 P1)」으로 고친다. 파일 머리 주석 「편집 모드 화면 이동은 Figma 방식이다(S1, Ruling 21)…」 문단 끝에 「4단계 P1: 빈 곳 끌기는 `dragTool`([손]·[영역 선택])을 따르고 없으면 모드 기본이다.」를 한 문장 더한다.

- [ ] **Step 5: 구현 — 툴바·룰 패널·단축키 도움말**

`canvas/FlowToolbar.tsx`: `FlowToolbarProps` 의 `spaceTool?`·`onToggleSpaceTool?` 와 그 주석, 구조 분해의 `spaceTool = false, onToggleSpaceTool`, `data-testid="flow-space-tool"` `Button` 전체, import 의 `IconArrowAutofitWidth` 를 지운다. 머리 주석 `S1: [공간] 토글(…)` 줄을 「S1 의 [공간] 토글은 4단계 P1 에서 도구 상자(`FlowToolbox`)로 옮겼다.」로 바꾼다. `keepFocusOffButtons` 는 그대로 export 한다(도구 상자가 쓴다).

`canvas/RulePanel.tsx`: 머리 주석 첫 줄을 「룰 목록 패널(3단계 계획 A4·P-D10) — 찾기·끌어 넣기. 4단계 Task 7 부터 오른쪽 패널 아래 임시 자리(Task 8 이 섹션으로 바꾼다). 팔레트는 도구 상자(`FlowToolbox`)로 옮겼다.」로 바꾸고, `RulePanelProps` 의 `loading`·`onPick`, import 의 `PaletteItem`·`FlowPalette`, 구조 분해의 `loading, onPick`, `{editing && <FlowPalette onPick={onPick} disabled={loading} />}` 줄을 지운다. 나머지(목록·접기·찾기·끌기·두 번 누르기)는 그대로다.

`canvas/shortcuts.ts`:

```ts
export type GestureId = "boxSelect" | "spaceDrag" | "snapOff" | "pan" | "zoom" | "handDrag";
```

`SHORTCUT_HELP` 에서 세 줄을 바꾸고 한 줄을 더한다(나머지 순서 그대로):

```ts
  { id: "escape", win: "Esc", mac: "Esc", label: "선택 해제·메뉴 닫기(다른 도구를 골랐으면 먼저 기본 도구로 돌아간다)", modes: ["view", "edit", "debug"] },
  // …
  { id: "boxSelect", win: "끌기(빈 곳)", mac: "끌기(빈 곳)", label: "영역 선택(상자에 걸친 노드·메모) — 도구 상자 [영역 선택] 일 때", modes: ["edit"] },
  { id: "spaceDrag", win: "Alt+끌기(빈 곳)", mac: "⌥+끌기(빈 곳)", label: "공간 넓히기·줄이기(도구 상자 [공간] 과 같다)", modes: ["edit"] },
  { id: "handDrag", win: "끌기(빈 곳, [손])", mac: "끌기(빈 곳, [손])", label: "화면 이동 — 도구 상자 [손] 일 때(보기·디버그 기본)", modes: ["view", "edit", "debug"] },
```

(`handDrag` 는 `spaceDrag` 바로 뒤에 둔다. `space-canvas.test.ts` 「도움말(편집 모드)에…」 사례의 네 문구 `Alt+끌기`·`공간 넓히기`·`스페이스+끌기`·`영역 선택` 은 그대로 들어 있다.)

- [ ] **Step 6: 구현 — page.tsx**

1. import: `import { FlowToolbox, defaultTool, type CanvasTool } from "./canvas/FlowToolbox";` 를 `FlowToolbar` import 아래에 더한다.
2. `/** [공간] 토글(S1) …*/ const [spaceTool, setSpaceTool] = useState(false); const spaceOn = editing && spaceTool;` 를 바꾼다:

```ts
  /**
   * 캔버스 도구(4단계 P1) — [손]·[영역 선택]·[공간]. 저장하지 않는다. 모드를 바꾸거나 다른 세트를 열면 그 모드의 기본 도구(`defaultTool`)로 돌아가고,
   * [공간] 은 한 번 쓰면(캔버스가 `onSpaceToolChange(false)` 로 알린다) 영역 선택으로 돌아간다. [공간] 은 편집 모드에서만 뜻이 있다.
   */
  const [tool, setTool] = useState<CanvasTool>(() => defaultTool(mode));
  const spaceOn = editing && tool === "space";
  const modeRef = useRef(mode);
  modeRef.current = mode;
```

3. 세트가 바뀔 때의 `useEffect(…, [setId])` 안 `setSpaceTool(false);` 를 `setTool(defaultTool(modeRef.current));` 로 바꾸고, 그 아래 `// 편집 모드를 떠나면 [공간] 토글을 끈다…` 주석과 `useEffect(() => { if (!editing) setSpaceTool(false); }, [editing]);` 를 지운다.
4. 모드 바뀜 `useEffect(…, [mode])` 의 `setMenu(null);` 앞에 `setTool(defaultTool(mode)); // 도구는 모드마다 기본으로(4단계 P1)` 를 넣는다.
5. `onToggleSpaceTool` 과 그 위 주석 블록(「[공간] 토글 — 켜고 끌 때 모두…」)을 바꾼다:

```ts
  /**
   * 도구 고르기(4단계 P1) — [공간] 을 다시 누르면 영역 선택으로 돌아간다. 고른 뒤 초점을 캔버스로 옮긴다
   * (단추에 초점이 남으면 Esc 가 캔버스 디스패처에 닿지 않고 스페이스+끌기의 스페이스가 단추를 다시 누른다 — S1 리뷰 Important 2).
   */
  const onTool = useCallback(
    (t: CanvasTool) => {
      setTool((cur) => (t === "space" && cur === "space" ? "select" : t));
      focusCanvas();
    },
    [focusCanvas],
  );
  /** 캔버스가 공간 넓히기를 한 번 끝내면 false 로 부른다 — 영역 선택으로 돌아간다. */
  const onSpaceToolChange = useCallback((on: boolean) => {
    if (!on) setTool("select");
  }, []);
```

6. `onEscape` 의 [공간] 분기를 바꾼다:

```ts
    // 기본 도구가 아니면(편집 [손]·[공간], 보기·디버그 [영역 선택]) 기본 도구로만 돌린다(선택은 그대로 — 메뉴 규칙과 같다). 메뉴가 열려 있으면 메뉴가 먼저다.
    const home = defaultTool(mode);
    if (!menuWasOpen && tool !== home) {
      setTool(home);
      return;
    }
```

7. `<FlowToolbar …>` 에서 `spaceTool={spaceOn}`·`onToggleSpaceTool={onToggleSpaceTool}` 두 줄을 지운다.
8. 본문 틀을 바꾼다 — 왼쪽 칸은 디버그 모드에서만 두고, 도구 상자는 캔버스 감싸개 안, 룰 목록은 오른쪽 패널 아래(임시):

```tsx
              <ContentBody key="main" resizable storageKey={`${STORAGE_KEY}.main`} flex="1 1 0" minSize={200}>
                {debugging && (
                  <ContentPanel key="left" width={280} minSize={200}>
                    <DebugInputs sim={sim} tests={tests} setId={setId} canEditCases={canEdit} canRun={canRun} onError={state.reportError} />
                  </ContentPanel>
                )}
                <ContentPanel key="canvas" flex="1 1 0" minSize={320}>
```

캔버스 `ContentPanel` 안은 `<FlowCanvas …>` 의 기존 prop 줄을 모두 그대로 두고 세 가지만 바꾼다 — `spaceTool={spaceOn}` 앞에 `dragTool={tool === "hand" ? "hand" : "select"}` 한 줄을 더하고, `onSpaceToolChange={setSpaceTool}` 를 `onSpaceToolChange={onSpaceToolChange}` 로 바꾸고, `<FlowCanvas … />` 와 `<ContextMenu … />` 사이에 도구 상자를 넣는다:

```tsx
                      <FlowToolbox mode={mode} tool={tool} onTool={onTool} onPick={editActions.pickPalette} disabled={state.loading} />
```

오른쪽 패널의 보기·편집 분기(`<> {selectedExists && selectedId ? <PropertyPanel …/> : <SetPanel …/>} </>`) 안, 닫는 `</>` 바로 앞에 붙인다:

```tsx
                        {/* 룰 목록 — 임시 자리(4단계 Task 7). Task 8 이 오른쪽 섹션 패널의 「룰 목록」/「룰 지정」 섹션으로 바꾼다. */}
                        <RulePanel
                          mode={mode}
                          selectedEdgeId={selectedEdgeId}
                          onRules={onRules}
                          onInsertRule={onInsertRule}
                          onError={state.reportError}
                        />
```

그리고 왼쪽 `ContentPanel` 안에 있던 `<RulePanel … onPick={editActions.pickPalette} …/>` 는 지운다(위에서 옮겼다).
9. 머리 주석 11·17~18행을 고친다: 「- 왼쪽: 디버그 모드만 입력 패널(`DebugInputs`). 보기·편집 모드는 왼쪽 칸이 없고 캔버스 안 왼쪽 위에 도구 상자(`FlowToolbox`)가 뜬다(4단계 P1)」, 「디버그 모드 밖에서는 왼쪽 칸을 그리지 않는다 — 너비는 shared 가 key(`left`)로 기억하므로 디버그로 돌아오면 사용자가 끈 너비 그대로다」.

`styles/drag.ts` 끝(룰 목록 절)에 한 줄 더한다(임시 자리 구분선 — 전체 폭 얇은 선이라 한 변 색 바가 아니다):

```css
.rsf-props > .rsf-rule-panel { border-top: 1px solid var(--color-border-light); }
```

- [ ] **Step 7: 통과 확인**
  - `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS(새 `toolbox.test.ts` 12건 포함, `flow-drag.test.ts` 룰 목록 사례·`space-canvas.test.ts`·`seams.test.ts`·`flow-canvas.test.ts` FlowPalette 사례 PASS).
  - `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0.
  - 스킬 audit 두 개(바꾼 파일만): `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 파일들>` · `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일들>` → 0건.
  - `grep -rn "onToggleSpaceTool\|setSpaceTool\|MINIMAP_STYLE" src/frontend/m-mdm/pages/dme/ruleSetEdit` → 0건.

- [ ] **Step 8: 기능설계서·e2e**
  - 기능설계서 §2: 그림 [보기]·[편집] 에서 「왼쪽: 룰 목록」 칸을 지우고 캔버스 칸 설명을 「왼쪽 위 떠 있는 도구 상자([손]·[영역 선택], 편집이면 [공간]·구분선·요소 다섯), 오른쪽 위 미니맵, 오른쪽 아래 확대 막대」로 바꾼다. 「세 패널(왼쪽 280·오른쪽 360 기본)은 모드와 무관하게 늘 두고…」 문장을 「오른쪽 패널(360)은 늘 두고, 왼쪽 패널(280)은 디버그 모드에서만 둔다(너비는 key 로 기억한다)」로 고친다. A-TOOL 행에서 `[공간](flow-space-tool…)` 을 지운다. A-LEFT 행을 「디버그 모드만 = 입력 패널(`dbg-inputs`). 보기·편집 모드는 왼쪽 칸이 없다(4단계 P1)」로 바꾸고, 룰 목록 설명은 A-PROPS 행 끝에 「보기·편집 모드는 속성·세트 패널 아래 룰 목록(`flow-rule-panel` — 4단계 Task 8 이 섹션으로 바꾼다)」으로 옮긴다. 새 행 `A-TOOLBOX | 도구 상자(flow-toolbox) | 캔버스 안 왼쪽 위(12px) 세로 막대. 도구 [손](flow-tool-hand)·[영역 선택](flow-tool-select)·[공간](flow-space-tool, 편집만) — 한 번에 하나, aria-pressed. 구분선 아래 요소(flow-palette — flow-add-*, 편집만). 아이콘만, 이름은 오른쪽 툴팁·aria-label. 기본 도구 = 편집 [영역 선택]·보기·디버그 [손], Esc·모드 바꾸기·다른 세트 열기로 기본 도구로 돌아간다. 저장하지 않는다` 를 A-CANVAS 앞에 넣는다. A-CANVAS 행의 「오른쪽 아래에 확대 막대(…)와 미니맵」을 「오른쪽 아래 확대 막대(…), 오른쪽 위 미니맵」으로 고친다.
  - §5.1: B-009 의 영역을 `A-TOOLBOX(요소)` 로, B-028 의 영역을 `A-TOOLBOX` 로 바꾸고 B-028 설명 첫머리에 「도구 상자의 도구 하나(4단계 P1 — 툴바에서 옮김). 다시 누르면 [영역 선택] 으로 돌아간다」를 더한다. 새 행(번호는 병합 때 표의 다음 번호) `[손](flow-tool-hand)·[영역 선택](flow-tool-select) | A-TOOLBOX | (없음) | 빈 곳 끌기를 화면 이동/영역 선택으로 바꾼다. 휠·Shift+끌기 영역 선택·다중 선택 키는 모드를 따른다. 누르면 초점을 캔버스로 옮긴다` 를 더한다.
  - `src/frontend/e2e/mdm-user/dme.user.ts`: 버튼 전수 확인(`assertAllButtonsPressed` 는 보이는 활성 단추를 누적으로 본다 — `support.ts`)에 새 단추 `flow-tool-hand`·`flow-tool-select` 가 잡힌다. 디버그 모드 확인(`ruleSetEdit(디버그 모드)`) 전, `flow-help` 를 두 번 누르는 줄 바로 뒤에 두 단추를 누르고 **그 자리 모드의 기본 도구로 끝나게** 한다(그 자리가 편집 모드면 `flow-tool-hand` → `flow-tool-select`, 보기 모드면 `flow-tool-select` → `flow-tool-hand`). 편집 모드 확인이 있으면 `flow-space-tool` 도 두 번(켜기·끄기) 누른다. `mdm-ruleSetEdit.spec.ts` 는 바뀌는 선택자가 없다(`enterEditMode` 의 `flow-palette` 는 도구 상자 안에 그대로 보인다).
  - 목록 확인(실행 금지 — Local-Rules §4): `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` 와 `pnpm --dir src/frontend exec playwright test -c playwright.mdm-user.config.ts --list` 가 오류 없이 테스트 이름을 낸다.

- [ ] **Step 9: 커밋** — 위 Files 의 경로만 `/usr/bin/git add <paths>` 한 뒤 `/usr/bin/git commit -m "..." -- <paths>`. 메시지는 Global Constraints 형식(요약 + 빈 줄 + 트레일러 두 줄), 요약 `feat(m-mdm): 룰 세트 편집 떠 있는 도구 상자·도구 모드·미니맵 오른쪽 위`.

---

### Task 8: 오른쪽 머리글·접는 섹션 패널·룰 목록 섹션 (P1 오른쪽)

**모델:** opus — 속성·세트 패널을 섹션으로 다시 짜고, 「룰 목록」/「룰 지정」 전환·선택 흐름·초점 입구를 Task 9 와 맞물리게 정해야 한다.

**Files:**
- Create: `panels/PanelHeader.tsx`(`PanelKind`·`PANEL_KIND`·`panelTargetOf`·`PanelHeader`), `panels/Section.tsx`(`Section`·`useSectionMemory`·`SectionMemory`), `panels/SidePanel.tsx`(머리글 + 속성/세트 섹션 + 룰 목록 섹션, `ASSIGNABLE_KINDS`·`ruleListMode`), `state/useRuleSearch.ts`(찾기 상태를 page 로 올림)
- Modify: `canvas/RulePanel.tsx`(전체 — 섹션 본문으로. 파일은 지우지 않는다), `panels/PropertyPanel.tsx`(`Title`·`rsf-panel-sub` 소제목 → `Section`, `sections` prop), `panels/SetPanel.tsx`(같은 방식), `page.tsx`(오른쪽 칸, `openRuleAssign`·`assignSignal`, 룰 목록 두 번 누르기·[지정]), `state/useEditActions.ts`(`insertAt` 이 새 노드 ID 를 돌려주고 고를 대상을 고름, `insertListRule`, `openRuleAssign` dep·action), `canvas/context-menu.ts`(`CanvasActions.replaceRule` → `openRuleAssign`), `canvas/menus/edit-menu.ts`(`rule-replace` 가 섹션을 연다), `styles/props.ts`(머리글·섹션), `styles/drag.ts`(룰 줄 [지정] 칸, 임시 자리 줄·`.rsf-rule-list-head` 삭제)
- Test: `tests/side-panel.test.ts`(새), `tests/flow-drag.test.ts`(「룰 목록 패널(Task 7)」 describe 의 사례 3·4b), `tests/flow-menu.test.ts`(사례 7), `tests/context-menu.test.ts`(목 객체 키)
- Docs: 기능설계서 §2 A-PROPS 행(머리글·섹션·룰 목록), §4 D-006, §5.1 B-021·GB-007, §5.5 룰 노드 줄, 새 행(섹션 머리·[지정])
- e2e: `src/frontend/e2e/mdm-user/dme.user.ts`(`flow-rule-panel-toggle` → `flow-section-rules-head`, 섹션 머리 단추 전수 확인)

**Interfaces:**
- Consumes: Task 7 의 중간 상태(오른쪽 패널 아래 `RulePanel`), 3단계 `searchRules`(`api.ts`), `insertRule`·`replaceRule`(`flow-edit.ts`), `editActions.applyReplace`(`state/useEditActions.ts`), `SetIoTables`·`GuideCard`. 머리글 아이콘은 Task 7 `canvas/FlowPalette.tsx` 의 `PALETTE_ITEMS` 와 같은 tabler 아이콘을 `PanelHeader.tsx` 가 직접 import 한다(종류 표가 팔레트 항목보다 넓어 배열을 나눠 쓰지 않는다).
- Produces (Task 9 가 그대로 쓴다):
  - **룰 지정 섹션 입구**: page 안 `const openRuleAssign: (nodeId: string) => void` — `select(nodeId)` 하고 `assignSignal`(page 상태 `number`)을 1 올린다. `SidePanel` 은 `assignSignal` 이 바뀐 렌더에서 룰 목록 모드가 `"assign"` 이면 그 종류의 `rules` 섹션을 펴고(`sections.open(kind, "rules")`) 그 뒤 커밋에서 찾기 칸(`flow-rule-panel-search`)에 초점을 둔다. 우클릭 메뉴 항목에서 부를 때: `ContextMenu` 는 닫힐 때(패시브 effect 정리) 초점이 메뉴 안·body 일 때만 열기 전 자리(캔버스)로 돌린다(`canvas/ContextMenu.tsx` 의 첫 항목 초점 effect). 항목 누르기의 `run()`·`onClose()` 는 한 커밋으로 묶이고, React 는 한 커밋의 패시브 정리(메뉴의 초점 되돌리기)를 모두 돌린 뒤 새 effect(SidePanel 의 초점)를 돌리므로 찾기 칸이 이긴다. `ContextMenu` 는 고치지 않는다. page 는 `useEditActions({ …, openRuleAssign })` 로 넘기고, `EditActionsDeps.openRuleAssign(nodeId: string): void` 가 된다. `CanvasActions.openRuleAssign(nodeId: string): void`(옛 `replaceRule`).
  - **룰 지정 대상 종류**: `panels/SidePanel.tsx` 의 `export const ASSIGNABLE_KINDS: ReadonlySet<string> = new Set(["RULE"])` — Task 9 가 `"TASK"` 를 더한다(문자열 집합이라 Task 1 병합 전에도 tsc 가 통과한다).
  - **지정 콜백**: `SidePanelProps.onAssignRule(nodeId: string, io: RuleIo): void` — 이 태스크에서 page 는 `editActions.applyReplace(nodeId, io)`(RULE 룰 바꾸기)로 잇는다. Task 9 가 page 의 이 한 줄을 `editActions.assignRule(nodeId, io)`(TASK→RULE·RULE 바꾸기)로 바꾼다.
  - `useEditActions` 의 `insertAt(preferred, add, op, pick: "node" | "out" = "node"): string | null` — 새 노드 ID(실패면 null)를 돌려주고, `pick` 이 `"out"` 이면 새 노드 대신 새 노드에서 나가는 선을 고른다. `EditActions.insertListRule(edgeId: string | null, io: RuleIo): void`.
  - `useRuleSearch(onRules, onError): RuleSearch` — `{ keyword; setKeyword(v); rows: RuleIo[] | null; find(): Promise<void> }`.
  - `RulePanel` props: `{ mode: RuleListMode; search: RuleSearch; inputRef?; onInsert(io); onAssign(io) }`, `export type RuleListMode = "view" | "insert" | "assign"`.
  - `SectionMemory`: `isOpen(kind, id)`·`toggle(kind, id)`·`open(kind, id)` — 기본 펼침, 화면 메모리만.
  - `PanelKind = "SET" | "EDGE" | "START" | "END" | "RULE" | "TASK" | "IF" | "PARALLEL" | "MERGE" | "NOTE" | "GROUP"`, `panelTargetOf(flow, rules, selectedId, selectedEdgeId, setName): { kind; id: string | null; name }`.
  - testid: `flow-side`(`data-kind`), `flow-panel-header`, `flow-panel-kind`, `flow-panel-name`, `flow-section-{id}`(`data-open`), `flow-section-{id}-head`(`aria-expanded`), `flow-rule-assign-{ruleId}`. 룰 목록 섹션 ID 는 늘 `rules`(제목만 「룰 목록」/「룰 지정」). 속성 패널의 기존 testid(`flow-prop-*`)·세트 패널 testid(`flow-prop-set`·`set-name`·`set-desc`·`set-io-*`·`set-guide-*`)·룰 목록 testid(`flow-rule-panel`·`-search`·`-find`·`flow-rule-rows`·`flow-rule-row-{id}`)는 그대로다. `flow-rule-panel-toggle` 은 없어진다(섹션 머리 `flow-section-rules-head`).
- **SEAM 보존:** Task 1 이 먼저 병합됐으면 `PropertyPanel.tsx` 의 `KIND_TEXT` 등에 `// SEAM(T9)` 줄이 있다. 이 태스크는 그 줄과 표식을 지우지 않고 그대로 옮긴다(Task 9 의 `grep -rn "SEAM(T9)"` 0건 관문이 뜻을 가지려면). 이 태스크의 코드에는 `"TASK"` 와 흐름 노드 종류를 직접 견주는 식(`n.kind === "TASK"`)을 쓰지 않는다 — Task 1 병합 전이면 tsc 가 「겹치지 않는 비교」로 거부한다. `PanelKind` 의 `"TASK"` 는 자기 유니온이라 괜찮다.

섹션 표(스펙 §1.3 「지금 속성·세트 패널의 소제목 단위를 그대로 옮긴다」 — 섹션 ID·제목·내용):

| 종류 | 머리글 이름 | 섹션(위에서부터) |
|---|---|---|
| SET(고른 것 없음) | 세트명 | `set-basic` 「기본 정보」(세트명·설명·안내 문구), `set-io` 「세트 입출력」(`SetIoTables`), `set-guide` 「구성 지침」(`GuideCard`), `rules` 「룰 목록」 |
| EDGE(선) | 라벨, 없으면 `출발 → 도착` | `rules` 「룰 목록」(두 번 누르기 = 이 선에 끼우기) |
| RULE | 룰명(없는 룰이면 `(없는 룰)`) | 편집 모드: `rules` 「룰 지정」 맨 위. 이어서 `rule-basic` 「룰 정보」(룰 ID·종류·정책·확정 버전·검사 문구·[룰 편집 열기]·[지우기]), `rule-inputs` 「입력 변수 N개」, `rule-results` 「결과 변수 N개」. 보기 모드는 `rules` 「룰 목록」 이 맨 아래 |
| IF·PARALLEL | 분기 이름, 없으면 노드 ID | `split-basic` 「분기」(분기 이름·설명·검사 문구·[지우기]), `split-branches` 「갈래 N개」(갈래 상자·[갈래 더하기]), `rules` 「룰 목록」 |
| START·END·MERGE | 노드 ID | `node-basic` 「설명」, `rules` 「룰 목록」 |
| NOTE | 글 첫 줄, 비면 메모 ID | `note-basic` 「메모」(글·붙은 노드·[지우기]), `rules` 「룰 목록」 |
| GROUP | 제목 | `group-basic` 「그룹」(제목·[지우기]), `group-members` 「구성 노드 N개」(목록·안내·[선택 노드 더하기]), `rules` 「룰 목록」 |

- [ ] **Step 1: 실패하는 테스트** — `tests/side-panel.test.ts` 를 새로 쓴다.

```ts
/** @vitest-environment happy-dom */

// 4단계 Task 8(P1) — 오른쪽 머리글(종류 아이콘·종류 이름·이름), 접는 섹션(여러 개 펼침·종류별 기억), 「룰 목록」/「룰 지정」 섹션.
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

import { addGroup, addNote, insertSplit, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string, extra: Partial<RuleIo> = {}): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [], ...extra,
});
/** start → r1 → r2 → if1{e4 갈래 1 / e5 그 외} → m1 → end, 메모 n1, 그룹 g1(r1). 선 e1 start→r1, e2 r1→r2, e3 r2→if1, e6 m1→end. */
function richFlow(): EditFlow {
  let f = toEditFlow(null, ["SP_A", "SP_B"]);
  f = must(insertSplit(f, "e3", "IF"));
  f = addNote(f, { x: 600, y: 40 }, null).flow;
  return must(addGroup(f, ["r1"], "묶음"));
}
function viewOf(setId: string, flow: EditFlow | null = richFlow()): RuleSetView {
  return {
    set: { setId, setName: "섹션 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["SP_A", "SP_B"], flow, branched: true },
    rules: [io("SP_A"), io("SP_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const header = () => [byTestId("flow-panel-kind").textContent, byTestId("flow-panel-name").textContent];
/** 오른쪽 패널의 섹션 ID(위에서부터). */
const sectionIds = () =>
  Array.from(byTestId("flow-side").querySelectorAll('[data-testid^="flow-section-"]:not([data-testid$="-head"])')).map((e) =>
    e.getAttribute("data-testid")!.slice("flow-section-".length),
  );
const isOpen = (id: string) => byTestId(`flow-section-${id}`).getAttribute("data-open") === "true";
async function clickEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function clickPane() {
  await act(async () => {
    byTestId("flow-canvas").querySelector(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function findRules(text: string) {
  await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), text);
  await click("flow-rule-panel-find");
  await settle(20);
}
async function dbl(id: string) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
}

describe("오른쪽 머리글·섹션(4단계 Task 8)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    srv.replies["search:RULE"] = ok({ rules: [io("SP_NEW"), io("SP_DRAFT", { releasedVer: null })] });
  });
  afterEach(() => uninstallServer());

  it("머리글 — 고른 것마다 종류 아이콘·종류 이름·이름", async () => {
    await openSet("SP_1", viewOf("SP_1"));
    expect(header()).toEqual(["룰 세트", "섹션 세트"]);
    expect(byTestId("flow-panel-header").getAttribute("data-kind")).toBe("SET");
    expect(byTestId("flow-panel-header").querySelector("svg")).not.toBeNull();
    await click("flow-node-r1");
    expect(header()).toEqual(["룰", "SP_A 이름"]);
    await click("flow-node-if1");
    expect(header()).toEqual(["IF 분기", "조건"]);
    await click("flow-node-m1");
    expect(header()).toEqual(["합류", "m1"]);
    await clickEdge("e2");
    expect(header()).toEqual(["연결선", "r1 → r2"]);
    await click("flow-note-n1");
    expect(header()).toEqual(["메모", "n1"]);
    await clickPane();
    expect(header()).toEqual(["룰 세트", "섹션 세트"]);
  });

  it("섹션 — 기본은 모두 펼침, 여러 개를 함께 펼치고, 접은 상태는 종류별로 기억한다(다른 종류는 그대로)", async () => {
    await openSet("SP_2", viewOf("SP_2"));
    expect(sectionIds()).toEqual(["set-basic", "set-io", "set-guide", "rules"]);
    expect(["set-basic", "set-io", "set-guide", "rules"].every(isOpen)).toBe(true);
    await click("flow-node-r1");
    expect(sectionIds()).toEqual(["rule-basic", "rule-inputs", "rule-results", "rules"]); // 보기 모드 — 룰 목록은 맨 아래
    await click("flow-section-rule-inputs-head");
    expect(isOpen("rule-inputs")).toBe(false);
    expect(byTestId("flow-section-rule-inputs-head").getAttribute("aria-expanded")).toBe("false");
    expect(isOpen("rule-basic")).toBe(true);
    await click("flow-node-if1");
    expect(sectionIds()).toEqual(["split-basic", "split-branches", "rules"]);
    expect(isOpen("split-basic") && isOpen("split-branches")).toBe(true);
    await click("flow-node-r2"); // 같은 종류(RULE)는 접은 상태가 남는다
    expect(isOpen("rule-inputs")).toBe(false);
    await click("flow-section-rule-inputs-head");
    expect(isOpen("rule-inputs")).toBe(true);
  });

  it("속성 섹션 안 기존 testid 가 그대로다(편집 입력·지우기·갈래)", async () => {
    await openSet("SP_3", viewOf("SP_3"));
    await click("flow-mode-edit");
    await click("flow-node-if1");
    expect(q("flow-prop-if")).not.toBeNull();
    expect(q("flow-prop-label")).not.toBeNull();
    expect(q("flow-prop-add-branch")).not.toBeNull();
    expect(q("flow-prop-delete")).not.toBeNull();
    await click("flow-node-r1");
    expect(visibleText(byTestId("flow-prop-rule"))).toContain("SP_A");
    expect(q("flow-prop-rule-open")).not.toBeNull();
  });

  it("「룰 목록」 — 고른 것 없음·선: 맨 아래, 두 번 누르면 고른 선(없으면 END 앞 선)에 끼우고 새 룰에서 나가는 선을 고른다", async () => {
    await openSet("SP_4", viewOf("SP_4", null)); // start → r1 → r2 → end (e1 e2 e3)
    await click("flow-mode-edit");
    await findRules("SP_");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    expect(q("flow-rule-row-SP_DRAFT")).toBeNull();
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(q("flow-rule-assign-SP_NEW")).toBeNull();
    await dbl("flow-rule-row-SP_NEW"); // 고른 선 없음 → END 앞 선(e3)
    expect(canvasNodeIds()).toContain("r3");
    expect(header()[0]).toBe("연결선"); // 새 룰에서 나가는 선을 골랐다 — 「룰 목록」 이 그대로라 다음 두 번 누르기가 그 뒤에 잇는다
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    await dbl("flow-rule-row-SP_NEW");
    expect(canvasNodeIds()).toContain("r4");
    await clickEdge("e1"); // 고른 선 e1(start→r1) 에 끼운다
    await dbl("flow-rule-row-SP_NEW");
    expect(canvasNodeIds()).toContain("r5");
    expect(q("rf__edge-e1")).not.toBeNull();
  });

  it("「룰 지정」 — 편집 모드에서 룰 노드를 고르면 맨 위·펼침·줄마다 [지정]. [지정]·두 번 누르기는 그 노드의 룰만 바꾸고 되돌리기 한 번에 돌아간다", async () => {
    await openSet("SP_5", viewOf("SP_5", null));
    await click("flow-mode-edit");
    await findRules("SP_");
    await click("flow-node-r1");
    expect(sectionIds()[0]).toBe("rules");
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 지정");
    expect(isOpen("rules")).toBe(true);
    await click("flow-rule-assign-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_NEW");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "start"]);
    expect(header()).toEqual(["룰", "SP_NEW 이름"]);
    await click("flow-undo");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_A");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    await dbl("flow-rule-row-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_NEW");
  });

  it("보기 모드 — 룰 노드를 골라도 「룰 목록」(맨 아래), 줄은 끌 수 없고 [지정]·두 번 누르기가 없다", async () => {
    await openSet("SP_6", viewOf("SP_6", null));
    await findRules("SP_");
    await click("flow-node-r1");
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(sectionIds().at(-1)).toBe("rules");
    expect(byTestId("flow-rule-row-SP_NEW").getAttribute("draggable")).toBe("false");
    expect(q("flow-rule-assign-SP_NEW")).toBeNull();
    await dbl("flow-rule-row-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_A");
    expect(calls("save")).toHaveLength(0);
  });

  it("찾은 줄은 섹션을 접었다 펴도, 「룰 목록」↔「룰 지정」 으로 자리가 바뀌어도 남는다", async () => {
    await openSet("SP_7", viewOf("SP_7", null));
    await click("flow-mode-edit");
    await findRules("SP_");
    await click("flow-section-rules-head");
    expect(q("flow-rule-row-SP_NEW")).toBeNull();
    await click("flow-section-rules-head");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    await click("flow-node-r1");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    expect(byTestId<HTMLInputElement>("flow-rule-panel-search").value).toBe("SP_");
  });

  it("우클릭 [룰 바꾸기…] — 그 노드를 고르고 「룰 지정」 섹션을 펴고 찾기 칸에 초점을 둔다(접어 두었어도)", async () => {
    await openSet("SP_8", viewOf("SP_8", null));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await click("flow-section-rules-head"); // 접어 둔다
    expect(isOpen("rules")).toBe(false);
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-node-r1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    expect(visibleText(byTestId("flow-menu-item-rule-replace"))).toBe("룰 바꾸기…");
    await click("flow-menu-item-rule-replace");
    await settle(10);
    expect(header()).toEqual(["룰", "SP_A 이름"]);
    expect(isOpen("rules")).toBe(true);
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });
});
```

기존 사례 고치기:
- `tests/flow-drag.test.ts` 「룰 목록 패널(Task 7)」 사례 3: `await click("flow-rule-panel-toggle")` 두 번을 `await click("flow-section-rules-head")` 로 바꾼다.
- 같은 파일 사례 4b: 제목을 「4b. 줄을 두 번 누르면 고른 선에, 고른 선이 없으면 END 앞 선에 끼운다」로 바꾸고 본문을 이렇게 바꾼다 — 고른 선 없이 두 번 누르기 → `pageQ("flow-node-r3")` 있음(END 앞 선 e3), 메시지 「넣을 선을 먼저 고른다」 는 없음. 이어서 `rf__edge-e1` 을 누르고 두 번 누르기 → `flow-node-r4` 있음. 끝의 `await click("flow-mode-view");` 는 지운다.
- `tests/flow-menu.test.ts` 사례 7: 제목을 「7. 룰 바꾸기 — 「룰 지정」 섹션에서 고르면 노드 자리·선은 그대로 ruleId 만 바뀌고 IO 가 들어온다」로 바꾸고, 팝업 세 동작(`flow-rule-search-keyword`·`-find`·`flow-rule-cand-E2S_NEW`)을 `await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), "E2S_"); await click("flow-rule-panel-find"); await settle(20); await click("flow-rule-assign-E2S_NEW");` 로 바꾼다(`settle` 을 import 에 더한다). 뒤 기대는 그대로다.
- `tests/context-menu.test.ts` 목 객체의 `replaceRule: vi.fn()` 을 `openRuleAssign: vi.fn()` 으로 바꾼다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/side-panel.test.ts tests/dme/ruleSetEdit/flow-drag.test.ts tests/dme/ruleSetEdit/flow-menu.test.ts tests/dme/ruleSetEdit/context-menu.test.ts` → `side-panel.test.ts` 전부 FAIL(`flow-panel-kind` 없음), 바꾼 사례 FAIL, `context-menu.test.ts` 는 tsc 가 아니라 vitest 라 통과할 수 있다(타입은 Step 4 의 lint 가 본다).

- [ ] **Step 3: 구현 — 섹션·머리글·찾기 상태**

`panels/Section.tsx`(새):

```tsx
"use client";

/**
 * 오른쪽 패널의 접는 섹션(4단계 계획 Task 8, 스펙 §1.3) — 한 줄 머리(제목 + 오른쪽 `>`)를 누르면 펴고 접는다. 여러 개를 함께 펼 수 있다.
 * 펼침 상태는 종류(`PanelKind`)·섹션 ID 별로 page 의 화면 메모리(`useSectionMemory`)에만 둔다(저장하지 않는다). 기본은 펼침.
 * shared 에 접는 목록 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않으므로(mantine-aggrid-ui 스킬 §3) `button aria-expanded` 로 그린다.
 */
import { useId, useMemo, useState, type ReactNode } from "react";

import { IconChevronRight } from "@tabler/icons-react";

import type { PanelKind } from "./PanelHeader";

export interface SectionMemory {
  isOpen(kind: PanelKind, id: string): boolean;
  toggle(kind: PanelKind, id: string): void;
  /** 접혀 있으면 편다(룰 지정 섹션 열기). 이미 펴져 있으면 상태를 바꾸지 않는다. */
  open(kind: PanelKind, id: string): void;
}

/** 접은 섹션(`종류:ID`)만 기억한다 — 모드를 바꿔도(page 에 있어) 남고, 화면을 닫으면 사라진다. */
export function useSectionMemory(): SectionMemory {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  return useMemo(() => {
    const key = (k: PanelKind, id: string) => `${k}:${id}`;
    return {
      isOpen: (k, id) => !closed.has(key(k, id)),
      toggle: (k, id) =>
        setClosed((s) => {
          const x = key(k, id);
          const n = new Set(s);
          if (n.has(x)) n.delete(x);
          else n.add(x);
          return n;
        }),
      open: (k, id) =>
        setClosed((s) => {
          const x = key(k, id);
          if (!s.has(x)) return s;
          const n = new Set(s);
          n.delete(x);
          return n;
        }),
    };
  }, [closed]);
}

export interface SectionProps {
  kind: PanelKind;
  /** testid `flow-section-{id}`·`flow-section-{id}-head`. 한 패널 안에서 겹치지 않는다. */
  id: string;
  title: string;
  memory: SectionMemory;
  children: ReactNode;
}

export function Section({ kind, id, title, memory, children }: SectionProps) {
  const open = memory.isOpen(kind, id);
  const bodyId = useId();
  return (
    <section className="rsf-section" data-testid={`flow-section-${id}`} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="rsf-section-head"
        data-testid={`flow-section-${id}-head`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => memory.toggle(kind, id)}
      >
        <span className="rsf-section-title">{title}</span>
        <IconChevronRight size={14} aria-hidden="true" className="rsf-section-chevron" />
      </button>
      {open && (
        <div id={bodyId} className="rsf-section-body">
          {children}
        </div>
      )}
    </section>
  );
}
```

`panels/PanelHeader.tsx`(새):

```tsx
"use client";

/**
 * 오른쪽 패널 머리글(4단계 계획 Task 8, 스펙 §1.3) — 종류 아이콘(도구 상자와 같은 아이콘)·종류 이름(작은 굵은 글씨)·그 아래 이름(제목·룰명·세트명).
 * 보기·편집 모드에서 늘 맨 위다. 디버그 모드 오른쪽은 변수 패널이라 없다.
 */
import {
  IconArrowRight, IconArrowsSplit, IconBoxMultiple, IconGitBranch, IconGitMerge, IconListDetails, IconNote, IconPlayerPlay, IconPlayerStop, IconSitemap,
} from "@tabler/icons-react";

import type { EditFlow } from "../flow-edit";
import type { RuleIoMap } from "../types";

/** 머리글·섹션 기억의 종류. 흐름 노드 종류는 이름 그대로다(TASK 는 Task 9 가 흐름에 더한다 — 여기서는 자기 유니온의 문자열일 뿐이다). */
export type PanelKind = "SET" | "EDGE" | "START" | "END" | "RULE" | "TASK" | "IF" | "PARALLEL" | "MERGE" | "NOTE" | "GROUP";

/** 종류 이름·아이콘 — 룰·빈 단계·IF·병렬·메모·그룹은 도구 상자(`PALETTE_ITEMS`)와 같은 아이콘이다(빈 단계는 [룰] 단추가 놓는다). */
export const PANEL_KIND: Readonly<Record<PanelKind, { label: string; icon: typeof IconNote }>> = {
  SET: { label: "룰 세트", icon: IconSitemap },
  EDGE: { label: "연결선", icon: IconArrowRight },
  START: { label: "시작", icon: IconPlayerPlay },
  END: { label: "끝", icon: IconPlayerStop },
  RULE: { label: "룰", icon: IconListDetails },
  TASK: { label: "빈 단계", icon: IconListDetails },
  IF: { label: "IF 분기", icon: IconGitBranch },
  PARALLEL: { label: "병렬 분기", icon: IconArrowsSplit },
  MERGE: { label: "합류", icon: IconGitMerge },
  NOTE: { label: "메모", icon: IconNote },
  GROUP: { label: "그룹", icon: IconBoxMultiple },
};

export interface PanelTarget {
  kind: PanelKind;
  /** 노드·메모·그룹·선 ID, 세트면 null. */
  id: string | null;
  name: string;
}

/** 고른 것(노드·메모·그룹, 없으면 선, 없으면 세트)의 머리글 대상. 흐름에 없는 ID 는 고르지 않은 것으로 본다. */
export function panelTargetOf(flow: EditFlow, rules: RuleIoMap, selectedId: string | null, selectedEdgeId: string | null, setName: string): PanelTarget {
  if (selectedId) {
    const n = flow.nodes.find((x) => x.id === selectedId);
    if (n) {
      if (n.kind === "RULE") {
        const io = n.ruleId ? rules[n.ruleId] : undefined;
        return { kind: "RULE", id: n.id, name: io && io.exists ? (io.ruleName ?? n.ruleId ?? n.id) : "(없는 룰)" };
      }
      return { kind: n.kind as PanelKind, id: n.id, name: n.label ?? n.id };
    }
    const note = flow.view.notes.find((x) => x.id === selectedId);
    if (note) return { kind: "NOTE", id: note.id, name: note.text.split("\n")[0].trim() || note.id };
    const group = flow.view.groups.find((x) => x.id === selectedId);
    if (group) return { kind: "GROUP", id: group.id, name: group.title || group.id };
  }
  if (selectedEdgeId) {
    const e = flow.edges.find((x) => x.id === selectedEdgeId);
    if (e) return { kind: "EDGE", id: e.id, name: e.label ?? `${e.from} → ${e.to}` };
  }
  return { kind: "SET", id: null, name: setName };
}

export function PanelHeader({ target }: { target: PanelTarget }) {
  const { label, icon: Icon } = PANEL_KIND[target.kind];
  return (
    <div className="rsf-panel-header" data-testid="flow-panel-header" data-kind={target.kind}>
      <span className="rsf-panel-header-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className="rsf-panel-header-text">
        <p className="rsf-panel-header-kind" data-testid="flow-panel-kind">
          {label}
        </p>
        <p className="rsf-panel-header-name" data-testid="flow-panel-name">
          {target.name}
        </p>
      </div>
    </div>
  );
}
```

`state/useRuleSearch.ts`(새):

```ts
"use client";

/**
 * 룰 목록 찾기 상태(4단계 계획 Task 8) — 3단계 `RulePanel` 안에 있던 검색어·결과·요청 순번을 page 로 올렸다.
 * 섹션을 접거나 자리가 바뀌거나(「룰 목록」 ↔ 「룰 지정」) 모드를 바꿔도 찾은 줄이 남는다. 늦은 응답은 요청 순번으로 버린다(Local-Rules §11).
 * 확정 버전(releasedVer)이 있는 룰만 남기고, 찾은 룰의 입출력은 `onRules` 로 page 의 룰 맵에 먼저 넣는다(끌어 놓기·두 번 누르기·[지정] 이 IO 를 쓴다).
 */
import { useCallback, useRef, useState } from "react";

import { searchRules } from "../api";
import type { RuleIo } from "../types";

export interface RuleSearch {
  keyword: string;
  setKeyword(v: string): void;
  /** null = 아직 찾지 않음. */
  rows: RuleIo[] | null;
  find(): Promise<void>;
}

export function useRuleSearch(onRules: (ios: RuleIo[]) => void, onError: (e: unknown) => void): RuleSearch {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RuleIo[] | null>(null);
  const seq = useRef(0);
  const latest = useRef({ keyword, onRules, onError });
  latest.current = { keyword, onRules, onError };
  const find = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await searchRules(latest.current.keyword);
      if (mine !== seq.current) return; // 늦게 온 앞 응답은 버린다
      const found = (res.rules ?? []).filter((r) => r.releasedVer != null);
      latest.current.onRules(found);
      setRows(found);
    } catch (e) {
      if (mine !== seq.current) return;
      latest.current.onError(e);
    }
  }, []);
  return { keyword, setKeyword, rows, find };
}
```

- [ ] **Step 4: 구현 — 룰 목록 본문·SidePanel**

`canvas/RulePanel.tsx`(전체 바꿈):

```tsx
"use client";

/**
 * 룰 목록(3단계 계획 A4 → 4단계 Task 8 에서 오른쪽 섹션 본문) — 찾기 칸과 확정 버전 룰 줄. 섹션 머리·접기는 `Section`, 찾기 상태는 page 의 `useRuleSearch` 가 맡는다.
 * - insert(편집): 줄을 캔버스 선 위로 끌거나, 두 번 눌러 고른 선(없으면 END 앞 선)에 끼운다.
 * - assign(편집에서 룰을 지정할 노드를 고름): 줄마다 [지정], 두 번 누르기도 지정. 선 위로 끌어 끼우기는 그대로 된다.
 * - view(보기): 찾기·보기만(끌기·두 번 누르기·[지정] 없음).
 */
import type { RefObject } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

import type { RuleSearch } from "../state/useRuleSearch";
import type { RuleIo } from "../types";
import { RULE_MIME } from "./FlowCanvas";

export type RuleListMode = "view" | "insert" | "assign";

export interface RulePanelProps {
  mode: RuleListMode;
  search: RuleSearch;
  /** 찾기 칸 — 룰 지정 섹션을 열 때 초점을 둔다. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** 두 번 누르기(insert). */
  onInsert(io: RuleIo): void;
  /** [지정]·두 번 누르기(assign). */
  onAssign(io: RuleIo): void;
}

const ROW_TITLE: Record<RuleListMode, string | undefined> = {
  insert: "선 위로 끌거나 두 번 눌러 넣는다",
  assign: "두 번 누르거나 [지정] 을 누르면 고른 노드의 룰이 된다. 선 위로 끌면 끼운다",
  view: undefined,
};

export function RulePanel({ mode, search, inputRef, onInsert, onAssign }: RulePanelProps) {
  const active = mode !== "view";
  const { rows } = search;
  return (
    <div className="rsf-rule-panel" data-testid="flow-rule-panel" data-mode={mode}>
      <div className="rsf-rule-list-search">
        <Input
          data-testid="flow-rule-panel-search"
          {...({ ref: inputRef } as object)}
          value={search.keyword}
          placeholder="룰 ID·룰명"
          aria-label="룰 찾기"
          onChange={search.setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void search.find();
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button data-testid="flow-rule-panel-find" onClick={() => void search.find()}>
          찾기
        </Button>
      </div>
      {rows && rows.length === 0 && <p className="rsf-rule-list-empty">확정된 룰이 없다</p>}
      {rows && rows.length > 0 && (
        <ul className="rsf-rule-rows" data-testid="flow-rule-rows">
          {rows.map((r) => (
            <li
              key={r.ruleId}
              className="rsf-rule-row"
              data-testid={`flow-rule-row-${r.ruleId}`}
              draggable={active}
              title={ROW_TITLE[mode]}
              onDragStart={(e) => {
                if (!active) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData(RULE_MIME, r.ruleId);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={() => {
                if (mode === "insert") onInsert(r);
                else if (mode === "assign") onAssign(r);
              }}
            >
              <span className="rsf-rule-row-id">{r.ruleId}</span>
              <span className="rsf-rule-row-name">{r.ruleName ?? "(이름 없음)"}</span>
              <span className="rsf-rule-row-kind">{r.ruleKind ?? "-"}</span>
              {mode === "assign" && (
                <Button
                  size="mini"
                  className="rsf-rule-assign"
                  data-testid={`flow-rule-assign-${r.ruleId}`}
                  ariaLabel={`${r.ruleId} 지정`}
                  onClick={() => onAssign(r)}
                >
                  지정
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`panels/SidePanel.tsx`(새):

```tsx
"use client";

/**
 * 오른쪽 패널(보기·편집 모드, 4단계 계획 Task 8 · 스펙 §1.3 Camunda Modeler 식) — 맨 위 머리글, 그 아래 접는 섹션 목록.
 * 속성·세트 섹션은 `PropertyPanel`·`SetPanel` 이 그리고, 룰 목록 섹션(ID `rules`)은 이 파일이 붙인다.
 * - 편집 모드에서 룰을 지정할 노드(`ASSIGNABLE_KINDS`)를 고름 → 제목 「룰 지정」, 맨 위, 줄마다 [지정].
 * - 그 밖(세트·선·분기·합류·메모·그룹, 보기 모드 전부) → 제목 「룰 목록」, 맨 아래.
 * - 선을 고르면 속성 섹션이 없고 룰 목록 섹션만 있다(두 번 누르기가 그 선에 끼운다).
 * `assignSignal` 이 바뀌면(page 의 `openRuleAssign`) 룰 지정 섹션을 펴고 그다음 커밋에서 찾기 칸에 초점을 둔다.
 * 섹션 순서가 바뀌어도 같은 key 로 두어 다시 마운트하지 않는다(찾기 상태는 page 의 `useRuleSearch` 라 다시 마운트돼도 남는다).
 */
import { useEffect, useRef } from "react";

import { RulePanel, type RuleListMode } from "../canvas/RulePanel";
import type { EditFlow } from "../flow-edit";
import type { RuleSearch } from "../state/useRuleSearch";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIo, RuleIoMap, RuleSetCheck } from "../types";
import { PanelHeader, panelTargetOf } from "./PanelHeader";
import { PropertyPanel, type PropertyPanelProps } from "./PropertyPanel";
import { Section, type SectionMemory } from "./Section";
import { SetPanel, type SetPanelProps } from "./SetPanel";

/** 룰 목록 섹션 ID — 제목만 「룰 목록」/「룰 지정」 으로 바뀐다. */
export const RULES_SECTION = "rules";
/** 「룰 지정」 대상 노드 종류. Task 9 가 "TASK" 를 더한다(문자열 집합 — 계약에 TASK 가 없을 때도 tsc 가 통과한다). */
export const ASSIGNABLE_KINDS: ReadonlySet<string> = new Set(["RULE"]);

export function ruleListMode(flow: EditFlow, selectedId: string | null, editing: boolean): RuleListMode {
  if (!editing) return "view";
  const n = selectedId ? flow.nodes.find((x) => x.id === selectedId) : undefined;
  return n && ASSIGNABLE_KINDS.has(n.kind) ? "assign" : "insert";
}

export interface SidePanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  /** 보기·편집만(디버그는 page 가 변수 패널을 그린다). */
  mode: FlowMode;
  loading: boolean;
  selectedId: string | null;
  selectedEdgeId: string | null;
  /** 캔버스 다중 선택(흐름 노드 ID) — 그룹 [선택 노드 더하기]. */
  selectedNodeIds: readonly string[];
  setName: string;
  description: string;
  onSetName(v: string): void;
  onDescription(v: string): void;
  canApplyGuide: boolean;
  guideHint: string | undefined;
  onApplyGuide: SetPanelProps["onApplyGuide"];
  onError(e: unknown): void;
  onEdit: PropertyPanelProps["onEdit"];
  onOpenRule(ruleId: string): void;
  sections: SectionMemory;
  ruleSearch: RuleSearch;
  /** page 의 `openRuleAssign` 이 올린다 — 바뀌면 룰 지정 섹션을 펴고 찾기 칸에 초점. */
  assignSignal: number;
  /** 룰 목록 두 번 누르기 — 고른 선(없으면 END 앞 선)에 끼운다. */
  onInsertRule(io: RuleIo): void;
  /** [지정]·두 번 누르기 — 고른 노드에 룰을 지정한다(Task 8: RULE 바꾸기, Task 9: 빈 단계도). */
  onAssignRule(nodeId: string, io: RuleIo): void;
}

export function SidePanel(p: SidePanelProps) {
  const editing = p.mode === "edit";
  const editable = editing && !p.loading;
  const target = panelTargetOf(p.flow, p.rules, p.selectedId, p.selectedEdgeId, p.setName);
  const listMode = ruleListMode(p.flow, p.selectedId, editing);
  const { sections, assignSignal } = p;

  // 룰 지정 섹션 열기 — 신호가 바뀐 렌더에서 펴고(접혀 있었으면 다시 그린다), 칸이 그려진 커밋에서 초점을 둔다.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seen = useRef(assignSignal);
  const focusPending = useRef(false);
  useEffect(() => {
    if (assignSignal === seen.current) return;
    seen.current = assignSignal;
    if (listMode !== "assign") return;
    focusPending.current = true;
    sections.open(target.kind, RULES_SECTION);
  }, [assignSignal, listMode, target.kind, sections]);
  useEffect(() => {
    if (!focusPending.current || !inputRef.current) return;
    focusPending.current = false;
    inputRef.current.focus();
  });

  const ruleSection = (
    <Section key={RULES_SECTION} kind={target.kind} id={RULES_SECTION} title={listMode === "assign" ? "룰 지정" : "룰 목록"} memory={sections}>
      <RulePanel
        mode={listMode}
        search={p.ruleSearch}
        inputRef={inputRef}
        onInsert={p.onInsertRule}
        onAssign={(io) => {
          if (p.selectedId) p.onAssignRule(p.selectedId, io);
        }}
      />
    </Section>
  );
  const body =
    target.kind === "SET" ? (
      <SetPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        setName={p.setName}
        description={p.description}
        editable={editable}
        onSetName={p.onSetName}
        onDescription={p.onDescription}
        canApplyGuide={p.canApplyGuide}
        guideHint={p.guideHint}
        onApplyGuide={p.onApplyGuide}
        onError={p.onError}
        sections={sections}
      />
    ) : target.kind === "EDGE" || !target.id ? null : (
      <PropertyPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        checks={p.checks}
        selectedId={target.id}
        selectedNodeIds={p.selectedNodeIds}
        editable={editable}
        onEdit={p.onEdit}
        onOpenRule={p.onOpenRule}
        sections={sections}
      />
    );
  return (
    <div className="rsf-side" data-testid="flow-side" data-kind={target.kind}>
      <PanelHeader target={target} />
      {listMode === "assign" ? [ruleSection, body] : [body, ruleSection]}
    </div>
  );
}
```

- [ ] **Step 5: 구현 — 속성·세트 패널을 섹션으로**

`panels/SetPanel.tsx`: `SetPanelProps` 에 `sections: SectionMemory;` 를 더하고(`import { Section, type SectionMemory } from "./Section";`), 본문을 세 섹션으로 나눈다. `<p className="rsf-panel-title">룰 세트</p>` 는 지운다(머리글이 맡는다). testid `flow-prop-set` 은 바깥 `div` 에 그대로 둔다.

```tsx
    <div className="rsf-panel" data-testid="flow-prop-set">
      <Section kind="SET" id="set-basic" title="기본 정보" memory={sections}>
        {/* 3단계 표(세트명·설명)와 안내 문구 그대로 */}
      </Section>
      <Section kind="SET" id="set-io" title="세트 입출력" memory={sections}>
        <SetIoTables io={io} />
      </Section>
      <Section kind="SET" id="set-guide" title="구성 지침" memory={sections}>
        <GuideCard canApply={props.canApplyGuide} applyHint={props.guideHint} onApply={props.onApplyGuide} onError={props.onError} />
      </Section>
    </div>
```

(`{/* … 그대로 */}` 자리에는 지금 `<table style={DETAIL_TABLE_STYLE}>…</table>` 과 `<p className="rsf-panel-note">…</p>` 를 그대로 옮긴다. 안내 문구의 「노드를 누르면 그 노드의 속성을 보인다」는 그대로 둔다.)

`panels/PropertyPanel.tsx`:
- `PropertyPanelProps` 에 `sections: SectionMemory;` 를 더한다. `Title` 함수는 지운다(머리글이 이름을 맡는다). `KIND_TEXT` 와 그 안의 `// SEAM(T9)` 줄(있으면)은 그대로 둔다.
- `RuleProps`:

```tsx
    <div className="rsf-panel" data-testid="flow-prop-rule">
      <Section kind="RULE" id="rule-basic" title="룰 정보" memory={sections}>
        {/* 3단계 표(룰 ID·종류·정책·확정 버전) 그대로 */}
        <CheckLines checks={mine.filter((c) => !c.varName)} />
        <div className="rsf-panel-actions">
          <Button data-testid="flow-prop-rule-open" size="sm" disabled={!ruleId} onClick={() => onOpenRule(ruleId)}>
            <IconExternalLink size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            룰 편집 열기
          </Button>
          {editable && <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />}
        </div>
      </Section>
      <Section kind="RULE" id="rule-inputs" title={`입력 변수 ${(io?.conds ?? []).length}개`} memory={sections}>
        {/* 3단계 입력 변수 목록(없음 문구 포함) 그대로 — flow-prop-input-* */}
      </Section>
      <Section kind="RULE" id="rule-results" title={`결과 변수 ${(io?.results ?? []).length}개`} memory={sections}>
        {/* 3단계 결과 변수 목록 그대로 — flow-prop-result-* */}
      </Section>
    </div>
```

  (`<p className="rsf-panel-sub">입력 변수 …</p>`·`결과 변수 …` 소제목과 맨 끝의 `{editable && (<div className="rsf-panel-actions"><DeleteButton …/></div>)}` 는 위로 옮겼으므로 지운다.)
- `SplitProps`: `<Title>{…}</Title>` 를 지우고, 표(분기 이름)·설명 `<p>`·`<CheckLines checks={nodeChecks} />` 와 `{editable && <div className="rsf-panel-actions"><DeleteButton …/></div>}` 를 `<Section kind={node.kind === "IF" ? "IF" : "PARALLEL"} id="split-basic" title="분기" memory={sections}>` 안에, `<p className="rsf-panel-sub">갈래 N개</p>` 는 지우고 갈래 상자 목록 `<div className="rsf-branches">…</div>` 와 `{editable && <div className="rsf-panel-actions"><Button data-testid="flow-prop-add-branch" …/></div>}` 를 `<Section kind={…같은 식…} id="split-branches" title={`갈래 ${branches.length}개`} memory={sections}>` 안에 둔다(갈래 끌기 `handleDrop` 은 그대로).
- `PlainNodeProps({ node, sections })`: `<Title>` 를 지우고 `<Section kind={node.kind as PanelKind} id="node-basic" title="설명" memory={sections}><p className="rsf-panel-note">{text}</p></Section>`.
- 메모: `<Title>` 를 지우고 글 칸·붙은 노드 문구·[지우기] 를 `<Section kind="NOTE" id="note-basic" title="메모" memory={sections}>` 안에 둔다.
- 그룹: `<Title>` 를 지우고 제목 표·[지우기] 를 `<Section kind="GROUP" id="group-basic" title="그룹" memory={sections}>`, 「구성 노드 N개」 소제목을 지우고 목록·안내 문구·[선택 노드 더하기] 를 `<Section kind="GROUP" id="group-members" title={`구성 노드 ${group.nodeIds.length}개`} memory={sections}>` 안에 둔다.
- import: `import type { PanelKind } from "./PanelHeader"; import { Section, type SectionMemory } from "./Section";`. 파일 머리 주석에 「4단계 Task 8: 머리글(이름)은 `SidePanel`, 각 소제목은 접는 섹션(`Section`) — testid 는 그대로」를 더한다.

`styles/props.ts` 끝에 더한다:

```css
/* 오른쪽 머리글·섹션(4단계 Task 8 — Camunda Modeler 식). 한 변 색 바 없이 전체 선·배경 톤만 쓴다. */
.rsf-side { display: flex; flex-direction: column; }
.rsf-panel-header { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.rsf-panel-header-icon { display: flex; color: var(--color-text-secondary); }
.rsf-panel-header-text { min-width: 0; }
.rsf-panel-header-kind { margin: 0; font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-secondary); }
.rsf-panel-header-name { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rsf-side > .rsf-panel { padding: 0; }
.rsf-section { border-bottom: 1px solid var(--color-border-light); }
.rsf-section-head {
  display: flex; align-items: center; justify-content: space-between; width: 100%; padding: var(--spacing-xs) var(--spacing-md);
  background: none; border: 0; color: var(--color-text); font: inherit; font-weight: 600; text-align: left; cursor: pointer;
}
.rsf-section-head:hover { background: var(--color-bg-hover); }
.rsf-section-chevron { flex: none; color: var(--color-text-muted); transition: transform 0.15s; }
.rsf-section[data-open="true"] .rsf-section-chevron { transform: rotate(90deg); }
.rsf-section-body { padding: 0 var(--spacing-md) var(--spacing-sm); }
.rsf-section-body .rsf-rule-panel { flex: none; overflow: visible; }
.rsf-section-body .rsf-rule-list-search, .rsf-section-body .rsf-rule-rows { padding-left: 0; padding-right: 0; }
```

`styles/drag.ts`: `.rsf-rule-list-head {…}` 규칙과 Task 7 이 더한 `.rsf-props > .rsf-rule-panel {…}` 한 줄을 지우고, `.rsf-rule-row` 의 `grid-template-columns: 1fr auto;` 를 `grid-template-columns: 1fr auto auto;` 로 바꾸고 한 줄 더한다:

```css
.rsf-rule-assign { grid-row: 1 / span 2; grid-column: 3; align-self: center; }
```

- [ ] **Step 6: 구현 — 편집 동작·메뉴·page**

`state/useEditActions.ts`:
- `EditActionsDeps` 에 `/** 룰 지정 섹션 열기(4단계 Task 8) — 노드를 고르고 섹션을 펴 찾기 칸에 초점. */ openRuleAssign(nodeId: string): void;` 를 더한다(`openRuleModal` 은 이 태스크에서는 남긴다 — 팔레트 [룰]·[+] 「룰 넣기」 가 아직 쓴다. Task 9 가 지운다).
- `insertAt` 을 바꾼다:

```ts
  /**
   * 노드 add 개를 끼우는 연산 — 상한을 먼저 보고, 끼울 선을 고른 뒤, 새 노드(선 e 의 새 도착 노드)를 고른다. 새 노드 ID(실패면 null)를 돌려준다.
   * pick 이 "out" 이면 새 노드 대신 새 노드에서 나가는 선을 고른다(룰 목록 두 번 누르기 — 다음 두 번 누르기가 그 뒤에 잇는다, 4단계 Task 8).
   */
  const insertAt = useCallback(
    (preferred: string | null, add: number, op: (f: EditFlow, edgeId: string) => EditResult, pick: "node" | "out" = "node"): string | null => {
      let created: string | null = null;
      let out: string | null = null;
      const reason = edit((f) => {
        if (f.nodes.length + add > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
        const edgeId = targetEdge(f, preferred);
        if (!edgeId) return fail(NO_TARGET_EDGE);
        const r = op(f, edgeId);
        if (r.ok) {
          created = r.flow.edges.find((e) => e.id === edgeId)?.to ?? null;
          out = r.flow.edges.find((e) => e.from === created)?.id ?? null;
        }
        return r;
      });
      if (reason || !created) return null;
      if (pick === "out" && out) selectEdge(out);
      else select(created);
      return created;
    },
    [edit, select, selectEdge],
  );
```

  (구조 분해 `const { state, flow, editing, selectedId, selectedEdgeId, multiSel, select, openRuleModal, … } = deps;` 에 `selectEdge, openRuleAssign` 를 더한다.)
- `insertPickedRule` 아래에:

```ts
  /** 룰 목록 두 번 누르기(4단계 Task 8) — 고른 선(없으면 END 앞 선)에 끼우고 새 룰에서 나가는 선을 고른다. */
  const insertListRule = useCallback(
    (edgeId: string | null, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      insertAt(edgeId, 1, (f, e) => insertRule(f, e, io.ruleId), "out");
    },
    [editing, addRuleIo, insertAt],
  );
```

  `EditActions` 에 `insertListRule(edgeId: string | null, io: RuleIo): void;` 를 더하고 반환 객체에 넣는다.
- `actions` 의 `replaceRule: (nodeId) => { if (editing) openRuleModal({ purpose: "replace", nodeId }); }` 를 `openRuleAssign: (nodeId: string) => { if (editing) openRuleAssign(nodeId); }` 로 바꾸고 deps 배열에 `openRuleAssign` 을 더한다. `RuleModalPurpose` 의 `"replace"` 갈래는 쓰는 곳이 없어지지만 타입은 Task 9 가 지운다(여기서는 그대로).

`canvas/context-menu.ts`: `/** 룰 찾기 팝업 → replaceRule. */ replaceRule(nodeId: string): void;` 를 `/** 그 노드를 고르고 오른쪽 「룰 지정」 섹션을 펴 찾기 칸에 초점(4단계 Task 8). */ openRuleAssign(nodeId: string): void;` 로 바꾼다.
`canvas/menus/edit-menu.ts`: `{ id: "rule-replace", label: "룰 바꾸기", run: () => act.replaceRule(id) }` 를 `{ id: "rule-replace", label: "룰 바꾸기…", run: () => act.openRuleAssign(id) }` 로 바꾼다.

`page.tsx`:
1. import: `RulePanel`·`PropertyPanel`·`SetPanel` import 를 지우고 `import { SidePanel } from "./panels/SidePanel"; import { useSectionMemory } from "./panels/Section"; import { useRuleSearch } from "./state/useRuleSearch";` 를 더한다.
2. `INSERT_NEEDS_EDGE` 상수와 그 주석, `onInsertRule` 콜백을 지운다(두 번 누르기는 고른 선이 없으면 END 앞 선 — 스펙 §1.3).
3. `select`·`selectEdge`·`clearSelection` 정의 바로 뒤에:

```ts
  /** 섹션 펼침 기억(종류별, 화면 메모리 — 4단계 Task 8). 모드를 바꿔도 남게 page 에 둔다. */
  const sections = useSectionMemory();
  /** 룰 지정 섹션 열기 신호 — 올릴 때마다 오른쪽 패널이 「룰 지정」 섹션을 펴고 찾기 칸에 초점을 둔다. */
  const [assignSignal, setAssignSignal] = useState(0);
  /** 룰 지정 섹션 열기(4단계 Task 8 입구 — 우클릭 [룰 바꾸기…], Task 9 의 빈 단계 놓기·[룰 지정…]). 그 노드를 고르고 신호를 올린다. */
  const openRuleAssign = useCallback(
    (nodeId: string) => {
      select(nodeId);
      setAssignSignal((s) => s + 1);
    },
    [select],
  );
```

4. `useEditActions({ … })` 인자에 `openRuleAssign,` 를 더한다.
5. `const onRules = …` 바로 뒤에:

```ts
  const ruleSearch = useRuleSearch(onRules, state.reportError);
  /** 룰 목록 두 번 누르기 — 고른 선(없으면 END 앞 선)에 끼운다. */
  const onInsertListRule = useCallback((io: RuleIo) => editActions.insertListRule(selectedEdgeId, io), [editActions, selectedEdgeId]);
  /** [지정]·두 번 누르기(룰 지정) — 지금은 RULE 노드 룰 바꾸기. Task 9 가 빈 단계(TASK → RULE)까지 넓힌다(`editActions.assignRule`). */
  const onAssignRule = useCallback((nodeId: string, io: RuleIo) => editActions.applyReplace(nodeId, io), [editActions]);
```

6. `selectedExists` 계산은 지운다(SidePanel 의 `panelTargetOf` 가 맡는다). 오른쪽 패널의 보기·편집 분기(`<> {selectedExists && selectedId ? <PropertyPanel/> : <SetPanel/>} <RulePanel …/> </>`)를 통째로 바꾼다:

```tsx
                    ) : (
                      <SidePanel
                        flow={flow}
                        rules={state.rules}
                        checks={state.checks}
                        mode={mode}
                        loading={state.loading}
                        selectedId={selectedId}
                        selectedEdgeId={selectedEdgeId}
                        selectedNodeIds={multiSel}
                        setName={state.setName}
                        description={state.description}
                        onSetName={state.setSetName}
                        onDescription={state.setDescription}
                        canApplyGuide={editing && !isBranched && !state.loading}
                        guideHint={guideHint}
                        onApplyGuide={state.applyGuide}
                        onError={state.reportError}
                        onEdit={edit}
                        onOpenRule={openRule}
                        sections={sections}
                        ruleSearch={ruleSearch}
                        assignSignal={assignSignal}
                        onInsertRule={onInsertListRule}
                        onAssignRule={onAssignRule}
                      />
                    )}
```

7. 머리 주석 12행을 「- 오른쪽: 보기·편집 = 머리글 + 접는 섹션(`SidePanel` — 속성·세트 섹션과 「룰 목록」/「룰 지정」 섹션), 디버그 = 변수 패널(`VariablePanel`)」로 고친다.

- [ ] **Step 7: 통과 확인**
  - `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS. 선을 고른 채 `flow-prop-set`·`set-name` 을 기대하던 사례가 있으면(오른쪽이 이제 「연결선」 머리글 + 룰 목록) 그 기대를 머리글로 바꾸고 보고서에 적는다.
  - `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0.
  - audit 두 개(바꾼 파일만) → 0건. `grep -rn "flow-rule-panel-toggle\|INSERT_NEEDS_EDGE\|replaceRule: (" src/frontend/m-mdm/pages src/frontend/m-mdm/tests` → 0건. `grep -rn "SEAM(T9)" src/frontend/m-mdm` 의 건수가 이 태스크 전과 같다.

- [ ] **Step 8: 기능설계서·e2e**
  - 기능설계서 §2 A-PROPS 행을 바꾼다: 「보기·편집 = 머리글(`flow-panel-header` — 종류 아이콘·종류 이름 `flow-panel-kind`·이름 `flow-panel-name`) + 접는 섹션(`flow-section-{id}`, 머리 `flow-section-{id}-head` `aria-expanded`, 여러 개 함께 펼침, 펼침 상태는 종류별로 화면 메모리에만). 섹션 목록은 이 계획 Task 8 의 섹션 표 그대로. 룰 목록 섹션(`rules`): 편집 모드에서 룰 노드를 고르면 「룰 지정」(맨 위, 줄마다 [지정] `flow-rule-assign-{ruleId}`), 그 밖은 「룰 목록」(맨 아래). 선을 고르면 속성 섹션 없이 룰 목록만」. 기존 `flow-prop-*` testid 목록은 그대로 둔다.
  - §5.1 B-021 을 「룰 ID·룰명으로 찾아 RELEASED 버전이 있는 룰만 보인다. 편집 모드 「룰 목록」: 줄을 선 위로 끌거나 두 번 누르면 끼운다(두 번 누르기는 고른 선, 없으면 END 앞 선 — 끼운 뒤 새 룰에서 나가는 선을 골라 다음 두 번 누르기가 그 뒤에 잇는다). 「룰 지정」: [지정]·두 번 누르기가 고른 노드의 룰을 바꾼다(자리·선 그대로, 되돌리기 한 번). 찾은 줄은 섹션을 접거나 자리가 바뀌어도 남는다」로 바꾸고, GB-007 의 동작을 `insertListRule(고른 선 또는 END 앞 선)` / `applyReplace(고른 노드)` 로 고친다. 새 행(다음 번호) `섹션 머리(flow-section-{id}-head) | A-PROPS | (없음) | 누르면 펴고 접는다. 종류(룰 세트·룰·분기 등)마다 따로 기억하고 저장하지 않는다`. §5.5 룰 노드 줄의 `룰 바꾸기(rule-replace)` 를 `룰 바꾸기…(rule-replace — 그 노드를 고르고 「룰 지정」 섹션을 펴 찾기 칸에 초점)` 로 고친다. D-004(룰 찾기 팝업) 행의 「노드 「룰 바꾸기」가 연다」와 「바꾸기」 설명을 지운다(바꾸기는 섹션이 한다 — 팝업은 Task 9 가 지운다).
  - `src/frontend/e2e/mdm-user/dme.user.ts` 1864~1866행 근처: `tid(page, "flow-rule-panel-toggle").click()` 두 번을 `tid(page, "flow-section-rules-head").click()` 로 바꾸고, 그 사이의 `expect(tid(page, "flow-rule-panel-search")).toHaveCount(0)` 는 그대로 둔다. 버튼 전수 확인 두 곳(`ruleSetEdit(디버그 모드)`·`ruleSetEdit`)의 allow 에 `...(await dynamicAllow("flow-section-", "오른쪽 섹션 머리 — 펴고 접기는 flow-section-rules-head 로 확인했고 나머지는 같은 동작이다"))` 를 더한다(보기 모드 확인의 `dynamicAllow` 가 그 자리에 없으면 디버그 확인 위의 정의를 함수 밖으로 올려 두 곳에서 쓴다 — 디버그 모드에는 섹션이 없어 그 호출은 빈 객체다). `dynamicAllow` 가 `-head` 로 끝나는 머리만이 아니라 `flow-section-{id}` 컨테이너도 모으지만 컨테이너는 단추가 아니라서 해가 없다.
  - `mdm-ruleSetEdit.spec.ts` 는 바뀌는 선택자가 없다(E13 의 `flow-rule-panel-search`·`-find`·`flow-rule-row-*` 는 섹션 안에 그대로 있다. 고른 것이 없으니 「룰 목록」 이고 기본 펼침이다).
  - 목록 확인(실행 금지): `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` · `pnpm --dir src/frontend exec playwright test -c playwright.mdm-user.config.ts --list` → 오류 없음.

- [ ] **Step 9: 커밋** — Files 의 경로만 add·commit. 요약 `feat(m-mdm): 룰 세트 편집 오른쪽 머리글·접는 섹션 패널·룰 목록/룰 지정 섹션`.

---

### Task 9: 빈 단계 화면·룰 지정 (T1 화면)

**모델:** opus — 흐름 해석(Java 짝)·편집 연산·캔버스·디버거·메뉴에 걸친 TASK 분기를 빠짐없이 채우고, 룰 찾기 창을 지우며 e2e 흐름을 바꾼다.

**전제:** Task 1(계약 — `FlowNodeKind`·`NodeTrace.kind` 에 `"TASK"`, tsc 만 통과하는 `// SEAM(T9)` 최소 분기)과 Task 8 이 feat 에 병합돼 있다. Task 2(엔진 `FlowParser`·`FlowTree` 의 TASK)·Task 3(서비스·`RuleSetAnalyzer`)이 병합돼 있으면 그 결과를 따르고, 아직이면 Step 0 의 규칙대로 한다.

**Files:**
- Modify: `flow-edit.ts`(`TASK_LABEL`·`insertTask`·`assignRule`, TASK 를 룰처럼 다루는 네 곳, `NODE_PREFIX`), `flow-model.ts`(`TaskStep` 블록·차수·`seq`·`FlowTree`), `set-model.ts`(경로 검사 walk, 빈 단계 경고 — Step 0 결과에 따라), `trace-view.ts`(`scopePaths`), `flow-vars.ts`(`nodeAtPoint`), `flow-layout.ts`(`NODE_SIZE.TASK` — SEAM 채우기)
- Modify: `canvas/nodes.tsx`(`TaskBody`·`KIND_CLASS`·`dropTarget`·`onRenameTask`), `canvas/FlowCanvas.tsx` — **이 다섯 곳만**: `BREAKABLE` 집합, 노드 끌어 옮기기 대상 종류 배열(`["RULE", "IF", "PARALLEL"].includes(`), props 두 개(`onAssignDrop`·`onRenameTask`), `dropNode` 상태와 `onDragOver`·`onDragLeave`·`onDrop`, `nodes` memo 의 노드 data 두 칸과 의존성
- Modify: `canvas/menus/edit-menu.ts`(TASK 노드 항목), `canvas/menus/debug-menu.ts`·`debugger/useSimulation.ts`(`BREAKABLE` 에 TASK), `debugger/TraceDetail.tsx`(TASK 한 줄), `canvas/context-menu.ts`(`pickRuleFor` 주석)
- Modify: `state/useEditActions.ts`(팔레트 [룰]·[+] 「룰 넣기」 → 빈 단계 + `openRuleAssign`, `assignRule`, 룰 찾기 창 쓰임 지우기), `panels/SidePanel.tsx`(`ASSIGNABLE_KINDS` 에 `"TASK"`, `usedRuleIds` 전달), `panels/PanelHeader.tsx`(TASK 이름 기본값), `panels/PropertyPanel.tsx`(`TaskProps`), `canvas/RulePanel.tsx`(「사용 중」 배지), `page.tsx`
- Delete: `canvas/RuleSearchModal.tsx`(스펙 §1.2 — 사용자 승인됨) — `/usr/bin/git rm`
- Modify: `styles/base.ts`(`/* 룰 찾기 */` 절 `.rsf-cands`·`.rsf-cand`·`.rsf-cand:hover`·`.rsf-cand-id`·`.rsf-cand-name` 삭제), `styles/task.ts`(새 `TASK_CSS`), `rsf-styles.ts`(잇기), `styles/drag.ts`(`.rsf-rule-used`)
- Test: `tests/task-node.test.ts`(새 — 순수), `tests/task-page.test.ts`(새 — 화면), `tests/flow-canvas.test.ts`(`RuleSearchModal` describe·import 삭제), `tests/rule-set-edit-page.test.ts`(「팔레트 [룰] → 룰 찾기에서 고르면…」·「노드 상한…」 사례)
- Docs: 기능설계서 §3.2(노드 표에 빈 단계), §5.1 B-009·B-021, D-004(룰 찾기 팝업 행 → 룰 지정 섹션), §5.3 「팔레트로 끼우기」·「팔레트·룰 목록 끌어 놓기」, §5.5(빈 단계 노드 줄), 디버그 절(빈 단계 한 단계)
- e2e: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`(`addRule` 도우미·파일 머리 주석), `src/frontend/e2e/mdm-user/dme.user.ts`(1721행 근처 「사용 중」 확인, `addRuleToFlow`), `src/frontend/e2e/mdm-user/TEST-CASES.md`(SED-02 문구, 378행 메모)

**Interfaces:**
- Consumes: Task 1 `FlowNodeKind` 의 `"TASK"`·`// SEAM(T9)` 표식. Task 8 `openRuleAssign(nodeId)`(page)·`EditActionsDeps.openRuleAssign`·`CanvasActions.openRuleAssign`·`ASSIGNABLE_KINDS`·`SidePanelProps.onAssignRule`·`RulePanel`·`insertAt(…): string | null`·`insertListRule`. 3단계 `updateNodeLabel`·`replaceRule`·`positionsOf`·`drawnPositions`. Task 2 의 Java `FlowTree` 블록(있으면 `TaskStep`) — TS 짝을 같게 둔다.
- Produces:
  - `flow-edit.ts`: `export const TASK_LABEL = "빈 단계"`, `export function insertTask(f: EditFlow, edgeId: string, label: string = TASK_LABEL): EditResult`, `export function assignRule(f: EditFlow, nodeId: string, ruleId: string): EditResult`(TASK → RULE, RULE → `replaceRule`, 그 밖 「빈 단계·룰 노드에만 룰을 지정한다」). 빈 단계 노드 ID 는 룰과 같은 `r` 접두어다(지정해도 ID 가 그대로라 `r1…rN` 규칙·e2e `expectChain` 이 그대로 맞는다).
  - `flow-model.ts`: `export interface TaskStep { type: "TASK"; nodeId: string }`, `Block = Seq | RuleStep | TaskStep | Split`. `ruleSteps()`·`ruleIds()` 에는 TASK 가 없고 `relation()` 은 TASK 노드도 안다.
  - `flow-vars.ts`: `export function nodeAtPoint(f: RuleSetFlow, pos: Readonly<Record<string, FlowPos>>, at: FlowPos, kinds: ReadonlySet<string>): string | null`.
  - `FlowCanvasProps.onAssignDrop?: (nodeId: string, ruleId: string) => void`, `FlowCanvasProps.onRenameTask?: (nodeId: string, label: string | null) => void`. `FlowNodeData.dropTarget: boolean`, `FlowNodeData.onRenameTask?`.
  - `EditActions.assignRule(nodeId: string, io: RuleIo): void`. `EditActions.insertPickedRule`·`applyReplace`, `EditActionsDeps.openRuleModal`, `RuleModalPurpose` 는 없어진다.
  - testid: `flow-node-{id}` 의 `data-kind="TASK"`, `flow-task-title-{id}`, `flow-task-title-input-{id}`, `flow-prop-task`, `flow-prop-task-title`, `flow-menu-item-rule-assign`, `flow-rule-used-{ruleId}`. 없어지는 testid: `flow-rule-search-keyword`·`flow-rule-search-find`·`flow-rule-search-error`·`flow-rule-cands`·`flow-rule-cand-{id}`.

- [ ] **Step 0: 조사(코드 쓰기 전)**
  1. `grep -rn "SEAM(T9)" src/frontend/m-mdm src/backend` — 나온 자리를 모두 적는다. 이 태스크가 끝나면 0건이어야 한다.
  2. Task 2 의 Java: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java`·`FlowParser.java`·`FlowTree.java` 에서 TASK 블록 이름(예상 `TaskStep(String nodeId)`)과 `FlowTree` 가 TASK 에 순번(`positions`)을 주는지 본다. TS `flow-model.ts` 를 같게 둔다(아래 Step 3 코드는 「TASK 도 순번을 받고 `ruleSteps` 에는 없다」를 가정한다 — Java 가 다르면 Java 에 맞추고 보고서에 적는다). 코퍼스(`src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`)에 TASK 사례가 있으면 `tests/rule-set-corpus.test.ts` 가 관문이다.
  3. Task 2·3 의 빈 단계 경고: `grep -rn "TASK\|빈 단계" src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java src/backend/maru-mdm-engine/src/main/java`. **`RuleSetAnalyzer.checks` 가 경고를 낸다면** 같은 코드·심각도·문구·순서를 `set-model.ts` 의 `flowChecks` 에 옮긴다(화면 검사와 서버 검사는 「같은 코드·문구·순서」 짝이다 — `set-model.ts` 머리 주석). **엔진 validate 경고(`EngineWarning`)로만 낸다면** `flowChecks` 는 경고를 만들지 않는다(서버 validate 응답이 검사 목록에 싣는다). 오직 TASK 만 있는 흐름의 `EMPTY`(룰이 하나도 없다) 처리도 Java 와 같게 둔다(지금 Java 는 RULE 이 없으면 EMPTY REJECT). Task 2·3 이 아직 병합되지 않았으면 `flowChecks` 는 경고를 만들지 않고 walk 만 고친 채 두고, 보고서에 「Task 3 병합 뒤 짝 맞추기 필요」를 적는다.

- [ ] **Step 1: 실패하는 테스트 — 순수(`tests/task-node.test.ts`)**

```ts
// 4단계 Task 9(T1) — 빈 단계(TASK) 편집 연산·흐름 해석·JSON 왕복·놓기 대상·디버거 기록 해석.
import { describe, expect, it } from "vitest";

import type { NodeTrace, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import {
  TASK_LABEL, assignRule, copyFragment, duplicateNode, flowJsonOf, insertRule, insertSplit, insertTask, moveNode, removeNode, setPositions,
  setRoute, toEditFlow, updateEdge, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";
import { nodeAtPoint } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { flowChecks } from "../../../pages/dme/ruleSetEdit/set-model";
import { frames, overlayAt, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";

const NODE_KEYS = ["id", "kind", "ruleId", "splitId", "label"];
function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  for (const n of r.flow.nodes) expect(Object.keys(n)).toEqual(NODE_KEYS);
  return r.flow;
}
function valid(f: EditFlow) {
  expect(parseFlow(f).issues).toEqual([]);
  return f;
}
/** start → r1 → r2 → end. 선 e1 start→r1, e2 r1→r2, e3 r2→end. */
const base = () => toEditFlow(null, ["R_A", "R_B"]);
const nm = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const io = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [nm(cond)], results: [{ ...nm(result), source: null }],
});

describe("빈 단계 편집 연산(4단계 Task 9)", () => {
  it("insertTask — 선 위에 TASK(룰 ID 없음, 기본 제목)를 insertRule 과 같은 자리·선 규칙으로 끼운다. ID 는 r 접두어", () => {
    const f = valid(ok(insertTask(base(), "e2")));
    expect(f.nodes.find((n) => n.kind === "TASK")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: TASK_LABEL });
    expect(f.edges.find((e) => e.id === "e2")!.to).toBe("r3");
    expect(f.edges.find((e) => e.from === "r3")!.to).toBe("r2");
    expect(f.nodes.map((n) => n.id)).toEqual(["start", "r1", "r3", "r2", "end"]);
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
    expect(ok(insertTask(base(), "e2", "나중에")).nodes.find((n) => n.id === "r3")?.label).toBe("나중에");
    expect(insertTask(base(), "zz")).toEqual({ ok: false, reason: "선 zz를 찾지 못했다" });
  });

  it("assignRule — TASK 는 같은 ID·자리·선·경로·선 라벨·노드 라벨 그대로 RULE 이 되고, RULE 은 룰만 바뀐다", () => {
    let f = ok(insertTask(base(), "e2"));
    f = setPositions(f, { r3: { x: 40, y: 200 } });
    f = ok(setRoute(f, "e2", [{ x: 10, y: 150 }]));
    f = ok(updateEdge(f, "e2", { label: "들어옴" }));
    const before = flowJsonOf(f);
    const g = valid(ok(assignRule(f, "r3", "R_Z")));
    expect(flowJsonOf(f)).toBe(before); // 입력을 바꾸지 않는다
    expect(g.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "RULE", ruleId: "R_Z", splitId: null, label: TASK_LABEL });
    expect(g.view.positions.r3).toEqual({ x: 40, y: 200 });
    expect(g.view.routes.e2).toEqual([{ x: 10, y: 150 }]);
    expect(g.edges).toEqual(f.edges);
    expect(parseFlow(g).tree?.ruleIds()).toEqual(["R_A", "R_Z", "R_B"]);
    expect(ok(assignRule(g, "r1", "R_Y")).nodes.find((n) => n.id === "r1")?.ruleId).toBe("R_Y");
  });

  it("assignRule — 시작·끝·분기·합류와 빈 룰 ID 는 거부한다", () => {
    const f = ok(insertTask(base(), "e2"));
    expect(assignRule(f, "start", "R")).toEqual({ ok: false, reason: "빈 단계·룰 노드에만 룰을 지정한다" });
    expect(assignRule(f, "r3", " ")).toEqual({ ok: false, reason: "룰 ID 가 비었다" });
    expect(assignRule(f, "zz", "R")).toEqual({ ok: false, reason: "노드 zz를 찾지 못했다" });
  });

  it("빈 단계도 룰처럼 지우고(앞뒤 잇기)·옮기고·복사·복제한다", () => {
    const f = ok(insertTask(base(), "e2")); // start → r1 → r3(TASK) → r2 → end, r3 → r2 는 e4
    const del = valid(ok(removeNode(f, "r3")));
    expect(del.nodes.some((n) => n.id === "r3")).toBe(false);
    expect(del.edges.find((e) => e.id === "e2")!.to).toBe("r2");
    const moved = valid(ok(moveNode(f, "r3", "e3")));
    expect(moved.edges.find((e) => e.id === "e3")!.to).toBe("r3");
    expect(moved.edges.find((e) => e.id === "e2")!.to).toBe("r2");
    expect(typeof copyFragment(f, "r3")).toBe("object");
    const dup = valid(ok(duplicateNode(f, "r3")));
    expect(dup.nodes.filter((n) => n.kind === "TASK").map((n) => n.id)).toEqual(["r3", "r4"]);
    expect(dup.nodes.find((n) => n.id === "r4")?.label).toBe(TASK_LABEL);
  });

  it("흐름 JSON 왕복 — TASK 종류·제목이 남고 정규 문자열이 같다", () => {
    const f = ok(insertTask(base(), "e2", "나중에 채울 단계"));
    const json = flowJsonOf(f);
    const back = toEditFlow(JSON.parse(json), []);
    expect(flowJsonOf(back)).toBe(json);
    expect(back.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: "나중에 채울 단계" });
  });

  it("흐름 해석 — 갈래 안 TASK 도 들어오고 나가는 선이 하나씩이면 된다. 관계는 알고 ruleSteps 에는 없다", () => {
    let f = ok(insertSplit(base(), "e2", "PARALLEL")); // r1 → par1{e4, e5} → m1 → r2
    f = valid(ok(insertTask(f, "e4")));
    const t = f.nodes.find((n) => n.kind === "TASK")!.id;
    const tree = parseFlow(f).tree!;
    expect(tree.relation("r1", t)).toBe("BEFORE");
    expect(tree.ruleSteps().map((s) => s.nodeId)).toEqual(["r1", "r2"]);
  });

  it("세트 검사 — 빈 단계는 룰 검사(없는 룰 등)의 거부를 만들지 않고 경로 검사가 멈추지 않는다", () => {
    const f = ok(insertTask(base(), "e2"));
    const rules = { R_A: io("R_A", "SET_THK", "S_A"), R_B: io("R_B", "S_A", "S_B") };
    const checks = flowChecks(f, rules, {});
    expect(checks.filter((c) => c.severity === "REJECT")).toEqual([]);
  });

  it("nodeAtPoint — 그린 상자 안의 주어진 종류 노드만, 밖이면 null", () => {
    const f = ok(insertTask(base(), "e2"));
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r3: { x: 0, y: 200 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 400 } };
    const both = new Set(["TASK", "RULE"]);
    expect(nodeAtPoint(f, pos, { x: 10, y: 210 }, both)).toBe("r3");
    expect(nodeAtPoint(f, pos, { x: NODE_SIZE.TASK.w + 1, y: 210 }, both)).toBeNull();
    expect(nodeAtPoint(f, pos, { x: 10, y: 110 }, new Set(["TASK"]))).toBeNull();
    expect(nodeAtPoint(f, pos, { x: 10, y: 110 }, both)).toBe("r1");
    expect(NODE_SIZE.TASK).toEqual(NODE_SIZE.RULE); // 지정해도 크기가 같아 자리가 흔들리지 않는다
  });
});

describe("디버거 — 빈 단계 한 단계(4단계 Task 9)", () => {
  const S = (value: string): TypedValue => ({ type: "STRING", value });
  const nt = (seq: number, nodeId: string, kind: NodeTrace["kind"], extra: Partial<NodeTrace> = {}): NodeTrace =>
    ({ seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...extra });
  /** start → r1 → par1{e4: r3(R_C) → r4(TASK) / e5: 빈} → m1 → r2 → end. */
  function parFlow(): EditFlow {
    let f = ok(insertSplit(base(), "e2", "PARALLEL"));
    f = ok(insertRule(f, "e4", "R_C"));
    const out = f.edges.find((e) => e.from === "r3")!.id;
    return valid(ok(insertTask(f, out)));
  }

  it("병렬 갈래 안 TASK 는 그 갈래 범위의 값을 보이고 아무것도 바꾸지 않는다. 겹침은 current(칩 없음), 값 표 열에 없다", () => {
    const f = parFlow();
    const trace = {
      setId: "S", evalTs: "2026-10-01T00:00:00", input: { IN: S("a") },
      nodes: [
        nt(1, "start", "START"),
        nt(2, "r1", "RULE", { ruleId: "R_A", ver: 1, result: { results: { X: S("1") } } as NodeTrace["result"] }),
        nt(3, "par1", "PARALLEL", { order: ["e4", "e5"] }),
        nt(4, "r3", "RULE", { ruleId: "R_C", ver: 1, result: { results: { Y: S("2") } } as NodeTrace["result"] }),
        nt(5, "r4", "TASK"),
        nt(6, "m1", "MERGE", { splitId: "par1", merged: ["e4", "e5"] }),
      ],
      finalValues: {}, violations: null,
    } as unknown as RunTrace;
    const fr = frames(trace, f);
    expect(fr[4].node.kind).toBe("TASK");
    expect(fr[4].changed).toEqual([]);
    expect(fr[4].before).toEqual(fr[4].ctx);
    expect(fr[4].ctx.Y).toEqual(S("2")); // 갈래 범위 — 루트 범위라면 합류 전이라 Y 가 없다
    const o = overlayAt(trace, f, 4);
    expect(o.nodes.r4.state).toBe("current");
    expect(o.nodes.r4.chip).toBeNull();
    expect(valueTable(trace, f).cols.map((c) => c.nodeId)).not.toContain("r4");
  });
});
```

- [ ] **Step 2: 실패하는 테스트 — 화면(`tests/task-page.test.ts`)**

```ts
/** @vitest-environment happy-dom */

// 4단계 Task 9(T1) — 화면: [룰]·[+] 「룰 넣기」 는 빈 단계를 놓고 「룰 지정」 을 연다, 제목 두 번 눌러 고치기, [지정]·노드 위 끌어 놓기로 룰 지정
// (선·ID 유지, 되돌리기 한 번), 우클릭 [룰 지정…], 보기 모드 읽기 전용, 디버그 중단점, 제목 칸 memo 의존성(Local-Rules §19), 끄는 동안 배치(dagre) 안 늘어남.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), layoutCalls: 0 }));
// dagre 배치 호출 수를 센다(space-canvas.test.ts 와 같은 방식) — 룰 줄을 끄는 동안 늘지 않아야 한다.
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (mocks.layoutCalls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { FlowCanvas, RULE_MIME, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { insertTask, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, hoverEdge, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string, flow: EditFlow | null): RuleSetView {
  return {
    set: { setId, setName: "빈 단계 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["TK_A", "TK_B"], flow, branched: false },
    rules: [io("TK_A"), io("TK_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
/** start → r1(TK_A) → r3(TASK) → r2(TK_B) → end, 모든 노드 위치 고정(그린 자리 = positionsOf). */
function taskFlow(): { flow: EditFlow; pos: Record<string, FlowPos> } {
  const f = must(insertTask(toEditFlow(null, ["TK_A", "TK_B"]), "e2"));
  const pos = positionsOf(f);
  return { flow: setPositions(f, pos), pos };
}
const header = () => [byTestId("flow-panel-kind").textContent, byTestId("flow-panel-name").textContent];
const kindOf = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-kind");
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));
async function findRules(text: string) {
  await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), text);
  await click("flow-rule-panel-find");
  await settle(20);
}
async function dblTitle(id: string) {
  await act(async () => {
    document.querySelector(`[data-testid="flow-task-title-${id}"]`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
}
async function keyOn(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}
/** flow-drag.test.ts 의 dnd 와 같다 — 화면 좌표 = 흐름 좌표(happy-dom 의 기본 viewport). */
function dnd(type: string, target: Element, data: Record<string, string>, at: FlowPos) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    dataTransfer: { value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "", setData: () => {}, dropEffect: "none", effectAllowed: "all" } },
    clientX: { value: at.x },
    clientY: { value: at.y },
    relatedTarget: { value: null },
  });
  return act(async () => {
    target.dispatchEvent(ev);
  });
}

describe("빈 단계 화면(4단계 Task 9)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    srv.replies["search:RULE"] = ok({ rules: [io("TK_NEW"), io("TK_A")] });
  });
  afterEach(() => uninstallServer());

  it("[룰] 은 룰 찾기 창 없이 END 앞 선에 빈 단계를 놓고, 그 노드를 고른 채 「룰 지정」 섹션을 펴고 찾기 칸에 초점을 둔다", async () => {
    await openSet("TK_1", viewOf("TK_1", null)); // start → r1 → r2 → end
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await settle(10);
    expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();
    expect(kindOf("r3")).toBe("TASK");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("빈 단계");
    expect(q("rf__edge-e3")).not.toBeNull();
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 지정");
    expect(q("flow-prop-task")).not.toBeNull();
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });
```

같은 `describe` 안에 이어서(두 코드 블록을 한 파일로 잇는다):

```ts
  it("저장 JSON 에 TASK·제목이 있다. 흐름에 있는 룰은 룰 목록 줄에 「사용 중」", async () => {
    await openSet("TK_2", viewOf("TK_2", null));
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await findRules("TK_");
    expect(q("flow-rule-used-TK_A")).not.toBeNull();
    expect(q("flow-rule-used-TK_NEW")).toBeNull();
    await click("set-save");
    const params = calls("save").at(-1)!.body.params as Record<string, unknown>;
    const saved = JSON.parse(String(params.flowJson)) as EditFlow;
    expect(saved.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: "빈 단계" });
  });

  it("[지정] — 빈 단계가 같은 ID·선의 룰 노드가 되고, 되돌리기 한 번에 빈 단계로 돌아간다", async () => {
    await openSet("TK_3", viewOf("TK_3", null));
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await findRules("TK_");
    await click("flow-rule-assign-TK_NEW");
    expect(kindOf("r3")).toBe("RULE");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("TK_NEW");
    expect(q("rf__edge-e3")).not.toBeNull();
    expect(q("rf__edge-e4")).not.toBeNull();
    expect(header()).toEqual(["룰", "TK_NEW 이름"]);
    await click("flow-undo");
    expect(kindOf("r3")).toBe("TASK");
    await click("flow-undo");
    expect(q("flow-node-r3")).toBeNull();
  });

  it("제목 두 번 눌러 고치기 — Enter 는 저장(되돌리기 한 칸), Esc 는 취소, 보기 모드는 열리지 않는다", async () => {
    const { flow } = taskFlow();
    await openSet("TK_4", viewOf("TK_4", flow));
    await click("flow-mode-edit");
    await dblTitle("r3");
    const input = byTestId<HTMLInputElement>("flow-task-title-input-r3");
    expect(input.value).toBe("빈 단계");
    await typeInto(input, "검사 자리");
    await keyOn(input, "Enter");
    expect(byTestId("flow-task-title-r3").textContent).toBe("검사 자리");
    await click("flow-undo");
    expect(byTestId("flow-task-title-r3").textContent).toBe("빈 단계");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    await dblTitle("r3");
    await typeInto(byTestId<HTMLInputElement>("flow-task-title-input-r3"), "버림");
    await keyOn(byTestId("flow-task-title-input-r3"), "Escape");
    expect(q("flow-task-title-input-r3")).toBeNull();
    expect(byTestId("flow-task-title-r3").textContent).toBe("빈 단계");
    await click("flow-mode-view");
    await dblTitle("r3");
    expect(q("flow-task-title-input-r3")).toBeNull();
  });

  it("룰 줄을 빈 단계 노드 위에 끌면 노드가 강조되고, 놓으면 지정된다(새 노드 없음). 빈 곳은 그대로 「선 위에 놓아야 한다」", async () => {
    const { flow, pos } = taskFlow();
    await openSet("TK_5", viewOf("TK_5", flow));
    await click("flow-mode-edit");
    await findRules("TK_");
    const at = { x: pos.r3.x + 20, y: pos.r3.y + 20 };
    const layoutsBefore = mocks.layoutCalls;
    await dnd("dragover", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, at);
    await dnd("dragover", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, { x: at.x + 5, y: at.y + 5 });
    expect(byTestId("flow-node-r3").classList.contains("rsf-node-drop")).toBe(true);
    expect(q("flow-edge-drop-e2")).toBeNull();
    expect(mocks.layoutCalls).toBe(layoutsBefore); // 끄는 동안 배치(dagre)가 다시 돌지 않는다
    await dnd("drop", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, at);
    await settle(20);
    expect(kindOf("r3")).toBe("RULE");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("TK_NEW");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "r3", "start"]);
    expect(byTestId("flow-node-r3").classList.contains("rsf-node-drop")).toBe(false);
  });

  it("우클릭 — 빈 단계는 [룰 지정…]·복사·복제·삭제. [룰 지정…] 은 그 노드를 고르고 「룰 지정」 을 펴고 찾기 칸에 초점", async () => {
    const { flow } = taskFlow();
    await openSet("TK_6", viewOf("TK_6", flow));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-node-r3").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    expect(menuIds()).toEqual(["rule-assign", "copy", "duplicate", "delete"]);
    expect(visibleText(byTestId("flow-menu-item-rule-assign"))).toBe("룰 지정…");
    await click("flow-menu-item-rule-assign");
    await settle(10);
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules").getAttribute("data-open")).toBe("true");
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });

  it("선 [+] 「룰 넣기」 도 그 선에 빈 단계를 놓고 「룰 지정」 을 연다", async () => {
    await openSet("TK_7", viewOf("TK_7", null));
    await click("flow-mode-edit");
    await hoverEdge("e2");
    await click("flow-edge-add-e2");
    await click("flow-menu-item-insert-rule");
    await settle(10);
    expect(kindOf("r3")).toBe("TASK");
    expect(header()[0]).toBe("빈 단계");
    expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();
  });

  it("보기 모드 — 빈 단계를 골라도 「룰 목록」 이고 속성은 읽기 전용. 디버그 모드에서 빈 단계에 중단점을 걸 수 있다", async () => {
    const { flow } = taskFlow();
    await openSet("TK_8", viewOf("TK_8", flow));
    await click("flow-node-r3");
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(byTestId<HTMLInputElement>("flow-prop-task-title").readOnly).toBe(true);
    await click("flow-mode-debug");
    expect(q("flow-bp-r3")).not.toBeNull();
  });
});

describe("FlowCanvas — 빈 단계 제목 칸은 onRenameTask 하나만 바뀌어도 따른다(Local-Rules §19)", () => {
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
  });
  const noop = () => {};
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("처음엔 없어 두 번 눌러도 칸이 없고, onRenameTask 만 넣어 다시 그리면 칸이 열려 Enter 로 부른다", async () => {
    const flow = must(insertTask(toEditFlow(null, ["R_A"]), "e2")); // start → r1 → r2(TASK) → end
    const base: FlowCanvasProps = {
      flow, rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0,
      onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop,
      breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
      onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    };
    await draw(base);
    await dblTitle("r2");
    expect(document.querySelector('[data-testid="flow-task-title-input-r2"]')).toBeNull();
    const onRenameTask = vi.fn();
    await draw({ ...base, onRenameTask });
    await dblTitle("r2");
    const input = document.querySelector<HTMLInputElement>('[data-testid="flow-task-title-input-r2"]')!;
    expect(input).not.toBeNull();
    await typeInto(input, "새 제목");
    await keyOn(input, "Enter");
    expect(onRenameTask).toHaveBeenCalledWith("r2", "새 제목");
  });
});
```

기존 사례 고치기:
- `tests/flow-canvas.test.ts`: `import { RuleSearchModal } …` 줄과 `describe("RuleSearchModal", …)` 블록 전체를 지운다.
- `tests/rule-set-edit-page.test.ts` 「팔레트 [룰] → 룰 찾기에서 고르면 END 앞 선에 끼운다」: 제목을 「팔레트 [룰] → END 앞 선에 빈 단계, 「룰 지정」 에서 고르면 같은 노드가 그 룰이 된다」로 바꾸고, 팝업 네 동작을 `await click("flow-add-rule"); await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), "E2S_"); await click("flow-rule-panel-find"); await settle(20); await click("flow-rule-assign-E2S_DUP");` 로 바꾼다. 기대 `canvasNodeIds()).toContain("r4")`·`flow-node-r4` 에 `E2S_DUP`·중복 대입 경고는 그대로 맞는다(빈 단계 ID 도 `r` 접두어). `inDoc` import 가 더 쓰이지 않으면 지운다.
- 같은 파일 「노드 상한 — 200개면 [룰]·[IF] 를 끼우지 않고…」: `await click("flow-add-rule"); expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();` 를 `await click("flow-add-rule"); expect(visibleText(byTestId("set-message"))).toContain("노드는 흐름 하나에 200개까지 둔다");` 로 바꾼다(마지막 노드 수 200 기대는 그대로).

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/task-node.test.ts tests/dme/ruleSetEdit/task-page.test.ts tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` → 새 두 파일은 `insertTask`·`TASK_LABEL`·`nodeAtPoint` 가 없어 FAIL, 바꾼 사례 FAIL.

- [ ] **Step 4: 구현 — 흐름 모델·편집 연산·놓기 대상**

`flow-model.ts`:

```ts
/** 빈 단계(4단계 T1) — 아무것도 읽거나 만들지 않고 지나간다. Java `TaskStep` 의 짝. */
export interface TaskStep {
  type: "TASK";
  nodeId: string;
}

export type Block = Seq | RuleStep | TaskStep | Split;
```

`IN_DEGREE`·`OUT_DEGREE` 의 TASK 값(SEAM)을 `ONE` 으로 채운다. `seq` 안 `if (node.kind === "RULE") { … continue; }` 바로 뒤에:

```ts
      if (node.kind === "TASK") {
        items.push({ type: "TASK", nodeId: cur });
        cur = next(cur);
        continue;
      }
```

`FlowTree` 생성자 walk 의 `if (b.type === "RULE") { … }` 를 바꾼다:

```ts
        if (b.type === "RULE" || b.type === "TASK") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
          if (b.type === "RULE") this.steps.push(b);
        } else if (b.type === "SPLIT") {
```

(`Position.order` 주석 「깊이 우선 순번(RULE·분기 노드)」을 「(RULE·TASK·분기 노드)」로, `relation` 주석도 같게 고친다.)

`set-model.ts` 경로 walk: `if (b.type === "RULE") rule(b, s); else if (b.type === "SEQ") walk(b, s);` 다음에 `else if (b.type === "TASK") continue; // 빈 단계는 읽거나 만들지 않는다` 를 넣는다. 빈 단계 경고는 Step 0-3 의 결과대로다.
`trace-view.ts` `scopePaths` 의 `if (b.type === "RULE") paths.set(b.nodeId, path);` 를 `if (b.type === "RULE" || b.type === "TASK") paths.set(b.nodeId, path);` 로 바꾼다(갈래 안 빈 단계가 루트 범위 값을 보이지 않게).
`flow-layout.ts` `NODE_SIZE` 의 `TASK`(SEAM)를 `{ w: 232, h: 68 }`(RULE 과 같다 — 지정해도 자리가 흔들리지 않는다)로 채운다.

`flow-edit.ts`:
- `isSplitKind` 아래에 `/** 룰처럼 선 하나 들어오고 하나 나가는 단계(4단계 T1 — 빈 단계 포함). */ const isStep = (k: FlowNodeKind): boolean => k === "RULE" || k === "TASK";`
- `removeNode` 의 `if (n.kind === "RULE") {` → `if (isStep(n.kind)) {`, `moveExcludedEdges` 의 `if (n?.kind === "RULE")` → `if (n && isStep(n.kind))`, `moveNode` 의 `if (n.kind === "RULE") {` → `if (isStep(n.kind)) {`, `copyFragment` 의 `if (n.kind === "RULE")` → `if (isStep(n.kind))`. `NODE_PREFIX` 에 `TASK: "r"` 를 더한다.
- `insertRule` 바로 뒤:

```ts
/** 빈 단계(TASK, 4단계 T1) 기본 제목. */
export const TASK_LABEL = "빈 단계";

/**
 * 선 e(A→B) 위에 빈 단계를 끼운다 — insertRule 과 같은 자리·선 규칙, 룰 ID 없이 제목만.
 * 노드 ID 는 룰과 같은 `r` 접두어다(룰을 지정해도 ID 가 그대로라 한 줄 흐름의 r1…rN 규칙과 맞는다).
 */
export function insertTask(f: EditFlow, edgeId: string, label: string = TASK_LABEL): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const t = node(fresh(taken, "r"), "TASK", null, null, label);
  const out = edge(fresh(taken, "e"), t.id, e.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === e.from),
    t,
  );
  e.to = t.id;
  insertAfter(g.edges, ei, out);
  return done(g);
}
```

- `replaceRule` 바로 뒤:

```ts
/**
 * 룰 지정(4단계 T1) — 빈 단계면 RULE 로 바꾸고 룰 ID 를 넣고, 룰 노드면 룰만 바꾼다(`replaceRule`).
 * 노드 ID·자리(view.positions)·들어오고 나가는 선·경로·이름표·노드 라벨은 그대로다. 편집 한 번이라 되돌리기 한 번에 돌아간다.
 */
export function assignRule(f: EditFlow, nodeId: string, ruleId: string): EditResult {
  const n = findNode(f, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (n.kind === "RULE") return replaceRule(f, nodeId, ruleId);
  if (n.kind !== "TASK") return fail("빈 단계·룰 노드에만 룰을 지정한다");
  if (ruleId.trim() === "") return fail("룰 ID 가 비었다");
  const g = clone(f);
  const m = findNode(g, nodeId)!;
  m.kind = "RULE";
  m.ruleId = ruleId;
  return done(g);
}
```

  파일 머리 주석 끝에 「4단계(계획 Task 9): 빈 단계(TASK) 끼우기·룰 지정, 빈 단계는 지우기·옮기기·복사에서 룰과 같다.」를 더한다.

`flow-vars.ts` 끝에:

```ts
/**
 * 흐름 좌표 `at` 을 품은 노드(그린 상자 = pos 좌상단 + NODE_SIZE) 가운데 kinds 에 든 것 — 겹치면 흐름 노드 배열에서 뒤의 것. 없으면 null.
 * 룰 목록 줄을 빈 단계·룰 노드 위에 놓을 때(4단계 T1).
 */
export function nodeAtPoint(f: RuleSetFlow, pos: Readonly<Record<string, FlowPos>>, at: FlowPos, kinds: ReadonlySet<string>): string | null {
  let hit: string | null = null;
  for (const n of f.nodes ?? []) {
    if (!kinds.has(n.kind)) continue;
    const p = pos[n.id];
    if (!p) continue;
    const s = NODE_SIZE[n.kind];
    if (at.x >= p.x && at.x <= p.x + s.w && at.y >= p.y && at.y <= p.y + s.h) hit = n.id;
  }
  return hit;
}
```

- [ ] **Step 5: 구현 — 노드·캔버스·메뉴·디버거**

`canvas/nodes.tsx`:
- import 를 `import { useRef, useState, type MouseEvent } from "react";` 와 `import { TASK_LABEL, type FlowNote } from "../flow-edit";` 로 바꾼다.
- `FlowNodeData` 끝에:

```ts
  /** 룰 목록 줄을 끄는 동안 이 노드 위에 있다(4단계 T1) — 놓으면 룰 지정. */
  dropTarget: boolean;
  /** 빈 단계 제목 고치기(편집 모드만, 4단계 T1). 없으면 두 번 눌러도 칸이 열리지 않는다. */
  onRenameTask?: (nodeId: string, label: string | null) => void;
```

- `KIND_CLASS` 에 `TASK: "rsf-task",` 를 더한다. 머리 주석 「캔버스 노드 7종」을 「캔버스 노드 8종(4단계 빈 단계 더함)」으로 고친다.
- `RuleBody` 아래에:

```tsx
/**
 * 빈 단계(4단계 T1) — 점선 테두리(`rsf-task`), 제목만. 편집 모드면 제목을 두 번 눌러 고친다(Enter·칸 밖 누르기 = 저장, Esc = 취소).
 * 조건식 즉석 편집(B10)과 같은 두 번 누르기 방식이다(메모는 글 칸이 늘 열려 있어 따로 제목 고치기가 없다).
 * 제목 줄에 `nopan` 을 달아 두 번 누르기가 화면 확대(React Flow zoomOnDoubleClick)로 새지 않게 한다. 노드 끌기는 그대로다(`nodrag` 없음).
 */
function TaskBody({ data }: { data: FlowNodeData }) {
  const { node, mark, onRenameTask } = data;
  const title = node.label ?? TASK_LABEL;
  const [draft, setDraft] = useState<string | null>(null);
  /** 칸이 열려 있는가 — Enter 로 닫은 뒤 칸이 빠지며 오는 blur 가 한 번 더 저장하지 않게 ref 로 막는다. */
  const editingRef = useRef(false);
  const open = () => {
    editingRef.current = true;
    setDraft(title);
  };
  const close = (save: boolean) => {
    if (!editingRef.current || draft === null) return;
    editingRef.current = false;
    const v = draft.trim();
    setDraft(null);
    if (!save) return;
    const next = v === "" ? null : v;
    if (next !== node.label) onRenameTask?.(node.id, next);
  };
  return (
    <>
      {draft !== null ? (
        <input
          className="rsf-task-input nodrag nopan"
          data-testid={`flow-task-title-input-${node.id}`}
          aria-label="빈 단계 제목"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              close(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(false);
            }
          }}
          onBlur={() => close(true)}
        />
      ) : (
        <div
          className="rsf-title nopan"
          data-testid={`flow-task-title-${node.id}`}
          title={onRenameTask ? "두 번 눌러 제목을 고친다" : undefined}
          onDoubleClick={
            onRenameTask
              ? (e: MouseEvent) => {
                  e.stopPropagation();
                  open();
                }
              : undefined
          }
        >
          {title}
        </div>
      )}
      <div className="rsf-sub">빈 단계 — 룰을 지정하면 룰 노드가 된다</div>
      {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
    </>
  );
}
```

- `FlowNodeView` 의 `cls` 에 `${data.dropTarget ? " rsf-node-drop" : ""}` 를 `flash` 뒤에 붙이고, `{!collapsed && kind === "RULE" && <RuleBody data={data} />}` 다음 줄에 `{!collapsed && kind === "TASK" && <TaskBody data={data} />}` 를 넣는다.

`canvas/FlowCanvas.tsx`(다섯 곳):
1. `const BREAKABLE = new Set(["RULE", "IF", "PARALLEL", "MERGE"]);` → `new Set(["RULE", "TASK", "IF", "PARALLEL", "MERGE"])`. 그 아래에 `/** 룰 목록 줄을 놓아 룰을 지정할 노드 종류(4단계 T1). */ const ASSIGN_DROP_KINDS: ReadonlySet<string> = new Set(["TASK", "RULE"]);`
2. 노드 끌어 옮기기 대상 판정의 `["RULE", "IF", "PARALLEL"].includes(` 배열에 `"TASK"` 를 더한다(`["RULE", "TASK", "IF", "PARALLEL"]`).
3. `FlowCanvasProps` 의 `onDropRule` 다음에:

```ts
  /** 룰 목록 줄을 빈 단계·룰 노드 위에 놓음(4단계 T1) — 룰 지정. 없으면 노드 위에 놓아도 선 끼우기 규칙 그대로다. */
  onAssignDrop?: (nodeId: string, ruleId: string) => void;
  /** 빈 단계 제목 두 번 눌러 고치기(4단계 T1, 편집 모드에서만 노드에 넘긴다). 빈 문자열이면 null(기본 제목). */
  onRenameTask?: (nodeId: string, label: string | null) => void;
```

   `Inner` 구조 분해에 `onAssignDrop, onRenameTask` 를 더한다.
4. `dropEdge` 상태 바로 아래:

```ts
  /** 룰 줄을 끄는 동안 놓일 빈 단계·룰 노드(4단계 T1) — 노드 위면 선 강조 대신 노드를 강조한다. */
  const [dropNode, setDropNodeState] = useState<string | null>(null);
  const dropNodeRef = useRef<string | null>(null);
  const setDropNode = useCallback((id: string | null) => {
    if (dropNodeRef.current === id) return;
    dropNodeRef.current = id;
    setDropNodeState(id);
  }, []);
```

   `onDragOver`·`onDragLeave`·`onDrop` 을 바꾼다:

```ts
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !carries(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const at = flowAt(e.clientX, e.clientY);
    const rule = Array.from(e.dataTransfer?.types ?? []).includes(RULE_MIME);
    const overNode = rule && onAssignDrop ? nodeAtPoint(vflow, pos, at, ASSIGN_DROP_KINDS) : null;
    setDropNode(overNode);
    setDropEdge(overNode ? null : dropTargetAt(vflow, pos, at, rf.getZoom()));
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // 캔버스 안의 자식 사이를 오가는 것은 떠남이 아니다.
    if (e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) return;
    setDropEdge(null);
    setDropNode(null);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !e.dataTransfer) return;
    const item = e.dataTransfer.getData(PALETTE_MIME);
    const ruleId = e.dataTransfer.getData(RULE_MIME);
    const isPalette = PALETTE_ITEMS.includes(item);
    setDropEdge(null);
    setDropNode(null);
    if (!isPalette && !ruleId) return;
    e.preventDefault();
    const at = flowAt(e.clientX, e.clientY);
    if (!isPalette && onAssignDrop) {
      const target = nodeAtPoint(vflow, pos, at, ASSIGN_DROP_KINDS);
      if (target) {
        onAssignDrop(target, ruleId);
        return;
      }
    }
    const edgeId = dropTargetAt(vflow, pos, at, rf.getZoom());
    if (isPalette) onDropPalette(item as PaletteItem, at, edgeId);
    else onDropRule(ruleId, edgeId);
  };
```

   (import 의 `../flow-vars` 줄에 `nodeAtPoint` 를 더한다.)
5. `nodes` memo 의 흐름 노드 `data` 에 `dropTarget: dropNode === n.id,` 와 `onRenameTask: editable ? onRenameTask : undefined,` 를 `linkable: editable,` 다음에 더하고, 의존성 배열 끝에 `dropNode, onRenameTask` 를 더한다. 파일 머리 주석의 A1 문단 끝에 「룰 줄을 빈 단계·룰 노드 상자 위에 놓으면 선 대신 그 노드에 룰을 지정한다(`onAssignDrop`, 4단계 T1).」를 더한다.

`canvas/menus/edit-menu.ts` 노드 분기의 `if (n.kind === "RULE") { … }` 뒤에:

```ts
    if (n.kind === "TASK") {
      return [
        { id: "rule-assign", label: "룰 지정…", run: () => act.openRuleAssign(id) },
        { id: "copy", label: "복사", run: () => act.copy(id) },
        { id: "duplicate", label: "복제", run: () => act.duplicate(id) },
        { id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) },
      ];
    }
```

`canvas/menus/debug-menu.ts` 의 `BREAKABLE`, `debugger/useSimulation.ts` 의 `BREAKABLE`(주석 「RULE·IF·PARALLEL·MERGE 만」 포함)에 `"TASK"` 를 더한다(스펙 §1.2 「중단점도 걸 수 있다」). `canvas/context-menu.ts` 의 `/** 룰 찾기 팝업 → 그 선에 끼움. */ pickRuleFor` 주석을 「그 선에 빈 단계를 끼우고 「룰 지정」 섹션을 연다(4단계 T1)」로 바꾼다.
`debugger/TraceDetail.tsx`: `KIND_TEXT` 의 TASK(SEAM)를 `"빈 단계"` 로 채우고, `{node.kind === "RULE" && (` 블록 앞에 `{node.kind === "TASK" && <p className="rsf-muted" data-testid="sim-detail-task">빈 단계 — 아무것도 읽거나 만들지 않고 지나갔다</p>}` 를 넣는다.

`styles/task.ts`(새):

```ts
/** 빈 단계 노드(4단계 T1) — 점선 테두리, 제목 고치기 칸, 룰 줄을 놓을 노드 강조. 색은 의미 토큰만 쓴다(한 변 색 바 금지). */
export const TASK_CSS = `
.rsf-node.rsf-task { border-style: dashed; }
.rsf-task-input {
  width: 100%; box-sizing: border-box; padding: 1px var(--spacing-xs); font: inherit; font-weight: 600; color: var(--color-text);
  background: var(--color-bg); border: 1px solid var(--color-primary); border-radius: var(--radius-sm); outline: none;
}
.rsf-node.rsf-node-drop { outline: 2px solid var(--color-primary); outline-offset: 2px; background: var(--color-primary-soft); }
`;
```

`rsf-styles.ts` 에 `import { TASK_CSS } from "./styles/task";` 와 배열 끝 `TASK_CSS`. `styles/drag.ts` 에 `.rsf-rule-used { grid-row: 2; grid-column: 2; justify-self: end; }` 한 줄. `styles/base.ts` 의 `/* 룰 찾기 */` 절 다섯 줄을 지운다.

- [ ] **Step 6: 구현 — 편집 동작·패널·page, 룰 찾기 창 지우기**

`state/useEditActions.ts`:
- import 에서 `replaceRule` 을 빼고 `assignRule`·`insertTask` 를 더한다.
- `RuleModalPurpose` 타입과 주석, `EditActionsDeps.openRuleModal`, 구조 분해의 `openRuleModal`, `askRule` 콜백, `insertPickedRule`, `applyReplace`(와 `EditActions` 의 두 선언·반환 객체 두 줄)를 지운다. 머리 주석의 「룰 넣기」 설명을 「팔레트 [룰]·[+] 「룰 넣기」 는 빈 단계를 끼우고 「룰 지정」 섹션을 연다(4단계 T1)」로 바꾼다.
- `insertAt` 아래에:

```ts
  /** 빈 단계를 끼우고(4단계 T1 — 팔레트 [룰]·[+] 「룰 넣기」) 그 노드를 고른 채 오른쪽 「룰 지정」 섹션을 펴 찾기 칸에 초점을 둔다. */
  const placeTask = useCallback(
    (edgeId: string | null) => {
      const id = insertAt(edgeId, 1, (f, e) => insertTask(f, e));
      if (id) openRuleAssign(id);
    },
    [insertAt, openRuleAssign],
  );
  /** 룰 지정(4단계 T1) — 빈 단계는 룰 노드가 되고 룰 노드는 룰만 바뀐다. IO 를 먼저 룰 맵에 넣고 편집 한 번(되돌리기 한 칸). */
  const assignRuleTo = useCallback(
    (nodeId: string, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      edit((f) => assignRule(f, nodeId, io.ruleId));
    },
    [editing, addRuleIo, edit],
  );
```

- `pickPalette` 의 `if (item === "rule") askRule(selectedEdgeId);` → `if (item === "rule") placeTask(selectedEdgeId);`, `dropPalette` 의 `if (item === "rule") askRule(edgeId);` → `if (item === "rule") placeTask(edgeId);`, `actions.pickRuleFor` 의 `askRule(edgeId)` → `placeTask(edgeId)`. 각 deps 배열의 `askRule` 을 `placeTask` 로 바꾼다. 노드 상한 문구는 `insertAt` 이 낸다(팝업 전 사전 검사가 없어도 같다).
- `EditActions` 에 `/** 룰 지정 — [지정]·두 번 누르기·노드 위 끌어 놓기(4단계 T1). */ assignRule(nodeId: string, io: RuleIo): void;` 를 더하고 반환 객체에 `assignRule: assignRuleTo,` 를 넣는다.

`panels/SidePanel.tsx`: `ASSIGNABLE_KINDS` 를 `new Set(["RULE", "TASK"])` 로 바꾸고 주석의 「Task 9 가 "TASK" 를 더한다」를 「빈 단계(TASK)·룰(RULE)」로 고친다. `SidePanelProps` 에 `/** 흐름에 이미 있는 룰 — 룰 줄 「사용 중」 배지. */ usedRuleIds: ReadonlySet<string>;` 를 더하고 `<RulePanel … usedRuleIds={p.usedRuleIds} />` 로 넘긴다.
`canvas/RulePanel.tsx`: `RulePanelProps` 에 `/** 흐름에 이미 있는 룰 — 줄에 「사용 중」 배지(4단계 Task 9, 지운 룰 찾기 창의 표시를 옮김). 막지는 않는다. */ usedRuleIds?: ReadonlySet<string>;` 를 더하고, 줄의 `rsf-rule-row-kind` 다음에 `{usedRuleIds?.has(r.ruleId) && (<span className="rsf-rule-used" data-testid={`flow-rule-used-${r.ruleId}`} style={badgeStyle("warning")}>사용 중</span>)}` 를 넣는다(`import { badgeStyle } from "@/shell";`).
`panels/PanelHeader.tsx`: `return { kind: n.kind as PanelKind, id: n.id, name: n.label ?? n.id };` 를 `return { kind: n.kind as PanelKind, id: n.id, name: n.label ?? (n.kind === "TASK" ? TASK_LABEL : n.id) };` 로 바꾼다(`import { TASK_LABEL, type EditFlow } from "../flow-edit";`).
`panels/PropertyPanel.tsx`: `KIND_TEXT` 의 TASK(SEAM)를 `"빈 단계 — 실행 때 그냥 지나간다"` 로 채우고, `SplitProps` 위에:

```tsx
/** 빈 단계(4단계 T1) — 제목·노드 ID·설명·검사 문구·[지우기]. 룰은 위 「룰 지정」 섹션에서 고른다. */
function TaskProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { checks, editable, onEdit, sections } = props;
  return (
    <div className="rsf-panel" data-testid="flow-prop-task">
      <Section kind="TASK" id="task-basic" title="빈 단계" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>제목</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-task-title"
                  value={node.label ?? ""}
                  placeholder={TASK_LABEL}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>노드 ID</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{node.id}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note">
          실행 때 아무것도 읽거나 만들지 않고 지나간다(디버거는 한 단계로 멈춘다). 「룰 지정」 에서 룰을 고르면 같은 자리의 룰 노드가 된다
        </p>
        <CheckLines checks={checks.filter((c) => c.nodeId === node.id)} />
        {editable && (
          <div className="rsf-panel-actions">
            <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />
          </div>
        )}
      </Section>
    </div>
  );
}
```

  `PropertyPanel` 본문의 `if (node.kind === "RULE") return <RuleProps …/>;` 앞에 `if (node.kind === "TASK") return <TaskProps node={node} props={props} />;` 를 넣는다(import 에 `TASK_LABEL`).

`page.tsx`:
1. `import { RuleSearchModal } from "./canvas/RuleSearchModal";` 와 `type RuleModalPurpose` import 를 지운다. `flow-edit` import 에 `updateNodeLabel` 을 더한다.
2. `ruleModal` 상태와 주석, `onPickRule`, `useEditActions` 인자 `openRuleModal: setRuleModal,`, 맨 아래 `<RuleSearchModal … />` 줄을 지운다.
3. `onAssignRule` 을 `useCallback((nodeId: string, io: RuleIo) => editActions.assignRule(nodeId, io), [editActions])` 로 바꾸고 주석을 「[지정]·두 번 누르기(룰 지정) — 빈 단계는 룰 노드가 되고 룰 노드는 룰만 바뀐다(4단계 T1)」로 고친다. 그 아래에:

```ts
  /** 룰 줄을 빈 단계·룰 노드 위에 놓음(4단계 T1) — 찾을 때 룰 맵에 넣은 IO 로 지정한다. */
  const onAssignDrop = useCallback(
    (nodeId: string, ruleId: string) => {
      const io = state.rules[ruleId];
      if (io) editActions.assignRule(nodeId, io);
    },
    [state.rules, editActions],
  );
  /** 빈 단계 제목 두 번 눌러 고치기(4단계 T1) — 편집 한 번. */
  const onRenameTask = useCallback(
    (nodeId: string, label: string | null) => editing && edit((f) => updateNodeLabel(f, nodeId, label)),
    [editing, edit],
  );
```

4. `<FlowCanvas …>` 에 `onAssignDrop={onAssignDrop}` 와 `onRenameTask={onRenameTask}` 를 `onDropRule` 다음에 더한다. `<SidePanel …>` 에 `usedRuleIds={usedRuleIds}` 를 더한다(`usedRuleIds` 계산은 그대로 둔다).
5. `/usr/bin/git rm src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/RuleSearchModal.tsx`.

- [ ] **Step 7: 통과 확인**
  - `grep -rn "SEAM(T9)" src/frontend/m-mdm src/backend` → 0건. `grep -rn "RuleSearchModal\|openRuleModal\|RuleModalPurpose\|flow-rule-search-\|flow-rule-cand" src/frontend/m-mdm src/frontend/e2e` → 0건(Step 8 뒤 e2e 포함).
  - `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS(새 두 파일, `rule-set-corpus.test.ts`, `flow-model.test.ts`, `set-model.test.ts`, `trace-view.test.ts` 포함).
  - `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 오류 0. tsc 가 `Block` 에 `TaskStep` 을 더한 뒤 else 갈래에서 알리는 곳이 위 세 곳(`flow-model.ts` walk·`set-model.ts` walk·`trace-view.ts` scopePaths) 밖에도 있으면 모두 같은 규칙(빈 단계는 읽거나 만들지 않고 자리만 차지한다)으로 채운다.
  - audit 두 개(바꾼 파일만) → 0건.
  - 완료 게이트: `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 의 `[m-mdm test 합계]` 줄.

- [ ] **Step 8: 기능설계서·e2e**
  - 기능설계서 §3.2 노드 표에 빈 단계 줄 — 「빈 단계(TASK, `data-kind="TASK"`) | 점선 테두리, 제목만(`flow-task-title-{id}`, 기본 「빈 단계」). 편집 모드에서 제목을 두 번 눌러 고친다(`flow-task-title-input-{id}` — Enter·칸 밖 = 저장, Esc = 취소, 되돌리기 한 칸). 실행 때 아무것도 읽거나 만들지 않고 지나가며 디버거는 한 단계로 멈춘다(중단점 가능). 노드 ID 는 룰과 같은 r 접두어」. §5.1 B-009 를 「[룰] 은 룰 찾기 창 없이 빈 단계를 놓고(누르기 = 고른 선, 없으면 END 앞 선 / 끌어 놓기 = 놓은 선) 그 노드를 고른 채 오른쪽 「룰 지정」 섹션을 펴 찾기 칸에 초점을 둔다」로, B-021 끝에 「「룰 지정」(빈 단계·룰 노드를 고름)에서 [지정]·두 번 누르기, 또는 줄을 빈 단계·룰 노드 위에 끌어 놓으면 룰을 지정한다 — 빈 단계는 같은 ID·자리·선·경로의 룰 노드가 되고, 룰 노드는 룰만 바뀐다. 되돌리기 한 번. 흐름에 이미 있는 룰은 줄에 「사용 중」(`flow-rule-used-{id}`) — 막지는 않는다」를 더한다. D-004 행(룰 찾기 팝업)은 지우고 「D-004 | — | 룰 지정 | 오른쪽 「룰 지정」 섹션의 찾기 칸(`flow-rule-panel-search`) + [지정] | … 」 로 바꾼다. §5.3 「팔레트로 끼우기」 의 「[룰]은 룰 찾기 팝업에서 고른 룰을」을 「[룰]은 빈 단계를」로, 「팔레트·룰 목록 끌어 놓기」 끝에 「룰 줄을 빈 단계·룰 노드 상자 위에 놓으면 선 끼우기 대신 그 노드에 룰을 지정한다(끄는 동안 그 노드를 강조하고 선 강조는 없다)」를 더한다. §5.5 에 「빈 단계 | 룰 지정…(`rule-assign`)·복사·복제·삭제 | 편집」 줄. 디버그 절에 「빈 단계는 한 단계로 멈추고 지나간다. 변수 패널은 바뀌지 않는다(갈래 안이면 그 갈래 범위 값). 값 표에 열이 없다」.
  - `src/frontend/e2e/mdm-ruleSetEdit.spec.ts` `addRule` 을 바꾼다(주석 포함):

```ts
/**
 * 도구 상자 [룰] → 고른 선(없으면 END 앞 선)에 빈 단계가 놓이고 오른쪽 「룰 지정」 섹션의 찾기 칸에 초점이 간다 → 찾아 [지정].
 * 빈 단계는 같은 ID(r 접두어)의 룰 노드가 된다 — 끼운 순서대로 r(N+1)… 이다.
 */
async function addRule(page: Page, keyword: string, ruleIds: string[]) {
  for (const id of ruleIds) {
    await page.getByTestId("flow-add-rule").click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("빈 단계");
    await page.getByTestId("flow-rule-panel-search").fill(keyword);
    await page.getByTestId("flow-rule-panel-find").click();
    await page.getByTestId(`flow-rule-assign-${id}`).click();
    await expect(page.getByTestId("flow-panel-kind")).toHaveText("룰");
  }
}
```

    E4·E5 의 `expectRuleNode(page, "r2"/"r3", …)`·`expectChain` 은 그대로 맞는다(빈 단계 ID 가 r 접두어). 파일 머리 주석 E3 줄 뒤에 「빈 단계를 놓고 「룰 지정」 으로 룰을 고른다(4단계)」를 더한다.
  - `src/frontend/e2e/mdm-user/dme.user.ts`:
    - 1721~1725행(「같은 룰을 다시 찾으면 후보에 "사용 중" 이 붙는다…」): 팔레트·팝업 대신 룰 목록으로 본다 — `await tid(page, "flow-rule-panel-search").fill(SA); await tid(page, "flow-rule-panel-find").click(); await expect(tid(page, `flow-rule-used-${SA}`)).toHaveText("사용 중", { timeout: 20_000 });` 로 바꾸고 모달 닫기 줄을 지운다. 뒤의 `expect.poll(setOrder).toEqual([SB, SA])` 는 그대로(흐름을 바꾸지 않는다). 주석을 「같은 룰을 룰 목록에서 찾으면 줄에 "사용 중" 이 붙는다(막지는 않는다)」로 고친다.
    - `addRuleToFlow`(2305행 근처)를 위 `addRule` 과 같은 순서(`flow-add-rule` → `flow-panel-kind` 「빈 단계」 → `flow-rule-panel-search`·`-find` → `flow-rule-assign-${id}`)로 바꾸고 주석을 「도구 상자 [룰] → 빈 단계 → 「룰 지정」 에서 [지정]. 고른 선이 없으면 END 앞 선이고 지정한 룰 박스가 선택된 채다」로 고친다.
    - 버튼 전수 확인: 편집 모드에서 확인하는 곳이 있으면 `flow-rule-assign-*` 는 `dynamicAllow("flow-rule-assign-", "룰 지정 단추 — 하나는 addRuleToFlow 가 눌렀다")` 로 허용한다(보기·디버그 모드 확인에는 보이지 않는다).
  - `src/frontend/e2e/mdm-user/TEST-CASES.md`: TC-DME-SED-02 문구의 「이미 담은 룰은 사용 중으로 표시된다」 는 그대로 두고, 378행 메모 끝에 「4단계(2026-10-01): 룰 찾기 팝업을 지우고 도구 상자 [룰] 이 빈 단계를 놓은 뒤 오른쪽 「룰 지정」 섹션에서 고르게 바뀌었다. 「사용 중」 은 룰 목록 줄 배지로 본다」를 더한다.
  - 목록 확인(실행 금지): `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` · `pnpm --dir src/frontend exec playwright test -c playwright.mdm-user.config.ts --list` → 오류 없음.

- [ ] **Step 9: 커밋** — Files 의 경로만 add(지운 파일은 Step 6 의 `git rm`)·commit. 요약 `feat(m-mdm): 룰 세트 빈 단계 노드·룰 지정(섹션·끌어 놓기·우클릭)·룰 찾기 창 삭제`.

---

#### Task 7~9 — Review Focus 후보(작성자)

1. **Task 7 기본 도구가 모드마다 다르다** — 보기·디버그 = [손], 편집 = [영역 선택], Esc 는 모드의 기본 도구로 돌린다. 스펙의 「[영역 선택](기본, 지금 동작)」·「Esc 는 [영역 선택] 으로」와 글자가 다르므로 편차 후보 1 과 함께 본다.
2. **Task 7 FlowCanvas 범위** — `dragTool` prop·`hand` 한 줄·`data-drag-tool`·`selectionOnDrag`/`panOnDrag` 두 줄·미니맵 한 줄 밖을 건드리지 않았는지(Task 5·6 과 병합 충돌 최소). 도구 상자는 page 가 캔버스 감싸개 안에 그리므로 캔버스 루트의 포인터 캡처(공간 넓히기)·끌어 놓기와 섞이지 않는지.
3. **Task 7 중간 상태** — 병합 뒤 Task 8 전까지 룰 목록이 오른쪽 패널 아래에서 3단계 동작 그대로 도는지(`flow-drag.test.ts` 룰 목록 사례·e2e `flow-rule-panel-*`).
4. **Task 8 룰 목록 두 번 누르기 뒤 선택** — 끼운 뒤 새 노드가 아니라 **새 노드에서 나가는 선**을 고른다(`insertAt(…, "out")`). 새 룰을 고르면 섹션이 「룰 지정」 으로 바뀌어 다음 두 번 누르기가 끼우기가 아니라 바꾸기가 되기 때문이다. 팔레트·끌어 놓기는 3단계처럼 새 노드를 고른다.
5. **Task 8 「룰 지정」 섹션 펼침** — 기본 펼침이고 종류별 기억을 따른다(사용자가 룰 노드에서 접으면 다음 룰 노드도 접힌 채). 빈 단계를 놓거나 [룰 지정…]·[룰 바꾸기…] 로 열 때만 강제로 편다. 스펙 「맨 위로 올라오고 펼쳐지며」를 이렇게 읽었다.
6. **Task 8 `assignSignal` 초점** — 신호 렌더에서 펴고 다음 커밋에서 초점을 두는 두 effect 가 섹션이 이미 펴져 있을 때·접혀 있을 때 모두 칸에 초점을 주는지(`side-panel.test.ts` 마지막 사례, `task-page.test.ts` 첫 사례). 우클릭 메뉴에서 부를 때 `ContextMenu` 의 닫힘 초점 되돌리기(패시브 정리)보다 SidePanel 의 초점 effect 가 뒤에 도는지 — 브라우저에서도 한 번 본다.
7. **Task 8 선 고름 = 「연결선」 머리글 + 룰 목록만** — 3단계는 선을 골라도 세트 패널을 보였다. 선을 고른 채 세트명·설명을 고치던 흐름이 있었는지.
8. **Task 9 흐름 모델 짝** — `flow-model.ts` 의 `TaskStep`·순번 규칙이 Task 2 의 Java `FlowTree` 와 같은지, `set-model.ts` 의 빈 단계 경고가 Task 3 `RuleSetAnalyzer` 와 코드·문구·순서가 같은지(`rule-set-corpus.test.ts`).
9. **Task 9 룰 지정의 되돌리기 한 칸** — `assignRuleTo` 가 `addRuleIo` 뒤 `edit` 한 번만 부르는지, 지정 뒤 노드 ID·`view.positions`·`routes`·`labels`·선 배열이 그대로인지.
10. **Task 9 노드 위 끌어 놓기 우선순위** — 룰 줄을 빈 단계·**룰** 노드 상자 위에 놓으면 선 끼우기보다 지정이 이긴다(룰 노드 위면 룰이 바뀐다). 끄는 동안 노드 강조·선 강조가 둘 다 뜨지 않는지.
11. **Task 9 제목 두 번 누르기** — `nopan` 으로 React Flow 두 번 누르기 확대가 막히는지는 happy-dom 에서 볼 수 없다(d3-zoom 이 돌지 않는다). 수동 브라우저 확인 항목.
12. **Task 9 memo 의존성** — `nodes` memo 에 `dropNode`·`onRenameTask` 를 더했고, `onRenameTask` 하나만 바꾼 시험이 있다(Local-Rules §19). `dropNode` 는 끄는 동안 노드가 바뀔 때만 상태가 바뀌어 page 를 다시 그리지 않는지.

#### Task 7~9 — 편차(작성자 결정, 진행 장부에 Ruling 으로 옮긴다) (스펙 | 이 계획 | 이유)

| # | 스펙 | 이 계획 | 이유 |
|---|---|---|---|
| 1 | §1.3 「[영역 선택] … (기본, 지금 동작)」, 「Esc 는 [영역 선택] 으로 돌아간다」 | 기본 도구는 모드별 — 편집 [영역 선택], 보기·디버그 [손]. Esc 는 그 모드의 기본 도구로 | 3단계 보기·디버그의 「지금 동작」은 끌기 = 화면 이동이다(`space-canvas.test.ts` 「보기·디버그 모드 — 지금 동작 그대로」). 보기 모드 기본을 영역 선택으로 하면 끌기·휠 동작이 바뀐다. 편집 모드는 스펙 그대로다 |
| 2 | 지시 「섹션은 Mantine 구성요소(스킬 규칙 안에서)」, §1.3 「툴팁」 | 섹션은 `button aria-expanded` + 조건부 본문, 툴팁은 `data-tip` CSS. 도구 상자·섹션 머리는 shared `Button` 이 아니라 원시 `<button>` | 화면은 `@mantine/*` 를 import 하지 않고(스킬 §3), shared 에 Accordion·Tooltip 래퍼가 없다. 래퍼를 더하려면 Part B §17 에 따라 사용자 승인이 필요하다 — 승인되면 shared 래퍼로 바꿀 수 있게 `Section`·`FlowToolbox` 한 곳에 모았다. 36px 아이콘 정사각형을 shared `Button` 으로 만들려면 래퍼 모양을 화면 CSS 로 덮어야 하는데 스킬 §3 이 금한다. 캔버스 안 조작 단추는 이미 원시 단추다(`rsf-open`·`rsf-bp`·`rsf-check`·3단계 `rsf-rule-list-head`) |
| 3 | §1.2 「제목은 두 번 눌러 고친다(메모 제목과 같은 방식)」 | 조건식 즉석 편집(B10)과 같은 두 번 누르기 → 입력 칸(Enter 저장·Esc 취소), 속성 섹션의 제목 칸도 둔다 | 메모에는 제목이 없고 글 칸이 편집 모드에서 늘 열려 있다. 캔버스에서 두 번 눌러 고치는 기존 방식은 B10 뿐이다 |
| 4 | §1.3 「두 번 누르기는 고른 선(없으면 END 앞 선)에 끼운다」 | 같고, 끼운 뒤 새 노드에서 나가는 선을 고른다 | 새 룰 노드를 고르면 섹션이 「룰 지정」 으로 바뀌어 다음 두 번 누르기가 끼우기 대신 바꾸기가 된다. 3단계의 「고른 선이 없으면 『넣을 선을 먼저 고른다』」 는 스펙대로 없앤다 |
| 5 | §1.2 룰 찾기 창을 지운다 | 지우고, 창의 「사용 중」 배지를 룰 목록 줄로 옮긴다 | 기능 보존 — `dme.user.ts` 가 「사용 중」 을 확인한다 |
| 6 | §1.1 빈 단계 노드(ID 규칙 없음) | 빈 단계 노드 ID 는 룰과 같은 `r` 접두어 | 지정해도 ID 가 그대로여야 하는데(§1.2), 새 접두어면 지정 뒤 룰 노드가 `t1` 같은 ID 를 갖고 한 줄 흐름 `r1…rN` 규칙·e2e `expectChain` 이 어긋난다. 종류는 ID 가 아니라 `kind` 로 판단한다(ID 접두어로 종류를 읽는 코드는 없다 — grep 확인) |
| 7 | §1.3 섹션 목록 「지금 속성·세트 패널의 소제목 단위」 | 선을 고르면 속성 섹션 없이 「룰 목록」 섹션만 | 3단계에는 선 속성 패널이 없었다(세트 패널을 보였다). 머리글 종류에 「연결선」 이 있어 세트 섹션을 그대로 보이면 머리글과 내용이 어긋난다 |
| 8 | §1.2 룰 줄을 「빈 단계 노드 위에」 놓으면 지정, 「이미 룰이 있는 RULE 노드도 같은 방법으로 룰을 바꾼다」 | 룰 노드 위에 놓아도 지정(바꾸기)이 선 끼우기보다 이긴다 | 「같은 방법」 을 끌어 놓기까지로 읽었다. 룰 노드 상자 안이 아니면(선 근처 빈 곳) 3단계 끼우기 그대로다 |

#### Task 7~9 — 작성자 메모

- `RulePanel.tsx`·`FlowPalette.tsx` 는 지우지 않고 바꿔 쓴다(프로그램 삭제는 사용자 확인 대상 — 메모리 규칙). 지우는 파일은 스펙이 승인한 `RuleSearchModal.tsx` 하나다.
- `debugger/debug-model.ts` 는 grep 해 보니 노드 종류로 갈리는 곳이 없어 TASK 에 고칠 것이 없다. 종류로 갈리는 디버거 자리는 `trace-view.ts`(`scopePaths`·`frames`·`chipOf`·`valueTable` — TASK 는 결과가 없어 뒤 셋은 그대로 맞다)·`TraceDetail.tsx`·`useSimulation.ts`(`BREAKABLE`)이고 Task 9 가 고친다.
- 왼쪽 칸을 보기·편집 모드에서 없애도 저장된 분할 크기는 문제없다 — `split-sizing.ts` 의 `computeResize` 는 px 쪽(왼쪽 280·오른쪽 360)만 적고 가운데 캔버스(`flex 1 1 0`)는 grow 로 남으므로, 3단계에서 끈 너비가 있어도 캔버스가 줄을 채운다. 저장 키를 바꾸지 않는다.
- 도구 상자 testid 는 `flow-space-tool`(3단계 이름)을 그대로 두고 새 도구만 `flow-tool-hand`·`flow-tool-select` 로 지었다 — `space-canvas.test.ts` 의 여러 사례와 기능설계서 B-028 을 덜 고치려고. 이름을 맞추려면 Task 7 에서 한꺼번에 바꾼다.
- happy-dom 에서 화면 좌표 = 흐름 좌표라는 가정(끌어 놓기 시험)은 `flow-drag.test.ts` 사례 4 가 이미 쓰는 가정이다. Task 9 의 노드 위 놓기 시험은 모든 노드 위치를 고정(`setPositions(positionsOf)`)해 그린 자리를 확정한다.
- Task 1 이 `// SEAM(T9)` 를 정확히 어디에 두는지는 확인하지 못했다(조각 00 에 Task 1 본문이 없다). 예상 자리: `flow-layout.ts` `NODE_SIZE`, `flow-model.ts` `IN_DEGREE`·`OUT_DEGREE`, `panels/PropertyPanel.tsx` `KIND_TEXT`, `debugger/TraceDetail.tsx` `KIND_TEXT`. Task 9 Step 0 이 grep 으로 확정한다. `NodeTrace.kind` 가 `FlowNodeKind` 를 그대로 쓰는지(TASK 포함)도 Task 1 결과로 확인해야 한다.
- Task 2·3 의 Java 결과(TASK 블록 이름, 순번, 빈 단계 경고의 자리·코드·문구, TASK 만 있는 흐름의 EMPTY)를 읽지 못한 채 썼다. Task 9 Step 0 이 먼저 읽고 맞춘다. Task 3 가 Task 9 보다 늦게 병합되면 `set-model.ts` 경고 짝 맞추기가 남는다(Task 9 보고서에 적게 했다).
- `RunTrace` 에 Task 1 이 `edits` 를 더하면 필수·선택 여부를 몰라 시험의 기록 객체는 `as unknown as RunTrace` 로 만든다.
- 기능설계서 §5.1 새 행 번호(B-029 이후)는 다른 태스크(10·11 등)도 더할 수 있어 「병합 때 다음 번호」로 적었다. 나중에 병합하는 쪽이 다시 매긴다.
- `dme.user.ts` 의 버튼 전수 확인 자리(1917·1942행)가 어느 모드에서 도는지는 줄 번호로만 확인했다. 도구 단추를 누르는 자리의 모드는 구현자가 그 자리에서 확인해 기본 도구로 끝나게 한다(Task 7 Step 8).
- e2e 는 `--list` 까지만 돌린다. 도구 상자 툴팁 위치·섹션 모양·빈 단계 점선·두 번 누르기 확대 막힘은 계획 끝 「수동 브라우저 확인」 에 넣어야 한다(컨트롤러 몫).

---

### Task 10: 디버거 모델·시뮬 훅 — 고친 값 반영(`frames`·`variablesAt`·`debugStatus`)·고침 대기(`useSimulation`)·`editsJson`

**모델:** opus — 엔진 퍼짐 규칙을 화면 프레임에 똑같이 옮기고, 고침 대기·쌓기·버리기·지우기가 `needsFresh`·늦은 응답 버리기(Local-Rules §11)와 얽힌 상태 모델이다.

**흐름:** F2. 먼저 병합돼야 할 태스크: 1(계약).

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts` — `TraceFrame`(:17)에 `edited`, 새 `validEdits`, `frames`(:109-167) 안 edit 적용, `debugOverlay`(:213-239) 고친 지점 표시
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts`(:8) — `NodeOverlay.edited?`(타입만)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts` — `DebugVar`(:12-17), `variablesAt`(:41-65), `debugStatus`(:110-120), 새 순수 함수·문구
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts` — import(:17-26), `Simulation`(:53-108), `Rec`(:132-139), `running`(:200), 세트·흐름 효과(:239-270), 입력 setter(:295-344), `fresh`(:360-398), `move`(:401-411), 동작(:413-460), 변수(:472-475), 반환(:477-509)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts` — `simulate`(:66-69)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts`(손 기록 describe 끝에 사례 추가), `debug-model.test.ts`(:110 한 줄 고침 + 새 describe), `use-simulation.test.ts`(새 describe)

**Interfaces:**
- Consumes:
  - Task 1 생성 TS(`@/contract/engine-contract.generated`): `RunTrace.edits?: TraceEdit[] | null`, `TraceEdit = { beforeSeq: number; nodeId: string; values: { [name: string]: TypedValue } }`, `FlowNodeKind` 의 `"TASK"`.
  - Task 3 서버 계약: `execute` 요청 칸 `editsJson`(문자열). JSON 배열 `[{"beforeSeq":n,"nodeId":"…","values":{"이름":값}}]` 이고, **값 한 개의 모양은 `recordJson` 이 값을 싣는 모양과 같다** — 곧 JSON 원형 값(`null`·숫자·불린·글자)이다. 근거: 폼 경로 `ruleEdit/value-test/case-form.ts:72-76` `inputJsonOf` 는 글자·`null` 만 싣고, JSON 칸 경로 `useSimulation.ts:170-174` `inputOf`(→ `debugger/InputForm.tsx:24-32` `loadExactInput`)는 붙여 넣은 원문(숫자·불린 포함)을 그대로 보낸다. 서버는 둘 다 `RuleCaseJudge.object`(`INPUT` = `USE_BIG_DECIMAL_FOR_FLOATS`, `RuleCaseJudge.java:30·48-58`)로 풀고, 기록의 값은 `RunTraceJson.typed`(:146-170)가 TypedValue 로 바꾼다. **그러므로 Task 3 은 `editsJson` 의 `values` 도 같은 `INPUT` 매퍼로 풀어야 한다**(아니면 `2.50` 이 double `2.5` 가 되어 되돌려 준 edits 의 값·타입이 화면이 보낸 것과 어긋난다). 서버는 받은 edit 를 `trace.edits` 로 그대로 되돌려 준다(스펙 §2.3).
- Produces(Task 11 이 그대로 쓴다):

```ts
// trace-view.ts
export interface TraceFrame { index: number; node: NodeTrace; before: Record<string, TypedValue>; ctx: Record<string, TypedValue>; changed: string[]; edited: string[]; }
export function validEdits(trace: RunTrace): TraceEdit[];   // beforeSeq 자리 노드 ID 가 edit.nodeId 와 같은 edit 만(기록 순서)
// debugOverlay 는 validEdits 의 nodeId 노드 겹침에 edited: true 를 더한다(없으면 키를 두지 않는다)

// canvas/overlay.ts
export interface NodeOverlay { state: NodeState; seq: number | null; chip: string | null; edited?: boolean; }

// debugger/debug-model.ts
export interface DebugVar { name: string; value: TypedValue; created: boolean; changed: boolean; edited: boolean; pending?: boolean; }
export type EditKind = "NUMBER" | "STRING" | "BOOLEAN";
export type EditParse = { value: TypedValue } | { error: string };
export const NULL_VALUE: TypedValue;                               // { type: "NULL" }
export const NUMBER_REJECT = "숫자가 아니다 — 값을 고치지 않았다";
export const BOOLEAN_REJECT = "true 나 false 만 쓴다 — 값을 고치지 않았다";
export const LIST_REJECT = "목록 값은 비우기만 한다";
export const EDITED_EXPECTED_TITLE = "고친 값으로 나온 결과라 기대값으로 쓸 수 없다";
export function droppedEditsNotice(n: number): string;             // "뒤에서 고친 값 N건을 지웠다"
export function pendingDroppedNotice(n: number): string;           // "자리를 옮겨 고침 대기 N건을 버렸다"
export function editCount(edits: readonly TraceEdit[]): number;    // 이름 수의 합
export function numberText(text: string): string;                  // "+007.10" → "7.10"(부호 +·앞 0 제거, 소수 글자 보존)
export function parseEditText(kind: EditKind, text: string): EditParse;
export function editKindOf(value: TypedValue, declared: DataType | undefined): EditKind | null;   // LIST 는 null
export function mergeEdits(applied: readonly TraceEdit[], pending: TraceEdit): { edits: TraceEdit[]; dropped: number };
export function editsJsonOf(edits: readonly TraceEdit[]): string;
export function applyPending(vars: DebugVar[], pending: TraceEdit | null): DebugVar[];
export function debugStatus(trace: RunTrace | null, cursor: number, pending?: number): string;   // 끝에 " · 고친 값 N건"·" · 고침 대기 N건"

// debugger/useSimulation.ts — Simulation 에 더하는 멤버
canEditValues: boolean;
pendingEdit: TraceEdit | null;
appliedEdits: readonly TraceEdit[];
editValue(name: string, value: TypedValue): void;
cancelEdit(name?: string): void;

// api.ts
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined, editsJson?: string): Promise<RuleSetSimulateResult>;
```

의미(이 태스크가 정한다):
- **퍼짐 규칙(스펙 §2.2 를 화면에 그대로)**: `frames` 는 노드마다 범위를 고른 뒤, `before` 사본을 뜨기 **전에** 그 노드의 seq 가 `beforeSeq` 이고 nodeId 가 같은 edit 를 적용한다. 값은 그 범위 ctx 에 `putReplacing`(대소문자만 다른 옛 키를 지우고 edit 의 철자로 넣는다)하고, 같은 이름(대소문자 무시)이 그 범위 `made` 에 있으면 `made` 에도 `putReplacing` 한다. 범위는 지금 규칙 그대로다 — PARALLEL 노드는 갈래 범위를 만들기 전 바깥 범위, MERGE 는 합치기 전 바깥 범위, 갈래 안 노드는 갈래 범위다. 그래서 갈래 안에서 고친 입력 변수는 그 갈래 안에서만 보이고(합류 때 갈래 ctx 는 버린다), 갈래 안에서 고친 결과 변수(그 갈래 `made` 에 있는 이름)는 합류로 바깥까지 간다. 값이 `null` 로 오면 `{type:"NULL"}` 으로 넣는다. nodeId 가 다른 edit 는 적용하지 않는다(서버는 이때 `EDIT_POINT_MISMATCH` 로 멈춘다).
- **"고침" 표시가 남는 규칙**: 커서 k 의 변수 줄은, 커서 자리까지 적용된 edit(`beforeSeq ≤ nodes[k].seq`, k ≥ n 이면 모두) 가운데 그 이름(대소문자 무시)을 고친 값이 있고 **지금 값이 그 고친 값과 같으면** `edited` 다. 규칙이 다른 값으로 덮어쓰면 사라지고, 다른 병렬 갈래·합류 뒤에서는 값이 달라 보이지 않는다. 같은 값으로 덮어쓰면 남는다(편차 후보 6).
- **고칠 수 있는 때**: `canEditValues = last && !stale && (지금 입력 == null || sameInput(지금 입력, last.input)) && 0 ≤ cursor < n && !running`. 훅의 `editValue`·`cancelEdit` 도 같은 조건(실행 중은 `runningRef`)으로 막는다 — 화면이 막지 못한 경우에도 요청 중 대기가 바뀌지 않는다.
- **고침 대기**: 커서 자리(노드 k 실행 전) 한 곳에만 있다(`{beforeSeq: nodes[k].seq, nodeId: nodes[k].nodeId, values}`). 같은 이름(대소문자 무시)을 다시 고치면 덮는다. `variables`·`valueAt` 은 대기 값을 덮어 보인다(`applyPending`, 줄에 `pending: true`, 없던 이름은 새 줄).
- **반영(스펙 §2.4)**: 대기가 있고 `needsFresh` 가 아니면 [한 단계]·[계속]·[여기까지]·[끝내기]는 `mergeEdits(validEdits(last.trace), 대기)` 로 보낼 edit 를 만든다 — beforeSeq 가 작은 것은 그대로, 같은 것은 값을 합치고(대기가 이긴다), 큰 것은 버린다. `editsJson` 과 함께 새로 실행하고, 새 기록 위에서 **커서 k 에서** 그 동작을 한다(한 단계 `min(k+1, n')`, 계속 `nextStop(t, k, false)`, 여기까지 `runToIndex(t, k, false)`, 끝내기 `n'`, 결과 커서는 `n'` 을 넘지 않는다). 버린 것이 있으면 알림 `droppedEditsNotice(N)`(N = 버린 edit 의 이름 수 합)을 먼저, [여기까지] 알림이 함께면 `" · "` 로 잇는다.
- **지우기**: [처음부터]는 대기를 버리고, 기록에 edit 가 있으면(`trace.edits` 가 비지 않으면) `needsFresh` 가 아니어도 edit 없이 새로 실행해 커서 0 에 둔다. 입력 setter(`setInput`·`setJson`·`setEvalTs`·`importJson`·`loadInput`)·흐름 구조 바뀜(`flowVersion`)·세트 바뀜은 대기를 버린다. 기록의 edit 는 입력·흐름이 바뀐 뒤 다음 동작이 `needsFresh` 로 edit 없이 새로 실행하므로 따로 지우지 않는다. [이전]·`setCursor` 가 커서를 실제로 옮기면 대기를 버리고 `pendingDroppedNotice(N)` 을 보인다.
- **`needsFresh` 와 edit**: 입력 비교는 `DebugInput`(recordJson·evalTs)만 본다. edit 는 입력이 아니므로 edit 를 붙여 받은 기록도 입력이 같으면 낡았다고 보지 않고, 다음 [한 단계] 는 서버를 다시 부르지 않는다. 대기가 있을 때 `needsFresh` 가 참이면(입력·흐름이 바뀜) 대기를 버리고 edit 없이 새로 실행한다 — 대기는 이미 입력 setter·흐름 효과가 지웠으므로 이 경로는 안전망이다. 대기가 새 실행을 일으키는 길은 위 "반영" 하나뿐이고, 그 실행은 기록의 edit 를 합쳐 보내므로 edit 를 지우지 않는다.
- **늦은 응답**: `fresh` 는 지금처럼 요청 순번·세트·flowVersion 으로 늦은 응답을 버린다. 성공하면 보낸 대기 객체와 지금 대기가 **같은 객체일 때만** 대기를 지운다. 실패하면 대기를 남긴다(다시 누를 수 있다).

- [ ] **Step 1: 실패 테스트(프레임)** — `tests/dme/ruleSetEdit/trace-view.test.ts` 첫 import 두 줄을 바꾸고(타입에 `TraceEdit`, 함수에 `debugOverlay`·`validEdits`), 파일 끝에 describe 를 더한다.

```ts
import type { FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TraceEdit, TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugOverlay, frames, overlayAt, typedText, validEdits, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
```

```ts
// ── 4단계 E4 — 고친 값(edits)의 퍼짐 규칙(스펙 §2.2). 엔진 FlowRun 과 같은 규칙이다 ─────────────────────────

/** 골든 기록에 edits 를 붙인 사본(서버가 받은 edit 를 그대로 되돌려 준다 — 스펙 §2.3). 나머지 기록은 바꾸지 않는다. */
const withEdits = (t: RunTrace, edits: TraceEdit[]): RunTrace => ({ ...t, edits });

describe("trace-view — 고친 값 반영(4단계 E4)", () => {
  it("최상위 — 노드 seq 직전에 그 범위 ctx 에 넣는다. before 부터 보이고 edited 에 이름이 남는다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE"); // start(1) r1(2) if1(3) r2(4) m1(5) end(6)
    const fr = frames(withEdits(trace, [{ beforeSeq: 3, nodeId: "if1", values: { GT_G: S("B"), GT_THK: NULL, GT_NEW: N("1") } }]), flow);
    expect(fr[1].ctx).toMatchObject({ GT_G: S("A") }); // r1 실행 뒤는 그대로
    expect(fr[2].before).toMatchObject({ GT_G: S("B"), GT_THK: NULL, GT_NEW: N("1") });
    expect(fr[2].edited).toEqual(["GT_G", "GT_THK", "GT_NEW"]);
    expect(fr[3].before.GT_G).toEqual(S("B"));
    expect(fr[5].ctx.GT_G).toEqual(S("B"));
    expect(fr[1].edited).toEqual([]);
  });

  it("이름은 대소문자 무시로 바꿔 넣는다 — 옛 키를 지우고 edit 의 철자로", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const fr = frames(withEdits(trace, [{ beforeSeq: 3, nodeId: "if1", values: { gt_g: S("B") } }]), flow);
    expect(fr[2].before.gt_g).toEqual(S("B"));
    expect(fr[2].before.GT_G).toBeUndefined();
  });

  it("병렬 — 갈래 안 입력 고침은 그 갈래 안에서만, 갈래 made 에 있는 결과 고침은 합류까지 간다(made 키도 edit 철자로)", () => {
    const { flow, trace } = golden("PARALLEL_MERGE"); // start(1) r1(2) par1(3) [p1: r2(4) rs1(5)] [p2: r3(6) rs2(7)] m1(8) end(9)
    const fr = frames(
      withEdits(trace, [
        { beforeSeq: 5, nodeId: "rs1", values: { gt_f: N("9") } }, // p1 갈래가 만든 GT_F(결과) — made 에 있다
        { beforeSeq: 6, nodeId: "r3", values: { GT_THK: S("30") } }, // p2 갈래 입력 — made 에 없다
      ]),
      flow,
    );
    expect(fr[4].before.gt_f).toEqual(N("9"));
    expect(fr[4].before.GT_THK).toEqual(S("12")); // p1 갈래는 p2 의 입력 고침을 모른다
    expect(fr[5].before.GT_THK).toEqual(S("30"));
    expect(fr[5].before.gt_f).toBeUndefined(); // p2 갈래는 p1 결과를 모른다
    expect(fr[6].ctx.GT_THK).toEqual(S("30"));
    expect(fr[7].ctx.GT_THK).toEqual(S("12")); // 합류 뒤 — 갈래 ctx 는 버린다
    expect(fr[7].ctx.gt_f).toEqual(N("9")); // 갈래 made 를 합친다
    expect(fr[7].ctx.GT_F).toBeUndefined();
    expect(fr[7].changed).not.toContain("GT_THK");
  });

  it("그 자리 노드 ID 가 다른 edit 는 적용하지 않는다(서버는 EDIT_POINT_MISMATCH 로 멈춘다)", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = withEdits(trace, [{ beforeSeq: 3, nodeId: "r2", values: { GT_G: S("B") } }]);
    expect(validEdits(t)).toEqual([]);
    const fr = frames(t, flow);
    expect(fr[2].before.GT_G).toEqual(S("A"));
    expect(fr[2].edited).toEqual([]);
  });

  it("edits 가 없거나 null 이면 지금과 같다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    expect(frames(withEdits(trace, []), flow).map((f) => f.ctx)).toEqual(frames(trace, flow).map((f) => f.ctx));
    expect(frames({ ...trace, edits: null }, flow).map((f) => f.before)).toEqual(frames(trace, flow).map((f) => f.before));
  });

  it("debugOverlay — 고친 지점 노드에 edited, 끝(k = n)에서도. 고치지 않은 노드에는 키가 없다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = withEdits(trace, [{ beforeSeq: 3, nodeId: "if1", values: { GT_G: S("B") } }]);
    expect(debugOverlay(t, flow, 3).nodes.if1).toEqual({ state: "run", seq: 3, chip: null, edited: true });
    expect(debugOverlay(t, flow, 1).nodes.if1).toEqual({ state: "next", seq: null, chip: null, edited: true }); // 아직 안 지난 지점에도
    expect(debugOverlay(t, flow, t.nodes.length).nodes.if1.edited).toBe(true);
    expect("edited" in debugOverlay(t, flow, 3).nodes.r1).toBe(false);
    expect("edited" in debugOverlay(trace, flow, 3).nodes.if1).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 테스트(모델)** — `tests/dme/ruleSetEdit/debug-model.test.ts`:
  - :110 의 `toEqual([{ name: "GT_THK", value: { type: "STRING", value: "12" }, created: false, changed: false }])` 를 `…, created: false, changed: false, edited: false }]` 로 고친다(`DebugVar` 에 `edited` 가 늘었다).
  - import 에 `BOOLEAN_REJECT, NUMBER_REJECT, NULL_VALUE, applyPending, debugStatus, droppedEditsNotice, editCount, editKindOf, editsJsonOf, mergeEdits, numberText, parseEditText, pendingDroppedNotice` 와 타입 `TraceEdit`·`TypedValue`(`../../../src/contract/engine-contract.generated`)를 더하고 파일 끝에 붙인다.

```ts
const STR = (value: string): TypedValue => ({ type: "STRING", value });
const NUM = (value: string): TypedValue => ({ type: "NUMBER", value });
const edit = (beforeSeq: number, nodeId: string, values: Record<string, TypedValue>): TraceEdit => ({ beforeSeq, nodeId, values });

describe("variablesAt — 고친 값(4단계 E4)", () => {
  it("고친 지점과 그 뒤에서 값이 고친 값과 같으면 edited(새·바뀜 아님)", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "if1", { GT_G: STR("B") })] };
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_G")).toEqual({ name: "GT_G", value: STR("B"), created: false, changed: false, edited: true });
    expect(variablesAt(t, flow, 3).find((v) => v.name === "GT_G")?.edited).toBe(true); // 반영 뒤 커서가 k+1 로 가도 보인다
    expect(variablesAt(t, flow, t.nodes.length).find((v) => v.name === "GT_G")?.edited).toBe(true);
    expect(variablesAt(t, flow, 1).find((v) => v.name === "GT_G")).toBeUndefined(); // 고친 자리 앞
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_THK")?.edited).toBe(false);
  });

  it("규칙이 다른 값으로 덮어쓰면 edited 가 사라진다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(2, "r1", { GT_G: STR("Z") })] }; // r1 직전에 GT_G=Z, r1 이 A 로 덮는다
    expect(variablesAt(t, flow, 1).find((v) => v.name === "GT_G")).toMatchObject({ value: STR("Z"), edited: true });
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_G")).toMatchObject({ value: STR("A"), edited: false, changed: true });
  });

  it("노드 ID 가 어긋난 edit 는 표시하지 않는다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "r2", { GT_G: STR("A") })] };
    expect(variablesAt(t, flow, 3).find((v) => v.name === "GT_G")?.edited).toBe(false);
  });
});

describe("고침 대기·쌓기·보내기 모양(4단계 E4)", () => {
  it("applyPending — 있는 줄은 값을 덮고 pending, 없는 이름은 새 줄, 이름 순", () => {
    const vars = [
      { name: "A", value: STR("1"), created: false, changed: false, edited: false },
      { name: "C", value: STR("3"), created: true, changed: false, edited: false },
    ];
    expect(applyPending(vars, null)).toBe(vars);
    expect(applyPending(vars, edit(2, "r1", { c: NULL_VALUE, B: NUM("2") }))).toEqual([
      { name: "A", value: STR("1"), created: false, changed: false, edited: false },
      { name: "B", value: NUM("2"), created: false, changed: false, edited: false, pending: true },
      { name: "C", value: NULL_VALUE, created: true, changed: false, edited: false, pending: true },
    ]);
  });

  it("mergeEdits — 앞 지점은 그대로, 같은 지점은 합치고(대소문자 무시로 대기가 이긴다), 뒤 지점은 버리고 이름 수를 센다", () => {
    const applied = [edit(2, "r1", { A: STR("a") }), edit(3, "if1", { B: STR("b"), X: STR("x") }), edit(5, "m1", { C: STR("c"), D: STR("d") })];
    expect(mergeEdits(applied, edit(3, "if1", { b: STR("B2"), E: STR("e") }))).toEqual({
      edits: [edit(2, "r1", { A: STR("a") }), edit(3, "if1", { X: STR("x"), b: STR("B2"), E: STR("e") })],
      dropped: 2,
    });
    expect(mergeEdits([], edit(4, "r2", { A: STR("a") }))).toEqual({ edits: [edit(4, "r2", { A: STR("a") })], dropped: 0 });
    expect(editCount(applied)).toBe(5);
    expect(droppedEditsNotice(2)).toBe("뒤에서 고친 값 2건을 지웠다");
    expect(pendingDroppedNotice(1)).toBe("자리를 옮겨 고침 대기 1건을 버렸다");
  });

  it("editsJsonOf — recordJson 과 같은 원형 값: NUMBER 는 글자 그대로의 숫자(1.10 보존), BOOLEAN 은 불린, NULL 은 null, 글자는 따옴표", () => {
    const json = editsJsonOf([
      edit(3, "if1", { GT_F: NUM("2.50"), S: STR('a"b'), B: { type: "BOOLEAN", value: "true" }, N: NULL_VALUE, P: NUM("+007.10") }),
      edit(5, "m1", { L: { type: "LIST", items: [NUM("1"), STR("x")] } }),
    ]);
    expect(json).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_F":2.50,"S":"a\\"b","B":true,"N":null,"P":7.10}},{"beforeSeq":5,"nodeId":"m1","values":{"L":[1,"x"]}}]');
    expect(() => JSON.parse(json)).not.toThrow();
    expect(editsJsonOf([])).toBe("[]");
  });

  it("numberText — 부호 + 와 앞 0 을 떼고 소수 글자는 그대로", () => {
    expect(numberText("+007.10")).toBe("7.10");
    expect(numberText("000")).toBe("0");
    expect(numberText("-0012")).toBe("-12");
    expect(numberText("0.50")).toBe("0.50");
  });

  it("parseEditText·editKindOf — 원래 타입에 맞지 않으면 거절, NULL 줄은 선언 타입, LIST 는 고칠 수 없다", () => {
    expect(parseEditText("NUMBER", " 12.30 ")).toEqual({ value: NUM("12.30") });
    expect(parseEditText("NUMBER", "1e3")).toEqual({ error: NUMBER_REJECT });
    expect(parseEditText("NUMBER", "")).toEqual({ error: NUMBER_REJECT });
    expect(parseEditText("BOOLEAN", "TRUE")).toEqual({ value: { type: "BOOLEAN", value: "true" } });
    expect(parseEditText("BOOLEAN", "예")).toEqual({ error: BOOLEAN_REJECT });
    expect(parseEditText("STRING", " a ")).toEqual({ value: STR(" a ") });
    expect(editKindOf(NUM("1"), "STRING")).toBe("NUMBER");
    expect(editKindOf(STR("12"), "NUMBER")).toBe("STRING"); // 폼이 글자로 보낸 입력은 글자다(기록 타입이 원래 타입)
    expect(editKindOf(NULL_VALUE, "NUMBER")).toBe("NUMBER");
    expect(editKindOf(NULL_VALUE, "DATE")).toBe("STRING");
    expect(editKindOf(NULL_VALUE, undefined)).toBe("STRING");
    expect(editKindOf({ type: "LIST", items: [] }, undefined)).toBeNull();
  });

  it("debugStatus — 끝에 ' · 고친 값 N건'(기록), ' · 고침 대기 N건'(대기)", () => {
    const { trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "if1", { GT_G: STR("B"), GT_X: STR("x") })] };
    expect(debugStatus(t, 3)).toBe("4/6 · r2 실행 전 · 고친 값 2건");
    expect(debugStatus(t, 3, 1)).toBe("4/6 · r2 실행 전 · 고친 값 2건 · 고침 대기 1건");
    expect(debugStatus(trace, 2, 1)).toBe("3/6 · if1 실행 전 · 고침 대기 1건");
    expect(debugStatus(trace, 3)).toBe("4/6 · r2 실행 전");
    expect(debugStatus({ ...trace, edits: [edit(3, "r2", { A: STR("a") })] }, 3)).toBe("4/6 · r2 실행 전"); // 어긋난 edit 는 세지 않는다
  });
});
```

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/trace-view.test.ts tests/dme/ruleSetEdit/debug-model.test.ts` → FAIL(`validEdits`·`editsJsonOf` 등이 없다, `edited` 가 없다). Task 1 이 병합되지 않았으면 `TraceEdit` 가 없어 타입 오류가 먼저 난다 — 그때는 BLOCKED 로 보고한다.

- [ ] **Step 4: 순수 구현(`trace-view.ts`·`overlay.ts`·`debug-model.ts`)**

`canvas/overlay.ts` :8 을 바꾼다.

```ts
/** 4단계 E4: `edited` 는 이 노드 직전에 값을 고친 기록이면 true(그 밖에는 키가 없다 — 옛 겹침 비교가 그대로 맞는다). */
export interface NodeOverlay { state: NodeState; seq: number | null; chip: string | null; edited?: boolean; }
```

`trace-view.ts` — import 에 `TraceEdit` 를 더하고, `TraceFrame`·`frames`·`debugOverlay` 를 아래처럼 바꾼다(머리 주석 끝에 한 줄 "4단계 E4: 기록의 `edits` 를 노드 seq 직전에 그 노드 범위에 넣는다(엔진 `FlowRun` 퍼짐 규칙 — 스펙 §2.2)." 를 더한다).

```ts
/** 단계 프레임 — `before` 는 노드를 실행하기 전 그 노드 범위의 ctx 사본(…), `ctx` 는 실행 뒤. `edited` 는 이 노드 직전에 고친 이름(edit 의 철자, 4단계 E4). */
export interface TraceFrame { index: number; node: NodeTrace; before: Record<string, TypedValue>; ctx: Record<string, TypedValue>; changed: string[]; edited: string[]; }

const NULL_TYPED: TypedValue = { type: "NULL" };

/** 적용되는 고친 값 — beforeSeq 자리 노드 ID 가 edit.nodeId 와 같은 것만(기록 순서). 서버는 어긋나면 EDIT_POINT_MISMATCH 로 멈춘다. */
export function validEdits(trace: RunTrace): TraceEdit[] {
  const edits = trace.edits ?? [];
  if (edits.length === 0) return [];
  const idAt = new Map(trace.nodes.map((n) => [n.seq, n.nodeId] as const));
  return edits.filter((e) => idAt.get(e.beforeSeq) === e.nodeId);
}
```

`frames` 본문에서 `const editsAt = new Map(validEdits(trace).map((e) => [e.beforeSeq, e] as const));` 를 `branchScopes` 선언 앞에 두고, `trace.nodes.map` 안의 `const before = { ...scope.ctx };` 를 아래로 바꾼다.

```ts
    // 4단계 E4 — 노드를 시작하기 직전에 그 노드 범위에 고친 값을 넣는다. 같은 이름이 그 범위 made 에 있으면 made 도 바꾼다(스펙 §2.2).
    const edited: string[] = [];
    const edit = editsAt.get(node.seq);
    if (edit) {
      for (const [name, raw] of Object.entries(edit.values ?? {})) {
        const value = raw ?? NULL_TYPED;
        putReplacing(scope.ctx, name, value);
        if (lookup(scope.made, name) !== undefined) putReplacing(scope.made, name, value);
        edited.push(name);
      }
    }
    const before = { ...scope.ctx };
```

그리고 반환을 `return { index, node, before, ctx: { ...scope.ctx }, changed, edited };` 로 바꾼다. `debugOverlay` 는 지금 본문을 `debugOverlayAt`(파일 안 함수)로 이름만 바꾸고 아래 공개 함수가 감싼다.

```ts
export function debugOverlay(trace: RunTrace, flow: RuleSetFlow, cursor: number): Overlay {
  const o = debugOverlayAt(trace, flow, cursor);
  // 4단계 E4 — 고친 지점 노드에 표시(커서와 무관하게, 끝 겹침에서도). overlayAt·debugOverlayAt 은 늘 새 객체를 돌려준다.
  for (const e of validEdits(trace)) {
    const cur = o.nodes[e.nodeId];
    if (cur) o.nodes[e.nodeId] = { ...cur, edited: true };
  }
  return o;
}
```

`debug-model.ts` — import 를 `import type { DataType, RunTrace, RuleSetFlow, TraceEdit, TypedValue } from "@/contract/engine-contract.generated";` 와 `import { frames, sameTyped, validEdits } from "../trace-view";` 로 바꾸고, 머리 주석에 "4단계 E4: 고친 값 표시·고침 대기 쌓기·보내기 모양(`editsJsonOf`)·칸 편집 검증(Task 10)." 한 줄을 더한다.

`DebugVar` 를 바꾼다.

```ts
/** 변수 패널 한 줄 — 커서 자리에서 본 값. created·changed 는 바로 앞 노드가 만들었거나 바꿨는가.
 *  edited 는 커서 자리까지 적용된 고친 값과 지금 값이 같은가(4단계 E4), pending 은 아직 보내지 않은 고침 대기 값인가. */
export interface DebugVar {
  name: string;
  value: TypedValue;
  created: boolean;
  changed: boolean;
  edited: boolean;
  pending?: boolean;
}
```

`variablesAt` 은 `return Object.entries(ctx)` 앞에 고친 값 모음을 만들고, 줄마다 `edited` 를 더한다.

```ts
  // 4단계 E4 — 커서 자리까지 적용된 고친 값(k < n 이면 beforeSeq ≤ 노드 k 의 seq, 끝이면 모두). 지금 값이 고친 값과 같을 때만 "고침".
  const upto = k < n ? trace.nodes[k].seq : Number.POSITIVE_INFINITY;
  const editedValues = new Map<string, TypedValue[]>();
  for (const e of validEdits(trace)) {
    if (e.beforeSeq > upto) continue;
    for (const [name, v] of Object.entries(e.values ?? {})) {
      const lower = name.toLowerCase();
      editedValues.set(lower, [...(editedValues.get(lower) ?? []), v ?? NULL_VALUE]);
    }
  }
  return Object.entries(ctx)
    .map(([name, value]) => {
      const t = touched.get(name.toLowerCase());
      const mine = !!t && sameTyped(t.after, value);
      const edited = (editedValues.get(name.toLowerCase()) ?? []).some((x) => sameTyped(x, value));
      return { name, value, created: mine && !t.existed, changed: mine && t.existed, edited };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
```

`debugStatus` 는 지금 본문을 파일 안 `baseStatus(trace: RunTrace, cursor: number): string`(null 검사 뒤 부분)으로 옮기고 아래로 감싼다.

```ts
export function debugStatus(trace: RunTrace | null, cursor: number, pending = 0): string {
  if (!trace) return NO_RECORD_STATUS;
  const edited = editCount(validEdits(trace));
  return `${baseStatus(trace, cursor)}${edited > 0 ? ` · 고친 값 ${edited}건` : ""}${pending > 0 ? ` · 고침 대기 ${pending}건` : ""}`;
}
```

파일 끝에 새 순수 함수를 더한다.

```ts
// ── 4단계 E4 — 값 고치기 ───────────────────────────────────────────────────────

export const NULL_VALUE: TypedValue = { type: "NULL" };
export type EditKind = "NUMBER" | "STRING" | "BOOLEAN";
export type EditParse = { value: TypedValue } | { error: string };

export const NUMBER_REJECT = "숫자가 아니다 — 값을 고치지 않았다";
export const BOOLEAN_REJECT = "true 나 false 만 쓴다 — 값을 고치지 않았다";
export const LIST_REJECT = "목록 값은 비우기만 한다";
/** 고친 값이 든 기록으로 새 케이스 기대값을 채우지 않는다(스펙 §2.4, 편차 후보 1). */
export const EDITED_EXPECTED_TITLE = "고친 값으로 나온 결과라 기대값으로 쓸 수 없다";

export const droppedEditsNotice = (n: number) => `뒤에서 고친 값 ${n}건을 지웠다`;
export const pendingDroppedNotice = (n: number) => `자리를 옮겨 고침 대기 ${n}건을 버렸다`;

/** 고친 값 수 — edit 마다 이름 수의 합. */
export function editCount(edits: readonly TraceEdit[]): number {
  return edits.reduce((s, e) => s + Object.keys(e.values ?? {}).length, 0);
}

const EDIT_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** 십진 글자 → JSON 숫자 글자. 부호 + 와 정수부 앞 0 을 떼고 소수 글자는 그대로 둔다(1.10 보존 — 서버 BigDecimal 이 그대로 받는다). */
export function numberText(text: string): string {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return text.trim();
  const int = m[2].replace(/^0+(?=\d)/, "");
  return `${m[1] === "-" ? "-" : ""}${int}${m[3] !== undefined ? `.${m[3]}` : ""}`;
}

/** 칸 글자 → 고친 값. 원래 타입에 맞지 않으면 거절 문구. STRING 은 글자 그대로(앞뒤 공백 포함). */
export function parseEditText(kind: EditKind, text: string): EditParse {
  if (kind === "NUMBER") {
    const t = text.trim();
    return EDIT_NUMBER.test(t) ? { value: { type: "NUMBER", value: numberText(t) } } : { error: NUMBER_REJECT };
  }
  if (kind === "BOOLEAN") {
    const t = text.trim().toLowerCase();
    return t === "true" || t === "false" ? { value: { type: "BOOLEAN", value: t } } : { error: BOOLEAN_REJECT };
  }
  return { value: { type: "STRING", value: text } };
}

/** 칸 편집 타입 — 값의 타입이 원래 타입이다. NULL 이면 세트 선언 타입(NUMBER·BOOLEAN 이 아니면 STRING), LIST 는 null(비우기만). */
export function editKindOf(value: TypedValue, declared: DataType | undefined): EditKind | null {
  switch (value.type) {
    case "LIST":
      return null;
    case "NULL":
      return declared === "NUMBER" || declared === "BOOLEAN" ? declared : "STRING";
    default:
      return value.type;
  }
}

/** 이름을 대소문자 무시로 바꿔 넣는다(엔진 `RecordKeys.putReplacing`). */
function putName(values: Record<string, TypedValue>, name: string, value: TypedValue): void {
  const lower = name.toLowerCase();
  for (const k of Object.keys(values)) if (k !== name && k.toLowerCase() === lower) delete values[k];
  values[name] = value;
}

/** 보낼 edit — 앞 지점은 그대로, 같은 지점은 값을 합치고(대기가 이긴다), 뒤 지점은 버린다(스펙 §2.4). dropped = 버린 이름 수. */
export function mergeEdits(applied: readonly TraceEdit[], pending: TraceEdit): { edits: TraceEdit[]; dropped: number } {
  const same = applied.find((e) => e.beforeSeq === pending.beforeSeq);
  const values: Record<string, TypedValue> = { ...(same?.values ?? {}) };
  for (const [name, v] of Object.entries(pending.values)) putName(values, name, v);
  return {
    edits: [...applied.filter((e) => e.beforeSeq < pending.beforeSeq), { beforeSeq: pending.beforeSeq, nodeId: pending.nodeId, values }],
    dropped: editCount(applied.filter((e) => e.beforeSeq > pending.beforeSeq)),
  };
}

/** TypedValue → JSON 원형 값 글자(recordJson 과 같은 모양). JSON.stringify(Number(…)) 는 1.10 을 1.1 로 바꾸므로 손으로 짓는다. */
function valueJson(v: TypedValue | null | undefined): string {
  if (v == null) return "null";
  switch (v.type) {
    case "NULL":
      return "null";
    case "NUMBER":
      return numberText(v.value);
    case "BOOLEAN":
      return v.value === "true" ? "true" : "false";
    case "LIST":
      return `[${(v.items ?? []).map(valueJson).join(",")}]`;
    default:
      return JSON.stringify(v.value);
  }
}

/** `execute` 의 `editsJson` — `[{"beforeSeq":n,"nodeId":"…","values":{"이름":값}}]`. */
export function editsJsonOf(edits: readonly TraceEdit[]): string {
  const one = (e: TraceEdit) =>
    `{"beforeSeq":${e.beforeSeq},"nodeId":${JSON.stringify(e.nodeId)},"values":{${Object.entries(e.values)
      .map(([name, v]) => `${JSON.stringify(name)}:${valueJson(v)}`)
      .join(",")}}}`;
  return `[${edits.map(one).join(",")}]`;
}

/** 고침 대기를 변수 줄에 덮는다 — 있는 이름(대소문자 무시)은 값을 바꾸고 pending, 없는 이름은 새 줄. 이름 순. */
export function applyPending(vars: DebugVar[], pending: TraceEdit | null): DebugVar[] {
  if (!pending) return vars;
  const rest = new Map(Object.entries(pending.values).map(([name, v]) => [name.toLowerCase(), [name, v] as const]));
  if (rest.size === 0) return vars;
  const out: DebugVar[] = vars.map((v) => {
    const hit = rest.get(v.name.toLowerCase());
    if (!hit) return v;
    rest.delete(v.name.toLowerCase());
    return { ...v, value: hit[1], pending: true };
  });
  for (const [name, value] of rest.values()) out.push({ name, value, created: false, changed: false, edited: false, pending: true });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
```

`NULL_VALUE` 는 `variablesAt` 이 쓰므로 선언을 파일 위(문구 상수들 곁)로 올려도 된다 — `const` 는 모듈 평가 때 정해지고 `variablesAt` 은 호출 때 읽으므로 자리는 결과에 영향이 없다.

- [ ] **Step 5: 통과 확인** — Step 3 명령 → PASS. `tests/dme/ruleSetEdit` 전체도 PASS(옛 `debugOverlay` `toEqual` 비교는 `edited` 키가 없어 그대로 맞는다).

- [ ] **Step 6: 실패 테스트(훅)** — `tests/dme/ruleSetEdit/use-simulation.test.ts` import 에 `import type { TraceEdit, TypedValue } from "../../../src/contract/engine-contract.generated";` 와 `droppedEditsNotice, pendingDroppedNotice` 를 더하고 파일 끝에 붙인다.

```ts
// ── 4단계 E4 — 값 고쳐 이어 실행(스펙 §2.4) ─────────────────────────────────────────────────────────────

const STR = (value: string): TypedValue => ({ type: "STRING", value });
const EDIT_IF1: TraceEdit[] = [{ beforeSeq: 3, nodeId: "if1", values: { GT_G: STR("B") } }];
/** 골든 응답에 edits 를 붙인 사본 — 서버가 받은 edit 를 그대로 되돌려 준다(스펙 §2.3). */
const withEdits = (res: RuleSetSimulateResult, edits: TraceEdit[]): RuleSetSimulateResult => ({ ...res, trace: { ...res.trace, edits } });
const sentEdits = (i: number) => (executes()[i][2] as { editsJson?: string }).editsJson;

/** GT_THK=12 로 첫 실행 뒤 커서를 k 에 둔다(서버 호출 1번). */
async function toCursor(k: number) {
  await run((s) => s.setInput("GT_THK", { value: "12" }));
  await run((s) => s.next());
  for (let i = 0; i < k; i++) await run((s) => s.next());
}
/** if1 직전(커서 2)에 GT_G=B 를 고쳐 [한 단계]로 반영 — 커서 3, 서버 호출 2번. */
async function appliedAtIf1() {
  await toCursor(2);
  await run((s) => s.editValue("GT_G", STR("B")));
  replies.push(withEdits(A.response as RuleSetSimulateResult, EDIT_IF1));
  await run((s) => s.next());
}

describe("useSimulation — 값 고쳐 이어 실행(4단계 E4)", () => {
  it("E1. 기록이 최신이고 커서가 노드 k 실행 전일 때만 고친다. 고친 값은 대기로 보이고 서버를 부르지 않는다", async () => {
    await mount();
    expect(h.current.canEditValues).toBe(false);
    await toCursor(2);
    expect(h.current.canEditValues).toBe(true);
    await run((s) => s.editValue("GT_G", STR("B")));
    expect(h.current.pendingEdit).toEqual({ beforeSeq: 3, nodeId: "if1", values: { GT_G: STR("B") } });
    expect(h.current.variables.find((v) => v.name === "GT_G")).toMatchObject({ value: STR("B"), pending: true });
    expect(h.current.valueAt("gt_g")).toEqual(STR("B"));
    await run((s) => s.editValue("gt_g", STR("C"))); // 같은 이름(대소문자 무시)은 덮는다
    expect(h.current.pendingEdit?.values).toEqual({ gt_g: STR("C") });
    await run((s) => s.cancelEdit("GT_G"));
    expect(h.current.pendingEdit).toBeNull();
    await run((s) => s.finish());
    expect(h.current.canEditValues).toBe(false); // 끝(k = n)
    await run((s) => s.editValue("GT_G", STR("B")));
    expect(h.current.pendingEdit).toBeNull();
    expect(executes()).toHaveLength(1);
    expect(sentEdits(0)).toBeUndefined();
  });

  it("E2. 대기가 있으면 [한 단계] 는 edit 와 함께 다시 실행하고 커서 k 에서 한 칸. edit 기록도 입력이 같으면 낡지 않았다", async () => {
    await mount();
    await toCursor(2);
    const first = h.current.last;
    await run((s) => s.editValue("GT_G", STR("B")));
    replies.push(withEdits(A.response as RuleSetSimulateResult, EDIT_IF1));
    await run((s) => s.next());
    expect(executes()).toHaveLength(2);
    expect(sentRecord(1)).toBe('{"GT_THK":"12"}');
    expect(sentEdits(1)).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_G":"B"}}]');
    expect(h.current.cursor).toBe(3);
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.appliedEdits).toEqual(EDIT_IF1);
    expect(h.current.previous).toBe(first);
    expect(h.current.stale).toBe(false);
    expect(h.current.variables.find((v) => v.name === "GT_G")).toMatchObject({ value: STR("B"), edited: true });
    await run((s) => s.next());
    expect(executes()).toHaveLength(2); // needsFresh 가 edit 기록을 낡았다고 보지 않는다
    expect(h.current.cursor).toBe(4);
  });

  it("E3. 같은 지점에서 다시 고치면 값을 합친다", async () => {
    await mount();
    await appliedAtIf1();
    await run((s) => s.setCursor(2));
    await run((s) => s.editValue("GT_THK", STR("30")));
    await run((s) => s.next());
    expect(sentEdits(2)).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_G":"B","GT_THK":"30"}}]');
    expect(h.current.notice).toBeNull();
    expect(h.current.cursor).toBe(3);
  });

  it("E4. 앞 지점 j 에서 새로 고치면 beforeSeq > j 인 edit 를 버리고 한 줄 알린다", async () => {
    await mount();
    await appliedAtIf1();
    await run((s) => s.setCursor(1)); // r1 실행 전(seq 2)
    await run((s) => s.editValue("GT_THK", STR("5")));
    await run((s) => s.next());
    expect(sentEdits(2)).toBe('[{"beforeSeq":2,"nodeId":"r1","values":{"GT_THK":"5"}}]');
    expect(h.current.notice).toBe(droppedEditsNotice(1));
    expect(h.current.cursor).toBe(2);
  });

  it("E5. [처음부터] 는 고친 값을 모두 지운다 — edit 기록이면 edit 없이 다시 실행, 대기만 있으면 대기를 버리고 서버를 부르지 않는다", async () => {
    await mount();
    await appliedAtIf1();
    await run((s) => s.restart());
    expect(executes()).toHaveLength(3);
    expect(sentEdits(2)).toBeUndefined();
    expect(h.current.cursor).toBe(0);
    expect(h.current.appliedEdits).toEqual([]);
    await run((s) => s.next());
    await run((s) => s.editValue("GT_G", STR("B")));
    await run((s) => s.restart());
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.cursor).toBe(0);
    expect(executes()).toHaveLength(3);
  });

  it("E6. 입력을 바꾸거나 흐름 구조가 바뀌면 대기를 지우고, 다음 동작은 edit 없이 새로 실행한다", async () => {
    await mount();
    await toCursor(2);
    await run((s) => s.editValue("GT_G", STR("B")));
    await run((s) => s.setInput("GT_THK", { value: "13" }));
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.canEditValues).toBe(false); // 입력이 기록 입력과 다르다
    await run((s) => s.next());
    expect(executes()).toHaveLength(2);
    expect(sentEdits(1)).toBeUndefined();
    expect(h.current.cursor).toBe(0);
    await run((s) => s.editValue("GT_THK", STR("1")));
    expect(h.current.pendingEdit).not.toBeNull();
    await rerender({ flowVersion: 2 });
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.canEditValues).toBe(false); // 낡은 기록
  });

  it("E7. 실행을 기다리는 동안에는 고치거나 취소할 수 없고, 응답이 오면 보낸 대기만 지운다(Local-Rules §11)", async () => {
    await mount();
    await toCursor(2);
    await run((s) => s.editValue("GT_G", STR("B")));
    let release!: (v: RuleSetSimulateResult) => void;
    replies.push(new Promise<RuleSetSimulateResult>((r) => { release = r; }));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = h.current.next();
    });
    expect(h.current.running).toBe(true);
    expect(h.current.canEditValues).toBe(false);
    await run((s) => s.editValue("GT_G", STR("C")));
    await run((s) => s.cancelEdit());
    expect(h.current.pendingEdit?.values).toEqual({ GT_G: STR("B") });
    await act(async () => {
      release(withEdits(A.response as RuleSetSimulateResult, EDIT_IF1));
      await pending;
    });
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.cursor).toBe(3);
    expect(sentEdits(1)).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_G":"B"}}]');
  });

  it("E8. [이전] 은 대기를 버리고 알린다. [끝내기] 는 대기를 반영해 끝으로, [여기까지] 는 커서 k 에서 찾는다", async () => {
    await mount();
    await toCursor(2);
    await run((s) => s.editValue("GT_G", STR("B")));
    await run((s) => s.prev());
    expect(h.current.pendingEdit).toBeNull();
    expect(h.current.notice).toBe(pendingDroppedNotice(1));
    expect(h.current.cursor).toBe(1);
    await run((s) => s.editValue("GT_THK", STR("9")));
    await run((s) => s.finish());
    expect(sentEdits(1)).toBe('[{"beforeSeq":2,"nodeId":"r1","values":{"GT_THK":"9"}}]');
    expect(h.current.cursor).toBe(N);
    await run((s) => s.setCursor(2));
    await run((s) => s.editValue("GT_G", STR("B")));
    await run((s) => s.runTo("r1")); // r1 은 커서 2 앞 — 반영은 하고 커서는 그대로, 알림
    expect(executes()).toHaveLength(3);
    expect(h.current.cursor).toBe(2);
    expect(h.current.notice).toBe(PASSED_NOTICE);
  });
});
```

- [ ] **Step 7: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/use-simulation.test.ts` → FAIL(`editValue`·`canEditValues` 없음).

- [ ] **Step 8: 훅·API 구현**

`api.ts` :66-69 를 바꾼다.

```ts
/**
 * 기록 실행(디버거) — 저장하지 않은 흐름을 레코드로 돌려 노드별 기록을 받는다. evalTs 가 없으면 서버 현재 시각.
 * editsJson(4단계 E4)은 멈춘 자리에서 고친 값 목록(`editsJsonOf`)이고, 없으면 칸을 보내지 않는다.
 */
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined, editsJson?: string): Promise<RuleSetSimulateResult> {
  return callOasis<RuleSetSimulateResult>(SERVICE, "execute", { flowJson, recordJson, evalTs: blankToUndefined(evalTs), editsJson: blankToUndefined(editsJson) });
}
```

`useSimulation.ts`:
1. 머리 주석 끝에 한 단락을 더한다: "4단계 E4(스펙 §2.4): 커서 자리에서 고친 값은 고침 대기(`pending`, 기록·커서와 한 묶음)로 두고, 대기가 있을 때 [한 단계]·[계속]·[여기까지]·[끝내기]는 기록의 edit 에 합쳐(`mergeEdits`) `editsJson` 과 함께 새로 실행한 뒤 커서 k 에서 그 동작을 한다. [처음부터]·입력 변경·흐름 변경·자리 옮김은 대기를 버리고, [처음부터] 는 edit 기록이면 edit 없이 다시 실행한다. edit 는 입력이 아니므로 `needsFresh` 의 입력 비교에 들지 않는다."
2. import 를 바꾼다.

```ts
import type { FlowNodeKind, RunTrace, TraceEdit, TypedValue } from "@/contract/engine-contract.generated";
…
import { validEdits } from "../trace-view";
import {
  applyPending,
  droppedEditsNotice,
  editsJsonOf,
  mergeEdits,
  nextStop,
  pendingDroppedNotice,
  runToIndex,
  variablesAt,
  type DebugVar,
} from "./debug-model";
```

3. `Simulation` 의 `notice` 뒤에 멤버를 더한다.

```ts
  // ── 값 고치기 — 4단계 E4(스펙 §2.4) ──
  /** 고칠 수 있는가 — 기록이 최신(낡지 않고 입력이 기록 입력과 같다)이고 커서가 노드 k 실행 전(0 ≤ k < n)이며 실행 중이 아니다. */
  canEditValues: boolean;
  /** 고침 대기 — 커서 자리(노드 k 실행 전)에서 고쳤고 아직 보내지 않은 값. 없으면 null. */
  pendingEdit: TraceEdit | null;
  /** 지금 기록에 들어간 고친 값(서버가 되돌려 준 `trace.edits` 가운데 자리가 맞는 것), 없으면 빈 목록. */
  appliedEdits: readonly TraceEdit[];
  /** 커서 자리에서 이름 하나를 고친다(대소문자 무시로 같은 이름을 덮는다). 비우기는 `{type:"NULL"}`. 고칠 수 없으면 무시. */
  editValue(name: string, value: TypedValue): void;
  /** 고침 대기에서 이름 하나를 뺀다. 이름을 주지 않으면 모두 뺀다. 실행 중이면 무시. */
  cancelEdit(name?: string): void;
```

4. 모듈 상수 곁에 `const NO_EDITS: readonly TraceEdit[] = [];` 와 `const joinNotice = (a: string | null, b: string | null) => (a && b ? \`${a} · ${b}\` : (a ?? b));` 를 둔다.
5. `Rec` 에 `/** 고침 대기(4단계 E4) — 커서 자리 한 곳. 기록·커서와 한 번에 바꾼다. */ pending: TraceEdit | null;` 를 더하고 `emptyRec` 가 `pending: null` 을 싣는다.
6. :200 `running` 을 ref 와 함께 쓴다(요청 중 고치기를 훅에서 막으려고). 기존 `setRunning(…)` 호출은 그대로 두고 이름만 새 함수로 간다.

```ts
  const [running, setRunningState] = useState(false);
  const runningRef = useRef(false);
  /** 실행 중 표시 — ref 에도 적어 한 처리 안의 editValue·cancelEdit 가 본다. */
  const setRunning = useCallback((v: boolean) => {
    runningRef.current = v;
    setRunningState(v);
  }, []);
```

   세트·흐름 효과(:239-270)와 `fresh` 의 의존성 배열에 `setRunning` 을 더한다.
7. 흐름 구조 바뀜(:263)을 `writeRec((r) => ({ ...r, flowVersion, pending: null }));` 로 바꾼다(세트 바뀜은 `emptyRec` 라 이미 null).
8. 대기 버리기와 입력 setter:

```ts
  /** 고침 대기를 버린다 — 입력이 바뀌면 그 대기는 뜻을 잃는다(스펙 §2.4). 대기가 없으면 상태를 건드리지 않는다. */
  const dropPending = useCallback(() => {
    if (recRef.current.pending) writeRec((r) => ({ ...r, pending: null }));
  }, [writeRec]);
```

   `setInput`·`setJson`·`setEvalTs`·`importJson`(성공·실패 모두)·`loadInput` 의 본문 첫 줄에 `dropPending();` 을 두고 의존성에 더한다(`setEvalTs` 는 `useCallback((v: string) => { dropPending(); writeInputs({ evalTs: v }); }, [writeInputs, dropPending])` 로 바꾼다). `dropPending` 선언은 이 setter 들보다 위(:295 앞)에 둔다.
9. `needsFresh`(:353) 아래에 고칠 수 있는가·고치기·취소를 더한다.

```ts
  /** 지금 고칠 수 있는가 — 새로 실행할 필요가 없고(기록 최신·입력 같음), 커서가 노드 k 실행 전이며, 실행 중이 아니다. */
  const editableNow = useCallback(
    (r: Rec): boolean => !runningRef.current && !needsFresh(r) && r.cursor >= 0 && r.cursor < r.last!.trace.nodes.length,
    [needsFresh],
  );

  const editValue = useCallback(
    (name: string, value: TypedValue) => {
      const r = recNow();
      if (!editableNow(r)) return;
      const node = r.last!.trace.nodes[r.cursor];
      const base = r.pending && r.pending.beforeSeq === node.seq ? r.pending.values : {};
      const lower = name.toLowerCase();
      const values: Record<string, TypedValue> = {};
      for (const [k, v] of Object.entries(base)) if (k.toLowerCase() !== lower) values[k] = v;
      values[name] = value;
      writeRec((x) => ({ ...x, pending: { beforeSeq: node.seq, nodeId: node.nodeId, values } }));
    },
    [recNow, editableNow, writeRec],
  );

  const cancelEdit = useCallback(
    (name?: string) => {
      const r = recNow();
      if (!r.pending || runningRef.current) return;
      if (name === undefined) {
        writeRec((x) => ({ ...x, pending: null }));
        return;
      }
      const lower = name.toLowerCase();
      const values = Object.fromEntries(Object.entries(r.pending.values).filter(([k]) => k.toLowerCase() !== lower));
      const next = Object.keys(values).length === 0 ? null : { ...r.pending, values };
      writeRec((x) => ({ ...x, pending: next }));
    },
    [recNow, writeRec],
  );
```

   `needsFresh(r)` 가 거짓이면 `r.last` 가 있으므로 `r.last!` 는 안전하다(단락 평가 순서를 지킨다).
10. `fresh`(:360-398)에 인자 셋을 더한다 — 보낼 edit·보낸 대기 객체·먼저 보일 알림.

```ts
  const fresh = useCallback(
    async (pick: Pick, edits: readonly TraceEdit[] = NO_EDITS, sent: TraceEdit | null = null, lead: string | null = null) => {
      …(지금 그대로)…
        const res = await simulate(flowJsonOf(f), input.recordJson, input.evalTs || undefined, edits.length > 0 ? editsJsonOf(edits) : undefined);
      …
        writeRec((r) => ({
          ...r,
          last: record,
          previous: r.last ?? r.previous,
          cursor: next.cursor,
          // 보낸 대기만 지운다 — 요청 중에는 editValue 가 막히므로 보통 같은 객체다(Local-Rules §11).
          pending: r.pending === sent ? null : r.pending,
        }));
        setNotice(joinNotice(lead, next.notice));
      …
    },
    [writeRec, writeRecent, setRunning],
  );
```

11. `move`(:401-411)를 바꾼다.

```ts
  /**
   * 기록을 쓸 수 있으면 그 기록으로 커서를 옮기고, 아니면 새로 실행한다. 알림은 먼저 지운다.
   * 고침 대기가 있으면(4단계 E4) 기록의 edit 에 합쳐 edit 와 함께 새로 실행하고, 새 기록 위에서 커서 k 에서 그 동작을 한다.
   */
  const move = useCallback(
    async (onFresh: Pick, onLast: (trace: RunTrace, cursor: number) => { cursor: number; notice: string | null }) => {
      setNotice(null);
      const r = recNow();
      if (needsFresh(r)) {
        if (r.pending) writeRec((x) => ({ ...x, pending: null }));
        return fresh(onFresh);
      }
      if (r.pending) {
        const k = r.cursor;
        const { edits, dropped } = mergeEdits(validEdits(r.last!.trace), r.pending);
        return fresh(
          (t) => {
            const nx = onLast(t, Math.min(k, t.nodes.length));
            return { cursor: Math.min(nx.cursor, t.nodes.length), notice: nx.notice };
          },
          edits,
          r.pending,
          dropped > 0 ? droppedEditsNotice(dropped) : null,
        );
      }
      const next = onLast(r.last!.trace, r.cursor);
      writeRec((x) => ({ ...x, cursor: next.cursor }));
      setNotice(next.notice);
    },
    [recNow, needsFresh, fresh, writeRec],
  );
```

12. `restart`·`prev`·`setCursor`(:440·:445-460)를 바꾼다. `next`·`resume`·`runTo`·`finish` 는 그대로다(모두 `move` 를 지난다).

```ts
  /** [처음부터] — 고친 값을 모두 지운다(스펙 §2.4). edit 기록이면 needsFresh 가 아니어도 edit 없이 다시 실행한다. */
  const restart = useCallback(async () => {
    setNotice(null);
    const r = recNow();
    if (r.pending) writeRec((x) => ({ ...x, pending: null }));
    if (needsFresh(r) || (r.last?.trace.edits?.length ?? 0) > 0) return fresh(() => at(0));
    writeRec((x) => ({ ...x, cursor: 0 }));
  }, [recNow, needsFresh, fresh, writeRec]);

  /** 커서를 to 로 — 실제로 옮기면 그 자리의 고침 대기를 버리고 알린다. */
  const moveCursor = useCallback(
    (to: (r: Rec) => number) => {
      setNotice(null);
      const r = recNow();
      if (!r.last) return;
      const k = to(r);
      const drop = !!r.pending && k !== r.cursor;
      writeRec((x) => ({ ...x, cursor: k, pending: drop ? null : x.pending }));
      if (drop) setNotice(pendingDroppedNotice(Object.keys(r.pending!.values).length));
    },
    [recNow, writeRec],
  );
  const prev = useCallback(() => moveCursor((r) => Math.max(0, r.cursor - 1)), [moveCursor]);
  const setCursor = useCallback(
    (k: number) => moveCursor((r) => Math.max(0, Math.min(r.last!.trace.nodes.length, Math.trunc(k)))),
    [moveCursor],
  );
```

13. 렌더 값(:472-475)을 바꾸고 반환에 멤버를 더한다.

```ts
  const pending = last ? cur.pending : null;
  const appliedEdits = useMemo(() => (last ? validEdits(last.trace) : NO_EDITS), [last]);
  const inputNow = useMemo(() => inputOf(inputs, metas), [inputs, metas]);
  const canEditValues = !!last && !stale && (inputNow == null || sameInput(inputNow, last.input)) && cursor >= 0 && cursor < n && !running;
  // 변수는 기록 때의 흐름 사본으로 푼다(병렬 범위가 기록과 맞아야 한다). 커서·대기가 바뀔 때만 다시 계산한다(Local-Rules §16).
  const variables = useMemo(
    () => (last ? applyPending(variablesAt(last.trace, last.flow, cursor), pending) : NO_VARIABLES),
    [last, cursor, pending],
  );
```

   반환 객체 끝에 `canEditValues, pendingEdit: pending, appliedEdits, editValue, cancelEdit,` 를 더한다.

- [ ] **Step 9: 통과 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS(3단계 `use-simulation`·`debug-mode`·`debugger` 옛 사례 포함). `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` → 0. 바꾼 파일에 `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 파일>` 과 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일>` → 0건.

- [ ] **Step 10: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/use-simulation.test.ts
/usr/bin/git commit -m "feat(m-mdm): 룰 세트 디버거 고친 값 반영·고침 대기 모델(E4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/overlay.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-model.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/use-simulation.test.ts
```

   완료 보고에 기준선 대비 화면 테스트 수 증감(+Step 1·2·6 사례 수)을 적는다.

---

### Task 11: 디버거 편집 화면 — 변수 표 값 고치기·[변수 추가]·[비우기]·[고침 취소]·툴바 문구·고친 지점 표시·기대값 막기

**모델:** sonnet — Task 10 모델 위의 화면 배선이다. AG Grid 칸 편집의 되돌림(거절)과 Local-Rules §12 만 주의한다.

**흐름:** F2. 먼저 병합돼야 할 태스크: 10.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx` — import(:13-30), `VAR_COLUMNS`(:66-89)→`varColumns`, `rowClass`(:91), 변수 표 절(:122-135·:179-198), `types`(:142)를 변수 표 위로
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx` — 상태 문구(:33)·단추 title(:47-59)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx` — `openNew`(:131-146)·[지금 입력 저장] title(:~182-190)·머리 주석
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx` — `FlowNodeView`(:208-240)에 고친 지점 표시만(`overlay.edited`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/debug.ts` — `.rsf-var-pending`·`.rsf-edited`·`.rsf-var-add`·`.rsf-var-edit-error`(:66-68 곁)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` — 디버거 자리만(A-PROPS 행 :106, 디버거 겹침 행 :137, §4.1 D-015·D-016 뒤, B-026 :234, §5.2 「(디버그 실행)」 :260 과 새 행, 상태 문구 단락 :268, N-22 :512)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-edit.test.ts`(새)
- `FlowCanvas.tsx`·`page.tsx` 는 고치지 않는다 — 고친 지점 표시는 이미 노드 data 로 가는 겹침(`overlay?.nodes[n.id]`, `FlowCanvas.tsx:976`)의 `edited` 로 싣는다(편차 후보 3). Task 5·6·7 이 병렬로 고치는 `FlowCanvas.tsx` 와 충돌이 없다.

**Interfaces:**
- Consumes(Task 10): `Simulation.canEditValues`·`pendingEdit`·`appliedEdits`·`editValue`·`cancelEdit`·`running`, `DebugVar.edited`·`pending`, `NodeOverlay.edited`, debug-model 의 `NULL_VALUE`·`EditKind`·`parseEditText`·`editKindOf`·`LIST_REJECT`·`EDITED_EXPECTED_TITLE`·`debugStatus(trace, cursor, pending)`. `expr-eval.ts` `declaredTypes(flow, rules)`(대문자 키 → `DataType`). shared `AgDataGrid` 의 `GridColumn.editable`(행별 함수)·기본 `cellEditor`(= `agTextCellEditor`)·`onCellValueChanged({rowKey, field, newValue, oldValue, row})`·`rowClassRefreshToken`(`shared/src/components/grid/AgDataGrid.tsx:163-237·332-339·365`). 두 번 눌러 편집은 `singleClickEdit` 기본값(false)이다.
- Produces(testid·문구):

| 자리 | testid / 문구 |
|---|---|
| 변수 표 줄 상태 | 「고침 대기」(`rsf-var-pending` 줄 배경 `--color-edited`, 배지 warning), 「고침」(배지 success), 기존 「새」·「바뀜」 |
| 줄 끝 동작 칸(col-id `act`, 고칠 수 있을 때만) | [비우기] `var-clear-{name}`(title 「값을 NULL 로 비운다」), 고침 대기 줄은 [되돌리기] `var-edit-undo-{name}` |
| 변수 표 아래 | 거절 문구 `var-edit-error`(role alert), [변수 추가] `var-add`, [고침 취소] `var-edit-cancel`(대기 있을 때만), 안내 `var-edit-note` = `EDIT_HINT` |
| 변수 추가 칸 | `var-add-form`, `var-add-name`, `var-add-type`(글자·숫자·참거짓), `var-add-value`(비우면 NULL), `var-add-ok`, `var-add-close`, 문구 `ADD_NAME_TEXT`·`ADD_EXISTS_TEXT` |
| 캔버스 노드 | `flow-node-edited-{nodeId}`(title·aria-label `EDITED_NODE_TITLE` = 「이 노드 직전에 값을 고쳤다」) |
| 툴바 | `dbg-status` 끝 「 · 고친 값 N건」·「 · 고침 대기 N건」, 대기가 있으면 실행 단추 title 앞에 `PENDING_RUN_PREFIX` = 「고친 값으로 처음부터 다시 실행한 뒤 」 |
| 케이스 | [지금 입력 저장](`case-save-current`) title = `EDITED_EXPECTED_TITLE`(고친 값이 든 기록일 때), 기대 칸 비움 |

```ts
// VariablePanel.tsx
export const EDIT_HINT = "값 칸을 두 번 눌러 고친다. [한 단계]·[계속]·[여기까지]가 고친 값으로 처음부터 다시 실행한다";
export const EDIT_OFF_TITLE = "기록이 최신이고 커서가 노드 실행 전일 때만 고친다";
export const ADD_NAME_TEXT = "변수 이름을 적는다";
export const ADD_EXISTS_TEXT = "이 자리에 이미 있는 이름이다. 표에서 값을 고친다";
// nodes.tsx
export const EDITED_NODE_TITLE = "이 노드 직전에 값을 고쳤다";
// DebugToolbar.tsx
export const PENDING_RUN_PREFIX = "고친 값으로 처음부터 다시 실행한 뒤 ";
```

- [ ] **Step 1: 실패 테스트** — `src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-edit.test.ts` 를 새로 쓴다(준비부는 `debug-mode.test.ts` 와 같은 모양이고, 변수 표 그리드 목을 더한다).

```ts
/** @vitest-environment happy-dom */

// 룰 세트 디버거 값 고쳐 이어 실행 화면(4단계 계획 Task 11, 스펙 §2.4) — 변수 표 값 칸 편집·타입 거절(칸 되돌림)·[변수 추가]·[비우기]·
// [고침 취소]·툴바 문구·고친 지점 노드 표시·[지금 입력 저장] 기대값 막기·[처음부터]. execute 응답은 Task 4 골든 IF_FIRST_TRUE 에 edits 를 붙여 준다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), varGrid: { current: null as Record<string, unknown> | null } }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

// 변수 표(ariaLabel "커서 자리 변수")의 props 를 잡아 두고 실제 그리드를 그린다. 칸 편집은 AG Grid 가 행 객체를 먼저 바꾼 뒤
// onCellValueChanged 를 부르는 순서를 손으로 재현한다(happy-dom 에서 편집기를 띄우지 않는다).
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const react = await import("react");
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.ariaLabel === "커서 자리 변수") mocks.varGrid.current = props;
      return react.createElement(actual.AgDataGrid as unknown as React.ComponentType<Record<string, unknown>>, props);
    },
  };
});

import type { RunTrace, TraceEdit } from "../../../src/contract/engine-contract.generated";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { EDITED_EXPECTED_TITLE, NUMBER_REJECT } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { ADD_EXISTS_TEXT } from "../../../pages/dme/ruleSetEdit/debugger/VariablePanel";
import { EDITED_NODE_TITLE } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { flush, selectValue, typeInto, visibleText } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, calls, click, inDoc, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null, dataType: string | null = null) => ({ name: n, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src, string?]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s, t]) => ioName(n, s, t ?? null)), results: results.map((r) => ioName(r, null, "STRING")),
  };
}
// GT_THK 는 NUMBER 로 선언한다(debug-mode.test.ts 와 같다). 폼이 글자로 보내므로 기록 값은 STRING 이고 편집 타입도 글자다.
const RULES: RuleIo[] = [io("GT_GRADE", [["GT_THK", "DICT", "NUMBER"]], ["GT_G"]), io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]), io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"])];
/** IF 갈래 e3 조건식 IO — 없으면 "조건식 정보 없음" 거부 검사로 세트 저장이 꺼진다. */
const COND_IO = { e3: { ok: true, message: null, vars: [ioName("GT_G", "NONE")] } };
const FIRST = golden("IF_FIRST_TRUE"); // start(1) r1(2) if1(3) r2(4) m1(5) end(6)

function viewOf(): RuleSetView {
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: FIRST.flow, branched: true },
    rules: RULES,
    checks: [],
    condIo: COND_IO,
    editable: true,
    restorable: false,
    cases: [],
  };
}

type Row = Record<string, unknown>;
interface VarGridProps {
  data: Row[];
  columns: Array<{ key: string; editable?: boolean | ((r: Row) => boolean) }>;
  onCellValueChanged: (p: { rowKey: string; field: string; newValue: unknown; oldValue: unknown; row: Row }) => void;
}
const grid = () => mocks.varGrid.current as unknown as VarGridProps;
const gridRowOf = (name: string) => grid().data.find((r) => r.name === name);
const canEditCell = (name: string, over: Row = {}) => {
  const c = grid().columns.find((x) => x.key === "value")!;
  const row = { ...gridRowOf(name)!, ...over };
  return typeof c.editable === "function" ? c.editable(row) : !!c.editable;
};
/** AG Grid 처럼 행 객체의 값을 먼저 바꾸고 onCellValueChanged 를 부른다. 바꾼 행 객체를 돌려준다. */
async function editCell(name: string, text: string): Promise<Row> {
  const row = gridRowOf(name)!;
  const old = row.value;
  row.value = text;
  await act(async () => {
    grid().onCellValueChanged({ rowKey: name, field: "value", newValue: text, oldValue: old, row });
  });
  await flush();
  return row;
}

const status = () => visibleText(byTestId("dbg-status")).trim();
const lastExecute = () => calls("execute").at(-1)!.body.params as Record<string, unknown>;
const EDIT_IF1: TraceEdit[] = [{ beforeSeq: 3, nodeId: "if1", values: { GT_G: { type: "STRING", value: "B" } } }];
/** 골든 IF_FIRST_TRUE 에 edits 를 붙인 응답(서버가 받은 edit 를 그대로 되돌려 준다 — 스펙 §2.3). */
function editedReply(edits: TraceEdit[]) {
  const t = JSON.parse(JSON.stringify(FIRST.trace)) as RunTrace;
  return ok({ trace: { ...t, edits }, warnings: [] });
}

async function run(id: string) {
  await click(id);
  await settle(50);
}
async function openDebug() {
  srv.replies.execute = ok(FIRST.response);
  srv.replies.validate = ok({ condIo: COND_IO });
  await openSet("GT_SET", viewOf());
  await click("flow-mode-debug");
}
/** GT_THK=12 로 첫 [한 단계] 뒤 k 칸 더(서버 호출 1번). */
async function stepTo(k: number) {
  await openDebug();
  await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
  await run("dbg-step");
  for (let i = 0; i < k; i++) await run("dbg-step");
}

beforeEach(() => {
  installServer();
  localStorage.clear();
  mocks.openRuleEdit.mockReset();
  mocks.openMdmPage.mockReset();
  mocks.varGrid.current = null;
});

afterEach(() => {
  uninstallServer();
});

describe("디버거 값 고치기(4단계 E4)", () => {
  it("1. 값 칸을 고치면 고침 대기 — [한 단계] 가 editsJson 과 함께 다시 실행하고 '고침'·툴바 문구·노드 표시", async () => {
    await stepTo(2);
    expect(status()).toBe("3/6 · if1 실행 전");
    expect(canEditCell("GT_G")).toBe(true);
    expect(byTestId("var-edit-note")).not.toBeNull();
    await editCell("GT_G", "B");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "B", state: "고침 대기" });
    expect(status()).toBe("3/6 · if1 실행 전 · 고침 대기 1건");
    expect(byTestId("dbg-step").getAttribute("title")).toBe("고친 값으로 처음부터 다시 실행한 뒤 한 단계 (F10)");
    expect(calls("execute")).toHaveLength(1);

    srv.replies.execute = editedReply(EDIT_IF1);
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(2);
    expect(lastExecute().recordJson).toBe('{"GT_THK":"12"}');
    expect(lastExecute().editsJson).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_G":"B"}}]');
    expect(status()).toBe("4/6 · r2 실행 전 · 고친 값 1건");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "B", state: "고침" });
    expect(byTestId("flow-node-edited-if1").getAttribute("title")).toBe(EDITED_NODE_TITLE);
    expect(q("flow-node-edited-r1")).toBeNull();
    expect(q("var-edit-cancel")).toBeNull();

    await run("dbg-finish"); // 대기가 없으므로 서버를 부르지 않는다
    expect(calls("execute")).toHaveLength(2);
    expect(canEditCell("GT_G")).toBe(false); // 끝(k = n)
    expect(byTestId<HTMLButtonElement>("var-add").disabled).toBe(true);
    expect(q("var-clear-GT_G")).toBeNull();
  });

  it("2. 원래 타입에 맞지 않는 값은 칸에서 거절하고 칸을 원래 값으로 되돌린다. NUMBER 는 글자 그대로 보낸다. LIST 는 고칠 수 없다", async () => {
    await stepTo(4); // m1 실행 전 — GT_F NUMBER 1
    const bad = await editCell("GT_F", "abc");
    expect(visibleText(byTestId("var-edit-error"))).toBe(NUMBER_REJECT);
    expect(gridRowOf("GT_F")).not.toBe(bad); // 새 행 객체로 다시 그려 AG Grid 가 원래 값을 보인다
    expect(gridRowOf("GT_F")).toMatchObject({ value: "1", state: "새" }); // r2 가 만든 값 — 거절 뒤 그대로
    await editCell("GT_F", "2.50");
    expect(q("var-edit-error")).toBeNull();
    expect(gridRowOf("GT_F")).toMatchObject({ value: "2.50", state: "고침 대기" });
    expect(canEditCell("GT_F", { editKind: null })).toBe(false); // LIST 줄은 editKind 가 null
    srv.replies.execute = editedReply([{ beforeSeq: 5, nodeId: "m1", values: { GT_F: { type: "NUMBER", value: "2.50" } } }]);
    await run("dbg-step");
    expect(lastExecute().editsJson).toBe('[{"beforeSeq":5,"nodeId":"m1","values":{"GT_F":2.50}}]');
  });

  it("3. [변수 추가]·[비우기]·[되돌리기]·[고침 취소]", async () => {
    await stepTo(2);
    await click("var-add");
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "gt_g");
    await selectValue(byTestId<HTMLSelectElement>("var-add-type"), "NUMBER");
    await typeInto(byTestId<HTMLInputElement>("var-add-value"), "007");
    await click("var-add-ok");
    expect(visibleText(byTestId("var-edit-error"))).toBe(ADD_EXISTS_TEXT);
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "GT_NEW");
    await click("var-add-ok");
    expect(q("var-add-form")).toBeNull();
    expect(gridRowOf("GT_NEW")).toMatchObject({ value: "7", state: "고침 대기" });

    await click("var-clear-GT_G");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "NULL", state: "고침 대기" });
    expect(status()).toBe("3/6 · if1 실행 전 · 고침 대기 2건");
    await click("var-edit-undo-GT_G");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "A", state: "새" });
    await click("var-edit-cancel");
    expect(gridRowOf("GT_NEW")).toBeUndefined();
    expect(q("var-edit-cancel")).toBeNull();
    expect(status()).toBe("3/6 · if1 실행 전");
    expect(calls("execute")).toHaveLength(1);
  });

  it("4. 추가·비우기를 함께 보내면 값 모양은 recordJson 과 같다(NUMBER 숫자·NULL null)", async () => {
    await stepTo(2);
    await click("var-add");
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "GT_NEW");
    await selectValue(byTestId<HTMLSelectElement>("var-add-type"), "NUMBER");
    await typeInto(byTestId<HTMLInputElement>("var-add-value"), "007");
    await click("var-add-ok");
    await click("var-clear-GT_G");
    await run("dbg-continue");
    expect(JSON.parse(lastExecute().editsJson as string)).toEqual([{ beforeSeq: 3, nodeId: "if1", values: { GT_NEW: 7, GT_G: null } }]);
    expect(lastExecute().editsJson as string).toContain('"GT_NEW":7');
  });

  it("5. 고친 값이 든 기록은 새 케이스 기대값을 채우지 않는다. [처음부터] 는 edit 없이 다시 실행한다", async () => {
    await stepTo(2);
    await editCell("GT_G", "B");
    srv.replies.execute = editedReply(EDIT_IF1);
    await run("dbg-step");
    expect(byTestId("case-save-current").getAttribute("title")).toBe(EDITED_EXPECTED_TITLE);
    await click("case-save-current");
    expect(inDoc<HTMLTextAreaElement>("case-modal-input").value).toBe('{"GT_THK":"12"}');
    expect(inDoc<HTMLTextAreaElement>("case-modal-expected").value).toBe("");
    await act(async () => {
      inDoc("case-modal-cancel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    srv.replies.execute = ok(FIRST.response);
    await run("dbg-restart");
    expect(calls("execute")).toHaveLength(3);
    expect(lastExecute().editsJson).toBeUndefined();
    expect(status()).toBe("1/6 · start 실행 전");
    expect(q("flow-node-edited-if1")).toBeNull();
    expect(byTestId("case-save-current").getAttribute("title")).toBe("지금 입력을 케이스로 저장한다");
  });

  it("6. 입력을 바꾸면 고칠 수 없고 대기가 사라진다", async () => {
    await stepTo(2);
    await editCell("GT_G", "B");
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "13");
    expect(canEditCell("GT_G")).toBe(false);
    expect(gridRowOf("GT_G")).toMatchObject({ value: "A" });
    expect(q("var-edit-note")).toBeNull();
    expect(byTestId<HTMLButtonElement>("var-add").disabled).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/debug-edit.test.ts` → FAIL(`var-edit-note`·`flow-node-edited-*` 없음, 칸이 편집되지 않는다).

- [ ] **Step 3: `VariablePanel.tsx`**
  1. 머리 주석의 변수 표 항목 뒤에 한 줄을 더한다: "- 값 고치기(4단계 E4, 스펙 §2.4): `sim.canEditValues` 일 때 값 칸을 두 번 눌러 고친다(AG Grid 기본 편집기 + `onCellValueChanged` — 칸 렌더러에 입력 요소를 두지 않는다, Local-Rules §12). 원래 타입(NULL 이면 세트 선언 타입)에 맞지 않으면 거절하고 새 행 객체로 다시 그려 칸을 되돌린다. LIST 는 [비우기]만. 줄 끝 [비우기]·[되돌리기], 아래 [변수 추가]·[고침 취소]."
  2. import 를 바꾼다.

```ts
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { IconArrowBackUp, IconEraser, IconPin, IconPinFilled, IconPlus, IconX } from "@tabler/icons-react";

import type { TypedValue } from "@/contract/engine-contract.generated";
import { Button, Input, Select } from "@dk-oasis/shared/form";
…
import { LIST_REJECT, NULL_VALUE, editKindOf, parseEditText, type EditKind } from "./debug-model";
```

  3. `VAR_COLUMNS`(:66-89)와 `rowClass`(:91)를 아래로 바꾼다.

```tsx
export const EDIT_HINT = "값 칸을 두 번 눌러 고친다. [한 단계]·[계속]·[여기까지]가 고친 값으로 처음부터 다시 실행한다";
export const EDIT_OFF_TITLE = "기록이 최신이고 커서가 노드 실행 전일 때만 고친다";
export const ADD_NAME_TEXT = "변수 이름을 적는다";
export const ADD_EXISTS_TEXT = "이 자리에 이미 있는 이름이다. 표에서 값을 고친다";
const ADD_KINDS = [
  { value: "STRING", label: "글자" },
  { value: "NUMBER", label: "숫자" },
  { value: "BOOLEAN", label: "참거짓" },
];

/** 줄 끝 동작 칸이 부르는 손잡이 — 열은 한 번만 만들고 손잡이는 ref 로 넘긴다(ValueTestCard 와 같은 방식). */
interface VarActions {
  clear(name: string): void;
  undo(name: string): void;
}

const STATE_BADGE: Record<string, Parameters<typeof badgeStyle>[0]> = { "고침 대기": "warning", 고침: "success", 새: "info", 바뀜: "warning" };

function varColumns(actions: { current: VarActions }): GridColumn[] {
  return [
    {
      key: "pin",
      header: "",
      width: 40,
      align: "center",
      tooltip: false,
      render: (v, row) =>
        v ? (
          <IconPinFilled size={14} aria-label={`${String(row.name)} 조사식 풀기`} />
        ) : (
          <IconPin size={14} aria-label={`${String(row.name)} 조사식에 고정`} style={{ color: "var(--color-text-muted)" }} />
        ),
    },
    { key: "name", header: "이름", width: 110 },
    // 값 칸 — 고칠 수 있는 줄만 AG Grid 기본 글자 편집기로 연다(두 번 누르기). 표시는 typedText 글자 그대로다.
    { key: "value", header: "값", width: 100, editable: (row) => row.canEdit === true && row.editKind != null },
    {
      key: "state",
      header: "상태",
      width: 72,
      tooltip: false,
      render: (v) => (typeof v === "string" && STATE_BADGE[v] ? <span style={badgeStyle(STATE_BADGE[v])}>{v}</span> : null),
    },
    // 동작 칸 — 칸 값(act = "clear"·"undo"·"")이 상태와 함께 바뀌어야 AG Grid 가 이 칸을 다시 그린다(값이 같으면 렌더러를 다시 부르지 않는다).
    {
      key: "act",
      header: "",
      width: 40,
      align: "center",
      tooltip: false,
      render: (v, row) => {
        if (v !== "clear" && v !== "undo") return null;
        const name = String(row.name);
        return v === "undo" ? (
          <Button size="mini" data-testid={`var-edit-undo-${name}`} ariaLabel={`${name} 고침 되돌리기`} title="이 줄의 고침 대기를 되돌린다" onClick={() => actions.current.undo(name)}>
            <IconArrowBackUp size={12} aria-hidden="true" />
          </Button>
        ) : (
          <Button size="mini" data-testid={`var-clear-${name}`} ariaLabel={`${name} 비우기`} title="값을 NULL 로 비운다" onClick={() => actions.current.clear(name)}>
            <IconEraser size={12} aria-hidden="true" />
          </Button>
        );
      },
    },
  ];
}

const rowClass = (row: Record<string, unknown>) =>
  row.pending ? "rsf-var-pending" : row.state === "새" ? "rsf-var-new" : row.state === "바뀜" ? "rsf-var-changed" : undefined;
```

  4. 컴포넌트 안 — `types`(:142)를 `// ── 변수 표 ──` 위로 옮기고, 변수 표 부분(:122-135)을 아래로 바꾼다.

```tsx
  const types = useMemo(() => declaredTypes(flow, rules), [flow, rules]);

  // ── 변수 표·값 고치기(4단계 E4) ──
  const canEdit = sim.canEditValues;
  const [editError, setEditError] = useState<string | null>(null);
  /** 거절한 칸 편집을 되돌리는 표지 — AG Grid 는 onCellValueChanged 전에 행 객체를 이미 바꾸므로 새 행 객체로 다시 그린다. */
  const [rev, setRev] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKind, setAddKind] = useState<EditKind>("STRING");
  const [addValue, setAddValue] = useState("");
  // 자리를 옮기거나 고칠 수 없게 되면 거절 문구와 추가 칸을 닫는다.
  useEffect(() => {
    setEditError(null);
    setAdding(false);
  }, [sim.cursor, canEdit]);

  const rows = useMemo(
    () =>
      sim.variables.map((v) => ({
        name: v.name,
        value: typedText(v.value),
        state: v.pending ? "고침 대기" : v.edited ? "고침" : v.created ? "새" : v.changed ? "바뀜" : "",
        pin: pinned.has(v.name.toLowerCase()),
        pending: !!v.pending,
        canEdit,
        editKind: editKindOf(v.value, types[v.name.toUpperCase()]),
        act: !canEdit ? "" : v.pending ? "undo" : "clear",
      })),
    // rev: 거절한 편집을 되돌릴 때만 올려 새 행 객체를 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.variables, pinned, canEdit, types, rev],
  );
  const rowToken = `${canEdit ? 1 : 0}|${rows.map((r) => r.state).join(",")}`;
  const onVarClick = (row: Record<string, unknown>, ev: Event) => {
    if (clickedColumn(ev) === "pin") togglePin(String(row.name));
  };
  const onValueEdit = (p: { field: string; newValue: unknown; row: Record<string, unknown> }) => {
    if (p.field !== "value") return;
    const kind = p.row.editKind as EditKind | null;
    const parsed = kind ? parseEditText(kind, p.newValue == null ? "" : String(p.newValue)) : { error: LIST_REJECT };
    if ("error" in parsed) {
      setEditError(parsed.error);
      setRev((x) => x + 1);
      return;
    }
    setEditError(null);
    sim.editValue(String(p.row.name), parsed.value);
  };
  const actions = useRef<VarActions>({ clear: () => {}, undo: () => {} });
  actions.current = { clear: (name) => sim.editValue(name, NULL_VALUE), undo: (name) => sim.cancelEdit(name) };
  const columns = useMemo(() => varColumns(actions), []);

  const submitAdd = () => {
    const name = addName.trim();
    if (name === "") {
      setEditError(ADD_NAME_TEXT);
      return;
    }
    if (sim.variables.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      setEditError(ADD_EXISTS_TEXT);
      return;
    }
    const parsed: { value: TypedValue } | { error: string } = addValue.trim() === "" ? { value: NULL_VALUE } : parseEditText(addKind, addValue);
    if ("error" in parsed) {
      setEditError(parsed.error);
      return;
    }
    setEditError(null);
    sim.editValue(name, parsed.value);
    setAddName("");
    setAddValue("");
    setAdding(false);
  };
```

  옛 `types` 선언(:142)은 지운다(식 평가가 위 `types` 를 그대로 쓴다).
  5. 변수 표 JSX(:181-194)를 아래로 바꾼다.

```tsx
        {last ? (
          <>
            <div data-testid="var-grid" className="rsf-var-grid">
              <AgDataGrid
                columns={columns}
                data={rows}
                rowKey="name"
                height="auto"
                sortable={false}
                getRowClassExtra={rowClass}
                rowClassRefreshToken={rowToken}
                onRowClick={onVarClick}
                onCellValueChanged={onValueEdit}
                emptyMessage="이 자리에는 변수가 없다"
                ariaLabel="커서 자리 변수"
              />
            </div>
            {editError && (
              <p className="rsf-var-edit-error" data-testid="var-edit-error" role="alert">
                {editError}
              </p>
            )}
            <div className="rsf-var-add">
              <Button size="mini" data-testid="var-add" disabled={!canEdit} title={canEdit ? "이 자리에 변수를 더한다" : EDIT_OFF_TITLE} onClick={() => setAdding((x) => !x)}>
                <IconPlus size={12} aria-hidden="true" />
                변수 추가
              </Button>
              {sim.pendingEdit && (
                <Button size="mini" data-testid="var-edit-cancel" disabled={sim.running} title="고침 대기를 모두 버린다" onClick={() => sim.cancelEdit()}>
                  고침 취소
                </Button>
              )}
            </div>
            {canEdit && (
              <p className="rsf-panel-note" data-testid="var-edit-note">
                {EDIT_HINT}
              </p>
            )}
            {adding && canEdit && (
              <div className="rsf-var-add" data-testid="var-add-form">
                <Input data-testid="var-add-name" aria-label="새 변수 이름" value={addName} placeholder="이름" onChange={setAddName} />
                <Select data-testid="var-add-type" aria-label="새 변수 타입" value={addKind} options={ADD_KINDS} onChange={(v) => setAddKind(v as EditKind)} />
                <Input data-testid="var-add-value" aria-label="새 변수 값" value={addValue} placeholder="비우면 NULL" onChange={setAddValue} />
                <Button size="mini" data-testid="var-add-ok" onClick={submitAdd}>
                  넣기
                </Button>
                <Button size="mini" data-testid="var-add-close" onClick={() => setAdding(false)}>
                  닫기
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="rsf-panel-note">{NO_RECORD_NOTE}</p>
        )}
```

- [ ] **Step 4: `DebugToolbar.tsx`** — `debugStatus` 에 대기 수를 넘기고, 대기가 있을 때 실행 단추 title 앞에 `PENDING_RUN_PREFIX` 를 붙인다. [이전]·[처음부터] title 은 대기·edit 를 지운다는 것을 알린다. 머리 주석에 "4단계 E4: 고침 대기가 있으면 [계속]·[한 단계]·[여기까지]·[끝내기]가 고친 값으로 처음부터 다시 실행한다(훅이 판정한다). 상태 문구 끝에 고친 값·고침 대기 수." 를 더한다.

```tsx
export const PENDING_RUN_PREFIX = "고친 값으로 처음부터 다시 실행한 뒤 ";
…
  const pendingCount = Object.keys(sim.pendingEdit?.values ?? {}).length;
  const status = debugStatus(sim.last?.trace ?? null, sim.cursor, pendingCount);
  const redo = pendingCount > 0 ? PENDING_RUN_PREFIX : "";
  const hasEdits = pendingCount > 0 || sim.appliedEdits.length > 0;
…
        {btn("dbg-continue", "계속", <IconPlayerPlay size={14} aria-hidden="true" />, () => void sim.resume(), runOff, runTitle(`${redo}계속 — 다음 중단점까지 (F5)`))}
        {btn("dbg-step", "한 단계", <IconArrowForwardUp size={14} aria-hidden="true" />, () => void sim.next(), runOff, runTitle(`${redo}한 단계 (F10)`))}
        {btn("dbg-step-back", "이전", <IconArrowBackUp size={14} aria-hidden="true" />, sim.prev, busy || sim.cursor <= 0, pendingCount > 0 ? "이전 단계 — 고침 대기를 버린다 (Shift+F10)" : "이전 단계 (Shift+F10)")}
        {btn(
          "dbg-run-to",
          "여기까지",
          <IconPlayerTrackNext size={14} aria-hidden="true" />,
          () => selectedId && void sim.runTo(selectedId),
          runOff || !selectedId,
          !canRun ? RUN_DENIED_TITLE : selectedId ? `${redo}여기까지 실행 — ${selectedId}` : RUN_TO_NEEDS_NODE,
        )}
        {btn("dbg-restart", "처음부터", <IconRotate size={14} aria-hidden="true" />, () => void sim.restart(), runOff, runTitle(hasEdits ? "처음부터 — 고친 값을 모두 지운다" : "처음부터"))}
        {btn("dbg-finish", "끝내기", <IconPlayerStop size={14} aria-hidden="true" />, () => void sim.finish(), runOff, runTitle(`${redo}끝내기 — 마지막 단계로`))}
```

- [ ] **Step 5: `TestCasePanel.tsx`** — 머리 주석 기대값 줄 끝에 "고친 값이 든 기록(4단계 E4)이면 채우지 않고 단추 title 로 이유를 보인다(스펙 §2.4 [기대값으로] 막기 — 편차 후보 1)." 를 더한다. import 에 `EDITED_EXPECTED_TITLE` 을 더하고 `openNew`·단추를 바꾼다.

```tsx
  /** 지금 기록이 고친 값으로 나왔는가(4단계 E4) — 그 결과는 새 케이스 기대값으로 쓰지 않는다. */
  const editedRecord = !!sim.last && !sim.stale && sim.appliedEdits.length > 0;

  const openNew = () => {
    const input = sim.currentInput();
    if (!input) return;
    const last = sim.last;
    const expectedJson =
      last && !sim.stale && !editedRecord && sameInput(last.input, input) ? expectedFromFinal(last.trace.finalValues ?? {}) : "";
    …(나머지 그대로)
  };
…
        <Button
          size="sm"
          data-testid="case-save-current"
          disabled={!canEditCases || !current || tests.running}
          title={editTitle ?? (current ? (editedRecord ? EDITED_EXPECTED_TITLE : "지금 입력을 케이스로 저장한다") : "입력 오류를 먼저 고친다")}
          onClick={openNew}
        >
```

- [ ] **Step 6: `canvas/nodes.tsx`·`styles/debug.ts`** — `nodes.tsx` import 를 `import { IconExternalLink, IconPencil } from "@tabler/icons-react";` 로 바꾸고, `FlowNodeView` 의 `<Badges id={node.id} overlay={overlay} />` 바로 뒤에 넣는다(다른 곳은 건드리지 않는다 — Task 6·9 가 같은 파일을 고친다).

```tsx
/** 값 고친 지점 표시(4단계 E4) — 디버그 겹침 `overlay.edited` 가 있을 때 오른쪽 아래 작은 원. */
export const EDITED_NODE_TITLE = "이 노드 직전에 값을 고쳤다";
…
      {overlay?.edited && (
        <span className="rsf-edited" data-testid={`flow-node-edited-${node.id}`} title={EDITED_NODE_TITLE} aria-label={EDITED_NODE_TITLE}>
          <IconPencil size={10} aria-hidden="true" />
        </span>
      )}
```

   `styles/debug.ts` 의 `.rsf-var-grid .ag-row.rsf-var-new …` 줄 뒤에 더한다(머리 주석 줄 강조 목록에 `rsf-var-pending` 을 더한다).

```css
.rsf-var-grid .ag-row.rsf-var-pending { background-color: var(--color-edited); }
.rsf-var-grid [col-id="act"] button { padding: 0 4px; }
.rsf-var-add { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.rsf-var-add > * { min-width: 0; }
.rsf-var-edit-error { margin: 0; font-size: var(--font-size-sm); color: var(--color-danger); overflow-wrap: anywhere; }

/* 값 고친 지점(4단계 E4) — 노드 오른쪽 아래 작은 원. 한 변 색 바가 아니다(Local-Rules §8). title 이 뜨도록 누름을 받는다 */
.rsf-edited {
  position: absolute; right: -8px; bottom: -8px; width: 16px; height: 16px; box-sizing: border-box; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2; pointer-events: auto;
  background: var(--color-warning); color: var(--color-on-primary); border: 2px solid var(--rsf-node-bg);
}
```

- [ ] **Step 7: 통과 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS(`debug-mode`·`flow-debug-view`·`test-cases` 옛 사례 포함). lint 0. `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit` 와 `aggrid_docs.py audit` 를 바꾼 다섯 화면 파일(`VariablePanel.tsx`·`DebugToolbar.tsx`·`TestCasePanel.tsx`·`canvas/nodes.tsx`·`styles/debug.ts`)에 돌려 0건.

- [ ] **Step 8: 기능설계서 디버거 절** — `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` 에서 아래 자리만 고친다(다른 태스크의 행·절·머리 개정일은 건드리지 않는다).
  - :106 `A-PROPS` 행 끝 "디버그 = **변수 패널**(…)" 의 변수 표 괄호에 "— 값 칸 편집·줄 끝 [비우기] `var-clear-{name}`/[되돌리기] `var-edit-undo-{name}`·[변수 추가] `var-add`(`var-add-form`·`var-add-name`·`var-add-type`·`var-add-value`·`var-add-ok`·`var-add-close`)·[고침 취소] `var-edit-cancel`·거절 문구 `var-edit-error`·안내 `var-edit-note`" 를 더한다.
  - :137 「디버거 겹침」 행 testid 칸에 "고친 지점 `flow-node-edited-{nodeId}`" 를, 설명 끝에 "기록에 고친 값이 있으면 그 지점 노드 오른쪽 아래에 연필 원(title 「이 노드 직전에 값을 고쳤다」)" 를 더한다.
  - §4.1 표: D-015 설명 끝에 "고친 값이 든 기록이면 채우지 않는다(4단계 E4 — [지금 입력 저장] title 「고친 값으로 나온 결과라 기대값으로 쓸 수 없다」)" 를 더하고, D-017 뒤에 두 행을 더한다.

```markdown
| D-018 | 변수 값 고치기 | 변수 표 값 칸 두 번 누르기(AG Grid 글자 편집기)·줄 끝 [비우기](`var-clear-{name}`) | N | 커서 자리 값 | 기록이 최신이고(흐름·입력이 실행 때와 같다) 커서가 노드 k 실행 전(k < n)일 때만 열린다(4단계 E4). 원래 타입에 맞지 않으면 칸에서 거절하고 원래 값으로 되돌린다 — NUMBER 는 `^[+-]?\d+(\.\d+)?$`(「숫자가 아니다 — 값을 고치지 않았다」), BOOLEAN 은 true·false(대소문자 무시), STRING 은 글자 그대로, NULL 줄은 세트 선언 타입(없거나 DATE 면 글자), LIST 는 [비우기]만. 고친 줄은 「고침 대기」, [되돌리기](`var-edit-undo-{name}`)·[고침 취소](`var-edit-cancel`)로 버린다. 저장하지 않는다(이번 디버그 실행에만) |
| D-019 | 변수 추가 | [변수 추가](`var-add`) → 이름(`var-add-name`)·타입(`var-add-type` 글자·숫자·참거짓)·값(`var-add-value`) → [넣기](`var-add-ok`) | N | — | 이름이 비면 「변수 이름을 적는다」, 커서 자리에 이미 있는 이름(대소문자 무시)이면 「이 자리에 이미 있는 이름이다. 표에서 값을 고친다」. 값이 비면 NULL. 검증은 D-018 과 같다 |
```

  - :234 B-026 버튼 칸에 "·값 칸 편집·[비우기]·[되돌리기]·[변수 추가]·[고침 취소]" 를, 설명 끝에 "값 고치기는 서버를 부르지 않고 고침 대기로 둔다(반영은 B-022)" 를 더한다.
  - :260 「(디버그 실행)」 행의 동작 칸 끝에 6) 을 더한다: "6) **고침 대기가 있으면**(4단계 E4) [한 단계]·[계속]·[여기까지]·[끝내기]는 지금 기록의 고친 값에 대기를 합쳐(같은 지점은 값을 합치고, 뒤 지점의 고친 값은 버리며 「뒤에서 고친 값 N건을 지웠다」) `execute{flowJson, recordJson, evalTs?, editsJson}` 로 처음부터 다시 실행하고, 새 기록 위에서 커서 k 에서 그 동작을 한다. 고친 값이 든 기록도 입력이 같으면 낡지 않았다. [처음부터]는 고친 값을 모두 지운다 — 고친 값이 든 기록이면 edit 없이 다시 실행한다. 입력·흐름 구조가 바뀌거나 [이전]·커서 이동으로 자리를 옮기면 대기를 버린다(자리 옮김은 「자리를 옮겨 고침 대기 N건을 버렸다」). `editsJson` 은 `[{beforeSeq, nodeId, values:{이름: 값}}]` 이고 값은 `recordJson` 과 같은 JSON 원형(숫자는 적은 글자 그대로 — `1.10` 보존, 불린, `null`, 글자)이다" 를 더하고, 호출 액션 칸은 그대로 `execute` 다.
  - :268 상태 문구 단락의 "실행 중에는 ` · 실행 중`이 붙는다." 앞에 "기록에 고친 값이 있으면 ` · 고친 값 N건`, 고침 대기가 있으면 ` · 고침 대기 N건` 이 붙고(4단계 E4), " 를 넣고, 같은 단락의 변수 패널 설명 끝에 "고친 값은 「고침」(지금 값이 고친 값과 같은 동안), 보내지 않은 값은 「고침 대기」 배지다." 를 더한다.
  - :512 N-22 를 바꾼다.

```markdown
| N-22 | **E4 멈춘 자리에서 값 고쳐 이어 실행(4단계)** — 엔진 재개 입구 없이 **처음부터 다시 실행하며 끼워 넣는다**: `execute` 의 `editsJson` 으로 고친 값 목록을 보내면 엔진이 k 번째 노드를 시작하기 직전에 그 노드 범위의 ctx 에 넣는다(같은 이름이 그 범위의 결과에 있으면 결과도 바꾼다, 병렬 갈래 안 입력 고침은 그 갈래 안에서만). 실행이 결정적이라 k 앞 기록은 같다. 화면은 되돌려 받은 `trace.edits` 를 같은 규칙으로 프레임에 반영한다. 3단계 커서 의미(N-19)의 멈춤 위치를 그대로 쓴다. 고친 값은 저장하지 않고, 고친 값이 든 기록은 새 케이스 기대값으로 쓰지 않는다 | 스펙 `2026-10-01-rule-set-flow-phase4-design.md` §2, D-124 |
```

- [ ] **Step 9: 커밋**

```
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/debug.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-edit.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "feat(m-mdm): 룰 세트 디버거 변수 값 고치기 화면·고친 지점 표시(E4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/styles/debug.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/debug-edit.test.ts docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

   완료 보고에 기준선 대비 화면 테스트 수 증감(+6)과 audit·lint 결과, 브라우저에서 확인하지 않은 것(두 번 눌러 편집기가 열리는지, 거절 뒤 칸 글자가 되돌아가는지, 연필 원 자리)을 적는다.

---

#### Task 10~11 — Review Focus 후보(작성자)

1. **퍼짐 규칙 화면·엔진 일치(Task 10)** — `frames` 가 edit 를 넣는 자리(PARALLEL 은 갈래 범위를 만들기 전 바깥, MERGE 는 합치기 전 바깥, 갈래 안 노드는 갈래 범위)와 `made` 교체 조건(대소문자 무시로 이미 있을 때만)이 Task 2 엔진 `FlowRun` 과 같은가. Task 2 엔진 테스트 사례(최상위·IF 갈래 바뀜·병렬 입력/결과 고침·finalValues)와 화면 사례를 나란히 본다.
2. **`editsJson` 값 모양(Task 10·3)** — NUMBER 글자 보존(`2.50`·`+007.10`→`7.10`), BOOLEAN 원형, `null`. 서버가 `RuleCaseJudge.INPUT`(BigDecimal) 매퍼로 풀어 되돌려 준 `trace.edits` 의 타입이 화면이 보낸 것과 같은가(아니면 "고침" 표시가 값 비교로 사라진다).
3. **고침 대기와 `needsFresh`·늦은 응답(Task 10)** — 대기 중 입력·흐름·세트가 바뀔 때, 요청 중 `editValue`·`cancelEdit` 가 막히는가, 성공 때 보낸 대기만 지우는가, 실패 때 대기가 남는가. [처음부터]가 edit 기록에서만 서버를 다시 부르는 것이 3단계 "기록이 있는 동안 서버를 다시 부르지 않는다"(스펙 2단계 §4.2)의 예외로 적절한가.
4. **거절한 칸 편집의 되돌림(Task 11)** — AG Grid 가 행 객체를 먼저 바꾸므로 `rev` 로 새 행 객체를 만든다. 실제 브라우저에서 `getRowId` 기준 갱신이 칸 글자를 되돌리는지(시험은 새 객체가 가는 것까지만 본다).
5. **"고침" 표시 규칙** — 값 비교라 규칙이 같은 값으로 덮어쓰면 "고침" 이 남는다. 사용자에게 헷갈리지 않는지.

#### Task 10~11 — 편차(작성자 결정, 진행 장부에 Ruling 으로 옮긴다)

| # | 스펙 | 이 계획 | 이유 |
|---|---|---|---|
| 1 | §2.4 "고친 값이 있는 기록에서는 [기대값으로] 를 막는다(title …)" | 화면에 [기대값으로] 단추가 없다. 기대값을 결과로 채우는 유일한 곳인 [지금 입력 저장](`TestCasePanel.openNew`)의 자동 채우기를 막고(기대 칸 비움), 단추는 켜 둔 채 title 을 「고친 값으로 나온 결과라 기대값으로 쓸 수 없다」로 한다 | 입력을 케이스로 저장하는 일은 여전히 옳다. 막을 대상은 고친 결과를 기대값으로 싣는 것이다 |
| 2 | §2.4 "줄 메뉴 [비우기]" | 줄 끝 동작 칸의 [비우기] 단추(고침 대기 줄은 [되돌리기]) | `AgDataGrid` 에 행 우클릭 메뉴가 없다. 칸 렌더러의 단추는 Local-Rules §12 가 허용한다 |
| 3 | §2.4 "고친 지점 노드에 작은 표시(노드 데이터로 `nodes.tsx` 에서만)" · 지시 "FlowCanvas.tsx 는 노드 data 에 값 하나 싣는 최소 변경" | `NodeOverlay` 에 선택 필드 `edited` 를 더해 이미 노드 data 로 가는 겹침에 싣는다. `FlowCanvas.tsx`·`page.tsx` 는 고치지 않는다 | 겹침(`debugOverlay`)이 이미 노드 data(`overlay`)로 간다. 병렬로 `FlowCanvas.tsx` 를 고치는 Task 5·6·7 과 충돌이 없고 memo 의존성도 늘지 않는다 |
| 4 | §2.4 "고침 대기가 있을 때 [한 단계]·[계속]·[여기까지 실행]" | [끝내기]도 대기를 반영해 다시 실행한 뒤 끝으로 간다 | 스펙이 [끝내기]를 말하지 않았다. 대기를 말없이 버리면 사용자가 고친 값이 사라진다 |
| 5 | (스펙 없음) 대기 중 [이전]·커서 이동 | 커서가 실제로 옮겨지면 대기를 버리고 「자리를 옮겨 고침 대기 N건을 버렸다」 | 고침 대기는 멈춘 자리 k 에 묶인다(beforeSeq = 노드 k 의 seq) |
| 6 | §2.4 "고친 이름은 변수 표에 '고침'" | 고친 지점과 그 뒤에서 **지금 값이 고친 값과 같은 동안** 「고침」. 규칙이 다른 값으로 덮어쓰면 사라지고, 같은 값으로 덮어쓰면 남는다 | 반영 뒤 커서가 곧바로 k+1 로 가므로 지점에서만 보이면 사용자가 보지 못한다. 범위를 따로 추적하지 않고 범위를 지키는 프레임 값과 견준다 |
| 7 | §2.4 툴바 "끝에 '· 고친 값 N건'" | 고침 대기가 있으면 「 · 고침 대기 N건」 도 붙이고, 실행 단추 title 앞에 「고친 값으로 처음부터 다시 실행한 뒤 」 | 대기는 아직 기록에 없어 툴바만 보고는 다음 동작이 서버를 부르는지 알 수 없다. N 은 edit 수가 아니라 이름 수다 |
| 8 | §2.4 "뒤에서 고친 값 N건을 지웠다" 와 [여기까지] 알림 | 둘이 함께면 「뒤에서 고친 값 N건을 지웠다 · 이 노드는 이미 지났다 …」 처럼 ` · ` 로 잇는다 | 알림 자리가 한 줄이다 |
| 9 | §2.4 "원래 타입(NUMBER·STRING·BOOLEAN)에 맞지 않는 값은 거절" | 원래 타입은 기록 값의 타입이다(폼이 글자로 보낸 입력은 STRING). NULL 줄은 세트 선언 타입(`declaredTypes`)으로 보고, 선언이 없거나 DATE 면 글자다 | NULL 값에는 타입이 없다. 폼 입력은 글자로 가므로(case-form `inputJsonOf`) 기록 타입을 따르면 보낸 모양이 폼과 같다 |
| 10 | (스펙 없음) [변수 추가] 이름·빈 값 | 커서 자리에 이미 있는 이름(대소문자 무시)은 거절하고 표에서 고치게 한다. 값이 비면 NULL | 같은 이름을 두 경로로 고치면 어느 쪽이 이기는지 헷갈린다 |

#### Task 10~11 — 작성자 메모

- **Task 3 에 넘길 조건**: `editsJson` 의 값은 `recordJson` 과 같은 JSON 원형이다. 폼 경로(`ruleEdit/value-test/case-form.ts:72-76`)는 글자·`null`, JSON 칸 경로(`useSimulation.ts:170-174`, `InputForm.tsx:24-32`)는 원문(숫자·불린)을 보낸다. 서버 `RuleSetEditService.simulate`(:316-319)는 `RuleCaseJudge.object`(`INPUT` = `USE_BIG_DECIMAL_FOR_FLOATS`)로 푼다. Task 3 이 `editsJson` 의 `values` 를 다른 매퍼로 풀면 `2.50` 이 double 이 되어 되돌려 준 edits 가 `2.5` 가 되고 "고침" 값 비교가 어긋난다 — Task 3 계획에 같은 `INPUT` 매퍼를 쓰라고 적혀 있는지 컨트롤러가 확인한다.
- **TASK 노드(범위 밖)**: `useSimulation.ts:118` `BREAKABLE` 에 `TASK` 가 없다(스펙 §1.2 "중단점도 걸 수 있다" 는 T1 몫). `trace-view.ts` `scopePaths` 는 `parseFlow` 트리의 `RULE` 항목만 경로에 넣으므로, `flow-model.ts` 가 TASK 를 트리에 넣기 전까지 병렬 갈래 안 TASK 노드 직전 edit 는 루트 범위로 들어간다. Task 9(또는 Task 1 의 `flow-model` 처리)가 TASK 를 `RuleStep` 과 같은 항목으로 넣으면 `scopePaths` 의 `b.type === "RULE"` 조건도 같이 넓혀야 한다 — 그 태스크의 몫이며 이 두 태스크는 건드리지 않는다.
- **확인하지 못한 것**: (1) 거절 뒤 새 행 객체를 넘기면 AG Grid 33 이 `getRowId` 기준 갱신으로 칸 글자를 되돌리는지 — 시험은 새 객체가 가는 것까지만 본다(브라우저 확인 필요). (2) happy-dom 에서 AG Grid 가 동작 칸의 단추(`var-clear-*`)를 그리는지 — `debug-mode.test.ts` 9번이 핀 칸 렌더러를 누르는 것으로 보아 그린다고 보았다. (3) shared `Button` 이 `title` 을 DOM 에 그대로 싣는지 — `DebugToolbar` 가 이미 `title` 을 쓰므로 그렇다고 보았다. (4) `varColumns` 의 `editable` 함수가 `rowClassRefreshToken` 없이도 `canEdit` 변화를 따라가는지 — 행 객체의 `canEdit` 가 바뀌면 AG Grid 가 새 행 데이터로 다시 판단한다고 보았고, 안전하게 `rowToken` 도 넘긴다.
- Task 1 이 `RunTrace.edits` 를 선택 필드(`edits?: TraceEdit[] | null`)로 만든다는 전제다. 이름이 다르면 두 태스크의 import·`trace.edits` 를 그 이름으로 바꾼다.
- `debug-model.test.ts:110` 의 `toEqual` 은 `DebugVar.edited` 가 늘어 깨지므로 Task 10 Step 2 가 고친다. 그 밖에 `DebugVar`·`TraceFrame` 전체를 `toEqual` 로 견주는 시험은 찾지 못했다. `execute` 매개변수를 `toStrictEqual` 로 견주는 시험도 없다(`editsJson: undefined` 는 `callOasis` 가 뺀다).
- **값 비우기의 null(Task 1·2·3 에 넘길 조건)**: [비우기]는 `"GT_G":null` 을 보낸다. `editsJson` 을 풀어 `TraceEdit` 을 만들 때 `Map.copyOf`·`Map.of` 는 null 값에서 NPE 를 던지므로, `values` 는 null 값을 담는 `LinkedHashMap` 으로 두어야 한다(엔진 `putReplacing` 까지 null 이 가야 비우기가 된다). 화면 시험은 목 서버라 이 결함을 잡지 못한다.
- `sim.setCursor` 를 부르는 곳은 이 화면에 없다(`state/useFind.ts` 의 `setCursor` 는 찾기 자체 상태다). 그래서 `setCursor` 가 대기를 버리는 것(편차 후보 5)이 사용자 몰래 일어나는 경로는 지금 없다.
- 기능설계서 §4.1 의 새 필드 번호 D-018·D-019 는 다른 4단계 태스크가 같은 번호를 쓰면 나중에 병합하는 쪽에서 컨트롤러가 번호를 다시 매긴다.

---

### Task 12: 문서·결정

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 D-124~D-128 추가, append-only)
- Modify: `docs/idea.md`(「MDM 화면」의 룰 세트 디버거 메모)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(태스크들이 쓴 행 사이의 겹침·번호만 정리)

**Interfaces:**
- Consumes: Task 1~11 의 병합 커밋, 진행 장부의 Ruling 과 각 태스크 보고서의 편차.
- Produces: 없음(문서).

- [ ] **Step 1: decisions.md 끝 형식 확인**

Run: `tail -n 40 docs/mdm/decisions.md`
Expected: 마지막 항목이 `## D-123 (2026-09-30T00:00:00Z)` 이고, 항목마다 `- **Phase**:`·`- **Decision needed**:`·`- **Decision made**:`·`- **Rationale**:`·`- **Reversible**:`·`- **Source**:` 여섯 줄이다.

- [ ] **Step 2: D-124~D-128 을 끝에 더한다**

아래 다섯 항목을 앞 항목과 같은 형식으로 쓴다. 각 항목의 **Source** 끝에 해당 태스크 병합 커밋 해시를 덧붙인다(`/usr/bin/git log --oneline --merges feat/rule-set-flow-phase4` 에서 찾는다). 진행 장부에 이 기능에 관한 Ruling 이 있으면 결정 줄 끝에 "(Ruling N)" 으로 덧붙인다.

```markdown
## D-124 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 디버거에서 멈춘 지점의 값을 고쳐 이어 실행하는 방식(스펙 §2)
- **Decision made**: 룰 세트 디버거의 "값 고쳐 이어 실행" 은 엔진을 중간부터 재개하지 않고, 처음부터 다시 실행하며 k 번째 노드를 시작하기 직전에 고친 값을 그 범위 ctx 에 넣는다(`RunTrace.edits`, `execute.editsJson`). 같은 이름이 그 범위에서 이미 만든 결과면 결과도 바꾼다(대소문자 무시). 병렬 갈래 안에서 고친 입력은 그 갈래 안에서만 보인다. 자리 노드 ID 가 어긋나거나 정상 완료 때 안 쓰인 고침이 남으면 `EDIT_POINT_MISMATCH`.
- **Rationale**: 실행이 결정적이라 앞 기록이 같게 나오고, 병렬 갈래 스택 복원·prepare 키 검사 범위 조정·기록 이어 붙이기가 필요 없다. 고친 값은 이번 디버그 실행에만 남긴다(사용자 결정).
- **Reversible**: yes
- **Source**: 스펙 §2, idea.md E4. 영향: 엔진 계약(RunTrace·TraceEdit·위반 코드), `RuleEngine.traceSet` 겹정의, `RuleSetSimulateRequest.editsJson`, 화면 디버거.

## D-125 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 입출력 없이 지나가는 노드와 룰을 나중에 채우는 방법(스펙 §1.1·§1.2)
- **Decision made**: 룰 ID 없이 제목만 가진 노드 종류 `TASK`(화면 이름 "빈 단계")를 둔다. 실행·기록 실행 모두 아무것도 읽거나 만들지 않고 지나가며, 저장은 막지 않고 검증 경고만 낸다. 팔레트 [룰] 은 룰 찾기 창 대신 빈 단계를 바로 놓고, 오른쪽 "룰 지정" 섹션에서 룰을 지정하면 같은 노드 ID 의 RULE 노드로 바뀐다. 룰 찾기 창(`RuleSearchModal`)은 지운다.
- **Rationale**: 흐름 그림을 먼저 그리고 룰을 나중에 채우는 작업 방식(사용자 요청).
- **Reversible**: no(흐름 JSON 에 TASK 가 저장된다)
- **Source**: 스펙 §1, 사용자 요청. 영향: 엔진 계약 `NodeKind.TASK`, 흐름 JSON, 화면 팔레트·노드·오른쪽 패널.

## D-126 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: Camunda 식 선 편집(스펙 §3)
- **Decision made**: 편집 모드에서 선에 마우스를 올리거나 선을 고르면 꺾는 점(원)과 가로·세로 선분 가운데의 선분 손잡이(막대)를 보인다. 선분 손잡이는 선분을 수직으로만 옮기고, 끄는 동안 일직선(화면 6px)에 맞추며 놓을 때 한 직선 위의 가운데 점과 길이 0 선분을 지워 합친다. 자동 경로는 `@xyflow/system@0.0.83` `getPoints` 이식본으로 점을 구해 처음 끌 때 저장 경로로 바꾼다.
- **Rationale**: Camunda Modeler 와 같은 선 편집(사용자 요청). 그리기는 그대로 `getSmoothStepPath` 라 처음 끌 때 모양이 튀지 않는다.
- **Reversible**: yes
- **Source**: 스펙 §3, 사용자 요청. 영향: `route-path.ts`, 캔버스 선 보기. `@xyflow/system` 을 올리면 이식본과 시험을 다시 맞춘다.

## D-127 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 그룹 크기 저장 방식(스펙 §4)
- **Decision made**: 그룹 크기는 소속 노드 경계 바깥 여백 `view.groups[].pad {l,t,r,b}`(0~2000)로 저장한다. 크기를 바꿔도 소속은 바뀌지 않는다.
- **Rationale**: 소속 노드를 옮기면 그룹이 따라가고, 소속 노드보다 작게 줄지 않는다.
- **Reversible**: yes(선택 필드)
- **Source**: 스펙 §4, 사용자 요청. 영향: view 저장 형식(선택 필드), 캔버스 그룹.

## D-128 (2026-10-01T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 4단계)
- **Decision needed**: 편집 화면 배치(스펙 §1.3)
- **Decision made**: 편집 화면 배치를 Camunda Modeler 식으로 바꾼다. 왼쪽 룰 패널 대신 캔버스 안 떠 있는 도구 상자([손]·[영역 선택]·[공간] + 요소 아이콘, 툴팁), 미니맵은 오른쪽 위, 오른쪽 패널은 머리글(종류 아이콘·종류·이름) + 접는 섹션이며 룰 목록은 그 섹션("룰 목록"/"룰 지정")이다.
- **Rationale**: 사용자 요청(아이콘 사이드바·오른쪽 룰 선택, Camunda Modeler 화면과 비슷하게).
- **Reversible**: yes
- **Source**: 스펙 §1.3, 사용자 요청. 영향: 3단계 P-D10(왼쪽 룰 패널 배치)을 대체한다. e2e 선택자.
```

- [ ] **Step 3: idea.md 메모를 완료로 옮긴다**

`docs/idea.md` 의 「MDM 화면」 아래 `(다음 주 개발, 2026-09-30 보류) 룰 세트 디버거: …` 줄과 그 아래 두 하위 줄을 다음 한 줄로 바꾼다.

```markdown
  - (완료 2026-10-01, D-124) 룰 세트 디버거: 중단점에서 변수 값을 고쳐 이어 실행 — 처음부터 다시 실행하며 고친 값을 끼워 넣는 방식
```

- [ ] **Step 4: 기능설계서 정리**

Run: `grep -n "D-12[4-8]\|빈 단계\|선분\|그룹 크기\|도구 상자\|고침" docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
Expected: Task 3·5·6·7·8·9·11 이 쓴 행이 모두 보인다. 같은 기능을 두 태스크가 따로 적은 행이 있으면 하나로 합치고, 행 번호(B-0xx·A-0xx 등) 가 겹치면 뒤 번호로 고친다. 각 행 끝에 결정 번호(D-124~D-128)를 단다.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/idea.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): 룰 세트 흐름도 4단계 결정 D-124~D-128 과 기능설계서·아이디어 메모를 정리한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2" -- docs/mdm/decisions.md docs/idea.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
```

---

## 최종 검증(컨트롤러)

- [ ] feat 트리에서 엔진·lib·api·화면 전체 테스트와 `rtk proxy pnpm --dir src/frontend --filter @dk-oasis/m-mdm run lint` 를 돌려 기준선 대비 증감을 장부에 적는다.
- [ ] `grep -rn "SEAM(" src/frontend/m-mdm/pages/dme/ruleSetEdit src/backend` 가 0 건.
- [ ] e2e 는 `--list` 만 돌려 목록이 깨지지 않았는지 본다(실제 실행은 사용자 승인 뒤).
- [ ] 가장 강한 모델로 브랜치 전체 리뷰(`superpowers:requesting-code-review`)를 한 번 받고, 지적은 한 번의 고침 + 범위 재리뷰로 닫는다.

## 수동 브라우저 확인(컨트롤러, ego-browser, dev 병합 뒤 본체 재기동)

서버가 내려가 있으면 묻지 않고 재시작하지 않는다(사용자에게 알린다). 테스트용 세트는 새로 만들지 말고 기존 테스트 세트(`ZZ_BROWSER_CHECK_1` 등)를 쓴다.

1. 편집 모드: 왼쪽 위 도구 상자가 보이고 아이콘에 마우스를 올리면 이름 툴팁이 뜬다. [손]·[영역 선택]·[공간] 이 빈 곳 끌기를 바꾸고 Esc 가 [영역 선택] 으로 돌린다. 미니맵이 오른쪽 위에 있다.
2. [룰] 아이콘을 선 위에 끌어 놓으면 빈 단계가 끼워지고 오른쪽 "룰 지정" 섹션이 열린다. 룰 줄 [지정] 으로 RULE 노드가 되고, 되돌리기 한 번에 빈 단계로 돌아간다.
3. 선에 마우스를 올리면 점·선분 손잡이가 뜬다. 가운데 선분을 끌면 직각을 유지하며 옮겨지고, 이웃 선분과 일직선이 되면 합쳐진다. 자동 경로 선을 처음 끌 때 모양이 튀지 않는다.
4. 그룹을 고르고 모서리를 끌면 크기가 바뀐다. 소속 노드를 옮기면 그룹이 따라간다. 저장 뒤 다시 열어도 크기가 같다.
5. 디버그 모드: 중단점에서 멈춰 변수 값을 고치고 [계속] 을 누르면 뒤쪽 경로·최종 결과가 고친 값 기준으로 바뀐다. 툴바에 "고친 값 N건" 이 보이고 [기대값으로] 가 막혀 있다. 빈 단계 노드에서 한 단계에 멈추고 지나간다.
6. 오른쪽 패널: 아무것도 안 고르면 룰 세트 머리글과 섹션, 노드를 고르면 그 종류 머리글로 바뀐다. 섹션을 접고 펼친 상태가 같은 종류로 돌아오면 유지된다.
