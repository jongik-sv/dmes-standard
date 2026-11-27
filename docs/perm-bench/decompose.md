# 분해 초안 — perm-bench (권한 작업대 시안 v16)

- 작성: 2026-11-27 · 분해 서브에이전트(opus/high) · 상태 = 초안(사용자 확정 전)
- 기준: 통합 브랜치 `claude/perm-bench` = `origin/dev` 2619dea69
- 정본 규칙: `.claude/skills/coordinator/references/decompose.md` §2~§5, `templates/brief.md`
- 결정 D1~D6 = `WBS.md` 그대로. 아래는 D7 부터

---

## 0. 공용 계약(모든 레인이 이 절을 기준으로 시작)

계약은 c0·c1 항목이 코드로 고정한다. 그 전에는 이 절이 정본이다. 바꾸려면 조정자에게 요청한다.

### 0.1 테이블(V20)

| 테이블 | 칼럼(규칙 순서: PK → 필드 → VER → 감사) | 비고 |
|---|---|---|
| `TB_MCM_SEC_ROLE_PERM`(새) | `ROLE_ID varchar2(30 char)` PK·FK → `TB_MCM_SEC_ROLE` · `OBJECT_ID varchar2(50 char)` PK·FK → `TB_MCM_SEC_OBJ` · `BTN_PERM varchar2(1000 char) not null` · `POPUP_PERM varchar2(1000 char)` · `DATA_PERM varchar2(1000 char)` · `VER` · 감사 8칸 | 엔티티 `SecRolePerm` + `SecRolePermId`. FK = ON DELETE 없음 |
| `TB_MCM_SEC_OBJ`(칼럼 추가) | `BTN_PERM varchar2(1000 char)` · `POPUP_PERM varchar2(1000 char)` · `DATA_PERM varchar2(1000 char)` | 엔티티 필드 위치 = `PARAM` 뒤. 같은 V 파일에서 INVISIBLE→VISIBLE 재배치 |
| `TB_MCM_SEC_PERM_DRAFT`(새) | `OWNER_USER_ID varchar2(100 char)` PK · `DRAFT_JSON clob` · `BASE_FP_JSON clob` · `CHANGE_CNT number(10)` · `VER` · 감사 | 관리자마다 1건 |
| `TB_MCM_SEC_PERM_HIS`(새) | `APPLY_ID varchar2(40 char)` PK · `APPLY_USER_ID varchar2(100 char)` · `APPLY_AT timestamp(6)` · `CHANGE_CNT` · `GAIN_USER_CNT` · `LOSE_USER_CNT` · `APPLY_MEMO varchar2(1000 char)` · `VER` · 감사 | 적용 머리 |
| `TB_MCM_SEC_PERM_HIS_DTL`(새) | `APPLY_ID` PK·FK · `SEQ_NO number(10)` PK · `TARGET_TP varchar2(10 char)`(USER_GRP·GRP_ROLE·ROLE_OBJ) · `KEY1 varchar2(100 char)` · `KEY2 varchar2(100 char)` · `OP_TP varchar2(3 char)`(ADD·DEL·UPD) · `BEFORE_VAL varchar2(2000 char)` · `AFTER_VAL varchar2(2000 char)` · `VER` · 감사 | 적용 줄 |

- 옛 `TB_MCM_SEC_PERM`·`TB_MCM_SEC_ROLE_MAPPING` = 그대로 둔다. 이번 회차에 쓰기를 멈춘다(D10).
- 모든 새 칼럼 = `docs/db/column-comments-*.md` 와 V 파일 `comment on` 에 함께 적는다.

### 0.2 Java 계약(c1, 패키지 `com.dongkuk.dmes.mcm.security.perm`)

- `PermTokens` — `parse(csv)`(trim·빈 값 제거·순서 유지·중복 제거), `join(list)`, `notIn(values, allowed)`, `readPreset(allowed)`(D18 이름 규칙)
- `PermGraph`(record) — 사람→그룹, 그룹→역할, 역할 메타(USE_TP·유효 기간), 그룹 메타, 오브젝트 메타(SYSTEM_CODE·USE_TP·BTN_PERM·POPUP_PERM), 역할×오브젝트 퍼미션, 메뉴(OBJECT_ID·부모·표시·사용). `PermGraph applyChanges(List<PermChange>)` 순수 함수
- `PermChange`(record) — `tp`(USER_GRP·GRP_ROLE·ROLE_OBJ) · `key1` · `key2` · `op`(ADD·DEL·UPD) · `btnPerm` · `popupPerm`
- `PermResolver`(interface) — `Map<String,Set<String>> actionsOf(PermGraph, userId)`(OBJECT_ID → action 집합) · `Explain explain(PermGraph, userId, objectId)` · `Set<String> visibleObjects(PermGraph, userId)` · `Set<String> objectsOfRole(PermGraph, roleId)`
- `Explain`·`ButtonVerdict`(code·kind BTN/POPUP·granted·reason·viaRoles·viaGroups) · `DenyReason` enum(`NO_PERM`·`NOT_IN_OBJ`·`ROLE_UNUSED`·`GROUP_UNUSED`·`OBJ_UNUSED`·`MENU_HIDDEN`·`NO_ROLE`) · `GrantReason`(`PERM`·`SYSADMIN`)
- `PermGraphLoader`(interface) — `PermGraph loadForUsers(Set<String>)` · `PermGraph loadAll()`. 구현 2종 = r2
- `ImpactCalculator`(interface) — `List<UserImpact> diff(PermGraph before, PermGraph after)`. `UserImpact`(userId·objectId·gained·lost)
- 효과 계산 규칙(정본):
  - 역할×오브젝트 효과 = `(perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)`
  - SYSADMIN 역할 = 모든 사용 오브젝트 × `(obj.BTN ∪ obj.POPUP)`. 퍼미션 행 없음
  - 사용 안 함(역할·그룹·오브젝트) = 빠짐. 지금 `UserPermCache`·`SecUserService` 의 거르기 규칙을 그대로 옮긴다(r1 이 현재 규칙을 시험으로 먼저 고정)
  - 런타임 키 = `lower(SYSTEM_CODE ?: "mcm")/lower(OBJECT_ID)/action` — 지금과 같다(D26)

