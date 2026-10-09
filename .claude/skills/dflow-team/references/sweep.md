# /dflow-team 승인 스윕 결과별 처리

SKILL.md 「4. 승인 스윕」 에서 옮긴 절(원문 그대로). 스윕 보고에 반려·push 실패·merge 충돌·`UNION_SET`·`DIALECT_*`·자동 merge 해제 있으면 Bash `cat` 으로 읽음.

## 스윕 결과별 처리

- **반려(머지됨)**: 자동 merge 로 기본 branch 에 들어간 작업 반려되면 `/dflow-merge` 가 "반려(머지됨)" + 그 위에 쌓였을 수 있는 작업 목록 출력.
  - 팀장 보고: "main 에 머지된 반려 작업: <id8> (<review_note>). 그 위에 쌓였을 수 있는 작업: <id8…>. 되돌리기(`git revert -m 1 <머지 커밋>`)나 수동 `/dflow-dev <id8>` 재작업을 사람이 고른다".
  - 그 id8 영구 제외에 넣음.
  - 팀장 직접 revert 안 함 (후속이 반려 코드에 기댈 수 있음).
- **반려**: 반려 보고된 id8 = "반려: 수동 `/dflow-dev <id8>` 대상 (<review_note>)" 로 보고 · 영구 제외. 재작업은 기존 agent branch 위에서 해야 하므로 자동 배정 안 함.
- **다중 경합**: 두 팀장 스윕이 같은 branch merge 하려 하면 나중 쪽 `git push` non-fast-forward 로 거부됨.
  - `/dflow-merge` 가 merge 직전 HEAD 로 `git reset --keep` 되돌림 → "push 실패(경합)" 보고 → 스윕 멈춤.
  - 다음 기상 스윕 fetch 부터 다시 함.
- **그 밖 push 실패**: `/dflow-merge` 가 연결·permission 오류(128 등) "push 실패" 보고 · 스윕 멈춤.
  - 팀장 = 그 스윕 "중간에 멈춤" 보고. 정상 완료로 적지 않음.
  - merge 안 된 후보 = 다음 기상 스윕이 다시 봄.
- **push 훅 거부**: `/dflow-merge` 가 `git reset --keep` 되돌림 → "push 실패(훅)" 보고. 그 작업과 후손만 빼고 다음 후보로 감.
  - 팀장 = 그 id8 "사람이 머지해야 함" 보고.
- **merge 충돌**: `/dflow-merge` 가 충돌 파일 목록 읽고 `git merge --abort` 로 되돌린 뒤 "머지 실패(충돌)" 보고(파일 목록 `<파일,…>` 동반) → 다음 후보로 감.
  - migration 버전 중복·역순 도착(`/dflow-merge` 「마이그레이션 버전 관문」)도 merge 전에 같은 문구로 보고됨 (끝에 `(마이그레이션 버전)`, 파일 = 이 branch 가 추가한 migration).
  - 팀장 = 그 id8 → 「4-1. 머지 충돌 해소」.
  - 해소 못 하는 경우(다른 신원의 주문·상한·재시도 불가)만 "사람이 머지해야 함" 보고.
- **공용 결정 기록(`decisions.md`)**: 팀원 = 전역 번호 대신 임시 ID `D-<TSK>-<n>` 사용 (dev-discipline 「공용 결정 기록(decisions.md)의 번호」).
  - `/dflow-merge` 가 merge 하며 그 파일 충돌 기계적으로 풀고 번호 매김 (「결정 번호 매김」).
  - 대상 리포 `merge=union` 금지 — 같은 필드 줄 가진 블록을 섞음.
  - 스윕 보고에 `UNION_SET <파일>` 있으면 "대상 리포 `.gitattributes` 에서 decisions.md 의 `merge=union` 을 빼야 함" 으로 사람에게 보고.
  - 팀장 그 파일 직접 고쳐 commit 안 함 (대상 리포 설정 변경 = 사람 몫).
  - "결정 번호 매김 실패" = 보고만 (다음 merge 가 다시 매김).
  - 직접 매긴 전역 번호 겹쳐 옮겨졌으면(`DUP_RENUMBERED`) 결과만 알림.
  - `DUP_REF_AMBIGUOUS`·`DUP_LEFT`·`DECISIONS_SEQ` = 그 위치 그대로 사람에게 넘김 (팀장 손으로 안 고침).
