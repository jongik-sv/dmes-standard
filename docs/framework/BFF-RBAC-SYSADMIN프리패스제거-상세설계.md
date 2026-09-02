# BFF RBAC — SYSADMIN 프리패스 제거(순수 RBAC 전환) 상세설계

> 일시: 2026-07-30
> 상태: 구현 완료 (2026-07-30 — BE 게이트화 + 자동매핑 + BFF 프리패스 제거, 포항 E2E·브레이크글라스 스모크 통과. 커밋 대기)
> 관련 문서: [BFF-RBAC-상세설계-구현계획.md](./BFF-RBAC-상세설계-구현계획.md) ·
> [BFF-RBAC-REST-신경로규약-상세설계.md](./BFF-RBAC-REST-신경로규약-상세설계.md) ·
> 데이터 백필 이력: `D:\999_CLAUDE_OUTPUT\dmes-aps-20260728_1623-SYSADMIN_RBAC_데이터백필.md`

---

## 0. 결정 사항

| # | 결정 | 내용 |
|---|------|------|
| D1 | **삭제가 아닌 브레이크글라스 게이트화** | BE 프리패스 4지점을 코드 삭제하지 않고 프로퍼티 `mcm.security.sysadmin-freepass`(기본 **false**) 게이트로 감싼다. 평시 순수 RBAC, 장애 시 JVM 옵션 1개로 즉시 복원(재빌드 불요, WAS 재기동만) |
| D2 | **BFF 는 롤 기반 프리패스만 제거, `"*"` 와일드카드 멤버십은 존치** | `evaluateApiPolicy` 의 SYSADMIN 단계(토큰 roles 검사)는 삭제하되, 권한키 `"*"` 포함 시 통과 로직은 유지 → BE 브레이크글라스를 켜면 perm-keys 가 다시 `["*"]` 를 반환하므로 **BFF 재배포 없이 자동 추종** |
| D3 | **데이터 선행 완료가 배포 전제** | SYSADMIN → 전 SecObj `PERM_ALL` 명시 매핑. 포항 2026-07-28 완료(106/106, 무결성 감사 전항목 합격). **김포는 `D:\dmes-standard\war\sysadmin-rbac-backfill-gimpo.sql` 실행 선행 필수** |
| D4 | **신규 SecObj 등록 시 SYSADMIN 자동 매핑** | `CommObjMngService.saveCmObj` insert 분기에서 `(SYSADMIN, OBJECT_ID, PERM_ALL)` 매핑 자동 생성 + `RoleChangedEvent` 발행 — 미래 등록 누락으로 관리자가 403 되는 것 원천 차단 |
| D5 | **`McmSecurityDefaults` SYSADMIN 게이트 존치** | `secUser/save`·`secRole/save` 등 권한 마스터 변경의 `hasAuthority(ROLE_SYSADMIN)` 요구는 프리패스(허용 확대)가 아니라 **추가 제한(권한상승 방지)** — 제거 대상 아님 |
| D6 | **배포 순서 무관(양방향 호환)** | BE 먼저·BFF 먼저 어느 쪽도 안전 (§6 매트릭스) — 단 김포는 백필이 항상 최우선 |

**배경**: 현행은 SYSADMIN 이면 BFF·BE·메뉴·버튼 4계층 전부에서 데이터와 무관하게 무조건 통과한다.
권한 데이터가 실제와 달라도 관리자 화면에선 결함이 보이지 않아 데이터 드리프트를 조기 발견하지 못하고,
"권한관리 화면에서 부여한 대로 동작"이라는 RBAC 원칙에도 어긋난다. 백필로 데이터 전제가 갖춰졌으므로
SYSADMIN 도 동일한 멤버십 판정을 타게 전환한다.

---

## 1. 현행 프리패스 지점 전수 (2026-07-30 실측)

### 1-1. BFF / shared (frontend)

