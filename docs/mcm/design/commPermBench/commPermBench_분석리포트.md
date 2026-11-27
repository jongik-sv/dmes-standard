---
screenId: commPermBench
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mcm
moduleGroup: csa
작성일: 2026-11-27
작성자: Agent
---

# 권한 작업대 분석리포트

> 근거 우선순위: (1) `docs/perm-bench/decompose.md` §0 계약과 결정 D7-D30, (2) `docs/perm-bench/README.md` 결정 D31-D34, (3) 시안 `docs/perm-bench/mock-v16.html`. 둘이 어긋나면 위 순서로 따른다. 어긋난 곳은 §11 과 §13 에 적는다.

## §0. 환경 제약 (R-13 / R-14 적용 여부와 사유)

| 항목 | 결정 | 사유 |
|---|---|---|
| 화면 유형 | To-Be only 신규 화면 | 옛 ERP 화면이 없다. 현행 MES 의 역할 관리·퍼미션 관리·오브젝트 관리·역할 그룹 관리 4화면이 나눠 맡은 일을 한 화면으로 묶는다. 선례: `noticeMgmt` (신규 화면, 분석리포트 없이 기능설계서 1종) |
| Auto Manifest Runner (R-14) | 적용 안 함 (N/A) | Runner 는 WinForms `designer.cs` · `cs` · `sp.sql` 을 읽는다. 이 화면에는 해당 자료가 없다 |
| SOP 30 Step (R-13) | 기록 안 함 (N/A) | Step 1-30 은 Runner 산출물을 전제로 한다. 대신 §2 인벤토리와 §14 커버리지 합 일치로 전수성을 보인다 |
| 사전 판정표 §0.1-§0.5 (L1-L5, 좌표 정렬, G/GE 분기, B/GB, P 후보) | 시안 기준으로 대체 | designer.cs 좌표 대신 시안 `mock-v16.html` 의 패널 순서를 쓴다. 자연 제외(L 등급)에 해당하는 시안 전용 요소는 §3.4 에 모은다 |
| 자체 grep | 허용 | Runner 가 없으므로 시안과 현행 코드를 직접 읽는다. 근거는 `파일:줄` 로 적는다 |
| 5종 산출물 순서 | 분석 → 기능 → 디자인 → BPMN → 정합체크 | RULE.md 분기 1 |
| 코드 구현 정합 (§K) | 미착수 | 이 산출물은 레인 `perm-bench-be` 의 b0 이다. BE 는 b1 이후, FE 는 `perm-fe` 레인이 만든다 |

### §-1. SOP 30 Step 실행 결과 기록표

해당 없음. 위 표의 R-13, R-14 행과 같은 사유다(Runner 산출물과 As-Is 소스가 없다). Step 1-30 대신 §14 커버리지 합 일치와 §15 게이트로 전수성을 보인다.

### 0.1 자연 제외 5 단계 판정표 (L1-L5)

L1-L4 는 As-Is 소스가 없어 해당 없음이다. L5 에 해당하는 시안 전용 요소(제품 범위 밖)를 §3.4 에 모았고 여기서 인용한다.

| 우선순위 | 원천 | 요소 | 사유 | Q-NNN | 근거 |
|---|---|---|---|---|---|
| L5 (대체) | 시안 | 의도 설명 블록 | 시안 설명용 | - | §3.4 #1 |
| L5 (대체) | 시안 | 단계 카드와 `data-phase` 전환 | 단계 설명용 | - | §3.4 #2 |
| L5 (대체) | 시안 | 「기존 관리 화면」 섹션 | 다른 레인이 맡는다 | - | §3.4 #3 |
| L5 (대체) | 시안 | 가상 표본 생성 | 표본 데이터 | - | §3.4 #4 |
| L5 (대체) | 시안 | 시안 안 등록·편집 팝업 | 3단계 링크로 대체 | - | §3.4 #5 |
| L5 (대체) | 시안 | `applyDraft` 시안 동작 | 서버 apply 로 대체 | - | §3.4 #6 |
| L5 (대체) | 시안 | 이름·위치·사용 여부 초안 편집 | 초안 변경은 3종만 | Q-039 | §3.4 #7 |

### 0.2 S-NNN 좌표 정렬 표

designer.cs 좌표가 없어 시안의 위에서 아래, 왼쪽에서 오른쪽 순서로 정렬한다.

| 정렬순 | 요소 | 영역 | S-NNN |
|---:|---|---|---|
| 1 | 사람 칸 머리 조회줄 | A-FILTER | S-001, S-002, S-003 |
| 2 | 역할 칸 머리 조회줄 | A-FILTER | S-004 |
| 3 | 메뉴 칸 머리 조회줄 | A-FILTER | S-005, S-006 |
| 4 | 미리보기 머리 | A-FILTER | S-007, S-008 |
| 5 | 폴더 행 선택(입력칸 없음) | A-GRID-EXT | S-009 |
| 6 | 적용 이력 창 조회줄 | A-FILTER | S-010, S-011, S-012 |

### 0.3 G-NNN / GE-NNN 분기 분류표

응답 그리드는 모두 동등 위상이라 `G{n}-NNN` 으로 나눈다(GE 와 섞지 않는다, 01 A.4.8).

| action | 응답 그리드 | 분류 |
|---|---|---|
| searchBench | users, groups, roles, userGroups, groupRoles, me | G1-G5, G16 |
| searchMenuTree | menus | G6 |
| explain | buttons, paths | G7, G8 |
| searchRolePerm | perms | G9 |
| loadDraft, saveDraft | draft | G10 |
| impact | summary, impacts | G11, G12 |
| searchHistory | his | G13 |
| searchHistoryDtl | dtl | G14 |
| apply | result | G15 |

### 0.4 B-NNN / GB-NNN 분류표

| 요소 | 위치 | 동작 | 분류 |
|---|---|---|---|
| 초안 적용, 초안 버리기, 적용 이력 | PageLayout.buttons | 서버 호출, 창 열기 | B |
| 모두, 조회만, 없음, 현재 값으로 | 퍼미션 편집 | 초안 저장 | B |
| 칸 머리 추가, 편집, 수정 아이콘 | 칸 머리 | 다른 화면 열기 | B (link) |
| 변경 되돌리기 ×, 이름 링크, 역할 칩, 폴더 연필 | 그리드 셀 | 선택 변경, 초안 저장, 화면 열기 | GB |
| 그룹, 역할, 메뉴, 모듈·폴더 체크 | 그리드 셀 | 초안 저장 | GB |
| 버튼·팝업 칩 | 퍼미션 편집 | 초안 저장 | D (입력 필드) |

### 0.5 P-NNN 후보 판정표

| 호출 패턴 | 호출 위치 | 분류 | P-NNN |
|---|---|---|---|
| 이 화면의 Modal 3종 | B-001, B-003, apply 오류 | 직접 | P-001, P-002, P-003 |
| 화면 이동 5종 | 칸 머리 링크 | 직접 | P-004-P-008 |
| 주석 처리, 호출 미발견, 외부 화면만 | - | 해당 없음 | - |

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 권한 작업대 |
| 화면 식별자 (screenId) | commPermBench |
| As-Is 식별자 (asIsId) | 해당 없음 (To-Be only) |
| moduleId | mcm (공통관리) |
| moduleGroup | csa (시스템관리) |
| 메뉴 계층 | 공통관리 (mcm) › 시스템관리 (csa) › 권한 작업대 (commPermBench) |
| 적용 명명 룰 | MES 단일 룰 (`{화면명}` camelCase 하나) |
| pageName | commPermBench |
| pageId | commPermBench |
| serviceId | commPermBench |
| Frontend 파일명 | `commPermBench.tsx` (엔트리), 구현은 `m-mcm/page-components/csa/commPermBench/{page,api,types}.ts(x)` |
| BPMN 파일 | `src/backend/mcm/api/src/main/resources/services/csa/commPermBench/commPermBench.bpmn` |
| OASIS 객체 | commPermBench (Bean `commPermBenchService`) |
| 분석 일자 | 2026-11-27 |

**화면 목적** (패턴 1):

> 권한 작업대는 신규 화면의 조회, 수정, 상태변경을 수행한다.

- 주 사용자: 시스템 관리자와 권한 운영 담당자.
- 한 화면에서 하는 일 세 가지(시안 `mock-v16.html:500-505`):
  1. 편집: 사람을 역할 그룹에, 역할을 역할 그룹에 넣고 빼며, 역할에 메뉴를 등록하고 버튼·팝업을 고른다.
  2. 확인: 「이 사람이 이 메뉴에서 이 버튼을 쓸 수 있나, 왜 쓰나, 왜 못 쓰나」에 답한다. 답은 사람 → 역할 그룹 → 역할 → 퍼미션으로 이어지는 길이다.
  3. 시뮬레이션: 저장 전에 누가 어느 화면에서 어느 버튼을 얻고 잃는지 센다.
- 바탕 규칙: 모든 편집은 초안에 쌓이고, 「초안 적용」 전에는 아무것도 바뀌지 않는다(`mock-v16.html:506-511`).
- 세 단계로 만든다(`mock-v16.html:517-538`).

| 단계 | 범위 | 새 API |
|---|---|---|
| 1 확인 | 보기만. 체크·칩 편집 없음 | searchBench, searchMenuTree, explain, searchRolePerm |
| 2 편집과 시뮬레이션 | 초안 편집, 영향, 적용, 이력 | loadDraft, saveDraft, discardDraft, impact, apply, searchHistory, searchHistoryDtl |
| 3 원래 프로그램으로 잇기 | 칸 머리 링크(↗)로 등록·수정 화면을 연다 | 없음 |

## §2. 자료 수집 인벤토리

