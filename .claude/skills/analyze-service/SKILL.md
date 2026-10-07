---
name: analyze-service
description: "SampleErp(C# WinForms + 레거시 DB: Oracle·PostgreSQL·MSSQL) 레거시 화면 데이터 수집 자동 실행 (Phase 1-4 오케스트레이션). Phase 1(구조 파악), Phase 2(C# partial class 분석), Phase 2.5(커스텀 클래스), Phase 3(DB procedure 분석), Phase 4(WinForms UI 분석)를 순차 실행하여 중간 JSON 을 {moduleId}/.cache/{SCREEN-ID}/ 에 저장 (V3 — 화면별 격리). 화면 통합 보고서 생성은 /generate-bpa 사용 (V3 — BPA 본문 + 기술 상세 Appendix 단일 MD). 사용 시점: /analyze-service SCREEN-ID 호출 시, SampleErp 화면(예: SOA004K, QMA001K, GIA044K)의 종합 분석 요청 시. 개별 Phase만 실행 요청도 지원."
---

# SampleErp 화면 전체 분석

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석된다 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/...`). 본문에 `{moduleId}/...` 로 적힌 경로는 자동으로 영역 prefix 가 붙는다.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.
>
> 예: `/analyze-service QMA001K` → `docs/external/SampleErp/orgErpReport/품질/QMA/.cache/QMA001K/`. `extractModuleId(SCREEN-ID)` 와 함께 `extractAreaId(moduleId)` 도 lookup 후 경로 조립.

SampleErp(C# WinForms + 레거시 DB — 원천 DBMS 는 고객사마다 다름: Oracle PL/SQL · PostgreSQL PL/pgSQL · MSSQL T-SQL) 화면을 Phase 1~4 순차 실행하여 비즈니스 로직, 데이터 구조, UI 요구사항을 중간 JSON 으로 추출한다. 화면 통합 보고서 생성은 `/generate-bpa` 를 사용한다 (`/generate-legacy` 는 V3 부터 deprecated alias).

**핵심 목표**: Phase 1~4 데이터 수집을 자동화하여 후속 문서 생성 스킬의 입력 데이터를 확보

> 산출물 템플릿/JSON 스키마 키는 부산 시절 그대로 보존한다. C# 본문 어휘와 DB 방언 어휘(원천 DBMS 판정 후 그 방언 열)는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 를 참조하여 매핑한다.

분석 흐름:
1. Phase 1: 구조 파악 (Designer.cs / 화면 폴더 파싱) → [references/phase1.md](references/phase1.md)
2. 서브화면(다른 화면 호출) 재귀 분석
3. Phase 2+2.5: C# 심층 분석 (LLM 직접 분석 + /analyze-custom-class 위임) → [references/phase2.md](references/phase2.md)
4. Phase 3: 레거시 DB Package / Stored Procedure 분석 (원천 DBMS 판정 → procedures/*.sql 정적 파일 직접 읽기) → [references/phase3.md](references/phase3.md)
5. Phase 4: WinForms UI 분석 (Designer.cs `InitializeComponent()` + .resx) → [references/phase4.md](references/phase4.md)

## 공통 사전 준비

```js
// SCREEN-ID 패턴: ^[A-Z]{3}\d{3}K$  (예: SOA004K, QMA001K, CEA035K, RPD001K)
// moduleId 추출: SCREEN-ID 앞 3글자 (예: SOA004K → SOA, QMA001K → QMA)
function extractModuleId(screenId) {
  const m = screenId.match(/^([A-Z]{3})\d{3}K$/);
  return m ? m[1] : null;
}
```

- **분석 대상 입력 위치 (SampleErp 정적 자료)**:
  - 화면 폴더: `docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/{도메인}/.../{SCREEN-ID}*/` (한글 도메인 폴더 포함)
  - 화면 파일 트리플: `{SCREEN-ID}.cs` + `{SCREEN-ID}.Designer.cs` + `{SCREEN-ID}.resx`
  - Stored Procedure: `docs/external/SampleErp/procedures/{procName}.sql`
  - Function: `docs/external/SampleErp/functions/{funcName}.sql`
  - Table 정의: `docs/external/SampleErp/tables/{tableName}.sql`
  - View: `docs/external/SampleErp/views/{viewName}.sql`
  - Trigger: `docs/external/SampleErp/triggers/{triggerName}.sql`

- **출력 디렉토리 (V3 표준)**: `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/` (중간 JSON — 화면별 격리)

  > V2 → V3 변경: 모듈 단일 `.temp/` + 파일명 prefix (`{SCREEN}_structure.json`) 방식에서, 화면별 `.cache/{SCREEN-ID}/` 디렉토리 + prefix 없는 파일명 (`structure.json`) 으로 변경. 화면별 격리로 cross-screen 충돌 방지 + class 분석 / inline 쿼리도 같은 디렉토리에 응집된다.

  ```
  {moduleId}/.cache/{SCREEN-ID}/
  ├── structure.json          (Phase 1)
  ├── java_analysis.json      (Phase 2 + 2.5 — 키명 보존: C# partial class 분석 결과)
  ├── sql_analysis.json       (Phase 3)
  ├── ui_analysis.json        (Phase 4)
  ├── inline_queries.md       (analyze-queries 산출, 있으면)
  └── classes/
      └── {ClassName}.md      (analyze-custom-class 산출, 있으면)
  ```

## SCREEN-ID → 화면 폴더 검색

SampleErp 는 한글 도메인 폴더가 깊이 들어있어 매번 Glob 검색이 필요하다. 권장 패턴:

```bash
# Glob 도구로 prefix 매칭
glob: docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/**/{SCREEN-ID}*/{SCREEN-ID}.cs
```

폴더명은 `{SCREEN-ID}.{한글설명}` 형태가 일반적 (예: `SOA004K.{CLIENT} Job매칭/SOA004K.cs`). 단순 코드 폴더(`SOA004K/`)도 가능. Glob 의 `{SCREEN-ID}*/` 가 두 경우 모두 잡는다.

## 개별 Phase 실행

사용자가 특정 Phase만 실행을 요청하면 해당 references 파일을 읽고 지침을 따른다:
- Phase 1만 → [references/phase1.md](references/phase1.md) 참조
- Phase 2만 → [references/phase2.md](references/phase2.md) 참조
- Phase 3만 → [references/phase3.md](references/phase3.md) 참조
- Phase 4만 → [references/phase4.md](references/phase4.md) 참조

> **참고**: 개별 Phase 는 별도의 독립 스킬/커맨드가 아니라, 이 analyze-service 스킬 내부에서 특정 Phase 지침만 실행하는 방식이다. 커스텀 클래스 분석은 별도 스킬 `/analyze-custom-class` 를 사용한다.

## 통합 실행 오케스트레이션

> **자동 스킵**: Phase 1~4 출력 JSON 이 이미 존재하면 자동 스킵한다. `--force` 플래그 추가 시 중간 JSON 을 무시하고 전체 Phase 를 재실행한다.

> **MVP 단계의 분석 방식**: Phase 1~4 는 LLM 이 references/phase{N}.md 의 알고리즘대로 Read/Glob 도구를 직접 사용하여 산출 JSON 을 작성한다 (부산용 phase1-analyzer.js 는 GLUE/Oracle 전용으로 SampleErp 입력에 호환되지 않으므로 호출하지 않는다. 같은 이유로 쓰이지 않던 phase2-generator.py·phase3-generator.py 와 analyze-queries 의 orchestrator.py 는 2026-10-07 에 삭제했다). 후속 단계에서 SampleErp 용 자동화 스크립트로 대체될 수 있다.

### 시간 추적

각 Step 시작 전에 Bash 로 `date '+[%H:%M:%S]'` 를 실행하여 시작 시각을 출력한다. 최초 Step 1 시작 시각을 기록하고, Step 6 완료 보고에서 전체 경과 시간을 함께 표시한다.

```
⏱️ Step N 시작: [HH:MM:SS]
... (작업 수행) ...
✅ Step N 완료: [HH:MM:SS] (소요: Xm Ys)
```

### Step 1: Phase 1 - 구조 파악

**[references/phase1.md](references/phase1.md) 참조**

Bash 로 시작 시각 출력: `echo "⏱️ Step 1 (Phase 1 구조 파악) 시작: $(date '+%H:%M:%S')"`

phase1.md 의 알고리즘대로:
1. `screen_inventory.json` 또는 직접 Glob 으로 SCREEN-ID 의 화면 폴더 위치 확정
2. `{SCREEN-ID}.Designer.cs` Read → `InitializeComponent()` 안 컴포넌트/이벤트 추출
3. `{SCREEN-ID}.cs` Read → partial class 메서드/필드 + procedure 호출 추출
4. structure.json 작성

결과: `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/structure.json` (V3 — 화면별 격리 디렉토리)

완료 후: `echo "✅ Step 1 완료: $(date '+%H:%M:%S')"`

### Step 2: 서브화면 재귀 분석

Bash 로 시작 시각 출력: `echo "⏱️ Step 2 (서브화면 재귀 분석) 시작: $(date '+%H:%M:%S')"`

structure.json 의 `subServices` 배열 (SampleErp 에서는 코드 안에서 발견한 다른 화면 호출 — 예: `new SOA005K().ShowDialog()` 또는 `new InspDialog().Show()`) 을 확인한다.

- `subServices` 가 비어있으면 → Step 3 으로 진행
- 각 서브화면에 대해:
  - `screen_inventory.json` 또는 Glob 으로 서브화면 폴더 미존재 → 스킵
  - `docs/external/SampleErp/orgErpReport/{subModuleId}/screens/{SUB-SCREEN-ID}.md` 존재 → 스킵 (이미 분석됨 — V3)
  - 미분석 → `/analyze-service [SUB-SCREEN-ID]` 재귀 호출 (Skill tool 사용)
- 순환 참조 방지: 기존 보고서 존재 여부로 자연스럽게 무한루프 차단

완료 후: `echo "✅ Step 2 완료: $(date '+%H:%M:%S')"`

### Step 3: Phase 2 + 2.5 - C# partial class 심층 분석

Bash 로 시작 시각 출력: `echo "⏱️ Step 3 (Phase 2+2.5 C# 분석) 시작: $(date '+%H:%M:%S')"`

**"없으면 분석, 있으면 사용" 전략으로 customClass 보고서 → java_analysis.json 생성**

(JSON 파일명은 `java_analysis.json` 으로 보존한다 — 산출물 구조 동일성 우선. 본문 의미는 C# partial class 분석 결과로 채운다.)

#### 3-1. 기존 분석 결과 확인

structure.json 의 `customActivities` 배열에 등록된 각 클래스에 대해, `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/classes/{ClassName}.md` (V3) 존재 여부 확인:
- 모두 존재 → 그대로 읽어 java_analysis.json 작성, Step 4 로
- 일부 누락 → Step 3-2 로

#### 3-2. 누락 클래스 분석

각 누락 클래스에 대해 Agent tool 로 커스텀 클래스 분석 실행 (`model="sonnet"`, `subagent_type="general-purpose"`):
- 프롬프트에 `/analyze-custom-class {파일경로}` 실행 지시 (예: `/analyze-custom-class "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.cs"`)
- 동일 클래스 중복 제거

#### 3-3. java_analysis.json 통합

모든 누락 클래스 분석 완료 후 customClass 보고서를 읽어 `java_analysis.json` 의 `classes` 객체로 통합. 출력: `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/java_analysis.json` (V3)

#### Fallback (분석 불가 시)

특정 클래스 분석 실패 시:
1. [references/phase2.md](references/phase2.md) 참조하여 정책 전달
2. Agent tool 로 `csharp-legacy-analyzer` (또는 `java-legacy-analyzer` — 본문 어휘만 C# 으로 갱신됨) subagent 실행 (`model="sonnet"`)

완료 후: `echo "✅ Step 3 완료: $(date '+%H:%M:%S')"`

### Step 4: Phase 3 - 레거시 DB Stored Procedure 분석

Bash 로 시작 시각 출력: `echo "⏱️ Step 4 (Phase 3 레거시 DB 분석) 시작: $(date '+%H:%M:%S')"`

**"없으면 분석, 있으면 사용" 전략으로 procedures/functions 정적 파일 → sql_analysis.json 생성**

#### 4-0. 원천 DBMS 판정

[`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3-1 순서(README `원천 DBMS:` 줄 → `.sql` 본문 문법 단서 → 사용자 확인)로 한 번 판정한다. 이후 패턴 적용과 서브에이전트 위임에 같은 값을 쓴다. SQLite 원천이면 저장 프로시저가 없으므로 4-2 를 건너뛰고 앱 inline SQL 만 분석한다.

#### 4-1. 호출 procedure/function 목록 확정

structure.json 의 `dataFlow.sqlQueries` + `dataFlow.javaSqlQueries` (C# 코드에서 추출한 `AppDB.Execute("procName")` 호출명) 합집합을 분석 대상으로 결정.

#### 4-2. 정적 파일 매핑

각 호출명에 대해 `docs/external/SampleErp/procedures/{name}.sql` 또는 `functions/{name}.sql` 존재 여부 확인.
- 존재 → Read 로 본문 로드, 분석
- 없음 → `analyzed=false` 로 sql_analysis.json 의 `plsqlCalls.detectedCalls` 에 기록 (이름 보존: `plsqlCalls` — 산출물 키 동일성 우선)

#### 4-3. 분석 알고리즘

phase3.md 참조. 각 procedure 본문에 대해:
- `CREATE [OR REPLACE|OR ALTER] PACKAGE/PROCEDURE/FUNCTION` 헤더에서 파라미터/리턴 추출 (Oracle 은 PACKAGE 단위)
- `SELECT/INSERT/UPDATE/DELETE` 문 추출 + 테이블/컬럼/JOIN 분석
- 판정 방언의 호출 패턴으로 다른 procedure/function 호출 감지
  - Oracle: `PKG.PROC(...)`, 블록 안 단독 `PROC(...);`, `EXECUTE IMMEDIATE`
  - PostgreSQL: `CALL p(...)`, `PERFORM f(...)`, `SELECT f(...)`, `EXECUTE format(...)`
  - MSSQL: `exec\s+(?:dbo\.)?(\w+)`, `dbo\.(\w+)\s*\(`, `sp_executesql`

출력: `docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/sql_analysis.json` (V3)

#### Fallback (분석 불가 시)

1. [references/phase3.md](references/phase3.md) 참조
2. Agent tool 로 `general-purpose` subagent 실행 (`model="sonnet"`, **`team_name`/`name` 파라미터 절대 불포함**). 프롬프트에 `/analyze-plsql {NAME}` 스킬 호출과 4-0 에서 판정한 `원천 DBMS: X` 를 함께 넘긴다 (전용 SQL 분석 에이전트 타입은 두지 않는다)

완료 후: `echo "✅ Step 4 완료: $(date '+%H:%M:%S')"`

### Step 5: Phase 4 - WinForms UI 분석

Bash 로 시작 시각 출력: `echo "⏱️ Step 5 (Phase 4 UI 분석) 시작: $(date '+%H:%M:%S')"`

**[references/phase4.md](references/phase4.md) 참조**

Agent tool 로 subagent 실행 (`model="sonnet"`, **`team_name`/`name` 파라미터 절대 불포함**):
```
subagent_type="general-purpose", model="sonnet"
Phase 4 지침(references/phase4.md)을 따라 [SCREEN-ID] 분석
입력: {SCREEN-ID}.Designer.cs 의 InitializeComponent() + {SCREEN-ID}.resx
출력: {moduleId}/.cache/{SCREEN-ID}/ui_analysis.json (V3 — prefix 없는 파일명)
```
> ⚠️ `team_name`, `name` 파라미터를 포함하면 서브에이전트가 아닌 팀원이 생성되어 규칙 위반이다.

검증: `{moduleId}/.cache/{SCREEN-ID}/ui_analysis.json` 존재 및 serviceInfo 필드 확인

완료 후: `echo "✅ Step 5 완료: $(date '+%H:%M:%S')"`

### Step 6: 완료 보고

Bash 로 완료 시각 출력: `echo "⏱️ 전체 데이터 수집 완료: $(date '+%H:%M:%S')"`

```
📊 Phase 1~4 데이터 수집 완료:
- 컴포넌트: [N]개, Custom 클래스: [M]개, SQL 프로시저: [K]개, UI 컴포넌트: [L]개
- 전체 소요 시간: [Step 1 시작 ~ Step 6 완료 경과 시간]

📁 중간 JSON (V3 — .cache/{SCREEN}/ 격리):
   docs/external/SampleErp/orgErpReport/{moduleId}/.cache/[SCREEN-ID]/{structure,java_analysis,sql_analysis,ui_analysis}.json

📝 화면 통합 보고서 생성:
  /generate-bpa [SCREEN-ID]
  → screens/[SCREEN-ID].md (BPA 본문 + 기술 상세 Appendix) + screens/[SCREEN-ID].bpmn

  ※ /generate-legacy 는 V3 부터 /generate-bpa 의 deprecation alias
```

## 실행 정책

- **세션 완수 정책 준수**: [`../_shared/session-completion-policy.md`](../_shared/session-completion-policy.md) — Phase 1~4 JSON 산출 도중 "다음 세션 Phase X" 로 미루기 금지. 한 응답 한도 초과 시 같은 세션 내 turn 분할로 4 Phase 모두 완수.
- **팀원 spawn 절대 금지**: 팀모드(tmux)에서 실행되더라도 TeamCreate 등으로 새 팀원을 spawn 하지 않는다. 모든 병렬/위임 작업은 반드시 **Agent tool**의 `subagent_type` 파라미터를 지정하여 서브에이전트로 실행한다. **Agent tool 호출 시 `team_name`, `name` 파라미터를 절대 포함하지 않는다** — 이 파라미터가 포함되면 서브에이전트가 아닌 팀원이 생성된다. 이 규칙은 재귀 호출(서브화면 분석, DB procedure 분석 등) 포함 모든 단계에 적용된다.
- **순차 실행 필수**: Phase 2 → 3 → 4 는 이전 Phase 완료 확인 후 다음 시작
- **절대로 동일 메시지에서 여러 Agent 동시 호출 금지**
- **Early Termination**: customActivities 비어있으면 Phase 2 에서 빈 JSON 생성 후 즉시 종료
- **중간 JSON 자동 스킵**: 출력 JSON 존재 시 자동 스킵. `--force` 옵션으로 중간 JSON 강제 재생성 가능
- **MCP**: Serena MCP 가 C# 을 지원하면 활용. 미지원 또는 부재 시 Read+Grep 으로 fallback (기능 손실 없음, 효율만 저하).
- **DB 미접속**: SampleErp 는 정적 파일 dump 이므로 원천 DBMS 와 무관하게 DB 접속(sqlcl·psql·sqlcmd 등) 불필요. 모든 SQL 본문은 Read 로 가져온다.
- **query-cache 미사용**: SampleErp 환경에서는 query-cache 의존 없음.

## 에러 처리

| 상황 | 대응 |
|------|------|
| Phase 결과 JSON 미생성 | 해당 Phase 재실행 |
| Phase 2 규칙 위반 | 결과 삭제 후 강화 정책으로 재실행 |
| 서브화면 폴더 미존재 | 스킵 후 계속 진행 |
| 화면 폴더 검색 실패 | 즉시 종료 ("SCREEN-ID 가 SampleErp orgErpSource 안에 없습니다") |
