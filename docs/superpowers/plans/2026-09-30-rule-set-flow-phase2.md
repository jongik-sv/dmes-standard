# 룰 세트 흐름도 2단계 구현 계획 — 캔버스 편집기·디버거

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트 편집 화면(`dme/ruleSetEdit`)의 룰 목록 그리드 자리를 React Flow 캔버스로 바꿔 분기(IF·병렬) 흐름을 그리고 저장하게 하고, 저장 전 흐름을 서버에서 기록 실행(`traceSet`)해 노드 단위로 앞뒤로 넘겨 보는 디버거를 더한다. 그 전에 스펙 §9.1 착수 조건 9항을 처리한다.

**Architecture:** 서버는 흐름을 `flowJson` 문자열로 받아(§9.1-1 실측) 정규화해 저장하고, `ruleSetEdit.bpmn` 에 `validate`(조건식 IO)·`execute`(기록 실행 = 디버거) action 을 더한다. 실행 기록은 엔진 계약 스키마(`RunTrace`) 그대로 JSON 으로 내보내고 골든 파일로 고정한다. 화면은 순수 TS 모듈(편집 연산 `flow-edit.ts`, 배치 `flow-layout.ts`, 변수 표시 `flow-vars.ts`, 기록 해석 `trace-view.ts`)과 그 위의 React Flow 컴포넌트로 나눈다. 검사는 1단계의 `flowChecks`(서버 분석기와 코퍼스로 동치)를 화면에서 그대로 쓴다.