| # | 파일 | 위치 | 현행 동작 | 처분 |
|---|------|------|-----------|------|
| F1 | `shared/src/auth/rbac-policy.ts` | `isSysadmin()` L101-107 | roles 에 SYSADMIN/ROLE_SYSADMIN 또는 perms 에 `"*"` → true | **함수 삭제** (소비처는 L133 + 테스트뿐 — 전수 grep 확인) |
| F2 | 〃 | `evaluateApiPolicy` L133 | `if (isSysadmin(token)) return "pass"` — 멤버십 검사 전 전면 통과 | **삭제** (평가순서에서 SYSADMIN 단계 소멸) |
| F3 | 〃 | `evaluateApiPolicy` L138 | `perms.includes("*")` → 통과 | **존치** — 브레이크글라스 통로(D2). 주석에 용도 명시 |
| F4 | `shared/tests/unit/rbac-policy.unit.test.ts` | `describe("isSysadmin")` L72-81, T8 L122, T11 L132 | 프리패스 명세 | **재작성** (§4-2) |
| F5 | `m-mcm/proxy.ts` | 헤더 주석 L14-16 | "6) SYSADMIN → 전면 통과" 평가순서 기술 | 주석 현행화만 |
| F6 | `shared/src/auth/server.ts` | L495 주석 | "SYSADMIN 은 [\"*\"]" | 주석 현행화만 ("브레이크글라스 시에만") |
| F7 | `m-mcm/lib/auth/api-permission-cache.ts` | — | 자체 와일드카드 로직 **없음** (BE 응답 pass-through) | **무수정** |
| F8 | `shared/src/portal-shell/use-user-button-rbac.ts` | L93 `{objId:"*",action:"*"}` 행 감지, L178 `state.isSysadmin`, L182 `r.action === "*"` | BE 가 와일드카드 행을 줄 때만 발동 | **무수정** — BE 가 실행(row) 데이터를 주면 자연 비활성, 브레이크글라스 시 재발동(호환 유지) |

### 1-2. BE (mcm-core — mcm 채택 모듈 공통)

| # | 파일 | 위치 | 현행 동작 | 처분 |
|---|------|------|-----------|------|
| B1 | `security/endpoint/EndpointPermissionFilter.java` | L126-130 | `hasAuthority(ROLE_SYSADMIN∥SYSADMIN)` → 캐시 조회 없이 통과 | **freepass 게이트화** |
| B2 | `security/endpoint/UserPermCache.java` | `toKeyStrings` L117-118 | sysadmin 이면 `List.of("*")` 반환 (perm-keys·로그인 응답의 원천) | **freepass 게이트화** — false 면 실키 열거 반환. private `isSysadmin()`(L127) 은 게이트 조건으로 계속 사용 |
| B3 | `security/service/SecUserService.java` | `getMyButtonEndpoints` L469-478 | 와일드카드 마커 1행 `{*,*,*,*}` 반환 | **freepass 게이트화** — false 면 일반 사용자와 동일한 실 (objId×action) 평탄 행 |
| B4 | 〃 | `filterMenusByRole` L583-586(hasAuthority) + **L589-591(roleIds.contains)** | 전체 메뉴 통과 분기 2개 | **둘 다 freepass 게이트화** — false 면 백필된 allowedObjectIds 로 필터(백필 완료 상태에선 결과 동일 = 전체 leaf) |

### 1-3. 존치 (제거 대상 아님 — 근거)

| 파일 | 내용 | 존치 근거 |
|------|------|-----------|
| `config/McmSecurityDefaults.java` L38-49 | secUser/secRole/secPerm/secObj/secMenu/secRolePerm/secUserRole/secRoleGroup save 류 → `hasAuthority(SYSADMIN)` 필수 | 허용 확대가 아닌 **추가 제한**. 제거하면 PERM 매핑만으로 권한 마스터를 바꿀 수 있게 되어 권한상승 경로가 열림 |
| `EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES` L67-73 | myMenus/myButtonEndpoints 등 본인 데이터 RBAC 면제 | SYSADMIN 무관 — 전 사용자 공통 설계 |

---

## 2. 판정 흐름 변화

```
[현행]  PUBLIC → 세션(401) → AUTH_ONLY → LoV → SYSADMIN 전면통과 → RBAC 멤버십 → 미매칭 토글
[전환]  PUBLIC → 세션(401) → AUTH_ONLY → LoV →                  RBAC 멤버십 → 미매칭 토글
                                                (SYSADMIN 도 동일 — perms 는 백필 실키,
                                                 브레이크글라스 시 ["*"] 로 F3 통로 통과)
```

BE 도 동일: 인증 → (freepass=true 시에만 SYSADMIN 통과) → PermKey 파싱 → UserPermCache contains.
메뉴·버튼도 TB_MCM_SEC_ROLE_MAPPING 실데이터로만 산출된다.

---

## 3. 수정 상세 — BE (mcm-core, 4파일)

### 3-1. 프로퍼티 정의 (신규)

```yaml
# application.yml (mcm-core 채택 모듈 공통 기본값)
mcm:
  security:
    sysadmin-freepass: false   # true = 舊 SYSADMIN 전면통과 복원 (브레이크글라스 전용)
```

긴급 복원: WildFly JVM 옵션 `-Dmcm.security.sysadmin-freepass=true` 후 재기동.
게이트 발동 시 `log.warn` 1회(기동 시) — 평시 켜져 있음을 놓치지 않도록.

### 3-2. `EndpointPermissionFilter` (B1)

