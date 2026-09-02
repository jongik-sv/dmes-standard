# Cactus - DMES 공통 프레임워크 상세 설계

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터: **ClientKeyFilter**(`X-Backend-Client-Key` 헤더 검증), **RequestIdFilter**(요청 식별자 발급/전파).
> - 신규 AutoConfiguration: **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성), **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - BFF 컨벤션: UI→BFF 는 `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로, REST 는 `/api/{module}/nooasis/` segment 만 제거.
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일 (구 `UI_CLIENT_KEY` 폐기).
> - {CLIENT} 사이트 코드 패키지 컨벤션: `com.dongkuk.dmes.{aps|mpp|mqc|portal}.*`.

## 1. 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Cactus |
| **역할** | DMES 전 모듈이 공유하는 공통 라이브러리 (Backend Common Framework) |
| **기반** | OASIS 5.0.0 (BPMN 워크플로우 엔진) + Spring Boot 4.0.3 + Spring Framework 7.0.6 |
| **Java 버전** | Java 21 (Cactus, 각 모듈, oasis-core 포함) |
| **빌드 도구** | Gradle 8.x |
| **Jakarta EE** | 11 (Servlet 6.1) |
| **배포** | Nexus JAR (`com.dongkuk.dmes:cactus-core`) |
| **사용 모듈** | dmes-portal, dmes-operation, dmes-logistics, dmes-quality, dmes-equipment |

### Java 버전 전략

```
oasis-core (Java 21, Jakarta EE 네이티브)
    │
    │  OASIS 5.0.0부터 Jakarta EE 네이티브 지원
    │
    ▼
Cactus (Java 21)
    │
    ▼
각 MES 모듈 (Java 21 + Spring Boot 4.0)
    │
    ▼
Docker (Eclipse Temurin JRE 21)
```

> OASIS 5.0.0부터 oasis-core가 Jakarta EE 네이티브로 전환되었으므로,
> javax → jakarta 브릿지 의존성이 더 이상 필요하지 않습니다.

### Cactus가 해결하는 문제

각 MES 모듈이 독립 컨테이너로 배포되면서 발생하는 **중복 코드**와 **설정 불일치** 문제를 해결합니다.

```
Without Cactus:
  portal     → OASIS 설정, JWT 필터, 예외처리, DataSource... (직접 구현)
  operation  → OASIS 설정, JWT 필터, 예외처리, DataSource... (복붙)
  logistics  → OASIS 설정, JWT 필터, 예외처리, DataSource... (복붙)
  → 설정 불일치, 버그 전파, 유지보수 지옥

With Cactus:
  portal     → implementation 'com.dongkuk.dmes:cactus-core:1.0.0'  (끝)
  operation  → implementation 'com.dongkuk.dmes:cactus-core:1.0.0'  (끝)
  logistics  → implementation 'com.dongkuk.dmes:cactus-core:1.0.0'  (끝)
  → 공통 로직 한 곳에서 관리
