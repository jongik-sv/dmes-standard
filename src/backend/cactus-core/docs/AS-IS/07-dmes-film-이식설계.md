# dmes-film 공통 모듈 분석 및 cactus-core 이식 설계

> 일시: 2026-04-01 (원본) / 2026-04-26 (현행 사실 박스)
> 상태: Draft (원본) — 일부 항목은 마이그레이션으로 구현 완료
> 목적: dmes-film 단일 모듈 프로젝트의 공통 로직을 분석하고, 멀티 모듈 프로젝트(조업관리, 품질관리, 물류관리 등)를 위한 공통 라이브러리 cactus-core에 이식하는 전략을 수립한다.
>
> **현행 사실 (마이그레이션 완료, 2026-04-26)**
> - 패키지: 본문의 `com.dongkuk.cactus.*` 코드 예시는 모두 현행 `com.dongkuk.dmes.cactus.*` 로 읽는다. group `com.dongkuk` → `com.dongkuk.dmes`.
> - `@ComponentScan("com.dongkuk.cactus")` / `physical-strategy: com.dongkuk.cactus.persistence.naming.UpperSnakeCaseNamingStrategy` 같은 본문 예시도 동일하게 `com.dongkuk.dmes.cactus` 로 치환되어 동작한다.
> - 이미 이식 완료된 항목 (cactus-core 본체에 반영됨):
>   - 감사 엔티티 / 리스너: `com.dongkuk.dmes.cactus.audit.{CactusAudit, CactusAuditEntity, CactusAuditListener, CactusMybatisAuditInterceptor}` + `AuditAutoConfiguration`
>   - MyBatis SQL 로거: `com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor`
>   - TxId / 요청 식별자: `com.dongkuk.dmes.cactus.util.TxIdGenerator`, `com.dongkuk.dmes.cactus.web.filter.{TxIdFilter, RequestIdFilter}`
>   - 보안 표준 필터: `com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter`, `com.dongkuk.dmes.cactus.security.jwt.JwtAuthenticationFilter`
> - 멀티 모듈/이식 전략 자체의 의사결정 맥락은 보존을 위해 본문 그대로 유지한다.

---

## 1. 프로젝트 배경

### 1.1 dmes-film

동국제강 필름 사업부 MES 시스템. 단일 모듈 구조로, 공통 코드가 `cmn` 패키지에 포함되어 있다.

| 항목 | 내용 |
|------|------|
| 프로젝트 구조 | 멀티 모듈 (core, biz, portal, http, toss) |
| Java 버전 | 11 |
| Spring Boot | 2.x (Spring 5.3.20) |
| ORM | JPA (Hibernate 5.6.9) + MyBatis 3.5.10 |
| OASIS | 4.18.1 |
| UI 프레임워크 | Nexacro |
| 인증 | Base64 JSON Authorization + JWT (JJWT 0.9.1) |
| DB | Oracle |

### 1.2 cactus-core

신규 MES 프로젝트를 위한 공통 프레임워크 라이브러리. 여러 업무 모듈에서 의존하는 공유 기반.

| 항목 | 내용 |
|------|------|
| 프로젝트 구조 | 단일 라이브러리 모듈 (jar) |
| Java 버전 | 21 |
| Spring Boot | 4.0.3 |
| ORM | JPA (Hibernate 6.x) + MyBatis (선택) |
| OASIS | 5.0.0 |
| UI 프레임워크 | React (Next.js BFF) |
| 인증 | JWT Bearer (JJWT 0.12.5) |
| DB | Oracle / PostgreSQL |

### 1.3 왜 이식이 필요한가

dmes-film은 단일 모듈이라 공통 코드가 `cmn` 패키지에 직접 들어있어도 문제없다. 하지만 신규 프로젝트는 **조업관리, 품질관리, 물류관리** 등 여러 모듈로 나뉘며, 각 모듈이 동일한 감사 엔티티, 마스터 코드, 예외 처리, 보안 등을 공유해야 한다. 이를 각 모듈에 복사하면 유지보수가 불가능해지므로, **cactus-core 라이브러리로 추출**하여 의존성으로 공유한다.

```
[ cactus-core ]  ← 공통 프레임워크 (jar)
      ↑
  ┌───┼───────────┬────────────┐
  │               │            │
[조업관리]     [품질관리]    [물류관리]
 (모듈A)       (모듈B)      (모듈C)
```

---

## 2. dmes-film 공통 모듈 상세 분석

### 2.1 감사 엔티티 (Audit)

**위치**: `com.dongkuk.dmes.film.cmn.audit`, `com.dongkuk.dmes.film.sec.audit`

film의 모든 업무 엔티티는 `VersionAuditEntity`를 상속하여 생성/수정 이력을 자동 기록한다.

**VersionAuditEntity.java** — 추상 기반 엔티티

```java
@MappedSuperclass
@EntityListeners(VersionAuditListener.class)
public abstract class VersionAuditEntity {
    // 생성 감사
    private String cUserId;       // 생성자 ID
    private LocalDateTime cAt;    // 생성 일시
    private String cSvcId;        // 생성 서비스 ID (OASIS serviceId)
    private String cPgmId;        // 생성 프로그램 ID

    // 수정 감사
    private String uUserId;       // 수정자 ID
    private LocalDateTime uAt;    // 수정 일시
    private String uSvcId;        // 수정 서비스 ID
    private String uPgmId;        // 수정 프로그램 ID

    // 낙관적 잠금
    @Version
    private Long version;
}
```

**VersionAuditListener.java** — JPA EntityListener

```java
public class VersionAuditListener {
    @PrePersist
    public void prePersist(VersionAuditEntity entity) {
        // FilmAudit에서 현재 userId, serviceId, programId 추출
        // cUserId, cAt, cSvcId, cPgmId 설정
    }

    @PreUpdate
    public void preUpdate(VersionAuditEntity entity) {
        // uUserId, uAt, uSvcId, uPgmId 설정
    }
}
```

**FilmAudit.java** — 감사 정보 제공자

```java
public class FilmAudit {
    // ThreadLocal 또는 MDC에서 현재 사용자/서비스 정보 추출
    public static String getUserId() { ... }
    public static String getServiceId() { ... }
    public static String getProgramId() { ... }
}
```

**사용 패턴**:

```java
@Entity
@Table(name = "TB_BIZ_ORDER")
public class OrderEntity extends VersionAuditEntity {
    @Id
    private String orderId;
    private String itemCd;
    private Integer qty;
    // 감사 필드는 VersionAuditEntity에서 상속
}
```

**평가**:
- 모든 업무 엔티티의 기반이 되는 핵심 공통 기능
- svcId, pgmId까지 추적하는 것은 OASIS 서비스 기반 아키텍처 특성
- cactus에서는 단순화 가능 (createdBy/updatedBy + menuId 수준)

---

### 2.2 MyBatis SQL 로거

**위치**: `com.dongkuk.dmes.film.cmn.access.log.MybatisSqlLogger`

MyBatis Interceptor로 실행되는 모든 SQL과 바인딩 파라미터를 로깅한다.

