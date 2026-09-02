# Cactus - 패키지별 상세 설계

> 각 패키지의 역할, 클래스별 책임, 메서드 시그니처, 의존 관계를 정의한다.
> 기본 패키지: `com.dongkuk.dmes.cactus`
>
> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController/AuthService 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터: **ClientKeyFilter**(`X-Backend-Client-Key` 검증), **RequestIdFilter**(요청 식별자 발급/전파).
> - 신규 AutoConfiguration: **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성), **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일.
> - {CLIENT} 사이트 코드 패키지 컨벤션: `com.dongkuk.dmes.{aps|mpp|mqc|portal}.*`.

---

## 1. autoconfigure - Spring Boot 자동 설정

### 역할
Cactus 라이브러리를 의존성에 추가하는 것만으로 모든 공통 설정이 자동 적용되도록 한다.
Spring Boot 4.x의 `AutoConfiguration.imports` 메커니즘을 사용한다.

### 등록 파일
```
src/main/resources/META-INF/spring/
  org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

### 클래스 상세

#### CactusAutoConfiguration.java
```
역할: Cactus 전체의 진입점. 다른 AutoConfiguration을 트리거하고 초기화 로그를 출력한다.
```
```java
@AutoConfiguration
@EnableConfigurationProperties(CactusProperties.class)
@ComponentScan(basePackages = "com.dongkuk.dmes.cactus")
public class CactusAutoConfiguration {

    @PostConstruct
    void init()
    // → 배너 출력, 버전 정보, 모듈 ID 로깅
}
```

#### CactusProperties.java
```
역할: cactus.* 프로퍼티를 바인딩하는 최상위 설정 클래스.
      모든 Cactus 하위 설정의 진입점.
```
```java
@ConfigurationProperties(prefix = "cactus")
public class CactusProperties {

    private String moduleId;       // 모듈 식별자 (operation, logistics 등)
    private String moduleName;     // 모듈 한글명
    private OasisProperties oasis;
    private JwtProperties jwt;
    private ClientProperties client;
    private DataSourceProperties datasource;
    private AuditProperties audit;

    // ── 중첩 클래스 ──
    public static class OasisProperties {
        private String servicePath = "resources/services";
        private boolean cacheEnabled = true;
        private boolean executionLogging = true;
        private long executionTimeoutMs = 30000;
    }

    public static class JwtProperties {
        private String secret;
        private String issuer = "dmes-portal";
        private long accessTokenExpiry = 28800;   // 8시간 (초)
        private long refreshTokenExpiry = 86400;  // 24시간 (초)
    }

    public static class ClientProperties {
        private int connectTimeout = 3000;
        private int readTimeout = 10000;
        private Map<String, String> moduleUrls = new HashMap<>();
    }

    public static class DataSourceProperties {
        private String dialect = "auto";  // auto | oracle | standard
    }

    public static class AuditProperties {
        private boolean enabled = true;
        private String target = "both";   // db | log | both
    }
}
```

#### OasisAutoConfiguration.java
```
역할: OASIS 프레임워크 관련 Bean을 자동 등록한다.
      OasisController, OasisServiceExecutor, CactusRequestConverter, CactusResponseConverter,
      SpringApplicationContext를 등록한다.
      oasis-core가 classpath에 있을 때만 활성화된다.
```
```java
@AutoConfiguration
@ConditionalOnClass(name = "com.dongkuk.oasis.service.ServiceStarter")
public class OasisAutoConfiguration {

    @Bean @ConditionalOnMissingBean
    OasisServiceExecutor oasisServiceExecutor(CactusProperties props)

    @Bean @ConditionalOnMissingBean
    OasisController oasisController(OasisServiceExecutor executor,
                                     CactusRequestConverter requestConverter,
                                     CactusResponseConverter responseConverter,
                                     CactusProperties props)

    @Bean @ConditionalOnMissingBean
    SpringApplicationContext springApplicationContext(ApplicationContext springCtx)

    @Bean @ConditionalOnMissingBean
    CactusRequestConverter cactusRequestConverter()

    @Bean @ConditionalOnMissingBean
    CactusResponseConverter cactusResponseConverter()

    @PostConstruct
    void validateOasisCompatibility()
    // → oasis-core 클래스 존재 확인, Java 17 런타임 호환 검증
}
```

#### SecurityAutoConfiguration.java
```
역할: JWT 인증 관련 Bean을 자동 등록한다.
      JwtTokenProvider, JwtAuthenticationFilter.
      cactus.jwt.secret이 설정되어 있을 때만 활성화된다.
```
```java
@AutoConfiguration
@ConditionalOnProperty(prefix = "cactus.jwt", name = "secret")
public class SecurityAutoConfiguration {

    @Bean @ConditionalOnMissingBean
    JwtTokenProvider jwtTokenProvider(CactusProperties props)

    @Bean
    FilterRegistrationBean<JwtAuthenticationFilter> jwtFilter(JwtTokenProvider provider)
    // → URL 패턴: /api/*
    // → 순서: CorrelationIdFilter 다음
}
```

#### DataSourceAutoConfiguration.java
```
역할: DataSource, TransactionManager를 자동 설정한다.
      spring.datasource.* 프로퍼티가 있을 때만 활성화.
```
```java
@AutoConfiguration
@ConditionalOnProperty(prefix = "spring.datasource", name = "url")
public class DataSourceAutoConfiguration {

    @Bean @Primary @ConditionalOnMissingBean
    DataSource dataSource()

    @Bean @Primary @ConditionalOnMissingBean
    PlatformTransactionManager transactionManager(DataSource ds)
}
```

#### MyBatisAutoConfiguration.java
```
역할: MyBatis SqlSessionFactory, TypeHandler, Interceptor를 자동 설정한다.
      PaginationDialect는 JDBC URL에서 자동 감지하거나 cactus.datasource.dialect로 지정.
```
```java
@AutoConfiguration
@AutoConfigureAfter(DataSourceAutoConfiguration.class)
public class MyBatisAutoConfiguration {

    @Bean @ConditionalOnMissingBean
    SqlSessionFactory sqlSessionFactory(DataSource ds, CactusProperties props)

    @Bean @ConditionalOnMissingBean
    PaginationDialect paginationDialect(CactusProperties props, DataSource ds)
    // → dialect=auto이면 JDBC URL에서 감지
    //   jdbc:oracle:* → OraclePaginationDialect
    //   jdbc:postgresql:* / jdbc:mysql:* → StandardPaginationDialect
}
```

#### WebAutoConfiguration.java
```
역할: 웹 계층 공통 Bean을 자동 등록한다.
      GlobalExceptionHandler, CORS, 필터 등.
```
```java
@AutoConfiguration
public class WebAutoConfiguration {

    @Bean @ConditionalOnMissingBean
    GlobalExceptionHandler globalExceptionHandler()

    @Bean
    FilterRegistrationBean<CorrelationIdFilter> correlationIdFilter()
    // → 순서: HIGHEST_PRECEDENCE

    @Bean
    FilterRegistrationBean<RequestLoggingFilter> requestLoggingFilter()
    // → 순서: HIGHEST_PRECEDENCE + 1

    @Bean @ConditionalOnMissingBean
    CorsConfig corsConfig()
}
```

### 의존 관계
```
CactusAutoConfiguration (진입점)
    ├── OasisAutoConfiguration
    ├── SecurityAutoConfiguration
    ├── DataSourceAutoConfiguration
    │       └── MyBatisAutoConfiguration (@AutoConfigureAfter)
    └── WebAutoConfiguration
