# 룰 세트 흐름도 3단계 구현 계획 — 편집기·디버거 보강

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트 편집 화면(`dme/ruleSetEdit`)의 캔버스 편집기에 끌어 놓기·되돌리기·우클릭 메뉴·복사·분기 편집·찾기·접기를 더하고, 아래 패널의 시뮬레이션 탭을 [보기][편집][디버그] 세 모드 가운데 디버그 모드로 옮겨 단계 실행·중단점·조사식·식 즉석 평가·테스트 케이스·실행 비교를 준다.

**Architecture:** 2단계 구조를 넓힌다. 편집 연산은 `flow-edit.ts` 순수 함수로 더하고, 되돌리기는 흐름 사본 이력(`state/edit-history.ts`)이다. 디버거는 서버 기록 실행(`execute`) 한 번의 기록 위에서 화면이 커서를 옮기는 방식이다(실행이 결정적이라 결과가 진짜 단계 실행과 같다). 여러 태스크가 같은 파일을 고치지 않도록 Task 0 이 먼저 이음새(모드 타입·캔버스 props·메뉴 등록·단축키 디스패처·이력 API·화면 API 서명·빈 슬롯 컴포넌트)를 박고, 뒤 태스크는 자기 파일의 본문만 채운다. 서버는 E6(테스트 케이스)와 E5 식 파싱만 바꾸고 새 action 동사를 만들지 않는다.

**Tech Stack:** Java 21, Spring Boot + OASIS(BPMN), SQLite + Flyway, JUnit 5(+ Mockito `@MockitoSpyBean`), TypeScript + React 19 + Mantine 9.6, `@xyflow/react` 12.x(`Controls`·`MiniMap`·`EdgeLabelRenderer`), AG Grid 33(`@dk-oasis/shared/grid` `AgDataGrid`), Vitest(happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-30-rule-set-flow-editor-debugger-design.md`(권위). 앞 스펙 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` 의 흐름 모델·실행 의미(§3·§4)와 2단계 계획 `docs/superpowers/plans/2026-09-30-rule-set-flow-phase2.md` 의 공유 계약 P1~P10·편차 P-D1~P-D10 은 이 계획이 바꾼다고 적지 않은 한 그대로 유효하다.

**작업 위치:** 워크트리 `.claude/worktrees/rule-set-flow-3`, 브랜치 `feat/rule-set-flow-phase3`(dev 96663ddc + 스펙 커밋 a9248c36·b1ff87ed). 물결 안 태스크는 각자 하위 워크트리(`.claude/worktrees/rsf3-tN`, 브랜치 `rsf3-tN`, 이 브랜치 끝에서 분기)에서 구현하고, 리뷰 통과 뒤 `feat/rule-set-flow-phase3` 에 `--no-ff` 로 병합한다. 모든 명령은 해당 워크트리 루트 기준이다.

---

## Global Constraints

- 엔진(`kr.dongkuk.maru.mdm.engine`) main 코드와 공개 계약(스키마·`engine-contract.generated.ts`·engine-contract.md)을 바꾸지 않는다. 엔진 테스트는 읽기 전용 확인만 한다.
- 저장 형식(`FLOW_JSON`, 서버 `RuleSetFlowJson` 정규 JSON, 화면 `flowJsonOf`)을 바꾸지 않는다. 새 UI 상태(블록 접힘·중단점·조사식·최근 입력·최근 식·미니맵 표시)는 서버에 저장하지 않는다.
- 새 action 동사를 만들지 않는다(ADR-0003 D5 16단어). `ruleSetEdit` 는 search·view·save·delete·restore·validate·execute 7개 그대로다. 테스트 케이스 저장·삭제는 `save` 의 `part=CASE`(삭제는 `caseDeleted=true`), 케이스 조회는 `view` 응답의 `cases`, 일괄 실행은 `execute` 의 `runCases`·`caseIds`, 식 파싱은 `validate` 의 `exprText` 로 한다. `ruleSetEdit.bpmn` 은 흐름을 바꾸지 않는다(머리 주석 action 표 설명만 고친다).
- OASIS params 는 Map·List DTO 칸을 묶지 못한다(2단계 실측 `S999 Generic type`). 목록·객체는 문자열로 받는다: 케이스 ID 목록은 콤마로 이은 `caseIds`, 입력·기대값은 JSON 문자열 `inputJson`·`expectedJson`, 흐름은 `flowJson`.
- DB 검증은 SQLite 만 한다. 도커를 쓰지 않는다. 구현 태스크는 서버(bootRun·local-run·fe-run)를 띄우지 않는다. 브라우저 확인은 이 계획 끝의 「수동 브라우저 확인」에서만 한다(ego-browser, dev 병합 뒤 본체 재기동).
- 화면 작업은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 끝까지 읽고 따른다. 규칙 정본은 `docs/guide/FrontEnd/Local-Rules.md`(특히 §8 한 변 색 바 금지, §9 중요 액션 UX, §11 늦은 응답 버리기, §12 그리드 칸 렌더러에 입력 요소 금지, §13 오류 문장·코드 툴팁, §16 무거운 계산 의존성). 바꾼 파일은 커밋 전 스킬의 `audit` 두 개가 0건이어야 한다. 표 모양은 AG Grid(`AgDataGrid`)를 쓴다(2단계 값 표 `MatrixTable` 은 그대로 둔다).
- 새 CSS 는 2단계 방식으로만 넣는다: TS 문자열을 `page.tsx` 의 React 19 `<style href precedence>` 로 주입한다. 로컬 `.css` import 금지(근거: `rsf-styles.ts` 머리 주석 "Ruling 14, Local-Rules §17" — 포털 호스트가 m-* 페이지 CSS 를 불러오지 않아 캔버스 높이가 0 이 됐다). Task 0 이 스타일을 `styles/*.ts` 영역별 상수로 나누고, 각 태스크는 자기 영역 파일만 고친다.
- 브라우저 저장소(localStorage)는 개인 편의(중단점·조사식·최근 입력·최근 식·미니맵)에만 쓴다. 읽기·쓰기는 모두 `debugger/local-store.ts`(Task 0, try/catch)를 거친다. 저장소가 없거나 던져도 화면이 동작해야 한다.
- 단축키(스펙 §2 그대로): 캔버스 영역에 초점이 있을 때만 받고 그때만 `preventDefault`(+`stopPropagation`) 한다. 입력 칸(input·textarea·select·contenteditable)에 초점이 있으면 무시한다. 포털 전역 단축키와 겹치지 않게 한다. 단축키는 보조 수단이다 — 모든 동작은 툴바·메뉴 버튼으로 할 수 있어야 한다. F5·Cmd+F·Cmd+D 는 캔버스 초점 밖에서 브라우저 동작이 그대로 일어난다. Mac 에서 F9·F10 은 fn 을 함께 눌러야 한다(도움말에 적는다). 저장하지 않은 편집이 있으면 `beforeunload` 로 떠나기 전에 확인한다. 디스패처는 `canvas/shortcuts.ts` 하나뿐이다.
- 끌기 대상 선 반경은 화면 80px 이다. `nearestEdge` 의 `max` 는 흐름 좌표이므로 `80 / zoom` 으로 넘긴다(`dropRadius(zoom)`).
- 노드 상한 200(`MAX_NODES`) — 끼우기·붙여넣기·복제·끌어 넣기 모두 넘으면 거부(`노드는 흐름 하나에 200개까지 둔다`). 세트당 테스트 케이스 50건, 한 번 실행 50건.
- 컴포넌트 테스트는 기존 관례대로 `src/frontend/m-mdm/tests/**/*.test.ts` 에 `createElement` 로 쓴다(vitest include 가 `.ts` 만 본다). 렌더 테스트는 파일 머리에 `/** @vitest-environment happy-dom */`.
- `docs/mdm/decisions.md` 는 append-only 다. 이 계획의 결정은 Task 1 이 한 번에 남긴다. 다른 태스크는 고치지 않는다. `docs/idea.md`·`docs/guide/FrontEnd/Local-Rules.md` 는 본체 작업 사본에 커밋 안 된 변경이 있어(git status `M`) 워크트리에서 고치지 않는다 — 넣을 내용은 마감 보고에 적어 팀장이 넣는다.
- git: 워크트리 루트에서 `/usr/bin/git` 로 단순 한 줄 명령만 쓴다(cd 결합·파이프 금지). 커밋은 자기가 만든·고친 파일만 경로로 지정한다(`/usr/bin/git add <paths>` 뒤 `/usr/bin/git commit -m "..." -- <paths>`, 삭제는 `/usr/bin/git rm <path>`). `add -A`·`add .`·`stash`·`reset --hard`·브랜치 전환 금지. 메시지는 `type(scope): 한국어 요약` + 빈 줄 + 트레일러 두 줄:
  - `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01H9ST72jLA5navR3RfjJ2v2`
- 테스트 명령(워크트리 루트 기준):
  - 공통 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH`
  - mdm/lib: `(cd src/backend/mdm && ../gradlew :lib:test --console=plain -q)` / 한 클래스 `--tests '*이름'`
  - mdm/api: `(cd src/backend/mdm && ../gradlew :api:test --tests '<패턴>' --console=plain)` / 전체 `:api:test --console=plain -q`
  - 엔진(읽기 전용 확인): `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)`
  - 화면: 워크트리에서 처음 한 번 `pnpm --dir src/frontend install --frozen-lockfile=false` 뒤 `pnpm --dir src/frontend --filter @dk-oasis/shared build`. 테스트 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit`, 타입 `pnpm --dir src/frontend --filter @dk-oasis/m-mdm lint`. 완료 게이트(Local-Rules §2-1): `pnpm --dir src/frontend --filter "@dk-oasis/m-mdm^..." build && pnpm --dir src/frontend --filter @dk-oasis/m-mdm test` 후 `[m-mdm test 합계]` 줄을 읽는다.
  - `pnpm build`(모든 `--filter … build` 포함)는 본체 checkout 에서 local-run·fe-run 이 떠 있을 때 돌리지 않는다(감시 빌드와 dist 를 다툰다). 떠 있는지 모르면 완료 게이트의 build 는 건너뛰고 vitest·lint 만 돌린 뒤 보고서에 적는다 — 컨트롤러가 병합 뒤 한 번 돌린다.
  - `local-run.sh` 를 쓸 때 `TSUP_DTS=0` 과 `--all` 을 함께 쓰지 않는다(전체가 내려간다). MDM 만 다시 띄울 때는 `TSUP_DTS=0 local-run.sh --mdm -q`.
- 기준선: 착수 때 컨트롤러가 위 명령으로 엔진·lib·api·화면 테스트 수를 한 번 돌려 진행 장부에 적는다. 각 태스크 완료 보고는 그 기준선 대비 증감을 적는다.
- 이음새 표시: Task 0 이 뒤 태스크 몫으로 남기는 임시 본문에는 `// SEAM(Tn): <채울 내용>` 주석을 단다. Tn 은 끝날 때 `grep -rn "SEAM(Tn)" src/frontend/m-mdm/pages/dme/ruleSetEdit` 가 0 건이어야 한다. 최종 리뷰 전 `grep -rn "SEAM(" …` 이 0 건이어야 한다.

## Review Focus

1. **기대값 왕복** — 디버그 실행 결과의 최종 변수로 채운 기대값을 그대로 케이스로 저장하고 [모두 실행]하면 통과해야 한다. 숫자 표기(`1.10` 대 `1.1`, `"1"` 대 `1`), 대소문자만 다른 키, BOOLEAN 이 조용히 실패하면 안 된다. 기대값에 입력 변수 이름을 적으면 "결과에 없음" 으로 실패한다(P-D4). 담당: Task 4(서버 판정 왕복 테스트)·Task 10(`expectedFromFinal`).
2. **케이스 저장이 편집 중 흐름·모드를 버리는 경우** — 흐름을 고쳐 dirty 인 채 디버그 모드에서 케이스를 저장·삭제해도 흐름·dirty·모드(debug)·되돌리기 이력·커서가 그대로여야 한다. 케이스 쓰기는 세트 다시 불러오기(`runWrite`→`load`)를 타지 않는다(P-D11). 담당: Task 10.
3. **옛 흐름 기록을 새 흐름에 칠하는 경우** — 실행 뒤 편집 모드에서 노드를 지우고 디버그로 돌아오면 캔버스 겹침은 없고 패널은 "지난 흐름 기준" 배지를 보인다. [한 단계]를 누르면 새로 실행해 커서 0 에 둔다. 노드 위치·메모·라벨만 고친 것은 기록을 낡게 하지 않는다(`flowVersion`). 담당: Task 5.
4. **단축키가 입력 칸·브라우저를 가로채는 경우** — 조건식 textarea·찾기 칸·식 평가 칸 안에서 Ctrl/Cmd+Z 는 브라우저 기본 되돌리기, Delete·Backspace 는 글자 지우기, Ctrl/Cmd+F 는 캔버스 밖이면 브라우저 찾기, F5 는 캔버스 밖이면 새로 고침이어야 한다. Mac 의 Ctrl+Z(Cmd 아님)는 되돌리기가 아니다. 담당: Task 0(디스패처 테스트)·Task 8(연결 테스트).
5. **끌어 옮기기가 흐름을 깨는 경우** — 분기를 자기 블록 안쪽 선·자기 앞뒤 선에 놓기, 중첩 분기 옮기기, IF 갈래 선(조건식 있는 선)에 옮겨 넣기, 옮긴 뒤 되돌리기 한 번으로 원래 정규 JSON 이 되는지. 담당: Task 2(연산)·Task 7(캔버스 제외 선·되돌리기 한 번).

---

## 편차 기록 (스펙과 다르게 정하거나 스펙이 답하지 않아 정한 것 — Task 1 이 decisions.md 에 남긴다)

| # | 스펙 | 이 계획 | 이유 |
|---|---|---|---|
| P-D1 | §4.5 "평가는 브라우저에서 한다 … 서버를 부르지 않는다" | 식 **파싱**은 서버가 한다: `validate` 에 `exprText` 칸을 더해 `ruleEdit` 의 `parseExpr`(slot `RULE_COND_EXPR`)와 같은 코드로 AST·`supported`·`refVars`·`problems` 를 돌려준다. **평가**는 브라우저 `src/evalex` `evaluate` 로 한다. `supported=false` 이거나 평가기가 폴백 신호를 내면 "화면에서 계산할 수 없는 식이다" 만 보이고 서버 평가를 부르지 않는다 | 화면에는 식 파서가 없다(불변 9 — `ruleEdit/expr/parse-expr.ts` 머리 주석, `tests/dme/ruleEdit/expr-field.test.ts` 가 지킨다). 결과: `validate` 는 EDIT 권한이라 READ 사용자(표준 관리자)는 식 평가 칸이 꺼진다(title 로 이유) |
| P-D2 | §6 "OASIS HTTP 테스트에 새 action·권한(READ 403)" | 백엔드 HTTP 테스트는 403 을 만들 수 없다(BFF RBAC 몫 — `DmeOasisHttpTest` 369·395행 주석). 대신 (1) 표준 관리자(`MDM_STD_ADMIN`)의 케이스 저장·삭제가 MDM013 이고 DB 가 그대로임을 HTTP 로, (2) `save`·`execute`·`validate` 가 `MdmPermissions.EDIT_ACTIONS` 에 있고 `READ_ACTIONS` 에 없음을 계약 테스트로 고정한다. 실제 403 은 e2e E9 가 본다 | 백엔드 필터 체인에 RBAC 가 없다 |
| P-D3 | §4.6 "값 비교는 TypedValue 계약 문자열 비교" | `RuleCaseJudge.sameValue` 로 비교한다(NUMBER 는 BigDecimal `compareTo` — `1.10`=`1.1`, BOOLEAN 은 불린 또는 `"true"/"false"` 대소문자 무시, 목록은 원소별, 그 밖 문자열) | 룰 케이스와 같은 판정 규칙이고, 화면 `trace-view` `sameTyped`(NUMBER 값 비교)와 뜻이 같다. 문자열 비교면 실행 결과로 채운 기대값이 표기 차이로 실패할 수 있다(Review Focus 1) |
| P-D4 | §4.6 "EXPECTED_JSON 에 적힌 키만 `finalValues` 와 비교" | `finalValues` 는 **최상위에서 룰이 만든 결과 변수**만 담는다(엔진 `RunTrace` 주석). 입력 변수 이름을 기대값에 적으면 "결과에 없음" 실패다. 키는 대소문자 무시로 찾는다. `hit` 키는 세트에서 특별한 뜻이 없다(보통 변수 이름). 판정: 실행이 오류로 끝나면 기대값이 없어도 `pass=false`, 오류가 없고 기대값이 비면 `pass=null`(실행만), 그 밖은 차이가 없을 때 `true` | 스펙은 오류=실패만 정했다. 기대값 없는 케이스는 룰 케이스와 같이 "실행만" 이다 |
| P-D5 | §4.6 케이스 수 상한은 "일괄 실행 50" 만 | 세트당 저장 상한도 50 이다(새 케이스 저장을 MDM021 로 거부) | 저장 상한이 실행 상한보다 크면 [모두 실행]의 뜻이 정해지지 않는다 |
| P-D6 | §4.6 `EVAL_TS`(타입 미정) | `EVAL_TS VARCHAR(19)` — KST `yyyy-MM-dd HH:mm:ss` 문자열. 저장 때 `RuleSetRunner.parseKst` 로 검증하고 받은 글자를 그대로 둔다 | 화면·`execute` 가 같은 문자열을 주고받는다. 시각 바인더 변환이 필요 없다 |
| P-D7 | §4.6 FK → `TB_MDM_RULE_SET` | V15 가 `TB_MDM_RULE_SET` 을 가리키는 **첫 FK** 다. V14 주석("참조하는 FK 는 없다")은 더는 참이 아니다. 앞으로 세트 테이블을 다시 만드는 마이그레이션은 자식 테이블을 먼저 옮겨야 한다(V15 주석·D 기록에 남긴다) | V14 가 DROP/RENAME 재생성을 썼다 |
| P-D8 | §4.6 "세트를 폐기해도 케이스는 남긴다. 되살리면 다시 보인다" | `view` 는 상태와 무관하게 케이스를 싣는다(폐기 세트는 읽기 전용). 폐기 세트에 케이스 저장·삭제는 MDM009 `폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다` | 룰 케이스(`RuleTestCaseService`)와 같은 규칙. "되살리면 다시 보인다" 는 되살려야 쓸 수 있다로 읽는다 |
| P-D9 | §4.1 "흐름을 고치면 실행 결과를 '지난 흐름 기준'으로 표시" | 낡은 기록(실행 때 `flowVersion` ≠ 지금)은 **캔버스 겹침을 그리지 않는다**. 변수 패널·값 표·실행 비교·노드 상세는 옛 기록으로 두고 `dbg-stale` "지난 흐름 기준" 배지를 보인다. 다음 [한 단계]·[계속]·[여기까지]·[처음부터]·[끝내기]는 새로 실행한다. **입력이 기록 입력과 다를 때(`currentInput()` ≠ `last.input`)도 낡은 것과 같이 다음 동작에서 새로 실행한다**(배지는 없다 — 흐름이 아니라 입력이 바뀐 것이다). [처음부터]를 늘 새로 실행하게 하는 안은 스펙 §4.2 "기록이 있는 동안 서버를 다시 부르지 않는다" 와 부딪혀 쓰지 않는다. 케이스 [디버그로 열기]·최근 입력 불러오기·폼 입력 변경 뒤의 첫 동작이 바뀐 입력으로 도는 근거다(스펙 §4.6 "그 입력을 폼에 넣어 단계 실행을 시작한다") | 옛 기록의 노드 ID 가 지금 캔버스에 없거나 다른 뜻일 수 있다(2단계 Review Focus 3) |
| P-D10 | §3.1 A4 "보기·디버그 모드에서는 목록만 보이고 끌기는 꺼진다" | 디버그 모드의 왼쪽은 §4.1 배치대로 입력 패널이라 룰 목록을 두지 않는다. 보기 모드는 목록만(팔레트·끌기 없음), 편집 모드는 팔레트 + 목록(끌기) | §4.1 배치 그림과 A4 가 같은 자리를 요구한다. 배치 그림을 따른다 |
| P-D11 | §4.6 (케이스 저장 뒤 목록 갱신 방법 없음) | 케이스 저장·삭제 뒤에는 `view` 를 다시 불러 **`cases` 만** 받는다. 세트 흐름·모드·dirty·이력·커서는 건드리지 않는다(`runWrite`→`load` 를 쓰지 않는다) | Review Focus 2 |
| P-D12 | §4.6 "`execute` 에 `runCases`·`caseIds` 칸을 더한다" | `setId` 칸도 더한다(`RuleSetSimulateRequest` 에 세트 ID 가 없다). `runCases=true` 면 `trace=null`·`warnings=[]` 이고 `cases` 목록을 돌려준다 | 저장된 케이스를 읽으려면 세트 ID 가 필요하다 |
| P-D13 | §4.2 "커서가 노드에 있다" | 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 **"노드 k 실행 전"** 이다: nodes[0..k-1] 실행됨, nodes[k] 지금(굵은 테두리, 결과 칩 없음), nodes[k+1] 다음(점선). k = n 이면 끝(2단계 최종 겹침, 안 탄 갈래 흐림). 변수 패널은 노드 k 가 **실행되기 전** 그 노드 범위의 ctx 다(병렬 갈래 범위를 지킨다). 노드 상세는 k 보다 앞에서 실행된 노드만 보인다 | 스펙 툴바 문구 "3/7 r2 실행 전"·§4.4 "커서 이전에 실행됐으면" 과 맞추고, 다음 주 E4(멈춘 자리에서 값 고쳐 이어 실행)의 멈춤 위치와 같게 둔다 |
| P-D14 | §4.3 [계속] "기록이 없으면 먼저 실행한다" | 새로 실행한 직후의 [계속]·[여기까지]는 커서 0 을 **포함해** 찾는다. 기록이 있으면 커서 **뒤**(k+1..)부터 찾는다. [여기까지]로 고른 노드가 커서 뒤에 없지만 앞에 있으면 `이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다`, 기록에 아예 없으면 `이 입력으로는 이 노드를 지나지 않는다` | 새 실행은 "처음 멈춤 전" 상태라 첫 노드부터 본다 |
| P-D15 | §4.5 "평가 시각은 입력 폼의 평가 시각을 쓴다" | 화면 평가기(`evalex`)는 평가 시각 입력이 없다. 시각에 기대는 함수는 평가기가 폴백 신호를 내므로 "화면에서 계산할 수 없는 식이다" 로 보인다. LIST 값 변수를 읽는 식도 같은 문구다(`fromTypedValue` 가 LIST 를 받지 않는다) | 평가기 API 에 시각 인자가 없다. 엔진 계약을 바꾸지 않는다 |
| P-D16 | §4.4 "선 위 변수 칩에 마우스를 올리면 값 툴팁" | 변수 칩은 [변수 흐름] 토글이 켜져야 보인다(2단계). 디버그 모드에 들어가면 토글을 켜고, 나오면 들어가기 전 값으로 돌린다 | 칩이 없으면 툴팁을 올릴 자리가 없다 |
| P-D17 | §3.2 B10 "IF 갈래 선의 조건 라벨을 두 번 누르면 입력 칸" | 선 라벨(갈래 이름 `label`)을 두 번 누르면 **조건식(`cond`)** 입력 칸이 열린다. "그 외" 갈래·병렬 갈래는 열리지 않는다. 칸 밖을 누르면 취소다(Enter 만 확정) | 캔버스 선 라벨은 이름을 보이지만 B10 이 고치려는 것은 조건식이다 |
| P-D18 | §3.2 B9 붙여넣기 | 붙여 넣은·복제한 노드는 저장된 위치가 없어 자동 배치 좌표로 그려진다. **개정(브라우저 확인 5번, Ruling 19)**: 저장 위치가 없는 노드는 그리는 흐름에서 고정 노드와 겹치지 않게 비킨다, 좌표는 저장하지 않는다 — 캔버스가 그리는 흐름(접힌 흐름 포함)의 배치에서 저장 위치가 있는 노드(고정)는 두고, 고정 안 된 노드만 노드 순서대로 가로로 민다. 조건식·갈래 라벨·분기 라벨은 복사하고 룰 입출력(`rules`)은 이미 있다 | 좌표를 저장하면 한 레이아웃에서 계산한 좌표를 다른 레이아웃에서 그려 다시 겹친다 |
| P-D19 | §4.6 케이스 목록 "마지막 결과" | 마지막 결과는 화면 메모리에만 둔다(page 의 `useTestCases`). 흐름 구조(`flowVersion`)가 바뀌거나 세트를 바꾸면 모두 "안 돌림" 으로 돌아간다 | 옛 흐름의 통과·실패를 지금 흐름의 결과로 보이면 안 된다 |
| P-D20 | 팀장 지시 "FlowCanvas 새 props(끌기 대상 강조 edgeId …)" | 끌기 대상 선은 FlowCanvas **내부 상태**(`dropEdge`)이고 선 데이터 `EdgeData.dropTarget` 으로 그린다. 부모에는 놓은 순간의 선 ID 만 `onDropPalette`·`onDropRule`·`onMoveNode` 인자로 올린다 | 부모는 끄는 동안의 포인터 좌표를 모른다. 끄는 동안 page 전체를 다시 그리지 않게 한다(Local-Rules §16) |
| P-D21 | 스펙 §5 새 파일 `canvas/EdgeInsert.tsx` | 따로 두지 않고 FlowCanvas 의 선 그리기(`FlowEdgeView`) 안에 [+] 단추를 넣는다(Task 0) | 선 컴포넌트를 두 파일로 나누면 Task 0·7·11 이 같은 선 그리기를 나눠 고친다 |
| P-D22 | §3.4 D14 "확대·축소·화면 맞춤·**잠금**", §4.1 그림(디버그 단추가 세트 툴바 한 줄) | (1) React Flow `Controls` 는 `showInteractive={false}` 로 **잠금 단추를 뺀다**. (2) 디버그 단추(`DebugToolbar`)는 세트 툴바 아래 **둘째 줄**에 둔다 | (1) 잠금은 React Flow 의 끌기·연결을 켜고 끄는데 그 제어는 모드(P1·P2 `nodesDraggable`·`nodesConnectable` = `mode === "edit"`)가 맡는다 — 둘이 서로를 덮어쓴다. (2) 스펙 B4 가 세부 배치를 설계자에게 맡겼고, 한 줄에 모드·되돌리기·찾기·도움말·디버그 단추 여섯을 함께 두면 1280 폭에서 넘친다 |

## 삭제 대상 (사용자 승인 필요(삭제) — Task 12 만 승인을 기다린다)

| 대상 | 처리 | 태스크 |
|---|---|---|
| `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/SimulationPanel.tsx` | 파일 삭제(디버그 모드 `DebugInputs`·`DebugToolbar`·아래 탭으로 대체) | Task 12 **사용자 승인 필요(삭제)** |
| `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceStepper.tsx` | 파일 삭제(`DebugToolbar` 로 대체. `statusText`·`endOf` 는 Task 10 이 `debug-model.ts` 의 `debugStatus` 로 새로 만든다) | Task 12 **사용자 승인 필요(삭제)** |
| 아래 패널 "시뮬레이션" 탭 — `page.tsx` 의 보기·편집 모드 탭 목록 항목 `sim`, `flow-tab-sim`, `flow-sim-slot`, `styles/` 의 `.rsf-sim-slot` 과 **탭 전용** `.rsim-*` 규칙(`.rsim-bar*`·`.rsim-scroll`·`.rsim-input`·`.rsim-main`·`.rsim-field*`·`.rsim-evalts*`·`.rsim-stepper*`·`.rsim-progress`·`.rsim-status`) | 삭제(시뮬레이션은 디버그 모드로 옮겼다). 남는 `TraceDetail`·`ValueTable` 이 쓰는 `.rsim-pairs`·`.rsim-list`·`.rsim-badges`·`.rsim-values*` 등은 지우지 않는다 | Task 12 **사용자 승인 필요(삭제)** |
| `useSimulation.ts` 의 옛 멤버 `result`(낡으면 null 인 옛 뜻)·`run`·`step`(숫자)·`setStep`·`clear`·`clearedByEdit`, 상수 `CLEARED_BY_EDIT_MESSAGE` | 삭제(새 멤버 `last`·`stale`·`cursor`·`next`·`prev`·`resume`… 로 대체, P9) | Task 12 **사용자 승인 필요(삭제)** |
| `page.tsx` 의 보기·편집 모드 옛 겹침(`overlayAt(result, step)`) 갈래 | 삭제(겹침은 디버그 모드에서만) | Task 12 **사용자 승인 필요(삭제)** |
| `page.tsx` 의 보기·편집 모드 오른쪽 "실행 결과 / 속성" 탭 — `simResult = sim.result`, `showDetail`, `rightTab`, testid `flow-right-tab-detail`·`flow-right-tab-props`(+ 그 안의 `TraceDetail` 분기) | 삭제(보기·편집 오른쪽은 탭 머리 없이 `PropertyPanel`·`SetPanel` 만 남는다). 실행 결과·노드 상세는 디버그 모드로 옮겼다(스펙 §4.1). **사용자 승인: 이 탭도 "기존 시뮬레이션 화면 삭제" 승인 범위에 포함된다.** 대응은 Task 10 `VariablePanel` 의 노드 상세(`sim-detail*`, 사례 13) | Task 12 **사용자 승인 필요(삭제)** |
| 바뀌어 사라지는 testid: `sim-panel`·`sim-bar`·`sim-run`·`sim-clear`·`sim-scroll`·`sim-fields`·`sim-send-{k}`·`sim-input-{k}`·`sim-json`·`sim-json-import`·`sim-evalts`·`sim-error`·`sim-first`·`sim-prev`·`sim-next`·`sim-last`·`sim-progress`·`sim-status`·`flow-tab-sim`·`flow-sim-slot` | 사라진다. 대응 새 id 는 P12 표(`dbg-*`). `sim-values`·`sim-col-*`·`sim-row-*`·`sim-warnings`·`sim-detail*`·`sim-branch-*`·`sim-violation-*` 는 그대로 남는다(컴포넌트를 옮겨 쓴다) | Task 12 **사용자 승인 필요(삭제)**(새 id 는 Task 10) |
| 테스트: `tests/dme/ruleSetEdit/debugger.test.ts` 의 `SimulationPanel`·`TraceStepper` 사례, `rule-set-edit-page.test.ts` 의 시뮬레이션 탭 사례 | 삭제(같은 동작의 디버그 모드 사례는 Task 5·10 이 먼저 더한다) | Task 12 **사용자 승인 필요(삭제)** |
| `FlowCanvas.tsx` 의 내부 `onKeyDown`(선 Delete)·prop `onDeleteEdge`, 2단계 "가까운 선이 없으면 선택된 선에 넣기"(page `onDropPalette`) | 대체(단축키 디스패처로 옮김 / 스펙 A1 이 없앤다). 파일 삭제가 아니다 | Task 0 |

Task 12 는 Task 10 병합 + **Task 14 병합** + 사용자 승인 뒤에 돈다(e2e 에 `flow-tab-sim`·`sim-*` 가 남아 있으면 Task 12 Step 1 이 멈추므로 Task 14 가 먼저 병합돼야 한다 — 그래서 Task 12 는 물결 3 이 아니라 Task 14 뒤에 돈다). 다른 태스크는 Task 12 를 기다리지 않는다. Task 13·14(문서·e2e)는 `flow-tab-sim`·`sim-run` 등 사라질 id 를 쓰지 않으므로 Task 12 전에 병합해야 한다. 「수동 브라우저 확인」만 Task 12 병합 뒤에 한다.

---

## 실행 순서·모델·충돌 예측

