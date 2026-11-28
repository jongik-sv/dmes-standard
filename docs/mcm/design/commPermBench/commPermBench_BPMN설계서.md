---
screenId: commPermBench
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mcm
moduleGroup: csa
작성일: 2026-11-27
작성자: Agent
---

# mcm 권한 작업대 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commPermBench` (= serviceId), 프로세스 이름 「권한 작업대」
> - BPMN 파일: `src/backend/mcm/api/src/main/resources/services/csa/commPermBench/commPermBench.bpmn`
> - OASIS 객체: `commPermBench`, Bean명: `commPermBenchService`
> - 진입 클래스: `com.dongkuk.dmes.mcm.csa.commPermBench.service.CommPermBenchService` (`mcm-core`). 11개 action 메서드는 아래 서비스에 위임한다.
> - UI→BFF: `POST /api/mcm/oasis/commPermBench/{action}`
> - BFF→BE: `POST /oasis/commPermBench/{action}`
> - 정본 계약: `docs/perm-bench/decompose.md §0.3`. 이 문서의 action, 요청 키, 응답 키, 컬럼은 그 표와 글자 그대로 같다.
>
> **명명 룰**: MES 단일 룰. serviceId = screenId = pageId = pageName = `commPermBench`.
>
> **Frontend 연계 값** (기능설계서 §1.2 와 같다): mesModule `m-mcm` / pageId `commPermBench` / 페이지 유형 D.

## §0. 환경 제약

분석리포트 §0 과 같다. 이 화면은 As-Is BPMN 이 없는 신규 화면이므로 「As-Is BPMN ↔ To-Be 매핑」은 해당 없음이고, §1.3 에 To-Be BPMN 구조를 직접 정의한다. 구현은 `perm-bench-be` 레인의 b1-b6 이 맡는다.

---

## 1. 프로세스 개요

> **표기 컨벤션**: DB 컬럼명과 테이블명은 SNAKE_CASE, 요청 키는 camelCase, 응답 컬럼은 §0.3 의 SNAKE_CASE 를 그대로 쓴다.

### 1.1 API 엔드포인트 총괄

| API-ID | Method | URL (WAS 경로) | 설명 | action (7 enum) | 트리거 |
|---|---|---|---|---|---|
| API-001 | POST | `/oasis/commPermBench/searchBench` | 사람, 그룹, 역할, 사람 ↔ 그룹, 그룹 ↔ 역할 목록 | search | 화면 진입, S-001-S-003, 돌아옴 |
| API-002 | POST | `/oasis/commPermBench/searchMenuTree` | 사람 또는 역할 기준 메뉴 트리와 보임 여부 | search | G1 행, G3 행, S-007, S-008 |
| API-003 | POST | `/oasis/commPermBench/explain` | 사람 × 화면의 버튼·팝업 판정과 켠 길 | search | G6 행, G1 행, S-008 |
| API-004 | POST | `/oasis/commPermBench/searchRolePerm` | 역할의 퍼미션과 오브젝트 허용 값 | search | G3 행, S-009, G6 행, S-008 |
| API-005 | POST | `/oasis/commPermBench/loadDraft` | 내 초안 읽기 | search | 화면 진입 |
| API-006 | POST | `/oasis/commPermBench/saveDraft` | 내 초안 전체 교체 | save | GB-001, GB-005-GB-008, B-004-B-007, B-013 |
| API-007 | POST | `/oasis/commPermBench/discardDraft` | 내 초안 버리기 | delete | B-002, B-014 |
| API-008 | POST | `/oasis/commPermBench/impact` | 저장된 초안의 영향 계산 | search | 초안 변경 뒤, B-001 |
| API-009 | POST | `/oasis/commPermBench/apply` | 초안 적용 (한 트랜잭션) | save | B-011 |
| API-010 | POST | `/oasis/commPermBench/searchHistory` | 적용 이력 목록 | search | B-003, B-012 |
| API-011 | POST | `/oasis/commPermBench/searchHistoryDtl` | 적용 이력 줄 | search | G13 행 |

- 단계: API-001-API-004 = 1단계, API-005-API-011 = 2단계. 3단계는 새 API 가 없다.
- FE 호출 경로는 `POST /api/mcm/oasis/commPermBench/{action}` 이다.

### 1.2 API 패턴 자동 판정 결과 (분석리포트 §11 인용)

| 항목 | 값 |
|---|---|
| C1-C6 충족 개수 (분석 §11.1 인용) | 0 |
| 채택 패턴 (3 enum) | OASIS 단일 BPMN |
| API 라우팅 enum (T3-D 결과) | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N |

### 1.3 BPMN 구조 (To-Be 직접 정의)

As-Is BPMN 이 없어 To-Be 구조를 정의한다. `sequenceFlow` 의 `name` 이 action 이름과 같다. `conditionExpression` 은 쓰지 않는다(oasis-contract-check 6-C-3).

| action (flow name) | flow id | serviceTask id | method | dto / grids | output | 응답 키 (data.result 안) |
|---|---|---|---|---|---|---|
| searchBench | flow_searchBench | searchBenchTask | searchBench | dto `CommPermBenchSearchBenchRequest` | result | users, groups, roles, userGroups, groupRoles, me |
| searchMenuTree | flow_searchMenuTree | searchMenuTreeTask | searchMenuTree | dto `CommPermBenchSearchMenuTreeRequest` | menus | menus |
| explain | flow_explain | explainTask | explain | dto `CommPermBenchExplainRequest` | result | buttons, paths |
| searchRolePerm | flow_searchRolePerm | searchRolePermTask | searchRolePerm | dto `CommPermBenchSearchRolePermRequest` | perms | perms |
| loadDraft | flow_loadDraft | loadDraftTask | loadDraft | (없음) | draft | draft |
| saveDraft | flow_saveDraft | saveDraftTask | saveDraft | `grids.changes.rows` → 파라미터 `changes` (`grid` 속성 쓰지 않음) | draft | draft |
| discardDraft | flow_discardDraft | discardDraftTask | discardDraft | (없음) | result | (없음) |
| impact | flow_impact | impactTask | impact | (없음. 저장된 초안을 읽는다) | result | summary, impacts |
| apply | flow_apply | applyTask | apply | dto `CommPermBenchApplyRequest` | result | result |
| searchHistory | flow_searchHistory | searchHistoryTask | searchHistory | dto `CommPermBenchSearchHistoryRequest` | his | his |
| searchHistoryDtl | flow_searchHistoryDtl | searchHistoryDtlTask | searchHistoryDtl | dto `CommPermBenchSearchHistoryDtlRequest` | dtl | dtl |

