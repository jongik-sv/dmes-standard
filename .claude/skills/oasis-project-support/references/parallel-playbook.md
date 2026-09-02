# Parallel Playbook

이 문서는 BPMN Parallel Gateway 와 parallel multi-instance 에 대한 가이드다. 권위 있는 정의는 `references/upstream/Parallel.md` 와 `references/upstream/BPMN™️/Sequential vs Parallel Multi instance.md`.

## 운영 사용도 — 0건

운영 BPMN ~158 개 중 Parallel Gateway 사용 0 건. 모든 반복은 `isSequential="true"` 인 multi-instance 로 처리. 이 playbook 은 “정말 동시 실행이 필요해진 시점에만” 진입하는 가이드 + “왜 보통 안 쓰는가” 의 정리.

## 왜 운영에서 안 쓰는가

1. **트랜잭션 일관성 문제** — 같은 트랜잭션에 두 스레드가 동시 쓰기를 하면 entity manager 충돌, optimistic lock 충돌, JPA flush 타이밍이 꼬임.
2. **변수 가시성 문제** — multi-instance 의 element 변수와 부모 컨텍스트 사이의 동기화가 sequential 보다 약함.
3. **디버깅 비용** — `result.path()` 가 nondeterministic 순서가 되면 assertion 어려움.
4. **실 비즈니스 요구가 적음** — 대부분의 ERP 비즈니스 로직은 “순서 있는 단계의 반복” 이라 sequential 로 충분.

대안: Sequential multi-instance + DB 또는 message broker 로 실 동시성 분산.

## Parallel Gateway 의 핵심 형태

```xml
<bpmn:parallelGateway id="fork" />
<bpmn:parallelGateway id="join" />
<bpmn:sequenceFlow sourceRef="fork" targetRef="branchA" />
<bpmn:sequenceFlow sourceRef="fork" targetRef="branchB" />
<bpmn:sequenceFlow sourceRef="branchA" targetRef="join" />
<bpmn:sequenceFlow sourceRef="branchB" targetRef="join" />
```

- fork 시점에 모든 outgoing 분기가 동시에 시작.
- join 시점에 모든 incoming 이 도착할 때까지 대기 후 진행.

## Parallel Multi-Instance

```xml
<bpmn:multiInstanceLoopCharacteristics
    isSequential="false"
    camunda:collection="orderIds"
    camunda:elementVariable="orderId" />
```

- `isSequential="false"` 로 병렬화. OASIS 내부 풀이 어떻게 실행하는지는 구현 의존이지만, 보통 thread pool.

## 정말 써야 할 시점

- **외부 IO 가 N 회 발생하고 각각이 독립적**: 예를 들어 N 개의 외부 API 를 동시에 부르고 모두 끝나야 다음 단계로 넘어갈 때.
- **순서가 의미 없고 합산만 필요**: N 개의 결과를 모아 평균/합 등을 계산.
- **트랜잭션 경계가 명확히 분리**: 각 분기가 별도 sub-service 로 자체 트랜잭션을 갖는 경우.

## 디버깅 체크리스트 (parallel 을 쓰기로 결정했다면)

1. join 의 모든 incoming 이 정말로 동시에 도달할 수 있는가? 한 분기에서 Error End Event 로 빠져나가면 join 이 영원히 대기할 수 있음.
2. 각 분기가 같은 변수에 동시 쓰기를 시도하지 않는가? service context 의 alias 충돌은 nondeterministic 결과.
3. 트랜잭션 매니저가 분기 내에서 어떻게 작동하는지 확인 — 같은 매니저면 thread-safe 여야 하고, 보통 그렇지 않다.
4. `result.path()` 의 순서를 assertion 으로 박지 않기 — 분기 순서는 비결정적.
5. timeout / 데드락 시나리오 테스트 — 한 분기가 무한 루프면 join 이 영원히 막힘.

## 자주 인용할 대표 샘플

- 권위 정의
  - `references/upstream/Parallel.md`
  - `references/upstream/BPMN™️/Sequential vs Parallel Multi instance.md`
- 운영에서 sequential 로 대체한 사례
  - `examples/services/multi_action_screen.bpmn` (multi-instance + isSequential=true)
  - `examples/services/transaction_test.bpmn` (multi-instance + JPA flush 의존성)
