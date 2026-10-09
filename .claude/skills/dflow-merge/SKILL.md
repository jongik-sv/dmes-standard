---
name: dflow-merge
description: 승인(approved)된 D'Flow 작업의 agent 브랜치를 개발 브랜치(`.dflow.local` 의 `dev_branch`)에 반영. 스택 브랜치는 조상 순서대로, approved 확인 전 머지 금지(팀장 전용 --on-report 만 예외). 트리거 - "/dflow-merge", "승인된 작업 머지", "approved 반영". 사용법 - /dflow-merge [<ref>...]
---
<!-- dflow-caps: remote-candidates — 팀장·워커가 이 줄로 기능 지원을 판정한다. 지우거나 바꾸지 않는다. -->

# /dflow-merge — 승인된 작업의 main 반영

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

인자: `$ARGUMENTS` (선택: ref 목록. 없으면 「절차」 1번의 로컬·원격 후보 전부)

**`--on-report`(팀장 전용, 승인 전 머지)**
- `/dflow-team` 팀장이 자동 머지 모드에서만 붙임. 사람 직접 사용 안 함. description 사용법에 노출 안 함.
- 반려 안 된 `status=reported` 도 머지(2번). 사람의 사후 승인은 다음 스윕이 「승인 전 머지분」 으로 정리.
- 플래그 없으면 approved 만 머지.

**`--resolve <ref>`(팀장이 띄운 해소 워커 전용)**
- 사람 직접 사용 안 함. description 사용법에 노출 안 함.
- ref 정확히 하나 + `--attempt <n>`(1-3) 동반. `--on-report` 동반 시 그 판정도 그대로.
- **이 플래그면 지금 `references/resolve.md` 를 읽고 그 절차(「해소 머지」)를 따른다.** 이 파일 「절차」 는 그 문서가 가리키는 단계만 쓴다.
- 플래그 없는 수동 사용·팀장 스윕은 충돌하면 파일 목록 보고 후 `--abort` (4번 3단계).

> 서버 통신 = dflow.mjs, exit code 분기, dflow-work 금지사항 상속. 위치 선언(이 스킬이 있어야 하는 이유) → `references/rationale.md` §위치 선언

## 참조 (분기별 읽을 파일)

경로 기준 `.claude/skills/dflow-merge/`. **스윕은 아래 굵은 두 줄(스윕 시작·첫 머지 직전)을 건너뛰지 않는다.** 나머지는 그 분기에 들어설 때만 읽는다.

| 문서 | 읽는 때 |
|---|---|
| **`references/sweep-scan.md`** | **스윕 시작.** `--resolve` 는 `resolve.md` 지시대로. 1·2번 전문 |
| **`references/merge-exec.md`** | **첫 머지(3·4번) 직전**(머지 대상 1건 이상), 또 `unapproved.md` 의 승인 반영 커밋을 push 하기 전(머지 대상 0건이어도). 3·4번 전문과 「실행 규칙」(결정 번호 매김·마이그레이션 버전 관문) |
| `references/script-details.md` | 출력 줄 해설·설정 변경 때만 |
| `references/dialect.md` | 6번 보고 직전, `dialect_check` 가 빈 값이 아닐 때만 |
| `references/resolve.md` | `--resolve` |
| `references/merge-worktree.md` | 스윕 시작 때 호출한 체크아웃이 기본 브랜치에 있지 않음 |
| `references/unapproved.md` | 로컬 스캔에 `merged` 줄 |
| `references/push-fail.md` | push 실패 |
| `references/rationale.md` | 규칙을 바꿀 때만(실행에 불필요) |

## 절차

`<기본브랜치>` = 개발 브랜치 = `dflow.mjs branch dev` 값(`.dflow.local` 의 `dev_branch`, 레거시는 `origin/HEAD`). 팀원(`--worker`)은 팀장이 넘긴 `DEV_BRANCH` 사용.