**Tech Stack:** Java 21, Spring Boot + OASIS(BPMN), SQLite + Flyway, JUnit 5, networknt json-schema-validator 1.5.9(테스트), TypeScript + React 19 + Mantine 9.6, `@xyflow/react` 12.x, `@dagrejs/dagre`, Vitest(happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` (§7 캔버스, §8 디버거, §9·§9.1). 1단계 계획 `docs/superpowers/plans/2026-09-30-rule-set-flow-phase1.md` 의 공유 계약 C1~C7·편차 D1~D12 는 그대로 유효하다.

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow-2`, 브랜치 `feat/rule-set-flow-phase2`(dev 0915e67a 에서 분기). 병렬 태스크는 각자 하위 워크트리(`.claude/worktrees/rsf2-tN`, 브랜치 `rsf2-tN`)에서 하고 리뷰 뒤 이 브랜치로 병합한다. 모든 명령은 해당 워크트리 루트 기준이다.

---

## Global Constraints

- 화면은 **기존 `dme/ruleSetEdit` 안에서** 바꾼다(2026-09-30 사용자 확인). 새 메뉴·새 화면 ID 를 만들지 않는다.
- 패키지: 엔진 `kr.dongkuk.maru.mdm.engine.*`, MDM 앱 `com.dongkuk.dmes.mdm.*`. 엔진 main 의존은 EvalEx 하나뿐이다. **이 계획은 엔진 main 코드와 엔진 계약(Java 타입·스키마·생성 TS·engine-contract.md)을 바꾸지 않는다.**
- OASIS params 에 `Map`·`List` 를 최상위 DTO 속성으로 두지 않는다. 중첩 객체는 JSON 문자열(`flowJson`·`recordJson`)로 받는다. 근거: 2026-09-30 실측 — `params.flow`(Map) 로 save 를 부르면 `S999 "Generic type. You must explicitly specify the type for a generic type"`(OASIS `CactusRequestConverter`). `RuleTestRequest.caseIds` 주석과 같은 원인이다.
- 새 action 이름을 만들지 않는다. `MdmActions` 16개 어휘(ADR-0003 D5) 안에서 고른다: 조건식 IO = `validate`, 디버거 기록 실행 = `execute`. 둘 다 EDIT 권한이다(`MdmPermissions.EDIT_ACTIONS`). mcm 시드 `allActions` 는 이미 두 이름을 갖고 있어 바꾸지 않는다.
- `docs/mdm/decisions.md` 는 append-only 다. 이 계획의 결정은 Task 0 이 D-111 부터 한 번에 남긴다. 다른 태스크는 decisions.md 를 고치지 않는다.
- 서버 `RuleSetAnalyzer` 와 화면 `set-model.ts` 는 같은 입력에 같은 `checks` 를 낸다. 코퍼스 `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json` 의 목록 사례 1~18 은 바이트 단위로 그대로 둔다. 코퍼스 사본을 m-mdm 안에 두지 않는다(기존 I9 테스트).
- mdm BPMN 을 바꾸면 `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest`·`DmeOasisHttpTest` 로 검증한다(`check_oasis_contract.py` 는 mdm 을 보지 않지만 커밋 전 ERROR 0 은 확인한다).
- 화면 작업은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 따른다. 규칙 정본은 `docs/guide/FrontEnd/Local-Rules.md`(특히 §6 action 소문자 표준 코드, §8 한 변 색 바 금지, §9 중요 액션 UX, §11 늦은 응답 버리기, §13 오류 문장·코드 툴팁, §16 무거운 계산 의존성). 바꾼 파일은 커밋 전 스킬의 `audit` 두 개가 0건이어야 한다.
- `@xyflow/react`·`@dagrejs/dagre` 는 `src/frontend/m-mdm/package.json` 에만 넣는다. React Flow 스타일시트는 캔버스 컴포넌트 파일에서만 import 한다.
- 새 화면 컴포넌트 테스트는 기존 관례대로 `tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 테스트는 파일 머리에 `/** @vitest-environment happy-dom */`.
- DB 검증은 SQLite 만 쓴다. 도커를 쓰지 않는다. 구현 태스크는 서버(bootRun·local-run·fe-run)를 띄우지 않는다(브라우저 확인 Task 13 만 예외).
- git: 워크트리 루트에서 `/usr/bin/git` 로 단순 한 줄 명령만 쓴다. 커밋은 자기가 만든·고친 파일만 경로로 지정한다(`/usr/bin/git add <paths>` 후 `/usr/bin/git commit -m "..." -- <paths>`). `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(scope): 한국어 요약` + 끝 줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 테스트 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / 한 클래스: `../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --console=plain`
  - mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 엔진(읽기 전용 확인): `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
  - 화면: 워크트리에서 처음 한 번 `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`. 테스트 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`, 타입 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm lint`. 완료 게이트(Local-Rules §2-1): `pnpm --dir src/frontend --filter "@dk-oasis/m-mdm^..." build && pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 후 `[m-mdm test 합계]` 줄을 읽는다.
- 기준선: 착수 때 컨트롤러가 위 명령으로 한 번 돌려 진행 장부에 적는다. 1단계 마감 기록: 엔진 1446/0, lib 1220/0, api 1213/1(기존 실패 `MdmDomainCodeFkRebuildTest` — V13 기인, 범위 밖), 화면 117/0.

## Review Focus

1. **옛 경로가 캔버스 흐름을 지우는 경우** — FLOW_JSON 이 저장된 세트(한 줄이라도 배치·메모가 있음)에 `flowJson` 없는 목록 저장이 오면 거부해야 한다. 흐름·배치가 조용히 사라지면 안 된다. 담당: Task 1.
2. **바인더·코덱이 타입을 조용히 바꾸는 경우** — `order` 가 문자열 `"1"` 이면 지금 코덱은 null 로 읽어 모든 IF 가 "순서가 없다"로 거부된다. 문자열 `"true"` otherwise, 숫자 id 도 조용히 통과한다. 모두 형식 오류(MDM021)로 거부하고, 저장 JSON 은 파싱한 정의로 다시 만든다. 담당: Task 1.
3. **편집 뒤 디버거 표시가 옛 흐름을 가리키는 경우** — 실행 뒤 노드를 지우거나 선을 바꾸면 기록의 nodeId 가 캔버스에 없거나 다른 뜻이 된다. 흐름이 바뀌면 실행 표시를 지우고 안내한다. 담당: Task 11.
4. **병렬 갈래의 값 표** — 갈래는 분기 직전 값의 사본에서 돌고 합류에서 갈래 순서대로 덮어쓴다. 값 표가 첫 갈래 값을 두 번째 갈래 단계에 보이면 안 된다. 담당: Task 8(골든 기록으로 고정).
5. **늦게 온 조건식 IO 응답** — 조건식을 빠르게 고치면 `validate` 응답이 순서 바꿔 온다. 요청 순번으로 늦은 응답을 버리고, 응답을 기다리는 동안 저장을 막는다. 담당: Task 10.

---

## 편차 기록 (스펙·앞 결정과 다르게 정한 것 — Task 0 이 decisions.md 에 남긴다)

| # | 스펙·앞 결정 | 이 계획 | 이유 |
|---|---|---|---|
| P-D1 | 1단계 C6 `RuleSetSaveRequest.flow`(Map), §9.1-1 "HTTP 바인딩 확인" | `flowJson`(String) 으로 받는다. `flow` Map 칸은 없앤다 | 2026-09-30 실측: OASIS 가 params 의 Map 을 `S999 Generic type` 으로 거부한다 |
| P-D2 | 스펙 §6.2·D-108 action 이름 `simulate`(`execute` 가 아님) | 화면 action 은 `execute`, 서비스 메서드 이름은 `simulate`. 조건식 IO 는 `validate` → `condIo` | 16개 어휘(ADR-0003 D5)·mcm 시드 `allActions` 를 바꾸지 않는다. 룰 편집 값 테스트(`ruleEdit` `execute` → `runTest`)가 같은 선례다. D-108 의 이름 조항을 대체한다 |
| P-D3 | (결과) | `execute` 는 EDIT 권한이라 DME 에서 READ 인 표준 관리자(`MDM_STD_ADMIN`)는 디버거를 쓰지 못한다 | P-D2 의 결과. 최종 보고에 사용자 확인 사항으로 올린다 |
| P-D4 | 1단계 기능설계서 N-8 "화면 즉시 검사는 저장 버튼을 막지 않는다" | 캔버스에서는 거부(REJECT) 검사가 있으면 저장을 막는다 | 스펙 §7 "오류가 있으면 저장을 막는다". 서버도 같은 검사로 거부한다 |
| P-D5 | 스펙 §7 "목록 그리드 자리를 캔버스로" | 목록 편집(그리드·▲▼✕·드래그)을 없앤다. 한 줄 세트도 캔버스로 편집한다. 구성 지침의 "이 순서를 목록에 적용"은 한 줄 흐름이면 `linearFlow(순서)` 로 흐름을 바꾸고(배치 초기화), 분기 흐름이면 끈다 | 스펙대로. 지침 버튼 처리는 1단계 Ruling 13 과 일관 |
| P-D6 | §9.1-8 "흐름 크기·중첩 깊이 상한" | 코덱 입구에서 노드 200·선 400·JSON 262,144자 상한만 둔다. 깊이 상한은 따로 두지 않는다 | 중첩 한 단계마다 노드 2개(분기·합류)가 들므로 노드 200 이면 깊이가 99 를 넘지 못한다. 99단 중첩 IF 를 Java `FlowParser`·TS `parseFlow` 가 모두 통과함을 테스트로 보인다(Task 1) |
| P-D7 | §9.1-5 "선언 타입 없는 조건식 변수 경고" | 세트 저장 검사에 `COND_UNTYPED`(WARN) 를 더한다. 대상은 DICT 출처 조건식 변수 가운데 세트 안 어느 룰의 입출력(`RuleIo.conds ∪ results`)에도 없는 이름(대소문자 무시). RELEASED 가 없는 룰은 입출력을 모르므로 선언에 치지 않는다 | 엔진 `FlowKeys.condTypes` 가 보는 선언(계약 always·DERIVE 행 required·optional·RESULT 열)과 `RuleIoReader` 의 conds·results 가 같은 집합이다(N-4). Task 2 가 대조 테스트로 고정한다 |
| P-D8 | 스펙 §8 "세트 입력 변수(DICT 출처 이름)로 폼" | 입력 폼은 `flowIo` 의 입력 변수 가운데 출처가 DICT·PROG 인 이름으로 만든다. NONE 은 폼에 두지 않는다(검사가 이미 거부한다) | PROG(프로그램 변수)도 레코드로 넣어야 판정된다 |
| P-D9 | §9.1-9 "MDM021 대신 저장값 손상 전용 오류 코드" | `MDM026 STORED_DEFINITION_CORRUPT` 를 더한다. `StoredDefinitionLookup` 이 저장값을 읽다 난 `IllegalArgumentException`·`IllegalStateException` 을 `StoredDefinitionException` 으로 감싸고, `execute`·`simulate` 는 이 예외만 MDM026 으로 바꾼다. 그 밖의 IAE·ISE 는 감싸지 않는다(엔진 버그를 입력 오류로 가리지 않는다) | §9.1-9 |
| P-D10 | 스펙 §7 "팔레트 항목을 선 위에 끌어 놓기"(시안) | 선을 눌러 고른 뒤 팔레트 항목을 누르면 그 선에 끼운다. 고른 선이 없으면 END 로 들어가는 선에 끼운다. 팔레트에서 캔버스로 끌어 놓으면 놓은 자리에서 가장 가까운 선(중점 거리 80px 안)에 끼운다 | 누르기 방식은 키보드·테스트로 검증할 수 있고, 끌어 놓기는 같은 연산을 부른다 |

## 삭제 대상 (사용자 확인 필요 — 계획 검토 때 함께 확인받는다)

| 대상 | 처리 |
|---|---|
| `src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleListGrid.tsx` | 파일 삭제(룰 목록 그리드) |
| `src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx` | 파일 삭제. 머리·버튼·메시지는 `canvas/FlowToolbar.tsx`, 세트명·설명은 `panels/SetPanel.tsx` 로 옮긴다 |
| `useRuleSetEdit.ts` 의 `ids`·`moveUp`·`moveDown`·`remove`·`reorder`·`addRule` | 없앤다(흐름 상태·편집 연산으로 바뀐다) |
| `rule-set-edit-page.test.ts` 의 목록 그리드 테스트(▲▼✕·드래그·룰 추가·분기 세트 읽기 전용 안내 `set-branched-notice`) | 캔버스 테스트로 바꿔 쓴다(Task 10) |
| e2e `src/frontend/e2e/mdm-ruleSetEdit.spec.ts` E2·E3·E6 의 목록 testid(`set-rule-up/down/remove-*`, `set-dep-later-*`, `set-rules-grid`) | 캔버스 testid 로 바꿔 쓴다(Task 12) |
| 서버 `RuleSetFlowJson.fromMap`·`write(Map)` | 쓰는 곳이 없어지면 지운다(Task 1·4) |

`set-model.ts` 의 목록 함수(`setIo`·`setDeps`·`setChecks`)는 코퍼스 동치 테스트가 쓰므로 남긴다.

---

## 공유 계약 (모든 태스크가 이 이름·서명·문구를 그대로 쓴다)

### P1. 저장 요청과 목록 저장 거부 (Task 1)

- `RuleSetSaveRequest`: `private String flowJson;`(getter·setter) 를 더하고 `Map<String,Object> flow` 칸을 없앤다. 화면은 params 에 `flowJson` 을 문자열로 싣는다(`grids` 없음).
- `RuleSetEditService.save`:
  - `flowJson` 이 null·공백이 아니면: 길이 검사 → `RuleSetFlowJson.parse` → `ruleIds` → `RuleIdRules.validateRuleId` → `requireSteward` → `RuleSetAnalyzer.checks(flow, io, condIo)` → 거부 없으면 `RuleSetFlowJson.canonical(flowJson)` 을 FLOW_JSON 에 쓴다. 코덱 IAE 는 기존 `invalidFlow`(MDM021 `흐름 형식이 올바르지 않습니다: {원인}`).
  - `flowJson` 이 없으면(목록 저장): 저장된 FLOW_JSON 이 있으면 거부한다. 분기 흐름이면 기존 문구, 한 줄 흐름이면 새 문구.
    - 분기: `FLOW_READONLY` REJECT `분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다`(기존 상수 `FLOW_READONLY_MESSAGE`)
    - 한 줄: `FLOW_READONLY` REJECT `흐름도로 저장한 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다`(새 상수 `FLOW_LIST_SAVE_MESSAGE`)
    - FLOW_JSON 이 없는 세트의 목록 저장은 지금과 같다(FLOW_JSON 은 계속 null).
- `RuleSetViewResult` 에 `Map<String, CondIo> condIo` 를 더한다(저장된 흐름의 IF "그 외"가 아닌 선마다, 흐름이 없거나 읽지 못하면 빈 맵). TS `RuleSetView.condIo: Record<string, CondIo>`.

### P2. 흐름 코덱 `RuleSetFlowJson` (Task 1)

```java
public static final int MAX_NODES = 200;
public static final int MAX_EDGES = 400;
public static final int MAX_JSON_CHARS = 262_144;

public static FlowDefinition parse(String json);          // 엄격 읽기(아래 규칙). IAE 로 거부
public static String canonical(String json);              // 엄격 읽기 후 정규 JSON 문자열
public static Map<String, Object> toMap(String json);     // 그대로(조회 응답)
public static boolean branched(FlowDefinition flow);      // 그대로
public static List<String> ruleIds(FlowDefinition flow);  // 그대로
```

엄격 읽기 규칙(위에서부터 검사, 처음 걸린 것으로 IAE):

| 조건 | IAE 문구 |
|---|---|
| `json.length() > MAX_JSON_CHARS` | `흐름 JSON 이 {n}자다. {MAX_JSON_CHARS}자까지 받는다` |
| JSON 문법 오류 | `흐름 JSON 을 읽을 수 없다: {원인}`(기존) |
| 루트가 객체가 아님 | `흐름은 JSON 객체여야 한다`(기존) |
| `version` 이 정수 1 이 아님(문자열 `"1"`·`1.0`·없음 포함) | `흐름 형식 버전은 정수 1 이어야 한다` |
| `nodes`·`edges` 가 배열이 아님 | `흐름의 {field} 는 배열이어야 한다`(기존) |
| 노드 수 > 200 | `노드가 {n}개다. 흐름 하나에 200개까지 둔다` |
| 선 수 > 400 | `선이 {n}개다. 흐름 하나에 400개까지 둔다` |
| 노드·선 원소가 객체가 아님 | `{where} 는 객체여야 한다` |
| 문자열 칸(`id`·`kind`·`ruleId`·`splitId`·`label`·`from`·`to`·`cond`)이 있는데 JSON 문자열이 아님(null 은 허용) | `{where}.{field} 는 문자열이어야 한다` |
| 필수 문자열 칸(노드 `id`·`kind`, 선 `id`·`from`·`to`)이 없거나 공백 | `{where}.{field} 가 없다`(기존) |
| `kind` 를 모름 | `노드 종류 {kind} 를 모른다`(기존) |
| `order` 가 있는데 정수 JSON 숫자가 아님(null 허용, `1.5`·`"1"` 거부) | `{where}.order 는 정수여야 한다` |
| `otherwise` 가 있는데 JSON 불린이 아님(null 허용) | `{where}.otherwise 는 true/false 여야 한다` |
| `view` 가 있는데 객체가 아님(null 허용) | `흐름의 view 는 객체여야 한다` |

`{where}` 는 `nodes[i]`·`edges[i]`. 문자열 칸의 값은 `asText()` 가 아니라 `textValue()` 로 읽는다.

정규 JSON(`canonical`): 키 순서와 null 쓰기가 고정이다. `view` 는 받은 객체를 그대로 싣고, 없거나 null 이면 `{"positions":{},"notes":[],"groups":[]}` 를 싣는다.

```json
{"version":1,
 "nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null}],
 "edges":[{"id":"e1","from":"start","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],
 "view":{"positions":{},"notes":[],"groups":[]}}
```

화면 `flowJsonOf`(P7)는 같은 키 순서로 쓴다(서버 정규화 결과와 문자열이 같아야 dirty 비교가 맞다).

### P3. 세트 저장 검사 `COND_UNTYPED` (Task 2)

- 코드 상수: Java `RuleSetCheck.COND_UNTYPED = "COND_UNTYPED"`, TS `RuleSetCheckCode` 에 `"COND_UNTYPED"`. 심각도 WARN.
- 위치: 계획 1단계 C4.1 조건식 검사 안. 변수 v 하나마다 기존 판정(DICT 이거나 defined 면 통과 / maybe 면 FLOW_PARTIAL / 그 밖은 FLOW_COND)을 먼저 하고, **v.source 가 DICT 이면** 이어서 선언 검사를 한다.
- 선언 집합 `declared`: 트리의 `ruleIds()` 가운데 `rules` 에 입출력이 있는 룰(`exists && releasedVer != null`)의 `conds` 와 `results` 이름 전부. 대소문자를 가리지 않는다(Java `toUpperCase(Locale.ROOT)`, TS `toUpperCase()` — 두 쪽 모두 ASCII 이름만 온다). 경로와 무관하게 세트 전체로 센다(엔진 `FlowKeys.declared` 가 세트 전체 룰로 만든다).
- v 가 `declared` 에 없으면: `RuleSetCheck(COND_UNTYPED, WARN, ruleId=null, otherRuleId=null, varName=v, message, nodeId=IF ID, edgeId=e.id)`
- 문구: `{e.id} 갈래 조건식이 읽는 {v}는 세트 안 어느 룰도 타입을 선언하지 않아 레코드 값 그대로 비교한다. 숫자를 문자열로 넘기면 사전순으로 비교된다`
- 목록 세트(한 줄 흐름)에는 IF 가 없으므로 목록 사례 1~18 의 기대값은 바뀌지 않는다.

### P4. 룰 확정 검사의 경로 상태 재사용 (Task 3)

- `com.dongkuk.dmes.mdm.common.rule.RuleSetPathState`(새 공개 클래스, `RuleSetAnalyzer` 의 `State`·`split` 합치기 규칙을 옮긴다):

```java
public final class RuleSetPathState {
    /** 노드별 "그 노드 직전 경로 상태" — defined(반드시 정의됨)·maybe(일부 IF 갈래에서만). */
    public record At(Set<String> defined, Set<String> maybe) {}
    /** 트리를 깊이 우선으로 돌며 RULE 노드마다 직전 상태를 적는다. produces 는 룰 ID → 만드는 이름. */
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces);
}
```

- `RuleSetAnalyzer` 는 이 클래스의 합치기 규칙을 쓰도록 바꾸되 코퍼스 결과는 바이트 단위로 같다.
- `RuleSetOrderCheck` 의 `SET_IF_SIBLING`·`SET_PAR_SIBLING`(읽기)는 노드 쌍 단위로 판정한다: me 노드 a·other 노드 b 가 EXCLUSIVE(또는 PARALLEL) 일 때, a 가 읽는 이름 가운데 b 가 만들고 `before(a).defined ∪ before(a).maybe` 에 없는 것이 있으면 낸다(반대 방향 b 가 읽고 a 가 만드는 경우도 같은 규칙, `before(b)` 기준). 문구는 지금 것을 그대로 쓰되 `readsOther`·`readByOther` 자리에 걸러진 이름 집합을 싣는다. `SET_ORDER`·`SET_CYCLE`·`SET_DUP_RESULT`·병렬 같은 이름 대입(`dup`) 판정은 바꾸지 않는다.
- 합격 기준(두 방향으로 나눈다 — 분석기는 SIBLING 판정 전에 DICT 건너뛰기·`maybe`→FLOW_PARTIAL·같은 경로 뒤 생산자→ORDER/CYCLE 로 먼저 빠지므로 완전한 ⇔ 는 성립하지 않는다):
  - (가) **거친 판정 제거(핵심)**: 확정 검사가 me 를 읽는 쪽으로 변수 x 에 `SET_IF_SIBLING`·`SET_PAR_SIBLING`(읽기)을 내면, 세트 저장 검사도 me 의 같은 노드·같은 변수 x 에 거부 항목(`IF_SIBLING`·`PAR_SIBLING`·`ORDER`·`CYCLE` 중 하나)을 낸다.
  - (나) **놓침 없음**: 세트 저장 검사가 `ruleId = me` 인 `IF_SIBLING`·`PAR_SIBLING`(읽기 문구) 항목을 내면, 확정 검사도 me 에 `SET_IF_SIBLING`·`SET_PAR_SIBLING` 을 낸다.
  - 대조에서 빼는 사례: 구조 오류가 있는 흐름, DICT 조건 이름과 어떤 룰의 결과 이름이 겹치는 흐름(분석기는 DICT 를 건너뛰고 확정 검사는 이름만 본다). 뺀 사례 수를 보고서에 적는다.

### P5. 서버 기록 실행·조건식 IO (Task 4)

BPMN `services/dme/ruleSetEdit.bpmn` action 을 7개로 늘린다.

| action | 메서드 | readOnly | 권한 |
|---|---|---|---|
| search·view | (그대로) | true | READ |
| save·delete·restore | (그대로) | false | EDIT |
| `validate` | `ruleSetEditService.condIo` | false | EDIT |
| `execute` | `ruleSetEditService.simulate` | false | EDIT |

(readOnly 는 `ruleEdit` 의 `validate`·`execute` 와 같이 false — `DmeBpmnActionTest` 주석 "EDIT 권한 액션이라 readOnly 가 아니다")

권한 경로(2026-09-30 확인): MDM 권한은 역할 × 메뉴(OBJECT_ID)에 권한 세트를 매핑한다(mcm `DataInitializer` `TB_MCM_SEC_ROLE_MAPPING`, 매트릭스 `dme: MDM_STD_ADMIN→PERM_MDM_READ, MDM_STEWARD→PERM_MDM_CONFIRM`). `PERM_MDM_EDIT`·`PERM_MDM_CONFIRM` 의 `PERMISSION_ACTION` 에 `validate`·`execute` 가 이미 있으므로 메뉴·권한 시드는 바꾸지 않는다. 담당자는 두 action 이 허용되고 표준 관리자는 BFF RBAC 가 403 으로 막는다.

DTO(`com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto`):

```java
public class RuleSetCondIoRequest { private String flowJson; }            // getter·setter
public class RuleSetCondIoResult { private Map<String, CondIo> condIo; }   // getter·setter
public class RuleSetSimulateRequest { private String flowJson; private String recordJson; private String evalTs; }
public class RuleSetSimulateResult { private Map<String, Object> trace; private List<Map<String, Object>> warnings; }
```

`RuleSetEditService`:
- `condIo(req)`: `flowJson` 필수(없으면 `REQUIRED_VALUE` `흐름은 필수입니다.`) → `RuleSetFlowJson.parse`(IAE → MDM021 `invalidFlow`) → `ioReader.condIo(flow)`. `requireSteward` 는 부르지 않는다(권한 action 이 막는다, 읽기만 한다).
- `simulate(req)`:
  1. `flowJson` 필수(`흐름은 필수입니다.`). `recordJson` 이 null·공백이면 `{}`, 객체가 아니면 `INVALID_VALUE` `레코드 JSON 은 객체여야 합니다: {원문}`(`RuleCaseJudge.object` 가 null 을 돌려줄 때). `evalTs` 가 있으면 `yyyy-MM-dd HH:mm:ss` KST(형식 오류 `INVALID_VALUE` `판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: {원문}`).
  2. `RunTrace t = runner.trace(flowJson, record, ts)`.
  3. `trace = RunTraceJson.toMap(t)`, `warnings = 아래`.
  4. `StoredDefinitionException` 은 `MDM026` 으로 바꾼다(`MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — " + 원인, List.of())`).
- `warnings`(D-110 과 같은 모양 `{code, ruleId, message}`):
  1. 흐름을 읽을 수 있으면, 흐름 `ruleIds` 가운데 룰 상태가 DEPRECATED 인 것마다 `RULE_DEPRECATED` · `{id}는 폐기된 룰이지만 판정 시각에 유효한 RELEASED 버전으로 판정했다`(`RuleSetRunner` 의 문구와 같다. 공통 메서드로 뽑아 두 곳이 같이 쓴다).
  2. 기록의 IF 노드마다 `outcome == NULL` 인 갈래: `BRANCH_COND_NULL` · ruleId null · `IF {nodeId} 갈래 {edgeId} 조건식 결과가 NULL 이라 거짓으로 봤다`.
  3. 기록의 RULE 노드(seq 순)의 `result.warnings` 를 차례로 `{code: w.code().name(), ruleId: w.ruleId(), message: w.message()}`.

`RuleSetRunner`:
- `trace(Map flow, ...)` 를 `public RunTrace trace(String flowJson, Map<String,Object> record, @Nullable Instant evalTs)` 로 바꾼다. `record == null` 이면 `BusinessException(REQUIRED_VALUE, "레코드는 필수입니다.")`. 흐름을 읽지 못하면(IAE) 지금처럼 `nodes=[]`·`FLOW_INVALID` 기록.
- `execute` 의 `catch (IllegalArgumentException | IllegalStateException e)` 를 `catch (StoredDefinitionException e)` 로 좁히고 코드를 MDM026 으로 바꾼다(문구는 지금 것 유지).

`StoredDefinitionException`(새, `com.dongkuk.dmes.mdm.common.rule.definition`, `RuntimeException`): `StoredDefinitionLookup` 이 저장된 행·FLOW_JSON·AST 를 읽다 나는 `IllegalArgumentException`·`IllegalStateException`(그리고 지금 행 조립 실패로 던지는 `BusinessException`)을 원인으로 감싼다. 메시지는 원인 메시지 그대로.

`MdmErrorCode.STORED_DEFINITION_CORRUPT("MDM026", 500, ErrorCode.BUSINESS_ERROR, "저장된 룰 정의를 읽을 수 없습니다")`.

`RunTraceJson`(새, `com.dongkuk.dmes.mdm.common.rule`): `public static Map<String, Object> toMap(RunTrace t)` — 엔진 스키마 `$defs/RunTrace` 에 맞는 맵.
- 시각: `LocalDateTime.ofInstant(ts, MdmClockConfig.KST)` 를 `yyyy-MM-dd'T'HH:mm:ss` 로.
- 값(`input`·`finalValues`·`reads`·`result.results`): TypedValue — `null` → `{"type":"NULL"}`, `BigDecimal`·그 밖 `Number` → `{"type":"NUMBER","value": new BigDecimal(n.toString()).toPlainString()}`, `String` → STRING, `Boolean` → BOOLEAN(`"true"`/`"false"` 문자열), `List` → `{"type":"LIST","items":[…]}`. 그 밖의 타입은 `IllegalStateException("기록 값 타입을 모른다: " + 클래스)`.
- `NodeTrace`: 스키마 속성을 모두 싣되 `result` 가 null 이면 **키를 뺀다**. 나머지 null 칸은 null 로 싣는다. `kind`·`status` 는 enum 이름.
- `RuleResult`: `ruleId, ver, evalTs, hits[{rowId, seq, groupChoices}], defaultApplied, results, trace[{rowId, seq, evaluated, hit, firstFalseVarId}], warnings[{code, ruleId, rowId, varId, message}]`.
- `Violation`: `{stage, code, ruleId, rowId, name, message}`.

골든 파일(Task 4 가 만들고 Task 8 이 읽는다): `src/backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json`

```json
{"cases":[{"name":"...", "rules":"<시드 이름>", "flowJson":"<P2 정규 JSON 문자열>", "recordJson":"{...}", "evalTs":"2026-06-01 09:00:00",
           "response":{"trace":{...RunTrace...},"warnings":[...]}}]}
```

사례 이름(정확히 이 7개, 이 순서): `IF_FIRST_TRUE`, `IF_NULL_ELSE`, `IF_ERROR_STOPS`, `PARALLEL_MERGE`, `IF_IN_PARALLEL`, `STRUCTURE_ERROR`, `MISSING_INPUT`. 사례 내용은 Task 4 Step 1 에 있다.

### P6. 화면 API·타입 (Task 10·11 이 쓰고 Task 4 가 서버를 만든다)

```ts
// api.ts
export function saveSet(setId: string, setName: string, description: string, rowVersion: number, flowJson: string): Promise<RuleSetSaveResult>;
//   → callOasis(SERVICE, "save", { setId, setName: setName.trim(), description: blankToUndefined(description), rowVersion, flowJson })
export function validateFlow(flowJson: string): Promise<RuleSetCondIoResult>;          // action "validate"
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined): Promise<RuleSetSimulateResult>; // action "execute"

// types.ts
export interface RuleSetCondIoResult { condIo: Record<string, CondIo>; }
export interface SimWarning { code: string; ruleId: string | null; message: string; }
export interface RuleSetSimulateResult { trace: RunTrace; warnings: SimWarning[]; }   // RunTrace 는 @/contract/engine-contract.generated
// RuleSetView 에 condIo: Record<string, CondIo> 추가, RuleSetCheckCode 에 "COND_UNTYPED" 추가
```

### P7. 편집 흐름 모델 `flow-edit.ts` (Task 6)

```ts
import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

export interface FlowPos { x: number; y: number; }
export interface FlowNote { id: string; text: string; x: number; y: number; w: number; h: number; attach: string | null; }
export interface FlowGroup { id: string; title: string; nodeIds: string[]; }
export interface FlowView { positions: Record<string, FlowPos>; notes: FlowNote[]; groups: FlowGroup[]; }
export interface EditFlow extends RuleSetFlow { view: FlowView; }
export type EditResult = { ok: true; flow: EditFlow } | { ok: false; reason: string };

export const EMPTY_VIEW: FlowView;                                   // {positions:{}, notes:[], groups:[]}
export function toEditFlow(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): EditFlow;
export function flowJsonOf(f: EditFlow): string;                     // P2 정규 JSON 과 같은 키 순서
export function nextId(f: EditFlow, prefix: string): string;
export function insertRule(f: EditFlow, edgeId: string, ruleId: string): EditResult;
export function insertSplit(f: EditFlow, edgeId: string, kind: "IF" | "PARALLEL"): EditResult;
export function removeNode(f: EditFlow, nodeId: string): EditResult;
export function addBranch(f: EditFlow, splitId: string): EditResult;
export function removeBranch(f: EditFlow, splitId: string, edgeId: string): EditResult;
export function moveBranch(f: EditFlow, splitId: string, edgeId: string, dir: -1 | 1): EditResult;
export function updateEdge(f: EditFlow, edgeId: string, patch: { cond?: string | null; label?: string | null }): EditResult;
export function updateNodeLabel(f: EditFlow, nodeId: string, label: string | null): EditResult;
export function connect(f: EditFlow, from: string, to: string): EditResult;
export function removeEdge(f: EditFlow, edgeId: string): EditResult;
export function setPositions(f: EditFlow, pos: Readonly<Record<string, FlowPos>>): EditFlow;   // 덮어쓰기(병합)
export function addNote(f: EditFlow, at: FlowPos, attach: string | null): { flow: EditFlow; id: string };
export function updateNote(f: EditFlow, id: string, patch: Partial<Omit<FlowNote, "id">>): EditFlow;
export function removeNote(f: EditFlow, id: string): EditFlow;
export function addGroup(f: EditFlow, nodeIds: readonly string[], title: string): EditResult & { id?: string };
export function updateGroup(f: EditFlow, id: string, patch: { title?: string; nodeIds?: string[] }): EditFlow;
export function removeGroup(f: EditFlow, id: string): EditFlow;
```

규칙:
- 모든 함수는 입력을 바꾸지 않고 새 객체를 돌려준다. **돌려주는 노드·선은 모든 칸이 있다**: 노드 `{id, kind, ruleId, splitId, label}`, 선 `{id, from, to, order, cond, otherwise, label}`(없는 값은 null, otherwise 는 boolean). `parseFlow` 는 정규화하지 않으므로 이 모양이 곧 계약이다(1단계 carry).
- `nextId(f, p)`: `p1`, `p2`, … 가운데 노드·선·메모·그룹 ID 어디에도 없는 가장 작은 것. 접두어: 룰 `r`, IF `if`, 병렬 `par`, 합류 `m`, 선 `e`, 메모 `n`, 그룹 `g`.
- `toEditFlow(null, ids)` = `linearFlow(ids)` + `EMPTY_VIEW`. raw 가 있으면 nodes·edges 는 칸을 채워 복사하고, view 는 모양이 맞는 항목만 남긴다(positions 는 유한수 x·y 인 항목, notes·groups 는 필수 칸이 맞는 항목).
- `insertRule(e: A→B)`: 새 RULE `r` 을 만들고 e.to = r(e 의 order·cond·otherwise·label 은 그대로 — e 가 IF 갈래 선일 수 있다), 새 선 `{r → B}` 를 선 배열에서 e 바로 뒤에 넣는다.
- `insertSplit(e: A→B, kind)`: 분기 s·합류 m(`splitId = s`)을 만들고 e.to = s. 갈래 두 개와 합류 출구를 만든다.
  - IF: `{s→m, order:1, cond:null, otherwise:false, label:"갈래 1"}`, `{s→m, order:null, cond:null, otherwise:true, label:"그 외"}`
  - PARALLEL: `{s→m, order:1, label:"갈래 1"}`, `{s→m, order:2, label:"갈래 2"}`
  - 출구 `{m→B}`. 노드 배열에서 s·m 은 A 뒤(A 가 없으면 끝)에, 선은 e 뒤에 넣는다. 분기 노드 label 은 IF `"조건"`, PARALLEL `"병렬"`.
- `removeNode`:
  - RULE: 들어오는 선·나가는 선이 정확히 하나씩이어야 한다. 아니면 `룰 노드의 선이 하나씩이 아니라 지울 수 없다. 선을 먼저 정리한다`. 들어오는 선의 to 를 나가는 선의 to 로 바꾸고 나가는 선을 지운다.
  - IF·PARALLEL: 짝 합류(`splitId == id` 인 MERGE)가 정확히 하나이고 분기 들어옴·합류 나감이 하나씩이어야 한다. 아니면 `분기 {id}의 짝 합류를 찾지 못해 지울 수 없다`. 분기에서 합류까지(합류 제외) 나가는 선을 따라 닿는 노드를 모두 지우고, 들어오는 선의 to 를 합류 출구의 to 로 바꾼다. 지운 노드에 닿는 선은 모두 지운다.
  - START·END·MERGE: `{kind} 노드는 지울 수 없다`(START·END 는 `시작`·`끝`, MERGE 는 `합류` — 문구 `시작 노드는 지울 수 없다` / `끝 노드는 지울 수 없다` / `합류 노드는 분기를 지워서 없앤다`).
  - 지운 노드는 `view.positions` 에서 빼고, 그룹 `nodeIds` 에서 빼며(비면 그룹 삭제), 메모 `attach` 가 가리키면 null 로 둔다.
- `addBranch(s)`: IF 는 `order = (otherwise 아닌 선의 최대 order ?? 0) + 1`, `label = "갈래 {order}"`, otherwise 선 앞에 넣는다. PARALLEL 은 같은 order 규칙으로 끝 갈래 뒤에 넣는다. 짝 합류가 없으면 `분기 {id}의 짝 합류를 찾지 못했다`.
- `removeBranch(s, e)`: otherwise 선이면 `"그 외" 갈래는 지울 수 없다`. 남는 갈래가 2개 미만이면 `분기에는 갈래가 2개 이상 있어야 한다`. 갈래 안 노드(e.to 에서 합류 전까지)와 그 선, e 를 지운다.
- `moveBranch(s, e, dir)`: otherwise 가 아닌 선들을 order 로 정렬해 이웃과 order 값을 바꾼다. 끝이면 `더 옮길 수 없다`.
- `updateEdge`: 주어진 칸만 바꾼다(문자열은 그대로 저장, 공백 판정은 파서 몫).
- `connect(from, to)`: 같은 from·to 선이 이미 있으면 `이미 이어진 선이다`. 새 선은 order·cond·label null, otherwise false.
- `addGroup(ids)`: 노드가 1개 미만이면 `그룹에 넣을 노드를 고른다`. START·END 는 넣지 않는다(걸러낸다).

### P8. 배치·변수 표시 (Task 7)

```ts
// flow-layout.ts
export const NODE_SIZE: Readonly<Record<FlowNodeKind, { w: number; h: number }>>;
//   START·END {w:120,h:36}, RULE {w:232,h:68}, IF {w:176,h:44}, PARALLEL {w:200,h:14}, MERGE {w:28,h:28}
export function autoLayout(f: RuleSetFlow): Record<string, FlowPos>;      // dagre rankdir TB, nodesep 40, ranksep 46, 좌상단 좌표, 정수로 반올림
export function positionsOf(f: EditFlow): Record<string, FlowPos>;        // autoLayout 결과에 view.positions 를 덮는다

// flow-vars.ts
export function edgeChips(f: RuleSetFlow, rules: RuleIoMap): Record<string, string[]>;   // RULE 노드에서 나가는 선 → 그 룰 results 이름(순서대로), 결과 없으면 키 없음
export function nodeMarks(checks: readonly RuleSetCheck[]): Record<string, "REJECT" | "WARN">; // nodeId 있는 검사, 노드마다 가장 무거운 심각도
export function edgeMarks(checks: readonly RuleSetCheck[]): Record<string, "REJECT" | "WARN">; // edgeId 있는 검사
export function nearestEdge(f: RuleSetFlow, pos: Readonly<Record<string, FlowPos>>, at: FlowPos, max?: number): string | null;
//   선 중점 = (출발 노드 아래 가운데 + 도착 노드 위 가운데)/2, 거리 max(기본 80) 안에서 가장 가까운 선, 같으면 선 배열 앞쪽
```

### P9. 기록 해석 `trace-view.ts` (Task 8)

```ts
import type { FlowNodeKind, NodeTrace, RunTrace, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

export interface TraceFrame { index: number; node: NodeTrace; ctx: Record<string, TypedValue>; changed: string[]; }
export function frames(trace: RunTrace, flow: RuleSetFlow): TraceFrame[];
export type NodeState = "run" | "error" | "current" | "pending" | "dim";
export interface NodeOverlay { state: NodeState; seq: number | null; chip: string | null; }
export type EdgeState = "run" | "chosen" | "dim" | "idle";
export interface Overlay { nodes: Record<string, NodeOverlay>; edges: Record<string, EdgeState>; }
export function overlayAt(trace: RunTrace, flow: RuleSetFlow, step: number): Overlay;
export interface ValueTable { vars: string[]; cols: { index: number; nodeId: string; label: string }[]; cells: (TypedValue | null)[][]; changed: boolean[][]; }
export function valueTable(trace: RunTrace, flow: RuleSetFlow): ValueTable;
export function typedText(v: TypedValue | null | undefined): string;
```

의미:
- 단계 = `trace.nodes` 의 순번(0부터). `step` k 는 nodes[0..k] 가 실행됐고 nodes[k] 가 지금 노드라는 뜻이다. `trace.nodes` 가 비면 frames 는 빈 목록이고 overlay 는 모든 노드 `pending`.
- ctx: 처음은 `trace.input`. RULE(OK) 는 지금 **범위**의 ctx 에 `result.results` 를 덮어쓴다. PARALLEL 을 만나면 그 분기의 갈래마다 분기 직전 ctx 의 사본을 범위로 둔다. 노드가 어느 갈래에 속하는지는 `parseFlow(flow).tree` 의 `Split.branches[].body` 로 정한다. 그 분기의 MERGE 노드에서 `merged` 이름마다, 갈래를 PARALLEL 노드의 `order`(실제 실행 순서)대로 돌며 그 갈래 범위에서 값을 가져와 덮어쓴다(뒤 갈래가 이긴다). IF 는 사본을 만들지 않는다.
- `changed`: 그 프레임에서 값이 생기거나 바뀐 이름(TypedValue 비교: type 같고 NUMBER 는 값 비교 `1.10 == 1.1`, LIST 는 원소별).
- `overlayAt(k)`:
  - 노드: nodes[0..k] 는 `run`(status ERROR 면 `error`), nodes[k] 는 `current`(ERROR 면 `error`). 나머지는 k 가 마지막 단계면 `dim`, 아니면 `pending`. `seq` 는 실행된 노드의 NodeTrace.seq. `chip`: RULE(OK) 는 결과 첫 이름 `이름=값`(값은 `typedText`), ERROR 는 첫 위반의 `code`, 그 밖 null.
  - 선: 출발·도착 노드가 모두 nodes[0..k] 에 있고 (출발이 IF 가 아니거나 선 ID 가 그 IF 의 `chosenEdgeId`) 면 `run`. IF 의 `chosenEdgeId` 선은 `chosen`(run 보다 우선). 실행된 IF 의 고르지 않은 갈래 선은 `dim`. 나머지는 k 가 마지막이면 `dim`, 아니면 `idle`.
- `valueTable`: `vars` = input 키(입력 순서) 뒤에 결과 이름(처음 나온 순서). `cols` = RULE(OK) 프레임과 PARALLEL 의 MERGE 프레임. 칸 = 그 프레임 범위의 ctx 값(없으면 null). `changed[i][j]` = 그 칸이 앞 칸(첫 칸은 input 값)과 다름. `label` = RULE 은 ruleId, MERGE 는 `합류 {nodeId}`.
- `typedText`: NULL·undefined → `NULL`, NUMBER·STRING·BOOLEAN → value, LIST → `[a, b]`.

### P10. 화면 구성과 testid (Task 9·10·11)

```
┌ set-edit-topbar (세트 고르기, 그대로) ─────────────────────────────────────────────┐
├ flow-toolbar: 세트 ID(set-card-id)·상태(set-status)·row_version · [보기|편집](flow-mode-view/flow-mode-edit)
│   · [자동 정렬](flow-auto-layout) [화면 맞춤](flow-fit) [변수 흐름](flow-var-toggle, aria-pressed)
│   · [세트 저장](set-save) [폐기](set-deprecate)→[폐기 확인](set-deprecate-confirm)/[취소](set-deprecate-cancel)
│   · [되살리기](set-restore) [다시 불러오기](set-reload) · 메시지 줄(set-message)
├ 본문: [팔레트 flow-palette(편집 모드만)] | [캔버스 flow-canvas] | [오른쪽 패널 flow-props (ResizableFormPanel)]
│   팔레트: flow-add-rule · flow-add-if · flow-add-par · flow-add-note · flow-add-group
│   캔버스 노드: flow-node-{nodeId}, 룰 박스 링크 아이콘 flow-rule-open-{nodeId}, 경고 점 flow-node-mark-{nodeId},
│              선 변수 칩 flow-edge-chips-{edgeId}, 메모 flow-note-{id}, 그룹 flow-group-{id}
│   오른쪽 패널(선택 없음): 세트명 set-name · 설명 set-desc · 입출력 표(set-io-*, 기존 SetIoTables) · 구성 지침(set-guide-*, 기존 GuideCard)
│   오른쪽 패널(룰): flow-prop-rule(입력·결과 변수, 확정 버전, [룰 편집 열기] flow-prop-rule-open) · [지우기] flow-prop-delete
│   오른쪽 패널(IF): 갈래마다 flow-prop-branch-{edgeId}-label / -cond / -up / -down / -remove, [갈래 더하기] flow-prop-add-branch, 분기 이름 flow-prop-label
│   오른쪽 패널(병렬): 갈래마다 -label / -up / -down / -remove, flow-prop-add-branch
│   오른쪽 패널(메모·그룹): flow-prop-note-text, flow-prop-group-title, flow-prop-delete
│   오른쪽 패널(디버거 노드 상세): sim-detail
└ 아래 패널 flow-bottom (접기 flow-bottom-toggle): 탭 flow-tab-checks("검사 결과" + 건수) · flow-tab-sim("시뮬레이션")
    검사: set-checks, 항목 set-check-{i}(누르면 그 노드로 이동·선택)
    시뮬레이션: 입력 칸 sim-input-{name}, JSON 붙여 넣기 sim-json, 판정 시각 sim-evalts, [실행] sim-run,
               [처음] sim-first [이전] sim-prev [다음] sim-next [끝] sim-last, 진행 막대 sim-progress, 상태 문구 sim-status,
               값 표 sim-values, 경고 sim-warnings, 실행 표시 지우기 sim-clear
```

- 룰 박스를 누르면 선택하고 속성 패널을 연다(보기 모드는 읽기 전용). 두 번 누르기는 아무것도 하지 않는다. 링크 아이콘(`flow-rule-open-{nodeId}`)만 `openRuleEdit(ruleId)`(`@/dme/rule-handoff`, 버전 없음)를 부른다.
- 편집 모드는 `view.editable && canDoButton("save")` 일 때만 켤 수 있다. 세트를 열면 보기 모드다.
- 저장 버튼: 편집 모드이고 dirty 이고, 거부(REJECT) 검사가 없고, 조건식 IO 응답을 기다리는 중이 아닐 때만 켜진다(P-D4).
- dirty: `flowJsonOf(flow) !== flowJsonOf(toEditFlow(view.set.flow, view.set.ruleIds))` 이거나 세트명·설명이 다르다.

---

## 실행 순서와 모델

같은 파일을 두 태스크가 동시에 고치지 않도록 묶었다. 같은 물결의 태스크는 서로 다른 하위 워크트리에서 돌고, 리뷰 통과 뒤 `feat/rule-set-flow-phase2` 에 병합한다.

| 물결 | 태스크 (모델) | 선행 |
|---|---|---|
| 1 | Task 0 결정 기록 (sonnet) · Task 1 저장 경로·코덱 (sonnet) · Task 2 검사 보강·코퍼스·퍼즈 (opus) · Task 5 화면 의존성·빌드 (sonnet) · Task 6 편집 연산 (opus) | — |
| 2 | Task 3 룰 확정 검사 경로 상태 (opus) · Task 4 기록 실행·조건식 IO (opus) · Task 7 배치·변수 표시 (sonnet) | 2 / 1 / 5·6 |
| 3 | Task 8 기록 해석 (opus) · Task 9 캔버스 컴포넌트 (sonnet) | 4 / 5·6·7 |
| 4 | Task 10 화면 통합·목록 편집 제거 (opus) | 1·2·4·9 |
| 5 | Task 11 디버거 화면 (sonnet) | 8·10 |
| 6 | Task 12 설계 문서·e2e 갱신 (sonnet) → Task 13 브라우저 확인 (sonnet) → 최종 전체 리뷰 (opus) | 전부 |

모델 선택 근거: 계약·알고리즘 동치·직렬화·상태 모델처럼 틀리면 조용히 어긋나는 일은 opus, 계약이 정해진 뒤의 구현·화면·문서는 sonnet 이다. 기계적 수정만 있는 태스크가 없어 haiku 는 쓰지 않는다.

---

## 태스크

### Task 0: 2단계 결정 기록 (D-111~D-116)

**모델:** sonnet

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 덧붙이기만)

**Interfaces:**
- Consumes: 이 계획의 「편차 기록」 P-D1~P-D10, 「삭제 대상」
- Produces: decisions.md D-111~D-116. 다른 태스크는 decisions.md 를 고치지 않는다

- [ ] **Step 1: 서식 확인** — `awk '/^## D-110/,0' docs/mdm/decisions.md` 로 마지막 항목 서식(`## D-NNN (ISO8601Z)` + `Phase / Decision needed / Decision made / Rationale / Reversible / Source` 불릿)을 확인한다.

- [ ] **Step 2: 여섯 항목 덧붙이기** — 시각은 모두 `2026-09-30T00:00:00Z`, Phase 는 `plan(룰 세트 흐름도 2단계)`.

| 번호 | Decision needed | Decision made(요지) | Reversible | Source |
|---|---|---|---|---|
| D-111 | 흐름 저장 요청을 OASIS params 로 어떻게 받을지(§9.1-1) | `flowJson` 문자열로 받는다(P-D1). 저장 JSON 은 서버가 파싱한 정의로 다시 쓴다(P2 정규 JSON, §9.1-3). 코덱은 문자열 order·불린 아닌 otherwise·숫자 id 를 형식 오류로 거부한다 | yes | 2026-09-30 실측 `S999 Generic type`, 계획 P1·P2 |
| D-112 | 디버거·조건식 IO action 이름(D-108 의 `simulate` 조항) | `execute`→`simulate`, `validate`→`condIo`. D-108 의 이름 조항을 대체한다. 결과로 READ 권한(표준 관리자)은 디버거를 쓰지 못한다(P-D2·P-D3) | yes | ADR-0003 D5 16개 어휘, `ruleEdit.bpmn` `execute`→`runTest` 선례 |
| D-113 | 캔버스 도입 뒤 목록 편집을 둘지·저장 버튼 규칙(N-8) | 목록 편집을 없애고 캔버스 하나로 편집한다. 거부 검사가 있으면 저장 버튼을 끈다(스펙 §7). 구성 지침 적용은 한 줄 흐름만(P-D4·P-D5). 옛 목록 저장이 FLOW_JSON 이 있는 세트에 오면 거부한다(§9.1-7) | partial(삭제한 화면 코드는 git 으로만 되살린다) | 스펙 §7, 2026-09-30 사용자 답변 "기존 화면 안" |
| D-114 | 흐름 크기·깊이 상한(§9.1-8) | 노드 200·선 400·JSON 262,144자. 깊이 상한은 두지 않는다(P-D6) | yes | 계획 P2, Task 1 깊은 중첩 테스트 |
| D-115 | 선언 타입 없는 조건식 변수(§9.1-5)와 룰 확정 검사의 거친 형제 판정(§9.1-6) | `COND_UNTYPED` 경고(P3·P-D7). 확정 검사의 SIBLING 판정은 분석기 경로 상태(`RuleSetPathState`)로 앞 경로에서 이미 정의된 이름을 뺀다(P4) | yes | 1단계 최종 리뷰 Important 2건 |
| D-116 | 저장값 손상 오류 코드·simulate 입력 검증(§9.1-9)·디버거 경고(D-110 이 2단계로 넘김) | `MDM026 STORED_DEFINITION_CORRUPT` + `StoredDefinitionException` 로 손상만 좁혀 잡는다(P-D9). record 없음은 REQUIRED_VALUE. simulate 응답 warnings 는 RULE_DEPRECATED → BRANCH_COND_NULL → 룰 경고 순(P5) | yes | D-110, 계획 P5 |

각 항목의 Rationale 에는 표의 「이유」 칸(편차 기록)을 문장으로 옮긴다.

- [ ] **Step 3: 확인** — `grep -c "^## D-11[1-6] " docs/mdm/decisions.md` 가 `6`.

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md
/usr/bin/git commit -m "docs(mdm): 룰 세트 흐름도 2단계 결정 기록(D-111~D-116)" -- docs/mdm/decisions.md
```

---

### Task 1: 저장 경로 — flowJson 요청·엄격 코덱·정규 JSON·목록 저장 거부·크기 상한·조회 condIo

**모델:** sonnet

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSaveRequest.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewResult.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java`(깊은 중첩 한 건만 추가, main 코드는 안 고친다)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts`(깊은 중첩 한 건만 추가)

**Interfaces:**
- Consumes: 1단계 `RuleSetFlowJson`·`RuleSetEditService`·`RuleIoReader.condIo(FlowDefinition)`
- Produces: P1·P2 전부. `RuleSetFlowJson.fromMap`·`write(Map)` 은 이 태스크에서 서비스가 더는 쓰지 않는다. `RuleSetRunner.trace` 가 아직 `fromMap` 을 쓰므로 `fromMap` 은 남기고(Task 4 가 지운다) `write(Map)` 은 지운다.

- [ ] **Step 1: 코덱 실패 테스트** — `RuleSetFlowJsonTest` 에 더한다. `VALID` 는 P2 의 정규 JSON 예시(START→END 선 하나)를 쓴다.

```java
    private static final String VALID = """
        {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"end","kind":"END"}],
         "edges":[{"id":"e1","from":"start","to":"end"}]}""";

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', textBlock = """
        문자열 버전      | {"version":"1","nodes":[],"edges":[]}                                                     | 흐름 형식 버전은 정수 1 이어야 한다
        실수 버전        | {"version":1.0,"nodes":[],"edges":[]}                                                     | 흐름 형식 버전은 정수 1 이어야 한다
        숫자 노드 id     | {"version":1,"nodes":[{"id":7,"kind":"START"}],"edges":[]}                               | nodes[0].id 는 문자열이어야 한다
        문자열 order     | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","order":"1"}]}            | edges[0].order 는 정수여야 한다
        실수 order       | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","order":1.5}]}            | edges[0].order 는 정수여야 한다
        문자열 otherwise | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","otherwise":"true"}]}     | edges[0].otherwise 는 true/false 여야 한다
        숫자 cond        | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","cond":3}]}               | edges[0].cond 는 문자열이어야 한다
        배열 view        | {"version":1,"nodes":[],"edges":[],"view":[]}                                             | 흐름의 view 는 객체여야 한다
        객체 아닌 노드   | {"version":1,"nodes":["start"],"edges":[]}                                                | nodes[0] 는 객체여야 한다
        """)
    void 타입이_다른_칸은_조용히_바꾸지_않고_거부한다(String name, String json, String message) {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(json));
        assertEquals(message, e.getMessage(), name);
    }

    @Test
    void 노드_201개_선_401개_너무_긴_JSON_은_거부한다() {
        String nodes201 = IntStream.range(0, 201).mapToObj(i -> "{\"id\":\"n" + i + "\",\"kind\":\"RULE\",\"ruleId\":\"R\"}")
                .collect(Collectors.joining(","));
        assertEquals("노드가 201개다. 흐름 하나에 200개까지 둔다", assertThrows(IllegalArgumentException.class,
                () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[" + nodes201 + "],\"edges\":[]}")).getMessage());
        String edges401 = IntStream.range(0, 401).mapToObj(i -> "{\"id\":\"e" + i + "\",\"from\":\"a\",\"to\":\"b\"}")
                .collect(Collectors.joining(","));
        assertEquals("선이 401개다. 흐름 하나에 400개까지 둔다", assertThrows(IllegalArgumentException.class,
                () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":[" + edges401 + "]}")).getMessage());
        String longJson = "{\"version\":1,\"nodes\":[],\"edges\":[],\"view\":{\"pad\":\"" + "x".repeat(RuleSetFlowJson.MAX_JSON_CHARS) + "\"}}";
        assertTrue(assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(longJson)).getMessage()
                .endsWith("자다. 262144자까지 받는다"));
    }

    @Test
    void 정규_JSON_은_모든_칸을_고정_순서로_쓰고_view_를_보존한다() throws Exception {
        String in = """
            {"view":{"positions":{"start":{"x":1,"y":2}},"notes":[],"groups":[]},"edges":[{"to":"end","from":"start","id":"e1"}],
             "nodes":[{"kind":"START","id":"start"},{"kind":"END","id":"end","label":"끝"}],"version":1}""";
        assertEquals("{\"version\":1,"
                + "\"nodes\":[{\"id\":\"start\",\"kind\":\"START\",\"ruleId\":null,\"splitId\":null,\"label\":null},"
                + "{\"id\":\"end\",\"kind\":\"END\",\"ruleId\":null,\"splitId\":null,\"label\":\"끝\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"end\",\"order\":null,\"cond\":null,\"otherwise\":false,\"label\":null}],"
                + "\"view\":{\"positions\":{\"start\":{\"x\":1,\"y\":2}},\"notes\":[],\"groups\":[]}}", RuleSetFlowJson.canonical(in));
        assertTrue(RuleSetFlowJson.canonical(VALID).endsWith("\"view\":{\"positions\":{},\"notes\":[],\"groups\":[]}}"));
    }
```

(import: `org.junit.jupiter.params.ParameterizedTest`, `org.junit.jupiter.params.provider.CsvSource`, `java.util.stream.IntStream`, `java.util.stream.Collectors` — lib 의 `build.gradle` 에 `junit-jupiter-params` 가 없으면 `testImplementation 'org.junit.jupiter:junit-jupiter-params'` 를 더한다.)

- [ ] **Step 2: 실패 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --console=plain)` → 새 테스트 FAIL(문구 다름·`canonical` 없음 컴파일 오류).

- [ ] **Step 3: 코덱 구현** — P2 규칙표 순서대로 `read` 를 고친다. 핵심은 다음과 같다.

```java
    public static FlowDefinition parse(String json) {
        return read(tree(json));
    }

    public static String canonical(String json) {
        JsonNode root = tree(json);
        FlowDefinition f = read(root);
        ObjectNode out = JSON.createObjectNode();
        out.put("version", f.version());
        ArrayNode ns = out.putArray("nodes");
        for (FlowNode n : f.nodes()) {
            ObjectNode o = ns.addObject();
            o.put("id", n.id());
            o.put("kind", n.kind().name());
            o.put("ruleId", n.ruleId());
            o.put("splitId", n.splitId());
            o.put("label", n.label());
        }
        ArrayNode es = out.putArray("edges");
        for (FlowEdge e : f.edges()) {
            ObjectNode o = es.addObject();
            o.put("id", e.id());
            o.put("from", e.from());
            o.put("to", e.to());
            o.put("order", e.order());
            o.put("cond", e.cond());
            o.put("otherwise", e.otherwise());
            o.put("label", e.label());
        }
        JsonNode view = root.get("view");
        out.set("view", view == null || view.isNull() ? defaultView() : view);
        try {
            return JSON.writeValueAsString(out);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름을 JSON 으로 쓸 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    private static JsonNode tree(String json) {
        if (json != null && json.length() > MAX_JSON_CHARS) {
            throw new IllegalArgumentException("흐름 JSON 이 " + json.length() + "자다. " + MAX_JSON_CHARS + "자까지 받는다");
        }
        try {
            return JSON.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 문자열 칸 — 없거나 null 이면 null, 문자열이 아니면 형식 오류. */
    private static String text(JsonNode node, String field, String where) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        if (!v.isTextual()) {
            throw new IllegalArgumentException(where + "." + field + " 는 문자열이어야 한다");
        }
        return v.textValue();
    }
```

`version`: `JsonNode v = root.get("version"); if (v == null || !v.isIntegralNumber() || v.intValue() != 1) → "흐름 형식 버전은 정수 1 이어야 한다"`. `order`: `v.isIntegralNumber()` 만 받는다. `otherwise`: `v.isBoolean()` 만 받는다(없거나 null 이면 false). 노드 수·선 수 검사는 `array(...)` 로 배열을 꺼낸 직후 한다. `toMap` 은 그대로 두되 `tree(json)` 길이 검사를 같이 쓴다. `write(Map)` 는 지운다.

- [ ] **Step 4: 코덱 통과 확인** — 같은 명령 → PASS. 기존 `RuleSetFlowJsonTest` 사례도 통과해야 한다(숫자 id 를 허용하던 기존 테스트가 있으면 그 기대를 새 규칙으로 바꾸고 보고서에 적는다).

- [ ] **Step 5: 깊은 중첩 테스트(엔진·화면)** — 99단 중첩 IF(노드 200개: START·END + IF·MERGE 99쌍, 각 IF 는 첫 갈래에 다음 IF, "그 외" 는 짝 합류로 바로)를 만드는 도우미를 두고 파서가 오류 없이 트리를 만드는지 본다.

```java
    // FlowParserTest
    @Test
    void 노드_200개로_만들_수_있는_가장_깊은_중첩_IF_도_스택_넘침_없이_파싱한다() {
        int depth = 99;
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null));
        for (int i = 1; i <= depth; i++) {
            nodes.add(new FlowNode("if" + i, NodeKind.IF, null, null, null));
            nodes.add(new FlowNode("m" + i, NodeKind.MERGE, null, "if" + i, null));
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null));
        edges.add(new FlowEdge("e0", "start", "if1", null, null, false, null));
        for (int i = 1; i <= depth; i++) {
            String inner = i < depth ? "if" + (i + 1) : "m" + i;
            edges.add(new FlowEdge("a" + i, "if" + i, inner, 1, "X = " + i, false, null));
            edges.add(new FlowEdge("b" + i, "if" + i, "m" + i, null, null, true, null));
            edges.add(new FlowEdge("c" + i, "m" + i, i > 1 ? "m" + (i - 1) : "end", null, null, false, null));
        }
        assertEquals(200, nodes.size());
        FlowParse p = FlowParser.parse(new FlowDefinition(1, nodes, edges));
        assertEquals(List.of(), p.issues());
        assertNotNull(p.tree());
    }
```

`flow-model.test.ts` 에 같은 모양(노드 200개, `ruleId: null` 등 모든 칸 채움)으로 `parseFlow(flow).issues` 가 `[]` 이고 `tree` 가 null 이 아님을 단언하는 테스트를 더한다.

- [ ] **Step 6: 깊은 중첩 통과 확인** — `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --console=plain)` 와 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-model.test.ts` → PASS(엔진·화면 main 코드는 고치지 않는다. 실패하면 멈추고 NEEDS_CONTEXT).

- [ ] **Step 7: 서비스 실패 테스트** — `RuleSetEditServiceTest` 에서 `request.setFlow(Map)` 를 쓰던 테스트를 `setFlowJson(String)` 으로 바꾸고 아래를 더한다(세트·룰 시드 도우미는 그 파일에 있는 것을 쓴다).

```java
    @Test
    void 저장은_요청_JSON_이_아니라_정규_JSON_을_쓴다() {
        // 선 order 를 정수로, 키 순서를 뒤섞고, 알 수 없는 칸 "extra" 를 넣어 보낸다
        save(flowRequest("SET_A", 0, """
            {"extra":1,"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"r1","kind":"RULE","ruleId":"R_A"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"r1"},{"id":"e2","from":"r1","to":"end"}]}"""));
        String stored = flowJsonOf("SET_A");
        assertFalse(stored.contains("extra"), stored);
        assertTrue(stored.startsWith("{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\",\"ruleId\":null"), stored);
    }

    @Test
    void 문자열_order_는_MDM021_로_거부하고_쓰지_않는다() {
        BusinessException e = assertThrows(BusinessException.class, () -> save(flowRequest("SET_A", 0, IF_FLOW.replace("\"order\":1", "\"order\":\"1\""))));
        assertTrue(e.getMessage().contains("edges[2].order 는 정수여야 한다"), e.getMessage());
        assertNull(flowJsonOf("SET_A"));
    }

    @Test
    void FLOW_JSON_이_있는_한_줄_세트에_목록_저장이_오면_거부하고_흐름을_지우지_않는다() {
        save(flowRequest("SET_A", 0, LINEAR_WITH_VIEW));
        String before = flowJsonOf("SET_A");
        BusinessException e = assertThrows(BusinessException.class, () -> save(listRequest("SET_A", 1, "R_A")));
        assertTrue(e.getMessage().contains("FLOW_READONLY") && e.getMessage().contains("흐름도로 저장한 세트는 룰 목록으로 저장할 수 없다"), e.getMessage());
        assertEquals(before, flowJsonOf("SET_A"));
    }

    @Test
    void 조회_응답은_저장된_흐름의_IF_갈래_조건식_IO_를_싣는다() {
        save(flowRequest("SET_A", 0, IF_FLOW));
        RuleSetViewResult v = service.view(viewRequest("SET_A"));
        assertEquals(Set.of("e3"), v.getCondIo().keySet());
        assertTrue(v.getCondIo().get("e3").ok());
    }
