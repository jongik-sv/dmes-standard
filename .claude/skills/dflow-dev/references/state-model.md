# 상태 모델 상세 (state.json 필드·phase 값·중단 처리)

> 출처: SKILL.md 「상태 모델」 에서 옮김 (구조 압축). SKILL.md 에는 정본 규칙·기록 순서·재개 판정만 남는다. 아래 글은 원문 그대로.

- 로컬 `<TASKS>/<TSK>/state.json`:
  `{ "tsk", "order", "api_base", "phase", "baseline": {"failures": N, "tests": M}, "last": {"phase","event"} }`
  선택 필드(`model`·`build_unit`·`build_model_base`·`build_model_trial`·`verify_findings`·`verify_advisor`·`design_first`·`branch_base`·
  `risk`·게이트 기록 등) 뜻·쓰는 때 = 그 필드를 쓰는 단계 파일.
  `phase` 값: `ready`·`design`·`build`·`verify`·`refactor`·`reported`·**`rejected`**·`merged`.
  - `ready` = `dflow.mjs scaffold` 초기값 (주문 전 폴더 자리). 진행 중 phase 아님 → 스윕·재개 판정 건너뜀.
  - `rejected` = 서버가 반려 통지한 상태. 승인 대기(reported)와 구분해야 스윕이 안 헛돎.
  - `wait_pred` = 설계 마치고 선행 기다리며 멈춘 상태(「설계 선행」 2). 진행 중 phase 아님, heartbeat 훅도 안 보냄. 재개 = Phase 01 1번이 「설계 선행」 3 으로 보냄.
  - `wait_review` = 설계만(`--scope design`)으로 설계 마치고 사람의 「설계 승인」 기다리며 멈춘 상태. 진행 중 phase 아님, heartbeat 훅도 안 보냄. 이어 갈지 = 서버 설계 상태가 정함 (옛 서버는 `--scope build`, `orch/start.md`). 저절로 재개 안 됨.
  - **`order` = 전체 UUID(하이픈 포함 36자) 기록 — id8 금지.** 주문이 approved 되면 목록에서 빠져 id8 접두 해석이 죽음 → poll 승인 감지(exit 9)·머지 판정이 그 주문을 영영 못 봄 (2026-08-25 실증). 기존 파일이 id8 이면 발견 즉시 전체 UUID 로 고쳐 커밋.
  - **예외 = exit 10(중단됨)**: 사람이 D'Flow 에서 중단 (주문 `cancelled`, 위임 해제).
    - progress·heartbeat·done 중 어느 호출이든 exit 10 → **그 자리에서 멈춤** (다음 Phase·재시도 없음).
    - state.json `phase=cancelled` 로 변경, 로컬 커밋만 남김 (**push 안 함**, done 안 함).
    - 사용자에게 `"{TSK} 중단됨 — D'Flow 에서 사람이 멈췄습니다. 로컬 커밋만 남겼습니다."` 한 줄.
    - heartbeat 훅도 409 `cancelled` 받으면 `~/.dflow/hb/<order>.cancelled` 표식을 남기고 세션을 세움 (`continue:false`, 표식 있는 동안 도구마다).
    - 표식: `/dflow-team` 팀장이 spawn 직전에 서버 status(`ready`·`claimed`)로 확인하고 지움. 수동 `/dflow-dev` 세션은 사람이 지움.
    - `cancelled` = 진행 중 phase 아님 → 스윕·재개 판정 건너뜀.
  - exit 12(다른 PC 가 이어받음)도 그 자리에서 멈춤, state.json 은 안 바꿈 (`orch/start.md` 「서버 판단」).
  - `design-done`·`design-reopen` 도 같은 api_raw 경로 → exit 10·12 처리 동일.
  - **`api_base` = claim 시점 `DFLOW_API_BASE` 에서 끝 `/` 뺀 값** (dflow.mjs `base()` 와 같은 정규화). 스윕이 이 값으로 자기 D'Flow 인스턴스 후보만 고름. Phase 01 에서 state.json 처음 쓰는 곳(3번 `prepare`·스택 기록 또는 4번 기준선)에서 기록. 반려 재작업이 기존 state.json 에 `phase=rejected` 쓸 때 `api_base` 없으면 같은 규칙으로 채움.
