# Branching

프로세스는 *요소*와 *흐름*으로 이루어져 있다. 프로세스를 실행하면 시작 요소를 지나 실행할 그 다음 요소를 선택해야하는데 선택하는 조건과 기준을 흐름에 표기한다. 이 페이지에서는 흐름의 종류과 조건식을 만드는 방법을 알아본다.

# 흐름 종류

## 순차 흐름

요소와 요소사이에 **단일 흐름만 존재**하고 **조건이 없는** 흐름이다. 순차 흐름은 아무런 평가 없이 연결되어 있는 요소를 다음 요소로 선택한다.

![Untitled](Branching/Untitled.png)

## 조건 흐름

흐름에 조건이 있는 흐름이다. 조건 표현식이 *참*이면 해당 흐름을 선택한다.

![Untitled](Branching/Untitled%201.png)

## 기본 흐름

모든 조건 흐름이 만족하지 않을 때 선택되는 흐름이다. 기본 흐름 단독으로 존재할 수 없고 반드시 조건 흐름과 같이 있어야 한다.

![Untitled](Branching/Untitled%202.png)

# 조건 분기

태스크에 조건 흐름이 있을 때 **모든 조건 흐름에 대하여 테스트**를 한 뒤 **유일하게 *참*인 흐름으로 분기**한다. 만약 *참*인 흐름이 2개 이상이거나, *참*인 흐름이 없는데 기본 흐름이 존재하지 않으면 예외가 발생한다.

## 조건 표현식

흐름을 선택하고 *General* 탭의 *Condition Type* 에서 *Expression*을 선택한다. *Expression* 을 선택하면 *Expression* 항목이 활성화 되는데 이 곳에 조건 표현식을 작성한다. 조건 표현식은 **SpEL**로 작성한다. SpEL의 root 컨텍스트는 **요소의 반환값**이다.

아래는 *이름출력* 태스크에서 반환한 값을 브랜치의 조건 표현식을 적용한 서비스이다. 

![Untitled](Branching/Untitled%203.png)

*이름출력* 태스크는 리스트와 인덱스를 입력받아 값을 반환하는 메소드를 가진 클래스를 정의했다.

```java
public class Name {
    public String returnName(List<String> names, int index) {
        return names.get(index);
    }
}
```

태스크의 반환 타입이 `String` 이므로 이 타입의 반환값이 SpEL의 루트 컨텍스트이고 이 루트 컨텍스트에 대한 표현식을 브랜치에 기입한다.

![Untitled](Branching/Untitled%204.png)

```
#root=='jimmy'
```

조건에서 알 수 있듯이 태스크의 반환값이 jimmy 이면 해당 흐름을 선택한다.

위 프로세스는 다음 순서로 요소들이 실행된다.

```
[Event_11ym3rg(start), Activity_164rkyw(이름출력), Event_0ahq8tw(end)]
```

> oasis.ConditionBranching#javaServiceTaskConditionBranchingTrue()
> 

반대로 조건 표현식이 참이 아니면 기본 흐름을 선택하여 다음 순서로 요소가 실행된다.

```
[Event_11ym3rg(start), Activity_164rkyw(이름출력), Event_0b1gu7a(Event_0b1gu7a)]
```

> oasis.ConditionBranching#javaServiceTaskConditionBranchingFalse()
> 

## 간략한 조건 표현식

만약 반환값이 String 타입이고 동등성 비교를 통해 흐름을 결정하고자 한다면 표현식에 비교 하고자 하는 문자열만 입력하면 된다. 다시 말하면 반환값이 스트링 타입 `jimmy` 이고 조건 표현식에 `jimmy` 라고 입력하면 해당 흐름은 조건을 만족하기 때문에 그 흐름을 선택한다.

![[그림 간략한 조건 표현식]](Branching/Untitled%205.png)

[그림 간략한 조건 표현식]

실행 결과는 조건에 `#root=='jimmy'` 를 입력했을 때와 같다.

```
[Event_11ym3rg(start), Activity_164rkyw(이름출력), Event_0ahq8tw(end)]
```

> oasis.ConditionBranching#javaServiceTaskConditionBranchingSimple()
> 

## 흐름 이름에 조건 표현하기

조건 흐름인데 *Expression* 에 입력 된 것이 없으면 *name* 속성의 값을 조건으로 인식한다.  따라서 아래와 같이 입력을 하여도 *간략한 조건 표현식* 예제와 똑같이 동작한다.

![Untitled](Branching/Untitled%206.png)

<aside>
💡 **순차 흐름에는 이름을 적으면 안된다.**

*순차 흐름*에 이름을 적게 되면 `name` 자체가 조건이 되어 *순차 흐름*이 *조건 흐름*으로 변경이 되고, 조건이 만족하지 않으면서 기본 흐름도 없기 때문에 다음 흐름을 결정할 수 없게 된다.

![Untitled](Branching/Untitled%207.png)

</aside>

> oasis.ConditionBranching#javaServiceTaskConditionBranchingSimpleName()
> 

# 배타적 게이트웨이

*배타적 게이트웨이*도 실행 가능한 요소이다. *배타적 게이트웨이*는 **서비스 컨텍스트**와 **프로세스 컨텍스트**를 **합친 맵을 반환**한다. 따라서 여러 태스크의 결과를 이용해서 또는 사용자 입력값 컨텍스트인 서비스 컨텍스트의 값을 이용해서 분기를 하려면 *배타적 게이트웨이*를 사용해야 한다.

![Untitled](Branching/Untitled%208.png)

*이름출력1* 태스크에서 `jimmy`를 반환하고 *이름출력2* 태스크에서 `andrew` 를 반환했을 때 *gateway* 의 조건중 하나인 `['name1']!=['name2']` 를 만족한다. 따라서 *end1* 을 끝으로 서비스를 종료한다.

<aside>
💡 태스크의 반환값은 `name1`, `name2` 로 각각 반환하도록 *output* 프로퍼티를 지정하였다.

</aside>

<aside>
💡 *output* 프로퍼티는 태스크의 결과를 프로세스 컨텍스트로 전달하는 속성이다. 
자세한 사항은 model의 task 문서를 참고.1

</aside>