```

`IF_FLOW` 는 `start → r1(R_A) → if1 { e3: order 1, cond "COIL_THK > 1" → r2(R_B) ; e4: otherwise → m1 } → m1 → end` 흐름 문자열, `LINEAR_WITH_VIEW` 는 `start → r1(R_A) → end` 에 `"view":{"positions":{"r1":{"x":5,"y":6}},"notes":[{"id":"n1","text":"메모","x":0,"y":0,"w":200,"h":80,"attach":"r1"}],"groups":[]}` 를 붙인 문자열이다. `flowJsonOf(setId)` 는 `SELECT FLOW_JSON FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?`.

- [ ] **Step 8: HTTP 실패 테스트** — `DmeOasisHttpTest` 에 params `flowJson`(문자열)만 싣고 `grids` 없이(화면이 보낼 모양) IF 흐름을 저장하고 저장된 FLOW_JSON 의 `edges[2].order` 가 정수 1, `edges[3].otherwise` 가 불린 true, `view.positions.r1.x` 가 숫자임을 단언하는 테스트를 더한다(2026-09-30 실측 PROBE 와 같은 흐름 — `HTTP_GRD`·`HTTP_FCT`, cond `COIL_THK > 1`, 응답 `meta.success` true).

- [ ] **Step 9: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetEditServiceTest' --tests '*DmeOasisHttpTest' --console=plain)` → 새 테스트 FAIL.

