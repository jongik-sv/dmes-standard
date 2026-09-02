# OasisController 상세 설계 — OASIS 공통 컨트롤러

> 버전: 1.0.0
> 일시: 2026-03-25 (원본) / 2026-04-26 (현행 사실 박스)
> 상태: 마이그레이션 완료 (2026-04-26)
> 관련 문서: [CACTUS_ARCHITECTURE.md](./CACTUS_ARCHITECTURE.md), [01-데이터포맷-명세.md](./01-데이터포맷-명세.md), [05-개발-상세설계.md](./05-개발-상세설계.md)
>
> **현행 사실 (마이그레이션 완료, 2026-04-26)**
> - 패키지: `com.dongkuk.dmes.cactus.oasis.OasisController` 로 정착.
> - **OasisController 매핑은 `/oasis/{serviceId}/{action}` 으로 고정** (옛 `/${cactus.oasis.service-group}/api` 매핑은 폐기).
> - `cactus.oasis.service-group` 프로퍼티는 매핑 prefix 가 아니라 BPMN 라우팅/로깅 식별 용도로만 유지된다.
> - BFF 컨벤션: UI→BFF `/api/{module}/oasis/{serviceId}/{action}`, BFF→BE 는 그대로 `/oasis/{serviceId}/{action}` 전달. REST 는 `/api/{module}/nooasis/{path}`.

---

## 1. 개요

### 1.1 목적

모든 MES 화면 API를 **단일 엔드포인트**로 처리하는 공통 컨트롤러를 설계한다.
각 업무 모듈(portal, operation, logistics 등)에서 컨트롤러를 직접 작성하지 않고,
URL 패턴만으로 OASIS BPMN 서비스를 호출할 수 있도록 한다.

### 1.2 설계 원칙

- **단일 진입점**: 모든 화면 API가 `OasisController` → `OasisServiceExecutor` → OASIS 순서로 흐른다
- **CactusRequest/CactusResponse 표준**: 데이터포맷 명세를 그대로 준수한다
- **URL 기반 라우팅**: 별도 action 필드 없이 URL 패턴으로 서비스와 액션을 결정한다
- **관심사 분리**: 컨트롤러는 HTTP 매핑만, 변환은 Converter, 실행은 Executor가 담당한다

### 1.3 기존 코드 분석 (ksm 프로젝트)

현재 ksm 프로젝트의 컨트롤러 패턴:

```java
// MemberServiceController.java — 개별 엔드포인트 방식
@RequestMapping("/join")
public TypedObject join(String id, String name) {
    Map<String, TypedObject> scc = new HashMap<>();
    scc.put("id", new TypedObject(id));
    scc.put("name", new TypedObject(name));
    ServiceContext sc = new DefaultServiceContext(scc);
    ServiceResult start = serviceStarter.start("joinMember", sc);
    return start.result("joinedMember");
}

// UserServiceController.java — PathVariable 방식
@RequestMapping("/memberService/{action}")
public PlainServiceResult memberService(String id, String name, @PathVariable String action) {
    Map<String, TypedObject> scc = new HashMap<>();
    scc.put("id", new TypedObject(id));
    scc.put("name", new TypedObject(name));
    scc.put("action", new TypedObject(action));
    ServiceContext sc = new DefaultServiceContext(applicationContext, scc);
    return new PlainServiceResult(serviceStarter.start("member", sc));
}
```

**문제점:**

| 문제 | 설명 |
|------|------|
| 반복 코드 | 매 컨트롤러마다 `Map<String, TypedObject>` 변환, `ServiceContext` 생성 반복 |
| 비표준 입출력 | `TypedObject`, `PlainServiceResult`를 직접 반환 → 프론트 파싱 불일치 |
| 예외 처리 없음 | OASIS 예외가 그대로 500으로 전파 |
| txId 없음 | 요청 추적 불가 |

**OasisController가 해결하는 것:**

| 해결 | 방법 |
|------|------|
| 반복 코드 제거 | 단일 공통 컨트롤러가 모든 화면 API 처리 |
| 표준 입출력 | CactusRequest → 변환 → OASIS → 변환 → CactusResponse |
| 예외 처리 | OasisServiceExecutor에서 OASIS 예외 → CactusResponse 에러 변환 |
| 요청 추적 | TxIdFilter + OasisServiceExecutor에서 txId 생성/MDC 관리 |

---

## 2. 전체 흐름

