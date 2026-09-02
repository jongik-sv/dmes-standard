# OasisController - 공통 서비스 컨트롤러 설계

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지(매핑 prefix 아님).
> - BFF 컨벤션: UI→BFF 는 `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{serviceId}/{action}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.

## 1. 개요

### 기존 방식 (모듈별 Controller 반복)
```
WorkOrderController.java   → executor.execute("workorder/search", params)
ProductionController.java  → executor.execute("production/search", params)
SchedulingController.java  → executor.execute("scheduling/search", params)
ShippingController.java    → executor.execute("shipping/search", params)
... (화면 수 × CRUD = 수십~수백 개 Controller)
```

### 변경 방식 (OasisController 공통 Controller 1개)
```
POST /oasis/{serviceId}/{action}

→ serviceId: BPMN 프로세스 ID와 매핑
→ action: BPMN 게이트웨이에서 분기 (search, save, delete 등)
→ Controller 코드 작성 불필요
→ BPMN + MyBatis Mapper만 추가하면 API 완성
→ `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지(매핑 prefix 아님)
```

---

## 2. URL 체계

```
POST /oasis/{serviceId}/{action}     (BE 기준)
```

| 세그먼트 | 역할 | 예시 |
|----------|------|------|
| `serviceId` | BPMN 프로세스 ID와 매핑. OASIS `serviceStarter.start()`에 전달 | `workorder`, `inspection`, `shipment` |
| `action` | 액션. ServiceContext에 `action` 키로 전달 → BPMN 게이트웨이 분기 | `search`, `save`, `delete`, `detail` |

### BFF 컨벤션

| 구간 | URL 패턴 |
|------|----------|
| UI → BFF (OASIS) | `POST /api/{module}/oasis/{serviceId}/{action}` |
| UI → BFF (REST 등 비-OASIS) | `POST /api/{module}/nooasis/{path}` |
| BFF → BE (OASIS) | `POST /oasis/{serviceId}/{action}` (그대로 전달) |
| BFF → BE (비-OASIS) | `POST /{path}` (`/api/{module}/nooasis/` segment 만 제거) |

```
예시 (BE 기준):
  POST /oasis/workorder/search     → workorder.bpmn (action=search)
  POST /oasis/workorder/save       → workorder.bpmn (action=save)
  POST /oasis/workorder/delete     → workorder.bpmn (action=delete)
  POST /oasis/result/save          → result.bpmn (action=save)
  POST /oasis/inventory/search     → inventory.bpmn (action=search)
  POST /oasis/inspection/save      → inspection.bpmn (action=save)
```

> **모든 요청은 POST** — BPMN 서비스 "실행"이라는 단일 행위이므로 HTTP 메서드를 구분할 필요 없음
> 하나의 serviceId(BPMN 파일)가 action에 따라 search/save/delete 등 여러 행위를 처리한다.

---

## 3. 요청/응답 포맷

### 3.1 요청 (CactusRequest)

```json
{
  "meta": {
    "userId": "user01",
    "menuId": "PROD001"
  },
  "params": {
    "plantCd": "P01",
    "fromDate": "20260301",
    "toDate": "20260313",
    "status": "OPEN"
  },
  "grids": {
    "master": {
      "rows": [...]
    }
  }
}
```

| 필드 | 타입 | 용도 | 예시 |
|------|------|------|------|
| **meta** | `RequestMeta` | 사용자/메뉴 정보 (userId, menuId) | `{ "userId": "user01", "menuId": "PROD001" }` |
| **params** | `Map<String, Object>` | 조건, 필터 등 단순 파라미터 | 검색 조건, 공장코드, 날짜 범위 |
| **grids** | `Map<String, GridData>` | 그리드 데이터 (rows 배열) | 저장/수정/삭제할 그리드 행 데이터 |

### 3.2 사용 패턴별 예시

#### 조회 (Search)
```json
POST /oasis/workorder/search
{
  "meta": { "userId": "user01", "menuId": "PROD001" },
  "params": {
    "plantCd": "P01",
    "fromDate": "20260301",
    "toDate": "20260313",
    "status": "OPEN"
  }
}
```

