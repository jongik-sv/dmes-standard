# Cactus Core Framework - 설계 문서

> **버전**: 2.0
> **최종 갱신**: 2026-03-30
> **기술 스택**: Spring Boot 4.0.3 / Spring Framework 7.0 / Java 21 / OASIS 5.0.0 / Jakarta EE 11
>
> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController/AuthService 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터 **ClientKeyFilter / RequestIdFilter**, 신규 AutoConfiguration **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성) / **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - env: `BACKEND_CLIENT_KEY` 통일.
> - {CLIENT} 사이트 코드 패키지 컨벤션: `com.dongkuk.dmes.{aps|mpp|mqc|portal}.*`.

## 프로젝트 개요

Cactus Core는 동국제강 DMES(Digital Manufacturing Execution System)의 **공통 프레임워크 라이브러리**다.
기존 CACTUS/Nexacro(XML 기반) 환경을 **OASIS/React(JSON 기반)** 환경으로 전환하면서,
업무 모듈이 공통으로 사용하는 기능을 하나의 라이브러리(`cactus-core`)로 제공한다.

### 핵심 목표

| 목표 | 설명 |
|------|------|
| **단일 진입점** | 모든 화면 요청을 `OasisController` 하나로 처리 (URL 기반 서비스 라우팅) |
| **표준 데이터 포맷** | CactusRequest/CactusResponse JSON 프로토콜로 프론트-백엔드 통신 통일 |
| **OASIS 통합** | OASIS 5.0 BPMN 서비스 엔진과의 브릿지 레이어 제공 |
| **보안 내장** | JWT 기반 인증/인가, BFF(Next.js) 연동 보안 체계 |
| **자동 설정** | Spring Boot Auto-Configuration으로 업무 모듈에서 의존성 추가만으로 사용 |

### 아키텍처 개관

```
┌─────────────────────────────────────────────────────┐
│  Next.js BFF (프론트엔드)                              │
│  - React UI → API 호출 → Cookie 기반 JWT 관리           │
└─────────────┬───────────────────────────────────────┘
              │ HTTP (JSON)
              ▼
┌─────────────────────────────────────────────────────┐
│  Spring Boot 업무 모듈 (WAS)                          │
│  ┌────────────────────────────────────────────────┐  │
│  │  cactus-core (이 프로젝트)                       │  │
│  │  ├─ oasis       : OasisController, 서비스 라우팅  │  │
│  │  ├─ security    : JWT, 인증/인가                  │  │
│  │  ├─ web         : Request/Response, 에러처리      │  │
│  │  ├─ common      : ErrorCode, BusinessException   │  │
│  │  ├─ util        : TxIdGenerator 등               │  │
│  │  └─ autoconfigure: 자동 설정                      │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │  OASIS 5.0 (BPMN 서비스 엔진)                    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
        ┌──────────┐
        │ Database │
        └──────────┘
```

## 문서 목차

| # | 문서 | 설명 |
|---|------|------|
| 01 | [아키텍처 및 모듈 구조](01-architecture.md) | 패키지 구조, 모듈 설계, 의존성 전략, Auto-Configuration |
| 02 | [데이터 포맷 명세](02-data-format.md) | CactusRequest/CactusResponse 프로토콜, 액션별 포맷, AS-IS/TO-BE 비교 |
| 03 | [OASIS 통합 레이어](03-oasis-integration.md) | OasisController, 서비스 라우팅, Request/Response 변환, BPMN 연동 |
| 04 | [보안 설계](04-security.md) | JWT 토큰 설계, 인증/인가 흐름, BFF 보안 연동, 패스워드 정책 |
| 05 | [웹 레이어 공통](05-web-commons.md) | 에러 처리, 서블릿 필터, CORS, 페이징, ApiResponse |
| 06 | [데이터 레이어](06-data-layer.md) | DataSource, MyBatis 통합, 감사(Audit), 캐시 (향후) |
| 07 | [파일 처리](07-file-handling.md) | Excel 업로드/다운로드, 첨부파일 처리 |
| 08 | [모듈간 통신](08-module-client.md) | ModuleClient, JWT 전파, Circuit Breaker (향후) |
| 09 | [구현 로드맵](09-implementation-roadmap.md) | 구현 단계, 현재 상태, 마이그레이션 가이드 |

## Maven 좌표

```groovy
dependencies {
    implementation 'com.dongkuk.dmes:cactus-core:1.0.11-SNAPSHOT'
}
```
