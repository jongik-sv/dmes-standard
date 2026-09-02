# 01. 아키텍처 및 모듈 구조

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController/AuthService 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터 **ClientKeyFilter / RequestIdFilter**, 신규 AutoConfiguration **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성) / **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - env: `BACKEND_CLIENT_KEY` 통일.

## 1. 패키지 구조

```
com.dongkuk.dmes.cactus
├── autoconfigure/          # Spring Boot 자동 설정
│   ├── CactusAutoConfiguration              # 핵심 빈 등록 (TxIdFilter, GridConverter, GlobalExceptionHandler)
│   ├── CactusProperties                     # cactus.* 프로퍼티 바인딩
│   ├── SecurityAutoConfiguration            # 보안 빈 등록 (JwtTokenProvider, JwtAuthenticationFilter)
│   ├── CactusAuthAutoConfiguration          # 신규: default 비활성, `cactus.auth.enabled: true` 시 활성
│   ├── CactusWebSecurityAutoConfiguration   # 신규: default SecurityFilterChain (@ConditionalOnMissingBean)
│   └── OasisAutoConfiguration               # OASIS 빈 등록 (OasisController, Converters, Executor)
│
├── oasis/                  # OASIS 통합 레이어 → 03-oasis-integration.md
│   ├── OasisController            # 단일 진입점 컨트롤러 (매핑 `/oasis` 고정)
│   ├── OasisServiceExecutor       # BPMN 서비스 실행기
│   ├── CactusRequestConverter     # CactusRequest → OASIS VariableList
│   ├── CactusResponseConverter    # OASIS VariableList → CactusResponse
│   └── OasisProperties            # oasis.* 프로퍼티 (`service-group` 은 BPMN 라우팅/로깅 식별용)
│
├── security/               # 보안 → 04-security.md
│   ├── jwt/
│   │   ├── JwtTokenProvider       # 토큰 생성/검증/파싱
│   │   ├── JwtAuthenticationFilter # 요청별 JWT 인증 필터
│   │   ├── JwtTokenHolder         # ThreadLocal 토큰 보관
│   │   └── TokenPair              # Access+Refresh 토큰 쌍
│   ├── filter/
│   │   ├── ClientKeyFilter        # `X-Backend-Client-Key` 검증 (cactus 표준, 신규)
│   │   └── RequestIdFilter        # 요청 식별자 발급/전파 (cactus 표준, 신규)
│   ├── auth/
│   │   ├── (※ AuthController.java 는 cactus-core 본체에서 삭제됨 — portal 사용)
│   │   ├── (※ AuthService.java 도 cactus-core 본체에서는 미제공)
│   │   ├── PasswordEncoder        # BCrypt 암호화
│   │   ├── SecUser / SecUserPwd   # JPA 엔티티
│   │   └── SecUserRepository / SecUserPwdRepository
│   └── context/
│       ├── UserInfo               # 사용자 정보 DTO (userId, roles, plantCode 등)
│       ├── UserContext             # 요청 스코프 사용자 컨텍스트
│       └── UserContextHolder      # ThreadLocal 기반 접근
│
├── web/                    # 웹 레이어 공통 → 02-data-format.md, 05-web-commons.md
│   ├── request/
│   │   ├── CactusRequest          # 표준 요청 DTO
│   │   ├── RequestMeta            # 요청 메타 (txId, action, userId 등)
│   │   ├── GridData               # 그리드 데이터 (rows + columnMeta)
│   │   └── RowStatus              # 행 상태 enum (C/U/D/R)
│   ├── response/
│   │   ├── CactusResponse         # 표준 응답 DTO (Builder 패턴)
│   │   ├── ResponseMeta           # 응답 메타 (txId, resultCode, message)
│   │   ├── GridResult             # 그리드 결과 (rows + columnMeta + pagination)
│   │   ├── ColumnMeta             # 컬럼 메타정보
│   │   ├── ColumnOption           # 컬럼 옵션 (콤보박스 등)
│   │   └── ErrorDetail            # 에러 상세 (field, code, message)
│   ├── converter/
│   │   └── GridConverter          # OASIS VariableList ↔ GridData/GridResult 변환
│   ├── filter/
│   │   └── TxIdFilter             # 트랜잭션 ID 발급 서블릿 필터
│   └── exception/
│       └── GlobalExceptionHandler # @ControllerAdvice 전역 예외 처리
│
├── common/                 # 공통 클래스
│   ├── ErrorCode                  # 에러 코드 enum
│   ├── BusinessException          # 비즈니스 예외
│   └── ApiResponse                # 범용 API 응답 래퍼
│
└── util/                   # 유틸리티
    └── TxIdGenerator              # UUID 기반 트랜잭션 ID 생성
```

## 2. 의존성 구조

### 2.1 외부 의존성

