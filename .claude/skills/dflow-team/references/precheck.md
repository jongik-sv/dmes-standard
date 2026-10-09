# /dflow-team 전제 검사 결과별 처리 (SKILL.md 「1. 시작」 1번)

SKILL.md 「1. 시작」 1번 전제 검사 블록이 `PRECHECK_OK` 없이 끝났을 때(`FAIL …`·`LOCKED`·lease 거부) Bash `cat` 으로 읽고
그 코드의 처리대로 보고. 잠금·lease 규칙 상세도 여기.

- `WARN GRADLE_TUNING <빌드 루트> <빠진 키 또는 "(gradle.properties 없음)">`: `FAIL` 아님. `PRECHECK_OK` 와 함께
  나올 수 있는 **경고**. 시작 안 막음.
  - 조건: `gradle-check.sh`(아래)가 Gradle 리포로 보는데 빌드 루트 `gradle.properties` 에 권장 3키(`org.gradle.caching`·`org.gradle.workers.max`·
    `org.gradle.daemon.idletimeout`) 없음 또는 파일 없음.
  - 시작 보고에 한 줄 안내 + "dflow-kit 의 `install.sh <리포>` 를 다시 돌리면 새 파일은 만들고 기존 파일은 붙일 줄만 안내한다" 덧붙임.
  - 판정 로직 = `.claude/skills/dflow-team/scripts/gradle-check.sh` 하나뿐. `install.sh` 도 같은 스크립트 호출(중복 방지).
  - 이 스크립트는 탐색·판정만 함. 파일 안 고침.

