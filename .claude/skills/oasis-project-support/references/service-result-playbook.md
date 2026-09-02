# Service Result Playbook

이 문서는 OASIS `ServiceResult` 의 공개 API 와 테스트 / 디버깅 시 어느 메서드를 어떤 목적으로 쓰는지 정리한 가이드다. 권위 있는 정의는 `references/upstream/Service Result.md` 와 같은 폴더의 `서비스 결과 코드 목록/SUCCESS.md`, `USER_ERROR.md`, `SYSTEM_ERROR.md` 를 참고. 실 사용 사례는 `real-project-patterns.md` 1 번 절과 `examples/java/MyBatisSelectAndLoopTest.java`, `TransactionTest.java` 를 본다.

## ServiceResult 한 줄 요약

`ServiceStarter#start(serviceId, serviceContext)` 의 반환값. 하나의 객체로 (1) 종료 상태 코드, (2) 실행한 BPMN 요소 경로, (3) 출력된 변수, (4) Send Task 가 발행한 메시지, (5) 발생한 예외 를 모두 노출한다. 테스트 assertion 의 핵심 진입점.

## API 매트릭스

| 메서드 | 반환 | 어떤 검증에 쓰는가 |
| --- | --- | --- |
| `serviceResultCode()` | enum (SUCCESS / USER_ERROR / SYSTEM_ERROR) | 흐름이 정상 종료 / 사용자 오류 / 시스템 오류로 끝났는지 |
| `path()` | `List<PathElement>` | 어느 sequenceFlow / task / event 를 거쳤는지 (라우팅, 분기 검증) |
| `result(key)` | `TypedObject` | 특정 alias 의 출력값 한 개 |
| `results()` | `Map<String, TypedObject>` | 출력값 전체 |
| `messages()` | `List<...>` | Send Task 로 누적된 메시지 (운영에서는 거의 안 씀) |
| `exception()` | `Throwable?` | UserException 또는 시스템 예외. 정상 흐름에서는 null |

## 결과 코드 의미

- `SUCCESS` — 끝까지 도달, 예외 없음.
- `USER_ERROR` — `UserException` 또는 그 서브클래스(`BizException`)가 던져졌고, OASIS 가 사용자 오류 흐름으로 변환. `exception()` 에 메시지 보존.
- `SYSTEM_ERROR` — 그 외 예외 전파. 보통 코드 버그 / DB 연결 실패 등.

권위 정의: `references/upstream/Service Result/서비스 결과 코드 목록/*.md`.

## assertion 패턴

### 1) 정상 종료만 보장

```java
ServiceResult result = serviceStarter.start("...", serviceContext);
Assertions.assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
```

### 2) 라우팅 / 분기 검증

```java
List<PathElement> path = result.path();
assertThat(path).hasSize(31);
assertThat(path.get(0).getId()).isEqualTo("s1");
assertThat(path.get(path.size() - 1).getId()).isEqualTo("Event_endOk");
```

분기가 의도대로 됐는지는 path 의 마지막 노드 또는 중간에 특정 ID 가 포함되었는지로 본다.

### 3) 출력 alias 값 검증

```java
String hi = result.result("result").getObject(String.class);
assertThat(hi).isEqualTo("hi");

List<Map<String, Object>> rows =
        result.result("orders").getObject(new TypeReference<List<Map<String, Object>>>() {});
assertThat(rows).hasSize(3);
```

- 단일 값은 `getObject(Class)`.
- 컬렉션 / 제네릭은 `getObject(new TypeReference<...>() {})`.

### 4) 사용자 오류 메시지 검증

```java
Assertions.assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.USER_ERROR);
assertThat(result.exception()).isNotNull();
assertThat(result.exception().getMessage()).contains("Item is not in ready state");
```

또는 `PlainServiceResult` 래퍼를 쓰면 `getExceptionMessage()` 한 줄로 끝난다.

### 5) 메시지 발행 검증 (메시징을 쓸 때만)

```java
assertThat(result.messages()).hasSize(2);
```

운영 BPMN 에서는 거의 안 씀. `references/messaging-playbook.md` 참조.

## 어떤 검증을 먼저 쓸지 정하는 기준

| 의도 | 우선 보는 것 |
| --- | --- |
| 흐름이 끝까지 도달했는가 | `serviceResultCode()` |
| 분기 / 라우팅이 의도대로 됐는가 | `path()` |
| 마지막 task 의 출력값이 맞는가 | `result(key)` |
| DB / 외부 부수효과까지 검증 | `path()` + DB query / mock spy |
| 사용자 오류 흐름이 맞는가 | `serviceResultCode() == USER_ERROR` + `exception().getMessage()` |
| 시스템 오류만 잡고 싶은가 | `serviceResultCode() == SYSTEM_ERROR` + 예외 클래스 검증 |

## 디버깅 체크리스트

1. `serviceResultCode()` 가 SYSTEM_ERROR 인데 의도가 USER 인 경우 — 던지는 예외가 `UserException` 서브클래스인지 확인 (`BizException` 등).
2. `exception()` 이 null 이 아닌데 result 코드가 SUCCESS — OASIS 가 boundary event 로 잡아서 정상 흐름으로 복귀시킨 케이스. `path()` 로 boundary event 경로 확인.
3. `result(key)` 가 null — alias 가 BPMN 의 `output` 프로퍼티에 정확히 그 이름으로 설정됐는지, `[0]['col']->key` 같은 PropertyEL 매핑 결과인지 확인.
4. `path()` 가 너무 짧다 — 첫 분기에서 끝났는지, Error End Event 로 갔는지 마지막 element id 로 확인.
5. multi-instance loop 의 path 는 반복마다 element 가 누적되어 길어진다. 정확한 size 보다 “특정 task id 포함 여부” 로 assertion 하는 편이 안정적.

## 자주 인용할 대표 샘플

- 가장 단순: `serviceResultCode() == SUCCESS` 만 검증
  - `examples/java/MyBatisSelectAndLoopTest.java`
- path size + 첫/마지막 node 검증
  - `source-bpmn-examples.md` 의 parallel/branching 예제
- result alias 값 + TypeReference
  - `source-bpmn-examples.md` 의 `outputExpression` 예제
- USER_ERROR + 메시지 검증
  - `exception-playbook.md` 와 `source-bpmn-examples.md` 의 “Error End Event” 예제
- 권위 정의 / 결과 코드
  - `references/upstream/Service Result.md`
  - `references/upstream/Service Result/서비스 결과 코드 목록/{SUCCESS,USER_ERROR,SYSTEM_ERROR}.md`