| 의존성 | 버전 | 용도 | scope |
|--------|------|------|-------|
| `oasis-core` | 5.0.0 | BPMN 서비스 엔진 | api |
| `spring-boot-dependencies` | 4.0.3 | BOM (버전 관리) | platform |
| `spring-boot-autoconfigure` | - | Auto-Configuration | api |
| `spring-web` | - | @RestController 등 | compileOnly |
| `spring-security-core` | - | @PreAuthorize 등 | compileOnly |
| `jackson-databind` | - | JSON 직렬화 | api |
| `jackson-datatype-jsr310` | - | Java 8 날짜 지원 | api |
| `jjwt-api/impl/jackson` | 0.12.5 | JWT 토큰 | api/runtime |
| `jbcrypt` | 0.4 | BCrypt 암호화 | api |
| `spring-boot-starter-data-jpa` | - | JPA 엔티티 | compileOnly |

### 2.2 의존성 전략

**점진적 추가 원칙**: 모듈 개발 시 필요한 의존성만 그때그때 추가한다.

- `api`: 업무 모듈에도 전이되어야 하는 의존성
- `compileOnly`: cactus-core 컴파일에만 필요, 업무 모듈이 직접 가져옴
- `runtimeOnly`: 런타임에만 필요한 구현체

### 2.3 업무 모듈에서의 사용

```groovy
// 업무 모듈 build.gradle
dependencies {
    implementation 'com.dongkuk.dmes:cactus-core:1.0.11-SNAPSHOT'

    // cactus-core가 compileOnly로 선언한 것들은 업무 모듈이 직접 가져옴
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
}
```

## 3. Auto-Configuration

### 3.1 CactusAutoConfiguration

핵심 공통 빈을 자동 등록한다.

```java
@AutoConfiguration
@EnableConfigurationProperties(CactusProperties.class)
public class CactusAutoConfiguration {
    // 등록 빈: TxIdFilter, GridConverter, GlobalExceptionHandler, TxIdGenerator
}
```

**활성 조건**: `spring-web`이 클래스패스에 있을 때

### 3.2 SecurityAutoConfiguration

JWT 보안 관련 빈을 자동 등록한다.

```java
@AutoConfiguration
@ConditionalOnProperty(prefix = "cactus.security", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SecurityAutoConfiguration {
    // 등록 빈: JwtTokenProvider, JwtAuthenticationFilter, UserContextHolder,
    //          ClientKeyFilter, RequestIdFilter
    // 참고: AuthController/AuthService 는 cactus-core 본체에서 삭제됨(portal 모듈에서 자체 구현)
}
```

### 3.2.1 CactusAuthAutoConfiguration (신규)

```java
@AutoConfiguration
@ConditionalOnProperty(prefix = "cactus.auth", name = "enabled", havingValue = "true")
public class CactusAuthAutoConfiguration {
    // default 비활성. `cactus.auth.enabled: true` 일 때만 활성.
    // portal 모듈에서 자체 인증 관련 빈을 등록할 때만 켠다.
}
```

### 3.2.2 CactusWebSecurityAutoConfiguration (신규)

```java
@AutoConfiguration
public class CactusWebSecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    public SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        // default SecurityFilterChain. 모듈이 자체 SecurityFilterChain 을 정의하면 그쪽이 우선된다.
        return http.build();
    }
}
```

### 3.3 OasisAutoConfiguration

OASIS 통합 레이어 빈을 자동 등록한다.

```java
@AutoConfiguration
@ConditionalOnClass(name = "com.dongkuk.oasis.core.service.OasisBpmService")
@EnableConfigurationProperties(OasisProperties.class)
public class OasisAutoConfiguration {
    // 등록 빈: OasisController, OasisServiceExecutor,
    //          CactusRequestConverter, CactusResponseConverter
}
```

**활성 조건**: OASIS 라이브러리가 클래스패스에 있을 때

### 3.4 프로퍼티 설정

```yaml
# application.yml 예시
cactus:
  tx-id-header: X-TX-ID          # 트랜잭션 ID 헤더명

  security:
    enabled: true
    jwt:
      secret: ${JWT_SECRET}       # HMAC 비밀키 (대칭키 모드)
      public-key: classpath:jwt/public.pem  # RSA 공개키 (비대칭키 모드)
      access-token-expiry: 30m
      refresh-token-expiry: 7d
      issuer: cactus

oasis:
  service:
    base-package: com.dongkuk     # BPMN 서비스 스캔 패키지
```

## 4. 설계 원칙

### 4.1 라이브러리, 프레임워크가 아님

cactus-core는 **라이브러리**다. 업무 모듈의 `build.gradle`에 의존성으로 추가해서 사용한다.
업무 모듈의 구조나 코드 스타일을 강제하지 않는다.

### 4.2 Convention over Configuration

Auto-Configuration으로 기본값을 제공하되, 프로퍼티로 재정의 가능하게 한다.
업무 모듈은 별도 설정 없이 의존성 추가만으로 동작해야 한다.

### 4.3 compileOnly 최소 노출

업무 모듈에 불필요하게 전이되는 의존성을 최소화한다.
Spring Web, Security, Servlet 등은 `compileOnly`로 선언하여
업무 모듈이 자신의 버전으로 직접 가져오게 한다.