- **팀장 잠금**: 디렉터리, `mkdir` 로 획득.
  - `mkdir` 원자적 → 동시에 시작한 팀장 둘 중 하나만 성공.
  - 실패한 검사가 잠금을 안 남기게 블록 마지막에 둠.
  - 안에 `owner` 한 줄 `<신원>/<host>/lead <시작 epoch 초> <PID>` 와 `beat`(epoch 초) 기록.
  - PID = 팀장 세션 프로세스 PID. Bash 도구가 env `CLAUDE_PID` 로 내보내는 값(없으면 `$PPID`). Bash 호출마다·컨텍스트 압축 뒤에도 같음.
  - `$PPID` 만 안 쓰는 이유: Windows Git Bash 는 부모가 Cygwin 프로세스 아니면 `$PPID` 를 1 로 보고 → 모든 팀장이 같은 PID.
  - Windows 에서 `CLAUDE_PID` 비면 `NO_CLAUDE_PID` 로 중단.
    - 이유: `$PPID` 1 이면 잠금 소유 판정이 모든 팀장을 같은 프로세스로 봄. 권한 확인 생략 감지도 `Get-CimInstance` 가 PID 1 을 못 찾아 항상 0 (러너 실측).
  - **소유 판정** = `owner` 신원이 자기 `<신원>/<host>/lead` 이고 PID 가 현재 `$LEAD_PID` 와 같음.
    - 이유: 잠금은 체크아웃마다 하나. 잠금을 가져간 다른 팀장도 신원·host·리포가 같아 신원만으론 누구 잠금인지 못 가림.
    - 시작 시각 = `LOCKED` 안내에서 사람이 그 팀장을 알아보게 하려는 용도.
  - 팀장은 매 기상 소유 확인 뒤에만 `beat` 갱신(「2-3」).
  - `owner`·`beat` 쓰기 실패 → 방금 만든 잠금 디렉터리 삭제 + `FAIL LOCK_WRITE` 로 종료.
    - 이유: `beat` 없는 잠금은 생성 후 10분 안에는 다른 팀장 시작을 막음(아래). 그대로 두면 10분간 아무도 시작 못 함.
    - 방금 `mkdir` 로 만든 잠금은 다른 팀장이 안 건드리므로 지워도 남의 잠금 아님.
  - 기존 잠금 판정:
    - `beat` 있고 70분(4200초)보다 새로움 → 거부.
    - `beat` 없으면 잠금 디렉터리 자체의 수정 시각을 봄. `find "$LOCK" -maxdepth 0 -mmin +10` 이 경로를 출력하면 10분보다 오래됨(macOS·Linux 모두 동작).
    - 10분 이내 → `mkdir` 와 `owner`·`beat` 쓰기 사이 짧은 틈에 만들어지는 중인 잠금으로 보고 거부.
    - `beat` 있고 70분보다 오래됨, 또는 `beat` 없고 잠금 디렉터리 10분보다 오래됨 → 죽은 것으로 보고 가져옴.
  - 가져오기 절차:
    1. 잠금 디렉터리를 `mv` 로 이 팀장만 아는 이름 `$LOCK.stale.$$` 로 이동.
    2. 옮긴 디렉터리를 같은 기준으로 다시 잼(옮기기 전 본 것이 `beat` 면 `beat`, 잠금 디렉터리 수정 시각이면 옮긴 디렉터리의 수정 시각).
    3. 여전히 오래됐을 때만 삭제 → `mkdir` 로 다시 획득.
  - 옮긴 잠금이 새로우면 그사이 다른 팀장이 가져간 것 → 옮긴 경로를 알리며 거부, 사람이 되돌림.
  - `mv` 나 다시 하는 `mkdir` 실패 → 다른 팀장이 먼저 가져간 것 → 거부.
  - `mv` 로 옮겨 다시 재는(1~3) 이유: 다시 잰 시각이 여전히 오래됐음을 확인한 뒤 지우기 전에 다른 팀장이 먼저 가져가면 그 잠금까지 지움. 옮긴 디렉터리는 이 팀장만 보므로 확인·삭제 사이에 끼어들 틈 없음.
  - 질문 안 하고 중단(AskUserQuestion 쓰지 않음).
  - `LOCKED` 거부 시 잠금 경로·`owner`·`beat` 시각과 함께 "그 팀장이 끝난 것이 확실하면 잠금 디렉터리를 지우고 다시 시작하라" 안내.
    - 이유: 세션이 죽은 직후 재기동하면 `beat` 가 아직 새로움.
  - 잠금을 두는 이유: 한 체크아웃의 팀장 둘은 슬롯 번호·세대 파일·승인 스윕을 서로 덮어씀.
  - 생존(가져와도 되는지) = PID 아님. `beat`(없으면 잠금 디렉터리 수정 시각)로 봄.
    - 이유: 세션 프로세스가 살아 있어도 권한 확인 등에 멈춘 팀장은 기상 안 해 제 몫을 못 함. `beat` 는 그 멈춤까지 드러냄.
  - 살아 있는 팀장은 늦어도 `TICK`(30분)마다 `beat` 갱신. 변화 없어 건너뛴 TICK 은 감시 루프가 `wake.sh` 로 갱신(「2-2」). 70분 = 두 `TICK` 연속 놓침.
- **팀장 lease**: 로컬 잠금은 같은 리포의 워크트리끼리만 봄.
  - 같은 신원이 **다른 clone·다른 PC** 에서 같은 프로젝트 팀장을 띄우는 것은 서버 lease 가 막음(스펙 wbs-web docs/superpowers/specs/2026-09-23-dflow-lead-lease-design.md).
  - 로컬 잠금을 잡은 **뒤** 획득.
    - 이유: 같은 리포의 두 팀장이 동시에 서버에 가서 같은 holder 로 서로를 밀어내지 않게 로컬 경합을 먼저 끝냄.
  - 결과별 처리:
    - `LEASE_OK <n>`: 계속.
    - `LEAD_LEASE_HELD <project_id> <host> <agent> <만료 시각>` 줄(exit 4): 잠금 삭제 + 멈춤. 줄마다 "이 프로젝트는 `<host>` 의 `<agent>` 가 쥐고 있다(만료 `<시각>`)" 로 보고하고, "그 팀장이 이미 죽었다면 최대 3분 뒤 풀린다. 지금 넘겨받으려면 `/dflow-team … --takeover` 또는 오피스 화면의 「팀장 해제」" 덧붙임.
    - 그 밖(exit 2·3·5·6·7): 잠금 삭제 + 사유 보고 + 멈춤. 서버에 lease 가 없는 구버전(exit 7, 404)도 여기.
    - lease 를 확인 못 한 채 시작 금지(fail-closed).
  - `holder` = `~/.dflow/machine-id`(처음 쓸 때 만듦) + 이 체크아웃 경로. 같은 자리에서 다시 시작하면 즉시 넘겨받음.
