---
name: dflow-wbs
description: PRD/TRD 또는 프로그램 리스트(json/yaml/csv/md/xlsx)로 WBS 를 Water-Scrum-Fall 샌드위치 구조로 생성한다. 선행 공정(초기화·기본설계) → 애자일 기능 Task → 후행 통합테스트. 프로그램 1개 = fullstack Task 1개(수직 슬라이스). category 7종(dev/defect/infra/feat/design/research/itest). 생성 상태는 항상 [ ] — 상태 전이는 D'Flow(stage)가 정본이며 wbs.md 는 /wbs/import 부트스트랩용이다. 사용법 /dflow-wbs [SUBPROJECT | /absolute/path/to/wbs.md] [--programs 경로] [--scale large|medium] [--start-date YYYY-MM-DD] [--estimate-only] [--export-xlsx [경로]]
---

# /dflow-wbs - PRD/TRD·프로그램 리스트 기반 WBS 생성 (Water-Scrum-Fall)

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> 상대 경로 = 리포 루트 cwd 전제, node 18.17+.
> - 구조·경계·게이트 규칙 정본 = 대상 리포 `docs/wbs-workflow.md`. 있으면 생성 전 Read. 이 파일과 다르면 그 문서 우선.
> - **상태·전이·배정·진척 정본 = D'Flow.** 이 스킬은 상태를 `[ ]` 로만 생성.
> - wbs.md = 최초 작성·사람 검수·`POST /api/v1/wbs/import` 부트스트랩 전용. import 후 실행 상태는 D'Flow DB 에서 읽음.

## 참조 — references/ Read 시점

| 문서 | 읽는 때 |
|---|---|
| program-list-adapter.md | `--programs` 있을 때 |
| contract-shared-file-rules.md | `tags: contract` Task 를 만들거나 기능 Task 의 requirements/acceptance 를 쓸 때. |
| dflow-integration.md | Task 를 쓸 때(`assignee`·`prd-ref`)와 13번 바인딩 확인 때 (사실상 매번) |
| output-format.md | wbs.md 를 쓰기 전 |
| xlsx-export.md | `--export-xlsx` 있을 때 (14번) |
| success-criteria.md | 12번 출력 검증 뒤 자기 검수 때 |
| toolchain-constraints.md | `task_count` 불일치·0 일 때, 4단계(ACT) 생성 시, 진행 중 WBS 를 `dep-analysis` 로 재분석할 때 |
| environment-notes.md | 스크립트 import 오류·`decisions.md` 기록 실패·다른 PC 이식 때 |
| dev-config-template.md | `## Dev Config` 블록을 채울 때 |

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
  - **VIEW_MODE 에서도 동작.** 주 용도 = 기존 WBS 를 재생성 없이 엑셀로만 뽑기.

## 입력 파일 — 모드 두 개

| 모드 | 조건 | 입력 |
|---|---|---|
| **PRD 모드** (기본) | `--programs` 없음 | `{DOCS_DIR}/PRD.md`, `{DOCS_DIR}/TRD.md` — 둘 다 없으면 에러 후 중단 |
| **프로그램 리스트 모드** | `--programs {경로}` 있음 | 그 파일. PRD/TRD 는 **선택** — 있으면 함께 읽어 requirements·tech-spec 보강, 없어도 중단 안 함 |

프로그램 리스트 모드 상세 = 참조 표의 program-list-adapter.md.

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

→ references/toolchain-constraints.md (참조 표 참고).
> **4단계(ACT) 생성 시:**
> - `wbs-validate.mjs` 결과 `task_count` = 생성한 Task 건수인지 확인.
> - 다르면 헤딩 못 읽은 것. `wbs-parse.mjs --tasks-all` 로 건수·`category`·`domain`·`entry-point` 직접 대조.
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