공통 규칙:

- `camunda:class` 는 모든 serviceTask 가 `commPermBenchService` 이다.
- 모든 serviceTask 에 `output` 을 명시한다(6-C-2). 그리드가 하나인 action 은 서비스 메서드가 `List` 를 돌려주고 `output="<그리드 키>"` 로 `grids.<키>.rows` 에 담는다(6-D-1). 그리드가 둘 이상인 searchBench, explain, impact 는 `Map<String,Object>` 를 돌려주고 `output="result"` 로 `data.result` 에 담으며, FE `unwrapPayload` 가 키를 펼친다(6-D-2). 응답 키는 컬럼 이름과 같다. b1 초안은 모든 task 가 `output="result"` 이므로 b1 이 위 표대로 고친다.
- 서비스 클래스에 `@Transactional` 을 쓰지 않는다(6-B-1). 트랜잭션은 process 속성 `<camunda:property name="tx" value="txBiz"/>` 로 둔다. 읽기 action 도 같은 속성 아래에서 돌지만 쓰기가 없어 영향이 없다.
- `serviceTask` 에 `grid` 속성을 쓰지 않는다(6-C-1). 저장 action `saveDraft` 는 `grids.changes.rows` 가 메서드 파라미터 `changes` 에 자동 연결된다(6-E-3, 이름이 글자 단위로 같아야 한다).
- 응답 컬럼 이름은 SNAKE_CASE 이고 요청 키는 camelCase 이다.
- 그래프 적재: `PermGraphLoader.loadForUsers` 는 사용자, 그룹, 역할, 퍼미션만 좁히고 오브젝트와 메뉴는 항상 전체를 읽는다(r2 계약).
- b1 초안 커밋(`016e6cf86`)의 BPMN 은 flow 이름, `method`, DTO 가 이 표와 같다. 다른 점은 `output` 이다(초안은 모두 `result`). 위 표대로 b1 이 고친다. process `tx` 는 cactus `DefaultTxInjectingServiceProvider` 가 기본 트랜잭션을 넣어 주므로 초안에 없어도 동작한다. `tx=txBiz` 는 process 수준에서 선언한다. apply serviceTask 에 두면 OASIS serviceTask 가 `tx` 속성을 받지 않아 `PropertyException` 이 난다. 값은 cactus 기본 주입과 같아 다른 action 도 같게 동작한다(설계 편차 기록).
- 구현 순서: b1 이 11개 분기를 모두 만든다. 2단계 메서드는 b2-b5 가 채우기 전까지 「아직 지원하지 않는 action」 `BusinessException` 을 던진다.

서비스 분담 (`BE` = `mcm-core/.../mcm/csa/commPermBench`):

| 클래스 | 맡는 action | 레인 항목 |
|---|---|---|
| `service/CommPermBenchService` | 11개 진입점. 조회 4개(searchBench, searchMenuTree, explain, searchRolePerm)는 위 두 클래스로 직접 처리하고 나머지는 아래 서비스에 위임한다 | b1 |
| `service/PermBenchGraphSource` | 그래프 적재(`PermGraphLoader`)와 초안 적용 그래프를 만든다. `PermResolver` 를 직접 부른다(`PermExplainService` 는 쓰지 않는다) | b1 |
| `repository/CommPermBenchQueryRepository` | searchBench, searchMenuTree, searchRolePerm 의 목록 조회(사람, 그룹, 역할, 메뉴, 퍼미션 행) | b1 |
| `service/PermDraftService` | loadDraft, saveDraft, discardDraft, 범위 지문 | b2 |
| `service/PermImpactService` | impact | b3 |
| `service/PermApplyService` | apply | b4 |
| `service/PermHistoryService` | searchHistory, searchHistoryDtl | b5 |
| `dto/*` | 요청 DTO 7종 | b1 |

BPMN 뼈대 (b1 이 만든다):

```xml
<bpmn:process id="commPermBench" name="권한 작업대" isExecutable="true">
  <bpmn:extensionElements>
    <camunda:properties><camunda:property name="tx" value="txBiz"/></camunda:properties>
  </bpmn:extensionElements>
  <bpmn:startEvent id="start"/>
  <bpmn:sequenceFlow id="flow_to_gw" sourceRef="start" targetRef="actionGateway"/>
  <bpmn:exclusiveGateway id="actionGateway">
    <bpmn:extensionElements><camunda:properties>
      <camunda:property name="input" value="action"/>
    </camunda:properties></bpmn:extensionElements>
  </bpmn:exclusiveGateway>
  <!-- action 11개마다 아래 3개 한 벌 -->
  <bpmn:sequenceFlow id="flow_apply" name="apply" sourceRef="actionGateway" targetRef="applyTask"/>
  <bpmn:serviceTask id="applyTask" name="초안 적용" camunda:class="commPermBenchService">
    <bpmn:extensionElements><camunda:properties>
      <camunda:property name="method" value="apply"/>
      <camunda:property name="output" value="result"/>
      <camunda:property name="dto" value="com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchApplyRequest"/>
    </camunda:properties></bpmn:extensionElements>
  </bpmn:serviceTask>
  <bpmn:endEvent id="endApply"/>
</bpmn:process>
```

### 1.4 요청과 응답 body 계약

**§0.3 편차 (조정자 추가)**: searchBench 응답에 그리드 `me` 가 더해졌다. 한 행이고 컬럼은 ME_SYSADMIN(Y/N)이다. 값은 검증기와 같은 DB 체인 규칙으로 구하고, 로그인 정보가 없으면 N 이다. FE 는 이 값으로 SYSADMIN 이 걸린 변경(V-009)을 미리 잠근다.

요청은 `{ "meta": { "userId": "...", "menuId": "commPermBench" }, "params": { ... }, "grids": { ... } }` 이다(Q-014). 서버는 요청의 `meta.userId` 를 믿지 않고 인증 정보의 사용자를 쓴다(초안 소유자, 적용자).