| 물결 | 태스크 (모델 · 이유) | 선행 |
|---|---|---|
| 0 | Task 0 이음새 (**opus** · 모든 뒤 태스크의 인터페이스·충돌 경계를 정하는 설계 판단) | — |
| 1 | Task 1 결정 기록 (**haiku** · 표 내용이 계획에 다 있다) · Task 2 편집 연산 7종 (**opus** · 블록 구조 불변식·거부 규칙 판단) · Task 3 편집 이력·되돌리기 (**sonnet** · API 가 정해진 다파일 연결) · Task 4 서버 케이스·식 파싱 (**sonnet** · 코드 대부분이 계획에 있고 서버 다파일 통합) · Task 5 디버거 모델·커서 (**opus** · 커서 의미·병렬 범위·낡은 기록 상태 모델) · Task 6 식 즉석 평가 모듈 (**sonnet** · 평가기 연결 판단이 조금 있다) | 0 |
| 2 | Task 7 끌어 놓기·옮기기·룰 목록·조건식 즉석 편집 (**sonnet** · FlowCanvas 큰 변경) · Task 8 메뉴·단축키·복사·찾기·도움말 (**sonnet** · 툴바·메뉴 다파일) · Task 9 갈래 순서 끌기 (**haiku** · PropertyPanel 한 곳, 코드가 계획에 있다) · Task 10 디버그 모드 화면 (**opus** · 입력·변수·케이스·비교 다파일 통합과 상태 경계) | 7: 2 / 8: 2 / 9: 2 / 10: 4·5·6 (물결 1 전부가 끝난 뒤 시작) |
| 3 | Task 11 블록 접기·중단점 점·디버그 겹침·칩 툴팁 (**sonnet** · FlowCanvas 큰 변경) · Task 12 시뮬레이션 탭 삭제 (**haiku** · 기계적 삭제, **사용자 승인 필요(삭제)**) | 11: 7·10 / 12: 10 + **14 병합(물결 4)** + 사용자 승인 — 실제로는 Task 14 병합 뒤에 돈다 |
| 4 | Task 13 기능설계서 개정 (**sonnet** · 설계서 여러 절 판단, C14 포함) · Task 14 e2e 갱신 (**sonnet** · 시나리오 판단, 실행 금지·`--list`) · Task 15 선 경로 편집 (**sonnet** · 선 그리기·코덱 다파일, 사용자 추가 요청 C14) | 13: 0~11 / 14: 0~11 / 15: 0~11 |
| 끝 | 최종 전체 리뷰 (**opus**) → dev 병합(사용자 지시 뒤) → 수동 브라우저 확인 | 전부(12 포함) |

FlowCanvas 를 크게 고치는 태스크(Task 7·Task 11)는 서로 다른 물결에 둔다. Task 0 이 FlowCanvas 의 새 props·메뉴·Controls/MiniMap·[+] 단추·단축키 제거·드롭 시점 선 계산까지 해 두어 Task 8·10 은 FlowCanvas 를 고치지 않는다.

같은 물결 안 파일 충돌 예측(○ 고침, ● 크게 고침, – 안 고침). 표에 없는 파일은 한 태스크만 고친다.

| 파일 | 물결 1: T2 · T3 · T4 · T5 · T6 | 물결 2: T7 · T8 · T9 · T10 | 물결 3: T11 · T12 | 판단 |
|---|---|---|---|---|
| `canvas/FlowCanvas.tsx` | – · – · – · – · – | ● · – · – · – | ● · – | 물결을 나눠 충돌 없음 |
| `canvas/nodes.tsx` | – · – · – · – · – | – · – · – · – | ● · – | 없음(Task 0 이 타입 칸만 더하고 그리기는 Task 11) |
| `canvas/FlowToolbar.tsx` | – · – · – · – · – | – · ● · – · – | – · – | 없음(모드·되돌리기·미니맵 단추는 Task 0) |
| `page.tsx` | ○(상한 문구가 남아 있을 때만) · – · – · – · – | – · – · – · – | – · ○ | 물결 2·3 태스크는 page.tsx 를 고치지 않는다(Task 0 이 모든 슬롯·훅을 이미 잇는다). Task 12 만 탭 항목·옛 겹침·오른쪽 실행 결과 탭을 지운다 |
| `state/useRuleSetEdit.ts` | – · ● · – · – · – | – · – · – · – | – · – | 없음 |
| `state/useEditActions.ts` | ○(상한 문구 상수) · – · – · – · – | – · ● · – · – | – · – | 없음(물결 1 에서 이 파일을 고치는 다른 태스크가 없고 Task 8 은 물결 2) |
| `state/useDragActions.ts` | – · – · – · – · – | ● · – · – · – | – · – | 없음 |
| `panels/PropertyPanel.tsx` | – · ○(mergeKey) · – · – · – | – · – · ● · – | – · – | 물결이 달라 없음 |
| `debugger/useSimulation.ts` | – · – · – · ● · – | – · – · – · – | – · ○ | 없음 |
| `trace-view.ts`·`canvas/overlay.ts` | – · – · – · ○ · – | – · – · – · – | – · – | 없음 |
| `flow-vars.ts` | – · – · – · – · – | ○(`nearestEdge` 제외 인자) · – · – · – | – · – | 없음 |
| `styles/*.ts` | 태스크마다 자기 파일(`drag.ts` T7, `menu.ts` T8, `props.ts` T9, `debug.ts` T10, `collapse.ts` T11) | | T12 는 `debug.ts` 의 탭 전용 `.rsim-*`(bar·scroll·input·main·field·evalts·stepper·progress·status)·`.rsf-sim-slot` 만 지운다(T10 과 물결이 달라 없음) | 없음 |
| `types.ts`·`api.ts` | – (Task 0 이 모든 서명을 이미 넣는다) | – | – | 없음 |
| 서버 파일 | T4 만 | – | – | 없음 |
| `tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` | – · ○ · – · – · – | ○ · ○ · ○ · ○ | – · ○ | **물결 2 에서 네 태스크가 같은 파일에 사례를 더하면 충돌한다 → 물결 2 태스크는 자기 새 테스트 파일에 쓴다**(T7 `flow-drag.test.ts`, T8 `flow-menu.test.ts`, T9 `branch-order.test.ts`, T10 `debug-mode.test.ts`). 기존 파일은 깨진 기대만 고친다 |

병합 순서(같은 물결 안): 물결 1 → T4, T2, T5, T6, T3, T1. 물결 2 → T10, T8, T9, T7. 물결 3 → T11, T12(Task 14 병합과 승인 뒤). 병합 충돌이 나면 컨트롤러가 양쪽을 살려 푼다(한쪽을 버리지 않는다).

---
## 공유 계약 (모든 태스크가 이 이름·서명·문구를 그대로 쓴다)

경로는 모두 `src/frontend/m-mdm/pages/dme/ruleSetEdit/` 기준이다(서버는 따로 적는다).

### P1. 모드 (Task 0)

```ts
// state/useRuleSetEdit.ts
export type FlowMode = "view" | "edit" | "debug";
// RuleSetEditState.mode: FlowMode, setMode(m: FlowMode): void
```

- 세트를 열거나(`open`) [다시 불러오기](`reload`)하면 보기 모드다. **자기 쓰기 뒤 다시 불러오기(세트 저장·폐기·되살리기)는 모드를 바꾸지 않는다** — 단, 폐기·되살리기 뒤 편집 모드인데 `canEdit` 이 거짓이 되면 보기로 내린다.
- 편집 모드는 지금처럼 `view.editable && status === "INUSE" && canDo("save")` 일 때만. 디버그 모드는 누구나 들어간다(스펙 §4.1).
- 디버그 모드: 캔버스 편집 꺼짐(끌기·연결·[+]·삭제·붙여넣기·편집 메뉴 항목 없음). 입력값·중단점·조사식·기록은 모드를 오가도 유지한다(훅이 page 에 있다).
- 디버그 모드에 들어가면 [변수 흐름]을 켜고, 나오면 들어가기 전 값으로 돌린다(P-D16).
- 저장 버튼은 편집 모드에서만 켜질 수 있다(2단계 규칙 그대로).

### P2. `FlowCanvas` props (Task 0 이 모두 선언·연결, 표시 본문은 표의 태스크)

```ts
import type { TypedValue } from "@/contract/engine-contract.generated";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { MenuTarget } from "./context-menu";

export type PaletteItem = "rule" | "if" | "par" | "note" | "group";
export const PALETTE_MIME = "application/x-rsf-palette";
export const RULE_MIME = "application/x-rsf-rule";          // 룰 목록 줄 끌기(A4). 값 = ruleId
export const DROP_RADIUS_PX = 80;
export const dropRadius = (zoom: number) => DROP_RADIUS_PX / (zoom > 0 ? zoom : 1);   // 흐름 좌표 반경

export interface CollapsedBlockInfo { count: number; ran: number; error: boolean }

export interface FlowCanvasProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  mode: FlowMode;
  showVars: boolean;
  selectedId: string | null;
  selectedEdgeId: string | null;
  overlay: Overlay | null;                      // 디버그 겹침(P9 debugOverlay). 낡은 기록이면 page 가 null 을 넘긴다(P-D9)
  focusId: string | null;
  focusSeq: number;
  focusReveal?: boolean;                        // true 면 노드가 이미 화면 안이면 옮기지 않고 깜빡이기만(E1)
  fitSignal?: number;
  fitKey?: string | null;
  breakpoints: ReadonlySet<string>;             // E2 — 표시는 Task 11
  collapsed: ReadonlySet<string>;               // D16 — 접힌 분기 ID, 표시는 Task 11
  showMiniMap: boolean;                         // D14 — Task 0
  valueAt?: (name: string) => TypedValue | null | undefined;  // E3 칩 툴팁(undefined = 아직 없음) — Task 11
  editingCondEdgeId: string | null;             // B10 즉석 조건식 편집 중인 선 — Task 7
  onSelect: (id: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onOpenRule: (ruleId: string) => void;
  onMove: (pos: Record<string, FlowPos>) => void;                          // 선 밖에 놓은 끌기 끝(편집 모드)
  onMoveNode: (nodeId: string, edgeId: string, pos: Record<string, FlowPos>) => void; // A2 선 위에 놓음 — Task 7
  onConnect: (from: string, to: string) => void;
  onDropPalette: (item: PaletteItem, at: FlowPos, edgeId: string | null) => void;     // A1 — 캔버스가 놓은 자리의 선(없으면 null)을 계산해 넘긴다
  onDropRule: (ruleId: string, edgeId: string | null) => void;                        // A4
  onNoteChange: (id: string, patch: Partial<FlowNote>) => void;
  onContextMenu: (target: MenuTarget, at: { x: number; y: number }) => void;          // B7·A3
  onEditCond: (edgeId: string, cond: string) => void;                                  // B10 Enter
  onEditCondClose: () => void;                                                         // B10 Esc·밖 누르기
  onToggleBreakpoint: (nodeId: string) => void;                                        // E2 점 누르기 — Task 11
  onSelectionChange?: (nodeIds: string[]) => void;
}
```

- 없애는 것: `onDeleteEdge` prop, 내부 `onKeyDown`(선 Delete). Delete 는 P3 디스패처가 page 에서 받는다.
- 모드별: `nodesDraggable`·`nodesConnectable` 은 `mode === "edit"` 일 때만. 우클릭은 모든 모드에서 `onContextMenu` 를 부른다(항목은 P4 가 모드로 거른다).
- 노드 데이터(`canvas/nodes.tsx` `FlowNodeData`)에 Task 0 이 칸만 더한다: `breakpoint: boolean`, `canBreak: boolean`(RULE·IF·PARALLEL·MERGE 이고 debug 모드), `collapsed: CollapsedBlockInfo | null`, `onToggleBreakpoint: (nodeId: string) => void`. 그리기는 Task 11.
- 선 데이터(`EdgeData`)에 Task 0 이 칸만 더한다: `dropTarget: boolean`(Task 7 이 채움), `insertable: boolean`(편집 모드면 true — [+] 단추), `condEditable: boolean`(편집 모드 + IF 의 "그 외" 아닌 갈래), `editingCond: boolean`, `valueOf?: (name: string) => TypedValue | null | undefined`.

| 표시 | 담당 |
|---|---|
| 드롭 시점의 선 계산(`nearestEdge(flow, pos, at, dropRadius(zoom))`), [+] 단추(`flow-edge-add-{edgeId}` → `onContextMenu({kind:"edge", edgeId, via:"plus"}, 단추 위치)`), `Controls`·`MiniMap`(`showMiniMap`), 우클릭 → `onContextMenu`, `focusReveal` | Task 0 |
| 끄는 동안 선 강조(`dropTarget`)·"여기에 넣기" 표지, 놓인 노드·블록 끌어 옮기기, 룰 줄 드롭, 조건식 즉석 편집 칸 | Task 7 |
| 중단점 점, 접힌 블록 그리기·선 다시 잇기, 디버그 상태 모양(current·next·pending), 칩 툴팁, 접힌 블록 안 노드로의 이동 | Task 11 |

### P3. 단축키 디스패처 `canvas/shortcuts.ts` (Task 0, 전문은 Task 0 Step 1·3)

```ts
export type ShortcutId =
  | "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find"
  | "continue" | "step" | "stepBack" | "breakpoint";
export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;
export function isMacPlatform(nav?: { platform?: string; userAgent?: string }): boolean;
export function isTypingTarget(t: EventTarget | null): boolean;
export function shortcutOf(e: KeyLike, mac: boolean): ShortcutId | null;
export function dispatchShortcut(e: KeyLike & { preventDefault(): void; stopPropagation(): void }, handlers: ShortcutHandlers, mac: boolean): boolean;
export const SHORTCUT_HELP: readonly { id: ShortcutId; win: string; mac: string; label: string; modes: readonly FlowMode[] }[];
```

| id | 키(Win/Linux) | 키(Mac) | 모드 |
|---|---|---|---|
| undo | Ctrl+Z | Cmd+Z | edit |
| redo | Ctrl+Shift+Z, Ctrl+Y | Cmd+Shift+Z, Cmd+Y | edit |
| delete | Delete, Backspace | Delete, Backspace(=fn 없이 ⌫) | edit |
| escape | Esc | Esc | 모두 |
| copy / paste / duplicate | Ctrl+C / Ctrl+V / Ctrl+D | Cmd+C / Cmd+V / Cmd+D | edit |
| find | Ctrl+F | Cmd+F | 모두 |
| continue | F5 | fn+F5 | debug |
| step / stepBack | F10 / Shift+F10 | fn+F10 / fn+Shift+F10 | debug |
| breakpoint | F9 | fn+F9 | debug |

- 입력 칸이 대상이면 `null`. Alt 가 눌렸으면 `null`. Mac 에서 Ctrl(Cmd 아님)+Z 는 `null`, Win 에서 Meta+Z 는 `null`. 기능키·Delete·Esc 는 수정키(Ctrl·Cmd)가 눌렸으면 `null`.
- `dispatchShortcut`: 판정 id 에 손잡이가 **있을 때만** `preventDefault()`·`stopPropagation()` 후 부르고 `true`. 손잡이가 없으면 아무것도 안 하고 `false`(브라우저·포털 동작 그대로).
- page 는 캔버스 감싸개 `rsf-canvas-host` 의 `onKeyDown` 에서만 부른다(키 이벤트는 초점을 가진 캔버스 `rsf-canvas`(`tabIndex=0`)에서 올라온다 — 캔버스를 누르면 초점이 간다). 손잡이 표는 모드별로 page 가 만든다(위 표의 모드 열).

### P4. 우클릭·[+] 메뉴 `canvas/context-menu.ts`·`canvas/ContextMenu.tsx`·`canvas/menus/*` (Task 0)

```ts
// canvas/context-menu.ts
export type MenuTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string; via: "context" | "plus" }
  | { kind: "pane"; at: FlowPos };
export interface MenuItem {
  id: string;                  // testid 는 `flow-menu-item-${id}`
  label: string;
  run?: () => void;            // 없으면 children 만 있는 묶음 제목
  disabled?: boolean;
  title?: string;              // 꺼진 이유
  danger?: boolean;
  children?: MenuItem[];       // 하위 항목(분기 풀기 갈래 고르기). 메뉴 안에 들여 쓴 묶음으로 그린다(떠 있는 하위 메뉴 없음)
}
export interface CanvasActions {
  openRule(ruleId: string): void;
  fit(): void;
  autoLayout(): void;
  addNote(at: FlowPos): void;
  pickRuleFor(edgeId: string): void;                              // 룰 찾기 팝업 → 그 선에 끼움
  insertSplitAt(edgeId: string, kind: "IF" | "PARALLEL"): void;
  removeNode(nodeId: string): void;
  removeEdge(edgeId: string): void;
  addBranch(splitId: string): void;
  editCond(edgeId: string): void;                                 // 즉석 조건식 칸 열기
  copy(nodeId: string): void;                                     // Task 8
  paste(edgeId: string): void;                                    // Task 8
  duplicate(nodeId: string): void;                                // Task 8
  replaceRule(nodeId: string): void;                              // Task 8 — 룰 찾기 팝업 → replaceRule
  changeSplitKind(splitId: string, kind: "IF" | "PARALLEL"): void; // Task 8
  dissolveSplit(splitId: string, keepEdgeId: string): void;       // Task 8
  toggleCollapse(splitId: string): void;                          // Task 11
  toggleBreakpoint(nodeId: string): void;                         // Task 5(훅)·Task 10(메뉴)
  runTo(nodeId: string): void;                                    // Task 5(훅)·Task 10(메뉴)
}
export interface MenuContext {
  flow: EditFlow;
  rules: RuleIoMap;
  mode: FlowMode;
  hasClipboard: boolean;
  selectedEdgeId: string | null;   // 빈 곳 메뉴의 붙여넣기 대상
  collapsed: ReadonlySet<string>;
  breakpoints: ReadonlySet<string>;
  canRun: boolean;             // canDo("execute")
  act: CanvasActions;
}
export type MenuProvider = (target: MenuTarget, ctx: MenuContext) => MenuItem[];
export function buildMenu(providers: readonly MenuProvider[], target: MenuTarget, ctx: MenuContext): MenuItem[];  // 제공자 순서대로 이어 붙이고 id 가 겹치면 앞 것만
```

- 제공자 파일(각자 자기 파일만 고친다): `menus/view-menu.ts`(Task 0 — 노드 RULE: `open-rule` 룰 편집 열기 / 빈 곳: `fit` 화면 맞춤), `menus/edit-menu.ts`(Task 8), `menus/debug-menu.ts`(Task 10), `menus/collapse-menu.ts`(Task 11). `menus/index.ts` 가 `MENU_PROVIDERS = [editMenu, collapseMenu, debugMenu, viewMenu]` 를 내보낸다(Task 0). Task 0 은 뒤 셋을 `() => []` 로 만든다(`// SEAM(Tn)`).
- `ContextMenu.tsx`: props `{ items: MenuItem[]; at: {x,y} | null; onClose(): void }`. 루트 `data-testid="flow-menu"`, 항목 `flow-menu-item-{id}`(버튼), 꺼진 항목은 `disabled` + `title`. 항목을 누르면 `run()` 뒤 닫는다. Esc·바깥 누르기·스크롤로 닫는다. 화면 밖으로 넘치면 안쪽으로 당긴다. 항목이 0개면 열지 않는다. 메뉴는 `rsf-canvas-host` 안에 있어 메뉴 단추에 초점이 있을 때 키가 디스패처로 올라가 선택을 지울 수 있으므로, 루트 `onKeyDown` 은 Esc 를 스스로 처리해(닫기) 모든 키에 `stopPropagation` 한다(디스패처 하나 원칙은 캔버스 키에만 적용).
- 스펙 B7 항목 id(각 제공자가 이 id 를 쓴다):
  - 룰 노드: `rule-replace` 룰 바꾸기, `copy` 복사, `duplicate` 복제, `delete` 삭제, `open-rule` 룰 편집 열기, `bp-toggle` 중단점 켜기/끄기(debug), `run-to` 여기까지 실행(debug)
  - 분기: `split-kind` IF↔병렬 바꾸기(라벨 "병렬로 바꾸기"/"IF로 바꾸기"), `dissolve` 분기 풀기(children `dissolve-{edgeId}` 라벨 = 갈래 이름, 빈 갈래면 "(빈 갈래)" 붙임), `add-branch` 갈래 더하기, `copy` 블록 복사, `delete` 블록 삭제, `collapse` 접기/펼치기, `bp-toggle`·`run-to`(debug)
  - 합류 노드: `bp-toggle`·`run-to`(debug)만
  - 선: `insert-rule` 룰 넣기, `insert-if` IF 넣기, `insert-par` 병렬 넣기, `paste` 붙여넣기(클립보드 있을 때만 항목이 있다), `edit-cond` 조건 편집(IF "그 외" 아닌 갈래만), `edge-delete` 선 삭제. `via:"plus"` 면 앞 넷만.
  - 빈 곳: `note-add` 메모 더하기, `paste` 붙여넣기(클립보드 있고 **선택된 선이 있을 때**, 대상 = 선택된 선), `auto-layout` 자동 정렬, `fit` 화면 맞춤
  - 보기 모드: `open-rule`·`collapse`·`fit` 만. 디버그 모드: 보기 모드 항목 + `bp-toggle`·`run-to`.

### P5. 편집 이력 (Task 0 이 API 를 박고 Task 3 이 채운다)

```ts
// state/edit-history.ts (Task 3 이 만든다)
export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;
export class EditHistory {
  constructor(limit?: number, mergeMs?: number, now?: () => number);
  get canUndo(): boolean;
  get canRedo(): boolean;
  /** 바뀌기 "전" 흐름을 적는다. mergeKey 가 직전 기록과 같고 직전 기록 뒤 mergeMs 안이면 새로 적지 않는다(합치기, 시각만 늦춘다). 다시 하기 스택을 비운다. 상한을 넘으면 가장 오래된 것을 버린다. */
  record(before: EditFlow, mergeKey?: string): void;
  undo(current: EditFlow): EditFlow | null;   // 되돌린 흐름(없으면 null). current 는 다시 하기 스택으로
  redo(current: EditFlow): EditFlow | null;
  clear(): void;
}

// state/useRuleSetEdit.ts — RuleSetEditState 에 더한다(Task 0 이 서명·임시 본문, Task 3 이 본문)
export interface EditOptions { mergeKey?: string }
edit(fn: (f: EditFlow) => EditResult | EditFlow, opts?: EditOptions): string | null;
canUndo: boolean;
canRedo: boolean;
undo(): void;
redo(): void;
```

- 기록 규칙: `edit` 이 성공하고 `flowJsonOf(next) !== flowJsonOf(cur)` 일 때만 `record(cur, opts?.mergeKey)`. 끌기는 놓을 때 한 번(`onMove`·`onMoveNode` 가 `edit` 한 번). 조건식·이름·메모 입력은 mergeKey 로 합친다: 선 조건식 `cond:{edgeId}`, 선 이름 `elabel:{edgeId}`, 노드 이름 `nlabel:{nodeId}`, 메모 글 `note:{id}`, 그룹 제목 `group:{id}`.
- `undo()`/`redo()` 는 편집 모드에서만 동작하고 `replaceFlow(next, { refetchCond: true })` 를 탄다(`flowVersion`·조건식 IO 재요청이 같이 돈다). 다른 합치기 키 기록을 끊는다(되돌린 뒤 첫 입력은 새 기록).
- `open`·`reload` 는 이력을 비운다. 세트 저장·폐기·되살리기 뒤의 다시 불러오기(`runWrite` → `load(id, { keepHistory: true })`)는 비우지 않는다.
- dirty 는 지금처럼 저장된 정규 JSON 과 비교한다(되돌려 저장본과 같아지면 dirty 가 풀린다).
- `beforeunload`: dirty 인 동안만 리스너를 달고 `e.preventDefault(); e.returnValue = ""`.

### P6. 편집 연산 (Task 2, `flow-edit.ts` 에 더한다)

```ts
export interface Fragment { nodes: FlowNode[]; edges: FlowEdge[]; entry: string; exit: string }
export const NODE_LIMIT_MESSAGE = `노드는 흐름 하나에 ${MAX_NODES}개까지 둔다`;   // page 의 같은 문구를 이 상수로 바꾼다
export function blockMembers(f: EditFlow, splitId: string): string[] | null;      // 분기 + 안쪽 + 짝 합류(흐름 노드 순서). 블록이 닫히지 않으면 null
export function moveExcludedEdges(f: EditFlow, nodeId: string): ReadonlySet<string>; // 옮길 때 대상에서 뺄 선
export function moveNode(f: EditFlow, nodeId: string, edgeId: string): EditResult;
export function replaceRule(f: EditFlow, nodeId: string, ruleId: string): EditResult;
export function copyFragment(f: EditFlow, nodeId: string): Fragment | string;       // 문자열 = 거부 사유
export function pasteFragment(f: EditFlow, edgeId: string, frag: Fragment): EditResult;
export function duplicateNode(f: EditFlow, nodeId: string): EditResult;
export function changeSplitKind(f: EditFlow, splitId: string, kind: "IF" | "PARALLEL"): EditResult;
export function dissolveSplit(f: EditFlow, splitId: string, keepEdgeId: string): EditResult;
export function reorderBranches(f: EditFlow, splitId: string, edgeIds: readonly string[]): EditResult;
```

규칙(모두 2단계 P7 의 "입력 불변·모든 칸 채움·`parseFlow` 오류 없음 유지"를 따른다):
- `moveExcludedEdges(n)`: RULE 이면 n 으로 들어오는·나가는 선. IF·PARALLEL 이면 분기로 들어오는 선, 짝 합류에서 나가는 선, 블록 안(분기·안쪽·합류 사이) 모든 선. 그 밖 종류·블록이 닫히지 않으면 빈 집합.
- `moveNode(n, t)`:
  - START·END·MERGE → `{종류} 노드는 옮길 수 없다`(`시작 노드는 옮길 수 없다` / `끝 노드는 옮길 수 없다` / `합류 노드는 분기를 옮겨서 옮긴다`). 선 t 가 없으면 `선 {t}를 찾지 못했다`. t 가 `moveExcludedEdges(n)` 에 있으면 `자기 자리나 자기 블록 안으로는 옮길 수 없다`.
  - 떼기: RULE 은 `removeNode` 와 같은 조건(들어옴·나감 하나씩, 아니면 그 문구)으로 들어오는 선 a 의 to 를 나가는 선의 to 로 바꾸고 나가는 선을 지운다. 분기는 분기 들어옴 a·합류 나감 b 가 하나씩이어야 하고(아니면 `분기 {id}의 짝 합류를 찾지 못해 옮길 수 없다`) a.to = b.to, b 를 지운다. 블록 안 노드·선은 그대로 둔다.
  - 끼우기: t(X→Y) 의 to 를 n(분기면 분기 노드)으로, 새 선 `{출구 → Y}`(출구 = RULE 이면 n, 분기면 짝 합류, 새 ID `e*`)를 선 배열에서 t 바로 뒤에 넣는다. t 의 order·cond·otherwise·label 은 그대로(IF 갈래 선에 끼워도 갈래 뜻이 남는다).
  - 노드 배열 순서·`view.positions` 는 바꾸지 않는다(위치는 캔버스가 같은 `edit` 안에서 `setPositions` 로 넘긴다 — Task 7).
- `replaceRule(n, ruleId)`: RULE 이 아니면 `룰 노드만 룰을 바꾼다`, 공백이면 `룰 ID 가 비었다`. 노드 id·선·라벨·위치는 그대로, `ruleId` 만 바꾼다. 같은 세트에 같은 룰이 있어도 막지 않는다.
- `copyFragment(n)`: RULE → 노드 하나, entry=exit=n. IF·PARALLEL → `blockMembers` 노드 전부와 양 끝이 모두 그 안인 선 전부, entry=분기, exit=합류. START·END·MERGE → `시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다`. 블록이 닫히지 않으면 `분기 {id}의 블록을 찾지 못해 복사할 수 없다`. 돌려주는 조각은 깊은 복사다.
- `pasteFragment(t, frag)`: `f.nodes.length + frag.nodes.length > MAX_NODES` → `NODE_LIMIT_MESSAGE`. t 가 없으면 `선 {t}를 찾지 못했다`. 조각 노드마다 종류별 접두어(RULE `r`, IF `if`, PARALLEL `par`, MERGE `m`)로 새 ID, 선은 `e` 로 새 ID. MERGE 의 `splitId` 는 새 분기 ID 로 바꾼다. 라벨·조건식·order·otherwise 는 복사. t.to = 새 entry, 새 선 `{새 exit → 원래 t.to}`. 노드는 t.from 노드 뒤(없으면 끝)에, 조각 선·출구 선은 t 바로 뒤에 넣는다. 위치는 넣지 않는다(P-D18).
- `duplicateNode(n)`: `copyFragment` 뒤, RULE 이면 n 에서 나가는 선(하나여야 한다 — 아니면 `룰 노드의 선이 하나씩이 아니라 복제할 수 없다`), 분기면 짝 합류에서 나가는 선에 `pasteFragment`.
- `changeSplitKind(s, kind)`: s 가 IF·PARALLEL 이 아니면 `분기 노드만 바꾼다`, 같은 종류면 `이미 {IF|병렬} 분기다`, 짝 합류 없으면 `분기 {id}의 짝 합류를 찾지 못했다`.
  - IF→PARALLEL: 갈래 선(분기에서 나가는 선)을 (otherwise 아닌 것 order 순, otherwise 마지막) 순서로 order 1..n, cond=null, otherwise=false.
  - PARALLEL→IF: 갈래 선을 order 순으로 두고 마지막을 otherwise=true·order=null·cond=null, 나머지는 order 1..n-1, cond 는 null 그대로(빈 조건식은 `FLOW_IF_ELSE` 검사로 드러난다).
  - 라벨: 분기 노드 라벨이 기본 라벨(`조건`·`병렬`)이거나 null 이면 새 기본 라벨. 갈래 선 라벨이 `/^갈래 \d+$/` 이거나 `그 외` 이거나 null 이면 새 규칙으로 다시 붙인다(IF: `갈래 {order}`·`그 외`, PARALLEL: `갈래 {order}`). 사용자가 붙인 다른 라벨은 그대로. 노드 ID 는 유지.
- `dissolveSplit(s, keep)`: s 가 분기가 아니면 `분기 노드만 푼다`. keep 이 s 에서 나가는 선이 아니면 `분기 {s}의 갈래가 아니다`. 짝 합류·블록이 없으면 `분기 {id}의 짝 합류를 찾지 못해 풀 수 없다`. 분기 들어옴 a·합류 나감 b 가 하나씩이어야 한다.
  - keep 갈래가 비었으면(keep.to = 합류): a.to = b.to.
  - 아니면: a.to = keep.to, keep 갈래 안에서 합류로 들어오는 선들의 to = b.to.
  - 그 뒤 분기·합류·다른 갈래 안 노드를 `dropNodes` 로 지운다(닿는 선·view 흔적 함께). a 의 order·cond·otherwise·label 은 그대로.
- `reorderBranches(s, ids)`: ids 가 s 의 "그 외" 아닌 갈래 선 ID 집합과 정확히 같지 않으면 `갈래 목록이 맞지 않는다`. ids 순서대로 order 1..n. IF 의 "그 외" 는 그대로(마지막). 라벨·선 배열 순서는 그대로.

### P7. 서버 — 테스트 케이스(E6)·식 파싱(E5) (Task 4)

**DB — `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V15__create_mdm_rule_set_test_case.sql`**