```
프론트엔드
  │
  │  POST /api/{serviceGroup}/{serviceId}/{action}
  │  Body: CactusRequest { meta, params, grids }
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  TxIdFilter                                          │
│  → 임시 UUID를 MDC["txId"]에 설정                    │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OasisController                                     │
│  @RequestMapping("/oasis")                           │
│  @PostMapping("/{serviceId}/{action}")               │
│  → executor.execute(serviceId, action, request)      │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OasisServiceExecutor                                │
│                                                      │
│  1. txId 생성 (userId-menuId-yyyyMMddHHmmss-xxx)    │
│  2. MDC["txId"] 교체 (임시 UUID → 정식 txId)         │
│  3. CactusRequestConverter.convert()                 │
│     → CactusRequest → Map<String, TypedObject>       │
│  4. ServiceContext 생성                               │
│     → SpringApplicationContext + TypedObject Map      │
│  5. serviceStarter.start(serviceId, serviceContext)   │
│     → OASIS BPMN 서비스 실행                          │
│  6. CactusResponseConverter.convert()                │
│     → ServiceResult → CactusResponse                 │
│  7. 예외 처리                                         │
│     → BusinessException, OASIS 예외 → 에러 응답       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  OASIS Core (oasis-core:5.0.0)                       │
│                                                      │
│  ServiceStarter → ProcessStarter → ElementExecutor   │
│  → Executable (Java/SQL/Procedure/SubProcess)        │
│  → FlowPicker → 다음 Element                        │
│  → ServiceResult 반환                                │
└─────────────────────────────────────────────────────┘
```

---

## 3. URL 설계

### 3.1 URL 패턴 (BE 기준)

```
POST /oasis/{serviceId}/{action}
```

| 세그먼트 | 역할 | 예시 |
|----------|------|------|
| `serviceId` | BPMN 프로세스 ID와 매핑. OASIS `serviceStarter.start()`에 전달 | `workorder`, `inspection`, `shipment` |
| `action` | 액션. ServiceContext에 `action` 키로 전달 → BPMN 게이트웨이 분기 | `search`, `save`, `delete`, `detail` |

> 참고: `cactus.oasis.service-group` 프로퍼티는 매핑 prefix 가 아니라 **BPMN 라우팅/로깅 식별** 용도로만 유지된다.
> BFF→BE 호출은 모듈별로 그대로 `/oasis/{serviceId}/{action}` 을 호출한다.

### 3.1.1 BFF 컨벤션 (UI ↔ BFF ↔ BE)

| 구간 | URL 패턴 |
|------|----------|
| UI → BFF (OASIS) | `POST /api/{module}/oasis/{serviceId}/{action}` |
| UI → BFF (REST 등 비-OASIS) | `POST /api/{module}/nooasis/{path}` |
| BFF → BE (OASIS) | `POST /oasis/{serviceId}/{action}` (그대로 전달) |
| BFF → BE (비-OASIS) | `POST /{path}` (`/api/{module}/nooasis/` segment 만 제거) |

### 3.2 URL 예시

| 화면 | UI→BFF URL | BFF→BE URL | serviceId | action |
|------|------------|------------|-----------|--------|
| 작업지시 조회 | `POST /api/operation/oasis/workorder/search` | `POST /oasis/workorder/search` | `workorder` | `search` |
| 작업지시 저장 | `POST /api/operation/oasis/workorder/save` | `POST /oasis/workorder/save` | `workorder` | `save` |
| 검사 상세 | `POST /api/quality/oasis/inspection/detail` | `POST /oasis/inspection/detail` | `inspection` | `detail` |
| 출하 실행 | `POST /api/logistics/oasis/shipment/execute` | `POST /oasis/shipment/execute` | `shipment` | `execute` |

### 3.3 BPMN 서비스와의 매핑

```
URL:  POST /oasis/workorder/search
                  │         │
                  │         └─ action="search" → ServiceContext에 전달
                  └─ serviceId="workorder" → serviceStarter.start("workorder", sc)

(`cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지)

BPMN:  workorder.bpmn
       ├── StartEvent
       ├── ExclusiveGateway (action == "search" ? / action == "save" ? / ...)
       │   ├── [search] → SqlScriptTask (SELECT ...) → EndEvent
       │   ├── [save]   → JavaServiceTask (validate) → SqlScriptTask (INSERT/UPDATE) → EndEvent
       │   └── [delete] → SqlScriptTask (DELETE ...) → EndEvent
       └── ErrorBoundaryEvent → UserExceptionEndEvent
```

---

## 4. 클래스 상세

### 4.1 OasisController.java

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

---

### 4.2 OasisServiceExecutor.java

```java
package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.cactus.web.exception.BusinessException;
import com.dongkuk.dmes.cactus.web.exception.ErrorCode;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.context.SpringApplicationContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;

import java.util.Map;

/**
 * CactusRequest → OASIS 서비스 실행 → CactusResponse 전체 흐름을 담당한다.
 *
 * 책임:
 * 1. txId 생성 및 MDC 교체
 * 2. CactusRequest → OASIS 입력 변환 (CactusRequestConverter)
 * 3. OASIS ServiceStarter를 통한 BPMN 서비스 실행
 * 4. OASIS ServiceResult → CactusResponse 변환 (CactusResponseConverter)
 * 5. 예외 처리 및 에러 응답 생성
 */
