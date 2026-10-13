# 2026-10-09 Oracle 시험 차례 교착으로 heavy 슬롯·PC Oracle 잠금이 묶인 사례

조정 회차 logfmt-1008 (조정 세션 dmes-standard-2a) 에서 09:03~09:19 동안 일어난 일을 기록한다.
스킬 스크립트를 sh 에서 js 로 옮기면서 함께 고칠 문제의 근거 자료다([idea.md](../idea.md) 「스킬을 OS 중립적으로」).

## 1. 무엇이 막혔나

| 시각 | 일 |
|---|---|
| 09:03 | jsched-tx 레인(워크트리 `dmes-wt/job-tx-modules`)이 `heavy.sh ../gradlew test --continue -Pdmes.ora.test=clone --max-workers=2` 로 mcm 시험 시작. heavy slot-2 를 받고, 빌드 안의 `pdb.mjs lock-hold`(pid 22527)가 PC Oracle 잠금(`$TMPDIR/dmes-ora-pdb.lock`)을 잡음 |
| 09:0x | fx-master 레인(`dmes-wt/mdm-fx-master`)의 `heavy.sh ./gradlew :mcm-core:test -Pdmes.ora.test=clone --tests …` 가 heavy slot-1 을 받은 뒤 PC Oracle 잠금을 기다림(lock-hold pid 57131, `--wait-sec 7200`) |
| 09:0x | 조정자의 `heavy.sh ./be-run.sh --mcm --pdb=L_MAIN`(날씨 머지 반영 재기동)이 두 슬롯이 모두 차 있어 90초 뒤 `HEAVY_BUSY … exit 75` 로 끝남 → `DFLOW_HEAVY_WAIT=2400` 으로 다시 줄 섬 |
| 09:08 | 조정자 관찰: 두 Gradle 데몬 CPU 0%, 시험 JVM 은 일감 없이 대기, sqlplus·podman exec 없음, Oracle 컨테이너 CPU 3.9%(메모리 2.1/3.0GB). 실제로 일하는 작업이 없는데 heavy 2슬롯과 Oracle 잠금이 모두 묶임 |
| 09:08 | jsched-tx 데몬(pid 17634) jstack: `included builds Thread 5` 가 `test-slot.gradle` → `DmesTestConventions:80` → `OraTestPdbService.acquireTurn:305` → `:298 JVM_MONITOR.wait` 에서 차례 대기, `Execution worker` 는 `getNextItem` 대기(돌 일이 없음). 덤프: `~/.coord/logfmt-1008/lanes/jsched-tx/jstack-0908-daemon17634.txt` |
| ~09:14 | 레인이 넣어 둔 차례 대기 상한(1시간 → 10분)에 걸려 빌드 실패 |
| 09:19 | PC Oracle 잠금 풀림(`owner` 파일 없음) → 줄 서 있던 작업 진행 |

막힌 시간은 약 16분이다. 대기 상한이 예전 값(1시간)이었다면 1시간 내내 PC 의 Oracle 시험과 heavy 작업 전체가 멈췄다.

## 2. 원인

### 2.1 빌드 안의 Oracle 시험 차례 교착 (H1, 레인이 덤프로 확정)

- 한 Gradle 빌드에 Oracle 시험 태스크가 여럿이면(mcm 의 `:lib:test`·`:api:test`) JVM 하나의 모니터(`TURN_OWNER`)로 차례를 하나씩 준다.
- 차례는 시험이 끝난 뒤 마무리 태스크(`<test>OraTurnRelease`)가 놓는다.
- 증거: `mcm/lib/build/test-results` 에 결과 XML 3개가 있어 `:lib:test` 는 끝났는데, 출력에 `> Task :lib:testOraTurnRelease` 가 없다.
- `:lib:test` 의 마무리 태스크와 `:api:test` 가 동시에 실행 후보가 됐고 Gradle 이 `:api:test` 를 먼저 골랐다. `:api:test` 가 차례를 기다리는 동안 프로젝트 잠금을 쥐고 있어 마무리 태스크가 시작하지 못한다. 서로 기다린다.
- 합성 빌드(composite-seq 0/5·composite-multi 0/6)로는 재현되지 않았다. 마무리 태스크가 먼저 골라지면 문제가 없으므로 실행 순서에 따라 갈리는 경쟁 조건이다.

### 2.2 기다리는 작업이 heavy 슬롯을 쥔다 (heavy.sh)