```java
@Intercepts({
    @Signature(type = Executor.class, method = "query", args = {...}),
    @Signature(type = Executor.class, method = "update", args = {...})
})
public class MybatisSqlLogger implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
        String queryId = ms.getId();           // 쿼리 ID (namespace.id)
        BoundSql boundSql = ms.getBoundSql(...);
        String sql = boundSql.getSql();        // 실행 SQL

        // 바인딩 파라미터 추출
        List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
        // 각 파라미터의 이름, 값, 타입 로깅

        log.debug("[SQL] queryId={}, sql={}, params={}", queryId, sql, params);

        return invocation.proceed();  // 원본 실행
    }
}
```

**로그 출력 예시**:

```
[SQL] queryId=com.dongkuk.dmes.film.biz.mcm.mapper.OrderMapper.selectOrders
      sql=SELECT ORDER_ID, ITEM_CD, QTY FROM TB_BIZ_ORDER WHERE PLANT_CD = ? AND STATUS = ?
      params=[{name=plantCd, value=P01, type=String}, {name=status, value=10, type=String}]
```

**평가**:
- 개발/디버깅 시 필수적인 기능
- MyBatis 사용하는 모든 프로젝트에 공통 적용 가능
- 성능 영향 최소 (로그 레벨로 제어)

---

### 2.3 마스터 코드 프레임워크

**위치**: `com.dongkuk.dmes.film.cmn.master`

MES 시스템 전반에서 사용하는 공통 코드(상태 코드, 유형 코드, 구분자 등)를 관리한다.

**MasterCode.java** — DTO

```java
public class MasterCode {
    private String code;     // 코드 값 (예: "10")
    private String value;    // 코드 값 (동의어)
    private String meaning;  // 표시명 (예: "진행중")
    private String group;    // 코드 그룹 (예: "ORDER_STATUS")
}
```

**인터페이스**:

```java
// 코드값 → 표시명 변환
public interface MasterCodeDecoder {
    String decode(String value, String code);
}

// 코드 그룹의 전체 목록 조회
public interface MasterCodeManager {
    List<MasterCode> getMasterCodeList(String code, String group);
}
```

**MC.java** — Static 파사드 (사용 진입점)

```java
public class MC {
    private static MasterCodeDecoder decoder;
    private static MasterCodeManager manager;

    // 코드값 → 표시명
    public static String decode(String value, String code) {
        return decoder.decode(value, code);
    }

    // 코드 그룹 목록
    public static List<MasterCode> getMasterCodeList(String code, String group) {
        return manager.getMasterCodeList(code, group);
    }
}
```

**film의 구현**: CSV 파일 기반

```java
// MasterCodeConfig에서 CSV 기반 구현체를 MC에 주입
@Configuration
public class MasterCodeConfig {
    @Bean
    public MasterCodeDecoder masterCodeDecoder() {
        return new CsvMasterCodeDecoder("classpath:master-codes.csv");
    }

    @Bean
    public MasterCodeManager masterCodeManager() {
        return new CsvMasterCodeManager("classpath:master-codes.csv");
    }
}
```

**사용 패턴** (업무 코드 어디서든):

```java
// 코드 디코딩
String statusName = MC.decode("10", "ORDER_STATUS");  // → "진행중"

// 콤보박스 목록
List<MasterCode> statusList = MC.getMasterCodeList("ORDER_STATUS", "ALL");
```

**평가**:
- MES에서 가장 빈번하게 사용하는 공통 기능
- film은 CSV 기반이지만, 운영 환경에서는 DB 기반이 적합
- Static 파사드 패턴(MC.decode)은 사용이 편리하여 유지할 가치가 있음
- 캐싱이 필수 (코드 테이블은 자주 변경되지 않음)

---

### 2.4 요청 로그 저장

**위치**: `com.dongkuk.dmes.film.cmn.access.log`

모든 HTTP 요청을 DB에 기록하여 감사 추적(audit trail)을 제공한다.

**RequestLog.java** — Entity

```java
@Entity
@Table(name = "TB_CMN_REQUEST_LOG")
public class RequestLog {
    @Id
    private String id;                    // 커스텀 ID 생성
    private LocalDateTime timestamp;       // 요청 시각
    private String requestUrl;            // 요청 URL
    private String serviceTag;            // 4자리 스레드 식별자
    private String serviceRequestTag;     // 8자리 요청 식별자
    private String content;               // 요청 본문 (JSON)
    private String serviceResultCode;     // 처리 결과 코드
}
```

**TraceIdLoggingFilter.java** — MDC 기반 추적 ID 관리

```java
public class TraceIdLoggingFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ...) {
        // MDC에 SERVICE_TAG (4자리), SERVICE_REQUEST_TAG (8자리) 설정
        // 요청 처리 후 MDC 클리어
    }
}
```

**ServiceController에서의 사용**:

```java
// 요청 전: RequestLog 저장 (content = 요청 본문)
RequestLog log = new RequestLog(url, content);
requestLogRepository.save(log);

// 서비스 실행

// 요청 후: 결과 코드 업데이트
log.setServiceResultCode(result.getCode());
requestLogRepository.save(log);
```

**평가**:
- 감사 요건이 있는 제조 시스템에서 유용
- 모든 요청을 DB에 저장하면 부하가 클 수 있음
- cactus에서는 구조화된 로그 출력(JSON) 방식을 기본으로 하고, DB 저장은 프로젝트에서 선택

---

### 2.5 HTTP 클라이언트

**위치**: `com.dongkuk.dmes.film.http`

서비스 간 HTTP 통신을 위한 유틸리티. film에서는 Portal → Biz API 호출에 사용.

**AbstractSender.java** — 기반 클래스

```java
public abstract class AbstractSender {
    protected CloseableHttpClient httpClient;
    private int timeout = 3600;  // 초 단위 (기본 1시간)

    protected AbstractSender() {
        RequestConfig config = RequestConfig.custom()
            .setConnectTimeout(timeout * 1000)
            .setSocketTimeout(timeout * 1000)
            .build();
        this.httpClient = HttpClients.custom()
            .setDefaultRequestConfig(config)
            .disableAutomaticRetries()
            .build();
    }

    protected String buildQueryString(Map<String, String> params) { ... }
}
```

**HttpPostJsonSender.java** — JSON POST 전송

```java
public class HttpPostJsonSender extends AbstractSender {

    public String send(String url, String jsonBody, String authorization) {
        HttpPost post = new HttpPost(url);
        post.setHeader("Content-Type", "application/json");
        post.setHeader("Authorization", authorization);
        post.setEntity(new StringEntity(jsonBody, "UTF-8"));

        CloseableHttpResponse response = httpClient.execute(post);
        return EntityUtils.toString(response.getEntity());
    }
}
```

**사용 패턴** (Portal에서 Biz API 호출):

```java
HttpPostJsonSender sender = new HttpPostJsonSender();
String result = sender.send(
    "http://localhost:8080/service/ORDER_SAVE",
    requestJson,
    "Basic " + base64AuthHeader
);
```

**평가**:
- Apache HttpClient 4.x 기반 — 레거시
- cactus에서는 Spring 4.x의 RestClient로 현대화
- 멀티 모듈 환경에서 모듈 간 API 호출 시 JWT 토큰 자동 전파가 핵심

