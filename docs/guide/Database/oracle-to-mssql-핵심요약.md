# Oracle → MSSQL 핵심 요약 (개발자/설계자용)

> **보관 자료 (2026-10-03)**: 운영 DB 는 Oracle 또는 PostgreSQL(현장마다 하나)이고 MSSQL 은 거의 쓰지 않는다. 이 문서는 dmes-ksm(MSSQL) 이관 시절 자료로 남겨 두며, MSSQL 현장을 맡을 때만 참고한다. 새 작업의 SQL 은 [`dialect-neutral-sql.md`](dialect-neutral-sql.md) 를 따른다.

> 시간 없는 팀원을 위해 3개 가이드를 한 장으로 압축했다. 이것만 외워도 마이그레이션/설계 사고는 막는다.

---

## 0. 한 줄 철학

- **Oracle** = 읽기 일관성 중심 DB (조회가 거의 안 막힌다)
- **MSSQL** = 락/구조 설계 중심 DB (기본 설정으로는 조회도 막힌다)

Oracle처럼 생각하고 MSSQL을 쓰면 100% 성능이 무너진다.

---

## 1. 반드시 알아야 할 TOP 5

### ① 동시성 모델 — 최우선 점검
- Oracle: MVCC 기본. `SELECT`가 `UPDATE`를 막지 않음.
- MSSQL: 기본 `READ COMMITTED`가 **잠금 기반**. `SELECT`도 `UPDATE`와 부딪히면 대기.
- **해결**: `ALTER DATABASE ... SET READ_COMMITTED_SNAPSHOT ON` 검토 (거의 필수).
- **주의**: `NOLOCK`은 해법이 아니다 — 더티 리드 허용일 뿐.
- **부작용**: RCSI를 켜면 버전 스토어가 `TempDB`로 몰린다 → TempDB I/O 튜닝 필수.

### ② 저장 구조 — 클러스터형 인덱스가 곧 테이블
- Oracle: 테이블(힙) + 인덱스(별도) 구조. ROWID로 직접 접근.
- MSSQL: **클러스터형 인덱스가 데이터 행의 물리 정렬 순서를 결정**.
- **보조 인덱스 탐색 시**: MSSQL은 보조 → 클러스터 키 → 다시 B-Tree 이중 탐색.
- **설계 철칙**: 클러스터형 키는 **좁고(narrow), 단조 증가하며(monotonic), 정적(static)** 인 정수형(`IDENTITY`)으로.
- 큰 문자열(이메일, 복합키)을 클러스터 키로 잡으면 모든 보조 인덱스가 비대해짐.

### ③ 데이터 타입 매핑 — 먼저 고정하라
| Oracle | MSSQL 권장 | 주의 |
|---|---|---|
| `DATE` | `datetime2` | `date`로 매핑하면 시간이 소리 없이 잘림 |
| `NUMBER(p,s)` | `decimal(p,s)` | 최대 38자리 동일 |
| `NUMBER` 정수 | `int` / `bigint` | 일괄 `decimal(38,10)` 금지, 프로파일링 후 결정 |
| `NUMBER(1)` 불리언 | `bit` | 상태값 있으면 `tinyint` |
| `VARCHAR2(n)` | `varchar(n)` / `nvarchar(n)` | 다국어면 `nvarchar` 표준화 |
| `CLOB` | `varchar(max)` / `nvarchar(max)` | — |

### ④ `''` vs `NULL`
- Oracle: 빈 문자열 `''` ≈ `NULL`
- MSSQL: `''` ≠ `NULL`
- Oracle 조건식 `WHERE col IS NULL`에 의존한 로직은 전수 점검.

### ⑤ 트리거는 항상 집합 기반
- Oracle: 기본 `FOR EACH ROW`, `:OLD` / `:NEW` 단일 행.
- MSSQL: **statement-level만 존재**. 1천 행 UPDATE도 트리거 1번 실행.
- 변경 데이터는 가상 테이블 `inserted` / `deleted` (여러 행 담김).
- **치명적 실수**: `SELECT @var = col FROM inserted` → 1행만 잡고 나머지 무시됨.
- **반드시**: `inserted`/`deleted`와 타겟 테이블을 **JOIN**하는 집합 연산으로 재작성.

---

## 2. SQL 치트시트

