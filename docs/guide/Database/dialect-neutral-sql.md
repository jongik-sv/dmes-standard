# 방언 중립 SQL 작성 규칙

로컬 개발과 자동 테스트는 SQLite 로 돌고, 운영은 Oracle 또는 PostgreSQL(현장마다 하나)로 돈다. MSSQL 은 거의 쓰지 않는다(2026-10-03 결정). 같은 SQL 이 두 DB 에서 같은 결과를 내도록 쓰는 규칙을 모은다. 방언별 용어 대조는 [`DBMS-용어-비교.md`](DBMS-용어-비교.md) 를 보고, MSSQL 현장을 맡을 때의 전환 자료(보관)는 [`oracle-to-mssql-practical-guide.md`](oracle-to-mssql-practical-guide.md) 를 본다.

## 1. 원칙

- **ANSI 우선**: 표준 SQL 로 쓸 수 있으면 표준으로 쓴다. 벤더 함수(`NVL`·`ISNULL`·`IFNULL` 등)는 표준 대체(`COALESCE`)가 있으면 쓰지 않는다. 예외는 재귀 CTE 다(§3, 방언 판정 한 곳에서 문안을 고른다).
- **방언 판정은 한 곳**: JPA/Hibernate 를 쓰는 모듈에서 방언마다 갈리는 네이티브 쿼리·SQL 문안은 방언 판정 한 곳을 거쳐 고른다. 분기는 `switch` 로 써서 방언 값을 더하면 컴파일러가 빠진 분기를 알리게 한다(선례: MDM 의 `MdmDialect`·`MdmDialectResolver`, [ADR-0004](../../mdm/adr/0004-drop-mssql-production-assumption.md) D3 방언 이음매).
- **JPQL·Criteria 우선**: 페이징·현재 시각·identity 처럼 Hibernate 가 방언별로 바꿔 주는 것은 네이티브 SQL 로 직접 쓰지 않는다.
- **값은 애플리케이션에서 바인딩**: 현재 시각·채번·빈 값 처리처럼 방언마다 결과가 다른 것은 DB 함수보다 애플리케이션에서 만든 값을 바인딩한다.
- **SQLite 통과 ≠ 운영 통과**: SQLite 는 선언 타입·길이를 강제하지 않는다. 운영 DB(Oracle 또는 PostgreSQL)에서 따로 검증한다.

## 2. 방언별로 갈리는 구문

