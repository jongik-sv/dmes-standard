# /dflow-dev 단계 — 착수 — show 판정과 갈래

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 이 단계 시작 금지. 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

## Phase 01 — Claim·브랜치·기준선 (오케스트레이터 본인)

> Phase 01 번호는 네 파일에 이어짐: 1 이 파일, 2 `orch/base.md`, 3 `orch/claim.md`, 4-6 `orch/baseline.md`.

- `<기본브랜치>` = 개발 브랜치 = `dflow.mjs branch dev` 값 (`.dflow.local` 의 `dev_branch`, 레거시는 `origin/HEAD`).
- 팀원 = 팀장이 넘긴 `DEV_BRANCH` 사용.
- 개발 브랜치가 원격에 없으면 멈추지 말고 먼저 `node .claude/skills/dflow-work/scripts/dflow.mjs branch ensure-dev` 로 운영 브랜치에서 생성. 실패하면 그 사유로 중단·보고.

- 작업 폴더 `<TASKS>` = `<DOCS_DIR>/tasks` (리포 최상위 기준).
- 주문 폴더 `<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>` 값. `.dflow.local` `project_map` 의 프로젝트 키, 없으면 `docs`.
- 여러 작업을 훑을 때 = `dflow.mjs config tasks-dirs` 가 내는 폴더 전부 확인.
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 금지.