| # | 자료 구분 | 경로 | 확인 (Y/N) | 분석에 사용한 내용 | 미확인 시 영향 |
|---:|---|---|---|---|---|
| 1 | 시안 | `docs/perm-bench/mock-v16.html` (2,241줄 전부) | Y | 패널 구성, 단계 카드, 초안 막대, 영향 표, 미리보기, 칸 폭 조절 | 레이아웃 근거 없음 |
| 2 | 분해 정본 | `docs/perm-bench/decompose.md` §0 계약, §1 결정 D7-D30 | Y | 테이블, Java 계약, 11 action 입출력 | API 근거 없음 |
| 3 | 레인 규칙 | `docs/perm-bench/README.md` 결정 D31-D34 | Y | Oracle 시험 규칙, 머지 규칙 | 없음 |
| 4 | 현행 런타임 | `src/backend/mcm-core/.../security/endpoint/UserPermCache.java:60-215`, `security/service/SecUserService.java:270-420` | Y | 현행 사람 → 그룹 → 역할 → 매핑 → 퍼미션 계산 | As-Is 서술 근거 없음 |
| 5 | 현행 엔티티 | `mcm-core/.../entity/Sec{User,UserMapping,RoleGroup,RoleGroupMapping,Role,RoleMapping,Perm,Obj,Menu}.java` | Y | 칼럼 길이·이름 (§6) | 표시 형식 미확정 |
| 6 | 옛 화면 설계 | `docs/mcm/design/comm{RoleMng,PermMng,ObjMng,RoleGrpMng}/` | Y | As-Is 화면 책임, 산출물 양식 | 없음 |
| 7 | OASIS 계약 | `.claude/skills/oasis-contract-check/SKILL.md`, `docs/guide/BackEnd/.../02-structure-naming-constraints.md` §6-B-§6-E | Y | `@Transactional` 금지, `output` 명시, `grid` 속성 금지 | BPMN 형식 위반 |
| 8 | FE 선례 | `m-mcm/page-components/csa/commRoleMng/api.ts` | Y | 요청·응답 envelope (`meta/params/grids`, `meta.success=false`) | body 모양 미정 |
| 9 | 설계 가이드 | `docs/guide/design/**`, `Korean-STE-Writing-Guide.md` | Y | 산출물 양식, 게이트, 문체 | 없음 |
| 10 | 운영 화면 캡처 | 없음 | N | 신규 화면. 시안이 기준 | 와이어프레임은 디자인설계서 §2.2 |
| 11 | MCM 설계 결정 레퍼런스 | `docs/guide/reference/mcm-reference.md` (A. 모듈 공통, C. 화면 고유 결정) | Y | 형제 화면 결정(no-op 폐기, `recomputeMenuFullSeq` 의 FULL_SEQ 자동 재계산 등)을 확인했다. 이 화면의 새 결정(D36, 범위 지문, Q-029)은 레퍼런스에 아직 없다(Q-040) | 결정이 화면 밖에 남지 않는다 |
| 12 | 메뉴 테이블 설명 | `docs/mcm/erd/csa-menu-tables.md` | Y | `TB_MCM_SEC_MENU_FLD`(폴더)와 `TB_MCM_SEC_MENU`(메뉴), 메뉴의 PARENT_MENU_ID 는 폴더를 가리킨다 | 폴더 행 출처를 모른다 |
| 13 | 원본 ERP 자료 | `docs/external/KsmErpK/` | N (해당 없음, To-Be only 신규 화면) | 옛 ERP 화면이 없다 | 없음 |

## §3. As-Is 현황과 신규 설계의 근거

### §3.0 검색/탐색 기준

| 구분 | 사용한 키워드/기준 | 결과 요약 |
|---|---|---|
| 시안 | `mock-v16.html` 전체 줄(렌더 함수, 핸들러, 단계 카드) | 칸 5개, 버튼·칩, 초안 막대, 영향 표 |
| 계약 | `decompose.md §0.1-§0.4` | 표 5개, action 11개, 그리드 15개 |
| 현행 런타임 | `UserPermCache`, `SecUserService` 의 `build`, `getMyButtonEndpoints` | 4단 체인 (사용자, 그룹, 역할, 매핑) |
| 옛 화면 | `docs/mcm/design/comm{RoleMng,PermMng,ObjMng,RoleGrpMng}` | 책임 분산 (§3.1) |
| 엔티티 | `entity/Sec*.java` `@Column` | 칼럼 길이 (§6.3) |

### §3.1 현행 화면 분산

| 화면 | 맡은 일 | 이 화면과의 관계 |
|---|---|---|
| commRoleMng | 역할 마스터, 역할의 현재 권한(역할 × 오브젝트 × 퍼미션 ID) 부여·회수 | 역할 ↔ 메뉴 체크와 퍼미션 칩으로 흡수 |
| commPermMng | 퍼미션 마스터(`TB_MCM_SEC_PERM`: 버튼 묶음) 관리 | 새 모델에서 묶음이 없어진다. 퍼미션은 역할 × 오브젝트 한 건 |
| commObjMng | 오브젝트 마스터 | 오브젝트가 허용 버튼·팝업 범위를 가진다. 이 화면은 값을 읽기만 한다 |
| commRoleGrpMng | 역할 그룹 마스터, 그룹 ↔ 역할, 그룹 ↔ 사람 | 체크로 흡수. 마스터 등록·수정은 3단계 링크 |
| commUserMng | 사용자 마스터 | 마스터는 링크(3단계), 사람 ↔ 그룹은 체크로 흡수 |
| commMenuMng | 메뉴 트리 | 이름·위치·표시는 링크(3단계) |

### §3.2 현행 모델과 문제

| 항목 | 현행 | 근거 |
|---|---|---|
| 퍼미션 | `TB_MCM_SEC_PERM` = 버튼 묶음 마스터(`PERMISSION_COMMON`·`CUSTOM`·`POPUP_BTN`·`PERMISSION_ACTION`) | `SecPerm.java:55-87`, `mock-v16.html:544-552` |
| 역할에 거는 방식 | `TB_MCM_SEC_ROLE_MAPPING` (ROLE_ID, OBJECT_ID, PERMISSION_ID) 복합 PK 3칸 | `SecRoleMapping.java` |
| 오브젝트 | 쓸 수 있는 버튼 목록이 없다 | `mock-v16.html:552` |
| 런타임 계산 | `UserPermCache.build`: 사용자 → 그룹(`SecUserMapping`) → 역할(`SecRoleGroupMapping`) → 매핑(`SecRoleMapping`) → 묶음 4칸을 쉼표로 풀어 `module/objId/action` 키 생성 | `UserPermCache.java:152-215` |
| 확인 수단 | 「저장 버튼이 안 눌려요」 문의에 4화면을 오가며 답한다 | `mock-v16.html:522` |
| 영향 확인 | 저장 전에 영향 사람 수를 알 수 없다 | `mock-v16.html:504` |
| 동시 편집 | 화면별로 따로 저장한다. 충돌 감지가 없다 | `decompose.md` D22 |

### §3.3 신규 설계의 정당화

| # | 선택 | 근거 |
|---|---|---|
| 1 | 5칸 흐름(사람 → 그룹 → 역할 → 메뉴 → 미리보기)을 한 화면에 둔다 | 시안 `mock-v16.html:1555`, 역할 관리 시안 D안의 칸 흐름 |
| 2 | 계산을 서버 한 곳(`PermResolver`)에 둔다. 설명·영향·런타임 게이트가 같은 순수 함수를 쓴다 | D24 |
| 3 | 편집은 초안에 쌓고 한 번에 적용한다. 적용은 한 트랜잭션이다 | `mock-v16.html:508-510`, D22 |
| 4 | 충돌은 범위 지문(SHA-256)으로 감지한다 | D22 |
| 5 | 적용 이력을 머리·줄 2테이블로 남긴다 | D23 |
| 6 | 등록·수정 입력 칸은 이 화면에 두지 않는다. 원래 화면으로 연다 | `mock-v16.html:533-535`, D21 |

### §3.4 시안 전용 요소 (제품 범위 밖, L 등급 대체. §0.1 이 인용한다)

| # | 시안 요소 | 위치 | 제외 사유 |
|---|---|---|---|
| 1 | 「이렇게 해 보세요」 의도 설명 블록 | `mock-v16.html:1527-1537` | 시안 설명용 |
| 2 | 단계 카드와 「이 범위로 위 시안 보기」 버튼, `body[data-phase]` | `mock-v16.html:270-273, 517-538` | 단계 설명용. 제품은 한 번에 1-3단계를 모두 낸다(D21) |
| 3 | 「기존 관리 화면」 섹션 전체(역할·오브젝트·퍼미션 관리 새 시안) | `mock-v16.html:539-589, 1697-2240` | 옛 화면 3종은 레인 `perm-legacy-be`·`perm-fe` 가 맡는다 |
| 4 | 가상 표본 생성(`MOD_DEF`, 사람 1,000여 명) | `mock-v16.html:595-689` | 표본 데이터 |
| 5 | 시안 안의 등록·편집 팝업(`createBox`, `editBoxUser` 등) | `mock-v16.html:1166-1327` | 3단계에서 원래 화면 링크로 대체 |
| 6 | `applyDraft` 의 시안 동작(`BASE = DRAFT`) | `mock-v16.html:1590` | 서버 `apply` 로 대체 |
| 7 | 시안의 이름·메뉴 위치·표시·사용 여부 초안 편집(`changes()` 의 `rec`, `menu`, `obj`, `fold`, `order`, `newUser` 등) | `mock-v16.html:901-945` | 초안 변경은 3종(USER_GRP, GRP_ROLE, ROLE_OBJ)만 담는다(§0.3 PermChange) |

## §4. 화면 요소 전수

### §4.1 카운트

