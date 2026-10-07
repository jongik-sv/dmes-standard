# Database Guide Index

로컬 개발·자동 테스트·운영 DB 는 모두 **Oracle** 하나다(oracle-1007, 2026-10-07 결정: 로컬은 Oracle 26ai Free 컨테이너, 격리는 레인·시험별 PDB). SQL 은 Oracle 하나만 가정하고 쓰며 Oracle 고유 구문(`NVL`·`CONNECT BY`·`ROWNUM`·`MERGE` 등)을 제한 없이 쓸 수 있다. 일반 개발 규칙은 먼저 [`../README.md`](../README.md) 의 작업별 진입점을 따른 뒤, SQL 작성·로컬 DB 환경이 필요한 경우에만 이 폴더를 읽는다.

| 문서 | 역할 |
|---|---|
| [`oracle-sql-rules.md`](oracle-sql-rules.md) | **먼저 읽는다.** Oracle 에서 실수하기 쉬운 점(`''`=NULL, 대문자 식별자·백틱, IDENTITY, boolean·KST TIMESTAMP, CLOB 비교 제한 등)과 권장 구문 |
| [`oracle-26ai-test-guide.md`](oracle-26ai-test-guide.md) | **로컬 DB·시험 환경.** Podman 기반 Oracle 26ai Free 컨테이너, 레인·시험 PDB 사용법, 트러블슈팅(Mac/Windows 공용) |
| [`DBMS-용어-비교.md`](DBMS-용어-비교.md) | 보관. Oracle·MSSQL·PostgreSQL·SQLite 4-DB 용어 비교(옛 다중 DB 시절 자료) |
| [`oracle-to-mssql-practical-guide.md`](oracle-to-mssql-practical-guide.md) | 보관. dmes-ksm(MSSQL) 이관 시절 자료(Oracle→SQL Server 실무 전환 상세본) |
| [`oracle-to-mssql-핵심요약.md`](oracle-to-mssql-핵심요약.md) | 보관. 위 상세본의 1장 요약 |

스키마 소유·연결 규약은 [`../../oracle-1007/schema-owners.md`](../../oracle-1007/schema-owners.md), 마이그레이션 추가는 [`flyway-migration-add` 스킬](../../../.claude/skills/flyway-migration-add/SKILL.md) 을 본다.

## 배치 기준

- DBMS 문법, 자료형, 트랜잭션, 함수처럼 특정 구현 계층에 종속되지 않는 문서는 이 폴더에 둔다.
- Backend persistence 구현 규칙은 [`../BackEnd/`](../BackEnd/) 에 둔다.
- 프로젝트 표준 물리명은 [`../Common/표준단어사전.md`](../Common/표준단어사전.md) 를 따른다.
