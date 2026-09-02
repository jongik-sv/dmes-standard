# Phase 2 - C# partial class 심층 분석

SampleErp 화면 분석의 두 번째 단계로, **Custom C# partial class** 를 심층 분석하여 비즈니스 로직을 추출한다.

> 산출 JSON 파일명(`java_analysis.json`) 과 키 이름은 부산 시절 그대로 보존한다 — 산출물 템플릿 호환 우선. 본문 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) 참조.

## MANDATORY EARLY TERMINATION RULE

**IF customActivities is empty/undefined/null:**
1. Create `{}`
2. STOP ALL ANALYSIS
3. DO NOT analyze framework/common 컴포넌트
4. DO NOT generate detailed reports
5. TERMINATE immediately

**VIOLATION of this rule will result in:**
- Unnecessary resource consumption
- Inconsistent analysis results
- Extended execution time

## 실행 알고리즘

### Step 0: 환경 체크
- Serena MCP 가 C# 을 지원하면 활용 권장 (`mcp__serena__get_current_config` 으로 확인)
- 미지원/부재 시 Read+Grep 으로 fallback (기능 손실 없음)

### Step 1: structure.json 및 작업파일 확인

1. **파일 경로 확인**: Glob 또는 Serena `find_file`
   - 파일 검색: `{SCREEN-ID}_structure.json` (`docs/external/SampleErp/orgErpReport/{moduleId}/.temp/`)
   - 존재하지 않으면 메시지 출력 후 종료

2. **java_analysis.json**: 동일 디렉토리
   - **파일 위치**: `{SCREEN-ID}_java_analysis.json`
   - 재작업 방지 위해 파일이 존재하면 종료

### Step 2: **MANDATORY PRE-VALIDATION**

#### 2-1. structure.json 로드 즉시 실행

```javascript
function validateCustomActivities(structure) {
  const customActivities = structure.serviceStructure?.customActivities || [];
  if (customActivities === undefined || customActivities === null || customActivities.length === 0) {
    const emptyResult = {
      "serviceInfo": {
        "serviceId": "[SCREEN-ID]",
        "moduleId": "[MODULE-ID]",
        "analysisDate": new Date().toISOString().split('T')[0]
      }
    };
    saveOutputFile(emptyResult);
    LOG.info("MANDATORY: customActivities is empty → early termination");
    PROCESS.TERMINATE();
    return false;
  }
  return true;
}
```

#### 2-2. 조기 종료 조건 (customActivities 배열 기준만 사용)

**✅ 분석 진행 가능**: customActivities 배열에 1개 이상 요소가 있는 경우
**❌ 즉시 조기 종료**: 빈 배열/undefined/null

**기준 통일**:
- `activities.type='custom'` 속성과 무관하게 **customActivities 배열만 최종 기준**으로 사용
- type 이 'common' 또는 'framework' 인 컴포넌트는 절대 분석 금지

### Step 2.5: 사내 상수/리소스 정의 파싱 (SQL 매핑 해석용)

**목적**: C# 코드에서 참조하는 SQL 상수(예: `MainQueryConstants.SELECT_JOB_LIST`) 를 실제 procedure 이름으로 변환하기 위한 맵핑 테이블 생성

**파싱 대상**:
- 화면 모듈 안의 `*Constants.cs` 또는 `MainQueryConstants.cs` (모듈 prefix 별)
- `Resources.resx` 의 키-값 (다국어 텍스트)

**검색 방법**: Glob 으로 `docs/external/SampleErp/orgErpSource/**/{moduleId}*Constants*.cs` 패턴 검색

**추출 항목**:
```javascript
const sqlConstants = {
  "SELECT_JOB_LIST": "doSelectJobList",
  "SAVE_JOB_MATCH": "doSaveJobMatch",
  // ...
};
```

> SampleErp 에서는 부산의 `M{XX}ConstantsIF.SELECT_SQL` 같은 통합 상수 패턴이 항상 있는 것은 아니므로, 발견되지 않으면 본 단계는 건너뛰고 직접 procedure 이름 호출 (`AppDB.Execute("doXxx", ...)`) 만 분석한다.

### Step 3: Custom C# partial class 심층 분석 (validation 통과 시에만 진행)

#### 3-0. 기존 커스텀 클래스 분석 보고서 활용 (MANDATORY)

각 커스텀 클래스에 대해 분석을 시작하기 전, 메인 오케스트레이터(analyze-service) 가 이미 생성한 분석 보고서를 확인하고 활용한다.

