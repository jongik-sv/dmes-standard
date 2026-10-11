# ERD 도구 단계 2(편집·동시 편집) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사람 2명과 Claude 세션 2개가 한 ERD 모델을 함께 고친다. 화면은 exERD 방식으로 표·컬럼·관계·다이어그램을 편집하고, Claude 는 MCP·CLI 쓰기 도구로 같은 명령을 보낸다. 충돌 알림과 되돌리기가 동작하고, 다시 가져오기 차이를 골라 넣고, 소유자가 확정까지 마친다.

**Architecture:** 쓰기는 단계 0 의 명령 API(`save`·`restore`) 하나로 들어간다. 서버는 응답·SSE 에 `rowVersion` 을 싣고, 버전 수명 주기 이벤트 `version` 과 MCP·CLI 세션의 시한 접속자 항목을 더한다. 화면은 두 층 모델(서버 확인 상태 + 대기 명령)을 순수 모듈 `state/pending.ts` 로 두고, 응답 델타를 SSE 가 따라잡을 때까지 보관한다. 다시 가져오기 반영은 `import kind=APPLY_DIFF` 가 고른 차이 항목을 엔진 `restore` 하나로 넣는다. MCP·CLI 는 공용 lib(이름 → id 해석, 결과 글 만들기)를 함께 쓴다.

**Tech Stack:** Java 21, Spring Boot 4, JPA + 네이티브 SQL·`JdbcTemplate`, OASIS BPMN, Spring MVC `SseEmitter`, React 19 + `@xyflow/react` 12.12.0 + `@dagrejs/dagre` 3.1.1(shared), Mantine·AG Grid(shared 래퍼), vitest, node `.mjs` + `node:test`, `@modelcontextprotocol/sdk` 1.30.1 + `zod` 4.6.5(루트 의존성, 단계 1 S16).

**Spec:** [docs/superpowers/specs/2026-10-10-erd-tool-design.md](../../specs/2026-10-10-erd-tool-design.md) (D1~D20, 6절 시험 7·8·9, 7절 단계 2 완료 기준). 앞 단계: [단계 0 README](../2026-10-10-erd-tool-stage0/README.md)("스펙과 다르게 정한 점" P1~P10, "단계 0 구현 결정"), [단계 1 README](../2026-10-10-erd-tool-stage1/README.md)("단계 1 에서 정한 점" S1~S17, "단계 1 구현 결정"). 미룬 기능: [docs/erd-tool/deferred.md](../../../erd-tool/deferred.md).

**완료 기준(스펙 7절):** 사람 2명과 Claude 세션 2개가 한 모델을 함께 고치고, 충돌 알림과 되돌리기가 동작한다. 확정 요청까지 마친다. 시험 7·8·9 를 통과한다.

**착수 전:** deferred 27 머지됨 — dev `25bc64ff3`(`fix(erd): 저장·복원 연결 2개 점유 교착 제거·SSE 전달 큐와 HTTP 동시 저장 시험(deferred 27)`). 이 계획은 27 수정의 설계를 다루지 않는다. 단계 2 가 알아야 할 결과는 다음과 같다.
- 저장(`save`)·복원(`restore`)·가져오기(`import`)·`CLAIM`·`RELEASE` 는 OASIS 트랜잭션에 합류해 요청 하나가 DB 연결 하나만 쥔다. `outsideTx` 는 없다. 거절이면 `ErdCommandService` 가 모델 행을 잠그기 전에 잡은 savepoint 로 되돌리고 영속성 문맥을 비운다. 그래서 쓰기 액션은 BPMN 의 마지막 단계여야 하고, 같은 OASIS 트랜잭션에서 먼저 읽은 엔티티를 쓰기 뒤에 고치면 안 된다.
- 모델 행 잠금은 OASIS 커밋까지 간다. 같은 모델의 저장은 커밋 순서대로 기다린다.
- 권한 확인과 공통 쓰기 가드 사이에 DRAFT 소유자·상태가 바뀌는 드문 경쟁은 `NOT_EDITOR` 거절(success=true)이 아니라 MDM003·MDM002 오류(success=false)로 온다. 화면·MCP 는 이 오류를 "다시 읽고 다시 시도" 로 다룬다.
- 커밋 뒤 SSE 전달은 구독자별 상한 큐(256)와 송신 스레드(4~32)로 간다. 큐가 넘치거나 한 번의 쓰기가 10초를 넘으면 그 구독자에게 `reload{rev}` 를 보내고(넘침의 경우) 스트림을 닫는다. 화면은 닫히면 `sinceRev` 로 다시 붙는다. `presence`·`claim` 이벤트는 재생 델타 뒤에 온다. 허브의 DB 읽기(재생·간격 따라잡기·작업 중 표시 다시 읽기)는 한 번에 하나이고 구독자 잠금을 쥔 채 읽지 않는다(deferred 28 도 함께 닫힘).
- 큰 가져오기 델타는 느린 연결에서 10초 마감에 걸려 끊기고 재생에서 다시 걸릴 수 있다. 마감 Task 에서 관찰하고, 나타나면 가져오기·`APPLY_DIFF` 는 델타 대신 `reload` 를 보내는 쪽으로 deferred 에 올린다.
- 시험: `ErdConcurrentSaveHttpTest`(6), `ErdEventHubQueueTest`(3). 서버 레인은 머지 전마다 이 둘을 다시 돈다.

**문서 구성:** 이 README 에 공통 내용과 Task 사이 인터페이스를 둔다. Task 는 아래 "Task 문서" 표의 7개 파일에 있다. Task 를 맡은 사람은 README 와 해당 파일을 함께 읽는다. 인터페이스 이름·필드·JSON 모양은 이 README 의 "인터페이스 (정본)" 절이 정본이다. 화면 레인과 스크립트 레인은 서버 레인이 머지되기 전에도 이 정본 모양으로 가짜 응답을 만들어 시험한다(S2-1).

## 단계 2 에서 정한 점

S2-1~S2-10 은 조정자 판정(조정 메모 "조정자 판정")이고, S2-11 부터는 계획을 쓰며 조사 결과(화면·서버 계약·MCP·CLI·시험 환경)로 정했다. 스펙 결정(D1~D20)은 바꾸지 않는다.

