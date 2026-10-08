# RBAC 단순화 — `/api/{moduleId}/{objId}/{actionId}` 컨벤션

> **선행 작업**: §13 "OBJ_ID 단일화" 가 본 컨벤션의 전제. URL 의 `{objId}` 가 곧 화면 디렉토리명(파일명) 이 되도록 OBJ_ID 데이터를 먼저 정리한 뒤 본 컨벤션을 적용한다.

## 진행 상태 (Phase A/B/C 완료 — 2026-05)

| Phase | 작업 | 상태 |
|---|---|---|
| A | OBJ_ID 단일화 (kebab-case + OBJ_NO 컬럼 제거) | ✅ **완료** — V12 마이그레이션 + ObjIdMigrationRunner |
| B | 권한관리 UI 가 새 컨벤션 endpoint 자동 산출 | ✅ **완료 (입력칸 read-only 화는 미적용, optional)** |
| C | PermKey + UserPermCache + EndpointPermissionFilter 리팩터 + PlantController PoC | ✅ **완료** — end-to-end 검증 (search OK / save 403) |
| D | 나머지 컨트롤러 일괄 마이그레이션 (mpn aps-core ~50개 + mpp 1개) | 🔒 **보류** — 사용자 결정 |
| E | 마무리 (legacy 코드 제거, ENDPOINT/HTTP_METHOD deprecated 명시) | 🔒 **보류** |

**현재 운영 상태**:
- `PlantController` 만 새 컨벤션 (`/api/mpn/plant/{search,save,delete}`) — 일반 사용자 RBAC 정상 동작
- 나머지 컨트롤러 (mpn 약 50개) 는 legacy REST 그대로 — admin (SYSADMIN bypass) 만 안전. 일반 사용자에게 새 형식 perm 부여 시 그 사용자는 그 화면들을 쓸 수 없음
- MCM admin 화면 (사용자/역할/권한 관리 등 11개) 은 OASIS 사용 — RBAC 미통합. SYSADMIN 전용 정책 권장 (별도 결정)

**Phase D 재개 시 reference**:
- BE 패턴: `aps-core/.../master/controller/PlantApiController.java` + `master/dto/request/Plant{Search,Save,Delete}Request.java`
- FE 패턴: `m-mpn/src/master/plant/plant-api.ts` 의 새 URL 호출 형식
- BFF 라우트: `m-mcm/app/api/[module]/[...path]/route.ts` (catch-all, fullPath 유지)
- 컨트롤러당 변환 단위: 30~60분 (CRUD), 1~2시간 (sub-resource 보유)

## 0. 결정 사항 한눈에 보기

| 항목 | 결정 |
|---|---|
| URL 컨벤션 | `/api/{moduleId}/{objId}/{action}` (3-segment, 단일 segment objId) |
| HTTP method | 전부 **POST + JSON body** (OASIS 와 통일) |
| Action 형식 | **소문자** (예: `search`, `save`, `delete`, `export`, ...) |
| OBJ_ID 형식 | kebab-case 단일 segment (예: `plant`, `scheduling-exceptions`) |
| OBJ_NO 컬럼 | 제거 (페이지명 / 객체ID 단일화) |
| PERM_ID 형식 | 기존 그대로 (`perm_<module>_<screen>_<level>`) |
| 캐시 저장소 | BE in-memory `ConcurrentHashMap` (단일 인스턴스) |
| 권한 저장 | BE 캐시 + JWT 에 sub 만 (권한 변경 즉시 반영) |
| 캐시 TTL | 10분 + 권한 변경 시 즉시 invalidate |
| PoC 대상 | `PlantController` 한 개 |

## 1. 배경

기존 REST RBAC 의 한계:

- REST 는 같은 URL 의 method 로 액션 분리 (`GET /api/plants` vs `POST /api/plants`)
- Path 만 보고 RBAC 매칭하면 SEARCH/SAVE/DELETE 분리 불가능
- Method 까지 보면 분리 가능하지만 권한관리 UI 에서 사용자가 GET/POST 를 의식해야 함
- 현 path-only 정책은 같은 OBJ 의 모든 액션이 같은 path 라 액션 분리가 명목상에 그침

## 2. 목표

1. **URL 자체에 (모듈, OBJ, 액션) 정보를 담는다** — OASIS `/oasis/{serviceId}/{action}` 패턴을 REST 영역까지 확장
2. **권한관리 UI 에서 endpoint 입력칸 제거** — 사용자는 OBJ + ACTION 만 선택
3. **로그인 시점에 사용자 권한 set 을 BE 에 캐시** — 요청마다 DB 조회 없이 in-memory lookup
4. **컨트롤러 어노테이션도 불필요** — URL 자체가 RBAC key

