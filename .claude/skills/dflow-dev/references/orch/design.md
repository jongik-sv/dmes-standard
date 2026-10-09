# /dflow-dev 단계 — Design 게이트와 구현 전환

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 이 단계 시작 금지. 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

### 설계 받기 (범위 `build`, 계약 2.11)

범위 `build` 면 Design 게이트 전에 승인·확정된 설계를 받아 옴.
- 먼저 `git fetch origin`. 실패 → 되돌리지 않고 사실 알리고 끝 (다시 돌리면 이어 감).
- 서버 `design_mode`(show 의 `.order.design_mode`)로 가름.
- `review`(「설계 승인」): 사람이 검토하며 고친 설계 = 원격 agent 브랜치.
  - 로컬 agent 브랜치가 origin 조상이면 `git merge --ff-only origin/<그 브랜치>`. origin 이 로컬 조상이면 그대로.
  - 둘 다 아니면(갈라짐) 이어 가지 않고 두 끝 sha 적어 알리고 끝.
  - 원격 agent 브랜치 없으면(승인 뒤 merge·정리됨) 아래 `human` 처럼 개발 브랜치 design.md 를 받음.
- `human`(「설계 확정」): 설계 원본 = 개발 브랜치.
  - `git show origin/<기본브랜치>:<TASKS>/<TSK>/design.md` 로 받아 worktree 같은 파일에 덮어씀.
  - 바뀌었으면 그 파일만 파일명 명시 commit (`DFlow-Order` 트레일러). 같은 주문의 옛 agent 브랜치에 남은 옛 사본 때문에 게이트가 반복 실패하는 것을 막기 위함.
  - 개발 브랜치에 그 파일 없으면 아래 게이트 불통과 같게 처리 (빠진 것 = `design.md 없음`).

받아 온 바로 뒤, 다른 것을 commit 하기 전에 아래 Design 게이트를 돔. 통과하면 이어 감. 불통이면 먼저 서버 단계(`.order.item.stage`) 확인.
- **이미 `ip` 이상**(반려 재작업이거나, build-start 성공 뒤 state.json 만 `design` 에 남아 재개가 여기로 들어옴):
  - design-reopen 호출 금지. 서버는 설계 상태 `review`, 또는 `accepted`∧단계 `dd` 일 때만 그 동사를 받음 (migration 0108_design_state.sql 259-262행).
  - 「승인된 설계 고정」 절의 `"{TSK} 설계 게이트 불통(구현 중) — 사람이 설계를 고친 뒤 --resume 하세요"` 알리고 끝.
- **단계가 아직 `ds`·`dd`**: 빠진 절을 적어 `dflow.mjs design-reopen <ref> --reason "<빠진 절>"` 호출.
  - exit 0 → 서버가 review 는 설계 검토 대기로, human 은 사람 설계 대기로 되돌림. 빠진 절을 사유로 알리고 끝.
  - exit 6(네트워크) → 다시 부를 수 있는 상태로 알리고 끝.
  - 그 밖의 exit = 서버 거부 → 그 코드 적어 알리고 끝.
  - 빠진 절을 스스로 채우지 않음 (설계는 사람이 고침).

### Design 게이트

이 절(게이트 판정·`build-start`·모듈 기준선)은 `orch/phase-common.md` 「Phase 종료마다」 1번(게이트 집행)에 속함. 2번(commit 확인·state.json 전진·`progress 25`)과 3번(회수)은 이 절을 마친 뒤.
- `build-start` exit 4 → 2번 대신 `orch/design-first.md` 「2」 의 멈춤 절차.
- 범위 `design` → 2번 대신 아래 「설계만 멈춤」.
- 어느 쪽이든 3번 회수는 함.