- 로컬 agent branch 삭제가 branch 없음·"checked out" 오류로 실패하면 `/dflow-merge` 건너뛰고 보고. 그 worktree = 결과 처리·고아 스캔이 정리.
- 승인 대기·건너뜀(서버 <status>·조회 실패·다른 D'Flow·조상 미승인·기점 미반영·승인 뒤 변경·승인 뒤 변경 확인 불가)은 보고만. 자동 merge 의 "머지됨(승인 전)"·"승인 반영(이미 머지됨)"·"승인 대기(머지됨)" 도 한 줄씩 보고.
- **자동 merge 뒤 일시 제외 해제**: 스윕이 "머지됨(승인 전)"·"머지됨" 을 한 건이라도 냈거나 해소 워커가 `resolved` 로 끝났으면(「5-2」):
  - 일시 제외 중 사유 선행 계열(선행 미충족·선행 미승인·선행 승인 대기·claim exit 4·공통 기점 없음·선행 미반영)인 id8 목록에서 뺌.
  - restart 조건(「2-1」) 맞으면 줄어든 `--exclude-temp` 로 poll 새로 띄움.
  - 푼 작업 팀장 직접 안 띄움. poll 이 다시 돌려준 것만 띄움 (담당자 변경·다른 팀장 점유 거르는 곳 = poll `--scope assigned` 조회).
  - 떠 있던 옛 poll 이 옛 목록으로 한 번 더 돌아도 poll exit 0 처리 대조·spawn 전 확인이 이중 spawn 을 막음 (「2-3」 5번).
- `team.sweep`(merged, waiting, rejected, resolved 개수) 기록.
  - `resolved` = 직전 스윕 뒤 해소 워커 `resolved` 가 조상 확인까지 통과한 수. 기억으로 세지 않음 — `lead-state.mjs` `CONFLICT_CLEARED resolved=` 사용.
  - `merged` 에 승인 전 merge 포함, `waiting` 에 승인 대기(머지됨) 포함, `rejected` 에 반려(머지됨) 포함.
- **방언 검증**: `/dflow-merge` 가 스윕 끝에 「방언 검증」 1회 실행 (`.dflow`·`.dflow.local` 에 `dialect_check` 있을 때만, merge 마다 아니라 스윕마다 1회). 결과 줄 `DIALECT_*` 를 보고에 실음. 팀장 처리:
  - 방언 검증 = 자동 되돌리기·Task 재오픈 안 함. 어느 merge 가 깨뜨렸는지·되돌리기 = 사람 판단.
  - `DIALECT_FAIL`: 사람에게 "방언 검증 실패 <sha>: 직전 통과 <since> 이후 머지된 Task <tasks>. 도커 금지로 확인하지 못한 항목이 있는 Task <unverified>. 로그 <log>" 로 알림.
    - `docs/dflow-team/issues.md` 에 같은 내용 항목 하나로 붙임 (`DIALECT_UNVERIFIED` 줄도 함께).
    - `team.issue` 기록: id8 = `dialect`, `tsk` = `-`, `summary` = 위 알림 문장, `decision` = `사람 판단(자동 되돌리기·재오픈 없음)`.
    - `decision` 에 `pending` 금지 (재구성이 팀원 이슈로 읽음).
  - `DIALECT_DEFERRED docker-off … notify=1`: "방언 검증 보류(도커 꺼짐): <sha>. 도커를 켜면 다음 스윕이 같은 커밋을 돌린다" 로 알리고 issues.md 한 줄 남김.
    - `notify=0` 이면 알리지 않음.
    - 팀장 도커 런타임 안 켬.
  - `DIALECT_PASS`: 한 줄 보고. `unverified=` ≠ `-` 면 "방언 검증 통과. 도커 금지로 확인하지 못한 항목이 있던 Task: <unverified>" 붙여 사람이 대조하게 함.
  - `DIALECT_ERROR`: `notify=1` 이거나 `notify=` 없으면(설정·fetch 오류) "방언 검증을 돌리지 못함: <줄>" 로 알리고 issues.md 한 줄 남김.
    - 다음 스윕이 다시 시도.
    - 명령 설정(`dialect_check`, PC 전용 값) = 사람이 고침.
  - `DIALECT_BUSY`·`DIALECT_RUNNING`·`DIALECT_SKIP`·`DIALECT_NONE`: 보고 안 함. BUSY = 다음 스윕이 다시 시도.
  - 방언 검증 = 팀장 Bash 1회로 돎 (timeout 600000).
    - 10분 넘겨 하네스가 background 로 옮기면 완료 알림으로 결과 수신.
    - context 압축 등으로 놓쳤으면 `node .claude/skills/dflow-merge/scripts/dialect-check.mjs status --dev <기본브랜치>` 로 마지막 결과 읽음.
    - 도는 동안 겹친 스윕 = `DIALECT_RUNNING`.
- merge 자리 = 팀장 checkout 상태로 갈림 (`/dflow-merge` 4번).
  - 기본 branch 위 팀장 → 그 checkout 에서 merge.
  - detached HEAD 팀장 → 임시 merge worktree `<MAIN>/.claude/worktrees/dflow-merge` 에서 merge, `HEAD:<기본브랜치>` 로 push.
- detached HEAD 팀장 = 스윕 끝나면 팀장 checkout 최신으로 옮김 (옛 commit state.json 이 `LEGACY_REPORTED` 안 부르게). checkout 깨끗할 때만.
  ```bash
  [ -z "$(git branch --show-current)" ] && [ -z "$(git status --porcelain)" ] && git switch -q --detach origin/<기본브랜치>
  ```

## 4-0. SWEEP_NONE 갈래·예외

3. `SWEEP_NONE` 이어도 하는 일 (스윕에 묶여 있던 일이라 안 불렀다고 빠뜨리지 않음):
   - 출력에 `SWEEP_DIALECT_PENDING <sha>` 줄 있으면 방언 검증 직접 1회 호출. 결과 줄 = 이 문서 「스윕 결과별 처리」 방언 검증 규칙대로 처리. `/dflow-merge` 본문 재적재 방지 — 스크립트만 호출.
     ```bash
     node .claude/skills/dflow-merge/scripts/dialect-check.mjs run --dev '<기본브랜치>'; echo "rc=$?"
     ```
   - merge-conflict.md 「5. 사람 머지 감지」. 사람이 손으로 merge 하면 agent branch 가 지워져 후보 없음 → 스윕에 묶어 두면 `merge_conflict` 표시가 영영 남음.
   - SKILL.md 「4」 의 detached HEAD 재-detach 블록. 팀장 checkout 이 옛 commit 에 머물지 않게 함.
   - 해소 `resolved` 있었으면 이 문서 「스윕 결과별 처리」 일시 제외 해제(선행 계열) 수행.
   - `team.sweep` 기록 안 함 (스윕 안 했음). `resolved` 개수 = 다음에 실제로 도는 스윕의 `team.sweep` 에 실음.
4. 예외 — 사전 검사 없이 늘 부름:
   - 「1. 시작」 첫 스윕과 「7. 마감」 마지막 스윕. 실행마다 1회뿐. 그 보고 = 사람이 그 시점에 읽는 현황. 후보 없으면 `/dflow-merge` 스스로 0건 종료.
   - `needs-merge` 결과가 온 기상. 워커가 서버 approved 확인한 merge 대상 있어 검사는 어차피 후보를 냄.
   - 사람이 "스윕해"·"머지해" 처럼 직접 요청한 경우.

   위 예외여도 한 기상에 최대 1회는 같음 (1번).