| 구분 | 수 | 위치 |
|---|---:|---|
| 영역 (A-) | 5 | §4.1.1 |
| 조회조건·보기 전환 (S-NNN) | 12 | §4.2 |
| 응답 그리드 (G1-G16) | 16 | §4.3 |
| 그리드 컬럼 (G{n}-NNN) | 79 | §4.3 |
| 상세 필드 (D-NNN) | 5 | §4.4 |
| 라인 필드 (L-NNN) | 0 | §4.4 (해당 없음) |
| 버튼 (B-NNN) | 23 | §4.5 |
| 그리드셀 인라인 (GB-NNN) | 8 | §4.5-1 |
| 팝업·화면 연동 (P-NNN) | 8 | §4.6 |

#### §4.1.1 영역

| 영역ID | 영역명 | 시안 근거 |
|---|---|---|
| A-FILTER | 칸 머리 조회줄 (찾기, 좁히기, 보기 전환) | `mock-v16.html:1271, 1301, 1361, 1520-1521` |
| A-GRID | 선택 칸 묶음 (사람, 역할 그룹, 역할) | `mock-v16.html:1263-1302` |
| A-GRID-EXT | 메뉴 칸 (모듈 › 폴더 › 메뉴 트리) | `mock-v16.html:1329-1365` |
| A-DETAIL | 미리보기 칸 (사람 화면, 퍼미션 편집, 켠 역할, 초안 영향) | `mock-v16.html:1461-1524` |
| A-BTN | 위쪽 버튼줄과 초안 막대 | `mock-v16.html:1549-1552` |

### §4.2 조회조건과 보기 전환 (S-NNN)

| 필드ID | 화면 표시명 | 요청 키 | DB 컬럼 | 입력 방식 | 영역 | 시안 근거 |
|---|---|---|---|---|---|---|
| S-001 | 사람 찾기 | userQ | USER_NM, USER_ID, DEPT_NM | TextBox | A-FILTER | `mock-v16.html:1271` |
| S-002 | 역할 그룹으로 좁히기 | roleGroupId | ROLE_GROUP_ID | ComboBox | A-FILTER | §0.3 searchBench (시안에 없음, Q-012) |
| S-003 | 역할로 좁히기 | roleId | ROLE_ID | ComboBox | A-FILTER | §0.3 searchBench (시안에 없음, Q-012) |
| S-004 | 역할 찾기 | (화면 안) | ROLE_NM, ROLE_ID | TextBox | A-FILTER | `mock-v16.html:1301` |
| S-005 | 메뉴 찾기 | (화면 안) | MENU_NM, OBJECT_ID | TextBox | A-FILTER | `mock-v16.html:1361` |
| S-006 | 메뉴 보기 (등록된 것 / 모두) | (화면 안) | - | ComboBox | A-FILTER | `mock-v16.html:1362` |
| S-007 | 보기 기준 (사람 기준 / 역할 기준) | (화면 안) | - | ComboBox | A-FILTER | `mock-v16.html:1520` |
| S-008 | 권한 기준 (현재 / 초안) | source | - | ComboBox | A-FILTER | `mock-v16.html:1521` |
| S-009 | 메뉴 폴더 | menuFolderId | MENU_ID | ComboBox | A-FILTER | §0.3 searchRolePerm. 폴더 행을 고를 때 정해지는 선택 폴더다. 메뉴 칸의 등록 개수는 폴더 없이 부르고, 이 값은 퍼미션 편집 목록에 쓴다 (S2) |
| S-010 | 이력 시작일 | fromDt | APPLY_AT | DatePicker | A-FILTER | §0.3 searchHistory. 시안에 없음 |
| S-011 | 이력 종료일 | toDt | APPLY_AT | DatePicker | A-FILTER | 같음 |
| S-012 | 적용자 | applyUserId | APPLY_USER_ID | TextBox | A-FILTER | 같음 |

- 요청 키 `userId`, `objectId`, `applyId` 는 입력칸이 아니라 행 선택으로 정한다(G1, G6, G13 의 행 선택, §4.3).

### §4.3 응답 그리드와 컬럼 (G{n}-NNN)

컬럼 이름은 `decompose.md §0.3` 와 글자 그대로 같다. 순서도 같다.

| 그리드 | action | 키 | 컬럼 수 | 화면에서 하는 일 |
|---|---|---|---:|---|
| G1 | searchBench | users | 4 | 사람 칸 |
| G2 | searchBench | groups | 4 | 역할 그룹 칸 |
| G3 | searchBench | roles | 7 | 역할 칸 |
| G4 | searchBench | userGroups | 2 | 사람 ↔ 그룹 체크 (표시 안 함) |
| G5 | searchBench | groupRoles | 2 | 그룹 ↔ 역할 체크 (표시 안 함) |
| G6 | searchMenuTree | menus | 10 | 두 곳에 쓴다. 역할 기준 호출(`roleId`)은 메뉴 칸 트리, 사람 기준 호출(`userId`)은 미리보기 앱 창 메뉴 |
| G7 | explain | buttons | 7 | 미리보기 버튼·팝업 줄 |
| G8 | explain | paths | 4 | 켠 길(그룹 → 역할 → 퍼미션) |
| G9 | searchRolePerm | perms | 10 | 메뉴 칸의 등록 상태와 버튼 수(폴더 없이 호출), 퍼미션 편집 |
| G10 | loadDraft, saveDraft | draft | 3 | 초안 막대, 변경 목록 |
| G11 | impact | summary | 3 | 초안 막대 영향 숫자 |
| G12 | impact | impacts | 6 | 영향 사람 표 |
| G13 | searchHistory | his | 7 | 적용 이력 표 |
| G14 | searchHistoryDtl | dtl | 7 | 적용 이력 줄 표 |
| G15 | apply | result | 2 | 적용 결과 알림 |
| G16 | searchBench | me | 1 | 현재 사용자가 시스템 관리자인지(V-009 미리 잠금) |

| 컬럼ID | 컬럼 | 의미 |
|---|---|---|
| G1-001 | USER_ID | 사용자 ID |
| G1-002 | USER_NM | 사용자명 |
| G1-003 | DEPT_NM | 부서명 (`SecUser.DEPT_CD` → `TB_MCM_DEPT_INFO.DEPT_NM`) |
| G1-004 | USE_TP | 사용 여부 |
| G2-001 | ROLE_GROUP_ID | 역할 그룹 ID |
| G2-002 | ROLE_GROUP_NM | 역할 그룹명 |
| G2-003 | USE_TP | 사용 여부 |
| G2-004 | USER_CNT | 그룹에 든 사람 수 |
| G3-001 | ROLE_ID | 역할 ID |
| G3-002 | ROLE_NM | 역할명 |
| G3-003 | MENU_ID | 역할의 메뉴 폴더 ID (`SecRole.MENU_ID`) |
| G3-004 | USE_TP | 사용 여부 |
| G3-005 | GROUP_CNT | 이 역할을 가진 그룹 수 |
| G3-006 | USER_CNT | 이 역할을 받은 사람 수 |
| G3-007 | PERM_CNT | 이 역할의 퍼미션 건수(메뉴 수) |
| G4-001 | USER_ID | 사람 |
| G4-002 | ROLE_GROUP_ID | 사람이 든 그룹 |
| G5-001 | ROLE_GROUP_ID | 그룹 |
| G5-002 | ROLE_ID | 그룹이 가진 역할 |
| G6-001 | MENU_ID | 메뉴 ID |
| G6-002 | PARENT_MENU_ID | 상위 폴더 ID |
| G6-003 | MENU_NM | 메뉴 이름 |
| G6-004 | OBJECT_ID | 연결 오브젝트 ID (폴더 행은 비어 있다) |
| G6-005 | SORT_SEQ | 정렬 순서 (`SecMenu.FULL_SEQ`, Q-024) |
| G6-006 | SHOW_TP | 표시 여부 (`SecMenu.MENU_VIEW_YN`) |
| G6-007 | USE_TP | 메뉴 사용 여부 |
| G6-008 | VISIBLE | 고른 사람(또는 역할)에게 메뉴에 보이는가 (Y/N) |
| G6-009 | REASON | 보이지 않는 이유 (DenyReason) |
| G6-010 | OBJ_USE_TP | 연결 오브젝트의 사용 여부 (`SecObj.USE_TP`). 폴더와 OBJECT_ID 가 없는 행은 null. 역할 기준 트리에서 「오브젝트 사용 안 함」 을 보이는 데 쓴다 |
| G7-001 | CODE | 버튼·팝업 코드 (오브젝트 허용 값과 퍼미션 값의 합) |
| G7-002 | KIND | BTN 또는 POPUP |
| G7-003 | ALLOWED | 오브젝트가 허용하는가 (Y/N) |
| G7-004 | GRANTED | 고른 사람이 쓸 수 있는가 (Y/N) |
| G7-005 | REASON | 켜진 이유(GrantReason) 또는 잠긴 이유(DenyReason) |
| G7-006 | ROLES | 켠 역할 ID 목록 (쉼표) |
| G7-007 | GROUPS | 켠 역할 그룹 ID 목록 (쉼표) |
| G8-001 | ROLE_GROUP_ID | 길의 그룹 |
| G8-002 | ROLE_ID | 길의 역할 |
| G8-003 | BTN_PERM | 그 역할의 이 오브젝트 버튼 퍼미션 값 |
| G8-004 | POPUP_PERM | 그 역할의 이 오브젝트 팝업 퍼미션 값 |
| G9-001 | ROLE_ID | 역할 |
| G9-002 | OBJECT_ID | 오브젝트 |
| G9-003 | OBJECT_NM | 오브젝트명 |
| G9-004 | MENU_PATH | 메뉴 경로 (모듈 › 폴더 › 메뉴) |
| G9-005 | OBJ_BTN_PERM | 오브젝트가 허용하는 버튼 |
| G9-006 | OBJ_POPUP_PERM | 오브젝트가 허용하는 팝업 |
| G9-007 | OBJ_READ_PERM | 「조회만」 프리셋 값 (D18, 서버 계산) |
| G9-008 | BTN_PERM | 역할에 준 버튼 |
| G9-009 | POPUP_PERM | 역할에 준 팝업 |
| G9-010 | DATA_PERM | 데이터 권한. 표시·편집하지 않고 저장 때 통과만 한다(D21) |
| G10-001 | CHANGES_JSON | 초안 변경 목록(PermChange JSON 배열) |
| G10-002 | CHANGE_CNT | 변경 건수 |
| G10-003 | U_AT | 초안 마지막 저장 시각 |
| G11-001 | GAIN_USER_CNT | 버튼을 얻는 사람 수 |
| G11-002 | LOSE_USER_CNT | 버튼을 잃는 사람 수 |
| G11-003 | SCREEN_CNT | 영향받는 화면 수 |
| G12-001 | USER_ID | 영향받는 사람 |
| G12-002 | USER_NM | 사람 이름 |
| G12-003 | OBJECT_ID | 화면(오브젝트) |
| G12-004 | OBJECT_NM | 화면 이름 |
| G12-005 | GAINED | 얻는 코드 목록 |
| G12-006 | LOST | 잃는 코드 목록 |
| G13-001 | APPLY_ID | 적용 ID |
| G13-002 | APPLY_USER_ID | 적용한 사람 |
| G13-003 | APPLY_AT | 적용 시각 |
| G13-004 | CHANGE_CNT | 변경 건수 |
| G13-005 | GAIN_USER_CNT | 얻은 사람 수 |
| G13-006 | LOSE_USER_CNT | 잃은 사람 수 |
| G13-007 | APPLY_MEMO | 적용 메모 |
| G14-001 | SEQ_NO | 줄 번호 |
| G14-002 | TARGET_TP | 대상 종류 (USER_GRP, GRP_ROLE, ROLE_OBJ) |
| G14-003 | KEY1 | 대상 키 1 |
| G14-004 | KEY2 | 대상 키 2 |
| G14-005 | OP_TP | ADD, DEL, UPD |
| G14-006 | BEFORE_VAL | 바꾸기 전 값 |
| G14-007 | AFTER_VAL | 바꾼 뒤 값 |
| G15-001 | APPLY_ID | 방금 만든 적용 ID |
| G15-002 | CHANGE_CNT | 적용한 변경 건수 |
| G16-001 | ME_SYSADMIN | 현재 사용자가 시스템 관리자인가 (Y/N). 검증기와 같은 DB 체인 규칙, 로그인 정보가 없으면 N |