- `KIT_NOT_PUSHED`: `.claude/skills/dflow-dev` 가 git 추적되는 킷 복사형 리포면 `git fetch origin` 뒤 아래 둘이 있어야 함.
  - `origin/<기본브랜치>` 의 `dflow-dev` SKILL.md 에 `--worker`.
  - `dflow-merge` SKILL.md 에 원격 후보 지원(`origin/agent/*`).
  - fetch 실패 → 검사 불가 → 실패로 침.
  - 이유: 팀원 워크트리는 `origin/<기본브랜치>` 에서 만들어지거나 그리로 detach 해 그 커밋의 스킬을 씀. 킷을 설치·커밋만 하고 push 안 하면 작업트리 검사(`OLD_DFLOW_DEV`)는 통과하고 팀원 전원 `failed no-worker-flag` 로 끝남.
  - 안내에 "킷 커밋을 기본 브랜치에 push 한 뒤 다시 시작하라" 포함.
  - 심링크 배포 리포는 워커가 메인 체크아웃의 스킬을 링크 → 이 검사 안 함.
  - 판정 대상을 `.claude/skills` 전체가 아니라 `dflow-dev` 로 좁히는 이유: 일반 스킬만 커밋하고 `dflow-*` 는 심링크로 둔 리포가 있음. 킷 복사형으로 읽으면 원격에 없는 `dflow-dev` 를 찾다가 `KIT_NOT_PUSHED` 오탐(2026-09-23 dmes-standard).
- `NO_PROJECT`: `.dflow` 의 `project_id` 또는 `.dflow.local` 의 `project_map`(레거시 `.env` 의
  `DFLOW_PROJECT_ID`·`DFLOW_PROJECT_MAP`)에 리포 ↔ D'Flow 프로젝트 바인딩 없으면 시작 거부.
  - 이유: 서버 작업 목록(`/work/mine`)은 PAT 주인이 속한 **모든 프로젝트** 주문을 돌려줌.
  - `dflow.sh list` 가 바인딩으로 거름(poll·"멈춤" 재구성 모두 이 목록 사용). `dflow.sh claim` 은 바인딩 밖 주문을 `PROJECT_MISMATCH` 로 거부.
  - 바인딩 없으면 거를 기준이 없어 다른 프로젝트 작업을 이 리포에서 개발하게 됨. 같은 모듈 이름·같은 TSK 번호 체계의 프로젝트끼리는 겉으로 드러나지도 않음.
- `CONFIG`: `dflow.sh config --source` 실패(`.dflow`·`.dflow.local`·레거시 `.env` 어느 것도 못 읽음, 또는 설정 문제) → 시작 거부.
  - `dflow.sh` 가 stderr 에 낸 사유 코드(`NO_LOCAL`·`NO_DFLOW`·`NO_DEV_BRANCH`·`PERSONAL_KEY_IN_DFLOW`)대로 파일을 고친 뒤 다시 시작.
- `SPACE_IN_PATH`: 메인 체크아웃 절대경로에 공백 있으면 시작 거부.
  - 이유: 포인터 한 줄 형식과 워커 부트스트랩의 `ln -s` 링크가 공백을 못 다룸.
