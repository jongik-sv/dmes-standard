# 룰 세트 흐름도 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트를 IF·병렬 분기가 있는 흐름도로 저장·검사·실행하고, 노드 단위 실행 기록(`traceSet`)과 OASIS 에서 부를 실행 클래스(`RuleSetRunner`)를 만든다. 화면은 기존 목록 편집을 유지하고 분기 세트만 읽기 전용으로 보인다.

**Architecture:** 흐름 정의 타입은 엔진 `spi` 에, 흐름 구조 해석(블록 트리·구조 검사·노드 관계)은 엔진의 새 공개 패키지 `flow` 에, 실행·기록은 엔진 `rule` 에 둔다. mdm/lib 은 FLOW_JSON 코덱·흐름 기준 분석기·DB 정의 조회기·`RuleSetRunner` 를 갖는다. 화면 `set-model.ts` 는 같은 알고리즘을 TS 로 한 벌 더 갖고 `rule-set-corpus.json` 이 동치를 고정한다.

**Tech Stack:** Java 21, EvalEx 3.7.0(엔진 유일 의존), Spring Boot + OASIS(BPMN), SQLite + Flyway, JUnit 5 + ArchUnit, TypeScript + Vitest, json-schema-to-typescript.

**Spec:** `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` (2026-09-30 승인, 커밋 8a0dd594)

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow`, 브랜치 `feat/rule-set-flow`(dev 8a0dd594 에서 분기). 모든 명령은 워크트리 루트 기준이다.

---

## Global Constraints

- 패키지: 엔진은 `kr.dongkuk.maru.mdm.engine.*`, MDM 앱은 `com.dongkuk.dmes.mdm.*` 를 그대로 쓴다(2026-09-30 사용자 문의로 확인. 엔진 접두어 변경은 이 작업 범위 밖).

- 엔진(`src/backend/maru-mdm-engine`) main 의존은 `com.ezylang:EvalEx:3.7.0` 하나뿐이다. Jackson·Spring 을 엔진 main 에 넣지 않는다(`TRD.md:134`).
- 엔진 계약 타입(record·enum)은 로직이 없다: 추가 생성자·compact 생성자·메서드 금지(`ContractTypeShapeTest`). 그래서 스펙 §4.1 의 "기존 생성자 위임"은 쓰지 않고 호출처를 모두 고친다(편차 D1).
- 엔진 `expr`·`rule` 패키지의 모든 record·enum 은 스키마 `$defs` 와 짝이 있거나 `JAVA_ONLY` 에 사유와 함께 있어야 한다(`EngineContractSchemaTest`).
- 계약 네 벌은 한 커밋에서 함께 바뀐다: `docs/mdm/engine-contract.md`, 엔진 스키마 `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`, 엔진 Java 타입, `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(생성: `pnpm --filter @dk-oasis/m-mdm gen:contract`). `docs/mdm/engine-contract/`(java·schema·ts 초안)은 정본이 아니므로 갱신하지 않고 README 에 "정본 아님" 표시만 둔다.
- 서버 `RuleSetAnalyzer` 와 화면 `set-model.ts` 는 같은 입력에 같은 `checks`(코드·심각도·ID·변수·문구·순서)를 낸다. 사례는 `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json` 한 벌이다. 기존 사례는 바이트 단위로 그대로 둔다(한 줄 흐름 회귀 방지).
- 정의 조회 빈 금지: `MdmBusinessRuleMigrationTest.계약_전용_06_확정_검사와_정의_조회_빈이_없다` 가 `DefinitionLookup` 빈 0개를 요구한다. 운영 조회기는 빈이 아니고 `RuleSetRunner` 가 호출마다 만든다.
- 판정 시각 → 룰 버전: `LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST)` 로 바꾼 뒤 `RuleVersions.currentReleased(versions, now)` 를 쓴다. `RuleQueries.latestReleasedVers` 는 적용 기간을 보지 않으므로 판정용으로 쓰지 않는다.
- mdm Flyway 는 SQLite 한 방언이고 `flyway-migration-add` 스킬 스크립트가 mdm 을 지원하지 않는다. 번호는 손으로 `V14` 를 쓰고 스킬 문서의 작성 규칙(재생성 시 `SELECT *` 금지 등)만 따른다.
- mdm ADR 은 `docs/mdm/adr/` 에 둔다(번호 손 채번, 다음 0005). 검사: `python3 .claude/skills/adr-write/scripts/adr_tool.py lint docs/mdm/adr/0005-*.md`. README 표를 손으로 갱신한다.
- `docs/mdm/decisions.md` 는 append-only 이고 다음 번호는 D-105 다. 서식: `## D-NNN (ISO8601Z)` + `Phase / Decision needed / Decision made / Rationale / Reversible / Source` 불릿.
- OASIS BPMN 을 바꾸거나 더한 뒤에는 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` 가 ERROR 0 이어야 한다. 단 이 검사기는 MES 모듈(`MES_MODULES`)만 보고 mdm 은 보지 않는다. mdm BPMN 은 `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest`·`DmeOasisHttpTest` 로 검증한다.
- DB 검증은 SQLite 만 쓴다. 도커를 쓰지 않는다.
- 커밋은 이 작업이 만든 파일만 경로를 지정해 커밋한다(`git commit -- <path>...` 또는 `git add <path>` 후 커밋). 커밋 메시지·문서는 기존 한국어 관례(`type(scope): 한국어 요약`)를 따르고 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 를 붙인다.
- 테스트 명령(워크트리 루트 기준, JDK 21 필요):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=$JAVA_HOME/bin:$PATH`
  - 엔진: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` / 한 클래스: `../gradlew test --tests '*FlowParserTest' --console=plain`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)`
  - 화면: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` (워크트리에서 처음 돌리기 전 `pnpm --filter @dk-oasis/shared build` 가 한 번 필요하다. 안 하면 `@dk-oasis/shared/ui-provider` 해석 실패로 exit 1). 타입 검사: `pnpm --filter @dk-oasis/m-mdm lint`
- 기준선(2026-09-30, 8a0dd594): 엔진·mdm/lib 테스트 통과, `tests/dme/ruleSetEdit` 49건 통과.

## Review Focus

1. **목록 저장이 분기 흐름을 덮어쓰는 경우** — 분기(IF·PARALLEL)가 있는 세트에 `flow` 없이 `save` 가 오면(옛 탭·API) MDM024 + `FLOW_READONLY` 로 거부해야 한다. 흐름이 조용히 한 줄로 바뀌면 안 된다. 담당: Task 10.
2. **판정 시각이 적용 기간 경계에 있는 경우** — `evalTs` 가 KST 로 `APPLY_FROM` 과 같으면 그 버전, `APPLY_TO` 와 같으면 그 버전이 아니다(끝 배타). 담당: Task 11.
3. **같은 룰이 두 IF 갈래에 있는 경우** — `RULE_IDS` 는 중복 없이 한 번, 검사는 노드별로 중복 없이, `path.stepIndex` 는 실제 실행된 노드의 `steps` 자리를 가리킨다. 담당: Task 5·6·10.
4. **저장 안 한 구조 오류 흐름을 `traceSet` 에 넣는 경우** — 던지지 않고 `violations`(FLOW_INVALID)와 빈 `nodes` 를 담은 기록을 돌려준다. 담당: Task 7.
5. **병렬 형제가 같은 결과 변수를 쓰는 흐름을 저장 없이 실행하는 경우** — 정적 검사는 막지만 `traceSet` 은 검사 없이 돈다. 갈래를 `order` 순으로 합치고 뒤 갈래 값이 이긴다. 두 번 실행해도 같은 값이다. 담당: Task 5·7.
6. **빈 갈래** — IF 에서 합류로 바로 가는 갈래(그 외 빈 갈래 포함)를 파싱·검사·실행이 모두 받아들인다. 담당: Task 4·5·6.

---

## 편차 기록 (스펙과 다르게 정한 것 — Task 2 가 decisions.md 에 남긴다)

| # | 스펙 | 이 계획 | 이유 |
|---|---|---|---|
| D1 | §4.1 `RuleSetDefinition` 기존 생성자를 한 줄 흐름으로 위임 | 4인자 생성자 하나만 두고 생성 호출처 8곳(엔진 테스트 `RuleSetEvaluationTest` 3·`RuleViewTest` 2·`SampleRules` 2, mdm 테스트 `RuleDefinitionLookupStub` 1)을 모두 `flow=null` 로 고친다 | `ContractTypeShapeTest.계약_record_생성자는_Record_생성자만_부른다` 가 위임 생성자를 금지한다 |
| D2 | §3.3 선 필드 `"else": true`, 노드 필드 `"type"` | 선은 `"otherwise": true`, 노드 종류는 `"kind"` | `else` 는 Java 예약어라 record 컴포넌트 이름이 될 수 없고, 노드 record 컴포넌트는 `kind` 다. 스키마 속성 이름과 컴포넌트 이름이 같아야 한다(`EngineContractSchemaTest`). 저장된 흐름이 아직 없어 이관이 필요 없다 |
| D3 | §5 `SET_DUP_RESULT` 오류 | 같은 경로 중복 대입은 기존대로 경고(`DUP_RESULT` WARN / `SET_DUP_RESULT` WARNING). 병렬 형제가 같은 이름을 쓰면 오류(`PAR_SIBLING`) | 오류로 올리면 지금 저장된 한 줄 세트가 다음 저장에서 거부된다. 한 줄 흐름은 동작이 바뀌지 않아야 한다 |
| D4 | §5 코드 이름 `SET_ORDER`·`SET_PAR_SIBLING`… | 층마다 기존 명명을 지킨다. 세트 저장 검사(`RuleSetCheck`)는 접두어 없는 이름, 룰 확정 검사(`RuleSaveIssueCode`)는 `SET_` 접두어. 대응표는 아래 | 기존 두 층이 이미 다른 명명을 쓴다. `CYCLE` 은 스펙 표에 빠졌지만 유지한다 |
| D5 | §4.1 오류 코드 목록 | `Code.FLOW_INVALID` 를 더한다(단계 `SET_CHECK`) | 저장된 흐름이 구조 오류일 때(직접 DB 수정·저장 전 흐름 `traceSet`) 낼 코드가 스펙에 없다 |
| D6 | §4.1 `RuleSetResult` 는 `path` 만 추가 | `path` 와 `warnings`(`List<EngineWarning>`)를 더한다 | `BRANCH_COND_NULL` 경고를 실을 자리가 세트 결과에 없다 |
| D7 | §4.2 `RunTrace.error: EngineError` | `RunTrace.violations: List<Violation> \| null` | `EngineError` 는 Java 타입이 없는 스키마 전용 래퍼다. 스키마 대조가 컴포넌트 타입(array)을 본다 |
| D8 | §5 검사 결과에 노드 위치 없음 | `RuleSetCheck` 에 `nodeId`·`edgeId`(null 허용)를 더한다 | 같은 룰이 여러 갈래에 있을 수 있어 `ruleId` 로는 캔버스 위치를 못 찾는다. 2단계에서 더하면 코퍼스를 다시 연다 |
| D9 | §5 `FLOW_COND` "불린 식이 아니다" | 정적 검사는 파싱 실패·정의 안 된 변수만 본다. 불린이 아닌 결과는 실행 때 `BRANCH_EVAL_ERROR` | 저장소에 식의 정적 타입 추론이 없다(`ExprTypeByCaseCheck` 는 사례 실행 기반) |
| D10 | §5 분석기 입출력 표·의존 룰 | 흐름 세트의 `io`·`deps` 는 흐름을 펼친 룰 목록(깊이 우선, 중복 제거)으로 계산한다. 흐름 기준 재정의는 2단계에서 필요해지면 한다 | 1단계 화면은 분기 세트를 읽기 전용으로만 보여 준다(YAGNI) |
| D12 | (기존 동작) 목록에 같은 룰 ID 가 두 번 있으면 존재 검사를 나올 때마다 보고 | 존재·상태 검사는 룰 ID 마다 한 번만 보고한다(목록 입력도 같다) | 같은 룰을 여러 IF 갈래에 둘 수 있어 흐름에서는 중복 보고가 소음이다. 기존 코퍼스 18건에는 중복 ID 사례가 없다 |
| D11 | §6.2 OASIS serviceTask 로 부름 | `RuleSetRunner` 는 DTO 메서드 `execute(RuleSetRunRequest)` 도 갖는다. 1단계는 **테스트 자원 BPMN**(`src/test/resources/services/...`)으로 OASIS 경로를 검증하고 운영 BPMN 은 더하지 않는다 | OASIS 로더가 `classpath*:` 로 테스트 자원도 읽는다. 운영 action 추가(`simulate`)는 2단계 범위다 |

**검사 코드 대응표 (D4)**

| 뜻 | 세트 저장 `RuleSetCheck.code`(심각도) | 룰 확정 `RuleSaveIssueCode`(수준) | 엔진 `FlowIssue.code` |
|---|---|---|---|
| 구조 오류 | `FLOW_STRUCTURE`(REJECT) | — | `FLOW_STRUCTURE` |
| IF "그 외"·조건식 누락 | `FLOW_IF_ELSE`(REJECT) | — | `FLOW_IF_ELSE` |
| 조건식 오류 | `FLOW_COND`(REJECT) | — | — |
| 뒤 룰 결과 읽기 | `ORDER`(REJECT) | `SET_ORDER`(ERROR) | — |
| 서로 읽기 | `CYCLE`(REJECT) | `SET_CYCLE`(ERROR) | — |
| IF 형제 갈래 결과 읽기 | `IF_SIBLING`(REJECT) | `SET_IF_SIBLING`(ERROR) | — |
| 병렬 형제 읽기·같은 이름 쓰기 | `PAR_SIBLING`(REJECT) | `SET_PAR_SIBLING`(ERROR) | — |
| 같은 경로 중복 대입 | `DUP_RESULT`(WARN) | `SET_DUP_RESULT`(WARNING) | — |
| 일부 갈래에서만 만든 값 읽기 | `FLOW_PARTIAL`(WARN) | — | — |
| 분기 세트를 목록으로 저장 | `FLOW_READONLY`(REJECT) | — | — |

---

## 공유 계약 (모든 태스크가 이 이름·서명·문구를 그대로 쓴다)

### C1. 엔진 spi 흐름 타입 (`kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup` 안의 중첩 타입)

```java
/** 세트 스냅샷. flow 가 null 이면 ruleIds 순서의 한 줄 흐름이다(spec §3.3). */
record RuleSetDefinition(String setId, List<String> ruleIds, SetStatus status, @Nullable FlowDefinition flow) {}

/** 흐름 정의(FLOW_JSON 의 nodes·edges, view 는 싣지 않는다). version 은 형식 버전(지금 1). */
record FlowDefinition(int version, List<FlowNode> nodes, List<FlowEdge> edges) {}

/** ruleId 는 RULE 만, splitId 는 MERGE 만 쓴다. label 은 화면 표시용. */
record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label) {}

/** order·cond·otherwise 는 IF·PARALLEL 에서 나가는 선만 쓴다. otherwise=true 는 IF 의 "그 외" 선이다. */
record FlowEdge(String id, String from, String to, @Nullable Integer order, @Nullable String cond, boolean otherwise,
        @Nullable String label) {}

enum NodeKind { START, END, RULE, IF, PARALLEL, MERGE }
```

스키마 `$defs`: `RuleSetFlow`(= FlowDefinition), `FlowNode`, `FlowEdge`, `FlowNodeKind`(enum). `EngineContractSchemaTest` 대응표에 `R12 FlowDefinition↔RuleSetFlow`, `R13 FlowNode↔FlowNode`, `R14 FlowEdge↔FlowEdge`, `E9 NodeKind↔FlowNodeKind` 를 더한다. `ContractTypeShapeTest.CONTRACT_TYPES` 에 `spi.DefinitionLookup$FlowDefinition`, `$FlowNode`, `$FlowEdge`, `$NodeKind` 를 더한다.

FLOW_JSON 저장 형식은 스펙 §3.3 예시에서 선의 `"else": true` 를 `"otherwise": true` 로, 노드의 `"type"` 을 `"kind"` 로 바꾼 것이다(D2). 노드 `id`·`kind`, 선 `id`·`from`·`to` 가 빠지면 코덱이 형식 오류로 거부한다(엔진 record 가 null 을 받지 않는다). 그 밖의 빠진 칸만 null(otherwise 는 false)로 채운다. TS 러너도 같다. `view` 는 그대로 저장하되 엔진 타입에는 싣지 않는다.

### C2. 엔진 `flow` 패키지 (`kr.dongkuk.maru.mdm.engine.flow`, 새 공개 패키지, spi 만 본다)

```java
public final class FlowParser {
    /** 구조 검사 후 블록 트리를 만든다. 1단계 오류가 있으면 모두 모아 tree=null, 2단계 오류는 첫 오류에서 멈춘다. */
    public static FlowParse parse(FlowDefinition flow);
    /** ruleIds 순서의 한 줄 흐름. 노드 ID: "start", "r1".."rN", "end". 선 ID: "e1".."e(N+1)". */
    public static FlowDefinition linear(List<String> ruleIds);
}
public record FlowParse(@Nullable FlowTree tree, List<FlowIssue> issues) {}
/** code 는 "FLOW_STRUCTURE" 또는 "FLOW_IF_ELSE". */
public record FlowIssue(String code, @Nullable String nodeId, @Nullable String edgeId, String message) {}

public sealed interface Block permits Seq, RuleStep, Split {}
public record Seq(List<Block> items) implements Block {}
public record RuleStep(String nodeId, String ruleId) implements Block {}
/** kind 는 IF 또는 PARALLEL. branches 는 실행 순서(IF: order 오름차순 뒤 otherwise, PARALLEL: order 오름차순). */
public record Split(String nodeId, NodeKind kind, String mergeId, List<Branch> branches) implements Block {}
public record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body) {}

public final class FlowTree {
    public Seq root();
    public String startId();
    public String endId();
    /** 모든 RULE 노드, 깊이 우선(갈래 실행 순서) 순서. */
    public List<RuleStep> ruleSteps();
    /** ruleSteps 의 ruleId 를 처음 나온 순서로 중복 없이 = RULE_IDS 로 저장할 목록. */
    public List<String> ruleIds();
    /** 분기(Split)가 하나라도 있으면 true. */
    public boolean branched();
    /** 두 노드(RULE·IF·PARALLEL)의 관계. */
    public Relation relation(String nodeA, String nodeB);
    public enum Relation { SAME, BEFORE, AFTER, EXCLUSIVE, PARALLEL }
}
```

- `relation(a, b)`: 노드마다 루트에서 그 노드까지 지나는 `(splitNodeId, branchIndex)` 목록과 깊이 우선 순번을 기록해 둔다. 두 목록을 앞에서부터 비교해 같은 split 에서 갈래 번호가 처음 달라지면 그 split 이 IF 면 `EXCLUSIVE`, PARALLEL 이면 `PARALLEL` 이다. 달라지는 곳이 없으면(한쪽이 다른 쪽의 앞부분) 같은 경로이고 순번으로 `BEFORE`(a 가 먼저)·`AFTER` 를 낸다. a==b 면 `SAME`.
- 패키지 이름 규칙: 엔진은 `kr.dongkuk.maru.mdm.engine.*`(`build.gradle` group, `TRD.md:18`), MDM 앱은 `com.dongkuk.dmes.mdm.*` 이다. Task 4 는 `docs/mdm/TRD.md:18` 의 엔진 패키지 목록 `{expr,rule,domain,code,spi}` 에 `flow` 를 더한다.
- 패키지 의존: `flow` 는 `spi` 만 본다. `rule` 은 `expr`·`spi`·`flow` 를 본다. `spi`·`code`·`expr`·`domain` 은 `flow` 를 보지 않는다. `EnginePackageDependencyTest` 에 규칙을 더한다.

### C3. 구조 검사 알고리즘과 문구 (`FlowParser` · TS `flow-model.ts` 공통)

**1단계 — 모두 모은다. 아래 순서로 훑고, 하나라도 있으면 트리를 만들지 않는다.**

| # | 조건 | code | nodeId / edgeId | message |
|---|---|---|---|---|
| a | 노드 배열 순서로 훑어 이미 나온 ID | FLOW_STRUCTURE | 그 ID / null | `노드 ID {id}가 겹친다` |
| b1 | START 개수 ≠ 1 | FLOW_STRUCTURE | null / null | `시작 노드가 {n}개다. 정확히 1개여야 한다` |
| b2 | END 개수 ≠ 1 | FLOW_STRUCTURE | null / null | `끝 노드가 {n}개다. 정확히 1개여야 한다` |
| c | 선 배열 순서로, from 이 없는 노드(먼저)·to 가 없는 노드 | FLOW_STRUCTURE | 없는 ID / 선 ID | `선 {edgeId}가 없는 노드 {id}를 가리킨다` |
| d1 | 노드 배열 순서로, 들어오는 선 개수가 종류 규칙과 다름 | FLOW_STRUCTURE | 노드 ID / null | `{id}의 들어오는 선이 {n}개다. {규칙}` |
| d2 | 같은 노드의 나가는 선 개수가 다름(d1 다음에 검사) | FLOW_STRUCTURE | 노드 ID / null | `{id}의 나가는 선이 {n}개다. {규칙}` |
| e | RULE 인데 ruleId 가 null·공백 | FLOW_STRUCTURE | 노드 ID / null | `룰 노드 {id}에 룰 ID가 없다` |
| f1 | MERGE 의 splitId 가 IF·PARALLEL 노드가 아님(없음 포함) | FLOW_STRUCTURE | 노드 ID / null | `합류 {id}의 짝 분기 {splitId}가 없다` (splitId 가 null 이면 `-`) |
| f2 | IF·PARALLEL 마다, splitId 로 자기를 가리키는 MERGE 개수 ≠ 1 | FLOW_STRUCTURE | 분기 ID / null | `분기 {id}를 닫는 합류가 {n}개다. 정확히 1개여야 한다` |
| g1 | IF 의 otherwise 선 개수 ≠ 1 | FLOW_IF_ELSE | IF ID / null | `IF {id}에 "그 외" 갈래가 {n}개다. 정확히 1개여야 한다` |
| g2 | IF 의 otherwise 가 아닌 선(선 배열 순서)의 cond 가 null·공백 | FLOW_IF_ELSE | IF ID / 선 ID | `IF {id}의 갈래 {edgeId}에 조건식이 없다` |
| g3 | PARALLEL 의 나가는 선(선 배열 순서)에 cond(공백 아님) 또는 otherwise=true | FLOW_STRUCTURE | 분기 ID / 선 ID | `병렬 분기 {id}의 갈래 {edgeId}에는 조건을 둘 수 없다` |
| g4 | IF(otherwise 제외)·PARALLEL 의 나가는 선(선 배열 순서) order 가 null | FLOW_STRUCTURE | 분기 ID / 선 ID | `분기 {id}의 갈래 {edgeId}에 순서가 없다` |
| g5 | 같은 분기 안에서 order 값이 이미 나옴(선 배열 순서로 두 번째부터) | FLOW_STRUCTURE | 분기 ID / 선 ID | `분기 {id}의 갈래 순서 {order}가 겹친다` |

- d1·d2 의 종류 규칙: START 들어옴 0 `없어야 한다`, 나감 1 `1개여야 한다` / END 들어옴 1, 나감 0 / RULE 1·1 / IF·PARALLEL 들어옴 1, 나감 2 이상 `2개 이상이어야 한다` / MERGE 들어옴 2 이상, 나감 1.
- 노드 ID 가 겹치면 b1·b2 개수 세기, c 의 노드 찾기, d~g 노드 순회, 존재 검사 목록은 모두 **그 ID 의 첫 노드만** 본다.
- g5 의 대상은 g4 와 같다: IF 는 otherwise 가 아닌 선, PARALLEL 은 모든 선. order 가 null 인 선은 g5 에서 뺀다.
- 흐름 스키마의 모든 속성은 `required` 이고 null 허용 칸은 `type: [..., "null"]` 이다(생성 TS 는 `ruleId: string | null` 모양). 코퍼스·저장 JSON 에서 빠진 선택 칸은 읽을 때 null(otherwise 는 false)로 채운다(C1 의 필수 칸 규칙 참고).
- 공백 판정(e·g2·g3): Java `String.isBlank()` 의미다. 즉 모든 문자가 `Character.isWhitespace` 인 문자열(빈 문자열 포함)이다. TS 는 `trim()` 을 쓰지 않고 이 의미를 재현한다: `[\t\n\u000B\f\r\u001C-\u001F]` 이거나, `\p{Zs}|\p{Zl}|\p{Zp}` 이면서 `\u00A0`·`\u2007`·`\u202F` 가 아닌 문자만 공백이다. 코퍼스에 NBSP(`\u00A0`) 조건식 사례를 하나 둔다(Java·TS 모두 '공백 아님').
- c 에서 걸린 선은 d 의 개수 계산뿐 아니라 g1~g5 의 대상에서도 뺀다.
- 노드 순회 한 번에 a→(d1, d2, e, f1, f2, g1..g5)를 노드 단위로 섞지 않는다. 순서는 **a 전체 → b1 → b2 → c 전체 → 노드별 [d1, d2, e, f1] 전체 → 분기 노드별 [f2, g1, g2.., g3.., g4.., g5..] 전체**다. c 에서 걸린 선은 d 의 개수 계산에서 뺀다.

**2단계 — 트리 만들기. 첫 오류에서 멈춘다(모두 FLOW_STRUCTURE).**

`seq(fromNodeId, stopNodeId)` 로 만든다. 루트는 `seq(START 의 나가는 선 to, END id)` 다.

```
seq(cur, stop):
  items = []
  while cur != stop:
    node = nodes[cur]
    if visited has cur:  → 오류(nodeId=cur): "{cur}를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"
    if node.kind in (START, END, MERGE):  → 오류(nodeId=cur): "갈래가 {stop}에서 닫히지 않고 {cur}로 나간다"
    visited.add(cur)
    if RULE:  items += RuleStep(cur, ruleId); cur = 나가는 선 to
    if IF/PARALLEL:
       merge = splitId==cur 인 MERGE
       branches = 나가는 선을 실행 순서로 정렬(IF: otherwise 아닌 선 order 오름차순, 그 뒤 otherwise / PARALLEL: order 오름차순)
       각 선 e 에 대해 Branch(e.id, e.cond, e.otherwise, e.label, seq(e.to, merge.id))
       visited.add(merge.id); items += Split(cur, kind, merge.id, branches); cur = merge 의 나가는 선 to
  return Seq(items)
```

- 트리를 만든 뒤 노드 배열 순서로 방문하지 않은 첫 노드(START·END 제외)가 있으면 오류(nodeId=그 ID): `{id}에 도달할 수 없다`.
- 갈래가 분기에서 합류로 바로 가면 `Seq([])`(빈 갈래)이다. 정상이다.

### C4. 흐름 기준 세트 검사 (`RuleSetAnalyzer` · `set-model.ts` 공통)

입력: `flow`(FlowDefinition), `rules`(룰 ID → RuleIo, 지금과 같음), `condIo`(선 ID → CondIo). `CondIo(boolean ok, String message, List<IoName> vars)` — 서버가 조건식을 미리 풀어 준다(ok=false 면 message 는 파싱 오류 문구, vars 는 비어 있음). 조건식 변수의 source 는 `DICT`(컬럼 사전에 있음) 또는 `NONE` 이다.

`RuleSetCheck` 는 `(code, severity, ruleId, otherRuleId, varName, message, nodeId, edgeId)` 다(D8). 목록 입력(`checks(ids, rules)`)은 `FlowParser.linear(ids)` 로 같은 알고리즘을 돌린 뒤 **nodeId·edgeId 를 null 로 바꿔** 돌려준다(기존 코퍼스 사례 불변).

검사 순서:
1. **존재·상태**: `ids` = 트리가 있으면 `tree.ruleIds()`, 없으면 RULE 노드의 ruleId 를 노드 배열 순서로 중복 없이. 각 ID 에 기존 `RULE_NOT_FOUND`·`RULE_DEPRECATED`·`NO_RELEASED` 를 기존 문구로 낸다. nodeId = 그 ruleId 를 가진 첫 RULE 노드(배열 순서).
2. **EMPTY**: RULE 노드가 없으면 기존 `EMPTY`.
3. **구조**: `FlowParser.parse` 의 issues 를 순서대로 `RuleSetCheck(issue.code, REJECT, null, null, null, issue.message, issue.nodeId, issue.edgeId)` 로 낸다. 하나라도 있으면 여기서 끝낸다.
4. **경로 검사**: 트리를 깊이 우선으로 돈다. 상태 `S = { defined: Set, maybe: Set, prodBy: Map<이름, RuleStep> }`, 처음은 모두 비어 있다. `deps` 는 `deps(tree.ruleIds(), rules)` 를 한 번 계산해 둔다.
   - **RULE 노드 n(ruleId id)**: 조건 c 마다 (룰의 conds 순서)
     1. `c.source == DICT` 이거나 `S.defined` 에 있으면 넘어간다.
     2. `S.maybe` 에 있으면 → `FLOW_PARTIAL` WARN, varName=c, 문구 `{id}가 읽는 {c}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`. 다음 조건으로.
     3. `later` = `relation(n, m) == BEFORE`(n 이 먼저)인 RULE 노드 m 가운데 `m.ruleId != id` 이고 c 를 만드는 것의 ruleId, 깊이 우선 순서·중복 없이. 비어 있지 않으면 기존 CYCLE/ORDER 판정·문구 그대로(`reaches(j, id, deps)` 또는 결과·조건 겹침이면 CYCLE, 아니면 ORDER, otherRuleId=later[0] 또는 cyc). 다음 조건으로.
     4. `excl` = `relation == EXCLUSIVE` 이고 c 를 만드는 RULE 노드의 ruleId(깊이 우선, 중복 없이). 비어 있지 않으면 → `IF_SIBLING` REJECT, otherRuleId=excl[0], 문구 `{id}가 읽는 {c}는 같은 IF 의 다른 갈래({excl 을 ", " 로 이음})에서만 만들어진다. 이 갈래를 타면 값이 없다`. 다음 조건으로.
     5. `par` = `relation == PARALLEL` 이고 c 를 만드는 RULE 노드의 ruleId. 비어 있지 않으면 → `PAR_SIBLING` REJECT, otherRuleId=par[0], 문구 `{id}가 병렬 형제 갈래의 {par[0]}가 만드는 {c}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다`. 다음 조건으로.
     6. `c.source != PROG` 이면 기존 `UNKNOWN_INPUT` 문구.
     결과 x 마다 (룰의 results 순서)
     1. `relation(n, m) == PARALLEL` 이고 x 를 만드는 RULE 노드 m 이 깊이 우선 순서로 n 보다 앞에 있으면 → `PAR_SIBLING` REJECT, otherRuleId=첫 m 의 ruleId, 문구 `병렬 갈래의 {m.ruleId}와 {id}가 같은 결과 변수 {x}에 대입한다`.
     2. 그렇지 않고 `S.prodBy` 에 x 가 있으면 → 기존 `DUP_RESULT` WARN(`{prev}와 {id}가 같은 결과 변수 {x}에 대입한다`, otherRuleId=prev).
     3. `S.prodBy[x] = n`, `S.defined.add(x)`.
     RULE 노드 검사의 nodeId 는 n, edgeId 는 null.
   - **IF 노드**: 먼저 otherwise 가 아닌 갈래를 실행 순서로 돌며 조건식 검사(아래 C4.1). 그 뒤 갈래마다 `S_b = copy(S)` 로 본문을 돈다. 끝나면
     `defined = S.defined ∪ ⋂_b (S_b.defined)`, `maybe = S.maybe ∪ ⋃_b S_b.maybe ∪ (⋃_b S_b.defined − defined)`, `prodBy` 는 아래 합치기 규칙.
   - **PARALLEL 노드**: 갈래마다 `S_b = copy(S)` 로 본문을 돈다(형제 결과는 보이지 않는다). 끝나면 `defined = ⋃_b S_b.defined ∪ S.defined`, `maybe = S.maybe ∪ ⋃_b S_b.maybe`, `prodBy` 는 합치기 규칙.
   - **prodBy 합치기**: `over = 빈 순서 맵`; 갈래를 실행 순서로 돌며 `S_b.prodBy` 의 (k, v) 가운데 `S.prodBy[k] != v` 인 것을 `over.putIfAbsent(k, v)`; 결과 = `S.prodBy` 에 `over` 를 덮어쓴 것.

**C4.1 조건식 검사** (IF 의 otherwise 가 아닌 갈래 e, nodeId=IF ID, edgeId=e.id, ruleId=null)
- `condIo[e.id]` 가 없거나 ok=false → `FLOW_COND` REJECT, varName=null, 문구 `{e.id} 갈래 조건식을 읽을 수 없다: {message}` (condIo 가 없거나 message 가 null 이면 message 자리에 `조건식 정보 없음`).
- C4 4 의 `excl`·`par` 목록은 `later` 와 달리 같은 ruleId 를 빼지 않는다(같은 룰이 다른 갈래에 있으면 그 룰도 상대가 된다).
- ok 면 vars 마다: `DICT` 이거나 `S.defined` 에 있으면 통과, `S.maybe` 에 있으면 `FLOW_PARTIAL` WARN `{e.id} 갈래 조건식이 읽는 {x}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, 그 밖은 `FLOW_COND` REJECT `{e.id} 갈래 조건식이 읽는 {x}는 이 지점에서 정의되지 않았다`.

**C4.2 목록 저장 거부 문구**: `FLOW_READONLY` REJECT, 모든 ID null, 문구 `분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다`.

### C5. 엔진 실행 계약 (`kr.dongkuk.maru.mdm.engine.rule`)

```java
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings) {
    /** 방문한 노드. chosenEdgeId 는 IF 만, stepIndex 는 RULE 만(그 룰 결과의 steps 자리). */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex) {}
}

public interface RuleEngine {
    // 기존 메서드 그대로 + 아래 추상 메서드 하나(구현체는 MdmRuleEngine 하나뿐)
    RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs);
}

public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations) {

    public record NodeTrace(int seq, String nodeId, NodeKind kind, NodeStatus status,
            @Nullable String ruleId, @Nullable Integer ver, @Nullable Map<String, Object> reads, @Nullable RuleResult result,
            @Nullable List<BranchTrace> branches, @Nullable String chosenEdgeId,
            @Nullable List<String> order, @Nullable String splitId, @Nullable List<String> merged,
            @Nullable List<Violation> violations) {}

    public record BranchTrace(String edgeId, BranchOutcome outcome, @Nullable String message) {}

    public enum NodeStatus { OK, ERROR }

    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
```

- 스키마 예외 두 가지: `NodeTrace.result` 는 `$ref` 라 null 을 type 에 섞을 수 없어 required 에서 뺀다(생성 TS `result?: RuleResult`). `RuleSetFlow.version` 은 `const` 대신 `integer` 다(스키마 대조가 숫자 const 를 int 와 짝짓지 못한다).
- IF 조건식이 합류 뒤 일부 갈래에서만 만든 변수를 읽으면 사전 검사에서 빼고 지연 검사도 하지 않는다. 실제로 없으면 평가 때 `BRANCH_EVAL_ERROR` 다.
- 새 `Stage.BRANCH_SELECT`, 새 `Code.BRANCH_EVAL_ERROR`·`Code.FLOW_INVALID`(D5), 새 `EngineWarning.Code.BRANCH_COND_NULL`.
- 스키마 `$defs`: `PathStep`, `RunTrace`, `NodeTrace`, `BranchTrace`, `NodeStatus`, `BranchOutcome`, 그리고 `RuleSetResult` 에 `path`·`warnings`. 대응표 `R15 PathStep`, `R16 RunTrace`, `R17 NodeTrace`, `R18 BranchTrace`, `E10 NodeStatus`, `E11 BranchOutcome`. `CONTRACT_TYPES` 에 `rule.RuleSetResult$PathStep`, `rule.RunTrace`, `rule.RunTrace$NodeTrace`, `rule.RunTrace$BranchTrace`, `rule.RunTrace$NodeStatus`, `rule.RunTrace$BranchOutcome` 를 더한다.

**실행 의미(스펙 §4 + 아래 확정 사항)**
- `evaluateSet`: 세트 조회 → `flow == null ? FlowParser.linear(ruleIds) : flow` → `FlowParser.parse`. issues 가 있으면 `Violation(SET_CHECK, FLOW_INVALID, null, null, issue.nodeId, "세트 " + setId + " 의 흐름이 올바르지 않다: " + issue.message)` 를 issue 마다 모아 던진다.
- 룰 정의는 `tree.ruleIds()` 순서로 한 번씩 조회한다(없으면 기존 `RULE_NOT_FOUND`, 같은 룰은 한 번만 보고).
- **입력 키 검사**(`missingInputKeys` 대체): `requiredKeys(seq, available)` — seq 의 "반드시 실행되는 부분"을 돈다. RULE 은 기존 needed(계약 always + DERIVE 행 required·optional) 가운데 `available`·`producedSure` 에 없고 `producedMaybe` 에도 없는 이름을 `MISSING_KEY` 로(기존 문구), `producedMaybe` 에 있는 이름은 그 룰의 **지연 검사 목록**에 넣는다. IF 는 조건식 변수(`MdmEvaluator.usedVariables(cond)`, `ReservedNames` 예약 이름 제외, 파싱 실패면 빈 집합)를 같은 규칙으로 보고 갈래 안으로는 들어가지 않는다. 갈래들의 결과 이름은 교집합을 `producedSure` 에, 나머지 합집합을 `producedMaybe` 에 더한다. PARALLEL 은 갈래마다 같은 `available`·`producedSure` 사본으로 안으로 들어가 검사하고, 끝나면 갈래 결과의 합집합을 `producedSure` 에 더한다.
  - 세트 시작: `requiredKeys(root, record.keySet())`. 위반이 있으면 존재 검사 위반과 모아 한 번에 던진다(지금과 같음).
  - IF 갈래에 들어갈 때: `requiredKeys(branch.body, ctx.keySet())` 위반이 있으면 던진다.
  - 지연 검사 목록이 있는 룰을 실행하기 직전: ctx 에 없는 이름마다 `MISSING_KEY` 로 던진다.
- **IF**: otherwise 가 아닌 갈래를 순서대로 `RuleEvaluator` 의 조건 평가 경로(값 맵 구성·`runner.run(text, values, evalTs)` 동일)로 평가한다. 처음 true 인 갈래를 고른다. NULL 이면 거짓으로 보고 `BRANCH_COND_NULL` 경고(`IF {nodeId} 갈래 {edgeId} 조건식 결과가 NULL 이라 거짓으로 봤다`). 불린이 아니거나 평가 실패면 `Violation(BRANCH_SELECT, BRANCH_EVAL_ERROR, null, null, edgeId, "IF " + nodeId + " 갈래 " + edgeId + " 조건식을 평가하지 못했다: " + 원인)` 을 던진다. true 가 없으면 otherwise 갈래.
- **PARALLEL**: 갈래를 순서대로, 분기 직전 ctx 의 사본에서 실행한다. 끝나면 갈래 순서대로 각 갈래가 만든 결과를 ctx·finalValues 에 덮어쓴다(같은 이름이면 뒤 갈래가 이긴다).
- **path**: START·RULE·IF·PARALLEL·MERGE·END 를 방문 순서대로 모두 넣는다. 한 줄 흐름의 노드 ID 는 `FlowParser.linear` 의 ID 다.
- **traceSet**: 같은 실행을 하되 던지지 않는다. 구조 오류·존재·입력 키 위반은 `nodes=[]`, `violations=모은 위반`. 실행 중 위반은 그 노드를 `status=ERROR, violations=[...]` 로 남기고 멈춘다(`RunTrace.violations` 에도 같은 목록). `reads` 는 그 룰의 needed 이름 가운데 실행 직전 ctx 에 있는 것의 값(이름 순서 유지). `input` 은 받은 레코드 사본, `finalValues` 는 멈춘 시점까지의 결과. `evaluateSet` 은 기록을 모으지 않는다.

### C6. mdm/lib 이름

- `com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson` — Jackson 코덱: `FlowDefinition parse(String json)`, `FlowDefinition fromMap(Map<String,Object> flow)`, `Map<String,Object> toMap(String json)`, `String write(Map<String,Object> flow)`(view 포함 그대로), `static boolean branched(FlowDefinition)`, `static List<String> ruleIds(FlowDefinition)`(C4 1번 목록).
- V14 는 `ADD COLUMN` 이 아니라 테이블 재생성이다(마이그레이션 테스트가 칼럼 순서를 고정). 제약 이름 `CK_TB_MDM_RULE_SET_FLOW_JSON`.
- `RuleSetRunRequest` 는 레코드를 `recordJson` 문자열로 받는다(OASIS params 의 중첩 객체 바인딩 미확인). `RuleSetSaveRequest.flow`(Map) 의 HTTP 바인딩은 2단계 착수 때 확인한다.
- `com.dongkuk.dmes.mdm.common.rule.CondIo` — `record CondIo(boolean ok, String message, List<IoName> vars)`.
- `RuleSetAnalyzer` 새 메서드: `List<RuleSetCheck> checks(FlowDefinition flow, Map<String,RuleIo> rules, Map<String,CondIo> condIo)`, `SetIo io(FlowDefinition, Map)`, `Map<String,List<String>> deps(FlowDefinition, Map)`(D10: 펼친 목록). 기존 `(List<String> ids, …)` 서명은 그대로 둔다.
- `RuleIoReader.condIo(FlowDefinition flow)` → `Map<String, CondIo>`(IF 의 otherwise 아닌 선만).
- `com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup implements DefinitionLookup` — **빈 아님**.
- `com.dongkuk.dmes.mdm.common.rule.RuleSetRunner` — `@Service("ruleSetRunner")`: `RuleSetResult run(String setId, Map<String,Object> record, @Nullable Instant evalTs)`, `RunTrace trace(Map<String,Object> flow, Map<String,Object> record, @Nullable Instant evalTs)`, OASIS DTO 메서드 `RuleSetRunResult execute(RuleSetRunRequest request)`.
- 저장 요청 `RuleSetSaveRequest` 에 `Map<String,Object> flow`(null 허용), 조회 응답 `RuleSetViewResult.Header` 에 `Map<String,Object> flow`, `boolean branched`.

### C7. 화면 이름 (`src/frontend/m-mdm/pages/dme/ruleSetEdit/`)

- `flow-model.ts`: `parseFlow(flow: RuleSetFlow): FlowParse`, `linearFlow(ids: readonly string[]): RuleSetFlow`, `FlowTree` 클래스(`ruleSteps()`, `ruleIds()`, `branched()`, `relation(a, b)`), 타입 `FlowIssue`, `Block`(`Seq` / `RuleStep` / `Split`), `Branch`. 흐름 타입은 `src/contract/engine-contract.generated.ts` 의 `RuleSetFlow`·`FlowNode`·`FlowEdge`·`FlowNodeKind` 를 쓴다.
- `set-model.ts`: `flowChecks(flow, rules, condIo): RuleSetCheck[]`, `flowIo(flow, rules)`, `flowDeps(flow, rules)`. 기존 `setChecks(ids, rules)` 는 `linearFlow` 로 돌린 뒤 nodeId·edgeId 를 null 로 바꾼다.
- `types.ts`: `RuleSetCheck` 에 `nodeId: string | null; edgeId: string | null`, `RuleSetCheckCode` 에 `FLOW_STRUCTURE | FLOW_IF_ELSE | FLOW_COND | IF_SIBLING | PAR_SIBLING | FLOW_PARTIAL | FLOW_READONLY`, `CondIo` 타입.

---

## 실행 순서와 모델

같은 파일을 두 태스크가 동시에 고치지 않도록 묶었다. 엔진 스키마·생성 TS 를 고치는 태스크(1 → 5 → 7)는 반드시 차례로 한다.

| 물결 | 태스크 (모델) | 선행 |
|---|---|---|
| 1 | Task 1 엔진 흐름 계약 타입 (opus) · Task 2 ADR·결정 기록 (sonnet) · Task 3 FLOW_JSON 컬럼 (sonnet) | — |
| 2 | Task 4 엔진 flow 패키지 (opus) | 1 |
| 3 | Task 5 엔진 흐름 실행·path (opus) · Task 6 흐름 기준 분석기와 코퍼스(Java) (opus) | 4 |
| 4 | Task 7 traceSet (opus) · Task 8 화면 flow-model·set-model (sonnet) · Task 9 룰 확정 세트 검사 (sonnet) · Task 10 저장·조회 서비스 (sonnet) | 5 / 6 / 3·6 / 3·6 |
| 5 | Task 11 정의 조회기·RuleSetRunner·OASIS 경로 (opus) · Task 12 화면 읽기 전용 표시 (sonnet) | 7·10 / 8·10 |
| 6 | Task 13 설계 문서·전체 검증 (sonnet) | 전부 |

---

## 태스크

### Task 1: 엔진 흐름 계약 타입

**모델:** opus

흐름 정의 타입(C1)을 엔진 `spi` 에 더하고 `RuleSetDefinition` 에 `flow` 를 붙인다. 엔진 실행은 아직 `flow` 를 읽지 않는다(Task 5). 계약 네 벌(문서·스키마·Java·생성 TS)을 이 태스크 몫만큼 함께 바꾼다.

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:145-148`
- Modify: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(`$defs` 에 4개 추가)
- Modify(D1 생성자 호출처 — `grep -rn 'new RuleSetDefinition' src/backend` 전수 결과 8곳):
  - `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetEvaluationTest.java:32-34`(3곳)
  - `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleViewTest.java:53-54`(2곳)
  - `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/SampleRules.java:192,197`(2곳)
  - `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java:88`(1곳)
  - 참고: `SingleRuleDefinitionLookup`·`MdmEngineConfig`·`DomainTestCaseRunner`·`InMemoryLookups`·`InMemoryDefinitionLookup` 은 `RuleSetDefinition` 을 **만들지 않고** 타입으로만 쓰므로(`Optional.empty()` 반환·Map 값) 고칠 곳이 없다. 컴파일만 확인한다.
- Test(Modify): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java`(ENUMS·RECORDS)
- Test(Modify): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java:40-49`(CONTRACT_TYPES)
- Test(Modify): `src/frontend/m-mdm/tests/engine-contract.generated.test.ts:14-54`(EXPECTED_EXPORTS)
- Regenerate: `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`
- Modify: `docs/mdm/engine-contract.md` §3(spi) 
- Create: `docs/mdm/engine-contract/README.md`("정본 아님" 표시)

**Interfaces:**
- Consumes: 없음
- Produces(C1 그대로, `DefinitionLookup` 중첩 타입):
  - `record RuleSetDefinition(String setId, List<String> ruleIds, SetStatus status, @Nullable FlowDefinition flow)`
  - `record FlowDefinition(int version, List<FlowNode> nodes, List<FlowEdge> edges)`
  - `record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label)`
  - `record FlowEdge(String id, String from, String to, @Nullable Integer order, @Nullable String cond, boolean otherwise, @Nullable String label)`
  - `enum NodeKind { START, END, RULE, IF, PARALLEL, MERGE }`
  - 스키마 `$defs`: `RuleSetFlow`, `FlowNode`, `FlowEdge`, `FlowNodeKind` / 생성 TS export 같은 이름

- [ ] **Step 1: 계약 대응 테스트를 먼저 고친다**

`EngineContractSchemaTest.java` 의 `ENUMS` 끝(E8 다음)에 한 줄, `RECORDS` 끝(R11 다음)에 세 줄을 더한다.

```java
            new EnumPair("E8", "ExprSlot", () -> enumNames(FunctionSets.Slot.class), () -> enumOf("ExprSlot")),
            // 흐름 노드 종류(plan C1) — spi 타입이라 expr·rule 전수 검사 밖이지만 스키마 짝은 맞춘다.
            new EnumPair("E9", "FlowNodeKind", () -> enumNames(DefinitionLookup.NodeKind.class), () -> enumOf("FlowNodeKind")));
```

```java
            new RecordPair("R11", RuleSetResult.class, "RuleSetResult", Set.of(), Set.of()),
            // 흐름 정의(plan C1). FLOW_JSON 의 nodes·edges 모양이고 view 는 싣지 않는다.
            new RecordPair("R12", DefinitionLookup.FlowDefinition.class, "RuleSetFlow", Set.of(), Set.of()),
            new RecordPair("R13", DefinitionLookup.FlowNode.class, "FlowNode", Set.of(), Set.of()),
            new RecordPair("R14", DefinitionLookup.FlowEdge.class, "FlowEdge", Set.of(), Set.of()));
```

(기존 E8·R11 줄 끝의 `);` 는 `,` 로 바꾼다.)

`ContractTypeShapeTest.java` 의 `CONTRACT_TYPES` spi 묶음에서 `"spi.DefinitionLookup$RuleSetDefinition", "spi.DefinitionLookup$SetStatus",` 줄 바로 다음에 넣는다.

```java
                    "spi.DefinitionLookup$FlowDefinition", "spi.DefinitionLookup$FlowNode", "spi.DefinitionLookup$FlowEdge",
                    "spi.DefinitionLookup$NodeKind",
```

`m-mdm/tests/engine-contract.generated.test.ts` 의 `EXPECTED_EXPORTS` 끝(`"ViolationStage",` 다음)에 넣고, 위 주석의 개수를 `(43개)` 로 고친다.

```ts
  "RuleSetFlow",
  "FlowNode",
  "FlowEdge",
  "FlowNodeKind",
```

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*EngineContractSchemaTest' --tests '*ContractTypeShapeTest' --console=plain)`
Expected: 컴파일 실패 — `cannot find symbol ... DefinitionLookup.NodeKind`, `DefinitionLookup.FlowDefinition`.

Run: `pnpm --filter @dk-oasis/m-mdm test tests/engine-contract.generated.test.ts`
Expected: FAIL — export 목록에 `RuleSetFlow` 등이 없다.

- [ ] **Step 3: spi 타입을 더한다**

`DefinitionLookup.java` 의 145-148행(`/** 세트 스냅샷은 셋뿐이다(06:1165). */` 부터 `enum SetStatus` 까지)을 아래로 바꾼다. 계약 record 에는 생성자·메서드를 두지 않는다(D1).

```java
    /**
     * 세트 스냅샷(06:1165) + 흐름(spec §3.3). {@code flow} 가 null 이면 {@code ruleIds} 순서의 한 줄 흐름이다.
     * {@code ruleIds} 는 흐름을 펼친 룰 목록(깊이 우선, 중복 없음)이고 조회·목록 화면이 쓴다.
     */
    record RuleSetDefinition(String setId, List<String> ruleIds, SetStatus status, @Nullable FlowDefinition flow) {}

    enum SetStatus { CREATED, INUSE, DEPRECATED }

    // ------------------------------------------------------------------ 흐름(룰 세트 흐름도, spec §3)

    /** 흐름 정의 — FLOW_JSON 의 nodes·edges. 화면 전용 view 는 싣지 않는다. {@code version} 은 형식 버전(지금 1). */
    record FlowDefinition(int version, List<FlowNode> nodes, List<FlowEdge> edges) {}

    /** {@code ruleId} 는 RULE 만, {@code splitId}(짝 분기 노드 ID)는 MERGE 만 쓴다. {@code label} 은 화면 표시용. */
    record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label) {}

    /**
     * {@code order}·{@code cond}·{@code otherwise} 는 IF·PARALLEL 에서 나가는 선만 쓴다. {@code otherwise=true} 는 IF 의
     * "그 외" 선이다(JSON 키도 otherwise — {@code else} 는 Java 예약어다, plan D2).
     */
    record FlowEdge(String id, String from, String to, @Nullable Integer order, @Nullable String cond, boolean otherwise,
            @Nullable String label) {}

    enum NodeKind { START, END, RULE, IF, PARALLEL, MERGE }
```

- [ ] **Step 4: 생성자 호출처 8곳을 4인자로 고친다(D1)**

각 줄의 마지막 인자 뒤에 `, null` 을 붙인다. 바뀐 모습:

```java
// RuleSetEvaluationTest.java:32-34
            .addSet(new RuleSetDefinition("NO_RULE", List.of("BASE_SPD_LKP", "NOPE"), SetStatus.INUSE, null),
                    new RuleSetDefinition("CREATED_SET", List.of("SPD_JOIN"), SetStatus.CREATED, null),
                    new RuleSetDefinition("EMPTY", List.of(), SetStatus.INUSE, null));
```

```java
// RuleViewTest.java:53-54
                    new RuleSetDefinition("OLD", List.of("QLTY_GRD_JDG", "PROD_WGT_CALC"), SetStatus.DEPRECATED, null),
                    new RuleSetDefinition("MISSING", List.of("QLTY_GRD_JDG", "NOPE1", "NOPE2"), SetStatus.INUSE, null));
```

```java
// SampleRules.java:192, 197
        return new RuleSetDefinition("LS_A3", List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"), SetStatus.INUSE, null);
        return new RuleSetDefinition("WID_OLD", List.of("WID_CHK"), SetStatus.DEPRECATED, null);
```

```java
// RuleDefinitionLookupStub.java:88
        return Optional.of(new RuleSetDefinition(set.getMaruRuleSetId(), List.of(), SetStatus.valueOf(set.getStatus()), null));
```

- [ ] **Step 5: 스키마 `$defs` 를 더한다**

`engine-contract.schema.json` 의 `"RuleSetResult": { … },` 정의 바로 뒤(`"EngineError"` 앞)에 넣는다. `version` 은 `const` 가 아니라 `integer` 로 둔다(스키마 대조가 `const` 숫자를 Java `int` 와 짝짓지 못한다). 머리말 C3 규칙대로 **모든 속성을 required** 로 두고 null 허용 칸은 `type: [..., "null"]` 로 적는다 — 생성 TS 가 `ruleId: string | null` 모양이 된다. 저장 JSON·코퍼스에서 빠진 칸을 null(otherwise 는 false)로 채우는 것은 읽는 쪽(mdm `RuleSetFlowJson`, TS 러너) 몫이다.

```json
    "RuleSetFlow": {
      "description": "룰 세트 흐름 정의(Java DefinitionLookup.FlowDefinition, spec §3.3). TB_MDM_RULE_SET.FLOW_JSON 의 nodes·edges 이고 화면 전용 view 는 여기 없다.",
      "type": "object",
      "properties": {
        "version": { "type": "integer", "minimum": 1 },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/FlowNode" } },
        "edges": { "type": "array", "items": { "$ref": "#/$defs/FlowEdge" } }
      },
      "required": ["version", "nodes", "edges"],
      "additionalProperties": false
    },
    "FlowNode": {
      "description": "흐름 노드(Java DefinitionLookup.FlowNode). ruleId 는 RULE 만, splitId 는 MERGE 만 쓴다.",
      "type": "object",
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "kind": { "$ref": "#/$defs/FlowNodeKind" },
        "ruleId": { "type": ["string", "null"] },
        "splitId": { "type": ["string", "null"] },
        "label": { "type": ["string", "null"] }
      },
      "required": ["id", "kind", "ruleId", "splitId", "label"],
      "additionalProperties": false
    },
    "FlowEdge": {
      "description": "흐름 선(Java DefinitionLookup.FlowEdge). order·cond·otherwise 는 IF·PARALLEL 에서 나가는 선만 쓴다. otherwise=true 는 IF 의 \"그 외\" 선.",
      "type": "object",
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "from": { "type": "string" },
        "to": { "type": "string" },
        "order": { "type": ["integer", "null"] },
        "cond": { "type": ["string", "null"] },
        "otherwise": { "type": "boolean" },
        "label": { "type": ["string", "null"] }
      },
      "required": ["id", "from", "to", "order", "cond", "otherwise", "label"],
      "additionalProperties": false
    },
    "FlowNodeKind": { "description": "흐름 노드 종류(Java DefinitionLookup.NodeKind).", "enum": ["START", "END", "RULE", "IF", "PARALLEL", "MERGE"] },
```

- [ ] **Step 6: 생성 TS 를 다시 만든다**

Run: `pnpm --filter @dk-oasis/m-mdm gen:contract`
Expected: `src/frontend/m-mdm/src/contract/engine-contract.generated.ts` 에 `export interface RuleSetFlow`, `FlowNode`, `FlowEdge`, `export type FlowNodeKind = "START" | …` 가 생긴다(`git diff --stat` 로 그 파일 하나만 바뀐 것을 확인).

- [ ] **Step 7: 엔진 계약 문서를 고친다**

`docs/mdm/engine-contract.md` §3 표 아래 불릿 목록 끝(“`MASTER` 는 첫 인자 id …” 불릿 다음)에 넣는다.

```markdown
- **룰 세트 흐름(2026-09-30, 룰 세트 흐름도 1단계).** `RuleSetDefinition(setId, ruleIds, status, flow)` 의 `flow` 는 `FlowDefinition(version, nodes, edges)` 이고 null 이면 `ruleIds` 순서의 한 줄 흐름이다. 노드 `FlowNode(id, kind, ruleId, splitId, label)` 의 `kind` 는 `START`·`END`·`RULE`·`IF`·`PARALLEL`·`MERGE`, 선 `FlowEdge(id, from, to, order, cond, otherwise, label)` 의 `otherwise=true` 가 IF 의 "그 외" 선이다(JSON 키도 `otherwise`). 스키마 정의는 `RuleSetFlow`·`FlowNode`·`FlowEdge`·`FlowNodeKind` 다. 저장 형식(FLOW_JSON)은 여기에 화면 전용 `view` 를 더한 것이다(`docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3).
```

`docs/mdm/engine-contract/README.md` 를 새로 만든다.

```markdown
# engine-contract/ — TSK-02-02 초안 원본 (정본 아님)

이 폴더의 `java/`·`schema/`·`ts/`·`samples/` 는 TSK-02-02 설계 때 쓴 **초안 원본**이다. 2026-09 TSK-03-01 에서 정본을 옮긴 뒤로 갱신하지 않는다.

| 대상 | 정본 |
|---|---|
| JSON 스키마 | `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` |
| Java 계약 타입 | `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/**` |
| TS 타입 | `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(`pnpm --filter @dk-oasis/m-mdm gen:contract` 로 생성) |
| 설명 문서 | `docs/mdm/engine-contract.md` |

계약을 바꿀 때는 위 네 벌을 한 커밋에서 함께 바꾸고, 이 폴더는 건드리지 않는다.
```

- [ ] **Step 8: 문서·스키마 수동 대조**

문서와 스키마를 자동으로 맞추는 테스트가 없다. 아래를 눈으로 확인한다.

Run: `grep -n '"RuleSetFlow"\|"FlowNode"\|"FlowEdge"\|"FlowNodeKind"' src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json && grep -n 'RuleSetFlow\|FlowNodeKind\|otherwise' docs/mdm/engine-contract.md`
Expected: 스키마 4개 정의가 모두 나오고, 문서 불릿의 필드 이름(`version, nodes, edges` / `id, kind, ruleId, splitId, label` / `id, from, to, order, cond, otherwise, label`)이 스키마 속성과 같다.

- [ ] **Step 9: 통과를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS(엔진 전체 — 계약 대조·형태·기존 세트 테스트 포함)

Run: `(cd src/backend/mdm && ../gradlew :lib:compileTestJava --console=plain -q)`
Expected: 성공(`RuleDefinitionLookupStub` 컴파일)

Run: `pnpm --filter @dk-oasis/m-mdm test tests/engine-contract.generated.test.ts`
Expected: PASS, exit 0

- [ ] **Step 10: 커밋**

```bash
git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java \
  src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetEvaluationTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleViewTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/SampleRules.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java \
  src/frontend/m-mdm/tests/engine-contract.generated.test.ts \
  src/frontend/m-mdm/src/contract/engine-contract.generated.ts \
  docs/mdm/engine-contract.md docs/mdm/engine-contract/README.md
git commit -m "feat(mdm-engine): 룰 세트 흐름 정의 계약 타입 추가

RuleSetDefinition 에 flow(FlowDefinition)를 더하고 FlowNode·FlowEdge·NodeKind 를
스키마·생성 TS·계약 문서와 함께 맞춘다. 위임 생성자는 계약 형태 규칙이 막아
호출처를 4인자로 고쳤다(plan D1). 선의 그 외 표시는 otherwise(plan D2).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 2: mdm ADR-0005 발행과 결정 기록(D-105~D-107)

**모델:** sonnet

**Files:**
- Create: `docs/mdm/adr/0005-rule-set-runs-in-engine.md`
- Modify: `docs/mdm/adr/README.md`(인덱스 표 끝에 한 줄)
- Modify: `docs/mdm/decisions.md`(파일 끝에 D-105·D-106·D-107 추가, 앞 항목은 고치지 않는다)

**Interfaces:**
- Consumes: 스펙 §2(실행 위치 결정과 근거), 머리말의 편차 표 D1~D12, 공유 계약 C6 의 이름(`RuleSetRunner`, `StoredDefinitionLookup`)
- Produces: `ADR-0005`(mdm) — Task 11 의 클래스 주석과 Task 13 의 기능설계서가 이 번호와 `D-105`~`D-107` 을 인용한다

- [ ] **Step 1: 채번 확인**

Run: `ls docs/mdm/adr/ && tail -n 30 docs/mdm/decisions.md | grep -n '^## D-'`
Expected: ADR 파일은 `0001`~`0004` 와 `README.md` 뿐이고, 마지막 결정은 `## D-104 (2026-09-29T00:00:00Z)` 이다. 다르면 번호를 그만큼 올리고 이 태스크의 번호 인용도 모두 바꾼다.

- [ ] **Step 2: ADR-0005 전문 작성**

`docs/mdm/adr/0005-rule-set-runs-in-engine.md` 를 아래 내용 그대로 만든다.

```markdown
# ADR-0005: 룰 세트 실행은 룰 엔진이 맡고 OASIS 는 RuleSetRunner 로 부른다

- **Status**: ACCEPTED
- **Date**: 2026-09-30
- **Decision Date**: 2026-09-30
- **Context Tags**: MDM, RULE_ENGINE, RULE_SET, OASIS

## 쉬운 설명 (현업용 요약)

룰 세트는 여러 판정 규칙을 정해진 차례로 돌려 결과를 얻는 묶음이다. 이번에 룰 세트를 화이트보드에 그리던 업무
흐름처럼 갈래를 나눌 수 있게 바꾼다. 조건에 맞는 한 갈래만 타는 분기와, 모든 갈래를 차례로 타는 분기를 그릴 수 있다.

그 흐름을 누가 실행할지 정해야 했다. 후보는 조회·저장·외부 연계를 묶는 업무 처리 도구(OASIS)와, 판정만 하는
룰 엔진이었다. **룰 엔진이 실행하기로 했다.** 룰 세트는 화면에서 저장하면 바로 반영되는 기준 정보이고, 갈래 조건도
판정 규칙과 같은 문법으로 써야 한다. 그리고 단계마다 어떤 값으로 어느 갈래를 탔는지 보여 주는 디버깅 기능은 판정
엔진 쪽에서만 만들 수 있다.

조회·저장·외부 호출이 필요한 업무는 지금처럼 OASIS 로 만든다. 판정이 필요한 자리에서는 "룰 세트 실행기"를 한
단계로 불러 결과를 받는다. 이번 1단계는 실행기와 판정 시점 기준 정보를 읽는 부분까지 만들고, 화면의 흐름도 편집과
디버거는 2단계에서 만든다.

## Context (배경)

- 지금의 룰 세트(`TB_MDM_RULE_SET.RULE_IDS`)는 룰 ID 를 순서대로 담은 목록이고, 엔진 `MdmRuleEngine.evaluateSet`
  이 목록을 앞에서부터 한 번씩 실행한다. 설계 스펙
  [`2026-09-29-rule-set-flow-design.md`](../../superpowers/specs/2026-09-29-rule-set-flow-design.md)(2026-09-30 승인)이
  룰 세트를 IF·병렬 분기가 있는 흐름도로 바꾼다.
- 흐름 실행 위치의 후보는 두 가지였다. (1) OASIS BPMN 으로 흐름을 그려 실행한다. (2) 룰 엔진(`maru-mdm-engine`)이
  흐름을 실행하고 OASIS 는 판정이 필요한 자리에서 엔진을 부른다. Camunda 가 결정(DMN)과 프로세스(BPMN)를 나누고
  Business Rule Task 로 DMN 을 부르는 구조와 같은 질문이다.
- (1) 을 택하지 않는 근거(스펙 §2).
  - 룰 세트는 화면에서 저장하면 바로 반영되는 데이터다. OASIS 서비스는 `services/{group}/{id}.bpmn` 파일로 앱과 함께
    배포된다([PRD](../PRD.md) AC-4, [TRD](../TRD.md):38).
  - 엔진은 EvalEx 하나에만 의존하는 독립 jar 이고 DB·네트워크를 직접 부르지 않는다([TRD](../TRD.md):13·134).
    화면 `set-model.ts` 는 서버 분석기와 같은 알고리즘을 한 벌 더 갖고 `rule-set-corpus.json` 이 동치를 고정한다.
  - IF 조건은 룰 식과 같은 EvalEx 문법·함수 사전·평가 시각·NULL 규칙을 써야 한다(`RuleEvaluator.java:285-308`).
    OASIS 게이트웨이 조건은 SpEL/PropertyEL 이다.
  - 흐름 검사(뒤 룰 결과 읽기, 형제 갈래 읽기 등)는 룰 입출력을 알아야 하므로 OASIS 를 써도 따로 만들어야 한다.
  - OASIS 에는 노드 단위 실행 결과 보기와 디버깅이 없다(사용자 확인 2026-09-30).
- DB 에서 판정 시점의 확정(RELEASED) 룰 정의를 읽는 `DefinitionLookup` 운영 구현이 저장소에 없다. 값 테스트용
  `SingleRuleDefinitionLookup`(룰 1개)과 빈 조회기(`MdmEngineConfig.EMPTY_DEFINITIONS`)만 있다. 그리고
  `MdmBusinessRuleMigrationTest` 가 `DefinitionLookup` 스프링 빈이 0개인지 확인한다(배포 보류 가드).

## Decision (결정)

- **D1 실행 위치**: 룰 세트 흐름은 `maru-mdm-engine` 이 실행한다. 엔진은 흐름을 블록 트리(`flow` 패키지의
  `FlowParser`·`FlowTree`)로 바꿔 `MdmRuleEngine.evaluateSet`(운영)·`traceSet`(기록)으로 실행한다. 엔진은 계속
  EvalEx 하나에만 의존하고 DB·네트워크를 부르지 않는다.
- **D2 OASIS 호출 경계**: `mdm/lib` 의 스프링 빈 `RuleSetRunner`(`@Service("ruleSetRunner")`)가 입구다.
  - `run(setId, record, evalTs)` → `RuleSetResult`: OASIS 업무 서비스와 Java 호출자가 쓴다.
  - `trace(flow, record, evalTs)` → `RunTrace`: 룰 세트 편집 화면 디버거(2단계)가 쓴다. 저장하지 않은 흐름도 받는다.
  - `execute(RuleSetRunRequest)` → `RuleSetRunResult`: OASIS BPMN serviceTask 용 DTO 메서드. BPMN 은
    `camunda:class="ruleSetRunner"` + `method=execute` 인 serviceTask 하나로 룰 세트를 부른다.
  - `evalTs` 가 없으면 서비스 층이 현재 시각으로 채운다(엔진은 시계를 읽지 않는다, [`decisions.md`](../decisions.md) D-020).
  - 판정 오류는 `EngineEvaluationException` 으로 올라가고, 부르는 서비스가 기존 문구 규칙(`RuleErrorText`)으로 바꾼다.
- **D3 운영 정의 조회기**: `mdm/lib` 의 `StoredDefinitionLookup`(`DefinitionLookup` 구현)이 MDM 앱 안에서 DB 를
  직접 읽는다. 룰은 `evalTs` 를 KST 로 바꾼 시각에 적용 기간 안인 RELEASED 버전(`RuleVersions.currentReleased`)을,
  세트는 `TB_MDM_RULE_SET` 현재 행을 돌려준다(`FLOW_JSON` 이 없으면 `RULE_IDS` 한 줄 흐름).
  **스프링 빈으로 등록하지 않는다.** `RuleSetRunner` 가 호출마다 만든다. 정의 조회 빈 0개 가드는 그대로 둔다.
  외부 시스템으로 정의를 배포·수신하는 일은 계속 보류한다(PRD 규칙 7).
- **D4 1단계 OASIS 검증 범위**: 1단계에서는 운영 BPMN 에 action 을 더하지 않는다. OASIS 로더가 `classpath*:` 로
  테스트 자원도 읽으므로, 테스트 자원 BPMN(`src/test/resources/services/...`) 한 개가 `ruleSetRunner.execute` 를
  serviceTask 로 부르는 경로를 검증한다. 룰 세트 편집 화면의 `simulate` action 은 2단계에서 더한다.
- **D5 실행 기록 형식**: 노드 단위 실행 기록(`RunTrace`·`NodeTrace`·`BranchTrace`)의 형식은 지금 엔진 계약에
  넣는다. 운영 경로 `evaluateSet` 은 기록을 모으지 않고 방문 경로(`RuleSetResult.path`, 노드 ID 만)만 돌려준다.
  운영 실행 기록을 저장해 다시 보는 기능은 뒤로 미룬다(스펙 A8). 형식이 정해져 있으므로 그때 엔진 계약을 다시 열지 않는다.

## Consequences (결과)

- 룰 세트 흐름은 저장 즉시 반영된다. 흐름을 바꾸려고 앱을 다시 배포하지 않는다.
- 룰 세트 흐름 안에는 DB 저장·외부 호출·메시지 발행 노드가 없다. 그런 일이 흐름 중간에 필요하면 OASIS 흐름으로
  나누고, 판정 부분만 룰 세트로 부른다.
- 흐름 구조 해석·검사 알고리즘이 서버(`FlowParser`·`RuleSetAnalyzer`)와 화면(`flow-model.ts`·`set-model.ts`)에
  두 벌 있다. `rule-set-corpus.json` 흐름 사례가 동치를 고정한다. 알고리즘을 바꾸면 두 벌과 코퍼스를 함께 바꾼다.
- 엔진 계약(흐름 타입·`path`·실행 기록·새 오류 코드)이 늘어 계약 네 벌(`engine-contract.md`, 엔진 스키마, 엔진 Java,
  `engine-contract.generated.ts`)을 한 번에 갱신한다.
- `RuleSetRunner` 는 호출마다 조회기를 만들고 캐시하지 않는다. 레코드마다 부르는 대량 판정에서 조회 비용이 문제가
  되면 조회기 캐시를 후속 과제로 다룬다.

## Alternatives Considered (대안)

- **OASIS BPMN 으로 룰 세트 흐름 실행**: 흐름이 배포 단위 파일이 되고, 조건 문법이 룰 식과 달라지며, 노드 단위 결과
  보기·디버깅이 없다. 흐름 검사는 어차피 따로 만들어야 한다. 채택하지 않는다.
- **엔진이 DB 를 직접 조회**: 엔진을 EvalEx 만 의존하는 독립 jar 로 둔다는 원칙([TRD](../TRD.md):134)과 어긋난다.
  조회기는 `mdm/lib` 에 두고 엔진에는 `DefinitionLookup` 인터페이스로만 넘긴다.
- **`StoredDefinitionLookup` 을 스프링 빈으로 등록**: 정의 조회 빈 0개 가드(배포 보류 장치)와 충돌한다. 호출마다
  만드는 비용은 객체 생성 하나라 작다.

## References

- 설계 스펙: [`docs/superpowers/specs/2026-09-29-rule-set-flow-design.md`](../../superpowers/specs/2026-09-29-rule-set-flow-design.md) §2·§4·§6
- 구현 계획: [`docs/superpowers/plans/2026-09-30-rule-set-flow-phase1.md`](../../superpowers/plans/2026-09-30-rule-set-flow-phase1.md)(편차 D1~D12)
- [TRD](../TRD.md) 13·134행, [PRD](../PRD.md) AC-4, [엔진 계약](../engine-contract.md)
- [ruleSetEdit 기능설계서](../screens/ruleSetEdit/ruleSetEdit_기능설계서.md) §11 N-1
- [`docs/mdm/decisions.md`](../decisions.md) D-105·D-106·D-107
```


- [ ] **Step 3: ADR 린트**

Run: `python3 .claude/skills/adr-write/scripts/adr_tool.py lint docs/mdm/adr/0005-rule-set-runs-in-engine.md`
Expected: ERROR 0. WARN 이 나오면 문구를 확인해 규약(쉬운 설명에 클래스명 금지 등)에 맞게 고친다. 쉬운 설명 절에는 클래스명이 없어야 한다.

- [ ] **Step 4: README 인덱스 표에 한 줄 추가**

`docs/mdm/adr/README.md` 표의 마지막 줄(0004) 아래에 붙인다.

```markdown
| [0005](0005-rule-set-runs-in-engine.md) | 룰 세트 실행은 룰 엔진이 맡고 OASIS 는 RuleSetRunner 로 부른다 | ACCEPTED | 2026-09-30 | 사용자 합의(스펙 A7, 2026-09-30 승인). 분기형 룰 세트 흐름은 `maru-mdm-engine` 이 실행(블록 트리·`evaluateSet`·`traceSet`), OASIS 는 `mdm/lib` 의 `RuleSetRunner`(`execute`) serviceTask 하나로 부름, 운영 정의 조회기 `StoredDefinitionLookup` 은 빈이 아님(정의 조회 빈 0개 가드 유지), 1단계는 테스트 자원 BPMN 으로 OASIS 경로만 검증, 실행 기록 형식 확정·운영 기록 재생 보류. |
```

- [ ] **Step 5: decisions.md 에 세 항목 추가**

`docs/mdm/decisions.md` 끝(마지막 줄 뒤, 빈 줄 하나 띄움)에 아래를 붙인다. 앞 항목은 고치지 않는다.

```markdown

## D-105 (2026-09-30T00:00:00Z)
- **Phase**: design(룰 세트 흐름도 1단계)
- **Decision needed**: 분기형 룰 세트 흐름을 OASIS BPMN 으로 실행할지, 룰 엔진이 실행하고 OASIS 는 엔진을 부를지(스펙 A7)
- **Decision made**: 룰 엔진(`maru-mdm-engine`)이 흐름을 실행하고, OASIS 업무 서비스는 `mdm/lib` 의 `RuleSetRunner`
  (`@Service("ruleSetRunner")`, BPMN 용 `execute(RuleSetRunRequest)`)를 serviceTask 하나로 부른다. 운영 정의 조회기
  `StoredDefinitionLookup` 은 스프링 빈이 아니고 `RuleSetRunner` 가 호출마다 만든다. 1단계는 테스트 자원 BPMN 으로
  OASIS 경로만 검증하고 운영 action(`simulate`)은 2단계에 더한다. 상세는 mdm ADR-0005
- **Rationale**: 룰 세트는 저장 즉시 반영되는 데이터이고, IF 조건은 룰 식과 같은 EvalEx 문법·NULL 규칙이어야 하며,
  노드 단위 결과 보기·디버깅은 OASIS 에 없다(사용자 확인). 엔진은 EvalEx 만 의존하는 독립 jar 로 남는다(TRD:134).
  정의 조회 빈 0개 가드(`MdmBusinessRuleMigrationTest`)는 배포 보류 장치라 유지한다
- **Reversible**: no(엔진 계약·흐름 저장 형식·실행기 입구가 이 결정 위에 선다. 바꾸려면 새 ADR)
- **Source**: `docs/mdm/adr/0005-rule-set-runs-in-engine.md`, `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §2·§6

## D-106 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계 구현 계획)
- **Decision needed**: 승인된 스펙과 저장소의 기존 규칙(계약 형태 테스트·스키마 대조·기존 검사 명명·정의 조회 빈 가드)이
  어긋나는 11곳을 어떻게 맞출지
- **Decision made**: 아래처럼 계획에서 스펙과 다르게 정한다(계획 `docs/superpowers/plans/2026-09-30-rule-set-flow-phase1.md`
  「편차 기록」이 정본)

  | # | 스펙 | 구현 |
  |---|---|---|
  | D1 | `RuleSetDefinition` 기존 3인자 생성자를 한 줄 흐름으로 위임 | 4인자 생성자 하나, 호출처를 모두 `flow=null` 로 고침(`ContractTypeShapeTest` 가 위임 생성자 금지) |
  | D2 | 선 필드 `"else": true` | `"otherwise": true`(Java 예약어·스키마 속성 이름 대조) |
  | D3 | `SET_DUP_RESULT` 오류 | 같은 경로 중복 대입은 기존대로 경고, 병렬 형제가 같은 이름을 쓰면 오류(`PAR_SIBLING`) |
  | D4 | 코드 이름 `SET_*` 하나 | 세트 저장 검사는 접두어 없는 이름(`ORDER`·`IF_SIBLING`…), 룰 확정 검사는 `SET_` 접두어. `CYCLE` 유지 |
  | D5 | 오류 코드 목록 | `FLOW_INVALID`(단계 `SET_CHECK`) 추가 — 저장된 흐름·저장 전 흐름의 구조 오류 |
  | D6 | `RuleSetResult` 에 `path` 만 | `path` 와 `warnings` — `BRANCH_COND_NULL` 을 실을 자리 |
  | D7 | `RunTrace.error: EngineError` | `RunTrace.violations: Violation[] \| null`(스키마 전용 래퍼라 Java 타입 없음) |
  | D8 | 검사 결과에 위치 없음 | `RuleSetCheck` 에 `nodeId`·`edgeId`(같은 룰이 여러 갈래에 있을 수 있음) |
  | D9 | `FLOW_COND` 가 불린 아닌 식도 잡음 | 정적 검사는 파싱 실패·정의 안 된 변수만. 불린 아님은 실행 때 `BRANCH_EVAL_ERROR`(정적 타입 추론 없음) |
  | D10 | 입출력 표·의존 룰을 흐름 기준으로 | 흐름을 펼친 룰 목록으로 계산(1단계 화면은 분기 세트를 읽기 전용으로만 보임) |
  | D11 | OASIS serviceTask 로 부름 | `RuleSetRunner.execute(DTO)` 추가, 1단계는 테스트 자원 BPMN 으로 검증, 운영 BPMN 추가 없음 |
- **Rationale**: 스펙 의도(흐름 실행·검사·기록)는 그대로 두고, 이미 영구 테스트로 굳은 저장소 규칙을 깨지 않는 쪽을
  골랐다. D3 은 오류로 올리면 지금 저장된 한 줄 세트가 다음 저장에서 거부되기 때문이다. D8 은 2단계 캔버스에서 검사
  항목을 누르면 노드로 이동해야 하는데, 2단계에서 더하면 코퍼스를 다시 열어야 해서 지금 넣었다
- **Reversible**: partial(D2·D8 은 저장 형식·코퍼스에 들어가므로 바꾸려면 이관이 필요하다. 나머지는 코드 변경으로 되돌릴 수 있다)
- **Source**: 계획 「편차 기록」, `ContractTypeShapeTest`, `EngineContractSchemaTest`, `RuleSetAnalyzer`, `RuleSetOrderCheck`,
  `MdmBusinessRuleMigrationTest.계약_전용_06_확정_검사와_정의_조회_빈이_없다`

## D-107 (2026-09-30T00:00:00Z)
- **Phase**: plan(룰 세트 흐름도 1단계)
- **Decision needed**: ruleSetEdit 기능설계서 N-1(설계 D2)이 남긴 후속 조건 "조회기가 생기면 `view` 옆 `execute`
  action 으로 세트 값 테스트 카드를 더한다"를 1단계에서 채울지
- **Decision made**: 1단계에서는 채우지 않는다. 1단계는 조회기(`StoredDefinitionLookup`)와 `RuleSetRunner` 까지만
  만들고, 화면 카드는 2단계의 디버거(시뮬레이션 탭)와 `ruleSetEdit.bpmn` 의 `simulate` action 으로 넣는다.
  action 이름은 `execute` 가 아니라 `simulate` 다(스펙 §6.2, 저장 전 흐름도 실행하는 기록 실행이라 뜻이 다르다)
- **Rationale**: 1단계 화면은 기존 목록 편집을 유지하고 분기 세트만 읽기 전용으로 보인다(스펙 §9). 값 테스트 카드를
  목록 화면에 먼저 만들면 2단계 디버거와 같은 기능이 두 벌이 된다
- **Reversible**: yes(2단계 착수 때 다시 정한다)
- **Source**: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` §11 N-1, 스펙 §6.2·§9, mdm ADR-0005 D4
```

- [ ] **Step 6: 결과 확인**

Run: `grep -n '^## D-10[5-7]' docs/mdm/decisions.md && grep -c '0005-rule-set-runs-in-engine' docs/mdm/adr/README.md`
Expected: D-105·D-106·D-107 세 줄, README 개수 1.

- [ ] **Step 7: 커밋**

```bash
git add docs/mdm/adr/0005-rule-set-runs-in-engine.md
git commit -m "docs(mdm): ADR-0005 룰 세트 실행 위치 발행, 결정 D-105~D-107 기록

룰 세트 흐름은 maru-mdm-engine 이 실행하고 OASIS 는 RuleSetRunner 를 부른다.
스펙 편차 D1~D12 과 ruleSetEdit N-1 후속 이관을 결정 로그에 남긴다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- docs/mdm/adr/0005-rule-set-runs-in-engine.md docs/mdm/adr/README.md docs/mdm/decisions.md
```

`docs/mdm/decisions.md` 는 작업 트리에 이 작업과 무관한 수정이 있을 수 있다. 커밋 전에 `git diff docs/mdm/decisions.md` 로 이 태스크가 더한 세 항목만 바뀌었는지 확인한다. 다른 변경이 섞여 있으면 `git add -p docs/mdm/decisions.md` 로 세 항목 덩어리만 올린 뒤 `git commit` 에서 경로 인자 없이 커밋한다.

---


---

### Task 3: FLOW_JSON 컬럼 — V14 마이그레이션·엔티티·ERD

**모델:** sonnet · **물결:** 1 · **선행:** 없음

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V14__add_rule_set_flow_json.sql`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSet.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java`(흐름 세트 픽스처)
- Modify: `docs/mdm/erd/06-business-rule.mmd`, `docs/mdm/erd/06-business-rule.sqlite.sql`

**Interfaces:**
- Consumes: 없음
- Produces:
  - DB 컬럼 `TB_MDM_RULE_SET.FLOW_JSON TEXT NULL` + `CONSTRAINT CK_TB_MDM_RULE_SET_FLOW_JSON CHECK (FLOW_JSON IS NULL OR json_valid(FLOW_JSON))`. 컬럼 자리는 `RULE_IDS` 바로 뒤다.
  - `MdmRuleSet.getFlowJson(): String`, `MdmRuleSet.setFlowJson(String)`
  - `DmeTestSupport.ruleSetFlow(JdbcTemplate jdbc, String setId, String flowJson)`: 이미 넣은 세트 행의 FLOW_JSON 을 바꾼다.

**왜 테이블을 다시 만드는가.** `MdmBusinessRuleMigrationTest._8테이블_전부_생성되고_칼럼_목록이_순서까지_기대값과_같다` 는 칼럼 순서를 `업무 칼럼 + 감사 9칼럼` 으로 고정한다. `ALTER TABLE ADD COLUMN` 은 감사 칼럼 뒤에 붙으므로 그 불변식이 깨진다. 그래서 V13 과 같은 방식으로 테이블을 새로 만들어 `RULE_IDS` 뒤에 `FLOW_JSON` 을 둔다. `TB_MDM_RULE_SET` 을 참조하는 FK 는 없다.

- [ ] **Step 1: 마이그레이션 테스트의 기대값을 먼저 바꾼다**

`MdmBusinessRuleExpectations.java`:

```java
// JSON_COLUMNS 주석을 "JSON CHECK 가 걸린 8칼럼(F5 + 흐름도 FLOW_JSON)" 로 고치고
JSON_COLUMNS.put("TB_MDM_RULE_SET", List.of("RULE_IDS", "FLOW_JSON"));

// NULLABLE_JSON_COLUMNS: "JSON 칼럼 가운데 NULL 을 허용하는 5칼럼"
static final Set<String> NULLABLE_JSON_COLUMNS = Set.of("VAR_AST", "PRIO_LIST", "GRP_COND_AST", "EXPECTED_JSON", "FLOW_JSON");

BUSINESS_COLUMNS.put("TB_MDM_RULE_SET", List.of(
        "MARU_RULE_SET_ID", "MARU_RULE_SET_NAME", "RULE_IDS", "FLOW_JSON", "DESCRIPTION", "STATUS", "ROW_VERSION"));

CONSTRAINTS.put("TB_MDM_RULE_SET", List.of(
        "PK_TB_MDM_RULE_SET", "CK_TB_MDM_RULE_SET_STATUS", "CK_TB_MDM_RULE_SET_RULE_IDS_JSON", "CK_TB_MDM_RULE_SET_FLOW_JSON"));
```

`jsonCheckName("TB_MDM_RULE_SET", "FLOW_JSON")` 는 칼럼 이름이 `_JSON` 으로 끝나므로 `CK_TB_MDM_RULE_SET_FLOW_JSON` 이 된다. 위 이름과 같다.

`MdmBusinessRuleMigrationTest.java` 의 `JSON_CHECK_는_7칼럼에서_…` 테스트:

```java
// 메서드 이름을 JSON_CHECK_는_8칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다 로 바꾼다
inserts.put("FLOW_JSON", "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON) "
        + "VALUES (?, ?, '[]', ?)");
// ...
assertEquals(8, checked, "JSON 칼럼은 정확히 8개다(F5 + FLOW_JSON)");
```

`jsonParams` 에 갈래를 더한다:

```java
case "FLOW_JSON" -> new Object[] {"F" + n, "흐름 세트", json};
```

기존 V8 적용 여부 테스트 옆에 V14 적용 테스트를 더한다:

```java
@Test
void flyway_가_V14_를_success_로_적용했다() throws SQLException {
    try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
         ResultSet rs = s.executeQuery("SELECT success FROM flyway_schema_history WHERE version = '14'")) {
        assertTrue(rs.next(), "flyway_schema_history 에 version=14 행이 없다");
        assertTrue(rs.getBoolean(1), "V14 가 success 가 아니다");
    }
}
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --console=plain)`
Expected: FAIL. 칼럼 목록 불일치(`FLOW_JSON` 없음), 제약 `CK_TB_MDM_RULE_SET_FLOW_JSON` 없음, `version=14 행이 없다`.

- [ ] **Step 3: V14 를 쓴다**

`V14__add_rule_set_flow_json.sql`:

```sql
-- 2026-09-30 — 룰 세트 흐름도(분기형 룰 세트) 저장 칼럼 FLOW_JSON 을 더한다.
--
-- 왜: 룰 세트를 IF·병렬 분기가 있는 흐름도로 저장한다(spec docs/superpowers/specs/2026-09-29-rule-set-flow-design.md §3.3,
-- ADR docs/mdm/adr/0005). RULE_IDS 는 없애지 않고 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 계속 채운다. FLOW_JSON 이
-- NULL 인 세트는 RULE_IDS 순서의 한 줄 흐름이다 — 기존 행의 데이터 이관은 없다.
--
-- ADD COLUMN 대신 테이블을 다시 만든다: 칼럼 순서 불변식(업무 칼럼 + 감사 9칼럼, MdmBusinessRuleMigrationTest)을 지키려면
-- FLOW_JSON 이 RULE_IDS 바로 뒤에 있어야 한다. TB_MDM_RULE_SET 을 참조하는 FK 는 없다.
-- V13 과 같은 규칙을 따른다: INSERT ... SELECT * 를 쓰지 않고 칼럼명을 모두 적는다. PRAGMA 를 쓰지 않는다(Flyway SQLite 파서가
-- transactional·non-transactional 문 혼합을 거부한다).
-- 되돌리려면: 새 마이그레이션에서 FLOW_JSON 을 뺀 V8 정의로 같은 방식의 재생성을 한다. 분기 흐름은 RULE_IDS 에 펼친 목록만 남는다.

CREATE TABLE TB_MDM_RULE_SET_NEW (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    MARU_RULE_SET_NAME TEXT NOT NULL,
    RULE_IDS TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_RULE_IDS_JSON CHECK (json_valid(RULE_IDS)),
    FLOW_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_FLOW_JSON CHECK (FLOW_JSON IS NULL OR json_valid(FLOW_JSON)),
    DESCRIPTION TEXT,
    STATUS VARCHAR(20) NOT NULL DEFAULT 'INUSE',
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET PRIMARY KEY (MARU_RULE_SET_ID),
    CONSTRAINT CK_TB_MDM_RULE_SET_STATUS CHECK (STATUS IN ('INUSE','DEPRECATED'))
);

INSERT INTO TB_MDM_RULE_SET_NEW (
    MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, DESCRIPTION, STATUS, ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
)
SELECT
    MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, NULL, DESCRIPTION, STATUS, ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_RULE_SET;

DROP TABLE TB_MDM_RULE_SET;
ALTER TABLE TB_MDM_RULE_SET_NEW RENAME TO TB_MDM_RULE_SET;
```

- [ ] **Step 4: 엔티티에 칼럼을 더한다**

`MdmRuleSet.java` — `ruleIds` 필드 뒤에 둔다. 클래스 주석 끝에 "{@code FLOW_JSON} 은 흐름도 정의(NULL 이면 RULE_IDS 순서의 한 줄 흐름, spec §3.3)." 한 문장을 더한다.

```java
@Column(name = "FLOW_JSON")
private String flowJson;

public String getFlowJson() { return flowJson; }
public void setFlowJson(String v) { this.flowJson = v; }
```

- [ ] **Step 5: 테스트 픽스처에 흐름 세트 도우미를 더한다**

`DmeTestSupport.java` — `ruleSet(...)` 바로 아래:

```java
/** 이미 넣은 세트 행의 FLOW_JSON 을 바꾼다(흐름도 세트 픽스처, spec §3.3). RULE_IDS 는 호출자가 펼친 목록으로 맞춰 둔다. */
public static void ruleSetFlow(JdbcTemplate jdbc, String setId, String flowJson) {
    jdbc.update("UPDATE TB_MDM_RULE_SET SET FLOW_JSON = ? WHERE MARU_RULE_SET_ID = ?", flowJson, setId);
}
```

- [ ] **Step 6: 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --tests '*MdmBusinessRuleEntityJpaRoundtripTest' --tests '*RuleSetEditServiceTest' --console=plain)`
Expected: PASS. 엔티티 왕복 테스트가 칼럼 수를 세면 그 테스트의 기대 칼럼에도 `FLOW_JSON` 을 더한다(실패 메시지로 확인).

- [ ] **Step 7: ERD 두 파일을 고친다**

`docs/mdm/erd/06-business-rule.mmd` 의 `TB_MDM_RULE_SET` 블록에서 `RULE_IDS` 줄 바로 아래에 다음 줄을 넣는다(들여쓰기·표기는 옆 줄과 같게):

```
        TEXT FLOW_JSON "흐름도 JSON(NULL=RULE_IDS 한 줄 흐름)"
```

기존 줄이 따옴표 설명을 쓰지 않으면 설명 없이 `TEXT FLOW_JSON` 만 쓴다. `docs/mdm/erd/06-business-rule.sqlite.sql` 의 `CREATE TABLE TB_MDM_RULE_SET` 에서 `RULE_IDS TEXT NOT NULL,` 아래에 `FLOW_JSON TEXT,` 를 넣는다(이 파일은 제약을 적지 않는 요약본이다).

- [ ] **Step 8: 커밋한다**

```bash
git add src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V14__add_rule_set_flow_json.sql \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSet.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java \
  docs/mdm/erd/06-business-rule.mmd docs/mdm/erd/06-business-rule.sqlite.sql
git commit -m "feat(mdm): 룰 세트 FLOW_JSON 칼럼 추가(V14)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

엔티티 왕복 테스트를 고쳤으면 그 파일도 `git add` 에 넣는다.

---


---

### Task 4: 엔진 flow 패키지 (구조 검사·블록 트리·노드 관계)

**모델:** opus

`kr.dongkuk.maru.mdm.engine.flow` 를 새로 만든다. C2 의 공개 API 와 C3 의 알고리즘·문구를 그대로 구현한다. 이 패키지는 `spi` 만 본다. mdm/lib 분석기(Task 6)와 엔진 실행(Task 5)이 쓴다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/package-info.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParser.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowParse.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowIssue.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/Block.java`(sealed interface + `Seq`·`RuleStep`·`Split`·`Branch` 는 각자 파일)
- Create: `.../flow/Seq.java`, `.../flow/RuleStep.java`, `.../flow/Split.java`, `.../flow/Branch.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow/FlowTree.java`
- Create(Test 도우미): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowParserTest.java`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow/FlowTreeTest.java`
- Modify(Test): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/EnginePackageDependencyTest.java`
- Modify: `docs/mdm/engine-contract.md` §2 패키지 표

**Interfaces:**
- Consumes(Task 1): `DefinitionLookup.FlowDefinition`, `FlowNode`, `FlowEdge`, `NodeKind`
- Produces(C2 그대로):
  - `FlowParser.parse(FlowDefinition) → FlowParse`, `FlowParser.linear(List<String>) → FlowDefinition`, 상수 `FlowParser.STRUCTURE = "FLOW_STRUCTURE"`, `FlowParser.IF_ELSE = "FLOW_IF_ELSE"`
  - `record FlowParse(@Nullable FlowTree tree, List<FlowIssue> issues)`
  - `record FlowIssue(String code, @Nullable String nodeId, @Nullable String edgeId, String message)`
  - `sealed interface Block permits Seq, RuleStep, Split`, `record Seq(List<Block> items)`, `record RuleStep(String nodeId, String ruleId)`, `record Split(String nodeId, NodeKind kind, String mergeId, List<Branch> branches)`, `record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body)`
  - `FlowTree`: `root()`, `startId()`, `endId()`, `ruleSteps()`, `ruleIds()`, `branched()`, `relation(String, String)`, `enum Relation { SAME, BEFORE, AFTER, EXCLUSIVE, PARALLEL }`
  - 테스트 도우미 `testsupport.FlowFixtures`(Task 5·7 이 쓴다): `start()`, `end()`, `rule(id, ruleId)`, `ifNode(id)`, `par(id)`, `merge(id, splitId)`, `e(id, from, to)`, `br(id, from, to, order, cond)`, `other(id, from, to)`, `pe(id, from, to, order)`, `flow(List<FlowNode>, List<FlowEdge>)`, `ifFlow()`, `parFlow()`, `nestedFlow()`

- [ ] **Step 1: 테스트 도우미를 만든다**

`testsupport/FlowFixtures.java`:

```java
package kr.dongkuk.maru.mdm.engine.testsupport;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/** 흐름 정의 조립 도우미(plan Task 4). 표본 흐름의 룰 ID 는 R_A·R_B·R_C 다. */
public final class FlowFixtures {

    private FlowFixtures() {}

    public static FlowNode start() {
        return new FlowNode("start", NodeKind.START, null, null, null);
    }

    public static FlowNode end() {
        return new FlowNode("end", NodeKind.END, null, null, null);
    }

    public static FlowNode rule(String id, String ruleId) {
        return new FlowNode(id, NodeKind.RULE, ruleId, null, null);
    }

    public static FlowNode ifNode(String id) {
        return new FlowNode(id, NodeKind.IF, null, null, null);
    }

    public static FlowNode par(String id) {
        return new FlowNode(id, NodeKind.PARALLEL, null, null, null);
    }

    public static FlowNode merge(String id, String splitId) {
        return new FlowNode(id, NodeKind.MERGE, null, splitId, null);
    }

    /** 분기 밖 보통 선. */
    public static FlowEdge e(String id, String from, String to) {
        return new FlowEdge(id, from, to, null, null, false, null);
    }

    /** IF 갈래 선. */
    public static FlowEdge br(String id, String from, String to, int order, String cond) {
        return new FlowEdge(id, from, to, order, cond, false, null);
    }

    /** IF 의 "그 외" 선. */
    public static FlowEdge other(String id, String from, String to) {
        return new FlowEdge(id, from, to, null, null, true, null);
    }

    /** 병렬 갈래 선. */
    public static FlowEdge pe(String id, String from, String to, int order) {
        return new FlowEdge(id, from, to, order, null, false, null);
    }

    public static FlowDefinition flow(List<FlowNode> nodes, List<FlowEdge> edges) {
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    /** start → if1 [b1 "X > 10" → a(R_A)] [b2 "X > 0" → b(R_B)] [그 외 bo → c(R_C)] → m1 → end. */
    public static FlowDefinition ifFlow() {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    /** start → p1 [p1a 1 → a(R_A)] [p1b 2 → b(R_B)] → pm → c(R_C) → end. */
    public static FlowDefinition parFlow() {
        return flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"), rule("c", "R_C"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), e("ea", "a", "pm"),
                        e("eb", "b", "pm"), e("ep", "pm", "c"), e("ec", "c", "end")));
    }

    /** start → p1 [p1a 1 → if1(b1 "X > 0" → a(R_A), 그 외 bo → 빈 갈래) → m1] [p1b 2 → b(R_B)] → pm → end. */
    public static FlowDefinition nestedFlow() {
        return flow(List.of(start(), par("p1"), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "if1", 1), pe("p1b", "p1", "b", 2),
                        br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("em", "m1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
    }
}
```

- [ ] **Step 2: 실패하는 구조 검사 테스트를 쓴다**

`flow/FlowParserTest.java` — C3 표의 문구마다 실패 사례 하나, 정상 사례, `linear` 사례.

```java
package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/** plan C3 — 구조 검사 문구·순서와 블록 트리. 같은 문구를 m-mdm flow-model.ts 와 rule-set-corpus.json 이 고정한다. */
class FlowParserTest {

    /** issue 를 "code|nodeId|edgeId|message" 로. */
    private static List<String> issues(FlowDefinition f) {
        FlowParse p = FlowParser.parse(f);
        if (!p.issues().isEmpty()) {
            assertNull(p.tree(), "오류가 있으면 트리가 없다");
        }
        return p.issues().stream().map(i -> i.code() + "|" + i.nodeId() + "|" + i.edgeId() + "|" + i.message()).toList();
    }

    private static FlowDefinition line(List<FlowNode> nodes, List<FlowEdge> edges) {
        return flow(nodes, edges);
    }

    // ── 정상 ──

    @Test
    void IF_흐름은_그_외를_마지막에_둔_갈래_순서로_트리가_된다() {
        FlowParse p = FlowParser.parse(ifFlow());
        assertEquals(List.of(), p.issues());
        Seq root = p.tree().root();
        assertEquals(1, root.items().size());
        Split s = (Split) root.items().get(0);
        assertEquals("if1", s.nodeId());
        assertEquals(NodeKind.IF, s.kind());
        assertEquals("m1", s.mergeId());
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
        assertTrue(s.branches().get(2).otherwise());
        assertEquals(List.of(new RuleStep("a", "R_A")), s.branches().get(0).body().items());
        assertTrue(p.tree().branched());
    }

    @Test
    void 갈래_순서는_선_배열이_아니라_order_다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("bo", "if1", "m1"), br("b2", "if1", "b", 2, "X > 0"),
                        br("b1", "if1", "a", 1, "X > 10"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        Split s = (Split) FlowParser.parse(f).tree().root().items().get(0);
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
    }

    @Test
    void 병렬_흐름은_order_순_갈래와_합류_뒤_룰() {
        FlowParse p = FlowParser.parse(parFlow());
        assertEquals(List.of(), p.issues());
        List<Block> items = p.tree().root().items();
        assertEquals(2, items.size());
        Split s = (Split) items.get(0);
        assertEquals(NodeKind.PARALLEL, s.kind());
        assertEquals(List.of("p1a", "p1b"), s.branches().stream().map(Branch::edgeId).toList());
        assertEquals(new RuleStep("c", "R_C"), items.get(1));
    }

    @Test
    void 중첩_분기와_빈_그_외_갈래() {
        FlowParse p = FlowParser.parse(nestedFlow());
        assertEquals(List.of(), p.issues());
        Split outer = (Split) p.tree().root().items().get(0);
        Split inner = (Split) outer.branches().get(0).body().items().get(0);
        assertEquals("if1", inner.nodeId());
        assertEquals(List.of(), inner.branches().get(1).body().items(), "그 외 갈래가 합류로 바로 간다 = 빈 갈래");
    }

    @Test
    void 두_갈래_모두_빈_IF_도_정상이다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "m1", 1, "X > 0"), other("bo", "if1", "m1"), e("ee", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertTrue(s.branches().stream().allMatch(b -> b.body().items().isEmpty()));
        assertEquals(List.of(), p.tree().ruleIds());
    }

    @Test
    void linear_는_start_r1_rN_end_와_e1_eN1_을_만든다() {
        FlowDefinition f = FlowParser.linear(List.of("R_A", "R_B"));
        assertEquals(List.of("start", "r1", "r2", "end"), f.nodes().stream().map(FlowNode::id).toList());
        assertEquals(List.of("e1", "e2", "e3"), f.edges().stream().map(FlowEdge::id).toList());
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertEquals(List.of("R_A", "R_B"), p.tree().ruleIds());
        assertFalse(p.tree().branched());
    }

    @Test
    void 빈_linear_는_start_end_한_선이고_트리가_비었다() {
        FlowParse p = FlowParser.parse(FlowParser.linear(List.of()));
        assertEquals(List.of(), p.issues());
        assertNotNull(p.tree());
        assertEquals(List.of(), p.tree().root().items());
    }

    // ── 1단계(모두 모은다) ──

    @Test
    void a_노드_ID_중복() {
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), rule("a", "R_B"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|노드 ID a가 겹친다"), issues(f));
    }

    @Test
    void a_겹친_ID_는_첫_노드만_센다() {
        // 둘째 "end"(RULE)는 개수·순회에서 빠진다 — END 는 1개로 센다(머리말 C3).
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), end(), rule("end", "R_B")),
                List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|노드 ID end가 겹친다"), issues(f));
    }

    @Test
    void b1_b2_시작_끝_개수() {
        FlowDefinition f = line(List.of(rule("a", "R_A")), List.of());
        assertEquals(List.of(
                "FLOW_STRUCTURE|null|null|시작 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|null|null|끝 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|a|null|a의 들어오는 선이 0개다. 1개여야 한다",
                "FLOW_STRUCTURE|a|null|a의 나가는 선이 0개다. 1개여야 한다"), issues(f));
    }

    @Test
    void c_없는_노드를_가리키는_선은_from_먼저() {
        FlowDefinition f = line(List.of(start(), end()), List.of(e("e1", "start", "end"), e("e2", "x", "y")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|x|e2|선 e2가 없는 노드 x를 가리킨다",
                "FLOW_STRUCTURE|y|e2|선 e2가 없는 노드 y를 가리킨다"), issues(f));
    }

    @Test
    void d1_d2_들어오는_선과_나가는_선_개수() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("bo", "if1", "a"), e("ea", "a", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|if1|null|if1의 나가는 선이 1개다. 2개 이상이어야 한다",
                "FLOW_STRUCTURE|m1|null|m1의 들어오는 선이 1개다. 2개 이상이어야 한다"), issues(f));
    }

    @Test
    void d1_START_에_들어오는_선() {
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end"), e("e3", "end", "start")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|start|null|start의 들어오는 선이 1개다. 없어야 한다",
                "FLOW_STRUCTURE|end|null|end의 나가는 선이 1개다. 없어야 한다"), issues(f));
    }

    @Test
    void e_룰_노드에_룰_ID_가_없다() {
        FlowDefinition f = line(List.of(start(), rule("a", " "), end()), List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|룰 노드 a에 룰 ID가 없다"), issues(f));
    }

    @Test
    void f1_f2_짝_분기가_없는_합류와_합류가_없는_분기() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", null), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 -가 없다",
                "FLOW_STRUCTURE|if1|null|분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"), issues(f));
    }

    @Test
    void g1_그_외_갈래가_없거나_둘이다() {
        FlowDefinition none = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다"), issues(none));

        FlowDefinition two = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("o1", "if1", "a"), other("o2", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 2개다. 정확히 1개여야 한다"), issues(two));
    }

    @Test
    void g2_IF_갈래에_조건식이_없다() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "  "), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|b1|IF if1의 갈래 b1에 조건식이 없다"), issues(f));
    }

    @Test
    void g3_병렬_갈래에_조건() {
        FlowDefinition f = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), br("p1a", "p1", "a", 1, "X > 0"), pe("p1b", "p1", "b", 2),
                        e("ea", "a", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|p1|p1a|병렬 분기 p1의 갈래 p1a에는 조건을 둘 수 없다"), issues(f));
    }

    @Test
    void g4_g5_순서가_없거나_겹친다() {
        FlowDefinition f = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), new FlowEdge("p1a", "p1", "a", null, null, false, null), pe("p1b", "p1", "b", 2),
                        pe("p1c", "p1", "c", 2), e("ea", "a", "pm"), e("eb", "b", "pm"), e("ec", "c", "pm"), e("ee", "pm", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|p1|p1a|분기 p1의 갈래 p1a에 순서가 없다",
                "FLOW_STRUCTURE|p1|p1c|분기 p1의 갈래 순서 2가 겹친다"), issues(f));
    }

    @Test
    void 일단계_순서는_a_b_c_노드별_d_e_f1_분기별_f2_g() {
        // a(중복) → b2(END 없음) → c(없는 노드) → 노드별 d/e/f1 → 분기별 f2/g1
        FlowDefinition f = line(List.of(start(), rule("r", "R_A"), rule("r", "R_B"), ifNode("if1")),
                List.of(e("e0", "start", "r"), e("e1", "r", "zz"), e("e2", "r", "if1")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|r|null|노드 ID r가 겹친다",
                "FLOW_STRUCTURE|null|null|끝 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|zz|e1|선 e1가 없는 노드 zz를 가리킨다",
                "FLOW_STRUCTURE|if1|null|if1의 나가는 선이 0개다. 2개 이상이어야 한다",
                "FLOW_STRUCTURE|if1|null|분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다",
                "FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다"), issues(f));
    }

    // ── 2단계(첫 오류에서 멈춘다) ──

    @Test
    void 두_번_지나는_노드() {
        // if1 이 m1 에서 닫힌 뒤 if2 의 갈래가 이미 지난 m1 로 다시 간다.
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), ifNode("if2"), merge("m2", "if2"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("e1", "m1", "if2"), br("c1", "if2", "m1", 1, "X > 1"), br("c2", "if2", "m2", 2, "X > 2"),
                        other("co", "if2", "m2"), e("ee", "m2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|m1를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"), issues(f));
    }

    @Test
    void 갈래가_짝_합류가_아닌_곳으로_나간다() {
        // p1 의 두 번째 갈래가 pm 이 아니라 바깥 IF 의 합류 m1 로 간다.
        FlowDefinition f = line(List.of(start(), ifNode("if1"), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"),
                        merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "p1", 1, "X > 0"), other("bo", "if1", "m1"),
                        pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), pe("p1c", "p1", "pm", 3),
                        e("ea", "a", "pm"), e("eb", "b", "m1"), e("ep", "pm", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|갈래가 pm에서 닫히지 않고 m1로 나간다"), issues(f));
    }

    @Test
    void 도달할_수_없는_노드() {
        // x ↔ y 는 개수 규칙을 지키지만 시작에서 닿지 않는다.
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), rule("x", "R_X"), rule("y", "R_Y"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end"), e("e3", "x", "y"), e("e4", "y", "x")));
        assertEquals(List.of("FLOW_STRUCTURE|x|null|x에 도달할 수 없다"), issues(f));
    }
}
```

`flow/FlowTreeTest.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import org.junit.jupiter.api.Test;

/** plan C2 — 노드 관계·펼친 룰 목록. */
class FlowTreeTest {

    private static FlowTree tree(kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition f) {
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        return p.tree();
    }

    @Test
    void IF_의_다른_갈래는_EXCLUSIVE_이고_분기와_갈래_안은_같은_경로() {
        FlowTree t = tree(ifFlow());
        assertEquals(Relation.EXCLUSIVE, t.relation("a", "b"));
        assertEquals(Relation.EXCLUSIVE, t.relation("c", "a"));
        assertEquals(Relation.BEFORE, t.relation("if1", "a"));
        assertEquals(Relation.AFTER, t.relation("b", "if1"));
        assertEquals(Relation.SAME, t.relation("a", "a"));
    }

    @Test
    void 병렬_형제는_PARALLEL_이고_합류_뒤_룰은_모두보다_뒤() {
        FlowTree t = tree(parFlow());
        assertEquals(Relation.PARALLEL, t.relation("a", "b"));
        assertEquals(Relation.BEFORE, t.relation("a", "c"));
        assertEquals(Relation.BEFORE, t.relation("b", "c"));
        assertEquals(Relation.AFTER, t.relation("c", "p1"));
    }

    @Test
    void 중첩에서_바깥_갈래가_먼저_갈린다() {
        FlowTree t = tree(nestedFlow());
        assertEquals(Relation.PARALLEL, t.relation("a", "b"), "a 는 p1 첫 갈래 안의 IF 안, b 는 p1 둘째 갈래");
        assertEquals(Relation.BEFORE, t.relation("if1", "a"));
        assertEquals(Relation.PARALLEL, t.relation("if1", "b"));
    }

    @Test
    void ruleSteps_는_깊이_우선_ruleIds_는_중복_없이() {
        // 같은 룰 R_A 를 두 갈래에 둔다(Review Focus 3).
        var f = flow(List.of(start(), ifNode("if1"), rule("a1", "R_A"), rule("a2", "R_A"), merge("m1", "if1"), rule("c", "R_C"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a1", 1, "X > 0"), other("bo", "if1", "a2"),
                        e("ea1", "a1", "m1"), e("ea2", "a2", "m1"), e("em", "m1", "c"), e("ec", "c", "end")));
        FlowTree t = tree(f);
        assertEquals(List.of("a1", "a2", "c"), t.ruleSteps().stream().map(RuleStep::nodeId).toList());
        assertEquals(List.of("R_A", "R_C"), t.ruleIds());
        assertEquals("start", t.startId());
        assertEquals("end", t.endId());
    }

    @Test
    void 모르는_노드의_관계는_예외() {
        FlowTree t = tree(ifFlow());
        assertThrows(IllegalArgumentException.class, () -> t.relation("a", "nope"));
    }
}
```

`EnginePackageDependencyTest.java` — spi 규칙의 금지 목록에 `"..engine.flow.."` 를 더하고, 두 규칙을 더한다.

```java
    @Test
    void spi_는_EvalEx_와_다른_engine_패키지를_보지_않는다() {
        noClasses().that().resideInAPackage("..engine.spi..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.ezylang..", "..engine.code..", "..engine.expr..", "..engine.rule..", "..engine.domain..",
                        "..engine.flow..")
                .as("spi 는 EvalEx 타입과 다른 engine 패키지를 쓰지 않는다 (06:461·463)")
                .check(ENGINE);
    }

    @Test
    void flow_는_spi_만_본다() {
        noClasses().that().resideInAPackage("..engine.flow..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.ezylang..", "..engine.code..", "..engine.expr..", "..engine.rule..", "..engine.domain..")
                .as("flow 는 spi 만 본다 — 흐름 구조 해석은 식을 평가하지 않는다 (룰 세트 흐름도 plan C2)")
                .check(ENGINE);
    }

    @Test
    void code_expr_domain_은_flow_를_보지_않는다() {
        noClasses().that().resideInAnyPackage("..engine.code..", "..engine.expr..", "..engine.domain..")
                .should().dependOnClassesThat().resideInAPackage("..engine.flow..")
                .as("flow 를 쓰는 것은 rule 뿐이다 (룰 세트 흐름도 plan C2)")
                .check(ENGINE);
    }
```

(클래스 주석의 의존 설명에 "flow 는 spi 만 보고, rule 이 flow 를 본다" 를 한 문장 더한다.)

- [ ] **Step 3: 실패를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --tests '*FlowTreeTest' --console=plain)`
Expected: 컴파일 실패 — `package kr.dongkuk.maru.mdm.engine.flow does not exist`

- [ ] **Step 4: 타입 파일을 만든다**

`flow/package-info.java`:

```java
/**
 * 룰 세트 흐름 구조 해석(룰 세트 흐름도 spec §3, plan C2·C3). 흐름 정의({@code spi.DefinitionLookup.FlowDefinition})를
 * 구조 검사한 뒤 블록 트리({@link kr.dongkuk.maru.mdm.engine.flow.Seq}·{@link kr.dongkuk.maru.mdm.engine.flow.Split})로 바꾸고
 * 노드 사이 관계를 답한다. {@code spi} 만 본다 — 식을 평가하지 않는다. 엔진 {@code rule}(실행)과 mdm 분석기(정적 검사)가 쓴다.
 * m-mdm {@code pages/dme/ruleSetEdit/flow-model.ts} 가 같은 알고리즘·문구를 갖고 {@code rule-set-corpus.json} 이 동치를 고정한다.
 */
package kr.dongkuk.maru.mdm.engine.flow;
```

`flow/FlowIssue.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 구조 오류 하나. {@code code} 는 {@link FlowParser#STRUCTURE} 또는 {@link FlowParser#IF_ELSE}. 문구는 plan C3 표. */
public record FlowIssue(String code, @Nullable String nodeId, @Nullable String edgeId, String message) {}
```

`flow/FlowParse.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 해석 결과. 오류가 있으면 {@code tree} 는 null 이고 {@code issues} 가 비어 있지 않다. */
public record FlowParse(@Nullable FlowTree tree, List<FlowIssue> issues) {}
```

`flow/Block.java`, `Seq.java`, `RuleStep.java`, `Split.java`, `Branch.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

/** 블록 트리 한 칸 — 순차·룰·분기. */
public sealed interface Block permits Seq, RuleStep, Split {}
```

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;

/** 차례로 실행하는 블록들. 빈 목록이면 빈 갈래다. */
public record Seq(List<Block> items) implements Block {}
```

```java
package kr.dongkuk.maru.mdm.engine.flow;

/** RULE 노드 하나. */
public record RuleStep(String nodeId, String ruleId) implements Block {}
```

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 분기 하나와 짝 합류. {@code kind} 는 IF 또는 PARALLEL. {@code branches} 는 실행 순서다 — IF 는 order 오름차순 뒤 그 외,
 * PARALLEL 은 order 오름차순(plan C3).
 */
public record Split(String nodeId, NodeKind kind, String mergeId, List<Branch> branches) implements Block {}
```

```java
package kr.dongkuk.maru.mdm.engine.flow;

import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 갈래 하나 — 나가는 선과 그 갈래의 본문. */
public record Branch(String edgeId, @Nullable String cond, boolean otherwise, @Nullable String label, Seq body) {}
```

- [ ] **Step 5: FlowTree 를 만든다**

`flow/FlowTree.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 구조 검사를 통과한 흐름(plan C2). 블록 트리와, 노드마다 루트에서 지나온 (분기, 갈래 번호) 목록·깊이 우선 순번을 갖는다.
 * {@link FlowParser#parse} 만 만든다.
 */
public final class FlowTree {

    /** 두 노드의 관계. BEFORE = 앞 노드가 같은 경로에서 먼저 실행된다. */
    public enum Relation { SAME, BEFORE, AFTER, EXCLUSIVE, PARALLEL }

    /** 지나온 분기와 그 안의 갈래 번호(실행 순서 0부터). */
    record Frame(String splitId, int branch) {}

    /** 노드 위치 — 지나온 분기 목록과 깊이 우선 순번. */
    record Position(List<Frame> chain, int order) {}

    private final Seq root;
    private final String startId;
    private final String endId;
    private final List<RuleStep> ruleSteps;
    private final Map<String, Position> positions;
    private final Map<String, NodeKind> splitKinds;

    FlowTree(Seq root, String startId, String endId, List<RuleStep> ruleSteps, Map<String, Position> positions,
            Map<String, NodeKind> splitKinds) {
        this.root = root;
        this.startId = startId;
        this.endId = endId;
        this.ruleSteps = List.copyOf(ruleSteps);
        this.positions = Map.copyOf(positions);
        this.splitKinds = Map.copyOf(splitKinds);
    }

    public Seq root() {
        return root;
    }

    public String startId() {
        return startId;
    }

    public String endId() {
        return endId;
    }

    /** 모든 RULE 노드, 깊이 우선(갈래 실행 순서) 순서. */
    public List<RuleStep> ruleSteps() {
        return ruleSteps;
    }

    /** ruleSteps 의 ruleId 를 처음 나온 순서로 중복 없이 — RULE_IDS 로 저장할 목록. */
    public List<String> ruleIds() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        ruleSteps.forEach(s -> ids.add(s.ruleId()));
        return List.copyOf(ids);
    }

    /** 분기가 하나라도 있으면 true. */
    public boolean branched() {
        return !splitKinds.isEmpty();
    }

    /**
     * 두 노드(RULE·IF·PARALLEL)의 관계. 지나온 분기 목록을 앞에서부터 비교해 같은 분기에서 갈래 번호가 처음 달라지면 그
     * 분기 종류로 EXCLUSIVE(IF)·PARALLEL 을 낸다. 달라지는 곳이 없으면 같은 경로이고 깊이 우선 순번으로 BEFORE·AFTER 다.
     *
     * @throws IllegalArgumentException 트리에 없는 노드(START·END·MERGE 포함)
     */
    public Relation relation(String nodeA, String nodeB) {
        if (nodeA.equals(nodeB)) {
            return Relation.SAME;
        }
        Position a = position(nodeA);
        Position b = position(nodeB);
        int n = Math.min(a.chain().size(), b.chain().size());
        for (int i = 0; i < n; i++) {
            Frame fa = a.chain().get(i);
            Frame fb = b.chain().get(i);
            if (!fa.splitId().equals(fb.splitId())) {
                break;
            }
            if (fa.branch() != fb.branch()) {
                return splitKinds.get(fa.splitId()) == NodeKind.IF ? Relation.EXCLUSIVE : Relation.PARALLEL;
            }
        }
        return a.order() < b.order() ? Relation.BEFORE : Relation.AFTER;
    }

    private Position position(String nodeId) {
        Position p = positions.get(nodeId);
        if (p == null) {
            throw new IllegalArgumentException("흐름 트리에 없는 노드: " + nodeId);
        }
        return p;
    }

    static List<Frame> extend(List<Frame> chain, String splitId, int branch) {
        List<Frame> out = new ArrayList<>(chain);
        out.add(new Frame(splitId, branch));
        return List.copyOf(out);
    }
}
```

- [ ] **Step 6: FlowParser 를 만든다**

`flow/FlowParser.java`:

```java
package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Frame;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Position;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 흐름 구조 검사와 블록 트리 만들기(plan C3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면 트리를 만들지 않는다.
 * 2단계(트리 만들기)는 첫 오류에서 멈춘다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";

    private FlowParser() {}

    /** ruleIds 순서의 한 줄 흐름. 노드 "start", "r1".."rN", "end", 선 "e1".."e(N+1)". */
    public static FlowDefinition linear(List<String> ruleIds) {
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null));
        String prev = "start";
        for (int i = 0; i < ruleIds.size(); i++) {
            String id = "r" + (i + 1);
            nodes.add(new FlowNode(id, NodeKind.RULE, ruleIds.get(i), null, null));
            edges.add(new FlowEdge("e" + (i + 1), prev, id, null, null, false, null));
            prev = id;
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null));
        edges.add(new FlowEdge("e" + (ruleIds.size() + 1), prev, "end", null, null, false, null));
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    public static FlowParse parse(FlowDefinition flow) {
        List<FlowIssue> issues = new ArrayList<>();
        Map<String, FlowNode> byId = new LinkedHashMap<>();
        // a — 노드 ID 중복
        for (FlowNode n : flow.nodes()) {
            if (byId.containsKey(n.id())) {
                issues.add(structure(n.id(), null, "노드 ID " + n.id() + "가 겹친다"));
            } else {
                byId.put(n.id(), n);
            }
        }
        // b1·b2 — 시작·끝 개수
        long starts = byId.values().stream().filter(n -> n.kind() == NodeKind.START).count();
        long ends = byId.values().stream().filter(n -> n.kind() == NodeKind.END).count();
        if (starts != 1) {
            issues.add(structure(null, null, "시작 노드가 " + starts + "개다. 정확히 1개여야 한다"));
        }
        if (ends != 1) {
            issues.add(structure(null, null, "끝 노드가 " + ends + "개다. 정확히 1개여야 한다"));
        }
        // c — 없는 노드를 가리키는 선(걸린 선은 개수 계산에서 뺀다)
        Map<String, List<FlowEdge>> in = new HashMap<>();
        Map<String, List<FlowEdge>> out = new HashMap<>();
        for (FlowEdge e : flow.edges()) {
            boolean ok = true;
            if (!byId.containsKey(e.from())) {
                issues.add(structure(e.from(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.from() + "를 가리킨다"));
                ok = false;
            }
            if (!byId.containsKey(e.to())) {
                issues.add(structure(e.to(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.to() + "를 가리킨다"));
                ok = false;
            }
            if (ok) {
                out.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e);
                in.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e);
            }
        }
        // d1·d2·e·f1 — 노드별
        for (FlowNode n : byId.values()) {
            int i = in.getOrDefault(n.id(), List.of()).size();
            int o = out.getOrDefault(n.id(), List.of()).size();
            degree(issues, n.id(), "들어오는", i, inRule(n.kind()));
            degree(issues, n.id(), "나가는", o, outRule(n.kind()));
            if (n.kind() == NodeKind.RULE && blank(n.ruleId())) {
                issues.add(structure(n.id(), null, "룰 노드 " + n.id() + "에 룰 ID가 없다"));
            }
            if (n.kind() == NodeKind.MERGE) {
                FlowNode s = n.splitId() == null ? null : byId.get(n.splitId());
                if (s == null || (s.kind() != NodeKind.IF && s.kind() != NodeKind.PARALLEL)) {
                    issues.add(structure(n.id(), null, "합류 " + n.id() + "의 짝 분기 " + (n.splitId() == null ? "-" : n.splitId()) + "가 없다"));
                }
            }
        }
        // f2·g1..g5 — 분기별
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.IF && n.kind() != NodeKind.PARALLEL) {
                continue;
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && n.id().equals(m.splitId())).count();
            if (merges != 1) {
                issues.add(structure(n.id(), null, "분기 " + n.id() + "를 닫는 합류가 " + merges + "개다. 정확히 1개여야 한다"));
            }
            List<FlowEdge> outs = out.getOrDefault(n.id(), List.of());
            List<FlowEdge> ordered = new ArrayList<>();
            if (n.kind() == NodeKind.IF) {
                long others = outs.stream().filter(FlowEdge::otherwise).count();
                if (others != 1) {
                    issues.add(new FlowIssue(IF_ELSE, n.id(), null, "IF " + n.id() + "에 \"그 외\" 갈래가 " + others + "개다. 정확히 1개여야 한다"));
                }
                for (FlowEdge e : outs) {
                    if (!e.otherwise() && blank(e.cond())) {
                        issues.add(new FlowIssue(IF_ELSE, n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "에 조건식이 없다"));
                    }
                }
                outs.stream().filter(e -> !e.otherwise()).forEach(ordered::add);
            } else {
                for (FlowEdge e : outs) {
                    if (!blank(e.cond()) || e.otherwise()) {
                        issues.add(structure(n.id(), e.id(), "병렬 분기 " + n.id() + "의 갈래 " + e.id() + "에는 조건을 둘 수 없다"));
                    }
                }
                ordered.addAll(outs);
            }
            for (FlowEdge e : ordered) {
                if (e.order() == null) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 " + e.id() + "에 순서가 없다"));
                }
            }
            Set<Integer> seen = new HashSet<>();
            for (FlowEdge e : ordered) {
                if (e.order() != null && !seen.add(e.order())) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 순서 " + e.order() + "가 겹친다"));
                }
            }
        }
        if (!issues.isEmpty()) {
            return new FlowParse(null, List.copyOf(issues));
        }
        try {
            return new FlowParse(new Builder(byId, out).build(), List.of());
        } catch (Stop s) {
            return new FlowParse(null, List.of(s.issue));
        }
    }

    // ------------------------------------------------------------------ 2단계

    /** 첫 오류에서 멈추려고 던진다. */
    private static final class Stop extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final transient FlowIssue issue;

        Stop(FlowIssue issue) {
            super(issue.message(), null, false, false);
            this.issue = issue;
        }
    }

    private static final class Builder {
        final Map<String, FlowNode> nodes;
        final Map<String, List<FlowEdge>> out;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
        int order;

        Builder(Map<String, FlowNode> nodes, Map<String, List<FlowEdge>> out) {
            this.nodes = nodes;
            this.out = out;
            for (FlowNode n : nodes.values()) {
                if (n.kind() == NodeKind.MERGE) {
                    mergeOf.put(n.splitId(), n.id());
                }
            }
        }

        FlowTree build() {
            FlowNode start = nodes.values().stream().filter(n -> n.kind() == NodeKind.START).findFirst().orElseThrow();
            FlowNode end = nodes.values().stream().filter(n -> n.kind() == NodeKind.END).findFirst().orElseThrow();
            visited.add(start.id());
            Seq root = seq(next(start.id()), end.id(), List.of());
            visited.add(end.id());
            for (FlowNode n : nodes.values()) {
                if (!visited.contains(n.id())) {
                    throw new Stop(structure(n.id(), null, n.id() + "에 도달할 수 없다"));
                }
            }
            return new FlowTree(root, start.id(), end.id(), steps, positions, splitKinds);
        }

        Seq seq(String cur, String stop, List<Frame> chain) {
            List<Block> items = new ArrayList<>();
            while (!cur.equals(stop)) {
                FlowNode n = nodes.get(cur);
                if (visited.contains(cur)) {
                    throw new Stop(structure(cur, null, cur + "를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"));
                }
                if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                    throw new Stop(structure(cur, null, "갈래가 " + stop + "에서 닫히지 않고 " + cur + "로 나간다"));
                }
                visited.add(cur);
                positions.put(cur, new Position(chain, order++));
                if (n.kind() == NodeKind.RULE) {
                    RuleStep s = new RuleStep(cur, n.ruleId());
                    items.add(s);
                    steps.add(s);
                    cur = next(cur);
                    continue;
                }
                String mergeId = mergeOf.get(cur);
                splitKinds.put(cur, n.kind());
                List<FlowEdge> ordered = ordered(n.kind(), out.get(cur));
                List<Branch> branches = new ArrayList<>();
                for (int b = 0; b < ordered.size(); b++) {
                    FlowEdge e = ordered.get(b);
                    branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), seq(e.to(), mergeId, FlowTree.extend(chain, cur, b))));
                }
                visited.add(mergeId);
                items.add(new Split(cur, n.kind(), mergeId, List.copyOf(branches)));
                cur = next(mergeId);
            }
            return new Seq(List.copyOf(items));
        }

        String next(String nodeId) {
            return out.get(nodeId).get(0).to();
        }

        /** IF: 그 외가 아닌 선 order 오름차순 뒤 그 외. PARALLEL: order 오름차순. */
        static List<FlowEdge> ordered(NodeKind kind, List<FlowEdge> edges) {
            List<FlowEdge> main = new ArrayList<>(edges.stream().filter(e -> !e.otherwise()).toList());
            main.sort(Comparator.comparingInt(FlowEdge::order));
            if (kind == NodeKind.IF) {
                edges.stream().filter(FlowEdge::otherwise).forEach(main::add);
            }
            return main;
        }
    }

    // ------------------------------------------------------------------ 도우미

    /** 개수 규칙: 0 = 없어야, 1 = 1개, 2 = 2개 이상. */
    private static int inRule(NodeKind k) {
        return switch (k) {
            case START -> 0;
            case MERGE -> 2;
            default -> 1;
        };
    }

    private static int outRule(NodeKind k) {
        return switch (k) {
            case END -> 0;
            case IF, PARALLEL -> 2;
            default -> 1;
        };
    }

    private static void degree(List<FlowIssue> issues, String id, String dir, int n, int rule) {
        boolean ok = rule == 2 ? n >= 2 : n == rule;
        if (!ok) {
            String text = rule == 0 ? "없어야 한다" : rule == 1 ? "1개여야 한다" : "2개 이상이어야 한다";
            issues.add(structure(id, null, id + "의 " + dir + " 선이 " + n + "개다. " + text));
        }
    }

    private static FlowIssue structure(String nodeId, String edgeId, String message) {
        return new FlowIssue(STRUCTURE, nodeId, edgeId, message);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
```

주의: 노드 ID 가 겹치면 `byId` 가 첫 노드만 담으므로 b1·b2 개수, c 의 노드 찾기, d~g 순회, 트리 만들기가 모두 첫 노드만 본다(머리말 C3). 1단계 d 검사 뒤에는 START·END 가 정확히 1개이고 모든 노드의 나가는 선 개수가 맞으므로 `next()`·`mergeOf` 조회는 비지 않는다. 방문하지 않은 노드 검사에서 START·END 는 이미 visited 에 있어 자연히 빠진다.

- [ ] **Step 7: 통과를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*FlowParserTest' --tests '*FlowTreeTest' --tests '*EnginePackageDependencyTest' --tests '*MaruMdmEngineArchitectureTest' --console=plain)`
Expected: PASS. 문구 테스트가 틀리면 구현이 아니라 C3 표와 대조해 어느 쪽이 표와 다른지 먼저 본다(표가 정본이다).

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS(엔진 전체)

- [ ] **Step 8: 계약 문서 §2 를 고치고 커밋한다**

`docs/mdm/engine-contract.md` §2 표의 `engine.rule` 행 바로 앞에 행을 넣고, `engine.rule` 행의 "볼 수 있는 패키지"를 `expr`, `spi`, `flow` 로 고친다.

```markdown
| `engine.flow` | `FlowParser`, `FlowTree`, `FlowParse`, `FlowIssue`, `Seq`·`RuleStep`·`Split`·`Branch` | 룰 세트 흐름 구조 검사·블록 트리·노드 관계(룰 세트 흐름도 plan C2·C3) | `spi`. EvalEx 를 쓰지 않는다 |
```

표 아래 첫 불릿 끝에 "`flow` 는 `spi` 만 보고, `flow` 를 보는 것은 `rule` 뿐이다(`EnginePackageDependencyTest`)." 를 덧붙인다.

```bash
git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/flow \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/flow \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/FlowFixtures.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/EnginePackageDependencyTest.java \
  docs/mdm/engine-contract.md
git commit -m "feat(mdm-engine): 룰 세트 흐름 구조 검사와 블록 트리(flow 패키지)

IF·병렬 분기를 짝 합류로 닫는 중첩 블록 구조를 검사하고 블록 트리와
노드 관계(BEFORE·AFTER·EXCLUSIVE·PARALLEL)를 만든다. 문구·순서는 plan C3.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 5: 엔진 흐름 실행과 path

**모델:** opus

`evaluateSet` 을 블록 트리 실행으로 바꾼다(C5). IF 갈래 선택·병렬 사본 실행·갈래별 입력 키 검사·`path`·`warnings`·새 단계·코드를 더한다. 한 줄 흐름은 결과가 바뀌지 않는다. 기록(`traceSet`)은 Task 7 이다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java`
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/BranchCondition.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:44-141`(생성자·`evaluateSet`·`missingInputKeys` 삭제)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java:26-41`(Stage·Code)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineWarning.java:15-20`(Code)
- Modify: 스키마 json(`PathStep` 추가, `RuleSetResult`·`ErrorCode`·`ViolationStage`·`EngineWarningCode` 갱신)
- Create(Test 도우미): `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/FlowRules.java`
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetFlowEvaluationTest.java`
- Test(Modify): `EngineContractSchemaTest.java`(R15), `ContractTypeShapeTest.java`(CONTRACT_TYPES), `m-mdm/tests/engine-contract.generated.test.ts`(EXPECTED_EXPORTS)
- Regenerate: `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`
- Modify: `docs/mdm/engine-contract.md` §8

**Interfaces:**
- Consumes: Task 1 타입, Task 4 `FlowParser`·`FlowTree`·`Seq`·`RuleStep`·`Split`·`Branch`, `testsupport.FlowFixtures`
- Produces:
  - `record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String,Object> finalValues, List<PathStep> path, List<EngineWarning> warnings)` + 중첩 `record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex)`
  - `Stage.BRANCH_SELECT`, `Code.BRANCH_EVAL_ERROR`, `Code.FLOW_INVALID`, `EngineWarning.Code.BRANCH_COND_NULL`
  - 패키지 전용(Task 7 이 쓴다): `final class FlowRun`(생성자 `FlowRun(RuleEvaluator, ExpressionRunner, FlowTree, Map<String,RuleDefinition>, FlowKeys, Map<String,Object> record, Instant ts)`, `void run()`, 필드 `steps`·`path`·`warnings`·`finalValues`), `final class FlowKeys`(`FlowKeys(Map<String,RuleDefinition>, MdmEvaluator)`, `List<Violation> check(Seq, Set<String>)`, `List<String> deferred(String nodeId)`, `static List<String> needed(RuleDefinition)`, `static Violation missing(String ruleId, String name)`), `final class BranchCondition`(`static BranchCondition test(ExpressionRunner, String, Map<String,Object>, Instant)`, 필드 `int outcome`·`String message`, 상수 `TRUE=1, FALSE=0, NULL=2, ERROR=-1`), `MdmRuleEngine` 의 `private Prepared prepare(RuleSetDefinition, Map<String,Object>, Instant)`
  - 테스트 도우미 `rule.fixture.FlowRules`: `calc(String ruleId, String result, String expr, String... inputs)`, `lookup(RuleDefinition...)`, 상수 `FROM`

- [ ] **Step 1: 테스트 도우미를 만든다**

`rule/fixture/FlowRules.java`:

```java
package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vt;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/** 흐름 실행 테스트용 계산 룰(DERIVE 한 행, 결과 하나). 평가 시각은 {@link SampleRules#EVAL_TS}. */
public final class FlowRules {

    public static final LocalDateTime FROM = LocalDateTime.of(2026, 9, 1, 0, 0);

    private FlowRules() {}

    /** {@code result = expr}. {@code inputs} 는 행 계약의 필수 입력(NUMBER) — 세트 입력 키 검사가 본다. */
    public static RuleDefinition calc(String ruleId, String result, String exprText, String... inputs) {
        List<VarType> required = new ArrayList<>();
        for (String in : inputs) {
            required.add(vt(in, DataType.NUMBER));
        }
        return CellTextGenerator.withTexts(derive(ruleId, 1, FROM,
                List.of(resultVar(1, DispType.EXPRESSION, result, DataType.NUMBER, 1)),
                contract(List.of(), rowContract(1, List.copyOf(required))),
                row(1, 1, 1, expr(exprText))), d -> null);
    }

    public static InMemoryDefinitionLookup lookup(RuleDefinition... rules) {
        return new InMemoryDefinitionLookup().add(rules);
    }
}
```

(`InMemoryDefinitionLookup` 에 공개 생성자가 있는지 먼저 확인한다. 없으면 `SampleRules.lookup()` 처럼 `new InMemoryDefinitionLookup()` 을 쓰는 곳을 따라 한다 — 지금 파일은 암묵 기본 생성자를 쓴다.)

- [ ] **Step 2: 실패하는 실행 테스트를 쓴다**

`rule/RuleSetFlowEvaluationTest.java`:

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 룰 세트 흐름 실행(spec §4·§11 엔진 단위 테스트, plan C5). 한 줄 흐름 회귀는 RuleSetEvaluationTest·SampleRuleSetValueTest 가 본다. */
class RuleSetFlowEvaluationTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_A10", "A", "X + 10", "X"), calc("R_SUM", "S", "A + B", "A", "B"), calc("R_BA", "B", "A + 1", "A"),
            calc("R_Y", "YY", "Y + 1", "Y"), calc("R_D", "D", "A + 1", "A"), calc("R_ERR", "E", "X / 0", "X"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return engine.evaluateSet("S", record, SampleRules.EVAL_TS);
    }

    private EngineEvaluationException fail(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet("S", record, SampleRules.EVAL_TS));
    }

    private static List<String> path(RuleSetResult r) {
        return r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.chosenEdgeId() + ":" + p.stepIndex()).toList();
    }

    /** start → if1 [b1 cond1 → a(R_A)] [b2 cond2 → b(R_B)] [그 외 → c(R_C)] → m1 → end. */
    private static FlowDefinition ifFlow(String cond1, String cond2) {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, cond1), br("b2", "if1", "b", 2, cond2),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    /** start → p1 [1 → a(ruleA)] [2 → b(ruleB)] → pm → (after 가 있으면 s(after)) → end. */
    private static FlowDefinition parFlow(String ruleA, String ruleB, String after) {
        var nodes = new java.util.ArrayList<>(List.of(start(), par("p1"), rule("a", ruleA), rule("b", ruleB), merge("pm", "p1"), end()));
        var edges = new java.util.ArrayList<>(List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2),
                e("ea", "a", "pm"), e("eb", "b", "pm")));
        if (after == null) {
            edges.add(e("ee", "pm", "end"));
        } else {
            nodes.add(rule("s", after));
            edges.add(e("ep", "pm", "s"));
            edges.add(e("es", "s", "end"));
        }
        return flow(nodes, edges);
    }

    // ── 한 줄 흐름 path ──

    @Test
    void 한_줄_흐름은_start_r1_rN_end_path_와_stepIndex() {
        lookup.add(SampleRules.all().toArray(new kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition[0]));
        lookup.addSet(SampleRules.lsA3());
        RuleSetResult r = engine.evaluateSet("LS_A3", rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A",
                "COAT_SIDE", "1", "COIL_WID", new BigDecimal("1250")), SampleRules.EVAL_TS);
        assertEquals(List.of("start:START:null:null", "r1:RULE:null:0", "r2:RULE:null:1", "r3:RULE:null:2", "end:END:null:null"), path(r));
        assertEquals(List.of(), r.warnings());
    }

    // ── IF ──

    @Test
    void IF_는_처음_참인_갈래_하나만_실행한다() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("20")));
        assertEquals(List.of("R_A"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("21", r.finalValues().get("A"));
        assertEquals(List.of("start:START:null:null", "if1:IF:b1:null", "a:RULE:null:0", "m1:MERGE:null:null", "end:END:null:null"), path(r));
    }

    @Test
    void 앞_갈래가_거짓이면_다음_참인_갈래() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("R_B"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("b2", r.path().get(1).chosenEdgeId());
    }

    @Test
    void 참이_없으면_그_외_갈래() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_C"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("bo", r.path().get(1).chosenEdgeId());
    }

    @Test
    void 조건식_NULL_은_거짓이고_BRANCH_COND_NULL_경고() {
        RuleSetResult r = run(ifFlow("FLAG", "X > 0"), rec("X", new BigDecimal("5"), "FLAG", null));
        assertEquals("b2", r.path().get(1).chosenEdgeId());
        assertEquals(1, r.warnings().size());
        EngineWarning w = r.warnings().get(0);
        assertEquals(EngineWarning.Code.BRANCH_COND_NULL, w.code());
        assertEquals("IF if1 갈래 b1 조건식 결과가 NULL 이라 거짓으로 봤다", w.message());
    }

    @Test
    void 조건식이_불린이_아니면_BRANCH_SELECT_BRANCH_EVAL_ERROR() {
        EngineEvaluationException e = fail(ifFlow("X + 1", "X > 0"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), violations(e));
    }

    @Test
    void 구조가_틀린_흐름은_SET_CHECK_FLOW_INVALID() {
        FlowDefinition noElse = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        EngineEvaluationException e = fail(noElse, rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/FLOW_INVALID/null/null/if1"), violations(e));
        assertEquals("세트 S 의 흐름이 올바르지 않다: IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다", e.violations().get(0).message());
    }

    // ── 입력 키 ──

    @Test
    void 조건식_변수가_레코드에_없으면_세트_시작_전_MISSING_KEY() {
        EngineEvaluationException e = fail(ifFlow("Z > 0", "X > 0"), rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/null/null/Z"), violations(e));
    }

    @Test
    void 타지_않는_갈래의_입력이_없어도_세트는_실패하지_않는다() {
        // b1 갈래의 R_Y 는 Y 가 필요하다. X=-1 이면 그 외(R_C)로 가므로 Y 가 없어도 된다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("y", "R_Y"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "y", 1, "X > 0"), other("bo", "if1", "c"),
                        e("ey", "y", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_C"), r.steps().stream().map(RuleResult::ruleId).toList());

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("20")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_Y/null/Y"), violations(e), "갈래에 들어갈 때 그 갈래 키를 본다");
    }

    @Test
    void IF_합류_뒤_일부_갈래_변수는_실행_직전에_본다() {
        // b1 → a(R_A: A) / 그 외 → 빈 갈래 / 합류 뒤 d(R_D: A 를 읽음)
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"),
                        e("ea", "a", "m1"), e("em", "m1", "d"), e("ed", "d", "end")));
        RuleSetResult ok = run(f, rec("X", new BigDecimal("5")));
        assertNum("7", ok.finalValues().get("D"));

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("-5")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_D/null/A"), violations(e), "그 외(빈 갈래)를 타면 A 가 없다");

        RuleSetResult withA = run(f, rec("X", new BigDecimal("-5"), "A", new BigDecimal("100")));
        assertNum("101", withA.finalValues().get("D"), "레코드가 A 를 주면 통과");
    }

    // ── 병렬 ──

    @Test
    void 병렬은_order_순으로_하나씩_실행하고_합류_뒤_결과를_합친다() {
        RuleSetResult r = run(parFlow("R_A", "R_B", "R_SUM"), rec("X", BigDecimal.ONE));
        assertEquals(List.of("R_A", "R_B", "R_SUM"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("5", r.finalValues().get("S"));
        assertEquals(List.of("start:START:null:null", "p1:PARALLEL:null:null", "a:RULE:null:0", "b:RULE:null:1",
                "pm:MERGE:null:null", "s:RULE:null:2", "end:END:null:null"), path(r));
    }

    @Test
    void 병렬_갈래는_형제_결과를_보지_않고_분기_직전_값을_본다() {
        // 둘째 갈래 R_BA(B = A + 1)는 첫 갈래의 A(X+1=2)가 아니라 레코드의 A(100)를 본다.
        RuleSetResult r = run(parFlow("R_A", "R_BA", null), rec("X", BigDecimal.ONE, "A", new BigDecimal("100")));
        assertNum("101", r.finalValues().get("B"));
        assertNum("2", r.finalValues().get("A"), "합류 뒤에는 첫 갈래 결과가 ctx 에 들어간다");

        EngineEvaluationException e = fail(parFlow("R_A", "R_BA", null), rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_BA/null/A"), violations(e), "형제 결과는 입력으로 치지 않는다");
    }

    @Test
    void 병렬_형제가_같은_이름을_쓰면_뒤_갈래가_이기고_늘_같다() {
        // Review Focus 5 — 정적 검사를 거치지 않은 흐름도 결정적이다.
        FlowDefinition f = parFlow("R_A", "R_A10", null);
        RuleSetResult first = run(f, rec("X", BigDecimal.ONE));
        RuleSetResult second = run(f, rec("X", BigDecimal.ONE));
        assertNum("11", first.finalValues().get("A"));
        assertEquals(first.finalValues(), second.finalValues());
        assertEquals(first.path(), second.path());
    }

    // ── 중첩·빈 갈래·같은 룰 ──

    @Test
    void 병렬_안의_IF() {
        FlowDefinition f = kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow();
        RuleSetResult in = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("R_A", "R_B"), in.steps().stream().map(RuleResult::ruleId).toList());
        RuleSetResult out = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_B"), out.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("bo", out.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow().chosenEdgeId());
    }

    @Test
    void 빈_갈래_두_개인_IF() {
        // Review Focus 6
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "m1", 1, "X > 0"), other("bo", "if1", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of(), r.steps());
        assertEquals(List.of("start:START:null:null", "if1:IF:b1:null", "m1:MERGE:null:null", "end:END:null:null"), path(r));
    }

    @Test
    void 같은_룰이_두_갈래에_있으면_조회는_한_번_stepIndex_는_탄_노드() {
        // Review Focus 3
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a1", "R_A"), rule("a2", "R_A"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a1", 1, "X > 0"), other("bo", "if1", "a2"),
                        e("e1", "a1", "m1"), e("e2", "a2", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of(new PathStep("a2", NodeKind.RULE, null, 0)),
                r.path().stream().filter(p -> p.kind() == NodeKind.RULE).toList());
        assertEquals(1, lookup.ruleCalls().stream().filter("R_A"::equals).count());
    }

    @Test
    void 룰_실행_오류는_지금처럼_세트를_멈춘다() {
        FlowDefinition f = flow(List.of(start(), rule("x", "R_ERR"), end()), List.of(e("e1", "start", "x"), e("e2", "x", "end")));
        assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", BigDecimal.ONE)));
    }
}
```

(`R_ERR` 의 `X / 0` 이 EvalEx 에서 평가 오류가 되는지 Step 4 실행 때 확인한다. 오류가 아니라 값이 나오면 식을 `SQRT(-1)` 처럼 이 설정에서 오류가 나는 식으로 바꾸고 Task 7 의 같은 룰도 함께 바꾼다.)

계약 테스트 몫:
- `EngineContractSchemaTest.RECORDS` 에 `new RecordPair("R15", RuleSetResult.PathStep.class, "PathStep", Set.of(), Set.of())` 를 더한다(R14 다음).
- `ContractTypeShapeTest.CONTRACT_TYPES` 의 `"rule.RuleSetResult",` 를 `"rule.RuleSetResult", "rule.RuleSetResult$PathStep",` 로 바꾼다.
- `engine-contract.generated.test.ts` 의 `EXPECTED_EXPORTS` 에 `"PathStep",` 를 더하고 주석 개수를 `(44개)` 로 고친다.

- [ ] **Step 3: 실패를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*RuleSetFlowEvaluationTest' --console=plain)`
Expected: 컴파일 실패 — `cannot find symbol: class PathStep`, `method path()`, `BRANCH_COND_NULL`

- [ ] **Step 4: 계약 타입을 고친다**

`RuleSetResult.java` 전체:

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 판정 결과 — 룰마다 중간 결과와 최종 ctx(06-business-rule.md:429, wbs TSK-03-03 "최종·중간 결과 반환"),
 * 흐름에서 방문한 노드(룰 세트 흐름도 spec §4.1)와 세트 경고.
 *
 * @param steps       실행 순서대로 룰마다 결과(실제로 실행한 룰만)
 * @param finalValues 마지막 룰 뒤 결과 변수 전체(입력 레코드 키는 뺀다)
 * @param path        방문한 노드(START·RULE·IF·PARALLEL·MERGE·END) 순서
 * @param warnings    세트 경고 — IF 조건식 NULL({@code BRANCH_COND_NULL}). 룰 경고는 steps 의 RuleResult 에 있다
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings) {

    /**
     * 방문한 노드 하나.
     *
     * @param chosenEdgeId IF 에서 고른 선. 그 밖은 null
     * @param stepIndex    RULE 이면 그 결과가 {@code steps} 의 몇 번째인지. 그 밖은 null
     */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex) {}
}
```

`EngineEvaluationException.java` 의 enum 두 개:

```java
    /** 06:212-217 의 네 단계 + 세트 사전 검사 + IF 갈래 고르기(룰 세트 흐름도). */
    public enum Stage { SET_CHECK, INPUT_CHECK, ROW_SELECT, RESULT_CHECK, RESULT_EVAL, BRANCH_SELECT }

    public enum Code {
        RULE_NOT_FOUND,
        SET_NOT_FOUND,
        SET_DEPRECATED,
        MISSING_KEY,
        REQUIRED_NULL,
        TYPE_CONVERSION,
        CONSTANT_KEY,
        RESERVED_KEY,
        EVAL_TS_KEY,
        UNIQUE_MULTIPLE_HITS,
        ANY_CONFLICT,
        EVALUATION_ERROR,
        /** IF 갈래 조건식이 불린이 아니거나 평가에 실패했다. */
        BRANCH_EVAL_ERROR,
        /** 세트 흐름이 구조 검사를 통과하지 못했다(plan D5). */
        FLOW_INVALID
    }
```

`EngineWarning.java` 의 `Code`:

```java
    public enum Code {
        /** Expression 조건 셀 결과가 NULL — 그 셀만 거짓으로 봤다. */
        EXPR_CELL_NULL,
        /** 결과 열 그룹 열 조건 결과가 NULL — 그 열만 거짓으로 봤다. */
        GRP_COND_NULL,
        /** IF 갈래 조건식 결과가 NULL — 그 갈래를 거짓으로 봤다(룰 세트 흐름도). */
        BRANCH_COND_NULL
    }
```

스키마 json:
- `"ErrorCode"` 의 enum 끝에 `"BRANCH_EVAL_ERROR", "FLOW_INVALID"` 를 더한다.
- `"ViolationStage"` 의 enum 끝에 `"BRANCH_SELECT"` 를 더한다.
- `"EngineWarningCode"` 의 enum 을 `["EXPR_CELL_NULL", "GRP_COND_NULL", "BRANCH_COND_NULL"]` 로 바꾼다.
- `"RuleSetResult"` 를 아래로 바꾸고, 바로 뒤에 `"PathStep"` 을 넣는다.

```json
    "RuleSetResult": {
      "description": "룰 세트 판정 결과(Java RuleSetResult, 06:429 + 룰 세트 흐름도 spec §4.1). steps 는 실행한 룰마다 결과, finalValues 는 마지막 룰 뒤 결과 변수 전체, path 는 방문한 노드, warnings 는 세트 경고(BRANCH_COND_NULL).",
      "type": "object",
      "properties": {
        "setId": { "type": "string" },
        "evalTs": { "$ref": "#/$defs/LocalDateTime" },
        "steps": { "type": "array", "items": { "$ref": "#/$defs/RuleResult" } },
        "finalValues": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "path": { "type": "array", "items": { "$ref": "#/$defs/PathStep" } },
        "warnings": { "type": "array", "items": { "$ref": "#/$defs/EngineWarning" } }
      },
      "required": ["setId", "evalTs", "steps", "finalValues", "path", "warnings"],
      "additionalProperties": false
    },
    "PathStep": {
      "description": "세트에서 방문한 노드 하나(Java RuleSetResult.PathStep). chosenEdgeId 는 IF 에서 고른 선, stepIndex 는 RULE 결과의 steps 자리.",
      "type": "object",
      "properties": {
        "nodeId": { "type": "string" },
        "kind": { "$ref": "#/$defs/FlowNodeKind" },
        "chosenEdgeId": { "type": ["string", "null"] },
        "stepIndex": { "type": ["integer", "null"] }
      },
      "required": ["nodeId", "kind", "chosenEdgeId", "stepIndex"],
      "additionalProperties": false
    },
```

- [ ] **Step 5: 조건식 판정 클래스를 만든다**

`rule/BranchCondition.java`:

```java
package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * IF 갈래 조건식 판정(룰 세트 흐름도 spec §4 "조건식 평가", plan C5). {@code RuleEvaluator.test} 와 같은 값 맵(ctx + EVAL_TS)·
 * 같은 평가 경로({@link ExpressionRunner#run})·같은 NULL 규칙을 쓴다. 이 패키지에는 record·enum 을 두지 않는다
 * (EngineContractSchemaTest) — 결과는 정수 상수다.
 */
final class BranchCondition {

    static final int FALSE = 0;
    static final int TRUE = 1;
    static final int NULL = 2;
    static final int ERROR = -1;

    final int outcome;
    /** ERROR 일 때 원인 문구. 그 밖은 null. */
    final String message;

    private BranchCondition(int outcome, String message) {
        this.outcome = outcome;
        this.message = message;
    }

    static BranchCondition test(ExpressionRunner runner, String text, Map<String, Object> ctx, Instant evalTs) {
        Map<String, Object> values = new LinkedHashMap<>(ctx);
        values.put(ReservedNames.EVAL_TS, evalTs);
        EvaluationValue v;
        try {
            v = runner.run(text, values, evalTs);
        } catch (ExpressionFailure f) {
            return new BranchCondition(ERROR, "식 '" + text + "' 평가 오류: " + f.getMessage());
        }
        if (v.isNullValue()) {
            return new BranchCondition(NULL, null);
        }
        if (!v.isBooleanValue()) {
            return new BranchCondition(ERROR, "식 '" + text + "' 결과가 불린이 아니다: " + v.getDataType());
        }
        return new BranchCondition(v.getBooleanValue() ? TRUE : FALSE, null);
    }
}
```

- [ ] **Step 6: 입력 키 검사 클래스를 만든다**

`rule/FlowKeys.java`:

```java
package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 흐름 입력 키 검사(spec §4 "입력 키 사전 검사", plan C5). {@link #check} 는 seq 의 반드시 실행되는 부분만 본다 — IF 갈래 안은
 * 그 갈래에 들어갈 때 다시 부르고, IF 일부 갈래에서만 만들어지는 이름은 그 룰의 지연 목록({@link #deferred})에 넣어 실행 직전에 본다.
 * 병렬 갈래는 분기 직전 값만 보므로 형제 결과를 입력으로 치지 않는다.
 */
final class FlowKeys {

    private final Map<String, RuleDefinition> defs;
    private final MdmEvaluator expressions;
    private final Map<String, List<String>> deferred = new HashMap<>();

    FlowKeys(Map<String, RuleDefinition> defs, MdmEvaluator expressions) {
        this.defs = defs;
        this.expressions = expressions;
    }

    /** 이 RULE 노드를 실행하기 직전에 ctx 에 있어야 하는 이름. */
    List<String> deferred(String nodeId) {
        return deferred.getOrDefault(nodeId, List.of());
    }

    List<Violation> check(Seq seq, Set<String> available) {
        List<Violation> out = new ArrayList<>();
        walk(seq, available, new HashSet<>(), new HashSet<>(), new HashSet<>(), out);
        return out;
    }

    private void walk(Seq seq, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported, List<Violation> out) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> {
                    RuleDefinition def = defs.get(r.ruleId());
                    if (def == null) {
                        continue;
                    }
                    List<String> later = new ArrayList<>();
                    for (String name : needed(def)) {
                        if (available.contains(name) || sure.contains(name)) {
                            continue;
                        }
                        if (maybe.contains(name)) {
                            if (!later.contains(name)) {
                                later.add(name);
                            }
                            continue;
                        }
                        if (reported.add(name)) {
                            out.add(missing(def.ruleId(), name));
                        }
                    }
                    if (!later.isEmpty()) {
                        deferred.put(r.nodeId(), List.copyOf(later));
                    }
                    List<String> results = RuleEvaluator.resultNames(def);
                    sure.addAll(results);
                    maybe.removeAll(results);
                }
                case Split s when s.kind() == NodeKind.IF -> {
                    for (Branch br : s.branches()) {
                        if (br.otherwise()) {
                            continue;
                        }
                        for (String name : condVars(br.cond())) {
                            if (available.contains(name) || sure.contains(name) || maybe.contains(name)) {
                                continue;
                            }
                            if (reported.add(name)) {
                                out.add(new Violation(Stage.SET_CHECK, Code.MISSING_KEY, null, null, name,
                                        "세트 입력 키가 레코드에 없다: " + name + " (IF " + s.nodeId() + ")"));
                            }
                        }
                    }
                    Set<String> inter = null;
                    Set<String> any = new HashSet<>();
                    for (Branch br : s.branches()) {
                        Set<String> made = sureProduced(br.body());
                        if (inter == null) {
                            inter = new HashSet<>(made);
                        } else {
                            inter.retainAll(made);
                        }
                        any.addAll(allProduced(br.body()));
                    }
                    sure.addAll(inter);
                    maybe.removeAll(inter);
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
                case Split s -> {
                    Set<String> union = new HashSet<>();
                    Set<String> any = new HashSet<>();
                    for (Branch br : s.branches()) {
                        walk(br.body(), available, new HashSet<>(sure), new HashSet<>(maybe), reported, out);
                        union.addAll(sureProduced(br.body()));
                        any.addAll(allProduced(br.body()));
                    }
                    sure.addAll(union);
                    maybe.removeAll(union);
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
                case Seq inner -> walk(inner, available, sure, maybe, reported, out);
            }
        }
    }

    /** seq 를 끝까지 타면 반드시 만들어지는 결과 이름(IF 는 갈래 교집합, 병렬은 합집합). */
    private Set<String> sureProduced(Seq seq) {
        Set<String> out = new HashSet<>();
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> {
                    RuleDefinition def = defs.get(r.ruleId());
                    if (def != null) {
                        out.addAll(RuleEvaluator.resultNames(def));
                    }
                }
                case Split s when s.kind() == NodeKind.IF -> {
                    Set<String> inter = null;
                    for (Branch br : s.branches()) {
                        Set<String> made = sureProduced(br.body());
                        if (inter == null) {
                            inter = made;
                        } else {
                            inter.retainAll(made);
                        }
                    }
                    if (inter != null) {
                        out.addAll(inter);
                    }
                }
                case Split s -> s.branches().forEach(br -> out.addAll(sureProduced(br.body())));
                case Seq inner -> out.addAll(sureProduced(inner));
            }
        }
        return out;
    }

    /** seq 안 어느 룰이든 만들 수 있는 결과 이름. */
    private Set<String> allProduced(Seq seq) {
        Set<String> out = new HashSet<>();
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> {
                    RuleDefinition def = defs.get(r.ruleId());
                    if (def != null) {
                        out.addAll(RuleEvaluator.resultNames(def));
                    }
                }
                case Split s -> s.branches().forEach(br -> out.addAll(allProduced(br.body())));
                case Seq inner -> out.addAll(allProduced(inner));
            }
        }
        return out;
    }

    /** 조건식 변수(예약 이름 제외). 파싱에 실패하면 빈 집합 — 그 오류는 평가 때 BRANCH_EVAL_ERROR 로 드러난다. */
    private Set<String> condVars(String cond) {
        if (cond == null || cond.isBlank()) {
            return Set.of();
        }
        try {
            Set<String> vars = new LinkedHashSet<>(expressions.usedVariables(cond));
            vars.removeIf(v -> v.equalsIgnoreCase(ReservedNames.EVAL_TS) || v.startsWith(ReservedNames.RESERVED_PREFIX));
            return vars;
        } catch (RuntimeException e) {
            return Set.of();
        }
    }

    /** 룰이 요구하는 입력 이름 — 계약 always + DERIVE 행 required·optional(기존 missingInputKeys 와 같다, design §6.13 4). */
    static List<String> needed(RuleDefinition def) {
        List<String> needed = new ArrayList<>();
        if (def.contract() != null) {
            for (VarType t : nonNull(def.contract().always())) {
                needed.add(t.name());
            }
            if (def.ruleKind() == RuleKind.DERIVE) {
                for (RowContract rc : nonNull(def.contract().rows())) {
                    nonNull(rc.required()).forEach(t -> needed.add(t.name()));
                    nonNull(rc.optional()).forEach(t -> needed.add(t.name()));
                }
            }
        }
        return needed;
    }

    static Violation missing(String ruleId, String name) {
        return new Violation(Stage.SET_CHECK, Code.MISSING_KEY, ruleId, null, name,
                "세트 입력 키가 레코드에 없다: " + name + " (룰 " + ruleId + ")");
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }
}
```

- [ ] **Step 7: 흐름 실행 클래스를 만든다**

`rule/FlowRun.java`:

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
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. 이 패키지에는 record·enum 을 새로 두지 않는다.
 */
final class FlowRun {

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;

    final Map<String, Object> ctx;
    /** 최상위에서 만든 결과 = RuleSetResult.finalValues. */
    final Map<String, Object> finalValues = new LinkedHashMap<>();
    final List<RuleResult> steps = new ArrayList<>();
    final List<PathStep> path = new ArrayList<>();
    final List<EngineWarning> warnings = new ArrayList<>();

    FlowRun(RuleEvaluator evaluator, ExpressionRunner runner, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys,
            Map<String, Object> record, Instant ts) {
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        path.add(new PathStep(tree.startId(), NodeKind.START, null, null));
        seq(tree.root(), ctx, finalValues);
        path.add(new PathStep(tree.endId(), NodeKind.END, null, null));
    }

    private void seq(Seq seq, Map<String, Object> ctx, Map<String, Object> made) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> rule(r, ctx, made);
                case Split s when s.kind() == NodeKind.IF -> ifSplit(s, ctx, made);
                case Split s -> parallel(s, ctx, made);
                case Seq inner -> seq(inner, ctx, made);
            }
        }
    }

    private void rule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = defs.get(r.ruleId());
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
    }

    private void ifSplit(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        Branch chosen = null;
        for (Branch br : s.branches()) {
            if (br.otherwise() || chosen != null) {
                continue;
            }
            BranchCondition c = BranchCondition.test(runner, br.cond(), ctx, ts);
            if (c.outcome == BranchCondition.TRUE) {
                chosen = br;
            } else if (c.outcome == BranchCondition.NULL) {
                warnings.add(new EngineWarning(EngineWarning.Code.BRANCH_COND_NULL, null, null, null,
                        "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식 결과가 NULL 이라 거짓으로 봤다"));
            } else if (c.outcome == BranchCondition.ERROR) {
                throw new EngineEvaluationException(List.of(new Violation(Stage.BRANCH_SELECT, Code.BRANCH_EVAL_ERROR, null, null,
                        br.edgeId(), "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식을 평가하지 못했다: " + c.message)));
            }
        }
        if (chosen == null) {
            chosen = s.branches().get(s.branches().size() - 1); // 그 외는 늘 마지막(plan C3)
        }
        List<Violation> missing = keys.check(chosen.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(s.nodeId(), NodeKind.IF, chosen.edgeId(), null));
        seq(chosen.body(), ctx, made);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        path.add(new PathStep(s.nodeId(), NodeKind.PARALLEL, null, null));
        Map<String, Object> base = new LinkedHashMap<>(ctx);
        List<Map<String, Object>> outs = new ArrayList<>();
        for (Branch br : s.branches()) {
            Map<String, Object> branchCtx = new LinkedHashMap<>(base);
            Map<String, Object> branchMade = new LinkedHashMap<>();
            seq(br.body(), branchCtx, branchMade);
            outs.add(branchMade);
        }
        for (Map<String, Object> out : outs) {
            for (Map.Entry<String, Object> e : out.entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                made.put(e.getKey(), e.getValue());
            }
        }
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
    }
}
```

- [ ] **Step 8: MdmRuleEngine 을 흐름 실행으로 바꾼다**

`MdmRuleEngine.java`:
- import 에 `kr.dongkuk.maru.mdm.engine.flow.FlowParse`, `kr.dongkuk.maru.mdm.engine.flow.FlowParser`, `kr.dongkuk.maru.mdm.engine.flow.FlowTree`, `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition` 을 더하고, 쓰지 않게 되는 `HashSet`·`Set`·`RowContract`·`RuleKind`·`VarType` import 를 지운다(컴파일 경고로 확인).
- 필드·생성자(44-51행):

```java
    private final DefinitionLookup definitions;
    private final MdmEvaluator expressions;
    private final ExpressionRunner runner;
    private final RuleEvaluator evaluator;

    public MdmRuleEngine(MdmEvaluator evaluator, DefinitionLookup definitions) {
        this.definitions = Objects.requireNonNull(definitions, "definitions");
        this.expressions = Objects.requireNonNull(evaluator, "evaluator");
        this.runner = new ExpressionRunner(this.expressions);
        this.evaluator = new RuleEvaluator(runner);
    }
```

- `evaluateSet`(68-106행)과 `missingInputKeys`(108-141행)를 지우고 아래로 바꾼다.

```java
    @Override
    public RuleSetResult evaluateSet(String setId, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(setId, "setId");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        Prepared p = prepare(set(setId), record, ts);
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts);
        run.run();
        return new RuleSetResult(setId, ts, List.copyOf(run.steps), Collections.unmodifiableMap(run.finalValues),
                List.copyOf(run.path), List.copyOf(run.warnings));
    }

    /** 판정 준비된 세트 — 트리·룰 정의(룰 ID → 정의)·입력 키 검사기. */
    private static final class Prepared {
        final FlowTree tree;
        final Map<String, RuleDefinition> defs;
        final FlowKeys keys;

        Prepared(FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys) {
            this.tree = tree;
            this.defs = defs;
            this.keys = keys;
        }
    }

    /**
     * 상태 → 흐름 구조 → 레코드 키·룰 조회·입력 키 사전 검사(plan C5, design §6.13). 구조 오류는 FLOW_INVALID 로 바로 던지고,
     * 나머지는 모아 한 번에 던진다. 폐기 세트는 룰을 조회하지 않는다.
     */
    private Prepared prepare(RuleSetDefinition set, Map<String, Object> record, Instant ts) {
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + set.setId())));
        }
        FlowDefinition flow = set.flow() == null ? FlowParser.linear(set.ruleIds()) : set.flow();
        FlowParse parsed = FlowParser.parse(flow);
        if (parsed.tree() == null) {
            throw new EngineEvaluationException(parsed.issues().stream()
                    .map(i -> new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                            "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message()))
                    .toList());
        }
        FlowTree tree = parsed.tree();
        List<Violation> violations = new ArrayList<>(RecordKeys.check(record.keySet(), Stage.SET_CHECK, null));
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (String ruleId : tree.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isEmpty()) {
                violations.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + set.setId() + " 의 룰이 없다: " + ruleId + " @ " + ts));
            } else {
                defs.put(ruleId, def.get());
            }
        }
        FlowKeys keys = new FlowKeys(defs, expressions);
        violations.addAll(keys.check(tree.root(), record.keySet()));
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return new Prepared(tree, defs, keys);
    }
```

주의: 룰 조회·`RULE_NOT_FOUND` 는 `tree.ruleIds()`(중복 없음)로 돌아 룰 ID 마다 한 번만 보고한다(편차 D12). 한 줄 흐름에 같은 ID 가 두 번 있어도 조회·보고는 한 번이다. 기존 `RuleSetEvaluationTest.S3` 는 위반 순서(`BASE_SPD_LKP/COAT_SIDE`, `SPD_EXC/COIL_WID`)와 "앞 룰 결과 이름은 요구하지 않는다"를 본다. 한 줄 흐름에서 `FlowKeys.walk` 는 룰 순서대로 `sure` 에 결과를 쌓으므로 결과가 같다.

- [ ] **Step 9: 생성 TS 와 계약 문서를 고친다**

Run: `pnpm --filter @dk-oasis/m-mdm gen:contract`
Expected: 생성 파일에 `PathStep` 인터페이스, `RuleSetResult.path`·`warnings`, 새 enum 값이 생긴다.

`docs/mdm/engine-contract.md` §8 의 "**룰 세트 결과 …**" 문단을 아래로 바꾸고, 판정 오류 불릿의 단계·코드 문장을 고친다.

```markdown
**룰 세트 결과 `RuleSetResult(setId, evalTs, steps, finalValues, path, warnings)`**: `steps` 는 실제로 실행한 룰마다의 `RuleResult`(실행 순서), `finalValues` 는 마지막 룰 뒤 결과 변수 전체다(입력 레코드 키는 뺀다). `path` 는 방문한 노드 `PathStep(nodeId, kind, chosenEdgeId, stepIndex)` 목록이다. START·RULE·IF·PARALLEL·MERGE·END 를 모두 담고, `chosenEdgeId` 는 IF 에서 고른 선, `stepIndex` 는 RULE 결과가 `steps` 의 몇 번째인지다. 한 줄 흐름(`flow` 가 null)의 노드 ID 는 `start`, `r1`…`rN`, `end` 다. `warnings` 는 세트 경고로 지금은 `BRANCH_COND_NULL` 하나다. 흐름 실행 의미(IF 는 처음 참인 갈래 하나, 병렬은 분기 직전 값의 사본에서 order 순으로 하나씩 실행하고 합류 때 갈래 순서대로 합침, 같은 이름은 뒤 갈래가 이김)는 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §4 와 구현 계획 C5 를 따른다.
```

- 단계 문장 끝에 "→ `BRANCH_SELECT`(IF 갈래 고르기)" 를 더하고, 코드 문장을 "코드(`Code`) 14종: … `EVALUATION_ERROR`, `BRANCH_EVAL_ERROR`(IF 조건식이 불린이 아니거나 평가 실패), `FLOW_INVALID`(세트 흐름 구조 오류)." 로 고친다.
- `warnings` 표 행의 code 설명 끝에 "세트 경고 `BRANCH_COND_NULL`(IF 갈래 조건식 결과가 NULL 이라 그 갈래를 거짓으로 봄)" 을 더한다.

- [ ] **Step 10: 문서·스키마 수동 대조**

Run: `grep -n 'BRANCH_SELECT\|BRANCH_EVAL_ERROR\|FLOW_INVALID\|BRANCH_COND_NULL\|"PathStep"\|"path"' src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json docs/mdm/engine-contract.md`
Expected: 네 이름과 `PathStep`·`path` 가 스키마와 문서 양쪽에 모두 나온다. 문서의 `PathStep(nodeId, kind, chosenEdgeId, stepIndex)` 필드 순서·이름이 스키마 속성과 같다.

- [ ] **Step 11: 통과를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS — `RuleSetFlowEvaluationTest` 새 사례 전부와 기존 `RuleSetEvaluationTest`·`SampleRuleSetValueTest`(한 줄 흐름 회귀)·계약 대조 테스트.

Run: `pnpm --filter @dk-oasis/m-mdm test tests/engine-contract.generated.test.ts`
Expected: PASS, exit 0

Run: `(cd src/backend/mdm && ../gradlew :lib:compileJava :lib:compileTestJava --console=plain -q)`
Expected: 성공(mdm 이 `RuleSetResult` 접근자만 쓰는지 확인 — 생성자를 부르는 곳은 없다)

- [ ] **Step 12: 커밋**

```bash
git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/BranchCondition.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetResult.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineEvaluationException.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/expr/EngineWarning.java \
  src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/FlowRules.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetFlowEvaluationTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java \
  src/frontend/m-mdm/tests/engine-contract.generated.test.ts \
  src/frontend/m-mdm/src/contract/engine-contract.generated.ts \
  docs/mdm/engine-contract.md
git commit -m "feat(mdm-engine): 룰 세트를 흐름(IF·병렬)대로 실행하고 path 기록

evaluateSet 이 블록 트리를 따라 IF 는 첫 참 갈래, 병렬은 사본에서 order 순
실행 뒤 합친다. 입력 키는 반드시 실행되는 부분만 미리 보고 IF 갈래는 들어갈
때, 일부 갈래 변수는 실행 직전에 본다. RuleSetResult 에 path·warnings,
BRANCH_SELECT·BRANCH_EVAL_ERROR·FLOW_INVALID·BRANCH_COND_NULL 추가(plan D5·D6).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 6: 흐름 기준 세트 검사와 코퍼스(Java)

**모델:** opus · **물결:** 3 · **선행:** Task 4(엔진 `flow` 패키지)

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/CondIo.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java`
- Modify: `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(사례 **추가만**)
- Create: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java`

**Interfaces:**
- Consumes (Task 1·4):
  - `DefinitionLookup.FlowDefinition(int version, List<FlowNode> nodes, List<FlowEdge> edges)`
  - `FlowNode(String id, NodeKind kind, String ruleId, String splitId, String label)`
  - `FlowEdge(String id, String from, String to, Integer order, String cond, boolean otherwise, String label)`
  - `NodeKind`, `FlowParser.parse(FlowDefinition): FlowParse`, `FlowParser.linear(List<String>): FlowDefinition`
  - `FlowParse(FlowTree tree, List<FlowIssue> issues)`, `FlowIssue(String code, String nodeId, String edgeId, String message)`
  - `Block`/`Seq(List<Block> items)`/`RuleStep(String nodeId, String ruleId)`/`Split(String nodeId, NodeKind kind, String mergeId, List<Branch> branches)`/`Branch(String edgeId, String cond, boolean otherwise, String label, Seq body)`
  - `FlowTree.root()/ruleSteps()/ruleIds()/branched()/relation(String, String)`, `FlowTree.Relation { SAME, BEFORE, AFTER, EXCLUSIVE, PARALLEL }`
- Produces:
  - `RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message, String nodeId, String edgeId)` 와 기존 6인자 생성자(nodeId·edgeId=null). 새 상수 `FLOW_STRUCTURE`, `FLOW_IF_ELSE`, `FLOW_COND`, `IF_SIBLING`, `PAR_SIBLING`, `FLOW_PARTIAL`, `FLOW_READONLY`
  - `record CondIo(boolean ok, String message, List<RuleIo.IoName> vars)`
  - `RuleSetFlowJson`:
    - `static FlowDefinition parse(String json)`
    - `static FlowDefinition fromMap(Map<String,Object> flow)`
    - `static String write(Map<String,Object> flow)`
    - `static Map<String,Object> toMap(String json)`
    - `static boolean branched(FlowDefinition flow)`
    - `static List<String> ruleIds(FlowDefinition flow)`(C4 1번의 목록)
    - 형식이 틀리면 `IllegalArgumentException`(한국어 문구)
  - `RuleSetAnalyzer`:
    - `static List<RuleSetCheck> checks(FlowDefinition flow, Map<String,RuleIo> rules, Map<String,CondIo> condIo)`
    - `static SetIo io(FlowDefinition flow, Map<String,RuleIo> rules)`
    - `static Map<String,List<String>> deps(FlowDefinition flow, Map<String,RuleIo> rules)`
    - 기존 `(List<String> ids, Map)` 세 메서드는 서명 유지

**읽기 규칙(계획 C3 보강·D12).** 노드 ID 가 겹치면 그 ID 의 첫 노드만 본다(`ruleIds`·존재 검사의 노드 위치). 존재·상태 검사는 룰 ID 마다 한 번만 보고한다. 목록 입력도 같다(`tree.ruleIds()` 가 중복을 없앤다). `excl`·`par` 목록은 같은 ruleId 를 빼지 않는다. 조건식 정보가 없거나 message 가 null 이면 문구 자리에 `조건식 정보 없음` 을 쓴다. 흐름 JSON 의 빠진 칸은 null(otherwise 는 false)로 읽는다. 단 노드 `id`·`kind` 와 선 `id`·`from`·`to` 는 빠지면 형식 오류다(엔진 record 가 null 을 받지 않는다).

**FLOW_JSON 키 이름.** 노드 종류 키는 `kind` 다. 엔진 record 컴포넌트 이름(`FlowNode.kind`)과 스키마 속성 이름이 같아야 하기 때문이다(C1·D2 와 같은 이유). 스펙 §3.3 예시의 `"type"` 은 쓰지 않는다. 선은 `"otherwise": true` 다(D2). 코덱은 `version`·`nodes`·`edges` 만 읽고 `view` 는 무시한다.

- [ ] **Step 1: 코덱 테스트를 쓴다**

`RuleSetFlowJsonTest.java`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/** 흐름 JSON 코덱(spec §3.3, 계획 C6) — kind·otherwise 키, view 무시, 형식 오류 문구, 펼친 룰 목록. */
class RuleSetFlowJsonTest {

    static final String IF_FLOW = """
            {"version":1,
             "nodes":[{"id":"start","kind":"START"},{"id":"if1","kind":"IF","label":"주문 유형"},
                      {"id":"r1","kind":"RULE","ruleId":"A"},{"id":"r2","kind":"RULE","ruleId":"B"},
                      {"id":"m1","kind":"MERGE","splitId":"if1"},{"id":"r3","kind":"RULE","ruleId":"A"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"if1"},
                      {"id":"e2","from":"if1","to":"r1","order":1,"cond":"X > 1","label":"크다"},
                      {"id":"e3","from":"if1","to":"r2","otherwise":true},
                      {"id":"e4","from":"r1","to":"m1"},{"id":"e5","from":"r2","to":"m1"},
                      {"id":"e6","from":"m1","to":"r3"},{"id":"e7","from":"r3","to":"end"}],
             "view":{"positions":{"start":{"x":0,"y":0}}}}
            """;

    @Test
    void 노드_종류와_선_필드를_읽고_view_는_무시한다() {
        FlowDefinition f = RuleSetFlowJson.parse(IF_FLOW);
        assertEquals(1, f.version());
        assertEquals(7, f.nodes().size());
        assertEquals(NodeKind.IF, f.nodes().get(1).kind());
        assertEquals("주문 유형", f.nodes().get(1).label());
        assertEquals("if1", f.nodes().get(4).splitId());
        FlowEdge e2 = f.edges().get(1);
        assertEquals(1, e2.order());
        assertEquals("X > 1", e2.cond());
        assertFalse(e2.otherwise());
        FlowEdge e3 = f.edges().get(2);
        assertTrue(e3.otherwise());
        assertNull(e3.order());
        assertNull(e3.cond());
    }

    @Test
    void 펼친_룰_목록은_깊이_우선_중복_없음이고_분기_여부를_안다() {
        FlowDefinition f = RuleSetFlowJson.parse(IF_FLOW);
        assertEquals(List.of("A", "B"), RuleSetFlowJson.ruleIds(f));
        assertTrue(RuleSetFlowJson.branched(f));
        assertFalse(RuleSetFlowJson.branched(kr.dongkuk.maru.mdm.engine.flow.FlowParser.linear(List.of("A", "B"))));
    }

    @Test
    void 구조_오류로_트리가_없으면_노드_배열_순서의_룰_ID_다() {
        String noElse = IF_FLOW.replace("{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true}",
                "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"order\":2,\"cond\":\"X > 2\"}");
        assertEquals(List.of("A", "B"), RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(noElse)));
    }

    @Test
    void 노드_ID_가_겹치면_첫_노드만_룰_목록에_넣는다() {
        String dup = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"A\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"B\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}";
        assertEquals(List.of("A"), RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(dup)));
    }

    @Test
    void 맵과_문자열이_같은_정의가_되고_write_는_view_를_남긴다() {
        Map<String, Object> m = RuleSetFlowJson.toMap(IF_FLOW);
        assertEquals(RuleSetFlowJson.parse(IF_FLOW), RuleSetFlowJson.fromMap(m));
        assertTrue(RuleSetFlowJson.write(m).contains("\"positions\""));
    }

    @Test
    void 형식이_틀리면_한국어_문구로_거부한다() {
        assertEquals("흐름은 JSON 객체여야 한다", assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("[]")).getMessage());
        assertEquals("흐름 형식 버전 2 는 읽지 못한다(1 만 받는다)",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("{\"version\":2,\"nodes\":[],\"edges\":[]}")).getMessage());
        assertEquals("노드 종류 LOOP 를 모른다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[{\"id\":\"x\",\"kind\":\"LOOP\"}],\"edges\":[]}")).getMessage());
        assertEquals("nodes[0].id 가 없다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[{\"kind\":\"START\"}],\"edges\":[]}")).getMessage());
        assertEquals("edges[0].to 가 없다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":[{\"id\":\"e1\",\"from\":\"a\"}]}")).getMessage());
    }
}
```

- [ ] **Step 2: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --console=plain)`
Expected: FAIL(컴파일 오류 — `RuleSetFlowJson` 없음).

- [ ] **Step 3: `CondIo`·`RuleSetFlowJson` 을 쓴다**

`CondIo.java`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.List;

/**
 * IF 갈래 조건식 하나의 입력(계획 C4) — 서버가 식을 미리 풀어 분석기·화면에 넘긴다. {@code ok=false} 면 {@code message} 가 파싱 오류 문구이고
 * {@code vars} 는 비어 있다. 변수의 {@code source} 는 {@code DICT}(컬럼 사전에 있음) 또는 {@code NONE} 이다.
 */
public record CondIo(boolean ok, String message, List<IoName> vars) {
}
```

`RuleSetFlowJson.java`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 룰 세트 흐름 JSON(FLOW_JSON) 코덱 — spec §3.3, 계획 C1·C6. 엔진은 Jackson 을 쓰지 않으므로 JSON ↔ 엔진 {@link FlowDefinition} 변환은
 * mdm/lib 이 맡는다. 노드 종류 키는 {@code kind}, IF "그 외" 선은 {@code "otherwise": true}(D2). {@code view} 는 화면 전용이라 읽지 않지만
 * {@link #write} 는 받은 맵을 그대로 저장한다. 형식이 틀리면 {@link IllegalArgumentException}(호출자가 MDM021 로 바꾼다).
 */
public final class RuleSetFlowJson {

    private static final ObjectMapper JSON = new ObjectMapper();

    private RuleSetFlowJson() {
    }

    public static FlowDefinition parse(String json) {
        try {
            return read(JSON.readTree(json));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    public static FlowDefinition fromMap(Map<String, Object> flow) {
        return read(JSON.valueToTree(flow));
    }

    /** 받은 흐름(view 포함)을 그대로 JSON 문자열로. */
    public static String write(Map<String, Object> flow) {
        try {
            return JSON.writeValueAsString(flow);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름을 JSON 으로 쓸 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 저장된 FLOW_JSON → 맵(조회 응답용, view 포함). */
    public static Map<String, Object> toMap(String json) {
        try {
            return JSON.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 분기(IF·PARALLEL)가 하나라도 있으면 true. 구조 오류로 트리가 없어도 분기 노드가 있으면 true 다. */
    public static boolean branched(FlowDefinition flow) {
        return flow.nodes().stream().anyMatch(n -> n.kind() == NodeKind.IF || n.kind() == NodeKind.PARALLEL);
    }

    /**
     * 계획 C4 1번 — 트리가 있으면 {@code tree.ruleIds()}, 없으면 RULE 노드의 ruleId 를 노드 배열 순서로 중복 없이(빈 ID 는 뺀다). 노드 ID 가
     * 겹치면 그 ID 의 첫 노드만 본다(C3).
     */
    public static List<String> ruleIds(FlowDefinition flow) {
        FlowParse p = FlowParser.parse(flow);
        if (p.tree() != null) {
            return p.tree().ruleIds();
        }
        Set<String> seenNodes = new HashSet<>();
        Set<String> out = new LinkedHashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null && !n.ruleId().isBlank()) {
                out.add(n.ruleId());
            }
        }
        return List.copyOf(out);
    }

    private static FlowDefinition read(JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("흐름은 JSON 객체여야 한다");
        }
        int version = root.path("version").asInt(0);
        if (version != 1) {
            throw new IllegalArgumentException("흐름 형식 버전 " + version + " 는 읽지 못한다(1 만 받는다)");
        }
        List<FlowNode> nodes = new ArrayList<>();
        JsonNode ns = root.path("nodes");
        for (int i = 0; i < ns.size(); i++) {
            JsonNode n = ns.get(i);
            String id = required(n, "id", "nodes[" + i + "]");
            String kind = required(n, "kind", "nodes[" + i + "]");
            NodeKind k;
            try {
                k = NodeKind.valueOf(kind);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("노드 종류 " + kind + " 를 모른다");
            }
            nodes.add(new FlowNode(id, k, text(n, "ruleId"), text(n, "splitId"), text(n, "label")));
        }
        List<FlowEdge> edges = new ArrayList<>();
        JsonNode es = root.path("edges");
        for (int i = 0; i < es.size(); i++) {
            JsonNode e = es.get(i);
            String where = "edges[" + i + "]";
            JsonNode order = e.path("order");
            edges.add(new FlowEdge(required(e, "id", where), required(e, "from", where), required(e, "to", where),
                    order.isNumber() ? order.asInt() : null, text(e, "cond"), e.path("otherwise").asBoolean(false), text(e, "label")));
        }
        return new FlowDefinition(version, List.copyOf(nodes), List.copyOf(edges));
    }

    private static String required(JsonNode node, String field, String where) {
        String v = text(node, field);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(where + "." + field + " 가 없다");
        }
        return v;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
```

주의: 테스트의 버전 문구 `"흐름 형식 버전 2 는 읽지 못한다(1 만 받는다)"` 와 코드 문자열을 글자까지 같게 둔다. 노드는 `id` 를 `kind` 보다 먼저 검사한다(`{"kind":"START"}` → `nodes[0].id 가 없다`).

- [ ] **Step 4: 코덱 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowJsonTest' --console=plain)`
Expected: PASS(6건)

- [ ] **Step 5: 코퍼스에 흐름 사례 19건을 더한다(기존 18건 불변)**

아래 배열을 워크트리 밖 임시 파일 `$TMPDIR/flow-cases.json` 로 저장한다. 그다음 스크립트로 코퍼스 배열 끝에 **텍스트로 덧붙인다**. 기존 사례를 다시 직렬화하지 않으므로 기존 줄은 한 글자도 바뀌지 않는다.

```json
[
  {"name": "흐름 — IF 정상, 갈래마다 같은 결과 이름",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "D1"},
               {"id": "r2", "kind": "RULE", "ruleId": "D2"}, {"id": "r3", "kind": "RULE", "ruleId": "D3"},
               {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "r4", "kind": "RULE", "ruleId": "FIN"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "DESIGN_NEED == \"N\""},
               {"id": "e3", "from": "if1", "to": "r2", "order": 2, "cond": "REPEAT_YN == \"Y\""},
               {"id": "e4", "from": "if1", "to": "r3", "otherwise": true},
               {"id": "e5", "from": "r1", "to": "m1"}, {"id": "e6", "from": "r2", "to": "m1"}, {"id": "e7", "from": "r3", "to": "m1"},
               {"id": "e8", "from": "m1", "to": "r4"}, {"id": "e9", "from": "r4", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "DESIGN_NEED", "source": "DICT"}]},
              "e3": {"ok": true, "message": null, "vars": [{"name": "REPEAT_YN", "source": "DICT"}]}},
   "ids": ["D1", "D2", "D3", "FIN"],
   "rules": {
     "D1": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "DESIGN_NEED", "source": "DICT"}], "results": [{"name": "PLAN"}]},
     "D2": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "REPEAT_YN", "source": "DICT"}], "results": [{"name": "PLAN"}]},
     "D3": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "ORDER_TYPE", "source": "DICT"}], "results": [{"name": "PLAN"}]},
     "FIN": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "PLAN", "source": "NONE"}], "results": [{"name": "CONFIRMED"}]}},
   "expect": {
     "io": {"inputs": [{"name": "DESIGN_NEED", "source": "DICT", "users": ["D1"]}, {"name": "REPEAT_YN", "source": "DICT", "users": ["D2"]},
                       {"name": "ORDER_TYPE", "source": "DICT", "users": ["D3"]}],
            "results": [{"name": "PLAN", "by": ["D1", "D2", "D3"], "readers": ["FIN"]}, {"name": "CONFIRMED", "by": ["FIN"], "readers": []}]},
     "deps": {"D1": [], "D2": [], "D3": [], "FIN": ["D1", "D2", "D3"]},
     "checks": []}},

  {"name": "흐름 — IF 그 외 갈래 없음",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "order": 2, "cond": "X > 2"},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "Y", "source": "DICT"}], "results": [{"name": "RA"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}, {"name": "Y", "source": "DICT", "users": ["B"]}],
            "results": [{"name": "RA", "by": ["A", "B"], "readers": []}]},
     "deps": {"A": [], "B": []},
     "checks": [{"code": "FLOW_IF_ELSE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다", "nodeId": "if1", "edgeId": null}]}},

  {"name": "흐름 — IF 조건식 누락",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "  "},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": [], "B": []},
     "checks": [{"code": "FLOW_IF_ELSE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "IF if1의 갈래 e2에 조건식이 없다", "nodeId": "if1", "edgeId": "e2"}]}},

  {"name": "흐름 — 합류 없는 병렬 분기",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "p1", "kind": "PARALLEL"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "p1"},
               {"id": "e2", "from": "p1", "to": "r1", "order": 1}, {"id": "e3", "from": "p1", "to": "r2", "order": 2},
               {"id": "e4", "from": "r1", "to": "end"}, {"id": "e5", "from": "r2", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": [], "B": []},
     "checks": [{"code": "FLOW_STRUCTURE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "end의 들어오는 선이 2개다. 1개여야 한다", "nodeId": "end", "edgeId": null},
                {"code": "FLOW_STRUCTURE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "분기 p1를 닫는 합류가 0개다. 정확히 1개여야 한다", "nodeId": "p1", "edgeId": null}]}},

  {"name": "흐름 — 갈래가 짝 합류 밖으로 나간다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "if2", "kind": "IF"},
               {"id": "r3", "kind": "RULE", "ruleId": "C"}, {"id": "r4", "kind": "RULE", "ruleId": "D"},
               {"id": "m2", "kind": "MERGE", "splitId": "if2"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m2"}, {"id": "e6", "from": "m1", "to": "if2"},
               {"id": "e7", "from": "if2", "to": "r3", "order": 1, "cond": "X > 2"},
               {"id": "e8", "from": "if2", "to": "r4", "otherwise": true},
               {"id": "e9", "from": "r3", "to": "m2"}, {"id": "e10", "from": "r4", "to": "m1"}, {"id": "e11", "from": "m2", "to": "end"}]},
   "ids": ["A", "B", "C", "D"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RC"}]},
     "D": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RD"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B", "C", "D"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []},
                        {"name": "RC", "by": ["C"], "readers": []}, {"name": "RD", "by": ["D"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": [], "D": []},
     "checks": [{"code": "FLOW_STRUCTURE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "갈래가 m1에서 닫히지 않고 m2로 나간다", "nodeId": "m2", "edgeId": null}]}},

  {"name": "흐름 — 도달할 수 없는 노드",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "A"}, {"id": "end", "kind": "END"},
               {"id": "r8", "kind": "RULE", "ruleId": "E"}, {"id": "r9", "kind": "RULE", "ruleId": "F"}],
     "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "end"},
               {"id": "e3", "from": "r8", "to": "r9"}, {"id": "e4", "from": "r9", "to": "r8"}]},
   "ids": ["A", "E", "F"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "E": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RF", "source": "NONE"}], "results": [{"name": "RE"}]},
     "F": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RE", "source": "NONE"}], "results": [{"name": "RF"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}, {"name": "RF", "source": "NONE", "users": ["E"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RE", "by": ["E"], "readers": ["F"]},
                        {"name": "RF", "by": ["F"], "readers": []}]},
     "deps": {"A": [], "E": ["F"], "F": ["E"]},
     "checks": [{"code": "FLOW_STRUCTURE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "r8에 도달할 수 없다", "nodeId": "r8", "edgeId": null}]}},

  {"name": "흐름 — 노드 ID 중복(첫 노드만 본다)",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "A"}, {"id": "r1", "kind": "RULE", "ruleId": "B"},
               {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "end"}]},
   "ids": ["A"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}]},
     "deps": {"A": []},
     "checks": [{"code": "FLOW_STRUCTURE", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "노드 ID r1가 겹친다", "nodeId": "r1", "edgeId": null}]}},

  {"name": "흐름 — 합류 뒤 룰이 일부 갈래 결과를 읽는다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"},
               {"id": "r3", "kind": "RULE", "ruleId": "C"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"},
               {"id": "e6", "from": "m1", "to": "r3"}, {"id": "e7", "from": "r3", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["A", "B", "C"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}], "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["C"]}, {"name": "RB", "by": ["B"], "readers": []},
                        {"name": "RC", "by": ["C"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": ["A"]},
     "checks": [{"code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "C", "otherRuleId": null, "varName": "RA",
                 "message": "C가 읽는 RA는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", "nodeId": "r3", "edgeId": null}]}},

  {"name": "흐름 — 조건식이 일부 갈래 결과를 읽고 그 외 갈래는 비어 있다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "if2", "kind": "IF"},
               {"id": "r3", "kind": "RULE", "ruleId": "C2"}, {"id": "m2", "kind": "MERGE", "splitId": "if2"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "if2"},
               {"id": "e7", "from": "if2", "to": "r3", "order": 1, "cond": "RA == \"Y\""},
               {"id": "e8", "from": "if2", "to": "m2", "otherwise": true},
               {"id": "e9", "from": "r3", "to": "m2"}, {"id": "e10", "from": "m2", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]},
              "e7": {"ok": true, "message": null, "vars": [{"name": "RA", "source": "NONE"}]}},
   "ids": ["A", "B", "C2"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C2": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B", "C2"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []},
                        {"name": "RC", "by": ["C2"], "readers": []}]},
     "deps": {"A": [], "B": [], "C2": []},
     "checks": [{"code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": null, "otherRuleId": null, "varName": "RA",
                 "message": "e7 갈래 조건식이 읽는 RA는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다",
                 "nodeId": "if2", "edgeId": "e7"}]}},

  {"name": "흐름 — IF 형제 갈래 결과를 읽는다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["B"]}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": [], "B": ["A"]},
     "checks": [{"code": "IF_SIBLING", "severity": "REJECT", "ruleId": "B", "otherRuleId": "A", "varName": "RA",
                 "message": "B가 읽는 RA는 같은 IF 의 다른 갈래(A)에서만 만들어진다. 이 갈래를 타면 값이 없다", "nodeId": "r2", "edgeId": null}]}},

  {"name": "흐름 — 병렬 형제 갈래 결과를 읽는다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "p1", "kind": "PARALLEL"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "p1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "p1"},
               {"id": "e2", "from": "p1", "to": "r1", "order": 1}, {"id": "e3", "from": "p1", "to": "r2", "order": 2},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["B"]}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": [], "B": ["A"]},
     "checks": [{"code": "PAR_SIBLING", "severity": "REJECT", "ruleId": "B", "otherRuleId": "A", "varName": "RA",
                 "message": "B가 병렬 형제 갈래의 A가 만드는 RA를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", "nodeId": "r2", "edgeId": null}]}},

  {"name": "흐름 — 병렬 형제가 같은 결과 변수에 대입한다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "p1", "kind": "PARALLEL"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "p1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "p1"},
               {"id": "e2", "from": "p1", "to": "r1", "order": 1}, {"id": "e3", "from": "p1", "to": "r2", "order": 2},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "Y", "source": "DICT"}], "results": [{"name": "RA"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}, {"name": "Y", "source": "DICT", "users": ["B"]}],
            "results": [{"name": "RA", "by": ["A", "B"], "readers": []}]},
     "deps": {"A": [], "B": []},
     "checks": [{"code": "PAR_SIBLING", "severity": "REJECT", "ruleId": "B", "otherRuleId": "A", "varName": "RA",
                 "message": "병렬 갈래의 A와 B가 같은 결과 변수 RA에 대입한다", "nodeId": "r2", "edgeId": null}]}},

  {"name": "흐름 — 병렬 합류 뒤 두 갈래 결과를 읽는다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "p1", "kind": "PARALLEL"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "p1"},
               {"id": "r3", "kind": "RULE", "ruleId": "C"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "p1"},
               {"id": "e2", "from": "p1", "to": "r1", "order": 1}, {"id": "e3", "from": "p1", "to": "r2", "order": 2},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"},
               {"id": "e6", "from": "m1", "to": "r3"}, {"id": "e7", "from": "r3", "to": "end"}]},
   "ids": ["A", "B", "C"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}, {"name": "RB", "source": "NONE"}],
           "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["C"]}, {"name": "RB", "by": ["B"], "readers": ["C"]},
                        {"name": "RC", "by": ["C"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": ["A", "B"]},
     "checks": []}},

  {"name": "흐름 — IF 갈래 안의 병렬(중첩) 통과",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "p1", "kind": "PARALLEL"},
               {"id": "r1", "kind": "RULE", "ruleId": "A"}, {"id": "r2", "kind": "RULE", "ruleId": "B"},
               {"id": "m2", "kind": "MERGE", "splitId": "p1"}, {"id": "r3", "kind": "RULE", "ruleId": "C"},
               {"id": "r4", "kind": "RULE", "ruleId": "D"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "p1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "p1", "to": "r1", "order": 1}, {"id": "e4", "from": "p1", "to": "r2", "order": 2},
               {"id": "e5", "from": "r1", "to": "m2"}, {"id": "e6", "from": "r2", "to": "m2"}, {"id": "e7", "from": "m2", "to": "r3"},
               {"id": "e8", "from": "r3", "to": "m1"},
               {"id": "e9", "from": "if1", "to": "r4", "otherwise": true},
               {"id": "e10", "from": "r4", "to": "m1"}, {"id": "e11", "from": "m1", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["A", "B", "C", "D"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}, {"name": "RB", "source": "NONE"}],
           "results": [{"name": "RC"}]},
     "D": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B", "D"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["C"]}, {"name": "RB", "by": ["B"], "readers": ["C"]},
                        {"name": "RC", "by": ["C", "D"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": ["A", "B"], "D": []},
     "checks": []}},

  {"name": "흐름 — 같은 룰이 두 IF 갈래에 있다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "r3", "kind": "RULE", "ruleId": "A"},
               {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "r1", "to": "r2"}, {"id": "e4", "from": "r2", "to": "m1"},
               {"id": "e5", "from": "if1", "to": "r3", "otherwise": true},
               {"id": "e6", "from": "r3", "to": "m1"}, {"id": "e7", "from": "m1", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RA", "source": "NONE"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": ["B"]}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": [], "B": ["A"]},
     "checks": []}},

  {"name": "흐름 — 없는 룰이 두 갈래에 있어도 한 번만 보고한다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "NO_SUCH"},
               {"id": "r2", "kind": "RULE", "ruleId": "NO_SUCH"}, {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X > 1"},
               {"id": "e3", "from": "if1", "to": "r2", "otherwise": true},
               {"id": "e4", "from": "r1", "to": "m1"}, {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "condIo": {"e2": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["NO_SUCH"],
   "rules": {},
   "expect": {
     "io": {"inputs": [], "results": []},
     "deps": {"NO_SUCH": []},
     "checks": [{"code": "RULE_NOT_FOUND", "severity": "REJECT", "ruleId": "NO_SUCH", "otherRuleId": null, "varName": null,
                 "message": "NO_SUCH는 없는 룰이다", "nodeId": "r1", "edgeId": null}]}},

  {"name": "흐름 — 같은 경로 중복 대입은 경고다",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "A"}, {"id": "if1", "kind": "IF"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "r3", "kind": "RULE", "ruleId": "C"},
               {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "if1"},
               {"id": "e3", "from": "if1", "to": "r2", "order": 1, "cond": "X > 1"},
               {"id": "e4", "from": "if1", "to": "r3", "otherwise": true},
               {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "r3", "to": "m1"}, {"id": "e7", "from": "m1", "to": "end"}]},
   "condIo": {"e3": {"ok": true, "message": null, "vars": [{"name": "X", "source": "DICT"}]}},
   "ids": ["A", "B", "C"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B", "C"]}],
            "results": [{"name": "RA", "by": ["A", "B"], "readers": []}, {"name": "RC", "by": ["C"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": []},
     "checks": [{"code": "DUP_RESULT", "severity": "WARN", "ruleId": "B", "otherRuleId": "A", "varName": "RA",
                 "message": "A와 B가 같은 결과 변수 RA에 대입한다", "nodeId": "r2", "edgeId": null}]}},

  {"name": "흐름 — 병렬 갈래 안의 뒤 룰 결과를 읽는다(빈 병렬 갈래 포함)",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "r1", "kind": "RULE", "ruleId": "A"}, {"id": "p1", "kind": "PARALLEL"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "m1", "kind": "MERGE", "splitId": "p1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "r1"}, {"id": "e2", "from": "r1", "to": "p1"},
               {"id": "e3", "from": "p1", "to": "r2", "order": 1}, {"id": "e4", "from": "p1", "to": "m1", "order": 2},
               {"id": "e5", "from": "r2", "to": "m1"}, {"id": "e6", "from": "m1", "to": "end"}]},
   "ids": ["A", "B"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "RB", "source": "NONE"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]}},
   "expect": {
     "io": {"inputs": [{"name": "RB", "source": "NONE", "users": ["A"]}, {"name": "X", "source": "DICT", "users": ["B"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []}]},
     "deps": {"A": ["B"], "B": []},
     "checks": [{"code": "ORDER", "severity": "REJECT", "ruleId": "A", "otherRuleId": "B", "varName": "RB",
                 "message": "A가 뒤에 도는 B의 결과 변수 RB를 읽는다. B를 A 앞으로 옮긴다", "nodeId": "r1", "edgeId": null}]}},

  {"name": "흐름 — 조건식 파싱 실패와 정의 안 된 변수",
   "flow": {"version": 1,
     "nodes": [{"id": "start", "kind": "START"}, {"id": "if1", "kind": "IF"}, {"id": "r1", "kind": "RULE", "ruleId": "A"},
               {"id": "r2", "kind": "RULE", "ruleId": "B"}, {"id": "r3", "kind": "RULE", "ruleId": "C"},
               {"id": "m1", "kind": "MERGE", "splitId": "if1"}, {"id": "end", "kind": "END"}],
     "edges": [{"id": "e1", "from": "start", "to": "if1"},
               {"id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "X >"},
               {"id": "e3", "from": "if1", "to": "r2", "order": 2, "cond": "Q_UNKNOWN == 1"},
               {"id": "e4", "from": "if1", "to": "r3", "otherwise": true},
               {"id": "e5", "from": "r1", "to": "m1"}, {"id": "e6", "from": "r2", "to": "m1"}, {"id": "e7", "from": "r3", "to": "m1"},
               {"id": "e8", "from": "m1", "to": "end"}]},
   "condIo": {"e2": {"ok": false, "message": "식 끝이 예상과 다르다", "vars": []},
              "e3": {"ok": true, "message": null, "vars": [{"name": "Q_UNKNOWN", "source": "NONE"}]}},
   "ids": ["A", "B", "C"],
   "rules": {
     "A": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RA"}]},
     "B": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RB"}]},
     "C": {"exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{"name": "X", "source": "DICT"}], "results": [{"name": "RC"}]}},
   "expect": {
     "io": {"inputs": [{"name": "X", "source": "DICT", "users": ["A", "B", "C"]}],
            "results": [{"name": "RA", "by": ["A"], "readers": []}, {"name": "RB", "by": ["B"], "readers": []},
                        {"name": "RC", "by": ["C"], "readers": []}]},
     "deps": {"A": [], "B": [], "C": []},
     "checks": [{"code": "FLOW_COND", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": null,
                 "message": "e2 갈래 조건식을 읽을 수 없다: 식 끝이 예상과 다르다", "nodeId": "if1", "edgeId": "e2"},
                {"code": "FLOW_COND", "severity": "REJECT", "ruleId": null, "otherRuleId": null, "varName": "Q_UNKNOWN",
                 "message": "e3 갈래 조건식이 읽는 Q_UNKNOWN는 이 지점에서 정의되지 않았다", "nodeId": "if1", "edgeId": "e3"}]}}
]
```

덧붙이는 스크립트(워크트리 루트에서 실행):

```bash
python3 - <<'EOF'
import json, os, pathlib
p = pathlib.Path("src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json")
src = p.read_text(encoding="utf-8")
new = json.load(open(os.path.join(os.environ.get("TMPDIR", "/tmp"), "flow-cases.json"), encoding="utf-8"))
tail = "\n  ]\n}"
assert src.rstrip().endswith("]\n}".strip()) and src.rstrip().endswith(tail.strip()), "코퍼스 끝 모양이 예상과 다르다"
cut = src.rstrip().rfind("\n  ]")
body = "".join(",\n" + "\n".join("    " + line for line in json.dumps(c, ensure_ascii=False, indent=2).splitlines()) for c in new)
p.write_text(src[:cut] + body + src[cut:].rstrip() + "\n", encoding="utf-8")
d = json.loads(p.read_text(encoding="utf-8"))
print(len(d["cases"]))
EOF
git diff --stat -- src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json
git diff -- src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json | grep '^-' | grep -v '^---' | wc -l
```

Expected: 첫 줄 `37`. 마지막 줄 `0` 이다(삭제된 줄이 없다). 원본 파일 끝에 줄바꿈이 없었다면 마지막 `}` 줄 하나가 `-`/`+` 로 잡힐 수 있다. 그 경우에는 그 한 줄만 바뀌었는지 눈으로 확인한다. 원본의 마지막 사례 뒤 `}` 에 `,` 가 붙는 것은 추가다(그 줄 자체는 `-` 가 아니다. 스크립트가 쉼표를 새 줄 앞에 붙인다).

- [ ] **Step 6: 코퍼스 러너를 흐름 사례까지 읽게 바꾼다**

`RuleSetCorpusTest.java`:
- `MIN_CASES = 37` 로 올리고 주석에 "TS 러너(`rule-set-corpus.test.ts`, Task 8)도 37 로 맞춘다"를 적는다.
- 클래스 주석 읽기 규칙에 한 줄을 더한다: "`flow` 가 있으면 `ids` 는 `RuleSetFlowJson.ruleIds(flow)` 기대값이고, io·deps 는 흐름 오버로드, checks 는 `checks(flow, rules, condIo)` 로 계산한다. checks 의 빠진 `nodeId`·`edgeId` 는 null 이다."
- 본문:

```java
@ParameterizedTest(name = "{0}")
@MethodSource("corpus")
void 세트_계산이_코퍼스_기대와_순서와_문구까지_같다(String name, JsonNode c) {
    List<String> ids = strings(c.path("ids"));
    Map<String, RuleIo> rules = new LinkedHashMap<>();
    c.path("rules").properties().forEach(e -> rules.put(e.getKey(), rule(e.getKey(), e.getValue())));
    JsonNode expect = c.path("expect");
    FlowDefinition flow = c.has("flow") ? RuleSetFlowJson.parse(c.get("flow").toString()) : null;
    if (flow != null) {
        assertEquals(ids, RuleSetFlowJson.ruleIds(flow), name + " ids(펼친 목록)");
    }

    SetIo io = flow == null ? RuleSetAnalyzer.io(ids, rules) : RuleSetAnalyzer.io(flow, rules);
    // ... inputs·results 비교는 지금 그대로 ...
    Map<String, List<String>> actualDeps = flow == null ? RuleSetAnalyzer.deps(ids, rules) : RuleSetAnalyzer.deps(flow, rules);
    // ... deps 비교 그대로 ...

    List<RuleSetCheck> checks = new ArrayList<>();
    expect.path("checks").forEach(k -> checks.add(new RuleSetCheck(text(k, "code"), text(k, "severity"), text(k, "ruleId"),
            text(k, "otherRuleId"), text(k, "varName"), text(k, "message"), text(k, "nodeId"), text(k, "edgeId"))));
    List<RuleSetCheck> actual = flow == null ? RuleSetAnalyzer.checks(ids, rules) : RuleSetAnalyzer.checks(flow, rules, condIo(c.path("condIo")));
    assertEquals(checks, actual, name + " checks");
}

private static Map<String, CondIo> condIo(JsonNode node) {
    Map<String, CondIo> out = new LinkedHashMap<>();
    node.properties().forEach(e -> {
        List<IoName> vars = new ArrayList<>();
        e.getValue().path("vars").forEach(v -> vars.add(new IoName(text(v, "name"), text(v, "source"), null, null, null, false, null)));
        out.put(e.getKey(), new CondIo(e.getValue().path("ok").asBoolean(false), text(e.getValue(), "message"), vars));
    });
    return out;
}
```

import 에 `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition` 를 더한다.

- [ ] **Step 7: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetCorpusTest' --console=plain)`
Expected: FAIL(컴파일 오류 — 8인자 `RuleSetCheck`, 흐름 오버로드 없음).

- [ ] **Step 8: `RuleSetCheck` 를 넓힌다**

```java
/**
 * 룰 세트 저장 시 검사 한 건(TSK-08-06 design §6.3, 흐름도 계획 C4). 서버 {@link RuleSetAnalyzer#checks} 와 화면 {@code set-model.ts} 가 같은
 * 코드·문구·순서로 만든다.
 *
 * @param severity    {@link #REJECT}(저장·되살리기 거부) 또는 {@link #WARN}
 * @param ruleId      검사가 걸린 룰. {@link #EMPTY}·구조·조건식 검사는 null
 * @param otherRuleId 상대 룰(ORDER·CYCLE·DUP_RESULT·IF_SIBLING·PAR_SIBLING). 그 밖은 null
 * @param varName     걸린 변수 이름(2단계 검사). 1단계·EMPTY·구조는 null
 * @param nodeId      흐름 노드 ID(룰 노드·분기 노드). 목록 입력으로 계산하면 늘 null(D8)
 * @param edgeId      흐름 선 ID(조건식·갈래 검사). 그 밖은 null
 */
public record RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message, String nodeId,
        String edgeId) {

    public static final String REJECT = "REJECT";
    public static final String WARN = "WARN";

    public static final String EMPTY = "EMPTY";
    public static final String RULE_NOT_FOUND = "RULE_NOT_FOUND";
    public static final String RULE_DEPRECATED = "RULE_DEPRECATED";
    public static final String NO_RELEASED = "NO_RELEASED";
    public static final String ORDER = "ORDER";
    public static final String CYCLE = "CYCLE";
    public static final String UNKNOWN_INPUT = "UNKNOWN_INPUT";
    public static final String DUP_RESULT = "DUP_RESULT";
    public static final String FLOW_STRUCTURE = "FLOW_STRUCTURE";
    public static final String FLOW_IF_ELSE = "FLOW_IF_ELSE";
    public static final String FLOW_COND = "FLOW_COND";
    public static final String IF_SIBLING = "IF_SIBLING";
    public static final String PAR_SIBLING = "PAR_SIBLING";
    public static final String FLOW_PARTIAL = "FLOW_PARTIAL";
    public static final String FLOW_READONLY = "FLOW_READONLY";

    /** 노드 위치 없는 검사(목록 입력·세트 단위 거부). */
    public RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message) {
        this(code, severity, ruleId, otherRuleId, varName, message, null, null);
    }

    public boolean rejected() {
        return REJECT.equals(severity);
    }

    RuleSetCheck withoutLocation() {
        return new RuleSetCheck(code, severity, ruleId, otherRuleId, varName, message);
    }
}
```

`RuleSetCheck` 는 엔진 계약 타입이 아니므로(mdm/lib) 위임 생성자를 둘 수 있다. 기존 6인자 호출처는 그대로 컴파일된다.

- [ ] **Step 9: `RuleSetAnalyzer` 에 흐름 오버로드를 쓴다**

기존 `checks(List<String>, Map)` 본문을 아래 흐름 알고리즘으로 옮기고, 목록 입력은 한 줄 흐름으로 위임한다. `io`·`deps` 의 목록 판은 그대로 두고 흐름 판은 펼친 목록으로 위임한다(D10). 클래스 주석에 "흐름 입력(계획 C4)은 `FlowParser` 로 블록 트리를 만든 뒤 경로를 깊이 우선으로 돈다. 목록 입력은 `FlowParser.linear(ids)` 한 줄 흐름과 같고 노드 위치는 null 이다."를 더한다.

```java
// import 추가
import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowIssue;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/** 흐름 입력의 입출력 표 — 펼친 목록 기준(D10). */
public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules) {
    return io(RuleSetFlowJson.ruleIds(flow), rules);
}

/** 흐름 입력의 의존 룰 — 펼친 목록 기준(D10). */
public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules) {
    return deps(RuleSetFlowJson.ruleIds(flow), rules);
}

/** §6.3 목록 입력 — 한 줄 흐름으로 같은 알고리즘을 돌리고 노드 위치를 지운다(기존 코퍼스 불변, D8). */
public static List<RuleSetCheck> checks(List<String> ids, Map<String, RuleIo> rules) {
    return checks(FlowParser.linear(ids), rules, Map.of()).stream().map(RuleSetCheck::withoutLocation).toList();
}

/** 계획 C4 — 존재·상태 → EMPTY → 구조 → 경로(깊이 우선). */
public static List<RuleSetCheck> checks(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, CondIo> condIo) {
    List<RuleSetCheck> out = new ArrayList<>();
    FlowParse parse = FlowParser.parse(flow);
    List<String> ids = RuleSetFlowJson.ruleIds(flow);
    Map<String, String> firstNode = new HashMap<>();
    Set<String> seenNodes = new HashSet<>();
    for (FlowNode n : flow.nodes()) {
        if (seenNodes.add(n.id()) && n.kind() == NodeKind.RULE && n.ruleId() != null) {
            firstNode.putIfAbsent(n.ruleId(), n.id());
        }
    }
    for (String id : ids) {
        RuleIo r = rules.get(id);
        String node = firstNode.get(id);
        if (r == null || !r.exists()) {
            out.add(new RuleSetCheck(RuleSetCheck.RULE_NOT_FOUND, RuleSetCheck.REJECT, id, null, null, id + "는 없는 룰이다", node, null));
        } else if ("DEPRECATED".equals(r.status())) {
            out.add(new RuleSetCheck(RuleSetCheck.RULE_DEPRECATED, RuleSetCheck.REJECT, id, null, null, id + "는 DEPRECATED다", node, null));
        } else if (r.releasedVer() == null) {
            out.add(new RuleSetCheck(RuleSetCheck.NO_RELEASED, RuleSetCheck.WARN, id, null, null,
                    id + "는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다", node, null));
        }
    }
    if (ids.isEmpty()) {
        out.add(new RuleSetCheck(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null, "룰이 하나도 없다"));
    }
    for (FlowIssue i : parse.issues()) {
        out.add(new RuleSetCheck(i.code(), RuleSetCheck.REJECT, null, null, null, i.message(), i.nodeId(), i.edgeId()));
    }
    if (!parse.issues().isEmpty() || parse.tree() == null) {
        return out;
    }
    new PathWalk(parse.tree(), rules, condIo, deps(parse.tree().ruleIds(), rules), out).seq(parse.tree().root(), new State());
    return out;
}

/** 경로 상태(계획 C4 4번) — 반드시 정의된 이름, 일부 갈래에서만 정의된 이름, 이름 → 그 경로에서 마지막으로 만든 룰 노드. */
private record State(Set<String> defined, Set<String> maybe, Map<String, RuleStep> prodBy) {

    State() {
        this(new HashSet<>(), new HashSet<>(), new LinkedHashMap<>());
    }

    State copy() {
        return new State(new HashSet<>(defined), new HashSet<>(maybe), new LinkedHashMap<>(prodBy));
    }
}

/** 트리를 깊이 우선으로 돌며 경로 검사를 낸다. */
private static final class PathWalk {

    private final FlowTree tree;
    private final Map<String, RuleIo> rules;
    private final Map<String, CondIo> condIo;
    private final Map<String, List<String>> d;
    private final List<RuleSetCheck> out;

    PathWalk(FlowTree tree, Map<String, RuleIo> rules, Map<String, CondIo> condIo, Map<String, List<String>> d, List<RuleSetCheck> out) {
        this.tree = tree;
        this.rules = rules;
        this.condIo = condIo;
        this.d = d;
        this.out = out;
    }

    void seq(Seq s, State st) {
        for (Block b : s.items()) {
            if (b instanceof RuleStep r) {
                rule(r, st);
            } else if (b instanceof Split sp) {
                split(sp, st);
            } else if (b instanceof Seq q) {
                seq(q, st);
            }
        }
    }

    void split(Split sp, State st) {
        if (sp.kind() == NodeKind.IF) {
            for (Branch br : sp.branches()) {
                if (!br.otherwise()) {
                    cond(sp, br, st);
                }
            }
        }
        List<State> outs = new ArrayList<>();
        for (Branch br : sp.branches()) {
            State b = st.copy();
            seq(br.body(), b);
            outs.add(b);
        }
        Set<String> defined = new HashSet<>(st.defined());
        Set<String> maybe = new HashSet<>(st.maybe());
        if (sp.kind() == NodeKind.IF) {
            Set<String> inter = null;
            Set<String> union = new HashSet<>();
            for (State b : outs) {
                inter = inter == null ? new HashSet<>(b.defined()) : inter;
                inter.retainAll(b.defined());
                union.addAll(b.defined());
                maybe.addAll(b.maybe());
            }
            defined.addAll(inter == null ? Set.of() : inter);
            union.removeAll(defined);
            maybe.addAll(union);
        } else {
            for (State b : outs) {
                defined.addAll(b.defined());
                maybe.addAll(b.maybe());
            }
        }
        Map<String, RuleStep> over = new LinkedHashMap<>();
        for (State b : outs) {
            b.prodBy().forEach((k, v) -> {
                if (!v.equals(st.prodBy().get(k))) {
                    over.putIfAbsent(k, v);
                }
            });
        }
        st.defined().clear();
        st.defined().addAll(defined);
        st.maybe().clear();
        st.maybe().addAll(maybe);
        st.prodBy().putAll(over);
    }

    /** 계획 C4.1 — IF 의 otherwise 가 아닌 갈래 조건식. */
    void cond(Split sp, Branch br, State st) {
        CondIo io = condIo.get(br.edgeId());
        if (io == null || !io.ok()) {
            String msg = io == null || io.message() == null ? "조건식 정보 없음" : io.message();
            out.add(new RuleSetCheck(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, null, null, null,
                    br.edgeId() + " 갈래 조건식을 읽을 수 없다: " + msg, sp.nodeId(), br.edgeId()));
            return;
        }
        for (IoName v : io.vars()) {
            if (RuleIo.DICT.equals(v.source()) || st.defined().contains(v.name())) {
                continue;
            }
            if (st.maybe().contains(v.name())) {
                out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, null, null, v.name(), br.edgeId() + " 갈래 조건식이 읽는 "
                        + v.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", sp.nodeId(), br.edgeId()));
            } else {
                out.add(new RuleSetCheck(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, null, null, v.name(),
                        br.edgeId() + " 갈래 조건식이 읽는 " + v.name() + "는 이 지점에서 정의되지 않았다", sp.nodeId(), br.edgeId()));
            }
        }
    }

    void rule(RuleStep n, State st) {
        String id = n.ruleId();
        String node = n.nodeId();
        for (IoName c : conds(rules, id)) {
            if (RuleIo.DICT.equals(c.source()) || st.defined().contains(c.name())) {
                continue;
            }
            if (st.maybe().contains(c.name())) {
                out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, id, null, c.name(),
                        id + "가 읽는 " + c.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", node, null));
                continue;
            }
            List<String> later = producers(n, c.name(), Relation.BEFORE, id);
            if (!later.isEmpty()) {
                String cyc = null;
                for (String j : later) {
                    if (reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) {
                        cyc = j;
                        break;
                    }
                }
                if (cyc != null) {
                    out.add(new RuleSetCheck(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, id, cyc, c.name(),
                            id + "와 " + cyc + "가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다", node, null));
                } else {
                    out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, id, later.get(0), c.name(),
                            id + "가 뒤에 도는 " + String.join(", ", later) + "의 결과 변수 " + c.name() + "를 읽는다. " + later.get(0) + "를 " + id
                                    + " 앞으로 옮긴다", node, null));
                }
                continue;
            }
            List<String> excl = producers(n, c.name(), Relation.EXCLUSIVE, null);
            if (!excl.isEmpty()) {
                out.add(new RuleSetCheck(RuleSetCheck.IF_SIBLING, RuleSetCheck.REJECT, id, excl.get(0), c.name(), id + "가 읽는 " + c.name()
                        + "는 같은 IF 의 다른 갈래(" + String.join(", ", excl) + ")에서만 만들어진다. 이 갈래를 타면 값이 없다", node, null));
                continue;
            }
            List<String> par = producers(n, c.name(), Relation.PARALLEL, null);
            if (!par.isEmpty()) {
                out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, id, par.get(0), c.name(), id + "가 병렬 형제 갈래의 "
                        + par.get(0) + "가 만드는 " + c.name() + "를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", node, null));
                continue;
            }
            if (!RuleIo.PROG.equals(c.source())) {
                out.add(new RuleSetCheck(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, id, null, c.name(),
                        id + "의 조건 변수 " + c.name() + "는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", node, null));
            }
        }
        for (IoName x : results(rules, id)) {
            RuleStep sib = parallelEarlier(n, x.name());
            if (sib != null) {
                out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, id, sib.ruleId(), x.name(),
                        "병렬 갈래의 " + sib.ruleId() + "와 " + id + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
            } else {
                RuleStep prev = st.prodBy().get(x.name());
                if (prev != null) {
                    out.add(new RuleSetCheck(RuleSetCheck.DUP_RESULT, RuleSetCheck.WARN, id, prev.ruleId(), x.name(),
                            prev.ruleId() + "와 " + id + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                }
            }
            st.prodBy().put(x.name(), n);
            st.defined().add(x.name());
        }
    }

    /** relation(n, m) == rel 이고 name 을 만드는 룰 노드 m 의 ruleId(깊이 우선, 중복 없음). exceptId 가 있으면 그 ruleId 는 뺀다. */
    private List<String> producers(RuleStep n, String name, Relation rel, String exceptId) {
        List<String> ids = new ArrayList<>();
        for (RuleStep m : tree.ruleSteps()) {
            if (m.nodeId().equals(n.nodeId()) || (exceptId != null && m.ruleId().equals(exceptId)) || ids.contains(m.ruleId())) {
                continue;
            }
            if (tree.relation(n.nodeId(), m.nodeId()) == rel && produces(rules, m.ruleId(), name)) {
                ids.add(m.ruleId());
            }
        }
        return ids;
    }

    /** 깊이 우선으로 n 보다 앞에 있고 n 과 병렬 형제이며 name 을 만드는 첫 룰 노드. */
    private RuleStep parallelEarlier(RuleStep n, String name) {
        for (RuleStep m : tree.ruleSteps()) {
            if (m.nodeId().equals(n.nodeId())) {
                return null;
            }
            if (tree.relation(n.nodeId(), m.nodeId()) == Relation.PARALLEL && produces(rules, m.ruleId(), name)) {
                return m;
            }
        }
        return null;
    }
}
```

기존 정적 도우미 `reaches`·`overlaps`·`produces`·`conds`·`results` 는 그대로 두고 `PathWalk` 에서 쓴다. `import java.util.HashMap` 이 이미 있다.

`State` 를 record 로 둔 것은 mdm/lib 안이라 괜찮다(엔진 계약 규칙 대상 아님). `RuleStep` 은 엔진 `flow` 패키지의 record 라 `equals` 가 값 비교다.

- [ ] **Step 10: 모든 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)`
Expected: PASS. `RuleSetCorpusTest` 37건(기존 18 + 흐름 19), `RuleSetAnalyzerTest`·`RuleSetFlowJsonTest` 통과. 흐름 사례가 틀리면 계산을 다시 따라가 **코드를 고친다**. 기대값이 계획 C3·C4 와 다르다고 판단되면 코퍼스를 고치지 말고 멈춰서 보고한다.

- [ ] **Step 11: 세트 계산 호출처가 여전히 컴파일되는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:compileTestJava --console=plain -q)`
Expected: 성공. `RuleSetCheck` 를 JSON 으로 싣는 응답(`RuleSetViewResult`·`RuleSetSaveResult`·`RuleSetStatusResult`)에는 `nodeId`·`edgeId` 키가 null 로 더해진다. HTTP 테스트가 JSON 전체를 비교하면 실패로 드러난다. 그러면 기대값에 두 키를 더한다.

- [ ] **Step 12: 커밋한다**

```bash
git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJson.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/CondIo.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCheck.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetAnalyzer.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetFlowJsonTest.java \
  src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json
git commit -m "feat(mdm): 흐름 기준 룰 세트 검사와 코퍼스 흐름 사례 19건

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 7: traceSet (노드 단위 실행 기록)

**모델:** opus

`RuleEngine.traceSet` 을 더한다(C5). 같은 흐름 실행을 하되 던지지 않고 노드마다 `NodeTrace` 를 남긴다. 운영 경로 `evaluateSet` 은 기록을 모으지 않는다.

**Files:**
- Create: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleEngine.java`(추상 메서드 추가)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java`(기록 추가 — 아래 전체로 교체)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java`(`reads` 추가)
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java`(`traceSet`, `evaluateSet` 의 FlowRun 생성 인자)
- Modify: 스키마 json(`RunTrace`·`NodeTrace`·`BranchTrace`·`NodeStatus`·`BranchOutcome`)
- Test: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java`
- Test(Modify): `EngineContractSchemaTest.java`(R16-R18, E10-E11, 전수 검사의 enum 목록), `ContractTypeShapeTest.java`, `m-mdm/tests/engine-contract.generated.test.ts`
- Regenerate: `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`
- Modify: `docs/mdm/engine-contract.md` §8

**Interfaces:**
- Consumes: Task 5 의 `FlowRun`·`FlowKeys`·`BranchCondition`·`MdmRuleEngine.prepare`, `testsupport.FlowFixtures`, `rule.fixture.FlowRules`
- Produces:
  - `RuleEngine.traceSet(RuleSetDefinition set, Map<String,Object> record, Instant evalTs) → RunTrace`
  - `record RunTrace(String setId, Instant evalTs, Map<String,Object> input, List<NodeTrace> nodes, Map<String,Object> finalValues, @Nullable List<Violation> violations)` + 중첩 `NodeTrace`·`BranchTrace`·`NodeStatus`·`BranchOutcome`(C5 서명 그대로)
  - 스키마 `$defs`·생성 TS: `RunTrace`, `NodeTrace`, `BranchTrace`, `NodeStatus`, `BranchOutcome`

- [ ] **Step 1: 실패하는 기록 테스트를 쓴다**

`rule/RuleSetTraceTest.java`:

```java
package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** traceSet — 노드 단위 실행 기록(spec §4.2, plan C5). 저장하지 않은 흐름을 직접 받고 판정 오류를 던지지 않는다. */
class RuleSetTraceTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_A10", "A", "X + 10", "X"), calc("R_ERR", "E", "X / 0", "X"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RunTrace trace(FlowDefinition f, Map<String, Object> record) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS);
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    private static List<String> v(List<Violation> vs) {
        return vs.stream().map(x -> x.stage() + "/" + x.code() + "/" + x.ruleId() + "/" + x.rowId() + "/" + x.name()).toList();
    }

    private static FlowDefinition ifFlow(String cond1) {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, cond1), br("b2", "if1", "b", 2, "X > 0"),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    @Test
    void IF_흐름의_노드별_기록() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("20")));
        assertNull(t.violations());
        assertEquals("DRAFT", t.setId());
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:a:RULE:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals("b1", ifNode.chosenEdgeId());
        assertEquals(List.of("b1:TRUE", "b2:NOT_EVALUATED", "bo:NOT_EVALUATED"),
                ifNode.branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
        NodeTrace a = t.nodes().get(2);
        assertEquals("R_A", a.ruleId());
        assertEquals(1, a.ver());
        assertEquals(List.of("X"), List.copyOf(a.reads().keySet()));
        assertNum("21", a.result().results().get("A"));
        assertEquals("if1", t.nodes().get(3).splitId());
        assertNum("21", t.finalValues().get("A"));
        assertEquals(rec("X", new BigDecimal("20")), t.input());
    }

    @Test
    void 그_외를_타면_앞_갈래는_FALSE_그_외는_TRUE() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("-1")));
        assertEquals(List.of("b1:FALSE", "b2:FALSE", "bo:TRUE"),
                t.nodes().get(1).branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
    }

    @Test
    void 조건식_NULL_은_NULL_로_남는다() {
        RunTrace t = trace(ifFlow("FLAG"), rec("X", new BigDecimal("5"), "FLAG", null));
        assertEquals(BranchOutcome.NULL, t.nodes().get(1).branches().get(0).outcome());
        assertEquals("b2", t.nodes().get(1).chosenEdgeId());
    }

    @Test
    void 조건식_오류는_IF_노드를_ERROR_로_남기고_멈춘다() {
        RunTrace t = trace(ifFlow("X + 1"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:ERROR"), kinds(t));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals(BranchOutcome.ERROR, ifNode.branches().get(0).outcome());
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), v(ifNode.violations()));
        assertEquals(ifNode.violations(), t.violations());
    }

    @Test
    void 룰_오류는_그_룰_노드를_ERROR_로_남기고_앞_결과는_남는다() {
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), rule("x", "R_ERR"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "x"), e("e3", "x", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:OK", "3:x:RULE:ERROR"), kinds(t));
        NodeTrace x = t.nodes().get(2);
        assertEquals("R_ERR", x.ruleId());
        assertNull(x.result());
        assertEquals(List.of("X"), List.copyOf(x.reads().keySet()));
        assertNum("2", t.finalValues().get("A"));
        assertEquals(x.violations(), t.violations());
    }

    @Test
    void 저장_전_구조_오류_흐름은_던지지_않고_FLOW_INVALID_와_빈_노드() {
        // Review Focus 4
        FlowDefinition noElse = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(noElse, rec("X", BigDecimal.ONE));
        assertEquals(List.of(), t.nodes());
        assertEquals(List.of("SET_CHECK/FLOW_INVALID/null/null/if1"), v(t.violations()));
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 입력_키가_없으면_빈_노드와_MISSING_KEY() {
        RunTrace t = trace(ifFlow("Z > 0"), rec("X", BigDecimal.ONE));
        assertEquals(List.of(), t.nodes());
        assertEquals(List.of("SET_CHECK/MISSING_KEY/null/null/Z"), v(t.violations()));
    }

    @Test
    void 병렬_기록은_실행_순서와_합친_변수이고_같은_이름은_뒤_갈래가_이긴다() {
        // Review Focus 5 — 형제가 같은 이름(A)을 쓰는 흐름을 검사 없이 두 번 돌려도 같다.
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_A10"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2),
                        e("ea", "a", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RunTrace first = trace(f, rec("X", BigDecimal.ONE));
        RunTrace second = trace(f, rec("X", BigDecimal.ONE));
        NodeTrace p = first.nodes().get(1);
        assertEquals(NodeKind.PARALLEL, p.kind());
        assertEquals(List.of("p1a", "p1b"), p.order());
        NodeTrace pm = first.nodes().get(4);
        assertEquals(NodeKind.MERGE, pm.kind());
        assertEquals(List.of("A"), pm.merged());
        assertNum("11", first.finalValues().get("A"));
        assertEquals(first, second);
    }

    @Test
    void 받은_레코드를_바꾸지_않는다() {
        Map<String, Object> record = rec("X", new BigDecimal("20"));
        trace(ifFlow("X > 10"), record);
        assertEquals(rec("X", new BigDecimal("20")), record);
    }

    @Test
    void 성공_노드는_모두_OK() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("20")));
        assertEquals(List.of(), t.nodes().stream().filter(n -> n.status() != NodeStatus.OK).toList());
    }
}
```

계약 테스트 몫:
- `EngineContractSchemaTest`:
  - `ENUMS` 에 `new EnumPair("E10", "NodeStatus", () -> enumNames(RunTrace.NodeStatus.class), () -> enumOf("NodeStatus"))`, `new EnumPair("E11", "BranchOutcome", () -> enumNames(RunTrace.BranchOutcome.class), () -> enumOf("BranchOutcome"))`
  - `RECORDS` 에 `new RecordPair("R16", RunTrace.class, "RunTrace", Set.of(), Set.of())`, `new RecordPair("R17", RunTrace.NodeTrace.class, "NodeTrace", Set.of(), Set.of())`, `new RecordPair("R18", RunTrace.BranchTrace.class, "BranchTrace", Set.of(), Set.of())`
  - `expr_rule_패키지의_record_enum_은_…` 테스트의 `Stream.of(AstNode.Type.class, …, FunctionSets.Slot.class)` 에 `RunTrace.NodeStatus.class, RunTrace.BranchOutcome.class` 를 더한다(rule 패키지 enum 이므로 전수 검사 대상이다).
  - import `kr.dongkuk.maru.mdm.engine.rule.RunTrace`.
- `ContractTypeShapeTest.CONTRACT_TYPES` 의 rule 묶음에 `"rule.RunTrace", "rule.RunTrace$NodeTrace", "rule.RunTrace$BranchTrace", "rule.RunTrace$NodeStatus", "rule.RunTrace$BranchOutcome",` 를 더한다.
- `engine-contract.generated.test.ts` 의 `EXPECTED_EXPORTS` 에 `"RunTrace", "NodeTrace", "BranchTrace", "NodeStatus", "BranchOutcome",` 를 더하고 주석 개수를 `(49개)` 로 고친다.

- [ ] **Step 2: 실패를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --tests '*RuleSetTraceTest' --console=plain)`
Expected: 컴파일 실패 — `cannot find symbol: class RunTrace`, `method traceSet`

- [ ] **Step 3: 계약 타입과 입구를 더한다**

`rule/RunTrace.java`:

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
 */
public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations) {

    /**
     * 노드 하나의 기록. 종류마다 쓰는 칸만 채우고 나머지는 null 이다.
     * RULE: ruleId·ver·reads(실행 직전 ctx 에서 이 룰이 읽은 값)·result. IF: branches·chosenEdgeId. PARALLEL: order.
     * MERGE: splitId·merged(병렬 합류에서 합친 결과 이름). ERROR 노드: violations.
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

    public enum NodeStatus { OK, ERROR }

    /** NOT_EVALUATED = 앞 갈래가 참이라 평가하지 않았다(그 외 선은 안 골랐을 때). */
    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
```

`RuleEngine.java` 에 `evaluateSet` 선언 바로 뒤로 넣는다(import `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition`).

```java
    /**
     * 세트 실행 기록(룰 세트 흐름도 spec §4.2). 저장된 ID 가 아니라 정의를 받으므로 저장하지 않은 흐름도 실행한다.
     * 판정 오류를 던지지 않고 기록에 담는다. 운영 경로({@link #evaluateSet})는 기록을 모으지 않는다.
     */
    RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs);
```

스키마 json — `"PathStep"` 정의 바로 뒤에 넣는다. 흐름 계약과 같게 null 허용 칸도 required 에 두고 `type: [..., "null"]` 로 적는다. 단 `result` 는 `$ref`(RuleResult) 라 `type` 에 null 을 섞을 수 없으므로 **required 에서만 뺀다** — 스키마 대조 규칙(선택 = required 아님 또는 type 에 null)으로 `@Nullable` 과 맞는다. 생성 TS 에서는 `result?: RuleResult` 가 된다.

```json
    "RunTrace": {
      "description": "룰 세트 실행 기록(Java RunTrace, 룰 세트 흐름도 spec §4.2). 판정 오류는 던지지 않고 violations 에 담는다. 실행 전 오류면 nodes 가 비었다.",
      "type": "object",
      "properties": {
        "setId": { "type": "string" },
        "evalTs": { "$ref": "#/$defs/LocalDateTime" },
        "input": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "nodes": { "type": "array", "items": { "$ref": "#/$defs/NodeTrace" } },
        "finalValues": { "type": "object", "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "violations": { "type": ["array", "null"], "items": { "$ref": "#/$defs/Violation" } }
      },
      "required": ["setId", "evalTs", "input", "nodes", "finalValues", "violations"],
      "additionalProperties": false
    },
    "NodeTrace": {
      "description": "노드 하나의 기록(Java RunTrace.NodeTrace). RULE: ruleId·ver·reads·result, IF: branches·chosenEdgeId, PARALLEL: order, MERGE: splitId·merged, ERROR: violations.",
      "type": "object",
      "properties": {
        "seq": { "type": "integer" },
        "nodeId": { "type": "string" },
        "kind": { "$ref": "#/$defs/FlowNodeKind" },
        "status": { "$ref": "#/$defs/NodeStatus" },
        "ruleId": { "type": ["string", "null"] },
        "ver": { "type": ["integer", "null"] },
        "reads": { "type": ["object", "null"], "additionalProperties": { "$ref": "#/$defs/TypedValue" } },
        "result": { "$ref": "#/$defs/RuleResult" },
        "branches": { "type": ["array", "null"], "items": { "$ref": "#/$defs/BranchTrace" } },
        "chosenEdgeId": { "type": ["string", "null"] },
        "order": { "type": ["array", "null"], "items": { "type": "string" } },
        "splitId": { "type": ["string", "null"] },
        "merged": { "type": ["array", "null"], "items": { "type": "string" } },
        "violations": { "type": ["array", "null"], "items": { "$ref": "#/$defs/Violation" } }
      },
      "required": ["seq", "nodeId", "kind", "status", "ruleId", "ver", "reads", "branches", "chosenEdgeId", "order", "splitId", "merged", "violations"],
      "additionalProperties": false
    },
    "BranchTrace": {
      "description": "IF 갈래 선 하나의 평가(Java RunTrace.BranchTrace). message 는 ERROR 원인.",
      "type": "object",
      "properties": {
        "edgeId": { "type": "string" },
        "outcome": { "$ref": "#/$defs/BranchOutcome" },
        "message": { "type": ["string", "null"] }
      },
      "required": ["edgeId", "outcome", "message"],
      "additionalProperties": false
    },
    "NodeStatus": { "description": "노드 실행 상태(Java RunTrace.NodeStatus).", "enum": ["OK", "ERROR"] },
    "BranchOutcome": { "description": "IF 갈래 평가 결과(Java RunTrace.BranchOutcome). NOT_EVALUATED = 앞 갈래가 참이라 평가하지 않음.", "enum": ["TRUE", "FALSE", "NULL", "ERROR", "NOT_EVALUATED"] },
```

- [ ] **Step 4: FlowKeys 에 reads 를 더한다**

`FlowKeys.java` 의 `needed` 아래에 넣는다(import `java.util.Collections`, `java.util.LinkedHashMap`).

```java
    /** 이 룰이 읽는 입력 이름 가운데 지금 ctx 에 있는 것의 값(needed 순서, null 값 유지) — 기록 전용. */
    static Map<String, Object> reads(RuleDefinition def, Map<String, Object> ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String name : needed(def)) {
            if (ctx.containsKey(name) && !out.containsKey(name)) {
                out.put(name, ctx.get(name));
            }
        }
        return Collections.unmodifiableMap(out);
    }
```

- [ ] **Step 5: FlowRun 에 기록을 더한다(전체 교체)**

`rule/FlowRun.java` 를 아래 전체로 바꾼다. `tracing=false` 면 Task 5 와 같은 일만 하고 `NodeTrace` 를 만들지 않는다.

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
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다. 이 패키지에는 record·enum 을 새로 두지 않는다.
 */
final class FlowRun {

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;
    private final boolean tracing;

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
            Map<String, Object> record, Instant ts, boolean tracing) {
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.tracing = tracing;
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        plain(tree.startId(), NodeKind.START);
        seq(tree.root(), ctx, finalValues);
        plain(tree.endId(), NodeKind.END);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations));
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

    private void plain(String nodeId, NodeKind kind) {
        begin(nodeId, kind);
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
        curBranches = new ArrayList<>();
        Branch chosen = null;
        for (Branch br : s.branches()) {
            if (br.otherwise()) {
                continue;
            }
            if (chosen != null) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                continue;
            }
            BranchCondition c = BranchCondition.test(runner, br.cond(), ctx, ts);
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
        merge(s, null);
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
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
        merge(s, merged);
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). */
    private void merge(Split s, List<String> merged) {
        begin(s.mergeId(), NodeKind.MERGE);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null));
        }
    }
}
```

- [ ] **Step 6: MdmRuleEngine 에 traceSet 을 더한다**

`evaluateSet` 의 `new FlowRun(…, record, ts)` 를 `new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, false)` 로 바꾸고, `evaluateSet` 바로 뒤에 넣는다.

```java
    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(set, "set");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        Map<String, Object> input = Collections.unmodifiableMap(new LinkedHashMap<>(record));
        Prepared p;
        try {
            p = prepare(set, record, ts);
        } catch (EngineEvaluationException e) {
            return new RunTrace(set.setId(), ts, input, List.of(), Map.of(), e.violations());
        }
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true);
        try {
            run.run();
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues), null);
        } catch (EngineEvaluationException e) {
            run.nodes.add(run.failed(e.violations()));
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                    e.violations());
        }
    }
```

주의: `Map.of()`·`Collections.unmodifiableMap` 은 null 값을 담을 수 있어야 한다 — `finalValues` 는 `LinkedHashMap` 을 감싸므로 null 값을 유지한다. `input` 도 같다.

- [ ] **Step 7: 생성 TS·계약 문서**

Run: `pnpm --filter @dk-oasis/m-mdm gen:contract`
Expected: 생성 파일에 `RunTrace`·`NodeTrace`·`BranchTrace` 인터페이스와 `NodeStatus`·`BranchOutcome` 타입이 생긴다.

`docs/mdm/engine-contract.md` §8 의 룰 세트 결과 문단 바로 뒤에 넣는다.

```markdown
**실행 기록 `RuleEngine.traceSet(set, record, evalTs) → RunTrace(setId, evalTs, input, nodes, finalValues, violations)`**: 저장된 세트 ID 가 아니라 정의(`RuleSetDefinition`)를 받으므로 저장하지 않은 흐름도 실행한다. 판정 오류를 던지지 않는다. 구조·존재·입력 키 오류면 `nodes` 가 비고 `violations` 에 위반이 있다. 실행 중 오류면 처리 중이던 노드를 `status=ERROR` 로 남기고 멈춘다. 끝까지 가면 `violations` 는 null 이다. 노드 기록 `NodeTrace(seq, nodeId, kind, status, ruleId, ver, reads, result, branches, chosenEdgeId, order, splitId, merged, violations)` 는 종류마다 쓰는 칸만 채운다(RULE: `ruleId`·`ver`·`reads`·`result`, IF: `branches`·`chosenEdgeId`, PARALLEL: `order`, MERGE: `splitId`·`merged`). IF 갈래 평가 `BranchTrace(edgeId, outcome, message)` 의 `outcome` 은 `TRUE`·`FALSE`·`NULL`·`ERROR`·`NOT_EVALUATED` 다. 운영 경로 `evaluateSet` 은 기록을 모으지 않는다. 운영 기록 저장은 이 JSON 을 그대로 쓰면 된다(spec §4.2, A8 로 미룸).
```

- [ ] **Step 8: 문서·스키마 수동 대조**

Run: `grep -n '"RunTrace"\|"NodeTrace"\|"BranchTrace"\|"NodeStatus"\|"BranchOutcome"' src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json && grep -n 'RunTrace(setId\|NodeTrace(seq\|BranchTrace(edgeId' docs/mdm/engine-contract.md`
Expected: 스키마 5개 정의가 모두 나오고, 문서의 괄호 안 필드 목록이 스키마 속성 이름·순서와 같다.

- [ ] **Step 9: 통과를 확인한다**

Run: `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
Expected: PASS — `RuleSetTraceTest` 전부, `RuleSetFlowEvaluationTest`, 기존 세트 테스트, 계약 대조·형태 테스트.

Run: `pnpm --filter @dk-oasis/m-mdm test tests/engine-contract.generated.test.ts && pnpm --filter @dk-oasis/m-mdm lint`
Expected: PASS, exit 0

Run: `(cd src/backend/mdm && ../gradlew :lib:compileJava :lib:compileTestJava --console=plain -q)`
Expected: 성공(`RuleEngine` 구현체는 `MdmRuleEngine` 하나뿐이다)

- [ ] **Step 10: 커밋**

```bash
git add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RunTrace.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/RuleEngine.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowRun.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/FlowKeys.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java \
  src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetTraceTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract/EngineContractSchemaTest.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractTypeShapeTest.java \
  src/frontend/m-mdm/tests/engine-contract.generated.test.ts \
  src/frontend/m-mdm/src/contract/engine-contract.generated.ts \
  docs/mdm/engine-contract.md
git commit -m "feat(mdm-engine): 룰 세트 실행 기록 traceSet 추가

저장하지 않은 흐름도 정의로 받아 실행하고, 노드마다 NodeTrace(룰 읽은 값·
결과, IF 갈래 평가, 병렬 순서, 합친 변수)를 남긴다. 판정 오류는 던지지 않고
멈춘 노드를 ERROR 로 기록한다. evaluateSet 은 기록을 모으지 않는다(plan D7).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 8: 화면 흐름 모델(flow-model.ts)과 흐름 기준 세트 검사(set-model.ts)

**모델:** sonnet

**Files:**
- Create: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts`
- Create: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts`
- Modify: `src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts`
- Modify: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 이 생성한 `src/frontend/m-mdm/src/contract/engine-contract.generated.ts` 의 `RuleSetFlow`·`FlowNode`·`FlowEdge`·`FlowNodeKind`(C1: `FlowNode = { id; kind; ruleId: string|null; splitId: string|null; label: string|null }`, `FlowEdge = { id; from; to; order: number|null; cond: string|null; otherwise: boolean; label: string|null }`)
  - Task 6 이 더한 `rule-set-corpus.json` 흐름 사례와 그 총수(Java `RuleSetCorpusTest.MIN_CASES`)
  - 공유 계약 C3(구조 문구·순서), C4(검사 알고리즘·문구), C7(이름)
- Produces:
  - `flow-model.ts`: `parseFlow(flow: RuleSetFlow): FlowParse`, `linearFlow(ids: readonly string[]): RuleSetFlow`, `flowRuleIds(flow: RuleSetFlow, parsed?: FlowParse): string[]`, `class FlowTree { readonly root: Seq; readonly startId: string; readonly endId: string; ruleSteps(): RuleStep[]; ruleIds(): string[]; branched(): boolean; relation(a: string, b: string): Relation }`, 타입 `FlowIssue`·`FlowIssueCode`·`Block`·`Seq`·`RuleStep`·`Split`·`Branch`·`Relation`·`FlowParse`
  - `set-model.ts`: `flowChecks(flow, rules, condIo): RuleSetCheck[]`, `flowIo(flow, rules): SetIo`, `flowDeps(flow, rules): Record<string, string[]>`. `setChecks(ids, rules)` 는 서명 그대로
  - `types.ts`: `CondIo`, `CondIoMap`, `RuleSetCheck.nodeId`·`edgeId`, `RuleSetCheckCode` 새 값 7개
  - Task 12 가 `RuleSetCheck` 새 칸과 `RuleSetFlow` 타입을 쓴다

**코퍼스 흐름 사례 형식(Task 6 과 공통, 두 러너가 같게 읽는다):**

```json
{
  "name": "IF — 일부 갈래 결과를 합류 뒤에서 읽음",
  "ids": ["R1", "R2", "RZ"],
  "flow": {
    "version": 1,
    "nodes": [
      { "id": "start", "kind": "START" },
      { "id": "if1", "kind": "IF" },
      { "id": "r1", "kind": "RULE", "ruleId": "R1" },
      { "id": "r2", "kind": "RULE", "ruleId": "R2" },
      { "id": "m1", "kind": "MERGE", "splitId": "if1" },
      { "id": "rz", "kind": "RULE", "ruleId": "RZ" },
      { "id": "end", "kind": "END" }
    ],
    "edges": [
      { "id": "e1", "from": "start", "to": "if1" },
      { "id": "e2", "from": "if1", "to": "r1", "order": 1, "cond": "A = 1" },
      { "id": "e3", "from": "if1", "to": "r2", "otherwise": true },
      { "id": "e4", "from": "r1", "to": "m1" },
      { "id": "e5", "from": "r2", "to": "m1" },
      { "id": "e6", "from": "m1", "to": "rz" },
      { "id": "e7", "from": "rz", "to": "end" }
    ]
  },
  "condIo": { "e2": { "ok": true, "message": null, "vars": [{ "name": "A", "source": "DICT" }] } },
  "rules": { "R1": { "exists": true, "status": "INUSE", "releasedVer": 1, "conds": [{ "name": "A", "source": "DICT" }], "results": [{ "name": "X" }] } },
  "expect": { "io": { "inputs": [], "results": [] }, "deps": {}, "checks": [ { "code": "FLOW_PARTIAL", "severity": "WARN", "ruleId": "RZ", "varName": "Y", "message": "…", "nodeId": "rz" } ] }
}
```

- 읽기 규칙: 노드·선의 빠진 칸은 `null`(선 `otherwise` 는 `false`)로 채운다. `condIo` 가 없으면 빈 맵이다. `ids` 는 흐름을 펼친 룰 목록(`flowRuleIds`)과 같아야 하고 러너가 이것을 확인한다. `flow` 가 없는 사례(기존 18건)는 목록 사례로 읽고 기대 checks 의 `nodeId`·`edgeId` 는 `null` 이다.
- 위 예시는 형식 설명용이다. 실제 사례 JSON 은 Task 6 이 쓰고, 이 태스크는 러너만 바꾼다.

- [ ] **Step 1: types.ts 에 검사 칸·코드·조건식 IO 추가**

`types.ts` 의 `RuleSetCheckCode`·`RuleSetCheck` 를 아래로 바꾸고 `CondIo`·`CondIoMap` 을 `RuleIoMap` 아래에 더한다.

```ts
/**
 * IF 갈래 조건식 하나를 서버가 미리 푼 결과(계획 C4). ok=false 면 message 는 파싱 오류 문구이고 vars 는 비어 있다.
 * vars 의 source 는 DICT(컬럼 사전에 있음) 또는 NONE 이다.
 */
export interface CondIo {
  ok: boolean;
  message: string | null;
  vars: IoName[];
}

/** 선 ID → 조건식 IO. IF 의 "그 외" 가 아닌 선만 키가 있다. */
export type CondIoMap = Readonly<Record<string, CondIo | undefined>>;
```

```ts
export type RuleSetCheckCode =
  | "EMPTY"
  | "RULE_NOT_FOUND"
  | "RULE_DEPRECATED"
  | "NO_RELEASED"
  | "ORDER"
  | "CYCLE"
  | "UNKNOWN_INPUT"
  | "DUP_RESULT"
  | "FLOW_STRUCTURE"
  | "FLOW_IF_ELSE"
  | "FLOW_COND"
  | "IF_SIBLING"
  | "PAR_SIBLING"
  | "FLOW_PARTIAL"
  | "FLOW_READONLY";

/**
 * 저장 시 검사 한 건(§6.3, 계획 C4). 없는 칸은 null — EMPTY 는 ruleId 도 null, 1단계는 otherRuleId·varName 이 null.
 * nodeId·edgeId 는 흐름 위치(D8)이고 목록 세트 검사(`setChecks`)는 둘 다 null 이다.
 */
export interface RuleSetCheck {
  code: RuleSetCheckCode;
  severity: RuleSetSeverity;
  ruleId: string | null;
  otherRuleId: string | null;
  varName: string | null;
  message: string;
  nodeId: string | null;
  edgeId: string | null;
}
```

- [ ] **Step 2: flow-model.test.ts 실패 테스트 작성**

`src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts` 를 만든다. 구조 문구(C3 a~g5, 2단계)마다 사례 하나, 관계·펼치기·한 줄 흐름 사례를 둔다.

```ts
// 계획 C2·C3 — 흐름 구조 해석 `flow-model.ts`(엔진 FlowParser·FlowTree 의 TS 짝). 문구·순서의 서버 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { flowRuleIds, linearFlow, parseFlow, type FlowIssue } from "../../../pages/dme/ruleSetEdit/flow-model";

const node = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({
  id,
  kind,
  ruleId: null,
  splitId: null,
  label: null,
  ...over,
});
const edge = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
  id,
  from,
  to,
  order: null,
  cond: null,
  otherwise: false,
  label: null,
  ...over,
});
const flow = (nodes: FlowNode[], edges: FlowEdge[]): RuleSetFlow => ({ version: 1, nodes, edges });
const S = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_STRUCTURE", nodeId, edgeId, message });
const E = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_IF_ELSE", nodeId, edgeId, message });

/** start → if1 ─e2(1, A = 1)→ r1 ─┐, if1 ─e3(그 외)→ r2 ─┤ m1 → end */
function ifNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("if1", "IF"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("end", "END"),
  ];
}
function ifEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "if1"),
    edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
    edge("e3", "if1", "r2", { otherwise: true }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
/** start → p1 ─e2(1)→ r1 ─┐, p1 ─e3(2)→ r2 ─┤ m1 → end */
function parNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("p1", "PARALLEL"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "p1" }),
    node("end", "END"),
  ];
}
function parEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "p1"),
    edge("e2", "p1", "r1", { order: 1 }),
    edge("e3", "p1", "r2", { order: 2 }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
const withEdge = (edges: FlowEdge[], id: string, over: Partial<FlowEdge>) => edges.map((e) => (e.id === id ? { ...e, ...over } : e));
const withNode = (nodes: FlowNode[], id: string, over: Partial<FlowNode>) => nodes.map((n) => (n.id === id ? { ...n, ...over } : n));

describe("parseFlow — 정상 흐름과 블록 트리", () => {
  it("IF 흐름은 갈래 두 개짜리 Split 하나이고 그 외 갈래가 마지막이다", () => {
    const p = parseFlow(flow(ifNodes(), ifEdges()));
    expect(p.issues).toEqual([]);
    expect(p.tree!.root).toEqual({
      type: "SEQ",
      items: [
        {
          type: "SPLIT",
          nodeId: "if1",
          kind: "IF",
          mergeId: "m1",
          branches: [
            { edgeId: "e2", cond: "A = 1", otherwise: false, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r1", ruleId: "R1" }] } },
            { edgeId: "e3", cond: null, otherwise: true, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r2", ruleId: "R2" }] } },
          ],
        },
      ],
    });
    expect(p.tree!.ruleIds()).toEqual(["R1", "R2"]);
    expect(p.tree!.branched()).toBe(true);
  });

  it("IF 갈래는 order 오름차순 뒤 그 외 순서다(선 배열 순서와 무관)", () => {
    const nodes = [...ifNodes(), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e3", "if1", "r2", { otherwise: true }),
      edge("e2", "if1", "r1", { order: 2, cond: "A = 2" }),
      edge("e7", "if1", "r3", { order: 1, cond: "A = 1" }),
      edge("e4", "r1", "m1"),
      edge("e5", "r2", "m1"),
      edge("e8", "r3", "m1"),
      edge("e6", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches.map((b) => b.edgeId)).toEqual(["e7", "e2", "e3"]);
    expect(p.tree!.ruleIds()).toEqual(["R3", "R1", "R2"]);
  });

  it("빈 갈래(분기에서 합류로 바로)는 빈 Seq 이고 정상이다 — 그 외 빈 갈래 포함", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }), edge("e3", "if1", "m1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches[1].body).toEqual({ type: "SEQ", items: [] });
  });

  it("같은 룰이 두 갈래에 있으면 ruleIds 는 중복 없이 한 번, ruleSteps 는 노드마다", () => {
    const nodes = withNode(ifNodes(), "r2", { ruleId: "R1" });
    const p = parseFlow(flow(nodes, ifEdges()));
    expect(p.tree!.ruleIds()).toEqual(["R1"]);
    expect(p.tree!.ruleSteps().map((s) => s.nodeId)).toEqual(["r1", "r2"]);
  });

  it("분기가 없으면 branched=false", () => {
    expect(parseFlow(linearFlow(["A", "B"])).tree!.branched()).toBe(false);
  });
});

describe("parseFlow — 1단계 구조 오류(C3, 모두 모은다)", () => {
  it("a 노드 ID 가 겹친다 — 뒤 노드만 보고하고 첫 노드로 계속 본다", () => {
    const p = parseFlow(flow([...ifNodes(), node("r1", "RULE", { ruleId: "R9" })], ifEdges()));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("r1", "노드 ID r1가 겹친다")]);
  });

  it("b1 시작 노드가 없으면 개수 오류 다음에 차수 오류", () => {
    const p = parseFlow(flow(ifNodes().filter((n) => n.id !== "start"), ifEdges().filter((e) => e.id !== "e1")));
    expect(p.issues).toEqual([S(null, "시작 노드가 0개다. 정확히 1개여야 한다"), S("if1", "if1의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("b2 끝 노드가 둘이다", () => {
    const p = parseFlow(flow([...ifNodes(), node("end2", "END")], ifEdges()));
    expect(p.issues).toEqual([S(null, "끝 노드가 2개다. 정확히 1개여야 한다"), S("end2", "end2의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("c 없는 노드를 가리키는 선은 차수 계산에서 빠진다", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e6", { to: "nowhere" })));
    expect(p.issues).toEqual([
      S("nowhere", "선 e6가 없는 노드 nowhere를 가리킨다", "e6"),
      S("m1", "m1의 나가는 선이 0개다. 1개여야 한다"),
      S("end", "end의 들어오는 선이 0개다. 1개여야 한다"),
    ]);
  });

  it("d1·d2 차수 — 노드 배열 순서로 나간다·들어온다", () => {
    const p = parseFlow(flow(ifNodes(), [...ifEdges(), edge("e7", "r1", "r2")]));
    expect(p.issues).toEqual([S("r1", "r1의 나가는 선이 2개다. 1개여야 한다"), S("r2", "r2의 들어오는 선이 2개다. 1개여야 한다")]);
  });

  it("d 분기의 나가는 선이 하나면 2개 이상이어야 한다", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e3", "if1", "r1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([S("if1", "if1의 나가는 선이 1개다. 2개 이상이어야 한다"), S("m1", "m1의 들어오는 선이 1개다. 2개 이상이어야 한다")]);
  });

  it("e 룰 노드에 룰 ID 가 없다", () => {
    const p = parseFlow(flow(withNode(ifNodes(), "r1", { ruleId: " " }), ifEdges()));
    expect(p.issues).toEqual([S("r1", "룰 노드 r1에 룰 ID가 없다")]);
  });

  it("f1·f2 합류의 짝 분기가 없으면 그 분기를 닫는 합류도 0개다", () => {
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: "zz" }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 zz가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: null }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 -가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
  });

  it("g1·g2·g4 그 외 갈래가 없으면 IF_ELSE 둘 다음 순서 없음", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e3", { otherwise: false })));
    expect(p.issues).toEqual([
      E("if1", 'IF if1에 "그 외" 갈래가 0개다. 정확히 1개여야 한다'),
      E("if1", "IF if1의 갈래 e3에 조건식이 없다", "e3"),
      S("if1", "분기 if1의 갈래 e3에 순서가 없다", "e3"),
    ]);
  });

  it("g2 조건식이 공백이다", () => {
    expect(parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e2", { cond: "  " }))).issues).toEqual([E("if1", "IF if1의 갈래 e2에 조건식이 없다", "e2")]);
  });

  it("g3 병렬 갈래에는 조건·그 외를 둘 수 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { cond: "A = 1" }))).issues).toEqual([
      S("p1", "병렬 분기 p1의 갈래 e3에는 조건을 둘 수 없다", "e3"),
    ]);
  });

  it("g4 병렬 갈래 순서가 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: null }))).issues).toEqual([S("p1", "분기 p1의 갈래 e3에 순서가 없다", "e3")]);
  });

  it("g5 갈래 순서가 겹친다 — 두 번째 선부터", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: 1 }))).issues).toEqual([S("p1", "분기 p1의 갈래 순서 1가 겹친다", "e3")]);
  });
});

describe("parseFlow — 2단계 구조 오류(첫 오류에서 멈춤)", () => {
  it("갈래가 짝 합류가 아닌 다른 합류로 나간다", () => {
    // if1 의 e2 갈래 안에 if2 가 있고, if2 의 첫 갈래(r1)가 m2 가 아닌 m1 로 간다. 차수는 모두 맞다.
    const nodes = [
      node("start", "START"),
      node("if1", "IF"),
      node("if2", "IF"),
      node("r1", "RULE", { ruleId: "R1" }),
      node("r2", "RULE", { ruleId: "R2" }),
      node("r3", "RULE", { ruleId: "R3" }),
      node("m2", "MERGE", { splitId: "if2" }),
      node("m1", "MERGE", { splitId: "if1" }),
      node("end", "END"),
    ];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e2", "if1", "if2", { order: 1, cond: "A = 1" }),
      edge("e3", "if1", "r3", { otherwise: true }),
      edge("e5", "if2", "r1", { order: 1, cond: "B = 1" }),
      edge("e6", "if2", "r2", { otherwise: true }),
      edge("e7", "r1", "m1"),
      edge("e8", "r2", "m2"),
      edge("e9", "r3", "m2"),
      edge("e10", "m2", "m1"),
      edge("e11", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("m1", "갈래가 m2에서 닫히지 않고 m1로 나간다")]);
  });

  it("시작에서 닿지 않는 노드(섬 순환)는 도달할 수 없다", () => {
    const nodes = [node("start", "START"), node("r1", "RULE", { ruleId: "R1" }), node("end", "END"), node("r2", "RULE", { ruleId: "R2" }), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "r2", "r3"), edge("e4", "r3", "r2")];
    expect(parseFlow(flow(nodes, edges)).issues).toEqual([S("r2", "r2에 도달할 수 없다")]);
  });
});

describe("FlowTree.relation — 같은 경로·IF 형제·병렬 형제", () => {
  // start → r0 → if1 { e2(1): p1 { ea(1): ra, eb(2): rb } mp ; e3(그 외): rc } m1 → rz → end
  const nodes = [
    node("start", "START"),
    node("r0", "RULE", { ruleId: "R0" }),
    node("if1", "IF"),
    node("p1", "PARALLEL"),
    node("ra", "RULE", { ruleId: "RA" }),
    node("rb", "RULE", { ruleId: "RB" }),
    node("mp", "MERGE", { splitId: "p1" }),
    node("rc", "RULE", { ruleId: "RC" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("rz", "RULE", { ruleId: "RZ" }),
    node("end", "END"),
  ];
  const edges = [
    edge("e1", "start", "r0"),
    edge("e1b", "r0", "if1"),
    edge("e2", "if1", "p1", { order: 1, cond: "X = 1" }),
    edge("e3", "if1", "rc", { otherwise: true }),
    edge("ea", "p1", "ra", { order: 1 }),
    edge("eb", "p1", "rb", { order: 2 }),
    edge("ea2", "ra", "mp"),
    edge("eb2", "rb", "mp"),
    edge("emp", "mp", "m1"),
    edge("ec", "rc", "m1"),
    edge("em1", "m1", "rz"),
    edge("ez", "rz", "end"),
  ];
  const tree = parseFlow(flow(nodes, edges)).tree!;

  it("깊이 우선 순서는 R0, RA, RB, RC, RZ 다", () => {
    expect(tree.ruleSteps().map((s) => s.ruleId)).toEqual(["R0", "RA", "RB", "RC", "RZ"]);
  });

  it.each([
    ["ra", "ra", "SAME"],
    ["r0", "ra", "BEFORE"],
    ["rz", "r0", "AFTER"],
    ["ra", "rb", "PARALLEL"],
    ["rb", "ra", "PARALLEL"],
    ["ra", "rc", "EXCLUSIVE"],
    ["rc", "rz", "BEFORE"],
    ["p1", "ra", "BEFORE"],
    ["if1", "rz", "BEFORE"],
    ["p1", "rc", "EXCLUSIVE"],
  ] as const)("relation(%s, %s) = %s", (a, b, want) => {
    expect(tree.relation(a, b)).toBe(want);
  });

  it("흐름에 없는 노드면 예외", () => {
    expect(() => tree.relation("ra", "nope")).toThrow("흐름에 없는 노드: nope");
  });
});

describe("linearFlow·flowRuleIds", () => {
  it("한 줄 흐름의 노드·선 ID 는 start, r1..rN, end / e1..e(N+1) 이다", () => {
    expect(linearFlow(["A", "B"])).toEqual({
      version: 1,
      nodes: [node("start", "START"), node("r1", "RULE", { ruleId: "A" }), node("r2", "RULE", { ruleId: "B" }), node("end", "END")],
      edges: [edge("e1", "start", "r1"), edge("e2", "r1", "r2"), edge("e3", "r2", "end")],
    });
    expect(linearFlow([])).toEqual({ version: 1, nodes: [node("start", "START"), node("end", "END")], edges: [edge("e1", "start", "end")] });
  });

  it("구조 오류가 있으면 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이", () => {
    const nodes = [...withNode(ifNodes(), "r2", { ruleId: "R1" }), node("rx", "RULE", { ruleId: "RX" })];
    expect(flowRuleIds(flow(nodes, ifEdges()))).toEqual(["R1", "RX"]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-model.test.ts`
Expected: FAIL — `Failed to resolve import "../../../pages/dme/ruleSetEdit/flow-model"`(파일 없음).

- [ ] **Step 4: flow-model.ts 구현**

`src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts` 를 만든다.

```ts
/**
 * 룰 세트 흐름 구조 해석 — 엔진 `kr.dongkuk.maru.mdm.engine.flow.FlowParser`·`FlowTree` 의 TS 짝(spec §3.2, 계획 C2·C3).
 * 구조 검사 문구·순서, 블록 트리, 노드 관계가 Java 와 같아야 하고 `rule-set-corpus.json` 의 흐름 사례가 두 구현을 묶는다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. React 의존 없는 순수 함수다.
 *
 * 중복 노드 ID 는 첫 노드만 본다(a 오류로 보고한다). 빠진 칸(undefined)은 null 로 본다 — 서버 FLOW_JSON 과 코퍼스가 null 칸을 뺄 수 있다.
 */
import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

export type FlowIssueCode = "FLOW_STRUCTURE" | "FLOW_IF_ELSE";

export interface FlowIssue {
  code: FlowIssueCode;
  nodeId: string | null;
  edgeId: string | null;
  message: string;
}

export interface Seq {
  type: "SEQ";
  items: Block[];
}

export interface RuleStep {
  type: "RULE";
  nodeId: string;
  ruleId: string;
}

export interface Branch {
  edgeId: string;
  cond: string | null;
  otherwise: boolean;
  label: string | null;
  body: Seq;
}

/** branches 는 실행 순서(IF: order 오름차순 뒤 그 외, PARALLEL: order 오름차순). */
export interface Split {
  type: "SPLIT";
  nodeId: string;
  kind: "IF" | "PARALLEL";
  mergeId: string;
  branches: Branch[];
}

export type Block = Seq | RuleStep | Split;

export type Relation = "SAME" | "BEFORE" | "AFTER" | "EXCLUSIVE" | "PARALLEL";

export interface FlowParse {
  tree: FlowTree | null;
  issues: FlowIssue[];
}

interface Degree {
  min: number;
  max: number;
}

const ONE: Degree = { min: 1, max: 1 };
const NONE: Degree = { min: 0, max: 0 };
const MANY: Degree = { min: 2, max: Number.POSITIVE_INFINITY };
const IN_DEGREE: Record<FlowNodeKind, Degree> = { START: NONE, END: ONE, RULE: ONE, IF: ONE, PARALLEL: ONE, MERGE: MANY };
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE };

const degreeText = (d: Degree) => (d.max === 0 ? "없어야 한다" : d.max === 1 ? "1개여야 한다" : "2개 이상이어야 한다");
/** Java `String.isBlank()` 과 같은 판정(C3 공백 규칙). `trim()` 은 NBSP·BOM 을 공백으로 봐 Java 와 갈라진다. */
const JAVA_WS = /^(?:[\t\n\u000B\f\r\u001C-\u001F]|(?![\u00A0\u2007\u202F])[\p{Zs}\p{Zl}\p{Zp}])*$/u;
const blank = (s: string | null | undefined) => s == null || JAVA_WS.test(s);
const orNull = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);
const isSplit = (k: FlowNodeKind) => k === "IF" || k === "PARALLEL";
const issue = (code: FlowIssueCode, nodeId: string | null, edgeId: string | null, message: string): FlowIssue => ({ code, nodeId, edgeId, message });

class ParseStop extends Error {
  constructor(readonly issue: FlowIssue) {
    super(issue.message);
  }
}

/** 구조 검사(C3) 후 블록 트리를 만든다. 1단계 오류는 모두 모아 tree=null, 2단계 오류는 첫 오류에서 멈춘다. */
export function parseFlow(flow: RuleSetFlow): FlowParse {
  const nodes = flow.nodes ?? [];
  const edges = flow.edges ?? [];
  const issues: FlowIssue[] = [];

  // a — 겹치는 노드 ID(뒤 노드만 보고, 첫 노드로 계속 본다)
  const byId = new Map<string, FlowNode>();
  const unique: FlowNode[] = [];
  for (const n of nodes) {
    if (byId.has(n.id)) issues.push(issue("FLOW_STRUCTURE", n.id, null, `노드 ID ${n.id}가 겹친다`));
    else {
      byId.set(n.id, n);
      unique.push(n);
    }
  }

  // b1·b2 — 시작·끝 개수
  const startCount = unique.filter((n) => n.kind === "START").length;
  if (startCount !== 1) issues.push(issue("FLOW_STRUCTURE", null, null, `시작 노드가 ${startCount}개다. 정확히 1개여야 한다`));
  const endCount = unique.filter((n) => n.kind === "END").length;
  if (endCount !== 1) issues.push(issue("FLOW_STRUCTURE", null, null, `끝 노드가 ${endCount}개다. 정확히 1개여야 한다`));

  // c — 없는 노드를 가리키는 선(차수 계산에서 뺀다)
  const ins = new Map<string, FlowEdge[]>();
  const outs = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    let ok = true;
    if (!byId.has(e.from)) {
      issues.push(issue("FLOW_STRUCTURE", e.from, e.id, `선 ${e.id}가 없는 노드 ${e.from}를 가리킨다`));
      ok = false;
    }
    if (!byId.has(e.to)) {
      issues.push(issue("FLOW_STRUCTURE", e.to, e.id, `선 ${e.id}가 없는 노드 ${e.to}를 가리킨다`));
      ok = false;
    }
    if (!ok) continue;
    if (!outs.has(e.from)) outs.set(e.from, []);
    outs.get(e.from)!.push(e);
    if (!ins.has(e.to)) ins.set(e.to, []);
    ins.get(e.to)!.push(e);
  }
  const outOf = (id: string) => outs.get(id) ?? [];

  // d1·d2·e·f1 — 노드별
  for (const n of unique) {
    const inN = (ins.get(n.id) ?? []).length;
    const outN = outOf(n.id).length;
    const di = IN_DEGREE[n.kind];
    const dout = OUT_DEGREE[n.kind];
    if (inN < di.min || inN > di.max) issues.push(issue("FLOW_STRUCTURE", n.id, null, `${n.id}의 들어오는 선이 ${inN}개다. ${degreeText(di)}`));
    if (outN < dout.min || outN > dout.max) issues.push(issue("FLOW_STRUCTURE", n.id, null, `${n.id}의 나가는 선이 ${outN}개다. ${degreeText(dout)}`));
    if (n.kind === "RULE" && blank(n.ruleId)) issues.push(issue("FLOW_STRUCTURE", n.id, null, `룰 노드 ${n.id}에 룰 ID가 없다`));
    if (n.kind === "MERGE") {
      const splitId = orNull(n.splitId);
      const s = splitId == null ? undefined : byId.get(splitId);
      if (!s || !isSplit(s.kind)) issues.push(issue("FLOW_STRUCTURE", n.id, null, `합류 ${n.id}의 짝 분기 ${splitId ?? "-"}가 없다`));
    }
  }

  // f2·g1~g5 — 분기 노드별
  for (const n of unique) {
    if (!isSplit(n.kind)) continue;
    const merges = unique.filter((m) => m.kind === "MERGE" && orNull(m.splitId) === n.id).length;
    if (merges !== 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `분기 ${n.id}를 닫는 합류가 ${merges}개다. 정확히 1개여야 한다`));
    const out = outOf(n.id);
    if (n.kind === "IF") {
      const others = out.filter((e) => e.otherwise === true).length;
      if (others !== 1) issues.push(issue("FLOW_IF_ELSE", n.id, null, `IF ${n.id}에 "그 외" 갈래가 ${others}개다. 정확히 1개여야 한다`));
      for (const e of out) {
        if (e.otherwise !== true && blank(e.cond)) issues.push(issue("FLOW_IF_ELSE", n.id, e.id, `IF ${n.id}의 갈래 ${e.id}에 조건식이 없다`));
      }
    } else {
      for (const e of out) {
        if (!blank(e.cond) || e.otherwise === true) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `병렬 분기 ${n.id}의 갈래 ${e.id}에는 조건을 둘 수 없다`));
      }
    }
    const ordered = n.kind === "IF" ? out.filter((e) => e.otherwise !== true) : out;
    for (const e of ordered) {
      if (e.order == null) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `분기 ${n.id}의 갈래 ${e.id}에 순서가 없다`));
    }
    const seen = new Set<number>();
    for (const e of ordered) {
      if (e.order == null) continue;
      if (seen.has(e.order)) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `분기 ${n.id}의 갈래 순서 ${e.order}가 겹친다`));
      else seen.add(e.order);
    }
  }

  if (issues.length > 0) return { tree: null, issues };
  try {
    return { tree: build(unique, byId, outOf), issues: [] };
  } catch (e) {
    if (e instanceof ParseStop) return { tree: null, issues: [e.issue] };
    throw e;
  }
}

function sortBranches(kind: FlowNodeKind, out: readonly FlowEdge[]): FlowEdge[] {
  const byOrder = (a: FlowEdge, b: FlowEdge) => (a.order ?? 0) - (b.order ?? 0);
  if (kind === "IF") return [...out.filter((e) => e.otherwise !== true).sort(byOrder), ...out.filter((e) => e.otherwise === true)];
  return [...out].sort(byOrder);
}

/** 2단계 — seq(from, stop) 로 블록 트리를 만든다(C3 의사코드). 첫 오류에서 ParseStop 을 던진다. */
function build(unique: readonly FlowNode[], byId: ReadonlyMap<string, FlowNode>, outOf: (id: string) => FlowEdge[]): FlowTree {
  const visited = new Set<string>();
  const mergeOf = new Map<string, string>();
  for (const m of unique) if (m.kind === "MERGE" && m.splitId != null) mergeOf.set(m.splitId, m.id);
  const next = (id: string) => outOf(id)[0].to;

  const seq = (from: string, stop: string): Seq => {
    const items: Block[] = [];
    let cur = from;
    while (cur !== stop) {
      if (visited.has(cur)) {
        throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${cur}를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다`));
      }
      const node = byId.get(cur)!;
      if (node.kind === "START" || node.kind === "END" || node.kind === "MERGE") {
        throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `갈래가 ${stop}에서 닫히지 않고 ${cur}로 나간다`));
      }
      visited.add(cur);
      if (node.kind === "RULE") {
        items.push({ type: "RULE", nodeId: cur, ruleId: node.ruleId as string });
        cur = next(cur);
        continue;
      }
      const splitId = cur;
      const mergeId = mergeOf.get(splitId)!;
      const branches = sortBranches(node.kind, outOf(splitId)).map((e) => ({
        edgeId: e.id,
        cond: orNull(e.cond),
        otherwise: e.otherwise === true,
        label: orNull(e.label),
        body: seq(e.to, mergeId),
      }));
      visited.add(mergeId);
      items.push({ type: "SPLIT", nodeId: splitId, kind: node.kind as "IF" | "PARALLEL", mergeId, branches });
      cur = next(mergeId);
    }
    return { type: "SEQ", items };
  };

  const start = unique.find((n) => n.kind === "START")!;
  const end = unique.find((n) => n.kind === "END")!;
  const root = seq(next(start.id), end.id);
  for (const n of unique) {
    if (n.kind !== "START" && n.kind !== "END" && !visited.has(n.id)) {
      throw new ParseStop(issue("FLOW_STRUCTURE", n.id, null, `${n.id}에 도달할 수 없다`));
    }
  }
  return new FlowTree(root, start.id, end.id);
}

interface Position {
  /** 루트에서 이 노드까지 지나는 (분기, 갈래 번호). */
  chain: ReadonlyArray<{ split: string; kind: "IF" | "PARALLEL"; branch: number }>;
  /** 깊이 우선 순번(RULE·분기 노드). */
  order: number;
}

/** 블록 트리와 노드 관계(C2). */
export class FlowTree {
  private readonly positions = new Map<string, Position>();
  private readonly steps: RuleStep[] = [];
  private hasSplit = false;

  constructor(
    readonly root: Seq,
    readonly startId: string,
    readonly endId: string,
  ) {
    let counter = 0;
    const walk = (s: Seq, chain: Position["chain"]) => {
      for (const b of s.items) {
        if (b.type === "RULE") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
          this.steps.push(b);
        } else if (b.type === "SPLIT") {
          this.hasSplit = true;
          this.positions.set(b.nodeId, { chain, order: counter++ });
          b.branches.forEach((br, i) => walk(br.body, [...chain, { split: b.nodeId, kind: b.kind, branch: i }]));
        } else {
          walk(b, chain);
        }
      }
    };
    walk(root, []);
  }

  /** 모든 RULE 노드, 깊이 우선(갈래 실행 순서). */
  ruleSteps(): RuleStep[] {
    return [...this.steps];
  }

  /** ruleSteps 의 룰 ID 를 처음 나온 순서로 중복 없이 = RULE_IDS 로 저장할 목록. */
  ruleIds(): string[] {
    return [...new Set(this.steps.map((s) => s.ruleId))];
  }

  branched(): boolean {
    return this.hasSplit;
  }

  /** a 기준 b 의 관계. 같은 분기에서 갈래 번호가 처음 달라지면 IF=EXCLUSIVE, PARALLEL=PARALLEL, 아니면 같은 경로(순번 비교). */
  relation(a: string, b: string): Relation {
    if (a === b) return "SAME";
    const pa = this.positions.get(a);
    const pb = this.positions.get(b);
    if (!pa || !pb) throw new Error(`흐름에 없는 노드: ${!pa ? a : b}`);
    const n = Math.min(pa.chain.length, pb.chain.length);
    for (let i = 0; i < n; i++) {
      const x = pa.chain[i];
      const y = pb.chain[i];
      if (x.split !== y.split) break;
      if (x.branch !== y.branch) return x.kind === "IF" ? "EXCLUSIVE" : "PARALLEL";
    }
    return pa.order < pb.order ? "BEFORE" : "AFTER";
  }
}

/** ruleIds 순서의 한 줄 흐름. 노드 ID: start, r1..rN, end. 선 ID: e1..e(N+1). */
export function linearFlow(ids: readonly string[]): RuleSetFlow {
  const nodes: FlowNode[] = [{ id: "start", kind: "START", ruleId: null, splitId: null, label: null }];
  ids.forEach((ruleId, i) => nodes.push({ id: `r${i + 1}`, kind: "RULE", ruleId, splitId: null, label: null }));
  nodes.push({ id: "end", kind: "END", ruleId: null, splitId: null, label: null });
  const edges: FlowEdge[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    edges.push({ id: `e${i + 1}`, from: nodes[i].id, to: nodes[i + 1].id, order: null, cond: null, otherwise: false, label: null });
  }
  return { version: 1, nodes, edges };
}

/** 흐름의 룰 목록 — 트리가 있으면 `tree.ruleIds()`, 구조 오류면 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이(C4 1). */
export function flowRuleIds(flow: RuleSetFlow, parsed: FlowParse = parseFlow(flow)): string[] {
  if (parsed.tree) return parsed.tree.ruleIds();
  const out: string[] = [];
  const seenNodes = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind === "RULE" && !blank(n.ruleId) && !out.includes(n.ruleId as string)) out.push(n.ruleId as string);
  }
  return out;
}
```

- [ ] **Step 5: flow-model 테스트 통과 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-model.test.ts`
Expected: PASS(모든 사례). 합계 줄 `failed 0`, exit 0.

생성 타입이 `ruleId?: string | null` 처럼 선택 칸으로 나오면 테스트 도우미 `node`·`edge` 의 반환 타입과 `linearFlow` 는 그대로 컴파일된다. 반대로 필수 칸인데 코퍼스 JSON 이 칸을 빼면 러너(Step 9)가 채운다.

- [ ] **Step 6: set-model 흐름 검사 실패 테스트 추가**

`tests/dme/ruleSetEdit/set-model.test.ts` 에서 두 가지를 바꾼다.

(1) 기존 `toStrictEqual` 객체 다섯 곳(세 룰 고리 CYCLE, ORDER 뒤 생산자, UNKNOWN_INPUT, EMPTY, 그리고 `toStrictEqual([` 로 시작하는 나머지 검사 객체 전부)에 `nodeId: null, edgeId: null` 두 칸을 더한다. 예:

```ts
      { code: "EMPTY", severity: "REJECT", ruleId: null, otherRuleId: null, varName: null, message: "룰이 하나도 없다", nodeId: null, edgeId: null },
```

(2) import 줄을 아래로 바꾸고, 파일 끝에 `describe("flowChecks — 흐름 기준 검사(계획 C4)")` 를 더한다.

```ts
import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { condMarks, flowChecks, flowIo, isFinalResult, laterDeps, setChecks, setDeps, setIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo } from "../../../pages/dme/ruleSetEdit/types";
```

```ts
describe("flowChecks — 흐름 기준 검사(계획 C4)", () => {
  const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
  const fe = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
    id,
    from,
    to,
    order: null,
    cond: null,
    otherwise: false,
    label: null,
    ...over,
  });
  const dictA: Record<string, CondIo> = { e2: { ok: true, message: null, vars: [n("A", "DICT")] } };

  /** start → if1 { e2(1, A = 1): r1(R1) ; e3(그 외): r2(R2) } m1 → [rz(RZ)] → end */
  function ifFlow(withTail: boolean, r2Rule = "R2"): RuleSetFlow {
    const nodes = [
      fn("start", "START"),
      fn("if1", "IF"),
      fn("r1", "RULE", { ruleId: "R1" }),
      fn("r2", "RULE", { ruleId: r2Rule }),
      fn("m1", "MERGE", { splitId: "if1" }),
      ...(withTail ? [fn("rz", "RULE", { ruleId: "RZ" })] : []),
      fn("end", "END"),
    ];
    const edges = [
      fe("e1", "start", "if1"),
      fe("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
      fe("e3", "if1", "r2", { otherwise: true }),
      fe("e4", "r1", "m1"),
      fe("e5", "r2", "m1"),
      ...(withTail ? [fe("e6", "m1", "rz"), fe("e7", "rz", "end")] : [fe("e6", "m1", "end")]),
    ];
    return { version: 1, nodes, edges };
  }

  /** start → p1 { ea(1): ra(RA) ; eb(2): rb(RB) } m1 → end */
  const parFlow: RuleSetFlow = {
    version: 1,
    nodes: [fn("start", "START"), fn("p1", "PARALLEL"), fn("ra", "RULE", { ruleId: "RA" }), fn("rb", "RULE", { ruleId: "RB" }), fn("m1", "MERGE", { splitId: "p1" }), fn("end", "END")],
    edges: [fe("e1", "start", "p1"), fe("ea", "p1", "ra", { order: 1 }), fe("eb", "p1", "rb", { order: 2 }), fe("e4", "ra", "m1"), fe("e5", "rb", "m1"), fe("e6", "m1", "end")],
  };

  it("IF 두 갈래가 같은 결과를 쓰는 것은 정상이고, 한 갈래에서만 만든 값을 합류 뒤에서 읽으면 FLOW_PARTIAL 경고", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT")], [n("X"), n("Y")]), rule("RZ", [n("Y", "NONE")], [n("Z")]));
    expect(flowChecks(ifFlow(true), rules, dictA)).toStrictEqual([
      {
        code: "FLOW_PARTIAL",
        severity: "WARN",
        ruleId: "RZ",
        otherRuleId: null,
        varName: "Y",
        message: "RZ가 읽는 Y는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다",
        nodeId: "rz",
        edgeId: null,
      },
    ]);
  });

  it("IF 갈래 안의 룰이 다른 갈래에서만 만든 값을 읽으면 IF_SIBLING", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT"), n("X", "NONE")], [n("W")]));
    expect(flowChecks(ifFlow(false), rules, dictA)).toStrictEqual([
      {
        code: "IF_SIBLING",
        severity: "REJECT",
        ruleId: "R2",
        otherRuleId: "R1",
        varName: "X",
        message: "R2가 읽는 X는 같은 IF 의 다른 갈래(R1)에서만 만들어진다. 이 갈래를 타면 값이 없다",
        nodeId: "r2",
        edgeId: null,
      },
    ]);
  });

  it("병렬 형제의 결과를 읽으면 PAR_SIBLING", () => {
    const rules = byId(rule("RA", [n("A", "DICT")], [n("X")]), rule("RB", [n("X", "NONE")], [n("Y")]));
    expect(flowChecks(parFlow, rules, {}).map((c) => [c.code, c.ruleId, c.otherRuleId, c.varName, c.message, c.nodeId])).toEqual([
      ["PAR_SIBLING", "RB", "RA", "X", "RB가 병렬 형제 갈래의 RA가 만드는 X를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", "rb"],
    ]);
  });

  it("병렬 형제가 같은 결과 변수를 쓰면 PAR_SIBLING(중복 대입 경고가 아니다)", () => {
    const rules = byId(rule("RA", [n("A", "DICT")], [n("X")]), rule("RB", [n("A", "DICT")], [n("X")]));
    expect(flowChecks(parFlow, rules, {}).map((c) => [c.code, c.severity, c.ruleId, c.otherRuleId, c.message])).toEqual([
      ["PAR_SIBLING", "REJECT", "RB", "RA", "병렬 갈래의 RA와 RB가 같은 결과 변수 X에 대입한다"],
    ]);
  });

  it("같은 룰이 두 IF 갈래에 있으면 검사·입출력이 한 번씩이다", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]));
    expect(flowChecks(ifFlow(false, "R1"), rules, dictA)).toStrictEqual([]);
    const io = flowIo(ifFlow(false, "R1"), rules);
    expect(io.inputs.map((i) => [i.name, i.users])).toEqual([["A", ["R1"]]]);
    expect(io.results.map((r) => [r.name, r.by])).toEqual([["X", ["R1"]]]);
  });

  it("조건식 — 파싱 실패, 정보 없음, 정의 안 된 변수", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT")], [n("X")]));
    const cases: Array<[Record<string, CondIo>, [string, string | null, string][]]> = [
      [{ e2: { ok: false, message: "파싱 실패", vars: [] } }, [["FLOW_COND", null, "e2 갈래 조건식을 읽을 수 없다: 파싱 실패"]]],
      [{}, [["FLOW_COND", null, "e2 갈래 조건식을 읽을 수 없다: 조건식 정보 없음"]]],
      [{ e2: { ok: true, message: null, vars: [n("Q", "NONE")] } }, [["FLOW_COND", "Q", "e2 갈래 조건식이 읽는 Q는 이 지점에서 정의되지 않았다"]]],
    ];
    for (const [condIo, want] of cases) {
      const got = flowChecks(ifFlow(false), rules, condIo);
      expect(got.map((c) => [c.code, c.varName, c.message])).toEqual(want);
      expect(got.every((c) => c.nodeId === "if1" && c.edgeId === "e2" && c.ruleId === null)).toBe(true);
    }
  });

  it("구조 오류가 있으면 존재 검사 다음에 구조 검사만 내고 경로 검사는 하지 않는다", () => {
    const f = ifFlow(false);
    const broken: RuleSetFlow = { ...f, edges: f.edges.map((e) => (e.id === "e3" ? { ...e, otherwise: false } : e)) };
    const rules = byId(rule("R1", [n("Q", "NONE")], [n("X")]));
    expect(flowChecks(broken, rules, dictA).map((c) => [c.code, c.ruleId, c.nodeId, c.edgeId])).toEqual([
      ["RULE_NOT_FOUND", "R2", "r2", null],
      ["FLOW_IF_ELSE", null, "if1", null],
      ["FLOW_IF_ELSE", null, "if1", "e3"],
      ["FLOW_STRUCTURE", null, "if1", "e3"],
    ]);
  });

  it("목록 검사(setChecks)는 한 줄 흐름으로 돌리고 위치를 비운다", () => {
    const rules = byId(rule("A", [n("S_X", "NONE")], [n("S_A")]), rule("B", [], [n("S_X")]));
    expect(setChecks(["A", "B"], rules).map((c) => [c.code, c.nodeId, c.edgeId])).toEqual([["ORDER", null, null]]);
  });
});
```

- [ ] **Step 7: 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/set-model.test.ts`
Expected: FAIL — `flowChecks`·`flowIo` 가 export 되지 않았다는 오류와 기존 사례의 `nodeId` 칸 불일치.

- [ ] **Step 8: set-model.ts 구현**

`set-model.ts` 에서 아래를 바꾼다.

(1) 파일 머리 주석 첫 문단 끝에 한 줄 더한다: `흐름 세트는 계획 C4 의 경로 검사(\`flowChecks\`)를 쓰고, 목록 세트는 한 줄 흐름으로 같은 검사를 돌린다(\`setChecks\`).`

(2) import 를 바꾼다.

```ts
import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import { flowRuleIds, linearFlow, parseFlow, type FlowTree, type RuleStep, type Seq } from "./flow-model";
import type { CondIoMap, InputRow, IoName, IoSource, ResultRow, RuleIo, RuleIoMap, RuleSetCheck, SetIo } from "./types";
```

(3) 기존 `const check = (...)` 를 아래로 바꾼다(뒤 두 인자는 기본값 null).

```ts
const check = (
  code: RuleSetCheck["code"],
  severity: RuleSetCheck["severity"],
  ruleId: string | null,
  otherRuleId: string | null,
  varName: string | null,
  message: string,
  nodeId: string | null = null,
  edgeId: string | null = null,
): RuleSetCheck => ({ code, severity, ruleId, otherRuleId, varName, message, nodeId, edgeId });
```

(4) 기존 `export function setChecks(...) { ... }` 본문 전체를 아래 코드로 바꾼다(기존 1단계·EMPTY·2단계 루프는 `flowChecks`·`pathChecks` 로 옮겨진다).

```ts
/** §6.3 — 목록 세트 검사. 한 줄 흐름(`linearFlow`)으로 `flowChecks` 를 돌리고 위치(nodeId·edgeId)는 비운다(D8, 기존 코퍼스 사례 불변). */
export function setChecks(ids: readonly string[], rules: RuleIoMap): RuleSetCheck[] {
  return flowChecks(linearFlow(ids), rules, {}).map((c) => ({ ...c, nodeId: null, edgeId: null }));
}

/** 흐름 세트의 입출력 표(D10) — 흐름을 펼친 룰 목록으로 `setIo` 를 계산한다. */
export function flowIo(flow: RuleSetFlow, rules: RuleIoMap): SetIo {
  return setIo(flowRuleIds(flow), rules);
}

/** 흐름 세트의 의존 룰(D10) — 흐름을 펼친 룰 목록으로 `setDeps` 를 계산한다. */
export function flowDeps(flow: RuleSetFlow, rules: RuleIoMap): Record<string, string[]> {
  return setDeps(flowRuleIds(flow), rules);
}

/**
 * 계획 C4 — 존재·상태 → EMPTY → 구조(있으면 끝) → 경로 검사. 서버 `RuleSetAnalyzer.checks(flow, rules, condIo)` 와 같은 코드·문구·순서다.
 */
export function flowChecks(flow: RuleSetFlow, rules: RuleIoMap, condIo: CondIoMap): RuleSetCheck[] {
  const out: RuleSetCheck[] = [];
  const parsed = parseFlow(flow);
  const firstNode = new Map<string, string>();
  for (const n of flow.nodes ?? []) {
    if (n.kind === "RULE" && n.ruleId != null && n.ruleId.trim() !== "" && !firstNode.has(n.ruleId)) firstNode.set(n.ruleId, n.id);
  }
  for (const id of flowRuleIds(flow, parsed)) {
    const r = ruleOf(rules, id);
    const at = firstNode.get(id) ?? null;
    if (!r || !r.exists) {
      out.push(check("RULE_NOT_FOUND", "REJECT", id, null, null, `${id}는 없는 룰이다`, at));
    } else if (r.status === "DEPRECATED") {
      out.push(check("RULE_DEPRECATED", "REJECT", id, null, null, `${id}는 DEPRECATED다`, at));
    } else if (r.releasedVer == null) {
      out.push(check("NO_RELEASED", "WARN", id, null, null, `${id}는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다`, at));
    }
  }
  if (!(flow.nodes ?? []).some((n) => n.kind === "RULE")) out.push(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다"));
  if (!parsed.tree) {
    for (const i of parsed.issues) out.push(check(i.code, "REJECT", null, null, null, i.message, i.nodeId, i.edgeId));
    return out;
  }
  pathChecks(parsed.tree, rules, condIo, out);
  return out;
}

/** 경로 상태 — 반드시 만들어진 이름, 일부 IF 갈래에서만 만들어진 이름, 이름별 마지막 생산 노드(C4 4). */
interface PathState {
  defined: Set<string>;
  maybe: Set<string>;
  prodBy: Map<string, RuleStep>;
}

const copyState = (s: PathState): PathState => ({ defined: new Set(s.defined), maybe: new Set(s.maybe), prodBy: new Map(s.prodBy) });
const uniq = (xs: readonly string[]) => [...new Set(xs)];

/** 합류 — IF 는 모든 갈래가 만든 것만 defined, 나머지는 maybe. PARALLEL 은 어느 갈래든 만든 것이 defined. prodBy 는 갈래 순서로 처음 바뀐 값. */
function mergeState(kind: "IF" | "PARALLEL", s: PathState, ends: readonly PathState[]): void {
  const over = new Map<string, RuleStep>();
  for (const e of ends) {
    for (const [k, v] of e.prodBy) if (s.prodBy.get(k) !== v && !over.has(k)) over.set(k, v);
  }
  if (kind === "IF") {
    const all = new Set<string>();
    for (const e of ends) for (const x of e.defined) all.add(x);
    for (const x of all) if (ends.every((e) => e.defined.has(x))) s.defined.add(x);
    for (const e of ends) for (const x of e.maybe) s.maybe.add(x);
    for (const x of all) if (!s.defined.has(x)) s.maybe.add(x);
  } else {
    for (const e of ends) {
      for (const x of e.defined) s.defined.add(x);
      for (const x of e.maybe) s.maybe.add(x);
    }
  }
  for (const [k, v] of over) s.prodBy.set(k, v);
}

/** C4 4 — 트리를 깊이 우선으로 돌며 조건식·룰 검사를 낸다. */
function pathChecks(tree: FlowTree, rules: RuleIoMap, condIo: CondIoMap, out: RuleSetCheck[]): void {
  const steps = tree.ruleSteps();
  const index = new Map(steps.map((s, i) => [s.nodeId, i] as const));
  const d = setDeps(tree.ruleIds(), rules);
  const makers = (name: string) => steps.filter((m) => produces(rules, m.ruleId, name));

  const cond = (ifId: string, edgeId: string, s: PathState) => {
    const io = Object.prototype.hasOwnProperty.call(condIo, edgeId) ? condIo[edgeId] : undefined;
    if (!io || !io.ok) {
      out.push(check("FLOW_COND", "REJECT", null, null, null, `${edgeId} 갈래 조건식을 읽을 수 없다: ${io ? io.message : "조건식 정보 없음"}`, ifId, edgeId));
      return;
    }
    for (const v of io.vars) {
      if (v.source === DICT || s.defined.has(v.name)) continue;
      if (s.maybe.has(v.name)) {
        out.push(
          check("FLOW_PARTIAL", "WARN", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, ifId, edgeId),
        );
      } else {
        out.push(check("FLOW_COND", "REJECT", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 이 지점에서 정의되지 않았다`, ifId, edgeId));
      }
    }
  };

  const rule = (n: RuleStep, s: PathState) => {
    const id = n.ruleId;
    for (const c of conds(rules, id)) {
      if (c.source === DICT || s.defined.has(c.name)) continue;
      if (s.maybe.has(c.name)) {
        out.push(check("FLOW_PARTIAL", "WARN", id, null, c.name, `${id}가 읽는 ${c.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, n.nodeId));
        continue;
      }
      const mk = makers(c.name);
      const later = uniq(mk.filter((m) => m.ruleId !== id && tree.relation(n.nodeId, m.nodeId) === "BEFORE").map((m) => m.ruleId));
      if (later.length) {
        const cyc = later.find((j) => reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) ?? null;
        if (cyc != null) {
          out.push(check("CYCLE", "REJECT", id, cyc, c.name, `${id}와 ${cyc}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다`, n.nodeId));
        } else {
          out.push(
            check("ORDER", "REJECT", id, later[0], c.name, `${id}가 뒤에 도는 ${later.join(", ")}의 결과 변수 ${c.name}를 읽는다. ${later[0]}를 ${id} 앞으로 옮긴다`, n.nodeId),
          );
        }
        continue;
      }
      const excl = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "EXCLUSIVE").map((m) => m.ruleId));
      if (excl.length) {
        out.push(
          check("IF_SIBLING", "REJECT", id, excl[0], c.name, `${id}가 읽는 ${c.name}는 같은 IF 의 다른 갈래(${excl.join(", ")})에서만 만들어진다. 이 갈래를 타면 값이 없다`, n.nodeId),
        );
        continue;
      }
      const par = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "PARALLEL").map((m) => m.ruleId));
      if (par.length) {
        out.push(check("PAR_SIBLING", "REJECT", id, par[0], c.name, `${id}가 병렬 형제 갈래의 ${par[0]}가 만드는 ${c.name}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다`, n.nodeId));
        continue;
      }
      if (c.source !== PROG) {
        out.push(check("UNKNOWN_INPUT", "REJECT", id, null, c.name, `${id}의 조건 변수 ${c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다`, n.nodeId));
      }
    }
    for (const x of results(rules, id)) {
      const sib = steps.find(
        (m) => index.get(m.nodeId)! < index.get(n.nodeId)! && tree.relation(n.nodeId, m.nodeId) === "PARALLEL" && produces(rules, m.ruleId, x.name),
      );
      if (sib) {
        out.push(check("PAR_SIBLING", "REJECT", id, sib.ruleId, x.name, `병렬 갈래의 ${sib.ruleId}와 ${id}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      } else {
        const prev = s.prodBy.get(x.name);
        if (prev) out.push(check("DUP_RESULT", "WARN", id, prev.ruleId, x.name, `${prev.ruleId}와 ${id}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      }
      s.prodBy.set(x.name, n);
      s.defined.add(x.name);
    }
  };

  const walk = (seq: Seq, s: PathState) => {
    for (const b of seq.items) {
      if (b.type === "RULE") rule(b, s);
      else if (b.type === "SEQ") walk(b, s);
      else {
        if (b.kind === "IF") for (const br of b.branches) if (!br.otherwise) cond(b.nodeId, br.edgeId, s);
        const ends = b.branches.map((br) => {
          const sb = copyState(s);
          walk(br.body, sb);
          return sb;
        });
        mergeState(b.kind, s, ends);
      }
    }
  };
  walk(tree.root, { defined: new Set(), maybe: new Set(), prodBy: new Map() });
}
```

기존 `produces`·`reaches`·`overlaps`·`conds`·`results`·`ruleOf`·`DICT`·`PROG` 는 그대로 쓴다. 기존 `setChecks` 안에 있던 `prodBy`·`produced` 루프는 지운다(동작은 `pathChecks` 가 같게 낸다).

- [ ] **Step 9: 코퍼스 TS 러너를 흐름 사례까지 읽게 고침**

`tests/dme/ruleSetEdit/rule-set-corpus.test.ts` 를 바꾼다.

(1) import 와 `MIN_CASES`:

```ts
import type { FlowEdge, FlowNode, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { flowRuleIds } from "../../../pages/dme/ruleSetEdit/flow-model";
import { flowChecks, flowDeps, flowIo, setChecks, setDeps, setIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo } from "../../../pages/dme/ruleSetEdit/types";
```

`MIN_CASES` 는 Task 6 이 Java `RuleSetCorpusTest.MIN_CASES` 에 적은 값으로 바꾼다. 확인:

Run: `grep -n 'MIN_CASES =' src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetCorpusTest.java && python3 -c "import json;print(len(json.load(open('src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json'))['cases']))"`
Expected: Java 상수와 사례 총수. TS `MIN_CASES` 를 Java 상수와 같은 숫자로 적는다(주석 "Java `RuleSetCorpusTest.MIN_CASES` 와 같아야 한다" 는 그대로).

(2) 사례 타입과 읽기 도우미:

```ts
interface CorpusFlowNode {
  id: string;
  kind: FlowNode["kind"];
  ruleId?: string | null;
  splitId?: string | null;
  label?: string | null;
}

interface CorpusFlowEdge {
  id: string;
  from: string;
  to: string;
  order?: number | null;
  cond?: string | null;
  otherwise?: boolean;
  label?: string | null;
}

interface CorpusCondIo {
  ok: boolean;
  message?: string | null;
  vars?: Array<{ name: string; source?: IoSource | null }>;
}

interface CorpusCase {
  name: string;
  ids: string[];
  flow?: { version: number; nodes: CorpusFlowNode[]; edges: CorpusFlowEdge[] };
  condIo?: Record<string, CorpusCondIo>;
  rules?: Record<string, CorpusRule>;
  expect: {
    io: {
      inputs: Array<{ name: string; source?: string | null; users: string[] }>;
      results: Array<{ name: string; by: string[]; readers: string[] }>;
    };
    deps: Record<string, string[]>;
    checks: Array<
      Nullable<{ code: string; severity: string; ruleId: string; otherRuleId: string; varName: string; message: string; nodeId: string; edgeId: string }>
    >;
  };
}

/** 코퍼스 흐름의 빠진 칸을 null(otherwise 는 false)로 채운다 — Java 러너와 같은 읽기 규칙. */
function flowOf(f: NonNullable<CorpusCase["flow"]>): RuleSetFlow {
  const nodes: FlowNode[] = f.nodes.map((n) => ({ id: n.id, kind: n.kind, ruleId: n.ruleId ?? null, splitId: n.splitId ?? null, label: n.label ?? null }));
  const edges: FlowEdge[] = f.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    order: e.order ?? null,
    cond: e.cond ?? null,
    otherwise: e.otherwise ?? false,
    label: e.label ?? null,
  }));
  return { version: f.version, nodes, edges };
}

function condIoOf(m: CorpusCase["condIo"]): Record<string, CondIo> {
  const out: Record<string, CondIo> = {};
  for (const [edgeId, c] of Object.entries(m ?? {})) {
    out[edgeId] = { ok: c.ok, message: c.message ?? null, vars: (c.vars ?? []).map((v) => ioName(v.name, v.source ?? null)) };
  }
  return out;
}
```

(3) `it.each` 본문을 아래로 바꾼다.

```ts
  it.each(corpus.cases.map((c) => [c.name, c] as const))("%s", (name, c) => {
    const rules: Record<string, RuleIo> = {};
    for (const [id, r] of Object.entries(c.rules ?? {})) rules[id] = rule(id, r);
    const flow = c.flow ? flowOf(c.flow) : null;
    if (flow) expect(flowRuleIds(flow), `${name} ids = 흐름을 펼친 룰 목록`).toEqual(c.ids);

    const io = flow ? flowIo(flow, rules) : setIo(c.ids, rules);
    expect(
      io.inputs.map((i) => ({ name: i.name, source: i.source, users: i.users })),
      `${name} io.inputs`,
    ).toEqual(c.expect.io.inputs.map((i) => ({ name: i.name, source: i.source ?? null, users: i.users })));
    expect(
      io.results.map((r) => ({ name: r.name, by: r.by, readers: r.readers })),
      `${name} io.results`,
    ).toEqual(c.expect.io.results.map((r) => ({ name: r.name, by: r.by, readers: r.readers })));

    const deps = flow ? flowDeps(flow, rules) : setDeps(c.ids, rules);
    expect(Object.entries(deps), `${name} deps`).toEqual(Object.entries(c.expect.deps));

    const checks = flow ? flowChecks(flow, rules, condIoOf(c.condIo)) : setChecks(c.ids, rules);
    expect(checks, `${name} checks`).toStrictEqual(
      c.expect.checks.map((k) => ({
        code: k.code ?? null,
        severity: k.severity ?? null,
        ruleId: k.ruleId ?? null,
        otherRuleId: k.otherRuleId ?? null,
        varName: k.varName ?? null,
        message: k.message ?? null,
        nodeId: k.nodeId ?? null,
        edgeId: k.edgeId ?? null,
      })),
    );
  });
```

파일 머리 주석의 "읽기 규칙" 줄 끝에 한 문장 더한다: `흐름 사례(\`flow\`)는 노드·선의 빠진 칸을 null(\`otherwise\` 는 false)로 채우고, \`ids\` 가 흐름을 펼친 룰 목록과 같은지 먼저 본다. \`checks\` 의 \`nodeId\`·\`edgeId\` 도 비교한다.`

- [ ] **Step 10: 화면 테스트·타입 검사 통과 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`
Expected: PASS, `failed 0`, exit 0. 코퍼스 흐름 사례(Task 6)가 모두 통과한다. 흐름 사례에서만 실패하면 C3·C4 문구·순서를 Java 와 한 줄씩 대조한다(구현을 코퍼스에 맞추지 말고, 어긋난 쪽을 계획 C3·C4 로 판정한다).

Run: `pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0. `RuleSetCheck` 에 칸이 늘어 다른 파일(`RuleSetCard.tsx` 등)이 객체를 직접 만들면 타입 오류가 난다. 만드는 곳이 있으면 `nodeId: null, edgeId: null` 을 채운다.

- [ ] **Step 11: 커밋**

```bash
git commit -m "feat(m-mdm): 룰 세트 흐름 구조 해석과 흐름 기준 세트 검사

flow-model.ts 가 엔진 FlowParser·FlowTree 와 같은 구조 검사·블록 트리·노드 관계를 계산하고,
set-model.ts 가 IF·병렬 갈래를 따라 경로 검사(IF_SIBLING·PAR_SIBLING·FLOW_PARTIAL·FLOW_COND)를 낸다.
목록 검사는 한 줄 흐름으로 같은 알고리즘을 돌린다. 코퍼스 러너는 흐름 사례와 nodeId·edgeId 를 비교한다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/set-model.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/set-model.test.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-corpus.test.ts
```

새 파일은 경로 커밋 전에 `git add src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-model.test.ts` 로 먼저 올린다.

---


---

### Task 9: 룰 확정 시 세트 검사를 흐름 관계로 판정

**모델:** sonnet · **물결:** 4 · **선행:** Task 3, Task 6

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleSaveIssueCode.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java`

**Interfaces:**
- Consumes:
  - `MdmRuleSet.getFlowJson()`(Task 3)
  - `RuleSetFlowJson.parse(String)`(Task 6)
  - `FlowParser.parse`·`FlowParser.linear`, `FlowTree.ruleSteps()`·`relation(a, b)`, `FlowTree.Relation`(Task 4)
- Produces: `RuleSaveIssueCode.SET_IF_SIBLING`, `RuleSaveIssueCode.SET_PAR_SIBLING`

**판정 규칙.** 이 룰(me)을 담은 INUSE 세트마다 흐름을 만든다: `FLOW_JSON` 이 있으면 그것, 없으면 `FlowParser.linear(RULE_IDS)`. 파싱에 구조 오류가 있으면 그 세트는 건너뛴다(세트 저장 검사가 이미 막는 상태다). 다른 룰(other)마다 `rels` = me 의 모든 RULE 노드 × other 의 모든 RULE 노드에 대한 `relation(meNode, otherNode)` 집합이다. `seq = rels ∩ {BEFORE, AFTER}`.

| 순서 | 조건 | 코드(수준) | 문구 |
|---|---|---|---|
| 1 | readsOther·readByOther 둘 다 있고 seq 가 비어 있지 않음 | SET_CYCLE(ERROR) | 기존 문구 |
| 2 | 1 이 아니고 readsOther 가 있고 rels 에 BEFORE | SET_ORDER(ERROR) | 기존 "뒤에 있는" 문구 |
| 3 | 1·2 가 아니고 readByOther 가 있고 rels 에 AFTER | SET_ORDER(ERROR) | 기존 "앞에 있는" 문구 |
| 4 | rels 에 PARALLEL 이 있고 readsOther 나 readByOther 가 있음 | SET_PAR_SIBLING(ERROR) | `세트 {s}: {me}와(과) {other}가 병렬 형제 갈래에서 서로의 결과를 읽는다({me} ← {readsOther}, {other} ← {readByOther}) — 병렬 갈래끼리는 결과를 읽을 수 없다` |
| 5 | rels 가 {EXCLUSIVE} 뿐이고 readsOther 나 readByOther 가 있음 | SET_IF_SIBLING(ERROR) | `세트 {s}: {me}와(과) {other}가 같은 IF 의 다른 갈래에 있는데 한쪽이 다른 쪽 결과를 읽는다({me} ← {readsOther}, {other} ← {readByOther}) — 그 갈래를 타면 값이 없다` |
| 6 | dup 이 있고 rels 에 PARALLEL | SET_PAR_SIBLING(ERROR) | `세트 {s}: 병렬 형제 갈래의 {other}도 결과 {dup}를 대입한다` |
| 7 | 6 이 아니고 dup 이 있고 seq 가 비어 있지 않음 | SET_DUP_RESULT(WARNING) | 기존 문구 |

1~3 은 서로 배타이고, 4·5 는 1~3 과 따로 판정한다(같은 other 에 둘 다 나올 수 있다). 한 줄 흐름에서는 rels 가 {BEFORE} 또는 {AFTER} 하나뿐이다. 그래서 규칙은 기존 판정(`j > i`·`j < i`)과 같고, 기존 테스트 4건은 바뀌지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`RuleLedgerChecksTest.java` 에 도우미와 테스트를 더한다. 샘플 룰 `QLTY_GRD_JDG` 는 `COIL_WID` 를 읽고 `QLTY_GRD`·`PRC_FCT` 를 만든다.

```java
/** 흐름 세트 — IF(또는 PARALLEL) 하나에 두 갈래. first 는 첫 갈래, second 는 둘째 갈래(IF 면 그 외)의 룰. */
private void branchSet(String setId, String kind, String first, String second) {
    String secondEdge = "IF".equals(kind)
            ? "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"r2\",\"otherwise\":true}"
            : "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"r2\",\"order\":2}";
    String firstEdge = "IF".equals(kind)
            ? "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"r1\",\"order\":1,\"cond\":\"COIL_THK > 1\"}"
            : "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"r1\",\"order\":1}";
    String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s1\",\"kind\":\"" + kind + "\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"" + first + "\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"" + second + "\"},"
            + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"s1\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s1\"}," + firstEdge + "," + secondEdge + ","
            + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"end\"}]}";
    ruleSet(setId, "INUSE", first, second);
    DmeTestSupport.ruleSetFlow(jdbc, setId, flow);
}

@Test
void IF_형제_갈래의_결과를_읽으면_SET_IF_SIBLING_으로_거부한다() {
    otherRule("R_WID", "X_IN", "COIL_WID");
    branchSet("S_IF", "IF", "QLTY_GRD_JDG", "R_WID");

    BusinessException e = rejected(() -> save(sample()));

    assertEquals(List.of("SET_IF_SIBLING"), codes(e));
    assertTrue(e.getMessage().contains("S_IF") && e.getMessage().contains("COIL_WID"), e.getMessage());
}

@Test
void 병렬_형제_갈래의_결과를_읽으면_SET_PAR_SIBLING_으로_거부한다() {
    otherRule("R_WID", "X_IN", "COIL_WID");
    branchSet("S_PAR", "PARALLEL", "QLTY_GRD_JDG", "R_WID");

    BusinessException e = rejected(() -> save(sample()));

    assertEquals(List.of("SET_PAR_SIBLING"), codes(e));
}

@Test
void 병렬_형제가_같은_결과를_대입하면_SET_PAR_SIBLING_이다() {
    otherRule("R_DUP", "X_IN", "PRC_FCT");
    branchSet("S_PDUP", "PARALLEL", "QLTY_GRD_JDG", "R_DUP");

    BusinessException e = rejected(() -> save(sample()));

    assertEquals(List.of("SET_PAR_SIBLING"), codes(e));
    assertTrue(e.getMessage().contains("PRC_FCT"), e.getMessage());
}

@Test
void 서로_다른_IF_갈래가_같은_결과를_대입하는_것은_정상이다() {
    otherRule("R_DUP", "X_IN", "PRC_FCT");
    branchSet("S_IFDUP", "IF", "QLTY_GRD_JDG", "R_DUP");

    RuleEditSaveResult r = save(sample());

    assertTrue(issues(r, "SET_DUP_RESULT").isEmpty(), r.getIssues().toString());
    assertTrue(issues(r, "SET_IF_SIBLING").isEmpty(), r.getIssues().toString());
}
```

- [ ] **Step 2: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleLedgerChecksTest' --console=plain)`
Expected: FAIL. IF·병렬 사례가 지금 코드에서는 목록 순서로 판정되어 `SET_ORDER` 가 나오거나 거부되지 않는다. 같은 결과 대입 사례는 `SET_DUP_RESULT` 경고가 나온다.

- [ ] **Step 3: 코드 두 개를 더한다**

`RuleSaveIssueCode.java` — `SET_DUP_RESULT,` 아래:

```java
    SET_IF_SIBLING,
    SET_PAR_SIBLING,
```

- [ ] **Step 4: `RuleSetOrderCheck.check` 를 흐름 관계로 바꾼다**

클래스 주석을 다음으로 바꾼다: "룰 세트 순서(06:327, TSK-08-04 design §6.4, 흐름도 계획 Task 9). 이 룰을 담은 INUSE 세트마다 흐름(FLOW_JSON, 없으면 RULE_IDS 한 줄 흐름)을 만들고, 이 룰과 다른 룰의 노드 관계(`FlowTree.relation`)로 판정한다. 규칙표는 계획 Task 9 에 있다. 구조 오류가 있는 흐름은 건너뛴다(세트 저장 검사가 막는다)."

```java
// import 추가
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;

@Override
public List<Map<String, Object>> check(RuleSaveContext ctx) {
    List<Map<String, Object>> out = new ArrayList<>();
    Names self = RuleDefinitionReads.of(ctx.rawVars(), LedgerCells.rowCells(ctx.rows()));
    String me = ctx.ruleId();
    for (MdmRuleSet set : queries.allSets()) {
        if (!"INUSE".equals(set.getStatus())) {
            continue;
        }
        List<String> members = new ArrayList<>(new LinkedHashSet<>(DomainJson.readList(set.getRuleIds()).stream().map(String::valueOf).toList()));
        if (!members.contains(me)) {
            continue;
        }
        FlowTree tree = tree(set, members);
        if (tree == null) {
            continue;
        }
        String s = set.getMaruRuleSetId();
        Map<String, Integer> released = queries.latestReleasedVers(members);
        for (String other : members) {
            if (other.equals(me) || !released.containsKey(other)) {
                continue;
            }
            int ver = released.get(other);
            Names o = RuleDefinitionReads.of(queries.vars(other, ver),
                    queries.rows(other, ver).stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList());
            Set<String> readsOther = common(self.reads(), o.produces());
            Set<String> readByOther = common(self.produces(), o.reads());
            Set<String> dup = common(self.produces(), o.produces());
            Set<Relation> rels = relations(tree, me, other);
            boolean seq = rels.contains(Relation.BEFORE) || rels.contains(Relation.AFTER);
            if (!readsOther.isEmpty() && !readByOther.isEmpty() && seq) {
                out.add(error(RuleSaveIssueCode.SET_CYCLE, "세트 " + s + ": " + me + "와(과) " + other + "가 서로의 결과를 읽는다(" + me + " ← "
                        + readsOther + ", " + other + " ← " + readByOther + ") — 순서로 풀리지 않는 순환이다"));
            } else if (!readsOther.isEmpty() && rels.contains(Relation.BEFORE)) {
                out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": " + me + "이(가) 뒤에 있는 " + other + "의 결과 " + readsOther
                        + "를 읽는다. " + other + "를 앞으로 옮긴다"));
            } else if (!readByOther.isEmpty() && rels.contains(Relation.AFTER)) {
                out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": 앞에 있는 " + other + "이(가) 이 룰의 결과 " + readByOther
                        + "를 읽는다. 이 룰을 " + other + " 앞으로 옮긴다"));
            }
            boolean reads = !readsOther.isEmpty() || !readByOther.isEmpty();
            if (reads && rels.contains(Relation.PARALLEL)) {
                out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": " + me + "와(과) " + other + "가 병렬 형제 갈래에서 서로의 결과를 읽는다("
                        + me + " ← " + readsOther + ", " + other + " ← " + readByOther + ") — 병렬 갈래끼리는 결과를 읽을 수 없다"));
            }
            if (reads && rels.equals(Set.of(Relation.EXCLUSIVE))) {
                out.add(error(RuleSaveIssueCode.SET_IF_SIBLING, "세트 " + s + ": " + me + "와(과) " + other + "가 같은 IF 의 다른 갈래에 있는데 한쪽이 "
                        + "다른 쪽 결과를 읽는다(" + me + " ← " + readsOther + ", " + other + " ← " + readByOther + ") — 그 갈래를 타면 값이 없다"));
            }
            if (!dup.isEmpty() && rels.contains(Relation.PARALLEL)) {
                out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": 병렬 형제 갈래의 " + other + "도 결과 " + dup + "를 대입한다"));
            } else if (!dup.isEmpty() && seq) {
                out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_DUP_RESULT.name(), RuleCheckReport.WARNING, List.of(), null,
                        "세트 " + s + ": " + other + "도 결과 " + dup + "를 대입한다"));
            }
        }
    }
    return out;
}

/** 세트의 흐름 트리. FLOW_JSON 이 없으면 RULE_IDS 한 줄 흐름. 형식·구조 오류면 null(건너뛴다). */
private static FlowTree tree(MdmRuleSet set, List<String> members) {
    FlowDefinition flow;
    try {
        flow = set.getFlowJson() == null ? FlowParser.linear(members) : RuleSetFlowJson.parse(set.getFlowJson());
    } catch (IllegalArgumentException e) {
        return null;
    }
    FlowParse p = FlowParser.parse(flow);
    return p.issues().isEmpty() ? p.tree() : null;
}

/** me 의 모든 노드 × other 의 모든 노드 관계(relation(meNode, otherNode)). */
private static Set<Relation> relations(FlowTree tree, String me, String other) {
    Set<Relation> out = java.util.EnumSet.noneOf(Relation.class);
    for (RuleStep a : tree.ruleSteps()) {
        if (!a.ruleId().equals(me)) {
            continue;
        }
        for (RuleStep b : tree.ruleSteps()) {
            if (b.ruleId().equals(other)) {
                out.add(tree.relation(a.nodeId(), b.nodeId()));
            }
        }
    }
    return out;
}
```

기존 루프의 `members.indexOf(me)`·`j > i` 판정은 지운다. 한 줄 흐름에서 `relation(me, other) == BEFORE` 가 `j > i` 와 같다. `RuleSetOrderCheck` 는 `@Component`·`@Order(1)` 그대로다.

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleLedgerChecksTest' --tests '*RuleConfirmServiceTest' --console=plain)`
Expected: PASS. 기존 세트 순서 테스트 4건과 COLUMNS 적용 지점 테스트도 그대로 통과한다.

- [ ] **Step 6: 커밋한다**

```bash
git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleSaveIssueCode.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java
git commit -m "feat(mdm): 룰 확정 세트 검사를 흐름 노드 관계로 판정

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 10: 세트 저장·조회·되살리기를 흐름 기준으로

**모델:** sonnet · **물결:** 4 · **선행:** Task 3, Task 6

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSaveRequest.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewResult.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java`

**Interfaces:**
- Consumes:
  - `MdmRuleSet.getFlowJson()`, `DmeTestSupport.ruleSetFlow`(Task 3)
  - `RuleSetFlowJson.*`, `CondIo`, `RuleSetAnalyzer.checks(FlowDefinition, …)`, `RuleSetCheck.FLOW_READONLY`(Task 6)
  - `MdmEvaluator.compile(String)`·`usedVariables(String)`, `ExpressionFailure`(엔진 expr)
- Produces:
  - `RuleSetSaveRequest.getFlow()/setFlow(Map<String,Object>)`
  - `RuleSetViewResult.Header.getFlow(): Map<String,Object>`·`isBranched(): boolean`
  - `RuleSetWrites.update(String setId, String name, String ruleIdsJson, String flowJson, String description, long rowVersion)`
  - `RuleSetWrites.SetState(String status, long rowVersion, String ruleIds, String flowJson)`
  - `RuleIoReader.condIo(FlowDefinition flow): Map<String, CondIo>`

**저장 규칙.**
- `flow` 가 오면: 흐름을 코덱으로 읽는다(형식 오류는 MDM021). 룰 ID 는 서버가 `RuleSetFlowJson.ruleIds(flow)` 로 펼친다. 요청의 `rules` 는 무시한다. 룰 ID 형식을 검사하고, 흐름 기준 검사가 거부하면 MDM024. `FLOW_JSON` 에는 받은 맵(view 포함)을, `RULE_IDS` 에는 펼친 목록을 쓴다.
- `flow` 가 없으면: 지금처럼 `rules` 목록을 쓴다. 단, 저장된 `FLOW_JSON` 이 분기 흐름이면 MDM024 + `FLOW_READONLY` 로 거부한다(Review Focus 1). 한 줄이거나 NULL 이면 `FLOW_JSON` 을 NULL 로 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`RuleSetEditServiceTest.java` 에 픽스처 흐름과 테스트를 더한다. 룰은 기존 픽스처를 쓴다: R_GRD(SET_THK → S_GRD), R_DUP(SET_WID → S_GRD), R_FCT(S_GRD·SET_WID → S_FCT).

```java
/** IF 갈래 두 개(R_GRD / 그 외 R_DUP)가 같은 S_GRD 를 만들고, 합류 뒤 R_FCT 가 읽는다. R_GRD 는 합류 뒤에 한 번 더 나오지 않는다. */
static final String IF_FLOW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
        + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_GRD\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"R_DUP\"},"
        + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_FCT\"},{\"id\":\"end\",\"kind\":\"END\"}],"
        + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
        + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"SET_THK > 1\"},"
        + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},"
        + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"m1\"},"
        + "{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"r3\"},{\"id\":\"e7\",\"from\":\"r3\",\"to\":\"end\"}],"
        + "\"view\":{\"positions\":{\"r1\":{\"x\":10,\"y\":20}}}}";

/** 같은 룰(R_GRD)을 두 IF 갈래에 둔 흐름 — RULE_IDS 는 중복 없이 한 번(Review Focus 3). */
static final String SAME_RULE_FLOW = IF_FLOW.replace("\"ruleId\":\"R_DUP\"", "\"ruleId\":\"R_GRD\"");

private static RuleSetSaveRequest flowReq(String setId, long rv, String flowJson) {
    RuleSetSaveRequest r = saveReq(setId, "흐름 세트", null, rv);
    r.setFlow(RuleSetFlowJson.toMap(flowJson));
    return r;
}

@Test
void 흐름을_저장하면_FLOW_JSON_은_받은_그대로_RULE_IDS_는_서버가_펼친_목록이다() {
    RuleSetSaveResult r = writeOnly("S_CHAIN", () -> service.save(flowReq("S_CHAIN", 3L, IF_FLOW)));

    assertEquals(4L, r.getRowVersion());
    Map<String, Object> row = setRow("S_CHAIN");
    assertEquals("[\"R_GRD\",\"R_DUP\",\"R_FCT\"]", row.get("RULE_IDS"));
    assertEquals(RuleSetFlowJson.toMap(IF_FLOW), RuleSetFlowJson.toMap((String) row.get("FLOW_JSON")));
    assertTrue(codes(r.getChecks()).isEmpty(), r.getChecks().toString());
}

@Test
void 같은_룰이_두_갈래에_있으면_RULE_IDS_에_한_번만_쓰고_검사도_한_번이다() {
    service.save(flowReq("S_CHAIN", 3L, SAME_RULE_FLOW));

    assertEquals("[\"R_GRD\",\"R_FCT\"]", setRow("S_CHAIN").get("RULE_IDS"));
    RuleSetViewResult v = view("S_CHAIN");
    assertEquals(List.of("R_GRD", "R_FCT"), v.getSet().getRuleIds());
    assertTrue(v.getSet().isBranched());
    assertTrue(codes(v.getChecks()).isEmpty(), v.getChecks().toString());
}

@Test
void 흐름_검사가_거부하면_MDM024_이고_행은_그대로다() {
    String sibling = IF_FLOW.replace("\"ruleId\":\"R_DUP\"", "\"ruleId\":\"R_FCT\"").replace("{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_FCT\"}",
            "{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_SPD\"}");
    BusinessException e = refuse(() -> service.save(flowReq("S_CHAIN", 3L, sibling)));

    assertEquals("MDM024", code(e));
    assertTrue(e.getMessage().contains("IF_SIBLING"), e.getMessage());
}

@Test
void 흐름_형식이_틀리면_MDM021_이다() {
    RuleSetSaveRequest r = saveReq("S_CHAIN", "흐름 세트", null, 3L);
    r.setFlow(Map.of("version", 2, "nodes", List.of(), "edges", List.of()));

    assertEquals("MDM021", refuseCode(() -> service.save(r)));
}

@Test
void 분기_세트를_목록으로_저장하면_FLOW_READONLY_로_거부한다() {
    DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", IF_FLOW);

    BusinessException e = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_FCT", "R_SPD")));

    assertEquals("MDM024", code(e));
    assertEquals("FLOW_READONLY", e.getErrors().get(1).code());
    assertEquals("룰 세트 저장 검사를 통과하지 못했습니다: -[-] FLOW_READONLY 분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다",
            e.getMessage());
}

@Test
void 한_줄_흐름_세트는_목록으로_저장하면_FLOW_JSON_을_지운다() {
    DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN",
            "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_GRD\"},"
            + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}");

    service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_FCT"));

    assertNull(setRow("S_CHAIN").get("FLOW_JSON"));
}

@Test
void 조회는_흐름과_분기_여부와_흐름_기준_검사를_싣는다() {
    DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", IF_FLOW);
    jdbc.update("UPDATE TB_MDM_RULE_SET SET RULE_IDS = '[\"R_GRD\",\"R_DUP\",\"R_FCT\"]' WHERE MARU_RULE_SET_ID = 'S_CHAIN'");

    RuleSetViewResult v = view("S_CHAIN");

    assertTrue(v.getSet().isBranched());
    assertEquals(RuleSetFlowJson.toMap(IF_FLOW), v.getSet().getFlow());
    assertTrue(codes(v.getChecks()).isEmpty(), v.getChecks().toString());
    assertFalse(view("S_OTHER").getSet().isBranched());
    assertNull(view("S_OTHER").getSet().getFlow());
}

@Test
void 되살리기도_흐름_기준으로_검사한다() {
    String sibling = IF_FLOW.replace("\"ruleId\":\"R_DUP\"", "\"ruleId\":\"R_FCT\"").replace("{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_FCT\"}",
            "{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_SPD\"}");
    DmeTestSupport.ruleSetFlow(jdbc, "S_OLD", sibling);
    jdbc.update("UPDATE TB_MDM_RULE_SET SET RULE_IDS = '[\"R_GRD\",\"R_FCT\",\"R_SPD\"]' WHERE MARU_RULE_SET_ID = 'S_OLD'");

    assertEquals("MDM024", refuseCode(() -> service.restore(statusReq("S_OLD", 2L))));
}
```

`sibling` 흐름에서 R_FCT 는 그 외 갈래에 있고 S_GRD 를 읽는다. S_GRD 는 첫 갈래의 R_GRD 만 만든다. 그래서 `IF_SIBLING` 이다. `SET_THK` 는 컬럼 사전에 있으므로 조건식 `SET_THK > 1` 은 DICT 로 통과한다. `assertFalse`·`assertNull` import 가 없으면 더한다.

- [ ] **Step 2: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetEditServiceTest' --console=plain)`
Expected: FAIL(컴파일 오류 — `setFlow`·`isBranched`·`getFlow` 없음).

- [ ] **Step 3: DTO 두 개를 넓힌다**

`RuleSetSaveRequest.java` — 필드·접근자와 주석을 더한다.

```java
/**
 * 흐름도(spec §3.3, FLOW_JSON 모양). 있으면 {@code rules} 를 무시하고 서버가 흐름에서 룰 목록을 펼친다. 없으면 {@code rules} 목록 저장이다(분기 세트는
 * FLOW_READONLY 로 거부). 1단계 화면은 보내지 않는다 — 2단계 캔버스가 쓴다.
 */
private Map<String, Object> flow;

public Map<String, Object> getFlow() { return flow; }
public void setFlow(Map<String, Object> v) { this.flow = v; }
```

`RuleSetViewResult.Header` — 필드·생성자 인자·접근자를 더한다. 생성자는 `(setId, setName, description, status, rowVersion, ruleIds, flow, branched)` 8인자로 바꾼다. 다른 곳에서 `new RuleSetViewResult.Header(` 를 부르는지 `grep -rn 'Header(' src/backend/mdm --include='*.java'` 로 확인하고 함께 고친다.

```java
/** 저장된 흐름(view 포함). FLOW_JSON 이 NULL 이면 null. */
private Map<String, Object> flow;
/** 분기(IF·PARALLEL)가 있으면 true — 1단계 화면은 목록을 읽기 전용으로 보인다. */
private boolean branched;

public Map<String, Object> getFlow() { return flow; }
public boolean isBranched() { return branched; }
public void setFlow(Map<String, Object> v) { this.flow = v; }
public void setBranched(boolean v) { this.branched = v; }
```

- [ ] **Step 4: `RuleSetWrites` 에 FLOW_JSON 을 싣는다**

```java
/** 0행 분류와 되살리기 검사에 쓰는 세트 한 행의 현재 값. */
public record SetState(String status, long rowVersion, String ruleIds, String flowJson) {
}

/** 저장 — INUSE 이고 row_version 이 같을 때만 세트명·룰 목록(JSON)·흐름(JSON, NULL 허용)·설명을 바꾸고 row_version 을 올린다. */
public int update(String setId, String name, String ruleIdsJson, String flowJson, String description, long rowVersion) {
    NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET SET MARU_RULE_SET_NAME = :name, RULE_IDS = :ids, FLOW_JSON = :flow, DESCRIPTION = :desc, "
            + "ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET + " WHERE MARU_RULE_SET_ID = :id AND ROW_VERSION = :rv AND STATUS = 'INUSE'")
            .setParameter("id", setId).setParameter("rv", rowVersion).setParameter("name", name).setParameter("ids", ruleIdsJson);
    q.setParameter("flow", flowJson, String.class);
    q.setParameter("desc", description, String.class);
    return q.executeUpdate();
}

public Optional<SetState> state(String setId) {
    List<Object[]> rows = entityManager.createQuery(
                    "SELECT s.status, s.rowVersion, s.ruleIds, s.flowJson FROM MdmRuleSet s WHERE s.maruRuleSetId = :id", Object[].class)
            .setParameter("id", setId).getResultList();
    if (rows.isEmpty()) {
        return Optional.empty();
    }
    Object[] r = rows.get(0);
    return Optional.of(new SetState((String) r[0], ((Number) r[1]).longValue(), (String) r[2], (String) r[3]));
}
```

- [ ] **Step 5: `RuleIoReader.condIo` 를 더한다**

생성자에 `MdmEvaluator evaluator` 를 더한다(스프링이 주입한다. 직접 `new RuleIoReader(` 하는 곳은 없다).

```java
// import
import kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * IF 갈래 조건식 입력(계획 C4) — otherwise 가 아닌 선만, 조건식이 비어 있으면 뺀다(구조 검사가 FLOW_IF_ELSE 로 잡는다). 파싱 실패는
 * {@code ok=false} 와 오류 문구. 변수는 {@code EVAL_TS}·예약 접두어({@code _}) 이름을 빼고, 컬럼 사전에 있으면 DICT, 없으면 NONE.
 */
public Map<String, CondIo> condIo(FlowDefinition flow) {
    Set<String> ifs = new HashSet<>();
    for (FlowNode n : flow.nodes()) {
        if (n.kind() == NodeKind.IF) {
            ifs.add(n.id());
        }
    }
    Map<String, Boolean> dictionary = new HashMap<>();
    Map<String, CondIo> out = new LinkedHashMap<>();
    for (FlowEdge e : flow.edges()) {
        if (!ifs.contains(e.from()) || e.otherwise() || e.cond() == null || e.cond().isBlank()) {
            continue;
        }
        try {
            evaluator.compile(e.cond());
        } catch (ExpressionFailure f) {
            out.put(e.id(), new CondIo(false, f.getMessage(), List.of()));
            continue;
        }
        List<IoName> vars = new ArrayList<>();
        for (String name : evaluator.usedVariables(e.cond())) {
            if (ReservedNames.EVAL_TS.equals(name) || name.startsWith(ReservedNames.RESERVED_PREFIX)) {
                continue;
            }
            boolean dict = dictionary.computeIfAbsent(name, n -> columnRepository.findByPhysName(n).isPresent());
            vars.add(new IoName(name, dict ? RuleIo.DICT : RuleIo.NONE, null, null, null, false, null));
        }
        out.put(e.id(), new CondIo(true, null, vars));
    }
    return out;
}
```

- [ ] **Step 6: `RuleSetEditService` 의 view·save·restore 를 바꾼다**

```java
// import
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;

static final String FLOW_READONLY_MESSAGE = "분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다";

public RuleSetViewResult view(RuleSetViewRequest request) {
    String setId = requireSetId(request == null ? null : request.getSetId());
    MdmRuleSet set = setRepository.findById(setId).orElseThrow(() -> notFound(setId));
    List<String> ruleIds = ruleIdsOf(set.getRuleIds());
    Map<String, RuleIo> io = ioReader.read(ruleIds);
    FlowDefinition flow = set.getFlowJson() == null ? null : RuleSetFlowJson.parse(set.getFlowJson());
    List<RuleSetCheck> checks = flow == null ? RuleSetAnalyzer.checks(ruleIds, io) : RuleSetAnalyzer.checks(flow, io, ioReader.condIo(flow));
    boolean steward = stewardCheck.isSteward();
    RuleSetViewResult.Header header = new RuleSetViewResult.Header(set.getMaruRuleSetId(), set.getMaruRuleSetName(),
            set.getDescription(), set.getStatus(), set.getRowVersion(), ruleIds,
            set.getFlowJson() == null ? null : RuleSetFlowJson.toMap(set.getFlowJson()), flow != null && RuleSetFlowJson.branched(flow));
    return new RuleSetViewResult(header, List.copyOf(io.values()), checks,
            steward && INUSE.equals(set.getStatus()), steward && DEPRECATED.equals(set.getStatus()));
}

public RuleSetSaveResult save(RuleSetSaveRequest request) {
    if (request == null) {
        throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
    }
    String setId = requireSetId(request.getSetId());
    long rv = requireRowVersion(request.getRowVersion());
    String name = validName(request.getSetName());
    List<String> ids;
    List<RuleSetCheck> checks;
    String flowJson;
    if (request.getFlow() != null) {
        FlowDefinition flow = requestFlow(request.getFlow());
        ids = RuleSetFlowJson.ruleIds(flow);
        ids.forEach(RuleIdRules::validateRuleId);
        stewardCheck.requireSteward();
        checks = RuleSetAnalyzer.checks(flow, ioReader.read(ids), ioReader.condIo(flow));
        flowJson = RuleSetFlowJson.write(request.getFlow());
    } else {
        ids = requestRuleIds(request.getRules());
        stewardCheck.requireSteward();
        rejectBranchedListSave(setId);
        checks = RuleSetAnalyzer.checks(ids, ioReader.read(ids));
        flowJson = null;
    }
    rejectIfAny(checks);
    String description = blankToNull(request.getDescription());
    tx.executeWithoutResult(status -> {
        if (writes.update(setId, name, DomainJson.write(ids), flowJson, description, rv) == 0) {
            throw writeMissed(setId, rv, INUSE);
        }
    });
    return new RuleSetSaveResult(setId, rv + 1, warnings(checks));
}

/** 요청 흐름 → 엔진 정의. 형식 오류는 MDM021(I13). */
private static FlowDefinition requestFlow(Map<String, Object> flow) {
    try {
        return RuleSetFlowJson.fromMap(flow);
    } catch (IllegalArgumentException e) {
        throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "흐름 형식이 올바르지 않습니다: " + e.getMessage(), List.of());
    }
}

/** 분기 흐름이 저장된 세트를 목록으로 덮어쓰지 못하게 한다(Review Focus 1). 없는 세트는 여기서 보지 않는다(쓰기 0행이 가른다). */
private void rejectBranchedListSave(String setId) {
    writes.state(setId).map(SetState::flowJson).filter(json -> json != null && RuleSetFlowJson.branched(RuleSetFlowJson.parse(json)))
            .ifPresent(json -> {
                throw RuleSetRejections.saveRejected(List.of(new RuleSetCheck(RuleSetCheck.FLOW_READONLY, RuleSetCheck.REJECT, null, null, null,
                        FLOW_READONLY_MESSAGE)));
            });
}
```

`restore` 안의 검사 두 줄을 흐름 기준으로 바꾼다:

```java
List<String> ids = ruleIdsOf(state.ruleIds());
Map<String, RuleIo> io = ioReader.read(ids);
FlowDefinition flow = state.flowJson() == null ? null : RuleSetFlowJson.parse(state.flowJson());
List<RuleSetCheck> checks = flow == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(flow, io, ioReader.condIo(flow));
```

클래스 주석의 "쓰기는 … 한 행만 바꾼다" 문단 뒤에 "흐름 세트(FLOW_JSON)는 흐름 기준으로 검사하고 RULE_IDS 는 서버가 흐름에서 펼친다(흐름도 계획 Task 10). 분기 세트를 목록으로 저장하면 FLOW_READONLY 로 거부한다."를 더한다.

- [ ] **Step 7: 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetEditServiceTest' --tests '*RuleSetMngServiceTest' --tests '*DmeOasisHttpTest' --tests '*RuleSetLifecycleOasisFlowTest' --console=plain)`
Expected: PASS. 기존 테스트 가운데 `writes.update(` 를 직접 부르거나 `SetState` 를 만드는 것이 있으면 인자를 맞춘다.

- [ ] **Step 8: 커밋한다**

```bash
git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSaveRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewResult.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java
git commit -m "feat(mdm): 룰 세트 저장·조회·되살리기를 흐름 기준으로, 분기 세트 목록 저장 거부

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---


---

### Task 11: 운영 정의 조회기·RuleSetRunner·OASIS 경로

**모델:** opus · **물결:** 5 · **선행:** Task 7(traceSet), Task 10

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunRequest.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java`
- Create: `src/backend/mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn`
- Create: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupTest.java`
- Create: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java`
- Create: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerOasisTest.java`

`common/rule/dto` 폴더가 없으면 만든다. 이미 다른 이름의 DTO 폴더 관례가 있으면(예: `common/rule/…Result` 가 같은 패키지에 있음) 그 관례를 따른다.

**Interfaces:**
- Consumes:
  - `RuleEngine.traceSet(RuleSetDefinition, Map, Instant): RunTrace`, `RuleSetResult.path()`, `RunTrace`(Task 5·7)
  - `DefinitionLookup.RuleSetDefinition(String, List<String>, SetStatus, FlowDefinition)`(Task 1)
  - `RuleSetFlowJson.parse`·`fromMap`(Task 6), `MdmRuleSet.getFlowJson()`(Task 3)
  - `RuleVersions.currentReleased(Collection<MdmRuleVer>, LocalDateTime)`, `RuleQueries.versions(String)`, `StoredRuleDefinitions.read(String,int)`·`assemble(String,String,Stored)`, `MdmClockConfig.KST`, `RuleCaseJudge.object(String)`(숫자 BigDecimal), `RuleErrorText.describe(String, String, Integer, String, String)`
- Produces:
  - `StoredDefinitionLookup(RuleQueries, StoredRuleDefinitions, MdmRuleRepository, MdmRuleSetRepository) implements DefinitionLookup` — **빈 아님**
  - `@Service("ruleSetRunner") RuleSetRunner`:
    - `RuleSetResult run(String setId, Map<String,Object> record, Instant evalTs)`
    - `RunTrace trace(Map<String,Object> flow, Map<String,Object> record, Instant evalTs)`
    - `RuleSetRunResult execute(RuleSetRunRequest request)`
  - `RuleSetRunRequest{setId, recordJson, evalTs}`(모두 String). `RuleSetRunResult{setId, evalTs, finalValues(Map), path(List<Map>)}`

**OASIS 경로 검증 위치.** OASIS 로더(`ClassPathFileServiceLoader`)는 `classpath*:services/**` 를 읽으므로 테스트 자원 BPMN 도 서비스로 뜬다. 어휘 테스트 `MdmOasisActionVocabularyTest` 는 `src/main/resources/services` 만 걸어서 테스트 자원 BPMN 을 보지 않는다. `DmeBpmnActionTest` 는 파일을 이름으로 지정한다. `oasis-contract-check` 는 `MES_MODULES`(mcm·mls·mqc·mpp·mas·mcm-core)만 보므로 mdm BPMN 은 검사 대상이 아니다. 그래서 테스트 전용 BPMN 을 `src/test/resources/services/probe/ruleSetRunProbe.bpmn` 에 둔다. 서비스 ID `ruleSetRunProbe` 는 main 의 어떤 BPMN 과도 겹치지 않아야 한다("Duplicate service files" 방지).

- [ ] **Step 1: 조회기 테스트를 쓴다(Review Focus 2 포함)**

`StoredDefinitionLookupTest.java`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Instant;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — 판정 시각(KST)에 적용되는 RELEASED 버전, 세트 흐름·한 줄 흐름. 적용 기간은 시작 포함·끝 배타다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class StoredDefinitionLookupTest extends AbstractMdmSharedDbTest {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    RuleQueries queries;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleSetRepository setRepository;

    private StoredDefinitionLookup lookup;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.rule(jdbc, "R_TS", "기간 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_TS", 1, "FIRST", "2026-01-01 00:00:00", "2026-06-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_TS", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.released(jdbc, "R_TS", 2, "FIRST", "2026-06-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_TS", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        lookup = new StoredDefinitionLookup(queries, stored, ruleRepository, setRepository);
    }

    @Test
    void 판정_시각이_APPLY_FROM_과_같으면_그_버전이고_APPLY_TO_와_같으면_아니다() {
        // 2026-06-01 00:00:00 KST = 2026-05-31T15:00:00Z — v1 의 끝(배타) = v2 의 시작(포함)
        assertEquals(2, lookup.rule("R_TS", Instant.parse("2026-05-31T15:00:00Z")).orElseThrow().ver());
        assertEquals(1, lookup.rule("R_TS", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver());
        // 2026-01-01 00:00:00 KST = 2025-12-31T15:00:00Z — v1 시작(포함), 1초 전은 없음
        assertEquals(1, lookup.rule("R_TS", Instant.parse("2025-12-31T15:00:00Z")).orElseThrow().ver());
        assertTrue(lookup.rule("R_TS", Instant.parse("2025-12-31T14:59:59Z")).isEmpty());
        assertTrue(lookup.rule("NO_SUCH", Instant.parse("2026-05-31T15:00:00Z")).isEmpty());
    }

    @Test
    void 세트는_FLOW_JSON_이_없으면_한_줄_흐름이고_있으면_흐름을_싣는다() {
        DmeTestSupport.ruleSet(jdbc, "S_LINE", "한 줄", "[\"R_TS\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_FLOW", "흐름", "[\"R_TS\"]", "DEPRECATED", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_FLOW", "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_TS\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}");

        RuleSetDefinition line = lookup.ruleSet("S_LINE").orElseThrow();
        assertEquals(List.of("R_TS"), line.ruleIds());
        assertEquals(SetStatus.INUSE, line.status());
        assertNull(line.flow());

        RuleSetDefinition flow = lookup.ruleSet("S_FLOW").orElseThrow();
        assertEquals(SetStatus.DEPRECATED, flow.status());
        assertEquals(NodeKind.RULE, flow.flow().nodes().get(1).kind());
        assertTrue(lookup.ruleSet("S_NONE").isEmpty());
        assertTrue(lookup.column("T", "C").isEmpty());
    }
}
```

`DmeTestSupport.released` 는 APPLY_TO 가 null 이면 `9999-12-31 00:00:00` 을 넣는다. TB_MDM_RULE_VER 의 CHECK 가 같은 룰에 RELEASED 두 개를 막으면(제약 오류로 드러남) v1 을 `pending(jdbc, "R_TS", 1, …)` 이 아닌 다른 방법으로 넣지 말고, 제약 이름과 함께 보고한다. 그 경우 기간 경계 테스트는 v1 하나(`2026-01-01`~`2026-06-01`)로 끝 배타만 본다.

- [ ] **Step 2: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*StoredDefinitionLookupTest' --console=plain)`
Expected: FAIL(컴파일 오류 — `StoredDefinitionLookup` 없음).

- [ ] **Step 3: 조회기를 쓴다**

```java
package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — MDM 앱 안에서 원장을 직접 읽는다. 룰은 판정 시각(KST 벽시계)에 적용되는 RELEASED 버전
 * ({@link RuleVersions#currentReleased}: {@code APPLY_FROM <= now < APPLY_TO}), 세트는 현재 행(FLOW_JSON 이 없으면 흐름 null = 한 줄 흐름).
 *
 * <p><b>스프링 빈이 아니다</b> — {@code MdmBusinessRuleMigrationTest} 가 {@code DefinitionLookup} 빈 0개를 요구한다. {@code RuleSetRunner} 가 호출마다
 * 만든다. 한 인스턴스 안에서 (룰, 판정 시각) 결과를 캐시한다. 컬럼 검증 정의는 이 조회기의 몫이 아니라 빈 값이다.
 */
public final class StoredDefinitionLookup implements DefinitionLookup {

    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final Map<String, Optional<RuleDefinition>> cache = new HashMap<>();

    public StoredDefinitionLookup(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return cache.computeIfAbsent(ruleId + "@" + evalTs, k -> load(ruleId, evalTs));
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        return sets.findById(setId).map(StoredDefinitionLookup::toDefinition);
    }

    private Optional<RuleDefinition> load(String ruleId, Instant evalTs) {
        MdmRule rule = rules.findById(ruleId).orElse(null);
        if (rule == null) {
            return Optional.empty();
        }
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        Optional<MdmRuleVer> ver = RuleVersions.currentReleased(queries.versions(ruleId), now);
        return ver.flatMap(v -> stored.read(ruleId, v.getVer())).map(s -> stored.assemble(ruleId, rule.getRuleKind(), s).definition());
    }

    private static RuleSetDefinition toDefinition(MdmRuleSet s) {
        List<String> ids = DomainJson.readList(s.getRuleIds()).stream().map(String::valueOf).toList();
        return new RuleSetDefinition(s.getMaruRuleSetId(), ids, SetStatus.valueOf(s.getStatus()),
                s.getFlowJson() == null ? null : RuleSetFlowJson.parse(s.getFlowJson()));
    }
}
```

`RuleVersions` 가 `common.rule` 패키지가 아니면 실제 패키지로 import 를 맞춘다(`grep -rn 'class RuleVersions' src/backend/mdm/lib`).

- [ ] **Step 4: 조회기 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*StoredDefinitionLookupTest' --tests '*MdmBusinessRuleMigrationTest' --console=plain)`
Expected: PASS. 정의 조회 빈 0개 테스트도 그대로 통과한다.

- [ ] **Step 5: 실행 클래스 테스트를 쓴다**

`RuleSetRunnerTest.java` — 샘플 룰 `QLTY_GRD_JDG`(COIL_THK 1.6~2.5 · COIL_WID > 1000 · SURF_GRD IN [A] → QLTY_GRD "A", PRC_FCT 1.05, 기본 행 C/0.90)를 쓴다.

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** RuleSetRunner(spec §6.2, 계획 Task 11) — 저장된 세트 실행, 저장 전 흐름 기록 실행, OASIS DTO 입구. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetRunnerTest extends AbstractMdmSharedDbTest {

    static final String IF_FLOW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},"
            + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
            + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"m1\",\"order\":1,\"cond\":\"COIL_THK >= 3\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},"
            + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"m1\",\"to\":\"end\"}]}";

    static final Map<String, Object> RECORD = Map.of("COIL_THK", new BigDecimal("2.0"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A");
    static final Instant TS = Instant.parse("2026-03-01T00:00:00Z");

    @Autowired
    RuleSetRunner runner;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "RS_IF", "흐름", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_IF", IF_FLOW);
    }

    @Test
    void 한_줄_세트를_실행하면_결과와_경로를_돌려준다() {
        RuleSetResult r = runner.run("RS_LINE", RECORD, TS);

        assertEquals("A", r.finalValues().get("QLTY_GRD"));
        assertEquals(0, new BigDecimal("1.05").compareTo((BigDecimal) r.finalValues().get("PRC_FCT")));
        assertEquals(List.of("start", "r1", "end"), r.path().stream().map(RuleSetResult.PathStep::nodeId).toList());
    }

    @Test
    void 흐름_세트는_고른_갈래만_실행한다() {
        RuleSetResult r = runner.run("RS_IF", RECORD, TS);

        assertEquals("A", r.finalValues().get("QLTY_GRD"));
        RuleSetResult.PathStep ifStep = r.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow();
        assertEquals("e3", ifStep.chosenEdgeId());

        RuleSetResult skipped = runner.run("RS_IF", Map.of("COIL_THK", new BigDecimal("3.5"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A"), TS);
        assertEquals(Map.of(), skipped.finalValues());
    }

    @Test
    void 판정_시각이_없으면_서비스_시계를_쓴다() {
        RuleSetResult r = runner.run("RS_LINE", RECORD, null);
        assertEquals(DmeTestSupport.NOW_INSTANT, r.evalTs());
    }

    @Test
    void 판정_오류는_엔진_예외로_올라간다() {
        assertThrows(EngineEvaluationException.class, () -> runner.run("RS_NONE", RECORD, TS));
    }

    @Test
    void 저장하지_않은_흐름도_기록_실행한다() {
        RunTrace t = runner.trace(RuleSetFlowJson.toMap(IF_FLOW), RECORD, TS);

        assertNull(t.violations());
        assertEquals(List.of("start", "if1", "r1", "m1", "end"), t.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        assertEquals("A", t.finalValues().get("QLTY_GRD"));
    }

    @Test
    void OASIS_입구는_JSON_레코드와_KST_시각을_받고_오류를_업무_예외로_바꾼다() {
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("RS_LINE");
        req.setRecordJson("{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetRunResult r = runner.execute(req);

        assertEquals("2026-03-01 09:00:00", r.getEvalTs());
        assertEquals("A", r.getFinalValues().get("QLTY_GRD"));
        assertEquals("r1", r.getPath().get(1).get("nodeId"));

        req.setRecordJson("{\"COIL_THK\":2.0}");
        BusinessException e = assertThrows(BusinessException.class, () -> runner.execute(req));
        assertEquals(true, e.getMessage().contains("COIL_WID"), e.getMessage());
    }
}
```

`DmeTestSupport.NOW_INSTANT` 가 없으면 `DmeTestSupport` 의 `NOW`(MutableClock 초기 시각) 정의를 읽고, 같은 값을 `Instant` 로 바꾼 상수 `public static final Instant NOW_INSTANT` 를 `DmeTestSupport` 에 더한다. `NOW` 가 이미 `Instant` 면 그것을 쓰고 새 상수는 만들지 않는다.

- [ ] **Step 6: 실패를 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerTest' --console=plain)`
Expected: FAIL(컴파일 오류 — `RuleSetRunner`·DTO 없음).

- [ ] **Step 7: DTO 와 실행 클래스를 쓴다**

`RuleSetRunRequest.java`:

```java
package com.dongkuk.dmes.mdm.common.rule.dto;

/**
 * OASIS 업무 서비스에서 룰 세트를 부르는 요청(spec §6.2, 계획 Task 11). 레코드는 JSON 문자열로 받는다(숫자는 BigDecimal 로 읽는다) —
 * OASIS params 는 평평한 값만 확실히 바인딩한다. {@code evalTs} 는 KST {@code yyyy-MM-dd HH:mm:ss}, 없으면 서비스 시계.
 */
public class RuleSetRunRequest {

    private String setId;
    private String recordJson;
    private String evalTs;

    public String getSetId() { return setId; }
    public String getRecordJson() { return recordJson; }
    public String getEvalTs() { return evalTs; }

    public void setSetId(String v) { this.setId = v; }
    public void setRecordJson(String v) { this.recordJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
```

`RuleSetRunResult.java`:

```java
package com.dongkuk.dmes.mdm.common.rule.dto;

import java.util.List;
import java.util.Map;

/** 룰 세트 실행 응답 — 결과 변수 전체와 방문 경로(노드 ID·종류·고른 선·결과 자리). 시각은 KST 문자열. */
public class RuleSetRunResult {

    private String setId;
    private String evalTs;
    private Map<String, Object> finalValues;
    private List<Map<String, Object>> path;

    public String getSetId() { return setId; }
    public String getEvalTs() { return evalTs; }
    public Map<String, Object> getFinalValues() { return finalValues; }
    public List<Map<String, Object>> getPath() { return path; }

    public void setSetId(String v) { this.setId = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setFinalValues(Map<String, Object> v) { this.finalValues = v; }
    public void setPath(List<Map<String, Object>> v) { this.path = v; }
}
```

`RuleSetRunner.java`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.springframework.stereotype.Service;

/**
 * 룰 세트 실행(spec §6.2, ADR 0005) — OASIS 업무 서비스와 룰 세트 편집 화면 디버거가 부른다. 호출마다 {@link StoredDefinitionLookup}(빈 아님)과
 * {@link MdmRuleEngine} 을 만들고 공유 {@link MdmEvaluator} 빈을 넘겨 컴파일 캐시를 같이 쓴다. 판정 시각이 없으면 서비스 시계(KST)로 채운다
 * (엔진은 시계를 읽지 않는다, decisions.md:161).
 *
 * <p>OASIS BPMN 은 {@code camunda:class="ruleSetRunner"} + {@code method=execute} serviceTask 하나로 부른다. 판정 오류는 {@link #run} 에서
 * {@link EngineEvaluationException} 으로 올라가고, {@link #execute} 는 {@link RuleErrorText} 문구로 바꾼 업무 예외를 던진다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS 파라미터 이름 바인딩이 깨진다(읽기만 한다).
 */
@Service("ruleSetRunner")
public class RuleSetRunner {

    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public RuleSetRunner(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets,
                         MdmEvaluator evaluator, Clock clock) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    /** 저장된 세트를 판정한다. 판정 오류는 {@link EngineEvaluationException}. */
    public RuleSetResult run(String setId, Map<String, Object> record, Instant evalTs) {
        return engine().evaluateSet(setId, record, ts(evalTs));
    }

    /** 화면이 보낸 흐름(저장 전 포함)을 기록 실행한다. 던지지 않는다 — 오류는 기록에 담긴다. */
    public RunTrace trace(Map<String, Object> flow, Map<String, Object> record, Instant evalTs) {
        FlowDefinition def = RuleSetFlowJson.fromMap(flow);
        RuleSetDefinition set = new RuleSetDefinition("(저장 전)", RuleSetFlowJson.ruleIds(def), SetStatus.INUSE, def);
        return engine().traceSet(set, record, ts(evalTs));
    }

    /** OASIS serviceTask 입구 — 레코드 JSON·KST 시각 문자열을 받고, 판정 오류를 업무 예외로 바꾼다. */
    public RuleSetRunResult execute(RuleSetRunRequest request) {
        if (request == null || request.getSetId() == null || request.getSetId().isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        Map<String, Object> record = request.getRecordJson() == null || request.getRecordJson().isBlank()
                ? Map.of() : RuleCaseJudge.object(request.getRecordJson());
        if (record == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "레코드 JSON 은 객체여야 합니다: " + request.getRecordJson());
        }
        Instant ts = request.getEvalTs() == null || request.getEvalTs().isBlank() ? null : parseKst(request.getEvalTs());
        RuleSetResult r;
        try {
            r = run(request.getSetId(), record, ts);
        } catch (EngineEvaluationException e) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, e.violations().stream()
                    .map(v -> RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message()))
                    .collect(Collectors.joining("; ")));
        }
        RuleSetRunResult out = new RuleSetRunResult();
        out.setSetId(r.setId());
        out.setEvalTs(LocalDateTime.ofInstant(r.evalTs(), MdmClockConfig.KST).format(TS));
        out.setFinalValues(new LinkedHashMap<>(r.finalValues()));
        out.setPath(r.path().stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("nodeId", p.nodeId());
            m.put("kind", p.kind().name());
            m.put("chosenEdgeId", p.chosenEdgeId());
            m.put("stepIndex", p.stepIndex());
            return m;
        }).toList());
        return out;
    }

    private MdmRuleEngine engine() {
        return new MdmRuleEngine(evaluator, new StoredDefinitionLookup(queries, stored, rules, sets));
    }

    private Instant ts(Instant evalTs) {
        return (evalTs == null ? clock.instant() : evalTs).truncatedTo(ChronoUnit.SECONDS);
    }

    private static Instant parseKst(String text) {
        try {
            return LocalDateTime.parse(text, TS).atZone(MdmClockConfig.KST).toInstant();
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: " + text);
        }
    }
}
```

`RuleCaseJudge.object` 가 `common.rule` 패키지의 public static 이 아니면 실제 위치로 import 를 맞춘다. `ErrorCode.BUSINESS_ERROR` 가 없으면 `MdmErrorCode` 가 쓰는 `ErrorCode` 상수(`ErrorCode.BUSINESS_ERROR` 는 `MdmErrorCode.RULE_SET_SAVE_REJECTED` 가 쓴다)를 확인해 같은 것을 쓴다. `Clock` 빈은 `MdmClockConfig.mdmClock()` 이고 테스트에서는 `DmeTestSupport.Config` 의 `MutableClock` 이 `@Primary` 다.

- [ ] **Step 8: 실행 클래스 테스트가 통과하는지 본다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerTest' --console=plain)`
Expected: PASS(6건).

- [ ] **Step 9: 테스트 자원 BPMN 으로 OASIS 경로 테스트를 쓴다**

`src/backend/mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn` — 먼저 `bpmn-skill`·`oasis-project-support` 스킬을 읽는다. 그다음 `services/dme/ruleSetEdit.bpmn` 의 머리(네임스페이스·`process` 속성·`actionGateway`)를 그대로 본떠 action 하나(`run`)만 있는 흐름을 만든다: 시작 → `actionGateway`(input=action) → 조건 `${action == 'run'}` → serviceTask `runTask` → 끝. serviceTask 모양은 다음과 같다.

```xml
<bpmn:serviceTask id="runTask" name="룰 세트 실행(테스트 탐침)" camunda:class="ruleSetRunner">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="execute" />
      <camunda:property name="output" value="result" />
      <camunda:property name="dto" value="com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

게이트웨이 조건식·시퀀스 흐름·`process id` 표기는 `ruleSetEdit.bpmn` 의 한 갈래를 글자 그대로 복사해 이름만 바꾼다. 파일 머리 주석에 "테스트 전용 — OASIS serviceTask 가 ruleSetRunner 를 부르는 경로 검증(계획 Task 11, ADR 0005). 운영 BPMN 이 아니다"를 적는다.

`RuleSetRunnerOasisTest.java` — `DmeOasisHttpTest` 의 골격(`RANDOM_PORT`, client-key 속성, `@TempDir` SQLite, `post(...)`·`envelope(...)`)을 복제한다.

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + RuleSetRunnerOasisTest.CLIENT_KEY)
@ActiveProfiles("local")
class RuleSetRunnerOasisTest {

    static final String CLIENT_KEY = "mdm-rule-set-runner-test-client-key";
    // @TempDir·@DynamicPropertySource·@LocalServerPort·HttpClient·ObjectMapper·post·envelope 는 DmeOasisHttpTest 와 같다
    // (DB 파일 이름만 "mdm-rule-set-runner-test.db")

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
    }

    @Test
    void OASIS_serviceTask_가_ruleSetRunner_를_불러_세트를_판정한다() throws Exception {
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_LINE")
                .put("recordJson", "{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}")
                .put("evalTs", "2026-03-01 09:00:00")));

        assertTrue(r.path("meta").path("success").asBoolean(false), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals("A", result.path("finalValues").path("QLTY_GRD").asText(), r.toString());
        assertEquals("r1", result.path("path").path(1).path("nodeId").asText(), r.toString());
    }

    @Test
    void 판정_오류는_OASIS_실패_응답의_문구가_된다() throws Exception {
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_LINE").put("recordJson", "{\"COIL_THK\":2.0}")));

        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        assertTrue(r.path("meta").path("message").asText().contains("COIL_WID"), r.toString());
    }
}
```

- [ ] **Step 10: OASIS 경로 테스트를 돌린다**

Run: `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetRunnerOasisTest' --tests '*MdmOasisActionVocabularyTest' --tests '*DmeBpmnActionTest' --console=plain)`
Expected: PASS. 어휘·BPMN action 테스트는 main BPMN 만 보므로 그대로 통과한다.

실패하면 원인을 가른다.
- `ServiceNotFoundException` 이면 서비스 ID·파일 위치를 확인한다. 로더는 `classpath*:services/**` 를 읽는다.
- 권한·메뉴 거부(403, MDM013 등)면 서버 쪽 RBAC 가 서비스·action 을 목록으로 막는 것이다. 그 경우 테스트 자원 BPMN 방식은 쓸 수 없다. 테스트를 `@Disabled` 로 두지 말고 그 사실을 보고한 뒤, `RuleSetRunnerTest.OASIS_입구는…` 의 직접 호출 검증만 남긴다. ADR 0005 의 "검증 범위"에 "BPMN 배선은 1단계에서 자동 검증하지 않음"이라고 적도록 Task 2 담당에게 알린다.

- [ ] **Step 11: OASIS 계약 검사를 돌린다**

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
Expected: `ERROR 0`. 이 검사기는 MES 모듈(mcm·mls·mqc·mpp·mas·mcm-core)만 보므로 mdm BPMN 은 대상이 아니다. 결과가 ERROR 0 이어도 mdm 을 검사한 것은 아니라는 점을 보고에 적는다.

- [ ] **Step 12: mdm 전체 테스트를 돌린다**

Run: `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)`
Expected: PASS.

- [ ] **Step 13: 커밋한다**

```bash
git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/dto/RuleSetRunResult.java \
  src/backend/mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunnerOasisTest.java
git commit -m "feat(mdm): 운영 정의 조회기와 RuleSetRunner, OASIS serviceTask 경로 검증

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`DmeTestSupport` 에 `NOW_INSTANT` 를 더했으면 그 파일도 `git add` 에 넣는다.


---

### Task 12: 분기 세트를 룰 세트 편집 화면에서 읽기 전용으로 표시

**모델:** sonnet

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts`(`RuleSetHeader`)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts`

**Interfaces:**
- Consumes: Task 10 의 조회 응답 `set.flow`(FLOW_JSON 을 Map 으로, view 포함)·`set.branched`(boolean)와 흐름 기준 `checks`(nodeId·edgeId 포함), Task 8 의 `RuleSetCheck` 새 칸, Task 1 의 `RuleSetFlow` 타입
- Produces: 화면 동작 — `set.branched=true` 면 세트명·설명·룰 목록 편집·룰 추가·지침 적용·세트 저장이 꺼지고 `set-branched-notice` 안내가 보이며, 검사 목록은 화면 즉시 계산 대신 서버 `view.checks` 를 보인다. 폐기·되살리기·룰 링크는 그대로다

구현 전에 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 `docs/guide/FrontEnd/Local-Rules.md` 의 ruleSetEdit·배지·안내 문구 관련 절을 확인한다. 새 컴포넌트는 만들지 않고 기존 `badgeStyle`·`MutedText` 만 쓴다.

- [ ] **Step 1: 실패 테스트 작성**

`rule-set-edit-page.test.ts` 에서 세 곳을 바꾼다.

(1) import 에 흐름 타입을 더한다.

```ts
import type { RuleSetFlow } from "../../../src/contract/engine-contract.generated";
```

(2) `chainView` 의 `set` 에 두 칸을 더한다.

```ts
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion, ruleIds: ["E2S_GRD", "E2S_FCT", "E2S_SPD"], flow: null, branched: false },
```

(3) `ORDER_MSG` 아래에 흐름 상수를, `describe` 끝(마지막 `it` 뒤)에 테스트를 더한다.

```ts
/** GRD → IF { S_GRD = "A": FCT ; 그 외: (빈 갈래) } → SPD — 분기가 있는 세트. */
const BRANCHED_FLOW: RuleSetFlow = {
  version: 1,
  nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "r1", kind: "RULE", ruleId: "E2S_GRD", splitId: null, label: null },
    { id: "if1", kind: "IF", ruleId: null, splitId: null, label: "등급" },
    { id: "r2", kind: "RULE", ruleId: "E2S_FCT", splitId: null, label: null },
    { id: "m1", kind: "MERGE", ruleId: null, splitId: "if1", label: null },
    { id: "r3", kind: "RULE", ruleId: "E2S_SPD", splitId: null, label: null },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "r1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "r1", to: "if1", order: null, cond: null, otherwise: false, label: null },
    { id: "e3", from: "if1", to: "r2", order: 1, cond: 'S_GRD = "A"', otherwise: false, label: "A 등급" },
    { id: "e4", from: "if1", to: "m1", order: null, cond: null, otherwise: true, label: "그 외" },
    { id: "e5", from: "r2", to: "m1", order: null, cond: null, otherwise: false, label: null },
    { id: "e6", from: "m1", to: "r3", order: null, cond: null, otherwise: false, label: null },
    { id: "e7", from: "r3", to: "end", order: null, cond: null, otherwise: false, label: null },
  ],
};

const PARTIAL_MSG = "E2S_SPD가 읽는 S_FCT는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다";
```

```ts
  it("분기가 있는 세트는 목록 편집·저장·지침 적용을 막고 안내와 서버 검사를 보인다(FLOW_READONLY 화면 쪽)", async () => {
    const partial = {
      code: "FLOW_PARTIAL" as const,
      severity: "WARN" as const,
      ruleId: "E2S_SPD",
      otherRuleId: null,
      varName: "S_FCT",
      message: PARTIAL_MSG,
      nodeId: "r3",
      edgeId: null,
    };
    replies["search:GUIDE"] = ok({ target: "S_SPD", order: ["E2S_GRD"], ambiguous: [], error: null, rules: [GRD] });
    await openChain(chainView({ set: { ...chainView().set, flow: BRANCHED_FLOW, branched: true }, checks: [partial] }));

    expect(byTestId("set-branched-notice").textContent).toContain("분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다");
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(true);
    expect(byTestId<HTMLTextAreaElement>("set-desc").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-rule-add-find").disabled).toBe(true);
    expect(q("set-rule-down-E2S_GRD")).toBeNull();
    expect(q("set-rule-remove-E2S_GRD")).toBeNull();
    expect(mocks.grid.current?.onRowOrderChange).toBeUndefined();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);

    // 화면 즉시 계산(한 줄)이면 "통과"지만 분기 세트는 서버 흐름 검사를 그대로 보인다.
    const checks = visibleText(byTestId("set-checks"));
    expect(checks).toContain(PARTIAL_MSG);
    expect(checks).toContain("경고");
    expect(checks).not.toContain("통과");

    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(false);
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(byTestId<HTMLButtonElement>("set-guide-apply").disabled).toBe(true);

    await click("set-rule-link-E2S_FCT");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_FCT");
    expect(calls("save")).toHaveLength(0);
  });

  it("분기가 없는 세트에는 분기 안내가 없다", async () => {
    await openChain();
    expect(q("set-branched-notice")).toBeNull();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/rule-set-edit-page.test.ts`
Expected: FAIL — `data-testid set-branched-notice 없음`(그리고 lint 단계에서 `RuleSetHeader` 에 `flow`·`branched` 가 없다는 타입 오류).

- [ ] **Step 3: RuleSetHeader 에 흐름 칸 추가**

`types.ts` 머리에 import 를 더하고 `RuleSetHeader` 를 바꾼다.

```ts
import type { RuleSetFlow } from "@/contract/engine-contract.generated";
```

```ts
export interface RuleSetHeader {
  setId: string;
  setName: string;
  description: string | null;
  status: RuleSetStatus;
  rowVersion: number;
  /** 흐름을 펼친 룰 목록(RULE_IDS, 중복 없음). */
  ruleIds: string[];
  /** 저장된 흐름(FLOW_JSON, view 포함). 목록으로만 저장된 세트면 null. */
  flow: RuleSetFlow | null;
  /** 분기(IF·병렬)가 있는 흐름이면 true — 목록 편집·저장을 막는다(서버는 FLOW_READONLY 로 거부). */
  branched: boolean;
}
```

- [ ] **Step 4: page.tsx — 목록 편집 권한에서 분기 세트 제외**

```ts
  const canEditList = !!view && view.editable && view.set.status === "INUSE" && canDo("save") && !view.set.branched;
```

머리 주석 둘째 문단 끝에 한 문장 더한다: `분기가 있는 세트(\`set.branched\`)는 목록 편집을 막는다 — 흐름도 편집기는 2단계다(스펙 §9).`

- [ ] **Step 5: RuleSetCard — 안내·서버 검사·저장 차단**

`RuleSetCard.tsx` 에서 아래를 바꾼다.

```ts
const BRANCHED_NOTICE = "분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다";
```

(상수 두 개 아래에 둔다.)

```ts
  const branched = !!set.branched;
  const io = useMemo(() => setIo(state.ids, state.rules), [state.ids, state.rules]);
  // 분기 세트는 한 줄로 다시 계산하면 틀린 결과가 나오므로 서버가 흐름 기준으로 낸 검사를 그대로 보인다.
  const checks = useMemo(
    () => (branched ? (view.checks ?? []) : setChecks(state.ids, state.rules)),
    [branched, view.checks, state.ids, state.rules],
  );

  const canSave = !branched && state.dirty && view.editable && inUse && canDo("save") && !busy;
```

세트명·설명 표(`</table>`) 바로 아래에 안내를 넣는다.

```tsx
      {branched && (
        <p data-testid="set-branched-notice" role="note" style={{ margin: "var(--spacing-xs) 0 0" }}>
          <span style={badgeStyle("warning")}>분기 세트</span> <MutedText>{BRANCHED_NOTICE}</MutedText>
        </p>
      )}
```

머리 주석 첫 문단 끝에 한 문장 더한다: `분기 세트는 목록 편집·저장을 막고 서버 검사(\`view.checks\`)를 보인다.`

- [ ] **Step 6: useRuleSetEdit — 저장 가드**

`save` 콜백 첫 줄을 바꾼다(버튼이 꺼져 있어도 상태 함수 직접 호출을 막는다).

```ts
    if (!view || view.set.branched) return;
```

- [ ] **Step 7: 테스트·타입 검사 통과 확인**

Run: `pnpm --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`
Expected: PASS, `failed 0`, exit 0(기존 사례 포함).

Run: `pnpm --filter @dk-oasis/m-mdm lint`
Expected: 오류 0.

- [ ] **Step 8: UI 규칙 audit**

Run:

```bash
D=.claude/skills/mantine-aggrid-ui/scripts
python3 $D/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts
python3 $D/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts
```

Expected: 두 audit 모두 0건. 의심 건이 나오면 스킬 문서로 확인하고, 오탐이면 이유를 태스크 보고에 적는다.

- [ ] **Step 9: 커밋**

```bash
git commit -m "feat(m-mdm): 분기 룰 세트를 편집 화면에서 읽기 전용으로 표시

set.branched 이면 세트명·목록 편집·룰 추가·지침 적용·저장을 막고 안내를 보인다.
검사 목록은 한 줄 재계산 대신 서버 흐름 검사(view.checks)를 보인다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts
```

---


---

### Task 13: ruleSetEdit 기능설계서 갱신과 전체 검증

**모델:** sonnet

**Files:**
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`(§5.2 B-002, §6.2 표, §7 표, §11 N-1·N-14·N-15)
- 검증만: 엔진·mdm lib/api·m-mdm 전체 테스트, lint, UI audit, `oasis-contract-check`, 계약 문서 대조

**Interfaces:**
- Consumes: Task 1~12 의 결과 전부. C3·C4 문구, `FLOW_READONLY` 문구(C4.2), D-107
- Produces: 1단계 완료 판정(모든 명령의 결과를 보고에 붙인다)

- [ ] **Step 1: §5.2 B-002 동작 상세에 분기 세트 규칙 추가**

`| B-002 | 클릭 | dirty, 권한 | 1) ... 4) MDM001 은 "다른 창에서 바뀌었습니다. 다시 불러오세요" + 다시 불러오기 | \`save\` |` 행의 동작 칸 끝(`다시 불러오기` 뒤)에 이어 쓴다.

```text
 5) 분기 세트(`set.branched`)는 버튼이 꺼진다. 서버는 `flow` 없는 save 가 분기 세트에 오면 MDM024 + `FLOW_READONLY` 로 거부한다(흐름을 한 줄로 덮어쓰지 않는다). 요청에 `flow` 가 있으면 서버가 흐름으로 검사하고 FLOW_JSON 과 펼친 RULE_IDS 를 함께 저장한다
```

- [ ] **Step 2: §6.2 세트 검사 표에 흐름 검사 행 추가**

XV-008 행 바로 아래(XV-009 앞)에 넣고 뒤 번호는 그대로 둔다(번호는 식별자라 다시 매기지 않는다).

```markdown
| XV-013 | `FLOW_STRUCTURE` | 거부 | 흐름 구조 오류(시작·끝 개수, 없는 노드, 선 개수, 룰 ID 없음, 짝 합류, 병렬 갈래 조건·순서, 갈래가 짝 합류 밖으로 나감, 도달 불가). 순서·문구는 구현 계획 C3 | 예: 분기 {id}를 닫는 합류가 {n}개다. 정확히 1개여야 한다 / 갈래가 {stop}에서 닫히지 않고 {cur}로 나간다 / {id}에 도달할 수 없다 |
| XV-014 | `FLOW_IF_ELSE` | 거부 | IF 의 "그 외" 갈래가 1개가 아니거나 "그 외" 가 아닌 갈래에 조건식이 없다 | IF {id}에 "그 외" 갈래가 {n}개다. 정확히 1개여야 한다 / IF {id}의 갈래 {edgeId}에 조건식이 없다 |
| XV-015 | `FLOW_COND` | 거부 | 갈래 조건식을 파싱할 수 없거나 그 지점에서 정의되지 않은 변수를 읽는다(불린이 아닌 결과는 실행 때 `BRANCH_EVAL_ERROR`) | {edgeId} 갈래 조건식을 읽을 수 없다: {오류} / {edgeId} 갈래 조건식이 읽는 {var}는 이 지점에서 정의되지 않았다 |
| XV-016 | `IF_SIBLING` | 거부 | IF 갈래 안의 룰이 같은 IF 의 다른 갈래에서만 만들어지는 결과를 읽는다 | {id}가 읽는 {var}는 같은 IF 의 다른 갈래({others})에서만 만들어진다. 이 갈래를 타면 값이 없다 |
| XV-017 | `PAR_SIBLING` | 거부 | 병렬 갈래가 형제 갈래의 결과를 읽거나 형제 갈래들이 같은 결과 변수를 쓴다 | {id}가 병렬 형제 갈래의 {other}가 만드는 {var}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다 / 병렬 갈래의 {other}와 {id}가 같은 결과 변수 {var}에 대입한다 |
| XV-018 | `FLOW_PARTIAL` | 경고 | IF 합류 뒤의 룰·조건식이 일부 갈래에서만 만들어지는 변수를 읽는다(실행 때 그 룰 직전에 키를 확인) | {id}가 읽는 {var}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다 |
| XV-019 | `FLOW_READONLY` | 거부 | 분기 세트에 `flow` 없는 목록 저장이 왔다 | 분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다 |
```

표 아래 문장 "서버는 화면 검사 결과를 받지 않고 요청 목록으로 다시 계산한다(I12)." 뒤에 이어 쓴다.

```text
 흐름 세트는 같은 검사를 흐름 경로 기준으로 한다: `ORDER`·`CYCLE`·`DUP_RESULT` 는 같은 경로 위의 룰끼리만 보고, IF 의 서로 다른 갈래가 같은 결과를 쓰는 것은 정상이다. 검사 항목에는 흐름 위치 `nodeId`·`edgeId` 가 붙는다(목록 세트는 null). 1단계 화면은 분기 세트의 검사를 다시 계산하지 않고 서버 `view.checks` 를 그대로 보인다.
```

- [ ] **Step 3: §7 상태 표에 분기 세트 행 추가**

`| \`DEPRECATED\` | ... |` 행 아래에 넣는다.

```markdown
| `INUSE` + 분기 세트(`set.branched`) | 비활성 — 안내 "분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다"(`set-branched-notice`), 룰 링크는 동작 | 비활성(서버도 `FLOW_READONLY` 로 거부) | O | — |
```

- [ ] **Step 4: §11 N-1 갱신과 N-14·N-15 추가**

N-1 행의 항목 칸 끝(`… 카드 하나(\`view\` 옆 \`execute\` action)로 더한다`) 뒤에 이어 쓴다.

```text
 **2026-09-30 갱신**: 룰 세트 흐름도 1단계에서 운영 정의 조회기(`StoredDefinitionLookup`)와 실행기(`RuleSetRunner`)가 생겼다. 카드는 목록 화면에 먼저 만들지 않고 2단계 디버거(시뮬레이션 탭)와 `simulate` action 으로 넣는다(D-107, mdm ADR-0005 D4)
```

같은 행의 근거 칸 끝에 `, D-107` 을 더한다. 표 끝(N-13 아래)에 두 행을 더한다.

```markdown
| N-14 | **흐름 저장(1단계)** — `TB_MDM_RULE_SET.FLOW_JSON`(흐름 정의 + 화면 전용 view)을 저장하고 `RULE_IDS` 는 서버가 흐름을 깊이 우선으로 펼친 중복 없는 룰 목록으로 채운다(요청의 룰 목록을 믿지 않는다). `FLOW_JSON` 이 NULL 이면 `RULE_IDS` 순서의 한 줄 흐름이다. 분기 세트는 목록 편집으로 저장할 수 없다(`FLOW_READONLY`) | 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3, D-106 |
| N-15 | 흐름 세트의 입출력 표·의존 룰은 흐름을 펼친 룰 목록으로 계산한다(1단계). 흐름 기준 입출력은 2단계 캔버스에서 필요해지면 다시 정한다 | D-106(편차 D10) |
```

- [ ] **Step 5: 문서 커밋**

```bash
git commit -m "docs(mdm): ruleSetEdit 기능설계서에 흐름 저장·흐름 검사·분기 세트 읽기 전용 반영

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- "docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md"
```

작업 트리에 이 파일의 무관한 수정이 있으면(`git diff` 로 확인) `git add -p` 로 이 태스크 덩어리만 올리고 경로 인자 없이 커밋한다.

- [ ] **Step 6: 엔진 전체 테스트**

Run:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=$JAVA_HOME/bin:$PATH
(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q); echo "engine exit $?"
```

Expected: `engine exit 0`. 기준선(8a0dd594)도 통과였으므로 실패 0 이면 회귀가 없다.

- [ ] **Step 7: mdm lib·api 전체 테스트(SQLite)**

Run:

```bash
(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q); echo "mdm exit $?"
```

Expected: `mdm exit 0`. 도커를 쓰는 테스트는 없다(mdm 은 SQLite 만). 실패가 있으면 `src/backend/mdm/{lib,api}/build/reports/tests/test/index.html` 에서 실패 클래스를 보고 담당 태스크 번호와 함께 보고한다. 이 태스크에서 고치지 않는다.

주의: 이 명령이 엔진 jar 를 다시 만든다. 메인 체크아웃에서 mdm bootRun 이 떠 있어도 워크트리의 빌드 폴더는 따로라 영향이 없다.

- [ ] **Step 8: m-mdm 전체 테스트·타입 검사**

Run:

```bash
pnpm --filter @dk-oasis/m-mdm test; echo "vitest exit $?"
pnpm --filter @dk-oasis/m-mdm lint; echo "lint exit $?"
```

Expected: 합계 줄 `failed 0`, `vitest exit 0`, `lint exit 0`. 워크트리에서 shared 를 아직 빌드하지 않았다면 먼저 `pnpm --filter @dk-oasis/shared build` 를 한 번 돌린다(이 워크트리에는 떠 있는 서버가 없어 안전하다).

- [ ] **Step 9: 생성 계약이 스키마와 같은지**

Run: `pnpm --filter @dk-oasis/m-mdm gen:contract && git status --short src/frontend/m-mdm/src/contract/`
Expected: 출력 없음(다시 생성해도 바뀌지 않는다). 바뀌면 Task 1·5·7 중 스키마를 고친 태스크가 생성물 커밋을 빠뜨린 것이다.

- [ ] **Step 10: UI audit(바꾼 화면 파일만)**

Run:

```bash
D=.claude/skills/mantine-aggrid-ui/scripts
F=$(git diff --name-only 8a0dd594 -- 'src/frontend/m-mdm/pages/**/*.ts' 'src/frontend/m-mdm/pages/**/*.tsx' | tr '\n' ' ')
echo "$F"
python3 $D/mantine_docs.py audit $F
python3 $D/aggrid_docs.py audit $F
```

Expected: 바뀐 파일 목록이 `ruleSetEdit/` 아래 파일뿐이고 두 audit 모두 0건.

- [ ] **Step 11: OASIS 계약 검사**

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`
Expected: `ERROR 0`. WARN 이 있으면 기준선에서 같은 WARN 이 있었는지 확인한다: `git stash` 는 쓰지 말고, 출력의 파일 경로가 이 브랜치에서 바뀐 파일(`git diff --name-only 8a0dd594`)인지로 가른다. 바뀐 파일의 WARN 은 보고에 적는다.

- [ ] **Step 12: 엔진 계약 문서와 스키마·생성물 대조(수동)**

`docs/mdm/engine-contract.md` 는 스키마와 자동 대조 테스트가 없으므로 새 이름이 네 벌에 모두 있는지 스크립트로 본다.

Run:

```bash
python3 - <<'EOF'
import json, re
schema = json.load(open('src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json'))
defs = schema['$defs']
md = open('docs/mdm/engine-contract.md', encoding='utf-8').read()
ts = open('src/frontend/m-mdm/src/contract/engine-contract.generated.ts', encoding='utf-8').read()
names = ['RuleSetFlow', 'FlowNode', 'FlowEdge', 'FlowNodeKind', 'PathStep', 'RunTrace', 'NodeTrace', 'BranchTrace', 'NodeStatus', 'BranchOutcome']
codes = {'ViolationStage': ['BRANCH_SELECT'], 'ErrorCode': ['BRANCH_EVAL_ERROR', 'FLOW_INVALID'], 'EngineWarningCode': ['BRANCH_COND_NULL']}
bad = []
for n in names:
    if n not in defs: bad.append(f'스키마 $defs 에 없음: {n}')
    if n not in md: bad.append(f'engine-contract.md 에 없음: {n}')
    if not re.search(r'export (interface|type) ' + n + r'\b', ts): bad.append(f'generated.ts 에 없음: {n}')
for d, vals in codes.items():
    for v in vals:
        if v not in defs[d].get('enum', []): bad.append(f'스키마 {d} enum 에 없음: {v}')
        if v not in md: bad.append(f'engine-contract.md 에 없음: {v}')
        if f'"{v}"' not in ts: bad.append(f'generated.ts 에 없음: {v}')
rs = defs['RuleSetResult']['properties']
for p in ['path', 'warnings']:
    if p not in rs: bad.append(f'RuleSetResult 속성 없음: {p}')
print('\n'.join(bad) if bad else '대조 통과')
EOF
grep -n '정본 아님' docs/mdm/engine-contract/README.md
```

Expected: `대조 통과`, 그리고 초안 폴더 README 에 "정본 아님" 줄이 하나 이상 있다(Task 1 이 넣는다). `docs/mdm/engine-contract/README.md` 가 없으면 Task 1 이 표시를 넣은 파일 경로를 확인해 그 파일로 grep 한다.

- [ ] **Step 13: 커밋 범위 확인**

Run: `git log --oneline 8a0dd594..HEAD && git diff --stat 8a0dd594..HEAD | tail -n 3 && git status --short | head -n 20`
Expected: 이 계획의 태스크 커밋만 있고, 커밋되지 않은 이 작업 파일이 없다. 작업 트리에 남은 수정이 이 작업 파일이면 담당 태스크 이름과 함께 보고한다.

- [ ] **Step 14: 결과 보고**

보고에 아래를 적는다: 각 명령의 exit 코드와 테스트 합계(엔진·mdm·m-mdm), oasis-contract-check 의 ERROR·WARN 수, 계약 대조 결과, 실행하지 않은 검증(브라우저 e2e `src/frontend/e2e/mdm-ruleSetEdit.spec.ts` 는 로컬 서버가 필요해 이 계획에서 돌리지 않았다는 사실), 그리고 편차 D1~D12 이 decisions.md D-106 에 있다는 확인.