#### 저장 (Save) — 그리드 다건 (일반적인 MES 패턴)
```json
POST /oasis/workorder/save
{
  "meta": { "userId": "user01", "menuId": "PROD001" },
  "params": {
    "plantCd": "P01"
  },
  "grids": {
    "master": {
      "rows": [
        { "rowStatus": "C", "workOrderNo": null, "itemCd": "ITEM01", "qty": 100 },
        { "rowStatus": "U", "workOrderNo": "WO001", "itemCd": "ITEM02", "qty": 200 },
        { "rowStatus": "D", "workOrderNo": "WO002" }
      ]
    }
  }
}
```
> `rowStatus`: C(Create), U(Update), D(Delete) — MES 그리드 표준 패턴

#### 삭제 (Delete)
```json
POST /oasis/workorder/delete
{
  "meta": { "userId": "user01", "menuId": "PROD001" },
  "params": {},
  "grids": {
    "master": {
      "rows": [
        { "rowStatus": "D", "workOrderNo": "WO001" },
        { "rowStatus": "D", "workOrderNo": "WO002" },
        { "rowStatus": "D", "workOrderNo": "WO003" }
      ]
    }
  }
}
```

#### 단건 상세 조회
```json
POST /oasis/workorder/detail
{
  "meta": { "userId": "user01", "menuId": "PROD001" },
  "params": {
    "workOrderNo": "WO20260313001"
  }
}
```

### 3.3 응답 (CactusResponse)

**조회 (그리드 결과):**
```json
{
  "meta": {
    "txId": "user01-PROD001-20260313103045-001",
    "success": true,
    "code": null,
    "message": null
  },
  "data": {
    "totalCount": 150
  },
  "grids": {
    "master": {
      "rows": [
        { "workOrderNo": "WO001", "itemCd": "ITEM01", "qty": 100, "status": "OPEN" },
        { "workOrderNo": "WO002", "itemCd": "ITEM02", "qty": 200, "status": "CLOSED" }
      ]
    }
  }
}
```

**저장/삭제 (결과):**
```json
{
  "meta": {
    "txId": "user01-PROD001-20260313103045-002",
    "success": true,
    "code": null,
    "message": "저장되었습니다"
  },
  "data": {
    "affectedRows": 3,
    "workOrderNo": "WO20260313001"
  }
}
```

**에러:**
```json
{
  "meta": {
    "txId": "user01-PROD001-20260313103045-003",
    "success": false,
    "code": "E001",
    "message": "재고가 부족합니다 (현재: 50, 요청: 100)"
  },
  "data": null,
  "errors": [
    { "field": "qty", "code": "E001", "message": "재고가 부족합니다 (현재: 50, 요청: 100)" }
  ]
}
```

---

## 4. 공통 컨트롤러 구현

### 4.1 CactusRequest (요청 표준 포맷)

```java
/**
 * 공통 서비스 요청 DTO.
 * 프론트엔드에서 전송하는 표준 요청 포맷.
 *
 * - meta: 사용자/메뉴 정보 (userId, menuId)
 * - params: 조건/필터 등 단순 파라미터
 * - grids: 그리드 데이터 (gridId → { rows: [...] })
 */
public class CactusRequest {
    private RequestMeta meta;
    private Map<String, Object> params;
    private Map<String, GridData> grids;

    // getters, setters ...

    public RequestMeta getMeta() { return meta; }
    public Map<String, Object> getParams() { return params; }
    public Map<String, GridData> getGrids() { return grids; }
}

public class RequestMeta {
    private String userId;
    private String menuId;
    // getters, setters ...
}

public class GridData {
    private List<Map<String, Object>> rows;
    // getters, setters ...
}
```

### 4.2 OasisController (공통 컨트롤러)

```java
package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.springframework.web.bind.annotation.*;

/**
 * OASIS 공통 컨트롤러.
 * 모든 MES 화면 API를 단일 엔드포인트로 처리한다.
 *
 * URL: POST /oasis/{serviceId}/{action}
 *  - 매핑 prefix는 `/oasis` 로 고정 (cactus 표준).
 *  - `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지된다(매핑 prefix 아님).
 *  - serviceId: BPMN 프로세스 ID와 매핑
 *  - action: ServiceContext에 전달 → BPMN 게이트웨이에서 분기
 */
@RestController
@RequestMapping("/oasis")
public class OasisController {

    private final OasisServiceExecutor executor;

    public OasisController(OasisServiceExecutor executor) {
        this.executor = executor;
    }

