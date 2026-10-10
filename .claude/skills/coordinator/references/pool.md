# 비-Claude 워커 풀

설계: `docs/superpowers/specs/2026-10-10-coordinator-token-time-design.md` §4. 스크립트: `scripts/pool.mjs`(`--help`).

## 1. 구성

- PC 전체에 풀 하나. 모든 레인이 함께 씀
  - 회차가 있으면 `<회차>/pool/`, 없으면 `$TMPDIR/coord-pool/`
- 슬롯: opencode `pool.opencode_max`(3) · GLM `pool.glm_max`(1)
  - GLM = 모델만 GLM 인 Claude Code(`launch.glm`). `glm-preflight.mjs` 가 `ok` 일 때만. 회사 PC = 0
  - opencode = `launch.opencode`(기본 `opencode --standalone`). 비면 opencode 슬롯 0
- 빈 슬롯 찾는 순서 = `pool.order`(opencode → glm)
- 워커 = 묶음마다 **보이는 TUI 탭** 하나(`pool-<id>`). 사람이 화면으로 진행·한도 오류를 봄
- 실행기 = 토큰을 쓰지 않는 Node 프로세스(`pool.mjs run`). 순서:
  1. 탭 띄우기: `pool-tab.mjs open` → `spawn-lane.mjs --no-record`(레인 기록·오피스·레인 상한 밖)
  2. 지시 넣기: 고정 문구 「작업 지시 파일 .pool 폴더의 <id>.md 를 읽고 그대로 진행해」
     - GLM = `term-send-safe.mjs`, opencode = `terminal send --enter`(opencode 2.x 는 tui-idle 판정이 안 나옴)
  3. 폴링(`pool.poll_s` 10초): 화면 끝 60줄을 `<작업 폴더>/.pool/<id>.out` 에 덮어씀 + 보고 파일 확인
     - 조용함 = 화면이 두 폴링 동안 그대로, 또는 tui-idle
     - 조용함 + 보고 있음 → `ok`(보고가 있어도 화면이 바뀌는 중이면 쓰는 중으로 보고 기다림)
     - 조용함 + 보고 없음 + 화면 끝 30줄에 한도 문구 → `ratelimit`
     - 보고 없이 `pool.stuck_min`(10분) 동안 화면 그대로 → `fail`(reason `stuck`)
     - `pool.timeout_min` 초과 → `timeout`. 탭이 사라짐 → `fail`(reason `tab-gone`)
  4. **어느 경로로 끝나든 탭을 닫음**(정상 끝·예외·종료 신호). 탭을 못 띄움 = `fail`(reason `open`), 지시를 못 넣음 = `fail`(reason `send`)
     - 띄우기 실패: `spawn-lane` 이 남긴 탭(`SPAWN_FAIL … handle=`)과 제목으로 찾은 탭을 닫음
     - 제목 검색 = `pool-<id>`(GLM 은 `◐ pool-<id>` 꼴) 또는 `.pool/<id>.md`(opencode 가 바꾼 제목). id 경계 확인
- TUI 워커는 종료 코드가 없음 → `rc=-`
- 실행기 시작 직후 기록이 아직 `queued` 이면 최대 5초 기다림

## 2. 맡기는 일

- 맡김: 완료 조건 시험이 분명한 S/M 구현·수정, 조사, 문서, 본보기 있는 반복
- 금지: L·동시성·트랜잭션·보안·공유 API(merge-gate `SHARED_API`)·원인 모를 결함
- token 모드 = 위 일은 Claude agent 보다 풀 먼저. time 모드 = 먼저 비는 쪽

## 3. 절차(레인 컨트롤러)

1. 묶음 파일 작성: `templates/packet.md` 를 채워 임시 파일로
   - 건드릴 파일 = 레인 안 항목 표의 그 항목 파일(파일 소유)
   - 묶음 파일 안은 글자 제한 없음. 풀이 opencode 입력창에 넣는 문장은 고정 문구라 `!`·`/`·`@` 문제가 없음