```sql
-- 2026-09-30 — 룰 세트 테스트 케이스 테이블(spec docs/superpowers/specs/2026-09-30-rule-set-flow-editor-debugger-design.md §4.6).
--
-- 왜: 흐름을 고칠 때마다 저장해 둔 입력들로 결과가 그대로인지 한 번에 확인한다(디버그 모드 [모두 실행]).
-- 모양은 룰 테스트 케이스(V8 TB_MDM_RULE_TEST_CASE)와 같고, 세트는 판정 시각(EVAL_TS, KST yyyy-MM-dd HH:mm:ss 문자열, 없으면 실행 시각)을 더 둔다.
-- CASE_ID 는 세트 안 최대 번호 + 1 로 서버가 발급한다(세트 테이블에 카운터 칼럼을 더하지 않는다 — 칼럼 순서 불변식).
-- 주의: TB_MDM_RULE_SET 을 가리키는 첫 FK 다. V14 머리의 "TB_MDM_RULE_SET 을 참조하는 FK 는 없다" 는 이 파일부터 참이 아니다.
-- 세트 테이블을 DROP/RENAME 으로 다시 만드는 마이그레이션은 이 테이블을 먼저 옮기거나 다시 만들어야 한다.
-- 되돌리려면: DROP TABLE TB_MDM_RULE_SET_TEST_CASE (케이스가 사라진다).

CREATE TABLE TB_MDM_RULE_SET_TEST_CASE (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    CASE_ID INTEGER NOT NULL,
    CASE_NAME TEXT,
    INPUT_JSON TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_INPUT_JSON CHECK (json_valid(INPUT_JSON)),
    EVAL_TS VARCHAR(19),
    EXPECTED_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_EXPECTED_JSON CHECK (EXPECTED_JSON IS NULL OR json_valid(EXPECTED_JSON)),
    DESCRIPTION TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET_TEST_CASE PRIMARY KEY (MARU_RULE_SET_ID, CASE_ID),
    CONSTRAINT FK_TB_MDM_RULE_SET_TEST_CASE_SET FOREIGN KEY (MARU_RULE_SET_ID) REFERENCES TB_MDM_RULE_SET (MARU_RULE_SET_ID)
);
```

**엔티티·조회·쓰기**(룰 케이스와 같은 모양, 패키지 `com.dongkuk.dmes.mdm`):
- `entity/MdmRuleSetTestCase`(`@IdClass(MdmRuleSetTestCaseId)`, `CactusAuditEntity` 상속, 칼럼 = 위 표, `ROW_VERSION` `updatable=false`), `entity/MdmRuleSetTestCaseId`(`maruRuleSetId`, `caseId`, equals·hashCode). 리포지토리는 만들지 않는다(가드 `MdmRuleContractOnlyArchitectureTest` — 조회는 EntityManager).
- `common/rule/RuleSetTestCaseQueries`(@Component): `List<MdmRuleSetTestCase> cases(String setId)`(CASE_ID 오름차순, **상한 없이 읽는다** — 일괄 실행의 50건 검사가 닿게 하려고 여기서 자르지 않는다), `long count(String setId)`, `int maxCaseId(String setId)`(없으면 0).
- `common/rule/RuleSetTestCaseWrites`(@Repository): `insert(MdmRuleSetTestCase)`(persist + flush — PK 가 겹치면 실패), `int update(setId, caseId, rowVersion, caseName, inputJson, evalTs, expectedJson, description)`(ROW_VERSION+1·감사 U_*·VER+1, `RuleTestCaseWrites.update` 와 같은 SQL 모양), `int delete(setId, caseId, rowVersion)`.
- `common/rule/RuleCaseInputs`(새, 공개 정적): `RuleTestCaseService` 의 `requireObject(what, json)`·`limit(detail)` 를 옮긴다(동작 그대로, 룰 케이스 서비스도 이것을 부른다).

**요청·응답 DTO**(`com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto`, 모두 문자열·스칼라 칸):
- `RuleSetSaveRequest` 에 더함: `String part`(null·`SET` = 세트 저장, `CASE` = 케이스), `Integer caseId`, `String caseName`, `String inputJson`, `String evalTs`, `String expectedJson`, `Boolean caseDeleted`. `part=CASE` 에서 `rowVersion` 은 **케이스의** row_version, `description` 은 **케이스의** 설명이다(클래스 주석에 적는다).
- `RuleSetSaveResult`: `rowVersion` 을 `Long` 으로(케이스 삭제면 null), `Integer caseId` 더함(세트 저장이면 null).
- `RuleSetViewResult` 에 `List<Case> cases` 칸(생성자 끝 인자) — `public static class Case { Integer caseId; String caseName; String inputJson; String evalTs; String expectedJson; String description; long rowVersion; }`.
- `RuleSetSimulateRequest` 에 더함: `String setId`, `Boolean runCases`, `String caseIds`(콤마로 이은 ID, 비면 전체) + `List<Integer> caseIdList()`(`RuleTestRequest.caseIdList` 와 같은 규칙 — 숫자가 아니면 -1).
- `RuleSetSimulateResult` 에 `List<Map<String, Object>> cases` 칸(단건 실행이면 null).
- `RuleSetCondIoRequest` 에 `String exprText`, `RuleSetCondIoResult` 에 `RuleExprParseResult expr`(`dme.ruleEdit.dto` 재사용, 흐름 IO 요청이면 null).

**서비스**:
- `RuleSetEditService.save`: 맨 앞에서 `if ("CASE".equals(request.getPart())) return caseService.save(request);` (세트명 검사 전에). `part` 가 null·`SET`·`CASE` 밖이면 `INVALID_VALUE` `save part 는 SET·CASE 중 하나여야 합니다: {part}`.
- `dme/ruleSetEdit/service/RuleSetTestCaseService`(@Service, `@Transactional` 금지 — `TransactionTemplate`):
  1. setId 필수(`룰 세트 ID 는 필수입니다.`), 세트가 없으면 `INVALID_VALUE` `룰 세트를 찾을 수 없습니다: {id}`, DEPRECATED 면 MDM009 `폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다`(P-D8). 그 뒤 `stewardCheck.requireSteward()`(MDM013).
  2. `caseDeleted=true`: caseId 필수(`지울 케이스 ID(caseId)는 필수입니다.`), rowVersion 필수(`row_version 은 필수입니다.`), 0행이면 MDM001. 결과 `{rowVersion: null, caseId}`.
  3. 이름 필수(`케이스 이름은 필수입니다.`), 100자 초과면 MDM021 `테스트 케이스 상한 — 케이스 이름이 {n}자다. 100자까지 받는다`. 입력 필수(`입력 JSON(inputJson)은 필수입니다.`) + `RuleCaseInputs.requireObject("입력", …)`. 기대가 공백이 아니면 `requireObject("기대", …)`. evalTs 가 공백이 아니면 `RuleSetRunner.parseKst(trim)`(형식 오류는 그 문구의 INVALID_VALUE)로 확인하고 trim 한 글자를 저장. 설명 blank→null.
  4. 새 케이스(caseId null): `count >= 50` 이면 MDM021 `테스트 케이스 상한 — 세트의 케이스가 이미 {n}건이다. 세트마다 50건까지 둔다`(P-D5). `caseId = maxCaseId + 1`, persist. **PK 충돌**(JPA·Spring 의 `DataIntegrityViolationException`·`PersistenceException`, 원인 사슬에 `SQLITE_CONSTRAINT_PRIMARYKEY` 또는 `PRIMARY KEY` 문구)은 트랜잭션 밖에서 잡아 MDM001 `같은 세트에 케이스가 동시에 저장됐습니다. 목록을 다시 불러와 저장하세요` 로 바꾼다. 결과 `{rowVersion: 0, caseId}`.
  5. 고치기(caseId 있음): rowVersion 필수, `update` 0행이면 MDM001. 결과 `{rowVersion: rv+1, caseId}`.
- `RuleSetEditService.view`: `cases = caseQueries.cases(setId)` 를 `RuleSetViewResult.Case` 로 싣는다(상태와 무관, P-D8).
- `RuleSetEditService.simulate`: `Boolean.TRUE.equals(runCases)` 면 `runCases(request)`:
  1. flowJson 필수(기존 문구), setId 필수. 케이스 = `caseQueries.cases(setId)`(상한 없음) 를 `caseIdList()` 로 거른다(목록이 비면 전체). **실행 전에** 거른 결과가 50건을 넘으면 MDM021 `테스트 케이스 상한 — 한 번에 {n}건을 돌리려 한다. 50건까지 돌린다`(아무것도 돌리지 않는다).
  2. 케이스마다: `record = RuleCaseJudge.object(inputJson)` — null 이면 그 케이스 결과는 `outcome=ERROR`, errors `[{stage:"INPUT_CHECK", code:"INVALID_INPUT_JSON", message:"케이스 입력이 JSON 객체가 아니다"}]`, `pass=false`. 아니면 `ts = evalTs == null ? null : parseKst(evalTs)`, `trace = runner.trace(flowJson, record, ts)`, `RuleSetCaseJudge.judge(...)`.
  3. `StoredDefinitionException` 은 단건 실행과 같은 MDM026 으로 요청 전체를 거부한다.
  4. 응답 `new RuleSetSimulateResult(null, List.of(), cases)`.
- `common/rule/RuleSetCaseJudge`(새, 공개 정적):

```java
public static Map<String, Object> judge(Integer caseId, String caseName, String expectedJson, RunTrace trace)
// → {caseId, caseName, outcome: "OK"|"ERROR", pass: Boolean|null, mismatches: [{key, expected, actual}], finalValues: {이름: RuleCaseJudge.value(값)}, errors: [...]}
```
  - 오류 = `trace.violations()` 가 비어 있지 않으면 그것, 아니면 status ERROR 인 첫 노드의 `violations()`. errors 는 `RuleCaseJudge` 의 `error(Violation)` 모양(`{stage, code, rowId, name, message(RuleErrorText 문장), detail(원문)}`) — `RuleCaseJudge.error(Violation)` 를 `public static` 으로 연다. 키 찾기·mismatch 맵도 같은 논리를 다시 쓰지 않고 `RuleCaseJudge` 의 `resultKey`·`mismatch` 를 `public static` 으로 열어 `RuleSetCaseJudge` 가 부른다.
  - 비교(P-D3·P-D4): 오류면 `pass=false`(mismatches 비움). 기대 공백·null 이면 `pass=null`. 기대가 객체가 아니면 mismatch `("(expected)", 원문, null)`·`false`. 키마다 `finalValues` 에서 같은 이름, 없으면 대소문자 무시로 찾고, 없으면 mismatch(`actual=null`), `!RuleCaseJudge.sameValue(기대, 실제)` 면 mismatch(`actual = RuleCaseJudge.value(실제)`).
- `RuleSetEditService.condIo`: `exprText` 가 공백이 아니면 `ruleEditService.parseExpr(req{text: exprText, slot: "RULE_COND_EXPR"})` 를 불러 `new RuleSetCondIoResult(Map.of(), parsed)`. 파싱 오류는 그 서비스의 `INVALID_VALUE` `식을 파싱할 수 없습니다: …` 그대로. 아니면 지금 동작(`expr=null`). `RuleEditService` 를 생성자로 받는다(빈 이름 `ruleEditService`).

### P8. 화면 API·타입 (Task 0 이 모두 넣고, Task 4 가 서버를 만든다)

```ts
// types.ts 에 더한다
export interface RuleSetCaseView {
  caseId: number; caseName: string | null; inputJson: string; evalTs: string | null;
  expectedJson: string | null; description: string | null; rowVersion: number;
}
// RuleSetView 에: cases: RuleSetCaseView[]
// RuleSetSaveResult: rowVersion: number | null; caseId?: number | null
export interface CaseDraft {
  caseId: number | null; rowVersion: number | null;
  caseName: string; inputJson: string; evalTs: string; expectedJson: string; description: string;
}
export interface CaseRunError { stage: string; code: string; rowId: number | null; name: string | null; message: string; detail: string | null }
export interface CaseMismatch { key: string; expected: unknown; actual: unknown }
export interface CaseRunResult {
  caseId: number; caseName: string | null; outcome: "OK" | "ERROR"; pass: boolean | null;
  mismatches: CaseMismatch[]; finalValues: Record<string, unknown>; errors: CaseRunError[];
}
export interface RuleSetCaseRunResult { cases: CaseRunResult[] }
export interface ExprParse { ast: unknown; refVars: string[]; supported: boolean; problems: { kind: string; detail: string }[] }
export interface RuleSetExprParseResult { expr: ExprParse }

// api.ts 에 더한다
export function saveCase(setId: string, d: CaseDraft): Promise<RuleSetSaveResult>;
//   → callOasis(SERVICE, "save", { part: "CASE", setId, caseId: d.caseId ?? undefined, rowVersion: d.rowVersion ?? undefined,
//        caseName: d.caseName.trim(), inputJson: d.inputJson, evalTs: blankToUndefined(d.evalTs),
//        expectedJson: blankToUndefined(d.expectedJson), description: blankToUndefined(d.description) })
export function deleteCase(setId: string, caseId: number, rowVersion: number): Promise<RuleSetSaveResult>;
//   → callOasis(SERVICE, "save", { part: "CASE", setId, caseId, rowVersion, caseDeleted: true })
export function runCases(setId: string, flowJson: string, caseIds: readonly number[]): Promise<RuleSetCaseRunResult>;
//   → callOasis(SERVICE, "execute", { setId, flowJson, runCases: true, caseIds: caseIds.join(",") })
export function parseExprText(exprText: string): Promise<RuleSetExprParseResult>;
//   → callOasis(SERVICE, "validate", { exprText })
```

### P9. 디버거 모델 (Task 0 이 서명, Task 5 가 본문)

`TraceFrame.before` 는 예외다 — 이 절 제목과 달리 Task 0 서명에 넣지 않고 Task 5 가 더한다(Task 0 Step 9 가 정본. 타입을 넓히면 Task 5 전 구현이 깨진다).

```ts
// canvas/overlay.ts — NodeState 에 "next" 를 더한다
export type NodeState = "run" | "error" | "current" | "next" | "pending" | "dim";

// trace-view.ts — TraceFrame 에 before(노드를 실행하기 전 그 노드 범위의 ctx 사본)를 더한다
export interface TraceFrame { index: number; node: NodeTrace; before: Record<string, TypedValue>; ctx: Record<string, TypedValue>; changed: string[] }
export function sameTyped(a: TypedValue | null | undefined, b: TypedValue | null | undefined): boolean;   // 지금 내부 함수를 내보낸다
export function debugOverlay(trace: RunTrace, flow: RuleSetFlow, cursor: number): Overlay;

// debugger/debug-model.ts (새)
export interface DebugVar { name: string; value: TypedValue; created: boolean; changed: boolean }
export function variablesAt(trace: RunTrace, flow: RuleSetFlow, cursor: number): DebugVar[];      // 이름 순
export function nextStop(trace: RunTrace, from: number, inclusive: boolean, stops: ReadonlySet<string>): number | null;
export type RunToResult = { index: number } | { notice: string };
export function runToIndex(trace: RunTrace, cursor: number, inclusive: boolean, nodeId: string): RunToResult;
export const PASSED_NOTICE = "이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다";
export const NOT_ON_PATH_NOTICE = "이 입력으로는 이 노드를 지나지 않는다";
export interface ValueDiffRow { name: string; before: TypedValue | null; after: TypedValue | null; same: boolean }
export interface RunDiff { values: ValueDiffRow[]; onlyBefore: string[]; onlyAfter: string[] }
export function compareRuns(before: RunTrace, after: RunTrace): RunDiff;
export function debugStatus(trace: RunTrace | null, cursor: number): string;   // Task 10 이 채운다(툴바 문구)
export function expectedFromFinal(finalValues: Record<string, TypedValue>): string;  // Task 10 이 채운다(케이스 기대값 JSON)

// debugger/useSimulation.ts — 반환 타입 Simulation(옛 멤버는 Task 12 가 지운다)
export interface DebugInput { recordJson: string; evalTs: string }
export interface SimResult { trace: RunTrace; warnings: SimWarning[]; flow: EditFlow; flowVersion: number; input: DebugInput }
export interface Simulation {
  // 입력 — 2단계 그대로
  fields: SimField[]; setInput(key: string, patch: { value?: string; on?: boolean }): void;
  json: string; setJson(v: string): void; jsonError: string | null; importJson(): void;
  evalTs: string; setEvalTs(v: string): void; evalTsError: string | null;
  error: string | null; running: boolean;
  // 입력 — 3단계
  currentInput(): DebugInput | null;           // 지금 보낼 입력(JSON 칸이 있으면 그것), 입력 오류면 null
  loadInput(input: DebugInput): void;          // 케이스·최근 입력 불러오기 — 객체면 폼으로 풀고, 아니면 JSON 칸에 둔다
  recent: DebugInput[];                        // 최근 10(세트별 localStorage)
  // 기록·커서 — 3단계
  last: SimResult | null;                      // 가장 최근 기록(흐름이 바뀌어도 남는다)
  stale: boolean;                              // last.flowVersion !== 지금 flowVersion
  previous: SimResult | null;                  // 바로 전 실행(E7)
  cursor: number;                              // 0..n, 기록 없으면 -1 (P-D13)
  atEnd: boolean;                              // last 가 있고 cursor === n
  variables: DebugVar[];                       // last·cursor 기준(낡아도 옛 기록 기준)
  valueAt(name: string): TypedValue | null | undefined;   // 대소문자 무시, 없으면 undefined
  next(): Promise<void>;                       // F10
  prev(): void;                                // Shift+F10
  resume(): Promise<void>;                     // F5
  runTo(nodeId: string): Promise<void>;        // 알림은 notice 로
  restart(): Promise<void>;
  finish(): Promise<void>;
  setCursor(n: number): void;
  breakpoints: ReadonlySet<string>;
  toggleBreakpoint(nodeId: string): void;      // RULE·IF·PARALLEL·MERGE 만, 세트별 localStorage
  notice: string | null;                       // 한 줄 알림(여기까지 실행 등). 다음 동작에서 지운다
  // 옛 멤버(2단계 시뮬레이션 탭 전용 — Task 12 가 지운다)
  result: SimResult | null;                    // = stale ? null : last
  run(): Promise<void>;                        // 새 실행 뒤 옛 step = 마지막
  step: number;                                // 옛 단계(실행된 마지막 노드)
  setStep(step: number): void;
  clear(): void;                               // last·previous·옛 step 을 지운다
  clearedByEdit: boolean;                      // = stale
}
```

의미(Task 5):
- **새로 실행해야 하는가(`needsFresh`)**: 기록이 없거나, 낡았거나(`stale`), 지금 입력이 기록 입력과 다르다(`currentInput()` 이 null 이 아니고 `!sameInput(currentInput(), last.input)` — `recordJson`·`evalTs` 가 모두 같아야 같다. 입력 오류로 `currentInput()` 이 null 이면 다르다고 보지 않고 기록 그대로 둔다). 아래 `next/resume/runTo/restart/finish` 의 "기록 없거나 낡았으면" 은 모두 이 `needsFresh` 다(P-D9). `dbg-stale` 배지는 `stale`(흐름 변경)일 때만 보인다.
- n = `last.trace.nodes.length`. `debugOverlay(trace, flow, k)`: k ≥ n 이면 `n > 0 ? overlayAt(trace, flow, n - 1) : overlayAt(trace, flow, 0)`(2단계 최종 겹침). k < n 이면 nodes[0..k-1] 은 `run`(ERROR 면 `error`)·순번·칩, nodes[k] 는 `current`(seq·chip null), nodes[k+1] 은 `next`, 나머지 흐름 노드 `pending`. 선: 실행된 IF 에서 나가는 선은 `chosen`/`dim`, 양 끝이 실행된 선은 `run`, 실행된 노드에서 nodes[k] 로 들어오는 선은 `run`, 나머지 `idle`.
- `variablesAt(k)`: k < n 이면 `frames[k].before`, k ≥ n 이면 `frames[n-1].ctx`(n = 0 이면 `trace.input`). created·changed 는 바로 앞 노드(`frames[k-1]`, k ≥ n 이면 `frames[n-1]`)의 `changed` 이름 가운데: 그 노드의 `before` 에 없었으면 created, 있었으면 changed. k = 0 이면 모두 거짓. 이름 순(`localeCompare`).
- `nextStop(trace, from, inclusive, stops)`: `inclusive ? from : from + 1` 부터 끝까지 `stops.has(nodes[i].nodeId)` 인 첫 i, 없으면 null.
- `runToIndex`: `inclusive ? cursor : cursor + 1` 부터 첫 nodeId 칸 → `{index}`. 없고 0..cursor 안에 있으면 `{notice: PASSED_NOTICE}`, 기록에 없으면 `{notice: NOT_ON_PATH_NOTICE}`.
- 새 실행(`fresh`): 입력 오류면 하지 않는다. `previous = last`(있으면, 낡아도), `last = 새 기록`, 최근 입력에 넣는다(같은 recordJson·evalTs 는 맨 앞으로 옮김, 10개). 요청 순번·세트·flowVersion 으로 늦은 응답을 버린다(2단계 그대로). 실패하면 `error` 에 문구, `last`·`cursor` 는 그대로.
- `next()`: `needsFresh` 면 fresh → cursor 0. 아니면 `min(cursor+1, n)`. `prev()`: `max(0, cursor-1)`, 기록 없으면 무시. `resume()`: `needsFresh` 면 fresh → `nextStop(0, inclusive)` ?? n. 아니면 `nextStop(cursor, 뒤)` ?? n. `runTo(id)`: `needsFresh` 면 fresh → `runToIndex(0, inclusive)`, 아니면 `runToIndex(cursor, 뒤)`; notice 면 cursor 그대로 두고 `notice` 에 문구. `restart()`: `needsFresh` 면 fresh, cursor 0. `finish()`: `needsFresh` 면 fresh, cursor n.
- 훅 안 저장 타입은 `Stored extends SimResult { setId: string | null }` 이다(공개 `SimResult` 에는 `setId` 를 넣지 않는다). `last`·`previous` 는 `Stored` 이고 `result`(옛 멤버)·세트 전환 판정에 `setId` 를 쓴다.
- 중단점: 세트가 바뀌면 `rsf:bp:<setId>` 에서 읽고, 지금 흐름에 없는 노드·걸 수 없는 종류는 버리고 다시 쓴다. flow 가 바뀔 때도 없는 노드를 버린다.

### P10. 브라우저 저장소 `debugger/local-store.ts` (Task 0, 전문은 Task 0 Step 7)

```ts
export const storeKeys: {
  breakpoints(setId: string): string;   // "rsf:bp:<setId>"
  watches(setId: string): string;       // "rsf:watch:<setId>"
  recentInputs(setId: string): string;  // "rsf:recent:<setId>"
  recentExprs(setId: string): string;   // "rsf:expr:<setId>"
  miniMap: string;                      // "rsf:minimap"
};
export function loadStrings(key: string): string[];
export function saveStrings(key: string, list: readonly string[]): void;
export function loadInputs(key: string): { recordJson: string; evalTs: string }[];
export function saveInputs(key: string, list: readonly { recordJson: string; evalTs: string }[]): void;
export function loadFlag(key: string, fallback: boolean): boolean;
export function saveFlag(key: string, value: boolean): void;
export function pushRecent<T>(list: readonly T[], item: T, same: (a: T, b: T) => boolean, max: number): T[];
```

### P11. 식 즉석 평가 `debugger/expr-eval.ts` (Task 6)

```ts
export type ExprResult =
  | { kind: "true" } | { kind: "false" } | { kind: "null" }
  | { kind: "value"; text: string }
  | { kind: "error"; text: string }
  | { kind: "fallback" };
export const FALLBACK_TEXT = "화면에서 계산할 수 없는 식이다";
export const SERVER_JUDGES_TEXT = "참고용이다. 실행 판정은 서버가 한다";
export function declaredTypes(flow: RuleSetFlow, rules: RuleIoMap): Record<string, DataType>;   // flowIo 입력·결과 이름(대문자 키) → dataType(없으면 키 없음)
export function evalExpr(parsed: ExprParse, ctx: Readonly<Record<string, TypedValue>>, types: Readonly<Record<string, DataType>>): ExprResult;
```

- `@/evalex` 에서 `evaluate`·`fromTypedValue`·`convertForType`·`NUMBER_TEXT`·타입만 가져온다. `compile`·`usedVariables`·`prepare`·`validate`·`checkRecordKeys` 는 가져오지 않는다(불변 9 — `debugger/` 폴더 전체를 테스트가 지킨다).

### P12. testid (새로 생기거나 바뀌는 것)

| 영역 | testid |
|---|---|
| 툴바(Task 0) | `flow-mode-debug`(새, 기존 `flow-mode-view`·`flow-mode-edit` 옆), `flow-undo`, `flow-redo`, `flow-minimap-toggle`(aria-pressed) |
| 툴바(Task 8) | `flow-find`(검색 칸), `flow-find-next`, `flow-find-count`("2/5", 결과 없으면 "0/0"), `flow-help`(단축키 도움말 단추), `flow-help-panel` |
| 캔버스(Task 0) | `flow-edge-add-{edgeId}`([+]), `flow-menu`, `flow-menu-item-{id}` |
| 캔버스(Task 7) | `flow-edge-drop-{edgeId}`("여기에 넣기" 표지, 끄는 동안), `flow-edge-cond-input-{edgeId}` |
| 왼쪽 룰 패널(Task 0 틀, Task 7 목록) | `flow-rule-panel`, `flow-rule-panel-toggle`, `flow-rule-panel-search`, `flow-rule-panel-find`, `flow-rule-row-{ruleId}`, 팔레트 `flow-palette`(편집 모드만, 기존 id) |
| 속성 패널(Task 9) | `flow-prop-branch-{edgeId}-handle`(갈래 끌기 손잡이) |
| 캔버스(Task 11) | `flow-bp-{nodeId}`(중단점 점, `data-on`), `flow-collapsed-{splitId}`(접힌 블록, 문구 "IF 조건 · 노드 6개"), `flow-collapsed-ran-{splitId}`("안쪽 실행 k개"), 칩 툴팁은 `title` |
| 디버그 툴바(Task 10) | `dbg-toolbar`, `dbg-continue`, `dbg-step`, `dbg-step-back`, `dbg-run-to`, `dbg-restart`, `dbg-finish`, `dbg-status`, `dbg-stale`, `dbg-notice` |
| 디버그 왼쪽(Task 10) | `dbg-inputs`, `dbg-evalts`, `dbg-fields`, `dbg-input-{name}`, `dbg-send-{name}`, `dbg-json`, `dbg-json-import`, `dbg-error`, `dbg-recent`(최근 입력 고르기), 케이스 `case-panel`, `case-grid`, `case-save-current`, `case-run-all`, `case-summary`("8/10 통과"), `case-load`, `case-edit`, `case-delete`, `case-delete-confirm`, `case-debug`(디버그로 열기), `case-diff`(기대·실제 차이 표), 팝업 `case-modal`, `case-modal-name`, `case-modal-desc`, `case-modal-input`, `case-modal-evalts`, `case-modal-expected`, `case-modal-save`, `case-modal-cancel` |
| 디버그 오른쪽(Task 10) | `var-panel`, `var-watches`, `var-watch-{name}`(없는 변수면 `data-missing="true"`), `var-watch-remove-{name}`, `var-grid`(변수 표, 핀 열 `pin`), `expr-input`, `expr-result`, `expr-recent-{i}`, 노드 상세는 기존 `sim-detail*` |
| 아래 패널(Task 0 틀, Task 10 내용) | `flow-tab-values`(값 표 — 안은 기존 `sim-values`·`sim-warnings`), `flow-tab-compare`, `run-compare`, `run-compare-values`, `run-compare-path`, 기존 `flow-tab-checks` |
| 사라짐(Task 12) | 「삭제 대상」 표의 `sim-*`·`flow-tab-sim`·`flow-sim-slot`·`flow-right-tab-detail`·`flow-right-tab-props` |

---
## 태스크

### Task 0: 이음새 — 모드·캔버스 props·메뉴·단축키·이력 API·화면 API·빈 슬롯·스타일 나누기

**모델:** opus — 모든 뒤 태스크의 인터페이스와 파일 경계를 정한다. 여기서 틀리면 물결 병렬이 깨진다.

**Files:**
- Create: `canvas/shortcuts.ts`, `canvas/context-menu.ts`, `canvas/ContextMenu.tsx`, `canvas/menus/{index,view-menu,edit-menu,debug-menu,collapse-menu}.ts`, `canvas/RulePanel.tsx`, `canvas/collapse.ts`
- Create: `state/useEditActions.ts`, `state/useDragActions.ts`, `state/useFind.ts`, `state/useCollapse.ts`
- Create: `debugger/local-store.ts`, `debugger/debug-model.ts`(서명과 SEAM 본문), `debugger/useTestCases.ts`(서명과 SEAM 본문), `debugger/{DebugToolbar,DebugInputs,VariablePanel,RunCompare,TestCasePanel,ValuesTab}.tsx`(빈 슬롯)
- Create: `styles/{base,drag,menu,props,debug,collapse}.ts`
- Create(테스트 도우미, `.test.ts` 가 아니라 수집되지 않는다 — `tests/dme/helpers/render.ts` 선례): `src/frontend/m-mdm/tests/dme/helpers/rule-set-page.ts`(목 응답 만들기·페이지 렌더·`q`/`byTestId`/`click`/`settle`), `src/frontend/m-mdm/tests/dme/helpers/rule-set-golden.ts`(`golden(name)` — 골든 JSON 읽기)
- Modify: `rsf-styles.ts`(영역 상수를 이어 붙이기만), `canvas/FlowCanvas.tsx`, `canvas/nodes.tsx`(타입만), `canvas/overlay.ts`, `canvas/FlowToolbar.tsx`, `panels/BottomPanel.tsx`, `page.tsx`, `state/useRuleSetEdit.ts`, `debugger/useSimulation.ts`(Simulation 서명만 넓히고 새 멤버는 SEAM), `types.ts`, `api.ts`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/shortcuts.test.ts`, `local-store.test.ts`, `context-menu.test.ts`, `seams.test.ts`(새), 기존 `flow-canvas.test.ts`·`rule-set-edit-page.test.ts` 는 깨진 기대만 고친다
- **테스트 도우미 규칙(뒤 태스크 T3·T5·T7·T8·T10·T11 이 쓴다)**: `.test.ts` 파일을 다른 테스트가 import 하면 그 파일의 describe 가 다시 등록되므로 `seams.test.ts`·`trace-view.test.ts` 의 도우미를 가져다 쓰지 않는다. 목 응답·렌더·조회 도우미는 위 `rule-set-page.ts`, 골든 읽기는 `rule-set-golden.ts`(2단계에 `debugger.test.ts`·`trace-view.test.ts` 두 벌이던 `golden` 을 이 한 벌로 모은다 — 옛 두 벌은 그대로 두어도 되나 새 테스트는 이것을 쓴다)에 둔다. `vi.mock`·`vi.hoisted` 는 호이스팅 때문에 파일마다 둔다(도우미가 목 함수를 인자로 받는다).

**Interfaces:**
- Consumes: 2단계 결과 전부(P7 편집 연산, P8 배치, P9 기록 해석, P10 testid)
- Produces: P1·P2·P3·P4·P8·P10 전부, P5·P9 서명과 `// SEAM(T3)`·`// SEAM(T5)` 임시 본문, `// SEAM(T7)`·`// SEAM(T8)`·`// SEAM(T10)`·`// SEAM(T11)` 슬롯

**page 배치(Task 0 이 짠다 — 분할 골격은 page 의 직접 자식이어야 한다, page.tsx 머리 주석 Part B §4-3):**

