# BFF RBAC — REST 신경로 규약(`rest/{objId}/{action}`) 상세설계

> 일시: 2026-07-16
> 상태: 설계 확정(사용자 결정 반영) — 구현 착수 전
> 관련 문서: [RBAC-PATH-CONVENTION.md](../guide/Security/RBAC-PATH-CONVENTION.md) ·
> [BFF-RBAC-상세설계-구현계획.md](./BFF-RBAC-상세설계-구현계획.md)

---

## 0. 결정 사항 (2026-07-16 확정)

| # | 결정 | 내용 |
|---|------|------|
| D1 | **신규 REST 경로 규약** | `/api/{module}/rest/{objId}/{action}/{backendPath}` — objId/action 을 URL 에 명시 |
| D2 | **BFF→BE 라우팅** | BFF 가 `{objId}/{action}` 2세그먼트를 **제외**하고 백엔드 경로(backendPath)만 BE 로 전달 (BE 컨트롤러 무수정) |
| D3 | **구 rest 라우트 삭제** | `/api/{module}/rest/{backendPath}` 통과형 라우트 제거 — 미이행 호출은 404/403 으로 시끄럽게 실패(빅뱅) |
| D4 | **LOV** | RBAC-skip 설계 유지 — 기존 `/api/{module}/lov/**` 경로·`lovPattern` 사용 (BFF 추가 작업 없음) |
| D5 | **적용 범위** | BFF/shared 계층 + **m-analog·caravanConsole 은 본 작업에서 직접 수정**. m-mpn FE 호출부(54+2파일)는 **후속 작업**(§7 가이드) |

**배경**: RBAC 검사는 BFF 미들웨어(`proxy.ts` → `evaluateApiPolicy` → `parseRbacKey`) 단일 지점에서
URL 만으로 `module/objId/action` permKey 를 만들어 수행한다. 구 rest 경로는 2번째 세그먼트 `rest` 가
예약어라 파싱 불가 → unmatched 통과(RBAC 사각지대). 본 설계는 URL 에 objId/action 을 명시해
파서가 읽게 하고, BE 는 스트립으로 무수정 유지한다.

---

## 1. URL 규약 정의

```
/api/{module}/rest/{objId}/{action}/{backendPath}[?쿼리]
      │            │       │        └ BE 컨트롤러의 실제 경로 그대로 (예: api/sales-orders/123/split)
      │            │       └ 행위 토큰 — SecPerm CSV(PERMISSION_*) 의 액션 어휘와 일치해야 함
      │            └ 권한 객체 ID — TB_MCM_SEC_OBJ.OBJECT_ID 와 일치해야 함 (시드값 기준)
      └ 모듈 (mpn / mcm / analog / ...)
```

- **permKey 도출**: `parseRbacKey` → `{module}/{objId}/{action}` (OASIS 4-seg 와 동일 키 공간).
  키는 `makeKey` 가 **소문자 정규화**하며 BE `UserPermCache.toKeyStrings` 직렬화와 1:1 정합(원문 주석 명시)
  — URL 의 objId 대소문자는 비교에 영향 없음(가독성 위해 시드 표기 camelCase 사용 권장).
- **action 표준 어휘**: `search`(조회) / `save`(등록·수정) / `delete`(삭제) + 화면 특수 액션
  (`confirm`, `split`, `revert`, `finalize` 등 — SecPerm 의 `PERMISSION_ACTION` CSV 에 등록).
- **objId 규칙**: DataInitializer 로 시드된 `SecObj.OBJECT_ID` 를 그대로 사용 (권한 데이터 이행 0).
  예: analog=`logViewer`, mpn=`plannedOrderMng`·`bomMng`… (SYSTEM_CODE 로 모듈 구분).

**예시**

| 호출 | permKey | BE 전달 경로 |
|------|---------|-------------|
| `GET /api/analog/rest/logViewer/search/api/meta` | `analog/logViewer/search` | `/api/meta` |
| `GET /api/mpn/rest/plannedOrderMng/search/api/planned-orders?page=0` | `mpn/plannedOrderMng/search` | `/api/planned-orders?page=0` |
| `PATCH /api/mpn/rest/plannedOrderMng/split/api/planned-orders/123/split` | `mpn/plannedOrderMng/split` | `/api/planned-orders/123/split` |

