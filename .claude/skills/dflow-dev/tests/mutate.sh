#!/usr/bin/env bash
# mutate.sh(본체 mutate.mjs)를 임시 git 리포에서 확인한다. 변이 결과 5종·되돌리기·중단 사본 복구·형식 오류.
# 사용법: bash tests/mutate.sh   (node 필요. 네트워크·도커를 쓰지 않는다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
MUT="$here/../scripts/mutate.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/mutate-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

cd "$tmp" && git init -q . && mkdir src muts
printf 'alpha\nkeep=한글 값\nbeta\nbeta2\n' > src/a.txt
cp src/a.txt "$tmp/a.orig"
mk() {  # mk <ID> <test> <find> <replace> [file]
  printf 'rule: 시험\nfile: %s\ntest: %s\n--- find\n%s\n--- replace\n%s\n' "${5:-src/a.txt}" "$2" "$3" "$4" > "muts/$1.mut"
}
mk M1 'grep -q "^keep=한글 값$" src/a.txt' 'keep=한글 값' 'keep=바뀜'        # 원문이 바뀌면 grep 이 실패 → caught
mk M2 'true' 'alpha' 'ALPHA'                                                # 항상 통과 → survived
mk M3 'true' 'nothere' 'x'                                                  # 원문 없음 → anchor count=0
mk M4 'true' 'a' 'x'                                                        # `a`+줄바꿈이 alpha·beta 끝에 두 번 → anchor count=2
mk M5 'exit 75' 'alpha' 'x'                                                 # 75 → busy
printf 'rule: r\nfile: src/a.txt\ntest: true\n--- find\nalpha\nkeep=한글 값\n--- replace\nZ\n' > muts/M6.mut   # 여러 줄 원문
mkdir -p src/한글폴더; printf 'zeta\n' > src/한글폴더/b.txt
mk M8 'grep -q "^keep=한글 값$" src/a.txt' 'alpha' 'ALPHA'                 # 한글 test: 변이는 한글 줄과 무관하므로 survived 여야 한다(헤더가 UTF-8 로 풀려야 함)
mk M9 'true' 'zeta' 'ZETA' 'src/한글폴더/b.txt'                              # 한글 폴더의 file:

r="$(bash "$MUT" run muts 2>&1)"
eq "결과 줄 8개 + 요약" "$(printf '%s\n' "$r" | grep -c '^MUTATION_')" 9
eq "M1 caught" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M1 caught rc=1 ')" 1
eq "M2 survived" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M2 survived rc=0 ')" 1
eq "M3 anchor count=0" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M3 anchor count=0 file=src/a.txt')" 1
eq "M4 anchor count=2" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M4 anchor count=2 ')" 1
eq "M5 busy" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M5 busy rc=75 ')" 1
eq "M6 여러 줄 원문 survived" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M6 survived ')" 1
eq "M8 한글 test: survived" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M8 survived rc=0 ')" 1
eq "M9 한글 폴더 file: survived" "$(printf '%s\n' "$r" | grep -c '^MUTATION_RESULT M9 survived rc=0 ')" 1
eq "요약" "$(printf '%s\n' "$r" | tail -1)" "MUTATION_SUMMARY total=8 caught=1 survived=4 anchor=2 busy=1"
eq "파일은 바이트 그대로 되돌아온다(한글 포함)" "$(cmp -s src/a.txt a.orig && echo same)" same
eq "사본 폴더에 파일이 남지 않는다" "$(find .git/dflow-bak/mutate -type f 2>/dev/null | wc -l | tr -d ' ')" 0
eq "로그가 남는다" "$(ls .git/dflow-bak/mutate-logs | wc -l | tr -d ' ')" 6

r="$(bash "$MUT" run muts --ids M2 2>&1)"
eq "--ids 는 그 변이만" "$(printf '%s\n' "$r" | tail -1)" "MUTATION_SUMMARY total=1 caught=0 survived=1 anchor=0 busy=0"
eq "--ids 에 없는 ID 는 형식 오류(rc 2)" "$(bash "$MUT" run muts --ids NOPE >/dev/null 2>&1; echo $?)" 2
eq "없는 입력은 형식 오류(rc 2)" "$(bash "$MUT" run nodir >/dev/null 2>&1; echo $?)" 2
printf 'rule: r\nfile: src/a.txt\ntest: true\n--- find\nalpha\n' > muts/B1.mut
eq "replace 표지가 없으면 형식 오류(rc 2)" "$(bash "$MUT" run muts/B1.mut 2>&1 | head -1)" "MUTATION_BAD muts/B1.mut --- replace 표지 없음"
rm -f muts/B1.mut

# 중단된 실행의 사본 복구: 사본을 만들어 두고 원본을 망가뜨린 상태에서 시작한다
mkdir -p .git/dflow-bak/mutate/src; cp a.orig .git/dflow-bak/mutate/src/a.txt; echo broken > src/a.txt
r="$(bash "$MUT" run muts --ids M2 2>&1)"
eq "남은 사본을 먼저 되돌린다" "$(printf '%s\n' "$r" | sed -n 1,2p | tr '\n' '|')" "MUTATION_RESTORED src/a.txt|MUTATION_RERUN_NEEDED|"
eq "복구 뒤 원본이 같다" "$(cmp -s src/a.txt a.orig && echo same)" same

# TERM 으로 끊기면 되돌리고 143 으로 끝난다
mk M7 'sleep 30' 'alpha' 'x'
bash "$MUT" run muts --ids M7 >/dev/null 2>&1 &
pid=$!; sleep 1.5
eq "시험 도는 중에는 변이가 들어가 있다" "$(head -1 src/a.txt)" x
kill -TERM "$pid"; { wait "$pid"; } 2>/dev/null; rc=$?
sleep 0.3
eq "TERM 뒤 원본 복구" "$(cmp -s src/a.txt a.orig && echo same)" same
eq "TERM 종료 코드 143" "$rc" 143

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
