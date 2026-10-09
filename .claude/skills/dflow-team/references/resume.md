# /dflow-team 재개 spawn (SKILL.md 「5-1. 재개 spawn」)

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

SKILL.md 「5-1. 재개 spawn」 참조. 재개 대상 띄울 때 Bash `cat` 으로 읽음. 「5. 팀원 spawn」·「팀장 상태」 등 절 이름 = SKILL.md 것.

중단 작업 이어 띄움. 새 작업 spawn 과 차이 둘:
- **worktree 새로 안 만듦** (남아 있으면 그대로 사용)
- **claim 안 함**: 서버 이미 `claimed`. 이어받은 worker `/dflow-dev --worker` 가 재개 판정으로 끊긴 Phase 이음

대상 다섯:
- **자동**: 고아 스캔이 "재개 가능" 분류한 worktree (「팀장 상태」).
  - 빈 slot 있고 차단기 풀렸으면 대기 큐보다 **먼저** 띄움
  - 이유: 서버 claim 이미 잡음. 새 작업 먼저 띄우면 점유만 늘고 진척 없음
- **요청**: 좌석표 「이어서 시작」 버튼이 남긴 `resume_requests` (「2-3」). `host` = 이 PC 만 옴.
  - worktree 있고 자동 조건도 맞으면 자동 갈래와 같음
  - worktree 없으면 아래 3항이 새로 만듦
  - 사람이 screen 에서 누름 → 재시도 상한 무시
- **재시작**: `references/restart.md` 「재투입」. 결과 줄 없이 멈춘 팀원을 팀장이 그 자리에서 다시 띄움.
  - 서버 claim 이미 잡음 → 대기 큐보다 먼저 띄움
  - 재시도 상한 3 을 자동 갈래와 공유
  - 차단기·rate-limit 보류 적용
- **지목**: 「인자」 `--resume <id8>`. 자동 판정 거부 사유(재시도 상한, `claimed_by` 불일치) 무시. worktree 없어도 됨.
  - **서버 status = `claimed` 일 때만 재개**
  - 지목 id8 이 `ready` → 재개 아닌 새 작업 → 5번 일반 spawn (claim 은 worker 가 함)
  - `reported`·`approved` → 개발 끝남 → "재개 대상 아님(서버 <status>)" 보고, 안 띄움. 승인 반영 = 「4. 승인 스윕」
- **승인** (계약 2.11): 기상 블록 요약 `build` 에 든 claimed 주문 (「설계 승인」 된 설계 검토 작업).
  - worktree 가 이 PC 에 없으면 3항이 원격 agent branch 에서 생성 (설계 상태 스펙 12절 Y3 이 여는 유일한 새 길)
  - 재시도 상한 자동 갈래와 공유

## 서버 판단 확인 (계약 2.11)

`dflow.mjs contract-ge 2.11` exit 0 이면 대상마다 아래 절차 0항 전에 1회 수행 (옛 서버는 건너뜀 — 종전 판정 그대로).
- 이 표 = 기존 안전장치(살아 있는 slot·최종 결과·제외·재시도 상한·`PARKED`·선행 반영 검사) 통과 대상에만 적용. **띄우지 않게 막기만 함**
- 새로 여는 길 = **승인** 대상 원격 재개 하나 (설계 상태 스펙 6.2·12절 Y3)
- 「1. 시작」 3번 멈춤 사유도 이 표로 적음
```bash
(node .claude/skills/dflow-work/scripts/dflow.mjs show '<id8>') | jq -r '([.reports[]? | select(.kind == "completion")] | last | .review_action // "-") as $rv
  | .order | [.status, (.mine | tostring), (.action // "-"), (.action_reason // "-"),
  (.design_state // "-"), (.runner // "-"), (.item.stage // "-"), (.claimed_by // "-"), $rv] | @tsv' || echo SHOW_FAILED
```
위에서부터 처음 맞는 줄에서 멈춤.
- `워크트리` = 이 PC 에 그 id8 팀원 worktree 있는지 (`parked` 포함)
- 끝 칸 = 마지막 완료 보고 검토 결과 (`approve`·`reject`·`-`. 「재작업」 요청도 `reject` 로 남음)

