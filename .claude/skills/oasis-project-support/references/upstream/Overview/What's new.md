# What's new

# 현재 버전 기준

이 페이지는 `~/oasis` 저장소의 최신 소스를 기준으로 정리한 변경 요약이다.

## 5.0.0

- 빌드 기준이 Java 17, Gradle 8.12.1로 올라갔다.
- 기본 의존성이 Spring Framework 7.0.6, Spring Data JPA 4.0.4, Hibernate ORM [7.0.5.Final](http://7.0.5.Final), Jakarta Persistence API 3.2.0, MyBatis 3.5.19, Jackson 2.18.2, Gson 2.12.1, SLF4J 2.0.16 기준으로 정리되었다.
- `SpringServiceStarterFactory`, `NonTransactionalServiceStarterFactory`는 `/services`, `^^`, `NonModifyClassNameResolver`를 기본값으로 사용한다.
- 메시지 태스크는 `messageObject` 또는 `msgObj` 프로퍼티와 `ServiceResult.messages()` 흐름을 기준으로 사용한다.
- 테스트 자산은 병렬 실행, 멀티 데이터소스, 트랜잭션 서브서비스, 사용자 예외, 메시징, test mode까지 포괄한다.

## 문서 읽는 방법

- 오래된 스크린샷이 남아 있는 페이지는 개념 참고용으로 읽고, 버전과 의존성은 이 페이지 및 [Requirements](Requirements.md)를 우선 기준으로 삼는다.
- 예제 코드는 `~/oasis/oasis-core/src/test/java/usecase` 와 `~/oasis/oasis-core/src/test/resources/usecase` 를 우선 참고한다.