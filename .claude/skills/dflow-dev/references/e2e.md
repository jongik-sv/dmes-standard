# 화면 작업의 브라우저 E2E

화면 작업의 Design(「스모크 넷」 만)·Build·Verify 서브에이전트가 읽는 파일. E2E·서버 프로세스·E2E 서버 슬롯 규칙 정본 (dev-discipline.md 의 같은 이름 절은 여기를 가리킴).

API 시험만으로는 화면 JavaScript(DOM 바인딩·이벤트·fetch 호출)를 아무도 확인 못 함. 화면을 바꾸는 작업(spec 에 `entry-point` 있거나 domain 이 `fullstack`·`frontend`)은 화면도 끝에서 끝까지 시험. 프로젝트 명세(TRD)가 도구·경로를 따로 정했으면 그것이 우선.

- **러너 추가 금지.**
  - 브라우저 시험도 기준선과 같은 테스트 명령 하나로 실행. 별도 러너 = 기준선·게이트 판정 분리.
  - 기본값: 기존 러너 안에서 `playwright` 라이브러리로 headless Chromium 기동 (Node 프로젝트면 `@playwright/test` 아니라 `playwright`).
- 시험 위치 = `tests/e2e/` (프로젝트 관례 있으면 그것). 서버 = 임시 포트 + 임시 데이터, 시험 끝나면 치움. 개발 서버·공유 DB 의존 금지.
- **브라우저 설치 = 스캐폴드(초기화) 작업 몫.**
  - 의존성 설치 한 번으로 브라우저까지 갖춰야 함 (npm 이면 `playwright` devDependency + `postinstall: playwright install chromium`).
  - 팀원 워크트리는 lockfile 로만 설치(`/dflow-dev` 「--worker」 H) → 리포에 설치 절차 필요.
  - 스캐폴드가 빠뜨렸는데 화면 작업이 왔으면 그 작업에서 추가 + build-log.md 「설계 이탈」 에 기록.
- **통합 작업(itest)** 관통 시나리오도 API 아니라 브라우저로 실행.
- 화면 작업은 시험 중 화면별 스크린샷을 `<TASKS>/<TSK>/screens/*.png`(`<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>`) 로 남겨 커밋. 모양은 자동 시험이 판정 못 하므로 승인자가 이 파일로 화면을 봄.
- 시험은 브라우저 종류·개인 환경에 의존 금지. 사람·에이전트가 눈으로 확인할 때 쓰는 브라우저 = 각자 환경이 정함 (이 문서는 안 정함).

## 스모크 넷

**화면 작업마다 스모크 시험 넷.** design.md 「테스트 전략」 과 「수용 기준 매핑」 에 기록.
1. 메뉴(사이드바 등)에서 그 화면으로 이동.
2. 목록이 서버 데이터로 채워짐. 데이터 없으면 빈 상태 표시.
3. 등록 또는 수정 한 번이 화면 조작만으로 끝나고 목록에 반영.
4. 서버가 오류를 돌려주면 화면에 오류 표시.

화면에 목록·입력이 없으면 해당 항목에 "해당 없음" + 사유.

## 서버 프로세스 (정본)

화면 작업·E2E 서버는 **리포의 서버 실행 스크립트 쓰지 않고 직접 띄운다.** `be-run.sh`·`fe-run.sh` 처럼 이름·포트 기준으로 다른 인스턴스·포트 점유 프로세스를 정리하는 스크립트(`pgrep -f`·`pkill`·`killall`·전역 `gradlew --stop` 등)는 같은 머신의 다른 체크아웃 서버까지 죽임.

- 빈 포트 = `node .claude/skills/dflow-dev/scripts/free-port.mjs` 로 OS 에서 받음. 번호를 눈으로 고르지 않음 (같은 PC 다른 팀원 서버와 충돌).
  - 스크립트 출력 = 포트 번호 한 줄.
  - Bash 호출 사이에 셸 변수가 안 남음 → 받은 번호를 기록해 그 번호로 띄우거나, 한 호출 안에서 `PORT=$(node .claude/skills/dflow-dev/scripts/free-port.mjs) && …` 로 이어 씀.
  - 예: `./gradlew :api:bootRun --no-daemon --args='--server.port=<빈 포트>'` (`--no-daemon` = 사용자 전역 Gradle 데몬 공유·접촉 금지), `next dev --port <빈 포트>`.
  - 끝에 `&` 붙여 띄우는 서버 기동은 가드 훅 timeout 검사 면제. 그 밖의 `gradlew` 호출은 Bash 도구 timeout 300000~600000.
  - 받은 포트는 바로 닫히므로 서버 bind 전에 남이 가져갈 수 있음 (드묾). "Address already in use" 로 못 뜨면 포트 다시 받아 기동.
