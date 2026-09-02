# aps-core

APS(생산계획) 업무 도메인을 담는 **독립 자바 라이브러리** 모듈이다.

## 모듈 성격

- 실행 가능한 Spring Boot 애플리케이션이 아니라 `java-library` 다. 스프링 스타터는 대부분 `compileOnly` 로만
  참조하고, 실제 런타임 빈·데이터소스·시큐리티 설정은 이 라이브러리를 의존하는 **호스트 애플리케이션**이 제공한다.
- `cactus-core` 를 포함한 다른 업무 모듈에 의존하지 않는다. 의존 방향은 항상 `호스트 앱 → aps-core` 한 방향이다.
- `com.dongkuk.dmes:aps-core` 아티팩트로 발행된다. 발행 저장소 설정은 `build.gradle` 하단에 주석으로 준비돼 있으며,
  자격증명은 반드시 환경변수(`NEXUS_USERNAME` / `NEXUS_PASSWORD`)로 주입한다. **자격증명을 파일에 적지 않는다.**
- 상위 컴포지트 빌드(`src/backend/settings.gradle`)에 `includeBuild('aps-core')` 로 포함돼 있어, 로컬에서는
  소스 치환(dependency substitution)으로 바로 참조된다.

## sample 패키지는 플레이스홀더다

`com.dongkuk.dmes.aps.sample` 는 실제 업무 코드가 아니라 **계층 구조 예시**다. 실제 도메인을 추가할 때 이 형태를 따른다.

```
com.dongkuk.dmes.aps.<도메인>
├── domain/       JPA 엔티티 (Lombok @Getter/@Builder, 기본 생성자는 PROTECTED)
├── repository/   Spring Data JPA 리포지토리
├── service/      트랜잭션 경계. 클래스는 readOnly, 쓰기 메서드에만 @Transactional
├── dto/          요청·응답 record. 응답은 엔티티를 노출하지 않고 정적 from() 으로 변환
└── controller/   @RestController, URL 은 /api/aps/<자원명> (케밥케이스 복수형)
```

스키마 변경은 `src/main/resources/db/migration/` 의 Flyway 마이그레이션으로 남긴다. 버전 채번은 방언 간 드리프트를
막기 위해 `/flyway-migration-add` 스킬을 사용한다.

## 새 도메인을 추가할 때

1. `sample` 을 복사하지 말고 위 계층 구조만 따른다. `sample` 패키지는 실제 도메인이 자리를 잡으면 삭제한다.
2. 엔티티를 추가·변경하면 반드시 짝이 되는 Flyway 마이그레이션을 같은 커밋에 넣는다.
3. 서비스는 리포지토리를 목(mock)으로 두는 단위 테스트를 기본으로 하고, 스키마 정합이 중요한 경로는 별도 통합
   테스트로 검증한다.

## 빌드

```bash
../gradlew :test        # 단위 테스트
../gradlew :build       # 컴파일 + 테스트 + jar
```

JDK 21 로 빌드한다.
