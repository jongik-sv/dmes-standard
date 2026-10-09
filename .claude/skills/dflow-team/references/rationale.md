# /dflow-team 근거·이력

SKILL.md 에서 뺀 근거(이유)·이력(날짜·실측·옛 방식)을 절별로 모음. 운영 절차 아님, 팀장은 읽지 않아도 됨.
규칙 정본 = SKILL.md 와 references 의 해당 절.

## /dflow-team: 팀장 (슬롯 N개 동시 개발)

- **위치 선언**: 설계 정본 = wbs-web 리포 docs/superpowers/specs/2026-09-10-dflow-team-design.md (킷 미동봉). `/dflow-poll` 의 1회 1건 착수를 슬롯 N개 동시 착수 + 상시 보충으로 넓힘.
- 이유: 팀장이 300k 컨텍스트 안에서 gradle 빌드·소스 수정까지 직접 한 실측. 팀장 문맥 = 몇 시간 버텨야 하는 공용 자원, 빌드 출력 1회가 압축을 앞당겨 결과 처리·spawn 이 섬.

## 인자

- 이유: 살아 있는 팀장을 빼앗으면 그 슬롯·대기 큐가 보고만 남기고 끊김.
- 이유: 잠금 쥔 채 사람 답 대기 금지 (다른 팀장이 이 체크아웃을 못 씀). WP 범위 `list` 와 전제 검사 `me` 도 고른 키로 돌아야 함.
  - 정본 = `.dflow.local` 의 `as=<prefix>` (레거시 `.env` 의 `DFLOW_AS`). `dflow.mjs`·`poll.mjs`·팀원(`.dflow.local` 심링크)·heartbeat 훅이 모두 따름. 실행마다 골라 워커에 넘기지 않음: 훅과 `/dflow-dev` 하위 Phase 가 값을 못 받아 팀장·팀원 신원이 갈라짐.
  - `.dflow.local` 은 팀장 체크아웃마다(「두 번째 팀장」 의 팀장 워크트리마다) **워크트리마다 따로** → 키도 워크트리마다 정함. 팀원 링크 = 자기 팀장의 체크아웃 → 자기 팀장의 키를 따름.
- 이유: 22시의 "06:00" 은 오늘 아침인지 내일 아침인지 알 수 없음.
- 이유: 날짜 오타 1번에 몇 주씩 도는 일을 막되, 길게 돌릴 사람에게는 명시적인 길을 둠.
- 이유: 6 = 비용 천장 (슬롯마다 독립 메인 에이전트). K+2 = 자원 기준: 무거운 검증은 PC 전체에서 K 개만 동시에 돌아 팀원이 K 보다 훨씬 많으면 슬롯 앞 줄만 길어지고 줄 선 팀원도 대기 중 턴을 태움. 2 = 슬롯을 안 쓰는 설계·구현 구간 팀원 몫.
- `DOCKER=allow` 키 이유: 허용 값을 `NO_DOCKER=0` 으로 두지 않음. 인원 기준 시절 팀장은 3명 이하면 모든 포인터에 `NO_DOCKER=0` 을 실었고, 그 값을 허용으로 읽으면 태그 없는 Task 까지 풀림 (사고: 인원 기준은 같은 목적 컨테이너를 워커마다 띄우는 것을 못 막아 16GB 장비가 swap 17GB·load 52).
  - 허용된 팀원도 도커 명령은 PC 전역 도커 슬롯(`heavy.mjs --pool docker`, 기본 1개)을 잡은 동안만 실행. 여러 Task 가 같은 목적으로 도는 도커 검증(DB 방언) = 「4. 승인 스윕」 끝의 방언 검증이 1회 실행.
  - `.dflow`·`.dflow.local` 의 `no_docker=1` = 태그 있어도 막는 강제 스위치 (워커가 직접 읽음). `0` 은 아무것도 풀지 않음.
  - 규칙 정본 = dev-discipline.md 「도커 사용 규칙」.
- 값은 팀원이 `/dflow-dev --model` 로 넘김. 두 백엔드 모두 `.dflow-run` 의 `claude --model` 에도 붙임.
- 기본값 명시 이유: `.dflow-run` 이 팀장 세션의 `CLAUDE_EFFORT` 를 벗김 → 플래그 없으면 팀원이 PC 마다 다른 `effortLevel` 을 따름. 묻지 않음 (모델과 같은 이유).
- **추론 강도(effort) 기본 `high`**. 사람이 `effort xhigh`·`추론 강도 max` 처럼 요청할 때만 변경.
- 이유: 범위 밖 작업은 이미 claim 됐거나 끝남. 범위 밖으로 두면 서버에 점유만 남음.
  - 범위는 `team.start` 의 `wp` 에 남김 (「1. 시작」 5번). 압축 뒤 poll 을 다시 띄울 때 그 값으로 복원.
- poll 이 `--wp` 로 그 WP 의 Task 만 돌려줌 (「2-1」). 판정 기준 = `external_ref` 의 TSK 번호 첫 칸 (`dict/TSK-02-05` → `WP-02`). Task ID 첫 칸 = WP 번호 (3단계 `TSK-XX-YY`, 4단계 `TSK-XX-YY-ZZ` 모두). 재개(「5-1. 재개 spawn」)·「이어서 시작」 요청·승인 스윕은 범위와 무관.
- 이유: 조회는 셸 `curl` 이라 토큰을 안 씀 → 발견만 빨라짐. 주기만 줄이면 일시 제외가 빨리 풀려 팀장 기상(토큰)이 늚 → 주기 수도 늘려 유지 시간을 30분으로 둠. 선행 대기(「2-3」 「선행 사전 검사」)는 따로 `--wait-cycles 40` (40주기 = 2시간).
- 인자 아닌 설정으로 받는 이유: 압축 뒤에도 스윕마다 같은 값을 다시 읽어야 하고, 사람마다 정하는 운영 정책이라 실행마다 다르게 줄 일 아님.
- 켜는 이유: 의존 사슬 WBS 에서 선행 승인 전엔 후속이 착수 못 해 사람이 Task 마다 승인해야 진척됨. 대가: 사람이 보기 전에 에이전트 코드가 기본 브랜치에 들어감 → 반려 시 되돌리거나 그 위에 고침.

## 팀장 상태: 메모리는 캐시다

- 재독 세트에 「참조」~「인자」 를 넣은 이유: 빠지면 압축 뒤 references 읽는 시점(「참조」 표)과 종료 시각·WP 범위·자동 머지 같은 인자 규칙을 기억으로 메움. 「참조」 부터가 파일 머리부터보다 작음.
- 이유: 몇 시간 도는 세션은 압축을 겪고, 요약에서 슬롯이 빠지면 `.result` 가 와도 처리 안 됨.
- 이유: 요약에서 빠진 규칙(이벤트의 추가 필드, `parked` 표시, host 슬러그와 `host` 필드의 차이)은 기억으로 못 메움. 그렇게 기록한 줄은 다음 재구성이 읽지 못함.
- 이유: 같은 신원이 다른 PC 에서 띄운 팀장의 워크트리를 자기 것으로 읽지 않게 함.
- 빈 출력과 `1` 을 함께 `dead` 로 보는 이유: `remain-on-exit` 를 놓친 pane 은 흔적 없이 사라짐. 그 팀원도 끝난 것.
- 이벤트를 쌓인 그대로 띄우면 수십만 자 → 스크립트가 아래 규칙대로 계산. 출력 줄의 뜻은 스크립트 머리에 있음.
- `lead-state.mjs` 출력 순서·상한:
  - `HASH` = 처리한 결과 줄 경로마다 한 줄 → 실행이 길수록 늘어남. 앞에 두면 출력이 약 30K자를 넘을 때 뒤의 `EXCLUDE_*`·`BREAKER`·`ISSUE_PENDING`·`EVENTS` 가 잘림 → 크기 고정 줄을 먼저 냄.
  - `HASH` 상한 = SLOT 아닌 경로 최근 50개 ("워크트리가 남은 것" 으로 안 거름: 스크립트가 이벤트만 읽고 파일시스템을 안 봄).
  - SLOT 의 해시는 상한에서 뺌: 오래 `blocked` 인 슬롯의 해시가 빠지면 감시 루프가 처리 해시 없이 떠 같은 결과 줄로 거짓 `RESULT_READY` 를 냄. 빠진 경로는 `--hash` 로 따로 읽음.
- `EVENTS` 의 `bad`: 깨진 JSON 줄 1개에서 jq 가 멈춰 뒤 줄을 조용히 버리고 rc=0 으로 끝나던 문제 (조회 실패를 데이터 없음으로 위장). 깨진 줄은 누구 줄인지 몰라 파일 전체에서 셈.
- `CONFLICT_CLEARED`: 압축 뒤엔 직전 스윕 뒤 해소 수(`team.sweep` 의 `resolved`)를 기억으로 복원 불가. `cleared` 는 해소 건너뜀(REFLECTED)·사람 머지 감지에서도 남음 → 같은 id8 의 `team.result resolved` 와 이웃한 것만 `resolved` 로 셈 (기록 순서는 정해져 있지 않고, 조상 확인 실패의 `human` 뒤 사람 머지로 푼 `cleared` 는 빠짐).
- 이유: 실행 중 연장(「인자」)을 모르고 `team.start` 의 옛 시각으로 복원하면 곧바로 마감으로 감.
- 해소 워커 (「5-2. 해소 spawn」) 워크트리 = `<MAIN>/.claude/worktrees/dflow-<id8>-resolve` (두 백엔드 공통). detached 라 브랜치 없음.
- 이유: 일시 제외가 풀려 다시 띄운 작업이 옛 `skipped` 로 재차 일시 제외되거나, 결과 난 작업이 진행 중으로 남지 않게 함.
- 이유: 살아 있는 팀원과 같은 `AGENT_ID` 를 다시 발급하면 좌석표가 한 인물을 두 책상에 그림.
- 이유: tmux 서버가 팀장과 독립해 돌아 팀장이 죽어도 팀원이 계속 돎.
- 이유: 보존된 `blocked` 워크트리의 같은 질문이 재구성마다 재통지되거나 같은 결과가 두 번 처리되지 않게 함. 답을 받은 pane 팀원이 새 질문으로 다시 `blocked` 가 되어도 놓치지 않음. 집계는 order 로 중복 제거. 줄과 해시는 한 번의 Bash 호출로 함께 읽음.
- 이유: 자동 재시작이 멈춤으로 내린 작업(`park`)과 한도 대기 중 작업을 팀장 재기동마다 되살리지 않음. `RESTART_DUE` 는 이 다섯 조건과의 교집합일 때만 재개 가능 (재투입 전 확인 = `references/restart.md` 「재투입」, 이번 기상의 show 로 판정). 재시작 대기 목록과 id8 로 합쳐 1번만 띄움.
- 이유: 재개가 매번 실패하는 작업이 팀장 재기동마다 슬롯을 먹는 것을 막음 (세션을 넘어 반복됨). 별도 카운터 파일은 새 저장소를 안 만들려고 안 둠.
  - 결과 줄이 하나라도 나오면 `skipped` 여도 수가 0 으로 돌아가는 것은 **의도**. 상한 대상 = 결과를 못 남기고 거듭 죽는 경우; 판정을 남긴 작업은 그 status 의 제외 규칙이 다룸.
