# /dflow-dev --worker 팀원 모드 (팀장 전용)

`/dflow-dev` SKILL.md 가 `--worker` 일 때만 읽는 파일. SKILL.md 와 다른 문서의 「--worker」 A-I = 이 파일의 행.
규칙 이유·사고 이력 = `rationale.md` 「worker-mode.md」.

**팀장 전용, 사람이 직접 쓰지 않음.** `--worker` = "이 세션은 자동 실행 팀원, 기본 branch 를 잡은 상위 체크아웃이 따로 있음".
`/dflow-team` 팀장이 띄운 팀원만 이 플래그 붙임.
description 사용법 줄에 노출 안 함. `.dflow-agent` 있다고 워커 모드로 자동 전환 안 함.

| # | 위치 | 플래그 없음 | `--worker` |
|---|---|---|---|
| A | Phase 01-가 승인 스윕 | claim 앞에서 매번 스윕 | **건너뜀.** 스윕 = 팀장 몫. 이유 한 줄 남김 |
| B | Phase 01 2번, 선행이 approved 인데 main 미반영이면 직접 merge | 직접 merge | **merge 안 함.** 기점 = 그 `head_sha`. Phase 01 2번 공통 규칙대로 claim 전에 그 기점으로 detach → claim → 스택 branch 생성. state.json 에 `branch_base` 와 `risk: "선행 main 미반영(팀장 머지 대기)"` 기록 |
| C | Phase 01 1번 재개 판정의 approved 갈래 | 즉시 merge 후 종료 | **merge 안 함.** `.result` = `{TSK} {ID8} <branch> <head_sha> - needs-merge approved` 쓰고 종료 |
| D | 사람 판단이 필요한 분기(AskUserQuestion, `--only` 확인) | 지금처럼 묻음 | **AskUserQuestion 금지.** 합리적으로 골라 진행, 나중에 알림. 기본값 있으면 택하고 한 줄 남김. 없어도 근거 더 강한 쪽 골라 진행하고, design.md `## 담당자 확인 필요 결정` 절에 질문·선택지·택한 것·근거·반려 시 재작업 방향 기록. Phase 06 `done` 요약 끝에 `확인 필요 결정 N건: …` 추가. 결정마다 `D` 번호 부여. Phase 06 에서 그 절 → `<TASKS>/<TSK>/decisions.json` → `done --decisions` 로 전달(0건이면 `[]`). `blocked` = 되돌리기 어려운 결정(데이터 삭제·외부 공개·다른 Task 산출물 대폭 수정·보안·permission 변경)에만(worker-prompt.md 판단 규칙). 팀장이 `--only` 를 안 넘기므로 `--only` 확인은 워커 경로에 없음 |
| E | Phase 02-05 공통 프롬프트 | 지금 문구 그대로 | 공통 프롬프트에 "git 은 `command -v git` 이 돌려주는 절대경로를 글자 그대로 적어 호출한다. bare `git`, `$(command -v git)`·변수로 넣는 치환, git 을 감싼 명령 치환, 워크트리 밖을 가리키는 `-C` 는 쓰지 않는다" 한 줄 추가(템플릿 `{WORKER_LINES}`). 오케스트레이터도 같은 규칙 |
| F | Phase 01 2번 claim exit 4 재시도 | `git fetch origin` → 기점 재선정 → 1회 재시도. 그래도 4 면 중단·보고(merge 없음) | 같음. 그래도 4 면 `.result` 에 `skipped` |
| G | Phase 01 2번 `head_sha` 없는 선행의 갈래 1·2 | 갈래 1(미승인·stage 미달) = 로컬 선행 산출물 있으면 스택. 갈래 2(`stage >= im`·`order_approved:false`, 완료 보고 뒤 승인 대기) = 한 줄 남기고 진행 | **스택 안 함.** 갈래 1(`reached` 거짓) = `skipped 선행 미승인` 으로 끝, 팀장이 일시 제외. 갈래 2(`reached` 참인데 `head_sha` 없음) = 아래 **기본 브랜치 반영 확인** 수행. 반영 확인되면 `origin/<기본브랜치>` 기점으로 **스택 없이 진행**하고 한 줄 남김. 확인 안 되면 `skipped 선행 승인 대기` 로 끝(승인 전에 기본 branch 로 merge 하는 운영에서는 선행 산출물이 이미 기점에 있음). 워커 스택 = `head_sha` 있는 선행(행 B)에만. `waived:true` 간선은 이 행 대상 아님 → Phase 01 2번의 강제 진행 갈래(기본 branch 반영 확인 없음). 서버 계약 2.9 이상이면 갈래 1 은 아래 「설계 선행」 이 대신함 |
| H | Phase 01 3번의 branch 생성 또는 재개 판정으로 agent branch 에 들어온 직후 | 설치 안 함. 사람 체크아웃에는 의존성이 이미 있음 | agent branch 에 들어온 직후(생성·재개 모두), 4번 기준선과 Phase 02-05 게이트 전에 아래 블록으로 설치. `blocked` 답을 받아 재spawn 된 워커처럼 재개 판정으로 기존 agent branch 에 들어온 경우도 같음(새 격리 worktree 에는 `node_modules` 없음). lockfile 로 관리자 선택. `package.json` 있고 `node_modules` 없을 때만 설치. lockfile 없으면 설치 안 함. 설치 실패 → `.result` 에 `failed deps <실패한 명령과 exit>` 쓰고 끝. `DEPS_BUSY <폴더>`(exit 75) = 실패 아님: heavy 슬롯이 없어 설치를 미룬 것 → 잠시 뒤 같은 명령 재호출(이어서 설치). 설치는 branch 기점의 lockfile 로 고정(스택이면 선행이 lockfile 을 바꿨을 수 있음) |
| I | Phase 05 Refactor | supervised 에서 기본 실행(commit 없으면 Refactor 게이트 생략) | **실행 안 함.** Verify 게이트 통과 → 곧바로 Phase 06. Refactor 서브에이전트 안 띄움. state.json `phase` 도 `refactor` 로 안 씀 — dev-discipline.md 「Phase 05」 의 "무인 모드에서는 실행하지 않는다" |

