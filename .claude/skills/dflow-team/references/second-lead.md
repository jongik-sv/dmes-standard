# /dflow-team 두 번째 팀장 (링크드 워크트리)

SKILL.md 「두 번째 팀장 (링크드 워크트리)」 이 가리킴. 같은 리포에서 다른 신원 팀장을 더 띄울 때만 읽음.

같은 리포에서 다른 신원(다른 PAT) 팀장 하나 더 돌릴 때: 리포 재 clone 없이 링크드 worktree 사용.
주 체크아웃 루트에서 아래 실행.
```bash
node .claude/skills/dflow-team/scripts/lead-worktree.mjs <이름>
```
- 스크립트 동작:
  - `<주 체크아웃>/.claude/worktrees/lead-<이름>` 을 개발 branch(`dflow.mjs branch dev`)에서 detached 로 생성.
  - `.claude/skills` 를 주 체크아웃 것으로 링크.
  - 새 방식이면 주 체크아웃 `.dflow.local` 을 `as` 줄 빼고 복사(값 출력 안 함). commit 안 된 `.dflow` 는 링크.
  - 레거시는 `.env` 를 `DFLOW_AS` 줄 빼고 복사.
  - 줄 빼는 이유: 그 줄 = 주 체크아웃 팀장 키. 따라가면 이 worktree 키 판정이 묻지 않고 같은 신원으로 넘어가 `SAME_IDENTITY_LEAD` 에 걸림.
- 사람이 그 worktree 에서 `claude` 를 띄워 `/dflow-team …` 실행.
  - 키 = 그 실행의 키 판정(「인자」)이 결정.
  - 다른 worktree 팀장이 쓰는 신원은 후보에서 제외. 남은 키 하나면 자동 선택, 둘 이상이면 물은 뒤 그 worktree 의 `.dflow.local`(레거시 `.env`)에 `as`(레거시 `DFLOW_AS`)로 기록.
  - 미리 정하려면 그 파일에 `as=<prefix>`(레거시 `DFLOW_AS=<prefix>`)를 직접 기록.
- `.dflow.local`(레거시 `.env`) 링크 안 하고 복사하는 이유: 두 팀장이 서로 다른 키 사용해야 함. 링크하면 한쪽 키 변경이 도는 다른 팀장과 그 팀원에게 번짐.
- 팀원 worktree 의 `.dflow.local`(레거시 `.env`) 링크 = 팀장 체크아웃(`<MAIN>`) 것을 가리킴. 그래서 두 번째 팀장의 팀원은 그 worktree 것을 사용.
- 팀장 worktree 에 `node_modules` 설치 안 함. 팀장은 test 안 돌림. 팀원은 `/dflow-dev --worker` 행 H 가 설치.
- 이 팀장의 `<MAIN>` = 그 worktree 경로.
  - 잠금·종료 파일·poll 디렉터리(`git rev-parse --git-path`)가 worktree 별로 따로 풀림. events.jsonl 의 `repo` 도 다름. 두 팀장 상태 안 섞임.
  - 공유: `info/exclude`(넣는 패턴 같음), 로컬 branch 저장소, `git worktree list`.
- 같은 신원으로 두 번째 팀장 못 띄움(`SAME_IDENTITY_LEAD`, 「1. 시작」).
- 다 쓴 팀장 worktree: 마감한 뒤 `git worktree remove .claude/worktrees/lead-<이름>` 으로 삭제. `.dflow.local`(레거시 `.env`) 복사본이 미추적 파일이라 거부되면 `--force` 추가.
