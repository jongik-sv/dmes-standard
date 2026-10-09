---
name: dflow-merge
description: 승인(approved)된 D'Flow 작업의 agent 브랜치를 개발 브랜치(`.dflow.local` 의 `dev_branch`)에 반영. 스택 브랜치는 조상 순서대로, approved 확인 전 머지 금지(팀장 전용 --on-report 만 예외). 트리거 - "/dflow-merge", "승인된 작업 머지", "approved 반영". 사용법 - /dflow-merge [<ref>...]
---
<!-- dflow-caps: remote-candidates — 팀장·워커가 이 줄로 기능 지원을 판정한다. 지우거나 바꾸지 않는다. -->

# /dflow-merge — 승인된 작업의 main 반영

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

인자: `$ARGUMENTS` (선택: ref 목록. 없으면 「절차」 1번의 로컬·원격 후보 전부)

**`--on-report`(팀장 전용, 승인 전 머지)**
- `/dflow-team` 팀장이 자동 머지 모드에서만 붙임. 사람 직접 사용 안 함. description 사용법에 노출 안 함.
- 반려 안 된 `status=reported` 도 머지(2번). 사람의 사후 승인은 다음 스윕이 「승인 전 머지분」 으로 정리.
- 플래그 없으면 approved 만 머지.

**`--resolve <ref>`(팀장이 띄운 해소 워커 전용)**
- 사람 직접 사용 안 함. description 사용법에 노출 안 함.
- ref 정확히 하나 + `--attempt <n>`(1-3) 동반. `--on-report` 동반 시 그 판정도 그대로.
- **이 플래그면 지금 `references/resolve.md` 를 읽고 그 절차(「해소 머지」)를 따른다.** 이 파일 「절차」 는 그 문서가 가리키는 단계만 쓴다.
- 플래그 없는 수동 사용·팀장 스윕은 충돌하면 파일 목록 보고 후 `--abort` (4번 3단계).

> **위치 선언**: /dflow-dev 는 done(reported, 승인 대기)에서 끝남. 사람이 D'Flow 웹에서 approve 한 뒤 그 브랜치를 main 에 합치는 것이 이 스킬.
> 이게 없으면 후속 작업의 선행 게이트(`merge-base --is-ancestor` 검사)가 영원히 거짓, 스택 브랜치가 무한히 깊어짐.
> 서버 통신 = dflow.sh, exit code 분기, dflow-work 금지사항 상속.

**분기별 읽을 파일**(그 분기에 들어설 때만 읽음. 경로 기준 `.claude/skills/dflow-merge/`)
- `--resolve` → `references/resolve.md`
- 호출한 체크아웃이 기본 브랜치에 있지 않음 → `references/merge-worktree.md`
- 로컬 스캔에 `merged` 줄 → `references/unapproved.md`
- push 실패 → `references/push-fail.md`
- 스윕 보고 직전(`dialect_check` 설정 시) → `references/dialect.md`
- 결정 번호·마이그레이션 관문 출력 해설, 설정 변경 → `references/script-details.md`
- 근거·사고 이력 = `references/rationale.md` (실행에 불필요, 규칙 바꿀 때만 읽음)

## 절차

`<기본브랜치>` = 개발 브랜치 = `dflow.sh branch dev` 값(`.dflow.local` 의 `dev_branch`, 레거시는 `origin/HEAD`). 팀원(`--worker`)은 팀장이 넘긴 `DEV_BRANCH` 사용.

작업 폴더 `<TASKS>` = `<DOCS_DIR>/tasks` (리포 최상위 기준).
- 한 주문의 폴더 `<TASKS>/<TSK>` = `dflow.sh taskdir <ref>` 값(`.dflow.local` 의 `project_map`, 없으면 `docs`).
- 여러 작업을 훑을 때는 `dflow.sh config tasks-dirs` 가 내는 폴더 전부.
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 금지.

