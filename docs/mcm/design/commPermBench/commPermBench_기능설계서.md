---
screenId: commPermBench
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mcm
moduleGroup: csa
작성일: 2026-11-27
작성자: Agent
---

# mcm 권한 작업대 기능설계서

> 이 문서의 모든 표는 `commPermBench_분석리포트.md` 를 그대로 인용한다. 분석리포트에 없는 행을 더하지 않는다. 컬럼 이름은 `docs/perm-bench/decompose.md §0.3` 와 글자 그대로 같다.

## §0. 환경 제약

분석리포트 §0 과 같다. R-13, R-14 는 적용 대상이 없어 N/A 이고, 시안 `docs/perm-bench/mock-v16.html` 이 As-Is 자료를 대신한다.

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| **화면명** | 권한 작업대 |
| **화면 식별자** | commPermBench |
| **모듈** | mcm (공통관리) / moduleGroup csa (시스템관리) |
| **화면 목적** | 권한 작업대는 사람, 역할 그룹, 역할, 메뉴의 연결을 한 화면에서 확인하고 초안으로 고친 뒤 영향을 보고 한 번에 적용한다. 등록과 수정은 원래 화면으로 연다. |
| **주요 사용자** | 시스템 관리자, 권한 운영 담당자 |
| **접근 경로** | 포털 → 공통관리 → 시스템관리 → 권한 작업대 |

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm | 01 A.1 |
| moduleGroup | csa | 01 A.2 |
| mesModule | m-mcm | 01 A.4.5 |
| 적용 명명 룰 | MES 단일 룰 | moduleId 가 mpn 이 아니다 |
| 화면식별자 (screenId) | commPermBench | 01 A.4.1 |
| pageName | commPermBench | MES: screenId 와 같다 |
| pageId | commPermBench | MES: screenId 와 같다 |
| serviceId | commPermBench | MES/APS 공통 |
| 페이지 유형 | D (다중 그리드) | 응답 그리드 16개, 칸 5개 (분석 §4.3) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commPermBench/{action}` | 04 A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commPermBench/{action}` | 04 A.2-3 |
| Frontend 파일명 | `commPermBench.tsx` (엔트리), 구현 `m-mcm/page-components/csa/commPermBench/{page.tsx, api.ts, types.ts}` | 01 A.4, 형제 화면 `commRoleMng` |
| tsup entry key | `pages/csa/commPermBench` | 01 A.4.6 |
| page-registry 키 | `csa/commPermBench` | 형제 화면 `lib/generated/page-registry.ts` |
| 요청 body | `{ meta, params, grids }` (Q-014) | `commRoleMng/api.ts` |
| 응답 | 그리드 하나인 action 은 `grids.<키>.rows`, 둘 이상인 action(searchBench, explain, impact)은 `data.result` 안의 키를 FE 가 펼친다. 실패는 HTTP 200 + `meta.success=false` (Q-013) | 같음 |

---

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| A-FILTER | 칸 머리 조회줄 | 찾기, 좁히기, 보기 전환 (S-001-S-012) |
| A-GRID | 선택 칸 묶음 | 사람, 역할 그룹, 역할 칸 (G1-G5). 역할 기준에서는 역할 칸 하나 |
| A-GRID-EXT | 메뉴 칸 | 모듈 › 폴더 › 메뉴 트리 (G6, G9) |
| A-DETAIL | 미리보기 칸 | 사람 화면 미리보기, 버튼·팝업 줄(G7, G8), 퍼미션 편집(D-001, D-002), 초안 영향(G10-G12) |
| A-BTN | 버튼 영역 | 위쪽 버튼줄과 초안 막대 |

---

## 3. 조회조건 정의 (영역: A-FILTER)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3 행 == 분석 §4.2 행 (12) | ✓ |
| 화면 표시명 일치 | 분석 §4.2 와 글자 단위 동일 | ✓ |
| 입력 방식 enum | TextBox, ComboBox, CheckBox, DatePicker, Lookup | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | USER_NM, USER_ID, DEPT_NM | 사람 찾기 | TextBox | N | (빈 값) | 화면 안에서 거른다. 서버(searchBench)는 사람을 USER_ID 순으로 최대 200명 주고, 찾기는 받은 사람 안에서 이름·부서·ID 에 든 글자로 거른다(대소문자 무시, 부분 일치). 화면은 요청 키 `userQ` 를 보내지 않는다(서버는 받을 수 있다). 200명을 받으면 「앞 200명만 보입니다. 찾기로 좁히세요」 |
| S-002 | ROLE_GROUP_ID | 역할 그룹으로 좁히기 | (화면에 없음) | N | (전체) | 서버 계약만 있다: searchBench 가 요청 키 `roleGroupId` 를 받아 사람을 그 그룹 소속으로 좁힌다. 화면은 이 칸을 두지 않고 searchBench({}) 만 부른다. 좁히기는 각 칸 찾기(S-001·S-004·S-013)로 대신한다 |
| S-003 | ROLE_ID | 역할로 좁히기 | (화면에 없음) | N | (전체) | 서버 계약만 있다: searchBench 가 요청 키 `roleId` 를 받아 그 역할을 받은 사람으로 좁힌다. 화면은 이 칸을 두지 않고 searchBench({}) 만 부른다. 좁히기는 각 칸 찾기(S-001·S-004·S-013)로 대신한다 |
| S-004 | ROLE_NM, ROLE_ID | 역할 찾기 | TextBox | N | (빈 값) | 화면 안에서 거른다(대소문자 무시, 부분 일치). 역할 칸에 두 기준 모두 있다. 고른 역할은 걸러져도 목록에 남고 정렬된 자기 자리에 있다(맨 위로 올리지 않는다). 찾는 중이면 「N개 찾음」, 없으면 「찾는 역할이 없습니다」 |
| S-005 | MENU_NM, OBJECT_ID | 메뉴 찾기 | TextBox | N | (빈 값) | 화면 안에서 거른다. 값이 있으면 모든 폴더를 펼친다 |
| S-006 | - | 메뉴 보기 | ComboBox | N | 등록된 것 | 「등록된 것」 또는 「모두」. 화면 안에서 거른다 |
| S-007 | - | 보기 기준 | ComboBox | Y | 사람 기준 | 「사람 기준」 또는 「역할 기준」. 칸 구성이 바뀐다(디자인 §2.2) |
| S-008 | - | 권한 기준 | ComboBox | Y | 초안 | 「현재」 또는 「초안」. 요청 키 `source` (CUR, DRAFT). 초안이 없으면 「현재」로 보인다 |
| S-009 | MENU_ID | 메뉴 폴더 | ComboBox | N | (없음) | 요청 키 `menuFolderId`. 폴더 행을 고르면 정해지고, 퍼미션 편집 목록을 그 폴더로 좁힌다. 메뉴 칸의 등록 상태와 개수는 폴더 없이 `searchRolePerm` 을 불러 얻는다 |
| S-010 | APPLY_AT | 이력 시작일 | DatePicker | N | 30일 전 | 요청 키 `fromDt`. P-002 안에 있다 |
| S-011 | APPLY_AT | 이력 종료일 | DatePicker | N | 오늘 | 요청 키 `toDt`. P-002 안에 있다 |
| S-012 | APPLY_USER_ID | 적용자 | TextBox | N | (빈 값) | 요청 키 `applyUserId`. P-002 안에 있다 |
| S-013 | ROLE_GROUP_NM, ROLE_GROUP_ID | 그룹 찾기 | TextBox | N | (빈 값) | 역할 그룹 칸 머리. 화면 안에서 거른다(대소문자 무시, 부분 일치). 고른 그룹은 걸러져도 목록에 남고 정렬된 자기 자리에 있다(맨 위로 올리지 않는다). 찾는 중이면 「N개 찾음」, 없으면 「찾는 그룹이 없습니다」 |
| S-014 | (칸마다 ID, 이름) | 칸 정렬 | Button | N | ID 오름 | 사람·역할 그룹·역할 칸 머리의 정렬 단추(shared `SortToggle`). 기준 단추는 ID ↔ 이름, 방향 단추는 오름 ↔ 내림. 칸마다 따로, 칸 안 상태다(다른 칸을 다시 그리지 않는다). ID 는 글자 코드 순(서버 ORDER BY 와 같다), 이름은 한국어 순이고 같으면 ID 순. 화면을 다시 열면 ID 오름으로 돌아간다 |

