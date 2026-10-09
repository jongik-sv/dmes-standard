# Phase 04 — Verify (검증)

`/dflow-dev` Verify 작성자 서브에이전트가 읽는 파일. 커밋·읽기·병렬 조사·포그라운드·무거운 명령·토큰 규칙 = 프롬프트(phase-prompt.md 템플릿).

Verify = 전체 스위트 재실행 Phase 아님. Build 게이트가 이미 본 전체 회귀를 반복하지 않고 Build 가 남긴 증거를 감사.

**Verify = 읽기 전용 감사자 셋 + 작성자 하나(당신).** 오케스트레이터가 넷을 동시에 띄움.
- 감사자(spec·review·tests): 커밋된 내용만 읽고 스펙 충족·코드 리뷰·테스트 품질·변이 기록 서류를 보고.
- 당신: 실행(린트·변이 표본·E2E)과 수정. 작업 트리를 고치는 것은 당신 혼자.
- research/docs 특례 작업은 감사자 없이 당신 혼자.

1. **입력 = Build 게이트 결과**: 오케스트레이터가 넘긴 sha·명령 줄·통과/실패 수(신규 실패 목록) 수령.
   전체 스위트 재실행 금지. 린트는 실행 (가벼움).
2. **변이 검증 기록 표본 감사**: build-log.md 「변이 검증 기록」 표의 의심 행 전부 + 표본 2행만 변이를 다시 넣고 표의 대상 테스트가 빨강인지 확인 (Build 의 fail-fast·되돌리기·`heavy.mjs` 규칙 그대로 — phase-build.md 「TDD 와 변이 검증」).
   - 의심 행:
     - 잡은 테스트 칸이 비었거나 `-`
     - 결과가 세 값(`잡힘`·`안 잡힘(보강함)`·`안 잡힘(보고)`) 밖
     - `안 잡힘(보강함)` 행 (보강한 테스트가 실제로 잡는지)
     - 잡은 테스트 ≠ design.md 「불변 규칙」 의 대상 테스트
   - 표본: 의심 행 아닌 행 중 서로 다른 불변 규칙의 행 2개 선택 (2개 미만이면 전부). 고른 행과 이유를 보고에 기록.
   - **표본이 하나라도 기록과 다르면(안 잡힘) 표본 감사를 버리고 남은 행을 모두 다시 넣음.**
   - `안 잡힘(보고)` 행은 다시 안 넣음. 표 서류 감사(「불변 규칙」 에 있는데 표에 없는 규칙, `안 잡힘` 인데 보고 없는 행)는 감사자 tests 담당.
   - **다시 넣는 방법**: 행마다 Build 가 커밋한 변이 기록 파일(`<TASKS>/<TSK>/mutations/<ID>.mut`, 표의 변이 칸 첫머리가 ID)을 드라이버에 그대로 투입.
     - 리포 최상위에서 `node heavy.mjs node mutate.mjs run <TASKS>/<TSK>/mutations --ids <고른 ID>` (두 스크립트 모두 `.claude/skills/dflow-dev/scripts/`).
     - 결과 줄 `MUTATION_RESULT <ID> caught|survived|anchor …` 가 판정 (caught = 잡힘).
     - 변이 위치 찾으려고 소스를 다시 읽거나 조사 에이전트 띄우기 금지.
     - `anchor`(원문이 파일에 정확히 한 번 있지 않음) = 기록 결함 → 고치지 말고 보고.
     - 기록 파일 없는 옛 Task(mutations 폴더 없음)만 종전처럼 표를 보고 직접 넣음.
   - **E2E 변이 행(`e2e: yes`)은 다시 넣는 행 전체에서 1행까지** — 행마다 재빌드·서버 재기동으로 한 행 약 7분.
     - 의심 행에 E2E 행 있으면 그중 하나, 없으면 표본에 E2E 행 1행까지.
     - 나머지 E2E 행은 보고에 "E2E 상한으로 다시 넣지 않음" 기록.
     - 표본 감사를 버리고 전수로 넘어가도 이 상한 그대로.
   - E2E 스위트 전체가 대상인 행도 같음. 끝나면 넣은 변이를 모두 되돌려 `git status --porcelain` 이 Task 문서 밖에서 비게 함 (드라이버가 되돌림 — `MUTATION_RERUN_NEEDED` 나오면 지난 실행의 사본을 되돌린 것).
   - research/docs 특례 작업은 표 대신 문서 검증 체크리스트 순회 (spec category 가 research/docs).
