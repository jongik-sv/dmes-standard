# dn-heavy 정본 메모

- 회차: dflow-node-1010 · 레인 dn-heavy · 브랜치 chore/dn-heavy · 기준 dev 5d5e25c3c
- 조정 세션: dmes-standard-87 · 지시: ~/.coord/dflow-node-1010/lanes/dn-heavy/brief.md (dn-heavy-1)

## 수정 크기(착수 시 기재)
- 새 파일 3개: heavy.mjs(원본 1149줄 → 약 900줄), timeout-guard.mjs(253 → 약 260), deps.mjs(453 → 약 420)
- 호출자 약 12파일, 파일당 1~5줄: src/backend/gradlew · be-run.sh · scripts/perf/**(5) · scripts/build-verify/dump-deps.sh · .coord.json · .dflow-gates · flyway-migration-add/SKILL.md · test-slot.gradle(주석)
- git mv 5개: scripts/{heavy,timeout-guard,deps}.sh → backup/scripts, tests/{heavy-owner-warn,timeout-guard}.sh → backup/tests
- 실행 수단: heavy.mjs = 이 세션 직접(동시성 핵심). timeout-guard.mjs·deps.mjs = sonnet agent 병렬(D3)

## 상태
- [x] 1 heavy.mjs (d079eca54)
- [x] 2 timeout-guard.mjs (f9dfd4caf)
- [x] 3 deps.mjs (d89fd5794)
- [x] 4 호출자 전환 (7096d33d7) — .coord.json 은 제외(dn-coord-fix)
- [x] 5 원본 git mv (8a075e3b2)
- [x] 6 opus 리뷰(FIX-FIRST: 레인 범위 6건) → 수정 f08c7133c → dev 합침 → 머지 요청
- [x] 추가: 문서가 가리키는 머리 주석 .mjs 로 옮김(pred-reflected·deps·mutate) 54152c551
- 리뷰 지적 중 레인 밖(머지 요청 첨부): dialect-check.sh·capacity.sh·auto-answer.mjs·.coord.json·backends.md 훅(`[ -x …/timeout-guard.sh ]`)·dflow-dev 문서의 heavy.sh/deps.sh 안내
- 알려진 한계: cmd.exe 로 감싸는 .cmd/.bat 인자의 %VAR% 는 막을 수 없음(win32)

## 호출 경로 변경표(머지 요청 첨부)
| 옛 호출 | 새 호출 |
|---|---|
| `<dflow-dev>/scripts/heavy.sh <인자>` · `bash …/heavy.sh <인자>` | `node <dflow-dev>/scripts/heavy.mjs <같은 인자>` |
| `bash …/heavy.sh status` · `snapshot` · `wait <id>` · `acquire`/`release` · `--detach`/`--exclusive`/`--pool docker` | `node …/heavy.mjs` 같은 하위 명령·옵션(출력·종료 코드 동일) |
| `sh …/timeout-guard.sh` (PreToolUse 훅 command) | `node <dflow-dev>/scripts/timeout-guard.mjs` |
| `bash …/deps.sh` | `node <dflow-dev>/scripts/deps.mjs` |
| `bash tests/heavy-owner-warn.sh`·`tests/timeout-guard.sh` | 퇴역(backup/tests). 대체 시험 없음 |
- 경로를 env 로 받는 곳(DFLOW_HEAVY_BIN·DFLOW_HEAVY_SH·HEAVY_SH·HEAVY_CMD)은 확장자로 실행기 선택(.mjs node · .sh bash)
- 훅 등록 위치(문서 레인): dflow-team/references/backends.md 「팀원 워크트리 준비」·kit README. 이미 만든 ~/.dflow/limits/*.settings.json 은 옛 .sh 경로 → 재생성 전까지 가드 꺼짐(비차단 실패)

## backup/README.md 에 추가할 줄(dn-dev-small 이 만든 파일)
- `scripts/heavy.sh`·`scripts/timeout-guard.sh`·`scripts/deps.sh`·`tests/heavy-owner-warn.sh`·`tests/timeout-guard.sh` — 퇴역(dn-heavy, 2026-10-10). 실행 금지. 정본은 `scripts/heavy.mjs`·`timeout-guard.mjs`·`deps.mjs`

## 결정
- 슬롯 폴더·owner·wait-*·excl-*·잡 폴더 형식 = heavy.sh 글자 그대로. pstart = unix `LC_ALL=C ps -o lstart= -p`(trim), win32 = CIM CreationDate
- test-slot.gradle 은 별도 폴더(~/.gradle/dmes-test-slots) → 주석만

- 조정 답(10-10): .coord.json heavy.script 변경은 이 레인에서 뺌(dn-coord-fix 몫). `snapshot)` 주석 꼼수 금지. 머지 순서 dn-work → 스크립트 레인 → dn-heavy → dn-coord-fix. 머지 요청에 「heavy.sh 를 부르는 남은 곳」 grep(backup·golden 제외) 첨부
- 보충 규칙: timeout-guard 는 baseline.mjs run 도 대상. 경로를 env·설정으로 받으면 확장자로 실행기(.mjs node·.sh bash). bash 문법 명령은 win32 Git Bash(없으면 명시 오류). stdout = writeSync 루프

## 다른 레인 영향(머지 요청에 첨부)
- coordinator coord-status.mjs:92 `runSync('bash', [heavy.script, 'snapshot'])` → .coord.json 이 heavy.mjs 를 가리키면 dn-coord-fix 가 node 호출로 바꿔야 함
- heavy.sh 를 backup 으로 옮기면 ../heavy.sh 를 부르는 baseline.sh(dn-dev-small)·dialect-check.sh(dn-merge-poll)·capacity.sh(dn-team)·dflow-lease.sh(dn-work) 는 heavy.mjs 로 바꿔야 함