**fail-closed 특성**: 신규 경로는 항상 permKey 로 파싱되므로 권한 미보유 시 즉시 403.
`RBAC_DEFAULT_DENY` 전역 전환 없이도 rest 구간은 자체 fail-closed 가 된다.

---

## 2. 요청 흐름 (수정 후)

```
FE   GET /api/analog/rest/logViewer/search/log/range/time?from=...
      ↓
BFF 미들웨어(proxy.ts)
      parseRbacKey → analog/logViewer/search
      getUserPerms(userId) 캐시 대조 → 통과 / 403
      ↓
BFF 라우트  app/api/[module]/rest/[objId]/[action]/[...path]/route.ts
      params = { module:'analog', objId:'logViewer', action:'search', path:['log','range','time'] }
      forwardToBackend(req, 'analog', '/log/range/time')   ← objId/action 자연 제외
      (쿼리스트링은 be-proxy 가 req.nextUrl.search 로 별도 보존)
      ↓
BE   GET {ANALOG_WAS_URL}/log/range/time?from=...   ← 기존과 동일, BE 무수정
```

---

## 3. 수정 상세 — BFF/shared 계층

### 3-1. [신규] `m-mcm/app/api/[module]/rest/[objId]/[action]/[...path]/route.ts`

```ts
/**
 * REST 신경로 프록시 — RBAC 규약 `/api/{module}/rest/{objId}/{action}/{backendPath}`.
 *
 *  - objId/action 은 RBAC permKey(`{module}/{objId}/{action}`) 재료 — 미들웨어(proxy.ts)가 검사.
 *  - BE 전달 시 objId/action 을 제외하고 백엔드 경로(backendPath)만 전달한다 (BE 컨트롤러 무수정).
 *  - 구 통과형 rest 라우트(`rest/[...path]`)는 삭제됨 — 구형 호출은 404/403 으로 실패한다(의도).
 */
import { encodeSegments, forwardToBackend } from "@/lib/http/be-proxy";
import { NextRequest, NextResponse } from "next/server";

async function proxyToBackend(
  req: NextRequest,
  context: { params: Promise<{ module: string; objId: string; action: string; path: string[] }> }
) {
  const { module, path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "백엔드 경로(backendPath)가 없습니다." } },
      { status: 400 }
    );
  }
  return forwardToBackend(req, module, `/${encodeSegments(path)}`);
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
export const HEAD = proxyToBackend;
export const OPTIONS = proxyToBackend;
```

검증된 무영향 사항(be-proxy.ts 원문 확인):
- 쿼리스트링: `req.nextUrl.search` 를 경로와 **별도로** 결합 → 스트립과 무관하게 보존.
- 바디: `arrayBuffer()` 바이너리 안전 / 메서드·Content-Type 그대로 전달 / 30분 타임아웃 유지.
- `scenarios/finalize` 특수 케이스: **스트립 후 경로** 기준 정규식이라 동작 동일.

### 3-2. [삭제] `m-mcm/app/api/[module]/rest/[...path]/route.ts`

구 통과형 라우트 제거. 삭제 후 구형 호출의 실패 모드 — **형제 catch-all
`[module]/[...path]/route.ts`(3-seg 컨벤션용, full path 전달)가 존재**하므로 다음과 같이 갈린다:

- `/api/mpn/rest/api/sales-orders` 이상 (module 제외 4세그↑) → 미들웨어의 신규 rest 분기가
  objId='api'/action='sales-orders' 로 파싱 → permKey `mpn/api/sales-orders` 권한 없음 → **미들웨어 403**
  (라우트 도달 전 차단)
- `/api/mpn/rest/x` (module 제외 3세그 — 기형) → 파서 null(예약어) → unmatched 통과 →
  신규 rest 라우트 미매칭 → **catch-all 폴백**이 full path 를 BE 로 전달 → BE 에 `/api/{m}/rest/**`
  매핑 없음 → **BE 404**

→ 어느 쪽이든 조용히 성공하지 않으므로 미이행 호출부가 즉시 드러난다.
  (참고: 신규 규약 경로는 module 제외 4세그↑라 항상 신규 rest 라우트가 우선 매칭 — Next.js 는
  정적 세그먼트 `rest` 하위 트리가 완전 매칭될 때 catch-all 보다 우선한다.)

