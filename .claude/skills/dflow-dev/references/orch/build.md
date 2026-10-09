# /dflow-dev 단계 — Build — 구현 단위와 Build 게이트

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 이 단계 시작 금지. 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

**Build = 구현 단위마다 서브에이전트 하나** (dev-discipline.md 「구현 단위」). 단위·순서 = design.md `## 구현 단위` 표. 표 없으면 단위 하나(B1).
- 이름: 단위 하나면 `<TSK>-build` 그대로 (이름·게이트·재시도 종전과 같음). 여럿이면 `<TSK>-build-<단위>`(예 `<TSK>-build-B2`).
  - 인계받아 같은 단위를 이어 띄우면 끝에 `-c<n>` (`<TSK>-build-B2-c1`).
- 띄우기 직전 state.json 의 `model`·`build_unit` 을 씀.
  - 모델 = 모든 단위가 Build 모델 하나: state.json `build_model_trial` true → sonnet, 아니면 `build_model_base`. 예외 = 아래 「승급」 뿐.
  - 단위를 띄울 때의 모델은 state.json `model` 이 아니라 git 트레일러로 정함 (재개도 같음 — dev-discipline 「sonnet Build 의 opus 승급」).
  - 띄울 때마다 build-log.md `## 실행 모델` 에 한 줄 쓰고, 보고 받으면 채움 (열은 dev-discipline 「Build 모델 시험(build_model_trial)」).
  - `build_unit`(선택) = 지금 도는 구현 단위(`B1`…). 병렬 묶음이면 동시에 도는 단위를 쉼표로 이음(`"B1,B2"`).
  - 단위 수와 무관하게 `phase` 는 Build 동안 `build` 하나.
- 프롬프트에 넣을 것: 단위 이름, 마지막 단위인지(연결 테스트·E2E 담당), 단위 상한(도구 호출 약 120회·컨텍스트 250K 추정).
- 보고 첫 줄 `UNIT_DONE <단위>` → 그 단위 커밋 있는지 확인 (병렬 묶음의 단위는 아래 「묶음」 — 커밋은 오케스트레이터가 함).
  - 마지막 단위 아니면 게이트 없이 곧바로 `TaskStop`, 다음 단위 띄움.
- 보고 첫 줄 `UNIT_HANDOFF <단위>` → build-log.md `## 인계 <단위>` 커밋 확인 (병렬 묶음은 아래 「묶음」) → TaskStop → 같은 단위를 새 에이전트로 이어 띄움 (프롬프트에 그 인계 절).
  - 이어 띄우기는 단위마다 2회까지.
  - 횟수는 기억이 아니라 `git log <기점>..HEAD --grep='DFlow-Unit: <단위> handoff' --format=%h` 줄 수로 셈.
  - 세 번째 인계 = Build 실패 (「Phase 02~05 공통」 4번).
- 둘 다 아닌 보고: opus 단위면 Build 실패, sonnet 단위면 아래 「승급」.
- **승급(sonnet 단위)**: sonnet 단위 에이전트가 막히면 이어받기를 opus 새 에이전트로 띄움. 조건(둘 중 하나):
  - 같은 단위의 두 번째 인계(`UNIT_HANDOFF`)
  - 새·관련 테스트 초록 없이 끝남 (보고의 관련 테스트가 빨갛거나 `UNIT_DONE`·`UNIT_HANDOFF` 어느 것도 아닌 보고)
  - (조건 아님) 인계 상한(단위마다 2회)은 그대로. 승급은 그 자리의 모델만 바꿈.
  1. 초록 없이 끝났으면 오케스트레이터가 인계로 바꿈.
     - 보고로 build-log.md `## 인계 <단위>`(한 것·남은 것·실패 중인 테스트) 작성.
     - design.md 표의 그 단위 범위 안 변경과 build-log.md 를 `--trailer "DFlow-Unit: <단위> handoff" --trailer "DFlow-Escalate: <단위> 초록 없이 끝남"`(과 `DFlow-Order`)로 커밋.
     - 인계가 이미 2회면(이 커밋이 세 번째) 바꾸지 않고 Build 실패.
     - 범위 밖에 커밋 안 된 변경이 남으면 Build 실패.
     - 에이전트가 이미 `done` 커밋을 남겼으면 되돌리지 않고 그 위에 이 커밋을 쌓음 (가장 최근 트레일러가 `handoff` 가 되어 재개가 끝난 단위로 보지 않음).
     - 병렬 묶음의 단위면 「묶음」 2 의 커밋에서 같은 트레일러를 붙임.
  2. TaskStop → build-log.md `## 실행 모델` 에 opus 줄 (승급 칸 `sonnet→opus(<사유>)`).
     - `dflow.mjs progress <ref> <직전 보고 퍼센트, 보통 25> "escalated: sonnet→opus <단위>(<사유>)"` 전송.
     - state.json `model` 을 바꾸기 **전에** 보냄 (보고 행이 그 시점의 heartbeat 모델을 남김(0105) → 방금 끝난 sonnet 구간이 그 행에 남음).
     - exit 10 이면 멈춤 (상태 모델).
  3. state.json `model` 을 opus 로 쓰고 이어받기 `<TSK>-build-<단위>-c<n>` 을 opus 로 띄움 (`{HANDOFF}` 에 그 인계 절).
     - 그 단위의 뒤 이어받기도 opus. 그 단위가 끝나면 남은 단위는 원래 모델로 복귀.
  - 승급한 에이전트와 게이트 재시도 에이전트는 시험 단위가 아니므로 `{ADVISOR_POLICY}` = `막혔을 때만`.