```

---

## 2. 데이터 포맷 개요

> 상세 스펙은 [01-데이터포맷-명세.md](./01-데이터포맷-명세.md) 참조

### 프로토콜 규칙

| 항목 | 규칙 |
|------|------|
| 전송 형식 | JSON (`application/json`) |
| 문자 인코딩 | UTF-8 |
| 날짜 형식 | `yyyy-MM-dd` / 일시: `yyyy-MM-ddTHH:mm:ss` (ISO 8601) |
| 타임존 | `Asia/Seoul` 고정, 서버 기준 로컬 시간 |
| NULL 처리 | 문자열 → `""`, 숫자/날짜/불린 → `null` |
| HTTP Method | 화면 API는 `POST` 원칙, 단순 조회는 `GET` 허용 |
| 인증 토큰 | `Authorization: Bearer {token}` (헤더) |

### CactusRequest 구조

```json
{
  "meta":   { "userId": "user01", "menuId": "SC001" },
  "params": { "plantCd": "P01", "fromDate": "2026-03-01" },
  "grids":  { "master": { "rows": [{ "rowKey": "tmp-a1b2", "rowStatus": "C", ... }] } }
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `meta` | `RequestMeta` | MUST | 요청 메타 (`userId`, `menuId`) |
| `params` | `object` | MAY | 조회 조건, 단건 파라미터 (flat key-value) |
| `grids` | `Record<string, GridData>` | MAY | 그리드 데이터. 각 행은 `rowStatus`(`C`/`U`/`D`) 포함 |

### CactusResponse 구조

```json
{
  "meta":   { "txId": "user01-PROD001-20260323-a7f", "success": true, "code": "0000" },
  "data":   { "totalCount": 150 },
  "grids":  { "master": { "rows": [...] } },
  "errors": [{ "grid": "master", "rowKey": "tmp-a1b2", "code": "E001", "message": "필수값 누락" }]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `meta` | `ResponseMeta` | MUST | `txId`, `success`, `code`, `message` |
| `data` | `object` | MAY | 단건 결과, 처리 건수 등 |
| `grids` | `Record<string, GridResult>` | MAY | 그리드 결과 데이터 |
| `errors` | `array<ErrorDetail>` | MAY | 에러 상세 (실패 시) |

### 표준 액션

| 액션 | URL 패턴 | Request | Response | HTTP |
|------|----------|---------|----------|------|
| 조회 | `/search` | `meta` + `params` | `meta` + `data` + `grids` | 200 |
| 저장 (CUD) | `/save` | `meta` + `params` + `grids` | `meta` + `data` | 200 / 400 |
| 삭제 전용 | `/delete` | `meta` + `grids` | `meta` + `data` | 200 / 400 |
| 단건 상세 | `/detail` | `meta` + `params` | `meta` + `data` + `grids`(MAY) | 200 |

> 커스텀 액션(`/execute`, `/confirm`, `/cancel` 등)도 동일 구조로 자유 정의 가능. 상세는 [01-데이터포맷-명세.md](./01-데이터포맷-명세.md) 6장 참조.

---

## 3. 패키지 구조

> 단일 모듈(`cactus`)로 구성하며, OASIS 통합 계층도 동일 모듈 내 `oasis` 패키지에 포함한다.
> 패키지 루트: `com.dongkuk.dmes.cactus`

```
cactus/
├── build.gradle
├── settings.gradle
├── config/
│   └── checkstyle/
│       ├── checkstyle.xml
│       └── suppressions.xml
└── src/
    ├── main/
    │   ├── java/com/dongkuk/cactus/
    │   │   │
    │   │   ├── autoconfigure/               # ★ Spring Boot 자동 설정
    │   │   │   ├── CactusAutoConfiguration.java
    │   │   │   ├── CactusProperties.java
    │   │   │   ├── OasisAutoConfiguration.java
    │   │   │   ├── SecurityAutoConfiguration.java
    │   │   │   ├── DataSourceAutoConfiguration.java
    │   │   │   ├── MyBatisAutoConfiguration.java
    │   │   │   └── WebAutoConfiguration.java
    │   │   │
    │   │   ├── oasis/                       # ★ OASIS 통합 계층
    │   │   │   ├── OasisController.java           # 공통 컨트롤러 (/api/{group}/{id}/{action})
    │   │   │   ├── OasisServiceExecutor.java      # CactusRequest → OASIS 실행 → CactusResponse
    │   │   │   ├── OasisAutoConfiguration.java    # OASIS Bean 자동 등록
    │   │   │   ├── OasisProperties.java           # OASIS 설정 (service-path, transactional)
    │   │   │   ├── CactusRequestConverter.java    # CactusRequest → Map<String, TypedObject>
    │   │   │   └── CactusResponseConverter.java   # ServiceResult → CactusResponse
    │   │   │
    │   │   ├── security/                    # ★ 인증/인가
    │   │   │   ├── jwt/
    │   │   │   │   ├── JwtTokenProvider.java
    │   │   │   │   ├── JwtAuthenticationFilter.java
    │   │   │   │   ├── JwtProperties.java
    │   │   │   │   └── TokenPair.java
    │   │   │   └── context/
    │   │   │       ├── UserContext.java
    │   │   │       ├── UserContextHolder.java
    │   │   │       └── UserInfo.java
    │   │   │
    │   │   ├── web/                         # ★ 웹 계층 공통
    │   │   │   ├── request/                       # 요청 데이터 포맷
    │   │   │   │   ├── CactusRequest.java         #   표준 요청 래퍼 (meta + params + grids)
    │   │   │   │   ├── RequestMeta.java           #   요청 메타 (userId, menuId)
    │   │   │   │   ├── GridData.java              #   그리드 데이터 (rows)
    │   │   │   │   └── RowStatus.java             #   행 상태 enum (C/U/D/R)
    │   │   │   ├── response/                      # 응답 데이터 포맷
    │   │   │   │   ├── CactusResponse.java        #   표준 응답 래퍼 (meta + data + grids + errors)
    │   │   │   │   ├── ResponseMeta.java          #   응답 메타 (txId, success, code, message)
    │   │   │   │   ├── GridResult.java            #   그리드 결과 (columns, rows)
    │   │   │   │   ├── ColumnMeta.java            #   컬럼 메타 (동적 화면용)
    │   │   │   │   ├── ColumnOption.java          #   콤보 선택 옵션
    │   │   │   │   ├── ErrorDetail.java           #   에러 상세 (grid, rowKey, field, code, message)
    │   │   │   │   ├── ApiResponse.java           #   GET API용 단순 응답 래퍼
    │   │   │   │   └── PageResponse.java          #   페이징 응답
    │   │   │   ├── converter/                     # 데이터 변환
    │   │   │   │   └── GridConverter.java         #   Map<String,Object> ↔ DTO 변환 + "" → null 정규화
    │   │   │   ├── exception/
    │   │   │   │   ├── GlobalExceptionHandler.java
    │   │   │   │   ├── BusinessException.java
    │   │   │   │   ├── UnauthorizedException.java
    │   │   │   │   ├── ForbiddenException.java
    │   │   │   │   └── ErrorCode.java
    │   │   │   ├── filter/
    │   │   │   │   ├── TxIdFilter.java            #   txId 생성 및 MDC 설정
    │   │   │   │   ├── RequestLoggingFilter.java
    │   │   │   │   ├── CorrelationIdFilter.java
    │   │   │   │   └── RequestTimingFilter.java
    │   │   │   └── cors/
    │   │   │       └── CorsConfig.java
    │   │   │
    │   │   ├── datasource/                  # ★ 데이터 접근 계층
    │   │   │   ├── DataSourceConfig.java
    │   │   │   ├── MultiDataSourceRouter.java
    │   │   │   ├── TransactionManagerConfig.java
    │   │   │   └── DataSourceProperties.java
    │   │   │
    │   │   ├── mybatis/                     # ★ MyBatis 공통
    │   │   │   ├── MyBatisConfig.java
    │   │   │   ├── handler/
    │   │   │   │   ├── BooleanTypeHandler.java
    │   │   │   │   ├── LocalDateTimeTypeHandler.java
    │   │   │   │   └── JsonTypeHandler.java
    │   │   │   ├── interceptor/
    │   │   │   │   ├── PaginationInterceptor.java
    │   │   │   │   ├── AuditInterceptor.java
    │   │   │   │   └── SlowQueryInterceptor.java
    │   │   │   └── dialect/
    │   │   │       └── PaginationDialect.java
    │   │   │
    │   │   ├── client/                      # ★ 모듈 간 통신
    │   │   │   ├── ModuleClient.java
    │   │   │   ├── ModuleClientConfig.java
    │   │   │   ├── ModuleClientProperties.java
    │   │   │   ├── JwtPropagatingInterceptor.java
    │   │   │   └── CircuitBreakerClient.java
    │   │   │
    │   │   ├── audit/                       # ★ 감사 추적
    │   │   │   ├── AuditLog.java
    │   │   │   └── AuditLogger.java
    │   │   │
    │   │   ├── cache/                       # ★ 캐시
    │   │   │   ├── CacheConfig.java
    │   │   │   ├── CommonCodeCache.java
    │   │   │   └── CacheNames.java
    │   │   │
    │   │   ├── logging/                     # ★ 로깅
    │   │   │   ├── LoggingConfig.java
    │   │   │   ├── MdcFilter.java
    │   │   │   └── ServiceExecutionLogger.java
    │   │   │
    │   │   └── util/                        # ★ 유틸리티
    │   │       ├── DateUtils.java
    │   │       ├── StringUtils.java
    │   │       ├── MapUtils.java
    │   │       ├── JsonUtils.java
    │   │       ├── TxIdGenerator.java
    │   │       └── MaskingUtils.java
    │   │
    │   └── resources/
    │       ├── META-INF/
    │       │   └── spring/
    │       │       └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
    │       └── cactus-defaults.yml          # 기본 설정값
    │
    └── test/
        ├── java/com/dongkuk/cactus/
        │   ├── web/
        │   │   ├── CactusRequestTest.java
        │   │   ├── CactusResponseTest.java
        │   │   └── GridConverterTest.java
        │   ├── oasis/
        │   │   ├── CactusRequestConverterTest.java
        │   │   ├── CactusResponseConverterTest.java
        │   │   └── OasisServiceExecutorTest.java
        │   ├── security/
        │   ├── mybatis/
        │   └── util/
        │       └── TxIdGeneratorTest.java
        └── resources/
            ├── services/                     # 테스트용 BPMN
            ├── persistence/                 # 테스트용 매퍼
            └── application-test.yml
```

> **Spring Boot 4.x 변경점**: `META-INF/spring.factories` 대신
> `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 파일 사용

---

## 4. build.gradle

```groovy
plugins {
    id 'java-library'
    id 'maven-publish'
    id 'checkstyle'
    id 'com.github.spotbugs' version '5.2.1'
}

group = 'com.dongkuk'
archivesBaseName = 'cactus-core'
version = '1.0.0'

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

repositories {
    maven { url 'http://172.31.1.96:8889/nexus/content/groups/public' }
    mavenCentral()
}

dependencies {
    // ── OASIS 5.0.0 (Jakarta EE 네이티브, Java 21) ──
    api "com.dongkuk:oasis-core:5.0.0"

    // ── Spring Boot 4.0 (Jakarta EE 11, Servlet 6.1, Java 21+) ──
    api 'org.springframework.boot:spring-boot-starter-web:4.0.3'
    api 'org.springframework.boot:spring-boot-starter-validation:4.0.3'
    api 'org.springframework.boot:spring-boot-starter-aop:4.0.3'
    api 'org.springframework.boot:spring-boot-starter-cache:4.0.3'
    api 'org.springframework.boot:spring-boot-autoconfigure:4.0.3'
    annotationProcessor 'org.springframework.boot:spring-boot-configuration-processor:4.0.3'

    // ── Data Access (JPA 기본, MyBatis 옵셔널) ──
    api 'org.springframework.boot:spring-boot-starter-data-jpa:4.0.3'
    compileOnly 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.4'  // 옵셔널
    api 'com.zaxxer:HikariCP:6.2.1'
    // JDBC 드라이버는 Cactus에 포함하지 않음 → 각 모듈에서 선택
    // compileOnly 'com.oracle.database.jdbc:ojdbc11:...'
    // compileOnly 'org.postgresql:postgresql:...'
    // compileOnly 'com.mysql:mysql-connector-j:...'

    // ── Security (jjwt 0.12.x: Java 21 완전 지원) ──
    api 'io.jsonwebtoken:jjwt-api:0.12.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.5'

    // ── Cache ──
    api 'com.github.ben-manes.caffeine:caffeine:3.1.8'

    // ── Utilities ──
    api 'com.google.code.gson:gson:2.12.1'
    api 'com.google.guava:guava:33.4.0-jre'
    api 'org.slf4j:slf4j-api:2.0.16'

    // ── Lombok (선택사항 - Java 21에서 Record 클래스 대안) ──
    compileOnly 'org.projectlombok:lombok:1.18.30'
    annotationProcessor 'org.projectlombok:lombok:1.18.30'

    // ── Test ──
    testImplementation 'org.springframework.boot:spring-boot-starter-test:4.0.3'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.2'
    testImplementation 'org.assertj:assertj-core:3.25.3'
    testImplementation 'org.mockito:mockito-core:5.10.0'
    testImplementation 'com.h2database:h2:2.2.224'
}

// ── Nexus 배포 ──
publishing {
    publications {
        maven(MavenPublication) {
            groupId = 'com.dongkuk'
            artifactId = 'cactus-core'
            from components.java
            artifact sourcesJar
        }
    }
    repositories {
        maven {
            def releasesUrl = 'http://172.31.1.96:8889/nexus/content/repositories/releases'
            def snapshotsUrl = 'http://172.31.1.96:8889/nexus/content/repositories/snapshots'
            url = version.endsWith('SNAPSHOT') ? snapshotsUrl : releasesUrl
            credentials {
                username = project.findProperty('nexusUser') ?: 'admin'
                password = project.findProperty('nexusPassword') ?: ''
            }
        }
    }
}

tasks.register('sourcesJar', Jar) {
    archiveClassifier = 'sources'
    from sourceSets.main.allSource
}

// ── 코드 품질 ──
checkstyle {
    toolVersion = '10.14.0'
    configFile = file("${rootDir}/config/checkstyle/checkstyle.xml")
}

spotbugs {
    toolVersion = '4.8.3'
    excludeFilter = file("${rootDir}/config/spotbugs/exclude.xml")
}

test {
    useJUnitPlatform()
}

// ── Java 21 컴파일러 옵션 ──
tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
    options.compilerArgs += [
        '--add-exports', 'java.base/sun.nio.ch=ALL-UNNAMED',
    ]
}
```

### 의존성 버전 매트릭스

| 라이브러리 | 이전 | 변경 (Java 21) | 변경 사유 |
|-----------|--------------|---------------|----------|
| **Spring Boot** | 2.7.18 | **4.0.3** | Java 21 최소, Jakarta EE 11, Spring Framework 7 |
| **Spring Framework** | 5.3.x | **7.0.6** | Spring Boot 4.0 기반 |
| **Spring Data JPA** | - | **4.0.4** | 기본 데이터 접근 (Hibernate 7.0.5) |
| **MyBatis Starter** | 2.3.2 | **3.0.4** (옵셔널) | Spring Boot 4.x 호환, 필요 시 사용 |
| **HikariCP** | 4.0.3 | **6.2.1** | Java 21+ 최적화 |
| **JDBC Driver** | 각 모듈에서 선택 | 각 모듈에서 선택 | Cactus는 DB 비종속, 모듈이 runtimeOnly로 추가 |
| **JJWT** | 0.9.1 (단일) | **0.12.5** (api/impl/jackson 분리) | Java 21 지원, javax.xml 제거 |
| **H2** | 1.4.200 | **2.2.224** | Java 21 지원 |
| **JUnit** | 5.8.2 | **5.10.2** | Java 21 기능 활용 |
| **Mockito** | 4.11.0 | **5.10.0** | Java 21 sealed class 지원 |
| **Caffeine** | - (신규) | **3.1.8** | 캐시 매니저 |
| **Guava** | 31.1-jre | **33.4.0-jre** | Java 21 최적화 |
| **SLF4J** | 1.7.36 | **2.0.16** | Fluent API, ServiceLoader |
| **Checkstyle** | 9.3 | **10.14.0** | Java 21 문법 지원 |

---

## 5. Spring Boot 자동 설정

### 4.1 AutoConfiguration.imports (Spring Boot 4.x 방식)

```
# src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.dongkuk.dmes.cactus.autoconfigure.CactusAutoConfiguration
com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.SecurityAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.CactusAuthAutoConfiguration         # 신규 (default 비활성, `cactus.auth.enabled: true` 시 활성)
com.dongkuk.dmes.cactus.autoconfigure.CactusWebSecurityAutoConfiguration  # 신규 (default SecurityFilterChain, @ConditionalOnMissingBean)
com.dongkuk.dmes.cactus.autoconfigure.DataSourceAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.MyBatisAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.WebAutoConfiguration
```

> **Spring Boot 4.x 변경점**: `META-INF/spring.factories`는 deprecated.
> 한 줄에 하나씩 FQCN을 기재하는 방식으로 변경되었습니다.

### 4.2 CactusProperties

```java
@ConfigurationProperties(prefix = "cactus")
public class CactusProperties {

    /** 모듈 식별자 (portal, operation, logistics, quality, equipment) */
    private String moduleId;

    /** 모듈 한글명 */
    private String moduleName;

    /** JWT 설정 */
    private JwtProperties jwt = new JwtProperties();

    /** 모듈 간 통신 설정 */
    private ClientProperties client = new ClientProperties();

    /** 감사 로그 설정 */
    private AuditProperties audit = new AuditProperties();

    // ── 중첩 Properties ──
    // OASIS 설정은 별도 OasisProperties (@ConfigurationProperties("cactus.oasis")) 참조

    public static class JwtProperties {
        /** JWT 서명 시크릿 */
        private String secret;
        /** JWT 발급자 */
        private String issuer = "dmes-portal";
        /** Access Token 만료 시간 (초) */
        private long accessTokenExpiry = 28800;  // 8시간
        /** Refresh Token 만료 시간 (초) */
        private long refreshTokenExpiry = 86400; // 24시간
        // getters, setters
    }

    public static class ClientProperties {
        /** 연결 타임아웃 (ms) */
        private int connectTimeout = 3000;
        /** 읽기 타임아웃 (ms) */
        private int readTimeout = 10000;
        /** 모듈별 URL */
        private Map<String, String> moduleUrls = new HashMap<>();
        // moduleUrls.portal = http://dmes-portal:8081
        // moduleUrls.operation = http://dmes-operation:8082
        // getters, setters
    }

    public static class DataSourceProperties {
        /** 페이징 SQL 방언 (auto, oracle, standard) */
        private String dialect = "auto";
        // auto: JDBC URL에서 자동 감지
        // oracle: Oracle ROWNUM 방식
        // standard: LIMIT-OFFSET 방식 (PostgreSQL, MySQL 등)
        // getters, setters
    }

    public static class AuditProperties {
        /** 감사 로그 활성화 */
        private boolean enabled = true;
        /** 감사 로그 저장 방식 (db, log, both) */
        private String target = "both";
        // getters, setters
    }

    // getters, setters
}
```

### 4.3 CactusAutoConfiguration (메인 자동 설정)

```java
@AutoConfiguration  // Spring Boot 4.x: @Configuration 대신 @AutoConfiguration
@EnableConfigurationProperties(CactusProperties.class)
@ComponentScan(basePackages = "com.dongkuk.dmes.cactus")
public class CactusAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CactusAutoConfiguration.class);

    @PostConstruct
    public void init() {
        log.info("╔═══════════════════════════════════════╗");
        log.info("║        Cactus Framework Loaded        ║");
        log.info("║     DMES Common v1.0.0 (Java 21)     ║");
        log.info("╚═══════════════════════════════════════╝");
    }
}
```

### 4.4 OasisAutoConfiguration (OASIS 통합)

> 6장의 OasisAutoConfiguration과 동일. OASIS 공통 컨트롤러 및 변환기를 자동 등록한다.

```java
@Configuration
@ConditionalOnClass(ServiceStarter.class)
@EnableConfigurationProperties(OasisProperties.class)
public class OasisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ServiceStarter serviceStarter() {
        return new NonTransactionalServiceStarterFactory().generateServiceStarter();
    }

    @Bean
    public CactusRequestConverter oasisRequestConverter() {
        return new CactusRequestConverter();
    }

    @Bean
    public CactusResponseConverter oasisResponseConverter() {
        return new CactusResponseConverter();
    }

    @Bean
    public OasisServiceExecutor oasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        return new OasisServiceExecutor(
                serviceStarter, springApplicationContext,
                requestConverter, responseConverter);
    }

    @Bean
    public OasisController oasisController(OasisServiceExecutor executor) {
        return new OasisController(executor);
    }
}
```

### 4.5 각 모듈의 application.yml 사용 예시

```yaml
# dmes-operation/src/main/resources/application.yml
server:
  port: 8082

cactus:
  module-id: operation
  module-name: 조업관리

  oasis:
    service-path: resources/services
    transactional: false

  jwt:
    secret: ${JWT_SECRET}
    issuer: dmes-portal

  client:
    connect-timeout: 3000
    read-timeout: 10000
    module-urls:
      portal: http://${PORTAL_HOST:dmes-portal}:8081
      logistics: http://${LOGISTICS_HOST:dmes-logistics}:8083
      quality: http://${QUALITY_HOST:dmes-quality}:8084

  audit:
    enabled: true
    target: both

spring:
  datasource:
    url: ${DB_URL}                       # 각 모듈에서 DB에 맞게 설정
    username: ${DB_USER}
    password: ${DB_PASS}
    driver-class-name: ${DB_DRIVER}      # 각 모듈에서 JDBC 드라이버 지정
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000

# DB별 설정 예시:
# Oracle:     url=jdbc:oracle:thin:@host:1521:SID  / driver=oracle.jdbc.OracleDriver
# PostgreSQL: url=jdbc:postgresql://host:5432/db    / driver=org.postgresql.Driver
# MySQL:      url=jdbc:mysql://host:3306/db         / driver=com.mysql.cj.jdbc.Driver
```

---

## 6. OASIS 통합 계층 상세

> 상세 설계는 [06-OasisController-상세설계.md](./06-OasisController-상세설계.md) 참조

### 6.1 전체 흐름

```
프론트엔드
  │  POST /api/{serviceGroup}/{serviceId}/{action}
  │  Body: CactusRequest { meta, params, grids }
  ▼
┌─────────────────────────────────────────────────────┐
│  TxIdFilter                                          │
│  → 임시 UUID를 MDC["txId"]에 설정                    │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OasisController                                     │
│  @PostMapping("/{serviceGroup}/{serviceId}/{action}")│
│  → executor.execute(serviceGroup, serviceId,         │
│                      action, request)                │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OasisServiceExecutor                                │
│                                                      │
│  1. txId 생성 (userId-menuId-yyyyMMddHHmmss-xxx)    │
│  2. MDC["txId"] 교체 (임시 UUID → 정식 txId)         │
│  3. CactusRequestConverter.convert()                 │
│     → CactusRequest → Map<String, TypedObject>       │
│  4. ServiceContext 생성                               │
│     → SpringApplicationContext + TypedObject Map      │
│  5. serviceStarter.start(serviceId, serviceContext)   │
│     → OASIS BPMN 서비스 실행                          │
│  6. CactusResponseConverter.convert()                │
│     → ServiceResult → CactusResponse                 │
│  7. 예외 처리                                         │
│     → BusinessException, OASIS 예외 → 에러 응답       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OASIS Core (oasis-core:5.0.0)                       │
│                                                      │
│  ServiceStarter → ProcessStarter → ElementExecutor   │
│  → Executable (Java/SQL/Procedure/SubProcess)        │
│  → FlowPicker → 다음 Element                        │
│  → ServiceResult 반환                                │
└─────────────────────────────────────────────────────┘
```

### 6.2 OasisController

```java
/**
 * OASIS 공통 컨트롤러.
 * 모든 MES 화면 API를 단일 엔드포인트로 처리한다.
 *
 * URL: POST /api/{serviceGroup}/{serviceId}/{action}
 *  - serviceGroup: 논리적 분류 (라우팅에는 미사용, 로깅/감사용)
 *  - serviceId: BPMN 프로세스 ID와 매핑
 *  - action: ServiceContext에 전달 → BPMN 게이트웨이에서 분기
 */
@RestController
@RequestMapping("/api")
public class OasisController {

    private final OasisServiceExecutor executor;

    public OasisController(OasisServiceExecutor executor) {
        this.executor = executor;
    }

    @PostMapping("/{serviceGroup}/{serviceId}/{action}")
    public CactusResponse handle(
            @RequestBody CactusRequest request,
            @PathVariable String serviceGroup,
            @PathVariable String serviceId,
            @PathVariable String action) {

        return executor.execute(serviceGroup, serviceId, action, request);
    }
}
```

### 6.3 OasisServiceExecutor

```java
/**
 * CactusRequest → OASIS 서비스 실행 → CactusResponse 전체 흐름을 담당한다.
 *
 * 책임:
 * 1. txId 생성 및 MDC 교체
 * 2. CactusRequest → OASIS 입력 변환 (CactusRequestConverter)
 * 3. OASIS ServiceStarter를 통한 BPMN 서비스 실행
 * 4. OASIS ServiceResult → CactusResponse 변환 (CactusResponseConverter)
 * 5. 예외 처리 및 에러 응답 생성
 */
public class OasisServiceExecutor {

    private static final Logger log = LoggerFactory.getLogger(OasisServiceExecutor.class);

    private final ServiceStarter serviceStarter;
    private final ApplicationContext springApplicationContext;
    private final CactusRequestConverter requestConverter;
    private final CactusResponseConverter responseConverter;

    public OasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        this.serviceStarter = serviceStarter;
        this.springApplicationContext = springApplicationContext;
        this.requestConverter = requestConverter;
        this.responseConverter = responseConverter;
    }

    public CactusResponse execute(
            String serviceGroup, String serviceId, String action, CactusRequest request) {

        RequestMeta reqMeta = request.getMeta();
        String txId = TxIdGenerator.generate(reqMeta.getUserId(), reqMeta.getMenuId());

        // MDC의 임시 UUID를 정식 txId로 교체
        MDC.put("txId", txId);

        log.info("{}/{}/{}", serviceGroup, serviceId, action);

        try {
            // 1. CactusRequest → Map<String, TypedObject>
            Map<String, TypedObject> inputs = requestConverter.convert(request, action);

            // 2. ServiceContext 생성
            com.dongkuk.oasis.context.ApplicationContext oasisAppCtx =
                    new SpringApplicationContext(springApplicationContext);
            ServiceContext sc = new DefaultServiceContext(oasisAppCtx, inputs);

            // 3. OASIS BPMN 서비스 실행
            ServiceResult result = serviceStarter.start(serviceId, sc);

            // 4. ServiceResult → CactusResponse
            return responseConverter.convert(result, txId);

        } catch (BusinessException e) {
            log.warn("[{}] BusinessException: {}", txId, e.getMessage());
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, e.getErrorCode().getCode(), e.getMessage()))
                    .errors(e.getErrors())
                    .build();

        } catch (Exception e) {
            log.error("[{}] Unexpected error", txId, e);
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, ErrorCode.UNKNOWN_ERROR.getCode(), e.getMessage()))
                    .build();
        }
    }
}
```

### 6.4 CactusRequestConverter

```java
/**
 * CactusRequest → Map<String, TypedObject> 변환기.
 *
 * 변환 규칙:
 * - action → TypedObject("action")
 * - meta.userId → TypedObject("userId")
 * - meta.menuId → TypedObject("menuId")
 * - params의 각 key-value → TypedObject(key)
 * - grids의 각 gridId → TypedObject(gridId) : List<Map<String, Object>>
 */
public class CactusRequestConverter {

    public Map<String, TypedObject> convert(CactusRequest request, String action) {
        Map<String, TypedObject> map = new HashMap<>();

        // action (BPMN 게이트웨이 분기용)
        map.put("action", new TypedObject(action));

        // meta
        RequestMeta meta = request.getMeta();
        if (meta != null) {
            map.put("userId", new TypedObject(meta.getUserId()));
            map.put("menuId", new TypedObject(meta.getMenuId()));
        }

        // params → flat 전개
        if (request.getParams() != null) {
            request.getParams().forEach((key, value) ->
                    map.put(key, new TypedObject(value)));
        }

        // grids → gridId: List<Map> 형태로 전달
        if (request.getGrids() != null) {
            request.getGrids().forEach((gridId, gridData) ->
                    map.put(gridId, new TypedObject(gridData.getRows())));
        }

        return map;
    }
}
```

### 6.5 CactusResponseConverter

```java
/**
 * ServiceResult → CactusResponse 변환기.
 *
 * 변환 규칙:
 * - SUCCESS → results 중 List 타입은 grids, 단일 값은 data에 매핑
 * - USER_ERROR → meta.success=false, code="E001"
 * - SYSTEM_ERROR → meta.success=false, code="S001"
 */
public class CactusResponseConverter {

    public CactusResponse convert(ServiceResult result, String txId) {
        if (result.serviceResultCode() == ServiceResultCode.SUCCESS) {
            return convertSuccess(result, txId);
        } else {
            return convertError(result, txId);
        }
    }

    @SuppressWarnings("unchecked")
    private CactusResponse convertSuccess(ServiceResult result, String txId) {
        Map<String, Object> data = new HashMap<>();
        Map<String, GridResult> grids = new HashMap<>();

        if (result.results() != null) {
            result.results().forEach((key, typedObject) -> {
                Object value = typedObject.getObject();
                if (value instanceof List) {
                    grids.put(key, new GridResult((List<Map<String, Object>>) value));
                } else {
                    data.put(key, value);
                }
            });
        }

        CactusResponse.Builder builder = new CactusResponse.Builder(ResponseMeta.success(txId));
        if (!data.isEmpty()) builder.data(data);
        if (!grids.isEmpty()) builder.grids(grids);
        return builder.build();
    }

    private CactusResponse convertError(ServiceResult result, String txId) {
        String code = (result.serviceResultCode() == ServiceResultCode.USER_ERROR)
                ? "E001" : "S001";
        String message = result.serviceResultMessage() != null
                ? result.serviceResultMessage()
                : "오류가 발생했습니다.";

        return new CactusResponse.Builder(ResponseMeta.error(txId, code, message)).build();
    }
}
```

### 6.6 OasisAutoConfiguration

```java
/**
 * OASIS 통합 자동 설정.
 * oasis-core가 classpath에 있을 때만 활성화된다.
 */
@Configuration
@ConditionalOnClass(ServiceStarter.class)
@EnableConfigurationProperties(OasisProperties.class)
public class OasisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ServiceStarter serviceStarter() {
        return new NonTransactionalServiceStarterFactory().generateServiceStarter();
    }

    @Bean
    public CactusRequestConverter oasisRequestConverter() {
        return new CactusRequestConverter();
    }

    @Bean
    public CactusResponseConverter oasisResponseConverter() {
        return new CactusResponseConverter();
    }

    @Bean
    public OasisServiceExecutor oasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        return new OasisServiceExecutor(
                serviceStarter, springApplicationContext,
                requestConverter, responseConverter);
    }

    @Bean
    public OasisController oasisController(OasisServiceExecutor executor) {
        return new OasisController(executor);
    }
}
```

### 6.7 OasisProperties

```java
@ConfigurationProperties(prefix = "cactus.oasis")
public class OasisProperties {

    /** BPMN 서비스 정의 파일 경로 */
    private String servicePath = "resources/services";

    /** 트랜잭션 사용 여부 */
    private boolean transactional = false;

    public String getServicePath() { return servicePath; }
    public void setServicePath(String servicePath) { this.servicePath = servicePath; }

    public boolean isTransactional() { return transactional; }
    public void setTransactional(boolean transactional) { this.transactional = transactional; }
}
```

### 6.8 클래스 관계도

```
┌─────────────────────────────────────────────────────────────────┐
│  com.dongkuk.dmes.cactus.oasis                                       │
│                                                                  │
│  ┌──────────────┐      ┌────────────────────┐                   │
│  │OasisController│─────→│OasisServiceExecutor │                   │
│  │  (HTTP 매핑)  │      │  (실행 오케스트레이터)│                   │
│  └──────────────┘      └──────┬───┬─────────┘                   │
│                               │   │                              │
│              ┌────────────────┘   └────────────────┐             │
│              ▼                                      ▼             │
│  ┌─────────────────────┐          ┌──────────────────────────┐  │
│  │CactusRequestConverter│          │CactusResponseConverter    │  │
│  │  CactusRequest       │          │  ServiceResult            │  │
│  │  → Map<TypedObject>  │          │  → CactusResponse         │  │
│  └─────────────────────┘          └──────────────────────────┘  │
│                                                                  │
│  ┌───────────────────┐  ┌──────────────┐                        │
│  │OasisAutoConfig     │  │OasisProperties│                        │
│  │  (Bean 등록)       │  │  (설정값)     │                        │
│  └───────────────────┘  └──────────────┘                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  OASIS Core (oasis-core:5.0.0)                                   │
│                                                                  │
│  ServiceStarter ← DefaultServiceContext ← SpringApplicationContext│
│       │                                                          │
│       ▼                                                          │
│  CoreServiceStarter → CoreProcessStarter → CoreElementExecutor   │
│       │                                                          │
│       ▼                                                          │
│  ServiceResult (SUCCESS / USER_ERROR / SYSTEM_ERROR)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 인증/인가 상세

### 6.1 JWT 흐름

```
[발급 - Portal 모듈만]
Login → Portal → JwtTokenProvider.generateTokenPair()
                   → accessToken  (8시간, 사용자정보 포함)
                   → refreshToken (24시간, userId만)
                 → Next.js BFF로 반환
                 → httpOnly 쿠키 저장

[검증 - 모든 모듈 공통]
요청 → JwtAuthenticationFilter
         → Authorization 헤더에서 Bearer 토큰 추출
         → JwtTokenProvider.validateToken() 검증
         → UserInfo 파싱
         → UserContextHolder에 저장 (ThreadLocal)
         → Controller에서 UserContextHolder.get()으로 접근
```

### 6.2 UserInfo (Java 21 Record)

```java
/**
 * JWT에서 추출한 사용자 정보.
 * Java 21 record로 불변 보장 + ThreadLocal 환경 안전.
 */
public record UserInfo(
    String userId,       // 사용자 ID (USER_ID)
    String userNm,       // 사용자명 (USER_NM)
    String userEmpNo     // 사번 (USER_EMP_NO)
) {}
```

### 6.3 TokenPair (Java 21 Record)

```java
/**
 * JWT 토큰 쌍 (Access + Refresh).
 */
public record TokenPair(
    String accessToken,
    String refreshToken
) {}
```

### 6.4 JwtTokenProvider (JJWT 0.12.x API)

```java
@Component
public class JwtTokenProvider {

    private final CactusProperties.JwtProperties jwtProperties;
    private SecretKey secretKey;

    public JwtTokenProvider(CactusProperties properties) {
        this.jwtProperties = properties.getJwt();
    }

    @PostConstruct
    void init() {
        // JJWT 0.12: byte[] → SecretKey 변환
        byte[] keyBytes = Decoders.BASE64.decode(jwtProperties.getSecret());
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * 토큰 쌍 생성 (Portal 모듈에서만 사용)
     */
    public TokenPair generateTokenPair(UserInfo userInfo) {
        var now = Instant.now();

        String accessToken = Jwts.builder()
            .subject(userInfo.userId())
            .claim("userNm", userInfo.userNm())
            .claim("userEmpNo", userInfo.userEmpNo())
            .issuer(jwtProperties.getIssuer())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(jwtProperties.getAccessTokenExpiry())))
            .signWith(secretKey)
            .compact();

        String refreshToken = Jwts.builder()
            .subject(userInfo.userId())
            .issuer(jwtProperties.getIssuer())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(jwtProperties.getRefreshTokenExpiry())))
            .signWith(secretKey)
            .compact();

        return new TokenPair(accessToken, refreshToken);
    }

    /**
     * 토큰 검증 및 UserInfo 추출 (모든 모듈에서 사용)
     */
    public UserInfo validateAndExtract(String token) {
        var claims = Jwts.parser()
            .verifyWith(secretKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();

        return new UserInfo(
            claims.getSubject(),
            claims.get("userNm", String.class),
            claims.get("userEmpNo", String.class)
        );
    }
}
```

### 6.5 JwtAuthenticationFilter (Jakarta Servlet)

```java
/**
 * 모든 /api/** 요청에 대해 JWT를 검증하는 필터.
 * Spring Boot 4.x → jakarta.servlet 사용.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;

    // Jakarta Servlet: jakarta.servlet.http.HttpServletRequest
    private static final List<String> SKIP_PATHS = List.of(
        "/api/portal/auth/login",
        "/api/portal/auth/refresh",
        "/actuator/health"
    );

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(
            jakarta.servlet.http.HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse response,
            jakarta.servlet.FilterChain chain
    ) throws jakarta.servlet.ServletException, java.io.IOException {

        String path = request.getRequestURI();

        // 인증 제외 경로
        if (SKIP_PATHS.stream().anyMatch(path::startsWith)) {
            chain.doFilter(request, response);
            return;
        }

        // Authorization 헤더에서 토큰 추출
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            sendError(response, 401, "토큰이 없습니다");
            return;
        }

        try {
            String token = header.substring(7);
            UserInfo userInfo = tokenProvider.validateAndExtract(token);
            UserContextHolder.set(userInfo);
            JwtTokenHolder.set(token);  // 모듈 간 전파용

            chain.doFilter(request, response);
        } catch (io.jsonwebtoken.ExpiredJwtException e) {
            sendError(response, 401, "토큰이 만료되었습니다");
        } catch (io.jsonwebtoken.JwtException e) {
            sendError(response, 401, "유효하지 않은 토큰입니다");
        } finally {
            UserContextHolder.clear();
            JwtTokenHolder.clear();
        }
    }

    private void sendError(jakarta.servlet.http.HttpServletResponse response,
                           int status, String message) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(
            """
            {"success":false,"errorCode":"A001","message":"%s"}
            """.formatted(message)  // Java 21 text block + formatted
        );
    }
}
```

### 6.6 UserContextHolder

```java
/**
 * ThreadLocal 기반 사용자 컨텍스트.
 * 필터에서 세팅, Controller/Service/BPMN Task 어디서든 접근 가능.
 */
