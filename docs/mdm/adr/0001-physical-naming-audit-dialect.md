# ADR-0001: MDM 물리 명명·공통 관리 속성·방언 규칙

- **Status**: PROPOSED
- **Date**: 2026-09-24
- **Decision Date**: —
- **Context Tags**: MDM, DB, NAMING, AUDIT, DIALECT

## 쉬운 설명 (현업용 요약)

표준 원장(마루 MDM)이 쓰는 표의 이름을 저장소에 있는 다른 표들처럼 모두 대문자로 통일한다.
그리고 누가 언제 등록하고 고쳤는지를 남기는 칸을 모든 표에 똑같은 모양으로 둔다.

개발자 PC 에서 쓰는 가벼운 데이터베이스와 운영 데이터베이스는 문법이 조금씩 다르다.
원천 설계는 또 다른 데이터베이스의 문법으로 쓰여 있어서, 그대로 옮기면 두 곳 중 한 곳에서
동작하지 않는 부분이 생긴다. 이런 차이를 한 장의 표로 정리하고, 아직 실제로 돌려 보지 않은
항목은 어느 작업에서 확인할지 적어 두었다. 앞으로 표를 설계하는 모든 작업은 이 규칙표를 따른다.

## Context (배경)

- 사용자 결정(2026-09-23, `docs/mdm/decisions.md` D-006)으로 원천 설계의 `MD_*` 테이블을 `TB_MDM_*` 로 바꿨다. 그러나 식별자 사전 §A.12 는 `TB_{모듈}_{역할}` 의 모듈·역할을 **소문자**로 강제하고, 정규식 `^TB_(mpn|mpp|mls|mqc|mcm)_…` 에 mdm 이 없다.
- 리포의 실제 모듈 테이블은 전부 대문자다. `CREATE TABLE` 과 `@Table(name=…)` 로 만든 모듈 테이블 28종(합집합)이 모두 `^TB_(MPN|MPP|MLS|MQC|MCM)_[A-Z][A-Z0-9_]*$` 에 맞고, 소문자 정규식에 맞는 것은 0종이다. mls 는 이 어긋남을 GAP-002 로 적고 대문자를 택했고, mcm-reference 는 "테이블명 대문자 유지" 를 정본으로 둔다. backend-standard §5 는 칼럼을 `UPPER_SNAKE_CASE` 로 정한다.
- 원천 설계에는 등록·수정자 칼럼이 없다. 04:967·05:601·06:905 가 "관리 속성(등록·수정자·일시)은 공통 모듈에서 정의" 로 미뤘다. 낙관적 잠금 칼럼 `row_version` 은 일부 테이블에만 있다.
- 리포의 감사 칼럼 수단은 두 가지다. `McmAuditStatementInspector` 는 `MCMAPUSER.TB_MCM_` 접두가 붙은 SQL 만 고치고 svc/pgm 값을 `'mcm'` 으로 하드코딩하며, mcm 앱에만 등록돼 있다. `CactusAuditEntity`(cactus-core)는 JPA 리스너로 감사 9칼럼을 채우고 mls `Notice` 가 선례다. mdm 은 자기 DB 를 쓰고 인스펙터를 등록하지 않는다.
- 원천 설계는 PostgreSQL 문법(RETURNING, JSONB, REPEATABLE READ, 재귀 CTE, BOOLEAN, 정규식 `~`, `FULL JOIN … USING` 등)으로 쓰였다. 운영은 MSSQL, 로컬은 SQLite 다.
- TRD §2 는 영속성을 "JPA + MyBatis(mcm-core 관례)" 로 적었으나, backend-standard 04 는 MES 모듈에 사용자 동의 없는 MyBatis 도입을 금지하고 mcm-reference 는 "JPA 1순위" 다.

## Decision (결정)

규칙의 정본은 [`docs/mdm/naming-dialect-rules.md`](../naming-dialect-rules.md) 다. 이 ADR 은 그 규칙표가 따르는 결정을 기록한다.

