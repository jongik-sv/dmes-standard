# /dflow-merge 머지 실행 (순서·머지·트레일러)

SKILL.md 「절차」 3번(순서)·4번(머지)에서 옮김. 읽는 때:
- 스윕 첫 merge **전**
- `unapproved.md` 「승인 반영」 commit push 전 (merge 대상 0건이어도)
- merge 대상도 승인 반영 commit 도 없으면 안 읽음.

 아래 「N번」 = SKILL.md 「절차」 번호, 「1번」·「2번」 = `sweep-scan.md`.
본문의 「결정 번호 매김」·「마이그레이션 버전 관문」 = 이 문서 끝 「실행 규칙」 절. 「방언 검증」 = `dialect.md`.

## 3번 순서: 스택은 조상 먼저

3. **순서: 스택은 조상 먼저**: 대상이 여럿이면 브랜치 tip 이 아니라 후보 state.json 의 `branch_base` 로 조상 관계를 판정해 조상부터 머지.
   - 선행이 approved 가 아니어서 조상 브랜치를 머지할 수 없으면 그 위 후손도 이번엔 머지 안 함. 선행을 건너뛰고 후손만 합치면 미승인 커밋이 main 에 섞임.
   - `--on-report` 면 "approved 가 아니어서" = "2번의 머지 대상이 아니어서" (반려·조회 실패 등).
   - `branch_base`(기점 커밋. `/dflow-dev` 「--worker」 B 면 선행 완료 증적의 head_sha)가 없거나 `origin/<기본브랜치>` 의 조상이면 스택 아님.
   - 아니면 스택. 선행 = `git merge-base --is-ancestor <branch_base> <그 후보의 머지 대상>` 이 참인 다른 후보. 그런 선행 후보가 없으면 "건너뜀(기점 미반영)" 보고.
   - `branch_base` 가 커밋으로 안 풀리면(옛 state.json 은 브랜치 이름일 수 있음) 그 후보만 브랜치 tip 끼리 `git merge-base --is-ancestor A B` 로 판정.
   - **차분 백스톱**: `branch_base` 판정과 별도로, `git diff --name-only origin/<기본브랜치>...<그 후보의 머지 대상> --` 뒤에 1번과 같이 구성한 pathspec 을 붙인 결과에 그 작업 외의 state.json 이 있으면, 그 파일(`git show <그 후보의 머지 대상>:<경로>`)의 `order` 가 가리키는 작업들도 선행으로 보고 위 순서·승인 판정에 넣음.
     - 그 선행이 이번에 머지되지 않았으면 후손을 건너뜀.
     - 후보에 없으면 "건너뜀(기점 미반영)" 보고.

## 4번 머지 (단계 1-5·트레일러 고정)