| 조건 | 처리 |
|---|---|
| `SHOW_FAILED`·빈 출력 | 이번 기상 안 띄움 (「멈춤」 사유 `서버 조회 실패` = 두 기상 연속일 때만) |
| status ≠ `claimed` | 위 대상별 규칙 (지목의 `ready`·`reported`·`approved` 갈래). 자동·재시작·승인은 안 띄움 |
| `mine` 거짓 | 안 띄움. 「멈춤」 사유 `다른 PC 도는 중(<runner>)` (runner 있을 때) 또는 `다른 신원 점유` |
| `design_state` = `review` | 안 띄움. 「멈춤」 에 안 올림 (사람 「설계 승인」 대기 — 승인되면 **승인** 대상으로 옴) |
| 대상이 요청·지목 | 띄움 — `action` 이 `skip`·`wait` 이어도 (사람의 명시 요청, 12절 Y10·Y12. 선행 아직이면 worker 가 다시 보고 `design_waiting` 으로 곧 끝남 — 한 번 누름에 한 번) |
| `action` = `wait` | 안 띄움. 「멈춤」 에 안 올림 (선행 대기 — 설계 완료 대기는 `references/design-ahead.md` 2번이 선행 풀린 뒤 봄) |
| 대상이 자동·재시작·승인이고 점유 라벨 ≠ 팀원 라벨(`<신원>/<host>/w<n>`) | 안 띄움. 「멈춤」 사유 `수동 세션 점유` (사람이 손으로 잡은 작업은 팀장이 안 이어받음, 12절 Y9) |
| `action` = `skip` · worktree 있음 · 대상이 재시작·자동 | 띄움 (결과 없이 죽은 이 PC 팀원만 — 종전 재시작 규칙) |
| `action` = `skip` · worktree 없음 · 단계 `ip` 이상 | 안 띄움. 「멈춤」 사유는 끝 칸(마지막 완료 보고)으로 가름 (12절 L2). `reject`(반려·재작업 요청)면 `runner` 없을 때 `재작업 대기 — 사람이 /dflow-dev 로 재작업을 돌린다`, 있을 때 `재작업 중(<runner>)` (완료 보고가 `runner` 를 비우고 재작업 build-start 가 다시 적음). 그 밖 = `워크트리 없음 — 구현 중` (다른 PC worktree 에 push 안 한 구현 있을 수 있음) |
| `action` = `skip` (그 밖) | 안 띄움. 「멈춤」 사유 `<action_reason>` |
| `action` = `full`·`design` · worktree 없음 | 안 띄움. 「멈춤」 사유 `워크트리 없음` (종전 — 사람이 `--resume` 으로 지목하면 띄움) |
| 그 밖 (`full`·`design`·`build`) | 띄움. 포인터 `SCOPE` = 그 `action`. `action` = `full`·`build` 이고 선행 중 `reached` 인데 `head_sha` 없는 것 있으면 `references/wake.md` 「선행 반영 사전 검사」 먼저 수행. `NOT_REFLECTED` 면 이번 기상 안 띄움 (12절 Y5 — 다음 기상에 다시 봄) |

절차:
0. **입장 제어**: 무엇이든 바꾸기 전에 backends.md 「입장 제어」 블록 수행 (두 백엔드 공통).
   - `SPAWN_DEFERRED_CAPACITY` → 이 재개 이번 기상 안 함
   - worktree·`.dflow-agent`·포인터 안 건드림 → 다음 기상 재구성이 같은 대상 다시 잡음
   - 이 자리인 이유: 5항이 `.dflow-agent` 를 `parked` 에서 되돌린 뒤 막히면 팀원 없는 worktree 가 `parked` 아닌 채 남음
   - 7항 띄우기는 이 검사 다시 안 함
1. **손실 보고 한 줄 먼저.** 사람이 이 줄만 보고 멈출 수 있어야 함.
   ```
   재개 <id8> <TSK>: 워크트리 <경로|없음> · 브랜치 <agent/…@<head>|없음> · 원격 <origin/agent/…@<sha>|없음>
        · 미커밋 <N파일|없음> · claimed_by=<값>(이 PC|다른 PC) · 잃는 것: <없음|…>
   ```
   ```bash
   git ls-remote --heads origin "refs/heads/agent/<id8>-*"
   git -C <워크트리> status --porcelain | wc -l      # 워크트리가 있을 때만
   ```
   "잃는 것" 갈래:
   - worktree 있음 → `없음` (commit·미commit 모두 그대로 이어 감)
   - worktree 없고 원격 branch 있음 → `그 PC 의 미커밋 변경(마지막 push 인 <sha> 뒤의 작업)`
   - worktree 도 원격 branch 도 없음 → `이전 시도 전부(설계 문서 포함) — 사실상 처음부터 시작한다`
   - worker 는 Phase 06 에서만 push → 진행 중 작업 원격 branch 는 대개 없음