범위 `build` 면(`orch/start.md` 「구현자동 착수」·「승인된 설계 이어 가기」·옛 서버의 두 절, `orch/rework.md`) Design 서브에이전트를 띄우지 않음.
- 계약 2.11 → 위 「설계 받기」 로 승인·확정된 설계를 받음.
- 옛 서버 → 이미 있는 design.md 로 곧바로 Design 게이트.
- 게이트 통과 시 design.md 새 commit 없음 (human 덮어쓰기 commit 은 「설계 받기」 가 이미 함).

   - **Design 게이트 뒤 구현 전환**: 게이트 통과하면 아래 모듈 기준선보다 먼저 `dflow.mjs build-start <ref>` 호출 (늘 호출 — 옛 서버는 `BUILD_START_UNSUPPORTED` 로 넘어감).
     - exit 4 → Build 로 가지 않고 설계 완료·선행 대기로 멈춤. 갈래와 멈춤 절차 = 「설계 선행」 2.
   - **범위를 붙인다(계약 2.11)**: `dflow.mjs contract-ge 2.11` exit 0 이면 위 호출 = `dflow.mjs build-start <ref> --scope <범위>`.
     - 범위 = state.json `scope`(`full`·`build`). 반려 재작업(`orch/rework.md`)이면 방식과 무관하게 `rework`.
     - 범위 `design` 은 build-start 호출 안 함 (아래 「설계만 멈춤」).
   - **Design 게이트 뒤(대응표 있을 때만)**: 첫 Build 단위 띄우기 전에 모듈 게이트 명령의 기준선을 잼.
     - design.md 「변경 파일 목록」 경로를 파일에 적어 `gate-scope.mjs --base <기점> --ignore <TASKS>/<TSK>/ --paths-file <파일>` 로 예측 범위를 봄.
     - `module` 줄 명령마다 `baseline.mjs run --base <기점> --task-dir <TASKS>/<TSK> -- '<명령>'` 으로 잼.
     - 트리가 기점과 코드 같을 때만 잼: `git diff --name-only <기점>..HEAD` 와 `git status --porcelain` 이 Task 문서 밖에서 빔.
     - 결과는 state.json `baseline.cmds` 에 `"scope": "module"` 을 붙여 더함. 정본 = dev-discipline 「게이트 범위 대응표(.dflow-gates)」.

2. **Design 게이트 뒤**(위 「Design 게이트」): `dflow.mjs build-start <ref>` 결과로 가름. 모드와 무관하게 늘 호출.

   | 결과 | 처리 |
   |---|---|
   | exit 0 | Build 로 간다(종전) |
   | exit 0 + stderr `BUILD_START_UNSUPPORTED` | 옛 서버다(404 이고 계약 < 2.9 — claim 이 이미 `ip` 로 보냈다). Build 로 간다 |
   | exit 4 | 설계 완료·선행 대기로 멈춘다(아래 멈춤 절차) |
   | exit 10 | 중단(`.claude/skills/dflow-dev/references/state-model.md`) |
   | exit 11 + stderr 끝줄 `DESIGN_GATE design_gate order_changed` | 그 사이 사람이 설계를 되돌렸거나 주문이 바뀌었다. Build 로 가지 않는다. 범위가 `build` 이고 서버 `design_mode` 가 `human` 이면(「설계 받기」 가 본 값 — 구현자동, 사실상 「설계 되돌리기」) 설계 원본이 개발 브랜치라 이 worktree 에 잃을 것이 없다 — `"{TSK} 주문이 바뀌어 구현을 시작하지 않았습니다 — 다시 확정되면 새로 시작합니다"` 로 알리고 끝낸다(워커는 `design_reopened`, 12절 Y7). 그 밖(full·legacy·rework·review)이면 설계가 이 PC 의 로컬 agent 브랜치에 남아 있을 수 있다 — `"{TSK} 주문이 바뀌어 구현을 시작하지 않았습니다 — 다시 승인되면 이어 갑니다"` 로 알리고 끝낸다(워커는 `skipped`) |
   | 그 밖의 exit 11(`DESIGN_GATE <code>`) | 설계 관문 거부다. Build 로 가지 않고 `"{TSK} 는 설계 관문에서 거부됐습니다(<code>)."` 로 알리고 끝낸다(`phase` 는 그대로) |
   | exit 12(`RUNNER_ACTIVE <runner>`) | 다른 PC 가 이 작업을 돌리는 중이다. state.json 을 바꾸지 않고 push·done 없이 `"{TSK} 는 다른 PC(<runner>)가 돌리고 있어 멈춥니다."` 로 알리고 끝낸다 |
   | 그 밖 | Build 로 가지 않고 중단·보고한다. `phase` 는 `design` 그대로라 재실행하면 Design 게이트 뒤에서 다시 부른다. 워커는 `failed build-start <exit>` |


### 설계만 멈춤 (`--scope design`)