- `NO_DEFAULT_BRANCH`·`NOT_DEFAULT_BRANCH`: 개발 브랜치 = `dflow.sh branch dev` 로 구함(`.dflow.local` 의 `dev_branch`, 레거시는 `origin/HEAD`, 그 ref 없으면 `git ls-remote --symref origin HEAD`).
  - 팀장 체크아웃은 그 개발 브랜치 위 또는 **detached HEAD** 여야 함. 다른 이름 있는 브랜치면 거부.
  - 이유: 개발 브랜치 위 팀장은 그 체크아웃에서 머지. detached HEAD 팀장은 `/dflow-merge` 가 임시 머지 워크트리에서 머지해 `HEAD:<기본브랜치>` 로 push(「4. 승인 스윕」).
  - 이름 있는 다른 브랜치를 허용 안 하는 이유: 사람의 작업 브랜치일 수 있어, 스윕 뒤 최신으로 다시 detach 하면 그 작업을 흔듦.
  - detached HEAD 를 허용하는 이유: 개발 브랜치는 워크트리 하나만 체크아웃 가능. 같은 리포에서 두 번째 팀장을 링크드 워크트리로 띄우려면 개발 브랜치를 잡지 않아야 함(「두 번째 팀장」).
- `NO_REMOTE_DEV_BRANCH`: 개발 브랜치가 원격에 없으면 먼저 `dflow.sh branch ensure-dev` 가 운영 브랜치에서 만들어 push.
  - 그것마저 실패(운영 브랜치도 없음·push 권한 없음)했을 때만 이 항목으로 멈춤.
  - 이유: 팀원 워크트리와 「4. 승인 스윕」 머지는 `origin/<기본브랜치>` 를 기점으로 삼음. 로컬에만 있는 개발 브랜치로는 둘 다 동작 안 함.
- `SAME_IDENTITY_LEAD`: 같은 리포의 다른 워크트리에 잠금 `owner` 가 같은 `<신원>/<host>/lead` 이고 `beat` 가 살아 있는 팀장이 있으면 거부.
  - 잠금은 워크트리마다 따로 생겨 잠금만으론 이 경우를 못 막음.
  - 이유: 팀원 재구성과 고아 스캔은 `git worktree list` 로 리포의 모든 워크트리를 보고 `<신원>/<host>/` 접두로 자기 팀원을 가림. 같은 신원 팀장이 둘이면:
    - 서로의 팀원을 자기 슬롯으로 흡수.
    - 같은 `w<slot>` 발급 → 좌석표가 한 인물을 두 책상에 그림.
    - 「이어서 시작」 요청을 둘 다 받아 한 작업에 워커 둘 띄움.
  - 같은 신원으로 일을 나눠 돌리려면 팀장 하나에 인원과 WP 범위를 줌.
  - 두 팀장이 동시에 시작하는 아주 짧은 틈은 못 막음.
- `OLD_DFLOW_DEV`·`OLD_DFLOW_MERGE`: 수정된 기존 스킬이 적용 안 됨.
  - 옛 `/dflow-dev` → 팀원이 기본 브랜치 switch 에서 죽음. 옛 `/dflow-merge` → 스윕이 팀원 작업을 영영 못 봄.
  - 판정 = 각 SKILL.md 의 `<!-- dflow-caps: … -->` 표식 줄. 본문 문구를 grep 하면 문서 수정 때 소리 없이 깨짐.
  - `KIT_NOT_PUSHED` 는 표식 도입 전에 push 된 킷도 받도록 옛 문구(`--worker`·`origin/agent/*`)를 함께 인정.
- `AUTH`: 인증 = `dflow.sh me` 성공(`user_email` 나옴)으로 판정. doctor 는 진단 출력용, 종료 코드로 판정 안 함.
  - 이유: doctor 는 토큰 인증이 실패해도 그 줄만 출력하고 0 으로 끝남.
  - 출력한 `user_email` 로 `DFLOW_PATS` 첫 토큰이 이 신원의 PAT 인지 보임.
  - 그 값으로 `<신원>` 슬러그, `hostname` 의 첫 점 앞부분으로 `<host>` 슬러그 생성(`hostname -s` 는 Windows 의 hostname.exe 에 없음).
  - 팀원 = `<신원>/<host>/w<slot>`, 팀장 = `<신원>/<host>/lead`.
