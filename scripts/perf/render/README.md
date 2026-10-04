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
| `RENDER_TAB_STATE` | `cold` | `cold`(처음 마운트) 또는 `warm`(숨어 있던 탭을 다시 보기). **1차는 `cold` 만**(지시 2-2) |
| `RENDER_SCREENS` | 전부 | comma 로 id 지정(`termMng,columnMng`). `--list` 로 목록 |
| `RENDER_TIMEOUT_MS` | `60000` | 요소 대기 상한. 첫 진입은 지연 로딩 청크 때문에 길다 |
| `LOAD_LIMIT` | `5` | 직전 load(1분)가 이 값을 넘으면 그 회차를 버린다(`keep=0`) |
| `RENDER_TRACE` | `0` | `1` 이면 CDP trace json 을 `$PERF_OUT/trace/` 에 쓴다. **크므로 기본 끔** |
| `RENDER_KEEP_OPEN` | `0` | `1` 이면 브라우저를 끝까지 열어 둔다(디버깅 전용) |
| `RENDER_ISOLATE` | `0` | `1` 이면 cold 에서 **화면마다 새 컨텍스트**(새 로그인·빈 localStorage)를 쓴다. 0 이면 회차의 6화면이 컨텍스트 하나를 나눠 써 앞 화면 탭이 뒤 화면 진입 때 복원된다(진입 API 27→47건). 화면 간 비교·진입 비용은 `1` 로 잰다 |
| `RENDER_HOME_IDLE` | `1` | 메뉴를 누르기 전에 포털 홈 로딩(`/api/` 호출·50ms 넘는 task)이 `RENDER_HOME_IDLE_QUIET_MS`(500) 동안 멈출 때까지 기다린다(상한 `RENDER_HOME_IDLE_MAX_MS` 10000). `0` 이면 2026-10-04 검증 때와 같은 진입 조건이다(전후 비교용) |
| `RENDER_WARMUP` | `1` | cold 측정 앞에 예열 회차(round 0)를 돌리고 `keep=0`·`warmup=1` 로 남긴다. `0` 이면 끈다 |
| `RENDER_FULL_VIEW` | `0` | `1` 이면 첫 조회 뒤 상한 안내 띠의 [전체 보기] 를 눌러 상한 없는 재조회도 잰다(`fullView*` 필드) |
| `RENDER_NO_EXCLUSIVE` | `0` | `1` 이면 `heavy.sh` 독점을 건너뛴다. 신뢰도 낮음 |
| `HEAVY_SH` | `$PERF_REPO/.claude/skills/dflow-dev/scripts/heavy.sh` | 줄 세우기 경로 |
| `PLAYWRIGHT_PATH` | (비움) | playwright 모듈이 있는 폴더. 비우면 기본 탐색 |

## 사용법
0. **기준 브랜치 갱신** (지시 2-4). 1차는 dev 만 잰다. 측정 직전에 dev 최신을 합친다.
   ```
   /usr/bin/git -C <측정 워크트리> merge dev
   ```
1. **`pnpm install` 과 `shared` 빌드** — 무거우므로 `heavy.sh` 를 거친다(지시 2-4).
   ```
   cd <측정 워크트리>/src/frontend
   <저장소>/.claude/skills/dflow-dev/scripts/heavy.sh -- pnpm install --frozen-lockfile
   <저장소>/.claude/skills/dflow-dev/scripts/heavy.sh -- pnpm --filter @dk-oasis/shared build
   # m-mcm 번들은 형제 패키지(m-mdm·m-analog 등)의 dist 도 가져온다. 빼먹으면 next build 가
   # "Can't resolve '@dk-oasis/m-mdm/pages/...'" 로 실패한다.
   LIB_DEV_FORCE_BUILD=1 <저장소>/.claude/skills/dflow-dev/scripts/heavy.sh -- node scripts/lib-dev.mjs build m-mpn m-mpp m-mqc m-mls m-mdm m-analog
   ```
   `shared` 를 먼저 빌드해야 한다 — 번들에 shared 가 들어가기 때문이다.