```
<style href=RSF_STYLE_HREF …>{RSF_CSS}</style>
<MdmPageLayout>
  set-edit-topbar(그대로)
  <FlowToolbar …/>                       ← 디버그 모드면 그 아래 둘째 줄에 <DebugToolbar sim canRun/> (P-D22)
  <ContentBody root direction="column" resizable storageKey>
    <ContentBody key="main" resizable …>
      <ContentPanel key="left"  width={280} minSize={200}>  mode==="debug" ? <DebugInputs …/> : <RulePanel …/>
      <ContentPanel key="canvas" flex="1 1 0" minSize={320}> rsf-canvas-host(onKeyDown=디스패처) > <FlowCanvas …/> + <ContextMenu …/>
      <ContentPanel key="right" width={360} minSize={280}>  mode==="debug" ? <VariablePanel …/> : (지금의 TraceDetail·PropertyPanel·SetPanel 분기)
    </ContentBody>
    bottom(펼침 ContentPanel / 접힘 bar) → <BottomPanel tabs={…}/>
  </ContentBody>
  <RuleSearchModal purpose=…/>
</MdmPageLayout>
```

- 아래 패널 탭: 보기·편집 = `[{key:"checks"}, {key:"sim"}]`(`sim` 은 Task 12 가 지운다), 디버그 = `[{key:"values"}, {key:"compare"}, {key:"checks"}]`. 모드가 바뀌면 그 모드의 첫 탭으로 간다.
- `BottomPanel` 을 일반 탭 목록으로 바꾼다: `props { tabs: { key: string; label: ReactNode; testId: string; content: ReactNode; scroll: boolean }[]; tab: string; onTab(k): void; collapsed; onToggle }`. 탭 머리 `data-testid={testId}`, 본문 `flow-bottom-body`(`data-tab`). `checks` 탭 라벨은 `검사 결과 {n}`, `sim` 은 지금처럼 `flow-sim-slot` 으로 감싼다.
- 디버그 모드 겹침: `mode==="debug" && sim.last && !sim.stale ? debugOverlay(sim.last.trace, sim.last.flow, sim.cursor) : legacyOverlay`. `legacyOverlay` = 보기·편집 모드에서 `sim.result ? overlayAt(sim.result.trace, sim.result.flow, sim.step) : null`(Task 12 가 지운다). 디버그 모드 커서 이동은 `focusReveal=true` 로 `nodes[cursor]`(k = n 이면 마지막 노드)로.
- 룰 찾기 팝업: `ruleModal: { purpose: "insert"; edgeId: string | null } | { purpose: "replace"; nodeId: string } | null`. insert 는 지금 동작, replace 는 `editActions.applyReplace(nodeId, io)`(Task 8 몫 — SEAM).

- [ ] **Step 1: 단축키 실패 테스트** — `tests/dme/ruleSetEdit/shortcuts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { dispatchShortcut, isMacPlatform, isTypingTarget, shortcutOf, type KeyLike } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";

const k = (key: string, mods: Partial<KeyLike> = {}, target: EventTarget | null = null): KeyLike => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods,
});

describe("shortcuts", () => {
  it("Win/Linux 는 Ctrl, Mac 은 Cmd 로 되돌리기·다시 하기", () => {
    expect(shortcutOf(k("z", { ctrlKey: true }), false)).toBe("undo");
    expect(shortcutOf(k("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(shortcutOf(k("y", { ctrlKey: true }), false)).toBe("redo");
    expect(shortcutOf(k("z", { metaKey: true }), true)).toBe("undo");
    expect(shortcutOf(k("z", { ctrlKey: true }), true)).toBeNull(); // Mac 의 Ctrl+Z 는 되돌리기가 아니다
    expect(shortcutOf(k("z", { metaKey: true }), false)).toBeNull();
  });

  it("복사·붙여넣기·복제·찾기·삭제·Esc", () => {
    expect(shortcutOf(k("c", { ctrlKey: true }), false)).toBe("copy");
    expect(shortcutOf(k("v", { ctrlKey: true }), false)).toBe("paste");
    expect(shortcutOf(k("d", { ctrlKey: true }), false)).toBe("duplicate");
    expect(shortcutOf(k("f", { metaKey: true }), true)).toBe("find");
    expect(shortcutOf(k("Delete"), false)).toBe("delete");
    expect(shortcutOf(k("Backspace"), true)).toBe("delete");
    expect(shortcutOf(k("Escape"), false)).toBe("escape");
    expect(shortcutOf(k("Delete", { ctrlKey: true }), false)).toBeNull();
  });

  it("디버거 기능키", () => {
    expect(shortcutOf(k("F5"), false)).toBe("continue");
    expect(shortcutOf(k("F10"), false)).toBe("step");
    expect(shortcutOf(k("F10", { shiftKey: true }), false)).toBe("stepBack");
    expect(shortcutOf(k("F9"), true)).toBe("breakpoint");
    expect(shortcutOf(k("F5", { ctrlKey: true }), false)).toBeNull(); // Ctrl+F5 강제 새로 고침은 건드리지 않는다
  });

  it("Alt 가 눌렸거나 입력 칸이면 무시한다", () => {
    expect(shortcutOf(k("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    const ta = document.createElement("textarea");
    const input = document.createElement("input");
    const ce = document.createElement("div");
    ce.contentEditable = "true";
    for (const t of [ta, input, ce]) expect(shortcutOf(k("z", { ctrlKey: true }, t), false)).toBeNull();
    expect(isTypingTarget(ta)).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("손잡이가 있을 때만 막고 부른다", () => {
    const undo = vi.fn();
    const ev = { ...k("z", { ctrlKey: true }), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(ev, { undo }, false)).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    const f5 = { ...k("F5"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(f5, { undo }, false)).toBe(false); // continue 손잡이 없음 → 브라우저 새로 고침 그대로
    expect(f5.preventDefault).not.toHaveBeenCalled();
  });

  it("플랫폼 판정", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Windows NT" })).toBe(false);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(true);
  });
});
```
(파일 머리에 `/** @vitest-environment happy-dom */`)

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/shortcuts.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: `canvas/shortcuts.ts` 구현**

```ts
/**
 * 캔버스 단축키 디스패처(3단계 계획 P3) — 캔버스에 초점이 있을 때 page 가 onKeyDown 에서 한 번 부른다. 입력 칸이면 무시하고,
 * 그 모드에 손잡이가 있는 키만 preventDefault·stopPropagation 한다(나머지는 브라우저·포털 동작 그대로, 스펙 §2).
 */
import type { FlowMode } from "../state/useRuleSetEdit";

export type ShortcutId =
  | "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find"
  | "continue" | "step" | "stepBack" | "breakpoint";
export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform ?? "") || /Macintosh|Mac OS X/i.test(nav.userAgent ?? "");
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true";
}

export function shortcutOf(e: KeyLike, mac: boolean): ShortcutId | null {
  if (e.altKey || isTypingTarget(e.target)) return null;
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const anyMod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === "z") return e.shiftKey ? "redo" : "undo";
    if (e.shiftKey) return null;
    if (key === "y") return "redo";
    if (key === "c") return "copy";
    if (key === "v") return "paste";
    if (key === "d") return "duplicate";
    if (key === "f") return "find";
    return null;
  }
  if (anyMod) return null;
  if (key === "Delete" || key === "Backspace") return e.shiftKey ? null : "delete";
  if (key === "Escape") return "escape";
  if (key === "F5") return e.shiftKey ? null : "continue";
  if (key === "F10") return e.shiftKey ? "stepBack" : "step";
  if (key === "F9") return e.shiftKey ? null : "breakpoint";
  return null;
}

export function dispatchShortcut(
  e: KeyLike & { preventDefault(): void; stopPropagation(): void },
  handlers: ShortcutHandlers,
  mac: boolean,
): boolean {
  const id = shortcutOf(e, mac);
  const run = id ? handlers[id] : undefined;
  if (!run) return false;
  e.preventDefault();
  e.stopPropagation();
  run();
  return true;
}

/** 도움말 표(툴바 [?], Task 8 이 그린다). */
export const SHORTCUT_HELP: readonly { id: ShortcutId; win: string; mac: string; label: string; modes: readonly FlowMode[] }[] = [
  { id: "undo", win: "Ctrl+Z", mac: "⌘Z", label: "되돌리기", modes: ["edit"] },
  { id: "redo", win: "Ctrl+Shift+Z · Ctrl+Y", mac: "⌘⇧Z · ⌘Y", label: "다시 하기", modes: ["edit"] },
  { id: "delete", win: "Delete · Backspace", mac: "⌫ · Delete", label: "선택 삭제", modes: ["edit"] },
  { id: "copy", win: "Ctrl+C", mac: "⌘C", label: "복사", modes: ["edit"] },
  { id: "paste", win: "Ctrl+V", mac: "⌘V", label: "고른 선에 붙여넣기", modes: ["edit"] },
  { id: "duplicate", win: "Ctrl+D", mac: "⌘D", label: "복제", modes: ["edit"] },
  { id: "find", win: "Ctrl+F", mac: "⌘F", label: "노드 찾기", modes: ["view", "edit", "debug"] },
  { id: "escape", win: "Esc", mac: "Esc", label: "선택 해제·메뉴 닫기", modes: ["view", "edit", "debug"] },
  { id: "continue", win: "F5", mac: "fn+F5", label: "계속(다음 중단점까지)", modes: ["debug"] },
  { id: "step", win: "F10", mac: "fn+F10", label: "한 단계", modes: ["debug"] },
  { id: "stepBack", win: "Shift+F10", mac: "fn+⇧F10", label: "이전 단계", modes: ["debug"] },
  { id: "breakpoint", win: "F9", mac: "fn+F9", label: "고른 노드 중단점", modes: ["debug"] },
];
```

- [ ] **Step 4: 통과 확인** — Step 2 명령 → PASS.

- [ ] **Step 5: 메뉴 모델 실패 테스트** — `context-menu.test.ts`: `buildMenu([a, b], target, ctx)` 가 a 항목 뒤 b 항목을 잇고 같은 id 는 앞 것만 남기는지, `view-menu` 가 RULE 노드에 `open-rule`, IF 노드에 없음, 빈 곳에 `fit` 을 내는지(보기·편집·디버그 모드 모두), `menus/index.ts` 의 `MENU_PROVIDERS` 길이 4. ctx 는 `toEditFlow(null, ["R_A"])` 흐름과 `vi.fn()` 으로 채운 `CanvasActions`(모든 멤버).

- [ ] **Step 6: 메뉴 구현** — `canvas/context-menu.ts`(P4 타입 + `buildMenu`), `menus/view-menu.ts`:

```ts
export const viewMenu: MenuProvider = (t, ctx) => {
  if (t.kind === "node") {
    const n = ctx.flow.nodes.find((x) => x.id === t.nodeId);
    return n?.kind === "RULE" && n.ruleId ? [{ id: "open-rule", label: "룰 편집 열기", run: () => ctx.act.openRule(n.ruleId!) }] : [];
  }
  if (t.kind === "pane") return [{ id: "fit", label: "화면 맞춤", run: () => ctx.act.fit() }];
  return [];
};
```
`edit-menu.ts`·`debug-menu.ts`·`collapse-menu.ts` 는 `export const editMenu: MenuProvider = () => []; // SEAM(T8): 스펙 B7 편집 항목` 꼴(각 T8·T10·T11). `ContextMenu.tsx` 는 P4 대로 — 위치 고정 `position: fixed` 레이어(포털 없이 page 안), 버튼 목록, `children` 은 제목 아래 들여 쓴 버튼. 루트 `onKeyDown` 은 Esc 면 스스로 `onClose()` 하고 **모든 키에 `stopPropagation()`** 한다 — 메뉴는 `rsf-canvas-host` 안에 있어 메뉴 단추에 초점이 있을 때 Delete 가 디스패처로 올라가 선택을 지우는 것을 막는다(단추는 `isTypingTarget` 이 아니다). `context-menu.test.ts` 에 사례를 더한다: 메뉴 단추에 초점을 두고 Delete 를 누르면 상위(`rsf-canvas-host`)의 `onKeyDown` 이 불리지 않는다. Mantine 컴포넌트를 쓸지는 스킬 문서를 보고 정한다(떠 있는 레이어 하나면 충분하다).

- [ ] **Step 7: 저장소 테스트·구현** — `local-store.test.ts`(happy-dom): 저장·읽기 왕복, 깨진 JSON·모양이 다른 값은 빈 목록/기본값, `localStorage.setItem` 이 던지면(`vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })`) 조용히 넘어감, `getItem` 이 던져도 기본값, `pushRecent` 가 같은 항목을 맨 앞으로 옮기고 max 로 자른다. 구현:

```ts
/**
 * 룰 세트 화면 개인 편의 저장소(3단계 계획 P10) — 중단점·조사식·최근 입력·최근 식·미니맵. 모든 읽기·쓰기를 try/catch 로 감싸
 * 저장소가 없거나(사설 창·미리보기) 던져도 기본값으로 동작한다(스펙 §2). 서버에 저장하지 않는다.
 */
export interface StoredInput { recordJson: string; evalTs: string }

export const storeKeys = {
  breakpoints: (setId: string) => `rsf:bp:${setId}`,
  watches: (setId: string) => `rsf:watch:${setId}`,
  recentInputs: (setId: string) => `rsf:recent:${setId}`,
  recentExprs: (setId: string) => `rsf:expr:${setId}`,
  miniMap: "rsf:minimap",
} as const;

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 꽉 찼거나 막혀 있다 — 개인 편의라 버린다.
  }
}

export function loadStrings(key: string): string[] {
  const v = read(key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
export const saveStrings = (key: string, list: readonly string[]) => write(key, list);

export function loadInputs(key: string): StoredInput[] {
  const v = read(key);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is StoredInput => !!x && typeof x === "object" && typeof (x as StoredInput).recordJson === "string" && typeof (x as StoredInput).evalTs === "string")
    .map((x) => ({ recordJson: x.recordJson, evalTs: x.evalTs }));
}
export const saveInputs = (key: string, list: readonly StoredInput[]) => write(key, list);

export function loadFlag(key: string, fallback: boolean): boolean {
  const v = read(key);
  return typeof v === "boolean" ? v : fallback;
}
export const saveFlag = (key: string, value: boolean) => write(key, value);

export function pushRecent<T>(list: readonly T[], item: T, same: (a: T, b: T) => boolean, max: number): T[] {
  return [item, ...list.filter((x) => !same(x, item))].slice(0, max);
}
```

- [ ] **Step 8: 모드·이력 서명·화면 API** — P1(`FlowMode`, `setMode`), P5 의 `EditOptions`·`canUndo`·`canRedo`·`undo`·`redo` 를 `RuleSetEditState` 에 더한다. 임시 본문: `canUndo=false`, `canRedo=false`, `undo = () => {} // SEAM(T3): EditHistory 연결`, `redo` 도 같다. `edit(fn, opts)` 는 `opts` 를 아직 쓰지 않는다(`// SEAM(T3): opts.mergeKey 로 record`). `load(setId, opts: { keepHistory: boolean })` 로 서명을 바꾸고 `open`·`reload` 는 `keepHistory:false`, `runWrite` 는 `true` 로 부른다(`// SEAM(T3): keepHistory 가 거짓이면 이력을 비운다`). `runWrite` 뒤 모드: 편집 모드인데 새 view 로 `canEdit` 조건(`editable && INUSE`)이 거짓이면 보기로, 아니면 그대로(P1 — 지금은 늘 보기로 바꾼다). P8 타입·API 를 `types.ts`·`api.ts` 에 넣는다(`RuleSetView.cases` 는 서버가 아직 없으면 `undefined` 일 수 있으니 쓰는 곳은 `view.cases ?? []`). `RuleSetEditState` 에 `viewEpoch: number` 를 더한다: `keepHistory` 가 거짓인 `load`(= `open`·`reload`)가 view 를 채울 때만 1 올린다(`runWrite` 뒤 `load` 는 올리지 않는다). Task 10 의 `useTestCases` 가 "세트를 다시 열거나 [다시 불러오기] 했을 때" 케이스 목록을 새로 받는 데 쓴다(F25).

- [ ] **Step 9: 겹침·디버거 서명** — `canvas/overlay.ts` 에 `"next"`. `trace-view.ts` 에 `debugOverlay` 서명과 임시 본문 `return overlayAt(trace, flow, cursor); // SEAM(T5): P9 커서 의미`, `sameTyped` 를 `export` 로. `TraceFrame.before` 는 Task 5 가 더한다(지금 서명에 넣지 않는다 — 타입을 넓히면 Task 5 전 구현이 깨진다). `debugger/debug-model.ts` 는 P9 의 함수 서명을 모두 두고 본문을 `// SEAM(T5)`(`variablesAt` → `[]`, `nextStop` → `null`, `runToIndex` → `{ notice: NOT_ON_PATH_NOTICE }`, `compareRuns` → 빈 결과)·`// SEAM(T10)`(`debugStatus` → `""`, `expectedFromFinal` → `"{}"`)로 둔다. `useSimulation.ts` 는 반환 타입을 P9 `Simulation` 으로 넓히고 옛 멤버는 지금 구현 그대로(`result`·`run`·`step`·`setStep`·`clear`·`clearedByEdit`) — 단 옛 `run()` 이 만드는 `SimResult` 에 새 칸 `flowVersion`(그 요청 시점의 flowVersion)·`input`(보낸 `DebugInput`)을 채운다(Task 5 가 `stale`·`needsFresh` 에 쓴다), 새 멤버는 임시 본문(`last = result`, `stale = false`, `previous = null`, `cursor = -1`, `atEnd = false`, `variables = []`, `valueAt = () => undefined`, 동작 함수는 no-op 또는 `run()` 위임, `breakpoints = 빈 Set`, `recent = []`, `currentInput = () => null`, `loadInput = () => {}`, `notice = null`) + `// SEAM(T5)`.

- [ ] **Step 10: `FlowCanvas`·`nodes.tsx`** — P2 props 로 바꾼다.
  - `onDeleteEdge`·내부 `onKeyDown` 을 지운다. `rsf-canvas` 의 `tabIndex=0` 은 남긴다(page 디스패처가 감싸개에서 받는다).
  - 드롭: `onDrop` 에서 `PALETTE_MIME` 이면 `at` 을 구하고 `edgeId = nearestEdge(flow, pos, at, dropRadius(rf.getZoom()))` 를 계산해 `onDropPalette(item, at, edgeId)`. `RULE_MIME` 이면 `onDropRule(ruleId, edgeId)`. 두 MIME 모두 편집 모드에서만 받는다. `onDragOver` 는 두 MIME 모두 `dropEffect="copy"`.
  - 우클릭: `onNodeContextMenu`(흐름 노드면 `{kind:"node"}`, 메모·그룹이면 `{kind:"pane", at: 그 좌표}`), `onEdgeContextMenu`(`{kind:"edge", via:"context"}`), `onPaneContextMenu`(`{kind:"pane", at: screenToFlowPosition}`). 모두 `preventDefault()` 뒤 `onContextMenu(target, {x: clientX, y: clientY})`.
  - [+]: `FlowEdgeView` 가 `data.insertable` 이면 선 가운데(`lx, ly`, 라벨이 있으면 라벨 오른쪽 +44px)에 `flow-edge-add-{id}` 단추(`aria-label="선에 넣기"`, `IconPlus`)를 그리고 누르면 `stopPropagation` 뒤 단추 화면 좌표로 `onContextMenu({kind:"edge", edgeId:id, via:"plus"}, …)`. 선 데이터에 콜백을 넣지 말고 `EdgeLabelRenderer` 안 단추가 `data-edge-id` 를 달고 캔버스 감싸개의 click 위임으로 부른다(선 데이터 참조가 바뀌어 전체 다시 그리기가 도는 것을 막는다, Local-Rules §16).
  - `Controls`(`showInteractive={false}` — 잠금 단추는 모드 제어와 부딪혀 뺀다, P-D22)·`MiniMap`(`showMiniMap` 일 때, `pannable zoomable`)을 `ReactFlow` 자식으로 오른쪽 아래에 둔다.
  - `focusReveal`: 참이면 노드 상자가 지금 화면(`rf.getViewport()` + 감싸개 `getBoundingClientRect`) 안에 모두 있을 때 `setCenter` 를 부르지 않고 깜빡이기만 한다.
  - 노드 데이터·선 데이터에 P2 의 새 칸을 채운다(`breakpoint: breakpoints.has(id)`, `canBreak`, `collapsed: null // SEAM(T11)`, `dropTarget: false // SEAM(T7)`, `insertable: mode === "edit"`, `condEditable`, `editingCond: editingCondEdgeId === id`, `valueOf: undefined // SEAM(T11)`). `nodes.tsx` 는 `FlowNodeData` 타입에 칸만 더하고 그리지 않는다.

- [ ] **Step 11: 행동 훅과 슬롯**
  - `state/useEditActions.ts`: `useEditActions(deps) → { actions: Omit<CanvasActions, "toggleCollapse" | "toggleBreakpoint" | "runTo">; dropPalette(item, at, edgeId): void; dropRule(ruleId, edgeId): void; deleteSelection(): void; escape(): void; hasClipboard: boolean; applyReplace(nodeId: string, io: RuleIo): void }`. deps = `{ state, flow, selectedId, selectedEdgeId, select, selectEdge, openRuleModal(purpose), fit(), setEditingCond(edgeId|null), closeMenu(): boolean, clearSelection() }`. 지금 page 의 `insertAt`·`pick`·`onPickRule` 논리를 옮긴다. `dropPalette`: rule·if·par 는 `edgeId` 가 null 이면 `state.edit(() => fail("선 위에 놓아야 한다"))` 로 메시지만(넣지 않는다 — A1), 있으면 그 선에. note 는 `at` 에, group 은 지금처럼. `dropRule(ruleId, edgeId)`: null 이면 같은 메시지, 있으면 상한 확인 뒤 `insertRule`. `deleteSelection`: 선택 노드 → `removeNode`, 선 → `removeEdge`, 메모 → `removeNote`, 그룹 → `removeGroup`. `escape`: 메뉴가 열려 있으면 닫고(`closeMenu()` 가 true), 아니면 선택 해제. Task 8 몫(`copy`·`paste`·`duplicate`·`replaceRule`·`changeSplitKind`·`dissolveSplit`·`applyReplace`)은 `state.edit(() => fail("이 기능은 아직 연결되지 않았다")) // SEAM(T8)`, `hasClipboard=false // SEAM(T8)`.
  - `state/useDragActions.ts`: `useDragActions(state) → { moveNodeTo(nodeId: string, edgeId: string, pos: Record<string, FlowPos>): void }` 임시 본문 `state.edit((f) => setPositions(f, pos)) // SEAM(T7): moveNode + setPositions 한 번의 edit`.
  - `state/useFind.ts`: `useFind(flow, rules, onReveal: (nodeId: string) => void) → { query: string; setQuery(q): void; hits: string[]; index: number; next(): void }` 임시 본문(빈 결과) `// SEAM(T8)`.
  - `state/useCollapse.ts`: `useCollapse(flow, setId) → { collapsed: ReadonlySet<string>; toggle(splitId): void; expandFor(nodeId: string): void }` 임시 본문(빈 집합, no-op) `// SEAM(T11)`. `canvas/collapse.ts`: `export function collapseView(flow: EditFlow, collapsed: ReadonlySet<string>): { flow: EditFlow; hidden: ReadonlySet<string>; blocks: Readonly<Record<string, { count: number; members: string[] }>> }` 임시 본문(흐름 그대로, 빈 집합) `// SEAM(T11)`.
  - page 의 룰 패널·캔버스 연결(Task 7 이 page 를 못 고치므로 여기서 잇는다): `<RulePanel onRules={(ios) => ios.forEach(state.addRuleIo)} onInsertRule={(id) => selectedEdgeId ? editActions.dropRule(id, selectedEdgeId) : state.edit(() => fail("넣을 선을 먼저 고른다"))} …/>`(문구는 스펙에 없어 이 계획이 정본). `FlowCanvas onNoteChange={(id, patch) => state.edit((f) => updateNote(f, id, patch), patch.text !== undefined ? { mergeKey: \`note:${id}\` } : undefined)}` — 메모 글은 합치고 위치 끌기는 합치지 않는다(P5, F21).
  - `canvas/RulePanel.tsx`: props `{ mode: FlowMode; loading: boolean; selectedEdgeId: string | null; onPick(item: PaletteItem): void; onRules(ios: RuleIo[]): void; onInsertRule(ruleId: string): void; onError(e: unknown): void }`. 루트 `flow-rule-panel`. 편집 모드면 위에 `FlowPalette`(기존). 아래 룰 목록은 `// SEAM(T7)` 빈 영역.
  - 케이스 상태 훅(page 수준 — 디버그 모드를 나갔다 와도 방금 저장한 케이스·마지막 결과가 남게): `debugger/useTestCases.ts` 를 최종 서명 `useTestCases(setId: string | null, initial: RuleSetCaseView[], flowVersion: number, flowJson: () => string): TestCases` 로 만든다. `export interface TestCases { cases: RuleSetCaseView[]; results: Record<number, CaseRunResult>; running: boolean; error: string | null; save(d: CaseDraft): Promise<boolean>; remove(c: RuleSetCaseView): Promise<void>; runAll(): Promise<void> }`. 임시 본문: `cases = initial`(세트가 바뀌면 다시 받음), `results = {}`, 동작은 no-op·`false` `// SEAM(T10)`. page 는 `useSimulation` 옆에서 `const tests = useTestCases(setId, view?.cases ?? [], state.flowVersion, () => flowJsonOf(flowRef.current!))` 로 부른다(흐름 ref 는 page 가 `flow` 로 채운다).
  - 디버거 슬롯(각 `// SEAM(T10)`, 루트 testid 만. props 는 최종 서명이다): `DebugToolbar`(`dbg-toolbar`, props `{ sim: Simulation; canRun: boolean; selectedId: string | null }` — [여기까지]는 고른 노드 기준), `DebugInputs`(`dbg-inputs`, props `{ sim; tests: TestCases; setId: string | null; canEditCases: boolean; canRun: boolean; onError(e: unknown): void }`), `TestCasePanel`(`case-panel`, props `{ sim; tests: TestCases; canEditCases: boolean; canRun: boolean }` — `DebugInputs` 가 그린다), `VariablePanel`(`var-panel`, props `{ sim; setId; flow; rules; selectedId: string | null; canParse: boolean; onOpenRule(ruleId): void }`), `RunCompare`(`run-compare`, props `{ sim }`), `ValuesTab`(`sim-values` 를 담는 값 표 탭 내용, props `{ sim }` — 2단계 `ValueTable` 과 `sim-warnings` 를 그린다). page 는 디버그 모드 아래 탭 내용으로 `<ValuesTab sim/>`·`<RunCompare sim/>`·검사 패널을 넘긴다. `canEditCases = !!view && view.editable && view.set.status === "INUSE" && canDo("save")`, `canRun = canDo("execute")`, `canParse = canDo("validate")`.
  - 즉석 조건식: page 에 `editingCond: string | null`. `FlowCanvas` 에 `editingCondEdgeId={editingCond}`, `onEditCond={(id, cond) => { state.edit((f) => updateEdge(f, id, { cond }), { mergeKey: \`cond:${id}\` }); setEditingCond(null); }}`, `onEditCondClose={() => setEditingCond(null)}`. 메뉴 `edit-cond` 는 `actions.editCond(id)` = `setEditingCond(id)`.
  - 중단점·접기·값: `FlowCanvas` 에 `breakpoints={sim.breakpoints}`, `collapsed={collapse.collapsed}`, `valueAt={mode === "debug" && !sim.stale ? sim.valueAt : undefined}`(낡은 기록의 옛 값을 칩 툴팁에 내지 않는다, P-D9), `onToggleBreakpoint={sim.toggleBreakpoint}`. 찾기·검사 항목 누르기의 초점 이동은 `collapse.expandFor(id)` 뒤 `setFocus`.
  - 메뉴 상태: page 에 `menu: { target: MenuTarget; at: {x,y} } | null`. `items = menu ? buildMenu(MENU_PROVIDERS, menu.target, ctx) : []`. `CanvasActions` 는 `{ ...editActions.actions, toggleCollapse: collapse.toggle, toggleBreakpoint: sim.toggleBreakpoint, runTo: (id) => void sim.runTo(id) }`.
  - 디스패처 손잡이(모드별, page): edit `{ undo, redo, delete: deleteSelection, escape, copy, paste, duplicate, find }`, view `{ escape, find }`, debug `{ escape, find, continue: resume, step: next, stepBack: prev, breakpoint: 선택 노드 toggleBreakpoint }`. copy·paste·duplicate 는 선택 노드/선택 선 기준으로 `actions.copy(selectedId)` 등(없으면 메시지 `복사할 노드를 먼저 고른다`·`붙여 넣을 선을 먼저 고른다`). find 는 툴바 찾기 칸에 초점(`findInputRef.current?.focus()` — ref 는 FlowToolbar 가 받는다).
  - `FlowToolbar`: 모드 단추 셋(`flow-mode-debug` 더함, 디버그는 늘 켜짐), `flow-undo`·`flow-redo`(편집 모드 && canUndo/canRedo 일 때 켜짐, title 에 단축키), `flow-minimap-toggle`(aria-pressed, `loadFlag(storeKeys.miniMap, true)`·`saveFlag`). props 에 `mode`·`onMode`·`showMiniMap`·`onToggleMiniMap`·`find: ReturnType<typeof useFind>`·`findInputRef` 를 더한다(찾기 칸 그리기는 `// SEAM(T8)`).

- [ ] **Step 12: 스타일 나누기** — `rsf-styles.ts` 의 `RSF_CSS` 본문을 `styles/base.ts` 의 `BASE_CSS` 로 옮기고(내용 그대로), `styles/{drag,debug,collapse}.ts` 는 `export const DRAG_CSS = ""; // SEAM(T7)` 꼴로 만든다(`DEBUG_CSS` 는 `// SEAM(T10)`, `COLLAPSE_CSS` 는 `// SEAM(T11)`). `styles/menu.ts` 는 Task 0 이 `ContextMenu` 에 필요한 최소 규칙을 `MENU_CSS` 에 넣고 SEAM 주석 없이 둔다(Task 8 이 더한다). `styles/props.ts` 는 SEAM 주석 없이 `export const PROPS_CSS = "";` 로 둔다(Task 9 는 SEAM 을 grep 하지 않으므로 SEAM 을 남기면 최종 `SEAM(` 0 건이 깨진다). `rsf-styles.ts` 는 `export const RSF_CSS = [BASE_CSS, DRAG_CSS, MENU_CSS, PROPS_CSS, DEBUG_CSS, COLLAPSE_CSS].join("\n");` 만 남긴다(머리 주석 유지). 2단계의 **탭 전용** 규칙(`.rsim-bar*`·`.rsim-scroll`·`.rsim-input`·`.rsim-main`·`.rsim-field*`·`.rsim-evalts*`·`.rsim-stepper*`·`.rsim-progress`·`.rsim-status`·`.rsf-sim-slot`)만 `BASE_CSS` 에서 떼어 `styles/debug.ts` 의 `LEGACY_SIM_CSS` 로 옮기고 `DEBUG_CSS` 앞에 잇는다(Task 12 가 지운다). 남는 `TraceDetail`·`ValueTable` 이 쓰는 `.rsim-pairs`·`.rsim-list`·`.rsim-badges`·`.rsim-values*` 등은 `BASE_CSS` 에 그대로 둔다(Task 12 가 지워도 스타일이 깨지지 않게).