2. **다른 PC 경고**: `claimed_by` ≠ 이 PC 면 한 줄 더 적음: "그 PC 의 워커가 아직 돌고 있어도 이 팀장은 알 수 없다(생존 신호가 서버 DB 에는 있으나 지금 계약의 `show` 가 내주지 않는다). 겹쳐 돌면 같은 브랜치에 두 세션이 커밋한다".
   - 이 갈래는 `--resume` 으로만 옴 → 사람 지목으로 보고 진행
   - 계약 2.11 이면 이 경고 대신 「서버 판단 확인」 `mine`·`runner` 로 가름
   - `mine` 참인데 `runner` 가 다른 PC → 그 PC 30분 넘게 조용 → "원래 PC 의 세션이 살아 있으면 먼저 끄세요" 만 한 줄 적음 (12절 Y1)
3. **워크트리 확보**
   - 있으면 그대로 사용. 안 지움
   - 없으면 새로 만듦. 기점 = `origin/agent/<id8>-<slug>` 있으면 그것, 없으면 `origin/<기본브랜치>`
   - 원격 agent branch 있으면 detach 안 하고 그 branch 로 만듦 (이어서 push 해야 함)
   - 로컬 agent branch(`agent/<id8>-<slug>`)가 남아 있으면 (지운 worktree 의 branch) 원격과 비교 (설계 상태 스펙 6.2):
     - 로컬이 원격보다 앞섬 (원격 = 로컬 조상) → `-B` 로 안 덮고 로컬 branch 로 만듦 (`git worktree add <MAIN>/.claude/worktrees/dflow-<id8> agent/<id8>-<slug>`)
     - 원격이 앞서거나 같음 → 아래 명령 그대로
     - 갈라짐 → 안 만들고 「멈춤」 (사유 `브랜치 갈라짐 <로컬 sha> <원격 sha>`)
     ```bash
     git fetch origin
     git worktree add <MAIN>/.claude/worktrees/dflow-<id8> -B agent/<id8>-<slug> origin/agent/<id8>-<slug>
     ```
   - `.dflow.local`(레거시 `.env`)·스킬 링크 = 새 작업 spawn(5번)과 같게 검
4. **`TASK_DIR` 구함.** slot 정하기·`.dflow-agent` 되돌리기(5항) **전에** 수행.
   - 이유: 실패하면 재개를 접어야 함. 이미 되돌린 `.dflow-agent` 가 그 worktree 를 `parked` 아닌 상태로 남기면 다음 기상 고아 스캔·전제 검사가 살아 있는 팀원으로 오판
   - **6·8항은 별도 Bash 호출 → 여기서 구한 값 못 봄 → 아래 값을 출력해 그 출력을 6·8항에 그대로 옮겨 씀**
   - 옛 `.dflow-prompt` 의 `TASK_DIR=` 토큰 사용 (5항 slot 추출과 같은 sed 방식):
   ```bash
   task_dir=$(sed -n 's/.*TASK_DIR=\([^ ]*\).*/\1/p' <워크트리>/.dflow-prompt 2>/dev/null | head -n 1)
   echo "task_dir=${task_dir:-없음}"
   node .claude/skills/dflow-team/scripts/docker-allow.mjs '<id8>'   # DOCKER=allow|ban — 6항 포인터에 옮긴다. 옛 포인터 값은 쓰지 않는다
   ```
   비어 있으면 (`TASK_DIR` 이전에 만든 옛 포인터) 다시 구함:
   ```bash
   id8='<id8>'
   task_dir=$(node .claude/skills/dflow-work/scripts/dflow.mjs taskdir "$id8"); rc=$?
   echo "task_dir=${task_dir:-없음} rc=$rc"
   ```
   `rc` ≠ 0 이면 (위 항목 1 과 같은 실패 갈래) **재개 안 함**:
   - `.dflow-agent` 그대로 둠 (아직 안 건드림)
   - 그 id8 일시 제외 + 사유 `작업 폴더 해석 실패(exit $rc)` 보고
   - `team.result`(slot `-`, status `skipped`) 기록 후 다음 후보로
   - 성공하면 위 출력의 작업 폴더 값을 아래 `<4항에서 출력된 작업 폴더>` 자리에 그대로 옮겨 씀