public class OasisServiceExecutor {

    private static final Logger log = LoggerFactory.getLogger(OasisServiceExecutor.class);

    private final ServiceStarter serviceStarter;
    private final ApplicationContext springApplicationContext;
    private final CactusRequestConverter requestConverter;
    private final CactusResponseConverter responseConverter;

    public OasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        this.serviceStarter = serviceStarter;
        this.springApplicationContext = springApplicationContext;
        this.requestConverter = requestConverter;
        this.responseConverter = responseConverter;
    }

    /**
     * 서비스를 실행하고 CactusResponse를 반환한다.
     *
     * @param serviceId BPMN 서비스 ID
     * @param action    액션 (search, save, delete 등)
     * @param request   CactusRequest
     * @return CactusResponse
     *
     * 참고: serviceGroup 은 매핑 PathVariable 에서 제거되어 더 이상 인자로 전달하지 않는다.
     *       로깅용 식별자가 필요하면 properties (`cactus.oasis.service-group`) 로 주입한다.
     */
    public CactusResponse execute(
            String serviceId, String action, CactusRequest request) {

        RequestMeta reqMeta = request.getMeta();
        String txId = TxIdGenerator.generate(reqMeta.getUserId(), reqMeta.getMenuId());

        // MDC의 임시 UUID를 정식 txId로 교체
        MDC.put("txId", txId);

        log.info("{}/{}", serviceId, action);

        try {
            // 1. CactusRequest → Map<String, TypedObject>
            Map<String, TypedObject> inputs = requestConverter.convert(request, action);

            // 2. ServiceContext 생성
            com.dongkuk.oasis.context.ApplicationContext oasisAppCtx =
                    new SpringApplicationContext(springApplicationContext);
            ServiceContext sc = new DefaultServiceContext(oasisAppCtx, inputs);

            // 3. OASIS BPMN 서비스 실행
            ServiceResult result = serviceStarter.start(serviceId, sc);

            // 4. ServiceResult → CactusResponse
            return responseConverter.convert(result, txId);

        } catch (BusinessException e) {
            log.warn("[{}] BusinessException: {}", txId, e.getMessage());
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, e.getErrorCode().getCode(), e.getMessage()))
                    .errors(e.getErrors())
                    .build();

        } catch (Exception e) {
            log.error("[{}] Unexpected error", txId, e);
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, ErrorCode.UNKNOWN_ERROR.getCode(), e.getMessage()))
                    .build();
        }
    }
}
```

**설계 포인트:**

- 예외를 throw하지 않고 항상 `CactusResponse`를 반환한다. HTTP 200으로 나가되 `meta.success=false`로 에러를 전달.
  단, `GlobalExceptionHandler`가 HTTP 상태코드(400/500)를 설정하는 구조도 병행 가능.
- `MDC.put("txId", txId)`로 임시 UUID를 정식 txId로 교체하여, 이후 모든 로그에 정식 txId가 출력된다.
- OASIS의 `UserExceptionEndEvent` 예외는 `BusinessException`으로 래핑되어 들어올 수 있다.

---

### 4.3 CactusRequestConverter.java

```java
package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.oasis.TypedObject;

import java.util.HashMap;
import java.util.Map;

/**
 * CactusRequest → Map<String, TypedObject> 변환기.
 *
 * OASIS ServiceContext는 Map<String, TypedObject>를 입력으로 받는다.
 * 이 클래스가 CactusRequest의 각 영역을 flat한 TypedObject Map으로 펼친다.
 */
public class CactusRequestConverter {

    /**
     * CactusRequest를 OASIS ServiceContext 입력 형태로 변환한다.
     *
     * 변환 규칙:
     * - action → TypedObject("action")
     * - meta.userId → TypedObject("userId")
     * - meta.menuId → TypedObject("menuId")
     * - params의 각 key-value → TypedObject(key)
     * - grids의 각 gridId → TypedObject(gridId) : List<Map<String, Object>>
     *
     * @param request CactusRequest
     * @param action  URL에서 추출한 액션
     * @return OASIS ServiceContext 입력 Map
     */
    public Map<String, TypedObject> convert(CactusRequest request, String action) {
        Map<String, TypedObject> map = new HashMap<>();

        // action (BPMN 게이트웨이 분기용)
        map.put("action", new TypedObject(action));

        // meta
        RequestMeta meta = request.getMeta();
        if (meta != null) {
            map.put("userId", new TypedObject(meta.getUserId()));
            map.put("menuId", new TypedObject(meta.getMenuId()));
        }

        // params → flat 전개
        if (request.getParams() != null) {
            request.getParams().forEach((key, value) ->
                    map.put(key, new TypedObject(value)));
        }

        // grids → gridId: List<Map> 형태로 전달
        if (request.getGrids() != null) {
            request.getGrids().forEach((gridId, gridData) ->
                    map.put(gridId, new TypedObject(gridData.getRows())));
        }

        return map;
    }
}
```

**변환 흐름 예시:**

```
CactusRequest:
{
  "meta": { "userId": "user01", "menuId": "PROD001" },
  "params": { "plantCd": "P01", "fromDate": "2026-03-01" },
  "grids": {
    "master": { "rows": [{ "rowKey": "tmp-1", "rowStatus": "C", "itemCd": "ITEM-001" }] }
  }
}

