# /dflow-dev 단계 — 마감

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

## Phase 06 — 마감 (오케스트레이터 본인)

1. `git branch --show-current` 재확인 — `agent/` branch 아니면 **push 금지, 중단·보고**.
2. 미 commit 잔여물 commit(파일명 명시) → **아직 push·보고 안 한 commit 만 한 커밋으로 합침** → push.
   - 이미 push 했거나 보고한 commit(설계 push, 보고한 head_sha)은 다시 쓰지 않음. 되감기·강제 push 금지. 합치기 전에는 이번 head_sha 를 어디에도 기록·보고하지 않음
   - (가) `git fetch origin <agent 브랜치>` — 원격에 브랜치가 없으면 건너뜀. 있으면 `git merge-base --is-ancestor origin/<agent 브랜치> HEAD` 확인, 아니면(원격에 사람 commit) 합치지 않고 아래 non-fast-forward 문구로 끝냄. 이때 원격 tip `<T>` 기록
   - (나) state.json 을 미리 `phase=reported` 로 쓰고 파일명 명시 commit(`DFlow-Order` 트레일러). `reported` 를 별도 commit 으로 남기지 않기 위함 — head_sha = push 한 최종 tip
   - (다) 합칠 범위(`--onto`)
     - agent 브랜치가 원격에 있음 → `--onto <T>` (T 뒤의 로컬 commit 만 접힘. 반려 재작업이면 T = 보고한 head_sha)
     - 원격에 없음 → `--onto origin/<기본브랜치>` (먼저 `git fetch origin`)
     - `node .claude/skills/_shared/node/squash-branch.mjs --onto <위 값> --subject "<type>(<TSK>): <작업 제목>"`
     - `SQUASH_OK`·`SQUASH_ALREADY_ONE` → 계속. 이후 이 branch 에 commit 금지(done 성공 전까지)
     - `SQUASH_DIRTY`·`SQUASH_TREE_MISMATCH`·`SQUASH_GIT_FAILED`·`SQUASH_NO_ONTO` → 중단·보고(원문 줄 첨부). `SQUASH_TREE_MISMATCH` 는 스크립트가 원래 HEAD 로 복원함
   - (라) `git push origin <agent 브랜치>` — 항상 일반 push (합친 commit 은 T 의 자손이라 fast-forward)
   - push 가 훅(G1-G4)에 거부되면 SKIP_GUARD 금지 — 중단하고 사람에게 보고
   - push 가 non-fast-forward 로 거부되면(원격 agent branch 에 사람 commit 있음 — 화면이 구현 중 push 를 말림) 받아 합치지 않고 `"{TSK} 원격 agent 브랜치에 사람 커밋 — 받은 뒤 --resume 하세요"` 로 알리고 끝냄
   - 네트워크로 실패하면 그 사실 알리고 끝냄 (다시 돌리면 이어 감: 합친 commit 은 `SQUASH_ALREADY_ONE`)
   - 결과 모양: 설계 push 가 있었으면 설계 commit + 마감 commit (+ 반려 재작업 commit) 으로 남을 수 있음. 아무것도 다시 쓰이지 않음
   - 이 branch 가 파일명이 곧 버전인 migration(Flyway `V<버전>__…` 등)을 더했으면 push 직전 dev-discipline 「마이그레이션 버전」 재확인 먼저
3. `dflow.mjs show <ref>` 로 spec 개정 여부 최종 확인(낡은 명세로 done 방지) → `<TASKS>/<TSK>/decisions.json` 작성 →
   `dflow.mjs done <ref> "<요약>" --auto-links --decisions <TASKS>/<TSK>/decisions.json`.
   - migration 포함 작업은 done 요약에 명시: done 이후에도 스테이징 리허설 없이는 main 에 못 감 (`references/rare-cases.md` §대상 저장소)
   - decisions.json(결정 목록 정본) = design.md `## 담당자 확인 필요 결정` 절을 옮긴 JSON 배열
   - 항목: `key`(절의 번호 `D1`…)·`question`·`options`(2-6개)·`chosen`(택한 선택지의 0부터 센 색인)·`rationale`·`on_reject`
   - 절 없거나 0건이면 `[]`
   - supervised 모드(플래그 없음)도 넘김 — 대화로 정한 결정은 확인 끝났으므로 `[]` (서버의 `null` = "구 도구" 뜻만)
   - 이 파일은 commit 안 함. done exit 0 이면 삭제, 실패하면 남겨 재시도 재료로 사용
   - `DECISIONS_INVALID …`(exit 2) = 파일 형식 오류 → 고쳐 다시 호출
   - stderr 경고 `DECISIONS_COUNT_MISMATCH`·`DECISIONS_SUFFIX_MISSING`(요약 접미사와 목록 건수 어긋남), `서버가 결정 목록을 모릅니다(계약 < 2.6)`(옛 서버라 요약 접미사로만 전달) = 보고는 된 것
   - done exit 12 (stderr 끝줄 `RUNNER_ACTIVE <runner>`) = 다른 PC 가 이 작업 넘겨받음 → state.json 변경 없이 `"{TSK} 는 다른 PC(<runner>)가 돌리고 있어 멈춥니다."` 로 알리고 끝
   - exit 11 (`DESIGN_GATE <code>`) = 서버가 완료 보고 거부 (설계 검토 대기이거나 단계가 작업 중 아님) → 그 코드 적어 보고하고 끝
4. done exit 0 → state.json 은 2번 (나)에서 이미 `phase=reported` 로 합친 commit 에 들어 있음. **추가 commit·push 없음** (별도 `reported` commit 이 head_sha 뒤에 쌓이지 않게).
   - done 이 0 이 아니게 끝나면 state.json `phase` 를 2번 (나) 이전 값(`verify`·`refactor`)으로 되돌려 둠(commit 안 함. 다음 마감이 commit 해 다시 합침)
   - 사용자에게 **"승인 대기로 보고했습니다"** 로 전달 (완료 아님)
   - **승인 = 사람이 D'Flow 웹에서 하는 비동기 이벤트 → 이 세션 안에서 못 기다림.** main 반영은 다음 `/dflow-dev` 호출의 Phase 01-가 스윕이나 `/dflow-merge` 가 처리 (둘 다 원격 agent branch 까지 봄)
   - `/dflow-poll` 의 승인 감지(exit 9)는 현재 worktree state.json 만 봄 → 다른 branch 로 옮긴 뒤에는 이 작업의 승인을 알리지 못함
   - 반려 재작업 뒤 마감도 이 절 그대로(T = 보고한 head_sha 라 재작업 commit 만 하나로 합침)

**다음 단계**: 없음. 여기서 끝.