- **advisor 호출 시점**: 프롬프트 `{ADVISOR_POLICY}`:
  - Build sonnet 시험 단위(state.json `build_model_trial` true 이고 sonnet 으로 도는 단위)만 `착수 전·막혔을 때·완료 전`.
  - 그 밖의 모든 Phase 에이전트 = `막혔을 때만` (dev-discipline 「advisor 호출(실행 모델별)」).
  - 보고의 `advisor <호출 수>`(그 에이전트 누적)를 `## 실행 모델` 의 `advisor` 칸에 옮김. 같은 에이전트가 SendMessage 로 다시 보고하면 더하지 않고 덮어씀.
- 재개 시 끝난 단위를 커밋 트레일러로 가림:
  - `git log <기점>..HEAD --grep='DFlow-Unit: <단위> done' --format=%h` 가 한 줄 이상이고, 그 단위의 **가장 최근** `DFlow-Unit` 트레일러가 `done` 이면 끝난 단위 (`git log <기점>..HEAD -1 --grep='DFlow-Unit: <단위> ' --format=%B | sed -n 's/^DFlow-Unit: <단위> //p'` 가 `done`).
  - 아래 「승급」 1 로 `done` 커밋 뒤에 인계 커밋이 붙은 단위는 안 끝남 (단위 커밋 규칙 = phase-build.md 「구현 단위」).
  - 남은 단위부터 띄움. 마지막 인계가 있으면 build-log.md `## 인계 <단위>` 를 프롬프트에 넣음.
