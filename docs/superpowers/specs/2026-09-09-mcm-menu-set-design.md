# mcm 메뉴 세트 도입 설계 — `MENU_TP` 를 세트 키로 승격

- 작성일: 2026-09-09
- 상태: 방향 확정 (사용자 승인 2026-09-09) · 구현 계획 미작성
- 근거: `src/backend/mcm-core/.../entity/Sec*.java`, `src/backend/data/mcm.db` 실측(2026-09-08), `SecUserService`, `SecMenuNativeRepository`, `SecRoleGroupMappingNativeRepository`, `DataInitializer`, `src/frontend/m-mcm/page-components/csa/commMenuMng/page.tsx`
- 시각 자료: `docs/mcm/erd/csa-menu-erd.md` (현행) · 세션 아티팩트 "MCM 권한 ERD" ④ 절 (변경안)

## 1. 배경과 요구

현행 스키마는 메뉴 세트가 한 벌이다. `TB_MCM_SEC_MENU` / `TB_MCM_SEC_MENU_FLD` 에 세트 구분 컬럼이 없고, 옛 `TB_SEC_MENU.MENU_SET` 은 신규 스키마에서 사라졌다. 메뉴는 `MENU_FLD` 루트(`mcm`, `analog`) 아래 하나의 트리로만 나뉘고, 사용자에게 보이는 범위는 `TB_MCM_SEC_ROLE_MAPPING` 의 허용 OBJECT_ID 로만 걸러진다.

요구는 접속 시스템마다 다른 메뉴 세트다.

| 세트 | 대상 |
|---|---|
| MES 기본 | 사내 웹 사용자 |
| 모바일 | 사내 사용자의 모바일 기기 |
| 코일센터 | 사외 창고 |
| 외주가공 업체 | 협력사 |
| 부재료 공급 업체 | 협력사 |

각 시스템으로 접속하면 볼 수 있는 메뉴가 다르고, 같은 업무라도 프로그램(화면)이 다를 수 있다. 같은 사람이 MES 기본과 모바일을 함께 쓸 수 있어야 한다.

## 2. 결정

### 2.1 세트를 고르는 기준은 접속 시스템, 세트 안에서 보이는 것은 역할

세트 선택과 화면 허용을 분리한다. 역할그룹에 세트를 직접 넣는 방식(A안)은 역할그룹이 "권한 묶음"과 "접속 채널" 두 뜻을 갖게 되고, MES 기본과 모바일을 함께 쓰는 내부 사용자마다 역할그룹이 두 배로 늘어나므로 채택하지 않는다.

### 2.2 새 컬럼을 만들지 않고 기존 `MENU_TP` 를 세트 키로 승격

`MENU_TP` 는 As-Is(mui) 에서 넘어온 2값(`WEB` / `MOBIL`) 세트 구분자이며 현재 절반만 구현되어 있다.

- 값은 `commMenuMng` 콤보에 정적으로 박혀 있다 (`MENU_TP_OPTIONS`).
- 화면(`MENU`)에만 값이 있고 폴더(`MENU_FLD`)는 실측 8행 전부 비어 있다.
- 역할 관리 화면의 메뉴·OBJECT 트리 조회(`SecRoleGroupMappingNativeRepository`)만 `MENU_TP='WEB'` 을 하드코딩으로 거른다.
- 사이드바를 만드는 `SecUserService.getMyMenus` 는 `MENU_TP` 를 거르지 않고 그대로 넘긴다.
- 실측 21행이 모두 `WEB` 이다.

컬럼은 두 테이블에 이미 있다 (2026-09-09 확인).

| 테이블 | 컬럼 | 정의 위치 | 실측 |
|---|---|---|---|
| `TB_MCM_SEC_MENU` | `MENU_TP VARCHAR(10)` | `SecMenu` 엔티티 + `DataInitializer` DDL | 21행 모두 `WEB` |
| `TB_MCM_SEC_MENU_FLD` | `MENU_TP VARCHAR(20)` | `DataInitializer` 멱등 ADD (2026-06-03 Round 3) | 8행 모두 빈값 |

다만 같은 컬럼이 코드와 문서에서 세 가지 뜻으로 쓰이고 있어 승격 시 정리가 필요하다.

| 뜻 | 위치 | 상태 |
|---|---|---|
| 세트 구분 (`WEB` / `MOBIL`) | `commMenuMng` 콤보, `SecRoleGroupMappingNativeRepository` 의 `'WEB'` 하드코딩 | As-Is 계승. 본 설계가 채택하는 뜻 |
| 폴더/화면 구분 (`dir` / `page`) | `SecUserService.getMyMenus` 가 `menuType = MENU_TP` 로 내려보내고, `use-portal-menu.ts` 가 `menuType === "dir"` 로 폴더를 판정 | 폴더 `MENU_TP` 가 비어 있어 항상 `page` 로 판정된다. `portal-shell` 의 serviceId 계산이 이 값에 의존하므로 현재는 빈 serviceId(legacy 호환 경로)로 동작 중 |
| 폴더 표시 (`FLD`) | `docs/guide/BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md` §13-1 | 문서만 있고 코드·데이터에 `FLD` 값 없음 |