    @PostMapping("/{serviceId}/{action}")
    public CactusResponse handle(
            @RequestBody CactusRequest request,
            @PathVariable String serviceId,
            @PathVariable String action) {

        return executor.execute(serviceId, action, request);
    }
}
```

**설계 포인트:**

- 메서드가 `handle()` 하나뿐이다. 모든 업무 분기는 BPMN 게이트웨이가 담당한다.
- `@RequestBody CactusRequest`로 표준 요청 포맷을 받고, `CactusResponse`로 표준 응답을 반환한다.
- 컨트롤러는 HTTP 매핑만 수행하고, 비즈니스 로직이 없다.
- 예외 처리, txId 생성, 입출력 변환은 모두 `OasisServiceExecutor`가 담당한다.

### 4.3 요청 흐름 (전체)

```
Browser (SPA)
  │ POST /api/operation/oasis/workorder/search        (UI → BFF, BFF 컨벤션)
  │ body: { meta: { userId: "user01", menuId: "PROD001" },
  │         params: { plantCd: "P01", fromDate: "20260301" } }
  ▼
Next.js BFF
  │ 쿠키에서 JWT 추출 → Authorization 헤더로 변환
  │ 프록시: POST http://dmes-operation:8082/oasis/workorder/search   (BFF → BE, OASIS 그대로)
  ▼
Cactus Filters
  │ TxIdFilter → 임시 UUID를 MDC["txId"]에 설정
  │ RequestIdFilter → 요청 식별자 발급/전파
  │ ClientKeyFilter → `X-Backend-Client-Key` 검증 (`BACKEND_CLIENT_KEY` env)
  │ JwtAuthenticationFilter → JWT 검증
  ▼
OasisController.handle(request, "workorder", "search")
  │
  │ → executor.execute("workorder", "search", request)
  ▼
OasisServiceExecutor.execute(...)
  │
  │ 1. txId 생성 (userId-menuId-yyyyMMddHHmmss-xxx)
  │    → MDC["txId"]를 정식 txId로 교체
  │
  │ 2. CactusRequestConverter.convert(request, "search")
  │    → CactusRequest → Map<String, TypedObject>
  │    → { action: "search", userId: "user01", menuId: "PROD001",
  │        plantCd: "P01", fromDate: "20260301" }
  │
  │ 3. ServiceContext 생성 → serviceStarter.start("workorder", sc)
  │    → OASIS BPMN 서비스 실행
  │    → StartEvent
  │    → ExclusiveGateway (action == "search")
  │    → SqlScriptTask (MyBatis: WorkOrderMapper.selectList)
  │    → EndEvent
  │    → ServiceResult 반환
  │
  │ 4. CactusResponseConverter.convert(result, txId)
  │    → ServiceResult → CactusResponse
  │    → List 결과는 grids에, 단일 값은 data에 분류
  ▼
응답: { meta: { txId: "...", success: true }, data: { totalCount: 150 },
        grids: { master: { rows: [...] } } }
```

---

## 5. 보안 및 서비스 접근 제어

OasisController는 단일 엔드포인트이므로 `@Auditable` 같은 메서드별 어노테이션을 사용할 수 없다.
대신 **SecurityConfig의 URL 패턴 기반 인가**로 서비스 접근을 제어한다.

### 5.1 SecurityConfig URL 패턴 인가

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
            // 서비스/액션 단위 접근 제어 (매핑 prefix 는 `/oasis` 로 고정)
            .requestMatchers("/oasis/workorder/delete").hasRole("ADMIN")
            .requestMatchers("/oasis/**").authenticated()
        );
        return http.build();
    }
}
```

> 기존 `ServiceMetadataRegistry` 개념은 URL 패턴 인가로 대체되었다.
> 감사(audit) 로깅이 필요한 경우, OasisServiceExecutor 내부에서 txId 기반으로 실행 로그를 기록한다.

### 5.2 감사 로그 (OasisServiceExecutor 내부)

OasisServiceExecutor가 모든 서비스 실행에 대해 txId 기반 로그를 남긴다.

```java
// OasisServiceExecutor 내부
log.info("{}/{}", serviceId, action);

// 성공 시
log.info("[{}] {}/{} completed", txId, serviceId, action);

// 실패 시 (BusinessException)
log.warn("[{}] BusinessException: {}", txId, e.getMessage());

// 실패 시 (Unexpected)
log.error("[{}] Unexpected error", txId, e);
```

