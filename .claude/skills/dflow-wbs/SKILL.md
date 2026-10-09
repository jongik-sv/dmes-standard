---
name: dflow-wbs
description: PRD/TRD 또는 프로그램 리스트(json/yaml/csv/md/xlsx)로 WBS 를 Water-Scrum-Fall 샌드위치 구조로 생성한다. 선행 공정(초기화·기본설계) → 애자일 기능 Task → 후행 통합테스트. 프로그램 1개 = fullstack Task 1개(수직 슬라이스). category 7종(dev/defect/infra/feat/design/research/itest). 생성 상태는 항상 [ ] — 상태 전이는 D'Flow(stage)가 정본이며 wbs.md 는 /wbs/import 부트스트랩용이다. 사용법 /dflow-wbs [SUBPROJECT | /absolute/path/to/wbs.md] [--programs 경로] [--scale large|medium] [--start-date YYYY-MM-DD] [--estimate-only] [--export-xlsx [경로]]
---

# /dflow-wbs - PRD/TRD·프로그램 리스트 기반 WBS 생성 (Water-Scrum-Fall)

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> 이 리포 `.claude/skills/` 안에서 동작하는 스킬.
> - 스크립트·템플릿·출력 형식 정본(`references/`) = 이 폴더.
> - node 스크립트는 `.claude/skills/` 아래 `_shared/node/`, `dflow-export/scripts/`(`_pystr.mjs`·`wbs-validate.mjs`)를 import. 이 폴더만 복사하면 안 돎 (`_shared`·`dflow-export` 함께 둠).
> - PRD 검증·결정 로그(`prd-validate`·`decision-log`) = 이 스킬 `scripts/`.
> - WBS 파서·검증·의존 분석(`wbs-parse`·`wbs-validate`·`dep-analysis`) = `/dflow-export` 스킬 node 판 (`.claude/skills/dflow-export/scripts/*.mjs`). 별도 복사본 없음 (2026-10-07 통합).
> - dev 플러그인 없는 PC 도 리포 clone + node(18.17+)만으로 동작. 상대 경로 = 리포 루트가 cwd 전제.
> - `decision-log.mjs append`: `decisions.md.lock` 디렉터리(mkdir 잠금)로 동시 기록 방지. 15초 안에 못 잡으면 종료 코드 1.
>   - 항목 머리 = `## D-<숫자> (<시각>)` 로 줄이 끝나는 줄만 인정 (dflow-merge `decisions.mjs` 와 같은 규칙).
> - 구조·경계·게이트 규칙 문서 정본 = 대상 리포 `docs/wbs-workflow.md`. 있으면 생성 전 Read. 이 파일과 다르면 그 문서가 이김.
> - **상태·전이·배정·진척 정본 = D'Flow.** 이 스킬은 상태를 `[ ]` 로만 생성.
> - wbs.md = 최초 작성·사람 검수·`POST /api/v1/wbs/import` 부트스트랩 전용. import 후 실행 상태는 D'Flow DB 에서 읽음.
> - 6상태 로컬 워크플로우 서술은 제거됨 (2026-08-11 WBS 중앙관리 결정. 옛 로컬 오버라이드는 dev-workflow 리포에서 같은 날 삭제).

## 인자 파싱 — 서브프로젝트 감지

인자를 공백 토큰화, 첫 토큰 검사:

1. `/` 로 시작 (절대 경로): 파일 있으면 `WBS_FILE={경로}`, `DOCS_DIR={파일 디렉토리}`, `VIEW_MODE=true`.
   - VIEW_MODE = 내용 전체 표시 후 종료. 단 `--export-xlsx` 있으면 export 실행 뒤 종료.
   - 파일 없으면 에러 후 종료.
2. 토큰 없음 또는 `--` 시작 → `DOCS_DIR=docs`
3. `^(WP|TSK)-` 패턴 → `DOCS_DIR=docs` (토큰 유지)
4. 그 외 → 서브프로젝트 후보.
   - `docs/{토큰}/` 있으면 `SUBPROJECT={토큰}`, `DOCS_DIR=docs/{토큰}`.
   - 없으면 사용자에게 생성 여부 확인 (오타 가능성).

플래그:
- `--scale large|medium`: 규모 강제
- `--start-date YYYY-MM-DD`
- `--estimate-only`: 산정만
- `--programs {경로}`: 프로그램 리스트 입력 모드 (`.json` / `.yaml` / `.yml` / `.csv` / `.md` / `.xlsx`)
- `--export-xlsx [경로]`: WBS 엑셀 보고본 생성. 경로 생략 시 `{DOCS_DIR}/wbs.xlsx`
  - **VIEW_MODE 에서도 동작.** 기존 WBS 를 재생성 없이 엑셀로만 뽑는 것이 주 용도.

## 입력 파일 — 모드 두 개

| 모드 | 조건 | 입력 |
|---|---|---|
| **PRD 모드** (기본) | `--programs` 없음 | `{DOCS_DIR}/PRD.md`, `{DOCS_DIR}/TRD.md` — 둘 다 없으면 에러 후 중단 |
| **프로그램 리스트 모드** | `--programs {경로}` 있음 | 그 파일. PRD/TRD 는 **선택** — 있으면 함께 읽어 requirements·tech-spec 보강, 없어도 중단 안 함 |

프로그램 리스트 모드 상세 = `## 프로그램 리스트 입력 어댑터` 절.

### 입력 검증 (자율 보강, 사용자에게 묻지 않음)

PRD/TRD 있을 때만 실행. 프로그램 리스트 모드에서 둘 다 없으면 건너뜀.

```bash
node .claude/skills/dflow-wbs/scripts/prd-validate.mjs validate --target {DOCS_DIR}/PRD.md
node .claude/skills/dflow-wbs/scripts/prd-validate.mjs validate --target {DOCS_DIR}/TRD.md
```

`issues` 있으면:
1. 합리적 가정으로 보강 → `## Assumptions (auto-resolved YYYY-MM-DD)` append.
2. `decisions.md` 에 `phase=prd-resolve` 적재 (`node .claude/skills/dflow-wbs/scripts/decision-log.mjs append`).
3. 재검증 1회.
4. 그래도 남으면 한 줄 알림 후 진행 (흐름 차단 없음).

### 출력 검증 (wbs.md 생성 직후)

```bash
node .claude/skills/dflow-export/scripts/wbs-parse.mjs {DOCS_DIR}/wbs.md - --dev-config > {scratchpad}/dev-config.json
node .claude/skills/dflow-export/scripts/wbs-validate.mjs validate --wbs {DOCS_DIR}/wbs.md --dev-config-json "$(cat {scratchpad}/dev-config.json)"
```

> ⚠️ **툴체인 제약 — 실측 기준. 검증 결과를 곧이곧대로 믿지 말 것.**
>
> - `wbs-parse`·`wbs-validate`·`dep-analysis` = `/dflow-export` 스킬 node 판 (`.claude/skills/dflow-export/scripts/*.mjs`).
> - 옛 동봉 스냅샷(3단계만 인식·`[xx]` 단독 판정·stdin 불가)은 제거됨.
> - 3단계 한정·stdin 불가 = 「해소됨」. `[xx]` 단독 판정 = 「부분 해소」(대상 리포가 6상태 정의를 둘 때만 해소).
> - `merge-wbs-status.py`·`wbs-transition.py` = 이 리포 밖(dev-workflow) 스크립트라 제약 그대로.
>
> | 제약 | 근거 | 생성 시 영향 | 해소 |
> |---|---|---|---|
> | ~~`wbs-validate` 는 3단계만 인식~~ | export 판은 `#{3,5}` + `TSK-숫자(-숫자)+` 로 3·4단계 모두 읽음 | 4단계 WBS 도 `task_count` 에 잡힘 — 0 이면 헤딩을 못 읽은 것, 실패로 봄 | **해소됨 (dflow-export 판 사용)** |
> | `merge-wbs-status.py` 도 3단계만 인식 | `merge-wbs-status.py:37` 정규식 `^###\s+(TSK-\d+-\d+):` | 4단계에서 상태 머지가 조용히 무동작 | DEV-03 |
> | 머지 상태 어휘가 5개 | `merge-wbs-status.py:28-33` + `:172` `.get(v, -1)` | 어휘 밖 상태는 랭크 −1 로 `[ ]`(0)보다도 낮게 취급 → **조용히 덮임** | DEV-01 |
> | 전이 스크립트 상태 어휘가 5개 | `wbs-transition.py:353` `{"[ ]","[dd]","[im]","[ts]","[xx]"}` | 파일에 `[as]` 같은 진행 상태를 쓰면 `unknown status in wbs.md` 로 **거부** | DEV-01 |
> | 의존 완료 판정 기본값이 `[xx]` 단독 | `dep-analysis.mjs` — `--docs-dir` 없으면 `[xx]` 만 충족, 있으면 상태머신이 정함(6상태 정의면 `[im]` 이상, 5상태면 `[xx]` 만) | 진행 중 WBS 를 `--docs-dir` 없이 재분석하면 완료 판정이 문서 기준(`[im]` 이상)보다 좁음 | **부분 해소 (`--docs-dir {DOCS_DIR}` 사용 — 임계는 프로젝트 상태머신 정의가 정함)** |
> | Task ID 정규식은 숫자만 | export 판 `_TSK_HEADING_RE` = `TSK-숫자(-숫자)+:` | `TSK-02-01a` 같은 letter suffix 는 **조용히 무시** — 쓰지 않음 | — |
> | ~~`dep-analysis` 는 stdin 불가~~ | export 판은 파일 경로 인자·표준입력(파이프) 모두 받음 | `wbs-parse.mjs … --tasks-all` 출력을 바로 파이프해도 됨 | **해소됨 (dflow-export 판 사용)** |
>
> **4단계(ACT) 생성 시:**
> - `wbs-validate.mjs` 결과 `task_count` = 생성한 Task 건수인지 확인.
> - 다르면 헤딩을 못 읽은 것. `wbs-parse.mjs --tasks-all` 로 건수·필드 직접 대조.
> - **생성 리포트에 "4단계 — merge-wbs-status 는 3단계만 인식(외부 스크립트, DEV-03 대기)" 한 줄 출력.** (wbs-validate 는 이제 4단계를 읽으므로 무력화 대상 아님.)
> - 이 경고는 생성 리포트에만. wbs.md 본문에 넣지 않음 — wbs.md = 작업 정본, 툴 상태 기록부 아님.