## 3. URL 컨벤션

```
/api/{moduleId}/{objId}/{action}
```

| segment | 예시 | 출처 |
|---|---|---|
| `moduleId` | `mpn`, `mpp`, `mqc`, `mcm` | `TB_SEC_OBJ.SYS_CD` |
| `objId`    | `plant`, `schedules`, `permission-management`, `scheduling-exceptions` | `TB_SEC_OBJ.OBJ_ID` (= 화면 식별자, §13 참조) |
| `action`   | `search`, `save`, `delete`, `export`, `import`, `print`, ... | `STANDARD_ACTIONS` (소문자) |

HTTP method 는 전부 **POST + JSON body** (OASIS 와 동일 — path-param 들은 body 로 이동).

URL 은 정확히 3-segment (`/api/{moduleId}/{objId}/{action}`). objId 는 단일 segment(슬래시 없음) 라 파서가 split('/') 으로 단순 처리.

### 예시 변환표

| 화면 동작 | AS-IS (REST) | TO-BE (path-encoded) |
|---|---|---|
| 공장 목록 조회 | `GET /api/plants?size=20` | `POST /api/mpn/plant/search` body=`{size:20}` |
| 공장 등록 | `POST /api/plants` body=`{...}` | `POST /api/mpn/plant/save` body=`{...}` |
| 공장 수정 | `PUT /api/plants/{id}` body=`{...}` | `POST /api/mpn/plant/save` body=`{id, ...}` |
| 공장 삭제 | `DELETE /api/plants/{id}` | `POST /api/mpn/plant/delete` body=`{id}` |
| 스케줄 목록 | `GET /api/schedules?size=500` | `POST /api/mpn/schedules/search` body=`{size:500}` |
| 부하 초과 (스케줄) | — | `POST /api/mpn/scheduling-exceptions/search` |
| 부하 초과 (계획) | — | `POST /api/mpn/planning-exceptions/search` |
| 엑셀 다운로드 | `GET /api/items/export` | `POST /api/mpn/material/export` body=`{filters}` |

## 4. 컨트롤러 작성 패턴

```java
@RestController
@RequestMapping("/api/mpn/plant")        // ← objId = 화면 디렉토리명 'plant'
@RequiredArgsConstructor
public class PlantController {

    private final PlantService plantService;

    @PostMapping("/search")
    public ApiResponse<PageResponse<PlantResponse>> search(@RequestBody PlantSearchRequest req) {
        return ApiResponse.success(plantService.search(req));
    }

    @PostMapping("/save")
    public ApiResponse<PlantResponse> save(@RequestBody PlantSaveRequest req) {
        // create / update 분기는 body 의 id 유무로
        return ApiResponse.success(plantService.save(req));
    }

    @PostMapping("/delete")
    public ApiResponse<Void> delete(@RequestBody PlantDeleteRequest req) {
        plantService.delete(req.getId());
        return ApiResponse.success();
    }

    @PostMapping("/export")
    public ResponseEntity<byte[]> export(@RequestBody PlantSearchRequest req) {
        return ResponseEntity.ok().body(plantService.exportExcel(req));
    }
}
```

> 충돌 그룹의 화면(예: `scheduling-exceptions`) 도 동일한 단일 segment 형태 — `@RequestMapping("/api/mpn/scheduling-exceptions")`.

## 5. 로그인 시 권한 캐싱

### 5.1 데이터 모델

```java
public record PermKey(String moduleId, String objId, String action) {
    public static PermKey of(String moduleId, String objId, String action) {
        return new PermKey(moduleId, objId.toUpperCase(), action.toUpperCase());
    }
}
```

### 5.2 로그인 흐름

```
[Login Success Handler — JWT 발급 직후]
  ↓
1. userId 추출
2. TB_SEC_USER_ROLE → roleIds 조회
3. TB_SEC_ROLE_PERM 조인 → permIds 조회
4. TB_SEC_PERM ⨝ TB_SEC_OBJ ⨝ TB_SEC_PERM_BUTTON 조인:
     SELECT B.SYS_CD
          , B.OBJ_ID
          , C.ACTION
     FROM   TB_SEC_PERM A
          , TB_SEC_OBJ B
          , TB_SEC_PERM_BUTTON C
     WHERE  B.OBJ_ID = A.OBJ_ID
     AND    C.PERM_ID = A.PERM_ID
     AND    A.PERM_ID IN (:permIds)
     AND    C.USE_YN = 'Y'
5. Set<PermKey> 로 묶음
6. UserPermCache.put(userId, permKeySet, ttl=10분)
```