---

### 2.6 Naming Strategy

**위치**: `com.dongkuk.dmes.film.cmn.config.jpa.SnakePhysicalNamingStrategy`

Java의 camelCase 필드명을 DB의 SNAKE_CASE 컬럼명으로 자동 변환한다.

```java
public class SnakePhysicalNamingStrategy implements PhysicalNamingStrategy {

    @Override
    public Identifier toPhysicalColumnName(Identifier name, ...) {
        // "orderId" → "ORDER_ID"
        // "itemCd" → "ITEM_CD"
        return convert(name);
    }

    @Override
    public Identifier toPhysicalTableName(Identifier name, ...) {
        return convert(name);
    }

    private Identifier convert(Identifier identifier) {
        String regex = "([a-z])([A-Z])";
        String replacement = "$1_$2";
        String newName = identifier.getText()
            .replaceAll(regex, replacement)
            .toUpperCase();
        return Identifier.toIdentifier(newName);
    }
}
```

**효과**:

```java
@Entity
@Table(name = "TB_BIZ_ORDER")
public class OrderEntity {
    private String orderId;      // → ORDER_ID
    private String itemCd;       // → ITEM_CD
    private Integer orderQty;    // → ORDER_QTY
}
```

**평가**:
- 동국제강 DB 명명 규칙(대문자 SNAKE_CASE)에 필수
- Spring Boot의 기본 `SpringPhysicalNamingStrategy`는 소문자 snake_case이므로 커스텀 필요
- 간단하지만 모든 프로젝트에서 동일하게 사용

---

### 2.7 예외 처리 체계

**위치**: `com.dongkuk.dmes.film.cmn.exception`

**BizException.java** — 비즈니스 예외

```java
public class BizException extends UserException {
    // OASIS UserException 상속 — 스택 트레이스 포함 로깅
    public BizException(String message) {
        super(message);
    }
}
```

**DevException.java** — 개발 오류 예외

```java
public class DevException extends NoTraceException {
    // OASIS NoTraceException 상속 — 스택 트레이스 미포함 (깔끔한 로그)
    public DevException(String message) {
        super(message);
    }
}
```

**RestResponseEntityExceptionHandler.java** — 전역 예외 핸들러

```java
@RestControllerAdvice
public class RestResponseEntityExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<BizServiceResult> handleAll(Exception ex) {
        String serviceTag = MDC.get("SERVICE_TAG");
        BizServiceResult result = new BizServiceResult();
        result.setServiceResultCode(ServiceResultCode.ERROR);
        result.setMessage(ex.getMessage());
        return ResponseEntity.ok(result);  // HTTP 200으로 반환 (film 방식)
    }
}
```

**평가**:
- film은 모든 에러를 HTTP 200으로 반환하고 body의 resultCode로 구분 (Nexacro 호환)
- cactus는 이미 HTTP 상태코드 기반 예외 처리를 갖추고 있음 (BusinessException + GlobalExceptionHandler)
- OASIS 예외 클래스(UserException, NoTraceException)와의 연계만 확인 필요

---

### 2.8 서비스 컨트롤러 (OASIS 연동)

**위치**: `com.dongkuk.dmes.film.cmn.inbound`

film의 핵심 진입점. OASIS 서비스를 HTTP로 노출한다.

**ServiceController.java**:

```java
@RestController
public class ServiceController {

    @PostMapping("/service/{serviceId}")
    public BizServiceResult service(
            @PathVariable String serviceId,
            @RequestBody String body,
            HttpServletRequest request) {

        // 1. 인증 헤더에서 ClientInfo 추출
        ClientInfo clientInfo = parseAuthorization(request);

        // 2. 요청 로그 저장
        RequestLog log = saveRequestLog(serviceId, body);

        // 3. 요청 파라미터 변환 (JSON → TypedObject)
        Map<String, TypedObject> params = ParamUtil.getBodyParams(body);

        // 4. 서비스 컨텍스트 구성
        ServiceContext context = new ServiceContext();
        context.put("clientInfo", clientInfo);
        context.put("serviceRequestTimeInfo", new ServiceRequestTimeInfo());

        // 5. OASIS 서비스 실행
        ServiceResult result = serviceStarter.start(serviceId, context);

        // 6. 메시지 처리 (EAI 인터페이스, 이메일 등)
        processMessages(result);

        // 7. 응답 구성
        return toBizServiceResult(result);
    }

    @PostMapping("/query/service/{serviceId}")
    public BizServiceResult queryService(...) { /* 조회 전용 */ }
}
```

**QueryController.java** — MyBatis 직접 쿼리

```java
@RestController
public class QueryController {

    @PostMapping("/query/mb/{queryId}")
    public BizServiceResult mybatisQuery(
            @PathVariable String queryId,
            @RequestBody String body) {

        Map<String, Object> params = ParamUtil.fromJson(body);

        // biz 또는 frm SqlSession 선택
        List<Map<String, Object>> rows = sqlSessionBiz.selectList(queryId, params);

        BizServiceResult result = new BizServiceResult();
        result.put("rows", rows);
        return result;
    }
}
```

**ParamUtil.java** — JSON → TypedObject 변환

```java
public class ParamUtil {

    // JSON 문자열 → Map (타입 보존)
    public static Map<String, Object> fromJson(String json) {
        return new Gson().fromJson(json, Map.class);
    }

    // JSON → OASIS TypedObject Map
    public static Map<String, TypedObject> getBodyParams(String body) {
        Map<String, Object> raw = fromJson(body);
        Map<String, TypedObject> typed = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            typed.put(entry.getKey(), toTypedObject(entry.getValue()));
        }
        return typed;
    }

    private static TypedObject toTypedObject(Object value) {
        if (value instanceof List) {
            return new TypedObject(value, new TypeReference<List<Map<String, Object>>>() {});
        } else if (value instanceof Map) {
            return new TypedObject(value, new TypeReference<Map<String, Object>>() {});
        } else {
            return new TypedObject(value);
        }
    }
}
```

**평가**:
- cactus의 OasisController + OasisServiceExecutor가 이미 동일한 역할을 수행
- cactus가 더 현대적 (CactusRequest/Response 구조, URL 패턴 개선)
- QueryController(MyBatis 직접 쿼리)는 이식 대상이 아님 — OASIS 서비스로 통합

---

### 2.9 응답 래퍼

**위치**: `com.dongkuk.dmes.film.cmn.inbound.BizServiceResult`

film의 표준 응답 포맷.

```java
public class BizServiceResult {
    private ServiceResultCode serviceResultCode;  // SUCCESS, ERROR
    private String message;
    private Map<String, Object> results = new LinkedHashMap<>();

    // TypedObject 또는 plain Object를 results에 추가
    public void put(String key, Object value) {
        results.put(key, value);
    }

    // 전체 결과 맵 반환
    public Map<String, Object> getResults() {
        return results;
    }
}
```

**JSON 출력 예시**:

```json
{
  "serviceResultCode": "SUCCESS",
  "message": "",
  "results": {
    "rows": [
      { "ORDER_ID": "ORD-001", "ITEM_CD": "ITEM-001", "QTY": 100 }
    ]
  }
}
```

