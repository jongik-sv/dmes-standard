# Exception

서비스 실행을 담당하는 *ServiceStarter*는 서비스 수행간 발행한 예외를 감지하여 클라이언트로 전달하고 서비스 결과에 담는다.

 OASIS 에 기본값으로 제공하는 *ServiceStarter*는 발생한 예외가 `oasis.exceptions.UserException` 일 때 클라이언트에 실행 결과 코드와 에러 메시지, 에러 객체를 전달하고 서비스를 정상 종료한다. 그외 예외는 클라이언트로 예외 그대로 전파시키므로 서비스 결과를 클라이언트로 반환할 수 없다.

# UserException

서비스 처리 도중 사용자 임의로 서비스를 중단하고자 할 때 사용할 수 있는 예외클래스이다. 이 예외는 트랜잭션 처리, 서비스 결과 생성시 특별히 취급된다. 만약 클라이언트에서 전달 받은 값에 유효성 문제가 문제가 있을 때 문제 원인 메시지와 함께 `oasis.exceptions.UserException` 을 발생시키면 클라이언트로 정상적인 `ServiceResult` 객체를 전달한다.

클라이언트로 예외가 전파되지 않기 때문에 불필요한 stack-trace가 로그에 남지 않도록 도와주므로 적절히 활용한다. `UserException` 클래스는 상속이 가능하기 때문에 필요에 따라 커스텀하여 사용한다.

## Java Class 에서 UserException 발생시키기

예외 발생이 필요한 부분에서 아래와 같이 작성한다.

```java
throw new UserException("입력값에 문제가 있습니다.");
```

## bpmn 모델에서 UserException 발생시키기

*종료 이벤트*를 *에러 종료 이벤트*로 변경하여 발생시킬 수 있다. 태스크의 결과에 따라 서비스를 중단시키고자 할 때 유용하게 사용할 수 있다.

### 에러 종료 이벤트 설정법

1. *종료 이벤트*를 클릭하고, *랜치* 🔧  모양 버튼을 클릭한 뒤 *Error End Event* 를 선택한다.

![Untitled](Exception/Untitled.png)

1. ① + 버튼을 클릭해서 예외를 추가하고, ② 예외 메시지를 작성한다.

![Untitled](Exception/Untitled%201.png)

<aside>
💡 예외는 서비스 내에서는 재사용 할 수 있으므로 메시지가 같다면 + 버튼 밑의 드롭다운 박스를 클릭하여 원하는 예외를 선택한다.

</aside>

### 메시지 바인딩

입력한 메시지와 컨텍스트의 값을 묶어 최종 메시지를 만드는 기능이다.

 

![Untitled](Exception/Untitled%202.png)

1. 메시지에 바인딩 해야할 부분에 바인딩 표현식 #{변수} 로 입력한다.
2. Extensions 탭에서 input 속성을 설정한다. 

![Untitled](Exception/Untitled%203.png)

예외가 발생했을 때 트랜잭션 처리 방법은 [Transaction](Transaction.md) 페이지를 참고

# 태스크 에러 바운더리 이벤트

특정 태스크에서 발생하는 예외를 잡아 분기시키는 기능이다.

## 태스크에 에러 바운더리 이벤트 붙이기

1. 도구 상자에서 Intermediate/boundary event를 선택한다.
    
    ![Untitled](Exception/Untitled%204.png)
    
2. 태스크의 경계선에 붙인다.
    
    ![Untitled](Exception/Untitled%205.png)
    
3. 이벤트 요소를 클릭하여 나오는 서브 메뉴에서 *랜치* 🔧  모양 버튼 버튼을 선택 후 `Error Boundary Event` 를 선택한다.
    
    ![Untitled](Exception/Untitled%206.png)
    
4. 바운더리 에러 이벤트의 에러를 설정한다. 상세 설정 방법은 [에러 종료 이벤트 설정법](Exception.md) 과 [메시지 바인딩](Exception.md) 을 참조한다.
5. 에러메시지는 요소의 결과값으로 반환된다. 따라서 그 결과값을 이용하여 흐름 분기가 가능하다.
    
    ![Untitled](Exception/Untitled%207.png)
    
6. 바운더리 이벤트에서 흐름을 추가하여 예외 발생시 경로를 설정한다.
    
    ![Untitled](Exception/Untitled%208.png)
    

## 예외 클래스 및 우선순위 지정

에러 바운더리 이벤트가 잡아야할 예외 클래스를 `class` 속성으로 명시적으로 지정한다.

![Untitled](Exception/Untitled%209.png)

태스크에 2개 이상 에러 바운더리 이벤트가 있을 경우 어떤 예외 클래스를 우선적으로 처리할지 우선순위를 지정해야 하는데 `pri` 속성으로 지정한다.

![Untitled](Exception/Untitled%2010.png)