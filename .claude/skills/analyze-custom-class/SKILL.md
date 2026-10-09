---
name: analyze-custom-class
description: "특정 C# partial class(SampleErp 화면 또는 Dialog) 비즈니스 로직 심층 분석. 클래스 구조, 메서드 상세, SQL 매핑, 비즈니스 분석을 포함한 종합 보고서를 자동 생성. 사용 시점: /analyze-custom-class CLASS-NAME 또는 파일 경로 호출 시, 개별 C# partial class 의 비즈니스 로직 분석이 필요할 때."
---

# C# partial class 비즈니스 로직 심층 분석

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/...`). 본문에 `{moduleId}/...` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.

사용자가 지정한 C# partial class (SampleErp Tasks/Foundation/Shared 안의 화면 또는 Dialog) 를 심층 분석하여 클래스 구조, 메서드 상세, SQL 매핑, 비즈니스 분석 상세를 포함한 종합 보고서를 자동 생성한다.

> 산출물 헤딩 / 파일명 컨벤션은 부산 시절 그대로 보존한다 — 산출물 동일성 우선. 본문 어휘 매핑은 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 참조.

## 사용법

```bash
# 절대 경로 / 프로젝트 상대 경로 지정
/analyze-custom-class "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.cs"

# 클래스명만 지정 (자동 검색)
/analyze-custom-class SOA004K
/analyze-custom-class AssetDialog

# 복수 클래스 분석
/analyze-custom-class SOA004K, SOA005K

