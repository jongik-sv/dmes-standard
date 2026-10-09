# /dflow-merge 방언 검증

스윕 (`--resolve` 아님) 이 SKILL.md 「절차」 6번 보고 직전, `dialect_check` 가 빈 값 아닐 때만 읽음. 스윕이 중간에 멈췄어도, merge 가 0건이어도 실행 (보류된 commit 재시도). 규칙 머리 = 아래 「규칙 머리」 (이전에 SKILL.md 「방언 검증」. 스윕 한 번에 한 번, merge 마다 실행 금지, 도커 런타임 start 금지).

## 방언 검증

**규칙 머리**(SKILL.md 「방언 검증」 에서 옮김. 6번 보고 직전에 읽음)

같은 목적 도커 검증(DB 방언 검증 등)은 워커가 안 함(정본 dev-discipline 「도커 사용 규칙」). 이 스윕이 스윕 한 번에 한 번, 마지막 merge commit(스윕 끝의 `origin/<기본브랜치>`)에서 실행. merge 마다 실행 안 함. 도커 런타임 안 켬. `--resolve` 는 이 절 안 탐.
- 스윕 시작의 `git fetch origin` 직후 `git rev-parse origin/<기본브랜치>` 를 `<스윕 전 sha>` 로 기록.
- 6번 보고 직전에 `node .claude/skills/dflow-work/scripts/dflow.mjs config dialect_check` 확인.
- exit 0 + 빈 값 → 이 단계 없음(`DIALECT_NONE`).
- 그 밖 → `references/dialect.md` 를 읽고 그 명령 한 번 호출.

- 명령: 대상 리포 설정의 `dialect_check` (`dflow.mjs config dialect_check`)
  - `.dflow`(리포 공통)에 적음. PC 전용 값(JAVA_HOME 등)이 든 명령은 `.dflow.local` 이 덮음 (export 된 `DFLOW_DIALECT_CHECK` 가 둘 다 덮음)
  - 키 없으면 이 단계 없음 (`DIALECT_NONE`)
  - 값은 임시 worktree 최상위에서 `bash -c` 로 돌므로 `cd <폴더> && VAR=값 <명령>` 형태 그대로 받음. 예: `dialect_check=cd <폴더> && <DB 마다 다른 검증 test 명령>`
  - dmes-standard = DB 가 Oracle 하나 (oracle-1007) → 이 키 없음 (`DIALECT_NONE`)
  - 설정 파일은 값 뒤 ` #…` 를 comment 로 자르므로 명령에 ` #` 금지
  - 임시 worktree 에는 추적 파일만 있음 (`.dflow.local`·`node_modules`·build 산출물 없음). 준비 필요하면 명령 안에 넣음 (예 `npm ci && npm run test:<DB>`)
- 돌리는 법: 호출한 체크아웃 최상위에서 한 번 호출 (`<스윕 전 sha>` = SKILL.md 「방언 검증」 대로 기록해 둔 값)
  ```bash
  node .claude/skills/dflow-merge/scripts/dialect-check.mjs run --dev <기본브랜치> --sweep-base <스윕 전 sha>; echo "rc=$?"
  ```
  - 스크립트가 origin 을 다시 fetch 해 끝 commit 을 정함
  - 그 commit 에 detach 한 깨끗한 임시 worktree (`<ROOT>/.claude/worktrees/dflow-dialect-<pid>`) 에서 돌린 뒤 지움
  - 호출한 체크아웃 (팀장 체크아웃) 수정 금지
  - 명령은 `heavy.mjs --pool docker` 로 감싸 PC 전역 도커 슬롯 (도커 허용된 워커와 같은 슬롯) 과 일반 슬롯을 함께 잡은 동안에만 돎
  - 컨테이너 재사용 (Testcontainers reuse·외부 DB 주소 등) = 대상 리포 test 설정 따름
- 도커 런타임 start 금지. `docker info` (`DFLOW_DOCKER_PROBE` 로 변경) 실패 시 실행 없이 `DIALECT_DEFERRED docker-off <sha> notify=<0|1>` 로 보류 기록
  - 같은 commit 은 다음 스윕이 재시도
  - `notify=1` = 그 commit 의 첫 보류 (사람에게 알림)
- 판정은 commit 마다 한 번: 상태 = `<git-common-dir>/dflow-dialect/<브랜치>.state` (`last_pass`·`last_fail`·`deferred`·`last_result`)
  - 끝 commit = 마지막 통과·실패 commit 이면 실행 안 함 (`DIALECT_SKIP`)
  - 도커 슬롯 차 있으면 `DIALECT_BUSY` (exit 75), 기록 안 함 — 다음 스윕 재시도
  - 같은 branch 검증이 아직 돌고 있으면 `DIALECT_RUNNING`
  - 명령이 exit 126·127·128 이상 (실행 불가·명령 없음·시그널로 죽음 — 잘못된 JAVA_HOME, OOM kill 등) 으로 끝나면 코드 판정 아니므로 실패 기록 없이 `DIALECT_ERROR exit=<n> <sha> notify=<0|1> log=<로그>` 로 냄. 다음 스윕이 같은 commit 재시도
  - 죽은 앞 호출이 남긴 임시 worktree 는 다음 호출이 치움
- 문서뿐 이월: 직전 통과 commit 이후 바뀐 파일이 문서뿐 (`*.md`·`docs/**`·작업 폴더의 `state.json` 등) 이면 실행 없이 `DIALECT_SKIP docs-only <sha> since=<직전 통과>` 로 끝
  - `last_pass` 불변 → 코드 바뀐 다음 검증이 누적분을 `since`·`tasks`·`unverified` 에 실음
  - 보고에 안 실음
  - 판정 목록·근거: 스크립트 머리와 `rationale.md` 「방언 검증」
- 실패: `DIALECT_FAIL <sha> exit=<n> since=<직전 통과> tasks=<그 뒤 머지된 Task…> unverified=<…> log=<로그>`
  - tasks = 직전 통과 commit (없으면 스윕 전 sha) 이후 개발 branch 에 merge 된 Task (merge commit 제목 `merge: <TSK> …`)
  - 자동 되돌리기·Task 재오픈 금지 — 보고만
- 확인하지 못한 항목 대조: 같은 범위에서 design.md·resolution.md 에 `도커 금지로 생략:`·`확인하지 못한 수용 기준:` 줄을 남긴 Task 를 결과 줄 앞에 `DIALECT_UNVERIFIED <TSK> 생략=<n> 미확인=<m> <파일>` 로, 결과 줄에 `unverified=` 로 적음
  - 통과든 실패든 실음 — 워커가 도커 금지로 확인 못 한 수용 기준을 이 결과와 사람이 대조
- 결과는 출력 전에 상태 파일에 먼저 기록. 호출이 10분 넘겨 백그라운드로 옮겨졌거나 결과를 놓쳤으면 `dialect-check.mjs status --dev <기본브랜치>` 가 마지막 결과 재출력
- 결과 줄 (`DIALECT_*`, `DIALECT_SKIP` 제외) 과 `DIALECT_UNVERIFIED` 줄 = 보고 표 아래에 그대로 실음. 호출자 (`/dflow-team` 팀장) 보고·기록 방법 = 그 스킬 「4. 승인 스윕」