### 3.2 조회 결과 (그리드 컬럼)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 그리드 수 | 본 §3.2 == 분석 §4.3 (16) | ✓ |
| 컬럼 수 | 본 §3.2 합 == 분석 §4.3 (79) | ✓ |
| DB 컬럼명 | §0.3 컬럼 이름과 글자 단위 동일 | ✓ |
| 표시 형식 enum | `자료형(길이)` | ✓ |

요청 `grids.changes.rows` 의 컬럼은 SNAKE_CASE(TP, KEY1, KEY2, OP, BTN_PERM, POPUP_PERM)이고 응답 `CHANGES_JSON` 의 원소는 camelCase(tp, key1, key2, op, btnPerm, popupPerm)다. FE 타입 파일은 두 모양을 모두 다뤄야 한다(types.ts 주의).

표시 전용 보조 줄(예: 「그룹 3개」)은 서버 컬럼이 아니라 같은 그리드의 건수에서 만든다. 해당 행의 설명에 적었다.

**G1 사람 (users, 사람 칸)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G1-001 | USER_ID | 사용자 ID | 행 선택 시 `userId` 로 쓴다. 이름 아래 작은 글씨 | Left | varchar(30) |
| G1-002 | USER_NM | 이름 | 사람 칸의 첫 줄. 보조 줄 = 부서 · 그룹 N개 (G4 건수) | Left | varchar(30) |
| G1-003 | DEPT_NM | 부서 | 보조 줄에 보인다 | Left | varchar(100) |
| G1-004 | USE_TP | 사용 여부 | N 이면 「사용 안 함」 뱃지 | Center | varchar(1) |

**G2 역할 그룹 (groups, 역할 그룹 칸)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G2-001 | ROLE_GROUP_ID | 역할 그룹 ID | 체크 키. 표시는 이름 아래 작은 글씨 | Left | varchar(30) |
| G2-002 | ROLE_GROUP_NM | 역할 그룹 | 첫 줄. 보조 줄 = 역할 N개 (G5 건수) · 사람 N명 | Left | varchar(100) |
| G2-003 | USE_TP | 사용 여부 | N 이면 「사용 안 함」 뱃지 | Center | varchar(1) |
| G2-004 | USER_CNT | 사람 수 | 보조 줄에 보인다 | Right | int(10) |

**G3 역할 (roles, 역할 칸)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G3-001 | ROLE_ID | 역할 ID | 행 선택 시 `roleId` 로 쓴다 | Left | varchar(30) |
| G3-002 | ROLE_NM | 역할 | 역할별 색 칩으로 보인다 | Left | varchar(100) |
| G3-003 | MENU_ID | 메뉴 폴더 | 표시하지 않는다. 처음 펼칠 폴더(S-009 기본값) | Left | varchar(30) |
| G3-004 | USE_TP | 사용 여부 | N 이면 「사용 안 함」 뱃지 | Center | varchar(1) |
| G3-005 | GROUP_CNT | 그룹 수 | 역할 기준 칸의 보조 줄 | Right | int(10) |
| G3-006 | USER_CNT | 사람 수 | 보조 줄 | Right | int(10) |
| G3-007 | PERM_CNT | 메뉴 수 | 보조 줄 「메뉴 N개」 | Right | int(10) |

**G4 사람 ↔ 그룹 (userGroups, 표시 안 함)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G4-001 | USER_ID | 사용자 ID | 체크 상태 계산용 | Left | varchar(30) |
| G4-002 | ROLE_GROUP_ID | 역할 그룹 ID | 체크 상태 계산용. 초안 변경(USER_GRP)을 겹쳐 그린다 | Left | varchar(30) |

**G5 그룹 ↔ 역할 (groupRoles, 표시 안 함)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G5-001 | ROLE_GROUP_ID | 역할 그룹 ID | 체크 상태 계산용 | Left | varchar(30) |
| G5-002 | ROLE_ID | 역할 ID | 체크 상태 계산용. 초안 변경(GRP_ROLE)을 겹쳐 그린다 | Left | varchar(30) |

**G6 메뉴 트리 (menus, 메뉴 칸과 미리보기 메뉴)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G6-001 | MENU_ID | 메뉴 ID | 트리 키. 표시하지 않는다 | Left | varchar(30) |
| G6-002 | PARENT_MENU_ID | 상위 폴더 ID | 트리 부모 키. 표시하지 않는다 | Left | varchar(30) |
| G6-003 | MENU_NM | 메뉴 · 화면 | 트리 이름. 역할 기준 호출은 메뉴 칸에, 사람 기준 호출은 미리보기 앱 창에 쓴다 | Left | varchar(300) |
| G6-004 | OBJECT_ID | 오브젝트 ID | 메뉴 행에서 이름 옆 작은 글씨. 폴더는 비어 있다. `explain` 의 `objectId` 로 쓴다 | Left | varchar(50) |
| G6-005 | SORT_SEQ | 정렬 순서 | 트리 정렬. 표시하지 않는다 | Left | varchar(30) |
| G6-006 | SHOW_TP | 표시 여부 | N 이면 「숨김」 뱃지. 숨김 폴더라도 보이는 화면의 상위 폴더면 행으로 나온다(런타임 `getMyMenus` 의 hiddenYn 규칙) | Center | varchar(1) |
| G6-007 | USE_TP | 사용 여부 | N 이면 「사용 안 함」 뱃지 | Center | varchar(1) |
| G6-008 | VISIBLE | 보임 | 미리보기 메뉴 트리에 넣을지 정한다(Y 만 보인다) | Center | varchar(1) |
| G6-009 | REASON | 이유 | 보이지 않는 이유. 마우스를 올리면 문구가 나온다(§10 LV-004) | Left | [Q-025] |
| G6-010 | OBJ_USE_TP | 오브젝트 사용 여부 | 연결 오브젝트의 사용 여부. N 이면 역할 기준 트리의 메뉴 행에 「오브젝트 사용 안 함」 뱃지를 보인다. 폴더와 OBJECT_ID 가 없는 행은 비어 있다 | Center | varchar(1) |

