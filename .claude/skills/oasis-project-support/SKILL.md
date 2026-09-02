---
name: oasis-project-support
description: "Support OASIS-based service repositories that model business flows in BPMN and implement Java tasks around them. Use when Codex needs to inspect or extend `.bpmn` flows in an OASIS user project, debug `PropertyEL`, `MethodBinding`, `JavaServiceTask`, or `ScriptTask` behavior, design or fix tests around `ServiceResult`, `path()`, and `messages()`, interpret `UserException`, Error End Event, or Error Boundary Event behavior, or add a new OASIS flow together with its paired BPMN and test strategy. Also use when a natural-language request describes an OASIS business service in BPMN terms such as start event, gateway branching, event-based routing, DB lookup/update, status change, 제조오더, 이벤트, 파라미터, 상태 변경, or 서비스 작성. **Always invoke for pattern-clone / minimal-augment work even when it looks trivial** — adding a new `.bpmn` under `services/`, copying an existing OASIS service (search/register/update/delete/approve) to a new domain (BOM/자재/라인/라우팅/작업지시 등), adding one more action or `serviceTask`/`exclusiveGateway`/`sequenceFlow`, adding a method to a `*Manager`/`*Service`/`*Handler` wired to `camunda:class`, adding/modifying paired `*OasisServiceTest`, or returning mock/virtual data through an OASIS service. This skill works alongside `bpmn-skill`: let `bpmn-skill` own schema-safe `.bpmn` file creation and structural edits through `bpmn-tool`, and use this skill when the BPMN must be checked against OASIS runtime semantics, extensions, bindings, Java task contracts, and tests."
---

# OASIS Project Support

## Workflow

1. Reproduce the issue or define the target flow.
- Find the relevant `.bpmn`, failing test, service ID, Java task class, and context objects before suggesting changes.
- Start with fast search commands such as `rg --files -g '*.bpmn'`, `rg -n "serviceId|task class|result\\(|messages\\(|path\\("`, and `rg -n "UserException|setClassToObjectMap|SpringTransactionHandler"`.

2. Pick the closest OASIS core analogue.
- Open `references/pattern-map.md` and choose the nearest sample family before reasoning from scratch.
- Prefer matching by behavior, not by element name alone: branching, parallelism, sub-process passing, SQL script execution, messaging, transaction, or multi-datasource.