- [ ] **Step 10: 서비스·DTO 구현** — P1 대로 바꾼다.
  - `RuleSetSaveRequest`: `flow` 칸·getter·setter 를 지우고 `flowJson` 을 더한다. 클래스 주석의 "1단계 화면은 보내지 않는다" 문장을 "화면은 흐름 JSON 문자열로 보낸다(OASIS params 는 Map 을 받지 못한다, D-111)"로 바꾼다.
  - `save`: `if (request.getFlowJson() != null && !request.getFlowJson().isBlank())` 분기로 바꾸고 `requestFlow(String)` 이 `RuleSetFlowJson.parse`, 저장 문자열은 `RuleSetFlowJson.canonical` 을 쓴다(둘 다 IAE → `invalidFlow`). `requestFlowJson(Map)` 을 지운다.
  - `rejectBranchedListSave` 를 `rejectListSaveOverFlow` 로 바꾼다: 저장된 FLOW_JSON 이 있으면 분기 여부에 따라 `FLOW_READONLY_MESSAGE` 또는 새 상수 `FLOW_LIST_SAVE_MESSAGE` 로 거부한다. 저장된 FLOW_JSON 을 읽지 못하면(IAE) 분기 문구로 거부한다(덮어쓰지 않는 쪽이 안전하다).
  - `RuleSetViewResult` 에 `Map<String, CondIo> condIo` 칸(생성자 인자 끝에)과 getter 를 더하고 `view` 가 `flow == null ? Map.of() : ioReader.condIo(flow)` 를 넣는다. `RuleSetViewResult` 를 만드는 다른 곳이 있으면 같이 고친다.

- [ ] **Step 11: 통과 확인** — Step 9 명령 → PASS. 이어서 `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)` 전체가 기준선(api 기존 1 실패)과 같아야 한다.

- [ ] **Step 12: 커밋**

```bash
/usr/bin/git add <이 태스크가 바꾼 파일 경로들>
/usr/bin/git commit -m "feat(mdm): 흐름 저장을 flowJson 문자열·정규 JSON 으로 받고 목록 저장이 흐름을 지우지 않게 막는다" -- <같은 경로들>
```

---

### Task 2: 세트 검사 보강 — COND_UNTYPED·코퍼스 미덮음 경로·차분 퍼즈

**모델:** opus

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts`, `types.ts`(`RuleSetCheckCode` 만)
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`
- Create: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowFuzz.java`(시드 기반 흐름 생성기)
- Create: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json`(생성 결과, 커밋)
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java`, `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`(두 파일을 읽게 일반화)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleIoDeclaredNamesTest.java`(새, 선언 집합 대조)

**Interfaces:**
- Consumes: 1단계 C4·C4.1, 코퍼스 형식(`name, ids, rules, flow?, condIo?, expect{io, deps, checks}`)
- Produces: P3 `COND_UNTYPED`. 퍼즈 파일 `rule-set-fuzz.json`(코퍼스와 같은 형식, Task 3 이 확정 검사 대조에 쓴다). 코퍼스 사례 수가 늘어난 새 `MIN_CASES`(Java·TS 같은 값).

순서: 5항(COND_UNTYPED) → 4항(미덮음 사례) → 퍼즈. 5항이 흐름 사례의 기대값을 바꿀 수 있으므로 먼저 한다.

- [ ] **Step 1: 선언 집합 대조 테스트(먼저 사실 확인)** — `RuleIoDeclaredNamesTest`: api 테스트 컨텍스트(SQLite)에서 DECISION 룰 하나(COND 열 2·RESULT 열 1)와 DERIVE 룰 하나(행 required·optional 이 있는 것)를 시드하고, `RuleIoReader.read(ids)` 의 `conds ∪ results` 이름 집합(대문자)이 `StoredRuleDefinitions` 로 조립한 엔진 `RuleDefinition` 의 `contract.always ∪ (DERIVE 면 rows.required ∪ rows.optional) ∪ RESULT 열 이름` 집합(대문자)과 같은지 단언한다. 기존 테스트의 시드 도우미(`DmeTestSupport.rule`·`released`·`var`)를 쓴다. 다르면 멈추고 NEEDS_CONTEXT 로 두 집합을 보고한다(P3 의 선언 집합 정의가 틀린 것이다).

- [ ] **Step 2: 대조 테스트 통과 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleIoDeclaredNamesTest' --console=plain)` → PASS.

- [ ] **Step 3: COND_UNTYPED 코퍼스 사례(실패)** — 코퍼스 끝에 사례 두 개를 더한다.
  - `flow_cond_untyped_dict_var`: 룰 `R_A`(conds `[SET_THK DICT NUMBER]`, results `[S_A]`), 흐름 `start → r1(R_A) → if1 { e3: order 1, cond "SET_WID > 10" → m1 ; e4: otherwise → m1 } → m1 → end`, condIo `e3: ok, vars [SET_WID DICT NUMBER]`. 기대 checks: `[{code:"COND_UNTYPED", severity:"WARN", ruleId:null, otherRuleId:null, varName:"SET_WID", message:"e3 갈래 조건식이 읽는 SET_WID는 세트 안 어느 룰도 타입을 선언하지 않아 레코드 값 그대로 비교한다. 숫자를 문자열로 넘기면 사전순으로 비교된다", nodeId:"if1", edgeId:"e3"}]`.
  - `flow_cond_declared_case_insensitive`: 같은 흐름에서 cond `"set_thk > 10"`, condIo vars `[set_thk DICT]`. 기대 checks: `[]`(R_A 가 SET_THK 를 선언, 대소문자 무시).
  - `io`·`deps` 기대값은 기존 러너가 계산하는 값을 먼저 돌려 확인해 적는다(두 사례 모두 흐름을 펼친 목록 `[R_A]` 기준).

- [ ] **Step 4: 실패 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --console=plain)` 와 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/rule-set-corpus.test.ts` → 새 사례 FAIL, `MIN_CASES` 미달 아님(아직 41 이상).

- [ ] **Step 5: 구현(Java·TS 같은 모양)** — `PathWalk` 에 `declared`(대문자 이름 집합)를 생성자에서 한 번 만든다: `tree.ruleIds()` 의 각 id 에 대해 `rules.get(id)` 가 있고 `exists()` 이고 `releasedVer() != null` 이면 `conds`·`results` 이름을 대문자로 넣는다. `cond()` 의 변수 루프에서 기존 분기 뒤에 `if (RuleIo.DICT.equals(v.source()) && !declared.contains(v.name().toUpperCase(Locale.ROOT)))` 이면 P3 항목을 더한다. 첫 분기의 `continue` 때문에 DICT 변수가 선언 검사에 닿지 못하지 않도록 루프를 다시 짠다(DICT·defined 통과 → 선언 검사로 이어짐). TS `set-model.ts` 의 대응 함수도 같은 순서로 고친다. `RuleSetCheck.COND_UNTYPED` 상수와 TS 코드 유니온을 더한다.

- [ ] **Step 6: 흐름 사례 기대값 점검** — 두 러너를 돌려 **기존 흐름 사례 19~41 가운데 기대값이 바뀌는 사례**를 목록으로 만든다(DICT 조건식 변수를 세트 안 룰이 읽지 않는 사례). 바뀐 사례마다 새 기대값이 P3 의미에 맞는지 확인하고 기대값을 갱신한다. 목록 사례 1~18 은 바뀌면 안 된다(`git diff` 로 1~18 블록 무변경 확인). 바꾼 사례 이름을 보고서에 적는다.

- [ ] **Step 7: 통과 확인** — Step 4 명령 → PASS.

- [ ] **Step 8: 미덮음 경로 사례(§9.1-4)** — 코퍼스에 아래 9개를 더한다. 각 사례의 기대값은 **Java 러너가 낸 값을 그대로 적지 말고** 1단계 C3·C4 규칙표로 손으로 도출한 뒤 두 러너가 그 값을 내는지 본다(어긋나면 규칙표 대조로 원인을 가린다).

| 사례 이름 | 흐름 | 기대 요지 |
|---|---|---|
| `flow_cycle_in_branch` | IF 첫 갈래 안에 `R_CA → R_CB`(서로의 결과를 읽음) | `CYCLE` REJECT, nodeId = 앞 노드 |
| `flow_deprecated_node_id` | 두 번째 갈래에 폐기 룰 `R_OLD` | `RULE_DEPRECATED` nodeId = 그 RULE 노드 |
| `flow_exist_and_structure` | 없는 룰 `R_NONE` 노드 + MERGE 없는 IF | 존재(`RULE_NOT_FOUND`) 먼저, 이어서 `FLOW_STRUCTURE`, 경로 검사 없음 |
| `flow_if_in_if_maybe` | 바깥 IF 첫 갈래 안의 안쪽 IF 한 갈래만 `S_X` 를 만들고, 바깥 합류 뒤 룰이 `S_X` 를 읽음 | `FLOW_PARTIAL` WARN |
| `flow_order_many_later` | 한 줄 경로에서 앞 룰이 뒤 두 룰의 결과를 읽음 | `ORDER` 문구의 later 두 개(", " 로 이음) |
| `flow_if_sibling_many_excl` | IF 세 갈래 중 둘이 `S_Y` 를 만들고 나머지 갈래 룰이 `S_Y` 를 읽음 | `IF_SIBLING` 문구의 다른 갈래 두 개 |
| `flow_struct_c_missing_node` | 선이 없는 노드 `zz` 를 가리킴 | 구조 c 문구 |
| `flow_struct_g3_g4_g5` | 병렬 갈래에 cond(g3), IF 갈래에 order 없음(g4), 병렬 order 겹침(g5) | 세 문구가 C3 순서대로 |
| `flow_par_dup_result` | 병렬 두 갈래가 같은 결과 `S_Z` 대입 | `PAR_SIBLING` 대입 문구 |

