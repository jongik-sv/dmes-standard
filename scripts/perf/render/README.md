# MDM 화면 렌더링 시간 측정 하네스

## 용도
`docs/perf-render/mdm-findings.md` 의 **1차 스캔** 수치를 잰다. 출발점은 `docs/idea.md` 111~115 절
(「리팩토링 후속 → 화면 렌더링 시간 측정」)이다.

이번 리팩토링 측정은 서버 쿼리 수·처리량·빌드 시간 위주였고, 사용자가 실제로 느끼는
**메뉴 클릭 → 그리드 첫 행 표시** 시간을 아직 재지 않았다. 이 하네스가 그 빈틈을 메운다.

`scripts/perf/frontend/` 는 **m-mdm 빌드 시간** 하네스다(P2). 화면 렌더링 측정은 없다.
여기서는 그 하네스의 방법론(ABBA·load 기록·`keep` 열·저장소 밖 결과)만 빌려 썼다.

| 파일 | 역할 |
|---|---|
| `screens.mjs` | 측정 대상 화면 정의(메뉴 경로·breadcrumb·조회 URL 패턴). **환경 의존 값은 여기 없다** |
| `measure-screens.mjs` | 측정 본체. Playwright + CDP. login → 메뉴 이동 → 지표 수집 |
| `summarize.mjs` | `results.json` → 중앙값 요약(마크다운 또는 `--json`) |
| `run-measure.sh` | 실행기. 사전 확인 + `heavy.sh` 독점 슬롯 |
| `react-profiler-instrument.example.tsx` | React `<Profiler>` 임시 계측 예제. **제품 코드에 넣지 않는다** |

## 측정 창 규칙 (중요)
- **조정 세션이 「측정 시작」을 보내기 전에는 이 하네스를 돌리지 않는다.** 시간 잰 값은
  다른 무거운 작업이 멈춘 상태에서만 신뢰할 수 있다.
- `run-measure.sh` 는 기본값으로 `heavy.sh --exclusive` 로 감싼다. 슬롯을 90초 안에 못 얻으면
  `HEAVY_BUSY`(exit 75)로 끝난다 — 실패가 아니니 **같은 명령을 다시 부른다**.
- 무거운 명령은 저장소의 `.claude/skills/dflow-dev/scripts/heavy.sh` 를 거친다.

## 준비물
- macOS, node, git. **JVM·gradle 은 쓰지 않는다.**
- playwright 모듈이 보이는 곳에서 실행한다(저장소 안에서 돌리면 `src/frontend/node_modules` 가 보인다).
  다른 위치라면 `PLAYWRIGHT_PATH` 로 경로를 준다.
- **측정 대상 서버가 따로 있어야 한다.** 이 하네스는 서버를 **띄우지 않는다**(아래 §사용법 1~2단계).
- 측정 워크트리에 `pnpm install` 이 되어 있고, `shared` 가 빌드돼 있어야 한다
  (`next build` 로 프로덕션 번들을 만든다 — 1차 스캔 전에 1회, 무거운 일이므로 측정 창 안에서).

## 환경 변수
| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PERF_REPO` | `git rev-parse --show-toplevel` | 저장소 경로 |
| `PERF_OUT` | `${TMPDIR:-/tmp}/dmes-perf/render` | 결과 폴더. **저장소 밖**(원자료 trace 도 여기) |
| `RENDER_BASE_URL` | `http://localhost:5300` | 측정 대상 포털. 5100(dev) 을 쓰면 안 된다 |
| `RENDER_LOGIN_USER` | `admin` | 로그인 아이디 |
| `RENDER_LOGIN_PASSWORD` | `admin123` | 로그인 비밀번호 |
| `RENDER_ROUNDS` | `3` | 화면당 반복 횟수 |
| `RENDER_TAB_STATE` | `cold` | `cold`(처음 마운트) 또는 `warm`(숨어 있던 탭을 다시 보기) |
| `RENDER_SCREENS` | 전부 | comma 로 id 지정(`termMng,columnMng`). `--list` 로 목록 |
| `RENDER_TIMEOUT_MS` | `60000` | 요소 대기 상한. 첫 진입은 지연 로딩 청크 때문에 길다 |
| `LOAD_LIMIT` | `5` | 직전 load(1분)가 이 값을 넘으면 그 회차를 버린다(`keep=0`) |
| `RENDER_TRACE` | `0` | `1` 이면 CDP trace json 을 `$PERF_OUT/trace/` 에 쓴다. **크므로 기본 끔** |
| `RENDER_KEEP_OPEN` | `0` | `1` 이면 브라우저를 끝까지 열어 둔다(디버깅 전용) |
| `RENDER_NO_EXCLUSIVE` | `0` | `1` 이면 `heavy.sh` 독점을 건너뛴다. 신뢰도 낮음 |
| `HEAVY_SH` | `$PERF_REPO/.claude/skills/dflow-dev/scripts/heavy.sh` | 줄 세우기 경로 |
| `PLAYWRIGHT_PATH` | (비움) | playwright 모듈이 있는 폴더. 비우면 기본 탐색 |

