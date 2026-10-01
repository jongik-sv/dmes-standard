# Phase 3 - SQL 쿼리 분석 (레거시 DB Package / Stored Procedure / Function)

SampleErp 화면 분석의 세 번째 단계로, 화면이 호출하는 **레거시 DB(Oracle · PostgreSQL · MSSQL) Package / Stored Procedure / Function 정적 파일** 을 분석하여 데이터베이스 스키마와 데이터 흐름을 추출한다.

> 산출 JSON 파일명(`sql_analysis.json`) 과 키 이름은 부산 시절 그대로 보존한다 — 산출물 템플릿 호환 우선. `plsqlCalls` 키도 보존하되 의미는 "판정된 원천 DBMS 의 procedure/function 호출"로 사용. 본문 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) §3 의 방언 열 참조.

## MANDATORY EARLY TERMINATION RULE

**IF NO SQL KEYS FOUND after comprehensive search:**
1. Create empty JSON with serviceInfo only
2. STOP ALL SQL ANALYSIS
3. DO NOT search for SQL files
4. DO NOT parse individual queries
5. TERMINATE immediately

## 실행 알고리즘

### Step 0: 원천 DBMS 판정

Phase 3 시작 시 한 번만 판정하고 이후 모든 Step 과 서브에이전트 위임에 같은 값을 쓴다. 판정 순서는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) §3-1 (README `원천 DBMS:` 줄 → Step 3 에서 읽은 `.sql` 본문의 문법 단서 → 사용자 확인).

```javascript
let DBMS = readDbmsFromReadme('docs/external/SampleErp/README.md');   // 'ORACLE' | 'POSTGRESQL' | 'MSSQL' | 'SQLITE' | null
// null 이면 Step 3 에서 첫 본문을 읽은 직후 detectDialect(body) 로 확정, 그래도 null 이면 AskUserQuestion
```

- **SQLite 원천**이면 저장 프로시저가 없다 — procedures/functions 매핑(Step 3)과 호출 감지(Step 6)를 건너뛰고, 앱 inline SQL 만 Step 4 대상으로 삼는다.
- 판정 결과는 `/analyze-plsql` 위임 프롬프트(Step 6-4)에 넘긴다. sql_analysis.json 에는 새 키를 추가하지 않는다 (키 이름 보존 정책) — 후속 스킬은 같은 §3-1 순서로 다시 판정한다.

### Step 1: structure.json 로드

1. **파일 경로 확인**: Glob 또는 Read
   - 파일 검색: `{SCREEN-ID}_structure.json` (`docs/external/SampleErp/orgErpReport/{moduleId}/.temp/`)
   - 존재하지 않으면 메시지 출력 후 종료

2. **sql_analysis.json** 파일 유무 확인 (재작업 방지)
   - **파일 위치**: `{SCREEN-ID}_sql_analysis.json`
   - 파일이 존재하면 종료

### Step 2: 통합 SQL Key 검색

#### 2-1. 통합 SQL Key 검색 (세 소스 합치기)

1. **structure.json 의 SQL 키 추출** (`sqlQueries` 배열)
   - Phase 1 에서 수집된 `dataFlow.sqlQueries` (XML/sqlkey 호환 — SampleErp 에서는 거의 비어있음)

2. **C# inline 호출 추출** (`javaSqlQueries` 배열 — 키 이름 보존)
   - `dataFlow.javaSqlQueries` 배열에서 C# 코드 안의 `AppDB.Execute("procName")`, `MainQuery.Get("queryName")` 호출명 추출

3. **DAO 기반 보조 추출** (`potentialSqlQueries` 배열 — fallback)
   - `dataFlow.potentialSqlQueries` 배열의 각 항목에서 `sqlKey` 값 추출 (위치/메서드 정보 포함)

4. **최종 SQL Key 확정**
   - 합집합, 중복 제거

```javascript
const xmlSqlKeys = structure.dataFlow.sqlQueries || [];
const csharpSqlKeys = structure.dataFlow.javaSqlQueries || [];  // 키 이름 보존
const potentialSqlKeys = (structure.dataFlow.potentialSqlQueries || []).map(item => item.sqlKey);

if (csharpSqlKeys.length === 0) {
  console.warn("⚠️ javaSqlQueries 배열이 비어있습니다. Phase 2 결과 확인 필요.");
}

const allSqlKeys = [...new Set([...xmlSqlKeys, ...csharpSqlKeys, ...potentialSqlKeys])];
console.log(`✅ XML SQL: ${xmlSqlKeys.length}개, C# SQL: ${csharpSqlKeys.length}개, Potential SQL: ${potentialSqlKeys.length}개, 통합: ${allSqlKeys.length}개`);
```

#### 2-2. 출처별 SQL 매핑 분석

```javascript
const integratedSqlMappings = {
  "doSelectJobList": {
    "queryKey": "doSelectJobList",
    "sources": ["C#"],
    "usageCount": 3,
    "locations": [
      {"file": "SOA004K.cs", "line": 142, "method": "btnSearch_Click", "sourceType": "C#", "callPattern": "AppDB.Execute"}
    ]
  }
}
```

#### 2-3. SQL Key 없을 경우 즉시 조기 종료

1. **빈 JSON 문서 생성** (출력 위치: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_sql_analysis.json`):
   ```json
   {
     "serviceInfo": {
       "serviceId": "string",
       "serviceName": "string",
       "moduleId": "string",
       "analysisDate": "date"
     },
     "hasQuery": false,
     "sqlAnalysis": {
       "totalQueries": 0,
       "queryDetails": [],
       "hasQueries": false
     }
   }
   ```