3. Load the narrowest reference file that matches the question. 모든 reference 는 **Overview / Playbook / Catalog / Upstream** 네 묶음 중 하나에 속한다. 먼저 “지금 필요한 것이 어느 묶음인지” 를 정한 뒤 그 안에서 파일을 고른다.

   **Overview** — 전체 구조나 다른 스킬과의 관계를 잡을 때
   - Runtime structure or “which layer owns this?”: `references/core-overview.md`
   - `bpmn-skill` 과의 역할 분리, handoff, 수정 계약: `references/bpmn-skill-integration.md`
   - 패턴 가족 인덱스, “가장 가까운 샘플” 고르기: `references/pattern-map.md`

   **Playbook** — 특정 문제를 어떻게 풀지가 핵심일 때
   - `PropertyEL`, `method`, constructor, input binding, or task resolution issues: `references/binding-playbook.md`
   - Test design or regression strategy: `references/testing-playbook.md`
   - `ServiceResult` API (path / result / messages / exception / serviceResultCode) 와 assertion 패턴: `references/service-result-playbook.md`
   - exclusive gateway, flow `name` 매칭, `#root` boolean 분기, default flow: `references/branching-playbook.md`
   - `UserException`, Error End Event, Error Boundary Event, or rollback behavior: `references/exception-playbook.md`
   - 조회 결과가 리스트일 때 다음 태스크로 넘기기, 루프 입력/출력, `iter`, `multiInstance`: `references/list-loop-guide.md`
   - 트랜잭션 매니저 선택, DML 접두사, multi-instance 의 visibility, `tx` / `ds` 사용: `references/transaction-playbook.md`
   - subProcess(inline) / callActivity(offline) / sub-service 호출의 차이, 컨텍스트/트랜잭션 전파: `references/subservice-playbook.md`
   - 변수 lookup 순서, ServiceContext / ProcessContext, sub-process 격리: `references/context-playbook.md`
   - 감사 컬럼 동작, `setAudit(AuditHolder.getAudit())`, 누락 시 증상: `references/auditing-playbook.md`
   - `TypedObject` 사용, `getObject(Class)` / `TypeReference`, `MapBuilder` / `TypedMapBuilder`: `references/typed-object-playbook.md`
   - 도메인 상태 천이(state actor / state router) 모델링 패턴, 메서드 명명: `references/state-transition-playbook.md`
   - Send Task / messaging (운영 사용 거의 없음): `references/messaging-playbook.md`
   - Parallel Gateway (운영 사용 0건, 대체 패턴): `references/parallel-playbook.md`

   **Catalog** — 실제 Java/BPMN/매퍼 코드 조각을 바로 보고 싶을 때
   - OASIS 참고 구현에서 뽑은 inline 예제: `references/source-bpmn-examples.md`
   - 운영 환경에서 추출한 패턴별 실 사용 사례 (코드는 `references/examples/` 에 임베드): `references/real-project-patterns.md`

   **Upstream** — OASIS 공식 레퍼런스 전체. 권위 있는 정의가 필요할 때 사용.
   - `references/upstream/` 아래에 OASIS 공식 레퍼런스 트리(70 개 .md, 원본 디렉토리 구조 유지)가 그대로 들어 있다. 다른 묶음(Playbook/Catalog/Overview)은 “이 프로젝트에서 어떻게 적용했는가” 를 다룬다면, 이 묶음은 “OASIS 가 무엇을 약속하는가” 를 다룬다.
   - 빠른 진입점:
     - `camunda:property` 매트릭스 (`scriptFormat`, `tx`, `ds`, `iter`, `multiInstance`, `class`, `method`, `input/output`, `log`, ...): `references/upstream/Properties.md`
     - PropertyEL 문법 (`names[0] -> name`, single/multiple, value/reference, `$type{...}`): `references/upstream/PropertyEL.md`
     - SpEL 문법 (`#root`, `[index]`, `['key']`, gateway condition, `log` 표현식): `references/upstream/SpEL.md`
     - MethodBinding, Service Result, Transaction, Exception, Branching, Looping, Sub-Process, Parallel, Messaging, Context, Architecture, Overview, BPMN, Testing, Tutorials, TASK 사용법: 같은 폴더의 동명 `.md` 또는 동명 디렉토리.
   - 사용 규칙: 정확한 정의/문법/매트릭스가 필요하면 먼저 `Properties.md` / `PropertyEL.md` / `SpEL.md` 를 본다. 운영 적용 사례가 필요하면 `references/real-project-patterns.md` 를 본다. 둘 다 필요하면 두 묶음을 함께 인용한다.

4. Explain the current flow in evidence-first order.
- Cite the local project files first.
- Then cite the closest OASIS execution pattern from `references/pattern-map.md`.
- 사용자 프로젝트가 BPMN-driven 비즈니스 ERP 형태라면, 같은 카테고리의 `references/real-project-patterns.md` 절을 함께 인용해 실 적용 예를 보여 준다.
- Only after that propose the minimal code, BPMN, or test change.

5. Keep the local references authoritative.
- Use the files in `references/` as the first source of truth for OASIS-specific reasoning.
- Bring in additional context only when the local project files and references are still insufficient.

## Prompt Translation

- If the user describes business logic in domain language but also references BPMN concepts such as 시작 이벤트, 게이트웨이, 이벤트 분기, 상태 변경, or 서비스 작성, treat it as an implementation request for an OASIS service rather than as a vague analysis request.
- Translate the prompt into five artifacts before proposing code:
  - input contract
  - BPMN control flow
  - OASIS-specific properties
  - Java task or persistence contract
  - paired test scenarios