1. `dflow.mjs doctor` (세션 첫 호출 시). `dflow.mjs show <ref>` 로 상태 확인:
   ready → 착수 가능 판정(2번) 후 claim / claimed → **반려 판정 먼저(아래), 아니면** 재개 판정(SKILL.md 상태 모델) /
   reported → 종료 / approved → Phase 01-가 스윕이 이미 처리했어야 함.
   - 로컬 state.json 없는 작업이라 스윕이 못 봤을 수 있음 → 지금 즉시 같은 머지 절차를 이 ref 하나로 실행 후 종료.
   <!-- worker:begin -->
   `--worker` 면 머지하지 않고 `needs-merge` 로 끝낸다(「--worker」 C).
   <!-- worker:end -->
   - 이 머지도 `/dflow-merge` SKILL.md 4번 절차. Phase 01-가 가 `SWEEP_NONE` 으로 건너뛰어 아직 안 읽었으면 먼저 읽음.

   **서버 판단(계약 2.11)** — `dflow.mjs contract-ge 2.11` exit 0 이면 show 응답 `.order` 의 서버 판단으로 먼저 가른다.
   - 칸: `action`(`full`·`design`·`build`·`wait`·`skip`)·`action_reason`·`mine`·`design_mode`·`design_state`(`review`·`accepted`·없음)·`claim_scope`·`runner`·`runner_seen_at`.
   - claimed 주문의 `mine` = "같은 신원이고 이 PC 가 돌려도 된다" (`dflow.mjs show` 가 이 세션의 라벨을 보냄).
   - 계약 2.11 아님(옛 서버) → 이 문단 건너뛰고 종전대로: 모든 작업을 완전자동으로 보고, 수동 `--scope design`·`build` 는 로컬 state.json 으로 돈다(아래 「옛 서버의 설계 검토 대기」·「옛 서버의 범위 build」).
   - 범위 = `--scope` 값, 없으면 state.json `scope`, 그것도 없으면 `full`.
   - ready: 범위 = `--scope` 값(팀장은 늘 넘김). 없으면 `action` 이 `full`·`design`·`build` 일 때 그 값.
     - `action` 이 `wait`·`skip` → 착수 안 함. `"{TSK} 지금은 할 일이 없다 — <action_reason>"` 알리고 끝.
     - 범위가 작업과 맞는지는 서버가 claim 때 다시 봄 (exit 11 — `orch/claim.md`).
   - claimed: `mine` 거짓 → 이어 가지 않음. `"{TSK} 다른 PC 도는 중 — <runner>, 마지막 신호 <runner_seen_at>"` 알리고 끝.
     - 그 PC 가 30분 넘게 조용하면 `mine` 참 → 이어받기 가능.
     - `mine` 참인데 `runner` 가 이 세션 라벨과 다른 PC → "원래 PC 의 세션이 살아 있으면 먼저 끄세요" 한 줄 알리고 이어 감.
     - `design_state` = `review` → 이어 가지 않음. `"{TSK} 설계 검토 대기 — 「설계 승인」을 누르면 이어 간다"` 알리고 끝.
   - claimed 의 범위 = 서버 `claim_scope`: `design` → `design`, `build` → `build`, 그 밖(`full`·`legacy`·없음) → `full`.
     - 수동 `--scope` 무시하고 그 사실 한 줄 남김.
     - state.json `scope` 가 다르면 이 값으로 고쳐 씀 (다음 커밋에 실림).
   - 재개하는 state.json `phase` 가 `build`·`verify`·`refactor` → 그 단계로 가기 전에 `dflow.mjs build-start <ref> --scope <범위>` 먼저 호출.
     - 이미 구현 중이라 단계는 그대로, 도는 PC(`runner`)만 이 PC 로 넘겨받음.
     - 결과는 `orch/design.md` 「Design 게이트」 표대로 가르고, exit 0 이면 그 단계로 이어 감.

   **반려 재작업 경로** — 로컬 `phase=reported`(승인 뒤 재작업 요청이면 `merged`)인데 서버 `status=claimed` → 반려 의심.
   - 판정 = show 응답 최상위 `.reports` 의 마지막 `kind=completion` 리포트가 `review_action=reject` (`review_note` = 사유).
   - 반려면 `orch/rework.md` 를 읽고 그대로 수행.

   **끝나지 않은 설계 멈춤 이어받기(계약 2.11)** — 조건: 서버 `status=claimed`·`mine=true`, 그리고 이 작업의 agent 브랜치(아래 「설계 선행 재개」 와 같은 곳) tip 의 state.json 이 아래 중 하나.
   - `wait_review` + 서버 `design_state` 없음
   - `wait_pred` + 서버 단계(`.order.item.stage`) `ds`
   - 의미: 멈춤이 서버에 안 닿음 (push 뒤 `design-done` 전에 끊김). claim·격리 없이 남은 두 걸음을 마저 함.
   1. `git fetch origin` 뒤 로컬 agent 브랜치를 origin 과 비교 (로컬에 없으면 `orch/design-first.md` 「3」 0 처럼 origin 에서 생성).
      - 로컬이 앞서면 `git push origin <agent 브랜치>`.
      - origin 이 앞서거나 같으면 push 안 함.
      - 갈라졌으면 이어 가지 않고 두 끝 sha 를 적어 알리고 끝.
      - fetch·push 실패 → 사실 알리고 끝 (다시 돌리면 여기부터 이어 감).
   2. `dflow.mjs design-done <ref>` 호출.
      - 실패(exit 6) → 사실 알리고 끝 (다시 돌리면 이어 감).
      - 그 밖의 exit → `failed design-done <exit>` 알리고 끝.
      - `wait_review` 였으면: 출력의 설계 상태가 `review` 일 때 위 「서버 판단」 의 설계 검토 대기처럼 알리고 끝.
      - `review` 아니면(2.10 설계만 잔재가 완전자동 작업에 남음) `"{TSK} 설계만으로 멈춘 작업인데 서버에 설계 검토 대기가 없습니다 — 작업의 설계 방식을 확인하세요"` 알리고 끝.
      - `wait_pred` 였으면 아래 「설계 선행 재개」 로 감.

   **설계 선행 재개** — 서버 `status=claimed`·`mine=true`, 이 작업의 agent 브랜치(로컬 `agent/<주문id8>-*`, 없으면 `origin/agent/<주문id8>-*`) tip 의 state.json 이 `phase=wait_pred`.
   - claim·격리 없이 `orch/design-first.md` 「3」 으로 감 (반려 판정은 먼저).
   - 현재 트리가 아니라 그 브랜치에서 읽음: `git show <그 브랜치>:<TASKS>/<TSK>/state.json`.
   - 워커는 부트스트랩이 기본 브랜치로 detach 해 둠. 거기 있는 state.json 은 scaffold 의 `ready` 이거나 없음.

   **승인된 설계 이어 가기(계약 2.11)** — 서버 `claim_scope=build`(「설계 승인」 된 설계 검토 작업)이고 agent 브랜치 tip state.json 이 `wait_review`.
   - claim·격리 없이 `orch/design-first.md` 「3」 재개를 타되 셋이 다름.
     tip 이 `wait_pred` 인 승인된 설계(구현 시작 때 선행이 되돌아가 멈춘 작업) → 위 「설계 선행 재개」 로 가되 아래 첫째를 같게 함.
     - 「3」 0 의 switch 뒤, 1 전에 `orch/design.md` 「설계 받기」 수행: 사람이 검토하며 고쳐 push 한 설계를 받아 Design 게이트를 다시 돔. 게이트 불통이면 그 절대로 끝.
     - state.json `scope` 를 `build` 로 바꿈 (다음 커밋에 실림).
     - 「3」 5(선행 계약 재확인)는 design.md 에 `## 선행 기준` 절이 있을 때만. 선행 충족 상태로 설계했으면 이 절이 없고, 그때는 바뀐 파일 없음으로 봄.

   **옛 서버의 설계 검토 대기**(계약 < 2.11, 수동 실행) — 「설계 선행 재개」 와 같은 조건에서 그 브랜치 tip state.json 이 `phase=wait_review`(설계만으로 멈춤)면 claim·격리 안 함.
   - 범위가 `build` 아니면 이어 가지 않음. supervised 는 `"{TSK} 설계 검토 대기 — design.md 를 검토한 뒤 /dflow-dev {TSK} --scope build 로 이어 간다"` 알리고 끝.
   - 범위가 `build` 면 `orch/design-first.md` 「3」 재개를 타되 다섯이 다름:
     - 「3」 0 의 switch 대신 **사람이 고친 설계를 받아 옴.** 사람은 검토하며 design.md 를 고쳐 origin 에 올림.
       - `git fetch origin` 뒤 로컬 `agent/<주문id8>-*` 없으면 「3」 0 그대로 origin 에서 생성.
       - 있으면 그 브랜치로 switch. 로컬이 origin 의 조상이면 `git merge --ff-only origin/<그 브랜치>`, origin 이 로컬의 조상이면 그대로 둠.
       - 둘 다 아니면(갈라짐) 이어 가지 않고 두 끝 sha 를 적어 보고하고 멈춤 (`phase` 는 `wait_review` 그대로).
     - 받아 온 **바로 뒤, 아무것도 커밋하기 전에 Design 게이트를 다시 돔** (사람이 design.md 를 고쳤을 수 있음).
       - 불통 → 빠진 절을 적어 보고하고 멈춤 (`phase` 는 `wait_review` 그대로, 커밋 없음).
     - state.json `scope` 를 `build` 로 바꿈 (다음 커밋에 실림). `design` 이 남으면 인자 없이 다시 돌리거나 검토 모드로 Design 을 다시 띄울 때 또 설계만 하고 멈춤.
     - 「3」 5(선행 계약 재확인)는 design.md 에 `## 선행 기준` 절이 있을 때만. 설계만으로 만든 설계가 선행 충족 상태였으면 이 절이 없고, 그때는 바뀐 파일 없음으로 봄.
     - 3 의 1 에서 선행 미충족으로 다시 멈추면, 멈춤 절차 4·5 전에 state.json `phase` 를 `wait_pred` 로 바꿔 파일명 명시 커밋하고 push.
       - 이유: 검토는 끝났고 선행만 기다림 → 선행이 풀리면 팀장이 자동으로 이어 가는 것이 맞음.