- `LEGACY_REPORTED`: `api_base` 없는 `phase=reported` 로컬 state.json 이 있으면 시작 거부 + "수동 `/dflow-merge` 로 먼저 정리하라" 안내.
  - 이유: 스테이징 D'Flow DB 는 운영 복제 → 출처 모르는 로컬 후보를 자동 스윕이 머지할 수 있음.
  - 같은 작업의 원격 사본에 값이 있으면 `/dflow-merge` 가 출처를 가림(1번 로컬·원격 중복).
  - 사본이 없거나 사본에도 값이 없으면 그 후보를 수동 규칙대로 판정 → 사람이 안 보는 루프에 그 판정을 맡기지 않음.
  - 이 검사는 로컬 파일만 봄 → 원격 사본에 값이 있는 경우도 거부. 안전한 쪽으로 기운 것.
- `mkdir -p ~/.dflow`: 이벤트 기록이 디렉터리 부재로 조용히 실패하지 않게 함.
- 공유 `info/exclude` 에 워커 부산물 패턴을 없을 때만 추가. 커밋 안 하는 로컬 설정, 링크드 워크트리 모두 공유.
  - `**/.claude/worktrees/`: 두 백엔드의 팀원 워크트리(`dflow-<id8>`). 2026-09-24부터 Orca 도 `git worktree add` 로 이 자리에 만듦.
  - `/dflow-*/`: **옛 방식**(`orca worktree create --name dflow-<id8>`)이 `.claude/worktrees/` 가 아닌 리포 루트 바로 아래에 만든 Orca 팀원 워크트리를 가림.
    - 2026-09-19 mdm-dict-v2 실측. 빼면 재기동 때 `DIRTY` 에 걸림.
    - 새 방식엔 해당 없음. 전환기에 남은 옛 워크트리용으로 패턴 유지.
  - `.vitest/`: 워커가 vitest 를 돌리면 남는 결과 파일(`.vitest/json/output.json`).
    - 빼면 done 뒤 워크트리가 깨끗하지 않아 「고아 정리 규칙」 과 정리 명령 실패(2026-09-19 mdm-dict-v2 실측).
  - `/.dflow-agent`·`**/tasks/*/.result`·`**/tasks/*/.issues`·`**/tasks/*/decisions.json`: 워커가 쓰는 미추적 파일.
    - decisions.json = `done --decisions` 전송용, 커밋 안 함.
    - 어느 `<TASKS>` 아래든 잡도록 `docs/` 접두 고정 안 함.
  - `/docs/dflow-team/`: 팀장이 쓰는 문제 기록 폴더(「3. 결과 처리」 문제 기록).
  - `/.dflow-prompt`·`/.dflow-pane`·`/.dflow-run`: 팀장이 spawn 때 쓰는 미추적 파일.
  - `/.dflow.local`: 워크트리 부트스트랩이 거는 심링크. `.gitignore` 가 `.dflow.local` 을 가리기 전에도 DIRTY 를 트립하지 않게 여기 둠.
  - `.dflow` 는 **넣지 않음**. 스펙 §3.1 대로 커밋 대상.
    - exclude 에 넣으면 미커밋 `.dflow` 가 `git status`·`git add -A` 에서 조용히 사라짐 → 사람이 커밋을 잊고 다른 PC 가 `NO_DFLOW` 로 막힘.
  - `/.claude/skills`(끝 슬래시 없음): 스킬 심링크. 끝 슬래시 패턴은 디렉터리에만 걸려 심링크를 못 가림.
    - **`.claude/skills` 가 추적되지 않는 리포에서만** 추가. 스킬이 커밋된 리포에 넣으면 새 스킬 파일이 무시돼 `git add` 거부.
    - 일반 스킬은 커밋하고 `dflow-*` 만 심링크인 리포 → `/.claude/skills/dflow-*` 추가.
  - 이유: 부산물이 `/dflow-dev` Phase 06 의 "미커밋 잔여물 커밋" 에 섞이면, 브랜치마다 다른 `.dflow-agent` 가 스윕 머지를 충돌시키고 절대경로 심링크가 main 에 들어감.
- `DIRTY`: exclude 를 넣은 뒤 `git status --porcelain` 이 비어야 함. 팀장 체크아웃이 더러우면 승인 스윕이 위험.
  - 실패 안내에 "미커밋 `<TASKS>/*/state.json` 은 파일명을 명시해 먼저 커밋하라(수동 `/dflow-dev` 가 남긴 것일 수 있다)" 포함.