issue 발견 시: 해당 Task 만 재작성 → 재검증 1회 → `decisions.md` 에 `phase=wbs-resolve` 적재.

## 전체 구조 — 샌드위치 (정본: wbs-workflow.md §1)

```
[선행 공정]                [애자일 반복]              [후행 공정]
WP-01 초기화·공유계약  →   기능 WP × N           →   마지막 WP 통합테스트
WP-02 전체 기본설계        (설계→구현→테스트를        (기능 간 E2E, 성능,
                           Task 안에 내포)            권한 교차, UAT)
```

- 화살표 = 개념 순서. 실제 진행은 게이트 충족 시 구간이 겹칠 수 있음.
- **선행/기능 경계**: "2개 이상 기능이 공유하거나, 바꾸면 마이그레이션 필요한 것"만 선행.
- **선행 설계는 얇게**: 핵심 엔티티·관계까지만. 컬럼 상세는 기능 Task 위임.
- **DB(ERD) 설계는 그룹 설계에서 분리해 작게 뗌** — 계약 파이프라인이라서 (계약 Task 의 유일한 선행 = DB 설계).
  - DB 설계가 큰 그룹 설계에 묶이면 계약 동결이 그룹 전체 완료를 기다림.
- **후행/기능 경계**: 기능 Task = 자기 기능 E2E 까지. 통합 WP = 기능 **간** 흐름·성능·권한 교차·이관 리허설만.
- **결함 되돌림**: 통합테스트 결함 → 해당 기능 WP 에 `category: defect` Task 신설.
- 소규모면 WP-02 생략 가능 (WP-01 이 흡수). 기능 WP 2개 이상이면 통합테스트 WP 필수.
  - **프로그램 리스트 모드는 예외 — 기능 WP 1개여도 통합테스트 WP 생성** (`## 프로그램 리스트 입력 어댑터`).

## 계층·규모·ID (정본: wbs-workflow.md §2)

```
Phase → WP → [ACT(4단계만)] → Task → [Sub Task 수동]
```

| 기준 | 대규모(4단계) | 중소규모(3단계) |
|------|--------------|----------------|
| 기간 | 12개월+ | 미만 |
| 팀 | 10명+ | 미만 |
| 기능 영역 | 5개+ | 미만 |
| Task 수 | 50개+ | 미만 |

- 타이브레이커: 2:2 면 4단계 (ACT 제거가 추가보다 쌈).
- **예외**: 모듈 경계가 명확한 다모듈 시스템은 규모 미달이어도 ACT 허용 (MES 샘플).

| 레벨 | 4단계 | 3단계 |
|------|-------|-------|
| WP | `## WP-XX:` | `## WP-XX:` |
| ACT | `### ACT-XX-XX:` | — |
| TSK | `#### TSK-XX-XX-XX:` | `### TSK-XX-XX:` |

- **모든 레벨 번호는 `01` 부터** — `WP-01` · `ACT-XX-01` · `TSK-XX-01`. `00` 은 어느 세그먼트에도 안 씀.
- `WP-01` = 초기화 예약. **Task ID 는 숫자만** — 분할 시 새 숫자 ID + `tags: split-from-XX`.
- Sub Task = Task 헤딩보다 한 단계 아래 헤딩의 체크박스 (3단계 `####`, 4단계 `#####`).

## Task category — 7종 약어 (정본: wbs-workflow.md §3)

**애자일형** (산출물 = 코드+테스트):
- `dev`: 기능
- `defect`: 결함
- `infra`: 인프라·공유 계약·리팩토링
- `feat`: 독립 기능, `/feat` 별도 실행, 의존 그래프 제외

**공정형** (산출물 = 문서·결정·검증 결과):
- `design`: 설계서·ERD
- `research`: 결정 문서, `decisions.md` 반영
- `itest`: 통합테스트 결과서

- 판정 순서: ① 구간 먼저 (선행 WP → design/research/infra, 후행 WP → itest) ② 기능 구간은 산출물로 (코드 → dev/defect/infra).
- `feat` 자동 분류: depends 없음 + fan-in 0 + 코드·계약 공유 없음, 전부 충족 시. feat Task 에 depends 걸기 금지.
- 부가 Task(시드 데이터·fixture·API 키): 공유 범위로 판정.
  - 2+ 기능 공유 → `infra` 선행 분리.
  - 1개 전용 → 해당 기능 Task 에 흡수.

## 상태 — 생성은 `[ ]` 하나 (전이 정본: D'Flow)

- **WBS 생성 시 모든 Task `status: [ ]`** — 담당자를 알아도 마찬가지.
- 배정·전이 = import 후 D'Flow(stage)가 관리.
- `[as]` 같은 진행 상태를 파일에 직접 쓰면 로컬 툴체인도 거부 (`wbs-transition.py:353` — `unknown status in wbs.md`).
- `assignee` = **입력이 email 을 줄 때만** 그 값. 그 외 `-` (규칙: `## D'Flow 연동 표기` 절).
- ⚠️ `dep-analysis.mjs` 는 `--docs-dir` 없으면 `[xx]` 만 완료로 셈.
  - 진행 중 WBS 재분석 시 `--docs-dir {DOCS_DIR}` 를 붙여 상태머신이 충족 임계를 정하게 함 (6상태 정의면 `[im]` 이상, 5상태면 `[xx]` 만).
  - 생성 시점엔 전 Task 가 `[ ]` 라 영향 없음.

## D'Flow 연동 표기 (정본: 부록 §2.5·§2.6·§7.2)

생성물이 `POST /api/v1/wbs/import` 로 올라갈 수 있다는 전제. wbs.md 표면에 **넣는 것과 넣지 않는 것**이 정해져 있음.

### 넣는 것

| 항목 | 계층 | 문법 | 규칙 |
|---|---|---|---|
| 담당자 | Task | `- assignee: {email}` | 입력 값에 `@` 있으면 그대로 시드. 아니면 `- assignee: -` 로 두고 **"담당 미매칭" 표에 원문과 함께 전량 나열**(생략 금지). 빈 값(미기재)은 미매칭 아님 — 표에 안 넣음. |
| 모듈 담당자 | WP / ACT | `- assignee: {email}` | 입력에 모듈 담당 컬럼 있을 때만. ⚠️ DEV-02(`--export`) 구현 후에도 **export 는 WP/ACT 의 assignee 를 안 실음**(task kind 전용 필드) — 기록만 되고 업로드 안 됨. |
| 프로그램 추적 키 | Task | `- prd-ref: program:{프로그램ID}` | 프로그램 리스트 모드 필수. 재생성 시 이 값으로 기존 Task 를 찾음. |

⚠️ **`assignee` 시드는 하류에서 자동 발행을 켠다.**
- 업로드 시 담당자 매칭 성공한 **리프 Task 는 D'Flow 작업 주문 자동 생성** (부록 §2.8).
- 그 주문은 **그 사람만 claim** 가능 (불일치 시 403 `not_assignee`).
- 담당 컬럼 채우기 = 표기가 아니라 배정 행위. 확정된 담당만 적음.

### ID 는 import 매칭 키다 — 재번호매김 금지

