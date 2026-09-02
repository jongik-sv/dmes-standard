# Task

입력과 출력값을 직접 정의 할 수 있고 다중 실행 및 분기가 가능한 모델 요소이다.

# 기본 태스크

## 컨텍스트 반환 태스크

*input* 속성에 있는 참조를 컨텍스트에서 가져와 그대로 반환하는 태스크이다. 태스크 타입을 설정하지 않으면 컨텍스트 반환 태스크로 동작한다.

![Untitled](Task/Untitled.png)

### 지원 속성

- input(optional)
    
    컨텍스트에서 참조할 키를 입력한다. PropertyEL을 지원하지만 복수를 지정할 수 없다.
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    

# 서비스 태스크

외부 서비스를 호출하는 태스크이다.

![Untitled](Task/Untitled%201.png)

## 자바 서비스 태스크

*General* 탭에서 *Implementaion*을 ***Java Class***로 선택하여 사용한다. 실행할 자바 클래스를 정규 클래스 이름으로 입력해야 한다. 

만약 입력한 클래스 명으로 된 오브젝트가 컨텍스트에 존재하면 그 오브젝트를 사용한다. 속성 `new` 가 `true` 이더라도 해당 오브젝트를 사용한다. (테스트 작성시 유용하게 사용할 수 있음)

입력한 클래스 명으로 된 오브젝트가 컨텍스트에 존재하지 않으면 속성 `new` 값에 따라 새로운 오브젝트를 생성하던지 기존에 만들어진 오브젝트를 사용한다.

![Untitled](Task/Untitled%202.png)

### 지원 속성

- input(optional)
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다.
    
    <aside>
    💡 input의 오브젝트가 Map 또는 플래인 오브젝트이면 언팩키워드(**)를 이용해서 접근가능하도록 할 수 있다.
    예)
    `**data`
    `data->**data`
    `data[0]->**data`
    
    `inputOnly` 속성이 `true`이면 언팩키워드를 사용한 개체의 데이터를 사용하지만, 지정하지 않거나 false이면 우선순위가 `ProcessContext`보다 낮다. 따라서 `ProcessContext`에 같은 키 값으로 데이터가 있으면 `ProcessContext` 데이터를 사용한다.
    
    </aside>
    

- method
    
    실행할 메소드 이름 또는 메소드 한정자
    
- inputOnly(optional, false)
    
    `true` 또는 `false`를 입력한다. `true` 이면 *input* 속성에 입력한 키만 태스크에 전달한다.
    
- new(optional, false)
    
    `true` 또는 `false`를 입력한다. `true` 이면 항상 클래스의 인스턴스를 새로 만든다. `false` 이면 프로세스 내에서 이미 생성된 적이 있으면 해당 인스턴스를 사용한다. 
    
    프로세스 내에 생성된 적이 없으면 컨텍스트에서 같은 타입의 인스턴스가 있으면 해당 인스턴스를 사용한다.
    
    같은 타입이란 지정한 클래스와 호환되는 모든 클래스를 뜻한다.
    
    즉, 클래스에는 인터페이스를 지정하고 컨텍스트에는 인터페이스 구현체가 존재하면 해당 클래스를 사용한다.
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    
- object(optional, false)
    
    `true` 또는 `false`를 입력한다. `true` 이면 태스크 실행 결과를 태스크의 오브젝트로 사용할 수 있도록 프로세스 컨텍스트에 등록한다.
    
    만약, 다른 태스크에서 실행할 클래스가 프로세스 컨텍스트에 등록된 객체의 클래스이면 해당 클래스를 사용한다.
    
- dto(optional)
    
    `context`에 있는 데이터로 지정한 타입의 객체를 만들어서 메소드 실행에 사용한다.
    
    `,`로 구분하여 여러 클래스를 지정할 수 있다.
    
