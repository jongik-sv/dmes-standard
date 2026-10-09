# /dflow-team 결과 처리 상세

SKILL.md 「3. 결과 처리」 에서 옮긴 절 모음(원문 그대로). 해당 상황에서 Bash `cat` 으로 읽음: 결과 줄을 처리할 때(문제 기록), SKILL.md 표에 없는 status 가 나왔을 때, 결과 줄 없는 슬롯을 `TICK` 에서 판정할 때(생존 증거·무응답·정지·대기·재시작).

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

## 생존 증거

**생존 증거**: tmux 팀원은 먼저 「팀장 상태」 정본 표의 생존 칸(`.dflow-pane` 의 pane 이 `#{pane_dead}=0` 인지)을 봄.
- `dead` → 증거 재지 않고 `PANE_DEAD` 와 같이 처리.
- 살아 있는 팀원은 아래 중 하나라도 직전 `TICK` 과 다르면 생존.
- 슬롯의 첫 `TICK` 은 기록만.
- 직전 TICK 증거 = 그 슬롯 마지막 TICK 기상 때 잰 값. 감시 루프가 그 뒤 TICK 을 건너뛰었으면(「2-2」) 그 출력의 `EVIDENCE <id8>` 줄(`ct`=1번, `report`=2번, `heartbeat`·`phase`=무응답의 heartbeat 값, `dirty`=3번 cksum 첫 칸).
```bash
git -C <워크트리> log -1 --format=%ct                                        # 1. 워크트리가 있으면 HEAD 커밋 시각
git fetch origin && git log -1 --format=%ct 'origin/agent/<id8>-<slug>'   # 1. 워크트리가 없으면 원격 tip 커밋 시각
(node .claude/skills/dflow-work/scripts/dflow.mjs show <id8>) | jq -r '[.reports[]?] | last | .created_at // empty'   # 2. 서버 최신 progress
git -C <워크트리> status --porcelain | cksum                                 # 3. 미커밋 변경 목록
```
- 2번 show 실패 → 증거 없음 아닌 측정 실패로 기록. 그 `TICK` 은 2번을 비교에서 뺌.
- 화면은 생존 증거로 쓰지 않음. 화면(tmux `capture-pane`, Orca `orca terminal read`)은 보고용·폴더 신뢰 확인 판별(backends.md)에만 씀(스피너 때문에 멈춘 팀원도 화면이 매번 달라짐).
- 이 원칙 정본 = 이 줄. backends.md·restart.md 는 여기를 가리킴.
- 터미널 핸들 없는 옛 Orca 런타임 → 화면 안 읽고 위 셋만 씀.

## 문제 기록

**문제 기록**: 결과 줄 처리 시 `blocked` 가 아니면 `team.result` 기록·워크트리 정리보다 먼저 팀장 체크아웃 `docs/dflow-team/issues.md` 에 항목 하나 붙임(정리가 미추적 `.issues` 를 함께 지움). 이 파일은 commit 안 함(「1. 시작」 exclude 의 `/docs/dflow-team/`).
- 재료 둘: 워커가 쓴 `<워크트리>/<TASKS>/<TSK>/.issues`(worker-prompt.md 「7-1」, 줄마다 `<phase>\t<분류>\t<내용>`), `done` 아닌 결과의 사유(결과 줄 7번째 칸부터).
- `done`·`needs-merge`·`design_waiting`·`design_review` 이고 `.issues` 없거나 비면 붙이지 않음. 그 밖 status 는 `.issues` 없어도 사유 한 줄로 항목 만듦.
- `failed no-result` → 사유 대신 `pane_dead_status` 와 화면 마지막 20줄(tmux `capture-pane -p -J -S - | tail -n 20`, Orca `orca terminal read`)을 코드 블록으로 붙임. 화면 못 읽으면 `화면 없음` 한 줄.
- `blocked` 는 붙이지 않음. 팀원이 답 받아 이어 가며 `.issues` 에 계속 적고, 최종 결과 때 한 번에 옮김.
```bash
f='<MAIN>/docs/dflow-team/issues.md'; i='<워크트리>/<TASKS>/<TSK>/.issues'; st='<status>'
reason=$(head -n 1 "$(dirname "$i")/.result" 2>/dev/null | cut -d' ' -f7-)
if [ -s "$i" ] || { [ "$st" != done ] && [ "$st" != needs-merge ] && [ "$st" != design_waiting ] && [ "$st" != design_review ]; }; then
  mkdir -p "$(dirname "$f")"
  [ -s "$f" ] || printf '# /dflow-team 문제 기록\n\n팀원이 보고한 에러·문제점. 스킬·환경 개선 재료이며 커밋하지 않는다.\n' > "$f"
  { printf '\n### %s · <TSK> (<id8>) · %s\n\n' "$(date '+%Y-%m-%d %H:%M')" "$st"
    [ "$st" = done ] || [ "$st" = needs-merge ] || [ "$st" = design_waiting ] || [ "$st" = design_review ] || printf -- '- 결과 사유: %s\n' "$reason"
    [ -s "$i" ] && awk -F'\t' 'NF{c=$2;p=$1;sub(/^[^\t]*\t[^\t]*\t/,"");printf "- [%s] %s: %s\n",c,p,$0}' "$i"
  } >> "$f" || echo ISSUE_LOG_FAIL
fi
```
- `reason` 은 events.md 「기록 명령」 과 같은 방법(`.result` 첫 줄 7번째 칸부터)으로 이 블록 안에서 다시 뽑음(별도 Bash 호출의 변수는 안 남음). `.result` 없으면(`failed no-result`) 빈 값.
- `ISSUE_LOG_FAIL` 이 나와도 결과 처리를 멈추지 않고 보고에 한 줄 적음.