| # | 결정 | 이유 |
|---|---|---|
| S2-1 | 단계 2 는 조정 회차 하나로 한다. 새 서버 계약(`save` 결과·SSE `change` 의 `rowVersion`, 버전 이벤트 `version`, MCP 접속자, 충돌 `byUserId`, `APPLY_DIFF` 요청·응답, `dryRun`)은 이 README 에 정본으로 못박는다. 화면·스크립트 레인은 기존 계약과 정본 모양으로 먼저 만들고, 서버 레인이 머지된 뒤 실제 연결은 마감에서 확인한다 | 단계 1 이 같은 방식(Task 4·8 선행 관계)으로 끝났다. 조사 B 에 따르면 화면은 지금 계약으로 시작할 수 있다. 서버 → 화면 두 회차로 나누면 직렬이 되어 늦다 |
| S2-2 | 첫 확정 기준은 단계 0 R8-1 을 유지한다. 첫 확정은 표준 위반을 경고로만 알린다. 마감 시험 순서는 가져오기 → 확정(경고 확인) → 새 DRAFT(`copy`) → 공동 편집 → 확정이다 | 스펙 D19 의 글자 그대로다. 가져온 기준선 제외(조사 B 안 A)나 실제 DB 기준(안 B)은 스펙 밖이라 사용자가 정한다(deferred 새 행) |
| S2-3 | 도메인 → 물리 타입 대응을 한 곳(`ErdTypeMapping`, `ErdStandardJudge.sameType` 을 옮겨 같은 파일)에 둔다. STRING(n)→VARCHAR2(n), 길이 없는 STRING→CLOB, BOOLEAN→VARCHAR2(1), NUMBER(p,s)→NUMBER(p,s), 정밀도 없는 NUMBER→NUMBER, DATE→DATE, scale n 인 DATE→TIMESTAMP(n). 판정도 CLOB 을 길이 없는 STRING 에 맞춘다. `copyDomain` 과 미리보기(`previewStatus`)가 같은 대응을 쓴다. 왕복 시험을 둔다 | deferred 42: `copyDomain` 이 논리 타입 STRING 을 그대로 복사해 TYPE 판정·DB_DIFF·DDL 이 틀렸다. 판정과 대응이 두 곳이면 다시 어긋난다 |
| S2-4 | deferred 처리: 31(삭제가 딸린 요소를 지울 때 충돌 검사) 넣음. 29(식별 여부를 바꾸면 자식 PK 가 따라감) 넣음. 30(같은 관계 중복 막기, `parentRef.columns` 일치 검사) 넣음. 39(`rowVersion` + 버전 이벤트) 넣음. 32(`schemaVersion` 검사) 넣음. 34 는 처리 칸에 `fff778c86` 을 적는다. 40(모델 삭제)은 넣지 않는다. 25·28·36 은 여유가 있으면 한다(Task 5 끝 단계) | 31·29·30 은 동시 편집에서 남의 편집을 조용히 잃거나 관계가 겹치는 문제다. 39 가 없으면 공동 편집 뒤 소유자의 확정이 MDM001 로 막힌다. 40 은 되돌릴 수 없는 기능이라 사용자가 정한다 |
| S2-5 | 되돌리기 규칙은 단계 0 그대로다. 같은 속성을 나중에 바꾼 변경이 있으면(내 세션 포함) CONFLICT 다. 같은 표에 남이 컬럼을 더한 뒤 내 컬럼 추가를 되돌리면 `columnOrder` 때문에 CONFLICT 다 | 규칙을 바꾸는 일(목록 단위 복원, 같은 세션 통과)은 사용자 판단이다. 마감 보고에 남긴다 |
| S2-6 | shared `AgDataGrid` 의 props 를 바꾸지 않는다. 그리드 키(Ctrl+Enter 등)는 그리드를 감싼 div 의 `onKeyDownCapture` 로 받고, 논리명 입력·미리보기는 그리드 아래 입력 칸에서 한다. 새 shared 부품 등록은 한다 | 기존 shared 부품의 props 변경은 사용자 승인 사항이다(CLAUDE.md 행동강령). 새 부품 등록은 승인 없이 한다 |
| S2-7 | MCP 세션 이름: `ERD_SESSION` 이 비어 있지 않고 `auto` 가 아니면 그 값, 아니면 `claude-` + `CLAUDE_CODE_SESSION_ID` 앞 8글자, 그것도 없으면 프로세스마다 `mcp-` + 임의 8글자다. MCP 세션이 접속자 목록에 보인다(S2-11). 서버에 `dryRun` 플래그를 둔다(S2-15). `getChangesSince`·쓰기 결과에 글자 상한을 둔다(S2-21). 레인마다 루트 `pnpm install` 을 먼저 한다 | 지금은 모든 Claude 세션이 `claude-erd` 라 서로 충돌하지 않고 작업 중 표시를 나눠 쓴다(deferred 47). `.mcp.json` 확장은 바깥 셸 값으로 풀려서 중첩 실행이면 부모 id 가 들어간다. 그래서 이름은 코드에서 만든다(조사 C 실측). 루트에 `node_modules` 가 없으면 MCP 서버가 뜨지 않는다 |
| S2-8 | 단축키: Ctrl+T 는 Chrome 이 먼저 가져갈 수 있어 Ctrl/⌘+K 를 함께 건다. Ctrl+O 는 Alt+O 를, macOS 의 Ctrl+↑/↓ 는 Alt+↑/↓ 를 함께 건다. 숫자 도구 키(1·2·4·5)는 캔버스에 초점이 있을 때만 받는다. 마감에서 Ctrl+T·Ctrl+O 가 실제로 막히는지 기록한다 | Chrome 은 Ctrl/⌘+T 를 페이지가 막지 못하게 할 수 있다. macOS 는 Ctrl+↑/↓ 를 Mission Control 에 쓴다. 숫자 키는 그리드에서 글자 입력이다 |
| S2-9 | 마감의 두 번째 사람은 TPL_DATA 복제 PDB 에만 e2e 픽스처 SQL(`src/frontend/e2e/fixtures/mdm-rbac-users.sql`, `mdm-ruleEdit-users.sql`)로 만든다(`e2e_mdm_steward`, `e2e_mdm_stdadmin`, 비밀번호 admin123). 브라우저 두 사용자는 `localhost` 와 `127.0.0.1` 쿠키 분리를 마감 첫 확인으로 한다. 안 되면 두 번째 사람은 HTTP 클라이언트로 대신한다. 확정 소유자는 admin(MDM_STEWARD)이다 | TPL_DATA 에는 로그인 가능한 사람이 admin 하나뿐이다. ego-browser 두 번째 프로필은 사용자 승인이 필요하다. 확정·선점은 steward 역할이 있어야 한다(`requireSteward`) |
| S2-10 | m-mdm `src/shell/VersionActionBar` 는 확정취소 관련 props(`cancelConfirm`·`onCancelConfirm`·`cancelConfirmMessage`·`ids.cancelConfirm`·`ids.cancelConfirmWrap`)를 선택으로 바꾸는 것만 한다. 넘기지 않으면 그 단추를 그리지 않는다. 기존 화면 6곳의 동작은 그대로이고 시험으로 확인한다 | ERD 에는 확정 취소 액션이 없다(단계 0 "최종-확정 취소"). 늘 꺼진 단추를 보이지 않는다 |
| S2-11 | MCP·CLI 세션의 접속자 표시는 서버의 시한 항목으로 한다. MCP 가 SSE 를 구독하지 않는다. MCP·CLI 출처 요청이 세션 이름을 실어 오면 허브가 접속자 항목을 만들거나 늘리고, 600초 동안 요청이 없으면 핑 주기(15초)에 지운다. 항목의 `selectedTables` 는 마지막 쓰기가 건드린 표와 그 세션이 작업 중 표시한 표다 | stdio MCP 가 스트림을 쥐면 Claude 세션마다 서버 스레드·연결이 하나씩 묶인다. 이것이 deferred 27 이 다룬 압박이다. node 18 에는 `EventSource` 가 없어 손으로 파서를 짜야 한다. 서버 항목은 CLI 도 덮는다. 화면 이름표는 `selectedTables` 만 읽으므로(`viewersByTable`) 건드린 표를 넣어야 이름표가 보인다. 600초는 작업 중 표시 TTL 과 같다 |
| S2-12 | 버전 수명 주기 SSE 이벤트 이름은 `version` 이다. 확정·선점·해제·넘기기·편집자 추가·빼기 뒤와 구독 직후에 한 번 보낸다. rev 를 올리지 않고 명령 기록에 남기지 않는다. `copy`·DRAFT 삭제는 지금처럼 `reload` 다. `save`·`restore`·`import` 결과와 실시간 `change` 에 `rowVersion` 을 싣는다 | deferred 39. 다른 편집자가 저장하면 ROW_VERSION 이 오르는데 화면이 모르면 확정·선점이 MDM001 로 막힌다. 구독 직후에 보내면 다시 연결된 화면도 최신 버전 상태를 받는다 |
| S2-13 | 충돌·삭제 거절에 `byUserId` 를 싣는다. 서비스가 명령 기록(`TB_MDM_ERD_CMD_LOG.USER_ID`)에서 `byRev` 로 찾는다. `byRev` 가 없으면 null 이다 | 스펙 4.5 의 알림 문구("41000207 이 rev 215 에서 …")는 사용자 ID 를 보인다. 화면 세션 이름은 `ui-` + 임의 글자라 뜻이 없다 |
| S2-14 | 다시 가져오기 반영은 `import kind=APPLY_DIFF` 다. 고른 차이 항목 id 를 `itemsJson` 으로 받아 잠금 안에서 차이를 다시 계산하고, 목록에 없는 id 가 하나라도 있으면 INVALID 로 거절한다. 엔진 `restore` 하나(`sinceRev` = 요청 `baseRev`)로 넣는다. 확정·기각한 관계 상태는 유지한다. 새 BPMN 액션을 만들지 않는다 | D10. 단계 1 S3·S4. `sinceRev` 를 현재 rev 로 두면 그 사이 남의 편집을 조용히 덮는다. 액션 어휘 시험(15개)을 바꾸지 않는다 |
| S2-15 | `save`·`restore` 에 `dryRun` 을 둔다. 전체 판정(잠금·권한·표지·엔진·무결성)을 돌리고 쓰기 전에 롤백한다. 결과는 `applied:false`, `dryRun:true` 이고 통과 여부는 `rejection` 이 null 인지로 본다. 명령 기록·rev·ROW_VERSION·SSE·접속자 표시를 바꾸지 않는다 | 스펙 2.3 "CLI 기본 dry-run". 엔진은 Java 에만 있어 클라이언트는 CONFLICT·NEEDS_CHOICE·표준 경고를 미리 알 수 없다. `applied` 를 "저장했는가" 로만 읽게 한다 |
| S2-16 | 새 Flyway V 파일을 만들지 않는다. `rowVersion` 은 명령 기록에 저장하지 않으므로 재전송·`getChangesSince` 델타의 `rowVersion` 은 null 이다. 접속자 항목은 서버 메모리에 둔다 | 스키마를 바꿀 이유가 없다. 화면은 null 이 아닌 값만 받아 쓴다 |
| S2-17 | 화면은 명령 묶음을 한 번에 하나씩 보낸다(앞 응답 전 뒤 묶음은 줄에서 기다린다). `baseRev` 는 보낼 때 아래층 rev 다. 응답 rev 가 아래층 rev + 1 보다 크면 응답 델타를 보관하고, SSE 가 그 앞까지 채운 뒤 얹는다. 5초 안에 못 채우면 모델을 다시 읽는다 | 단계 1 은 응답 델타를 바로 얹어서, 남의 rev 가 먼저 오지 않으면 gap 으로 전체 다시 읽기가 잇달았다(조사 A 2.4a). 같은 세션 대기 명령을 겹쳐 보낼 때 엔진이 늘 통과시키는지 시험하지 않았다 |
| S2-18 | 화면이 미리 그리는 명령은 `updateTable`·`updateColumn`·`moveColumn`·`deleteTable`·`deleteColumn`·`confirmRelation`·`rejectRelation`, 다이어그램 명령, 그리고 `id`·`phys` 를 준 `addTable` 이다. 결과를 서버가 정하는 명령(논리명만 준 `addColumn`, `addKey`, `addRelation`, `applyDomain`, `setPrimaryKey`)은 흐린 자리표시로 그리고 응답을 기다린다 | 엔진은 Java 다. 서버가 물리명·도메인·복사 컬럼 id·키 이름을 정한다. `id`·`phys` 를 준 `addTable` 은 결과가 정해져 있어 표 도구(FE2)가 바로 그릴 수 있다 |
| S2-19 | 화면 공통 파일(`ErdViewer.tsx`·`api.ts`·`types.ts`·`state/*`·`panels/TopBar.tsx`·`panels/ReviewPanel.tsx`)은 레인 FE1 만 고친다. FE1 의 Task 9(뼈대)가 새 타입·API 함수 전부와 다른 레인 부품의 자리(빈 부품)를 먼저 머지한다. FE2·FE3 은 자기 파일만 고친다 | 세 파일은 모든 기능이 건드린다(조사 A 6절). 단계 1 은 같은 방식으로 겹침을 피했다 |
| S2-20 | 화면 권한을 모델 편집과 다이어그램 편집으로 나눈다. 모델 편집은 DRAFT + 소유자·공동 편집자다. 다이어그램 편집은 보이는 버전(RELEASED 포함)의 소유자·공동 편집자다. 소유자가 없으면 아무도 다이어그램을 못 고치므로 deferred 37 문구를 보인다 | 서버 R9-2 가 이미 이렇게 판정한다. 단계 1 화면은 DRAFT 가 아니면 모두 막았다 |
| S2-21 | MCP 쓰기·변경 결과 글은 25,000자(`WRITE_TEXT_LIMIT`)를 넘지 않는다. 넘치면 줄을 자르고 다음 할 일을 적는다. 원래 JSON 은 `raw:true` 일 때만 붙인다. `getModelText` 의 40,000자는 그대로다 | 결과 상한은 토큰 기준이다. 쓰기·거절·변경 글은 한글이 많아 같은 글자 수에 토큰이 더 든다(조사 C 2.5). `getChangesSince` 는 델타 500건 JSON 을 그대로 붙여 상한을 넘을 수 있었다 |
| S2-22 | 이름 → id 해석은 공용 lib(`scripts/erd/lib/commands.mjs`)가 한다. MCP·CLI 가 같이 쓴다. `apply` 의 `baseRev` 는 호출자가 준다. lib 가 이름을 풀려고 읽은 `view` 의 rev 를 `baseRev` 로 쓰지 않는다 | `getModelText` 에는 요소 id 가 없다(id 를 넣으면 MCM 이 40,000자를 넘는다). 현재 rev 를 `baseRev` 로 쓰면 충돌 검사가 꺼진다(조사 C 0.2) |
| S2-23 | CLI(`scripts/erd/erd-cli.mjs`)의 기본 실행은 서버 `dryRun` + 로컬 이름 해석이다. `--apply` 는 `--user` 나 `ERD_USER` 를 명시해야 한다. 작업 중 표시(`claim`·`release`)는 모델을 바꾸지 않으므로 `--apply` 없이 보낸다. CLI 는 MCP SDK 를 import 하지 않는다 | `scripts/mdm-meta/register-columns.mjs` 선례. CLI 는 `pnpm install` 없이 돌아야 한다(단계 1 S16 예외는 `erd-mcp.mjs` 만) |
| S2-24 | 바뀐 것이 없는 되돌리기(이미 되돌린 rev 를 다시 되돌림)는 INVALID("되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다")로 거절한다 | 지금은 빈 델타로 rev 만 오르고 기록이 남는다(조사 B 1.3). Ctrl+Z 두 번이 빈 rev 를 만든다 |
| S2-25 | 표 추가(도구 2)는 넣는다. 다른 모델을 가리키는 회색 참조 노드(D8)와 다시 하기(redo)는 넣지 않는다(deferred 새 행) | 표 추가는 스펙 4.1 `addTable` 이고 편집에 꼭 필요하다. 회색 참조 노드와 redo 는 단계 0·1 의 단계 2 할 일 목록과 스펙 8절 표에 없다 |
| S2-26 | 작업 중 표시 만료는 방송하지 않는다. 화면·MCP 가 `expiresAt` 으로 거른다. `CLAIM` 응답은 쥔 세션·사용자·만료 시각을 돌려준다 | 지금은 `ok:false` 만 와서 LLM 이 누가 쥐었는지 모른다. 만료 방송은 핑 주기 작업을 늘린다 |
| S2-27 | 키 처리 위치: 포털 키와 겹치는 키(F3, Ctrl+T·K, Ctrl+O·Alt+O, Ctrl+Z)는 지금처럼 window 캡처에서 받고 입력 칸(`isTypingTarget`)이면 넘긴다. 캔버스 키는 캔버스 host 의 `onKeyDown`, 그리드 키는 그리드를 감싼 div 에서 받는다. Ctrl/⌘+F(표 찾기)는 캔버스에 초점이 있을 때만 받는다. 브라우저의 페이지 찾기를 가로채는 범위를 줄이려는 것이다 | 단계 1 F3 방식과 룰 세트 편집기 방식(조사 A 4.2 권고). 초점 범위가 생겨 그리드 입력과 겹치지 않는다 |
| S2-28 | 확정 대화상자는 검사 결과를 코드별로 묶어 수와 코드마다 처음 50건만 보인다. MCP·CLI 도 같은 방식으로 줄인다 | 첫 확정은 경고가 약 700건이다(MCM 737, MDM 657). 서버는 상한 없이 준다 |
| S2-29 | `exclusive`(apply 밖의 쓰기) 는 fn 결과의 rev 까지 화면 상태가 따라올 때(최대 5초) 다음 묶음을 놓는다 | 응답이 SSE 에코보다 먼저 오면 다음 묶음이 늦은 에코를 자기 에코로 잘못 읽어 투영이 잠깐 흔들린다(정합 검토). 5초 상한은 `HOLD_LIMIT_MS` 와 같다 |
| S2-30 | 감사 컬럼은 정확히 8개다: `C_USR_ID`·`C_AT`·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_AT`·`U_SVC_ID`·`U_PGM_ID`(물리명, 대소문자 무시). `VER` 는 감사 컬럼이 아니다. 엔진이 `addTable` 에 이 8개를 자동으로 붙인다(화면·MCP·CLI 모든 경로 공통). `addTable` 의 `audit:false` 로 끈다(없으면 true). 가져오기(`FROM_DB`·`APPLY_DIFF` 의 TABLE_ADDED)는 DB 모양 그대로 두고 붙이지 않는다. 화면은 감사 컬럼을 기본으로 숨기고 도구 막대 토글(localStorage)로 보인다. `getModelText` 는 감사 컬럼을 표마다 한 줄로 접고 `audit:true` 면 펼친다. 표준 판정은 그대로다. 위치: `position` 없는 `addColumn`·끝으로 가는 `moveColumn` 은 표 끝이 감사 컬럼 블록이면 그 블록 바로 앞에 넣는다(넣는 컬럼이 감사 컬럼이면 맨 끝). 컬럼 수 이상의 `position` 도 끝으로 본다. 안쪽 `position` 은 그대로 | 사용자 결정. 8개 컬럼은 모든 표가 똑같이 갖는 이력 칸이라 표를 만들 때마다 손으로 넣게 하지 않고, 화면에서는 보통 필요 없어 숨긴다. `C_AT` 는 DOMAIN 경고가 나올 수 있으나 받아들인다(표준 판정 불변). 새 컬럼이 감사 블록 뒤로 가지 않게 위치 규칙을 둔다(조정자 판정 23) |

## Global Constraints

- 작업은 deferred 27 수정이 머지된 dev 에서 딴 워크트리 브랜치에서 한다. 레인 브랜치는 `erd-stage2-be1`·`erd-stage2-be2`·`erd-stage2-s`·`erd-stage2-fe1`·`erd-stage2-fe2`·`erd-stage2-fe3`, 마감은 `erd-stage2-close` 다. git 은 `/usr/bin/git` 으로 부른다. 복합 셸 명령이 거절되면 나눠 부른다.
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
- Gradle 은 `--max-workers=2` 이하. 백엔드 명령은 `src/backend/mdm`(또는 `src/backend/mcm`)에서 `../gradlew` 로 부른다.
- Oracle 시험은 `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests <클래스>` 로 부른다. 도커·SQLite 금지(Oracle 컨테이너는 이미 떠 있다). Bash timeout 600000ms.
- 열린 PDB 칸은 하나뿐이다(FREEPDB1·L_MAIN 이 열려 있고 상한 3). 레인 Oracle 시험은 heavy 슬롯으로 차례를 기다린다. 마감 복제 PDB 는 Oracle 시험을 모두 끝낸 뒤에 연다. L_MAIN 에는 모델을 등록하거나 쓰지 않는다.
- 시험 시간 예산: 바뀐 범위만 시험하고 항목마다 15분 상한. 마감 Task 에서 바뀐 모듈 전체를 한 번 돈다. deferred 27 의 HTTP 동시 저장 시험은 서버 레인이 머지 전마다 다시 돈다.
- Flyway: 이 계획은 새 V 파일을 만들지 않는다(S2-16). 머지된 V1~V6 은 고치지 않는다.
- JPA 연관관계 금지. 리포지토리는 메서드 없는 `JpaRepository`(규칙 21). 딕셔너리 뷰 읽기는 단계 1 의 `ErdDbMetaReader`(`JdbcTemplate`)를 쓴다.
- Jackson: HTTP 는 Jackson 3, 모델·명령 코드는 Jackson 2(`com.fasterxml`). OASIS 응답은 `ErdModelCodec.MAPPER.convertValue(..., Map)`(`plain()`), SSE 는 `ErdModelCodec.MAPPER` 문자열. 새 응답(`ErdDiffApplyResult`, `compare` 의 `tokens`)도 `plain()` 을 거친다.
- 서비스 쓰기 경로: 저장·복원의 연결 규칙은 deferred 27 수정이 정한 것을 따른다(요청 하나가 DB 연결 하나). 새 쓰기 경로(`APPLY_DIFF`, `dryRun`)는 `save` 와 같은 진입 방식을 쓰고 연결을 더 받지 않는다. `ErdEditService` 에 `@Transactional` 을 붙이지 않는다. `ErdModelStore.lockRev` 는 `MANDATORY` 다. 커밋 뒤 발행은 27 수정의 전달 실행기를 거친다. 새 이벤트(`version`, 접속자 변경·만료)도 같은 실행기로 보낸다.
- 프런트: 화면 모듈은 Mantine·AG Grid 를 직접 import 하지 않고 shared 래퍼만 쓴다. 로컬 `.css` import 금지(`<style href precedence>`, Local-Rules §17). 색은 `--color-*`·`--spacing-*`·`--font-size-*` 토큰만(§8). React Flow 규칙 Local-Rules §19·§33. 그리드 규칙 §20·§30·§31·§39. 늦은 응답 버리기 §37. 버전 막대 §24.
- 프런트 검증 명령(`src/frontend` 에서): `pnpm --filter @dk-oasis/shared build`, `pnpm --filter @dk-oasis/shared test:unit`, `pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test`, `pnpm --filter @dk-oasis/m-mdm lint`. 포털(`@dk-oasis/mcm`)을 빌드해야 하면 `pnpm --filter "@dk-oasis/mcm^..." build` 를 먼저 하고 `AUTH_SECRET`(임의 값)을 준다. m-mdm 시험은 shared 를 `dist` 로 풀므로 shared 를 바꾸면 먼저 빌드한다.
- shared 에 새 부품·새 export 를 더하면 같은 Task 에서 Part B §1 허용 목록 표, `mantine-aggrid-ui` 스킬 문서(`.claude/skills/mantine-aggrid-ui/references/components/<이름>.md`)·`scripts/ui_docs.mjs` 의 `GROUPS`·`EXPORT_FILES` 를 갱신하고 `node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write`·`full --write`·`coverage` 를 돈다. `dist` 진입점에 새 export 가 있는지 확인하는 시험도 더한다(deferred 45).
- 기존 shared 부품의 props·동작은 바꾸지 않는다(S2-6). m-mdm `src/shell` 은 `VersionActionBar` 의 선택 props 변경만 한다(S2-10).
- node 스크립트: ESM `.mjs`, node 18.17 하한(`import.meta.dirname`·`toSorted`·`readdirSync({recursive})`·`util.parseArgs`·전역 `crypto` 금지, `node:crypto` 의 `randomUUID` 를 쓴다), 시험은 `node:test`(`node --test scripts/erd/tests/`). MCP 서버는 stdout 을 프로토콜에만 쓰고 로그는 stderr 로 보낸다. 윈도우를 고려해 경로는 `fileURLToPath`·`path.join`, 표준 입력은 `fs.readFileSync(0)` 로 읽는다.
- 스크립트 시험과 MCP 를 돌리는 워크트리는 리포 루트에서 `pnpm install --frozen-lockfile` 을 먼저 한다. 의존성을 새로 더하지 않는다.
- 브라우저 확인은 ego-browser 스킬을 쓴다(사용자 전역 지침). 사용자 프로필을 고르지 않고, TaskSpace 는 끝나면 `finish({keep:[]})` 로 닫는다.
- 주석·문서·커밋 제목은 한국어. 커밋 형식 `type(scope): 제목`, 끝에 아래 두 줄.
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
  ```
