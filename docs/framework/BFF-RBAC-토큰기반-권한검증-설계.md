# BFF RBAC 권한 검증 설계 (v2 — MVP 2패턴 스코프)

> ⚠ **설계 이력 (구현 완료)**: 구현이 완료된 BFF-RBAC 설계·계획 문서다. 현행 정본은 [docs/guide/Security/](../guide/Security/README.md)(Security-Guide·RBAC-PATH-CONVENTION). 본 문서는 설계 배경 참고용.

> 최초: 2026-06-09 · 개정: 2026-06-10 (v2)
> 대상: DMES 포탈(`m-mcm`) BFF · `mcm-core` 백엔드
> 상태: 설계(Draft) — 구현 전 §9 DB 정합(P0) 확인 필요

## 변경 이력
- **v2 (2026-06-10)**: 검증 범위를 **URL 자기서술 2패턴**(OASIS 4-seg / 컨벤션 3-seg)으로 한정.
  미매칭 경로는 **단일 토글(`UNMATCHED_DENY`)** 로 "지금 통과 / 추후 전면차단" 전환. LoV(master/query/service) **3종 모두 auth-only 확정**. aps/mpn rest·query·service는 **별도 Phase 마이그레이션**으로 분리.
- v1 (2026-06-09): 토큰 기반 권한검증 최초 설계.

---

## 1. 배경 / 문제

권한 검증은 **BFF(`proxy.ts`)** + **백엔드(`EndpointPermissionFilter`)** 2중 게이트지만, BFF 측 데이터 모델이 유물(orphaned)이라 **비-SYSADMIN이 BFF에서 막힌다.**

- `lib/auth/api-permission-cache.ts` 의 `loadOneRole()`은 `SYSADMIN/ROLE_SYSADMIN`만 `["/**"]`, 그 외는 `[]`(빈 배열) 반환(role→pattern BPMN 폐기, 2026-06-01).
- 결과적으로 `checkApiPermission()`이 항상 `false` → **BE 도달 전 403**. BE의 PermKey 정밀판정이 도달 못함.

### 목표
- 비-SYSADMIN도 BFF에서 1차 권한검증을 받는다.
- BFF·BE가 **동일 SoT**(BE `UserPermCache.build()`)를 공유한다.
- 새 권한 모델을 만들지 않고, **URL에서 직접 추출되는 권한키**로 검사한다(헤더/레지스트리 불필요·위조 불가).

---

## 2. 핵심 원칙 — "URL → (module, objId, action)" 한 형태로 환산, BFF 단일 검사

권한의 원자 단위 = **`(module, objId, action)`** (전 필드 소문자). 이를 **URL에서만** 추출한다.
BE `PermKey(module, serviceId, objId, action)` 및 `PermKey.parseUrl`과 의미 1:1 정합.

검증 대상은 **URL이 스스로 (module, objId, action)을 서술하는 2패턴**으로 한정한다:

| # | 패턴 | 추출 |
|---|---|---|
| 1 | `/api/{module}/oasis/{serviceId}/{action}` (4-seg, 2번째=`oasis`) | `(module, objId=serviceId, action)` |
| 2 | `/api/{module}/{serviceId}/{action}` (3-seg, 컨벤션) | `(module, objId=serviceId, action)` |

> **OASIS의 `serviceId` 세그먼트 = 권한의 `objId`** = `TB_MCM_SEC_OBJ.OBJECT_ID`.
> 이 동치가 본 설계의 make-or-break 데이터 의존(→ §9.1).

---

## 3. 정책 버킷 — "지금"과 "추후"의 차이는 마지막 한 칸

| 경로 종류 | 예 | 지금 | 추후(default-deny) |
|---|---|---|---|
| **PUBLIC** | `/api/auth/*`, `/api/{m}/auth/*` | 통과(무검사) | 통과 |
| **AUTH_ONLY** | `secUser/myMenus*`, `myButtonEndpoints`, `secFavorite/*` | 로그인만 | 로그인만 |
| **LoV** | `/api/{m}/lov/master\|query\|service/*` | 로그인만 | 로그인만 |
| **패턴1·2 (RBAC)** | `/api/mcm/oasis/secUser/search` | **검사**(미보유 403) | **검사**(미보유 403) |
| **그 외(미매칭)** | aps/mpn `rest`·`query`·`service`, `[...path]` | **통과** ⬅ | **403 차단** ⬅ |

- 바뀌는 건 **마지막 줄 하나**(미매칭 처리)뿐. 단일 토글로 전환.
- PUBLIC / AUTH_ONLY / LoV 는 "auth 이런것들" — **영구 면제**(로그인 토큰 검증만).

---

## 4. 미들웨어 결정 로직 (`proxy.ts`)