두 러너의 `MIN_CASES` 를 새 총수로 올린다(같은 값).

- [ ] **Step 9: 통과 확인** — Step 4 명령 → PASS.

- [ ] **Step 10: 차분 퍼즈** — `RuleSetFlowFuzz`(테스트 소스, `main` 메서드 + JUnit 테스트)를 만든다.
  - 입력: 시드(long), 사례 수(기본 200). `java.util.Random(seed)` 만 쓴다.
  - 룰 풀 8개(`FZ_R1`~`FZ_R8`): 각 룰은 DICT 조건 0~2개(`FZ_D1`~`FZ_D3`), 다른 풀 룰 결과 조건 0~2개, 결과 1~2개(`FZ_S1`~`FZ_S6`)를 무작위로 갖는다. 룰 하나는 `exists=false`, 하나는 `status=DEPRECATED`, 하나는 `releasedVer=null` 로 둔다.
  - 흐름: 깊이 3 이하의 블록 트리를 무작위로 만든 뒤(순차·IF 2~3갈래·병렬 2~3갈래, 빈 갈래 허용, 같은 룰 여러 번 허용) 노드·선으로 펼친다. 사례의 10% 는 구조를 일부러 깨뜨린다(선 하나를 지우거나, 선의 to 를 다른 노드로 바꾸거나, otherwise 를 하나 더 둔다).
  - condIo: IF 갈래마다 `FZ_D*`·`FZ_S*` 변수 1~2개를 무작위로 골라 `ok=true` 로 둔다(5% 는 `ok=false`, message `"파싱 실패"`).
  - 출력: 코퍼스와 같은 형식의 사례 목록을 `rule-set-fuzz.json` 으로 쓴다. `expect` 는 **Java 분석기 결과**로 채운다(퍼즈는 두 언어 차분이 목적이다).
  - JUnit 테스트 `퍼즈_파일은_시드_20260930_로_다시_만들면_같다`: 시드 20260930 으로 다시 만든 JSON 이 커밋된 파일과 같다.
  - `rule-set-corpus.test.ts`·`RuleSetCorpusTest` 는 코퍼스와 퍼즈 파일을 모두 읽는다(퍼즈 파일의 MIN_CASES 는 200). TS 쪽이 퍼즈 사례에서 Java 와 다르면 그 사례를 줄여(작은 흐름으로) 코퍼스 사례로 옮겨 원인을 고친다.
  - 파일 생성: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowFuzz*' -Dfuzz.write=true --console=plain)` 처럼 시스템 속성으로 쓰기를 켠다(테스트 태스크에 `systemProperty 'fuzz.write', System.getProperty('fuzz.write')` 전달이 필요하면 lib `build.gradle` 의 `test` 블록에 더한다).

- [ ] **Step 11: 전체 통과 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` 와 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` → PASS. `pnpm --dir src/frontend --filter @dk-oasis/m-mdm lint` → 0.

- [ ] **Step 12: 커밋** — 두 커밋으로 나눈다: `feat(mdm): 선언 타입 없는 조건식 변수 경고(COND_UNTYPED)` / `test(mdm): 흐름 코퍼스 미덮음 경로와 Java·TS 차분 퍼즈`.

---

### Task 3: 룰 확정 검사가 분석기 경로 상태로 형제 판정을 하게

**모델:** opus

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathState.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetPathStateTest.java`(새)

**Interfaces:**
- Consumes: Task 2 의 코퍼스·퍼즈 파일(흐름 사례), 1단계 `FlowTree.relation`, `RuleDefinitionReads.Names`
- Produces: P4 `RuleSetPathState.before`. 확정 검사 문구는 그대로(이름 집합만 걸러짐)

- [ ] **Step 1: 거친 판정 재현 테스트(실패)** — `RuleLedgerChecksTest` 에 형제 판정이 거친 사례를 둔다: `start → r0(R_P: 결과 S_X) → if1 { e1(order1): → rA(R_A: 결과 S_X) ; e2(else): → rB(R_B: 읽기 S_X) } → m1 → end`. R_B 를 저장(me = R_B)할 때 지금은 R_A 와 EXCLUSIVE 이고 R_A 가 S_X 를 만드니 `SET_IF_SIBLING` 이 나지만, S_X 는 앞 경로(R_P)에서 이미 정의돼 있으므로 나면 안 된다. 기대: me=R_B 의 확정 검사 결과에 `SET_IF_SIBLING` 없음. 병렬 판(같은 모양의 PARALLEL)에서 `SET_PAR_SIBLING`(읽기) 없음도 같이 둔다. 세트 저장 검사(`RuleSetAnalyzer`)는 두 흐름에서 SIBLING 을 내지 않음을 같은 테스트에서 먼저 단언한다.

- [ ] **Step 2: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleLedgerChecksTest' --console=plain)` → 새 테스트 FAIL(SET_IF_SIBLING 이 남).

- [ ] **Step 3: `RuleSetPathState` 추출** — `RuleSetAnalyzer` 의 `State` 와 `split` 의 defined·maybe 합치기 규칙(IF: 교집합·나머지 maybe, PARALLEL: 합집합)을 이 클래스로 옮기고, `before(tree, produces)` 는 트리를 깊이 우선으로 돌며 RULE 노드를 만날 때마다 **그 노드를 처리하기 전의** `At(defined, maybe)` 사본을 적은 뒤 그 룰의 produces 를 defined 에 넣는다. `RuleSetAnalyzer.PathWalk` 는 prodBy·검사 문구 때문에 자기 상태를 그대로 갖되, defined·maybe 합치기는 이 클래스의 정적 메서드(`mergeIf(List<Set>…)`·`mergeParallel(…)` 등 — 이름은 구현자가 정하고 보고서에 적는다)를 불러 한 벌로 만든다.
  - `RuleSetPathStateTest`: 순차·IF·PARALLEL·중첩(IF 안 IF) 네 사례에서 노드별 before 값을 단언한다.

- [ ] **Step 4: 분석기 무변경 확인** — `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --tests '*RuleSetPathStateTest' --console=plain)` → PASS(코퍼스·퍼즈 결과 바이트 동일).

- [ ] **Step 5: `RuleSetOrderCheck` 수정** — P4 규칙대로 SIBLING(읽기) 판정만 노드 쌍 단위로 바꾼다. `before` 는 세트마다 한 번 계산한다: produces 함수는 me 면 `self.produces()`, 다른 룰이면 최신 RELEASED 의 `o.produces()`(RELEASED 없는 룰은 빈 집합). 걸러진 이름 집합이 비면 내지 않는다. 문구의 `readsOther`·`readByOther` 자리는 걸러진 집합이다.

- [ ] **Step 6: 대조 테스트(합격 기준)** — `RuleLedgerChecksTest` 에 코퍼스·퍼즈 흐름 사례를 읽어(P4 의 제외 사례를 뺀다), 사례의 룰마다 me 로 두고 P4 합격 기준 (가)·(나)를 따로 단언하는 테스트 두 개를 더한다. 확정 검사 결과의 변수는 문구가 아니라 판정 때 쓴 걸러진 이름 집합으로 대조한다(대조용으로 `RuleSetOrderCheck` 에 패키지 공개 메서드를 두어도 된다). 룰 정의는 사례의 `rules`(conds·results 이름)로 SQLite 에 시드한다(DICT 조건은 컬럼 사전에도 시드). 사례 수가 많아 느리면 퍼즈 사례는 앞 50개만 쓴다(수를 보고서에 적는다).

- [ ] **Step 7: 통과 확인** — `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)` → 기준선과 같음(기존 1 실패만). 판정이 **바뀐** 기존 테스트가 있으면 사례와 이유를 보고서에 표로 남긴다(Task 12 가 기능설계서에 옮긴다).

- [ ] **Step 8: 커밋** — `fix(mdm): 룰 확정 시 세트 형제 갈래 판정을 분석기 경로 상태로 맞춘다(§9.1-6)`.

---

### Task 4: 기록 실행(`execute`)·조건식 IO(`validate`) action, 기록 JSON·골든

**모델:** opus

**Files:**
- Modify: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/{RuleSetCondIoRequest,RuleSetCondIoResult,RuleSetSimulateRequest,RuleSetSimulateResult}.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RunTraceJson.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionException.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java`(`fromMap` 삭제)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/common/MdmErrorCode.java`
- Modify: `src/backend/mdm/api/build.gradle`(`testImplementation 'com.networknt:json-schema-validator:1.5.9'`)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSimulateTest.java`(새)
- Create: `src/backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json`
- Test: `RuleSetRunnerTest.java`, `RuleSetRunnerOasisTest.java`, `DmeBpmnActionTest.java`, `MdmOasisActionVocabularyTest.java`, `DmeOasisHttpTest.java`

**Interfaces:**
- Consumes: Task 1 의 `RuleSetFlowJson.parse(String)`·정규 JSON, 엔진 `RunTrace`(바꾸지 않음), `RuleIoReader.condIo`
- Produces: P5 전부, 골든 파일(Task 8 이 읽는다)

- [ ] **Step 1: 골든 사례 시드와 테스트 뼈대(실패)** — `RuleSetSimulateTest`(api, `@SpringBootTest` + SQLite TempDir, `RuleSetRunnerTest` 의 설정을 따른다). 공통 시드:
  - 컬럼 사전: `GT_THK`(NUMBER, scale 2), `GT_KIND`(STRING).
  - 룰(모두 VER 1 RELEASED FIRST, 적용 `2026-01-01 00:00:00` 부터):
    - `GT_GRADE`: COND `GT_THK`(NUMBER) 한 열, RESULT `GT_G`(STRING). 행1 `GT_THK >= 10` → `"A"`, 기본 행 → `"B"`.
    - `GT_FAST`: COND `GT_G`, RESULT `GT_F`(NUMBER). 행1 `GT_G = "A"` → `1`, 기본 → `0`.
    - `GT_SLOW`: COND `GT_G`, RESULT `GT_S`(NUMBER). 기본 → `5`.
    - `GT_SAME1`: COND `GT_KIND`, RESULT `GT_V`(STRING) 기본 → `"one"`.
    - `GT_SAME2`: COND `GT_KIND`, RESULT `GT_V`(STRING) 기본 → `"two"`.
  - 사례(P5 이름·순서), evalTs 모두 `2026-06-01 09:00:00`:
    1. `IF_FIRST_TRUE`: `start → r1(GT_GRADE) → if1 { e3 order1 cond "GT_G = \"A\"" → r2(GT_FAST) ; e4 else → r3(GT_SLOW) } → m1 → end`, record `{"GT_THK":"12"}`. 기대: IF 가 e3 선택, r3 미실행.
    2. `IF_NULL_ELSE`: 사례 1 흐름에서 e3 cond 만 `"GT_FLAG"` 로 바꾸고 record `{"GT_THK":"12","GT_FLAG":null}`. 기대: e3 outcome NULL, e4 선택(r3 실행), warnings 에 `BRANCH_COND_NULL`(정적 검사는 GT_FLAG 를 거부하지만 기록 실행은 검사 없이 돈다).
    3. `IF_ERROR_STOPS`: IF 갈래 두 개(`e3 order1 cond "GT_THK + 1"` 불린 아님, `e5 order2 cond "true"`) + else. 기대: e3 ERROR, e5 NOT_EVALUATED, IF 노드 status ERROR, `violations` 에 `BRANCH_EVAL_ERROR`.
    4. `PARALLEL_MERGE`: `start → r1(GT_GRADE) → par1 { p1 order1 → r2(GT_FAST) → rs1(GT_SAME1) ; p2 order2 → r3(GT_SLOW) → rs2(GT_SAME2) } → m1 → end`, record `{"GT_THK":"12","GT_KIND":"x"}`. 기대: MERGE merged 에 `GT_F`·`GT_S`·`GT_V`, finalValues `GT_V = "two"`(뒤 갈래가 이긴다).
    5. `IF_IN_PARALLEL`: 병렬 첫 갈래 안에 사례 1 의 IF, 둘째 갈래에 `GT_SAME1`.
    6. `STRUCTURE_ERROR`: IF 에 else 없음. 기대 `nodes=[]`, violations `FLOW_INVALID`.
    7. `MISSING_INPUT`: 사례 1 흐름, record `{}`. 기대 `nodes=[]`, violations `MISSING_KEY`(GT_THK).
  - 테스트 `골든_기록과_같다`: 사례마다 `service.simulate(req)` 결과를 `{trace, warnings}` JSON 으로 바꿔 골든 `response` 와 `JsonNode.equals` 로 비교한다. `-Dgolden.update=true` 이면 골든 파일을 다시 쓴다(api `build.gradle` 의 `test` 블록에 `systemProperty 'golden.update', System.getProperty('golden.update')` 전달).
  - 테스트 `기록은_엔진_스키마_RunTrace_를_따른다`: 사례마다 `trace` 를 엔진 jar 의 `kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` 의 `$defs/RunTrace` 로 검증한다(networknt, `EngineContractSchemaTest` 의 로딩 방식 참고). 추가로 `nodes[*]` 가운데 `result` 키 값이 null 인 것이 없음을 단언한다.
  - 테스트 `입력_검증`: flowJson 없음 → `REQUIRED_VALUE` `흐름은 필수입니다.`, recordJson `"[1]"` → `INVALID_VALUE`, evalTs `"2026/06/01"` → `INVALID_VALUE`, `runner.trace(flowJson, null, null)` → `REQUIRED_VALUE` `레코드는 필수입니다.`.
  - 테스트 `폐기_룰_경고가_앞에_온다`: `GT_SLOW` 를 DEPRECATED 로 바꾸고 사례 1 을 돌리면 warnings 첫 항목이 `RULE_DEPRECATED`·`GT_SLOW`(탄 갈래가 아니어도).
  - 테스트 `저장값_손상은_MDM026`: `GT_FAST` 의 RELEASED 행 CELLS 를 깨진 JSON 으로 바꾸고 사례 1 → `BusinessException` 코드 MDM026. 같은 손상으로 `runner.execute`(저장 세트) 도 MDM026.
  - 테스트 `condIo`: 사례 1 흐름 → 키 `e3` 하나, `ok=true`, vars `[GT_G NONE]`.

- [ ] **Step 2: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' --console=plain)` → 컴파일 오류·FAIL.

- [ ] **Step 3: 구현** — P5 대로 만든다.
  - `RunTraceJson.toMap` 은 P5 값 규칙을 지키고, `RuleResult` 의 Java 구조(`RuleResult.Hit`·`RowTrace`)는 `RuleValueTestService.hit`·`trace` 를 참고하되 값 인코딩만 TypedValue 로 다르다(`RuleTestResult` 는 화면용 옛 모양이라 쓰지 않는다).
  - `StoredDefinitionLookup` 의 저장값 읽기 지점(행 조립·FLOW_JSON 코덱·AST 읽기)을 `try { … } catch (IllegalArgumentException | IllegalStateException | BusinessException e) { throw new StoredDefinitionException(e.getMessage(), e); }` 로 감싼다. 감싸는 범위는 저장값 읽기뿐이다(엔진 호출을 감싸지 않는다).
  - `RuleSetRunner`: `trace(String, Map, Instant)`, `execute` catch 좁히기, 폐기 룰 경고 문구를 `static List<Map<String,Object>> deprecatedWarnings(List<String> ruleIds, Map<String, MdmRule> byId)` 같은 공통 메서드로 뽑아 `simulate` 도 쓴다(이름은 구현자가 정하고 보고서에 적는다).
  - `RuleSetFlowJson.fromMap` 을 지운다(쓰는 곳 0 확인: `grep -rn "fromMap" src/backend/mdm`).
  - BPMN: `ruleSetEdit.bpmn` 에 `flow_validate`(name `validate`) → `validateTask`(`camunda:class="ruleSetEditService"`, method `condIo`), `flow_execute`(name `execute`) → `executeTask`(method `simulate`) 와 끝 이벤트를 `ruleEdit.bpmn` 의 execute 블록 모양 그대로 더한다(BPMNDiagram 좌표 포함). 머리 주석의 action 표에 두 줄을 더한다.

- [ ] **Step 4: 골든 파일 만들기** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetSimulateTest' -Dgolden.update=true --console=plain)` 로 파일을 쓴 뒤, **사람이 읽고** 사례마다 Step 1 의 기대 요지(선택 갈래·outcome·merged·finalValues·violations 코드·경고 순서)가 맞는지 확인한다. 틀리면 구현을 고친다(파일을 손으로 고치지 않는다).

- [ ] **Step 5: action 테스트 갱신** — `DmeBpmnActionTest.ruleSetEdit_…` 를 7개 action 으로 바꾸고 이름을 `ruleSetEdit_는_search_view_save_delete_restore_validate_execute` 로 바꾼다(`validate`→`condIo`, `execute`→`simulate`, readOnly 는 search·view 만 true). `MdmOasisActionVocabularyTest` 의 ruleSetEdit 기대 집합에 `validate`·`execute` 를 더한다. `DmeOasisHttpTest` 에 steward 가 params `flowJson`·`recordJson` 으로 `execute`(사례 1)를 부르면 `meta.success` 가 true 이고 `data.result.trace.nodes` 가 6건(start·r1·if1·r2·m1·end)이며, `validate` 가 `data.result.condIo.e3.ok` true 를 돌려줌을 단언한다. 요청 본문은 화면이 보낼 모양 그대로 params 에 `flowJson`·`recordJson` 만 싣고 `grids` 는 두지 않는다. HTTP 응답의 `data.result.trace` 를 엔진 스키마 `$defs/RunTrace` 로 검증하고, 같은 사례의 골든 `response.trace` 와 JSON 이 같은지도 비교한다(전송 직렬화가 null 칸을 버리거나 모양을 바꾸면 여기서 잡힌다 — §9.1-2). READ 권한의 `execute`·`validate` 거부는 BFF RBAC(403)가 맡으므로 백엔드 테스트에 두지 않는다(`simulate`·`condIo` 는 읽기만 해 `requireSteward` 를 부르지 않는다 — 룰 값 테스트 `runTest` 와 같다).

