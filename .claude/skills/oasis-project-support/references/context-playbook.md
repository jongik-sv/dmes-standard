# Context Playbook

이 문서는 OASIS 의 ServiceContext / ProcessContext / element-level scope 가 어떻게 구성되는지, 변수 lookup 순서와 sub-process 격리 동작을 정리한 가이드다. 권위 있는 정의는 `references/upstream/Context.md` 와 `references/upstream/미작성 카테고리/How-to Guides/Isolate process context.md`. 변수 매핑 / PropertyEL 디버깅은 `references/binding-playbook.md` 와 함께 본다.

## Context 계층 한 줄 요약

- `ServiceContext` : 한 서비스 호출 전체를 감싸는 최상위 컨텍스트. `ApplicationContext` (Spring AC 래퍼) + 시작 시 주입한 `Map<String, TypedObject>` 를 보유.
- `ProcessContext` : 한 BPMN process 실행 중 만들어지는 변수 저장소. 자식 sub-process 에서는 보통 부모 컨텍스트를 그대로 공유.
- 요소 단위 element output : 각 task 가 끝나면 `output` alias 로 process context 에 변수 저장.

## 변수 lookup 순서

1. element-level inputParameter (해당 task 에 명시된 리터럴 / 표현식) — 가장 우선.
2. process context 의 alias.
3. service context 의 초기 입력값 (`new DefaultServiceContext(ac, initialMap)` 의 map).
4. application context 의 Spring bean (Java task 의 생성자 주입에 사용).

## Sub-Process 격리

기본적으로 callActivity / inline subProcess 는 부모 process context 를 공유한다. 격리가 필요하면:

- multi-instance loop 의 `elementVariable` 은 자식 안에서만 유효 (가장 흔한 격리).
- callActivity 의 callee process 가 자체 `input` alias 만 선언하면 호출자 변수가 자동으로 채워지지 않은 변수는 callee 에서 안 보임.
- 명시적 격리는 `references/upstream/미작성 카테고리/How-to Guides/Isolate process context.md` 의 패턴을 따른다.

## Audit 정보

ServiceContext 에는 감사 컬럼용 메타데이터가 함께 들어 있다. DML 을 BPMN 안에서 실행하려면 반드시 `setAudit(AuditHolder.getAudit())` 호출. 자세한 내용은 `references/auditing-playbook.md` 참조.

## TypedObject 와의 관계

context 의 모든 변수는 `TypedObject` 로 감싸진 형태로 저장된다. 꺼낼 때는 `getObject(Class)` 또는 `getObject(TypeReference)` 로 풀어낸다. 자세한 내용은 `references/typed-object-playbook.md` 참조.

## 디버깅 체크리스트

1. 메서드 파라미터에 null 이 들어온다 → 같은 이름 변수가 context 에 없거나, lookup 순서에 따라 다른 곳 값이 들어옴.
2. inputParameter 와 process context 변수의 이름이 같다면, **inputParameter 가 우선**.
3. callActivity 안에서 부모 변수가 안 보인다 → callee 의 process 레벨 `input` 에 선언했는지, 또는 호출자 측 `<camunda:inputParameter>` 로 명시 주입했는지 확인.
4. multi-instance 안에서 부모 변수와 element 변수가 같은 이름이면 element 가 우선.
5. ServiceContext 초기 입력값에 빠진 게 있는지 — 테스트 셋업의 `TypedMapBuilder` / `MapBuilder` 가 누락한 변수 흔히 있음.

## 자주 인용할 대표 샘플

- ServiceContext 셋업
  - `examples/java/MyBatisSelectAndLoopTest.java` (TypedMapBuilder + setAudit)
  - `examples/java/BpmnServiceLoaderForTest.java` (SpringApplicationContext 래퍼)
- multi-instance element scope
  - `examples/services/mybatis_select_and_loop.bpmn`
- callActivity input 격리
  - `examples/services/state_router_subprocess.bpmn` (process 레벨 `input="itemId"`)
- 권위 정의
  - `references/upstream/Context.md`
  - `references/upstream/미작성 카테고리/How-to Guides/Isolate process context.md`