1. **후보 식별**: 인자 없으면 아래 원격·로컬 두 스캔이 낸 줄이 후보. **정본 = 이 두 셸 블록.** (`scripts/sweep-check.sh` 는 이 1번을 흉내 낸 사전 검사일 뿐 — 이 번호 끝 항목.)
   - **원격 스캔**: `origin/agent/*` 마다 `origin/<기본브랜치>...<ref>` 차분에서 `tasks-dirs` 폴더별 pathspec(`<그 폴더>/*/state.json`)으로 state.json 을 찾아 `git show <ref>:<경로>` 로 읽음.
     - `git show` 에 glob 금지. 고정 glob `*/tasks/*/state.json` 금지.
     ```bash
     cd "$(git rev-parse --show-toplevel)" || exit 1   # tasks-dirs·pathspec 은 리포 최상위 기준이다
     api=$(.claude/skills/dflow-work/scripts/dflow.sh config api_base); api=${api%/}
     git fetch origin
     dirs=$(.claude/skills/dflow-work/scripts/dflow.sh config tasks-dirs); rc=$?
     { [ "$rc" = 0 ] && [ -n "$dirs" ]; } || { echo "건너뜀(tasks-dirs 조회 실패, exit $rc)"; exit 1; }
     printf '%s\n' "$dirs" | {
       set --
       while IFS= read -r d; do set -- "$@" "$d/*/state.json"; done
       for ref in $(git branch -r --list 'origin/agent/*'); do
         id8=$(printf '%s' "${ref#origin/agent/}" | cut -c1-8)
         git diff --name-only "origin/<기본브랜치>...$ref" -- "$@" | while IFS= read -r p; do
           git show "$ref:$p" | jq -r --arg ref "$ref" --arg id8 "$id8" --arg api "$api" --arg p "$p" \
             'select((.order // "") | startswith($id8)) | select(.phase != "merged" and .phase != "wait_pred" and .phase != "wait_review")
              | [$ref, .tsk, .order, .phase, (if (.api_base // "") == "" then "none" elif .api_base == $api then "same" else "other" end), $p] | @tsv'
         done
       done
     }
     ```
     - `tasks-dirs` 실패(exit≠0)·빈 값 → 후보 식별 **안 함**. "건너뜀(tasks-dirs 조회 실패)" 보고 후 멈춤(블록이 `rc`·빈 값을 먼저 봄).
     - `$dirs` 를 here-doc(`<<EOF`)으로 넘기지 않음.
     - 여섯째 칸(`$p`) = 그 state.json 의 정확한 경로. 4번이 `<후보 state.json 경로>` 로 그대로 씀. 다시 `dflow.sh taskdir` 부르지 않음.
     - 브랜치 이름 id8 = state.json `order` 앞 8자 + **`phase` ≠ `merged` 면 전부 후보**. tip 의 phase 에 기대지 않음. 판정은 서버 `show`.
     - 단 `wait_pred`(설계 완료·선행 대기, `/dflow-dev` 「설계 선행」)와 `wait_review`(설계만 하고 검토 대기, `/dflow-dev` 「실행 범위」)는 제외. 완료 보고 전 설계만 push 한 브랜치라 머지할 것이 없음. 넣으면 선행·검토가 끝날 때까지 스윕마다 후보로 잡힘.
     - 일치하는 state.json 없는 브랜치 = 후보 아님.
     - 원격에만 있는 후보의 머지 대상 = `origin/agent/<id8>-<slug>`.
   - **로컬 스캔**: `<TASKS>/*/state.json` 중 `phase=reported`, 또는 `phase=merged` + `unapproved=true`.
     ```bash
     cd "$(git rev-parse --show-toplevel)" || exit 1   # tasks-dirs 는 최상위 기준. $f 도 최상위 기준 경로로 나와야 <W>/<경로> 로 재사용된다
     api=$(.claude/skills/dflow-work/scripts/dflow.sh config api_base); api=${api%/}   # 원격 스캔 블록과 별도 호출이라 다시 구한다
     .claude/skills/dflow-work/scripts/dflow.sh config tasks-dirs | while IFS= read -r d; do
       find "$d" -mindepth 2 -maxdepth 2 -name state.json 2>/dev/null
     done | while IFS= read -r f; do
       jq -r --arg f "$f" --arg api "$api" 'select(.phase == "reported" or (.phase == "merged" and .unapproved == true))
         | [$f, .tsk, .order, .phase, (if (.api_base // "") == "" then "none" elif .api_base == $api then "same" else "other" end)] | @tsv' "$f"
     done
     ```
     - 첫째 칸(`$f`) = 그 state.json 의 정확한 경로(원격 `$p` 와 같은 역할, 4번이 그대로 씀). glob(`<TASKS>/*/state.json`) 금지.
     - 넷째 칸 `merged` 인 줄 = **승인 전 머지분**(`--on-report` 가 `unapproved: true` 를 남김). 이미 기본 브랜치에 있으므로 머지 대상 아님. 2번 「승인 전 머지분 판정」 만 받음. 플래그와 무관하게 늘 봄.
   - **로컬·원격 중복**: 같은 order 가 양쪽에 있으면 로컬 후보 하나로 합쳐 로컬 규칙으로 판정.
     - 합친 후보의 `api_base` = 값 있는 쪽(스캔 출력 마지막 칸이 `none` 아닌 쪽). 둘 다 값이 있고 다르면 "건너뜀(다른 D'Flow)" 보고.
     - 머지 대상 = 증적 head_sha 를 포함하는 쪽(`git merge-base --is-ancestor <증적 head_sha> <그 브랜치>` 가 참).
     - 그 밖(둘 다 포함, 또는 증적에 head_sha 없음)은 로컬 브랜치 `agent/<id8>-<slug>`, 로컬 브랜치가 없으면 원격 브랜치.
   - **`api_base` 필터**: 순서 = 중복 제거 → `api_base` 필터.
     - 후보 state.json 의 `api_base` ≠ 현재 `DFLOW_API_BASE`(끝 `/` 제거)면 로컬·원격 모두 "건너뜀(다른 D'Flow)" 보고.
     - 중복 제거 뒤 남은 원격 후보는 값이 없어도 건너뜀(마지막 칸 `none`·`other`).
     - 값 없는 로컬 후보(옛 state.json)는 그대로 판정.
     - `/dflow-team` 팀장은 그런 후보가 있으면 시작하지 않음.
   - **서버 조회**: state.json 의 전체 UUID 로 조회. show 출력에서 jq 로 `.order.status`, 마지막 `kind=completion` 리포트의 `review_action`·`review_note`, 완료 증적 `head_sha`(4번 승인 뒤 변경 확인용)만 뽑음. spec 본문은 싣지 않음.
     ```bash
     j=$(.claude/skills/dflow-work/scripts/dflow.sh show <order 전체 UUID>); echo "show=$?"
     printf '%s' "$j" | jq -c '{status: .order.status, last: ([.reports[]? | select(.kind == "completion")] | last | {review_action, review_note, head_sha: .evidence.head_sha})}'
     ```
   - **사전 검사 `scripts/sweep-check.sh`**: 이 1번을 서버 조회 없이 흉내 내는 **상위 집합**. 출력 계약(마지막 줄이 판정):
     - `SWEEP_CANDIDATES n=<N> <id8…>`
     - `SWEEP_NONE` (이 스킬 호출 안 함)
     - `SWEEP_UNKNOWN <사유>` (스윕 실행)
     - 판정 줄 앞의 `SWEEP_DIALECT_PENDING <sha>` (`SWEEP_NONE` 이어도 `dialect-check.sh` 한 번 호출)
     - 호출자 = `/dflow-team` 「4-0. 스윕을 부르는 규칙」, `/dflow-dev` Phase 01-가.
     - 이 1번을 바꾸면 스크립트도 같이 수정(`tests/skills/dflow-sweep-check.test.ts` 가 두 블록과 스크립트의 후보를 대조).