public final class UserContextHolder {

    private static final ThreadLocal<UserInfo> HOLDER = new ThreadLocal<>();

    private UserContextHolder() {} // 인스턴스 생성 방지

    public static void set(UserInfo userInfo) {
        HOLDER.set(userInfo);
    }

    public static UserInfo get() {
        return HOLDER.get();
    }

    /** 현재 사용자 ID (null-safe) */
    public static String getUserId() {
        var info = HOLDER.get();
        return info != null ? info.userId() : "SYSTEM";
    }

    public static void clear() {
        HOLDER.remove();
    }
}
```

---

## 8. 웹 계층 공통 상세

### 7.1 ApiResponse (Java 21 Record + sealed 활용)

```java
/**
 * 모든 API의 통일된 응답 형태.
 *
 * 성공: { "success": true,  "data": {...}, "message": null }
 * 실패: { "success": false, "data": null,  "message": "에러 메시지", "errorCode": "B001" }
 */
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode,
    String timestamp,
    String correlationId
) {
    public ApiResponse {
        // compact constructor
        if (timestamp == null) {
            timestamp = LocalDateTime.now().toString();
        }
        if (correlationId == null) {
            correlationId = CorrelationIdHolder.getId();
        }
    }

    // ── 팩토리 메서드 ──

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, null, null, null);
    }

    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, data, message, null, null, null);
    }

    public static ApiResponse<?> error(String errorCode, String message) {
        return new ApiResponse<>(false, null, message, errorCode, null, null);
    }

    public static ApiResponse<?> error(ErrorCode errorCode) {
        return new ApiResponse<>(false, null, errorCode.getMessage(),
            errorCode.getCode(), null, null);
    }
}
```

### 7.2 PageResponse (Java 21 Record)

```java
/**
 * 그리드 조회용 페이징 응답.
 */
