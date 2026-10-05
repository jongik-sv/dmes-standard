# kit-fix 구조 변경 기록

이 레인은 조정자·dflow 킷 스크립트의 결함 수정이다. 호출 경로나 설치 방식이 달라진 것만 적는다. term-send-safe 의 가로줄 판정 수정(d4573552)과 apply_mdm_self 경고(4c2b911b)는 구조 변경이 아니라 적지 않는다.

## S1. spawn-lane.sh 가 빈 탭에 cd 와 실행 명령을 보내 세션을 띄운다
- 커밋: 34ace0e1, a88a5561(리뷰 반영)
- 바뀌기 전: claude 는 `orca terminal create --worktree <sel> --command "claude …"` 로 한 번에 만들었다. `--worktree` 의 기본값은 `active` 였고, 값은 탭을 만들 Orca 워크트리 선택자였다. glm 만 빈 탭 + `cd` send 방식이었다.
- 바뀐 뒤: claude·glm 모두 「빈 탭 create → 셸 프롬프트 대기(최대 20초) → send `cd <폴더> && <실행 명령>` → tui-idle」 이다. opencode 도 같은 빈 탭 방식이다(`--command` 시간 초과 뒤 중복 탭이 남는 일을 피한다). `--worktree` 는 세션이 일할 폴더(절대경로·`path:`)이거나 Orca 선택자(`name:`·`branch:`·`id:` 등)다. 상대경로·`~` 는 거부한다. 안 주면 세션은 조정자의 현재 워크트리 폴더에서 시작한다. 탭은 조정자의 워크트리(현재 폴더, 아니면 메인 체크아웃)에 `path:` 선택자로 만들고, 그 폴더를 Orca 가 알 때만 그 워크트리에 만든다. 레인 상태의 worktree 값은 세션이 일하는 폴더다.
- 바꾼 이유: (1) `--command` 는 `Timed out waiting for terminal handle after creation`(ok:false)로 실패하고 터미널도 남지 않았다. (2) Orca 가 모르는 `git worktree add` 폴더로 만든 탭은 사용자 화면에 보이지 않았다. (3) 기본값 `active`·`current` 는 현재 폴더가 Orca 가 모르는 워크트리이면 `selector_not_found` 로 실패한다(이 레인에서 재현).
- 동작 보존 근거: `--dry-run` 4가지 조합 출력 확인. 실제 기동 시험으로 `SPAWNED …` 를 받았고 세션 프로세스의 cwd 가 지정한 워크트리였다. 시험 탭은 바로 닫았다.
- 영향 범위: 조정자 스킬의 레인·워커 기동 전체(`references/spawn.md`·`contract.md` 갱신). 출력 형식(`SPAWNED`·`SPAWN_FAIL`)은 그대로다.
- 되돌리는 방법: 34ace0e1 revert. `--worktree` 를 안 줄 때 탭 위치가 달라지므로 호출부가 `active` 를 전제했다면 확인한다.

## S2. deps.sh 가 워크트리 밖 심링크를 거쳐 쓰지 않는다
- 커밋: e5cba4f8, f09be591(리뷰 반영)
- 바뀌기 전: 워크트리에 이미 있는 `node_modules` 심링크(대상이 메인 체크아웃)를 점검하지 않고 pnpm install 을 돌렸다. 설치가 심링크를 따라 메인의 workspace 링크를 다시 썼다.
- 바뀐 뒤: 설치 전에 워크트리 안의 `node_modules` 심링크를 깊이 제한 없이 찾아 대상이 워크트리(`git rev-parse --show-toplevel` 물리 경로) 밖이거나 끊어졌으면 링크만 지운다(`DEPS_UNLINKED <경로> -> <대상>`). 설치할 폴더가 워크트리 밖이면 `DEPS_FAILED outside-worktree` 로 멈춘다. 1-1 단계의 심링크 복제는 대상(폴더·파일·끊어진 링크)이 메인 체크아웃 안이면 건너뛴다(`DEPS_LINK_SKIP`). 링크를 지운 설치 폴더는 루트 `node_modules` 가 있어도 다시 설치하고, 지운 경로를 git 디렉터리의 `dflow-deps-relink` 에 남겨 `DEPS_BUSY` 재호출에도 이어간다.
- 바꾼 이유: 2026-10-05 12:05 tooltip-screens 레인에서 메인 포털이 `Can't resolve '@dk-oasis/shared/auth-cookies'` 로 깨졌다. 재현과 근거는 `state-kit-fix.md` E3.
- 동작 보존 근거: 심링크가 없는 정상 워크트리의 출력·exit 는 그대로다(이 레인 워크트리에서 실제 `deps.sh` 실행: `DEPS_INSTALLED pnpm src/frontend`, 이어 `DEPS_PREPARE_PENDING` exit 75). 소형 픽스처 시험 `.claude/skills/coordinator/tests/deps-sh-no-main-write.sh`(평면·깊이 5 배치·루트 실제 폴더+상대 링크·파일 링크 17건): 수정 전 스크립트는 메인 링크가 바뀌어 실패하고 수정 후는 통과한다. macOS 기본 bash 3.2 에서도 통과.
- 영향 범위: dflow-dev 행 H 와 dflow-team 이 deps.sh 를 부르는 곳. 새 출력 첫 단어 `DEPS_UNLINKED`·`DEPS_LINK_SKIP` 은 exit 0 이고, 새 실패 `DEPS_FAILED outside-worktree` 만 호출부의 「failed deps」 경로로 간다.
- 되돌리는 방법: e5cba4f8 revert. 되돌리면 심링크 node_modules 를 가진 워크트리에서 설치가 메인에 쓴다.
