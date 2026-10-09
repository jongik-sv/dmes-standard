# Phase 03 — Build (TDD 구현)

`/dflow-dev` 의 Build 서브에이전트(구현 단위 하나)가 읽는 파일. commit·읽기·병렬 조사·포그라운드·무거운 명령·토큰 규칙 = 프롬프트(phase-prompt.md 템플릿).

## 구현 단위

Build = design.md `## 구현 단위` 표의 단위(B1-Bn)마다 새 서브에이전트. 표 없으면 단위 하나(B1).
맡은 단위 = 프롬프트의 `{UNIT}`.

- **범위**: 표의 그 단위 행만 구현. 다른 단위 파일 수정 금지 (Build 게이트 재시도 때는 Build 전체 수정).
- **마지막 단위가 연결 담당**: 앞 단위들을 잇는 연결(통합) 테스트(API↔screen, 모듈 경계)와 screen 작업의 E2E 스모크를 쓰고 돌림. 단위 하나면 그 단위가 전부 담당.
- **변이 검증 담당**:
  - 불변 규칙은 「담당 불변 규칙」 열의 단위가 변이 검증 실행.
  - 여러 단위에 걸치거나 E2E 로만 잡히는 규칙, 열에 없는 규칙 = 마지막 단위 몫.
  - 기록은 build-log.md 「변이 검증 기록」 표 하나에 모음.
- **단위 완료**: 그 단위의 새 테스트와 관련 테스트가 초록이면(아래 완료 조건) commit 하고 보고 첫 줄을 `UNIT_DONE <단위>` 로 씀.
  - design.md 에 `## 구현 단위` 표 있으면(단위 여럿이면) 그 commit 에 `--trailer "DFlow-Unit: <단위> done"` 추가.
  - 재개하는 오케스트레이터가 이것으로 끝난 단위를 가림.
- **단위 상한**: 도구 호출 약 120회 초과, 또는 읽은 파일·출력 합 컨텍스트 250K 토큰(추정) 초과로 판단되면 commit 할 수 있는 지점에서 멈춤.
  1. build-log.md `## 인계 <단위>` 에 기록: 한 것·남은 것·다음에 볼 파일과 줄·실패 중인 테스트.
  2. 한 데까지 commit. 테스트 빨개도 됨(게이트는 마지막 단위 뒤). 단위 하나여도 `--trailer "DFlow-Unit: <단위> handoff"`.
  3. 보고 첫 줄을 `UNIT_HANDOFF <단위>` 로 씀.
  - 이어 받는 에이전트는 design.md 와 그 인계 절에서 시작.
  - 단위 하나짜리 작업에도 같은 상한 적용.

### 병렬 묶음의 단위

프롬프트 `{UNIT}` 에 "병렬 묶음" 있으면 같은 worktree 에서 다른 단위가 동시에 돌고 있음. 위 규칙에 더해:

- **git 에 쓰지 않는다**: `git add`·`git commit`·`git checkout`·`git restore`·`git reset`·`git stash` 금지.
  - `git diff`·`git log`·`git status` 같은 읽기만 허용.
  - commit 은 묶음 끝난 뒤 오케스트레이터가 단위마다 실행. 위 「단위 완료」·「단위 상한」 의 commit·trailer 도 오케스트레이터 몫.