public record PageResponse<T>(
    List<T> list,
    long totalCount,
    int pageNo,
    int pageSize,
    int totalPages
) {
    @SuppressWarnings("unchecked")
    public static <T> PageResponse<T> of(Object listData, long totalCount,
                                          PageRequest pageRequest) {
        List<T> list = listData instanceof List<?> l ? (List<T>) l : List.of();
        int totalPages = (int) Math.ceil((double) totalCount / pageRequest.pageSize());
        return new PageResponse<>(list, totalCount,
            pageRequest.pageNo(), pageRequest.pageSize(), totalPages);
    }
}
```

### 7.3 PageRequest (Java 21 Record)

```java
/**
 * 프론트엔드에서 전달하는 페이징 요청.
 */
public record PageRequest(
    @Min(1) int pageNo,
    @Min(1) @Max(1000) int pageSize
) {
    public PageRequest {
        if (pageNo <= 0) pageNo = 1;
        if (pageSize <= 0) pageSize = 20;
    }

    /** 기본값 생성 */
    public PageRequest() {
        this(1, 20);
    }

    /** MyBatis SQL에서 사용할 OFFSET 계산 */
    public int offset() {
        return (pageNo - 1) * pageSize;
    }
}
```

### 7.4 ErrorCode

```java
public enum ErrorCode {