- 이유: 남긴 워크트리가 `w<slot>` 값을 그대로 가지면 그 슬롯에 새로 뜬 팀원과 슬롯 표시가 겹쳐 재구성이 충돌.
- `failed…` 로 끝난 작업이 자동 재개로 안 가는 이유: 그 워크트리에는 최종 판정 `.result` 가 있어 고아 스캔의 "재개 가능" 에 안 걸림. 원인(권한·의존성 설치·한도)을 사람이 먼저 고쳐야 같은 자리에서 다시 안 죽음. 고친 뒤 `--resume` 이 그 워크트리를 이어받음.
  - 이 표는 시작·마감 보고 모두에 냄: 자동으로 못 이은 작업이 조용히 사라지면 미커밋 산출물을 안은 워크트리가 아무도 모르게 남음. 재시작 명령은 갈래마다 아래 중 하나를 그대로 적어 복사해 쓰게 함.
- `.dflow-agent` 를 먼저 되돌리는 이유: `dflow.mjs heartbeat` 는 값이 `*/parked` 면 exit 2 로 거부 → `parked` 인 채 재개하면 좌석표에 진척을 못 알림. `<slot>` = `.dflow-prompt` 의 `AGENT_ID=` 에 박힌 번호.
- 이유: 정본(서버·원격 agent 브랜치·워크트리)과 따로 도는 저장소는 동기화 규칙을 계속 맞춰야 함.

## 0. 환경 감지 (시작 맨 처음)

- 이유: Orca 안에서 띄운 팀장은 팀원을 Orca 탭으로 띄워야 사람이 같은 화면에서 보고 답함. tmux = Orca 밖에서 띄운 팀장의 백엔드.
- `TMUX` 환경변수는 감지에 안 씀: 전용 소켓이라 팀장이 tmux 안인지가 무의미하고, Orca 안에서도 채워져 오진의 근원이었음.

## 1. 시작

- 블록은 실패 항목을 모두 `FAIL …` 로 출력한 뒤 0 아닌 값으로 끝남. **exit ≠ 0 이면 아무것도 띄우지 않고 중단·보고.** 이유: 출력만 하는 검사는 읽고 넘어가면 그대로 진행됨. `<UNTIL>` = 「인자」 에서 정규화한 종료 시각.
- 이유: 내게 배정된 작업의 `<TASKS>/<TSK>/state.json` (phase=ready) 이 개발 브랜치에 있으면 사람이 리포만 보고 할 일을 알고 팀원 워크트리(`origin/<기본브랜치>` 기점)에도 보임. 팀장이 실제로 커밋해 반영했을 때만 참. **push 실패가 보고되면** 다음 승인 스윕 전에 `git pull --rebase origin <기본브랜치>` 로 사람이 되돌림.
- 이유: "마지막 `team.start` 이후" 필터가 이전 세션의 이벤트를 가리지 않게 함. 이 단계 = 재기동 절차.
  - 서버에 claimed 인데 흡수한 슬롯·고아 워크트리·답을 기다리는 `blocked`·대기 중인 답 어디에도 없는 id8 은 **"멈춤" 표(사유 `워크트리 없음`)** 에 넣고 영구 제외. 자동 재착수 안 함.
  - 이유: 이 PC 에 워크트리가 없으면 다른 PC·수동 세션에서 지금 도는 것과 구분할 수단이 없음. 생존 신호는 서버 DB (`last_heartbeat_at`·`heartbeat_phase`) 에 있지만 **`show` 가 내주지 않고**, `show` 의 `stale` 은 `claimed_at` 24시간 경과 여부 (`AGENT_CLAIM_STALE_HOURS`) 일 뿐.
  - 사람이 `--resume <id8>` 으로 지목할 때만 이어받음 (「5-1. 재개 spawn」).
  - **워크트리가 이 PC 에 남은 갈래는 「팀장 상태」 고아 스캔의 "재개 가능" 이 자동 이어받음.** `.dflow-agent` 가 이 신원·host 를 달고 있어 이 팀장 계보임이 드러남.
  - 답을 기다리는 `blocked` 를 뺌: 이미 슬롯을 잡고 자기 화면에서 답 대기 중이라 재개 대상 아님 (5번이 답 대기 목록을 이어받음).
- 이유: `--scope claimed` 는 보고까지 끝난 `RP`(reported) 행도 돌려줌. 승인 대기이지 재개 대상 아님.
- `TMUX=` 를 앞에 붙이는 이유: 팀장이 이미 tmux 안일 때 중첩 attach 가 거부됨.
  - `AUTOMERGE_ON` 이면 (「인자」 자동 머지) "자동 머지: 켜짐. 완료 보고된 작업은 승인 전에 main 에 머지하고, 승인은 사후에 확인합니다." 를 한 줄 알림. 꺼져 있으면 알리지 않음.
  - 종료 시각 줄 바로 다음에 `키: <이름(<email>, <prefix>)` 를 적음 (토큰이 하나여도). 값 = 「인자」 키 판정의 `selected` 행. 이유: 어느 신원으로 도는지가 배정 목록·좌석표 신원·claim 주체를 모두 정함.
- 팀장을 평소 모드로 띄운 사람도 팀원은 무제한으로 돈다는 사실이 여기서 드러나야 함.
- 이유: 이후 기상의 재구성은 새 `team.start` 이후만 읽음 → 다시 기록하지 않으면 이어받은 팀원이 죽은 것으로 보이고 같은 결과가 다시 처리됨. 답 대기 질문도 사라져 `<id8<답>` 이 매칭 안 되고 "기다리는 질문이 하나면 id8 없이 답해도 된다" 가 깨짐.
  - 그 다음 **승인 스윕** (「4. 승인 스윕」) 1회 → 결과(머지됨·대기·반려·건너뜀)를 한 줄씩 보고. 사전 검사 없이 늘 부름 (「4-0」 의 예외).
  - 스윕 뒤 빈 슬롯이 있으면 재개 대상을 띄움 (「5-1. 재개 spawn」). 스윕이 먼저인 이유: 스윕이 선행을 main 에 반영하면 재개한 워커가 기점을 다시 안 잡아도 됨.
- `<lease-lost 절대경로>` = `git rev-parse --path-format=absolute --git-path dflow-team.lease-lost` 의 값을 **리터럴로** 박음 (루프와 같은 이유).
- 이유: 종료 알림이 세션에 오지 않아 루프가 소리 없이 끊김.
- 이유: 첫 watch 응답의 `resume_requests` 를 건너뛰면 사람이 화면에서 누른 요청이 첫 `TICK` (최대 30분) 까지 놓임.
  - `<N>` = 「인자」 에서 정한 인원. `<M>` = 슬롯 표에서 찬 슬롯 수. `<UNTIL_LABEL>` = 「인자」 의 표시 문자열.
  - `--project` 는 넘기지 않음: `dflow.mjs watch` 가 설정의 `project_id` 를 기본값으로 쓰고, `${V:+--project "$V"}` 꼴은 zsh 에서 한 단어로 넘어가 호출이 usage 로 끝남.
  - 신원은 `$who`·`$host` 를 다시 쓰지 않고 방금 쓴 잠금 `owner` 에서 읽음: 이 6번이 1번과 다른 Bash 호출이라 env 가 안 남음.

## 2-1. poll

- 경로에 공백이 있으면 `DFLOW_CONFIG_DIR` 값이 끊겨 poll.mjs 를 못 찾고 poll 이 곧바로 죽음.
- 빈 디렉터리를 cwd 로 두는 이유: 승인·반려 감지 재료가 없어 poll exit 9·10 이 팀장에게 절대 안 옴. 9·10 감지는 `--exclude` 를 안 봄 → 팀장 체크아웃에 수동 마감한 state.json 이 있으면 재기동마다 즉시 다시 울려 공회전. 팀장은 기상마다 승인 스윕 판정(「4-0」)을 하므로 9·10 이 필요 없음.
- `DFLOW_CONFIG_DIR` 을 주는 이유: poll 의 cwd 가 git 작업 트리 밖(`.git/…`)이라 설정 위치를 못 찾음. 레거시 리포는 `<MAIN>/.env` 를 읽음. dflow.mjs 경로는 poll.mjs 가 자기 위치로 풀므로 안 줌. `git rev-parse --git-path` 는 상대경로를 줄 수 있어 `cd … && pwd` 로 절대경로를 만듦.
- `DFLOW_WATCH=0` 을 주는 이유: 팀장이 자기 식별자로 watch 를 이미 보냄. poll.mjs 의 watch 까지 더하면 같은 팀장이 둘로 보이거나 `slots`·`busy` 없는 신호가 `lead` 행을 덮어씀.
- 이유: 팀원이 claim 하기 전까지 그 작업은 ready → 안 넣으면 poll 이 즉시 다시 찾아 짧은 간격으로 서버를 침. `--exclude-temp` = 일시 제외 목록, `--exclude-wait` = 선행 대기 목록 (「2-3」 선행 대기 블록 출력의 id8). 한 id8 은 둘 중 한쪽에만.
- 메모리에만 있는 값이 떠 있는 poll 프로세스 안에 숨으면, 압축으로 대기 큐를 잃었을 때 그 작업들이 보이지 않는 제외에 갇힘.
- poll 재기동 시 10주기·40주기 (poll.mjs 프로세스 안에서 셈) 계산이 처음부터 다시 시작. 재검사가 늦어질 뿐 틀린 착수는 없음. 선행 대기는 poll.mjs 가 40주기(2시간) 뒤에 풀되, poll 이 ready 마다 끝나 자주 다시 뜨므로 선행 대기 블록도 기록 시각으로 2시간 지난 것을 목록에서 뺌 (먼저 닿는 쪽이 풂).
- poll exit 0 의 재대조는 일시 제외 목록을 안 봄 (「2-3」 표): 팀장이 자기 목록으로 다시 버리면 같은 목록을 다시 `--exclude-temp` 로 넘겨 그 작업이 그 세션에서 끝내 안 뜸.
- **poll.mjs 필터 캐시 (`--tag-cache-cycles`, 기본 3)**: list 응답(`/work/mine`)에는 tags 도 `updated_at` 같은 무효화 키도 없음.
  - `--require-tag`·`--wp` 에서 떨어진 후보의 tags·external_ref 를 `${XDG_CACHE_HOME:-$HOME/.cache}/dflow/poll-filter-cache-<cksum>.tsv` 에 적고 `주기 수 * interval` 초 동안 show 를 건너뜀. 위치 = dflow.mjs 캐시 폴더, api_base·바인딩별 (스테이징이 운영 데이터를 복제해 같은 주문 id 가 두 서버에 있을 수 있음). 파일인 이유: poll 이 ready 마다 끝나 다시 떠 프로세스 안 주기 계산은 매번 처음부터.
  - 담는 것 = 탈락뿐: 팀장 show 필터는 태그를 다시 안 봐 poll 이 `agent` 의 유일한 관문 → 통과를 캐시하면 사람이 태그를 뗀 작업을 띄움. 캐시된 탈락도 매번 지금 필터로 다시 판정하고 통과할 값이면 show. 조회 실패는 안 담음.
  - 대가: 태그를 새로 단 작업은 최대 약 (3+1) 주기 (interval 180초면 9-12분) 뒤에 잡힘 (전에는 1주기). 캐시 폴더를 쓸 수 없으면 시작 때 1번 알리고 예전처럼 돎.

