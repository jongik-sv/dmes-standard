---
name: analyze-queries
description: "레거시 DB(Oracle·PostgreSQL·MSSQL·SQLite) inline SQL / 쿼리 텍스트 분석. SampleErp 환경에서는 procedure/function 분석은 /analyze-plsql 을 사용하고, 본 스킬은 C# 코드 안의 inline SqlCommand 또는 별도 쿼리 텍스트 모음 분석에만 사용한다. 부산 시절의 query-cache 의존이 제거된 단순 분석 모드만 지원."
---

# SQL 쿼리 분석 (SampleErp / 레거시 DB)

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

SampleErp 환경에서 SQL 쿼리 분석의 진입점은 다음과 같이 구분된다:

1. **Stored Procedure / Function 분석** → `/analyze-plsql {NAME}` 사용 (정적 파일 `docs/external/SampleErp/procedures/` / `functions/` 직접 Read)
2. **C# inline SQL 추출** → analyze-service Phase 2 의 일부로 자동 처리
3. **개별 쿼리 텍스트 분석** → 본 스킬 (간단한 1회성 분석)

> 쿼리 텍스트의 방언은 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3-1 순서(README `원천 DBMS:` 줄 → 쿼리 문법 단서 → 사용자 확인)로 판정하고, 이후 파라미터·함수·페이징 해석은 그 방언 열을 따른다. 짧은 쿼리는 단서가 부족하므로 README 표기를 우선한다.

> 부산 시절의 `query-cache` (Oracle 캐시 + L2 cache + orchestrator) 의존성은 SampleErp 환경에서 제거되었다. SampleErp 의 모든 SQL 본문은 정적 파일이므로 캐시가 필요하지 않다.

## 사용법

### 단일/복수 쿼리 텍스트 분석

```
/analyze-queries
  쿼리1: SELECT * FROM TB_XXX WHERE COL = :p      (바인드 표기는 원천 DBMS 따라 :p / $1 / @p / ?)
  쿼리2: UPDATE TB_YYY SET ... WHERE ...
```

### 파일 안의 쿼리 일괄 분석 (있을 시)

```
/analyze-queries --file path/to/queries.sql
```

## 실행 알고리즘

### Step 1: 입력 파싱

- 인자로 받은 SQL 텍스트 또는 파일 경로 처리
- 파일이면 Read, 인라인 텍스트면 그대로 분석 대상으로 사용

### Step 2: 쿼리 분류 및 분석

각 쿼리에 대해:

1. **queryType 분류**: 첫 키워드로 판단 (SELECT, INSERT, UPDATE, DELETE, MERGE, 그리고 호출문 — Oracle `BEGIN PKG.PROC(...); END;`·`CALL` / PostgreSQL `CALL`·`SELECT f(...)` / MSSQL `EXEC`)
2. **tables 추출**: FROM, JOIN, INTO, UPDATE, MERGE INTO 절에서 테이블명과 별칭 추출
3. **columns 추출**: SELECT 절 컬럼, INSERT 컬럼, UPDATE SET 절 컬럼 추출
4. **joins 추출**: JOIN 절 또는 WHERE 절의 조인 조건 추출
5. **parameters 추출**: 판정 방언의 바인드 변수 추출 — Oracle `:name` · PostgreSQL `$1` · MSSQL `@name` · SQLite `?`/`:name`/`@name`/`$name`
6. **businessPurpose**: 테이블명, 컬럼명, 조건을 기반으로 비즈니스 목적 추론 (한글)
7. **queryLogic**: 주요 조건, 정렬, 집계, 서브쿼리 등 로직 요약
8. **performanceInfo**: 조인 수, 서브쿼리 깊이, UNION 등으로 복잡도 판단
9. **테이블 정의 보강**: 발견된 테이블에 대해 `docs/external/SampleErp/tables/{테이블명}.sql` 정적 파일 Read 시도. 발견 시 정확한 컬럼 정의 사용.

### Step 3: 결과 출력

분석 결과를 마크다운으로 출력.

**출력 경로 (V3 표준 — 다른 스킬과 결 통일):**

- **화면 컨텍스트 안에서 호출된 경우** (analyze-service 흐름 또는 사용자가 SCREEN-ID 와 함께 호출):

  ```
  docs/external/SampleErp/orgErpReport/{moduleId}/.cache/{SCREEN-ID}/inline_queries.md
  ```

  - 예: `docs/external/SampleErp/orgErpReport/QMA/.cache/QMA010K/inline_queries.md`
  - `.cache/` 하위 저장으로 사용자 시야에서 은닉 (다른 화면 분석 산출물과 동일한 응집도)
  - 본 분석 결과는 `screens/{SCREEN-ID}.md` 의 §A3 (Appendix · inline SQL 쿼리) 에 인라인 인용된다

- **화면 컨텍스트가 아닌 단독 1회성 호출**: 파일 산출 없이 응답으로만 반환

> V2 → V3 변경: `{SCREEN-ID}/_inline_queries.md` (화면 폴더 내 부속 자료, `_` prefix) → `.cache/{SCREEN-ID}/inline_queries.md` (화면 캐시 격리). 사용자가 화면 단위로 보는 PRIMARY MD 는 `screens/{SCREEN-ID}.md` 하나로 통합되어 inline SQL 도 그 안의 §A3 로 통합된다.

```markdown
## 쿼리 1: SELECT
- 비즈니스 목적: ...
- 테이블: TB_XXX (메인)
- 파라미터: :p1, :p2 (원천 DBMS 표기 그대로)
- 원천 DBMS: X (판정 근거)
- ...
```

## 실행 정책

- **DB 미접속**: SampleErp 는 정적 파일 dump 만 다룬다
- **query-cache 미사용**: 부산 시절 의존성 제거됨
- **단순 분석 모드**: 캐시/배치/재시도 등 부산 시절 복잡도 제거. 1회성 분석만 수행
- **팀원 spawn 절대 금지**: 직접 실행

## 참고

- procedure/function 분석은 `/analyze-plsql {NAME}` 사용
- C# inline SQL 자동 추출은 analyze-service Phase 2 에서 수행
- 본 스킬은 임시 쿼리 텍스트 분석에만 사용
- 본문 어휘 매핑: [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3 (원천 DBMS 판정 후 바인드 변수·호출 구문·페이징 등 방언 열)