- push 금지. dev 머지는 조정 세션 허가 뒤(조정 세션이 없으면 사용자에게 묻는다). 머지 전에 레인 커밋을 1개로 합친다(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`), 머지는 `--ff-only`. 머지한 워크트리는 `git worktree remove`(`--force` 금지), 브랜치는 `git branch -d` 로 정리한다.

## Review Focus

1. 내가 보낸 묶음의 응답(rev N+2)이 남의 SSE 델타(rev N+1)보다 먼저 온다 → 모델 전체를 다시 읽지 않고, 응답 델타를 보관했다가 N+1 뒤에 얹는다. 반대로 내 묶음의 SSE 에코가 응답보다 먼저 온다 → 묶음이 두 번 그려지지 않고, 그 rev 는 응답이 온 뒤에만 `myRevs` 에 들어간다. 시험: Task 10 `pendingHoldsResultUntilStreamCatchesUp`, `pendingDropsBatchWhenEchoArrivesFirst`.
2. 다른 세션이 baseRev 뒤에 자식 컬럼 논리명을 바꾼 표를 Alt+Delete 로 지운다 → CONFLICT 이고 아무것도 지워지지 않는다. 시험: Task 2 `deleteTableConflictsWhenPeerChangedChildColumn`.
3. `dryRun` 으로 CONFLICT 가 날 묶음과 통과할 묶음을 보낸다 → 둘 다 rev·명령 기록·ROW_VERSION 이 그대로이고 SSE 가 나가지 않는다. 시험: Task 4 `dryRunRollsBackWithoutLogOrEvent`.
4. MCP 세션이 `save` 를 보낸다 → 접속자 목록에 `source=MCP` 항목이 생기고 `selectedTables` 에 건드린 표가 있다. 600초 뒤 핑 주기에 지워지고 `presence` 가 다시 방송된다. 시험: Task 4 `mcpWriteAppearsInPresenceAndExpires`.
5. 다시 가져오기 반영에서 확정·기각한 관계가 걸린 `FK_ADDED` 를 고른다 → `dbFk=true` 가 되고 상태는 그대로다. 낡은 항목 id 를 섞으면 INVALID 이고 아무것도 들어가지 않는다. 시험: Task 3 `fkAddedKeepsDecidedRelationState`, Task 5 `applyDiffRejectsStaleItemIds`.
6. `CLAUDE_CODE_SESSION_ID` 가 다른 두 MCP 프로세스(부모 세션 id 를 물려받은 중첩 실행 포함) → 세션 이름이 다르다. `ERD_SESSION=claude-a` 를 주면 그 값이 이긴다. 시험: Task 6 `sessionNameDerivesFromClaudeSessionId`.
7. 도메인으로 컬럼을 만든 뒤 판정·가져오기 표현과 비교한다 → `sameType(physicalOf(d), d)` 가 늘 참이고, 가져오기 `typeOf` 표현과 같아서 DB_DIFF 가 비어 있다. 시험: Task 1 `physicalOfRoundTripsThroughJudgeAndImport`.

---

## 파일 구조

```
src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  standard/ErdTypeMapping.java(새), ErdStandardJudge.java(sameType 이동)            (Task 1)
  engine/ErdCommandEngine.java(copyDomain·삭제 충돌·빈 restore), ErdRelationOps.java(29·30),
  engine/ApplyOutcome.java(touchedTables), model/ErdModelCodec.java(32)              (Task 1·2)
  importing/ErdDiffApplier.java(새), ErdImportBuilder.java(표 하나 만들기 공개),
  engine/Ctx.java(51 앞), dbmeta/ErdDbMetaReader.java(51 뒤, COLUMN_ID)               (Task 3)
  dto/ErdApplyResult.java, ErdImportResult.java(rowVersion·dryRun), ErdDiffApplyResult.java(새),
  dto/ErdClaimResult.java(새), dto/ErdEditRequest.java(itemsJson·dryRun)              (Task 4·5)
  engine/ErdRejection.java(byUserId)                                                 (Task 4)
  stream/ErdDelta.java(rowVersion), ErdPresence.java(expiresAt), ErdEventHub.java(touch·sweep·version),
  stream/ErdVersionEvent.java(새)                                                    (Task 4)
  service/ErdCommandService.java(dryRun·byUserId·rowVersion·applyDiff·CLAIMED 넓히기),
  service/ErdEditService.java(touch·version 발행·CLAIM 응답·APPLY_DIFF·미리보기 대응),
  service/ErdCommandLogStore.java(userAt), service/ErdModelStore.java(flush)         (Task 4·5)
src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn  (Task 5: 문서 글만. 액션 수 15 그대로)
src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  standard/ErdTypeMappingTest, engine/ErdCommandEngineCascadeConflictTest,
  engine/ErdCommandEngineRelationRulesTest, importing/ErdDiffApplierTest              (Task 1~3, BE1)
  service/ErdPreviewColumnTest(새)                                                    (Task 5, BE2)
src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  ErdTypeMappingOracleTest(새), ErdDbMetaReaderTest(시험 1개 추가)                     (Task 1·3, BE1)
  ErdTestClient(새, 시험 공용), ErdStage2ContractTest, ErdPresenceTouchTest, ErdApplyDiffTest,
  ErdEditOasisHttpTest(실패 경로 보강)                                                 (Task 4·5, BE2)
src/frontend/shared/src/components/react-flow/ auto-layout.ts(새) + index.ts export      (Task 12)
src/frontend/shared/tests/unit/react-flow-auto-layout.unit.test.ts, react-flow-dist-exports.unit.test.ts (Task 12)
src/frontend/m-mdm/src/shell/VersionActionBar.tsx (선택 props)                        (Task 11)
src/frontend/m-mdm/pages/dma/erdEdit/
  ErdViewer.tsx, api.ts, types.ts, edit-context.ts(새)                               (Task 9, FE1 전용)
  state/ pending.ts(새), permissions.ts(새), model-delta.ts, useErdModel.ts, useErdStream.ts (Task 9·10)
  panels/ TopBar.tsx, ReviewPanel.tsx, NoticeBar.tsx(새), ChangeLog.tsx(새), core-styles.ts(새) (Task 9·10)
  panels/ VersionBar.tsx(새), ConfirmDialog.tsx(새), EditorsModal.tsx(새)               (Task 11)
  canvas/ useCanvasEditing.ts(새), ErdToolbar.tsx(새), erd-shortcuts.ts(새), erd-layout.ts(새),
  canvas/ erd-commands.ts(새), erd-edit-styles.ts(새), CanvasDialogs.tsx(새),
  canvas/ RelationClashModal.tsx(새), erd-flow.ts, ErdTableNode.tsx, PresenceTag.tsx,
  panels/ DiagramTree.tsx, DiagramWizard.tsx(새)                                      (Task 13)
  panels/ ColumnGrid.tsx, GridInputBar.tsx(새), TokenChoiceModal.tsx(새), ColumnJump.tsx(새) (Task 14)
  panels/ DbDiffApply.tsx(새)                                                         (Task 15)
src/frontend/m-mdm/tests/dma/erdEdit/*.test.ts                                        (Task 9~15)
src/frontend/m-mdm/tests/dma/erdEdit/ erd-fixtures.ts(FE1 fakeEditContext), erd-canvas-fixtures.ts(FE2),
  grid-fixtures.ts(FE3) — 시험 공용, 시험 파일이 아니다                                  (Task 9·13·14)
src/frontend/m-mdm/tests/shell/version-action-bar.test.ts                            (Task 11. m-mdm vitest 는 tests/**/*.test.ts 만 모으므로 .ts + createElement)
scripts/erd/ lib/commands.mjs(새), lib/results.mjs(새), lib/oasis.mjs(세션 이름)       (Task 6)
scripts/erd/ erd-mcp.mjs, .mcp.json                                                   (Task 7)
scripts/erd/ erd-cli.mjs(새)                                                          (Task 8)
scripts/erd/tests/ commands, results, oasis, erd-mcp, mcp-config, erd-cli .test.mjs     (Task 6~8)
docs/erd-tool/deferred.md, docs/superpowers/specs/2026-10-10-erd-tool-design.md §5·§7,
docs/mdm/screens/erdEdit/erdEdit_기능설계서.md, 이 README "단계 2 구현 결정"            (Task 16)
```

---

## 인터페이스 (정본)

### OASIS `erdEdit` 바뀌는 것

요청은 단계 0·1 과 같이 `POST /api/mdm/oasis/erdEdit/{action}`, 본문 `{"meta":{"menuId":"erdEdit"},"params":{...}}`, 값은 `data.result` 다. 새 BPMN 액션은 없다. `ErdEditRequest` 에 `itemsJson`(String)과 `dryRun`(Boolean)을 더한다.

| 액션 | 바뀌는 것 | 응답 | 권한 | Task |
|---|---|---|---|---|
| `save` | `dryRun` 을 받는다 | `ErdApplyResult`(+`rowVersion`·`dryRun`) | EDIT | 4 |
| `restore` | `dryRun` 을 받는다. 바뀐 것이 없으면 INVALID(S2-24) | `ErdApplyResult` | EDIT | 2·4 |
| `import` | `kind=APPLY_DIFF`(+`itemsJson`, `baseRev`, `session`, `source`) | `ErdDiffApplyResult` | EDIT | 5 |
| `import` | `kind=FROM_DB` 결과에 `rowVersion` | `ErdImportResult` | EDIT | 4 |
| `import` | `dryRun` 을 받지 않는다. `dryRun:true` 면 종류와 상관없이 MDM021 오류(success=false)다. 시험 실행인 줄 알고 보낸 가져오기가 실제로 쓰이지 않게 한다 | 오류 | EDIT | 4 |
| `execute` | `kind=CLAIM` 응답에 쥔 세션 정보 | `ErdClaimResult` | EDIT | 4 |
| `view`·`compare`·`save`·`restore`·`import`·`execute` | `source` 가 MCP·CLI 이고 `session` 이 있으면 접속자 항목을 만들거나 늘린다(S2-11) | 그대로 | 그대로 | 4 |
| `compare`(kind 없음) | 타입 표시가 `ErdTypeMapping` 을 따른다. `tokens` 를 `plain()` 으로 내보낸다 | `ErdNamePreview` | READ | 5 |
| `confirm`·`lock`·`unlock`·`handover`·`execute ADD_EDITOR·REMOVE_EDITOR` | 커밋 뒤 SSE `version` 을 낸다 | 그대로 | 그대로 | 4 |
| `view`(`sinceRev`) | 요청 구간을 줄 수 없어 `reload:true` 면 `fromRev` 에 기록을 줄 수 있는 가장 이른 sinceRev 를 싣는다(구간 안 마지막 다시 읽기 표시 rev, 없으면 rev-500). 그 밖에는 null. 화면 변경 기록은 `fromRev` 부터 한 번 더 읽는다(마감 defect.historyEmptyBeforeSpan) | `ErdChangesView`(+`fromRev`) | READ | 마감 |

```jsonc
// 요청 params 예(MCP 의 시험 실행). commandsJson 은 JSON 배열 문자열이다. dryRun 을 빼면 false.
{ "modelId": "mcm", "baseRev": 212, "session": "claude-1a2b3c4d", "source": "MCP", "dryRun": true,
  "commandsJson": "[{\"op\":\"updateColumn\",\"id\":\"c-5f0e2a\",\"set\":{\"logical\":\"메뉴명\"}}]" }
// MCP 읽기 요청도 session·source 를 싣는다(접속자 표시, S2-11).
{ "modelId": "mcm", "session": "claude-1a2b3c4d", "source": "MCP" }

// ErdApplyResult — save·restore 응답. 단계 1 모양에 rowVersion·dryRun 을 더한다.
{ "applied": true, "rev": 216, "rowVersion": 13, "dryRun": false,
  "changes": [ { "kind": "column", "id": "c-5f0e2a", "op": "upsert",
                 "value": { "table": "t-6f1c90", "phys": "MENU_NM", "logical": "메뉴명", "domainId": 12,
                            "dataType": "VARCHAR2", "length": 150, "scale": null, "notNull": true,
                            "default": null, "comment": "", "_rev": { "logical": { "rev": 216, "session": "ui-ab12cd34" } } } } ],
  "warnings": [ { "code": "CLAIMED", "elementId": "t-6f1c90", "message": "claude-9c8d7e6f 가 작업 중인 표입니다",
                  "claimedBy": "claude-9c8d7e6f", "expiresAt": "2026-10-11T05:20:00Z" } ],
  "rejection": null }

// dryRun — 아무것도 쓰지 않았다. rev 는 지금 rev, 통과 여부는 rejection == null.
{ "applied": false, "rev": 215, "rowVersion": null, "dryRun": true, "changes": [ ... ], "warnings": [ ... ], "rejection": null }

// ErdRejection — byUserId 를 더한다(CONFLICT·NOT_FOUND 에서 byRev 의 명령 기록 USER_ID, 없으면 null).
{ "code": "CONFLICT", "commandIndex": 2, "message": "다른 세션이 먼저 바꾼 값입니다",
  "hint": "getChangesSince(212) 로 바뀐 값을 읽고 다시 보내세요", "elementId": "c-5f0e2a", "property": "logical",
  "byRev": 215, "bySession": "ui-ab12cd34", "byUserId": "41000207", "current": "역할설명", "choices": null, "ownerId": null }
```

- `rowVersion`: 묶음에 모델 명령이 하나라도 있어 DRAFT 행의 ROW_VERSION 을 올렸으면 올린 뒤 값이다. 다이어그램 명령만 있는 묶음, 거절, `dryRun` 은 null 이다(뜻: 바뀌지 않았다). `restore`·`import` 도 같은 규칙이다.
- `dryRun`: 요청에 `dryRun:true` 가 있으면 잠금 → `baseRev` → 편집자 → 표지 → 엔진 → 무결성까지 돌고 쓰기 전에 롤백한다. `changes` 는 반영했으면 생겼을 델타, `warnings` 는 실제 경고(CLAIMED 포함)다. 요청에 없으면 `dryRun` 은 false 다.
- `ErdImportResult` 는 `rowVersion` 을 더한다. 나머지는 단계 1 그대로다.

### SSE (단계 0·1 이벤트 + `version`, `change`·`presence` 칸 추가)

```jsonc
// change — ErdDelta 에 rowVersion. 실시간 발행만 값이 있고, 재전송·getChangesSince 는 null(S2-16).
{ "modelId": "mcm", "rev": 216, "userId": "admin", "session": "ui-ab12cd34", "source": "UI", "rowVersion": 13,
  "changes": [ { "kind": "column", "id": "c-5f0e2a", "op": "upsert", "value": { "...": "..." } } ] }

// version — 새 이벤트(S2-12). rev 를 올리지 않고 명령 기록에 없다.
{ "modelId": "mcm", "ver": "1.001", "status": "DRAFT", "ownerId": "admin",
  "editors": ["e2e_mdm_stdadmin", "erd-mcp-a", "erd-mcp-b"], "rowVersion": 12,
  "reason": "ADD_EDITOR", "userId": "admin", "at": "2026-10-11T05:10:03.120Z" }

// presence — 전체 목록. 항목에 expiresAt 을 더한다. SSE 구독자 항목은 null, MCP·CLI 시한 항목은 만료 시각.
[ { "session": "ui-ab12cd34", "userId": "admin", "source": "UI", "diagramId": "d-0c1d2e", "selectedTables": ["t-6f1c90"],
    "at": "2026-10-11T05:10:00Z", "expiresAt": null },
  { "session": "claude-1a2b3c4d", "userId": "erd-mcp-a", "source": "MCP", "diagramId": null, "selectedTables": ["t-6f1c90", "t-90ab12"],
    "at": "2026-10-11T05:11:40Z", "expiresAt": "2026-10-11T05:21:40Z" } ]