- [ ] **Step 13: 이음새 테스트** — 먼저 `rule-set-edit-page.test.ts` 의 목 응답·렌더·조회 도우미를 `tests/dme/helpers/rule-set-page.ts` 로, 골든 읽기를 `rule-set-golden.ts` 로 **옮겨 내보낸다**(복사 아님 — 기존 테스트도 이것을 쓰게 바꿔 한 벌만 남긴다). `seams.test.ts`(happy-dom)는 이 도우미를 쓴다:
  1. 세트를 열면 `flow-mode-view`·`flow-mode-edit`·`flow-mode-debug` 가 있고 보기 모드, 왼쪽 `flow-rule-panel` 에 팔레트 없음.
  2. [디버그] → 왼쪽 `dbg-inputs`, 오른쪽 `var-panel`, 툴바 아래 `dbg-toolbar`, 아래 탭 `flow-tab-values`·`flow-tab-compare`·`flow-tab-checks`, `flow-tab-sim` 없음, `flow-var-toggle` 이 `aria-pressed=true`. [보기] 로 돌아오면 `flow-var-toggle` 이 들어가기 전 값.
  3. 편집 모드에서 선 e2 에 `flow-edge-add-e2` 단추가 있고(보기 모드에는 없다), 누르면 `onContextMenu` 가 `{kind:"edge", edgeId:"e2", via:"plus"}` 로 불린다 — 편집 메뉴 제공자가 아직 `[]`(SEAM(T8))라 항목이 0 개이므로 `flow-menu` 는 열리지 않는다(항목 0 이면 열지 않는 규칙). 빈 곳 우클릭(`contextmenu` 이벤트)이면 `flow-menu-item-fit` 이 보이고 누르면 닫힌다.
  4. 캔버스(`flow-canvas`)에서 편집 모드 Ctrl+Z → 이벤트 `defaultPrevented === true`(undo 손잡이가 임시 no-op 이라도 디스패처는 손잡이가 있어 막는다). 세트명 입력 칸(`set-name`)에서 Ctrl+Z 는 `defaultPrevented === false`(짝지어 단언).
  5. 편집 모드에서 선을 고르고 캔버스에 Delete → 선이 지워지고 dirty. 보기 모드 Delete → 그대로.
  6. 팔레트 [IF] 를 캔버스 빈 곳에 떨어뜨리면(`drop` 이벤트, 선에서 먼 좌표) 흐름은 그대로이고 `set-message` 에 `선 위에 놓아야 한다`.
  7. `flow-minimap-toggle` 을 끄면 `.react-flow__minimap` 이 사라지고 `localStorage["rsf:minimap"]` 가 `false`.
  8. 메뉴 단추에 초점이 있을 때 Delete → 선택된 선이 지워지지 않는다(ContextMenu 의 `stopPropagation`). Esc → 메뉴만 닫힌다.
  - 기존 `flow-canvas.test.ts`·`rule-set-edit-page.test.ts` 가운데 `onDeleteEdge`·`onDropPalette`(인자 둘)·아래 패널 탭 머리 구조에 기대던 부분만 새 서명으로 고친다(사례를 지우지 않는다). **P1 — 자기 쓰기 뒤 모드 유지**도 고쳐도 되는 목록에 든다: `rule-set-edit-page.test.ts` 의 "저장 뒤 다시 불러오면 보기 모드"(`data-mode="view"` 단언, 414~415행 근처)는 P1 로 깨지므로 `"edit"` 로 바꾸고 사례 이름을 "저장 뒤에도 편집 모드가 유지된다" 로 고친다.

- [ ] **Step 14: 통과 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit` PASS, lint 0, 스킬 audit 두 개 0건. `grep -rn "SEAM(T3)\|SEAM(T5)\|SEAM(T7)\|SEAM(T8)\|SEAM(T10)\|SEAM(T11)" src/frontend/m-mdm/pages/dme/ruleSetEdit` 결과를 보고서에 붙인다(뒤 태스크의 할 일 목록이 된다).

- [ ] **Step 15: 커밋** — 두 커밋: `feat(m-mdm): 룰 세트 편집 3단계 이음새 — 모드·캔버스 props·메뉴·단축키·화면 API` / `refactor(m-mdm): 룰 세트 편집 스타일을 영역별 상수로 나눈다`.

---

### Task 1: 3단계 결정 기록

**모델:** haiku — 넣을 내용이 아래 표에 다 있다.

**Files:**
- Modify: `docs/mdm/decisions.md`(끝에 덧붙이기만)

**Interfaces:**
- Consumes: 「편차 기록」 P-D1~P-D22, 「삭제 대상」
- Produces: decisions.md 새 D 번호 6개

- [ ] **Step 1: 번호·서식 확인** — `grep -n "^## D-" docs/mdm/decisions.md | tail -3` 로 마지막 번호를 확인한다(계획 작성 때 D-117). 착수 때 dev 가 앞서 번호를 썼을 수 있으니 **마지막 번호 + 1 부터** 쓴다(아래 표의 D-118~D-123 은 그 경우 차례로 민다). `awk '/^## D-117/,0' docs/mdm/decisions.md` 로 서식(`## D-NNN (ISO8601Z)` + `Phase / Decision needed / Decision made / Rationale / Reversible / Source` 불릿)을 본다.

- [ ] **Step 2: 여섯 항목 덧붙이기** — 시각 `2026-09-30T00:00:00Z`, Phase `plan(룰 세트 흐름도 3단계)`.

| 번호 | Decision needed | Decision made(요지) | Reversible | Source |
|---|---|---|---|---|
| D-118 | 3단계 화면 모드와 시뮬레이션 자리(스펙 B4) | [보기][편집][디버그] 세 모드. 시뮬레이션 탭을 디버그 모드로 옮기고 탭·옛 컴포넌트를 지운다(삭제는 사용자 승인). 디버그 왼쪽은 입력 패널이라 룰 목록을 두지 않는다(P-D10). 디버그 모드에서 [변수 흐름]을 켠다(P-D16). 디버그 단추는 세트 툴바 아래 둘째 줄에 둔다(P-D22, 스펙 B4 위임). 보기·편집 오른쪽 "실행 결과" 탭도 함께 지운다(사용자 승인 범위 포함) | partial(지운 코드는 git 으로만) | 스펙 §4.1, 계획 「삭제 대상」 |
| D-119 | 디버거 커서 의미·낡은 기록 표시(스펙 §4.1·§4.2) | 커서 k = 노드 k 실행 전(P-D13). 새 실행 직후 [계속]·[여기까지]는 커서 0 포함(P-D14). 낡은 기록은 캔버스 겹침 없이 패널만 "지난 흐름 기준"(P-D9). 입력이 기록 입력과 다르면 낡은 것과 같이 다음 동작에서 새로 실행(P-D9) | yes | 스펙 툴바 문구, 2단계 Review Focus 3 |
| D-120 | 세트 테스트 케이스 저장·판정(스펙 §4.6) | V15 `TB_MDM_RULE_SET_TEST_CASE`(EVAL_TS VARCHAR(19), P-D6), 세트 안 최대+1 발급·PK 충돌은 MDM001 동시 저장 문구, 세트당·실행당 50(P-D5), 폐기 세트 쓰기 MDM009·조회는 됨(P-D8). 판정은 `RuleCaseJudge.sameValue`(P-D3), finalValues 만·대소문자 무시·오류=실패·기대 없으면 실행만(P-D4). 케이스 쓰기 뒤 cases 만 다시 읽는다(P-D11). 실행 요청에 setId(P-D12). 마지막 결과는 화면 메모리(P-D19) | yes | 스펙 §4.6 |
| D-121 | 세트 테이블을 가리키는 첫 FK(V15) | V14 주석의 "FK 없음" 전제가 깨진다. 세트 테이블 재생성 마이그레이션은 자식 테이블을 먼저 다룬다(P-D7) | no(스키마 제약) | V14 머리 주석 |
| D-122 | 식 즉석 평가의 파싱 자리(스펙 §4.5 "서버를 부르지 않는다") | `validate` 의 `exprText` 로 서버가 파싱만, 평가는 화면(P-D1). 평가 시각·LIST 는 폴백 문구(P-D15). READ 는 식 평가 칸이 꺼진다 | yes | 불변 9(`parse-expr.ts`) |
| D-123 | 편집기 세부(스펙 B9·B10·§5, 권한 테스트) | 즉석 편집은 선 라벨 두 번 누르기 → 조건식(P-D17). 붙여 넣은 노드는 자동 배치 좌표(P-D18, 2026-09-30 개정: 저장 위치가 없는 노드는 그리는 흐름에서 고정 노드와 겹치지 않게 비킨다, 좌표는 저장하지 않는다). 끌기 대상 선은 캔버스 내부 상태(P-D20), [+] 는 FlowCanvas 선 그리기 안(P-D21, `EdgeInsert.tsx` 없음). `Controls` 의 잠금 단추는 모드 제어와 충돌해 뺀다(P-D22, 스펙 D14 편차). READ 403 은 e2e 몫, 백엔드는 MDM013·권한 계약으로 고정(P-D2) | yes | 스펙 §3.2·§5·§6 |

각 항목 Rationale 에는 편차 기록 표의 「이유」 칸을 문장으로 옮긴다.

- [ ] **Step 3: 확인** — `grep -c "^## D-1\(1[89]\|2[0-3]\) " docs/mdm/decisions.md` 가 `6`(번호를 밀었으면 그 번호로 센다).

- [ ] **Step 4: 커밋** — `docs(mdm): 룰 세트 흐름도 3단계 결정 기록(D-118~D-123)` (번호를 밀었으면 메시지도 맞춘다).

---

### Task 2: 편집 연산 7종 (`flow-edit.ts`)

**모델:** opus — 블록 구조 불변식을 지키는 거부 규칙과 선 재배선 판단이 핵심이다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts`, `src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useEditActions.ts`(상한 문구를 `NODE_LIMIT_MESSAGE` 로), `page.tsx`(같은 문구가 Task 0 뒤에도 남아 있을 때만)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-edit-3.test.ts`(새)

**Interfaces:**
- Consumes: 2단계 P7 도우미(`clone`·`reach`·`blockNodes`·`branchNodes`·`mergeOf`·`dropNodes`·`takenIds`·`fresh`·`node`·`edge`)
- Produces: P6 전부

- [ ] **Step 1: 실패 테스트** — 2단계 `flow-edit.test.ts` 의 `ok`·`valid` 도우미를 복사해 쓴다. 흐름 만들기 도우미 `ifFlow()`: `toEditFlow(null, ["R_A", "R_B"])`(start→r1→r2→end, e1·e2·e3) 의 e2 에 IF 를 끼우고 조건 갈래에 cond `"true"`.

```ts
describe("flow-edit 3단계", () => {
  const base = toEditFlow(null, ["R_A", "R_B", "R_C"]); // start → r1 → r2 → r3 → end (e1..e4)

  it("moveNode — 룰을 다른 선으로 옮기고 떠난 자리를 잇는다", () => {
    const f = valid(ok(moveNode(base, "r1", "e4")));
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_B", "R_C", "R_A"]);
    expect(f.edges.find((e) => e.id === "e1")?.to).toBe("r2");
  });

  it("moveNode — 자기 앞뒤 선·시작·끝·합류는 거부한다", () => {
    expect(moveNode(base, "r2", "e2")).toEqual({ ok: false, reason: "자기 자리나 자기 블록 안으로는 옮길 수 없다" });
    expect(moveNode(base, "r2", "e3")).toEqual({ ok: false, reason: "자기 자리나 자기 블록 안으로는 옮길 수 없다" });
    expect(moveNode(base, "start", "e3")).toEqual({ ok: false, reason: "시작 노드는 옮길 수 없다" });
  });

  it("moveNode — 분기 블록 전체를 옮기고 자기 블록 안 선은 거부한다", () => {
    const f = ifFlow();                                  // start → r1 → if1{…} → m1 → r2 → end
    const inner = f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id;
    expect(moveNode(f, "if1", inner).ok).toBe(false);
    const g = valid(ok(moveNode(f, "if1", "e1")));      // start 바로 뒤로
    expect(g.edges.find((e) => e.id === "e1")?.to).toBe("if1");
    expect(parseFlow(g).tree?.ruleIds()).toEqual(["R_A", "R_B"]); // 안쪽 룰 없음, 순서 유지
    expect(moveExcludedEdges(f, "if1").has(inner)).toBe(true);
    expect(blockMembers(f, "if1")).toEqual(["if1", "m1"]);
  });

  it("moveNode — IF 갈래 선에 옮겨 넣으면 갈래 조건이 남는다", () => {
    const f = ok(insertRule(ifFlow(), "e3", "R_Z"));    // 흐름 뒤쪽에 룰 하나 더(이름은 테스트가 실제 ID 로 찾는다)
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const z = f.nodes.find((n) => n.ruleId === "R_Z")!.id;
    const g = valid(ok(moveNode(f, z, cond.id)));
    expect(g.edges.find((e) => e.id === cond.id)).toMatchObject({ to: z, cond: "true", order: 1 });
  });

  it("replaceRule — ruleId 만 바꾼다", () => {
    const f = valid(ok(replaceRule(base, "r2", "R_NEW")));
    expect(f.nodes.find((n) => n.id === "r2")?.ruleId).toBe("R_NEW");
    expect(replaceRule(base, "start", "R")).toEqual({ ok: false, reason: "룰 노드만 룰을 바꾼다" });
    expect(replaceRule(base, "r2", "  ")).toEqual({ ok: false, reason: "룰 ID 가 비었다" });
  });

  it("copy/paste — 블록을 새 ID 로 붙여 넣고 조건식을 복사한다", () => {
    const f = ifFlow();
    const frag = copyFragment(f, "if1");
    if (typeof frag === "string") throw new Error(frag);
    const g = valid(ok(pasteFragment(f, "e1", frag)));
    const ifs = g.nodes.filter((n) => n.kind === "IF").map((n) => n.id);
    expect(ifs).toHaveLength(2);
    const newIf = ifs.find((id) => id !== "if1")!;
    expect(g.nodes.find((n) => n.kind === "MERGE" && n.splitId === newIf)).toBeTruthy();
    expect(g.edges.filter((e) => e.from === newIf && !e.otherwise).map((e) => e.cond)).toEqual(["true"]);
    expect(copyFragment(f, "m1")).toBe("시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다");
  });

  it("duplicateNode — 원본 바로 뒤에 붙는다", () => {
    const f = valid(ok(duplicateNode(base, "r1")));
    // ruleIds() 는 중복을 없애므로(flow-model.ts:280-282) 복제 결과는 ruleSteps() 로 본다
    expect(parseFlow(f).tree?.ruleSteps().map((s) => s.ruleId)).toEqual(["R_A", "R_A", "R_B", "R_C"]);
  });

  it("붙여 넣은 결과가 200 을 넘으면 거부한다", () => {
    const big = toEditFlow(null, Array.from({ length: 198 }, (_, i) => `R${i}`)); // 노드 200
    const frag = copyFragment(big, "r1") as Fragment;
    expect(pasteFragment(big, "e1", frag)).toEqual({ ok: false, reason: NODE_LIMIT_MESSAGE });
  });

  it("changeSplitKind — IF↔병렬 왕복", () => {
    const f = ifFlow();
    const p = valid(ok(changeSplitKind(f, "if1", "PARALLEL")));
    expect(p.nodes.find((n) => n.id === "if1")).toMatchObject({ kind: "PARALLEL", label: "병렬" });
    expect(p.edges.filter((e) => e.from === "if1").map((e) => [e.order, e.cond, e.otherwise, e.label])).toEqual([[1, null, false, "갈래 1"], [2, null, false, "갈래 2"]]);
    const back = ok(changeSplitKind(p, "if1", "IF"));
    expect(back.edges.filter((e) => e.from === "if1").map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [null, true, "그 외"]]);
    expect(parseFlow(back).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]); // 조건식이 비어 검사가 드러낸다
    expect(changeSplitKind(f, "if1", "IF")).toEqual({ ok: false, reason: "이미 IF 분기다" });
  });

  it("dissolveSplit — 고른 갈래만 남기고, 빈 갈래를 고르면 앞뒤를 잇는다", () => {
    const f = ok(insertRule(ifFlow(), ifFlow().edges.find((e) => e.from === "if1" && !e.otherwise)!.id, "R_IN"));
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id;
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!.id;
    const kept = valid(ok(dissolveSplit(f, "if1", cond)));
    expect(parseFlow(kept).tree?.ruleIds()).toEqual(["R_A", "R_IN", "R_B"]);
    expect(kept.nodes.some((n) => n.kind === "IF" || n.kind === "MERGE")).toBe(false);
    const empty = valid(ok(dissolveSplit(f, "if1", other)));
    expect(parseFlow(empty).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
  });

  it("reorderBranches — 그 외는 마지막에 남는다", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    f = ok(addBranch(f, "par1"));
    const ids = f.edges.filter((e) => e.from === "par1").map((e) => e.id);
    const g = valid(ok(reorderBranches(f, "par1", [ids[2], ids[0], ids[1]])));
    expect(ids.map((id) => g.edges.find((e) => e.id === id)?.order)).toEqual([2, 3, 1]);
    expect(reorderBranches(f, "par1", [ids[0]])).toEqual({ ok: false, reason: "갈래 목록이 맞지 않는다" });
  });

  it("모든 연산은 입력을 바꾸지 않는다", () => {
    const f = ifFlow();
    const before = flowJsonOf(f);
    moveNode(f, "if1", "e1"); duplicateNode(f, "r1"); changeSplitKind(f, "if1", "PARALLEL");
    dissolveSplit(f, "if1", f.edges.find((e) => e.from === "if1")!.id); replaceRule(f, "r1", "X");
    expect(flowJsonOf(f)).toBe(before);
  });
});
```

(import: `parseFlow`(flow-model), 2단계 `toEditFlow`·`insertRule`·`insertSplit`·`addBranch`·`updateEdge`·`flowJsonOf`·`EditFlow`·`EditResult`, P6 이름 전부(`Fragment`·`NODE_LIMIT_MESSAGE` 포함). `ifFlow()` 의 실제 노드·선 ID 는 2단계 `insertSplit` 규칙을 따른다 — 어긋나면 기대를 실제 ID 에 맞추고 보고서에 적는다. `moveNode` 의 IF 갈래 사례는 Review Focus 5 다.)

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-edit-3.test.ts` → FAIL.

- [ ] **Step 3: 구현** — P6 규칙대로. `blockMembers` 는 `mergeOf` + `blockNodes` 로 만들고 흐름 노드 배열 순서로 돌려준다. `moveNode`·`dissolveSplit` 은 선을 고친 **뒤** `dropNodes`(또는 선 삭제)를 불러 들어오는 선이 같이 지워지지 않게 한다. `NODE_LIMIT_MESSAGE` 를 내보내고 page·`useEditActions` 의 같은 문구를 이 상수로 바꾼다(Task 0 이 만든 `useEditActions.ts` 의 문자열 한 줄, page 에 같은 문구가 남아 있으면 그것도 — 이 파일들은 Files 에 든다. 물결 1 에서 이 파일을 고치는 다른 태스크가 없어 충돌 없음).

- [ ] **Step 4: 통과 확인** — Step 2 명령 PASS, 2단계 `flow-edit.test.ts` PASS, lint 0.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 흐름 편집 연산(옮기기·룰 바꾸기·복사·붙여넣기·복제·분기 종류·분기 풀기·갈래 순서)`.

---

### Task 3: 편집 이력·되돌리기·떠나기 확인

**모델:** sonnet — P5 로 API 가 정해졌고 훅·패널 연결이다.

**Files:**
- Create: `state/edit-history.ts`
- Modify: `state/useRuleSetEdit.ts`(SEAM(T3) 채우기, `beforeunload`), `panels/PropertyPanel.tsx`(입력 `edit` 호출에 mergeKey)
- Test: `tests/dme/ruleSetEdit/edit-history.test.ts`(새), `tests/dme/ruleSetEdit/undo.test.ts`(새, 화면)

**Interfaces:**
- Consumes: P5, Task 0 의 `load(setId, { keepHistory })`
- Produces: P5 본문, `canUndo`·`canRedo`·`undo`·`redo` 동작

- [ ] **Step 1: 실패 테스트(순수)** — `edit-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { insertRule, toEditFlow, flowJsonOf, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { EditHistory } from "../../../pages/dme/ruleSetEdit/state/edit-history";

const step = (f: EditFlow, id: string): EditFlow => {
  const r = insertRule(f, f.edges[f.edges.length - 1].id, id);
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};

describe("EditHistory", () => {
  it("n 번 고치고 n 번 되돌리면 처음 정규 JSON 이다", () => {
    const h = new EditHistory();
    let f = toEditFlow(null, ["R_A"]);
    const first = flowJsonOf(f);
    for (const id of ["R1", "R2", "R3"]) { h.record(f); f = step(f, id); }
    for (let i = 0; i < 3; i++) f = h.undo(f)!;
    expect(flowJsonOf(f)).toBe(first);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    f = h.redo(f)!;
    expect(f.nodes.some((n) => n.ruleId === "R1")).toBe(true);
  });

  it("같은 칸을 1초 안에 고치면 한 번으로 합친다(가짜 시계)", () => {
    let now = 0;
    const h = new EditHistory(100, 1000, () => now);
    const f0 = toEditFlow(null, ["R_A"]);
    h.record(f0, "cond:e3"); now = 500;
    h.record(step(f0, "X"), "cond:e3"); now = 1400;
    h.record(step(f0, "Y"), "cond:e3");   // 직전 기록 뒤 900ms — 아직 합친다
    now = 2500;
    h.record(step(f0, "Z"), "cond:e3");   // 1100ms — 새 기록
    let cur = step(f0, "W");
    cur = h.undo(cur)!; cur = h.undo(cur)!;
    expect(flowJsonOf(cur)).toBe(flowJsonOf(f0));
    expect(h.canUndo).toBe(false);
  });

  it("상한 100 을 넘으면 가장 오래된 것을 버리고, 새 기록은 다시 하기를 비운다", () => {
    const h = new EditHistory(2);
    const f = toEditFlow(null, ["R_A"]);
    h.record(f); h.record(step(f, "A")); h.record(step(f, "B"));
    let cur = step(f, "C");
    cur = h.undo(cur)!; cur = h.undo(cur)!;
    expect(h.undo(cur)).toBeNull();
    h.record(cur);
    expect(h.canRedo).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/edit-history.test.ts` → FAIL.

- [ ] **Step 3: `EditHistory` 구현** — P5. 내부 `undoStack: {flow, key, at}[]`, `redoStack: EditFlow[]`. `record`: 직전 기록의 key 가 같고(`key !== undefined`) `now - last.at <= mergeMs` 면 `last.at = now` 만. 아니면 push(상한 넘으면 shift), redo 비움. `undo`/`redo` 뒤에는 합치기를 끊는다(`last` 의 key 를 지운다).

- [ ] **Step 4: 훅 연결** — `useRuleSetEdit`: `const history = useRef(new EditHistory())`, 상태 `histTick`(canUndo/canRedo 다시 그리기용). `edit(fn, opts)` 성공 && 정규 JSON 이 바뀌면 `history.record(cur, opts?.mergeKey)`. `undo()`/`redo()`: 편집 모드가 아니면 무시, `replaceFlow(next, { refetchCond: true })`. `load(id, { keepHistory })` 가 거짓이면 `history.clear()`. `beforeunload`: `useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty])`. `PropertyPanel` 의 조건식·선 이름·노드 이름·메모·그룹 제목 입력이 `onEdit(fn, { mergeKey })` 로 부르게 바꾼다(P5 키 규칙).

- [ ] **Step 5: 화면 테스트** — `undo.test.ts`(happy-dom, Task 0 의 `tests/dme/helpers/rule-set-page.ts` 도우미):
  1. 편집 모드에서 [IF] 끼우기 → `flow-undo` 켜짐 → 누르면 IF 가 사라지고 dirty 풀림, `flow-redo` 로 다시 생김.
  2. 캔버스 초점에서 Ctrl+Z(Mac 목은 `navigator.platform` 을 바꿔 Cmd+Z) 가 같은 일을 한다.
  3. 조건식 textarea 에 글자를 연달아 3번(가짜 타이머 300ms 간격) 넣고 [되돌리기] 한 번 → 조건식이 비어 있다(합치기). 그 textarea 안에서 Ctrl+Z 이벤트는 `defaultPrevented` 가 false(Review Focus 4).
  4. 세트 저장(목 응답 성공) 뒤에도 `flow-undo` 가 켜져 있다. 다른 세트를 열면 꺼진다.
  5. 되돌려서 IF 가 없어지면 `flowVersion` 이 올라간다 — 화면 테스트는 `state.flowVersion` 을 읽을 수단이 없으므로 순수 사례로 옮긴다: `useRuleSetEdit` 를 부르는 작은 테스트 컴포넌트(ref 로 state 를 꺼낸다)에서 `edit` → `undo()` 뒤 `flowVersion` 이 늘고, 노드 위치만 고친 `edit` 는 늘지 않는다(디버그 기록이 낡는 것은 Task 5 뒤 `sim.stale` 로 따로 본다).
  6. dirty 일 때 `window.dispatchEvent(new Event("beforeunload", { cancelable: true }))` 의 `defaultPrevented` 가 true, 저장 뒤 false.

- [ ] **Step 6: 통과 확인** — `tests/dme/ruleSetEdit` PASS, lint 0, audit 0, `grep -rn "SEAM(T3)"` 0 건.

- [ ] **Step 7: 커밋** — `feat(m-mdm): 룰 세트 흐름 되돌리기·다시 하기(100개, 1초 입력 합치기)와 떠나기 확인`.

---
### Task 4: 서버 — 세트 테스트 케이스(E6)와 식 파싱(E5)

**모델:** sonnet — P7 에 SQL·규칙·문구가 다 있고, 서버 다파일(마이그레이션·엔티티·서비스·DTO·테스트) 통합이다.

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V15__create_mdm_rule_set_test_case.sql`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/{MdmRuleSetTestCase,MdmRuleSetTestCaseId}.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/{RuleSetTestCaseQueries,RuleSetTestCaseWrites,RuleSetCaseJudge,RuleCaseInputs}.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetTestCaseService.java`
- Modify: `…/common/rule/RuleCaseJudge.java`(`error(Violation)`·`resultKey`·`mismatch` 를 `public static` 으로 — 동작 그대로, `RuleSetCaseJudge` 가 재사용), `…/dme/ruleEdit/service/RuleTestCaseService.java`(`RuleCaseInputs` 로 옮긴 두 메서드를 부른다 — 동작 그대로)
- Modify: `…/dme/ruleSetEdit/dto/{RuleSetSaveRequest,RuleSetSaveResult,RuleSetViewResult,RuleSetSimulateRequest,RuleSetSimulateResult,RuleSetCondIoRequest,RuleSetCondIoResult}.java`, `…/dme/ruleSetEdit/service/RuleSetEditService.java`
- Modify: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn`(머리 주석 action 표 설명만)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java`, `MdmBusinessRuleExpectations.java`, `MdmBusinessRuleEntityJpaRoundtripTest.java`, `dme/DmeTestSupport.java`(clear 순서), `dme/ruleSetEdit/RuleSetCaseServiceTest.java`(새), `dme/ruleSetEdit/RuleSetCaseRunTest.java`(새), `dme/DmeOasisHttpTest.java`, `dme/DmeBpmnActionTest.java`(권한 계약 단언 한 건)

**Interfaces:**
- Consumes: 2단계 `RuleSetRunner.trace(String, Map, Instant)`·`parseKst`·`RuleCaseJudge`·`RuleEditService.parseExpr`, 골든 시드 `RuleSetSimulateTest.seedGolden(jdbc)`·`readGolden()`
- Produces: P7 전부. 화면 P8 과 칸 이름이 같다

- [ ] **Step 1: 마이그레이션 실패 테스트** — `MdmBusinessRuleExpectations`: `TABLES` 에 `TB_MDM_RULE_SET_TEST_CASE`(TB_MDM_RULE_SET 뒤), `BUSINESS_COLUMNS` 에 `MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON, DESCRIPTION, ROW_VERSION`, `JSON_COLUMNS` 에 `INPUT_JSON, EXPECTED_JSON`, `CONSTRAINTS` 에 `PK_TB_MDM_RULE_SET_TEST_CASE, FK_TB_MDM_RULE_SET_TEST_CASE_SET, CK_TB_MDM_RULE_SET_TEST_CASE_INPUT_JSON, CK_TB_MDM_RULE_SET_TEST_CASE_EXPECTED_JSON`. `MdmBusinessRuleMigrationTest`: `_8테이블_…` 이름을 `모든_업무규칙_테이블이_생성되고_칼럼_목록이_순서까지_기대값과_같다` 로 바꾸고 `flyway_가_V15_를_success_로_적용했다` 를 더한다. FK 사례: 없는 세트 ID 로 INSERT 하면 `FOREIGN KEY` 로 거부, 세트가 있으면 통과. 부모 세트 DELETE 가 자식이 있으면 거부(CASCADE 없음). JSON CHECK·NOT NULL 사례는 기존 표 방식(`JSON_COLUMNS` 를 도는 테스트)이 새 테이블을 자동으로 돈다 — 그 테스트가 INSERT 문을 테이블별로 들고 있으면 새 테이블 문장을 더한다.

- [ ] **Step 2: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*MdmBusinessRuleMigrationTest' --console=plain)` → FAIL.

- [ ] **Step 3: V15·엔티티** — P7 SQL 그대로. 엔티티는 `MdmRuleTestCase`·`MdmRuleTestCaseId` 를 본떠 칼럼만 바꾼다(`EVAL_TS` → `String evalTs`). `MdmBusinessRuleEntityJpaRoundtripTest` 에 새 엔티티 저장·읽기 한 건을 더한다. `DmeTestSupport.clear` 맨 앞에 `jdbc.update("DELETE FROM TB_MDM_RULE_SET_TEST_CASE");` 를 더한다(세트 삭제 전). 같은 공유 DB 를 쓰는 다른 테스트 도우미에 `DELETE FROM TB_MDM_RULE_SET` 이 있으면(`grep -rn "DELETE FROM TB_MDM_RULE_SET\b" src/backend/mdm`) 같은 줄을 앞에 더한다.

- [ ] **Step 4: 통과 확인** — Step 2 명령 PASS, `--tests '*EntityJpaRoundtripTest'` PASS.

- [ ] **Step 5: 케이스 저장 실패 테스트** — `RuleSetCaseServiceTest`(`@SpringBootTest` + `@Import(DmeTestSupport.Config.class)`, `RuleSetEditServiceTest` 설정을 따른다, 세트 `S_CASE` INUSE 시드):
  1. 새 케이스 저장(`part=CASE`, 이름 `기본`, `inputJson {"GT_THK":"12"}`, evalTs `2026-06-01 09:00:00`, expected `{"GT_G":"A"}`) → `caseId=1`, `rowVersion=0`. 두 번째 → `caseId=2`. 2번을 지우고 새로 저장 → `caseId=2`(최대+1 이므로 다시 쓴다 — 룰 카운터와 다른 점을 테스트 이름에 적는다).
  2. 고치기: `rowVersion=0` 으로 이름 바꾸기 → `rowVersion=1`. 같은 요청을 다시(`rowVersion=0`) → MDM001.
  3. 삭제: `caseDeleted=true`·`rowVersion` 틀림 → MDM001, 맞음 → 행 없음, 결과 `rowVersion=null`.
  4. 거부 문구: 이름 없음 `케이스 이름은 필수입니다.`, 101자 이름 MDM021, 입력 `[1]` → `입력 JSON 은 JSON 객체({…})여야 합니다.`, 기대 `"x"` → `기대 JSON 은 …`, evalTs `2026/06/01` → `판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: 2026/06/01`, `part=ETC` → `save part 는 SET·CASE 중 하나여야 합니다: ETC`.
  5. 50건이 있으면 51번째 → MDM021 `…세트마다 50건까지 둔다`.
  6. 폐기 세트에 저장 → MDM009 `폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다`, 그 세트 `view` 는 케이스를 싣는다(P-D8).
  7. 담당자 역할이 없으면(테스트 도우미의 역할 바꾸기 — `RuleSetEditServiceTest` 가 쓰는 방식) MDM013, 행 그대로.
  8. **PK 충돌**: `@MockitoSpyBean RuleSetTestCaseQueries queries` 로 `doReturn(0).when(queries).maxCaseId("S_CASE")` 를 두고 케이스 1 이 이미 있을 때 새 저장 → MDM001, 메시지에 `동시에 저장` 포함, 케이스 1 그대로(이 사례는 스파이 때문에 따로 클래스 `RuleSetCasePkConflictTest` 로 둔다).
  9. `part=CASE` 요청에 세트명(`setName`)이 없어도 된다. 세트의 `ROW_VERSION` 은 케이스 저장으로 바뀌지 않는다.