- 행 선택이 요청 키를 정한다: G1 행 → `userId`, G3 행 → `roleId`, G6 행 → `objectId`, G13 행 → `applyId`.
- G1 은 서버가 200건으로 자른다(Q-011).

### §4.4 상세 필드 (D-NNN)와 라인 필드 (L-NNN)

| 필드ID | 화면 표시명 | DB 컬럼 | 입력 방식 | 필수 | 설명 | 시안 근거 |
|---|---|---|---|---|---|---|
| D-001 | 버튼 권한 | BTN_PERM | 칩 묶음(켜고 끄기) | N | 오브젝트 허용 버튼 중에서 고른다. 마지막 칩을 끄면 퍼미션을 뺀다(D14) | `mock-v16.html:1372` |
| D-002 | 팝업 권한 | POPUP_PERM | 칩 묶음(켜고 끄기) | N | 오브젝트 허용 팝업 중에서 고른다. 버튼이 하나도 없으면 고를 수 없다 | `mock-v16.html:1375` |
| D-003 | 데이터 권한 | DATA_PERM | (표시 안 함) | N | 편집 UI 없음. 저장 때 값을 그대로 둔다(D21) | `decompose.md` D21 |
| D-004 | 적용 메모 | memo | TextBox | N | 이력 `APPLY_MEMO` 에 적는다. 1,000자 이하 | §0.3 apply |
| D-005 | 잃는 사람 확인 | confirmLoss | CheckBox | N | 버튼을 잃는 사람이 있을 때 체크해야 적용한다 | §0.3 apply, 단계 2 끝 기준 |

라인 필드(L-NNN): 해당 없음. 마스터-라인 구조가 아니다.

### §4.5 버튼 (B-NNN)

| 버튼ID | 버튼명 | 영역 | 서버 호출 | 시안 근거 |
|---|---|---|---|---|
| B-001 | 초안 적용 | A-BTN | impact 후 P-001 을 연다 | `mock-v16.html:1552` |
| B-002 | 초안 버리기 | A-BTN | discardDraft | `mock-v16.html:1552` |
| B-003 | 적용 이력 | A-BTN | P-002 를 연다 (searchHistory) | D23 |
| B-004 | 모두 | A-DETAIL | saveDraft (BTN = 오브젝트 허용 버튼 전부) | `mock-v16.html:1387` |
| B-005 | 조회만 | A-DETAIL | saveDraft (BTN = OBJ_READ_PERM) | `mock-v16.html:1387`, D18 |
| B-006 | 없음 | A-DETAIL | saveDraft (퍼미션 행 빼기) | `mock-v16.html:1387`, D14 |
| B-007 | 현재 값으로 | A-DETAIL | saveDraft (이 퍼미션의 변경만 초안에서 뺀다) | `mock-v16.html:1387` |
| B-008 | 모두 펼치기 | A-GRID-EXT | 없음 (화면 안) | `mock-v16.html:1363` |
| B-009 | 모두 접기 | A-GRID-EXT | 없음 (화면 안) | `mock-v16.html:1363` |
| B-010 | 모든 칸 폭 처음대로 | A-BTN | 없음 (화면 안) | `mock-v16.html:515` |
| B-011 | 적용 실행 (P-001 안) | A-BTN | apply | §0.3 apply |
| B-012 | 이력 조회 (P-002 안) | A-FILTER | searchHistory | §0.3 searchHistory |
| B-013 | 충돌 범위의 변경 빼기 (P-003 안) | A-BTN | saveDraft | D22, Q-026 |
| B-014 | 초안 버리고 다시 읽기 (P-003 안) | A-BTN | discardDraft 후 searchBench | D22, Q-026 |
| B-015 | 사용자 추가 (↗) | A-GRID | 없음 (P-004 로 이동) | `mock-v16.html:1271, 1135` |
| B-016 | 사용자 편집 (↗) | A-GRID | 없음 (P-004 로 이동) | `mock-v16.html:1271, 1136` |
| B-017 | 역할 그룹 추가 (↗) | A-GRID | 없음 (P-005 로 이동) | `mock-v16.html:1282` |
| B-018 | 역할 그룹 편집 (↗) | A-GRID | 없음 (P-005 로 이동) | `mock-v16.html:1282` |
| B-019 | 역할 추가 (↗) | A-GRID | 없음 (P-006 으로 이동) | `mock-v16.html:1291, 1301` |
| B-020 | 역할 편집 (↗) | A-GRID | 없음 (P-006 으로 이동) | `mock-v16.html:1291, 1301` |
| B-021 | 메뉴 수정 (↗) | A-GRID-EXT | 없음 (P-007 로 이동) | `mock-v16.html:1331` |
| B-022 | 오브젝트 추가 (↗) | A-GRID-EXT | 없음 (P-008 로 이동) | `mock-v16.html:1331` |
| B-023 | 오브젝트 수정 (↗) | A-GRID-EXT | 없음 (P-008 로 이동) | `mock-v16.html:1331` |

### §4.5-1 그리드셀 인라인 (GB-NNN)

| ID | 이름 | 소속 | 서버 호출 | 시안 근거 |
|---|---|---|---|---|
| GB-001 | 변경 하나 되돌리기 (×) | 변경 목록 (G10 의 CHANGES_JSON 줄) | saveDraft | `mock-v16.html:1428` |
| GB-002 | 사람 이름 링크 (그 사람 기준으로 보기) | G12 | 없음 (선택 변경 후 조회) | `mock-v16.html:1432` |
| GB-003 | 역할 칩 (그 역할을 고르기) | G7 의 ROLES 칩, 켠 역할 목록 | 없음 (선택 변경 후 조회) | `mock-v16.html:1494-1496` |
| GB-004 | 폴더 연필 (↗) | G6 폴더 행 | 없음 (P-007 로 이동) | `mock-v16.html:1339` |
| GB-005 | 사람 ↔ 그룹 체크 | G2 체크 열 | saveDraft (USER_GRP) | `mock-v16.html:1280, 1598` |
| GB-006 | 그룹 ↔ 역할 체크 | G3 체크 열 | saveDraft (GRP_ROLE) | `mock-v16.html:1289, 1599` |
| GB-007 | 역할 ↔ 메뉴 체크 | G6 메뉴 행 | saveDraft (ROLE_OBJ) | `mock-v16.html:1355, 1600` |
| GB-008 | 모듈·폴더 일괄 체크 (세 상태) | G6 모듈·폴더 행 | saveDraft (ROLE_OBJ 여러 건) | `mock-v16.html:1338, 1601` |

### §4.6 팝업과 화면 연동 (P-NNN)

| 팝업ID | 대상 | 종류 | 트리거 | 시안 근거 |
|---|---|---|---|---|
| P-001 | 적용 확인 창 (영향 요약, 메모, 잃는 사람 확인) | 이 화면의 Modal | B-001 | 단계 2 끝 기준 `mock-v16.html:531` |
| P-002 | 적용 이력 창 (이력 표 + 줄 표) | 이 화면의 Modal | B-003 | D23 |
| P-003 | 충돌 안내 창 | 이 화면의 Modal | apply 가 PERM_CONFLICT 를 돌려줄 때 | 단계 2 끝 기준 `mock-v16.html:531` |
| P-004 | 사용자 관리 | 외부 화면 `commUserMng` | B-015, B-016 | `mock-v16.html:1132` |
| P-005 | 역할 그룹 관리 | 외부 화면 `commRoleGrpMng` | B-017, B-018 | 같음 |
| P-006 | 역할 관리 | 외부 화면 `commRoleMng` | B-019, B-020 | 같음 |
| P-007 | 메뉴 관리 | 외부 화면 `commMenuMng` | B-021, GB-004 | 같음 |
| P-008 | 오브젝트 관리 | 외부 화면 `commObjMng` | B-022, B-023 | 같음 |