**평가**:
- 단순한 구조이지만 메타 정보(txId, 에러 코드 등) 부족
- cactus의 CactusResponse가 이미 상위 호환으로 대체

---

### 2.10 보안 (Security)

**위치**: `com.dongkuk.dmes.film.cmn.security`, `com.dongkuk.dmes.film.sec`

**ClientInfo.java** — 사용자 컨텍스트

```java
public class ClientInfo {
    private final String userId;
    private final String userName;
    private final String employeeNo;
}
```

**Base64 인증 방식** (film):

```
Authorization: Basic eyJ1c2VySWQiOiJ1c2VyMDEiLCJ1c2VyTmFtZSI6Iu2Zjeq4uOuPmSJ9
                     ↑ Base64({"userId":"user01","userName":"홍길동"})
```

**JWT 인증 방식** (portal):

```java
// SpringSecurityConfig — 필터 체인
http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
    .sessionManagement().sessionCreationPolicy(STATELESS);

// JwtTokenProvider — 토큰 생성/검증
public String createToken(String userId, String userName, String employeeNo) {
    return Jwts.builder()
        .setSubject(userId)
        .claim("userNm", userName)
        .claim("userEmpNo", employeeNo)
        .setExpiration(new Date(now + expiry))
        .signWith(SignatureAlgorithm.HS256, secret)
        .compact();
}
```

**로그인 검증** (LoginIdPwValidator):

```java
@Service
public class LoginIdPwValidator implements UserDetailsService {
    @Override
    public UserDetails loadUserByUsername(String userId) {
        UserEntity user = userRepository.findById(userId);
        // 비밀번호 이력 검증 포함
        return new User(user.getUserId(), user.getPassword(), authorities);
    }
}
```

**평가**:
- cactus는 이미 JWT 기반 인증을 완비 (JwtTokenProvider, JwtAuthenticationFilter, AuthService)
- film의 Base64 방식은 레거시 — 이식 불필요
- cactus의 UserContextHolder가 film의 ClientInfo 역할을 대체

---

### 2.11 메시지/EAI 인프라

**위치**: `com.dongkuk.dmes.film.cmn.message`, `com.dongkuk.dmes.film.cmn.oasis`

film은 OASIS 서비스 실행 결과에서 메시지를 추출하여 EAI 인터페이스 테이블에 저장한다.

**MessageEntity.java**:

```java
@Entity
@Table(name = "TB_CMN_MSG")
public class MessageEntity extends VersionAuditEntity {
    @Id private String msgId;
    private String topicId;         // 토픽 식별자
    private String msg;             // 메시지 본문 (JSON)
    private String status;          // 전송 상태
    private String interfaceId;     // 인터페이스 ID
    private String serviceRequestTag;
    private Integer sequence;
}
```

**TopicEntity.java** — 메시지 라우팅 메타데이터:

```java
@Entity
@Table(name = "TB_CMN_TOPIC")
public class TopicEntity {
    @Id private String topicId;
    private String topicName;
    private String middleTableName;    // 중간 테이블명
    private String sourceSystemCd;     // 송신 시스템
    private String targetSystemCd;     // 수신 시스템
    private String serviceId;          // OASIS 서비스 ID
    private String interfaceId;        // 인터페이스 ID

    @OneToMany
    private List<TopicStructureEntity> structures;  // 메시지 구조 정의
}
```

**ServiceController에서의 메시지 처리**:

```java
// 서비스 실행 후 결과에서 메시지 추출
ServiceResult result = serviceStarter.start(serviceId, context);

// 메시지 출력이 있으면 처리
if (result.hasOutput("MSG_OUTPUT")) {
    List<Map> messages = result.getOutput("MSG_OUTPUT");
    for (Map msg : messages) {
        // 1. 인터페이스 메시지 → 중간 테이블에 INSERT
        // 2. 이메일 템플릿 → 메일 발송 큐에 INSERT
    }
}
```

**평가**:
- film의 EAI 구조는 OASIS 서비스와 강결합
- 신규 프로젝트의 EAI 요건(Kafka, REST API 등)이 확정된 후 별도 설계 필요
- 현시점에서 cactus에 이식하기에는 이름

---

### 2.12 이메일

**위치**: `com.dongkuk.dmes.film.ext.mail`

**MailContent.java**:

```java
public class MailContent {
    private String subject;
    private String content;
    private String fromEmail;
    private List<String> toEmails;
    private List<String> ccEmails;
}
```

**MailSendEntity.java** — 발송 이력 관리:

```java
@Entity
@Table(name = "TB_MAIL_SEND_LIST")
public class MailSendEntity {
    @Id private Long id;
    private String subject;
    private String content;
    private String fromAddr;
    private String toAddr;
    private String status;          // PENDING, SENT, FAILED
    private LocalDateTime createdAt;
    private LocalDateTime sentAt;
}
```

**템플릿 바인딩**:

```java
// {{변수명}} 패턴을 실제 값으로 치환
public class DoubleCurlyBraceToMapMailTemplateBindingSourceBinder {
    public String bind(String template, Map<String, String> values) {
        // "주문번호 {{orderId}}의 상태가 {{status}}로 변경되었습니다."
        // → "주문번호 ORD-001의 상태가 확정으로 변경되었습니다."
    }
}
```

**평가**:
- 이메일 요건이 확정되면 별도 모듈로 제공 가능
- 현시점에서는 보류

---

### 2.13 Object Mapper

**위치**: `com.dongkuk.dmes.film.cmn.mapper`

```java
public interface Mapper {
    <T> T map(Object source, Class<T> destinationClass);
}

@Component
public class ModelMapperMapper implements Mapper {
    private final ModelMapper modelMapper;

    public ModelMapperMapper() {
        this.modelMapper = new ModelMapper();
        modelMapper.getConfiguration()
            .setMatchingStrategy(MatchingStrategies.STRICT)
            .setSkipNullEnabled(true);
    }

    @Override
    public <T> T map(Object source, Class<T> destinationClass) {
        return modelMapper.map(source, destinationClass);
    }
}
```

**평가**:
- cactus는 Jackson ObjectMapper를 직접 사용 (GridConverter)
- ModelMapper 추가 의존성 불필요 — 이식하지 않음

---

### 2.14 다중 DataSource 설정

**위치**: `com.dongkuk.dmes.film.cmn.config.datasource`, `com.dongkuk.dmes.film.cmn.config.jpa`

film은 3개의 DataSource를 분리 운영한다.

| DataSource | 용도 | AutoCommit | 설명 |
|---|---|---|---|
| **Biz** | 업무 DB | `false` | 트랜잭션 제어 필요. 업무 데이터 CRUD |
| **Frm** | 프레임워크 DB | `true` | OASIS 서비스 정의, 공통 코드 등 읽기 위주 |
| **Mail** | 메일 DB | `true` | 메일 발송 이력. 격리된 커넥션 |

```java
@Configuration
public class BizDataSourceConfig {
    @Bean
    @Primary
    public DataSource bizDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(env.getProperty("biz.datasource.url"));
        config.setUsername(env.getProperty("biz.datasource.username"));
        config.setPassword(env.getProperty("biz.datasource.password"));
        config.setAutoCommit(false);
        return new HikariDataSource(config);
    }
}
```

