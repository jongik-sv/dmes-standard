# 부속서 A. 식별자 사전

> 상위 문서: [부속서 A. 식별자 사전](../01_Agent부속_가이드.md)

## A.11 가이드 선택 결정도 (B6)

> 작업 유형별 정본 가이드 라우팅. 작업 착수 전 본 절 결정도를 따라 단일 진입점을 선택한다.

### A.11.1 결정도 (텍스트 flowchart)

```
[작업 요청 도착]
        │
        ▼
   작업 유형 분류
        │
   ┌────┼─────────────────────────────────┐
   ▼    ▼                ▼                ▼
 [설계] [BE 개발]      [FE 개발]        [라우터/공통]
   │       │                │                │
   ▼       ▼                ▼                ▼
docs/    docs/guide/      docs/guide/      RULE.md
guide/   BackEnd/         FrontEnd/        (단일 진입점)
design/  BackEnd_표준_    FrontEnd_표준_
00·01    통합_개발가이드_  통합_개발가이드_
가이드   v2.md            v2.md
+ 부속서
(A.1~A.12)
```

### A.11.2 작업 유형 → 정본 가이드 매핑

| 작업 유형 | 정본 가이드 | 보조 가이드 | 비고 |
|---|---|---|---|
| **설계** (분석리포트·기능설계·디자인·BPMN·정합체크) | `docs/guide/design/00_Agent지시_가이드.md` + `01_Agent부속_가이드.md` | 템플릿: `docs/guide/design/templates/*.template.md` | 부속서 (§A) 가 식별자 정본 |
| **BE 개발** (Spring Boot 4 + Java 21) | `docs/guide/BackEnd/BackEnd_표준_통합_개발가이드_v2.md` | `ksm/CLAUDE.md` (TDD 프로세스) | composite build: mpn / aps-core / cactus-core / mpp / mcm |
| **FE 개발** (Next.js 16 + React 19) | `docs/guide/FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md` | `ksm/docs/guide/FrontEnd/Local-Rules.md` | pnpm workspace: m-mpn / m-mpp / m-mcm / shared |
| **라우터 / 공통 규칙** | `RULE.md` | `CLAUDE.md` | 분기 라우팅 / 명명 / URL 컨벤션 정본 |
| **레거시 분석** (KsmErpK / KsmK Project) | `docs/external/KsmErpK/*` (SQL/DDL 정본) + Skill `/analyze-service` | `KsmK Project/CLAUDE.md` (있을 시) | git 비대상 — 분석 전용 |

### A.11.3 충돌 시 우선순위

| 충돌 시나리오 | 우선순위 |
|---|---|
| 본 부속서 (§A) ↔ 본문 가이드 (00) | 식별자는 §A 우선 / 절차는 00 우선 |
| 00·01 ↔ BE/FE 개발가이드 v2 | 설계 단계는 00·01 / 개발 단계는 v2 |
| 00·01 ↔ RULE.md | RULE.md 우선 (메인 진입점) |
| CLAUDE.md ↔ RULE.md | RULE.md 우선 (`ksm/CLAUDE.md` 명시) |
| 본 가이드 ↔ 메모리 (feedback-*) | 메모리 우선 (사용자 누적 결정 반영) |

### A.11.4 검증 (정합 §B `B-A11`)

산출물 머리말 또는 작업 노트에 사용한 정본 가이드 경로 명시 (예: `정본 가이드: docs/guide/design/00_Agent지시_가이드.md`). 미명시 ✗.

---

## A.12 테이블 명명 표준 (D2)

> **(MUST)** 신축 MES 의 모든 신규 DB 테이블명은 본 절 형식으로 결정한다.

### A.12.1 형식 (D2, MUST)

**형식**: **`TB_{모듈명}_{역할}`**

| 토큰 | 표기 | 출처 |
|---|---|---|
| `TB_` | 고정 prefix (대문자 + 언더스코어) | 본 절 |
| `{모듈명}` | **lowercase 3 글자** (단 `mdm` 은 대문자 `MDM` — §A.12.7) | §A.1.1 모듈 정본 (mpn / mpp / mls / mqc / mcm / mdm) |
| `_` | 구분자 (언더스코어 1 글자) | 본 절 |
| `{역할}` | **lowercase + snake_case 도메인 명사 + 선택적 한정어** (단 `mdm` 은 UPPER_SNAKE — §A.12.7) | 본 절 |

### A.12.2 역할 토큰 규칙

| 규칙 | 내용 | 예시 |
|---|---|---|
| 표기 | lowercase + snake_case (단 `mdm` 은 UPPER_SNAKE — §A.12.7) | `code_master` / `inspection_request` |
| 도메인 명사 | 단수형 | `code` ○ / `codes` ✗ |
| 한정어 | `_` 로 연결 (역할 내 추가 `_` 허용) | `code_master_detail` / `inspection_request_detail` |
| 금지 | PascalCase / camelCase / 대문자 단어 | `CodeMaster` ✗ / `codeMaster` ✗ |
| 금지 | 한글 음역 / 의미 추정 | `bunseok` ✗ |

### A.12.3 예시 5~7 개 (5 모듈 골고루 분포)

