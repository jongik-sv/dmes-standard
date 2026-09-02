# Properties

서비스간 실행되는 요소는 프로퍼티로 세부 동작을 결정한다. 이 페이지는 현재 코드 기준으로 실제 사용되는 프로퍼티만 정리한 레퍼런스이다.

# 공통 입력/출력

## `input`

요소의 입력값으로 사용할 데이터를 지정한다. 컨텍스트 키 또는 PropertyEL을 사용한다.

- 사용처: DefaultTask, ExclusiveGateway, SubProcess, PlainJavaServiceTask, SqlScriptTask, CallActivityTask, ErrorBoundaryEvent, Message Send Task

## `output`

요소의 출력을 프로세스 컨텍스트에 저장할 키를 지정한다.

- 사용처: DefaultTask, SubProcess, ParallelGateway, PlainJavaServiceTask, SqlScriptTask, CallActivityTask, ErrorBoundaryEvent, Message Send Task

## `log`

요소의 실행 결과를 로그로 남긴다. 값은 SpEL로 해석되며 루트 객체는 해당 요소의 실행 결과이다.

- 사용처: 실행 가능한 요소 전반

예시:

```xml
<camunda:property name="log" value="#root" />
```

결과가 리스트/맵이면 다음처럼 접근할 수 있다.

```xml
<camunda:property name="log" value="[0][id] + ' id selected'" />
```

# 트랜잭션 / 데이터소스

## `ds`

SQL Script Task가 사용할 데이터소스를 지정한다.

- 사용처: SqlScriptTask

## `tx`

트랜잭션 매니저 이름을 지정한다.

- 사용처: Process, SqlScriptTask, transaction Script Task

## `commitTx`

서비스가 예외로 종료되어도 커밋할 트랜잭션 매니저를 지정한다.

- 사용처: Process

# Java / 서비스 실행

## `method`

실행할 메소드 이름을 지정한다.

- 사용처: PlainJavaServiceTask

## `dto`

컨텍스트를 특정 DTO 클래스로 변환해 실행에 사용한다.

- 사용처: Process, SubProcessTask, JavaServiceTask, SubServiceCallTask

## `inputOnly`

`input` 에 지정한 값만 실행 입력으로 사용할지 여부를 지정한다. 값은 `true` 또는 `false` 이다.

- 사용처: PlainJavaServiceTask, NamedObjectJavaServiceTask, Message Send Task

## `new`

새 인스턴스 또는 새 서비스 컨텍스트를 만들어 실행할지 여부를 지정한다. 값은 `true` 또는 `false` 이다.

- 사용처: PlainJavaServiceTask, SubServiceCallTask

## `object`

태스크 반환값을 다음 Java 태스크에서 오브젝트로 취급할지 여부를 지정한다.

- 사용처: PlainJavaServiceTask

## `opt`

파라미터 바인딩 시 일부 값을 선택적으로 무시할 수 있게 한다.

- 사용처: PlainJavaServiceTask

## `pri`

요소의 우선순위를 지정한다. 숫자가 작을수록 먼저 처리된다.

- 사용처: Process 내부 요소 정렬 시 사용

# 반복 / 병렬 실행

## `iter`

반복 실행에 사용할 컬렉션과 요소 이름을 지정한다. PropertyEL 형식으로 입력한다.

- 예: `users->user`
- 사용처: 반복 마커가 있는 Task 와 SubProcess

## `thread`

병렬 수행 시 사용할 최대 스레드 수를 지정한다.

- 사용처: Parallel Multi Instance Task/SubProcess

## `timeout`

병렬 수행 시 스레드 최대 대기 시간을 초 단위로 지정한다.

- 사용처: Parallel Multi Instance Task/SubProcess

# 서브 프로세스 / 서브 서비스

## `processId`

호출할 서브프로세스 ID를 지정한다.

- 사용처: OfflineSubProcessCallTask

## `adapter`

서비스 컨텍스트를 변환할 어댑터 클래스를 지정한다.

- 사용처: Process

# 메시징

## `messageObject`

메시지로 만들 오브젝트를 지정한다.

- 사용처: Message Send Task

## `msgObj`

`messageObject` 의 약식 프로퍼티이다.

- 사용처: Message Send Task

예시:

```xml
<camunda:property name="messageObject" value="msg" />
```

PropertyEL 도 사용할 수 있다.

```xml
<camunda:property name="messageObject" value="msgs[0]" />
```

# 자주 쓰는 조합

## Java 태스크

```xml
<camunda:property name="method" value="run" />
<camunda:property name="input" value="orderId" />
<camunda:property name="output" value="result" />
```

## SQL Script Task

```xml
<camunda:property name="ds" value="dataSource1" />
<camunda:property name="output" value="rows" />
<camunda:property name="log" value="[0][id] + ' id selected'" />
```

## Message Send Task

```xml
<camunda:property name="messageObject" value="msg" />
```

## transaction Script Task

```xml
<camunda:property name="tx" value="tm1" />
```

# 참고 코드

- 프로퍼티 상수: `oasis.model.PropertyNames`
- Java 태스크 해석: `PlainJavaServiceTaskExecutable`
- 메시지 태스크 해석: `ExternalSendTaskExecutable`
- 반복/병렬 해석: `LoopMultiInstanceInternalElementExecutor`, `SequentialMultiInstanceInternalElementExecutor`, `ParallelMultiInstanceInternalElementExecutor`
- 로그 해석: `CoreElementExecutor`