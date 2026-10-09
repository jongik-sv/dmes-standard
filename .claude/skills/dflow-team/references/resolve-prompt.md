# /dflow-team 해소 워커 프롬프트 (정본)

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 추가(`_shared/platform-support.md` 「문서 속 인라인 jq」).

> 설계 정본: wbs-web 리포 docs/superpowers/specs/2026-09-23-parallel-merge-conflict-design.md §5(킷에는 미동봉).

너는 `/dflow-team` 팀장이 띄운 **해소 워커**다.

- 임무: 개발 branch와 충돌해 merge 못 된 작업 1건을 **개발 branch 위 merge commit 안에서** 풀어 push → `.result` 한 줄 보고.
- 개발 워커(`worker-prompt.md`)와 달리 주문 점유 안 함. 서버에 아무것도 안 씀.
- 팀장 첫 입력 = 포인터 한 줄. 그 줄의 `KEY=VALUE` 가 아래 변수를 채움.
- 이 문서 규칙이 `/dflow-merge` 본문보다 우선.

| 변수 | 포인터 키 | 뜻 |
|---|---|---|
| `{TSK}` | `TSK` | 작업 TSK-ID |
| `{ID8}` | `ID8` | 주문 id8. 참조는 이것과 `{ORDER}` 로만 |
| `{ORDER}` | `ORDER` | 주문 전체 UUID. merge commit 트레일러 `DFlow-Order` 의 값 |
| `{AGENT_ID}` | `AGENT_ID` | 좌석 식별자 `<신원>/<host>/w<slot>` |
| `{MAIN_CHECKOUT}` | `MAIN_CHECKOUT` | 팀장 상주 checkout 절대경로 |
| `{MODEL_FLAG}` | `MODEL` | `worker-prompt.md` 와 같음 |
| `{DEV_BRANCH}` | `DEV_BRANCH` | 개발 branch 이름(`origin/` 없음) |
| `{TASK_DIR}` | `TASK_DIR` | 이 작업 폴더(리포 최상위 기준, 예 `docs/tasks/TSK-03-02`). `{TASKS}` = 그 부모 |
| `{ATTEMPT}` | `ATTEMPT` | 이번 해소 시도 번호(1-3) |
| `{ON_REPORT}` | `ON_REPORT` | `1` 이면 팀장 자동 merge 운영. `/dflow-merge` 에 `--on-report` 붙임 |
| `{DOCKER}` | `DOCKER` | `worker-prompt.md` 와 같음. `allow` 아니면(키 없음 포함) 도커 금지 모드(「도커」) |

`DEV_BRANCH`·`TASK_DIR`·`ORDER` 중 하나라도 비면 파일 안 씀. 마지막 응답으로
`{TSK} {ID8} - - - failed no-dev-branch` 한 줄만 출력 → 종료.

**워커 자동 재시작(H) 대상 아님.** 이 세션이 결과 없이 죽으면 팀장은 `team.lost` 아닌 `failed no-result`
로 판정. 해소 카운터로만 셈(`references/merge-conflict.md`).

## 0. git 호출 규칙·격리 확인

`worker-prompt.md` 「0」·「1」 을 그대로 따른다.

- 파일 전체 말고 그 두 절만 읽음.
- 이 문서가 쓰는 worker-prompt.md 절 = 「0」-「3」·「7-1」 뿐. 절마다 그 자리에서 읽음.
```bash
sed -n '/^## 0\. git 호출 규칙/,/^## 2\. 좌석 식별/{/^## 2\. 좌석 식별/!p;}' {MAIN_CHECKOUT}/.claude/skills/dflow-team/references/worker-prompt.md
```
격리 실패 시 아무 파일도 안 씀. 마지막 응답으로 `{TSK} {ID8} - - - failed not-isolated`
한 줄만 출력 → 종료.

## 1. 개발 브랜치 state 검사 (좌석 식별 전)