3. **화면 작업이면 E2E 실행** (spec 에 `entry-point` 있거나 domain 이 `fullstack`·`frontend`. `references/e2e.md` 「스모크 넷」, 스크린샷 포함). 서버는 e2e.md 「E2E 서버 슬롯」 대로 슬롯 잡고 띄우고, 끝나면 끄고 해제.
   **프런트 화면(`src/frontend` 의 `m-*` 화면)을 만들거나 바꿨으면 성능 점검도**:
   - `docs/guide/FrontEnd/Screen-Performance-Guide.md` §7 점검표 순회.
   - 바꾼 파일에 `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <바꾼 파일·폴더>` 실행, 결과를 보고에 기록.
   - mantine-aggrid-ui 스킬 없는 킷이라 `aggrid_docs.mjs` 못 돌리면 건너뛰고 보고에 `AUDIT_SKIPPED <사유>`.
   - build-log.md `## 렌더 점검` 이 `references/e2e.md` 「화면 렌더 최적화」 규칙을 모두 덮는지 확인. 빠졌거나 `P-*` 경고 남았으면 수정.
   - 측정 하네스 실행 = PR 단계 몫, Verify 에서 실행 안 함.
4. **실행 보고와 감사 지적 처리**: 1-3 끝나면 (실패한 것은 아래 규율로 고친 뒤) 첫 줄 `VERIFY_EXEC done` 또는 `VERIFY_EXEC fail` 보고. 오케스트레이터는 이 보고로 당신을 회수하지 않음.
   - 감사자 지적 있으면 오케스트레이터가 이어서 전달.
   - 지적마다 `수용`·`기각(사유)` 판정. 수용한 것은 아래 규율로 고쳐 커밋.
   - 그 뒤 첫 줄 `PHASE_RESULT verify done` 또는 `PHASE_RESULT verify fail` 보고. 보고에 지적마다 판정 한 줄.
   - 지적 0건이면 오케스트레이터가 `VERIFY_EXEC` 보고를 최종으로 받음.
   - research/docs 특례 작업은 감사자 없음 → 처음부터 `PHASE_RESULT` 로 보고.
5. 감사 결과는 보고로 돌려줌. design.md 에 안 적음.
6. **리포에 게이트 대응표(`.dflow-gates`) 있으면** Build 게이트는 바꾼 모듈만 돌았을 수 있음 (`{BUILD_GATE}` 의 `scope` 가 `module`). 그때 전체 스위트는 당신이 끝난 뒤 **오케스트레이터 Verify 게이트가 한 번** 실행 — 머지 전 최종 증거. 당신은 여전히 전체 스위트 실행 안 함.

- 실패 시 수정은 **Build 규율로 회귀**: 테스트 삭제·skip 으로 초록 만들기 금지, 테스트 총수 감소 = 게이트 실패. 수정 커밋은 Build 커밋과 분리.
- 코드를 고치면 오케스트레이터 Verify 게이트가 전체 스위트를 다시 실행.
  - 재실행 생략 조건: `git diff --name-only <Build 게이트 sha>..HEAD` 가 Task 문서(`<TASKS>/<TSK>/` 아래)와 `*.md` 뿐 + `git status --porcelain` 도 Task 문서 밖에서 빔.
  - **단 `{BUILD_GATE}` 의 `scope` 가 `module` 이면 코드가 그대로여도 생략 안 함** (6번).
  - 그러므로 넣은 변이를 되돌리지 않고 끝내지 않음.
  - 재실행 여부는 오케스트레이터가 정함 — 보고에 "생략 조건 충족" 같은 판정 기록 금지.
- 재시도 1회. 두 번째 실패는 중단하고 사람에게 보고. 감사 지적 처리 왕복은 재시도에 안 셈.
- 전체 스위트·빌드·E2E 는 `heavy.mjs` 로 감쌈 (dev-discipline.md 「무거운 명령 줄 세우기」 정본). `HEAVY_BUSY` 는 재시도에 안 셈.