2. **즉시 종료**: SQL 파일 검색 금지, 개별 분석 금지

### Step 3: 정적 파일에서 SQL 본문 로드

각 SQL Key 에 대해 다음 위치를 순서대로 확인:

```
1. docs/external/SampleErp/procedures/{key}.sql
2. docs/external/SampleErp/functions/{key}.sql
3. docs/external/SampleErp/views/{key}.sql
```

발견된 파일은 Read 로 본문 로드. 미발견은 별도 처리 (Step 5 의 plsqlCalls 미분석 항목으로).

- **Oracle** 원천에서 key 가 `PKG.PROC` 형태면 `procedures/{PKG}.sql`(SPEC/BODY 분리 시 `procedures/{PKG}*.sql`) 을 읽고 그 안의 `PROC` 멤버를 분석 대상으로 삼는다.
- **PostgreSQL** 원천에서 key 에 schema 접두(`sales.fn_x`)가 있으면 접두를 떼고 파일을 찾는다.

### Step 4: 쿼리 분석 (각 발견된 procedure/function 본문에 대해)

C# 코드에서 호출되는 procedure 는 본문 자체가 SELECT/INSERT/UPDATE/DELETE/MERGE 묶음이므로, procedure 본문 안의 각 SQL 문을 별도 쿼리로 보고 분석한다 (또는 procedure 1개를 1개 쿼리로 단순화 — 호출자 입장에서는 procedure 호출 1회).

분석 항목:
1. **쿼리 타입 분류**: SELECT/INSERT/UPDATE/DELETE/MERGE
2. **테이블 추출**: FROM/JOIN/INTO/UPDATE/DELETE FROM 절
3. **컬럼 분석**: SELECT 절, WHERE 조건, INSERT/UPDATE 컬럼
4. **JOIN 관계**: INNER/LEFT/RIGHT/FULL JOIN, 조인 조건
5. **파라미터 분석**: 판정 방언의 바인드 변수 — Oracle `:name`(본문은 파라미터명 직접) · PostgreSQL `$1`/이름 있는 인자 · MSSQL `@name`
6. **결과 컬럼**: SELECT 절 반환 컬럼, 별칭, 집계 함수 (PostgreSQL `RETURNS TABLE(...)`, Oracle `SYS_REFCURSOR` 포함)
7. **트랜잭션 제어**: Oracle `SAVEPOINT`/`ROLLBACK TO`/`COMMIT` · PostgreSQL PROCEDURE 의 `COMMIT`/`ROLLBACK` · MSSQL `BEGIN TRAN`/`SAVE TRANSACTION`/`COMMIT TRANSACTION`/`ROLLBACK TRANSACTION` 위치
8. **에러 처리**: Oracle·PostgreSQL `EXCEPTION WHEN`, `RAISE_APPLICATION_ERROR`/`RAISE EXCEPTION` · MSSQL `BEGIN TRY/CATCH`, `RAISERROR`, `THROW`

> SampleErp 의 procedure 는 정적 파일 dump 이므로 query-cache 의존이 없다. 모든 본문은 Read 로 가져온다.

### Step 5: 데이터베이스 스키마 추론

1. **테이블 목록 생성**: 모든 SQL 에서 사용된 테이블 수집, 역할 추론
2. **컬럼 정보 수집**: 각 테이블별 컬럼 목록, 타입 추론
3. **테이블 정의 보강**: `docs/external/SampleErp/tables/{테이블명}.sql` 존재 시 Read 하여 컬럼/타입/PK/FK 정확히 추출
4. **ER 관계도 구성**: JOIN 조건 기반 관계 추출

### Step 6: 레거시 DB procedure/function 호출 감지 및 추가 분석

#### 6-1. 호출 패턴 감지

procedure/function 본문 안의 다른 procedure/function 호출 패턴 검색. **Step 0 에서 판정한 방언의 패턴만** 적용한다 (방언별 전체 정규식은 [`analyze-plsql/references/plsql-analysis.md`](../../analyze-plsql/references/plsql-analysis.md) §3-6).