```

---

## 2. oasis - OASIS 통합 계층

### 역할
OASIS 워크플로우 엔진(oasis-core)을 Cactus/Spring Boot 환경에 통합한다.
BPMN 파일 로딩, 서비스 실행, Spring Bean 연결, 트랜잭션 설정을 담당한다.

### 클래스 상세

#### OasisServiceExecutor.java
```
역할: OASIS 서비스 실행의 단일 진입점.
      OasisController → OasisServiceExecutor → OASIS ServiceStarter.
      사용자 컨텍스트 주입, 예외 변환, 실행 로깅을 공통 처리한다.
```
```java
@Component
public class OasisServiceExecutor {

    // ── 의존성 ──
    - CactusProperties properties

    // ── 공개 메서드 ──

    Map<String, TypedObject> execute(String serviceName, Map<String, TypedObject> params)
    // → 1. UserContextHolder에서 사용자 정보 추출 → params에 _userId, _userNm, _userEmpNo 주입
    // → 2. OASIS ServiceStarter로 서비스 실행
    // → 3. result를 Map<String, TypedObject>로 변환
    // → 예외 발생 시 translateException()

    <T> List<T> executeForList(String serviceName, Map<String, TypedObject> params, String resultKey)
    // → execute() 결과에서 resultKey로 List 추출
    // → Java 17 pattern matching: if (data instanceof List<?> list)

    PageResponse<?> executeForPage(String serviceName, Map<String, TypedObject> params, PageRequest pageRequest)
    // → params에 _pageNo, _pageSize, _offset 주입
    // → execute() 실행 후 PageResponse.of()로 변환

    // ── 비공개 메서드 ──

    RuntimeException translateException(Exception e)
    // → OASIS UserException → BusinessException(BUSINESS_ERROR)
    // → OASIS OasisException → BusinessException(SERVICE_EXECUTION_ERROR)
    // → 이미 BusinessException이면 그대로 반환
}
```

#### (서비스 로딩 - OasisAutoConfiguration에서 처리)
```
역할: BPMN 서비스 로딩, 캐싱, 조회는 OasisAutoConfiguration에서 자동 설정된다.
      servicePath("resources/services")에서 BPMN 파일을 자동 스캔하여 서비스를 등록한다.
      별도의 Provider/Scanner 클래스 없이 OasisAutoConfiguration이 일괄 처리한다.
```
```
서비스 스캔 규칙:
  - servicePath: resources/services
  - 파일: resources/services/workorder/search.bpmn
  - 서비스명: workorder/search (.bpmn 확장자 제거, servicePath 이후 상대경로)
  - cacheEnabled이면 서비스 캐싱 적용
```

#### SpringApplicationContext (OASIS 제공)
```
역할: OASIS의 ApplicationContext를 Spring ApplicationContext와 연결한다.
      OASIS의 JavaServiceTask에서 Spring Bean을 이름/타입으로 조회할 수 있게 한다.
      OASIS에서 직접 제공하는 SpringApplicationContext를 사용한다.
      (별도 래핑 클래스 불필요 - OasisAutoConfiguration에서 Bean으로 등록)
```
```java
// OASIS 제공 클래스 (com.dongkuk.oasis.spring.SpringApplicationContext)
// OasisAutoConfiguration에서 @Bean으로 등록

SpringApplicationContext springApplicationContext(ApplicationContext springCtx)
// → Spring ApplicationContext를 OASIS에 연결
// → getBean(name), getBean(name, type), getBean(type) 지원
```

#### CactusTransactionConfig.java
```
역할: OASIS의 트랜잭션 핸들러를 Spring의 PlatformTransactionManager와 연결한다.
      OASIS의 TransactionManagerWarehouse에 Spring 트랜잭션 매니저를 등록한다.
```
```java
@Configuration
public class CactusTransactionConfig {

    @Bean
    SpringTransactionHandler springTransactionHandler(PlatformTransactionManager txManager)
    // → OASIS SpringTransactionHandler에 Spring의 트랜잭션 매니저 주입

    @PostConstruct
    void registerTransactionManager()
    // → TransactionManagerWarehouse에 등록
}
```

#### (실행 리스너 - OasisController 내부에서 처리)
```
역할: OASIS 서비스 실행 전후의 공통 처리(로깅, 감사, 슬로우 감지)는
      OasisController 내부에서 수행한다.
      ServiceMetadataRegistry를 참조하여 audit 설정된 서비스의 감사 로그를 기록한다.
      별도의 ServiceExecutionListener 클래스 없이 OasisController가 일괄 처리한다.
```

### 의존 관계
```
OasisController
    ├── OasisServiceExecutor
    │       └── OASIS (ServiceStarter)
    ├── CactusRequestConverter
    ├── CactusResponseConverter
    ├── ServiceMetadataRegistry (service 패키지)
    ├── AuditLogger (audit 패키지)
    └── UserContextHolder (security.context 패키지)

SpringApplicationContext (OASIS 제공)
    └── Spring ApplicationContext

CactusTransactionConfig
    └── OASIS TransactionManagerWarehouse
```

---

## 3. security - 인증/인가

### 역할
JWT 기반 인증, 사용자 컨텍스트 관리, 메서드 레벨 권한 체크를 담당한다.
Portal에서 JWT를 발급하고, 나머지 모듈은 검증만 수행한다.

### 3.1 security.jwt - JWT 처리

#### JwtTokenProvider.java
```
역할: JWT 토큰의 생성(Portal)과 검증(전 모듈)을 담당한다.
      JJWT 0.12.x API를 사용한다.
```
```java
@Component
public class JwtTokenProvider {

    // ── 의존성 ──
    - CactusProperties.JwtProperties jwtProperties
    - SecretKey secretKey  // @PostConstruct에서 BASE64 → SecretKey 변환

    // ── 생명주기 ──

    @PostConstruct
    void init()
    // → Decoders.BASE64.decode(secret) → Keys.hmacShaKeyFor(bytes)

    // ── 공개 메서드 ──

    TokenPair generateTokenPair(UserInfo userInfo)
    // → [Portal 전용] Access Token + Refresh Token 생성
    // → Access Token Claims: sub(userId), userNm, userEmpNo
    // → Refresh Token Claims: sub(userId)만
    // → 서명: HMAC-SHA256

    UserInfo validateAndExtract(String token)
    // → [전 모듈] 토큰 서명 검증 + 만료 체크 + Claims → UserInfo 변환
    // → 실패 시 ExpiredJwtException 또는 JwtException throw