```

- `version.reason` 은 `SUBSCRIBE`·`CONFIRM`·`LOCK`·`UNLOCK`·`HANDOVER`·`ADD_EDITOR`·`REMOVE_EDITOR` 중 하나다. `SUBSCRIBE` 는 구독마다(처음·다시 연결) `hello`·재전송 뒤에 한 번 간다.
- `version` 의 `ver`·`status`·`ownerId`·`editors`·`rowVersion` 은 그 시점에 `view`(ver 없음)가 돌려줄 값과 같다. `status` 는 `view.status` 와 같은 글이다. 확정 뒤에는 확정한 버전이다. 본문은 동작과 같은 트랜잭션 안에서 만들고, 커밋 뒤 전달 실행기로 보낸다. `userId` 는 동작을 한 사용자다(`SUBSCRIBE` 는 구독한 사용자).
- `copy`·DRAFT 삭제는 지금처럼 `reload{rev}` 다. 화면은 `reload` 를 받으면 모델 전체를 다시 읽는다.
- 접속자 시한 항목(S2-11): `ErdEventHub` 공개 메서드 `touch(modelId, session, userId, source, List<String> touchedTables)`, `touchClaims(modelId, session, userId, source, List<ErdClaimView> claims)`, `sweepPresence(Instant now)`, `static isTimedSource(String source)`(MCP·CLI 면 true).
  - `touch` 는 DB 를 읽지 않는다. 반영된 쓰기는 커밋 뒤 콜백에서 `publish` 다음에 `touch(…, touchedTables)` 를 부르고, 읽기·거절된 쓰기는 요청 스레드에서 `touch(…, null)`(표 목록을 바꾸지 않음)을 부른다.
  - `CLAIM`·`RELEASE` 는 `ErdEditService` 가 같은 트랜잭션 연결로 그 모델의 작업 중 표시 목록을 읽어 `touchClaims` 에 넘긴다.
  - `sweepPresence` 는 핑 주기가 지금 시각으로 부른다. 시험은 미래 시각을 넣어 만료를 확인한다.
  - 같은 모델·세션의 SSE 구독이 있으면 아무것도 하지 않는다.
  - 없으면 항목을 만들거나 `at`·`expiresAt`(지금 + 600초)을 늘린다.
  - `selectedTables` = (마지막 쓰기의 `touchedTables`) ∪ (그 세션의 살아 있는 작업 중 표시 표). 읽기 요청은 `selectedTables` 를 바꾸지 않는다. `CLAIM`·`RELEASE` 는 작업 중 표시 부분을 다시 계산한다.
  - 항목이 새로 생기거나 `selectedTables` 가 바뀌면 `presence` 를 방송한다. 만료 시각만 늘면 방송하지 않는다.
  - 핑 주기(15초)가 `expiresAt` 이 지난 항목을 지우고 방송한다. `dryRun` 은 접속자 표시를 바꾸지 않는다.
- `claim` 이벤트 모양은 그대로다(`ErdClaimView{tableId, session, userId, expiresAt}`). 만료는 방송하지 않는다(S2-26).

```jsonc
// ErdClaimResult — execute kind=CLAIM 응답. ok 와 상관없이 지금 그 표를 쥔 세션을 준다.
{ "ok": false, "claimedBy": "claude-9c8d7e6f", "userId": "erd-mcp-b", "expiresAt": "2026-10-11T05:20:00Z" }
{ "ok": true,  "claimedBy": "claude-1a2b3c4d", "userId": "erd-mcp-a", "expiresAt": "2026-10-11T05:21:40Z" }
// 두 세션이 같은 표를 동시에 처음 표시해 키가 겹쳤다. 상대 행이 아직 커밋 전이라 쥔 세션을 읽지 못한다.
{ "ok": false, "claimedBy": null, "userId": null, "expiresAt": null }
```

- 받는 쪽(화면·MCP·CLI)은 `ok:false` 이고 `claimedBy` 가 null 인 경우를 오류로 보지 않는다(쥔 세션을 모를 뿐이다).

### 다시 가져오기 반영 `import kind=APPLY_DIFF`

```jsonc
// 요청 params. itemsJson 은 JSON 배열 문자열(OASIS params 는 배열을 싣지 못한다). 항목 id 는 compare kind=DB_DIFF 의 items[].id.
{ "modelId": "mcm", "kind": "APPLY_DIFF", "baseRev": 230, "session": "ui-ab12cd34", "source": "UI",
  "itemsJson": "[\"COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM\",\"FK_ADDED:TB_MCM_SEC_MENU(OBJECT_ID)>TB_MCM_SEC_OBJ(OBJECT_ID)\"]" }

// ErdDiffApplyResult = ErdApplyResult 칸(dryRun 없음) + summary(거절이면 null)
{ "applied": true, "rev": 231, "rowVersion": 15, "changes": [ ... ], "warnings": [], "rejection": null,
  "summary": { "items": 2, "tablesAdded": 0, "tablesRemoved": 0, "columnsAdded": 0, "columnsRemoved": 0,
               "columnsChanged": 1, "relationsAdded": 0, "dbFkSet": 1, "dbFkCleared": 0, "removedIds": [] } }

// 낡은 id 거절 — elementId 는 첫 낡은 id, choices 는 낡은 id 전부. 부모·자식 표나 컬럼을 풀 수 없는 FK_ADDED 도 여기에 든다.
{ "applied": false, "rev": 231, "rowVersion": null, "changes": [], "warnings": [], "summary": null,
  "rejection": { "code": "INVALID", "commandIndex": 0, "message": "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다",
                 "hint": "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", "elementId": "COLUMN_ADDED:TB_X.Y",
                 "property": "itemsJson", "byRev": null, "bySession": null, "byUserId": null,
                 "current": null, "choices": ["COLUMN_ADDED:TB_X.Y"], "ownerId": null } }
```

순서: 메타·사전 읽기(잠금 밖) → 잠금 → `baseRev` 검사 → DRAFT·편집자 → 표지 → 잠근 모델로 차이 다시 계산 → id 검사 → `ErdDiffApplier.build` → 엔진(`allowRestore=true`) → CAS → 기록 → 커밋 뒤 발행. 항목은 1~500개다(BE2 서비스가 검사한다. 빌더는 겹치는 id 만 하나로 친다). 모델에 표가 없으면 INVALID("먼저 import kind=FROM_DB 로 가져오세요")다(BE2 서비스). 차이를 잠근 모델로 다시 계산하므로 고른 `TABLE_ADDED`·`COLUMN_ADDED` 의 물리명이 모델에 이미 있는 일은 생기지 않는다. 그래서 물리명 중복 검사는 따로 하지 않는다.

| 항목 종류 | 넣는 것(`restore` 요소) |
|---|---|
| `TABLE_ADDED` | 표·컬럼·PK·UK·IX 를 단계 1 가져오기 규칙(`ErdImportBuilder` 의 표 하나 만들기)으로 upsert 한다. 다이어그램에는 놓지 않는다. 이름 규칙 추정은 하지 않는다. 그 표가 자식인 DB FK 는 부모가 모델이나 같은 묶음의 새 표에 있으면 함께 넣는다(`ErdDbDiff` 는 자식 표가 모델에 없는 FK 를 `FK_ADDED` 로 보이지 않는다). 부모를 못 풀면 넣지 않고, 다음 차이에 `FK_ADDED` 로 보인다. 빼는 키(함수 기반 인덱스)의 `IMPORT_SKIPPED` 경고는 버린다 |
| `TABLE_REMOVED` | 표, 그 컬럼·키, 그 표가 자식이거나 부모인 관계(상태 무관)를 모두 delete 요소로 적는다(`restore` delete 는 딸린 요소를 지우지 않는다). 지운 id 는 `summary.removedIds` |
| `COLUMN_ADDED` | 컬럼 upsert + 표 `columnOrder` patch(끝에 붙임). 한 표에 여러 개면 항목 id 순서(컬럼 이름순)로 붙는다. DB 컬럼 순서가 아니다 |
| `COLUMN_REMOVED` | 컬럼 delete, 그 컬럼을 가진 키의 `columns` patch(비면 키 delete), 그 컬럼이 짝에 든 관계 delete, `columnOrder` patch |
| `COLUMN_CHANGED` | 컬럼 `{dataType, length, scale, notNull}` 을 `after` 값으로 patch |
| `FK_ADDED` | 같은 자식·부모·짝의 관계가 있으면(상태 무관) `dbFk=true` patch. 상태가 `INFERRED` 면 `DB` 로 바꾸고 `candidateRank` 를 지운다(단계 1 S7). `CONFIRMED`·`REJECTED` 는 그대로 둔다. 근거에 `DB_FK` + 제약 이름이 없으면 더한다. 없으면 새 관계(`state=DB`, `dbFk=true`, evidence `DB_FK` + 제약 이름, 식별·기수는 단계 1 가져오기 규칙). 자식·부모 표나 컬럼이 모델에도 같은 묶음의 새 항목에도 없으면 그 id 는 `staleIds` 로 가서 묶음 전체가 위 INVALID 다. 화면(FE3)은 `FK_ADDED` 를 고르면 그 FK 의 부모·자식 쪽 `TABLE_ADDED`·`COLUMN_ADDED` 를 함께 보낸다 |
| `FK_REMOVED` | 같은 관계의 `dbFk=false` patch. 상태가 `DB` 면 `CONFIRMED` 로 바꾸고, 다른 상태는 그대로 둔다. 관계를 지우지 않는다 |

### 엔진·Java 내부

```java
// E = com.dongkuk.dmes.mdm.dma.erdEdit
// E.standard.ErdTypeMapping (새, 순수, final class) — 도메인 → 물리 타입 대응과 판정 비교를 한 곳에 둔다(S2-3).
public record PhysType(String dataType, Integer length, Integer scale) {}   // ErdTypeMapping 안의 레코드. 밖에서는 ErdTypeMapping.PhysType
public static PhysType physicalOf(String dataType, Integer length, Integer scale);
public static PhysType physicalOf(ErdDomainSpec d);                         // 편의 오버로드(copyDomain·미리보기)
public static final int NUMBER_MAX_PRECISION = 38;
public static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale); // ErdStandardJudge.sameType 을 옮긴다

// E.engine.ApplyOutcome.Applied — 칸 하나를 더한다(deferred 25).
record Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings,
               List<String> touchedTables) implements ApplyOutcome {}

// E.importing.ErdDiffApplier (새, 순수)
public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev,
                          Supplier<String> idSource);   // idSource 는 접두어 없는 id 몸통을 준다. 빌더가 "t-"·"c-"·"k-"·"r-" 를 붙인다(시험은 순번)
public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev);
                                                        // idSource = UUID.randomUUID().toString(). 서비스(BE2)는 이 5인자를 부른다
public record Built(ErdCommand.Restore restore, Summary summary, List<String> staleIds) {}
public record Summary(int items, int tablesAdded, int tablesRemoved, int columnsAdded, int columnsRemoved,
                      int columnsChanged, int relationsAdded, int dbFkSet, int dbFkCleared, List<String> removedIds) {}
// staleIds = 지금 차이 목록에 없는 id + 자식·부모를 풀 수 없는 FK_ADDED id. 비어 있지 않으면 restore·summary 는 null 이고 서비스가 INVALID 로 거절한다.

// E.dto.ErdDiffApplyResult (새, BE2) — Summary 는 BE1 의 ErdDiffApplier.Summary 를 그대로 쓴다.
public record ErdDiffApplyResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes,
                                 List<ErdWarning> warnings, ErdRejection rejection, ErdDiffApplier.Summary summary) {}

// E.dto.ErdApplyResult — Long rowVersion, boolean dryRun 을 더한다. ErdImportResult — Long rowVersion 을 더한다.
// E.engine.ErdRejection — String byUserId 를 bySession 뒤에 더한다(BE2). 지금의 보조 생성자 두 개를 남겨 엔진 코드가 그대로 컴파일되게 한다.
//   엔진은 null 로 만들고 서비스가 채운다. BE1 은 이 파일을 고치지 않는다.
// E.stream.ErdDelta — Long rowVersion 을 source 뒤에 더한다. E.stream.ErdPresence — String expiresAt 을 at 뒤에 더한다.
// E.stream.ErdVersionEvent (새) — record(modelId, ver, status, ownerId, editors, rowVersion, reason, userId, at)
// E.service.ErdCommandLogStore — Optional<String> userAt(String modelId, long rev)
```

| 대응(`physicalOf`) | 도메인 (타입, 길이, 소수) | 물리 (타입, 길이, 소수) |
|---|---|---|
| 문자 | `STRING`(n) | `VARCHAR2`, n, null |
| 긴 글 | `STRING`(길이 없음) | `CLOB`, null, null. 판정도 CLOB 을 길이 없는 STRING 에 맞춘다 |
| 숫자 | `NUMBER`(p, s) | `NUMBER`, p, s. s 가 null 이면 0(가져오기의 NUMBER(p) 표현) |
| 숫자 | `NUMBER`(없음, 없음) | `NUMBER`, null, null |
| 숫자 | `NUMBER`(없음, s) | `NUMBER`, 38, s(Oracle `NUMBER(*,s)`). 판정은 도메인 정밀도가 없으면 소수만 본다 |
| 날짜 | `DATE`(scale 없음) | `DATE`, null, null |
| 일시 | `DATE`(scale n) | `TIMESTAMP(n)`, null, null(가져오기와 같은 글자 표현) |
| 예·아니오 | `BOOLEAN` | `VARCHAR2`, 1, null |
| 그 밖 | 이미 물리 타입이거나 모르는 타입 | 그대로 |

엔진 규칙(Task 2):
- deferred 31: `deleteTable`·`deleteColumn` 이 딸린 요소(컬럼·키·관계)를 지우거나 키 `columns` 를 줄일 때, 그 요소의 모든 `_rev` 속성에 단계 0 충돌 규칙(`_rev.rev > baseRev` 이고 다른 세션)을 적용한다. 충돌이면 그 요소 id 와 속성으로 CONFLICT 를 낸다. 범위는 딸린 요소뿐이다. 단독 `deleteColumn` 은 표 `columnOrder` 를 보지 않는다.
- deferred 29: `updateRelation` 이 `identifying` 을 false→true 로 바꾸면 자식 짝 컬럼을 자식 PK 에 넣는다(PK 가 없으면 `PK_` + 자식 표 물리명으로 만든다). true→false 면 PK 에서 빼고, PK 가 비면 키를 지운다. `setPrimaryKey` 와 같은 경로로 처리하므로 역명령과 충돌 검사가 따라온다. 식별을 끌 때 NOT NULL 은 되돌리지 않고, 같은 자식 표의 다른 식별 관계가 쓰는 컬럼은 PK 에 남긴다.
- deferred 30: `addRelation` 의 (자식, 부모 또는 `parentRef` 의 모델·표, 짝 집합)이 기존 관계(상태 무관, `REJECTED` 포함)와 같으면 INVALID 다. `elementId` 는 기존 관계 id, hint 는 "confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요" 다. `parentRef.columns` 가 짝의 부모 쪽(순서 포함)과 다르면 INVALID 다. `parentRef.columns` 가 null 이면 짝으로 채운다. 이미 저장된 빈 `columns`(`[]`)는 옮기지 않는다.
- deferred 32: `ErdModelCodec.read` 는 `schemaVersion` 이 1 이 아니면 `IllegalStateException`("모델 JSON schemaVersion 을 모릅니다: n")을 던진다.
- S2-24: `restore` 가 바꾼 요소가 하나도 없으면 INVALID 다. 모델 부분은 이미 되돌렸고 다이어그램 부분만 남은 되돌리기도 묶음 전체가 INVALID 다(드문 경우라 그대로 둔다).
- 호출자가 `addColumn`·`updateColumn` 에 논리 타입(`dataType:"STRING"` 등)을 직접 넣는 경우는 대응하지 않는다. 대응은 도메인 복사(`copyDomain`)와 미리보기만 한다(deferred 새 행).
- deferred 25: `touchedTables` 는 표 변경, 컬럼 변경·삭제(삭제 전 값의 `table`), 키의 `table`, 관계의 `child`·`parent` 를 모은다. 정렬하고 중복을 없앤다. 서비스는 이 목록으로 CLAIMED 경고와 접속자 `selectedTables` 를 만든다.

### 화면 내부 계약 (m-mdm `pages/dma/erdEdit/`)

Task 9(FE1 뼈대)가 아래를 모두 만들어 먼저 머지한다. FE2·FE3 은 이 이름·모양을 그대로 쓴다. 더 필요한 서버 호출은 자기 파일에서 `erdCall` 로 만든다.

```ts
// types.ts — 더하는 것
export interface ErdApplyResult { applied: boolean; rev: number; rowVersion: number | null; dryRun?: boolean;
  changes: ErdChange[]; warnings: ErdWarning[]; rejection: ErdRejection | null }
