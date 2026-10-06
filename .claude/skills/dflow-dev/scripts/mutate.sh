#!/bin/sh
# /dflow-dev 변이 검증 드라이버: 변이 기록 파일(*.mut)대로 변이를 넣고 → 대상 테스트를 돌리고 → 백업 사본으로 되돌린다.
#
#   mutate.sh run <폴더|파일.mut>… [--ids M1,M3]
#
# 왜: Verify 가 build-log 「변이 검증 기록」 의 변이를 다시 넣을 때 위치를 찾느라 소스를 다시 읽었다(2026-09-26
# dmes-standard TSK-08-05 Verify: Explore 11.1분 + 스크립트 작성 12분 + 원문 없는 7행 재작성 4분 ≈ 23분). Build 가 변이를
# 파일 경로·찾을 원문·치환문으로 남기고 Verify 는 같은 파일을 이 드라이버에 다시 넣으면 위치 찾기가 없어진다. Build 도 같은
# 드라이버로 돌린다(「한 번에, heavy.sh 안에서」 — 감싸는 쪽이 heavy.sh 다).
#
# 리포 최상위에서 부른다(파일 경로는 최상위 기준). 변이 기록 형식(한 변이 = 파일 하나, 이름 <ID>.mut, ID 는 [A-Za-z0-9_-]):
#   rule: <불변 규칙 — design.md 「불변 규칙」 의 문구>
#   file: <리포 최상위 기준 경로>
#   test: <대상 테스트 명령 한 줄 — 기준선 명령 줄에 좁히는 인자만 더한 것(sh -c 로 돈다)>
#   e2e: yes|no            (생략하면 no. E2E 스위트 전체가 대상인 변이면 yes)
#   --- find
#   <원문 — 파일에 정확히 한 번 나와야 한다. 여러 줄 가능>
#   --- replace
#   <치환문 — 여러 줄 가능. 비우면 원문을 지운다>
# `--- find`·`--- replace` 줄 뒤부터 다음 표지 줄(또는 파일 끝) 앞까지가 본문이다. 본문 끝의 줄바꿈 하나는 표지의 일부로
# 보고 떼지 않는다 — 원문을 그대로 붙여 넣으면 된다(끝 줄바꿈까지 같아야 찾는다).
#
# 변이마다(이름 순):
#   원문이 파일에 정확히 한 번 있는지 본다 → 아니면 넣지 않고 `MUTATION_RESULT <ID> anchor count=<n>`.
#   파일을 $(git rev-parse --git-dir)/dflow-bak/mutate/<경로> 에 복사해 두고 치환해 쓴 뒤 test 를 sh -c 로 돈다(출력은
#   dflow-bak/mutate-logs/<ID>.log). 끝나면 평범한 cp 로 되돌리고(mtime 이 새로 찍혀야 Gradle 이 재컴파일한다 —
#   phase-build.md 「되돌리기」) 사본을 지운다. 중단(INT·TERM)·오류에도 되돌린다.
#   결과: `MUTATION_RESULT <ID> caught|survived|busy rc=<rc> sec=<초> e2e=<yes|no> log=<경로>`
#     caught = test 가 0 이 아닌 코드로 끝남(빨강), survived = 0(변이가 안 잡힘), busy = 75(HEAVY_BUSY 등 — 판정 아님).
# 마지막 줄: `MUTATION_SUMMARY total=<n> caught=<c> survived=<s> anchor=<a> busy=<b>` (stdout).
# 시작할 때 dflow-bak/mutate/ 에 지난 실행의 사본이 남아 있으면(중단된 실행) 먼저 되돌리고 `MUTATION_RESTORED <경로>` 와
# `MUTATION_RERUN_NEEDED` 를 낸다 — 그때만 Gradle 강제 재실행(--rerun-tasks)을 한 번 쓴다(dev-discipline 「강제 재실행」).
# exit: 0(판정을 냈다 — survived·anchor 가 있어도 0), 2(사용법·형식 오류: `MUTATION_BAD <파일> <사유>`), 3(되돌리기 실패).
# 10분 상한(phase-prompt 공통 규칙 4)을 넘길 것 같으면 --ids 로 나눠 부르거나 heavy.sh --detach 로 띄운다.
[ "${1:-}" = run ] || { echo "사용법: mutate.sh run <폴더|파일.mut>… [--ids M1,M3]" >&2; exit 2; }
shift
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || { echo "MUTATION_BAD . git 작업 트리 안에서 부른다" >&2; exit 2; }
TOP=$(git rev-parse --show-toplevel)
[ "$(cd "$TOP" && pwd -P)" = "$(pwd -P)" ] || { echo "MUTATION_BAD . 리포 최상위에서 부른다($TOP)" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "MUTATION_BAD . node 가 필요하다(본체 mutate.mjs)" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
exec node "$HERE/mutate.mjs" "$GIT_DIR" "$@"