> txId 형식: `userId-menuId-yyyyMMddHHmmss-xxx` (TxIdGenerator가 생성)
> MDC에 txId가 설정되므로 로그 파일에서 특정 요청의 전체 흐름을 추적할 수 있다.

---

## 6. BFF 프록시 수정

### 6.1 Next.js API Route (단일 catch-all)

기존의 모듈별 프록시 라우트를 하나로 통합할 수 있다.

```
기존:
  src/app/api/operation/[...path]/route.ts
  src/app/api/logistics/[...path]/route.ts
  src/app/api/quality/[...path]/route.ts
  ... (모듈별 라우트)

변경:
  src/app/api/[module]/[...path]/route.ts   ← 1개로 통합
```

```typescript
// src/app/api/[module]/[...path]/route.ts
import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: { module: string; path: string[] } }
) {
  const { module, path } = params;
  // path = ["workorder", "search"] → /api/production/workorder/search
  const backendPath = path.join('/');
  return proxyToBackend(module, backendPath, req);
}
```

### 6.2 프론트엔드 API 호출

```typescript
// src/lib/api-client.ts

interface CactusRequestPayload {
  meta: { userId: string; menuId: string };
  params?: Record<string, any>;
  grids?: Record<string, { rows: any[] }>;
}

/**
 * OASIS 서비스 호출 공통 함수.
 *
 * @param serviceGroup 서비스 그룹 (production, quality, logistics 등)
 * @param serviceId    서비스 ID (workorder, inspection 등)
 * @param action       액션 (search, save, delete 등)
 * @param request      CactusRequest { meta, params, grids }
 */
export async function executeService(
  serviceGroup: string,
  serviceId: string,
  action: string,
  request: CactusRequestPayload
) {
  const response = await fetch(`/api/${serviceGroup}/${serviceId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return response.json();
}

// ── 사용 예시 ──

const meta = { userId: 'user01', menuId: 'PROD001' };

// 조회
const result = await executeService('production', 'workorder', 'search', {
  meta,
  params: { plantCd: 'P01', fromDate: '20260301' }
});

// 저장
const result = await executeService('production', 'workorder', 'save', {
  meta,
  params: { plantCd: 'P01' },
  grids: {
    master: {
      rows: [
        { rowStatus: 'C', itemCd: 'ITEM01', qty: 100 },
        { rowStatus: 'U', workOrderNo: 'WO001', qty: 200 },
      ]
    }
  }
});

// 삭제
const result = await executeService('production', 'workorder', 'delete', {
  meta,
  grids: {
    master: {
      rows: [
        { rowStatus: 'D', workOrderNo: 'WO001' },
        { rowStatus: 'D', workOrderNo: 'WO002' },
      ]
    }
  }
});
```

---

## 7. BPMN에서 params/grids 접근

### 7.1 OASIS 프로세스에서의 변수 접근

OasisServiceExecutor가 CactusRequestConverter를 통해 CactusRequest를 OASIS ServiceContext 입력으로 변환한다.

```
CactusRequestConverter 변환 결과 (Map<String, TypedObject>):

[action — URL에서 추출]
  action      = "search"

[meta에서 온 값]
  userId      = "user01"
  menuId      = "PROD001"

[params에서 온 값 — flat 전개]
  plantCd     = "P01"
  fromDate    = "20260301"
  toDate      = "20260313"

[grids에서 온 값 — gridId로 전달]
  master      = [ { rowStatus: "C", itemCd: "ITEM01", qty: 100 }, ... ]
```

> OASIS BPMN 내부에서는 `${plantCd}`, `${master}`, `${action}` 등으로 프로퍼티 표현식을 통해 접근한다.

### 7.2 MyBatis Mapper에서의 접근

```xml
<!-- resources/persistence/workorder/WorkOrderMapper.xml -->

<!-- 조회: params의 값이 바로 #{} 바인딩됨 -->
<select id="selectList" parameterType="map" resultType="map">
    SELECT WORK_ORDER_NO, ITEM_CODE, QTY, STATUS, DUE_DATE
    FROM TB_WORK_ORDER
    WHERE PLANT_CD = #{plantCode}
      AND ORDER_DATE BETWEEN #{fromDate} AND #{toDate}
    <if test="status != null and status != ''">
      AND STATUS = #{status}
    </if>
    ORDER BY WORK_ORDER_NO DESC