헤딩 ID(`WP-XX` · `ACT-XX-YY` · `TSK-XX-YY[-ZZ]`) = D'Flow `external_ref`. import upsert 는 이 값으로 기존 행을 찾음 (부록 §7.2-1).

wbs.md 는 import 후 은퇴하므로 이 규칙의 사정거리 = "재생성"이 아니라 "재import". 그래도 필요함 — **초기 import 는 한 번에 성공 안 함.** 담당자 미매칭·유형 미매핑·검증 실패로 고쳐 여러 번 돌리는데, ID 가 흔들리면 같은 항목이 DB 에 여러 벌 생김.

- **기존 wbs.md 있으면 먼저 읽고, `prd-ref: program:{ID}` 로 프로그램 ↔ Task ID 매핑을 복원한 뒤 그 ID 를 그대로 재사용.**
- 신규 프로그램 = 해당 WP/ACT 의 **다음 번호를 이어 붙임.** 중간 삽입으로 뒤 번호를 밀지 않음.
- 사라진 프로그램 ID 는 **재사용 안 함.** 항목 삭제 = 웹에서 사람이 (import 는 삭제 안 함).
- ID 를 바꾸면 upsert 매칭 실패 → **DB 중복 행.** 정렬 미관 때문에 번호를 다시 매기지 않음.
- **`01` 기반 번호 규칙 = 신규 생성에만 적용.** 이미 import 된 wbs.md 가 `WP-00` 으로 시작해도 그대로 둠 — 재번호매김하면 upsert 매칭 실패 → 중복 행.
- **import 성공 후 wbs.md 재생성 금지.** 이후 구조 변경 = 웹에서. 재생성은 예외 경로이며, 하려면 위 ID 복원을 반드시 거침.

### 넣지 않는 것 (웹이 정본)

