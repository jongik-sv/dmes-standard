---
name: analyze-plsql
description: "MSSQL Stored Procedure / Function 심층 분석 및 종합 보고서 생성. SampleErp 정적 SQL 파일(`docs/external/SampleErp/procedures/{NAME}.sql`, `functions/{NAME}.sql`) 을 직접 읽어 분석. 호출관계에 있는 procedure/function 전체를 재귀적으로 분석하여 하나의 통합 보고서 생성. 사용 시점: /analyze-plsql NAME 호출 시, MSSQL procedure/function 분석이 필요할 때. 예: /analyze-plsql doAddress, /analyze-plsql FNGETCOMMNAME"
---

# MSSQL Stored Procedure / Function 심층 분석

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/...`). 본문에 `{moduleId}/...` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.
>
> **호출자 모듈 결정**: procedure 호출자가 단일 모듈이면 → `{areaId}/{moduleId}/DBMS/procedures/`. cross-module/미파악 → `_shared/DBMS/procedures/` (root, 영역 prefix 없음).

SampleErp 의 MSSQL Stored Procedure / Function 정적 SQL 파일을 심층 분석하여 비즈니스 로직, 데이터 흐름, 본문 상세를 추출하고 종합 보고서를 생성한다. 호출관계에 있는 다른 procedure/function 전체를 포함하여 하나의 문서로 생성한다.

> 산출물 템플릿(`templates/plsql_package_analysis_report_template.md`) 헤딩은 부산 시절 그대로 보존한다 — 산출물 동일성 우선. 본문 어휘는 PL/SQL → T-SQL 매핑을 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 와 [`references/plsql-analysis.md`](references/plsql-analysis.md) 에 따라 적용한다. 보고서 §1 에서 "MSSQL — 패키지 개념 없음, 단일 procedure/function" 명시.

**출력 형식**: `templates/plsql_package_analysis_report_template.md` 참조

## 매개변수
- `NAME`: Stored Procedure 또는 Function 이름 (예: `doAddress`, `FNGETCOMMNAME`)
  - 스키마명 불필요 (SampleErp 는 dbo 기본)
  - procedure / function 구분 불필요 (자동 감지: procedures/, functions/ 양쪽 검색)

## 실행 흐름

**상세 절차**: [`references/plsql-analysis.md`](references/plsql-analysis.md) 참조

### 시간 추적

각 Step 시작/완료 시 Bash 로 `date '+[%H:%M:%S]'` 를 실행하여 시각을 출력한다.

### Step 0: 사전 검증

Bash 로 시작 시각 출력: `echo "⏱️ MSSQL procedure/function 분석 시작: $(date '+%H:%M:%S')"`

1. NAME 파라미터 검증
2. (선택) Serena MCP 가용 여부 확인 — 미사용 가능

### Step 0.5: 기존 분석 문서 검색

NAME 으로부터 예상 파일명 `{NAME}_analysis_report.md` 를 생성하여 아래 위치 모두 검색.

1. **호출자 모듈 디렉토리** — `docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/procedures/{NAME}_analysis_report.md`
2. **공유 디렉토리** — `docs/external/SampleErp/orgErpReport/_shared/DBMS/procedures/{NAME}_analysis_report.md`

`{moduleId}` 를 모를 수 있으므로 Glob 으로 `docs/external/SampleErp/orgErpReport/**/procedures/{NAME}_analysis_report.md` 패턴 검색한다.

**발견 시**:
- 사용자에게 "기존 분석 문서가 있습니다. 재분석하시겠습니까?" 확인
- **재분석 거부** → 기존 문서 경로 안내 후 종료
- **재분석 승인** → Step 1 부터 진행

**미발견 시**: Step 1 부터 진행

### Step 1: SQL 본문 검색 (정적 파일 직접 Read)

Bash: `echo "⏱️ Step 1 (소스 검색) 시작: $(date '+%H:%M:%S')"`

다음 위치 순서대로 검색하여 발견된 파일 본문 Read:

1. `docs/external/SampleErp/procedures/{NAME}.sql` — Stored Procedure
2. `docs/external/SampleErp/functions/{NAME}.sql` — Function
3. `docs/external/SampleErp/views/{NAME}.sql` — View (해당 시)
4. `docs/external/SampleErp/triggers/{NAME}.sql` — Trigger (해당 시)

대소문자 무시 매칭 권장 (Glob `**/{NAME}.sql` 도 가능).

**검색 결과 처리**:
- **1개 발견** → 자동 선택, 본문 Read
- **2개 이상 발견 (예: procedures + functions 둘 다)** → AskUserQuestion 으로 선택
- **0개 발견** → 종료 ("SampleErp 안에 `{NAME}` 정의가 없습니다")

본문 첫 줄의 `CREATE PROCEDURE` / `CREATE FUNCTION` / `CREATE VIEW` / `CREATE TRIGGER` 헤더에서 객체 타입 자동 감지.

> **DB 미접속**: SampleErp 는 정적 파일 dump 만 제공. sqlcl/oracle/MSSQL 직접 접속 금지.

완료 후: `echo "✅ Step 1 완료: $(date '+%H:%M:%S')"`

### Step 2: 구조 분석

Bash: `echo "⏱️ Step 2 (구조 분석) 시작: $(date '+%H:%M:%S')"`

- 오브젝트 타입별 분석 전략 결정 (PROCEDURE / FUNCTION / VIEW / TRIGGER)
- 메타데이터 수집 (오브젝트명, 스키마(dbo 기본), 타입, 본문 줄 수)
- 헤더에서 파라미터/리턴 타입 추출
  - `CREATE PROCEDURE [dbo].[NAME] ( @p1 INT, @p2 NVARCHAR(50) OUT, ... ) AS BEGIN ...`
  - `CREATE FUNCTION [dbo].[NAME] (@p1 INT) RETURNS INT AS BEGIN ... RETURN ... END`

> MSSQL 은 패키지 개념이 없으므로 항상 단일 객체. 보고서 §1 에서 "패키지 개념 없음, MSSQL 단일 PROCEDURE/FUNCTION" 명시.

완료 후: `echo "✅ Step 2 완료: $(date '+%H:%M:%S')"`

### Step 3: 본문 심층 분석

Bash: `echo "⏱️ Step 3 (심층 분석) 시작: $(date '+%H:%M:%S')"`

본문에 대해 8개 항목 분석:

1. **비즈니스 목적 추론** (핵심 업무, 입출력)
2. **실행 흐름 분석** (BEGIN-END 단계별)
3. **제어 흐름 분석** (`IF`/`WHILE`/`CASE`)
4. **데이터 접근 패턴** (SELECT/INSERT/UPDATE/DELETE/MERGE)
5. **비즈니스 규칙 추출** (검증, 계산, 특수처리)
6. **트랜잭션 제어** (`BEGIN TRAN`, `SAVE TRANSACTION`, `COMMIT`, `ROLLBACK`)
7. **예외 처리** (`BEGIN TRY/CATCH`, `RAISERROR`, `THROW`)
8. **외부 의존성** (호출 procedure/function — 본문 정규식)

상세는 [references/plsql-analysis.md](references/plsql-analysis.md) 참조.

완료 후: `echo "✅ Step 3 완료: $(date '+%H:%M:%S')"`

### Step 3.5: 호출 procedure 재귀 분석

Bash: `echo "⏱️ Step 3.5 (재귀 분석) 시작: $(date '+%H:%M:%S')"`

- 호출하는 외부 procedure/function 을 재귀적으로 분석
- 본문 정규식으로 호출 감지 (`exec\s+(?:dbo\.)?(\w+)`, `\bdbo\.(\w+)\s*\(`)
- 기존 보고서 있으면 재활용, 없으면 Step 1~6 재귀 호출
- **최대 재귀 깊이: 3** (초과 시 호출 기록만 남김)
- **순환 참조 방지**: analyzedSet 으로 추적

완료 후: `echo "✅ Step 3.5 완료: $(date '+%H:%M:%S')"`

### Step 4: 테이블 의존성 및 ER 관계 추출
- 전체 procedure/function 본문에서 테이블 목록 수집
- 테이블별 역할 분류 (임시/마스터/상세/전표)
- `docs/external/SampleErp/tables/{tableName}.sql` 정적 파일 보강 — 컬럼/PK/FK 정확히 추출
- JOIN 관계 추출

### Step 5: Mermaid 워크플로우 다이어그램 생성
- 진입점 procedure 기준으로 플로우 추적
- 메인 → 호출 procedure 순서 배치

### Step 6: Markdown 보고서 생성

Bash: `echo "⏱️ Step 6 (보고서 생성) 시작: $(date '+%H:%M:%S')"`

- 템플릿 로드: `templates/plsql_package_analysis_report_template.md` (헤딩 그대로 사용)
- 본문 채울 때 PL/SQL → T-SQL 어휘 매핑 적용 (vocabulary-mapping.md 참조)
- 보고서 §1 에서 "MSSQL — 패키지 개념 없음" 명시
- 호출 procedure 요약 및 링크 삽입

완료 후: `echo "✅ MSSQL procedure/function 분석 완료: $(date '+%H:%M:%S')"`

**출력 경로 (V2 표준)**:

| 위치 | 경로 |
|------|------|
| **호출자 모듈 디렉토리** (호출자 단일 모듈인 경우) | `docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/procedures/{NAME}_analysis_report.md` |
| **공유 디렉토리** (cross-module 또는 호출자 미파악) | `docs/external/SampleErp/orgErpReport/_shared/DBMS/procedures/{NAME}_analysis_report.md` |

> V1 → V2 변경: `{moduleId}/DBMS/{NAME}_analysis_report.md` 는 더 이상 사용하지 않는다. 모든 procedure 분석 보고서는 `DBMS/procedures/` 하위에 두며, `DBMS/tables/`, `DBMS/triggers/`, `DBMS/views/` 와 형식적으로 대등하다.

> moduleId 를 결정할 때, 호출자 화면이 단일 모듈이면 그 모듈 아래에 두고, 여러 모듈에서 호출되거나 호출자 미파악 시 `_shared/DBMS/procedures/` 에 둔다.

## DB 접속 정보

본 스킬은 **DB 직접 접속을 사용하지 않는다**. SampleErp 의 모든 SQL 본문은 `docs/external/SampleErp/procedures/`, `functions/`, `tables/`, `views/`, `triggers/` 의 정적 파일 dump 로 제공되며, Read 도구로 직접 읽는다.

## 에러 처리
- 파라미터 누락 → 사용법 출력 후 종료
- 정적 파일 미발견 → 즉시 종료 ("SampleErp 에 `{NAME}` 정의가 없습니다")
- 파싱 오류 → 로그 후 다음 진행
- 재귀 깊이 초과 → 호출 기록만 남기고 분석 생략

## 실행 정책

- **팀원 spawn 절대 금지**: 팀모드(tmux)에서 실행되더라도 TeamCreate 등으로 새 팀원을 spawn 하지 않는다. 모든 병렬/위임 작업(재귀 분석, 호출 procedure 분석 등)은 반드시 **Agent tool**의 `subagent_type` 파라미터를 지정하여 서브에이전트로 실행한다.

## 제한사항
- 중간 JSON 파일 미생성 (Markdown 보고서만)
- 정적 분석만 수행 (실행 성능 미측정)
- 동적 SQL (`EXEC sp_executesql @sql`) 은 제한적 분석