**G7 버튼·팝업 판정 (buttons, 미리보기 버튼·팝업 줄)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G7-001 | CODE | 코드 | 버튼·팝업 칩 이름. 라벨 없이 코드 그대로(D17) | Left | [Q-025] |
| G7-002 | KIND | 종류 | BTN 은 버튼 줄, POPUP 은 팝업 줄에 놓는다 | Center | varchar(5) |
| G7-003 | ALLOWED | 허용 | N 이면 「오브젝트에 없음」 표식(아무도 못 쓴다) | Center | varchar(1) |
| G7-004 | GRANTED | 켜짐 | Y 면 켜진 칩, N 이면 잠긴 칩(점선, 자물쇠) | Center | varchar(1) |
| G7-005 | REASON | 이유 | 마우스를 올리면 나오는 문구(LV-004) | Left | [Q-025] |
| G7-006 | ROLES | 켠 역할 | 칩 아래 색 칩. 쉼표 목록을 풀어 최대 3개, 나머지 +N | Left | [Q-025] |
| G7-007 | GROUPS | 켠 그룹 | 켠 길의 그룹. 툴팁에 쓴다 | Left | [Q-025] |

**G8 켠 길 (paths)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G8-001 | ROLE_GROUP_ID | 역할 그룹 | 「이 그룹으로 받음」 줄 | Left | varchar(30) |
| G8-002 | ROLE_ID | 역할 | 「고르기」 칩(GB-003) | Left | varchar(30) |
| G8-003 | BTN_PERM | 버튼 권한 | 그 역할의 값. 코드 쉼표 목록 | Left | varchar(1000) |
| G8-004 | POPUP_PERM | 팝업 권한 | 그 역할의 값. 코드 쉼표 목록 | Left | varchar(1000) |

**G9 역할의 퍼미션 (perms, 퍼미션 편집과 메뉴 칸 버튼 수)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G9-001 | ROLE_ID | 역할 ID | PK 표시 | Left | varchar(30) |
| G9-002 | OBJECT_ID | 오브젝트 ID | PK 표시 | Left | varchar(50) |
| G9-003 | OBJECT_NM | 오브젝트명 | 퍼미션 편집 제목 | Left | varchar(100) |
| G9-004 | MENU_PATH | 메뉴 경로 | 모듈 › 폴더 › 메뉴 | Left | [Q-025] |
| G9-005 | OBJ_BTN_PERM | 허용 버튼 | D-001 칩 목록의 전체 | Left | varchar(1000) |
| G9-006 | OBJ_POPUP_PERM | 허용 팝업 | D-002 칩 목록의 전체 | Left | varchar(1000) |
| G9-007 | OBJ_READ_PERM | 조회만 값 | B-005 의 값. 서버가 계산한다(D18) | Left | varchar(1000) |
| G9-008 | BTN_PERM | 준 버튼 | D-001 의 켜진 칩 | Left | varchar(1000) |
| G9-009 | POPUP_PERM | 준 팝업 | D-002 의 켜진 칩 | Left | varchar(1000) |
| G9-010 | DATA_PERM | 데이터 권한 | 표시하지 않는다. 변경 때 그대로 둔다 | Left | varchar(1000) |

- 메뉴 칸의 「버튼 n/m」 = G9-008 의 코드 수 / G9-005 의 코드 수. 행이 없으면 「-」.

**G10 초안 (draft)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G10-001 | CHANGES_JSON | 변경 목록 | PermChange 배열(JSON). 변경 목록 줄을 만든다 | Left | clob |
| G10-002 | CHANGE_CNT | 바꾼 것 | 초안 막대 「바꾼 것 N건」 | Right | int(10) |
| G10-003 | U_AT | 마지막 저장 | 막대 보조 문구 | Center | datetime(YYYY-MM-DD HH:mm:ss) |

**G11 영향 요약 (summary)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G11-001 | GAIN_USER_CNT | 얻는 사람 | 버튼을 하나라도 얻는 사람 수 | Right | int(10) |
| G11-002 | LOSE_USER_CNT | 잃는 사람 | 버튼을 하나라도 잃는 사람 수 | Right | int(10) |
| G11-003 | SCREEN_CNT | 영향 화면 | 영향받는 화면 수 | Right | int(10) |

**G12 영향 사람 (impacts, 앞 500줄)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G12-001 | USER_ID | 사용자 ID | 사람별로 묶는 키 | Left | varchar(30) |
| G12-002 | USER_NM | 사람 | 이름 링크(GB-002) | Left | varchar(30) |
| G12-003 | OBJECT_ID | 화면 ID | 줄 키 | Left | varchar(50) |
| G12-004 | OBJECT_NM | 화면 | 얻음·잃음 칸에 화면 이름으로 보인다 | Left | varchar(100) |
| G12-005 | GAINED | 얻음 | 코드 쉼표 목록. 초록 「+코드」 | Left | [Q-025] |
| G12-006 | LOST | 잃음 | 코드 쉼표 목록. 빨강 「-코드」 | Left | [Q-025] |

**G13 적용 이력 (his, P-002 위 표)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G13-001 | APPLY_ID | 적용 ID | 행 선택 시 `applyId` 로 쓴다 | Left | varchar(40) |
| G13-002 | APPLY_USER_ID | 적용자 | 누가 | Left | varchar(100) |
| G13-003 | APPLY_AT | 적용 시각 | 언제 | Center | datetime(YYYY-MM-DD HH:mm:ss) |
| G13-004 | CHANGE_CNT | 변경 | 무엇을(건수) | Right | int(10) |
| G13-005 | GAIN_USER_CNT | 얻은 사람 | 몇 명이 얻었나 | Right | int(10) |
| G13-006 | LOSE_USER_CNT | 잃은 사람 | 몇 명이 잃었나 | Right | int(10) |
| G13-007 | APPLY_MEMO | 메모 | 적용 때 적은 글 | Left | varchar(1000) |

**G14 적용 이력 줄 (dtl, P-002 아래 표)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G14-001 | SEQ_NO | 번호 | 줄 순서 | Right | int(10) |
| G14-002 | TARGET_TP | 대상 | LV-005 라벨로 보인다 | Center | varchar(10) |
| G14-003 | KEY1 | 키 1 | 사람, 그룹, 역할 ID | Left | varchar(100) |
| G14-004 | KEY2 | 키 2 | 그룹, 역할, 오브젝트 ID | Left | varchar(100) |
| G14-005 | OP_TP | 작업 | LV-006 라벨로 보인다 | Center | varchar(3) |
| G14-006 | BEFORE_VAL | 이전 값 | 쓰기 전 값 | Left | varchar(2000) |
| G14-007 | AFTER_VAL | 이후 값 | 쓴 뒤 값 | Left | varchar(2000) |

**G15 적용 결과 (result, 알림)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G15-001 | APPLY_ID | 적용 ID | 완료 알림에 적는다 | Left | varchar(40) |
| G15-002 | CHANGE_CNT | 변경 | 「N건을 적용했습니다」 | Right | int(10) |

**G16 현재 사용자 (me, 표시 안 함)**

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G16-001 | ME_SYSADMIN | 시스템 관리자 여부 | 한 행. N 이면 SYSADMIN 이 걸린 변경(V-009)의 체크와 칩을 미리 잠근다 | Center | varchar(1) |

