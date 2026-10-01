# 레거시 DB package/procedure/function 분석 상세 절차

> 본 파일명(plsql-analysis.md) 은 부산 시절 그대로 보존. 의미는 "레거시 DB(Oracle PL/SQL · PostgreSQL PL/pgSQL · MSSQL T-SQL) Package / Stored Procedure / Function 분석" 으로 사용. 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) §3 에서 **판정된 원천 DBMS 의 방언 열**을 적용한다. 아래 절차의 `DBMS` 는 Step 0 의 판정 결과(`ORACLE` / `POSTGRESQL` / `MSSQL`)다.

## Step 0: 사전 검증 (필수)

1. **파라미터 검증**
   - NAME 필수 입력 확인
   - 빈 값 또는 null 시 에러 메시지 출력 후 종료
2. **원천 DBMS 판정** — vocabulary-mapping.md §3-1
   ```javascript
   // ① 호출자가 프롬프트로 넘긴 값 → ② README 의 "원천 DBMS:" 줄 → ③ (Step 1 본문 Read 후) 문법 단서 → ④ AskUserQuestion
   let DBMS = callerProvided || readDbmsFromReadme('docs/external/SampleErp/README.md');  // null 가능
   // SQLite 면 저장 프로시저가 없으므로 안내 후 종료 (트리거·뷰·앱 inline SQL 스킬 안내)
   ```

---

## Step 0.5: 기존 분석 문서 검색

NAME 을 Step 1-1 규칙으로 해석한 이름(Oracle `PKG.PROC` → `PKG`, 스키마 접두 `dbo.X`·`sales.X` → `X`)으로 예상 파일명 `{해석된 이름}_analysis_report.md` 를 만들어 순차 검색. 원래 NAME 그대로 쓰지 않는다 — 재귀 분석(Step 3.5)·Phase 3 위임과 같은 파일명을 써야 중복 분석이 생기지 않는다.

### 0.5-1. 검색 순서

```javascript
// 모듈별 + 공유 디렉토리 모두 검색
const found = Glob("docs/external/SampleErp/orgErpReport/**/{NAME}_analysis_report.md");
```

### 0.5-2. 검색 결과 처리

**케이스 1: 발견됨** → 사용자에게 확인
```
"기존 분석 문서가 있습니다: {경로}. 재분석하시겠습니까?"
```
- 재분석 거부 → 기존 문서 경로 안내 후 종료
- 재분석 승인 → Step 1 진행

**케이스 2: 어디에도 없음** → Step 1 진행

---

## Step 1: SQL 본문 검색 (정적 파일 직접 Read)

### 1-1. 정적 파일 위치 확인

```javascript
// 점(.)이 있는 NAME 해석: X.Y 는 procedures/X*.sql 이 있을 때만 Oracle PACKAGE.멤버, 아니면 X 를 스키마 접두로 보고 Y 를 찾는다
//   예) PKG_ORDER.PROC_SAVE → 패키지 PKG_ORDER (진입점 PROC_SAVE) / dbo.doAddress·sales.fn_x → doAddress·fn_x
let SEARCH_NAME = NAME, ENTRY_MEMBER = null;
if (NAME.includes('.')) {
  const [x, y] = NAME.split('.').slice(-2);
  if (Glob(`docs/external/SampleErp/procedures/${x}*.sql`).length > 0) { SEARCH_NAME = x; ENTRY_MEMBER = y; }
  else { SEARCH_NAME = y; }
}

const candidates = [
  `docs/external/SampleErp/procedures/${SEARCH_NAME}.sql`,   // Stored Procedure (Oracle 은 PACKAGE 도 여기)
  `docs/external/SampleErp/functions/${SEARCH_NAME}.sql`,    // Function (PostgreSQL 트리거 함수 포함)
  `docs/external/SampleErp/views/${SEARCH_NAME}.sql`,        // View
  `docs/external/SampleErp/triggers/${SEARCH_NAME}.sql`      // Trigger
];

const found = [];
for (const path of candidates) {
  if (fileExists(path)) found.push(path);
}
// Oracle PACKAGE 가 SPEC/BODY 로 나뉜 경우 (예: PKG_SPEC.sql + PKG_BODY.sql) — 함께 읽을 한 묶음으로 취급
if (found.length === 0) found.push(...Glob(`docs/external/SampleErp/procedures/${SEARCH_NAME}*.sql`));
```

