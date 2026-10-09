# /dflow-merge 스크립트 동작 상세

「결정 번호 매김」·「마이그레이션 버전 관문」 스크립트가 **무엇을 어떻게 바꾸는지** 상세. 읽는 때: 출력 줄을 사람에게 설명할 때 · 결과가 의외일 때 · 대상 리포 설정을 바꿀 때만. **실행 규칙** = `merge-exec.md` 「실행 규칙」 (merge·해소 merge 때 거기서 읽음). 실행 순서·보고 규칙 정본 = SKILL.md 「절차」·`merge-exec.md`.

## 결정 번호 매김

**상세**

- `decisions.mjs` (merge 자리 최상위, 임시 merge worktree 면 `-C "$W"`)
- 결정 기록 형식 = dflow-wbs `decision-log.mjs`. `validate` 는 D-001 부터 끊김 없는 순번 요구
- 번호 = 개발 branch 에 들어가는 순서로만 결정
- `decision-log.mjs` 형식·validate 변경 금지 (`Temp ID`·`Renumbered from` 은 선택 필드로 읽힘)

- **머리 줄 규칙·잠금**
  - 항목 머리 = `decision-log.mjs` 와 같게 `## D-<숫자> (<시각>)` 뒤에 공백만 있고 끝나는 줄뿐 (스크립트 `HEAD_ERE`)
  - `## D-002 (ts) 비고` 처럼 글이 더 붙은 줄 = 머리 아님, 앞 항목 본문
  - 두 스크립트가 `decisions.md` 를 읽고 고쳐 쓰는 동안 `decisions.md.lock` 디렉터리 (mkdir 잠금) 를 잡음
    - 15초 안에 못 잡으면 `RENUMBER_FAILED lock`·`DECISIONS_LEFT <파일> lock`
    - 10분 넘게 남은 잠금은 치움
  - `decision-log.mjs append` 도 같은 잠금 사용 → 동시에 쓰는 항목 안 사라짐

- **충돌 풀기**(`merge-conflicts`)
  - 결과 = 개발 branch 쪽 파일 전체 + merge 대상이 merge-base 에 없던 블록을 순서대로 붙인 것
  - merge 대상이 기존 블록을 고쳤거나 (추가 전용 기록 위반) 한쪽이 파일을 지웠으면 안 풀고 `DECISIONS_LEFT`
- **번호 매김**(`renumber`)
  - 트리 전체에서 임시 ID 머리를 그 파일의 다음 전역 번호로 교체 (머리 순서대로)
  - 바로 아래 `- **Temp ID**: <임시 ID>` 줄을 남김
  - 추적 파일 전체 (`.claude/` 제외) 의 같은 임시 ID 참조 교체
  - commit 하나로 남김 (`chore(<TSK>): 결정 번호 매김 (…)`, 트레일러 `DFlow-Order`)
  - `Temp ID` 줄 덕분에 스택 후손이 선행의 임시 ID 를 적어 뒀어도 뒤 머지에서 찾아 교체
  - 같은 임시 ID 머리가 둘 이상 → 그 ID 만 건너뛰고 (`RENUMBER_DUP`) 나머지는 매김
  - 실패(`RENUMBER_DIRTY`·`RENUMBER_FAILED`) 시 임시 ID 는 트리에 남고, 다음 머지의 번호 매김이 트리 전체를 다시 훑어 매김
