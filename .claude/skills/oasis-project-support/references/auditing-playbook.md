# Auditing Playbook

이 문서는 OASIS 가 DML 실행 시 자동으로 채워주는 감사(audit) 컬럼 동작과, 운영 / 테스트 셋업에서 자주 빠지는 `setAudit` 호출 패턴을 정리한 가이드다. 권위 있는 정의는 `references/upstream/미작성 카테고리/Auditing.md`.

## 감사 컬럼 동작 한 줄 요약

OASIS 의 SQL Script Task 가 INSERT / UPDATE 를 실행할 때, 감사 컬럼(생성자 / 생성일시 / 수정자 / 수정일시 등) 을 자동으로 바인딩한다. 바인딩 값의 출처는 `ServiceContext#getAudit()` 가 반환하는 `Audit` 객체.

## 표준 셋업

테스트 / 운영 모두 ServiceContext 를 만든 직후 `setAudit` 한 번 호출.

```java
DefaultServiceContext serviceContext = new DefaultServiceContext(oac, new TypedMapBuilder().build());
serviceContext.setAudit(AuditHolder.getAudit());
```

- `AuditHolder` 는 OASIS 가 제공하는 ThreadLocal-style holder. 통합 테스트는 보통 그 기본 구현으로 충분.
- 운영에서는 web filter / interceptor 단계에서 인증된 사용자 정보로 `AuditHolder` 를 채워두고, 같은 ThreadLocal 을 BPMN 시작 직전에 `getAudit()` 로 읽어와 ServiceContext 에 주입.

## 무엇이 자동 바인딩되는가

OASIS 의 DML script 에서 감사 컬럼명에 해당하는 바인딩 파라미터(예: `#{createdBy}`, `#{createdAt}`, `#{updatedBy}`, `#{updatedAt}`) 가 **명시되지 않아도** 자동으로 채워진다. 정확한 컬럼 이름과 채워지는 값은 OASIS 빌드 / 프로젝트 컨벤션에 따라 다를 수 있으므로 `references/upstream/미작성 카테고리/Auditing.md` 를 권위 정의로 사용한다.

## 가장 흔한 실패 시나리오

1. 통합 테스트에서 `setAudit` 누락 → INSERT/UPDATE 가 not-null constraint 위반으로 실패.
   - 증상: `serviceResultCode() == SYSTEM_ERROR`, exception 메시지에 컬럼명 (예: `CREATED_BY cannot be null`).
2. 운영에서 인증 정보가 없는 system job 실행 → AuditHolder 가 비어 있어 같은 증상.
   - 해결: 시스템 사용자 ID 로 `AuditHolder` 를 채운 뒤 ServiceStarter 호출.
3. 같은 트랜잭션 안에서 audit 가 변경되어야 하는 경우 (예: long-running batch) — `ServiceContext` 에 다른 audit 객체를 다시 setAudit 으로 넣을 수 있다. 다만 BPMN 한 호출 안에서 사용자가 바뀌는 경우는 드물다.

## 디버깅 체크리스트

1. DML 이 not-null 위반으로 실패하면 가장 먼저 `setAudit` 호출 누락 의심.
2. `AuditHolder.getAudit()` 가 null 이라면 — 테스트 환경에서 `AuditHolder` 초기화가 안 됐거나, 운영의 web filter 가 작동하지 않은 것.
3. 운영에서 createdBy 컬럼이 “system” / “anonymous” 로 찍힌다면 — 인증 정보가 빠진 채 BPMN 이 실행됐다는 신호.
4. 감사 컬럼명을 매퍼에 명시 바인딩했는데 값이 두 번 채워지는 것 같다면 — 자동 바인딩과 충돌. 매퍼에서 감사 컬럼은 명시하지 않는 편이 안전.

## 자주 인용할 대표 샘플

- 표준 setAudit 호출
  - `examples/java/MyBatisSelectAndLoopTest.java`
  - `examples/java/TransactionTest.java`
- 권위 정의
  - `references/upstream/미작성 카테고리/Auditing.md`
- 트랜잭션과의 관계
  - `references/transaction-playbook.md`