### 5.3 캐시 구현

```java
@Component
public class UserPermCache {
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private static final long TTL_MS = 10 * 60 * 1000L;

    public void put(String userId, Set<PermKey> perms) {
        cache.put(userId, new Entry(perms, System.currentTimeMillis() + TTL_MS));
    }

    public Optional<Set<PermKey>> get(String userId) {
        Entry e = cache.get(userId);
        if (e == null || e.expiresAt < System.currentTimeMillis()) return Optional.empty();
        return Optional.of(e.perms);
    }

    public void invalidate(String userId) { cache.remove(userId); }
    public void invalidateAll() { cache.clear(); }

    private record Entry(Set<PermKey> perms, long expiresAt) {}
}
```

### 5.4 캐시 무효화

| 트리거 | 동작 |
|---|---|
| 관리자가 사용자 role 변경 | 영향받는 userId 캐시 즉시 삭제 |
| role → perm 매핑 변경 | 그 role 을 가진 모든 user 캐시 삭제 |
| perm → button 매핑 변경 | 동일 |
| TTL (10분) 만료 | 다음 요청 시 자동 재로드 (synchronous) |

기존 `RoleChangedEvent` 리스너에 `UserPermCache.invalidate(...)` 추가로 처리.

### 5.5 분산 환경 고려

- 단일 인스턴스: `ConcurrentHashMap` 충분
- 다중 인스턴스: Redis 로 교체 (또는 Spring Session 위임)
- 짧은 TTL (10분) 로 인스턴스 간 eventual consistency 허용

## 6. 권한 체크 — 언제 어디서?

### 6.1 Spring Security 필터 체인 안에서 — 컨트롤러 진입 직전

현재 `SecurityConfig.java` 의 필터 체인 순서:

```
1. TxIdFilter            — 트랜잭션 ID 부여 (보안 체인 바깥 servlet 필터, 체인 시작 전에 실행)
2. RequestIdFilter       — 요청 ID 부여
3. ClientKeyFilter       — X-Client-Key 검증 (BFF 호출만)
4. JwtAuthenticationFilter ← JWT 검증, SecurityContext 에 사용자 인증 정보 set
5. RevokedTokenFilter    — JTI 블랙리스트 체크
6. EndpointPermissionFilter ← 여기서 RBAC 체크. 본 작업의 핵심
   ─────────────────────
7. DispatcherServlet     ← 통과해야만 컨트롤러로 라우팅
8. (HandlerInterceptors)
9. Controller method 실행
```

즉 **JWT 인증이 먼저 통과한 직후, DispatcherServlet 이 컨트롤러를 찾기 전에** RBAC 가 떨어집니다. 인증된 사용자의 신원을 알아야 perm cache 를 조회할 수 있고, 컨트롤러는 권한 통과한 요청만 받게 함으로써 비즈니스 로직이 권한 검증을 신경 쓸 필요가 없게 됩니다.

### 6.2 EndpointPermissionFilter 동작

```java
@Override
protected void doFilterInternal(HttpServletRequest request,
                                 HttpServletResponse response,
                                 FilterChain chain) throws ... {
    // 1) 인증 확인 (JwtAuthenticationFilter 가 이미 처리해서 SecurityContext set 됨)
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (!isAuthenticated(auth)) { chain.doFilter(request, response); return; }

    // 2) SYSADMIN bypass
    if (securityIdentity.hasAuthority("SYSADMIN")) { chain.doFilter(...); return; }

    // 3) URL 파싱 — /api/{moduleId}/{objId}/{action}
    PermKey requested = parseUrl(request.getRequestURI());
    if (requested == null) { chain.doFilter(...); return; } // 비표준 URL 은 통과 (gradual rollout)

    // 4) 캐시 조회 (cache miss 시 synchronous 재로드)
    String userId = securityIdentity.currentUserId();
    Set<PermKey> userPerms = userPermCache.get(userId)
        .orElseGet(() -> userPermCache.loadAndCache(userId));

    // 5) 매칭
    if (userPerms.contains(requested)) {
        chain.doFilter(request, response);
    } else {
        log.info("[RBAC] denied user={} requested={}", userId, requested);
        response.sendError(HttpServletResponse.SC_FORBIDDEN);
    }
}
```

### 6.3 시간 비용

