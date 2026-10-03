# Database Guide Index

운영 DB(Oracle 또는 PostgreSQL)와 로컬 SQLite 사이의 차이, DBMS 전환 시 주의점은 이 폴더에서 확인한다. 운영 DB 는 Oracle 또는 PostgreSQL(현장마다 하나)이고, 로컬 개발·자동 테스트 DB 는 SQLite 이며, MSSQL 은 거의 쓰지 않는다(2026-10-03 결정). 일반 개발 규칙은 먼저 [`../README.md`](../README.md) 의 작업별 진입점을 따른 뒤, SQL 문법/운영 차이가 필요한 경우에만 이 폴더를 읽는다.

| 문서 | 역할 |
|---|---|
| [`dialect-neutral-sql.md`](dialect-neutral-sql.md) | **먼저 읽는다.** SQLite(로컬·테스트)와 운영 DB(Oracle·PostgreSQL)에서 함께 도는 방언 중립 SQL 작성 규칙·구문 대조표 |
| [`DBMS-용어-비교.md`](DBMS-용어-비교.md) | Oracle·MSSQL·PostgreSQL·SQLite **4-DB** 용어·개념 비교 |
| [`oracle-to-mssql-practical-guide.md`](oracle-to-mssql-practical-guide.md) | 보관. dmes-ksm(MSSQL) 이관 시절 자료이며 MSSQL 현장을 맡을 때만 참고한다(Oracle→SQL Server 실무 전환 상세본) |
| [`oracle-to-mssql-핵심요약.md`](oracle-to-mssql-핵심요약.md) | 보관. dmes-ksm(MSSQL) 이관 시절 자료이며 MSSQL 현장을 맡을 때만 참고한다(위 상세본의 1장 요약) |

## 배치 기준

- DBMS 문법, 자료형, 트랜잭션, 함수 차이처럼 특정 구현 계층에 종속되지 않는 문서는 이 폴더에 둔다.
- Backend persistence 구현 규칙은 [`../BackEnd/`](../BackEnd/) 에 둔다.
- 프로젝트 표준 물리명은 [`../Common/표준단어사전.md`](../Common/표준단어사전.md) 를 따른다.