- 워크스페이스 라이브러리 빌드는 프런트 dev 서버(`next dev` 등) 기동 **전에** 끝냄.
  - dev 서버는 떠 있는 동안 라이브러리 산출물(dist)을 감시. 기동 뒤 dist 를 지웠다 다시 쓰는 빌드가 돌면 "Module not found" 오류 화면이 클릭을 가로채 모든 시험이 로그인 단계에서 timeout.
  - 기동 뒤 라이브러리를 다시 빌드했으면 dev 서버도 다시 띄움 (자기가 띄운 PID 만 거두고 새 포트로).
- 시험이 DB 를 바꿔 초기 상태가 필요하면 서버 재기동 대신 픽스처(SQL·시드 스크립트)를 다시 넣어 초기화. 서버 기동 = E2E 최고비용 단계.
  - 리포에 재투입 절차 없으면 시험 준비 단계(beforeAll·beforeEach 등)에 둠.
  - 스키마 변경(마이그레이션 추가) 때만 서버 재기동.
- 선택지 — Spring Boot 백엔드는 `bootWar`(또는 `bootJar`) 산출물을 `java -jar` 로 띄워도 됨. 서버 도는 동안 Gradle 데몬 JVM 이 없어 E2E 한 건에 약 1GB 절약.
  - 산출물 빌드 = 무거운 Gradle 호출 → `heavy.mjs` 로 감싸고 Bash 도구 timeout 300000~600000 (팀원 세션은 가드 훅이 더 짧으면 거부): `node .claude/skills/dflow-dev/scripts/heavy.mjs ./gradlew :api:bootWar`. 서버 자체(`java -jar`)는 안 감쌈 — 서버 슬롯은 아래 「E2E 서버 슬롯」 의 `acquire` 가 잡음.
  - `java -jar` 는 상대 경로(파일 DB `jdbc:h2:file:./data/…`, `./logs` 등)를 **실행 폴더(cwd) 기준**으로 풂. 모듈 폴더에서 실행하거나 `--spring.datasource.url=<절대경로 URL>` 전달. 안 그러면 다른 체크아웃(메인·다른 팀원 워크트리) DB 를 잡음. 예: `cd api && java -jar build/libs/<산출물>.war --server.port=<빈 포트>`.
  - 띄운 `java` PID 를 기록, 끝나면 아래 거두기 규칙대로 그 PID 를 죽임.
- 끝나면 **자기가 띄운 프로세스만** 거둠:
  1. 기동 시 기록한 PID 를 먼저 죽임.
  2. 그 PID 가 자식 프로세스를 남겼으면 (Gradle·Node 러너는 흔함) 자기가 고른 포트를 리슨하는 프로세스도 죽임.
  - 근거: 그 포트는 시작 때 비어 있음을 확인하고 골랐으므로 지금 점유자 = 자기 프로세스뿐.
- 금지: 전역 `gradlew --stop`, 이름 기반 `pkill`·`killall`·`pgrep -f` 종료, 남의 포트 점유 프로세스 종료.
- 이 규칙은 수동·워커 두 소비자 모두에 적용. 워커 쪽 요약은 `.claude/skills/dflow-team/references/worker-prompt.md` 「8」 에도 있으나 규칙 본문 정본 = 이 절 — 수정은 여기서만.

## E2E 서버 슬롯

**E2E 서버는 띄울 때 슬롯을 붙잡고, 끌 때 푼다** (dev-discipline.md 「무거운 명령 줄 세우기」).
1. 서버 띄우기 직전 `node .claude/skills/dflow-dev/scripts/heavy.mjs acquire e2e-<TSK>` 호출.
   - `HEAVY_ACQUIRED` 확인 (`HEAVY_BUSY` 면 다시 호출).
   - Bash 도구 timeout 300000~600000 (팀원 세션은 가드 훅이 더 짧으면 거부 — `release` 는 면제).
   - 소유자 = 이 세션(`CLAUDE_PID`).
   - `acquire` 는 일반 슬롯 아니라 **E2E 풀**(`e2e-<i>`, `DFLOW_HEAVY_E2E_SLOTS`, 기본 1)을 잡음. 서버가 떠 있는 동안에도 다른 팀원 게이트·빌드는 일반 슬롯에서 돎.
   - E2E 풀이 차 있으면(다른 팀원 E2E 서버) `HEAVY_BUSY e2e=<n> …` 로 반환.
2. 서버는 「서버 프로세스」 규칙대로 빈 포트에 직접 띄움. 백엔드+프런트 함께여도 슬롯 하나.
   - 이 세션의 시험 명령은 `heavy.mjs` 로 감싸도 붙잡은 슬롯 재사용(`HEAVY_REUSE`) — 두 번째 슬롯 대기 없음.
   - 도커 필요 시험(`heavy.mjs --pool docker`)은 도커 슬롯만 추가로 잡음.