```java
// 필드 주입
@Value("${mcm.security.sysadmin-freepass:false}") boolean sysadminFreepass;  // 생성자 파라미터로

// L126-130 변경
if (sysadminFreepass
        && (securityIdentity.hasAuthority("ROLE_SYSADMIN")
            || securityIdentity.hasAuthority("SYSADMIN"))) {
    filterChain.doFilter(request, response);
    return;
}
```

false 시 SYSADMIN 도 `userPermCache.getPermissions(userId).contains(requested)` 를 탄다.
백필로 SYSADMIN 은 전 obj × PERM_ALL 액션 PermKey 를 보유하므로 통과가 유지된다.

### 3-3. `UserPermCache.toKeyStrings` (B2)

```java
// L117-118 변경
if (sysadminFreepass && isSysadmin(userId)) return List.of("*");
```

false 시 실키 열거 — 로그인 응답 permKeys·`/api/sec/perm-keys` 가 SYSADMIN 도 실키 배열이 된다(§5 용량).
`@Component` 라 `@Value` 생성자 주입 추가.

### 3-4. `SecUserService` (B3·B4)

- `getMyButtonEndpoints` L469-478: `if (sysadminFreepass && hasAuthority(...))` 로 게이트.
  false 시 아래 일반 경로가 SYSADMIN 매핑(106 obj)을 평탄화해 실 행을 반환.
- `filterMenusByRole` **분기 2개 모두** 게이트: L583-586(hasAuthority) 과 L589-591(roleIds.contains).
  하나만 막으면 다른 분기로 여전히 프리패스 — 반드시 쌍으로.

### 3-5. `CommObjMngService.saveCmObj` — SYSADMIN 자동 매핑 (D4)

insert("inserted"/"C") 분기에서 SecObj 저장 직후:

```java
if (!secRoleMappingRepository.existsByRoleIdAndObjectId("SYSADMIN", objectId)) {
    secRoleMappingRepository.save(SecRoleMapping.of("SYSADMIN", objectId, "PERM_ALL",
            /* audit: C_USR_ID=현재사용자, C_SVC_ID="secObj-auto-map" */));
}
// 루프 종료 후 1회
eventPublisher.publishEvent(new RoleChangedEvent(...));  // UserPermCache 즉시 무효화
```

- `existsByRoleIdAndObjectId` 쿼리 메서드 신규(멱등). PERM_ALL 미존재 환경 방어는 불요(표준 시드).
- **적용 경로는 운영 등록 화면(commObjMng)만.** DataInitializer·sqlcmd 시드 경로는 수정하지 않고
  (기존 결정: DataInitializer 미수정, sqlcmd 직접 등재) 백필 SQL 재실행으로 커버 — 스크립트가
  set-based 멱등이라 신규 obj 등재 후 그대로 재실행하면 된다.

---

## 4. 수정 상세 — BFF / shared (frontend)

### 4-1. `shared/src/auth/rbac-policy.ts`

- `isSysadmin()` 함수 삭제 (F1). `PolicyToken.roles` 필드는 `hasAnyRole` 용으로 유지.
- `evaluateApiPolicy` L133 삭제 (F2). 평가순서 docstring 을 6단계로 갱신.
- L138 `perms.includes("*")` 존치 + 주석: `// "*" = BE 브레이크글라스(sysadmin-freepass) 시 전면허용 통로`.

### 4-2. `shared/tests/unit/rbac-policy.unit.test.ts`

- `describe("isSysadmin")` 삭제.
- T8 재작성: SYSADMIN 롤 토큰이어도 **loader 가 호출**되고 멤버십으로 판정됨을 명세
  (perms 에 키 있으면 pass / 없으면 forbidden-perm).
- T11: "단 SYSADMIN 은 pass" 단언 제거 — 미매칭 DENY 는 롤 무관 forbidden-unmatched.
- 신규: `perms=["*"]` 이면 임의 RBAC 키 pass (브레이크글라스 통로 명세).

### 4-3. 주석 현행화 — `m-mcm/proxy.ts` L14-16, `shared/src/auth/server.ts` L495

### 4-4. 무수정 확인 (검증 근거)

| 파일 | 근거 |
|------|------|
| `m-mcm/lib/auth/api-permission-cache.ts` | `"*"` 자체 로직 없음 — BE 응답 그대로 캐시(전수 확인). BE 가 실키를 주면 자동 전환 |
| `shared/src/portal-shell/use-user-button-rbac.ts` | 와일드카드 **행 감지** 방식 — BE 가 실행 데이터를 주면 `isSysadmin=false` 로 일반 판정, 브레이크글라스 시 자동 복원. `canDoButton` 의 `r.action === "*"` 도 데이터 없으면 불발 |
| BE `PermKey`/`parseUrl`/`parseBackendOasisUrl` | 매칭 규칙 무변경 — 비관리자에서 기검증된 경로 그대로 |