**평가 순서가 중요하다** (PUBLIC → 401 → AUTH_ONLY → LoV → SYSADMIN → RBAC → 미매칭).

```ts
// 0) self-fetch (X-Internal-Bff-Call) → 통과 (현행 유지)
// 1) PUBLIC (/api/auth/, /api/{m}/auth/) → 통과
// 2) 세션 검사: token.sub 없으면 401   ← 모든 비-PUBLIC 의 공통 관문(로그인 토큰 검증)
// 3) AUTH_ONLY 프리픽스 → 통과 (RBAC 스킵)
// 4) LoV (/api/{m}/lov/...) → 통과 (RBAC 스킵)   ※ master/query/service 3종 모두
// 5) SYSADMIN(ROLE_SYSADMIN/SYSADMIN) → 전면 통과
// 6) RBAC 2패턴:
const key = parseRbacKey(path);          // 패턴1·2만 키, 그 외 null
if (key !== null) {
  return userPerms(token).has(key) ? next() : deny403("권한 없음");
}
// 7) 미매칭(그 외) — 단일 토글
return UNMATCHED_DENY ? deny403("미등록 경로") : next();
```

### 2패턴 파서 (엣지케이스 못박음)

```ts
const RESERVED = new Set(["oasis","rest","query","service","lov","auth","internal"]);

function parseRbacKey(rawPath: string): string | null {
  const path = rawPath.split("?")[0];                 // ① 쿼리스트링 제거
  if (!path.startsWith("/api/")) return null;
  const seg = path.slice(5).split("/").filter(Boolean);

  // 패턴1: /api/{module}/oasis/{serviceId}/{action}
  if (seg.length === 4 && seg[1] === "oasis") {
    return key(seg[0], seg[2], seg[3]);
  }
  // 패턴2: /api/{module}/{serviceId}/{action}  (3-seg)
  //   ② 예약어 2번째 세그먼트(rest/query/service/lov/oasis/auth/internal)는 제외
  //      → mpn 의 /api/mpn/query/{queryId}(3-seg) 오검사 방지
  if (seg.length === 3 && !RESERVED.has(seg[1])) {
    return key(seg[0], seg[1], seg[2]);
  }
  return null;
}

// ③ 전 필드 소문자 정규화 (BE PermKey 와 정합; OASIS serviceId 가 camelCase 라도 일치)
const key = (m: string, o: string, a: string) =>
  `${m}/${o}/${a}`.toLowerCase();
```

**엣지케이스 체크리스트**
- ① **쿼리스트링** 제거 후 파싱.
- ② **예약어 블랙리스트** 필수 — 없으면 `/api/mpn/query/{queryId}`(3-seg)가 패턴2로 오검사되어 무시 대상이 403. (BE `PermKey.parseUrl`엔 이 블랙리스트가 없으므로, 동일 파서를 BE에 이식할 땐 함께 반영.)
- ③ **소문자** 양측 정규화.
- 순서상 **AUTH_ONLY/LoV 가 RBAC 파싱보다 먼저** — `myMenusTree` 등 OASIS 모양의 AUTH_ONLY 가 RBAC로 새지 않도록.
- `/api/{m}/internal/*`(예: `cache/invalidate-role`)는 `seg[1]="internal"`로 null → RBAC 무검사. 별도 내부망/시크릿으로 보호(현행).

---

## 5. auth-only 확정 목록 (로그인 토큰 검증만)

세션(`token.sub`) 검증은 하되 **RBAC는 스킵**한다. 데이터 필터링은 서비스 레이어가 사용자/역할 기준으로 처리.

- **PUBLIC** (인증조차 스킵): `/api/auth/`, `/api/{module}/auth/`
- **AUTH_ONLY**: `secUser/myMenus*`, `secUser/myPermissions`, `secUser/myButtonEndpoints`, `secFavorite/search`, `secFavorite/toggle`
- **LoV (확정 — 3종 모두 auth-only)**:
  | 경로 | 메서드 | 비고 |
  |---|---|---|
  | `/api/{m}/lov/master/*` | GET | 마스터코드 |
  | `/api/{m}/lov/query/*` | POST | mybatis 조회 |
  | `/api/{m}/lov/service/*` | POST | 서비스 실행 — **auth-only 로 확정**(콤보/필터 lookup 취지) |

  현행 `LOV_PATH_PATTERN = /^\/api\/[^/]+\/lov\//` 이 3종을 모두 커버 → **변경 없음**.
  민감/부수효과 lookup 이 생기면 그때 RBAC 경로로 분리.

---

## 6. default-deny 토글 (`UNMATCHED_DENY`)