**감지 대상 패턴**:
```sql
-- Oracle PL/SQL
PKG_ORDER.PROC_SAVE(p_id, v_res);          -- 패키지 멤버
PROC_LOCAL(p_id);                          -- 블록 안 단독 문장
v_name := PKG_COMM.FN_GET_NAME(p_cd);
EXECUTE IMMEDIATE v_sql USING p_id;        -- 동적 SQL (기록만)

-- PostgreSQL PL/pgSQL
CALL sp_save_order(p_id);
PERFORM fn_write_log(p_id);
SELECT * FROM fn_list_orders(p_date);
EXECUTE format('...', v_tbl) USING p_id;   -- 동적 SQL (기록만)

-- MSSQL T-SQL
EXEC dbo.procName @p1, @p2;
EXECUTE dbo.procName(@p1, @p2);
SELECT dbo.funcName(@p) AS result;
SELECT col1 FROM dbo.tableValuedFuncName(@p);
EXEC sp_executesql @sql;                   -- 동적 SQL (기록만)
```

**감지 로직**:
```javascript
const callPatterns = {
  ORACLE: [
    /\b(\w+)\.(\w+)\s*\(/gi,                 // PKG.PROC(...) — 별칭.컬럼 오탐은 context 검증
    /^\s*(\w+)\s*\([^;]*\)\s*;/gim,           // 단독 문장 PROC(...);
  ],
  POSTGRESQL: [
    /\b(?:CALL|PERFORM)\s+(?:\w+\.)?(\w+)\s*\(/gi,
    /(?::=|\bFROM)\s*(?:\w+\.)?(\w+)\s*\(/gi,  // 내장 함수 제외 필요
  ],
  MSSQL: [
    /(?:EXEC|EXECUTE)\s+(?:dbo\.)?(\w+)/gi,
    /\bdbo\.(\w+)\s*\(/gi,
    /\b(\w+)\s*\(\s*@/gi,                    // 인라인 함수 호출 (false positive 가능 — context 검증)
  ],
}[DBMS];
```

#### 6-2. 감지된 오브젝트 분류

```javascript
detectedCalls.forEach(call => {
  // Oracle 패키지 멤버 호출(PKG.PROC)만 PACKAGE_MEMBER, 그 외(PostgreSQL·MSSQL 전부, Oracle 독립 객체)는 STANDALONE
  const isPackageCall = DBMS === 'ORACLE' && call.qualifier && isPackageFile(call.qualifier);
  detectedObjects.push({
    objectName: isPackageCall ? call.qualifier : call.name,   // 분석 단위 = 패키지
    procedureName: isPackageCall ? call.name : null,
    callType: isPackageCall ? 'PACKAGE_MEMBER' : 'STANDALONE',   // phase3-generator.py 와 같은 값
    fullCall: call.text
  });
});
```

#### 6-3. 기존 분석 보고서 확인 (중복 방지)

```javascript
// docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/ + _shared/DBMS/ 둘 다 검색
for (const obj of uniqueObjects) {
  const existingReport = await findFile(obj.objectName + '_analysis_report.md');
  if (existingReport) {
    obj.reportPath = existingReport;
    obj.analyzed = true;
  } else {
    pendingAnalysis.push(obj);
  }
}
```

#### 6-4. /analyze-plsql 자동 서브에이전트 호출

**스킬 이름은 `analyze-plsql` 그대로 보존** (산출물 일관성). 의미는 "판정된 원천 DBMS 의 package/procedure/function 분석" 으로 사용. 전용 분석 에이전트 타입은 두지 않고 `general-purpose` 서브에이전트에 `/analyze-plsql` 스킬과 원천 DBMS 를 넘긴다:

```javascript
if (pendingAnalysis.length > 0) {
  for (const obj of pendingAnalysis) {
    await Task({
      description: `레거시 DB procedure 분석 ${obj.objectName}`,
      subagent_type: "general-purpose",
      prompt: `/analyze-plsql ${obj.objectName}\n\n` +
        `원천 DBMS: ${DBMS}\n` +
        `SampleErp procedure 분석 요청. 정적 파일 위치: docs/external/SampleErp/procedures/${obj.objectName}.sql\n` +
        `호출 형태: ${obj.fullCall}\n` +
        `analyze-plsql 스킬 파일: .claude/skills/analyze-plsql/SKILL.md 를 먼저 읽고 지침에 따라 수행해주세요. ` +
        `원천 DBMS 는 위 값으로 확정됐으니 다시 판정하지 말고 그 방언 패턴으로 분석해주세요.`
    });
  }
}
```

#### 6-5. 호출 정보를 sql_analysis.json 에 기록