- `UNTIL_BAD`·`UNTIL_PAST`·`UNTIL_TOO_FAR`: 종료 시각을 에포크 초로 비교(BSD `date -j` 먼저, 없으면 GNU `date -d`. macOS·Linux 서버 모두 동작).
  - 형식 틀림·이미 지남·7일 초과 → 거부. `none` 은 검사 안 함.
  - 「인자」 가 전제 검사 전에 이미 걸렀음 → 이 검사는 두 번째 방어선.
- 종료 파일(`dflow-team.stop`)은 잠금을 얻은 뒤 삭제.
  - 이유: 지난 실행에서 마감 전에 죽은 팀장이 남긴 요청이 새 팀장을 곧바로 멈추지 않게 함.
  - 잠금 얻기 전에 지우면 돌고 있는 다른 팀장에게 보낸 요청을 지우게 됨.
- `LEGACY_REPORTED` 검사와 이 블록 전체는 bash 와 zsh 모두 동작. state.json 은 glob 대신 `find` 로 찾고, 결과를 변수로 받아 루프 밖에서 `bad` 호출.
  - 이유: zsh 는 매치 없는 glob 에서 블록 전체를 `FAIL` 줄 없이 죽임. bash 는 파이프 안의 `while` 을 서브셸에서 돌려 그 안에서 바꾼 `fail` 이 밖으로 안 나옴.
- `ORCA_OLD`: pane(Orca)이면 `orca terminal create` 가 `--worktree`·`--command` 를 지원해야 함.
  - 2026-09-24부터 `git worktree add` + `orca terminal create` 조합을 쓰므로 이 확인으로 바꿈. 옛 확인 = `orca worktree create` 의 `--agent`·`--prompt`.
  - tmux 를 못 찾은 Orca 환경에서만 이 갈래로 옴.
- `NO_CLAUDE_CLI`: 두 백엔드 모두 팀원을 `.dflow-run` 의 `exec claude` 로 띄움 → `claude` 가 PATH 에 있어야 함.
  - 없으면 pane(Orca 는 탭)이 즉시 죽고 종료 코드 127 만 남음. 무엇이 없어서 죽었는지 화면에 안 남음.
- `NO_TMUX`: tmux 도 Orca 도 없으면 시작 안 함. 팀원을 대화형으로 띄울 수단 없음.
  - 안내에 설치 명령 기재: macOS `brew install tmux`, Debian·Ubuntu `apt install tmux`, Windows 는 MSYS2 또는 WSL.
  - 종전 비대화형 프로세스 백엔드(`nohup claude -p`)는 2026-09-16 에 없앰. 사람이 권한 확인에 답하거나 화면을 보거나 `blocked` 를 맥락 유지한 채 풀 자리가 없었음.
- `find_tmux` 가 절대경로 후보를 훑는 이유: Orca 는 PATH 앞에 tmux shim 을 끼움. 그 shim 은 명령 부분집합만 처리하고 `tmux -V` 에 거짓 버전을 답함. 판별 방법 = backends.md 「진짜 tmux 찾기」.

## 지원 환경: macOS · Git Bash(윈도우)

`scripts/*.sh` 는 macOS 와 Git Bash 에서 같이 동작. 필요 도구: bash, git, jq(윈도우는 `_shared/bin` 동봉판), tmux 또는 Orca(터미널 백엔드), curl.
- Git Bash 에는 `ps -o`·`sysctl`·`memory_pressure` 없음.
  - `tick.sh`·`wake.sh` = `/proc/$PPID/ppid` 로 팀장 pid 읽음.
  - `capacity.sh` = 읽을 수 없는 자원 값을 `CAPACITY_UNKNOWN`(막지 않음)으로 처리.
- 종료 시각 해석 = BSD `date -j` 먼저, 없으면 GNU `date -d`(Git Bash 는 GNU).
- 스크립트를 새로 쓸 때 macOS 전용 명령·perl 금지.
- 정본·도구 표·한계: `../../_shared/platform-support.md`.
