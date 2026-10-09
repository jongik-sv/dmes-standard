# 출력 형식 상세 (dflow-wbs 동봉 정본)

플러그인 `dev:wbs-wsf` 원본(dev 1.7.1) 발췌. 원본과 차이:
**상태 어휘·category 값은 SKILL.md 우선** — 상태는 항상 `[ ]`(전이 정본 = D'Flow), category 는 7종 약어(`dev`/`defect`/`infra`/`feat`/`design`/`research`/`itest`).
원본의 `development`·`infrastructure`·`integration-test` 표기는 이미 치환함.

## Task 속성 목록

| 구분 | 필드 | 포맷 |
|------|------|------|
| **단일행 스칼라** | category, domain, model, status, priority, assignee, schedule, tags, depends, blocked-by, note, entry-point, prd-ref | `- field: value` |
| **리스트** (CSV 또는 bullet) | requirements, acceptance, constraints, test-criteria, tech-spec, api-spec, data-model, ui-spec | `- field: v1, v2` 또는 다음 줄에 `  - item` |

- **리스트 필드 파싱 규칙** (`wbs-parse.mjs` 의 `parse_list_field`):
  - `- field: -` → 빈 리스트
  - `- field: a, b, c` → 인라인 CSV, `["a", "b", "c"]`
  - `- field:` + 다음 줄의 `  - item` 라인들 → bullet 리스트 (다음 `- name:` 필드나 빈 줄에서 종료)
- **단일행 필드**는 값에 콤마 있어도 분할 안 함 (`get_field`). 리스트 성격 값은 반드시 리스트 필드로 선언.
- JSON 출력 키는 하이픈 → 언더스코어 (`blocked-by` → `blocked_by`, `entry-point` → `entry_point`).
- `entry-point` = domain 이 `fullstack` 또는 `frontend` 인 Task 에서 **필수**.

## Task 블록 형식 (기능 Task 예)

```markdown
### TSK-03-01: {Task명}
- category: dev
- domain: fullstack
- model: {opus 또는 sonnet}
- status: [ ]
- priority: high
- assignee: -
- schedule: {시작일} ~ {종료일}
- tags: {관련 태그}
- depends: -
- blocked-by: -
- entry-point: {메뉴/사이드바/라우트 — fullstack·frontend 필수, backend는 '-'}
- note: -

#### PRD 요구사항
- prd-ref: {PRD 섹션 참조 | program:{프로그램ID}}
- requirements:
  - {요구사항 1}
  - {요구사항 2}
- acceptance:
  - {인수조건 1}
  - {인수조건 2}
- constraints:
  - {제약사항}
- test-criteria:
  - {검증 기준 (선택)}

#### 기술 스펙 (TRD)
- tech-spec:
  - {기술 스택}
- api-spec:
  - {API 엔드포인트, 스키마}
- data-model:
  - {엔티티, 필드, 관계}
- ui-spec:
  - {UI 구성 요소 (fullstack/frontend 한정)}
```

⚠️ 4단계(`#### TSK-`)에서는 명세 블록 헤딩이 `#####` 다 — SKILL.md `### 명세 블록 파싱 계약` 규칙 1.

## 통합테스트 Task 형식

```markdown
## WP-{마지막 번호}: 통합테스트
- schedule: {시작일} ~ {종료일}
- description: 기능 간 시나리오 E2E·성능·권한 교차 검증 (개별 기능 재검증 아님)

### TSK-{NN}-01: {시나리오 묶음명 — 예: 등록→집계→리포트 흐름}
- category: itest
- domain: test
- model: sonnet
- status: [ ]
- priority: high
- assignee: -
- schedule: {시작일} ~ {종료일}
- tags: integration, e2e
- depends: {시나리오가 관통하는 대표 기능 Task들}
- entry-point: -

#### PRD 요구사항
- requirements:
  - {기능 간 흐름 시나리오}
- acceptance:
  - {시나리오 통과 기준}
  - 발견 결함은 해당 기능 WP에 defect Task로 등록됨
```

## 의존 그래프 챕터

> 의존 그래프 검증 결과를 이 섹션에 기록. 파일의 **가장 마지막 챕터**로 배치 (모든 WP·Task 블록 뒤). Mermaid 블록은 `mermaid` 펜스 사용.

### 그래프 (Mermaid)

```mermaid
graph LR
  TSK-01-01 --> TSK-02-01
  TSK-02-01 --> TSK-01-02
  TSK-02-01 --> TSK-02-02
  TSK-01-02 --> TSK-01-03
  TSK-01-02 --> TSK-03-01
  TSK-02-02 --> TSK-03-01
  %% ... 모든 depends 관계를 간선으로 표기 ...
```

노드 스타일 규칙:
- 계약 전용 Task 는 `style TSK-01-02 fill:#e8f5e9,stroke:#2e7d32`
- 구현 포함 선행 Task 는 `style TSK-01-03 fill:#fff3e0,stroke:#e65100`
- 리뷰 후보(아래 `review_candidates`)는 `style TSK-XX stroke:#c62828,stroke-width:2px`

### 통계

| 항목 | 값 | 임계값 |
|------|-----|--------|
| 최장 체인 깊이 | {max_chain_depth} | 3 초과 시 검토 (공정 양끝 +2 는 구조 비용 허용) |
| 전체 Task 수 | {total} | — |
| Fan-in ≥ 3 Task 수 | {fan_in_ge_3_count} | 계약 추출 후보 (모듈 계약·itest Task 는 구조적 예외) |
| Diamond 패턴 수 | {diamond_count} | 자주 발생 시 apex 계약 추출 |

**Fan-in Top 5**: `| Task | Fan-in | 계약 추출 가능? |` 표.

**Diamond 패턴**: `| Apex | 분기 | Merge |` 표.

### 리뷰 후보 (review_candidates)

후보마다 "계약 추출로 해소 가능" 또는 "진짜 구현 의존이라 유지" 명시.

| Task | 신호 | 판정 | 근거 |
|------|------|------|------|
| TSK-03-03 | depends=5 | 유지 | 실제 5개 시스템 상태 변경을 원자적으로 조합해야 함 |
| TSK-03-07 | fan-in=6 | 분리 | `session` 타입만 공유 → 계약 전용 Task 신설 |

**후보 없으면 "검토 결과 후보 없음" 명시.** 이 섹션을 비워두지 않음.


## 출력 형식 예시 골격 (SKILL.md 에서 옮김)

```markdown
# WBS - {프로젝트명}

> version: 1.0
> depth: {3|4}
> start-date: / target-date: / updated:

---

## Dev Config
(템플릿 기반)

## WP-01: 프로젝트 초기화
- schedule: {시작} ~ {종료}

### TSK-01-01: {Task명}
- category: infra
- domain: infra
- model: sonnet
- status: [ ]
- priority: critical
- assignee: -
- schedule: {시작} ~ {종료}
- tags: setup
- depends: -
- entry-point: -

#### PRD 요구사항
- requirements: ...
- acceptance: ...

(계약 전용 예)
### TSK-01-02: users 스키마 + User 타입 정의 (계약 전용)
- category: infra
- tags: contract
- acceptance:
  - 실행 로직 없음 (contract-only)
  - 공유 시험은 틀의 존재·탑재 순서만 단정한다. 빈 라우터·스텁 목록(`STUBS` 등)을 단정하지 않는다
  - 기능 Task 마다 자기 시험 파일과 소유 파일을 design.md `## 기능 Task 편집 지점` 에 적고, 두 Task 가 한 파일을 나눠 갖지 않는다
  - 등록(라우트·핸들러 목록)은 자동 수집이며 기능 Task 가 공유 진입점에 줄을 더하지 않아도 된다
  - 계약 문서가 지정한 파일(공용 시험 헬퍼 포함)이 모두 있다

## WP-{마지막}: 통합테스트
### TSK-{NN}-01: {시나리오 묶음}
- category: itest
- depends: {시나리오 관통 기능 체인 말단 Task들}

## 의존 그래프
(Mermaid + 통계 + 리뷰 후보 — 마지막 챕터 고정)
```


## 명세 블록 파싱 계약 근거표 (SKILL.md 에서 옮김)

| # | 규칙 | 근거 | 어겼을 때 |
|---|---|---|---|
| 1 | **명세 블록 헤딩은 TSK 헤딩보다 반드시 한 단계 이상 깊다** — 3단계(`### TSK-`)면 `####`, 4단계(`#### TSK-`)면 `#####` | `wbs-parse.mjs` `extract_task_block` — 헤딩 깊이 `hl >= 2 && hl <= level` 에서 블록이 끝난다 (같거나 얕은 헤딩. 펜스 코드 블록 안의 Task 가 아닌 헤딩은 무시하지만 Task 헤딩은 항상 닫는다) | **Task 블록이 명세 앞에서 잘려 전 필드가 통째로 유실**. 4단계에 `#### PRD 요구사항` 을 쓰는 것이 이 사고의 전형 |
| 2 | **필드 줄은 열 0에서 시작한다** — `- requirements:` (앞 공백 금지) | `wbs-parse.mjs` `get_field` — 줄이 `- {field}:` 로 시작해야 한다 (`startsWith`) | 그 필드만 빈 값이 된다 |
| 3 | **bullet 항목은 정확히 2칸 들여쓴다** — `  - 항목` | `parse_list_field` 의 bullet 형태(`  - ` 2칸 들여쓰기로 시작하는 줄만 항목) | 항목이 안 잡히거나 앞 항목에 붙는다 |
| 4 | **빈 리스트는 생략하지 말고 `- field: -` 로 명시한다** | 같은 함수의 `-` 처리 | 필드 부재와 "비었음"이 구별되지 않는다 |