↓ convert(request, "save")

Map<String, TypedObject>:
{
  "action"   → TypedObject("save"),
  "userId"   → TypedObject("user01"),
  "menuId"   → TypedObject("PROD001"),
  "plantCd"  → TypedObject("P01"),
  "fromDate" → TypedObject("2026-03-01"),
  "master"   → TypedObject([ { "rowKey": "tmp-1", "rowStatus": "C", "itemCd": "ITEM-001" } ])
}
```

> OASIS BPMN 내부에서는 `${plantCd}`, `${master}` 등으로 프로퍼티 표현식을 통해 접근한다.

---

### 4.4 CactusResponseConverter.java

```java
package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.web.response.*;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ServiceResult → CactusResponse 변환기.
 *
 * OASIS ServiceResult에는 results Map<String, TypedObject>이 들어있다.
 * 이 중 List 타입은 grids로, 나머지 단일 값은 data로 분류한다.
 */
public class CactusResponseConverter {

    /**
     * ServiceResult를 CactusResponse로 변환한다.
     *
     * 변환 규칙:
     * - SUCCESS → results 중 List 타입은 grids, 단일 값은 data에 매핑
     * - USER_ERROR → meta.success=false, code="E001", message=서비스 에러 메시지
     * - SYSTEM_ERROR → meta.success=false, code="S001", message=시스템 에러 메시지
     *
     * @param result OASIS ServiceResult
     * @param txId   트랜잭션 ID
     * @return CactusResponse
     */
    public CactusResponse convert(ServiceResult result, String txId) {
        if (result.serviceResultCode() == ServiceResultCode.SUCCESS) {
            return convertSuccess(result, txId);
        } else {
            return convertError(result, txId);
        }
    }

    @SuppressWarnings("unchecked")
    private CactusResponse convertSuccess(ServiceResult result, String txId) {
        Map<String, Object> data = new HashMap<>();
        Map<String, GridResult> grids = new HashMap<>();

        if (result.results() != null) {
            result.results().forEach((key, typedObject) -> {
                Object value = typedObject.getObject();
                if (value instanceof List) {
                    // List → grids
                    grids.put(key, new GridResult((List<Map<String, Object>>) value));
                } else {
                    // 단일 값 → data
                    data.put(key, value);
                }
            });
        }

        CactusResponse.Builder builder = new CactusResponse.Builder(ResponseMeta.success(txId));
        if (!data.isEmpty()) builder.data(data);
        if (!grids.isEmpty()) builder.grids(grids);
        return builder.build();
    }

    private CactusResponse convertError(ServiceResult result, String txId) {
        String code = (result.serviceResultCode() == ServiceResultCode.USER_ERROR)
                ? "E001" : "S001";
        String message = result.serviceResultMessage() != null
                ? result.serviceResultMessage()
                : "오류가 발생했습니다.";

        return new CactusResponse.Builder(ResponseMeta.error(txId, code, message)).build();
    }
}
```

**변환 흐름 예시:**

```
ServiceResult (SUCCESS):
  results = {
    "list"       → TypedObject([ {orderId: "ORD-001", ...}, {orderId: "ORD-002", ...} ]),
    "totalCount" → TypedObject(150)
  }

↓ convert(result, "user01-PROD001-20260325-a7f")

CactusResponse:
{
  "meta": { "txId": "user01-PROD001-20260325-a7f", "success": true, "code": "0000" },
  "data": { "totalCount": 150 },
  "grids": {
    "list": {
      "rows": [ { "orderId": "ORD-001", ... }, { "orderId": "ORD-002", ... } ]
    }
  }
}
```

---

### 4.5 OasisAutoConfiguration.java

```java
package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.oasis.factories.NonTransactionalServiceStarterFactory;
import com.dongkuk.oasis.factories.SpringTransactionalServiceStarterFactory;
import com.dongkuk.oasis.service.ServiceStarter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OASIS 통합 자동 설정.
 * oasis-core가 classpath에 있을 때만 활성화된다.
 *
 * application.yml:
 *   cactus:
 *     oasis:
 *       service-path: resources/services
 *       transactional: false
 */
