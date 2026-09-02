# Pattern Map

이 문서는 사용자 프로젝트를 지원할 때 바로 떠올릴 OASIS 패턴 인덱스다. 먼저 증상과 가장 비슷한 카테고리를 고른 뒤, 해당 패턴의 실행 의미와 검증 포인트를 함께 본다. 실제 코드와 BPMN 조각이 필요하면 `source-bpmn-examples.md` 를 함께 보고, 리스트/루프 패턴은 `list-loop-guide.md` 를 함께 본다. 실제 사용자 프로젝트의 사례가 필요하면 `real-project-patterns.md` (제조 ERP 실 적용 패턴) 를 함께 본다.

## Branching

- 대표 패턴 이름
  - condition branching
  - gateway branching
  - name conditional branching
  - task result branching
- 언제 여기를 보는가
  - gateway 흐름이 왜 갈라졌는지
  - task 결과로 flow name 분기를 하는지
  - conditional flow 결과가 기대와 다른지
- 실 사용 사례
  - `real-project-patterns.md` 2번 (Gateway `input=eventName/action`, flow `name` 으로 분기)
  - `real-project-patterns.md` 3번 (boolean task + `#root = false` 로 Error End Event 분기)

## Parallel

- 대표 패턴 이름
  - parallel execution
  - parallel plus loop
  - parallel return aggregation
  - parallel multi-instance
  - parallel transaction
- 언제 여기를 보는가
  - 병렬 게이트웨이 경로 수와 순서가 이상할 때
  - 병렬 + 루프, multi-instance 조합을 참고할 때
  - 병렬 안에서 트랜잭션이 섞일 때
- 실 사용 사례
  - 거의 사용 안 함. 운영 BPMN 158개 중 Parallel Gateway 사용 0건. 모든 반복은 `isSequential="true"` 인 multi-instance 로 처리한다 (`real-project-patterns.md` 6번 참조).

## Sub-Process

- 대표 패턴 이름
  - inline subprocess
  - offline subprocess
  - subprocess DTO passing
  - nested subprocess branching
  - subservice call
- 언제 여기를 보는가
  - inline/offline sub-process 차이를 볼 때
  - subprocess input/output alias, DTO 전달, nested subprocess 경로를 볼 때
  - 서비스 간 호출과 subprocess 호출을 비교할 때
- 실 사용 사례
  - `real-project-patterns.md` 6번 (inline subProcess + multi-instance + 자식 SQL/Java)
  - `real-project-patterns.md` 7번 (offline call activity: `state_router`, `event_handler` 같은 공용 상태 천이 BPMN 호출)

## SQL Script

- 대표 패턴 이름
  - select query dynamically
  - query with input param binding
  - looped SQL execution
  - SQL result to DTO
  - SQL plus Java service handoff
- 언제 여기를 보는가
  - datasource lookup, SQL input binding, loop + SQL 실행을 볼 때
  - ScriptTask 결과를 DTO 또는 후속 Java task로 넘길 때
  - update/query 허용 여부와 트랜잭션 경계를 같이 볼 때
- 실 사용 사례
  - `real-project-patterns.md` 5번 (A) MyBatis 매퍼 참조 (`camunda:resource="orders.list.byBuyer"`)
  - `real-project-patterns.md` 5번 (B) inline SQL + `/*resultType=...*/` 로 DTO 매핑
  - `real-project-patterns.md` 5번 (C) DML 의 `insert,` / `update,` 접두사 규약
  - `real-project-patterns.md` 5번 (D) `[0]['col']->alias` 로 단일행/단일컬럼 추출

## Messaging

- 대표 패턴 이름
  - pre-structured send task
  - object message send task
  - list object message send task
  - subprocess send task
- 언제 여기를 보는가
  - Send Task 결과가 `messages()` 에 어떻게 쌓이는지 볼 때
  - topic binding, pre-structured message, object message 차이를 볼 때
  - subprocess 안의 message task 동작을 확인할 때
- 실 사용 사례
  - 거의 사용 안 함. 운영 코드는 외부 연동을 별도 EAI/REST 클라이언트 모듈로 처리하고, BPMN 안에서 send task 는 쓰지 않는다. 보일러플레이트가 필요한 위치에서는 일반 service task 로 외부 클라이언트 메서드를 호출한다.

## Transaction

- 대표 패턴 이름
  - commit and restart
  - rollback
  - transactional subservice
  - explicit transaction manager selection
- 언제 여기를 보는가
  - `commit`, `rollback`, `commitAndRestart` 동작을 볼 때
  - 서브서비스 호출과 트랜잭션 전파를 볼 때
  - DB 상태 기반으로 side effect 를 검증해야 할 때
- 실 사용 사례
  - `real-project-patterns.md` 1번 / 8번 (`SpringTransactionHandler` + `txBiz` 매니저 한 개로 BPMN 전체를 한 트랜잭션으로 묶고, multi-instance 안에서 `repository.save()` + `flush()` 로 같은 트랜잭션 안의 후속 SELECT 가 변경분을 보도록 한다)

## Multi-Datasource

- 대표 패턴 이름
  - multi-source success
  - rollback across sources
  - named transaction manager
  - mixed JPA/MyBatis/JDBC access
- 언제 여기를 보는가
  - `tx` 프로퍼티로 트랜잭션 매니저를 고르는 흐름을 볼 때
  - JPA/MyBatis/JDBC 혼합 접근을 참고할 때
  - 두 개 이상의 datasource 와 rollback 범위를 해석할 때
- 실 사용 사례
  - 운영 BPMN 은 단일 매니저 (`new String[]{"txBiz"}`) 만 사용. 다중 datasource 가 필요할 때는 `BpmnServiceLoaderForTest.getServiceStarter(ac, new String[]{"txBiz", "..."})` 처럼 매니저 이름 배열을 늘리는 식 (`real-project-patterns.md` 1번 참조).

## 선택 규칙

- 흐름이 잘못됐다면 `Branching`, `Parallel`, `Sub-Process` 중 하나를 먼저 고른다.
- side effect 가 이상하면 `Messaging`, `Transaction`, `Multi-Datasource` 중 하나를 먼저 고른다.
- 입력/출력 바인딩이 의심되면 이 문서에서 카테고리를 고른 뒤 `binding-playbook.md` 로 이동한다.
- 사용자 프로젝트가 BPMN-driven 비즈니스 ERP 형태라면, 패턴 카테고리를 정한 뒤 `real-project-patterns.md` 의 같은 번호 절을 함께 인용해 실 사용 형태를 그대로 보여 준다.
