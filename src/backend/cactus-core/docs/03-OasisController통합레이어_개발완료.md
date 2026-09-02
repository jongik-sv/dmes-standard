# 03. OasisController 통합 레이어 (개발완료)

> 통합 원본: `06-OasisController-상세설계.md`, `CACTUS_SERVICE_CONTROLLER.md`, `new/03-oasis-integration.md`
> 구현 상태: **개발완료**. 단일 진입점 컨트롤러로 모든 BPMN 서비스 라우팅.

---

## 1. URL 구조

```
POST /oasis/{serviceId}/{action}
     │      │           │
     │      │           └─ search/save/delete 등 (BPMN 게이트웨이 분기)
     │      └─ BPMN 서비스 ID (예: workOrder)
     └─ 고정 prefix (모든 모듈 공통)
```

예: `POST /oasis/workOrder/save` → BE에서 `workOrder.bpmn` 의 `action=save` 분기 실행.

> **BFF 라우팅** (FE → BE): UI 는 `/api/{module}/oasis/{serviceId}/{action}` 로 호출하고, BFF 가 `/api/{module}/oasis/` 를 떼고 BE 의 `/oasis/{serviceId}/{action}` 로 forward (Phase 7 컨벤션, `frontend/portal/CLAUDE.md` 참고).
>
> **`cactus.oasis.service-group` 프로퍼티**는 URL path 에서 빠졌지만 BPMN 라우팅·로깅 식별 용도로 `OasisProperties` 에서 그대로 유지됨. 정리본 07 참고.

---

## 2. 핵심 클래스

| 클래스 | 위치 | 역할 |
|---|---|---|
| `OasisController` | `cactus-core/web/inbound/OasisController.java` | `@RequestMapping("/oasis")` + `@PostMapping("/{serviceId}/{action}")` 단일 진입점. **`@Controller` 미부착** — `InboundAutoConfiguration` 의 `@Bean` + `@ConditionalOnBean(OasisServiceExecutor.class)` 으로 명시 등록 |
| `OasisServiceExecutor` | `cactus-core/oasis/OasisServiceExecutor.java` | CactusRequest → ServiceResult → CactusResponse 전체 흐름 |
| `CactusRequestConverter` | `cactus-core/oasis/CactusRequestConverter.java` | CactusRequest → `Map<String, TypedObject>` (ServiceContext 입력) |
| `CactusResponseConverter` | `cactus-core/oasis/CactusResponseConverter.java` | ServiceResult → CactusResponse |
| `CactusRequestMappingHandlerMapping` | `cactus-core/web/inbound/CactusRequestMappingHandlerMapping.java` | Spring 7 의 `isHandler` 가 `@Controller` 만 인식하도록 변경된 동작을 우회. 클래스 레벨 `@RequestMapping` 도 핸들러로 인식하도록 `isHandler` 를 override. `InboundAutoConfiguration` 의 `WebMvcRegistrations` 빈으로 default RequestMappingHandlerMapping 교체 |

> **패키지 위치 주의**: `OasisController` 와 4개 inbound 컨트롤러(Query/Service/Lov 포함) + 매핑 호환 레이어는 `web.inbound` 패키지에 모임. `OasisServiceExecutor` 등 변환기는 `oasis` 패키지.
>
> **컴포넌트 스캔 미사용 이유**: cactus-core 가 mybatis/oasis-core 의존이 없는 사이트에서도 안전하게 부팅돼야 하므로 inbound 컨트롤러에 `@Controller` 를 부착하지 않음. 빈 등록은 `InboundAutoConfiguration` 의 `@Bean` + 조건부로만 수행.

---

## 3. 요청 처리 흐름

```
HTTP POST → OasisController.handle(serviceId, action, request)
  ↓
OasisServiceExecutor.execute(serviceId, action, request)
  ↓
1. TxIdGenerator.generate(userId, menuId)         ← MDC 임시 UUID 교체
2. AuditHolder.setAudit(userId, menuId, serviceId) ← 감사 컬럼 주입 준비
3. CactusRequestConverter.convert(request, action)
   - "action": action 값 추가
   - params: 키별 flat 전개 (TypedObject 래핑)
   - grids: gridId → List<Map> 형태
   - meta는 inputs에 포함하지 않음 (필드 충돌 방지)
4. ServiceStarter.start(serviceId, ServiceContext) ← OASIS BPMN 엔진 실행
5. CactusResponseConverter.convert(result, txId)
6. AuditHolder.remove() (finally)
```

---

## 4. BPMN ServiceTask 매핑 규약

`workOrder.bpmn` 의 ServiceTask 요소:
```xml
<bpmn:serviceTask id="searchTask" camunda:class="workOrderService">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="method" value="searchWorkOrders" />
      <camunda:property name="output" value="workOrders" />
      <camunda:property name="dto" value="...WorkOrderSearchRequest" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

| 프로퍼티 | 역할 |
|---|---|
| `class` (camunda:class) | Spring Service Bean 이름 (예: `workOrderService`) |
| `method` | 호출 메서드 (예: `searchWorkOrders`) |
| `dto` (선택) | inputs Map → DTO 자동 조립 클래스 (params 기반) |
| `output` | ServiceResult 에서 추출할 키 (CactusResponse 의 grids 또는 data 로 매핑) |

`dto` 미지정 시 메서드 파라미터 이름이 inputs Map 키와 매칭. grid 데이터는 grid id 와 동일한 파라미터 이름으로 받음 (예: `master` 그리드 → `List<Map<String,Object>> master`).

---

## 5. 게이트웨이 분기

```xml
<bpmn:exclusiveGateway id="actionGateway">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="input" value="action" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="flow_search" name="search" ... targetRef="searchTask">
  <bpmn:conditionExpression>search</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

`input=action` 으로 라우팅. sequenceFlow 의 conditionExpression body 가 action 값과 매칭되면 해당 task 실행. (참고: portal 의 일부 BPMN 은 conditionExpression 없이 `name` 속성만으로도 동작)

---

## 6. 예외 처리

`OasisServiceExecutor` 가 `BusinessException` 과 일반 `Exception` 을 catch 후 CactusResponse 로 변환:
- BusinessException → `ResponseMeta.error(txId, errorCode, message)` + `errors: List<ErrorDetail>`
- 기타 Exception → `ResponseMeta.error(txId, "UNKNOWN_ERROR", message)`

GlobalExceptionHandler 는 컨트롤러 외부(예: 필터)의 예외를 보조 처리 (정리본 05 참고).

---

## 7. 운영 팁

- BPMN 파일 위치: `src/main/resources/services/{serviceId}/{serviceId}.bpmn` (`cactus.oasis.service-path` 로 지정)
- BPMN 변경 후 재배포 필요 (런타임 hot reload 미지원)
- BPMN 작성/수정은 `bpmn-tool` CLI 사용 권장 (DI 좌표·xsi:type 등 자동 처리)

---

## 8. 관련 정리본

- 01 데이터포맷 명세
- 02 패키지구조 (oasis/ 패키지)
- 07 URL 구조 (serviceGroup)