**확장/서브 그리드**: 해당 없음. 그리드 16개를 G1-G16 로 같은 위상으로 나눴다(01 A.4.8 G1-NNN 규칙).

### 3.3 코드값 표시 변환

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| USE_TP | LV-001 (화면 고정값) | N → 「사용 안 함」 뱃지 |
| SHOW_TP | LV-007 | N → 「숨김」 뱃지 |
| KIND | LV-003 | BTN → 버튼 줄, POPUP → 팝업 줄 |
| REASON | LV-004 | NO_PERM → 「받은 역할의 퍼미션에 없습니다」 (문구 전체는 §10) |
| TARGET_TP | LV-005 | USER_GRP → 「사람 ↔ 그룹」 |
| OP_TP | LV-006 | ADD → 「추가」 |

---

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | BTN_PERM | 버튼 권한 | 칩 묶음(켜고 끄기) | N | G9-008 | 칩 목록은 G9-005. 켜면 값을 더하고, 끄면 뺀다. 마지막 칩을 끄면 퍼미션을 뺀다(D14). 시스템 관리자 역할이면 모두 잠긴다 |
| D-002 | POPUP_PERM | 팝업 권한 | 칩 묶음(켜고 끄기) | N | G9-009 | 칩 목록은 G9-006. 버튼 칩이 하나도 켜져 있지 않으면 잠긴다 |
| D-003 | DATA_PERM | 데이터 권한 | (표시 안 함) | N | G9-010 | 편집 UI 가 없다. ROLE_OBJ 변경에 실리지 않고 서버가 기존 값을 그대로 둔다(D21) |
| D-004 | APPLY_MEMO | 적용 메모 | TextBox | N | (빈 값) | 요청 키 `memo`. 1,000자 이하. P-001 안 |
| D-005 | - | 잃는 사람 확인 | CheckBox | N | 해제 | 요청 키 `confirmLoss` (Y/N). 잃는 사람이 1명 이상일 때만 보인다. P-001 안. apply 가 `PERM_NEED_CONFIRM: n` 을 돌려주면(그 사이 잃는 사람이 생긴 경우) 이 칸을 n 으로 보이고 `impact` 를 다시 읽는다 |

### 4.2 라인 필드 (서브 그리드)

해당 없음.

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

To-Be action 은 7 enum(search, save, delete, changeStatus, popup, link, export)이다. 서버를 부르지 않는 화면 안 조작(B-008-B-010)은 `-` 로 적는다. 단계는 설명 앞에 적는다.

| 버튼ID | 버튼명 | 위치 | To-Be action | 게이트 토큰 (D7) | 설명 |
|---|---|---|---|---|---|
| B-001 | 초안 적용 | A-BTN (PageLayout.buttons) | save | impact, apply | [2단계] 영향을 계산해 P-001 을 연다. 초안이 없으면 꺼진다 |
| B-002 | 초안 버리기 | A-BTN (PageLayout.buttons) | delete | discardDraft | [2단계] 확인 창 뒤 초안을 지운다. 초안이 없으면 꺼진다 |
| B-003 | 적용 이력 | A-BTN (PageLayout.buttons) | popup | searchHistory | [2단계] P-002 를 연다 |
| B-004 | 모두 | A-DETAIL 퍼미션 편집 | save | saveDraft | [2단계] 이 역할 × 오브젝트의 BTN 을 허용 버튼 전부로 한다(팝업 값은 그대로) |
| B-005 | 조회만 | A-DETAIL 퍼미션 편집 | save | saveDraft | [2단계] BTN 을 `OBJ_READ_PERM` 으로 한다(D18) |
| B-006 | 없음 | A-DETAIL 퍼미션 편집 | save | saveDraft | [2단계] 퍼미션 행을 뺀다(D14) |
| B-007 | 현재 값으로 | A-DETAIL 퍼미션 편집 | save | saveDraft | [2단계] 이 역할 × 오브젝트의 초안 변경을 지워 현재 값으로 돌린다 |
| B-008 | 모두 펼치기 | A-GRID-EXT 머리 | - | - | [1단계] 모든 모듈·폴더를 펼친다 |
| B-009 | 모두 접기 | A-GRID-EXT 머리 | - | - | [1단계] 모든 모듈·폴더를 접는다 |
| B-010 | 모든 칸 폭 처음대로 | A-BTN (칸 폭 안내줄) | - | - | [1단계] 저장한 칸 폭을 지우고 처음 폭으로 되돌린다 |
| B-011 | 적용 실행 | P-001 안 | save | apply | [2단계] `apply` 를 부른다 |
| B-012 | 이력 조회 | P-002 안 | search | searchHistory | [2단계] S-010-S-012 로 이력을 다시 읽는다 |
| B-013 | 충돌 범위의 변경 빼기 | P-003 안 | save | saveDraft | [2단계] 충돌한 범위의 변경을 초안에서 지우고 다시 저장한다 |
| B-014 | 초안 버리고 다시 읽기 | P-003 안 | delete | discardDraft, searchBench | [2단계] 초안을 지우고 현재 값을 다시 읽는다 |
| B-015 | 사용자 추가 (↗) | A-GRID 사람 칸 머리 | link | 대상 화면의 토큰 | [3단계] commUserMng 를 새 행 상태로 연다 |
| B-016 | 사용자 편집 (↗) | A-GRID 사람 칸 머리 | link | 대상 화면의 토큰 | [3단계] 고른 사람을 연 채로 commUserMng 를 연다 |
| B-017 | 역할 그룹 추가 (↗) | A-GRID 그룹 칸 머리 | link | 대상 화면의 토큰 | [3단계] commRoleGrpMng 를 새 행 상태로 연다 |
| B-018 | 역할 그룹 편집 (↗) | A-GRID 그룹 칸 머리 | link | 대상 화면의 토큰 | [3단계] 고른 그룹을 연 채로 연다. 고른 그룹이 없으면 꺼진다 |
| B-019 | 역할 추가 (↗) | A-GRID 역할 칸 머리 | link | 대상 화면의 토큰 | [3단계] commRoleMng 를 새 행 상태로 연다 |
| B-020 | 역할 편집 (↗) | A-GRID 역할 칸 머리 | link | 대상 화면의 토큰 | [3단계] 고른 역할을 연 채로 연다. 고른 역할이 없으면 꺼진다 |
| B-021 | 메뉴 수정 (↗) | A-GRID-EXT 머리 | link | 대상 화면의 토큰 | [3단계] 고른 메뉴를 연 채로 commMenuMng 를 연다 |
| B-022 | 오브젝트 추가 (↗) | A-GRID-EXT 머리 | link | 대상 화면의 토큰 | [3단계] commObjMng 를 새 행 상태로 연다 |
| B-023 | 오브젝트 수정 (↗) | A-GRID-EXT 머리 | link | 대상 화면의 토큰 | [3단계] 고른 오브젝트를 연 채로 commObjMng 를 연다 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

