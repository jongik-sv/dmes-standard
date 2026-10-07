# DBMS 용어 비교 — Oracle · MSSQL · PostgreSQL · SQLite

> **보관 자료 (2026-10-07)**: 로컬·시험·운영 DB 는 모두 Oracle 하나이고(oracle-1007) 이 문서는 옛 다중 DB 시절의 용어 비교로 남겨 둔다. 새 작업의 SQL 은 [`oracle-sql-rules.md`](oracle-sql-rules.md) 를 따른다.

본 문서는 4개 주요 RDBMS 의 핵심 개념 (유저, 스키마, 데이터베이스, 인스턴스 등) 을 용어 차이 중심으로 정리한다. 동일 단어가 제품마다 다른 의미로 쓰이는 경우가 많아, 마이그레이션/멀티 DB 작업 시 혼선을 줄이는 것이 목적이다.

---

## 1. 한눈에 비교

| 개념                | Oracle                                | MSSQL (SQL Server)                  | PostgreSQL                          | SQLite                              |
| ------------------- | ------------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |
| 서버 프로세스       | Instance                              | Instance (서비스)                   | Cluster (postmaster)                | 없음 (라이브러리 임베디드)          |
| 최상위 컨테이너     | Database (= CDB/PDB, 12c+)            | Instance                            | Cluster                             | 파일 1 개                           |
| 논리 DB 단위        | PDB (Pluggable Database)              | Database                            | Database                            | 파일 = DB                           |
| 네임스페이스 (그룹) | Schema (= User 와 1:1)                | Schema (User 와 분리)               | Schema                              | 없음 (단일 네임스페이스)            |
| 계정/로그인         | User (= Schema)                       | Login (서버) + User (DB)            | Role (User/Group 통합)              | 없음 (파일 권한)                    |
| 객체 소유자         | User                                  | Schema 가 소유, User 가 Schema 소유 | Role                                | 없음                                |
| 권한 부여 대상      | User, Role                            | Login, User, Role, Schema           | Role                                | 없음                                |
| 동시 접속 격리      | 세션 (Session)                        | 세션 (SPID)                         | 백엔드 프로세스 (Backend)           | 파일 락                             |
| 트랜잭션 격리 기본  | READ COMMITTED                        | READ COMMITTED                      | READ COMMITTED                      | SERIALIZABLE                        |

---

## 2. 계층 구조 (Hierarchy)

### Oracle (12c+ Multitenant)
```
Instance (메모리 + 프로세스)
└─ CDB (Container Database)
   ├─ Root (CDB$ROOT)
   ├─ Seed (PDB$SEED)
   └─ PDB (Pluggable Database) ← 실제 사용자 DB
      └─ Schema = User
         └─ Object (Table, View, Index, ...)
```
- **Instance** : SGA + 백그라운드 프로세스. 1 Instance 가 1 CDB 를 Mount.
- **Database** : 디스크 상의 데이터파일 집합. CDB 단위.
- **PDB** : 하나의 CDB 안에 여러 개를 만들 수 있는 "꽂아 쓰는" DB. 애플리케이션이 실제로 접속하는 단위.
- **Schema = User** : Oracle 은 사용자를 만들면 동명의 Schema 가 함께 생긴다. 즉 `SCOTT` 유저가 만든 테이블은 `SCOTT.EMP` 로 접근.

### MSSQL
```
Instance (Windows 서비스)
└─ Database (마스터/모델/msdb/tempdb + 사용자 DB)
   ├─ Schema (dbo, sys, ...)
   │   └─ Object (Table, View, Procedure, ...)
   └─ User (DB 단위 계정, Login 과 매핑)

Instance 단위
└─ Login (서버 단위 계정)
```
- **Instance** : 하나의 서버에 여러 명명된 인스턴스 (Named Instance) 설치 가능 (`SERVER\INSTANCE`).
- **Database** : 독립된 사용자 DB. 기본 시스템 DB 4 종 (master, model, msdb, tempdb).
- **Schema** : 객체 그룹핑 네임스페이스. **User 와 독립**. 기본 스키마는 `dbo`.
- **Login vs User** : Login 은 서버 단위 인증 주체, User 는 각 Database 단위 권한 주체. 동일 사람이 여러 DB 에 다른 User 로 매핑됨.

