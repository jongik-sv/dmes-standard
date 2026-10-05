# 룰 세트 하위 세트 호출(SET 노드, D-135) — 레인 공통 규칙

2026-10-06 룰 세트 흐름에서 다른 룰 세트를 부르는 SET 노드와 편집 화면 안 세트 탭(D-135)을 세션 3개에 레인으로 나눠 구현한다(사용자 결정 U1).
조정 세션은 **dmes-standard-90** 이다(사용자 메인 세션, 주소 uds:/tmp/cc-socks/71580.sock). 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 세션 | 레인 | 브랜치 | 워크트리 |
|---|---|---|---|
| eng | 엔진 계약·흐름 구조·엔진 실행·cactus 미리 받기 | `feat/rule-set-subset-engine` | `/Users/jji/project/dmes-standard-wt/rssc-eng` |
| srv | DB·서버 분석기·코퍼스·서비스·확정 검사 | `feat/rule-set-subset-server` | `/Users/jji/project/dmes-standard-wt/rssc-srv` |
| ui | 세트 탭(shared 새 컴포넌트)·TS 짝·SET 노드 화면·디버거 | `feat/rule-set-subset-ui` | `/Users/jji/project/dmes-standard-wt/rssc-ui` |

- 스펙(정본): `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md`(2026-10-06 판, 결정 C-D1~C-D19)
- 계획: `docs/superpowers/plans/2026-10-01-rule-set-flow-subset-call.md`. 공통부·Task 0·3·c·10 은 2026-10-06 판이다. Task 1·2·4·5·6·7·8·9 본문은 옛 코드 기준이므로 Task 머리의 「갱신 메모」 와 Task 0 대조표를 먼저 읽고, 착수 첫 단계에서 자기 Task 를 현재 코드에 맞춰 읽는다. **계획 파일은 고치지 않는다.** 본문과 다르게 한 것은 §6 기록 문서의 「계획 조정」 에 적는다.

| 레인 | 항목(순서) | 계획 Task |
|---|---|---|
| eng | eng:1 → eng:2 → eng:4, eng:c | 1, 2(Java), 4, c |
| srv | srv:3, srv:5, srv:6 | 3, 5(서버·코퍼스 JSON·Task 2 구조 코퍼스 사례), 6 |
| ui | ui:7, ui:5t, ui:8, ui:9 | 7, 2·5 의 TS 짝, 8, 9 |

각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 지시 메시지가 정본이다.

## 1. 작업 방식: Workflow 필수, 단계별 모델 지정

- 레인 작업은 **Workflow 도구**로 돌린다. 먼저 `workflow-authoring` 스킬을 읽는다.
- 모든 `agent()` 호출에 `model` 과 `effort` 를 명시한다.

| 단계 | model | effort |
|---|---|---|
| 조사·위치 찾기·문서 갱신·기계적 치환 | sonnet | medium |
| 특성 테스트·구현·수정 | opus | high |
| 리뷰·정합성 결함 수정 | opus | high |
| 보안·트랜잭션 정합성 판정 | opus | xhigh |
| 시험 실행·결과 확인 | sonnet | medium |

- 항목마다 「구현 → 리뷰 → 지적 수정」 순서로 진행한다. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다.
- 레인 안에서 파일이 겹치지 않는 항목은 병렬로 돌려도 된다. 겹치면 순서대로 돌린다.
- 동시 agent 수는 조정 세션이 지시문으로 정한다(기본 3, 사용량 띠에 따라 줄어든다).
- 셸 명령은 짧게 나눈다. heredoc·`sh -c`·변수·`$(…)` 를 섞은 복합 명령은 확인 창을 띄워 Workflow 를 멈춘다. 파일 수정은 Edit·Write 도구로 한다.
- 무거운 단계에는 시간 상한을 둔다(모듈 시험 15분, 전체 빌드 40분). 로그가 5분 넘게 늘지 않고 CPU 0% 이면 자기 트리만 종료하고 blocked 로 보고한다.

## 2. 작업 공간