전형적인 요청 한 건 처리 시간:
- 캐시 hit: **<0.1ms** (HashMap lookup + Set.contains)
- 캐시 miss: 50~200ms (DB 조회 한 번, 이후 10분간 hit)

### 6.4 FE 측 사전 차단

BFF (`m-mcm/proxy.ts`) 의 미들웨어도 동일 시맨틱으로 **요청을 BE 에 보내기 전에** 1차 차단:
- BFF 가 NextAuth JWT 에서 roles 추출 → 같은 perm cache (FE 측) 에서 lookup
- 통과하면 BE 로 forward, 실패하면 즉시 403 반환
- 두 단의 캐시는 독립적이지만 같은 정책 적용 (defense-in-depth)

## 7. 권한관리 UI 변경

### 7.1 AS-IS

| 컬럼 | 의미 |
|---|---|
| 액션 | SEARCH / SAVE / DELETE ... |
| 표시명 | 한글 라벨 |
| **엔드포인트** | `/api/mpn/rest/**` 등 path 패턴 (사용자 입력) |

### 7.2 TO-BE

| 컬럼 | 의미 |
|---|---|
| 액션 | SEARCH / SAVE / DELETE ... |
| 표시명 | 한글 라벨 |

→ 엔드포인트 칸 자체가 사라짐. URL 은 BE 가 자동 결정.

저장 시 TB_SEC_PERM_BUTTON 에 `(PERM_ID, OBJ_ID, ACTION)` 행만 들어가면 충분. ENDPOINT/HTTP_METHOD 컬럼은 deprecated (스키마 호환을 위해 컬럼 자체는 남기되 사용 안 함).

## 8. 기존 OASIS 와의 통합

OASIS 가 이미 `/oasis/{serviceId}/{action}` 컨벤션. 새 RBAC 가 같은 PermKey 모델로 OASIS 도 처리 가능:

```
OASIS:  /oasis/secUser/search   → PermKey(moduleId="mcm", objId="OBJ_USER_MGMT", action="SEARCH")
REST:   /api/mpn/MPN_PLANT/SEARCH → PermKey(moduleId="mpn", objId="MPN_PLANT", action="SEARCH")
```

Filter 의 URL 파서가 두 패턴 모두 인식하면 됨. OBJ_ID ↔ serviceId 매핑은 `TB_SEC_OBJ` 의 metadata 로 관리.

## 9. 마이그레이션 비용

| 영역 | 작업량 | 비고 |
|---|---|---|
| BE 컨트롤러 URL 재정의 (mpn / mpp / mqc / aps) | 큼 | 컨트롤러 수십 개 |
| FE API 호출 path 일괄 변경 (`*-api.ts`) | 큼 | 모든 화면별 api 파일 |
| path-param → body 이동 | 중간 | DTO 필드 추가 |
| `UserPermCache` + 새 `EndpointPermissionFilter` | 작음 | mcm-core |
| Login Success Handler 에 권한 로딩 | 작음 | mcm-core |
| 권한관리 UI 단순화 | 작음 | endpoint 칸 제거 |
| V12 마이그레이션 (legacy 컬럼 deprecation 주석) | 작음 | |

## 10. 점진 도입 전략

전체 한 번에 안 바꿔도 됩니다. 단 OBJ_ID 단일화(§13) 는 선행되어야 함.

### ✅ Phase A — OBJ_ID 단일화 (§13) — **완료**
- V12 마이그레이션 (OBJ_ID rename + OBJ_NO drop)
- BE 엔티티/리포지토리/시드 정리
- FE object-management UI 단순화 (objNo 컬럼 제거)
- FE module-pages.ts / portal-shell objId 참조 통일
- 메뉴 라우팅 / 권한관리 회귀 검증

### ✅ Phase B — 권한관리 UI endpoint 자동 산출 — **완료 (입력칸 read-only 화 제외)**
- `getActionApiPattern` 가 `/api/{sysCd}/{objId}/{action}` 직접 산출
- STANDARD_ACTIONS 코드 모두 소문자 (search/save/delete/...)
- TB_SEC_PERM_BUTTON.ENDPOINT 가 새 형식으로 자동 등록됨
- 액션 변경 시 endpoint 자동 재계산 (이전 값 덮어씀)
- ⏸ optional: endpoint 입력칸 read-only 화 — UI 안 함 상태