4. **머지**: 먼저 머지 자리 결정.
   - 호출한 체크아웃의 현재 브랜치 = `<기본브랜치>` → 그 체크아웃에서 아래 블록 그대로 머지.
   - 아니면(detached HEAD·다른 브랜치) **임시 머지 워크트리** `<W>` 에서 머지. 스윕 시작 때 `references/merge-worktree.md` 를 읽고 따름. 호출한 체크아웃은 건드리지 않음.
   ```bash
   git fetch origin && git switch <기본브랜치> && git pull --ff-only origin <기본브랜치>
   git rev-parse HEAD                      # 머지 직전 HEAD. 값을 기록해 둔다
   git merge-base --is-ancestor <증적 head_sha> <머지 대상>   # 증적에 head_sha 가 있을 때만. 0 이 아니면(커밋이 없거나 조상이 아님) 머지하지 않는다
   git diff --name-only <증적 head_sha>..<머지 대상>   # 증적에 head_sha 가 있을 때만. 실패하면 머지하지 않고, 그 작업의 state.json 뿐이거나 비어 있어야 머지한다
   git merge --no-ff --no-commit <머지 대상> -m "merge: <TSK> <제목> (approved)" -m "DFlow-Order: <order>"   # 로컬 후보 agent/<id8>-<slug>, 원격 전용 후보 origin/agent/<id8>-<slug>. 승인 전 머지는 (reported, 승인 전). <order> 는 그 후보 state.json 의 order. 머지 커밋은 아직 만들지 않는다(아래 commit 한 번에 만든다). git merge 는 --trailer 를 모른다(git commit 전용) — 둘째 -m 이 빈 줄 뒤 문단이 되어 MERGE_MSG 에 남고 트레일러로 인식된다
   node .claude/skills/dflow-merge/scripts/decisions.mjs renumber --no-commit --tsk <TSK> --order <order>   # 「결정 번호 매김」. 고친 파일을 stage 만 한다(STAGED <n>). 임시 ID 가 없으면 NO_TEMP_IDS 로 아무것도 하지 않는다
   # state.json 을 phase=merged 로 갱신(승인 전 머지면 unapproved: true 도). 파일은 <후보 state.json 경로>
   git add "<후보 state.json 경로>" && git commit --no-edit --cleanup=strip \
     && git push origin <기본브랜치>   # 머지 커밋 하나에 번호 매김·phase=merged 가 모두 들어간다. add·commit 이 실패하면(경로 없음 등) && 사슬이 끊겨 push 하지 않는다. add 실패면 git merge --abort 로 머지 전으로 되돌린다
   ```
   후보마다 다음 순서.
   1. 블록 첫 줄(fetch·switch·pull) 뒤 머지 직전 HEAD 기록.
   2. **승인 뒤 변경 확인**(승인 전 머지면 "보고 뒤 변경 확인". 규칙 같고 증적은 완료 보고의 것):
      - 머지 조건: `<증적 head_sha>`(1번 show 출력의 `head_sha`)가 로컬에 있음 + 머지 대상의 조상(`git merge-base --is-ancestor <증적 head_sha> <머지 대상>` 참) + `git diff --name-only <증적 head_sha>..<머지 대상>` 성공 + 결과가 그 작업의 `<TASKS>/<TSK>/state.json` 뿐이거나 빔.
      - 다른 파일 있음 → "건너뜀(승인 뒤 변경)".
      - head_sha 가 로컬에 없음 / 머지 대상의 조상 아님 / `git diff` 실패 → "건너뜀(승인 뒤 변경 확인 불가)".
      - 위 보고 후 다음 후보로.
      - 증적에 `head_sha` 자체가 없는 옛 완료 보고 → 이 확인 건너뛰고 머지, 보고에 "승인 뒤 변경 확인 불가" 추가.

      **강제 진행 스텁 관문**: 개발 브랜치 = 운영 브랜치(`dflow.mjs branch dev` 와 `dflow.mjs branch release` 가 같은 값)면 머지 전에 `dflow.mjs stub-check <머지 대상>` 실행.
      - exit 4 → 머지 안 함. 「스텁 잔존 — 개발 브랜치 미설정 리포라 운영에 스텁이 들어간다」 보고 후 다음 후보로.
      - 두 브랜치가 다르면 이 검사 안 함.

      **마이그레이션 버전 관문**: 머지 전에 `node .claude/skills/dflow-merge/scripts/migration-check.mjs HEAD <머지 대상>` 실행(「마이그레이션 버전 관문」, 임시 머지 워크트리면 `-C "$W"`).
      - exit 1(버전 중복·역순 도착) → 머지 안 함. `머지 실패(충돌) <MIGRATION_FILES 의 파일,…> (마이그레이션 버전)` 보고 후 다음 후보로. 팀장은 텍스트 충돌과 똑같이 해소 워커에 넘김.
      - exit 2(판정 불가) → 머지 안 함. "건너뜀(마이그레이션 검사 실패)" 보고.
   3. `git merge --no-ff --no-commit <머지 대상>`. 머지 커밋은 아직 만들지 않음(4단계 commit 한 번에 만듦). 충돌하면 먼저 공용 결정 기록(`decisions.md`) 충돌만 스크립트로 해소(「결정 번호 매김」).
      - 남은 충돌 없음 → 커밋 없이 3-1 로. (`-m` 두 문단과 트레일러는 `MERGE_MSG` 에 남아 있고, 4단계 `--cleanup=strip` 이 `# Conflicts:` 주석을 지움.)
      - 남은 충돌 있음 → 목록을 읽은 뒤 `git merge --abort` 로 되돌리고 "머지 실패(충돌)" 보고 후 다음 후보로. 충돌 상태로 두지 않음.
      - 사람이 그 자리에서 충돌을 손으로 풀고 `git merge --abort` 대신 직접 완성하는 경로도 있음. 이 경로도 3-1·4단계(번호 매김·state.json 갱신)를 거친 뒤 `git commit` **한 번**으로 완성하고 「트레일러 고정」 적용.
      - 충돌 파일 목록은 `--abort` **전에** 읽음(뒤에는 빔). 보고 줄 = `머지 실패(충돌) <파일,…>` (스크립트가 푼 decisions.md 제외).
      - 임시 merge worktree 에서는 git 명령에 `git -C "$W"`, 스크립트에 `-C "$W"` 붙임.
      ```bash
      node .claude/skills/dflow-merge/scripts/decisions.mjs merge-conflicts   # 공용 decisions.md 충돌만 푼다. DECISIONS_RESOLVED·DECISIONS_LEFT
      git diff --name-only --diff-filter=U | paste -sd, -   # 남은 충돌 파일 목록(쉼표로 이음). 비었으면 아래 commit, 아니면 --abort
      git merge --abort
      ```
      ```bash
      git commit --no-edit --cleanup=strip   # 남은 충돌이 없을 때만. 머지 완성
      ```
   3-1. **결정 번호 매김**: 머지가 멈춘 채(커밋 전) `decisions.mjs renumber --no-commit --tsk <TSK> --order <order>` 실행(「결정 번호 매김」).
      - `NO_TEMP_IDS` → 바뀐 것 없음.
      - `STAGED <n>` → 고친 파일 n개가 stage 됨. 커밋은 안 만듦. 4단계 commit 에 함께 담김(별도 번호 매김 커밋 없음).
      - `RENUMBER_DIRTY`·`RENUMBER_FAILED …` → 머지를 막지 않음(스크립트가 자기 변경을 머지 도중 index 로 되돌림). 4단계로 가고 보고에 "결정 번호 매김 실패(<출력>)" 추가.
      - `UNION_SET`·`DUP_*`·`DECISIONS_SEQ` 줄도 머지를 막지 않음(6번대로 싣음).
      - 번호 매김 실패 + 그 머지에 중복 있었음 → "결정 번호 중복 — 사람이 고쳐야 함" 보고.
   4. state.json 을 `phase=merged` 로 갱신해 **같은 머지 커밋에 담음**(파일명 명시 `git add`, 이어서 `git commit --no-edit --cleanup=strip` 한 번). 제목은 `merge: <TSK> …` 그대로, 별도 `chore(<TSK>): phase=merged` 커밋 없음. `<후보 state.json 경로>` = **1번 후보 식별이 이미 찾은 그 경로**(로컬 `$f`, 원격 `$p`). 여기서 `dflow.mjs taskdir` 다시 부르지 않음.
      - `git add` 실패(경로 빔 / 그 시점 트리에 파일 없음 / stage 안 됨) → **커밋·push 안 함**. `git merge --abort` 로 머지 전으로 되돌리고 "머지 실패(state.json 경로)" 보고 후 다음 후보로.
      - 이 커밋을 **push 전에** 만듦.
      - 승인 전 머지면 같은 커밋에 `unapproved: true` 도 넣음.
      - `phase` 를 `merged` 아닌 새 값으로 만들지 않음(행 G 의 반영 확인과 `poll.mjs` 의 반려 감지가 `merged` 를 봄).
   5. `git push origin <기본브랜치>` 로 머지 커밋(번호 매김·`phase=merged` 포함)을 올림. push 실패 시 먼저 `git reset --keep <기록한 HEAD>` 로 되돌리고, `references/push-fail.md` 를 읽어 거부 모양(경합·훅·그 밖)으로 분류. `origin` 으로 리셋 금지.

   한 작업 = 작업 커밋 1개(`/dflow-dev` 완료 때 squash) + 머지 커밋 1개. 번호 매김·`phase=merged` 를 별도 커밋으로 남기지 않음.

   `--no-ff` 고정 — 작업 단위 경계가 merge commit 으로 남아야 추적 가능. push 가 훅에 거부되면 우회 금지. 되돌리고 보고 → 그 작업과 후손만 빼는 절차 = `references/push-fail.md`.

   **트레일러 고정**: 이 스킬이 만드는 모든 머지 커밋에 `DFlow-Order: <order>` 트레일러를 붙임(`<order>` = 그 후보 state.json 의 `order`, 주문 UUID).
   - `git merge` 에는 `--trailer` 가 없으므로(`git commit` 전용) 3단계는 위 블록처럼 둘째 `-m "DFlow-Order: <order>"` 사용(빈 줄 뒤 단독 문단이 `MERGE_MSG` 에 남아 4단계 `git commit --no-edit` 에서 트레일러가 됨).
   - 충돌을 손으로 풀어 직접 `git commit` 으로 완성할 때는 `git commit --trailer "DFlow-Order: <order>"`.
   - 어느 경로든 결과 메시지에 이 트레일러가 있어야 함 — `/dflow-dev` 「--worker」 행 G 의 반영 확인이 보는 증거. "자동 스윕이 아니다" 는 빠뜨릴 이유가 안 됨.