| 항목 | ANSI 권장 | Oracle | PostgreSQL | SQLite | MSSQL(참고) |
|---|---|---|---|---|---|
| 페이징 | `OFFSET n ROWS FETCH NEXT m ROWS ONLY` | 같음(12c 이상), 이전은 `ROWNUM` | 같음, 또는 `LIMIT m OFFSET n` | `LIMIT m OFFSET n` 만 | 같음(2012 이상, `ORDER BY` 필수) |
| 문자열 연결 | `a \|\| b` | `\|\|`(NULL 을 빈 문자열처럼 이음) | `\|\|`(NULL 이 섞이면 NULL), `concat()` | `\|\|`(NULL 이 섞이면 NULL) | `CONCAT(a, b)` 또는 `+` |
| NULL 대체 | `COALESCE(a, b)` | `COALESCE`, `NVL` | `COALESCE` | `COALESCE`, `IFNULL` | `COALESCE`, `ISNULL` |
| 현재 시각 | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP`, `SYSTIMESTAMP`, `SYSDATE` | `CURRENT_TIMESTAMP`, `now()`(트랜잭션 시작 시각) | `CURRENT_TIMESTAMP`(UTC 문자열) | `CURRENT_TIMESTAMP`, `SYSDATETIME()` |
| 시퀀스·identity | `GENERATED ... AS IDENTITY` | identity(12c 이상), `seq.NEXTVAL` | identity, `nextval('seq')` | `INTEGER PRIMARY KEY`(rowid), 시퀀스 없음 | `IDENTITY(1,1)`, `NEXT VALUE FOR seq` |
| upsert | `MERGE` | `MERGE INTO` | `INSERT ... ON CONFLICT ... DO UPDATE`(15 이상은 `MERGE` 도) | `INSERT ... ON CONFLICT ... DO UPDATE` | `MERGE` |
| 재귀 CTE | 표준은 `WITH RECURSIVE`, 이 리포는 방언 판정 한 곳에서 문안을 고름(§3) | `WITH t(col, ...) AS (...)`(칼럼 목록 필요, `RECURSIVE` 는 받지 않음), 또는 `CONNECT BY` | `WITH RECURSIVE` 필수 | `WITH` · `WITH RECURSIVE` 모두 됨 | `WITH` 만(`RECURSIVE` 쓰면 오류) |
| 식별자 대소문자·따옴표 | 따옴표 없는 식별자 | 따옴표 없으면 대문자로 바뀜, `"Name"` 은 그대로 | 따옴표 없으면 소문자로 바뀜 | 대소문자 무시 | `[Name]` 또는 `"Name"`, 구분 여부는 collation |
| 빈 문자열과 NULL | `''` 와 NULL 을 구분 | `''` 를 NULL 로 취급 | 구분 | 구분 | 구분 |
| 건수 제한 DML | 없음(WHERE 로 범위 지정) | `WHERE ROWNUM <= n` | 지원 안 함(서브쿼리로 키 선택) | 컴파일 옵션이 켜진 빌드에서만 `LIMIT` | `DELETE TOP (n)` |

## 3. 항목별 규칙

### 페이징

- 목록 조회는 Spring Data `Pageable`·JPQL 로 두어 Hibernate 가 방언별 구문을 만들게 한다.
- 네이티브 SQL 페이징이 꼭 필요하면 방언 판정 한 곳에서 문안을 고른다. SQLite 는 `OFFSET ... FETCH` 를 받지 않는다.
- 페이징 쿼리는 항상 유일한 정렬 키까지 `ORDER BY` 에 넣는다.

### 문자열 연결과 NULL

- 연결 결과에 NULL 이 섞일 수 있으면 `COALESCE(col, '')` 로 감싼다. Oracle 만 NULL 을 빈 문자열처럼 다루므로 방언 간 결과가 달라진다.
- 표시용 문자열 조합은 SQL 보다 애플리케이션에서 한다.

### 현재 시각

- 감사 칼럼(`C_AT`·`U_AT` 등)은 DB 함수 대신 애플리케이션에서 만든 시각을 바인딩한다. 방언마다 시간대·정밀도가 다르다(SQLite `CURRENT_TIMESTAMP` 는 UTC 문자열).
- 정밀도 차이로 비교가 어긋나지 않도록 바인딩 전에 초 단위로 절삭한다(MDM 관례).

### 채번

- 자동 증가 키는 JPA `@GeneratedValue` 로 두고, 업무 채번(문서 번호 등)은 채번 테이블·서비스로 한다. 시퀀스를 직접 부르는 네이티브 SQL 은 쓰지 않는다(SQLite 에 시퀀스가 없다).

### upsert

- 데이터 이관·seed 처럼 멱등이 필요한 곳에서만 쓰고, 업무 로직은 조회 후 INSERT/UPDATE 로 나눈다.
- 이관 스크립트의 방언별 멱등 방법은 [`../BackEnd/Backend-Implementation-Guide.md`](../BackEnd/Backend-Implementation-Guide.md) §8.1 표를 따른다.

### 재귀 CTE

- `RECURSIVE` 낱말을 받는 방식이 운영 후보 사이에서 갈린다. Oracle 은 `RECURSIVE` 낱말을 받지 않고(MSSQL 도 같은 쪽이다), PostgreSQL 은 재귀 CTE 에 `RECURSIVE` 가 필수이며, SQLite 는 둘 다 받는다. 그래서 하나의 문안으로 Oracle 과 PostgreSQL 을 함께 만족시킬 수 없고, 재귀 CTE 는 방언 판정 한 곳에서 문안을 고르는 대상이다.
- Oracle 문안은 `RECURSIVE` 없이 칼럼 목록을 붙인 `WITH t(col, ...) AS (...)` 이고, PostgreSQL 문안은 같은 형태 앞에 `RECURSIVE` 를 붙인 `WITH RECURSIVE t(col, ...) AS (...)` 다. 지금 MDM 의 기본형은 `RECURSIVE` 없는 문안이며(ADR-0004 가 유지한 관례), SQLite 가 이를 받으므로 로컬·테스트에서 그대로 돈다. PostgreSQL 방언을 더하는 모듈은 방언 이음매에서 `RECURSIVE` 를 붙인 문안을 고른다.

### 식별자

- 테이블·칼럼 이름은 따옴표 없이 쓰고, 물리명은 [`../Common/표준단어사전.md`](../Common/표준단어사전.md) 를 따른다. 따옴표로 대소문자를 고정하지 않는다(Oracle 은 대문자, PostgreSQL 은 소문자로 접어 비교하므로 따옴표 쓴 이름은 방언마다 다르게 찾힌다).
- 예약어(`USER`, `ORDER`, `DATE`, `LEVEL` 등)를 식별자로 쓰지 않는다.

### 빈 문자열과 NULL

- 빈 값은 NULL 로 통일한다. `''` 를 저장하거나 `col = ''` 로 찾지 않는다. Oracle 에서는 `''` 가 NULL 이 되어 결과가 달라진다.
- 필수 문자열은 `NOT NULL` 과 함께 공백 검증을 애플리케이션에서 한다.

### 건수 제한 DML

- `UPDATE`·`DELETE` 에 `LIMIT`·`TOP` 을 쓰지 않는다. 대량 처리는 키 범위 WHERE 로 나누어 반복한다.

### LIKE 특수문자

- 사용자 입력으로 LIKE 를 만들 때는 `ESCAPE` 를 명시하고 `%`·`_` 를 이스케이프한다. MSSQL 을 쓸 때만 `[` 도 패턴 문자로 해석하므로 함께 이스케이프한다(MDM 관례).