## 2-3. 기상마다 하는 일

- tick.mjs 에 `--pid "${CLAUDE_PID:-$PPID}"` 를 넘기는 이유 (「2-2」): 없으면 부모의 부모를 팀장으로 추정, 한 단계 더 감싸이면 다른 PID 가 되어 wake.mjs 가 `LOCK_LOST` 를 내고 변화 없는 TICK 건너뛰기가 늘 깨움. 관례 = 「1. 시작」 의 `LEAD_PID`.
- `STALE` 출력의 `EVIDENCE`: 건너뛴 루프가 뒤에 교체돼 `STALE` 로 끝나도 앞에 실린 `EVIDENCE` 가 다음 TICK 의 직전 증거. 버리면 멈춘 슬롯이 더 오래된 증거와 비교돼 살아 있는 것으로 보임.
- 이유: 살아 있는 팀장의 잠금이 70분 뒤 죽은 것으로 보이지 않게 하되, 잠금을 잃은 팀장이 새 팀장의 잠금을 계속 살려 두지 않음 (「1. 시작」 팀장 잠금).
  - 기상에서 이벤트는 이 출력이 띄운 `references/events.md` 의 명령 블록을 그대로 씀. 기억으로 재구성한 명령은 인자가 비거나 추가 필드를 빠뜨려 null 필드를 남기고, events.md 의 가드가 `EVENT_ARGS_MISSING` 으로 거부 → 보이면 명령 블록을 다시 띄워 다시 기록.
- 이유: 같은 신원이 다른 프로젝트 리포에서도 팀장을 돌림 → 안 거르면 이 리포에 남의 워크트리를 만들어 재개. 처리 규칙은 셋.
- 이유: 갱신 프로세스만 죽으면 이 팀장은 살아 있는데 lease 가 3분 뒤 만료돼 다른 곳이 가져갈 수 있음.
- 이유: 이 팀장이 `beat` 를 70분 넘게 놓친 사이 다른 팀장이 잠금을 가져갔다면 두 팀장이 같은 체크아웃에서 스윕·spawn 하고 같은 슬롯 번호를 냄. `beat` 를 못 쓴 경우도 곧 가져갈 수 있어 소유를 장담할 수 없음.
- 이유: 팀장의 poll 에는 exit 9·10 이 안 옴. 대가: 승인 반영이 사람 승인 뒤 다음 기상까지 늦어짐 (`TICK` 이 있어 최대 30분).
  - 지연 동안 승인됐으나 main 미반영인 선행은 워커가 그 `head_sha` 를 스택 기점으로 받음 (`/dflow-dev` 「--worker」 B). 승인 대기인 선행의 후속은 `skipped` 로 일시 제외됐다가 승인·머지 뒤 재검사(10주기 = 30분)에서 풀림 (「--worker」 G).
  - 자동 머지(`AUTOMERGE_ON`)면 승인 대기 선행도 결과 도착 스윕에서 곧바로 머지 → 후속은 워커의 기본 브랜치 반영 확인(「--worker」 G)을 통과해 승인을 안 기다리고 착수.
- 이유: 겹쳐 뜬 옛 poll 은 옛 제외 목록으로 돌고 있을 수 있어 일시 제외는 대조하지 않음: poll.mjs 가 10주기 뒤 풀어 돌려준 것을 그대로 다시 판정해야 함 (「2-1」). 대가: 겹쳐 뜬 옛 poll 이 막 일시 제외한 작업을 돌려주면 1번 더 띄워 `skipped` 로 끝남.
  - 남은 후보마다 아래 show 필터로 `.order.item.spec` 이 비었는지와 선행 사전 검사(`deps_unmet`)만 봄. spec 본문을 컨텍스트에 싣지 않음.
  - 비었거나 `ref` 가 비면 일시 제외에 넣고 사유(spec 부재·TSK 없음)를 보고하며 `team.result` (slot `-`, status `skipped`) 를 남김.
  - `deps_unmet` ≠ 빈 값이면 띄우지 않고 사유 `선행 미충족(사전 검사: <ref…>)` 로 보고와 `team.result` 는 같게 하되, 일시 제외가 아니라 **선행 대기**에 넣음 (아래 「선행 사전 검사」). `deps_unmet` = 빈 값 + `deps_nohead` ≠ 빈 값이면 아래 「선행 반영 사전 검사」.
  - 남은 것을 빈 슬롯 수만큼 spawn, 나머지는 대기 큐 끝에. 차단기가 걸려 있으면 spawn 없이 대기 큐에 (시험 spawn 예외는 「2-1」 재기동 조건). 대기 큐를 잃어도 그 작업들은 아직 ready → 다음 poll 이 다시 찾음.
- 이유: 조회 실패를 데이터 없음으로 위장하면 살아 있는 작업이 spec 부재로 잘못 제외됨.
- 이유: 진행 중인 선행이라도 승인되면 `head_sha` 를 기점으로 스택해 진행하는 것이 워커 규칙(행 B) → merged 기준은 확정 skip 이 아닌 작업까지 30분씩 묶음.
  - 이 검사를 두는 이유: poll 은 10주기마다 일시 제외를 풀어 선행이 진행 중인 후속을 다시 돌려줌. 그대로 띄우면 후속마다 팀원 세션이 열려 행 G 판정만 하고 `skipped` 로 끝나며 선행이 끝날 때까지 30분마다 토큰과 슬롯을 씀.
  - 면제된 간선(`waived:true`, 계약 2.8)은 서버가 `reached:true` 로 줌 → 이 검사에 안 걸리고 그대로 spawn.
- 이유: 선행이 끝나기 전에는 몇 번을 다시 봐도 결과가 같음. 30분마다 풀면 같은 Task 를 되풀이 검사하며 기상마다 토큰을 씀. 푸는 길은 셋.
- **선행 대기**: 이 검사로 건너뛴 작업은 일시 제외(30분)가 아니라 선행 대기에 둠.
- **선행 반영 사전 검사** (`deps_nohead`): `deps_unmet` = 빈 값 + `deps_nohead` ≠ 빈 값 (서버 `reached` 는 참인데 `head_sha` 가 없는 선행 = 완료 보고 뒤 승인 전) 이면 워커 행 G 갈래 2 의 반영 확인을 여기서 먼저 함.

## 선행 대기의 설계 선행(design-ahead.md, 2026-09-26)

설계: wbs-web 리포 docs/superpowers/specs/2026-09-26-dflow-parallel-token-design.md §6 (킷 미동봉).

- **빈 슬롯이 남을 때만 주는 이유**: 선행 충족 후보 = 끝까지 갈 수 있는 일, 설계 선행 = 선행이 계약을 바꾸면 재작업이 생기는 선불. 충족 후보를 밀어내면 처리량이 줆.
- **상한(`DFLOW_DESIGN_AHEAD_MAX`, 기본 2)에 돌고 있는 것까지 세는 이유**: 설계만 끝난 작업이 쌓이면 선행이 바뀔 때 다시 할 설계가 커짐. 설계 완료 대기만 세면 빈 슬롯이 셋인 기상에 셋을 한꺼번에 띄워 상한을 넘김.
- **선행 단계를 팀장이 판정하지 않는 이유**: 착수 전 선행에 설계 선행을 허용하지 않는 규칙은 서버(`design_first_too_early`)가 집행하고 두 곳에서 판정하면 어긋남. 대신 거부된 작업을 2시간 (또는 그 선행의 완료 신호까지) 다시 고르지 않음 (안 그러면 30분 일시 제외가 풀릴 때마다 같은 거부 반복).
- **설계 완료 대기 목록의 정본 = 워크트리 state.json**: 주문이 claimed 라 poll 이 안 돌려주고, 이벤트는 `team.start` 로 잘리며 압축 뒤 요약에서 빠짐. 워크트리는 팀장을 다시 띄워도 남음.
- **워크트리를 지우지 않는 이유**: 선행이 끝나면 같은 워크트리로 이어 구현 (지우면 의존성 설치·기준선부터 다시). agent 브랜치는 멈출 때 push 하므로 워크트리를 잃어도 `--resume` 이 원격에서 다시 만듦.
- **재시작·재개 후보에서 빼는 이유**: 서버는 claimed·mine·이 PC 이고 살아 있는 팀원이 없음 → 고아 스캔의 "재개 가능" 과 자동 재시작(무응답·pane 죽음)이 모두 집음. 선행이 아직이면 재개한 팀원은 곧 다시 멈추고 다음 기상이 또 띄워 끝없이 돎.
  - 좌석표 「이어서 시작」 요청만은 그대로 띄움. 워커의 `wait_pred` heartbeat 가 서버의 요청 표식을 비움 → 1번 누름에 1번.
- **점유자 신원**: 재개는 claim 하지 않음. 서버는 PAT 경로에서 점유자를 `claimed_by_user_id` 로 가름. 재개 팀원의 슬롯 번호가 달라져 `.dflow-agent` 라벨이 바뀌어도 같은 체크아웃의 `.dflow.local` (같은 `as` 키) 을 쓰므로 build-start 가 통함 (라벨 = 좌석 표시일 뿐).

## 2-4. 팀원 이슈 보고 처리

- **사람에게 보고만 하고 턴을 끝내는 것은 금지.** 팀장이 사람에게만 전달하고 멈추면 둘이 서로를 기다리며 교착.

## 3. 결과 처리