- **D1 물리 명명**: 테이블은 `TB_MDM_{ROLE}` 전부 대문자, 칼럼은 원천 snake_case 를 글자 그대로 대문자로 바꾼 UPPER_SNAKE(개명 없음)다. 제약은 `PK_{테이블}`, `FK_{테이블}_{참조테이블에서 TB_MDM_ 뗀 이름}`(같은 두 테이블 사이에 FK 가 둘 이상이면 뒤에 `_{칼럼}` 을 붙인다), `UX_{테이블}_{칼럼…}`, `IX_{테이블}_{칼럼…}`, `CK_{테이블}_{의미}` 로 짓는다. 스키마 접두는 쓰지 않는다(MSSQL 은 접속 계정의 기본 스키마). 식별자 사전은 mdm 만 예외로 둔다 — A.1.1 에 mdm 을 등재하고, A.12.6 정규식에 대문자 가지를 더하고, §A.12.7 mdm 예외 절을 둔다. 다른 모듈의 소문자 규칙은 바꾸지 않는다(규칙표 §1).
- **D2 공통 관리 속성**: 감사 9칼럼(`C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER`)을 모든 `TB_MDM_*` 에 둔다(예외 `TB_MDM_DICT_SEQ`). 보류 테이블도 DDL 에 둔다. 엔티티는 `CactusAuditEntity` 를 상속해 채우고, 엔티티를 거치지 않는 쓰기는 SQL 에 감사 칼럼을 명시한다. `McmAuditStatementInspector` 는 `TB_MDM_*` 에 적용하지 않는다(코드 변경 없음). `row_version` 은 원천이 정한 낙관적 잠금 칼럼(초깃값 0, 불일치 409)이고 `VER` 는 감사용 변경 횟수라 잠금 판정에 쓰지 않는다(규칙표 §2).
- **D3 방언 규칙**: 방언 차이 24행은 규칙표 §3 이 정본이다. 각 행에 검증 상태를 적고, `실측 필요` 행은 담당 Task 가 두 방언에서 확인한 뒤 같은 커밋에서 검증 상태를 갱신한다. 결과가 규칙과 다르면 규칙을 고치고 decisions.md 에 기록한다(규칙표 §3·§6).
- **D4 영속성 수단**: JPA(엔티티·Repository) 1순위, 방언별 SQL 은 JPA native 쿼리로 쓴다. MyBatis 는 쓰지 않는다. 방언 판정은 한 곳에서 하고 방언별 문안은 같은 리포지토리 안에 짝으로 둔다. Flyway 는 두 방언의 V 번호 집합을 항상 같게 유지한다(규칙표 §4·§5).
- **D5 코드·키 칼럼 대소문자 비교**: MSSQL 코드·키 칼럼에 `COLLATE Latin1_General_100_BIN2` 를 지정해 SQLite(기본 BINARY)와 같이 대소문자를 구분한다. 엔진 jar 와 화면 JS 평가기가 대소문자를 구분해 비교하므로 DB 판정도 같게 맞춘다(규칙표 §3 #19).

## Consequences (결과)

- 후속 DB 설계 Task(TSK-02-03 등)는 규칙표를 줄 단위로 인용해 DDL 을 쓴다. 원천 문서 인용은 소문자를 써도 되지만 DDL·엔티티·네이티브 SQL 은 대문자다.
- 식별자 사전 §A.12 는 mdm 만 대문자 예외를 갖는다. 리포 실자산은 전 모듈이 대문자라서 식별자 사전 원문과 현실의 어긋남(다른 모듈)은 이 ADR 뒤에도 남는다. 전 모듈 대문자 전환은 별도 모듈 횡단 결정이다.
- 감사 칼럼은 JPA 리스너가 채우므로, 네이티브 쓰기를 하는 코드는 감사 칼럼을 빠뜨리지 않게 TSK-01-02 의 헬퍼를 써야 한다.
- 규칙표의 `실측 필요` 행은 아직 사실로 확인되지 않은 작성 규칙이다. 담당 Task 가 확인하기 전까지는 그 행의 문안이 두 방언에서 모두 동작한다고 가정하지 않는다.
- TRD §2 의 영속성 칸과 §4.2 방언 표는 이 결정에 맞춰 고쳤다. TRD §4.2 는 요약이며 규칙표가 우선한다.
- MSSQL 코드·키 칼럼이 대소문자를 구분하므로, 대소문자만 다른 코드값은 서로 다른 값이 된다. 이런 코드가 헷갈린다면 저장 검사로 막을 수 있다(이 Task 가 그 검사를 만드는 것은 아니다).

## Alternatives Considered (대안)

- **소문자 `TB_mdm_*`(식별자 사전 A.12 원문)**: 규칙 문서와는 맞지만 사용자 결정 D-006 과 리포 실자산 28종의 대문자 관례에 어긋난다. 채택하지 않는다.
- **전 모듈 대문자 전환**(A.12·backend-standard 의 규칙과 예시를 모두 대문자로 바꾸고 모듈 횡단 ADR 발행): 리포 현실과 가장 잘 맞지만, spec 범위를 넘어 다른 모듈의 규칙 문서를 바꾸는 모듈 횡단 결정이다. 이 Task 가 단독으로 내리지 않는다(`docs/mdm/tasks/TSK-02-01/design.md` D1 b).
- **정규식 대소문자 무시**: 표기를 둘 다 허용해 규칙이 약해진다. 채택하지 않는다.
- **`McmAuditStatementInspector` 확장**: 정규식과 svc 하드코딩을 모두 고쳐야 하고 mdm 앱에 등록도 새로 해야 한다. 요청 문맥에서 svc/pgm 을 채우는 `CactusAuditListener` 가 더 정확하다. 채택하지 않는다.
- **MyBatis**: backend-standard 04 가 MES 모듈에 사용자 동의 없이 금지한다. JPA native 쿼리로 방언별 SQL 을 쓸 수 있다. 채택하지 않는다.
- **SQLite 코드·키 칼럼 `COLLATE NOCASE`(대소문자 무시로 통일)**, **애플리케이션 대문자 정규화**: 엔진 jar·화면 JS 평가기의 대소문자 구분 비교와 어긋나거나 저장 규칙이 늘어난다(`design.md` D7).

## Trigger (PROPOSED 인 경우만)

D'Flow 에서 mdm/TSK-02-01 이 승인(approved)되고, `docs/mdm/tasks/TSK-02-01/design.md` 「담당자 확인 필요 결정」 중 이 ADR 이 근거로 삼은 항목(D1·D7)이 반려되지 않으면 ACCEPTED 로 전환한다. 반려된 항목이 있으면 그 결정을 고친 뒤 다시 판정한다.

## References

- [`docs/mdm/naming-dialect-rules.md`](../naming-dialect-rules.md) — 규칙 정본(§1 명명, §2 감사 칼럼, §3 방언, §4 영속성, §5 Flyway, §6 인계)
- `docs/mdm/decisions.md` D-006, D-012, D-013, D-014
- `docs/mdm/tasks/TSK-02-01/design.md` §6.1~§6.4, 담당자 확인 필요 결정 D1·D7
- 식별자 사전 [§A.12.7 mdm 모듈 예외](../../guide/design/identifier-dictionary/04-decision-table-dispatch.md), [§A.1.1](../../guide/design/identifier-dictionary/01-modules-and-screens.md)
- `docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md` §5, `04-cases-checklist-menu.md`(MES 모듈 MyBatis 금지)
- `docs/guide/reference/mcm-reference.md` A절(테이블명 대문자 유지, JPA 1순위)
- 원천 설계 `/Users/jji/project/mdm/docs/design/basic/` 02~06, `sql/04-code-exists.sql`
- [TRD](../TRD.md) §2·§4.2·§4.3