### 기본 함수/구문
| Oracle | MSSQL |
|---|---|
| `NVL(a,b)` | `ISNULL(a,b)` 또는 `COALESCE(...)` ← 다중 인수면 이걸로 |
| `DECODE` | `CASE WHEN ... THEN` |
| `SYSDATE` / `SYSTIMESTAMP` | `GETDATE()` / `SYSDATETIME()` |
| `ROWNUM` / `FETCH FIRST n ROWS` | `TOP (n)` 또는 `OFFSET ... FETCH NEXT` |
| `LISTAGG(c, ',') WITHIN GROUP (...)` | `STRING_AGG(c, ',') WITHIN GROUP (...)` |
| `TRUNC(SYSDATE, 'MM')` | `DATETRUNC(month, SYSDATETIME())` |
| `a \|\| b` | `a + b` 또는 `CONCAT(a,b)` |
| `TO_DATE` / `TO_CHAR` | `CAST` / `CONVERT(..., style)` |
| `FROM DUAL` | 불필요 (생략) |
| 스크립트 종결 `/` | 배치 구분 `GO` (클라 도구 전용, ADO/JDBC에 넣으면 안 됨) |

### INSERT 후 키 회수
```sql
-- Oracle
INSERT INTO orders(id, ...) VALUES (orders_seq.NEXTVAL, ...)
RETURNING id INTO :p_new_id;

-- MSSQL (권장)
INSERT INTO dbo.Orders(...) OUTPUT INSERTED.id INTO @ids(id) VALUES (...);
-- 또는 단건: SELECT SCOPE_IDENTITY();
-- ⚠ @@IDENTITY 는 트리거 영향으로 잘못된 값 반환 가능 → 사용 금지
```

### UPDATE 패턴
```sql
-- Oracle: 상관 서브쿼리
UPDATE t SET amount = (SELECT s.amount FROM source s WHERE s.id = t.id)
WHERE EXISTS (SELECT 1 FROM source s WHERE s.id = t.id);

-- MSSQL: JOIN 기반 (기본)
UPDATE t SET t.amount = s.amount
FROM dbo.target t JOIN dbo.source s ON s.id = t.id;
```

### 예외/트랜잭션
```sql
-- Oracle
BEGIN
  ...
EXCEPTION
  WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

-- MSSQL
BEGIN TRY
  BEGIN TRAN;
  ...
  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;
-- SET XACT_ABORT ON 을 상황에 따라 검토
```

### 페이징
```sql
-- MSSQL 2012+ (표준, 권장)
SELECT ... FROM t ORDER BY id
OFFSET 100 ROWS FETCH NEXT 20 ROWS ONLY;
```

---

## 3. 흔한 함정 (초보자 사고 유발 TOP)

1. **암시적 변환으로 인덱스 무력화**
   - MSSQL 타입 우선순위: `NVARCHAR > VARCHAR`, `INT > VARCHAR`.
   - JDBC/ORM이 파라미터를 `NVARCHAR`로 보내면 `VARCHAR` 컬럼을 전부 `CONVERT_IMPLICIT`로 감싸며 **Index Scan 강제**.
   - 대책: 컬럼 타입을 애플리케이션 바인드 타입과 통일, 또는 명시적 `CAST`.
   - 감지: Extended Events의 `plan_affecting_convert` 추적.

2. **임시 테이블 남용**
   - Oracle GTT: 정의 1회, 데이터만 세션별 격리.
   - MSSQL `#temp`: 매 실행마다 TempDB에 실제 객체 생성/삭제 → 메타데이터 래치 경합 + 재컴파일 폭증.
   - 대체: 집합 쿼리로 병합, 또는 `@table` 변수.

3. **`MERGE` 맹신**
   - MSSQL `MERGE`는 만능문이 아니며, 단순 upsert는 `INSERT`/`UPDATE` 분리가 더 빠르고 안전하다 (MS 공식 권고).

4. **DDL 트랜잭션 감각**
   - Oracle: DDL 전후 암묵 COMMIT.
   - MSSQL: DDL도 트랜잭션의 일부. `BEGIN TRAN` 안에서 롤백 가능.

5. **시퀀스 vs IDENTITY**
   - 단일 테이블: `IDENTITY` 표준.
   - 다중 테이블 공유 번호, 사전 할당: `SEQUENCE` (SQL Server 2012+).
   - 기존 키 보존 적재: `SET IDENTITY_INSERT ON`.

---

## 4. 운영/튜닝 도구 매핑

| Oracle | MSSQL |
|---|---|
| AWR / ASH / ADDM | **Query Store** (2016+, 2022부터 기본 READ_WRITE) |
| `DBMS_XPLAN.DISPLAY_CURSOR` | SSMS 실행 계획, Query Store 대시보드 |
| SQL Tuning Advisor | Query Store의 Force Plan (회귀 쿼리 1클릭 고정) |
| SQL Trace / 10046 | **Extended Events** (Profiler는 버릴 것) |
| RMAN + archived redo | Full / Differential / **Log backup 체인** + 복구 모델 |
| Data Guard | **Always On 가용성 그룹** (Standard는 Basic AG), 로그 전달 |
| RAC | FCI(장애 조치 클러스터) — 스케일아웃 철학은 다름 |
| `SPFILE` / init.ora | `sp_configure` (서버) + `ALTER DATABASE` (DB) + 파일그룹 |
| ASM / TEMP | 파일그룹 + **TempDB** (별도 튜닝 필수) |

