# Process

프로세스의 최상위 모델이다. 프로세스는 프로세스가 가지고 있는 태스크, 이벤트, 게이트웨이, 흐름 등 모든 요소를 보관한다.

## 서비스 어댑터

![Untitled](Process/Untitled.png)

서비스의 최상위 프로세스에 `adapter` 프로퍼티를 설정하면 `ServiceContext`를 기반으로 입력값을 변환할 수 있는 지점을 제공한다.

어댑터는 `oasis.service.ServiceAdapter`를 구현해야 한다.

## 서비스 DTO 생성

![Untitled](Process/Untitled%201.png)

서비스의 최상위 프로세스에 `dto` 프로퍼티를 설정하면 `ServiceContext`를 기반으로 DTO를 생성하여 추가한다.  클래스명의 camelCase로 저장된다.

예) `usercase.dto.ServiceDto`는 `serviceDto` 를 키로하여 저장됨.

# 필요 입력값 설정

![Untitled](Process/Untitled%202.png)

프로세스 속성에 input 항목을 명시하면 서브서비스 호출시 해당 항목을 입력값으로 전달받는다. 서비스 호출을 위한 input과 바라보는 방향이 반대이다.