### ✅ Phase C — RBAC 필터 + 권한 캐시 + PoC 컨트롤러 (§3 ~ §6) — **완료**
- `PermKey` (record), `UserPermCache` (in-memory) 구현
- `McmAuthController.login` 에서 `userPermCache.loadAndCache()` eager 호출
- `EndpointPermissionFilter` 가 URL 을 PermKey 로 파싱 → cache lookup. legacy URL 은 path-only resolver fallback
- `PlantApiController` (`@RequestMapping("/api/mpn/plant")`) + `PlantSearchRequest/PlantSaveRequest/PlantDeleteRequest`
- BFF catch-all 라우트 `/api/[module]/[...path]/route.ts` (full path 유지, 기존 rest/oasis 와 공존)
- FE `m-mpn/src/master/plant/plant-api.ts` CRUD 5개 새 형식
- 검증: 일반 사용자 search perm 만 보유 → 조회 OK / 저장 403

### 🔒 Phase D — 컨트롤러 일괄 변환 — **보류**

규모: aps-core ~50개 컨트롤러 + m-mpn 45개 api.ts. 추정 50~70시간.

재개 시 reference:
- BE 패턴: `PlantApiController.java` + `Plant{Search,Save,Delete}Request.java`
- FE 패턴: `plant-api.ts` 의 새 URL 호출 형식
- BFF 라우트: `m-mcm/app/api/[module]/[...path]/route.ts`

옵션:
- **D-1. 핵심 우선** (자주 쓰는 5~10개 화면, 5~10h)
- **D-2. 마스터 18개 일괄** (15~20h)
- **D-3. 전체** (50~70h)
- **D-4. 자동화 도구 + 적용** (도구 10h + 적용 20h)

### 🔒 Phase E — 마무리 — **보류**
- TB_SEC_PERM_BUTTON ENDPOINT/HTTP_METHOD 컬럼 deprecated 명시 (V13 코멘트)
- 이전 path-only / METHOD:path 코드 경로 제거
- ObjIdMigrationRunner 일회성 적용 후 안전 시점에 제거 가능

### 두 컨벤션 공존 기간 (Phase C ~ D)
- 새 path-encoded URL 과 기존 REST URL 이 한동안 공존
- 새 EndpointPermissionFilter 가 두 패턴 모두 처리:
  - `/api/{moduleId}/{objId}/{action}` 패턴 매칭 → PermKey 추출
  - 비매칭 URL 은 점진적 활성화 정책 (UNMATCHED → 통과)
- **현재 PlantController 만 마이그레이션됨** — 나머지는 legacy 그대로

### MCM admin 화면 정책 (별도 결정)

MCM admin 화면 (사용자/역할/권한/오브젝트/메뉴 관리 등 11개) 은 **OASIS** 사용:
- 실제 호출 URL: `/api/mcm/oasis/secUser/search` 등
- 새 perm UI 가 등록하는 URL: `/api/mcm/user-management/search`
- 두 형식 안 맞아 일반 사용자 RBAC 미통합. SYSADMIN bypass 로만 통과

권장: **(c) SYSADMIN 전용 정책** — admin 화면은 SYSADMIN 만 사용한다는 운영 규칙으로 못박음. 미래에 일반 사용자에게 admin 권한 위임 필요 시 OASIS 컨벤션 통합 (Phase F 로 별도 작업).

## 11. 결정 사항 (확정)

- [x] **OBJ_ID 표기** — 화면 디렉토리명(kebab-case 단일 segment) 으로 단일화 (§13)
- [x] **OBJ_ID 충돌 그룹 prefix 명명** — 옵션 B (하이픈) — `scheduling-exceptions`, `planning-exceptions`
- [x] **PERM_ID 형식** — 기존 그대로 (단일 segment OBJ_ID 라 변경 불필요)
- [x] **HTTP method** — 전부 POST + JSON body 통일 (OASIS 와 동일)
- [x] **캐시 저장소** — BE in-memory `ConcurrentHashMap` (단일 인스턴스 기준)
- [x] **권한 저장 방식** — BE 캐시 + JWT 에는 `sub` (userId) 만. 권한 변경 즉시 반영 가능
- [x] **PoC 컨트롤러** — `PlantApiController` end-to-end 검증 완료 (search OK / save 403). 패턴 확정됨
- [x] **Action 형식** — 소문자 (search/save/delete/export/import/print/approve/reject/confirm/cancel/copy)
- [x] **MCM admin 정책** — SYSADMIN 전용 (admin 화면은 OASIS 컨벤션 유지, 일반 사용자에게 위임 시 별도 작업)

## 12. 참고

