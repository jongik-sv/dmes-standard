# 식별자 용어집

본 문서는 DMES/APS/MES 코드와 설계서에서 `Id`, `Code`, `Cd`, `No`, `Seq` 같은 식별자 suffix 를 어떻게 구분할지 정리한다.

목표는 세 가지다.

- 내부 PK, 업무 코드, 발번 번호를 이름만 보고 구분한다.
- UX 라벨은 사용자가 이해하는 업무 용어로 노출하고, 내부 구현 키를 그대로 보여주지 않는다.
- 기존 DB/As-Is 컬럼은 안전하게 보존하되, 신규 DTO/API/FE 타입에서는 의미가 드러나는 이름을 사용한다.

## 0. 관련 문서 묶음

이 문서는 식별자 표준의 허브다. 아래 문서에 흩어진 결정을 `Id` / `Code` / `Cd` / `No` / `Seq` / `ObjectId` 관점으로 묶어 적용한다.

| 영역 | 근거 문서 | 이 문서에서 흡수하는 내용 |
|---|---|---|
| 전역 진입점 | [RULE.md](../../../RULE.md) | 모든 작업에서 식별자 suffix 의미 구분은 본 문서를 따른다. |
| FE 표준 | [FrontEnd_표준_통합_개발가이드_v2.md](../FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md), [Local-Rules.md](../FrontEnd/Local-Rules.md) | `screenId` / `pageId` / `serviceId`, `componentPath`, FormGroup 라벨·tip, 버튼 action 코드 규칙. |
| BE 표준 | [BackEnd_표준_통합_개발가이드_v2.md](../BackEnd/BackEnd_표준_통합_개발가이드_v2.md) | `screenId = serviceId = pageId = beanName`, OASIS serviceId, BPMN 파일/프로세스 id 규칙. |
| 설계 산출물 | [design/02_화면_기능설계_가이드.md](../design/02_화면_기능설계_가이드.md), [design/04_백단_BPMN_기능설계_가이드.md](../design/04_백단_BPMN_기능설계_가이드.md) | 화면 식별자, 필드ID, 버튼ID, 팝업ID, DB 컬럼, action, BPMN id 정합성. |
| RBAC/포털 | [RBAC-PATH-CONVENTION.md](../Security/RBAC-PATH-CONVENTION.md), [BFF-RBAC-토큰기반-권한검증-설계.md](../../framework/BFF-RBAC-토큰기반-권한검증-설계.md) | `OBJ_ID` 단일화, `/api/{moduleId}/{objId}/{actionId}`, `PermKey`, `OBJECT_ID == OASIS serviceId` 정합성. |
| DB/레거시 컬럼 | [{CLIENT}_컬럼명_표준_및_변환규칙.md](../../glossary/{CLIENT}_컬럼명_표준_및_변환규칙.md), [표준단어사전.md](표준단어사전.md) | `ID` / `CD` / `NO` / `SEQ` 물리명 토큰, `Idx -> ID`, `_GBN -> _TYPE`, {CLIENT} 원천 컬럼 변환 규칙. |
| 업무 용어 | [{CLIENT}_용어집.md](../../glossary/{CLIENT}_용어집.md), [{CLIENT}_프로세스_및_용어정리.md](../../glossary/{CLIENT}_프로세스_및_용어정리.md) | 업무명이 실제로 가리키는 대상과 사용자 라벨 기준. |
| 도메인 식별체계 | [reference/mls-reference.md](../reference/mls-reference.md), [작업지시_프로세스_new.md](../../analysis/작업지시_프로세스_new.md), [Aps-Design-Index.md](../../aps/Aps-Design-Index.md) | `LOT_NO` / `SLIT_NO`, 작업지시 `PD` / `MTRL`, APS ADR 식별체계 색인. |
| 화면별 결정 | `docs/{moduleId}/design/{screenId}/` 하위 분석리포트·기능설계서·BPMN설계서 | 화면 단위 `screenId` / `pageId` / `serviceId` / `OBJECT_ID` / 필드ID의 실제 적용값. |

정리 우선순위는 `DB/레거시 컬럼 의미 확인 -> BE/FE public contract 정규화 -> UX 라벨 정규화 -> 물리 rename 검토` 순서다. 물리 컬럼 rename 은 호환성 영향이 크므로 본 문서의 기본 작업 범위가 아니다.

