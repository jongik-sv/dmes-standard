# MSSQL procedure/function 분석 상세 절차

> 본 파일명(plsql-analysis.md) 은 부산 시절 그대로 보존. 의미는 "MSSQL Stored Procedure / Function 분석" 으로 사용. 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) 의 PL/SQL→T-SQL 매핑표 적용.

## Step 0: 사전 검증 (필수)

1. **파라미터 검증**
   - NAME 필수 입력 확인
   - 빈 값 또는 null 시 에러 메시지 출력 후 종료

---

## Step 0.5: 기존 분석 문서 검색

NAME 으로부터 예상 파일명 `{NAME}_analysis_report.md` 를 생성하여 순차 검색.

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
const candidates = [
  `docs/external/SampleErp/procedures/${NAME}.sql`,   // Stored Procedure
  `docs/external/SampleErp/functions/${NAME}.sql`,    // Function
  `docs/external/SampleErp/views/${NAME}.sql`,        // View
  `docs/external/SampleErp/triggers/${NAME}.sql`      // Trigger
];

const found = [];
for (const path of candidates) {
  if (fileExists(path)) found.push(path);
}
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
const OBJECT_NAME = NAME;
const FOLDER_KIND = SQL_FILE_PATH.split('/').slice(-2, -1)[0];  // 'procedures' / 'functions' / ...

// 본문 읽기
const sourceCode = readFile(SQL_FILE_PATH);

// CREATE 헤더에서 정확한 타입 감지
let TYPE;
if (/CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE/i.test(sourceCode)) TYPE = 'PROCEDURE';
else if (/CREATE\s+(?:OR\s+ALTER\s+)?FUNCTION/i.test(sourceCode)) TYPE = 'FUNCTION';
else if (/CREATE\s+(?:OR\s+ALTER\s+)?VIEW/i.test(sourceCode)) TYPE = 'VIEW';
else if (/CREATE\s+(?:OR\s+ALTER\s+)?TRIGGER/i.test(sourceCode)) TYPE = 'TRIGGER';
else TYPE = FOLDER_KIND.toUpperCase();

const SCHEMA_NAME = 'dbo';   // SampleErp 기본 스키마
```

> SampleErp 는 패키지 개념이 없으므로 `PACKAGE` / `PACKAGE BODY` 처리는 생략.

---

## Step 2: 파일 타입별 구조 분석

### 2-1. 분석 전략 결정
```javascript
if (TYPE === 'PROCEDURE') {
  analysisStrategy = 'SINGLE_PROCEDURE_ANALYSIS';
} else if (TYPE === 'FUNCTION') {
  analysisStrategy = 'SINGLE_FUNCTION_ANALYSIS';
} else if (TYPE === 'VIEW') {
  analysisStrategy = 'VIEW_ANALYSIS';
} else if (TYPE === 'TRIGGER') {
  analysisStrategy = 'TRIGGER_ANALYSIS';
}
```

> MSSQL 은 패키지 단위가 없어 항상 단일 객체 분석. 보고서 §1 에서 "패키지 개념 없음" 명시.

### 2-2. 기본 메타데이터 수집

- 오브젝트명, 스키마명 (`dbo` 기본), 타입
- 전체 코드 줄 수, 분석 일시 (KST)
- 파일 수준 주석 파싱 (작성자, 버전, 생성일자 — SampleErp 헤더 패턴: `-- 작성자: PSH` 등)

### 2-3. 헤더 파라미터 추출

procedure 의 경우:
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

함수의 경우:
```sql
CREATE FUNCTION [dbo].[FNGETCOMMNAME]
(@CdGrpId NVARCHAR(20), @CdId NVARCHAR(20))
RETURNS NVARCHAR(100)
AS
BEGIN
  ...
END
```

추출 항목: 파라미터명, 타입(NVARCHAR(200), INT, DECIMAL(18,2) 등), IN/OUTPUT 구분, 리턴타입(FUNCTION).

---

## Step 3: 본문 심층 분석

### 3-1. 본문 영역 식별

`AS BEGIN ... END` 영역 추출. 변수 선언(`DECLARE @v INT`), 비즈니스 로직, 예외 처리 영역 분리.

### 3-2. 8개 항목 분석

각 procedure/function 본문에 대해:

1. **비즈니스 목적 추론**: 핵심 업무, 입출력 추론. 헤더 주석 우선 활용.
2. **실행 흐름 분석**: BEGIN-END 단계별 순차 분석. SAVEPOINT 위치 명시.
3. **제어 흐름 분석**: `IF/ELSE`, `WHILE`, `CASE WHEN`, `GOTO`(레거시) 등.
4. **데이터 접근 패턴**: SELECT/INSERT/UPDATE/DELETE/MERGE 모두 추출.
5. **비즈니스 규칙 추출**: 검증, 계산, 특수처리.
6. **트랜잭션 제어**:
   - `BEGIN TRAN/BEGIN TRANSACTION`
   - `SAVE TRANSACTION sp1` (PL/SQL 의 `SAVEPOINT` 대응)
   - `COMMIT TRANSACTION`
   - `ROLLBACK TRANSACTION sp1` (전체 또는 SAVE TRANSACTION 지점)
7. **예외 처리**:
   - `BEGIN TRY ... END TRY BEGIN CATCH ... END CATCH`
   - `RAISERROR('msg', severity, state)` (PL/SQL 의 `RAISE_APPLICATION_ERROR` 대응)
   - `THROW err_num, 'msg', state`
   - `ERROR_NUMBER()`, `ERROR_MESSAGE()` 등 진단 함수
8. **외부 의존성**: 호출 procedure/function — 본문 정규식 (Step 3-6)

### 3-3. 커서 루프 상세 분석

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
1. 커서 SQL 추출 (DECLARE CURSOR 의 SELECT 본문)
2. 커서 목적 (조회 데이터 및 용도)
3. 반복 범위 (예상 행 수)
4. 루프 내 작업 (DML, 조건 분기 등)
5. 중첩도 (커서 안의 커서 또는 WHILE)

분석 결과는 템플릿 § 3 "커서 루프 상세 분석" 형식으로 작성. 헤딩은 부산 그대로 두고 어휘만 매핑.

### 3-4. 비즈니스 규칙 표 생성

**검증 규칙 추출 패턴**:
```sql
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

