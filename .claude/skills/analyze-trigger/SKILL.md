---
name: analyze-trigger
description: "레거시 DB(Oracle·PostgreSQL·MSSQL·SQLite) 트리거 심층 분석. DDL 본문에서 발동 조건 (INSERT/UPDATE/DELETE, BEFORE/AFTER/INSTEAD OF, 행/문장 단위), 부수 적재 (:NEW/:OLD · NEW/OLD · inserted/deleted 행 참조), 부수 조회 (세션 정보 등 시스템 메타), 명명 혼동/사이드이펙트를 추출하고 트리거가 갖는 책임을 명확히 한다. SampleErp 정적 DDL 파일 `docs/external/SampleErp/triggers/{TRIGGER}.sql` 직접 읽기. 사용 시점: /analyze-trigger TRIGGER-NAME 호출 시. 예: /analyze-trigger DELETE_{TABLE}_HISTORY"
---

# 레거시 DB 트리거 심층 분석

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/DBMS/triggers/...`). 본문에 `{moduleId}/` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.

SampleErp 의 레거시 DB 트리거 정적 DDL 파일을 원천 DBMS(Oracle · PostgreSQL · MSSQL · SQLite) 판정 후 그 방언으로 심층 분석하여 발동 조건, 부수 적재 흐름, 컬럼 매칭, 사이드이펙트를 추출하고 종합 분석 보고서를 생성한다.

> 본 스킬은 generate-bpa §9 / generate-legacy §4 의 **트리거 사이드이펙트 박스** 가 인용하는 기반 산출물을 만드는 단계다.

## 매개변수

- `TRIGGER-NAME`: 트리거명 (예: `DELETE_{TABLE}_HISTORY` 패턴)
  - 스키마 prefix 불필요

## 입력 정적 파일

| 자료 | 경로 |
|---|---|
| **트리거 DDL** | `docs/external/SampleErp/triggers/{TRIGGER}.sql` |
| **트리거 함수 (PostgreSQL)** | `docs/external/SampleErp/functions/{fn}.sql` — 트리거 DDL 의 `EXECUTE FUNCTION {fn}()` 대상. 같은 파일에 함께 있으면 생략 |
| **대상 테이블 DDL (보강)** | `docs/external/SampleErp/tables/{대상테이블}.sql` |
| **적재 대상 테이블 DDL (보강)** | `docs/external/SampleErp/tables/{적재테이블}.sql` |

## 출력 (V2 표준)

```
docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/triggers/{TRIGGER}_analysis.md
```

`moduleId` 는 대상 테이블이 속한 모듈로 결정. 대상 테이블의 schema 분석 보고서 (`tables/{TABLE}_schema_analysis.md`) 가 이미 있으면 그 위치의 모듈 그대로.

## 실행 절차

### Step 1: DDL Read + 원천 DBMS 판정

`docs/external/SampleErp/triggers/{TRIGGER}.sql` Read. 미존재 시 즉시 종료.

원천 DBMS 는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3-1 순서(README `원천 DBMS:` 줄 → DDL 문법 단서 → 사용자 확인)로 판정한다. 트리거 단서: Oracle `CREATE OR REPLACE TRIGGER ... FOR EACH ROW` + `:NEW`/`:OLD` · PostgreSQL `EXECUTE FUNCTION|PROCEDURE fn()` + `RETURNS TRIGGER` · MSSQL `inserted`/`deleted` + `[dbo].` · SQLite `NEW.`/`OLD.` + `RAISE(ABORT`.

**PostgreSQL 이면** 트리거 DDL 은 발동 조건만 담고 본문은 트리거 함수에 있다. `EXECUTE FUNCTION|PROCEDURE {fn}()` 의 `{fn}` 으로 `functions/{fn}.sql` 을 읽어 Step 3 이후의 분석 대상으로 삼는다. 함수 파일이 없으면 "트리거 함수 본문 미제공" 으로 표기하고 Step 3~5 를 생략한다.

### Step 2: 트리거 헤더 분석

판정 방언의 헤더 형태로 읽는다.

```sql
-- Oracle
CREATE OR REPLACE TRIGGER {TRIGGER}
{BEFORE | AFTER | INSTEAD OF} {INSERT | UPDATE [OF col] | DELETE} [OR ...] ON {TABLE}
[REFERENCING ...] [FOR EACH ROW] [WHEN (조건)]
BEGIN ... END;

-- PostgreSQL (본문은 트리거 함수)
CREATE TRIGGER {TRIGGER}
{BEFORE | AFTER | INSTEAD OF} {INSERT | UPDATE [OF col] | DELETE} [OR ...] ON {TABLE}
[REFERENCING NEW TABLE AS ... OLD TABLE AS ...] FOR EACH {ROW | STATEMENT} [WHEN (조건)]
EXECUTE FUNCTION {fn}();

-- MSSQL
CREATE [OR ALTER] TRIGGER [dbo].[{TRIGGER}] ON dbo.{TABLE}
[WITH ...]
{FOR | AFTER | INSTEAD OF} {INSERT, UPDATE, DELETE}
AS ...

-- SQLite
CREATE TRIGGER {TRIGGER} {BEFORE | AFTER | INSTEAD OF} {INSERT | UPDATE [OF col] | DELETE} ON {TABLE}
[FOR EACH ROW] [WHEN 조건] BEGIN ... END;
```

추출:
- 트리거 종류 (DML / DDL — Oracle `ON SCHEMA`/`ON DATABASE`, PostgreSQL `EVENT TRIGGER`, MSSQL `ON DATABASE` 는 DDL 트리거)
- 발동 시점 (BEFORE/AFTER/INSTEAD OF — MSSQL 은 BEFORE 가 없고 `FOR` = AFTER 가 기본, `INSTEAD OF` 는 Oracle·SQLite 에서 뷰 전용)
- 발동 단위 (행 단위 `FOR EACH ROW` / 문장 단위 — MSSQL 은 항상 문장 단위라 여러 행이 `inserted`/`deleted` 에 한꺼번에 들어온다, SQLite 는 항상 행 단위)
- 발동 이벤트 (INSERT/UPDATE/DELETE 중 하나 이상, `UPDATE OF col` 컬럼 한정 여부)
- 대상 테이블
- 세션 옵션·조건 (MSSQL `xact_abort`, Oracle·PostgreSQL·SQLite `WHEN` 조건)

### Step 3: 본문 흐름 분석

본문을 단계별로 분해:

1. **시스템 메타 조회** — 호출 컨텍스트 정보 수집 (Oracle `SYS_CONTEXT('USERENV', ...)`·`V$SESSION` / PostgreSQL `current_user`·`inet_client_addr()` / MSSQL `SYS.dm_exec_connections`·`master..sysprocesses`·`@@SPID`)
2. **행 참조 활용** — 트리거가 어느 쪽 행을 쓰는지 (Oracle `:NEW`/`:OLD` · PostgreSQL `NEW`/`OLD`·`TG_OP` · MSSQL 가상 테이블 `inserted`/`deleted` · SQLite `NEW`/`OLD`). 이벤트 분기는 Oracle `INSERTING`/`UPDATING`/`DELETING`, PostgreSQL `TG_OP`, MSSQL 두 가상 테이블의 행 존재 여부로 판단
3. **부수 적재** — 행 단위 `INSERT INTO {적재테이블} VALUES (:OLD.col, ...)`·`(OLD.col, ...)` 또는 문장 단위 `INSERT INTO {적재테이블} SELECT ... FROM inserted/deleted`
4. **부수 갱신** — `UPDATE {다른테이블} SET ... WHERE ...`
5. **부수 삭제** — `DELETE FROM {다른테이블} WHERE ...`

### Step 4: 컬럼 매칭 분석

부수 적재의 SELECT 절이 본 테이블의 어떤 컬럼을 적재 테이블의 어떤 컬럼에 매핑하는지 매트릭스로 작성:

| 대상 테이블 컬럼 | 적재 테이블 컬럼 | 비고 |
|---|---|---|
| `CoCd` | `CoCd` | 1:1 |
| `INSP_REQ_NO` | `INSP_REQ_NO` | 1:1 |
| (계산값) | `처리자_PC명` | `'검사전표 삭제 처리자 : ' + @PC_NAME` |
| (계산값) | `삭제시각` | 현재 시각 함수 (`SYSDATE` / `now()` / `GETDATE()`) |

### Step 5: 미적재 컬럼 식별

대상 테이블 schema 분석 (Step 4 의 본 테이블 컬럼 카탈로그) 과 비교하여, **트리거가 적재하지 않는 컬럼** 식별. 트리거 작성 이후 추가된 신규 컬럼은 미적재로 남아 잠재적 무결성 위험.

```markdown
> ⚠️ **미적재 컬럼**: 본 트리거 작성 이후 추가된 다음 컬럼들은 적재 테이블에 보존되지 않는다:
>
> - `TempSaveDt` (임시저장일자)
> - `FAI_YN` (FAI 여부)
> - `FAI_CHK_ID` (FAI 확인자)
> - ...
```

### Step 6: 명명 혼동 / 안티패턴 식별

- 트리거명 vs 적재 테이블명의 혼동 (예: `DELETE_FOO_HISTORY` 트리거가 `FOO_HIST` 가 아닌 `FOO_DELETE_HISTORY` 에 적재) — 명명 유사성 함정 주의
- INSERT 절에 컬럼 목록 미기재 → 컬럼 순서 변경 시 무결성 위험
- 예외 처리 부재 → 부수 적재 실패 시 본 DML 도 함께 롤백되어 본 화면 처리 실패 가능
- (MSSQL) `inserted`/`deleted` 를 단일 행으로 가정한 변수 대입(`SELECT @v = col FROM inserted`) → 다중 행 DML 에서 일부만 처리
- (Oracle) 행 트리거에서 대상 테이블 재조회 → mutating table 오류(ORA-04091) 위험
- (PostgreSQL) BEFORE 행 트리거 함수가 `RETURN NULL` → 본 DML 이 조용히 취소됨

### Step 7: 보고서 구조

```markdown
# {TRIGGER} — Trigger 분석

| 항목 | 내용 |
|---|---|
| 원천 DBMS | {Oracle \| PostgreSQL \| MSSQL \| SQLite} (판정 근거) |
| 트리거 ID | {schema}.{TRIGGER} |
| 종류 | DML AFTER DELETE (또는 BEFORE / INSTEAD OF 등) · 행 단위 / 문장 단위 |
| 대상 테이블 | {schema}.{TABLE} |
| 적재 대상 | {schema}.{적재테이블} |
| 원본 본문 | `docs/external/SampleErp/triggers/{TRIGGER}.sql` (PostgreSQL 이면 트리거 함수 `functions/{fn}.sql` 도 함께) |
| 분석 일시 | ... |
| 문서 버전 | 1.0 |

## 1. 개요 (1~2 문단 — 트리거가 무엇을 audit / 무엇을 부수 적재하는가)

## 2. 트리거 본문 (전체 또는 핵심 발췌)

## 3. 본문 흐름 분석 (단계별)

## 4. 컬럼 매칭 매트릭스

## 5. 미적재 컬럼 (있는 경우)

## 6. 명명 혼동 / 안티패턴 / 사이드이펙트

## 7. 신규 시스템 마이그레이션 고려사항 (선택)

## 8. 외부 참조 (인용 화면 / 인용 PG / 적재 테이블 schema 분석)
```

## 참조 사례

POC 산출물 (V2 표준):
- 표준 위치: `docs/external/SampleErp/orgErpReport/{MODULE-ID}/DBMS/triggers/{TRIGGER}_analysis.md`

## 실행 정책

- **DB 미접속**: SampleErp 는 정적 DDL dump 만 다룬다.
- **팀원 spawn 절대 금지**: 직접 실행.
- **재생성**: 동일 트리거에 대한 보고서가 이미 존재하면 사용자에게 재분석 확인.

## 어휘 매핑

본문 어휘는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) §3 에서 판정된 원천 DBMS 의 방언 열(특히 "트리거 정의"·"트리거 행 참조" 행)을 적용.