## 행 G — 기본 브랜치 반영 확인

`<기본브랜치>` 는 개발 브랜치, 즉 `dflow.mjs branch dev` 의 값이다.
행 G 의 **기본 브랜치 반영 확인**: 선행 산출물이 `origin/<기본브랜치>` 에 실재하는지 git 으로만 확인.
- `<선행TSK>` = 그 `depends_evidence` 원소 `external_ref` 의 마지막 `/` 뒤 (예 `dict/TSK-02-01` → `TSK-02-01`).
- 선행 주문 `show` 금지 (워커의 서버 조회는 자기 `{ID8}` 하나로 제한 — worker-prompt.md 「5」).

**실행 = 공용 스크립트 한 줄** (팀장의 선행 반영 사전 검사와 같은 판정, 2026-09-23). 먼저 `git fetch origin` 을 단독 실행한 뒤 호출.
```bash
node .claude/skills/dflow-dev/scripts/pred-reflected.mjs <TASKS> <선행TSK> <기본브랜치>
```
- `<TASKS>` = 선행 Task 폴더의 부모. 팀장이 넘긴 `{TASK_DIR}` 의 부모 디렉터리(`$(dirname {TASK_DIR})`) 사용.
  선행은 같은 프로젝트·모듈 안(의존은 프로젝트 경계를 안 넘음) → 같은 `<TASKS>` 아래.
- 출력 첫 낱말 `REFLECTED` = 반영 확인.
- `NOT_REFLECTED`·`UNKNOWN` = 모두 `skipped 선행 승인 대기` (지금 동작과 같음).
- 아래 블록 = 스크립트 동작 설명. 워커가 직접 치지 않음.
- 스크립트 안의 git 호출은 `deps.mjs` 와 같은 방식. 워커 git 호출 규칙(명령 치환 금지)은 워커가 직접 치는 Bash 줄에만 적용.

판정 = `phase=merged` **AND** (아래 세 증거 중 하나라도 참).
- **첫 증거가 가장 강함**: 선행 산출물이 `origin/<기본브랜치>` 기점에 실재한다는 직접 증거. commit 그래프 조상 관계는 git 이 보증 → 트레일러·state.json 값처럼 빠뜨리거나 잘못 쓸 수 있는 경로를 안 거침.
- `state.json` 에 `head_sha` 없으면 첫 증거는 판정 불가로 건너뛰고 나머지 둘로 판정.