## 사용법
1. **측정 워크트리 준비** (이 하네스의 저장소 밖 작업 — 측정 창 안에서 한다)
   ```
   cd <측정 워크트리>/src/frontend
   pnpm install --frozen-lockfile
   pnpm --filter @dk-oasis/shared build      # 번들에 shared 가 들어가므로 선행 빌드
   ```
2. **프로덕션 번들 미리보기 서버**를 5300 에 띄운다. 5100 dev 서버와 백엔드는 건드리지 않는다.
   ```
   cd <측정 워크트리>/src/frontend/m-mcm
   LIB_DEV_FORCE_BUILD=1 pnpm build
   pnpm start -- --port 5300      # next start
   ```
   - 수치는 **프로덕션 빌드 기준**이다. dev(Turbopack) 은 "왜 다시 그려지나" 를 볼 때만 쓴다.
3. **조정 세션에 「측정 시작」을 알린 뒤** 돌린다.
   ```
   bash scripts/perf/render/run-measure.sh 3
   # 특정 화면만:
   RENDER_SCREENS=termMng,columnMng bash scripts/perf/render/run-measure.sh 5
   # 이미 열린 탭을 다시 보는 비용:
   RENDER_TAB_STATE=warm bash scripts/perf/render/run-measure.sh 3
   # 요약만 다시:
   node scripts/perf/render/summarize.mjs
   ```

## 대상 화면과 지표
1차 스캔 후보는 `docs/idea.md:114` 에서 왔다. 우선순위 순으로 5개다.

| 순 | id | 화면 | 메뉴 경로 |
|---|---|---|---|
| 1 | `termMng` | 용어 관리 | 마루 MDM > 용어·도메인 > 용어 관리 |
| 2 | `columnMng` | 컬럼 사전 | 마루 MDM > 용어·도메인 > 컬럼 사전 |
| 3 | `layoutConfirm` | 전문 헤더 정의 | 마루 MDM > 레이아웃 > 전문 헤더 정의 |
| 4 | `dataMng` | 마루 데이터 | 마루 MDM > 마스터데이터 > 마루 데이터 |
| 5 | `codeMng` | 마루 코드 | 마루 MDM > 마스터코드 > 마루 코드 |

화면당 지표(모두 중앙값으로 낸다):

| 지표 | 뜻 |
|---|---|
| `shellReadyMs` | 메뉴 잎 클릭 → 화면 틀(breadcrumb) 표시 |
| `clickToRowMs` | 메뉴 잎 클릭 → 그리드 첫 행 표시 ← idea.md 의 원 지표 |
| `searchToRowMs` | [조회] 클릭 → 그리드 첫 행 표시 |
| `longTaskCount` / `SumMs` / `MaxMs` | `PerformanceObserver` `longtask`(50ms 이상) |
| `apiCount` / `apiTotalMs` / `apiSlowestMs` | `/api/` 호출 수·합계·가장 긴 것 |
| `scriptMs` / `taskMs` | CDP `Performance` — 스크립트 실행, 총 태스크 시간 |
| `layoutMs` / `layoutCount` | 강제 레이아웃 비용과 횟수 |
| `recalcStyleMs` / `recalcStyleCount` | 스타일 재계산 비용과 횟수 |
| `nodeDelta` / `heapDeltaMB` | DOM 노드·JS 힙 증감 |
| `renderCommits` / `renderCommitMs` / `renderTopIds` | React `<Profiler>` 커밋 수·시간 합·상위 id |