2. **판정: approved 만 진행**(`--on-report` 면 승인 대기도). 후보마다 아래 중 하나로 보고. 승인 대기·데이터 없음으로 뭉개지 않음.
   **approved 확인 전 머지 절대 금지** — 로컬 state·기억이 아니라 show 응답이 판정.
   예외 = `--on-report` 의 승인 대기 머지 하나뿐. 그 판정도 show 응답으로.
   - `status=approved`: 머지 대상.
   - `--on-report` + `status=reported` + 마지막 completion 리포트 `review_action` ≠ `reject`: 머지 대상(**승인 전 머지**). 4번 4단계에서 state.json 에 `unapproved: true` 도 남김. 플래그 없으면 아래 "승인 대기".
   - 마지막 completion 리포트 `review_action=reject`: "반려: 재작업 필요 (<review_note>)" (dflow-dev Phase 01 1번 반려 판정과 같은 기준). 로컬 후보도 state.json 수정 없이 보고만(`rejected` 로 바꾸지 않음).
   - `status=reported`: "승인 대기".
   - 그 밖의 status: "건너뜀(서버 <status>)".
   - show 404(dflow.sh exit 7) 또는 그 밖의 실패: "건너뜀(조회 실패)".

   **승인 전 머지분 판정**(1번 로컬 스캔 넷째 칸이 `merged` 인 후보): 절대 다시 머지하지 않음. 그런 후보가 있으면 `references/unapproved.md` 를 읽고 같은 show 로 분류(승인 반영·반려(머지됨)·승인 대기(머지됨)·건너뜀).