@Configuration
@ConditionalOnClass(ServiceStarter.class)
@EnableConfigurationProperties(OasisProperties.class)
public class OasisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(name = "cactus.oasis.transactional", havingValue = "false", matchIfMissing = true)
    public ServiceStarter serviceStarter() {
        return new NonTransactionalServiceStarterFactory().generateServiceStarter();
    }

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(name = "cactus.oasis.transactional", havingValue = "true")
    public ServiceStarter transactionalServiceStarter() {
        return new SpringTransactionalServiceStarterFactory().generateServiceStarter();
    }

    @Bean
    public CactusRequestConverter oasisRequestConverter() {
        return new CactusRequestConverter();
    }

    @Bean
    public CactusResponseConverter oasisResponseConverter() {
        return new CactusResponseConverter();
    }

    @Bean
    public OasisServiceExecutor oasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        return new OasisServiceExecutor(
                serviceStarter, springApplicationContext,
                requestConverter, responseConverter);
    }

    @Bean
    public OasisController oasisController(OasisServiceExecutor executor) {
        return new OasisController(executor);
    }
}
```

---

### 4.6 OasisProperties.java

```java
package com.dongkuk.dmes.cactus.oasis;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OASIS 설정 프로퍼티.
 *
 * application.yml:
 *   cactus:
 *     oasis:
 *       service-path: resources/services
 *       transactional: false
 */
@ConfigurationProperties(prefix = "cactus.oasis")
public class OasisProperties {

    /** BPMN 서비스 정의 파일 경로 */
    private String servicePath = "resources/services";

    /** 트랜잭션 사용 여부 */
    private boolean transactional = false;

    public String getServicePath() { return servicePath; }
    public void setServicePath(String servicePath) { this.servicePath = servicePath; }

    public boolean isTransactional() { return transactional; }
    public void setTransactional(boolean transactional) { this.transactional = transactional; }
}
```

---

## 5. OASIS 연동 상세

### 5.1 OASIS 핵심 API

OasisController가 사용하는 OASIS API:

| 클래스 | 메서드/역할 | 설명 |
|--------|------------|------|
| `ServiceStarter` | `start(serviceId, ServiceContext)` | BPMN 서비스 실행 진입점 |
| `DefaultServiceContext` | 생성자 `(ApplicationContext, Map<String, TypedObject>)` | 실행 컨텍스트 생성 |
| `SpringApplicationContext` | 생성자 `(Spring ApplicationContext)` | Spring ↔ OASIS 컨텍스트 브릿지 |
| `TypedObject` | 생성자 `(Object)` | 값을 OASIS 타입 안전 래퍼로 감싼다 |
| `ServiceResult` | `serviceResultCode()`, `results()`, `serviceResultMessage()` | 실행 결과 |
| `ServiceResultCode` | `SUCCESS`, `USER_ERROR`, `SYSTEM_ERROR` | 결과 코드 enum |

### 5.2 OASIS 실행 흐름 (내부)

```
serviceStarter.start("workorder", serviceContext)
    │
    ▼
CoreServiceStarter
    │  BPMN 로딩: ServiceProvider → "workorder" → workorder.bpmn
    │  언마셜링: CamundaBpmnServiceUnmarshaller → Service 모델
    ▼
CoreProcessStarter
    │  초기 프로세스 실행
    ▼
CoreElementExecutor
    │  StartEvent → Element 순회
    │
    ├── ExclusiveGateway: action == "search"?
    │   ├── [search] SqlScriptTaskExecutable → SELECT 실행
    │   ├── [save]   JavaServiceTaskExecutable → validate() 호출
    │   │            SqlScriptTaskExecutable → INSERT/UPDATE 실행
    │   └── [delete] SqlScriptTaskExecutable → DELETE 실행
    │
    ├── FlowPicker → 다음 Element 결정
    │
    └── EndEvent → ServiceResult 반환
```

### 5.3 BPMN 서비스 정의 예시

```xml
<!-- workorder.bpmn (간략화) -->
<bpmn:process id="workorder">
  <bpmn:startEvent id="start" />

  <bpmn:exclusiveGateway id="actionGateway" />

  <!-- 조회 -->
  <bpmn:serviceTask id="searchTask" camunda:class="...SqlScriptTask">
    <bpmn:extensionElements>
      <camunda:property name="query" value="workorder.selectList" />
      <camunda:property name="plantCd" value="${plantCd}" />
      <camunda:property name="fromDate" value="${fromDate}" />
      <camunda:property name="list" value="${result} -> list" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- 저장 -->
  <bpmn:serviceTask id="saveTask" camunda:class="...JavaServiceTask">
    <bpmn:extensionElements>
      <camunda:property name="class" value="workorderService" />
      <camunda:property name="method" value="saveWorkorders" />
      <camunda:property name="master" value="${master}" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- 분기 조건 -->
  <bpmn:sequenceFlow sourceRef="actionGateway" targetRef="searchTask">
    <bpmn:conditionExpression>${action == 'search'}</bpmn:conditionExpression>
  </bpmn:sequenceFlow>
  <bpmn:sequenceFlow sourceRef="actionGateway" targetRef="saveTask">
    <bpmn:conditionExpression>${action == 'save'}</bpmn:conditionExpression>
  </bpmn:sequenceFlow>

  <bpmn:endEvent id="end" />
