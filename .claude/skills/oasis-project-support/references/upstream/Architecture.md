# Architecture

## 현재 코드 기준 아키텍처 포인트

- `factories`: 실행 진입점 조립. `SpringServiceStarterFactory`, `NonTransactionalServiceStarterFactory` 가 기본 조합을 만든다.
- `provider`, `loader`, `unmarshal.camunda`: BPMN 문서를 찾고 읽어 서비스/프로세스 모델로 변환한다.
- `process`, `execution`, `executors`: 프로세스 흐름 제어와 요소 실행 위임을 담당한다.
- `context`, `service`, `message`, `transaction`: 런타임 상태, 최종 결과, 메시지 수집, 트랜잭션 경계를 담당한다.
- `model` 패키지는 BPMN 요소를 표현하고, 실행기는 이 모델을 해석하여 동작한다.

# 핵심 인터페이스간 관계

개발자와 설계자가 작성한 모델을 각 계층별 실행기가 컨텍스트를 통해 데이터를 저장하고 공유하며 실행한다.

![](Architecture/Untitled.png)

# 클라이언트 요청 처리 흐름도

클라이언트에서 서비스ID 와 입력값을 서비스 컨텍스트로 전달하면 서비스 실행기가 서비스 ID에 해당하는 서비스 모델을 가져와 프로세스 실행기로 실행을 위임한다.

서비스 실행기는 트랜잭션의 시작과 끝을 관리하고 프로세스 실행기는 프로세스의 흐름을 제어한다. 요소 실행기는 태스크별 특정에 맞추어 적절한 태스크 실행기로 실행을 위임한다.

실행한 결과는 프로세스 컨텍스트에 집중되며 서비스 실행기가 실행 결과를 정리하여 클라이언트로 반환한다.

![](Architecture/Untitled%201.png)