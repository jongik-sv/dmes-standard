# ERD 단계 1(가져오기·뷰어) 레인 공통 규칙

2026-10-11 ERD 도구 단계 1(DB 가져오기·관계 추정·뷰어 화면·MCP 읽기 도구)을 레인 6개로 나눠 진행한다.
조정 세션 = **dmes-standard-3b**. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 레인 | 맡는 Task(계획 파일) | 브랜치 |
|---|---|---|
| erd1-be1 | T1 SET_VIEW → view kind(01) | `erd-stage1-be1` |
| erd1-be2 | T2 DB 메타 → T3 관계 추정기 → T4a 빌더 → T4b 가져오기 액션 → T5 상태·DB 차이(01·02) | `erd-stage1-be2` |
| erd1-fe1 | T6 shared react-flow 공용 부품(03) | `erd-stage1-fe1` |
| erd1-fe2 | T7 → T8 → T9 뷰어 화면(04) | `erd-stage1-fe2` |
| erd1-s1 | T10 근거 파일 스크립트(05) | `erd-stage1-s1` |
| erd1-s2 | T11 MCP 서버(05) | `erd-stage1-s2` |

- 계획 정본: `docs/superpowers/plans/2026-10-10-erd-tool-stage1/` (README 의 인터페이스 절이 정본)
- 스펙: `docs/superpowers/specs/2026-10-10-erd-tool-design.md`
- 레인의 할 일·소유 파일·금지 파일 정본 = 조정 세션의 착수 지시 메시지. 충돌하면 지시가 우선한다.
- T12(마감: 서버 재기동·실제 가져오기·브라우저 확인·MCP 질문)는 조정 세션 몫이다.

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기 = 착수 지시 메시지를 따른다.
- 모델 표 = 설정 `workflow.model_table`(착수 지시에 옮겨 적음).
- 계획 파일의 Task 를 단계(Step) 순서대로 따른다. 계획과 실제 코드가 어긋나면 가장 안전한 변형으로 진행하고 진행 보고에 한 줄로 남긴다. 설계·공유 인터페이스가 걸리면 조정 세션에 질문한다.
- 레인 안에서 파일이 겹치지 않는 항목 = 병렬 가능, 겹치면 순서대로.
- 레인·세션당 동시 서브에이전트 최대 10개.

## 2. 작업 공간

- 레인마다 워크트리 분리(`git worktree add`, `/Users/jji/project/dmes-standard-wt/<브랜치>`). 기준 = `dev` 최신 커밋. 브랜치 이름 = 위 표.
- 이 리포 CLAUDE.md 와 RULE.md 의 작업 규칙을 따른다. PC별 실행 파일·경로(JDK, git)는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다.
- 도커 금지(Oracle 컨테이너만 예외). Oracle 시험은 `-Pdmes.ora.test=clone` 으로 복제 PDB 에서 하고 `heavy.mjs` 를 거친다(PC 잠금으로 하나씩).
- L_MAIN 등 L_*/TPL_* PDB 에 파괴적 시험 금지. 읽기 확인만 허용한다.
- 메인 저장소에서 실행 중인 로컬 서버·FE 의 종료·재기동 금지. 브라우저 확인이 필요하면 조정 세션에 요청한다. 직접 연 브라우저 작업 공간은 보고 전에 닫는다.
- 넓은 `pkill` 금지. 자기가 띄운 프로세스만 PID 로 정리한다.

## 3. 규율

- 계획의 TDD 순서를 지킨다(실패 시험 → 구현 → 통과 → 체크포인트 커밋).
- **자기 레인의 소유 파일만 수정.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 질문한다.
- 공용 파일 소유 레인은 착수 지시에 적는다(예: `ErdEditService.java` 는 erd1-be1 머지 뒤 erd1-be2 가 이어받는다).
- 머지된 Flyway V1~V6 수정 금지.
- **삭제 금지.** 쓰지 않는 파일 = archive 로 이동(`git mv`).
- shared 의 기존 공개 API·props·동작 변경 = 조정 세션 승인 뒤. 새 export 추가는 승인 없이 진행.
- 커밋 = Conventional Commits, 제목 한국어 `type(scope): 제목`. 트레일러 두 줄(계획 README Global Constraints)을 붙인다. squash 뒤 트레일러가 빠졌으면 amend 로 다시 붙인다.
- 머지 요청 직전에 레인 전체를 한 커밋으로 합치고 dev tip 위로 옮긴다(`.claude/skills/_shared/node/squash-branch.mjs --rebase`).

## 4. 머지 절차

1. **준비된 레인부터 머지.** 남는 의존:
   - erd1-be2 의 T4b(가져오기 액션, 02 Task 4 Step 7~13)는 erd1-be1(T1) 이 dev 에 들어간 뒤 시작한다.
   - erd1-fe2 의 T8 은 erd1-fe1(T6) 이 dev 에 들어간 뒤 시작한다.
   - 머지 요청 직전 dev 최신을 자기 브랜치에 합치고 빌드·시험 재실행.
2. 조정 세션에 `머지 요청` 전송(형식 = 착수 지시). 「머지 허가」 수신 뒤에만 머지한다.
   - 머지 방법: 메인 저장소에서 `git merge --ff-only <SHA>`(레인당 commit 1개, merge commit 없음). 실패하면 `squash-branch.mjs --rebase` 를 다시 돌려 재요청한다.
3. 머지 뒤 `머지 완료` 전송(충돌·실패도 그대로).
4. 워크트리 정리(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지) → `정리 완료` 전송.
5. 레인 일이 많으면 중간 단위로 여러 번 머지 가능(예: erd1-be2 는 T2·T3 를 먼저 머지할 수 있다).
6. 레인은 push 금지.

## 5. 보고

- 형식·정본 메모·재개 확인 = 착수 지시의 「보고 방식」.
- 정본 메모 = `~/.coord/erd-stage1-1011/lanes/<레인>/memo.md`(리포 밖, 커밋하지 않는다).