- opt(optional)
    
    메소드와 컨텍스트 바인딩을 시도 할 때 파라미터 목록에서 옵션으로 지정할 파라미터 이름 목록을 `,`로 구분하여 지정한다.
    
    예를 들어 `Context`에 `a` 라는 이름으로 데이터가 있고 실행하고자 하는 메소드 파라미터가 `a`, `c`가 있을 때 `opt` 옵션에 `c`를 지정하면 `Context` 에 `c`라는 이름으로 데이터가 없더라도 바인딩을 시도한다. `c`가 레퍼런스 타입이면 `null`을 프리미티브 타입이면 프리미티브 타입의 기본값을 바인딩한다.
    

### 수동 입력값

*input/output* 탭에서 태스크의 입력값을 직접 넣을 수 있다. *Input Parameters* 에서 *+* 버튼을 눌러 항목을 하나씩 추가한다.

![Untitled](Task/Untitled%203.png)

입력 탭에서 맵을 지원하므로 더 편리하게 입력값을 수동으로 넣을 수 있다.

![Untitled](Task/Untitled%204.png)

**바인딩 표현식**

- **Type**
    
    타입  표현식으로 태스크 실행시 사용할 컨텍스트에 인스턴스를 추가할 수 있다.
    
    ![Untitled](Task/Untitled%205.png)
    
    표현식은 *Input Parameters* 에 입력한 일반값을 모두 컨텍스트로 사용한다. 따라서 객체 생성에 필요한 값을  입력하여 사용할 수 있다.
    
    표현식 실행 결과는 표현식 단위로 실행되어 즉시 컨텍스트에 저장한다. 따라서 상위에 입력한 표현식은 아래에 입력한 표현식의 입력값으로 사용할 수 있다.
    
    위 Input Parameters 에서는
    
    *chat* 은 타입 표현식으로 입력하여서 `oasis.Chat` 객체를 생성하는데 컨텍스트에 myMap과 name을 포함한다.
    
    *line* 도 타입 표현식으로 입력하여서 `com.oasis.Line` 객체를 생성하는데 컨텍스트에 `oasis.Chat` 객체인 *chat*, *myMap*, *name*을 포함한다.
    
    > oasis.JavaPlainServiceTaskProperty#inputOnlyFalse()
    oasis.JavaPlainServiceTaskProperty#inputOnlyTrue()
    oasis.JavaPlainServiceTaskProperty#inputOnly()
    > 

- **String type**
    
    표현식에 정의한 바인딩 표현식(${KEY})과 `ExecutableContext`에 존재하는 값을 매칭하여 태스크의 입력값으로 사용한다. 
    
    바인딩 표현식은 복수로 올 수 있고 KEY와 일치하는 값이 `ExecutableContext`에 없으면 표현식을 그대로 사용한다.
    

# 스크립트 태스크

간단한 스크립트를 실행하는 태스크이다.

![Untitled](Task/Untitled%206.png)

## SQL 스크립트 태스크(프로시저 스크립트 태스크)

### 스크립트 직접 작성

*General* 탭에서 *Script Format* 에 `sql` 입력, ***Script*** 에 SQL을 작성한다.

> 프로시저를 호출하기 위해서는 `proc`  라고 입력한다.
> 

![Untitled](Task/Untitled%207.png)

- SQL 주석에 반환 타입을 명시하면 지정한 Class 타입으로 SQL 실행 결과를 반환한다.
    
    ```sql
    /* resultType=usecase.sqlScriptWithDto.UserDto */
    select id, first_Name, last_Name, update_Time, rate
    from users
    ```
    
    위 쿼리는 `UserDto`의 리스트로 반환된다.
    

### 외부 리소스 호출

*General* 탭에서 *Script Format* 에 `sql` 입력, ***Script* Type**에 을 *External Resouce* 를 선택하고 **Resource**에 리소스 식별자를 입력한다.

![Untitled](Task/Untitled%208.png)

외부 리소스를 식별하여 실제로 수행하는 것은 프로젝트에서 `oasis.executors.SqlRunner` 인터페이스 구현하여 수행한다. `oasis.executors.SqlRunner` 인터페이스 구현체를 `ApplicationContext`에 등록하면 자입력한 리소스 식별자를 넘겨서 사용할 수 있도록 해준다.

