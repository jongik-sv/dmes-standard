# Transaction Playbook

이 문서는 OASIS 의 트랜잭션 동작과 운영에서 자주 마주치는 트랜잭션 관련 디버깅 포인트를 정리한 가이드다. 권위 있는 정의는 `references/upstream/Transaction.md` 와 `references/upstream/Properties.md` 의 `tx`/`ds` 절을 참고. 운영 적용 사례는 `real-project-patterns.md` 8 번 절과 `examples/services/transaction_test.bpmn` / `examples/java/TransactionTest.java` 를 본다.

## OASIS 트랜잭션 모델 한 줄 요약

- BPMN 서비스 시작 시점에 OASIS `SpringTransactionHandler` 가 트랜잭션을 열고, 서비스가 정상 종료되면 commit, 예외 전파되면 rollback 한다.
- multi-instance loop, sub-process, callActivity 안에서도 같은 트랜잭션이 유지된다 (별도 `tx` 지정이 없는 한).
- 그래서 multi-instance 안의 후속 SELECT 가 직전 반복의 JPA `flush()` 결과를 즉시 본다.

## ServiceStarter 셋업

대부분의 운영 BPMN 은 단일 트랜잭션 매니저로 시작한다.

```java
ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter(
        applicationContext, new String[]{"txBiz"}
);
```

- 두 번째 인자가 트랜잭션 매니저 이름 배열. 다중 매니저가 필요하면 `new String[]{"txBiz", "txEai"}` 처럼 추가한다.
- `setAudit(AuditHolder.getAudit())` 을 BPMN 안에서 DB 쓰기를 할 때 반드시 호출한다 — 감사 컬럼이 비면 INSERT/UPDATE 가 실패한다.

## `tx` 프로퍼티로 매니저 선택

- 기본: BPMN 시작 시 첫 매니저로 트랜잭션 시작.
- task 또는 process 레벨의 `tx` 프로퍼티 값으로 다른 매니저를 명시할 수 있다.
- 같은 BPMN 안에서 두 datasource 의 트랜잭션을 별개로 다뤄야 할 때 쓴다.
- 권위 매트릭스: `references/upstream/Properties.md` 의 `tx` 항목.

## DML 쓰기의 핵심 규칙

### Script Task

DML 은 resource 앞에 `insert,` 또는 `update,` 접두사를 붙여야 OASIS 가 SELECT 가 아닌 DML 로 인식한다.

```xml
<bpmn:scriptTask id="seedRow" scriptFormat="sql"
                 camunda:resource="insert,transaction.new" />
<bpmn:scriptTask id="updateStatus" scriptFormat="sql"
                 camunda:resource="update,transaction.markDone" />
```

접두사가 없으면 OASIS 는 결과를 List<Map> 으로 받으려다 실패하거나 의도와 다르게 동작한다.

### Java Service Task

JPA repository 호출 시 `repository.save()` + `entityManager.flush()` + 필요 시 `clear()` 를 직접 호출한다. multi-instance 안의 후속 SELECT 가 변경분을 보려면 flush 가 필요하다.

```java
public void incAge(Number maxAge) {
    EntityManager em = EntityManagerFactoryUtils.getTransactionalEntityManager(emf);
    SampleTable row = new SampleTable();
    row.setAge(maxAge.intValue() + 1);
    sampleTableRepository.save(row);
    em.flush();
    em.clear();
}
```

## 서브프로세스 / callActivity 와 트랜잭션 전파

- 별도 `tx` 지정이 없으면 호출자 트랜잭션이 그대로 전파된다.
- callActivity 안에서 발생한 예외는 호출자까지 전파되어 전체 BPMN 의 트랜잭션이 rollback 된다.
- callActivity 안에서 “부분 commit” 이 필요하면 별도 sub-service 호출 + 자체 트랜잭션 매니저로 분리해야 한다 (드문 패턴).

## 어떤 테스트를 먼저 볼지 정하는 기준

- DML 결과가 DB 에 실제로 반영되는지 확인이 핵심
  - `transaction_test.bpmn` 패턴 (loadTargets → seedRow → loop(readMax → appendRow))
- multi-instance 반복 사이의 visibility 가 핵심
  - 같은 트랜잭션 안의 read-after-flush 패턴
- 예외 발생 시 rollback 검증이 핵심
  - 의도적으로 `BizException` 던지고 DB 상태가 원복되는지 assertion
- 두 datasource 의 commit 경계가 핵심
  - `tx` 프로퍼티로 매니저를 명시한 패턴 + 각각의 datasource 에 대한 assertion

## 디버깅 체크리스트

1. 의도한 트랜잭션 매니저가 `getServiceStarter` 의 배열에 들어가 있는가?
2. DML scriptTask 에 `insert,` / `update,` 접두사가 빠지지 않았는가?
3. JPA save 후 `flush()` 호출이 누락되어 multi-instance 의 후속 SELECT 가 stale data 를 보고 있지 않은가?
4. callActivity 안에서 예외가 나서 호출자 트랜잭션이 통째로 rollback 되었는가? (의도라면 OK, 아니면 별도 sub-service 분리 검토)
5. `setAudit(AuditHolder.getAudit())` 누락으로 DML 이 감사 컬럼 not-null 위반으로 실패하지 않는가?
6. `result.path()` 를 보고 어디까지 실행됐는지 확인 — 트랜잭션 시작 지점 / commit 지점 / 예외 발생 지점 식별.

## 자주 인용할 대표 샘플

- 단일 매니저 + multi-instance + JPA flush
  - `examples/services/transaction_test.bpmn` + `examples/java/TransactionTest.java`
  - `real-project-patterns.md` 8 번 절
- DML 접두사 사용
  - `transaction_test.bpmn` 의 `insert,transaction.new`, `insert,transaction.add`
- inline SQL 로 max 조회 후 JPA 로 갱신
  - `transaction_test.bpmn` 의 `readMax` (mybatis) + `readMaxInline` (inline) + `readMaxJpa` (JPA) 비교
- 권위 정의 / 매트릭스
  - `upstream/Transaction.md`, `upstream/Properties.md` (`tx`, `ds`)
  - `upstream/미작성 카테고리/How-to Guides/Manual transaction commit rollback.md`