</bpmn:process>
```

---

## 6. 데이터 변환 매핑

### 6.1 Request 변환 (프론트 → OASIS)

```
CactusRequest                          Map<String, TypedObject>
─────────────                          ────────────────────────
meta.userId            →               "userId": TypedObject("user01")
meta.menuId            →               "menuId": TypedObject("PROD001")
(URL path)             →               "action": TypedObject("search")
params.plantCd         →               "plantCd": TypedObject("P01")
params.fromDate        →               "fromDate": TypedObject("2026-03-01")
grids.master.rows      →               "master": TypedObject(List<Map>)
```

### 6.2 Response 변환 (OASIS → 프론트)

```
ServiceResult.results                  CactusResponse
─────────────────────                  ────────────────
결과코드 SUCCESS       →               meta.success: true, meta.code: "0000"
결과코드 USER_ERROR    →               meta.success: false, meta.code: "E001"
결과코드 SYSTEM_ERROR  →               meta.success: false, meta.code: "S001"
results["list"] (List) →               grids.list.rows: [...]
results["totalCount"]  →               data.totalCount: 150
```

### 6.3 타입 분류 규칙

| ServiceResult value 타입 | CactusResponse 매핑 | 이유 |
|--------------------------|---------------------|------|
| `List<?>` | `grids.{key}.rows` | 그리드 데이터 |
| 그 외 (String, Number 등) | `data.{key}` | 단건 값, 건수 등 |

---

## 7. 예외 처리

### 7.1 예외 흐름

```
OASIS 내부 예외
    │
    ├── UserExceptionEndEvent → ServiceResultCode.USER_ERROR
    │   → CactusResponseConverter에서 E001 코드로 변환
    │
    ├── 시스템 예외 → ServiceResultCode.SYSTEM_ERROR
    │   → CactusResponseConverter에서 S001 코드로 변환
    │
    └── Java 예외 (OASIS 밖에서 발생)
        │
        ├── BusinessException → OasisServiceExecutor catch
        │   → e.getErrorCode().getCode() + e.getErrors() 포함 응답
        │
        └── 기타 Exception → OasisServiceExecutor catch
            → ErrorCode.UNKNOWN_ERROR (S999) 응답
```

### 7.2 에러 응답 예시

```json
// 비즈니스 에러 (유효성 검증 실패)
{
  "meta": { "txId": "user01-PROD001-20260325-a7f", "success": false, "code": "E001", "message": "필수값이 누락되었습니다." },
  "errors": [
    { "grid": "master", "rowKey": "tmp-1", "field": "itemCd", "code": "E001", "message": "품목코드는 필수입니다." },
    { "grid": "master", "rowKey": "tmp-2", "field": "qty", "code": "E002", "message": "수량은 0보다 커야 합니다." }
  ]
}

// 시스템 에러
{
  "meta": { "txId": "user01-PROD001-20260325-a7f", "success": false, "code": "S001", "message": "서버 내부 오류가 발생했습니다." }
}
```

---

## 8. 기존 ksm 코드 → OasisController 마이그레이션

### 8.1 Before: 개별 컨트롤러 (ksm 방식)

```java
// 매 화면마다 컨트롤러 + 메서드 작성
@RestController
public class MemberServiceController {
    private final ServiceStarter serviceStarter;

    @RequestMapping("/join")
    public TypedObject join(String id, String name) {
        Map<String, TypedObject> scc = new HashMap<>();
        scc.put("id", new TypedObject(id));
        scc.put("name", new TypedObject(name));
        ServiceContext sc = new DefaultServiceContext(scc);
        ServiceResult start = serviceStarter.start("joinMember", sc);
        return start.result("joinedMember");
    }
}
```

### 8.2 After: OasisController (Cactus 방식)

```
1. 컨트롤러 작성 불필요 — OasisController가 자동 처리
2. BPMN 파일만 작성하면 API가 자동으로 열림

프론트엔드:
  POST /api/member/joinMember/join
  Body: {
    "meta": { "menuId": "MBR001" },
    "params": { "id": "user01", "name": "홍길동" }
  }