| 버튼ID | 버튼명 | 소속 그리드 | 셀 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | 변경 하나 되돌리기 (×) | 변경 목록 (G10-001 줄) | 줄 오른쪽 | saveDraft | [2단계] 그 변경만 빼고 다시 저장한다 |
| GB-002 | 사람 이름 링크 | G12 (G12-002) | 이름 셀 | 선택 변경 | [2단계] 그 사람을 사람 칸에서 고른다. 사람 기준으로 바뀐다 |
| GB-003 | 역할 칩 | G7 (G7-006), G8 (G8-002) | 칩 | 선택 변경 | [1단계] 그 역할을 역할 칸에서 고른다. 그 사람이 받은 역할만 칩이 눌린다 |
| GB-004 | 폴더 연필 (↗) | G6 (G6-003) | 폴더 행 이름 옆 | link | [3단계] 그 폴더를 연 채로 commMenuMng 를 연다 |
| GB-005 | 사람 ↔ 그룹 체크 | G2 (G2-001) | 체크 열 | saveDraft | [2단계] USER_GRP ADD/DEL 을 초안에 담는다. 체크한 그룹만 눌러 고를 수 있다 |
| GB-006 | 그룹 ↔ 역할 체크 | G3 (G3-001) | 체크 열 | saveDraft | [2단계] GRP_ROLE ADD/DEL 을 담는다. 체크한 역할만 눌러 고를 수 있다 |
| GB-007 | 역할 ↔ 메뉴 체크 | G6 (G6-004) | 메뉴 행 체크 | saveDraft | [2단계] ROLE_OBJ ADD(처음 값 = Q-020)/DEL 을 담는다. 시스템 관리자 역할이면 잠긴다 |
| GB-008 | 모듈·폴더 일괄 체크 | G6 (G6-003) | 모듈·폴더 행 체크 | saveDraft | [2단계] 아래 모든 메뉴의 ROLE_OBJ ADD/DEL 을 한 번에 담는다. 일부만 등록이면 중간 상태로 보인다 |

- 그리드셀 인라인의 게이트 토큰: GB-001, GB-005-GB-008 은 saveDraft, GB-002, GB-003 은 없음(선택 변경 뒤 조회 action 의 토큰), GB-004 는 대상 화면의 토큰이다.

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작 (단계별) | 호출 액션 |
|---|---|---|---|---|
| (진입) | 화면 열림 | 없음 | 1. loadDraft 2. searchBench 3. 첫 사람과 첫 역할을 골라 searchMenuTree(역할 기준과 사람 기준), explain, searchRolePerm(폴더 없이) 을 부른다. 초안이 있으면 각각 source=CUR 과 source=DRAFT 를 모두 불러 비교 표시(새로, 사라짐, 얻음, 잃음)를 그린다 (S-008 기본 「초안」) | loadDraft, searchBench, searchMenuTree, explain |
| B-001 | 클릭 | ST-002 (초안 있음), `apply` 토큰 | 1. impact 호출 2. P-001 열기(요약, 메모, 잃는 사람 확인) | impact |
| B-002 | 클릭 | ST-002 | 1. 확인 창 2. discardDraft 3. 현재 값 다시 읽기 | discardDraft |
| B-003 | 클릭 | `searchHistory` 토큰 | 1. P-002 열기 2. searchHistory | searchHistory |
| B-004-B-007 | 클릭 | 역할이 시스템 관리자 아님, 오브젝트 선택됨 | 1. 변경 계산 2. 300 ms 모아 saveDraft 3. 초안 기준으로 다시 읽기 | saveDraft |
| B-008-B-010 | 클릭 | 없음 | 화면 상태만 바꾼다 | 없음 |
| B-011 | 클릭 | P-001 열림. LOSE_USER_CNT ≥ 1 이면 D-005 체크 | 1. apply(`confirmLoss`, `memo`) 2. 성공이면 알림, 초안 막대 비움, 현재 값 다시 읽기 3. PERM_CONFLICT 이면 P-003 4. PERM_NEED_CONFIRM 이면 D-005 를 보이고 강조한 뒤 impact 를 다시 읽는다 | apply |
| B-012 | 클릭 | S-010 ≤ S-011 | searchHistory | searchHistory |
| B-013 | 클릭 | P-003 열림 | 충돌 범위 키를 가진 변경을 지우고 saveDraft | saveDraft |
| B-014 | 클릭 | P-003 열림 | discardDraft 후 searchBench | discardDraft, searchBench |
| B-015-B-023, GB-004 | 클릭 | 단계 3, `link` 대상 화면 열람 권한 | 대상 화면 ID 와 고른 항목 ID 를 넘겨 연다(Q-015). 돌아오면 searchBench 와 현재 보기를 다시 읽는다 | 없음 |
| GB-001 | 클릭 | ST-002 | 변경 줄 하나를 빼고 saveDraft | saveDraft |
| GB-005-GB-008 | 체크 변경 | 아래 §7.3 | 변경 계산 후 saveDraft | saveDraft |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 사람 행 클릭 (G1) | 그 사람을 고른다. 고른 사람이 받은 그룹이 G2 에서 체크 상태로 보인다. 역할 기준이면 사람 기준으로 돌아온다 |
| 역할 그룹 이름 클릭 (G2) | 체크한 그룹만 고를 수 있다. 고르면 G3 가 그 그룹의 역할을 체크로 보인다 |
| 역할 이름 클릭 (G3) | 체크한 역할만 고를 수 있다(역할 기준에서는 모든 역할). 고르면 메뉴 칸이 그 역할의 메뉴를 보인다 |
| 메뉴 행 클릭 (G6) | 그 오브젝트를 고른다. 미리보기와 퍼미션 편집이 그 오브젝트로 바뀐다 |
| 모듈·폴더 행 클릭 | 펼치고 접는다. 폴더를 고르면 S-009 가 정해진다 |
| 이력 행 클릭 (G13) | 그 적용 ID 로 G14 를 읽는다 |
| 헤더 클릭 | 해당 없음. 정렬은 서버 순서를 따른다 |
| 페이지 변경 | 해당 없음. G1 은 200건 상한(Q-011), G6 은 트리 접기·펼치기로 다룬다 |
| 칸 폭 조절 | 경계를 끌거나 ← → 키(20 px, Shift 80 px)로 바꾼다. 두 번 누르면 처음 폭. 폭은 브라우저에 저장한다 |
| 체크 가능 셀 | G2, G3, G6 의 체크 열(GB-005-GB-008). 나머지 셀은 읽기 전용이다 |

