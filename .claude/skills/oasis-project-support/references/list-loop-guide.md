# List And Loop Guide

이 문서는 OASIS에서 가장 자주 헷갈리는 두 가지를 정리한다.

- 조회 결과가 리스트일 때 다음 태스크에서 어떻게 쓰는가
- 리스트를 루프 돌릴 때 입력과 output 이 어떤 형태가 되는가

실제 Java/BPMN 조각은 `source-bpmn-examples.md` 의 3, 4, 9, 10, 11, 12 절을 같이 본다.

## 1. 조회 결과가 리스트일 때 다음 태스크에서 쓰는 방법

조회 결과가 `List<Map<String, Object>>` 나 `List<Dto>` 라면 선택지는 보통 아래 다섯 가지다.

### 선택지 A. 리스트 전체를 유지한다

```xml
<camunda:property name="output" value="orders" />
```

언제 쓰는가:
- 다음 태스크가 전체 리스트를 다시 순회해야 할 때
- gateway 가 아니라 후속 loop task가 받을 때

다음 단계에서의 형태:
- `orders` 는 리스트다.
- Java 쪽에서는 `List<?>`, `List<Map<String, Object>>`, `List<Dto>` 로 읽는다.

### 선택지 B. 첫 번째 원소 하나만 뽑는다

```xml
<camunda:property name="output" value="[0] -&gt; order" />
```

언제 쓰는가:
- 조회 결과가 1건일 것으로 기대할 때
- 다음 태스크는 단일 객체만 받으면 될 때

다음 단계에서의 형태:
- `order` 는 더 이상 리스트가 아니다.
- 첫 번째 원소의 타입 그대로다.

### 선택지 C. 첫 번째 원소의 특정 필드만 뽑는다

```xml
<camunda:property name="output" value="[0]['status'] -&gt; status" />
```

언제 쓰는가:
- 다음 태스크나 gateway 가 scalar 값 하나만 필요할 때
- 상태값, ID, 코드만 뽑고 싶을 때

### 선택지 D. 맵 안의 리스트나 중첩 구조를 더 파고든다

```xml
<camunda:property name="output" value="['item'][0] -&gt; firstItem" />
```

또는

```xml
<camunda:property name="output" value="[0]['name'] -&gt; firstName" />
```

언제 쓰는가:
- 결과가 중첩 맵/리스트일 때

### 선택지 E. alias를 먼저 잡고 alias 내부를 다시 접근한다

```xml
<camunda:property name="output" value="orders[0]" />
```

언제 쓰는가:
- 이미 `orders` 같은 의미 있는 alias가 있고, 그 첫 원소를 바로 쓰고 싶을 때
- 다만 가독성은 `"[0] -> order"` 쪽이 더 나은 경우가 많다

## 2. 무엇을 고를지 빠르게 정하는 기준

- “다음 태스크도 리스트 전체를 처리해야 한다”
  - 선택지 A
- “조회 1건만 기대한다”
  - 선택지 B
- “gateway 조건이나 update task에 컬럼 하나만 넘기면 된다”
  - 선택지 C
- “중첩 구조를 바로 읽어야 한다”
  - 선택지 D
- “이미 별칭이 있고 간단히 그 내부 원소를 쓰고 싶다”
  - 선택지 E

## 3. 다음 태스크 입력으로 넘길 때의 사고방식

- output 에서 이미 단일 원소로 잘랐다면, 다음 태스크는 그 alias를 그냥 받으면 된다.
- output 에서 리스트 전체를 유지했다면, 다음 태스크 입력에서 다시 접근해야 한다.
- 복잡한 접근은 가능한 한 output 단계에서 alias로 한 번 정리하는 편이 안전하다.

예:

```xml
<camunda:property name="output" value="[0] -&gt; memberInfo" />
```

그 다음 태스크는 `memberInfo` 를 바로 받게 만든다.

리스트를 그대로 유지한 뒤 다음 태스크의 `input` 에서 직접 뽑아도 된다.

```xml
<camunda:property name="input" value="members[0] -&gt; memberInfo" />
```

또는

```xml
<camunda:property name="input" value="members[1] -&gt; memberInfo" />
```

언제 쓰는가:
- 이전 태스크 output 을 그대로 두고 싶을 때
- 여러 downstream task 가 같은 리스트를 서로 다르게 소비할 때
- subprocess 별로 다른 인덱스를 넘기고 싶을 때

## 4. gateway 조건에서 리스트 결과를 읽는 법

loop 또는 리스트 결과는 gateway 표현식에서 한 단계 더 들어가야 할 수 있다.

```text
#root['colorNameProcess1'][0]['colorName']=='yo-pink'
```

이 표현식은:
- `colorNameProcess1` 이 루프 결과 리스트라고 보고
- 첫 번째 반복 결과의
- `colorName` 필드를 읽는다