### 데이터 소스

*Extenstion* 탭에서 어떤 데이터소스 또는 트랜잭션 매니저를 대상으로 실행할지 지정한다.

데이터소스를 지정하거나

![Untitled](Task/Untitled%209.png)

트랜잭션 매니저 이름으로 실행할 대상을 지정할 수 있다.

![Untitled](Task/Untitled%2010.png)

SQL은 named parameter sql 로 작성하여 SQL에 바인딩 변수를 넣을 수 있다.

```sql
select id, name from users where id = :id
```

> 프로시저를 호출하기 위해서는  `[schema].[프로시저이름](파라미터변수)` 형태로 입력한다.
예)
`user.add_user(:name)`
> 

파라미터는 맵 또는 일반 자바 클래스를 바인딩 소스로 사용할 수 있다. 일반 자바 클래스는 `getter`로 데이터를 가져올 수 있어야 한다. 

프로퍼티로 설정한 값과 컨텍스트에서 가져올 수 있는 값을 전체 바인딩 소스로 사용한다. *input* 프로퍼티로 입력값으로 사용할 객체를 복수로 지정할 수 있다. 

만약 *input*으로 지정된 개체가 1개이고 맵 이면 모든 엔트리를 파라미터로 사용한다. 일반 자바 클래스일 경우 내부적으로 맵으로 변환하여 파라미터 목록에 추가한다. 

<aside>
💡 파라미터 바인딩 우선순위
input > input keys > Service Context

</aside>

태스크 실행 결과는 `List<Map<String, Object>>` 타입으로 반환한다.

### 지원 속성

- input(optional)
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다.
    
- ds(tx와 ds 둘 중 하나를 입력)
    
    데이터소스를 지정한다.
    
- tx(tx와 ds 둘 중 하나를 입력)
    
    트랜잭션 매니저를 지정한다. 
    
    <aside>
    💡 `oasis.jdbc.DefaultDataSourceResolver` 을 구현하여 기본 DataSource를 가져올 수 있으면 해당 DataSource를 사용한다.
    
    </aside>
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    

### 수동 입력값

*input/output* 탭에서 태스크의 입력값을 직접 넣을 수 있다. *Input Parameters* 에서 *+* 버튼을 눌러 항목을 하나씩 추가한다.

![Untitled](Task/Untitled%2011.png)

입력 탭에서 맵을 지원하므로 더 편리하게 입력값을 수동으로 넣을 수 있다.

<aside>
💡 값의 타입을 이름에 지정할 수 있다. 지정 형태는 이름:타입 이다. 지원 타입은 `string, double, boolean` 이다.

예)

![Untitled](Task/Untitled%2012.png)

이 경우 타입 힌트를 지정하지 않으면 `firstName`의 값 타입은 `integer`로 지정되므로 문자열로 명시적으로 선언하고 싶으면 타입 힌트를 추가해야한다.

</aside>

![Untitled](Task/Untitled%2013.png)

<aside>
💡 맵의 value 타입 힌트를 줄 수 있다. 지정 형태는 `이름:타입` 이다. 지원 타입은 `string, double, boolean` 이다.
예)
`myMap:string`

</aside>

## Transaction 스크립트 태스크

트랜잭션을 커밋하거나 롤백하는 태스크이다.

*General* 탭에서 *Script Format* 에 `transaction` 입력, *Script* 에 `commit` 또는 `rollback` 을 기입한다.

![Untitled](Task/Untitled%2014.png)

*Extenstion* 탭에서 어떤 트랜잭션 매니저를 대상으로 실행할지 지정한다.

![Untitled](Task/Untitled%2015.png)

### 지원 속성

- tx
    
    트랜잭션 매니저를 지정한다. 
    

# 액티비티 태스크

다른 외부 서비스를 호출하는 태스크이다. 

![Untitled](Task/Untitled%2016.png)

## 서브 서비스 호출 태스크

*General* 탭에서 *CallActivtyType* 을 *BPMN* 선택하고 *Called Element* 에 호출할 서비스ID를 입력한다.