    boolean isTokenValid(String token)
    // → validateAndExtract를 try-catch로 감싸서 boolean 반환
}
```

#### JwtAuthenticationFilter.java
```
역할: 모든 /api/** 요청에 대해 JWT를 검증하는 서블릿 필터.
      jakarta.servlet 기반 (Spring Boot 4.x).
      검증 성공 시 UserContextHolder, JwtTokenHolder에 정보를 세팅한다.
```
```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    // ── 의존성 ──
    - JwtTokenProvider tokenProvider

    // ── 상수 ──
    - SKIP_PATHS: List<String>
      → /api/portal/auth/login
      → /api/portal/auth/refresh
      → /actuator/health
      → /actuator/info

    // ── 처리 흐름 ──

    @Override
    void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
    // → 1. SKIP_PATHS에 해당하면 바로 chain.doFilter()
    // → 2. Authorization 헤더에서 "Bearer " 이후 토큰 추출
    // → 3. tokenProvider.validateAndExtract(token) → UserInfo
    // → 4. UserContextHolder.set(userInfo)
    // → 5. JwtTokenHolder.set(token)  ← 모듈 간 통신 시 전파용
    // → 6. chain.doFilter()
    // → finally: UserContextHolder.clear(), JwtTokenHolder.clear()
    // → 실패 시: sendError(401, 에러메시지)

    void sendError(HttpServletResponse res, int status, String message)
    // → JSON 응답: {"success":false, "errorCode":"A001", "message":"..."}
}
```

#### JwtTokenHolder.java
```
역할: 현재 요청의 원본 JWT 토큰을 ThreadLocal에 보관한다.
      모듈 간 REST 호출 시 Authorization 헤더로 전파하기 위함.
```
```java
public final class JwtTokenHolder {

    - ThreadLocal<String> HOLDER

    static void set(String token)
    static String get()
    static void clear()
}
```

#### TokenPair.java
```
역할: Access Token + Refresh Token 쌍을 담는 불변 객체.
```
```java
public record TokenPair(
    String accessToken,
    String refreshToken
) {}
```

### 3.2 security.context - 사용자 컨텍스트

#### UserInfo.java
```
역할: JWT에서 추출한 사용자 정보. 불변(record).
      ThreadLocal에 저장되므로 불변성이 중요하다.
```
```java
public record UserInfo(
    String userId,       // 사용자 ID (USER_ID)
    String userNm,       // 사용자명 (USER_NM)
    String userEmpNo     // 사번 (USER_EMP_NO)
) {}
```

#### UserContextHolder.java
```
역할: ThreadLocal 기반으로 현재 스레드의 사용자 정보를 관리한다.
      JwtAuthenticationFilter에서 세팅, Controller/Service/BPMN Task 어디서든 접근 가능.
```
```java
public final class UserContextHolder {

    - ThreadLocal<UserInfo> HOLDER

    static void set(UserInfo userInfo)
    static UserInfo get()              // nullable
    static String getUserId()          // null-safe, 없으면 "SYSTEM" 반환
    static String getUserEmpNo()       // null-safe, 없으면 "" 반환
    static void clear()
}
```

#### UserContext.java
```
역할: UserContextHolder의 Wrapper. Spring Bean으로 주입 가능한 형태.
      생성자 주입이 필요한 경우 사용.
```
```java
@Component
public class UserContext {

    UserInfo getCurrentUser()           // → UserContextHolder.get()
    String getCurrentUserId()           // → UserContextHolder.getUserId()
    boolean isAuthenticated()           // → getCurrentUser() != null
}
```

### 3.3 security.authorization - 인가

> **현재 범위에서 제외**: 인가(Authorization) 기능은 현재 스코프에서 제외되었다.
> 향후 필요 시 별도 설계를 통해 추가한다.

### 의존 관계
```
JwtAuthenticationFilter
    ├── JwtTokenProvider
    ├── UserContextHolder
    └── JwtTokenHolder

UserContext (Spring Bean)
    └── UserContextHolder
```

---

## 3-1. service - 공통 서비스 컨트롤러

### 역할
모든 BPMN 서비스 실행 요청을 단일 엔드포인트(`POST /api/{serviceGroup}/{serviceId}/{action}`)로 처리한다.
모듈별 Controller 작성을 제거하고, `service-metadata.yml`로 감사를 선언적으로 관리한다.

> 상세 설계: [CACTUS_SERVICE_CONTROLLER.md](./CACTUS_SERVICE_CONTROLLER.md) 참조

### 클래스 상세

#### OasisController.java
```
역할: 공통 REST 컨트롤러. 모든 BPMN 서비스 실행의 단일 진입점.
      serviceGroup, serviceId, action을 PathVariable로 받아 OASIS 서비스를 실행하고 결과를 반환한다.
      CactusRequestConverter로 요청을 변환하고, CactusResponseConverter로 응답을 변환한다.
```
```java
@RestController
@RequestMapping("/api")
public class OasisController {

    - OasisServiceExecutor executor
    - CactusRequestConverter requestConverter
    - CactusResponseConverter responseConverter
    - ServiceMetadataRegistry metadataRegistry

    @PostMapping("/{serviceGroup}/{serviceId}/{action}")
    ApiResponse<?> execute(@PathVariable String serviceGroup,
                           @PathVariable String serviceId,
                           @PathVariable String action,
                           @RequestBody(required = false) CactusRequest request)
    // → 1. serviceGroup/serviceId/action 형식 검증
    // → 2. BPMN 존재 여부 확인
    // → 3. ServiceMetadataRegistry에서 메타데이터 조회
    // → 4. requestConverter.convert(request)로 Map<String, TypedObject> 변환
    // → 5. executor.execute(serviceName, params)
    // → 6. responseConverter.convert(result)로 CactusResponse 생성
    // → 7. isPaged() → PageResponse 변환 / 아니면 그대로 반환
}
```

#### CactusRequest.java (record)
```
역할: 공통 서비스 요청 DTO. params(조건/필터)와 payload(데이터 본체)를 분리하여 전달한다.
```
```java
public record CactusRequest(
    Map<String, Object> params,
    Object payload
) {
    // compact constructor: params null → 빈 Map

    boolean isPaged()
    // → params에 pageNo, pageSize 존재 여부로 판단

    int pageNo()       // 기본 1
    int pageSize()     // 기본 20
    int offset()       // (pageNo - 1) * pageSize
}
```

#### CactusRequestConverter.java
```
역할: CactusRequest를 OASIS 실행용 Map<String, TypedObject>로 변환한다.
```
```java
@Component
public class CactusRequestConverter {

    Map<String, TypedObject> convert(CactusRequest request)
    // → request.params() + payload를 Map<String, TypedObject>로 변환
    // → 페이징 파라미터(_pageNo, _pageSize, _offset) 포함
}
```

#### CactusResponseConverter.java
```
역할: OASIS 실행 결과 Map<String, TypedObject>를 CactusResponse로 변환한다.
```
```java
@Component
public class CactusResponseConverter {

    CactusResponse convert(Map<String, TypedObject> result)
    // → result를 CactusResponse.data로 변환
}
```

#### CactusResponse.java (record)
```
역할: 공통 서비스 응답 DTO. data 필드에 실행 결과를 담는다.
```
```java
public record CactusResponse(
    Map<String, Object> data
) {}
```

#### ServiceMetadata.java (record)
```
역할: 서비스 하나의 메타데이터 (serviceId별 권한/감사 설정).
```
```java
public record ServiceMetadata(
    String serviceId,              // workorder/search
    String name,                   // 작업지시 조회
    String requiredPermission,     // WORKORDER_READ (null이면 권한 체크 안 함)
    boolean audit                  // true면 감사 로그 기록
) {}
```

#### ServiceMetadataRegistry.java
```
역할: service-metadata.yml을 로딩하여 serviceId별 메타데이터를 관리한다.
      OasisController가 참조한다.
```
```java
@Component
public class ServiceMetadataRegistry {

    - Map<String, ServiceMetadata> registry (ConcurrentHashMap)

    @PostConstruct
    void load()
    // → classpath:service-metadata.yml 로드/파싱 → registry에 등록

    ServiceMetadata get(String serviceId)
    // → 미등록 서비스는 null 반환 → 권한 체크/감사 스킵

    void register(ServiceMetadata metadata)
    // → 런타임 추가/수정 (관리 화면에서 사용)

    List<ServiceMetadata> getAll()
    // → 등록된 전체 서비스 목록 (관리 화면용)
}
```

### 의존 관계
```
OasisController
    ├── OasisServiceExecutor (oasis)
    ├── CactusRequestConverter
    ├── CactusResponseConverter
    └── ServiceMetadataRegistry

ServiceMetadataRegistry
    └── service-metadata.yml (각 모듈 resources)
```

---

## 4. web - 웹 계층 공통

### 역할
API 응답 포맷, 요청 파라미터, 예외 처리, 서블릿 필터, CORS 등
모든 모듈의 웹 계층에서 공통으로 사용하는 요소를 정의한다.

### 4.1 web.response - 응답 포맷

#### ApiResponse.java
```
역할: 모든 API의 통일된 응답 포맷.
      성공/실패 여부, 데이터, 에러코드, 추적 ID를 포함한다.
```
```java
public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    String errorCode,
    String timestamp,       // ISO 8601
    String correlationId    // 요청 추적 ID
) {
    // compact constructor: timestamp/correlationId 자동 채움

    static <T> ApiResponse<T> ok(T data)
    static <T> ApiResponse<T> ok(T data, String message)
    static ApiResponse<?> error(String errorCode, String message)
    static ApiResponse<?> error(ErrorCode errorCode)
}
```

**응답 예시:**
```json
// 성공
{
  "success": true,
  "data": { "list": [...], "totalCount": 150 },
  "message": null,
  "errorCode": null,
  "timestamp": "2026-03-12T10:30:45",
  "correlationId": "abc12345"
}

// 실패
{
  "success": false,
  "data": null,
  "message": "작업지시가 존재하지 않습니다",
  "errorCode": "B001",
  "timestamp": "2026-03-12T10:30:45",
  "correlationId": "abc12345"
}
```

#### PageResponse.java
```
역할: 그리드 조회용 페이징 응답.
```
```java
public record PageResponse<T>(
    List<T> list,        // 데이터 목록
    long totalCount,     // 전체 건수
    int pageNo,          // 현재 페이지
    int pageSize,        // 페이지 크기
    int totalPages       // 전체 페이지 수
) {
    static <T> PageResponse<T> of(Object listData, long totalCount, PageRequest pageRequest)
    // → listData를 List<T>로 캐스팅, totalPages 계산
}
```

#### ErrorResponse.java
```
역할: 에러 상세 정보를 담는 응답 (디버그 모드용).
      운영 환경에서는 사용하지 않고, 개발 시 stackTrace를 포함할 수 있다.
```
```java
public record ErrorResponse(
    String errorCode,
    String message,
    String path,
    String detail,          // 개발 모드에서만 포함
    String timestamp,
    String correlationId
) {}
```

### 4.2 web.request - 요청 파라미터

#### PageRequest.java
```
역할: 프론트엔드에서 전달하는 페이징 요청 파라미터.
```
```java
public record PageRequest(
    @Min(1) int pageNo,         // 현재 페이지 (기본 1)
    @Min(1) @Max(1000) int pageSize   // 페이지 크기 (기본 20)
) {
    PageRequest()              // 기본값: pageNo=1, pageSize=20
    int offset()               // (pageNo - 1) * pageSize → MyBatis에서 사용
}
```

#### SearchRequest.java
```
역할: 공통 검색 조건을 담는 기본 요청.
      모듈별 검색 DTO가 이를 확장할 수 있다.
```
```java
public record SearchRequest(
    String keyword,            // 검색어
    String fromDate,           // 시작일 (yyyyMMdd)
    String toDate,             // 종료일 (yyyyMMdd)
    String plantCode,          // 공장 코드
    Map<String, Object> extra  // 추가 조건
) {}
```

### 4.3 web.exception - 예외 처리

#### ErrorCode.java
```
역할: 전체 MES 공통 에러 코드 정의.
      코드 체계: C(공통), A(인증), B(비즈니스), E(외부연동).
```
```java
public enum ErrorCode {

    // 공통 (C)
    SUCCESS("C000", "성공"),
    INTERNAL_ERROR("C001", "내부 서버 오류가 발생했습니다"),
    INVALID_PARAMETER("C002", "잘못된 요청 파라미터입니다"),
    DATA_NOT_FOUND("C003", "데이터를 찾을 수 없습니다"),
    DUPLICATE_DATA("C004", "중복된 데이터입니다"),
    CONCURRENT_MODIFICATION("C005", "다른 사용자가 먼저 수정했습니다"),

    // 인증/인가 (A)
    UNAUTHORIZED("A001", "인증이 필요합니다"),
    TOKEN_EXPIRED("A002", "토큰이 만료되었습니다"),
    INVALID_TOKEN("A003", "유효하지 않은 토큰입니다"),
    FORBIDDEN("A004", "접근 권한이 없습니다"),

    // 비즈니스 (B)
    BUSINESS_ERROR("B001", "업무 처리 중 오류가 발생했습니다"),
    SERVICE_EXECUTION_ERROR("B002", "서비스 실행 중 오류가 발생했습니다"),
    VALIDATION_FAILED("B003", "데이터 검증에 실패했습니다"),

    // 외부 연동 (E)
    MODULE_CALL_FAILED("E001", "모듈 간 통신에 실패했습니다"),
    MODULE_TIMEOUT("E002", "모듈 간 통신 시간이 초과되었습니다");

    - String code
    - String message
    + String getCode()
    + String getMessage()
}
```

#### BusinessException.java
```
역할: 비즈니스 로직에서 의도적으로 발생시키는 예외.
      사용자에게 메시지가 노출된다.
      OASIS의 UserExceptionEndEvent와도 매핑된다.
```
```java
public class BusinessException extends RuntimeException {

    - ErrorCode errorCode

    BusinessException(ErrorCode errorCode)
    BusinessException(ErrorCode errorCode, String message)
    static BusinessException of(String message)       // 간편 생성 (B001)

    ErrorCode getErrorCode()
}
```

#### UnauthorizedException.java
```
역할: 인증 실패 시 throw. HTTP 401로 매핑된다.
```
```java
public class UnauthorizedException extends RuntimeException {
    UnauthorizedException(String message)
}
```

#### ForbiddenException.java
```
역할: 권한 없음 시 throw. HTTP 403으로 매핑된다.
```
```java
public class ForbiddenException extends RuntimeException {
    ForbiddenException(String message)
}
```

#### GlobalExceptionHandler.java
```
역할: @RestControllerAdvice로 모든 예외를 ApiResponse 형태로 변환.
      예외 유형별 HTTP 상태 코드와 에러 코드를 매핑한다.
```
```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(400)
    ApiResponse<?> handleBusiness(BusinessException e)
    // → 사용자 메시지 노출, WARN 로그

    @ExceptionHandler(UnauthorizedException.class)
    @ResponseStatus(401)
    ApiResponse<?> handleUnauthorized(UnauthorizedException e)
    // → ErrorCode.UNAUTHORIZED

    @ExceptionHandler(ForbiddenException.class)
    @ResponseStatus(403)
    ApiResponse<?> handleForbidden(ForbiddenException e)
    // → ErrorCode.FORBIDDEN

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(400)
    ApiResponse<?> handleValidation(MethodArgumentNotValidException e)
    // → 필드별 에러 메시지 수집 → ErrorCode.VALIDATION_FAILED

    @ExceptionHandler(Exception.class)
    @ResponseStatus(500)
    ApiResponse<?> handleUnexpected(Exception e)
    // → 내부 메시지 숨김, ERROR 로그 + 스택트레이스
    // → ErrorCode.INTERNAL_ERROR
}
```

### 4.4 web.filter - 서블릿 필터

#### CorrelationIdFilter.java
```
역할: 모든 요청에 고유 추적 ID를 부여한다.
      BFF에서 전달된 X-Correlation-Id가 있으면 사용, 없으면 UUID 생성.
      MDC에도 세팅하여 로그에 자동 포함.
```
```java
@Component @Order(HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    - HEADER_NAME = "X-Correlation-Id"

    @Override
    void doFilterInternal(request, response, chain)
    // → 1. 헤더에서 correlationId 추출 (없으면 UUID.substring(0,8))
    // → 2. CorrelationIdHolder.set(correlationId)
    // → 3. MDC.put("correlationId", correlationId)
    // → 4. response 헤더에도 세팅 (BFF로 반환)
    // → 5. chain.doFilter()
    // → finally: CorrelationIdHolder.clear(), MDC.remove()
}
```

#### CorrelationIdHolder.java
```
역할: ThreadLocal 기반 Correlation ID 보관.
```
```java
public final class CorrelationIdHolder {

    - ThreadLocal<String> HOLDER

    static void set(String id)
    static String get()        // nullable
    static String getId()      // null-safe, 없으면 "-" 반환
    static void clear()
}
```

#### RequestLoggingFilter.java
```
역할: API 요청/응답을 한 줄로 로깅한다.
```
```java
@Component @Order(HIGHEST_PRECEDENCE + 1)
public class RequestLoggingFilter extends OncePerRequestFilter {

    - Logger log ("API_ACCESS")

    @Override
    void doFilterInternal(request, response, chain)
    // → 시작 시간 기록
    // → chain.doFilter()
    // → [POST] /api/workorder/search/list → 200 (user=admin, 156ms)
}
```

#### RequestTimingFilter.java
```
역할: 요청 처리 시간을 측정하여 응답 헤더에 추가한다.
```
```java
@Component @Order(HIGHEST_PRECEDENCE + 2)
public class RequestTimingFilter extends OncePerRequestFilter {

    @Override
    void doFilterInternal(request, response, chain)
    // → 처리 시간 측정 → X-Response-Time 헤더에 추가 (ms)
}
```

### 4.5 web.cors - CORS 설정

#### CorsConfig.java
```
역할: CORS 허용 정책을 설정한다.
      개발/운영 환경별로 다르게 적용할 수 있다.
```
```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    void addCorsMappings(CorsRegistry registry)
    // → /api/** 경로에 대해
    // → allowedOrigins: 환경변수로 설정 가능 (기본: *)
    // → allowedMethods: GET, POST, PUT, DELETE, PATCH
    // → allowedHeaders: *
    // → allowCredentials: true (쿠키 전달 시)
}
```

### 필터 실행 순서
```
요청 →
  1. CorrelationIdFilter    (HIGHEST_PRECEDENCE)     → 추적 ID 생성
  2. RequestLoggingFilter   (HIGHEST_PRECEDENCE + 1) → 요청 로깅 시작
  3. RequestTimingFilter    (HIGHEST_PRECEDENCE + 2) → 타이밍 시작
  4. JwtAuthenticationFilter (HIGHEST_PRECEDENCE + 10)→ JWT 검증
  5. Spring DispatcherServlet → Controller
← 응답 (역순으로 필터 후처리)
```

---

## 5. datasource - 데이터 접근 계층

### 역할
DataSource, 커넥션 풀(HikariCP), 트랜잭션 매니저를 설정한다.
다중 DataSource가 필요한 경우 라우팅을 지원한다.

### 클래스 상세

#### DataSourceConfig.java
```
역할: 기본 DataSource(HikariCP)와 TransactionManager를 생성한다.
```
```java
@Configuration
public class DataSourceConfig {

    @Bean @Primary @ConditionalOnMissingBean
    DataSource dataSource()
    // → spring.datasource.* 프로퍼티에서 HikariDataSource 생성

    @Bean @Primary @ConditionalOnMissingBean
    PlatformTransactionManager transactionManager(DataSource ds)
    // → DataSourceTransactionManager 생성
}
```

#### MultiDataSourceRouter.java
```
역할: 다중 DataSource 환경에서 현재 컨텍스트에 따라 DataSource를 선택한다.
      AbstractRoutingDataSource를 확장한다.
      (필요한 모듈에서만 활성화)
```
```java
public class MultiDataSourceRouter extends AbstractRoutingDataSource {

    @Override
    Object determineCurrentLookupKey()
    // → ThreadLocal에서 현재 DataSource 키 조회
    // → 기본값: "primary"
}

// 사용법:
// DataSourceContextHolder.set("secondary");
// → SQL 실행 → secondary DataSource 사용
// DataSourceContextHolder.clear();
```

#### DataSourceContextHolder.java
```
역할: 다중 DataSource 환경에서 현재 스레드의 DataSource 키를 관리.
```
```java
public final class DataSourceContextHolder {

    - ThreadLocal<String> HOLDER

    static void set(String key)
    static String get()
    static void clear()
}
```

#### TransactionManagerConfig.java
```
역할: OASIS의 TransactionManagerWarehouse에 Spring TransactionManager를 등록한다.
      OASIS BPMN의 트랜잭션 스크립트 태스크(commit/rollback)가 동작하도록 한다.
```
```java
@Configuration
public class TransactionManagerConfig {

    @PostConstruct
    void registerToOasis()
    // → TransactionManagerWarehouse.register(transactionManager)
}
```

---

## 6. mybatis - MyBatis 공통

### 역할
MyBatis 설정, TypeHandler(타입 변환), Interceptor(자동 처리),
PaginationDialect(DB별 페이징)를 제공한다.

### 6.1 mybatis (루트)

#### MyBatisConfig.java
```
역할: SqlSessionFactory를 구성하고, TypeHandler/Interceptor를 등록한다.
```
```java
@Configuration
public class MyBatisConfig {

    @Bean @ConditionalOnMissingBean
    SqlSessionFactory sqlSessionFactory(DataSource ds, CactusProperties props,
                                         PaginationDialect dialect)
    // → 1. 매퍼 위치: resources/persistence/**/*.xml
    // → 2. 설정:
    //      mapUnderscoreToCamelCase = true   (COLUMN_NAME → columnName)
    //      callSettersOnNulls = true          (null도 setter 호출)
    //      jdbcTypeForNull = NULL             (null → JDBC NULL)
    // → 3. TypeHandler 등록: Boolean, LocalDateTime, Json
    // → 4. Interceptor 등록: Pagination, Audit, SlowQuery
}
```

### 6.2 mybatis.handler - TypeHandler

#### BooleanTypeHandler.java
```
역할: DB의 'Y'/'N' 또는 '1'/'0' ↔ Java boolean 변환.
```
```java
@MappedTypes(Boolean.class)
public class BooleanTypeHandler extends BaseTypeHandler<Boolean> {