# 폴더(모듈/도메인) 전체 분석
/analyze-custom-class docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리 모두 분석해
```

## 실행 알고리즘

### 시간 추적

각 Step 시작/완료 시 Bash 로 `date '+[%H:%M:%S]'` 를 실행하여 시각을 출력한다.

### Step 0: 매개변수 검증 및 파일 찾기

Bash 로 시작 시각 출력: `echo "⏱️ 클래스 분석 시작: $(date '+%H:%M:%S')"`

- 복수 클래스 지정 시 콤마(,)로 분리
- **파일 경로 지정 시**: 해당 경로 직접 사용
- **클래스명만 지정 시** (예: `SOA004K`):
  - Glob 으로 `docs/external/SampleErp/orgErpSource/**/{ClassName}.cs` 검색
  - 화면 폴더 패턴: `Tasks/**/{ClassName}*/{ClassName}.cs`
  - Foundation/Shared 패턴: `{Foundation,Shared}/**/{ClassName}.cs`
- **폴더 지정 시**: Glob 으로 해당 폴더 안의 `*.cs` 전체 (단, `*.Designer.cs` 제외)
- **파일을 못 찾은 경우 Fallback**: `docs/external/SampleErp/orgErpReport/*/.cache/*/java_analysis.json` (V3) 또는 V2 잔존 `.temp/*_java_analysis.json` 검색. 존재하면 기존 분석 결과를 활용하여 보고서만 재생성 (재분석 생략)
- 파일도 없고 기존 분석 결과도 없으면 즉시 종료

### Step 1: 클래스 구조 분석

Serena MCP 가 C# 을 지원하면 활용. 미지원/부재 시 Read+Grep 으로 fallback.

#### 1-1. 클래스 개요 분석
```bash
# Serena 사용 가능 시
mcp__serena__get_symbols_overview --file="[FilePath]"
# 또는 직접 Read + 정규식
```
추출:
- `namespace` 경로 (예: `KsmK.Tasks.영업관리.수주관리.SOA004K`)
- `partial class` 이름
- 베이스 클래스 (`: FormWith1Grid`, `: DialogWith1Grid`, `: Form` 등)
- 구현 인터페이스 (콤마 나열)
- `using` 임포트 (예: `using FarPoint.Win.Spread;`)
- 전체 라인 수

#### 1-2. 메서드/필드 상세 추출
```bash
# Serena 사용 가능 시
mcp__serena__find_symbol --file="[FilePath]" --type="method"
mcp__serena__find_symbol --file="[FilePath]" --type="field"
# 또는 직접 Read + 정규식
```
추출:
- public/protected/private/internal 메서드, 파라미터, 반환 타입, throws (C# 에서는 `throws` 없으므로 본문의 `throw new ...` 추출)
- 멤버 변수 (`private DataSet ds;` 등)
- 이벤트 핸들러 (`btnXxx_Click`, `Form_Load` 등)

> Designer.cs 와 partial class 분리: `{ClassName}.Designer.cs` 는 UI 정의, `{ClassName}.cs` 는 비즈니스 로직. **본 스킬은 비즈니스 로직 (cs) 만 분석**한다. UI 분석은 Phase 4 (analyze-service) 에서 수행.

### Step 2: WinForms 화면 특화 분석 (해당 시)

#### 2-1. 베이스 클래스 확인
- `FormWith1Grid` / `DialogWith1Grid` 상속 시: `OnLoad()`, `OnSearch()`, `OnSave()`, `OnClear()` 등 베이스 클래스 가상 메서드 오버라이드 우선 분석
- 베이스 클래스 본문이 Foundation/Shared 에 있으면 한 번 Read 하여 컨텍스트로 활용

#### 2-2. SQL 매핑 추출
- `MainQueryConstants` (있으면): `SELECT_SQL`, `INSERT_SQL` 등 상수 추출
- `AppDB.Execute(...)` 호출 패턴 (procedure 이름 추출)
- `MainQuery.Get(...)` 호출 패턴 (query 이름 추출)
- inline `SqlCommand` (있으면)

#### 2-3. Dialog 결과 패턴 분석
- 반환값: `DialogResult.OK` / `DialogResult.Cancel` / `DialogResult.Yes` 등
- 화면 호출 패턴: `var dlg = new SubDialog(); if (dlg.ShowDialog() == DialogResult.OK) { ... }`

### Step 3: 분석 보고서 생성

#### 3-1. 마크다운 보고서
**파일**: `{ClassName}_analysis.md`

> 파일명에서 `{SCREEN-ID}.` prefix 와 `_class_` 의 `class_` 접두는 **제거**한다. 화면 폴더 안에 `_classes/` 라는 격리된 위치에 저장되므로 SCREEN-ID prefix 가 불필요하다.

```markdown
# [ClassName] 상세 분석

| 항목 | 내용 |
|------|------|
| 파일 경로 | `[FilePath]` |
| 네임스페이스 | `[Namespace]` |
| 베이스 클래스 | `[BaseClass]` |
| 구현 인터페이스 | `[InterfaceNames]` |
| 총 라인 수 | `[LineCount]` 라인 |
| 메서드 수 | `[MethodCount]`개 |
| 분석일자 | `[AnalysisDate]` |

---

## 1. 클래스 개요
[클래스의 비즈니스적 목적]

### 1.1 상속/구현 관계
### 1.2 핵심 입력/출력

## 2. 메서드 상세 분석
### 2.1 [메서드명]()
| 항목 | 내용 |
|------|------|
| 목적 | [목적] |
| 복잡도 | [낮음/중간/높음/매우 높음] |
**처리 흐름**: 1. [단계1] 2. [단계2] ...

## 3. 비즈니스 규칙
| # | 규칙명 | 조건 | 결과 |

## 4. SQL 매핑
| SQL Key (procedure 이름) | 용도 | 호출 시점 |

## 5. 참조 업무기준
| 업무기준 ID | 조건 | 결과 | 용도 |

## 6. 비즈니스 분석 상세
> 비즈니스 로직이 단순한 클래스는 6.1 만 간략히 기술

### 6.1 업무 목적 및 배경
### 6.2 핵심 비즈니스 로직
### 6.3 업무기준 참조
### 6.4 타 시스템 연동
### 6.5 데이터 영향 범위
### 6.6 주의사항 및 제약조건
```

#### 3-2. JSON 메타데이터
**파일**: `{ClassName}.json` (선택. V3 에서는 `.cache/{SCREEN-ID}/classes/{ClassName}.json` 으로 저장 가능 — 기본은 본문 MD 만 산출)

> analyze-service Phase 2 의 java_analysis.json per-class 스키마와 동일 구조 (산출물 동일성 우선 — 키 이름 보존)

```json
{
  "analysisModel": "sonnet",
  "purpose": "[목적]",
  "complexity": "[낮음/중간/높음/매우 높음]",
  "filePath": "docs/external/SampleErp/orgErpSource/...",
  "classStructure": {
    "extends": "", "implements": [], "imports": [], "constants": [], "memberVariables": []
  },
  "classDocumentation": {
    "description": "", "author": "", "version": "", "createdDate": ""
  },
  "mainLogic": {
    "method": "", "description": "", "inputType": "", "outputType": "", "steps": []
  },
  "keyMethods": [
    {"name": "", "purpose": "", "complexity": "", "parameters": [], "returnType": "",
     "businessLogic": {"algorithms": [], "dataStructures": [], "specialCases": []}}
  ],
  "businessRules": [
    {"ruleId": "", "name": "", "condition": "", "logic": "", "validation": "", "exception": ""}
  ],
  "sqlMappings": {
    "extractedPatterns": [{"pattern": "", "constantName": "", "line": "", "context": ""}],
    "constantsResolved": [{"constantName": "", "resolvedKey": "", "source": "", "confidence": ""}],
    "dynamicSqlPatterns": [{"pattern": "", "method": "", "parameters": []}],
    "usageFrequency": [{"sqlKey": "", "usageCount": "", "locations": []}]
  },
  "businessAnalysis": {
    "purpose": "",
    "coreLogic": [{"description": "", "conditions": [], "hardcodedValues": []}],
    "easyAccessRules": [{"ruleId": "", "usage": ""}],
    "externalSystems": [{"system": "", "type": "", "description": ""}],
    "dataImpact": {"tables": [], "downstreamEffects": []},
    "constraints": [], "operationalNotes": []
  },
  "dataFlow": {"input": {}, "processing": [], "output": {}},
  "dependencies": {"framework": [], "business": [], "dataStructures": []},
  "exceptionHandling": {"checkedExceptions": [], "errorCases": []},
  "complexityFactors": []
}
```

### Step 4: 출력 파일 저장

**표준 구조 (V3)** — 화면 캐시 디렉토리 하위 `.cache/{SCREEN-ID}/classes/` (사용자 시야에서 은닉):

```
docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/
├── structure.json                  (analyze-service Phase 1)
├── java_analysis.json              (analyze-service Phase 2 — 키명 보존)
├── sql_analysis.json               (analyze-service Phase 3)
├── ui_analysis.json                (analyze-service Phase 4)
├── inline_queries.md               (analyze-queries 산출, 있으면)
└── classes/
    ├── {ClassName}.md              # 마크다운 보고서 (prefix / _analysis 접미사 없음)
    ├── {SubDialog}.md              # 동일 화면 내 다른 partial class
    └── ...
```

> V2 → V3 변경: `{SCREEN-ID}/_classes/{ClassName}_analysis.md` → `.cache/{SCREEN-ID}/classes/{ClassName}.md`. 화면 폴더 자체 폐기 + class 분석 본문은 사용자 시야에서 은닉 (PRIMARY `screens/{SCREEN-ID}.md` 의 §6 에 핵심만 인라인 인용, 전체 본문은 `.cache/.../classes/{ClassName}.md` 링크로 접근).

> Foundation/Shared 베이스 클래스 (SCREEN-ID 무관, cross-module 재사용) 는 `_shared/DBMS/classes/{ClassName}.md` 에 저장. (V2 의 `_shared/customClass/` 는 더 이상 사용하지 않는다.)

### Step 5: 인덱스 파일 갱신

완료 후: `echo "✅ 클래스 분석 완료: $(date '+%H:%M:%S')"`

`index.md` 에 새 분석 결과 추가:
```markdown
# C# 클래스 분석 목록
| 클래스명 | 네임스페이스 | 라인 수 | 분석일자 | 보고서 |
```

## 복잡도 평가 기준

| 등급 | 기준 |
|------|------|
| 낮음 | get/set, 단순 파라미터 변환, Form 컨트롤 ↔ DataSet 단순 매핑 |
| 중간 | 조건 분기 2-3개, 단순 반복문, 단일 procedure 호출 |
| 높음 | 계산 로직, 중첩 반복문, 다중 예외 처리, 다중 procedure 연계 |
| 매우 높음 | 복잡한 상태 머신, 다중 분기, 대량 비즈니스 규칙 |

## 실행 정책

- **팀원 spawn 절대 금지**: 팀모드(tmux)에서 실행되더라도 TeamCreate 등으로 새 팀원을 spawn 하지 않는다. 모든 병렬/위임 작업은 반드시 **Agent tool**의 `subagent_type` 파라미터를 지정하여 서브에이전트로 실행한다.

## 주의사항

- 파일 존재 확인 우선: Glob/Read 로 확인, 없으면 즉시 종료
- Serena MCP 가용 시 활용 (C# 지원 시), 미지원/부재 시 Read+Grep fallback (기능 손실 없음)
- WinForms 화면 특화: `FormWith1Grid` / `DialogWith1Grid` 상속 시 가상 메서드 오버라이드 우선 분석
- Designer.cs 는 UI 정의 — 본 스킬은 비즈니스 로직 (cs) 만 분석
- 비즈니스 분석 충실성: 하드코딩 값의 업무적 의미, 타 시스템 연동, CRUD 대상 테이블
- 간결성 원칙: 단순 클래스는 6.1 만 간략히, 6.2~6.6 은 생략 가능
- C# .NET Framework / .NET Core 호환, UTF-8 또는 UTF-8 BOM 인코딩