승격 후 `MENU_TP` 는 세트 구분 한 가지 뜻만 갖는다. 폴더/화면 구분은 응답의 `menuType` 을 `MENU_TP` 가 아니라 행의 출처(`MENU_FLD` 면 `dir`, `MENU` 면 `page`)로 채우도록 `getMyMenus` 를 고치고, 표준 가이드 §13-1 의 `FLD` 표기를 이에 맞춰 정정한다. 이 정리는 세트 도입과 무관하게 지금도 어긋나 있는 부분이라 같은 작업에 포함한다.

새 컬럼 `MENU_SET_ID` 를 추가하는 방식(B안)은 세트 × 기기 두 축이 생기지만, 요구에서 모바일은 세트 중 하나이므로 축이 하나로 충분하다. 컬럼명을 유지하면 FE·BE·설계 문서의 참조를 건드리지 않는다.

## 3. 스키마 변경

물리 FK 제약은 현행 정책(JPA 연관관계 금지, 논리 FK)을 따른다.

### 3.1 신규 `TB_MCM_SEC_MENU_SET`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `MENU_TP` | VARCHAR(10) PK | 세트 코드. `MENU.MENU_TP` 길이가 10 이라 10자 이내 |
| `MENU_SET_NM` | VARCHAR(100) | 세트명 |
| `MENU_SET_DESC` | VARCHAR(300) | 설명 |
| `SET_TP` | VARCHAR(10) | `INTERNAL` / `MOBILE` / `PARTNER` |
| `DEFAULT_MENU_ID` | VARCHAR(30) | 세트 기본 진입 폴더 (선택, 1차 미사용) |
| `USE_TP` | VARCHAR(1) | 사용 여부 |
| `SORT_ORD` | INTEGER | 정렬 |
| 감사 9컬럼 | | `McmAuditEntity` |

시드 5행:

| `MENU_TP` | `MENU_SET_NM` | `SET_TP` |
|---|---|---|
| `WEB` | MES 기본 | INTERNAL |
| `MOBIL` | 모바일 | MOBILE |
| `COILCNTR` | 코일센터 | PARTNER |
| `OUTSRC` | 외주가공 업체 | PARTNER |
| `SUBMAT` | 부재료 공급 업체 | PARTNER |

`WEB` 과 `MOBIL` 은 기존 값을 그대로 쓴다. 협력사 세 코드는 확정 전 명칭이며 구현 시 현업 확인 후 바꿀 수 있다.

### 3.2 신규 `TB_MCM_SEC_MENU_SET_ROLEGROUP`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `MENU_TP` | VARCHAR(10) PK | → `SEC_MENU_SET` |
| `ROLE_GROUP_ID` | VARCHAR(30) PK | → `SEC_ROLEGROUP` |
| 감사 9컬럼 | | |

역할그룹이 어떤 세트에 들어갈 수 있는지를 담는다. 내부 역할그룹은 `WEB` + `MOBIL` 두 행, 협력사 역할그룹은 자기 세트 한 행이 기본이다.

### 3.3 기존 테이블

| 대상 | 변경 | 비고 |
|---|---|---|
| `SEC_MENU_FLD.MENU_TP` | 값 채움 · NOT NULL | 컬럼은 이미 있음(VARCHAR(20)). 8행 모두 `WEB` 으로 채움. 루트 폴더는 세트마다 따로 둔다 |
| `SEC_MENU.MENU_TP` | 의미 확장 · NOT NULL | 기존 21행은 이미 `WEB`. 콤보를 `SEC_MENU_SET` 조회로 교체 |
| `SEC_MENU.MENU_ID` | 관행 변경 | `MENU_ID = OBJECT_ID` 관행을 버린다. 세트마다 같은 OBJ 를 걸 수 있으므로 신규 행은 `{MENU_TP}.{OBJECT_ID}` 접두어 관행(예: `MOBIL.noticeMgmt`). 기존 행은 그대로 |
| `SEC_OBJ` ↔ `SEC_MENU` | 1:0..1 → 1:N | `SecUserService.getMyMenus` 의 OBJ→MENU 역참조 로직 확인 필요 |
| `SEC_ROLE.MENU_ID` | 유지 | 세트별 기본 진입이 필요하면 `MENU_SET.DEFAULT_MENU_ID` 로 옮긴다. 1차 미변경 |
| `SEC_USER_FAVORITE` | 유지 | MENU_ID 가 세트에 속하므로 FE 가 현재 세트의 즐겨찾기만 표시 |
| `SEC_ROLE_MAPPING` · `SEC_PERM` · `SEC_OBJ` | 변경 없음 | 화면 허용 판정과 `EndpointPermissionFilter` API 차단은 그대로 |

