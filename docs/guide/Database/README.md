# Database Guide Index

Oracle 과 SQL Server 차이, DBMS 전환 시 주의점은 이 폴더에서 확인한다. 일반 개발 규칙은 먼저 [`../README.md`](../README.md) 의 작업별 진입점을 따른 뒤, SQL 문법/운영 차이가 필요한 경우에만 이 폴더를 읽는다.

| 문서 | 역할 |
|---|---|
| [`oracle-to-mssql-practical-guide.md`](oracle-to-mssql-practical-guide.md) | Oracle→SQL Server 실무 전환 **상세 정본** (가장 완전한 본문) |
| [`oracle-to-mssql-핵심요약.md`](oracle-to-mssql-핵심요약.md) | 위 상세본의 1장 요약 (개발자/설계자용 치트시트) |
| [`DBMS-용어-비교.md`](DBMS-용어-비교.md) | Oracle·MSSQL·PostgreSQL·SQLite **4-DB** 용어·개념 비교 |

## 배치 기준

- DBMS 문법, 자료형, 트랜잭션, 함수 차이처럼 특정 구현 계층에 종속되지 않는 문서는 이 폴더에 둔다.
- Backend persistence 구현 규칙은 [`../BackEnd/`](../BackEnd/) 에 둔다.
- 프로젝트 표준 물리명은 [`../Common/표준단어사전.md`](../Common/표준단어사전.md) 를 따른다.