export interface ErdRejection { code: string; commandIndex: number; message: string; hint: string | null;
  elementId: string | null; property: string | null; byRev: number | null; bySession: string | null;
  byUserId: string | null; current: unknown; choices: unknown; ownerId: string | null }
export interface ErdDelta { modelId: string; rev: number; userId: string; session: string; source: ErdSource;
  rowVersion?: number | null; changes: ErdChange[] }
export interface ErdPresence { session: string; userId: string; source: ErdSource; diagramId: string | null;
  selectedTables: string[]; at: string; expiresAt?: string | null }
export type ErdVersionReason = "SUBSCRIBE" | "CONFIRM" | "LOCK" | "UNLOCK" | "HANDOVER" | "ADD_EDITOR" | "REMOVE_EDITOR";
export interface ErdVersionEvent { modelId: string; ver: string; status: string; ownerId: string | null; editors: string[];
  rowVersion: number; reason: ErdVersionReason; userId: string; at: string }
export interface ErdClaimResult { ok: boolean; claimedBy: string | null; userId: string | null; expiresAt: string | null }
export interface ErdDiffApplySummary { items: number; tablesAdded: number; tablesRemoved: number; columnsAdded: number;
  columnsRemoved: number; columnsChanged: number; relationsAdded: number; dbFkSet: number; dbFkCleared: number; removedIds: string[] }
export interface ErdDiffApplyResult extends ErdApplyResult { summary: ErdDiffApplySummary | null }
export interface ErdTermRef { termId: number; termName: string; engAbbr: string | null }
export interface ErdNameToken { seq: number; surface: string; status: "MATCHED" | "SYNONYM" | "AMBIGUOUS" | "NO_ABBR" | "UNKNOWN";
  selected: ErdTermRef | null; abbr: string; candidates: { term: ErdTermRef; via: "NAME" | "SYNONYM" | "ALIAS" }[] }
export interface ErdNamePreview { physName: string; logicalName: string; tokens: ErdNameToken[];
  recommendedDomainId: number | null; status: ErdColumnStatus }
export interface ErdCheckIssue { code: string; message: string; field: string | null; itemKey: string | null }
export interface ErdConfirmCheck { errors: ErdCheckIssue[]; warnings: ErdCheckIssue[] }
export type ErdCommandJson = { op: string } & Record<string, unknown>;

// api.ts — 더하는 함수(모두 SCREEN_ID "erdEdit", source "UI")
export function erdCall<T>(action: string, params: object): Promise<T>;
export function applyCommands(modelId: string, baseRev: number, session: string, commands: ErdCommandJson[]): Promise<ErdApplyResult>; // save
export function undoRev(modelId: string, rev: number, session: string): Promise<ErdApplyResult>;                // restore
export function previewName(input: { logical?: string; phys?: string }): Promise<ErdNamePreview>;                // compare
export function applyDbDiff(modelId: string, baseRev: number, session: string, itemIds: string[]): Promise<ErdDiffApplyResult>;
export function claimTable(modelId: string, tableId: string, session: string): Promise<ErdClaimResult>;
export function releaseTable(modelId: string, tableId: string, session: string): Promise<{ ok: boolean }>;
export function addEditor(modelId: string, userId: string): Promise<{ ok: boolean }>;
export function removeEditor(modelId: string, userId: string): Promise<{ ok: boolean }>;
export function newVersion(modelId: string, verKind: "MAJOR" | "MINOR"): Promise<{ ver: string }>;            // copy
export function deleteDraft(modelId: string, ver: string, rowVersion: number): Promise<{ ok: boolean }>;
export function lockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }>;
export function unlockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }>;
export function validateConfirm(modelId: string): Promise<ErdConfirmCheck>;
// applyFrom: 적용 시작 시각 "yyyy-MM-dd HH:mm:ss"(서버 필수, RuleConfirmService.parseApplyFrom). 화면 기본값은 확정 대화상자를 연 시각이다.
// 지난 시각이면 바로 적용된다. 미래 시각이면 그 시각 전까지 copy 가 MDM006 이다. 직전 RELEASED 의 적용 시작보다 뒤여야 한다.
export function confirmVersion(modelId: string, ver: string, rowVersion: number, warningsAcknowledged: boolean,
  applyFrom: string): Promise<{ ok: boolean }>;

// state/pending.ts — 순수 두 층 모듈(스펙 시험 8 대상). FE1 안에서만 쓴다.
export interface PendingBatch { id: number; label: string; baseRev: number; commands: ErdCommandJson[]; undoOf?: number;
  state: "queued" | "sending" | "held" | "echoed"; heldRev?: number; heldSince?: number }
export interface Layers { server: ErdState; pending: PendingBatch[]; held: ErdDelta[] }
export interface PendingMe { userId: string; session: string }
export interface ResultOutcome { layers: Layers; notice: ErdNotice | null; reload: boolean; mine: number | null } // mine = myRevs 에 넣을 rev
export function initLayers(server: ErdState): Layers;
export function project(server: ErdState, pending: readonly PendingBatch[]): ErdState;
export function projectCommand(state: ErdState, cmd: ErdCommandJson): ErdState;   // S2-18 밖 명령은 자리표시만
export function pendingIds(pending: readonly PendingBatch[]): ReadonlySet<string>; // 아래 "pendingIds 키" 참고
export function enqueue(l: Layers, b: Omit<PendingBatch, "state">): Layers;
export function markSending(l: Layers, batchId: number): { layers: Layers; batch: PendingBatch } | null;
export function dropBatch(l: Layers, batchId: number): Layers;
export function onResult(l: Layers, batchId: number, r: ErdApplyResult, me: PendingMe, now: number): ResultOutcome;
export function onStream(l: Layers, d: ErdDelta, now: number, me: PendingMe): { layers: Layers; reload: boolean }; // me 로 에코를 가른다
export function onTick(l: Layers, now: number): { reload: boolean };   // 보관 HOLD_LIMIT_MS(5초) 초과면 reload
export function onReloaded(l: Layers, server: ErdState): { layers: Layers; dropped: number };
export function resultDelta(r: ErdApplyResult, modelId: string, me: PendingMe): ErdDelta;

// edit-context.ts — 패널·캔버스가 받는 편집 문맥
export interface Right { ok: boolean; reason: string | null }
export interface EditRights { model: Right; diagram: Right; confirm: Right; manageEditors: Right; owner: boolean }
export interface ErdNotice { code: "CONFLICT" | "NOT_FOUND" | "INVALID" | "NEEDS_CHOICE" | "NOT_EDITOR" | "NETWORK" | "RELOAD";
  label: string; message: string; hint: string | null; commandIndex: number | null; elementId: string | null;
  property: string | null; byRev: number | null; byUserId: string | null; bySession: string | null;
  current: unknown; mine: unknown; choices: unknown }
export type ApplyOutcome = { ok: true; rev: number; warnings: ErdWarning[] } | { ok: false; notice: ErdNotice };
export interface ErdNav { selectTable(tableId: string): void; selectColumn(columnId: string): void;
  openTableFind(): void; openColumnJump(): void }
export interface ErdHighlight { code: ErdNotice["code"]; elementId: string; property: string | null; message: string; mine: unknown }
export interface ErdEditContext { modelId: string; session: string; me: string; state: ErdState; status: ErdStatusView | null;
  rights: EditRights; diagramId: string | null; selectedTableId: string | null;
  selectedColumnId: string | null;       // 고른 컬럼(컬럼 점프 → nav.selectColumn 이 그 표와 함께 둔다). 표를 바꾸면 null
  highlight: ErdHighlight | null;        // 마지막 CONFLICT·NOT_FOUND·INVALID 의 칸(그리드 칸 강조·칸 아래 빨간 문구·노드 강조)
  pendingIds: ReadonlySet<string>;       // queued·sending·held 묶음이 건드리는 요소 id(흐린 자리표시, S2-18). 키 모양은 아래
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;   // 내 쓰기 줄이 빌 때까지 기다렸다가 fn 을 돈다. 도는 동안 다음 묶음을 보내지 않는다
  clearHighlight(): void;
  notify(message: string, tone?: "info" | "warn" | "error"): void; nav: ErdNav }