### Prompt Decomposition Checklist

1. Extract the inputs.
- Example: 제조오더번호, 이벤트, 파라미터

2. Identify the routing key.
- If the prompt says “이벤트별 분기”, route first on `event` with an exclusive gateway.

3. Identify additional guards inside the selected branch.
- If the prompt says “파라미터가 확정이면 변경”, treat that as a branch-local condition or precondition.
- Do not silently invent extra status changes for the non-matching case.

4. Identify the persistence action.
- Query by the business key first.
- Then update the target field explicitly.

5. Identify the unspecified fallback behavior.
- If the prompt defines only one concrete event behavior, create:
  - one explicit business branch for the described event
  - one default unsupported-event branch
- If the prompt defines a conditional update but no else behavior, prefer an explicit no-op or user-error path over inventing another mutation.

### Output Contract For Natural-Language Service Requests

- `bpmn-skill` should receive the structural BPMN ask:
  - start event
  - exclusive gateway by event
  - task sequence per event branch
  - default branch
- `oasis-project-support` should then define:
  - gateway input/output properties
  - task `class`, `method`, `input`, `output`, `tx` rules
  - result alias and error behavior
  - DB update semantics
  - tests that prove the mutation or no-op behavior

## Working With `bpmn-skill`

- Treat `bpmn-skill` as the BPMN file mutation partner.
  - It owns schema-safe `.bpmn` creation, parsing, modification, preview, and validation through `bpmn-tool`.
  - It should be the default tool when the BPMN XML itself must change.
- Treat `oasis-project-support` as the OASIS runtime partner.
  - Use this skill for OASIS-specific extensions, task execution semantics, binding rules, result assertions, Java task contracts, and transaction or message side effects.

### Use `bpmn-skill` first when

- the request is mostly about how to model or edit a workflow in BPMN
- the user needs `.bpmn` files to be created, modified, previewed, or validated
- the user is choosing between BPMN elements or refining diagram structure
- the goal is to make the process visually or semantically cleaner before OASIS runtime details are filled in
- a structural BPMN change is needed and direct XML editing would be risky

### Switch to `oasis-project-support` when

- the BPMN contains or needs OASIS-specific properties such as `input`, `output`, `class`, `method`, `tx`, or send-task bindings
- the flow shape is decided, but it is unclear whether OASIS will execute it as intended
- the user asks why a BPMN works in theory but fails in an OASIS project
- a BPMN change also needs Java task adjustments or paired tests
- the BPMN is structurally valid but the service contract, task binding, result alias, or runtime side effects are unclear

### Handoff From `bpmn-skill` To `oasis-project-support`

- Start with the BPMN draft or modified file from `bpmn-skill`.
- Assume `bpmn-skill` has already handled safe file mutation and basic BPMN validation.
- Then validate the draft against OASIS concerns in this order:
  - service ID and executable entrypoint
  - task properties and alias names
  - `PropertyEL` and `MethodBinding` expectations
  - nearest OASIS sample from `references/pattern-map.md`
  - paired test strategy using `references/testing-playbook.md`
- The expected output from this skill is not just “the BPMN looks right”.
  - produce the OASIS-specific property corrections, Java task implications, and the test assertions needed to prove the flow.
  - if the BPMN structure must change again, send a concrete structural diff back to `bpmn-skill` instead of editing XML manually.

### Handoff From `oasis-project-support` To `bpmn-skill`

- If the runtime rule is already clear but the BPMN still needs to be created, redrawn, simplified, or made more idiomatic, hand the structural work back to `bpmn-skill`.
- Hand back a concrete contract instead of a vague request.
  - specify the BPMN elements to add or replace
  - specify the OASIS properties that must remain attached to those elements
  - specify any path or boundary-event behavior that the remodel must preserve
  - specify whether `bpmn-tool create`, `modify`, `parse`, `preview`, or `validate` is the appropriate operation