응답:
  {
    "meta": { "txId": "...", "success": true, "code": "0000" },
    "data": { "joinedMember": { ... } }
  }
```

### 8.3 마이그레이션 체크리스트

| 단계 | 작업 | 설명 |
|------|------|------|
| 1 | BPMN 서비스 ID 확인 | 기존 `serviceStarter.start("joinMember", ...)` → serviceId = `joinMember` |
| 2 | 파라미터 매핑 | 기존 개별 파라미터 → CactusRequest.params로 통합 |
| 3 | 응답 매핑 | 기존 TypedObject/PlainServiceResult → CactusResponse 자동 변환 |
| 4 | 프론트 URL 변경 | 기존 `/join` → `POST /api/{group}/{serviceId}/{action}` |
| 5 | 기존 컨트롤러 삭제 | OasisController가 대체하므로 개별 컨트롤러 불필요 |

---

## 9. 설정

### 9.1 application.yml

```yaml
cactus:
  oasis:
    service-path: resources/services       # BPMN 파일 경로
    transactional: false                  # 기본 비트랜잭션, true 시 Spring 트랜잭션 통합
```

### 9.2 AutoConfiguration 등록

```
# src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration
```

### 9.3 Bean 등록 흐름

```
@ConditionalOnClass(ServiceStarter.class)  ← oasis-core가 classpath에 있을 때만
    │
    ├── ServiceStarter Bean (Non-transactional 또는 Transactional)
    ├── CactusRequestConverter Bean
    ├── CactusResponseConverter Bean
    ├── OasisServiceExecutor Bean
    └── OasisController Bean
```

---

## 10. 클래스 관계도

```
┌─────────────────────────────────────────────────────────────────┐
│  com.dongkuk.dmes.cactus.oasis                                       │
│                                                                  │
│  ┌──────────────┐      ┌────────────────────┐                   │
│  │OasisController│─────→│OasisServiceExecutor │                   │
│  │  (HTTP 매핑)  │      │  (실행 오케스트레이터)│                   │
│  └──────────────┘      └──────┬───┬─────────┘                   │
│                               │   │                              │
│              ┌────────────────┘   └────────────────┐             │
│              ▼                                      ▼             │
│  ┌─────────────────────┐          ┌──────────────────────────┐  │
│  │CactusRequestConverter│          │CactusResponseConverter    │  │
│  │  CactusRequest       │          │  ServiceResult            │  │
│  │  → Map<TypedObject>  │          │  → CactusResponse         │  │
│  └─────────────────────┘          └──────────────────────────┘  │
│                                                                  │
│  ┌───────────────────┐  ┌──────────────┐                        │
│  │OasisAutoConfig     │  │OasisProperties│                        │
│  │  (Bean 등록)       │  │  (설정값)     │                        │
│  └───────────────────┘  └──────────────┘                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  OASIS Core (oasis-core:5.0.0)                                   │
│                                                                  │
│  ServiceStarter ← DefaultServiceContext ← SpringApplicationContext│
│       │                                                          │
│       ▼                                                          │
│  CoreServiceStarter → CoreProcessStarter → CoreElementExecutor   │
│       │                                                          │
│       ▼                                                          │
│  ServiceResult (SUCCESS / USER_ERROR / SYSTEM_ERROR)             │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│  com.dongkuk.dmes.cactus.web (데이터 포맷)                            │
│                                                                  │
│  request/                        response/                       │
│  ├── CactusRequest               ├── CactusResponse              │
│  ├── RequestMeta                 ├── ResponseMeta                │
│  ├── GridData                    ├── GridResult                  │
│  └── RowStatus                   ├── ColumnMeta                  │
│                                  ├── ErrorDetail                 │
│  converter/                      └── ApiResponse                 │
│  └── GridConverter                                               │
│                                                                  │
│  exception/                      filter/                         │
│  ├── GlobalExceptionHandler      └── TxIdFilter                  │
│  ├── BusinessException                                           │
│  └── ErrorCode                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Phase 7 — Query / Service / Lov 컨벤션 (현 구현)

> [현 구현 반영 — 2026-04-26]
> 본 절은 OasisController(`/oasis/{serviceId}/{action}`) 외에 cactus-core 가 실제 제공하는 **Phase 7 Inbound 진입 컨트롤러 3 종**을 명세한다. 클래스/매핑은 코드와 1:1 일치하며, BFF↔BE 매핑 표는 루트 `CLAUDE.md` "Phase 7 신규 컨벤션" 과 동일하다.

### 11.1 등록 위치