**호출 감지 패턴 (MSSQL T-SQL)**:
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
const callPatterns = [
  /(?:EXEC(?:UTE)?)\s+(?:\[?dbo\]?\.)?(\[?\w+\]?)/gi,                  // EXEC dbo.X
  /\bdbo\.\[?(\w+)\]?\s*\(/gi,                                          // dbo.X(...)
  /\bSELECT\s+[^;]*?\b(\w+)\s*\(\s*@/gi,                                // 인라인 함수 호출 (false positive 가능)
];
```

> SampleErp 에는 `ALL_DEPENDENCIES` 같은 메타 카탈로그 접근 불가. 본문 정규식이 유일한 방법.

**호출 목록 구조**:
```javascript
calledObjects.push({
  owner: "dbo",
  name: "doSelectJobList",
  type: "PROCEDURE",   // 또는 FUNCTION
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
for (const called of calledObjects) {
  const fileName = called.name + "_analysis_report.md";

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
    LOG.warn(`⚠️ 최대 재귀 깊이(${MAX_RECURSIVE_DEPTH}) 도달: dbo.${objectName} - 호출 기록만 남기고 분석 생략`);
    return { skipped: true, reason: "최대 재귀 깊이 초과" };
  }
  // ... 분석 수행 (currentDepth + 1 전달)
}
```

### 3.5-4. 순환 참조 방지

```javascript
const analyzedSet = new Set();

function isAlreadyInProgress(name) {
  const key = "dbo." + name;
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
const tablePattern = /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(?:\[?dbo\]?\.)?(\[?\w+\]?)/gi;
const tables = new Set();
allBodies.forEach(body => {
  const matches = body.matchAll(tablePattern);
  for (const match of matches) {
    let t = match[1].replace(/[\[\]]/g, '');
    if (!isMssqlSystemTable(t)) tables.add(t);
  }
});
```

### 4-2. 테이블 정의 보강

발견된 각 테이블에 대해 `docs/external/SampleErp/tables/{테이블명}.sql` Read 시도. 발견 시 `CREATE TABLE` 본문에서 컬럼/타입/PK/FK/INDEX 정확히 추출.

### 4-3. 테이블별 역할 분류

1. **입력 임시 테이블**: `_TMP`, `_TEMP`, `#tmp` 패턴, 주로 DELETE 대상
2. **마스터 테이블**: `_MST`, `_MASTER` 패턴, SELECT 빈도 높음
3. **상세/이력 테이블**: `_DTL`, `_DETAIL`, `_HST`, `_HISTORY` 패턴, INSERT/UPDATE 대상
4. **전표/문서 테이블**: `_DOC`, `_HDR` 패턴, IDENTITY 컬럼 또는 채번 함수 사용

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
- `.claude/skills/analyze-plsql/templates/plsql_package_analysis_report_template.md` (헤딩은 그대로, 본문은 T-SQL 어휘로 채움)

### 6-2. 플레이스홀더 치환

```javascript
const replacements = {
  "[PACKAGE-ID]": "dbo." + OBJECT_NAME,            // SampleErp 는 패키지 없음 → 단일 procedure/function 이름
  "[PACKAGE_NAME]": OBJECT_NAME,                    // 동일
  "[SCHEMA_NAME]": "dbo",
  "[BODY/SPEC]": "BODY",                            // 항상 BODY (SPEC 없음)
  "[분석 수행 시각 (KST)]": new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  "[전체 프로시저/함수 수]": 1,                       // 단일 객체
  "[총 줄 수]": totalLines,
  "[LLM 모델명 및 버전]": "Claude Sonnet 4.5"
};
```

> 보고서 §1 에 "MSSQL — 패키지 개념 없음, 단일 PROCEDURE/FUNCTION 으로 분석" 명시.

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
> **📎 호출 procedure**: [`dbo.{OBJECT_NAME}`]({상대경로_보고서_링크})
> - **목적**: {비즈니스 목적 1줄 요약}
> - **주요 테이블**: {주요 입출력 테이블 목록}
> - **코드 규모**: 총 {N}라인
```

**예시**:
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
> **📎 호출 procedure**: `dbo.{OBJECT_NAME}` (미분석 - 재귀 깊이 초과)
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