**JPA EntityManagerFactory 분리**:

```java
@Configuration
public class BizDataJpaConfig {
    @Bean
    @Primary
    public LocalContainerEntityManagerFactoryBean bizEntityManager() {
        // persistenceUnit: "biz"
        // packages: "com.dongkuk.dmes.film.biz"
        // Hibernate Envers 활성화 (감사 이력)
    }
}
```

**평가**:
- DataSource 구성은 프로젝트마다 다름 (DB 수, 용도, 접속 정보)
- cactus가 강제할 영역이 아님 — 각 프로젝트에서 설정
- 다만 **설정 가이드 또는 예제 템플릿**은 제공할 수 있음

---

### 2.15 기타 유틸리티

**CaseConverter.java** — 케이스 변환 (Guava 기반):

```java
public class CaseConverter {
    public static String toCamelCase(String snakeCase) {
        return CaseFormat.UPPER_UNDERSCORE.to(CaseFormat.LOWER_CAMEL, snakeCase);
    }
    public static String toSnakeCase(String camelCase) {
        return CaseFormat.LOWER_CAMEL.to(CaseFormat.UPPER_UNDERSCORE, camelCase);
    }
}
```

**FileUtils.java** — 리소스 파일 로딩:

```java
public class FileUtils {
    public static String readFile(String path) {
        Resource[] resources = new PathMatchingResourcePatternResolver()
            .getResources(path);
        // 단일 파일 내용 반환
    }
}
```

**DMLConstants.java** — Nexacro DML 상수 (레거시):

```java
public class DMLConstants {
    public static final String SAVE_TYPE = "!nativeeditor_status";
    public static final String UPDATED = "updated";
    public static final String INSERTED = "inserted";
    public static final String DELETED = "deleted";
}
```

**평가**:
- CaseConverter는 Naming Strategy에서 내부적으로 사용 가능
- DMLConstants는 Nexacro 전용 — 이식 불필요
- FileUtils는 Spring ResourceLoader로 대체 가능

---

## 3. cactus-core 현재 상태

이식 설계 전, cactus-core에 이미 구현된 기능을 정리한다.

| 영역 | 패키지 | 핵심 클래스 | 상태 |
|------|--------|------------|------|
| 자동 설정 | `autoconfigure` | CactusAutoConfiguration, CactusProperties, SecurityAutoConfiguration | 완료 |
| 에러/응답 | `common` | ErrorCode, BusinessException, ApiResponse | 완료 |
| 요청 포맷 | `web.request` | CactusRequest, RequestMeta, GridData, RowStatus | 완료 |
| 응답 포맷 | `web.response` | CactusResponse, ResponseMeta, GridResult, ColumnMeta, ErrorDetail | 완료 |
| 필터 | `web.filter` | TxIdFilter | 완료 |
| 예외 핸들러 | `web.exception` | GlobalExceptionHandler | 완료 |
| 데이터 변환 | `web.converter` | GridConverter | 완료 |
| JWT | `security.jwt` | JwtTokenProvider, JwtAuthenticationFilter, JwtTokenHolder, TokenPair | 완료 |
| 인증 | `security.auth` | AuthController, AuthService, SecUser, SecUserPwd, PasswordEncoder | 완료 |
| 사용자 컨텍스트 | `security.context` | UserContextHolder, UserContext, UserInfo | 완료 |
| OASIS 연동 | `oasis` | OasisController, OasisServiceExecutor, Request/ResponseConverter | 완료 |
| 유틸리티 | `util` | TxIdGenerator | 완료 |

---

## 4. 이식 설계

### 4.1 이식 대상 요약

분석 결과를 바탕으로 이식 여부를 판정한다.

| # | 기능 | 판정 | 사유 |
|---|------|------|------|
| 1 | 감사 엔티티 (Audit) | **이식** | 모든 업무 엔티티의 기반. 멀티 모듈에서 공유 필수 |
| 2 | Naming Strategy | **이식** | JPA 엔티티 네이밍 규칙 통일 |
| 3 | 마스터 코드 (MC) | **이식** | MES 전 업무에서 사용. DB 기반으로 재설계 |
| 4 | MyBatis SQL 로거 | **이식** | 개발 생산성. MyBatis optional 의존성 |
| 5 | HTTP 클라이언트 | **이식** | 멀티 모듈 간 통신. Spring RestClient로 현대화 |
| 6 | 요청 로그 | **부분 이식** | 구조화된 로그 필터만 제공. DB 저장은 프로젝트에서 |
| 7 | 예외 처리 | 이식 불필요 | cactus가 이미 상위 호환 |
| 8 | 보안/JWT | 이식 불필요 | cactus가 이미 최신 구현 보유 |
| 9 | OASIS 연동 | 이식 불필요 | cactus가 OASIS 5.0 기반으로 이미 구현 |
| 10 | 응답 포맷 | 이식 불필요 | CactusResponse가 BizServiceResult 상위 호환 |
| 11 | Object Mapper | 이식 불필요 | Jackson ObjectMapper로 충분 |
| 12 | 메시지/EAI | **보류** | 신규 프로젝트 EAI 요건 확정 후 설계 |
| 13 | 이메일 | **보류** | 이메일 요건 확정 후 설계 |
| 14 | Nexacro 연동 | 이식 불필요 | React 전환으로 폐기 |
| 15 | 다중 DataSource | 이식 불필요 | 프로젝트별 구성. 가이드만 제공 |
| 16 | CSV 마스터코드 구현 | 이식 불필요 | DB 기반으로 대체 |
| 17 | Base64 Auth | 이식 불필요 | JWT Bearer로 대체 |

---

### 4.2 패키지 구조 (이식 후)