## 1. 기본 원칙

1. `Id` 는 내부 식별자다. 시스템 PK, UUID, sequence 기반 surrogate key, 권한/화면 같은 시스템 메타 식별자에 사용한다.
2. `Code` 는 업무 코드다. 사용자가 입력, 검색, 대조하는 마스터 코드나 ERP 코드에 사용한다.
3. `No` 는 발번 번호다. 주문번호, 수주번호, LOT 번호, 전표번호처럼 문서/오더/실물 흐름에서 발급되는 번호에 사용한다.
4. `Cd` 는 DB 물리명 또는 레거시 raw row 경계에서만 허용한다. Java/TypeScript 도메인 타입에서는 `Code` 로 풀어 쓴다.
5. 화면 라벨은 `ID` 를 남발하지 않는다. 사용자에게 코드라면 `자재코드`, 번호라면 `오더번호`, 내부 PK 라면 `시스템 ID` 로 적는다.
6. 기존 DB 컬럼을 대량 rename 하지 않는다. 우선 API/DTO/FE 타입 alias 와 mapper 에서 의미를 명확히 한다.
7. 코드는 항상 의미를 수반한다. `Code` 는 단순히 unique 한 문자열이 아니라, 코드 그룹·도메인·표시명·검증 규칙·업무 분기 의미를 함께 가진 값이다.

### 1.1 `Code` 의 의미 원칙

`Code` 는 `Id` 와 다르다. `Id` 가 "같은 행/객체인가" 를 판별하는 내부 동일성이라면, `Code` 는 "업무적으로 무엇을 뜻하는가" 를 함께 말한다.

| 구분 | `Id` | `Code` |
|---|---|---|
| 핵심 질문 | 이 객체를 내부에서 어떻게 찾는가? | 이 값이 업무적으로 무엇을 뜻하는가? |
| 의미 보유 | 없어도 됨. opaque 해도 됨 | 반드시 있어야 함 |
| 예 | `scheduleId`, `permissionId`, `rowId` | `itemCode`, `resourceCode`, `statusCode`, `reasonCode` |
| 검증 기준 | 존재 여부, FK, 권한 범위 | 코드 그룹, 유효 기간, 사용 여부, 업무 상태 전이 |
| UX 노출 | 보통 숨김. 필요 시 시스템 ID | 사용자 검색·필터·선택의 주요 기준 |

따라서 신규 `*Code` 를 추가할 때는 최소한 다음 의미를 같이 정해야 한다.

- 코드가 속한 업무 도메인 또는 코드 그룹.
- 사용자 표시명과 검색 라벨.
- 변경 가능 여부와 폐기/비활성 처리 방식.
- 같은 코드값이 유일한 범위: 전역, 공장별, 거래처별, 화면별 등.
- 코드값이 로직 분기를 유발하는지 여부와 그 규칙.

`Code` 를 단지 DB PK 대용으로만 쓰면 안 된다. 실제로 의미가 없고 내부 참조만 필요하면 `Id`, 순서만 필요하면 `Seq`, 발급된 업무 문서/오더 번호이면 `No` 를 사용한다.

### 1.2 표준화 판단 순서

식별자 이름을 정리할 때는 suffix 만 보고 일괄 치환하지 않는다. 값의 역할을 먼저 판정한다.

1. 사람이 코드표, 마스터, ERP 원천값으로 이해하고 검색하는가? 그러면 `Code`.
2. 문서/오더/LOT/전표처럼 발번되어 현장이나 업무 프로세스에서 추적되는가? 그러면 `No`.
3. 시스템 내부 행, 실행, 권한, 화면, 객체를 찾는 opaque key 인가? 그러면 `Id`.
4. 단순 순번, 정렬순서, 라인번호, 반복 발생 index 인가? 그러면 `Seq`.
5. DB raw 컬럼이 `*_CD`, `*_ID`, `*_NO` 로 이미 굳어져 있는가? 물리명은 보존하고 DTO/FE 에서 의미 기준 이름으로 alias 한다.

## 2. Suffix 사전