**보고서 경로 결정 규칙** (모듈별 + cross-module 공유):
```javascript
function getReportPath(objectName, callerModuleId) {
  // 호출자가 단일 모듈이면 해당 모듈 아래
  // cross-module 또는 호출자 미파악 시 _shared 아래
  const targetModule = callerModuleId || '_shared';
  return 'docs/external/SampleErp/orgErpReport/' + targetModule + '/procedures/' + objectName + '_analysis_report.md';
}
```

### Step 7: sql_analysis.json 생성

**(중요) 출력 위치**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_sql_analysis.json`

**JSON 스키마 (부산 시절 그대로 보존)**:
```json
{
  "serviceInfo": {
    "serviceId": "string",
    "serviceName": "string",
    "moduleId": "string",
    "analysisDate": "date",
    "numberOfQuery": "number"
  },
  "sqlAnalysis": {
    "totalQueries": "number",
    "queryDetails": [
      {
        "queryId": "string",
        "description": "string",
        "queryType": "SELECT|INSERT|UPDATE|DELETE|MERGE",
        "sources": ["XML", "C#"],
        "isFromXml": "boolean",
        "isFromJava": "boolean",
        "parameters": [{"name": "string", "type": "string", "required": "boolean", "description": "string"}],
        "tables": [{"tableName": "string", "alias": "string", "role": "메인 테이블|참조 테이블|조인 테이블", "accessPattern": "string"}],
        "columns": [{"name": "string", "tableName": "string", "tableAlias": "string", "dataType": "string", "isPrimaryKey": "boolean", "isForeignKey": "boolean", "expression": "string"}],
        "joins": [{"type": "INNER|LEFT|RIGHT|FULL", "leftTable": "string", "rightTable": "string", "condition": "string"}],
        "businessPurpose": "string",
        "queryLogic": "string",
        "performanceInfo": {"hasIndex": "string", "queryComplexity": "Simple|Medium|Complex", "estimatedRows": "string"}
      }
    ],
    "tables": [
      {"tableName": "string", "tableDescription": "string", "role": "string", "accessPattern": "string",
       "columns": [{"name": "string", "dataType": "string", "isPrimaryKey": "boolean", "isForeignKey": "boolean", "description": "string"}]}
    ],
    "dataFlow": {
      "inputParameters": [{"name": "string", "source": "string", "description": "string"}],
      "outputData": [{"name": "string", "structure": "string", "destination": "string"}]
    },
    "businessRules": [{"rule": "string", "description": "string", "enforcement": "string"}]
  },
  "erDiagram": {
    "relationships": [{"from": "string", "to": "string", "type": "1:N|N:1|N:M", "joinKey": "string", "description": "string"}]
  },
  "plsqlCalls": {
    "totalDetected": "number",
    "totalAnalyzed": "number",
    "totalSkipped": "number",
    "detectedCalls": [
      {"objectName": "string", "procedureName": "string|null", "callType": "STANDALONE|PACKAGE_MEMBER", "fullCall": "string", "analyzed": "boolean", "reportPath": "string|null"}
    ]
  }
}
```

> **키 이름 보존**: `plsqlCalls`, `isFromJava` 등은 부산 시절 키. SampleErp 환경에서는 의미만 매핑. 산출물 동일성 우선.

## 주의사항
- **최우선**: SQL Key 종합 검색 후 없으면 즉시 조기 종료
- structure.json 필수 (Phase 1 먼저 실행)
- **원천 DBMS 판정 선행**: Step 0 에서 한 번 판정하고 모든 패턴·위임에 같은 값을 쓴다
- 바인드 변수: 판정 방언 기준 인식 (Oracle `:name` · PostgreSQL `$1`/이름 있는 인자 · MSSQL `@name`)
- **호출 감지**: 판정 방언의 호출 구문(Oracle `PKG.PROC(...)` · PostgreSQL `CALL`/`PERFORM`/`SELECT f()` · MSSQL `EXEC`/`EXECUTE`/`dbo.X(...)`) 감지 시 `/analyze-plsql` 을 서브에이전트로 자동 호출
- **분석 중복 방지**: `docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/` 또는 `_shared/DBMS/` 에 이미 분석 보고서가 존재하면 스킵
- **분석 자동 실행**: 사용자 확인 없이 감지된 미분석 오브젝트를 `general-purpose` 서브에이전트(프롬프트에 `/analyze-plsql` 과 `원천 DBMS` 전달)로 순차 자동 분석
- **DB 미접속**: SampleErp 는 정적 파일 dump 만 다룬다. sqlcl·psql·sqlcmd 등 DB 클라이언트 호출 금지.

## 에러 처리
- structure.json 없음 → 즉시 종료
- SQL Key 없음 → 빈 JSON 생성 후 조기 종료 (정상 처리)
- procedure 정적 파일 없음 → `analyzed=false` 로 plsqlCalls 에 기록 후 다음 진행
- /analyze-plsql 실행 중 오류 → 경고 로그 출력 후 다음 오브젝트 진행