| API-ID | 요청 params (camelCase) | 요청 grids | 응답 키와 컬럼 (data.result 안) |
|---|---|---|---|
| API-001 | userQ, roleGroupId, roleId | - | users(USER_ID, USER_NM, DEPT_NM, USE_TP), groups(ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP, USER_CNT), roles(ROLE_ID, ROLE_NM, USE_TP, GROUP_CNT, USER_CNT, PERM_CNT), userGroups(USER_ID, ROLE_GROUP_ID), groupRoles(ROLE_GROUP_ID, ROLE_ID), me(ME_SYSADMIN) |
| API-002 | userId 또는 roleId, source (CUR, DRAFT) | - | menus(MENU_ID, PARENT_MENU_ID, MENU_NM, OBJECT_ID, SORT_SEQ, SHOW_TP, USE_TP, VISIBLE, REASON, OBJ_USE_TP) |
| API-003 | userId, objectId, source | - | buttons(CODE, KIND, ALLOWED, GRANTED, REASON, ROLES, GROUPS), paths(ROLE_GROUP_ID, ROLE_ID, BTN_PERM, POPUP_PERM) |
| API-004 | roleId, menuFolderId, source | - | perms(ROLE_ID, OBJECT_ID, OBJECT_NM, MENU_PATH, OBJ_BTN_PERM, OBJ_POPUP_PERM, OBJ_READ_PERM, BTN_PERM, POPUP_PERM, DATA_PERM) |
| API-005 | (없음) | - | draft(CHANGES_JSON, CHANGE_CNT, U_AT) |
| API-006 | (없음) | changes.rows (TP, KEY1, KEY2, OP, BTN_PERM, POPUP_PERM) | draft(CHANGES_JSON, CHANGE_CNT, U_AT) |
| API-007 | (없음) | - | (없음) |
| API-008 | (없음) | - | summary(GAIN_USER_CNT, LOSE_USER_CNT, SCREEN_CNT), impacts(USER_ID, USER_NM, OBJECT_ID, OBJECT_NM, GAINED, LOST. 앞 500줄) |
| API-009 | confirmLoss (Y, N), memo | - | result(APPLY_ID, CHANGE_CNT) |
| API-010 | fromDt, toDt, applyUserId | - | his(APPLY_ID, APPLY_USER_ID, APPLY_AT, CHANGE_CNT, GAIN_USER_CNT, LOSE_USER_CNT, APPLY_MEMO) |
| API-011 | applyId | - | dtl(SEQ_NO, TARGET_TP, KEY1, KEY2, OP_TP, BEFORE_VAL, AFTER_VAL) |

PermChange 한 줄 (요청 `grids.changes.rows` 의 행. D36: 컬럼은 TP, KEY1, KEY2, OP, BTN_PERM, POPUP_PERM 이고 `PermChange` 와 1:1 이다. 목록 입력은 `params` 가 아니라 `grids` 로만 받는다. `CHANGES_JSON` 의 원소는 같은 이름의 camelCase JSON `tp, key1, key2, op, btnPerm, popupPerm` 이다):

```json
{ "TP": "ROLE_OBJ", "KEY1": "ROLE_X", "KEY2": "commPermBench", "OP": "UPD",
  "BTN_PERM": "searchBench,explain", "POPUP_PERM": "" }
```

| 필드 | 값 | 설명 |
|---|---|---|
| TP | USER_GRP, GRP_ROLE, ROLE_OBJ | 변경 종류 |
| KEY1 | 문자열 | USER_GRP = USER_ID, GRP_ROLE = ROLE_GROUP_ID, ROLE_OBJ = ROLE_ID |
| KEY2 | 문자열 | USER_GRP = ROLE_GROUP_ID, GRP_ROLE = ROLE_ID, ROLE_OBJ = OBJECT_ID |
| OP | ADD, DEL, UPD | USER_GRP, GRP_ROLE 는 ADD, DEL 만 쓴다 |
| BTN_PERM, POPUP_PERM | 쉼표 목록 | ROLE_OBJ ADD, UPD 의 최종 값(증분이 아니다). DEL 에서는 비운다. DATA_PERM 은 싣지 않는다(D21) |

요청 예 (saveDraft):

```json
{ "meta": { "userId": "u0001", "menuId": "commPermBench" },
  "params": {},
  "grids": { "changes": { "rows": [
    { "TP": "USER_GRP", "KEY1": "u0100", "KEY2": "RG_CR_OPS", "OP": "ADD" },
    { "TP": "ROLE_OBJ", "KEY1": "ROLE_CR_OPERATOR", "KEY2": "mpp0123", "OP": "UPD",
      "BTN_PERM": "find,save", "POPUP_PERM": "lotPop" } ] } } }
```

응답 예 (apply 성공, 그리드 하나인 action):

```json
{ "meta": { "success": true },
  "grids": { "result": { "rows": [ { "APPLY_ID": "PA20261127101530123001", "CHANGE_CNT": 2 } ] } } }
```

응답 예 (searchBench, 그리드 여러 개인 action): `{ "data": { "result": { "users": [...], "groups": [...], "roles": [...], "userGroups": [...], "groupRoles": [...] } } }`

---

## 2. 프로세스별 BPMN 상세

### 2.1 화면 초기화 프로세스

```
[화면 진입]
    │
    ├──→ POST /oasis/commPermBench/loadDraft (API-005)          ← 병렬
    │         └─→ draft(CHANGES_JSON, CHANGE_CNT, U_AT)
    ├──→ POST /oasis/commPermBench/searchBench (API-001)        ← 병렬
    │         └─→ users, groups, roles, userGroups, groupRoles
    └──→ 두 응답이 모두 온 뒤
              │
              ├─→ 첫 사람(또는 진입 파라미터 roleId, Q-021)을 고른다
              ├─→ API-002 searchMenuTree (사람, source = 초안이 있으면 DRAFT, 없으면 CUR)
              ├─→ 첫 메뉴를 고르면 API-003 explain, API-004 searchRolePerm
              └─→ 초안이 있으면 API-008 impact
```

### 2.2 확인 프로세스 (1단계: 사람과 메뉴를 고르면 이유를 보여 준다)