| Suffix | 의미 | 사용 위치 | 예 | UX 라벨 |
|---|---|---|---|---|
| `Id` | 내부 식별자, 시스템 메타 식별자, surrogate key | Entity PK, DTO 내부 키, 권한/화면 메타 | `jigSeq` 제외 일반 `id`, `scenarioId`, `scheduleId`, `pageId`, `serviceId`, `objectId`, `permissionId` | 시스템 ID, 화면 ID, 권한 ID |
| `Code` | 의미를 가진 업무 코드, 마스터 코드, ERP 코드, 상태/사유/정책 코드 | 신규 Entity/DTO/FE domain 타입 | `itemCode`, `resourceCode`, `customerCode`, `vendorCode`, `operationCode`, `statusCode`, `reasonCode` | 자재코드, 자원코드, 고객코드, 상태코드, 사유코드 |
| `Cd` | legacy 물리 약어 | DB 컬럼, As-Is raw row, MCM/MES 레거시 매핑 | `DEPT_CD`, `LOCATION_CD`, `SCRAP_REASON_CD` | 부서코드, 위치코드, 폐기사유 코드 |
| `No` | 발번 번호, 문서 번호, LOT/전표/오더 번호 | 업무 흐름 Entity/DTO/FE | `orderNo`, `mtrlNo`, `batchNo`, `workOrderNo`, `lotNo` | 오더번호, 제품번호, 배치번호 |
| `Seq` | 순번, 내부 일련번호 | DB PK, 정렬, 화면 합성 key | `jigSeq`, `menuSeq`, `seqNo`, `sortSeq` | 순번, 정렬순서 |
| `Key` | 합성/캐시/맵 조회 키 | FE row key, engine cache, map key | `rowKey`, `cacheKey`, `targetKey` | 노출하지 않음 |
| `Ref` | 외부 참조 또는 원천 참조 | migration, interface, source trace | `reasonRef`, `sourcePo`, `workOrderRef` | 참조, 원천번호 |

## 3. 레이어별 규칙

| 레이어 | 규칙 |
|---|---|
| DB 물리 컬럼 | 기존 컬럼명 보존을 우선한다. `*_id` 가 실제로 코드 값을 담더라도 즉시 rename 하지 않는다. FK 설명과 Entity/DTO 명명으로 보완한다. |
| JPA Entity | 신규 필드는 의미 기준으로 `Code`/`No`/`Id` 를 선택한다. 기존 Entity 는 DB 호환이 우선이나, 주석에 실제 참조 대상을 명시한다. |
| DTO/API | 신규 public contract 는 의미 기준 이름을 사용한다. 기존 contract 는 alias 를 둔 뒤 단계적으로 deprecate 한다. |
| FE domain type | 화면 로직에서는 `Code`/`No` 를 우선 사용한다. raw API 응답 타입과 화면 domain 타입을 분리한다. |
| FE raw row | MCM처럼 As-Is SNAKE_CASE 를 보존해야 하는 경우 `RawRow` 또는 `*Row` 타입에 한정한다. 화면 내부 command/filter 타입은 camelCase 로 변환한다. |
| UX 라벨 | 사용자가 보는 라벨은 `코드`, `번호`, `시스템 ID` 를 구분한다. 내부 key 이름을 그대로 라벨로 쓰지 않는다. |

### 3.1 표준화 산출물

전수조사 결과는 코드 수정 전 다음 네 묶음으로 기록한다.

| 묶음 | 기록할 내용 | 예 |
|---|---|---|
| Entity/DB 식별자 | 물리 컬럼, Entity 필드, PK/FK 여부, 실제 값의 의미 | `item_id` 는 물리명은 ID 이지만 값은 `Item.itemCode` |
| API/DTO 식별자 | request/response 필드명, 기존 alias, 신규 권장명 | `itemId` 호환 유지, `itemCode` 신규 표준 |
| FE/UX 식별자 | 화면 state/filter/command 필드명, 라벨, placeholder, tip | 라벨 `품목 ID` -> `품목코드` |
| 권한/화면 식별자 | `screenId`, `pageId`, `serviceId`, `OBJECT_ID`, `objId`, action | `OBJECT_ID` 는 RBAC URL segment 이자 화면 식별자 |