![Untitled](Task/Untitled%2017.png)

### 서브 서비스 입력

서브 서비스 호출은 **메인 프로세스와 연결된 서비스 컨텍스트와 격리**시킨다. 즉 메인 서비스를 호출 했을 때 입력값을 서브 서비스와 공유하여 사용할 수 없다. 단, 최초 호출한 서비스의 입력값은 하위 모든 서비스에서 사용할 수 있다. 서브 서비스에 입력값을 주기 위해서는 input/output 탭에서 Input Parameters 에 입력값을 명시적으로 넣거나 input 속성으로 컨텍스트에 있는 값을 전달시킬 수 있다.

### 지원 속성

- input
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다. 전달된 데이터는 서브 서비스의 서비스 컨텍스트로 사용한다.
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    
- dto(optional)
    
    현재 콘텍스트를 기반으로 지정한 클래스를 생성하여 서비스 컨텍스트에 포함시킨다.
    
- new(optional)
    
    서브 서비스 수행시 트랜잭션을 분리하여 신규 서비스가 호출된 것 처럼 동작한다.
    

# 서브 프로세스 태스크

서브 프로세스를 호출하는 태스크이다. 서브 프로세스는 프로세스 컨텍스트를 격리한다.

![Untitled](Task/Untitled%2018.png)

### 지원 속성

- processId
    
    실행할 프로세스 ID
    
- input
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다. 전달된 데이터는 서브 프로세스의 프로세스 컨텍스트로 사용한다.
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    
- dto(optional)
    
    `context`에 있는 데이터로 지정한 타입의 객체를 만들어서 메소드 실행에 사용한다.
    
    `,`로 구분하여 여러 클래스를 지정할 수 있다.
    

# 인라인 서브 프로세스

다른 요소와 연결된 서브 프로세스이다. 서브 프로세스는 프로세스 컨텍스트를 격리한다.

![Untitled](Task/Untitled%2019.png)

### 지원 속성

- input
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다. 전달된 데이터는 서브 프로세스의 프로세스 컨텍스트로 사용한다.
    
- output(optional)
    
    태스크의 반환값을 프로세스 컨텍스트에 저장할 키 값
    
- dto(optional)
    
    `context`에 있는 데이터로 지정한 타입의 객체를 만들어서 메소드 실행에 사용한다.
    
    `,`로 구분하여 여러 클래스를 지정할 수 있다.
    

# 메시지 전송 태스크

메시지를 전송을 위해 사용한다. 태스크 실행시에 즉시 전송되는 것은 아니고 서비스 결과에서 태스크 실행 당시 컨텍스트와 토픽의 구조를 이용해서 바인드된 정보를 반환한다.

![Untitled](Task/Untitled%2020.png)

### 지원 속성

- input(optional)
    
    *PropertyEL*을 이용해서 컨텍스트에 존재하는 데이터를 가공하여 태스크에 전달한다.
    

### 필수 속성

- Implementation & Topic
    
    Implementation 을 External, Topic에 메시지 타입Id를 입력한다.
    
    ![Untitled](Task/Untitled%2021.png)
    

### 상세정보

- sage 태스크 참조
    
    [Messaging](../Messaging.md)
    

# 태스크 마커

태스크에는 컬렉션에 대한 순회 또는 병렬 수행을 위해 마커를 추가할 수 있다.

## Loop

태스크를 입력한 컬렉션 요소와 더불어 순차실행한다. 

![Untitled](Task/Untitled%2022.png)

### 지원 속성

- iter
    
    순회할 컬렉션과 요소명을 지정한다. `컬렉션 -> 요소명` 형태로 입력한다.
    

## Sequential Multi Instance

태스크를 입력한 컬렉션 요소와 더불어 순차실행한다.

![Untitled](Task/Untitled%2023.png)

## Parallel Multi Instance

태스크를 입력한 컬렉션 요소와 더불어 병렬실행한다.

![Untitled](Task/Untitled%2024.png)