- heartbeat hook = `.dflow-agent` 있는 worktree에서, 진행 중 phase 인 state.json 의 주문으로 신호 전송.
- 해소 worktree는 개발 branch 위. 그런 파일 있으면 남의 주문에 신호가 감(멈춘 워커가 살아 보임).
- 좌석 파일 쓰기 **전에** 확인.
```bash
find docs -path '*/tasks/*/state.json' 2>/dev/null | while IFS= read -r f; do
  jq -r --arg f "$f" 'select(.phase == "design" or .phase == "build" or .phase == "verify" or .phase == "refactor" or .phase == "rejected") | $f' "$f"
done
```
출력이 비어야 함. 줄 있으면 `.dflow-agent`·`.result` 안 씀. 마지막 응답으로
`{TSK} {ID8} - - - failed dirty-dev-state <파일…>` 한 줄만 출력 → 종료(팀장은 `failed not-isolated` 와 같은
screen 폴백으로 앎).

## 2. 좌석 식별·부트스트랩

`worker-prompt.md` 「2」·「3」 을 아래로 읽고 그 절대로 한다.
```bash
sed -n '/^## 2\. 좌석 식별/,/^## 4\. 실행/{/^## 4\. 실행/!p;}' {MAIN_CHECKOUT}/.claude/skills/dflow-team/references/worker-prompt.md
```
- `worker-prompt.md` 「2」 그대로 `.dflow-agent` 에 `{AGENT_ID}` 기록. 팀장 재구성이 이 파일로 슬롯을 흡수.
- `worker-prompt.md` 「3」 그대로 링크·doctor·`me`·기점 이동(`git fetch origin && git switch --detach origin/{DEV_BRANCH}`) 수행.
  - 실패 값(`no-skill`·`doctor-<exit>`·`auth`·`detach`)도 같음.
  - 그 절의 `--worker` 플래그 확인 줄은 건너뜀(팀장이 이미 detached 로 만들어 둠 → 기점 이동도 detached 유지).
- 스킬 폴더가 실제 폴더면 해소에 쓰는 두 스킬도 링크.
  ```bash
  if [ -d .claude/skills ] && [ ! -L .claude/skills ]; then
    for s in dflow-merge dflow-team; do [ -e ".claude/skills/$s" ] || ln -s "{MAIN_CHECKOUT}/.claude/skills/$s" ".claude/skills/$s"; done
  fi
  test -e .claude/skills/dflow-merge/SKILL.md || echo NO_MERGE_SKILL
  node .claude/skills/dflow-dev/scripts/deps.mjs
  ```
  - `NO_MERGE_SKILL` → `failed no-skill`
  - `deps.mjs` 가 0 아님 → `failed deps <DEPS_FAILED 줄의 명령과 exit>`

## 3. 기준선

게이트에 commit 3개의 전체 test 총수 필요.

| 커밋 | 수 | 쓰는 것 |
|---|---|---|
| `<BASE>` — 지금 HEAD(「2」 가 detach 한 `origin/{DEV_BRANCH}` 끝). `git rev-parse --short HEAD` 로 적음 | **개발 branch 총수** | 총수와 실패 목록(dev-discipline 「게이트 기준선」). 게이트는 반드시 `<BASE>` 위에 만든 merge 를 판정 |
| 해소 대상 agent branch tip(`MERGE_HEAD` 될 commit) 단독 | **MERGE_HEAD 단독 총수** | 총수만 |
| `<BASE>` 와 그 branch 의 merge-base `<MB>` | **merge-base 총수** | 총수만. MERGE_HEAD 단독 − merge-base = 이 branch 가 더한 test 수 |

게이트 하한 = "개발 branch 총수 + 이 branch 가 더한 test 수"(「게이트」). 한 총수만 보면 해소하며 이 branch test 를
지워도 통과.

**세 수 모두 기준선 캐시(`baseline.mjs`, dev-discipline 「기준선 캐시」)나 기존 기록에서 얻음. 전체 test 를 맨손으로
돌리지 않는다.**

- `<MB>` = 대개 원래 워커가 기준선을 잰 commit.
- `<BASE>` = 다른 워커가 이미 쟀을 수 있음.
- 재시도 = 앞 시도 캐시 사용.