3. **순서: 스택은 조상 먼저**: 대상이 여럿이면 브랜치 tip 이 아니라 후보 state.json 의 `branch_base` 로 조상 관계를 판정해 조상부터 머지.
   - 선행이 approved 가 아니어서 조상 브랜치를 머지할 수 없으면 그 위 후손도 이번엔 머지 안 함. 선행을 건너뛰고 후손만 합치면 미승인 커밋이 main 에 섞임.
   - `--on-report` 면 "approved 가 아니어서" = "2번의 머지 대상이 아니어서" (반려·조회 실패 등).
   - `branch_base`(기점 커밋. `/dflow-dev` 「--worker」 B 면 선행 완료 증적의 head_sha)가 없거나 `origin/<기본브랜치>` 의 조상이면 스택 아님.
   - 아니면 스택. 선행 = `git merge-base --is-ancestor <branch_base> <그 후보의 머지 대상>` 이 참인 다른 후보. 그런 선행 후보가 없으면 "건너뜀(기점 미반영)" 보고.
   - `branch_base` 가 커밋으로 안 풀리면(옛 state.json 은 브랜치 이름일 수 있음) 그 후보만 브랜치 tip 끼리 `git merge-base --is-ancestor A B` 로 판정.
   - **차분 백스톱**: `branch_base` 판정과 별도로, `git diff --name-only origin/<기본브랜치>...<그 후보의 머지 대상> --` 뒤에 1번과 같이 구성한 pathspec 을 붙인 결과에 그 작업 외의 state.json 이 있으면, 그 파일(`git show <그 후보의 머지 대상>:<경로>`)의 `order` 가 가리키는 작업들도 선행으로 보고 위 순서·승인 판정에 넣음.
     - 그 선행이 이번에 머지되지 않았으면 후손을 건너뜀.
     - 후보에 없으면 "건너뜀(기점 미반영)" 보고.
