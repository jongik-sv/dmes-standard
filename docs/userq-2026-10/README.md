# 맞춤 레포트 조회 레인 공통 규칙

2026-10-10 맞춤 레포트 조회(맞춤 레포트 관리·사용자 조회 화면)와 공용 SQL 편집기(Monaco)를 레인 네 개로 나눠 진행한다.
조정 세션은 **dmes-standard-3b** 이다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 세션 | 레인 | 브랜치 | 워크트리 |
|---|---|---|---|
| userq-be (GLM) | 표·실행 엔진·서비스·BPMN·시드 (B1) | `feat/userq-be` | `/Users/jji/project/dmes-standard-wt/userq-be` |
| userq-shared (Sonnet) | shared `SqlCodeEditor`, 위젯·예약 작업·로그 뷰어·DB 뷰어 적용 (S1~S3) | `feat/userq-shared` | `/Users/jji/project/dmes-standard-wt/userq-shared` |
| userq-admin (Sonnet) | 관리 화면 `cmq/userQueryMng` (A1·A2) | `feat/userq-admin` | `/Users/jji/project/dmes-standard-wt/userq-admin` |
| userq-user (Sonnet) | 사용자 화면 `cmq/userQuery` (U1) | `feat/userq-user` | `/Users/jji/project/dmes-standard-wt/userq-user` |

- 설계 정본: `/Users/jji/project/dmes-standard/docs/superpowers/specs/2026-10-10-user-query-program-design.md` (메인 체크아웃, 아직 dev 미커밋. 워크트리에 없으면 이 절대경로로 읽는다)
- 시안: `/Users/jji/project/dmes-standard/docs/superpowers/specs/assets/2026-10-10-userq-mockups/userq-mockup.html`
- 각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 착수 지시가 정본이다.

## 0. 사용자 결정(2026-10-10)

1. 설계 산출물 5종은 구현 뒤 작성한다. 이 스펙이 설계 정본이다.
2. 새 표 `TB_MCM_USRQ_DEF`·`TB_MCM_USRQ_ASSIGN`. JSON 모양은 위젯과 같다.
3. 관리 화면도 이번 범위다. 관리 화면에 조회조건 5개(분류·이름/ID·사용 여부·담당 부서·할당 사용자)를 둔다.
4. 할당은 사용자 단위만.
5. 실행 요청은 queryId 와 값만 받는다. 서버가 할당을 DB 에서 다시 확인한다.
6. SQL 편집은 shared Monaco 편집기 + 큰 팝업. 기반은 DB 뷰어 편집기. 위젯 관리·예약 작업 관리·로그 뷰어·DB 뷰어도 옮긴다.
7. 스펙 §12 미결 1·2·3·5 는 스펙 제안대로 진행한다(메뉴 폴더 `cmq`, 시드 권한은 SYSADMIN 만, 분류 코드 `USRQ_CTG` 새 그룹, 10초·1000/5000행). 미결 4·6 은 사용자 결정 대기이며 이번 구현 범위 밖이다.

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기는 착수 지시 메시지를 따른다.
- 모델 표는 설정 `workflow.model_table` 이다(착수 지시에 적힌 표).
- 레인 안에서 파일이 겹치지 않는 항목은 병렬로 해도 되고, 겹치면 순서대로 한다.

## 2. 작업 공간

- 레인마다 위 표의 워크트리를 쓴다. 기준은 dev `aa4c2fb05` 이다.
- 이 리포 `CLAUDE.md`·`RULE.md` 의 작업 규칙을 따른다. PC별 실행 파일·경로(git 실행 파일, JDK, 형제 패키지 빌드)는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 워크트리의 `node_modules` 가 메인 체크아웃 심링크이면 그 안에서 `pnpm install` 하지 않는다(메인 `@dk-oasis` 링크가 바뀌어 포털이 깨진다). 의존 준비는 워크트리 안에서만 한다.
- DB 는 Oracle 하나다. 백엔드 시험은 레인 PDB(`L_<레인>`)를 쓰고, 끝나면 그 PDB 를 지운다. `L_MAIN`·`TPL_*` 은 건드리지 않는다. 도커는 Oracle 컨테이너 말고는 쓰지 않는다.
- 메인 체크아웃에서 실행 중인 로컬 서버(8092·8096·8100)와 포털(5100)을 끄거나 재기동하지 않는다. 브라우저 확인·서버 호출이 필요한 확인은 조정 세션에 요청한다. 직접 연 브라우저 작업 공간은 보고 전에 닫는다.

## 3. 규율

- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- 공용 파일 소유:
  - `m-mcm/widget-types/_query/SqlEditor.tsx` = userq-shared 만(S2). userq-admin 은 스펙 §8.2 의 `runPreview` 계약으로 먼저 개발한다.
  - `m-mcm/page-components/_userq/types.ts`·`api.ts` = userq-admin. userq-user 는 같은 내용으로 만들어 쓰다가 머지 때 하나로 합친다(먼저 머지된 쪽이 정본).
  - `scripts/perf/render/screens.mjs` = userq-admin 만 등록한다. userq-user 는 등록할 내용을 머지 요청에 적는다.
  - Flyway `mcmapuser/V13__*`, `ModuleMenuSeeder`·`CoreRbacSeeder` = userq-be.
- shared 의 기존 공개 API·props·동작 변경은 조정 세션에 승인 요청 후 대기한다. 새 컴포넌트·새 export 추가는 승인 없이 진행하고, 같은 작업에서 `mantine-aggrid-ui` 스킬 문서와 색인을 갱신한다(CLAUDE.md 행동강령).
- 결함 수정(동작이 바뀌는 것)은 작업 중 체크포인트 커밋을 `fix(...)` 로 분리해 두고, 합친 커밋 본문과 진행 보고에 남긴다.
- **삭제 금지.** 쓰지 않는 파일은 `git mv` 로 archive 에 옮긴다.
- 커밋은 Conventional Commits. 작업 중에는 작은 체크포인트 커밋을 하고, 머지 요청 직전에 레인 전체를 한 커밋으로 합쳐 dev tip 위로 옮긴다(`_shared/node/squash-branch.mjs --rebase`).

## 4. 머지 절차

1. **준비된 레인부터 머지한다.** 남는 의존:
   - userq-shared 의 S1(`SqlCodeEditor`)은 다른 일과 묶지 않고 **먼저 단독으로** 머지한다. S2·S3 은 그 뒤 따로 머지한다.
   - userq-admin 의 A2(정의 탭)는 S2 가 dev 에 들어간 뒤 머지한다.
   - FE 레인은 userq-be 머지 전에는 스펙 §4 응답 모양의 가짜 응답으로 개발·시험하고, 머지는 userq-be 가 들어간 뒤 한다.
2. 조정 세션에 `머지 요청` 을 보낸다(형식은 착수 지시). 「머지 허가」 를 받은 뒤에만 메인 저장소에서 `merge --ff-only <SHA>` 로 머지한다. 실패하면 `squash-branch.mjs --rebase` 를 다시 돌려 재요청한다.
3. 머지 뒤 `머지 완료` 를 보낸다(충돌·실패도 그대로).
4. 이어 워크트리를 정리한다(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지). 그 뒤 `정리 완료` 를 보낸다. 레인 일이 남아 있으면 정리하지 않고 다음 항목을 이어 한다.
5. 레인은 push 하지 않는다(dev push·반영 빌드는 조정 세션 몫).

## 5. 보고

- 형식·정본 메모·재개 확인은 착수 지시의 「보고 방식」 을 따른다.
- 정본 메모 경로: `~/.coord/userq-1010/lanes/<레인>/memo.md`