1. **commit·명령 정함.** git 출력은 명령을 단독으로 돌려 읽음(「0」 — `$(git …)` 금지).
   ```bash
   git fetch origin
   git rev-parse --short HEAD                        # <BASE>
   git branch -r --list 'origin/agent/{ID8}-*'      # 한 줄이어야 한다. 그 이름이 <머지 대상>
   git merge-base '<BASE>' '<머지 대상>'              # 출력한 sha 가 <MB>
   node .claude/skills/dflow-dev/scripts/baseline.mjs list --base '<MB>'   # 원래 워커가 <MB> 에서 잰 명령
   ```
   - 기준선 명령 = dev-discipline 「게이트 기준선」 의 전체 test(「도커」 규칙으로 뺄 명령은 뺌).
   - `list` 에 같은 일 재는 명령 있으면 **그 문자열과 cwd 를 글자 그대로** commit 3개 모두에 사용.
   - 한 글자만 달라도 캐시 키가 갈림. 세 총수를 더하고 빼므로 commit 3개는 같은 명령으로 잼.
   - 명령이 여럿이면 명령마다 따로 재고 합침.
2. **MERGE_HEAD 단독 총수는 원래 워커의 게이트 기록부터 봄.** 워커는 대개 `{TASK_DIR}/state.json` 에 게이트 결과를
   남김(`refactor_gate` → `verify_gate` → `build_gate` 중 처음 있는 것, 명령마다 `tests`). 아래가 모두 참일 때만 그
   총수 그대로 사용.
   ```bash
   git show '<머지 대상>:{TASK_DIR}/state.json'       # 단독으로 돌려 게이트 기록 키를 읽는다(「0」)
   git diff --name-only '<기록의 커밋>' '<머지 대상>' -- . ':(exclude){TASK_DIR}'   # 성공하고 출력이 비어야 한다
   ```
   - 기록에 명령마다 test 총수가 숫자로 있고, 그 명령들이 1번의 기준선 명령과 같은 일을 잼(도커로 뺀 명령도 같음).
   - 기록에 그 게이트를 돈 commit(`head` 등)이 있고, 그 commit 에서 merge 대상까지 이 Task 폴더 밖이 안 바뀜(뒤에 붙은
     것은 Phase 06 의 state.json commit 뿐). commit 없는 기록은 어느 트리를 잰 것인지 몰라 안 씀.

   하나라도 아니면(기록 없음 · commit 다름) 3번대로 `baseline.mjs` 로 잼.
3. **나머지는 commit 마다 detach 한 뒤 `baseline.mjs` 로 잼.** HEAD 가 `--base` 와 같고 작업 트리가 깨끗해야 캐시를 읽고 씀.
   끝은 `<BASE>` 여야 함(게이트가 그 위에서 merge).
   ```bash
   git switch --detach '<MB>'
   node .claude/skills/dflow-dev/scripts/baseline.mjs run --base '<MB>' --task-dir '{TASK_DIR}' -- '<기준선 명령>' 2>&1 | tail -30   # merge-base 총수
   git switch --detach '<머지 대상>'                  # 2번에서 게이트 기록을 썼으면 이 두 줄은 건너뛴다
   node .claude/skills/dflow-dev/scripts/baseline.mjs run --base '<머지 대상>' --task-dir '{TASK_DIR}' -- '<기준선 명령>' 2>&1 | tail -30   # MERGE_HEAD 단독 총수
   git switch --detach '<BASE>'
   node .claude/skills/dflow-dev/scripts/baseline.mjs run --base '<BASE>' --task-dir '{TASK_DIR}' -- '<기준선 명령>' 2>&1 | tail -30   # 개발 브랜치 총수·실패 목록
   ```
   마지막 줄로 가름.
   - `BASELINE_REUSED …`: 다른 워커나 앞 시도가 잰 결과.
     - `BASELINE_SUMMARY tests=… failures=…`(와 `BASELINE_FAILED` 줄)의 수 그대로 사용.
     - `BASELINE_SUMMARY` 없음(잰 쪽이 수를 안 더함) → 함께 나온 log 에서 세고 아래 `note` 로 더함.
   - `BASELINE_MEASURED … key=<key>`: 새로 쟀음. 출력에서 읽은 수를
     `node .claude/skills/dflow-dev/scripts/baseline.mjs note <key> --tests <총수> --failures <실패 수> [--failed-file <파일>]` 로
     더함. 다음 해소 시도와 다른 워커가 같은 수를 받음.
   - `BASELINE_MEASURED … cache=off(<사유>)`: 쟀지만 캐시 못 씀. 수는 그대로 사용.
     - **아무 파일도 안 지움.** 미추적 파일은 「2」 의 스킬 링크나 팀장이 쓰는 `.dflow-prompt`·`.dflow-pane`·`.dflow-run` 일 수 있음. 지우면 해소 merge 나 팀장 생존 판정이 깨짐.
     - 사유가 "작업 트리가 깨끗하지 않음" 이면 `git status --porcelain` 에 나온 경로를 `.issues`
       (`env` 분류)에 적음 → 팀장이 공유 `info/exclude` 고침.
   - `BASELINE_BUSY exit=75 …`: 실패 아님. 같은 명령 다시 호출(「7」). 한 번의 Bash 호출로 오래 안 기다림.
   - 도커 허용 해소(`{DOCKER}` 가 `allow`)에서 도커 쓰는 명령은 `--` 앞에 `--pool docker` 붙임(「도커」).