- 화살표 = 개념 순서. 실제 진행은 게이트 충족 시 구간 겹칠 수 있음.
- **선행/기능 경계**: "2개 이상 기능이 공유하거나, 바꾸면 migration 필요한 것"만 선행.
- **선행 설계는 얇게**: 핵심 엔티티·관계까지만. column 상세는 기능 Task 에 위임.
- **DB(ERD) 설계는 그룹 설계에서 분리해 작게 뗌** — 계약 파이프라인이라서 (계약 Task 의 유일한 선행 = DB 설계).
  - DB 설계가 큰 그룹 설계에 묶이면 계약 동결이 그룹 전체 완료까지 대기.
- **후행/기능 경계**: 기능 Task = 자기 기능 E2E 까지. 통합 WP = 기능 **간** 흐름·성능·permission 교차·이관 리허설만.
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
- **예외**: 모듈 경계 명확한 다모듈 시스템은 규모 미달이어도 ACT 허용 (MES 샘플).

| 레벨 | 4단계 | 3단계 |
|------|-------|-------|
| WP | `## WP-XX:` | `## WP-XX:` |
| ACT | `### ACT-XX-XX:` | — |
| TSK | `#### TSK-XX-XX-XX:` | `### TSK-XX-XX:` |

- **모든 레벨 번호 `01` 부터** — `WP-01` · `ACT-XX-01` · `TSK-XX-01`. `00` 은 어느 세그먼트에도 안 씀.
  - 예외: 이미 import 된 wbs.md 가 `WP-00` 으로 시작하면 그대로 둠 (재번호매김 = 중복 행).
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

- **WBS 생성 시 모든 Task `status: [ ]`** — 담당자를 알아도 동일.
- `[as]` 같은 진행 상태를 파일에 직접 쓰면 로컬 툴체인도 거부 (`wbs-transition.py:353` — `unknown status in wbs.md`).
- 진행 중 WBS 를 `dep-analysis` 로 재분석하면 `--docs-dir {DOCS_DIR}` 필수 (근거: references/toolchain-constraints.md 끝).
- `assignee` = **입력이 email 을 줄 때만** 그 값. 그 외 `-` (규칙: `## D'Flow 연동 표기` 절).

## D'Flow 연동 표기 (정본: 부록 §2.5·§2.6·§7.2)

→ references/dflow-integration.md 요지:
- 헤딩 ID = import 매칭 키 → 재번호매김 금지.
- import 성공 후 wbs.md 재생성 금지.
- 사라진 ID 재사용·중간 삽입으로 번호 밀기 금지.
- wbs.md 에 `project_id`·UUID·branch·worktree 경로·`item_owners`·실적% 넣지 않음.
- `.dflow`·`.dflow.local` 은 생성·수정 금지, 값 출력 금지.

## depends 규칙 (정본: wbs-workflow.md §2)

- **FS(Finish-to-Start)만 사용.** SS 등 다른 유형 없음.
- **FS 의존과 일정 겹침 공존 금지** — 검증식: depends 있는 쌍은 `후행 시작일 > 선행 종료일`.
  - 겹치게 계획했으면 의존 제거 또는 일정 밀기.
- fast-tracking = **계약 분리**로 표현: 계획 단계 = 일정 겹침(비의존), 실행 단계 = 계약 동결(contract Task).
- 개발 Task 는 설계 Task 가 아니라 **계약 Task** 에 depends (설계는 전이적 게이트).

**계약 전용 Task 관례** → references/contract-shared-file-rules.md §계약 전용 Task 관례
**공유 계약 사전 분석 (Task 분해 전 필수)**:
1. TRD 4종 스캔 (data-model / API / 타입·스키마 / 이벤트).
2. "2개 이상 feature 참조?"
3. 예 → 계약 전용 Task 선행 분리, feature 들이 depends 연결.
4. 1개 전용 → 수직 슬라이스로 흡수.

## 프로그램 리스트 입력 어댑터 (정본: 부록 §2.6 · DEV-04)

→ references/program-list-adapter.md (참조 표 참고)

### 계약 Task 의 공유 파일 규칙

