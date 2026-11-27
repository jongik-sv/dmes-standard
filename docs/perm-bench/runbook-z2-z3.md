# 권한 작업대 마감 런북: z2 실제 로그인 확인 · z3 2단계 끝 기준

이 문서는 perm-bench 회차의 마감 확인 z2와 z3를 사람이 브라우저로 따라 하는 절차입니다.

- 기준 커밋: `5c9075d4b` (브랜치 `perm/perm-bench-be-z`)
- z2·z3 정의: [`decompose.md`](decompose.md) §2.6 표의 z2·z3 줄(179-180행)
- 1단계·2단계 끝 기준 원문: [`mock-v16.html`](mock-v16.html) 528행(1단계)·531행(2단계)
- 서버를 띄우는 사람: 조정자 1명 (decompose.md z2 줄 「조정자만 서버 기동」)
- 이 문서에서 「확인 필요」는 코드와 문서로 확인하지 못한 내용입니다. 실행하면서 실제 결과를 적어 주세요.

> 경고: 이 문서의 쓰기 SQL(INSERT·UPDATE·DELETE)과 `SELECT ... FOR UPDATE`는 복제 PDB(개발용 `L_` PDB)에서만 실행하세요. 운영 DB와 공유 DB에서 실행하면 권한 자료가 바뀌거나 지워집니다.

## 목차