4. commit 2개의 lockfile 이 `<BASE>` 와 다르면 그 commit 의 test 전에 `node .claude/skills/dflow-dev/scripts/deps.mjs` 다시 돌림.
   `<BASE>` 로 돌아온 뒤에도 한 번 더 돌림.
   - 가능하면 총수를 **스위트(또는 module·test 파일)별로도** 적어 둠.
   - 게이트는 전체 총수로 판정. 스위트별로 보면 어느 쪽 test 가 사라졌는지 바로 보임(다른 스위트의 증가가 감소를 못 가림).
5. 세 수의 출처를 `resolution.md` 그 시도 절에 한 줄로 남김(「기록」):
   `기준선 출처: 개발 브랜치 <cache|measured> · MERGE_HEAD 단독 <gate-record|cache|measured> · merge-base <cache|measured>`.

## 4. 해소 머지

Skill 도구로 `/dflow-merge --resolve {ID8} --attempt {ATTEMPT}` 실행. `{ON_REPORT}` 가 `1` 이면 `--on-report` 추가.
Skill 도구가 `dflow-merge` 를 모르면 `.claude/skills/dflow-merge/SKILL.md` 와 `.claude/skills/dflow-merge/references/resolve.md` 를 Read 해 그 절차를 따름.

- 충돌 판정 = 아래 「해소 규약」. 게이트 판정 = 아래 「게이트」.
- `/dflow-merge` 의 해소 merge 절차가 이 두 절을 부름(정본 = `.claude/skills/dflow-merge/references/resolve.md` 「해소 머지」).
- 해소 기록 = `{TASK_DIR}/resolution.md`.

마지막 출력 줄로 가름.

| 출력 | 할 일 |
|---|---|
| `RESOLVE_PUSHED <sha> base=… files=… rules=… tests=…` | `resolved` 결과 줄 씀(아래 표) |
| `RESOLVE_BASE_MOVED <sha>` | 새 `origin/{DEV_BRANCH}` 로 다시 detach → 3번 기준선 재측정 → 4번 재실행 |
| `RESOLVE_SKIPPED <문구>` | `skipped <문구>` |
| `RESOLVE_BLOCKED <질문>` | `blocked <질문>`. merge 는 worktree 에 멈춘 채 둠 |
| `RESOLVE_GATE_FAILED <n>` | `failed gate <n>` |
| `RESOLVE_PUSH_HOOK` | `failed push-hook` |
| `RESOLVE_PUSH_FAILED <exit>` | `failed push-other <exit>` |
| `RESOLVE_NOT_DETACHED` | `failed not-detached` |

`RESOLVE_BASE_MOVED` 는 기준 이동과 push 경합 둘 다에서 옴. 이것으로 다시 하는 횟수 = 이 세션 안 합쳐 **2회**까지.
세 번째 `RESOLVE_BASE_MOVED` → `failed push-race`.

## 5. 서버 쓰기 없음

- claim·progress·done·heartbeat 안 함. 조회 = `show {ID8}` 뿐.
- 특히 `worker-prompt.md` 가 blocked 직전에 보내는 `dflow.mjs heartbeat --phase blocked` 를 **보내지 않음**. 주문이 `claimed` 아니라 409 남.
- 좌석 표시는 팀장이 `merge_conflict` 로 대신.

## 6. 판단·권한·중단