### 1-2. 검색 결과 처리 분기

**케이스 1: 1개 발견** → 자동 선택

**케이스 2: 2개 이상 발견** → AskUserQuestion 으로 선택
```javascript
if (found.length > 1) {
  const options = found.map(path => ({
    label: path.split('/').slice(-2, -1)[0],   // 폴더명 (procedures/functions/...)
    description: path,
    value: path
  }));
  const answer = await AskUserQuestion({
    questions: [{
      question: `'${NAME}' 정의가 ${found.length}개 위치에서 발견되었습니다. 분석할 파일을 선택하세요.`,
      header: "오브젝트 선택",
      multiSelect: false,
      options: options
    }]
  });
}
```

**케이스 3: 어디에도 없음** → 종료

### 1-3. 선택된 파일 정보 추출

```javascript
const SQL_FILE_PATH = selectedPath;
const OBJECT_NAME = SEARCH_NAME;   // 해석된 이름 (패키지명 또는 스키마 접두를 뗀 객체명). 보고서 파일명·재귀 키·링크 모두 이 값 기준
// ENTRY_MEMBER 가 있으면 §1·§3 에 "진입점 멤버" 로만 표시
const FOLDER_KIND = SQL_FILE_PATH.split('/').slice(-2, -1)[0];  // 'procedures' / 'functions' / ...

// 본문 읽기
const sourceCode = readFile(SQL_FILE_PATH);

// 원천 DBMS 미판정이면 본문 문법 단서로 확정 (vocabulary-mapping.md §3-1 표), 그래도 불가면 AskUserQuestion
if (!DBMS) DBMS = detectDialect(sourceCode);   // 'ORACLE' | 'POSTGRESQL' | 'MSSQL' | null

// CREATE 헤더에서 정확한 타입 감지 (OR REPLACE = Oracle·PostgreSQL, OR ALTER = MSSQL)
const CREATE = String.raw`CREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:(?:NON)?EDITIONABLE\s+)?`;
let TYPE;
if (new RegExp(CREATE + 'PACKAGE', 'i').test(sourceCode)) TYPE = 'PACKAGE';          // Oracle 만
else if (new RegExp(CREATE + 'PROCEDURE', 'i').test(sourceCode)) TYPE = 'PROCEDURE';
else if (new RegExp(CREATE + 'FUNCTION', 'i').test(sourceCode)) TYPE = 'FUNCTION';
else if (new RegExp(CREATE + 'VIEW', 'i').test(sourceCode)) TYPE = 'VIEW';
else if (new RegExp(CREATE + 'TRIGGER', 'i').test(sourceCode)) TYPE = 'TRIGGER';
else TYPE = FOLDER_KIND.toUpperCase();

// 기본 스키마: 헤더에 스키마 접두가 있으면 그 값, 없으면 방언 기본값
const SCHEMA_NAME = schemaFromHeader(sourceCode) ?? { ORACLE: null, POSTGRESQL: 'public', MSSQL: 'dbo' }[DBMS];
const qualify = (name) => SCHEMA_NAME ? `${SCHEMA_NAME}.${name}` : name;   // 보고서·로그 표기용
```

> `PACKAGE` / `PACKAGE BODY` 처리는 Oracle 에만 해당한다. PostgreSQL·MSSQL 은 패키지 개념이 없으므로 생략.

---

## Step 2: 파일 타입별 구조 분석

### 2-1. 분석 전략 결정
```javascript
if (TYPE === 'PACKAGE') {
  analysisStrategy = 'PACKAGE_ANALYSIS';          // Oracle: SPEC 멤버 목록 → BODY 의 멤버별 분석
} else if (TYPE === 'PROCEDURE') {
  analysisStrategy = 'SINGLE_PROCEDURE_ANALYSIS';
} else if (TYPE === 'FUNCTION') {
  analysisStrategy = 'SINGLE_FUNCTION_ANALYSIS';
} else if (TYPE === 'VIEW') {
  analysisStrategy = 'VIEW_ANALYSIS';
} else if (TYPE === 'TRIGGER') {
  analysisStrategy = 'TRIGGER_ANALYSIS';
}
```