```bash
git fetch origin
git show "origin/<기본브랜치>:$(dirname {TASK_DIR})/<선행TSK>/state.json"   # phase 가 merged 여야 하고, 여기서 order 와 head_sha 를 읽는다
git merge-base --is-ancestor <head_sha> origin/<기본브랜치>   # 증거 1. head_sha 가 있을 때만 실행. exit 0 이면 참
git log origin/<기본브랜치> --grep='DFlow-Order: <그 order>' --format=%h   # 증거 2. 한 줄이라도 나오면 참
git log origin/<기본브랜치> --merges --grep='^merge: <선행TSK> ' --format=%h   # 증거 3. 한 줄이라도 나오면 참. TSK 뒤 공백까지 넣는다 — 안 넣으면 TSK-03-1 이 TSK-03-10·03-11 도 함께 집어 오탐이 된다
```

- 팀장 자동 merge(`automerge=1`)가 승인 전에 merge 한 선행도 `phase` = `merged` + `unapproved: true` → 같은 확인 통과. `unapproved` 는 이 판정에서 안 봄.
- 미반영 = `show` 실패(그 경로에 파일 없음) · `phase` ≠ `merged` · 세 증거 모두 판정 불가/거짓. 그때 `skipped 선행 승인 대기` 로 끝.
- `phase` 만으로는 부족: state.json `phase` 는 파일 한 줄이라 실제 merge 없이도 쓰일 수 있음. 트레일러는 과거 commit 에 없을 수 있어 증거를 셋으로 넓힘.
- 확인 통과 = 선행 코드가 기점에 있음 → 스택할 대상도 이유도 없음.
- 판정 이력(실측 사례) = `scripts/pred-reflected.mjs` 머리 주석.
- 트레일러 패턴(증거 2)의 콜론 뒤 **공백 필수 + 따옴표로 감쌈.** 실제 트레일러 = `DFlow-Order: <uuid>`. 공백 빼면 매치 0건 → 「반영되지 않음」 과 구분 불가 → 정상 선행까지 `skipped`.

## 설계 선행 (계약 2.9)

정본 = `orch/design-first.md` 「설계 선행 (계약 2.9)」. 워커에서 달라지는 것만 기록.

- **행 G 갈래 1 대신**: `dflow.mjs contract-ge 2.9` exit 0 이면 `reached` 거짓 선행을 `skipped 선행 미승인` 으로 끝내지 않고 `claim --design-first` 로 진행 (`orch/base.md` 2번 「v2.9 설계 선행 후보」).
  - 팀장은 선행 대기 작업을 빈 슬롯에만 설계 선행으로 줌 (`/dflow-team` 「선행 대기의 설계 선행」).
  - 서버가 `DESIGN_FIRST_TOO_EARLY` 로 거부 → `.result` 에 `skipped 선행 미충족(설계 선행 불가: <ref…>)` (`<ref…>` = 그 JSON `external_ref` 를 공백으로 이은 것).
- **멈춤**: 멈춤 절차 5번의 `.result` = `{TSK} {ID8} <agent 브랜치> <push 한 head_sha> - design_waiting <미충족 선행 ref…>`.
  - 재개했는데 여전히 미충족이거나 기점을 못 정하면 같은 status, 사유만 변경 (`design_waiting 선행 승인 대기 <ref>` 등).
  - 팀장은 이 status 를 실패로 안 보고 worktree 를 남긴 채 좌석만 비움.
- **선행 반영 merge**: 재개 3번의 merge(정한 기점을 agent branch 에 한 번)는 워커도 실행.
  - 기본 branch 체크아웃·merge 가 아니라 agent branch 위의 merge → 아래 「그 밖의 워커 규칙」 의 "기본 브랜치를 switch·pull·merge·push 하는 지점은 행 A·B·C 뿐" 과 충돌 없음.
  - git 은 행 E 의 절대경로 규칙대로 호출.