이 네 묶음이 서로 맞지 않으면 물리 DB 보다 public contract 와 UX 를 먼저 정리한다. 물리 DB rename 은 마지막 단계에서 별도 migration 으로만 검토한다.

## 4. 프로젝트 표준 용어

### 4.1 APS / MPN

APS 는 현재 코드형 PK 와 `Id` 참조명이 섞여 있다. 신규 코드에서는 아래 표를 기준으로 한다.

| 개념 | 현재 대표 물리/엔티티 | 의미 | 신규 DTO/FE 권장 | 비고 |
|---|---|---|---|---|
| 품목/자재 | `Item.itemCode`, `items.item_code` | 업무 코드이자 Item PK | `itemCode` | 기존 `itemId` contract 는 alias 로 유지 |
| 품목 참조 | `item_id` | `Item.itemCode` 를 담는 FK | `itemCode` | DB 컬럼 rename 은 별도 migration |
| 공장 | `Plant.plantId`, `plants.plant_id` | 공장 코드이자 Plant PK | 단기 `plantId`, 장기 `plantCode` 검토 | 영향 범위가 커 단기 유지 |
| 자원 | `Resource.resourceCode`, `resources.resource_code` | 자원 코드이자 Resource PK | `resourceCode` | 기존 `resourceId` alias 유지 |
| 작업장 | `WorkCenter.workCenterCode`, `work_centers.work_center_code` | 작업장 코드이자 WorkCenter PK | `workCenterCode` | 기존 `workCenterId` alias 유지 |
| 공정 | `Operation.id`, `operationCode` | 내부 PK와 업무 코드가 모두 존재 | `operationId` 는 PK, `operationCode` 는 업무 코드 | 둘을 섞지 않음 |
| 고객 | `Customer.customerCode`, `customers.customer_code` | 고객 코드이자 Customer PK | `customerCode` | 기존 `customerId` alias 유지 |
| 공급업체 | `Vendor.vendorCode`, `vendors.vendor_code` | 공급업체 코드이자 Vendor PK | `vendorCode` | 이미 대체로 양호 |
| 단위 | `Uom.uomCode`, `uoms.uom_code` | 단위 코드이자 UOM PK | `uomCode`, `baseUomCode` | 기존 `uomId`, `baseUomId` alias 유지 |
| 계획 실행 | `planning_runs.id`, `plan_run_id` | 시스템 실행 ID | `planRunId` | 유지 |
| 스케줄 | `schedule_headers.schedule_id` | 시스템 실행 산출 ID | `scheduleId` | 유지 |
| 수요 | `demands.id`, `demand_id` | 시스템 수요 ID | `demandId` | 유지 |
| 계획오더 | `planned_orders.id`, `planned_order_id` | 시스템 계획오더 ID | `plannedOrderId` | 유지 |

주의: `itemId == itemCode`, `resourceId == resourceCode` 인 구간이 남아 있다. 이 값이 코드임을 명확히 해야 하는 신규 화면, 신규 API, 신규 테스트에서는 `itemCode`, `resourceCode` 를 우선 사용한다.

### 4.2 MPP 지그/금형

| 개념 | 표준명 | 의미 | UX 라벨 |
|---|---|---|---|
| 실물 내부 PK | `jigSeq` | 실물코드 미채번 상태에서도 한 행을 식별하는 surrogate key | 노출하지 않음 또는 시스템 ID |
| 실물 코드 | `jigId` | 현장 채번 실물 업무키. 기존 설계상 `JIG_ID` 명칭 유지 | 실물코드 |
| ERP 지그/금형 코드 | `erpCodeId` | ERP 원천 마스터 코드. 레거시 컬럼 `ERP_CODE_ID` 보존 | ERP 코드 |
| 오더 내부 PK | `jigOrderId` | 지그/금형 오더 surrogate key | 노출하지 않음 |
| 오더 번호 | `orderNo` | 제작/수리/검토 오더 번호 | 오더번호, 검토번호 |
| 위치 코드 | `locationCd` | 보유 위치 코드. DB/As-Is 약어 보존 | 위치코드 |
| 사유 코드 | `rejectReasonCd`, `scrapReasonCd` | MCM/공통코드 기반 사유 | 반려사유 코드, 폐기사유 코드 |