```javascript
function checkExistingAnalysis(screenId, className) {
  // V2: 화면 폴더 안 _classes/ 하위 + SCREEN-ID prefix 제거 + _class_ 의 class_ 접두 제거
  var analysisPath = 'docs/external/SampleErp/orgErpReport/{moduleId}/' + screenId + '/_classes/' + className + '_analysis.md';
  return fileExists(analysisPath);
}
```

| 상태 | 처리 |
|------|------|
| ✅ 분석 보고서 존재 | 기존 보고서를 읽어서 java_analysis.json 데이터 소스로 활용. 재분석 생략. |
| ❌ 분석 보고서 미존재 | 경고 로그 출력 후 스킵 (메인 오케스트레이터에서 선행 생성해야 하므로 비정상 상황) |

#### 3-1. 각 클래스별 심층 분석 항목 (보고서 미존재 시 fallback)

1. **클래스 구조 분석**
   - 베이스 클래스: `FormWith1Grid`, `DialogWith1Grid` 등
   - 구현 인터페이스
   - 클래스 목적 (XML 주석 또는 Form.Text)
   - 중요 상수 (`const`, `static readonly`)
   - 멤버 변수 (`private DataSet ds;` 등)

2. **핵심 메서드 심층 분석**
   - **이벤트 핸들러**: `btnXxx_Click`, `OnSearch`, `OnSave`, `OnClear`, `Form_Load`, `Form_Closing` 등 (필수)
     - 핸들러별 처리 흐름 단계별 기술
     - 각 단계의 구체 작업
   - **비즈니스 메서드**: 핵심 검증/계산/변환 메서드
   - **검증 메서드**: `bool Validate*()`, `string CheckXxx()` 등

3. **SQL 매핑 상세 추출** (Phase 3 연동)
   - **SQL 호출 패턴**: `AppDB.Execute("procName", ...)`, `MainQuery.Get("queryName", ...)`, `new SqlCommand(sqlText)` 모두 추출
   - **상수 해석**: `MainQueryConstants` (있으면) → 실제 procedure 이름 매핑
   - **동적 SQL**: 문자열 결합으로 만들어지는 SQL 패턴 (`StringBuilder` / `string.Format`)
   - **사용 빈도**: 각 호출의 사용 횟수 및 위치

4. **비즈니스 로직 상세**
   - **수학적 공식**: 모든 계산 로직 (`decimal` 연산)
   - **조건 분기**: `if/else`, `switch`, 삼항연산자
   - **반복문 패턴**: `for/foreach/while`
   - **데이터 흐름**: `DataSet` ↔ `DataTable` ↔ `FpSpread.SheetView` ↔ Form 컨트롤
   - **복잡도 평가**: 낮음/중간/높음/매우 높음

**📋 SQL 매핑 추출 가이드**:

```csharp
// 1. AppDB.Execute 호출 (procedure)
DataSet ds = AppDB.Execute("doSelectJobList", new { Yard = yardCode });   // line 121
AppDB.Execute("doSaveJobMatch", new { JobId = id, ... });                  // line 170

// 2. MainQuery.Get 호출 (query)
DataTable dt = MainQuery.Get("S_JobMatchList", new { ... });

// 3. inline SqlCommand
var cmd = new SqlCommand("SELECT * FROM TB_SOA_JOB WHERE JOB_ID = @id", conn);
cmd.Parameters.AddWithValue("@id", jobId);
```

5. **예외 처리 상세 분석**
   - **try/catch 블록**: 각 catch 가 무엇을 잡는지, 무엇을 출력/처리하는지
   - **데이터 검증**: null 체크, 길이 체크, 범위 체크
   - **에러 복구**: 트랜잭션 롤백, 사용자 알림, 로그

6. **의존성 및 데이터 구조**
   - **프레임워크 사용**: `DataSet`, `FpSpread`, `C1Combo`, `MessageBoxEx` 등의 활용
   - **데이터 변환**: `DataTable.Rows[i]["col"]`, `dataRow.ItemArray`, `decimal.Parse` 등
   - **외부 연동**: 다른 화면/Dialog 호출, 외부 시스템 통신 (있으면)

### Step 4: java_analysis.json 생성