- 기존 OASIS RBAC: `/oasis/{serviceId}/{action}` (POST only)
- 기존 REST RBAC: `/api/{module}/rest/**` (path-only, action 분리 안됨)
- 본 컨벤션: 두 패턴을 단일 모델로 통합 (`{moduleId}/{objId}/{action}`)
- Spring Security filter chain 진입점: `SecurityConfig.java` `addFilterAfter(endpointPermissionFilter, ...)`

---

## 13. OBJ_ID 단일화 (선행 작업)

본 컨벤션의 `{objId}` 가 의미를 가지려면 OBJ_ID 데이터를 화면 디렉토리명과 동일하게 정리해야 한다.

### 13.1 현재 상태 (AS-IS)

`TB_SEC_OBJ` 가 두 식별자를 따로 관리:

| 컬럼 | 의미 | 예시 |
|---|---|---|
| `OBJ_ID` (PK) | 권한 매핑용 논리 식별자 (대문자 SNAKE) | `OBJ_PLANT`, `OBJ_PERM_MGMT`, `OBJ_SCH_EXCEPTIONS` |
| `OBJ_NO` | 페이지명 = 화면 물리 디렉토리명 (kebab-case) | `plant`, `permission-management`, `exceptions` |

권한관리 UI 도 두 컬럼(객체 ID / 페이지명) 을 따로 표시.

문제:
- `OBJ_ID` 와 `OBJ_NO` 가 사실상 1:1 매핑 — 사용자가 둘 다 입력하는 게 중복
- 새 RBAC 컨벤션의 URL 에 들어갈 식별자가 둘 중 어느 거냐는 모호함
- DB 의 `OBJ_PLANT` 가 화면의 `page-components/plant/page.tsx` 와 직관적으로 안 매핑됨

### 13.2 목표 (TO-BE)

| 컬럼 | 의미 | 예시 |
|---|---|---|
| `OBJ_ID` (PK) | 화면 식별자 = RBAC URL 의 `{objId}` segment (kebab-case 단일 segment) | `plant`, `permission-management`, `scheduling-exceptions` |
| ~~`OBJ_NO`~~ | ❌ 제거 | — |

UI 컬럼명도 "객체 ID" / "페이지명" → **"OBJECT ID"** 단일 컬럼.

### 13.3 OBJ_ID ↔ 디렉토리명 매핑

대부분 `OBJ_NO` 를 그대로 OBJ_ID 로 채택. 단 두 OBJ 가 같은 `OBJ_NO` 를 공유하는 충돌 케이스가 1건 — 도메인 prefix 를 하이픈으로 붙여 분리:

| AS-IS OBJ_ID | AS-IS OBJ_NO | TO-BE OBJ_ID |
|---|---|---|
| `OBJ_PLANT` | `plant` | `plant` |
| `OBJ_BOM` | `bom` | `bom` |
| `OBJ_USER_MGMT` | `user-management` | `user-management` |
| `OBJ_PERM_MGMT` | `permission-management` | `permission-management` |
| `OBJ_SCHEDULES` | `schedules` | `schedules` |
| `OBJ_SCH_EXCEPTIONS` | `exceptions` | **`scheduling-exceptions`** ← 충돌 회피 |
| `OBJ_PLN_EXCEPTIONS` | `exceptions` | **`planning-exceptions`** ← 충돌 회피 |
| `OBJ_MPP_WORK_ORDER` | `work-order` | `work-order` |
| ... (전체 약 60개) | | |

#### 충돌 해결 정책 (결정됨 — 옵션 B)

OBJ_NO 가 unique 하면 그대로 OBJ_ID 채택. 중복 시 도메인 prefix 를 **하이픈** 으로 붙여 분리:
- `scheduling-exceptions` (스케줄 도메인)
- `planning-exceptions`   (계획 도메인)

> 한 OBJ_ID = 한 화면 = 한 URL segment 라는 1:1 단순성을 유지하기 위해 슬래시는 사용하지 않음. 즉 OBJ_ID 는 항상 단일 path segment.

> 단, 화면 디렉토리 자체(`page-components/scheduling/exceptions/page.tsx`) 는 그대로 두고 OBJ_ID 만 disambiguated 식별자로 사용. FE 의 페이지 resolver 가 OBJ_ID → 실제 디렉토리 경로 매핑을 한 곳에서 처리 (충돌 케이스 2건만 lookup table 에 명시).

### 13.4 영향 범위

