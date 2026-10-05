# 머리글 툴팁·컬럼 사전 레인 공통 규칙

2026-10-05 그리드·폼 머리글 툴팁이 안 나오는 문제를 고치고(MDM 탭 mcm 메타, 상세 `<th>` → `MdmFieldLabel`, SearchField 메타 툴팁, 메타 없는 열 기본 머리글 툴팁, 툴팁 지연 500ms), 컬럼 사전에 필요한 컬럼을 등록한 뒤 개발 산출물의 리팩토링과 FE·BE 성능 점검까지 끝낸다. 세션 3개에 레인으로 나눠 진행한다.
조정 세션은 **dmes-standard-0f** 이다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 세션 | 레인 | 브랜치 | 워크트리 |
|---|---|---|---|
| tooltip-shared | shared 부품·문서 | `fix/tooltip-shared` | `/Users/jji/project/dmes-standard-wt/tooltip-shared` |
| tooltip-screens | 업무 화면(m-mcm·m-mdm·m-mls) | `fix/tooltip-screens` | `/Users/jji/project/dmes-standard-wt/tooltip-screens` |
| mdm-column-dict | 컬럼 사전 분류·등록 스크립트·BE 측정 | `feat/mdm-column-dict` | `/Users/jji/project/dmes-standard-wt/mdm-column-dict` |

각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 착수 지시가 정본이다.

## 1. 작업 방식

- 항목마다 실행 수단을 업무 크기로 고른다(`.claude/skills/coordinator/references/sizing.md`, D0~D4). Workflow 는 구현 → 리뷰 → 수정이 필요한 M/L 항목에만 쓰고, 먼저 `workflow-authoring` 스킬을 읽는다.
- 모든 `agent()` 호출에 `model` 과 `effort` 를 적는다.

| 단계 | 크기 | model | effort |
|---|---|---|---|
| 단순 시험 실행·결과 확인·기계적 치환 | * | haiku | low |
| 조사·위치 찾기·영향 범위·사용처 목록 | * | 검색 워커(`.claude/skills/coordinator/scripts/search.sh`), 실패 시 sonnet | medium |
| 문서 갱신 | * | sonnet | medium |
| 구현·수정·특성 테스트 작성 | S/M | sonnet | high |
| 구현·수정·특성 테스트 작성 | L·동시성·트랜잭션·원인 모를 결함 | opus | high |
| 리뷰(동작 보존 판정) | S | sonnet | high |
| 리뷰(동작 보존 판정) | M/L | opus | high |
| 보안·트랜잭션 정합성 판정 | * | opus | xhigh |

- 항목마다 「구현 → 리뷰 → 지적 수정」 순서로 진행한다. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다.
- 시험 실패 사다리: sonnet/medium → sonnet/high → opus/high, 항목당 수정 시도 최대 3회. 끝에서도 실패하면 blocked 로 보고한다.
- 셸 명령은 짧게 나눈다. heredoc·`sh -c`·변수·`$(…)` 를 섞은 복합 명령은 확인 창을 띄운다. 파일 수정은 Edit·Write 도구로 한다.
- 사람에게 묻는 선택 창(AskUserQuestion)을 쓰지 않는다. 물을 것은 조정 세션에 「질문: 배경 / 선택지 / 기본안」 으로 보내고, 기본안으로 계속할 수 있으면 계속한다.

## 2. 작업 공간

- 레인마다 위 표의 워크트리를 쓴다(기준 dev `e00a3c7c`).
- 이 리포 `CLAUDE.md`·`RULE.md` 의 작업 규칙을 따른다. PC별 실행 파일·경로(git 실행 파일, JDK, 형제 패키지 빌드)는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 시험 DB 는 SQLite 만 쓴다. 도커는 쓰지 않는다.
- 메인 체크아웃에서 실행 중인 로컬 서버(8092·8096·8100)와 포털(5100)을 끄거나 재기동하지 않는다. 브라우저 확인·서버 호출이 필요한 확인은 조정 세션에 요청한다.
- 무거운 명령(gradle·전체 vitest·빌드·E2E)은 레인당 한 번에 하나만 돌리고 `.claude/skills/dflow-dev/scripts/heavy.sh` 를 거친다. vitest·gradle workers 는 2 로 제한한다. 이 PC 는 16GB·팬 없는 맥이다.