- [ ] **Step 6: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetCase*' --console=plain)` → 컴파일 오류·FAIL.

- [ ] **Step 7: 저장 구현** — P7 의 DTO·`RuleCaseInputs`·`RuleSetTestCaseQueries`·`RuleSetTestCaseWrites`·`RuleSetTestCaseService`·`RuleSetEditService.save` 분기·`view` 의 `cases`. `RuleTestCaseService` 는 옮긴 두 메서드를 부르게만 바꾸고 `RuleTestCaseServiceTest` 가 그대로 PASS 해야 한다. PK 충돌 잡기:

```java
Integer caseId;
try {
    caseId = tx.execute(status -> insert(setId, name, input, evalTs, expected, description));
} catch (DataIntegrityViolationException | PersistenceException e) {
    if (!primaryKeyClash(e)) {
        throw e;
    }
    throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT, CONCURRENT_CASE_MESSAGE, List.of());
}

/** 원인 사슬에 SQLite PK 위반이 있는가 — 다른 제약(CHECK·FK) 위반은 그대로 던진다. */
private static boolean primaryKeyClash(Throwable e) {
    for (Throwable t = e; t != null; t = t.getCause()) {
        String m = t.getMessage();
        if (m != null && (m.contains("SQLITE_CONSTRAINT_PRIMARYKEY") || m.contains("PRIMARY KEY"))) {
            return true;
        }
    }
    return false;
}
```
(`CONCURRENT_CASE_MESSAGE = "같은 세트에 케이스가 동시에 저장됐습니다. 목록을 다시 불러와 저장하세요"`)

- [ ] **Step 8: 통과 확인** — Step 6 명령 PASS, `--tests '*RuleTestCaseServiceTest' --tests '*RuleSetEditServiceTest'` PASS.

- [ ] **Step 9: 일괄 실행 실패 테스트** — `RuleSetCaseRunTest`(`RuleSetSimulateTest.seedGolden(jdbc)` 시드 + 세트 `S_RUN` 시드). 흐름은 골든 `IF_FIRST_TRUE` 의 `flowJson`.
  1. **왕복(Review Focus 1)**: 골든 사례를 `service.simulate` 로 돌려 받은 `trace.finalValues`(TypedValue 맵)를 화면과 같은 규칙으로 기대 JSON 으로 바꾼다(NUMBER → `value` 문자열, STRING → 문자열, BOOLEAN → 불린, NULL → null — 테스트 도우미 `expectedFromFinal`). 그 기대로 케이스를 저장하고 `runCases=true`·`caseIds=""` → 그 케이스 `pass=true`.
  2. 기대 `{"GT_F":"1.0","gt_g":"A"}` → 통과(숫자 값 비교·대소문자 무시, P-D3·P-D4). 기대 `{"GT_THK":"12"}`(입력 이름) → 실패, mismatch `{key:"GT_THK", expected:"12", actual:null}`. 기대 `{"GT_G":"B"}` → 실패 mismatch actual `"A"`. 기대 없음 → `pass=null`.
  3. 실행 오류: 입력 `{}`(MISSING_KEY) → `outcome=ERROR`, `pass=false`, `errors[0].code=MISSING_KEY`(기대가 없어도 false). 입력 JSON 이 저장 뒤 깨진 경우(JDBC 로 `INPUT_JSON='[1]'` — json_valid 는 통과) → `INVALID_INPUT_JSON`.
  4. `caseIds="2"` 면 케이스 2 만, `caseIds="x"` 면 0건(대상 없음 — `-1` 규칙). 저장 흐름이 아니라 요청 `flowJson` 으로 돈다: 요청 흐름에서 IF 조건을 바꿔 결과가 달라지는지 본다.
  5. 케이스 EVAL_TS 가 있으면 그 시각으로 판정한다(적용 시작 전 시각 `2025-01-01 00:00:00` 이면 룰 버전 없음 오류).
  6. `runCases=true` 응답은 `trace=null`, `warnings=[]`, `cases` 길이 = 케이스 수. `setId` 없음 → `룰 세트 ID 는 필수입니다.`.
  7. **실행 상한**: JDBC 로 케이스 51건을 직접 넣고(저장 상한 50 은 서비스 규칙이라 JDBC 는 넘을 수 있다) `runCases` → MDM021 `…한 번에 51건을 돌리려 한다. 50건까지 돌린다`, 어떤 케이스도 실행되지 않는다(`@MockitoSpyBean RuleSetRunner` 로 `trace` 호출 0 회). `caseIds` 로 50건 이하로 거르면 돈다.

- [ ] **Step 10: 실패 확인** — `(cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetCaseRunTest' --console=plain)` → FAIL.

- [ ] **Step 11: 실행·판정 구현** — P7 `simulate` 분기와 `RuleSetCaseJudge`. `RuleCaseJudge.error(Violation)`·`resultKey`·`mismatch` 를 `public static` 으로 열고 `RuleSetCaseJudge` 가 부른다(같은 판정 논리를 두 벌 두지 않는다). 한 번 실행 상한 50 은 `RuleSetTestCaseService.MAX_CASES_PER_SET = 50` 을 같이 쓴다.

- [ ] **Step 12: 식 파싱 실패 테스트** — `RuleSetEditServiceTest` 에: `condIo(req{exprText:"GT_THK > 10"})` → `expr.supported=true`, `expr.refVars=["GT_THK"]`, `condIo` 빈 맵. `exprText:"GT_THK >"` → `INVALID_VALUE` `식을 파싱할 수 없습니다`로 시작. `flowJson` 만 보내면 지금과 같고 `expr=null`.

- [ ] **Step 13: 식 파싱 구현** — P7 `condIo` 분기. `RuleExprParseRequest` 는 기본 생성자 + setter 로 만든다.

- [ ] **Step 14: HTTP·권한 테스트** — `DmeOasisHttpTest` 에 두 사례(요청은 화면이 보낼 모양 그대로 params 에 문자열·스칼라만, `grids` 없음):
  1. `케이스는_save_part_CASE_로_저장하고_view_에_실리며_execute_runCases_로_돈다`: steward 가 골든 시드 뒤 세트 등록(기존 도우미) → `save` `{part:"CASE", setId, caseName, inputJson, evalTs, expectedJson}` → `data.result.caseId=1` → `view` 의 `data.result.cases[0].caseName` → `execute` `{setId, flowJson, runCases:true, caseIds:"1"}` → `data.result.cases[0].pass=true`. `validate` `{exprText:"GT_THK > 10"}` → `data.result.expr.supported=true`.
  2. `표준_관리자는_케이스를_저장·삭제하지_못한다_MDM013`: `STD_ADMIN` 으로 `save part CASE` 새 저장·삭제 → `meta.success=false`, 메시지가 `STEWARD_ROLE_REQUIRED` 기본 문구로 시작, `TB_MDM_RULE_SET_TEST_CASE` 행 수 그대로(P-D2). 테스트 주석에 "READ 역할의 execute·validate·save 403 은 BFF RBAC 몫 — e2e E9" 를 적는다.
  - `DmeBpmnActionTest` 에 `ruleSetEdit_의_save_execute_validate_는_EDIT_권한이고_READ_에_없다`: `MdmPermissions.EDIT_ACTIONS` 가 셋을 담고 `READ_ACTIONS` 가 셋을 담지 않음을 단언한다.

- [ ] **Step 15: BPMN 주석** — `ruleSetEdit.bpmn` 머리 주석 action 표의 save·view·validate·execute 줄 끝에 각각 `(part=CASE 케이스 저장·caseDeleted 삭제)`·`(cases 포함)`·`(exprText 면 식 파싱)`·`(runCases 면 케이스 일괄 실행)` 을 붙인다. 흐름·task 는 그대로. `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest` PASS.

- [ ] **Step 16: 통과 확인** — `(cd src/backend/mdm && ../gradlew :lib:test :api:test --console=plain -q)` → 기준선 + 새 테스트만 늘어남. `(cd src/backend/maru-mdm-engine && ../gradlew test --console=plain -q)` 그대로. `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → ERROR 0.

- [ ] **Step 17: 커밋** — 세 커밋: `feat(mdm): 룰 세트 테스트 케이스 테이블(V15)과 저장·조회(save part=CASE, view cases)` / `feat(mdm): 룰 세트 케이스 일괄 실행(execute runCases)과 판정` / `feat(mdm): 룰 세트 편집 validate 가 식 텍스트를 파싱한다(exprText)`.

---

### Task 5: 디버거 모델 — 커서·중단점·여기까지·이전 실행·낡은 기록

**모델:** opus — 커서 의미(P-D13), 병렬 갈래 범위의 "실행 전" ctx, 낡은 기록 상태, 늦은 응답 처리가 얽힌 상태 모델이다.

**Files:**
- Modify: `trace-view.ts`(`TraceFrame.before`, `debugOverlay` 본문), `debugger/debug-model.ts`(SEAM(T5) 본문), `debugger/useSimulation.ts`(SEAM(T5) 본문)
- Test: `tests/dme/ruleSetEdit/debug-model.test.ts`(새), `tests/dme/ruleSetEdit/use-simulation.test.ts`(새), `trace-view.test.ts`(before 사례 추가)

**Interfaces:**
- Consumes: P9 서명(Task 0), 2단계 골든 `src/backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json`(경로로 읽는다 — Task 0 이 만든 `tests/dme/helpers/rule-set-golden.ts` 의 `golden(name)` 을 쓴다. `trace-view.test.ts` 를 import 하지 않는다), P10 저장소
- Produces: P9 본문. `Simulation` 새 멤버 전부 동작

- [ ] **Step 1: 실패 테스트(순수)** — `debug-model.test.ts`:

```ts
describe("debugOverlay — 커서 k 는 노드 k 실행 전", () => {
  it("IF_FIRST_TRUE: k=2 면 start·r1 실행, if1 지금, r2 다음, 나머지 pending", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");     // nodes: start, r1, if1, r2, m1, end
    const o = debugOverlay(trace, flow, 2);
    expect(o.nodes.r1).toMatchObject({ state: "run", seq: trace.nodes[1].seq });
    expect(o.nodes.if1).toEqual({ state: "current", seq: null, chip: null });
    expect(o.nodes.r2.state).toBe("next");
    expect(o.nodes.r3.state).toBe("pending");            // 안 탄 갈래도 끝 전에는 pending
    expect(o.edges[flow.edges.find((e) => e.from === "r1")!.id]).toBe("run"); // 실행된 r1 → 지금 if1
  });
  it("k = n 이면 2단계 최종 겹침(안 탄 갈래 dim)", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    expect(debugOverlay(trace, flow, trace.nodes.length)).toEqual(overlayAt(trace, flow, trace.nodes.length - 1));
  });
  it("기록이 비면 모두 pending", () => {
    const { flow, trace } = golden("STRUCTURE_ERROR");
    expect(Object.values(debugOverlay(trace, flow, 0).nodes).every((n) => n.state === "pending")).toBe(true);
  });
});

describe("variablesAt — 병렬 갈래 범위를 지킨다(2단계 Review Focus 4)", () => {
  it("둘째 갈래 첫 노드 실행 전에는 첫 갈래 결과가 보이지 않는다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const k = trace.nodes.findIndex((n) => n.nodeId === "r3");
    const names = variablesAt(trace, flow, k).map((v) => v.name);
    expect(names).not.toContain("GT_F");
    expect(names).toContain("GT_G");
  });
  it("앞 노드가 만든 이름은 created, 이름 순", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const vars = variablesAt(trace, flow, 2);            // r1(GT_GRADE) 실행 뒤
    expect(vars.find((v) => v.name === "GT_G")).toMatchObject({ created: true, changed: false });
    expect(vars.map((v) => v.name)).toEqual([...vars.map((v) => v.name)].sort((a, b) => a.localeCompare(b)));
    expect(variablesAt(trace, flow, 0).every((v) => !v.created && !v.changed)).toBe(true);
  });
});

describe("nextStop·runToIndex", () => {
  const { trace } = golden("IF_FIRST_TRUE");
  it("새 실행 직후는 0 포함, 아니면 커서 뒤", () => {
    expect(nextStop(trace, 0, true, new Set(["start"]))).toBe(0);
    expect(nextStop(trace, 0, false, new Set(["start"]))).toBeNull();
    expect(nextStop(trace, 1, false, new Set(["r2", "m1"]))).toBe(3);
  });
  it("여기까지 — 뒤에 없고 앞에 있으면 이미 지남, 기록에 없으면 지나지 않음", () => {
    expect(runToIndex(trace, 0, true, "r2")).toEqual({ index: 3 });
    expect(runToIndex(trace, 4, false, "r1")).toEqual({ notice: PASSED_NOTICE });
    expect(runToIndex(trace, 0, false, "r3")).toEqual({ notice: NOT_ON_PATH_NOTICE });
  });
});