| 영역 | 변경 |
|---|---|
| `TB_SEC_OBJ` 스키마 | `OBJ_NO` 컬럼 제거, `OBJ_ID` 값 일괄 변경 |
| FK 참조 테이블 | `TB_SEC_PERM.OBJ_ID`, `TB_SEC_MENU.OBJ_ID`, `TB_SEC_FAVORITE_MENU.OBJ_ID` 등 일괄 UPDATE |
| `SecObj.java` 엔티티 | `objNo` 필드 제거 |
| `SecObjRepository`, `SecObjService` | objNo 관련 메서드 제거 |
| `DataInitializer.java` | seed 데이터 새 OBJ_ID 로 재작성, `OBJ_NO` 컬럼 제거 |
| FE `object-management/` UI | `objNo` 컬럼 제거, 헤더 "객체 ID" → "OBJECT ID" |
| FE `module-pages.ts` | `objNo` 참조 제거, `objId` 만 사용 |
| FE `permission-management/` | `getApiPatternsForPage(sysCd, objNo)` → `getApiPatternsForPage(sysCd, objId)` |
| FE `portal-shell` | pageName 으로 `objNo` 쓰던 곳을 `objId` 로 |
| OASIS 데이터 시드 (`V900__seed_obj_default_actions_oasis.sql`) | OBJ_ID 키 재작성 |

### 13.5 마이그레이션 스크립트 (V12)

**제약:** SQLite 라 컬럼 drop 는 ALTER TABLE 직접 안 됨. 테이블 재작성 필요.

```sql
-- V12__rename_objId_to_kebab_drop_objNo.sql

-- 1) OBJ_ID 매핑 테이블 (CTE)
CREATE TEMP TABLE _objid_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

INSERT INTO _objid_map(old_id, new_id) VALUES
  ('OBJ_HOME', 'home'),
  ('OBJ_DASHBOARD', 'dashboard-overview'),
  -- ... 약 60건
  ('OBJ_SCH_EXCEPTIONS', 'scheduling-exceptions'),
  ('OBJ_PLN_EXCEPTIONS', 'planning-exceptions');
  -- (충돌 그룹은 하이픈 prefix 부여 — §13.3 옵션 B)

-- 2) FK 참조 테이블들 먼저 UPDATE (FK constraint 우회)
UPDATE TB_SEC_PERM
SET OBJ_ID = (SELECT new_id FROM _objid_map WHERE old_id = TB_SEC_PERM.OBJ_ID)
WHERE OBJ_ID IN (SELECT old_id FROM _objid_map);

UPDATE TB_SEC_MENU
SET OBJ_ID = (SELECT new_id FROM _objid_map WHERE old_id = TB_SEC_MENU.OBJ_ID)
WHERE OBJ_ID IN (SELECT old_id FROM _objid_map);

UPDATE TB_SEC_FAVORITE_MENU
SET OBJ_ID = (SELECT new_id FROM _objid_map WHERE old_id = TB_SEC_FAVORITE_MENU.OBJ_ID)
WHERE OBJ_ID IN (SELECT old_id FROM _objid_map);
-- (다른 FK 참조 테이블 발견되면 추가)

-- 3) TB_SEC_OBJ 본체 — PK UPDATE + OBJ_NO 컬럼 제거
-- SQLite 컬럼 drop = 새 테이블 만들고 데이터 복사 후 swap
CREATE TABLE TB_SEC_OBJ_NEW (
  OBJ_ID VARCHAR(100) PRIMARY KEY,
  OBJ_NM VARCHAR(200),
  OBJ_TYPE VARCHAR(30),
  SYS_CD VARCHAR(30),
  SUB_SYS_CD VARCHAR(30),
  USE_YN VARCHAR(1),
  DESCRIPTION VARCHAR(100),
  DEFAULT_ACTIONS_JSON TEXT,
  ENDPOINT_PREFIX TEXT,
  CREATED_AT TIMESTAMP, CREATED_BY VARCHAR(50),
  UPDATED_AT TIMESTAMP, UPDATED_BY VARCHAR(50)
);

INSERT INTO TB_SEC_OBJ_NEW
SELECT
  COALESCE((SELECT new_id FROM _objid_map WHERE old_id = o.OBJ_ID), o.OBJ_ID) AS OBJ_ID,
  o.OBJ_NM, o.OBJ_TYPE, o.SYS_CD, o.SUB_SYS_CD, o.USE_YN, o.DESCRIPTION,
  o.DEFAULT_ACTIONS_JSON, o.ENDPOINT_PREFIX,
  o.CREATED_AT, o.CREATED_BY, o.UPDATED_AT, o.UPDATED_BY
FROM TB_SEC_OBJ o;

DROP TABLE TB_SEC_OBJ;
ALTER TABLE TB_SEC_OBJ_NEW RENAME TO TB_SEC_OBJ;

-- 4) PERM_ID 도 OBJ 일부를 segment 로 쓰는 형식 (perm_<module>_<screen>_<level>) 이라
--    screen segment 가 OBJ_ID 변경에 따라 영향. 단, screen segment 는 이미 OBJ_NO (kebab) 라
--    실질 변경 없을 가능성 높음 — 점검 후 필요 시 V12-1 추가.
```

