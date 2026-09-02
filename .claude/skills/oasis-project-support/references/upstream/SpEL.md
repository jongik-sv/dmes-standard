# SpEL

*Spring Expression Language*(줄여서 "SpEL")는 런타임에 개체 그래프 쿼리 및 조작을 지원하는 강력한 표현 언어이다.(참조 : [스프링 레퍼런스](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#expressions))

OASIS에서는 태스크 수행 후 다음 흐름을 결정하기 위한 표현식 처리를 위해 사용한다. 

![Untitled](SpEL/Untitled.png)

여기서는 표현식 평가를 위한 SpEL의 기본 문법과 OASIS 에서 사용 예를 설명한다.

# 기본 문법

## 개체 요소 접근

개체 안에 여러 요소를 가지고 있는 컬렉션 또는 맵에 접근하기 위해서는 `[ ]` 기호를 사용한다. *index* 로 접근하기 위해서는 `[ 숫자 ]`, *key*로 접근하기 위해서는 `[ '문자' ]` 형태로 참조한다.

1. index 형 : Array, List
    
    ```java
    object[0]
    ```
    
2. key 형 : Map
    
    ```java
    object['name']
    ```
    

## 개체 메소드 실행

개체가 가지고 있는 메소드를 직접 호출할 수 있다.

```java
object.isBoolean()
```

## 조건

3항 연산자를 이용해서 조건에 맞는 결과를 반환하게 할 수 있다.

```java
['j'] <= 9? 'loop' : 'end'
```

# OASIS 컨텍스트

표현식을 적용할 최상위 개체는 `#root` 로 표현한다. `#root` 는 생략 가능하다. 즉 `#root[0]` 과 `[0]` 은 같은 의미이다.

OASIS 에서는 태스크에서 흐름이 분기가 되면 태스크의 **반환값**을 최상위 개체인 컨텍스트로 지정한다. 따라서 태스크에서 수행한 결과가 `List<String>` 타입 개체이면 `#root` 는 `List<String>` 타입 개체이다. 이 개체에서 사용할 수 있는 메소드를 아래처럼 사용할 수 있다.

```java
#root.getSize()>0
```

*Exclusive Gateway* 는 ***ProcessContext* 와 *ServiceContext* 를 병합한 맵**을 컨텍스트로 제공한다. 예를 들어 서비스 컨텍스트에 `id` 라는 키로 `String` 타입 `abc` 가 있고 프로세스 컨텍스트에 `users` 라는 키로 `List<String>` 타입 데이터가 있을 때 아래처럼 접근할 수 있다.

```java
['id'] == ['users'][0]
```

분기에 관한 자세한 사항은 [Branching](Branching.md) 페이지를 참고.