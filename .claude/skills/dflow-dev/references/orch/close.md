# /dflow-dev 단계 — 마감

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

## Phase 06 — 마감 (오케스트레이터 본인)

1. `git branch --show-current` 재확인 — `agent/` 브랜치 아니면 **push 금지, 중단·보고**.
2. 미 commit 잔여물 commit(파일명 명시) → `git push origin <agent 브랜치>`.
   - push 가 훅(G1~G4)에 거부되면 SKIP_GUARD 금지 — 중단하고 사람에게 보고
   - push 가 non-fast-forward 로 거부되면(원격 agent 브랜치에 사람 commit 있음 — 화면이 구현 중 push 를 말림) 받아 합치지 않고 `"{TSK} 원격 agent 브랜치에 사람 커밋 — 받은 뒤 --resume 하세요"` 로 알리고 끝냄
   - 네트워크로 실패하면 그 사실 알리고 끝냄 (다시 돌리면 이어 감)
   - 이 브랜치가 파일명이 곧 버전인 migration(Flyway `V<버전>__…` 등)을 더했으면 push 직전 dev-discipline 「마이그레이션 버전」 재확인 먼저
3. `dflow.mjs show <ref>` 로 spec 개정 여부 최종 확인(낡은 명세로 done 방지) → `<TASKS>/<TSK>/decisions.json` 작성 →
   `dflow.mjs done <ref> "<요약>" --auto-links --decisions <TASKS>/<TSK>/decisions.json`.
   - 마이그레이션 포함 작업은 done 요약에 명시: done 이후에도 스테이징 리허설 없이는 main 에 못 감 (`references/rare-cases.md` §대상 저장소)
   - decisions.json(결정 목록 정본) = design.md `## 담당자 확인 필요 결정` 절을 옮긴 JSON 배열
   - 항목: `key`(절의 번호 `D1`…)·`question`·`options`(2~6개)·`chosen`(택한 선택지의 0부터 센 색인)·`rationale`·`on_reject`
   - 절이 없거나 0건이면 `[]`
   - supervised 모드(플래그 없음)도 넘김 — 대화로 정한 결정은 확인 끝났으므로 `[]` (서버의 `null` = "구 도구" 뜻만)
   - 이 파일은 commit 안 함. done exit 0 이면 삭제, 실패하면 남겨 재시도 재료로 사용
   - `DECISIONS_INVALID …`(exit 2) = 파일 형식 오류 → 고쳐 다시 호출
   - stderr 경고 `DECISIONS_COUNT_MISMATCH`·`DECISIONS_SUFFIX_MISSING`(요약 접미사와 목록 건수 어긋남), `서버가 결정 목록을 모릅니다(계약 < 2.6)`(옛 서버라 요약 접미사로만 전달) = 보고는 된 것
   - done exit 12 (stderr 끝줄 `RUNNER_ACTIVE <runner>`) = 다른 PC 가 이 작업을 넘겨받음 → state.json 변경 없이 `"{TSK} 는 다른 PC(<runner>)가 돌리고 있어 멈춥니다."` 로 알리고 끝
   - exit 11 (`DESIGN_GATE <code>`) = 서버가 완료 보고 거부 (설계 검토 대기이거나 단계가 작업 중 아님) → 그 코드 적어 보고하고 끝
4. state.json 을 `phase=reported` 로 갱신 → 파일명 명시해 commit → `git push origin <agent 브랜치>`.
   - push 가 훅에 거부되면 우회 없이 보고
   - done 은 이미 보고됨 → 되돌리지 않음 (이 push 가 실패해도 `/dflow-merge` 의 원격 후보 조건은 phase 에 안 기대므로 승인 반영은 안 막힘)
   - 사용자에게 **"승인 대기로 보고했습니다"** 로 전달 (완료 아님)
   - **승인 = 사람이 D'Flow 웹에서 하는 비동기 이벤트 → 이 세션 안에서 못 기다림.** main 반영은 다음 `/dflow-dev` 호출의 Phase 01-가 스윕이나 `/dflow-merge` 가 처리 (둘 다 원격 agent 브랜치까지 봄)
   - `/dflow-poll` 의 승인 감지(exit 9)는 현재 작업트리 state.json 만 봄 → 다른 브랜치로 옮긴 뒤에는 이 작업의 승인을 알리지 못함

**다음 단계**: 없음. 여기서 끝.