### 13.6 PERM_ID 형식

OBJ_ID 가 단일 segment 라 PERM_ID 형식 변경 불필요:
- AS-IS PERM_ID: `perm_mpn_OBJ_PLANT_user`
- TO-BE PERM_ID: `perm_mpn_plant_user`, `perm_mpn_scheduling-exceptions_user`

기존 `buildPermId(module, screen, level)` / `parsePermId()` 로직 (`permission-actions.ts`) 그대로 동작. 단 V12 마이그레이션이 PERM_ID 의 OBJ_ID segment 도 함께 rename 해야 함 (FK cascade 와 별도로 PERM_ID 자체가 OBJ_ID 를 포함하므로):

```sql
-- PERM_ID 의 OBJ_ID segment 도 rename
UPDATE TB_SEC_PERM
SET PERM_ID = REPLACE(PERM_ID, '_' || old_id || '_', '_' || new_id || '_')
FROM _objid_map
WHERE PERM_ID LIKE '%_' || old_id || '_%';

-- TB_SEC_ROLE_PERM, TB_SEC_PERM_BUTTON 의 PERM_ID FK 도 동일 UPDATE
UPDATE TB_SEC_ROLE_PERM
SET PERM_ID = REPLACE(PERM_ID, '_' || old_id || '_', '_' || new_id || '_')
FROM _objid_map
WHERE PERM_ID LIKE '%_' || old_id || '_%';

UPDATE TB_SEC_PERM_BUTTON
SET PERM_ID = REPLACE(PERM_ID, '_' || old_id || '_', '_' || new_id || '_')
FROM _objid_map
WHERE PERM_ID LIKE '%_' || old_id || '_%';
```

### 13.7 적용 순서 — 의존성

```
[Phase A] OBJ_ID 단일화  ← 본 §13
   ↓ (선행)
[Phase B] 권한관리 UI 의 OBJECT ID 컬럼 단일화 + endpoint 칸 제거  ← 본 §7
   ↓
[Phase C] 새 컨트롤러 컨벤션 + RBAC 필터  ← 본 §3 ~ §6
   ↓
[Phase D] 기존 컨트롤러 일괄 마이그레이션
```

A 만 먼저 하면 RBAC 동작은 그대로 (path-only 매칭 유지) 이지만 데이터 모델은 정리되어 다음 단계가 깔끔. C 는 A 가 끝난 OBJ_ID 를 URL segment 로 사용.

### 13.8 작업 체크리스트

- [x] OBJ_ID 매핑 표 확정 (충돌: `scheduling-exceptions` / `planning-exceptions` — 옵션 B)
- [ ] V12 마이그레이션 스크립트 작성 + 테스트 DB 에서 검증 (TB_SEC_OBJ + FK + PERM_ID rename 포함)
- [ ] `SecObj.java` 에서 `objNo` 필드 제거
- [ ] `SecObjRepository`, `SecObjService` 의 objNo 관련 메서드 제거
- [ ] `DataInitializer.java` 의 seed 재작성 (insertObj 시그니처 단순화)
- [ ] V900 OASIS 시드 OBJ_ID 갱신
- [ ] FE `object-management/` UI: objNo 컬럼 제거, "객체 ID" 헤더 → "OBJECT ID"
- [ ] FE `module-pages.ts`: `objNo` 참조를 `objId` 로 일괄 치환 (충돌 그룹은 슬래시 OBJ_ID 로)
- [ ] FE `permission-management/`: `getApiPatternsForPage(sysCd, objNo)` 호출부 수정
- [ ] FE `portal-shell` (use-portal-menu, use-portal-favorites): pageName 으로 `objNo` 쓰던 곳을 `objId` 로
- [ ] 권한관리 화면 동작 검증 — 기존 등록된 perm 들이 새 OBJ_ID 로 자동 따라가는지
- [ ] 메뉴 라우팅 검증 — 기존 메뉴가 새 OBJ_ID 로 정상 페이지 매칭되는지
