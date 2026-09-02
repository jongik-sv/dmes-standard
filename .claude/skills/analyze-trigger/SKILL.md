---
name: analyze-trigger
description: "MSSQL 트리거 심층 분석. DDL 본문에서 발동 조건 (INSERT/UPDATE/DELETE, BEFORE/AFTER/INSTEAD OF), 부수 적재 (INSERT INTO ... SELECT FROM deleted/inserted), 부수 조회 (`SYS.dm_exec_connections` 등 시스템 메타), 명명 혼동/사이드이펙트를 추출하고 트리거가 갖는 책임을 명확히 한다. SampleErp 정적 DDL 파일 `docs/external/SampleErp/triggers/{TRIGGER}.sql` 직접 읽기. 사용 시점: /analyze-trigger TRIGGER-NAME 호출 시. 예: /analyze-trigger DELETE_{TABLE}_HISTORY"
---

# MSSQL 트리거 심층 분석

> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조 (필수)**
>
> 본 스킬의 모든 산출 경로는 V4 부터 **`{areaId}/{moduleId}/...`** 로 해석 (root: `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/DBMS/triggers/...`). 본문에 `{moduleId}/` 로 적힌 경로는 자동으로 영역 prefix.
>
> **영역 매핑** (PLUGIN_USAGE.md §1.2.1 정본):
> - **품질**: QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA
> - **물류**: SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM
> - **조업**: PMA · (향후 PCA · PFA · PGA · MAA · MCM · BOA · BOP)
> - 신규 모듈은 사용자에게 영역 결정 요청.

SampleErp 의 MSSQL 트리거 정적 DDL 파일을 심층 분석하여 발동 조건, 부수 적재 흐름, 컬럼 매칭, 사이드이펙트를 추출하고 종합 분석 보고서를 생성한다.

> 본 스킬은 generate-bpa §9 / generate-legacy §4 의 **트리거 사이드이펙트 박스** 가 인용하는 기반 산출물을 만드는 단계다.

## 매개변수

- `TRIGGER-NAME`: 트리거명 (예: `DELETE_{TABLE}_HISTORY` 패턴)
  - 스키마 prefix 불필요

## 입력 정적 파일

| 자료 | 경로 |
|---|---|
| **트리거 DDL** | `docs/external/SampleErp/triggers/{TRIGGER}.sql` |
| **대상 테이블 DDL (보강)** | `docs/external/SampleErp/tables/{대상테이블}.sql` |
| **적재 대상 테이블 DDL (보강)** | `docs/external/SampleErp/tables/{적재테이블}.sql` |

## 출력 (V2 표준)

```
docs/external/SampleErp/orgErpReport/{moduleId}/DBMS/triggers/{TRIGGER}_analysis.md
```

`moduleId` 는 대상 테이블이 속한 모듈로 결정. 대상 테이블의 schema 분석 보고서 (`tables/{TABLE}_schema_analysis.md`) 가 이미 있으면 그 위치의 모듈 그대로.

## 실행 절차

### Step 1: DDL Read

`docs/external/SampleErp/triggers/{TRIGGER}.sql` Read. 미존재 시 즉시 종료.

### Step 2: 트리거 헤더 분석

```sql
CREATE [OR ALTER] TRIGGER [dbo].[{TRIGGER}] ON dbo.{TABLE}
[WITH ...]
{FOR | AFTER | INSTEAD OF} {INSERT, UPDATE, DELETE}
AS ...
```

추출:
- 트리거 종류 (DML / DDL)
- 발동 시점 (BEFORE/AFTER/INSTEAD OF — MSSQL 의 경우 AFTER 가 기본)
- 발동 이벤트 (INSERT/UPDATE/DELETE 중 하나 이상)
- 대상 테이블
- `xact_abort` 등 세션 옵션

### Step 3: 본문 흐름 분석

본문을 단계별로 분해:

1. **시스템 메타 조회** — `SYS.dm_exec_connections`, `master..sysprocesses`, `@@SPID` 등으로 호출 컨텍스트 정보 수집
2. **inserted / deleted 테이블 활용** — 트리거가 어느 가상 테이블을 활용하는지
3. **부수 적재** — `INSERT INTO {적재테이블} SELECT ... FROM inserted/deleted`
4. **부수 갱신** — `UPDATE {다른테이블} SET ... WHERE ...`
5. **부수 삭제** — `DELETE FROM {다른테이블} WHERE ...`

### Step 4: 컬럼 매칭 분석

부수 적재의 SELECT 절이 본 테이블의 어떤 컬럼을 적재 테이블의 어떤 컬럼에 매핑하는지 매트릭스로 작성:

| 대상 테이블 컬럼 | 적재 테이블 컬럼 | 비고 |
|---|---|---|
| `CoCd` | `CoCd` | 1:1 |
| `INSP_REQ_NO` | `INSP_REQ_NO` | 1:1 |
| (계산값) | `처리자_PC명` | `'검사전표 삭제 처리자 : ' + @PC_NAME` |
| (계산값) | `삭제시각` | `GETDATE()` |

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

### Step 7: 보고서 구조

```markdown
# {TRIGGER} — Trigger 분석

| 항목 | 내용 |
|---|---|
| 트리거 ID | dbo.{TRIGGER} |
| 종류 | DML AFTER DELETE (또는 INSTEAD OF 등) |
| 대상 테이블 | dbo.{TABLE} |
| 적재 대상 | dbo.{적재테이블} |
| 원본 본문 | `docs/external/SampleErp/triggers/{TRIGGER}.sql` |
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

본문 어휘는 [`_shared/vocabulary-mapping.md`](../_shared/vocabulary-mapping.md) 의 PL/SQL → T-SQL 매핑 적용.