작업 폴더 `<TASKS>` = `<DOCS_DIR>/tasks` (리포 최상위 기준).
- 한 주문의 폴더 `<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>` 값(`.dflow.local` 의 `project_map`, 없으면 `docs`).
- 여러 작업을 훑을 때는 `dflow.mjs config tasks-dirs` 가 내는 폴더 전부.
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 금지.

1. **후보 식별**: 인자 없으면 원격·로컬 두 스캔이 낸 줄이 후보. **정본 = `sweep-scan.md` 의 두 셸 블록.** 지금 `references/sweep-scan.md` 를 읽고 그대로 실행.
   - `tasks-dirs` 조회 실패·빈 값 → 후보 식별 안 함. "건너뜀(tasks-dirs 조회 실패)" 보고 후 멈춤.
   - 로컬·원격 중복 → 로컬 후보 하나로 합침. 이어서 `api_base` 필터("건너뜀(다른 D'Flow)").
   - 서버 조회는 전체 UUID 로 `dflow.mjs show`. 사전 검사 `scripts/sweep-check.mjs` 는 이 1번의 상위 집합일 뿐(출력 계약 `SWEEP_*` 도 `sweep-scan.md`).
   - → references/sweep-scan.md §1번 후보 식별
2. **판정: approved 만 진행**(`--on-report` 면 승인 대기도). **approved 확인 전 머지 절대 금지** — 로컬 state·기억이 아니라 show 응답이 판정. 후보마다 보고 문구 하나로 분류(승인 대기·데이터 없음으로 뭉개지 않음).
   - 로컬 스캔 넷째 칸이 `merged` 인 후보(승인 전 머지분)는 절대 다시 머지하지 않음 → `references/unapproved.md`.
   - → references/sweep-scan.md §2번 판정
3. **순서: 스택은 조상 먼저**: 대상이 여럿이면 `branch_base` 로 조상 관계를 판정해 조상부터 머지. 선행이 머지 대상이 아니면 후손도 이번엔 머지 안 함.
   - 머지 대상 1건 이상이면 **지금 `references/merge-exec.md` 를 읽는다**(3·4번 전문, §3번 순서).
4. **머지**: 머지 자리 = 호출한 체크아웃의 현재 브랜치가 `<기본브랜치>` 면 그 체크아웃, 아니면 임시 머지 워크트리 `<W>`(`references/merge-worktree.md`). 후보마다 아래 순서.
   1. 블록 첫 줄(fetch·switch·pull) 뒤 머지 직전 HEAD 기록.
   2. 승인 뒤 변경 확인 → 강제 진행 스텁 관문 → 마이그레이션 버전 관문. 걸리면 머지하지 않고 보고 후 다음 후보로.
   3. `git merge --no-ff`. 충돌하면 decisions.md 만 스크립트로 풀고, 남은 충돌이 있으면 파일 목록을 읽은 뒤 `--abort` → `머지 실패(충돌) <파일,…>`. 3-1: 결정 번호 매김.
   4. state.json 을 `phase=merged` 로 커밋(push 전, 승인 전 머지면 `unapproved: true` 도). 경로는 1번이 찾은 그대로.
   5. `git push origin <기본브랜치>`. 실패하면 `git reset --keep <기록한 HEAD>` 후 `references/push-fail.md`. `origin` 으로 리셋 금지.
   - `--no-ff` 고정. 모든 머지 커밋에 `DFlow-Order: <order>` 트레일러(트레일러 고정). push 가 훅에 거부돼도 우회 금지.
   - → references/merge-exec.md §4번 머지
5. **뒷정리** (머지된 작업마다):
   - 머지된 `agent/` 브랜치 삭제.
   - 원격 삭제(`git push origin --delete agent/<id8>-<slug>`)는 그대로 실행.
   - 로컬 삭제(`git branch -d agent/<id8>-<slug>`)는 브랜치 없음(not found) 또는 다른 워크트리가 잡고 있음(checked out)이면 건너뛰고 보고.
   - 아직 미승인인 후손 스택 브랜치는 **삭제·rebase 금지**. 이미 머지된 커밋을 조상으로 포함하므로 그대로 두면 제 차례에 깨끗이 머지됨.
