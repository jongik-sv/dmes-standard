# 맞춤 레포트 2차 레인 공통 규칙

2026-10-10 맞춤 레포트 2차(조건·출력 확장, 공용 모달 동작, 모듈·분류, 견본)와 화면 휠 전파 수정을 레인 네 개로 나눠 진행한다.
조정 세션은 **dmes-standard-3b** 이다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 세션 | 레인 | 브랜치 | 워크트리 |
|---|---|---|---|
| uq2-shared (Sonnet) | shared Modal(A·B)·DateRangePicker·AgDataGrid 합계 줄·SqlCodeEditor (M1~M4) | `feat/uq2-shared` | `/Users/jji/project/dmes-standard-wt/uq2-shared` |
| uq2-be (Sonnet) | 조건 2판·IN 바인드·코드 LoV·모듈·분류·견본 (B1~B7) | `feat/uq2-be` | `/Users/jji/project/dmes-standard-wt/uq2-be` |
| uq2-mcm (Sonnet) | 위젯 `_query`·맞춤 레포트 두 화면 (F1~F7, H) | `feat/uq2-mcm` | `/Users/jji/project/dmes-standard-wt/uq2-mcm` |
| uq2-wheel (Sonnet) | 그리드·편집기·화면별 휠 전파 수정 (I) | `feat/uq2-wheel` | `/Users/jji/project/dmes-standard-wt/uq2-wheel` |

- 설계 정본: `docs/superpowers/specs/2026-10-10-custom-report-v2-design.md`(2차 스펙). 1차 스펙 `2026-10-10-user-query-program-design.md` 에 덧붙인다.
- 휠 조사 결과: 착수 지시에 첨부한다.
- 각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 착수 지시가 정본이다.

## 0. 사용자 결정(2026-10-10)

1. 큰 SQL 편집 창은 바깥을 눌러도 닫히지 않는다.
2. 겹친 모달은 Esc 한 번에 맨 위 하나만 닫힌다.
3. 다른 모듈 표 DB 권한은 이번 범위가 아니다.
4. 1차에서 뺀 기능(기간·다중 선택(IN)·공통코드 LoV·상대 날짜 기본값·합계 줄·숫자 서식)을 넣는다.
5. 견본 정의를 기능마다 영구로 둔다. L_MAIN 시험 정의 `UQ_TEST_ROWS` 는 그대로 둔다.
6. 분류 코드는 조정 측이 정한다(스펙 §5). 정의에 모듈(`MODULE_CD`)을 더한다.
7. 관리 화면의 [쿼리 시험]·[SQL 검증] 버튼은 가로 한 줄에 둔다.
8. 그리드·SQL 편집기 위에서 더 스크롤할 수 없으면 휠이 바깥 영역으로 전파되어야 한다. 다른 화면도 같은 문제를 찾아 고친다.

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기는 착수 지시 메시지를 따른다.
- 레인 안에서 파일이 겹치지 않는 항목은 병렬로 해도 되고, 겹치면 순서대로 한다.

## 2. 작업 공간

- 레인마다 위 표의 워크트리를 쓴다. 기준은 착수 지시에 적힌 dev 커밋이다.
- 이 리포 `CLAUDE.md`·`RULE.md` 의 작업 규칙을 따른다. PC별 실행 파일·경로는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 워크트리의 `node_modules` 가 메인 체크아웃 심링크이면 그 안에서 `pnpm install` 하지 않는다. 의존 준비는 워크트리 안에서만 한다.
- DB 는 Oracle 하나다. 백엔드 시험은 레인 PDB(`L_<레인>`)를 쓰고, 끝나면 그 PDB 를 지운다. `L_MAIN`·`TPL_*` 은 건드리지 않는다.
- 메인 체크아웃에서 실행 중인 로컬 서버와 포털(5100)을 끄거나 재기동하지 않는다. 프로세스 종료는 자기가 띄운 pid 만 한다(`pkill -f` 같은 넓은 패턴 금지). 브라우저 확인·서버 호출이 필요한 확인은 조정 세션에 요청한다.

## 3. 규율

- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- 공용 파일 소유:
  - `shared/src/components/code-editor/SqlCodeEditor.tsx` = uq2-shared 만.
  - `shared/src/components/grid/grid.css`·shared layout = uq2-wheel 만. `AgDataGrid.tsx` = uq2-shared 만.
  - `m-mcm/widget-types/_query/**`·`page-components/{_userq,cmq}/**` = uq2-mcm 만.
  - Flyway `mcmapuser/V14__*`·`V15__*`, 시더 = uq2-be.
- shared 의 기존 공개 API·props·동작 변경은 착수 지시에 적힌 것만 한다. 그 밖은 조정 세션에 승인을 요청하고 기다린다. 새 컴포넌트·새 export 추가는 승인 없이 진행하고, 같은 작업에서 `mantine-aggrid-ui` 스킬 문서와 색인을 갱신한다.
- **삭제 금지.** 쓰지 않는 파일은 `git mv` 로 archive 에 옮긴다. `git worktree remove --force`·`git branch -D` 금지.
- 커밋은 Conventional Commits. 머지 요청 직전에 레인 전체를 한 커밋으로 합쳐 dev tip 위로 옮긴다(`_shared/node/squash-branch.mjs --rebase`).

## 4. 머지 절차

1. 머지 순서(실제 의존만): uq2-shared → uq2-be(B1~B6) → uq2-mcm → uq2-be(B7). uq2-wheel 은 의존 없이 준비되는 대로 머지한다.
2. 조정 세션에 `머지 요청` 을 보낸다. 「머지 허가」 를 받은 뒤에만 메인 저장소에서 `merge --ff-only <SHA>` 로 머지한다.
3. 머지 뒤 `머지 완료` 를 보낸다(충돌·실패도 그대로).
4. 레인 일이 다 끝나면 워크트리를 정리한다(`git worktree remove`, `git branch -d`). 그 뒤 `정리 완료` 를 보낸다.
5. 레인은 push 하지 않는다(dev push·반영 빌드는 조정 세션 몫).

## 5. 보고

- 형식·정본 메모·재개 확인은 착수 지시의 「보고 방식」 을 따른다.
- 정본 메모 경로: `~/.coord/userq2-1010/lanes/<레인>/memo.md`