- **build-log.md 를 쓰지 않는다**: 변이 검증 기록 행·설계 이탈·인계 내용은 보고에 담음. 오케스트레이터가 commit 하며 옮김.
- **자기 범위 밖을 건드리지 않는다**: design.md 표의 이 단위 범위 밖 파일은 읽기만. 다른 단위 파일이 반쯤 쓰인 상태여도 수정 금지.
- **변이 검증**: 자기 담당 규칙만 실행. 되돌리기는 아래 「TDD 와 변이 검증 > 되돌리기」 규칙(백업 사본 복사) 그대로. `git checkout` 은 index 를 써서 형제 단위의 git 과 부딪치므로 금지.
- **보고**: 첫 줄은 종전대로 `UNIT_DONE <단위>` 또는 `UNIT_HANDOFF <단위>`. 이어서 아래 네 칸 기록 (없으면 `없음`).
  - 같은 내용(첫 줄 포함)을 보고 직전에 `{TASK_DIR}/unit-report-<단위>.md` 에도 씀 (git 에는 쓰지 않음).
  - 오케스트레이터가 commit 전에 재시작돼도 이 파일로 이어 감 (`orch/build.md` 「묶음」 재개).
  - `바꾼 파일:` 이 단위가 만들거나 고친 파일 전부(추적 안 된 새 파일 포함), 리포 최상위 기준 경로, 한 줄에 하나.
  - `변이 검증 기록:` build-log.md 「변이 검증 기록」 표에 들어갈 행(`불변 규칙 | 변이 | 잡은 테스트 | 결과`).
    - 변이 기록 파일(아래 「기록」)은 `<TASKS>/<TSK>/mutations/<단위>-M<n>.mut` 으로 쓰고(git 에는 쓰지 않음) 그 경로를 이 칸에 함께 적음.
    - 오케스트레이터가 표 행과 같은 commit 에 실음.
  - `설계 이탈:` build-log.md `## 설계 이탈` 에 들어갈 내용.
  - `인계:` (`UNIT_HANDOFF` 일 때) build-log.md `## 인계 <단위>` 에 들어갈 한 것·남은 것·다음에 볼 파일과 줄·실패 중인 테스트.

## TDD 와 변이 검증

