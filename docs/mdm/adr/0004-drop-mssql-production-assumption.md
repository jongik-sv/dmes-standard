# ADR-0004: MDM 운영 DB 를 MSSQL 로 가정하지 않는다 — 운영 DB 미정, 로컬·테스트는 SQLite

- **Status**: ACCEPTED
- **Date**: 2026-09-26
- **Decision Date**: 2026-09-26
- **Context Tags**: MDM, DB, DIALECT

## 쉬운 설명 (현업용 요약)

표준 원장(마루 MDM)을 실제 운영할 때 어떤 데이터베이스를 쓸지는 아직 정해지지 않았다.
그동안 설계와 개발은 운영 데이터베이스가 특정 제품일 것이라고 미리 가정하고, 그 제품용
표 생성 스크립트와 확인 절차를 따로 만들어 두었다. 가정이 확정된 사실이 아닌데 두 벌을 계속
맞춰 가느라 작업이 늘고, 실제로 확인하지 못한 항목도 쌓였다.

그래서 그 가정을 MDM 에서 모두 걷어 낸다. 개발자 PC 와 자동 테스트는 지금처럼 가벼운 데이터베이스
하나로 동작한다. 운영 데이터베이스가 정해지면 그때 그 제품에 맞는 규칙과 스크립트를 더한다.
다른 모듈(MES·기존 ERP 분석 등)은 이 결정과 관계없이 지금 그대로다.

## Context (배경)

- [ADR-0001](0001-physical-naming-audit-dialect.md) 은 "운영은 MSSQL, 로컬은 SQLite" 를 전제로 방언 규칙표
  ([naming-dialect-rules.md](../naming-dialect-rules.md) §3)를 두 방언 짝으로 세웠다. 그 결과 mdm 에는
  `db/migration/mdm/mssql` 마이그레이션, `mssqlTest` 소스셋(Testcontainers MSSQL), 두 방언 대조 테스트
  4종(버전 집합 1·DDL 3), `local-db`(MSSQL 직결) 프로필, 머지 뒤 팀장 방언 검증(`.dflow` 의 `dialect_check`)이 생겼다.
- 워커는 도커를 쓰지 않으므로 MSSQL 쪽은 대부분 "DDL 텍스트 대조로 대체, 실측 필요 유지" 로 남았다. 확인되지
  않은 전제가 규칙표와 테스트에 누적됐다.
- 사용자 결정(2026-09-26): **MDM 모듈의 운영 DB 는 정해지지 않았다.** MSSQL 을 운영 DB 로 가정한 내용을
  MDM 범위에서 모두 삭제한다. 로컬·테스트 DB 는 SQLite 그대로다(mdm 테스트는
  H2 를 쓰지 않는다).
- MES 모듈(mcm·mls 등)과 레거시(SampleErp) 분석 체계는 MSSQL 을 실제로 쓰므로 이 결정의 범위가 아니다.

## Decision (결정)

- **D1 운영 DB 미정**: mdm 은 운영 DB 제품을 가정하지 않는다. 현행 정본(PRD·TRD·규칙표·ERD·계약 문서·코드
  주석·설정)에서 "운영 = MSSQL" 서술을 지우고 "운영 DB 미정(로컬·테스트는 SQLite)" 으로 적는다. `decisions.md`
  와 `tasks/**` 는 추가 전용 이력이라 고치지 않는다 — 그 안의 MSSQL 관련 결정·기록은 이 ADR 이 번복 근거다.
- **D2 MSSQL 산출물 삭제**: `db/migration/mdm/mssql`, `api/src/mssqlTest`, `mssqlMigrationTest` 태스크와
  MSSQL 전용 의존성(mssql-jdbc·flyway-sqlserver·testcontainers-mssqlserver·testcontainers-junit-jupiter),
  `application-local-db.yml`, ERD 의 `*.mssql.sql` 과 ERD 검증 도구(`erd/verify/Verify.java`)의 MSSQL 경로, `.dflow` 의 `dialect_check` 를 삭제한다. 두 방언 대조만이 목적이던 테스트
  (`MdmFlywayVersionParityTest`·`*DdlParityTest` 3종)도 삭제한다. SQLite 쪽 구조·타입·제약은 기존
  `*MigrationTest` 가 실제 SQLite DB 로 검증한다.
- **D3 방언 이음매 유지**: 방언 판정(`MdmDialect`·`MdmDialectResolver`)과 방언별 문안 자리는 지우지 않고
  `SQLITE` 값 하나로 남긴다. 방언 분기는 `switch` 로 써서 운영 DB 값을 더하면 컴파일러가 빠진 분기를 알린다.
- **D4 wildfly 프로필**: JNDI 데이터소스와 Flyway 비활성은 그대로 두고, MSSQL 방언 지정과 `mssql` 이 든 JNDI
  기본 이름만 뺀다(Hibernate 방언은 연결 메타데이터로 자동 판정). 기본 JNDI 이름은 리포 규약
  `java:/jdbc/mssql/{모듈}/{DS}`(mcm 선례)에서 제품명 단을 뺀 `java:/jdbc/mdm/dsBiz` 로 벗어난다. WAS 데이터소스는
  이 이름으로 등록하거나 `JNDI_DS_BIZ` 로 넘긴다.
