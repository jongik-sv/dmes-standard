# 91. AS-IS / TO-BE 마이그레이션 이력 (참고)

> 통합 원본: `02-AS-IS-TO-BE-비교.md` (401줄), `03-프로젝트-모듈-설계.md` (멀티모듈 폐기 안), `07-dmes-film-이식설계.md` (1718줄)
> 성격: **참고**. dmes-ref / dmes-film / Nexacro 레거시에서 cactus-core 로의 이식 의사결정 보존.

---

## 1. 마이그레이션 단계

```
[Nexacro XML 레거시]
        │
        ▼
[dmes-ref / dmes-film 1세대 자체 프레임워크]
        │
        ▼
[cactus-core (현재)]
```

---

## 2. AS-IS / TO-BE 핵심 변경

| 항목 | AS-IS (Nexacro/dmes-film) | TO-BE (cactus-core) |
|------|---------------------------|----------------------|
| 데이터 포맷 | XML (`<grids>`, `<rows>` 등) | JSON (`CactusRequest`/`CactusResponse`) |
| 통신 프로토콜 | Nexacro 전용 binary/XML | REST + JSON |
| 인증 | 세션 기반 | JWT (HMAC-SHA256, 향후 RSA) |
| 컨트롤러 | 도메인별 RestController | OasisController 단일 진입점 + BPMN 라우팅 |
| 트랜잭션 추적 | 없음 또는 비표준 | TxIdFilter + MDC + ServiceContext |
| 감사 컬럼 | Mapper SQL 에 매번 작성 | CactusAuditEntity + AuditListener (자동) |
| SQL 로깅 | 별도 처리 | SqlLoggingInterceptor (자동) |
| 모듈 구조 | 단일 monolith | 모듈별 분리 (portal, mpp, aps...) |
| 프론트엔드 | Nexacro Studio | Next.js 16 + shared (npm) |

---

## 3. 폐기된 설계 (의사결정 맥락)

### 3.1 멀티모듈 분리 (`cactus-core` + `cactus-oasis` + `cactus-security`)
- **초안 (`03-프로젝트-모듈-설계.md`)**: 책임별 모듈 분리
- **폐기 사유**: 
  - 모듈 간 순환 의존 위험
  - 도메인 모듈 입장에서 의존성 관리 복잡도 증가
  - 단일 라이브러리로도 패키지 분리로 충분한 응집/결합 달성
- **결정**: 단일 `cactus-core` 라이브러리로 통합 (현재 구조)

### 3.2 URL 구조 변경 이력 (3단계)
- **1차 안 (폐기)**: `POST /api/{serviceGroup}/{serviceId}/{action}` — `@PathVariable` 로 처리. NginX reverse proxy 에서 모듈별 라우팅 어려움
- **2차 안 (폐기)**: `POST /{serviceGroup}/api/{serviceId}/{action}` — `@RequestMapping("/${cactus.oasis.service-group}/api")` 로 모듈별 자동 prefix. 컨트롤러 매핑이 외부 프로퍼티에 의존하고 단일 BE 노출 path 가 모듈마다 달라짐
- **최종 안**: **`POST /oasis/{serviceId}/{action}`** (현재 구현). BE 컨트롤러는 단순 고정 매핑 `/oasis`. 모듈 식별은 NginX 또는 BFF 의 `/api/{module}/` 외부 라우팅으로 분리. `cactus.oasis.service-group` 은 URL 에서 빠지고 식별·로깅 용도로만 유지 (정리본 07 참고)

### 3.3 cactus-core 자체 AuthController 도입 안 (폐기)
- **초안**: cactus-core 가 표준 `AuthController` 를 제공하여 모든 모듈이 자동으로 `/api/auth/login` 등을 노출
- **폐기 사유**: 모듈마다 응답 포맷·세션 처리·BFF 연동 요건이 달라 표준화 어려움
- **최종**: cactus-core 는 **`AuthService`** 만 제공 (`CactusAuthAutoConfiguration` 통해 `cactus.auth.enabled: true` 시 등록). HTTP 엔드포인트는 도메인 모듈이 자체 컨트롤러 작성 (예: `portal/core` 의 `PortalAuthController`)

---

## 4. dmes-film → cactus-core 이식 (2026-04-26 완료)

### 4.1 이식된 산출물
| 항목 | dmes-film 위치 | cactus-core 위치 |
|---|---|---|
| 감사 엔티티 자동주입 | `dmes-film-common-jpa` | `cactus-core/audit/` |
| MyBatis SQL 로거 | `dmes-film-common-mybatis` | `cactus-core/audit/SqlLoggingInterceptor` |
| TraceId 필터 | `dmes-film-common-web` | `cactus-core/web/filter/TxIdFilter`, `RequestIdFilter` |
| URL 구조 | (구버전) | `/oasis/{serviceId}/{action}` (BE 직접) — BFF 가 `/api/{module}/oasis/...` 로 외부 노출 |

### 4.2 이식 시 포기/변경된 부분
- dmes-film 의 일부 도메인 특화 기능은 도메인 모듈 자체 보유
- Spring Boot 2.x → Spring Boot 4.x 마이그레이션 (Java 21)
- JJWT 0.11.x → 0.12.5

---

## 5. Nexacro → React 전환 (FE)

| 항목 | Nexacro | React (Next.js) |
|---|---|---|
| Grid | Nexacro Grid | AgDataGrid (`@dk-oasis/shared/grid`) |
| Form | Nexacro 폼 | FormGroup + Input/Select/DatePicker |
| 통신 | Nexacro Communicator | `apiRequest` (`@dk-oasis/shared/http`) |
| 메시지 | nexacro.alert | `gfn_message` (Toast) |
| 라우팅 | Nexacro App | Next.js App Router + portal-shell-core |

---

## 6. 데이터 포맷 마이그레이션 예시

### 6.1 검색 요청
**AS-IS** (Nexacro XML):
```xml
<root>
  <user_id>u1</user_id>
  <plant_cd>P1</plant_cd>
  <status>READY</status>
</root>
```

**TO-BE** (CactusRequest JSON):
```json
{
  "meta":   { "userId": "u1", "menuId": "MPP_WORK_ORDER" },
  "params": { "plantCd": "P1", "status": "READY" }
}
```

### 6.2 그리드 저장 요청
**AS-IS**:
```xml
<grid id="master">
  <row><column id="rowstatus">C</column><column id="qty">100</column></row>
</grid>
```

**TO-BE**:
```json
{
  "grids": {
    "master": { "rows": [ { "rowKey": "...", "rowStatus": "C", "qty": 100 } ] }
  }
}
```

---

## 7. 향후 마이그레이션 잔여

- Nexacro 일부 화면이 아직 m-aps/portal 에 마이그레이션 진행 중 (별도 progress 문서 참고)
- dmes-ref 의 일부 보안 기능 (RSA, 비밀번호 정책) 은 17/18 정리본의 미개발 영역으로 추적

---

## 8. 관련 정리본

- 90 갭분석 및 구현 로드맵
- 06 감사 엔티티 (이식 결과)
- 07 URL 구조 (변경 이력)
- 모든 개발완료 정리본 (01~08): 이식 결과물의 현재 상태