- 레인마다 위 표의 워크트리를 쓴다. 기준은 `dev` 최신 커밋이다. 브랜치 이름은 위 표를 따른다.
- 이 리포 CLAUDE.md 와 RULE.md 의 작업 규칙을 따른다. PC별 실행 파일·경로는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다. 이 PC 에서는 git 을 `/usr/bin/git` 으로 부르고(rtk 훅), gradle 에 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 를 붙인다.
- **프론트 의존성:** `pnpm install` 은 자기 워크트리 안에서만 한다. 먼저 `ls -la src/frontend/node_modules` 로 메인 저장소를 가리키는 심링크인지 확인하고, 심링크면 install 하지 않는다(메인의 `@dk-oasis/*` 링크가 바뀌어 사용자 포털이 깨진다). 형제 패키지 dist 가 없으면 그 패키지 폴더에서 `npx tsup` 을 한 번 돌린다.
- **시험 규칙:** DB 시험은 SQLite 로만 한다. 도커는 쓰지 않는다. e2e 는 `--list` 로 목록만 확인하고, 실제 실행은 사용자 승인 뒤 조정 세션이 한다.
- **서버 기동·브라우저 확인은 조정 세션만 한다.** 레인은 bootRun·local-run·fe-run 을 띄우지 않고 브라우저를 열지 않는다. 메인 저장소(`/Users/jji/project/dmes-standard`)에서 실행 중인 로컬 서버·FE 를 끄거나 재기동하지 않는다. 화면 확인이 필요하면 조정 세션에 요청한다.
- 무거운 명령(gradle·전체 시험·빌드)은 레인당 한 번에 하나만 돌린다. 조정 세션의 `무거운 작업 금지` 통지를 받으면 풀릴 때까지 시작하지 않는다.

## 3. 규율

- 스펙 2026-10-06 판이 정본이다. 결정(C-D1~C-D19, U1~U3)은 바꾸지 않는다. 스펙이 코드와 어긋나면 계획의 편차 표처럼 코드에 맞추고 「계획 조정」 에 적은 뒤 조정 세션에 알린다.
- 줄 번호를 기준점으로 쓰지 않는다. 메서드·레코드·상수 이름으로 grep 해서 찾는다.
- 결함 수정(이 업무 밖의 동작이 바뀌는 것)은 다른 커밋과 섞지 않고 `fix(...)` 커밋으로 따로 둔다.
- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- 소유 레인이 하나뿐인 공용 파일:
  - 공개 엔진 계약(스키마·Java 계약 타입·`RunTraceJson`)의 모양 — eng(eng:1)만.
  - 생성 TS 두 벌(`shared/src/evalex/engine-contract.generated.ts`·`m-mdm/src/contract/engine-contract.generated.ts`)과 `flow-edit.ts`·`flow-layout.ts`·`flow-model.ts`·`catch-text.ts`·`tests/dme/ruleSetEdit/catch-canvas.test.ts` — eng:1 동안 eng, eng:1 머지 뒤 ui(`CatchKind` 에 `SUBSET_ENDED` 가 더해지면 `catch-text.ts` 의 `Record<CatchKind, …>` 가 깨지므로 eng:1 이 함께 고친다).
  - 코퍼스 JSON `rule-set-corpus.json` — srv. ui 는 TS 시험에서 읽기만 한다.
  - DB 마이그레이션 — srv.
  - `docs/mdm/decisions.md` — 조정 세션(Task 10)만.
  - `src/frontend/m-mdm/tests/helpers/engine-paths.ts` — 소유 목록 밖. ui 가 고치되 조정 세션에 먼저 알린다.
- **삭제하지 않는다.** 쓰지 않는 파일은 archive 로 옮긴다(`git mv`, 빌드·시험 대상에서 빠지게 설정).
- **shared:** 업무 도메인에 묶이지 않는 UI 부품(세트 탭 틀 등)은 화면 폴더에 두지 않고 `@dk-oasis/shared` **새 컴포넌트로 승인 없이 등록**하고, 같은 작업 안에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서와 색인을 갱신한다(Part B §18). **기존 shared 컴포넌트의 props·동작·모습 변경은 조정 세션에 승인 요청을 보내고 기다린다.**
- 커밋은 저장소 관례(Conventional Commits, `type(scope): 한국어 subject`)를 따르고 작은 단위로 나눈다. 자기 파일만 경로로 지정해 add·commit 한다(`add -A`·`stash`·`reset --hard`·브랜치 전환 금지). 트레일러는 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 영역 규칙이 걸리면 RULE.md 의 무조건 적용 스킬을 따른다(OASIS 서비스 → `oasis-contract-check`, Flyway → `flyway-migration-add` 판단, 프론트 → `mantine-aggrid-ui`).

## 4. 머지 절차