    @Override void setNonNullParameter(ps, i, parameter, jdbcType)
    // → true → "Y" / false → "N"

    @Override Boolean getNullableResult(rs, columnName)
    // → "Y" 또는 "1" → true, 나머지 → false
}
```

#### LocalDateTimeTypeHandler.java
```
역할: DB의 TIMESTAMP/VARCHAR(14) ↔ Java LocalDateTime 변환.
      yyyyMMddHHmmss 형식 문자열도 지원한다.
```
```java
@MappedTypes(LocalDateTime.class)
public class LocalDateTimeTypeHandler extends BaseTypeHandler<LocalDateTime> {

    @Override void setNonNullParameter(ps, i, parameter, jdbcType)
    // → Timestamp.valueOf(parameter) 또는 포맷 문자열

    @Override LocalDateTime getNullableResult(rs, columnName)
    // → Timestamp → LocalDateTime 또는 String → parse
}
```

#### JsonTypeHandler.java
```
역할: DB의 TEXT/CLOB ↔ Java Object(Map/List) JSON 변환.
      Gson을 사용한다.
```
```java
@MappedTypes(Object.class)
public class JsonTypeHandler extends BaseTypeHandler<Object> {

    - Gson gson

    @Override void setNonNullParameter(ps, i, parameter, jdbcType)
    // → gson.toJson(parameter)