- **D5 ADR-0001 과의 관계**: 이 ADR 은 ADR-0001 의 **MSSQL 부분만 대체**한다. ADR-0001 본문은 고치지 않고,
  ADR-0001 이 Trigger 로 ACCEPTED 되더라도 아래 대체 부분은 이 ADR 이 우선한다.
  - **대체**: Context 의 "운영은 MSSQL" 전제, 쉬운 설명 둘째 문단의 "로컬·운영 DB 문법 차이" 전제, D1 의
    "MSSQL 은 접속 계정의 기본 스키마", D3 의 "두 방언에서 확인", D5 의 MSSQL 코드·키 칼럼 BIN2 지정,
    Consequences 의 "두 방언에서 모두 동작한다고 가정하지 않는다"·"MSSQL 코드·키 칼럼이 대소문자를 구분" 문장의
    MSSQL 주어(SQLite 기본 BINARY 비교라 결과 자체는 같다).
  - **보류**(방언이 둘이 될 때 다시 적용): D4 의 "방언별 문안은 같은 리포지토리 안에 짝으로 둔다", "두 방언 V 번호
    집합을 항상 같게 유지한다"(규칙표 §4·§5).
  - **유효**: 물리 명명(D1 나머지), 감사 칼럼(D2), 규칙표 정본·검증 상태 기록(D3 의 나머지), 영속성 수단(D4 의
    JPA 1순위·MyBatis 미사용·방언 판정 한 곳), 코드·키 칼럼 대소문자 구분 비교라는 목표(D5 의 취지).

## Consequences (결과)

- **wildfly(dev·prod) 프로필은 운영 DB 방언이 `MdmDialect` 에 더해지기 전까지 기동되지 않는다** — 방언 판정 빈이
  SQLite 가 아닌 DB 에서 기동 시 예외를 낸다. 운영 DB 를 정하는 ADR 이 방언 값·판정·문안을 함께 더해야 배포할 수
  있다(의도한 결과: 확인되지 않은 방언으로 조용히 도는 것을 막는다).
- 규칙표 §1(스키마 접두·식별자 길이 근거)·§3·§4·§5 가 SQLite 기준으로 바뀐다. §3 은 SQLite 규칙과 SQLite 실측 기록만 남는다. 운영 DB 가 정해지면 그 방언 열·마이그레이션 폴더·
  검증 테스트를 새 ADR 과 함께 더한다(이번에 지운 파일은 git 이력에서 참고할 수 있다).
- 팀장의 머지 뒤 방언 검증 단계가 mdm 에서 사라진다. dflow 스킬의 방언 검증 스크립트는 `dialect_check` 가
  비면 `DIALECT_NONE` 으로 건너뛴다(스킬 정의는 이 리포 밖이라 고치지 않았다). `.dflow.local` 이나 환경 변수로
  `dialect_check` 를 덮어 둔 PC 는 그 값도 지워야 한다(남기면 없는 태스크를 불러 실패한다).
- SQLite 마이그레이션 `V1`·`V2`·`V9` 의 주석만 바뀌어 Flyway 체크섬이 달라진다. 이미 마이그레이션한 로컬
  `../data/mdm.db` 는 지우고 다시 기동해 새로 만드는 것이 기본이다(스키마는 같다. Flyway CLI 가 있으면 repair 도 된다).
- 방언 중립 코딩 관례(초 단위 절삭, 문자열 null 을 문자열 타입으로 바인딩, `RECURSIVE` 없는 재귀 CTE, LIKE `[`
  이스케이프 등)는 SQLite 에서도 무해하고 이식성에 도움이 되므로 유지한다. 근거 주석만 방언 중립으로 고쳤다.

## Alternatives Considered (대안)

- **MSSQL 산출물을 유지하되 "잠정" 표시**: 확인되지 않은 두 번째 방언을 계속 맞춰야 해 비용이 그대로이고,
  운영 DB 가 다른 제품으로 정해지면 어차피 버려진다. 채택하지 않는다.
- **방언 이음매까지 지우고 SQLite 로 직결**: 코드는 조금 줄지만 운영 DB 가 정해질 때 판정·분기 자리를 다시
  만들어야 한다. 이음매 비용이 작아 남긴다(D3).
- **ADR-0001 을 SUPERSEDED 로 전이**: ADR-0001 의 대부분(명명·감사 칼럼·영속성)은 여전히 유효하다. 일부만
  대체하므로 전이하지 않고 이 ADR 에서 대체 범위를 밝힌다(D5).

## References

- [ADR-0001](0001-physical-naming-audit-dialect.md) — MSSQL 부분을 이 ADR 이 대체(D5)
- [`docs/mdm/naming-dialect-rules.md`](../naming-dialect-rules.md) — 방언 규칙 정본(SQLite)
- [TRD](../TRD.md) §2·§4, [PRD](../PRD.md)
- 브랜치 `chore/mdm-drop-mssql` 커밋(MSSQL 마이그레이션·테스트·의존성 삭제, 방언 이음매 정리)
