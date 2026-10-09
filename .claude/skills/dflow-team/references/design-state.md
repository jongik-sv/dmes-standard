# /dflow-team 설계 상태 (계약 2.11)

SKILL.md 「2-3」 의 poll exit 0·`build`, 「3. 결과 처리」 가 가리킬 때 Bash `cat` 으로 읽음.
옛 서버(계약 < 2.11)에서는 읽지 않음 — 모든 작업 완전자동.
- worker 쪽 정본: `/dflow-dev` `references/orch/start.md` 「서버 판단」 · worker-mode.md 「설계 상태의 결과 줄」
- 설계 정본: wbs-web 리포 docs/superpowers/specs/2026-09-26-design-state-dev-auto-design.md 6절·12절 (킷 미동봉)

## 1. 설계 사전 검사

poll 줄에 넷째 칸 `action` 있는 후보는 띄우기 전에 개발 브랜치 설계 문서 확인 (스펙 6.2 「띄우기 전 검사」).
- 목적: worker 띄웠다 곧 되돌리는 낭비 방지
- 목적: 사람 초안을 agent 설계가 옮기거나 덮는 일 방지 (12절 L5)

규칙:
- `git fetch origin` = 기상마다 1회
- fetch 실패 → 이 기상에 `action` 있는 후보 하나도 안 띄움 (모르는 채 띄우지 않음, 제외도 안 함, 다음 기상에 다시 봄)
- `<TASK_DIR>` = SKILL.md 「5. 팀원 spawn」 3번 블록으로 여기서 먼저 구함. 「5」 는 그 값 재사용

```bash
git -C '<MAIN>' fetch -q origin || echo FETCH_FAIL
git -C '<MAIN>' show "origin/<개발브랜치>:<TASK_DIR>/design.md" 2>/dev/null | grep '^## ' || echo NO_DESIGN
```
- `action=build` (구현자동 — 사람이 「설계 확정」 함):
  - 제목 줄만 보고 Design 게이트 최소 구조 5절 전부 있는지 확인: 접근·변경 파일 목록·테스트 전략·수용 기준 매핑·불변 규칙 (번호·덧붙인 말 무시)
  - `NO_DESIGN` 이거나 절 빠짐 → 안 띄움. `.claude/skills/dflow-work/scripts/dflow.sh design-reopen <id8> --reason "<design.md 없음 | 빠진 절: …>"` 호출
  - 서버가 사람 설계 대기로 되돌리고 사유를 화면에 보임 (사람이 고쳐 다시 확정하면 poll 이 다시 줌). 제외 안 함
  - 보고 한 줄: `<TSK> 사람 설계를 되돌렸습니다 — <사유>`
  - design-reopen 실패 → 안 띄움. 사유 `설계 되돌리기 실패(exit <n>)` 로 일시 제외 + `team.result`(slot `-`, status `skipped`) 기록
- `action=design`·`full`:
  - `NO_DESIGN` 이 아니면 사람 설계 초안이 개발 브랜치에 있음 → 안 띄움
  - 「멈춤」 표에 `사람 설계 초안 있음 — 방식을 구현자동으로 바꾸거나 초안을 지우라` 로 올림
  - `team.result`(slot `-`, status `skipped`, 사유 `사람 설계 초안 있음`) 기록 + 일시 제외 (poll 이 30분 뒤 다시 줌, 12절 L11)
- 통과 → 그대로 spawn. 포인터 `SCOPE` = 그 `action` (SKILL.md 「5」 4번)

## 2. 「설계 승인」 된 작업(`build`)

기상 블록 요약 끝의 `build` 칸 (옛 서버는 칸 없음).
- 서버가 팀장 lease 프로젝트 + poll 과 같은 거르기(태그 `agent`, `wake.sh` 의 `--wp`)로 좁힌 "이 신원·이 PC 가 띄울 build 주문"
- WP 밖 승인 주문은 안 옴 (설계 상태 스펙 D22·Y9)
- `"NULL"` = 조회 실패. 그 기상에는 처리 안 하고 `build_err` 한 줄 보고 (빈 목록과 뭉개지 않음)
- 배열이면 `status` 가 `claimed` 인 원소 (「설계 승인」 된 설계 검토 작업, poll 에 안 나옴) 중 슬롯·영구 제외에 없는 것을 재개 대상에 더함 (SKILL.md 「2-3」 4번 순서, 「5-1」 **승인** 대상)
  - 이 PC 에 워크트리 있으면 그것 사용
  - 없으면 `references/resume.md` 3항이 원격 agent 브랜치에서 생성
  - 띄우기 전 확인 = resume.md 「서버 판단 확인」