## §5. 서버 계약과 화면 이벤트 매핑 (As-Is 소스 분석 대체)

### §5.0 action 별 트리거

| API-ID | action | 트리거 | 단계 | 출력 그리드 |
|---|---|---|---|---|
| API-001 | searchBench | 화면 진입, S-001-S-003, 다른 화면에서 돌아옴 | 1 | G1-G5, G16 |
| API-002 | searchMenuTree | 사람 선택(G1), 역할 선택(G3), S-007, S-008. 메뉴 칸은 `roleId` 로, 미리보기 메뉴는 `userId` 로 각각 부른다 | 1 | G6 |
| API-003 | explain | 메뉴 선택(G6), 사람 선택, S-008 | 1 | G7, G8 |
| API-004 | searchRolePerm | 역할 선택(G3), 메뉴 선택. 폴더 없이 부른 결과로 메뉴 칸 등록 상태를 그리고, S-009 로 좁혀 퍼미션 편집 목록을 그린다 | 1 | G9 |
| API-005 | loadDraft | 화면 진입 | 2 | G10 |
| API-006 | saveDraft | GB-001, GB-005-GB-008, B-004-B-007, B-013 | 2 | G10 |
| API-007 | discardDraft | B-002, B-014 | 2 | 없음 |
| API-008 | impact | 초안 변경 뒤, B-001 | 2 | G11, G12 |
| API-009 | apply | B-011 | 2 | G15 |
| API-010 | searchHistory | B-003, B-012 | 2 | G13 |
| API-011 | searchHistoryDtl | G13 행 선택 | 2 | G14 |

- 현재와 초안 비교(S1): 초안이 있으면 API-002, API-003, API-004 를 `source=CUR` 와 `source=DRAFT` 로 한 번씩 부른다. 「새로 n, 사라짐 m」, 버튼 칩의 얻음·잃음 테두리, 메뉴 칸 초안 열이 두 응답의 차이로 그려진다. 초안이 없으면 `CUR` 한 번이다.
- 3단계는 새 API 를 만들지 않는다(§0.3).

### §5.1 이벤트 12종 매트릭스

해당 없음. WinForms 이벤트가 없다. 대체: §5.0 의 트리거 ↔ action 표와 §4.5, §4.5-1 이다.

### §5.2 SP 분기 매트릭스

해당 없음. As-Is SP 가 없다. 서버 계산은 `PermResolver` 계약(`decompose.md §0.2`)이 정본이다.

### §5.3 외부 호출 깊이 D1-D3

| 깊이 | 대상 | 내용 | 근거 |
|---|---|---|---|
| D1 | 이 화면의 자산 | `commPermBench.bpmn`, `CommPermBenchService`, DTO, `PermBenchGraphSource`, `CommPermBenchQueryRepository`, `PermDraftService`, `PermImpactService`, `PermApplyService`, `PermHistoryService` | `decompose.md §2.3` b1-b5, 코드 `csa/commPermBench/` |
| D2 | 공용 계약 | `PermResolver`(서비스가 직접 부른다. `PermExplainService` 는 쓰지 않는다), `PermGraph`, `PermGraphLoader`, `ImpactCalculator`, `PermTokens`, 새 테이블 5종과 엔티티 | `decompose.md §0.2`, c0, c1, r1, r2 |
| D3 | 런타임 소비자와 이웃 화면 | `UserPermCache`, `SecUserService`, `EndpointPermissionFilter`(같은 `PermResolver` 로 전환, r3), `RoleChangedEvent` 구독자, 이웃 화면 5종 | `UserPermCache.java:60-215`, `decompose.md §2.2` |

---

## §6. DB 와 테이블

### §6.1 새 테이블 (V20, `decompose.md §0.1`)

| 테이블 | 엔티티 | 이 화면의 사용 | PK |
|---|---|---|---|
| TB_MCM_SEC_ROLE_PERM | SecRolePerm | 읽기(explain, searchRolePerm, searchMenuTree), 쓰기(apply) | ROLE_ID + OBJECT_ID |
| TB_MCM_SEC_OBJ (칼럼 BTN_PERM, POPUP_PERM, DATA_PERM 추가) | SecObj | 읽기(허용 값) | OBJECT_ID |
| TB_MCM_SEC_PERM_DRAFT | SecPermDraft | 읽기·쓰기(초안), 관리자마다 1건 | OWNER_USER_ID |
| TB_MCM_SEC_PERM_HIS | SecPermHis | 쓰기(apply), 읽기(searchHistory) | APPLY_ID |
| TB_MCM_SEC_PERM_HIS_DTL | SecPermHisDtl | 쓰기(apply), 읽기(searchHistoryDtl) | APPLY_ID + SEQ_NO |

### §6.2 기존 테이블 (읽기와 apply 의 쓰기)

| 테이블 | 엔티티 | 이 화면의 사용 |
|---|---|---|
| TB_MCM_SEC_USER | SecUser | 읽기(G1, USE_TP). 변경하지 않는다 |
| TB_MCM_DEPT_INFO | DeptInfo | 읽기(G1-003 DEPT_NM) |
| TB_MCM_SEC_USER_MAPPING | SecUserMapping | 읽기, apply 쓰기(USER_GRP). PK USER_ID + ROLE_GROUP_ID |
| TB_MCM_SEC_ROLEGROUP | SecRoleGroup | 읽기(G2) |
| TB_MCM_SEC_ROLEGROUP_MAPPING | SecRoleGroupMapping | 읽기, apply 쓰기(GRP_ROLE). PK ROLE_GROUP_ID + ROLE_ID |
| TB_MCM_SEC_ROLE | SecRole | 읽기(G3) |
| TB_MCM_SEC_MENU | SecMenu | 읽기(G6 메뉴 행) |
| TB_MCM_SEC_MENU_FLD | (엔티티 없음, 네이티브 SQL) | 읽기(G6 폴더 행). 폴더의 PARENT_MENU_ID 는 폴더를 가리키고, 메뉴의 PARENT_MENU_ID 는 폴더를 가리킨다 |
| TB_MCM_SEC_PERM, TB_MCM_SEC_ROLE_MAPPING (옛) | SecPerm, SecRoleMapping | 쓰지 않는다. 이번 회차에 쓰기를 멈춘다(D10) |

### §6.3 칼럼 길이 (표시 형식 근거)

| 칼럼 | 형식 | 근거 |
|---|---|---|
| USER_ID | varchar(30) | `SecUser.java:50` |
| USER_NM | varchar(30) | `SecUser.java:62` |
| DEPT_NM | varchar(100) | `DeptInfo.java:56` |
| ROLE_GROUP_ID | varchar(30) | `SecRoleGroup.java:51` |
| ROLE_GROUP_NM | varchar(100) | `SecRoleGroup.java:54` |
| ROLE_ID | varchar(30) | `SecRole.java:50` |
| ROLE_NM | varchar(100) | `SecRole.java:54` |
| MENU_ID, PARENT_MENU_ID | varchar(30) | `SecMenu.java:54, 126` |
| MENU_NM | varchar(300) | `SecMenu.java:70` (폴더는 같은 형식으로 가정, Q-025) |
| OBJECT_ID | varchar(50) | `SecObj.java:50` |
| OBJECT_NM | varchar(100) | `SecObj.java:54` |
| SORT_SEQ (FULL_SEQ) | varchar(30) | `SecMenu.java:66` |
| USE_TP, SHOW_TP | varchar(1) | `SecMenu.java:95, 117` |
| BTN_PERM, POPUP_PERM, DATA_PERM | varchar(1000) | `decompose.md §0.1` |
| APPLY_ID | varchar(40) | §0.1 |
| APPLY_USER_ID, OWNER_USER_ID | varchar(100) | §0.1 |

## §7. To-Be 테이블 변환점

| # | 변환 | 근거 |
|---|---|---|
| 1 | 옛 `ROLE_MAPPING` 여러 줄(ROLE, OBJ, PERM_ID)이 새 `ROLE_PERM` 한 건이 된다. `BTN_PERM = COMMON ∪ CUSTOM ∪ ACTION`, `POPUP_PERM = POPUP_BTN` | D11 |
| 2 | 오브젝트 허용 값은 BPMN `actionGateway` 분기 이름과 REST 보충 목록에서 처음 채운다 | D12 |
| 3 | SYSADMIN 은 퍼미션 행 없이 계산한다 | D13 |
| 4 | 버튼 없는 퍼미션을 두지 않는다 | D14 |
| 5 | 오브젝트에서 값을 빼도 퍼미션 값은 남긴다. 계산에서 교집합으로 뺀다 | D15 |
| 6 | 퍼미션에 USE_TP·유효 기간이 없다 | D16 |
| 7 | 키 모양 `lower(SYSTEM_CODE ?: "mcm")/lower(OBJECT_ID)/action` 은 그대로다 | D26 |

## §8. 시안과 정본의 매핑 (불일치 처리)