    // ── 공통 (C) ──
    SUCCESS("C000", "성공"),
    INTERNAL_ERROR("C001", "내부 서버 오류가 발생했습니다"),
    INVALID_PARAMETER("C002", "잘못된 요청 파라미터입니다"),
    DATA_NOT_FOUND("C003", "데이터를 찾을 수 없습니다"),
    DUPLICATE_DATA("C004", "중복된 데이터입니다"),

    // ── 인증/인가 (A) ──
    UNAUTHORIZED("A001", "인증이 필요합니다"),
    TOKEN_EXPIRED("A002", "토큰이 만료되었습니다"),
    INVALID_TOKEN("A003", "유효하지 않은 토큰입니다"),
    FORBIDDEN("A004", "접근 권한이 없습니다"),

    // ── 비즈니스 (B) ──
    BUSINESS_ERROR("B001", "업무 처리 중 오류가 발생했습니다"),
    SERVICE_EXECUTION_ERROR("B002", "서비스 실행 중 오류가 발생했습니다"),
    VALIDATION_FAILED("B003", "데이터 검증에 실패했습니다"),

    // ── 외부 연동 (E) ──
    MODULE_CALL_FAILED("E001", "모듈 간 통신에 실패했습니다"),
    MODULE_TIMEOUT("E002", "모듈 간 통신 시간이 초과되었습니다");

    private final String code;
    private final String message;

    ErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }

    public String getCode() { return code; }
    public String getMessage() { return message; }
}
```

### 7.5 GlobalExceptionHandler

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 비즈니스 예외 (사용자에게 메시지 노출) */
    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<?> handleBusiness(BusinessException e) {
        log.warn("[Business] {}: {}", e.getErrorCode(), e.getMessage());
        return ApiResponse.error(e.getErrorCode().getCode(), e.getMessage());
    }

    /** 인증 실패 */
    @ExceptionHandler(UnauthorizedException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ApiResponse<?> handleUnauthorized(UnauthorizedException e) {
        return ApiResponse.error(ErrorCode.UNAUTHORIZED);
    }

    /** 권한 없음 */
    @ExceptionHandler(ForbiddenException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ApiResponse<?> handleForbidden(ForbiddenException e) {
        return ApiResponse.error(ErrorCode.FORBIDDEN);
    }

    /** 파라미터 검증 실패 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<?> handleValidation(MethodArgumentNotValidException e) {
        var message = e.getBindingResult().getFieldErrors().stream()
            .map(fe -> "%s: %s".formatted(fe.getField(), fe.getDefaultMessage()))
            .collect(Collectors.joining(", "));
        return ApiResponse.error(ErrorCode.VALIDATION_FAILED.getCode(), message);
    }

    /** 예상치 못한 예외 (내부 메시지 숨김) */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<?> handleUnexpected(Exception e) {
        log.error("[Unexpected] ", e);
        return ApiResponse.error(ErrorCode.INTERNAL_ERROR);
    }
}
```

### 7.6 BusinessException

```java
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public static BusinessException of(String message) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, message);
    }

    public ErrorCode getErrorCode() { return errorCode; }
}
```

---

## 9. 웹 필터 상세

### 8.1 CorrelationIdFilter (요청 추적)

```java
/**
 * 모든 요청에 고유 Correlation ID를 부여.
 * BFF에서 전달된 X-Correlation-Id가 있으면 사용, 없으면 생성.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    private static final String HEADER_NAME = "X-Correlation-Id";

    @Override
    protected void doFilterInternal(
            jakarta.servlet.http.HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse response,
            jakarta.servlet.FilterChain chain
    ) throws jakarta.servlet.ServletException, java.io.IOException {

        var correlationId = request.getHeader(HEADER_NAME);
        if (correlationId == null || correlationId.isEmpty()) {
            correlationId = UUID.randomUUID().toString().substring(0, 8);
        }

        CorrelationIdHolder.set(correlationId);
        MDC.put("correlationId", correlationId);
        response.setHeader(HEADER_NAME, correlationId);

        try {
            chain.doFilter(request, response);
        } finally {
            CorrelationIdHolder.clear();
            MDC.remove("correlationId");
        }
    }
}
```

### 8.2 RequestLoggingFilter

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("API_ACCESS");

    @Override
    protected void doFilterInternal(
            jakarta.servlet.http.HttpServletRequest request,
            jakarta.servlet.http.HttpServletResponse response,
            jakarta.servlet.FilterChain chain
    ) throws jakarta.servlet.ServletException, java.io.IOException {

        long start = System.currentTimeMillis();
        chain.doFilter(request, response);
        long elapsed = System.currentTimeMillis() - start;

        log.info("[{}] {} {} → {} (user={}, {}ms)",
            request.getMethod(),
            request.getRequestURI(),
            request.getQueryString() != null ? "?" + request.getQueryString() : "",
            response.getStatus(),
            UserContextHolder.getUserId(),
            elapsed);
    }
}
```

---

## 10. 데이터 접근 계층 상세

### 9.1 DataSource 구성

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public DataSource dataSource() {
        return DataSourceBuilder.create()
            .type(HikariDataSource.class)
            .build();
    }

    @Bean
    @Primary
    public PlatformTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }
}
```

### 9.2 SQL 작성 규칙

> MyBatis Mapper XML 작성 시 **ANSI 표준 SQL을 최우선**으로 사용한다 (MUST). DB 벤더 고유 함수/문법은 ANSI 표준으로 대체할 수 없는 경우에만 허용한다.

### 9.3 MyBatis 공통 설정

```java
@Configuration
public class MyBatisConfig {

    @Bean
    public SqlSessionFactory sqlSessionFactory(DataSource dataSource) throws Exception {
        var factory = new SqlSessionFactoryBean();
        factory.setDataSource(dataSource);

        // 매퍼 XML 경로
        factory.setMapperLocations(new PathMatchingResourcePatternResolver()
            .getResources("resources/persistence/**/*.xml"));

        // MyBatis 설정
        var config = new org.apache.ibatis.session.Configuration();
        config.setMapUnderscoreToCamelCase(true);
        config.setCallSettersOnNulls(true);
        config.setJdbcTypeForNull(JdbcType.NULL);

        // TypeHandler
        config.getTypeHandlerRegistry().register(BooleanTypeHandler.class);
        config.getTypeHandlerRegistry().register(LocalDateTimeTypeHandler.class);

        factory.setConfiguration(config);

        // Interceptor (PaginationDialect는 JDBC URL에서 자동 감지)
        factory.setPlugins(
            new PaginationInterceptor(resolvePaginationDialect(properties)),
            new AuditInterceptor(),
            new SlowQueryInterceptor(3000)
        );

        return factory.getObject();
    }
}
```

### 9.4 PaginationInterceptor (DB 비종속 페이징)

```java
/**
 * MyBatis Interceptor로 페이징을 자동 처리.
 * DB 종류에 따라 적절한 페이징 SQL로 래핑한다.
 *
 * 파라미터에 _pageNo, _pageSize가 있으면 자동 변환:
 *
 * [원본]  SELECT * FROM TB_WORK_ORDER WHERE ...
 *
 * [Oracle]
 *   SELECT * FROM (
 *     SELECT A.*, ROWNUM AS RN FROM ( 원본SQL ) A WHERE ROWNUM <= _offset + _pageSize
 *   ) WHERE RN > _offset
 *
 * [PostgreSQL / MySQL]
 *   원본SQL LIMIT #{_pageSize} OFFSET #{_offset}
 */
@Intercepts({
    @Signature(type = StatementHandler.class, method = "prepare",
               args = {Connection.class, Integer.class})
})
public class PaginationInterceptor implements Interceptor {

    private final PaginationDialect dialect;

    public PaginationInterceptor(PaginationDialect dialect) {
        this.dialect = dialect;
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        var handler = (StatementHandler) invocation.getTarget();
        var boundSql = handler.getBoundSql();

        if (boundSql.getParameterObject() instanceof Map<?, ?> params) {
            if (params.containsKey("_pageNo") && params.containsKey("_pageSize")) {
                var originalSql = boundSql.getSql();
                var pagedSql = dialect.wrapPagination(originalSql);
                setFieldValue(boundSql, "sql", pagedSql);
            }
        }

        return invocation.proceed();
    }
}

/**
 * DB별 페이징 SQL 생성 전략 (Strategy Pattern).
 * cactus.datasource.dialect 설정값으로 자동 선택된다.
 */
public interface PaginationDialect {
    String wrapPagination(String sql);
}

/** Oracle: ROWNUM 방식 */
public class OraclePaginationDialect implements PaginationDialect {
    @Override
    public String wrapPagination(String sql) {
        return """
            SELECT * FROM (
              SELECT A.*, ROWNUM AS RN FROM (
                %s
              ) A WHERE ROWNUM <= #{_offset} + #{_pageSize}
            ) WHERE RN > #{_offset}
            """.formatted(sql);
    }
}

/** PostgreSQL / MySQL: LIMIT-OFFSET 방식 */
public class StandardPaginationDialect implements PaginationDialect {
    @Override
    public String wrapPagination(String sql) {
        return "%s LIMIT #{_pageSize} OFFSET #{_offset}".formatted(sql);
    }
}
```

### 9.5 AuditInterceptor (감사 필드 자동 채움)

```java
/**
 * INSERT/UPDATE 시 감사 필드를 자동으로 채운다.
 *
 * INSERT: CREATE_USER_ID, CREATE_DATE, UPDATE_USER_ID, UPDATE_DATE
 * UPDATE: UPDATE_USER_ID, UPDATE_DATE
 */
@Intercepts({
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
public class AuditInterceptor implements Interceptor {

    @Override
    @SuppressWarnings("unchecked")
    public Object intercept(Invocation invocation) throws Throwable {
        var ms = (MappedStatement) invocation.getArgs()[0];
        var param = invocation.getArgs()[1];

        if (param instanceof Map<?, ?> rawMap) {
            var map = (Map<String, Object>) rawMap;
            var userId = UserContextHolder.getUserId();
            var now = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));

            if (ms.getSqlCommandType() == SqlCommandType.INSERT) {
                map.putIfAbsent("createUserId", userId);
                map.putIfAbsent("createDate", now);
            }
            map.put("updateUserId", userId);
            map.put("updateDate", now);
        }

        return invocation.proceed();
    }
}
```

### 9.6 SlowQueryInterceptor

```java
@Intercepts({
    @Signature(type = StatementHandler.class, method = "query",
               args = {java.sql.Statement.class, ResultHandler.class})
})
public class SlowQueryInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger("SLOW_QUERY");
    private final long thresholdMs;

    public SlowQueryInterceptor(long thresholdMs) {
        this.thresholdMs = thresholdMs;
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        long start = System.currentTimeMillis();
        var result = invocation.proceed();
        long elapsed = System.currentTimeMillis() - start;

        if (elapsed > thresholdMs) {
            var handler = (StatementHandler) invocation.getTarget();
            var sql = handler.getBoundSql().getSql().replaceAll("\\s+", " ").trim();
            log.warn("[SLOW] {}ms | {}", elapsed, sql);
        }

        return result;
    }
}
```