- **실적·진척률** — 이미 금지 (`## 출력 형식` 말미). 재업로드해도 웹 값 보존.
- **`[as]` 이상의 상태 시드** — `## 상태` 절 참조.
- **D'Flow 식별자**(`project_id`·`wbs_item` UUID·주문 상태) — 업로드 **요청 파라미터**, 파일 필드 아님. 둘 곳은 아래 절.
- **담당팀(`item_owners`)** — D'Flow 조직 축. 파일에 대응 개념 없음. 담당자(개인)와 혼동 금지.
- **브랜치·워크트리 경로** — 넣지 않음. 이유 넷:
  1. **이미 파생값** — `wp-setup.py:257,269,270` 실측: `wt_name = {WP_ID}{suffix}` → 워크트리 `.claude/worktrees/{wt_name}` · 브랜치 `dev/{wt_name}`. 계산되는 값을 파일에 복제하면 반드시 어긋남.
  2. **wbs.md 자체가 워크트리마다 복제됨** — WP당 워크트리 N개가 각자 사본을 가짐. `merge-wbs-status.py` 는 `status` 한 컬럼만 우선순위 머지(`:28-33,172`), 다른 필드엔 머지 규칙 없음.
  3. **자기 참조 역설** — 브랜치 `dev/WP-04` 에서 "branch: dev/WP-04" 를 커밋하면 main 머지 순간 거짓이 됨. 브랜치는 지워져도 기록은 남음.
  4. **추적 정본 = git** — 커밋 트레일러 `DFlow-Order: <uuid>`(부록 §3) + `done --auto-links` + 0072 `evidence.{branch,base_sha,head_sha,repo_url,pr_url}`. `git log --grep='DFlow-Order: <uuid>'` 가 브랜치명보다 강한 추적 (브랜치는 지워져도 커밋은 남음).

  **분산(사람마다 다른 PC·clone) 환경은 근거가 더 강함.**
  - 각자 자기 Task 줄에 브랜치를 쓰면 wbs.md 가 상시 충돌.
  - 위 1번 파생 규칙(`dev/{WP_ID}`)은 `/dev-team` 이 한 PC 에서 워크트리를 팔 때만 성립. 사람이 손으로 판 브랜치에는 적용 안 됨.

  실행 시점 작업 위치를 남겨야 하면 자리는 둘:
  - **단일 PC(워크트리 병렬)** — `docs/tasks/<ID>/state.json` (실행 정본, 워크트리마다 값이 달라도 정상, 머지 대상 아님). **DEV-01 몫.**
  - **분산 다인** — **서버**(D'Flow). 남의 PC 파일은 못 보므로 state.json 도 답 아님.

  어느 쪽이든 **이 스킬 범위 아님.** 분산 추적에 대한 `/dflow-wbs` 기여는 둘:
  - **안정적 ID** (서버 추적이 한 항목에 누적되려면 `external_ref` 불변).
  - **`assignee` 시드** (자동 발행 → 주문 → claim → 서버 추적의 진입점).

### D'Flow 프로젝트 바인딩 — wbs.md 가 아니라 작업 리포의 `.dflow`·`.dflow.local`

**D'Flow 에는 프로젝트가 여러 개.** wbs.md 하나가 어느 D'Flow 프로젝트로 올라가는지 반드시 명시해야 하며, 그 자리 = **작업 리포의 `.dflow`·`.dflow.local`**.

wbs.md 에 안 넣는 이유: 파일은 git 으로 복제·브랜치되고 테스트/운영 환경을 오감. 환경 결합을 박으면 **엉뚱한 프로젝트에 업로드되어 운영 데이터 오염.**

```
# .dflow (커밋됨, 프로젝트 공통)
api_base=https://<host>
project_id=<D'Flow project uuid>          # 리포 전체가 한 프로젝트일 때

# .dflow.local (개인, gitignore)
pats=dflow_pat_<prefix>_<secret>[,dflow_pat_...]
project_map=docs/c10=<uuid>,docs/m30=<uuid>   # .dflow.local — DOCS_DIR 마다 프로젝트가 다를 때
```

해석 순서 (먼저 맞는 것이 이김). 값 확인 = `node .claude/skills/dflow-work/scripts/dflow.mjs config project_map`·`node .claude/skills/dflow-work/scripts/dflow.mjs config project_id`, 레거시는 `.env` 의 `DFLOW_PROJECT_MAP`·`DFLOW_PROJECT_ID`:

1. `.dflow.local` 의 `project_map` 에 현재 `DOCS_DIR` 키가 있으면 그 값
2. 없으면 `.dflow` 의 `project_id`
3. **둘 다 없으면 업로드 시도 안 함** — 추측하거나 "프로젝트 하나뿐이겠지"로 진행 금지 (fail-closed).
   - 생성은 정상 완료.
   - 리포트에 `업로드 불가 — .dflow 에 project_id 또는 .dflow.local 에 project_map 필요` 를 남김.

`module` 업로드 파라미터 = `DOCS_DIR` 의 마지막 경로 세그먼트 (`docs/c10` → `c10`, `docs` → `docs`). 별도 키 안 만듦.

스킬이 지키는 것:

- 설정 파일 값은 출력 안 함 (`.dflow.local` 에 PAT 있음 — 부록 §2.7, 한 파일에 N인분 자격증명). **존재·키 유무만 확인.**
- 이 키들을 **wbs.md 에도, 생성 리포트 본문에도 값으로 안 적음.** 리포트에는 "설정됨 / 없음"만.
- `.dflow`·`.dflow.local` 생성·수정 금지. 없으면 필요한 키 이름만 알림.

⚠️ 키 이름은 부록 §2.7 로컬 계약의 확장이며 **TSK-02-01(계약 동결)에서 최종 확정.** 확정 값이 다르면 이 절을 그쪽에 맞춤.

## depends 규칙 (정본: wbs-workflow.md §2)

- **FS(Finish-to-Start)만 사용.** SS 등 다른 유형 없음.
- **FS 의존과 일정 겹침은 공존 금지** — 검증식: depends 있는 쌍은 `후행 시작일 > 선행 종료일`.
  - 겹치게 계획했으면 의존을 제거하거나 일정을 밀 것.
- fast-tracking = **계약 분리**로 표현: 계획 단계 = 일정 겹침(비의존), 실행 단계 = 계약 동결(contract Task).
- 개발 Task 는 설계 Task 가 아니라 **계약 Task** 에 depends (설계는 전이적 게이트).

**계약 전용 Task 관례** (MES 샘플 준수):
- `category: infra`, `tags: contract`, 제목에 "(계약 전용)" 접미
- acceptance 에 "실행 로직 없음 (contract-only)" 명시
- 범위: DDL·타입·인터페이스·스키마·이벤트 페이로드 정의만
- 유일한 depends = 해당 DB(ERD)/설계 분리 Task
- 공유 파일 규칙(C1~C7)·acceptance 고정 네 줄 = 아래 「계약 Task 의 공유 파일 규칙」 절 (PRD·프로그램 리스트 모드 공통)

**공유 계약 사전 분석 (Task 분해 전 필수)**:
1. TRD 4종 스캔 (data-model / API / 타입·스키마 / 이벤트).
2. "2개 이상 feature 참조?"
3. 예 → 계약 전용 Task 선행 분리, feature 들이 depends 연결.
4. 1개 전용 → 수직 슬라이스로 흡수.

## 프로그램 리스트 입력 어댑터 (정본: 부록 §2.6 · DEV-04)

포맷별 처리 안 함. **정규화 어댑터 1층**이 아래 공통 스키마로 수렴시키고, 그 뒤는 PRD 모드와 같은 생성 규칙.

### 공통 스키마

| 키 | 필수 | 의미 | 없을 때 |
|---|---|---|---|
| `module` | ✅ | 모듈·서브시스템 코드 (WP 단위) | 에러 후 중단 |
| `program_id` | ✅ | 프로그램 ID (전역 유일) | 에러 후 중단 |
| `program_name` | ✅ | 프로그램명 (Task 제목) | 에러 후 중단 |
| `group` | — | 업무·프로세스 그룹 (ACT 단위) | 4단계면 유형별로 묶는다 |
| `type` | — | 화면 / 배치 / 리포트 / 인터페이스 | `화면` 으로 간주 + 리포트 |
| `difficulty` | — | 상 / 중 / 하 | `중` 으로 간주 + 리포트 |
| `owner` | — | 담당 (email 이어야 시드됨) | `assignee: -` |
| `module_owner` | — | 모듈 담당 (WP/ACT `assignee`) | 기록 안 함 |
| `route` | — | 화면 경로 | `/{module}/{program_id 소문자}` 로 파생 |
| `depends` | — | 선행 프로그램 ID, `;` 또는 `,` 구분 | 모듈 계약 Task 만 depends |
| `priority` | — | critical / high / medium / low | `high` |
| `note` | — | 비고 | 생략 |

### 헤더 별칭 (한글 헤더 지원)

헤더 문자열에서 **공백·언더스코어·하이픈 제거 + 소문자 변환** 뒤 아래 목록과 대조.

| 키 | 인식하는 헤더 |
|---|---|
| `module` | 모듈, 모듈명, 모듈코드, 시스템, module, mod, subsystem |
| `program_id` | 프로그램id, 프로그램코드, 화면id, pgmid, programid, id, code |
| `program_name` | 프로그램명, 화면명, 기능명, programname, name, title |
| `group` | 그룹, 업무그룹, 프로세스그룹, 단위업무, group, pg |
| `type` | 유형, 구분, 프로그램유형, 화면유형, type, kind |
| `difficulty` | 난이도, 복잡도, difficulty, complexity, level |
| `owner` | 담당, 담당자, 개발자, owner, assignee, developer |
| `module_owner` | 모듈담당, 모듈담당자, moduleowner |
| `route` | 화면경로, 경로, url, route, path, menu |
| `depends` | 선행, 선행프로그램, 의존, depends, predecessor |
| `priority` | 우선순위, priority |
| `note` | 비고, 설명, note, remark, description |

`group` 별칭에 `category` **금지** — WBS `category`(7종 약어)와 충돌.

### 포맷별 읽기

| 포맷 | 방법 |
|---|---|
| `.json` | 객체 배열, 또는 `{"programs": [...]}` 의 그 배열 |
| `.yaml` / `.yml` | Read 도구로 직접 읽어 객체 배열(또는 `programs:` 아래 배열)로 해석. 값이 모호하면(탭 들여쓰기, 앵커·별칭, 멀티 문서) 사용자에게 알리고 JSON 변환을 요청. **스칼라 형 규칙**: 따옴표로 감싼 값 = 항상 문자열, 따옴표 없는 `true`/`false` = 불리언, `null`·`~`·빈 값 = null, 숫자처럼 보이는 따옴표 없는 값 = 숫자. 단 `program_id`·`module`·`depends` 같은 식별자·코드 칸은 어떤 형이든 **원문 글자 그대로의 문자열**(`007` 이 `7`, `1.0` 이 `1` 이 되지 않게). 따옴표 없는 `yes`/`no`/`on`/`off` = 불리언 아닌 문자열 |
| `.csv` | Read 도구로 직접 읽어 에이전트가 해석 (별도 프로그램 없이). 첫 글자가 BOM(`U+FEFF`, 엑셀 CSV)이면 지움. 첫 행 = 헤더, 구분자 = 쉼표. 따옴표 규칙(RFC 4180): 쌍따옴표(`"`)로 감싼 칸 안의 쉼표·줄바꿈 = 칸 내용, 칸 안의 `""` = `"` 한 글자. 줄 끝 LF·CRLF 동일. 데이터 행이 헤더보다 짧으면 모자란 칸 = 빈 값, 길면(칸 수 초과) 그 행을 입력 매핑 리포트에 남김. 따옴표가 안 닫히거나 헤더가 비면 사용자에게 알리고 중단 |
| `.md` | 파일의 **첫 번째 GFM 파이프 표**. 헤더 행 → 구분 행(`---`) → 데이터 행. 셀 앞뒤 공백과 양끝 `|` 제거 |
| `.xlsx` | 첫 시트. 아래 `xlsx-read.mjs` 로 읽음 |

`.xlsx` 는 스크립트로 읽음 (node 만 필요, 의존성 0 — zip 해제·XML 해석을 스크립트가 직접):

```bash
node .claude/skills/dflow-wbs/scripts/xlsx-read.mjs {경로}
```

- 첫 시트를 읽어 stdout 에 한 줄 JSON 객체 배열(`[{"헤더": "값", …}, …]`, 들여쓰기 없음) 출력.
  - 첫 행 = 헤더. 모든 셀 값 = 문자열 (숫자 셀도 `<v>` 원문 — `12` → `"12"`). 빈 셀 = `""`.
- **날짜 셀은 일련번호 문자열로 읽힘.** 엑셀 날짜는 숫자 셀이라 서식이 아니라 값이 나옴 (`2026-10-01` → `"46296"`).
  - 일정·날짜 성격 칸에 5자리 안팎 정수 문자열이 오면 `1899-12-30` + 그 일수로 해석 (`"46296"` → `2026-10-01`). 해석한 칸을 입력 매핑 리포트에 남김.
  - 문자열로 입력된 날짜(`'2026-10-01`)는 그대로 읽힘.
  - 불리언 셀 = `"1"`/`"0"`, 오류 셀 = `#N/A` 같은 원문.
- **첫 시트 = 파트 이름 정렬 순.**
  - `xl/worksheets/sheet*` 이름을 코드포인트 순으로 정렬한 첫 번째. `workbook.xml` 시트 순서는 안 봄.
  - 그래서 `sheet1` < `sheet10` < `sheet2`. 사용자가 화면에서 첫 번째로 보는 시트와 다를 수 있음.
  - 시트가 둘 이상이면 어느 시트를 읽었는지 입력 매핑 리포트에 남김.
  - 공유 문자열(sharedStrings)·`inlineStr`·서식 run 이 섞인 셀은 이어 붙여 읽음.
- **`<v/>` 처럼 값이 빈 비문자열 셀 = JSON `null`** (데이터 셀이면 값 `null`, 헤더 셀이면 키 이름 `"null"`).
  - 셀 요소 자체가 없거나 `<v>` 요소가 없는 칸 = 빈 문자열 `""`.
  - `null` 과 `""` 모두 미기재로 취급.
- XLSX 이스케이프 `_xHHHH_`(예: `_x000D_`, 엑셀이 제어 문자 등에 사용)는 읽을 때 원래 글자로 되돌림. 글자 그대로의 `_x0041_` 은 `_x005F_x0041_` 로 저장돼 있음.
- 파일이 깨졌거나(zip 아님·XML 오류·시트 없음) 못 읽으면 종료 코드 1 + stderr 한 줄 사유. 읽기 실패를 "행 없음"으로 위장 안 함 (에러 3원칙).

### 검증 (에러 3원칙 — 실패를 "없음"으로 위장하지 않는다)

**중단하는 것:**
- 필수 3키(`module`·`program_id`·`program_name`) 중 하나라도 헤더 매핑 실패 → 인식한 헤더 목록과 함께 에러 후 중단
- `program_id` 중복 → 중복 ID **전량 나열** 후 중단
- `module` 또는 `program_name` 이 빈 행 → 행 번호와 함께 나열 후 중단

**진행하되 리포트하는 것** (생성물 마지막에 `## 입력 매핑 리포트` 챕터):
- `type` 미기재·미매핑 → `화면` 으로 처리한 목록
- `difficulty` 미기재·미매핑 → `중` 으로 처리한 목록
- `owner` 가 **기재됐는데** email 아님 → 원문과 함께 나열 (`assignee: -` 로 생성됨). 빈 값(미기재)은 나열 안 함
- `depends` 가 없는 `program_id` 를 가리킴 → 나열 후 그 의존만 버림
- `route` 미기재로 파생값을 쓴 목록

### 생성 규칙 — 계층 배치

규모 판정 (프로그램 리스트 모드 전용 — 입력에 기간·팀 정보가 없어 기존 4기준 표를 못 씀):

- **4단계**: 프로그램 수 ≥ 50 **또는** 모듈 수 ≥ 5 **또는** (모듈 수 ≥ 2 **그리고** `group` 컬럼 존재)
- 그 외 **3단계**. `--scale` 있으면 그것이 우선.

| 레벨 | 4단계 | 3단계 |
|---|---|---|
| WP | `## WP-XX: {module}` | `## WP-XX: {module}` |
| ACT | `### ACT-XX-YY: {group}` (`group` 없으면 유형 묶음 — 화면·리포트·배치·인터페이스 순) | — |
| Task | `#### TSK-XX-YY-ZZ: {program_name}` | `### TSK-XX-ZZ: {program_name}` |

- 모듈 순서 = **입력 등장 순서**. 기능 WP = `WP-03` 부터 (`WP-01` 초기화 · `WP-02` 기본설계 예약).
- 4단계에서 각 기능 WP 의 **`ACT-XX-01` = 모듈 계약 ACT 예약** (MES 관례: `docs/MES/wbs.md:452-456`). 기능 ACT = `ACT-XX-02` 부터.
- 번호 부여 전 **기존 wbs.md 의 ID 매핑 복원** (`## D'Flow 연동 표기` 의 ID 불변 규칙).

### 생성 규칙 — 프로그램 1개 = Task 1개 (수직 슬라이스 강제)

**한 프로그램 = 한 Task 안에서 백엔드와 프론트엔드 함께 처리.**
- "OO화면 API" / "OO화면 UI" 로 나눈 Task 금지 — 계약이 흩어져 수정·테스트가 맞물려 실패.
- 프로그램이 너무 크면 layer 로 자르지 말고 **기능 단위로 수직 분할**, 각각을 별도 프로그램 ID 로 입력에 되돌림.

| `type` | `category` | `domain` | `entry-point` |
|---|---|---|---|
| 화면 | `dev` | `fullstack` | 필수 — `{route} (메뉴: {module} > {program_name})` |
| 리포트 | `dev` | `fullstack` | 필수 — 동일 |
| 배치 | `dev` | `backend` | `-` |
| 인터페이스 | `dev` | `backend` | `-` |

`route` 없으면 `/{module}/{program_id 소문자}` 로 파생하고 리포트에 남김.

| `difficulty` | `model` | 기간(영업일) |
|---|---|---|
| 하 (L / low / 1~2) | `sonnet` | 2 |
| 중 (M / medium / 3, 미기재) | `sonnet` | 3 |
| 상 (H / high / 4~5) | `opus` | 5 |

`model` 값 = **시드.** `## Task 분해 원칙` 의 의미 규칙("다중 시스템·아키텍처·보안 핵심 → `opus`")이 여전히 우선.
- 난이도 `중` 이어도 인증·정산·상태기계처럼 판단 비용이 큰 프로그램 → `opus` 로 올림.
- 난이도 `상` 이어도 단순 대량 CRUD → `sonnet` 으로 내림.
- 올리거나 내리면 그 Task `note:` 에 한 줄 근거.

⚠️ **이 기간표가 `## 일정 계산` 의 category 표(dev 기본 10일, 5~15)를 대신함.**
- 그 표 = PRD 유래 기능 Task(여러 프로그램을 아우르는 단위) 기준.
- 프로그램 1개 = 수직 슬라이스에는 `## Task 분해 원칙` 크기 규칙(**권장 1~3일 / 최대 1주**)이 우선.
- 추정은 시드값. 비고·화면 수로 올릴 수 있음. 단 **1주(5영업일) 초과 시 기간을 늘리지 말고 프로그램을 분할.**
- 선행/후행 공정 Task 는 종전대로 `## 일정 계산` 표.

Task 필드 생성값:

- `status: [ ]` · `priority: {priority 또는 high}` · `assignee: {owner 가 email 이면 그 값, 아니면 -}`
- `tags: {module}, {type 영문 슬러그}` — 화면 `ui` · 리포트 `report` · 배치 `batch` · 인터페이스 `interface`
- `prd-ref: program:{program_id}` (필수)
- `note:` = 입력 `note` 있을 때만
- `requirements` / `acceptance` — 프로그램명·유형에서 유도. PRD/TRD 가 함께 주어졌으면 해당 절을 인용해 보강.

### 생성 규칙 — WSF 샌드위치 골격 (PRD/TRD 없이도 동일 생성)

프로그램 리스트에는 TRD 가 없어 `## 실행 플로우` 4단계의 **공유 계약 4종 스캔이 성립 안 함.** 아래 고정 골격이 그 자리를 대신.

**골격과 depends 사슬은 고정** (형태 근거: MES 4단계 wbs.md 실물 depends 일반화). 3단계면 아래 ID 에서 마지막 세그먼트를 하나 뺌.

| Task | category | depends |
|---|---|---|
| WP-01 · 스캐폴드 + DB 연결 + CI | `infra` | `-` |
| WP-02 · 전사 아키텍처·공통 계약 설계 | `design` | 스캐폴드 Task |
| WP-01 · 전사 공유 계약 (계약 전용) | `infra`, `tags: contract` | **전사 아키텍처 설계 Task** |
| WP-01 · 권한 가드 + 공통 레이아웃 셸 | `infra` | 전사 공유 계약 Task |
| WP-02 · `{module} DB(ERD) 설계` (모듈당 1개) | `design` | 전사 아키텍처 설계 Task |
| 기능 WP · `{module} 공유 계약 (계약 전용)` (모듈당 1개) | `infra`, `tags: contract` | 그 모듈의 DB(ERD) 설계 Task, 전사 공유 계약 Task |
| 기능 WP · 프로그램 Task | `dev` | 아래 3항 |
| 마지막 WP · 모듈별 통합 시나리오 (모듈당 1개) | `itest` | 그 모듈 기능 Task 전부 |
| 마지막 WP · 모듈 관통 시나리오 (모듈 ≥ 2 일 때만 1개) | `itest` | 각 모듈의 대표 기능 Task |

- **WP 번호 순서 ≠ depends 순서** — 전사 계약(WP-01)이 전사 설계(WP-02)에 depends 하는 것이 정상. WP 번호 = 성격별 묶음, 실행 순서 = depends.
- 권한 가드·셸 Task = **화면·리포트 유형이 1건이라도 있을 때만** 생성. 없으면 만들지 않고, 기능 Task depends 2항도 생기지 않음.
- **모듈 계약 Task = 모듈 수와 무관하게 항상 생성** — 모듈 1개여도 예외 없음. 전사 계약(공통코드·조직·권한)과 모듈 계약(그 모듈 도메인)은 범위가 다르고, 예외를 두면 사슬이 모듈 수에 따라 갈라짐.
- 기능 Task `depends` = 정확히 셋의 합집합:
  1. 자기 모듈의 계약 Task (항상)
  2. 화면·리포트 유형이면 WP-01 의 셸 Task
  3. 입력 `depends` 가 가리키는 프로그램의 Task ID (존재하는 ID 만 — 나머지는 리포트)

**마지막 WP 통합테스트 = 모듈 수와 무관하게 항상 생성** (부록 §2.6: 샌드위치 골격 동일 생성). `## 전체 구조` 의 "기능 WP 2개 이상이면 필수" 는 PRD 모드 기준. 프로그램 리스트 모드는 무조건 생성으로 강화.

이 사슬의 최장 경로 = **6노드(스캐폴드 → 전사 설계 → 전사 계약 → 셸 → 기능 → itest)** 고정. 기능 구간 내부(모듈 계약 → 기능 → itest)는 3. 초과분 3은 전부 공정 양끝(선행 2 · 후행 1)의 구조 비용. `## 의존 그래프` 챕터에 그 사실 명시.

⚠️ **의존 그래프 구조 예외** — 모듈 계약 Task 의 fan-in 은 그 모듈 프로그램 수만큼 구조적으로 커짐.
- **`fan_in ≥ 3` 계약 추출 재검토 대상에서 제외.** 통합테스트 Task fan-in 제외와 같은 논리임을 `## 의존 그래프` 챕터에 명시.
- 이 예외가 없으면 생성된 WBS 가 매번 자기 리뷰 게이트에 걸림.

### 계약 Task 의 공유 파일 규칙

병렬 기능 Task 가 공유 파일 같은 줄을 서로 다르게 고쳐 개발 브랜치 머지에서 충돌하는 것을 설계 단계에서 막음.
(2026-09-21 mdm-dict-v2: 팀원 8명 중 6건 충돌, 설계 docs/superpowers/specs/2026-09-23-parallel-merge-conflict-design.md §3).
두 모드의 계약 Task 모두 이 절을 따름.

| # | 규칙 |
|---|---|
| C1 | **기능 Task 는 자기 소유 파일만 고친다.** 계약 Task 는 design.md 에 `## 기능 Task 편집 지점` 표(기능 Task → 소유 파일)를 두고, 두 기능 Task 가 같은 파일을 소유하지 않게 한다. 공유 파일은 이 표에 나오지 않아야 한다 |
| C2 | **등록은 자동 수집한다.** 라우트·핸들러·마이그레이션 같은 목록은 디렉터리 스캔(`readdirSync`·glob)이나 파일 이름 관례로 모은다. 기능 Task 가 `server.js`·`routes/index.js` 의 import 블록이나 배열에 줄을 더하지 않게 한다 |
| C3 | **계약 시험은 틀의 존재만 단정한다.** export 가 있다, 시그니처가 맞다, 탑재 순서가 맞다는 단정한다. "라우터가 비어 있다"·"이 함수는 아직 `not implemented` 다" 는 단정하지 않는다 |
| C4 | **스텁 판정은 각 함수의 시험이 스스로 한다.** 계약 Task 는 기능 Task 마다 자기 시험 파일(`tests/routes/<name>.test.*`)을 빈 틀(`it.todo`)로 만들어 둔다. 기능 Task 는 그 파일만 채운다. 공유 목록(`STUBS`·`IMPLEMENTED`)을 두지 않는다 |
| C5 | **계약 문서가 지정한 파일은 계약 Task 가 모두 만든다.** 공용 시험 헬퍼(`tests/helpers/*`)가 대표다 |
| C6 | **횡단 관심사는 계약에서 먼저 연다.** 인증 가드처럼 모든 라우트 동작을 바꾸는 Task 가 있으면, 계약 Task 가 시험 헬퍼에 가드 헤더를 처음부터 싣거나 그 Task 를 기능 Task 들의 선행으로 건다 |
| C7 | 공유 파일을 **먼저 들어온 쪽이 새 규약으로 바꾸지 않는다.** 규약이 필요하면 계약 Task 가 처음부터 정한다 |

C1·C4 = 강제 진행 설계(`2026-09-23-force-progress-design.md`) §3.4 1번과 같은 방향. 그쪽은 스텁을 둘 **자리**, 이 절은 계약 Task 가 만드는 **시험·등록 구조**.

**생성 산출물에 싣는다.** 계약 Task 구현 워커는 이 스킬을 안 읽음. 규칙이 Task 본문에 있어야 워커에게 닿음.
`tags: contract` Task 의 `acceptance` 끝에 아래 네 줄을 고정으로 붙임 (PRD·프로그램 리스트 모드 공통).
```
- 공유 시험은 틀의 존재·탑재 순서만 단정한다. 빈 라우터·스텁 목록(`STUBS` 등)을 단정하지 않는다
- 기능 Task 마다 자기 시험 파일과 소유 파일을 design.md `## 기능 Task 편집 지점` 에 적고, 두 Task 가 한 파일을 나눠 갖지 않는다
- 등록(라우트·핸들러 목록)은 자동 수집이며 기능 Task 가 공유 진입점에 줄을 더하지 않아도 된다
- 계약 문서가 지정한 파일(공용 시험 헬퍼 포함)이 모두 있다
```
기능 Task(`category: dev`) `requirements` 끝에 한 줄 붙임.
```
- 계약 Task design.md 「기능 Task 편집 지점」 의 자기 소유 파일만 고친다
```
명세 블록 파싱 계약(필드 줄 열 0, bullet 2칸 들여쓰기)을 그대로 따름.

## 엑셀 export (`--export-xlsx`) — 보고본

정본 = `wbs.md`. xlsx = **읽기 전용 파생 산출물.** 다시 wbs.md 로 되돌리지 않음 (부록 §2.6 — 바이너리는 diff·병합·검수 불가).

**용도 = "import 전 사람 검수" 하나.**
- wbs.md 는 import 후 은퇴 → wbs.md 기준 엑셀은 import 시점 스냅샷이고 곧 낡음.
- 운영·대외 보고본 = D'Flow export (DB 기준).
- 검수 결과 수정 = **입력 프로그램 리스트나 wbs.md 를 고쳐 재생성.** 엑셀을 고치지 않음.

### 데이터 출처 — wbs.md 를 직접 파싱하지 않는다

실행 중 Task 는 `docs/tasks/<ID>/state.json` 이 진실 원천, wbs.md 는 파생 사본 (부록 §7.1-F2). 따라서:

1. `node .claude/skills/dflow-export/scripts/wbs-parse.mjs {wbs} --tasks-all` 로 **Task ID 목록** 획득 (이 모드는 `tsk_id`·`title`·`status`·`depends`·`domain`·`category` 6필드만 냄).
2. 각 ID 에 `node .claude/skills/dflow-export/scripts/wbs-parse.mjs {wbs} {TSK_ID} --json` 호출로 **나머지 필드** 획득 — `model`·`priority`·`assignee`·`schedule`·`tags`·`blocked-by`·`note`·`entry-point`·`prd-ref`. N회 호출 = 부록 §2.6 이 DEV-02 전 과도기로 명시한 방식 그대로.
3. **WP/ACT 행 제목만** wbs.md 헤딩 정규식(`^##\s+(WP-\d+):\s*(.*)` · `^###\s+(ACT-\d+-\d+):\s*(.*)`)으로 읽음.
   - 파서가 계층 노드를 안 내서 (부록 §7.1-F5). **헤딩은 구조라 진실 원천 문제 없음.** 그 블록 필드는 안 읽음.
4. **부모 귀속 = ID 세그먼트로 유도** — 파서가 계층을 안 내므로 유일한 연결 고리 (`## D'Flow 연동 표기` ID 불변 규칙이 기대는 것과 같은 규칙).
   - 4단계: `TSK-03-02-01` → `ACT-03-02` → `WP-03`
   - 3단계: `TSK-03-03` → `WP-03` (ACT 행 없음)
   - 유도한 부모 ID 가 3단계에서 읽은 헤딩 목록에 없으면 **그 Task 를 버리지 않고** 부모 없이 쓰고 리포트에 나열.

⚠️ `status` 는 어떤 경우에도 wbs.md 텍스트에서 읽지 않음 — 1·2단계 파서 출력만 사용.
- DEV-02(`--export`)는 `/dflow-export` 스킬에 구현돼 있고 이 스킬도 같은 `wbs-parse.mjs` 를 쓰지만, **위 N회 호출 절차는 유지.**
- 이유: `--export` 노드는 D'Flow `stage` 코드(`as|fp|ip|im|xx`·`null`)만 싣고 로컬 상태 코드(`[dd]`·`[ts]` 등)·`note`·`blocked-by` 가 없어, 7·8·17·18번 컬럼(상태 코드·라벨·진척 환산·note)을 못 채움.
- (WP/ACT 제목·부모만 `--export` 로 얻는 변형은 가능하나 이 절차 의미를 바꾸지 않으려고 적용 안 함.)

### 컬럼

| # | 컬럼 | 출처 |
|---|---|---|
| 1 | 레벨 (`WP`/`ACT`/`TSK`) | 행 종류 |
| 2 | ID | 헤딩 ID (= D'Flow `external_ref`) |
| 3 | 제목 | 헤딩 |
| 4 | category | `--json` |
| 5 | domain | `--json` |
| 6 | model | `--json` |
| 7 | 상태 코드 | `--tasks-all` 의 `status` (예: `[ ]`) |
| 8 | 상태 | `docs/state-machine.json` 의 `states[코드].label` — **하드코딩 금지, 그 파일에서 읽는다** |
| 9 | 담당 | `--json` 의 `assignee` |
| 10 | 시작일 | `schedule` 의 ` ~ ` 앞 |
| 11 | 종료일 | `schedule` 의 ` ~ ` 뒤 |
| 12 | 영업일 | 시작~종료 영업일 수 (주말 제외) — 숫자 |
| 13 | depends | `--json` |
| 14 | entry-point | `--json` |
| 15 | prd-ref | `--json` |
| 16 | tags | `--json` |
| 17 | 진척(파생) | `docs/state-machine.json` 의 `progress` 블록으로 환산 — 숫자 |
| 18 | note | `--json` |

- **17번 = 파생값.**
  - `category` 가 `progress.agile.applies_to` 에 있으면 `progress.agile.state_weights[상태코드]`.
  - `progress.process.applies_to` 에 있으면 `progress.process` 규칙(`pre_accept_cap` 포함) 적용.
  - **환산표를 스킬·스크립트에 하드코딩 금지** — `state-machine.json` 의 `progress._comment` 가 금지.
- **`docs/state-machine.json` 이 대상 리포에 없으면** 8번 = 상태 코드 그대로, 17번 = `[ ]` = 0 으로 둠. 리포트에 그 사실을 남김 (import 전 검수용 스냅샷은 전 Task `[ ]` 라 실질 손실 없음).
- WP/ACT 행:
  - 4~6·9·13~16·18 = 비움.
  - 10·11 = **위 4단계로 귀속된 하위 Task** 의 최소 시작일·최대 종료일.
  - 12·17 = 그 하위 집합에 `progress.rollup` 규칙(영업일 가중 평균) 적용.
  - 하위가 하나도 없는 WP/ACT = 10~12·17 비우고 리포트에 나열.
- **실적%·진행률을 사람이 입력하는 컬럼 만들지 않음.**
- **1행 = 헤더 고정** (도구 호환 — 위에 주석 행 금지). 디스클레이머 = **마지막 데이터 행 다음 한 줄** A열:
  `import 전 검수용이다 — wbs.md 기준이며 D'Flow 실적·배정은 반영되지 않는다. 운영 보고본은 D'Flow export 를 쓴다. 이 파일을 고쳐도 정본에 반영되지 않는다.`

### 쓰기 — 의존성 0

행 배열을 JSON 으로 만들어 스크립트에 넘김 (node 만 필요, 의존성 0 — zip 은 스크립트가 직접 씀):

```bash
node .claude/skills/dflow-wbs/scripts/xlsx-write.mjs --out {경로} < rows.json
```

- 입력 `rows.json` = 행 배열 `[[헤더…], [셀…], …]` (첫 행 = 헤더). 셀 = 문자열 또는 숫자. 파일 경로 인자도 가능 (`… --out {경로} rows.json`). 숫자(12·17번 컬럼)는 JSON 숫자로.
- 문자열 셀 = `t="s"`(sharedStrings), 숫자 셀 = `t` 속성 없이. 공유 문자열 중복은 하나로 합침. 출력 경로 부모 폴더가 없으면 만들고, 파일이 있으면 덮어씀.
- **열 최대 26개(A~Z).** 이 문서 표는 18열이라 충분. 27열 이상이면 종료 코드 1 + 짧은 stderr. 입력 JSON 이 잘못돼도 종료 코드 1, 파일은 안 만듦.

XML 이스케이프(`&`·`<`·`>`·`"`·`'`)는 스크립트가 처리 — Task 제목에 `&`·`<` 가 있어도 XML 안 깨짐.
- XML 이 문자로 허용 안 하는 제어 문자(`0x00~0x08`·`0x0B`·`0x0C`·`0x0E~0x1F`)·`U+FFFE`·`U+FFFF`·짝 없는 서로게이트 = XLSX 관례 `_xHHHH_`(대문자 16진 4자리)로 인코딩.
- 원문의 `_x0041_` 같은 글자는 `_x005F_x0041_` 로 밑줄 이스케이프. `xlsx-read.mjs` 가 읽을 때 되돌림.
- 엑셀은 이 표기를 원래 글자로 열고, 일부 뷰어는 표기 그대로 보임.
- 이 스크립트는 파일이 어느 엑셀·뷰어에서나 열린다고 보장 안 함. 확인한 것 = XML 해석 가능성과 이 저장소 읽기 스크립트로의 왕복뿐 (엑셀 실물 열기 시험 안 함).
- 서식(열 너비·틀 고정·색)은 이 절 범위 밖.

### 순서와 실패 처리

- 행 순서 = wbs.md 등장 순서 그대로 — WP → (ACT) → 그 하위 Task.
- `--json` 호출이 실패한 Task 는 **건너뛰지 않음.** 그 행을 쓰되 실패한 컬럼을 비우고, 생성 리포트에 ID 와 함께 나열 (에러 3원칙: 조회 실패를 "데이터 없음"으로 위장 안 함).
- 출력 경로에 파일이 이미 있으면 덮어씀. 정본이 아니므로 백업 안 함.

## Task 분해 원칙

- UI 있는 기능 = 화면+API+전용 DB 를 **하나의 `fullstack` Task** (layer 수평 분할 금지, 큰 화면은 수직 분할). `entry-point` 필수.
  프로그램 리스트 모드에서는 이 원칙이 **프로그램 1개 = Task 1개**로 구체화 (`## 프로그램 리스트 입력 어댑터`).
- 순수 백엔드 = `backend` 단독, `entry-point: -`.
- 크기: 최소 4시간 / 권장 1~3일 / 최대 1주.
- `model` 필드: 다중 시스템·아키텍처·보안 핵심 → `opus`, 표준 패턴 → `sonnet`. 명시 권장 (생략 시 `wbs-parse.mjs --complexity` fallback).

## 일정 계산

| category | 기본 | 범위 |
|----------|------|------|
| dev | 10일 | 5~15 |
| defect | 3일 | 2~5 |
| infra | 5일 | 2~10 |
| design | 5일 | 3~7 |
| research | 3일 | 2~5 |
| itest | 5일 | 3~10 |

depends 기반 시작/종료일 산출. 산출 후 FS+겹침 검증식 통과 확인.

⚠️ 위 표 = **PRD 유래 기능 Task** 기준. 프로그램 리스트 모드 기능 Task 는 난이도 기반 기간표(하 2 / 중 3 / 상 5 영업일) 사용 — 근거는 `## 프로그램 리스트 입력 어댑터`. 선행·후행 공정 Task 는 모드 무관하게 이 표 사용.

## Dev Config

`# WBS` 메타 블록 아래 `---` 직후, 첫 `## WP-` 앞에 정확히 한 번.
골격은 플러그인 템플릿 참조: `.claude/skills/dflow-wbs/references/dev-config-template.md` 를 Read 후 채움. (경로 실재 확인됨)

- **PRD 모드**: TRD 로 채움.
- **프로그램 리스트 모드**: TRD 없어도 **템플릿 골격을 반드시 생성** — 이 블록이 없으면 `wbs-parse.mjs --dev-config` 와 `wbs-validate.mjs` 가 안 돎.
  - `Domains` 표 행 = **실제 생성된 Task 의 domain 집합만** 남김 (`fullstack`·`backend` + 공정 Task 의 `database`·`infra`·`test`).
  - `Quality Commands`·`Design Guidance` = 템플릿 기본값 그대로. PRD/TRD 가 함께 주어졌으면 그 내용으로 덮음.
  - 추측으로 명령어를 지어내지 않음 — 모르는 칸은 템플릿 기본값이 정답.

## 실행 플로우

1. **VIEW_MODE** 면 파일 전체 표시 후 종료. `--export-xlsx` 가 함께 오면 표시 후 14번(엑셀 보고본 생성)만 실행하고 종료 — 2~13번 건너뜀.
2. 대상 리포 `docs/wbs-workflow.md` 있으면 Read (규칙 로드).
3. 입력 분석·규모 산정 (`--estimate-only` 면 여기서 종료).
   - PRD 모드: PRD/TRD 분석 → 기존 규모 판별 4기준.
   - 프로그램 리스트 모드: `--programs` 파일 로드 → 정규화 → **검증(중단 조건 먼저)** → 프로그램 수·모듈 수·`group` 유무로 규모 판정. PRD/TRD 있으면 함께 읽어 컨텍스트로만 사용.
4. 계약 Task 목록 확정.
   - PRD 모드: 공유 계약 사전 분석 (TRD 4종 스캔).
   - 프로그램 리스트 모드: 고정 골격 — 전사 계약 1개 + 모듈당 계약 1개(모듈 수 무관). TRD 없으므로 4종 스캔 실행 안 함.
5. WP 매핑 (샌드위치): WP-01 → WP-02(설계, DB 분리) → 기능 WP → 통합 WP.
6. (4단계만) ACT 분해 — MECE, 1~4주.
7. Task 분해 + category/domain/model + PRD/TRD 컨텍스트 주입 (requirements/acceptance/tech-spec 등 자기 완결).
8. 일정 계산 + FS+겹침 검증.
9. `{DOCS_DIR}/wbs.md` 생성.
10. 의존 그래프 검증:
    ```bash
    node .claude/skills/dflow-export/scripts/wbs-parse.mjs {DOCS_DIR}/wbs.md --tasks-all > {scratchpad}/tasks.json
    node .claude/skills/dflow-export/scripts/dep-analysis.mjs {scratchpad}/tasks.json --graph-stats
    ```
    - `max_chain_depth > 3`(기능 구간 내부 기준, 공정 양끝 +2 는 구조 비용 허용) 또는 `fan_in ≥ 3` → 계약 추출 재검토.
    - 결과를 `## 의존 그래프` 챕터에 기록 (후보 없어도 "후보 없음" 명시).
    - 같은 자리에서 확인 (자기 리뷰 게이트):
      - 계약 Task(`tags: contract`)마다 acceptance 에 「계약 Task 의 공유 파일 규칙」 고정 네 줄 있음.
      - 기능 Task(`dev`)마다 requirements 에 편집 지점 한 줄 있음.
      - 빠졌으면 고친 뒤 다시 검증.
11. (프로그램 리스트 모드) **`## 입력 매핑 리포트` 챕터 작성** — `## 의존 그래프` 챕터 **앞**에 배치.
    - 다섯 표 전부 작성: 유형 미매핑 · 난이도 미매핑 · 담당 미매칭 · depends 미해결 · route 파생.
    - 해당 없는 표 = "해당 없음" 명시. 비워두지 않음.
12. 출력 검증.
    - `node .claude/skills/dflow-export/scripts/wbs-validate.mjs validate …` 실행 (`### 출력 검증` 절 명령).
    - **4단계**: `wbs-validate.mjs` 는 4단계도 읽음 (`#{3,5}` 헤딩).
      - `task_count` = 생성한 Task 건수인지 확인.
      - 다르면 `wbs-parse.mjs --tasks-all` 로 Task 건수·`category`·`domain`·`entry-point` 직접 대조.
      - 생성 리포트에 "4단계 — merge-wbs-status 는 3단계만 인식(외부 스크립트, DEV-03 대기)" 출력.
13. **`.dflow`·`.dflow.local` 바인딩 확인** — `## D'Flow 연동 표기` 의 프로젝트 바인딩 절 그대로.
    - 키 유무만 보고 (값 출력 금지).
    - 해석 결과(업로드 가능 / `업로드 불가 — .dflow 에 project_id 또는 .dflow.local 에 project_map 필요`)를 생성 리포트에 남김.
    - 없어도 생성은 정상 완료 (fail-closed 는 업로드에만).
    - **실제 업로드는 이 스킬이 안 함 — `/dflow-export` 스킬 담당** (검증 게이트 → `--export` → 봉투 조립 → dry-run/`--push`). 리포트에 다음 단계로 안내.
14. (`--export-xlsx` 있을 때) **엑셀 보고본 생성** — `## 엑셀 export` 절 그대로. 실패해도 wbs.md 생성 결과를 되돌리지 않고, 실패 사유를 리포트에 남김.

**생성 리포트** — 실행 종료 시 사용자에게 출력하는 요약 (별도 파일 아님 — 파일 산출물 = wbs.md 와 xlsx 뿐). 반드시 담을 것:
- 규모 판정(3/4단계)과 근거
- 검증 스크립트 실행 결과 요약
- 4단계면 "wbs-validate·merge-wbs-status 무력화(DEV-03 대기)" 경고
- 담당 미매칭 요약
- `.dflow`·`.dflow.local` 바인딩 상태 ("설정됨/없음"만 — 값 금지)
- export 결과 (해당 시)

## 출력 형식 (요약)

> 상세 정본 = 동봉 발췌본 `.claude/skills/dflow-wbs/references/output-format.md`.
> - 내용: Task 속성 목록·리스트 필드 파싱 규칙, `#### PRD 요구사항`/`#### 기술 스펙 (TRD)` 블록 형식, 통합테스트 Task 형식, `## 의존 그래프` 챕터 형식(Mermaid·통계표·리뷰 후보).
> - **출력 형식을 쓰기 전에 그 파일을 Read.**
> - 플러그인 원본(dev:wbs-wsf)은 더 이상 참조 안 함. 상태 어휘(5상태)·category 표기(`development` 등)가 낡아, 발췌 시점에 이 스킬 규칙(상태 항상 `[ ]`·7종 약어)으로 치환해 둠.

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

### 명세 블록 파싱 계약 (export v2 가 읽는 문법 — 어기면 조용히 유실된다)

`requirements`·`acceptance`·`test-criteria`·`constraints`·`tech-spec`·`api-spec`·`data-model`·`ui-spec`·`prd-ref` 는 `#### PRD 요구사항` / `#### 기술 스펙 (TRD)` 블록 관례를 **유지** (사람이 읽는 구획).
파서는 그 헤딩을 안 보고 **필드 줄만** 스캔하므로, 아래 넷이 실제 계약.

| # | 규칙 | 근거 | 어겼을 때 |
|---|---|---|---|
| 1 | **명세 블록 헤딩은 TSK 헤딩보다 반드시 한 단계 이상 깊다** — 3단계(`### TSK-`)면 `####`, 4단계(`#### TSK-`)면 `#####` | `wbs-parse.mjs` `extract_task_block` — 헤딩 깊이 `hl >= 2 && hl <= level` 에서 블록이 끝난다 (같거나 얕은 헤딩. 펜스 코드 블록 안의 Task 가 아닌 헤딩은 무시하지만 Task 헤딩은 항상 닫는다) | **Task 블록이 명세 앞에서 잘려 전 필드가 통째로 유실**. 4단계에 `#### PRD 요구사항` 을 쓰는 것이 이 사고의 전형 |
| 2 | **필드 줄은 열 0에서 시작한다** — `- requirements:` (앞 공백 금지) | `wbs-parse.mjs` `get_field` — 줄이 `- {field}:` 로 시작해야 한다 (`startsWith`) | 그 필드만 빈 값이 된다 |
| 3 | **bullet 항목은 정확히 2칸 들여쓴다** — `  - 항목` | `parse_list_field` 의 bullet 형태(`  - ` 2칸 들여쓰기로 시작하는 줄만 항목) | 항목이 안 잡히거나 앞 항목에 붙는다 |
| 4 | **빈 리스트는 생략하지 말고 `- field: -` 로 명시한다** | 같은 함수의 `-` 처리 | 필드 부재와 "비었음"이 구별되지 않는다 |

단일행 필드(`category`·`domain`·`model`·`status`·`priority`·`assignee`·`schedule`·`tags`·`depends`·`entry-point`·`prd-ref`·`note`)는 값에 콤마가 있어도 분할 안 됨. 리스트 성격 값은 반드시 리스트 필드로 선언.

**4단계 생성 시 명세 블록 헤딩이 `#####` 인지 생성 직후 반드시 확인** (규칙 1 — 이 스킬이 만드는 가장 비싼 조용한 실패).

- WP 레벨에 status/priority/progress 금지 (Task 집계로 파생).
- 의존 그래프 노드 표기: 3단계 4자리 `0001.`, 4단계 6자리 `000101.`.
- 진척율·실적은 입력 안 함 — import 후 진척·실적 정본 = D'Flow. 재업로드해도 웹 값 보존.

## 성공 기준

- PRD 전 기능 Task 커버, Task 1일~1주, prd-ref 추적성, 자기 완결성
- fullstack/frontend Task `entry-point` 필수 (orphan page 방지)
- 공유 계약 전부 선행 분리 + 계약 전용 관례 준수 (tags: contract)
- DB(ERD) 설계가 그룹 설계에서 분리되어 있음 (계약 파이프라인)
- depends 전부 FS + 겹침 검증식 통과
- 기능 구간 내부 `max_chain_depth ≤ 3` (공정 양끝 +2 허용, 예외는 근거 명시)
- 기능 WP 2+ 면 마지막 WP = 통합테스트, depends 는 기능 체인 말단 (프로그램 리스트 모드는 기능 WP 1개여도 필수)
- 모든 Task `status: [ ]`, ID 숫자만
- **재생성 시 기존 Task/WP/ACT ID 보존** — ID = D'Flow `external_ref` 매칭 키 (`## D'Flow 연동 표기`)

**프로그램 리스트 모드 추가 기준:**

- 입력 프로그램 수 = 생성된 **기능 Task 수** (1:1). 한 프로그램이 2개 Task 로 쪼개지지 않음
- 모든 기능 Task `domain` = `fullstack` 또는 `backend` — "API"/"UI" 로 나뉜 Task 0건
- 모든 기능 Task 가 `prd-ref: program:{program_id}` 를 갖고, 그 값이 중복 없이 입력 ID 집합과 일치
- `assignee` = email 또는 `-` — 이름 문자열 Task 0건
- `## 입력 매핑 리포트` 챕터 존재 + 다섯 표 모두 채워짐 (해당 없으면 "해당 없음")
- 모듈 계약 Task 가 모듈마다 1개씩 존재하고, 기능 Task 전부 자기 모듈 계약 Task 에 depends

**명세 블록 파싱 계약 (import 유실 방지):**

- 4단계면 명세 블록 헤딩 `#####`, 3단계면 `####` — TSK 헤딩보다 반드시 깊음
- 명세 필드 줄 전부 열 0 시작, bullet 항목은 2칸 들여쓰기
- 빈 리스트가 생략되지 않고 `- field: -` 로 명시됨

**`--export-xlsx` 사용 시:**

- 엑셀 행 수 = WP 수 + ACT 수 + Task 수 (헤더·주석 행 제외)
- 상태 라벨·진척 환산이 `docs/state-machine.json` 에서 읽은 값이고 스킬에 하드코딩 안 됨 (파일이 없으면 상태 코드 그대로 + 진척 0 + 리포트)
- 사람이 실적%를 입력하는 컬럼 없음