4. **머지**: 먼저 머지 자리 결정.
   - 호출한 체크아웃의 현재 브랜치 = `<기본브랜치>` → 그 체크아웃에서 아래 블록 그대로 머지.
   - 아니면(detached HEAD·다른 브랜치) **임시 머지 워크트리** `<W>` 에서 머지. 스윕 시작 때 `references/merge-worktree.md` 를 읽고 따름. 호출한 체크아웃은 건드리지 않음.
   ```bash
   git fetch origin && git switch <기본브랜치> && git pull --ff-only origin <기본브랜치>
   git rev-parse HEAD                      # 머지 직전 HEAD. 값을 기록해 둔다
   git merge-base --is-ancestor <증적 head_sha> <머지 대상>   # 증적에 head_sha 가 있을 때만. 0 이 아니면(커밋이 없거나 조상이 아님) 머지하지 않는다
   git diff --name-only <증적 head_sha>..<머지 대상>   # 증적에 head_sha 가 있을 때만. 실패하면 머지하지 않고, 그 작업의 state.json 뿐이거나 비어 있어야 머지한다
   git merge --no-ff <머지 대상> -m "merge: <TSK> <제목> (approved)" -m "DFlow-Order: <order>"   # 로컬 후보 agent/<id8>-<slug>, 원격 전용 후보 origin/agent/<id8>-<slug>. 승인 전 머지는 (reported, 승인 전). <order> 는 그 후보 state.json 의 order. git merge 는 --trailer 를 모른다(git commit 전용) — 둘째 -m 이 빈 줄 뒤 문단이 되어 트레일러로 인식된다
   .claude/skills/dflow-merge/scripts/decisions.sh renumber --tsk <TSK> --order <order>   # 「결정 번호 매김」. 임시 ID 가 없으면 NO_TEMP_IDS 로 아무것도 하지 않는다
   git add "<후보 state.json 경로>" && git commit -m "chore(<TSK>): phase=merged" \
     && git push origin <기본브랜치>   # state.json 을 phase=merged 로 고친 뒤 push. add·commit 이 실패하면(경로 없음 등) && 사슬이 끊겨 push 하지 않는다
   ```
   후보마다 다음 순서.
   1. 블록 첫 줄(fetch·switch·pull) 뒤 머지 직전 HEAD 기록.
   2. **승인 뒤 변경 확인**(승인 전 머지면 "보고 뒤 변경 확인". 규칙 같고 증적은 완료 보고의 것):
      - 머지 조건: `<증적 head_sha>`(1번 show 출력의 `head_sha`)가 로컬에 있음 + 머지 대상의 조상(`git merge-base --is-ancestor <증적 head_sha> <머지 대상>` 참) + `git diff --name-only <증적 head_sha>..<머지 대상>` 성공 + 결과가 그 작업의 `<TASKS>/<TSK>/state.json` 뿐이거나 빔.
      - 다른 파일 있음 → "건너뜀(승인 뒤 변경)".
      - head_sha 가 로컬에 없음 / 머지 대상의 조상 아님 / `git diff` 실패 → "건너뜀(승인 뒤 변경 확인 불가)".
      - 위 보고 후 다음 후보로.
      - 증적에 `head_sha` 자체가 없는 옛 완료 보고 → 이 확인 건너뛰고 머지, 보고에 "승인 뒤 변경 확인 불가" 추가.

      **강제 진행 스텁 관문**: 개발 브랜치 = 운영 브랜치(`dflow.sh branch dev` 와 `dflow.sh branch release` 가 같은 값)면 머지 전에 `dflow.sh stub-check <머지 대상>` 실행.
      - exit 4 → 머지 안 함. 「스텁 잔존 — 개발 브랜치 미설정 리포라 운영에 스텁이 들어간다」 보고 후 다음 후보로.
      - 두 브랜치가 다르면 이 검사 안 함.

      **마이그레이션 버전 관문**: 머지 전에 `.claude/skills/dflow-merge/scripts/migration-check.sh HEAD <머지 대상>` 실행(「마이그레이션 버전 관문」, 임시 머지 워크트리면 `-C "$W"`).
      - exit 1(버전 중복·역순 도착) → 머지 안 함. `머지 실패(충돌) <MIGRATION_FILES 의 파일,…> (마이그레이션 버전)` 보고 후 다음 후보로. 팀장은 텍스트 충돌과 똑같이 해소 워커에 넘김.
      - exit 2(판정 불가) → 머지 안 함. "건너뜀(마이그레이션 검사 실패)" 보고.
   3. `git merge --no-ff <머지 대상>`. 충돌하면 먼저 공용 결정 기록(`decisions.md`) 충돌만 스크립트로 해소(「결정 번호 매김」).
      - 남은 충돌 없음 → `git commit --no-edit --cleanup=strip` 으로 머지 완성 후 3-1 로. (`-m` 두 문단과 트레일러는 `MERGE_MSG` 에 남아 있고, `--cleanup=strip` 이 `# Conflicts:` 주석을 지움.)
      - 남은 충돌 있음 → 목록을 읽은 뒤 `git merge --abort` 로 되돌리고 "머지 실패(충돌)" 보고 후 다음 후보로. 충돌 상태로 두지 않음.
      - 사람이 그 자리에서 충돌을 손으로 풀어 `git merge --abort` 대신 직접 `git commit` 으로 완성하는 경로도 있음. 이 경로에도 「트레일러 고정」 적용.
      - 충돌 파일 목록은 `--abort` **전에** 읽음(뒤에는 빔). 보고 줄 = `머지 실패(충돌) <파일,…>` (스크립트가 푼 decisions.md 제외).
      - 임시 머지 워크트리에서는 git 명령을 `git -C "$W"`, 스크립트를 `-C "$W"` 붙여 호출.
      ```bash
      .claude/skills/dflow-merge/scripts/decisions.sh merge-conflicts   # 공용 decisions.md 충돌만 푼다. DECISIONS_RESOLVED·DECISIONS_LEFT
      git diff --name-only --diff-filter=U | paste -sd, -   # 남은 충돌 파일 목록(쉼표로 이음). 비었으면 아래 commit, 아니면 --abort
      git merge --abort
      ```
      ```bash
      git commit --no-edit --cleanup=strip   # 남은 충돌이 없을 때만. 머지 완성
      ```
   3-1. **결정 번호 매김**: 머지 커밋 뒤 `decisions.sh renumber --tsk <TSK> --order <order>` 실행(「결정 번호 매김」).
      - `NO_TEMP_IDS` → 커밋 없음.
      - `COMMITTED <sha>` → 번호 매김 커밋이 머지 커밋 위에 생김(5단계 push 에 함께 실림).
      - `RENUMBER_DIRTY`·`RENUMBER_FAILED …` → 머지를 막지 않음(스크립트가 자기 변경을 되돌림). 4단계로 가고 보고에 "결정 번호 매김 실패(<출력>)" 추가.
      - `UNION_SET`·`DUP_*`·`DECISIONS_SEQ` 줄도 머지를 막지 않음(6번대로 싣음).
      - 번호 매김 실패 + 그 머지에 중복 있었음 → "결정 번호 중복 — 사람이 고쳐야 함" 보고.
   4. state.json 을 `phase=merged` 로 갱신해 기본 브랜치에 커밋(파일명 명시). `<후보 state.json 경로>` = **1번 후보 식별이 이미 찾은 그 경로**(로컬 `$f`, 원격 `$p`). 여기서 `dflow.sh taskdir` 다시 부르지 않음.
      - `git add` 실패(경로 빔 / 그 시점 트리에 파일 없음 / stage 안 됨) → **커밋·push 안 함**. "머지 실패(state.json 경로)" 보고 후 다음 후보로.
      - 이 커밋을 **push 전에** 만듦.
      - 승인 전 머지면 같은 커밋에 `unapproved: true` 도 넣음.
      - `phase` 를 `merged` 아닌 새 값으로 만들지 않음(행 G 의 반영 확인과 `poll.sh` 의 반려 감지가 `merged` 를 봄).
   5. `git push origin <기본브랜치>` 로 머지와 `merged` 커밋을 한 번에 올림. push 실패 시 먼저 `git reset --keep <기록한 HEAD>` 로 되돌리고, `references/push-fail.md` 를 읽어 거부 모양(경합·훅·그 밖)으로 분류. `origin` 으로 리셋 금지.

   `--no-ff` 고정 — 작업 단위 경계가 머지 커밋으로 남아야 추적 가능. push 가 훅에 거부되면 우회 금지. 되돌리고 보고한 뒤 그 작업과 후손만 빼는 절차 = `references/push-fail.md`.

   **트레일러 고정**: 이 스킬이 만드는 모든 머지 커밋에 `DFlow-Order: <order>` 트레일러를 붙임(`<order>` = 그 후보 state.json 의 `order`, 주문 UUID).
   - `git merge` 에는 `--trailer` 가 없으므로(`git commit` 전용) 3단계는 위 블록처럼 둘째 `-m "DFlow-Order: <order>"` 사용(빈 줄 뒤 단독 문단이 트레일러가 됨).
   - 충돌을 손으로 풀어 직접 `git commit` 으로 완성할 때는 `git commit --trailer "DFlow-Order: <order>"`.
   - 어느 경로든 결과 메시지에 이 트레일러가 있어야 함 — `/dflow-dev` 「--worker」 행 G 의 반영 확인이 보는 증거. "자동 스윕이 아니다" 는 빠뜨릴 이유가 안 됨.
