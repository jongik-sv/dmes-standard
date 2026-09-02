# 03. OASIS 통합 레이어

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지(매핑 prefix 아님).
> - BFF 컨벤션: UI→BFF 는 `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{serviceId}/{action}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.

## 1. 개요

OASIS 5.0은 BPMN 기반 서비스 엔진으로, 업무 로직을 서비스 그룹/서비스 ID/액션으로 라우팅한다.
Cactus Core의 OASIS 통합 레이어는 **JSON(CactusRequest) → OASIS VariableList → JSON(CactusResponse)** 변환을 담당한다.

## 2. 요청 흐름

```
Client (React/BFF)
  │
  │ POST /oasis/{serviceId}/{action}     (BE 기준)
  │ Body: CactusRequest (JSON)
  │
  ▼
OasisController
  │
  ├─ 1. CactusRequestConverter.convert(request)
  │     → CactusRequest → OASIS VariableList
  │
  ├─ 2. OasisServiceExecutor.execute(serviceId, action, variableList)
  │     → OASIS BpmService 호출 (BPMN 프로세스 실행)
  │
  ├─ 3. CactusResponseConverter.convert(resultVariableList)
  │     → OASIS VariableList → CactusResponse
  │
  └─ 4. ResponseEntity<CactusResponse> 반환
```

## 3. URL 설계

### 3.1 기본 패턴 (BE 기준)

```
POST /oasis/{serviceId}/{action}
```

| 경로변수 | 설명 | 예시 |
|----------|------|------|
| serviceId | 서비스 ID (BPMN 서비스 ID) | `orderMgt`, `stockInquiry` |
| action | 실행할 액션 | `search`, `save`, `delete`, `detail`, `approve` |

> 참고: `cactus.oasis.service-group` 프로퍼티는 매핑 prefix 가 아니라 BPMN 라우팅/로깅 식별 용도로만 유지된다.

### 3.1.1 BFF 컨벤션

| 구간 | URL 패턴 |
|------|----------|
| UI → BFF (OASIS) | `POST /api/{module}/oasis/{serviceId}/{action}` |
| UI → BFF (REST 등 비-OASIS) | `POST /api/{module}/nooasis/{path}` |
| BFF → BE (OASIS) | `POST /oasis/{serviceId}/{action}` (그대로 전달) |
| BFF → BE (비-OASIS) | `POST /{path}` (`/api/{module}/nooasis/` segment 만 제거) |

### 3.2 URL 예시

| 화면 | UI→BFF URL | BFF→BE URL |
|------|------------|------------|
| 주문 목록 조회 | `POST /api/{module}/oasis/orderMgt/search` | `POST /oasis/orderMgt/search` |
| 주문 저장 | `POST /api/{module}/oasis/orderMgt/save` | `POST /oasis/orderMgt/save` |
| 재고 조회 | `POST /api/{module}/oasis/stockInquiry/search` | `POST /oasis/stockInquiry/search` |
| 품질 검사 승인 | `POST /api/{module}/oasis/inspection/approve` | `POST /oasis/inspection/approve` |

### 3.3 단일 POST 설계 이유

- OASIS BPMN은 서비스 그룹 + 서비스 ID + 액션으로 라우팅
- RESTful 자원 모델보다 **RPC 스타일**이 OASIS 엔진과 자연스럽게 매핑
- 모든 요청이 동일한 `CactusRequest` 포맷 → 컨트롤러 하나로 통일 가능

## 4. 핵심 클래스

### 4.1 OasisController

단일 진입점. 모든 업무 요청을 받아 OASIS 서비스를 실행한다.

```java
@RestController
@RequestMapping("/oasis")
public class OasisController {

    @PostMapping("/{serviceId}/{action}")
    public ResponseEntity<CactusResponse> execute(
            @PathVariable String serviceId,
            @PathVariable String action,
            @RequestBody CactusRequest request) {

        // 1. meta에 action 설정 (URL 경로에서 추출)
        request.getMeta().setAction(action);

        // 2. CactusRequest → OASIS VariableList 변환
        VariableList variableList = requestConverter.convert(request);

        // 3. OASIS 서비스 실행
        VariableList result = serviceExecutor.execute(
            serviceGroup, serviceId, action, variableList);

        // 4. OASIS VariableList → CactusResponse 변환
        CactusResponse response = responseConverter.convert(result, request);

        return ResponseEntity.ok(response);
    }
}
```

### 4.2 CactusRequestConverter

`CactusRequest`를 OASIS `VariableList`로 변환한다.

**변환 규칙**:

| CactusRequest | OASIS VariableList |
|---------------|-------------------|
| `meta.*` | `Variable` (개별 변수) |
| `params.*` | `Variable` (개별 변수) |
| `grids.ds_xxx.rows` | `Dataset "ds_xxx"` → Row 목록 |
| `grids.ds_xxx.rows[].rowStatus` | Row의 `rowType` (C→INSERT, U→UPDATE, D→DELETE) |

```java
public class CactusRequestConverter {