미매칭(그 외) 경로의 처리만 바꾸는 **단일 스위치**. env `RBAC_DEFAULT_DENY` 또는 상수.

- **지금 = `false`** → 미매칭 통과. aps/mpn rest·query·service 그대로 동작(개발 지속).
- **추후 = `true`** → 미매칭 전면 403.

### flip 게이팅 (true 로 바꾸기 전 충족 조건)
1. aps/mpn 이 (a) 2패턴으로 마이그레이션됐거나 (b) 명시 allowlist 에 등록됨(→ §10).
2. mcm/mpp/mqc/mls 의 grant 데이터(§9.1) 정합 완료 — 비-SYSADMIN 정상 통과 확인.
3. 미충족 상태로 flip 시 해당 트래픽 전부 403 → **반드시 게이팅 후 전환.**

---

## 7. 권한 집합 소스 (user의 허용 `Set<"module/objId/action">`)

펼치는 로직은 BE `UserPermCache.build()`에 **이미 구현** — 재구현 금지, 결과만 받는다.

```
USER_MAPPING → ROLEGROUP_MAPPING → ROLE_MAPPING → (OBJECT_ID, PERMISSION_ID)
            → SecObj.SYSTEM_CODE(=module) + OBJECT_ID(=objId)
            → SecPerm 4컬럼 CSV 분할(=action 토큰들)
⇒ Set<PermKey(module,"oasis",objId,action)>  ⇒ "module/objId/action" 직렬화
```

저장 방식 — **MVP 스코프(OASIS 모듈만)에서는 권한 수가 화면×액션으로 bounded** 이므로 토큰 적재가 충분:

| | 방식 T: JWT 토큰 (MVP 권장) | 방식 C: BFF 서버 캐시 (확장시) |
|---|---|---|
| 위치 | NextAuth JWT | BFF 메모리 `userId→Set` |
| 적재 | 로그인 1회 | 첫 요청 lazy + TTL |
| 신선도 | 재로그인까지 stale | TTL/무효화로 갱신 |
| 크기 | 쿠키 ~4KB (MVP 범위는 여유) | 무제한 |
| 인프라 | `server.ts` jwt 콜백만 | 기존 `api-permission-cache.ts` 리워크 + `invalidate-role` 라우트 재사용 |

- **MVP**: 방식 T (토큰). SYSADMIN 은 전체 나열 대신 와일드카드 1개(또는 roles 로 판별).
- **aps/mpn 합류 시**: rest 패턴까지 더해지면 권한 수가 커질 수 있어 방식 C 로 전환 검토.

---

## 8. 토큰 주입 지점 (방식 T)

`src/frontend/shared/src/auth/server.ts` 의 `jwt` 콜백(:670)에 `token.perms` 추가.
이미 `token.roles` / `token.backendAccessToken` 가 흐르는 자리 → 자연 확장. (`/api/auth/login` 응답에 perm 집합 포함시키면 추가 왕복 0회.)
`session` 콜백은 perms 를 클라이언트로 노출하지 않음(서버 미들웨어 전용).

---

## 9. 위험 / 사전 확인 (구현 전 P0)

### 9.1 🔴 데이터 정합 — `OBJECT_ID == OASIS serviceId` (최우선)
`/api/mcm/oasis/secUser/search` 의 objId 후보 `secUser` 가 `TB_MCM_SEC_OBJ.OBJECT_ID` 와 **같아야** 매칭. kebab 화면명(`comm-user-mng`)이면 실패. 비-SYSADMIN 이 BFF에서 막혀 **실전 검증된 적 없을 수 있음** → DB 대조 필수.

### 9.2 🟠 `SYSTEM_CODE == {module}`
`TB_MCM_SEC_OBJ.SYSTEM_CODE` 가 URL `{module}`(mcm/mpp/mqc/mls)와 일치 확인.

### 9.3 🟠 action 토큰 정합
`SecPerm` 4컬럼 CSV 의 action 코드가 OASIS URL 의 `{action}`(search/save/delete/...)과 일치(소문자).

### 9.4 🟠 예약어/순서 — §4 의 ②, 평가 순서 회귀 테스트.

### 9.5 🟠 staleness — 방식 T 는 재로그인 전까지 stale. **mcm BE `EndpointPermissionFilter` 유지**가 최종 권위(TTL 10분 + `RoleChangedEvent`).

---

## 10. aps/mpn 마이그레이션 (별도 Phase — 추후)

현재: aps/mpn 의 `rest`·`query`·`service` 는 §4의 미매칭 → `UNMATCHED_DENY=false` 동안 **통과**. (BE에도 필터 없음 = 사실상 무검사 → 개발 중 수용)