- **fetch·push 실패 되풀이 방지** (고아 스캔과 같은 규칙, 12절 Y11):
  - `build_ready` 는 claimed·accepted·dd·mine 주문을 계속 실음
  - worker 가 `skipped fetch 실패`·`skipped push 실패` 로 끝나도 주문은 목록에 남음 → 안 고치면 결과 도착한 같은 기상에 곧바로 다시 뜸
  - `EXCLUDE_TEMP` 는 만료가 없어 가두면 다른 사유(설계 관문 등)까지 영구히 막음 → 쓰지 않음
  - 대신 `lead-state.sh` 의 id8 별 신호로 가름:
    - `WARN_RETRY` → 재개 대상에 안 넣고 「멈춤」(사유 `fetch·push 3회 연속 실패`)
    - `RETRY_DUE` → 재개 대상에 더함 (고아 스캔과 같은 30분 신호)
    - `BUILD_RETRY_DUE` → 재개 대상에 더함. build 목록 전용 신호: 사유가 `설계 관문(…)`·`주문이 바뀜`·`다른 PC 도는 중(…)`·`design-reopen 미확인` 인 skip 뒤 30분 경과
  - `BUILD_RETRY_DUE` 필요 이유: 사람이 설계를 되돌렸다 재승인하거나 다른 PC 가 물러나면 같은 주문이 목록에 다시 실림. 없으면 팀장 재시작 전까지 갇힘 (좌석은 계속 곧 시작한다고 표시)
  - 이 사유들에는 3회 멈춤 없음 (`WARN_RETRY` 는 fetch·push 실패에만 해당)
  - 셋 다 아니고 `EXCLUDE_TEMP` 에 있으면 이번 기상에는 안 더함 (마지막 결과가 재시도 사유 skip 인데 30분 미경과, 또는 재시도 사유 아닌 skip)
  - 셋 다 아니고 `EXCLUDE_TEMP` 에도 없으면 (실패 이력 없음, 또는 팀장 재시작으로 이력 사라짐) 그대로 더함
- 이 처리는 **건너뛴 TICK**(「2-2」 `--may-skip`)에서 안 돔:
  - `tick.sh` 의 깨울지 판정은 `EXCLUDE_TEMP` 에 걸린 claimed 원소를 깨울 이유로 안 침
  - `RETRY_DUE`·`BUILD_RETRY_DUE` 인 것은 침 → 재시도 기한 되면 그 TICK 은 안 건너뜀
  - 사람이 좌석 「이어서 시작」 누르면 재개 요청이 이번 기상을 강제 (`reqs` 비지 않으면 안 건너뜀)
- `ready` 원소(구현자동 확정)는 poll(`action=build`)이 가져옴 → 여기서 안 띄움

## 3. 결과

SKILL.md 「3. 결과 처리」 표가 가리키는 보충.
- **`design_review`**: 실패 아님. 보고 한 줄: `<TSK> 설계 검토 대기(<branch>) — 「설계 승인」을 누르면 다음 TICK 에 팀장이 구현을 이어 간다`
- **`design-done 미확인`** (`design_review`·`design_waiting` 의 사유): worker 가 push 까지 마쳤으나 design-done 이 네트워크로 실패.
  - 워크트리 지우기 전에 `.claude/skills/dflow-work/scripts/dflow.sh design-done <id8>` 호출 (설계 멈춤 이어받기, 스펙 6.3)
  - 실패 → 워크트리 안 지우고 `parked` 로 둠. 다음 기상에 다시 호출. 「멈춤」 표에 사유 `설계 멈춤 미완료`