    @Override Object getNullableResult(rs, columnName)
    // → gson.fromJson(str, Object.class)
}
```

### 6.3 mybatis.interceptor - Interceptor

#### PaginationInterceptor.java
```
역할: 파라미터에 _pageNo, _pageSize가 있으면 SQL을 페이징 SQL로 자동 래핑한다.
      PaginationDialect에 위임하여 DB 비종속으로 동작한다.
```
```java
@Intercepts(@Signature(type = StatementHandler.class, method = "prepare", ...))
public class PaginationInterceptor implements Interceptor {

    - PaginationDialect dialect

    @Override Object intercept(Invocation invocation)
    // → 1. BoundSql에서 파라미터 추출
    // → 2. _pageNo, _pageSize 존재 여부 확인
    // → 3. 있으면 dialect.wrapPagination(originalSql)로 SQL 교체
    // → 4. invocation.proceed()
}
```

#### AuditInterceptor.java
```
역할: INSERT/UPDATE 시 감사 필드(생성자, 수정자, 일시)를 자동 채운다.
      UserContextHolder에서 현재 사용자 ID를 가져온다.
```
```java
@Intercepts(@Signature(type = Executor.class, method = "update", ...))
public class AuditInterceptor implements Interceptor {

    @Override Object intercept(Invocation invocation)
    // → 1. MappedStatement에서 SqlCommandType 확인 (INSERT/UPDATE)
    // → 2. 파라미터가 Map이면:
    //      INSERT: createUserId, createDate 자동 세팅
    //      INSERT/UPDATE: updateUserId, updateDate 자동 세팅
    // → 3. 사용자: UserContextHolder.getUserId() (없으면 "SYSTEM")
    // → 4. 일시: yyyyMMddHHmmss 포맷
}
```

**자동 채움 필드:**
| SQL 유형 | 필드명 | 값 |
|---------|--------|-----|
| INSERT | createUserId | 현재 사용자 ID |
| INSERT | createDate | 현재 일시 (yyyyMMddHHmmss) |
| INSERT/UPDATE | updateUserId | 현재 사용자 ID |
| INSERT/UPDATE | updateDate | 현재 일시 (yyyyMMddHHmmss) |

#### SlowQueryInterceptor.java
```
역할: 실행 시간이 임계값을 초과하는 SQL을 WARN 로그로 기록한다.
```
```java
@Intercepts(@Signature(type = StatementHandler.class, method = "query", ...))
public class SlowQueryInterceptor implements Interceptor {