`cold` 와 `warm` 는 **다른 비용**이므로 섞지 않는다. 요약이 `tab_state` 로 구분해 낸다.
- `cold` — 탭이 처음 마운트. 사용자가 처음 여는 화면의 비용.
- `warm` — 이미 열었던 탭을 다시 눌렀을 때. `use-portal-tabs.ts:190-196` 이 이미 있는 탭은
  `setActiveTabId` 만 하고(재마운트 없음), `portal-shell.tsx:154` 가 `display` 로 숨김만 한다.
  탭을 많이 열어 둔 상태에서는 **숨어 있는 화면들이 전부 살아 있다** — 이것이 warm 측정이 필요한 이유다.

## 결과 형식
`$PERF_OUT` 아래(저장소에는 넣지 않는다).
- `results.json`: 회차별 원자료. 위 표의 모든 지표 + `load1`, `keep`, `rc`, `error`, `apiCalls`
- `results.csv`: 없음(1차가 라운드 구조라 json 로 충분하다. 비교 단계에서 csv 로 옮긴다)
- `env.txt`: 시작·끝 시각, base_url, 계정, 회차, tab_state, load_limit, 대상 화면, 전원 상태
- `trace/*.json`: `RENDER_TRACE=1` 일 때만. CDP 이벤트 원본(수백 MB 될 수 있다)

문서(`docs/perf-render/mdm-findings.md`)에는 **중앙값만** 옮긴다. 회차별 편차는 `results.json` 에 남는다.

## 알려진 문제·주의
- **계정에 MDM 버튼 권한이 있어야 한다.** MDM 목록 화면은 권한이 없으면 목록이 비어 보인다.
  `admin` 은 포털·MASTERCODE 계열만 볼 수 있다는 관측이 있다(2026-10-04).
  MDM 화면을 잴 때는 `RENDER_LOGIN_USER` / `RENDER_LOGIN_PASSWORD` 로 **MDM 권한 계정**을 준다
  (e2e 는 `e2e_mdm_stdadmin` / `e2e_mdm_steward` 를 쓴다 — `src/frontend/e2e/mdm-*.spec.ts`).
  0건이면 `clickToRowMs` 가 비고 **화면 준비 시간만** 나온다. 그 경우는 "0건" 으로 표기한다(삭제하지 않는다).
- **MDM 목록 화면은 진입 시 자동 조회를 하지 않는다**(의도된 제품 변경, cf4fbb05 2026-10-02).
  그래서 "메뉴 클릭 → 첫 행" 을 하나로 재면 조회 버튼 대기(사람이 누르는 시간)가 섞인다.
  하네스는 `shellReadyMs` / `searchToRowMs` / `clickToRowMs` 를 **따로** 낸다. 해석은 그 순서로 한다.
- **첫 진입은 지연 로딩 청크 때문에 느리다.** `warm` 예열 회차가 첫 진입 비용을 흡수한다.
- **로컬 SQLite 데이터 규모**라 운영보다 차이가 작게 나올 수 있다(`docs/idea.md:115`).
  이 한계는 결과 문서에 그대로 적는다 — 지표를 운영 성능으로 옮겨 적지 않는다.
- **헤드리스 + 단일 브라우저 1개.** 첫 회차가 그 뒤 회차보다 느리다(OS 파일 캐시·JIT).
  중앙값으로 줄인다. 3회 미만이면 `summarize.mjs` 가 경고를 낸다.
- **React `<Profiler>` 계측은 개발자 모드 이중 렌더를 포함한다.** 커밋 수를 production 번들로 읽는다.
- **trace 는 저장소에 넣지 않는다.** 용량이 커서 리포를 오염시킨다.
- 측정 중 다른 무거운 명령을 돌리지 않는다. 브라우저·서버는 측정 대상 외에는 건드리지 않는다.
- **저장·확정·삭제 단추를 누르지 않는다**(공용 로컬 DB). 이 하네스는 [조회] 만 누른다.