> Oracle 은 PACKAGE 단위로 묶어 분석한다 — SPEC 에서 공개 멤버를, BODY 에서 비공개 멤버까지 모아 §3 에 멤버별로 전개하고, 같은 패키지 안 호출은 "내부 호출" 로 분류한다. MSSQL·PostgreSQL 은 패키지 단위가 없어 단일 객체로 분석하고 보고서 §1 에 "패키지 없음" 명시.

### 2-2. 기본 메타데이터 수집

- 오브젝트명, 스키마명 (`SCHEMA_NAME` — 방언 기본값), 타입, **원천 DBMS**
- 전체 코드 줄 수, 분석 일시 (KST)
- 파일 수준 주석 파싱 (작성자, 버전, 생성일자 — SampleErp 헤더 패턴: `-- 작성자: PSH` 등)

### 2-3. 헤더 파라미터 추출

방언별 헤더 형태로 추출한다. (Oracle 은 PACKAGE 면 SPEC 의 멤버 선언마다 반복)

**Oracle PL/SQL**:
```sql
CREATE OR REPLACE PROCEDURE DO_ADDRESS (
  p_addr_id  IN  NUMBER,
  p_addr_txt IN  VARCHAR2,
  p_res_code OUT NUMBER
) IS
  v_cnt NUMBER;
BEGIN
  ...
END DO_ADDRESS;
/
```

**PostgreSQL PL/pgSQL**:
```sql
CREATE OR REPLACE FUNCTION fn_get_comm_name(p_cd_grp_id text, p_cd_id text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text;
BEGIN
  ...
  RETURN v_name;
END;
$$;
```

**MSSQL T-SQL** — procedure 의 경우:
```sql
CREATE PROCEDURE [dbo].[doAddress]
  @AddrId  INT,
  @AddrTxt NVARCHAR(200),
  @ResCode INT OUTPUT
AS
BEGIN
  ...
END
```

MSSQL 함수의 경우:
```sql
CREATE FUNCTION [dbo].[FNGETCOMMNAME]
(@CdGrpId NVARCHAR(20), @CdId NVARCHAR(20))
RETURNS NVARCHAR(100)
AS
BEGIN
  ...
END
```

추출 항목: 파라미터명, 타입(방언 타입 그대로 — `VARCHAR2`·`NUMBER` / `text`·`numeric` / `NVARCHAR(200)`·`DECIMAL(18,2)` 등), 모드(IN/OUT/IN OUT · INOUT · OUTPUT), 리턴타입(FUNCTION — PostgreSQL 은 `RETURNS SETOF`/`RETURNS TABLE(...)` 포함).

---

## Step 3: 본문 심층 분석

### 3-1. 본문 영역 식별

본문 영역 추출 후 변수 선언, 비즈니스 로직, 예외 처리 영역 분리.

| 방언 | 본문 영역 | 변수 선언 | 예외 처리 영역 |
|---|---|---|---|
| Oracle | `IS\|AS` ~ `BEGIN ... END 이름;` | `IS` 와 `BEGIN` 사이 (`v_x NUMBER;`) | `EXCEPTION` 이후 ~ `END` |
| PostgreSQL | `$$ ... $$` (또는 `$tag$`) 안의 `DECLARE ... BEGIN ... END;` | `DECLARE` 절 (`v_x int;`) | `EXCEPTION` 이후 ~ `END` |
| MSSQL | `AS BEGIN ... END` | `DECLARE @v INT` | `BEGIN CATCH ... END CATCH` |

### 3-2. 8개 항목 분석

각 procedure/function 본문에 대해:

1. **비즈니스 목적 추론**: 핵심 업무, 입출력 추론. 헤더 주석 우선 활용.
2. **실행 흐름 분석**: BEGIN-END 단계별 순차 분석. SAVEPOINT(또는 `SAVE TRANSACTION`) 위치 명시.
3. **제어 흐름 분석**: `IF/ELSIF/ELSE`(MSSQL `IF/ELSE`), `LOOP`/`WHILE`/`FOR`, `CASE WHEN`, `GOTO`(레거시) 등.
4. **데이터 접근 패턴**: SELECT/INSERT/UPDATE/DELETE/MERGE 모두 추출.
5. **비즈니스 규칙 추출**: 검증, 계산, 특수처리.
6. **트랜잭션 제어** (판정 방언만):
   - Oracle: `SAVEPOINT sp1`, `ROLLBACK TO sp1`, `COMMIT`, `ROLLBACK` (트랜잭션은 암묵 시작), `PRAGMA AUTONOMOUS_TRANSACTION` 블록은 별도 표시
   - PostgreSQL: FUNCTION 안에서는 `COMMIT` 불가 — 호출자 트랜잭션에 묶임. PROCEDURE(11+)는 `COMMIT`/`ROLLBACK` 가능. `EXCEPTION` 블록 진입 시 암묵 SAVEPOINT 로 블록 안 변경이 롤백됨
   - MSSQL: `BEGIN TRAN`, `SAVE TRANSACTION sp1`, `COMMIT TRANSACTION`, `ROLLBACK TRANSACTION [sp1]`, `@@TRANCOUNT`, `SET XACT_ABORT ON`
7. **예외 처리** (판정 방언만):
   - Oracle: `EXCEPTION WHEN NO_DATA_FOUND / DUP_VAL_ON_INDEX / OTHERS THEN ...`, `RAISE_APPLICATION_ERROR(-20001, 'msg')`, `SQLCODE`·`SQLERRM`
   - PostgreSQL: `EXCEPTION WHEN unique_violation / no_data_found / OTHERS THEN ...`, `RAISE EXCEPTION 'msg' USING ERRCODE = '...'`, `GET STACKED DIAGNOSTICS`
   - MSSQL: `BEGIN TRY ... END TRY BEGIN CATCH ... END CATCH`, `RAISERROR('msg', severity, state)`, `THROW err_num, 'msg', state`, `ERROR_NUMBER()`·`ERROR_MESSAGE()`
8. **외부 의존성**: 호출 package/procedure/function — 본문 정규식 (Step 3-6)

### 3-3. 커서 루프 상세 분석

판정 방언의 패턴으로 커서를 찾는다.

**Oracle 커서 패턴**:
```sql
CURSOR c_list IS SELECT col1, col2 FROM tbl WHERE ...;   -- 선언부
...
FOR rec IN c_list LOOP            -- 또는 FOR rec IN (SELECT ...) LOOP
  -- 처리 내용
END LOOP;
-- 명시적: OPEN c_list; LOOP FETCH c_list INTO v1, v2; EXIT WHEN c_list%NOTFOUND; ... END LOOP; CLOSE c_list;
```

**PostgreSQL 커서 패턴**:
```sql
FOR rec IN SELECT col1, col2 FROM tbl WHERE ... LOOP
  -- 처리 내용
END LOOP;
-- 명시적: DECLARE c CURSOR FOR SELECT ...; OPEN c; LOOP FETCH c INTO v1, v2; EXIT WHEN NOT FOUND; ... END LOOP; CLOSE c;
-- 동적: FOR rec IN EXECUTE format('SELECT ... FROM %I', tbl) LOOP ... END LOOP;
```

**MSSQL 커서 패턴**:
```sql
DECLARE @v1 INT, @v2 NVARCHAR(50);
DECLARE c CURSOR FOR
  SELECT col1, col2 FROM tbl WHERE ...;
OPEN c;
FETCH NEXT FROM c INTO @v1, @v2;
WHILE @@FETCH_STATUS = 0
BEGIN
  -- 처리 내용
  FETCH NEXT FROM c INTO @v1, @v2;
END
CLOSE c;
DEALLOCATE c;
```

**각 커서별 분석 항목**:
1. 커서 SQL 추출 (커서 선언 또는 `FOR ... IN` 의 SELECT 본문)
2. 커서 목적 (조회 데이터 및 용도)
3. 반복 범위 (예상 행 수)
4. 루프 내 작업 (DML, 조건 분기 등)
5. 중첩도 (커서 안의 커서 또는 WHILE)