3. **E2E 끝나면 성공·실패·중단 무관하게 서버 반드시 종료** (「서버 프로세스」 거두기 규칙). 이어 `node .claude/skills/dflow-dev/scripts/heavy.mjs release` 로 슬롯 해제.
   - 서버를 켜 둔 채 다음 Phase 로 넘기지 않음.
   - Phase 서브에이전트는 끝나기 전에 자기 서버를 끄고 슬롯 해제.
4. release 를 잊으면 세션 종료 또는 1시간(`DFLOW_HEAVY_HOLD_TTL`) 뒤에야 회수. 그동안 E2E 풀(기본 한 자리)이 막혀 다른 팀원 E2E 대기.

**E2E 풀의 대가**: E2E 풀은 일반 슬롯 K 와 따로 셈 → PC 전체 동시 무거운 스택 최대 K+1 (E2E 풀 한 자리 추가), RAM 기준 K 초과.
- 메모리 빠듯한 PC 면 사람이 `DFLOW_HEAVY_E2E_SLOTS=0` 으로 옛 동작 복귀. 그러면 `acquire` 가 일반 슬롯 하나를 붙잡고 E2E 서버가 게이트와 같은 줄에 섬.
- 이 값 = 사람이 정함 (워커는 안 바꿈).
- 독점 실행(`heavy.mjs --exclusive`)은 일반 풀만 비움 → 떠 있는 E2E 서버는 안 멈춤.

서버를 시험 러너 안에서 띄우고 치우는 리포(globalSetup 등)는 acquire 없이 시험 명령만 감쌈.

## 화면 렌더 최적화

`src/frontend` 의 `m-*` 화면을 만들거나 바꾼 작업에 적용 (다른 리포는 `docs/guide/FrontEnd/Screen-Performance-Guide.md` 있을 때만).
규칙 본문 정본 = 이 절. phase-build·phase-verify·감사 프롬프트는 여기를 가리킴.

목표: 반복·이상 렌더링을 Build 안에서 고치고 끝냄 (보고만 하고 넘기지 않음).

- **Build(화면 단위) — 구현 직후 자기 diff 를 순회해 고침**
  - R12: 상세 폼·입력 state 를 화면 루트에 두지 않음 → 별도 폼 컴포넌트(`memo`) + `ref` 핸들
  - R12: 입력 한 글자마다 목록 `rows`/그리드 `data` 를 새로 만들지 않음
  - R7: `columns`·`data` 는 모듈 상수 또는 `useMemo`, deps 에 객체 통째(선택 행 등) 대신 쓰는 값만
  - R7: 변화 없으면 setState 갱신 함수가 `prev` 반환
  - R5: 화면 루트 공용 `busy` 하나 금지 → 목록 조회·저장 등 용도별 플래그
  - R8: `onSnapshotChange` 에 선택 행 넣지 않음, 행 클릭마다 부르지 않음
  - R9: `useUserButtonRbac` 은 화면 루트 1곳, `/api/auth/me` 직접 호출 금지
  - R16: 외부 스토어는 필드별 훅으로만 구독
  - R6·R10: 0건이어도 그리드 유지, 숨은 탭(폭 0)에서 다시 그리지 않음
- **audit 경고(`P-*`)는 고침** — 오탐이면 build-log.md 에 사유 한 줄
  - `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <바꾼 파일·폴더>`
- **합격 기준**(가이드 §5 주 기준)
  - 상세 폼 입력 한 글자: 화면 루트 렌더 0회, 그리드 셀 재렌더 0회
  - 행 클릭: 포털 셸 재렌더 0회(선택 행 snapshot 이 요구사항이면 1회)
  - 진입 호출(조회 제외) ≤ 3건, 그중 `/api/auth/me` 0건
- **프로파일링 측정(`scripts/perf/render/count-renders.mjs`)은 작업마다 하지 않음**
  - profiling 빌드·전용 서버·heavy 독점이 필요해 시간이 큼
  - 조정자 회차 마감 때 한 번, 회차에서 바뀐 화면을 모아 측정(coordinator `references/closing.md` 「화면 프로파일링」)
  - 화면 작업은 바꾼 화면을 `scripts/perf/render/screens.mjs` 에 등록해 둠(상세 폼이 있으면 `formInput` 포함). 공용 파일이라 조정자가 정한 한 레인만 고침
- **보고**: build-log.md `## 렌더 점검` 에 규칙별 「해당 없음 / 고침(파일:줄) / 오탐 사유」 한 줄씩