5. **slot 정하고 `.dflow-agent` 되돌림.** slot 번호 = `.dflow-prompt` `AGENT_ID=` 에 박힌 번호 우선. 이미 찼거나 파일 없으면 「팀장 상태」 발급 규칙으로 새로 냄.
   ```bash
   slot=$(sed -n 's/.*AGENT_ID=[^ /]*\/[^ /]*\/w\([0-9][0-9]*\).*/\1/p' <워크트리>/.dflow-prompt 2>/dev/null | head -n 1)
   echo "slot=${slot:-없음}"   # 비었거나 이미 찬 번호면 발급 규칙으로 새로 정한 뒤 아래 줄을 쓴다
   printf '%s\n' '<신원>/<host>/w<정한 슬롯>' > <워크트리>/.dflow-agent
   ```
   - `slot` 빈 채로 두 번째 줄 쓰기 금지. `.../w` 로 끝나는 값은 `dflow.mjs` `*/parked` 가드에 안 걸려 번호 없는 좌석으로 heartbeat 나감
   - 파일 없어 번호 못 찾는 경우 = `.dflow-prompt` 쓰기 전에 만든 옛 Orca worktree 뿐 → 새로 발급
   - **이 되돌리기는 worker 뜨기 전에 수행.** `dflow.mjs heartbeat` 는 값이 `*/parked` 면 exit 2 로 거부 → `parked` 인 채 띄우면 그 팀원은 좌석표에 진척을 하나도 못 알림
6. **포인터 다시 씀.** 5번 4항 형식 그대로.
   - `AGENT_ID` = 5항에서 정한 slot
   - `TASK_DIR` = `<4항에서 출력된 작업 폴더>`
   - `DOCKER` = 4항 블록 `docker-allow.mjs` 출력
   - `MODEL` = 이번 실행 인자
   - 옛 파일 그대로 두면 안 되는 이유: slot 을 새로 발급하면 옛 포인터 `AGENT_ID` 와 어긋나 팀원이 남의 좌석으로 heartbeat 보냄
7. **띄움.** 먼저 `references/restart.md` 「중단 표식 정리」 블록 수행 (`st` = 재개 판정이 받은 show `status`, 곧 `claimed`).
   - `CANCEL_MARK_RM_FAILED` → 안 띄우고 「멈춤」 표 (사유 `중단 표식 삭제 실패`)
   - 백엔드별 명령 = 5번 5항과 같음 (입장 제어 줄·`git worktree add` 줄 빼고 씀. 입장 제어는 0항에서 함)
   - 두 백엔드 모두 `.dflow-run` **있든 없든 새로 쓰고** (새 worktree 에는 없음, 남은 것은 옛 모델 인자 달고 있음) 핸들을 `.dflow-pane` 에 덮어씀
   - **폴더 신뢰 확인 loop 반드시 수행.** 넘기면 팀원이 첫 screen 에서 멈춘 채 살아 있어 slot 하나가 통째로 놂
   - tmux = pane id, Orca = `orca terminal create --worktree "path:$WT" --command ./.dflow-run --json` 이 낸 `result.terminal.handle` 사용 (backends.md 「pane(Orca)」 — 2026-09-24부터. 옛 방식은 포인터를 `--prompt` 로 넘겨 기존 worktree 에 탭을 다시 열었음)
8. **옛 `.result` 지움** (`rm -f <워크트리>/<4항에서 출력된 작업 폴더>/.result`).
   - 이유: `failed…` 로 끝난 worktree 를 `--resume` 으로 이어받으면 옛 결과 줄이 남음
   - 재개 팀원이 결과 쓰기 전에 pane 이 한 번 흔들리면 `PANE_DEAD` 폴백이 그 옛 줄을 읽어 방금 띄운 작업을 다시 실패로 판정
   - 해시 같아 중복 처리는 막힘. 그러나 그 slot 이 빈 것으로 돌아가 같은 작업이 두 번 뜸
9. `team.spawn` 기록. 필드 = 5번 6항과 같고 `spawn_kind` = `resume` (events.md). 재시도 수를 이 값으로 셈 → `new` 로 적으면 상한 동작 안 함.

재개 팀원이 다시 최종 판정 없이 죽으면 다음 기상 고아 스캔이 같은 판정. 재시도가 상한(3)에 닿으면 "멈춤"(사유 `재시도 상한`)으로 내려감. `--resume` 은 그 상한 무시 → 사람이 원인 고친 뒤 다시 지목 가능.