---

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | BTN_PERM (D-001) | ROLE_OBJ ADD, UPD 의 BTN 이 비어 있지 않다. 비면 PERM_EMPTY_BTN (saveDraft 가 먼저, apply 가 다시 검사) | 버튼을 하나 이상 켜야 합니다. 모두 끄려면 퍼미션을 빼세요. |
| V-002 | BTN_PERM (D-001), POPUP_PERM (D-002) | 값이 오브젝트 허용 값의 부분집합이다. 아니면 PERM_NOT_IN_OBJ (saveDraft 가 먼저, apply 가 다시 검사). 퍼미션을 고치면 오브젝트 밖의 옛 값은 버려지고 안내를 보인다 | 오브젝트가 허용하지 않는 값이 있습니다: {값} |
| V-003 | BTN_PERM (D-001) | 시스템 관리자 역할(`SYSADMIN`)은 퍼미션 행이 없어 ROLE_OBJ 의 BTN, POPUP 값을 편집하는 변경은 받지 않는다 (saveDraft, apply) | 시스템 관리자 역할의 퍼미션은 바꿀 수 없습니다. |
| V-004 | CHANGES_JSON (G10-001) | 요청 `grids.changes.rows` 의 TP 는 USER_GRP, GRP_ROLE, ROLE_OBJ 중 하나, OP 는 ADD, DEL, UPD 중 하나, KEY1 과 KEY2 는 비어 있지 않다 (saveDraft, D36) | 초안 변경 값이 올바르지 않습니다. |
| V-005 | CHANGE_CNT (G10-002) | apply 때 초안 변경이 1건 이상이다 | 적용할 초안이 없습니다. |
| V-006 | APPLY_MEMO (D-004) | 1,000자 이하 | 메모는 1,000자 이하로 입력하세요. |
| V-007 | APPLY_AT (S-010, S-011) | 시작일 ≤ 종료일 (FE) | 시작일이 종료일보다 늦습니다. |
| V-008 | CHANGES_JSON (G10-001) | 같은 (TP, KEY1, KEY2) 가 두 번 없다. 있으면 PERM_BAD_VALUE (saveDraft) | 같은 변경이 두 번 들어 있습니다. |
| V-009 | CHANGES_JSON (G10-001) | SYSADMIN 이 걸린 변경(GRP_ROLE 의 역할, ROLE_OBJ 의 역할이 SYSADMIN, USER_GRP 로 SYSADMIN 을 가진 그룹에 넣기)은 SYSADMIN 사용자만 한다. 아니면 PERM_FORBIDDEN (saveDraft, apply. Q-029) | 시스템 관리자 권한이 걸린 변경은 시스템 관리자만 할 수 있습니다. |

### 6.2 연관 검증

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | LOSE_USER_CNT ≥ 1 이고 confirmLoss ≠ Y 이면 PERM_NEED_CONFIRM | 버튼을 잃는 사람이 {n}명 있습니다. 확인한 뒤 적용하세요. |
| XV-002 | 초안이 처음 건드린 범위(사람, 그룹, 역할)의 지금 지문 ≠ 저장한 지문이면 PERM_CONFLICT | 다른 변경과 겹쳤습니다: {범위 목록}. 초안을 정리한 뒤 다시 적용하세요. |
| XV-003 | 변경 대상(사람, 그룹, 역할, 오브젝트)이 DB 에 없다. USER_GRP, GRP_ROLE 의 이미 있는 ADD 나 없는 DEL 은 오류가 아니라 아무 일도 하지 않고 이력 줄도 남기지 않는다. ROLE_OBJ ADD 가 이미 있는 행이면 upsert 한다(Q-032) | 변경 대상이 없습니다: {키} |

- V-005(적용할 초안 없음)와 V-006(메모 1,000자 초과)은 VALIDATION_ERROR 이고, BTN, POPUP 값이 1,000자를 넘으면 PERM_BAD_VALUE 이다.
- 오류 코드는 8개다. 계약의 PERM_CONFLICT, PERM_NEED_CONFIRM, PERM_NOT_IN_OBJ, PERM_EMPTY_BTN 에 더해 saveDraft 의 PERM_BAD_VALUE(V-004, V-008)와 PERM_FORBIDDEN(V-009)에 더해 apply 의 PERM_BUSY(잠금 대기 초과)와 PERM_DRAFT_CORRUPT(초안의 범위가 기준 지문에 없음)를 쓴다. 문구는 `CODE: 상세` 이다.

### 6.3 검증 실행 순서

```
[초안 적용] 클릭
  → 1단계 (FE) 초안 변경 건수 확인 (ST-002)
  → impact 호출 → P-001 에서 잃는 사람 확인 체크 (XV-001 선행 안내), 메모 입력 (V-006 길이 검사)
  → apply 호출 (서버)
      → V-005 → V-006 → V-004 → V-008 → XV-003 → V-003 → V-009 → V-001 → V-002 → XV-002 → XV-001
  → 모두 통과 → 한 트랜잭션으로 쓴다
  → 실패 → 에러 코드별 처리 (BPMN설계서 §3)
```

---

## 7. 상태 정의 및 상태별 제어

### 7.1 상태 정의

| 상태코드 | 한글명 | 설명 | 단순 표시값/동작 제어값 | 수정 가능 | 삭제 가능 |
|---|---|---|---|---|---|
| NONE (ST-001) | 초안 없음 | CHANGE_CNT = 0 | 동작 제어값 | Y | N |
| DIRTY (ST-002) | 초안 있음 | CHANGE_CNT ≥ 1 | 동작 제어값 | Y | Y (초안 버리기) |
| CONFLICT (ST-003) | 충돌 감지 | apply 가 PERM_CONFLICT 를 돌려줬다 | 동작 제어값 | N (P-003 에서 정리 뒤) | Y |
| CONFIRM (ST-004) | 확인 필요 | P-001 에서 LOSE_USER_CNT ≥ 1 | 동작 제어값 | N | N |

### 7.2 상태 전이 규칙

```
NONE     → DIRTY      체크·칩·모두/조회만/없음 변경 (saveDraft 성공, CHANGE_CNT ≥ 1)
DIRTY    → NONE       변경을 모두 되돌림, 초안 버리기, 적용 성공
DIRTY    → CONFIRM    초안 적용 클릭, LOSE_USER_CNT ≥ 1 (P-001)
CONFIRM  → DIRTY      P-001 닫기
CONFIRM  → NONE       확인 체크 후 적용 성공
DIRTY    → CONFLICT   apply 가 PERM_CONFLICT 를 돌려줌 (P-003)
CONFIRM  → CONFLICT   같음
CONFLICT → DIRTY      충돌 범위의 변경 빼기 (B-013) 뒤 변경이 남음
CONFLICT → NONE       초안 버리고 다시 읽기 (B-014), 또는 B-013 뒤 변경이 0건
```

### 7.3 상태별 필드 편집 가능 여부

| 필드 | NONE | DIRTY | CONFLICT | CONFIRM |
|---|---|---|---|---|
| G2 체크 (GB-005) | 편집 | 편집 | 읽기 | 읽기 |
| G3 체크 (GB-006) | 편집 | 편집 | 읽기 | 읽기 |
| G6 체크 (GB-007, GB-008) | 편집 | 편집 | 읽기 | 읽기 |
| BTN_PERM (D-001) | 편집 | 편집 | 읽기 | 읽기 |
| POPUP_PERM (D-002) | 편집 | 편집 | 읽기 | 읽기 |
| APPLY_MEMO (D-004) | - | - | - | 편집 |
| 잃는 사람 확인 (D-005) | - | - | - | 편집 |

- 퍼미션을 고치면 오브젝트 밖에 남아 있던 옛 값은 버려지고 「오브젝트에 없는 값 N개를 뺐습니다」 안내를 보인다(Q-033).
- 모든 체크·칩은 권한 토큰 `saveDraft` 가 없거나 권한 기준(S-008)이 「현재」면 읽기 전용이다. 시스템 관리자 역할은 항상 읽기 전용이다.

### 7.4 상태별 버튼 활성/비활성