    - long thresholdMs  // 기본 3000ms
    - Logger log ("SLOW_QUERY")

    @Override Object intercept(Invocation invocation)
    // → 실행 전후 시간 측정
    // → thresholdMs 초과 시: [SLOW] 3200ms | SELECT * FROM TB_WORK_ORDER WHERE ...
}
```

### 6.4 mybatis.dialect - 페이징 방언

#### PaginationDialect.java (인터페이스)
```
역할: DB별 페이징 SQL 생성 전략의 추상화.
```
```java
public interface PaginationDialect {
    String wrapPagination(String originalSql);
}
```

#### OraclePaginationDialect.java
```
역할: Oracle ROWNUM 방식 페이징.
```
```java
public class OraclePaginationDialect implements PaginationDialect {

    @Override String wrapPagination(String sql)
    // → SELECT * FROM (
    //     SELECT A.*, ROWNUM AS RN FROM ( {sql} ) A
    //     WHERE ROWNUM <= #{_offset} + #{_pageSize}
    //   ) WHERE RN > #{_offset}
}
```

#### StandardPaginationDialect.java
```
역할: LIMIT-OFFSET 방식 페이징 (PostgreSQL, MySQL, H2 등).
```
```java
public class StandardPaginationDialect implements PaginationDialect {

    @Override String wrapPagination(String sql)
    // → {sql} LIMIT #{_pageSize} OFFSET #{_offset}
}
```

#### Dialect 자동 감지 로직
```
JDBC URL 기반 자동 감지 (cactus.datasource.dialect=auto일 때):

jdbc:oracle:*       → OraclePaginationDialect
jdbc:postgresql:*   → StandardPaginationDialect
jdbc:mysql:*        → StandardPaginationDialect
jdbc:mariadb:*      → StandardPaginationDialect
jdbc:h2:*           → StandardPaginationDialect
jdbc:sqlserver:*    → SqlServerPaginationDialect (향후 확장)
```

---

## 7. client - 모듈 간 통신

### 역할
백엔드 모듈 간 REST API 호출을 위한 공통 클라이언트를 제공한다.
JWT와 Correlation ID를 자동으로 전파한다.
Spring 7의 RestClient를 사용한다.

### 클래스 상세

#### ModuleClient.java (추상 클래스)
```
역할: 모듈 간 REST 호출의 기본 클래스.
      각 모듈에서 이를 상속하여 타 모듈 API를 호출한다.
```
```java
public abstract class ModuleClient {

    // ── 의존성 ──
    - RestClient restClient    // Spring 7 RestClient
    - String moduleName        // 대상 모듈명

    // ── 생성자 ──
    protected ModuleClient(ModuleClientConfig config, String moduleName)
    // → config.getModuleUrl(moduleName)으로 baseUrl 획득
    // → RestClient.builder().baseUrl(baseUrl)
    //     .requestInterceptor(new JwtPropagatingInterceptor())
    //     .build()

    // ── 보호 메서드 (하위 클래스에서 사용) ──

    protected <T> T get(String path, Class<T> responseType)
    // → restClient.get().uri(path).retrieve().body(responseType)
    // → 실패 시 BusinessException(MODULE_CALL_FAILED) throw

    protected <T> T post(String path, Object body, Class<T> responseType)
    // → restClient.post().uri(path).body(body).retrieve().body(responseType)
    // → 실패 시 BusinessException(MODULE_CALL_FAILED) throw

    protected <T> T put(String path, Object body, Class<T> responseType)
    protected void delete(String path)
}
```

**각 모듈에서의 사용 예시:**
```java
// dmes-operation 프로젝트에서
@Component
public class LogisticsModuleClient extends ModuleClient {

    public LogisticsModuleClient(ModuleClientConfig config) {
        super(config, "logistics");
    }