```
[사람 행 클릭 (G1)] 또는 [S-007 / S-008 변경]
    ▼
POST /oasis/commPermBench/searchMenuTree (API-002)  { userId, source }   ← 미리보기 앱 창 메뉴
POST /oasis/commPermBench/searchMenuTree (API-002)  { roleId, source }   ← 메뉴 칸 트리 (고른 역할)
    (초안이 있으면 source = CUR 과 DRAFT 로 각각 한 번씩 불러 두 응답의 차이로 「새로, 사라짐」을 그린다. 화면 비교 표시용, S1)
    ▼
서버: PermGraphLoader.loadForUsers({userId}). 이 메서드는 사용자, 그룹, 역할, 퍼미션만 좁히고 오브젝트와 메뉴는 항상 전체를 읽는다(r2 계약)
      역할 기준은 역할 한정 로더(`loadForRoles`)가 나오기 전까지 `loadAll` 을 쓴다(Q-031)
      source = DRAFT 이면 그래프에 내 초안 변경을 PermGraph.applyChanges 로 적용
      사람 기준: PermResolver.visibleObjects(graph, userId) 로 VISIBLE, `explain(...).objectReason()` 으로 REASON 을 구한다
      역할 기준: PermResolver.objectsOfRole(graph, roleId) 로 VISIBLE 을 구하고 REASON 은 NO_PERM 만 쓴다(Q-031)
      폴더 행: 런타임 `SecUserService.getMyMenus` 의 폴더 규칙을 따른다. 숨김 폴더라도 보이는 화면의 상위 폴더면 행으로 나온다(hiddenYn). r5 대조 시험이 searchMenuTree 를 덮는다
    ▼
응답:
    ├─→ 200: menus (전체 트리, 폴더 포함). 미리보기 앱 창 메뉴를 다시 그린다
    ├─→ 200 + meta.success=false: 토스트
    └─→ 네트워크 오류: 토스트 + 이전 화면 유지

[메뉴 행 클릭 (G6)]
    ▼
POST /oasis/commPermBench/explain (API-003)  { userId, objectId, source }
    ▼
서버: PermResolver.explain(graph, userId, objectId)
      buttons = 오브젝트 허용 값 ∪ 퍼미션 값(오브젝트에 없는 값은 ALLOWED = N)
      GRANTED, REASON(GrantReason 또는 DenyReason), ROLES, GROUPS
      paths = 사람 → 그룹 → 역할 → 퍼미션 값 (켠 길 모두)
    ▼
응답: buttons, paths → 버튼·팝업 칩과 켠 역할 색 칩을 그린다

[역할 행 클릭 (G3) 또는 S-009 폴더 선택 또는 메뉴 행 클릭]
    ▼
POST /oasis/commPermBench/searchRolePerm (API-004)  { roleId, menuFolderId, source }
    │ 메뉴 칸의 등록 상태와 개수는 menuFolderId 없이 부른다. 퍼미션 편집 목록은 폴더로 좁혀 부른다(S2).
    │ 초안이 있으면 CUR 과 DRAFT 를 각각 불러 초안 열(+등록, -해제, ~버튼)을 그린다(S1)
    ▼
서버: 역할의 ROLE_PERM 행과 OBJ 허용 값, OBJ_READ_PERM = PermTokens.readPreset(허용 값)
      menuFolderId 가 있으면 그 폴더(하위 포함) 오브젝트만 돌려준다
    ▼
응답: perms → 퍼미션 편집 칩, 메뉴 칸 「버튼 n/m」
```

- 사용 안 함(USE_TP = N) 사용자: explain 은 모든 버튼을 GRANTED = N, REASON = NO_ROLE 로, 사람 기준 메뉴 트리는 모두 N, NO_ROLE 로 돌려준다. 런타임은 로그인에서만 막으므로 의도된 차이이고 r5 대조 시험에 기록한다.
- 역할 기준(S-007)에서는 API-002 를 `{ roleId, source }` 로 부른다. 응답 `VISIBLE` 은 그 역할의 퍼미션이 있는 메뉴가 Y 이다.
- 시스템 관리자 역할은 `searchRolePerm` 의 `perms` 가 비어 있고, 메뉴 `VISIBLE` 은 사용 중인 모든 오브젝트가 Y 이다(D13).

### 2.3 초안 편집 프로세스 (2단계)

```
[체크·칩 변경 (GB-005-GB-008, D-001, D-002, B-004-B-007, GB-001, B-013)]
    ▼
화면: 변경 목록을 다시 계산하고 300 ms 모은다. 응답 전에 낙관적으로 그린다
    ▼
POST /oasis/commPermBench/saveDraft (API-006)  grids.changes = 변경 전체
    │ (전체 교체. Q-018)
    ▼
서버(PermDraftService):
    1. V-004 구조 검사 (TP, OP, KEY1, KEY2) 와 V-008 중복 (TP, KEY1, KEY2) 검사 (PERM_BAD_VALUE)
    2. V-003 SYSADMIN 역할의 값 편집 거절, V-009 SYSADMIN 범위 변경은 SYSADMIN 사용자만 (PERM_FORBIDDEN)
    2-1. V-001 BTN 비어 있음 (PERM_EMPTY_BTN), V-002 오브젝트 허용 값의 부분집합 (PERM_NOT_IN_OBJ) 을 먼저 검사한다. apply 가 다시 검사한다
    2-2. USER_GRP, GRP_ROLE 의 ADD 가 이미 있거나 DEL 이 없는 변경은 그대로 담는다. apply 가 아무 일도 하지 않는다(Q-032). ROLE_OBJ ADD 가 이미 있는 행이면 apply 가 upsert 한다(BTN, POPUP 갱신, DATA_PERM 유지). 토큰 집합이 같을 때만 no-op 이다(PermGraph.applyChanges 와 같다)
    2-3. BTN 이나 POPUP 값이 1,000자를 넘으면 PERM_BAD_VALUE
    3. 변경이 0건이면 내 초안 행을 지우고 draft(빈 값) 반환
    4. 변경의 범위 키를 모은다: USER_GRP → `user:KEY1`, GRP_ROLE → `group:KEY1`, ROLE_OBJ → `role:KEY1`
    5. 기존 BASE_FP_JSON 에 없는 범위만 지금 지문을 계산해 더한다.
       더 이상 쓰이지 않는 범위는 뺀다
    6. TB_MCM_SEC_PERM_DRAFT 를 OWNER_USER_ID 로 upsert
       (DRAFT_JSON, BASE_FP_JSON, CHANGE_CNT, VER)
    ▼
응답:
    ├─→ 200: draft → 초안 막대 갱신, 이어서 API-008 impact, API-002/003/004 (source = DRAFT) 다시 읽기
    ├─→ 200 + meta.success=false: 직전 초안으로 되돌리고 토스트
    └─→ 네트워크 오류: 되돌리고 토스트
```

### 2.4 영향 프로세스 (2단계)

