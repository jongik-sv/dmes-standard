# /dflow-merge 해소 머지(`--resolve`)

`/dflow-merge --resolve <ref> --attempt <n>` 일 때만 읽음. SKILL.md 공통부(「절차」·「금지」)와 함께 씀. 아래 "1·2단계", "3단계", "4단계 N번", "5번 뒷정리" = SKILL.md 「절차」 번호.
「방언 검증」·6번 보고는 안 탐.
SKILL.md 「절차」 전문이 옮겨진 자리 (이 문서가 SKILL.md 해당 절을 인용하면 아래를 읽음):
- 1·2번 = `references/sweep-scan.md`
- 3·4번과 「트레일러 고정」 = `references/merge-exec.md`
- 「결정 번호 매김」·「마이그레이션 버전 관문」 = `references/merge-exec.md` 「실행 규칙」
- 해소 워커는 이 셋을 해당 번호 따르기 전에 읽음.

## 해소 머지

- 대상: 팀장이 띄운 해소 워커(`dflow-team/references/resolve-prompt.md`)만 이 절을 탐
- 충돌 작업 한 건을 **개발 branch 위 merge commit 안에서** 품
- agent branch 수정 금지 (다음 스윕 「승인 뒤 변경 확인」 에 걸림). rebase 금지
- 결과 = 마지막 출력 줄 **하나** (10번 「결과 줄」)
- 쓰는 파일 = 호출한 worktree 안뿐. 팀장 체크아웃 수정 금지

1. **후보·판정**: SKILL.md 「절차」 1·2단계 그대로. 후보 = 인자 ref 하나뿐
   - 2단계가 머지 대상 아니라고 판정하면 (승인 대기·반려·이미 머지됨·조회 실패 등) 해소 없이 `RESOLVE_SKIPPED <그 보고 문구>` 로 끝
   - 3단계 스택 판정에서 선행이 개발 브랜치에 없으면 `RESOLVE_SKIPPED 건너뜀(기점 미반영)`. 선행까지 머지 금지
2. merge 자리 = **호출한 worktree 자신**. 임시 merge worktree `<ROOT>/.claude/worktrees/dflow-merge` 사용 금지 (팀장 스윕과 경로 겹침). 이 worktree 는 `origin/<기본브랜치>` 에 detach 상태여야 함
   ```bash
   git fetch origin
   git branch --show-current                  # 비어 있어야 한다(detached). 아니면 RESOLVE_NOT_DETACHED 로 멈춘다
   git rev-parse HEAD origin/<기본브랜치>      # 두 줄이 같아야 한다. 다르면 RESOLVE_BASE_MOVED <origin 짧은 sha> 로 멈춘다
   ```
   - `RESOLVE_BASE_MOVED` ≠ 실패. 호출자가 새 `origin/<기본브랜치>` 로 다시 detach → 기준선 재측정 → 이 절 재호출
   - 통과하면 `git rev-parse HEAD` 를 **기준 HEAD** 로 기록
3. **승인 뒤 변경 확인**: SKILL.md 「절차」 4단계 2번 그대로. 걸리면 `RESOLVE_SKIPPED 건너뜀(승인 뒤 변경)` 또는 `RESOLVE_SKIPPED 건너뜀(승인 뒤 변경 확인 불가)` 로 끝

순서 = **해소·stage → 게이트 → 기록 → 커밋** (4-6번). 게이트는 commit **전** stage 한 트리에서 돌고, 결과(test 총수)를 `resolution.md` 에 적어 merge commit 에 함께 담음. `resolve-prompt.md` 「게이트」·「기록」 도 같은 순서.

4. **머지·해소·stage**: 충돌 여부 무관하게 늘 commit 없이 merge (`resolution.md` 와 트레일러가 한 commit 에 실리게)
   - rerere = 명령줄 `-c` 로만 켬. `git config` 로 켜지 않음 (공용 `.git/config` 에 써져 사람 체크아웃까지 바뀜)
   - 기록은 commit 때 남으므로 `commit` 에도 `-c` 붙임
   ```bash
   git -c rerere.enabled=true merge --no-ff --no-commit <머지 대상>
   git diff --name-only --diff-filter=U        # 충돌 파일 목록. 비었으면 텍스트 충돌은 없다(files=0)
   ```
   - 텍스트 충돌과 별도로 `node .claude/skills/dflow-merge/scripts/migration-check.mjs --staged` 실행 (「마이그레이션 버전 관문」)
     - exit 1 → `resolve-prompt.md` 「해소 규약」 R9 로 이 branch 가 추가한 migration 재채번. 스윕이 `(마이그레이션 버전)` 으로 넘긴 작업은 텍스트 충돌 0개일 수 있음 (`files=0 rules=R9`)
     - exit 2 → 해소 없이 `git merge --abort` 뒤 `RESOLVE_SKIPPED 건너뜀(마이그레이션 검사 실패)` 로 끝
   - 공용 결정 기록(`decisions.md`) 충돌은 먼저 `node .claude/skills/dflow-merge/scripts/decisions.mjs merge-conflicts` 로 품 (「결정 번호 매김」). 번호 수동 매김 금지. `DECISIONS_LEFT` 로 남은 파일은 아래 규약으로 품
   - 충돌 파일마다 `dflow-team/references/resolve-prompt.md` 「해소 규약」 R1-R9 로 품
     - 그 규약 「blocked 로 멈추는 경우」 에 걸리면 머지를 워크트리에 멈춘 채 두고 `RESOLVE_BLOCKED <질문과 선택지 한 줄>` 로 끝
     - `--abort` 금지. 사람이 답하면 그 자리에서 이어 감
   - 푼 파일 (R5 로 고친 파일 포함) 파일명으로 stage. **아직 commit 금지**
