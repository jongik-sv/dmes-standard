# [cactus-core] dmes-ref 대비 기능 갭 분석 (보존용 stub)

> **상태: 마이그레이션 완료로 본 분석 종료 — stub.**
> 일시(원본): 2026-04-01 11:30
> 비교 대상(원본): dmes-ref (DMES-FILM 레퍼런스 프레임워크)

본 문서는 cactus-core 가 재사용 라이브러리로 막 분리된 시점(2026-04-01)에 작성된 **dmes-ref 대비 기능 갭 스냅샷**이었다.
이후 다음의 후속 마이그레이션이 진행/완료되었으므로 본 갭표는 더 이상 cactus-core 의 현행 사실을 반영하지 않는다.

## 분석 종료 사유 (2026-04-26 기준)

- 패키지 / 산출물 정합화 — 패키지 `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`. cactus-core 는 `java-library + maven-publish` 로 발행.
- AuthController 데드코드 삭제 — cactus-core 본체의 AuthController 는 호출자 0 으로 삭제, portal 자체의 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 가 `/api/auth/**` 엔드포인트를 담당.
- 신규 표준 필터 — `ClientKeyFilter`(`X-Backend-Client-Key`), `RequestIdFilter`(요청 식별자) 가 cactus 표준 web 필터로 통합.
- 신규 AutoConfiguration — `CactusAuthAutoConfiguration`(default 비활성, `cactus.auth.enabled=true` 시 활성), `CactusWebSecurityAutoConfiguration`(default `SecurityFilterChain`, `@ConditionalOnMissingBean`), `AuditAutoConfiguration` 등록.
- OASIS 매핑 단일화 — `OasisController` 매핑 `/oasis/{serviceId}/{action}` 으로 고정 (옛 `/${cactus.oasis.service-group}/api` 폐기). `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
- env 표준화 — `BACKEND_CLIENT_KEY` 로 통일 (옛 `UI_CLIENT_KEY` 폐기).

## 항목별 현행 위치 (해소된 갭)

| 갭 항목 (원본) | 현행 처리 |
|---|---|
| 엔티티 변경 추적 (감사 기본 엔티티) | `com.dongkuk.dmes.cactus.audit.*` (CactusAudit / CactusAuditEntity / CactusAuditListener / CactusMybatisAuditInterceptor + AuditAutoConfiguration) — 구현 완료 |
| MyBatis SQL 로거 | `com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor` — 구현 완료 |
| 비밀번호 변경/이력 | portal 자체 PortalAuthController 영역으로 이관 (cactus-core 는 `PasswordEncoder` 만 제공) |
| RBAC / 메뉴 관리 | 본 분석에서도 제외 항목 — portal WAS 영역. {CLIENT} portal 모듈에서 별도 운영. |
| 마스터 코드 관리 / LOV / 요청 감사 로깅 / 멀티 DS / EAI / 메일 / HTTP 클라이언트 / 엑셀 / ID 생성기 / 유틸 | 본 마이그레이션 범위에는 포함되지 않음. 후속 작업 시 별도 문서로 재산정. |

## 원본 자료 보존

원본 갭 분석의 상세 매트릭스/우선순위/Phase 1~3 로드맵은 의사결정 맥락 보존을 위해 **삭제하지 않고** 본 stub 으로 대체한다.
원본 내용은 git 이력에서 확인 가능하며, 재산정이 필요하면 신규 문서를 생성한다.