### 구현자동 착수 (ready, 범위 `build`)

ready 갈래에서 범위 `build` = 사람이 「설계 확정」 한 구현자동 작업 (서버 `design_state=accepted`, 단계 `dd`).
- 착수 가능 판정·claim 은 종전대로 `orch/base.md` → `orch/claim.md` (claim 은 `--scope build`).
- agent 브랜치에 올라선 뒤 Design 단계: Design 서브에이전트 띄우지 않음. `orch/design.md` 「설계 받기」 로 개발 브랜치의 사람 설계를 받아 곧바로 Design 게이트.
- 확정되지 않은 작업이면 서버가 claim 거부 (exit 11 — `orch/claim.md`).

**옛 서버의 범위 build**(계약 < 2.11, 수동 실행) — ready 갈래에서 범위 `build` 면 **claim 전에** 사람이 쓴 설계를 확인 (설계는 사람, 구현은 에이전트).
1. `git fetch origin` 뒤 `git show origin/<기본브랜치>:<TASKS>/<TSK>/design.md` 로 읽음 (`<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>`). 없으면 착수 안 함, "설계 문서 없음" 보고.
2. SKILL.md 「게이트 집행 원칙」 의 Design 게이트 최소 구조 5절이 모두 있는지 확인. 빠진 절 있으면 착수 안 함, 빠진 절을 적어 보고. **빠진 절을 스스로 채우지 않음** — 이 범위의 전제 = 사람이 설계.
3. 통과하면 종전대로 `orch/base.md` → `orch/claim.md`. design.md 가 든 그 폴더는 재claim 격리 대상 아님 (`orch/claim.md`). Design 단계: Design 서브에이전트 없이 곧바로 Design 게이트 (`orch/design.md`).
<!-- worker:begin -->
`--worker` 면 이 파일에서 알리고 끝나는 자리(「서버 판단」·「끝나지 않은 설계 멈춤 이어받기」·「승인된 설계 이어 가기」)마다 알림 대신
worker-mode.md 「설계 상태의 결과 줄」 의 줄을 `.result` 에 쓰고 끝낸다(형식 정본은 worker-prompt.md). 팀장은 옛 서버에서 범위를 넘기지
않으므로(poll 의 action 칸이 비어 `SCOPE=full`) 옛 서버의 두 절은 워커 경로에 없다.
<!-- worker:end -->

**다음 단계**: ready 는 `orch/base.md` → `orch/claim.md`, 반려는 `orch/rework.md`, 설계 선행 재개·승인된 설계 이어 가기는 `orch/design-first.md` 「3」(범위 `build` 는 그 0 뒤 `orch/design.md` 「설계 받기」), 그 밖의 재개는 state.json `phase` 의 단계 지도 행(구현 중이면 먼저 `build-start` — 「서버 판단」).