5. **뒷정리** (머지된 작업마다):
   - 머지된 `agent/` 브랜치 삭제.
   - 원격 삭제(`git push origin --delete agent/<id8>-<slug>`)는 그대로 실행.
   - 로컬 삭제(`git branch -d agent/<id8>-<slug>`)는 브랜치 없음(not found) 또는 다른 워크트리가 잡고 있음(checked out)이면 건너뛰고 보고.
   - 아직 미승인인 후손 스택 브랜치는 **삭제·rebase 금지**. 이미 머지된 커밋을 조상으로 포함하므로 그대로 두면 제 차례에 깨끗이 머지됨.
6. **보고**: 아래 항목을 표로.
   - 머지됨 / 머지됨(승인 전) / 승인 반영(이미 머지됨) / 승인 대기 / 승인 대기(머지됨)
   - 반려: 재작업 필요 (<review_note>)
   - 반려(머지됨): 되돌리기 또는 재작업 필요 (<review_note>, 그 위에 쌓였을 수 있는 작업)
   - 머지 실패(충돌) <파일,…> / push 실패(경합) / push 실패(훅) / push 실패
   - 건너뜀(서버 <status>·조회 실패·다른 D'Flow·조상 미승인·기점 미반영·승인 뒤 변경·승인 뒤 변경 확인 불가·마이그레이션 검사 실패·로컬 브랜치 삭제 건너뜀)

   - 반려·반려(머지됨)·머지 실패(충돌)·push 실패(훅)는 id8 과 함께 따로 적음. 호출자(`/dflow-team` 팀장 등)가 이 목록으로 후속 처리.
   - 머지된 작업에 3-1단계 번호 매김 결과(`D-TSK-…→D-NNN`, `DUP_RENUMBERED` 로 중복을 옮겼으면 `D-050→D-053(중복)`)가 있으면 그 줄에 붙임.
   - 표 아래에 그 작업 id8 과 함께 그대로 적는 줄: "결정 번호 매김 실패(<출력>)" · `UNION_SET <파일>` · `DUP_REF_REPLACED` · `DUP_REF_AMBIGUOUS`(사람이 볼 위치) · `DUP_LEFT` · `DECISIONS_SEQ`.
   - 보고 쓰기 전에 「방언 검증」 한 번 실행(스윕이 중간에 멈췄어도, 머지 0건이어도 실행 — 보류된 커밋을 다시 시도). 결과 줄(`DIALECT_*`, `DIALECT_SKIP` 제외)과 `DIALECT_UNVERIFIED` 줄을 표 아래에 그대로 싣음.

## 방언 검증

같은 목적의 도커 검증(DB 방언 검증 등)은 워커가 하지 않음(정본 dev-discipline 「도커 사용 규칙」). 이 스윕이 **스윕 한 번에 한 번, 마지막 머지 커밋(스윕 끝의 `origin/<기본브랜치>`)에서** 실행. 머지마다 실행 안 함. **도커 런타임을 켜지 않음.** `--resolve` 는 이 절을 타지 않음.
- 스윕 시작의 `git fetch origin` 직후 `git rev-parse origin/<기본브랜치>` 를 `<스윕 전 sha>` 로 기록.
- 6번 보고 직전에 `.claude/skills/dflow-work/scripts/dflow.sh config dialect_check` 확인.
- exit 0 + 빈 값 → 이 단계 없음(`DIALECT_NONE`).
- 그 밖 → `references/dialect.md` 를 읽고 그 명령을 한 번 호출.

## 결정 번호 매김

공용 결정 기록(`docs/<모듈>/decisions.md` 등, `## D-NNN (<UTC 타임스탬프>)` 블록을 추가만 하는 기록)의 전역 번호는 머지하는 이 스킬이 매김. agent 브랜치는 Task 범위 임시 ID `D-<TSK>-<n>` 만 사용(dev-discipline 「공용 결정 기록(decisions.md)의 번호」).
번호는 손으로 매기지 않음. 도구 = `.claude/skills/dflow-merge/scripts/decisions.sh` 하나, 머지 자리의 최상위에서 실행(임시 머지 워크트리면 `-C "$W"`).

- **충돌 풀기**(`merge-conflicts`, 4번 3단계·해소 머지 4번): 충돌한 decisions.md 만 블록 단위로 풀음(`DECISIONS_RESOLVED`). 못 푼 `DECISIONS_LEFT` 파일은 다른 충돌과 같이 처리.
- **번호 매김**(`renumber`, 4번 3-1단계·해소 머지 6번 뒤): 임시 ID 를 다음 전역 번호로 바꾸는 커밋 하나를 남김. 첫 단계에서 **전역 번호 중복**(두 브랜치가 같은 `## D-NNN` 보유)을 충돌 여부와 무관하게 머지 대상 쪽만 옮겨 바로잡음.
- **`merge=union` 금지.** 이미 걸려 있으면 `renumber` 가 `UNION_SET <파일>` 로 알림. 대상 리포 `.gitattributes` 에서 그 줄을 빼라고 보고.

출력 줄 뜻·사유 코드·`Temp ID`·`Renumbered from` 줄·참조를 바꾸는 범위 → `references/script-details.md` 「결정 번호 매김」.

## 마이그레이션 버전 관문

Flyway 처럼 파일명이 곧 버전인 마이그레이션(`V<버전>__<설명>.sql`)은 병렬 브랜치가 같은 번호를 고르면 **git 충돌 없이** 머지되고 개발 브랜치 기동이 깨짐.
- 머지 전에 합친 트리를 `.claude/skills/dflow-merge/scripts/migration-check.sh` 로 검사.
- 걸리면 충돌로 취급. 해소 워커(`--resolve`, `resolve-prompt.md` 「해소 규약」 R9)가 다음 번호로 재채번.
- 스윕(4번 2단계) = `migration-check.sh HEAD <머지 대상>`. 해소 머지(`references/resolve.md` 4·5번) = `migration-check.sh --staged`.
- 대상 리포가 Flyway `outOfOrder=true` 로 운영하면 팀장 세션 환경에 `DFLOW_MIGRATION_OUT_OF_ORDER=1`(또는 `--allow-out-of-order`) 설정 → 역순 검사만 끔. 중복 검사는 끄지 않음.
- 출력(`MIGRATION_*`)·버전 비교 규칙 → `references/script-details.md` 「마이그레이션 버전 관문」.

## 해소 머지(`--resolve`)

`--resolve`(해소 워커)일 때만 `references/resolve.md` 를 읽고 그 절차(「해소 머지」)를 따름. 스윕·수동 사용은 읽지 않음.

## 금지

- approved 아닌 작업의 머지(reported·claimed 포함). 서버 approve 시도.
  예외 = `--on-report` 의 반려 안 된 `reported` 하나뿐. 반려된 작업·`claimed`·승인 전 머지분의 재머지는 플래그가 있어도 금지.
- force push. 훅 우회(SKIP_GUARD).
- 머지 순서 뒤집기(후손 먼저).
- `--resolve` 의 agent 브랜치 수정·rebase, 시험 삭제·`skip`·기대값 완화로 게이트 통과. `--resolve` 도 force push·훅 우회 금지는 같음.
- 대상 저장소가 wbs-web 자신이면 G1-G4 훅 제약을 사용자에게 사전 경고.