### PostgreSQL
```
Cluster (postmaster, 단일 데이터 디렉토리)
└─ Database (postgres, template0, template1 + 사용자 DB)
   └─ Schema (public, pg_catalog, ...)
      └─ Object

Cluster 단위
└─ Role (User/Group 구분 없음, LOGIN 속성으로 결정)
```
- **Cluster** : Oracle 의 "Instance + Database" 묶음과 비슷한 개념. 1 데이터 디렉토리 = 1 Cluster.
- **Database** : Cluster 안의 독립 DB. **다른 DB 의 객체는 같은 세션에서 직접 참조 불가** (FDW/dblink 필요).
- **Schema** : MSSQL 과 유사하게 User/Role 과 분리된 네임스페이스. 기본 `public`.
- **Role** : User 와 Group 을 통합한 개념. `LOGIN` 속성이 있으면 접속 가능, 없으면 권한 그룹 역할.

### SQLite
```
파일 1 개 = Database 1 개
└─ Table, View, Index, Trigger
```
- **No Server, No User, No Schema** : 임베디드 라이브러리. 파일 권한 = DB 권한.
- `ATTACH DATABASE` 로 여러 DB 파일을 한 세션에 붙여 사용 가능 (`db1.table`, `db2.table`).
- "Schema" 라는 단어가 SQLite 에서는 **DDL 정의 자체** (sqlite_master) 를 의미하는 경우가 많아 의미 혼동 주의.

---

## 3. 동일 단어, 다른 의미 — 마이그레이션 함정

### 3.1 "Database"

| 제품       | 의미                                                                 |
| ---------- | -------------------------------------------------------------------- |
| Oracle     | 디스크 상의 데이터파일 집합 = CDB 전체. 보통 1 서버 1 Database.      |
| MSSQL      | 독립된 사용자 DB. 1 인스턴스에 수십 ~ 수백 개 생성 일반적.            |
| PostgreSQL | Cluster 안의 독립 DB. MSSQL 과 유사하나 cross-DB 직접 쿼리 불가.     |
| SQLite     | 파일 1 개.                                                           |

→ Oracle 사용자가 "DB 를 새로 만들자" 라고 하면 보통 신규 인스턴스/PDB 를 뜻하지만, MSSQL/PG 에서는 `CREATE DATABASE` 한 줄.

### 3.2 "Schema"

| 제품       | 의미                                                                  |
| ---------- | --------------------------------------------------------------------- |
| Oracle     | User 와 1:1. User 를 만들면 Schema 가 같이 생긴다. 분리 불가.         |
| MSSQL      | User 와 독립된 네임스페이스. 한 User 가 여러 Schema 의 객체 소유 가능.|
| PostgreSQL | MSSQL 과 동일. 기본 `public`.                                         |
| SQLite     | 단일 네임스페이스 (메인 DB), ATTACH 한 DB 별칭이 의사-스키마 역할.    |

→ Oracle 출신은 "Schema = 사용자" 로 직관하므로, MSSQL/PG 의 "한 User 가 여러 Schema 소유" 가 낯섦.

### 3.3 "User" vs "Login" vs "Role"

| 제품       | 인증 주체  | 권한 주체  | 그룹 개념                              |
| ---------- | ---------- | ---------- | -------------------------------------- |
| Oracle     | User       | User, Role | Role                                   |
| MSSQL      | Login      | User       | Role (Server Role + Database Role)     |
| PostgreSQL | Role+LOGIN | Role       | Role (User/Group 미구분, GRANT 로 상속)|
| SQLite     | 없음       | 없음       | 없음                                   |

### 3.4 "Instance"

| 제품       | 의미                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| Oracle     | 메모리 + 프로세스. Database 와 분리된 개념 (RAC 에서는 N:1).            |
| MSSQL      | Windows 서비스 단위. `SERVER\INSTANCE` 로 식별.                         |
| PostgreSQL | "Instance" 용어 거의 안 씀. **Cluster** 가 동등 개념.                   |
| SQLite     | 해당 없음.                                                              |

---

## 4. 자주 쓰는 조회 / 변경 명령