---

## 11. 모듈 간 통신 상세

### 10.1 ModuleClient (RestClient 사용 - Spring 7.1+)

```java
/**
 * 모듈 간 REST 호출의 기본 클래스.
 * Spring 7.1의 RestClient 사용 (RestTemplate 후속).
 *
 * 사용 예시 (dmes-operation에서):
 *   @Component
 *   public class LogisticsModuleClient extends ModuleClient {
 *       public LogisticsModuleClient(ModuleClientConfig config) {
 *           super(config, "logistics");
 *       }
 *       public InventoryDto getInventory(String itemCode) {
 *           return get("/api/logistics/inventory/" + itemCode, InventoryDto.class);
 *       }
 *   }
 */
public abstract class ModuleClient {

    private final RestClient restClient;
    private final String moduleName;
    private static final Logger log = LoggerFactory.getLogger(ModuleClient.class);

    protected ModuleClient(ModuleClientConfig config, String moduleName) {
        this.moduleName = moduleName;
        var baseUrl = config.getModuleUrl(moduleName);

        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("Content-Type", "application/json")
            .requestInterceptor(new JwtPropagatingInterceptor())
            .build();
    }

    protected <T> T get(String path, Class<T> responseType) {
        try {
            return restClient.get()
                .uri(path)
                .retrieve()
                .body(responseType);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.MODULE_CALL_FAILED,
                "[%s] GET %s 실패: %s".formatted(moduleName, path, e.getMessage()));
        }
    }

    protected <T> T post(String path, Object body, Class<T> responseType) {
        try {
            return restClient.post()
                .uri(path)
                .body(body)
                .retrieve()
                .body(responseType);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.MODULE_CALL_FAILED,
                "[%s] POST %s 실패: %s".formatted(moduleName, path, e.getMessage()));
        }
    }
}
```

### 10.2 JwtPropagatingInterceptor

```java
/**
 * 모듈 간 REST 호출 시 JWT + Correlation ID를 자동 전파.
 */
public class JwtPropagatingInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body,
                                         ClientHttpRequestExecution execution)
            throws IOException {
        var headers = request.getHeaders();

        // JWT 전파
        var token = JwtTokenHolder.get();
        if (token != null) {
            headers.setBearerAuth(token);
        }

        // Correlation ID 전파
        var correlationId = CorrelationIdHolder.get();
        if (correlationId != null) {
            headers.set("X-Correlation-Id", correlationId);
        }

        return execution.execute(request, body);
    }
}
```

### 10.3 ModuleClientConfig

```java
@Configuration
@EnableConfigurationProperties(CactusProperties.class)
public class ModuleClientConfig {

    private final CactusProperties properties;

    public ModuleClientConfig(CactusProperties properties) {
        this.properties = properties;
    }

    public String getModuleUrl(String moduleName) {
        var url = properties.getClient().getModuleUrls().get(moduleName);
        if (url == null) {
            throw new IllegalArgumentException(
                "모듈 URL 미설정: cactus.client.module-urls." + moduleName);
        }
        return url;
    }
}
```

---

## 12. 감사 추적 상세

### 11.1 Auditable 어노테이션

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Auditable {
    String action();          // "작업지시 저장"
    String resource();        // "WORK_ORDER"
}
```

### 11.2 AuditLog (Java 21 Record)

```java
public record AuditLog(
    String logId,
    String userId,
    String action,
    String resource,
    String status,          // SUCCESS / FAIL
    String errorMessage,
    long elapsedMs,
    String correlationId,
    String moduleId,
    LocalDateTime timestamp
) {
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String userId, action, resource, status, errorMessage;
        private long elapsedMs;
        // builder methods...
        public AuditLog build() {
            return new AuditLog(
                UUID.randomUUID().toString(),
                userId, action, resource, status, errorMessage, elapsedMs,
                CorrelationIdHolder.getId(), null, LocalDateTime.now()
            );
        }
    }
}
```

### 11.3 AuditAspect

```java
@Aspect
@Component
public class AuditAspect {

    private final AuditLogger auditLogger;

    public AuditAspect(AuditLogger auditLogger) {
        this.auditLogger = auditLogger;
    }

    @Around("@annotation(auditable)")
    public Object audit(ProceedingJoinPoint pjp, Auditable auditable) throws Throwable {
        long start = System.currentTimeMillis();
        var userId = UserContextHolder.getUserId();

        try {
            var result = pjp.proceed();

            auditLogger.log(AuditLog.builder()
                .userId(userId)
                .action(auditable.action())
                .resource(auditable.resource())
                .status("SUCCESS")
                .elapsedMs(System.currentTimeMillis() - start)
                .build());

            return result;

        } catch (Exception e) {
            auditLogger.log(AuditLog.builder()
                .userId(userId)
                .action(auditable.action())
                .resource(auditable.resource())
                .status("FAIL")
                .errorMessage(e.getMessage())
                .elapsedMs(System.currentTimeMillis() - start)
                .build());
            throw e;
        }
    }
}
```

---

## 13. 캐시 상세

### 12.1 CacheConfig

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        var manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofMinutes(30))
            .recordStats());
        return manager;
    }
}
```

### 12.2 CommonCodeCache

```java
@Component
public class CommonCodeCache {

    private final ModuleClientConfig clientConfig;

    public CommonCodeCache(ModuleClientConfig clientConfig) {
        this.clientConfig = clientConfig;
    }

    @Cacheable(value = CacheNames.COMMON_CODE, key = "#groupCode")
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getCodeList(String groupCode) {
        var portal = new SimpleModuleClient(clientConfig, "portal");
        return portal.get("/api/portal/code/" + groupCode, List.class);
    }

    public String getCodeName(String groupCode, String code) {
        return getCodeList(groupCode).stream()
            .filter(m -> code.equals(m.get("code")))
            .map(m -> (String) m.get("codeName"))
            .findFirst()
            .orElse(code);
    }

    @CacheEvict(value = CacheNames.COMMON_CODE, allEntries = true)
    public void evictAll() {}
}
```

---

## 14. 로깅 설정 상세

### 13.1 로그 포맷

```
2026-03-12 10:30:45.123 [http-nio-8082-exec-1] [abc12345] INFO  API_ACCESS
  [POST] /api/operation/workorder/search → 200 (user=admin, 156ms)

2026-03-12 10:30:45.100 [http-nio-8082-exec-1] [abc12345] INFO  OASIS_EXECUTION
  [OASIS] workorder/search completed in 142ms

2026-03-12 10:30:48.500 [http-nio-8082-exec-3] [def67890] WARN  SLOW_QUERY
  [SLOW] 3200ms | SELECT * FROM TB_WORK_ORDER WHERE PLANT_CD = ? AND ...
```

### 13.2 MDC 컨텍스트

```
MDC에 자동 세팅되는 값:
├── correlationId    요청 추적 ID (CorrelationIdFilter)
├── userId           사용자 ID (JwtAuthenticationFilter)
├── moduleId         모듈 ID (CactusProperties)
└── requestUri       요청 URI (RequestLoggingFilter)
```

### 13.3 logback-spring.xml