- **`skipped fetch 실패`·`skipped push 실패`** (잡은 작업):
  - 워크트리 안 지움 (push 못 한 커밋 있을 수 있음)
  - 30분 뒤 재구성의 `RETRY_DUE` 로 고아 스캔이 다시 띄움
  - 같은 계열 3회 연속 → `WARN_RETRY` → 「멈춤」 표에 `fetch·push 3회 연속 실패` (12절 Y11, 사람이 네트워크·권한 확인 뒤 `--resume`)
  - 「2」 의 `build` 목록도 같은 `RETRY_DUE`·`WARN_RETRY` 신호 사용 (그 밖 재시도 사유 = `BUILD_RETRY_DUE`)
  - **팀장 재시작 주의**:
    - 「1. 시작」 5번의 재기록은 **흡수한 슬롯**(살아 있는 팀원)만 다시 씀
    - `skipped fetch·push 실패` 는 이미 슬롯 반납 후라 재시작 뒤 새 창에 이 id8 의 `team.result` 없음
    - → `lead-state.sh` 가 `RETRY_DUE` 안 냄. 고아 스캔은 `.result` 의 `skipped` 를 최종 판정으로 보아 재개 가능에 안 넣음
    - 재시작 **전** 재구성이 이미 `RETRY_DUE` 로 재개를 시작했을 때만 자동으로 이어짐. 아니면 「멈춤」 으로 남아 사람의 `--resume` 필요
    - **`build` 목록 예외**: 재시작 뒤 build 목록 주문은 영구 제외가 비어 있음 (위 「2」 는 EXCLUDE_PERM 만 최종 차단). 재구성이 재기록 안 한 새 창에는 `RETRY_DUE`·`WARN_RETRY`·`BUILD_RETRY_DUE` 도 없음 (「2」 의 "`EXCLUDE_TEMP` 에도 없으면" 갈래) → 다음 기상에 「2」 가 그대로 다시 띄움. 자동으로 이어지나 30분 대기·3회 상한은 재시작 전 이력만큼 못 지킴
- **`skipped 다른 PC 도는 중(<runner>)`**: 워크트리 안 지우고 「멈춤」 표에 올림 (다른 PC 세션이 이어 감). 다른 PC 가 물러나 주문이 `build` 목록에 다시 실리면 30분 뒤 `BUILD_RETRY_DUE` 로 「2」 가 다시 띄움
- **결과 줄 없이 `heartbeat.sh` 의 `runner_active` 훅이 세운 worker**:
  - 팀원은 결과 줄 못 쓴 채 멈춤 (hook 의 `stopReason` 은 사람에게만 보임)
  - 무응답(정체)으로 잡혀 `restart.md` 「판정」 순서 3(`mine` 거짓)으로 떨어짐 → 거두기 → 슬롯 해제 → 「멈춤」(사유 `다른 PC claim`, `restart.md` 「판정」 3행 그대로). 재시작 후보로 안 감. 워크트리 = `parked`
  - 나중에 사람이 `--resume` 해도 2.11 에서는 build-start 까지 안 감: `resume.md` 「서버 판단 확인」 의 `mine` 거짓 행이 먼저 막아 사유 `다른 PC 도는 중(<runner>)` 으로 다시 「멈춤」
  - build-start exit 12 는 2.11 서버만 냄. `resume.md` 안 거친 수동 실행만 받아 `skipped 다른 PC 도는 중` 으로 끝남
- **`design_reopened`** (설계를 사람에게 되돌림): 실패 아님.
  - 워크트리는 미커밋 변경 있어도 지움 — 설계 원본은 개발 브랜치이거나 이미 push 됨
  - `git worktree remove --force <워크트리>` (Orca 는 Orca 정리 명령에 `--force`) → backends.md 「고아 정리 규칙」 5번의 생성 브랜치 정리
  - 보고 한 줄: `<TSK> 설계를 사람에게 되돌렸습니다 — <사유>. 다시 확정·승인되면 새로 띄웁니다`
  - 사유 `주문이 바뀜` (구현 시작 직전에 사람이 설계를 되돌림) → `<TSK> 사람이 설계를 되돌려 구현을 시작하지 않았습니다. 다시 확정되면 새로 띄웁니다`