2. **`.env` 사본을 준비한다** (지시 2-4). 메인 체크아웃의 `src/frontend/m-mcm/.env` 을 **워크트리로 복사**하고,
   사본에서 `NEXTAUTH_URL` **만** `http://localhost:5300` 으로 바꾼다. **메인 쪽 `.env` 는 고치지 않는다.**
   ```
   cp <메인 저장소>/src/frontend/m-mcm/.env <측정 워크트리>/src/frontend/m-mcm/.env
   # 사본에서 이 한 줄만 바꾼다
   #   NEXTAUTH_URL="http://localhost:5100"  →  NEXTAUTH_URL="http://localhost:5300"
   ```
   - `.env` 는 `.env*` 규칙으로 git 무시된다(`m-mcm/.gitignore:34`). **커밋되지 않는다.**
   - ★`OIDC_ISSUER` 는 **5300 으로 바꾸지 않는다**(지시대로 `NEXTAUTH_URL` 만).
     그래서 5300 주소로 인증을 요청하면서 서명 원본과 발급 대상 주소가 달라질 수 있다.
     **인증이 막히면(OIDC_ISSUER 등) 우회하지 말고 멈추고 report.md 에 보고한다.**
   - 로그인 쿠키는 **포트가 아니라 호스트(`localhost`) 단위**라 5300 로그인이 5100 의 세션 쿠키와
     겹칠 수 있다. 그래서 **admin / admin123 만** 쓴다(지시 2-3). 비밀번호를 틀리면 계정이 잠긴다.
3. **프로덕션 번들을 만든다** — 무거우므로 `heavy.sh` 를 거친다.
   ```
   cd <측정 워크트리>/src/frontend/m-mcm
   LIB_DEV_FORCE_BUILD=1 <저장소>/.claude/skills/dflow-dev/scripts/heavy.sh -- pnpm build
   ```
4. **5300 미리보기 서버를 띄운다.** 5100 dev 서버와 백엔드는 건드리지 않는다.
   ```
   cd <측정 워크트리>/src/frontend/m-mcm
   ./node_modules/.bin/next start -p 5300   # package.json 의 start 는 --port 5100 을 박아 두어 `pnpm start -- --port 5300` 은 실패한다
   ```
   - 수치는 **프로덕션 빌드 기준**이다. dev(Turbopack) 은 "왜 다시 그려지나" 를 볼 때만 쓴다.
   - **작업이 끝나면 5300 서버는 반드시 내린다**(지시 2-4).
   - 끝난 뒤 **5100 에서 admin 로그인이 여전히 되는지 한 번 확인한다**(쿠키 겹침 확인, 지시 2-4).
5. **조정 세션에 「측정 시작」을 알린 뒤** 돌린다.
   ```
   bash scripts/perf/render/run-measure.sh 3
   # 특정 화면만:
   RENDER_SCREENS=termMng,columnMng bash scripts/perf/render/run-measure.sh 5
   # 요약만 다시:
   node scripts/perf/render/summarize.mjs
   ```
   - 1차 스캔은 **`cold` 만** 돌린다(지시 2-2). `warm` 은 2차에서 느린 Top 3 에 대해서만이다.
   - `RENDER_TAB_STATE=warm` 은 구현되어 있으니 2차에서 그대로 쓴다.

## 대상 화면과 지표
1차 스캔 후보는 `docs/idea.md:114` 에서 왔다. 우선순위 순으로 5개다.

| 순 | id | 화면 | 메뉴 경로 |
|---|---|---|---|
| 1 | `termMng` | 용어 관리 | 마루 MDM > 용어·도메인 > 용어 관리 |
| 2 | `columnMng` | 컬럼 사전 | 마루 MDM > 용어·도메인 > 컬럼 사전 |
| 3 | `layoutConfirm` | 레이아웃 확정 | 마루 MDM > 레이아웃 > 레이아웃 확정 |
| 4 | `dataMng` | 마루 데이터 | 마루 MDM > 마스터데이터 > 마루 데이터 |
| 5 | `codeMng` | 마루 코드 | 마루 MDM > 마스터코드 > 마루 코드 |
| 6 | `headerMng` | 전문 헤더 정의 | 마루 MDM > 레이아웃 > 전문 헤더 정의 |

「전문 헤더 정의」는 headerMng 메뉴다. layoutConfirm 은 별도 메뉴 「레이아웃 확정」이다(`MdmMenuSeeder.java:589`, findings §4.9). headerMng 는 경로 정정 과정에서 6번째 대상으로 남았다.

화면당 지표(모두 중앙값으로 낸다):