| # | 시안 | 정본 | 선택 | 근거 |
|---|---|---|---|---|
| 1 | 새 테이블 이름 `TB_MCM_SEC_PERM`, BTN 500자(`mock-v16.html:565-571`) | `TB_MCM_SEC_ROLE_PERM`, 1000자 | 정본 | D9, §0.1 |
| 2 | 빈 버튼 퍼미션 여부는 「정할 것」(`mock-v16.html:582`) | 금지 | 정본 | D14 |
| 3 | 조회만 = `search`, `export` 고정(`mock-v16.html:1579`) | 서버 `OBJ_READ_PERM` | 정본 | D18 |
| 4 | 시안은 이름·메뉴 위치·표시·사용 여부·등록까지 초안에 담는다 | PermChange 3종 | 정본 | §0.3, D21 |
| 5 | 시안 요약 숫자 「영향 사람 · 버튼 +n −n」(`mock-v16.html:1427`) | summary 3칸 | 정본 (Q-008) | §0.3 |
| 6 | 「이 메뉴를 연 역할」에 사람에게 없는 역할도 나열(`mock-v16.html:1415-1420`) | 오브젝트 기준 조회 API 없음 | 정본 (Q-009) | §0.3 |
| 7 | 시안은 버튼 한글 이름을 보인다 | 코드 그대로 | 정본 | D17 |
| 8 | 시안의 DATA_PERM 편집(「데이터 권한」 탭 가안) | 편집 UI 없음 | 정본 | D21 |
| 9 | 시안의 초안은 브라우저 메모리 | 서버 1건 | 정본 | D22 |
| 10 | 시안에는 충돌 안내, 잃는 사람 확인, 이력, 메모가 없다 | 단계 2 끝 기준과 D22, D23 | 정본 (디자인설계서 §6 에서 새로 설계) | `mock-v16.html:531`, §0.3 |
| 11 | §0.3 `menus` 는 9칸 | 마지막 칸 OBJ_USE_TP 추가(조정자 결정, perm-fe 요청). 역할 기준 REASON 은 NO_PERM 만 쓴다. 역할별 메뉴 개방 목록 action 은 다음 회차 | 정본 변경 | 조정자 |
| 12 | §0.3 `searchBench` 응답은 그리드 5개 | 그리드 `me` 추가(한 행, ME_SYSADMIN). 조정자 추가. V-009 를 FE 가 미리 잠그는 데 쓴다 | 정본 변경 | 조정자 |

## §9. 상태값과 코드값

### §9.1 상태값 (ST-NNN)

| 상태코드 | 한글명 | 설명 |
|---|---|---|
| NONE | 초안 없음 | CHANGE_CNT = 0. 적용·버리기 단추가 꺼진다 |
| DIRTY | 초안 있음 | CHANGE_CNT ≥ 1 |
| CONFLICT | 충돌 감지 | apply 가 PERM_CONFLICT 를 돌려준 뒤 P-003 이 열려 있다 |
| CONFIRM | 잃는 사람 확인 필요 | P-001 에서 LOSE_USER_CNT ≥ 1 이다 |

| ID | 상태 | 값 |
|---|---|---|
| ST-001 | 초안 없음 | NONE |
| ST-002 | 초안 있음 | DIRTY |
| ST-003 | 충돌 감지 | CONFLICT |
| ST-004 | 확인 필요 | CONFIRM |

### §9.2 코드값 (LV-NNN)

| ID | 대상 | 값 |
|---|---|---|
| LV-001 | USE_TP (사용 여부) | Y 사용, N 사용 안 함 |
| LV-002 | source | CUR 현재, DRAFT 초안 |
| LV-003 | G7 KIND | BTN 버튼, POPUP 팝업 |
| LV-004 | G6 REASON, G7 REASON | 켜짐 이유 `PERM`, `SYSADMIN`. 잠김 이유 `NO_PERM`, `NOT_IN_OBJ`, `ROLE_UNUSED`, `GROUP_UNUSED`, `OBJ_UNUSED`, `MENU_HIDDEN`, `NO_ROLE` |
| LV-005 | TARGET_TP, PermChange.tp | USER_GRP, GRP_ROLE, ROLE_OBJ |
| LV-006 | OP_TP, PermChange.op | ADD, DEL, UPD |
| LV-007 | SHOW_TP | Y 보임, N 숨김 |
| LV-008 | Y/N 플래그 | ALLOWED, GRANTED, VISIBLE, confirmLoss |

## §10. 업무 규칙과 V-NNN

| # | 업무 규칙 | 유형 | 근거 | V-NNN | 반영 위치 |
|---:|---|---|---|---|---|
| 1 | 퍼미션 행은 버튼이 하나 이상이어야 한다 | 검증 | D14 | V-001 | saveDraft(먼저 검사), apply(다시 검사) |
| 2 | 버튼·팝업 값은 오브젝트 허용 값 안이어야 한다. 퍼미션을 고칠 때 오브젝트 밖의 옛 값은 버려진다 | 검증 | D15, 조정자 답변 S3 | V-002 | saveDraft(먼저 검사), apply(다시 검사) |
| 3 | SYSADMIN 역할은 퍼미션 행을 갖지 않는다 | 검증 | D13 | V-003 | saveDraft |
| 4 | 초안 변경은 TP, OP, KEY1, KEY2 가 정해진 값이어야 한다 | 검증 | §0.2 PermChange | V-004 | saveDraft |
| 5 | 적용할 초안이 없으면 거절한다 | 검증 | §0.3 | V-005 | apply |
| 6 | 메모는 1,000자 이하다 | 검증 | §0.1 APPLY_MEMO | V-006 | apply |
| 7 | 이력 조회 시작일은 종료일보다 늦을 수 없다 | 검증 | §0.3 | V-007 | FE, searchHistory |
| 8 | 같은 (TP, KEY1, KEY2) 를 두 번 담지 않는다 | 검증 | 조정자 답변 S5 | V-008 | saveDraft |
| 9 | SYSADMIN 이 걸린 변경은 SYSADMIN 사용자만 한다 | 검증 | 조정자 답변 S7 (Q-029) | V-009 | saveDraft, apply |
| 10 | 버튼을 잃는 사람이 있으면 확인 없이 적용하지 않는다 | 검증 | `mock-v16.html:531` | XV-001 | apply |
| 11 | 초안이 처음 건드린 범위의 지문이 달라졌으면 적용하지 않는다 | 검증 | D22 | XV-002 | apply |
| 12 | 변경 대상(사람, 그룹, 역할, 오브젝트)이 있어야 한다 | 검증 | FK | XV-003 | apply |
| 13 | 적용은 한 트랜잭션이다. 이력을 남기고 초안을 비운다 | 부수효과 | D22, D23 | - | apply |
| 14 | 적용하면 `RoleChangedEvent` 를 커밋 뒤에 발행한다. roleIds = ROLE_OBJ 의 KEY1, GRP_ROLE 의 KEY2, USER_GRP 그룹이 가진 역할(적용 전과 후의 합집합) | 부수효과 | D30, 조정자 답변 M4 | - | apply |
| 15 | 사용 안 함(역할, 그룹, 오브젝트)은 계산에서 빠진다. 사용 안 함 사용자는 explain 에서 모두 NO_ROLE 이다(런타임 차이, r5 기록) | 계산 | §0.2 | - | PermResolver |
| 16 | 효과 = (퍼미션.BTN ∩ 오브젝트.BTN) ∪ (퍼미션.POPUP ∩ 오브젝트.POPUP) | 계산 | §0.2 | - | PermResolver |
| 17 | SYSADMIN 은 모든 사용 오브젝트의 모든 코드를 쓴다 | 계산 | D13 | - | PermResolver |
| 18 | 설명·영향·런타임 게이트는 같은 `PermResolver` 를 쓴다 | 계산 | D24 | - | 서비스 전체 |
| 19 | 초안 편집은 관리자마다 1건이다 | 저장 | D22 | - | saveDraft |
| 20 | 화면에서 한 변경은 원래 화면 저장과 겹치면 적용 때 충돌로 알린다 | 부수효과 | D22 | XV-002 | apply |
| 21 | `searchMenuTree` 는 런타임 `SecUserService.getMyMenus` 의 폴더 규칙을 따른다. 숨김 폴더라도 보이는 화면의 상위 폴더면 행으로 나온다(hiddenYn). r5 대조 시험이 `searchMenuTree` 를 덮는다 | 계산 | 조정자 답변 | - | PermBenchGraphSource |
| 22 | `PermGraphLoader.loadForUsers` 는 사용자, 그룹, 역할, 퍼미션만 좁힌다. 오브젝트와 메뉴는 항상 전체를 읽는다(r2 계약) | 계산 | 조정자 답변 | - | PermBenchGraphSource |

## §11. API 패턴 판정 (C1-C6)

| 조건 | 충족 | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | As-Is SP 가 없다 | 없음 |
| C2. LoV master 호출 컬럼 5종 이상 | N | 코드 마스터 LoV 가 없다. 콤보 값은 G2, G3 에서 온다 | 없음 |
| C3. 회사·공장 종속 LoV | N | 없음 | 없음 |
| C4. 동적 컬럼 응답 | N | 컬럼이 고정이다(§4.3) | 없음 |
| C5. 독립 query 분리가 적합 | N | `mcm` 모듈은 SqlSession 이 없어 Phase 7 을 쓰지 않는다(`commRoleMng/api.ts` 머리 주석) | 없음 |
| C6. 외부 SP 호출 | N | 없음 | 없음 |

| 항목 | 값 |
|---|---|
| 충족 조건 수 | 0 |
| 채택 패턴 | OASIS 단일 BPMN |
| 라우팅 | `POST /oasis/commPermBench/{action}` (FE 호출은 `POST /api/mcm/oasis/commPermBench/{action}`) |
| Q-NNN 등재 여부 | N |

### 11.3 자연 제외 항목

§0.1 의 L5 대체 행 7건을 그대로 인용한다(§3.4). 자체로 더한 항목은 없다.

## §12. 주요 설계 결정 (이 화면에 걸린 것)

