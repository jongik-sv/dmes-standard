# /dflow-team 두 번째 팀장 (링크드 워크트리)

SKILL.md 「두 번째 팀장 (링크드 워크트리)」 이 가리킨다. 같은 리포에서 다른 신원의 팀장을 더 띄울 때만 읽는다.

같은 리포에서 **다른 신원(다른 PAT)** 의 팀장을 하나 더 돌릴 때는 리포를 다시 clone 하지 않고 링크드 워크트리를 쓴다.
주 체크아웃 루트에서 아래를 실행한다.
```bash
node .claude/skills/dflow-team/scripts/lead-worktree.mjs <이름>
```
- 스크립트 동작:
  - `<주 체크아웃>/.claude/worktrees/lead-<이름>` 을 개발 브랜치(`dflow.mjs branch dev`)에서 detached 로 만든다.
  - `.claude/skills` 를 주 체크아웃 것으로 링크한다.
  - 새 방식이면 주 체크아웃의 `.dflow.local` 을 `as` 줄 빼고 복사한다(값은 출력 안 함). 커밋 안 된 `.dflow` 는 링크한다.
  - 레거시는 `.env` 를 `DFLOW_AS` 줄 빼고 복사한다.
  - 줄을 빼는 이유: 그 줄은 주 체크아웃 팀장의 키다. 따라가면 이 워크트리의 키 판정이 묻지 않고 같은 신원으로 넘어가 `SAME_IDENTITY_LEAD` 에 걸린다.
- 사람은 그 워크트리에서 `claude` 를 띄워 `/dflow-team …` 을 실행한다.
  - 키는 그 실행의 키 판정(「인자」)이 정한다.
  - 다른 워크트리 팀장이 쓰는 신원을 후보에서 뺀다. 남은 키가 하나면 자동으로 고르고, 둘 이상이면 물은 뒤 그 워크트리의 `.dflow.local`(레거시 `.env`)에 `as`(레거시 `DFLOW_AS`)로 적는다.
  - 미리 정하려면 그 파일에 `as=<prefix>`(레거시 `DFLOW_AS=<prefix>`)를 직접 적는다.
- `.dflow.local`(레거시 `.env`)을 링크하지 않고 복사하는 이유: 두 팀장이 서로 다른 키를 써야 한다. 링크하면 한쪽의 키 변경이 도는 다른 팀장과 그 팀원에게 번진다.
- 팀원 워크트리의 `.dflow.local`(레거시 `.env`) 링크는 팀장 체크아웃(`<MAIN>`)의 것을 가리킨다. 그래서 두 번째 팀장의 팀원은 그 워크트리의 것을 쓴다.
- 팀장 워크트리에는 `node_modules` 를 설치하지 않는다. 팀장은 테스트를 안 돌린다. 팀원은 `/dflow-dev --worker` 행 H 가 설치한다.
- 이 팀장의 `<MAIN>` = 그 워크트리 경로.
  - 잠금·종료 파일·poll 디렉터리(`git rev-parse --git-path`)가 워크트리마다 따로 풀린다. events.jsonl 의 `repo` 도 달라진다. 두 팀장의 상태는 안 섞인다.
  - 공유하는 것: `info/exclude`(넣는 패턴이 같음), 로컬 브랜치 저장소, `git worktree list`.
- 같은 신원으로는 두 번째 팀장을 못 띄운다(`SAME_IDENTITY_LEAD`, 「1. 시작」).
- 다 쓴 팀장 워크트리는 마감한 뒤 `git worktree remove .claude/worktrees/lead-<이름>` 으로 지운다. `.dflow.local`(레거시 `.env`) 복사본이 미추적 파일이라 거부되면 `--force` 를 붙인다.
