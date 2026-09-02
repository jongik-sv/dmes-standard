# Transaction

이 페이지는 모델러 스크린샷 대신 실제 BPMN 설정값과 테스트 코드를 기준으로 정리한 버전이다.

# 기본 개념

- 트랜잭션 진입점은 `oasis.transaction.TransactionHandler` 이다.
- 기본 구현체는 `SpringTransactionHandler` 이다.
- 현재 저장소 기준 `SpringTransactionHandler` 는 `READ_COMMITTED` 격리 수준을 사용한다.
- `ApplicationContext` 에 `PlatformTransactionManager` 인스턴스가 이름으로 등록되어 있어야 한다.

# 서비스 시작 시 기본 트랜잭션 열기

서비스가 시작될 때 기본 트랜잭션 목록을 함께 열고 싶다면 `SpringServiceStarterFactory` 에 트랜잭션 매니저 이름 배열을 넘긴다.

```java
ServiceStarter serviceStarter =
        new SpringServiceStarterFactory(applicationContext, new String[]{"tm1", "tm2"})
                .generateServiceStarter();
```

이 방식이면 서비스 시작 시 `tm1`, `tm2` 가 자동으로 열린다.

# 프로세스 수준에서 사용할 트랜잭션 제한하기

프로세스에 `tx` 프로퍼티를 두면 해당 프로세스는 지정한 트랜잭션만 시작한다.

```xml
<bpmn:process id="Process_1ob4rra" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="tm2" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:process>
```

이 예시는 `usecase/multiSource/startSpecificDatasourceFromMultiSource.bpmn` 에서 확인할 수 있다.

# Script Task 로 commit / rollback 하기

중간에 강제로 트랜잭션을 끊고 다시 시작해야 할 때는 `scriptFormat="transaction"` 인 Script Task를 사용한다.

Commit 예시:

```xml
<bpmn:scriptTask id="Activity_txCommit" name="txCommit" scriptFormat="transaction">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="tm1" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>commit</bpmn:script>
</bpmn:scriptTask>
```

Rollback 예시:

```xml
<bpmn:scriptTask id="Activity_txRollback" name="txRollback" scriptFormat="transaction">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="tx" value="tm1" />
    </camunda:properties>
  </bpmn:extensionElements>
  <bpmn:script>rollback</bpmn:script>
</bpmn:scriptTask>
```

실제 샘플은 `usecase/commitInProgress/commitAndRestart.bpmn` 과 `TransactionScriptTaskTest` 에 있다.

# `commitTx` 프로퍼티

서비스가 예외로 종료되더라도 특정 트랜잭션은 커밋하고 싶다면 프로세스에 `commitTx` 프로퍼티를 둔다.

- 값은 항상 커밋할 트랜잭션 매니저 이름이다.
- 일반 rollback 흐름에서 제외하고 싶은 트랜잭션이 있을 때 사용한다.

# 병렬 실행 제약

병렬 실행 구간에서는 명시적 트랜잭션 시작을 허용하지 않는다.

- 기본 트랜잭션이 이미 열린 상태에서 병렬로 읽기/쓰기 전략을 설계해야 한다.
- 병렬과 다중 트랜잭션을 함께 쓸 때는 `ParallelExecutionScope` 제약을 고려해야 한다.

# 검증에 쓰는 대표 테스트

- `oasis.transaction.SpringTransactionHandlerTest`
- `usecase.commitInProgress.TransactionScriptTaskTest`
- `usecase.transactionalSubService.TransactionalSubServiceTest`
- `usecase.multiDataSource.MultiDataSourceTest`

# 실무 팁

- 프로세스 전체 경계를 바꾸고 싶으면 프로세스의 `tx` 를 사용한다.
- 흐름 중간에서 강제 제어가 필요하면 `transaction` 스크립트 태스크를 사용한다.
- 트랜잭션 이름은 반드시 `ApplicationContext` 에 등록된 이름과 같아야 한다.
- 예외 발생 후에도 일부 자원을 보존해야 하면 `commitTx` 사용 여부를 먼저 검토한다.