```xml
<configuration>
    <property name="LOG_PATTERN"
              value="%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] [%X{correlationId:---------}] %-5level %logger{36} - %msg%n"/>

    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
        </encoder>
    </appender>

    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/${MODULE_ID}.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/${MODULE_ID}.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
        </encoder>
    </appender>

    <logger name="OASIS_EXECUTION" level="INFO"/>
    <logger name="API_ACCESS" level="INFO"/>
    <logger name="SLOW_QUERY" level="WARN"/>
    <logger name="AUDIT" level="INFO"/>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

---

## 15. 각 모듈에서의 사용법

### 14.1 의존성 추가

```groovy
// dmes-operation/build.gradle
plugins {
    id 'org.springframework.boot' version '4.0.3'
    id 'io.spring.dependency-management'
    id 'java'
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

dependencies {
    implementation 'com.dongkuk.dmes:cactus-core:1.0.0'

    // JDBC 드라이버: 프로젝트에서 사용하는 DB에 맞게 선택
    runtimeOnly 'org.postgresql:postgresql:42.7.3'          // PostgreSQL
    // runtimeOnly 'com.oracle.database.jdbc:ojdbc11:23.6.0.24.10'  // Oracle
    // runtimeOnly 'com.mysql:mysql-connector-j:8.3.0'              // MySQL
}
```

### 14.2 application.yml

```yaml
server:
  port: 8082

cactus:
  module-id: operation
  module-name: 조업관리
  jwt:
    secret: ${JWT_SECRET}
  client:
    module-urls:
      portal: http://dmes-portal:8081
      logistics: http://dmes-logistics:8083

spring:
  datasource:
    url: ${DB_URL}             # jdbc:postgresql://host:5432/dmes_opr
    username: ${DB_USER}
    password: ${DB_PASS}
```

### 14.3 서비스 메타데이터 등록 (Controller 작성 불필요)

Cactus 공통 컨트롤러(`OasisController`)가 자동 등록되므로,
**모듈에서 Controller를 작성하지 않는다.** 대신 `service-metadata.yml`에 서비스를 등록한다.

```yaml
# src/main/resources/service-metadata.yml
services:
  workorder/search:
    name: 작업지시 조회
    permission: WORKORDER_READ
    audit: false

  workorder/save:
    name: 작업지시 저장
    permission: WORKORDER_WRITE
    audit: true

  workorder/delete:
    name: 작업지시 삭제
    permission: WORKORDER_DELETE
    audit: true
```

> **API 호출**: `POST /api/service/workorder/search` → Cactus가 `services/workorder/search.bpmn` 자동 실행
>
> 상세 설계: [CACTUS_SERVICE_CONTROLLER.md](./CACTUS_SERVICE_CONTROLLER.md) 참조

### 14.4 BPMN + MyBatis Mapper

```
src/main/resources/
├── service-metadata.yml                  ← 서비스별 권한/감사 설정
├── services/workorder/search.bpmn
├── services/workorder/save.bpmn
└── persistence/workorder/WorkOrderMapper.xml
```

### 14.5 Dockerfile (Java 21)

```dockerfile
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app
COPY build/libs/dmes-operation-1.0.0.jar app.jar

EXPOSE 8082

ENTRYPOINT ["java", \
  "-Xms512m", "-Xmx1024m", \
  "-jar", "app.jar"]
```

### 14.6 모듈 간 호출

```java
@Component
public class LogisticsModuleClient extends ModuleClient {

    public LogisticsModuleClient(ModuleClientConfig config) {
        super(config, "logistics");
    }

    public Map<String, Object> getInventory(String itemCode) {
        return post("/api/service/inventory/search",
            Map.of("params", Map.of("itemCode", itemCode)), Map.class);
    }
}
```

---

## 16. Java 21 활용 포인트 정리

| Java 21 기능 | 적용 위치 | 이전 (Java 8) |
|-------------|-----------|--------------|
| **Record** | `UserInfo`, `TokenPair`, `ApiResponse`, `PageResponse`, `PageRequest`, `AuditLog` | POJO + getter/setter/equals/hashCode |
| **Text Block** | SQL 래핑, JSON 응답, 로그 메시지 | 문자열 연결 (+) |
| **Pattern Matching (instanceof)** | `CactusResponseConverter` 타입 분류 | 명시적 캐스팅 |
| **Switch Expression** | 예외 변환 등 | if-else 체인 |
| **var** | 지역 변수 타입 추론 전반 | 명시적 타입 선언 |
| **List.of() / Map.of()** | 불변 컬렉션 생성 | Arrays.asList / Collections.unmodifiable |
| **String.formatted()** | 문자열 포매팅 전반 | String.format() |
| **Sealed Class** | 향후 ErrorCode 계층 확장 시 | - |
| **NullPointerException 개선** | 디버깅 시 상세 메시지 | - |

---

## 17. Jakarta EE 호환 구조

```
┌─────────────────────────────────────────────────────────┐
│ oasis-core 5.0.0 (Java 21, Jakarta EE 네이티브)          │
│                                                          │
│  jakarta.persistence.* (네이티브)                        │
│  jakarta.annotation.*  (네이티브)                        │
│  javax.sql.*           (JDK 표준)                        │
│                                                          │
│  Spring 7.x API       (네이티브 지원)                    │
│  (TransactionManager,                                    │
│   ApplicationContext)                                    │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Cactus (Java 21 + Spring Boot 4.0)                       │
│                                                          │
│  oasis-core 5.0.0이 Jakarta EE 네이티브이므로            │
│  javax → jakarta 브릿지 의존성 불필요                    │
│                                                          │
│  Cactus 자체 코드:                                       │
│    jakarta.servlet.*    (Spring Boot 4.x 표준)           │
│    jakarta.validation.* (Spring Boot 4.x 표준)           │
│    jakarta.persistence.* (oasis-core와 동일 네임스페이스) │
└─────────────────────────────────────────────────────────┘
```

### 잠재적 이슈와 대응

| 이슈 | 증상 | 대응 |
|------|------|------|
| OASIS 내부 리플렉션이 Java 21 모듈 시스템에 막힘 | InaccessibleObjectException | JVM 옵션에 `--add-opens` 추가 |

### JVM 옵션 (필요 시)

```dockerfile
ENTRYPOINT ["java", \
  "-Xms512m", "-Xmx1024m", \
  "--add-opens", "java.base/java.lang=ALL-UNNAMED", \
  "--add-opens", "java.base/java.lang.reflect=ALL-UNNAMED", \
  "--add-opens", "java.base/java.util=ALL-UNNAMED", \
  "-jar", "app.jar"]
```

---

## 18. Cactus가 자동으로 해주는 것 요약

| 기능 | 자동 적용 | 모듈에서 할 일 |
|------|-----------|---------------|
| OASIS 설정 | `OasisAutoConfiguration`이 Controller, Executor, Converter 자동 등록 | BPMN 파일만 작성 |
| Jakarta EE 호환 | OASIS 5.0.0이 Jakarta EE 네이티브이므로 추가 설정 불필요 | 없음 |
| JWT 인증 | `JwtAuthenticationFilter` 자동 등록 | `cactus.jwt.secret`만 설정 |
| 사용자 컨텍스트 | `UserContextHolder` 자동 세팅 | `UserContextHolder.get()`으로 접근 |
| 예외 처리 | `GlobalExceptionHandler` 자동 등록 | `BusinessException` throw만 |
| 응답 포맷 | `ApiResponse`, `PageResponse` 제공 | `ApiResponse.ok(data)` 사용 |
| DataSource | HikariCP 자동 설정 | `spring.datasource.*` 설정만 |
| MyBatis | TypeHandler, Interceptor 자동 등록 | Mapper XML만 작성 |
| 페이징 | DB별 자동 래핑 (Oracle ROWNUM / LIMIT-OFFSET) | `_pageNo`, `_pageSize` 파라미터 전달 |
| 감사 필드 | INSERT/UPDATE 시 자동 채움 | 없음 |
| 슬로우 쿼리 | 3초 초과 자동 경고 | 없음 |
| 요청 로깅 | 모든 API 요청/응답 자동 로깅 | 없음 |
| Correlation ID | 자동 생성/전파 | 없음 |
| 공통 Controller | `OasisController` — `POST /api/{serviceGroup}/{serviceId}/{action}` | Controller 작성 불필요 |
| 요청/응답 변환 | `CactusRequestConverter` / `CactusResponseConverter` 자동 등록 | CactusRequest/CactusResponse 표준 포맷 사용 |
| txId 추적 | `TxIdFilter` + `OasisServiceExecutor`에서 MDC 자동 관리 | 없음 |
| 모듈 간 통신 | JWT/CorrelationId 자동 전파 + RestClient | `ModuleClient` 상속만 |
| 공통코드 캐시 | Caffeine 캐시 자동 설정 | `CommonCodeCache` 주입 |

---

## 19. 버전 관리 전략

```
cactus 1.0.x  → 초기 개발 (기본 기능, Spring Boot 4.0.x)
cactus 1.1.x  → 캐시 강화, 메시지 큐 연동
cactus 1.2.x  → 모니터링 (Actuator, Prometheus/Micrometer)
cactus 1.3.x  → Virtual Thread 지원 (Java 21 대비)
cactus 2.0.x  → Java 21 + Spring Boot 5.x 마이그레이션

버전 규칙:
  MAJOR.MINOR.PATCH
  MAJOR → 하위 호환 깨짐 (Spring Boot 버전, Java 버전 등)
  MINOR → 기능 추가 (하위 호환 유지)
  PATCH → 버그 수정
```

---

## 20. 모듈별 개발 시 Cactus 터치 포인트

```
┌─ 공통 Controller (Cactus 자동 제공) ────────────────┐
│  POST /api/{serviceGroup}/{serviceId}/{action} ← Cactus │
│  OasisController (단일 진입점)             ← Cactus  │
│  OasisServiceExecutor (실행 오케스트레이터) ← Cactus  │
│  CactusRequest / CactusResponse (표준 포맷) ← Cactus │
│  → Controller 코드 작성 불필요                        │
├─ 서비스 메타데이터 ─────────────────────────────────┤
│  service-metadata.yml (권한/감사 설정)     ← 모듈    │
├─ BPMN ───────────────────────────────────────────────┤
│  OASIS BPMN 프로세스 정의                   ← 모듈    │
│  JavaServiceTask → Spring Bean 호출        ← 모듈    │
│  SqlScriptTask → MyBatis Mapper 호출       ← 모듈    │
├─ Service ────────────────────────────────────────────┤
│  비즈니스 로직 (Spring Bean)                ← 모듈    │
│  BusinessException (업무 예외)              ← Cactus  │
│  UserContextHolder (사용자 정보)            ← Cactus  │
├─ Mapper ─────────────────────────────────────────────┤
│  MyBatis Mapper XML                        ← 모듈    │
│  PaginationInterceptor (자동 페이징)        ← Cactus  │
│  AuditInterceptor (감사 필드)               ← Cactus  │
├─ 모듈 간 통신 ───────────────────────────────────────┤
│  ModuleClient 상속                         ← 모듈    │
│  RestClient + JWT/CorrelationId 전파       ← Cactus  │
├─ 인프라 (자동) ──────────────────────────────────────┤
│  OASIS 5.0.0 Jakarta EE 네이티브 통합      ← Cactus  │
│  Logback + MDC                             ← Cactus  │
│  Caffeine 캐시                             ← Cactus  │
└──────────────────────────────────────────────────────┘
```
