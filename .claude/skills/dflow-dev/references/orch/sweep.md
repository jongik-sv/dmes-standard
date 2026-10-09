# /dflow-dev 단계 — 승인 스윕(수동 착수 첫 단계)

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

## Phase 01-가 — 승인 스윕(머지, 오케스트레이터 본인)

<!-- worker:begin -->
> `--worker` 면 이 절 전체 건너뜀. 스윕은 팀장 몫이라는 이유 한 줄 남김(「--worker」 A).
<!-- worker:end -->

**claim 보다 먼저** 실행. `/dflow-merge` 절차를 그대로 흡수한 것 — 사람이 D'Flow 웹에서 승인해 놓고 아무도 main 에 반영을 안 시키는 게 병목이었음(2026-08-24). 대상 작업 claim 여부와 무관하게 매 호출마다 돎.

0. **사전 검사 — 후보 없으면 `/dflow-merge` 안 읽음.** 스크립트로 후보 먼저 확인 (서버 조회 없이, 후보 정의 = 아래 1번과 같음).
   ```bash
   node .claude/skills/dflow-merge/scripts/sweep-check.mjs --dev '<기본브랜치>'; echo "rc=$?"
   ```
   | 마지막 줄 | 처리 |
   |---|---|
   | `SWEEP_CANDIDATES n=<N> <id8…>` | `/dflow-merge` SKILL.md 를 읽고 1~6번 수행 |
   | `SWEEP_NONE` | `/dflow-merge` 안 읽고 1~5번 건너뜀. 6번 집계 = "스윕 생략(후보 없음)" 한 줄 |
   | `SWEEP_UNKNOWN <사유>`, 빈 출력, 스크립트 없음(옛 킷), `rc` ≠ 0 | **스윕 돌림**(fail-open) — `SWEEP_CANDIDATES` 와 같음. 사유 한 줄 보고 |

   글자 그대로 `SWEEP_NONE` 일 때만 건너뜀 (판정 불가를 후보 없음으로 뭉개면 승인된 작업이 merge 안 됨).
   - `SWEEP_NONE` 인데 출력에 `SWEEP_DIALECT_PENDING <sha>` 줄 있으면 방언 검증을 직접 한 번 호출하고 결과 줄을 6번 집계에 실음 (`/dflow-merge` 본문은 안 읽음)
   - 스윕을 돌리면 방언 검증 = `/dflow-merge` 「방언 검증」 이 스윕 끝에 수행
   - 이 판정 = `/dflow-team` SKILL.md 「4-0. 스윕을 부르는 규칙」 과 같음
   ```bash
   node .claude/skills/dflow-merge/scripts/dialect-check.mjs run --dev '<기본브랜치>'; echo "rc=$?"
   ```
1. **후보 식별**: `/dflow-merge` 1번(`.claude/skills/dflow-merge/references/sweep-scan.md` §1번)과 같게 로컬 + 원격으로 봄.
   - 로컬 후보: 대상 저장소 `dflow.mjs config tasks-dirs` 의 각 폴더 아래 `*/state.json` 중 `phase=reported` 전부
   - 원격 후보: 원격 `origin/agent/*` 브랜치 tip 의 state.json 중 브랜치 이름의 id8 과 `order` 가 일치하고 `phase` ≠ `merged`
   - 같은 order 가 로컬·원격 모두 있으면 로컬 후보 하나로 합침
   - `api_base` 가 현재 `DFLOW_API_BASE`(끝 `/` 제거)와 다르면 로컬이든 원격이든 "건너뜀(다른 D'Flow)" 집계. 원격에만 있는 후보는 값이 없어도 건너뜀
   - 명령·합치는 규칙 = `/dflow-merge` 1번(`.claude/skills/dflow-merge/references/sweep-scan.md`) 그대로
   - 원격에만 있는 후보의 merge 대상 = `origin/agent/<id8>-<slug>`
2~5. **판정·순서·머지·뒷정리**: `/dflow-merge` 2번(`.claude/skills/dflow-merge/references/sweep-scan.md`)·3~4번(`.claude/skills/dflow-merge/references/merge-exec.md`)·5번(`.claude/skills/dflow-merge/SKILL.md`) 그대로. 번호도 같음 → 이 문서의 "Phase 01-가 4번" = `/dflow-merge` 4번 (merge 절차를 두 곳에 안 적음).
6. **집계 보고**: 머지됨 / 승인 대기 / 건너뜀(사유) 한 줄씩 — 원래 요청받은 작업으로 넘어가기 전.

merge 대상이 wbs-web 자신이면 G1~G4 훅 제약이 여기도 적용.

**다음 단계**: `orch/start.md`.