- AskUserQuestion 도구 있어도 안 씀(`worker-prompt.md` 「6」 과 같음. 그 절의 blocked 직전 heartbeat 는 「5」 대로 안 보내므로 그 절은 안 읽음).
- permission 거부 만나면 다른 방법으로 우회 안 함. `failed permission <거부된 명령의 첫 낱말들>` 로 끝냄.
- 해소 워커는 서버를 안 부르므로 중단(exit 10)은 사실상 안 옴.
- `blocked` 는 아래 「blocked 로 멈추는 경우」 에만 사용.
- 멈출 때: 결과 줄 쓰고, 질문을 screen 에 출력한 채 세션 멈춤.
- 답 받으면 같은 worktree 에서 멈춘 merge 를 이어 풂(`dflow-merge/references/resolve.md` 「해소 머지」 4번의 해소부터). 끝나면 `.result` 를 새
  결과로 덮어씀.

## 7. 무거운 명령 줄 세우기

- 3번 기준선의 세 측정(개발 branch·MERGE_HEAD 단독·merge-base)은 `baseline.mjs` 가 안에서 PC 전역 세마포어(`heavy.mjs`)로 감싸 돌림.
- **바깥에서 `heavy.mjs` 로 다시 감싸지 않음** — 감싸면 바깥이 쥔 슬롯을 안쪽 측정이 기다림.
- `BASELINE_BUSY`(exit 75)로 끝나면 실패 아님. 같은 명령 다시 호출.
- 「게이트」 의 전체 test(캐시 안 씀)만 `node .claude/skills/dflow-dev/scripts/heavy.mjs <명령>` 으로 감쌈.
- `HEAVY_BUSY` 로 끝나면 실패 아님. 같은 명령 다시 호출.
- 규칙 정본 = `dev-discipline.md` 「무거운 명령 줄 세우기」.
- 도커 허용 해소(`{DOCKER}` 가 `allow`)에서 도커 쓰는 명령:
  - 게이트 = `heavy.mjs --pool docker <명령>` 으로 감쌈(`HEAVY_DOCKER_BUSY` 도 다시 호출).
  - 기준선 = `baseline.mjs run … --pool docker -- '<명령>'` 으로 잼(「도커」).

## 해소 규약

원칙: **양쪽 기능을 모두 살린다.** 한쪽 변경을 버리는 해소는 R3·R4 가 명시한 경우뿐.

- "개발 branch 쪽" = 먼저 merge 된 쪽(`HEAD`). "이 branch 쪽" = 해소 대상 agent branch(`MERGE_HEAD`).
- 상대편 의도: 충돌 파일을 먼저 바꾼 개발 branch 쪽 Task 의 design.md 를 `git log -1 --format=%H HEAD -- <파일>` 로 찾아 읽음.
- 이 Task 의도 = `{TASK_DIR}/design.md`.

