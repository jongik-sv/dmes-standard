# TypedObject Playbook

이 문서는 OASIS 의 `TypedObject` 래퍼와 BPMN context 의 변수 저장 / 조회 패턴을 정리한 가이드다. 권위 있는 정의는 `references/upstream/미작성 카테고리/Technical Ref/TypedObject.md`. PropertyEL 매핑과 함께 본다.

## TypedObject 한 줄 요약

ServiceContext / ProcessContext 의 모든 변수는 `TypedObject` 로 감싸져 저장된다. 꺼낼 때는 (1) `getObject(Class<T>)`, (2) `getObject(TypeReference<T>)`, (3) `getObject()` (raw `Object`) 중 하나를 사용. 자동 직렬화 / 역직렬화를 OASIS 가 책임진다.

## 만들기

### 단일 값

```java
new TypedObject("hello")
new TypedObject(42)
new TypedObject(myDto)
```

### Map 빌더

```java
Map<String, TypedObject> initial = new MapBuilder<String, TypedObject>()
        .addEntity("orderId", new TypedObject("o-001"))
        .addEntity("buyerId", new TypedObject("b-100"))
        .build();
```

### TypedMapBuilder (감사 / 표준 변수까지 포함)

```java
DefaultServiceContext ctx = new DefaultServiceContext(
        oac,
        new TypedMapBuilder()
                .addEntity("orderId", "o-001")
                .build()
);
```

## 꺼내기

### 단일 클래스

```java
String s = result.result("greeting").getObject(String.class);
Integer n = result.result("count").getObject(Integer.class);
MyDto dto = result.result("order").getObject(MyDto.class);
```

### 제네릭 / 컬렉션

```java
List<Map<String, Object>> rows =
        result.result("orders").getObject(new TypeReference<List<Map<String, Object>>>() {});

List<TypedObject> items =
        result.result("results").getObject(new TypeReference<List<TypedObject>>() {});
```

multi-instance task 의 누적 output (`output="results"`) 은 보통 `List<TypedObject>` 형태로 풀린다.

### raw

```java
Object any = typedObject.getObject();
```

타입을 모를 때만 쓴다. 보통은 `getObject(Class)` 를 쓰는 편이 안전.

## context 안에서의 형태

- ServiceContext 초기 입력값: `Map<String, TypedObject>`.
- task output: alias 키로 `TypedObject` 저장.
- multi-instance element 변수: 자식 컨텍스트에 `TypedObject` 로 들어감. Java method 가 `String` / DTO 를 받으면 OASIS 가 자동 unwrap.

## 디버깅 체크리스트

1. `getObject(Class)` 에서 `ClassCastException` — 저장된 실제 타입이 다름. `getObject()` 로 raw 를 먼저 찍어 클래스 확인.
2. 제네릭 List 를 `getObject(List.class)` 로 받으려 하면 unchecked 경고만 나고 element 타입을 잃는다 → 반드시 `TypeReference` 사용.
3. multi-instance 의 누적 output 을 `List<TypedObject>` 가 아니라 `List<DTO>` 로 받으려 했으나 실패 — 안쪽이 한 번 더 wrap 되어 있는 것. `List<TypedObject>` 로 받고 각 원소를 `getObject(DTO.class)` 로 풀기.
4. SQL Script 의 `output="result"` 결과는 보통 `List<Map<String, Object>>`. `getObject(Map.class)` 가 아니라 `TypeReference<List<Map<String, Object>>>` 로 받는다.
5. inline SQL 의 `/*resultType=...*/` 주석으로 DTO 매핑한 경우 — 결과가 `List<DTO>` 로 직접 풀린다 (Map 단계 없음).

## 자주 인용할 대표 샘플

- 단일 값 / DTO unwrap
  - `examples/java/MyBatisSelectAndLoopTest.java`
- 제네릭 컬렉션
  - `source-bpmn-examples.md` 의 List/Loop 절
- 감사 셋업과 함께
  - `references/auditing-playbook.md`
- 권위 정의
  - `references/upstream/미작성 카테고리/Technical Ref/TypedObject.md`