- 패키지: `com.dongkuk.dmes.cactus.web.inbound`
- 자동 설정: `InboundAutoConfiguration`
- 산출 빈:
  - `OasisController` — `OasisServiceExecutor` 빈 존재 시
  - `QueryController` — `SqlSession` 빈 존재 시 (cactus-core 는 mybatis 를 compileOnly)
  - `ServiceController` — `OasisServiceExecutor` 빈 존재 시
  - `LovController` — `SqlSession` + `OasisServiceExecutor` 둘 다 존재 시 (`MasterCodeProvider` 는 `ObjectProvider` 로 옵션)

소비 모듈이 제공하는 빈에 따라 일부만 활성화될 수 있다 (예: SqlSession 만 있는 모듈은 QueryController 만 등록).

### 11.2 BE 실제 매핑 (코드 기준)

| 컨트롤러 | HTTP | 경로 | 핸들러 |
|---|---|---|---|
| `QueryController` | POST | `/query/{queryId}` | MyBatis statement ID 로 단순 조회 (read-only). body / query string 파라미터 병합 (body 우선) |
| `ServiceController` | POST | `/service/{serviceId}` | OASIS 서비스 실행 (action=`execute`) |
| `ServiceController` | POST | `/query/service/{serviceId}` | OASIS 서비스 조회 (action=`query`) |
| `LovController` | GET | `/lov/master/{code}` | 마스터 코드 LoV (group=ROOT) |
| `LovController` | GET | `/lov/master/{code}/{group}` | 마스터 코드 LoV (그룹 분류 포함) |
| `LovController` | POST | `/lov/query/{queryId}` | MyBatis 쿼리 LoV |
| `LovController` | POST | `/lov/service/{serviceId}` | OASIS 서비스 LoV (action=`lov`) |

응답:
- `QueryController` / `LovController.master` / `LovController.query` → `ApiResponse<List<...>>` (단순 REST 래퍼)
- `ServiceController.*` / `LovController.service` → `CactusResponse` (meta + data + grids + errors 구조)

### 11.3 BFF ↔ BE 경로 매핑

UI/BFF 단에서 `/api/{module}/` prefix 만 떼고 `${module_url}` 로 그대로 전달하는 정책은 기존 rest 프록시와 동일하다.

| 의미 | UI → BFF | BFF → BE |
|---|---|---|
| 쿼리 (mybatis) | `/api/{module}/query/{queryId}` | `/query/{queryId}` |
| 쿼리 via OASIS service | `/api/{module}/query/service/{serviceId}` | `/query/service/{serviceId}` |
| 트랜잭션 service | `/api/{module}/service/{serviceId}` | `/service/{serviceId}` |
| LoV master code | `/api/{module}/lov/master/{code}` | `/lov/master/{code}` |
| LoV master code (group) | `/api/{module}/lov/master/{code}/{group}` | `/lov/master/{code}/{group}` |
| LoV (mybatis) | `/api/{module}/lov/query/{queryId}` | `/lov/query/{queryId}` |
| LoV (service) | `/api/{module}/lov/service/{serviceId}` | `/lov/service/{serviceId}` |

기존 OASIS 진입점(`/oasis/{serviceId}/{action}`) 은 그대로 유지되며, Phase 7 은 추가 컨벤션이다.

### 11.4 인증 헤더 / 환경변수

- 인증 헤더 4 종 (`Authorization`, `X-Client-Key`, `X-Authenticated-User`, `X-Authenticated-Role`) 정책은 기존 rest/oasis 프록시와 동일.
- 환경변수 우선순위: `${MODULE}_WAS_URL` → `BACKEND_API_URL`.
- BE 측 헤더 검증은 `ClientKeyFilter` (헤더명 `X-Client-Key`, env `BACKEND_CLIENT_KEY`) 가 담당한다.

### 11.5 보조 클래스

- `Lov` — LoV 응답 DTO (`code`, `name`, `group` 등의 표준 필드).
- `MasterCodeProvider` — 마스터 코드 LoV 조회를 소비 모듈이 구현하는 SPI. cactus-core 본체에는 기본 구현이 없으며, `LovController.lovMaster` 호출 시 빈이 없으면 `BusinessException(UNKNOWN_ERROR)` 로 응답한다.

### 11.6 FE 호출 헬퍼

FE 는 가급적 `@dk-oasis/shared/http` 의 헬퍼를 사용한다 (수동 path 조립 지양):

- `apiQuery(queryId, params)` → `/api/{module}/query/{queryId}`
- `apiQueryService(serviceId, request)` → `/api/{module}/query/service/{serviceId}`
- `apiService(serviceId, request)` → `/api/{module}/service/{serviceId}`
- `apiLovMaster(code, group?)` → `/api/{module}/lov/master/{code}[/{group}]`
- `apiLovQuery(queryId, params)` → `/api/{module}/lov/query/{queryId}`
- `apiLovService(serviceId, request)` → `/api/{module}/lov/service/{serviceId}`