- 재개 = 팀장이 같은 worktree 로 다시 띄운 워커가 수행 (claim 안 함).
  - 좌석 번호가 바뀌어 `.dflow-agent` 가 달라져도 서버는 PAT 사용자로 점유자를 가르므로 `build-start` 통과.
  - 계약 2.11 의 도는 PC(`runner`)도 라벨의 PC 칸(`<신원>/<host>/w<n>` 의 `<host>`)으로 가름 → 같은 PC 의 다른 좌석은 안 막힘.

## 행 H — 의존성 설치

행 H 의 설치 블록:
```bash
node .claude/skills/dflow-dev/scripts/deps.mjs   # 75(DEPS_BUSY)면 잠시 뒤 다시 부른다. 그 밖에 0 이 아니면 .result 에 failed deps <DEPS_FAILED 줄의 명령과 exit>
```
- `DEPS_GRADLE_JAR_MISSING <폴더>` 줄 = 실패 아닌 경고. 그 폴더의 `gradlew` 는 wrapper jar 없어 안 돎.
  - 그 폴더의 Gradle 작업이 이번 작업에 필요하면: jar commit·`.gitignore` 수정 금지, 팀장에게 이슈로 보고 (수동 실행이면 사용자에게 알림).
  - 필요 없는 폴더(예제·PoC)는 무시.
- 설치 규칙 = 위 표와 같음 (lockfile 로 관리자 선택 · `package.json` 있고 `node_modules` 없을 때만 · lockfile 없으면 설치 안 함).
  - 세부(공용 캐시 복제(npm, 캐시 없으면 `npm ci`) · 메인 체크아웃 복제(pnpm, `DFLOW_DEPS_MAIN_CLONE=1`) · yarn · postinstall · 캐시 보존) 정본 = `scripts/deps.mjs` 머리 주석.
  - 스크립트가 처리 → 워커가 따로 안 함.
- **준비 build**: 설치 끝나면 `deps.mjs` 가 리포 루트 `.dflow-gates` 의 `prepare<TAB><명령>` 줄(예: 워크스페이스 라이브러리 build)을 worktree 마다 한 번 실행 — 새 worktree 에 dist 없어 첫 게이트가 실패하지 않게.
  - `DEPS_PREPARE_FAIL` = 경고(exit 0). 게이트가 같은 원인으로 실패하면 그 결과로 판정.
  - 이번 호출에서 실제로 설치했으면 준비 build 는 안 돌고 `DEPS_PREPARE_PENDING` + exit 75 로 끝남. `DEPS_BUSY` 처럼 실패 아님.
  - 다시 부르면 설치는 건너뛰고 준비 build 만 실행 (한 호출이 10분 초과 금지).
  - 이 호출은 Bash 도구 timeout 을 300000-600000 으로 줌.
- **행 H 서버 프로세스**: Build·Verify Phase 가 screen 작업의 브라우저 E2E 용 서버를 띄울 때도 행 H 와 같은 자리의 규칙 — `references/e2e.md` 「서버 프로세스」(정본).
  - 리포 서버 실행 스크립트(`be-run.sh`·`fe-run.sh` 류) 금지. 빈 포트로 직접 띄움.
  - 끝나면 자기가 띄운 프로세스만 거둠.

## 그 밖의 워커 규칙

- **도커 금지 모드(워커)**: 워커는 기본적으로 도커 금지.
  - 팀장 포인터의 `DOCKER` 값(worker-prompt.md 변수표)이 `allow` 일 때만(`docker` 태그 Task) 풀림. 그때도 `dflow.mjs config no_docker` 가 `1` 이면 금지.
  - 옛 포인터의 `NO_DOCKER` 는 안 봄.
  - 기준선 전에 판정, 출처를 기준선 기록에 남김.
  - 판정·제외·도커 슬롯·기록 정본 = dev-discipline.md 「도커 사용 규칙」. 도커 런타임을 켜지 않는 규칙은 금지 모드와 무관하게 항상 지킴.