- 멈춘 오케스트레이터 주입 문구 "(구현 단위가 남았으면 다음 단위·묶음을 띄워라)": Build 가 구현 단위로 나뉜 뒤로는 마지막 아닌 단위에서도 멈출 수 있고, 그때 게이트를 돌리면 남은 단위를 빼먹은 채 실패 (`/dflow-dev` `references/orch/phase-common.md` 「서브에이전트가 끝났는데 게이트를 안 돌렸을 때」 와 짝).
- 없으면 backends.md 「결과 줄과 죽은 pane 폴백」 대로 `capture-pane -p -J -S -` 로 죽은 pane 의 화면 전체를 읽어 `<TSK<id8` 로 시작하는 마지막 줄을 찾아 처리.
  - `failed not-isolated` = 워커가 파일을 안 씀 → 이 폴백으로만 옴.
  - 그것도 없으면 `#{pane_dead_status}` 를 읽음 (`references/restart.md` 「판정」 블록의 `dead_status`). `127` (`claude` 를 못 찾음) 이면 **곧바로** `failed no-result` (hash `-`): 다시 띄워도 같은 자리에서 죽는 환경 결함.
- 기록 명령은 별도 Bash 호출이라 그 셸 변수를 이 블록이 못 봄. 기록 실패가 슬롯 해제를 막으면 안 됨.
- 워크트리를 정리하기 전에 옮기는 이유: 정리(`git worktree remove --force`·`orca worktree rm`)가 미추적 `.issues` 를 함께 지움.
- 이유: 「5. 팀원 spawn」 6번이 넣은 진행 중 제외가 남으면 `skipped`(일시 제외)와 `failed rate-limit`(제외 없음)의 재시도가 영영 막힘.
- 스윕을 먼저 하는 이유: 방금 끝난 작업이 기본 브랜치에 들어가야 그 후속이 착수할 수 있음.
- poll 과 claim 은 같은 기준(내 멤버 id)으로 배정을 봄 → 대개 poll 이 돌려준 뒤 담당자가 바뀌었거나 팀장이 poll 을 거치지 않고 띄운 것. 사유와 함께 "담당자 변경 여부를 D'Flow 에서 확인하라" 를 보고.
- **그 자리에서 정리하는 이유**: git 은 다른 워크트리가 체크아웃한 브랜치를 못 지움 → 마감까지 남기면 같은 세션에서 승인된 작업의 로컬 agent 브랜치 삭제가 실패. 정리 명령 = backends.md 「정리」·「고아 정리 규칙」 (워크트리를 지웠으면 그 규칙 5번의 생성 브랜치 정리까지).
- 순서 = 결과 처리 → 탭 닫기 → 워크트리 정리. 응답의 `ptyKilled:false` ≠ 실패 (claude 프로세스는 실제로 끝남, `lsof` 확인). **`blocked` 는 예외로 거두지 않음**: 답을 기다리며 계속 살아야 함.
- 이유: 사용량 한도나 환경 결함에 걸린 채 대기 큐 전체를 소진하지 않게 함. 자동 재시작의 `team.lost` (모든 `cause`) 도 실패 1건으로 셈 (`references/restart.md`), 단 `next=wait` 인 `team.lost` 는 안 셈. 걸린 동안의 시험 1건은 재시작 대기가 새 작업보다 먼저.
- 이유: 주문이 종착 상태라 더 올 결과가 없음. 멈춘 세션이 슬롯을 계속 잡으면 대기 큐가 섬.
- 그 값은 `claimed_at` 으로부터 24시간 경과 여부일 뿐 → 2시간 전에 죽은 워커에도 `false`. 느린 팀원을 죽이면 미커밋분을 잃고, 권한 확인에 걸려 멈춘 팀원은 사람이 보면 풀림.
- tmux = `kill-pane`, Orca = `orca terminal close --terminal <handle--tab --json` 으로 팀원을 멈추고 슬롯 해제. 워크트리는 고아 정리 규칙을 따름.
- **자동 재시작**: 위 자동 정리는 `references/restart.md` 「판정」 이 대신함 (두 백엔드 공통). 두 TICK 연속 무변화 (또는 결과 없는 pane·탭 죽음) 면 원인을 가려, 재시작 후보는 워크트리를 지우지 않고 pane (Orca 는 탭) 만 거둔 뒤 `team.lost` 를 기록하고 같은 기상에 「5-1. 재개 spawn」 (재시도 상한 3 은 고아 재개와 공유). 영구 제외는 `team.lost` 가 대신함.

## 4. 승인 스윕

- 팀장이 스스로 revert 하지 않는 이유: 그 위의 후속이 반려된 코드에 기댈 수 있음. 되돌리기가 후속까지 깨뜨리는지는 사람이 판단.
- 이유: 훅이 막는 작업 (예: 스테이징 리허설 트레일러 없는 마이그레이션) 1건이 후보 앞쪽에 있어도 뒤의 승인분은 계속 반영돼야 함. 스윕을 멈추면 사람이 풀 때까지 매 기상이 같은 자리에서 멈춤.
- 이유: 그사이 담당자가 바뀌었거나 다른 팀장이 가져갔을 수 있음. 거르는 곳 = poll 의 `--scope assigned` 조회 (직접 띄운 작업이 `failed not-assignee` 로 끝난 적 있음).
- 이유: 방금 머지로 풀린 후속이 10주기(30분)를 기다리면 자동 머지를 켠 의미가 줆. 떠 있던 옛 poll 이 옛 목록으로 1번 더 돌아도 poll exit 0 처리의 대조와 spawn 전 확인이 같은 작업을 두 번 띄우지 않게 막음 (「2-3」 5번).
- `decision` 을 `pending` 으로 쓰지 않음 — 재구성이 `pending` 을 답 안 한 팀원 이슈로 읽고 지시를 보낼 팀원을 찾음.
- 이유: 팀장 체크아웃의 `<TASKS>/*/state.json` 은 `LEGACY_REPORTED` 검사가 읽음. 옛 커밋에 머물면 이미 머지된 작업의 옛 state.json 을 보고 재기동을 거부할 수 있음.

## 4-0. 스윕을 부르는 규칙

- 이유: 약 17시간 실측에서 스윕 38회 중 20회가 머지 0건 (49초 간격도 있음). 호출 지점이 여러 절에 흩어져 한 기상에 겹쳤고, 부를 때마다 `/dflow-merge` 본문(약 61KB)이 팀장 문맥에 다시 들어감.
- 이유: 판정 불가를 후보 없음으로 뭉개면 승인된 작업이 머지 안 되고 그 후속이 기본 브랜치 반영 확인에 걸려 섬. 스윕을 1번 더 도는 비용이 더 쌈.
  - 자동 머지(`AUTOMERGE_ON`)에서도 같음: `done` 한 작업의 agent 브랜치는 원격 후보라 늘 `SWEEP_CANDIDATES` 가 나옴. 승인 전 머지분(`merged`+`unapproved`)도 사람이 승인·반려할 때까지 후보로 남아 그 판정을 읽음.
- 이유: 방언 검증의 보류·BUSY·오류는 "다음 스윕" 이 다시 시도함. 후보가 없어 스윕을 건너뛰면 그 재시도가 굶음. `/dflow-merge` 본문을 다시 싣지 않도록 스크립트만 부름.

## 5. 팀원 spawn

- 워커는 이 값을 다시 해석하지 않음: detach 된 옛 커밋에는 `.dflow.local` 의 `project_map` 이 없거나 달라, 워커가 스스로 구하면 팀장이 구한 값과 다른 `TASK_DIR` 이 나올 수 있음 (`DEV_BRANCH` 와 같은 이유).
- 워커 프롬프트 경로를 절대경로로 주는 이유: 새 워크트리에 스킬이 없을 수 있음.
- `WT` = tmux 와 같은 자리 `<MAIN>/.claude/worktrees/dflow-<id8>`. 기점 = agent 브랜치가 결국 머지될 `origin/<기본브랜치>` 로 명시 (준비 블록의 `git worktree add`). 결과 JSON 의 `result.terminal.handle` (옛 런타임은 `result.agentTerminalHandle`) 을 슬롯 표와 `$WT/.dflow-pane` 에 저장.
- 워크트리를 새로 만들지 않고 claim 도 하지 않기 때문.
- **`docker-allow.mjs --reuse-dir`**: 새 작업 1건을 띄우기까지 같은 주문을 poll·show 필터·docker-allow 가 3번 show 했음. show 필터가 받은 응답을 `tee` 로 `<git-path dflow-team-poll>/show-<id8>.json` 에 남기고 3번 블록의 docker-allow 가 씀.
  - 재사용을 같은 기상의 방금 받은 응답으로 묶음 ("옛 포인터 값을 옮겨 쓰지 않고 서버 tags 를 다시 읽는다" 규칙 유지): 5분 안에 쓰인 파일 + 같은 주문 id 일 때만 쓰고, 쓰든 못 쓰든 1번 뒤 지움. 못 쓰면 show 로 다시 읽음 (금지 아님).
  - 재사용 안 하는 길: 재개(resume.md)·재투입(restart.md) = 옛 포인터가 남은 경로라 마지막 show 뒤 사람이 태그를 바꿨을 수 있음. 해소(merge-conflict.md) = 스윕에서 오며 show 없음.

## 5-2. 해소 spawn

- 입장 제어도 같음: merge-conflict.md 가 backends.md 의 공용 스폰 블록 (「팀원 워크트리 준비」, `chmod +x` 줄까지) 을 그대로 돌리므로 그 첫 단계가 집행. `SPAWN_DEFERRED_CAPACITY` 면 해소 큐에 두고 merge-conflict.md 「2」 의 5-7번 (`team.spawn`·표시 note·감시 루프 항목) 을 안 함.

## 5-3. 입장 제어 (spawn 직전 자원 확인)

- 이유: 10코어·16GB PC 에 팀원 6명이 동시에 무거운 검증을 돌려 load average 52, 스왑 18GB 중 17GB 까지 올라 PC 가 멈추다시피 함. 이미 모자란 PC 에 팀원을 더 얹지 않음.
  - **이미 떠 있는 팀원은 건드리지 않음** (끄거나 멈추지 않음).
  - 무거운 명령 자체의 동시 실행은 워커 쪽 `heavy.mjs` (`dev-discipline.md` 「무거운 명령 줄 세우기」) 가 따로 묶음.
- 이유: 재개·재투입은 워크트리를 새로 만들지 않고 있는 것을 이어 씀.
- 새 작업(「5」)·해소(「5-2」)의 spawn 블록 (backends.md 「팀원 워크트리 준비」) 은 두 백엔드 모두 그 두 줄로 시작. 블록을 통째로 안 도는 재개·재투입 (「5-1」 0항, restart.md 「재투입」) 은 「입장 제어」 블록을 첫 단계로 따로 돎.
- 성능 보호이지 보안 가드 아님.
- heavy 대기자를 보는 이유: 슬롯이 이미 줄을 서 있으면 팀원을 더 얹어도 줄만 길어짐. `heavy.mjs status` 를 못 읽으면 그 항목만 판정하지 않음 (`unknown=heavy`). 사람이 바꾸려면 팀장 세션의 환경변수 `DFLOW_CAP_MIN_FREE_PCT`·`DFLOW_CAP_MAX_LOAD_PER_CPU`·`DFLOW_CAP_MAX_SWAP_PCT` 로 덮음.
- macOS 스왑은 압박이 풀린 뒤에도 몇 시간씩 남아 평상시 기준으로 쓸 수 없음.