| 지표 | 뜻 | 순위 |
|---|---|---|
| `searchToRowMs` | [조회] 클릭 → 그리드 첫 행 표시 | **★본 지표★** (1건 이상인 화면) |
| `searchResponseToEmptyMs` | 조회 응답 → 그리드 빈 상태 표시 | **★본 지표★** (0건인 화면) |
| `shellReadyMs` | 메뉴 잎 클릭 → 화면 틀(breadcrumb) 표시 | 함께 낸다 |
| `clickToRowMs` | 메뉴 잎 클릭 → 그리드 첫 행 표시 | 참고값만(조회 대기 시간이 섞인다) |
| `searchToEmptyMs` | [조회] 클릭 → 빈 상태 표시 | 참고값 |
| `inPageSearchToRowMutMs` | [조회] 클릭(event.timeStamp) → 첫 행 DOM 삽입(MutationObserver), **페이지 안 시계** | **화면 간 비교·예산은 이 값으로 본다** |
| `inPageSearchToRowFrameMs` | 위와 같고 끝이 첫 행 삽입 뒤 다음 프레임 | 참고 |
| `searchBeforeClick` | 클릭 전에 이미 나간 조회 요청 수. 1 이상이면 진입 자동 조회라 주 지표 무효 | 판정 |
| `apiAfterMenuClick` / `authMeAfterMenuClick` / `authMeAll` | 메뉴 잎 클릭 뒤 호출 수 / 그중 `/api/auth/me` / 페이지 전체 `/api/auth/me` | 진입 비용 |

**★`searchToRowMs` 는 폴링 격자에 붙는다★** Playwright `waitFor` 는 0·20·50·100·100·500ms 간격으로
다시 확인한다(playwright-core 1.62 `retryWithProgressAndBackoff`). 270ms 를 넘으면 해상도가 500ms 가 되어
columnMng 는 실제 ≈380ms 가 ≈820ms 로, termMng 는 ≈167ms 가 ≈210ms 로 잡혔다(2026-10-04 검증,
`docs/perf-render/mdm-findings-verification.md`). `searchToRowMs` 는 순위 확인용으로만 쓰고 값은 `inPage*` 로 읽는다.

**본 지표가 `searchToRowMs` 인 이유** (지시 2-1): 사용자가 실제로 기다리는 구간이기 때문이다.
원 지표였던 `clickToRowMs` 는 MDM 목록 화면이 진입 시 자동 조회를 하지 않으므로
(`e2e/support/mdm-e2e.ts:66-68`, 의도된 제품 변경 cf4fbb05 2026-10-02)
**사람이 [조회] 단추를 누르기까지의 대기 시간이 섞인다.**

**0건 화면 처리** (지시 2-1): 조회 결과가 0건이면 첫 행이 없으니 `searchToRowMs` 를 낼 수 없다.
`searchResponseToEmptyMs`(조회 응답 → `.ag-overlay-no-rows-wrapper` 표시)로 대신 잰다.
두 시계 축이 달라서(CDP 응답 시각은 epoch, DOM 표시 시각은 `performance.now()`)
측정 시작점에서 축을 맞추는 장치가 코드에 있다. `summarize.mjs` 는 어느 지표를 썼는지
`row_mode` 로 명시하고, 0건 화면에는 **다른 화면과 같은 선으로 비교하지 말 것** 이라고 경고를 낸다.
| `longTaskCount` / `SumMs` / `MaxMs` | `PerformanceObserver` `longtask`(50ms 이상) |
| `apiCount` / `apiTotalMs` / `apiSlowestMs` | `/api/` 호출 수·합계·가장 긴 것 |
| `scriptMs` / `taskMs` | CDP `Performance` — 스크립트 실행, 총 태스크 시간 |
| `layoutMs` / `layoutCount` | 강제 레이아웃 비용과 횟수 |
| `recalcStyleMs` / `recalcStyleCount` | 스타일 재계산 비용과 횟수 |
| `nodeDelta` / `heapDeltaMB` | DOM 노드·JS 힙 증감 |
| `renderCommits` / `renderCommitMs` / `renderTopIds` | React `<Profiler>` 커밋 수·시간 합·상위 id |

**1차 스캔은 `cold` 만** 돌린다(지시 2-2). `warm` 은 2차에서 **느린 Top 3 에 대해서만** 잰다.
- `cold` — 화면마다 새 페이지. 탭이 처음 마운트된다. 사용자가 처음 여는 화면의 비용.
- `warm` — 이미 열었던 탭을 다시 눌렀을 때. `use-portal-tabs.ts:190-196` 이 이미 있는 탭은
  `setActiveTabId` 만 하고(재마운트 없음), `portal-shell.tsx:154` 가 `display` 로 숨김만 한다.
  탭을 많이 열어 둔 상태에서는 **숨어 있는 화면들이 전부 살아 있다** — 이것이 warm 측정이 필요한 이유다.
  1차에서 이 문제를 놓치지 않으려면, `cold` 결과가 나면 곧바로 Top 3 에 `warm` 을 돌린다.