`jigId` 는 이름에 `Id` 가 있지만 현행 설계에서 이미 업무키로 굳어져 있다. 대량 rename 보다 주석/라벨/용어집으로 `실물코드` 의미를 고정한다.

### 4.3 MCM / 권한 / 포털

MCM 은 As-Is 컬럼명 보존과 시스템 메타 식별자가 많다. raw row 와 화면 command 를 분리한다.

| 개념 | DB/raw | domain/API 권장 | 의미 |
|---|---|---|---|
| 사용자 | `USER_ID` | `userId` | 로그인/권한 사용자 ID. 업무 코드가 아니라 계정 식별자 |
| 사번 | `USER_EMP_NO` | `userEmpNo` | 사람/임직원 번호 |
| SSO | `SSO_ID` | `ssoId` | 외부 인증 식별자 |
| 메뉴 | `MENU_ID` | `menuId` | 포털 메뉴 식별자 |
| 화면/객체 | `OBJECT_ID` | `objectId` 또는 FE RBAC props 에서는 기존 `objId` | 화면/RBAC 객체 식별자 |
| 권한 | `PERMISSION_ID` | `permissionId` | 권한 묶음 식별자 |
| 역할 | `ROLE_ID` | `roleId` | 역할 식별자 |
| 역할 그룹 | `ROLE_GROUP_ID` | `roleGroupId` | 역할 그룹 식별자 |
| 마스터 코드 | `MASTER_CODE` | `masterCode` | 코드 그룹/상위 마스터 코드 |
| 코드 ID | `CODE_ID` | `codeId` | MCM 코드 마스터의 PK. 사용자 라벨은 코드ID 허용 |
| 카테고리 | `CATEGORY_ID` | `categoryId` | MCM 코드 카테고리 식별자 |
| 코드 값 | `CODE_VAL` | `codeValue` | 실제 코드 값 |

MCM 화면에서 `OBJECT ID`, `PERMISSION ID`, `ROLE ID` 같은 라벨은 관리자 화면 맥락상 허용한다. 일반 업무 화면에서는 같은 습관을 가져오지 않는다.

### 4.4 공통 감사 컬럼

| DB 컬럼 | Java/TS 권장명 | 의미 |
|---|---|---|
| `C_USR_ID` | `createdBy` | 생성 사용자 |
| `C_AT` | `createdAt` | 생성 일시 |
| `C_SVC_ID` | `createdSvcId` | 생성 서비스 ID |
| `C_PGM_ID` | `createdPgmId` | 생성 프로그램 ID |
| `U_USR_ID` | `updatedBy` | 수정 사용자 |
| `U_AT` | `updatedAt` | 수정 일시 |
| `U_SVC_ID` | `updatedSvcId` | 수정 서비스 ID |
| `U_PGM_ID` | `updatedPgmId` | 수정 프로그램 ID |
| `VER` | `auditVersion` 또는 `version` | 감사/낙관락 버전 |

감사 컬럼은 DB 물리 약어를 유지하되, Entity/DTO 에서는 사람이 읽기 좋은 이름을 쓴다.

## 5. UX 라벨 표준

| 데이터 의미 | 권장 라벨 | 피할 라벨 |
|---|---|---|
| 자재 업무 코드 | 자재코드 | 자재 ID |
| 품목 업무 코드 | 품목코드 | 품목 ID |
| 자원 업무 코드 | 자원코드 | 자원 ID |
| 작업장 업무 코드 | 작업장코드 | 작업장 ID |
| 고객 업무 코드 | 고객코드 | 고객 ID |
| 공급업체 업무 코드 | 공급업체코드 | 공급업체 ID |
| 수주 번호 | 수주번호 | 수주 ID |
| 오더 번호 | 오더번호 | 오더 ID |
| 내부 PK | 시스템 ID | 코드, 번호 |
| 화면/RBAC 객체 | OBJECT ID 또는 화면 ID | 코드 |

화면 검색조건 placeholder 도 같은 규칙을 따른다.