```
com.dongkuk.cactus
│
├── autoconfigure/                    # [기존] 자동 설정
│   ├── CactusAutoConfiguration.java
│   ├── CactusProperties.java
│   └── SecurityAutoConfiguration.java
│
├── common/                           # [기존] 공통 에러/응답
│   ├── ErrorCode.java
│   ├── BusinessException.java
│   └── ApiResponse.java
│
├── web/                              # [기존] 웹 계층
│   ├── request/                      #   CactusRequest, GridData, RequestMeta, RowStatus
│   ├── response/                     #   CactusResponse, GridResult, ColumnMeta, ErrorDetail
│   ├── filter/                       #   TxIdFilter
│   ├── exception/                    #   GlobalExceptionHandler
│   └── converter/                    #   GridConverter
│
├── security/                         # [기존] 보안
│   ├── jwt/                          #   JwtTokenProvider, JwtAuthenticationFilter
│   ├── auth/                         #   AuthController, AuthService
│   └── context/                      #   UserContextHolder, UserContext, UserInfo
│
├── oasis/                            # [기존] OASIS 연동
│   ├── OasisController.java
│   ├── OasisServiceExecutor.java
│   └── ...
│
├── util/                             # [기존] 유틸리티
│   └── TxIdGenerator.java
│
│  ── ── ── ── 아래부터 신규 이식 ── ── ── ──
│
├── persistence/                      # [NEW] 데이터 계층 공통
│   ├── audit/
│   │   ├── AuditableEntity.java           # @MappedSuperclass, 생성/수정 감사
│   │   ├── VersionedAuditableEntity.java  # + @Version 낙관적 잠금
│   │   └── AuditListener.java             # @EntityListener, UserContextHolder 연동
│   ├── naming/
│   │   └── UpperSnakeCaseNamingStrategy.java  # camelCase → UPPER_SNAKE_CASE
│   └── mybatis/
│       └── SqlLoggingInterceptor.java     # MyBatis SQL/파라미터 로깅
│
├── mastercode/                       # [NEW] 마스터 코드
│   ├── MasterCode.java               # record(codeGroup, code, label, sortOrder, ...)
│   ├── MasterCodeRepository.java     # interface — 프로젝트에서 구현
│   ├── MasterCodeService.java        # 캐싱 + 조회 로직
│   ├── MasterCodeAutoConfiguration.java  # 자동 설정
│   └── MC.java                       # static 파사드 — MC.decode(), MC.getList()
│
└── http/                             # [NEW] HTTP 클라이언트
    ├── CactusRestClient.java         # Spring RestClient 래퍼
    ├── RestClientProperties.java     # 타임아웃 등 설정
    └── RestClientAutoConfiguration.java  # 자동 설정, JWT 토큰 전파
```

---

### 4.3 상세 설계

#### A. 감사 엔티티 (persistence.audit)

**AuditableEntity.java**:

```java
@MappedSuperclass
@EntityListeners(AuditListener.class)
public abstract class AuditableEntity {

    @Column(name = "CREATED_BY", updatable = false)
    private String createdBy;

    @Column(name = "CREATED_AT", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "UPDATED_BY")
    private String updatedBy;

    @Column(name = "UPDATED_AT")
    private LocalDateTime updatedAt;

    // getter만 공개, setter는 protected (리스너에서만 설정)
}
```

**VersionedAuditableEntity.java**:

```java
@MappedSuperclass
public abstract class VersionedAuditableEntity extends AuditableEntity {

    @Version
    @Column(name = "VERSION")
    private Long version;
}
```

**AuditListener.java**:

```java
public class AuditListener {

    @PrePersist
    public void prePersist(AuditableEntity entity) {
        String userId = UserContextHolder.getUserId();  // "SYSTEM" if not authenticated
        LocalDateTime now = LocalDateTime.now();
        entity.setCreatedBy(userId);
        entity.setCreatedAt(now);
        entity.setUpdatedBy(userId);
        entity.setUpdatedAt(now);
    }

    @PreUpdate
    public void preUpdate(AuditableEntity entity) {
        entity.setUpdatedBy(UserContextHolder.getUserId());
        entity.setUpdatedAt(LocalDateTime.now());
    }
}
```

**film과의 차이점**:

| 항목 | dmes-film | cactus-core |
|------|-----------|-------------|
| 감사 필드 | cUserId, cAt, cSvcId, cPgmId (8개) | createdBy, createdAt, updatedBy, updatedAt (4개) |
| 사유 | OASIS serviceId/programId 추적 | 사용자 ID로 충분. 서비스 추적은 로그(txId)로 |
| 컬럼 네이밍 | C_USER_ID, U_AT 등 | CREATED_BY, UPDATED_AT 등 |
| 낙관적 잠금 | VersionAuditEntity에 포함 | 별도 클래스(VersionedAuditableEntity)로 분리 |

**프로젝트 사용 예시**:

```java
@Entity
@Table(name = "TB_MFG_WORK_ORDER")
public class WorkOrderEntity extends VersionedAuditableEntity {
    @Id
    private String workOrderId;
    private String itemCd;
    private Integer qty;
    private String status;
    // createdBy, createdAt, updatedBy, updatedAt, version 자동 관리
}
```

---

#### B. Naming Strategy (persistence.naming)

**UpperSnakeCaseNamingStrategy.java**:

```java
public class UpperSnakeCaseNamingStrategy implements PhysicalNamingStrategy {

    @Override
    public Identifier toPhysicalTableName(Identifier logicalName,
                                           JdbcEnvironment context) {
        return convert(logicalName);
    }

    @Override
    public Identifier toPhysicalColumnName(Identifier logicalName,
                                            JdbcEnvironment context) {
        return convert(logicalName);
    }

    private Identifier convert(Identifier identifier) {
        if (identifier == null) return null;
        String name = identifier.getText();
        // camelCase → UPPER_SNAKE_CASE
        String converted = name
            .replaceAll("([a-z])([A-Z])", "$1_$2")
            .replaceAll("([A-Z]+)([A-Z][a-z])", "$1_$2")
            .toUpperCase();
        return Identifier.toIdentifier(converted);
    }

    // 나머지 메서드는 기본 구현 (변환 없이 반환)
    @Override
    public Identifier toPhysicalCatalogName(...) { return name; }
    @Override
    public Identifier toPhysicalSchemaName(...) { return name; }
    @Override
    public Identifier toPhysicalSequenceName(...) { return convert(name); }
}
```

**프로젝트 application.yml 설정**:

```yaml
spring:
  jpa:
    hibernate:
      naming:
        physical-strategy: com.dongkuk.cactus.persistence.naming.UpperSnakeCaseNamingStrategy
```

---

#### C. 마스터 코드 (mastercode)

**MasterCode.java**:

```java
public record MasterCode(
    String codeGroup,    // 코드 그룹 (예: "ORDER_STATUS")
    String code,         // 코드 값 (예: "10")
    String label,        // 표시명 (예: "진행중")
    Integer sortOrder,   // 정렬 순서
    boolean useYn        // 사용 여부
) {}
```

**MasterCodeRepository.java** — 인터페이스 (프로젝트에서 구현):

```java
public interface MasterCodeRepository {

    /**
     * 코드 그룹의 전체 목록 조회
     * @param codeGroup 코드 그룹 (예: "ORDER_STATUS")
     * @return 코드 목록 (sortOrder 정렬)
     */
    List<MasterCode> findByCodeGroup(String codeGroup);

    /**
     * 전체 코드 그룹 목록 조회 (캐시 워밍용)
     */
    List<MasterCode> findAll();
}
```

**MasterCodeService.java**:

```java
@Service
public class MasterCodeService {

    private final MasterCodeRepository repository;
    private final ConcurrentHashMap<String, List<MasterCode>> cache = new ConcurrentHashMap<>();

    /**
     * 코드값 → 표시명 변환
     * MC.decode("10", "ORDER_STATUS") → "진행중"
     */
    public String decode(String code, String codeGroup) {
        return getList(codeGroup).stream()
            .filter(mc -> mc.code().equals(code))
            .map(MasterCode::label)
            .findFirst()
            .orElse(code);  // 매칭 없으면 원본 반환
    }

    /**
     * 코드 그룹의 사용 가능한 코드 목록
     */
    public List<MasterCode> getList(String codeGroup) {
        return cache.computeIfAbsent(codeGroup,
            key -> repository.findByCodeGroup(key).stream()
                .filter(MasterCode::useYn)
                .toList()
        );
    }

    /**
     * 캐시 갱신 (관리 화면에서 코드 변경 시 호출)
     */
    public void evict(String codeGroup) {
        cache.remove(codeGroup);
    }

    public void evictAll() {
        cache.clear();
    }
}
```