## 렌더 횟수 세기 — `count-renders.mjs`
시간이 아니라 **동작별 React 커밋 수와 다시 그려진 컴포넌트**를 센다(중복 렌더링 찾기). 시간 측정과 같은 실행에 섞지 않는다.
- 대상 서버는 `next build --profile --no-mangling` 번들로 띄운다. `--profile` 이 없으면 시간(actualDuration·selfBaseDuration)이
  비고, `--no-mangling` 이 없으면 컴포넌트 이름이 `a9`·`e` 처럼 깨진다. **dev 서버는 쓰지 않는다**(StrictMode 이중 렌더가 섞인다).
  측정이 끝나면 일반 `next build` 로 되돌린다.
- 제품 코드는 고치지 않는다. 페이지 로드 전에 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 흉내를 심어 커밋마다 렌더된 컴포넌트를 모은다.
- 동작: ① 메뉴 진입 ② [조회] ③ 첫 행 클릭(선택만) ④ 다른 화면 갔다가 탭 복귀. 결과 `$PERF_OUT/renders.json`.
  ```
  RENDER_SCREENS=termMng PERF_OUT=<저장소 밖 폴더> node scripts/perf/render/count-renders.mjs
  ```

- ⑤ 상세 폼 입력: `screens.mjs` 에 `formInput` 이 있는 화면(columnMng 표시명 긴, termMng 맥락)은 탭 복귀 뒤 그 칸에
  `RENDER_INPUT_TEXT`(기본 `ABCDE`)를 150ms 간격으로 친다. **저장하지 않고** 컨텍스트를 닫는다. 요약에 한 글자당 커밋·렌더 시간이 나온다.

## 응답 뒤 CPU 배분 — `cpu-profile-search.mjs`
조회 응답이 온 뒤 첫 행까지의 CPU 를 함수·청크(AG Grid·React·Mantine·화면 코드·엔진)별로 나눈다. 행 가공이 무거운지(가이드 R11) 볼 때 쓴다.
- `count-renders.mjs` 와 같은 `next build --profile --no-mangling` 번들을 쓴다. 프로파일러가 켜진 측정이라 절대값보다 비율로 읽는다.
- 모드: `limit`([조회], 상한 적용) · `full`([조회] 뒤 [전체 보기]). 화면·모드·회차마다 새 컨텍스트.
  ```
  RENDER_SCREENS=columnMng,termMng CPU_MODES=limit,full RENDER_ROUNDS=3 PERF_OUT=<저장소 밖 폴더> node scripts/perf/render/cpu-profile-search.mjs
  ```
- 결과: `$PERF_OUT/cpu-profile.json`(회차별 `afterHeaders`·`afterFinished` 의 `byFile`·`selfTop`·`inclTop`)과 회차별 `.cpuprofile`(DevTools Performance 패널로 열린다).
- `(program)` 은 V8 내부 작업(응답 본문 JSON 파싱 포함)이다. 상한 경로의 `getClientRects` ≈2.7ms 는 측정기의 첫 행 판정 몫이다.

## 결과 형식
`$PERF_OUT` 아래(저장소에는 넣지 않는다).
- `results.json`: 회차별 원자료. 위 표의 모든 지표 + `load1`, `keep`, `rc`, `error`, `apiCalls`, `searchRows`·`searchTotalCount`·`searchTruncated`(응답 본문에서), `apiAfterMenuClickNames`(진입 호출 경로), `warmup`, `fullView*`
- `results.csv`: 없음(1차가 라운드 구조라 json 로 충분하다. 비교 단계에서 csv 로 옮긴다)
- `env.txt`: 시작·끝 시각, base_url, 계정, 회차, tab_state, load_limit, 대상 화면, 전원 상태
- `trace/*.json`: `RENDER_TRACE=1` 일 때만. CDP 이벤트 원본(수백 MB 될 수 있다)

문서(`docs/perf-render/mdm-findings.md`)에는 **중앙값만** 옮긴다. 회차별 편차는 `results.json` 에 남는다.

## 알려진 문제·주의
- **계정은 `admin` / `admin123` 뿐이다** (지시 2-3). 2026-10-04 15:4x 통합 확인에서 이 계정으로
  용어 관리 "코일" 22건, 컬럼 관리 7,858건, 데이터 18건, 코드 17건이 나왔다.
  ★"코일" 22건은 키워드 조회 값이다. 하네스는 조건 없는 조회를 재며, 그때 용어 관리는 8,155건·3.07MB 다(2026-10-04 검증).
  **다른 계정은 쓰지 않는다 — 비밀번호를 틀리면 계정이 잠기고 5회 실패 시 잠긴다.**
  로그인 실패가 한 번이라도 나면 스크립트는 **재시도하지 않고** 즉시 끝난다. 그때 `report.md` 에 보고한다.