### 기본 운영 셋팅 체크
```sql
-- Query Store 켜기
ALTER DATABASE [AppDB] SET QUERY_STORE = ON;

-- RCSI (활성 연결 없는 점검창에서)
ALTER DATABASE [AppDB] SET READ_COMMITTED_SNAPSHOT ON;

-- 서버 메모리
EXEC sp_configure 'max server memory (MB)', 57344; -- 환경별 조정
RECONFIGURE;
```

---

## 5. 보안 — 주체 분리 감각

- Oracle: 사용자 ≈ 스키마, CDB/PDB의 common/local 개념.
- MSSQL: **Login(서버) ≠ User(DB)** 로 이원화. Server Role / DB Role / Securable 계층 구조.
- 데이터 보호 매핑:
  - TDE: 양쪽 동일 개념
  - Unified Auditing → **SQL Server Audit**
  - VPD / Data Redaction → **RLS(행 보안)** + **DDM(결과 마스킹)** + **Always Encrypted**
- 운영 경고: `cross-db ownership chaining` 인스턴스 전체 활성화 금지, `TRUSTWORTHY` 남용 금지 — 인증서 서명 기반 권장.

---

## 6. 아키텍처 용어 매핑 (헷갈림 방지)

| Oracle | MSSQL | 비고 |
|---|---|---|
| Instance (SGA+프로세스) | Instance (단일 서비스) | Oracle=멀티프로세스, MSSQL=멀티스레드 |
| Database (물리 파일 집합) | Database (개별 DB) | **1 인스턴스 : 1 DB → 1 : N** |
| Tablespace | Filegroup | I/O 분산 단위 |
| Schema (≈User) | Schema (DB 내 네임스페이스) | MSSQL은 User와 Schema 분리 |
| User / Role | Login + User + Role | 2단계 권한 |

---

## 7. 마이그레이션 체크리스트 (cutover 전)

### 스키마
- [ ] `DATE` → `datetime2` 전수 변환
- [ ] `NUMBER` 프로파일링 후 `int`/`bigint`/`decimal`/`bit` 분류
- [ ] 문자열 `varchar` vs `nvarchar` 정책 확정 (콜레이션 포함)
- [ ] `''` ≈ `NULL` 의존 로직 식별
- [ ] 클러스터형 인덱스 후보 + 포함 열(INCLUDE) + 필터드 인덱스 설계

### 코드
- [ ] `NVL`/`LISTAGG`/`TRUNC`/`DECODE`/`RETURNING INTO` 매핑 완료
- [ ] PL/SQL `EXCEPTION` → T-SQL `TRY...CATCH` + `THROW` + `XACT_STATE()`
- [ ] **트리거 전수 재작성** (집합 기반 JOIN)
- [ ] `@@IDENTITY` 제거, `SCOPE_IDENTITY()` / `OUTPUT` 표준화
- [ ] 상관 UPDATE → JOIN UPDATE 전환

### 데이터 적재
- [ ] 기존 키 유지 vs 재생성 정책 결정
- [ ] `SET IDENTITY_INSERT` 필요 대상 분류
- [ ] 대용량은 SSIS/BCP 병렬 처리

### 성능/운영
- [ ] **Query Store 켜고 baseline 수집 후 cutover**
- [ ] `READ_COMMITTED_SNAPSHOT` 적용 여부 기능 테스트와 함께 결정
- [ ] TempDB 다중 파일/별도 스토리지 배치
- [ ] 로그 백업 체인 + 복구 모델 확정
- [ ] Extended Events로 `plan_affecting_convert` 모니터링
- [ ] Always On AG / 로그 전달 / FCI 중 HA 전략 결정

### 보안
- [ ] Login / User / Role 3계층 권한 설계
- [ ] TDE / Audit / RLS / DDM / Always Encrypted 범위 분리

---

## 8. 도구

- **자동 변환**: Microsoft **SSMA for Oracle** (무료). 평가 보고서 → 변환 → 수동 보정 순.
- 변환 불가(동적 PL/SQL, 복잡 패키지, 중첩 테이블)는 조기 식별.
- "Fix Before Shift" — 오라클 환경에서 먼저 기술 부채 정리 후 이관.

---

## 9. 암기용 결론 3줄

1. **RCSI, 클러스터 인덱스, 트리거 집합화** — 이 3개가 전부의 절반.
2. **`DATE`→`datetime2`, `NUMBER` 세분화, `''`≠`NULL`** — 데이터 사고의 90%.
3. **Query Store + Extended Events** — MSSQL의 AWR/ASH는 이것이다.