- 마지막 단위가 끝나면 Build 게이트 (아래 「Build 게이트」). Build 게이트 재시도(「Phase 02~05 공통」 4번)는 마지막 단위의 에이전트에 이어 붙임.
- **묶음**: 단위는 표의 `묶음` 순서대로 돎 (열이 없거나 비면 단위마다 다른 묶음 — 위 순차 절차 그대로).
  - Build 시작 때 마지막 단위가 혼자 마지막 묶음인지 확인. 아니면(phase-design.md 「구현 단위」 위반) `묶음` 열 무시하고 순차.
  - 한 묶음에 단위 둘 이상(병렬 묶음) → 그 단위들을 한 메시지에 동시에 띄우고, 모두 보고할 때까지 커밋 안 함.
    - 이유: 형제가 트리를 고치는 중의 커밋은 index 에서 부딪침. 대상 리포의 커밋 훅(lint-staged 등)이 형제의 작업 중 파일을 건드림.
  - 프롬프트 `{UNIT}` = 병렬 표기 (phase-prompt.md 변수표). 병렬 단위는 git 에 쓰지 않고 보고로 넘김 (phase-build.md 「병렬 묶음의 단위」).
  - 각 단위는 보고 받는 즉시 TaskStop. 모두 보고하면:
  1. 묶음 검사 — 단위들의 파일 목록이 서로 안 겹침. 각 파일이 design.md 표의 그 단위 범위 안. 어기면 Build 실패.
     - 단위가 쓴 변이 기록 파일(`<TASKS>/<TSK>/mutations/<단위>-M<n>.mut`)은 Task 문서라 범위 검사에서 뺌.
  2. 단위마다 차례로 그 단위 파일만 stage 해 커밋.
     - 보고의 변이 검증 기록 행·설계 이탈·인계 내용을 build-log.md 에 옮기고, 그 단위의 변이 기록 파일과 같은 커밋에 실음.
     - `UNIT_DONE` → `--trailer "DFlow-Unit: <단위> done"`, `UNIT_HANDOFF` → `--trailer "DFlow-Unit: <단위> handoff"` (`DFlow-Order` 트레일러도). 트레일러가 같으므로 재개·인계 계수는 위와 같음.
  3. 커밋 뒤 `git status --porcelain` 이 Task 문서 밖에서 비어야 함. 보고에서 빠진 파일이 남으면 Build 실패.
  4. 인계한 단위는 묶음 커밋 뒤 혼자 이어 띄움 (`-c<n>`, 병렬 표기 없이 — 스스로 커밋).
     - 둘 이상이 인계했으면 표 순서대로 하나씩 차례로 이어 띄움 (동시에 띄우지 않음).
     - 끝나면 다음 묶음으로.
  5. 커밋이 끝나면 단위 보고 파일(`<TASKS>/<TSK>/unit-report-<단위>.md`, phase-build.md 「병렬 묶음의 단위」) 삭제.
  - 한 단위가 Build 실패(세 번째 인계, opus 단위의 둘 다 아닌 보고)면: 형제 보고를 기다려 끝난 단위는 커밋한 뒤 Build 실패로 멈춤 (재개가 끝난 단위를 다시 하지 않게).
  - 재개 시 묶음의 일부만 끝났으면 남은 단위만 같은 방식으로 띄움 (하나만 남으면 순차 표기).
  - 재개 시 done 트레일러 없는 묶음 단위에 단위 보고 파일이 있으면 다시 띄우지 않고 그 파일로 위 1-5 수행 (보고 받고 커밋하기 전에 오케스트레이터가 재시작된 경우).
  - 보고 파일이 없는데 그 단위 범위에 커밋 안 된 변경이 있으면 Build 실패로 멈춤 — 반쯤 쓴 트리 위에 새 에이전트 금지 (사람이 보고 되돌리거나 커밋).

### Build 게이트

   - **Build 게이트**: 전체 스위트를 `heavy.mjs` 로 감싸 한 번 돎.
     - 결과(HEAD sha·명령 줄·통과/실패 수·신규 실패 목록)를 state.json `build_gate` 에 적고 Verify 프롬프트에 그대로 넣음. Verify 는 전체 스위트를 다시 안 돎.
     - 대응표가 있으면 먼저 `gate-scope.mjs --base <기점> --ignore <TASKS>/<TSK>/` 호출.
     - `module` 이고 그 명령이 모두 모듈 기준선을 가졌으면 그 명령들만 `heavy.mjs bash -c '<명령>'` 으로 감싸 돎 (복합 명령도 한 슬롯에서).
     - 아니면(기준선 없는 명령, `full`) `full` 명령을 돎.
     - `none` 이면 위 그대로. `invalid` 면 사유를 한 줄 보고하고 위 그대로.
     - state.json 게이트 기록(`build_gate`·`verify_gate`·`refactor_gate`)에 `"scope":"module"` 또는 `"scope":"full"` 을 더함.
     기록 형식은 게이트마다(`build_gate`·`verify_gate`·`refactor_gate`) 같다:
     `{"head":"<게이트를 돈 HEAD sha>","cmds":[{"cwd":"<폴더>","cmd":"<명령 줄>","tests":<총수>,"failures":<실패 수>}],"new_failures":[…]}`.
     재실행을 생략한 게이트는 `"reused_from":"build_gate"` 를 더하고 `head` 는 Build 게이트의 sha 를 그대로 둔다
     (해소 워커가 `head` 로 어느 트리를 잰 기록인지 판단한다 — dflow-team resolve-prompt.md 「3」).

**다음 단계**: `orch/verify.md`.