- **데이터 규모가 화면마다 다르다.** 하네스가 재는 조건 없는 조회 기준으로 컬럼 관리 7,858건, 용어 관리 8,155건이다(2026-10-04 검증). 코드 17건·데이터 18건은 위 통합 확인 기준이다.
  `searchToRowMs` 는 **데이터 건수가 많을수록 자연스럽게 커진다.** 화면 간 절대값 비교는
  「1건 렌더 비용 + 데이터 건수」가 섞인 값이라는 점을 기억하고 읽는다.
  건수 대비 비용을 보려면 `searchToRowMs` 를 `row_mode`·건수와 함께 본다.
- **0건 화면이 있으면** `searchToRowMs` 가 아니라 `searchResponseToEmptyMs` 가 나온다.
  `summarize.mjs` 가 `row_mode=empty` 라고 명시하고 경고를 낸다. **삭제하지 않고 그대로 둔다.**
- **MDM 목록 화면은 진입 시 자동 조회를 하지 않는다**(의도된 제품 변경, cf4fbb05 2026-10-02).
  그래서 "메뉴 클릭 → 첫 행" 을 하나로 재면 조회 버튼 대기(사람이 누르는 시간)가 섞인다.
  하네스는 `shellReadyMs` / `searchToRowMs` / `clickToRowMs` 를 **따로** 낸다. 해석은 그 순서로 한다.
- **첫 진입은 지연 로딩 청크 때문에 느리다.** `warm` 예열 회차가 첫 진입 비용을 흡수한다.
- **로컬 SQLite 데이터 규모**라 운영보다 차이가 작게 나올 수 있다(`docs/idea.md:115`).
  이 한계는 결과 문서에 그대로 적는다 — 지표를 운영 성능으로 옮겨 적지 않는다.
- **헤드리스 + 단일 브라우저 1개.** 첫 회차가 그 뒤 회차보다 느리다(OS 파일 캐시·JIT).
  중앙값으로 줄인다. 3회 미만이면 `summarize.mjs` 가 경고를 낸다.
- **React `<Profiler>` 계측은 1차 시간 측정에 넣지 않는다** (지시 2-5). 계측은 측정값을 바꾼다.
  2차(Top 3 깊게 보기)에서만 켜고, **끝나면 되돌린 뒤 `git status` 가 깨끗한지 확인한다.**
  이 워크트리에만, 커밋하지 않은 채로 심는다.
  - 켜는 법: `react-profiler-instrument.example.tsx` 의 `withRenderProfiler(id, Page)` 로 감싼다.
  - 계측이 없으면 `renderCommits` 계열만 비고 **나머지 지표는 정상 동작한다.**
- 계측을 켜면 개발자 모드 이중 렌더가 커밋 수에 들어간다. 커밋 수는 production 번들 기준으로 읽는다.
- **trace 는 저장소에 넣지 않는다.** 용량이 커서 리포를 오염시킨다.
- **trace 의 CDP 시간 값 단위는 초다.** `Performance.getMetrics` 의 `*Duration` 은 초 단위라 ms 로 읽으려면 ×1000 한다
  (요약 표의 `scriptMs`·`layoutMs` 등은 이름과 달리 초 값이다 — 2026-10-04 검증에서 확인).
- **long task 0 은 렌더가 가볍다는 뜻이 아니다.** 50ms 미만 작업이 여러 개면 0 으로 나온다.
  보정(`RENDER_CALIBRATE=1`)은 관측기가 동작한다는 것만 보여 준다. `page.evaluate` 최상위 동기 루프는 task 로 잡히지 않으니
  보정 루프는 `setTimeout` 안에서 돌린다.
- **로컬은 전송 시간이 0 에 가깝다.** 응답 3MB 도 로컬 `bodyMs` 는 2ms 안팎이다. 응답 크기(`searchEncodedBytes`)를 따로 보고,
  운영 망에서는 크기만큼 전송 시간이 더해진다는 점을 결과에 적는다.
- 측정 중 다른 무거운 명령을 돌리지 않는다. 브라우저·서버는 측정 대상 외에는 건드리지 않는다.
- **저장·확정·삭제 단추를 누르지 않는다**(공용 로컬 DB). 이 하네스는 [조회] 만 누른다.