### Combined Output Pattern

- For new flows:
  - `bpmn-skill` creates the BPMN skeleton and performs safe file-level edits
  - `oasis-project-support` defines OASIS properties, validates execution semantics, and defines the paired test
- For broken flows:
  - `oasis-project-support` diagnoses the runtime or binding failure first
  - `bpmn-skill` is used if the fix requires structural BPMN edits in the `.bpmn` file
- For reviews:
  - `bpmn-skill` checks BPMN file integrity, structure, and safe mutation concerns
  - `oasis-project-support` checks whether the same model is executable and testable in an OASIS project

### Non-Negotiable Rule

- Do not hand-edit BPMN XML for structural changes inside an OASIS project workflow.
  - route those edits through `bpmn-skill`
  - then return to this skill for OASIS semantics and tests

## Default Heuristics

- Treat OASIS issues as one of four buckets first: model parse/unmarshal, task binding, runtime path/result behavior, or transaction/message side effects.
- When testing is missing, suggest the smallest reproducible BPMN-driven test instead of explaining abstractly.
- Prefer `BpmnServiceLoaderForTest` + `DefaultServiceContext` as the first testing pattern unless the case clearly needs a multi-service provider or real transaction manager.
- When validating behavior, assert the outcome that best matches the feature:
  - `path()` for routing, branching, parallel, and error-boundary expectations
  - `result(key)` or `results()` for output mapping and DTO conversion
  - `messages()` for send-task and topic binding behavior
  - `serviceResultCode()` and `exception()` for user/system error boundaries

## Anti-Skip Heuristic

OASIS 관련 작업이 "단순 패턴 복사" 처럼 보일수록 본 스킬을 더 확실히 호출한다. **"기존 패턴을 흉내냈으니 스킬 없이 충분하다" 는 가장 흔한 오판이다.** 다음 신호 중 하나라도 있으면 작업 시작 전에 본 스킬을 무조건 진입한다 (스킵 금지).

- 새 `.bpmn` 파일을 `services/` 또는 그 하위 디렉토리에 추가
- 기존 `.bpmn` 에 `serviceTask`, `exclusiveGateway`, `sequenceFlow`, action 분기, end event 중 하나라도 한 줄 이상 추가/수정
- BPMN `camunda:class="..."` 가 가리키는 Java task class (`*Manager`, `*Service`, `*Handler` 등) 에 신규 메서드/생성자/필드 추가
- 기존 OASIS 서비스 (search / register / update / delete / approve 등) 를 흉내내거나 통째로 복제
- `output` / `input` / `tx` / `ds` / `iter` / `multiInstance` 등 PropertyEL alias 또는 `camunda:property` 의 신규 정의·변경
- OASIS BPMN 과 짝을 이루는 테스트 (`BpmnServiceLoaderForTest`, `OasisServiceExecutor`, `ServiceResult` assertion) 의 신규/수정
- 자연어 도메인 키워드: 오더, 제품, 자재, 라우팅, 작업지시, 라인, 조업, 등록/조회/수정/삭제 액션, 서비스 추가/만들기, 목 데이터 반환 서비스, BPMN 액션 추가

"복붙처럼 보이는" 작업에도 OASIS 함정은 그대로 살아 있다 — output alias 충돌, file-name vs process-id 매칭, gateway condition expression form, MethodBinding 모호성, ServiceResult assertion 누락, transaction propagation 등. 최소한 다음 세 reference 는 항상 1 차 점검한다: `references/binding-playbook.md`, `references/testing-playbook.md`, `references/pattern-map.md`.

스킬을 호출하지 않은 채 BPMN/Java task/OASIS test 를 한 줄이라도 작성했다면, 그 자체가 회귀 신호다. 즉시 중단하고 본 스킬 워크플로우 §1 부터 다시 시작한다.