- 인자 파싱: `$ARGUMENTS` 에 `--worker` 있으면 이 모드. 참조는 id8 로만 옴.
  - 팀장이 넘긴 `--scope` = 새 claim 의 범위. 이미 잡힌 작업은 서버 `claim_scope` 가 우선 (`orch/start.md` 「서버 판단」).
  - 범위·설계 상태 때문에 끝나면 아래 「설계 상태의 결과 줄」 사용.
- `.result` 형식과 status 뜻 정본 = `.claude/skills/dflow-team/references/worker-prompt.md`. 끝날 때 status·agent branch·head·`done` exit·한 줄 사유를 마지막에 요약 → 워커가 `.result` 로 옮김.
- 중단(exit 10, `.claude/skills/dflow-dev/references/state-model.md`) → `.result` 에 `{TSK} {ID8} <branch|-> <head_sha|-> - cancelled <멈춘 Phase 와 호출>` 쓰고 끝.
  - push 안 함 → `<head_sha>` = 로컬 commit.
  - 팀장이 슬롯을 풀고 pane 을 거두되 worktree 는 남김 (산출물 보존).
- 기본 branch 를 switch·pull·merge·push 하는 지점 = 행 A·B·C 뿐, 워커는 셋 다 안 함.
  - 행 F 재시도는 수동·워커 모두 merge 안 함.
  - claim 전 기점 이동(`git switch --detach`, Phase 01 2번)은 기본 branch 를 체크아웃 안 함 → 팀장 체크아웃과 충돌 없음.
  - agent branch 생성 + push 하는 Phase 01 3번과 Phase 06(`reported` commit 포함)은 워커에서도 그대로.
- 새로 만드는 "사람에게 묻기" 지점 없음. dflow-dev 의 판단 실패는 이미 전부 "중단·보고" (push 훅 거부 · Verify 재시도 소진 · 빨간 기준선) → 워커에서는 `.result` 의 `failed <사유>`.
  - 설계 재량 분기 = 판단 규칙이 받음. 대부분 골라서 진행 + 기록. `blocked` = 되돌리기 어려운 결정뿐.
- 워커용으로 갈리는 것 = 인자 파싱 + 위 아홉 행뿐 (행 F 는 수동과 같고 결과 표기만 다름).
  - 게이트 · Phase 정의 · commit 규칙 · 모델 배정(dev-discipline.md)은 워커에서도 같음.
  - 행 I 의 Refactor 생략도 dev-discipline.md 가 정한 무인 모드 규칙.

### 설계 상태의 결과 줄(계약 2.11)

단계 파일에서 알리고 끝나는 자리마다 워커는 알림 대신 이 표의 줄을 `.result` 에 쓰고 끝냄.
- 형식 = `{TSK} {ID8} <branch|-> <head_sha|-> <done_exit|-> <status> <사유>`, 정본 = worker-prompt.md 「7」.
- `<head_sha>` = push 한 agent branch tip. push 전에 끝났으면 로컬 tip, branch 없으면 `-`.