- 좋은 예: `자재코드 입력 또는 검색`
- 좋은 예: `오더번호 부분 일치`
- 좋은 예: `상태코드 선택`
- 좋은 예: `사유코드 선택`
- 피할 예: `자재 ID 또는 이름 시작 일치`
- 피할 예: `ID/코드/번호` 처럼 한 필드에 의미가 다른 suffix 를 함께 나열

`코드` 라벨을 쓰는 화면 요소에는 가능한 한 표시명 또는 설명을 함께 둔다. 코드값만 단독 노출해야 하는 관리자 화면이 아니라면 `A01` 보다는 `A01 - 사용`, `HOLD - 보류` 처럼 사용자가 의미를 확인할 수 있어야 한다.

## 6. 변경 정책

### 6.1 신규 코드

- 값이 업무 코드이면 `Code` 를 사용한다.
- 값이 발번 번호이면 `No` 를 사용한다.
- 값이 내부 PK이면 `Id` 를 사용한다.
- DB raw row 가 아니라면 `Cd` 를 새로 만들지 않는다.
- 화면 state, filter, command 타입은 raw row 명칭을 그대로 쓰지 않는다.
- 신규 `*Code` 는 코드 그룹, 표시명, 유효성, 사용 범위를 함께 정의한다.

### 6.2 기존 코드 정리

1. DB 컬럼은 유지한다.
2. Entity 주석에 실제 참조 대상을 명시한다.
3. DTO/API 에 신규 필드를 추가한다.
4. 기존 필드는 alias 또는 deprecated 필드로 일정 기간 유지한다.
5. FE 는 신규 필드를 우선 읽고, 구 필드는 fallback 으로만 사용한다.
6. 테스트를 갱신해 신규 contract 를 고정한다.
7. 충분히 안정화된 뒤 구 필드 제거 여부를 별도 migration 으로 판단한다.

예:

```java
// 기존 contract 호환: itemId 는 받되 내부에서는 itemCode 로 정규화
String itemCode = firstNonBlank(request.getItemCode(), request.getItemId());
```

```ts
// FE fallback: 신규 itemCode 우선, 구 itemId 는 호환용
const itemCode = row.itemCode ?? row.itemId ?? "";
```

## 7. 리뷰 체크리스트

- [ ] 신규 public API 에 `itemId`, `resourceId`, `customerId`, `workCenterId`, `uomId` 를 추가했다면 실제 값이 코드인지 확인했다.
- [ ] 코드 값이면 신규 이름은 `*Code` 이고, 기존 `*Id` 는 alias/fallback 으로만 남겼다.
- [ ] 신규 `*Code` 에 코드 그룹, 표시명, 사용 범위, 변경 가능 여부가 정의되어 있다.
- [ ] 코드값이 로직 분기를 유발한다면 해당 분기 의미와 테스트가 함께 있다.
- [ ] 화면 라벨에 `ID` 를 썼다면 사용자에게 실제로 내부 식별자를 보여주는 상황인지 확인했다.
- [ ] MCM raw SNAKE_CASE row 를 화면 command/filter 타입으로 그대로 전파하지 않았다.
- [ ] DB 컬럼명이 `*_id` 이지만 코드 FK 인 경우 주석 또는 DTO mapper 에 참조 대상이 적혀 있다.
- [ ] `No` 와 `Seq` 를 혼동하지 않았다. 업무 발번은 `No`, 단순 순번/정렬은 `Seq` 다.
- [ ] 임시 row 식별자는 `rowId`, `tempId`, `__rowId` 등 화면 내부 전용 이름으로 두고 API 로 보내지 않았다.

## 8. 보류 결정

| 항목 | 현재 결정 |
|---|---|
| APS `plantId` | 기존 영향 범위가 커서 단기 유지. UX 라벨은 `공장코드`로 표준화하고, 장기적으로 `plantCode` alias 도입 검토 |
| MPP `jigId` | 현행 설계와 DB 컬럼 `JIG_ID` 를 유지. 의미는 `실물코드`로 고정 |
| MCM `objId` | FE `PageLayout`/RBAC props 에서 기존 `objId` 유지. 도메인 문서에서는 `objectId` 병기 |
| DB 물리 rename | 이번 용어집 적용 범위 밖. 별도 schema migration 과 API compatibility 계획이 있을 때만 수행 |
