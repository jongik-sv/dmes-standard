# Sub-Service / Sub-Process / Call Activity Playbook

이 문서는 BPMN 흐름을 다른 흐름으로 위임하는 세 가지 수단(`subProcess`, `callActivity`, sub-service 호출) 의 차이와 OASIS 에서 가장 흔히 발생하는 디버깅 포인트를 정리한 가이드다. 권위 있는 정의는 `references/upstream/Sub-Process.md` 와 `references/upstream/미작성 카테고리/How-to Guides/Call SubProcess.md` / `Call SubService.md` 를 참고. 운영 적용 사례는 `real-project-patterns.md` 7 번 절과 `examples/services/state_router_subprocess.bpmn` / `multi_action_screen.bpmn` 을 본다.

## 세 가지 수단 한 줄 비교

- **subProcess (inline)**: 같은 BPMN 파일 안의 박스로 그려진 하위 흐름. 호출자의 컨텍스트를 그대로 공유한다.
- **callActivity (offline)**: 별도 BPMN 파일 / process ID 를 호출. `calledElement` 속성으로 대상 process 를 지정.
- **sub-service**: 다른 service 를 ServiceStarter 로 별도 호출. 트랜잭션 / 컨텍스트가 분리될 수 있다.

## subProcess (inline)

```xml
<bpmn:subProcess id="loop" name="loop">
  <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="ids" />
  ...
</bpmn:subProcess>
```

핵심 규칙:
- 호출자의 service context 를 그대로 공유한다.
- `multiInstanceLoopCharacteristics` 와 결합하면 “리스트 한 건씩 반복 처리” 패턴이 된다 (가장 흔함).
- `camunda:collection` 의 각 원소가 자식 컨텍스트의 변수로 풀린다. `elementVariable` 미지정 시 맵의 키가 그대로 자식 변수가 된다.

## callActivity (offline)

```xml
<bpmn:callActivity id="callRunCancel"
                   name="dispatch run-cancel event"
                   calledElement="state_router">
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="eventName">runCancel</camunda:inputParameter>
    </camunda:inputOutput>
  </bpmn:extensionElements>
</bpmn:callActivity>
```

```xml
<!-- callee BPMN: process 레벨 input 선언 -->
<bpmn:process id="state_router" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="itemId" />
    </camunda:properties>
  </bpmn:extensionElements>
  ...
</bpmn:process>
```

핵심 규칙:
- `calledElement` 값은 호출 가능한 process 의 ID 와 일치해야 한다 (파일명이 아니라 `<bpmn:process id="...">` 의 id).
- callee 의 process 레벨에 선언된 `input` alias 만 호출자 컨텍스트에서 자동으로 챙겨진다.
- 추가 인자는 `<camunda:inputParameter>` 로 명시 주입.
- `multiInstanceLoopCharacteristics` 를 callActivity 에 붙이면 “리스트 항목마다 같은 sub-process 를 호출” 패턴이 된다.

## subProcess vs callActivity 결정 기준

- 같은 흐름이 **이 BPMN 한 곳에서만** 쓰이고 그래프가 단순하면 → `subProcess` (inline)
- 같은 흐름이 **여러 BPMN 에서 재사용** 된다면 → `callActivity` (offline) 로 추출
- “상태 천이 액터(actor)” 같은 도메인 공용 처리 → 거의 항상 별도 BPMN + callActivity
- 단, 새 `.bpmn` 파일 추가 / 구조 편집은 `bpmn-skill` 에 위임. 이 스킬은 OASIS 속성과 흐름 의미만 책임.

## sub-service 호출

OASIS 안에서 다른 service 를 부르는 패턴은 보통 일반 Java task 가 `ServiceStarter#start(...)` 를 직접 호출하는 형태다. 자식 service 는 별도의 service result / 별도의 트랜잭션 시작점을 가질 수 있다.

핵심 규칙:
- 자식 service 가 자체 트랜잭션 매니저를 갖는지 호출자 트랜잭션을 따르는지 의도적으로 결정한다.
- 자식의 `ServiceResult` 가 정상이면 호출자 흐름 계속, 실패면 호출자에서 어떻게 다룰지 (예외 변환, 재시도, 무시) 명시.

## 트랜잭션 / 컨텍스트 전파 요약

| 수단 | 트랜잭션 | 변수 컨텍스트 |
| --- | --- | --- |
| subProcess (inline) | 그대로 공유 | 그대로 공유 (multi-instance 안에서는 원소 변수가 자식에만 보임) |
| callActivity | 그대로 공유 (별도 `tx` 미지정 시) | callee process 의 `input` 만 자동 매핑, 나머지는 명시 주입 |
| sub-service | 별도일 수 있음 (구현에 따라) | 별도 service context (호출자 변수 자동 전달 안 됨, 인자로 명시) |

## 어떤 테스트를 먼저 볼지 정하는 기준

- multi-instance loop 안의 변수 가시성 / SQL 바인딩이 핵심
  - `examples/services/mybatis_select_and_loop.bpmn` 패턴 (subProcess + collection-only)
- 같은 자식 BPMN 을 여러 분기에서 재사용
  - `multi_action_screen.bpmn` → `state_router_subprocess.bpmn` 호출 패턴
- callee 의 `input` alias 가 호출자 변수와 매칭되는지
  - `state_router_subprocess.bpmn` 의 process 레벨 `input="itemId"` + 호출자가 `itemId` 를 갖고 있는지 확인

## 디버깅 체크리스트

1. `calledElement` 가 가리키는 process ID 가 실제 존재하는가? 파일명과 process id 가 다를 수 있다.
2. callee 의 process 레벨 `input` 에 선언된 변수가 호출자 컨텍스트에 있는가? 없으면 `<camunda:inputParameter>` 로 명시 주입 필요.
3. multi-instance 안인가 밖인가? 안이라면 element 변수 이름이 callee 의 input 이름과 일치하는지 확인.
4. callee 가 던진 예외가 호출자까지 전파되어 BPMN 전체 트랜잭션을 rollback 하지는 않는가? (의도가 아니라면 boundary event 또는 별도 sub-service 분리 검토)
5. multi-instance + callActivity 조합에서 `isSequential="true"` 인지 (운영 사례 99%) 확인 — 병렬은 트랜잭션 / DB 충돌 위험.
6. callee 의 `output` alias 가 호출자 컨텍스트로 어떻게 돌아오는지 (callActivity 의 `<camunda:outputParameter>` 매핑 또는 callee 의 process 레벨 `output` 선언) 확인.

## 자주 인용할 대표 샘플

- inline subProcess + multi-instance + 자식 SQL/Java
  - `examples/services/mybatis_select_and_loop.bpmn`
  - `real-project-patterns.md` 6 번 절 (a)
- offline callActivity + multi-instance + 리터럴 input
  - `examples/services/multi_action_screen.bpmn` 의 `callRun` (collection=`orderIds`, event=`run`)
- 호출자 ↔ callee 분리: 같은 callee 를 여러 분기에서 다른 input 으로 재사용
  - `multi_action_screen.bpmn` → `state_router_subprocess.bpmn` (다양한 `eventName` 값으로 호출)
- 권위 정의 / 사용법
  - `upstream/Sub-Process.md`
  - `upstream/미작성 카테고리/How-to Guides/Call SubProcess.md`
  - `upstream/미작성 카테고리/How-to Guides/Call SubService.md`
  - `upstream/Properties.md` 의 `input`, `output` 절
