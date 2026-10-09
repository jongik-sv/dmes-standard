# /dflow-merge 후보 식별·판정 (스윕 시작)

SKILL.md 「절차」 1번(후보 식별)·2번(판정)에서 옮김. 스윕(`--resolve` 아님)은 후보 식별 **전** 읽음. 아래 「N번」 = SKILL.md 「절차」 번호. 4번 = `merge-exec.md`.

## 1번 후보 식별

1. **후보 식별**: 인자 없으면 아래 원격·로컬 두 스캔이 낸 줄이 후보. **정본 = 이 두 셸 블록.** (`scripts/sweep-check.mjs` 는 이 1번을 흉내 낸 사전 검사일 뿐 — 이 번호 끝 항목.)
   - **원격 스캔**: `origin/agent/*` 마다 `origin/<기본브랜치>...<ref>` 차분에서 `tasks-dirs` 폴더별 pathspec(`<그 폴더>/*/state.json`)으로 state.json 을 찾아 `git show <ref>:<경로>` 로 읽음.
     - `git show` 에 glob 금지. 고정 glob `*/tasks/*/state.json` 금지.
     ```bash
     cd "$(git rev-parse --show-toplevel)" || exit 1   # tasks-dirs·pathspec 은 리포 최상위 기준이다
     api=$(node .claude/skills/dflow-work/scripts/dflow.mjs config api_base); api=${api%/}
     git fetch origin
     dirs=$(node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs); rc=$?
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
     - 여섯째 칸(`$p`) = 그 state.json 의 정확한 경로. 4번이 `<후보 state.json 경로>` 로 그대로 씀. 다시 `dflow.mjs taskdir` 부르지 않음.
     - branch 이름 id8 = state.json `order` 앞 8자 + **`phase` ≠ `merged` 면 전부 후보**. tip phase 에 기대지 않음. 판정은 서버 `show`.
     - 단 `wait_pred`(설계 완료·선행 대기, `/dflow-dev` 「설계 선행」)와 `wait_review`(설계만 하고 검토 대기, `/dflow-dev` 「실행 범위」)는 제외. 완료 보고 전 설계만 push 한 branch 라 merge 할 것 없음. 넣으면 선행·검토 끝날 때까지 스윕마다 후보로 잡힘.
     - 일치하는 state.json 없는 브랜치 = 후보 아님.
     - 원격에만 있는 후보의 머지 대상 = `origin/agent/<id8>-<slug>`.
   - **로컬 스캔**: `<TASKS>/*/state.json` 중 `phase=reported`, 또는 `phase=merged` + `unapproved=true`.
     ```bash
     cd "$(git rev-parse --show-toplevel)" || exit 1   # tasks-dirs 는 최상위 기준. $f 도 최상위 기준 경로로 나와야 <W>/<경로> 로 재사용된다
     api=$(node .claude/skills/dflow-work/scripts/dflow.mjs config api_base); api=${api%/}   # 원격 스캔 블록과 별도 호출이라 다시 구한다
     node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs | while IFS= read -r d; do
       find "$d" -mindepth 2 -maxdepth 2 -name state.json 2>/dev/null
     done | while IFS= read -r f; do
       jq -r --arg f "$f" --arg api "$api" 'select(.phase == "reported" or (.phase == "merged" and .unapproved == true))
         | [$f, .tsk, .order, .phase, (if (.api_base // "") == "" then "none" elif .api_base == $api then "same" else "other" end)] | @tsv' "$f"
     done
     ```
     - 첫째 칸(`$f`) = 그 state.json 의 정확한 경로(원격 `$p` 와 같은 역할, 4번이 그대로 씀). glob(`<TASKS>/*/state.json`) 금지.
     - 넷째 칸 `merged` 인 줄 = **승인 전 머지분**(`--on-report` 가 `unapproved: true` 남김). 이미 기본 branch 에 있으므로 merge 대상 아님. 2번 「승인 전 머지분 판정」 만 받음. 플래그 무관하게 늘 봄.
   - **로컬·원격 중복**: 같은 order 가 양쪽에 있으면 로컬 후보 하나로 합쳐 로컬 규칙으로 판정.
     - 합친 후보 `api_base` = 값 있는 쪽(스캔 출력 마지막 칸이 `none` 아닌 쪽). 둘 다 값 있고 다르면 "건너뜀(다른 D'Flow)" 보고.
     - 머지 대상 = 증적 head_sha 포함하는 쪽(`git merge-base --is-ancestor <증적 head_sha> <그 브랜치>` 참).
     - 그 밖(둘 다 포함, 또는 증적에 head_sha 없음)은 로컬 branch `agent/<id8>-<slug>`, 로컬 branch 없으면 원격 branch.
   - **`api_base` 필터**: 순서 = 중복 제거 → `api_base` 필터.
     - 후보 state.json `api_base` ≠ 현재 `DFLOW_API_BASE`(끝 `/` 제거)면 로컬·원격 모두 "건너뜀(다른 D'Flow)" 보고.
     - 중복 제거 뒤 남은 원격 후보는 값 없어도 건너뜀(마지막 칸 `none`·`other`).
     - 값 없는 로컬 후보(옛 state.json)는 그대로 판정.
     - `/dflow-team` 팀장은 그런 후보 있으면 시작 안 함.
   - **서버 조회**: state.json 전체 UUID 로 조회. show 출력에서 jq 로 `.order.status`, 마지막 `kind=completion` 리포트 `review_action`·`review_note`, 완료 증적 `head_sha`(4번 승인 뒤 변경 확인용)만 뽑음. spec 본문은 안 실음.
     ```bash
     j=$(node .claude/skills/dflow-work/scripts/dflow.mjs show <order 전체 UUID>); echo "show=$?"
     printf '%s' "$j" | jq -c '{status: .order.status, last: ([.reports[]? | select(.kind == "completion")] | last | {review_action, review_note, head_sha: .evidence.head_sha})}'
     ```
   - **사전 검사 `scripts/sweep-check.mjs`**: 이 1번을 서버 조회 없이 흉내 내는 **상위 집합**. 출력 계약(마지막 줄이 판정):
     - `SWEEP_CANDIDATES n=<N> <id8…>`
     - `SWEEP_NONE` (이 스킬 호출 안 함)
     - `SWEEP_UNKNOWN <사유>` (스윕 실행)
     - 판정 줄 앞의 `SWEEP_DIALECT_PENDING <sha>` (`SWEEP_NONE` 이어도 `dialect-check.mjs` 한 번 호출)
     - 호출자 = `/dflow-team` 「4-0. 스윕을 부르는 규칙」, `/dflow-dev` Phase 01-가.
     - 이 1번 바꾸면 스크립트도 같이 수정(`tests/skills/dflow-sweep-check.test.ts` 가 두 블록과 스크립트의 후보를 대조).

## 2번 판정

2. **판정: approved 만 진행**(`--on-report` 면 승인 대기도). 후보마다 아래 중 하나로 보고. 승인 대기·데이터 없음으로 뭉개지 않음.
   **approved 확인 전 merge 절대 금지** — 로컬 state·기억 아닌 show 응답이 판정.
   예외 = `--on-report` 의 승인 대기 merge 하나뿐. 그 판정도 show 응답으로.
   - `status=approved`: 머지 대상.
   - `--on-report` + `status=reported` + 마지막 completion 리포트 `review_action` ≠ `reject`: 머지 대상(**승인 전 머지**). 4번 4단계에서 state.json 에 `unapproved: true` 도 남김. 플래그 없으면 아래 "승인 대기".
   - 마지막 completion 리포트 `review_action=reject`: "반려: 재작업 필요 (<review_note>)" (dflow-dev Phase 01 1번 반려 판정과 같은 기준). 로컬 후보도 state.json 수정 없이 보고만(`rejected` 로 안 바꿈).
   - `status=reported`: "승인 대기".
   - 그 밖의 status: "건너뜀(서버 <status>)".
   - show 404(dflow.mjs exit 7) 또는 그 밖의 실패: "건너뜀(조회 실패)".

   **승인 전 머지분 판정**(1번 로컬 스캔 넷째 칸이 `merged` 인 후보): 절대 다시 merge 안 함. 그런 후보 있으면 `references/unapproved.md` 를 읽고 같은 show 로 분류(승인 반영·반려(머지됨)·승인 대기(머지됨)·건너뜀).