분석 결과는 템플릿 § 3 "커서 루프 상세 분석" 형식으로 작성. 헤딩은 부산 그대로 두고 어휘만 매핑.

### 3-4. 비즈니스 규칙 표 생성

**검증 규칙 추출 패턴** (판정 방언만):
```sql
-- Oracle
IF [조건] THEN
  RAISE_APPLICATION_ERROR(-20001, '[메시지]');
END IF;

-- PostgreSQL
IF [조건] THEN
  RAISE EXCEPTION '[메시지]';
END IF;

-- MSSQL
IF [조건]
BEGIN
  RAISERROR('[메시지]', 16, 1);
  RETURN;
END

-- 또는
IF [조건]
  THROW 50001, '[메시지]', 1;
```

수집한 규칙들을 템플릿 § 3 "비즈니스 규칙" 표 형식으로 정리.

### 3-5. 데이터 플로우 생성

입력 → 처리 → 출력 흐름을 추적하여 템플릿 § 4 "데이터 플로우" 형식으로 작성.

### 3-6. 호출 procedure/function 감지

판정된 원천 DBMS 의 패턴만 적용한다. 다른 방언 패턴을 섞으면 오탐이 늘어난다(예: Oracle 본문의 `EXECUTE IMMEDIATE` 를 MSSQL `EXEC X` 로 오인).

**Oracle PL/SQL**:
```sql
-- 1. 패키지 멤버 / 독립 procedure 호출 (블록 안 단독 문장)
PKG_ORDER.PROC_SAVE(p_id, v_res);
OWNER.PKG_ORDER.PROC_SAVE(p_id, v_res);
PROC_LOCAL(p_id);                      -- 같은 패키지 멤버 또는 독립 procedure
-- 2. 함수 호출 (식 안)
v_name := PKG_COMM.FN_GET_NAME(p_cd);
SELECT PKG_COMM.FN_GET_NAME(cd) FROM tbl;
-- 3. 동적 SQL (제한적 분석)
EXECUTE IMMEDIATE v_sql USING p_id;
```

**PostgreSQL PL/pgSQL**:
```sql
-- 1. procedure 호출 (11+)
CALL sp_save_order(p_id, v_res);
-- 2. 결과를 버리는 함수 호출 / 값을 받는 함수 호출
PERFORM fn_write_log(p_id);
v_name := fn_get_comm_name(p_cd);
SELECT fn_get_comm_name(cd) FROM tbl;
-- 3. 집합 반환 함수
SELECT * FROM fn_list_orders(p_date);
-- 4. 동적 SQL (제한적 분석)
EXECUTE format('UPDATE %I SET ... WHERE id = $1', v_tbl) USING p_id;
```

**MSSQL T-SQL**:
```sql
-- 1. EXEC / EXECUTE 호출
EXEC dbo.procName @p1, @p2;
EXECUTE dbo.procName(@p1, @p2);
EXEC procName @p1;
-- 2. 함수 호출 (스칼라)
SELECT dbo.fnName(@p) AS result;
SET @v = dbo.fnName(@p);
-- 3. 테이블값 함수 호출
SELECT * FROM dbo.tvfName(@p);
-- 4. 동적 SQL (제한적 분석)
EXEC sp_executesql @sqlText, @paramDef, @p1, @p2;
```