2. 제출: `node <스킬>/scripts/pool.mjs submit --lane <레인> --id <레인>-<항목번호> --size <S|M> --packet <파일> --cwd <레인 워크트리> [--kind auto|opencode|glm] [--dry-run]`
   - id = `<레인>-<항목번호>`(예: `a1-T3`). 풀은 회차에 하나라 레인끼리 항목번호가 겹침
   - `--id` 가 `<레인>-` 으로 시작하지 않으면 스크립트가 붙임. 출력 줄의 id 가 실제 id → `status`·`cancel`·`note` 에 그 id 사용
     - 이때 복사한 묶음 안의 제목(`# 작업 묶음 <id>`)·보고 경로(`.pool/<id>.`)도 실제 id 로 바꿈
   - `POOL started <id> kind=<k>` · `POOL queued <id> position=<n>` = 기다림
   - `POOL fallback <id> reason=no-worker` = 바로 Claude agent 로
   - `POOL refused <id> <사유>` = 사유대로 고쳐 다시(`duplicate` = 새 id(같은 항목 재시도 = `<레인>-<항목번호>-<시도>`), `size-L`·`bad-size`·`bad-id`·`no-packet`)
3. 완료 알림: 레인 탭에 `[pool] <id> <result> rc=<n>` 한 줄(실패면 뒤에 `→ Claude 로 넘김`)
   - 알림이 없으면 다음 단계 전에 `pool.mjs status --lane <레인>`
4. `result=ok`
   - `.pool/<id>.report.md` 읽기 → 완료 조건 시험 직접 1회 → Claude 리뷰
   - 리뷰 지적 → Claude 수정 agent(풀에 다시 맡기지 않음)
   - 커밋 뒤 `pool.mjs note <id> --findings <지적 수> --lines <변경 줄>`
5. `result` 가 `fail`·`timeout`·`ratelimit`·`no-worker`·`cancel`
   - 그 항목을 Claude agent 로(`→ Claude 로 넘김`). 작업 폴더에 남은 반쯤 고친 파일은 `git diff` 로 보고 이어받거나 되돌림
6. `/clear` 뒤 레인 세션 id 가 바뀜 → 조정자가 `coord-state.mjs relink <레인>` 으로 갱신(알림 전달·배정이 옛 id 를 쓰지 않게)

## 4. 한도 오류

- `ratelimit` → 그 종류는 `pool.cooldown_min`(30분) 쉼. 쉬는 동안 그 종류 슬롯 = 0
  - 쉰 뒤 상한 = `max − 벌점`(최소 1). 벌점은 그 종류가 쉬는 중이 아닐 때 한도 오류가 날 때마다 1 오르고, 회차 동안 쌓임
  - 쉬는 중 다시 한도 오류 = 쉬는 시각만 늘어남(벌점 그대로, 같은 사건의 동시 실패로 봄)
  - 쉬는 동안 새 묶음 = 다른 종류 빈 슬롯, 없으면 `no-worker` → Claude
- 한도 판정 = 화면이 조용해진 뒤 끝 30줄의 문구. 워커가 한도에 걸려 재시도하며 화면이 계속 바뀌면 `timeout` 으로 끝남(쉬는 시간 없음)
- 무료 요금제 모델·한도는 바뀔 수 있음. `run-metrics.mjs` 의 풀 넘김 비율이 30% 를 넘으면 배정 기준 재검토

## 5. 상태·정리

- `pool.mjs status` = 묶음별 상태 + `POOL slots …`. 죽은 실행기의 `running` 은 `fail`(reason `lost`)로 정리하고 빈 슬롯을 채움
- `pool.mjs cancel <id>` = 큐·실행 중 묶음 취소(`POOL cancelled <id>`). 실행 중이면 워커 탭을 닫음
- 진행 보기 = Orca 의 `pool-<id>` 탭. 마지막 화면은 `.pool/<id>.out` 에 남음
- `.pool/` 은 `.git/info/exclude` 에 자동 등록(git 에 안 잡힘)
- 탭 정리: 실행기가 끝날 때 닫음. 취소 = `cancel` 이 닫음. 실행기가 죽음 = 다음 `status`·`submit` 의 정리가 닫음
  - 핸들이 기록돼 있으면 그 탭, 없으면(띄우는 중에 죽음) 제목 검색
  - 띄우는 중에 취소하면 슬롯이 바로 비어 잠깐 상한보다 탭이 하나 많을 수 있음(실행기가 곧 닫음)
- 끝난 묶음 한 줄씩 `<풀 폴더>/log.jsonl` 에 남음. `run-metrics.mjs` 가 읽음. `note` 보정 줄은 같은 id 의 마지막 줄이 이김
