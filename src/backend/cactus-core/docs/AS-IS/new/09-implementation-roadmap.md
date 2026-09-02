# 09. 구현 로드맵

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController/AuthService 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터 **ClientKeyFilter / RequestIdFilter**, 신규 AutoConfiguration **CactusAuthAutoConfiguration / CactusWebSecurityAutoConfiguration**.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - env: `BACKEND_CLIENT_KEY` 통일.

## 1. 현재 구현 상태 (v1.0.11)

### 구현 완료

| 패키지 | 클래스 | 상태 |
|--------|--------|------|
| `autoconfigure` | CactusAutoConfiguration, CactusProperties | 완료 |
| `autoconfigure` | SecurityAutoConfiguration | 완료 |
| `autoconfigure` | CactusAuthAutoConfiguration (신규, default 비활성) | 완료 |
| `autoconfigure` | CactusWebSecurityAutoConfiguration (신규, default SecurityFilterChain) | 완료 |
| `autoconfigure` | OasisAutoConfiguration | 완료 |
| `oasis` | OasisController (매핑 `/oasis` 고정) | 완료 |
| `oasis` | OasisServiceExecutor | 완료 |
| `oasis` | CactusRequestConverter, CactusResponseConverter | 완료 |
| `oasis` | OasisProperties | 완료 |
| `security.jwt` | JwtTokenProvider | 완료 |
| `security.jwt` | JwtAuthenticationFilter | 완료 |
| `security.jwt` | JwtTokenHolder, TokenPair | 완료 |
| `security.filter` | ClientKeyFilter (신규) | 완료 |
| `security.filter` | RequestIdFilter (신규) | 완료 |
| `security.auth` | (※ AuthController/AuthService 는 cactus-core 본체에서 삭제됨 — portal 사용) | 삭제 |
| `security.auth` | PasswordEncoder | 완료 |
| `security.auth` | SecUser, SecUserPwd, Repositories | 완료 |
| `security.auth` | LoginRequest, RefreshRequest | 완료 |
| `security.context` | UserInfo, UserContext, UserContextHolder | 완료 |
| `web.request` | CactusRequest, RequestMeta, GridData, RowStatus | 완료 |
| `web.response` | CactusResponse, ResponseMeta, GridResult | 완료 |
| `web.response` | ColumnMeta, ColumnOption, ErrorDetail | 완료 |
| `web.converter` | GridConverter | 완료 |
| `web.filter` | TxIdFilter | 완료 |
| `web.exception` | GlobalExceptionHandler | 완료 |
| `common` | ErrorCode, BusinessException, ApiResponse | 완료 |
| `util` | TxIdGenerator | 완료 |

### 테스트 작성 완료

| 테스트 클래스 | 대상 |
|--------------|------|
| CactusRequestTest | CactusRequest 생성/직렬화 |
| GridDataTest | GridData 조작 |
| CactusResponseTest | CactusResponse Builder |
| ResponseMetaTest | ResponseMeta |
| ErrorDetailTest | ErrorDetail |
| GridConverterTest | OASIS ↔ Cactus 변환 |
| TxIdGeneratorTest | UUID 생성 |
| ErrorCodeTest | ErrorCode enum |
| BusinessExceptionTest | 예외 생성/전파 |
| JwtTokenProviderTest | JWT 토큰 생성/검증 |
| JwtAuthenticationFilterTest | 필터 동작 |
| PasswordEncoderTest | BCrypt 암호화/검증 |
| UserContextHolderTest | ThreadLocal 사용자 컨텍스트 |
| AuthServiceTest | 로그인/리프레시 로직 |

## 2. 구현 로드맵

### Phase 2: 데이터 레이어 (다음 단계)

| 항목 | 설명 | 의존성 추가 |
|------|------|------------|
| MyBatis 공통 설정 | Auto-Configuration, TypeHandler | `mybatis-spring-boot-starter` |
| 페이징 인터셉터 | Oracle/PostgreSQL 방언별 자동 페이징 | - |
| Audit 인터셉터 | INSERT/UPDATE 시 감사 필드 자동 주입 | - |
| DataSource 설정 | 다중 DataSource, 읽기/쓰기 분리 | `HikariCP` |

### Phase 3: 파일 처리

| 항목 | 설명 | 의존성 추가 |
|------|------|------------|
| ExcelConverter | GridData ↔ Excel 변환 | `apache-poi` |
| FileStorageService | 파일 저장소 추상화 | - |

### Phase 4: 모듈간 통신

| 항목 | 설명 | 의존성 추가 |
|------|------|------------|
| ModuleClient | HTTP 기반 모듈간 호출 | `spring-web` (RestClient) |
| JWT 전파 | 요청 간 토큰 자동 전달 | - |
| Circuit Breaker | 장애 전파 방지 | `resilience4j` |

### Phase 5: 운영 지원

| 항목 | 설명 | 의존성 추가 |
|------|------|------------|
| RequestLoggingFilter | 요청/응답 로깅 | - |
| Cache 통합 | 공통 코드 캐시 | `caffeine` |
| Token 블랙리스트 | 로그아웃 시 토큰 무효화 | `Redis` (선택) |
| Rate Limiting | API 호출 제한 | - |

## 3. 업무 모듈 마이그레이션 가이드

### 3.1 신규 업무 모듈 생성

```
1. Spring Boot 프로젝트 생성 (Spring Initializr)
2. build.gradle에 cactus-core 의존성 추가
3. application.yml에 cactus/oasis 설정
4. BPMN 서비스 정의 (서비스그룹/서비스ID/액션)
5. @Service 클래스 작성 (VariableList 입출력)
```

### 3.2 기존 CACTUS/Nexacro → Cactus/React 전환

| 단계 | AS-IS | TO-BE |
|------|-------|-------|
| 1. 프론트엔드 | Nexacro XML | React + Next.js BFF |
| 2. 요청 포맷 | XML Dataset | JSON CactusRequest |
| 3. 컨트롤러 | 개별 Controller | OasisController (공통) |
| 4. 서비스 레이어 | OASIS XML 서비스 | OASIS BPMN 서비스 (동일) |
| 5. 인증 | 세션 기반 | JWT + BFF Cookie |

> **핵심**: 서비스 레이어(OASIS BPMN)는 그대로 재사용.
> 변경되는 것은 프론트엔드 ↔ 컨트롤러 간 데이터 포맷 변환 계층.

### 3.3 신규 화면 추가 절차

```
1. BPMN 서비스 정의
   - src/main/resources/bpmn/{serviceGroup}/{serviceId}/{action}.bpmn

2. Java 서비스 작성
   - @Service 클래스에 비즈니스 로직 구현
   - VariableList로 입출력 처리

3. (선택) SecurityConfig URL 패턴 추가
   - 특별한 권한이 필요한 경우에만

4. React 화면 작성
   - CactusRequest JSON으로 API 호출
   - POST /api/{serviceGroup}/{serviceId}/{action}

5. BFF 프록시 확인
   - 기본적으로 /api/** 패턴이 WAS로 프록시되므로 추가 설정 불필요
```

## 4. 기술 스택 요약

| 구분 | 기술 | 버전 |
|------|------|------|
| Language | Java | 21 |
| Framework | Spring Boot | 4.0.3 |
| Spring | Spring Framework | 7.0.x |
| Jakarta | Jakarta EE | 11 |
| OASIS | oasis-core | 5.0.0 |
| JWT | jjwt | 0.12.5 |
| Password | jBCrypt | 0.4 |
| JSON | Jackson | (Spring Boot BOM) |
| Build | Gradle | 8.x |
| Repository | Nexus | 사내 (172.31.1.96:8889) |