| 버튼 | NONE | DIRTY | CONFLICT | CONFIRM |
|---|---|---|---|---|
| B-001 초안 적용 | 비활성 | 활성 | 비활성 | 비활성 |
| B-002 초안 버리기 | 비활성 | 활성 | 활성 | 비활성 |
| B-003 적용 이력 | 활성 | 활성 | 활성 | 활성 |
| B-004-B-007 | 활성 | 활성 | 비활성 | 비활성 |
| B-011 적용 실행 | - | - | - | 활성 (확인 체크 뒤) |
| B-013, B-014 | - | - | 활성 | - |
| B-015-B-023 | 활성 | 활성 | 활성 | 활성 |

---

## 8. 권한 정의

권한 토큰은 action 이름과 같다(D7). 열은 권한이 큰 순서다. 「권한 관리자」는 11개 토큰을 모두 받은 역할이고, 「조회 전용」은 `readPreset` 이 정하는 6개(searchBench, searchMenuTree, searchRolePerm, searchHistory, searchHistoryDtl, explain)만 받은 역할이다. perm-core 가 explain 을 readPreset 에 넣었다(Q-010).

| 기능 | SYSADMIN | 권한 관리자 | 조회 전용 | 비고 |
|---|---|---|---|---|
| 사람·역할·메뉴 조회 (searchBench, searchMenuTree, searchRolePerm) | O | O | O | |
| 사람 화면 설명 (explain) | O | O | O | readPreset 에 들어갔다(Q-010) |
| 초안 읽기 (loadDraft) | O | O | X | 조회 전용은 초안을 쓰지 않는다. 읽기만 하려면 토큰을 따로 준다 |
| 초안 저장 (saveDraft, B-004-B-007, GB-005-GB-008, GB-001, B-013) | O | O | X | |
| 초안 버리기 (discardDraft, B-002, B-014) | O | O | X | |
| 영향 보기 (impact) | O | O | X | 같음 |
| 초안 적용 (apply, B-001, B-011) | O | O | X | |
| 적용 이력 (searchHistory, searchHistoryDtl, B-003) | O | O | O | |
| 원래 화면 링크 (B-015-B-023) | △ | △ | △ | 대상 화면 열람 권한이 있을 때만 열린다 |
| SYSADMIN 이 걸린 변경 (V-009: 역할 그룹 ↔ SYSADMIN 역할, SYSADMIN 그룹에 사람 넣기) | O | X | X | 승인된 결정(Q-029). 권한 관리자가 시도하면 PERM_FORBIDDEN |
| 시스템 관리자 역할의 퍼미션 편집 | X | X | X | 모든 역할이 불가. 시스템 관리자 역할은 퍼미션 행이 없다(D13) |

---

## 9. 연동 화면 / 팝업

| 팝업ID | 대상 | 호출 방식 | 트리거 | 주고받는 데이터 |
|---|---|---|---|---|
| P-001 | 적용 확인 창 | Modal | B-001 | 보내기: 없음 / 받기: GAIN_USER_CNT, LOSE_USER_CNT, SCREEN_CNT, APPLY_MEMO, confirmLoss |
| P-002 | 적용 이력 창 | Modal | B-003 | 보내기: fromDt, toDt, applyUserId, applyId / 받기: G13, G14 |
| P-003 | 충돌 안내 창 | Modal | apply 의 PERM_CONFLICT | 보내기: 없음 / 받기: 충돌 범위 목록 (사람 `user:`, 그룹 `group:`, 역할 `role:` 키) |
| P-004 | 사용자 관리 (commUserMng) | 화면 이동 | B-015, B-016 | 보내기: 화면 ID, USER_ID (추가는 새 행 상태) / 받기: 없음. 돌아오면 다시 읽는다 |
| P-005 | 역할 그룹 관리 (commRoleGrpMng) | 화면 이동 | B-017, B-018 | 보내기: 화면 ID, ROLE_GROUP_ID / 받기: 없음 |
| P-006 | 역할 관리 (commRoleMng) | 화면 이동 | B-019, B-020 | 보내기: 화면 ID, ROLE_ID / 받기: 없음 |
| P-007 | 메뉴 관리 (commMenuMng) | 화면 이동 | B-021, GB-004 | 보내기: 화면 ID, MENU_ID / 받기: 없음 |
| P-008 | 오브젝트 관리 (commObjMng) | 화면 이동 | B-022, B-023 | 보내기: 화면 ID, OBJECT_ID / 받기: 없음 |

- 이 화면으로 들어오는 방향: 옛 화면의 「작업대에서 열기」가 roleId, objectId 를 넘기면 첫 선택으로 쓴다(Q-021).
- 화면 이동의 전달 방식은 기존 화면 이동 규칙을 조사한 뒤 따른다(Q-015).

---

## 10. 기타 열거형 (LoV)