추후 default-deny 전환 전 둘 중 하나:
- **(A) 2패턴 마이그레이션**: 컨트롤러를 `/api/{module}/{objId}/{action}` 컨벤션으로 이관(문서상 "🔒 보류" 작업). 이관되면 §4 패턴2로 자동 커버.
- **(B) 엔드포인트 모델 도입**: rest 는 `(module, "rest", METHOD:path-pattern)` 를 권한 단위로 grant + BFF 글롭 매칭(`matchPath` 재사용). query/service 는 id 를 권한키로.
  - 단, rest 는 objId↔리소스가 다대다라 (objId,action) 모델로는 불가 → 엔드포인트 단위가 자연스러움.

선택/granularity 는 마이그레이션 Phase 착수 시 별도 결정. **본 MVP 범위 밖.**

---

## 11. 백엔드 백스톱

BFF 단일 검사는 `X-Client-Key` 유출/BE 포트 노출 시 우회 가능. 따라서:
- **mcm**: `EndpointPermissionFilter` 유지(이미 동작, 최종 권위·신선도).
- **aps/mpn**: 마이그레이션 시 cactus-core 공통 필터로 동일 키 검사 추가(완전한 defense-in-depth). BE 포트가 내부망 BFF 전용이면 우선순위 하향 가능.

---

## 12. 구현 플랜 (Phase)

- [ ] **P0. DB 정합 확인** — §9.1 `OBJECT_ID==serviceId`, §9.2 `SYSTEM_CODE==module`, §9.3 action, 토큰 크기 측정
- [ ] **P1. 권한 집합 노출(BE)** — `UserPermCache.build()` 결과를 `"module/objId/action"` 배열로 로그인 응답(또는 `secUser/myEndpointKeys`)에 포함. SYSADMIN `["*"]`
- [ ] **P2. 토큰 주입(FE)** — `server.ts` jwt 콜백에 `token.perms` (+ `types/next-auth-session.d.ts` 타입)
- [ ] **P3. BFF 2패턴 검사 전환** — `proxy.ts` 에 §4 로직 적용(`parseRbacKey` + 멤버십 + `UNMATCHED_DENY=false`). LoV/AUTH_ONLY 현행 유지. 유물 `api-permission-cache.ts` 제거
- [ ] **P4. mcm BE 필터 유지** — `EndpointPermissionFilter` 그대로(백스톱)
- [ ] **P5. (추후) aps/mpn 마이그레이션** — §10 → 완료 후 `UNMATCHED_DENY=true` flip(§6 게이팅)

> 토큰 크기 측정 SQL:
> ```sql
> SELECT um.USER_ID, COUNT(*) AS perm_entries
> FROM TB_MCM_SEC_USER_MAPPING um
> JOIN TB_MCM_SEC_ROLEGROUP_MAPPING rg ON rg.ROLE_GROUP_ID = um.ROLE_GROUP_ID
> JOIN TB_MCM_SEC_ROLE_MAPPING rm      ON rm.ROLE_ID       = rg.ROLE_ID
> GROUP BY um.USER_ID ORDER BY perm_entries DESC;
> ```
> (action 은 PERMISSION 당 CSV 로 더 곱해짐.)

---

## 13. 변경 대상 파일

| 파일 | 변경 | Phase |
|---|---|---|
| `src/backend/mcm-core/.../security/endpoint/UserPermCache.java` | 빌드 결과 직렬화 노출 | P1 |
| `src/backend/mcm-core/.../security/service/SecUserService.java` | (옵션) `myEndpointKeys` action | P1 |
| `src/backend/mcm/.../auth/login` 응답 DTO | (옵션) perm 집합 필드 | P1 |
| `src/frontend/shared/src/auth/server.ts` | jwt 콜백 `token.perms` 주입 | P2 |
| `src/frontend/m-mcm/types/next-auth-session.d.ts` | `perms` 타입 | P2 |
| `src/frontend/m-mcm/proxy.ts` | `parseRbacKey` + 멤버십 + `UNMATCHED_DENY` | P3 |
| `src/frontend/m-mcm/lib/auth/api-permission-cache.ts` | 제거(유물) | P3 |

---

## 14. 참조
- `docs/guide/Security/RBAC-PATH-CONVENTION.md` — RBAC URL 컨벤션
- `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` — 권한 테이블 정의
- 코드: `PermKey.java`, `UserPermCache.java`, `EndpointPermissionFilter.java`, `ClientKeyFilter.java`,
  `m-mcm/proxy.ts`, `m-mcm/lib/auth/api-permission-cache.ts`, `m-mcm/lib/http/be-proxy.ts`,
  `shared/src/auth/server.ts`, `shared/src/oasis-proxy/index.ts`, `shared/src/portal-shell/use-user-button-rbac.ts`