```

- 시험 도구: FE1 Task 9 가 `tests/dma/erdEdit/erd-fixtures.ts` 에 `fakeEditContext(state: ErdState, over?: Partial<ErdEditContext>): ErdEditContext` 를 둔다(`apply` 는 `vi.fn`, 기본 반영 rev+1, `exclusive` 는 fn 을 바로 돈다). FE2·FE3 의 시험 공용(`erd-canvas-fixtures.ts`·`grid-fixtures.ts`)은 가짜 문맥을 따로 만들지 않고 이 함수 위에 자기 기본값을 `over` 로 얹는다. 그래서 FE1 이 칸을 더해도 FE2·FE3 시험이 깨지지 않는다.
- `pendingIds` 키: 살아 있는 묶음의 명령마다 `id`·`table`·`child`·`parent` 칸 값, `tables[]` 값, `nodes[].table` 값을 그대로 모은 요소 id 다(표·컬럼·키·관계·다이어그램 id). `"다이어그램:표"` 같은 합친 키는 넣지 않는다. 다이어그램 명령(`moveNodes`·`setFold`·`removeFromDiagram` 등)이 건드린 노드는 표 id 로 들어간다.
- apply 밖의 쓰기(`import kind=FROM_DB`·`kind=APPLY_DIFF`)는 `ctx.exclusive(() => …)` 안에서 부른다. 응답 델타는 얹지 않고 같은 rev 의 SSE `change`(또는 다시 읽기)로 받는다. HTTP 호출이 도는 동안에는 "보내는 중" 묶음이 없으므로 그 사이 온 내 세션의 SSE 델타가 다른 묶음의 에코로 잘못 읽히지 않는다. 다만 응답이 SSE 에코보다 먼저 오면 다음 묶음이 곧바로 "보내는 중" 이 되고, 늦은 에코가 그 묶음을 `echoed` 로 바꿔 진짜 SSE 가 올 때까지 투영에서 잠깐 빠질 수 있다(데이터는 잃지 않고 `myRevs` 도 맞다). 조정자 판정(S2-29): 이 흔들림을 막으려고 `exclusive` 는 fn 의 결과에 rev 가 있으면 `state.rev ≥ 그 rev` 가 될 때까지 `HOLD_LIMIT_MS`(5초) 안에서 기다린 뒤 다음 묶음을 놓는다. 5초가 지나면 다시 읽기로 맞춘다. FE1 Task 10 이 구현하고 시험한다(`exclusiveWaitsForOwnEcho`). `fakeEditContext` 의 `exclusive` 는 기다리지 않는다. `-diff` 같은 따로 된 세션 이름은 쓰지 않는다. `APPLY_DIFF` 의 rev 는 `myRevs` 에 들지 않는다(Ctrl+Z 대상 아님, 변경 기록에서 되돌린다).
- `ErdModelApi`(useErdModel) 는 단계 1 칸에 `server: ErdState | null`(아래층), `pending: readonly PendingBatch[]`, `pendingIds: ReadonlySet<string>`, `apply`, `undo(rev): Promise<ApplyOutcome>`, `exclusive<T>(fn): Promise<T>`, `myRevs: readonly number[]`, `onVersion(ev: ErdVersionEvent): void` 를 더한다. `reload` 는 `reload(opts?: { dropMine?: boolean })` 다. SSE `reload` 이벤트만 `dropMine:true` 로 불러 `myRevs` 를 비운다(gap·5초 초과로 다시 읽을 때는 남긴다). `state` 는 투영 값(아래층 + 위층)이다. 훅 서명은 `useErdModel(modelId, session, me, load?)` 다.
- 두 층 규칙(`pending.ts`, S2-17):
  - 되돌리기(`undo`)도 같은 줄로 보낸다(`undoOf` = 되돌릴 rev). 그래서 "보내는 중" 묶음은 늘 하나 이하다.
  - 응답이 먼저 오고 rev 가 아래층 rev + 1 이면 응답 델타를 바로 얹고 묶음을 뺀다. 더 크면 묶음을 `held` 로 두고 델타를 보관한다. SSE 가 그 앞 rev 까지 채우면 얹고 뺀다. 같은 rev 의 SSE 에코는 그 뒤 stale 로 버린다.
  - SSE 에코가 먼저 올 수 있다(27 수정 뒤 전달 실행기 때문이다). "보내는 중" 묶음이 있을 때 `session` 이 내 세션인 델타가 오면 그 묶음의 에코로 본다. 델타를 아래층에 얹고 묶음을 `echoed` 로 바꿔 투영에서 뺀다. 늦게 온 응답은 묶음 id 로 맞춰 결과만 돌려주고 델타는 얹지 않는다.
  - 거절 응답이면 묶음을 빼고 알림을 만든다. 다시 읽으면(gap·보관 5초 초과·`reload` 이벤트 모두) 보내지 않은 묶음까지 대기 묶음과 보관 델타를 모두 버리고 버린 수를 알린다. 보내는 중인 묶음의 결과는 다시 읽은 모델이나 SSE 로 들어오고, 그 응답 rev 는 `myRevs` 에 넣지 않는다.
  - 연결이 끊기면 새 `apply` 는 NETWORK 알림으로 바로 거절한다. 보낸 묶음은 응답대로 처리한다.
- `apply` 는 CONFLICT·NOT_FOUND·INVALID·NOT_EDITOR·NETWORK·RELOAD 알림을 스스로 `NoticeBar` 에 올리고 `highlight` 를 바꾼다. NEEDS_CHOICE 는 올리지 않는다. 부른 쪽(관계 도구, 그리드)이 `choices` 로 선택 창을 띄우고 다시 보낸다.
- `myRevs` 는 이 화면이 보낸 묶음의 반영 응답 rev 만 오래된 순으로 둔다. SSE 에코로는 채우지 않는다(되돌리기 에코가 먼저 오면 다음 Ctrl+Z 가 다시 하기가 된다). 되돌리기(`undoOf` 있음)의 rev 는 넣지 않는다. Ctrl+Z 는 마지막 값을 꺼내 `undo` 한다. CONFLICT 여도 꺼내고 알림에 "변경 기록에서 다른 변경을 고르세요" 를 붙인다. `reload` 를 받으면 비운다.
- 권한 문구(`state/permissions.ts`): 연결 끊김 "실시간 연결이 끊겨 편집을 멈췄습니다. 다시 연결되면 이어서 고칠 수 있습니다." RELEASED 모델 편집 "확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요." deferred 37 "이 버전에 소유자가 없어 아무도 다이어그램을 고칠 수 없습니다. DRAFT 를 [선점]하거나 [새 버전]을 만드세요." 권한 없음·공동 편집자 아님 문구는 단계 1 `readOnlyReason` 그대로다.

| 자리(파일) | 소유 레인 | 내보내는 것 | Task 9 뼈대의 기본 동작 |
|---|---|---|---|
| `canvas/useCanvasEditing.ts` | FE2 | `useCanvasEditing(ctx: ErdEditContext, rf: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>): CanvasEditing`(아래) | `flowProps: { nodesDraggable: false, nodesConnectable: false, deleteKeyCode: null }`, `decorateNodes` 는 받은 배열 그대로, 나머지 함수는 아무 일도 하지 않고 `toolbar`·`overlay` 는 null |
| `panels/DiagramTree.tsx` | FE2 | 단계 1 props + `ctx: ErdEditContext \| null`(모델을 고르기 전에도 그린다) | 단계 1 동작. Task 9 가 props 만 한 번 고친다 |
| `panels/ColumnGrid.tsx` | FE3 | `{ ctx: ErdEditContext; tableId: string \| null }`. `STATUS_LABEL`·`statusBadge`·`columnRows` 를 계속 내보낸다(`ReviewPanel` 이 쓴다) | 단계 1 읽기 그리드. Task 9 가 props 만 한 번 고친다 |
| `panels/ColumnJump.tsx` | FE3 | `{ ctx: ErdEditContext; opened: boolean; onClose(): void }`. 열렸을 때 바깥 요소에 `data-testid="erd-column-jump"` | 빈 부품 |
| `panels/DbDiffApply.tsx` | FE3 | `{ ctx: ErdEditContext; diff: ErdDbDiffView \| null; onReload(): void }`, `diffRows(view)` | 단계 1 차이 목록(읽기). Task 9 가 `diffRows`·`DIFF_LABEL` 을 `ReviewPanel` 에서 이 파일로 옮긴다(`ReviewPanel` 에는 남기지 않는다). FE3 Task 15 는 같은 이름·값으로 `diffRows` 를 내보낸다 |
| `panels/ReviewPanel.tsx` | FE1 | 단계 1 props + `ctx: ErdEditContext \| null`. ctx 가 있을 때만 DB 차이 탭에 `DbDiffApply` 를 그린다 | — |
| `panels/NoticeBar.tsx`, `panels/ChangeLog.tsx`, `panels/VersionBar.tsx`, `panels/ConfirmDialog.tsx`, `panels/EditorsModal.tsx` | FE1 | FE1 안에서 정한다. `ChangeLog` 는 `historyRows` 를 `ReviewPanel` 에서 옮겨 내보낸다 | 빈 부품 |

```ts
// canvas/useCanvasEditing.ts (FE2). ErdViewer 의 CanvasPane(ReactFlowProvider 안)이 부른다. rf 는 CanvasPane 의 useReactFlow() 값이다.
export interface CanvasEditing {
  flowProps: Pick<ReactFlowProps<ErdFlowNode, ErdFlowEdge>, "nodesDraggable" | "nodesConnectable" | "deleteKeyCode"
    | "onNodeDragStop" | "onConnect" | "isValidConnection" | "connectionMode" | "onPaneClick"
    | "onNodeContextMenu" | "onPaneContextMenu" | "snapToGrid" | "snapGrid">;
  onNodesChange(changes: NodeChange<ErdFlowNode>[]): void;   // CanvasPane 이 select 처리 뒤 모든 변경을 넘긴다
  decorateNodes(nodes: ErdFlowNode[]): ErdFlowNode[];        // 끄는 중 위치를 덮는다. 바뀌지 않은 노드는 같은 참조
  onKeyDown(e: React.KeyboardEvent): void;                     // CanvasPane 이 ReactFlow 를 감싼 tabIndex=0 div 에 단다
  toolbar: ReactNode;
  overlay: ReactNode;                                           // 이름 겹침 창·마법사 등
}
```

- `CanvasPane` 은 `nodes`·`edges`·`nodeTypes`·`edgeTypes`·`onNodesChange`·`fitView`·확대 범위·`onlyRenderVisibleElements`·`elementsSelectable` 을 계속 쥔다. 선택은 지금처럼 `CanvasPane` 이 처리한다. `flowProps` 는 위 키만 받고 `CanvasPane` 의 다른 props 를 덮지 않는다. Task 9 는 `ctx` 를 `CanvasPane` props 로 넘긴다.
- 전역 키(window 캡처, S2-27)는 FE1 이 `ErdViewer.tsx` 에 둔다. F3 전환, Ctrl/⌘+T·K 표 찾기(`ctx.nav.openTableFind`), Ctrl/⌘+O·Alt+O 컬럼 점프(`ctx.nav.openColumnJump`), Ctrl/⌘+Z 내 마지막 명령 되돌리기다. 입력 칸이면 F3 밖의 키는 넘긴다.
- 캔버스 키(캔버스 host `onKeyDown` → `useCanvasEditing().onKeyDown`, FE2): Delete·Backspace = `removeFromDiagram`, Alt+Delete·Alt+Backspace = `deleteTable`(확인 창), Ctrl+↑/↓·Alt+↑/↓ = 부모·자식 표, 1·2·4·5 = 선택·표·비식별·식별 도구, Ctrl/⌘+F = 표 찾기(`ctx.nav.openTableFind`, 캔버스 초점일 때만, S2-27), Escape = 도구·선택 해제.
- `CanvasPane`(FE1)의 약속: `decorateNodes` 를 `useStableById` 결과에 `useMemo` 로 부르고 `editing.decorateNodes` 가 바뀌면 다시 계산한다. host div 는 `tabIndex=0`·`data-testid="erd-canvas-host"` 다(FE2 의 초점 찾기가 `closest("[tabindex]")` 를 쓴다).
- 화면 스타일: FE1 부품 규칙은 `panels/core-styles.ts` 의 `CORE_CSS` 다. Task 9 가 `canvas/erd-styles.ts`(FE2 소유) 끝에 한 번 붙이고 그 뒤 FE1 은 그 파일을 고치지 않는다. FE2 편집 CSS 는 `canvas/erd-edit-styles.ts` 를, FE3 은 인라인 토큰과 `ColumnGrid` 의 `<style href="dmes-erd-grid" precedence>` 를 쓴다(Local-Rules §17).
- 화면 `data-testid` 정본은 각 Task 문서의 표다: FE1 = 04 끝 "화면 testid", FE2 = 05 Task 13 "`data-testid` 정본", FE3 = 06 앞 "`data-testid` (정본)". 마감(07)은 이 이름을 쓴다. 이름을 바꾸면 07 도 함께 고친다.
- 그리드 키(그리드를 감싼 div `onKeyDownCapture`, FE3): Ctrl/⌘+Enter = 컬럼 추가, Ctrl/⌘+Shift+Enter = PK 컬럼 추가. F2·더블클릭 편집은 ag-grid 기본 동작이다.

### 감사 컬럼 (S2-30)

- 감사 컬럼 8개(물리명, 대소문자 무시): `C_USR_ID`, `C_AT`, `C_SVC_ID`, `C_PGM_ID`, `U_USR_ID`, `U_AT`, `U_SVC_ID`, `U_PGM_ID`. `VER` 는 아니다. scripts 의 판정은 `scripts/erd/lib/audit.mjs` 의 `AUDIT_COLUMNS`·`isAuditColumn` 하나다(서버 `ErdAuditColumns` 와 같은 목록).
- `addTable`: `{ op:"addTable", id?, phys, logical?, comment?, audit?: boolean }`. `audit` 의 기본은 true(없으면 true). true 면 묶음 끝에서 표 끝에 감사 컬럼 8개를 붙인다(`*_ID` 는 `VARCHAR2(100)`, `C_AT`·`U_AT` 는 `TIMESTAMP(6)`, 모두 NULL 허용). 표에 이미 있는 물리명은 건너뛰고, 같은 묶음에서 표를 지웠으면 붙이지 않는다. `audit:false` 면 붙이지 않는다. 가져오기(`import kind=FROM_DB`·`APPLY_DIFF` 의 TABLE_ADDED)는 붙이지 않는다.
- `addColumn`: `position` 이 없거나 컬럼 수 이상이면 끝으로 보고, 표 끝이 감사 컬럼 블록일 때 그 블록 바로 앞에 넣는다. 넣는 컬럼이 감사 컬럼이면 맨 끝이다. 안쪽 `position` 은 그대로 쓴다.
- 감사 컬럼의 논리명은 컬럼 사전·별칭에 있으면 그 논리명, 없으면 고정 이름이다. 주석은 늘 고정 이름이다(기존 DDL 주석과 같다): 생성자 아이디, 생성일시, 생성 서비스 아이디, 생성 프로그램 아이디, 수정자 아이디, 수정일시, 수정 서비스 아이디, 수정 프로그램 아이디.
- `moveColumn`: 끝으로 옮길 때(위치가 컬럼 수 이상) 같은 규칙을 쓴다. 명시한 안쪽 위치는 그대로 쓴다.
- `getModelText`: `audit?: boolean`(기본 false). 기본은 표마다 끝에 `감사 컬럼 n개: C_USR_ID C_AT …` 한 줄(표에 실제로 있는 것만, 표 순서). `audit:true` 면 보통 컬럼 줄로 펼친다. CLI 는 `text --audit`. 40,000자 상한은 그대로다.
- 결과 글(`apply`): 새 표와 함께 생긴 감사 컬럼 `column upsert` 줄은 `column upsert TB_X.(감사 컬럼 n개 추가)` 한 줄로 접는다.
- scripts 는 `addColumn` 위치를 미리 계산하지 않는다(서버가 정한다). 감사 컬럼이 표 끝에 온다고 가정하는 코드도 없다.

### MCP·CLI (`scripts/erd/`)

세션 이름(`lib/oasis.mjs` `configFromEnv(env, { kind: "mcp" | "cli", session?: string })`, S2-7):
1. 인자 `session`(CLI `--session`)이 있으면 그 값.
2. `ERD_SESSION` 이 비어 있지 않고 `auto` 가 아니면 그 값.
3. kind mcp: `CLAUDE_CODE_SESSION_ID` 가 있으면 `claude-` + 그 값에서 `-` 를 뺀 앞 8글자(소문자). 없으면 `mcp-` + `randomUUID()` 의 앞 8글자(프로세스마다 한 번).
4. kind cli: `cli-` + `ERD_USER`.
- 길이는 1~100자다. `.mcp.json` 은 `"ERD_SESSION": "${ERD_SESSION:-auto}"` 로 바꾼다. `${CLAUDE_CODE_SESSION_ID}` 를 `.mcp.json` 에 넣지 않는다(중첩 실행이면 부모 id 로 풀린다).
- 모든 MCP 요청(읽기 포함)은 `session` 과 `source:"MCP"` 를 싣는다. CLI 는 `source:"CLI"` 다.

| 도구 | 입력(zod) | OASIS | 결과 |
|---|---|---|---|
| `apply` | `modelId: string`, `baseRev: int ≥ 0`(필수, 마지막으로 읽은 rev), `commands: array(1..200) of looseObject({op: string}) \| string`(JSON 문자열도 받는다), `dryRun?: boolean`(기본 false) | `view`(이름 풀기) → `save { modelId, baseRev, session, source, commandsJson, dryRun }` | 반영·거절 글(아래). 거절은 `isError:true` |
| `confirmRelation` | `modelId`, `baseRev`, `relation: string`(`r-` id 또는 `"자식표.컬럼 > 부모표.컬럼"`) | `save [{op:"confirmRelation", id}]` | `apply` 와 같다 |
| `rejectRelation` | `confirmRelation` 과 같다 | `save [{op:"rejectRelation", id}]` | `apply` 와 같다 |
| `undo` | `modelId`, `rev?: int`(없으면 이 프로세스가 마지막으로 반영한 rev), `dryRun?: boolean` | `restore { modelId, rev, session, source, dryRun }` | `apply` 와 같다. 무엇을 되돌렸는지(누구의 몇 rev) 적는다 |
| `claimTable` | `modelId`, `tables: string[]`(1..20, 물리명 또는 `t-` id) | 표마다 `execute kind=CLAIM` | 표마다 한 줄: 잡음 또는 `쥔 세션(사용자), 만료 시각` |
| `releaseTable` | `modelId`, `tables?: string[]`(없으면 이 프로세스가 잡은 표 전부) | 표마다 `execute kind=RELEASE` | 표마다 한 줄 |
| `getChangesSince`(바뀜) | `modelId`, `rev`, `session?`, `excludeMine?: boolean`, `tables?: string[] \| string`, `raw?: boolean` | `view { sinceRev }` + 이름 풀기용 `view` | 이름으로 쓴 요약. `raw:true` 일 때만 JSON. 25,000자 상한 |

- `undo` 에서 rev 를 빼면 이 프로세스의 반영 목록 마지막 값을 쓴다. 목록이 비면(재시작) `view sinceRev=max(0, rev-500)` 에서 `session` 이 내 세션인 마지막 델타를 찾는다. 이 프로세스가 이미 되돌린 rev 는 건너뛴다. 못 찾으면 `isError` 로 "rev 를 주세요" 를 돌려준다.
- MCP 서버는 종료(표준 입력 닫힘·SIGTERM) 때 이 프로세스가 잡은 표를 놓아 본다. 실패해도 600초 뒤 만료된다.
- 도구 설명(instructions)의 "(단계 2 에서 추가)" 표시를 지우고, 내 세션 이름과 "baseRev 는 마지막으로 읽은 rev(`getModelText` 머리줄, `getChangesSince` 결과, 마지막 `apply` 결과)다. 더 큰 rev 를 짐작하지 마세요." 를 적는다.

이름 → id 해석(`lib/commands.mjs`, 순수, S2-22):

```js
export function resolveCommands(model, commands, { newId }) // → { commands, errors: [{ index, field, value, message, near: string[] }] }
export function describeTargets(model, ids)                 // → Map<id, "TB_X" | "TB_X.COL" | "TB_X:PK" | "TB_X.COL > TB_Y.COL">
export function newId(prefix)                               // prefix + randomUUID(), ErdIds 정규식 ^[a-z]-[0-9a-zA-Z-]{1,48}$ 을 지킨다
```

| 칸 | 받는 값 |
|---|---|
| 표: `addTable·updateTable·deleteTable` 의 `id`, 모든 명령의 `table`·`child`·`parent`, `tables[]` | `t-` id 또는 물리명(대소문자·앞의 스키마 무시) |
| 컬럼: 컬럼 명령의 `id`, 키의 `columns[]`, `pairs[][]` | `c-` id 또는 `"표.컬럼"` |
| 관계: 관계 명령의 `id` | `r-` id 또는 `"자식표.컬럼 > 부모표.컬럼"`, 복합이면 `"자식표.(A, B) > 부모표.(A, B)"`(`getModelText` Ref 줄과 같은 글) |
| 키: 키 명령의 `id` | `k-` id, 키 이름, 또는 `"표:PK"` |
| 다이어그램: `diagram` 과 다이어그램 명령의 `id` | `d-` id, `"업무영역/이름"`, 또는 이름(유일할 때) |

- `add*` 명령에 `id` 가 없으면 `newId` 로 만든다. 같은 묶음의 뒤 명령은 앞에서 만든 표·컬럼을 물리명으로 가리킬 수 있다. 모르거나 겹치는 이름은 서버를 부르기 전에 오류로 돌려주고 가까운 이름을 보인다.

결과 글(`lib/results.mjs`, MCP·CLI 공용, S2-21):

```
반영 rev 216 (baseRev 212) · 변경 3 · 경고 1 · 세션 claude-1a2b3c4d
column upsert TB_MCM_SEC_MENU.MENU_NM (logical)
경고: CLAIMED 1
TB_MCM_SEC_MENU 작업 중: claude-9c8d7e6f (erd-mcp-b), 14:20(+09:00)까지
baseRev 뒤 다른 세션 변경 2건: ui-ab12cd34 rev 213~214, TB_MCM_SEC_MENU. getChangesSince(212) 로 확인하세요.
다음 baseRev: 216
```
```
거절 CONFLICT · 명령 #3 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · 저장한 것 없음
바꾼 사람: 41000207 (세션 ui-ab12cd34) rev 215 · 지금 값: "메뉴명"
다음: getChangesSince(212) 로 바뀐 값을 읽고, 묶음 전체를 baseRev 215 이상으로 다시 보내세요.
```

- `dryRun` 결과의 첫 줄은 `시험 실행(저장 안 함) · 통과` 다. 거절이면 `시험 실행(저장 안 함) · 거절 CONFLICT` 처럼 끝에 거절 코드를 쓴다.
- `WRITE_TEXT_LIMIT = 25000`. 넘치면 줄을 자르고 `… n줄 더 있습니다. getChangesSince(B) 로 나눠 읽으세요.` 를 붙인다. 경고는 코드별 수로 묶고, `STD_*` 는 처음 20건만 이름을 적는다. `CLAIMED` 는 모두 적는다.
- NOT_FOUND 는 지운 사람·세션·rev, NEEDS_CHOICE 는 `choices`(20건까지)와 고칠 칸(`onNameClash` REUSE·RENAME, 또는 `phys`), NOT_EDITOR 는 `ownerId` 와 "소유자에게 execute kind=ADD_EDITOR 로 `ERD_USER` 값을 등록해 달라고 하세요" 를 적는다.

CLI(`erd-cli.mjs`, S2-23):

```
node scripts/erd/erd-cli.mjs <명령> --model mcm [옵션]
  models                                     모델 목록(search)
  text      [--tables A,B*] [--diagram D]    getModelText 와 같은 글
  changes   --since R [--session S]          getChangesSince 와 같은 글
  violations [--status NEW|TYPE|DOMAIN|MISS]
  inferred  [--include-folded]
  db-diff
  apply     --file batch.json|- [--base-rev R] [--apply]
  confirm|reject <관계> --base-rev R [--apply]
  undo      [--rev R] [--apply]
  claim|release <표>...                      (--apply 없이 보낸다)