    public Map<String, Object> getInventory(String itemCode) {
        return get("/api/logistics/inventory/" + itemCode, Map.class);
    }

    public void requestShipping(Map<String, Object> params) {
        post("/api/logistics/shipping/request", params, Map.class);
    }
}
```

#### ModuleClientConfig.java
```
역할: ModuleClient 생성에 필요한 설정을 제공한다.
      모듈별 URL 조회, RestClient 설정.
```
```java
@Configuration
public class ModuleClientConfig {

    - CactusProperties properties

    String getModuleUrl(String moduleName)
    // → properties.client.moduleUrls.get(moduleName)
    // → 없으면 IllegalArgumentException

    Duration getConnectTimeout()
    // → properties.client.connectTimeout → Duration.ofMillis(...)

    Duration getReadTimeout()
    // → properties.client.readTimeout → Duration.ofMillis(...)
}
```

#### JwtPropagatingInterceptor.java
```
역할: 모듈 간 REST 호출 시 현재 요청의 JWT, Correlation ID를 자동 전파한다.
      ClientHttpRequestInterceptor 구현.
```
```java
public class JwtPropagatingInterceptor implements ClientHttpRequestInterceptor {

    @Override
    ClientHttpResponse intercept(HttpRequest request, byte[] body,
                                  ClientHttpRequestExecution execution)
    // → 1. JwtTokenHolder.get() → Authorization: Bearer {token} 헤더 추가
    // → 2. CorrelationIdHolder.get() → X-Correlation-Id 헤더 추가
    // → 3. execution.execute(request, body)
}
```

#### ModuleClientProperties.java
```
역할: cactus.client.* 프로퍼티 바인딩 전용.
      CactusProperties.ClientProperties와 동일 (분리 가능).
```

#### CircuitBreakerClient.java
```
역할: ModuleClient에 서킷 브레이커 패턴을 적용한 데코레이터.
      연속 실패 시 빠른 실패 처리로 장애 전파를 방지한다.
      (1.1 버전 이후 확장 예정)
```
```java
public class CircuitBreakerClient {

    // ── 상태 ──
    - State state = CLOSED     // CLOSED → OPEN → HALF_OPEN
    - int failureCount
    - int failureThreshold = 5
    - long openTimeout = 30000  // 30초 후 HALF_OPEN 전환

    <T> T execute(Supplier<T> action, Supplier<T> fallback)
    // → CLOSED: action 실행, 실패 시 failureCount++
    // → OPEN: fallback 즉시 반환
    // → HALF_OPEN: action 시도, 성공 시 CLOSED / 실패 시 OPEN
}
```

---

## 8. audit - 감사 추적

### 역할
누가(userId), 언제(timestamp), 무엇을(action, resource) 했는지를 기록한다.
`ServiceMetadataRegistry`의 `audit: true` 설정으로 선언적 감사 로깅을 지원한다.
`OasisController`가 메타데이터를 참조하여 자동으로 감사 로그를 기록한다.

> **변경**: 기존 `@Auditable` 어노테이션 + `AuditAspect` AOP 방식에서
> `service-metadata.yml` + `OasisController` 방식으로 변경.
> 공통 서비스 컨트롤러 도입으로 메서드 단위 AOP가 불필요해짐.

### 클래스 상세

#### AuditLog.java (record)
```
역할: 감사 로그 한 건의 데이터를 담는다.
```
```java
public record AuditLog(
    String logId,            // UUID
    String userId,           // 실행 사용자
    String action,           // 행위 (ServiceMetadata.name)
    String resource,         // 대상 리소스 (serviceId)
    String status,           // SUCCESS | FAIL
    String errorMessage,     // 실패 시 에러 메시지
    long elapsedMs,          // 소요 시간 (ms)
    String correlationId,    // 요청 추적 ID
    String moduleId,         // 모듈 ID
    LocalDateTime timestamp  // 발생 시간
) {
    static Builder builder()   // Builder 패턴
}
```

#### AuditLogger.java
```
역할: AuditLog를 실제로 기록한다.
      설정(cactus.audit.target)에 따라 DB, 로그 파일, 또는 둘 다에 기록한다.
```
```java
@Component
public class AuditLogger {

    - CactusProperties.AuditProperties auditProperties
    - Logger log ("AUDIT")

    void log(AuditLog auditLog)
    // → target이 "log" 또는 "both"이면: 로그 파일에 기록
    //   [AUDIT] userId=admin action=작업지시 저장 resource=WORK_ORDER status=SUCCESS 156ms
    // → target이 "db" 또는 "both"이면: DB 테이블에 INSERT (비동기)

    void logServiceError(String serviceName, Exception e)
    // → OASIS 서비스 실행 실패 시 호출
    // → ERROR 로그로 기록
}
```

---

## 9. cache - 캐시

### 역할
자주 참조되는 데이터(공통코드 등)를 로컬 메모리에 캐싱한다.
Caffeine 기반 로컬 캐시를 사용한다.

### 클래스 상세

#### CacheConfig.java
```
역할: Caffeine CacheManager를 설정한다.
```
```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean @ConditionalOnMissingBean
    CacheManager cacheManager()
    // → CaffeineCacheManager
    // → maximumSize: 1000
    // → expireAfterWrite: 30분
    // → recordStats: true (모니터링용)
}
```

#### CacheNames.java
```
역할: 캐시 이름 상수를 정의한다.
```
```java
public final class CacheNames {
    public static final String COMMON_CODE = "commonCode";
    public static final String MENU = "menu";
    public static final String USER_PERMISSION = "userPermission";
    public static final String BPMN_SERVICE = "bpmnService";

    private CacheNames() {}
}
```

#### CommonCodeCache.java
```
역할: 공통코드를 캐싱하여 제공한다.
      Portal 모듈의 공통코드 API를 호출하여 결과를 캐싱한다.
```
```java
@Component
public class CommonCodeCache {

    - ModuleClientConfig clientConfig

    @Cacheable(value = COMMON_CODE, key = "#groupCode")
    List<Map<String, Object>> getCodeList(String groupCode)
    // → Portal API 호출: GET /api/portal/code/{groupCode}
    // → 결과 캐싱 (30분)

    String getCodeName(String groupCode, String code)
    // → getCodeList() 결과에서 code에 해당하는 codeName 반환
    // → 없으면 code 그대로 반환

    @CacheEvict(value = COMMON_CODE, allEntries = true)
    void evictAll()
    // → Portal에서 공통코드 변경 시 호출
    // → 전체 캐시 무효화

    @CacheEvict(value = COMMON_CODE, key = "#groupCode")
    void evict(String groupCode)
    // → 특정 그룹 캐시만 무효화
}
```

---

## 10. logging - 로깅

### 역할
구조화된 로깅을 설정한다.
MDC(Mapped Diagnostic Context)로 요청 추적 정보를 로그에 자동 포함한다.

### 클래스 상세

#### LoggingConfig.java
```
역할: 로깅 관련 Bean을 설정한다.
```
```java
@Configuration
public class LoggingConfig {

    @Bean @ConditionalOnMissingBean
    MdcFilter mdcFilter(CactusProperties properties)
}
```

#### MdcFilter.java
```
역할: 요청 처리 중 MDC에 컨텍스트 정보를 세팅한다.
      로그 패턴에서 %X{key}로 자동 출력된다.
```
```java
@Component
public class MdcFilter extends OncePerRequestFilter {

