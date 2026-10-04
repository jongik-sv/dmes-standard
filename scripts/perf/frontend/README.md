# 프론트 레인 측정 하네스

## 용도
`docs/refactor-2026-10/perf-frontend.md` 의 **P2. m-mdm 빌드 시간·메모리**(구조 변경 S2)를 다시 잰다.
기준과 변경 두 워크트리에서 `m-mdm` 의 `pnpm build` 를 콜드(산출물·캐시 삭제 뒤)와 웜(증분)으로 번갈아 돌려 시간(초)과 최대 RSS 를 남긴다.

| 파일 | 역할 |
|---|---|
| `p2-measure.sh` | P2 측정 본체 |
| `with-heavy.sh` | 선택. 작업 폴더에서 무거운 명령을 저장소의 `heavy.sh`(PC 전역 줄 세우기)로 감싸 돌리는 얇은 도우미다. 옛 레인 전용 도우미(c3-heavy.sh)의 자체 mkdir 잠금을 대신한다(잠금 회수·경쟁 처리는 heavy.sh 가 한다). `p2-measure.sh` 는 쓰지 않는다. 슬롯을 기다리다(기본 90초) 못 얻으면 HEAVY_BUSY(exit 75)로 끝나므로 같은 명령을 다시 부른다. |

## 준비물
- macOS(`/usr/bin/time -l`, `uptime`, `pmset` 사용), bash, git, awk.
- node 와 pnpm 이 PATH 에 있을 것(없으면 안내하고 종료). 경로를 박아 두지 않았다.
- pnpm 오프라인 저장소에 의존성이 있으면 빠르다(없으면 `--prefer-offline` 으로 내려받는다).
- 기준 ref 와 변경 ref 가 저장소에 있을 것(태그 `refactor-2026-10-base`, 브랜치 `dev`).