공통: --base URL --user ID --role R --client-key K --session S --json
```

- 입력은 `{"modelId":"mcm","baseRev":212,"commands":[...]}` 또는 배열만(이때 `--base-rev` 필수)이다. 명령 모양은 MCP `apply` 와 같다(이름 허용).
- 기본은 서버 `dryRun:true` 로 보내고 결과 글 첫 줄에 `시험 실행(저장 안 함)` 을 적는다. 표준 오류에 모드 머리줄을 쓴다. `--apply` 는 `--user` 나 `ERD_USER` 가 명시되지 않으면 사용 오류다.
- 종료 코드: 0 = 반영 또는 시험 통과, 1 = 거절·실패, 2 = 사용 오류. `--json` 은 서버 결과 JSON 을 그대로 낸다.
- 기본 시험 실행도 서버가 편집자 검사를 한다. 그래서 `ERD_USER`(또는 `--user`)가 그 DRAFT 의 소유자·공동 편집자여야 "통과" 가 나온다. 기본 사용자 `erd-mcp` 로 돌리면 NOT_EDITOR 거절이다. `--apply` 만 사용자를 필수로 하는 규칙은 그대로 두고, 이 사실을 도움말(`--help`)에 적는다(S Task 8).

---

## Task 문서

| Task | 파일 | 내용 | 레인 | 선행 |
|---|---|---|---|---|
| 1 | [01-backend-engine.md](01-backend-engine.md) | 도메인 → 물리 타입 대응 `ErdTypeMapping`, `sameType` 이동, CLOB 판정, `copyDomain` 대응(S2-3, deferred 42) | BE1 | 착수 조건 |
| 2 | [01-backend-engine.md](01-backend-engine.md) | 엔진 규칙: 삭제 충돌(31), 식별 전환(29), 중복 관계(30), `schemaVersion`(32), 빈 되돌리기(S2-24), `touchedTables`(25) | BE1 | Task 1 |
| 3 | [01-backend-engine.md](01-backend-engine.md) | `ErdDiffApplier`(순수)와 `ErdImportBuilder` 표 하나 만들기 공개, 항목 종류별 `restore` 요소, deferred 51 | BE1 | Task 2 |
| 4 | [02-backend-contracts.md](02-backend-contracts.md) | `rowVersion`(결과·`change`), SSE `version`, 시한 접속자(touch·touchClaims·sweep), `byUserId`, `CLAIM` 응답, `dryRun`(save·restore, `import` 는 MDM021) | BE2 | 착수 조건, [BE1:Task 2 → BE2:Task 4(Step 16 접속자 `selectedTables` 단계, Task 4 의 마지막. 실제로 기대는 것은 Task 2 Step 1~5 의 `touchedTables`)] |
| 5 | [02-backend-contracts.md](02-backend-contracts.md) | `import kind=APPLY_DIFF` 연결, 미리보기 대응(`previewStatus`·`tokens`), CLAIMED 넓히기(25), 여유가 있으면 28 확인·36 실패 경로 HTTP 시험 | BE2 | Task 4, [BE1:Task 1 → BE2:Task 5], [BE1:Task 2 → BE2:Task 5], [BE1:Task 3 → BE2:Task 5] |
| 6 | [03-scripts.md](03-scripts.md) | `lib/commands.mjs`(이름 → id), `lib/results.mjs`(결과 글·상한), 세션 이름(`configFromEnv`) | S | 착수 조건 |
| 7 | [03-scripts.md](03-scripts.md) | MCP 쓰기 도구 6개, `getChangesSince` 상한·이름, 도구 설명, `.mcp.json` `auto` | S | Task 6 |
| 8 | [03-scripts.md](03-scripts.md) | `erd-cli.mjs`(기본 dry-run, `--apply`, JSON 묶음) | S | Task 6 |
| 9 | [04-frontend-core.md](04-frontend-core.md) | 화면 뼈대: `types.ts`·`api.ts` 전부, `edit-context.ts`, 시험 도구 `fakeEditContext`, 자리 부품, `useErdModel` 서명, 권한 나누기(S2-20), 전역 키 | FE1 | 착수 조건(먼저 머지) |
| 10 | [04-frontend-core.md](04-frontend-core.md) | 두 층 모델 `state/pending.ts`(시험 8), 거절 알림(`NoticeBar`, 내 값 복사, 칸 강조 신호), 연결 끊김, 변경 기록 되돌리기·Ctrl+Z, 접속자 동그라미(Claude 세션 포함), `version` 처리 | FE1 | Task 9 |
| 11 | [04-frontend-core.md](04-frontend-core.md) | 버전 막대(`VersionActionBar` 선택 props, S2-10), 확정 대화상자(코드별 묶음, S2-28), 공동 편집자 관리 | FE1 | Task 10 |
| 12 | [05-frontend-canvas.md](05-frontend-canvas.md) | shared `react-flow` 에 일반 dagre 배치 함수 export, 스킬 문서·색인, `dist` export 시험(deferred 45) | FE2 | 착수 조건 |
| 13 | [05-frontend-canvas.md](05-frontend-canvas.md) | 캔버스 편집: 끌기 → `moveNodes`, 표 추가, 관계 도구 4·5 + 이름 겹침 창, Delete·Alt+Delete, 접기, 자동 배치, 다이어그램 마법사, 부모·자식 이동, 표 찾기 키, 작업 중 표시·Claude 이름표 | FE2 | Task 12, [FE1:Task 9 → FE2:Task 13] |
| 14 | [06-frontend-grid-diff.md](06-frontend-grid-diff.md) | 그리드 편집: 칸 편집, 그리드 키, 입력 칸 + 논리명 미리보기(300ms), NEEDS_CHOICE 토막 고르기, 도메인 적용, 행 끌기 → `moveColumn`, 컬럼 점프 | FE3 | [FE1:Task 9 → FE3:Task 14] |
| 15 | [06-frontend-grid-diff.md](06-frontend-grid-diff.md) | 다시 가져오기 반영 화면(`DbDiffApply`, 항목 고르기·결과 요약) | FE3 | Task 14 |
| 16 | [07-close.md](07-close.md) | 단계 2 마감: 전체 시험, 새 TPL_DATA 복제, 두 사람 브라우저, Claude 세션 2개, 충돌·되돌리기·확정, MCP 크기, 문서·deferred 처리, README "단계 2 구현 결정", 커밋 | 마감 | 모든 레인 머지 |

## 의존 관계와 레인

병렬 상한(사용자 지시 2026-10-10): 동시에 도는 레인은 6개 이하, 레인 하나가 동시에 띄우는 서브에이전트는 10개 이하. 착수 조건은 모든 레인 공통으로 "deferred 27 수정이 dev 에 머지됨" 이다. 아래 표의 `E/` 는 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`, `LT/` 는 `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`, `AT/` 는 `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/` 이고, 화면 파일은 `src/frontend/m-mdm/pages/dma/erdEdit/` 기준이다.

| 레인 | 모델 | Task | 고치는 파일(소유) | 선행 |
|---|---|---|---|---|
| BE1 엔진 | opus | 1 → 2 → 3 | `E/standard/**`, `E/engine/**`(`ErdRejection.java` 제외), `E/importing/**`, `E/model/ErdModelCodec.java`, `E/dbmeta/ErdDbMetaReader.java`(deferred 51 의 `COLUMN_ID`), lib 시험(`LT/service/**` 제외), api 시험 `AT/ErdTypeMappingOracleTest.java`(새)·`AT/ErdDbMetaReaderTest.java` | 없음 |
| BE2 서버 계약 | opus | 4 → 5 | `E/service/**`, `E/stream/**`, `E/dto/**`, `E/engine/ErdRejection.java`, `erdEdit.bpmn`(글), api 시험(위 BE1 두 파일 제외, `AT/ErdTestClient.java` 새 공용 포함), lib 시험 `LT/service/ErdPreviewColumnTest.java`(새) | [BE1:Task 2 → BE2:Task 4(Step 16 접속자 `selectedTables` 단계)], [BE1:Task 1·2·3 → BE2:Task 5] |
| S 스크립트 | sonnet | 6 → 7, 6 → 8 | `scripts/erd/**`, `.mcp.json` | 없음(가짜 OASIS 로 시험) |
| FE1 화면 코어 | opus | 9 → 10 → 11 | `ErdViewer.tsx`, `api.ts`, `types.ts`, `edit-context.ts`, `state/**`(`model-delta.ts` 포함), `panels/TopBar·ReviewPanel·NoticeBar·ChangeLog·VersionBar·ConfirmDialog·EditorsModal·core-styles`, `m-mdm/src/shell/VersionActionBar.tsx`, 시험 `tests/dma/erdEdit/erd-fixtures.ts`·`tests/shell/version-action-bar.test.ts`. 차례가 정해진 한 번 고침: Task 9 가 FE2·FE3 착수 전에 `panels/ColumnGrid.tsx`(props)·`panels/DiagramTree.tsx`(props)·`canvas/erd-styles.ts`(끝에 `CORE_CSS`)를 고치고 먼저 머지한다. 그 뒤 이 세 파일은 FE2·FE3 만 고친다. 자리 부품 `canvas/useCanvasEditing.ts`·`panels/ColumnJump.tsx`·`panels/DbDiffApply.tsx` 도 Task 9 가 한 번만 만든다 | 없음. Task 9 를 먼저 머지한다 |
| FE2 캔버스 | opus | 12 → 13 | shared `react-flow/auto-layout.ts`, `canvas/**`, `panels/DiagramTree.tsx`, `panels/DiagramWizard.tsx`, 시험 `erd-canvas-fixtures.ts` | [FE1:Task 9 → FE2:Task 13] |
| FE3 그리드·차이 | opus | 14 → 15 | `panels/ColumnGrid·GridInputBar·TokenChoiceModal·ColumnJump·DbDiffApply`, 시험 `grid-fixtures.ts` | [FE1:Task 9 → FE3:Task 14] |
| 마감 | opus | 16 | 문서, `tmp/erd-close2/`(커밋 안 함) | 모든 레인 |

```
착수 조건: deferred 27 머지
BE1 : Task 1 ─ Task 2 ─ Task 3 ─────────────┐
BE2 : Task 4 ───────────────────── Task 5 ◀─┘   (Task 4 마지막 단계는 BE1 Task 2 뒤, Task 5 는 BE1 머지 뒤 rebase)
S   : Task 6 ─┬ Task 7
              └ Task 8
FE1 : Task 9 ─ Task 10 ─ Task 11
FE2 : Task 12 ───── Task 13 ◀── FE1 Task 9 머지
FE3 :          Task 14 ─ Task 15 ◀── FE1 Task 9 머지
마감 : Task 16 (모든 레인 머지 뒤)
```

- 머지 순서: FE1 Task 9 와 FE2 Task 12 를 먼저 합친다(공통 파일·shared). BE1 은 Task 하나가 끝날 때마다 합칠 수 있다. BE2 Task 5 는 BE1 이 모두 합쳐진 뒤 rebase 하고 마친다.
- 서버 새 계약을 쓰는 화면·스크립트 일(`rowVersion`, `version`, 시한 접속자, `byUserId`, `APPLY_DIFF`, `dryRun`, `CLAIM` 응답)은 정본 JSON 으로 만든 가짜 응답으로 시험한다. 실제 서버와의 연결은 Task 16 에서 확인한다. 이때 레인 사이 의존은 [BE2:Task 4 → 마감:Task 16], [BE2:Task 5 → 마감:Task 16] 이다.
- 레인 FE2·FE3 은 `ErdViewer.tsx`·`api.ts`·`types.ts`·`state/*` 를 고치지 않는다. 필요한 것이 빠졌으면 자기 파일에서 `erdCall` 로 만들고 레인 보고에 적는다. 연결이 꼭 필요하면 조정 세션을 거쳐 FE1 이 고친다.
- Oracle 시험은 PC 단위 잠금으로 하나씩 돈다. 같은 워크트리에서 Gradle 을 동시에 돌리지 않는다. BE1 의 시험은 lib 단위 시험이라 Oracle 을 거의 쓰지 않는다.
- 직접 연 pane·레인·이름 붙인 에이전트는 작업이 끝나면 바로 닫는다.