**MC.java** — Static 파사드:

```java
public final class MC {

    private static MasterCodeService service;

    // Spring 초기화 시 주입 (MasterCodeAutoConfiguration에서)
    static void init(MasterCodeService masterCodeService) {
        service = masterCodeService;
    }

    public static String decode(String code, String codeGroup) {
        return service.decode(code, codeGroup);
    }

    public static List<MasterCode> getList(String codeGroup) {
        return service.getList(codeGroup);
    }

    public static void evict(String codeGroup) {
        service.evict(codeGroup);
    }

    private MC() {}
}
```

**MasterCodeAutoConfiguration.java**:

```java
@Configuration
@ConditionalOnBean(MasterCodeRepository.class)
public class MasterCodeAutoConfiguration {

    @Bean
    public MasterCodeService masterCodeService(MasterCodeRepository repository) {
        MasterCodeService service = new MasterCodeService(repository);
        MC.init(service);
        return service;
    }
}
```

**film과의 차이점**:

| 항목 | dmes-film | cactus-core |
|------|-----------|-------------|
| 데이터 소스 | CSV 파일 | DB 조회 (인터페이스) |
| 캐싱 | 기동 시 전체 로드 | Lazy 로드 + 캐시 (ConcurrentHashMap) |
| 캐시 갱신 | 재기동 필요 | `MC.evict()` 호출로 런타임 갱신 |
| 구현 위치 | cactus-core 내부 (CSV) | 인터페이스만 cactus, 구현은 프로젝트 |

**프로젝트에서의 구현 예시**:

```java
// 프로젝트의 MasterCodeRepository 구현
@Repository
public class JdbcMasterCodeRepository implements MasterCodeRepository {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public List<MasterCode> findByCodeGroup(String codeGroup) {
        return jdbcTemplate.query(
            "SELECT CODE_GROUP, CODE, LABEL, SORT_ORDER, USE_YN " +
            "FROM TB_CMN_MASTER_CODE WHERE CODE_GROUP = ? ORDER BY SORT_ORDER",
            (rs, i) -> new MasterCode(
                rs.getString("CODE_GROUP"),
                rs.getString("CODE"),
                rs.getString("LABEL"),
                rs.getInt("SORT_ORDER"),
                "Y".equals(rs.getString("USE_YN"))
            ),
            codeGroup
        );
    }
}
```

---

#### D. MyBatis SQL 로거 (persistence.mybatis)

**SqlLoggingInterceptor.java**:

```java
@Intercepts({
    @Signature(type = Executor.class, method = "query",
               args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
public class SqlLoggingInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger("SQL");

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
        Object parameter = invocation.getArgs()[1];

        String queryId = ms.getId();
        BoundSql boundSql = ms.getBoundSql(parameter);
        String sql = boundSql.getSql().replaceAll("\\s+", " ").trim();

        // 바인딩 파라미터 추출
        List<String> params = extractParams(boundSql, ms.getConfiguration(), parameter);

        log.debug("[{}] {}", queryId, sql);
        if (!params.isEmpty()) {
            log.debug("[{}] params: {}", queryId, params);
        }

        long start = System.currentTimeMillis();
        Object result = invocation.proceed();
        long elapsed = System.currentTimeMillis() - start;

        log.debug("[{}] elapsed: {}ms", queryId, elapsed);

        return result;
    }

    private List<String> extractParams(BoundSql boundSql, Configuration config, Object parameter) {
        List<String> params = new ArrayList<>();
        List<ParameterMapping> mappings = boundSql.getParameterMappings();
        MetaObject metaObject = config.newMetaObject(parameter);

        for (ParameterMapping mapping : mappings) {
            String prop = mapping.getProperty();
            Object value = metaObject.hasGetter(prop) ? metaObject.getValue(prop) : null;
            params.add(prop + "=" + value);
        }
        return params;
    }
}
```

**자동 등록** (MyBatis가 classpath에 있을 때만):

```java
@Configuration
@ConditionalOnClass(SqlSessionFactory.class)
public class MyBatisAutoConfiguration {

    @Bean
    public SqlLoggingInterceptor sqlLoggingInterceptor() {
        return new SqlLoggingInterceptor();
    }
}
```

**로그 출력 예시**:

```
DEBUG SQL - [com.dongkuk.mfg.mapper.WorkOrderMapper.selectByPlant]
            SELECT WORK_ORDER_ID, ITEM_CD, QTY, STATUS FROM TB_MFG_WORK_ORDER WHERE PLANT_CD = ? AND STATUS = ?
DEBUG SQL - [com.dongkuk.mfg.mapper.WorkOrderMapper.selectByPlant]
            params: [plantCd=P01, status=10]
DEBUG SQL - [com.dongkuk.mfg.mapper.WorkOrderMapper.selectByPlant]
            elapsed: 23ms
```

---

#### E. HTTP 클라이언트 (http)

**RestClientProperties.java**:

```java
@ConfigurationProperties(prefix = "cactus.http")
public class RestClientProperties {
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration readTimeout = Duration.ofSeconds(30);
    private boolean propagateJwt = true;  // JWT 토큰 자동 전파
}
```

**CactusRestClient.java**:

```java
@Component
public class CactusRestClient {

    private final RestClient restClient;
    private final RestClientProperties properties;

    public CactusRestClient(RestClient.Builder builder, RestClientProperties properties) {
        this.properties = properties;
        this.restClient = builder
            .requestInterceptor(this::propagateJwt)
            .build();
    }

    /**
     * POST 요청
     */
    public <T> T post(String url, Object body, Class<T> responseType) {
        return restClient.post()
            .uri(url)
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body(responseType);
    }

    /**
     * POST — CactusResponse 반환 (모듈 간 OASIS 서비스 호출용)
     */
    public CactusResponse postForCactus(String url, CactusRequest request) {
        return post(url, request, CactusResponse.class);
    }

    /**
     * GET 요청
     */
    public <T> T get(String url, Class<T> responseType, Object... uriVariables) {
        return restClient.get()
            .uri(url, uriVariables)
            .retrieve()
            .body(responseType);
    }

    /**
     * JWT 토큰 자동 전파
     * 현재 요청의 JWT 토큰을 하위 서비스 호출에 그대로 전달
     */
    private ClientHttpRequest propagateJwt(HttpRequest request, byte[] body,
                                            ClientHttpRequestExecution execution) {
        if (properties.isPropagateJwt()) {
            String token = JwtTokenHolder.get();
            if (token != null) {
                request.getHeaders().setBearerAuth(token);
            }
        }
        return execution.execute(request, body);
    }
}
```

**film과의 차이점**:

| 항목 | dmes-film | cactus-core |
|------|-----------|-------------|
| HTTP 라이브러리 | Apache HttpClient 4.x | Spring RestClient (Boot 4.x 내장) |
| 인증 전파 | Base64 수동 전달 | JWT 자동 전파 (JwtTokenHolder) |
| 타임아웃 | 하드코딩 3600초 | 프로퍼티로 설정 (기본 5초/30초) |
| 추가 의존성 | Apache HttpClient | 없음 (Spring 내장) |