## Response Shape

- For debugging requests:
  - summarize the failure mechanism
  - map it to the nearest OASIS sample
  - give a concrete reproduction or assertion plan
  - then suggest the fix
- For new-flow requests:
  - identify the closest sample family from `pattern-map.md`
  - outline the BPMN skeleton
  - outline the paired test structure
  - mention which assertions should prove the behavior

## Reference Files

네 묶음으로 분류한다. Workflow §3 에서 묶음을 먼저 고른 뒤 파일을 선택한다.

**Overview** — 구조와 다른 스킬과의 관계
- `references/core-overview.md`: OASIS runtime layers and execution lens
- `references/bpmn-skill-integration.md`: `bpmn-skill` 과의 역할 분리와 handoff 계약
- `references/pattern-map.md`: local OASIS sample map by behavior family

**Playbook** — 문제 해결 가이드
- `references/binding-playbook.md`: `PropertyEL` and `MethodBinding` rules with failure checklist
- `references/testing-playbook.md`: BPMN-first test patterns and assertion strategy
- `references/service-result-playbook.md`: `ServiceResult` API matrix (path/result/messages/exception/serviceResultCode) + assertion 패턴
- `references/branching-playbook.md`: exclusive gateway 분기, flow `name` 매칭, `#root` boolean 분기, default flow
- `references/exception-playbook.md`: `UserException`, Error End Event, Error Boundary Event, and rollback cues
- `references/list-loop-guide.md`: 리스트 결과 소비, 루프 입력/출력, `iter`, `multiInstance` 가이드
- `references/transaction-playbook.md`: 트랜잭션 매니저 선택, DML 접두사, multi-instance 안의 visibility, `tx`/`ds` 디버깅
- `references/subservice-playbook.md`: subProcess(inline) / callActivity(offline) / sub-service 호출 비교, 컨텍스트/트랜잭션 전파
- `references/context-playbook.md`: ServiceContext / ProcessContext / element scope, 변수 lookup 순서, sub-process 격리
- `references/auditing-playbook.md`: 감사 컬럼 자동 바인딩, `setAudit(AuditHolder.getAudit())`, 누락 시 증상
- `references/typed-object-playbook.md`: `TypedObject` 래퍼, `getObject(Class)` / `TypeReference`, MapBuilder
- `references/state-transition-playbook.md`: state actor / state router 모델링 패턴, 도메인 메서드 명명 컨벤션
- `references/messaging-playbook.md`: Send Task / topic / messages() — 운영에서는 거의 안 씀
- `references/parallel-playbook.md`: Parallel Gateway / parallel multi-instance — 운영 0건, 대체 패턴

**Catalog** — 실제 코드 조각
- `references/source-bpmn-examples.md`: OASIS 참고 구현에서 뽑은 inline Java source / BPMN XML 예제
- `references/real-project-patterns.md`: 운영 환경에서 추출한 패턴별 실 사용 사례 — pattern-map 카테고리별 실제 BPMN/Java/MyBatis 스니펫. 임베드된 예제 파일은 `references/examples/` 에 위치.

**Upstream** — OASIS 공식 레퍼런스 트리 전체 (`references/upstream/` 70 개 .md, 원본 디렉토리 구조 유지)
- 권위 있는 정의/문법/매트릭스가 필요할 때 진입한다. 빠른 진입점:
  - `references/upstream/Properties.md`: `camunda:property` 종류와 사용처 매트릭스 (scriptFormat, tx, ds, iter, multiInstance, class, method, input/output, log)
  - `references/upstream/PropertyEL.md`: PropertyEL 문법 (`names[0] -> name`, single/multiple, value/reference, `$type{...}`)
  - `references/upstream/SpEL.md`: SpEL 문법 (gateway condition / `log` / `[idx]` / `['key']` 등)
  - `references/upstream/MethodBinding.md`, `Service Result.md`, `Transaction.md`, `Exception.md`, `Branching.md`, `Looping.md`, `Sub-Process.md`, `Parallel.md`, `Messaging.md`, `Context.md`, `Architecture.md`, `Overview.md`, `BPMN™️.md`, `Testing.md`, `Tutorials.md`, `TASK 사용법.md`: 동명 카테고리. 동명 디렉토리에 상세 하위 페이지 존재.
