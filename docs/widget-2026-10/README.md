# 위젯 개선 10건 레인 공통 규칙

2026-10-05 위젯 개선 10건(기본 제공 탭·공유·업무 화면 도구 창·수집 유형·입력 조건 위젯·분류·설명 여러 줄·미리 배치·메모 이름·비공개 위젯)을 레인 다섯 개로 나눠 진행한다.
조정 세션은 **dmes-standard-90** (`uds:/tmp/cc-socks/71580.sock`)이다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다). opencode 레인은 결과를 아래 정본 메모 파일에 쓴다.

| 세션 | 레인 | 브랜치 | 워크트리 |
|---|---|---|---|
| widget-meta (GLM) | 설명 여러 줄·분류·비공개 | `feat/widget-meta` | `/Users/jji/project/dmes-standard-wt/widget-meta` |
| widget-tabs (Sonnet) | 기본 탭·공유·미리 배치 | `feat/widget-tabs` | `/Users/jji/project/dmes-standard-wt/widget-tabs` |
| widget-data (Sonnet) | 입력 조건 위젯·수집 유형 | `feat/widget-data` | `/Users/jji/project/dmes-standard-wt/widget-data` |
| widget-dock (Sonnet) | 업무 화면 도구 창 | `feat/widget-dock` | `/Users/jji/project/dmes-standard-wt/widget-dock` |
| widget-memo (opencode) | 메모 이름 바꾸기 | `fix/widget-memo-rename` | `/Users/jji/project/dmes-standard-wt/widget-memo` |

각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 착수 지시가 정본이다. 위젯 스펙 정본은 `docs/superpowers/specs/2026-10-02-widget-admin-generic-design.md` 이다.

## 0. 사용자 결정(2026-10-05)

1. 기본 제공 탭: 기존 키(`*`=전사·부서 코드)에 기본 탭을 여러 개 둔다. 사용자는 기본 탭을 지우거나 이름을 바꿀 수 없고, 배치는 개인화하며 「기본으로 되돌리기」를 둔다. 관리자가 새 기본 탭을 만들면 다음 접속 때 사용자에게 생긴다. 법인 구분은 하지 않는다.
   - **2026-10-07 개정: 고정 탭** — [2026-10-07-widget-fixed-tabs-design.md](../superpowers/specs/2026-10-07-widget-fixed-tabs-design.md) 참고. 기본 탭은 늘 보이고 사용자가 편집할 수 없으며 「기본으로 되돌리기」는 없다(개인화·되돌리기는 옛 결정).
2. 공유: 사본 전달. 받는 사람에게 「(공유) 이름」 탭으로 즉시 복사하고 탭 수 한도를 지킨다. 배치·설정만 넘기고 메모·대화 내용은 뺀다. 내보내기·가져오기는 버전 칸이 있는 JSON 파일이고, 가져올 때 없는·사용 중지 위젯은 빼고 알린다.
3. 업무 화면 위젯: 포털 머리의 「도구」 버튼으로 `floatable` 표시가 있는 도구형 위젯(계산기·단위 변환·메모)을 떠 있는 창으로 띄운다. 창은 여러 개·이동·크기 조절·**접기(접으면 아이콘 모양)** 가 되고, 탭을 바꿔도 유지되며 사용자별로 저장한다. shared `portal-shell` 변경은 승인됐다.
4. 수집 유형: mcm-core 1분 `@Scheduled`, 수집 시각 PK 로 중복 방지, 90일 보관. 첫 판 원천은 SQL(기존 읽기 전용 실행기)·HTTP JSON(허용 호스트만)·내장 환율. 주식은 HTTP 원천으로, 기계 상태는 SQL 로 다룬다.
5. 그 밖 결정: 입력 조건은 시스템 변수 이외의 `:name` 바인드를 파싱하고(이름·형·기본값·필수, 값은 바인드로만·200자), 캐시 키에 조건값을 넣는다. 분류는 공통코드 그룹 `WIDGET_CTG`·`TB_MCM_WIDGET_DEF.CATEGORY_CD`·코드 위젯 `meta.category`. 비공개는 `PRIVATE_YN`, 위젯 ID 전체 일치로만 서랍에 보인다. 미리 배치는 첫 빈 자리에 스켈레톤으로 보이고 클릭해야 놓인다.

## 1. 작업 방식

- 항목마다 실행 수단을 업무 크기로 고른다(`.claude/skills/coordinator/references/sizing.md`, D0~D4). Workflow 는 구현 → 리뷰 → 수정이 필요한 M/L 항목에만 쓰고, 먼저 `workflow-authoring` 스킬을 읽는다. 토큰을 아끼는 것이 이번 회차 목표다.
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