- **전역 번호 중복**(`renumber` 첫 단계)
  - 옛 규칙 읽은 워커나 사람이 전역 번호를 직접 매기면 같은 기점 두 branch 가 같은 `## D-050` 을 들고 옴
  - git 이 두 추가를 다른 위치로 보면 충돌 없이 합쳐지므로, 충돌 여부 무관하게 merge commit 뒤에 봄
  - **HEAD 가 merge commit 일 때 HEAD^1 = merge 전 개발 branch, HEAD^2 = merge 대상(그때의 MERGE_HEAD)**. merge-base 는 그 둘에서 구함 (충돌 경로·충돌 없는 경로·해소 merge 모두 이 자리를 지남)
  - 파일마다 따로 봄 (decisions.md 끼리 번호 독립)
  - 개발 브랜치 쪽 블록은 그대로 둠
    - 머지 대상이 더한 블록 (머리 줄이 HEAD^2 판에 있고 merge-base 판·HEAD^1 판에 없는 것) 중 번호가 겹친 것만 그 파일의 다음 전역 번호로 옮겨 파일 끝에 둠 (개발 브랜치 블록 순서 불변)
    - 머리 바로 아래 `- **Renumbered from**: D-050 (중복 번호)` 줄을 남김
    - 출력 `DUP_RENUMBERED D-050=D-053 <파일>`, 커밋 제목 `D-050→D-053(중복)`
  - 같은 파일 안: 머지 대상 블록 (옮긴 것·안 옮긴 것) 의 본문 참조만 새 번호로 교체
  - 다른 파일: **리포 전체가 아니라** 머지 대상이 더하거나 바꾼 파일(`merge-base..HEAD^2`)만 교체 (`DUP_REF_REPLACED <파일> D-050→D-053,…`)
  - 아래는 교체 않고 `DUP_REF_AMBIGUOUS <파일>:<줄> D-050 <사유>` 로 위치만 알림 (사람이 봄)
    - 개발 브랜치도 바꾼 파일 (`dev-changed`)
    - 다른 decisions.md (`decisions`)
    - merge-base 판에 이미 그 번호가 있던 파일 (`base-mention`)
    - 한 번호가 둘로 옮겨졌거나 머지 대상의 다른 decisions.md 에도 같은 번호 머리가 있는 경우 (`ambiguous`)
  - 바로잡지 못한 중복 = `DUP_LEFT <파일> D-NNN <사유>`
    - `not-a-merge`: HEAD 가 머지 커밋 아님
    - `dev-side`: 개발 브랜치에 이미 같은 번호 둘 (실패한 머지가 남긴 중복은 다음 머지에서 이렇게만 나옴)
    - `ambiguous-refs`: 머지 대상끼리 겹쳐 참조 교체 안 함
    - 등
  - 겹치지 않은 직접 번호는 안 건드림
    - 순번을 건너뛰었거나 앞뒤가 바뀌어 validate 가 실패할 모양이면 `DECISIONS_SEQ <파일> at=<i> found=D-NNN want=D-NNN` 으로 알리기만 함 (이번 머지·이번 실행이 바꾼 결정 기록만 봄)
    - 사람이 판단해 새 블록으로 정정
- **`merge=union`**
  - union 은 블록끼리 같은 필드 줄 (`- **Phase**: design` 등) 을 공유하면 줄을 맞춰 합쳐서 한 블록의 줄이 사라지고 두 머리가 붙음
  - 충돌을 내게 두고 `merge-conflicts` 가 블록 단위로 품

## 마이그레이션 버전 관문

**상세**

`migration-check.mjs`. migration 폴더는 파일 패턴으로 찾음 (폴더 설정 안 읽음). 폴더별 두 가지 확인.

- **버전 중복**: 같은 폴더에 같은 버전이 둘 이상이고 그중 하나가 이 브랜치가 추가한 파일 (`MIGRATION_DUP`). 개발 branch 자체 중복은 경고(`MIGRATION_DEV_DUP`)만 하고 이 merge 를 막지 않음
- **역순 도착**: 이 branch 가 추가한 버전 < 그 폴더의 개발 branch 최대 버전 (`MIGRATION_ORDER`, 같으면 중복). Flyway 기본값 `outOfOrder=false` 에서는 이미 더 높은 버전을 적용한 개발 DB 가 그 파일을 거부
- 버전 비교 = Flyway 규칙. `_` = `.`, 부분마다 숫자로, 앞의 0 과 끝의 0 부분 무시 (`V04`·`V4_0`·`V4.0` = `V4`)
- 폴더 단위로 묶음. Flyway 이력은 폴더(location)마다 독립이라 다른 폴더가 같은 버전을 두는 것은 정상 (dmes-standard 는 Oracle 하나라 `oracle/mcmapuser`·`oracle/mcaapuser` 같은 스키마별 폴더)
- `R__`(반복)·`U`(undo) 파일은 안 봄
- exit 0 = `MIGRATION_OK`
- exit 1 = 버전 중복·역순 도착. 걸린 파일 (이 브랜치가 추가한 것) 은 `MIGRATION_FILES` 로 나옴
- exit 2 = `MIGRATION_CHECK_FAILED <사유>` (판정 불가 — 머지 금지)

## 지원 환경: macOS · Linux · Windows (node)

- `scripts/*.mjs` = node 로 macOS·Linux·Windows 에서 같이 돎
- 필요 도구: node 18.17+, git (Git Bash 는 사용자 bash 문법 명령(게이트·baseline 명령)을 윈도우에서 돌릴 때만 필요)
- 플랫폼 의존 명령 금지. 새 스크립트에 macOS 전용 명령·perl 금지
- 정본·도구 표·한계: `../../_shared/platform-support.md`