- heavy.sh 는 명령 전체를 슬롯 하나로 센다. 명령 안에서 Oracle 잠금을 기다리는 동안에도 슬롯을 놓지 않는다.
- 그래서 「Oracle 잠금을 쥔 채 교착된 빌드 1개 + 그 잠금을 기다리는 빌드 1개」 가 PC 슬롯 2개를 모두 차지했다. Oracle 과 상관없는 백엔드 재기동까지 줄을 섰다.
- heavy.sh 의 기본 대기 상한은 90초라, 줄 선 쪽은 오류처럼 보이는 `exit 75` 로 끝난다(실패가 아니라 「나중에 다시」). 호출하는 쪽이 이 규약을 알아야 한다.

## 3. 같은 시간대의 관련 사례

- **be-run.sh 한 모듈 재기동이 나머지 모듈을 내림(09:20)**: `be-run.sh --mcm --pdb=L_MAIN` 은 같은 체크아웃에서 도는 이전 `be-run.sh` 인스턴스(`--pdb=L_MAIN` 으로 mcm·mdm·analog 를 띄운 것)를 통째로 끝낸다(`terminate_previous_be_runs`). 그래서 mdm(8096)·analog(8191)가 함께 내려갔고, 세 모듈을 다시 띄워야 했다. 한 모듈만 바꾸려면 함께 떠 있던 모듈을 모두 다시 지정해야 한다.
- **위험 rm 확인 창으로 레인 정지(09:0x, js-w3a)**: 레인이 `cd /tmp/mwt && rm -rf * …` 를 실행하려 하자 Claude Code 가 bypass 모드에서도 「Dangerous rm operation on statically-unresolvable target」 확인 창을 띄웠다. 60초 뒤 자동 거부되면 레인은 「Interrupted · What should Claude do instead?」 로 멈춘 채 남는다. 조정자 틱(7분)이 볼 때까지 멈춰 있었다. 조치: 거부하고 `mktemp -d` 새 폴더를 쓰도록 지시, prompt-watch `--follow` 실시간 감시를 켬.
- **prompt-watch 오탐(09:1x, js-w1a)**: 실행 중인 명령 본문에 시험용 문자열 `❯ 1. Yes / 2. No` 가 있자 선택 창(choice)으로 판정했다. 화면에는 진행 표시(`✽ …ing`)가 있었다.

## 4. 대책