```
[초안 변경 뒤 또는 B-001]
    ▼
POST /oasis/commPermBench/impact (API-008)  (본문 없음)
    ▼
서버(PermImpactService):
    1. 내 초안을 읽는다. 없으면 summary 0, impacts 빈 목록
    2. 영향 후보 사람 집합을 적용 전 그래프와 적용 후 그래프의 합집합으로 구한다
         USER_GRP → 그 사람
         GRP_ROLE → 그 그룹의 사람 전체 (before 와 after 모두)
         ROLE_OBJ → 그 역할을 받은 사람 전체 (before 와 after 모두)
         역할 한정 로더(`loadForRoles`)가 나오기 전에는 `loadAll` 을 쓴다(Q-031)
    3. before = 후보 그래프, after = before.applyChanges(초안)
    4. ImpactCalculator.diff(before, after) → 사람 × 오브젝트 gained, lost (action 차이만 센다).
       메뉴 보임만 달라지는 화면은 visibleObjects 를 따로 비교해 SCREEN_CNT 에 더한다
    5. summary: GAIN_USER_CNT(gained 가 있는 사람), LOSE_USER_CNT, SCREEN_CNT(오브젝트 종류 수)
    6. impacts: 사람 × 오브젝트 줄 앞 500줄. `UserImpact` 의 gained, lost 정렬은 이 서비스가 한다
    ▼
응답: summary, impacts
```

- 시험 목표: 역할 1개, 사람 1,000명 표본에서 2초 이하(b3 측정).
- 측정(계산만, 실제 resolver): 보통 16 ms, 같은 유효 역할을 가진 서로 다른 그룹 조합 1,000개 26 ms, SYSADMIN 을 1,000명 그룹에 줄 때 28 ms(앞 500줄만 만든다). 사람마다 역할 집합이 모두 다르면 5,870 ms 라 perm-runtime 의 메모 수정을 기다린다. 묶음 키는 (적용 전, 적용 후) 유효 역할 집합이다.

### 2.5 적용 프로세스 (2단계)

```
[B-011 적용 실행] (선행: P-001 열림, LOSE_USER_CNT ≥ 1 이면 D-005 체크)
    ▼
POST /oasis/commPermBench/apply (API-009)  { confirmLoss, memo }
    ▼
서버(PermApplyService, process 수준 tx=txBiz 한 트랜잭션). 승인된 실제 순서:
    1. 내 초안 행을 FOR UPDATE 로 읽는다
    2. 범위 행을 잠근다. 변경의 범위 행에 더해 잠그기만 하는 먼 쪽 키도 잠근다
         USER_GRP → `user:KEY1` 과 `group:KEY2`
         GRP_ROLE → `group:KEY1` 과 `role:KEY2`
         ROLE_OBJ → `role:KEY1` 과 `object:KEY2`
       모든 잠금은 하나의 (종류, 키) 오름차순으로 잡는다. 잠금 대기는 FOR UPDATE WAIT 5 이고
       시간 초과나 교착이면 PERM_BUSY 를 돌려준다
    3. 검증기(APPLY 모드): V-005 적용할 초안 없음, V-006 메모 길이(둘 다 VALIDATION_ERROR),
       V-004 구조, V-008 중복, V-003 SYSADMIN 역할 값 편집, V-009 SYSADMIN 범위 변경(PERM_FORBIDDEN),
       V-001 빈 BTN(PERM_EMPTY_BTN), V-002 오브젝트 허용 값 안(PERM_NOT_IN_OBJ, UPD 는 편집한 값만 쓰고 오브젝트 밖 옛 값은 버린다. Q-033),
       BTN, POPUP 값 1,000자 초과(PERM_BAD_VALUE), 대상 존재(XV-003, 검증기의 NOT_FOUND)
       - 잠근 뒤에 판정하므로 사라진 대상은 NOT_FOUND 이고, DEL 대상이 사라졌으면 no-op 이다
    4. 지문: 범위마다 지금 지문을 다시 계산해 BASE_FP_JSON 과 비교한다. 다르면 PERM_CONFLICT (충돌 범위 목록, XV-002).
       초안의 범위가 BASE_FP_JSON 에 없으면 PERM_DRAFT_CORRUPT
    5. 영향을 §2.4 와 같은 규칙(적용 전 그래프와 적용 후 그래프의 합집합)으로 다시 계산한다
    6. 확인: LOSE_USER_CNT ≥ 1 이고 confirmLoss ≠ Y 이면 PERM_NEED_CONFIRM (XV-001)
    7. 쓴다
         USER_GRP → TB_MCM_SEC_USER_MAPPING insert/delete
         GRP_ROLE → TB_MCM_SEC_ROLEGROUP_MAPPING insert/delete
         ROLE_OBJ → TB_MCM_SEC_ROLE_PERM upsert/delete (DATA_PERM 은 그대로)
       DEL 이 no-op 인지는 영향받은 행 수로 판정한다. flush 때 제약 위반이 나면 PERM_CONFLICT 로 돌려준다
    8. TB_MCM_SEC_PERM_HIS 한 줄(GAIN_USER_CNT, LOSE_USER_CNT 는 5번의 값), TB_MCM_SEC_PERM_HIS_DTL 실제로 쓴 줄 수만큼
    9. 내 초안 행을 지운다
   10. 커밋 뒤(AFTER_COMMIT)에 RoleChangedEvent 를 발행한다. roleIds = ROLE_OBJ 의 KEY1, GRP_ROLE 의 KEY2, USER_GRP 그룹이 가진 역할(적용 전과 후의 합집합)
    ▼
응답:
    ├─→ 200: result(APPLY_ID, CHANGE_CNT) → 알림, 초안 막대 비움, 현재 값 다시 읽기
    ├─→ PERM_CONFLICT: P-003 (충돌 범위 목록)
    ├─→ PERM_NEED_CONFIRM: P-001 의 D-005 강조 (LOSE_USER_CNT 는 impact 응답으로 이미 알고 있다)
    ├─→ PERM_NOT_IN_OBJ, PERM_EMPTY_BTN: 해당 칩 묶음 아래 에러 + 토스트. 초안은 그대로 둔다
    ├─→ PERM_BUSY: 토스트 「다른 변경이 진행 중입니다. 잠시 뒤 다시 적용하세요」. 초안은 그대로 둔다
    ├─→ PERM_DRAFT_CORRUPT: 토스트. 초안을 버리고 다시 만들게 한다
    └─→ 그 밖의 `BusinessException`: 토스트. 전체 롤백
```

- 어느 단계에서 실패해도 전체를 롤백한다. 초안은 지워지지 않는다.
- 두 관리자가 겹치는 범위를 동시에 적용하면 2번의 잠금으로 직렬화되고, 늦게 들어온 쪽이 4번에서 PERM_CONFLICT 를 받는다.