describe("compareRuns", () => {
  it("최종 변수 이전·지금·같음, 한쪽만 지난 노드", () => {
    const a = golden("IF_FIRST_TRUE").trace;
    const b = golden("IF_NULL_ELSE").trace;              // e4 갈래(r3) 를 탄다
    const d = compareRuns(a, b);
    expect(d.onlyBefore).toContain("r2");
    expect(d.onlyAfter).toContain("r3");
    expect(d.values.find((v) => v.name === "GT_G")?.same).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/debug-model.test.ts` → FAIL.

- [ ] **Step 3: 순수 구현** — `trace-view.ts` `frames` 가 노드마다 결과를 덮어쓰기 **전** 그 노드 범위 ctx 사본을 `before` 로 싣는다(MERGE 는 합치기 전, PARALLEL 은 갈래 범위를 만들기 전). `debugOverlay`·`variablesAt`·`nextStop`·`runToIndex`·`compareRuns` 를 P9 의미대로. `compareRuns`: `values` = 이전 `finalValues` 키 순서 뒤에 새 키, `same = sameTyped`; `onlyBefore`/`onlyAfter` = 방문 노드 ID 집합 차(방문 순서). 기존 `overlayAt` 은 바꾸지 않는다(최종 겹침·옛 탭이 쓴다). `trace-view.test.ts` 에 PARALLEL_MERGE `before` 사례 한 건을 더한다.

- [ ] **Step 4: 통과 확인** — Step 2 명령과 `trace-view.test.ts` PASS.

- [ ] **Step 5: 훅 실패 테스트** — `use-simulation.test.ts`(happy-dom, `renderHook` 이 없으면 작은 테스트 컴포넌트로 훅을 불러 ref 로 꺼낸다; `callOasis` 목이 `execute` 에 골든 `IF_FIRST_TRUE`·`IF_NULL_ELSE` 응답을 차례로 준다):
  1. 기록 없음: `cursor=-1`. `next()` → `execute` 한 번, `cursor=0`, `last` 있음. `next()` 두 번 더 → `cursor=2`, 서버 호출은 그대로 한 번.
  2. `prev()` → 1. `finish()` → n(`atEnd=true`), 서버 호출 없음. `restart()` → 0.
  3. 중단점 `r2` 를 켜고 `restart()` 뒤 `resume()` → `cursor = r2 의 칸`. 다시 `resume()` → n. 저장소 `rsf:bp:<setId>` 에 `["r2"]`.
  4. `runTo("r3")`(안 탄 갈래) → `notice = NOT_ON_PATH_NOTICE`, 커서 그대로.
  5. flowVersion 을 올려 다시 그리면 `stale=true`·`result=null`(옛 멤버)·`clearedByEdit=true`·`last` 그대로. `next()` → 서버를 새로 불러 `cursor=0`, `previous` = 옛 기록, `stale=false`.
  6. 입력 A·B 를 차례로 실행한다 — `loadInput(A)` + `next()`, `loadInput(B)` + `next()`(입력이 기록 입력과 다르므로 두 번째도 서버를 새로 부른다, P-D9) → `recent` 가 새 것 먼저 2개. `loadInput(A)` + `next()` 를 다시 하면 기록(B)과 입력이 달라 또 실행되고 `recent` 는 2개 그대로(A 가 맨 앞으로). `localStorage` 가 던지게 해도 실행은 된다.
  7. 세트 ID 가 바뀌면 `last`·`previous`·`cursor` 가 비고 중단점은 새 세트 것을 읽는다. 흐름에 없는 노드의 저장된 중단점은 버려진다.
  8. 응답을 기다리는 동안 flowVersion 이 바뀌면 그 응답은 버려진다(`last` 없음, `running=false`).
  9. `loadInput({recordJson:'{"GT_THK":"12"}', evalTs:"2026-06-01 09:00:00"})` → 폼 `GT_THK` 값 `12`, `evalTs` 채움. `loadInput({recordJson:"[1]", …})` → JSON 칸에 그대로.
  10. **입력이 다르면 새로 실행(P-D9)**: 낡지 않은 기록이 있고 `cursor=2` 일 때 같은 입력이면 `next()` 는 서버를 다시 부르지 않고 `cursor=3`(호출 수 그대로). `setInput` 으로 값을 바꾼 뒤 `next()` 는 서버를 다시 불러(호출 수 +1) `cursor=0`, `previous` = 옛 기록, `stale=false`. `restart()` 도 입력이 다르면 새로 실행하고 같으면 서버 없이 `cursor=0`. 입력 오류(`currentInput()` null)면 기록과 커서를 그대로 둔다.

- [ ] **Step 6: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/use-simulation.test.ts` → FAIL.

- [ ] **Step 7: 훅 구현** — P9 대로. 저장 상태는 `{ last, previous, cursor, legacyStep, setId, flowVersion }` 하나의 `useState` 로 묶어 한 번에 바꾼다. `last`·`previous` 의 저장 타입은 `Stored extends SimResult { setId: string | null }`(공개 `SimResult` 는 그대로 — P9). `needsFresh` = `!last || stale || (input != null && !sameInput(input, last.input))` 를 `next/resume/runTo/restart/finish` 가 공통으로 쓴다(부분 갱신으로 한 렌더에 섞인 값이 보이지 않게). `stale = !!last && last.flowVersion !== flowVersion`, `result = last && !stale && last.setId === setId ? last : null`(옛 멤버 — `run()` 이 만든 `SimResult` 는 Task 0 Step 9 가 `flowVersion`·`input` 을 채워 둔다). 새 실행 공통 함수 `fresh(then: (trace) => number)` 가 요청 순번·세트·flowVersion 을 확인하고 커서를 정한다. 옛 멤버 `run()` 은 `fresh(() => n)` 뒤 `legacyStep = n - 1`. `variables`·`valueAt` 은 `last` 와 `cursor` 로 `useMemo`(Local-Rules §16 — 커서가 바뀔 때만). 중단점·최근 입력은 P10 함수로만 읽고 쓴다.

- [ ] **Step 8: 통과 확인** — `tests/dme/ruleSetEdit` 전체 PASS(2단계 `debugger.test.ts` 옛 사례 포함 — 옛 멤버가 옛 동작 그대로여야 한다), lint 0, `grep -rn "SEAM(T5)"` 0 건.

- [ ] **Step 9: 커밋** — `feat(m-mdm): 룰 세트 디버거 커서·중단점·여기까지·이전 실행·낡은 기록 모델`.

---

### Task 6: 식 즉석 평가 모듈 (`debugger/expr-eval.ts`)

**모델:** sonnet — 평가기 API 에 맞춰 값 변환·폴백을 잇는 판단이 조금 있다.

**Files:**
- Create: `debugger/expr-eval.ts`
- Test: `tests/dme/ruleSetEdit/expr-eval.test.ts`(새, 불변 9 가드 포함)

**Interfaces:**
- Consumes: `@/evalex`(`evaluate`·`fromTypedValue`·`convertForType`·`NUMBER_TEXT`), P8 `ExprParse`, 1단계 `flowIo`
- Produces: P11 전부

- [ ] **Step 1: AST 만들기** — 테스트는 서버 AST 를 손으로 쓰지 않는다. `tests/dme/ruleEdit/expr-field.test.ts`·`tests/evalex-interpreter.test.ts` 가 AST 를 어디서 얻는지(코퍼스 파일·고정 AST) 확인해 같은 출처를 쓴다. 코퍼스에서 `GT_THK > 10`·`GT_G = "A"`·`GT_THK + 1`·`NULL` 에 해당하는 AST 가 없으면, 같은 AST 모양(`{type, value, parameters}` — `engine-contract.generated.ts` 의 `AstNode`)으로 작은 AST 네 개를 테스트 파일에 적고 그 모양이 `AstNode` 타입과 맞는지 `satisfies AstNode` 로 확인한다.

- [ ] **Step 2: 실패 테스트** — `expr-eval.test.ts`:
  1. `GT_THK > 10`, ctx `{GT_THK: {type:"NUMBER", value:"12"}}`, types `{GT_THK:"NUMBER"}` → `{kind:"true"}`. ctx `"8"` → `false`.
  2. 선언 타입 변환: ctx `GT_THK` 가 `{type:"STRING", value:"12"}` 여도 types NUMBER 면 `true`(`convertForType`). 변환 실패(`"abc"`) → `{kind:"error"}` 문구에 `GT_THK`.
  3. `GT_G = "A"` → true, `GT_THK + 1` → `{kind:"value", text:"13"}`, ctx 에 `GT_X: NULL` 이고 식이 `GT_X` → `{kind:"null"}`.
  4. `parsed.supported=false` → `fallback`. 평가기가 폴백 신호를 내는 식(코퍼스의 폴백 사례 AST, 없으면 `MASTER_AT` 함수 노드) → `fallback`. LIST 값 변수를 읽으면 → `fallback`(P-D15).
  5. `parsed.problems` 가 있으면 `{kind:"error", text: problems 의 detail 을 " / " 로 이음}`.
  6. `declaredTypes(flow, rules)`: `flowIo` 입력·결과 이름이 대문자 키로 dataType 을 갖는다.
  7. **불변 9 가드**: `readdirSync` 로 `pages/dme/ruleSetEdit/debugger/` 의 모든 `.ts`·`.tsx` 를 읽어 `@/evalex` import 줄에 `compile`·`usedVariables`·`prepare`·`validate`·`checkRecordKeys` 가 없음을 단언한다(`expr-field.test.ts` 166행 방식).

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/expr-eval.test.ts` → FAIL.

- [ ] **Step 4: 구현**

```ts
/**
 * 식 즉석 평가(3단계 계획 P11, 스펙 §4.5) — 서버가 파싱한 AST(validate exprText, P-D1)를 커서 시점 ctx 로 화면 evalex 로 평가한다.
 * 식 텍스트를 읽지 않는다(불변 9). 결과는 참고용이고 실행 판정은 서버가 한다. 평가 시각을 받지 않는다(P-D15).
 */
import type { AstNode, DataType, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";
import { NUMBER_TEXT, convertForType, evaluate, fromTypedValue, type EvalValue } from "@/evalex";

import { flowIo } from "../set-model";
import type { ExprParse, RuleIoMap } from "../types";

export type ExprResult =
  | { kind: "true" } | { kind: "false" } | { kind: "null" }
  | { kind: "value"; text: string }
  | { kind: "error"; text: string }
  | { kind: "fallback" };
export const FALLBACK_TEXT = "화면에서 계산할 수 없는 식이다";
export const SERVER_JUDGES_TEXT = "참고용이다. 실행 판정은 서버가 한다";

/** `InputRow`·`ResultRow.dataType` 은 `string | null`(types.ts) 이라 `DataType` 목록으로 걸러 넣는다 — 캐스트만 하면 모르는 문자열이 `convertForType` 에서 `TYPE_CONVERSION` 오류로 새어 나온다. */
function isDataType(v: string | null): v is DataType {
  return v === "STRING" || v === "NUMBER" || v === "BOOLEAN" || v === "DATE" || v === "DATETIME";   // 값 목록은 engine-contract.generated.ts 의 DataType 과 같게 맞춘다(화면에 이미 같은 가드가 있으면 그것을 가져다 쓴다)
}

export function declaredTypes(flow: RuleSetFlow, rules: RuleIoMap): Record<string, DataType> {
  const io = flowIo(flow, rules);
  const out: Record<string, DataType> = {};
  for (const r of [...io.inputs, ...io.results]) if (isDataType(r.dataType)) out[r.name.toUpperCase()] = r.dataType;
  return out;
}

export function evalExpr(parsed: ExprParse, ctx: Readonly<Record<string, TypedValue>>, types: Readonly<Record<string, DataType>>): ExprResult {
  if (parsed.problems.length > 0) return { kind: "error", text: parsed.problems.map((p) => p.detail).join(" / ") };
  if (!parsed.supported) return { kind: "fallback" };
  const refs = new Set(parsed.refVars.map((n) => n.toUpperCase()));
  const scope: Record<string, EvalValue> = {};
  for (const [name, tv] of Object.entries(ctx)) {
    const upper = name.toUpperCase();
    if (tv.type === "LIST") {
      if (refs.has(upper)) return { kind: "fallback" };
      continue;
    }
    let v = fromTypedValue(tv);
    const t = types[upper];
    if (t && v !== null) {
      try {
        v = convertForType(v, t);
      } catch {
        return { kind: "error", text: `${name} 값을 ${t} 로 바꾸지 못했다` };
      }
    }
    scope[name] = v;
  }
  const out = evaluate(parsed.ast as AstNode, scope);
  if (out.kind === "fallback") return { kind: "fallback" };
  if (out.kind === "error") return { kind: "error", text: out.message };
  const v = out.value;
  if (v === null) return { kind: "null" };
  if (typeof v === "boolean") return { kind: v ? "true" : "false" };
  if (typeof v === "string") return { kind: "value", text: v };
  return { kind: "value", text: NUMBER_TEXT.get(v) ?? v.toFixed() };
}
```

(`InputRow`·`ResultRow.dataType` 은 `string | null` 이라(`types.ts:94·105`) `isDataType` 가드 없이 넣으면 tsc 가 거부한다. `isDataType` 의 값 목록은 `engine-contract.generated.ts` 의 `DataType` 유니온을 열어 그대로 옮긴다(위 다섯은 예시). 테스트 6 에 dataType 이 모르는 문자열·null 인 행은 키가 없음을 더한다. 대소문자만 다른 ctx 키 두 개가 있으면 평가기가 `RESERVED_KEY` 오류를 낸다 — 그대로 오류로 보인다.)

- [ ] **Step 5: 통과 확인** — Step 3 명령 PASS, lint 0.

- [ ] **Step 6: 커밋** — `feat(m-mdm): 디버거 식 즉석 평가(서버 파싱 AST 를 화면 evalex 로)`.

---
### Task 7: 캔버스 끌어 놓기·놓인 노드 옮기기·룰 목록 패널·조건식 즉석 편집 (A1·A2·A4·B10)

**모델:** sonnet — FlowCanvas 를 크게 고치지만 규칙은 P2·P6 로 정해져 있다.

**Files:**
- Modify: `canvas/FlowCanvas.tsx`, `canvas/RulePanel.tsx`(SEAM(T7)), `state/useDragActions.ts`(SEAM(T7)), `flow-vars.ts`(`nearestEdge` 제외 인자), `styles/drag.ts`
- Test: `tests/dme/ruleSetEdit/flow-drag.test.ts`(새), `flow-vars.test.ts`(제외 인자 사례)

**Interfaces:**
- Consumes: Task 0 P2 props·`dropRadius`·`RULE_MIME`(page 의 `RulePanel onRules`·`onInsertRule` 처리와 문구 `넣을 선을 먼저 고른다` 는 Task 0 Step 11 이 이미 잇는다 — 이 태스크는 page 를 고치지 않는다), Task 2 `moveNode`·`moveExcludedEdges`·`blockMembers`, 2단계 `searchRules`, Task 0 테스트 도우미(`tests/dme/helpers/rule-set-page.ts`)
- Produces: A1·A2·A4·B10 동작. `nearestEdge(f, pos, at, max = 80, exclude?: ReadonlySet<string>)`

- [ ] **Step 1: 실패 테스트** — `flow-vars.test.ts` 에 `exclude` 로 가장 가까운 선을 빼면 다음 선이 나오는 사례. `flow-drag.test.ts`(happy-dom, Task 0 의 `tests/dme/helpers/rule-set-page.ts` 도우미):
  1. 편집 모드에서 팔레트 [룰] 을 끄는 동안(`dragover`, 선 e2 중점 근처 좌표) `flow-edge-drop-e2` 표지가 보이고 선에 `rsf-edge-drop` 클래스, 먼 좌표로 옮기면 사라진다. `dragleave` 로도 사라진다.
  2. 확대 0.5 에서는 화면 80px = 흐름 160 이 반경이다: 흐름 좌표로 중점에서 150 떨어진 점은 대상, 170 은 아니다(`rf.setViewport({zoom:0.5})` 뒤 `screenToFlowPosition` 을 거친 좌표로 확인 — happy-dom 에서 이 계산이 어렵다면 `dropTargetAt(flow, pos, at, zoom, exclude)` 순수 함수를 `flow-vars.ts` 에 두고 그 함수로 확인한다).
  3. 룰 목록: `flow-rule-panel-search` 에 `E2S` 를 넣고 `flow-rule-panel-find` → `searchRules` 목 결과 가운데 `releasedVer != null` 인 룰만 `flow-rule-row-{ruleId}`(룰 ID·이름·종류). 늦게 온 첫 응답은 버린다. 보기 모드에서 줄의 `draggable` 이 false, 편집 모드에서 true.
  4. 줄을 선 e2 위에 떨어뜨리면(`drop` 에 `RULE_MIME`) 그 선에 룰이 끼워지고 `state.rules` 에 그 룰 IO 가 있다. 빈 곳이면 `선 위에 놓아야 한다`. 줄을 두 번 누르면 선택된 선에 끼우고, 선택된 선이 없으면 `넣을 선을 먼저 고른다`.
  5. 놓인 룰 노드 `r1` 을 끌어(React Flow `onNodeDrag`·`onNodeDragStop` 을 테스트에서 직접 부르기 어렵다면 `useDragActions().moveNodeTo` 와 FlowCanvas 의 드래그 끝 처리 함수 `resolveNodeDrop(flow, pos, nodeId, pointer, zoom)` 를 순수로 떼어 확인 — `pos` 는 그려진 노드 위치 맵이다, 위치 없이는 선 중점을 잴 수 없다. Step 3 과 같은 서명) 선 e3 에 놓으면 흐름이 옮겨지고, 되돌리기 **한 번**으로 원래 정규 JSON(Review Focus 5). 자기 앞뒤 선 근처에 놓으면 선 대상이 없고 위치만 바뀐다.
  6. IF 노드를 끌면 짝 합류와 안쪽 노드도 같은 만큼 움직인다(드래그 중 위치 상태 — `blockDragPositions(flow, splitId, delta, basePos)` 순수 함수로 확인).
  7. 즉석 조건식(스펙 B10): 조건 갈래 선의 `label` 이 null 이면 라벨 자리에 대체 라벨 `갈래 {order}` 를 그린다(골든·e2e 흐름은 선 라벨이 거의 null 이라 이것이 없으면 B10 을 할 수 없다). 그 사례를 먼저 확인한다 — null 라벨 IF 갈래에 `flow-edge-label-{e}` 가 `갈래 1`, "그 외" 는 그대로 `그 외`, 병렬 갈래·보기 모드는 대체 라벨 없음(라벨이 있으면 그 라벨). 이어서 IF "그 외" 아닌 갈래 선 라벨(`flow-edge-label-{e}`)을 두 번 누르면 `flow-edge-cond-input-{e}` 가 지금 조건식으로 열린다. Enter → `updateEdge` 로 바뀌고 칸이 닫힌다. Esc·바깥 누르기 → 그대로. "그 외"·병렬 갈래·보기 모드에서는 열리지 않는다. 메뉴 `edit-cond` 가 부른 `editingCondEdgeId` 로도 열린다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-drag.test.ts tests/dme/ruleSetEdit/flow-vars.test.ts` → FAIL.

- [ ] **Step 3: 구현**
  - `flow-vars.ts`: `nearestEdge(…, exclude?)` 와 `dropTargetAt(f, pos, at, zoom, exclude?) = nearestEdge(f, pos, at, dropRadius(zoom), exclude)`. 캔버스에서 떼어 내는 순수 함수 `resolveNodeDrop(flow, pos, nodeId, pointer, zoom): string | null`(= `dropTargetAt(…, moveExcludedEdges(flow, nodeId))`)·`blockDragPositions(flow, splitId, delta, basePos): Record<string, FlowPos>` 도 `flow-vars.ts` 에 둔다(테스트가 쓴다).
  - `FlowCanvas`: 상태 `dropEdge: string | null`. `onDragOver` 에서 PALETTE·RULE MIME 이면 `dropTargetAt` 으로 갱신(같은 값이면 상태를 바꾸지 않는다). `onDragLeave`(캔버스 밖으로 나갈 때)·`onDrop` 뒤 null. `onNodeDrag`: 흐름 노드(RULE·IF·PARALLEL)면 포인터 흐름 좌표로 `resolveNodeDrop`; IF·PARALLEL 이면 `blockDragPositions` 로 블록 멤버를 같은 차이만큼 `drag` 상태에 넣는다. `onNodeDragStop`: `dropEdge` 가 있으면 `onMoveNode(nodeId, dropEdge, 옮긴 멤버 위치)`, 없으면 지금처럼 `onMove`(블록이면 멤버 위치 전부). 선 데이터 `dropTarget = dropEdge === e.id`. `FlowEdgeView` 는 `dropTarget` 이면 선을 굵은 파란 선(`--color-primary`, 4px)으로, 가운데에 `flow-edge-drop-{id}` "여기에 넣기" 표지.
  - 조건식 즉석 편집(P-D17): `FlowEdgeView` 가 `condEditable` 인 선은 `label` 이 없어도(null) 대체 라벨 `갈래 {order}` 를 그려 두 번 누를 자리를 만든다(F10). 캔버스 내부 상태 `condEdge: string | null`. 선 라벨을 두 번 누르면(`condEditable` 인 선만) `condEdge = id`. 열린 칸은 `editingCondEdgeId ?? condEdge`(page 가 메뉴 `edit-cond` 로 연 것도 같은 칸). 칸 `flow-edge-cond-input-{id}` 는 지금 조건식으로 시작하고, Enter → `onEditCond(id, 값)` 뒤 닫기, Esc·칸 밖 누르기 → 닫기만. 닫을 때는 `condEdge = null` 과 `onEditCondClose()` 를 같이 부른다. page 는 `onEditCond` 에서 `state.edit((f) => updateEdge(f, id, { cond }), { mergeKey: \`cond:${id}\` })`(Task 0 이 이미 잇는다).
  - `useDragActions.moveNodeTo`: `state.edit((f) => { const r = moveNode(f, nodeId, edgeId); return r.ok ? { ok: true, flow: setPositions(r.flow, pos) } : r; })` — 한 번의 `edit` 이라 이력에 한 번 남는다.
  - `RulePanel` 목록: 접기 단추 `flow-rule-panel-toggle`, 검색 칸 + 찾기 단추(Enter 같음), 요청 순번으로 늦은 응답 버리기(Local-Rules §11), `releasedVer != null` 만, 줄 `flow-rule-row-{ruleId}`(`draggable={mode==="edit"}`, `onDragStart` 에서 `dataTransfer.setData(RULE_MIME, ruleId)`, `onDoubleClick` → `onInsertRule(ruleId)`), 받은 IO 는 `onRules(ios)` 로 올린다. 편집 모드가 아니면 끌기·두 번 누르기가 꺼진다.
  - `styles/drag.ts`: 끌기 대상 선·표지·룰 목록 스타일(한 변 색 바 금지).

- [ ] **Step 4: 통과 확인** — `tests/dme/ruleSetEdit` PASS, lint 0, audit 0, `grep -rn "SEAM(T7)"` 0 건.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 흐름 캔버스 끌어 넣기 대상 강조·노드와 블록 옮기기·룰 목록 끌기·조건식 즉석 편집`.

---

### Task 8: 우클릭 메뉴·단축키 연결·복사/붙여넣기/복제·룰 바꾸기·분기 편집·찾기·도움말 (B6·B7·B8·B9·C11·C12·D15)

**모델:** sonnet — 메뉴 항목·행동 훅·툴바를 잇는 다파일 작업이다(규칙은 P3·P4·P6).

**Files:**
- Modify: `canvas/menus/edit-menu.ts`(SEAM(T8)), `state/useEditActions.ts`(SEAM(T8)), `state/useFind.ts`(SEAM(T8)), `canvas/FlowToolbar.tsx`(찾기 칸·도움말), `styles/menu.ts`
- Test: `tests/dme/ruleSetEdit/flow-menu.test.ts`(새), `tests/dme/ruleSetEdit/find.test.ts`(새)

**Interfaces:**
- Consumes: P3·P4, Task 2 `copyFragment`·`pasteFragment`·`duplicateNode`·`replaceRule`·`changeSplitKind`·`dissolveSplit`·`NODE_LIMIT_MESSAGE`, Task 0 `useCollapse().expandFor`
- Produces: 편집 메뉴 전부, `CanvasActions` 의 Task 8 몫, `useFind` 본문

- [ ] **Step 1: 실패 테스트** — `find.test.ts`(순수): `findNodes(flow, rules, "grd")` 가 룰 ID·룰 이름·노드 라벨을 대소문자 무시로 흐름 노드 순서로 찾는다, 빈 질의면 `[]`. `flow-menu.test.ts`(happy-dom, Task 0 의 `tests/dme/helpers/rule-set-page.ts` 도우미):
  1. 편집 모드 룰 노드 우클릭 → `rule-replace`·`copy`·`duplicate`·`delete`·`open-rule` 순서(그 뒤 제공자 항목). 보기 모드 → `open-rule` 만. 디버그 모드 → 편집 항목 없음.
  2. IF 노드 우클릭 → `split-kind`(라벨 "병렬로 바꾸기")·`dissolve`(children `dissolve-{e}` 둘, 빈 갈래에 "(빈 갈래)")·`add-branch`·`copy`·`delete`. `split-kind` 누르면 PARALLEL 이 되고 `flow-node-if1` 의 `data-kind` 가 PARALLEL.
  3. `dissolve-{조건 갈래}` → 분기가 사라지고 안쪽 룰이 남는다.
  4. 선 우클릭 → `insert-rule`·`insert-if`·`insert-par`·`edit-cond`(IF 조건 갈래만)·`edge-delete`. 클립보드가 비면 `paste` 없음. `flow-edge-add-e2`([+]) → 앞 넷만(`paste` 는 클립보드 있을 때).
  5. 룰 `r1` 복사(메뉴 `copy`) → 선 우클릭에 `paste` 가 생기고 누르면 새 룰 노드가 그 선에 들어간다. 다른 세트를 열어도 `paste` 가 남는다(클립보드 유지).
  6. 캔버스 초점에서 노드 고르고 Ctrl+C, 선 고르고 Ctrl+V → 붙여넣기. Ctrl+D → 원본 바로 뒤 복제. 선택 없이 Ctrl+V → `set-message` 에 `붙여 넣을 선을 먼저 고른다`. 노드 200 개 흐름에서 붙여넣기 → `NODE_LIMIT_MESSAGE`.
  7. `rule-replace` → 룰 찾기 팝업이 열리고 후보를 고르면 노드 자리·선은 그대로 `ruleId` 만 바뀐다(`addRuleIo` 로 IO 도 들어온다).
  8. 빈 곳 우클릭 → `note-add`(그 자리에 메모)·`auto-layout`·`fit`, 선이 선택돼 있고 클립보드가 있으면 `paste`. 보기 모드 → `fit` 만.
  9. Esc: 메뉴가 열려 있으면 닫기만, 닫혀 있으면 선택 해제.
  10. 찾기: 캔버스 초점 Ctrl+F → `flow-find` 에 초점. `GRD` 입력 → `flow-find-count` 가 `1/2` 꼴, Enter(`flow-find-next`) → 다음 결과로 `focusId` 가 옮겨지고 깜빡임(`rsf-flash`). 결과 없으면 `0/0`. 찾은 노드가 접힌 블록 안이면 `expandFor` 가 불린다(목으로 확인 — 실제 펼침은 Task 11). 찾기 칸 안에서 Ctrl+Z·Delete 는 막히지 않는다(Review Focus 4).
  11. [?] `flow-help` → `flow-help-panel` 에 `SHORTCUT_HELP` 가 모드별로, Mac 목이면 ⌘ 표기와 "F9·F10·F5 는 fn 과 함께" 문구.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/flow-menu.test.ts tests/dme/ruleSetEdit/find.test.ts` → FAIL.

- [ ] **Step 3: 구현**
  - `useEditActions`: 클립보드 `useState<Fragment | null>`(page 가 살아 있는 동안 유지, 세트 바꿈과 무관). `copy(n)` → `copyFragment`(문자열이면 `state.edit(() => fail(msg))` 로 메시지). `paste(e)` → `pasteFragment`. `duplicate(n)` → `duplicateNode`. `replaceRule(n)` → 룰 찾기 팝업 `{purpose:"replace", nodeId}`, `applyReplace(n, io)` → `addRuleIo(io)` 뒤 `replaceRule`. `changeSplitKind`·`dissolveSplit` 는 연산 그대로. 모든 편집은 `state.edit` 한 번(이력 한 번).
  - `edit-menu.ts`: P4 항목·순서·모드 규칙. `paste` 는 `ctx.hasClipboard` 일 때만, 빈 곳 `paste` 는 `ctx.selectedEdgeId` 가 있을 때만(대상 = 그 선).
  - `useFind`: `findNodes` 순수 함수 + 상태(query·index). `next()` → 다음 결과, `onReveal(nodeId)`(page 가 `collapse.expandFor` 뒤 focus). 질의가 바뀌면 index 0.
  - `FlowToolbar`: `flow-find`(Input, `ref=findInputRef`, Enter → next), `flow-find-next`, `flow-find-count`, `flow-help` 팝오버(`flow-help-panel`) — 표는 AG Grid 가 아니라 짧은 정의 목록(표 모양이 아니라 키-설명 목록이다).

- [ ] **Step 4: 통과 확인** — `tests/dme/ruleSetEdit` PASS, lint 0, audit 0, `grep -rn "SEAM(T8)"` 0 건. 포털 전역 단축키 확인: `grep -rn "addEventListener(\"keydown\"\|onKeyDown" src/frontend/m-mcm/app src/frontend/shared/src | head` 로 포털이 문서 단위로 받는 키가 있는지 보고서에 적는다(겹치면 NEEDS_CONTEXT — 디스패처가 `stopPropagation` 하므로 버블 리스너는 막히지만 캡처 리스너는 아니다).

- [ ] **Step 5: 커밋** — `feat(m-mdm): 흐름 캔버스 우클릭 메뉴·복사·붙여넣기·복제·룰 바꾸기·분기 바꾸기·풀기·노드 찾기·단축키 도움말`.

---

### Task 9: 속성 패널 갈래 순서 끌기 (C13)

**모델:** haiku — PropertyPanel 한 곳이고 연산(`reorderBranches`)과 순서 계산 코드가 아래에 있다.

**Files:**
- Modify: `panels/PropertyPanel.tsx`(IF·병렬 갈래 목록), `styles/props.ts`
- Test: `tests/dme/ruleSetEdit/branch-order.test.ts`(새)

**Interfaces:**
- Consumes: Task 2 `reorderBranches`, 2단계 `moveBranch`(▲▼ 는 그대로 둔다 — 키보드 대안)
- Produces: `flow-prop-branch-{edgeId}-handle`

- [ ] **Step 1: 실패 테스트** — `branch-order.test.ts`: 순수 함수 `movedOrder(ids, from, to)`(PropertyPanel 에서 내보낸다):

```ts
import { describe, expect, it } from "vitest";
import { movedOrder } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";

describe("movedOrder", () => {
  it("끌어 놓은 자리로 옮긴다", () => {
    expect(movedOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(movedOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(movedOrder(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});
```
  화면 사례(happy-dom): 병렬 세 갈래를 고른 속성 패널에서 셋째 손잡이를 첫째 줄에 놓으면(`dragstart`·`dragover`·`drop` 이벤트) 캔버스 갈래 order 가 바뀐다. IF 의 "그 외" 줄에는 손잡이가 없고 그 줄에 놓아도 마지막 자리 그대로. 보기 모드에는 손잡이가 없다.

- [ ] **Step 2: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/branch-order.test.ts` → FAIL.

- [ ] **Step 3: 구현**

```ts
/** ids 에서 from 을 빼 to 자리(to 의 원래 위치)에 넣는다. from·to 가 같거나 없으면 그대로. */
export function movedOrder(ids: readonly string[], from: string, to: string): string[] {
  const i = ids.indexOf(from);
  const j = ids.indexOf(to);
  if (i < 0 || j < 0 || i === j) return [...ids];
  const out = ids.filter((x) => x !== from);
  out.splice(j, 0, from);
  return out;
}
```
  갈래 줄마다(그 외 제외, 편집 모드) 손잡이 `flow-prop-branch-{edgeId}-handle`(`draggable`, `IconGripVertical`, `aria-label="갈래 순서 끌기"`). `onDragStart` 에서 `dataTransfer.setData("application/x-rsf-branch", edgeId)`, 줄 `onDragOver` preventDefault, `onDrop` → `onEdit((f) => reorderBranches(f, splitId, movedOrder(현재 순서 ids, from, 놓은 줄 id)))`. "그 외" 줄에 놓으면 마지막 조건 갈래 자리로 본다.

- [ ] **Step 4: 통과 확인** — PASS, lint 0, audit 0.

- [ ] **Step 5: 커밋** — `feat(m-mdm): 속성 패널에서 갈래 순서를 끌어 바꾼다`.

---

### Task 10: 디버그 모드 화면 — 툴바·입력·케이스·변수·식 평가·실행 비교 (E1·E2 메뉴·E3·E5·E6·E7)

**모델:** opus — 입력·케이스·변수·비교 컴포넌트 다섯과 케이스 상태 훅을 잇고, 케이스 쓰기가 세트 상태를 건드리지 않는 경계(Review Focus 2)를 지켜야 한다.

**Files:**
- Modify: `debugger/{DebugToolbar,DebugInputs,VariablePanel,RunCompare,TestCasePanel,ValuesTab}.tsx`(SEAM(T10)), `debugger/useTestCases.ts`(SEAM(T10)), `debugger/debug-model.ts`(`debugStatus`·`expectedFromFinal`), `canvas/menus/debug-menu.ts`, `styles/debug.ts`
- Create: `debugger/CaseEditModal.tsx`, `debugger/useExprEval.ts`, `debugger/InputForm.tsx`(입력 폼), `debugger/SimWarnings.tsx`(경고 목록)
- Test: `tests/dme/ruleSetEdit/debug-mode.test.ts`(새), `tests/dme/ruleSetEdit/test-cases.test.ts`(새)

**Interfaces:**
- Consumes: Task 4 서버(P7 — 테스트는 `callOasis` 목), Task 5 `Simulation`·`variablesAt`·`compareRuns`, Task 6 `evalExpr`·`declaredTypes`, P8 API, P10 저장소, 2단계 `ValueTable`·`TraceDetail`·`case-form.ts`(`inputFormOf`·`parseObject`), 룰 편집 `cards/TestCaseEditModal.tsx`(모양 참고)
- Produces: P12 디버그 testid 전부, `useTestCases`

설계(스펙 §4.1~§4.7 + P-D):
- `DebugToolbar`(툴바 아래 한 줄): [▶ 계속 F5 `dbg-continue`][⤼ 한 단계 F10 `dbg-step`][⤺ 이전 `dbg-step-back`][⇥ 여기까지 `dbg-run-to` — props `selectedId` 노드 기준, 흐름 노드가 아니면 꺼짐][⟲ 처음부터 `dbg-restart`][■ 끝내기 `dbg-finish`] · `dbg-status` · `dbg-stale`(낡았을 때 "지난 흐름 기준") · `dbg-notice`(`sim.notice` 또는 `sim.error`). 실행 단추는 `canRun`(= `canDo("execute")`) 이 거짓이면 꺼지고 title `디버거는 편집 권한이 있어야 쓸 수 있다`. `sim.running` 이면 모두 꺼짐.
- `debugStatus(trace, cursor)`: 기록 없음 `아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다` / n=0 `실행 전 오류 — {첫 위반 message}` / k<n `{k+1}/{n} · {nodeId} 실행 전` / k=n 이고 마지막 노드 ERROR `오류로 멈춤 — {nodeId}: {첫 위반 message}` / k=n `완료 · {n}단계 · 결과 변수 {finalValues 키 수}개`.
- **임시 중복(F13)**: 2단계 `SimulationPanel` 의 입력 폼·경고 목록 JSX 를 새 컴포넌트가 다시 쓰지 않고 `debugger/InputForm.tsx`(입력 칸·보냄·평가 시각)·`debugger/SimWarnings.tsx`(`sim-warnings`)로 떼어 `DebugInputs`·`ValuesTab` 이 쓴다. 옛 `SimulationPanel` 은 Task 12 까지 그대로 두되(이 태스크에서 고치지 않는다) 안쪽 폼·경고를 새 컴포넌트로 바꿔 부르게 해도 된다. 리뷰어에게 "옛 `SimulationPanel` 은 Task 12 에서 사라지는 임시 중복이다" 라고 명시한다.
- `DebugInputs`(왼쪽, 위→아래): 평가 시각 `dbg-evalts`, 입력 폼(`InputForm` — `dbg-fields`, 줄 `dbg-input-{name}`·보냄 `dbg-send-{name}`; 모양은 2단계 SimulationPanel 입력 부분과 같다), [JSON 붙여넣기 ▾] 접이 영역 안 `dbg-json`·`dbg-json-import`, [최근 입력 ▾] `dbg-recent`(Select, 항목 라벨 = evalTs + recordJson 앞 40자, 고르면 `sim.loadInput`), 오류 `dbg-error`, 그 아래 `TestCasePanel`.
- `TestCasePanel`: `AgDataGrid` `case-grid`(열: 이름·마지막 결과 배지(통과/실패/안 돌림)·설명, 한 줄 선택). 단추: `case-save-current`(현재 입력을 케이스로 — `sim.currentInput()` 이 null 이면 꺼짐), `case-run-all`(`canRun` && 케이스 있음), `case-load`(선택 케이스 입력을 폼에 — `sim.loadInput`), `case-debug`(디버그로 열기 = `loadInput` 뒤 `sim.restart()`), `case-edit`, `case-delete`(두 단계: `case-delete` → `case-delete-confirm`/취소, Local-Rules §9). 요약 `case-summary` `8/10 통과`(pass=null 은 분모에서 뺀다 — "실행만" 케이스). 실패 케이스를 고르면 아래 `case-diff`(`AgDataGrid`: 키·기대·실제; 오류면 오류 문장, 코드는 title — Local-Rules §13). 쓰기 단추는 `canEditCases`(= `view.editable && INUSE && canDo("save")`) 일 때만.
- `CaseEditModal`(`case-modal`): 이름·설명·입력 JSON·평가 시각·기대 JSON. 새 케이스는 이름 `케이스 {cases.length + 1}`, 입력 = `sim.currentInput()`, 기대 = 낡지 않은 `sim.last` 가 있고 그 입력이 지금 입력과 같으면 `expectedFromFinal(last.trace.finalValues)`, 아니면 빈 칸. 입력·기대 JSON 은 `parseObject` 로 저장 전에 확인(칸 아래 오류). `case-modal-save` → `useTestCases.save`.
- `expectedFromFinal(finalValues)`: 키 순서 그대로 `{이름: NUMBER→value 문자열, STRING→문자열, BOOLEAN→value==="true", NULL→null, LIST→원소마다 같은 규칙 배열}` 을 `JSON.stringify(…, null, 2)`.
- `useTestCases`(Task 0 서명, page 수준 — 디버그 모드를 나갔다 와도 남는다): `initial` 은 세트를 열 때(`setId` 가 바뀔 때) **와 `open`·`reload` 로 view 를 새로 받았을 때**(`state.viewEpoch` 가 바뀔 때 — Task 0 Step 8) 다시 받는 `view.cases` 다. 세트 저장·폐기·되살리기 뒤의 자기 쓰기 `load` 는 `viewEpoch` 를 올리지 않으므로 다시 받지 않는다(P-D11 과 부딪히지 않는다). page 는 `initial` 을 `viewEpoch`·`setId` 가 바뀔 때만 새 참조가 되게 `useMemo` 로 넘기고(빈 값은 모듈 상수 `NO_CASES`), 훅은 `initial` 참조가 바뀌면 `cases` 를 갈아 끼우고 `results` 를 비운다. 그 밖에는 view 를 다시 읽지 않으므로 목록의 정본은 훅 상태다. 쓰기 뒤 `viewSet(setId)` 로 **`cases` 만** 바꾼다(P-D11 — `state.reload`·`load` 를 부르지 않는다). MDM001 이면 목록을 다시 읽고 `다른 창에서 바뀌었습니다. 다시 불러오세요`. `runAll` → `runCases(setId, flowJson(), [])`(저장 전 흐름). 결과는 메모리, `flowVersion`·`setId` 가 바뀌면 비운다(P-D19). 늦은 응답은 요청 순번으로 버린다.
- `VariablePanel`(오른쪽, 위→아래): 조사식 `var-watches`(핀한 이름, 세트별 `rsf:watch:<setId>`, 값은 `sim.valueAt`, `flowIo` 입력·결과 이름에 없으면 `data-missing="true"`·"없는 변수" 배지, 빼기 `var-watch-remove-{name}`) → 변수 표 `var-grid`(`AgDataGrid`, 열: 핀·이름·값(`typedText`)·상태("새"/"바뀜"); 핀 열은 아이콘만 그리고 `onCellClicked` 의 colId `pin` 으로 켜고 끈다 — 칸 렌더러에 입력 요소 금지 Local-Rules §12; 바뀐 줄 노란 배경·새 줄 "새" 배지는 `rowClassRules`) → 노드 상세(`selectedId` 노드가 커서 앞에서 실행됐으면 2단계 `TraceDetail`, 아니면 `아직 실행하지 않은 노드다`) → 식 평가(`expr-input`, Enter → `useExprEval.run(text)`: `parseExprText` 뒤 `evalExpr(parsed, 커서 ctx, declaredTypes(flow, rules))`, 결과 `expr-result` "참/거짓/값/NULL/오류/화면에서 계산할 수 없는 식이다", 아래 작게 `SERVER_JUDGES_TEXT`, 최근 5개 `expr-recent-{i}`(세트별 `rsf:expr:<setId>`, 누르면 입력 칸에 채움). `canParse`(= `canDo("validate")`) 가 거짓이면 칸이 꺼지고 title `식 평가는 편집 권한이 있어야 쓸 수 있다`(P-D1). 파싱 요청은 요청 순번으로 늦은 응답을 버린다.
- 커서 ctx: `variablesAt` 결과를 `{name: value}` 로. 기록이 없으면 식 평가·변수 표는 `실행하면 커서 시점 값이 보인다`.
- `RunCompare`(아래 탭 "실행 비교" `flow-tab-compare`): `sim.previous` 가 없으면 `이전 실행이 없다. 흐름을 고친 뒤 같은 입력으로 다시 돌리면 차이가 보인다`. 있으면 `compareRuns(previous.trace, last.trace)` 를 `run-compare-values`(`AgDataGrid`: 이름·이전·지금·같음/다름, 다름 줄 강조)와 `run-compare-path`(한쪽만 지난 노드 목록 "이전에만"·"지금만")로.
- 값 표 탭(`flow-tab-values`, `ValuesTab`): 2단계 `ValueTable`(`sim-values`, `step` 에는 `min(cursor, n) - 1` — 지금 노드 실행 전이므로 앞 열을 강조) + 경고 `SimWarnings`(`sim-warnings`).
- `debug-menu.ts`: 디버그 모드, RULE·IF·PARALLEL·MERGE 노드 → `bp-toggle`(켜짐이면 "중단점 끄기"), `run-to`(`canRun` 거짓이면 꺼짐 + title).

- [ ] **Step 1: 실패 테스트(순수)** — `test-cases.test.ts`: `expectedFromFinal({GT_F:{type:"NUMBER",value:"1.10"}, OK:{type:"BOOLEAN",value:"true"}, X:{type:"NULL"}})` → `JSON.parse` 결과 `{GT_F:"1.10", OK:true, X:null}`. `debugStatus` 다섯 갈래(골든 `IF_FIRST_TRUE`·`IF_ERROR_STOPS`·`STRUCTURE_ERROR` 와 기록 없음). `useTestCases`(작은 테스트 컴포넌트): 저장 성공 뒤 `viewSet` 이 한 번 불리고 `cases` 만 바뀐다, MDM001 이면 목록 다시 읽기 + 문구, `runAll` 결과가 `results` 에 들어가고 flowVersion 이 바뀌면 비워진다.

- [ ] **Step 2: 화면 실패 테스트** — `debug-mode.test.ts`(happy-dom, Task 0 의 `tests/dme/helpers/rule-set-page.ts`·`rule-set-golden.ts` 도우미. 세트 `view` 목은 골든 `IF_FIRST_TRUE` 의 `flowJson` 을 흐름으로, 그 시드 룰 IO 를 `rules` 로 준다. `callOasis` 목: `execute` → 첫 번째 골든 `IF_FIRST_TRUE`, 두 번째 `IF_NULL_ELSE`, `execute`+`runCases` → 케이스 결과, `save`+`part=CASE` → `{caseId, rowVersion}`, `view` → 세트(두 번째부터 `cases` 가 늘어난 값), `validate`+`exprText` → `{expr:{ast, refVars:["GT_THK"], supported:true, problems:[]}}`(AST 는 Task 6 테스트와 같은 출처)):
  1. [디버그] → `dbg-status` 가 기록 없음 문구. `dbg-step` → `execute` 한 번, `dbg-status` `1/6 · start 실행 전`, `flow-node-start` `data-state="current"`, `flow-node-r1` `data-state="next"`. `dbg-step` 두 번 → `3/6 · if1 실행 전`, `var-grid` 에 `GT_G` 줄과 "새". F10 키(캔버스 초점)도 같은 일.
  2. `r2` 노드를 고르고 우클릭 → `flow-menu-item-bp-toggle` → `dbg-restart` → `dbg-continue` → `dbg-status` 가 `4/6 · r2 실행 전`. `dbg-finish` → `완료 · 6단계 · 결과 변수 …`, `flow-node-r3` `data-state="dim"`.
  3. `r3` 우클릭 → `run-to` → `dbg-notice` 에 `이 입력으로는 이 노드를 지나지 않는다`.
  4. [편집] 에서 IF 갈래 e3 의 조건식을 고치고(구조 키가 바뀐다) [디버그] → `dbg-stale` 이 보이고 캔버스 노드가 모두 `data-state="idle"`(겹침 없음), `var-grid` 는 옛 값. `dbg-step` → `execute` 가 다시 불리고(두 번째 목 `IF_NULL_ELSE`) `dbg-stale` 사라짐, `flow-tab-compare` 의 `run-compare-path` 에 `r2` 가 "이전에만", `r3` 가 "지금만". 노드 위치만 끌어 옮긴 경우는 `dbg-stale` 이 뜨지 않는다(Review Focus 3).
  5. 케이스: `case-save-current` → `case-modal` 의 기대 칸이 `GT_G` 등 finalValues 로 채워져 있다 → `case-modal-save` → `save` params 에 `part:"CASE"`·`inputJson`·`expectedJson`(문자열), 그 뒤 `view` 가 불리고 `case-grid` 에 한 줄. **흐름을 고쳐 dirty 인 상태에서 저장해도 dirty·디버그 모드·`flow-undo` 켜짐·`dbg-status` 커서가 그대로**(Review Focus 2).
  6. `case-run-all` → `execute` params 에 `runCases:true`·`caseIds:""`·`flowJson`, `case-summary` `1/1 통과`. 실패 결과 목이면 줄을 고를 때 `case-diff` 에 키·기대·실제. `case-debug` → 폼이 그 입력으로 채워지고 `dbg-status` 가 `1/… · start 실행 전`. **기록이 이미 있고 낡지 않은 상태에서** 케이스의 입력이 기록 입력과 다르면 `case-debug`(= `loadInput` + `restart`)가 `execute` 를 다시 불러 호출 수가 +1 이고 변수 표가 케이스 입력 기준이다(P-D9, 옛 입력의 기록을 보이면 실패). 입력이 같으면 호출 수는 그대로.
  7. `case-delete` → `case-delete-confirm` → `save` params `caseDeleted:true`.
  8. 식 평가: `expr-input` 에 `GT_THK > 10`, Enter → `validate` params `{exprText}`, `expr-result` 가 `참`. `supported:false` 응답 → `화면에서 계산할 수 없는 식이다`, 이때 `execute` 는 불리지 않는다. 최근 식 `expr-recent-0`.
  9. 조사식: `var-grid` 의 `GT_G` 핀 칸 누르기 → `var-watch-GT_G`. 흐름에 없는 이름이 저장소에 있으면 `data-missing="true"`.
  10. 최근 입력: 실행한 입력이 `dbg-recent` 에 있고 고르면 폼에 채워진다.
  11. READ(`canDoButton("execute")`·`("validate")`·`("save")` 거짓): [디버그] 로 들어가지고 실행 단추·`case-run-all`·`case-save-current`·`expr-input` 이 꺼져 있다(title 있음).
  12. 아래 탭: 디버그 `flow-tab-values`·`flow-tab-compare`·`flow-tab-checks`, `sim-values` 는 값 표 탭 안에 있다.
  13. 노드 상세(옛 보기·편집 오른쪽 "실행 결과" 탭의 대응, 「삭제 대상」): 기록이 있고 커서가 `if1` 앞인 상태에서 실행된 노드 `r1` 을 고르면 `VariablePanel` 아래 `sim-detail` 이 그 노드 상세를 보이고, 아직 실행하지 않은 노드(`r3`)를 고르면 `아직 실행하지 않은 노드다`.
  14. 케이스 목록 새로 받기(F25): 같은 세트에서 툴바 [다시 불러오기] 로 view 를 새로 받으면(`view` 목의 `cases` 가 한 건 늘어난 값) `case-grid` 가 그 목록으로 바뀌고 `case-summary` 결과는 비워진다. 세트 저장(자기 쓰기 뒤 `load`)은 목록·마지막 결과를 그대로 둔다.

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/debug-mode.test.ts tests/dme/ruleSetEdit/test-cases.test.ts` → FAIL.

- [ ] **Step 4: 구현** — 위 설계대로. 표는 모두 `AgDataGrid`(`@dk-oasis/shared/grid`)로, 스킬 문서의 래퍼 규칙(행 선택·테마·높이)을 따른다. 컴포넌트는 `sim`·`useTestCases` 를 props 로만 받고 서버를 직접 부르지 않는다(식 평가 훅만 예외). page.tsx 는 고치지 않는다 — Task 0 이 넘기는 props 로 모자라면 멈추고 NEEDS_CONTEXT 로 보고한다(컨트롤러가 page 한 줄을 정한다).

- [ ] **Step 5: 통과 확인** — `tests/dme/ruleSetEdit` PASS(2단계 시뮬레이션 탭 사례도 그대로 PASS — 옛 탭은 Task 12 전까지 살아 있다), lint 0, audit 0, 완료 게이트(local-run 이 떠 있으면 build 는 건너뛰고 보고), `grep -rn "SEAM(T10)"` 0 건.

- [ ] **Step 6: 커밋** — 두 커밋: `feat(m-mdm): 룰 세트 디버그 모드 — 단계 실행 툴바·입력·변수·조사식·식 평가·실행 비교` / `feat(m-mdm): 룰 세트 테스트 케이스 목록·저장·모두 실행·차이 표`.

---

### Task 11: 블록 접기·중단점 점·디버그 겹침 모양·변수 칩 툴팁 (D16·E2 표시·E1 표시·E3 툴팁)

**모델:** sonnet — FlowCanvas·nodes 를 크게 고치지만 규칙은 여기와 P2 에 있다.

**Files:**
- Modify: `canvas/collapse.ts`(SEAM(T11)), `state/useCollapse.ts`(SEAM(T11)), `canvas/FlowCanvas.tsx`, `canvas/nodes.tsx`, `canvas/menus/collapse-menu.ts`, `styles/collapse.ts`
- Test: `tests/dme/ruleSetEdit/collapse.test.ts`(새), `tests/dme/ruleSetEdit/flow-debug-view.test.ts`(새)

**Interfaces:**
- Consumes: P2·P4, Task 2 `blockMembers`, Task 5 `debugOverlay`(상태 `next`·`current`·`pending`), Task 10 `debug-menu`(메뉴 순서 확인만)
- Produces: `collapseView` 본문, `useCollapse` 본문, `flow-bp-*`·`flow-collapsed-*`

- [ ] **Step 1: 실패 테스트(순수)** — `collapse.test.ts`:
  1. IF 블록(안쪽 룰 2개)을 접으면 `collapseView` 결과 흐름에 안쪽 룰·합류가 없고, 합류에서 나가던 선(같은 선 ID)이 분기에서 나간다. `blocks.if1.count = 2`(분기·합류를 뺀 안쪽 노드 수), `hidden` 에 안쪽 둘 + 합류.
  2. 중첩: 바깥·안쪽 둘 다 접혀 있으면 바깥이 이긴다(안쪽 분기도 숨음). 안쪽만 접으면 안쪽만.
  3. 접힌 분기가 흐름에서 사라지면(`useCollapse` 가 흐름 변경 때) 집합에서 빠진다. `expandFor("r_in")` 는 그 노드를 품은 모든 접힌 분기를 편다.
  4. 결과 흐름은 캔버스 표시용이다 — 원래 흐름을 바꾸지 않는다(정규 JSON 비교).

- [ ] **Step 2: 화면 실패 테스트** — `flow-debug-view.test.ts`(happy-dom, Task 0 의 `tests/dme/helpers/rule-set-page.ts` 도우미):
  1. 분기 우클릭 → `flow-menu-item-collapse` "접기" → `flow-collapsed-if1` 문구 `IF 조건 · 노드 2개`, 안쪽 `flow-node-*` 없음. 다시 "펼치기". 보기·디버그 모드에서도 된다. 저장 요청(`save`)의 `flowJson` 에 접힘 흔적이 없다.
  2. 디버그 모드에서 안쪽 룰이 실행된 기록이면 `flow-collapsed-ran-if1` "안쪽 실행 1개", 안쪽 노드가 `error` 면 접힌 블록 `data-error="true"`(빨간 테두리).
  3. 디버그 커서가 접힌 블록 안 노드면 캔버스가 접힌 블록으로 옮긴다(펼치지 않는다).
  4. 중단점 점: 디버그 모드 RULE·IF·PARALLEL·MERGE 노드에 `flow-bp-{id}`, 누르면 `data-on="true"` 이고 노드 선택은 바뀌지 않는다. 시작·끝에는 없다. 편집·보기 모드에서는 켜진 중단점만 작은 점으로 보이고 누를 수 없다.
  5. 겹침 모양: `data-state` 가 `current` 면 굵은 테두리 클래스, `next` 점선 클래스, `pending` 회색 클래스(클래스 이름은 `rsf-node-current`·`rsf-node-next`·`rsf-node-pending`).
  6. 변수 칩 툴팁: 디버그 모드 + 변수 흐름 켜짐에서 `flow-edge-chips-e2` 안 칩의 `title` 이 `GT_G = A`, 아직 만들어지지 않은 이름이면 `GT_F · 아직 없음`. 기록이 낡았으면(흐름을 고친 뒤) 칩에 툴팁 값이 없다(page 가 `valueAt` 을 넘기지 않는다, Task 0).

- [ ] **Step 3: 실패 확인** — `pnpm --dir src/frontend --filter @dk-oasis/m-mdm test tests/dme/ruleSetEdit/collapse.test.ts tests/dme/ruleSetEdit/flow-debug-view.test.ts` → FAIL.

- [ ] **Step 4: 구현**
  - `collapseView`: 접힌 분기 가운데 다른 접힌 분기 안에 있지 않은 것만 쓴다. 숨길 노드 = `blockMembers` 에서 분기 자신을 뺀 것. 합류에서 나가는 선은 `from` 을 분기로 바꾼 사본, 양 끝이 숨긴 노드인 선·분기에서 나가는 갈래 선은 뺀다.
  - `FlowCanvas`: 노드·선을 `collapseView(flow, collapsed)` 결과로 그린다(`useMemo`). 접힌 분기 노드는 `NODE_SIZE.RULE` 크기, `data.collapsed = { count, ran, error }`(ran·error 는 `overlay` 의 멤버 상태로 센다). 초점 이동 대상이 숨긴 노드면 그 노드를 품은 접힌 분기로 바꾼다. 끌기 대상 선 계산(Task 7)은 표시 흐름의 선만 본다. 선 데이터 `valueOf = mode === "debug" ? valueAt : undefined`.
  - `nodes.tsx`: 중단점 점(왼쪽 가장자리 가운데, `flow-bp-{id}`, `data-on`, `aria-label="중단점"`, `onClick` 에서 `stopPropagation` 뒤 `onToggleBreakpoint`), 접힌 블록 표시(`flow-collapsed-{id}` 문구 `{IF 조건|병렬} · 노드 {count}개`, 디버그면 `flow-collapsed-ran-{id}` `안쪽 실행 {ran}개`, `data-error`), 상태 클래스. 칩 `title`.
  - `useCollapse`: 세트별 `Set` 상태, 세트가 바뀌면 비움, 흐름이 바뀌면 사라진 분기를 뺀다. `expandFor(nodeId)` 는 `blockMembers` 로 그 노드를 품은 접힌 분기를 모두 뺀다.
  - `collapse-menu.ts`: IF·PARALLEL 노드 → `collapse`(라벨 접기/펼치기), 모든 모드.

- [ ] **Step 5: 통과 확인** — `tests/dme/ruleSetEdit` PASS, lint 0, audit 0, `grep -rn "SEAM(T11)"` 0 건.

- [ ] **Step 6: 커밋** — `feat(m-mdm): 흐름 캔버스 분기 블록 접기·중단점 점·디버그 단계 표시·변수 칩 값 툴팁`.

---

### Task 12: 시뮬레이션 탭·옛 컴포넌트 삭제 — **사용자 승인 필요(삭제)**

**모델:** haiku — 「삭제 대상」 표대로 지우는 기계적 작업이다.

**선행:** Task 10 병합 + **Task 14 병합**(e2e 에서 `flow-tab-sim`·`sim-*` 를 먼저 걷어야 Step 1 의 멈춤 조건이 걸리지 않는다) + **사용자의 삭제 승인**. 승인 전에는 착수하지 않는다(다른 태스크는 이 태스크를 기다리지 않는다). 사용자 승인 범위: 기존 시뮬레이션 화면 삭제 — 보기·편집 오른쪽 "실행 결과" 탭을 포함한다.

**Files:**
- Delete: `debugger/SimulationPanel.tsx`, `debugger/TraceStepper.tsx`
- Modify: `page.tsx`(보기·편집 탭 목록의 `sim` 항목·`SimulationPanel` import·옛 겹침 갈래·오른쪽 "실행 결과 / 속성" 탭 `simResult`·`showDetail`·`rightTab`·`flow-right-tab-*`), `panels/BottomPanel.tsx`(`flow-sim-slot` 감싸기), `debugger/useSimulation.ts`(옛 멤버), `styles/debug.ts`(`LEGACY_SIM_CSS` — 탭 전용 규칙만)
- Modify(테스트): `tests/dme/ruleSetEdit/debugger.test.ts`(`flow-right-tab-*` 를 쓰는 사례 포함), `rule-set-edit-page.test.ts`(옛 사례 삭제·남은 사례의 옛 멤버 이름 정리), `tests/dme/ruleSetEdit/use-simulation.test.ts`(Task 5 가 새로 만든 파일 — `run()`·`result`·`clearedByEdit` 같은 옛 멤버를 쓰는 곳이 있는지 확인하고 새 멤버로 바꾼다. Task 5 사례 1~10 은 새 멤버 `next()`·`loadInput` 만 쓰므로 원칙적으로 컴파일이 깨지지 않아야 한다)

**Interfaces:**
- Consumes: 「삭제 대상」 표
- Produces: 보기·편집 모드 아래 패널은 [검사 결과] 하나, 오른쪽은 탭 머리 없이 속성·세트 패널(스펙 §4.1). `Simulation` 에서 옛 멤버가 사라진다

- [ ] **Step 1: 쓰는 곳 확인** — `grep -rnE "SimulationPanel|TraceStepper|statusText|endOf|clearedByEdit|CLEARED_BY_EDIT_MESSAGE|sim\.run\b|sim\.step\b|setStep|flow-tab-sim|flow-sim-slot|flow-right-tab|showDetail|rightTab|rsim-(bar|scroll|input|main|field|evalts|stepper|progress|status)|rsf-sim-slot" src/frontend/m-mdm src/frontend/e2e`(`rsim-` 로 넓게 찾지 않는다 — 남는 `TraceDetail`·`ValueTable` 이 `rsim-pairs`·`rsim-list`·`rsim-badges`·`rsim-values*` 를 계속 쓴다) 결과를 보고서에 붙인다. `src/frontend/e2e` 에 남아 있으면 멈추고 보고한다(Task 14 가 먼저 바꿨어야 한다).

- [ ] **Step 2: 지우기** — `/usr/bin/git rm src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/SimulationPanel.tsx src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceStepper.tsx`. `page.tsx` 에서 `sim` 탭 항목·옛 겹침 갈래를 지운다(보기·편집 모드 `overlay = null`). `useSimulation` 에서 옛 멤버(`result`·`run`·`step`·`setStep`·`clear`·`clearedByEdit`·`legacyStep` 상태·`CLEARED_BY_EDIT_MESSAGE`)를 지우고 `Simulation` 타입에서도 뺀다. `LEGACY_SIM_CSS`(탭 전용 규칙만 — `TraceDetail`·`ValueTable` 이 쓰는 `rsim-pairs` 류는 `BASE_CSS` 에 남아 있어야 한다)를 지운다. `page.tsx` 오른쪽 패널에서 "실행 결과 / 속성" 탭 머리와 `simResult`·`showDetail`·`rightTab` 을 지운다(보기·편집 오른쪽은 선택에 따라 `PropertyPanel`·`SetPanel` 만). 옛 테스트 사례를 지운다(디버그 모드 대응 사례는 Task 5·10 이 이미 있다 — 지우는 사례 이름과 대응 사례 이름을 보고서에 표로 남긴다).

- [ ] **Step 3: 통과 확인** — Step 1 grep(이름을 좁힌 것)이 0 건(설계 문서 제외), `tests/dme/ruleSetEdit` PASS, lint 0, audit 0, 완료 게이트.

- [ ] **Step 4: 커밋** — `refactor(m-mdm): 룰 세트 편집 아래 패널 시뮬레이션 탭을 지운다(디버그 모드로 옮김)`.

---

### Task 13: 기능설계서 개정

**모델:** sonnet — 설계서 여러 절을 계획·구현 보고와 맞추는 판단 작업이다.

**Files:**
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`
- Modify: `docs/superpowers/specs/2026-09-30-rule-set-flow-editor-debugger-design.md`(맨 끝에 「구현 계획 대응」 절 한 개 — 편차 P-D 번호와 D 번호 연결만, 본문은 고치지 않는다)

**Interfaces:**
- Consumes: Task 0~11 보고서(판정이 바뀐 사례, 새 testid, 포털 단축키 조사 결과), Task 1 D 번호

- [ ] **Step 1: 개정** — 바꿀 절:
  - §1.2 파일 목록(`canvas/shortcuts.ts`·`context-menu.ts`·`ContextMenu.tsx`·`menus/`·`RulePanel.tsx`·`collapse.ts`, `state/edit-history.ts`·`useEditActions.ts`·`useDragActions.ts`·`useFind.ts`·`useCollapse.ts`, `debugger/` 새 파일, `styles/`), action 어휘 줄에 save `part=CASE`·view `cases`·validate `exprText`·execute `runCases`.
  - §2 영역 정의를 세 모드 배치(P1·Task 0 그림)로. 디버그 모드 배치 그림은 스펙 §4.1 그림을 옮긴다.
  - §3 캔버스 표에 [+]·끌기 강조·접힌 블록·중단점 점·디버그 상태(current·next·pending) 행을 더한다.
  - §5 버튼 표를 P12 testid 로(툴바·디버그 툴바·케이스·변수·식 평가). §5.x 새 절 "단축키"(P3 표, 입력 칸 무시·캔버스 초점 규칙·Mac fn) 와 "우클릭 메뉴"(P4 항목 표).
  - §6 검사 절에 케이스 판정 규칙(P-D3·P-D4)과 케이스 상한(P-D5).
  - §7 상태 표에 보기/편집/디버그 행과 "지난 흐름 기준"(P-D9).
  - §8 권한 표: 디버그 모드 진입 모두, 실행·케이스 실행 `execute`(EDIT), 케이스 저장 `save`(EDIT·담당자), 식 평가 `validate`(EDIT) — 표준 관리자는 볼 수만 있다(P-D1·P-D2).
  - §11 N 목록: 새 N-18(디버거 커서 의미 P-D13), N-19(케이스 판정·왕복), N-20(디버그 모드 왼쪽 입력 패널 P-D10), N-21(E4 는 다음 주 — `docs/idea.md`).
- [ ] **Step 2: testid 대조** — 설계서에 적은 testid 마다 `grep -rn "<id>" src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 코드에 있는지 확인해 목록을 보고서에 적는다(`{id}` 자리표시가 있는 것은 앞부분으로 찾는다).
- [ ] **Step 3: 넣지 못한 문서 거리** — `docs/idea.md` 에 E4 항목이 있는지 `/usr/bin/git show dev:docs/idea.md` 로 보고, 없으면 넣을 한 줄을 보고서에 적는다. Task 보고서에 나온 재발 가능한 화면 교훈(예: 캔버스 단축키는 디스패처 한 곳, 케이스 쓰기는 세트 다시 불러오기를 타지 않는다)은 `Local-Rules.md` 에 넣을 문안으로 보고서에 적는다. 두 파일은 고치지 않는다(Global Constraints).
- [ ] **Step 4: 커밋** — `docs(mdm): ruleSetEdit 기능설계서를 편집기·디버거 보강(3단계)으로 개정`.

---

### Task 14: e2e 갱신 (실행하지 않고 `--list` 확인)

**모델:** sonnet — 시나리오를 새 화면에 맞춰 다시 짜고 버튼 전수 확인 허용 목록을 판단해야 한다.

**Files:**
- Modify: `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`
- Modify: `src/frontend/e2e/mdm-user/dme.user.ts`, `src/frontend/e2e/mdm-user/TEST-CASES.md`(ruleSetEdit 행)

**Interfaces:**
- Consumes: P12 testid, Task 0~11 결과. **사라질 id(`flow-tab-sim`·`sim-run`·`sim-first`·`sim-next`·`sim-last`·`sim-status`·`sim-input-*`·`sim-clear`·`flow-right-tab-*` 등)를 쓰지 않는다** — Task 12 가 이 태스크 병합을 기다린다(Task 12 Step 1 이 e2e 에 남은 옛 id 를 보면 멈춘다). 그러므로 e2e 의 옛 시뮬레이션 단계(`mdm-ruleSetEdit.spec.ts` E11, `mdm-user/dme.user.ts`)를 여기서 모두 디버그 모드 기준으로 바꿔야 한다.

- [ ] **Step 1: `mdm-ruleSetEdit.spec.ts`**
  - E9 권한(표준 관리자): [디버그] 는 들어가지고 `dbg-step`·`dbg-continue`·`case-run-all`·`case-save-current`·`expr-input` 이 비활성, [편집] 비활성(지금 단언 유지).
  - E11 디버거를 디버그 모드로 바꿔 쓴다: E2S_FLOW → [디버그] → `dbg-input-SET_THK`·`dbg-input-SET_SURF`·`dbg-input-SET_WID` 입력 → `dbg-step` → `dbg-status` `^1\/\d+ · start 실행 전$` → `dbg-step` 두 번 → `if1 실행 전` → `r1` 은 `data-state="run"`, `if1` 은 `current` → `r2` 에 중단점(`flow-bp-r2`) → `dbg-restart` → `dbg-continue` → `r2 실행 전` → `dbg-finish` → `완료 · …` → `flow-edge-label-e3` `data-state="chosen"`, `e4` `dim` → `flow-tab-values` 의 `sim-values` 에 `S_GRD`·`S_SPD`·`120`.
  - 새 E13 편집기: 편집 모드 → 룰 목록에서 `E2S_SPD` 를 찾아 줄을 END 앞 선에 끌어 놓기(`dragTo` 는 HTML5 드래그를 흉내내지 못할 수 있으므로 `page.dispatchEvent` 로 `dragstart`/`dragover`/`drop` 을 보내는 도우미를 둔다) → 노드 수 +1 → `flow-undo` → 원래 수 → `flow-redo`. 선 [+] → `flow-menu-item-insert-if` → IF 생김 → IF 우클릭 → `split-kind` → 병렬. Ctrl+Z(캔버스 클릭 뒤) 로 되돌리기.
  - 새 E14 테스트 케이스: 디버그 모드에서 실행 → `case-save-current` → `case-modal-save` → `case-grid` 한 줄 → `case-run-all` → `case-summary` `1/1 통과` → `case-delete` → `case-delete-confirm`.
  - 새 E15 찾기·접기: `flow-find` 에 `E2S_FCT` → `flow-find-count` `1/1` → if1 우클릭 → `collapse` → `flow-collapsed-if1` → 찾기 다시 → 펼쳐짐.
  - 파일 머리 목록 주석을 갱신한다. 스모크 넷(E1·E2·E5·E8)은 그대로.
- [ ] **Step 2: `dme.user.ts` TC-DME-SED-05·06** — 1803행 근처 `flow-tab-sim` 누르기를 [디버그] 모드 오가기(`flow-mode-debug` → `dbg-toolbar` 보임 → `flow-mode-view`)로 바꾼다. `assertAllButtonsPressed(page, "ruleSetEdit", 허용 목록)` 은 화면의 모든 보이는 단추를 눌렀는지 본다 — 새 단추(`flow-undo`·`flow-redo`·`flow-minimap-toggle`·`flow-find-next`·`flow-help`·`flow-rule-panel-toggle`·`flow-rule-panel-find`·`flow-edge-add-*`·`flow-mode-debug`·React Flow `Controls` 단추 등)를 이 시나리오 안에서 한 번씩 누르거나, 누르면 화면이 바뀌어 뒤 단계가 깨지는 것은 허용 목록에 이유와 함께 넣는다(예: `flow-edge-add-*` "선마다 있는 넣기 단추 — 하나는 TC-DME-SED-05 에서 눌렀다", 디버그 모드 단추는 디버그 구간에서 따로 전수 확인). 디버그 모드 안에서도 `assertAllButtonsPressed` 를 한 번 더 부른다(허용 목록: 케이스 쓰기 단추 — 앞 단계에서 눌렀음).
- [ ] **Step 3: TEST-CASES.md** — ruleSetEdit 행의 시뮬레이션 문구를 디버그 모드로 바꾸고 E13~E15 대응 행을 더한다.
- [ ] **Step 4: 목록 확인(실행 금지 — Local-Rules §4, 사용자 승인 필요)** — `pnpm --dir src/frontend exec playwright test --list e2e/mdm-ruleSetEdit.spec.ts` 와 `pnpm --dir src/frontend exec playwright test -c playwright.mdm-user.config.ts --list` 가 오류 없이 테스트 이름을 낸다. `--list` 는 파일이 컴파일되는지만 본다 — 버튼 전수 확인이 통과하는지는 수동 확인·사용자 승인 실행에서만 안다(보고서에 적는다).
- [ ] **Step 5: 커밋** — `test(e2e): 룰 세트 편집 e2e 를 디버그 모드·편집기 보강·테스트 케이스 기준으로 갱신`.

---

### Task 15: 선 경로 편집 (C14 — 2026-09-30 사용자 추가 요청)

**모델:** sonnet — FlowCanvas 선 그리기·손잡이 끌기와 view 코덱을 함께 고치는 다파일 통합.

**선행:** Task 0~11 병합 뒤(물결 4). FlowCanvas 를 크게 고친 Task 7·11 과 물결이 다르다. 같은 물결의 Task 13·14 는 FlowCanvas 를 고치지 않는다.

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-edit.ts` — `FlowView.routes: Record<string, FlowPos[]>`, `EMPTY_VIEW.routes`, `copyView`·`sanitizeView`(유한 x·y 점만, 선 하나 20개까지 자르기)·`clone`(흐름에 없는 선 ID 의 경로를 버린다)·`flowJsonOf`(view 키 순서 positions·notes·groups·routes, routes 키는 선 배열 순서). 새 연산 `setRoute(f, edgeId, points: FlowPos[]): EditResult`(없는 선 거부, 21개 이상 거부 `꺾는 점은 선 하나에 20개까지 둔다`, 빈 배열이면 키 삭제), `clearRoutes(f): EditFlow`.
- Modify: `flow-layout.ts` 또는 [자동 정렬] 호출 자리 — 자동 정렬은 위치와 함께 `clearRoutes` 를 적용해 한 번의 이력으로 기록한다.
- Modify: `canvas/FlowCanvas.tsx` 의 선 그리기(`FlowEdgeView`) — `routes[edge.id]` 가 있으면 source → 점들 → target 을 모서리 반경 8 의 둥근 꺾은선 path 로 그리고(순수 함수 `routePath(points, radius)` 를 `canvas/route-path.ts` 에 두고 단위 테스트), 라벨·[+]·변수 칩 위치는 경로 길이의 가운데(`routeMidpoint`). 편집 모드에서 고른 선에 점마다 손잡이(`data-testid="flow-route-handle-{edgeId}-{i}"`)를 그리고 포인터 끌기로 옮긴다(놓을 때 `setRoute` 한 번 → 이력 한 칸). 선 두 번 누르기 → 가장 가까운 구간에 점 삽입(`insertRoutePoint(points, source, target, at)` 순수 함수). 손잡이 두 번 누르기 또는 손잡이를 고른 채 Delete(단축키 디스패처에 항목 추가) → 점 삭제. 보기·디버그 모드는 그리기만, 손잡이 없음. 끌기 중에는 캔버스 내부 상태로만 그리고 page 를 다시 그리지 않는다(Local-Rules §16).
- Modify: 선 우클릭 메뉴 제공자(Task 8 파일) — `경로 초기화`(`data-testid="flow-menu-item-route-reset"`, 경로가 있을 때만 보임) → `setRoute(f, id, [])`.
- Modify: `styles/` 에 `route.ts` 새 영역 파일(손잡이 모양). 로컬 `.css` 금지.
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/flow-route.test.ts`(새 파일).

- [ ] **Step 1: 코덱·연산 테스트(RED)** — `sanitizeView` 가 routes 를 읽고 잘못된 점·21번째 이후를 버림, `flowJsonOf` 왕복(routes 없는 옛 JSON 은 `routes: {}` 로 정규화되지만 저장본과의 dirty 비교가 깨지지 않게 `toEditFlow` 직후 `flowJsonOf` 를 기준으로 삼는지 기존 dirty 기준을 확인하고 보고서에 적는다), `removeNode`·`moveNode`·`dissolveSplit` 뒤 사라진 선의 경로가 없어짐, `setRoute` 거부 두 가지, `clearRoutes`, 입력 불변.
- [ ] **Step 2: 구현(GREEN)**.
- [ ] **Step 3: `routePath`·`routeMidpoint`·`insertRoutePoint` 단위 테스트** — 점 0개(직선), 1개, 꺾임 반경이 구간 길이의 절반보다 크면 줄임, 가장 가까운 구간 고르기.
- [ ] **Step 4: 캔버스 테스트** — 편집 모드에서 선 고르면 손잡이 n 개, 보기 모드 0 개, 손잡이 끌어 놓기 → `onEdit` 한 번(이력 한 칸), 선 우클릭 `flow-menu-item-route-reset` 이 경로 있을 때만.
- [ ] **Step 5: 게이트** — m-mdm vitest·lint, mantine-aggrid-ui audit 0, `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" pages/dme/ruleSetEdit` 0(패키지 CSS import 는 허용).
- [ ] **Step 6: 커밋** — `feat(m-mdm): 룰 세트 흐름 선에 꺾는 점을 두어 경로를 고칠 수 있게 한다`.

---

## 최종 전체 리뷰 (opus)

- 대상: `dev..feat/rule-set-flow-phase3` 전체(Task 12 병합 뒤).
- 요청: 이 계획의 Review Focus 5개, 편차 P-D1~P-D22 반영, 「삭제 대상」 반영, `grep -rn "SEAM(" src/frontend/m-mdm/pages/dme/ruleSetEdit` 0 건, Global Constraints(엔진·저장 형식 불변 — `git diff dev -- src/backend/maru-mdm-engine src/frontend/m-mdm/src/contract` 가 비어야 한다, 새 action 없음, 로컬 `.css` import 없음 — `grep -rnE "import ['\"]\.{1,2}/[^'\"]*\.css['\"]" src/frontend/m-mdm/pages/dme/ruleSetEdit`; `canvas/react-flow.ts` 의 `@xyflow/react/dist/style.css` 패키지 import 는 2단계부터 허용된 것이라 걸리지 않는다), deferred minor 분류.
- 병합은 사용자 지시가 있을 때 `superpowers:finishing-a-development-branch` 로 한다.

## 수동 브라우저 확인 (dev 병합 뒤 — 구현 태스크는 하지 않는다)

전제: Task 12 까지 dev 에 병합됐고, 본체에서 MDM 을 다시 띄워 V15 가 본체 DB 에 적용됐다(`TSUP_DTS=0 local-run.sh --mdm -q` — `--all` 과 `TSUP_DTS=0` 을 같이 쓰지 않는다. 화면은 fe-run 감시가 받아 간다, 필요하면 탭 새로 고침). 도구는 **ego-browser** 스킬. e2e 픽스처 세트(`E2S_*`)가 본체 DB 에 없으면 `mdm-ruleSet-data.sql` 을 넣을지 사용자에게 묻는다(DB 쓰기).

- [ ] 포털 5100 → 마루 MDM > 업무기준 > 룰 세트 편집, 분기 세트를 연다. 콘솔 오류 0.
- [ ] 편집기: 룰 목록에서 끌어 선 위 강조 → 놓기, 빈 곳에 놓기 알림, 룰 노드·IF 블록 끌어 옮기기(블록 전체가 움직임), 선 [+] 메뉴, 우클릭 메뉴(노드·분기·선·빈 곳), 복사·붙여넣기·복제, IF↔병렬, 분기 풀기, 갈래 순서 끌기, 조건식 즉석 편집, 되돌리기·다시 하기(버튼·Ctrl/Cmd+Z), 찾기(Ctrl/Cmd+F), 접기·펼치기, 미니맵 토글, 단축키 도움말. 조건식 칸 안 Cmd+Z 가 글자 되돌리기인지.
- [ ] 선 경로 편집(C14): 선 고르기 → 손잡이 끌기, 두 번 눌러 점 더하기·빼기, [경로 초기화], [자동 정렬]이 경로를 지우고 되돌리기로 살아나는지, 저장 뒤 다시 열어 경로 유지.
- [ ] 디버그 모드: 입력 → 한 단계(F10)·이전·계속(F5)·여기까지·처음부터·끝내기, 중단점 점·F9, 변수 패널 바뀐 값·새 배지, 조사식 핀, 칩 툴팁, 식 평가(참·값·폴백 문구), 편집으로 흐름을 고친 뒤 "지난 흐름 기준" 과 다시 실행, 실행 비교 탭.
- [ ] 테스트 케이스: 현재 입력을 케이스로 저장(기대 자동 채움) → 모두 실행 "n/n 통과" → 흐름을 고쳐 실패 → 차이 표 → 디버그로 열기 → 케이스 삭제. dirty 인 채 케이스 저장 뒤 편집이 남는지.
- [ ] 표준 관리자로 다시: 디버그 모드 진입만 되고 실행·케이스·식 평가가 꺼짐.
- [ ] 창 폭 1280·1920 에서 가로 스크롤 없음, 세 모드 배치가 겹치지 않음.
- [ ] 스크린숏을 남기고, 재발 가능한 화면 문제는 `docs/guide/FrontEnd/Local-Rules.md` 에 짧게 적는다(메모리 규칙 — RULE.md 본문 X).

---

## 자체 점검 (계획 작성 뒤)

- 스펙 §3.1 A1(Task 0 드롭 계산·Task 7 강조·빈 곳 알림), A2(Task 2 `moveNode`·Task 7), A3(Task 0 [+]·Task 8 항목), A4(Task 0 틀·Task 7 목록, P-D10) — 담당 있음.
- §3.2 B5(Task 3), B6(Task 0 디스패처·Task 8 연결), B7(Task 0 메뉴 틀·Task 8·10·11 제공자), B8(Task 2·8), B9(Task 2·8, P-D18), B10(Task 7, P-D17) — 담당 있음.
- §3.3 C11·C12(Task 2·8), C13(Task 2·9). §3.4 D14(Task 0), D15(Task 8), D16(Task 11) — 담당 있음.
- §4.1 모드·배치(Task 0·10·12, P-D9·P-D10·P-D16), §4.2 E1(Task 5·10·11, P-D13), §4.3 E2(Task 5·10·11, P-D14), §4.4 E3(Task 5·10·11), §4.5 E5(Task 4·6·10, P-D1·P-D15), §4.6 E6(Task 4·10, P-D3~P-D8·P-D11·P-D12·P-D19), §4.7 E7(Task 5·10) — 담당 있음.
- §2 전역 제약: 단축키·beforeunload(Task 0·3), localStorage(Task 0 P10), CSS 주입(Task 0 Step 12), 엔진·저장 형식 불변(최종 리뷰 diff 확인).
- §5 변경 범위의 `canvas/EdgeInsert.tsx` 는 따로 두지 않고 `FlowCanvas` 의 선 그리기 안에 넣었다(Task 0, P-D21). §6 테스트: 편집 연산(Task 2), 되돌리기·합치기(Task 3), 캔버스(Task 0·7·8·11), 디버거(Task 5·10), 서버(Task 4) — 대응 있음.
- 이름 일관성: `FlowMode`(P1·Task 0·3·8), `dropRadius`·`RULE_MIME`(P2·Task 0·7), `CanvasActions`·`MenuContext`·`MENU_PROVIDERS`(P4·Task 0·8·10·11), `EditHistory`·`EditOptions`(P5·Task 3), `NODE_LIMIT_MESSAGE`·`Fragment`(P6·Task 2·8), `parseExprText`·`ExprParse`(P8·Task 6·10), `Simulation.last/stale/cursor/next/prev/resume/runTo/restart/finish`(P9·Task 5·10·12), `debugOverlay`·`variablesAt`·`compareRuns`·`debugStatus`·`expectedFromFinal`(P9·Task 5·10), `storeKeys`(P10·Task 0·5·10).