### 주간 사용량 (`capacity.mjs usage`, 2026-09-25)

- 목적: 주간 한도(`seven_day`)가 바닥나면 도는 팀원이 모두 한도에 서서 진행 중 작업까지 멈춤 → 끝이 가까우면 새 작업을 줄여 이미 도는 작업이 끝날 몫을 남김.
  - 기본: 90% 이상이면 동시 팀원 2명까지, 95% 이상이면 새 작업 없음. 팀장 세션 환경변수 `DFLOW_CAP_WEEKLY_CAP_PCT`·`DFLOW_CAP_WEEKLY_STOP_PCT`·`DFLOW_CAP_WEEKLY_MAX` 로 덮음.
  - `.dflow`·`dflow.mjs config` 키는 안 둠 — `DFLOW_TEAM_MAX` 처럼 PC·세션마다 다른 운영값이라 리포에 커밋할 값 아님.
- 적용 범위: **새 작업 spawn (「5」, 차단기의 시험 spawn 포함) 만** 봄. 재개·재투입 (「5-1」) 은 진행 중 작업을 살리는 것, 해소 (「5-2」) 는 이미 보고한 작업의 충돌 해소라 막으면 끝낼 일이 쌓임 → 공용 spawn 블록 (backends.md 「입장 제어」 두 줄) 에 안 넣고 「5」 0항에서 블록 전에 따로 부름. 이미 떠 있는 팀원은 건드리지 않음.
- 팀원 수 (`--live`): 팀장 슬롯 표의 점유 슬롯 수 (blocked·해소 팀원 포함 — 떠 있는 세션은 모두 사용량을 씀). **이번 기상에 방금 띄운 것도 셈** (빼면 90% 에서 한 기상에 여러 명이 한꺼번에 나감). 값이 없거나 이상하면 CAP 띠에서 미루지 않음 (STOP 은 팀원 수와 무관).
- 출처: 팀원 statusLine 덤프 `~/.dflow/limits/<id8>.json` (backends.md 「statusLine 덤프」, restart.md 「한도 판정」 과 같은 파일·같은 jq 읽기).
  - 주간 사용량 = 계정 전체 값 → 어느 팀원 것이든 같음. `seven_day` 가 있는 덤프 중 `at` 이 가장 큰 것 하나를 씀. 살아 있는 팀원만 고르지 않음: 죽은 팀원의 덤프는 `at` 이 더 오래돼 최근 것에 지고, 고르려면 백엔드별 생존 확인이 스크립트에 들어와야 함.
  - 같은 PC 의 둘째 팀장 덤프도 같은 계정이면 같은 값 (다른 계정 팀장이 같은 PC 에 있으면 섞임 — 받아들임). `<id8>.settings.json`·`.tmp` ≠ 덤프.
- **fail-open**: 덤프가 없거나, `seven_day` 가 없거나 (API 키 사용자, `rate_limits: null`), jq 가 없거나, 깨졌거나, 주간 창이 이미 해제됐으면 (`resets_at` ≤ 지금) `CAPACITY_USAGE_UNKNOWN` 으로 막지 않음. 이 값 = 사용량 절약용 참고 신호이지 보안 가드 아님 (fail-closed 는 보안 가드에만; 입장 제어의 `CAPACITY_UNKNOWN` 과 같은 판단). 모를 때 막으면 statusLine 없는 환경 (Windows·옛 워커·`DFLOW_WORKER_PLUGINS=keep`) 에서 새 작업을 영영 못 받음.
- **옛 덤프를 쓰는 선택**: 30분 넘은 덤프라도 `seven_day.resets_at` 이 아직 미래면 그 값을 씀 (`src=old`).
  - 이유: 팀원이 하나도 없을 때 (팀장 첫 기상·팀원이 다 끝난 뒤) 신선한 덤프가 없어 제한이 꺼지면, 첫 기상에 인원 상한만큼 (16GB PC 면 4명) 한꺼번에 나감 — 95% 에서 막고 싶은 바로 그 상황.
  - 전제: `seven_day` = **고정 창** (해제 시각까지 사용률이 안 줄고 해제 때 0 으로 돌아감) → 옛 값 = 지금 값의 하한 → 옛 값으로 STOP·CAP 을 판정해도 과하게 안 막음.
  - 전제가 틀려 (굴러가는 창이라 사용률이 줄어드는 경우) 헛 STOP 이 나면, 띠가 바뀔 때 1번 나오는 알림 줄 (`src=old`·`age=` 포함) 을 보고 사람이 `DFLOW_CAP_WEEKLY_CAP_PCT=101`·`DFLOW_CAP_WEEKLY_STOP_PCT=101` 을 **둘 다** 주어 끔. STOP 만 올리면 같은 옛 값이 CAP 띠로 떨어져 여전히 2명으로 묶임.
  - 덤프가 아예 없는 PC (첫 실행) 의 첫 기상은 제한 없이 나감 — 받아들임. 창이 해제된 뒤의 덤프는 30분 안의 것이라도 안 씀.
- 알림: 상태 파일은 입장 제어와 따로 둠 (git-path `dflow-team.usage`; 같은 파일이면 입장 제어의 첫 낱말 비교가 흔들려 헛 `notify=1`). `notify` = **사용량 띠** (없음 / CAP / STOP, `UNKNOWN` 은 없음과 같은 띠) 가 바뀔 때만 1 (미룸 여부로 가르면 90-95% 에서 OK↔CAP 이 오가 주기마다 두 번씩 알림). 미룬 작업은 `SPAWN_DEFERRED_CAPACITY` 와 같이 대기 큐에 두고 `team.result`·일시 제외를 안 씀.

## 6. blocked

- **그 슬롯은 blocked 팀원이 계속 잡으며 다른 작업에 재배정하지 않음.** 이유: 살아 있는 프로세스 둘이 같은 `AGENT_ID` 로 heartbeat 를 보내면 좌석표가 한 인물을 두 책상에 그리고 손 든 상태가 새 active 에 덮임.
- **Orca**: "결정 필요 <id8>: <질문>. Orca 의 `w<slot· <TSK<id8· <작업 이름>` 탭에서 답하라" 고 알림.
- 루프가 돈 뒤 팀장이 사람에게 묻는 곳은 여기 하나 (시작 전 인자 질문은 「인자」). 답을 엉뚱한 작업에 넣으면 그 작업이 틀린 결정으로 진행됨.
- `-l --` 로 넣는 이유: `-l` 이 없으면 tmux 가 답을 **키 이름으로 먼저 해석함** (`Up` 이면 위쪽 화살표가 눌려 답이 안 가고, `Space` 면 공백 하나만 들어가 빈 답). `;` 나 따옴표가 든 답은 한 인자로 넘기면 그대로 전달 → 문제 아님. 신뢰 확인의 `Down`·`Enter` 는 키 이름이 맞으므로 `-l` 없이 보냄.
- 이유: 이 기록이 없으면 압축 뒤 재구성이 `team.blocked` 만 보고 이미 답한 질문을 사람에게 다시 통지.

## 금지

- 예외 둘: (1) 머지 충돌 표시 heartbeat (`merge_conflict` 설정·해제, `references/merge-conflict.md` 「3」) 는 팀장이 함.
- tmux `split-window` 가 곧바로 돌아오고 pane 은 tmux 서버가 붙잡음.

## 워커 프롬프트(worker-prompt.md)

### /dflow-team 워커 프롬프트 (정본)

- `{TASK_DIR}` 도 다시 해석하지 않음. 이유: detach 된 옛 커밋에는 `.dflow.local` 의 `project_map` 이 없거나 달라, 워커가 스스로 구하면 팀장이 구한 값과 다른 `TASK_DIR` 이 나올 수 있음.
  - **`TASK_DIR` 이 비어 있으면** `{TASK_DIR}` 을 `docs/tasks/{TSK}` 로 보고 계속함. 이유: `TASK_DIR` 전달 전 버전으로 떠 있는 팀장이 그 경로의 `.result` 를 폴링 → 실패로 끝내면 결과가 안 닿아 슬롯이 멈춤.
  - `project_id` 만 쓰는 리포에서는 이 값 = 정본과 같음. `project_map` 리포에서는 claim 의 `spec.md` 가 `<DOCS_DIR>/tasks/{TSK}` 에 따로 생길 수 있어도 옛 팀장이 보는 곳은 이 폴백뿐이라 결과 전달을 앞세움.

### 1. 격리 확인 (첫 행동)