→ references/contract-shared-file-rules.md (참조 표 참고)

## 엑셀 export (`--export-xlsx`) — 보고본

→ references/xlsx-export.md (참조 표 참고)

## Task 분해 원칙

- UI 있는 기능 = screen+API+전용 DB 를 **하나의 `fullstack` Task** (layer 수평 분할 금지, 큰 screen 은 수직 분할). `entry-point` 필수.
  프로그램 리스트 모드에서는 이 원칙이 **프로그램 1개 = Task 1개**로 구체화 (`## 프로그램 리스트 입력 어댑터`).
- 순수 백엔드 = `backend` 단독, `entry-point: -`.
- 크기: 최소 4시간 / 권장 1-3일 / 최대 1주.
- `model` 필드: 다중 시스템·아키텍처·보안 핵심 → `opus`, 표준 패턴 → `sonnet`. 명시 권장 (생략 시 `wbs-parse.mjs --complexity` fallback).

## 일정 계산

| category | 기본 | 범위 |
|----------|------|------|
| dev | 10일 | 5-15 |
| defect | 3일 | 2-5 |
| infra | 5일 | 2-10 |
| design | 5일 | 3-7 |
| research | 3일 | 2-5 |
| itest | 5일 | 3-10 |

depends 기반 시작/종료일 산출. 산출 후 FS+겹침 검증식 통과 확인.

⚠️ 위 표 = **PRD 유래 기능 Task** 기준.
- 프로그램 리스트 모드 기능 Task = 난이도 기반 기간표(하 2 / 중 3 / 상 5 영업일) 사용. 근거 = `## 프로그램 리스트 입력 어댑터`.
- 선행·후행 공정 Task = 모드 무관하게 이 표 사용.

## Dev Config

`# WBS` 메타 블록 아래 `---` 직후, 첫 `## WP-` 앞에 정확히 한 번.
골격 = 플러그인 템플릿: `.claude/skills/dflow-wbs/references/dev-config-template.md` Read 후 채움. (경로 실재 확인됨)

- **PRD 모드**: TRD 로 채움.
- **프로그램 리스트 모드**: TRD 없어도 **템플릿 골격 반드시 생성** — 이 블록 없으면 `wbs-parse.mjs --dev-config` 와 `wbs-validate.mjs` 가 안 돎.
  - `Domains` 표 행 = **실제 생성된 Task 의 domain 집합만** 남김 (`fullstack`·`backend` + 공정 Task 의 `database`·`infra`·`test`).
  - `Quality Commands`·`Design Guidance` = 템플릿 기본값 그대로. PRD/TRD 함께 주어졌으면 그 내용으로 덮음.
  - 추측으로 명령어 지어내지 않음 — 모르는 칸 = 템플릿 기본값.

## 실행 플로우

1. **VIEW_MODE** 면 파일 전체 표시 후 종료.
   - `--export-xlsx` 함께 오면 표시 후 14번(엑셀 보고본 생성)만 실행하고 종료. 2-13번 건너뜀.
2. 대상 리포 `docs/wbs-workflow.md` 있으면 Read (규칙 로드).
3. 입력 분석·규모 산정 (`--estimate-only` 면 여기서 종료).
   - PRD 모드: PRD/TRD 분석 → 기존 규모 판별 4기준.
   - 프로그램 리스트 모드: `--programs` 파일 로드 → 정규화 → **검증(중단 조건 먼저)** → 프로그램 수·모듈 수·`group` 유무로 규모 판정. PRD/TRD 있으면 함께 읽어 컨텍스트로만 사용.
4. 계약 Task 목록 확정.
   - PRD 모드: 공유 계약 사전 분석 (TRD 4종 스캔).
   - 프로그램 리스트 모드: 고정 골격 — 전사 계약 1개 + 모듈당 계약 1개(모듈 수 무관). TRD 없으므로 4종 스캔 실행 안 함.
