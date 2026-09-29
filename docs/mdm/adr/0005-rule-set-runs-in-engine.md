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
  후속 확인: 서버 권한(RBAC)이 그 테스트 서비스 호출을 막으면 OASIS 경로 검증은 `RuleSetRunner.execute` 직접 호출 검증만
  남기고, 그 사실을 2단계 착수 때 다시 정한다.
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