### 0.3 작업대 API(OASIS `services/csa/commPermBench/commPermBench.bpmn`, 객체 `commPermBench`)

| action | 단계 | 입력 params | 응답 grids(칸) |
|---|---|---|---|
| `searchBench` | 1 | `userQ`·`roleGroupId`·`roleId` | `users`(USER_ID·USER_NM·DEPT_NM·USE_TP) · `groups`(ROLE_GROUP_ID·ROLE_GROUP_NM·USE_TP·USER_CNT) · `roles`(ROLE_ID·ROLE_NM·MENU_ID·USE_TP·GROUP_CNT·USER_CNT·PERM_CNT) · `userGroups`(USER_ID·ROLE_GROUP_ID) · `groupRoles`(ROLE_GROUP_ID·ROLE_ID) |
| `searchMenuTree` | 1 | `userId` 또는 `roleId` · `source`(CUR·DRAFT) | `menus`(MENU_ID·PARENT_MENU_ID·MENU_NM·OBJECT_ID·SORT_SEQ·SHOW_TP·USE_TP·VISIBLE·REASON·OBJ_USE_TP) |
| `explain` | 1 | `userId`·`objectId`·`source` | `buttons`(CODE·KIND·ALLOWED·GRANTED·REASON·ROLES·GROUPS) · `paths`(ROLE_GROUP_ID·ROLE_ID·BTN_PERM·POPUP_PERM) |
| `searchRolePerm` | 1 | `roleId`·`menuFolderId`·`source` | `perms`(ROLE_ID·OBJECT_ID·OBJECT_NM·MENU_PATH·OBJ_BTN_PERM·OBJ_POPUP_PERM·OBJ_READ_PERM·BTN_PERM·POPUP_PERM·DATA_PERM) |
| `loadDraft` | 2 | - | `draft`(CHANGES_JSON·CHANGE_CNT·U_AT) |
| `saveDraft` | 2 | `changes`(PermChange 목록) | `draft` |
| `discardDraft` | 2 | - | - |
| `impact` | 2 | - (저장된 초안) | `summary`(GAIN_USER_CNT·LOSE_USER_CNT·SCREEN_CNT) · `impacts`(USER_ID·USER_NM·OBJECT_ID·OBJECT_NM·GAINED·LOST, 앞 500줄) |
| `apply` | 2 | `confirmLoss`(Y·N)·`memo` | `result`(APPLY_ID·CHANGE_CNT). 실패 = UserException `PERM_CONFLICT`(충돌 범위 목록) · `PERM_NEED_CONFIRM` · `PERM_NOT_IN_OBJ` · `PERM_EMPTY_BTN` |
| `searchHistory` | 2 | `fromDt`·`toDt`·`applyUserId` | `his`(APPLY_ID·APPLY_USER_ID·APPLY_AT·CHANGE_CNT·GAIN_USER_CNT·LOSE_USER_CNT·APPLY_MEMO) |
| `searchHistoryDtl` | 2 | `applyId` | `dtl`(SEQ_NO·TARGET_TP·KEY1·KEY2·OP_TP·BEFORE_VAL·AFTER_VAL) |

- 3단계 = 새 API 없음. 기존 화면 서비스를 그대로 쓴다.
- FE 타입 = `m-mcm/page-components/csa/commPermBench/types.ts` 가 위 칸 이름 그대로(f0).

### 0.4 옛 화면 API 변경(요약, l-항목이 구현)

- commPermMng: `searchCmPerm`(조건 roleId·menuId(모듈·폴더)·objectQ·codeQ·showEmpty, 페이지) → 줄 = 역할×오브젝트. `saveCmPerm` = PK merge·delete, ⊆ 검사, 빈 BTN 거절
- commRoleMng: `searchCmRole` + GROUP_CNT·USER_CNT·PERM_CNT · `searchCmRoleMap`/`saveCmRoleMap` → 새 퍼미션(ROLE_ID 기준) · `searchFolderObj`(새, 메뉴 폴더 오브젝트, 옛 `searchCmPerm`·`searchObjectLov` 대체) · `searchRoleGroups`(새, 들어 있는 그룹·사람 수)
- commObjMng: `searchCmObj` + BTN_PERM·POPUP_PERM·DATA_PERM·MENU_CNT·PERM_CNT · `saveCmObj` 응답에 빠진 값 영향(PERM_CNT·USER_CNT) · `searchObjPerm`·`searchObjMenu`(새)

---

## 1. 결정 목록(D7~)