| 테이블명 | 모듈 | 역할 | 도메인 의미 |
|---|---|---|---|
| `TB_mpn_routing_master` | `mpn` | `routing_master` | 공정 라우팅 마스터 |
| `TB_mcm_code_master` | `mcm` | `code_master` | 마스터 코드 (masterCodeMng 도메인) |
| `TB_mcm_code_category` | `mcm` | `code_category` | 마스터 코드 카테고리 (masterCategoryMng 영속) |
| `TB_mls_stock_move` | `mls` | `stock_move` | 재고 이송 |
| `TB_mls_warehouse_inout` | `mls` | `warehouse_inout` | 창고 입출고 거래 |
| `TB_mqc_inspection_request` | `mqc` | `inspection_request` | 품질 검사 의뢰 |
| `TB_mcm_topic_subscription` | `mcm` | `topic_subscription` | KMC 토픽 구독 정보 |

### A.12.4 등재 절차

1. 신규 테이블 필요 시 분석리포트 §4 또는 설계서 §3 데이터 모델 절에 `TB_{모듈}_{역할}` 후보 기재
2. 모듈명이 §A.1.1 모듈 정본 외이거나 역할 토큰이 기존 테이블과 의미 중복이면 [확인필요: Q-NNN] 등재
3. 사용자 확정 후 마이그레이션 스크립트 + 본 부속서 PR 동시 진행

### A.12.5 (MUST NOT)

| 사례 | 처리 |
|---|---|
| `TB_master_mold` / `TB_aps_*` (legacy 모듈명) | ✗ — A.1.1 모듈 정본만 허용 |
| `TB_MPP_MOLD_MASTER` (전체 대문자) | ✗ — 모듈명 lowercase / 역할 lowercase 강제 |
| `TB_mpp_MoldMaster` (역할 camelCase/PascalCase) | ✗ — 역할 snake_case 강제 |
| `TB_code_master` (모듈 prefix 누락) | ✗ — `TB_{모듈}_` 강제 |
| `T_mcm_code_master` (prefix 변형) | ✗ — `TB_` 고정 |

### A.12.6 검증 (정합 §B `B-A12`)

신규 테이블명 토큰 정규식 매칭: `^(TB_(mpn|mpp|mls|mqc|mcm)_[a-z][a-z0-9_]*|TB_MDM_[A-Z][A-Z0-9_]*)$` 100% (둘째 가지는 §A.12.7 mdm 예외). 위반 1 건 이상 시 ✗.

### A.12.7 mdm 모듈 예외 — 대문자 표기 (2026-09-24)

1. mdm(마루 MDM) 테이블은 `TB_MDM_{역할}` 로 모듈·역할을 **대문자** UPPER_SNAKE 로 쓴다(예 `TB_MDM_CODE_VER`, `TB_MDM_RULE_ROW`). 근거: 사용자 결정 2026-09-23(`docs/mdm/decisions.md` D-006), 리포 실자산 관례(모듈 테이블 28종(CREATE TABLE·@Table 합집합) 전부 대문자 — mcm-reference "테이블명 대문자 유지"), 칼럼은 backend-standard §5 UPPER_SNAKE.
2. 칼럼·제약·인덱스 명명은 [`docs/mdm/naming-dialect-rules.md`](../../../mdm/naming-dialect-rules.md) §1 을 따른다.
3. `TB_mdm_*`(소문자)·`TB_Mdm_*` 는 ✗.
4. 다른 모듈의 소문자 규칙은 이 절이 바꾸지 않는다(전 모듈 대문자 전환 여부는 별도 결정 — `docs/mdm/tasks/TSK-02-01/design.md` D1).
5. ADR: [mdm ADR-0001](../../../mdm/adr/0001-physical-naming-audit-dialect.md)

---

## A.13 메인-워커 디스패치 운영 요약 (2026-06-05)

본 운영 표준은 [`00_Agent지시_가이드.md §22`](../agent-directive/08-prompt-operations-dispatch.md) "메인-워커 1계층 디스패치 패턴" 의 실무 요약이다. 본문은 §22 가 정본이며, 본 절은 작업 규모별 분기 판단만 다룬다.

### A.13.1 작업 규모별 처리 방식

| 작업 규모 | 처리 방식 | 근거 § |
|---|---|---|
| 1 ~ 2 파일 수정 | 메인 직접 수행 (워커 dispatch ✗) | [`00 §22.1`](../agent-directive/08-prompt-operations-dispatch.md) (단순 단건) |
| 3 + 독립 단위 | 워커 병렬 dispatch | [`00 §22.1`](../agent-directive/08-prompt-operations-dispatch.md) (적용 조건) |
| 9 + 단위 + 검증 비용 큼 | 워커 dispatch + 메인 grep 마커 검증 | [`00 §22.2`](../agent-directive/08-prompt-operations-dispatch.md) Step 4 |

### A.13.2 본 세션 실적 (2026-06-05)

11 worker 병렬 (9 화면 + 1 개발가이드 + 1 메모리) — 32 + grep 마커 검증 통과. 워커 침범 0 건 / 메인 우회 수행 0 건. (정본 실적표는 [`00 §22.3`](../agent-directive/08-prompt-operations-dispatch.md))
