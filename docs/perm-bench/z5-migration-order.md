# z5 — mcmapuser Flyway 번호 충돌 점검 (dev 머지 준비)

- 작성: perm-core 레인, 2026-11-27
- 범위: git·파일 읽기만. gradle·DB 접속 없음.
- 기준: `git fetch --all` 직후. origin/dev = `2619dea69`, origin/claude/perm-bench = `998f1fec7`.
- 대상 폴더: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/`

## 1. 조사 방법

| 조사 | 명령 | 결과 |
|---|---|---|
| dev 의 V 파일 | `git ls-tree origin/dev <폴더>/` | V1~V17 (빠진 번호 없음) |
| 원격 브랜치 전체의 V18·V19·V2x | `refs/remotes/*` 마다 `git ls-tree` 후 `^V(1[89]\|2[0-9])__` 거르기 | V20·V21 만 나옴. V18·V19 없음 |
| 이력 전체의 V18·V19 | `git log --all -- <폴더>/V18* <폴더>/V19*` | 0건 (지운 이력도 없음) |
| 이 PC 워크트리 | `git worktree list` 의 각 폴더 `ls` | dmes-standard(dev): V17 까지. dmes-perm-w2: V20·V21(perm-bench 와 같음) |
| 다른 위치의 V18 | `git log --all --name-only` 에서 `db/migration/*/V1[89]__` | sqlite 폴더 2건만 있음. Oracle mcmapuser 와 이력이 따로라 상관없음 |

`V2*` 는 `V2__upper_function_indexes.sql`(dev·perm-bench 공통, 이미 머지됨)도 걸리지만 충돌 대상이 아니다.

## 2. 결과

### 2-1. dev 의 마지막 번호

- origin/dev 의 마지막 mcmapuser 번호는 **V17** `V17__retire_legacy_master_programs.sql` 이다(`2a54fbab3`, 2026-10-20).
- merge-base(`2619dea69`) 이후 dev 에 mcmapuser V 파일을 더한 커밋은 없다.

### 2-2. V18·V19 를 가진 브랜치·커밋

| 위치 | V18 | V19 | 비고 |
|---|---|---|---|
| origin/dev | 없음 | 없음 | |
| origin/claude/perm-bench | 없음 | 없음 | V20·V21 만 있음 |
| 다른 원격 브랜치 전체 | 없음 | 없음 | V20 이 있는 브랜치: perm/perm-bench-be, perm/perm-fe(-2~-5), perm/perm-legacy-be(-2). 모두 perm-bench 계열 |
| git 이력(`--all`) | 없음 | 없음 | 만들었다 지운 흔적도 없음 |
| 이 PC 메인 체크아웃(dev, 변경 없음) | 없음 | 없음 | |

결론: **원격 없음**. D20 의 「V18·V19 는 다른 브랜치 미커밋」은 조정자 PC 메인 체크아웃(claude/mdm-domain-delete)의 미커밋 파일일 수 있다. 조정자가 그 PC 에서 `git status` 로 확인해야 한다.

### 2-3. perm-bench 의 V20·V21

| 파일 | 내용 요약 |
|---|---|
| `V20__perm_model.sql` | TB_MCM_SEC_ROLE_PERM·SEC_PERM_DRAFT·SEC_PERM_HIS·SEC_PERM_HIS_DTL 을 만들고, TB_MCM_SEC_OBJ 에 BTN_PERM·POPUP_PERM·DATA_PERM 을 더한다(INVISIBLE→VISIBLE 로 PARAM 뒤에 놓음). |
| `V21__perm_model_backfill.sql` | 옛 권한 행을 ROLE_PERM 으로 옮기는 MERGE 2개(SYSADMIN·ROLE_SYSADMIN 은 정확 일치로 빼고), SEC_OBJ 허용값을 비어 있을 때만 채운다. |

## 3. Flyway 설정

`McmSchemaMigrator.migrate`(src/backend/mcm/lib) 는 `outOfOrder`·`ignoreMigrationPatterns`·`validateOnMigrate` 를 정하지 않는다. 그래서 Flyway 기본값을 쓴다.

- `outOfOrder=false`
- `validateOnMigrate=true`
- `ignoreMigrationPatterns="*:future"`

따라서 V20·V21 이 적용된 DB 에 나중에 V18·V19 가 들어오면, migrate 시작의 validate 가 「Detected resolved migration not applied to database: 18」로 실패한다. 번호가 비는 것(V17 다음 V20) 자체는 실패하지 않는다.

## 4. dev 머지 시 경우의 수

| # | 경우 | V18·V19 상태 | outOfOrder=false 결과 | 권장 |
|---|---|---|---|---|
| A | V18·V19 가 영영 안 생김 (미커밋 파일 폐기, 또는 다른 번호로 감) | 없음 | 실패 없음. V17 → V20 → V21 로 적용 | **그대로** 머지 |
| B | V18·V19 브랜치가 perm-bench 보다 **먼저** dev 에 들어감 | dev 에 V18·V19 | 실패 없음. V17 → V18 → V19 → V20 → V21 | **순서 지정**: 그 브랜치 먼저 머지 |
| C | perm-bench 가 먼저 들어가고, V18·V19 가 **나중에** 들어감 | dev 에 V20·V21 후 V18·V19 | V20·V21 을 이미 적용한 DB(레인 PDB·l_main·TPL_*)는 validate 실패. 새 DB 는 문제없음 | 그 브랜치가 **번호를 V22 이상으로 재조정**. perm-bench 의 V20·V21 은 머지 후 못 고친다 |
| D | V18·V19 가 같은 표(SEC_OBJ·SEC_ROLE 등)를 건드림 | 상관없음 | 번호와 별개로 DDL 충돌 가능(같은 컬럼 추가, 컬럼 순서 재배치 충돌) | 내용 대조 후 결정. 지금은 파일이 없어 판정 불가 |
| E | perm-bench 를 머지 전에 V18·V19 로 당김 | V18·V19 를 perm-bench 가 차지 | 다른 브랜치의 미커밋 V18·V19 와 바로 충돌 | **비권장**. 문서·시험·ADR 의 V20·V21 언급도 함께 고쳐야 함 |

### 권장안

1. 조정자 PC 에서 claude/mdm-domain-delete 체크아웃의 `git status -- src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/` 를 확인한다.
2. 미커밋 V18·V19 가 **없으면** → 경우 A. perm-bench 를 그대로 dev 에 머지한다.
3. **있고 곧 커밋할 예정이면** → 경우 B. 그 브랜치를 먼저 dev 에 머지한 뒤 perm-bench 를 머지한다. 머지 전에 경우 D(같은 표 DDL)를 확인한다.
4. **있지만 일정이 늦으면** → 경우 C. perm-bench 를 먼저 머지하고, 그 브랜치의 V18·V19 를 V22·V23 으로 바꾸라고 알린다(미커밋이라 바꾸는 비용이 작다).

V20·V21 을 적용한 DB 는 지금 레인의 임시 clone PDB 뿐이다(perm-core 기준). 다른 레인이 자기 레인 PDB 에 적용했는지는 이 문서 범위 밖이다. 경우 C 로 가면 그 PDB 는 다시 만들거나 버린다.