| 작업               | Oracle                              | MSSQL                                   | PostgreSQL                          | SQLite                          |
| ------------------ | ----------------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------- |
| 현재 DB 확인       | `SELECT name FROM v$database;`      | `SELECT DB_NAME();`                     | `SELECT current_database();`        | `PRAGMA database_list;`         |
| 현재 사용자        | `SHOW USER;` / `USER`               | `SELECT SUSER_NAME(), USER_NAME();`     | `SELECT current_user;`              | 해당 없음                       |
| 현재 스키마        | (= 현재 User)                       | `SELECT SCHEMA_NAME();`                 | `SHOW search_path;`                 | 해당 없음                       |
| DB 목록            | `SELECT name FROM v$pdbs;`          | `SELECT name FROM sys.databases;`       | `\l` (psql) / `SELECT datname FROM pg_database;` | 해당 없음            |
| 스키마/유저 목록   | `SELECT username FROM dba_users;`   | `SELECT * FROM sys.schemas;`            | `\dn` / `SELECT nspname FROM pg_namespace;` | 해당 없음               |
| DB 전환            | (PDB) `ALTER SESSION SET CONTAINER=pdb1;` | `USE mydb;`                       | psql `\c mydb` (재접속 필요)        | `ATTACH DATABASE 'f.db' AS x;`  |
| 스키마 전환        | `ALTER SESSION SET CURRENT_SCHEMA=...;` | `EXEC sp_default_schema ...` 또는 `ALTER USER ... WITH DEFAULT_SCHEMA=...` | `SET search_path TO ...;` | 해당 없음 |

---

## 5. 실무 권장 매핑 (멀티 DB 지원 설계 시)

DMES 와 같이 4개 DB 를 모두 지원해야 하는 경우, **논리 단위를 무엇으로 잡을지** 가 핵심이다.

| 논리 단위      | Oracle 매핑       | MSSQL 매핑          | PostgreSQL 매핑      | SQLite 매핑      |
| -------------- | ----------------- | ------------------- | -------------------- | ---------------- |
| 1 애플리케이션 | 1 PDB             | 1 Database          | 1 Database           | 1 파일           |
| 모듈 분리      | Schema (= User)   | Schema              | Schema               | (분리 불가)      |
| 접속 계정      | User              | Login + User        | Role (LOGIN)         | OS 파일 권한     |

**권장 패턴**
- 멀티 모듈을 한 DB 안에서 분리할 때는 **Schema** 를 공통 추상으로 사용한다. Oracle 만 User=Schema 라는 점을 명시.
- 권한은 **Role** 기반으로 설계하면 4 DB 모두 호환된다 (SQLite 제외).
- `CREATE DATABASE` 의미가 다름을 인지 — Oracle 환경에서는 사실상 인프라 작업, MSSQL/PG 에서는 일상 DDL.

---

## 6. 한 커넥션 (단일 유저) 으로 다른 모듈 데이터 조회

핵심 질문: **모듈 A 의 커넥션 (한 유저) 으로 모듈 B 의 데이터를 읽어야 할 때, 어떤 개념을 써야 하는가?**

먼저 분리 단위를 확정해야 한다 — 모듈을 **Schema** 로 나눴는지, **Database** 로 나눴는지, **Instance/Server** 로 나눴는지에 따라 접근 패턴이 완전히 달라진다.

### 6.1 Oracle — GRANT + SYNONYM

모듈 분리는 곧 **User (= Schema) 분리**.

```sql
-- B 가 자기 테이블을 A 에게 SELECT 권한 부여
GRANT SELECT ON B.ORDERS TO A;

-- Role 로 묶기 (권장)
CREATE ROLE B_READER;
GRANT SELECT ON B.ORDERS TO B_READER;
GRANT B_READER TO A;

-- 접근: 스키마 prefix 필수
SELECT * FROM B.ORDERS;

-- 투명화하려면 SYNONYM
CREATE SYNONYM A.ORDERS FOR B.ORDERS;     -- A 전용
CREATE PUBLIC SYNONYM ORDERS FOR B.ORDERS; -- 전체 사용자
```

- DB 경계를 넘으려면 **DB Link** : `SELECT * FROM B.ORDERS@remote_db`

### 6.2 MSSQL — GRANT ON SCHEMA::

모듈 분리는 **Schema 분리** (User 와 분리된 네임스페이스).

```sql
-- 스키마 단위 일괄 부여 (현재 + 미래 객체 모두 자동 적용)
GRANT SELECT ON SCHEMA::ModuleB TO ModuleA_User;

-- Database Role 로 묶기
CREATE ROLE ModuleB_Reader;
GRANT SELECT ON SCHEMA::ModuleB TO ModuleB_Reader;
ALTER ROLE ModuleB_Reader ADD MEMBER ModuleA_User;

-- 접근
SELECT * FROM ModuleB.Orders;
```

- **같은 인스턴스의 다른 DB** : 3-part naming `OtherDb.dbo.Orders` (대상 DB 에 User 매핑 필요, 또는 Cross-DB Ownership Chaining 활성화)
- **투명화** : `CREATE SYNONYM dbo.Orders FOR OtherDb.dbo.Orders;`
- **다른 인스턴스** : Linked Server → `SELECT * FROM [SRV].OtherDb.dbo.Orders`

