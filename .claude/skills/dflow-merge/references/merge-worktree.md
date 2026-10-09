# /dflow-merge 임시 머지 워크트리

SKILL.md 「절차」 4번(전문 `references/merge-exec.md`)에서 **호출한 체크아웃이 기본 브랜치에 없을 때만** 읽음 (detached HEAD·다른 브랜치 — 링크드 워크트리의 `/dflow-team` 팀장 등). 아래 "1~5", "1단계"·"4단계"·"5단계", "5번 뒷정리" = SKILL.md 「절차」 4번·5번 번호.

## 임시 머지 워크트리

   호출한 체크아웃이 기본 브랜치에 없을 때 사용. 스윕 시작 때 한 번 만들고 끝날 때 지움. `<ROOT>` = 호출한 체크아웃의 `git rev-parse --show-toplevel`.
   ```bash
   W="<ROOT>/.claude/worktrees/dflow-merge"
   ex=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$ex")"; touch "$ex"
   grep -qxF '**/.claude/worktrees/' "$ex" || printf '%s\n' '**/.claude/worktrees/' >> "$ex"
   git worktree remove --force "$W" 2>/dev/null; rm -rf "$W"; git worktree prune
   git fetch origin && git worktree add --detach "$W" origin/<기본브랜치> || echo MERGE_WT_FAILED
   echo "W=$W"
   ```
   - `MERGE_WT_FAILED` → 이번 스윕은 머지 없이 "머지 워크트리 생성 실패" 로 보고
   - **`$W` 를 쓰는 뒤 호출은 모두 아래 가드 줄로 시작** (Bash 호출 사이에 셸 변수 안 남음). 가드는 `$W` 를 같은 규칙 (`<ROOT>` = 호출한 체크아웃 최상위) 으로 다시 구하고, 워크트리가 없으면 아무것도 안 하고 멈춤
     ```bash
     W="$(git rev-parse --show-toplevel)/.claude/worktrees/dflow-merge"; [ -e "$W/.git" ] || { echo NO_MERGE_WT; exit 1; }
     ```
     `NO_MERGE_WT` → 그 후보 처리 없이 "머지 워크트리 없음" 으로 보고, 스윕 멈춤
   - `decisions.mjs` (3·3-1단계) = 호출한 체크아웃 최상위에서 그 체크아웃의 스킬 경로로 호출, `-C "$W"` 붙임 (예: `node .claude/skills/dflow-merge/scripts/decisions.mjs renumber -C "$W" --tsk <TSK> --order <order>`). `migration-check.mjs` 도 같음
   - 후보마다 위 1~5를 `<W>` 에서 실행. 달라지는 것 셋뿐. 설정 블록과 같은 호출 안에서 이어 돌 때만 가드 없이 `$W` 그대로 사용. 아래 `<W>`·`"$W"` = 가드 줄이 구한 값
     1. 1단계: `git -C "$W" fetch origin && git -C "$W" switch --detach origin/<기본브랜치>` (`pull` 대신 detach). 그 뒤 `git -C "$W" rev-parse HEAD` 를 머지 직전 HEAD 로 기록
     2. 4단계 state.json: `<W>/<후보 state.json 경로>` 를 고쳐 `<W>` 에서 커밋 (같은 경로 재사용 규칙)
     3. 5단계: `git -C "$W" push origin HEAD:<기본브랜치>`. 실패 시 `git -C "$W" reset --hard <기록한 HEAD>` 로 되돌리고 같은 규칙 (경합·훅·그 밖, `references/push-fail.md`) 으로 가름
   - 5번 뒷정리의 로컬 `git branch -d` 도 `git -C "$W"` 로 실행 (머지 커밋은 `<W>` HEAD 에만 있음)
   - 스윕이 끝나면 (멈춘 경우 포함) `git worktree remove --force "$W"` 로 지움 (머지·삭제 결과는 공용 저장소에 남음)
   - 호출한 체크아웃 수정 금지. 팀장처럼 detached HEAD 로 도는 체크아웃은 스윕 뒤 스스로 `origin/<기본브랜치>` 로 다시 detach 해 최신 추종 (`/dflow-team` 「4. 승인 스윕」)