| # | 결정 | 사유 (5 enum) | 사용자 확인 필요 |
|---:|---|---|---|
| 1 | action 11개를 한 BPMN, 한 Bean(`commPermBenchService`)에 둔다 | (2) 의도적 To-Be 정책 | N |
| 2 | 그리드가 하나인 action(searchMenuTree, searchRolePerm, loadDraft, saveDraft, apply, searchHistory, searchHistoryDtl)은 List 반환 + `output="<그리드 키>"` 로 `grids.<키>.rows` 에 담는다. 그리드가 둘 이상인 action(searchBench, explain, impact)은 Map 반환 + `output="result"` 를 쓴다 | (1) 가이드 6-D-1, 6-D-2 | N |
| 3 | 초안 저장은 전체 교체다(Q-018, D36) | (2) | N |
| 4 | 쓰기는 `apply` 한 곳에서 한 트랜잭션이다 | (2) | N |
| 5 | 초안 변경은 USER_GRP, GRP_ROLE, ROLE_OBJ 3종이다 | (2) | N |
| 6 | 3단계는 새 API 없이 화면 링크다 | (2) | N |
| 7 | 버튼·팝업 라벨 없이 코드 그대로 보인다 | (2), D17 | N |
| 8 | 같은 OBJECT_ID 에 대한 화면 게이트 토큰은 11 action 이름이다(D7) | (2) | N |
| 9 | 영향 후보 사람은 적용 전 그래프와 적용 후 그래프의 합집합에서 구한다. 영향 수는 action 차이만 센다. SCREEN_CNT 는 메뉴 보임 차이를 따로 비교해 더한다 | (2) | N |
| 10 | 오류는 mcm 공통 `BusinessException` 의 `CODE: 상세` 문구로 돌려준다. mcm-core 는 oasis 에 의존하지 않는다 | (2) | N |

## §13. 확인필요와 Gap (Q-NNN)

기본값으로 진행한다. 열린 항목은 구현 레인이 조정자에게 확인한다.