| 열거형 (DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| USE_TP (LV-001) | Y | 사용 | |
| USE_TP | N | 사용 안 함 | 뱃지로 보인다 |
| source (LV-002) | CUR | 현재 | |
| source | DRAFT | 초안 | |
| KIND (LV-003) | BTN | 버튼 | |
| KIND | POPUP | 팝업 | |
| REASON (LV-004) | PERM | 퍼미션으로 켜짐 | 켜짐 이유 |
| REASON | SYSADMIN | 시스템 관리자라 모두 켜짐 | 켜짐 이유 |
| REASON | NO_PERM | 받은 역할의 퍼미션에 없습니다 | 잠김 이유 |
| REASON | NOT_IN_OBJ | 오브젝트에 없는 값이라 아무도 쓸 수 없습니다 | 잠김 이유 |
| REASON | ROLE_UNUSED | 역할이 사용 안 함이거나 유효 기간 밖입니다 | 잠김 이유 |
| REASON | GROUP_UNUSED | 역할 그룹이 사용 안 함입니다 | 잠김 이유 |
| REASON | OBJ_UNUSED | 오브젝트가 사용 안 함입니다 | 잠김 이유 |
| REASON | MENU_HIDDEN | 메뉴가 숨김이거나 사용 안 함이라 메뉴 트리에 나오지 않습니다 | 잠김 이유 |
| REASON | NO_ROLE | 받은 역할이 없거나 사용자가 사용 안 함입니다 (Q-022) | 잠김 이유 |
| TARGET_TP (LV-005) | USER_GRP | 사람 ↔ 그룹 | |
| TARGET_TP | GRP_ROLE | 그룹 ↔ 역할 | |
| TARGET_TP | ROLE_OBJ | 역할 ↔ 오브젝트 | |
| OP_TP (LV-006) | ADD | 추가 | |
| OP_TP | DEL | 삭제 | |
| OP_TP | UPD | 바뀜 | |
| SHOW_TP (LV-007) | Y | 보임 | |
| SHOW_TP | N | 숨김 | |
| ALLOWED, GRANTED, VISIBLE, confirmLoss (LV-008) | Y | 예 | |
| 같음 | N | 아니오 | |

---

## 11. 특이사항 / 설계 결정

### 11.1 [확인필요] 인용 (분석리포트 §13 그대로)

| 분석리포트 §13 ID | 항목 | 영향도 | 후속 조치 | 상태 |
|---|---|---|---|---|
| Q-001 | screenId 부속서 미등재 | 낮음 | 조정자가 A.3 에 등재 | open |
| Q-002 | moduleGroup 부속서 미등재 (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-003 | To-Be 테이블/Entity 미확보 (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-004 | S-NNN 화면 표시명 폴백 미충족 (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-005 | G-NNN 화면 표시명 폴백 미충족 (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-006 | P-NNN To-Be 화면명 미확정 (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-007 | 이벤트 핸들러 미사용 (L3) (템플릿 예약 슬롯) | 낮음 | 없음 | wontfix |
| Q-008 | impact 요약 숫자 | 중간 | 필요하면 perm-core 가 칸을 늘린다 | open |
| Q-009 | 「이 메뉴를 연 역할」 | 중간 | 필요하면 action 추가를 조정자에게 요청 | open |
| Q-010 | 읽기 프리셋과 새 action | 높음 | 없음 | resolved (perm-core 가 `explain` 을 readPreset 에 넣었다(조정자 답변)) |
| Q-011 | 사람 목록 페이지 | 중간 | 필요하면 `pageNo` 추가 요청 | resolved (상한 200건, 페이지 칸 없음, 잘림 안내는 FE(조정자 답변)) |
| Q-012 | searchBench 의 roleGroupId, roleId | 낮음 | b1 이 확인 | open |
| Q-013 | 에러 전달 방식 | 중간 | b1 이 확인 | open |
| Q-014 | 요청 body 모양 | 중간 | 가이드 정리는 별도 | resolved (D36: 목록 입력은 모두 grids) |
| Q-015 | 3단계 화면 이동 방식 | 중간 | f4 가 조사 | open |
| Q-016 | SYSADMIN 퍼미션 변경 거절 코드 | 낮음 | 없음 | resolved (Q-029 로 대체) |
| Q-017 | 이력 문자열 형식 | 낮음 | 없음 | resolved (b4 구현) |
| Q-018 | saveDraft 의미 | 중간 | 없음 | resolved (D36: 전체 교체) |
| Q-019 | 초안 저장 빈도 | 낮음 | f3 가 조정 | open |
| Q-020 | 새 메뉴 체크 때 처음 BTN 값 | 낮음 | 없음 | open |
| Q-021 | 진입 파라미터 | 낮음 | f4, f7 이 확정 | open |
| Q-022 | 사용자 「사용 안 함」 사유 | 중간 | perm-core 가 USER_UNUSED 추가 여부 결정 | resolved (NO_ROLE 로 내려온다(조정자 답변)) |
| Q-023 | 캐시 무효화 시점 | 중간 | b4 가 구현·시험 | resolved (AFTER_COMMIT 발행(조정자 답변)) |
| Q-024 | SORT_SEQ 출처 | 낮음 | b1 이 확인 | open |
| Q-025 | 계산 칼럼의 값 규칙과 길이 | 낮음 | b1 이 확인 | open |
| Q-026 | 충돌 뒤 사용자 행동 | 중간 | f3 가 구현 | open |
| Q-027 | 의미색과 역할 칩 색 토큰 | 낮음 | f1 이 정의 | open |
| Q-029 | 시스템 관리자 범위 변경의 주체 | 중간 | 조정자 승인으로 확정했다 | resolved (조정자 승인 S7 A) |
| Q-030 | 메뉴 열의 역할 이니셜 칩 | 낮음 | 다음 회차 후보 | open |
| Q-031 | 역할 기준 메뉴 트리의 REASON | 낮음 | perm-runtime | open |
| Q-032 | 같은 변경의 재시도 | 낮음 | 없음 | resolved (조정자 승인) |
| Q-033 | 오브젝트 밖 옛 값 | 낮음 | 없음 | resolved (조정자 승인 S3 A) |
| Q-034 | 새 테이블 이름·길이 | 중간 | 없음 | resolved |
| Q-035 | 빈 버튼 퍼미션 | 중간 | 없음 | resolved |
| Q-036 | 오브젝트에서 값 빼기 | 낮음 | 없음 | resolved |
| Q-037 | 조회만 프리셋 | 낮음 | 없음 | resolved |
| Q-038 | 시안의 등록·수정 상자 | 낮음 | 없음 | resolved |
| Q-039 | 초안 변경 범위 | 중간 | 영향 표시가 부족하면 옛 화면 레인과 협의 | open |
| Q-040 | 설계 결정의 레퍼런스 등재 | 낮음 | 조정자가 마감 때 등재 | open |
| Q-028 | saveDraft 입력 형식 (D36) | 낮음 | 없음 | resolved |

### 11.2 검토한 대안

| 대안 | 장점 | 단점 | 채택 | 사유 |
|---|---|---|---|---|
| 초안을 브라우저 메모리에 둔다 (시안 방식) | 서버 테이블이 필요 없다 | 탭을 닫으면 사라지고 충돌을 감지할 수 없다 | × | D22 가 서버 초안 1건과 지문 비교를 정했다 |
| saveDraft 를 증분으로 한다 | 전송량이 작다 | 순서가 어긋나면 초안이 깨진다 | × | 전체 교체가 멱등이라 다시 보내도 안전하다(Q-018) |
| 충돌 때 강제 적용을 허용한다 | 관리자가 빨리 끝낸다 | 다른 관리자의 변경을 덮는다 | × | 충돌 범위를 정리한 뒤 다시 적용하게 한다(B-013, B-014) |
| 작업대 안에 등록·수정 상자를 둔다 (시안 일부) | 화면 이동이 없다 | 같은 입력 칸이 두 곳에 생기고 검증 규칙이 둘이 된다 | × | 3단계에서 원래 화면으로 연다(시안 `mock-v16.html:535`) |

## 칸 찾기 정리 (2026-11-28)

- 사람 칸: 찾는 말이 없으면 받은 사람(서버가 USER_ID 순으로 준 최대 200명)을 모두 보인다. 고른 사람도 정렬된 자기 자리에 둔다(m15 에서 맨 위로 올리던 것을 없앴다). 그룹마다 한 명씩 보이던 예시와 화면의 40명 상한(PEOPLE_LIMIT)은 없앴다.
- 받은 사람이 200명(CommPermBenchService.USER_LIMIT)이면 「앞 200명만 보입니다. 찾기로 좁히세요」 를 보인다. 그 밖에는 안내가 없다. 찾는 중에는 「N명 찾음」 만 보인다.
- 역할 그룹 칸에 그룹 찾기(S-013)를 더했다. 역할 칸의 역할 찾기(S-004)는 사람 기준에도 보인다. 찾는 말은 그 칸 안에만 두어 다른 칸을 다시 그리지 않는다.

## 칸 정렬 단추·고른 항목 자리 (2026-11-28)

- 사람·역할 그룹·역할 칸(사람 기준·역할 기준 모두) 머리에 정렬 단추(S-014)를 더했다. 기본은 ID 오름이라 처음 모습은 전과 같다.
- 고른 항목을 맨 위로 올리지 않는다. 찾기로 걸러져도 고른 항목은 목록에 남지만 자리는 정렬 순서를 따른다. 「N명 찾음」·「N개 찾음」은 찾는 말에 맞은 개수만 센다(고른 항목이 맞지 않으면 세지 않는다).
- 고른 항목이 화면 밖으로 나가도 그 줄로 스크롤하지 않는다(사용자가 누른 줄이라 이미 보인다 — 조정자 기본안).