5. WP 매핑 (샌드위치): WP-01 → WP-02(설계, DB 분리) → 기능 WP → 통합 WP.
6. (4단계만) ACT 분해 — MECE, 1-4주.
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
    - 4단계면 `### 출력 검증` 의 「4단계(ACT) 생성 시」 절차(task_count 대조·`wbs-parse.mjs --tasks-all` 직접 대조·리포트 경고 한 줄) 따름. `wbs-validate.mjs` 는 4단계도 읽음(`#{3,5}` 헤딩).
13. **`.dflow`·`.dflow.local` 바인딩 확인** — `## D'Flow 연동 표기` 의 프로젝트 바인딩 절 그대로.
    - 키 유무만 보고 (값 출력 금지).
    - 해석 결과(업로드 가능 / `업로드 불가 — .dflow 에 project_id 또는 .dflow.local 에 project_map 필요`)를 생성 리포트에 남김.
    - 없어도 생성 정상 완료 (fail-closed 는 업로드에만).
    - **실제 업로드는 이 스킬이 안 함 — `/dflow-export` 스킬 담당** (검증 게이트 → `--export` → 봉투 조립 → dry-run/`--push`). 리포트에 다음 단계로 안내.
14. (`--export-xlsx` 있을 때) **엑셀 보고본 생성** — `## 엑셀 export` 절 그대로. 실패해도 wbs.md 생성 결과 되돌리지 않음. 실패 사유를 리포트에 남김.

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
> - **출력 형식을 쓰기 전에 그 파일 Read.**
> - 플러그인 원본(dev:wbs-wsf)은 더 이상 참조 안 함. 상태 어휘(5상태)·category 표기(`development` 등)가 낡아, 발췌 시점에 이 스킬 규칙(상태 항상 `[ ]`·7종 약어)으로 치환해 둠.

→ references/output-format.md §출력 형식 예시 골격 (wbs.md 를 쓰기 전 Read)

### 명세 블록 파싱 계약 (export v2 가 읽는 문법 — 어기면 조용히 유실된다)

`requirements`·`acceptance`·`test-criteria`·`constraints`·`tech-spec`·`api-spec`·`data-model`·`ui-spec`·`prd-ref` 는 `#### PRD 요구사항` / `#### 기술 스펙 (TRD)` 블록 관례를 **유지** (사람이 읽는 구획).
파서는 그 헤딩을 안 보고 **필드 줄만** 스캔. 아래 넷이 실제 계약.

규칙 (근거·어겼을 때 = references/output-format.md §명세 블록 파싱 계약 근거표):
1. 명세 블록 헤딩은 TSK 헤딩보다 반드시 한 단계 이상 깊다 — 3단계면 `####`, 4단계면 `#####`. 어기면 Task 블록이 명세 앞에서 잘려 전 필드가 통째로 유실된다.
2. 필드 줄은 열 0에서 시작한다 — `- requirements:` (앞 공백 금지).
3. bullet 항목은 정확히 2칸 들여쓴다 — `  - 항목`.
4. 빈 리스트는 생략하지 말고 `- field: -` 로 명시한다.

단일행 필드(`category`·`domain`·`model`·`status`·`priority`·`assignee`·`schedule`·`tags`·`depends`·`entry-point`·`prd-ref`·`note`)는 값에 콤마 있어도 분할 안 됨. 리스트 성격 값은 반드시 리스트 필드로 선언.

**4단계 생성 시 명세 블록 헤딩이 `#####` 인지 생성 직후 반드시 확인** (규칙 1 — 이 스킬이 만드는 가장 비싼 조용한 실패).

- WP 레벨에 status/priority/progress 금지 (Task 집계로 파생).
- 의존 그래프 노드 표기: 3단계 4자리 `0001.`, 4단계 6자리 `000101.`.
- 진척율·실적은 입력 안 함 — import 후 진척·실적 정본 = D'Flow. 재업로드해도 웹 값 보존.

## 성공 기준

→ references/success-criteria.md (참조 표 참고)