## 환경 변수
| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PERF_REPO` | 스크립트 위치에서 `git rev-parse --show-toplevel` | 저장소 경로 |
| `BASE_REF` | `refactor-2026-10-base` | 기준 A 의 ref |
| `CHANGE_REF` | `dev` | 변경 B 의 ref |
| `WT_BASE` | `$PERF_REPO/.claude/worktrees/perf-frontend-base` | 기준 측정용 워크트리. 없으면 detached 로 만든다 |
| `WT_CHANGE` | `$PERF_REPO/.claude/worktrees/perf-frontend-dev` | 변경 측정용 워크트리. 없으면 detached 로 만든다 |
| `PERF_OUT` | `${TMPDIR:-/tmp}/dmes-perf/frontend` | 결과 폴더(저장소 밖) |
| `LOAD_LIMIT` | `5` | 직전 load(1분)가 이 값을 넘으면 그 쌍을 버리고 다시 잰다 |
| `HEAVY_CMD` | 저장소의 `.claude/skills/dflow-dev/scripts/heavy.sh`(있을 때) | **`env.txt` 에 `heavy.sh status` 한 줄을 적는 데만** 쓰는 경로(상대 경로는 저장소 기준). 줄 세우기 래퍼가 아니다. 명시적으로 비우면 기록하지 않는다. 다른 하네스(framework·mcm)의 같은 이름 변수는 gradle 을 감싸는 줄 세우기 명령이라 뜻이 다르니 셸에 공용으로 export 하지 않는다. 독점 실행은 바깥에서 `heavy.sh --detach --exclusive bash scripts/perf/frontend/p2-measure.sh` 처럼 감싼다 |
| `PERF_CLEANUP` | `0` | `1` 이면 끝날 때 **스크립트가 만든** 워크트리를 `git worktree remove`(--force 없음)로 지운다 |
| `HEAVY_SH` | `$PERF_REPO/.claude/skills/dflow-dev/scripts/heavy.sh` | `with-heavy.sh` 가 감쌀 heavy.sh 경로(상대 경로면 실행 위치 기준으로 절대 경로로 바꾼다) |
| `VITEST_MAX_WORKERS` | `2` | `with-heavy.sh` 가 export 하는 vitest 작업자 수 |

이 하네스는 JAVA_HOME·gradle 을 쓰지 않는다.

## 사용법
1. 조정 세션이 「측정 시작」을 알려 다른 무거운 작업이 멈춘 뒤에 돌린다.
2. 실행(회차 수 기본 4):
   ```
   bash scripts/perf/frontend/p2-measure.sh 4
   # 줄 세우기와 함께(독점):
   .claude/skills/dflow-dev/scripts/heavy.sh --detach --exclusive bash scripts/perf/frontend/p2-measure.sh 4
   # 출력된 id 로 heavy.sh wait <id> 를 부른다. 한 번에 최대 240초만 기다리므로 HEAVY_JOB_RUNNING(exit 76)인 동안 같은 wait 를 다시 부른다(HEAVY_JOB_BUSY 면 다시 --detach).
   ```
3. 스크립트가 하는 일
   1. 측정용 워크트리 두 개 준비(없으면 생성), 각각 `pnpm install --offline --frozen-lockfile`(실패 시 `--prefer-offline`) 뒤 `shared` 빌드(재지 않음).
   2. 예열: A·B 콜드 빌드를 한 번씩 하고 버린다(OS 파일 캐시를 맞춘다).
   3. 회차 1..N: 홀수 회차 A→B, 짝수 회차 B→A(ABBA). 워크트리마다 콜드 → 바로 웜.
   4. 각 빌드는 `m-mdm` 에서 `LIB_DEV_FORCE_BUILD=1 /usr/bin/time -l pnpm build`.
4. 결론은 `results.csv` 에서 `keep=1` 인 행의 중앙값으로 낸다.

## 기준 커밋·변경 커밋
- 기준: `refactor-2026-10-base`(b557ccbd) — 기본 ref 는 `BASE_REF`.
- 변경: `dev` — 기본 ref 는 `CHANGE_REF`. 이전 측정은 dev efb39f2c 였다. 재현할 때는 `CHANGE_REF=<커밋>` 으로 고정해 두면 편하다. 실제로 쓰인 커밋은 `env.txt` 에 남는다.

## 결과 형식
`$PERF_OUT` 아래(저장소에는 넣지 않는다).
- `results.csv`: 컬럼 `round,wt,kind,sec,maxrss_bytes,load1,load5,rc,keep`
  - round 0 은 예열(버림), wt 는 A(기준)/B(변경), kind 는 cold/warm
  - maxrss_bytes 는 `/usr/bin/time -l` 의 maximum resident set size(바이트, 자식 가운데 가장 큰 단일 프로세스). 문서에는 10⁹ 으로 나눠 GB 로 적는다.
  - rc 는 빌드 종료 코드, keep=0 은 load 초과로 버린 값
- `env.txt`: 시작·끝 시각, A·B 의 ref 와 커밋, 전원 상태, (`HEAVY_CMD` 가 있으면) heavy 상태
- `r<회차>-<A|B>-<cold|warm>.log`, `prep-<A|B>-install.log`, `prep-<A|B>-shared.log`: 원본 로그

## 알려진 문제·주의
- **콜드 삭제 범위**: `m-mdm/dist`, `m-mdm/node_modules/.cache`, `m-mdm/*.tsbuildinfo` 만 지운다. `WT_BASE`·`WT_CHANGE` 는 `git worktree list` 에 있는 측정용 워크트리여야 하고, 메인 체크아웃(목록 첫 항목)·저장소 루트이거나 목록에 없으면 설치·삭제·빌드 전에 종료한다. 이미 있는 워크트리는 HEAD 가 요청 ref 와 다르면 종료한다. 메인 체크아웃과 실행 중인 서버는 건드리지 않는다. 그래도 `WT_BASE`·`WT_CHANGE` 를 메인 체크아웃으로 지정하지 않는다.
- OS 페이지 캐시는 sudo 없이 비울 수 없어 예열로 맞춘다.
- **load 기록**: 빌드마다 직전 load(1분·5분)를 남긴다. 1분 load 가 `LOAD_LIMIT` 를 넘으면 그 쌍을 버리고 60초 뒤 다시 잰다(최대 3번, 모두 넘으면 keep=0 행만 남는다).
- **반복 측정**: 1회 값으로 결론 내지 않는다. 팬 없는 기기는 열 때문에 회차가 지날수록 느려질 수 있어 ABBA 순서로 상쇄하고 중앙값을 쓴다.
- 기준은 tsup rollup-plugin-dts 라 웜이 콜드와 거의 같고, 변경은 tsc 증분이라 웜이 훨씬 빠르다. 변경 ref 는 dev 라 6번 밖의 변경도 섞인다.
- 예열의 load 가 높아 버려질 수 있다. 이전 측정에서도 예열 A 콜드 1회가 load 5.08 로 버려졌다.
- 측정 중 다른 무거운 명령을 돌리지 않는다.
