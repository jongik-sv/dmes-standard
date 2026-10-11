# ERD 2차 레인 공통 규칙

2026-10-12 ERD 설계 도구 2차 회차(erd-2nd-1012). 범위: 관계선 경유점, 다이어그램 목록 관리, 모델 목록 관리·삭제, 새 모델 등록 창 예시, 1차 이월 6개(Space 속성 창, 캔버스에서 바로 고치기, 복사·붙여넣기, 버전 숨기기·DRAFT 자동, 처음 둘러보기, 추가·이름 바꾸기 분리), PK 맨 위 표시, 사전에 없는 단어(`***`) 표시, CLI·MCP 목록 관리·모델 등록·가져오기, prodSseLoop 조사. 세션 4개에 레인으로 나눠 진행하고, 마감 레인은 뒤에 띄운다.
조정 세션 = **dmes-standard-d7**. 회차 모드 = token.

| 세션 | 레인 | 브랜치 |
|---|---|---|
| erd2-be | 경유점·모델 관리 서버 계약, CLI·MCP, 기록 정리 | `erd2-be` |
| erd2-canvas | `***` 표시(노드), PK 맨 위, 그 자리 편집, 표 복사·붙여넣기, Space 속성 창, 경유점 손잡이 | `erd2-canvas` |
| erd2-panels | `***` 표시(그리드·속성), 화면 계약, 목록 관리, 등록 창, 버전 숨기기, 둘러보기, 컬럼 복사 | `erd2-panels` |
| erd2-sse | prodSseLoop(deferred 121) 조사·수정안 | `erd2-sse` |
| erd2-close(뒤에 띄움) | 도움말·기능설계서, deferred 처리 칸, 브라우저 확인 | `erd2-close` |

레인의 할 일·소유 파일·금지 파일 정본 = 조정 세션의 지시 메시지.

- 입력: [UX 개선안](../ux-2026-10-11/README.md), [미룬 기능 목록](../deferred.md)(40·91·120·121·123 행)
- 인터페이스 정본 = 아래 §7. 바꿀 일이 생기면 먼저 조정 세션에 묻는다.

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기 = 착수 지시 메시지를 따른다.
- 모델 표 = 설정 `workflow.model_table`.
- 레인 안에서 파일이 겹치지 않는 항목은 병렬로 해도 된다. 겹치면 순서대로 한다.
- 레인·세션당 동시 서브에이전트는 10개까지다.

## 2. 작업 공간

- 레인마다 워크트리를 분리한다(`dmes-standard-wt/<브랜치>`). 기준 = `dev` 최신 커밋(7ac557771). 브랜치 이름 = 위 표.
- 이 리포 CLAUDE.md 와 RULE.md 의 작업 규칙을 따른다. PC별 실행 파일·경로는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 새 워크트리에는 node_modules 가 없다. `src/frontend` 에서 `pnpm install` 을 먼저 하고 shared 를 빌드한다.
- 도커 금지(Oracle 컨테이너만 예외). Oracle 시험 = 복제 PDB(`-Pdmes.ora.test=clone`), 무거운 명령 칸(heavy.mjs) 경유.
- L_MAIN 등 `L_*`·`TPL_*` PDB 에 쓰기·파괴적 시험 금지. 읽기 확인만 허용한다.
- 메인 저장소에서 실행 중인 로컬 서버·FE 의 종료·재기동 금지. 넓은 `pkill` 금지.
  - 서버 기동(별도 포트 포함)·브라우저 확인이 필요하면 조정 세션에 요청한다.
  - 직접 연 브라우저 작업 공간은 보고 전에 닫는다.

## 3. 규율

- TDD 순서: 실패 시험 → 구현 → 통과 → 체크포인트 커밋.
- 결함 수정(동작이 바뀌는 것)은 작업 중 체크포인트 커밋을 `fix(...)` 로 분리해 두고, 합친 커밋 본문의 체크포인트 목록과 진행 보고에 남긴다.
- **자기 레인의 소유 파일만 수정한다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- 소유 레인이 하나뿐인 공용 파일:

| 파일 | 소유 레인 | 다른 레인 |
|---|---|---|
| `src/frontend/m-mdm/pages/dma/erdEdit/ErdViewer.tsx`, `types.ts`, `api.ts`, `edit-context.ts`, `state/**`, `panels/**` | erd2-panels | 요청만 |
| `src/frontend/m-mdm/pages/dma/erdEdit/placeholder-name.ts`(새) | erd2-panels | erd2-canvas 는 import 만 |
| `src/frontend/m-mdm/pages/dma/erdEdit/canvas/**`(`erd-clipboard.ts` 포함) | erd2-canvas | erd2-panels 는 `erd-clipboard.ts` import 만 |
| 시험 고정물 `erd-canvas-fixtures.ts` / `erd-fixtures.ts`·`grid-fixtures.ts` | erd2-canvas / erd2-panels | import 만 |
| `src/frontend/shared/package.json`·`tsup.config.ts`·`src/index.ts`·`components/tour/**`, `.claude/skills/mantine-aggrid-ui/**` | erd2-panels(p6) | 금지 |
| mdm erdEdit 서버, `V7__*.sql`, `scripts/erd/**` | erd2-be | 금지 |
| `docs/erd-tool/deferred.md` | erd2-be(r1 까지) → erd2-close | 머지 요청에 기록할 행을 적어 보낸다 |
| `docs/mdm/screens/erdEdit/**`(도움말·기능설계서) | erd2-close | 머지 요청에 「도움말 반영 메모」를 붙인다 |
| `scripts/perf/render/screens.mjs` | 수정 없음(erdEdit 이미 등록) | 필요하면 erd2-panels 만 요청 |

- **삭제 금지.** 쓰지 않는 파일은 archive 로 옮긴다(`git mv`, 빌드·시험 대상에서 빠지게 설정).
- 머지된 Flyway V 파일(mdm V1~V6) 수정 금지. 새 V 파일은 erd2-be 의 V7 하나다(flyway-migration-add 스킬로 번호를 정한다).
- 새 권한 액션 이름을 만들지 않는다(`MdmActions` 16종 고정). 기존 액션의 `kind` 로 넓힌다.
- 사용자 승인이 필요한 변경:
  - shared 기존 부품의 props·동작·모양 변경. 새 shared 부품 등록(Part B §18)은 묻지 않고 하되, 같은 항목에서 mantine-aggrid-ui 스킬 문서와 색인까지 갱신한다.
  - 포털 공용 BFF(`src/frontend/m-mcm/lib/http/be-proxy.ts`, `app/api/[module]/rest/**`) 변경.
  - `docs/idea.md` 는 사용자 파일이라 고치지 않는다.
- 커밋 = 저장소 관례(Conventional Commits, 제목 한국어). 작업 중에는 작은 체크포인트 커밋을 하고, 머지 요청 직전에 레인 전체를 한 커밋으로 합쳐 dev tip 위로 옮긴다(`_shared/node/squash-branch.mjs --rebase`).
- 영역 규칙이 걸리면 리포의 무조건 적용 스킬(화면 = mantine-aggrid-ui 등)을 따른다.

## 4. 머지 절차

1. **준비된 레인부터 머지한다.** 여러 레인이 기다리는 항목은 단독으로 먼저 머지한다. 순서와 남는 의존:
   1. erd2-be r1(기록 정리) · erd2-panels p9(`***` 표시) — 각각 단독
   2. erd2-be b1(경유점 서버 계약) — 단독. 머지 뒤 canvas·panels 레인에 dev 합침을 알린다
   3. erd2-panels p0(화면 계약) — 단독. 머지 뒤 erd2-canvas c5 가 열린다
   4. erd2-canvas c0·c1~c4(중간 머지 가능. c0 은 p9 뒤)
   5. erd2-be b2(모델 관리 서버) — 단독. 머지 뒤 erd2-panels p1(복사)·p2·p3(스키마 목록)이 열린다
   6. erd2-panels p4·p5·p6(독립, 중간 머지 가능). p6 머지 뒤 다른 워크트리는 shared 를 다시 빌드한다
   7. erd2-be t1·t2(CLI·MCP)
   8. erd2-canvas c5·c6·c7 → erd2-panels p1·p2·p3·p7·p8
   9. erd2-close
   - erd2-sse 는 다른 레인과 무관하다. 수정(s3)은 사용자 승인 뒤에만 한다.
   - 머지 요청 직전에 dev 최신을 자기 브랜치에 합치고 빌드·시험을 다시 돌린다.
2. 조정 세션에 `머지 요청` 을 보낸다(형식 = 착수 지시).
   - 「머지 허가」를 받은 뒤에만 머지한다.
   - 머지 방법: 메인 저장소에서 `git merge --ff-only <SHA>`(머지 단위당 commit 1개, merge commit 없음). 실패하면 `squash-branch.mjs --rebase` 를 다시 돌려 재요청한다. git 실행 파일은 PC 설정을 따른다.
3. 머지 뒤 `머지 완료` 를 보낸다(충돌·실패도 그대로).
4. 마지막 머지 뒤 워크트리를 정리한다(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지) → `정리 완료` 를 보낸다. 중간 머지 뒤에는 워크트리를 남기고 계속한다.
5. 레인은 push 하지 않는다(dev push = 조정자 몫).