- 레인마다 위 표의 워크트리를 쓴다(기준 dev `a4848de8`).
- 이 리포 `CLAUDE.md`·`RULE.md` 의 작업 규칙을 따른다. PC별 실행 파일·경로(git 실행 파일, JDK, 형제 패키지 빌드)는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 워크트리의 `node_modules` 가 메인 체크아웃 심링크이면 그 안에서 `pnpm install` 하지 않는다(메인 `@dk-oasis` 링크가 바뀌어 포털이 깨진다). 의존 준비는 `deps.sh` 로 워크트리 안에서만 한다.
- 시험 DB 는 SQLite 만 쓴다. 도커는 쓰지 않는다.
- 메인 체크아웃에서 실행 중인 로컬 서버(8092·8096·8100)와 포털(5100)을 끄거나 재기동하지 않는다. 브라우저 확인·서버 호출이 필요한 확인은 조정 세션에 요청한다.
- 무거운 명령(gradle·전체 vitest·빌드·E2E)은 레인당 한 번에 하나만 돌리고 `.claude/skills/dflow-dev/scripts/heavy.sh` 를 거친다. vitest·gradle workers 는 2 로 제한한다. 이 PC 는 16GB·팬 없는 맥이다.

## 3. 규율

- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- 위젯 테이블은 Flyway 가 아니라 로컬 `ddl-auto` 로 만들고, 개발·운영 DDL 은 ERD 문서(`docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md`)에 등재한다. 레인끼리 겹치므로 레인은 `docs/widget-2026-10/erd-<레인>.md` 조각에만 적고, 마감에서 조정 세션이 합친다.
- shared 새 부품은 묻지 않고 등록하되 `mantine-aggrid-ui` 스킬 문서·색인을 같이 갱신한다. 기존 shared props·동작 변경은 착수 지시에 승인된 것만 하고, 나머지는 조정 세션에 승인을 요청한다.
- **삭제하지 않는다.** 쓰지 않는 파일은 archive 로 옮긴다.
- 커밋은 Conventional Commits 를 따르고 작은 단위로 나눈다. `docs/idea.md` 는 건드리지 않는다.

## 4. 머지 절차

1. 의존: widget-tabs 의 미리 배치(8)는 widget-meta 의 분류(6, 서랍 `onPreview`)가 dev 에 들어간 뒤, widget-data 의 수집 유형(4)은 입력 조건(5) 뒤, widget-dock 은 widget-meta 의 비공개(10) 뒤에 머지한다.
2. 머지 요청 직전에 dev 최신을 자기 브랜치에 합치고 빌드·시험을 다시 돌린다.
3. 조정 세션에 `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과(명령과 통과·실패 수)` 를 보낸다.
4. 「머지 허가」 를 받은 뒤에만 메인 체크아웃(`/Users/jji/project/dmes-standard`, dev)에서 `--no-ff` 로 머지한다.
5. 머지 뒤 `머지 완료: 머지 커밋 해시 / 트리 / 머지 뒤 빌드·시험 결과` 를 보낸다.
6. 이어 워크트리를 정리한다(`git worktree remove`, `git branch -d`, `--force`·`-D` 금지). 끝나면 `정리 완료` 를 보낸다. 마지막 머지 전에는 워크트리를 남겨 둔다.
7. dev push·main 반영은 사용자가 지시할 때만 한다.

## 5. 보고

- 항목 하나가 끝날 때마다: `진행 보고: 항목 번호 / 커밋 / 시험 결과 / 진도율 N%(끝난 항목/전체) / 다음 항목 / 실행: Dn`. 첫 줄에 지시 번호(`instr_id`)를 적는다.
- 정본 메모는 `docs/widget-2026-10/state-<레인>.md`(자기 브랜치)에 둔다. 「정본 갱신 요청」 이 오면 갱신하고 `정본 갱신 완료: 경로 / 남은 일 3줄` 로 답한다.

## 6. 기록 문서

| 문서 | 경로 |
|---|---|
| 구조 변경 기록 | `docs/widget-2026-10/structure-<레인>.md` |
| ERD 조각 | `docs/widget-2026-10/erd-<레인>.md`(테이블·칸을 바꾼 레인만) |

형식은 `.claude/skills/coordinator/templates/lane-rules-README.md` §6.1 을 따른다. 모든 머지가 끝나면 조정 세션이 `SUMMARY.md` 로 모은다.
