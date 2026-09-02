---
name: analyze-view
description: "MSSQL 뷰 심층 분석. SELECT 본문 / JOIN 구조 / CTE 구조 / 노출 컬럼 ↔ 원본 테이블 lineage 를 추출하고, 하드코딩 가정 (PlantCd, CoCd 등) 과 BI 활용 패턴을 식별한다. SampleErp 정적 DDL 파일 `docs/external/SampleErp/views/{VIEW}.sql` 직접 읽기. 사용 시점: /analyze-view VIEW-NAME 호출 시. 예: /analyze-view BI_*_VIEW"
---

# MSSQL 뷰 심층 분석

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/DBMS/views/...`). 본문에 `{moduleId}/` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.

SampleErp 의 MSSQL 뷰 정적 DDL 파일을 심층 분석하여 SELECT 본문 구조, JOIN 분석, CTE 분석, 노출 컬럼 lineage 를 추출하고 종합 분석 보고서를 생성한다.

> 본 스킬은 generate-legacy §4 (조회 lineage) 및 모듈 DB 자산 베이스라인 작성 시 인용할 기반 산출물을 만드는 단계다. BI 리포트 / 외부 리포트 시스템과 본 ERP 의 접점을 분석할 때 핵심.

## 매개변수

- `VIEW-NAME`: 뷰명 (예: `BI_*_VIEW`, CamelCase 단순 뷰)
  - 스키마 prefix 불필요

## 입력 정적 파일

| 자료 | 경로 |
|---|---|
| **뷰 DDL** | `docs/external/SampleErp/views/{VIEW}.sql` |
| **참조 테이블 DDL (보강)** | `docs/external/SampleErp/tables/{원본테이블}.sql` |
| **참조 뷰 DDL (재귀 보강)** | `docs/external/SampleErp/views/{원본뷰}.sql` (뷰가 다른 뷰를 참조하는 경우) |

## 출력 (V2 표준)

```
docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/views/{VIEW}_analysis.md
```

`moduleId` 는 뷰명 prefix 또는 주요 원본 테이블의 소속 모듈로 결정.

## 실행 절차

### Step 1: DDL Read

`docs/external/SampleErp/views/{VIEW}.sql` Read. 미존재 시 즉시 종료.

### Step 2: 뷰 헤더 분석

```sql
CREATE [OR ALTER] VIEW [dbo].[{VIEW}]
[WITH ...]
AS
SELECT ... FROM ...
```

추출:
- 뷰 옵션 (`WITH SCHEMABINDING`, `WITH ENCRYPTION` 등)
- updatable view 여부 (단일 테이블 + 직선 매핑) 판단

### Step 3: CTE 추출 (있는 경우)

`WITH {CTE명} AS ( SELECT ... )` 본문 분석:
- CTE 명, 목적, 컬럼 정의
- CTE 내부 집계/계산 패턴 (예: `DATEDIFF(MINUTE, ...)`, `CONVERT`, `MAX(COALESCE(...))`)
- 재귀 CTE 인 경우 명시

### Step 4: FROM / JOIN 분석

SELECT 본문의 FROM/JOIN 절을 표 형태로 분해:

| 별칭 | 테이블/뷰 | JOIN 종류 | JOIN 조건 | 비고 |
|---|---|---|---|---|
| a | {TABLE_A} | (메인) | — | 메인 테이블 |
| b | {TABLE_B} | LEFT JOIN | `a.PK1 = b.PK1 AND a.PK2 = b.PK2` | 보조 |
| c | {TABLE_C} | LEFT JOIN | 동상 | 보조 |

### Step 5: 노출 컬럼 lineage

SELECT 절의 각 컬럼이 어느 원본 테이블 / CTE 에서 유래하는지 매트릭스:

| 노출 컬럼 | 원본 | 변환 | 비고 |
|---|---|---|---|
| `INSP_REQ_NO` | `a.INSP_REQ_NO` | 그대로 | PK |
| `STATUS_NAME` | (스칼라 서브쿼리) `dbo.fnGetCommName('Q030', c.STATUS, '4000')` | 코드값→의미명 | 하드코딩 `'4000'` |
| `QELT` | (CTE TimeCalc) | `DATEDIFF(MINUTE, ...) * 1.0 / 60` | hour 단위 |

### Step 6: 하드코딩 / 가정 식별

뷰 본문에서 발견되는 하드코딩 식별:

- `WHERE PlantCd = 'SAMPLE'` — 단일 공장 가정
- 코드값 룩업의 `CoCd = '4000'` — 단일 법인 가정
- 매직 넘버 / 매직 문자열

### Step 7: 함수 의존성

`dbo.{함수}()` 호출을 식별하고 각 함수의 역할 (스칼라 / 인라인 TVF / 멀티문 TVF) 분석. 함수가 모듈 DBMS 의 procedure 분석에 등록된 경우 링크.

### Step 8: 보고서 구조

```markdown
# {VIEW} — View 분석

| 항목 | 내용 |
|---|---|
| 뷰 ID | dbo.{VIEW} |
| 분류 | BI 종합 뷰 / 조회 단순 뷰 / 마스터 룩업 뷰 등 |
| 원본 본문 | `docs/external/SampleErp/views/{VIEW}.sql` |
| 분석 일시 | ... |
| 문서 버전 | 1.0 |

## 1. 개요 (뷰의 비즈니스 목적, BI 활용 맥락)

## 2. 뷰 본문 구조

### 2-1. CTE (있는 경우)

### 2-2. 메인 SELECT

## 3. FROM / JOIN 분석

## 4. 노출 컬럼 lineage

## 5. 하드코딩 / 가정

## 6. 함수 의존성

## 7. 외부 참조 (인용 화면 / 원본 테이블 schema 분석 / BI 리포트)

## 8. 신규 시스템 마이그레이션 고려사항 (선택 — 하드코딩 가정의 다공장 대응 등)
```

## 참조 사례

POC 산출물 (V2 표준):
- 표준 위치: `docs/external/SampleErp/orgErpReport/{MODULE-ID}/DBMS/views/{VIEW}_analysis.md`
- BI 뷰 (CTE + 멀티 JOIN) vs 단순 JOIN 뷰의 패턴 분석은 본문 §2 (CTE 분석), §3 (JOIN 분해) 참조

## 실행 정책

- **DB 미접속**: SampleErp 는 정적 DDL dump 만 다룬다.
- **팀원 spawn 절대 금지**: 직접 실행.
- **재생성**: 동일 뷰에 대한 보고서가 이미 존재하면 사용자에게 재분석 확인.

## 어휘 매핑

본문 어휘는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 의 PL/SQL → T-SQL 매핑 적용.
