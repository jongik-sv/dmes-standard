---
name: analyze-table-schema
description: "레거시 DB(Oracle·PostgreSQL·MSSQL·SQLite) 테이블 schema 심층 분석. DDL 본문에서 컬럼 카탈로그, FK, 인덱스, CHECK 제약을 추출하고, 본 테이블에 매칭되는 트리거 / 본 테이블을 노출하는 뷰 / 본 테이블을 read/write 하는 procedure 의 lineage 를 종합한다. SampleErp 정적 DDL 파일 `docs/external/SampleErp/tables/{TABLE}.sql` 을 직접 읽어 분석. 사용 시점: /analyze-table-schema TABLE-NAME 호출 시, 모듈 DBMS 자산 베이스라인 / 화면 §4 데이터 요구사항 보강이 필요할 때. 예: /analyze-table-schema B_ITEM_INFO"
---

# 레거시 DB 테이블 Schema 통합 분석

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/DBMS/tables/...`). 본문에 `{moduleId}/` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.
>
> 예: `Q_INSPECTION_REQUEST` (QMA 의존) → `품질/QMA/DBMS/tables/Q_INSPECTION_REQUEST_schema_analysis.md`. cross-module 테이블은 `_shared/DBMS/tables/` (root, 영역 prefix 없음).

SampleErp 의 레거시 DB 테이블 정적 DDL 파일을 원천 DBMS(Oracle · PostgreSQL · MSSQL · SQLite) 판정 후 그 방언으로 심층 분석하여 컬럼 카탈로그 / FK / 인덱스 / CHECK 제약 / 트리거 매칭 / 뷰 매핑 / procedure 별 컬럼 lineage 를 추출하고 종합 schema 분석 보고서를 생성한다.

> 본 스킬은 generate-bpa §5/§9, generate-legacy §4, generate-process-group §4 의 **schema 통합** 단계가 인용하는 기반 산출물을 만드는 단계다. 화면/PG 분석 보고서 작성 전에 의존 테이블에 대해 본 스킬을 먼저 실행하는 것이 권장된다.

## 매개변수

- `TABLE-NAME`: 테이블명 (예: `B_ITEM_INFO`, `P_WORK_ORDER`)
  - 스키마 prefix 불필요 (기본 스키마 — Oracle 소유 스키마 · PostgreSQL `public` · MSSQL `dbo`)

## 입력 정적 파일

| 자료 | 경로 |
|---|---|
| **테이블 DDL** | `docs/external/SampleErp/tables/{TABLE}.sql` |
| **트리거 DDL (보강)** | `docs/external/SampleErp/triggers/*.sql` (본 테이블 매칭) |
| **뷰 DDL (보강)** | `docs/external/SampleErp/views/*.sql` (FROM 절에 본 테이블 포함) |
| **procedure DDL (보강)** | `docs/external/SampleErp/procedures/*.sql` (read/write lineage) |

## 출력 (V2 표준)

```
docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/tables/{TABLE}_schema_analysis.md
```

`moduleId` 가 불명확하거나 cross-module 공유 테이블은 `_shared/DBMS/tables/{TABLE}_schema_analysis.md` (현재는 미사용 — 본 스킬 적용 모듈에 따라 단일 위치).

## 실행 절차

### Step 1: DDL Read + 원천 DBMS 판정

`docs/external/SampleErp/tables/{TABLE}.sql` Read. 미존재 시 즉시 종료 ("SampleErp 에 {TABLE} DDL 이 없습니다").

원천 DBMS 는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3-1 순서(README `원천 DBMS:` 줄 → DDL 문법 단서 → 사용자 확인)로 판정한다. DDL 단서: Oracle `VARCHAR2`·`NUMBER(`·`TABLESPACE` · PostgreSQL `SERIAL`·`text`·`timestamptz`·`::` · MSSQL `NVARCHAR`·`IDENTITY(`·`[dbo].`·`GO` · SQLite `AUTOINCREMENT`·`INTEGER PRIMARY KEY`·`WITHOUT ROWID`.

### Step 2: 컬럼 카탈로그 추출

CREATE TABLE 본문에서 각 컬럼 다음 항목을 추출:

- 컬럼명
- 타입 (방언 타입 그대로 — Oracle `VARCHAR2(N)`·`NUMBER(p,s)`·`DATE` / PostgreSQL `varchar(N)`·`numeric(p,s)`·`timestamp` / MSSQL `nvarchar(N)`·`numeric(p,s)`·`datetime` / SQLite 선언 타입은 affinity 라 제약으로 단정하지 않음)
- NULL/NOT NULL
- DEFAULT
- 자동 증가 (있을 시 — Oracle 시퀀스·`GENERATED ... AS IDENTITY` / PostgreSQL `SERIAL`·`GENERATED ... AS IDENTITY` / MSSQL `IDENTITY` / SQLite `INTEGER PRIMARY KEY [AUTOINCREMENT]`)
- CHECK 제약 (컬럼 단위)
- 코멘트/주석 (있을 시 — `--`, `/* */` 본문, Oracle·PostgreSQL `COMMENT ON COLUMN`, MSSQL `sp_addextendedproperty 'MS_Description'`)

본문 길이가 길면 다음 4개 분류로 본문을 나누어 표시 (가독성):

- 2-1. 키 / 정체성 (PK + NOT NULL)
- 2-2. 비즈니스 본문 컬럼
- 2-3. 외부 연계 컬럼 (FK 후보)
- 2-4. 감사 / 타임스탬프 컬럼

### Step 3: 제약 추출

- **PK**: CREATE TABLE 의 PRIMARY KEY 절 또는 ALTER TABLE 의 ADD CONSTRAINT
- **FK**: REFERENCES 절 → 부모 테이블·컬럼·CASCADE 정책
- **CHECK (테이블 단위)**: 도메인 규칙 후보
- **UNIQUE**: 자연 키

### Step 4: 인덱스 추출

`CREATE [UNIQUE] INDEX` 구문 발췌 (MSSQL 은 `CLUSTERED|NONCLUSTERED`, PostgreSQL 은 `USING btree|gin|...`·부분 인덱스 `WHERE`, Oracle 은 함수 기반 인덱스·`BITMAP` 도 표시). 본 화면이 SELECT WHERE 절에서 활용 가능한 인덱스를 식별.

### Step 5: 트리거 매칭

Glob 으로 `docs/external/SampleErp/triggers/*.sql` 전수 탐색. 각 트리거 DDL 의 `ON [{schema}.]{TABLE}` 패턴(스키마 접두 `dbo.`·`public.`·`OWNER.` 와 인용 `[X]`·`"X"`·무인용 모두 허용)으로 본 테이블에 attach 된 트리거 확인. PostgreSQL 은 트리거 DDL 의 `EXECUTE FUNCTION|PROCEDURE {fn}()` 를 따라 `functions/{fn}.sql`(트리거 함수) 본문까지 읽어야 부수 적재를 알 수 있다.

매칭 결과:
- 트리거명, 발동 시점 (BEFORE/AFTER/INSTEAD OF), 발동 이벤트 (INSERT/UPDATE/DELETE)
- 부수 적재 결과 (어떤 테이블에 어떤 데이터를 어떻게 적재하는지)
- 컬럼 매칭 분석: 본 테이블의 컬럼 → 부수 테이블의 컬럼 매핑

상세 분석은 `/analyze-trigger` 의 보고서로 위임. 본 스킬은 매칭 + 요약만.

### Step 6: 뷰 매핑

Glob 으로 `docs/external/SampleErp/views/*.sql` 전수 탐색. 각 뷰 DDL 의 FROM/JOIN 절에 본 테이블이 포함되는지 확인.

매칭 결과:
- 뷰명, 본 테이블에서 어떤 컬럼을 노출하는지, JOIN 관계

상세 분석은 `/analyze-view` 의 보고서로 위임. 본 스킬은 매칭 + 요약만.

### Step 7: Procedure 별 컬럼 lineage

`docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/procedures/*.md` (분석 완료된 procedure 보고서) 를 Glob 으로 탐색. 본 테이블을 read/write 하는 procedure 의 case 별 컬럼 매트릭스 작성:

| Procedure.Case | INSERT 컬럼 | UPDATE 컬럼 | SELECT 컬럼 | DELETE |
|---|---|---|---|---|
| `{ProcA}.uMain` | — | `STATUS, REMARK, UPDATE_DT, ...` | `STATUS` | — |
| `{ProcB}.uAttach` | — | `AttachNo` | — | — |
| ... | | | | |

procedure 분석 보고서가 미존재하면 본 lineage 절은 "분석 미완료" 로 표시.

### Step 8: CHECK 제약 → BR-DDL-XX 추출

§3 의 CHECK 제약과 §2 의 컬럼 코멘트에서 도메인 규칙 후보를 추출하여 `BR-DDL-{TABLE-prefix}-NN` 으로 번호 부여:

```markdown
## 10. BR-DDL 규칙 추출

| BR-ID | 적용 컬럼 | 도메인 | 강제 위치 | 비고 |
|---|---|---|---|---|
| BR-DDL-{prefix}-01 | {STATUS_COL} | {허용 값 집합} | 응용 (DDL CHECK 부재) | {proc.case} |
| BR-DDL-{prefix}-02 | {DECISION_COL} | {허용 값 집합} | 응용 | {proc.case} |
```

### Step 9: 보고서 구조

```markdown
# {TABLE} — Schema 통합 분석

| 항목 | 내용 |
|---|---|
| 원천 DBMS | {Oracle \| PostgreSQL \| MSSQL \| SQLite} (판정 근거) |
| 테이블 ID | {schema}.{TABLE} |
| 한글명 | ... |
| 분류 | ... |
| 원본 DDL | `docs/external/SampleErp/tables/{TABLE}.sql` |
| 분석 일시 | ... |
| 분석 도구 | 수기 분석 (DDL 정규식 + procedure cross-ref) |
| 문서 버전 | 1.0 |

## 1. 개요 (2~3 문단)

## 2. 컬럼 카탈로그 (분류별 4표)

## 3. 제약 (PK / FK / CHECK / UNIQUE)

## 4. 인덱스

## 5. 트리거 매칭 (있는 경우)

## 6. 뷰 매핑 (있는 경우)

## 7. 자식 테이블 (있는 경우 — FK 역방향)

## 8. 외부 참조 (procedure / 화면 / 분석 문서)

## 9. 컬럼 lineage — read/write 추적

## 10. BR-DDL 규칙 추출
```

§9 의 anchor 는 `#9-컬럼-lineage--readwrite-추적` 으로 화면 BPA / legacy / PG 보고서가 인용한다.

## 참조 사례

POC 산출물 (V2 표준):
- 표준 위치: `docs/external/SampleErp/orgErpReport/{MODULE-ID}/DBMS/tables/{TABLE}_schema_analysis.md`
- cross-module 테이블: `docs/external/SampleErp/orgErpReport/_shared/DBMS/tables/{TABLE}_schema_analysis.md`

## 실행 정책

- **DB 미접속**: SampleErp 는 정적 DDL dump 만 다룬다. Read 도구로 본문 가져오기.
- **팀원 spawn 절대 금지**: 직접 실행.
- **재생성**: 동일 테이블에 대한 보고서가 이미 존재하면 사용자에게 재분석 확인. 재분석 거부 시 기존 경로 안내 후 종료.
- **procedure lineage 의존성**: §9 컬럼 lineage 의 정확도는 해당 모듈의 procedure 분석 완료도에 비례. procedure 분석이 부족하면 lineage 표를 "분석 미완료 - /analyze-plsql 실행 권장" 표기.

## 어휘 매핑

본문 어휘는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3 에서 판정된 원천 DBMS 의 방언 열을 적용.