**출력 위치**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_java_analysis.json`

**JSON 스키마 (부산 시절 그대로 보존)**:
```json
{
  "classes": {
    "[ClassName]": {
      "purpose": "[클래스의 비즈니스적 목적]",
      "complexity": "[낮음/중간/높음/매우 높음]",
      "filePath": "docs/external/SampleErp/orgErpSource/...",
      "classStructure": {
        "extends": "[베이스 클래스명]",
        "implements": ["[인터페이스 목록]"],
        "imports": ["[핵심 using 목록]"],
        "constants": ["[중요 상수 목록]"],
        "memberVariables": ["[멤버 변수 목록]"]
      },
      "classDocumentation": {
        "description": "[클래스 수준 주석 내용]",
        "author": "[작성자]",
        "version": "[버전]",
        "createdDate": "[생성일자]"
      },
      "mainLogic": {
        "method": "[진입점 핸들러명]",
        "description": "[메인 로직 설명]",
        "inputType": "[입력 타입]",
        "outputType": "[출력 타입]",
        "steps": ["[실행 단계별 상세 설명]"]
      },
      "keyMethods": [
        {
          "name": "[메서드명]",
          "purpose": "[메서드 목적]",
          "complexity": "[복잡도]",
          "parameters": ["[파라미터 목록]"],
          "returnType": "[반환 타입]",
          "businessLogic": {
            "algorithms": ["[핵심 알고리즘 목록]"],
            "dataStructures": ["[사용 데이터 구조]"],
            "specialCases": ["[특수 처리 케이스]"]
          }
        }
      ],
      "businessRules": [
        {
          "ruleId": "[규칙 ID]",
          "name": "[규칙명]",
          "condition": "[적용 조건]",
          "logic": "[처리 로직]",
          "validation": "[검증 규칙]",
          "exception": "[예외 처리]"
        }
      ],
      "sqlMappings": {
        "extractedPatterns": [
          {"pattern": "[SQL 호출 패턴]", "constantName": "[상수명 또는 직접 procedure 이름]", "line": "[라인번호]", "context": "[사용 맥락]"}
        ],
        "constantsResolved": [
          {"constantName": "[상수명]", "resolvedKey": "[실제 procedure 이름]", "source": "[MainQueryConstants 등]", "confidence": "[신뢰도 레벨]"}
        ],
        "dynamicSqlPatterns": [
          {"pattern": "[동적 SQL 구성 패턴]", "method": "[사용 메서드]", "parameters": ["[파라미터 목록]"]}
        ],
        "usageFrequency": [
          {"sqlKey": "[procedure 이름]", "usageCount": "[사용 횟수]", "locations": [{"method": "[메서드명]", "line": "[라인번호]", "pattern": "[사용 패턴]"}]}
        ]
      },
      "dataFlow": {
        "input": {"source": "[입력 소스]", "data": ["[입력 데이터 목록]"]},
        "processing": [{"step": "[처리 단계명]", "method": "[사용 메서드]", "output": "[출력 결과]"}],
        "output": {"targets": ["[출력 대상 목록]"], "method": "[출력 메서드]"}
      },
      "dependencies": {
        "framework": ["[WinForms/ComponentOne/FarPoint 등 의존성 목록]"],
        "business": ["[KsmK 사내 라이브러리 의존성 목록]"],
        "dataStructures": ["[DataSet/DataTable/FpSpread 등 데이터 구조 의존성 목록]"]
      },
      "exceptionHandling": {
        "checkedExceptions": ["[잡는 예외 타입 목록]"],
        "errorCases": [{"case": "[에러 케이스명]", "message": "[에러 메시지]", "action": "[처리 방법]"}]
      },
      "complexityFactors": ["[복잡도 요인 목록]"]
    }
  }
}
```

## 복잡도 평가
- **낮음**: get/set, 파라미터 변환, 단순 폼 컨트롤 ↔ DataSet 매핑
- **중간**: 조건 분기 2-3개, 단순 반복문, 단일 procedure 호출
- **높음**: 계산 로직, 중첩 반복문, 다중 예외 처리, 다중 procedure 연계
- **매우 높음**: 복잡한 상태 머신, 다중 분기, 대량 비즈니스 규칙

## 주의사항

### MANDATORY EXECUTION RULES (절대 위반 금지)

1. **Pre-Validation 우선**: structure.json 로드 즉시 `validateCustomActivities()` 함수 실행. validation 통과하지 않으면 절대로 다음 단계 진행 금지
2. **단일 기준 사용**: customActivities 배열만 최종 기준 (activities.type 속성 무시)
3. **조기 종료 강제**: customActivities 가 []/undefined/null 이면 즉시 TERMINATE
4. **분석 범위 제한**: customActivities 에 포함된 항목만 분석. type='common'/'framework' 절대 금지
5. **장단점/개선점 제안 금지**: 현재 제공된 내용에 대해서만 분석

## 에러 처리

### 즉시 종료 조건
- structure.json 없음 → 즉시 종료
- customActivities 빈 배열/undefined/null → 빈 JSON {} 생성 후 조기 종료 (정상 처리)

### 일반 에러 처리
- C# 파일 없음 → 경로 확인 후 스킵
- 파싱 오류 → 에러 로그 후 다음 클래스 진행
- 심볼 분석 실패 → fallback 으로 파일 직접 Read 시도