- && pwd -P` 로 물리 경로로 정규화하지 않는 이유: git 을 감싼 명령 치환이라 격리 가드가 거부함.
- 경로 문자열을 `{MAIN_CHECKOUT}` 와 비교하지 않는 이유: 심링크·표기 차이로 같은 체크아웃이 다른 문자열이 될 수 있음. 격리의 정의 = "링크드 워크트리".
- `.result` 를 쓰면 그 파일이 팀장 체크아웃을 더럽혀 전제 검사가 깨짐.

### 2. 좌석 식별 (격리 확인 직후, 부트스트랩 전)

- 부트스트랩보다 먼저 쓰는 이유: 부트스트랩이 실패해도 (`failed auth` 등) 그 워크트리가 팀장의 재구성·고아 스캔에 보이게 함.
- `{TASK_DIR}` 안에 두지 않는 이유: `/dflow-dev` 가 claim 하려는 `<TASKS>/<TSK>/` 가 이미 있으면 이전 시도의 잔재로 보고 `.prev-<날짜>` 로 옮김.
- 워크트리 1개 = 작업 1개 → 루트 파일로도 모호하지 않음.

### 3. 워크트리 부트스트랩

- Windows(Git Bash) 에서는 `ln -s` 가 복사본을 만들며 복사본으로도 동작함 (backends.md 「플랫폼 차이」).
- 이유: 있는 폴더에 폴더째 링크를 걸면 `.claude/skills/skills` 가 생겨 스킬을 못 찾음. 그래도 `NO_SKILL` 이면 `{TSK} {ID8} - - - failed no-skill` 을 쓰고 끝냄.
- 이유: doctor 는 토큰 인증이 실패해도 그 줄만 출력하고 0 으로 끝남 → 인증은 `me` 의 성공으로만 판정. 설정·인증이 깨진 채 claim 하지 않음.
- 이유: 워크트리의 시작 HEAD 는 팀장의 현재 HEAD 이거나 뒤처진 기본 브랜치일 수 있고, claim 의 선행 도달 검사는 HEAD 를 봄.
  - 스택 기점은 `/dflow-dev` Phase 01 2번이 claim 전에 다시 맞춤.
  - 기점 이동이 실패하면 claim 하지 않고 `{TSK} {ID8} - - - failed detach` 를 쓰고 끝냄. 아직 claim 전이라 서버에 흔적 없음.
- 같은 세션이 같은 워크트리·브랜치에서 그대로 이어 감.
- 이유: 스택이면 기점이 선행 agent 브랜치 → 선행 작업이 lockfile 을 바꿨을 수 있음. 설치할 lockfile 은 그 기점의 것이어야 함.
- 격리 가드가 `.` 소싱 접두를 거부함.

### 5. 서버 쓰기 범위

- 이유: `~/.cache/dflow` 의 목록 캐시를 같은 머신의 팀장·팀원이 공유.

### 6. 판단 규칙 (자동 모드)

- 이유: 판단 분기마다 멈추면 슬롯이 사람을 기다리며 서고 사슬 전체가 밤새 멈춤 (mdm-dict-v2 TSK-01-02: spec 제약과 미승인 선행의 decisions.md 가 충돌해 Design 직후 멈춤). 잘못 고른 결정은 반려 재작업으로 고칠 수 있지만 멈춘 시간은 안 돌아옴.
- 이유: 거부된 명령 목록 = 킷 허용 목록의 재료. 우회한 호출은 다음 실행에서 다시 막힘. 같은 사유는 Phase 서브에이전트에서 나도 워커가 받아 같은 형식으로 보고.

### 7-1. 문제 기록: `.issues` 파일

- 이유: 세션이 중간에 죽어도 그때까지의 기록은 남아야 함.

### 8. 서버 프로세스 규칙

- 사고: 팀원이 자기 워크트리에서 `./be-run.sh --mdm` 을 돌리자 `pgrep -f be-run.sh` 가 메인 체크아웃의 서버를 찾아 TERM, cleanup 의 `gradlew --stop` 이 전역 Gradle 데몬까지 세움.

### 9. 이슈 보고

- 작업 중 사고·환경 문제·판단이 필요한 이슈는 `.issues` (「7-1」) 에 기록하고, 팀장에게 **SendMessage 로 이슈 보고를 보냄.**
  - `to` = 팀장 세션. spawn 때 첫 입력으로 준 포인터가 이 세션의 첫 턴 → 그 포인터를 보낸 세션이 곧 팀장. 형식은 고정.
- 이유: 감시 루프는 cross-session 메시지로 안 깨움 (팀장 SKILL.md 「2. 기상과 감시」) → 이 세션이 SendMessage 로 직접 깨우지 못하면 팀장이 이슈를 영영 모를 수 있음. 조용히 무한 대기하지 않음.

## 백엔드(backends.md)

### 입장 제어

- 이유: 그 둘은 워크트리를 새로 만들지 않고 있는 것을 이어 씀 → 준비 블록 전체를 다시 돌 필요 없음.

### pane(tmux)

- 이유: 서브에이전트는 자기 턴이 끝나면 하네스가 완료로 봄. 그 뒤에 끝난 Phase 손자의 완료가 서브에이전트를 못 깨워, Phase 손자를 기다리다 멈춤.

### 진짜 tmux 찾기

- **`tmux -V` 는 거짓 버전을 답함** → 버전으로는 못 가림 (shim `3.4`, 실제 `3.7c`).
- probe 소켓 이름에 `$$` 를 붙이는 이유: 운영 소켓 `dflow` 를 안 건드리기 위해.
- 찾은 절대경로는 `TM` 에 담아 이후 모든 호출에 씀. 팀장이 Orca 안에 있어도 절대경로로 부르면 shim 을 지나침.
- **이 블록은 `chmod +x "$WT/.dflow-run"` 줄까지 두 백엔드가 글자 그대로 같음.** Orca (「pane(Orca)」) 는 그 아래만 `orca terminal create` 로 다르게 이음.
  - `<모델 플래그>`: `MODEL` 이 `opus`·`sonnet` 이면 `--model opus`·`--model sonnet`, `default` 면 빈 값.
- 설정 파일 경로를 실행 시점에 다시 만들고 없으면 `--settings` 없이 띄우는 이유: Claude Code 2.1.280 은 없는 설정 파일을 받으면 `Settings file not found` 로 곧바로 끝남. 팀장의 Bash 호출은 변수를 안 이어받아 「5-1」 이 `.dflow-run` 을 다시 쓸 때 `LIM` 줄을 빠뜨리면 경로가 빔 → 재시작 팀원이 전부 첫 화면에서 죽어 상한 3 에서 멈춤.
- **팀원 전용 설정 (플러그인·MCP 끄기)**: spawn 시점에 `~/.claude/settings.json`·`<MAIN>/.claude/settings.json`·`<MAIN>/.claude/settings.local.json` 중 있는 파일의 `enabledPlugins` 에서 `true` 인 키를 모아 전부 `false` 로 덮어 `<id8>.settings.json` 에 합침.
  - 목록 하드코딩 안 함: 킷이 다른 PC 에 배포되고 PC 마다 켜 둔 플러그인이 다름.
  - 파일이 없거나 jq 가 못 읽으면 그 파일만 건너뜀 (하나가 깨졌다고 statusLine 설정 전체가 안 만들어지면 안 됨).
  - `.dflow-run` 의 두 `exec` 줄 모두 `--no-chrome --strict-mcp-config` 로 MCP 서버를 끔 (claude.ai 커넥터 포함). `claude-in-chrome` 은 `--no-chrome` 으로만 빠짐.
  - `--mcp-config` 를 프롬프트 바로 앞에 두지 않음: 가변 인자라 뒤의 프롬프트까지 경로로 먹어 `MCP config file not found` 로 끝남. `auto` 가 플러그인 MCP 를 살릴 때는 맨 앞에 둠 (아래 「플러그인 MCP 를 `--mcp-config` 로 살리는 이유」).
  - 전역 `~/.claude/settings.json` 의 훅 (`PreToolUse` `rtk hook claude`, `PostToolUse` heartbeat) 은 `--settings` 로 안 덮어 그대로 돎 — **`--setting-sources` 는 쓰지 않음.** 쓰면 user 설정의 heartbeat 훅이 빠져 좌석표가 진척을 못 봄. 전역 파일은 읽기만 함.
  - 되돌리기: `DFLOW_WORKER_PLUGINS=keep` = 플러그인 유지 (팀장 세션 환경에서 읽음). `DFLOW_WORKER_MCP=keep` = MCP·`claude-in-chrome` 유지 (`.dflow-run` 이 팀원 실행 시점에 읽음; tmux pane 은 팀장 환경을 물려받지만 Orca 새 탭은 로그인 셸 환경 → 셸 프로필에 export).
- **timeout 가드 훅**: 팀원 전용 설정에 PreToolUse(Bash) 훅 `dflow-dev/scripts/timeout-guard.mjs` 를 거는 이유: timeout 없는 긴 명령은 Bash 가 120초 뒤 백그라운드로 옮기고, Phase 서브에이전트가 완료 알림 없이 턴을 끝내 팀원이 47분-1.5시간씩 멈춤. 문서 규칙만으로는 안 막힘.
  - `--settings` 의 훅은 `--dangerously-skip-permissions` 아래에서도 돌고, exit 2 가 메인 세션과 Agent 서브에이전트의 Bash 호출을 모두 막으며 거부 이유가 모델에 전달됨 (Claude Code 2.1.282 실측).
  - 전역 설정에 안 넣음: 수동 세션까지 막지 않기 위해 (원하면 kit/README.md 선택 사항).
  - E2E 서버 기동 (`gradlew …bootRun`·`mvn spring-boot:run`) 은 `run_in_background` 나 끝의 `&` 로 띄우면 timeout 검사를 건너뜀 — 서버는 끝나지 않는 명령이라 timeout 을 요구하면 e2e.md 기동이 몇 분씩 묶임. `&` 없는 포그라운드 기동은 막음.
  - `nohup` ≠ 예외. 뒤따르는 명령이 서버 기동 형태일 때만 통과 (`java -jar`·`next dev`·`pnpm dev`·`npm run dev` 는 대상 아님). `nohup ./gradlew test` 백그라운드는 막음 (완료 알림 없이 멈추는 그 테스트).
- **「팀원 첫 턴 컨텍스트 줄이기」 (PC별 opt-in)**: 팀원·서브에이전트는 첫 턴부터 싣는 기본 컨텍스트(스킬 목록 67개 약 27K자, 출력 스타일 약 5.8K자)를 매 턴 다시 읽음 (가중 토큰의 17-19%).
  - 방법 = 공식 설정 키만: `skillOverrides` (`"on"`·`"name-only"`·`"user-invocable-only"`·`"off"`; `"off"` 는 모델과 `/이름` 양쪽에서 숨김; 플러그인 스킬에는 안 먹음), `syncClaudeAiSkills: false`·`syncClaudeAiPlugins: false`, `outputStyle` (소문자 `default` 가 기본 스타일).
  - 동기화 두 키는 `--settings` 로만 줌: 그 실행에서만 막고 파일은 안 옮김. 사용자 파일에 적으면 `~/.claude/skills/.trash` 로 옮김.
  - **PC별 opt-in 인 이유**: 남길 스킬·플러그인은 PC 마다 다름 → 킷에 이름을 박지 않음 (킷이 아는 이름은 `dflow-*` 뿐). 사람이 `.dflow.local` (개인, 커밋 안 함) 에 `worker_keep_skills`·`worker_skills_off`·`worker_keep_plugins`·`worker_output_style` 을 적음. 키가 없으면 조각이 `{}` 라 종전과 같음.
  - **`auto` 를 둔 이유**: 브라우저 도구가 PC 마다 다름 (사용자 스킬·MCP 플러그인·claude-in-chrome). 그 PC 사람이 전역 지침 (`~/.claude/CLAUDE.md`) 에 적은 "무엇을 쓴다" 를 판단 근거로 삼음. 부정 문장은 뺌 (지침이 쓰지 말라는 도구도 이름으로 적음). 플러그인만 "플러그인·plugin·MCP 가 함께 든 문장" 으로 좁힘 (짧은 플러그인 이름이 일반 낱말과 겹침). 지침을 못 읽으면 사용자 스킬을 하나도 안 끔 (이득 몇 K 토큰 대 E2E 정지).
  - **플러그인 MCP 를 `--mcp-config` 로 살리는 이유**: `--strict-mcp-config` 때문에 켜 둔 플러그인의 MCP 도구도 0개. 그 플러그인의 `.mcp.json` (또는 `plugin.json` 의 `mcpServers`, `${CLAUDE_PLUGIN_ROOT}` 는 설치 폴더로 치환) 만 담은 파일을 `--mcp-config` 로 주면 살아남 (도구 이름 `mcp__<서버>__*`). 가변 인자라 맨 앞에 둠.
  - **목록을 "남길 것" 으로 받는 이유**: 사용자 스킬 폴더는 PC 가 늘 바뀜 → 새로 깐 스킬이 저절로 꺼짐. 내장 스킬은 셸에서 목록을 못 얻어 끌 것을 이름으로 따로 받음 (`worker_skills_off`).
  - **dflow-* 와 프로젝트 스킬을 늘 지킴**: `skillOverrides` 는 이름으로 끄므로 같은 이름의 사용자·내장 스킬 때문에 프로젝트 스킬이 꺼질 수 있음 → `<MAIN>/.claude/skills` 의 폴더 이름과 머리말 `name` 은 어느 목록에 있어도 거름.
  - **`disableBundledSkills` 안 씀**: 내장 스킬을 통째로 끄면 Workflow 도구 설명이 8,958자 → 42,868자로 커져 첫 턴이 26,044 → 31,588 토큰으로 오히려 늚. 같은 이유로 `worker_skills_off` 에 `workflow-authoring` 을 안 넣음.
  - **훅은 안 건드림**: 플러그인 훅 출력은 enabledPlugins 끄기로 이미 없고 SessionStart·PreToolUse 훅은 컨텍스트에 거의 안 실림. `disableAllHooks` 는 statusLine 덤프와 timeout 가드까지, `--setting-sources` 는 heartbeat 훅까지 끄므로 둘 다 안 씀.
  - 효과 (haiku): 첫 턴 26,044 → 22,989 토큰 (−11.7%).
- 워크트리 밖 (`~/.dflow/limits`) 에 쓰는 이유: 안에 쓰면 `git status --porcelain` 이 더러워져 `DIRTY` 검사와 「고아 정리 규칙」 2번이 깨짐.
  - 임시 파일에 쓰고 옮김: 깨진 입력이 반쯤 쓴 파일을 안 남기게. 팀원 pane 에서는 사람의 statusLine 설정이 이것으로 덮임 (표시 `dflow`).
  - 「5-1. 재개 spawn」 도 `.dflow-run` 을 이 블록대로 새로 쓰므로 재개·재시작 팀원과 Orca 팀원도 덤프를 남김. 파일은 안 지움 (작고 같은 id8 이면 덮어씀).
- 이름표 이유: 없으면 `attach` 로 붙은 사람이 어느 pane 이 어느 슬롯의 무슨 작업인지 모름 (pane id 는 장부에만 있음). 슬롯 번호를 앞에 둠: 팀장 보고·`events.jsonl` 의 `slot` 과 같은 축. claude 가 터미널 제목 이스케이프로 pane 제목을 덮어쓰므로 **pane 마다** (`-p` 와 pane id) 걸고 `split-window` 로 늘린 pane 에도 매번 검. tmux 3.3 이상.
- **`exec` 줄만 heredoc 밖에서 `printf` 로 붙이는 이유**: `<모델 플래그>` 를 heredoc 안에 두고 치환을 빠뜨리면 그 자리가 **입력 리다이렉션** (`< 모델`) 이 되어 오류 없이 엉뚱한 파일을 읽음. `printf` 인자는 `default` 일 때 빈 문자열이 되어 그런 자리가 안 생김.
- 명령을 `.dflow-run` 파일에 써 두는 이유: 셸 인용을 한 겹 줄이고 사람이 pane 에서 무엇이 도는지 읽을 수 있음. 프롬프트도 `.dflow-prompt` 파일 경유라 따옴표·백틱 걱정 없음.
- `.dflow.local` (레거시 `.env`)·`.dflow`·스킬 링크를 팀장이 먼저 만드는 이유: claude 는 시작할 때 cwd 의 `.claude/skills` 를 읽음 → 링크가 먼저 있어야 팀원의 Skill 도구가 `dflow-dev` 를 앎. 워커 부트스트랩 (worker-prompt.md 「3」) 의 같은 명령은 이미 있으면 건너뜀.
  - 스킬 폴더가 실제 폴더로 있는데 `dflow-dev` 가 없으면 폴더째 링크하지 않고 워커가 쓰는 스킬만 하나씩 링크 (`.claude/skills/skills` 방지).
- `.env` 도 메인 체크아웃에 있으면 함께 링크. 이유: 구버전 좌석표 heartbeat 훅 (`~/.dflow/hooks/heartbeat.sh`) 이 `.dflow`·`.dflow.local` 을 모르고 `$_top/.env` 만 읽음.
- **`--dangerously-skip-permissions` 로 넘어가지 않음** (`claude --help` 가 이유를 밝힘). 그 대화상자는 `-p` 를 쓰거나 stdout 이 TTY 가 아닐 때만 건너뜀. 팀원 워크트리는 매번 새 경로 (`dflow-<id8>`) → **매번** 뜨고 아무도 답하지 않으면 팀원이 멈춤. spawn 직후 팀장이 화면을 읽어 확인이 보이면 답을 보냄.
- **팀원 환경을 벗기는 이유**: 팀원 pane 이 팀장 환경을 통째로 물려받음 (실측: `ORCA_AGENT_TEAMS_*` 다섯 개, `CLAUDE_CODE_*` 아홉 개, PATH 의 shim 디렉터리).
  - 남는 경우는 팀장이 Orca 안에서 tmux 백엔드로 팀원을 띄울 때뿐 (Orca 의 tmux shim 으로 물려받은 `ORCA_AGENT_TEAMS_*`·`TMUX`·`TMUX_PANE` 이 샘, 아래 표). `orca terminal create` 로 뜨는 Orca 탭은 자신의 `ORCA_PANE_KEY`·`ORCA_TERMINAL_HANDLE`·`ORCA_AGENT_HOOK_*` 만 있고 나머지는 없음 — 지우면 에이전트 상태 훅까지 빠져 그 탭이 오피스 화면에 안 나타남.
  - 판별 기준 = `ORCA_AGENT_TEAMS_TEAM_ID` (tmux-in-Orca 누수 때 반드시 있음). 조건은 `if [ -n "${ORCA_AGENT_TEAMS_TEAM_ID-}" ]; then <벗기기 전부>; fi` 한 블록: 줄마다 따로 걸면 (`[ ... ] &&`) `ORCA_*` 를 먼저 지우는 줄이 판별 변수를 지워 뒤 줄 (`unset TMUX TMUX_PANE`·PATH 정리) 이 조용히 안 걸림.
- 접두째 벗김 (목록 수작업은 새 변수를 놓침): `CLAUDE` 와 `ORCA_` 로 시작하는 것을 전부 지우고 `TMUX`·`TMUX_PANE` 을 따로 지움. `CLAUDE_CODE_` 가 아니라 `CLAUDE` 로 자름: `CLAUDECODE`·`CLAUDE_PID`·`CLAUDE_EFFORT`·`CLAUDE_PLUGIN_DATA` 가 그 접두 밖에 있었음.
  - `CLAUDE_CONFIG_DIR` 만 예외로 남김 (사람이 설정하는 값). 필요한 설정은 모두 `~/.claude/settings.json` 과 워크트리의 `.dflow`·`.dflow.local` (레거시 `.env`) 에서 옴 → 잃는 것 없음. PATH 에서 shim 디렉터리를 빼도 `claude` 해석은 안전 (그 디렉터리에는 `tmux` 하나뿐).
- **화면은 생존 증거로 안 씀**: 스피너 때문에 화면이 매번 달라져 멈춘 팀원도 살아 있는 것처럼 보임.

### pane(Orca)

- Orca 안에서 띄운 팀장은 이 백엔드를 먼저 고름 (SKILL.md 「0. 환경 감지」). 리허설 (Orca 1.4.210, Claude Code 2.1.281) 로 관문 셋을 확인:
  1. `git worktree add --detach` 순수 git 워크트리를 `orca terminal create --worktree path:<WT> --command ./.dflow-run --json` 이 받아들임 (핸들 = `.result.terminal.handle`).
  2. 새 탭의 claude 는 권한 확인 생략 모드로 돌고 포인터 (`$(cat .dflow-prompt)`) 가 첫 입력으로 들어가 바로 착수.
  3. `orca terminal close --terminal <핸들> --tab --json` 이 `ptyKilled:false` 로 답해도 claude 프로세스는 실제로 끝남 (`lsof` 확인).
- 관문 통과 → Orca 도 tmux 와 같은 방식으로 spawn·회수·재투입 (`references/restart.md` 「Orca」).
- 핸들 필드는 `result.terminal.handle` 을 먼저 봄 (옛 런타임: `result.agentTerminalHandle`, 더 옛 런타임: `result.startupTerminal.handle` 또는 없음).
- 이유: 재개(「5-1」)·재투입(`references/restart.md`)·회수(결과 처리)가 백엔드를 안 가리고 같은 파일에서 대상을 찾음.
- 팀원 화면 보기 (보고용): `orca terminal read --terminal <handle>`. 화면은 생존 증거로 안 씀.
- 이유: `orca terminal send` 로 방향키를 보내 신뢰 확인을 넘기는 방법은 실측하지 않음 (위 배경).
  - 리허설에서는 워크트리가 이미 신뢰된 리포 (`<MAIN>`) 아래라 이 화면이 안 뜸. 그래도 루프는 남김 (다른 부모 경로에서는 뜰 수 있음). `bypass permissions on` 이 보이면 통과. 화면 문자열에 기대므로 판본이 문구를 바꾸면 깨짐 (pane(tmux) 「폴더 신뢰 확인」 과 같은 한계).
- 옛 방식 (`orca worktree create`) 으로 뜬 워크트리만 `orca worktree list --json` 에 나타남.
  - 그 경로면 `orca worktree rm`: 체크아웃된 로컬 브랜치만 삭제를 시도하고, 머지됐음을 입증 못 하는 브랜치와 워크트리보다 먼저 있던 브랜치는 보존.
  - 아니면 (새 방식, `git worktree add`) tmux 와 같은 `git worktree remove --force` (`--force` 이유는 tmux 「정리」 와 같음: 미추적 부산물).
  - 미커밋분을 잃으므로 먼저 「고아 정리 규칙」 을 따름.
  - 옛 방식의 `orca worktree rm` 에는 `--force` 를 「고아 정리 규칙」 1번 (부트스트랩 실패) 에서만 붙임. 두 갈래 모두 브랜치 삭제는 강제하지 않음. `orca worktree list --json` 모양 = `{result:{worktrees:[{path,…}]}}`.

### 고아 정리 규칙

- 두 백엔드 모두 `--force` 를 쓰는 이유: 알려진 부산물 중 `spec.md` 캐시와 스킬 폴더 안의 개별 링크는 공유 `info/exclude` 가 안 가리는 미추적 파일 → `--force` 없이는 제거가 거부될 수 있음. Orca 의 `--force` 는 워크트리 강제 제거만 하고 브랜치 삭제는 강제하지 않음.
- 이유: 워커가 곧바로 detach 하므로 생성 브랜치는 체크아웃되지 않은 채 남음 → Orca 정리도 안 지우고, 같은 id8 을 다시 띄우면 이름이 부딪치며 작업마다 쌓임.
  - `origin/<기본브랜치>` 의 조상인 것만 지우는 이유: 이름만 맞는 브랜치의 고유 커밋을 안 잃기 위해.
  - id8 을 모르면 (압축으로 이름을 잃은 경우) 위 루프의 첫 줄만 `git branch --format='%(refname:short)' --list '*dflow-[0-9a-f]*'` 로 바꿔 돌림. 앞의 `*` = Orca 가 이름 앞에 다른 접두를 붙일 수 있어서, `dflow-` 뒤를 16진수로 한정 = `worktree-dflow-team` 같은 개발 브랜치를 후보에서 빼려고.
  - 세 안전 조건 (`agent/` 아님, 체크아웃 안 됨, `origin/<기본브랜치>` 의 조상) 은 루프가 그대로 지킴 (이름만 맞는 남의 브랜치 보호). 이름을 못 채워 정리를 건너뛰면 생성 브랜치가 쌓임.

### 팀원 환경을 벗기는 이유(변수별로 깨지는 것, 실측)

| 남는 것 | 깨지는 것 |
|---|---|
| `CLAUDE_CODE_CHILD_SESSION` | **팀원의 대화 기록이 저장 안 됨** (`Transcript saving is off`) |
| `CLAUDE_CODE_MESSAGING_SOCKET`·`TOKEN` | 팀장의 메시징 채널에 붙음 |
| `CLAUDE_CODE_SESSION_ID`·`BRIDGE_SESSION_ID` | 팀장의 세션 ID 를 자기 것으로 씀 |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | 자기 팀을 만들려 듦 |
| `CLAUDE_PID` | 팀장 PID 를 자기 것으로 봄 |
| `ORCA_AGENT_TEAMS_TEAM_ID`·`TOKEN`·`LEADER_PANE` | 팀원이 자기를 Orca 팀 리더의 pane 으로 오인할 여지 |
| PATH 의 `claude-agent-teams-bin` | 팀원이 tmux 를 부르면 Orca shim 이 잡음 |

## 자동 재시작(restart.md)

### /dflow-team 자동 재시작: 멈춘 팀원을 원인별로 다시 띄운다

- 스펙 wbs-web docs/superpowers/specs/2026-09-23-worker-auto-restart-design.md (과제 H·G). SKILL.md 「2-3」「3. 결과 처리」 「5. 팀원 spawn」「5-1. 재개 spawn」「7. 마감」 이 이 문서를 부름.

### 요약

- Orca 도 tmux 와 같은 방식으로 재투입.

### 이벤트로 본 상태

- 이유: 팀장을 다시 띄워도 재시작 대기와 rate-limit 대기가 이어져야 함. 매 기상의 재구성에서 1번 돎.
- 이유: 한도는 계정 단위 → 팀장·팀원이 같은 로그인이면 누구를 띄워도 같은 벽에 섬. 예외 = `RL_DUE` 슬롯 자신의 재투입 하나 (보류를 푸는 길).

### 판정

- 이유: 움직이는 워커를 한도로 분류하거나, 결과 보고 직전의 정상 전이(`reported`)를 점유 변동으로 멈추지 않게 함. 중단(`cancelled`) 처리는 종전대로 정체와 무관하게 함.
- `park` 로 적는 이유: 서버는 여전히 `claimed`·`mine` → 안 적으면 다음 팀장 시작의 고아 스캔이 재시도 3 미만으로 보고 같은 작업을 다시 띄움.
  - 3번은 안 적음. 고아 스캔은 `claimed`+`mine`+이 PC 가 아니면 어차피 재개 안 함. 「이벤트로 본 상태」 는 `team.start` 로 안 자름 → `park` 를 적으면 claim 전에 죽은 `ready` 작업이 이 팀장에게 영영 안 보임.

### 한도 판정

- 유예 10분을 두는 이유: Claude Code 가 한도 해제 뒤 스스로 이어 가면 그 사이에 워커가 돎.
  - 화면 문구 판정 (`LIMIT_SCREEN_RE`) 은 **꺼져 있음**: 실제 한도 화면 문장·시각 형식을 캡처로 확인하는 실측 (스펙 §14-1) 전에는 안 채움. 켜면 문구가 보일 때 `restart_at` = 감지 + 3600초 (시각을 안 읽는 폴백).
  - 덤프 파일이 없거나 깨진 팀원 (아주 옛 워크트리, `DFLOW_WORKER_PLUGINS=keep` 등으로 설정이 안 만들어진 경우) 은 늘 `LIMIT_NONE`.
- 덤프는 워크트리 밖이라 `git status` 를 안 더럽힘. **두 백엔드 모두** 이 덤프를 남김.
  - 어느 창이든 `used_percentage >= 100` 이고 해제 시각이 미래면 한도. 해제 시각 = 그런 창의 `resets_at` 중 가장 늦은 것.

### 재시작 후보를 띄울지

- 종료 코드가 아니라 출력한 pane id 로 가르는 이유: tmux 3.7 은 없는 pane id 에도 `display-message` 를 0 으로 끝내고 빈 값을 냄 (실측).
  - Orca 갈래에서는 `orca terminal close` 가 JSON 을 돌려주면 (`ptyKilled:false` 여도 프로세스는 끝남) `REAPED` 로 보고 **`.dflow-pane` 을 비움**: 「재투입」 의 재투입 전 확인이 `.dflow-pane` 에 핸들이 남아 있으면 `live=unknown` (Orca 는 `$TM` 이 없어 이 갈래로 옴) 으로 fail-closed 되어 막는데, 비우면 `p` 가 빈 값이 되어 스크립트를 안 고치고 통과.
  - `REAP_FAILED` (pane 이 아직 있음, 또는 Orca 응답이 빔) 나 `REAP_NO_HANDLE` (Orca 인데 핸들이 `-`) 이면 `team.lost` 를 안 쓰고 재투입하지 않으며 「멈춤」 (사유 `거두기 실패`) 으로 보고.
  - 이유: 살아 있는 팀원 옆에 같은 작업을 겹쳐 띄우면 한 워크트리를 두 세션이 고침.
- 거두기를 기록보다 먼저 하는 이유: 기록 뒤 거두기 전에 컨텍스트가 끊기면 다음 기상이 `RESTART_DUE` 로 보고 살아 있는 pane 옆에 같은 작업을 겹쳐 띄움. 거두기 뒤 기록 전에 끊기면 고아 스캔이 평범한 재개로 이음.

## 머지 충돌 해소(merge-conflict.md)

### 0. 상태와 불변식

- `spawn_kind` 로 가르지 않는 이유: 팀장을 다시 띄우면 「1. 시작」 5번이 살아 있는 슬롯을 `spawn_kind: readopt` 로 다시 적어 `resolve` 가 사라짐.
  - 그 줄은 `orig_kind` 에 원래 종류를 싣지만 (events.md) 옛 줄에는 없음 → 판별의 정본 = 워크트리 이름. 이 판별을 해소 결과 처리(「4」)·차단기(「6」)·동시 해소 상한이 모두 씀.
- 이유: `blocked` 해소 워커는 슬롯을 쥠. 상한이 없으면 충돌이 많은 밤에 모든 슬롯이 사람을 기다리며 섬.

### 2. 해소 spawn

- **Orca**:
  - tmux 와 같은 블록을 같은 `WT` 치환 (`-resolve` 접미) 으로 그대로 돎. 입장 제어 두 줄 포함이므로 따로 안 부름.
  - `chmod +x "$WT/.dflow-run"` 줄 뒤를 backends.md 「pane(Orca)」 대로 `orca terminal create --worktree "path:$WT" --title 'w<slot> · 해소 <TSK> <id8>' --command ./.dflow-run --json` 으로 이음.

### 6. 차단기

- 해소 워커의 **내용 실패** `failed gate`·`failed push-race`·`failed push-hook`·`failed push-other`·`failed not-detached`·`failed dirty-dev-state` 는 `not-assignee` 처럼 **세지도 끊지도 않음.**
  - 이유: 의미 충돌 두 건이 연달아 `failed gate` 가 되면 차단기가 새 spawn 을 모두 멈춤 (이 설계가 풀려던 정지).
  - **환경 실패** (`rate-limit`·`no-result`·`deps`·`permission`·부트스트랩 실패 값) 만 워커와 같이 셈.
  - 실패가 아닌 결과 (`resolved`·`skipped`·`blocked`) 는 워커와 같이 연속 수를 0 으로 되돌림.
  - 재구성에서 해소 워커인지는 id8 마다 마지막 `team.spawn` 의 워크트리 이름으로 가름 (「0」). `readopt` 줄이 `spawn_kind` 를 덮어도 워크트리와 `orig_kind` 가 남음 → 팀장을 다시 띄운 뒤에도 해소 워커의 내용 실패가 차단기에 안 세짐.
  - 해소 워커 id8 목록:

## 해소 워커 프롬프트(resolve-prompt.md)

### 2. 좌석 식별·부트스트랩

- 두 백엔드 모두 팀장이 `git worktree add --detach` 로 이미 detached 상태를 만들어 둠 → 이 기점 이동은 그대로 detached 를 유지.

### 3. 기준선

- 이유: 게이트 하한 = "개발 브랜치 총수 + 이 브랜치가 더한 시험 수" (「게이트」). 개발 브랜치 총수나 MERGE_HEAD 단독 총수만 보면, 개발 브랜치가 훨씬 커졌을 때 해소하며 이 브랜치의 시험을 지워도 총수가 하한을 넘어 통과.
- 전체 시험을 맨손으로 돌리지 않음. 이유: 해소 시도 1번이 전체 시험을 4회 (세 커밋 + 게이트) 돌린 실측.
  - `<MB>` = 대개 원래 워커의 브랜치 기점 (그 워커가 기준선을 쟀음). `<BASE>` = 같은 개발 브랜치 끝에서 뜬 다른 워커·해소 워커가 이미 쟀을 수 있음. 재시도는 `MERGE_HEAD`·`<MB>` 가 앞 시도의 캐시로 나옴.
  - 새로 도는 전체 시험은 보통 첫 시도에 2-3번 (게이트 포함), 재시도에 1-2번.

### 게이트

- 이유: 다른 스위트에서 시험이 늘면 전체 총수가 감소를 가림.

## 이벤트(events.md)

## 보탬(SKILL.md 설명 문장)

- 「4. 승인 스윕」: 팀원은 각자 워크트리의 agent 브랜치나 detached HEAD 에 있음 → 어느 쪽과도 충돌하지 않음.