## 실행 규칙 (결정 번호 매김 · 마이그레이션 버전 관문)

머지 3단계·3-1단계·2단계 관문, 해소 머지(`resolve.md`)는 `decisions.mjs`·`migration-check.mjs` 호출 전 이 절을 따름. 출력 줄 뜻·사유 코드·판정 상세 → `script-details.md` (해설·설정 변경 때만).

### 결정 번호 매김

공용 결정 기록(`docs/<모듈>/decisions.md` 등, `## D-NNN (<UTC 타임스탬프>)` 블록 추가 전용 기록) 전역 번호는 merge 하는 이 스킬이 매김. agent branch 는 Task 범위 임시 ID `D-<TSK>-<n>` 만 사용(dev-discipline 「공용 결정 기록(decisions.md)의 번호」).
번호 수동 매김 금지. 도구 = `node .claude/skills/dflow-merge/scripts/decisions.mjs` 하나, merge 자리 최상위에서 실행(임시 merge worktree 면 `-C "$W"`).

- **충돌 풀기**(`merge-conflicts`, 4번 3단계·해소 머지 4번): 충돌한 decisions.md 만 블록 단위로 풂(`DECISIONS_RESOLVED`). 못 푼 `DECISIONS_LEFT` 파일은 다른 충돌과 같이 처리.
- **번호 매김**(`renumber --no-commit`, 4번 3-1단계·해소 머지 6번 앞): 임시 ID → 다음 전역 번호로 바꾸고 stage 만 함(커밋은 호출자의 머지 커밋 하나). 첫 단계에서 **전역 번호 중복**(두 branch 가 같은 `## D-NNN` 보유)을 충돌 여부 무관하게 merge 대상 쪽만 옮겨 바로잡음.
- **`merge=union` 금지.** 이미 걸려 있으면 `renumber` 가 `UNION_SET <파일>` 로 알림. 대상 리포 `.gitattributes` 에서 그 줄 빼라고 보고.

### 마이그레이션 버전 관문

Flyway 처럼 파일명 = 버전인 migration(`V<버전>__<설명>.sql`): 병렬 branch 가 같은 번호 고르면 **git 충돌 없이** merge 되고 개발 branch 의 서버 start 가 깨짐.
- merge 전 합친 트리를 `node .claude/skills/dflow-merge/scripts/migration-check.mjs` 로 검사.
- 걸리면 충돌 취급. 해소 워커(`--resolve`, `resolve-prompt.md` 「해소 규약」 R9)가 다음 번호로 재채번.
- 스윕(4번 2단계) = `migration-check.mjs HEAD <머지 대상>`. 해소 머지(`references/resolve.md` 4·5번) = `migration-check.mjs --staged`.
- 대상 리포 Flyway `outOfOrder=true` 면 팀장 세션 환경에 `DFLOW_MIGRATION_OUT_OF_ORDER=1`(또는 `--allow-out-of-order`) 설정 → 역순 검사만 끔. 중복 검사는 안 끔.
