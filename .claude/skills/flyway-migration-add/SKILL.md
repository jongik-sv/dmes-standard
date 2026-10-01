---
name: flyway-migration-add
description: "Flyway 마이그레이션을 추가할 때 방언(Oracle·PostgreSQL·SQLite·MSSQL 등) 간 안전한 버전 번호를 채번하고 파일을 스캐폴딩합니다. aps-core/mcm-core 등 모듈의 스키마를 바꿀 때(엔티티·컬럼·인덱스·제약 추가/변경) 사용합니다. 방언별로 번호를 따로 고르면 같은 번호가 서로 다른 변경을 가리키는 드리프트가 생깁니다."
---

# Flyway 마이그레이션 추가 (dmes-standard)

정본 규칙: 이 문서. 모듈의 `db/migration/README.md` 에 결번 대장이 있으면 그것도 정본이다.

핵심 불변식:

> **동일한 버전 번호는 모든 방언 폴더에서 동일한 논리 변경을 가리켜야 한다.**

Flyway 는 location 별로 이력을 독립 관리하므로 번호가 어긋나도 부팅은 성공한다.
그래서 드리프트가 조용히 쌓인다 — 문서·ADR·커밋에서 "V61" 을 인용하는 순간 어느
DDL 인지 모호해진다.

## 0. 방언 폴더 구성

DB 구성은 **로컬·자동 테스트 = SQLite, 운영 = 고객사가 확정하는 방언**이다. 운영 방언은 주로
Oracle 또는 PostgreSQL 이고 MSSQL 인 경우도 있다. 운영 방언이 정해지지 않은 모듈은 SQLite 한 벌만
둔다(예: mdm — [ADR-0004](../../../docs/mdm/adr/0004-drop-mssql-production-assumption.md)).

| 폴더 | 역할 | 비고 |
|---|---|---|
| `sqlite/` | 로컬·자동 테스트 | 거의 모든 모듈에 있다 |
| `oracle/` · `postgresql/` | 운영 방언 | 고객사 확정 시 추가 |
| `mssql/` (또는 `sqlserver/`) | 운영 방언 | 고객사가 MSSQL 일 때만 |
| `{모듈명}/` · `common/` | 공통(방언 무관) 위치 | 템플릿의 샘플 모듈이 이 모양이다 |

Spring Boot 의 `spring.flyway.locations=classpath:db/migration/{vendor}` 자리표시자를 쓰면 폴더 이름은
`oracle`·`postgresql`·`sqlite`·`sqlserver` 가 된다. 이 경우 MSSQL 폴더는 `mssql` 이 아니라 `sqlserver` 다.

## 1. 이 스킬이 하는 일과 하지 않는 일

**한다** — 작성 시점의 채번·스캐폴딩. 잘못된 번호를 고르는 것 자체를 막는다.

**하지 않는다** — 검사. 방언이 둘 이상인 고객사 프로젝트는 아래 테스트를 갖춘다(템플릿에는 없다).
이 도구로 그 검사를 대신하지 말 것:

| 테스트(예시 이름) | 검사 대상 |
|---|---|
| `MigrationVersionIntegrityTest` | 방언 내 중복 번호 + sqlite 체인 실제 실행 |
| `CrossDialectVersionSyncTest` | 모든 방언의 버전 집합 일치 (결번 대장 `KNOWN_GAP_LEDGER` 제외) |
| `CleanLineageIntegrityTest` | 결번 재유입·placeholder 회귀 |

## 2. 채번

```bash
python3 .claude/skills/flyway-migration-add/scripts/migration_tool.py status --module aps-core
```

`--module` 은 `src/backend/{모듈}/…/db/migration` 또는 `src/backend/{모듈}/api/…/db/migration` 을
찾는다(`mdm` 처럼 `db/migration/mdm/sqlite/` 로 한 단 더 들어간 모양도 푼다).

번호는 **모든 방언 폴더와 공통 폴더를 함께 본 뒤 어디에도 없는 번호**로 정한다.
방언별로 "다음 빈 번호" 를 따로 고르면 안 된다 — 이것이 V61/V62 드리프트의 원인이었다.

예: oracle 최대 V90, sqlite 최대 V88 이면 sqlite 만 보고 V89 를 고르게 되는데, 그 번호는 이미
oracle 의 방언 보정이 쓰고 있을 수 있다. `status` 가 이 충돌을 경고하고, 방언별로 빠진 번호를 보여 준다.

## 3. 스캐폴딩

모든 방언 공통 변경 (대부분의 경우):

```bash
python3 .../migration_tool.py scaffold --module aps-core --slug add_foo_column --title "foo 컬럼 추가"
```

방언 폴더가 있으면 그 전부에, 없으면 공통 폴더에 같은 번호로 만든다. 공통 폴더와 방언 폴더가
함께 있는 모듈(예: `mcm-core` — 공통 폴더는 다른 모듈 위치와 함께 로드되고 `sqlite/` 는 이력 참고용)은
도구가 대상을 고르지 않고 멈춘다. 모듈 `application.yml` 의 `spring.flyway.locations` 와 주석에서 런타임
체인을 확인한 뒤 `--dialect <폴더>` 로 명시한다. 방언마다 DDL 이 달라지는
부분(자료형·자동 증가·upsert 등)은 [방언 중립 SQL 규칙](../../../docs/guide/Database/dialect-neutral-sql.md)을
따라 각 파일에서 고쳐 쓴다.

일부 방언에만 필요한 보정:

```bash
python3 .../migration_tool.py scaffold --module aps-core --slug fk_parity --dialect oracle
python3 .../migration_tool.py scaffold --module aps-core --slug seq_fix --dialect oracle,postgresql
```

`--dialect` 에서 빠진 방언의 번호는 **결번으로 남긴다.** 채우기 위한 no-op 파일을 만들지 않는다.

새 운영 방언을 추가할 때는 먼저 `db/migration/{방언}/` 폴더를 만들고, 기존 sqlite 체인과 같은 번호
체계로 baseline 을 작성한다(기존 번호 중 그 방언에 불필요한 것은 결번 대장에 등재).

## 4. 결번을 남길 때 — 3 곳을 함께 갱신한다

일부 방언 마이그레이션은 등재가 따라온다. 하나라도 빠지면 버전 일치 테스트가 실패한다.

1. 빠진 방언 각 폴더의 **다음 번호 파일 헤더 주석**에 사유
2. 모듈 `db/migration/README.md` 의 **"결번 대장" 표**에 행 추가 (없으면 만든다)
3. 버전 일치 테스트를 둔 프로젝트는 `CrossDialectVersionSyncTest.KNOWN_GAP_LEDGER` 에 등재

2 와 3 이 어긋나면 테스트가 실패한다 — 어느 한쪽만 고치지 말고 함께 유지한다.

결번 사유에는 **빠진 방언이 이미 목표 상태에 도달한 근거**(어느 버전에서 도달했는지)를
반드시 적는다. 예: "sqlite head 는 V50/V69/V83 에서 이미 동일 상태".

## 5. 영구 결번 — 재유입 금지

통합 baseline(`V1__init.sql`)이 여러 번호의 논리 효과를 흡수했다면, 그 번호들은 **모든 방언에서 영구 결번**이다.
결번 대장에 "영구" 로 적고 다시 채우지 않는다 — 채우면 baseline 과 논리 효과가 중복 실행된다.
채번을 항상 합집합 max+1 로 하므로 정상 경로에서는 저촉되지 않는다.

## 6. 작성 후 검증

모듈의 마이그레이션 테스트를 돌린다. Gradle 경로는 모듈 구조에 따라 다르다.

```bash
# aps-core·mcm-core 처럼 모듈 자체가 Gradle 프로젝트인 경우
JAVA_HOME=~/.sdkman/candidates/java/21.0.10-sapmchn ../gradlew :aps-core:test
# mdm 처럼 api/ 하위 프로젝트인 경우 (src/backend/mdm 에서) — 실재 테스트: Mdm*MigrationTest
../gradlew :api:test --tests '*MigrationTest'
```

`--tests` 필터에 맞는 테스트가 없으면 Gradle 이 "No tests found" 로 실패한다. 템플릿의 aps-core·mcm-core 에는
마이그레이션 테스트가 없으므로 필터 없이 돌리고, `*CrossDialect*` 필터는 버전 일치 테스트를 둔 프로젝트만 쓴다.
aps-core 는 JDK 21 로 빌드한다. 운영 방언(Oracle·PostgreSQL·MSSQL) 실측은 컨테이너가 필요하므로
워커가 아니라 팀장의 방언 검증(`.dflow` 의 `dialect_check`)이나 사람이 돌린다.
sqlite 에서 Flyway 를 켜는 런타임은 `spring.flyway.mixed=true` 가 필수다 — 테이블 재생성 마이그가
PRAGMA(비트랜잭션)와 DDL 을 한 파일에 섞기 때문이다.

## 7. 방언별 함정

- **SQLite 테이블 재생성은 이름 기반 컬럼 매핑**: SQLite 는 `ALTER COLUMN` 이 없어 NOT NULL 부여 등에
  테이블 재생성이 필요하다. 이때 **`INSERT INTO new SELECT * FROM old` 를 쓰지 말 것** — 컬럼 순서에 의존해
  데이터가 엉뚱한 컬럼으로 들어간다. 반드시 컬럼명을 명시한다. (V78 에서 이 결함으로 실제 데이터 유실이
  발생했다. local 환경은 Flyway 가 꺼져 있고 `ddl-auto` 가 만든 컬럼 순서가 마이그레이션 기준과 달라서,
  운영에서만 드러나는 종류다.)
- **Oracle DDL 은 자동 커밋**: Oracle 은 DDL 마다 암묵 커밋하므로 한 파일 안에서 실패하면 앞부분만 적용된
  상태로 남는다. 파일을 작게 나누고, 재실행에 안전하게 쓴다. 빈 문자열 `''` 은 NULL 로 저장되므로
  `NOT NULL DEFAULT ''` 는 쓰지 않는다. 식별자는 따옴표 없이 대문자로 저장된다.
- **PostgreSQL DDL 은 트랜잭션 안에서 롤백된다**: 대신 `CREATE INDEX CONCURRENTLY` 처럼 트랜잭션 밖에서만
  되는 문장은 다른 DDL 과 섞지 말고 별도 파일로 둔다. 따옴표 없는 식별자는 소문자로 저장된다.
- **MSSQL**: `CREATE PROCEDURE`·`CREATE TRIGGER` 처럼 배치의 첫 문장이어야 하는 구문은 앞뒤를 `GO` 로 끊는다.

## 8. 도구 자체 검증

```bash
python3 .claude/skills/flyway-migration-add/scripts/selftest.py
```

채번 로직을 고쳤으면 반드시 다시 돌린다. 임시 픽스처에 oracle·postgresql·sqlite 3 방언의 비대칭을 심어
합집합 채번이 실제로 충돌을 피하는지 확인한다.