| ID | 항목 | 내용 | 영향도 | 설계 반영 방식 | 후속 조치 | 상태 |
|---|---|---|---|---|---|---|
| Q-001 | screenId 부속서 미등재 | 부속서 A.3 에 `commPermBench` 가 없다. `commRoleMng` 등 형제 화면도 같다 | 낮음 | 설계서에 값을 적고 진행 | 조정자가 A.3 에 등재 | open |
| Q-002 | moduleGroup 부속서 미등재 (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-003 | To-Be 테이블/Entity 미확보 (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-004 | S-NNN 화면 표시명 폴백 미충족 (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-005 | G-NNN 화면 표시명 폴백 미충족 (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-006 | P-NNN To-Be 화면명 미확정 (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-007 | 이벤트 핸들러 미사용 (L3) (템플릿 예약 슬롯) | 해당 없음. 신규 화면이라 이 사례가 없다 | 낮음 | 없음 | 없음 | wontfix |
| Q-008 | impact 요약 숫자 | 시안 「영향 사람, 버튼 +n −n」, §0.3 summary 는 GAIN_USER_CNT, LOSE_USER_CNT, SCREEN_CNT | 중간 | summary 3칸만 표시. 합집합 사람 수와 버튼 합계는 표시하지 않는다(impacts 는 앞 500줄이라 합을 낼 수 없다) | 필요하면 perm-core 가 칸을 늘린다 | open |
| Q-009 | 「이 메뉴를 연 역할」 | 오브젝트 기준으로 모든 역할을 보는 API 가 §0.3 에 없다 | 중간 | 사람 기준은 사람이 받은 역할(G7 ROLES, G8)만, 역할 기준은 고른 역할만 보인다. 시안의 회색 「다른 역할」은 이번 회차에서 뺀다 | 필요하면 action 추가를 조정자에게 요청 | open |
| Q-010 | 읽기 프리셋과 새 action | D18 이름 규칙(`search*` 등)이 `explain`, `impact`, `loadDraft` 를 조회로 보지 않는다. 읽기 전용 역할이 1단계 핵심 `explain` 을 못 쓴다 | 높음 | perm-core 가 `explain` 을 readPreset 에 넣었다. `impact`, `loadDraft` 는 조회 전용에 주지 않는다(기능설계서 §8) | 없음 | resolved (perm-core 가 `explain` 을 readPreset 에 넣었다(조정자 답변)) |
| Q-011 | 사람 목록 페이지 | §0.3 searchBench 에 페이지 키가 없다. 위험 절은 「검색·페이지」 | 중간 | 서버가 USER_ID 순 200건으로 자른다. 넘으면 찾기로 좁히라는 안내를 보인다. 200 은 설계 기본값 | 필요하면 `pageNo` 추가 요청 | resolved (상한 200건, 페이지 칸 없음, 잘림 안내는 FE(조정자 답변)) |
| Q-012 | searchBench 의 roleGroupId, roleId | 의미가 §0.3 에 없다. 시안에도 없다 | 낮음 | 사람 목록을 그 그룹·역할을 받은 사람으로 좁힌다 | b1 이 확인 | open |
| Q-013 | 에러 전달 방식 | 가이드는 HTTP 4xx, 실제 OASIS 는 HTTP 200 + `meta.success=false` + `meta.message` (`commRoleMng/api.ts:80-90`) | 중간 | 실제 방식. 코드를 `meta.message` 앞에 `CODE: 상세` 로 둔다 | b1 이 확인 | open |
| Q-014 | 요청 body 모양 | 가이드 v2 는 plain DTO, 실제 코드는 `{meta, params, grids}` | 중간 | 실제 코드 방식(oasis-contract-check 6-E) | 가이드 정리는 별도 | resolved (D36: 목록 입력은 모두 grids) |
| Q-015 | 3단계 화면 이동 방식 | 화면 ID 와 선택 항목 ID 를 넘기는 기존 규칙을 조사한 뒤 따른다(f4) | 중간 | 설계서는 「전달 값 = 화면 ID, 선택 ID」까지만 정한다 | f4 가 조사 | open |
| Q-016 | SYSADMIN 퍼미션 변경 거절 코드 | §0.3 의 4코드에 없다 | 낮음 | PERM_FORBIDDEN 으로 대체(Q-029) | 없음 | resolved (Q-029 로 대체) |
| Q-017 | 이력 문자열 형식 | BEFORE_VAL, AFTER_VAL, APPLY_ID 형식이 §0.1 에 없다 | 낮음 | BPMN설계서 §4.5 에 b4 구현 기준으로 확정했다 | 없음 | resolved (b4 구현) |
| Q-018 | saveDraft 의미 | 전체 교체인가 증분인가 | 중간 | 전체 교체(멱등) | 없음 | resolved (D36: 전체 교체) |
| Q-019 | 초안 저장 빈도 | 클릭마다 저장하면 호출이 많다 | 낮음 | 300 ms 안에 모인 변경을 한 번에 saveDraft | f3 가 조정 | open |
| Q-020 | 새 메뉴 체크 때 처음 BTN 값 | 시안은 `search` 우선, 없으면 첫 값 | 낮음 | `OBJ_READ_PERM`, 비면 허용 값의 첫째 | 없음 | open |
| Q-021 | 진입 파라미터 | 옛 화면의 「작업대에서 열기」가 보내는 roleId, objectId 수신 방식 | 낮음 | 수신 키 `roleId`, `objectId` 로 첫 선택을 정한다 | f4, f7 이 확정 | open |
| Q-022 | 사용자 「사용 안 함」 사유 | DenyReason 에 USER_UNUSED 가 없다. 시안은 별도 이유를 보인다(`mock-v16.html:1444`) | 중간 | NO_ROLE 로 내려오는 것으로 보고 문구를 「받은 역할이 없거나 사용자가 사용 안 함」 으로 쓴다. 사람 칸은 USE_TP 뱃지를 따로 보인다 | perm-core 가 USER_UNUSED 추가 여부 결정 | resolved (NO_ROLE 로 내려온다(조정자 답변)) |
| Q-023 | 캐시 무효화 시점 | `RoleChangedEvent` 를 커밋 전에 발행하면 다른 요청이 옛 값을 다시 캐시에 올릴 수 있다 | 중간 | 커밋 뒤(`afterCommit`)에 발행한다 | b4 가 구현·시험 | resolved (AFTER_COMMIT 발행(조정자 답변)) |
| Q-024 | SORT_SEQ 출처 | `FULL_SEQ` 인가 `MENU_SEQ` 인가 | 낮음 | `FULL_SEQ` | b1 이 확인 | open |
| Q-025 | 계산 칼럼의 값 규칙과 길이 | VISIBLE, REASON, CODE, ROLES, GROUPS, MENU_PATH, GAINED, LOST 는 서버가 계산한다. 폴더 행 규칙과 칼럼 길이가 §0.3 에 없다 | 낮음 | 폴더는 아래 메뉴 중 하나라도 보이면 Y. REASON 은 메뉴 행에만 채운다. 길이는 기능설계서 §3.2 에 `[Q-025]` 로 둔다 | b1 이 확인 | open |
| Q-026 | 충돌 뒤 사용자 행동 | 새 API 없이 충돌 범위를 정리할 방법 | 중간 | P-003 에 「충돌 범위의 변경 빼기」(B-013)와 「초안 버리고 다시 읽기」(B-014)를 둔다 | f3 가 구현 | open |
| Q-027 | 의미색과 역할 칩 색 토큰 | 시안은 역할 칩 12색과 초안(보라)색을 쓴다. shared CSS 토큰에는 12색이 없고 초안색은 `--color-edited` 만 있다 | 낮음 | 얻음 `--color-success`, 잃음 `--color-danger`, 바뀜·초안 `--color-edited` 를 쓴다. 역할 칩 12색은 새 칩 부품(f1)의 CSS 안에서 정의한다. shared 토큰 파일은 고치지 않는다 | f1 이 정의 | open |
| Q-029 | 시스템 관리자 범위 변경의 주체 | SYSADMIN 역할이 걸린 변경(GRP_ROLE 의 역할 = SYSADMIN, USER_GRP 로 SYSADMIN 을 가진 그룹에 넣기, ROLE_OBJ 의 역할 = SYSADMIN)을 누가 할 수 있는지 §0.3 에 없다 | 중간 | SYSADMIN 이 걸린 변경(GRP_ROLE 의 역할이 SYSADMIN, USER_GRP 로 SYSADMIN 을 가진 그룹에 넣기, ROLE_OBJ 의 역할이 SYSADMIN)은 SYSADMIN 사용자만 한다. 아니면 PERM_FORBIDDEN. 옛 화면 l2, l4 는 이번 회차에 그대로 두고 다음 회차 후보로 둔다 | 조정자 승인으로 확정했다 | resolved (조정자 승인 S7 A) |
| Q-030 | 메뉴 열의 역할 이니셜 칩 | 시안 `mock-v16.html:1469-1477` 은 메뉴 이름 옆에 보이게 한 역할의 이니셜 칩을 둔다. 계약에 그 데이터가 없다 | 낮음 | 이번 회차에서 뺐다 | 다음 회차 후보 | open |
| Q-031 | 역할 기준 메뉴 트리의 REASON | 역할 기준 `searchMenuTree` 의 REASON 은 이번 회차에 NO_PERM 만 쓴다. 역할 한정 그래프 로더(`loadForRoles`)가 나오기 전에는 `loadAll` 을 쓴다 | 낮음 | 조정자 답변을 따른다 | perm-runtime | open |
| Q-032 | 같은 변경의 재시도 | USER_GRP, GRP_ROLE 의 ADD 가 이미 있거나 DEL 이 없으면 아무 일도 하지 않고 이력 줄도 남기지 않는다. ROLE_OBJ ADD 가 이미 있는 행이면 upsert(BTN, POPUP 갱신, DATA_PERM 유지)이고 토큰 집합이 같을 때만 no-op 이다 | 낮음 | 기본안 반영 | 없음 | resolved (조정자 승인) |
| Q-033 | 오브젝트 밖 옛 값 | 퍼미션을 편집하면 편집한 값은 오브젝트 허용 값의 부분집합이어야 한다. 오브젝트 밖에 남아 있던 옛 값은 그 퍼미션을 고칠 때 버려지고 안내를 보인다(기본안 A) | 낮음 | 기본안 반영 | 없음 | resolved (조정자 승인 S3 A) |
| Q-034 | 새 테이블 이름·길이 | 시안 `TB_MCM_SEC_PERM`(500자) 대 §0.1 `TB_MCM_SEC_ROLE_PERM`(1000자) | 중간 | §0.1 을 따른다 | 없음 | resolved |
| Q-035 | 빈 버튼 퍼미션 | 시안 「정할 것」 대 D14 | 중간 | 금지. 마지막 칩을 끄면 퍼미션을 뺀다 | 없음 | resolved |
| Q-036 | 오브젝트에서 값 빼기 | 시안과 D15 가 같다(남기고 계산에서 뺀다) | 낮음 | D15 | 없음 | resolved |
| Q-037 | 조회만 프리셋 | 시안 고정 값 대 D18 서버 규칙 | 낮음 | `OBJ_READ_PERM` 사용 | 없음 | resolved |
| Q-038 | 시안의 등록·수정 상자 | 시안 단계 3과 D21 이 링크로 정리 | 낮음 | 링크 | 없음 | resolved |
| Q-039 | 초안 변경 범위 | 시안은 이름·위치·사용 여부까지, §0.3 은 3종 | 중간 | 3종만 | 영향 표시가 부족하면 옛 화면 레인과 협의 | open |
| Q-040 | 설계 결정의 레퍼런스 등재 | 이 화면의 새 결정(D36, 범위 지문, PERM_FORBIDDEN 등)이 `docs/guide/reference/mcm-reference.md` 에 없다. 이 레인은 `docs/guide` 를 쓰지 못한다 | 낮음 | 설계서가 근거로 쓴다 | 조정자가 마감 때 등재 | open |
| Q-028 | saveDraft 입력 형식 (D36) | 정본 §0.3 은 `changes`(PermChange 목록)만 적었다. 조정자 결정 D36 은 입력을 `grids.changes.rows`(컬럼 TP, KEY1, KEY2, OP, BTN_PERM, POPUP_PERM)로, 응답을 `grids.draft` 로 정했다. 배열은 `params` 에 넣지 않는다(oasis 6-E-2) | 낮음 | 설계서에 D36 을 반영했다 | 없음 | resolved |

## §14. 커버리지 매트릭스

발견 수 = 반영 수 + 확인필요 수 + 제외 수. 한 항목은 한 열에만 센다.

| 원천 | 발견 수 | 반영 수 | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---|
| 조회조건 (S) | 12 | 7 (S-001, S-004-S-009) | 5 (S-002, S-003, S-010, S-011, S-012: 시안에 없고 §0.3 에서 옴, Q-012) | 0 | ○ |
| 응답 그리드 | 16 | 16 | 0 | 0 | ○ |
| 그리드 컬럼 (G{n}-NNN) | 79 | 71 | 8 (G6-009, G7-001, G7-005, G7-006, G7-007, G9-004, G12-005, G12-006: Q-025) | 0 | ○ |
| 상세 필드 (D) | 5 | 5 | 0 | 0 | ○ |
| 라인 필드 (L) | 0 | 0 | 0 | 0 | ○ (해당 없음) |
| 버튼 (B) | 23 | 23 | 0 | 0 | ○ |
| 그리드셀 (GB) | 8 | 8 | 0 | 0 | ○ |
| 팝업·연동 (P) | 8 | 3 (P-001-P-003) | 5 (P-004-P-008: 이동 방식 Q-015) | 0 | ○ |
| 상태값 (ST) | 4 | 4 | 0 | 0 | ○ |
| 코드값 (LV) | 8 | 8 | 0 | 0 | ○ |
| 검증 (V + XV) | 12 (9 + 3) | 12 | 0 | 0 | ○ |
| action | 11 | 11 | 0 | 0 | ○ |
| 시안 요소 | 7 | 0 | 0 | 7 (§3.4, §0.1) | ○ |

## §15. 분석완료 게이트

결과 값은 ○, ×, △ 만 쓴다.

| 게이트 | 결과 | 근거 | 후속 조치 |
|---|---|---|---|
| G1. 자료 인벤토리 | ○ | §2 자료 12건 확인, 운영 캡처와 원본 ERP 자료는 신규 화면이라 해당 없음으로 적었다 | 없음 |
| G2. 화면 요소 전수성 | ○ | §4.1 카운트와 §4.2-§4.6 행 수 일치 (S 12, G 79, D 5, B 23, GB 8, P 8) | 없음 |
| G3. 소스 로직 연결성 | ○ | §5.1 이벤트 12종, §5.2 SP 분기는 「해당 없음(사유)」 절로 두었다. 대체로 §5.0 트리거 ↔ action 11건 전수와 §3.2 현행 `UserPermCache` 추적, §5.3 D1-D3 | 없음 |
| G4. DB 매핑성 | ○ | §6.1 새 5개, §6.2 기존 10개(폴더 테이블 포함), §6.3 칼럼 길이와 §4.3 컬럼 연결 | 없음 |
| G5. 업무 규칙 반영성 | ○ | §10 규칙 22건 중 검증 규칙 12건이 V-001-V-009, XV-001-XV-003 로 변환 | 없음 |
| G6. API 패턴 판정 | ○ | §11 충족 0, OASIS 단일 BPMN | 없음 |
| G7. 커버리지 | ○ | §14 전 행 합 일치(발견 = 반영 + 확인필요 + 제외) | 없음 |
| G8. 사전 판정표 5종 | △ | §0.1-§0.5 를 만들었으나 As-Is 소스가 없어 시안 기준 대체 행이다. L1-L4 는 해당 없음 | 신규 화면 트랙 가이드가 생기면 다시 본다 |
| G9. 자유도 0 | △ | §1 화면 목적과 §3 서술에 자유 문장이 있다. §13 내용 칸은 `{원천}이 {조건}일 때 {조치}` 패턴이 아니다 | 가이드 정리 때 패턴으로 고친다 |

## §16. 설계서 반영 지시

| 설계서 | 인용 지점 |
|---|---|
| 기능설계서 §3 조회조건 | §4.2 (S-001-S-012) |
| 기능설계서 §3.2 그리드 | §4.3 (G1-G16, 79 컬럼) |
| 기능설계서 §4 상세 | §4.4 (D-001-D-005, L 해당 없음) |
| 기능설계서 §5 버튼 | §4.5 (B-001-B-023) + §4.5-1 (GB-001-GB-008) |
| 기능설계서 §6 검증 | §10 (V-001-V-009, XV-001-XV-003) |
| 기능설계서 §7 상태 | §9.1 (ST-001-ST-004) |
| 기능설계서 §9 팝업 | §4.6 (P-001-P-008) |
| 기능설계서 §10 LoV | §9.2 (LV-001-LV-008) |
| 기능설계서 §11 특이사항 | §13 (Q-001-Q-040) |
| 디자인설계서 §3 영역 | §4.1.1 |
| 디자인설계서 §4 컬럼 | 기능설계서 §3.2 인용 |
| BPMN설계서 §1.1 API | §5 (API-001-API-011), §11 |
| 정합체크서 | §14, §4.3 컬럼 표, §0.3 |

## §17. As-Is Procedure 분석

해당 없음. As-Is 프로시저가 없다. 현행 서버 계산은 §3.2 에 적었고, 새 계산은 `PermResolver` 계약(`decompose.md §0.2`)이 정본이다.

## §18. 인용 검증

- 시안 인용은 `mock-v16.html:줄` 형식이다. 정본 인용은 `decompose.md §절`, `D번호` 형식이다.
- 현행 코드 인용은 `파일:줄` 형식이다. 이 작업에서 읽은 줄만 적었다.
- 시안과 정본이 다른 곳은 §8 과 §13 에 모두 적었다.
