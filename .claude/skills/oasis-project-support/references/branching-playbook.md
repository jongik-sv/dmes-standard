# Branching Playbook

이 문서는 OASIS BPMN 의 분기 처리 (exclusive / inclusive / 조건부 sequenceFlow) 와 운영에서 자주 보는 디버깅 포인트를 정리한 가이드다. 권위 있는 정의는 `references/upstream/Branching.md`, `references/upstream/TASK 사용법/Gateway.md`, `references/upstream/Properties.md` 의 `input` 절을 참고. 운영 적용 사례는 `real-project-patterns.md` 2 / 3 번 절과 `examples/services/state_router_subprocess.bpmn`, `multi_action_screen.bpmn`, `state_actor_validation.bpmn` 을 본다.

## OASIS 분기 모델 한 줄 요약

- **Exclusive Gateway 의 핵심 패턴은 `input` 으로 변수 한 개를 지정하고, 각 sequenceFlow 의 `name` 이 그 변수 값과 매칭되는 형태**다. 별도 `conditionExpression` 없이 flow 이름 매칭만으로 라우팅.
- 변수 비교 외 boolean 결과 분기는 `#root = false` / `#root = true` 표현식을 sequenceFlow 의 `conditionExpression` 에 건다 (Error End Event 진입에 자주 쓰임).
- Inclusive / Parallel Gateway 는 운영에서 거의 안 쓴다.

## 패턴 1 — 변수 값 ↔ flow `name` 매칭

```xml
<bpmn:exclusiveGateway id="gAction">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="action" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>
<bpmn:sequenceFlow id="fRun"        name="run"        sourceRef="gAction" targetRef="..." />
<bpmn:sequenceFlow id="fRunCancel"  name="runCancel"  sourceRef="gAction" targetRef="..." />
<bpmn:sequenceFlow id="fList"       name="list"       sourceRef="gAction" targetRef="..." />
```

- `action` 의 값이 `"run"` 이면 `fRun` 으로, `"list"` 면 `fList` 로 진행.
- 새 이벤트 추가는 outgoing flow 하나만 늘리면 끝. 운영에는 게이트웨이 한 개에 outgoing 10+ 개 붙는 경우도 정상.

## 패턴 2 — `#root` boolean 분기 (검증 → 에러 경로)

Service Task 가 boolean 을 반환하고, 그 결과로 두 갈래로 나뉘는 패턴. 검증 task 와 Error End Event 를 짝지어 쓴다.

```xml
<bpmn:serviceTask id="checkReady" camunda:class="...Item#isReady">
  <bpmn:outgoing>fOk</bpmn:outgoing>
  <bpmn:outgoing>fNotReady</bpmn:outgoing>
</bpmn:serviceTask>
<bpmn:sequenceFlow id="fNotReady" name="not ready"
                   sourceRef="checkReady" targetRef="endNotReady">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">#root = false</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

- `#root` 는 SpEL 식에서 직전 task 결과 객체. boolean 이면 `= true` / `= false` 비교.
- 하나의 task 에 두 outgoing flow 를 모두 명시 — 한 쪽에 conditionExpression 이 있고 나머지는 default 처럼 작동.

## 패턴 3 — 일반 SpEL conditionExpression

값 비교나 컬렉션 접근이 필요하면 SpEL 표현식을 쓴다.

```xml
<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
  #root['lov'][0]['value'] == '1'
</bpmn:conditionExpression>
```

문법 권위: `references/upstream/SpEL.md`.

## 디폴트 분기

- BPMN `default` 속성으로 한 sequenceFlow 를 default 로 지정 가능.
- 운영 코드는 default 를 거의 안 쓰고 매칭 실패 시 예외로 두는 편 — 새 이벤트가 추가될 때 명시적으로 flow 추가하게 강제.
- 안전이 필요하면 default 를 “unsupported event” Error End Event 로 잡는 형태가 깔끔하다 (`state_router_subprocess.bpmn` 의 `endUnsupportedPending` 참조).

## Inclusive / Parallel Gateway

- Inclusive: 운영에서 사실상 사용 안 함.
- Parallel: 운영 BPMN ~158 개 중 0 건. 병렬 합류 지점에서 트랜잭션 충돌 / 데이터 가시성 문제가 흔해 sequential multi-instance 로 대체.
- 정말로 동시 실행이 필요한 경우만 검토. `references/parallel-playbook.md` 참조.

## 디버깅 체크리스트

1. Gateway 에 `<camunda:property name="input" value="...">` 가 있는가? 빠지면 라우팅 키가 없어 항상 default / 첫 outgoing 으로 진행한다.
2. `input` 으로 지정한 변수가 service context 에 실제로 있는가? 없으면 `null` 매칭으로 모든 flow 가 unmatched.
3. flow `name` 이 클라이언트가 보낸 코드 값과 정확히 일치하는가? 대소문자 / 공백 / typo 가 흔한 원인.
4. boolean 분기인데 `#root = false` 가 빠지지 않았는가? conditionExpression 이 비면 무조건 매칭.
5. 한 task 에 outgoing 이 2 개 이상 있을 때 둘 다 conditionExpression 이 있으면 두 갈래 모두 진행될 수도 — 의도가 exclusive 라면 한 쪽은 비워둔다.
6. `result.path()` 로 어느 sequenceFlow 가 선택됐는지 확인 (path element 가 ID 로 찍힘).

## 자주 인용할 대표 샘플

- 변수 값 ↔ flow name 매칭 (action / eventName)
  - `examples/services/multi_action_screen.bpmn`
  - `examples/services/state_router_subprocess.bpmn`
  - `real-project-patterns.md` 2 번 절
- boolean 분기 + Error End Event
  - `examples/services/state_actor_validation.bpmn`
  - `real-project-patterns.md` 3 번 절
- SpEL conditionExpression
  - `references/upstream/SpEL.md`
- 권위 정의
  - `references/upstream/Branching.md`
  - `references/upstream/TASK 사용법/Gateway.md`
  - `references/upstream/Properties.md` (`input` 절)