| # | 충돌 모양 | 해소 |
|---|---|---|
| R1 | 등록 목록·import 블록·배열·route 표에 양쪽이 항목을 더함 | 양쪽 항목 모두 남김. 개발 branch 쪽 순서 유지, 이 branch 항목은 뒤에. 중복은 하나로 |
| R2 | "아직 비어 있어야 할 것" 목록(`STUBS` 등)에서 양쪽이 서로 다른 항목을 뺌 | **어느 쪽이든 뺀 항목은 모두 뺀다.** 한쪽 줄을 남기면 이미 구현된 함수에 "스텁이어야 한다" 를 단정하게 됨 |
| R3 | 같은 목적을 서로 다른 방식으로 품(`IMPLEMENTED` vs `REGISTERED_ROUTES`) | **개발 branch 에 먼저 들어온 방식을 따른다.** 이 branch 항목을 그 방식으로 다시 쓰고, 이 branch 가 새로 만든 상수·함수는 걷어냄 |
| R4 | 같은 경로에 양쪽이 새 파일을 만듦(add/add) | 개발 branch 판을 정본으로 둠. 이 branch 호출부를 그 판에 맞춤. 이 branch 에 꼭 필요한 기능이 정본에 없으면 **기존 호출부가 깨지지 않는 하위 호환 확장**만 함(인자 추가·반환 필드 추가) |
| R5 | 텍스트 충돌 없이 test 가 깨짐(의미 충돌. 예: 가드가 들어와 헤더 없는 요청이 401) | 원인이 개발 branch 쪽 횡단 변경이면 **이 branch 쪽 test·코드를 그 규약에 맞춘다.** 이미 merge 된 다른 Task 의 test 가 깨지면, 공용 헬퍼를 더해 호출부를 바꾸지 않고 고치는 방식만 허용 |
| R6 | lockfile | 개발 branch 판을 받고 패키지 관리자로 다시 만듦(`npm install --package-lock-only` 등). 이 branch 가 더한 의존만 다시 반영 |
| R7 | Task 폴더(`{TASKS}/<TSK>/*`) | 이 Task 폴더 = 이 branch 판. 다른 Task 폴더 = 개발 branch 판 |
| R8 | 설명 문서·comment | 양쪽 문장 모두 살려 합침 |
| R9 | migration 버전 중복·역순 도착(파일명이 곧 버전. `migration-check.mjs --staged` 가 exit 1, 텍스트 충돌은 없을 수 있음) | **이 branch 가 추가한 migration 만** 그 폴더의 개발 branch 최대 버전 다음 번호로 옮긴다(`git mv`, 설명 부분은 그대로). 여럿이면 원래 순서대로 이어서 매김. 번호 모양은 그 폴더의 관례(`V5`·`V005`·`V1_2`)를 따름. 번호는 폴더(Flyway location)마다 독립. 다른 폴더에 같은 옛 번호 파일이 있어도 짝이 아니므로 함께 안 옮김(방언별 폴더로 같은 버전을 짝지어 둔 리포만 그 짝을 같은 새 번호로 옮김). 이 branch 가 이미 merge 된 V 파일을 고쳤으면(comment 한 줄도 체크섬을 바꿈) 그 수정은 되돌리고 새 번호 파일로 옮겨 씀. 옛 파일명·버전을 가리키는 참조(test 의 파일명 문자열·Flyway `target`·design.md 등)를 `git grep -n '<옛 파일명>'` 으로 찾아 함께 고침. 개발 branch 쪽 파일은 안 건드림. 끝나면 `migration-check.mjs --staged` 가 exit 0 이어야 함 |

공용 결정 기록(`docs/<모듈>/decisions.md` 등, `## D-NNN (…)` 블록 기록)의 충돌:

- 위 규약보다 먼저 `node .claude/skills/dflow-merge/scripts/decisions.mjs merge-conflicts` 로 푼다(R1 의 기계적 형태 — 양쪽 블록 모두 남김).
- 임시 ID(`D-<TSK>-<n>`) 번호를 손으로 안 매김 — `/dflow-merge` 「결정 번호 매김」 이 merge commit 뒤에 매김.
- 스크립트가 `DECISIONS_LEFT` 로 남긴 파일(기존 블록 수정 등)만 R8 로 풂.

### blocked 로 멈추는 경우

- 양쪽 기능을 모두 살리는 해소 없음(한쪽 동작을 바꿔야만 통과).
- 다른 Task 의 공개 계약(API 모양·DB 스키마·이벤트 페이로드)을 바꿔야 함.
- migration 파일 **내용**이 충돌(같은 파일을 양쪽이 고침).
- 번호 바꿔야 하는 migration 이 이미 공용 DB(운영·스테이징·공유 개발 DB)에 적용됐다고 보임(적용 이력과 얽혀 번호를 다시 매길 수 없음).
  - 예외: 이 branch 가 새로 추가해 아직 개발 branch 에 없는 migration 의 번호 겹침·역순 도착은 안 멈추고 R9 로 풂.
- test 를 지우거나 `skip` 하거나 기대값을 느슨하게 해야만 통과.
  - 예외: R2·R3 의 목록 정리. 단정 대상을 바로잡는 일이기 때문.
- 이미 merge 된 다른 Task 의 소유 파일을 R5 범위 넘어 고쳐야 함.

## 게이트

dev-discipline 「게이트 기준선」 과 같은 판정.