### 2.6 초안 버리기 프로세스 (2단계)

```
[B-002 또는 B-014]
    ▼
확인 창 (B-014 는 생략)
    ▼
POST /oasis/commPermBench/discardDraft (API-007)
    ▼
서버: 내 초안 행 삭제 (없으면 그대로 성공)
    ▼
응답: 200 → 초안 막대 비움, 현재 값 다시 읽기 (API-001-API-004 source = CUR)
```

### 2.7 적용 이력 프로세스 (2단계)

```
[B-003] → P-002 열기 → POST /oasis/commPermBench/searchHistory (API-010)
    │ { fromDt, toDt, applyUserId }
    ▼
서버: TB_MCM_SEC_PERM_HIS 를 APPLY_AT 내림차순으로 조회한다. 기간 조건(S-010, S-011)으로 범위를 좁힌다
    ▼
응답: his

[G13 행 클릭] → POST /oasis/commPermBench/searchHistoryDtl (API-011)  { applyId }
    ▼
서버: TB_MCM_SEC_PERM_HIS_DTL 을 SEQ_NO 오름차순으로 조회
    ▼
응답: dtl
```

### 2.8 충돌 처리 프로세스 (2단계)

```
[apply → PERM_CONFLICT: user:u0100,role:ROLE_X]
    ▼
P-003 열기. 충돌 범위 목록을 사람, 그룹, 역할 이름으로 풀어서 보인다
    │
    ├─→ [B-013 충돌 범위의 변경 빼기]
    │       변경 목록에서 범위 키가 겹치는 줄을 지우고 saveDraft (API-006)
    │       빠진 범위의 지문은 서버가 버리고, 다시 건드리면 새 지문을 잡는다
    ├─→ [B-014 초안 버리고 다시 읽기] → discardDraft (API-007) → searchBench (API-001)
    └─→ [닫기] 초안은 그대로 둔다 (다시 적용하면 같은 충돌이 난다)
```

---

## 3. 에러 처리 매트릭스

OASIS 실행기는 비즈니스 거부(mcm 공통 `BusinessException`, `ErrorCode` 는 구현이 정한다)를 HTTP 200 + `meta.success=false` + `meta.message` 로 돌려준다(Q-013, `commRoleMng/api.ts:80-90`). 아래 「의미상 HTTP」는 가이드의 분류이고, 「실제 전달」은 구현이 따르는 방식이다. 코드는 `meta.message` 맨 앞에 `CODE: 상세` 로 둔다.

| 의미상 HTTP | 에러 코드 | 실제 전달 | 화면 처리 | 사용자 메시지 |
|---|---|---|---|---|
| 400 | VALIDATION_ERROR (V-005 적용할 초안 없음, V-006 메모 1,000자 초과) | 200 + success=false | 토스트(error) | 기능설계서 §6 문구 |
| 401 | UNAUTHORIZED | 포털 처리 | 로그인 페이지 리다이렉트 | - |
| 403 | FORBIDDEN (토큰 없음) | 포털 게이트 | 토스트(error) | 「권한이 없습니다」 |
| 404 | NOT_FOUND (XV-003) | 200 + success=false | 토스트(warning) + 다시 읽기 | 「변경 대상이 없습니다: {키}」 |
| 409 | **PERM_CONFLICT** | `PERM_CONFLICT: user:u1,role:R2` | P-003 | 「다른 변경과 겹쳤습니다: {범위}. 초안을 정리한 뒤 다시 적용하세요.」 |
| 422 | **PERM_NEED_CONFIRM** | `PERM_NEED_CONFIRM: {LOSE_USER_CNT}` | P-001 확인 체크 강조 | 「버튼을 잃는 사람이 {n}명 있습니다. 확인한 뒤 적용하세요.」 |
| 422 | **PERM_NOT_IN_OBJ** | `PERM_NOT_IN_OBJ: {ROLE_ID}/{OBJECT_ID}/{코드목록}` | 칩 묶음 아래 에러 + 토스트 | 「오브젝트가 허용하지 않는 값이 있습니다: {값}」 |
| 422 | **PERM_EMPTY_BTN** | `PERM_EMPTY_BTN: {ROLE_ID}/{OBJECT_ID}` | 칩 묶음 아래 에러 + 토스트 | 「버튼을 하나 이상 켜야 합니다. 모두 끄려면 퍼미션을 빼세요.」 |
| 403 | **PERM_FORBIDDEN** (V-009, Q-029) | `PERM_FORBIDDEN: {ROLE_ID 또는 그룹}` | 토스트, 직전 초안으로 되돌림 | 「시스템 관리자 권한이 걸린 변경은 시스템 관리자만 할 수 있습니다.」 |
| 409 | **PERM_BUSY** (잠금 대기 5초 초과, 교착) | `PERM_BUSY: {상세}` | 토스트, 초안 유지 | 「다른 변경이 진행 중입니다. 잠시 뒤 다시 적용하세요.」 |
| 500 | **PERM_DRAFT_CORRUPT** (초안의 범위가 기준 지문에 없음) | `PERM_DRAFT_CORRUPT: {범위}` | 토스트, 초안 버리기 안내 | 「초안이 손상되었습니다. 초안을 버리고 다시 만드세요.」 |
| 400 | **PERM_BAD_VALUE** (V-004, V-008, BTN·POPUP 값 1,000자 초과) | `PERM_BAD_VALUE: {상세}` | 토스트, 직전 초안으로 되돌림 | 「초안 변경 값이 올바르지 않습니다.」 |
| 422 | BUSINESS_RULE_VIOLATION (V-003) | 200 + success=false | 토스트 | 서버 문구 |
| 500 | INTERNAL_ERROR | 200 + success=false 또는 5xx | 토스트(error) | 「서버 오류가 발생했습니다」 |
| timeout | - | - | 로딩 해제 + 토스트 | 「요청 시간이 초과되었습니다」 |
| network | - | - | 로딩 해제 + 토스트 | 「네트워크 연결을 확인해주세요」 |

- 오류는 mcm 공통 `BusinessException` 으로 던지고 문구는 `CODE: 상세` 이다. mcm-core 는 oasis 에 의존하지 않는다(ArchUnit). 실행기가 이를 HTTP 200 + `meta.success=false` 로 바꾼다.
- 코드와 상세의 구분자는 첫 번째 `: ` 이다. FE 는 앞부분이 위 4개 코드 중 하나일 때만 코드별 처리를 하고, 아니면 전체 문구를 토스트로 보인다.
- apply 의 모든 에러는 롤백을 뜻한다.