범위 `design` 이면 Design 게이트 통과 뒤 `build-start` **호출 금지** (호출하면 서버 단계가 `ip` 로 넘어감). 모듈 기준선도 안 잼. 대신 이 순서로 멈춤.
1. design.md commit 확인 (없으면 파일명 명시 commit).
2. state.json `phase` 를 `wait_review` 로 쓰고 파일명 명시 commit (`DFlow-Order` 트레일러). 이어 `progress 25 "설계 완료(검토 대기)"` 전송.
3. `git push origin <agent 브랜치>` 로 설계를 원격에 남김 (사람 검토와 이어받기가 그 브랜치를 씀).
   - 훅이 거부하면 우회하지 않고 보고.
   - 그 밖의 이유로 실패하면 4 안 함. 사실 알리고 끝. 다시 돌리면 이어 감 (계약 2.11 은 `orch/start.md` 「끝나지 않은 설계 멈춤 이어받기」 가 마저 함).
4. 계약 2.11(`dflow.mjs contract-ge 2.11` exit 0)이면 `dflow.mjs design-done <ref>` 호출. 서버가 단계 `dd`, 설계 상태 `review` 로 두고 도는 PC 를 비움 (좌석 「설계 검토 대기」).
   - exit 6(네트워크) → 멈춤 계속 (다시 돌리면 이어받기가 마저 함).
   - exit 11 = 서버 거부 → 그 코드 적어 보고하고 끝.
   - 그 밖의 exit → `failed design-done <exit>` 알리고 끝.
   - 옛 서버 → `dflow.mjs heartbeat <ref> --phase wait_review` 호출. 실패해도(계약 2.10 전 서버는 400) 멈춤 계속 — 좌석 이름표만 틀리고, 이어 갈지는 로컬 state.json 으로 판정.
5. supervised 는 알리고 끝:
   - 계약 2.11: `"{TSK} 설계 완료·검토 대기 — agent 브랜치의 design.md 를 검토·수정해 push 한 뒤 「설계 승인」을 누르면 팀장이 이어 간다(팀장이 없으면 /dflow-dev {TSK})"`
   - 옛 서버: `"{TSK} 설계 완료·검토 대기 — design.md 를 검토·수정한 뒤 /dflow-dev {TSK} --scope build 로 이어 간다"`

design.md `## 담당자 확인 필요 결정` 절은 이 멈춤에서 서버로 넘기지 않음.
- 사람이 검토하며 design.md 에서 바로 답함.
- 이어 가 구현을 마치는 마감(`orch/close.md`)에서 `decisions.json` 으로 넘김.
- 미충족 선행 있어도 같음 (claim 이 설계 선행 모드였으면 `design_first.unmet` 이 이미 적혀 있음). 선행 판정은 이어 갈 때 `orch/design-first.md` 「3」 이 함.
- `wait_pred` 를 안 쓰는 이유: 팀장은 선행이 풀린 `wait_pred` worktree 를 자동으로 Build 로 재개함 → 사람이 검토하기 전에 구현이 시작되면 안 됨.
<!-- worker:begin -->
`--worker` 면 이 파일에서 알리고 끝나는 자리(「설계 받기」·「Design 게이트」 표의 exit 11·12·「설계만 멈춤」 3~5·「승인된 설계 고정」)마다
알림 대신 worker-mode.md 「설계 상태의 결과 줄」 의 줄을 `.result` 에 쓰고 끝낸다(형식 정본은 worker-prompt.md).
<!-- worker:end -->

### 승인된 설계 고정 (D24, 계약 2.11)

서버 `design_state=accepted`(「설계 승인」·「설계 확정」)이고 단계 `ip` 이상이면 설계 고정.
- design.md 설계 내용 수정 금지. 예외 = 게이트가 적는 기록 절(`## 담당자 확인 필요 결정`·`## 도커 금지로 생략한 검증`)만.
- 재개 판정(SKILL.md 상태 모델의 산출물 교차 확인)이 design.md 없음/5절 부족으로 Design 후퇴하려 해도 후퇴 안 함. 「설계 받기」 자체의 게이트 불통도 같음 (단계 `ip` 이상이면 design-reopen 호출 안 함).
- `"{TSK} 설계 게이트 불통(구현 중) — 사람이 설계를 고친 뒤 --resume 하세요"` 알리고 끝.
- 완전자동(설계 상태 없음)은 반려 재작업에서도 종전대로 설계부터 다시 판단.

**다음 단계**: 범위 `design` 이면 여기서 끝난다. 아니면 `build-start` exit 0 이면 `orch/build.md`, exit 4 면 `orch/design-first.md` 「2」.