### 3-3. [수정] `shared/src/auth/rbac-policy.ts` — `parseRbacKey`

기존 분기(L90-91) **앞에** rest 분기 추가:

```ts
  // REST 신경로: /api/{module}/rest/{objId}/{action}/{backendPath...} → module/objId/action
  //   (2026-07-16 규약 — 구 통과형 rest 는 라우트 삭제로 폐기. 'rest' 는 RESERVED 목록에 남기되
  //    본 분기가 먼저 소비하므로 3-seg 컨벤션 검사에는 계속 예약어로 작동한다.)
  if (seg.length >= 4 && seg[1] === "rest") return makeKey(seg[0], seg[2], seg[3]);
  if (seg.length === 4 && seg[1] === "oasis") return makeKey(seg[0], seg[2], seg[3]);
  if (seg.length === 3 && !reserved.has(seg[1])) return makeKey(seg[0], seg[1], seg[2]);
```

- 시그니처 불변(`path` 만 사용) — action 이 URL 에 있으므로 HTTP 메서드 전달 불필요.
- `RESERVED_SECOND_SEG` 목록은 유지(주석만 현행화).

### 3-4. [수정] `shared/tests/unit/rbac-policy.unit.test.ts` — 케이스 추가

| 입력 | 기대 |
|------|------|
| `/api/mpn/rest/plannedOrderMng/search/api/planned-orders` | `mpn/plannedOrderMng/search` |
| `/api/analog/rest/logViewer/search/log/range/time` | `analog/logViewer/search` |
| `/api/mpn/rest/api/sales-orders/123` (구형 잔재) | `mpn/api/sales-orders` (오인 키 — 403 유도, 명세화) |
| `/api/mpn/rest/x` (3세그) | `null` (기존 예약어 동작 유지) |
| `/api/mcm/lov/query/q1` | `null` (lovPattern skip 불변) |
| 기존 OASIS/3-seg 케이스 | 회귀 불변 |

### 3-5. [주석 현행화] `m-mcm/proxy.ts`

기능 변경 없음. `unmatchedDeny` 주석의 "aps/mpn/kmc rest·query·service 통과" 문구를
"rest 는 신경로 규약으로 RBAC 편입(2026-07-16), query/service 는 통과 유지" 로 갱신.

---

## 4. 수정 상세 — 직접 수정 FE (본 작업 범위)

### 4-1. m-analog `src/anl/log-viewer/log-viewer-api.ts` (1파일 — 실사용 rest 전부)

전 엔드포인트 GET 조회 → **objId=`logViewer`(시드 존재, SYSTEM_CODE='analog') / action=`search` 단일**.

```ts
// before
const BASE = "/api/analog/rest";
// after
const BASE = "/api/analog/rest/logViewer/search";
```

| 호출 | before → after (BASE 이하 불변) |
|------|-------------------------------|
| `fetchAnalogMeta` | `${BASE}/api/meta` |
| `fetchLogRangeTime` | `${BASE}/log/range/time?...` |
| `fetchLogRangeTimeTree` | `${BASE}/log/range/time/tree?...` |
| `buildDownloadUrl` (window.open) | `${BASE}/log/range/time/download?...` — 세션쿠키 동일 적용 |
| `refreshRealtimeLog` (평문 fetch) | `${BASE}/log/refresh?...` — same-origin 쿠키 동일 적용 |

- **권한 데이터 선행 조건**: 사용 롤에 `analog/logViewer/search` 매핑 필요
  (SecObj `logViewer` 는 시드 완료 — SecPerm/RoleMapping 은 운영 데이터 작업).

### 4-2. caravanConsole — **실사용 코드 0건, 주석 정정 2곳**

실사(전수 grep) 결과 caravanConsole 6개 화면(appHost/caravanHubConfig/dashboard/message/
pilotCaravanSend/topic)의 실호출은 **전부 OASIS 경로**(`/api/mcm/oasis/...`)로 이미 RBAC 편입 상태다.
rest 언급은 주석 잔재 2곳뿐:

| 파일 | 정정 |
|------|------|
| `caravanConsole/topic/types.ts:2` | `/api/mcm/rest/caravanConsole/topics` 주석 → 실경로(OASIS) 기준으로 정정 |
| `caravanConsole/topic/components/SendTestModal.tsx:17` | `/api/mcm/rest/caravanConsole/consumers/...` 주석 → 실경로 기준으로 정정 |

→ caravanConsole 은 코드 수정 없이 **구 rest 삭제의 영향권 밖**임이 확인됨.

---

## 5. 무수정 확인 목록 (검증 근거 포함)

| 대상 | 근거 |
|------|------|
| `be-proxy.ts` | 쿼리/바디/메서드 보존·특수케이스 모두 스트립 후 경로 기준 (§3-1) |
| LOV 경로·skip | `lovPattern: /^\/api\/[^/]+\/lov\//` + lov 라우트 3종(master/query/service) 기존 완비 |
| `oasis`/`query`/`service` 라우트 | 무관 |
| 백엔드 전체 (aps-core 71 컨트롤러 포함) | 스트립으로 기존 경로 그대로 수신 |
| `RBAC_DEFAULT_DENY` | 미변경 — 신경로는 자체 fail-closed |

---

## 6. 검증 계획

1. `pnpm --filter @dk-oasis/shared test:unit` — rbac-policy 신규 케이스 포함 녹색.
2. `pnpm -r build` — shared/m-mcm/m-analog 빌드.
3. 수동 시나리오(dev):
   - analog 로그뷰어 화면 조회 → 200 (롤에 logViewer 권한 부여 상태)
   - 권한 미부여 계정 → 403 확인
   - 구형 경로 curl (`/api/mpn/rest/api/planned-orders`) → 404/403 확인
   - mcm/mls OASIS 화면 회귀 무영향 확인
4. `RBAC_DEFAULT_DENY` 는 본 작업에서 건드리지 않음.

---

## 7. 후속 작업 가이드 (본 설계 범위 밖 — mpn FE 이행자용)

1. **m-mpn 호출부 이행 (54파일 + m-mcm 내 mpf 화면 2파일)**
   - `_shared/http.ts` 의 `API_BASE` 폐기 → 헬퍼 시그니처에 objId 추가 권장:
     `createCrudApi(objId, basePath)` — list/get→`search`, create/update→`save`, remove→`delete` 자동,
     특수 액션(confirm/split/revert…)은 호출부에서 명시.
   - **objId 는 시드된 `SecObj.OBJECT_ID`(SYSTEM_CODE='mpn', 53종) 문자열과 반드시 일치** —
     이행 전 objId 명명 대조표(리소스 prefix ↔ OBJECT_ID) 작성 후 진행할 것.
2. **LOV 12종** (`/api/mpn/rest/api/plants` 등 공유 조회): `/api/mpn/lov/**` 경로로 이전 (D4 — RBAC-skip).
3. **권한 데이터**: 화면별 롤 매핑(SecPerm/RoleMapping) 등록 후 배포 — 매핑 없이 이행하면 전원 403.
4. **PlantApiController PoC 경로**(`/api/mpn/plant/{action}`, 3-seg)는 본 규약과 무관하게 계속 동작 —
   시드 objId(`plantMng`)와의 불일치는 이행 시 함께 정리.
5. 전 모듈 이행 완료 후 `RBAC_DEFAULT_DENY=true` 전환 검토.

---

## 8. 리스크 / 롤백

| 리스크 | 대응 |
|--------|------|
| 구 rest 삭제 시점에 mpn FE 미이행 | **의도된 빅뱅** — mpn FE 이행과 같은 배포 단위로 릴리스하거나, 이행 전까지 본 설계 배포 보류 (라우트 삭제가 스위치) |
| objId 오타 → 전 요청 403 | 파서는 통과시키고 권한 대조에서 걸림 — objId 명명표 + shared 단위테스트로 방지 |
| analog 권한 미매핑 배포 | 롤 매핑 선행(§4-1) — 미매핑 시 로그뷰어 403 |
| 롤백 | 신규 라우트 삭제 + 구 라우트 파일 복원(1커밋 revert) — 파서 분기는 잔존해도 무해(구 경로 미사용) |

— 끝 —