## 5. 시험 규칙

- 범위 = 바뀐 것만. 중간 단계는 바뀐 파일 시험과 tsc 만.
- 화면(`src/frontend` 에서): `tests/dma/erdEdit/` 의 바뀐 시험 파일, vitest workers 2. 머지 요청 직전 1회 = `tests/dma/erdEdit/` 전부 + m-mdm lint(heavy.mjs 경유).
- 서버(`src/backend/mdm` 에서): erdEdit 시험 클래스, Oracle 복제 PDB, gradle workers 2. Oracle 시험은 단일 클래스여도 heavy.mjs 경유(PC 잠금).
- CLI·MCP: `node --test scripts/erd/tests`(가짜 OASIS, 서버 없이).
- 알려진 기존 흔들림(deferred 50·80)과 내 변경과 무관한 기존 실패는 고치지 않고 보고만 한다.
- 화면 레인(erd2-canvas·erd2-panels)은 머지 요청 전에 「렌더 점검」 항목을 한다: 반복 렌더 순회·고침, 바꾼 파일 audit(`mantine_docs.mjs`·`aggrid_docs.mjs`), 머지 요청에 「렌더 점검」 줄. 프로파일링 측정은 하지 않는다(3차).

## 6. 보고

- 형식·정본 메모·재개 확인 = 착수 지시의 「보고 방식」.
- 정본 메모 = 리포 밖 `~/.coord/erd-2nd-1012/lanes/<레인>/memo.md`.
- 머지 요청에 「도움말 반영 메모」(도움말 절과 문구)와 「deferred 기록 메모」(처리한 행·새 행)를 붙인다. 마감 레인이 모아 반영한다.

## 7. 인터페이스 정본

### 7.1 경유점 계약 (erd2-be b1 이 만들고 erd2-panels p0·erd2-canvas c5·erd2-be t2 가 따른다)

- 표 `TB_MDM_ERD_DIAGRAM_ROUTE`(mdm V7)
  - 컬럼 순서 = `DIAGRAM_ID`·`REL_UUID`(PK) → `POINTS_JSON` → 감사 컬럼 9개(VER 포함, DIAGRAM_NODE 와 같음)
  - `POINTS_JSON` = CLOB, `IS JSON STRICT`, `[{"x":int,"y":int},…]`, 1~50개
  - FK → `TB_MDM_ERD_DIAGRAM`. 관계는 버전 JSON 안에 있어 관계 FK 는 없다
  - 모든 컬럼에 `COMMENT ON`(V5 관례)
- 다이어그램 명령(save 묶음, 버전 밖)
  - `{"op":"setRoute","diagram":"<d>","relation":"<r>","points":[…]}` — 빈 목록은 거절. 그 DRAFT(없으면 현재 버전)에 없는 관계 = INVALID(기준은 화면이 보는 ver 가 아님)
  - `{"op":"clearRoutes","diagram":"<d>","relations":["<r>",…]}` — 빈 목록 = no-op(거절 안 함, rev 는 올림). null 목록·null 원소는 거절
- 델타 kind `diagramRoute`, id `"<diagram>:<relation>"`, 값 `{diagram, relation, points}`(지움 = null). view 응답 `routes` = `[{diagram, relation, points:[{x,y}]}]`
- 연쇄 삭제(같은 rev. 역명령에 함께 들어가 되돌리기 1번으로 모두 돌아온다)
  - `deleteRelation`·`deleteTable`(걸린 관계도 지움) → 모든 다이어그램의 그 관계 꺾임점. `ErdCommandService` 가 `Restore` 와 `RestoreDiagram` 을 함께 만든다
  - `deleteDiagram` → 그 다이어그램의 꺾임점(`remember()` 가 route 행도 잡는다)
  - `removeFromDiagram`(표) → 그 다이어그램에서 그 표에 걸린 관계의 꺾임점
- 되돌리기: `RestoreDiagram` 요소 kind 검사에 `diagramRoute` 를 더한다. FK 순서 = 다이어그램 되살리기 → 노드·route → 다이어그램 지우기
- 처리 규칙(사용자 결정 10-12)
  - 표 손 이동(moveNodes)·정렬 = 꺾임점 유지. 좌표는 캔버스 절대 좌표이고, 표가 움직여도 꺾임점은 옮기지 않는다
  - [자동 배치] = 화면이 moveNodes 와 clearRoutes(옮긴 표에 걸린 관계)를 한 묶음으로 보낸다(되돌리기 1번)
  - 관계 삭제 = 꺾임점 함께 삭제