6. **보고**: 아래 항목을 표로.
   - 머지됨 / 머지됨(승인 전) / 승인 반영(이미 머지됨) / 승인 대기 / 승인 대기(머지됨)
   - 반려: 재작업 필요 (<review_note>)
   - 반려(머지됨): 되돌리기 또는 재작업 필요 (<review_note>, 그 위에 쌓였을 수 있는 작업)
   - 머지 실패(충돌) <파일,…> / push 실패(경합) / push 실패(훅) / push 실패
   - 건너뜀(서버 <status>·조회 실패·다른 D'Flow·조상 미승인·기점 미반영·승인 뒤 변경·승인 뒤 변경 확인 불가·마이그레이션 검사 실패·로컬 브랜치 삭제 건너뜀)

   - 반려·반려(머지됨)·머지 실패(충돌)·push 실패(훅)는 id8 과 함께 따로 적음. 호출자(`/dflow-team` 팀장 등)가 이 목록으로 후속 처리.
   - 머지된 작업에 3-1단계 번호 매김 결과(`D-TSK-…→D-NNN`, `DUP_RENUMBERED` 로 중복을 옮겼으면 `D-050→D-053(중복)`)가 있으면 그 줄에 붙임.
   - 표 아래에 그 작업 id8 과 함께 그대로 적는 줄: "결정 번호 매김 실패(<출력>)" · `UNION_SET <파일>` · `DUP_REF_REPLACED` · `DUP_REF_AMBIGUOUS`(사람이 볼 위치) · `DUP_LEFT` · `DECISIONS_SEQ`.
   - 보고 쓰기 전에 「방언 검증」 한 번 실행(스윕이 중간에 멈췄어도, 머지 0건이어도 실행 — 보류된 커밋을 다시 시도). 결과 줄(`DIALECT_*`, `DIALECT_SKIP` 제외)과 `DIALECT_UNVERIFIED` 줄을 표 아래에 그대로 싣음.

## 방언 검증

- 스윕 시작의 `git fetch origin` 직후 `git rev-parse origin/<기본브랜치>` 를 `<스윕 전 sha>` 로 기록. 6번 보고 직전에 `dialect_check` 확인. `--resolve` 는 이 절을 타지 않음.
- `dflow.mjs config dialect_check` exit 0 + 빈 값 → `DIALECT_NONE`, 도커 런타임 켜지 않음.
- → references/dialect.md §방언 검증

## 결정 번호 매김

머지하는 이 스킬이 매김(손으로 매기지 않음. 도구 = `scripts/decisions.mjs`). `merge=union` 금지.
- → references/merge-exec.md §실행 규칙

## 마이그레이션 버전 관문

걸리면 충돌로 취급(`머지 실패(충돌) <파일,…> (마이그레이션 버전)`).
- → references/merge-exec.md §실행 규칙

## 해소 머지(`--resolve`)

`--resolve`(해소 워커)일 때만 `references/resolve.md` 를 읽고 그 절차(「해소 머지」)를 따름. 스윕·수동 사용은 읽지 않음.

## 금지

- approved 아닌 작업의 머지(reported·claimed 포함). 서버 approve 시도.
  예외 = `--on-report` 의 반려 안 된 `reported` 하나뿐. 반려된 작업·`claimed`·승인 전 머지분의 재머지는 플래그가 있어도 금지.
- force push. 훅 우회(SKIP_GUARD).
- 머지 순서 뒤집기(후손 먼저).
- `--resolve` 의 agent 브랜치 수정·rebase, 시험 삭제·`skip`·기대값 완화로 게이트 통과. `--resolve` 도 force push·훅 우회 금지는 같음.
- 대상 저장소가 wbs-web 자신이면 G1-G4 훅 제약을 사용자에게 사전 경고.
