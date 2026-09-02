# mcm-core

MES 공통(마스터데이터·공통 서비스) 도메인을 담는 **공유 코어 라이브러리** 모듈이다.

## 모듈 성격

- `mcm`, `mls`, `mqc`, `mpp` 등 MES 계열 애플리케이션 모듈이 공통으로 의존하는 라이브러리다.
  의존 방향은 항상 `MES 애플리케이션 모듈 → mcm-core` 한 방향이며, 반대 방향 참조는 두지 않는다.
- 실행 가능한 Spring Boot 애플리케이션이 아니라 `java-library` 다. 스프링 스타터·MyBatis 스타터는 `compileOnly`
  로만 참조하고, 데이터소스·트랜잭션 매니저·시큐리티 필터체인 같은 런타임 빈은 **호스트 애플리케이션**(cactus-core
  기반 모듈)이 제공한다.
- JPA 를 기본으로 하되, 복잡한 조회는 MyBatis 매퍼를 함께 쓰는 하이브리드 패턴을 허용한다.
  그래서 `mybatis-spring-boot-starter` 가 `compileOnly` 로 들어 있다.
- `com.dongkuk.dmes:mcm-core` 아티팩트로 발행된다. 발행 저장소 설정은 `build.gradle` 하단에 주석으로 준비돼 있으며,
  자격증명은 반드시 환경변수(`NEXUS_USERNAME` / `NEXUS_PASSWORD`)로 주입한다. **자격증명을 파일에 적지 않는다.**

## sample 패키지는 플레이스홀더다

`com.dongkuk.dmes.mcm.sample` 는 실제 업무 코드가 아니라 **계층 구조 예시**다. 공통 코드(코드그룹–코드값–표시명–
정렬순서–사용여부)라는, MES 공통 마스터에서 가장 흔한 형태를 최소 크기로 보여준다.

```
com.dongkuk.dmes.mcm.<도메인>
├── domain/       JPA 엔티티 (Lombok @Getter/@Builder, 기본 생성자는 PROTECTED)
├── repository/   Spring Data JPA 리포지토리 (복잡 조회는 MyBatis 매퍼 병용)
├── service/      트랜잭션 경계. 클래스는 readOnly, 쓰기 메서드에만 @Transactional
├── dto/          요청·응답 record. 응답은 엔티티를 노출하지 않고 정적 from() 으로 변환
└── controller/   @RestController, URL 은 /api/mcm/<자원명> (케밥케이스 복수형)
```

스키마 변경은 `src/main/resources/db/migration/` 의 Flyway 마이그레이션으로 남긴다. 버전 채번은 방언 간 드리프트를
막기 위해 `/flyway-migration-add` 스킬을 사용한다.

## 새 도메인을 추가할 때

1. `sample` 을 복사하지 말고 위 계층 구조만 따른다. `sample` 패키지는 실제 도메인이 자리를 잡으면 삭제한다.
2. 여러 MES 모듈이 함께 쓰는 것만 이 모듈에 둔다. 한 모듈 전용 로직은 해당 애플리케이션 모듈에 둔다.
3. 엔티티를 추가·변경하면 반드시 짝이 되는 Flyway 마이그레이션을 같은 커밋에 넣는다.
4. 공유 라이브러리인 만큼 계층 의존 규칙이 무너지기 쉽다. 테스트에 ArchUnit 이 포함돼 있으니 패키지 의존 규칙을
   테스트로 고정해 두는 것을 권장한다.

## 빌드

```bash
../gradlew :test        # 단위 테스트
../gradlew :build       # 컴파일 + 테스트 + jar
```

JDK 21 로 빌드한다.