## status 표 나머지 행 (1/2: design_*)

| `design_waiting`(설계 완료·선행 대기, 사유 = 미충족 선행 ref) | 해제 | 없음 | 지우지 않음. `.dflow-agent` 를 `parked` 로 | 실패 아님(차단기 연속 수 0). 재개는 `references/design-ahead.md` 2·4번. `design-done 미확인` 이면 `references/design-state.md` 「3」 먼저 |
| `design_review`(설계 검토 대기로 멈춤) | 해제 | 없음 | `done` 과 같다(설계는 push 돼 있음) | 실패 아님(차단기 0). 보고·`design-done 미확인` 은 `references/design-state.md` 「3」 |
| `design_reopened`(설계를 사람에게 되돌림, 계약 2.11) | 해제 | 없음 | 미커밋 변경 있어도 지움(`references/design-state.md` 「3」) | 실패 아님(차단기 0) |

## status 표 나머지 행 (2/2: failed·cancelled)

| `failed permission <명령>` | 해제 | 영구 제외 | 고아 정리 규칙 | 거부된 명령을 "권한 목록 재료" 로 보고(킷 허용 목록에 넣을 값). 서버에 claimed 로 남으므로 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산 |
| `failed rate-limit` | 해제 | 제외 안 함 | 고아 정리 규칙 | 재시도 가능. 아직 ready 면 poll 이 다시 찾고, 이미 claimed 면 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산에 넣음. 워커가 결과 줄을 쓴 경우라 자동 재시작·보류 대상 아님. 결과 줄 없이 한도에 선 워커는 `references/restart.md` 「rate-limit 대기」 가 다룸 |
| `failed no-result`(pane 죽었는데 결과 줄 없음) | 해제 | 영구 제외 | 고아 정리 규칙 | 서버에 claimed 면 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산. `pane_dead_status` 127 일 때만 이 행. 127 아닌 죽음은 `references/restart.md` 재시작 판정으로 감(워크트리 안 지움) |
| `failed not-isolated` | 해제 | 영구 제외 | 없음(워커가 파일을 안 씀) | 백엔드 결함 → 새 spawn 멈추고 「7. 마감」 으로 |
| `failed project` | 해제 | 영구 제외 | 고아 정리 규칙(claim 전이라 대개 부트스트랩 실패 정리) | 주문이 이 리포의 D'Flow 프로젝트 밖. claim 안 했으므로 "멈춤" 표에 넣지 않음. 바인딩(`.env`)·poll 필터가 새는 결함이므로 사유 그대로 보고. 차단기 계산 |
| `failed not-assignee` | 해제 | 영구 제외 | 고아 정리 규칙(claim 전이라 대개 부트스트랩 실패 정리) | 다른 멤버 배정 작업을 claim 하려다 서버가 `not_assignee` 로 거부. claim 안 했으므로 "멈춤" 표에 넣지 않음. **차단기 계산에 넣지 않음**(배정 불일치, 환경 결함 아님). 사유와 함께 "담당자 변경 여부를 D'Flow 에서 확인하라" 보고 |
| `failed deps` | 해제 | 영구 제외 | 고아 정리 규칙 | 사유 보고, 차단기 계산. 설치는 claim·브랜치 생성 뒤라(`/dflow-dev` 「--worker」 H) 서버에 claimed 로 남으므로 "멈춤" 표에 넣음(사유 = 그 status). 대상 리포 lockfile·패키지 관리자 문제라 사람이 고침 |
| `cancelled`(사람이 D'Flow 에서 중단 — 주문 `cancelled`·위임 해제) | 해제 | 영구 제외 | 지우지 않음(산출물 보존). 미커밋 변경 있어도 그대로 두고 경로만 보고, `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꿈 | 사람 알림 한 줄(`<TSK> <id8> 중단됨 — 워크트리 <경로> 보존`). 사람이 멈춘 것이라 "멈춤" 표에 안 넣고, 차단기 계산에도 안 넣음(세지도 끊지도 않음). 다시 맡기려면 사람이 위임 체크를 켬 → 새 주문으로 poll 에 다시 잡힘 |

## 중단·무응답·정지·대기 판정·자동 재시작

- **중단**: 워커는 `dflow.mjs` exit 10 을 받으면 `.result` 에 `cancelled` 를 쓰지만, heartbeat 훅이 먼저 세션을 세우면 결과 줄 없이 멈춤.
  - 결과 줄 없는 진행 슬롯이라도 생존 증거 2번의 `show` 가 `status=cancelled` 면 결과 줄 `cancelled`(hash `-`)를 받은 것과 똑같이 처리. 무응답 판정을 기다리지 않음.
  - tmux 는 `kill-pane`, Orca 는 `orca terminal close --terminal <handle> --tab --json` 으로 거두되 워크트리는 안 지움.
- **무응답**: 결과도 알림도 없는 진행 슬롯의 생존 증거가 한 `TICK` 동안 안 변하면 "무응답" 으로 보고만 하고 슬롯 유지.
  - 생존 증거에 `show` 의 `last_heartbeat_at`·`heartbeat_phase` 포함(워커가 Phase 마다 보내 브랜치 tip 시각보다 촘촘함).
  - `stale` 은 쓰지 않음(`claimed_at` 으로부터 24시간 경과일 뿐).
  - 자동 정리는 두 TICK 연속 생존 증거 없을 때만. tmux 는 `kill-pane`, Orca 는 `orca terminal close --terminal <handle> --tab --json` 으로 팀원을 멈추고 슬롯 해제. 워크트리는 고아 정리 규칙.
  - 자동 정리한 작업은 영구 제외에 넣고 "멈춤" 표에 넣음(사유 `무응답`).
- **서브에이전트 종료 후 정지 패턴(2026-09-24, dmes-standard TSK-03-01)**: 위 "무응답" 판정 시점(생존 증거 무변화 1회째 — 두 `TICK` 안 기다림)에 화면(tmux `capture-pane`)을 이 판정에만 씀.
  - 적용 대상 = `references/restart.md` 「판정」 1-5번(측정 실패·중단·점유 변동·표식 불일치·rate-limit)에 안 걸리고 그 표 9번(무응답 1회)에 이른 슬롯뿐. 취소되거나 한도에 걸린 슬롯에 이 지시를 주입하지 않음.
  - `last_heartbeat_at` 이 함께 멈춰 있어도 상관없음. 오케스트레이터가 입력 대기로 서 있으면 도구 호출이 없어 heartbeat 자체가 멎음. heartbeat 갱신을 전제로 하는 아래 "대기 중인 팀원 판정" 과 달리 이 판정은 heartbeat 값을 안 봄.
  - 조건: 화면 마지막 줄이 입력 대기 프롬프트(`❯`) + 그 위에 `Teammate @<TSK>-<phase> finished` 류 서브에이전트 종료 알림 + 그 뒤 오케스트레이터 발화가 "완료 알림을 기다린다"·"백그라운드 작업이 끝나면" 류.
  - 이는 다시는 오지 않을 알림을 기다리는 정지임. 서브에이전트 턴이 끝나면 하네스가 완료로 보아 그 뒤 백그라운드 손자의 완료가 오케스트레이터를 못 깨움(「제1 제약」 과 같은 구조가 Phase 한 단계 아래에서 재발, `/dflow-dev` `references/orch/phase-common.md` 「서브에이전트가 끝났는데 게이트를 안 돌렸을 때」 와 짝).
  - 조치: "무응답" 으로 보고만 하고 다음 `TICK` 을 안 기다림. 이 TICK 에서 곧바로 `send-keys -l --`(tmux) 또는 `orca terminal`(`references/issues.md` 「SendMessage 가 닿지 않을 때」 와 같은 주입 경로)로 그 팀원 화면에 다음을 넣음:
    "[팀장 지시 <id8>] 서브에이전트 @<TSK>-<phase> 는 이미 끝났다(finished). 백그라운드 완료 알림은 오지 않는다 —
    프로세스(`pgrep` 등)와 산출물(커밋·파일)을 직접 확인하고, 남은 작업이 없으면 게이트를 직접 돌려라(구현 단위가 남았으면 다음 단위·묶음을 띄워라)."
  - 자동 정리·자동 재시작과의 관계: 주입이 오케스트레이터를 깨우면 다음 `TICK` 생존 증거(커밋·미커밋 목록 등)가 바뀌어 "두 `TICK` 연속 무변화" 조건이 깨짐. 그래서 위 무응답 자동 정리(`kill-pane`)도 `references/restart.md` 「판정」 재시작 후보(`cause=no-response`, (나) 2회째)도 안 걸림.
  - 주입이 안 먹어 다음 `TICK` 에도 같은 화면(finished 알림 + 프롬프트)이면 재주입 안 하고 "사람 확인 필요" 로 올림(같은 문구를 무한 재주입 금지). 그 이후 두 `TICK` 무변화 조건이 유지되면 기존 자동 정리·자동 재시작이 그대로 이어받음(이 절이 막지 않음).
- **대기 중인 팀원 판정(2026-09-24, doc-level — 별도 판정 스크립트는 아직 없음)**: 조건 전부 충족 시.
  - `last_heartbeat_at` 은 갱신됨.
  - 커밋 시각·미커밋 변경 목록·`heartbeat_phase` 가 두 `TICK` 연속 그대로.
  - 화면(tmux `capture-pane`, Orca `orca terminal read --terminal <handle>`) 마지막 줄이 입력 대기 프롬프트(`❯`).
  - 결론: 죽은 게 아니라 입력을 기다리며 서 있음. SendMessage 이슈 보고 뒤 지시를 기다리는 경우가 전형(「2-4. 팀원 이슈 보고 처리」).
  - 조치: 위 무응답 자동 정리(tmux `kill-pane`, Orca `orca terminal close`)를 안 함. "대기 중인 팀원" 으로 보고만 하고 슬롯 유지. heartbeat 가 살아 있는 프로세스를 죽이면 미답 이슈와 미커밋 산출물을 함께 잃음.
  - 화면은 다른 곳과 같이 생존 증거로 안 쓰고 이 판정에만 씀(backends.md 「화면은 생존 증거로 쓰지 않는다」 와 같은 원칙).
  - Orca 는 터미널 핸들이 없으면(`-`) 화면을 못 읽으므로 이 판정을 건너뛰고 위 무응답 규칙만 적용.
- **자동 재시작**: 위 자동 정리는 `references/restart.md` 「판정」 이 대신함(두 백엔드 공통).
  - 두 TICK 연속 무변화(또는 결과 없는 pane·탭 죽음)면 원인을 가림.
  - 재시작 후보는 워크트리를 안 지우고 pane(Orca 는 탭)만 거둠 → `team.lost` 기록 → 같은 기상 안에 「5-1. 재개 spawn」 으로 다시 띄움(재시도 상한 3 은 고아 재개와 공유).
  - 영구 제외는 `team.lost` 가 대신함.