1. [시작하기 전에 막히는 조건](#1-시작하기-전에-막히는-조건)
2. [준비: DB·서버·계정](#2-준비-db서버계정)
3. [공통 확인 방법](#3-공통-확인-방법)
4. [z2: 실제 로그인 확인](#4-z2-실제-로그인-확인)
5. [z3: 2단계 끝 기준](#5-z3-2단계-끝-기준)
6. [상태 확인 SQL (읽기 전용)](#6-상태-확인-sql-읽기-전용)
7. [시험 자료 되돌리기](#7-시험-자료-되돌리기)
8. [확인 필요 목록](#8-확인-필요-목록)

## 1. 시작하기 전에 막히는 조건

기준 커밋의 작업대 화면은 가짜 자료로 동작합니다. 이 상태에서는 z2·z3를 할 수 없습니다.

- `src/frontend/m-mcm/page-components/csa/commPermBench/page.tsx:40` 이 `const USE_MOCK = true;` 입니다.
- `USE_MOCK = true` 이면 작업대가 DB가 아니라 `mock.ts`의 가짜 사람·역할을 보여 줍니다. 적용도 DB에 쓰지 않습니다.
- perm-fe 레인 메모의 남은 일 3번이 실연결(`USE_MOCK = false`) 커밋입니다 ([`lanes/perm-fe.md`](lanes/perm-fe.md) 「남은 일」).

다음 중 하나를 고르세요.

1. (권장) 실연결 커밋이 머지된 뒤 그 커밋에서 이 런북을 실행하세요.
2. 확인만 하려면 로컬에서 `page.tsx:40` 을 `const USE_MOCK = false;` 로 바꾸세요. 이 변경은 커밋하지 마세요. 끝나면 `git checkout -- src/frontend/m-mcm/page-components/csa/commPermBench/page.tsx` 로 되돌리세요.

작업대가 실제 DB를 읽는지 이렇게 확인합니다.

1. 작업대를 연 후 사람 칸을 보세요.
2. 사람 칸에 `admin` 과 아래 2.4절에서 넣은 `z2_user` 가 보이면 실제 DB입니다.
3. 가짜 자료의 사람(예: 품질팀 사람 6명, 그룹 `RG_LEGACY`)이 보이면 아직 가짜 자료입니다. 멈추세요.

참고: 실연결 전에는 `useBenchState.ts:68` 의 `CURRENT_USER_IS_SYSADMIN = false` 와 서버 응답 `me[0].ME_SYSADMIN` 으로 SYSADMIN 여부를 정합니다. 실연결 뒤 SYSADMIN 관리자에게 SYSADMIN 이 걸린 소속 변경 잠금이 풀리는지는 확인 필요입니다.

## 2. 준비: DB·서버·계정

### 2.1 복제 PDB 만들기

이 런북은 전용 복제 PDB 하나를 씁니다. 이 문서는 이름을 `L_Z2` 로 씁니다. 끝나면 PDB를 지워서 되돌립니다(7절).

1. Oracle 컨테이너를 띄우세요. 절차는 [`README.md`](../../README.md) 「3. Oracle 컨테이너 기동과 확인」입니다.
2. `TPL_DATA` 템플릿이 있는지 확인하세요: `node scripts/oracle/pdb.mjs list` (Windows: `scripts\oracle\pdb.cmd list`).
3. 템플릿이 없으면 README 「4.」의 `template-schema`·`template-data` 를 먼저 실행하세요.
4. 복제하세요: `node scripts/oracle/pdb.mjs clone TPL_DATA L_Z2`.

- 접속 URL은 `node scripts/oracle/pdb.mjs url L_Z2 MCMAPUSER` 로 봅니다.
- 사용자 비밀번호는 [`scripts/oracle/README.md`](../../scripts/oracle/README.md) 42행에 있습니다.
- 이 문서의 SQL은 모두 `MCMAPUSER` 로 접속해 실행합니다. SQL 도구는 Oranda, SQL Developer, 컨테이너 안 `sqlplus` 중 하나를 쓰세요.

### 2.2 서버 띄우기

명령은 저장소 스크립트를 그대로 씁니다. 옵션의 정본은 [`README.md`](../../README.md) 「5. 백엔드·프론트 기동」과 「빌드·실행」 표입니다.

1. `.run.env.example` 을 `.run.env` 로 복사하세요.
2. `.run.env` 의 `BE_RUN_ARGS` 를 `--mcm --mdm --mls --pdb=L_Z2` 로 고치세요.
3. 저장소 루트에서 `./local-run.sh` 를 실행하세요. Windows는 `local-run.cmd` 또는 `local-run.ps1` 입니다.
4. 백엔드만 다시 띄울 때는 `./be-run.sh --mcm --mdm --mls --pdb=L_Z2` 를 쓰세요. 프론트만은 `./fe-run.sh --all -q` 입니다.
5. 브라우저로 `http://localhost:5100` 을 여세요.

- 첫 기동 때 mcm `DataInitializer` 가 `admin` 계정, SYSADMIN 그룹·역할, 메뉴, 권한 작업대 메뉴를 넣습니다.
- `admin` 비밀번호는 기동할 때마다 시드 값으로 다시 설정됩니다 (`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/CoreRbacSeeder.java:44-54`). 값은 README 「5.」의 로그인 줄에 있습니다.
- `mcm.security.sysadmin-freepass` 는 기본값 `false` 로 두세요. `true` 이면 SYSADMIN 이 모든 경로를 통과해서 SYSADMIN 403 확인이 뜻이 없습니다 (`EndpointPermissionFilter.java` 머리 주석).
- MDM 화면(MDM_STEWARD 확인)에는 `--mdm` 이 필요합니다.

### 2.3 계정과 역할 한눈에 보기

| 계정 | 쓰임 | 그룹 → 역할 | 만드는 곳 |
|---|---|---|---|
| `admin` | z2 SYSADMIN, z3 관리자 1 | `ROLE_GROUP_SYSADMIN` → `SYSADMIN` | 시드 (`CoreRbacSeeder.java`) |
| `e2e_mdm_steward` | z2 MDM_STEWARD | `ROLE_GROUP_MDM_STEWARD` → `MDM_STEWARD` | e2e 픽스처 `src/frontend/e2e/fixtures/mdm-rbac-users.sql` |
| `e2e_mdm_none` | 역할 없는 사람, z3 얻는 사람 | 없음 | 같은 픽스처 |
| `z2_user` | z2 일반 사용자 | `Z2_RG_A`·`Z2_RG_A2` → `Z2_ROLE_A` | 2.4절 SQL |
| `z2_empty` | 빈 퍼미션 사례, z3 | `Z2_RG_B` → `Z2_ROLE_B` | 2.4절 SQL |
| `z3_admin2` | z3 관리자 2 | `ROLE_GROUP_SYSADMIN` → `SYSADMIN` | 2.4절 SQL |

- 시드에는 SYSADMIN·MDM_STD_ADMIN·MDM_STEWARD 말고 일반 역할이 없습니다. 그래서 일반 사용자와 `Z2_*` 역할·그룹을 새로 만듭니다.
- 새 계정의 비밀번호 행은 `admin` 행을 복사합니다. 그래서 비밀번호는 `admin` 과 같습니다. 이 방식은 e2e 픽스처 `mdm-rbac-users.sql` 머리 주석과 같습니다.

시험 대상 화면은 두 개입니다.

| 화면 | OBJECT_ID | 메뉴 위치 | 오브젝트 버튼 값 (`ObjPermCatalog.java`) | 화면 버튼 → action (`lsh/noticeMgmt/page.tsx`) |
|---|---|---|---|---|
| 공지사항 관리 | `noticeMgmt` | 공통관리 › 공지관리 › 공지사항 관리 | `changeStatus,save,search` | 조회 → `search`, 신규·저장 → `save`, 삭제 → `delete`, 게시중지 → `changestatus` |
| 로그 뷰어 | `logViewer` | 폴더 `anl` › 로그 뷰어 | `search` | 확인 필요 |

- 공지사항 관리의 「삭제」 버튼은 action 이 `delete` 입니다. 오브젝트 값에 `delete` 가 없으므로 SYSADMIN 에게도 꺼질 수 있습니다. 확인 필요입니다.
- `anl` 폴더의 화면 이름과 로그 뷰어 화면 버튼은 확인 필요입니다.

### 2.4 시험 계정·역할 넣기 (복제 PDB 전용)

> 경고: 아래 SQL은 복제 PDB `L_Z2` 에서만 실행하세요. 운영 DB에서 실행하면 운영 권한 표에 시험 계정이 생깁니다.

넣는 시점은 서버를 한 번 띄운 뒤(시드가 끝난 뒤), 시험 계정으로 처음 로그인하기 전입니다.

1. `MCMAPUSER` 로 `L_Z2` 에 접속하세요.
2. `src/frontend/e2e/fixtures/mdm-rbac-users.sql` 의 문장을 모두 실행하세요. 이 파일에는 COMMIT이 없습니다.
3. 아래 SQL을 실행하세요.
4. `COMMIT;` 을 실행하세요.
5. 백엔드를 다시 띄우세요. SQL로 넣은 권한은 서버 권한 캐시(`UserPermCache`)를 비우는 이벤트를 내지 않습니다.

```sql
-- z2·z3 런북 시험 자료. 복제 PDB 전용. 다시 넣으면 PK 오류가 납니다(이미 있다는 뜻).
-- 역할
INSERT INTO TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
    VER, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
VALUES ('Z2_ROLE_A', 'Z2 공지 담당', 'z2 런북 시험용', 'Y', SYSTIMESTAMP - INTERVAL '1' DAY, TIMESTAMP '9999-12-31 23:59:59',
    0, 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook');
INSERT INTO TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, ROLE_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
    VER, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
VALUES ('Z2_ROLE_B', 'Z2 공지 조회', 'z2 런북 시험용', 'Y', SYSTIMESTAMP - INTERVAL '1' DAY, TIMESTAMP '9999-12-31 23:59:59',
    0, 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook');

-- 역할 그룹 3개
INSERT INTO TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
    VER, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
SELECT g.ID, g.NM, 'z2 런북 시험용', 'Y', SYSTIMESTAMP - INTERVAL '1' DAY, TIMESTAMP '9999-12-31 23:59:59',
    0, 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook'
  FROM (SELECT 'Z2_RG_A' ID, 'Z2 그룹 A' NM FROM DUAL
        UNION ALL SELECT 'Z2_RG_A2', 'Z2 그룹 A2' FROM DUAL
        UNION ALL SELECT 'Z2_RG_B', 'Z2 그룹 B' FROM DUAL) g;

-- 그룹 → 역할 (Z2_ROLE_A 를 그룹 두 개로 준다: 사례 5)
INSERT INTO TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID,
    VER, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
SELECT m.G, m.R, 0, 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook'
  FROM (SELECT 'Z2_RG_A' G, 'Z2_ROLE_A' R FROM DUAL
        UNION ALL SELECT 'Z2_RG_A2', 'Z2_ROLE_A' FROM DUAL
        UNION ALL SELECT 'Z2_RG_B', 'Z2_ROLE_B' FROM DUAL) m;

-- 퍼미션(새 표 TB_MCM_SEC_ROLE_PERM). 토큰은 정렬한 쉼표 목록
INSERT INTO TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM,
    VER, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
SELECT p.R, p.O, p.B, NULL, NULL, 0, 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook'
  FROM (SELECT 'Z2_ROLE_A' R, 'noticeMgmt' O, 'changeStatus,save,search' B FROM DUAL
        UNION ALL SELECT 'Z2_ROLE_A', 'logViewer', 'search' FROM DUAL
        UNION ALL SELECT 'Z2_ROLE_B', 'noticeMgmt', 'search' FROM DUAL) p;

-- 사용자 3명(admin 행 복사. mdm-rbac-users.sql 과 같은 칼럼)
INSERT INTO TB_MCM_SEC_USER
    (USER_ID, USER_NM, USER_EMP_NO, DEPT_CD, EMAIL, END_ACTIVE_DATE, START_ACTIVE_DATE, IN_OUT_EMP_TP, USE_TP,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT n.USER_ID, n.USER_NM, n.USER_EMP_NO, a.DEPT_CD, NULL, a.END_ACTIVE_DATE, a.START_ACTIVE_DATE, a.IN_OUT_EMP_TP, a.USE_TP,
       SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', 0
  FROM TB_MCM_SEC_USER a,
       (SELECT 'z2_user' USER_ID, 'Z2 일반 사용자' USER_NM, 'Z2-1' USER_EMP_NO FROM DUAL
        UNION ALL SELECT 'z2_empty', 'Z2 빈 퍼미션 사용자', 'Z2-2' FROM DUAL
        UNION ALL SELECT 'z3_admin2', 'Z3 두 번째 관리자', 'Z3-1' FROM DUAL) n
 WHERE a.USER_ID = 'admin';

INSERT INTO TB_MCM_SEC_USER_PWD
    (USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT n.USER_ID, a.USER_ENC_PWD, a.LAST_PWD_CHNG_DATE,
       SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', 0
  FROM TB_MCM_SEC_USER_PWD a,
       (SELECT 'z2_user' USER_ID FROM DUAL
        UNION ALL SELECT 'z2_empty' FROM DUAL
        UNION ALL SELECT 'z3_admin2' FROM DUAL) n
 WHERE a.USER_ID = 'admin';

-- 사람 → 그룹
INSERT INTO TB_MCM_SEC_USER_MAPPING
    (USER_ID, ROLE_GROUP_ID, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT m.U, m.G, SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', SYSTIMESTAMP, 'z2-runbook', 'z2-runbook', 'z2-runbook', 0
  FROM (SELECT 'z2_user' U, 'Z2_RG_A' G FROM DUAL
        UNION ALL SELECT 'z2_user', 'Z2_RG_A2' FROM DUAL
        UNION ALL SELECT 'z2_empty', 'Z2_RG_B' FROM DUAL
        UNION ALL SELECT 'z3_admin2', 'ROLE_GROUP_SYSADMIN' FROM DUAL) m;
```

화면으로 만들 수도 있습니다. 순서만 적습니다. 화면마다 정확한 입력 칸과 버튼 순서는 확인 필요입니다.

1. 공통관리 › 시스템관리 › 역할 관리(`commRoleMng`)에서 역할 2개를 추가한 후 「저장」을 누르세요.
2. 역할 그룹 관리(`commRoleGrpMng`)에서 그룹 3개를 추가하고 역할을 연결한 후 「저장」을 누르세요.
3. 사용자 관리(`commUserMng`)에서 사용자를 등록한 후 「역할추가」·「역할저장」으로 그룹을 연결하세요. 초기 비밀번호는 비밀번호 초기화(`pwdinit`) 응답 `INIT_PWD` 로 받습니다.
4. PERMISSION 관리(`commPermMng`)에서 역할 × 오브젝트의 버튼 칩을 고른 후 「저장」을 누르세요.

넣은 뒤 6.1절과 6.2절 SQL로 자료를 확인하세요. 오브젝트 값이 2.3절 표와 다르면 기대 결과도 달라집니다.

## 3. 공통 확인 방법

### 3.1 작업대에서 설명 읽기

1. `admin` 으로 로그인하세요.
2. 공통관리 › 시스템관리 › 권한 작업대를 여세요.
3. 미리보기의 「보는 기준」에서 「사람 기준」을 고르세요.
4. 사람 칸에서 확인할 사람을 고르세요.
5. 미리보기 위 「현재와 초안」에서 「현재」를 고르세요. 초안이 없으면 두 값이 같습니다.
6. 미리보기의 메뉴 목록(「메뉴 n개」)을 기록하세요. 숨긴 화면에는 「숨김」 표시가 붙습니다.
7. 메뉴 목록에서 확인할 화면을 고르세요.
8. 「버튼」 줄과 「팝업」 줄을 기록하세요.

버튼 줄을 이렇게 읽습니다. 화면은 서버 `explain` 응답의 버튼 줄(`ExplainButtonRow`)을 그립니다.

| 응답 칸 | 뜻 | 화면에 보이는 것 |
|---|---|---|
| `GRANTED = Y` | 이 사람이 실제로 씁니다 | 켜진 버튼. 아래 색 칩이 켠 역할입니다 |
| `GRANTED = N` | 못 씁니다 | 잠긴 버튼. 아래에 짧은 이유가 붙습니다 |
| `ALLOWED = N` | 오브젝트 값에 없습니다 | 마우스를 올리면 「오브젝트에서 빠진 값이라 아무도 못 씁니다」 |
| `REASON` | 이유 코드 | 아래 표의 짧은 이유 (`model.ts:496-506`) |

| REASON | 짧은 이유 |
|---|---|
| `PERM`·`SYSADMIN` | (없음, 켜짐) |
| `NO_PERM` | 켠 역할 없음 |
| `NOT_IN_OBJ` | 오브젝트에 없음 |
| `ROLE_UNUSED` | 역할 사용 안 함 |
| `GROUP_UNUSED` | 그룹 사용 안 함 |
| `OBJ_UNUSED` | 오브젝트 사용 안 함 |
| `MENU_HIDDEN` | 메뉴 숨김 |
| `NO_ROLE` | 받은 역할 없음 |

- 버튼에 마우스를 올리면 쓰는 길(그룹 → 역할)이 보입니다. 예: 「쓰는 길: Z2 그룹 A → Z2 공지 담당, Z2 그룹 A2 → Z2 공지 담당」.
- 화면을 열 수 없으면 「「이름」은(는) 현재 이 화면을 열 수 없습니다. 메뉴에도 보이지 않습니다.」와 잠긴 이유가 보입니다.
- 서버 응답 원문을 보려면 개발자 도구 Network 탭에서 `commPermBench/explain` 요청의 응답 `grids.buttons.rows` 를 보세요. 응답의 정확한 칸 경로는 확인 필요입니다.

### 3.2 실제 로그인으로 보기

다른 계정은 다른 브라우저 창에서 로그인하세요. 일반 창과 시크릿 창은 쿠키를 나누지 않으므로 두 계정을 동시에 쓸 수 있습니다.

1. 시크릿 창을 연 후 `http://localhost:5100` 에 확인할 계정으로 로그인하세요.
2. 왼쪽 메뉴의 화면 목록을 기록하세요.
3. 확인할 화면을 여세요.
4. 화면 위 버튼 줄을 기록하세요.

- 권한이 없는 버튼은 숨지 않고 꺼집니다. 마우스를 올리면 「권한이 없습니다」가 보입니다 (`shared/src/layout/PageLayout.tsx:180`).
- 버튼 판정은 `secUser/myButtonEndpoints` 응답과 버튼 action 을 소문자로 비교합니다 (`use-user-button-rbac.ts` `canDoButton`).
- 권한을 바꾼 뒤에는 그 계정을 로그아웃한 후 다시 로그인하세요. 화면이 버튼 권한을 브라우저에 저장해 둡니다. 다시 로그인하지 않아도 바뀌는지는 확인 필요입니다.

### 3.3 403 확인

꺼진 버튼은 요청을 보내지 않습니다. 그래서 개발자 도구 Console 에서 요청을 직접 보냅니다.

1. 확인할 계정으로 로그인한 창에서 F12를 누르세요.
2. Network 탭을 연 후 필터에 `oasis` 를 넣으세요.
3. Console 탭에 아래 코드를 넣으세요. `OBJ` 와 `ACT` 를 확인할 화면과 action 으로 바꾸세요.

```js
const OBJ = "noticeMgmt", ACT = "search";
const r = await fetch(`/api/mcm/oasis/${OBJ}/${ACT}`, {
  method: "POST", credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ meta: { menuId: OBJ }, params: {}, grids: {} }),
});
console.log(r.status, await r.text());
```

4. 상태 코드를 기록하세요.

- `403` 과 `{"... "FORBIDDEN" ... "접근 권한이 없습니다." ...}` 이면 권한이 없습니다. 응답 모양은 `m-mcm/proxy.ts:205` 의 `jsonError("FORBIDDEN", "접근 권한이 없습니다.", 403)` 입니다.
- 프론트 서버 콘솔(`fe-run` 창)에 `[RBAC] 403 권한없음 — user=<계정> POST /api/mcm/oasis/<OBJ>/<ACT> permKey=...` 줄이 남습니다.
- `200` 이면 권한 검사를 통과했습니다. 빈 `params` 때문에 `meta.success=false` 가 와도 권한은 통과한 것입니다.

> 주의: 권한이 있는 쓰기 action(`save`, `changeStatus`)을 보내면 실제로 실행될 수 있습니다. 쓰기 action 은 권한이 없을 것으로 예상하는 계정에서만 보내세요.

### 3.4 비교 기록

사람 × 화면마다 아래 표를 채우세요. 「같음」 칸이 모두 Y여야 z2를 통과합니다.

| 사람 | 화면 | 작업대 메뉴 보임 | 실제 메뉴 보임 | 작업대 켜진 버튼 | 실제 켜진 버튼 | 403 확인 action·결과 | 같음 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 4. z2: 실제 로그인 확인

끝 기준: 사람 3명의 메뉴·버튼·403 이 작업대 설명과 같습니다. 1단계 끝 기준 6사례도 같습니다 (decompose.md 179행, mock-v16.html 528행).

### 4.1 사람 3명

| 사람 | 볼 화면 | 작업대에서 볼 것 | 실제 로그인에서 볼 것 | 403 확인 |
|---|---|---|---|---|
| `admin` (SYSADMIN) | 공지사항 관리, 권한 작업대, 로그 뷰어 | 버튼마다 `REASON = SYSADMIN`. 쓰는 길 「시스템관리자 그룹 → 시스템관리자」 | 오브젝트 값이 있는 버튼이 모두 켜짐. 「삭제」(`delete`)는 오브젝트 값에 없어 꺼질 수 있음(확인 필요) | `noticeMgmt/delete` → 403 예상(오브젝트 값에 없음, 확인 필요). `noticeMgmt/search` → 200 |
| `e2e_mdm_steward` (MDM_STEWARD) | MDM 샘플(`mdmSample`), 레이아웃 확정(`layoutConfirm`) | `mdmSample` 은 `search` 만 켜짐(시드 퍼미션 `search,view,export,compare` 와 오브젝트 값 `search` 의 교집합) | 작업대와 같은 버튼 | 공통관리 화면(예: `commUserMng/search`) → 403 예상 |
| `z2_user` (일반) | 공지사항 관리, 로그 뷰어 | 공지사항 관리 `changeStatus`·`save`·`search` 켜짐. 로그 뷰어 `search` 켜짐 | 조회·신규·저장·게시중지 켜짐. 삭제 꺼짐 | `noticeMgmt/delete` → 403. `commPermBench/searchBench` → 403 |

- `mdmSample` 의 시드 퍼미션은 `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` 18행입니다.
- 「게시중지」는 게시중인 글에서만 켜집니다 (`noticeMgmt/page.tsx` 주석 §7.4). 게시중인 글이 없으면 권한이 있어도 꺼져 보입니다. 이때는 403 확인으로 판정하세요.
- MDM_STEWARD 의 다른 화면 기대값은 시드 매트릭스(`MdmMenuSeeder.java:443-447`)로 정해집니다. 화면마다 작업대 설명을 기준으로 비교하세요.

각 사람마다 이 순서로 하세요.

1. 3.1절대로 작업대에서 그 사람과 화면을 고른 후 메뉴와 버튼을 기록하세요.
2. 3.2절대로 그 사람으로 로그인한 후 메뉴와 버튼을 기록하세요.
3. 3.3절대로 표의 403 확인 action 을 보내세요.
4. 3.4절 표를 채우세요.

### 4.2 1단계 끝 기준 6사례

원문에는 6사례 목록이 따로 없습니다. 아래 6사례는 다음 두 곳에서 이끌어 냈습니다.

- decompose.md 123행 r1 사례 시험: SYSADMIN · 사용 안 함 · 숨김 메뉴 · 오브젝트에서 빠진 값 · 여러 그룹 같은 역할 · 빈 BTN
- mock-v16.html 528행 1단계 끝 기준: SYSADMIN · 사용 안 함 · 숨김 메뉴 · 오브젝트에서 빠진 버튼 · 여러 그룹으로 받은 같은 역할

사례마다 바꾼 값은 다음 사례 전에 되돌리세요. 되돌리지 않으면 다음 사례의 기대 결과가 달라집니다.

계산 규칙의 정본은 `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/perm/impl/PermEvaluator.java` 머리 주석입니다.

- 역할 × 오브젝트 효과 = (퍼미션 BTN ∩ 오브젝트 BTN) ∪ (퍼미션 POPUP ∩ 오브젝트 POPUP)
- SYSADMIN = 쓰는 오브젝트 전부 × 오브젝트 값 전부. 퍼미션 행을 보지 않습니다
- 그룹·역할·오브젝트가 `USE_TP ≠ Y` 이거나 유효 기간 밖이면 빠집니다
- 퍼미션 행이 있으면 효과가 비어도 화면은 메뉴에 보입니다 (D14)

#### 사례 1: SYSADMIN

- 준비 자료: `admin` (시드)
- 조작: 없음. 4.1절 `admin` 줄을 그대로 확인하세요.
- 기대 결과:
  - 작업대: 오브젝트 값마다 `GRANTED = Y`, `REASON = SYSADMIN`.
  - 실제 로그인: 오브젝트 값에 있는 action 의 버튼이 모두 켜집니다.
  - 403: 오브젝트 값에 없는 action(예: `noticeMgmt/delete`)은 SYSADMIN 도 403 입니다. `CoreRbacSeeder.java:162` 주석 「여기에 없는 action 은 SYSADMIN 도 403 이다」와 같은 규칙입니다. 실제 결과는 확인 필요입니다.

#### 사례 2: 사용 안 함 (역할 · 그룹 · 오브젝트)

세 가지를 하나씩 하세요.

2-a 역할 사용 안 함

1. `admin` 으로 역할 관리(`commRoleMng`)를 여세요.
2. `Z2_ROLE_A` 의 사용 여부를 「미사용」으로 바꾼 후 「저장」을 누르세요.
3. 작업대에서 `z2_user` × 공지사항 관리를 보세요.
4. `z2_user` 로 다시 로그인한 후 메뉴를 보세요.

- 기대 결과: `z2_user` 는 `Z2_ROLE_A` 하나만 가집니다. 그래서 공지사항 관리와 로그 뷰어가 메뉴에서 사라집니다.
- 작업대: 「열 수 없습니다」와 잠긴 이유 「역할 사용 안 함」(`ROLE_UNUSED`).
- 403: `noticeMgmt/search` → 403.
- 되돌리기: `Z2_ROLE_A` 를 「사용」으로 바꾼 후 저장하세요.

2-b 그룹 사용 안 함

1. 역할 그룹 관리(`commRoleGrpMng`)에서 `Z2_RG_A` 와 `Z2_RG_A2` 를 둘 다 사용 안 함(`N`)으로 바꾼 후 「저장」을 누르세요.
2. 작업대와 `z2_user` 실제 로그인을 비교하세요.

- 기대 결과: 메뉴에서 공지사항 관리와 로그 뷰어가 사라집니다.
- 작업대: 잠긴 이유 「그룹 사용 안 함」(`GROUP_UNUSED`).
- 403: `noticeMgmt/search` → 403.
- 되돌리기: 두 그룹을 `Y` 로 바꾼 후 저장하세요.
- 그룹 하나만 끄는 경우는 사례 5에서 봅니다.

2-c 오브젝트 사용 안 함

1. OBJECT 관리(`commObjMng`)에서 `logViewer` 의 사용 여부를 `N` 으로 바꾼 후 「저장」을 누르세요.
2. 작업대에서 `z2_user` 와 `admin` 을 각각 보세요.
3. 두 계정으로 다시 로그인한 후 메뉴를 보세요.

- 기대 결과: 로그 뷰어가 두 사람 모두에게 사라집니다. SYSADMIN 도 쓰지 않는 오브젝트는 계산에서 뺍니다.
- 작업대: 「오브젝트 사용 안 함」(`OBJ_UNUSED`). 메뉴 칸에도 사용 안 함 표시가 붙습니다.
- 403: `logViewer/search` → 두 계정 모두 403.
- 되돌리기: `logViewer` 를 `Y` 로 바꾼 후 저장하세요.

#### 사례 3: 숨김 메뉴

1. 메뉴 관리(`commMenuMng`)에서 로그 뷰어 메뉴의 표시를 「미표시」로 바꾼 후 「저장」을 누르세요.
2. 작업대에서 `z2_user` × 로그 뷰어를 보세요.
3. `z2_user` 로 다시 로그인하세요.

- 기대 결과(실제 로그인): 왼쪽 메뉴에 로그 뷰어가 없습니다.
- 기대 결과(작업대): 메뉴 목록의 로그 뷰어에 「숨김」 표시가 붙습니다. 화면을 고르면 「메뉴에서 숨김(주소로 연 화면)」이 보입니다. `search` 는 켜진 채입니다.
- 403: `logViewer/search` → 200. 숨김은 메뉴 표시만 바꾸고 권한은 그대로 둡니다 (`model.ts:327-331` 주석).
- 숨긴 화면을 주소로 여는 방법은 확인 필요입니다.
- 메뉴 관리 저장은 권한 캐시를 비우는 이벤트를 내지 않습니다. 메뉴가 바로 바뀌지 않으면 백엔드를 다시 띄운 후 다시 보세요. 확인 필요입니다.
- 되돌리기: 로그 뷰어를 「표시」로 바꾼 후 저장하세요.

#### 사례 4: 오브젝트에서 빠진 값

`Z2_ROLE_A` 퍼미션에는 `changeStatus` 가 있습니다. 오브젝트 값에서 `changeStatus` 를 뺍니다.

1. OBJECT 관리(`commObjMng`)에서 `noticeMgmt` 의 「버튼 권한」을 `save,search` 로 바꾼 후 「저장」을 누르세요.
2. 작업대에서 `z2_user` × 공지사항 관리를 보세요.
3. `z2_user` 와 `admin` 으로 다시 로그인한 후 「게시중지」 버튼을 보세요.

- 기대 결과(작업대): `changeStatus` 줄이 `ALLOWED = N`, `GRANTED = N`, `REASON = NOT_IN_OBJ` 입니다. 짧은 이유는 「오브젝트에 없음」, 마우스를 올리면 「changeStatus — 오브젝트에서 빠진 값이라 아무도 못 씁니다」입니다.
- 기대 결과(실제 로그인): 두 계정 모두 「게시중지」가 꺼집니다.
- 403: `noticeMgmt/changeStatus` → 두 계정 모두 403.
- OBJECT 관리가 퍼미션에서 쓰는 값을 빼는 저장을 막는지는 확인 필요입니다. 막으면 아래 SQL을 쓰고 백엔드를 다시 띄우세요.

```sql
-- 복제 PDB 전용. 사례 4 준비
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'save,search' WHERE OBJECT_ID = 'noticeMgmt';
COMMIT;
-- 사례 4 되돌리기
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'changeStatus,save,search' WHERE OBJECT_ID = 'noticeMgmt';
COMMIT;
```

- 되돌리기: `noticeMgmt` 버튼 권한을 `changeStatus,save,search` 로 되돌리세요.

#### 사례 5: 여러 그룹으로 받은 같은 역할

`z2_user` 는 `Z2_RG_A` 와 `Z2_RG_A2` 두 그룹으로 `Z2_ROLE_A` 를 받습니다.

1. 작업대에서 `z2_user` × 공지사항 관리의 `search` 버튼에 마우스를 올리세요.
2. 쓰는 길을 기록하세요.
3. 역할 그룹 관리에서 `Z2_RG_A` 하나만 사용 안 함(`N`)으로 바꾼 후 저장하세요.
4. 작업대와 `z2_user` 실제 로그인을 다시 비교하세요.

- 기대 결과(1-2): 쓰는 길이 「Z2 그룹 A → Z2 공지 담당, Z2 그룹 A2 → Z2 공지 담당」 두 개입니다. 응답 `GROUPS` 칸에 `Z2_RG_A` 와 `Z2_RG_A2` 가 함께 있습니다.
- 기대 결과(3-4): 버튼은 그대로 켜져 있습니다. 쓰는 길은 `Z2_RG_A2` 하나만 남습니다.
- 403: `noticeMgmt/search` → 200.
- 되돌리기: `Z2_RG_A` 를 `Y` 로 바꾼 후 저장하세요.

#### 사례 6: 빈 BTN

빈 BTN은 두 가지로 확인합니다.

6-a 빈 BTN 저장 거절

1. PERMISSION 관리(`commPermMng`)에서 `Z2_ROLE_B` × `noticeMgmt` 줄을 찾으세요.
2. 버튼 칩을 모두 끈 후 「저장」을 누르세요.

- 기대 결과: 서버가 `PERM_EMPTY_BTN` 으로 거절합니다. 화면 문구는 확인 필요입니다. perm-fe-b 메모에는 이 코드를 쉬운 말로 보인다고 적혀 있습니다.
- 작업대에서는 마지막 칩을 끄면 초안이 퍼미션 빼기(DEL)가 됩니다 (decompose.md D14). 저장 거절 문구는 「버튼이 하나도 없는 퍼미션은 둘 수 없습니다. 버튼을 하나 이상 켜거나 「없음」으로 등록을 해제합니다.」입니다 (`draft.ts:430`).

6-b 효과가 빈 퍼미션 행

퍼미션 행은 있지만 오브젝트 값과 겹치는 값이 없는 경우입니다. 화면은 이 값을 저장하지 못하므로 SQL로 만듭니다.

```sql
-- 복제 PDB 전용. 사례 6-b 준비 (print 는 noticeMgmt 오브젝트 값에 없음)
UPDATE TB_MCM_SEC_ROLE_PERM SET BTN_PERM = 'print' WHERE ROLE_ID = 'Z2_ROLE_B' AND OBJECT_ID = 'noticeMgmt';
COMMIT;
```

1. SQL을 실행한 후 백엔드를 다시 띄우세요.
2. 작업대에서 `z2_empty` × 공지사항 관리를 보세요.
3. `z2_empty` 로 로그인하세요.

- 기대 결과(실제 로그인): 메뉴에 공지사항 관리가 보입니다. 버튼은 모두 꺼집니다.
- 기대 결과(작업대): 화면이 보이고, `search`·`save`·`changeStatus` 가 「켠 역할 없음」입니다. `print` 는 `ALLOWED = N`(「오브젝트에 없음」)입니다.
- 403: `noticeMgmt/search` → 403.
- 되돌리기:

```sql
-- 복제 PDB 전용. 사례 6-b 되돌리기
UPDATE TB_MCM_SEC_ROLE_PERM SET BTN_PERM = 'search' WHERE ROLE_ID = 'Z2_ROLE_B' AND OBJECT_ID = 'noticeMgmt';
COMMIT;
```

SQL로 되돌렸으면 백엔드를 다시 띄우세요.

#### 덧붙임: 역할 없는 사람

`e2e_mdm_none` 으로도 한 번 비교하세요.

- 기대 결과(작업대): 화면마다 「받은 역할 없음」(`NO_ROLE`).
- 기대 결과(실제 로그인): 권한 화면이 메뉴에 없습니다.
- 403: `noticeMgmt/search` → 403.

## 5. z3: 2단계 끝 기준

끝 기준 3개 (mock-v16.html 531행):

- 적용한 결과가 시뮬레이션과 같습니다.
- 두 관리자가 같은 역할을 동시에 적용하면 뒤 사람이 충돌 안내를 받습니다.
- 버튼을 잃는 사람이 있으면 적용 전에 한 번 더 확인을 받습니다.

시작하기 전에 확인하세요.

- 4.2절 사례의 변경을 모두 되돌렸습니다. 6.2절 SQL 결과가 2.4절과 같아야 합니다.
- `admin` 과 `z3_admin2` 에 초안이 없습니다. 6.4절 SQL 결과가 0줄이어야 합니다.

작업대 편집은 이렇게 합니다. 편집은 모두 초안에만 들어갑니다.

- 사람 ↔ 그룹: 사람 칸에서 사람을 고른 후 그룹 칸의 체크를 켜거나 끄세요 (`USER_GRP`).
- 그룹 ↔ 역할: 그룹을 고른 후 역할 칸의 체크를 켜거나 끄세요 (`GRP_ROLE`).
- 퍼미션: 역할과 화면을 고른 후 미리보기 아래 「퍼미션」의 칩을 켜거나 끄세요 (`ROLE_OBJ`).
- 초안은 고친 뒤 약 0.6초 후 자동 저장됩니다. 초안 막대에 「마지막 저장 HH:MM:SS」가 보이면 저장된 것입니다.
- 초안 막대 버튼: 「이력」, 「초안 버리기」, 「초안 적용」.

### 5.1 적용 결과 = 시뮬레이션

준비 자료: 2.4절 그대로. `z2_empty` 는 공지사항 관리에서 `search` 만, `e2e_mdm_none` 은 아무것도 못 씁니다.

1. `admin` 으로 작업대를 여세요.
2. 「사람 기준」에서 `e2e_mdm_none` 을 고르세요.
3. 그룹 칸에서 `Z2_RG_B` 의 체크를 켜세요.
4. 역할 칸에서 `Z2_ROLE_B` 를 고르세요.
5. 메뉴 칸에서 공지사항 관리를 고르세요.
6. 「퍼미션」에서 「저장」(`save`) 칩을 켜세요.
7. 초안 막대에 「바꾼 것 2건」과 「마지막 저장」이 보일 때까지 기다리세요.
8. 「초안 영향」의 타일과 「영향받는 사람」 목록을 기록하세요.
9. 미리보기를 「초안」으로 바꾼 후 `e2e_mdm_none` 과 `z2_empty` 의 메뉴·버튼을 기록하세요.

8-9단계의 기대 결과:

| 사람 | 화면 | 얻는 값 | 잃는 값 | 메뉴 |
|---|---|---|---|---|
| `e2e_mdm_none` | 공지사항 관리 | `save`·`search` | 없음 | 새로 보임(「새로」 표시) |
| `z2_empty` | 공지사항 관리 | `save` | 없음 | 그대로 |

- 타일: 바꾼 것 2, 얻는 사람 2, 잃는 사람 0, 바뀌는 화면 1. 화면 수의 세는 방식은 확인 필요입니다.
- 「Z2_ROLE_B 를 가진 다른 사람」이 있으면 그 사람도 `save` 를 얻습니다. 6.1절 SQL로 확인하세요.

10. 「초안 적용」을 누르세요.
11. 「초안 적용」 창에서 「초안 2건을 현재 값으로 적용합니다.」와 얻는 사람·잃는 사람 수를 확인하세요.
12. 메모에 `z3-a` 를 넣은 후 「적용」을 누르세요.

- 기대 결과: 잃는 사람이 0명이므로 확인 창 없이 적용됩니다.
- 성공 메시지: 「초안 2건을 적용했습니다. (PA…)」. 괄호 안이 적용 ID(`APPLY_ID`, `PA` + 시각 17자리 + 일련 3자리)입니다.
- 작업대가 현재 값을 다시 읽습니다. 초안 막대는 「바꾼 것 없음 — 지금 보이는 값이 현재 값입니다」가 됩니다.

13. 시크릿 창에서 `e2e_mdm_none` 으로 로그인하세요. 이미 로그인했으면 로그아웃한 후 다시 로그인하세요.
14. 메뉴와 공지사항 관리 버튼을 기록하세요.
15. `z2_empty` 로 13-14단계를 반복하세요.
16. 3.3절대로 `noticeMgmt/search` 를 두 계정에서 보내세요.
17. 6.1·6.2·6.5절 SQL로 DB를 확인하세요.

- 기대 결과: 14-16단계 결과가 8-9단계 시뮬레이션 표와 같습니다. 두 계정 모두 「조회」·「신규」·「저장」이 켜지고 「게시중지」·「삭제」는 꺼집니다.
- DB: `TB_MCM_SEC_USER_MAPPING` 에 (`e2e_mdm_none`, `Z2_RG_B`) 줄이 생깁니다. `TB_MCM_SEC_ROLE_PERM` 의 `Z2_ROLE_B` × `noticeMgmt` 가 `save,search` 입니다.
- 이력 머리: `CHANGE_CNT = 2`, `GAIN_USER_CNT = 2`, `LOSE_USER_CNT = 0`, `APPLY_MEMO = z3-a`.
- 이력 줄: `USER_GRP`·`ADD`(`N` → `Y`) 1줄, `ROLE_OBJ`·`UPD`(`BTN=search|POPUP=` → `BTN=save,search|POPUP=`) 1줄. 값 형식은 `PermApplyService.java` 머리 주석 「이력 값 형식」입니다.

다르면 다른 점을 3.4절 표에 적고 멈추세요.

### 5.2 두 관리자 동시 적용

같은 역할 `Z2_ROLE_B` 를 두 관리자가 고칩니다. 충돌은 초안의 기준 지문으로 판정합니다.

- 서버는 초안이 그 범위(`role:Z2_ROLE_B`)를 처음 건드릴 때 기준 지문을 찍습니다. 이후 저장에서는 바꾸지 않습니다 (`PermDraftService.java` 머리 주석, `PermDraftFingerprint.extend`).
- 적용할 때 기준 지문과 지금 값이 다르면 `PERM_CONFLICT: role:Z2_ROLE_B` 로 거절합니다 (`PermApplyService.java:222-226`).
- 그래서 관리자 2의 초안 저장이 관리자 1의 적용보다 먼저여야 충돌이 납니다. 순서를 지키세요.

창 두 개를 쓰세요.

- 창 1 (일반 창): `admin`
- 창 2 (시크릿 창): `z3_admin2`

5.2.1 충돌 안내 (`PERM_CONFLICT`)

1. 창 1과 창 2 모두 작업대를 여세요.
2. 창 2: 「역할 기준」에서 `Z2_ROLE_B` 를 고른 후 공지사항 관리를 고르세요.
3. 창 2: 「퍼미션」에서 `changeStatus` 칩을 켜세요.
4. 창 2: 「마지막 저장」이 보일 때까지 기다리세요. 아직 적용하지 마세요.
5. 창 1: 같은 역할·화면을 고른 후 `changeStatus` 칩을 켜세요.
6. 창 1: 「초안 적용」을 누른 후 「적용」을 누르세요.
7. 창 1: 성공 메시지 「초안 1건을 적용했습니다. (PA…)」를 확인하세요.
8. 창 2: 「초안 적용」을 누른 후 「적용」을 누르세요.

8단계의 기대 결과:

- 서버 응답 메시지: `PERM_CONFLICT: role:Z2_ROLE_B`
- 적용 창이 닫힙니다. 초안은 그대로 남습니다.
- 초안 막대에 충돌 안내와 「현재 값 다시 읽기」 버튼이 보입니다. 문구는 둘 중 하나입니다 (`draft.ts:457-460`).
  - 범위 이름을 받은 경우: 「다른 관리자가 먼저 바꾼 범위가 있습니다: 역할 Z2 공지 조회. 초안은 그대로 둡니다. 현재 값을 다시 읽고 초안을 확인한 뒤 다시 적용합니다.」
  - 범위 이름을 받지 못한 경우: 「적용하는 사이 다른 변경과 겹쳤습니다. 초안은 그대로 둡니다. 현재 값을 다시 읽고 초안을 확인한 뒤 다시 적용합니다.」
- 서버는 범위를 메시지 문자열에만 넣습니다. 화면은 `data.scopes` 에서 범위를 읽습니다 (`api.ts` `failureOf`). 그래서 두 번째 문구가 나올 것으로 봅니다. 확인 필요입니다.
- DB: 이력 머리는 창 1의 적용 1줄만 늘어납니다. `z3_admin2` 의 초안은 남아 있습니다 (6.4절).

9. 창 2: 「현재 값 다시 읽기」를 누르세요.

- 기대 결과: 창 2 초안의 `changeStatus` 줄이 이제 현재 값과 같으므로 초안에서 빠집니다 (`draft.ts:286-290` 주석). 초안 막대가 「바꾼 것 없음」이 되는지 확인하세요. 확인 필요입니다.
- 줄이 남아 다시 적용해도 충돌이 나면 「초안 버리기」를 누르세요. 기준 지문은 초안을 버려야 새로 찍힙니다.

5.2.2 잠금 시간 안의 적용 (`PERM_BUSY`)

적용은 범위 행을 `SELECT ... FOR UPDATE WAIT 5` 로 잠급니다 (`PermApplyRepository.java:114`). 사람 손으로 두 적용을 5초 안에 겹치기는 어렵습니다. 그래서 SQL 세션 하나가 잠금을 대신 쥡니다.

> 경고: 아래 잠금은 복제 PDB에서만 쥐세요. 잠금을 쥔 동안 그 역할을 고치는 모든 저장이 기다립니다. 끝나면 반드시 `ROLLBACK;` 을 실행하세요.

1. 창 2: 초안이 비어 있으면 「역할 기준」 `Z2_ROLE_B` × 로그 뷰어에서 「조회」(`search`) 칩을 켜세요. 「마지막 저장」을 기다리세요.
2. SQL 도구에서 자동 커밋을 끄세요.
3. SQL 도구에서 아래 문장을 실행하세요. COMMIT 하지 마세요.

```sql
-- 복제 PDB 전용. Z2_ROLE_B 범위 행을 잠근다
SELECT ROLE_ID FROM TB_MCM_SEC_ROLE WHERE ROLE_ID = 'Z2_ROLE_B' FOR UPDATE;
```

4. 창 2: 「초안 적용」을 누른 후 「적용」을 누르세요.
5. 약 5초 기다리세요.

- 기대 결과(서버): `PERM_BUSY: 다른 적용이 진행 중입니다` (`PermApplyRepository.java:256`, ORA-30006 변환).
- 기대 결과(화면): 오류 메시지 「다른 적용이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.」 (`draft.ts:441-445`). 적용 창은 열린 채로 남습니다.
- DB: 이력 머리가 늘지 않습니다. 초안이 남아 있습니다.

6. SQL 도구에서 `ROLLBACK;` 을 실행하세요.
7. 창 2: 적용 창의 「적용」을 다시 누르세요.

- 기대 결과: 적용됩니다. `z2_empty` 와 `e2e_mdm_none` 이 로그 뷰어 `search` 를 얻습니다. 5.1절 13-16단계대로 실제 로그인을 확인하세요.

참고: 초안 저장도 같은 관리자의 초안 행을 잠급니다. 같은 관리자가 탭 두 개로 동시에 저장하면 `PERM_DRAFT_BUSY: 초안을 동시에 저장했습니다. 다시 시도하세요` 가 날 수 있습니다 (`PermDraftService.java:98`). 화면 문구는 「다른 창에서 같은 초안을 저장하는 중입니다. 잠시 뒤 「다시 저장」을 누릅니다.」입니다.

### 5.3 잃는 사람 재확인 (`PERM_NEED_CONFIRM`)

`z2_user` 만 `Z2_ROLE_A` 를 가집니다. `Z2_ROLE_A` 에서 로그 뷰어 퍼미션을 빼면 `z2_user` 1명이 잃습니다.

1. 창 1(`admin`): 「역할 기준」에서 `Z2_ROLE_A` 를 고른 후 로그 뷰어를 고르세요.
2. 「퍼미션」에서 「조회」(`search`) 칩을 끄세요. 마지막 칩이므로 초안은 퍼미션 빼기(DEL)가 됩니다.
3. 「마지막 저장」을 기다린 후 「초안 영향」을 기록하세요.

- 기대 결과: 잃는 사람 1(`z2_user`), 얻는 사람 0. 「영향받는 사람」에 `z2_user` 의 로그 뷰어 `search` 잃음이 보입니다.

4. 「초안 적용」을 누르세요.
5. 「초안 적용」 창의 「적용」을 누르세요. 이 단계에서는 확인 없이 보냅니다(`confirmLoss = N`).

- 기대 결과(서버): `PERM_NEED_CONFIRM: 1` (`PermApplyService.java:235`).
- 기대 결과(화면): 같은 창이 확인 모양으로 바뀝니다.
  - 「버튼을 잃는 사람이 1명 있습니다. 한 번 더 확인합니다. (1)」
  - 잃는 사람 명단(최대 8명)에 `Z2 일반 사용자` 와 잃는 값
  - 버튼: 「취소」, 「잃는 사람이 있어도 적용」
- DB: 아직 아무것도 바뀌지 않았습니다. 이력 머리가 늘지 않습니다.

6. 「취소」를 누르세요.

- 기대 결과: 창이 닫힙니다. 초안은 남습니다.

7. 「초안 적용」을 다시 누른 후 「적용」을 누르세요.
8. 확인 모양이 다시 나오면 「잃는 사람이 있어도 적용」을 누르세요. 이 단계는 `confirmLoss = Y` 로 보냅니다.

- 기대 결과: 「초안 1건을 적용했습니다. (PA…)」.
- 실제 로그인: `z2_user` 로 다시 로그인하면 메뉴에서 로그 뷰어가 사라집니다. `logViewer/search` → 403.
- DB: `TB_MCM_SEC_ROLE_PERM` 에서 `Z2_ROLE_A` × `logViewer` 줄이 사라집니다. 이력 머리 `LOSE_USER_CNT = 1`, 이력 줄 `ROLE_OBJ`·`DEL`, 전 값 `BTN=search|POPUP=`, 뒤 값 `NULL`.

### 5.4 이력 확인

1. 초안 막대의 「이력」을 누르세요.
2. 「적용 이력」 창의 기간이 오늘 - 30일부터 오늘까지인지 확인하세요.
3. 위 목록에서 5.1-5.3절의 적용 줄을 찾으세요. 칸: 적용 ID, 적용한 사람, 적용 시각, 바꾼 것, 얻는 사람, 잃는 사람, 메모.
4. 줄 하나를 누르세요.
5. 아래 「바꾼 것 — PA…」 목록을 확인하세요. 칸: 순번, 종류, 작업, 대상 1, 대상 2, 전 값, 뒤 값.

- 종류 표시: `USER_GRP` = 「사람 ↔ 그룹」, `GRP_ROLE` = 「그룹 ↔ 역할」, `ROLE_OBJ` = 「퍼미션」.
- 작업 표시: `ADD` = 「더함」, `DEL` = 「뺌」, `UPD` = 「바꿈」.
- 기대 결과: 화면 목록이 6.5절 SQL 결과와 같습니다. 실패한 적용(충돌·BUSY·확인 전)은 이력에 없습니다.
- 기간 최대 366일, 목록 최대 500줄입니다.

## 6. 상태 확인 SQL (읽기 전용)

모두 `SELECT` 입니다. 어느 DB에서 실행해도 자료를 바꾸지 않습니다.

### 6.1 사람 → 그룹 → 역할

```sql
SELECT um.USER_ID, um.ROLE_GROUP_ID, g.USE_TP AS G_USE, rm.ROLE_ID, r.USE_TP AS R_USE
  FROM TB_MCM_SEC_USER_MAPPING um
  JOIN TB_MCM_SEC_ROLEGROUP g ON g.ROLE_GROUP_ID = um.ROLE_GROUP_ID
  LEFT JOIN TB_MCM_SEC_ROLEGROUP_MAPPING rm ON rm.ROLE_GROUP_ID = um.ROLE_GROUP_ID
  LEFT JOIN TB_MCM_SEC_ROLE r ON r.ROLE_ID = rm.ROLE_ID
 WHERE um.USER_ID IN ('admin', 'e2e_mdm_steward', 'e2e_mdm_none', 'z2_user', 'z2_empty', 'z3_admin2')
 ORDER BY um.USER_ID, um.ROLE_GROUP_ID, rm.ROLE_ID;

-- 한 역할을 가진 사람(영향 받을 사람 미리 보기)
SELECT DISTINCT um.USER_ID
  FROM TB_MCM_SEC_ROLEGROUP_MAPPING rm
  JOIN TB_MCM_SEC_USER_MAPPING um ON um.ROLE_GROUP_ID = rm.ROLE_GROUP_ID
 WHERE rm.ROLE_ID = 'Z2_ROLE_B'
 ORDER BY um.USER_ID;
```

### 6.2 퍼미션과 오브젝트 값

```sql
SELECT rp.ROLE_ID, rp.OBJECT_ID, rp.BTN_PERM, rp.POPUP_PERM, o.USE_TP AS OBJ_USE, o.BTN_PERM AS OBJ_BTN, o.POPUP_PERM AS OBJ_POPUP
  FROM TB_MCM_SEC_ROLE_PERM rp
  JOIN TB_MCM_SEC_OBJ o ON o.OBJECT_ID = rp.OBJECT_ID
 WHERE rp.ROLE_ID IN ('Z2_ROLE_A', 'Z2_ROLE_B', 'MDM_STEWARD')
 ORDER BY rp.ROLE_ID, rp.OBJECT_ID;

-- SYSADMIN 은 퍼미션 행이 없어야 합니다(D13). 기대: 0
SELECT COUNT(*) FROM TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'SYSADMIN';
```

### 6.3 메뉴 표시와 오브젝트 사용

```sql
SELECT m.MENU_ID, m.MENU_NM, m.PARENT_MENU_ID, m.OBJECT_ID, m.USE_TP, m.MENU_VIEW_YN, o.USE_TP AS OBJ_USE, o.BTN_PERM AS OBJ_BTN
  FROM TB_MCM_SEC_MENU m
  LEFT JOIN TB_MCM_SEC_OBJ o ON o.OBJECT_ID = m.OBJECT_ID
 WHERE m.OBJECT_ID IN ('noticeMgmt', 'logViewer', 'commPermBench', 'mdmSample')
 ORDER BY m.OBJECT_ID;
```

- 작업대의 `SHOW_TP` 는 `MENU_VIEW_YN` 이 `N` 이면 `N`, 아니면 `Y` 입니다 (`CommPermBenchQueryRepository.java:207`).

### 6.4 초안

```sql
SELECT OWNER_USER_ID, CHANGE_CNT, U_AT, DBMS_LOB.SUBSTR(DRAFT_JSON, 2000, 1) AS DRAFT_JSON, DBMS_LOB.SUBSTR(BASE_FP_JSON, 2000, 1) AS BASE_FP_JSON
  FROM TB_MCM_SEC_PERM_DRAFT
 ORDER BY OWNER_USER_ID;
```

### 6.5 적용 이력

```sql
SELECT APPLY_ID, APPLY_USER_ID, APPLY_AT, CHANGE_CNT, GAIN_USER_CNT, LOSE_USER_CNT, APPLY_MEMO
  FROM TB_MCM_SEC_PERM_HIS
 WHERE APPLY_AT >= TRUNC(SYSDATE)
 ORDER BY APPLY_AT;

SELECT d.APPLY_ID, d.SEQ_NO, d.TARGET_TP, d.KEY1, d.KEY2, d.OP_TP, d.BEFORE_VAL, d.AFTER_VAL
  FROM TB_MCM_SEC_PERM_HIS_DTL d
  JOIN TB_MCM_SEC_PERM_HIS h ON h.APPLY_ID = d.APPLY_ID
 WHERE h.APPLY_AT >= TRUNC(SYSDATE)
 ORDER BY d.APPLY_ID, d.SEQ_NO;
```

- 키 뜻: `USER_GRP` = (사람, 그룹), `GRP_ROLE` = (그룹, 역할), `ROLE_OBJ` = (역할, 오브젝트).
- 적용은 옛 표 `TB_MCM_SEC_PERM`·`TB_MCM_SEC_ROLE_MAPPING` 에 쓰지 않습니다 (D10).

## 7. 시험 자료 되돌리기

### 7.1 PDB 통째로 되돌리기 (권장)

> 경고: 되돌릴 수 없습니다. `drop` 은 그 PDB의 데이터 파일을 지웁니다. 지우는 PDB가 이 런북용 `L_Z2` 인지 확인하세요.

1. 서버를 끄세요(`local-run` 창에서 Ctrl+C).
2. `node scripts/oracle/pdb.mjs drop L_Z2` 를 실행하세요.
3. 다시 쓰려면 `node scripts/oracle/pdb.mjs clone TPL_DATA L_Z2` 를 실행하세요.

- 도구는 `TPL_`·`L_`·`T_` 접두 PDB만 지웁니다. `FREEPDB1` 은 건드리지 않습니다 (`scripts/oracle/README.md` 42행).
- PDB를 남겨 둘 때는 `node scripts/oracle/pdb.mjs close L_Z2` 로 닫으세요. 열린 PDB 자리는 PC 전체가 나눠 씁니다.

### 7.2 SQL로 지우기 (PDB를 지울 수 없을 때)

> 경고: 복제 PDB 전용입니다. 되돌릴 수 없습니다. 이력 표의 오늘 줄을 지웁니다. 다른 사람이 같은 PDB에서 오늘 적용한 이력도 함께 지워집니다. 실행하기 전에 6.5절 SQL로 지울 줄을 확인하세요.

1. 4.2절 사례에서 바꾼 오브젝트·메뉴·역할·그룹 값을 되돌렸는지 6.2·6.3절 SQL로 확인하세요.
2. 아래 SQL을 실행하세요.
3. `COMMIT;` 을 실행하세요.
4. 백엔드를 다시 띄우세요.

```sql
-- 복제 PDB 전용. 되돌릴 수 없음
DELETE FROM TB_MCM_SEC_PERM_DRAFT WHERE OWNER_USER_ID IN ('admin', 'z3_admin2');
DELETE FROM TB_MCM_SEC_PERM_HIS_DTL WHERE APPLY_ID IN
    (SELECT APPLY_ID FROM TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID IN ('admin', 'z3_admin2') AND APPLY_AT >= TRUNC(SYSDATE));
DELETE FROM TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID IN ('admin', 'z3_admin2') AND APPLY_AT >= TRUNC(SYSDATE);
DELETE FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID IN ('z2_user', 'z2_empty', 'z3_admin2')
    OR (USER_ID = 'e2e_mdm_none' AND ROLE_GROUP_ID LIKE 'Z2\_%' ESCAPE '\');
DELETE FROM TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID IN ('Z2_ROLE_A', 'Z2_ROLE_B');
DELETE FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID IN ('Z2_RG_A', 'Z2_RG_A2', 'Z2_RG_B');
DELETE FROM TB_MCM_SEC_ROLEGROUP WHERE ROLE_GROUP_ID IN ('Z2_RG_A', 'Z2_RG_A2', 'Z2_RG_B');
DELETE FROM TB_MCM_SEC_ROLE WHERE ROLE_ID IN ('Z2_ROLE_A', 'Z2_ROLE_B');
DELETE FROM TB_MCM_SEC_USER_PWD WHERE USER_ID IN ('z2_user', 'z2_empty', 'z3_admin2');
DELETE FROM TB_MCM_SEC_USER WHERE USER_ID IN ('z2_user', 'z2_empty', 'z3_admin2');
-- 사례 4를 SQL로 했으면 오브젝트 값도 되돌린다
UPDATE TB_MCM_SEC_OBJ SET BTN_PERM = 'changeStatus,save,search' WHERE OBJECT_ID = 'noticeMgmt';
```

- 화면 쪽 시험 자료(예: 로그인 이력, 화면 사용 기록, 버튼 권한 캐시)가 다른 표에 남을 수 있습니다. 어느 표에 남는지는 확인 필요입니다. 깨끗한 상태가 필요하면 7.1절을 쓰세요.
- e2e 픽스처 계정(`e2e_mdm_*`)은 지우지 않습니다. 지우는 방법은 e2e 픽스처 문서를 따르세요.

## 8. 확인 필요 목록

| 번호 | 내용 | 근거·확인 방법 |
|---|---|---|
| 1 | 기준 커밋의 작업대는 가짜 자료(`USE_MOCK = true`)입니다. 실연결 커밋 또는 로컬 임시 변경이 있어야 z2·z3를 할 수 있습니다 | `page.tsx:40`, `lanes/perm-fe.md` 남은 일 3 |
| 2 | 실연결 뒤 `ME_SYSADMIN` 으로 SYSADMIN 잠금이 풀리는지 | `useBenchState.ts:62-68` TODO |
| 3 | `explain` 응답에서 버튼 줄의 정확한 칸 경로 | Network 탭에서 확인 |
| 4 | 공지사항 관리 「삭제」(`delete`)가 SYSADMIN 에게도 꺼지고 403 인지 | 오브젝트 값에 `delete` 없음(`ObjPermCatalog.java:57`) |
| 5 | 로그 뷰어 화면의 버튼과 `anl` 폴더 이름 | 화면을 열어 확인 |
| 6 | 권한을 바꾼 뒤 다시 로그인하지 않아도 버튼이 바뀌는지 | `use-user-button-rbac.ts` 캐시 |
| 7 | 메뉴 관리(`commMenuMng`) 저장 뒤 메뉴가 바로 바뀌는지. 이 서비스는 `RoleChangedEvent` 를 내지 않습니다 | `RoleChangedEvent` 발행 서비스 목록에 없음 |
| 8 | 숨긴 화면을 주소로 여는 방법 | 사례 3 |
| 9 | OBJECT 관리가 퍼미션에서 쓰는 값을 빼는 저장을 막는지 | 사례 4 |
| 10 | PERMISSION 관리의 `PERM_EMPTY_BTN` 화면 문구 | 사례 6-a |
| 11 | 화면으로 계정·역할·그룹을 만드는 정확한 입력 순서 | 2.4절 화면 경로 |
| 12 | 충돌 안내가 범위 이름 문구인지 일반 문구인지(서버가 `data.scopes` 를 주지 않음) | 5.2.1절 8단계 |
| 13 | 충돌 뒤 「현재 값 다시 읽기」가 같은 값이 된 초안 줄을 지우는지 | 5.2.1절 9단계 |
| 14 | 「바뀌는 화면」 수를 세는 방식 | 5.1절 타일 |
| 15 | SQL 되돌리기 뒤 다른 표에 남는 시험 흔적 | 7.2절 |