| 구분 | 내용 | 상태 |
|---|---|---|
| A | 시험 태스크가 끝나는 즉시(afterSuite root·doLast) 차례를 놓고, 준비 실패 때도 그 자리에서 놓는다. 마무리 태스크는 보험 | jsched-tx tx-5 진행 중(브랜치 `fix/ora-turn-deadlock`) |
| B | `mustRunAfter` 사슬로 순서 강제 | 보류(의존 방향과 엇갈리면 순환, 효과 미증명) |
| C | Gradle `BuildService` + `maxParallelUsages=1` 로 Gradle 이 배타 실행 | 조사 후보. included build 사이에서는 서비스가 빌드마다 따로 생겨 막지 못할 수 있다 |
| D | Oracle 시험을 모듈마다 따로 실행 | 급할 때 우회책 |
| E | 차례 대기 상한 1시간 → 10분, 초과 메시지에 `gradlew --stop` 안내 | 반영(tx-5) |
| F | Oracle 잠금을 기다리는 동안 heavy 슬롯을 쥐지 않게(잠금을 먼저 받고 슬롯을 받거나, 대기 중 슬롯 반납) | 반영(2026-10-12). `heavy.mjs` 가 Oracle 시험 명령(`dmes.ora.test=clone`·`dmes.ora.pdb`, 또는 `--oracle`)이면 슬롯과 PC Oracle 시험 자리(잠금 세분화로 생긴 seat, [2026-10-12 기록](2026-10-12-oracle-test-seats-trial.md))를 한 번에 잡고, 자리를 못 잡으면 슬롯을 곧바로 돌려주고 기다린다. 잡은 자리는 `DMES_ORA_SEAT_HELD` 로 Gradle 에 넘긴다 |
| G | heavy.sh 대기 상한·`exit 75` 규약을 호출 쪽이 알게(기본 상한 재검토, 줄 선 상태를 보이게) | 반영(2026-10-13). `heavy.mjs` 의 `HEAVY_BUSY`·`HEAVY_DOCKER_BUSY` 줄 끝에 `— 줄 <번째>/<전체> waited=<초>s queued=<초>s · exit 75 = 나중에 다시(실패 아님)` 를 붙였다(줄 머리 형식은 그대로). BUSY 로 끝나면 줄 자리를 남겨, 같은 cwd·명령을 180초 안에 다시 부르면 처음 줄 선 시각을 이어받는다(gradlew 감싸기의 자동 재호출·deps·baseline 재호출도 순서를 잃지 않는다). `status` stderr 에 `HEAVY_QUEUE` 줄, `snapshot` `WAIT` 줄 끝에 state 칸. 기본 상한 90초는 그대로 둔다(Bash 기본 timeout 120초 안에 돌아와야 하고, 이어받기로 짧은 상한이 순서를 잃게 하지 않는다) |
| H | be-run 이 한 모듈 재기동 때 다른 모듈을 내리지 않게(모듈 단위로 이전 인스턴스 정리) | 반영(2026-10-09, `5b1374890` 와 후속 4건). `be-run.sh` 가 모듈마다 소유 기록(`.be-run/<모듈>.own`)을 남기고, 새 실행은 고른 모듈의 앱 JVM 만 내린다. 이전 be-run 은 남은 모듈을 계속 맡고, 모듈을 모두 빼앗기면 exit 79 로 끝난다. 2026-10-13 실측: `--mcm --mdm --pdb=L_MAIN` 위에 `--mcm --pdb=L_MAIN` → mdm 8096 유지, 이전 be-run 생존. 회귀 시험 `scripts/tests/be-run-restart.sh`. 남음: Windows `be-run.ps1` 은 아직 이전 인스턴스를 통째로 끝낸다 |
| J | heavy.sh 로 서버(be-run)를 감싸면 서버가 떠 있는 내내 자리를 쥔다(09:2x 조정자가 겪음). 빌드 구간만 자리를 쓰게(be-run 이 빌드 뒤 자리 반납, 또는 `--build-only` 만 heavy) | 반영(2026-10-13). `be-run.sh` 가 Gradle 빌드만 `node heavy.mjs -- <gradlew …>` 로 돌리고(exit 75 면 다시 줄 섬) 서버는 슬롯 밖에서 띄운다. 빌드는 이전 서버를 내리기 전에 해서 슬롯 대기·빌드 실패 동안 이전 서버가 계속 돈다. 빌드에는 `DMES_ORA_PDB`·`DMES_ORA_TEST` 를 넘기지 않는다(Oracle 시험 자리 오인 방지). be-run 을 heavy 로 감싸 서버를 띄우면(`DFLOW_HEAVY_HELD`) 경고한다. 끄기 `BE_HEAVY_BUILD=0`. 종전 bootRun 방식·Windows 는 종전 순서(내린 뒤 빌드)라 슬롯 없이 빌드. 조정자 `heavy.md` §1·`closing.md` §2 에 「be-run 을 감싸지 않음」 추가 |
| K | 일반 자리에는 줄 순서가 없다(독점만 start 순). 09:19 부터 기다린 fx-master pnpm install 이 26분 넘게 못 받는 동안 js 레인 하니스가 연속으로 자리를 받음 → 오래 기다린 순서대로 주기, 대기 시간 상한 넘으면 우선 | 반영(2026-10-13). `heavy.mjs` 가 일반·E2E 슬롯을 오래 기다린 순으로 준다. 빈 슬롯이 n개면 먼저 줄 선 「받을 수 있는」 대기자(state slot·queue·load·yield)가 n명 미만일 때만 잡는다. Oracle 자리 대기(ora)·독점 대기(excl)·도커 슬롯 대기·30초 넘게 표식을 고치지 않은 대기자·옛 heavy.sh 표식은 뒤를 막지 않는다. 앞 대기자가 빈 슬롯을 30초(`DFLOW_HEAVY_FAIR_GRACE`) 넘게 안 가져가면 순서를 건너뛴다(교착·기아 방지). 「대기 상한 넘으면 우선」 은 먼저 줄 선 순서와 줄 자리 이어받기(G)로 대신했다 |
| I | prompt-watch: 진행 표시가 있으면 창 아님, 자동 거부 뒤 「Interrupted」 상태를 감지해 조정자에게 알림 | prompt-watch js 이식(W3) 때 |