- **테스트 먼저**: design.md 테스트 전략대로 새 테스트 작성 → **실패 확인** → 구현. 새 테스트 없는 구현 = Build 완료 아님.
- **변이 검증(mutation check)**: design.md 「불변 규칙」 항목마다 **일부러 틀린 구현을 넣어 빨강이 나는지** 확인.
  - 아무것도 깨뜨리지 않는 변이 = 커버리지 구멍. 테스트를 늘려 덮고, 못 덮으면 **보고** (은폐 금지).
  - 빨강 확인 = "테스트가 코드를 실행한다"의 증명일 뿐 "틀린 구현을 잡는다"의 증명 아님.
  - **변이 검증은 Build 한 곳에서만 실행** (Verify 는 기록 감사).
  - research/docs 특례 작업(spec 의 category 가 research/docs. dev-discipline.md 「research/docs 작업 특례」)은 변이할 코드 없음. 변이 검증과 아래 기록 표 대신 문서 검증 체크리스트 사용.
  - 구현 단위 여럿이면 규칙마다 담당 단위가 실행 (「구현 단위」).
  - **대상 테스트만, fail-fast 로**: 불변 규칙에 매핑된 대상 테스트만 첫 실패에서 멈추게 실행 — vitest `--bail=1`, jest `--bail`, Gradle `test --fail-fast --tests <클래스>`.
    - 빨강 하나면 잡힌 것. 나머지 실행 불필요.
    - 대상 테스트로 안 잡힐 때만 전체 스위트로 넘어감. 리포에 게이트 대응표 `.dflow-gates` 있으면 전체 스위트 대신 프롬프트의 좁힌 명령에 든 모듈 게이트 명령으로 넘어감.
    - screen(E2E)으로만 잡히는 규칙이면 대상 = E2E 스펙 하나가 아니라 **E2E 스위트 전체**. 단독 실행은 spec 간 상태 간섭에서 오는 취약성을 감춤.
  - **한 번에, `heavy.mjs` 안에서**: 변이마다 기록 파일(아래 「기록」)을 먼저 쓰고, 드라이버 `scripts/mutate.mjs run` 으로 변이 넣기 → 대상 테스트 → 되돌리기를 한 번에 실행.
    - 드라이버 호출 전체를 `heavy.mjs` 로 한 번 감쌈 (안쪽 Gradle 호출은 그 슬롯 재사용): `node .claude/skills/dflow-dev/scripts/heavy.mjs node .claude/skills/dflow-dev/scripts/mutate.mjs run <TASKS>/<TSK>/mutations
      --ids <이 단위의 ID…>` (리포 최상위에서).
    - 드라이버가 백업 사본 되돌리기(아래)를 그대로 수행. 에이전트 호출 수와 슬롯 대기 감소.
    - 스크립트도 10분 상한(프롬프트 공통 규칙 4) 준수. 길면 나눔.
    - **Gradle 변이 스크립트는 daemon 재사용 (`--no-daemon` 금지).**
      - daemon 은 Gradle 버전·JAVA_HOME·jvmargs 가 같으면 worktree 사이에서도 공유됨.
      - daemon 하나는 한 번에 build 하나만 담당 → daemon 수 = 동시 build 수(heavy 슬롯 수)만큼만 증가.
      - 두 번째 변이부터 JVM start·build 설정 비용 거의 없음.
      - 근거(2026-09-26 dmes-standard): 변이 18개를 `--no-daemon` 으로 돌려 매번 Gradle JVM 을 새로 띄우자 CPU 350%·load 20-30. 같은 시각 다른 팀원의 벽시계 성능 테스트가 실패해 blocked 두 번.
      - 끝난 뒤 daemon 이 남아 있어도 정상. 전역 `gradlew --stop` 금지(e2e.md)는 그대로.
      - 예외: E2E 서버의 `bootRun --no-daemon`(e2e.md)은 오래 떠 있는 서버가 공용 daemon 을 붙잡지 않게 하려는 것이라 유지.
  - **되돌리기(백업 사본으로 통일)**: 변이는 작업 트리에서만 넣음.
    - 넣기 전에 대상 파일을 작업 트리 밖 `$(git rev-parse --git-dir)/dflow-bak/<단위>/<파일 경로>` 로 복사 (`mkdir -p "$(dirname "$BAK")"` — 단위별 하위 폴더라 병렬 단위끼리도 이름 안 겹침).
    - 대상 테스트 실행 뒤 평범한 `cp` 로 되돌리고 사본 삭제. 스크립트면 `trap` 으로 중단돼도 되돌림.
    - **`cp -p`·`touch -r` 로 mtime 을 맞추지 않는다** — 되돌린 파일은 mtime 이 새로 찍혀야 함 (크기·mtime 이 원본과 같으면 Gradle 이 재컴파일을 건너뜀).
    - **`git checkout -- <파일>` 금지** — 변이만 지우는 게 아니라 그 파일의 미commit 구현까지 지움.
    - `git stash` 금지 (stash 스택이 worktree 전체에 공유됨). 변이를 commit 하지 않음.
    - **강제 재실행(`--rerun-tasks`·`cleanTest`)은 부분 실행 상태가 남았을 때만** 사용 — 스크립트가 중단됐거나 `trap` 되돌리기가 실패해 `dflow-bak/` 에 사본이 남은 경우.
      - 그때는 사본을 `cp` 로 되돌리고 삭제한 뒤 한 번만 강제 재실행.
      - 그 밖에는 Gradle 의 UP-TO-DATE 를 믿음. 위 되돌리기가 mtime 을 새로 찍으므로 재컴파일 누락 없음.
    ```bash
    GIT_DIR=$(git rev-parse --git-dir); BAK="$GIT_DIR/dflow-bak/<단위>/<파일>"
    mkdir -p "$(dirname "$BAK")"; cp "<파일>" "$BAK"
    trap 'cp "$BAK" "<파일>"; rm -f "$BAK"' EXIT
    # 변이 적용
    <대상 테스트 실행>
    cp "$BAK" "<파일>"; rm -f "$BAK"; trap - EXIT
    ```
  - **기록**: `<TASKS>/<TSK>/build-log.md` 에 `## 변이 검증 기록` 표를 남김.
    - 열 = `불변 규칙 | 변이 | 잡은 테스트 | 결과`. 결과 = `잡힘`·`안 잡힘(보강함)`·`안 잡힘(보고)`.
    - Verify 가 이 표를 감사 → 표에 없는 규칙 = 검증되지 않은 것.
    - **변이는 패치 형태로도 남김**: 행마다 변이 기록 파일 `<TASKS>/<TSK>/mutations/<ID>.mut` 을 Task 문서로 commit.
    - 표의 변이 칸은 ID 로 시작 (예 `M3 — 경계 < 를 <= 로`). ID = `M<n>` (단위 여럿이면 `<단위>-M<n>`, 예 `B2-M1`).
    - 파일 형식 정본 = `scripts/mutate.mjs` 머리 주석: `rule:`·`file:`·`test:`(대상 테스트 명령 한 줄)·`e2e: yes|no` 머리 줄 + `--- find`(파일에 정확히 한 번 나오는 원문) · `--- replace`(치환문) 본문.
    - Verify 는 이 파일을 드라이버에 그대로 다시 넣음 → 원문 축약 금지.
    - `안 잡힘(보강함)` = 보강한 테스트로 같은 파일을 다시 돌려 잡히는 것까지 확인한 결과.
