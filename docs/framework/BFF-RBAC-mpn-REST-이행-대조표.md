# m-mpn REST 신경로 이행 대조표 (자동 추출 초안)

> 생성: 2026-07-30 — extract-api-map.mjs (스크립트 추출 + 수동 검수 전)
> 근거: [BFF-RBAC-REST-신경로규약-상세설계.md](./BFF-RBAC-REST-신경로규약-상세설계.md) §7
> objId 는 2026-07-30 PageLayout 정리(시드 SecObj.OBJECT_ID 정합) 기준.
> "교차 호출" = 2개 이상 화면이 같은 api 를 사용 — LOV 이전 또는 objId 대표 지정 판단 필요.
> 제안 action 은 규칙 기반 초안(GET→search, DELETE→delete, 그 외→save, 경로 특수토큰 반영) — 검수 필수.

## ✅ 이행 결과 (2026-07-30 적용 완료 — BFF 신경로 배포와 같은 단위로 릴리스할 것)

m-mpn 호출부 전체를 신경로로 이행 완료했다. **BFF 신규 라우트 미배포 상태에서 이 변경만 배포하면
전 화면이 깨진다** — 프레임워크 BFF 작업(2026-07-30 17시 예정)과 반드시 같은 배포 단위로 나간다.

- **헬퍼**: `_shared/http.ts` — `API_BASE` 삭제, `rest(objId, action)` 신설,
  `createCrudApi(objId, subPath)` 시그니처 전환(list/get→search, create/update→save, remove→delete).
- **적용 규모**: api 54파일 346호출(코드모드) + 하드코딩 16파일 39호출(lookups 6종·lov-api 14종·
  마스터엑셀 공통 4·버전비교 4·기타) = **전 호출**. 구경로(`/api/mpn/rest/api`) 잔재 0건(grep 검증).
- **objId 배정 규칙**: 파일 주인 화면 원칙. 예외 ① `scheduling/api.ts` 는 경로별 오버라이드
  (scheduling-runs→schedulingRunMng, exceptions→schedulingException, late-order*→lateOrderWorkbench,
  strategy-profiles→profileMng, planning-runs→planningRun, planned-orders→plannedOrderMng,
  그 외 schedules→scheduleListMng) ② 공유 조회(lookups·lov-api)는 자원 소유 화면 objId 로 **임시**
  이행 — LOV 정식 이전(BE MyBatis statement) 시 `/api/mpn/lov/query/**` 로 재이전한다(§②).
- **마스터 엑셀 공통**: `master-excel-api.ts` 에 screenKey→objId 정적 맵 15종 + `excelBase()` 신설.
  액션은 template/export→`export`, dry-run/commit→`import` (버튼 액션과 동일 축).