- [ ] **Step 6: 통과 확인** — `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)` → 기준선과 같음. `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → ERROR 0.

- [ ] **Step 7: 커밋** — 두 커밋: `feat(mdm): 룰 세트 편집 execute(기록 실행)·validate(조건식 IO) action 과 실행 기록 JSON` / `fix(mdm): 저장값 손상만 MDM026 으로 좁혀 잡고 기록 실행 입력을 검증한다(§9.1-9)`.

---

### Task 5: 화면 의존성·빌드·테스트 환경

**모델:** sonnet

**Files:**
- Modify: `src/frontend/m-mdm/package.json`, `src/frontend/pnpm-lock.yaml`
- Modify: `src/frontend/m-mdm/tests/setup.ts`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/react-flow.ts`(스타일시트 import 한 곳)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/react-flow-smoke.test.ts`(새)

**Interfaces:**
- Produces: `@xyflow/react`(12.x 최신)·`@dagrejs/dagre`(최신) 의존성, happy-dom 에서 React Flow 가 노드를 그리는 테스트 환경, 스타일시트를 불러오는 모듈 `canvas/react-flow.ts`(`export * from "@xyflow/react"; import "@xyflow/react/dist/style.css";` — 캔버스 컴포넌트는 `@xyflow/react` 대신 이 모듈에서 import 한다)

- [ ] **Step 1: 의존성 추가** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm add @xyflow/react@^12 @dagrejs/dagre`. 설치된 정확한 버전과 peer 경고를 보고서에 적는다(React 19.2.4 와 맞아야 한다 — peer 가 `react>=17`). `@types/dagre` 가 필요하면(`@dagrejs/dagre` 가 타입을 싣지 않으면) devDependencies 로 더한다.