- design.md 에서 이탈하면 이탈 사유를 build-log.md `## 설계 이탈` 에 기록 (다음 Phase 와 리뷰어의 기준 문서 유지).

## 완료와 커밋

- 완료 조건: **새 테스트 + 관련 테스트가 초록.**
  - Build 서브에이전트는 전체 스위트 실행 금지. 전체 회귀는 오케스트레이터의 Build 게이트가 한 번 확인.
  - 리포에 `.dflow-gates` 있으면 Build 게이트는 영향 모듈만, 전체는 Verify 게이트가 확인.
  - 관련 테스트: vitest `related <바꾼 파일…> --run`, jest `--findRelatedTests <바꾼 파일…>`, Gradle 은 바뀐 모듈의 `:<모듈>:test` 또는 `--tests <클래스>`.
  - 명령 = 기준선 명령 줄(같은 cwd·러너·도커 제외)에 좁히는 인자만 더한 것. Gradle·Maven 이면 이것도 `heavy.mjs` 로 감쌈.
  - 구현 단위로 나눴으면 단위마다 이 조건으로 끝남. Build 전체는 마지막 단위(연결 테스트 포함)가 끝나야 완료.
- **관련 테스트에서 타이밍·성능 테스트만 빨가면**(측정한 경과 시간을 고정 상한과 비교하는 단언뿐 — dev-discipline 「부하 민감 테스트(타이밍·성능)의 단독 재실행」 의 판별 기준) 그 파일만 `heavy.mjs --exclusive` 로 한 번 다시 실행.
  - 단독에서 통과하면 완료 조건 충족. 보고에 "부하 민감, 단독 통과(로그 경로·부하 평균)" 기록.
  - 단독에서도 빨가면 수정.
- **Build 게이트 실패는 1회 재시도.**
  - 오케스트레이터가 Build 게이트(전체 스위트, 대응표 있으면 영향 모듈)에서 신규 실패를 보면 곧바로 실패 처리 안 함.
  - 같은 Build 서브에이전트(단위 여럿이면 마지막 단위)에 실패 목록을 넘겨 수정시킨 뒤 게이트 재실행.
  - 그 에이전트가 sonnet 이면 이어 붙이지 않고 opus 새 에이전트가 이 재시도 담당 (dev-discipline.md 「sonnet Build 의 opus 승급」).
  - 프롬프트 `{UNIT}` 이 "Build 게이트 재시도" 면 당신이 그 에이전트. 단위 범위 제한 없이 Build 전체 수정.
  - 수정은 이 파일의 규율 그대로 (테스트 삭제·skip 금지).
  - 두 번째 실패는 중단하고 사람에게 보고 — Verify 재시도와 같은 구조.
- **Phase 경계 commit**: Build 완료 시(구현 단위면 단위마다) 즉시 commit (파일명 명시, `git add -A` 금지).
  - commit 없는 산출물을 Phase 경계 너머로 끌고 가지 않음 — Refactor 실패 시 되돌릴 경계 = commit.

## 조건부로 더 읽는 것

- screen 작업(spec 에 `entry-point` 있거나 domain 이 `fullstack`·`frontend`)이면 마지막 단위와 screen 파일 담당 단위가 `references/e2e.md` 읽음 — E2E test·스크린샷·서버 띄우기.
- screen 구현이 `src/frontend` 의 `m-*` screen 이면:
  - 구현 전에 `.claude/skills/mantine-aggrid-ui/references/screen-patterns.md` 의 「성능 기본 구조」(첫 조회 상한·상세 폼 분리·안정 참조 열 정의) 준수. 점검표 = `docs/guide/FrontEnd/Screen-Performance-Guide.md` §7.
  - 구현을 끝낸 단위는 `references/e2e.md` 「화면 렌더 최적화」 대로 반복·이상 렌더링을 순회해 수정하고 build-log.md `## 렌더 점검` 기록.
- Flyway 처럼 파일명이 곧 버전인 migration 파일을 만들면 먼저 dev-discipline.md 「마이그레이션 버전(Flyway 등 파일명이 곧 버전인 경우)」 절 읽음.
