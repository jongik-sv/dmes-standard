# BFF RBAC 상세 설계 · 구현계획 (MVP 2패턴)

> **2026-10-03 부터 `x-internal-bff-call`·`X-Authenticated-*` 헤더 신뢰는 없어졌다(fix/bff-auth-header)** — BFF 는 들어온 요청의 이 헤더로 검사를 건너뛰거나 사용자를 정하지 않는다. 현행은 [Portal-Development-Guide §1-3](../guide/FrontEnd/Portal-Development-Guide.md#1-3-서버-코드의-oasis-호출내부-호출).

> ⚠ **설계 이력 (구현 완료)**: 구현이 완료된 BFF-RBAC 설계·계획 문서다. 현행 정본은 [docs/guide/Security/](../guide/Security/README.md)(Security-Guide·RBAC-PATH-CONVENTION). 본 문서는 설계 배경 참고용.

> 작성: 2026-06-10
> 대상: `m-mcm`(BFF) · `mcm-core`/`mcm`(BE) · `shared`(auth)
> 상위 정책 문서: [BFF-RBAC-토큰기반-권한검증-설계.md](./BFF-RBAC-토큰기반-권한검증-설계.md) (v2)
> 본 문서 = **구현 레벨 상세 설계 + Phase별 실행계획**

---

## 0. 범위 한 줄 요약

권한 단위 = **`module/objId/action`** (소문자 3-part). 로그인 시 DB에서 사용자 허용 집합을 펼쳐 **NextAuth 토큰(`perms`)** 에 적재. BFF `proxy.ts`가 **OASIS 4-seg / 컨벤션 3-seg** 두 패턴만 URL에서 키로 환산해 `token.perms`와 대조. 그 외(aps/mpn/kmc rest 등)는 토글로 "지금 통과 / 추후 차단".

---

## 1. 데이터 계약 (Data Contracts)

### 1.1 권한키 문자열 포맷 (BFF·BE 공통 SoT)

```
"{module}/{objId}/{action}"   // 전부 소문자, slash 3-part
예) "mcm/tcerrorlist/search", "mpn/plant/save"
SYSADMIN 센티넬: perms = ["*"]   // 열거하지 않음
```

- **중요**: OASIS URL의 가운데 `oasis` 세그먼트와 BE `PermKey`의 `serviceId("oasis")`는 **키에 포함하지 않는다.** OASIS(pattern1)와 컨벤션(pattern2)이 **동일 3-part 키 공간**으로 합쳐지게 하기 위함.
  - `/api/mcm/oasis/secUser/search` → `mcm/secuser/search`
  - `/api/mpn/plant/search`         → `mpn/plant/search`
  - BE `UserPermCache`가 만드는 `PermKey(module,"oasis",objId,action)` → 직렬화 시 `module/objId/action` (serviceId 드롭).

### 1.2 토큰(NextAuth JWT) 스키마 — 추가분

| 클레임 | 타입 | 의미 |
|---|---|---|
| `sub` | string | userId (기존) |
| `role` / `roles` | string / string[] | 역할 (기존) |
| `backendAccessToken` / `backendRefreshToken` | string | BE JWT (기존) |
| **`perms`** | **string[]** | **허용 권한키 배열. SYSADMIN = `["*"]`** (신규) |

- 크기 가드: §5 측정 결과 단일 쿠키(~4KB) 초과 우려 시 **compact 인코딩**(`"module/objId:act1,act2"`) 또는 **방식 C(BFF 서버캐시)** 로 전환.
- ✅ **방식 C 전환 완료 (2026-06-11)**: 토큰에 perms 미적재(쿠키 슬림). BFF `lib/auth/api-permission-cache.ts` 가 userId→권한키를 서버 메모리 캐시, 미스 시 BE `GET /api/sec/perm-keys`(신뢰채널) lazy load. `proxy.ts`→`evaluateApiPolicy(...,loadPerms)` 로 RBAC 단계에서만 로드. perms 없는 쿠키로 RBAC 동작 라이브 검증(granted→pass / 미보유→403 / SYSADMIN→pass). 신규 BE `SecPermKeysController`. (300+ perm 사용자 쿠키 오버플로우 해소)
- 🔧 **신선도/안정성 보강 (2026-06-12, 검증 후)**: ① 미들웨어(Edge)와 라우트핸들러(Node)는 **별도 런타임/모듈 인스턴스**라 라우트에서의 `invalidateRole/All` 호출이 게이팅 캐시에 도달하지 못함 → **즉시 무효화 불가**. 그래서 **게이팅 캐시 TTL=60초** + **BE 백스톱**(UI 권한변경 시 `RoleChangedEvent` 로 BE 즉시 차단=revocation 즉시, grant 는 ≤60초 반영) 으로 신선도 보장. invalidate 훅은 호환 위해 유지하나 게이팅엔 무효(주석 명시). ② perm-keys fetch **타임아웃(4초) + 만료캐시 graceful 폴백** 추가(BE 지연 시 미들웨어 무한대기 방지, fail-closed 유지).

### 1.3 BE 응답 계약

- **권장**: `POST /api/auth/login` 응답 `data`에 `permKeys: string[]` 추가 (로그인 1회로 끝, 미들웨어 재귀 없음).
- **(옵션) 갱신용**: OASIS `secUser/myEndpointKeys` (AUTH_ONLY) — 방식 C/재로그인 없는 refresh 용. 반환 동일 `permKeys`.
- SYSADMIN → `["*"]`.

---

## 2. 토큰 ↔ DB ↔ URL 매핑표 (대조의 핵심)

| 권한키 part | 토큰(검증시) | DB 출처(로그인시 빌드) | URL 세그먼트(검증시) |
|---|---|---|---|
| `module` | `token.perms` 항목의 1번째 | `TB_MCM_SEC_OBJ.SYSTEM_CODE` | `/api/{module}/...` |
| `objId` | 2번째 | `TB_MCM_SEC_OBJ.OBJECT_ID` | OASIS=`serviceId` / 컨벤션=2번째 |
| `action` | 3번째 | `TB_MCM_SEC_PERM`.(COMMON+CUSTOM+POPUP_BTN+ACTION) CSV 토큰 | 마지막 세그먼트 |
| (조인키) | `token.sub` | `TB_MCM_SEC_USER_MAPPING.USER_ID` | — |

**빌드 체인 (로그인 시, 입력=`token.sub`)**
```
USER_ID → SEC_USER_MAPPING → ROLE_GROUP_ID
        → SEC_ROLEGROUP_MAPPING → ROLE_ID
        → SEC_ROLE_MAPPING → (OBJECT_ID, PERMISSION_ID)
        → SEC_OBJ(SYSTEM_CODE, OBJECT_ID) + SEC_PERM(action CSV)
        ⇒ Set<"module/objId/action">
```

**대조 (검증 시): `parseRbacKey(URL)` 결과 ∈ `token.perms` ?** — DB 직접 조회 없음(로그인 때 구워둔 token.perms와 비교).

---

## 3. BFF 알고리즘 상세 (`proxy.ts`)

### 3.1 평가 순서 (절대 순서 보존)

```
0) self-fetch (X-Internal-Bff-Call=1)          → next()
1) PUBLIC (/api/auth/, /api/{m}/auth/)          → next()
2) 세션: token.sub 없음                          → 401
3) AUTH_ONLY 프리픽스 매칭                        → next()
4) LoV (/api/{m}/lov/…  master|query|service)   → next()
5) SYSADMIN (perms=="*" or roles∋SYSADMIN)       → next()
6) key = parseRbacKey(path)
     key != null → token.perms.includes(key) ? next() : 403
7) (미매칭) UNMATCHED_DENY ? 403 : next()
```

### 3.2 `parseRbacKey` (의사코드, 엣지 포함)

```ts
const RESERVED = new Set(["oasis","rest","query","service","lov","auth","internal"]);

function parseRbacKey(rawPath: string): string | null {
  const path = rawPath.split("?")[0];                       // 쿼리스트링 제거
  if (!path.startsWith("/api/")) return null;
  const seg = path.slice(5).split("/").filter(Boolean).map(decodeURIComponent);

  if (seg.length === 4 && seg[1] === "oasis")               // 패턴1 OASIS
    return norm(seg[0], seg[2], seg[3]);

  if (seg.length === 3 && !RESERVED.has(seg[1]))            // 패턴2 컨벤션
    return norm(seg[0], seg[1], seg[2]);

  return null;                                              // 그 외 = 미매칭
}
const norm = (m,o,a) => `${m}/${o}/${a}`.toLowerCase();
```

### 3.3 토글

```ts
const UNMATCHED_DENY = process.env.RBAC_DEFAULT_DENY === "true";  // 기본 false
```

### 3.4 응답 포맷 (현행 유지)

```jsonc
401: { "success": false, "error": { "code": "UNAUTHORIZED", "message": "인증이 필요합니다." } }
403: { "success": false, "error": { "code": "FORBIDDEN",    "message": "접근 권한이 없습니다." } }
```

`SET`로 멤버십을 O(1) 처리: 미들웨어 진입 시 `new Set(token.perms)` 1회 생성.

---

## 4. 시퀀스

### 4.1 로그인 (토큰 빌드)
```
브라우저 → NextAuth authorize → BE POST /api/auth/login
  BE: 인증 + UserPermCache.build(userId).toKeyStrings()  → data.permKeys
  ← { accessToken, ..., permKeys:[...] }
authorize 반환 → jwt 콜백: token.perms = permKeys
  ⇒ 세션 쿠키에 perms 적재
```

### 4.2 요청 검증
```
브라우저 → /api/mcm/oasis/tcErrorList/search (쿠키)
proxy.ts: getToken() → {sub, roles, perms}
  순서평가 → key="mcm/tcerrorlist/search"
  perms.has(key) ? next() : 403
route.ts → oasis-proxy → (X-Client-Key + X-Authenticated-*) → BE
BE: ClientKeyFilter(신원세팅) → EndpointPermissionFilter(2차 대조, 백스톱) → 비즈니스
```

---

## 5. 위험 / 사전검증 (= Phase 0 게이트)

### 5.1 P0 검증 결과 (2026-06-10 · MSSQL `ksm_dmes` / MCMAPUSER 실측)

> **핵심: make-or-break R1 통과 → 매칭 메커니즘/스키마는 이미 올바름. 데이터 대공사 불필요.**
> DB 현황: USER 3명(admin/test/test2) **전원 ROLE_GROUP_SYSADMIN**, ROLE 2(SYSADMIN/TEST), PERM 2(PERM_ALL/PERM_USER), SEC_OBJ 72(mcm 20 + mpn 52), ROLE_MAPPING 21. = **PoC 수준, 비-SYSADMIN grant 사실상 없음(TEST→commMenuMng 1건)**.

| # | 항목 | 상태 | 실측 / 비고 |
|---|---|---|---|
| R1 🔴 | `SEC_OBJ.OBJECT_ID` == OASIS serviceId | ✅ **통과** | mcm 20객체가 FE serviceId와 정확히 일치(tcErrorList, masterRuleList, commUserMng, messageSender …) |
| R2 🟠 | `SEC_OBJ.SYSTEM_CODE` == URL module | ✅ **통과** | `mcm`/`mpn` 소문자 = module |
| R3 🟠 | `SEC_PERM` action 토큰 == URL action | ⚠️ **불완전(현재 무의미)** | PERM_ALL이 comm* 위주 → `send/resend/searchDetail/formatList/interfaceLov/tcLov` 등 누락. 전원 SYSADMIN(`["*"]`)이라 지금은 영향 0. 비-SYSADMIN 도입 시 어휘 정리 필요 |
| R4 🟠 | `token.sub` == `USER_MAPPING.USER_ID` | ✅ 사실상 확인 | userId=admin/test/test2 직접 사용 |
| R5 🟠 | 사용자별 perm 수(토큰 크기) | ✅ **문제없음** | 최대 20객체, SYSADMIN=`["*"]` 1개 → 방식 T 충분 |
| R6 🟡 | 예약어/순서 회귀 | ⬜ 구현 시 테스트 | mpn/query 오검사 방지 |
| R7 🟡 | staleness | ⬜ 정책 | 권한변경 미반영 → BE 백스톱 보완 |
| **R8** 🟠 | **OASIS serviceId 중 SEC_OBJ 미등록** | ⚠️ **2건** | `secObj`(ObjectPickerModal), `tcErrorResendPop`(에러재전송) → 객체 추가 또는 AUTH_ONLY 처리 필요. (`secUser`/`secFavorite`는 AUTH_ONLY 면제) |

**판정**: 코드는 지금 안전하게 투입 가능(전원 SYSADMIN 바이패스 → 기존 기능 무영향). 남은 실작업 = **비-SYSADMIN 역할 + action grant 어휘 구축(R3)** + **객체 2건 추가(R8)** — 구조 변경이 아닌 데이터 보강.

```sql
-- (참고) R5: 사용자별 (OBJECT,PERMISSION) 매핑 수 — 실측 결과 전원 SYSADMIN이라 토큰은 ["*"] 1개
SELECT um.USER_ID, COUNT(*) AS mapping_rows
FROM TB_MCM_SEC_USER_MAPPING um
JOIN TB_MCM_SEC_ROLEGROUP_MAPPING rg ON rg.ROLE_GROUP_ID = um.ROLE_GROUP_ID
JOIN TB_MCM_SEC_ROLE_MAPPING rm      ON rm.ROLE_ID       = rg.ROLE_ID
GROUP BY um.USER_ID ORDER BY mapping_rows DESC;
```

---

## 6. 테스트 매트릭스

| ID | 입력 | 사용자 | 기대 |
|---|---|---|---|
| T1 | `/api/mcm/oasis/tcErrorList/search` | perms∋키 | 200 통과 |
| T2 | `/api/mcm/oasis/tcErrorList/save` | perms∌키 | 403 |
| T3 | `/api/mcm/oasis/secUser/myMenusTree` | 일반 | 통과(AUTH_ONLY) |
| T4 | `/api/mcm/lov/service/foo` | 일반 | 통과(LoV) |
| T5 | `/api/mpn/rest/api/items` | 일반 | 통과(미매칭, DENY=false) |
| T6 | `/api/mpn/query/qX` | 일반 | 통과(예약어→미매칭) ※오검사 금지 |
| T7 | `/api/mcm/rest/kmc/topics` | 일반 | 통과(미매칭) |
| T8 | 임의 RBAC 경로 | SYSADMIN | 통과(와일드카드) |
| T9 | 임의 RBAC 경로 | 미로그인 | 401 |
| T10 | `/api/mpn/plant/search` | perms∋`mpn/plant/search` | 통과(패턴2) |
| T11 | 동일 T5/T7 | 일반 | **DENY=true 시 403** (flip 회귀) |

---

## 7. 구현계획 (Phase별)

### Phase 0: 사전 검증 (게이트) — ✅ 완료 (2026-06-10, §5.1)
- [x] 0-1. `SEC_OBJ.OBJECT_ID` ↔ OASIS serviceId 전수 대조 (R1) → **통과**
- [x] 0-2. `SEC_OBJ.SYSTEM_CODE` ↔ URL module 확인 (R2) → **통과**
- [x] 0-3. `SEC_PERM` action 토큰 ↔ URL action 표본 대조 (R3) → 불완전(현재 무의미, 후속 0-7)
- [x] 0-4. `token.sub` ↔ `SEC_USER_MAPPING.USER_ID` 동일성 확인 (R4) → 사실상 확인
- [x] 0-5. R5 측정 → 전원 SYSADMIN, 토큰 `["*"]` → **방식 T 확정**

### Phase 0.5: 데이터 보강 — ✅ 완료 (2026-06-10, `docs/mcm/seed_rbac_augment.sql`)
- [x] 0-6. SEC_OBJ 객체 2건 추가 (`secObj`, `tcErrorResendPop`) + SYSADMIN grant
- [x] 0-7. PERM_ALL action 어휘 완성 (`searchDetail,saveDetail,formatList,send,interfaceLov,tcLov,resend` 추가)
- [x] 0-8. 검증용 비-SYSADMIN 픽스처: `PERM_VIEW`(조회전용) + `MCM_VIEWER` 역할 + `ROLE_GROUP_MCM_VIEWER` + 6화면 조회 grant + 계정 `test3`(test 클론=동일 비번)→viewer 그룹

> **검증 픽스처(test3 / MCM_VIEWER)**: 조회 가능 6화면 = tcErrorList·masterRuleList·masterCodeMngList·interfaceList·interfaceFormatList·messageSender (action: search/searchDetail/formatList/lov).
> 기대 동작 — `tcErrorList/search` ✅ / `messageSender/send` ❌403 / `commUserMng/*` ❌403 (미grant).
> seed는 멱등·additive (admin/test/test2 무수정). 롤백 SQL 파일 하단 주석.

### Phase 1: BE — 권한키 직렬화 + 노출 — ✅ 완료 (2026-06-10)
- [x] 1-1. `UserPermCache.toKeyStrings(userId)` 추가 (`module/objId/action` 소문자, serviceId 드롭, SYSADMIN→`["*"]` via 데이터기반 `isSysadmin`)
- [x] 1-2. `McmAuthController.login` 응답에 `permKeys` 추가 (기존 주입된 `UserPermCache` 재사용 — 별도 DTO/2차호출 불필요). FE 가 `data.permKeys` 로 수신
- [~] 1-3. OASIS `secUser/myEndpointKeys` — **불필요로 판단·생략** (로그인 응답 permKeys 로 방식 T 충족). 방식 C/refresh 도입 시 추가
- [x] 1-4. `UserPermCacheTest` 작성 (SYSADMIN→`["*"]` / 일반 정렬·소문자 / 미매핑→빈 List)

> 검증: `:mcm-core:compileJava`, `:mcm:lib:compileJava` **BUILD SUCCESSFUL** (JDK21). `:mcm-core:test` (UserPermCacheTest 3 + InterfaceFormatListServiceTest 4) **전부 통과**.
> 부수 수정(테스트 실행 위해): ① 이식 후 깨져있던 `InterfaceFormatListServiceTest` 를 `searchVersions` 호출 대상 `repository`→`formatVersionsDao`(MyBatis DAO) 로 정정 ② concrete DAO mock 위해 `mcm-core/build.gradle` 에 `testImplementation mybatis-spring-boot-starter:3.0.4` 추가(main 은 compileOnly).
> refresh 토큰 갱신 시 permKeys 재적재는 후속(현재 BE EndpointPermissionFilter 백스톱이 신선도 보완).

### Phase 2: FE 토큰 — perms 주입 — ✅ 완료 (2026-06-10)
- [x] 2-1. `shared/src/auth/server.ts` `authenticateViaBackend` — BE 응답 `data.permKeys` 추출(반환 타입+객체에 `permKeys: string[]`)
- [x] 2-2. `jwt` 콜백 — `token.perms = user.permKeys` 저장 (roles 블록 옆, `"permKeys" in user` 가드)
- [x] 2-3. `m-mcm/types/next-auth-session.d.ts` JWT 에 `perms?: string[]` 추가
- [~] 2-4. compact 인코딩 — **불필요로 판단·생략** (P0: 전원 SYSADMIN → `["*"]` 1개, 쿠키 여유)

> 검증: `shared` 빌드 **EXIT=0**(tsup ESM+DTS 정상 — 타입에러 시 dts 실패). `dist/auth-server.js` 에 permKeys/perms 로직 반영. m-mcm 은 dist 참조이므로 재빌드 반영됨. (JWT `perms` 추가는 additive — proxy.ts 미사용 단계라 m-mcm 영향 없음. 런타임 e2e 는 Phase 3 후 검증.)

### Phase 3: BFF 검증 — `proxy.ts` 전환 — ✅ 완료 (2026-06-10)
- [x] 3-1. `parseRbacKey` 구현 — 순수 모듈 `shared/src/auth/rbac-policy.ts` 로 분리(테스트 가능). 쿼리스트링·예약어·소문자·decodeURIComponent 처리
- [x] 3-2. §3.1 평가순서 — `evaluateApiPolicy()` (PUBLIC→401→AUTH_ONLY→LoV→SYSADMIN→RBAC→미매칭). 신규 export `@dk-oasis/shared/auth-rbac-policy`
- [x] 3-3. `unmatchedDeny`(env `RBAC_DEFAULT_DENY`, 기본 false) — 정책 config 로 주입
- [x] 3-4. 유물 `api-permission-cache.ts` → no-op shim(invalidateRole/All 만 유지, oasis/internal route 무수정). `proxy.ts` 의 cache import 제거
- [x] 3-5. 401/403 JSON 포맷 유지(`evaluateApiPolicy` verdict→응답 매핑)

> **Next.js 16.1.6**: 미들웨어 파일명이 `middleware.ts`→`proxy.ts`(`export function proxy`+`config`)로 변경 — 본 파일이 정상 미들웨어 진입점. m-mcm proxy.ts 는 plumbing(getToken/응답매핑)만, 판정은 shared 정책모듈 위임.
> 검증: shared build OK, m-mcm `tsc --noEmit` **EXIT=0**.

### Phase 4: BE 백스톱 정합 — 🔴 OASIS 미작동 발견 (2026-06-10 실증)
- [x] 4-1. `EndpointPermissionFilter`(mcm) 등록 확인 — **단, OASIS 미enforce**(아래).
- [x] 4-2. `PermKey.parseUrl` ↔ 실제 BFF→BE 경로 정합 검증 → **불일치**: parseUrl 은 `/api/` 필요, BFF→BE 는 `/oasis/{serviceId}/{action}`(context-path `/`, `/api/` 없음) → parseUrl=null → 필터 통과.
- [ ] 4-3. `RoleChangedEvent` — OASIS 미enforce 라 BE 캐시 신선도가 OASIS 보안에 무의미(Phase 6 복구 전까지).

> **실측 프로브(test3=MCM_VIEWER, BE 기동):** `POST /oasis/commUserMng/search`(미grant) → **200**(차단 안 됨). `POST /api/mcm/oasis/commUserMng/search`(미grant,`/api/`형) → **403**(필터 로직 정상). → **OASIS RBAC 의 유일 게이트는 BFF(Phase 3)**. BE 백스톱 없음 → `X-Client-Key` 보유 직격 시 무방비, staleness 보완 불가(§staleness 정정). **BE 포트는 내부망 BFF 전용 필수.** 복구는 Phase 6-4.

### Phase 5: 테스트/검증 — ✅ 대부분 완료 (2026-06-10)
- [x] 5-1. 단위테스트 `shared/tests/unit/rbac-policy.unit.test.ts` — T1~T11 + parseRbacKey 엣지 + isSysadmin = **20 passed** (shared 전체 41 passed, 회귀無). BE `UserPermCacheTest` 3 passed.
- [x] 5-2. 비-SYSADMIN E2E — m-mcm dev(:5000) 기동 후 minted 세션쿠키(test3=MCM_VIEWER, salt="") 로 라이브 검증: `tcErrorList/save`→**403**, `commUserMng/search`→**403**, `tcErrorList/search`→pass(500=BE미기동). SYSADMIN(admin)→전부 pass. ※실제 비번 로그인은 비번 미상으로 minted 토큰 대체(perms 내용은 Phase1/2 산출과 동일).
- [x] 5-3. AUTH_ONLY(myMenusTree)/LoV/미매칭(mpn rest·kmc) 통과 회귀 — 라이브 C5/C6 pass(not-403).
- [x] 5-4. 예약어 오검사 금지 — 라이브 C7 `mpn/query/qX`→미매칭 통과(403 아님) 확인.
- [x] 5-5. 권한변경→재로그인 반영 — ✅ **실증**(BE 기동, test3 BCrypt 비번 설정): 로그인 permKeys=24(6객체×4action). MCM_VIEWER 에 masterCategoryMng grant 추가→재로그인 **28**, 제거→재로그인 **24**(mastercategorymng 사라짐). `McmAuthController.login`→`loadAndCache` 매 로그인 rebuild 로 **재로그인이 권한변경 양방향 반영** 확인. ※BE 백스톱 신선도는 Phase 4 발견(OASIS 미enforce)으로 N/A → Phase 6-4 로 이관.

### Phase 6: (추후·MVP 밖) 하드닝 + 전면차단 전환
- [ ] 6-1. aps/mpn/kmc → 2패턴 마이그레이션 또는 명시 allowlist 등록
- [ ] 6-2. T11 회귀 후 `RBAC_DEFAULT_DENY=true` flip (게이팅 충족 확인)
- [ ] 6-3. (옵션) aps/mpn BE 공통 권한필터 추가 (완전 defense-in-depth)
- [x] **6-4. ✅ BE OASIS 백스톱 복구 — 완료·실증 (2026-06-10)**
  - `PermKey.parseBackendOasisUrl(uri, defaultModule)` 신설: `/oasis/{serviceId}/{action}`(dev) + `/{module}/oasis/{serviceId}/{action}`(prod Nginx) → `PermKey(module,"oasis",objId,action)`. module 없으면 `cactus.oasis.service-group`(=mcm).
  - `EndpointPermissionFilter`: parseUrl null 시 parseBackendOasisUrl 시도 + **AUTH_ONLY 면제(secUser/myMenus·myPermissions·myButtonEndpoints, secFavorite/search·toggle)** 복제 — 미면제 시 비-SYSADMIN 메뉴/버튼 로딩 403 으로 깨짐.
  - 단위: `PermKeyTest` 7케이스 + UserPermCacheTest 통과. BE 기동 라이브: `/oasis/commUserMng/search`(미grant)→**403**(이전 200), `/oasis/tcErrorList/save`→403, granted→200, AUTH_ONLY 3종→200(면제), SYSADMIN→200.
  - 결과: **OASIS 도 BFF + BE 2중 게이트(defense-in-depth) 복원.** staleness 도 BE(TTL 10분+RoleChangedEvent)가 보완.

---

## 8. 롤아웃 / 롤백

- **롤아웃**: Phase 0 통과 → 1·2 배포(토큰에 perms 실림, 미사용) → 3 배포(검사 on). `UNMATCHED_DENY=false`라 기존 트래픽 영향 없음.
- **롤백**: `proxy.ts`에서 RBAC 단계만 통과로 단락(또는 env 플래그)하면 즉시 무력화. 토큰 perms는 무해하게 잔존.
- **관찰성**: 403/denied 로그(userId, uri, key) 수집 → 데이터 정합(R1) 미스 조기 발견.

---

## 9. 변경 대상 파일

| 파일 | 변경 | Phase |
|---|---|---|
| `src/backend/mcm-core/.../security/endpoint/UserPermCache.java` | `toKeyStrings()` | 1-1 |
| `src/backend/mcm/.../auth/*` (AuthService/Controller/DTO) | 로그인 응답 `permKeys` | 1-2 |
| `src/backend/mcm-core/.../security/service/SecUserService.java` | (옵션) `myEndpointKeys` | 1-3 |
| `src/frontend/shared/src/auth/server.ts` | `permKeys` 추출 + `token.perms` | 2-1·2-2 |
| `src/frontend/m-mcm/types/next-auth-session.d.ts` | `perms` 타입 | 2-3 |
| `src/frontend/m-mcm/proxy.ts` | `parseRbacKey`+순서+토글 | 3-1~3-3·3-5 |
| `src/frontend/m-mcm/lib/auth/api-permission-cache.ts` | 제거 | 3-4 |

---

## 10. 참조
- 정책/배경: `BFF-RBAC-토큰기반-권한검증-설계.md`
- `docs/guide/Security/RBAC-PATH-CONVENTION.md`
- 코드 SoT: `PermKey.java`, `UserPermCache.java`, `EndpointPermissionFilter.java`, `ClientKeyFilter.java`, `proxy.ts`, `server.ts`, `oasis-proxy/index.ts`