- 그 버전에 없는 관계의 route 행은 지우지 않고 화면이 그리지 않는다
- 권한 = 다른 다이어그램 명령과 같다
- 선 모양 = 꺾임점을 지나는 꺾은선(직각 강제 없음)

### 7.2 모델 관리 계약 (erd2-be b2 가 만들고 erd2-panels p0·p2·p3·erd2-be t1 이 따른다)

- `search`(kind 없음): 지금 칸에 `status`(모델 STATUS)·`releasedVer`(최신 확정본, 없으면 null)·`createdBy`(C_USR_ID)를 더한다
- `search kind=SCHEMAS`: `ALL_USERS` 중 `ORACLE_MAINTAINED='N'` 인 사용자 이름 목록. 실패하거나 비면 화면은 직접 입력을 받는다
- `delete kind=MODEL`(kind 없음 = 지금처럼 DRAFT 삭제)
  - 모델 행을 잠근 뒤 CLAIM·EDITOR·CMD_LOG·DIAGRAM_ROUTE·DIAGRAM_NODE·DIAGRAM·MODEL_VER·MODEL 을 지운다
  - 구독자에게 알린다. 새로 읽으면 ERD_MODEL_NOT_FOUND → 화면은 시작 화면으로 간다
  - 완전 삭제, 되돌리기 없음. 화면 확인 창에서 모델 ID 를 입력해야 한다(사용자 확정)
  - 권한: 관리자(역할 `MDM_STD_ADMIN` 또는 `SYSADMIN`) = 확정본 유무와 무관하게 삭제. 비관리자 = DRAFT 소유자(`_VER.OWNER_ID`)이고 RELEASED·REQUESTED·APPROVED 버전이 하나도 없을 때만. 그 밖은 거절
- `copyDiagram` 다이어그램 명령: `{"op":"copyDiagram","from":"<d>","id":"<새 id, 선택>","areaName":"…","diagramName":"…"}` → 노드(위치·접기)와 꺾임점을 함께 복사, rev 1. 화면 기본 이름 「<이름> 복사」
- MCP 에는 모델 삭제를 넣지 않는다(CLI `delete-model --yes` 만)

### 7.3 사전에 없는 단어 표시 (erd2-panels p9 가 만들고 erd2-canvas c0 이 따른다)

- 원인: 서버 `ColumnNameComposer` 가 물리명에서 논리명을 만들 때 사전에 없는 토막을 `***` 로 둔다. 저장 값과 「사전 없음」 위반은 바꾸지 않는다(화면 표시만)
- 순수 함수 `erdEdit/placeholder-name.ts`
  - 입력 = `logical`(저장된 논리명), `phys`
  - 출력 = `{ display, reconstructed, unknownWords }`
    - `reconstructed` = 저장된 논리명 그대로(`***` 포함, 사전으로 만든 이름)
    - `display` = `***` 자리에 물리 토막을 넣은 이름. 자리 맞춤 = 논리명에 `***` 가 있고 논리명 단어 수와 물리명 `_` 토막 수가 같을 때(예 `EXCEL_TP` 「*** 구분」 → 「EXCEL 구분」, `GROUP_ID1` 「*** ***」 → 「GROUP ID1」, `PWD_FAIL_COUNT` 「분말 실패 ***」 → 「분말 실패 COUNT」)
    - `unknownWords` = `display` 를 공백으로 나눈 단어 중 바꿔 넣은 단어의 자리 번호(0부터) 목록
    - 수가 다르면 `display = reconstructed`, `unknownWords = []`, 툴팁에 물리명 전체
- 컬럼 그리드(`ColumnGrid`, 속성 패널 안 그리드 포함)
  - 칸 순서 = 논리명 | 사전 재구성 | 물리명 | …
  - 논리명 칸 = `display`. `unknownWords` 단어는 기울임·회색, 툴팁 「사전에 없는 단어」
  - 사전 재구성 칸(새, 읽기 전용) = `reconstructed`
  - 논리명 셀 편집 = 편집기는 저장 값(`***` 포함)으로 시작하고, 저장 값을 고친다. 표시 값을 저장하지 않는다
- 캔버스 표 노드 = `display` 만(추가 칸 없음). 그 자리 편집 입력도 저장 값으로 시작
- 누름 전환 없음. 저장 값과 「사전 없음」 위반은 바꾸지 않는다

## 8. 기록 문서

- 이 회차는 성능 비교 기록이 없다(렌더 측정은 3차).
- prodSseLoop 조사 결과 = `docs/reports/2026-10-12-erd-sse-prod-loop.md`(erd2-sse).
