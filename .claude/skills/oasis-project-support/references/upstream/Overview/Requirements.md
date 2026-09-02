# Requirements

# 실행 환경

- JRE/JDK: Java 17 이상
- 빌드 도구: Gradle 8.12.1 이상 권장
- 컴파일 옵션: `-parameters`

# 주요 의존성

- Spring Framework 7.0.6
- Spring Data JPA 4.0.4
- Hibernate ORM [7.0.5.Final](http://7.0.5.Final)
- Jakarta Persistence API 3.2.0
- MyBatis 3.5.19
- MyBatis-Spring 3.0.4
- Jackson 2.18.2
- Gson 2.12.1
- SLF4J 2.0.16
- Guava 33.4.0-jre

# 빌드

```bash
./gradlew build
```

# 게시 설정

- 저장소 전체 버전은 `5.0.0` 이다.
- Nexus 자격증명은 `NEXUS_USERNAME`, `NEXUS_PASSWORD` 환경 변수 또는 `oasis-core/.secrets.properties` 로 주입한다.
- 게시 설정은 `oasis-core/build.gradle` 의 `publishing` 블록을 기준으로 확인한다.