---

## 5. 용량·성능 영향 (SYSADMIN 실키 열거 시)

| 항목 | 추정 | 판단 |
|------|------|------|
| perm-keys / 로그인 permKeys | 106 obj × PERM_ALL 액션 토큰(~40여) ≈ **4천여 키**, 응답 수백 KB | 방식 C 서버캐시(60s TTL)라 **쿠키 크기 무관**. BFF 메모리 사용자당 수백 KB — 수용. 단 로그인 응답에도 실리므로 로그인 1회 페이로드 증가(§8 후속 최적화 여지) |
| myButtonEndpoints | 동일 카르테시안 ≈ 4천여 행 | FE globalThis 캐시로 fetch 1회. `canDoButton` 선형 스캔 × 페이지당 버튼 수십 — 무시 가능 |
| BE `UserPermCache` | admin 계정당 PermKey 수천 개 Set | contains O(1) 불변, 메모리 미미 |

---

## 6. 배포 순서 호환성 / 롤백

| 시나리오 | admin 동작 | 판단 |
|----------|-----------|------|
| **BE 먼저** (freepass=false) + 舊 BFF | perm-keys 실키 반환. 舊 BFF 는 토큰 roles 로 isSysadmin → pass | ✅ 안전 |
| **BFF 먼저** + 舊 BE | 舊 BE 가 `["*"]` 반환 → 新 BFF 의 F3(`"*"` 멤버십) 통과 | ✅ 안전 |
| 동시 배포 | 실키 멤버십 판정 | ✅ (김포는 백필 선행 필수) |
| **롤백** | BE `-Dmcm.security.sysadmin-freepass=true` 재기동 → `["*"]` 복원 → BFF 자동 추종 | 코드 롤백 불요 |

⚠️ **김포에 백필 없이 배포하면 admin 전면 403** — `sysadmin-rbac-backfill-gimpo.sql` 실행이 무조건 선행.

---

## 7. 검증 계획

1. **단위**: shared 118종 재실행(§4-2 재작성분 포함) / BE `UserPermCacheTest` 에 freepass on/off 두 모드의 `toKeyStrings` 케이스 추가.
2. **E2E (포항, freepass=false)**: admin 로그인 → ① 전체 메뉴 노출(백필 106 obj 기준) ② OASIS 화면 조회/저장 ③ REST 신경로(analog logViewer) 200 ④ 버튼 활성(와일드카드 없이 실 행 기반) ⑤ 권한 없는 키 인위 제거 후 403 확인(순수 RBAC 증명).
3. **비관리자 회귀**: MCM_VIEWER 로 기존 13 obj 화면 정상 + 나머지 403 불변.
4. **브레이크글라스 스모크**: freepass=true 기동 → 舊 동작(와일드카드) 복원 확인 → false 복귀.
5. **자동 매핑**: commObjMng 로 신규 obj 등록 → 매핑 자동 생성 + admin 즉시 접근(RoleChangedEvent 무효화) 확인.

## 8. 리스크 / 잔여

| 리스크 | 대응 |
|--------|------|
| 김포 미백필 배포 → admin 전면 403 | §6 경고. 배포 체크리스트에 백필 SELECT(unmapped=0) 포함 |
| 신규 화면의 **특수 action** 이 PERM_ALL CSV 에 없으면 SYSADMIN 도 해당 버튼 403 | 운영 규칙: 특수 action 추가 시 PERM_ALL 4필드 CSV 에도 등재. (자동 매핑은 obj 누락만 방지 — action 누락은 별개) |
| 로그인 응답 페이로드 증가(수백 KB) | 수용 후 관찰. 필요 시 후속: 로그인 응답에서 permKeys 제거하고 방식 C 캐시로 일원화 |
| sqlcmd 직접 등재(비 commObjMng 경로) obj 는 자동 매핑 미적용 | 등재 절차에 백필 SQL 재실행 포함(멱등) |
| 권한 변경 반영 지연 | 기존과 동일(BE 10분 TTL + RoleChangedEvent 즉시, BFF 60s TTL) — 본 전환으로 변화 없음 |

## 9. 구현 순서 (착수 지시 후)

1. BE: 프로퍼티 + B1~B4 게이트화 + `CommObjMngService` 자동 매핑 + `UserPermCacheTest` → mcm local-ph 기동 검증
2. BFF: F1~F6 + 테스트 재작성 → shared 단위테스트 + 격리 tsc
3. E2E §7-2~5 (포항) → 사용자 확인 → 커밋(BE/BFF 분리) → 김포 백필 후 배포