</select>

<!-- 전체 건수 (페이징용) -->
<select id="selectCount" parameterType="map" resultType="long">
    SELECT COUNT(*)
    FROM TB_WORK_ORDER
    WHERE PLANT_CD = #{plantCode}
      AND ORDER_DATE BETWEEN #{fromDate} AND #{toDate}
    <if test="status != null and status != ''">
      AND STATUS = #{status}
    </if>
</select>
```

### 7.3 Java Service에서의 grids 접근

```java
// BPMN의 JavaServiceTask에서 호출되는 Spring Bean
@Service
public class WorkOrderService {

    /**
     * BPMN에서 호출:
     *   class = workOrderService
     *   method = saveRows
     *   input = master, userId   (master는 grids의 gridId, userId는 meta에서)
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> saveRows(List<Map<String, Object>> master, String userId) {
        int affected = 0;

        for (var row : master) {
            var status = MapUtils.getString(row, "rowStatus");
            switch (status) {
                case "C" -> affected += insertWorkOrder(row, userId);
                case "U" -> affected += updateWorkOrder(row, userId);
                case "D" -> affected += deleteWorkOrder(row);
            }
        }

        return Map.of("affectedRows", affected);
    }
}
```

> grids의 각 gridId가 그대로 ServiceContext의 키가 되므로, BPMN input 매핑에서 `master`로 참조하면 해당 그리드의 rows 리스트가 전달된다.

---

## 8. 모듈별 프로젝트 구조 (변경 후)

```
dmes-operation/
├── build.gradle
├── Dockerfile
└── src/main/
    ├── java/com/dongkuk/dmes/operation/
    │   ├── OperationApplication.java       # Spring Boot 메인
    │   ├── config/
    │   │   └── OperationConfig.java        # 모듈 고유 설정 (필요 시)
    │   ├── service/                        # BPMN JavaServiceTask에서 호출할 Spring Bean
    │   │   ├── WorkOrderService.java
    │   │   ├── ProductionService.java
    │   │   └── SchedulingService.java
    │   └── client/                         # 타 모듈 호출 (필요 시)
    │       └── LogisticsModuleClient.java
    └── resources/
        ├── application.yml                  # 설정 (SecurityConfig URL 패턴 등)
        ├── services/                        # ★ BPMN 프로세스 정의 (serviceId 단위)
        │   ├── workorder.bpmn              # action 게이트웨이로 search/save/delete 분기
        │   ├── result.bpmn                 # 생산실적
        │   └── plan.bpmn                   # 스케줄링
        └── persistence/                     # ★ MyBatis SQL
            ├── workorder/
            │   └── WorkOrderMapper.xml
            ├── production/
            │   └── ProductionMapper.xml
            └── scheduling/
                └── SchedulingMapper.xml
```

### 기존 대비 제거된 것

```diff
  dmes-operation/
    src/main/java/.../operation/
-     ├── workorder/
-     │   └── WorkOrderController.java      ← 삭제 (OasisController 공통 Controller로 대체)
-     ├── production/
-     │   └── ProductionController.java      ← 삭제
-     └── scheduling/
-         └── SchedulingController.java      ← 삭제
+     └── service/                           ← BPMN에서 호출할 Service Bean만 남음
+         ├── WorkOrderService.java
+         ├── ProductionService.java
+         └── SchedulingService.java
```

---

## 9. 신규 화면 추가 시 작업 목록

OasisController 방식에서 새 화면(API)을 추가할 때 필요한 작업:

```
1. BPMN 파일 작성          services/newscreen.bpmn (action 게이트웨이 포함)
2. MyBatis Mapper 작성      persistence/newscreen/NewScreenMapper.xml
3. SecurityConfig URL 패턴 등록 (필요 시)
4. (필요 시) Service Bean 작성   NewScreenService.java

→ Controller 작성 불필요
→ DTO 작성 불필요
→ 프론트에서 executeService('operation', 'newscreen', 'search', { meta, params }) 호출
```

### 작업량 비교

| 작업 | 기존 (모듈별 Controller) | 변경 (공통 Controller) |
|------|------------------------|---------------------|
| Controller 클래스 | 1개 필요 | **불필요** |
| 요청/응답 DTO | 화면별 필요 | **불필요** (Map 기반) |
| BPMN 파일 | 필요 | 필요 (동일) |
| MyBatis Mapper | 필요 | 필요 (동일) |
| Service Bean | 필요 | 필요 시에만 |
| SecurityConfig URL 패턴 | - | 필요 시 추가 |
| **합계** | 파일 4~5개 | **파일 2~3개** |

---

## 10. 특수 케이스 처리

### 10.1 파일 업로드/다운로드

파일 처리는 OasisController와 별도로 전용 Controller를 Cactus에 제공한다.

```java
@RestController
@RequestMapping("/api/file")
public class CactusFileController {

    @PostMapping("/upload")
    public CactusResponse upload(@RequestParam("file") MultipartFile file,
                                  @RequestParam Map<String, String> params) { ... }

    @GetMapping("/download/{fileId}")
    public ResponseEntity<Resource> download(@PathVariable String fileId) { ... }
}
```

### 10.2 실시간 데이터 (WebSocket/SSE)

모니터링 등 실시간 데이터는 별도 전용 Controller를 모듈에서 작성한다.

```java
// 이런 특수한 경우에만 모듈에서 직접 Controller 작성
@RestController
@RequestMapping("/api/monitor")
public class MonitoringController {

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map>> stream() { ... }
}
```

### 10.3 외부 시스템 연동 (Webhook/Callback)

ERP 등 외부 시스템에서 호출하는 webhook도 OasisController로 처리 가능.

```
POST /api/interface/erp-order/sync
{
  "meta": { "userId": "system", "menuId": "IF001" },
  "params": { "source": "ERP" },
  "grids": {
    "orders": {
      "rows": [{ "erpOrderNo": "ERP001", ... }]
    }
  }
}
```

---

## 11. 보안 고려사항

### 11.1 serviceId 검증

임의의 serviceId로 호출하여 의도하지 않은 BPMN을 실행하는 것을 방지한다.

```java
// OasisServiceExecutor 내부에서 검증
public CactusResponse execute(String serviceGroup, String serviceId, String action, CactusRequest request) {
    // 1. serviceId 형식 검증 (알파벳, 숫자, 하이픈만 허용)
    if (!serviceId.matches("^[a-zA-Z0-9\\-]+$")) {
        throw new BusinessException(ErrorCode.INVALID_PARAMETER, "잘못된 서비스 ID");
    }

    // 2. BPMN 존재 여부는 OASIS ServiceStarter가 확인
    //    → 미등록 서비스 실행 시 예외 발생 → CactusResponse 에러로 변환
}
```

> SecurityConfig의 URL 패턴 인가와 함께 이중 방어한다.

### 11.2 payload 크기 제한

```yaml
# application.yml
spring:
  servlet:
    multipart:
      max-request-size: 10MB
  codec:
    max-in-memory-size: 10MB
```

### 11.3 서비스 접근 제어 (SecurityConfig)

```java
// SecurityConfig에서 URL 패턴 기반으로 접근을 제어한다.
// 별도 화이트리스트 파일 없이 Spring Security의 표준 메커니즘을 사용한다.
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/production/**").hasAnyRole("PRODUCTION", "ADMIN")
    .requestMatchers("/api/quality/**").hasAnyRole("QUALITY", "ADMIN")
    .requestMatchers("/api/**").authenticated()
);
```

---

## 12. 정리: 전체 아키텍처 변경

```
변경 전:
  Browser → BFF → Controller(모듈별) → Executor → OASIS → BPMN
                   ↑
             화면마다 1개씩 작성

변경 후:
  Browser → BFF → OasisController(공통 1개) → OasisServiceExecutor → OASIS → BPMN
                   ↑
             Cactus에 포함, 코드 작성 불필요

요청/응답 표준:
  CactusRequest { meta, params, grids } → 변환 → OASIS → 변환 → CactusResponse { meta, data, grids }

모듈 개발자가 하는 일:
  1. BPMN 파일 작성 (프로세스 흐름 정의, action 게이트웨이 포함)
  2. MyBatis Mapper XML 작성 (SQL)
  3. SecurityConfig URL 패턴 등록 (필요 시)
  4. (필요 시) Service Bean 작성 (비즈니스 로직)
```