- **테스트**: 경로 어서션 2파일 6건 신경로로 갱신, `ui-guidance-a11y` 의 Windows 경로 버그
  (`URL.pathname` → `D:\D:\` ENOENT)를 `fileURLToPath` 로 수정. m-mpn 단위테스트 **180건 전건 통과**,
  tsup 빌드 녹색.
- **후속 주의**: 일반 롤은 SecPerm 매핑 없으면 403(admin=SYSADMIN `*` 는 통과). GET 다운로드
  (지연 export 등)는 규칙상 `search` 로 배정 — 권한 세분화 시 재검토.

## ⓪ `_shared/lov-api.ts` — 문서 §7-2 "LOV 12종"의 실체

전 화면 드롭다운이 공용으로 쓰는 조회 14종. `API_BASE` 상수를 쓰지 않고 풀 경로를 하드코딩해
자동 추출 대상 밖이므로 여기 별도 정리한다. **주의**: `6a7a460a` 에서 cactus LovController
(`/api/mpn/lov/query/{queryId}`) 방식으로 전환했다가 **백엔드에 MyBatis LoV statement 미등록**으로
콤보 전멸 회귀가 나서 REST 로 복원한 이력이 있다(lov-api.ts:104 NOTE). 즉 LOV 이전의 선행 조건은
**BE(mpn)에 LoV statement 등록**이며, 프레임워크/BE 협의 항목이다.

| 함수 | 현재 경로 | queryId 후보 | 비고 |
|---|---|---|---|
| fetchAllPlants | `/api/mpn/rest/api/plants?size=500` | plants | 캐시(cachedLowCardinality) |
| searchItems | `/api/mpn/rest/api/items?…` | items | 검색 파라미터 有 |
| resolveItem | `/api/mpn/rest/api/items/{itemCode}` | item-by-code | 단건 해석 |
| fetchAllItems / fetchAllFgItems | `/api/mpn/rest/api/items?…` | items | FG 필터 변형 |
| fetchAllCustomers | `/api/mpn/rest/api/customers?size=1000` | customers | 캐시 |
| fetchAllVendors | `/api/mpn/rest/api/vendors?page=0&size=500` | vendors | 캐시 |
| fetchAllUoms | `/api/mpn/rest/api/uoms?size=500` | uoms | 캐시 |
| fetchAllResources | `/api/mpn/rest/api/resources?size=1000` | resources | 캐시 |
| fetchAllWorkCenters | `/api/mpn/rest/api/work-centers?size=1000` | work-centers | 캐시 |
| fetchAllOperations | `/api/mpn/rest/api/operation-masters?size=1000` | operations | |
| fetchAllBoms | `/api/mpn/rest/api/boms?size=50` | boms | |
| fetchAllRoutings | `/api/mpn/rest/api/routings?size=50` | routings | |
| fetchItemGroups | `/api/mpn/rest/api/item-groups?plantId=…` | item-groups | plant 파라미터 |
| fetchPlanningRunOptions | `/api/mpn/rest/api/planning-runs?status=COMPLETED&size=200` | planning-runs | 실행 선택 콤보 |

## ① 액션 어휘 실측 (2026-07-30 전수 조사 — §7 이행·SecPerm CSV 등록의 입력)

**PageLayout 버튼 액션 21종** (RBAC 검사 대상 — PageLayout/MasterExcelToolbar 실측):

| 계열 | 토큰 (건수) |
|---|---|
| 표준 | search(59) · save(57) · delete(2) |
| 실행/확정 | confirm(4) · execute(2) · publish(2) · release(1) · apply(1) |
| 분석/조회성 | analyze(3) · view(1) · compare(1) · calculate(1) · validate(1) |
| 상태 전환 | activate(1) · deactivate(1) · restore(1) · cancel(2) |
| 기타 | order(2) · create(1) · export(2, 엑셀 공통툴바) · import(1, 엑셀 공통툴바) |

- ❗ 오탐 주의: `ACKNOWLEDGE`·`NONE` 은 지연 워크벤치의 **도메인 상수**(`scheduling/constants.ts` 원인그룹 일괄조치 유형)로 RBAC 버튼 액션이 아니다 — 어휘에서 제외.
- 통일 검토 필요(세션/개발 재량): `view` vs `search`, `create` vs `save`, GET 전용 화면의 `analyze`/`calculate`.

**URL 특수 액션 16종** (본 대조표 제안 action 집계 — 표준 search 189·save 130·delete 41 외):
revert(4) · confirm(4) · activate(3) · validate(2) · split(2) · unplan · resolve · release · publish · firm · finalize · clone · cancel · apply · adjust · acknowledge

→ SecPerm `PERMISSION_ACTION` CSV 등록 후보 = 버튼 21종 ∪ URL 16종 (합집합, 중복 제거 후 확정).

## ② LOV 백엔드 실태 (2026-07-30 확인)

- cactus-core 에 `LovController` **실재** — `POST /lov/query/{queryId}` → `sqlSession.selectList(queryId, params)` (MyBatis statement id 직결). mpn 은 cactus-core includeBuild 라 엔드포인트 자체는 이미 뜬다.
- **mpn 백엔드에 MyBatis mapper XML 이 0건** — 과거 회귀(콤보 전멸)의 원인. LOV 이전의 실작업은
  ⓐ mpn api 에 MyBatis 설정+LoV mapper(plants 등 14 statement) 추가(BE), ⓑ `lov-api.ts` 경로를 `/api/mpn/lov/query/{queryId}` 로 복귀(FE, 1파일). statement id 명명 규약은 프레임워크와 정합 확인 권장.

## 요약 — api 파일 × 화면 소속

| api 파일 | 호출수 | 소속 화면(objId) | 판단 |
|---|---|---|---|
| master/batch/batch-api.ts | 5 | batchMng | 단일 — 기계 치환 가능 |
| master/bom/bom-api.ts | 15 | bomMng, demandMng, materialMng, routingMng | ⚠️ 교차 4화면 — objId/LOV 판단 |
| master/calendar/calendar-api.ts | 11 | calendarMng, scenarioMng | ⚠️ 교차 2화면 — objId/LOV 판단 |
| master/customer/customer-api.ts | 5 | customerMng | 단일 — 기계 치환 가능 |
| master/impact-analysis/impact-analysis-api.ts | 15 | impactAnalysis | 단일 — 기계 치환 가능 |
| master/inventory/inventory-api.ts | 6 | inventoryMng | 단일 — 기계 치환 가능 |
| master/item-group/item-group-api.ts | 4 | itemGroupMng | 단일 — 기계 치환 가능 |
| master/item-group/item-stage-link-policy-api.ts | 2 | itemGroupMng | 단일 — 기계 치환 가능 |
| master/item-operation-resource-override/item-operation-resource-override-api.ts | 8 | itemOpResOverrideMng | 단일 — 기계 치환 가능 |
| master/labor-deployment/labor-deployment-api.ts | 13 | laborDeployMng | 단일 — 기계 치환 가능 |
| master/material/container/container-api.ts | 5 | demandMng, materialMng | ⚠️ 교차 2화면 — objId/LOV 판단 |
| master/material/material-api.ts | 21 | bomMng, demandMng, materialMng | ⚠️ 교차 3화면 — objId/LOV 판단 |
| master/operation/operation-api.ts | 4 | operationMng, routingMng | ⚠️ 교차 2화면 — objId/LOV 판단 |
| master/plant/plant-api.ts | 4 | demandMng, fencePolicyMng, planningRun, plantMng, scenarioMng, schedulingRunMng | ⚠️ 교차 6화면 — objId/LOV 판단 |
| master/resource-group/resource-group-api.ts | 9 | itemOpResOverrideMng, resourceGroupMng, resourceMng | ⚠️ 교차 3화면 — objId/LOV 판단 |
| master/resource-operation-mapping/requirement-api.ts | 5 | resourceOpMapMng | 단일 — 기계 치환 가능 |
| master/resource-operation-mapping/resource-operation-mapping-api.ts | 8 | resourceOpMapMng | 단일 — 기계 치환 가능 |
| master/resource/resource-api.ts | 7 | equipDowntimeMng, resourceMng, scenarioMng | ⚠️ 교차 3화면 — objId/LOV 판단 |
| master/routing/routing-api.ts | 13 | demandMng, materialMng, routingMng | ⚠️ 교차 3화면 — objId/LOV 판단 |
| master/setup-matrix/setup-matrix-api.ts | 6 | setupMatrixMng | 단일 — 기계 치환 가능 |
| master/uom/uom-api.ts | 5 | uomMng | 단일 — 기계 치환 가능 |
| master/validation/validation-api.ts | 1 | validationChk | 단일 — 기계 치환 가능 |
| master/vendor/vendor-api.ts | 5 | vendorMng | 단일 — 기계 치환 가능 |
| master/workcenter/workcenter-api.ts | 9 | workcenterMng | 단일 — 기계 치환 가능 |
| operation/confirm-publish/confirm-publish-api.ts | 6 | confirmPublish | 단일 — 기계 치환 가능 |
| operation/decision-log/decision-log-api.ts | 4 | decisionLogView | 단일 — 기계 치환 가능 |
| operation/equipment-downtime/equipment-downtime-api.ts | 7 | equipDowntimeMng | 단일 — 기계 치환 가능 |
| operation/fence-policy/fence-policy-api.ts | 5 | fencePolicyMng, schedulingRunMng | ⚠️ 교차 2화면 — objId/LOV 판단 |
| operation/firm-fence/firm-fence-api.ts | 2 | firmFenceMng | 단일 — 기계 치환 가능 |
| operation/freeze-zone/freeze-zone-api.ts | 9 | freezeZoneMng, ganttView, simulationConsole, urgentOrderMng | ⚠️ 교차 4화면 — objId/LOV 판단 |
| operation/manual-adjustment/manual-adjustment-api.ts | 5 | ganttView, manualAdjustMng, simulationConsole | ⚠️ 교차 3화면 — objId/LOV 판단 |
| operation/performance/performance-api.ts | 5 | performanceView | 단일 — 기계 치환 가능 |
| operation/urgent-order/urgent-order-api.ts | 7 | urgentOrderMng | 단일 — 기계 치환 가능 |
| planning/capacity/capacity-api.ts | 5 | capacityView, simulationConsole | ⚠️ 교차 2화면 — objId/LOV 판단 |
| planning/demand/demand-api.ts | 9 | capacityView, demandMng, kpiDashboardView, materialMng, plannedOrderMng, planningRun, purchaseRequisitionMng, scenarioCompare, scenarioMng, scheduledReceiptView, timelineView | ⚠️ 교차 11화면 — objId/LOV 판단 |
| planning/exceptions/exceptions-api.ts | 3 | planException, simulationConsole | ⚠️ 교차 2화면 — objId/LOV 판단 |
| planning/order-delivery-reply/api.ts | 1 | deliveryReply | 단일 — 기계 치환 가능 |
| planning/order/sales-order-api.ts | 10 | deliveryReply, orderMng | ⚠️ 교차 2화면 — objId/LOV 판단 |
| planning/pegging/pegging-api.ts | 3 | peggingView | 단일 — 기계 치환 가능 |
| planning/planned-order/planned-order-api.ts | 19 | plannedOrderMng, planningRun, simulationConsole, timelineView | ⚠️ 교차 4화면 — objId/LOV 판단 |
| planning/planning-run/planning-run-api.ts | 5 | peggingView, planException, planningRun, timelineView | ⚠️ 교차 4화면 — objId/LOV 판단 |
| planning/policy/api.ts | 10 | planPolicyMng | 단일 — 기계 치환 가능 |
| planning/purchase-requisition/purchase-requisition-api.ts | 3 | purchaseRequisitionMng | 단일 — 기계 치환 가능 |
| planning/scheduled-receipt/scheduled-receipt-api.ts | 1 | scheduledReceiptView | 단일 — 기계 치환 가능 |
| planning/timeline/timeline-api.ts | 4 | simulationConsole, timelineView | ⚠️ 교차 2화면 — objId/LOV 판단 |
| planning/work-shift-master/work-shift-api.ts | 5 | calendarMng, laborDeployMng, workShiftMng | ⚠️ 교차 3화면 — objId/LOV 판단 |
| scheduling/api.ts | 37 | confirmPublish, equipDowntimeMng, firmFenceMng, freezeZoneMng, ganttView, lateOrderWorkbench, manualAdjustMng, opDashboardView, operationListView, performanceView, profileMng, scheduleListMng, schedulingException, schedulingRunMng, simulationConsole, summaryView, urgentOrderMng, versionCompare, workOrderResourceGantt | ⚠️ 교차 19화면 — objId/LOV 판단 |
| simulation/comparison/comparison-api.ts | 11 | scenarioCompare | 단일 — 기계 치환 가능 |
| simulation/console/console-api.ts | 3 | simulationConsole | 단일 — 기계 치환 가능 |
| simulation/kpi/kpi-api.ts | 3 | kpiDashboardView | 단일 — 기계 치환 가능 |
| simulation/master-data-changes/master-data-changes-api.ts | 2 | masterChangeMng | 단일 — 기계 치환 가능 |
| simulation/scenario/scenario-api.ts | 13 | capacityView, demandMng, kpiDashboardView, plannedOrderMng, scenarioCompare, scenarioMng, simulationConsole, timelineView | ⚠️ 교차 8화면 — objId/LOV 판단 |
| simulation/tooling-provisioning/tooling-provisioning-api.ts | 2 | toolingProvisionMng | 단일 — 기계 치환 가능 |
| workorder/resource-gantt/api.ts | 1 | workOrderResourceGantt | 단일 — 기계 치환 가능 |

## 파일별 상세

### m-mpn/src/master/batch/batch-api.ts
- 호출 화면: batchMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/batches` | search |
| (crud) get | GET | `/api/batches/{id}` | search |
| (crud) create | POST | `/api/batches` | save |
| (crud) update | PUT | `/api/batches/{id}` | save |
| (crud) remove | DELETE | `/api/batches/{id}` | delete |

### m-mpn/src/master/bom/bom-api.ts
- 호출 화면: bomMng, demandMng, materialMng, routingMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchItemByCode | GET | `/api/items/{itemCode}` | search |
| fetchBomList | GET | `/api/boms?…` | search |
| fetchBomDetail | GET | `/api/boms/{id}` | search |
| createBom | POST | `/api/boms` | save |
| updateBom | PUT | `/api/boms/{id}` | save |
| cloneBomDraftVersion | POST | `/api/boms/{id}/draft-version` | save |
| deleteBom | DELETE | `/api/boms/{id}` | delete |
| changeBomStatus | PATCH | `/api/boms/{id}/status` | save |
| fetchBomExplosionTree | GET | `/api/boms/{bomId}/explosion{qs}` | search |
| addBomItem | POST | `/api/boms/{bomId}/items` | save |
| updateBomItem | PUT | `/api/boms/{bomId}/items/{componentItemCode}` | save |
| deleteBomItem | DELETE | `/api/boms/{bomId}/items/{componentItemCode}` | delete |
| fetchPvRowsForLink | GET | `/api/production-versions?itemId={itemCode}&plantId={plantId}&size=1000` | search |
| createProductionVersionForBom | POST | `/api/production-versions` | save |
| updateProductionVersionBom | PUT | `/api/production-versions/{pvId}` | save |

### m-mpn/src/master/calendar/calendar-api.ts
- 호출 화면: calendarMng, scenarioMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchCalendarList | GET | `/api/calendars?…` | search |
| fetchCalendarDetail | GET | `/api/calendars/{id}` | search |
| createCalendar | POST | `/api/calendars` | save |
| updateCalendar | PUT | `/api/calendars/{id}` | save |
| deleteCalendar | DELETE | `/api/calendars/{id}` | delete |
| activateCalendar | POST | `/api/calendars/{id}/activate` | activate |
| deactivateCalendar | POST | `/api/calendars/{id}/deactivate` | activate |
| addCalendarEntry | POST | `/api/calendars/{calendarId}/entries/single` | save |
| updateCalendarEntry | PUT | `/api/calendars/{calendarId}/entries/{entryId}` | save |
| deleteCalendarEntry | DELETE | `/api/calendars/{calendarId}/entries/{entryId}` | delete |
| fetchDailyAvailability | GET | `/api/calendars/?…` | search |

### m-mpn/src/master/customer/customer-api.ts
- 호출 화면: customerMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/customers` | search |
| (crud) get | GET | `/api/customers/{id}` | search |
| (crud) create | POST | `/api/customers` | save |
| (crud) update | PUT | `/api/customers/{id}` | save |
| (crud) remove | DELETE | `/api/customers/{id}` | delete |

### m-mpn/src/master/impact-analysis/impact-analysis-api.ts
- 호출 화면: impactAnalysis

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (config) 경로 상수 | GET | `/api/items` | search |
| (config) 경로 상수 | GET | `/api/boms` | search |
| (config) 경로 상수 | GET | `/api/routings` | search |
| (config) 경로 상수 | GET | `/api/resources` | search |
| (config) 경로 상수 | GET | `/api/calendars` | search |
| (config) 경로 상수 | GET | `/api/setup-matrices` | search |
| (config) 경로 상수 | GET | `/api/inventories` | search |
| fetchEntityDetail | GET | `/api/items/{entityId}` | search |
| fetchEntityDetail | GET | `/api/boms/{entityId}` | search |
| fetchEntityDetail | GET | `/api/routings/{entityId}` | search |
| fetchEntityDetail | GET | `/api/resources/{entityId}` | search |
| fetchEntityDetail | GET | `/api/calendars/{entityId}` | search |
| fetchEntityDetail | GET | `/api/setup-matrices/{entityId}` | search |
| fetchEntityDetail | GET | `/api/inventories/{entityId}` | search |
| runImpactAnalysis | POST | `/api/master-data/impact-analysis` | save |

### m-mpn/src/master/inventory/inventory-api.ts
- 호출 화면: inventoryMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchInventoryList | GET | `/api/inventories?…` | search |
| createInventory | POST | `/api/inventories` | save |
| updateInventory | PUT | `/api/inventories/{id}` | save |
| deleteInventory | DELETE | `/api/inventories/{id}` | delete |
| fetchBatchesByItemAndPlant | GET | `/api/batches?itemId={itemId}&plantId={plantId}&size=1000` | search |
| fetchStorageLocations | GET | `/api/plants/{plantId}/storage-locations` | search |

### m-mpn/src/master/item-group/item-group-api.ts
- 호출 화면: itemGroupMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchItemGroupsByPlant | GET | `/api/item-groups?…` | search |
| createItemGroup | POST | `/api/item-groups` | save |
| updateItemGroup | PUT | `/api/item-groups/{groupCode}?…` | save |
| deleteItemGroup | DELETE | `/api/item-groups/{groupCode}?…` | delete |

### m-mpn/src/master/item-group/item-stage-link-policy-api.ts
- 호출 화면: itemGroupMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchStageLinkPolicies | GET | `/api/item-stage-link-policies?…` | search |
| updateStageLinkPolicy | PUT | `/api/item-stage-link-policies/{stageCode}?…` | save |

### m-mpn/src/master/item-operation-resource-override/item-operation-resource-override-api.ts
- 호출 화면: itemOpResOverrideMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| updateOverride | PUT | `/api/item-operation-resource-overrides/{id}` | save |
| deleteOverride | DELETE | `/api/item-operation-resource-overrides/{id}` | delete |
| getOverrideById | GET | `/api/item-operation-resource-overrides/{id}` | search |
| fetchOverridesByItemAndOperation | GET | `/api/item-operation-resource-overrides/by-item-operation?…` | search |
| fetchOverridesByItem | GET | `/api/item-operation-resource-overrides/by-item/{itemCode}` | search |
| fetchOverridesByOperation | GET | `/api/item-operation-resource-overrides/by-operation/{operationId}` | search |
| fetchOverridesByResource | GET | `/api/item-operation-resource-overrides/by-resource/{resourceCode}` | search |
| searchOverrides | GET | `/api/item-operation-resource-overrides/search?…` | search |

### m-mpn/src/master/labor-deployment/labor-deployment-api.ts
- 호출 화면: laborDeployMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPlans | GET | `/api/labor-deployment-plans?…` | search |
| fetchPlanDetail | GET | `/api/labor-deployment-plans/{id}` | search |
| createPlan | POST | `/api/labor-deployment-plans` | save |
| updatePlan | PUT | `/api/labor-deployment-plans/{id}` | save |
| deletePlan | DELETE | `/api/labor-deployment-plans/{id}` | delete |
| changeStatus | PATCH | `/api/labor-deployment-plans/{id}/status` | save |
| createEntry | POST | `/api/labor-deployment-plans/{planId}/entries` | save |
| updateEntry | PATCH | `/api/labor-deployment-plans/{planId}/entries/{id}` | save |
| deleteEntry | DELETE | `/api/labor-deployment-plans/{planId}/entries/{id}` | delete |
| bulkAddEntries | POST | `/api/labor-deployment-plans/{planId}/entries/bulk` | save |
| fetchPlants | GET | `/api/plants?size=1000` | search |
| fetchWorkCenters | GET | `/api/work-centers?size=1000` | search |
| fetchLaborResources | GET | `/api/resources?size=1000&resourceType=LABOR` | search |

### m-mpn/src/master/material/container/container-api.ts
- 호출 화면: demandMng, materialMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/material-containers` | search |
| (crud) get | GET | `/api/material-containers/{id}` | search |
| (crud) create | POST | `/api/material-containers` | save |
| (crud) update | PUT | `/api/material-containers/{id}` | save |
| (crud) remove | DELETE | `/api/material-containers/{id}` | delete |

### m-mpn/src/master/material/material-api.ts
- 호출 화면: bomMng, demandMng, materialMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchItemList | GET | `/api/items?…` | search |
| fetchItemDetail | GET | `/api/items/{itemCode}` | search |
| createItem | POST | `/api/items` | save |
| updateItem | PUT | `/api/items/{itemCode}` | save |
| changeItemStatus | PATCH | `/api/items/{itemCode}/status` | save |
| deleteItem | DELETE | `/api/items/{itemCode}` | delete |
| fetchProductionVersionsByItem | GET | `/api/production-versions?itemId={itemId}&page=0&size=100` | search |
| fetchProductionVersionDetail | GET | `/api/production-versions/{id}` | search |
| createProductionVersion | POST | `/api/production-versions` | save |
| updateProductionVersion | PUT | `/api/production-versions/{id}` | save |
| deleteProductionVersion | DELETE | `/api/production-versions/{id}` | delete |
| activateProductionVersion | PUT | `/api/production-versions/?…` | save |
| deactivateProductionVersion | PUT | `/api/production-versions/{id}/deactivate` | activate |
| fetchInventoriesByItem | GET | `/api/inventories?itemId={itemId}&page=0&size=1000` | search |
| updateInventory | PUT | `/api/inventories/{id}` | save |
| fetchItemSubstitutesByItem | GET | `/api/item-substitutes/by-item/{itemId}` | search |
| createItemSubstitute | POST | `/api/item-substitutes` | save |
| updateItemSubstitute | PUT | `/api/item-substitutes/{id}` | save |
| deleteItemSubstitute | DELETE | `/api/item-substitutes/{id}` | delete |
| saveItemSubstitutesByItem | PUT | `/api/item-substitutes/by-item/{itemId}` | save |
| fetchItemDetailSpecsByItem | GET | `/api/item-details/by-item/{itemCode}` | search |

### m-mpn/src/master/operation/operation-api.ts
- 호출 화면: operationMng, routingMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchOperationList | GET | `/api/operation-masters?…` | search |
| addOperation | POST | `/api/operation-masters` | save |
| updateOperation | PUT | `/api/operation-masters/{id}` | save |
| deleteOperation | DELETE | `/api/operation-masters/{id}` | delete |

### m-mpn/src/master/plant/plant-api.ts
- 호출 화면: demandMng, fencePolicyMng, planningRun, plantMng, scenarioMng, schedulingRunMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchStorageLocations | GET | `/api/plants/{plantId}/storage-locations` | search |
| createStorageLocation | POST | `/api/plants/{plantId}/storage-locations` | save |
| updateStorageLocation | PUT | `/api/plants/{plantId}/storage-locations/{storageLocationId}` | save |
| deleteStorageLocation | DELETE | `/api/plants/{plantId}/storage-locations/{storageLocationId}` | delete |

### m-mpn/src/master/resource-group/resource-group-api.ts
- 호출 화면: itemOpResOverrideMng, resourceGroupMng, resourceMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/resource-groups` | search |
| (crud) get | GET | `/api/resource-groups/{id}` | search |
| (crud) create | POST | `/api/resource-groups` | save |
| (crud) update | PUT | `/api/resource-groups/{id}` | save |
| (crud) remove | DELETE | `/api/resource-groups/{id}` | delete |
| addResourceGroupMember | POST | `/api/resource-groups/{groupId}/members` | save |
| removeResourceGroupMember | DELETE | `/api/resource-groups/{groupId}/members/{resourceCode}` | delete |
| fetchAllResources | GET | `/api/resources?page=0&size=1000` | search |
| fetchResourceGroupsByResource | GET | `/api/resources/{resourceCode}/groups` | search |

### m-mpn/src/master/resource-operation-mapping/requirement-api.ts
- 호출 화면: resourceOpMapMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchRequirements | GET | `/api/resource-operation-mappings/{mappingId}/requirements` | search |
| createRequirement | POST | `/api/resource-operation-mappings/{mappingId}/requirements` | save |
| updateRequirement | PUT | `/api/resource-operation-mappings/{mappingId}/requirements/{id}` | save |
| deleteRequirement | DELETE | `/api/resource-operation-mappings/{mappingId}/requirements/{id}` | delete |
| fetchResourceGroups | GET | `/api/resource-groups?size=1000` | search |

### m-mpn/src/master/resource-operation-mapping/resource-operation-mapping-api.ts
- 호출 화면: resourceOpMapMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchAllMappings | GET | `/api/resource-operation-mappings?…` | search |
| fetchMappingsByResource | GET | `/api/resource-operation-mappings/by-resource/{resourceId}` | search |
| fetchMappingsByOperation | GET | `/api/resource-operation-mappings/by-operation/{operationId}` | search |
| searchMappings | GET | `/api/resource-operation-mappings/search?…` | search |
| updateMapping | PUT | `/api/resource-operation-mappings/{id}` | save |
| deleteMapping | DELETE | `/api/resource-operation-mappings/{id}` | delete |
| fetchResources | GET | `/api/resources?size=1000` | search |
| fetchOperations | GET | `/api/operation-masters?size=1000` | search |

### m-mpn/src/master/resource/resource-api.ts
- 호출 화면: equipDowntimeMng, resourceMng, scenarioMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchResourceList | GET | `/api/resources?…` | search |
| fetchResourceDetail | GET | `/api/resources/{resourceCode}` | search |
| createResource | POST | `/api/resources` | save |
| updateResource | PUT | `/api/resources/{resourceCode}` | save |
| deleteResource | DELETE | `/api/resources/{resourceCode}` | delete |
| fetchCalendarsByResource | GET | `/api/calendars/by-resource/{resourceId}` | search |
| fetchOperationMappingsByResource | GET | `/api/resource-operation-mappings/by-resource/{resourceId}` | search |

### m-mpn/src/master/routing/routing-api.ts
- 호출 화면: demandMng, materialMng, routingMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchProductionVersionsByItem | GET | `/api/production-versions?itemId={itemId}&plantId={plantId}&size=1000` | search |
| fetchProductionVersionsByRouting | GET | `/api/production-versions?routingId={routingId}&size=1000` | search |
| createProductionVersionForRouting | POST | `/api/production-versions` | save |
| updateProductionVersionRouting | PUT | `/api/production-versions/{pvId}` | save |
| fetchRoutingList | GET | `/api/routings?…` | search |
| fetchRoutingDetail | GET | `/api/routings/{id}` | search |
| createRouting | POST | `/api/routings` | save |
| updateRouting | PUT | `/api/routings/{id}` | save |
| deleteRouting | DELETE | `/api/routings/{id}` | delete |
| changeRoutingStatus | PATCH | `/api/routings/{id}/status` | save |
| addOperation | POST | `/api/routings/{routingId}/operations` | save |
| updateOperation | PUT | `/api/routings/{routingId}/operations/{operationCode}` | save |
| deleteOperation | DELETE | `/api/routings/{routingId}/operations/{operationCode}` | delete |

### m-mpn/src/master/setup-matrix/setup-matrix-api.ts
- 호출 화면: setupMatrixMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchSetupAttributes | GET | `/api/setup-attributes` | search |
| fetchSetupMatrixList | GET | `/api/setup-matrices?…` | search |
| fetchSetupMatrixByResource | GET | `/api/setup-matrices/by-resource/{resourceId}` | search |
| createSetupMatrix | POST | `/api/setup-matrices` | save |
| updateSetupMatrix | PUT | `/api/setup-matrices/{id}` | save |
| deleteSetupMatrix | DELETE | `/api/setup-matrices/{id}` | delete |

### m-mpn/src/master/uom/uom-api.ts
- 호출 화면: uomMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/uoms` | search |
| (crud) get | GET | `/api/uoms/{id}` | search |
| (crud) create | POST | `/api/uoms` | save |
| (crud) update | PUT | `/api/uoms/{id}` | save |
| (crud) remove | DELETE | `/api/uoms/{id}` | delete |

### m-mpn/src/master/validation/validation-api.ts
- 호출 화면: validationChk

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| runValidation | POST | `/api/validations/run` | save |

### m-mpn/src/master/vendor/vendor-api.ts
- 호출 화면: vendorMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/vendors` | search |
| (crud) get | GET | `/api/vendors/{id}` | search |
| (crud) create | POST | `/api/vendors` | save |
| (crud) update | PUT | `/api/vendors/{id}` | save |
| (crud) remove | DELETE | `/api/vendors/{id}` | delete |

### m-mpn/src/master/workcenter/workcenter-api.ts
- 호출 화면: workcenterMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchWorkcenterList | GET | `/api/work-centers?…` | search |
| createWorkcenter | POST | `/api/work-centers` | save |
| updateWorkcenter | PUT | `/api/work-centers/{workCenterCode}` | save |
| deleteWorkcenter | DELETE | `/api/work-centers/{workCenterCode}` | delete |
| fetchResourcesByWorkcenter | GET | `/api/resources?page=0&size=500` | search |
| createResource | POST | `/api/resources` | save |
| updateResource | PUT | `/api/resources/{resourceCode}` | save |
| deleteResource | DELETE | `/api/resources/{resourceCode}` | delete |
| fetchOperationsByWorkcenter | GET | `/api/work-centers/{workCenterId}/operations` | search |

### m-mpn/src/operation/confirm-publish/confirm-publish-api.ts
- 호출 화면: confirmPublish

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| confirmSchedule | POST | `/api/schedules/{scheduleId}/confirm` | confirm |
| fetchActiveCriticalExceptions | GET | `/api/schedules/{scheduleId}/exceptions?severity=CRITICAL` | search |
| publishToMes | POST | `/api/schedules/{scheduleId}/publish-to-mes` | publish |
| fetchPublishLogs | GET | `/api/schedules/{scheduleId}/publish-logs` | search |
| workOrderAction | POST | `/api/schedules/{scheduleId}/work-orders/{action}{q}` | save |
| fetchWorkOrders | GET | `/api/schedules/{scheduleId}/work-orders` | search |

### m-mpn/src/operation/decision-log/decision-log-api.ts
- 호출 화면: decisionLogView

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| searchDecisionLogs | GET | `/api/decision-logs?…` | search |
| fetchDecisionLogSummary | GET | `/api/decision-logs/summary?…` | search |
| fetchDecisionLog | GET | `/api/decision-logs/{id}` | search |
| fetchDecisionChain | GET | `/api/decision-logs/chain?…` | search |

### m-mpn/src/operation/equipment-downtime/equipment-downtime-api.ts
- 호출 화면: equipDowntimeMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchEquipmentDowntimeList | GET | `/api/equipment-downtimes?…` | search |
| createEquipmentDowntime | POST | `/api/equipment-downtimes` | save |
| deleteEquipmentDowntime | POST | `/api/equipment-downtimes/{downtimeId}` | save |
| endEquipmentDowntime | PATCH | `/api/equipment-downtimes/{downtimeId}/resolve` | resolve |
| analyzeDowntime | POST | `/api/equipment-downtimes/{downtimeId}/analyze` | save |
| handleStartedOperation | POST | `/api/equipment-downtimes/{downtimeId}/operations/{scheduleOpId}/handle` | save |
| rescheduleDowntime | POST | `/api/equipment-downtimes/{downtimeId}/reschedule` | save |

### m-mpn/src/operation/fence-policy/fence-policy-api.ts
- 호출 화면: fencePolicyMng, schedulingRunMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchFencePolicies | GET | `/api/fence-policies` | search |
| fetchEffectiveFencePolicy | GET | `/api/fence-policies/effective?…` | search |
| createFencePolicy | POST | `/api/fence-policies` | save |
| updateFencePolicy | PUT | `/api/fence-policies/{fencePolicyId}` | save |
| deleteFencePolicy | DELETE | `/api/fence-policies/{fencePolicyId}` | delete |

### m-mpn/src/operation/firm-fence/firm-fence-api.ts
- 호출 화면: firmFenceMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchFirmFence | GET | `/api/schedules/{scheduleId}/firm-fence` | search |
| updateFirmFence | PUT | `/api/schedules/{scheduleId}/firm-fence` | firm |

### m-mpn/src/operation/freeze-zone/freeze-zone-api.ts
- 호출 화면: freezeZoneMng, ganttView, simulationConsole, urgentOrderMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchFreezeZoneList | GET | `/api/schedules/{scheduleId}/freeze-zones` | search |
| createFreezeZone | POST | `/api/schedules/{scheduleId}/freeze-zones` | save |
| deleteFreezeZone | DELETE | `/api/schedules/{scheduleId}/freeze-zones/{freezeZoneId}` | delete |
| applyFreezeZone | POST | `/api/schedules/{scheduleId}/freeze/apply` | apply |
| releaseFreezeZone | POST | `/api/schedules/{scheduleId}/freeze/release` | release |
| fetchFrozenOperations | GET | `/api/schedules/?…` | search |
| fetchScheduledOperations | GET | `/api/schedules/?…` | search |
| freezeOperation | POST | `/api/schedules/{scheduleId}/operations/{scheduleOpId}/freeze` | save |
| unfreezeOperation | POST | `/api/schedules/{scheduleId}/operations/{scheduleOpId}/unfreeze` | save |

### m-mpn/src/operation/manual-adjustment/manual-adjustment-api.ts
- 호출 화면: ganttView, manualAdjustMng, simulationConsole  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| validateManualAdjustment | POST | `/api/schedules/{scheduleId}/operations/{scheduleOpId}/validate-adjustment` | validate |
| executeManualAdjustment | POST | `/api/schedules/{scheduleId}/operations/{scheduleOpId}/adjust` | adjust |
| fetchManualAdjustmentHistory | GET | `/api/schedules/?…` | search |
| fetchManualAdjustmentDetail | GET | `/api/schedules/{scheduleId}/adjustment-logs/{adjustmentId}` | search |
| fetchCandidateResources | GET | `/api/operations/{operationId}/candidate-resources?…` | search |

### m-mpn/src/operation/performance/performance-api.ts
- 호출 화면: performanceView

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| analyzeSchedulePerformance | POST | `/api/schedules/{scheduleId}/performance/analyze` | save |
| fetchPerformanceSummary | GET | `/api/schedules/{scheduleId}/performance/summary` | search |
| fetchPerformanceComparisons | GET | `/api/schedules/{scheduleId}/performance` | search |
| fetchPerformanceByResource | GET | `/api/schedules/{scheduleId}/performance/by-resource` | search |
| fetchResourceEfficiencyAverage | GET | `/api/resources/?…` | search |

### m-mpn/src/operation/urgent-order/urgent-order-api.ts
- 호출 화면: urgentOrderMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchUrgentOrderList | GET | `/api/urgent-orders?…` | search |
| registerUrgentOrder | POST | `/api/urgent-orders` | save |
| analyzeUrgentOrder | POST | `/api/urgent-orders/{urgentOrderId}/analyze` | save |
| insertUrgentOrder | POST | `/api/urgent-orders/{urgentOrderId}/insert` | save |
| confirmUrgentOrder | POST | `/api/urgent-orders/{urgentOrderId}/confirm` | confirm |
| deleteUrgentOrder | POST | `/api/urgent-orders/{urgentOrderId}` | save |
| rollbackUrgentOrder | POST | `/api/urgent-orders/{urgentOrderId}/rollback` | save |

### m-mpn/src/planning/capacity/capacity-api.ts
- 호출 화면: capacityView, simulationConsole  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchCapacityLoads | GET | `/api/planning-runs/?…` | search |
| fetchLiveCapacityLoads | GET | `/api/capacity-loads?…` | search |
| fetchResourceLoadContributions | GET | `/api/capacity-loads/contributions?…` | search |
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |
| fetchFiniteResources | GET | `/api/resources?…` | search |

### m-mpn/src/planning/demand/demand-api.ts
- 호출 화면: capacityView, demandMng, kpiDashboardView, materialMng, plannedOrderMng, planningRun, purchaseRequisitionMng, scenarioCompare, scenarioMng, scheduledReceiptView, timelineView  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/demands` | search |
| (crud) get | GET | `/api/demands/{id}` | search |
| (crud) create | POST | `/api/demands` | save |
| (crud) update | PUT | `/api/demands/{id}` | save |
| (crud) remove | DELETE | `/api/demands/{id}` | delete |
| fetchDemandList | GET | `/api/demands?…` | search |
| fetchItemDetail | GET | `/api/items/{itemCode}` | search |
| fetchProductionVersionsByItemFull | GET | `/api/production-versions?…` | search |
| unplanDemand | PATCH | `/api/demands/{demandId}/unplan` | unplan |

### m-mpn/src/planning/exceptions/exceptions-api.ts
- 호출 화면: planException, simulationConsole  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPlanningExceptions | GET | `/api/planning-runs/?…` | search |
| fetchExceptionCounts | GET | `/api/planning-runs/{planRunId}/exception-counts` | search |
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |

### m-mpn/src/planning/order-delivery-reply/api.ts
- 호출 화면: deliveryReply

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| estimateDelivery | POST | `/api/provisional-orders/delivery-estimate` | save |

### m-mpn/src/planning/order/sales-order-api.ts
- 호출 화면: deliveryReply, orderMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/sales-orders` | search |
| (crud) get | GET | `/api/sales-orders/{id}` | search |
| (crud) create | POST | `/api/sales-orders` | save |
| (crud) update | PUT | `/api/sales-orders/{id}` | save |
| (crud) remove | DELETE | `/api/sales-orders/{id}` | delete |
| fetchItemByCode | GET | `/api/items/{itemCode}` | search |
| fetchCustomerByCode | GET | `/api/customers/{customerCode}` | search |
| confirmSalesOrders | POST | `/api/sales-orders/confirm` | confirm |
| cancelSalesOrder | POST | `/api/sales-orders/{id}/cancel` | cancel |
| revertSalesOrder | PATCH | `/api/sales-orders/{salesOrderId}/revert` | revert |

### m-mpn/src/planning/pegging/pegging-api.ts
- 호출 화면: peggingView

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| togglePeggingFix | PATCH | `/api/planning-runs/{planRunId}/pegging-records/{peggingId}/fix` | save |
| fetchPeggingRecords | GET | `/api/planning-runs/?…` | search |
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |

### m-mpn/src/planning/planned-order/planned-order-api.ts
- 호출 화면: plannedOrderMng, planningRun, simulationConsole, timelineView  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPlannedOrderList | GET | `/api/planned-orders?…` | search |
| fetchPlannedOrderTree | GET | `/api/planned-orders/tree?…` | search |
| fetchPlannedOrderDetail | GET | `/api/planned-orders/{id}` | search |
| changePlannedOrderStatus | PATCH | `/api/planned-orders/{id}/status` | save |
| updatePlannedOrderLink | PATCH | `/api/planned-orders/{id}/link` | save |
| fetchProductionVersionsForPlannedOrder | GET | `/api/production-versions?…` | search |
| changePlannedOrderProductionVersion | PATCH | `/api/planned-orders/{id}/production-version` | save |
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |
| batchChangePlannedOrderStatus | PATCH | `/api/planned-orders/batch-status` | confirm |
| batchRevertPlannedOrderFirm | PATCH | `/api/planned-orders/batch-revert` | revert |
| validatePlannedOrderFirmRevert | POST | `/api/planned-orders/{id}/revert/validate` | revert |
| validateBatchRevertPlannedOrderFirm | POST | `/api/planned-orders/batch-revert/validate` | validate |
| reviewPlannedOrderFirmRevert | POST | `/api/planned-orders/batch-revert/review` | save |
| fetchSubstituteCandidates | GET | `/api/planned-orders/{plannedOrderId}/substitute-candidates` | search |
| substituteItem | PATCH | `/api/planned-orders/{plannedOrderId}/substitute-item` | save |
| splitPlannedOrder | PATCH | `/api/planned-orders/{id}/split` | split |
| previewSplitPlannedOrder | PATCH | `/api/planned-orders/{id}/split/preview` | split |
| reschedulePlannedOrder | PATCH | `/api/planned-orders/{id}/reschedule` | save |
| revertPlannedOrderFirm | PATCH | `/api/planned-orders/{id}/revert` | revert |

### m-mpn/src/planning/planning-run/planning-run-api.ts
- 호출 화면: peggingView, planException, planningRun, timelineView  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |
| fetchPlanningRunDetail | GET | `/api/planning-runs/{id}` | search |
| fetchExcludedDemandCount | GET | `/api/planning-runs/excluded-demand-count?…` | search |
| createPlanningRun | POST | `/api/planning-runs` | save |
| fetchCurrentPlanningRun | GET | `/api/planning-runs/current?…` | search |

### m-mpn/src/planning/policy/api.ts
- 호출 화면: planPolicyMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/planning-strategy-profiles` | search |
| (crud) get | GET | `/api/planning-strategy-profiles/{id}` | search |
| (crud) create | POST | `/api/planning-strategy-profiles` | save |
| (crud) update | PUT | `/api/planning-strategy-profiles/{id}` | save |
| (crud) remove | DELETE | `/api/planning-strategy-profiles/{id}` | delete |
| (crud) list | GET | `/api/planning-policy-rules` | search |
| (crud) get | GET | `/api/planning-policy-rules/{id}` | search |
| (crud) create | POST | `/api/planning-policy-rules` | save |
| (crud) update | PUT | `/api/planning-policy-rules/{id}` | save |
| (crud) remove | DELETE | `/api/planning-policy-rules/{id}` | delete |

### m-mpn/src/planning/purchase-requisition/purchase-requisition-api.ts
- 호출 화면: purchaseRequisitionMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPurchaseRequisitionList | GET | `/api/purchase-requisitions?…` | search |
| fetchPurchaseRequisitionDetail | GET | `/api/purchase-requisitions/{id}` | search |
| convertToScheduledReceipt | POST | `/api/purchase-requisitions/convert-to-scheduled-receipt` | save |

### m-mpn/src/planning/scheduled-receipt/scheduled-receipt-api.ts
- 호출 화면: scheduledReceiptView

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchScheduledReceiptList | GET | `/api/scheduled-receipts?…` | search |

### m-mpn/src/planning/timeline/timeline-api.ts
- 호출 화면: simulationConsole, timelineView  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchTimelineTree | GET | `/api/planned-orders/tree?…` | search |
| fetchPlanningRunList | GET | `/api/planning-runs?…` | search |
| fetchPlannedOrderDetail | GET | `/api/planned-orders/{id}` | search |
| fetchLeadTimeBreakdown | GET | `/api/planned-orders/{plannedOrderId}/lead-time-breakdown` | search |

### m-mpn/src/planning/work-shift-master/work-shift-api.ts
- 호출 화면: calendarMng, laborDeployMng, workShiftMng  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| (crud) list | GET | `/api/work-shifts` | search |
| (crud) get | GET | `/api/work-shifts/{id}` | search |
| (crud) create | POST | `/api/work-shifts` | save |
| (crud) update | PUT | `/api/work-shifts/{id}` | save |
| (crud) remove | DELETE | `/api/work-shifts/{id}` | delete |

### m-mpn/src/scheduling/api.ts
- 호출 화면: confirmPublish, equipDowntimeMng, firmFenceMng, freezeZoneMng, ganttView, lateOrderWorkbench, manualAdjustMng, opDashboardView, operationListView, performanceView, profileMng, scheduleListMng, schedulingException, schedulingRunMng, simulationConsole, summaryView, urgentOrderMng, versionCompare, workOrderResourceGantt  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| executeSchedulingRun | POST | `/api/scheduling-runs` | save |
| getSchedulingRunStatus | GET | `/api/scheduling-runs/{scheduleId}` | search |
| fetchScheduleList | GET | `/api/schedules?…` | search |
| fetchSchedulesPaged | GET | `/api/schedules?{query}` | search |
| fetchScheduleDetail | GET | `/api/schedules/{scheduleId}` | search |
| changeScheduleStatus | PATCH | `/api/schedules/{scheduleId}/status` | save |
| deleteSchedule | DELETE | `/api/schedules/{scheduleId}` | delete |
| fetchScheduleSummary | GET | `/api/schedules/{scheduleId}/summary` | search |
| fetchScheduleDashboard | GET | `/api/schedules/?…` | search |
| fetchScheduleOperations | GET | `/api/schedules/?…` | search |
| fetchLatestOfficialScheduleOperations | GET | `/api/official-schedule-results/operations?…` | search |
| fetchScheduleOperationDetail | GET | `/api/schedules/{scheduleId}/operations/{scheduleOpId}` | search |
| updateScheduleOperation | PUT | `/api/schedules/{scheduleId}/operations/{scheduleOpId}` | save |
| changeOperationStatus | PATCH | `/api/schedules/{scheduleId}/operations/{scheduleOpId}/status` | save |
| fetchGanttData | GET | `/api/schedules/{scheduleId}/gantt` | search |
| fetchSchedulingExceptions | GET | `/api/schedules/?…` | search |
| fetchExceptionDiagnosis | GET | `/api/schedules/{scheduleId}/exceptions/{exceptionId}/diagnosis` | search |
| acknowledgeException | POST | `/api/schedules/{scheduleId}/exceptions/{exceptionId}/acknowledge` | acknowledge |
| fetchWorkbenchSummary | GET | `/api/schedules/{scheduleId}/late-order-workbench/summary` | search |
| fetchWorkbench | GET | `/api/schedules/{scheduleId}/late-order-workbench${qs ? ` | search |
| fetchCauseChain | GET | `/api/schedules/{scheduleId}/late-orders/{plannedOrderId}/cause-chain` | search |
| batchAction | POST | `/api/schedules/{scheduleId}/late-orders/batch-action` | save |
| fetchStrategyProfiles | GET | `/api/scheduling-strategy-profiles?…` | search |
| fetchStrategyProfileDetail | GET | `/api/scheduling-strategy-profiles/{profileId}` | search |
| createStrategyProfile | POST | `/api/scheduling-strategy-profiles` | save |
| deleteStrategyProfile | DELETE | `/api/scheduling-strategy-profiles/{profileId}` | delete |
| updateStrategyProfile | PUT | `/api/scheduling-strategy-profiles/{profileId}` | save |
| fetchPlanningRuns | GET | `/api/planning-runs?…` | search |
| fetchPlannedOrders | GET | `/api/planned-orders?…` | search |
| fetchPlannedOrderTree | GET | `/api/planned-orders/tree?…` | search |
| fetchOperationFlow | GET | `/api/schedules/?…` | search |
| fetchLatestOfficialOperationFlows | GET | `/api/official-schedule-results/operation-flows?…` | search |
| optimizeSchedule | POST | `/api/schedules/{scheduleId}/optimize` | save |
| repairSchedule | POST | `/api/schedules/{scheduleId}/repair` | save |
| getOptimizerResult | GET | `/api/schedules/{scheduleId}/optimizer-result` | search |
| bulkFreezeOperations | POST | `/api/schedules/{scheduleId}/operations/bulk-freeze` | save |
| bulkUnfreezeOperations | POST | `/api/schedules/{scheduleId}/operations/bulk-unfreeze` | save |

### m-mpn/src/simulation/comparison/comparison-api.ts
- 호출 화면: scenarioCompare

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchComparisonList | GET | `/api/scenario-comparisons?…` | search |
| fetchComparisonDetail | GET | `/api/scenario-comparisons/{comparisonId}` | search |
| createComparison | POST | `/api/scenario-comparisons` | save |
| updateComparison | PUT | `/api/scenario-comparisons/{comparisonId}` | save |
| deleteComparison | DELETE | `/api/scenario-comparisons/{comparisonId}` | delete |
| selectComparison | PATCH | `/api/scenario-comparisons/{comparisonId}/select` | save |
| finalizeScenario | POST | `/api/scenarios/{scenarioId}/finalize` | finalize |
| fetchComparisonDrilldown | GET | `/api/scenario-comparisons/{comparisonId}/drilldown` | search |
| fetchComparisonDeltas | GET | `/api/scenario-comparisons/{comparisonId}/deltas` | search |
| fetchComparisonExceptions | GET | `/api/scenario-comparisons/{comparisonId}/exceptions` | search |
| fetchKpiWeights | GET | `/api/plants/{plantId}/kpi-weights` | search |

### m-mpn/src/simulation/console/console-api.ts
- 호출 화면: simulationConsole

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| runScenarioPlanning | POST | `/api/scenarios/{scenarioId}/plan` | save |
| runScenarioScheduling | POST | `/api/scenarios/{scenarioId}/schedule` | save |
| fetchScenarioResult | GET | `/api/scenarios/{scenarioId}/results` | search |

### m-mpn/src/simulation/kpi/kpi-api.ts
- 호출 화면: kpiDashboardView

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| calculateKpi | POST | `/api/scenarios/{scenarioId}/kpi/calculate` | save |
| fetchKpiDashboard | GET | `/api/scenarios/?…` | search |
| fetchScenarioResults | GET | `/api/scenarios/{scenarioId}/results` | search |

### m-mpn/src/simulation/master-data-changes/master-data-changes-api.ts
- 호출 화면: masterChangeMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchMasterDataChanges | GET | `/api/master-data-changes?…` | search |
| fetchAffectedScenarios | GET | `/api/master-data-changes/{changeLogId}/affected-scenarios` | search |

### m-mpn/src/simulation/scenario/scenario-api.ts
- 호출 화면: capacityView, demandMng, kpiDashboardView, plannedOrderMng, scenarioCompare, scenarioMng, simulationConsole, timelineView  ⚠️ 교차 호출

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchScenarioList | GET | `/api/scenarios?…` | search |
| fetchScenarioDetail | GET | `/api/scenarios/{scenarioId}` | search |
| createScenario | POST | `/api/scenarios` | save |
| updateScenario | PUT | `/api/scenarios/{scenarioId}` | save |
| deleteScenario | DELETE | `/api/scenarios/{scenarioId}` | delete |
| cloneScenario | POST | `/api/scenarios/{scenarioId}/clone` | clone |
| simulateScenario | POST | `/api/scenarios/{scenarioId}/simulate` | save |
| changeScenarioStatus | PATCH | `/api/scenarios/{scenarioId}/status` | save |
| fetchConditions | GET | `/api/scenarios/{scenarioId}/conditions` | search |
| addCondition | POST | `/api/scenarios/{scenarioId}/conditions` | save |
| deleteCondition | DELETE | `/api/scenarios/{scenarioId}/conditions/{changeId}` | delete |
| fetchResults | GET | `/api/scenarios/{scenarioId}/results` | search |
| fetchSimulationProgress | GET | `/api/scenarios/{scenarioId}/simulate/progress` | search |

### m-mpn/src/simulation/tooling-provisioning/tooling-provisioning-api.ts
- 호출 화면: toolingProvisionMng

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchPlannedToolingOrders | GET | `/api/planned-tooling-orders?…` | search |
| fetchToolPeggingRecords | GET | `/api/tool-pegging-records?…` | search |

### m-mpn/src/workorder/resource-gantt/api.ts
- 호출 화면: workOrderResourceGantt

| 함수 | 메서드 | basePath (`/api` 이하) | 제안 action |
|---|---|---|---|
| fetchWorkOrders | GET | `/api/schedules/{scheduleId}/work-orders` | search |