| # | 결정 | 이유 |
|---|---|---|
| D7 | `BTN_PERM` 코드 = OASIS action 이름. 버튼 `action` = API action = 게이트 토큰 | 지금 게이트(`UserPermCache`)·버튼(`canDoButton`)이 이미 같은 토큰. 뜻이 하나라 403 과 버튼 표시가 어긋나지 않음 |
| D8 | `POPUP_PERM` = 그 오브젝트 안에서 팝업을 여는 action 코드(옛 `POPUP_BTN` 과 같은 뜻). 계산은 BTN 과 합집합. 팝업 화면 자체 권한 = 팝업 OBJECT_ID 의 퍼미션(지금 규칙 유지) | 지금 런타임이 POPUP_BTN 토큰을 action 으로 쓴다. 뜻을 바꾸면 옮긴 뒤 잃는 버튼이 생김 |
| D9 | 새 테이블 이름 = `TB_MCM_SEC_ROLE_PERM`(엔티티 `SecRolePerm`). 옛 `TB_MCM_SEC_PERM` 이름 재사용 안 함 | 옛·새 공존이 필요(대조·되돌리기). 이름을 바꿔 덮으면 되돌릴 수 없음 |
| D10 | 옛 테이블 2개 = 이번 회차에 지우지 않고 쓰기만 멈춤. 런타임 = 새 테이블. 속성 `mcm.security.perm-model=v2`(기본)·`legacy`(되돌림) | 시안 「옛 계산과 새 계산이 같을 때만 없앤다」. 삭제 V 파일 = 운영 대조 통과 뒤 다음 회차 |
| D11 | 옮기기: 옛 줄 (ROLE,OBJ,PERM_ID) 여럿 → 새 1건. `BTN_PERM = COMMON ∪ CUSTOM ∪ ACTION`(묶음 합집합), `POPUP_PERM = POPUP_BTN` 합집합 | `PERMISSION_ACTION` 도 지금 게이트 토큰(MDM 시드는 ACTION 칸만 씀). 데이터 권한 후보로 보내면 잃음. 시안 안 기각 |
| D12 | 오브젝트 허용 값 처음 채움 = (PERM_ALL 아닌 묶음 토큰 합집합) ∪ (그 오브젝트 BPMN `actionGateway` 분기 이름 + REST 보충 목록). PERM_ALL 토큰은 오브젝트 action 목록과 교집합만 | PERM_ALL(allActions ≈ 120개)은 모든 화면 공용 어휘. 그대로 합치면 모든 오브젝트 허용 값이 120개가 됨 |
| D13 | SYSADMIN = 퍼미션 행 없이 계산(모든 사용 오브젝트 × 허용 값 전부). SYSADMIN 옛 줄은 옮기지 않음. `CommObjMngService` 의 SYSADMIN 자동 매핑 삭제. PERM_ALL 시드 중단. `allActions` 선언은 어휘 목록으로 남기고 새 화면 action 추가 | 시안 「시스템 관리자는 퍼미션 없이 모든 버튼」. 소스 대조 시험 2개가 `allActions` 선언을 문자열로 읽음 |
| D14 | 버튼 없는 퍼미션 금지. 저장 때 BTN 비면 `PERM_EMPTY_BTN`. FE 는 마지막 칩 끄기 = 퍼미션 빼기(초안) | 행 있음 = 메뉴 보임(`filterMenusByRole`). 뜻을 하나로 둠. 시안 안 채택 |
| D15 | 오브젝트에서 값을 빼면 퍼미션 값은 남기고 계산에서 뺌(∩). 오브젝트 저장 응답 = 영향 퍼미션·사람 수. 퍼미션 저장 = ⊆ 검사(밖 값 `PERM_NOT_IN_OBJ`) | 시안 안 채택. 다시 넣으면 원래대로 돌아옴, 잘못 뺀 값 복구 쉬움 |
| D16 | 퍼미션에 USE_TP·유효 기간 없음 | 역할·오브젝트에 이미 있음. 칸 늘리면 계산 경우만 늘어남 |
| D17 | 버튼·팝업 코드 표시 = 이번 회차 코드 그대로. 라벨용 공통 코드 그룹 = backlog | 범위 축소(time 모드). 라벨 없어도 기능 같음 |
| D18 | 「조회만」 = `PermTokens.readPreset` 하나(이름 규칙 `search*`·`find*`·`get*`·`list*`·`lov*`·`*Lov`·`view`·`query`). 서버가 `OBJ_READ_PERM` 으로 내려줌 | 조회 화면도 `lov`·`searchObjectLov` 같은 보조 action 이 필요. FE·BE 규칙 중복 방지 |
| D19 | FK = ON DELETE 없음. 역할·오브젝트 삭제는 지금처럼 쓰는 퍼미션이 있으면 막음. 옮길 때 부모 없는 옛 줄 = 건너뛰고 건수를 V21 로그 표에 남김 | 지금 삭제 규칙(매핑 수 검사) 유지. 고아 줄 때문에 FK 생성 실패 방지 |
| D20 | 마이그레이션 = mcmapuser V20(DDL)·V21(데이터). V18·V19 는 다른 브랜치 미커밋 | `outOfOrder=false`. 그 브랜치가 dev 에 먼저 들어가야 함. 아니면 dev 머지 직전 번호 재조정(z6) |
| D21 | 이번 회차 범위 = 작업대 1~3단계 전부 + 옛 화면 3종(역할·오브젝트·퍼미션) 새 설계 + 역할 그룹 관리 BE 참조 전환. DATA_PERM = 칸 조회·저장 통과만, 편집 UI 없음 | 레인 5개로 병렬 가능. 1단계 계산을 런타임과 같은 코드로 두면 2단계 위험이 작음 |
| D22 | 초안 = 관리자마다 1건(변경 목록 JSON). 충돌 검사 = 초안이 처음 건드린 범위(사람·그룹·역할)의 현재 행 지문(SHA-256)을 저장, 적용 때 다시 계산해 다르면 `PERM_CONFLICT` | 옛 화면 저장 경로마다 버전 칼럼을 올릴 필요 없음 → 다른 브랜치가 고치는 파일 수정 회피. 3단계 「원래 화면 저장 뒤 충돌 알림」도 같이 해결 |
| D23 | 적용 이력 = 머리 + 줄 2테이블. 작업대 적용만 기록. 옛 화면 저장 기록 = backlog | 「누가·언제·무엇을·몇 명에게」를 조회 칸으로 답함 |
| D24 | 설명·영향·런타임 게이트 = 같은 `PermResolver`(그래프 입력 순수 함수) | 1단계 끝 기준(실제 로그인과 같다)을 구조로 보장. 순수라 Oracle 없이 시험 |
| D25 | 새 화면 ID `commPermBench`(csa), 메뉴 공통관리 › 시스템관리 › 권한 작업대. 5종 설계 산출물 먼저(b0) | RULE.md 분기 1 게이트. 시안이 디자인 근거 |
| D26 | 키 모양(`module/objId/action`) 그대로 → FE `proxy.ts`·`api-permission-cache.ts`·`rbac-policy.ts`·`SecPermKeysController` 수정 없음 | 서버 계산만 바꾸면 됨. 수정 범위 축소 |
| D27 | 공용 파일 소유: `scripts/db-order/column-order.json`·`db/migration/**`·`init/seed/**`·`entity/**`·기존 `repository/Sec*` = perm-core. `scripts/perf/render/screens.mjs`·`mantine-aggrid-ui` 스킬 문서 = perm-fe. `shared/src/components/grid/**`·`tree/**`·`commMenuMng/**`·`MenuCatalog.java` = 모든 레인 금지 | 다른 브랜치 미커밋 변경과 겹치는 파일. 겹침 최소화 |
| D28 | 다른 브랜치 겹침 파일(`CommObjMngService`·`SecObjRepository`·`SecUserService`·seeder·`column-order.json`)은 덧붙이기만, 재정렬·서식 변경 금지 | 나중 머지 충돌 최소화 |
| D29 | 레인 5개(6개 아님). 예비 6번째 = Mac 두 번째 세션이 생기면 f5·f6 을 `perm-legacy-fe` 로 분리 | 파일 겹침 없는 묶음이 5개. 더 쪼개면 계약 대기만 늘어남 |
| D30 | 캐시 무효화 = 적용·옛 화면 저장 모두 `RoleChangedEvent` 발행(사람↔그룹 변경 포함, 전체 무효화) | 지금 이벤트·구독처 재사용 |