## 3. 규율

- 결함 수정(동작이 바뀌는 것)은 리팩토링 커밋과 섞지 않고 `fix(...)` 커밋으로 따로 둔다.
- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- shared(`src/frontend/shared/**`)는 tooltip-shared 레인만 고친다. 다른 레인은 요청만 한다.
- 이번 회차의 shared 변경 다섯 가지(MDM 탭 mcm 메타, SearchField `name`·`meta`, 메타 없는 열 기본 `headerTooltip`, 툴팁 지연 500ms, 관련 문서)는 사용자가 승인했다. 그 밖의 shared 기존 props·동작 변경은 조정 세션에 승인을 요청한다.
- 공통 컴포넌트를 바꾸면 같은 작업에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서·색인과 FE 가이드를 갱신한다(CLAUDE.md 「공통 컴포넌트 행동강령」).
- **삭제하지 않는다.** 쓰지 않는 파일은 archive 로 옮긴다.
- 공용 로컬 MDM DB 에 행을 넣는 일(컬럼 등록)은 조정 세션만 한다. 레인은 등록 자료와 스크립트를 만든다.
- 커밋은 Conventional Commits 를 따르고 작은 단위로 나눈다.

## 4. 머지 절차

1. 의존: tooltip-screens 의 SearchField 항목은 tooltip-shared 의 SearchField 항목이 dev 에 들어간 뒤 시작한다. 범용 키 meta 정리는 mdm-column-dict 의 분류표가 확정된 뒤 시작한다.
2. 머지 요청 직전에 dev 최신을 자기 브랜치에 합치고 빌드·시험을 다시 돌린다.
3. 조정 세션에 `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과(명령과 통과·실패 수)` 를 보낸다.
4. 「머지 허가」 를 받은 뒤에만 메인 체크아웃(`/Users/jji/project/dmes-standard`, dev)에서 `--no-ff` 로 머지한다.
5. 머지 뒤 `머지 완료: 머지 커밋 해시 / 트리 / 머지 뒤 빌드·시험 결과` 를 보낸다.
6. 이어 워크트리를 정리한다(`git worktree remove`, `git branch -d`, `--force`·`-D` 금지). 끝나면 `정리 완료` 를 보낸다. 마지막 머지 전에는 워크트리를 남겨 둔다.
7. dev push·main 반영은 사용자가 지시할 때만 한다.

## 5. 보고

- 항목 하나가 끝날 때마다: `진행 보고: 항목 번호 / 커밋 / 시험 결과 / 진도율 N%(끝난 항목/전체) / 다음 항목 / 실행: Dn`. 첫 줄에 지시 번호(`instr_id`)를 적는다.
- 정본 메모는 `docs/tooltip-2026-10/state-<레인>.md`(자기 브랜치)에 둔다. 「정본 갱신 요청」 이 오면 갱신하고 `정본 갱신 완료: 경로 / 남은 일 3줄` 로 답한다.
- 성능은 반복 측정 없이 결론 내지 않는다(같은 설정 벤치가 2배까지 흔들린다).

## 6. 기록 문서

레인마다 자기 브랜치에서 쓰고 머지에 함께 넣는다.

| 문서 | 경로 |
|---|---|
| 구조 변경 기록 | `docs/tooltip-2026-10/structure-<레인>.md` |
| 성능 비교 기록 | `docs/tooltip-2026-10/perf-<레인>.md` |

형식은 `.claude/skills/coordinator/templates/lane-rules-README.md` §6.1·§6.2 를 따른다. 측정은 조정 세션의 「측정 시작」 뒤에 하고, 기준과 변경을 번갈아 각 3회 이상 재며 회차마다 `uptime` load 를 남긴다. 모든 머지가 끝나면 조정 세션이 `SUMMARY.md` 로 모은다.