- 기준선 = 3번에서 `<BASE>` 로 잰 것.
- 판정 대상 = **commit 하기 전에 stage 한 해소 merge 트리**(`dflow-merge/references/resolve.md` 「해소 머지」 5번).
- 순서: **해소·stage → 게이트 → 기록 → commit**(기록은 아래 「기록」 절).
- 통과 조건: **기준선 대비 신규 실패 0 + test 총수가 하한(개발 branch 총수 + (MERGE_HEAD 단독 총수 − merge-base
  총수) − 계획 삭제 수) 이상**.
- 뜻: merge 결과에 개발 branch 의 test 전부와 이 branch 가 더한 test 전부가 있어야 함. 이 branch 가 스스로 지운 test 는 이미 (MERGE_HEAD 단독 − merge-base) 에 빠져 있음.

**계획 삭제 수**(`planned_drop`, 기본 0) = 해소하며 지우는 test 중, 이 Task 나 상대 Task 의 design.md 가 삭제를 **명시적으로** 계획한 것의 수.

- 예: R3 로 이 branch 방식을 걷어내며 그 방식의 test 가 개발 branch 쪽 test 와 겹쳐 하나로 합쳐지는 경우.
- 이 branch commit 이 이미 지운 test 는 안 넣음 — 하한에 이미 반영돼 두 번 빼게 됨.
- 0 이 아니면 지운 test 마다 이름과 design.md 근거(파일·절)를 `resolution.md` 그 시도 절에 적음.
- 근거 못 적는 삭제는 계획 삭제 아님(「blocked 로 멈추는 경우」 의 test 삭제).

기준선 수들과 merge 결과 총수·하한은 `resolution.md` 의 그 시도 절에 함께 적음(「기록」). 판정은 아래 블록 그대로(값만
채움). 값이 비었거나 숫자 아니면(자리표시 남은 경우 포함) 통과시키지 않음.
```bash
dev_total='<개발 브랜치 총수>'; head_total='<MERGE_HEAD 단독 총수>'; base_total='<merge-base 총수>'; planned_drop='<계획 삭제 수, 없으면 0>'
total='<머지 결과 총수>'; new_fail='<기준선 대비 신규 실패 수>'
num() { case "$2" in ''|*[!0-9]*) echo "GATE_FAIL invalid $1=$2"; return 1 ;; esac; }
num dev_total "$dev_total" && num head_total "$head_total" && num base_total "$base_total" && num planned_drop "$planned_drop" \
  && num total "$total" && num new_fail "$new_fail" && {
  need=$(( dev_total + head_total - base_total - planned_drop ))
  if [ "$new_fail" -eq 0 ] && [ "$total" -ge "$need" ]; then echo "GATE_PASS need=$need total=$total"; else echo "GATE_FAIL new=$new_fail total=$total need=$need"; fi
}
```
`GATE_FAIL` 이면:

- `dflow-merge/references/resolve.md` 「해소 머지」 5번대로 commit 안 하고 `git merge --abort` 로 merge 버림(HEAD 는 `<BASE>` 그대로).
- 결과 = `failed gate <신규 실패 수>`(총수 부족이면 `<n>` = 모자란 수 `need − total`).
- `GATE_FAIL invalid …` 이면 기준선 다시 재서 채움. 그래도 못 채우면 `failed gate invalid`.

추가 조건:

- test 와 별도로 `node .claude/skills/dflow-merge/scripts/migration-check.mjs --staged` 가 exit 0 이어야 함(R9 빠뜨리면 `failed gate migration`).
- build·lint·타입 검사가 대상 리포 기준선 명령에 있으면 같이 봄.
- 기준 이동이나 push 경합으로 다시 merge 했으면 기준선부터 다시 잼(merge-base 도 다시 구함).

총수는 전체로 판정. 3번에서 스위트별 총수 적어 뒀으면 스위트마다 "개발 branch + (MERGE_HEAD 단독 − merge-base)" 이상인지도 봄.
어느 스위트가 모자라면 전체가 통과해도 그 스위트의 사라진 test 를 찾아 되살리거나, 계획 삭제로 근거를 적음(다른 스위트에서 늘어난 test 가 감소를 가림).

## 기록