---

## 2. 항목 표

크기 가중: S=1 · M=2 · L=3. 「무거운」 = heavy.mjs 경유 명령. 시험 범위 기본 = 바뀐 모듈만.
경로 약어: `BE` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm` · `BT` = 같은 모듈 `src/test/java/...` · `SVC` = `src/backend/mcm/api/src/main/resources/services/csa` · `SEED` = `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init` · `MIG` = `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser` · `FE` = `src/frontend/m-mcm/page-components/csa` · `SH` = `src/frontend/shared/src`

### 2.1 perm-core

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| c0 | V20 DDL(§0.1 5개 표·FK·comment·OBJ 재배치) + column-order.json 등록 + 엔티티 5개(SecRolePerm·Id·SecPermDraft·SecPermHis·SecPermHisDtl) + SecObj 필드 3개 + JPA 저장소 4개 | M | `MIG/V20__perm_model.sql`, `scripts/db-order/column-order.json`, `BE/entity/SecRolePerm*.java`·`SecPermDraft.java`·`SecPermHis*.java`·`SecObj.java`, `BE/repository/SecRolePermRepository.java`·`SecPermDraftRepository.java`·`SecPermHis*Repository.java` | - | 예: mcm-core compile + `ColumnOrderOraTest` + clone Flyway migrate(Oracle) · 바뀐 모듈만 | 아니오 |
| c1 | 계약 코드 `security/perm/*`(§0.2 record·interface·`PermTokens`) + `PermTokensTest` | S | `BE/security/perm/**`(구현 클래스 제외), `BT/security/perm/PermTokensTest.java` | - | 아니오(단일 시험) | 아니오 |
| c2 | V21 데이터 옮기기(D11·D12·D19) + 생성기 `scripts/perm/gen-obj-perm.mjs`(BPMN actionGateway 분기 → 오브젝트별 action, REST 보충 목록) + 고아 줄 건수 | M | `MIG/V21__perm_model_backfill.sql`, `scripts/perm/**` | c0 | 예: clone migrate + 옮긴 건수 확인 SQL · 바뀐 모듈만 | 아니오 |
| c3 | 대조 시험 `PermModelParityOraTest`: legacy 로더 vs v2 로더 → 같은 resolver → 사람×오브젝트 키 같음(SYSADMIN 은 D12 교집합 기준) + 차이 목록 파일 | M | `BT/oracheck/PermModelParityOraTest.java` | c2, r2 | 예: `-Pdmes.ora.test=clone` 그 시험만 | 아니오 |
| c4 | 시더 전환: CoreRbacSeeder(오브젝트 BTN_PERM 채움·SYSADMIN 매핑·PERM_ALL 중단·allActions 에 commPermBench action 추가), McmMenuSeeder(commPermBench 오브젝트·메뉴), MdmMenuSeeder·ModuleMenuSeeder(새 퍼미션 행), SeedSupport 도우미, DataInitializer, fingerprint golden, `e2e/fixtures/mdm-rbac-seed-check.sql` | L | `SEED/**`, `src/backend/mcm/api/src/test/resources/init/data-initializer-fingerprint.golden.txt`, `src/backend/mcm/api/src/test/java/**/init/**`, `src/frontend/e2e/fixtures/mdm-rbac-seed-check.sql` | c0 | 예: mcm/api 모듈 시험 + 깨끗한 clone 부팅 1회 | 아니오 |
| c5 | 옛 저장소 SQL 전환(SecRoleRepository·SecRoleGroupMappingNativeRepository:179·SecObjRepository 최소 수정), `SecRoleMappingNativeRepository` 는 고치지 않고 @Deprecated 주석만, mdm ERD 힌트 | M | `BE/repository/SecRoleRepository.java`·`SecRoleGroupMappingNativeRepository.java`·`SecObjRepository.java`·`SecRoleMappingNativeRepository.java`, `src/backend/mdm/api/src/main/resources/erd/hints/mcm.json` | c0 | 예: mcm-core 시험 + `MenuTreeSqlOraTest` | 아니오 |
| c6 | 문서: 칼럼 주석 `docs/db/column-comments-2026-11-27.md`, ERD `docs/mcm/erd/csa-sec-erd.md`, ADR(mcm, 퍼미션 모델 변경, adr-write) | S | `docs/db/**`, `docs/mcm/erd/**`, `docs/mcm/adr/**` | c0 | 아니오 | 아니오 |
| c9 | 머지(c0+c1 단독 먼저, 나머지 한 번) | S | - | c0~c6 | 머지 직전 mcm-core·mcm/api 모듈 전체 시험 | 아니오 |

### 2.2 perm-runtime

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| r0 | 지금 규칙 고정: UserPermCache·SecUserService 의 거르기(USE_TP·유효 기간·SYSADMIN·freepass) 특성 시험 | S | `BT/security/**`(새 시험 파일) | - | 아니오(단일 시험) | 아니오 |
| r1 | `DefaultPermResolver`·`DefaultImpactCalculator`·`PermGraph.applyChanges` 구현 + 사례 시험(SYSADMIN·사용 안 함·숨김 메뉴·오브젝트에서 빠진 값·여러 그룹 같은 역할·빈 BTN) | M | `BE/security/perm/impl/**`, `BT/security/perm/**`(PermTokensTest 제외) | c1(§0.2 로 먼저 시작 가능) | 아니오(폴더 시험) | 아니오 |
| r2 | 그래프 로더 2종 `V2PermGraphLoader`·`LegacyPermGraphLoader` + 속성 `mcm.security.perm-model` | M | `BE/security/perm/load/**`, `src/backend/mcm/api/src/main/resources/application.yml`(속성 한 줄) | c0 | 예: 로더 OraTest 1개(clone) | 아니오 |
| r3 | 런타임 전환: `UserPermCache.buildFromDb`·`SecUserService.getMyButtonEndpoints`·`filterMenusByRole` → resolver(바뀐 줄 최소) | M | `BE/security/endpoint/UserPermCache.java`, `BE/security/service/SecUserService.java`, `BT/security/endpoint/UserPermCacheTest.java` | r1, r2 | 예: mcm-core 모듈 시험 | 예: 로그인 키 빌드 시간 legacy vs v2(사용자 3명) |
| r4 | 설명 서비스 `PermExplainService`(explain·사람 메뉴 트리·역할 메뉴 트리, CUR/DRAFT 그래프) — b1 이 호출 | M | `BE/security/perm/PermExplainService.java`(+시험) | r1, r2 | 아니오(단일 시험) | 아니오 |
| r5 | 대조 시험: explain 결과 == UserPermCache 키(표본 사용자 SYSADMIN·MDM_STEWARD·일반 1) | S | `BT/oracheck/PermExplainParityOraTest.java` | r3, r4 | 예: clone 그 시험만 | 아니오 |
| r9 | 머지(r1 은 단독 먼저 — b3 대기) | S | - | r0~r5 | 머지 직전 mcm-core 모듈 전체 | 아니오 |

### 2.3 perm-bench-be

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| b0 | 5종 설계 산출물(분석리포트·기능·디자인·BPMN·정합체크), 시안 v16 근거 | M | `docs/mcm/design/commPermBench/**` | - | 아니오 | 아니오 |
| b1 | BPMN(전 action 뼈대) + DTO + 1단계 action(searchBench·searchMenuTree·explain·searchRolePerm) | L | `SVC/commPermBench/**`, `BE/csa/commPermBench/**` | c0, r4(전까지 가짜 resolver) | 예: mcm-core 모듈 시험 + oasis-contract-check | 아니오 |
| b2 | 초안 loadDraft·saveDraft·discardDraft + 범위 지문 계산(D22) | M | `BE/csa/commPermBench/service/PermDraft*.java` | b1 | 아니오(단일 시험) | 아니오 |
| b3 | 영향 impact(초안 적용 그래프 vs 현재, 앞 500줄) | M | `BE/csa/commPermBench/service/PermImpact*.java` | b2, r1 | 아니오(단일 시험) | 예: 역할 1개·사람 1,000명 표본 영향 계산 벽시계(목표 ≤2초) |
| b4 | 적용 apply(한 트랜잭션·지문 비교·잃는 사람 확인·⊆·빈 BTN 검사·이력·RoleChangedEvent·초안 비움) | L | `BE/csa/commPermBench/service/PermApply*.java` | b3 | 예: 동시 적용 충돌 OraTest(clone) | 아니오 |
| b5 | 이력 searchHistory·searchHistoryDtl | S | `BE/csa/commPermBench/service/PermHistory*.java` | b4 | 아니오 | 아니오 |
| b6 | `CommPermBenchOasisServiceTest` + oasis-contract-check ERROR 0 | M | `BT/csa/commPermBench/**`, `src/backend/mcm/api/src/test/**/commPermBench/**` | b1~b5 | 예: mcm-core·mcm/api 모듈 시험 | 아니오 |
| b9 | 머지 | S | - | b0~b6 | 머지 직전 바뀐 모듈 전체 | 아니오 |

### 2.4 perm-legacy-be (commObjMng 은 FE 까지)

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| l1 | commPermMng BE: §0.4(조회 조건·페이지·PK merge/delete·⊆·빈 BTN) + BPMN | L | `BE/csa/commPermMng/**`, `SVC/commPermMng/**`, `BE/repository/CommPermQueryRepository.java`(새) | c0 | 예: mcm-core 모듈 시험 + oasis-contract-check | 아니오 |
| l2 | commRoleMng BE: 집계 칸·searchCmRoleMap/saveCmRoleMap 새 퍼미션·searchFolderObj·searchRoleGroups·USE_TP N 영향 | L | `BE/csa/commRoleMng/**`, `SVC/commRoleMng/**` | c0 | 예: 같음 | 아니오 |
| l3 | commObjMng BE: 새 칼럼 3개 조회·저장, MENU_CNT·PERM_CNT, searchObjPerm·searchObjMenu, 값 빼기 영향, SYSADMIN 자동 매핑 삭제, 삭제 검사 새 테이블(덧붙이기만 D28) | M | `BE/csa/commObjMng/**`, `SVC/commObjMng/**` | c0 | 예: 같음 | 아니오 |
| l4 | commRoleGrpMng BE: 옛 매핑 참조 → 새 테이블 | S | `BE/csa/commRoleGrpMng/**` | c0 | 아니오(단일 시험) | 아니오 |
| l5 | 서비스 시험 4개(CommPerm/Role/Obj/RoleGrp, 지금 없음) | M | `BT/csa/comm{Perm,Role,Obj,RoleGrp}Mng/**` | l1~l4 | 예: mcm-core 모듈 시험 | 아니오 |
| l6 | commObjMng FE 새 설계(lgObjNext: 새 칼럼 토큰 편집·빼기 영향·이 오브젝트의 퍼미션·가리키는 메뉴·사용 안 함 확인) | M | `FE/commObjMng/**` | l3, f1(토큰 편집기) | 아니오(tsc + 폴더 시험) | 아니오 |
| l7 | 설계 문서 갱신(3개 화면 기능·BPMN 설계서의 퍼미션 절) | S | `docs/mcm/design/comm{Perm,Role,Obj,RoleGrp}Mng/**` | l1~l4 | 아니오 | 아니오 |
| l8 | 렌더 점검(commObjMng) — screens.mjs 등록은 perm-fe 에 요청 | S | - | l6 | 아니오 | 아니오 |
| l9 | 머지(BE l1~l5 한 번, l6~l8 한 번) | S | - | l1~l8 | 머지 직전 mcm-core·m-mcm | 아니오 |

### 2.5 perm-fe (Mac)

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| f0 | 계약 타입·가짜 자료: §0.3·§0.4 칸 이름 그대로 `types.ts` + `mock.ts`(역할 12·그룹 11·화면 1,004 표본) | S | `FE/commPermBench/types.ts`·`mock.ts`, `FE/comm{Perm,Role}Mng/types.ts` | - | 아니오 | 아니오 |
| f1 | 새 shared 부품 3개(칸 폭 끌기 — 먼저 `layout/split-sizing.ts`·`ResizableFormPanel` 재사용 검토, 토큰 칩 편집기, 켜고 끄는 칩 묶음) + 스킬 컴포넌트 문서·`llms.txt`·`llms-full.txt` 색인(Part B §18) | M | `SH/components/token-chip-input/**`·`toggle-chip-group/**`·`resizable-columns/**`(새 폴더만), `SH/index.ts`(export 줄만), `.claude/skills/mantine-aggrid-ui/references/components/{새 문서}.md`·`llms*.txt` | - | 예: shared 시험 + tsc | 아니오 |
| f2 | 작업대 1단계: 사람·그룹·역할·메뉴 칸(체크 보기만), 사람 기준·역할 기준 미리보기, 버튼 아래 켠 역할·잠긴 이유, 퍼미션 칩 보기만 | L | `FE/commPermBench/**` | f0, f1(가짜 자료로 시작), b1(실연결) | 아니오(tsc + 폴더 시험) | 아니오 |
| f3 | 작업대 2단계: 모든 체크·칩 편집, 모두·조회만·없음, 초안 막대, 현재/초안 비교, 초안 영향, 하나씩 되돌리기, 잃는 사람 확인, 충돌 안내, 이력 | L | `FE/commPermBench/**` | f2, b2~b5(전까지 가짜) | 아니오 | 아니오 |
| f4 | 작업대 3단계: 칸 머리 링크(↗)·폴더 연필 → commMenuMng, 고른 항목 ID 넘기기(기존 화면 이동 규칙 조사 후 따름), 돌아오면 다시 읽기 | M | `FE/commPermBench/**` | f2 | 아니오 | 아니오 |
| f5 | commPermMng FE 새 설계(lgPermNext: 한 줄 = 역할×오브젝트, 조회 조건 4개, 줄 칩, 오른쪽 퍼미션 한 건 값 편집, 퍼미션 없는 오브젝트 만들기). `PERM_BTN_OPTIONS` 상수 삭제 | L | `FE/commPermMng/**`, `src/frontend/m-mdm/tests/fixtures/ui-meta-lock.json`(라벨 이름 바뀔 때만) | f0, f1, l1(실연결) | 아니오 | 아니오 |
| f6 | commRoleMng FE 새 설계(lgRoleNext: 집계 칸, 들어 있는 그룹, 「이 역할의 퍼미션」 한 칸, 메뉴에서 오브젝트 추가, 사용 안 함 확인) | L | `FE/commRoleMng/**` | f0, f1, l2(실연결) | 아니오 | 아니오 |
| f7 | 옛 화면 3종 「작업대에서 열기」 + 진입 파라미터 받기(commObjMng 은 l6 레인에 요청) | S | `FE/comm{Perm,Role}Mng/**` | f4, f5, f6 | 아니오 | 아니오 |
| f8 | 순수 함수 vitest(초안 차이·칩 상태·입력 코드 거르기) | S | `FE/commPermBench/*.test.ts` | f3 | 예: `pnpm --filter @dk-oasis/mcm test` | 아니오 |
| f9 | 렌더 점검(commPermBench·commPermMng·commRoleMng, commObjMng 등록 포함) + `scripts/perf/render/screens.mjs` 등록 | S | `scripts/perf/render/screens.mjs` | f2~f7, l6 | 아니오 | 아니오 |
| f10 | 머지(f1 단독 먼저 — l6 대기, 나머지 화면별) | S | - | f0~f9 | 머지 직전 m-mcm·shared 시험 + tsc | 아니오 |

### 2.6 마감(조정자)

| id | 제목 | 크기 | 건드릴 파일 | 선행 | 무거운·시험 범위 | 측정 |
|---|---|---|---|---|---|---|
| s0 | 레인 공통 규칙 문서 `docs/perm-bench/README.md`(뼈대 `templates/lane-rules-README.md`) | S | `docs/perm-bench/**` | - | 아니오 | 아니오 |
| z1 | 통합 시험: 통합 브랜치에서 mcm-core·mcm/api·m-mcm·shared 모듈 시험 + clone Flyway V20·V21 + c3·r5 대조 시험 | M | - | 모든 머지 | 예: 리포 전체 아님, 바뀐 모듈 4개 | 아니오 |
| z2 | 실제 로그인 확인(조정자만 서버 기동): SYSADMIN·MDM_STEWARD·일반 사용자 3명 — 메뉴·버튼·403 이 작업대 설명과 같음, 1단계 끝 기준 6사례 | M | - | z1 | 예: 서버 + 브라우저 | 아니오 |
| z3 | 2단계 끝 기준: 적용 결과 = 시뮬레이션, 두 관리자 동시 적용 충돌 안내, 잃는 사람 재확인 | S | - | z2 | 예: 브라우저 | 아니오 |
| z4 | 화면 프로파일링 1회(count-renders, 4화면) | S | - | z1 | 예 | 예: 렌더 수 |
| z5 | dev 머지 준비: V18·V19 다른 브랜치 상태 확인, 필요하면 번호 재조정 지시(D20) | S | - | z1 | 아니오 | 아니오 |
| z6 | SUMMARY(`run-report.md`)·측정(`run-metrics.mjs`)·정리(워크트리·원격 레인 브랜치) | S | - | z1~z5 | 아니오 | 아니오 |

---

## 3. 레인 묶기

| 레인(≤40자) | 기계·세션 | 브랜치 | 워크트리 | priority | 합계 가중 |
|---|---|---|---|---|---|
| `perm-core` | win144-frolicking-puzzle (Oracle) | `perm/perm-core` | win144 리포 옆 `../dmes-perm-core` | 1 | 14 |
| `perm-bench-be` | win144-memoized-river (Oracle) | `perm/perm-bench-be` | win144 리포 옆 `../dmes-perm-bench-be` | 2 | 16 |
| `perm-runtime` | 이 PC Orca 탭 1 (Oracle 로컬) | `perm/perm-runtime` | `C:/Users/jongik.jang/project/dmes-perm-runtime` | 2 | 11 |
| `perm-legacy-be` | 이 PC Orca 탭 2 (Oracle 로컬) | `perm/perm-legacy-be` | `C:/Users/jongik.jang/project/dmes-perm-legacy-be` | 3 | 16 |
| `perm-fe` | Mac 세션 1 (Oracle 없음, 병렬 agent 많이) | `perm/perm-fe` | Mac 리포 옆 `../dmes-perm-fe` | 2 | 21 |

- 워크트리 생성 = `git fetch origin` → `git worktree add <경로> -b perm/<레인> origin/claude/perm-bench`. 이 PC 레인은 메인 체크아웃(미커밋 83건)을 쓰지 않는다. 통합 워크트리 `C:/Users/jongik.jang/project/dmes-perm` = 조정자 전용.
- 원격 레인(win144 2·Mac) = `perm/<레인>` 만 push(D3). 조정자가 fetch → ff 머지 → 통합 브랜치 push.
- heavy: 이 PC 두 레인 + 조정자가 Oracle 하나를 나눔 → heavy.mjs 칸 1개씩. win144 두 레인도 Oracle 하나 → heavy 1개씩. Mac = Oracle 시험 금지(OraTest 는 조정자·win144 에 요청).
- Mac 은 시험 중 `-Pdmes.ora.test` 를 켜지 않는다. BE 일이 없으므로 gradle 불필요.

### 3.1 소유·금지 글롭

**perm-core**
- owned: `src/backend/mcm-core/src/main/resources/db/migration/**`, `scripts/db-order/column-order.json`, `scripts/perm/**`, `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/entity/**`, `.../mcm/repository/Sec*.java`(CommPermQueryRepository 제외), `.../mcm/security/perm/*.java`(최상위 계약 파일만), `src/backend/mcm-core/src/test/java/**/oracheck/PermModelParity*`, `src/backend/mcm-core/src/test/java/**/security/perm/PermTokensTest.java`, `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/**`, `src/backend/mcm/api/src/test/**/init/**`, `src/frontend/e2e/fixtures/mdm-rbac-seed-check.sql`, `src/backend/mdm/api/src/main/resources/erd/hints/mcm.json`, `docs/db/**`, `docs/mcm/erd/**`, `docs/mcm/adr/**`
- forbidden: `src/backend/mcm-core/src/main/java/**/csa/**`, `.../security/endpoint/**`, `.../security/service/**`, `.../security/perm/impl/**`, `.../security/perm/load/**`, `src/frontend/**`(fixture sql 제외), `src/backend/mcm/api/src/main/resources/services/**`, `.../menu/MenuCatalog.java`

**perm-runtime**
- owned: `.../mcm/security/perm/impl/**`, `.../mcm/security/perm/load/**`, `.../mcm/security/perm/PermExplainService.java`, `.../mcm/security/endpoint/UserPermCache.java`, `.../mcm/security/service/SecUserService.java`, `src/backend/mcm-core/src/test/java/**/security/**`(PermTokensTest 제외), `src/backend/mcm-core/src/test/java/**/oracheck/PermExplainParity*`, `src/backend/mcm/api/src/main/resources/application.yml`(perm-model 한 줄)
- forbidden: `.../security/perm/*.java`(계약 — 바꾸려면 perm-core 에 요청), `entity/**`, `repository/**`, `db/migration/**`, `csa/**`, `init/**`, `src/frontend/**`

**perm-bench-be**
- owned: `.../mcm/csa/commPermBench/**`, `src/backend/mcm/api/src/main/resources/services/csa/commPermBench/**`, `src/backend/mcm-core/src/test/java/**/csa/commPermBench/**`, `src/backend/mcm/api/src/test/**/commPermBench/**`, `docs/mcm/design/commPermBench/**`
- forbidden: `security/**`, `entity/**`, `repository/**`, `db/migration/**`, `init/**`(오브젝트·메뉴·allActions 시드는 perm-core c4 에 요청), 다른 `csa/*`, `src/frontend/**`

**perm-legacy-be**
- owned: `.../mcm/csa/comm{Perm,Role,Obj,RoleGrp}Mng/**`, `src/backend/mcm/api/src/main/resources/services/csa/comm{Perm,Role,Obj,RoleGrp}Mng/**`, `.../mcm/repository/CommPermQueryRepository.java`, `src/backend/mcm-core/src/test/java/**/csa/comm{Perm,Role,Obj,RoleGrp}Mng/**`, `src/frontend/m-mcm/page-components/csa/commObjMng/**`, `docs/mcm/design/comm{Perm,Role,Obj,RoleGrp}Mng/**`
- forbidden: `security/**`, `entity/**`, 그 밖의 `repository/**`, `db/migration/**`, `init/**`, `csa/commMenuMng/**`, `csa/commPermBench/**`, `src/frontend/shared/**`, `FE/comm{Perm,Role}Mng/**`, `FE/commPermBench/**`, `scripts/perf/render/screens.mjs`

**perm-fe**
- owned: `src/frontend/m-mcm/page-components/csa/commPermBench/**`, `.../csa/commPermMng/**`, `.../csa/commRoleMng/**`, `src/frontend/shared/src/components/token-chip-input/**`·`toggle-chip-group/**`·`resizable-columns/**`, `src/frontend/shared/src/index.ts`(export 줄 추가만), `.claude/skills/mantine-aggrid-ui/references/components/**`(새 문서·색인 줄 추가만), `scripts/perf/render/screens.mjs`, `src/frontend/m-mdm/tests/fixtures/ui-meta-lock.json`
- forbidden: `src/backend/**`, `src/frontend/shared/src/components/grid/**`·`tree/**`·`layout/PageLayout.tsx`·`portal-shell/**`·`auth/**`, `FE/commObjMng/**`, `FE/commMenuMng/**`, `src/frontend/m-mcm/proxy.ts`, `src/frontend/m-mcm/lib/**`
- 주의: 메인 체크아웃에 `ag-data-grid.md`·`llms-full.txt`·`tree.md` 미커밋 변경 있음 → 색인은 줄 추가만, 기존 줄 고치지 않음

### 3.2 queue·backlog

| 레인 | queue(앞부터) | backlog `{id, kind, fits, desc}` |
|---|---|---|
| perm-core | c0, c1 → (c0+c1 머지) → c2, c4, c5, c6 → c3 | `{bk-c1, docs, [perm-core], "옛 테이블 삭제 V 파일 초안(다음 회차용, 커밋만 하고 머지 안 함)"}` · `{bk-c2, review, [perm-core,perm-runtime], "V21 옮기기 결과 표본 검토(사람 10명 × 화면)"}` |
| perm-runtime | r0, r1(§0.2 로 바로 시작) → r1 단독 머지 → r2 → r3, r4 → r5 | `{bk-r1, review, [perm-runtime], "b3·b4 의 resolver 사용 교차 리뷰"}` · `{bk-r2, cleanup, [perm-runtime], "SecUserService 옛 collectPermActions 제거 후보 목록"}` · `{bk-r3, prep, [perm-runtime], "z2 실제 로그인 확인 런북(사용자 3명·6사례)"}` |
| perm-bench-be | b0(의존 없음, c0 대기 중) → b1 → b2 → b3 → b4 → b5 → b6 | `{bk-b1, feat, [perm-bench-be], "옛 화면 저장도 적용 이력에 남기기(D23 후속)"}` · `{bk-b2, feat, [perm-bench-be,perm-core], "버튼·팝업 코드 라벨 공통 코드 그룹(D17 후속)"}` |
| perm-legacy-be | l4, l3 → l1, l2 → l5 → l6 → l7, l8 | `{bk-l1, review, [perm-legacy-be], "f5·f6 가짜 자료와 실제 응답 칸 대조"}` · `{bk-l2, test, [perm-legacy-be], "역할·오브젝트 삭제 FK 경로 시험"}` |
| perm-fe | f0, f1 → f1 단독 머지 → f2, f5, f6(병렬 agent) → f3, f4 → f7 → f8 → f9 | `{bk-f1, test, [perm-fe], "작업대 E2E 스펙 1개(Playwright, 조정자 실행)"}` · `{bk-f2, polish, [perm-fe], "작업대 키보드 이동(칸 경계 ← →)·접근성 점검"}` |

- c0 대기 동안 할 일: perm-bench-be = b0, perm-legacy-be = 현재 서비스 읽기·l5 시험 뼈대, perm-runtime = r0·r1, perm-fe = f0·f1·f2(가짜 자료).

---

## 4. 의존 그래프

```text
perm-core:c0 → perm-core:c2
perm-core:c0 → perm-core:c4
perm-core:c0 → perm-core:c5
perm-core:c0 → perm-runtime:r2
perm-core:c0 → perm-bench-be:b1
perm-core:c0 → perm-legacy-be:l1
perm-core:c0 → perm-legacy-be:l2
perm-core:c0 → perm-legacy-be:l3
perm-core:c0 → perm-legacy-be:l4
perm-core:c1 → perm-runtime:r1
perm-runtime:r1 → perm-runtime:r3
perm-runtime:r1 → perm-runtime:r4
perm-runtime:r2 → perm-runtime:r3
perm-runtime:r2 → perm-runtime:r4
perm-runtime:r2 → perm-core:c3
perm-core:c2 → perm-core:c3
perm-runtime:r4 → perm-bench-be:b1
perm-runtime:r1 → perm-bench-be:b3
perm-bench-be:b1 → perm-bench-be:b2 → perm-bench-be:b3 → perm-bench-be:b4 → perm-bench-be:b5 → perm-bench-be:b6
perm-runtime:r3 → perm-runtime:r5
perm-runtime:r4 → perm-runtime:r5
perm-core:c4 → perm-bench-be:b6          (commPermBench 오브젝트·메뉴 시드)
perm-legacy-be:l3 → perm-legacy-be:l6
perm-fe:f1 → perm-legacy-be:l6           (토큰 칩 편집기)
perm-bench-be:b1 → perm-fe:f2            (실연결만, 가짜 자료로 먼저 진행)
perm-bench-be:b5 → perm-fe:f3            (실연결만)
perm-legacy-be:l1 → perm-fe:f5           (실연결만)
perm-legacy-be:l2 → perm-fe:f6           (실연결만)
perm-fe:f4 → perm-fe:f7
perm-legacy-be:l6 → perm-fe:f9           (screens.mjs 등록)
```

- 단독 먼저 머지: ① `perm-core:c0+c1`(모든 BE 대기) ② `perm-runtime:r1`(bench-be b3) ③ `perm-fe:f1`(legacy-be l6). 다른 일과 묶지 않는다.
- 런타임 전환(r3) 머지 조건 = c2(V21)·c4(시더)가 먼저 통합 브랜치에 있음. 없으면 새 테이블이 비어 모든 사용자 403. 조정자가 머지 순서 `c2,c4 → r3` 로 둔다.

```text
perm-core:c2 → perm-runtime:r3
perm-core:c4 → perm-runtime:r3
```

---

## 5. 마감

1. 화면 레인 렌더 점검 = 각 레인 항목(f9·l8). screens.mjs 등록 = perm-fe 만
2. z1 통합 시험 → z2 실제 로그인 → z3 2단계 끝 기준 → z4 프로파일링 1회
3. z5 V18·V19 확인(dev 머지 전)
4. z6 SUMMARY·측정·정리

## 6. 위험

- 다른 브랜치 미커밋 83건: `CommObjMngService`·`SecObjRepository`·`SecUserService`·시더·`column-order.json`·shared `AgDataGrid`/`Tree`·스킬 문서가 겹침 → D27·D28 로 최소화. dev 머지 때 조정자가 충돌 목록 확인
- V20 번호: 다른 브랜치 V18·V19 가 나중에 들어가면 Flyway 실패(outOfOrder=false) → z5
- D12 생성기가 못 찾는 REST action(예 `dbViewer/query`·`upload`) → SYSADMIN 403. c3 차이 목록·z2 로 확인, 보충 목록에 추가
- `BTN_PERM` 1000자 초과 오브젝트 → 생성기가 실패로 알림(조용히 자르지 않음)
- 작업대 화면 1,004개 × 사람 수 → searchBench 사람 목록은 검색·페이지, 메뉴 트리는 전체(1,004줄)로 둠