1. **준비된 레인부터 머지한다.** 남는 의존(`A → B` = B 는 A 가 dev 에 들어간 뒤 시작하거나 머지한다)은 다음과 같다.
   - eng:1 → eng:2 → eng:4, eng:2 → eng:c
   - eng:2 → srv:5, eng:1 → ui:5t, srv:5 → ui:5t
   - srv:3 → srv:6, srv:5 → srv:6, eng:4 → srv:6
   - ui:7 → ui:8, ui:5t → ui:8, srv:6 → ui:8
   - ui:8 → ui:9, srv:6 → ui:9
   - **srv:5 와 ui:5t 는 짝 머지다.** TS 코퍼스 시험이 srv 소유 코퍼스 JSON 을 직접 읽어서, srv:5 만 들어가면 dev 의 m-mdm 시험이 빨개진다. ui:5t 가 srv:5 브랜치를 합쳐 초록을 만든 뒤 알리고, srv:5 는 그 뒤에 머지 요청을 보낸다. 조정 세션은 srv:5 → ui:5t 를 잇달아 머지하고 둘 다 들어간 뒤 m-mdm 게이트를 돌린다.
   - 처음 바로 시작할 수 있는 항목: eng:1, srv:3, ui:7. 다른 레인 항목이 필요하면 그 항목이 dev 에 들어간 뒤 dev 를 자기 브랜치에 합친다.
   - srv:3 의 마이그레이션 번호(V23)는 머지 요청 직전에 dev 의 마지막 번호를 다시 확인한다(`outOfOrder=false`). 겹치면 다음 빈 번호로 옮긴다.
   - 머지 요청 직전에 `dev` 최신을 자기 브랜치에 합치고 빌드·시험을 다시 돌린다.
2. 머지 직전, 조정 세션에 다음 형식으로 보낸다.
   `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과(명령과 통과·실패 수)`
3. 「머지 허가」 를 받은 뒤에만 머지한다. 「대기」 면 기다린다. 머지는 메인 저장소에서 `/usr/bin/git merge --no-ff` 로 한다.
4. 머지 뒤 `머지 완료: 머지 커밋 해시 / 트리 / 머지 뒤 빌드·시험 결과` 를 보낸다(충돌·실패도 그대로).
5. 레인 일이 다 끝났으면 워크트리를 정리한다(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지). 끝나면 `정리 완료: 지운 워크트리·브랜치 / 남긴 것과 이유` 를 보낸다.
6. 레인 일이 많으면 항목 단위로 여러 번 머지해도 된다. 매번 같은 절차를 따른다.
7. dev push·main 반영은 사용자가 지시할 때만 한다.

## 5. 보고

- 항목 하나가 끝날 때마다 조정 세션에 한 줄로 보낸다: `진행 보고: 항목 번호 / 커밋 / 시험 결과(명령과 통과·실패 수) / 진도율 N%(끝난 항목/전체) / 다음 항목`.
- 조정 세션의 지시마다 번호(`instr_id`)가 붙는다. 다음 보고 첫 줄에 그 번호를 적는다.
- 착수 때 한 번 신원을 보낸다: `신원: 이름 / 세션ID / Orca 핸들 / pid / 워크트리`.
- 정본 메모를 하나 두고 지금 상태·남은 순서·결정·조정 세션 이름(dmes-standard-90)·다음 단계를 유지한다. 「정본 갱신 요청」 이 오면 갱신하고 `정본 갱신 완료: 경로 / 남은 일 3줄` 로 답한다. compact 뒤에는 정본을 읽고 「재개 확인」 에 남은 일 3줄로 답한다.

## 6. 기록 문서

레인마다 아래 문서 **하나만** 자기 브랜치에서 쓰고 머지에 함께 넣는다. 레인별 파일이라 머지 충돌이 나지 않는다. 모든 머지가 끝나면 조정 세션이 모아 D-135 기록(Task 10)에 쓴다.

| 레인 | 경로 |
|---|---|
| eng | `docs/rule-set-subset/progress-eng.md` |
| srv | `docs/rule-set-subset/progress-srv.md` |
| ui | `docs/rule-set-subset/progress-ui.md` |

머지 요청을 보낼 때 해당 머지에 든 항목이 문서에 들어 있어야 한다. 형식:

```markdown
# <레인> 진행 기록

## 기준선
- 착수 커밋: <dev 해시> / 시험: <명령과 통과 수>

## <항목 번호>. <제목>
- 커밋: <해시들>
- 시험 결과: <명령과 통과·실패 수, 기준선 대비 증감, audit·lint>
- 결정: <스펙·계획이 정하지 않아 레인이 정한 것과 근거>
- 계획 조정: <계획 본문과 다르게 한 것(이름·자리·순서)과 까닭>
```