---

## 4. 데이터 연동 및 부수 효과

### 4.1 상태 변경 시 부수 효과

| 상태 전이 | 부수 효과 | 대상 모듈 | 설명 |
|---|---|---|---|
| 초안 적용 성공 (apply) | USER_MAPPING, ROLEGROUP_MAPPING, ROLE_PERM 변경 | mcm | 변경 종류별로 한 곳씩 쓴다 |
| 초안 적용 성공 | PERM_HIS, PERM_HIS_DTL 추가 | mcm | 누가, 언제, 무엇을, 몇 명에게 |
| 초안 적용 성공 | 내 초안 행 삭제 | mcm | ST-002 → ST-001 |
| 초안 적용 성공 | `RoleChangedEvent` 를 `TransactionSynchronization` 의 afterCommit 에서 발행한다(구독자는 일반 `@EventListener`). 롤백이면 발행하지 않는다. 모두 no-op 이면 발행하지 않는다(Q-023) | mcm | `UserPermCache` 가 전체 무효화(D30) |
| 초안 저장 | PERM_DRAFT upsert | mcm | 관리자마다 1건 |
| 초안 버리기 | PERM_DRAFT 삭제 | mcm | |

### 4.2 참조 무결성

| 관계 | 제약 | 위반 시 |
|---|---|---|
| ROLE_PERM.ROLE_ID → TB_MCM_SEC_ROLE | FK, ON DELETE 없음 | 역할 삭제는 쓰는 퍼미션이 있으면 옛 화면이 막는다(D19) |
| ROLE_PERM.OBJECT_ID → TB_MCM_SEC_OBJ | FK, ON DELETE 없음 | 같음 |
| PERM_HIS_DTL.APPLY_ID → PERM_HIS | FK | 이력 머리 없이 줄을 넣을 수 없다 |
| 변경 대상 존재 | apply 가 XV-003 으로 확인 | 「변경 대상이 없습니다」 |

### 4.3 동시 수정 방지

```
이 화면은 updatedAt 비교 대신 범위 지문(SHA-256)을 쓴다 (D22).
saveDraft:  초안이 처음 건드린 범위(user:{USER_ID}, group:{ROLE_GROUP_ID}, role:{ROLE_ID})의
            지금 지문을 BASE_FP_JSON 에 저장한다.
apply:      범위 부모 행을 FOR UPDATE 로 잠근 뒤 지문을 다시 계산해 비교한다.
            다르면 PERM_CONFLICT.
지문 입력:  user  = 정렬한 ROLE_GROUP_ID 목록 (USER_MAPPING)
            group = 정렬한 ROLE_ID 목록 (ROLEGROUP_MAPPING)
            role  = 정렬한 `OBJECT_ID|BTN_PERM|POPUP_PERM|DATA_PERM` 줄 (ROLE_PERM)
            비어 있는 범위는 빈 문자열의 해시로 취급한다.
원래 화면 저장이 같은 행을 바꿨어도 같은 방식으로 감지한다 (3단계).
같은 관리자가 탭 두 개로 saveDraft 하면 마지막 저장이 이긴다 (초안은 관리자마다 1건).

지문 검사가 막지 못하는 틈 (S10):
  1. 옛 화면 저장은 부모 행을 잠그지 않는다(S10-1, 갱신 손실). apply 의 4번 지문 비교와 커밋 사이에 같은 범위를 옛 화면이 저장하면 감지되지 않는다.
  2. TB_MCM_SEC_USER 행을 잠그면 그 행을 갱신하는 다른 경로(로그인 등)가 apply 가 끝날 때까지 기다릴 수 있다.
  3. 서로 겹치지 않는 범위지만 영향이 겹치는 두 apply 는 직렬화되지 않는다. GAIN/LOSE 수와 확인 결정이 최종 상태와 다를 수 있다.
  4. 잠금 대기는 FOR UPDATE WAIT 5 이고 시간 초과나 교착은 PERM_BUSY 이다. flush 때 제약 위반은 PERM_CONFLICT 이다.
  5. 초안의 범위가 기준 지문에 없으면 PERM_DRAFT_CORRUPT 이다. DEL no-op 은 영향받은 행 수로 판정한다.
  대안 후보: USER 범위는 USER 행 대신 USER_MAPPING 의 해당 사용자 행을 잠근다. 구현(b4)이 부하를 재 본 뒤 정한다. 이 틈은 알려진 한계로 남긴다.
```

### 4.4 트랜잭션 경계

| 액션 | 트랜잭션 범위 | 비고 |
|---|---|---|
| searchBench, searchMenuTree, explain, searchRolePerm | process 기본 트랜잭션, 읽기만 | 같은 `PermResolver` 를 쓰는 순수 계산이다(D24) |
| loadDraft, searchHistory, searchHistoryDtl | 읽기만 | |
| saveDraft | 초안 한 줄 upsert | 지문 계산 읽기 포함 |
| discardDraft | 초안 한 줄 삭제 | 멱등 |
| impact | 읽기만 | 쓰지 않는다 |
| apply | 한 트랜잭션: 잠금 → 검증 → 쓰기 → 이력 → 초안 삭제 | 실패하면 전체 롤백. 이벤트는 커밋 뒤 |

### 4.5 이력 값 형식 (b4 구현 기준, Q-017 해소)

| 항목 | 형식 |
|---|---|
| APPLY_ID | `PA` + KST `yyyyMMddHHmmssSSS` + 일련 3자리 (총 22자) |
| SEQ_NO | 초안 순서대로 1부터 |
| OP_TP | 실제로 한 일. ROLE_OBJ ADD 인데 행이 이미 있으면 UPD 로 적는다 |
| USER_GRP, GRP_ROLE 의 BEFORE_VAL, AFTER_VAL | ADD: `N` → `Y`, DEL: `Y` → `N` (연결 있음 여부) |
| ROLE_OBJ 의 BEFORE_VAL, AFTER_VAL | `BTN=코드,코드\|POPUP=코드`. POPUP 이 비면 `POPUP=`. 행이 없으면 null. 2,000자를 넘으면 자르고 끝에 `…` 를 붙인다 |
| KEY1, KEY2 | PermChange 의 key1, key2 그대로 |
| PERM_HIS.CHANGE_CNT | 실제로 쓴 줄 수 |
| PERM_HIS.GAIN_USER_CNT, LOSE_USER_CNT | apply 때 다시 계산한 값 |
| 모두 아무 일도 하지 않은 apply | 머리는 CHANGE_CNT 0 으로 남기고 초안은 지운다. 이벤트는 발행하지 않는다 |

