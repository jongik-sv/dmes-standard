# /dflow-dev 단계 — Verify — 감사와 Verify·Refactor 게이트

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

감사 템플릿: `node .claude/skills/dflow-dev/scripts/sections.mjs .claude/skills/dflow-dev/references/phase-prompt.md '감사 템플릿'`.

**Verify = 읽기 전용 감사자 셋 + 작성자 하나를 한 메시지에 동시에 띄움**(phase-verify.md). research/docs 특례 작업은 감사자 없이 작성자만 (첫 보고 = `PHASE_RESULT`).
- 감사자: 역할 spec·review·tests 셋. **`name` 붙이지 않고 띄움**
  - 이름 붙인 에이전트는 실행 환경에 따라 별도 pane·프로세스로 뜸. 감사자는 SendMessage·TaskStop 할 일 없고 보고하면 스스로 끝남
  - 부모 컨텍스트를 안 물려받는 새 서브에이전트(general-purpose, fork 금지)에 `model: "sonnet"`. 쓰기 금지 = 템플릿이 정함 (Explore 는 위치 찾기용이라 리뷰가 얕아짐)
  - 프롬프트 = phase-prompt.md 「감사 템플릿」 에 `{ROLE}`(spec·review·tests)·`{BASE}`(state.json `baseline.base`)·`{BUILD_HEAD}`(`build_gate.head`) 채운 것
  - 감사자는 commit 된 내용만 읽음 → 작성자의 변이·E2E 와 겹쳐도 됨
- 작성자: `<TSK>-verify`, 종전 Verify 템플릿·모델(sonnet) 그대로. 첫 보고 = `VERIFY_EXEC done|fail`, **이 보고로 회수 안 함.**
- 감사 보고(첫 줄 `AUDIT_RESULT <역할> <지적 수>`) 받으면 곧바로 `<TASKS>/<TSK>/audit-<역할>.md` 에 그대로 옮겨 적음 (git 에는 안 씀).
  - 같은 때 state.json `verify_findings.<역할>` 에 지적 수, `verify_advisor.audit` 에 감사 보고의 advisor 호출 수를 더함 — 감사 파일은 게이트 뒤 지워지므로 비교 지표(dev-discipline 「Build 모델 시험(build_model_trial)」)를 여기에 남김
  - 작성자 advisor 호출 수 = 보고(`VERIFY_EXEC`·`PHASE_RESULT`·재시도 보고) 받을 때마다 `verify_advisor.writer` 에 덮어씀 (보고가 누적 값. 작성자를 새로 띄웠으면 앞 작성자 마지막 값에 더함)
  - `verify_findings`(선택) = 감사자 역할별 지적 수 `{"spec":n,"review":n,"tests":n}`
  - `verify_advisor`(선택) = Verify advisor 호출 수 `{"writer":n,"audit":<감사자 셋의 합>}` (비교 지표 — 감사 파일은 지워짐)
- 작성자 `VERIFY_EXEC` + 감사 셋 모두 도착 시:
  - 지적 1건 이상 → 세 파일 지적을 모아 **같은 작성자에게 SendMessage 로** 전달, `PHASE_RESULT verify done|fail` 대기
  - 지적 0건 → `VERIFY_EXEC` 를 최종 보고로 받음 (`done` = 통과, `fail` = Verify 실패 — 「Phase 02~05 공통」 4번)
  - SendMessage 불가 → sonnet 작성자를 새로 띄우고 `{AUDIT_FINDINGS}` 에 지적 넣음
  - 이 왕복 = Verify 재시도 1회에 안 셈
- 재개 시 `audit-<역할>.md` 있는 감사자는 다시 띄우지 않음. Verify 게이트 판정 끝나면 `audit-*.md` 삭제.
- Verify 재시도(「Phase 02~05 공통」 4번) = 작성자에게만 이어 붙임, 감사자 재기동 안 함.

### Verify·Refactor 게이트

   - **Verify·Refactor 게이트**: 먼저 `git diff --name-only <Build 게이트 sha>..HEAD` 확인.
     - 바뀐 파일이 Task 문서(`<TASKS>/<TSK>/` 아래)와 `*.md` 뿐이고 `git status --porcelain` 도 Task 문서 밖에서 비어 있으면 전체 스위트 재실행 없이 Build 게이트 결과 그대로 사용
     - commit 밖에 남은 파일(되돌리지 못한 변이 등)은 Phase 06 이 commit 에 섞으므로 재실행 생략 근거 아님
     - 코드가 바뀌었으면 전체 스위트 실행
     - Refactor 가 commit 을 안 남겼으면 Refactor 게이트 없음
     - **대응표 있고 `build_gate.scope` = `module` 이면 Verify 게이트는 재실행 생략 없이 `full` 명령 한 번 실행** — merge 전 최종 증거 (Verify 서브에이전트가 끝난 뒤 오케스트레이터가 실행)
     - `build_gate.scope` = `full` 이면 위 생략 규칙 그대로
     - 코드가 바뀐 Refactor 게이트 = `full` 명령
   - **Verify 의 감사 확인**: 아래를 확인하고 없으면 실패.
     - build-log.md 「변이 검증 기록」 표가 「불변 규칙」 을 모두 덮는지
     - 화면 작업이면 E2E 결과가 보고에 있는지
     - 작성자 보고에 변이 표본으로 고른 행과 이유가 있는지
     - 감사 지적이 있었으면 지적마다 판정(수용·기각 사유)이 있는지
     - research/docs 특례 작업(dev-discipline 「research/docs 작업 특례」) = 표 대신 문서 검증 체크리스트 순회 확인

**다음 단계**: 수동 = `orch/refactor.md`, 팀원 모드 = `orch/close.md`(worker-mode.md 행 I).