    - CactusProperties properties

    @Override
    void doFilterInternal(request, response, chain)
    // → MDC.put("moduleId", properties.moduleId)
    // → MDC.put("requestUri", request.getRequestURI())
    // → MDC.put("userId", UserContextHolder.getUserId())  // 필터 순서상 JWT 이후
    // → chain.doFilter()
    // → finally: MDC.clear()
}
```

**MDC에 자동 세팅되는 값:**
| 키 | 값 | 세팅 위치 |
|---|---|----------|
| correlationId | 요청 추적 ID | CorrelationIdFilter |
| moduleId | 모듈 ID | MdcFilter |
| requestUri | 요청 URI | MdcFilter |
| userId | 사용자 ID | MdcFilter |

#### ServiceExecutionLogger.java
```
역할: OASIS 서비스 실행 로그 전용 유틸.
      OasisController에서 호출한다.
```
```java
@Component
public class ServiceExecutionLogger {

    - Logger log ("OASIS_EXECUTION")

    void logExecution(String serviceName, long elapsedMs, String status)
    // → [OASIS] workorder/search completed in 142ms

    void logSlowExecution(String serviceName, long elapsedMs, long threshold)
    // → [OASIS] workorder/search SLOW execution: 35000ms (threshold: 30000ms)

    void logError(String serviceName, Exception e, long elapsedMs)
    // → [OASIS] workorder/save FAILED in 500ms: NullPointerException
}
```

**로그 출력 예시:**
```
2026-03-12 10:30:45.123 [http-nio-8082-exec-1] [abc12345] INFO  API_ACCESS     - [POST] /api/workorder/search/list → 200 (user=admin, 156ms)
2026-03-12 10:30:45.100 [http-nio-8082-exec-1] [abc12345] INFO  OASIS_EXECUTION - [OASIS] workorder/search completed in 142ms
2026-03-12 10:30:48.500 [http-nio-8082-exec-3] [def67890] WARN  SLOW_QUERY     - [SLOW] 3200ms | SELECT * FROM TB_WORK_ORDER WHERE PLANT_CD = ?
2026-03-12 10:31:00.000 [http-nio-8082-exec-5] [ghi11111] INFO  AUDIT          - [AUDIT] userId=admin action=작업지시 저장 resource=WORK_ORDER status=SUCCESS 200ms
```

---

## 11. util - 유틸리티

### 역할
프로젝트 전반에서 사용하는 정적 유틸리티 메서드를 제공한다.
모두 `final class` + `private constructor` + `static method`로 구현한다.

### 클래스 상세

#### DateUtils.java
```
역할: 날짜/시간 변환 유틸.
```
```java
public final class DateUtils {

    static String now()                          // yyyyMMddHHmmss
    static String today()                        // yyyyMMdd
    static String format(LocalDateTime dt, String pattern)
    static LocalDateTime parse(String str, String pattern)
    static LocalDateTime parse(String yyyyMMddHHmmss)   // 기본 포맷
    static String toDisplayDate(String yyyyMMdd)         // 2026-03-12
    static String toDisplayDateTime(String yyyyMMddHHmmss) // 2026-03-12 10:30:45
}
```

#### StringUtils.java
```
역할: 문자열 처리 유틸.
```
```java
public final class StringUtils {

    static boolean isEmpty(String str)           // null 또는 ""
    static boolean isNotEmpty(String str)
    static boolean isBlank(String str)           // null 또는 공백만
    static boolean isNotBlank(String str)
    static String defaultIfBlank(String str, String defaultStr)
    static String leftPad(String str, int size, char padChar)
    static String rightPad(String str, int size, char padChar)
    static String truncate(String str, int maxLength)
    static String toCamelCase(String underscore)   // WORK_ORDER → workOrder
    static String toSnakeCase(String camelCase)    // workOrder → WORK_ORDER
}
```

#### MapUtils.java
```
역할: Map 조작 유틸. OASIS는 Map<String, TypedObject> 기반이므로 필수.
```
```java
public final class MapUtils {

    static String getString(Map<String, Object> map, String key)
    static String getString(Map<String, Object> map, String key, String defaultValue)
    static int getInt(Map<String, Object> map, String key)
    static int getInt(Map<String, Object> map, String key, int defaultValue)
    static long getLong(Map<String, Object> map, String key)
    static boolean getBoolean(Map<String, Object> map, String key)
    static <T> List<T> getList(Map<String, Object> map, String key)
    static Map<String, Object> getMap(Map<String, Object> map, String key)
    static Map<String, Object> of(String k1, Object v1, ...)   // 간편 생성
    static boolean isEmpty(Map<?, ?> map)                       // null 또는 empty
}
```

#### JsonUtils.java
```
역할: JSON 직렬화/역직렬화 유틸. Gson 기반.
```
```java
public final class JsonUtils {

    - Gson gson (내부 싱글턴)

    static String toJson(Object obj)
    static <T> T fromJson(String json, Class<T> type)
    static <T> List<T> fromJsonList(String json, Class<T> elementType)
    static Map<String, Object> toMap(String json)
    static String toPrettyJson(Object obj)        // 디버깅용
}
```

#### MaskingUtils.java
```
역할: 개인정보 마스킹 유틸. 로그 출력 시 사용.
```
```java
public final class MaskingUtils {

    static String maskName(String name)           // 홍*동
    static String maskPhone(String phone)         // 010-****-1234
    static String maskEmail(String email)         // ho***@example.com
    static String maskAccount(String account)     // ****-**-1234567
}
```

---

## 12. 패키지 의존 관계 전체 요약

```
autoconfigure ─────── (모든 패키지의 Bean을 등록)
     │
     ├── oasis ─────── OASIS Core (oasis-core JAR)
     │     │
     │     ├── security.context (UserContextHolder)
     │     ├── service (ServiceMetadataRegistry)
     │     └── audit (AuditLogger)
     │
     ├── service ────── 공통 서비스 컨트롤러 (★ 핵심)
     │     ├── oasis (OasisServiceExecutor, OasisController)
     │     ├── converter (CactusRequestConverter, CactusResponseConverter)
     │     └── audit (AuditLogger)
     │
     ├── security
     │     ├── jwt ────── JJWT 라이브러리
     │     └── context ── (독립, ThreadLocal)
     │
     ├── web
     │     ├── response ─ (독립)
     │     ├── request ── (독립)
     │     ├── exception ─ web.response
     │     ├── filter ──── security.context, logging
     │     └── cors ────── (독립)
     │
     ├── datasource ──── Spring JDBC, HikariCP
     │
     ├── mybatis ──────── datasource, security.context
     │     ├── handler ── (독립)
     │     ├── interceptor ── security.context, logging
     │     └── dialect ── (독립, Strategy Pattern)
     │
     ├── client ──────── security.jwt (JwtTokenHolder), web.filter (CorrelationIdHolder)
     │
     ├── audit ────────── security.context, logging
     │
     ├── cache ────────── client (Portal 호출)
     │
     ├── logging ──────── (독립, SLF4J + MDC)
     │
     └── util ─────────── (독립, 정적 유틸)
```

### 외부 의존 방향 (모듈 간 참조 불가)
```
각 MES 모듈 (dmes-operation 등)
     │
     └── Cactus (cactus JAR) ─── 단방향 의존
              │
              └── OASIS Core (oasis-core JAR) ─── 단방향 의존
```