---

## 5. 화면 생명주기

| 단계 | 이벤트 | 동작 | 호출 액션 |
|---|---|---|---|
| onMount | 화면 진입 | 내 초안과 목록을 읽고 첫 사람, 첫 메뉴를 고른다(§2.1) | loadDraft, searchBench, searchMenuTree, explain, searchRolePerm, impact |
| onFocus | 3단계 링크로 나갔다 돌아옴 | 목록과 현재 보기를 다시 읽는다. 초안이 현재와 겹치면 적용 때 충돌로 알린다 | searchBench, searchMenuTree, explain, searchRolePerm |
| onUnmount | 화면 이탈 | 초안은 서버에 있으므로 저장하지 않은 변경만 막는다. 모아 둔 saveDraft(300 ms)가 남았으면 보낸 뒤 이동한다 | saveDraft |
| onBeforeUnload | 새로고침, 닫기 | 보내지 않은 saveDraft 가 있으면 브라우저 기본 확인 | - |

---

## 6. 특이사항 / 설계 결정

### 6.1 [확인필요] 인용 (분석리포트 §13 의 BPMN 관련만)

| 분석리포트 §13 ID | 항목 | 분류 | 영향도 | 결정 | 근거 | 상태 |
|---|---|---|---|---|---|---|
| Q-010 | 읽기 프리셋과 새 action | 권한 | 높음 | perm-core 가 `explain` 을 readPreset 에 넣었다. `impact`, `loadDraft` 는 조회 전용에 주지 않는다(기능설계서 §8) | 없음 | resolved (perm-core 가 `explain` 을 readPreset 에 넣었다(조정자 답변)) |
| Q-011 | 사람 목록 페이지 | API | 중간 | 서버가 USER_ID 순 200건으로 자른다. 넘으면 찾기로 좁히라는 안내를 보인다. 200 은 설계 기본값 | 필요하면 `pageNo` 추가 요청 | resolved (상한 200건, 페이지 칸 없음, 잘림 안내는 FE(조정자 답변)) |
| Q-012 | searchBench 의 roleGroupId, roleId | API | 낮음 | 사람 목록을 그 그룹·역할을 받은 사람으로 좁힌다 | b1 이 확인 | open |
| Q-013 | 에러 전달 방식 | 에러 | 중간 | 실제 방식. 코드를 `meta.message` 앞에 `CODE: 상세` 로 둔다 | b1 이 확인 | open |
| Q-014 | 요청 body 모양 | API | 중간 | 실제 코드 방식(oasis-contract-check 6-E) | 가이드 정리는 별도 | resolved (D36: 목록 입력은 모두 grids) |
| Q-016 | SYSADMIN 퍼미션 변경 거절 코드 | 에러 | 낮음 | PERM_FORBIDDEN 으로 대체(Q-029) | 없음 | resolved (Q-029 로 대체) |
| Q-017 | 이력 문자열 형식 | 데이터 | 낮음 | BPMN설계서 §4.5 에 b4 구현 기준으로 확정했다 | 없음 | resolved (b4 구현) |
| Q-018 | saveDraft 의미 | API | 중간 | 전체 교체(멱등) | 없음 | resolved (D36: 전체 교체) |
| Q-023 | 캐시 무효화 시점 | 부수효과 | 중간 | 커밋 뒤(`afterCommit`)에 발행한다 | b4 가 구현·시험 | resolved (AFTER_COMMIT 발행(조정자 답변)) |
| Q-024 | SORT_SEQ 출처 | 데이터 | 낮음 | `FULL_SEQ` | b1 이 확인 | open |
| Q-025 | 계산 칼럼의 값 규칙과 길이 | 데이터 | 낮음 | 폴더는 아래 메뉴 중 하나라도 보이면 Y. REASON 은 메뉴 행에만 채운다. 길이는 기능설계서 §3.2 에 `[Q-025]` 로 둔다 | b1 이 확인 | open |
| Q-029 | 시스템 관리자 범위 변경의 주체 | 권한 | 중간 | SYSADMIN 이 걸린 변경(GRP_ROLE 의 역할이 SYSADMIN, USER_GRP 로 SYSADMIN 을 가진 그룹에 넣기, ROLE_OBJ 의 역할이 SYSADMIN)은 SYSADMIN 사용자만 한다. 아니면 PERM_FORBIDDEN. 옛 화면 l2, l4 는 이번 회차에 그대로 두고 다음 회차 후보로 둔다 | 조정자 승인으로 확정했다 | resolved (조정자 승인 S7 A) |
| Q-031 | 역할 기준 메뉴 트리의 REASON | 데이터 | 낮음 | 조정자 답변을 따른다 | perm-runtime | open |
| Q-032 | 같은 변경의 재시도 | API | 낮음 | 기본안 반영 | 없음 | resolved (조정자 승인) |
| Q-033 | 오브젝트 밖 옛 값 | 데이터 | 낮음 | 기본안 반영 | 없음 | resolved (조정자 승인 S3 A) |

### 6.2 검토한 대안

| 대안 | 장점 | 단점 | 채택 | 사유 |
|---|---|---|---|---|
| action 마다 BPMN 을 따로 둔다 | 파일이 작다 | 같은 객체 `commPermBench` 에 파일이 11개가 되고 `actionGateway` 규약과 어긋난다 | × | 형제 화면이 단일 BPMN 이다 |
| 그리드마다 serviceTask 를 나눠 `output` 을 따로 둔다 | `grids.{key}.rows` 로 곧바로 간다 | 그래프를 서비스 호출마다 다시 읽어 계산이 중복된다 | × | 한 번 계산한 결과를 Map 으로 돌려주고 FE 가 펼친다(6-D-2) |
| apply 를 사람마다 나눠 여러 트랜잭션으로 한다 | 잠금이 짧다 | 중간 실패가 부분 적용으로 남는다 | × | 한 트랜잭션이 원자적이다(D22) |
| 커밋 전에 RoleChangedEvent 를 발행한다 | 구현이 단순하다 | 다른 요청이 옛 값을 캐시에 다시 올릴 수 있다 | × | 커밋 뒤 발행(Q-023) |