    public VariableList convert(CactusRequest request) {
        VariableList vl = new VariableList();

        // params → Variable
        if (request.getParams() != null) {
            request.getParams().forEach((key, value) ->
                vl.add(new Variable(key, value)));
        }

        // grids → Dataset
        if (request.getGrids() != null) {
            request.getGrids().forEach((dsName, gridData) -> {
                Dataset ds = new Dataset(dsName);
                // columnMeta → ColumnHeader
                // rows → Row (rowStatus → rowType 매핑)
                vl.add(ds);
            });
        }

        return vl;
    }
}
```

### 4.3 CactusResponseConverter

OASIS `VariableList`를 `CactusResponse`로 변환한다.

**변환 규칙**:

| OASIS VariableList | CactusResponse |
|-------------------|----------------|
| `Variable "ErrorCode"` | `meta.resultCode` |
| `Variable "ErrorMsg"` | `meta.message` |
| `Dataset "ds_xxx"` | `grids.ds_xxx` → GridResult |
| Dataset의 ColumnHeader | `grids.ds_xxx.columnMeta` |
| Dataset의 Row | `grids.ds_xxx.rows` |

### 4.4 OasisServiceExecutor

OASIS BPMN 서비스를 실행하는 어댑터.

```java
public class OasisServiceExecutor {

    private final OasisBpmService bpmService;

    public VariableList execute(String serviceGroup, String serviceId,
                                 String action, VariableList input) {
        // OASIS BPMN 서비스 정의 조회 및 실행
        String fullServiceId = serviceGroup + "." + serviceId + "." + action;
        return bpmService.execute(fullServiceId, input);
    }
}
```

## 5. OASIS VariableList 구조

```
VariableList
├── Variable (name=value 단순 변수)
│   ├── "fromDate" = "2026-03-01"
│   ├── "toDate" = "2026-03-30"
│   └── "userId" = "admin"
│
└── Dataset (테이블 형태 데이터)
    ├── name: "ds_master"
    ├── ColumnHeader[]
    │   ├── { name: "orderId", dataType: STRING }
    │   └── { name: "qty", dataType: INT }
    └── Row[]
        ├── Row { rowType: NORMAL, data: ["ORD-001", 100] }
        └── Row { rowType: INSERT, data: ["ORD-002", 200] }
```

## 6. GridConverter (유틸리티)

`GridConverter`는 OASIS `VariableList`와 Cactus 데이터 구조 간 변환을 수행하는 유틸리티 클래스.

```java
public class GridConverter {
    // VariableList → Map<String, Object> (params)
    // VariableList → List<Map<String, Object>> (dataset rows)
    // List<Map<String, Object>> → Dataset
    // Dataset → GridResult
}
```

## 7. 설정

```yaml
oasis:
  service:
    base-package: com.dongkuk        # BPMN 서비스 스캔 패키지
    default-timeout: 30s             # 서비스 실행 타임아웃
```

## 8. 예외 처리

OASIS 서비스 실행 중 발생하는 예외는 `OasisController`에서 캐치하여
`CactusResponse`의 `meta.resultCode=ERROR`로 변환한다.

| 예외 | HTTP | resultCode | 처리 |
|------|------|-----------|------|
| `OasisServiceNotFoundException` | 404 | ERROR | 서비스 ID를 찾을 수 없음 |
| `OasisExecutionException` | 500 | ERROR | BPMN 실행 중 오류 |
| `BusinessException` | 200 | FAIL | 업무 검증 실패 |

## 9. 업무 모듈에서 BPMN 서비스 작성

업무 모듈은 OASIS BPMN으로 서비스를 정의한다. cactus-core는 이를 호출만 한다.

```
업무 모듈 프로젝트 구조:
src/main/resources/bpmn/
  └── order/
      └── orderMgt/
          ├── search.bpmn    → POST /oasis/orderMgt/search
          ├── save.bpmn      → POST /oasis/orderMgt/save
          └── delete.bpmn    → POST /oasis/orderMgt/delete
```

각 BPMN에서 Java 서비스 빈을 호출하는 구조:

```
BPMN → ServiceTask → @Service OrderService.search(VariableList)
```