- 「게이트」 를 통과한 **뒤, commit 하기 전에** 적음.
  - 해소한 파일마다 적용한 규약 번호와 판단을 `{TASK_DIR}/resolution.md` 의 `## 시도 {ATTEMPT}` 절에 덧붙임.
  - 같은 절에
    `게이트: 개발 브랜치 <dev_total> · MERGE_HEAD 단독 <head_total> · merge-base <base_total> · 계획 삭제 <planned_drop> · 하한 <need> · 결과 <total>`
    한 줄. 계획 삭제 있으면 그 test 이름과 design.md 근거. 스위트별로 쟀으면 그 표.
  - `resolution.md` 를 파일명으로 stage 해 merge commit 에 함께 담음.
  - merge commit 본문 둘째 문단에 요약(충돌 파일 수·규약 번호).
  - 게이트 실패하면 commit 없으므로 이 기록도 안 남음(결과 줄 `failed gate <n>` 이 기록).
- 겪은 문제는 `worker-prompt.md` 「7-1」 절(`.issues`)의 형식으로 적고, phase 칸은 `resolve` 로 씀. 그 절 없으면 안 씀.
  그 절만 읽는다: `sed -n '/^## 7-1\. 문제 기록/,/^## 8\. /{/^## 8\. /!p;}' {MAIN_CHECKOUT}/.claude/skills/dflow-team/references/worker-prompt.md`

## 결과 줄

`{TASK_DIR}/.result` 에 한 줄 쓰고(디렉터리 없으면 만듦) 같은 줄을 마지막 응답으로도 출력. 형식은
`worker-prompt.md` 「7」 과 같음: `{TSK} {ID8} <branch|-> <head|-> <done_exit|-> <status> <사유>`.

해소 워커 칸 값:

- `branch` = `-`. 특별한 값 안 넣는 이유: 팀장 결과 표가 그 칸을 branch 이름으로 읽기 때문. 해소 결과인지는 슬롯의 `spawn_kind` 로 가름.
- `head` = push 한 merge commit 의 **전체 sha**(`RESOLVE_PUSHED` 의 첫 값, 없으면 `-`).
- `done_exit` = `-`.

| status | 언제 | 사유 |
|---|---|---|
| `resolved` | 해소(또는 충돌 없이 merge)하고 게이트 통과·push 성공 | `base=<BASE> files=<충돌 파일 수> rules=<R번호,…|-> tests=<통과/총수> need=<하한>`. `총수` = merge 결과 총수, `하한` = 「게이트」 의 `need`. 충돌 없었으면 `files=0 rules=-` |
| `skipped` | `/dflow-merge` 가 해소 전에 건너뜀(이미 merge 됨·반려·승인 뒤 변경 등) | 그 보고 문구 |
| `blocked` | 「blocked 로 멈추는 경우」 | 질문과 선택지 한 줄 |
| `failed <사유>` | `gate <n>`·`push-race`·`push-hook`·`push-other <exit>`·`not-detached`·`deps …`·`permission …`·`rate-limit`·부트스트랩 실패 값 | 첫 낱말이 팀장이 구분하는 값 |

## 금지

- test 삭제·`skip`·기대값 완화로 게이트 통과.
- agent branch 수정·rebase·force push. hook 우회(SKIP_GUARD).
- 서버 쓰기(claim·progress·done·heartbeat·release). `{ID8}` 외 주문 조회.
- `git config` 로 rerere 켜기(공용 설정이 바뀜). 명령줄 `-c` 만 사용.
- 팀장 checkout 에서 git 조작.

## 도커

해소 워커도 기준선과 게이트를 돌리므로 `.claude/skills/dflow-dev/references/dev-discipline.md` 「도커 사용 규칙」(정본) 따름.

- `{DOCKER}` 가 `allow` 아님(기본) 또는 `dflow.mjs config no_docker` 가 `1`:
  - 도커·Testcontainers 명령을 3번 기준선과 게이트에서 같은 방식으로 뺌.
  - 생략한 명령은 `resolution.md` 그 시도 절에 `- 도커 금지로 생략: <명령>` 으로 적음(merge 뒤 팀장 스윕의 방언 검증이 이 줄을 세어 결과에 함께 적음).
- `allow` 이면: 도커 쓰는 명령을 「7」 의 `heavy.mjs --pool docker` 로 감싸고 대상 리포의 컨테이너 재사용 방식을 따름.
- 꺼진 도커 런타임은 언제나 안 켬.
