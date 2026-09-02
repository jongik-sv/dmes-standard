---
name: flyway-migration-add
description: "Flyway 마이그레이션을 추가할 때 방언 간 안전한 버전 번호를 채번하고 파일을 스캐폴딩합니다. aps-core/mcm-core 의 스키마를 바꿀 때(엔티티·컬럼·인덱스·제약 추가/변경) 사용합니다. 방언별로 번호를 따로 고르면 같은 번호가 서로 다른 변경을 가리키는 드리프트가 생깁니다."
---

# Flyway 마이그레이션 추가 (dmes-standard)

정본 규칙: [mssql/README.md](../../../src/backend/aps-core/src/main/resources/db/migration/mssql/README.md)

핵심 불변식:

> **동일한 버전 번호는 양 dialect 에서 동일한 논리 변경을 가리켜야 한다.**

Flyway 는 location 별로 이력을 독립 관리하므로 번호가 어긋나도 부팅은 성공한다.
그래서 드리프트가 조용히 쌓인다 — 문서·ADR·커밋에서 "V61" 을 인용하는 순간 어느
DDL 인지 모호해진다.

## 1. 이 스킬이 하는 일과 하지 않는 일

**한다** — 작성 시점의 채번·스캐폴딩. 잘못된 번호를 고르는 것 자체를 막는다.

**하지 않는다** — 검사. 이미 테스트 3종이 한다. 중복 구현하지 말 것:

| 테스트 | 검사 대상 |
|---|---|
| `MigrationVersionIntegrityTest` | 방언 내 중복 번호 + sqlite 체인 실제 실행 |
| `CrossDialectVersionSyncTest` | V22+ 양 방언 버전 집합 일치 (결번 대장 제외) |
| `CleanLineageIntegrityTest` | 결번 재유입·placeholder 회귀 |

## 2. 채번

```bash
python3 .claude/skills/flyway-migration-add/scripts/migration_tool.py status --module aps-core
```

번호는 **`mssql/` 과 `sqlite/` 를 함께 본 뒤 두 곳 모두 비어 있는 번호**로 정한다.
방언별로 "다음 빈 번호" 를 따로 고르면 안 된다 — 이것이 V61/V62 드리프트의 원인이었다.

실제로 지금 그 함정이 살아 있다. mssql 최대 V90, sqlite 최대 V88 이라 sqlite 만 보면
V89 를 고르게 되는데, 그 번호는 이미 mssql 의 방언 보정이 쓰고 있다. `status` 가 이 충돌을
경고한다.

## 3. 스캐폴딩

양 방언 공통 변경 (대부분의 경우):

```bash
python3 .../migration_tool.py scaffold --module aps-core --slug add_foo_column --title "foo 컬럼 추가"
```

한쪽 방언에만 필요한 보정:

```bash
python3 .../migration_tool.py scaffold --module aps-core --slug fk_parity --dialect mssql
```

`--dialect` 를 쓰면 반대쪽 번호는 **결번으로 남긴다.** 채우기 위한 no-op 파일을 만들지 않는다.

## 4. 결번을 남길 때 — 3 곳을 함께 갱신한다

단일 방언 마이그레이션은 등재가 따라온다. 하나라도 빠지면 `CrossDialectVersionSyncTest`
가 실패한다.

1. 반대쪽 방언의 **다음 번호 파일 헤더 주석**에 사유
2. `mssql/README.md` 의 **"결번 대장" 표**에 행 추가
3. `CrossDialectVersionSyncTest.KNOWN_GAP_LEDGER` 에 등재

2 와 3 이 어긋나면 `CrossDialectVersionSyncTest` 가 실패한다. 정본 README 의 절차
항목 3 과 동일한 내용이다 — 어느 한쪽만 고치지 말고 함께 유지한다.

결번 사유에는 **반대쪽이 이미 목표 상태에 도달한 근거**(어느 버전에서 도달했는지)를
반드시 적는다. 기존 대장 항목들이 그 형식이다 — 예: "sqlite head 는 V50/V69/V83/V86 에서
이미 동일 상태".

## 5. 영구 결번 — 재유입 금지

`V2`~`V21`, `V32` 는 통합 baseline(`V1__init.sql`)이 논리 효과를 흡수해 **양쪽 영구 결번**이다.
이 번호를 다시 채우면 baseline 과 논리 효과가 중복 실행된다 (ADR-0058 D8-6 위반).
채번을 항상 합집합 max+1 로 하므로 정상 경로에서는 저촉되지 않는다.

## 6. 작성 후 검증

```bash
JAVA_HOME=~/.sdkman/candidates/java/21.0.10-sapmchn \
  ../gradlew :aps-core:test --tests '*Migration*' --tests '*CrossDialect*'
```

aps-core 는 JDK 21 로 빌드한다. sqlite 에서 Flyway 를 켜는 런타임은
`spring.flyway.mixed=true` 가 필수다 — 테이블 재생성 마이그가 PRAGMA(비트랜잭션)와
DDL 을 한 파일에 섞기 때문이다.

## 7. 테이블 재생성 마이그는 이름 기반 컬럼 매핑

SQLite 는 `ALTER COLUMN` 이 없어 NOT NULL 부여 등에 테이블 재생성이 필요하다.
이때 **`INSERT INTO new SELECT * FROM old` 를 쓰지 말 것** — 컬럼 순서에 의존해
데이터가 엉뚱한 컬럼으로 들어간다. 반드시 컬럼명을 명시한다.

V78 에서 이 결함으로 실제 데이터 유실이 발생했다. local 환경은 Flyway 가 꺼져 있고
`ddl-auto` 가 만든 컬럼 순서가 마이그레이션 기준과 달라서, 운영에서만 드러나는 종류다.

## 8. 도구 자체 검증

```bash
python3 .claude/skills/flyway-migration-add/scripts/selftest.py
```

채번 로직을 고쳤으면 반드시 다시 돌린다. 임시 픽스처에 방언 비대칭을 심어
합집합 채번이 실제로 충돌을 피하는지 확인한다.