## 5. 루프를 도는 두 가지 방식

OASIS에서 리스트를 반복 처리하는 대표 방식은 두 가지다.

### 방식 1. `iter` + `standardLoopCharacteristics`

예:

```xml
<camunda:property name="iter" value="ids -&gt; id" />
<bpmn:standardLoopCharacteristics />
```

의미:
- `ids` 리스트를 순회한다
- 현재 반복 원소를 `id` 라는 이름으로 바인딩한다

언제 쓰는가:
- script task 나 service task를 단순 반복할 때
- 현재 원소를 명시적인 alias 하나로 받고 싶을 때

장점:
- 직관적이다
- `iter="members -> memberInfo"` 처럼 바로 읽기 쉽다

### 방식 2. `multiInstanceLoopCharacteristics`

예:

```xml
<bpmn:multiInstanceLoopCharacteristics
    camunda:collection="members"
    camunda:elementVariable="memberInfo" />
```

의미:
- `members` 컬렉션을 BPMN multi-instance 로 반복한다
- 각 원소를 `memberInfo` 로 바인딩한다

언제 쓰는가:
- BPMN 레벨에서 반복 구조를 명확하게 표현하고 싶을 때
- sequential / parallel 을 BPMN 속성으로 구분하고 싶을 때

## 6. `elementVariable` 을 어떻게 쓰는가

### 단순 원소

```xml
camunda:collection="names"
camunda:elementVariable="name"
```

- 각 원소가 문자열이면 `name` 으로 바로 받는다.

### 맵 원소

```xml
camunda:collection="members"
camunda:elementVariable="memberInfo"
```

- 각 원소가 맵이면 `memberInfo` 로 받는다.
- Java method는 `Map<String, Object> memberInfo` 처럼 받을 수 있다.

### 맵을 DTO로 변환

```xml
camunda:collection="ids"
camunda:elementVariable="spyDto:usecase.sequential.SpyDto"
```

- 각 원소 맵을 `SpyDto` 로 변환해 `spyDto` 로 받는다.

### DTO 필드를 메서드 파라미터로 풀어 쓰기

```xml
<bpmn:multiInstanceLoopCharacteristics isSequential="true"
                                      camunda:collection="dtos" />
```

```java
public String join(String name, Number age) { ... }
```

- `dtos` 안 각 DTO의 필드가 `name`, `age` 파라미터로 풀려 들어간다.
- 이 방식은 elementVariable 없이도 동작하지만, 파라미터 이름이 DTO 필드와 맞아야 한다.

## 7. loop input 은 어떤 형태인가

- `iter="ids -> id"`
  - 각 반복에서 `id` 는 scalar
- `elementVariable="memberInfo"`
  - 각 반복에서 `memberInfo` 는 map 또는 object
- `elementVariable="spyDto:..."`
  - 각 반복에서 `spyDto` 는 DTO
- `collection="dtos"` only
  - 각 반복 원소의 필드가 method parameter 들로 분해되어 들어간다

## 8. loop output 은 어떤 형태인가

### output 이 없는 경우

- 별도 결과는 쌓이지 않는다.
- 외부 저장소, spy object, message, DB 상태로 검증한다.

### output 이 있는 경우

- 반복 결과가 누적되어 리스트 비슷한 구조가 된다.
- SQL loop 예제에서는 `List<Map<String, Object>>` 형태다.
- multi-instance output 예제에서는 `List<TypedObject>` 처럼 보일 수 있다.

예:

```java
List<Map<String, Object>> rows =
        result.getObject(new TypeReference<List<Map<String, Object>>>() {});
```

또는

```java
List<TypedObject> results =
        output.getObject(new TypeReference<List<TypedObject>>() {});
```

## 9. 자주 하는 실수

- 리스트인데 단일 객체처럼 바로 method binding 하려 한다
  - 먼저 `[0] -> alias` 등으로 잘라야 한다
- `[0]` 접근이 항상 안전하다고 가정한다
  - 빈 결과일 수 있으면 no-op 또는 error path를 먼저 설계해야 한다
- loop output 을 scalar 로 기대한다
  - 대개 누적 결과다
- gateway 에서 loop 결과를 바로 scalar처럼 읽는다
  - `#root['alias'][0]['field']` 처럼 한 단계 더 들어갈 수 있다

## 10. 추천 순서

1. 조회 결과가 리스트인지 단일 객체인지 먼저 정한다.
2. 다음 단계가 리스트 전체를 원하는지, 한 건만 원하는지 결정한다.
3. 한 건만 원하면 output 단계에서 잘라 alias를 만든다.
4. 여러 건을 같은 task로 처리하면 `iter` 또는 `multiInstance` 중 하나를 고른다.
5. 최종 output 이 누적 리스트인지 side effect 인지 테스트로 명시한다.