### 6.3 PostgreSQL — USAGE + SELECT + DEFAULT PRIVILEGES

모듈 분리는 **Schema 분리**. **두 단계 권한 부여가 필수** — Oracle/MSSQL 과 다른 함정 포인트.

```sql
-- 1) 스키마 자체에 USAGE (이거 없으면 GRANT SELECT 가 무효)
GRANT USAGE ON SCHEMA module_b TO module_a;

-- 2) 스키마 내 객체에 SELECT
GRANT SELECT ON ALL TABLES IN SCHEMA module_b TO module_a;

-- 3) 미래 생성 테이블에도 자동 적용 (MSSQL 의 SCHEMA:: 와 같은 효과)
ALTER DEFAULT PRIVILEGES IN SCHEMA module_b
  GRANT SELECT ON TABLES TO module_a;

-- Role 로 묶기 (권장)
CREATE ROLE module_b_reader;
GRANT USAGE ON SCHEMA module_b TO module_b_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA module_b TO module_b_reader;
GRANT module_b_reader TO module_a;

-- 접근
SELECT * FROM module_b.orders;
-- 또는 search_path 로 투명화 (해당 세션 한정)
SET search_path TO module_a, module_b, public;
```

- **동일 클러스터의 다른 DB 는 직접 쿼리 불가** — 반드시 `postgres_fdw` (Foreign Data Wrapper) 또는 `dblink` 사용. FDW 가 표준 권장 (외부 테이블처럼 매핑).
- **다른 클러스터/서버** 도 동일하게 FDW.

### 6.4 SQLite — ATTACH DATABASE

사용자/스키마 개념이 없음. 다른 파일의 데이터를 읽으려면 세션에 붙인다.

```sql
ATTACH DATABASE '/path/to/module_b.db' AS module_b;
SELECT * FROM module_b.orders;
```

- 한계: `ATTACH` 는 **세션 단위** 라 커넥션마다 재호출 필요. 트랜잭션이 여러 ATTACH DB 에 걸리면 동시성 제약.
- 접근 제어는 **OS 파일 권한** 뿐.

### 6.5 한눈에 비교

| 시나리오                       | Oracle                | MSSQL                          | PostgreSQL                       | SQLite                |
| ------------------------------ | --------------------- | ------------------------------ | -------------------------------- | --------------------- |
| 같은 DB 내 다른 모듈           | `GRANT ON B.tbl`      | `GRANT ON SCHEMA::B`           | `GRANT USAGE + SELECT`           | (분리 자체 없음)      |
| 그룹 권한 묶기                 | Role                  | Database Role                  | Role (상속)                      | 없음                  |
| 미래 객체 자동 권한            | 별도 절차/트리거 필요  | `SCHEMA::` 부여로 자동 포함     | `ALTER DEFAULT PRIVILEGES`       | 해당 없음             |
| 같은 인스턴스의 다른 DB        | (보통 1 DB 운영)      | 3-part naming + User 매핑       | **불가** → FDW 필요              | `ATTACH`              |
| 다른 인스턴스/서버             | DB Link               | Linked Server                  | `postgres_fdw`                   | 해당 없음 (로컬만)    |
| 접근 투명화 (별칭)             | Synonym               | Synonym                        | `search_path` (별칭 객체 없음)   | `ATTACH` 별칭         |

### 6.6 DMES 권장 패턴

- **모듈 분리는 Schema 단위** 로 통일 (Oracle 만 User=Schema 라는 차이를 인지).
- 모듈 간 권한은 **Role 기반** 으로 설계 (`{module}_reader`, `{module}_writer`) → 4 DB 모두 호환.
- **Cross-DB 는 가능한 피한다** — PostgreSQL 이 직접 지원하지 않아 멀티 DB 호환의 발목이 된다.
- 접근 투명화가 필요할 때:
  - Oracle / MSSQL → **Synonym**
  - PostgreSQL → **search_path** (세션 단위)
  - SQLite → `ATTACH` 별칭

---

## 7. 참고

- 본 문서는 `docs/guide/Database/` 의 기존 Oracle ↔ MSSQL 차이 문서와 상보적으로 읽도록 구성되어 있다.
- 더 깊이 있는 SQL 문법/함수 차이는 별도 문서 참조:
  - `oracle-to-mssql-practical-guide.md`
  - `oracle-to-mssql-핵심요약.md`