- [ ] **Step 2: 스모크 테스트(실패)** — `react-flow-smoke.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";

describe("React Flow 스모크", () => {
  it("크기를 준 노드 두 개와 선 하나를 그린다", async () => {
    const host = document.createElement("div");
    host.style.width = "800px";
    host.style.height = "600px";
    document.body.appendChild(host);
    const nodes = [
      { id: "a", position: { x: 0, y: 0 }, data: { label: "A" }, width: 120, height: 40 },
      { id: "b", position: { x: 0, y: 100 }, data: { label: "B" }, width: 120, height: 40 },
    ];
    const edges = [{ id: "e1", source: "a", target: "b" }];
    await act(async () => {
      createRoot(host).render(createElement(ReactFlowProvider, null, createElement("div", { style: { width: 800, height: 600 } },
        createElement(ReactFlow, { nodes, edges, fitView: false }))));
    });
    expect(host.querySelectorAll(".react-flow__node").length).toBe(2);
    expect(host.querySelector('[data-id="a"]')?.textContent).toContain("A");
  });
});
```

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/react-flow-smoke.test.ts` → FAIL(모듈 없음, 그다음 happy-dom 크기 0 으로 노드 미표시 또는 `DOMMatrixReadOnly is not defined` 류).

- [ ] **Step 4: 모듈·셋업 보강** — `canvas/react-flow.ts` 를 만들고 `tests/setup.ts` 에 React Flow 가 요구하는 것만 더한다: `DOMMatrixReadOnly`(m22 를 읽는 최소 구현 — React Flow 가 transform 배율을 읽는다), `HTMLElement.prototype.offsetWidth/offsetHeight` 가 0 이면 style 폭·높이나 기본값(800·600)을 돌려주는 getter, 기존 `ResizeObserver` 스텁은 `observe` 때 콜백을 한 번 부르게(요소의 위 크기로). 다른 화면 테스트가 깨지지 않는지 Step 5 에서 전체로 확인한다.

- [ ] **Step 5: 통과 확인** — 스모크 PASS, 이어서 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 전체가 기준선과 같다.

- [ ] **Step 6: 빌드·호스트 CSS 확인(§ 검토 9)** — m-mdm 은 tsup dist 로 호스트(m-mcm Next)에 들어간다(`m-mcm/lib/generated/page-registry.ts` 의 `import("@dk-oasis/m-mdm/pages/dme/ruleSetEdit/page")`). 스타일시트 경로가 호스트에서 풀리는지 실제로 확인한다.
  1. 임시로 `pages/dme/ruleSetEdit/page.tsx` 맨 위에 `import "./canvas/react-flow";` 한 줄을 넣는다(Task 9 가 실제 import 로 바꾼다 — 이 줄은 커밋하지 않는다).
  2. `pnpm --dir src/frontend --filter "@dk-oasis/m-mdm^..." build && pnpm --dir src/frontend --filter @dk-oasis/m-mdm build` → 성공. `grep -l "@xyflow/react/dist/style.css\|react-flow__" src/frontend/m-mdm/dist/pages/dme/ruleSetEdit/*` 로 CSS 가 external import 로 남았는지(또는 추출됐는지) 확인한다.
  3. `pnpm --dir src/frontend --filter "@dk-oasis/m-mcm^..." build && pnpm --dir src/frontend --filter @dk-oasis/m-mcm build` → 성공하고(호스트가 의존하는 m-analog·mls·mpn·mpp·mqc 등 dist 가 먼저 있어야 한다 — 1단계 브라우저 확인 때 같은 조치가 필요했다), `.next` 산출 CSS 에 `.react-flow` 선택자가 들어 있는지 `grep -rl "\.react-flow" src/frontend/m-mcm/.next/static/css` 로 확인한다.
  4. 3 이 실패하면(호스트가 m-mdm 의 의존성 CSS 를 풀지 못함) m-analog 선례(`m-analog/tsup.config.ts` 의 `noExternal = [/^react18-json-view\/src\/style\.css$/]` → `dist/pages/…/*.css` 추출, 호스트 `m-mcm/app/portal/module-config.ts` 에서 그 CSS 를 함께 import)로 바꾼다. m-mdm 페이지는 `PAGE_REGISTRY` 코드 생성으로 들어오므로, 그 경우 호스트 쪽 수정 위치(코드 생성 스크립트 `scripts/generate-page-registry.mjs` 또는 m-mdm 전용 CSS import)를 보고서에 적고 멈춰 NEEDS_CONTEXT 로 보고한다.
  5. 임시 import 줄을 되돌린다.

- [ ] **Step 7: 커밋** — `chore(m-mdm): React Flow·dagre 의존성과 happy-dom 캔버스 테스트 환경` (package.json·lock·setup.ts·react-flow.ts·스모크 테스트).

---

### Task 6: 편집 흐름 모델 `flow-edit.ts`

**모델:** opus

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-edit.test.ts`

**Interfaces:**
- Consumes: 1단계 `flow-model.ts` 의 `parseFlow`·`linearFlow`·`FlowTree`, 생성 계약 타입 `RuleSetFlow`·`FlowNode`·`FlowEdge`
- Produces: P7 전부

- [ ] **Step 1: 실패 테스트** — 연산마다 결과가 (a) `parseFlow` 오류 없는 흐름이고 (b) 노드·선이 모든 칸을 가지는지 공통 도우미로 확인한다.

```ts
import { describe, expect, it } from "vitest";

import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";
import {
  EMPTY_VIEW, addBranch, addGroup, addNote, connect, flowJsonOf, insertRule, insertSplit, moveBranch, nextId,
  removeBranch, removeNode, toEditFlow, updateEdge, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";

const NODE_KEYS = ["id", "kind", "ruleId", "splitId", "label"];
const EDGE_KEYS = ["id", "from", "to", "order", "cond", "otherwise", "label"];

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  for (const n of r.flow.nodes) expect(Object.keys(n)).toEqual(NODE_KEYS);
  for (const e of r.flow.edges) expect(Object.keys(e)).toEqual(EDGE_KEYS);
  return r.flow;
}
function valid(f: EditFlow) {
  expect(parseFlow(f).issues).toEqual([]);
  return f;
}

describe("flow-edit", () => {
  const base = toEditFlow(null, ["R_A"]); // start → r1 → end, 선 e1·e2

  it("null 흐름은 한 줄 흐름과 빈 view 다", () => {
    expect(base.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
    expect(base.view).toEqual(EMPTY_VIEW);
  });

  it("선 위에 룰을 끼운다", () => {
    const f = valid(ok(insertRule(base, "e2", "R_B")));
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
    expect(f.nodes.find((n) => n.ruleId === "R_B")?.id).toBe("r2");
  });

  it("IF 를 끼우면 짝 합류와 조건 갈래·그 외 갈래가 생기고, 조건식을 채우면 검사 오류가 없다", () => {
    const f = ok(insertSplit(base, "e2", "IF"));
    expect(parseFlow(f).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]); // 조건식 없음
    const out = f.edges.filter((e) => e.from === "if1");
    expect(out.map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [null, true, "그 외"]]);
    const g = valid(ok(updateEdge(f, out[0].id, { cond: 'S_A = "X"' })));
    expect(g.nodes.find((n) => n.kind === "MERGE")?.splitId).toBe("if1");
  });

  it("병렬을 끼우고 갈래를 더하고 옮기고 지운다", () => {
    let f = valid(ok(insertSplit(base, "e1", "PARALLEL")));
    f = valid(ok(addBranch(f, "par1")));
    const orders = () => f.edges.filter((e) => e.from === "par1").map((e) => [e.label, e.order]);
    expect(orders()).toEqual([["갈래 1", 1], ["갈래 2", 2], ["갈래 3", 3]]);
    const third = f.edges.filter((e) => e.from === "par1")[2].id;
    f = valid(ok(moveBranch(f, "par1", third, -1)));
    expect(f.edges.find((e) => e.id === third)?.order).toBe(2);
    f = valid(ok(removeBranch(f, "par1", third)));
    expect(f.edges.filter((e) => e.from === "par1")).toHaveLength(2);
    expect(removeBranch(f, "par1", f.edges.filter((e) => e.from === "par1")[0].id)).toEqual({ ok: false, reason: "분기에는 갈래가 2개 이상 있어야 한다" });
  });

  it("그 외 갈래는 지울 수 없고, 분기를 지우면 안쪽 노드까지 사라진다", () => {
    let f = ok(insertSplit(base, "e2", "IF"));
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    f = ok(updateEdge(f, cond.id, { cond: "true" }));
    f = valid(ok(insertRule(f, cond.id, "R_IN")));
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    expect(removeBranch(f, "if1", other.id)).toEqual({ ok: false, reason: '"그 외" 갈래는 지울 수 없다' });
    const g = valid(ok(removeNode(f, "if1")));
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
  });

  it("룰을 지우면 앞뒤 선을 잇고 view 흔적을 치운다", () => {
    let f = ok(insertRule(base, "e2", "R_B"));
    f = { ...f, view: { positions: { r2: { x: 1, y: 2 } }, notes: [{ id: "n1", text: "t", x: 0, y: 0, w: 100, h: 60, attach: "r2" }], groups: [{ id: "g1", title: "G", nodeIds: ["r2"] }] } };
    const g = valid(ok(removeNode(f, "r2")));
    expect(g.view.positions).toEqual({});
    expect(g.view.notes[0].attach).toBeNull();
    expect(g.view.groups).toEqual([]);
    expect(removeNode(g, "start")).toEqual({ ok: false, reason: "시작 노드는 지울 수 없다" });
  });

  it("nextId 는 노드·선·메모·그룹 어디에도 없는 가장 작은 번호다", () => {
    const { flow } = addNote(base, { x: 0, y: 0 }, null);
    expect(flow.view.notes[0].id).toBe("n1");
    expect(nextId(flow, "n")).toBe("n2");
    expect(nextId(flow, "e")).toBe("e3");
  });

  it("같은 선을 두 번 잇지 않고, START·END 는 그룹에 넣지 않는다", () => {
    expect(connect(base, "start", "r1")).toEqual({ ok: false, reason: "이미 이어진 선이다" });
    const r = addGroup(base, ["start", "r1", "end"], "묶음");
    expect(r.ok && r.flow.view.groups[0].nodeIds).toEqual(["r1"]);
  });

  it("flowJsonOf 는 서버 정규 JSON 과 같은 키 순서다", () => {
    expect(flowJsonOf(base)).toBe(
      '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},' +
        '{"id":"r1","kind":"RULE","ruleId":"R_A","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],' +
        '"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},' +
        '{"id":"e2","from":"r1","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],' +
        '"view":{"positions":{},"notes":[],"groups":[]}}',
    );
  });

  it("입력 흐름을 바꾸지 않는다", () => {
    const before = flowJsonOf(base);
    insertSplit(base, "e1", "IF");
    removeNode(base, "r1");
    expect(flowJsonOf(base)).toBe(before);
  });

  it("toEditFlow 는 모양이 틀린 view 항목을 버린다", () => {
    const f = toEditFlow({ ...base, view: { positions: { r1: { x: "a", y: 1 }, end: { x: 3, y: 4 } }, notes: [{ id: 1 }], groups: "x" } } as never, []);
    expect(f.view).toEqual({ positions: { end: { x: 3, y: 4 } }, notes: [], groups: [] });
  });
});
```

(1단계 `linearFlow` 의 노드·선 ID 가 `start`·`r1`…·`end`, `e1`… 임을 전제한다. 다르면 테스트 기대를 `linearFlow` 실제 값에 맞추고 보고서에 적는다.)

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-edit.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — P7 규칙대로. 도우미: `node(id, kind, ruleId?, splitId?, label?)`·`edge(id, from, to, extra?)` 는 모든 칸을 채운 객체를 만든다. `blockNodes(f, splitId)` = 분기의 나가는 선들에서 BFS 로 합류 직전까지 닿는 노드 ID 집합(합류 제외), `branchNodes(f, edgeId, mergeId)` = 그 선 하나의 갈래 안 노드 집합. 짝 합류 찾기 `mergeOf(f, splitId)` 는 `splitId` 가 같은 MERGE 가 정확히 하나일 때만.

- [ ] **Step 4: 통과 확인** — Step 2 명령 PASS, `pnpm --dir src/frontend --filter @dk-oasis/m-mdm lint` 0.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 룰 세트 흐름 편집 연산(flow-edit)`.

---

### Task 7: 배치(dagre)·변수 표시·가까운 선

**모델:** sonnet

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-layout.ts`, `flow-vars.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-layout.test.ts`, `flow-vars.test.ts`

**Interfaces:**
- Consumes: Task 5 의 `@dagrejs/dagre`, Task 6 의 `EditFlow`·`FlowPos`, 1단계 `RuleIoMap`·`RuleSetCheck`
- Produces: P8 전부

- [ ] **Step 1: 실패 테스트**

```ts
// flow-layout.test.ts
import { describe, expect, it } from "vitest";
import { toEditFlow, insertSplit, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";

function ifFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  const c = r.flow.edges.find((e) => e.from === "if1" && !e.otherwise)!;
  const u = updateEdge(r.flow, c.id, { cond: "true" });
  if (!u.ok) throw new Error(u.reason);
  return u.flow;
}

describe("flow-layout", () => {
  it("위에서 아래로 쌓는다(시작 < 룰 < IF < 합류 < 끝)", () => {
    const p = autoLayout(ifFlow());
    expect(p.start.y).toBeLessThan(p.r1.y);
    expect(p.r1.y).toBeLessThan(p.if1.y);
    expect(p.if1.y).toBeLessThan(p.m1.y);
    expect(p.m1.y).toBeLessThan(p.end.y);
    for (const v of Object.values(p)) { expect(Number.isInteger(v.x)).toBe(true); expect(Number.isInteger(v.y)).toBe(true); }
  });
  it("저장된 위치가 자동 배치를 이긴다", () => {
    const f = { ...ifFlow(), view: { positions: { r1: { x: 999, y: 7 } }, notes: [], groups: [] } };
    expect(positionsOf(f).r1).toEqual({ x: 999, y: 7 });
  });
  it("노드 크기 표", () => {
    expect(NODE_SIZE.RULE).toEqual({ w: 232, h: 68 });
    expect(NODE_SIZE.MERGE).toEqual({ w: 28, h: 28 });
  });
});
```

```ts
// flow-vars.test.ts — edgeChips·nodeMarks·edgeMarks·nearestEdge
import { describe, expect, it } from "vitest";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips, edgeMarks, nearestEdge, nodeMarks } from "../../../pages/dme/ruleSetEdit/flow-vars";
import type { RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";

const io = (ruleId: string, results: string[]): RuleIo => ({
  ruleId, ruleName: ruleId, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [],
  results: results.map((name) => ({ name, source: null, label: null, dataType: "STRING", scale: null, dateString: false, maruCodeId: null })),
});
const chk = (severity: "REJECT" | "WARN", nodeId: string | null, edgeId: string | null): RuleSetCheck =>
  ({ code: "ORDER", severity, ruleId: null, otherRuleId: null, varName: null, message: "m", nodeId, edgeId });

describe("flow-vars", () => {
  const f = toEditFlow(null, ["R_A", "R_B"]); // start → r1 → r2 → end (e1, e2, e3)
  it("룰에서 나가는 선에 결과 변수 칩", () => {
    expect(edgeChips(f, { R_A: io("R_A", ["S_A", "S_A2"]), R_B: io("R_B", []) })).toEqual({ e2: ["S_A", "S_A2"] });
  });
  it("노드·선마다 가장 무거운 심각도", () => {
    expect(nodeMarks([chk("WARN", "r1", null), chk("REJECT", "r1", null), chk("WARN", "r2", null)])).toEqual({ r1: "REJECT", r2: "WARN" });
    expect(edgeMarks([chk("WARN", "if1", "e3")])).toEqual({ e3: "WARN" });
  });
  it("가장 가까운 선(중점 거리 80px 안)", () => {
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 500 } };
    expect(nearestEdge(f, pos, { x: 60, y: 200 })).toBe("e2");
    expect(nearestEdge(f, pos, { x: 900, y: 200 })).toBeNull();
  });
});
```

(`nearestEdge` 의 중점 계산은 P8 의 NODE_SIZE 로 노드 아래·위 가운데를 잡는다. 테스트 좌표는 그 계산으로 e2 가 가장 가깝게 고른 값이다. 구현 뒤 기대가 어긋나면 계산을 손으로 다시 해 보고 테스트 좌표를 고치되 이유를 보고서에 적는다.)

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-layout.test.ts tests/dme/ruleSetEdit/flow-vars.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `autoLayout`: `new dagre.graphlib.Graph()`, `setGraph({ rankdir: "TB", nodesep: 40, ranksep: 46 })`, `setDefaultEdgeLabel(() => ({}))`, 노드마다 NODE_SIZE, 선마다 setEdge, `dagre.layout(g)` 뒤 중심 좌표를 좌상단(`x - w/2`, `y - h/2`)으로 바꿔 `Math.round`. 구조 오류로 고립된 노드도 배치된다(dagre 가 받는다).

- [ ] **Step 4: 통과 확인** — PASS, lint 0.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 흐름 자동 배치(dagre)와 변수 칩·검사 점·가까운 선 계산`.

---

### Task 8: 기록 해석 `trace-view.ts`

**모델:** opus

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/trace-view.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/trace-view.test.ts`

**Interfaces:**
- Consumes: Task 4 골든 `src/backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json`(사본을 만들지 않고 경로로 읽는다 — 코퍼스 테스트 `rule-set-corpus.test.ts` 가 백엔드 자원을 읽는 방식과 같다), 1단계 `parseFlow`, 생성 계약 `RunTrace`·`NodeTrace`·`TypedValue`
- Produces: P9 전부

- [ ] **Step 1: 실패 테스트** — 골든 사례를 이름으로 꺼내는 도우미 `golden(name)` → `{ flow: RuleSetFlow(= JSON.parse(flowJson)), trace: RunTrace, warnings }`.

```ts
describe("trace-view(골든)", () => {
  it("IF_FIRST_TRUE — 고른 선은 chosen, 안 탄 갈래는 끝에서 dim", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const last = trace.nodes.length - 1;
    const o = overlayAt(trace, flow, last);
    expect(o.edges.e3).toBe("chosen");
    expect(o.edges.e4).toBe("dim");
    expect(o.nodes.r3.state).toBe("dim");
    expect(o.nodes[trace.nodes[last].nodeId].state).toBe("current");
    const mid = overlayAt(trace, flow, 1);
    expect(mid.nodes.r3.state).toBe("pending");
  });

  it("IF_ERROR_STOPS — 오류 노드는 error, 칩은 위반 코드", () => {
    const { flow, trace } = golden("IF_ERROR_STOPS");
    const k = trace.nodes.length - 1;
    expect(overlayAt(trace, flow, k).nodes.if1).toEqual({ state: "error", seq: trace.nodes[k].seq, chip: "BRANCH_EVAL_ERROR" });
  });

  it("PARALLEL_MERGE — 둘째 갈래 단계에 첫 갈래 값이 보이지 않고, 합류에서 뒤 갈래가 이긴다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const fr = frames(trace, flow);
    const rs2 = fr.find((x) => x.node.nodeId === "rs2")!;
    expect(rs2.ctx.GT_F).toBeUndefined();      // 첫 갈래(r2)의 결과가 둘째 갈래 범위에 없다
    expect(rs2.ctx.GT_V).toEqual({ type: "STRING", value: "two" });
    const merge = fr.find((x) => x.node.nodeId === "m1")!;
    expect(merge.ctx.GT_V).toEqual({ type: "STRING", value: "two" });
    expect(merge.ctx.GT_F).toEqual({ type: "NUMBER", value: "1" });
    const t = valueTable(trace, flow);
    expect(t.vars.slice(0, 2)).toEqual(["GT_THK", "GT_KIND"]);
    expect(t.cols.map((c) => c.label)).toEqual(["GT_GRADE", "GT_FAST", "GT_SAME1", "GT_SLOW", "GT_SAME2", "합류 m1"]);
  });

  it("STRUCTURE_ERROR·MISSING_INPUT — 기록이 비면 모든 노드 pending", () => {
    for (const name of ["STRUCTURE_ERROR", "MISSING_INPUT"]) {
      const { flow, trace } = golden(name);
      expect(frames(trace, flow)).toEqual([]);
      expect(Object.values(overlayAt(trace, flow, 0).nodes).every((n) => n.state === "pending")).toBe(true);
    }
  });

  it("값 비교와 글자", () => {
    expect(typedText({ type: "NULL" })).toBe("NULL");
    expect(typedText({ type: "LIST", items: [{ type: "NUMBER", value: "1.10" }, { type: "STRING", value: "a" }] })).toBe("[1.10, a]");
  });
});
```

(골든의 실제 NUMBER 표기(`"1"` 대 `"1.00"` 등)와 병렬 실행 순서는 Task 4 골든 파일을 읽고 기대값을 맞춘다. 맞추면서 P9 의미와 다른 점이 보이면 멈추고 보고한다.)

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/trace-view.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `frames`: `parseFlow(flow).tree` 로 노드 → 갈래 경로 `[(splitId, edgeId)…]` 맵을 만들고(PARALLEL 만 범위를 만든다), 범위 스택으로 ctx 를 관리한다. 같은 분기의 갈래 범위는 `Map<splitId, Map<edgeId, ctx>>`. `overlayAt`·`valueTable` 은 `frames` 결과를 쓴다. 무거운 계산은 호출자가 `useMemo` 로 한 번만 부른다(Local-Rules §16 — 여기서는 순수 함수만).

- [ ] **Step 4: 통과 확인** — PASS, lint 0.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 실행 기록 해석(프레임·캔버스 겹침·값 표)`.

---

### Task 9: 캔버스 컴포넌트(노드·선·팔레트·룰 찾기)

**모델:** sonnet

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowCanvas.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/nodes.tsx`(RuleNode·IfNode·ParallelNode·MergeNode·TerminalNode·NoteNode·GroupNode)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowPalette.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/RuleSearchModal.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/canvas.css`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-canvas.test.ts`

**Interfaces:**
- Consumes: Task 5 `canvas/react-flow.ts`, Task 6 `EditFlow`, Task 7 `positionsOf`·`NODE_SIZE`·`edgeChips`·`nodeMarks`·`edgeMarks`·`nearestEdge`, Task 8 `Overlay`(props 로만 받는다 — Task 11 이 넘긴다), 1단계 `RuleIoMap`
- Produces: 아래 props 의 표현 컴포넌트. 상태를 갖지 않고(선택·확대 상태는 React Flow 내부) 편집은 콜백으로 올린다.

```ts
export interface FlowCanvasProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  mode: "view" | "edit";
  showVars: boolean;
  selectedId: string | null;            // 노드·메모·그룹 ID
  selectedEdgeId: string | null;
  overlay: Overlay | null;              // 디버거 겹침(Task 11)
  focusId: string | null;               // 검사 항목을 누르면 이 노드로 이동·깜빡임
  onSelect: (id: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onOpenRule: (ruleId: string) => void; // 링크 아이콘만
  onMove: (pos: Record<string, FlowPos>) => void;      // 끌기 끝(편집 모드만)
  onConnect: (from: string, to: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropPalette: (item: PaletteItem, at: FlowPos) => void;
  onNoteChange: (id: string, patch: Partial<FlowNote>) => void;
}
export type PaletteItem = "rule" | "if" | "par" | "note" | "group";
export interface FlowPaletteProps { onPick: (item: PaletteItem) => void; disabled: boolean; }
export interface RuleSearchModalProps { opened: boolean; usedRuleIds: ReadonlySet<string>; onClose: () => void; onPick: (io: RuleIo) => void; }
```

구현 전에 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고, 시안 `docs/mdm/design/basic/html/06-rule-set-flow.html` 의 노드 모양(§ 캔버스·노드 모양 표)과 색 토큰을 확인한다. 시안의 `:root` 토큰은 `@dk-oasis/shared/variables.css` 의 `--color-*`·`--spacing-*` 로 옮긴다(맞는 토큰이 없으면 `canvas.css` 안 `.rsf-canvas { --rsf-… }` 로 한 곳에 둔다). 한 변 색 바는 쓰지 않는다(Local-Rules §8) — 선택·실행·오류는 전체 테두리·배경·점·배지로 표시한다.

- 노드 모양: 시작·끝 알약형, 룰 흰 박스(룰명·종류·정책·룰 ID mono, 오른쪽 위 링크 아이콘 `IconExternalLink` 버튼 `flow-rule-open-{nodeId}` `aria-label="룰 편집 열기"`, 검사 점 `flow-node-mark-{nodeId}`), IF 파란 테두리 박스 + 마름모 아이콘 + 이름, 병렬 어두운 가로 막대, 합류 원, 메모 분홍 카드(편집 모드에서 글 고치기), 그룹 점선 틀(멤버 위치의 외곽 + 여백 16px, 제목).
- 선: 직교 경로(`smoothstep`, borderRadius 8). IF 갈래 선은 이름표(`label`)를 선 위에 보인다. `showVars` 면 RULE 에서 나가는 선에 변수 칩(`flow-edge-chips-{edgeId}`). 선을 누르면 `onSelectEdge`. 편집 모드에서 선택한 선을 Delete 키로 지우면 `onDeleteEdge`.
- 겹침(`overlay`): 노드 `run` 초록 전체 테두리 + 순번 배지(`seq`) + 칩, `current` 강조 테두리, `error` 빨간 테두리 + 코드 칩, `dim`/`pending` 흐리게(opacity .3 / .6). 선 `run` 초록 2px, `chosen` 초록 4px, `dim` opacity .22.
- 보기 모드: `nodesDraggable=false`, `nodesConnectable=false`, `elementsSelectable=true`(선택은 된다).
- 룰 박스 한 번 누르기 = `onSelect(nodeId)`, 두 번 누르기 = 아무 일 없음(`onNodeDoubleClick` 를 두지 않는다). 링크 아이콘 누르기는 `event.stopPropagation()` 뒤 `onOpenRule(ruleId)`.
- `focusId` 가 바뀌면 `setCenter` 로 그 노드로 옮기고 `rsf-flash` 클래스를 1.2초 준다.
- 팔레트: 세로 버튼 5개(`flow-add-rule` 룰 · `flow-add-if` IF 분기 · `flow-add-par` 병렬 분기 · `flow-add-note` 메모 · `flow-add-group` 그룹). 버튼은 HTML5 드래그 소스이기도 하다(`dataTransfer` 에 `application/x-rsf-palette` = item). 캔버스 `onDrop` 은 `screenToFlowPosition` 으로 좌표를 바꿔 `onDropPalette(item, at)`.
- 룰 찾기 모달: 키워드 칸(`flow-rule-search-keyword`)·찾기(`flow-rule-search-find`, Enter 도 같음) → `searchRules(keyword)` → `releasedVer != null` 인 룰만 후보(`flow-rule-cand-{ruleId}`, 룰명·상태·확정 버전), 이미 세트에 있는 룰은 "사용 중" 배지(고를 수는 있다 — 다른 갈래에 같은 룰을 둘 수 있다). 늦은 응답은 요청 순번으로 버린다(Local-Rules §11). 모달은 `@dk-oasis/shared` 의 모달 래퍼를 쓴다(스킬 문서 확인).

- [ ] **Step 1: 실패 테스트** — `flow-canvas.test.ts`(happy-dom, `createElement`, `DmesUiProvider` 로 감싼다 — `rule-set-edit-page.test.ts` 의 렌더 도우미 모양을 따른다). 흐름은 Task 7 테스트의 `ifFlow()` 와 같은 것.
  1. 노드 5개(`flow-node-start`·`-r1`·`-if1`·`-m1`·`-end`)와 `flow-rule-open-r1` 이 보이고, 룰이 아닌 노드에는 링크 아이콘이 없다.
  2. `flow-node-r1` 을 누르면 `onSelect("r1")`, `flow-rule-open-r1` 을 누르면 `onOpenRule("R_A")` 이고 `onSelect` 는 다시 불리지 않는다.
  3. `checks` 에 `{nodeId:"r1", severity:"REJECT"}` 가 있으면 `flow-node-mark-r1` 이 있다.
  4. `showVars=true` 이고 R_A 결과가 `S_A` 면 `flow-edge-chips-e2` 에 `S_A`.
  5. `overlay` 에 `r1: run seq 2` 를 주면 `flow-node-r1` 에 `data-state="run"` 과 순번 `2`.
  6. 보기 모드에서 `flow-palette` 가 없다(팔레트는 부모가 편집 모드에서만 그린다 — 이 테스트는 `FlowPalette` 의 `disabled` 동작만 본다).
  7. `RuleSearchModal`: `searchRules` 를 목(mock)으로 두고 후보 3개 중 `releasedVer: null` 하나가 빠지고, 세트에 있는 룰에 "사용 중" 이 보인다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-canvas.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 위 명세대로. 노드 데이터는 `data-testid`·`data-state` 를 노드 루트 요소에 둔다. React Flow 의 노드 크기는 `NODE_SIZE` 를 `width`·`height` 로 넘겨 측정 없이도 그린다(테스트 환경과 같다).

- [ ] **Step 4: 통과 확인** — PASS, lint 0, 스킬 `audit` 두 개 0건(바꾼 파일 대상).

- [ ] **Step 5: 커밋** — `feat(m-mdm): 룰 세트 흐름 캔버스·노드·팔레트·룰 찾기 팝업`.

---

### Task 10: 화면 통합 — 흐름 상태·툴바·속성 패널·검사 패널·저장, 목록 편집 제거

**모델:** opus

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts`, `types.ts`(P6)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/GuideCard.tsx`, `cards/SetIoTables.tsx`(오른쪽 패널에 맞춘 폭·배치만)
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowToolbar.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/{SetPanel,PropertyPanel,ChecksPanel,BottomPanel}.tsx`
- Delete: `cards/RuleListGrid.tsx`, `cards/RuleSetCard.tsx`(「삭제 대상」)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts`(목록 테스트를 캔버스 테스트로 바꿔 쓴다)

**Interfaces:**
- Consumes: Task 1 조회 `condIo`·저장 `flowJson`, Task 2 `COND_UNTYPED`, Task 4 `validate` action, Task 6 편집 연산·`flowJsonOf`·`toEditFlow`, Task 7 `positionsOf`·`autoLayout`, Task 9 캔버스·팔레트·모달, 1단계 `flowChecks`·`flowIo`·`linearFlow`
- Produces: 상태 훅 `useRuleSetEdit` 의 새 모양(아래), P10 testid, 아래 패널의 "시뮬레이션" 탭 자리(`BottomPanel` 의 `simulation` 슬롯 — Task 11 이 채운다)

```ts
export interface RuleSetEditState {
  view: RuleSetView | null;
  flow: EditFlow | null;
  rules: Record<string, RuleIo>;
  condIo: Record<string, CondIo>;
  condIoPending: boolean;
  checks: RuleSetCheck[];                 // flowChecks(flow, rules, condIo) — flow·rules·condIo 가 바뀔 때만 다시 계산(useMemo)
  mode: "view" | "edit";
  setName: string;
  description: string;
  dirty: boolean;
  loading: boolean;
  conflict: boolean;
  message: RuleSetMessage | null;
  error: string | null;
  flowVersion: number;                    // nodes·edges 가 바뀔 때만 1 증가(디버거가 표시를 지우는 신호). view(위치·메모·그룹)만 바뀌면 올리지 않는다
  open(setId: string): Promise<void>;
  reload(): Promise<void>;
  setMode(m: "view" | "edit"): void;
  setSetName(v: string): void;
  setDescription(v: string): void;
  edit(fn: (f: EditFlow) => EditResult | EditFlow): string | null;   // 실패 사유 또는 null. 성공하면 flow 교체, nodes·edges 가 바뀌었으면 flowVersion+1, 조건식이 바뀌었으면 condIo 재요청
  addRuleIo(io: RuleIo): void;
  applyGuide(order: readonly string[], ios: readonly RuleIo[]): void; // 한 줄 흐름만(P-D5)
  save(): Promise<void>;
  deprecate(): Promise<void>;
  restore(): Promise<void>;
  reportError(e: unknown): void;
  clearError(): void;
}
```

- 조건식 IO 재요청: `edit` 결과에서 IF 의 otherwise 아닌 선들의 `(id, cond)` 목록이 바뀌었으면 400ms 디바운스 뒤 `validateFlow(flowJsonOf(flow))` 를 부른다. 요청 순번을 두고 최신 응답만 반영한다. 기다리는 동안 `condIoPending=true`(저장 버튼 꺼짐). 실패하면 `reportError` 하고 pending 을 푼다(condIo 는 그대로).
- 저장: `saveSet(setId, setName, description, rowVersion, flowJsonOf(flow))`. 성공 뒤 다시 불러와 서버 정규 흐름으로 바꾼다. 거부·MDM001 처리는 지금과 같다.
- dirty·저장 버튼·편집 모드 규칙은 P10.
- 세트를 열면(또는 다시 불러오면) `flow = toEditFlow(view.set.flow, view.set.ruleIds)`, `condIo = view.condIo`, `rules` = view.rules 맵, 모드 `view`.
- 편집 → 보기 전환은 편집 내용을 버리지 않는다(dirty 는 그대로).

화면 배치(P10 그림): 위 세트 고르기 바 → `FlowToolbar` → 본문 3단(편집 모드에서만 `FlowPalette` | `FlowCanvas` | 오른쪽 `ResizableFormPanel`(`@dk-oasis/shared/layout`, 기본 폭 360)) → `BottomPanel`(탭 `@dk-oasis/shared/tabs`: "검사 결과 {n}" · "시뮬레이션", 접기). 본문 높이는 페이지 높이를 채운다(`MdmPageLayout` 안에서 flex).

- 오른쪽 패널: 선택 없음 → `SetPanel`(세트명 `set-name`·설명 `set-desc`(편집 모드만 입력), 입출력 표 `SetIoTables`(`flowIo(flow, rules)` 결과), 구성 지침 `GuideCard`). 선택 있음 → `PropertyPanel`:
  - 룰: 룰명·룰 ID·종류·정책·확정 버전, 입력 변수(이름·출처 배지·어디서 오는지 — 앞 경로의 룰 결과면 그 룰 ID, DICT 면 "컬럼 사전", PROG 면 "프로그램 변수"; 검사 항목에 이 노드·변수가 있으면 그 문구를 아래에 경고색으로), 결과 변수, [룰 편집 열기](`flow-prop-rule-open` → `openRule`), [지우기](`flow-prop-delete`, 편집 모드).
  - IF: 분기 이름(`flow-prop-label`), 갈래 목록(order 순, "그 외" 마지막): 이름·조건식(Textarea, "그 외"는 조건식 칸 없음)·▲▼✕·[갈래 더하기]. 조건식 칸 아래에 그 선의 검사 문구(`FLOW_COND`·`FLOW_PARTIAL`·`COND_UNTYPED`).
  - 병렬: 갈래 이름·▲▼✕·[갈래 더하기].
  - 합류·시작·끝: 종류 설명만. 메모: 글(`flow-prop-note-text`). 그룹: 제목(`flow-prop-group-title`)·[지우기].
  - 보기 모드에서는 모든 입력이 읽기 전용이고 ▲▼✕·지우기·더하기가 없다.
- 팔레트 동작(P-D10): 룰 → `RuleSearchModal` → 고르면 `addRuleIo(io)` 뒤 `edit(f => insertRule(f, 대상 선, io.ruleId))`. 대상 선 = 고른 선, 없으면 END 로 들어가는 첫 선. IF·병렬 → `insertSplit`. 메모 → 선택 노드 옆(없으면 캔버스 가운데)에 `addNote`. 그룹 → 선택 노드(React Flow 다중 선택 포함)로 `addGroup(…, "그룹")`. 연산 실패 사유는 `set-message` 에 오류로 보인다.
- 노드 상한: 룰·IF·병렬 끼우기 전에 `flow.nodes.length + 추가될 노드 수 > 200`(`MAX_NODES` 와 같은 값, `flow-edit.ts` 에 `export const MAX_NODES = 200`) 이면 끼우지 않고 `set-message` 에 `노드는 흐름 하나에 200개까지 둔다` 를 오류로 보인다.
- 끌어 놓기: `onDropPalette(item, at)` → `nearestEdge(flow, positionsOf(flow), at)` 가 있으면 그 선에, 없으면 위 기본 선에 같은 동작.
- 끌기 끝(`onMove`) → `setPositions`. [자동 정렬] → `setPositions(flow, autoLayout(flow))`(모든 노드 위치를 덮어쓴다, dirty). [화면 맞춤] → React Flow `fitView`.
- 검사 패널: `ChecksPanel` 은 요약 줄(거부 n · 경고 m, 없으면 "통과")과 항목(`set-check-{i}`: 심각도 배지·문구·노드 ID)을 보인다. 누르면 `focusId`·선택을 그 노드로(nodeId 가 없으면 아무 일 없음).
- 구성 지침 적용(`set-guide-apply`): 흐름에 분기가 없으면 `toEditFlow(linearFlow(order), [])` 로 흐름을 바꾸고(view 초기화) IO 를 더한다. 분기가 있으면 버튼을 끈다.
- 폐기·되살리기·다시 불러오기·충돌 안내·권한 비활성은 지금 동작을 그대로 옮긴다(`FlowToolbar`).

- [ ] **Step 1: 페이지 테스트 바꿔 쓰기(실패)** — `rule-set-edit-page.test.ts` 의 목(mock)은 그대로 두고(`@/dme/rule-handoff`, `@/shell`, `@dk-oasis/shared/grid`, `callOasis` 응답 표), 목록 그리드 테스트를 지우고 아래로 바꾼다. 기존 세트 고르기·폐기·되살리기·MDM001·권한 테스트는 testid 가 같으면 그대로 두고, 바뀐 testid 만 고친다.
  1. 한 줄 세트(`flow: null`, ruleIds 3개)를 열면 캔버스 노드 5개(`start`·`r1`~`r3`·`end`), 보기 모드, 팔레트 없음, `set-save` 꺼짐.
  2. [편집] → 팔레트 보임. [IF] 를 누르면(선 선택 없음) END 로 들어가는 선에 IF 가 끼워지고, 검사 패널에 `FLOW_IF_ELSE` 거부가 보이고 `set-save` 꺼짐(P-D4).
  3. IF 를 선택하고 첫 갈래 조건식에 `S_GRD = "A"` 를 넣으면 400ms 뒤 `validate` 가 한 번 불리고(가짜 타이머), 응답 전에는 `set-save` 꺼짐, 응답(condIo ok, vars `S_GRD` NONE) 뒤 거부가 없어지면 켜짐.
  4. [세트 저장] → `save` 호출 params 에 `flowJson` 문자열이 있고 `grids` 가 없다. `JSON.parse(flowJson).nodes` 에 IF·MERGE 가 있다.
  5. 조건식을 빠르게 두 번 바꾸고 첫 `validate` 응답이 두 번째보다 늦게 오면 첫 응답은 버려진다(두 번째 응답의 condIo 가 남는다).
  6. 룰 박스 `flow-rule-open-r2` 를 누르면 `openRuleEdit("E2S_FCT")`, 박스 `flow-node-r2` 를 누르면 `flow-prop-rule` 이 보이고 `openRuleEdit` 는 불리지 않는다.
  7. 보기 모드에서 룰을 선택하면 속성 패널 입력이 읽기 전용이고 `flow-prop-delete` 가 없다.
  8. 편집 모드에서 룰을 지우면 앞뒤 선이 이어지고 dirty 가 된다. 세트 고르기로 다른 세트를 열려 하면 `window.confirm` 이 불린다(지금 동작).
  9. 검사 항목 `set-check-0` 을 누르면 그 노드가 선택된다.
  10. 분기 세트(`branched: true`, `flow` 있음)를 열면 흐름 그대로 그려지고 편집할 수 있다(`set-branched-notice` 는 없다).
  11. 한 줄 세트에서 구성 지침 적용 → 노드 순서가 제안 순서로 바뀐다. 분기 세트에서는 `set-guide-apply` 꺼짐.
  12. READ 권한(`canDoButton("save")` false)이면 [편집] 이 꺼져 있다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 위 명세대로. `RuleListGrid.tsx`·`RuleSetCard.tsx` 를 `/usr/bin/git rm` 으로 지운다. `set-model.ts` 의 목록 함수는 남긴다. `page.tsx` 머리 주석의 "흐름도 편집기는 2단계다" 문장을 지금 구성 설명으로 바꾼다.

- [ ] **Step 4: 통과 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` PASS, lint 0, 스킬 `audit` 두 개 0건, 완료 게이트(Local-Rules §2-1) 통과.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 룰 세트 편집 화면을 흐름도 캔버스로 바꾸고 목록 편집을 없앤다`.

---

### Task 11: 디버거 화면(시뮬레이션 탭·따라가기·겹침·노드 상세·값 표)

**모델:** sonnet

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/{SimulationPanel,TraceStepper,TraceDetail,ValueTable}.tsx`
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts`
- Modify: `page.tsx`(겹침·노드 상세 연결), `panels/BottomPanel.tsx`(시뮬레이션 슬롯)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/debugger.test.ts`

**Interfaces:**
- Consumes: Task 4 `simulate`(P6), Task 8 `frames`·`overlayAt`·`valueTable`·`typedText`, Task 10 상태(`flow`·`rules`·`flowVersion`), 1단계 `flowIo`, 룰 편집 값 테스트 `pages/dme/ruleEdit/value-test/case-form.ts` 의 `inputFormOf`·`inputJsonOf`·`parseObject`
- Produces: `useSimulation(flow, rules, flowVersion)` → `{ inputs, setInput, json, setJson, evalTs, setEvalTs, run(), running, result: { trace, warnings, flow } | null, step, setStep, clear(), clearedByEdit: boolean }`

- 입력 폼: `flowIo(flow, rules).inputs` 가운데 source 가 DICT·PROG 인 이름(P-D8)으로 `inputFormOf(names, "")` 줄을 만든다. 칸(`sim-input-{name}`)마다 이름·표시명·타입(`typeText`)·출처 배지. 빈 칸은 null 로 보낸다(값 테스트와 같다 — 키 보냄 끄기 체크박스도 같은 방식).
- JSON 붙여 넣기(`sim-json`): 비어 있지 않으면 폼 대신 이것을 보낸다(`parseObject` 로 객체인지 먼저 확인하고, 아니면 칸 아래 오류 문구). "폼으로 가져오기" 버튼이 JSON 을 폼 줄로 풀어 준다.
- 판정 시각(`sim-evalts`): 기본 빈 칸(서버가 현재 시각), 형식 `yyyy-MM-dd HH:mm:ss`.
- [실행](`sim-run`): `canDoButton("execute")` 일 때만 켜진다(P-D3 — 꺼져 있으면 title `디버거는 편집 권한이 있어야 쓸 수 있다`). `simulate(flowJsonOf(flow), recordJson, evalTs)` — 저장하지 않은 흐름을 보낸다. 받은 기록과 **그때의 흐름 사본**을 결과에 둔다. 단계는 마지막으로 둔다.
- 따라가기(`TraceStepper`): [처음] [이전] [다음] [끝] + 진행 막대(`@dk-oasis/shared/form` 의 `ProgressBar`, `sim-progress`, 값 = (step+1)/총수) + 상태 문구(`sim-status`): 끝까지 갔으면 `완료 · {n}단계 · 결과 변수 {m}개`, 멈췄으면 `오류로 멈춤 — {nodeId}: {첫 위반 문구}`, 기록이 비었으면 `실행 전 오류 — {첫 위반 문구}`, 따라가는 중이면 `{step+1}/{n} · {nodeId}`. 키보드 ←→ 로도 넘긴다(시뮬레이션 탭에 포커스가 있을 때).
- 겹침: `page.tsx` 가 `overlayAt(result.trace, result.flow, step)` 을 캔버스 `overlay` 로 넘긴다(`useMemo`). 지금 단계 노드로 캔버스를 옮긴다(`focusId`).
- 흐름 구조가 바뀌면(`flowVersion` 이 실행 때 값과 다르면 — 노드를 끌어 옮기거나 메모만 고친 것은 해당하지 않는다) 결과를 지우고 `sim-status` 에 `흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다` 를 보인다(Review Focus 3). [표시 지우기](`sim-clear`)도 같은 지우기를 한다(문구 없음).
- 노드 상세(`TraceDetail`, `sim-detail`): 실행 결과가 있고 노드를 누르면 오른쪽 패널에 속성 패널 대신 보인다(탭 "실행 결과" / "속성" 으로 전환).
  - 룰: 읽은 입력값 표(`reads`), 맞은 행(`hits` rowId·seq)과 기본 행 사용, 결과값 표(`result.results`), 행마다 평가·적중·처음 거짓 열(`result.trace`), 경고, [룰 편집 열기].
  - IF: 갈래마다 선 이름·조건식(흐름 사본에서)·결과 배지(참 / 거짓 / NULL / 오류 / 평가 안 함) 와 오류 문구.
  - 병렬: 실행 순서(`order` 의 선 이름), 합류에서 합친 변수(`merged`, MERGE 노드 상세).
  - 오류 노드: 위반마다 한국어 문장(`RuleErrorText` 와 같은 규칙의 화면 문구 — `ruleEdit/cards/TestResultCard.tsx` 의 오류 표시 방식을 그대로 따른다: 본문 문장, 코드는 `title`, 원문은 접힌 `<details>`, Local-Rules §13).
- 값 표(`ValueTable`, `sim-values`): `valueTable(trace, flow)` — 행 = 변수, 열 = 단계(라벨), 칸 = `typedText`. 바뀐 칸은 배경 강조, 지금 단계 열은 테두리 강조. 가로로 길면 표 안에서 가로 스크롤(페이지 가로 스크롤 금지).
- 경고(`sim-warnings`): 응답 `warnings` 를 코드 배지 + 문구 목록으로.

- [ ] **Step 1: 실패 테스트** — `debugger.test.ts`(happy-dom). `callOasis` 목이 `execute` 에 Task 4 골든의 `PARALLEL_MERGE`·`IF_ERROR_STOPS` 응답을 돌려준다(골든 파일을 경로로 읽는다). 흐름은 골든 사례의 `flowJson` 으로 세트를 연 것처럼 둔다.
  1. 입력 칸이 `GT_THK`·`GT_KIND` 두 개(DICT)다. 값을 넣고 [실행] → `execute` params 에 `flowJson`·`recordJson`(`{"GT_THK":"12","GT_KIND":"x"}`)이 있다.
  2. 응답 뒤 `sim-status` 가 `완료 · 9단계 · 결과 변수 {m}개`(PARALLEL_MERGE 노드 9개: start·r1·par1·r2·rs1·r3·rs2·m1·end — 병렬 갈래 순서는 골든을 따른다, m 은 골든 finalValues 의 결과 변수 수), [처음] → `1/9 · start`, [다음] → `2/9 · r1`, 캔버스 `flow-node-r1` 이 `data-state="current"`.
  3. `sim-values` 에 열 `합류 m1` 이 있고 `GT_V` 행 마지막 칸이 `two`.
  4. `IF_ERROR_STOPS` 응답이면 `sim-status` 가 `오류로 멈춤 — if1: …` 이고 `flow-node-if1` 이 `data-state="error"`, if1 을 누르면 `sim-detail` 에 갈래 결과 "오류"·"평가 안 함" 배지.
  5. 실행 뒤 편집 모드에서 노드 위치만 옮기면(`onMove`) 겹침이 남고, 룰 하나를 지우면 겹침이 사라지고 `sim-status` 에 `흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다`.
  6. `canDoButton("execute")` 가 false 면 `sim-run` 이 꺼져 있다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/debugger.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 위 명세대로.

- [ ] **Step 4: 통과 확인** — `tests/dme/ruleSetEdit` 전체 PASS, lint 0, `audit` 두 개 0건, 완료 게이트 통과.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 룰 세트 디버거(시뮬레이션 탭·따라가기·겹침·노드 상세·값 표)`.

---

### Task 12: 설계 문서·식별자·e2e 갱신

**모델:** sonnet

**Files:**
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
- Modify: `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md`(§9.1 각 항목 끝에 "처리: Task N, D-11x" 한 줄씩, §9 표 2단계 행에 "완료" 표시는 병합 뒤라 하지 않는다)
- Modify: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql`
- Modify: 식별자 사전 — `docs/guide/Common/Identifier-Glossary.md` 에 ruleSetEdit action 이 기록돼 있으면 `validate`·`execute` 를 더한다(없으면 손대지 않고 보고서에 "해당 없음")

**Interfaces:**
- Consumes: Task 0~11 결과, Task 3 보고서의 "판정이 바뀐 사례" 표

- [ ] **Step 1: 기능설계서 개정** — 바꿀 절:
  - §1.2 Frontend 파일 목록(새 폴더 `canvas/`·`panels/`·`debugger/`, 순수 모듈 `flow-edit.ts`·`flow-layout.ts`·`flow-vars.ts`·`trace-view.ts`), action 어휘에 `validate`(조건식 IO)·`execute`(기록 실행) 추가.
  - §2 영역 정의를 P10 배치(툴바·팔레트·캔버스·오른쪽 패널·아래 패널)로 바꾼다. §3.2 룰 목록 그리드 표를 지우고 "캔버스 노드" 표(노드 종류·모양·표시 내용·testid)로 바꾼다.
  - §4 D-003 을 흐름 편집으로, §5 버튼 표를 P10 testid 로, §5.2 저장 동작을 `flowJson` 과 저장 버튼 규칙(P-D4)으로, §5.3 그리드 동작 절을 "캔버스 동작"(선택·링크 아이콘·끌기·자동 정렬·팔레트 끼우기·끌어 놓기)으로 바꾼다.
  - §6.2 에 `COND_UNTYPED`(XV-020)를 더한다. §7 상태 표에서 "분기 세트 읽기 전용" 행을 지우고 보기/편집 모드 행을 넣는다.
  - §8 권한 표에 디버거 행(`execute`, 표준 관리자 X — P-D3).
  - §11 N-1 을 "2단계 디버거로 채움(D-112)"으로 닫고, N-8 을 P-D4 로 개정, N-12(그리드 폭)는 "그리드 삭제로 해당 없음", 새 N-16(디버거 — 저장 전 흐름 실행, 값 표 병렬 의미), N-17(Task 3 의 확정 검사 판정 변화 표).
- [ ] **Step 2: e2e 픽스처** — `mdm-ruleSet-data.sql` 끝에 분기 세트 하나를 더한다: `E2S_FLOW`(INUSE), `RULE_IDS = ["E2S_GRD","E2S_FCT","E2S_SPD"]`, `FLOW_JSON` = `start → r1(E2S_GRD) → if1 { e3 order1 cond 'S_GRD = "A"' → r2(E2S_FCT) ; e4 otherwise → m1 } → m1 → r3(E2S_SPD) → end` 의 P2 정규 JSON(view 기본). INSERT 칼럼 목록에 `FLOW_JSON` 을 더하고 기존 행은 NULL.
- [ ] **Step 3: e2e 시나리오 바꿔 쓰기** — 목록 testid 를 쓰는 E2·E3·E6 을 캔버스 기준으로 바꾼다.
  - E2: E2S_CHAIN 을 열면 캔버스 노드 5개와 입출력 표·검사 "통과".
  - E3: 편집 → END 앞 선에 IF 끼우기 → `FLOW_IF_ELSE` 거부로 저장 꺼짐 → 조건식 입력 → 저장 켜짐(dirty 확인 포함).
  - E6: 구성 지침 제안 순서 적용 → 저장 → 다시 열어 순서 유지.
  - 새 E11: E2S_FLOW 를 열고 시뮬레이션 탭에서 `SET_THK` 등 입력 → 실행 → [다음] 으로 넘기며 IF 선택 선 강조 확인 → 값 표.
  - 새 E12: 룰 박스 링크 아이콘이 룰 화면 탭을 열고, 박스 누르기는 속성 패널만 연다.
  - 스모크 넷은 E1·E2·E5·E8 그대로. 실행은 하지 않는다(Local-Rules §4 — 사용자 승인 필요). `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` 로 목록만 확인한다.
- [ ] **Step 4: 확인** — 기능설계서 안의 testid 가 화면 코드에 모두 있는지 `grep` 으로 대조한다(목록을 보고서에 적는다).
- [ ] **Step 5: 커밋** — `docs(mdm): ruleSetEdit 기능설계서를 흐름도 캔버스·디버거로 개정` / `test(e2e): 룰 세트 편집 e2e 를 캔버스·디버거 기준으로 갱신`.

---

### Task 13: 브라우저 확인(ego-browser)과 최종 리뷰

**모델:** sonnet(브라우저 확인) · opus(최종 전체 리뷰)

1단계 브라우저 확인(가) 방식을 따른다. 본체 스택(mcm·mdm bootRun + fe-run)이 병합 전 코드로 떠 있으므로 잠시 내리고 워크트리 스택을 띄운 뒤, 확인이 끝나면 본체 스택을 되살린다. 본체 DB 는 바꾸지 않는다(워크트리 `data/*.db` 는 본체에서 복사한다). mdm 재기동 때 V14 가 워크트리 DB 사본에 적용된다(이미 적용됐으면 그대로).

- [ ] **Step 1: 준비(컨트롤러)** — 1단계 장부의 스크립트(`stack.sh stop-main / start-wt / stop-wt / start-main`)를 이 세션 scratchpad 에 다시 만들고, 복구 명령을 장부에 먼저 적는다. 재기동은 메모리 권장대로 `TSUP_DTS=0` 을 쓴다. 워크트리 DB 사본의 `E2S_*` 픽스처가 없으면 Task 12 픽스처 SQL 을 사본에만 넣는다.
- [ ] **Step 2: 확인(sonnet, ego-browser 스킬)** — 포털 5100 → 마루 MDM > 업무기준 > 룰 세트 편집:
  1. 한 줄 세트·분기 세트가 캔버스로 그려지고 React Flow 스타일(선·손잡이·확대 막대)이 적용됐다(스타일시트 로드 확인 — 콘솔 오류 0).
  2. 편집: IF 끼우기 → 조건식 입력 → 검사 패널 변화 → 저장 → 다시 불러와 배치 유지.
  3. 룰 박스 누르기 = 속성 패널, 링크 아이콘 = 룰 편집 탭.
  4. 시뮬레이션: 입력 → 실행 → 처음/다음/끝 → 겹침·값 표·노드 상세.
  5. 창 폭 1280·1920 에서 가로 스크롤 없음.
  화면마다 스크린숏을 장부 `screens/` 에 남기고, 발견한 문제는 재발 가능한 것이면 `docs/guide/FrontEnd/Local-Rules.md` 에 짧게 적는다(메모리 규칙 — RULE.md 본문 X).
- [ ] **Step 3: 복구** — 본체 스택을 되살리고 5100·8096·8100 응답을 확인한다.
- [ ] **Step 4: 최종 전체 리뷰(opus)** — `dev..feat/rule-set-flow-phase2` 전체. 이 계획의 Review Focus 5개, §9.1 9항 처리, 삭제 대상 반영, deferred minor 분류를 요청한다.
- [ ] **Step 5: 마감 보고** — Ruling 전부, 사용자 확인 사항(P-D3 표준 관리자 디버거 불가, e2e 실행 승인 여부, dev 병합 여부)을 보고한다. 병합은 사용자 지시가 있을 때 `superpowers:finishing-a-development-branch` 로 한다.

---

## 자체 점검 (계획 작성 뒤)

- 스펙 §7: 위치(Task 10), 클릭 동작(Task 9·10), 룰 편집 열기(Task 9), 팔레트(Task 9·10, P-D10), 속성 패널(Task 10), 변수 흐름 표시(Task 7·9), 검사 패널(Task 10), 자동 정렬(Task 7·10), 패키지(Task 5) — 모두 담당이 있다.
- 스펙 §8: 입력 폼·JSON 붙여 넣기(Task 11, P-D8), 실행(Task 4·11), 따라가기·진행 막대(Task 11), 캔버스 겹침(Task 8·9·11), 노드 상세(Task 11), 값 표(Task 8·11) — 모두 담당이 있다. 테스트 케이스 저장·운영 기록 재생은 스펙대로 뒤로 미룬다.
- 스펙 §9.1: 1(Task 1, 실측 반영 P-D1), 2(Task 4), 3(Task 1), 4(Task 2), 5(Task 2), 6(Task 3), 7(Task 1), 8(Task 1, P-D6), 9(Task 4, P-D9).
- D-110 이 2단계로 넘긴 디버거 경고: Task 4(P5 warnings).
- 이름 일관성: `flowJson`(요청 칸)·`flowJsonOf`(화면)·`canonical`(서버), `condIo`(서비스 메서드·응답 칸)·`validateFlow`(화면 API), `simulate`(서비스 메서드·화면 API)·`execute`(action) — P1·P5·P6·P7 에 같은 이름으로 적었다.
