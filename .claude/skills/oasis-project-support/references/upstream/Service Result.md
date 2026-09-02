# Service Result

`oasis.service.ServiceStarter` 는 요청한 서비스 ID와 입력값을 이용해서 해당하는 서비스를 찾고 실행하는 핵심 인터페이스이다. 서비스 실행기는 실행결과를  `oasis.service.ServiceResult` 인터페이스로 반환한다. 이 페이지는 서비스 실행결과가 어떻게 담기고 이것을 어떻게 활용하는지에 대한 설명을 한다.

# ServiceResult 인터페이스

서비스 실행결과를 직접 반환할 수 있는 인터페이스이다. 이 인터페이스의 메소드를 이용해서 수행 결과를 다룰 수 있다.

## 서비스 결과 코드

서비스가 정상적으로 수행을 했는지, 프로세스 내에서 임의로 발생시킨 예외가 발생했는지, 그 외 다른 원인으로 발생한 예외가 있는지 알 수 있는 코드이다.

[서비스 결과 코드 목록](Service%20Result/%EC%84%9C%EB%B9%84%EC%8A%A4%20%EA%B2%B0%EA%B3%BC%20%EC%BD%94%EB%93%9C%20%EB%AA%A9%EB%A1%9D.csv)

### 메소드

`oasis.service.ServiceResult#serviceResultCode()`

<aside>
💡 *ServiceStarter*의 구현에 따라 다르지만 OASIS에 기본으로 포함되어 있는 *ServiceStarter*는 `SYSTEM_ERROR` 발생시 예외를 그대로 클라이언트로 전달하기 때문에 클라이언트에서 직접  `SYSTEM_ERROR` 결과 코드를 이용해서 처리 할 수 없다.

</aside>

## 서비스 결과 메시지

서비스 수행 실패(결과 코드 : `USER_ERROR`, `SYSTEM_ERROR`)라면 실패 메시지를 담고 있다.

### 메소드

`oasis.service.ServiceResult#serviceResultMessage()`

## 발생 예외 정보

서비스 수행 실패(결과 코드 : `USER_ERROR`, `SYSTEM_ERROR`)라면 예외 객체를 담고 있다.

### 메소드

`oasis.service.ServiceResult#exception()`

## 서비스 수행 결과 데이터

각 태스크에서 수행한 결과를 담고 있다. 필요한 항목만 가져오거나 모든 결과 데이터를 가져올 수 있는 기능을 제공한다. 

반환 대상은 프로세스 컨텍스트에 등록된 모든 데이터이다. 즉, 태스크에서 명시적으로 출력키를 지정하지 않으면 서비스 수행결과에도 존재하지 않는다.

출력키를 지정하는 방법은 [Properties](Properties.md) 페이지에서 확인

### 메소드

`oasis.service.ServiceResult#results()`

## 태스크 실행 이력

서비스의 시작부터 종료할 때까지 거쳐간 모든 요소 정보를 담고 있다.

### 메소드

`oasis.service.ServiceResult#path()`

# 결과 직렬화 하기

`oasis.service.PlainServiceResult` 는 서비스 수행 결과를 직렬화 하기 쉽도록 도와주는 클래스이다. `oasis.service.ServiceResult` 를 이용해서 초기화 할 수 있으며 서비스 결과를 *json* 포멧으로 반환하는 기능을 가지고 있다.