## 4. 동작 흐름

1. 포털(접속 시스템)이 자기 세트 코드를 안다. 모바일 앱은 `MOBIL`, 협력사 포털은 각자 세트. 웹 포털은 `WEB`.
2. 사이드바 조회 `getMyMenus(menuTp)` / `getMyMenusTree(menuTp)`. 서비스가 사용자 역할그룹 ∩ `SEC_MENU_SET_ROLEGROUP` 으로 세트 접근을 먼저 검사한다. 허용이 없으면 403.
3. `SEC_MENU WHERE MENU_TP = ?` 로 후보를 좁힌 뒤 기존 `filterMenusByRole` 로 허용 OBJECT_ID 만 남긴다.
4. 조상 폴더 역추적은 같은 세트 안에서만 한다. `FULL_SEQ` 재계산(`recomputeMenuFullSeq`)은 세트별로 독립.
5. 한 사용자가 여러 세트에 접근 가능하면 포털 상단에서 세트 전환. 접근 가능한 세트가 하나면 전환 UI 를 숨긴다.
6. `sysadmin-freepass` 는 세트 접근 검사에도 같은 의미로 적용한다. 기본값 `false` 에서는 SYSADMIN 도 접근 매핑 행이 있어야 한다.

## 5. 영향 범위

### 5.1 백엔드 (`mcm-core`, `mcm/api`)

- 엔티티 신규: `SecMenuSet`, `SecMenuSetRoleGroup` (+ Repository).
- `DataInitializer`: 두 테이블 멱등 DDL, 세트 5행 시드, `MENU_FLD.MENU_TP` 채움과 NOT NULL 보강, 기존 역할그룹에 `WEB`(+`MOBIL`) 접근 행 삽입.
- `SecUserService.getMyMenus / getMyMenusTree / getMyPermissions`: 세트 파라미터, 접근 검사, 세트 조건. 응답 `menuType` 을 `MENU_TP` 대신 행 출처(`dir` / `page`)로 채움.
- `docs/guide/BackEnd/standard-v2/backend-standard/04-cases-checklist-menu.md` §13-1: 폴더 판정 기준을 `MENU_TP = 'FLD'` 에서 행 출처로 정정.
- `SecRoleGroupMappingNativeRepository`: `MENU_TP='WEB'` 하드코딩 → 파라미터.
- `SecMenuNativeRepository`: 폴더 CTE, `recomputeMenuFullSeq`, `selectMenuFldList` 에 세트 조건.
- `SecMenuFldLovRepository.findAllForMyMenus`: 세트 조건.

### 5.2 화면 (`m-mcm`)

- `commMenuMng`: 콤보를 세트 조회로 교체, 트리를 세트별 표시, 폴더 등록 팝업에 세트 필수.
- `commRoleMng`: 메뉴·OBJECT 트리에 세트 선택.
- `commRoleGrpMng`: 세트 접근 탭.
- 신규 세트 관리 화면 1개 (분기 1 설계 산출물 필요).

### 5.3 포털 셸 (`shared/portal-shell`)

- 세트 코드를 들고 `getMyMenus` 에 전달. 세트 전환 UI. 즐겨찾기를 현재 세트로 필터.

### 5.4 데이터 이행

- 폴더 8행 `WEB`, 화면 21행 이미 `WEB`.
- 기존 역할그룹 전부에 `WEB` 접근 행, 내부 역할그룹에 `MOBIL` 접근 행.
- 멱등 DDL/시드는 `DataInitializer` 관례. Flyway 는 mcm 에서 비활성이므로 `db/migration/sqlite` 에는 넣지 않는다.

## 6. 테스트

- 단위: 세트 접근 검사 (허용/미허용/SYSADMIN freepass), 세트 조건이 들어간 `filterMenusByRole`, `recomputeMenuFullSeq` 세트 독립성.
- 통합: 같은 사용자로 `WEB` / `MOBIL` 조회 시 다른 트리, 협력사 역할그룹으로 `WEB` 조회 시 403.
- e2e: 기존 `portal-tab-history` 가 `WEB` 세트로 그대로 통과. 메뉴 관리 탭에서 세트 콤보가 5개 값을 보여준다.

## 7. 보류·후속

- 협력사 세트 코드 명칭 확정 (현업).
- 세트별 기본 진입 폴더(`DEFAULT_MENU_ID`) 도입 여부.
- `SEC_USER.MENU_TP`(VARCHAR(1), 미사용) 는 이 설계와 무관하며 손대지 않는다. 혼동을 줄이려면 별도 정리 대상.
- 확정 후 ADR 발행 (`.claude/skills/adr-write/`).