**감지 정규식**:
```javascript
const ID = String.raw`(?:"[^"]+"|\[[^\]]+\]|\w+)`;   // 인용 식별자 3형태 + 무인용
const callPatterns = {
  ORACLE: [
    /\b(\w+)\.(\w+)\s*\(/gi,                                           // PKG.PROC(...) / PKG.FN(...) — 테이블 별칭.컬럼( 오탐은 문맥 검증
    /\b(\w+)\.(\w+)\.(\w+)\s*\(/gi,                                    // OWNER.PKG.PROC(...)
    /^\s*(\w+)\s*\([^;]*\)\s*;/gim,                                    // 블록 안 단독 문장 PROC(...);
    /:=\s*(\w+(?:\.\w+)?)\s*\(/gi,                                     // v := FN(...)
    /\bEXECUTE\s+IMMEDIATE\b/gi,                                       // 동적 SQL (대상 미상 — 기록만)
  ],
  POSTGRESQL: [
    /\bCALL\s+(?:(\w+)\.)?(\w+)\s*\(/gi,                               // CALL [schema.]p(...)
    /\bPERFORM\s+(?:(\w+)\.)?(\w+)\s*\(/gi,                            // PERFORM [schema.]f(...)
    /:=\s*(?:(\w+)\.)?(\w+)\s*\(/gi,                                   // v := f(...)
    /\bFROM\s+(?:(\w+)\.)?(\w+)\s*\(/gi,                               // SELECT * FROM f(...)
    /\bEXECUTE\s+format\s*\(/gi,                                       // 동적 SQL (기록만)
  ],
  MSSQL: [
    new RegExp(String.raw`\bEXEC(?:UTE)?\s+(?:${ID}\.)?(${ID})`, 'gi'),  // EXEC [dbo.]X
    /\bdbo\.\[?(\w+)\]?\s*\(/gi,                                       // dbo.X(...)
    /\bsp_executesql\b/gi,                                             // 동적 SQL (기록만)
  ],
}[DBMS];
// 공통 후처리: 내장 함수(NVL, COALESCE, TO_CHAR, ISNULL, CONVERT ...)·SQL 키워드·테이블 별칭 제외
```

> 정적 파일만 다루므로 `ALL_DEPENDENCIES`·`pg_depend`·`sys.sql_expression_dependencies` 같은 메타 카탈로그 접근 불가. 본문 정규식이 유일한 방법.

**호출 목록 구조**:
```javascript
calledObjects.push({
  owner: SCHEMA_NAME,       // 호출 구문에 스키마/소유자 접두가 있으면 그 값
  package: "PKG_ORDER",     // Oracle 패키지 멤버 호출일 때만, 그 외 null
  name: "doSelectJobList",
  type: "PROCEDURE",        // 또는 FUNCTION
  internal: false,          // Oracle 같은 패키지 안 호출이면 true (재귀 분석 대상 아님)
  calledFrom: "MAIN_LOGIC",
  callContext: "라인 번호 또는 코드 위치",
  purpose: "호출 맥락에서 추론한 목적"
});
```

---

## Step 3.5: 호출 procedure 재귀 분석

**⚠️ 중요**: 분석 대상 procedure 가 호출하는 모든 외부 procedure/function 을 재귀적으로 분석한다.

### 3.5-1. 재귀 분석 대상 결정

기존 보고서를 검색.

```javascript
for (const called of calledObjects.filter(c => !c.internal)) {
  // Oracle 패키지 멤버면 패키지 단위 보고서를 찾는다
  const fileName = (called.package || called.name) + "_analysis_report.md";

  // 모듈별 + 공유 디렉토리 모두 검색
  const found = Glob(`docs/external/SampleErp/orgErpReport/**/${fileName}`);

  if (found.length > 0) {
    called.reportPath = found[0];
    called.alreadyAnalyzed = true;
  } else {
    called.alreadyAnalyzed = false;
  }
}
```

### 3.5-2. 재귀 분석 실행

미분석 오브젝트에 대해 Step 1~6 전체를 재귀적으로 실행한다.

### 3.5-3. 재귀 깊이 제한

```javascript
const MAX_RECURSIVE_DEPTH = 3;

function analyzeWithDepth(objectName, currentDepth) {
  if (currentDepth >= MAX_RECURSIVE_DEPTH) {
    LOG.warn(`⚠️ 최대 재귀 깊이(${MAX_RECURSIVE_DEPTH}) 도달: ${qualify(objectName)} - 호출 기록만 남기고 분석 생략`);
    return { skipped: true, reason: "최대 재귀 깊이 초과" };
  }
  // ... 분석 수행 (currentDepth + 1 전달)
}
```

### 3.5-4. 순환 참조 방지

```javascript
const analyzedSet = new Set();

function isAlreadyInProgress(name) {
  const key = qualify(name);   // 방언 기본 스키마 포함 (Oracle 패키지는 패키지명)
  if (analyzedSet.has(key)) {
    LOG.warn(`⚠️ 순환 참조 감지: ${key} - 분석 생략`);
    return true;
  }
  analyzedSet.add(key);
  return false;
}
```

### 3.5-5. 호출 procedure 요약 정보 수집

```javascript
for (const called of calledObjects) {
  if (called.reportPath && called.alreadyAnalyzed) {
    const report = readFile(called.reportPath);
    called.summary = extractSummaryFromReport(report);
    // summary: 비즈니스 목적, 주요 입출력 테이블, procedure/function 수, 총 코드 라인 수
  }
}
```

---

## Step 4: 테이블 의존성 및 ER 관계 추출

### 4-1. 테이블 목록 수집

```javascript
// 스키마 접두(dbo. / public. / OWNER.)와 인용 기호([], "")를 허용
const tablePattern = /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(?:(?:\[[^\]]+\]|"[^"]+"|\w+)\.)?(\[[^\]]+\]|"[^"]+"|\w+)/gi;
const tables = new Set();
allBodies.forEach(body => {
  const matches = body.matchAll(tablePattern);
  for (const match of matches) {
    let t = match[1].replace(/[\[\]"]/g, '');
    // 방언별 시스템 객체 제외 — Oracle DUAL·ALL_*/USER_*/DBA_*/V$*, PostgreSQL pg_*·information_schema, MSSQL sys.*·INFORMATION_SCHEMA
    if (!isSystemTable(t, DBMS)) tables.add(t);
  }
});
```

### 4-2. 테이블 정의 보강

발견된 각 테이블에 대해 `docs/external/SampleErp/tables/{테이블명}.sql` Read 시도. 발견 시 `CREATE TABLE` 본문에서 컬럼/타입/PK/FK/INDEX 정확히 추출.

### 4-3. 테이블별 역할 분류

1. **입력 임시 테이블**: `_TMP`, `_TEMP` 패턴(MSSQL `#tmp`, Oracle GLOBAL TEMPORARY TABLE, PostgreSQL `CREATE TEMP TABLE`), 주로 DELETE 대상
2. **마스터 테이블**: `_MST`, `_MASTER` 패턴, SELECT 빈도 높음
3. **상세/이력 테이블**: `_DTL`, `_DETAIL`, `_HST`, `_HISTORY` 패턴, INSERT/UPDATE 대상
4. **전표/문서 테이블**: `_DOC`, `_HDR` 패턴, 자동 증가(Oracle 시퀀스 `NEXTVAL` · PostgreSQL `nextval()`/`SERIAL` · MSSQL `IDENTITY`) 또는 채번 함수 사용

### 4-4. JOIN 관계 추출

```sql
FROM table1 t1
INNER JOIN table2 t2 ON t1.col = t2.col
LEFT JOIN table3 t3 ON t2.col = t3.col
```

추출한 관계를 템플릿 § 5 "ER 다이어그램" 형식으로 작성.

---

## Step 5: Mermaid 워크플로우 다이어그램 생성

### 5-1. 주요 비즈니스 프로세스 식별

진입점 procedure 기준으로 플로우 추적:
- 진입점 procedure (메인 procedure) 선택
- 호출 순서 추적: A → B → C
- 조건 분기 식별: IF → 분기 1 / 분기 2

### 5-2. Mermaid Flowchart 생성

- 메인 procedure 의 플로우차트를 가장 위에 생성
- 호출되는 서브 procedure 들의 플로우차트를 아래에 순서대로 배치
- 템플릿 § 2 "워크플로우 다이어그램"의 색상 규칙 적용
- **노드 내 줄바꿈은 반드시 `<br/>` 사용. `\n` 사용 금지.**

---

## Step 6: Markdown 보고서 생성

### 6-1. 템플릿 로드
- `.claude/skills/analyze-plsql/templates/plsql_package_analysis_report_template.md` (헤딩은 그대로, 본문은 판정된 원천 DBMS 의 방언 어휘로 채움)

### 6-2. 플레이스홀더 치환

```javascript
const replacements = {
  "[PACKAGE-ID]": qualify(OBJECT_NAME),            // Oracle PACKAGE 면 패키지명, 그 외 단일 procedure/function 이름
  "[PACKAGE_NAME]": OBJECT_NAME,                    // 동일
  "[SCHEMA_NAME]": SCHEMA_NAME ?? "(미기재)",
  "[BODY/SPEC]": TYPE === 'PACKAGE' ? "SPEC+BODY" : "BODY",   // SPEC 은 Oracle PACKAGE 에만 있음
  "[분석 수행 시각 (KST)]": new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  "[전체 프로시저/함수 수]": TYPE === 'PACKAGE' ? memberCount : 1,
  "[총 줄 수]": totalLines,
  "[LLM 모델명 및 버전]": "Claude Sonnet 4.5"
};
```

> 보고서 §1 첫 줄에 `원천 DBMS: X (판정 근거: README / 문법 단서 / 사용자 확인)` 를 적고, 분석 단위를 명시한다 — Oracle 이면 "PACKAGE {이름} (멤버 N개)" 또는 "단일 PROCEDURE/FUNCTION", PostgreSQL·MSSQL 이면 "패키지 없음, 단일 PROCEDURE/FUNCTION 으로 분석".

### 6-3. 각 섹션별 데이터 삽입

- § 1: 프로시저/패키지 개요 (메타데이터)
- § 2: 비즈니스 프로세스 분석 (목적, 워크플로우, 주요 프로세스)
- § 3: 프로시저/함수 상세 분석 (단일 객체의 완전한 분석)
- § 4: 데이터 요구사항 (테이블 맵, 데이터 플로우)
- § 5: ER 다이어그램 (관계 텍스트)
- § 6: 특이사항 (복잡도, 성능, 트랜잭션 주의사항)

### 6-3a. 호출 procedure 요약 및 링크 삽입 (필수)

§ 3 procedure 상세 분석 내에서, 외부 호출이 있는 경우 해당 위치에 삽입:

```markdown
> **📎 호출 procedure**: [`{schema}.{OBJECT_NAME}`]({상대경로_보고서_링크})   <!-- Oracle 패키지 멤버면 `{PKG}.{MEMBER}` -->
> - **목적**: {비즈니스 목적 1줄 요약}
> - **주요 테이블**: {주요 입출력 테이블 목록}
> - **코드 규모**: 총 {N}라인
```

**예시** (MSSQL 원천):
```markdown
**라인 245**: `EXEC dbo.doSelectJobList @yard, @date` 호출

> **📎 호출 procedure**: [`dbo.doSelectJobList`](../SOA/procedures/doSelectJobList_analysis_report.md)
> - **목적**: 야드별 일자 Job 목록 조회
> - **주요 테이블**: TB_SOA_JOB, TB_SOA_JOB_DTL, TB_M_YARD
> - **코드 규모**: 총 142라인
```

**상대경로 계산 규칙**:
```javascript
function getRelativePath(currentReportPath, calledReportPath) {
  return path.relative(path.dirname(currentReportPath), calledReportPath);
}
```

**재귀 깊이 초과로 분석 생략된 경우**:
```markdown
> **📎 호출 procedure**: `{schema}.{OBJECT_NAME}` (미분석 - 재귀 깊이 초과)
> - **참고**: 최대 재귀 깊이(3) 초과로 상세 분석이 생략되었습니다. 별도로 `/analyze-plsql {OBJECT_NAME}` 실행을 권장합니다.
```

### 6-4. 파일 쓰기 (모듈별 또는 공유)

```javascript
const fileName = OBJECT_NAME + "_analysis_report.md";

// 호출자 모듈 결정 (단일 모듈이면 그쪽, 여러 모듈이면 _shared)
const targetModuleId = determineTargetModule(callerScreens);  // 'SOA' / 'QMA' / ... 또는 '_shared'

const targetPath = `docs/external/SampleErp/orgErpReport/${targetModuleId}/procedures/${fileName}`;
```

디렉토리 없으면 자동 생성. 파일 이미 존재하면 덮어쓰기 진행.