마감(Task 16) 순서(07-close.md 가 자세히 적는다):
1. 바뀐 모듈 전체 시험을 복제 PDB 를 열기 전에 끝낸다(PDB 칸 하나).
2. 조정자 허가를 받고 사용자 서버(8096·8100·8191·5100)를 내린 뒤, 새 TPL_DATA 복제 PDB(예: `L_ERD2C`)로 BE 를 띄운다. mcm 이 한 번 뜬 뒤 e2e 픽스처 SQL 로 사람 계정을 넣고 COMMIT 한다(S2-9).
3. admin 이 모델 등록 → 가져오기 → 첫 확정(`warningsAcknowledged=true`, `applyFrom` = 1분 전 시각, 약 700건 경고 묶음 확인) → `copy` 로 새 DRAFT 를 만든다. `applyFrom` 이 미래면 `copy` 가 MDM006 이다. `view.ownerId` 가 admin 인지 본다. null 이면 `lock` 으로 먼저 선점한다(R7-1: 소유자가 없으면 공동 편집자를 인정하지 않는다). 그 뒤 admin 이 `e2e_mdm_stdadmin`, `erd-mcp-a`, `erd-mcp-b` 를 공동 편집자로 넣는다(S2-2). Claude 세션은 DRAFT 를 소유하지 않는다.
4. 브라우저 두 사용자: `localhost` 에 admin, `127.0.0.1` 에 `e2e_mdm_stdadmin` 으로 로그인하고 `/api/auth/me` 로 사용자를 확인한다. 안 되면 두 번째 사람은 HTTP 클라이언트로 대신한다.
5. Claude 세션 2개: `claude -p` 를 `ERD_USER=erd-mcp-a ERD_SESSION=claude-a`, `ERD_USER=erd-mcp-b ERD_SESSION=claude-b` 로 띄운다. `--mcp-config .mcp.json --strict-mcp-config --permission-mode default --max-turns N` 과 `--disallowedTools`(Bash·Read·Grep·Glob·Edit·Write·WebFetch·WebSearch·Agent·그 단계에 필요 없는 erd 도구)로 묶는다. `ERD_SESSION=auto` 로 한 번 더 돌려 두 이름이 다른지 확인한다.
6. 충돌은 차례를 정해 만든다(A 읽기 → B 같은 속성 저장 → A 낡은 baseRev 로 저장 → CONFLICT → `getChangesSince` → 다시 보내기). 다른 속성은 둘 다 반영된다. 작업 중 표시 경고, 되돌리기 성공 1건과 일부러 만든 되돌리기 CONFLICT 1건(S2-5)을 본다. 되돌릴 대상은 뒤에 아무도 건드리지 않는 속성으로 고른다. 이어서 CLI 스모크(스펙 시험 7: 기본 시험 실행(편집자인 `ERD_USER`), `--apply`, CONFLICT, 사용 오류, 빈 되돌리기)를 한다. 단축키(S2-8)는 CDP 키로 "페이지가 받는가" 만 보고, Chrome 이 Ctrl/⌘+T·O 를 실제로 가로채는지는 사람 확인 항목으로 아침 보고에 넣는다.
7. 확정 검사(D19): 두 번째 확정 전에 확정을 막는 컬럼(TYPE·DOMAIN·MISS. NEW·ALIAS 는 막지 않는다. 같은 물리명을 다른 타입으로 더해 TYPE 을 만든다)을 하나 더해 `CONFIRM_CHECK_FAILED` 를 보고, 그 명령을 되돌린 뒤 확정이 통과하는지 본다. 공동 편집은 기존 TYPE·DOMAIN·MISS 컬럼의 속성을 건드리지 않는다(바꾸면 CHANGED 로 잡혀 확정이 막힌다).
8. 결과 판정은 LLM 의 글이 아니라 `view sinceRev` 델타(세션·출처·사용자)와 명령 기록으로 한다.
9. MCP 크기: 200건 `apply` 의 결과 크기는 MCP SDK 클라이언트로 재고, 델타 500건 `getChangesSince` 와 한글이 많은 거절 글이 파일로 빠지지 않는지는 `claude -p` 로 본다.
10. 다시 가져오기 반영은 7번의 확정이 끝난 뒤 `copy` 로 만든 새 DRAFT 에서 한다. DB 를 고치지 않는다. 모델에서 컬럼 타입을 바꾸고 관계가 없는 표 하나를 지워 `DB_DIFF` 에 `COLUMN_CHANGED`·`TABLE_ADDED` 만 만든 뒤 화면에서 골라 반영한다(지운 표가 DB FK 의 부모면 `FK_ADDED` 가 더 생긴다). 이 DRAFT 는 확정하지 않는다. `TABLE_ADDED` 는 새 UUID 로 표를 만들어 그 컬럼이 모두 "추가" 로 잡히고, 기존 위반이 확정을 막는다.
11. 문서(스펙 5절·7절 결과, deferred 처리 칸·새 행, README "단계 2 구현 결정", 기능설계서 "단계 2")를 쓰고 커밋한다. 사용자 서버를 되살리고 복제 PDB 는 닫기만 한다.

## 레인 분해 안내

조정자는 긴 Task 를 아래 레인 항목으로 나눠 배정한다. 경계는 각 Task 문서의 실제 Step 경계다. 항목마다 자기 실패 확인·통과 확인·커밋을 갖는다. 문서에 커밋 Step 이 없는 경계(아래 "커밋 더함")에서는 그 항목이 끝날 때 바뀐 파일만 커밋한다. 레인 머지는 지금처럼 레인 단위로 하고, 머지 전에 커밋을 하나로 합친다.

| 레인 | 항목 | 범위(Task·Step) | 통과 확인 | 비고 |
|---|---|---|---|---|
| BE1 | t1 | Task 1 Step 0~10 | Step 6·8 | |
| BE1 | t2a | Task 2 Step 1~5(31·S2-24·25·32) | Step 5(중간 커밋) | BE2 t4c Step 16 이 기대는 `touchedTables` 가 여기서 생긴다 |
| BE1 | t2b | Task 2 Step 6~11(29·30) | Step 9·10 | |
| BE1 | t3a | Task 3 Step 1~7(lib, `ErdDiffApplier`) | Step 6 | |
| BE1 | t3b | Task 3 Step 8~11(deferred 51 `COLUMN_ID`, Oracle) | Step 10 | |
| BE2 | t4a | Task 4 Step 1~7(결과 칸·dryRun·byUserId·CLAIM) | Step 7 | |
| BE2 | t4b | Task 4 Step 8~11(SSE `version`) | Step 11 | |
| BE2 | t4c | Task 4 Step 12~16(시한 접속자) | Step 15, Step 16 | Step 16 은 BE1 t2a 가 dev 에 머지된 뒤(README 표의 "BE1 Task 2 머지" 는 t2a 로 충분하다) |
| BE2 | t5 | Task 5 Step 1~13 | Step 7·13 | BE1 t1~t3b 가 모두 머지된 뒤 |
| S | t6 / t7 / t8 | Task 6 / 7 / 8 | 각 Task | t7·t8 은 t6 뒤 |
| FE1 | t9a | Task 9 Step 1·2·3·6~10(타입·API·편집 문맥·권한·`model-delta`, 순수) | `vitest run tests/dma/erdEdit/edit-core.test.ts tests/dma/erdEdit/api.test.ts`. 커밋 더함 | Step 4 의 시험은 Step 11~14 의 파일(`ChangeLog`·`DbDiffApply`·새 훅 서명·`ErdViewer`)을 불러 t9a 에서 통과할 수 없어 t9b 로 간다. lint 는 t9b 끝에서 본다 |
| FE1 | t9b | Task 9 Step 4·5·11~16(훅·자리 부품·패널 연결·`ErdViewer`) | Step 15 | 끝나면 Task 9 전체를 먼저 dev 에 머지한다. FE2 t13a·FE3 t14 는 이 머지 뒤 시작한다 |
| FE1 | t10 / t11 | Task 10 / Task 11 | 각 Task | |
| FE2 | t12 | Task 12 | Step 7·8 | |
| FE2 | t13a | Task 13 Step 0~9(rebase·시험 공용·순수 모듈: `erd-commands`·`erd-shortcuts`·`erd-layout`·`erd-flow` 이름표) | Step 9. 커밋 더함 | |
| FE2 | t13b | Task 13 Step 10 의 `erd-canvas-editing.test.ts` 와 Step 11~16(편집 스타일·관계 손잡이·도구 막대·대화상자·`useCanvasEditing`) | `vitest run tests/dma/erdEdit/erd-canvas-editing.test.ts`. 커밋 더함 | |
| FE2 | t13c | Task 13 Step 10 의 `diagram-wizard.test.ts` 와 Step 17~19(마법사·`DiagramTree`) | Step 18 | |
| FE3 | t14 / t15 | Task 14 / Task 15 | 각 Task | t14 는 FE1 t9b 머지 뒤 |
| 마감 | t16 | Task 16 | — | 모든 레인 머지 뒤 |

- FE2 의 t13a·t13b·t13c 는 조정자가 기능 이름(t13a 편집 기반·끌기·삭제·접기, t13b 관계 도구·표 추가·이름 겹침, t13c 자동 배치·마법사·찾기·이름표)으로 나눴다. 05-frontend-canvas.md 의 Task 13 은 파일 층(순수 모듈 → 렌더 시험·훅 → 마법사)으로 Step 을 나눴고, 끌기·삭제·접기·관계 도구·표 추가·자동 배치·찾기 키가 모두 Step 16 의 `useCanvasEditing.ts` 한 파일에 있다. 그래서 기능 경계로는 자를 수 없고, 위의 가장 가까운 Step 경계를 쓴다. 기능으로 보면 t13a 에 이름표·배치 순수 함수가, t13b 에 끌기·삭제·접기·관계 도구·표 추가·자동 배치·찾기 키가, t13c 에 마법사가 들어간다.
- FE1 의 t9a 는 조정자 경계(타입·API·편집 문맥·권한, 순수) 그대로다. 다만 Task 9 는 시험을 Step 2~4 에 먼저 모아 써서, 화면 시험(Step 4)을 t9b 로 옮겼다.

---

## 뒤 단계 개요 — 단계 2 뒤에 남는 것

단계 2 로 스펙(기반 + P1 + P2) 범위가 끝난다. 남는 일은 deferred.md 에 있다. Task 16 이 처리한 행의 "처리" 칸을 채우고, 아래 새 행을 더한다.

이번 단계가 처리하는 deferred 행: 25(여유 시), 28(27 수정이 이미 덮었는지 확인), 29, 30, 31, 32, 34(처리 칸만, `fff778c86`), 36(여유 시, RBAC 403 은 BFF 몫이라 빼고 MDM013·MDM014 실패 경로만), 37, 39, 41 의 CLOB 부분, 42, 45, 47, 51(BE1 Task 3: `candidateRank` `_rev`, `COLUMN_ID` null).

남는 deferred 행과 다음에 볼 곳:
1. P3(Flyway V 초안): 1~5. 단계 2 의 `ErdTypeMapping` 을 DDL 타입 생성에 그대로 쓴다.
2. P4·exERD 확장: 6~14.
3. 보안·권한: 19, 24, 26, 35(사용자 위임 "계속 미룸").
4. 표준 담당 결정: 41(CLOB 밖의 차이), 43.
5. 정비: 15, 17, 18, 20, 21, 22, 23, 33, 40, 44, 46, 48, 49, 50, 51(Task 3 에서 고치지 못했으면).

Task 16 이 더할 새 행:
- 첫 확정 기준선(조사 B 안 A: 가져온 기준선 제외, 안 B: 실제 DB 기준)과 두 번째 확정의 "바뀐 컬럼" 범위(주석·논리명만 바꿔도 막힘). 사용자 판단(S2-2).
- 되돌리기의 목록 단위 복원·같은 세션 통과(S2-5). 같은 표에 남이 컬럼을 더한 뒤 내 컬럼 추가를 되돌리면 `columnOrder` 때문에 CONFLICT 인 규칙을 바꿀지도 함께. 사용자 판단.
- shared `AgDataGrid` 에 키·칸 편집기 props 를 더할지(S2-6. 지금은 감싼 div 의 `onKeyDownCapture` 와 그리드 아래 입력 칸으로 갈음). 기존 shared 부품 props 변경이라 사용자 판단.
- 다른 모델을 가리키는 회색 참조 노드(D8)와 다시 하기(S2-25).
- 화면의 관계 도구로 자기 참조 관계 만들기(지금은 `isValidConnection` 이 막는다. MCP·CLI `addRelation` 으로는 만들 수 있다).
- `APPLY_DIFF` 로 들어온 새 표의 이름 규칙 추정, MCP `applyDbDiff` 도구.
- `APPLY_DIFF` 의 `TABLE_ADDED` 가 빼는 키(함수 기반 인덱스)의 `IMPORT_SKIPPED` 경고를 결과에 싣기(지금은 `Built` 에 칸이 없어 버린다).
- 호출자가 `addColumn`·`updateColumn` 에 논리 타입(`STRING` 등)을 직접 넣을 때의 물리 타입 대응(지금은 STD_TYPE 경고로만 드러난다).
- 큰 가져오기·`APPLY_DIFF` 델타가 느린 연결에서 10초 쓰기 마감에 걸리면 델타 대신 `reload` 를 보내기(착수 전 사실 5번째 줄. 마감에서 관찰한 경우).
- 넘기기(handover): 담당자 조회 어댑터가 없어 늘 MDM005 다. 그래서 성공 뒤의 `version HANDOVER` 는 서버 시험·마감 모두 확인하지 않았다(실패하면 이벤트가 없다는 것만 봤다).
- 마감에서 Ctrl+T·Ctrl+O 를 막지 못했으면 그 기록(S2-8). CDP 키는 Chrome 단축키를 거치지 않으므로 실제 차단 여부는 사람 확인 항목으로 아침 보고의 사용자 확인 목록에 넣는다.

---

## 설계자 메모

조사 결과가 서로 다르거나 조정자 판정에 없던 곳이다. 각각 하나를 골랐다. 조정자가 다르게 정하면 해당 S2 행과 인터페이스를 고친다.

- 조사 A 는 화면 레인 4개를 제안했지만 레인 상한 6 때문에 3개로 묶었다. 버전 막대·확정·편집자 관리는 `TopBar` 소유자인 FE1 에 두었다.
- 조사 A 는 확정취소 단추를 늘 꺼 두자고 했지만 S2-10 이 선택 props 로 바꾸게 하므로 ERD 화면은 그 단추를 그리지 않는다.
- `dryRun` 결과의 `applied`: 조사 C 를 따라 false 로 정했다. true("반영될 것이다")로 읽는 안도 있지만 "저장했는가" 로만 읽히게 했다(S2-15).
- MCP 접속자 갱신 범위: 조사 B 는 쓰기·CLAIM 만 제안했다. 읽기 요청도 넣었다. 사용자가 Claude 가 모델을 읽는 중인지 볼 수 있다.
- 접속자 시한: 조사 B 는 5분을 제안했다. 작업 중 표시 TTL 과 같은 600초로 정했다.
- `FK_REMOVED`: 조사 B 는 상태를 그대로 두자고 했다. 상태 `DB` 에 `dbFk=false` 는 뜻이 맞지 않아 `DB` 만 `CONFIRMED` 로 바꾸게 했다.
- `NUMBER`(정밀도 없음, 소수 있음) 도메인은 S2-3 에 없다. `NUMBER(38,s)` 로 대응하고 판정은 소수만 비교한다.
- 빈 되돌리기가 rev 를 올리는 문제(조사 B)는 조정자 판정에 없다. 버그로 보고 INVALID 로 막게 했다(S2-24). 규칙 변경으로 보면 Task 2 에서 뺀다.
- deferred 51(`restore` 가 `_rev.candidateRank` 를 찍음)은 `APPLY_DIFF` 가 `restore` 를 더 쓰므로 Task 3 에서 고친다.
- 대체 키: Ctrl+T → Ctrl/⌘+K, Ctrl+O → Alt+O, macOS Ctrl+↑/↓ → Alt+↑/↓ 로 정했다. 둘 다 처음부터 건다(조건부 코드를 두지 않는다).
- BE1 모델: 조정 지침은 기계적 레인을 sonnet 으로 두지만, Task 2 가 충돌 판정(31·29)을 바꾸므로 opus 로 제안했다. S 레인은 sonnet 이다.
- 조사 C 의 `apply{claim:true}` 는 넣지 않았다. `claimTable` 로 충분하다.
- 화면 보내기는 직렬로 정했다(S2-17). 같은 세션 대기 명령을 겹쳐 보내는 파이프라인은 엔진 시험으로 확인하지 않았다.
- `APPLY_DIFF` 의 새 표는 이름 규칙 추정을 하지 않는다. 조사 B 는 선택적 추정을 제안했다.