- Playbook/Catalog 와의 우선순위: “OASIS 가 무엇을 약속하는가” → Upstream, “우리 프로젝트는 그 약속을 어떻게 쓰는가” → Playbook/Catalog. 둘이 충돌하면 Upstream 이 정답에 가깝다.

## Trigger Examples

- “이 BPMN이 왜 실패하는지 OASIS 관점에서 봐줘”
- “PropertyEL `names[0] -> name` 이 안 먹는 이유 찾아줘”
- “MethodBinding에서 어떤 생성자가 선택되는지 설명해줘”
- “병렬 처리 플로우 테스트를 어디서 참고해야 해?”
- “새 OASIS 서비스 플로우를 추가하려는데 BPMN과 테스트를 어떻게 같이 시작하면 돼?”
- “`bpmn-skill` 로 만든 BPMN 초안을 OASIS 실행 기준으로 검토해줘”
- “이 흐름은 `bpmn-skill` 로 구조를 잡았고, 이제 OASIS 속성과 테스트를 붙여야 해”
- “이 `.bpmn` 파일은 `bpmn-skill` 로 수정하고, OASIS 실행 의미는 네가 검토해줘”
- “제조오더상태를 변경하는 서비스를 작성한다. 제조오더번호와 이벤트와 파라미터를 받아서 적절한 상태로 변경하는 서비스를 작성한다. 시작이벤트에서 게이트웨이를 통과하고 이 게이트웨이에서 이벤트별 분기를 한다. 이벤트의 파라미터가 확정이면 제조오더번호로 제조오더 디비를 조회해서 제조오더 디비 상태를 변경한다. 상태값은 status 필드에 A로 변경한다.”
- “조회 결과가 리스트인데 다음 태스크에서 첫 번째 것만 쓰려면 어떻게 해야 해?”
- “리스트를 루프 돌릴 때 `iter` 랑 `multiInstance` 중 뭘 써야 해?”
- “루프 태스크의 output 이 리스트인지 단일값인지 헷갈려”
- “실제 운영 BPMN 에서 비슷한 사례 있어?”
- “이 흐름을 운영 BPMN 스타일로 다시 짜 줘”

### Pattern-Clone / Minimal-Augment (스킵 위험 높음 — 본 스킬을 반드시 호출)

다음 류의 발화는 “기존 패턴 흉내” 라는 이유로 가장 자주 스킬이 누락되는 케이스다. 짧고 평이해 보여도 OASIS 관점 검증이 필요하므로 워크플로우 §1 부터 정상 진입한다.

- “지금 오더 조회가 있는데 그거 말고 제품 조회 목 데이터 반환하는 거 하나만 더 만들어 줘”
- “order 서비스 그대로 복사해서 product 서비스로 만들어”
- “기존 search 액션 패턴 그대로 searchByCode 액션 하나만 추가”
- “이 `.bpmn` 에 register 액션 하나만 더 달아 줘”
- “`OrderManager` 에 `createOrder` 메서드만 추가하고 BPMN 에 분기 하나 더 달아 줘”
- “목 데이터 반환하는 신규 OASIS 조회 서비스 하나만 추가”
- “신규 도메인 (자재 / 라인 / 작업지시 / 라우팅) BPMN + Java task + 테스트 한 세트 추가”
- “기존 BPMN 에 ServiceTask 하나만 끼워 넣어 줘”
- “이 OASIS 서비스에 update 액션만 추가”
- “`*Manager` 클래스에 메서드 하나 추가하고 그 메서드를 BPMN 에서 호출하도록 묶어 줘”