5. **게이트**: commit **전** stage 한 트리에서 한 번 실행. 충돌 없었어도 실행 (의미 충돌은 텍스트 충돌 없이 옴)
   - 실행 전 작업 트리 = stage 트리여야 함 (`git diff --quiet` exit 0). 남은 변경은 stage 하거나 되돌려 맞춤
   - 게이트 뒤에도 같은 확인 한 번 더. test 가 추적 파일을 고쳤으면 `git restore --worktree -- <파일>` 로 index 판으로 되돌림
   - 판정 = `dflow-team/references/resolve-prompt.md` 「게이트」 (기준선 = 호출자가 기준 HEAD·머지 대상 단독·merge-base 에서 잰 총수)
   - test 와 함께 `node .claude/skills/dflow-merge/scripts/migration-check.mjs --staged` exit 0 이어야 통과
     - exit 1·2 → 아래 실패와 같이 되돌리고 `RESOLVE_GATE_FAILED migration` 으로 끝 (해소 워커 결과 `failed gate migration`)
   - 통과 못 하면 **`git merge --abort`** 로 merge 전 상태 복구 (`reset --keep <기준 HEAD>` 는 merge 도중 거부됨)
     - 복구 뒤 `git status --porcelain` 비어 있고 `git rev-parse HEAD` = 기준 HEAD 여야 함
     - 그다음 `RESOLVE_GATE_FAILED <신규 실패 수>` 로 끝
6. **기록·커밋**: 게이트 결과를 해소 기록 `<TASKS>/<TSK>/resolution.md` 의 `## 시도 <n>` 절에 덧붙임
   - 내용 = 파일마다 적용한 규약 번호와 판단 한 줄, 게이트 줄. 형식 = `resolve-prompt.md` 「기록」
   - `<TASKS>/<TSK>` = 호출자가 넘긴 작업 폴더
   - `resolution.md` 파일명으로 stage → commit. 둘째 `-m` = 요약 (충돌 파일 수·규약 번호)
   ```bash
   git -c rerere.enabled=true commit -m "merge: <TSK> <제목> (approved) — 충돌 해소" -m "충돌 <N>개 · 규약 <R…>" \
     --trailer "DFlow-Order: <order>" --trailer "DFlow-Resolve: <n>/3"
   git rev-parse HEAD                         # 머지 커밋 sha. 결과 줄에 쓰므로 기록해 둔다
   ```
   - 승인 전 머지(`--on-report`)면 제목 괄호 = `(reported, 승인 전)`. `<n>` = `--attempt` 값
   - 트레일러 `DFlow-Order` 누락 금지 (SKILL.md 「트레일러 고정」, 행 G 증거 2)
   - commit 뒤 「결정 번호 매김」: `node .claude/skills/dflow-merge/scripts/decisions.mjs renumber --tsk <TSK> --order <order>`
   - 결과 처리 = SKILL.md 「절차」 4번 3-1단계와 같음 (실패해도 막지 않음). 게이트 재실행 금지
7. **state.json**: SKILL.md 「절차」 4단계 4번 그대로 `phase=merged` (승인 전이면 `unapproved: true` 도) commit 생성. 이 commit 과 merge commit 사이 게이트 재실행 금지
8. **push**: `git push origin HEAD:<기본브랜치>`. 실패하면 먼저 `git reset --keep <기준 HEAD>` 로 되돌리고 (머지·state.json 커밋이 이미 있음) 모양으로 가름
   - `non-fast-forward`·`fetch first` = 경합. `git fetch origin && git switch -q --detach origin/<기본브랜치>` 뒤 `RESOLVE_BASE_MOVED <새 origin 짧은 sha>` 로 끝
     - 호출자가 기준선 재측정 → 이 절 1번부터 재호출 (rerere 가 앞서 푼 덩어리 복원)
     - 기준 이동과 합친 **이 재시도는 한 세션 안 2회까지**, 호출자가 셈. 넘으면 호출자가 `failed push-race` 로 끝
   - 그런 문구 없이 1 로 끝나면 훅 거부. 우회 금지, `RESOLVE_PUSH_HOOK` 으로 끝
   - 그 밖의 실패 = `RESOLVE_PUSH_FAILED <exit>`
9. **뒷정리**: SKILL.md 「절차」 5번 뒷정리 그대로 (원격 agent 브랜치 삭제, 로컬 브랜치의 not found·checked out 건너뛰기)
10. **결과 줄**: 성공하면
   `RESOLVE_PUSHED <머지 커밋 전체 sha> base=<기준 HEAD 짧은 sha> files=<충돌 파일 수> rules=<R번호,…|-> tests=<통과/총수> need=<하한>`.
   - `총수` = 머지 결과 총수
   - `하한` = 게이트 판정의 `need` (개발 브랜치 총수 + (머지 대상 단독 총수 − merge-base 총수) − 계획 삭제 수)
   - merge commit sha = 6번에서 기록한 `git rev-parse HEAD` 값. `HEAD~1` 처럼 뒤 commit 수로 세지 않음. 짧은 sha 아닌 전체 sha 로 넘김