| 자리(단계 파일 「절」) | status | 사유 |
|---|---|---|
| start 「서버 판단」: ready 인데 `action` 이 `wait`·`skip` | `skipped` | `<action_reason>` |
| start 「서버 판단」 의 `mine` 거짓, design 「Design 게이트」 표·close 의 exit 12 | `skipped` | `다른 PC 도는 중(<runner>)` |
| start 「서버 판단」: 설계 상태 `review` | `design_review` | `-` |
| start 「끝나지 않은 설계 멈춤 이어받기」 2: 설계 상태 `review` | `design_review` | `-` |
| 같은 절 2: `wait_review` 인데 설계 상태가 `review` 가 아님 | `failed` | `방식 확인 필요` |
| 같은 절 2: design-done exit 6 | `design_review`(`wait_pred` 였으면 `design_waiting`) | `design-done 미확인` |
| 같은 절 1·design 「설계 받기」: branch 갈라짐 | `failed` | `브랜치 갈라짐 <로컬 sha> <origin sha>` |
| fetch 실패(이어받기·「설계 받기」·rework) | `skipped` | `fetch 실패` |
| 훅 거부가 아닌 push 실패(이어받기·「설계만 멈춤」 3·design-first 멈춤 3·close) | `skipped` | `push 실패` |
| claim 「사람 설계 초안 확인」 | `skipped` | `사람 설계 초안 있음` |
| claim 「범위」 의 exit 11, design 표의 그 밖의 exit 11 | `skipped` | `설계 관문(<code>)` |
| design 「설계 받기」 게이트 불통(review, exit 0, 단계 아직 `ds`·`dd`), design-first 「3」 5 선행 계약 바뀜(review, exit 0) | `design_review` | `<빠진 절>` 또는 `선행 계약 바뀜: <파일…>` |
| design 「설계 받기」 게이트 불통(human, exit 0, 단계 아직 `ds`·`dd`), design-first 「3」 5 선행 계약 바뀜(human, exit 0) | `design_reopened` | 같은 사유 |
| design 표의 exit 11 + `order_changed`(build-start, 범위 `build` ∧ 서버 `design_mode` 가 `human`) | `design_reopened` | `주문이 바뀜` |
| design 표의 exit 11 + `order_changed`(build-start, 그 밖 — full·legacy·rework·review) | `skipped` | `주문이 바뀜` |
| design 「설계 받기」·design-first 「3」 5 의 design-reopen 호출 exit 6 | `skipped` | `design-reopen 미확인` |
| 같은 호출의 그 밖의 exit | `failed` | `design-reopen 거부(<code>)` |
| design 「설계만 멈춤」 5 | `design_review` | `-` |
| design 「설계만 멈춤」 4 의 exit 6 | `design_review` | `design-done 미확인` |
| design 「설계만 멈춤」 4·design-first 멈춤 4 의 exit 11 | `failed` | `design-done 거부(<code>)` |
| design-first 멈춤 4 의 exit 6(계약 2.11) | `design_waiting` | `design-done 미확인` |
| design 「승인된 설계 고정」, 「설계 받기」 게이트 불통(서버 단계 `ip` 이상 — design-reopen 을 부르지 않는다) | `failed` | `설계 게이트 불통(구현 중)` |
| design-done 호출(start 「끝나지 않은 설계 멈춤 이어받기」 2)의 exit 6 이 아닌 것(11 포함) | `failed` | `design-done <exit>` |
| design-done 호출(design 「설계만 멈춤」 4·design-first 멈춤 4)의 그 밖의 exit(6·11 이 아님) | `failed` | `design-done <exit>` |
| rework 「범위」: 설계 변경 필요 | `failed` | `설계 변경 필요 — <이유>` |
| close: push 가 non-fast-forward 로 거부 | `failed` | `원격 agent 브랜치에 사람 커밋 — 받은 뒤 --resume` |
| close: done 의 exit 11 | `failed` | `완료 보고 거부(<code>)` |
| close: squash 실패(`SQUASH_DIRTY`·`SQUASH_TREE_MISMATCH` 등) | `failed` | `squash 실패(<SQUASH_ 코드>)` |

- exit 12 로 끝날 때 state.json 변경 금지 (다른 PC 가 이어 감). 마감에서 미리 쓴 `phase=reported` 는 원래 값으로 되돌림 (`orch/close.md` 4).
- `design_reopened` = 구현자동 작업의 사람 설계가 게이트·선행 계약 검사를 통과 못 해 사람 설계 대기로 되돌아감. 팀장이 worktree 를 지움.
  - human 방식 = 설계 원본이 개발 branch, review 방식 = 원격 agent branch 에 있음 → 다시 잡아도 잃을 것 없음.
- `주문이 바뀜`(build-start exit 11 의 `order_changed`)은 범위로 가름 (12절 Y7).
  - 구현자동(범위 `build` ∧ `human`): 사실상 사람의 「설계 되돌리기」 하나 (취소는 409 `cancelled` 로 따로 옴). 설계 원본이 개발 branch → `design_reopened`. 팀장이 worktree 를 지워야, 다시 확정된 뒤 새 워커가 같은 경로에 뜸.
  - 그 밖(full·legacy·rework·review): `skipped`(일시 제외). 설계가 이 PC 의 로컬 agent branch 에 commit 돼 남아 있을 수 있음 → 같은 PC 가 다시 잡으면 그 branch 로 이어 감. review 는 주문이 다시 승인돼 build 목록에 실리면 팀장이 30분 뒤 다시 띄움.