---

### 4.4 build.gradle 의존성 변경

```groovy
dependencies {
    // [기존]
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation "io.jsonwebtoken:jjwt-api:${jjwtVersion}"
    runtimeOnly "io.jsonwebtoken:jjwt-impl:${jjwtVersion}"
    runtimeOnly "io.jsonwebtoken:jjwt-jackson:${jjwtVersion}"

    // [NEW] MyBatis — optional (사용하는 프로젝트만 활성화)
    compileOnly 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.4'
}
```

MyBatis 의존성은 `compileOnly`로 선언하여, MyBatis를 사용하지 않는 프로젝트에서는 `SqlLoggingInterceptor`가 자동으로 비활성화된다 (`@ConditionalOnClass`).

---

### 4.5 자동 설정 등록

**CactusAutoConfiguration.java** (수정):

```java
@AutoConfiguration
@EnableConfigurationProperties(CactusProperties.class)
@ComponentScan("com.dongkuk.cactus")
@Import({
    SecurityAutoConfiguration.class,
    OasisAutoConfiguration.class,
    MasterCodeAutoConfiguration.class,    // [NEW]
    MyBatisAutoConfiguration.class,       // [NEW]
    RestClientAutoConfiguration.class     // [NEW]
})
public class CactusAutoConfiguration {
    // ...
}
```

---

## 5. 이식 순서 (권장)

| 순서 | 대상 | 예상 작업 | 이유 |
|------|------|----------|------|
| **1** | 감사 엔티티 + Naming Strategy | AuditableEntity, VersionedAuditableEntity, AuditListener, UpperSnakeCaseNamingStrategy | 모든 엔티티의 기반. 업무 모듈 개발 전에 확정 필요 |
| **2** | 마스터 코드 | MasterCode, MasterCodeRepository(I/F), MasterCodeService, MC | MES 업무 개발 시 즉시 필요. 인터페이스만 cactus에, 구현은 프로젝트에 |
| **3** | MyBatis SQL 로거 | SqlLoggingInterceptor, MyBatisAutoConfiguration | 개발 초기부터 디버깅에 필수. 작업량 적음 |
| **4** | HTTP 클라이언트 | CactusRestClient, RestClientProperties, RestClientAutoConfiguration | 모듈 간 통신 필요 시점에 |
| **5** | 요청 로그 필터 | (추후) 구조화된 로그 출력 | 운영 단계에서 필요 |

---

## 6. 이식하지 않는 항목 (상세 사유)

| 대상 | film 위치 | 사유 |
|------|-----------|------|
| Nexacro 연동 | `cmn.inbound`, `portal.nexa` | React 전환으로 전면 폐기 |
| CSV 마스터코드 구현 | `cmn.master.CsvMaster*` | DB 기반으로 대체. 인터페이스만 이식 |
| Base64 Auth 파싱 | `cmn.serialize.Base64*` | JWT Bearer 방식으로 완전 대체 |
| ModelMapper 래퍼 | `cmn.mapper` | Jackson ObjectMapper + GridConverter로 충분 |
| 다중 DataSource 설정 | `cmn.config.datasource` | 프로젝트마다 DB 구성이 다름. 가이드만 제공 |
| BizServiceResult | `cmn.inbound` | CactusResponse가 상위 호환으로 대체 완료 |
| DMLConstants | core | Nexacro nativeeditor 전용 상수 |
| 메시지/EAI 인프라 | `cmn.message`, `cmn.oasis.Topic*` | 신규 프로젝트 EAI 아키텍처 확정 후 별도 설계 |
| 이메일 프레임워크 | `ext.mail` | 이메일 요건 확정 후 별도 모듈로 설계 |
| ServiceController | `cmn.inbound` | OasisController로 완전 대체 |
| QueryController | `cmn.inbound` | MyBatis 직접 쿼리 패턴은 OASIS 서비스로 통합 |
| FileUtils | core | Spring ResourceLoader로 대체 |
| CaseConverter | core | Naming Strategy 내부에서만 필요. 별도 유틸 불필요 |

---

## 7. 프로젝트 적용 가이드 (예시)

cactus-core를 사용하는 프로젝트(예: dmes-mfg)에서의 설정 예시.

### 7.1 build.gradle

```groovy
dependencies {
    implementation 'com.dongkuk:cactus-core:1.1.0'

    // MyBatis 사용 시 (SqlLoggingInterceptor 자동 활성화)
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.4'
}
```

### 7.2 application.yml

```yaml
cactus:
  jwt:
    secret: ${JWT_SECRET}
    accessTokenExpiry: 28800
    refreshTokenExpiry: 86400
  security:
    maxLoginFailures: 5
  oasis:
    servicePath: resources/services
  http:
    connectTimeout: 5s
    readTimeout: 30s
    propagateJwt: true

spring:
  jpa:
    hibernate:
      naming:
        physical-strategy: com.dongkuk.cactus.persistence.naming.UpperSnakeCaseNamingStrategy
```

### 7.3 MasterCodeRepository 구현

```java
@Repository
public class MasterCodeRepositoryImpl implements MasterCodeRepository {

    private final JdbcTemplate jdbc;

    @Override
    public List<MasterCode> findByCodeGroup(String codeGroup) {
        return jdbc.query(
            "SELECT CODE_GROUP, CODE, LABEL, SORT_ORDER, USE_YN " +
            "FROM TB_CMN_MASTER_CODE " +
            "WHERE CODE_GROUP = ? ORDER BY SORT_ORDER",
            (rs, i) -> new MasterCode(
                rs.getString("CODE_GROUP"),
                rs.getString("CODE"),
                rs.getString("LABEL"),
                rs.getInt("SORT_ORDER"),
                "Y".equals(rs.getString("USE_YN"))
            ),
            codeGroup
        );
    }

    @Override
    public List<MasterCode> findAll() {
        // 전체 조회 (캐시 워밍용)
    }
}
```

### 7.4 엔티티 작성

```java
@Entity
@Table(name = "TB_MFG_WORK_ORDER")
public class WorkOrderEntity extends VersionedAuditableEntity {

    @Id
    @Column(name = "WORK_ORDER_ID")
    private String workOrderId;

    private String plantCd;      // → PLANT_CD (자동 변환)
    private String itemCd;       // → ITEM_CD
    private Integer orderQty;    // → ORDER_QTY
    private String status;       // → STATUS

    // CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT, VERSION 자동 관리
}
```

### 7.5 업무 코드에서 마스터 코드 사용

```java
@Service
public class WorkOrderService {

    public WorkOrderDto getDetail(String workOrderId) {
        WorkOrderEntity entity = repository.findById(workOrderId).orElseThrow();

        return WorkOrderDto.builder()
            .workOrderId(entity.getWorkOrderId())
            .status(entity.getStatus())
            .statusName(MC.decode(entity.getStatus(), "WORK_ORDER_STATUS"))
            .build();
    }
}
```
